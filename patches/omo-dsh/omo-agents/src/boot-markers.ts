// boot-markers.ts — P2-T16 boot-marker + non-blocking-warning computation,
// factored out of index.ts so every line this plugin logs is produced by a
// unit-tested function (the hard-blocks-injection.ts "pure module + thin
// index.ts wiring" pattern). index.ts keeps only the try/catch discipline and
// the console.log calls; the one side-effecting helper here
// (`registerRouteProviderCheck`) talks to a minimal structural context and is
// itself covered by tests with fake timers.
//
// WHY FACTOR IT OUT (plan §4.2/§4.6; task P2-T16-E). The probe's boot-log
// assertions (scripts/concerto-mode-probe.sh, extended by P2-T20) anchor on
// exact marker text. Text assembled inline in apply() can only be tested by
// booting a real dsh; text assembled by a pure function is pinned by unit
// tests, and the probe then confirms the same function ran. Every format below
// is therefore a documented, greppable contract, stable across versions:
//
//   persona assembled  "[omo-agents] omo-<id> persona assembled: 1 section, <N> chars"
//                      — ONE line per DELEGATION_ENTRIES row (10 lines), in
//                        roster order. The explore line is byte-identical to
//                        the pre-P2-T16 T10 marker: the probe greps the
//                        substring "[omo-agents] omo-explore persona assembled:
//                        1 section, " (concerto-mode-probe.sh:694) and this
//                        format is what keeps that grep passing with no probe
//                        edit. `<N>` is the assembled persona's length in
//                        characters.
//   persona FAILED     "[omo-agents] omo-<id> persona FAILED: <describeError>"
//                      — loud-but-non-fatal; one agent's broken persona never
//                        takes the other nine down (per-agent try/catch).
//   route summary      "[omo-agents] model routes: sisyphus=<P>/<M> explore=<P>/<M>
//                        hephaestus=<P>/<M> oracle=<P>/<M> librarian=<P>/<M>
//                        plan-consultant=<P>/<M> plan-reviewer=<P>/<M> atlas=<P>/<M>
//                        multimodal-looker=<P>/<M> sisyphus-junior=<P>/<M>
//                        prometheus=<P>/<M>"
//                      — ONE line, all 11 roster routes in roster order,
//                        space-separated `id=provider/model` fields. The prefix
//                        "[omo-agents] model routes: sisyphus=<P>/<M> explore=<P>/<M>"
//                        is byte-compatible with the T14 marker the probe
//                        currently greps (concerto-mode-probe.sh:707, no
//                        line-end anchor) and the full 11-field line is the
//                        P2-T20 11-route assertion anchor. KEEP THIS FORMAT
//                        STABLE: amend the probe, never the format.
//   route warning      "[omo-agents] route warning [<code>]: <message>"
//                      — ONE non-blocking line per resolveModelRoutesWithWarnings
//                        warning (plan §4.6 rules 1/2). NOTHING is logged when
//                        they do not fire — the default three-seat distribution
//                        must not fire.
//   provider missing   "[omo-agents] route provider not registered: <provider> (agents: <ids>)"
//                      — ONE non-blocking line per DISTINCT route provider with
//                        no registered LLM adapter, listing its affected agents
//                        in roster order (", "-separated). Runtime layer: the
//                        check reads ctx.inject(['llm']) -> llm.listProviders()
//                        and is SETTLED rather than synchronous at apply()
//                        (see ROUTE_PROVIDER_CHECK_SETTLE_MS below — a
//                        settings-driven adapter registers after this plugin's
//                        apply()). Registration is keyless and hot-loadable, so
//                        this NEVER blocks and NEVER throws; with the llm
//                        service absent the inject simply never fires and no
//                        line is emitted.
//   provider check FAILED "[omo-agents] route provider check FAILED: <describeError>"
//                      — unexpected-error discipline shared with every sibling
//                        boot block; never a throw out of apply().
//
// 口径注 (P2-T16 acceptance): "11 personas" counts persona SENTINEL SLOTS — the
// 10 delegation rows this module logs plus the conductor, whose marker is the
// pre-existing "[omo-agents] omo-sisyphus system prompt assembled" line in
// system-prompt.ts/index.ts. This module emits exactly 10 `persona assembled`
// lines (one per DELEGATION_ENTRIES row); the conductor is not one of them.
//
// The llm surface typed here is EXACTLY what the check uses:
// `llm.listProviders()` returns detached `LlmProviderInfo[]` (`{ id, name }`)
// in registration order — read from the installed dsh-llm
// lib/index.js:1846 plus its exported `LlmProviderInfo` declaration
// (dsh-llm/lib/types/types.d.ts:180-185). Only `id` is consumed.

import { ALL_AGENT_IDS } from './roster.ts'
import type { AgentId } from './roster.ts'
import type { ModelRoutes, ModelRouteWarning } from './model-routes.ts'

/**
 * Renders one caught error for a FAILED boot line. Moved here (from index.ts)
 * so the module and its tests share ONE definition and no caller can drift.
 */
