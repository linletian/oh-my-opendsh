// T14 + P2-T3 — roster-driven model route config module (FR-5, P-2; AC-5
// config half). Asserts all 11 roster routes resolve from the single source,
// per-group env override, loud blank-value failure, the AC-5 pair precheck
// (both directions), and the two NON-BLOCKING plan §4.6 route warnings.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL_ROUTES,
  MODEL_ROUTE_ENV_VARS,
  MODEL_ROUTE_ENV_VAR_NAMES,
  ModelRouteConfigError,
  evaluateModelRouteWarnings,
  resolveModelRoutes,
  resolveModelRoutesWithWarnings,
  type ModelRoute,
  type ModelRoutes,
} from '../../patches/omo-dsh/omo-agents/src/model-routes'
import {
  DELEGATION_TOOL_NAMES,
  ROSTER,
  type AgentId,
} from '../../patches/omo-dsh/omo-agents/src/roster'

/**
 * The plan §4.6 seat map, copied by hand from phase2-roster.md §1 总表 (strong
 * seat 7 agents / fast seat 3 / vision seat 1) — deliberately NOT derived from
 * roster.ts, so this test fails if the roster rows and the documented table
 * ever diverge.
 */
const ROSTER_BASELINE: ReadonlyArray<{ id: string } & ModelRoute> = [
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

/** Roster rows are `RosterEntry[]`, so ids are plain strings; the record is keyed by AgentId. */
const agentId = (id: string): AgentId => id as AgentId

/** Flattened route-by-route view of a resolved map, in roster order. */
function asBaseline(routes: ModelRoutes): Array<{ id: string } & ModelRoute> {
  return ROSTER.map((entry) => ({ id: entry.id, ...routes[agentId(entry.id)] }))
}

/** Every one of the 11 routes set to the same pair. */
function uniformRoutes(route: ModelRoute): ModelRoutes {
  const out: Record<string, ModelRoute> = {}
  for (const entry of ROSTER) out[entry.id] = { ...route }
  return out as ModelRoutes
}

/** Defaults, but every one of the 10 delegation routes moved onto one seat. */
function delegationSeatRoutes(seat: ModelRoute): ModelRoutes {
  const out: Record<string, ModelRoute> = { ...resolveModelRoutes({}) }
  for (const id of DELEGATION_TOOL_NAMES) out[id] = { ...seat }
  return out as ModelRoutes
}

/** Env that pins every route env field of the 10 delegation agents to one seat. */
function delegationSeatEnv(provider: string, model: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const entry of ROSTER) {
    if (entry.id === 'sisyphus') continue
    env[entry.routeEnvVars.provider] = provider
    env[entry.routeEnvVars.model] = model
  }
  return env
}

