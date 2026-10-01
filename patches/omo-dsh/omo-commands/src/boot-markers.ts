// boot-markers.ts — P4-T3 boot-marker computation for @oh-my-opendsh/omo-commands,
// factored out of index.ts so every line the plugin logs is produced by a
// unit-tested pure function (the omo-hooks boot-markers.ts precedent: "pure
// module + thin index.ts wiring", so the probe's greps anchor on text pinned by
// tests instead of on text assembled inline in apply()).
//
// WHY THE FORMATS ARE A CONTRACT (plan §4.1). The boot markers are the ONLY
// in-process observable that the plugin mounted: scripts/cold-start.sh and
// scripts/concerto-mode-probe.sh grep the boot log, and the e2e suite's
// `pluginLoaded` analysis matches their prefixes. Changing a format silently
// turns those greps into false negatives, so:
//
//   KEEP THESE FORMATS STABLE — extend the probe, never the format.
//
// The lines (exact grammar, so a future edit cannot "improve" it by accident):
//
//   summary   "[omo-commands] loaded: manifest <N> entries (pending=<n>,
//              ported=<n>) — <r>/<N> commands registered"
//             — exactly ONE line per boot, logged AFTER the registration loop.
//               `<N>` and the two status counts are DERIVED from the manifest
//               (never hard-coded); `<r>` is how many rows the loop actually
//               registered. The field order is COMMAND_MANIFEST_STATUSES
//               (manifest.ts), fixed, so the line is diffable across boots. The
//               `[omo-commands] loaded` prefix is the mount anchor cold-start
//               / the probe grep (a substring grep, so the counts can evolve
//               without a probe edit).
//   registered "[omo-commands] command <id> registered"
//             — ONE line per manifest row that IS registered, i.e. a row whose
//               status is 'ported' AND whose registrar exists and returned
//               cleanly. A row with no registrar (not ported yet) is SILENT: the
//               manifest declares 6 rows, and whichever of them are still
//               'pending' — or 'ported' without a registrar — produce NO line at
//               all, so the boot logs the summary line and nothing else for
//               them. That silence is the honest reading — see index.ts's loop
//               for why "no line" must not become "a line that claims success".
//               ⚠️ How many of the 6 sit in each status is deliberately NOT
//               restated here. It is read from COMMAND_MANIFEST by the functions
//               in this file, and the exact rendered line is pinned by
//               tests/omo-commands/boot-markers.test.ts. A hand-copied census in
//               a comment is what this paragraph used to be — it said "P4-T3
//               ships all six rows 'pending'" and stayed that way through the
//               whole Phase 4 landing, i.e. the drift outlived the claim.
//   FAILED    "[omo-commands] command <id> FAILED: <describeError>"
//             — loud-but-non-fatal: the failing command names itself and the
//               loop keeps going (P2-T16 discipline — one broken command must
//               never suppress the others).
//   manifest  "[omo-commands] manifest validation FAILED: <describeError>"
//             — the roster itself is broken; the summary line is WITHHELD (a
//               count from an untrusted roster would read like a successful
//               mount) and the plugin registers nothing.
//
// ORDER DIFFERS FROM omo-hooks ON PURPOSE, and the difference is forced by the
// facts each summary line reports. omo-hooks logs its summary FIRST because its
// counts come from the roster alone (per-event counts) — the registration loop
// cannot change them. This summary reports the loop's OUTCOME (`<r>/<N>`), which
// is unknowable until the loop has run, so it is the log's last line. Every
// consumer greps by prefix or exact line, never by position, so the ordering
// difference is invisible to them.
//
// THE CONSUMER CONTRACT THAT MAKES THAT TRUE (stated here because the ORDER
// paragraph above is a claim about consumers, and a claim about consumers is
// only as good as the consumers): grep these lines by PREFIX
// (`\[omo-commands\] loaded`, `\[omo-commands\] command <id> `) or by WHOLE
// LINE with a fixed-string match — never assert on line NUMBER, on
// "the summary is the first/last thing logged", or on a slice of the log. A
// positional assertion would silently re-anchor itself to whatever the current
// order happens to be, and the summary-last rule documented above would then be
// untested drift. The current consumers: scripts/cold-start.sh (prefix),
// scripts/concerto-mode-probe.sh (prefix + whole-line -F), and the
// `pluginLoaded` analysis in tests/e2e/drive.mjs (prefix).
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.

// P4-T16 — 启动期标记行的构造器（本仓的 boot 日志体例）。
// 署名声明（c16 原生总体）：本文件**无上游对应物**——v4.19.4 没有任何同职责的模块。
// 它是 DSH 侧的原生代码，不是语义移植；宣称上游来源就是假署名。语义移植文件请带
// 「UPSTREAM SOURCE + @ v4.19.4 + 移植声明」三件套。

import {
  COMMAND_MANIFEST_STATUSES,
  countsByStatus,
  type CommandManifestEntry,
} from './manifest.ts'

/**
 * Renders one caught error for a FAILED boot line. Deliberately a second,
 * independent copy of the omo-hooks boot-markers.ts helper: the two plugins must
 * not import each other (index.ts header: sharing code across them is a
 * plan-level decision), and a 3-line pure function is cheaper than the coupling.
 */
