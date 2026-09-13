// roster.ts — Phase 2 SINGLE source of truth for the 11-agent roster
// (docs/plans/phase2-dev/phase2-plan.md §4.1/§4.2/§4.4/§4.6; task P2-T2;
// data table docs/plans/phase2-dev/phase2-roster.md §1 总表).
//
// WHY THIS FILE EXISTS (plan §4.2). Before Phase 2 the roster knowledge was
// smeared across three places: model-routes.ts hardcoded {sisyphus, explore},
// concerto-preset.ts had an explore-only renderer, and the concerto template
// YAML carried explore-only sentinels. Scaling to 11 agents would have
// reproduced that per-agent hardcoding ten times. Everything per-agent that
// more than one module needs — id (== toolName == persona basename), persona
// markdown file, route env override pair, default route, mirror class,
// maxDepth, allowlist, write capability, delegation-target flag — is declared
// ONCE here; every consumer derives from these rows.
//
// THE ONE SHAPE DECISION — sisyphus is ROUTE-ONLY. The conductor is the
// main-session persona (the concerto preset's persona row), NOT a
// dsh-tool-subagent instance, so it is not one of the 10 delegation tools. Its
// route is nevertheless part of this single source (11 routes; the delegation
// rows consume 10) per plan §4.2. That is expressed as a FIELD on the row —
// `delegation: false` — chosen over a separate exported constant so that "all
// 11 routes" stays ONE array and no consumer can silently forget the
// conductor's route. The conductor row carries no `class` / `maxDepth` /
// `personaFile`: phase2-roster.md §1 总表 records those cells as `—` (it is
// neither a read-only/worker/orchestrator/allowlist child nor a single persona
// markdown file — its prompt is assembled from SISYPHUS_SECTION_ORDER). Those
// three fields are therefore OPTIONAL on `RosterEntry`; on the 10 delegation
// rows they are present and load-bearing (see `isDelegationEntry`, and
// `denyToolNamesFor`, which throws if a delegation row is missing its class
// rather than silently rendering a filter-less child).
//
// ORDER IS SEMANTIC. ROSTER is ordered exactly like phase2-roster.md §1 总表
// (sisyphus, explore, hephaestus, oracle, librarian, plan-consultant,
// plan-reviewer, atlas, multimodal-looker, sisyphus-junior, prometheus).
// `DELEGATION_TOOL_NAMES` is derived in that order, so the deny-sentinel
// renderer (P2-T15) and the static assertions (P2-T20) emit a stable list.
// (The illustrative deny flow-sequence printed in roster §1's "deny 列表"
// block happens to reorder the same 10 names; plan §4.4 requires that list to
// be COMPUTED from this module, so the derived roster order above is
// authoritative rather than the printed example — the two lists are equal as
// sets.)
//
// The `import type` below is erased by Node 24 type-stripping, so model-routes.ts
// may import this module at runtime without creating an import cycle.

import type { ModelRoute } from './model-routes.ts'

/**
 * The four tool-filter mirror classes of plan §4.4, mapping the OMO
 * `permission` semantics onto the DSH `dsh-tool-subagent` `toolFilter`.
 */
export type AgentClass = 'read-only' | 'worker' | 'orchestrator' | 'allowlist'

/**
 * One `OMO_<AGENT>_{PROVIDER,MODEL}` override pair. Names are literal below
 * (not computed) because phase2-roster.md §1 总表 lists them per row and they
 * are the deployment's documented configuration surface; roster.test.ts pins
 * them against the `id.toUpperCase().replaceAll('-', '_')` rule as well.
 */
export interface RouteEnvVars {
  readonly provider: string
  readonly model: string
}

/**
 * One row of the roster (plan §4.2). `class`, `maxDepth` and `personaFile`
 * are optional ONLY for the route-only conductor row (see header); every
 * delegation row declares them.
 */
export interface RosterEntry {
  /** 'oracle' — simultaneously the DSH toolName and the persona file basename. */
  readonly id: string
  /** 'oracle-persona.md' under system-sections/ (absent on the conductor row). */
  readonly personaFile?: string
  /** The per-field env override pair, e.g. OMO_ORACLE_PROVIDER / OMO_ORACLE_MODEL. */
  readonly routeEnvVars: RouteEnvVars
  /** The plan §4.6 seat default; the per-row comment names the OMO chain head. */
  readonly defaultRoute: ModelRoute
  /** The plan §4.4 mirror class (absent on the conductor row). */
  readonly class?: AgentClass
  /** orchestrator (atlas) = 2; every other row = 1 (absent on the conductor). */
  readonly maxDepth?: 1 | 2
  /** Only multimodal-looker: ['read', 'read_image'] (plan §4.4 H-1 mapping). */
  readonly allowTools?: readonly string[]
  /** worker + orchestrator = true; read-only / allowlist = false (plan §4.2). */
  readonly writeCapable: boolean
  /** true for the 10 `dsh-tool-subagent` targets; false for the conductor. */
  readonly delegation: boolean
}

