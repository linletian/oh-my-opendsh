// P2-T16 — roster-wide boot markers + the non-blocking route warnings
// (docs/plans/phase2-dev/phase2-tasks.md P2-T16; plan §4.2/§4.6). These tests
// pin the EXACT marker text the probe anchors on, so a future format drift
// fails here (unit speed) instead of only in the slow probe. Three layers:
//   1. boot-markers.ts pure formatters/evaluators — every line apply() logs;
//   2. boot-markers.ts registerRouteProviderCheck — the SETTLED provider read
//      (fallback timer / first-topology-change path / run-once discipline);
//   3. index.ts apply() wiring — the DELEGATION_ENTRIES loop, the per-agent
//      try/catch, the warning loop, and the never-throw boot discipline,
//      driven through a structural ctx double (no dsh boot).
//
// Probe anchors kept byte-compatible (scripts/concerto-mode-probe.sh:694/:707,
// which P2-T16 must NOT touch):
//   "[omo-agents] omo-explore persona assembled: 1 section, "        (substring)
//   "[omo-agents] model routes: sisyphus=…/… explore=…/…"            (substring)
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PERSONA_SECTION_COUNT,
  ROUTE_PROVIDER_CHECK_EVENT_GRACE_MS,
  ROUTE_PROVIDER_CHECK_SETTLE_MS,
  describeError,
  findUnregisteredRouteProviders,
  formatPersonaAssembledLine,
  formatPersonaFailedLine,
  formatProviderCheckFailedLine,
  formatProviderNotRegisteredLine,
  formatRouteSummaryLine,
  formatRouteWarningLine,
  registerRouteProviderCheck,
  reportRouteProviderRegistration,
} from '../../patches/omo-dsh/omo-agents/src/boot-markers'
import {
  DELEGATION_ENTRIES,
  ROSTER,
  type AgentId,
} from '../../patches/omo-dsh/omo-agents/src/roster'
import {
  evaluateModelRouteWarnings,
  resolveModelRoutes,
  resolveModelRoutesWithWarnings,
  type ModelRoute,
  type ModelRoutes,
} from '../../patches/omo-dsh/omo-agents/src/model-routes'
import { buildAgentPersona } from '../../patches/omo-dsh/omo-agents/src/persona-prompts'
import {
  EXPLORE_SECTION_ORDER,
  buildExploreSystemPrompt,
} from '../../patches/omo-dsh/omo-agents/src/explore-prompt'
import { apply } from '../../patches/omo-dsh/omo-agents/src/index'

/** The fixed lead-in of the 11-route summary line (probe anchor prefix). */
const LINE_PREFIX = '[omo-agents] model routes: '

/**
 * The plan §4.6 seat map, copied by hand from phase2-roster.md §1 总表 —
 * deliberately NOT derived from roster.ts, so this test fails if the roster
 * rows and the documented table ever diverge (same discipline as
 * model-routes.test.ts's ROSTER_BASELINE).
 */
