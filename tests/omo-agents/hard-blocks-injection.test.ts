// T16 — Hard Blocks injection listener (TDD: written BEFORE the module
// existed; first run must fail on the unresolved import).
//
// The listener ports OMO's intercept/inject pattern (assumption V3) onto the
// verified DSH surface:
//   event  — `agent/pre-step`, a scope-filtered WATERFALL
//            (dsh-agent/lib/types/runtime-types.d.ts:235-241:
//            payload { agent, messages, turn, step, signal },
//            next: () => Promise<PreStepDecision>;
//            `PreStepDecision = {kind:'reject'} | {kind:'enter', messages}`
//            at runtime-types.d.ts:47-52).
//   inject — `agent.inject(message)` queues model-facing context for the next
//            pre-step WITHOUT waking the driver (runtime-types.d.ts:126-132);
//            runtime it is `send(message, 'next-step', false)`
//            (dsh-agent-loop/lib/index.js:402-404). The message must carry a
//            stable `id` — the inbox validates pending-id uniqueness
//            (dsh-agent/lib/index.js:165-170) — so we mint a UUID per
//            injection, mirroring dsh-llm's createUserMessage
//            (dsh-llm/lib/types/message.js:33-49).
//   gate   — only sub-agent children: `agent.session.header.origin ===
//            'subagent'` (dsh-session/lib/types/types.d.ts:61-64; stamped by
//            childSessionMeta, packages/subagent/subagent/src/child-agent.ts:102-121).
//
// Waterfall contract (P-3): a listener must call `next()` to delegate —
// returning without it vetoes the built-in behavior (cordis
// lib/types/events.d.ts:72-80; docs/cordis-primer.md:28-32), and the returned
// decision is authoritative (docs/agent-lifecycle.md:78). Our listener never
// short-circuits: it observes, enqueues via agent.inject, and ALWAYS returns
// next()'s decision untouched.
import { describe, expect, it, vi } from 'vitest'
import {
  HARD_BLOCKS_INJECTION_EVENT,
  buildHardBlocksInjectionText,
  registerHardBlocksInjection,
} from '../../patches/omo-dsh/omo-agents/src/hard-blocks-injection'
import { loadSystemSections, type SystemSections } from '../../patches/omo-dsh/omo-agents/src/system-sections'

// --- Test doubles mirroring the verified dsh shapes (structural, no dsh dep).

interface InjectedMessage {
  id: string
  role: 'user'
  content: { type: 'text'; text: string }[]
  source: { kind: 'plugin'; plugin: string; form?: string }
}

function makeAgent(origin?: 'subagent') {
  const inject = vi.fn<(message: InjectedMessage) => void>()
  return {
    id: `session-${origin ?? 'main'}`,
    session: { header: { ...(origin === undefined ? {} : { origin }) } },
    inject,
  }
}

function makeCtx() {
  const on = vi.fn<(event: string, listener: unknown) => () => boolean>(() => () => true)
  return { on }
}

function makeNext(decision: unknown = { kind: 'enter', messages: [] }) {
  return vi.fn<() => Promise<unknown>>(() => Promise.resolve(decision))
}

type PreStepListener = (
  payload: { agent: ReturnType<typeof makeAgent> },
  next: () => Promise<unknown>,
) => Promise<unknown>

/** Registers against a fresh ctx double and returns the captured listener. */
function captureListener(sections?: SystemSections) {
  const ctx = makeCtx()
  registerHardBlocksInjection(ctx, sections)
  expect(ctx.on).toHaveBeenCalledTimes(1)
  const [event, listener] = ctx.on.mock.calls[0] as [string, PreStepListener]
  return { ctx, event, listener }
}

