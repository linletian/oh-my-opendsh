// model-routes.ts — Phase 2 roster-driven {provider,model} routes (plan §4.2 /
// §4.6; task P2-T3). This module is the SINGLE resolution/validation point for
// which {provider, model} pair each of the 11 OMO agents runs on; the per-agent
// VALUES live in roster.ts (P2-T2) and are only resolved here, so there is no
// second list to reconcile. Consumers: concerto-preset.ts binds
// `agentOptions: routes.explore` into the explore dsh-tool-subagent instance
// (T11), index.ts logs the conductor + exploration seats at boot, and
// scripts/concerto-mode-probe.sh, scripts/doctor-lite.mjs,
// scripts/prove-route-logging.mjs, scripts/smoke-real.mjs and tests/e2e/drive.mjs
// resolve the same values through Node 24 type-stripping (P-8.6) — the script
// layer shares this source of truth instead of restating it.
//
// RETURN SHAPE (P2-T3; chosen for backward compatibility). resolveModelRoutes()
// returns `ModelRoutes = Record<AgentId, ModelRoute>` — a plain object keyed by
// roster id, in roster order. Property access (`routes.sisyphus`,
// `routes.explore`) is unchanged, which is why every consumer written against
// the T14 two-route shape keeps working with no edits. DEFAULT_MODEL_ROUTES and
// MODEL_ROUTE_ENV_VARS are derived from ROSTER — the roster-order env-name list
// MODEL_ROUTE_ENV_VAR_NAMES is derived too, so the loud error message names all
// 22 override variables without forking a list.
//
// VALIDATION (plan §4.6):
//  1. a set-but-blank override throws naming the offending variable (unchanged
//     T14 discipline);
//  2. the AC-5 HARD precheck stays: sisyphus and explore MUST resolve to two
//     DIFFERENT {provider,model} pairs. Comparison is pair-level, so same
//     provider + different model is a legal dual route; only the identical pair
//     fails. This is the semantic core of "协奏必须真是双模型" and survives the
//     seat model (strong seat vs fast seat are distinct by construction).
//  3. Two NON-BLOCKING warnings (never thrown), returned alongside the routes
//     by `resolveModelRoutesWithWarnings` / computed by the pure
//     `evaluateModelRouteWarnings`, for index.ts to log in P2-T16:
//       (1) `all-routes-identical` — all 11 routes resolve to one identical
//           {provider,model} pair;
//       (2) `all-delegation-routes-same-seat` — all 10 delegation routes share
//           one identical seat while the conductor differs (single-seat
//           concentration among the delegation targets).
//     Warning (1) subsumes (2): when all 11 are identical only (1) is reported,
//     so warning (2)'s exact condition is "the 10 delegation routes are
//     identical but sisyphus differs".
//     HONEST CAVEAT: warning (1) is unreachable through resolveModelRoutes,
//     because all-11-identical implies sisyphus === explore and the AC-5
//     precheck throws first. It remains a pure function of a resolved map — so
//     it is testable, usable on any future roster-level config surface, and
//     ready if the precheck is ever relaxed — and it is kept deliberately as the
//     defensive check the plan §4.6 asks for.
//
// PROVIDERS (decision Q-3: DSH built-in adapters only, zero new adapters) —
// the plan §4.6 three-seat map, with the OMO chain-head knowledge recorded per
// row in roster.ts (chains are NOT ported as runtime fallback: DSH has no
// fallback, `model-unavailable` is an error — plan §4.6):
//  - STRONG seat `deepseek-official / deepseek-v4-pro` (7 agents: sisyphus,
//    hephaestus, oracle, plan-consultant, plan-reviewer, atlas, prometheus)
//    rides the `dsh-llm-deepseek` adapter's shipped route `deepseek-official` —
//    registered from the base composition's entry config in every shipped
//    profile (no key needed for REGISTRATION; credentials resolve per request).
//  - FAST seat `deepseek / deepseek-v4-flash` (3 agents: explore, librarian,
//    sisyphus-junior) rides the `dsh-llm-pi-ai` adapter's catalog route
//    `deepseek` (pi-ai ships deepseek-v4-pro / deepseek-v4-flash on
//    https://api.deepseek.com, openai-completions + deepseek thinking dialect).
//    The shipped composition mounts llm-pi-ai DORMANT (zero routes): the route
//    registers when a settings profile supplies it —
//    `$DSH_HOME/settings.yaml`:
//      llm-pi-ai:
//        providers:
//          deepseek:
//            apiKeyEnv: DEEPSEEK_API_KEY
//    Registration is keyless (a missing key fails the REQUEST with
//    MISSING_CREDENTIAL, never the boot). The probe writes exactly this section
//    into its sandbox and asserts the routes `active:true` over
//    POST /api/llm.providers.
//  - VISION seat `deepseek-official / deepseek-v4-flash-vision-exp`
//    (multimodal-looker) — the id exists in BOTH catalogs (dsh-llm-deepseek
//    DEFAULT_MODELS, `inputModalities:["text","image"]`, and the pi-ai builtin
//    deepseek catalog). The default provider is deepseek-official because that
//    adapter is registered by the base composition in every profile with no
//    settings dependency (roster §2.8; plan §6 R-4 — a fallback must also land
//    on the already-registered side).
//
// P-2 (agentOptions override of parent inheritance) source-level verdict still
// stands: CONFIRMED for in-process children. `dsh-tool-subagent` forwards
// `config.agentOptions` verbatim into the start request
// (tool-subagent/src/index.ts:383); both in-process child paths — one-shot
// (subagent-in-process-driver/src/index.ts:136) and continuable
// (subagent/src/continuation.ts:444) — resolve the child route through
// `resolveChildAgentOptions` (subagent/src/child-agent.ts:68-83), which spreads
// the parent's route first and `...requested` LAST, so an explicit
// {provider,model} wins over inheritance. DSH's own runtime test
// (subagent/tests/continuation.spec.ts:2258 "reapplies the descriptor model
// route on cold resume") asserts `child.options.model === 'child-model'` after
// resume.

