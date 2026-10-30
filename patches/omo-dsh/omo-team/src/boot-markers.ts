// boot-markers.ts — P5-T3 boot-marker computation for @oh-my-opendsh/omo-team,
// factored out of index.ts so every line the plugin logs is produced by a
// unit-tested pure function (the omo-hooks / omo-commands boot-markers.ts
// precedent: "pure module + thin index.ts wiring", so the probe's greps anchor
// on text pinned by tests instead of on text assembled inline in apply()).
//
// WHY THE MARKER STRINGS BELOW ARE A CONTRACT (plan §4.2). The boot markers are
// the ONLY in-process observable that the plugin mounted: scripts/cold-start.sh
// and scripts/concerto-mode-probe.sh grep the boot log, and the e2e suite's
// `pluginLoaded` analysis matches their prefixes. Changing a format silently
// turns those greps into false negatives, so:
//
//   KEEP THESE FORMATS STABLE — extend the probe, never the format.
//
// The lines (exact grammar, so a future edit cannot "improve" it by accident):
//
//   summary   "[omo-team] loaded: manifest <N> entries (pending=<n>, ported=<n>,
//              recorded=<n>) — <r>/<N> team surfaces registered"
//             — exactly ONE line per boot, logged AFTER the registration loop
//             (the omo-commands ORDER precedent: this summary reports the loop's
//             OUTCOME `<r>/<N>`, which is unknowable until the loop has run; the
//             omo-hooks summary logs first because ITS counts come from the
//             roster alone — the difference is forced by the facts, and every
//             consumer greps by prefix or whole line, never by position).
//               `<N>` and the three status counts are DERIVED from the manifest —
//               by manifest.ts's OWN `formatLoadedSummaryLine`, consumed below and
//               never restated here (manifest.ts's header: the format EXTENSION —
//               the merged registration half — is added on this side, the manifest
//               half and its derivation inputs stay there). `<r>` is how many rows
//               the loop actually registered. The status field order is
//               TEAM_MANIFEST_STATUSES (manifest.ts), fixed, so the line stays
//               diffable across boots. The `[omo-team] loaded` prefix is the mount
//               anchor cold-start / drive.mjs / the probe grep (a substring grep,
//               so the counts can evolve without a grep edit). At P5-T3 the
//               registration registry is EMPTY, so `<r>` is 0 and the ported tally
//               is 0 too — the honest reading of a mount with nothing ported yet;
//               the census moves as rows land and NOTHING here restates it.
//   registered "[omo-team] team surface <id> registered"
//             — ONE line per manifest row that IS registered: status 'ported' AND
//               a registrar exists AND the registrar returned cleanly. A row with
//               no registrar is SILENT — "no line" must never become "a line that
//               claims success" (the omo-commands discipline verbatim). The noun is
//               `team surface` because the manifest rows enumerate the team
//               SURFACES (tools / handoff rows / vendor rows), not one kind.
//   FAILED    "[omo-team] team surface <id> FAILED: <describeError>"
//             — loud-but-non-fatal: the failing row names itself and the loop
//             keeps going (P2-T16 discipline — one broken registration must never
//             suppress the others, and the boot marker still prints).
//   manifest  "[omo-team] manifest validation FAILED: <describeError>"
//             — the roster itself is broken; the summary line is WITHHELD (a
//               count from an untrusted roster would read like a successful mount)
//               and the plugin registers nothing.
//
// THE CONSUMER CONTRACT (stated because the ORDER paragraph above is a claim
// about consumers): grep these lines by PREFIX (`\[omo-team\] loaded`,
// `\[omo-team\] team surface `) or by WHOLE LINE with a fixed-string match —
// never assert on line NUMBER or on a slice of the log. The current consumers:
// scripts/cold-start.sh (prefix), scripts/concerto-mode-probe.sh (prefix +
// whole-line -F, expectation re-derived from manifest.ts + boot-markers.ts +
// index.ts), tests/e2e/drive.mjs (prefix), scripts/smoke-real.mjs (prefix).
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.

// P5-T3 — 启动期标记行的构造器（本仓的 boot 日志体例，镜像 omo-commands /
// omo-hooks 的 boot-markers.ts 先例）。
// 署名声明（c16 原生总体）：本文件**无上游对应物**——v4.19.4 没有任何同职责的
// 模块（OMO 的 team 语义住在 `packages/omo-opencode/src/features/team-mode/`
// 与 `packages/team-core/src/`，其逐条语义署名在 src/manifest.ts 的行里，不在
// 这里；boot 日志体例本来就是我们自己的）。它是 DSH 侧的原生代码，不是语义
// 移植；宣称上游来源就是假署名。语义移植文件请带「UPSTREAM SOURCE + @ v4.19.4
// + 移植声明」三件套。

import {
  formatLoadedSummaryLine as formatManifestLoadedLine,
  type TeamManifestEntry,
} from './manifest.ts'