const ROUTE_BASELINE: ReadonlyArray<{ id: string } & ModelRoute> = [
  { id: 'sisyphus', provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  { id: 'explore', provider: 'deepseek', model: 'deepseek-v4-flash' },
  { id: 'hephaestus', provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  { id: 'oracle', provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  { id: 'librarian', provider: 'deepseek', model: 'deepseek-v4-flash' },
  { id: 'plan-consultant', provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  { id: 'plan-reviewer', provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  { id: 'atlas', provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  { id: 'multimodal-looker', provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp' },
  { id: 'sisyphus-junior', provider: 'deepseek', model: 'deepseek-v4-flash' },
  { id: 'prometheus', provider: 'deepseek-official', model: 'deepseek-v4-pro' },
]

/** The 10 delegation ids, in roster order — hand-copied, not derived. */
const DELEGATION_IDS = [
  'explore',
  'hephaestus',
  'oracle',
  'librarian',
  'plan-consultant',
  'plan-reviewer',
  'atlas',
  'multimodal-looker',
  'sisyphus-junior',
  'prometheus',
]

/** The two providers the default seats need, as a registration listing. */
const ALL_PROVIDERS = [{ id: 'deepseek-official' }, { id: 'deepseek' }]

/** Every one of the 11 routes set to the same pair. */
function uniformRoutes(route: ModelRoute): ModelRoutes {
  const out: Record<string, ModelRoute> = {}
  for (const entry of ROSTER) out[entry.id] = { ...route }
  return out as ModelRoutes
}

/** Defaults, but every one of the 10 delegation routes moved onto one seat. */
function delegationSeatRoutes(seat: ModelRoute): ModelRoutes {
  const out: Record<string, ModelRoute> = { ...resolveModelRoutes({}) }
  for (const entry of DELEGATION_ENTRIES) out[entry.id as AgentId] = { ...seat }
  return out as ModelRoutes
}

describe('P2-T16(A) child persona markers', () => {
  it('formats the explore line byte-identically to the pre-P2-T16 T10 marker', () => {
    const legacy = `[omo-agents] omo-explore persona assembled: `
      + `${EXPLORE_SECTION_ORDER.length} section, ${buildExploreSystemPrompt().length} chars`
    expect(formatPersonaAssembledLine('explore', buildAgentPersona('explore'))).toBe(legacy)
    // The probe greps this exact substring (concerto-mode-probe.sh:694).
    expect(legacy.startsWith('[omo-agents] omo-explore persona assembled: 1 section, ')).toBe(true)
    expect(PERSONA_SECTION_COUNT).toBe(EXPLORE_SECTION_ORDER.length)
  })

  it('emits one line per delegation row, in roster order, in the pinned format', () => {
    const lines = DELEGATION_ENTRIES.map((entry) =>
      formatPersonaAssembledLine(entry.id, buildAgentPersona(entry.id)))
    expect(lines).toHaveLength(10)
    expect(DELEGATION_ENTRIES.map((entry) => entry.id)).toEqual(DELEGATION_IDS)
    for (const [index, id] of DELEGATION_IDS.entries()) {
      expect(lines[index]).toMatch(
        new RegExp(`^\\[omo-agents\\] omo-${id} persona assembled: 1 section, \\d+ chars$`),
      )
      expect(lines[index]).toContain(formatPersonaAssembledLine(id, buildAgentPersona(id)))
    }
  })

  it('keeps the singular "1 section" wording and a numeric char count', () => {
    const line = formatPersonaAssembledLine('multimodal-looker', 'abcde')
    expect(line).toBe('[omo-agents] omo-multimodal-looker persona assembled: 1 section, 5 chars')
  })

  it('renders the per-agent failure form with the shared describeError wording', () => {
    expect(formatPersonaFailedLine('oracle', new Error('boom'))).toBe(
      '[omo-agents] omo-oracle persona FAILED: Error: boom',
    )
    expect(formatPersonaFailedLine('atlas', 'plain string')).toBe(
      '[omo-agents] omo-atlas persona FAILED: plain string',
    )
    expect(describeError(new TypeError('x'))).toBe('TypeError: x')
  })
})

describe('P2-T16(B) one-line 11-route summary', () => {
  const PROBE_PREFIX = LINE_PREFIX
    + 'sisyphus=deepseek-official/deepseek-v4-pro explore=deepseek/deepseek-v4-flash'

  it('is the T14 two-route prefix, byte-compatible with the existing probe grep', () => {
    const line = formatRouteSummaryLine(resolveModelRoutes({}))
    expect(line.startsWith(PROBE_PREFIX)).toBe(true)
    // No line-end anchor in the probe: the prefix alone must already match.
    expect(line).toContain(PROBE_PREFIX)
  })

  it('continues with the other 9 agents in roster order (independent expectation)', () => {
    const expected = LINE_PREFIX
      + ROUTE_BASELINE.map(({ id, provider, model }) => `${id}=${provider}/${model}`).join(' ')
    expect(formatRouteSummaryLine(resolveModelRoutes({}))).toBe(expected)
  })

  it('carries exactly 11 `id=provider/model` fields in roster order', () => {
    const line = formatRouteSummaryLine(resolveModelRoutes({}))
    const fields = line.slice(LINE_PREFIX.length).split(' ')
    expect(fields).toHaveLength(11)
    expect(fields.map((field) => field.split('=')[0])).toEqual(ROSTER.map((entry) => entry.id))
  })

  it('reflects env overrides (the line is the runtime route truth, not the defaults)', () => {
    const line = formatRouteSummaryLine(resolveModelRoutes({
      OMO_ORACLE_PROVIDER: 'custom-provider',
      OMO_ORACLE_MODEL: 'custom-model',
    }))
    expect(line).toContain('oracle=custom-provider/custom-model')
    expect(line.startsWith(PROBE_PREFIX)).toBe(true)
  })
})

describe('P2-T16(C) non-blocking seat warnings', () => {
  it('logs nothing for the default three-seat distribution', () => {
    const { warnings } = resolveModelRoutesWithWarnings({})
    expect(warnings).toEqual([])
  })

  it('fires warning 1 (all 11 identical) with the pinned greppable format', () => {
    const seat: ModelRoute = { provider: 'deepseek-official', model: 'deepseek-v4-pro' }
    const warnings = evaluateModelRouteWarnings(uniformRoutes(seat))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.code).toBe('all-routes-identical')
    const line = formatRouteWarningLine(warnings[0]!)
    expect(line.startsWith('[omo-agents] route warning [all-routes-identical]: ')).toBe(true)
    expect(line).toContain('deepseek-official/deepseek-v4-pro')
  })

  it('fires warning 2 (delegation uniform, conductor differs) and no other warning', () => {
    // A seat DISTINCT from the conductor's (which stays the strong-seat default)
    // so warning 1 does not subsume warning 2.
    const seat: ModelRoute = { provider: 'deepseek', model: 'deepseek-v4-pro' }
    const routes = delegationSeatRoutes(seat)
    expect(routes.sisyphus).toEqual({
      provider: ROUTE_BASELINE[0]!.provider,
      model: ROUTE_BASELINE[0]!.model,
    })
    const warnings = evaluateModelRouteWarnings(routes)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.code).toBe('all-delegation-routes-same-seat')
    expect(warnings[0]!.agentIds).toEqual(DELEGATION_IDS)
    const line = formatRouteWarningLine(warnings[0]!)
    expect(line).toMatch(/^\[omo-agents\] route warning \[[a-z-]+\]: .+/)
  })

  it('the no-fire case is silent — no warning line is even formatted', () => {
    const { routes, warnings } = resolveModelRoutesWithWarnings({})
    expect(warnings).toHaveLength(0)
    expect(routes.sisyphus).not.toEqual(routes.explore)
  })
})

describe('P2-T16(D) route-provider registration', () => {
  const defaults = resolveModelRoutes({})

  it('reports nothing when every route provider is registered', () => {
    const lines: string[] = []
    reportRouteProviderRegistration(
      defaults,
      { listProviders: () => ALL_PROVIDERS },
      (line) => lines.push(line),
    )
    expect(lines).toEqual([])
  })

  it('logs ONE line naming the missing provider and its agents, in roster order', () => {
    const lines: string[] = []
    reportRouteProviderRegistration(
      defaults,
      { listProviders: () => [{ id: 'deepseek-official' }] },
      (line) => lines.push(line),
    )
    expect(lines).toEqual([
      '[omo-agents] route provider not registered: deepseek '
      + '(agents: explore, librarian, sisyphus-junior)',
    ])
  })

  it('groups by distinct provider: one line each, first-appearance (roster) order', () => {
    const lines: string[] = []
    reportRouteProviderRegistration(defaults, { listProviders: () => [] }, (line) => lines.push(line))
    expect(lines).toEqual([
      '[omo-agents] route provider not registered: deepseek-official '
      + '(agents: sisyphus, hephaestus, oracle, plan-consultant, plan-reviewer, atlas, '
      + 'multimodal-looker, prometheus)',
      '[omo-agents] route provider not registered: deepseek '
      + '(agents: explore, librarian, sisyphus-junior)',
    ])
  })

  it('findUnregisteredRouteProviders is pure and ignores unrelated registered ids', () => {
    expect(findUnregisteredRouteProviders(defaults, ['deepseek', 'deepseek-official', 'openai']))
      .toEqual([])
    expect(findUnregisteredRouteProviders(defaults, ['deepseek-official']).map((m) => m.provider))
      .toEqual(['deepseek'])
    expect(formatProviderNotRegisteredLine({ provider: 'p', agentIds: ['explore', 'oracle'] }))
      .toBe('[omo-agents] route provider not registered: p (agents: explore, oracle)')
  })

  it('an absent llm service logs nothing and never throws', () => {
    const lines: string[] = []
    expect(() => reportRouteProviderRegistration(defaults, undefined, (line) => lines.push(line)))
      .not.toThrow()
    expect(lines).toEqual([])
  })

  it('a throwing listProviders() becomes one FAILED line, never a throw', () => {
    const lines: string[] = []
    expect(() => reportRouteProviderRegistration(
      defaults,
      { listProviders: () => { throw new Error('registry exploded') } },
      (line) => lines.push(line),
    )).not.toThrow()
    expect(lines).toEqual([
      '[omo-agents] route provider check FAILED: Error: registry exploded',
    ])
    expect(formatProviderCheckFailedLine(new Error('x')))
      .toBe('[omo-agents] route provider check FAILED: Error: x')
  })
})

// ---------------------------------------------------------------------------
// The SETTLED schedule: measured evidence (see boot-markers.ts
// ROUTE_PROVIDER_CHECK_SETTLE_MS) is that dsh-llm-pi-ai registers its
// settings-driven route ~16ms AFTER this plugin's apply(), so a synchronous t0
// read false-positives; the read therefore happens in a timer callback, once.
// ---------------------------------------------------------------------------

describe('P2-T16(D) settled provider check', () => {
  const defaults = resolveModelRoutes({})

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function makeContext(options: { throwOnOn?: boolean } = {}) {
    const listeners: Array<{ event: string; listener: () => void }> = []
    return {
      context: {
        on: (event: string, listener: () => void) => {
          if (options.throwOnOn) throw new Error('on refused')
          listeners.push({ event, listener })
          return () => true
        },
      },
      emit: (event: string): void => {
        for (const entry of listeners) if (entry.event === event) entry.listener()
      },
    }
  }

  it('snapshots the baseline, logs nothing, and reports only after the quiet fallback', () => {
    const lines: string[] = []
    const listProviders = vi.fn(() => ALL_PROVIDERS)
    const { context } = makeContext()
    registerRouteProviderCheck(context, { listProviders }, defaults, (line) => lines.push(line))
    // One DECISION read for the baseline — never a reporting read at t0.
    expect(listProviders).toHaveBeenCalledTimes(1)
    expect(lines).toEqual([])
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS - 1)
    expect(lines).toEqual([])
    vi.advanceTimersByTime(1)
    expect(listProviders).toHaveBeenCalledTimes(2)
    expect(lines).toEqual([])
  })

  it('a topology change that ADDS no provider only re-arms the quiet fallback', () => {
    const lines: string[] = []
    const { context, emit } = makeContext()
    registerRouteProviderCheck(
      context,
      { listProviders: () => [{ id: 'deepseek-official' }] },
      defaults,
      (line) => lines.push(line),
    )
    emit('llm/adapters-updated') // e.g. a re-registration without the pi-ai route
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS - 1)
    expect(lines).toEqual([])
    vi.advanceTimersByTime(1)
    expect(lines).toEqual([
      '[omo-agents] route provider not registered: deepseek '
      + '(agents: explore, librarian, sisyphus-junior)',
    ])
  })

  it('a GROWTH event reports after the grace period: the settings-driven route counts', () => {
    const lines: string[] = []
    const providers = [{ id: 'deepseek-official' }]
    const { context, emit } = makeContext()
    registerRouteProviderCheck(context, { listProviders: () => providers }, defaults, (l) => lines.push(l))
    // The measured false-positive scenario: at t0 the pi-ai route is absent.
    expect(lines).toEqual([])
    providers.push({ id: 'deepseek' }) // the settings-driven registration lands
    emit('llm/adapters-updated')
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_EVENT_GRACE_MS)
    expect(lines).toEqual([]) // both registered: silent, no false positive
    // The cancelled quiet fallback must not fire a second read.
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS * 2)
    expect(lines).toEqual([])
  })

  it('a GROWTH event with a still-missing route reports after the grace period', () => {
    const lines: string[] = []
    const providers = [{ id: 'deepseek-official' }]
    const { context, emit } = makeContext()
    registerRouteProviderCheck(context, { listProviders: () => providers }, defaults, (l) => lines.push(l))
    providers.push({ id: 'some-unrelated-adapter' }) // growth, but not the route we need
    emit('llm/adapters-updated')
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_EVENT_GRACE_MS)
    expect(lines).toEqual([
      '[omo-agents] route provider not registered: deepseek '
      + '(agents: explore, librarian, sisyphus-junior)',
    ])
  })

  it('runs exactly once: late churn cannot duplicate (or retract) the verdict', () => {
    const lines: string[] = []
    const { context, emit } = makeContext()
    registerRouteProviderCheck(
      context,
      { listProviders: () => [{ id: 'deepseek-official' }] },
      defaults,
      (line) => lines.push(line),
    )
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS)
    expect(lines).toHaveLength(1)
    emit('llm/adapters-updated')
    emit('llm/adapters-updated')
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS * 2)
    expect(lines).toHaveLength(1)
  })

  it('a throwing settled read becomes one FAILED line, never a throw', () => {
    const lines: string[] = []
    const { context } = makeContext()
    expect(() => registerRouteProviderCheck(
      context,
      { listProviders: () => { throw new Error('registry exploded') } },
      defaults,
      (line) => lines.push(line),
    )).not.toThrow()
    expect(() => vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS)).not.toThrow()
    expect(lines).toEqual(['[omo-agents] route provider check FAILED: Error: registry exploded'])
  })

  it('a throwing ctx.on is reported and the fallback still runs the check', () => {
    const lines: string[] = []
    const { context } = makeContext({ throwOnOn: true })
    expect(() => registerRouteProviderCheck(
      context,
      { listProviders: () => [{ id: 'deepseek-official' }] },
      defaults,
      (line) => lines.push(line),
    )).not.toThrow()
    expect(lines).toContain('[omo-agents] route provider listener FAILED: Error: on refused')
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS)
    expect(lines).toContain(
      '[omo-agents] route provider not registered: deepseek '
      + '(agents: explore, librarian, sisyphus-junior)',
    )
  })
})