/**
 * The 11-row roster, in phase2-roster.md §1 总表 order. Seat defaults are the
 * plan §4.6 three-seat map (strong / fast / vision); the default distribution
 * intentionally COALESCES (7 strong, 3 fast, 1 vision) — "independent route"
 * means independently overridable, not default-distinct (plan §5 "明确不属于
 * 退出标准"). `as const satisfies` keeps the literal ids for `AgentId` while
 * still checking the shape against RosterEntry.
 */
const ROSTER_ROWS = [
  {
    id: 'sisyphus',
    // Route-only conductor row (see header): no personaFile / class / maxDepth.
    routeEnvVars: { provider: 'OMO_SISYPHUS_PROVIDER', model: 'OMO_SISYPHUS_MODEL' },
    // STRONG seat — deepseek-official / deepseek-v4-pro. OMO chain-head
    // reference: the conductor sits on the strong row of plan §4.6 ("claude-opus-5
    // / gpt-5.6-sol 系"); this is the pre-existing MVP T14 conductor route and is
    // UNCHANGED, including its env names (backward compatibility).
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    writeCapable: true,
    delegation: false,
  },
  {
    id: 'explore',
    personaFile: 'explore-persona.md',
    routeEnvVars: { provider: 'OMO_EXPLORE_PROVIDER', model: 'OMO_EXPLORE_MODEL' },
    // FAST seat — deepseek (llm-pi-ai catalog route) / deepseek-v4-flash. OMO
    // chain head (roster §2.1 + plan §4.6): the "gpt-5.6-luna-fast /
    // deepseek-v4-flash 系" fast row for read-only retrieval. Pre-existing MVP
    // T14 exploration seat, UNCHANGED (env names included).
    defaultRoute: { provider: 'deepseek', model: 'deepseek-v4-flash' },
    class: 'read-only',
    maxDepth: 1,
    writeCapable: false,
    delegation: true,
  },
  {
    id: 'hephaestus',
    personaFile: 'hephaestus-persona.md',
    routeEnvVars: { provider: 'OMO_HEPHAESTUS_PROVIDER', model: 'OMO_HEPHAESTUS_MODEL' },
    // STRONG seat — frontier autonomous deep worker. OMO chain head (roster
    // §2.2, AGENT_MODEL_REQUIREMENTS direct read): `gpt-5.6-sol medium` only,
    // requiresProvider openai/copilot/opencode/vercel — a top reasoning seat,
    // so DeepSeek's strong model (R1: DeepSeek-family first; the requiresProvider
    // gate is deliberately not ported).
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    class: 'worker',
    maxDepth: 1,
    writeCapable: true,
    delegation: true,
  },
  {
    id: 'oracle',
    personaFile: 'oracle-persona.md',
    routeEnvVars: { provider: 'OMO_ORACLE_PROVIDER', model: 'OMO_ORACLE_MODEL' },
    // STRONG seat — read-only high-IQ architecture/debug advisor. OMO chain
    // head (roster §2.3): gpt-5.6-sol xhigh → gemini-3.1-pro high →
    // claude-opus-5 max → glm-5.2; a max-effort advisor belongs on the strong seat.
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    class: 'read-only',
    maxDepth: 1,
    writeCapable: false,
    delegation: true,
  },
  {
    id: 'librarian',
    personaFile: 'librarian-persona.md',
    routeEnvVars: { provider: 'OMO_LIBRARIAN_PROVIDER', model: 'OMO_LIBRARIAN_MODEL' },
    // FAST seat — documentation / OSS source search. OMO chain head (roster
    // §2.4): gpt-5.6-luna-fast low → deepseek-v4-flash → qwen3.7-plus → …;
    // the upstream chain already contains deepseek-v4-flash, so the fast seat is
    // the same direction (cheap exploration volume).
    defaultRoute: { provider: 'deepseek', model: 'deepseek-v4-flash' },
    class: 'read-only',
    maxDepth: 1,
    writeCapable: false,
    delegation: true,
  },
  {
    id: 'plan-consultant',
    personaFile: 'plan-consultant-persona.md',
    routeEnvVars: { provider: 'OMO_PLAN_CONSULTANT_PROVIDER', model: 'OMO_PLAN_CONSULTANT_MODEL' },
    // STRONG seat — pre-plan gap analysis (OMO v4 name: metis). OMO chain head
    // (roster §2.5): claude-opus-5 high → kimi-k3 low; finding hidden intent and
    // AI failure points is a reasoning task, so the strong seat.
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    class: 'read-only',
    maxDepth: 1,
    writeCapable: false,
    delegation: true,
  },
  {
    id: 'plan-reviewer',
    personaFile: 'plan-reviewer-persona.md',
    routeEnvVars: { provider: 'OMO_PLAN_REVIEWER_PROVIDER', model: 'OMO_PLAN_REVIEWER_MODEL' },
    // STRONG seat — plan review (OMO v4 name: momus). OMO chain head (roster
    // §2.6): gpt-5.6-terra high → gpt-5.6-sol xhigh; adversarial review rigor
    // is a strong-seat task (ROADMAP names plan-reviewer as the read-only exemplar).
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    class: 'read-only',
    maxDepth: 1,
    writeCapable: false,
    delegation: true,
  },
  {
    id: 'atlas',
    personaFile: 'atlas-persona.md',
    routeEnvVars: { provider: 'OMO_ATLAS_PROVIDER', model: 'OMO_ATLAS_MODEL' },
    // STRONG seat — todo-execution orchestrator (the only sub-agent that keeps
    // the delegation tools). OMO chain head (roster §2.7): claude-sonnet-5 →
    // kimi-k3 → gpt-5.6-sol medium → minimax-m3; orchestration quality justifies
    // the strong seat. maxDepth 2 is the structural expression of that role.
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    class: 'orchestrator',
    maxDepth: 2,
    writeCapable: true,
    delegation: true,
  },
  {
    id: 'multimodal-looker',
    personaFile: 'multimodal-looker-persona.md',
    routeEnvVars: { provider: 'OMO_MULTIMODAL_LOOKER_PROVIDER', model: 'OMO_MULTIMODAL_LOOKER_MODEL' },
    // VISION seat — deepseek-official / deepseek-v4-flash-vision-exp, the only
    // route whose catalog entry advertises image input (inputModalities
    // ["text","image"]). OMO chain head (roster §2.8): gpt-5.6-sol low →
    // kimi-k3 → glm-4.6v → gpt-5-nano. The id exists in BOTH catalogs; the
    // default provider is deepseek-official because it is registered by the base
    // composition in every profile with no settings dependency (plan §6 R-4).
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp' },
    class: 'allowlist',
    maxDepth: 1,
    // Plan §4.4 H-1 mapping: OMO's single `read` splits in DSH into `read`
    // (UTF-8 text) + `read_image` (conditionally registered by dsh-tool-fs while
    // `attachments` is mounted — inherited by concerto children). `allow: [read]`
    // alone would hide `read_image` and close the vision entry point.
    allowTools: ['read', 'read_image'],
    writeCapable: false,
    delegation: true,
  },
  {
    id: 'sisyphus-junior',
    personaFile: 'sisyphus-junior-persona.md',
    routeEnvVars: { provider: 'OMO_SISYPHUS_JUNIOR_PROVIDER', model: 'OMO_SISYPHUS_JUNIOR_MODEL' },
    // FAST seat — focused executor without delegation rights (volume work). OMO
    // chain head (roster §2.9): the atlas chain plus a big-pickle fallback; as a
    // category-worker successor it is throughput-oriented, so the fast seat.
    defaultRoute: { provider: 'deepseek', model: 'deepseek-v4-flash' },
    class: 'worker',
    maxDepth: 1,
    writeCapable: true,
    delegation: true,
  },
  {
    id: 'prometheus',
    personaFile: 'prometheus-persona.md',
    routeEnvVars: { provider: 'OMO_PROMETHEUS_PROVIDER', model: 'OMO_PROMETHEUS_MODEL' },
    // STRONG seat — interview-style strategic planning (as a delegation target
    // its interviewer becomes the conductor, see roster §2.10). OMO chain head
    // (roster §2.10): claude-fable-5 xhigh → kimi-k3 max; long-horizon strategy
    // on the strong seat.
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    class: 'read-only',
    maxDepth: 1,
    writeCapable: false,
    delegation: true,
  },
] as const satisfies readonly RosterEntry[]