/**
 * Renders one caught error for a FAILED boot line. Deliberately an independent
 * copy of the omo-hooks / omo-commands boot-markers.ts helper: the plugins must
 * not import each other (index.ts header: sharing code across them is a
 * plan-level decision), and a 3-line pure function is cheaper than the coupling.
 */
export function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

/**
 * `[omo-team] loaded: manifest <N> entries (pending=<n>, ported=<n>,
 * recorded=<n>) — <r>/<N> team surfaces registered` — the ONE summary line.
 *
 * The manifest half is manifest.ts's own `formatLoadedSummaryLine`, consumed
 * verbatim (its header anticipated exactly this merge: "T3 若拆出该文件、把注册
 * 计数并入行格式，派生输入仍从这里取——格式扩展在 probe 侧加，不在这里改"), so
 * the status vocabulary, its order, and every count are still derived from the
 * roster in ONE place. This module adds only the registration half: `<r>` comes
 * from the loop's actual output, never from the manifest's statuses — so a
 * roster of ported rows whose registrars all threw still reads `0/N`.
 * `registered` is a list of ROWS rather than ids on purpose — the count needs no
 * lookup, so the formatter cannot silently report a number for an id that is not
 * in the roster (a caller bug that would read as a successful mount).
 *
 * Pure, so a unit test can feed a synthetic roster and observe the derived
 * counts, and the real-manifest test pins the exact line a boot logs.
 */
export function formatLoadedSummaryLine(
  entries: readonly TeamManifestEntry[],
  registered: readonly TeamManifestEntry[],
): string {
  return formatManifestLoadedLine(entries)
    + ` — ${registered.length}/${entries.length} team surfaces registered`
}

/**
 * `[omo-team] team surface <id> registered` — one line per successfully
 * registered team surface. The registry starts EMPTY at P5-T3 (the P3-T3 /
 * P4-T3 precedent: skeleton first, one row per landed task from T5), so a
 * healthy P5-T3 boot logs NO line of this form at all — the distinction
 * between "nothing landed" and "everything landed" lives in the `<r>/<N>` of
 * the summary line, and this form only ever names rows that really registered.
 */
export function formatTeamSurfaceRegisteredLine(id: string): string {
  return `[omo-team] team surface ${id} registered`
}

/**
 * `[omo-team] team surface <id> FAILED: <describeError>` — loud-but-non-fatal,
 * the per-row failure form (P2-T16 precedent).
 */
export function formatTeamSurfaceFailedLine(id: string, err: unknown): string {
  return `[omo-team] team surface ${id} FAILED: ${describeError(err)}`
}

/**
 * `[omo-team] manifest validation FAILED: <describeError>` — the ONE form for a
 * roster that validateManifest rejects. On this path the summary line is NOT
 * logged: a roster whose length/shape could not be trusted must not print a count
 * that reads like a successful mount (cold-start's `[omo-team] loaded` grep then
 * fails loudly, which is the point).
 */
export function formatManifestValidationFailedLine(err: unknown): string {
  return `[omo-team] manifest validation FAILED: ${describeError(err)}`
}

/**
 * The counter fields of the boot persistence pass — the shape the vendored
 * `ResumeReport` (team-core team-state-store/resume) is read through. Declared
 * STRUCTURALLY here on purpose: boot-markers.ts must stay import-pure (no
 * vendored type import for a five-number contract; index.ts passes the real
 * report and the compiler checks the fields at the call site).
 */
export interface TeamBootResumeCounters {
  readonly resumed: number
  readonly marked_failed: number
  readonly marked_orphaned: number
  readonly cleaned: number
  readonly errors: readonly unknown[]
}

/**
 * `[omo-team] boot resume: resumed=<n>, failed=<n>, orphaned=<n>, cleaned=<n>,
 * errors=<n>` — the STATE MACHINE'S OWN BOOT ANSWER (P5-T10; index.ts logs it
 * exactly once per boot, and ONLY after `rebuildIndexes()` and the vendored
 * `resumeAllTeams()` have RESOLVED — so the line existing IS the answerability
 * evidence: a store that never initialized, or whose rebuild threw, cannot print
 * it; the throw path prints `[omo-team] boot resume FAILED …` instead, the
 * loud-but-non-fatal form). The five counters are the upstream ResumeReport
 * tally — a probe or gate reads the SHAPE (every field present, in order) and
 * must not restate the numbers: scripts/concerto-mode-probe.sh derives its
 * expectation from THIS formatter (the assert-concerto-read-face.mjs single-
 * source discipline), so a format change here moves the probe without an edit
 * and a silent format change anywhere else turns that derivation red.
 */
export function formatTeamBootResumeLine(report: TeamBootResumeCounters): string {
  return `[omo-team] boot resume: resumed=${report.resumed}, failed=${report.marked_failed}, orphaned=${report.marked_orphaned}, cleaned=${report.cleaned}, errors=${report.errors.length}`
}
