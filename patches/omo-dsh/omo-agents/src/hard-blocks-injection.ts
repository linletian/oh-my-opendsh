// hard-blocks-injection.ts — T16 listener (FR-6, P-3): ONE `agent/pre-step`
// waterfall listener that injects the Hard Blocks + Anti-Patterns sections
// into every sub-agent's model-facing context via `agent.inject()`. This is
// the MVP proof of assumption V3 (OMO intercept/inject → DSH listener
// translation); 85% of future hook ports reuse this exact shape.
//
// Verified dsh surface (read-only inspection of installed 0.1.0-rc.6 + the
// rc.7 source checkout; citations live in the gitignored local-run log
// .omo/evidence/task-16-mvp-implementation.log — durable record:
// docs/mvp-pitfalls.md P-3):
//   * event `agent/pre-step` — scope-filtered WATERFALL; payload
//     { agent, messages, turn, step, signal }, next: () => Promise<
//     PreStepDecision>; "Calling next() preserves the current messages".
//   * `agent.inject(message)` — queues context for the next pre-step WITHOUT
//     waking the driver (`send(message, 'next-step', false)`); it may miss a
//     request whose pre-step already claimed its batch, so inside a pre-step
//     listener the sections land at the NEXT step boundary — documented dsh
//     behavior, not a bug (P-3 observation §5 of the evidence).
//   * sub-agent gate — `agent.session.header.origin === 'subagent'`, stamped
//     durably by childSessionMeta for every in-process child.
//   * message identity — the inbox validates pending-id uniqueness, so each
//     injection mints a fresh UUID (mirrors dsh-llm createUserMessage, which
//     is `crypto.randomUUID()` under the hood).
//
// Waterfall discipline (P-3): the listener is never authoritative — it
// observes, enqueues, and ALWAYS delegates with `return next()`, so the
// built-in enter/reject behavior and every downstream listener are preserved.
// The section text is built ONCE at registration (apply time) from the T7
// loader — no per-event disk reads.
import { loadSystemSections, type SystemSections } from './system-sections.ts'

/** The one and only event this module listens on. */
export const HARD_BLOCKS_INJECTION_EVENT = 'agent/pre-step'

/** Plugin name stamped on every injected message's source. */
export const HARD_BLOCKS_INJECTION_PLUGIN = 'omo-agents'

/**
 * Minimal structural typings — this workspace has no dsh dependency, so the
 * module declares only the shapes it touches (same discipline as index.ts;
// keeps `pnpm typecheck` honest without importing DSH types).
 */
export interface InjectedTextBlock {
  type: 'text'
  text: string
}

export interface InjectedPluginSource {
  kind: 'plugin'
  plugin: string
  form?: 'instructions' | 'catalog' | 'snapshot' | 'notice'
}

export interface InjectedUserMessage {
  id: string
  role: 'user'
  content: InjectedTextBlock[]
  source: InjectedPluginSource
}

interface SessionHeaderLike {
  origin?: 'subagent'
}

export interface InjectableAgent {
  id: string
  session: { header: SessionHeaderLike }
  inject(message: InjectedUserMessage): void
}

export interface PreStepPayloadLike {
  agent: InjectableAgent
}

export type PreStepNextLike = () => Promise<unknown>

export interface PreStepRegistrationContext {
  on(
    event: string,
    listener: (payload: PreStepPayloadLike, next: PreStepNextLike) => Promise<unknown>,
  ): unknown
}

/**
 * Builds the single cached injection text: Hard Blocks + Anti-Patterns, in
 * that order, trimmed, blank-line joined. Role and delegation-discipline are
 * deliberately absent — the sub-agent's own persona carries those; only the
 * two blocking-policy sections are injected (FR-6).
 */
export function buildHardBlocksInjectionText(
  sections: Pick<SystemSections, 'hardBlocks' | 'antiPatterns'>,
): string {
  return [sections.hardBlocks.trimEnd(), sections.antiPatterns.trimEnd()].join('\n\n')
}

/**
 * Registers the ONE `agent/pre-step` listener. Reads the sections exactly
 * once (default: the T7 loader against the shipped system-sections/ dir) and
 * closes over the cached text. Returns whatever `ctx.on` returned (a disposer
 * under cordis) so callers/tests can observe registration.
 *
 * Listener behavior:
 *   * non-sub-agent (no `origin: 'subagent'` header) → no-op + delegate;
 *   * sub-agent, first pre-step → `agent.inject()` both sections, remember
 *     the agent (at most one injection per agent, ever), delegate;
 *   * sub-agent, later pre-steps → no-op + delegate.
 */
export function registerHardBlocksInjection(
  ctx: PreStepRegistrationContext,
  sections: SystemSections = loadSystemSections(),
): unknown {
  const text = buildHardBlocksInjectionText(sections)
  const injected = new WeakSet<InjectableAgent>()
  return ctx.on(HARD_BLOCKS_INJECTION_EVENT, async ({ agent }, next) => {
    if (agent.session.header.origin === 'subagent' && !injected.has(agent)) {
      injected.add(agent)
      agent.inject({
        id: crypto.randomUUID(),
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: HARD_BLOCKS_INJECTION_PLUGIN, form: 'instructions' },
      })
    }
    return next()
  })
}