describe('omo-agents model routes (T14 + P2-T3 roster)', () => {
  it('resolves the documented defaults for all 11 agents when no env vars are set', () => {
    const routes = resolveModelRoutes({})
    expect(asBaseline(routes)).toEqual(ROSTER_BASELINE)
    // The exported defaults are exactly what an empty env resolves to.
    expect(routes).toEqual(DEFAULT_MODEL_ROUTES)
    // The record is keyed by roster id, in roster order — 11 routes, not 2.
    expect(Object.keys(routes)).toEqual(ROSTER.map((entry) => entry.id))
    expect(Object.keys(routes)).toHaveLength(11)
  })

  it('resolves two DIFFERENT {provider,model} pairs for sisyphus and explore by default (AC-5 precheck)', () => {
    const { sisyphus, explore } = resolveModelRoutes({})
    expect(sisyphus.provider).not.toBe(explore.provider)
    expect(sisyphus.model).not.toBe(explore.model)
  })

  it('honors env overrides for every roster group (all 11 pairs, field by field)', () => {
    for (const entry of ROSTER) {
      const routes = resolveModelRoutes({
        [entry.routeEnvVars.provider]: `provider-${entry.id}`,
        [entry.routeEnvVars.model]: `model-${entry.id}`,
      })
      expect(routes[agentId(entry.id)]).toEqual({
        provider: `provider-${entry.id}`,
        model: `model-${entry.id}`,
      })
      // No sibling route is disturbed by another group's override.
      for (const other of ROSTER) {
        if (other.id === entry.id) continue
        expect(routes[agentId(other.id)]).toEqual(other.defaultRoute)
      }
    }
  })

  it('trims whitespace-padded overrides instead of rejecting them', () => {
    const routes = resolveModelRoutes({
      OMO_SISYPHUS_MODEL: '  deepseek-v4-pro  ',
      OMO_EXPLORE_MODEL: '\tdeepseek-v4-flash\n',
      OMO_MULTIMODAL_LOOKER_MODEL: ' deepseek-v4-flash-vision-exp ',
    })
    expect(routes.sisyphus.model).toBe('deepseek-v4-pro')
    expect(routes.explore.model).toBe('deepseek-v4-flash')
    expect(routes['multimodal-looker'].model).toBe('deepseek-v4-flash-vision-exp')
  })

  it('fails LOUD on a set-but-blank override for EVERY route env var, naming the variable', () => {
    for (const envVar of MODEL_ROUTE_ENV_VAR_NAMES) {
      expect(() => resolveModelRoutes({ [envVar]: '   ' }))
        .toThrowError(ModelRouteConfigError)
      expect(() => resolveModelRoutes({ [envVar]: '   ' }))
        .toThrowError(new RegExp(envVar))
    }
  })

  it('AC-5 precheck: identical sisyphus/explore routes fail LOUD (both directions)', () => {
    // Direction 1: the conductor is moved onto the exploration seat.
    expect(() => resolveModelRoutes({
      OMO_SISYPHUS_PROVIDER: 'deepseek',
      OMO_SISYPHUS_MODEL: 'deepseek-v4-flash',
    })).toThrowError(ModelRouteConfigError)
    expect(() => resolveModelRoutes({
      OMO_SISYPHUS_PROVIDER: 'deepseek',
      OMO_SISYPHUS_MODEL: 'deepseek-v4-flash',
    })).toThrowError(/AC-5 precheck failed: sisyphus and explore resolve to the SAME route deepseek\/deepseek-v4-flash/)
    // Direction 2: the exploration seat is moved onto the conductor's route.
    expect(() => resolveModelRoutes({
      OMO_EXPLORE_PROVIDER: 'deepseek-official',
      OMO_EXPLORE_MODEL: 'deepseek-v4-pro',
    })).toThrowError(ModelRouteConfigError)
    // A third agent sharing the conductor's seat is NOT an AC-5 violation.
    const legal = resolveModelRoutes({
      OMO_ORACLE_PROVIDER: 'deepseek',
      OMO_ORACLE_MODEL: 'deepseek-v4-flash',
    })
    expect(legal.oracle).toEqual({ provider: 'deepseek', model: 'deepseek-v4-flash' })
  })

  it('same provider with DIFFERENT models is a legal dual route (pair-level distinctness)', () => {
    const routes = resolveModelRoutes({
      OMO_SISYPHUS_PROVIDER: 'deepseek-official',
      OMO_SISYPHUS_MODEL: 'deepseek-v4-pro',
      OMO_EXPLORE_PROVIDER: 'deepseek-official',
      OMO_EXPLORE_MODEL: 'deepseek-v4-flash',
    })
    expect(routes.sisyphus.model).toBe('deepseek-v4-pro')
    expect(routes.explore.model).toBe('deepseek-v4-flash')
  })

  it('documents one override env pair per roster entry, with the MVP names unchanged', () => {
    expect(Object.keys(MODEL_ROUTE_ENV_VARS)).toEqual(ROSTER.map((entry) => entry.id))
    // The four MVP T14 names are byte-identical (backward compatibility).
    expect(MODEL_ROUTE_ENV_VARS.sisyphus).toEqual({
      provider: 'OMO_SISYPHUS_PROVIDER',
      model: 'OMO_SISYPHUS_MODEL',
    })
    expect(MODEL_ROUTE_ENV_VARS.explore).toEqual({
      provider: 'OMO_EXPLORE_PROVIDER',
      model: 'OMO_EXPLORE_MODEL',
    })
    // The env-var names were driven from the roster rows, not restated.
    for (const entry of ROSTER) {
      expect(MODEL_ROUTE_ENV_VARS[agentId(entry.id)]).toEqual(entry.routeEnvVars)
    }
    // The flattened list is provider/model per row, in roster order.
    expect(MODEL_ROUTE_ENV_VAR_NAMES).toEqual(
      ROSTER.flatMap((entry) => [entry.routeEnvVars.provider, entry.routeEnvVars.model]),
    )
    expect(MODEL_ROUTE_ENV_VAR_NAMES).toHaveLength(22)
  })

  it('emits NO warnings for the default three-seat distribution', () => {
    const { warnings } = resolveModelRoutesWithWarnings({})
    expect(warnings).toEqual([])
    expect(evaluateModelRouteWarnings(resolveModelRoutes({}))).toEqual([])
  })

  it('warning (1): fires iff all 11 routes are the identical pair', () => {
    const seat = { provider: 'same-provider', model: 'same-model' }
    const warnings = evaluateModelRouteWarnings(uniformRoutes(seat))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.code).toBe('all-routes-identical')
    expect(warnings[0]!.route).toEqual(seat)
    expect(warnings[0]!.agentIds).toEqual(ROSTER.map((entry) => entry.id))
    // 10 identical delegation routes + one different conductor is NOT (1).
    const notAll = evaluateModelRouteWarnings(delegationSeatRoutes(seat))
    expect(notAll.map((warning) => warning.code)).not.toContain('all-routes-identical')
    // And the hard gate dominates: an all-identical env never returns routes.
    const allIdenticalEnv: Record<string, string> = {}
    for (const entry of ROSTER) {
      allIdenticalEnv[entry.routeEnvVars.provider] = 'same-provider'
      allIdenticalEnv[entry.routeEnvVars.model] = 'same-model'
    }
    expect(() => resolveModelRoutes(allIdenticalEnv)).toThrowError(/AC-5 precheck failed/)
    expect(() => resolveModelRoutesWithWarnings(allIdenticalEnv)).toThrowError(/AC-5 precheck failed/)
  })

  it('warning (2): fires iff the 10 delegation routes share one seat while sisyphus differs', () => {
    const seat = { provider: 'seat-provider', model: 'seat-model' }
    const warnings = evaluateModelRouteWarnings(delegationSeatRoutes(seat))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.code).toBe('all-delegation-routes-same-seat')
    expect(warnings[0]!.route).toEqual(seat)
    expect(warnings[0]!.agentIds).toEqual([...DELEGATION_TOOL_NAMES])
    // The same condition reached through env overrides on the real resolver.
    const resolved = resolveModelRoutesWithWarnings(delegationSeatEnv(seat.provider, seat.model))
    expect(resolved.warnings).toHaveLength(1)
    expect(resolved.warnings[0]!.code).toBe('all-delegation-routes-same-seat')
    expect(resolved.routes.sisyphus).toEqual(DEFAULT_MODEL_ROUTES.sisyphus)
    // Nine identical delegation seats are not "all 10" — neither warning fires.
    const almost = delegationSeatRoutes(seat)
    const last = DELEGATION_TOOL_NAMES[DELEGATION_TOOL_NAMES.length - 1]!
    const almostMutable = { ...almost } as Record<string, ModelRoute>
    almostMutable[last] = { provider: 'other', model: 'other' }
    expect(evaluateModelRouteWarnings(almostMutable as ModelRoutes)).toEqual([])
  })

  it('keeps the T14 explore/sisyphus log-line property access working', () => {
    // index.ts / concerto-preset.ts / the probe all read these two properties.
    const routes = resolveModelRoutes({})
    expect(`${routes.sisyphus.provider}/${routes.sisyphus.model}`)
      .toBe('deepseek-official/deepseek-v4-pro')
    expect(`${routes.explore.provider}/${routes.explore.model}`)
      .toBe('deepseek/deepseek-v4-flash')
    expect(resolveModelRoutes({}).explore).toEqual(DEFAULT_MODEL_ROUTES.explore)
  })
})