export function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

/**
 * Every dsh-tool-subagent persona is assembled from exactly ONE roster
 * `personaFile` (roster.ts), so the section count is structurally 1. It stays a
 * literal rather than a derived `DELEGATION_ENTRIES.length` because the marker
 * text is a probe anchor and `1 section` (singular noun) is the T10 format the
 * probe greps byte-for-byte.
 */
export const PERSONA_SECTION_COUNT = 1

/**
 * `[omo-agents] omo-<id> persona assembled: 1 section, <N> chars` — one line per
 * delegation persona, logged on success. Byte-identical to the pre-P2-T16
 * explore-only line when `id === 'explore'` (probe anchor).
 */
export function formatPersonaAssembledLine(id: string, prompt: string): string {
  return `[omo-agents] omo-${id} persona assembled: `
    + `${PERSONA_SECTION_COUNT} section, ${prompt.length} chars`
}

/**
 * `[omo-agents] omo-<id> persona FAILED: <describeError>` — loud-but-non-fatal
 * (the probe asserts the absence of this line for explore on the happy path).
 */
export function formatPersonaFailedLine(id: string, err: unknown): string {
  return `[omo-agents] omo-${id} persona FAILED: ${describeError(err)}`
}

/**
 * `[omo-agents] model routes: sisyphus=<P>/<M> explore=<P>/<M> …` — ONE line
 * covering all 11 roster routes in roster order (see the file header; the
 * sisyphus/explore prefix is the existing T14 probe anchor).
 */
export function formatRouteSummaryLine(routes: ModelRoutes): string {
  const seats = ALL_AGENT_IDS.map((id) => `${id}=${routes[id].provider}/${routes[id].model}`)
  return `[omo-agents] model routes: ${seats.join(' ')}`
}

/**
 * `[omo-agents] route warning [<code>]: <message>` — the non-blocking render of
 * one `ModelRouteWarning` (plan §4.6 warnings 1/2). No warning object, no line.
 */
export function formatRouteWarningLine(warning: ModelRouteWarning): string {
  return `[omo-agents] route warning [${warning.code}]: ${warning.message}`
}

/**
 * The exact llm surface the provider check consumes: one synchronous
 * registration-ordered provider listing. Structural only — this workspace has
 * no dsh dependency (same discipline as index.ts / hard-blocks-injection.ts).
 */
export interface LlmProviderInfoLike {
  readonly id: string
}

export interface LlmServiceLike {
  listProviders(): readonly LlmProviderInfoLike[]
}

/** One route provider with no registered adapter, plus its affected agents. */
export interface MissingRouteProvider {
  readonly provider: string
  readonly agentIds: readonly AgentId[]
}

/**
 * Groups the roster routes whose provider is absent from
 * `registeredProviderIds`. PURE, order-preserving: groups appear in roster
 * order of their first affected agent, and `agentIds` is in roster order — so
 * the line a deployment reads is deterministic and diffable.
 */
export function findUnregisteredRouteProviders(
  routes: ModelRoutes,
  registeredProviderIds: readonly string[],
): readonly MissingRouteProvider[] {
  const registered = new Set(registeredProviderIds)
  const missing = new Map<string, AgentId[]>()
  for (const id of ALL_AGENT_IDS) {
    const provider = routes[id].provider
    if (registered.has(provider)) continue
    const agentIds = missing.get(provider)
    if (agentIds === undefined) missing.set(provider, [id])
    else agentIds.push(id)
  }
  return [...missing].map(([provider, agentIds]) => ({ provider, agentIds }))
}

/**
 * `[omo-agents] route provider not registered: <provider> (agents: <ids>)` —
 * one non-blocking line per distinct missing provider, agents roster-ordered.
 */
export function formatProviderNotRegisteredLine(missing: MissingRouteProvider): string {
  return `[omo-agents] route provider not registered: ${missing.provider} `
    + `(agents: ${missing.agentIds.join(', ')})`
}

/** The one FAILED form for the provider check (shared by every catch below). */
export function formatProviderCheckFailedLine(err: unknown): string {
  return `[omo-agents] route provider check FAILED: ${describeError(err)}`
}

