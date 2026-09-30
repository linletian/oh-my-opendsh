// scripts/doctor-lite-core.ts — pure helpers shared by scripts/doctor-lite.mjs
// (T21) and its vitest coverage (tests/omo-agents/doctor-lite.test.ts). Zero
// dependencies, zero I/O: the version-range matcher for the D7 pin, the P-8
// patch-entry analysis, and (P2-T20) the per-row delegation contract used by
// check 4's semantic gate. Node 24 type-stripping runs this file as source
// (the prove-* scripts already rely on that for patches/…/src/*.ts, P-8.6).

/** A parsed semver triple from a `dsh --version` line. */
export interface DshVersion {
  major: number
  minor: number
  patch: number
}

/** Decision D7 pin: minor 0.1.x. */
export const PINNED_MAJOR = 0
export const PINNED_MINOR = 1

/** The two shipped LLM adapter rows check 3 requires in the composed tree. */
export const LLM_ADAPTER_ROWS = [
  '@deepseek-ai/dsh-llm-deepseek', // sisyphus seat (entry config route)
  '@deepseek-ai/dsh-llm-pi-ai', // explore seat (settings-registered route)
]

/**
 * The plugin rows the repo-root cordis.yml must insert, in mount order (P3-T3;
 * third row added by P4-T3). Named and exported so the expectation is stated
 * ONCE: every sandbox boot site (scripts/cold-start.sh, tests/e2e/drive.mjs,
 * scripts/concerto-mode-probe.sh, scripts/smoke-real.mjs) installs one package
 * per row, and doctor-lite's `cordis-plugins` check compares the parsed patch
 * file against this list (a row dropped from the overlay — or one added without
 * its install site — fails the gate instead of surfacing as a plugin that never
 * mounted). scripts/verify-concerto-static.mjs's c11 reads the SAME constant, so
 * the count lives in exactly one place.
 */
export const EXPECTED_INSERT_ROW_IDS = ['omo-agents', 'omo-hooks', 'omo-commands'] as const

/**
 * Parses a `dsh --version` line. Accepts optional leading whitespace and a
 * leading `v`; the prerelease suffix (`0.1.5-rc.1`) is ignored for the pin
 * (D7 pins the minor). Returns { major, minor, patch } or null when the
 * string is not a recognizable version.
 */
export function parseDshVersion(raw: string): DshVersion | null {
  const match = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/)
  if (match === null) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

/** D7 pin predicate: the parsed version must be 0.1.x. */
export function isPinnedDshVersion(version: DshVersion | null): boolean {
  return version !== null && version.major === PINNED_MAJOR && version.minor === PINNED_MINOR
}

/** Result of {@link analyzePatchEntries}. */
export interface PatchEntryAnalysis {
  /** How many top-level rows use the `- insert:` form correctly. */
  insertForm: number
  /** How many top-level rows are not mappings (dsh rejects the file outright). */
  nonMapping: number
  /** One human-readable entry per silent-skip candidate / rejection. */
  issues: string[]
}

function isMappingRow(row: unknown): row is Record<string, unknown> {
  return row !== null && typeof row === 'object' && !Array.isArray(row)
}

/**
 * Analyzes the top-level rows of a parsed patch file (T4 P-8): counts the
 * insert-form rows and reports every row dsh would silently skip —
 *   * a mapping without an `insert:` key (a plain id/name override row is
 *     skipped against the always-empty profile root, P-8);
 *   * an `insert:` key whose value is not a non-empty array (applyEntryPatches
 *     treats a falsy insert as the non-insert path and skips it);
 *   * a non-mapping row (dsh rejects the file outright at apply time).
 * `issues[]` carries one human-readable entry per silent-skip candidate.
 */
export function analyzePatchEntries(rows: unknown[]): PatchEntryAnalysis {
  const issues: string[] = []
  let insertForm = 0
  let nonMapping = 0
  for (const [index, row] of rows.entries()) {
    const label = `entry ${index + 1}`
    if (!isMappingRow(row)) {
      nonMapping += 1
      issues.push(`${label} is not a mapping — dsh rejects the file at apply time`)
      continue
    }
    if (Object.prototype.hasOwnProperty.call(row, 'insert')) {
      if (Array.isArray(row.insert) && row.insert.length > 0) {
        insertForm += 1
        continue
      }
      issues.push(`${label} has insert: but it is not a non-empty array — dsh silently skips it (P-8)`)
      continue
    }
    const id = typeof row.id === 'string' && row.id.length > 0 ? `id=${row.id}` : 'no id'
    issues.push(`${label} (${id}) lacks insert: — a plain row only overrides an existing row and is silently skipped (P-8)`)
  }
  return { insertForm, nonMapping, issues }
}

/**
 * Collects the `id` of every row inside the top-level `insert:` lists, in patch
 * order (P3-T3's `cordis-plugins` check). `analyzePatchEntries` answers "is
 * every row in the insert FORM" (P-8); this answers "WHICH plugin rows are
 * mounted", which is the fact the install sites depend on. Non-mapping entries
 * and inserted rows without a string id contribute nothing — the caller
 * compares the whole observed list against {@link EXPECTED_INSERT_ROW_IDS}, so
 * an anonymous row shows up as a missing id rather than passing silently.
 */
export function collectInsertRowIds(rows: unknown[]): string[] {
  const ids: string[] = []
  for (const row of rows) {
    if (!isMappingRow(row)) continue
    const insert = row.insert
    if (!Array.isArray(insert)) continue
    for (const inserted of insert) {
      if (!isMappingRow(inserted)) continue
      if (typeof inserted.id === 'string' && inserted.id.length > 0) ids.push(inserted.id)
    }
  }
  return ids
}