describe('hard-blocks injection listener (T16, FR-6, P-3)', () => {
  it('hooks the verified waterfall event name: agent/pre-step', () => {
    expect(HARD_BLOCKS_INJECTION_EVENT).toBe('agent/pre-step')
  })

  it('builds the injection text from the two T7 sections, Hard Blocks first', () => {
    const sections: SystemSections = {
      role: 'ROLE',
      delegationDiscipline: 'DELEGATION',
      hardBlocks: '## Hard Blocks\n\n- Never X\n',
      antiPatterns: '## Anti-Patterns (BLOCKING violations)\n\n- Bad Y\n',
    }
    const text = buildHardBlocksInjectionText(sections)
    expect(text).toContain('## Hard Blocks')
    expect(text).toContain('## Anti-Patterns')
    expect(text.indexOf('## Hard Blocks')).toBeLessThan(text.indexOf('## Anti-Patterns'))
    // Only those two sections — role/delegation never leak into the injection.
    expect(text).not.toContain('ROLE')
    expect(text).not.toContain('DELEGATION')
  })

  it('the REAL sections produce text carrying both AC markers', () => {
    const text = buildHardBlocksInjectionText(loadSystemSections())
    expect(text).toContain('## Hard Blocks')
    expect(text).toContain('## Anti-Patterns (BLOCKING violations)')
  })

  it('registers exactly ONE listener, on agent/pre-step', () => {
    const { ctx, event } = captureListener()
    expect(ctx.on).toHaveBeenCalledTimes(1)
    expect(event).toBe('agent/pre-step')
  })

  it('on a sub-agent pre-step: injects both sections via agent.inject, then delegates', async () => {
    const { listener } = captureListener()
    const agent = makeAgent('subagent')
    const decision = { kind: 'enter', messages: [] }
    const downstream = makeNext(decision)
    const result = await listener({ agent }, downstream)

    expect(agent.inject).toHaveBeenCalledTimes(1)
    const message = agent.inject.mock.calls[0]![0]
    expect(message.role).toBe('user')
    expect(message.source.kind).toBe('plugin')
    expect(message.source.plugin).toBe('omo-agents')
    expect(typeof message.id).toBe('string')
    expect(message.id.length).toBeGreaterThan(0)
    expect(message.content).toHaveLength(1)
    expect(message.content[0]!.type).toBe('text')
    expect(message.content[0]!.text).toContain('## Hard Blocks')
    expect(message.content[0]!.text).toContain('## Anti-Patterns')

    // Waterfall contract: next() delegated exactly once and its decision is
    // returned untouched — the listener never short-circuits (never vetoes
    // the built-in enter/reject behavior).
    expect(downstream).toHaveBeenCalledTimes(1)
    expect(result).toBe(decision)
  })

  it('no-op for a NON-sub-agent pre-step: no injection, still delegates', async () => {
    const { listener } = captureListener()
    const agent = makeAgent(undefined) // main agent: header carries no origin
    const downstream = makeNext()
    await listener({ agent }, downstream)
    expect(agent.inject).not.toHaveBeenCalled()
    expect(downstream).toHaveBeenCalledTimes(1)
  })

  it('injects at most once per agent: a second pre-step for the same sub-agent is a no-op', async () => {
    const { listener } = captureListener()
    const agent = makeAgent('subagent')
    await listener({ agent }, makeNext())
    await listener({ agent }, makeNext())
    expect(agent.inject).toHaveBeenCalledTimes(1)
  })

  it('caches the section text at registration: distinct sub-agents share content, never re-read', async () => {
    const sections: SystemSections = {
      role: 'ROLE',
      delegationDiscipline: 'DELEGATION',
      hardBlocks: '## Hard Blocks\n\nCACHED',
      antiPatterns: '## Anti-Patterns\n\nCACHED',
    }
    const { listener } = captureListener(sections)
    const first = makeAgent('subagent')
    const second = makeAgent('subagent')
    await listener({ agent: first }, makeNext())
    await listener({ agent: second }, makeNext())
    expect(first.inject).toHaveBeenCalledTimes(1)
    expect(second.inject).toHaveBeenCalledTimes(1)
    expect(first.inject.mock.calls[0]![0].content[0]!.text).toContain('CACHED')
    expect(second.inject.mock.calls[0]![0].content[0]!.text).toBe(
      first.inject.mock.calls[0]![0].content[0]!.text,
    )
    // Distinct message identities per injection (inbox rejects duplicate
    // pending ids within an agent; identity must never alias across agents).
    expect(second.inject.mock.calls[0]![0].id).not.toBe(first.inject.mock.calls[0]![0].id)
  })
})