import { ALL_AGENT_IDS, DELEGATION_TOOL_NAMES, ROSTER } from './roster.ts'
import type { AgentId, RosterEntry, RouteEnvVars } from './roster.ts'

/** One {provider, model} pair — the route a single agent's requests take. */
export interface ModelRoute {
  /** Provider route; must have a registered LLM adapter at call time. */
  readonly provider: string
  /** Model id interpreted by the selected provider adapter. */
  readonly model: string
}

/**
 * Every agent's resolved route, keyed by roster id, in roster order. A mapped
 * type keeps the property-access ergonomics of the T14 two-route interface
 * (`routes.explore`) while covering all 11 agents.
 */
export type ModelRoutes = { readonly [Id in AgentId]: ModelRoute }

/**
 * The per-agent override env pairs, keyed by roster id and derived from the
 * roster rows (single source). The MVP T14 names — OMO_SISYPHUS_PROVIDER /
 * OMO_SISYPHUS_MODEL / OMO_EXPLORE_PROVIDER / OMO_EXPLORE_MODEL — come out
 * byte-identical from these same rows (backward compatibility).
 */
export const MODEL_ROUTE_ENV_VARS: { readonly [Id in AgentId]: RouteEnvVars } =
  keyByAgentId((entry) => entry.routeEnvVars)

/**
 * The same names flattened in roster order (provider then model per row) —
 * used by the loud AC-5 error message and by callers that need one list.
 */
export const MODEL_ROUTE_ENV_VAR_NAMES: readonly string[] = ROSTER.flatMap(
  (entry) => [entry.routeEnvVars.provider, entry.routeEnvVars.model],
)

/**
 * Documented defaults (plan §4.6 three seats), derived from the roster rows so
 * the per-agent OMO chain-head comments and the resolver cannot drift.
 */
export const DEFAULT_MODEL_ROUTES: ModelRoutes = keyByAgentId((entry) => entry.defaultRoute)

/** Loud configuration failure: blank value or the AC-5 same-route violation. */
export class ModelRouteConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelRouteConfigError'
  }
}

/** Minimal env shape — `process.env`-compatible, injectable for tests. */
export type ModelRouteEnv = { readonly [key: string]: string | undefined }

/**
 * Builds a per-agent record from the roster. The loop visits every row exactly
 * once, so every AgentId key is present; the localized assertion records that
 * invariant (roster.ts is the only author of AgentId).
 */
function keyByAgentId<T>(select: (entry: RosterEntry) => T): { readonly [Id in AgentId]: T } {
  const out: Record<string, T> = {}
  for (const entry of ROSTER) out[entry.id] = select(entry)
  return out as { readonly [Id in AgentId]: T }
}

function readRouteField(
  env: ModelRouteEnv,
  envVar: string,
  fallback: string,
): string {
  const raw = env[envVar]
  if (raw === undefined) return fallback
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    throw new ModelRouteConfigError(
      `${envVar} is set but blank — unset it to use the default ("${fallback}") `
      + 'or give it a non-empty value',
    )
  }
  return trimmed
}

function formatRoute(route: ModelRoute): string {
  return `${route.provider}/${route.model}`
}

function sameRoute(a: ModelRoute, b: ModelRoute): boolean {
  return a.provider === b.provider && a.model === b.model
}

/**
 * Resolve all 11 roster routes: env vars win over the roster defaults, values
 * are trimmed, and the result is validated loudly —
 *  1. a set-but-blank override throws naming the offending variable;
 *  2. the AC-5 precheck: sisyphus and explore MUST resolve to two DIFFERENT
 *     {provider,model} pairs (FR-5 dual routing). Pair-distinctness is compared
 *     on provider+model together: same provider with different models is a legal
 *     dual route; the identical pair is the failure.
 * Non-blocking route-value warnings are computed separately
 * (`evaluateModelRouteWarnings`) so this function's contract stays "throw on
 * misconfiguration, return routes otherwise".
 * @param env - environment to read (defaults to `process.env`).
 * @returns all 11 validated routes, keyed by roster id.
 * @throws {ModelRouteConfigError} on blank values or the identical AC-5 pair.
 */