/**
 * Every roster id, in roster order — derived from the literal rows above, so a
 * typo in an `id` cannot silently widen the union.
 */
export type AgentId = (typeof ROSTER_ROWS)[number]['id']

/**
 * The 11-row roster, in roster order, as `RosterEntry[]`. The literal tuple
 * above is deliberately NOT exported under this name: `as const` omits the
 * optional keys a row does not declare, which makes a legitimate branch on
 * `class` / `maxDepth` / `personaFile` (the conductor's `—` cells) a type
 * error. Widening here keeps one authored array while giving every consumer
 * the declared shape; `AgentId` still comes from the literals.
 */
export const ROSTER: readonly RosterEntry[] = ROSTER_ROWS

/** The 10 delegation target ids (every roster id except the conductor). */
export type DelegationAgentId = Exclude<AgentId, 'sisyphus'>

/** Every roster id, in roster order. */
export const ALL_AGENT_IDS: readonly AgentId[] = ROSTER_ROWS.map((entry) => entry.id)

/**
 * A delegation row with the fields the plan guarantees for the 10
 * `dsh-tool-subagent` targets present (narrowed by `isDelegationEntry`).
 */
export type DelegationRosterEntry = RosterEntry & {
  readonly delegation: true
  readonly class: AgentClass
  readonly maxDepth: 1 | 2
  readonly personaFile: string
}