export function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

/**
 * `[omo-commands] loaded: manifest <N> entries (pending=<n>, ported=<n>) —
 * <r>/<N> commands registered` — the ONE summary line.
 *
 * Every number is derived: `<N>` and the status counts from `entries` (through
 * manifest.ts's `countsByStatus`, so the status vocabulary and its order are
 * stated exactly once), and `<r>` from the rows the loop actually registered.
 * `registered` is a list of ROWS rather than ids on purpose — the count needs
 * no lookup, so the formatter cannot silently report a number for an id that is
 * not in the roster (a caller bug that would read as a successful mount).
 *
 * Pure, so a unit test can feed a synthetic roster and observe the derived
 * counts, and the real-manifest test pins the exact line a boot logs.
 */
export function formatLoadedSummaryLine(
  entries: readonly CommandManifestEntry[],
  registered: readonly CommandManifestEntry[],
): string {
  const counts = countsByStatus(entries)
  const fields = COMMAND_MANIFEST_STATUSES.map(
    (status) => `${status}=${counts.get(status) ?? 0}`,
  )
  return `[omo-commands] loaded: manifest ${entries.length} entries `
    + `(${fields.join(', ')}) — ${registered.length}/${entries.length} commands registered`
}

/**
 * `[omo-commands] command <id> registered` — one line per successfully
 * registered command. P4-T6 changed the census: a correct boot now logs this
 * line for each PORTED row (handoff, remove-ai-slops) and for no other id, in
 * manifest order, before the summary line. A pending row must never produce one
 * — that asymmetry is the whole point of the line (the probe's assertions
 * follow).
 */
export function formatCommandRegisteredLine(id: string): string {
  return `[omo-commands] command ${id} registered`
}

/**
 * `[omo-commands] command <id> FAILED: <describeError>` — loud-but-non-fatal,
 * the per-command failure form (P2-T16 precedent).
 */
export function formatCommandFailedLine(id: string, err: unknown): string {
  return `[omo-commands] command ${id} FAILED: ${describeError(err)}`
}

/**
 * `[omo-commands] manifest validation FAILED: <describeError>` — the ONE form
 * for a roster that validateManifest rejects. On this path the summary line is
 * NOT logged: a roster whose length/shape could not be trusted must not print a
 * count that reads like a successful mount (cold-start's `[omo-commands] loaded`
 * grep then fails loudly, which is the point).
 */
export function formatManifestValidationFailedLine(err: unknown): string {
  return `[omo-commands] manifest validation FAILED: ${describeError(err)}`
}

/**
 * `[omo-commands] skills: <r>/<N> registered (runtime, vendor path)` — the P4-T5
 * skill-delivery summary. `<N>` counts every DISCOVERED skill file (registered
 * plus failed) so the ratio is honest, and the parenthetical names the two facts
 * a boot log reader cannot otherwise know: the contributions land in dsh's
 * `runtime` bucket (measured: the registry labels its own runtime provider and
 * rank 250, which outranks bundled providers at 600) and their bodies come from
 * the plugin's own vendored tree at absolute paths.
 *
 * ORDER: the command summary comes first, this one second — they are two
 * independent mechanisms, and a reader comparing boots should see the command
 * surface's line before the skill surface's. The failure count is appended ONLY
 * when non-zero, so a healthy boot's line stays exactly one field-ized shape.
 */
export function formatSkillsSummaryLine(outcome: {
  registered: number
  total: number
  failed: number
}): string {
  const base = `[omo-commands] skills: ${outcome.registered}/${outcome.total} registered (runtime, vendor path)`
  return outcome.failed === 0 ? base : `${base}, ${outcome.failed} failed`
}

/**
 * `[omo-commands] skill <name> FAILED: <describeError>` — the per-skill
 * failure form, kept DISTINCT from the command form above so the probe can
 * assert each is absent independently. `<name>` is the skill DIRECTORY name (not
 * the frontmatter name): a file that cannot be parsed far enough to learn its
 * declared name must still be nameable in the log.
 */
export function formatSkillFailedLine(directoryName: string, err: unknown): string {
  return `[omo-commands] skill ${directoryName} FAILED: ${describeError(err)}`
}

/**
 * `[omo-commands] skills scan FAILED: <describeError> — 0 skills discovered under <dir>`
 * — the TREE-level failure form, for the one failure that belongs to no skill:
 * the vendor directory itself cannot be listed (missing `vendor/` on an installed
 * copy, unreadable permissions). It is deliberately NOT the per-skill form: no
 * skill was even discovered, so naming one would be a lie, and the per-skill
 * assertion in `concerto-mode-probe.sh` must not be able to match this line.
 * The summary marker still follows it, reporting `0/0` — the honest ratio for
 * "nothing was delivered".
 */
export function formatSkillsScanFailedLine(dir: string, err: unknown): string {
  return `[omo-commands] skills scan FAILED: ${describeError(err)} — 0 skills discovered under ${dir}`
}