// ---------------------------------------------------------------------------
// apply() wiring — a structural ctx double (same discipline as
// hard-blocks-injection.test.ts: no dsh dependency, no boot). console.log is
// spied so the real apply() output can be asserted line by line.
// ---------------------------------------------------------------------------

type ApplyContext = Parameters<typeof apply>[0]

interface FakeCtxOptions {
  /** Simulate ctx.inject(['llm']) firing (the service is present). */
  invokeLlm?: boolean
  /** The provider listing that firing callback hands back (mutable per test). */
  providers?: { id: string }[]
  /** Make the llm listing throw once the callback runs. */
  throwInListProviders?: boolean
  /** Make ctx.inject itself throw for the llm dependency. */
  throwOnLlmInject?: boolean
  /**
   * P4.5-T5: fire ctx.inject(['agentPresets']) with this service double.
   * Absent (every pre-T5 test): the callback is registered but never fired —
   * the pre-T5 behavior of this harness, byte-for-byte.
   */
  agentPresets?: {
    list(): Promise<unknown[]>
    register?(definition: unknown): Promise<() => Promise<void>>
  }
}

function makeCtx(options: FakeCtxOptions = {}) {
  const injectCalls: string[][] = []
  const listeners: Array<{ event: string; listener: () => void }> = []
  // P4.5-T5: the agentPresets callback's RETURN value — the disposer cordis
  // collects from a function plugin's return (fiber.ts:366, :373-374 @
  // dsh-v0.2.0-rc.2) — captured so the wiring test pins the CARRIER, not
  // just the log line.
  const agentPresetsResults: unknown[] = []
  const ctx = {
    on: () => () => true,
    inject: (deps: readonly string[], cb: (injected: any) => unknown): void => {
      injectCalls.push([...deps])
      if (deps[0] === 'agentPresets') {
        if (options.agentPresets === undefined) return
        agentPresetsResults.push(cb({ agentPresets: options.agentPresets }))
        return
      }
      if (deps[0] !== 'llm') return
      if (options.throwOnLlmInject) throw new Error('llm inject refused')
      if (!options.invokeLlm) return
      cb({
        llm: {
          listProviders: () => {
            if (options.throwInListProviders) throw new Error('registry exploded')
            return options.providers ?? []
          },
        },
        on: (event: string, listener: () => void) => {
          listeners.push({ event, listener })
          return () => true
        },
      })
    },
  }
  return {
    ctx: ctx as unknown as ApplyContext,
    injectCalls,
    agentPresetsResults,
    emit: (event: string): void => {
      for (const entry of listeners) if (entry.event === event) entry.listener()
    },
  }
}

