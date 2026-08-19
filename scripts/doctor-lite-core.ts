// scripts/doctor-lite-core.ts — pure helpers shared by scripts/doctor-lite.mjs
// (T21) and its vitest coverage (tests/omo-agents/doctor-lite.test.ts). Zero
// dependencies, zero I/O: the version-range matcher for the D7 pin and the
// P-8 patch-entry analysis. Node 24 type-stripping runs this file as source
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
 * Parses a `dsh --version` line. Accepts optional leading whitespace and a
 * leading `v`; the prerelease suffix (`0.1.0-rc.6`) is ignored for the pin
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