/** Narrows a roster row to a delegation target (conductor row → false). */
export function isDelegationEntry(entry: RosterEntry): entry is DelegationRosterEntry {
  return entry.delegation
    && entry.class !== undefined
    && entry.maxDepth !== undefined
    && entry.personaFile !== undefined
}

/**
 * The 10 delegation-target rows, in roster order (typed narrowing via the
 * predicate above).
 */
export const DELEGATION_ENTRIES: readonly DelegationRosterEntry[] = ROSTER.filter(isDelegationEntry)

/**
 * The ORDERED list of the 10 delegation toolNames — all roster rows except the
 * conductor, in roster order. Consumed by the per-row deny-sentinel renderer
 * (P2-T15) and by roster/model-route assertions (P2-T17/P2-T20).
 */
export const DELEGATION_TOOL_NAMES: readonly DelegationAgentId[] = DELEGATION_ENTRIES.map(
  // `DELEGATION_ENTRIES` is the predicate-filtered subset, so it never contains
  // the conductor and every id is a DelegationAgentId; that invariant is known
  // only here, hence the localized assertion.
  (entry) => entry.id as DelegationAgentId,
)

/** The conductor's roster id (it has no delegation tool of its own). */
export const CONDUCTOR_ID = 'sisyphus' satisfies AgentId

/**
 * The two mutation tools every read-only row denies (plan §4.4). OMO's
 * `apply_patch` has no DSH counterpart, so `[write, edit, apply_patch]` maps to
 * these two (roster §2 镜像映射 preamble).
 */
export const MUTATION_TOOL_NAMES = ['write', 'edit'] as const

/**
 * Per-class `toolFilter.deny` computation (plan §4.4; roster §1 "deny 列表与
 * 逐行哨兵"). roster-driven: derived from the row's `class` plus the
 * roster-order delegation toolName list, never restated.
 *
 *   - read-only (explore, oracle, librarian, plan-consultant, plan-reviewer,
 *     prometheus — 6 rows) → ['write', 'edit', ...DELEGATION_TOOL_NAMES]
 *   - worker (hephaestus, sisyphus-junior — 2 rows) → [...DELEGATION_TOOL_NAMES]
 *   - orchestrator (atlas) → undefined: the row renders NO `toolFilter` key; it
 *     keeps the delegation tools and relies on maxDepth 2 as its structural cap
 *   - allowlist (multimodal-looker) → undefined: the row renders `allow:
 *     [read, read_image]` instead. Q-3 (roster §3, closed by P2-T1) established
 *     `allow ∧ ¬deny`, so the delegation names are already invisible and an extra
 *     deny would be pure redundancy plus more R-9 name-drift surface
 *   - conductor (sisyphus) → undefined: not a delegation row at all
 *
 * Throws (R-7 discipline) if a delegation row is missing its class instead of
 * silently rendering a filter-less child.
 */
export function denyToolNamesFor(entry: RosterEntry): readonly string[] | undefined {
  if (entry.delegation && entry.class === undefined) {
    throw new Error(
      `roster: delegation row '${entry.id}' declares no class — its deny list cannot be computed`,
    )
  }
  switch (entry.class) {
    case 'read-only':
      return [...MUTATION_TOOL_NAMES, ...DELEGATION_TOOL_NAMES]
    case 'worker':
      return [...DELEGATION_TOOL_NAMES]
    case 'orchestrator':
    case 'allowlist':
      return undefined
    default:
      return undefined
  }
}

/**
 * Per-class `toolFilter.allow` computation: only the allowlist class has one
 * (plan §4.4). Kept beside the deny computation so the P2-T15 renderer derives
 * both filters from the same row + class.
 */
export function allowToolNamesFor(entry: RosterEntry): readonly string[] | undefined {
  return entry.class === 'allowlist' ? entry.allowTools : undefined
}