/**
 * Settle window for the provider check (P2-T16(D), MEASURED deviation from a
 * bare apply()-time read). Rationale, from real probe boots
 * (scripts/concerto-mode-probe.sh, dsh 0.1.5-rc.1, 2026-09-12); times vary
 * between runs because the settings file read shares the boot's synchronous
 * blocks, so the VALUES below are the observed shape, not one fixed timeline:
 *
 *   t+0        our apply() runs; llm.listProviders() = [deepseek-official]
 *   t+16ms…    llm/adapters-updated fires: [deepseek-official, deepseek]
 *   t+5.8s     (observed worst case) the same growth event, right at readiness
 *   t+2.5s…8s  session-scope churn (isolated llm realms) bubbles late events
 *              whose registry reads can be transiently empty
 *
 * dsh-llm-pi-ai registers its settings-driven route asynchronously inside its
 * OWN ctx.inject(['settings']) callback (pi-ai lib/index.js:2659-2681), which
 * runs after ours; a bare t+0 read therefore logs
 * `route provider not registered: deepseek` in the probe's fully-registered
 * sandbox — a false positive that violates the P2-T16 acceptance.
 *
 * THE DESIGN: the settled read happens when the registry has GROWN since the
 * inject-time snapshot (that growth IS the settings-driven registration), and
 * otherwise after this quiet window measured from the last topology change.
 * The registered set is only ever read to decide, and the ONE reporting read
 * happens in a timer callback: a timer runs outside the dispatching fiber's
 * scope, whereas an event handler can resolve to an isolated session realm
 * (the same probe boot showed transient empty listings from late churn).
 * `ROUTE_PROVIDER_CHECK_SETTLE_MS` is deliberately generous (8s) because a
 * missing provider is a static deployment fact — the line is still a boot
 * marker, just not one racing a settings read — while reporting early on a
 * slow boot is a false positive. A deployment whose pi-ai settings section is
 * missing registers nothing, so no growth event ever arrives and the quiet
 * fallback is what reports it.
 */
export const ROUTE_PROVIDER_CHECK_SETTLE_MS = 8000

/**
 * Grace period after a registry-growth event before the settled read —
 * coalesces the burst of registrations one settings load produces.
 */
export const ROUTE_PROVIDER_CHECK_EVENT_GRACE_MS = 50

/** Minimal `ctx` surface the provider check wires (a cordis child context). */
export interface RouteProviderCheckContext {
  on(event: string, listener: () => void): unknown
}

/**
 * Schedules the ONE settled provider-registration check (see
 * ROUTE_PROVIDER_CHECK_SETTLE_MS for the measured timing rationale) and logs
 * its lines through `log`. Called from index.ts with the `ctx.inject(['llm'])`
 * context; never throws:
 *   * a topology change that ADDS a provider (the settings-driven
 *     registration) runs the check after the grace period;
 *   * any other topology change resets the quiet fallback, so the churn of a
 *     settling boot can never let an early read through;
 *   * the quiet fallback reports the static missing-provider case where
 *     nothing ever registers;
 *   * exactly one check runs (settled flag), so late session-scope churn can
 *     neither duplicate nor retract the boot verdict;
 *   * a throwing `listProviders()` becomes one FAILED line;
 *   * a throwing `ctx.on` is reported and still leaves the fallback armed, so
 *     losing the event half never loses the check.
 */
export function registerRouteProviderCheck(
  context: RouteProviderCheckContext,
  llm: LlmServiceLike,
  routes: ModelRoutes,
  log: (line: string) => void,
): void {
  let settled = false
  const check = (): void => {
    if (settled) return
    settled = true
    try {
      reportRouteProviderRegistration(routes, llm, log)
    } catch (err) {
      log(formatProviderCheckFailedLine(err))
    }
  }
  /**
   * The decision read. Swallows a throwing listing (an unqueryable registry is
   * not evidence of growth) — the reporting read below turns a persistent
   * failure into the FAILED line.
   */
  const registeredIds = (): readonly string[] => {
    try {
      return llm.listProviders().map((info) => info.id)
    } catch {
      return []
    }
  }
  const baseline = new Set(registeredIds())
  let quiet = setTimeout(check, ROUTE_PROVIDER_CHECK_SETTLE_MS)
  const onAdaptersUpdated = (): void => {
    if (settled) return
    const grew = registeredIds().some((id) => !baseline.has(id))
    clearTimeout(quiet)
    quiet = setTimeout(check, grew ? ROUTE_PROVIDER_CHECK_EVENT_GRACE_MS : ROUTE_PROVIDER_CHECK_SETTLE_MS)
  }
  try {
    context.on('llm/adapters-updated', onAdaptersUpdated)
  } catch (err) {
    log(`[omo-agents] route provider listener FAILED: ${describeError(err)}`)
  }
}

/**
 * The runtime provider-registration check (plan §4.6 third warning, T16-D).
 * Emits one non-blocking line per missing route provider through `log`.
 *
 * Discipline (registration is keyless and hot-loadable — a missing provider
 * must never block boot):
 *   * `llm === undefined` (service not mounted, or `ctx.inject(['llm'])` never
 *     fired) -> nothing logged, nothing thrown;
 *   * a throwing `listProviders()` -> exactly one
 *     `[omo-agents] route provider check FAILED: …` line, never a throw.
 */
export function reportRouteProviderRegistration(
  routes: ModelRoutes,
  llm: LlmServiceLike | undefined,
  log: (line: string) => void,
): void {
  if (llm === undefined) return
  try {
    const registered = llm.listProviders().map((info) => info.id)
    for (const missing of findUnregisteredRouteProviders(routes, registered)) {
      log(formatProviderNotRegisteredLine(missing))
    }
  } catch (err) {
    log(formatProviderCheckFailedLine(err))
  }
}