export function resolveModelRoutes(env: ModelRouteEnv = process.env): ModelRoutes {
  const routes: ModelRoutes = keyByAgentId((entry) => ({
    provider: readRouteField(env, entry.routeEnvVars.provider, entry.defaultRoute.provider),
    model: readRouteField(env, entry.routeEnvVars.model, entry.defaultRoute.model),
  }))
  if (sameRoute(routes.sisyphus, routes.explore)) {
    // Message shape (PR-review fix): the pinned prefix stays BYTE-STABLE
    // (tests/consumers match it), then the ACTIONABLE hint leads with the two
    // env pairs that can actually clash — the sisyphus pair and the explore
    // pair — and only the full 22-name list is demoted to a trailing
    // diagnostic line, so the hint is not diluted by 22 env names.
    const sisyphusEnvPair = MODEL_ROUTE_ENV_VARS.sisyphus
    const exploreEnvPair = MODEL_ROUTE_ENV_VARS.explore
    throw new ModelRouteConfigError(
      `AC-5 precheck failed: sisyphus and explore resolve to the SAME route `
      + `${formatRoute(routes.sisyphus)} — dual model routing (FR-5) requires two distinct `
      + `{provider,model} pairs; check the two clashing override pairs first: `
      + `${sisyphusEnvPair.provider}/${sisyphusEnvPair.model} vs `
      + `${exploreEnvPair.provider}/${exploreEnvPair.model}; `
      + `all available overrides for diagnosis: ${MODEL_ROUTE_ENV_VAR_NAMES.join('/')}`,
    )
  }
  return routes
}

/** The two non-blocking route-value warning codes of plan §4.6. */
export type ModelRouteWarningCode =
  | 'all-routes-identical'
  | 'all-delegation-routes-same-seat'

/**
 * One non-blocking route-value warning. `agentIds` are the rows the warning is
 * about (roster order) and `route` is the one pair they all resolved to — the
 * boot log (P2-T16) renders both without touching live objects.
 */
export interface ModelRouteWarning {
  readonly code: ModelRouteWarningCode
  readonly message: string
  readonly agentIds: readonly AgentId[]
  readonly route: ModelRoute
}

/** The one route shared by every entry of `routes`, or undefined if they differ. */
function uniformRoute(routes: readonly ModelRoute[]): ModelRoute | undefined {
  const first = routes[0]
  if (first === undefined) return undefined
  return routes.every((route) => sameRoute(route, first)) ? first : undefined
}

/**
 * Evaluates the two plan §4.6 route-value warnings against a resolved map.
 * PURE and NON-THROWING by contract — this never becomes a boot failure; the
 * only hard gate remains the AC-5 precheck in `resolveModelRoutes`.
 *
 *  (1) all 11 routes identical → `all-routes-identical`. When it fires it is
 *      the only warning returned, because it strictly subsumes (2); that is what
 *      makes (2)'s condition "10 delegation routes identical BUT sisyphus
 *      differs".
 *  (2) otherwise, all 10 delegation routes identical → 
 *      `all-delegation-routes-same-seat` (e.g. every delegation target pinned to
 *      the strong seat: legal under the seat model, worth surfacing).
 *
 * @param routes - a fully resolved route map (see `resolveModelRoutes`).
 * @returns zero or one warning, in the order above.
 */
export function evaluateModelRouteWarnings(routes: ModelRoutes): readonly ModelRouteWarning[] {
  const allSeat = uniformRoute(ALL_AGENT_IDS.map((id) => routes[id]))
  if (allSeat !== undefined) {
    return [{
      code: 'all-routes-identical',
      agentIds: [...ALL_AGENT_IDS],
      route: allSeat,
      message: `all ${ALL_AGENT_IDS.length} roster routes resolve to ${formatRoute(allSeat)} `
        + '— the roster is not exercising independently overridable routes (plan §4.6 warning 1)',
    }]
  }
  const delegationSeat = uniformRoute(DELEGATION_TOOL_NAMES.map((id) => routes[id]))
  if (delegationSeat === undefined) return []
  return [{
    code: 'all-delegation-routes-same-seat',
    agentIds: [...DELEGATION_TOOL_NAMES],
    route: delegationSeat,
    message: `all ${DELEGATION_TOOL_NAMES.length} delegation agents resolve to `
      + `${formatRoute(delegationSeat)} — single-seat concentration among the delegation `
      + 'targets (plan §4.6 warning 2)',
  }]
}

/** Routes plus the non-blocking warnings they produced (boot-log shape). */
export interface ResolvedModelRoutes {
  readonly routes: ModelRoutes
  readonly warnings: readonly ModelRouteWarning[]
}

/**
 * The "routes alongside warnings" entry point for the boot path (index.ts
 * consumes the warnings in P2-T16). Delegates the hard validation to
 * `resolveModelRoutes`, so a misconfiguration still throws and no warning can
 * mask it.
 */
export function resolveModelRoutesWithWarnings(
  env: ModelRouteEnv = process.env,
): ResolvedModelRoutes {
  const routes = resolveModelRoutes(env)
  return { routes, warnings: evaluateModelRouteWarnings(routes) }
}