describe('P2-T16 apply() wiring', () => {
  const logs: string[] = []
  let sandbox: string

  beforeEach(() => {
    logs.length = 0
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(' '))
    })
    // apply() materializes the concerto preset under $DSH_HOME — keep the test
    // hermetic (never touch the developer's real ~/.dsh).
    sandbox = mkdtempSync(join(tmpdir(), 'omo-boot-markers.'))
    vi.stubEnv('DSH_HOME', sandbox)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(sandbox, { recursive: true, force: true })
  })

  it('logs the 10 persona lines, the 11-route summary, and no warning lines', () => {
    const { ctx, injectCalls } = makeCtx({ invokeLlm: true, providers: [...ALL_PROVIDERS] })
    expect(() => apply(ctx)).not.toThrow()
    expect(injectCalls).toContainEqual(['llm'])

    const personaLines = logs.filter((line) => line.includes(' persona assembled: '))
    expect(personaLines).toHaveLength(10)
    expect(personaLines.map((line) => line.split(' persona assembled: ')[0]))
      .toEqual(DELEGATION_IDS.map((id) => `[omo-agents] omo-${id}`))

    const routeLines = logs.filter((line) => line.startsWith(LINE_PREFIX))
    expect(routeLines).toHaveLength(1)
    expect(routeLines[0]).toContain(
      LINE_PREFIX
      + 'sisyphus=deepseek-official/deepseek-v4-pro explore=deepseek/deepseek-v4-flash',
    )
    expect(routeLines[0]!.slice(LINE_PREFIX.length).split(' ')).toHaveLength(11)

    // The settled check runs (and stays silent) before any assertion.
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS)
    expect(logs.some((line) => line.includes('route warning'))).toBe(false)
    expect(logs.some((line) => line.includes('route provider not registered'))).toBe(false)
    expect(logs.some((line) => line.includes('FAILED'))).toBe(false)
    // The conductor marker is a separate, pre-existing line — 11 persona
    // sentinel slots total (10 child + 1 conductor).
    expect(logs).toContainEqual(
      expect.stringContaining('[omo-agents] omo-sisyphus system prompt assembled: '),
    )
  })

  it('logs no provider line and never throws when the llm service never appears', () => {
    const { ctx, injectCalls } = makeCtx({ invokeLlm: false })
    expect(() => apply(ctx)).not.toThrow()
    expect(injectCalls).toContainEqual(['llm']) // the inject was registered...
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS * 2)
    expect(logs.some((line) => line.includes('route provider not registered'))).toBe(false)
    expect(logs.some((line) => line.includes('FAILED'))).toBe(false)
    expect(logs.filter((line) => line.includes(' persona assembled: '))).toHaveLength(10)
  })

  it('does not log a false positive while the settings-driven route is still landing', () => {
    // The measured probe sequence: apply() sees only deepseek-official; pi-ai
    // registers deepseek later via llm/adapters-updated (measured between
    // ~16ms and ~5.8s across runs).
    const providers = [{ id: 'deepseek-official' }]
    const { ctx, emit } = makeCtx({ invokeLlm: true, providers })
    apply(ctx)
    expect(logs.some((line) => line.includes('route provider not registered'))).toBe(false)
    providers.push({ id: 'deepseek' })
    emit('llm/adapters-updated')
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_EVENT_GRACE_MS)
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS * 2)
    expect(logs.some((line) => line.includes('route provider not registered'))).toBe(false)
  })

  it('logs one non-blocking missing-provider line in the real apply() output', () => {
    const { ctx } = makeCtx({ invokeLlm: true, providers: [{ id: 'deepseek-official' }] })
    expect(() => apply(ctx)).not.toThrow()
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS)
    expect(logs).toContain(
      '[omo-agents] route provider not registered: deepseek '
      + '(agents: explore, librarian, sisyphus-junior)',
    )
    expect(logs.some((line) => line.includes('FAILED'))).toBe(false)
  })

  it('a throwing listProviders() logs the FAILED line and apply() still returns', () => {
    const { ctx } = makeCtx({ invokeLlm: true, throwInListProviders: true })
    expect(() => apply(ctx)).not.toThrow()
    vi.advanceTimersByTime(ROUTE_PROVIDER_CHECK_SETTLE_MS)
    expect(logs).toContain('[omo-agents] route provider check FAILED: Error: registry exploded')
    expect(logs.filter((line) => line.includes(' persona assembled: '))).toHaveLength(10)
  })

  it('a throwing ctx.inject is caught: llm inject FAILED, apply() still returns', () => {
    const { ctx } = makeCtx({ throwOnLlmInject: true })
    expect(() => apply(ctx)).not.toThrow()
    expect(logs).toContain('[omo-agents] llm inject FAILED: Error: llm inject refused')
    expect(logs.filter((line) => line.includes(' persona assembled: '))).toHaveLength(10)
  })

  it('keeps the AC-5 FAILED discipline: no summary line, no provider check, no throw', () => {
    vi.stubEnv('OMO_EXPLORE_PROVIDER', 'deepseek-official')
    vi.stubEnv('OMO_EXPLORE_MODEL', 'deepseek-v4-pro')
    const { ctx, injectCalls } = makeCtx({ invokeLlm: true, providers: [...ALL_PROVIDERS] })
    expect(() => apply(ctx)).not.toThrow()
    expect(logs).toContainEqual(expect.stringContaining('[omo-agents] model routes FAILED: '))
    expect(logs.some((line) => line.startsWith(LINE_PREFIX))).toBe(false)
    // The provider check is a function of the routes: with resolution failed,
    // the llm inject is never even registered.
    expect(injectCalls).not.toContainEqual(['llm'])
    // The persona loop still ran: it is independent of route resolution.
    expect(logs.filter((line) => line.includes(' persona assembled: '))).toHaveLength(10)
  })
})

