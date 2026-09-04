// model-routes.ts — T14 dual {provider,model} routes (FR-5, P-2; AC-5 config
// half). One config module is the SINGLE source of truth for which
// {provider, model} pair the omo-sisyphus conductor and the omo-explore
// subagent each run on; later todos consume it: T11 binds
// `agentOptions: routes.explore` into the omo-explore dsh-tool-subagent
// instance config, T15/T20 assert the resolved routes in session logs (those
// verification records live in gitignored local-run logs under .omo/evidence/;
// the durable record is docs/mvp-pitfalls.md P-7).
//
// DESIGN CHOICE (plan T14 step 2, evaluated honestly):
//  (a) Route literals in the concerto composition / root cordis.yml —
//      REJECTED for T14 scope. The per-agent binding lives on the
//      dsh-tool-subagent INSTANCE config (`agentOptions`), which is T11's
//      deliverable in the same wave (blocked by T10); writing YAML literals
//      now would fork a second source of truth T11 must reconcile, and the
//      root --patch cannot override bundle-layer rows anyway (P-8: a plain
//      `- id:` override is skipped against the always-empty profile root).
//      A YAML literal also has no parse layer, so the AC-5 "pairs MUST
//      differ" precheck would have nowhere to live.
//  (b) THIS module — env-overridable, documented defaults, validated at
//      resolve time. The boot-level probe (scripts/concerto-mode-probe.sh)
//      resolves these same values through `node` type-stripping, so the
//      script layer shares this source of truth instead of restating it.
//
// PROVIDERS (decision Q-3: DSH built-in adapters only, zero new adapters):
//  - sisyphus rides the `dsh-llm-deepseek` adapter's shipped route
//    `deepseek-official` — registered from the base composition's entry
//    config in every shipped profile (no key needed for REGISTRATION;
//    credentials resolve per request).
//  - explore rides the `dsh-llm-pi-ai` adapter's catalog route `deepseek`
//    (pi-ai ships deepseek-v4-pro / deepseek-v4-flash on
//    https://api.deepseek.com, openai-completions + deepseek thinking
//    dialect). The shipped composition mounts llm-pi-ai DORMANT (zero
//    routes): the route registers when a settings profile supplies it —
//    `$DSH_HOME/settings.yaml`:
//      llm-pi-ai:
//        providers:
//          deepseek:
//            apiKeyEnv: DEEPSEEK_API_KEY
//    Registration is keyless (a missing key fails the REQUEST with
//    MISSING_CREDENTIAL, never the boot). The probe writes exactly this
//    section into its sandbox and asserts both routes `active:true` over
//    POST /api/llm.providers.
//
// P-2 (agentOptions override of parent inheritance) source-level verdict:
//  CONFIRMED for in-process children. `dsh-tool-subagent` forwards
//  `config.agentOptions` verbatim into the start request
//  (tool-subagent/src/index.ts:383); both in-process child paths — one-shot
//  (subagent-in-process-driver/src/index.ts:136) and continuable
//  (subagent/src/continuation.ts:444) — resolve the child route through
//  `resolveChildAgentOptions` (subagent/src/child-agent.ts:68-83), which
//  spreads the parent's route first and `...requested` LAST, so an explicit
//  {provider,model} wins over inheritance. DSH's own runtime test
//  (subagent/tests/continuation.spec.ts:2258 "reapplies the descriptor model
//  route on cold resume") asserts `child.options.model === 'child-model'`
//  after resume. What remains for T15/T20: the same observation under OUR
//  composition on the installed rc.6 with the real adapters.

/** One {provider, model} pair — the route a single agent's requests take. */
export interface ModelRoute {
  /** Provider route; must have a registered LLM adapter at call time. */
  readonly provider: string
  /** Model id interpreted by the selected provider adapter. */
  readonly model: string
}

/** The two MVP routes: conductor (omo-sisyphus) and subagent (omo-explore). */
export interface ModelRoutes {
  readonly sisyphus: ModelRoute
  readonly explore: ModelRoute
}

/** Environment variables that override the defaults, one per field. */
export const MODEL_ROUTE_ENV_VARS = {
  sisyphusProvider: 'OMO_SISYPHUS_PROVIDER',
  sisyphusModel: 'OMO_SISYPHUS_MODEL',
  exploreProvider: 'OMO_EXPLORE_PROVIDER',
  exploreModel: 'OMO_EXPLORE_MODEL',
} as const

/**
 * Documented defaults (Q-3). sisyphus: the llm-deepseek adapter's shipped
 * `deepseek-official` route on the strong model (orchestration seat).
 * explore: the llm-pi-ai adapter's catalog route `deepseek` on the fast
 * model (exploration seat); the deployment registers that route through the
 * `llm-pi-ai:` settings section documented in this file's header.
 */
export const DEFAULT_MODEL_ROUTES: ModelRoutes = {
  sisyphus: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  explore: { provider: 'deepseek', model: 'deepseek-v4-flash' },
}

/** Loud configuration failure: blank value or the AC-5 same-route violation. */
export class ModelRouteConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelRouteConfigError'
  }
}

/** Minimal env shape — `process.env`-compatible, injectable for tests. */
export type ModelRouteEnv = { readonly [key: string]: string | undefined }

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

/**
 * Resolve the two agent routes: env vars win over the documented defaults,
 * values are trimmed, and the result is validated loudly —
 *  1. a set-but-blank override throws naming the offending variable;
 *  2. the AC-5 precheck: sisyphus and explore MUST resolve to two DIFFERENT
 *     {provider,model} pairs (FR-5 dual routing). Pair-distinctness is
 *     compared on provider+model together: same provider with different
 *     models is a legal dual route; the identical pair is the failure.
 * @param env - environment to read (defaults to `process.env`).
 * @returns the two validated, distinct routes.
 * @throws {ModelRouteConfigError} on blank values or identical pairs.
 */
export function resolveModelRoutes(env: ModelRouteEnv = process.env): ModelRoutes {
  const routes: ModelRoutes = {
    sisyphus: {
      provider: readRouteField(env, MODEL_ROUTE_ENV_VARS.sisyphusProvider, DEFAULT_MODEL_ROUTES.sisyphus.provider),
      model: readRouteField(env, MODEL_ROUTE_ENV_VARS.sisyphusModel, DEFAULT_MODEL_ROUTES.sisyphus.model),
    },
    explore: {
      provider: readRouteField(env, MODEL_ROUTE_ENV_VARS.exploreProvider, DEFAULT_MODEL_ROUTES.explore.provider),
      model: readRouteField(env, MODEL_ROUTE_ENV_VARS.exploreModel, DEFAULT_MODEL_ROUTES.explore.model),
    },
  }
  if (
    routes.sisyphus.provider === routes.explore.provider
    && routes.sisyphus.model === routes.explore.model
  ) {
    throw new ModelRouteConfigError(
      `AC-5 precheck failed: sisyphus and explore resolve to the SAME route `
      + `${formatRoute(routes.sisyphus)} — dual model routing (FR-5) requires two distinct `
      + `{provider,model} pairs; check the ${Object.values(MODEL_ROUTE_ENV_VARS).join('/')} overrides`,
    )
  }
  return routes
}