/**
 * Collects every row with the given id, descending through group `config`
 * lists (the delegation group nests its tool rows in `config`).
 */
export function findRowsById(rows: unknown[], id: string): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = []
  const walk = (list: unknown[]): void => {
    for (const row of list) {
      if (!isMappingRow(row)) continue
      if (row.id === id) found.push(row)
      if (Array.isArray(row.config)) walk(row.config)
    }
  }
  walk(rows)
  return found
}

// ── P2-T20: per-row delegation contract (the semantic gate for check 4) ─────
//
// WHY THIS EXISTS. `validateCompositionRows` proves every row is SCHEMA-legal;
// it says nothing about whether a row MEANS what the roster says it means.
// The 0.1.5-rc.1 persona break shipped through exactly that gap: the row's
// config validated, but the row no longer carried the contract
// (docs/dsh-0.1.5-rc.1-review.md §6). These two pure functions close it: the
// caller derives ONE expectation per roster delegation entry from roster.ts
// (toolName == the entry id, the class filter via the same `denyToolNamesFor` /
// `allowToolNamesFor` the renderer uses, maxDepth from the entry, agentOptions
// from `resolveModelRoutes()[id]`), and the checker compares the row the
// installed dsh Config just normalized against it. No literal list is ever
// restated here — the filter contents arrive from the roster.

/**
 * The roster-side view of ONE expected rendered delegation row. The caller
 * builds it from a `roster.ts` `DelegationRosterEntry` plus the renderer's own
 * filter computation, so this module stays free of any plugin import.
 */
export interface DelegationRowRosterView {
  /** Roster id — simultaneously the DSH `toolName` and the persona basename. */
  readonly id: string
  /** The plan §4.4 mirror class (for messages + shape selection). */
  readonly className: string
  /** The roster entry's maxDepth (the target-row cap, D-2026-09-13-01). */
  readonly maxDepth: unknown
  /** `denyToolNamesFor(entry)` — undefined for orchestrator/allowlist. */
  readonly deny?: readonly string[]
  /** `allowToolNamesFor(entry)` — defined for the allowlist class only. */
  readonly allow?: readonly string[]
}

/** The expected shape of one rendered delegation row. */
export interface DelegationRowContract {
  readonly id: string
  readonly className: string
  readonly maxDepth: unknown
  /**
   * The expected `toolFilter` value, or `null` when the row must carry NO
   * `toolFilter` key at all (the orchestrator class keeps the delegation tools
   * and relies on maxDepth as its structural cap).
   */
  readonly toolFilter: Record<string, unknown> | null
  readonly agentOptions: { readonly provider: unknown; readonly model: unknown }
}

/**
 * Derives one row's contract from the roster view + the entry's resolved
 * route. The class → filter SHAPE rule lives here (deny list present →
 * `{deny}`; allow list present → `{allow}`; neither → the key must be absent);
 * the list CONTENTS come from the caller, i.e. from roster.ts / the renderer.
 */
export function expectedDelegationRowContract(
  entry: DelegationRowRosterView,
  route: { readonly provider: unknown; readonly model: unknown },
): DelegationRowContract {
  const toolFilter = entry.deny !== undefined
    ? { deny: [...entry.deny] }
    : entry.allow !== undefined
      ? { allow: [...entry.allow] }
      : null
  return {
    id: entry.id,
    className: entry.className,
    maxDepth: entry.maxDepth,
    toolFilter,
    agentOptions: { provider: route.provider, model: route.model },
  }
}

/**
 * Compares one schema-validated rendered row against its roster-derived
 * contract and returns one human-readable problem per violation (empty array =
 * the row honours the contract). `provider`/`backgroundMode` are the T11/T15
 * binding constants shared by every delegation row; everything else is the
 * caller's expectation, never a literal inside this function.
 */
export function delegationRowContractProblems(
  config: Record<string, unknown>,
  want: DelegationRowContract,
): string[] {
  const problems: string[] = []
  if (config.provider !== 'spawn') {
    problems.push(`provider=${JSON.stringify(config.provider)} (want spawn)`)
  }
  if (config.toolName !== want.id) {
    problems.push(`toolName=${JSON.stringify(config.toolName)} (want ${JSON.stringify(want.id)})`)
  }
  if (config.backgroundMode !== 'continuable') {
    problems.push(`backgroundMode=${JSON.stringify(config.backgroundMode)} (want continuable)`)
  }
  if (config.maxDepth !== want.maxDepth) {
    problems.push(`maxDepth=${JSON.stringify(config.maxDepth)} (want ${JSON.stringify(want.maxDepth)} — roster value)`)
  }
  if (want.toolFilter === null) {
    if (config.toolFilter !== undefined) {
      problems.push(
        `toolFilter=${JSON.stringify(config.toolFilter)} (class ${want.className} carries NO filter key)`,
      )
    }
  } else if (JSON.stringify(config.toolFilter) !== JSON.stringify(want.toolFilter)) {
    problems.push(
      `toolFilter=${JSON.stringify(config.toolFilter)} `
      + `(want ${JSON.stringify(want.toolFilter)} — class ${want.className}, roster-computed)`,
    )
  }
  const options = isMappingRow(config.agentOptions) ? config.agentOptions : undefined
  if (options?.provider !== want.agentOptions.provider || options?.model !== want.agentOptions.model) {
    problems.push(
      `agentOptions=${JSON.stringify(config.agentOptions)} `
      + `(want ${JSON.stringify(want.agentOptions.provider)}/${JSON.stringify(want.agentOptions.model)})`,
    )
  }
  const persona = config.persona
  if (typeof persona !== 'string' || persona.trim().length === 0) {
    problems.push('persona missing or empty (sentinels unrendered?)')
  }
  return problems
}