// ---------------------------------------------------------------------------
// P4.5-T5 apply() wiring — the registration outlet fires ONLY inside the
// agentPresets inject callback, and the callback RETURNS the disposer to
// cordis (the type-layer-over-reach carrier of arbitration #4: inject's
// official signature is Plugin.Function<void>, registry.ts:300; the return
// value rides the effect convention of fiber.ts:366-374 — pinned HERE at the
// wiring layer so a refactor that drops the `return` goes red without a boot).
// ---------------------------------------------------------------------------

describe('P4.5-T5 apply() wiring — registration outlet', () => {
  const logs: string[] = []
  let sandbox: string

  beforeEach(() => {
    logs.length = 0
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(' '))
    })
    // apply() materializes the concerto preset under $DSH_HOME — hermetic.
    sandbox = mkdtempSync(join(tmpdir(), 'omo-boot-markers-t5.'))
    vi.stubEnv('DSH_HOME', sandbox)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(sandbox, { recursive: true, force: true })
  })

  it('0.2.x shape: outlet registers inside the inject callback and returns the disposer', async () => {
    const definitions: any[] = []
    let released = 0
    const service = {
      async list() {
        return definitions.map((d) => ({ id: d.id }))
      },
      async register(definition: any) {
        definitions.push(definition)
        const unregister = async (): Promise<void> => {
          released += 1
          definitions.splice(definitions.indexOf(definition), 1)
        }
        return unregister
      },
    }
    const { ctx, injectCalls, agentPresetsResults } = makeCtx({ agentPresets: service })
    expect(() => apply(ctx)).not.toThrow()
    // The callback is registered under exactly ['agentPresets'] (the ONLY
    // sanctioned call site — not a synchronous ctx.get in apply()).
    expect(injectCalls).toContainEqual(['agentPresets'])
    // The outlet ran to success inside the callback: register saw concerto…
    await expect(Promise.all(agentPresetsResults)).resolves.toHaveLength(1)
    expect(definitions.map((d) => d.id)).toContain('concerto')
    // …and the READBACK marker — the success evidence, whole-line.
    expect(logs).toContain('[omo-agents] concerto preset registered: id=concerto broken=absent')
    expect(logs.some((line) => line.includes('register FAILED'))).toBe(false)
    // The callback RETURNED the disposer (the carrier the plan's slot wording
    // was replaced by).
    const returned = await (agentPresetsResults[0] as Promise<unknown>)
    expect(typeof returned).toBe('function')
    await (returned as () => Promise<void>)()
    expect(released).toBe(1)
    expect(definitions).toHaveLength(0)
  })

  it('0.1.5 shape: face absent → face-absent marker, no register, roster line unchanged', async () => {
    const service = {
      async list() {
        return [{ id: 'standard', trust: 'system' }, { id: 'concerto', trust: 'user' }]
      },
    }
    const { ctx, agentPresetsResults } = makeCtx({ agentPresets: service })
    expect(() => apply(ctx)).not.toThrow()
    const returned = await (agentPresetsResults[0] as Promise<unknown>)
    expect(returned).toBeUndefined()
    expect(logs).toContain('[omo-agents] concerto preset register face absent, materialized path only')
    expect(logs.some((line) => line.includes('registered: id=concerto'))).toBe(false)
    expect(logs.some((line) => line.includes('register FAILED'))).toBe(false)
    // P4.5-T6: the roster print no longer consumes `trust`. The mock keeps
    // the 0.1.5 ROW shape (trust present, no `broken` key — that IS what
    // 0.1.5 hands back), and the assertion checks the printed vocabulary:
    // every row prints `id:broken=<verdict>`, and on 0.1.5 that verdict can
    // only ever be `absent` because the row carries no `broken` field at all.
    // The pre-T6 line was `standard:system,concerto:user`; a `trust` token
    // reaching the boot log again is a vocabulary regression, asserted dead.
    expect(logs).toContain('[omo-agents] concerto roster: standard:broken=absent,concerto:broken=absent')
    expect(logs.some((line) => /:system|:user|:\?/.test(line))).toBe(false)
  })

  it('a broken readback surfaces the FAILED marker through the real apply() wiring', async () => {
    const service = {
      async list() {
        return [{ id: 'concerto', broken: 'q3-does-not-exist-package: never started' }]
      },
      async register(definition: any) {
        void definition
        return async (): Promise<void> => {}
      },
    }
    const { ctx, agentPresetsResults } = makeCtx({ agentPresets: service })
    expect(() => apply(ctx)).not.toThrow()
    const returned = await (agentPresetsResults[0] as Promise<unknown>)
    expect(typeof returned).toBe('function')
    expect(logs.some((line) => line.startsWith('[omo-agents] concerto preset register FAILED: '))).toBe(true)
    expect(logs).not.toContain('[omo-agents] concerto preset registered: id=concerto broken=absent')
  })
})
