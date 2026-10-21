// P3-T20 — the manifest ↔ coverage-baseline CONSISTENCY test (plan §4.7 L1③;
// exit criterion b's "manifest ↔ 清单一致性测试绿"). It is the *.test.ts stage of
// the same two-authored-halves pipeline that the static gate's c14 record
// (scripts/verify-concerto-static.mjs:653-724) checks from the shell side.
//
// WHY A SEPARATE FILE RATHER THAN AN APPEND TO tests/omo-hooks/manifest.test.ts.
// manifest.test.ts unit-tests the manifest MODULE (shape, validation branches,
// derived helpers) and pins its expectations by HAND — its header states that
// every hard-coded list is deliberately transcribed so that a changed row must
// edit the test in the same commit. This suite tests a different fact with a
// different oracle: it parses the HUMAN-READABLE coverage baseline and the e2e
// driver, i.e. it is an AUTHORED-CROSS-FILE consistency check, not a module unit
// test. Merging the two would dilute manifest.test.ts's "the expectation is
// hand-transcribed" discipline with a differently-sourced one; keeping them
// separate also means this file's mutation story (flip a row -> red) is
// independent of validateManifest's rejection story.
//
// PARSER PROVENANCE (the task book asks for the decision, and a note when it is
// a parallel implementation). The c14 block in scripts/verify-concerto-static.mjs
// parses the SAME phase3-hooks.md §1 table for the SAME triangle (baseline rows
// ⟺ manifest ids). This file does NOT reuse that function:
//   * the gate is a `.mjs` SCRIPT, not a module with a declared parser export —
//     importing it would execute its top-level `await run()` and `process.exit`;
//   * the two records are two assertions of ONE pipeline at two STAGES, and on
//     the scenario axis they are a COMPLEMENT, not a duplicate of each other.
// What c14 asserts TODAY (verify-concerto-static.mjs:653-724): the row's STATUS
// CELL (cells[4]) carries 已移植 — the T19 NIT-1 fix landed in this very
// changeset (the gate's diff: `line.includes('已移植')` →
// `statusCell.includes('已移植')`), so a 跳过 row quoting the word no longer
// phantom-matches THERE either — plus the id sets agreeing in both directions
// (with the single H-32 v5 rename), duplicate-id rejection, and a loud FAIL on
// an empty parse.
// What THIS file adds, all of it past c14's oracle:
//   * the SCENARIO COLUMN: c14 never reads it, so §1 could record a missing,
//     wrong or stale scenario name and the gate would stay green — here every
//     recorded name must equal the row's manifest `e2eScenario`, every row must
//     name at least one scenario, and every name (including H-32's secondary
//     对照 `ulw-execute-no-intent`) must be a real drive.mjs SCENARIOS entry;
//   * the module code span is taken from the 模块 CELL only, and a module cell
//     without one is a LOUD throw; c14 searches the whole rest-of-line, so a
//     missing module span there could silently be satisfied by a later cell's
//     span (e.g. a scenario name in the status cell);
//   * row/scenario non-vacuity and scenario-name uniqueness guards (c14 has only
//     the non-empty-parse guard).
// So: the ID-SET equality is the one assertion deliberately made twice — same
// fact, two harnesses (shell gate + vitest), because either may run alone. The
// cell-scoped status match is now a shared CONTRACT rather than a divergence:
// the fabricated-row control below pins it from the test side, with a
// line-scoped reverse proof so that a future edit re-loosening THIS parser is
// caught.
//
// The `.ts` extension in the import path is load-bearing (Node 24 type-stripping
// does no specifier resolution; see index.ts's header).
import { readFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EXPECTED_HOOK_COUNT,
  HOOK_IDS,
  HOOK_MANIFEST,
  type HookManifestEntry,
} from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'

// ── the two authored halves ──────────────────────────────────────────────────

/**
 * P4-T12: the coverage baseline is now a TWO-DOCUMENT union, mirroring the c14
 * evolution in scripts/verify-concerto-static.mjs. Phase 4 owns the H-33/H-34
 * rows (phase4-commands.md §1.2, per its own 编号声明), so a Phase 4 row's
 * human-readable half is NOT in phase3-hooks.md §1. One document would make the
 * id-set equality structurally unsatisfiable for every Phase 4 row.
 */
const COVERAGE_BASELINE_PATHS: readonly URL[] = [
  new URL('../../docs/plans/phase3-dev/phase3-hooks.md', import.meta.url),
  new URL('../../docs/plans/phase4-dev/phase4-commands.md', import.meta.url),
]
const E2E_DRIVER_PATH = new URL('../e2e/drive.mjs', import.meta.url)

/**
 * THE STATUS VOCABULARY MAPPING (the T2 note the task book asks to pin in
 * writing). manifest.ts's `HookManifestStatus` is an open `string` on purpose
 * (see its comment: a closed union could not spell the coverage list's
 * vocabulary), so the mapping is stated HERE, once, as the contract between the
 * two halves:
 *
 *   manifest `status: 'ported'`  ⟺  phase3-hooks.md §1 status cell 「已移植」
 *
 * Semantics, both directions:
 *   * `'ported'` is the manifest spelling of the coverage list's term 已移植. A
 *     row is flipped ONLY when listener + unit test + e2e have all landed (the
 *     row-flip condition stated at manifest.ts's `HookManifestStatus` comment),
 *     and the doc is edited FIRST (manifest.ts's ONE-WAY SYNC DISCIPLINE).
 *   * Any OTHER status value (`'pending'`, or a future term) has NO coverage-list
 *     counterpart today: §1 only ever carries a terminal「已移植」row per port
 *   * `'pending'` ⟺ a §1 row whose status cell is a NON-terminal term. P4-T12
 *     introduced the first such row: H-33 `keyword-detector` in
 *     `docs/plans/phase4-dev/phase4-commands.md` §1.2, whose status cell reads
 *     「📋 代码已落地…；ported 翻转随 P4-T13 e2e 与 manifest status 同 commit
 *     双侧同步（c14 契约）」. P4-T13 delivered that e2e
 *     (`ultrawork-keyword-injected` + three siblings), but the STATUS is still
 *     `pending` on both sides because the flip is a 双侧同步 commit whose doc
 *     half the arbiter owns — so this row remains the one non-terminal row, and
 *     'pending' still means what it says: its e2e shipped, its ledger row has
 *     not been flipped yet.
 *     Both sides are therefore filtered symmetrically: the id equality, the
 *     scenario equality and the drive.mjs membership check all run over the
 *     PORTED side only, and a separate assertion (below) requires every pending
 *     manifest row to have a documented non-ported row, so the eventual
 *     pending → ported flip always has an auditable anchor on the doc side.
 *   * Any FURTHER status value (a third term) must extend this mapping, which
 *     means extending the coverage-list vocabulary, which is an arbiter
 *     decision. The vocabulary test below pins the SET, so a new term cannot
 *     arrive silently.
 */
const PORTED_STATUS = 'ported'
const PENDING_STATUS = 'pending'
const BASELINE_PORTED_MARKER = '已移植'
/** The baseline's non-terminal status term (phase4-commands.md §1.2 H-33 cell). */
const BASELINE_PENDING_MARKER = '待移植'

/**
 * The ONE hand-written rename: the coverage baseline's 模块 name is the upstream
 * directory (`start-work/`), while the manifest id is the v5 naming anchor
 * (`ulw-execute`, ROADMAP §2 规则 6). This mirrors BASELINE_ID_RENAMES in
 * scripts/verify-concerto-static.mjs:89 — if a SECOND rename ever appears it is a
 * naming fork between the two halves, which is drift, not progress.
 */
const BASELINE_ID_RENAMES = new Map([['start-work', 'ulw-execute']])

// ── the §1 table parser (c14's complement, not a reuse of it) ───────────────

/** A recorded e2e scenario name: a bare lowercase kebab token (3+ words). */
const SCENARIO_TOKEN = /^[a-z][a-z0-9]*(-[a-z0-9]+){2,}$/

interface BaselineRow {
  /** `H-xx` heading cell. */
  readonly heading: string
  /** The 模块 cell's first code span, normalized (`*.ts`/`/`/`-*` stripped). */
  readonly moduleName: string
  /** `moduleName` after {@link BASELINE_ID_RENAMES} — the manifest id. */
  readonly id: string
  /**
   * true when the STATUS CELL carries the mapped ported term (已移植). P4-T12:
   * the parser no longer drops non-ported rows — a §1 row can be a
   * 「📋 待移植」row (H-33 in phase4-commands.md §1.2) — so the flag is carried
   * explicitly and every assertion below picks the side it means.
   */
  readonly ported: boolean
  /** The FULL status cell (not the whole line — see the parser-provenance note). */
  readonly statusCell: string
  /**
   * The scenario names the status cell records, in recorded order. A cell may
   * name a trigger scenario AND its 对照 (H-32's `ulw-execute-activated` +
   * `ulw-execute-no-intent`), so this is a LIST; the manifest's single
   * `e2eScenario` is the FIRST (the primary scenario the row names). At the
   * TERMINAL baseline every one of the 14 §1 rows names at least one scenario
   * (the arbiter's §1 backfill closed the writing-time gap), so `[]` would now
   * mean a row LOST its name — the no-empty-scenario test pins that a silent row
   * cannot pass.
   */
  readonly scenarioNames: readonly string[]
}

/**
 * The status predicate the §1 scan applies to a candidate row. The default is
 * the CELL-scoped matcher that both records use today (c14 after this
 * changeset's T19 NIT-1 fix, and this parser); the control test passes a
 * LINE-scoped matcher to prove the fabricated fixture really discriminates
 * between the two — i.e. that the control can actually go red.
 */
type PortedStatusMatcher = (statusCell: string, line: string) => boolean

/** The production matcher: 已移植 must sit in the STATUS CELL (cells[4]). */
const cellScopedPorted: PortedStatusMatcher = (statusCell) =>
  statusCell.includes(BASELINE_PORTED_MARKER)

/**
 * The fabricated §1 fragment shared by the two control tests below: a 跳过 row
 * whose REASON quotes 已移植, and one genuine 已移植 row. The skip row carries a
 * real `H-99` heading, so it survives the heading anchor and actually reaches the
 * status-cell check — the earlier `S-99` form never did (see the control test).
 */
const FABRICATED_MARKER_QUOTING_DOC = [
  '## 1. 移植组',
  '| # | 模块 | 形态 | 模式 | 语义摘要 | 状态 |',
  '|---|---|---|---|---|---|',
  '| H-99 | `ghost-hook/` | 目录 | D | 该行理由引用了「已移植」这个词 | **跳过（无对应接缝）** |',
  '| H-02 | `bash-file-read-guard.ts` | 单文件 | C | summary | ✅ **已移植**（场景 `bash-read-guard-warned`） |',
  '## 2. 跳过组',
].join('\n')

/**
 * `phase3-hooks.md` §1 (移植组) as parsed rows — the human-readable half.
 *
 * P4-T12: the parser now returns **every** `| H-xx |` row of §1 with a
 * `ported` flag, not only the 已移植 ones. That is what lets the SAME parse feed
 * both sides of the new vocabulary mapping (ported ⟺ 已移植, pending ⟺ a
 * non-已移植 status cell) without a second pass over the markdown — and it is
 * what makes the "every pending manifest row has a documented row" check
 * possible at all. The status matcher is still injected, so the two control
 * tests below keep their bite (they filter on `ported`).
 */
function parseBaselineRows(
  markdown: string,
  matchesPorted: PortedStatusMatcher = cellScopedPorted,
): BaselineRow[] {
  const rows: BaselineRow[] = []
  let inSectionOne = false
  for (const line of markdown.split('\n')) {
    if (/^## 1\./.test(line)) {
      inSectionOne = true
      continue
    }
    if (/^## 2\./.test(line)) {
      inSectionOne = false
      continue
    }
    if (!inSectionOne) continue
    const heading = line.match(/^\|\s*(H-\d+)\s*\|(.*)$/)
    if (heading === null) continue
    const cells = heading[2].split('|').map((cell) => cell.trim())
    // | # | 模块 | 形态 | 模式 | 语义摘要 | 状态 | -> the heading match consumed
    // the first cell, so `cells` is [模块, 形态, 模式, 语义摘要, 状态, ''].
    const moduleCell = cells[0] ?? ''
    const statusCell = cells[4] ?? ''
    // CELL-scoped by default — the same scope c14 now uses (T19 NIT-1 fix, this
    // changeset), so a 跳过 row quoting 已移植 cannot phantom-match in either
    // record. The matcher is injectable so the control test can re-run this exact
    // body under the pre-fix LINE-scoped form and show the fixture discriminates.
    const ported = matchesPorted(statusCell, line)
    const spans = [...moduleCell.matchAll(/`([^`]+)`/g)].map((match) => match[1])
    const rawModule = spans[0]
    if (rawModule === undefined) {
      throw new Error(`${heading[1]}: 模块 cell carries no code span — cannot derive its listener id`)
    }
    const moduleName = rawModule.replace(/\.ts$/, '').replace(/\/$/, '').replace(/-\*$/, '')
    rows.push({
      heading: heading[1],
      moduleName,
      id: BASELINE_ID_RENAMES.get(moduleName) ?? moduleName,
      ported,
      statusCell,
      // Scenario names are the kebab-case code spans; the TASK/PHASE references
      // the same cells carry (`P3-T5`, `P3-T14 listener+单测+e2e`, `commit 3e6903d+`)
      // are filtered out by the token shape, not by position — a status cell has
      // no fixed column layout.
      scenarioNames: [...statusCell.matchAll(/`([^`]+)`/g)]
        .map((match) => match[1])
        .filter((token) => SCENARIO_TOKEN.test(token)),
    })
  }
  return rows
}

const baselineDocuments = COVERAGE_BASELINE_PATHS.map((url) => ({
  label: relative(dirname(fileURLToPath(url)), fileURLToPath(url)),
  markdown: readFileSync(url, 'utf8'),
}))
const baselineMarkdown = baselineDocuments.map((doc) => doc.markdown).join('\n')
/** Every `| H-xx |` row of §1 across the union (P4-T12). */
const allBaselineRows = baselineDocuments.flatMap((doc) => parseBaselineRows(doc.markdown))
/** The 已移植 subset — the PORT GROUP, the set the id equality is about. */
const baselineRows = allBaselineRows.filter((row) => row.ported)

/**
 * `tests/e2e/drive.mjs` as TEXT. The driver is a node script whose top level
 * spawns processes when executed (`main()` guard at the bottom); importing it
 * from a unit test would boot the harness. `SCENARIOS` is therefore read as
 * source text, which is exactly the grep-level assertion the task book asks for
 * ("SCENARIOS 链/注释中真实存在").
 */
const e2eDriverSource = readFileSync(E2E_DRIVER_PATH, 'utf8')

/**
 * Scenario names a row may name BEFORE drive.mjs declares them.
 *
 * A `pending` manifest row is allowed to name a not-yet-written scenario — that
 * is precisely what 'pending' records — but the allowance is registered here so
 * it is auditable rather than silent, and the test BELOW forces an entry out of
 * this set the moment the scenario it promises is actually declared. So the set
 * is a TODO list with a self-clearing rule, not a permanent exemption.
 *
 * ⚠️ P6-T6 moved it from EMPTY to ONE entry, and while that entry stood the
 * self-clearing rule was LIVE (the rule 1 filter had an iteration to lose):
 * H-33's forward promise was `keyword-mode-ultrawork`, and P4-T13 delivered
 * `ultrawork-keyword-injected` instead, so that promise was discharged by being
 * replaced. `ast-grep-sg-via-bash` was P6-T6's forward promise for the
 * `ast-grep-sg-provision` row (the e2e belonged to P6-T7; the hermetic shape —
 * fake sg pre-seeded via OMO_AST_GREP_SG_PATH, reverse canary absent-loud —
 * is FORKS.md §5.1). drive.mjs HAS NOW DECLARED it and rule 1 has struck it:
 * the state recorded below is EMPTY BY DISCHARGE, not by deletion of the
 * mechanism, which is the only way this registry was ever meant to empty.
 *
 * What the remaining assertions do and do not buy, stated exactly:
 *   * rule 1 (a delivered promise must be struck from the set) had ONE entry to
 *     lose and lost it — the self-clearing half is not hypothetical, it RAN. It
 *     bites again the day a new promise is registered and then delivered without
 *     being struck, which is the shape it was written for.
 *   * rule 2 (the retired name must never reappear) is NOT vacuous: it names
 *     `keyword-mode-ultrawork` literally, so it runs whether or not the set has
 *     entries. That single assertion is what keeps this from being an empty
 *     shell, and it is the one to look at first if the set is ever questioned.
 */
// EMPTY: rule 1 fired. `ast-grep-sg-via-bash` was P6-T6's forward promise and
// P6-T7 DECLARED it in tests/e2e/drive.mjs, so the rule struck it — the set is
// empty because the promise was discharged, not because the mechanism was removed.
// The set and both rules stay in place: the next forward promise has to be
// written down here to exist, and rule 2 (`keyword-mode-ultrawork` must never
// reappear) runs over the retired name literally, empty set or not.
const FORWARD_PROMISE_SCENARIOS = new Set<string>([])

/**
 * PHASE 6 ROWS AND THEIR DOC HOME (P6-T6; the human-readable half of the
 * FORKS.md §0-1 ruling made executable). The c14 union (COVERAGE_BASELINE_PATHS)
 * is NOT extended this phase — `phase6-mcp-editing.md` is outside it, and the
 * arbiter's ruling names the manual backstops (门 7 doc consistency + T10
 * compliance review). That ruling says nothing about THIS unit test, which would
 * otherwise make a Phase 6 pending row structurally unpairable (no union doc row
 * exists) and a future Phase 6 flip structurally IMPOSSIBLE (the ported-side
 * equality would demand a union row). So the pairing splits, audibly:
 *   * union rows pair against the phase3/phase4 §1 docs, exactly as before;
 *   * ids registered below pair against their ANCHOR TEXT inside
 *     phase6-mcp-editing.md — a read-only file for port tasks (the parallel
 *     stream's), read here as EVIDENCE, never written;
 *   * the flip guard is live on both sides: while the manifest row is
 *     `pending` the anchor line must NOT claim 已移植; once it flips to
 *     `ported` the anchor line MUST claim it — so the flip still cannot happen
 *     on one side only, even though c14 never reads this document.
 * An id appearing in the roster but neither in the union nor registered here is
 * a third-face drift and goes red below.
 */
const PHASE6_ROSTER_ANCHORS: readonly {
  readonly id: string
  readonly docPath: URL
  readonly anchor: string
}[] = [
  {
    id: 'ast-grep-sg-provision',
    docPath: new URL('../../docs/plans/phase6-dev/phase6-mcp-editing.md', import.meta.url),
    // The G-1 row's decision span (verbatim substring of the §3 table row that
    // names this hook the fork-G ruling target and the H-37 pre-split).
    anchor: 'fork G 裁定对象',
  },
]

/**
 * The `SCENARIOS = [ … ]` array literal's source text, from its opening bracket
 * to the closer. Fragility note (P3-T20 review NIT-1): the depth counter reads
 * raw `[`/`]` and does NOT skip string literals, so it assumes the brackets
 * inside scenario strings stay net-balanced. Today they are — the scan lands on
 * the real closer and yields all 27 names (23 pre-P4-T13 + 4 keyword) — but an
 * unbalanced
 * `]` in a future scenario string would truncate early (a false red) and an
 * unbalanced `[` would over-read (silent only while no `name: '` follows the
 * array). A string-aware scanner would remove the assumption; left as-is to keep
 * this test's change surface minimal.
 */
function scenariosArraySource(source: string): string {
  const start = source.indexOf('const SCENARIOS = [')
  if (start < 0) throw new Error('drive.mjs: `const SCENARIOS = [` not found — scenario chain moved?')
  // The array entries are objects; match the bracket depth from the opening `[`.
  const open = source.indexOf('[', start)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]
    if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open, index + 1)
    }
  }
  throw new Error('drive.mjs: SCENARIOS array is unterminated')
}

/** `name: '…'` of every SCENARIOS entry, in chain order. */
function scenarioNames(source: string): string[] {
  return [...scenariosArraySource(source).matchAll(/\bname:\s*'([^']+)'/g)].map((match) => match[1])
}

const declaredScenarios = scenarioNames(e2eDriverSource)

/** The manifest rows with a given status (mirrors hooksByStatus without importing it). */
function rowsWithStatus(entries: readonly HookManifestEntry[], status: string): readonly HookManifestEntry[] {
  return entries.filter((entry) => entry.status === status)
}

/**
 * The recorded-scenario equality as a pure function of (parsed rows, roster) — the
 * assertion the mutation test below re-runs against a mutated doc. Extracted so
 * the real assertion and the reverse proof cannot drift apart.
 */
function scenarioMismatches(
  rows: readonly BaselineRow[],
  entries: readonly HookManifestEntry[],
): string[] {
  const mismatches: string[] = []
  for (const row of rows) {
    const manifestRow = entries.find((entry) => entry.id === row.id)
    const primary = row.scenarioNames[0]
    if (primary !== undefined && primary !== manifestRow?.e2eScenario) {
      mismatches.push(`${row.heading} records '${primary}' but manifest says '${manifestRow?.e2eScenario}'`)
    }
  }
  return mismatches
}

/** Is this id one of the registered phase6-anchored rows (outside the c14 union)? */
function isPhase6Anchored(id: string): boolean {
  return PHASE6_ROSTER_ANCHORS.some((entry) => entry.id === id)
}

/**
 * The anchor LINE for a registered phase6 id: the single line of its phase6
 * document that contains the anchor text (null when absent). The anchor is read
 * as EVIDENCE from the parallel stream's read-only file; the line is the flip
 * surface both faces assert against.
 */
function phase6AnchorLine(id: string): string | null {
  const registered = PHASE6_ROSTER_ANCHORS.find((entry) => entry.id === id)
  if (registered === undefined) return null
  const text = readFileSync(registered.docPath, 'utf8')
  return text.split('\n').find((line) => line.includes(registered.anchor)) ?? null
}

describe('P3-T20 vocabulary — manifest status ⟺ coverage-baseline 状态', () => {
  it('the roster uses exactly the two mapped terms (`ported` ⟺ 已移植, `pending` ⟺ 待移植)', () => {
    // If a third term appears, this list changes and the mapping comment above
    // must be extended in the same commit — the point is pinning the SET, not
    // just the count.
    // The SET of terms the roster actually uses, checked as a SUBSET of the legal
    // vocabulary — NOT as an equality against both terms. Requiring the equality
    // would encode "both terms must always exist" into what is only a vocabulary
    // check; the roster has moved through both shapes (fully ported after P4-T13,
    // one pending row again since P6-T6's `ast-grep-sg-provision`) and the
    // subset form survives every one of them. The subset form states the real
    // claim — no term outside the two is in use — and the non-vacuity assertion
    // below keeps it from passing on an empty roster.
    //
    // WHICH SHAPE TODAY (pinned by the it-blocks below, not here): one `pending`
    // row (`ast-grep-sg-provision`, P6-T6) and fifteen `ported` rows; the
    // pending/ported partition and the phase6 anchor pairing are the load-bearing
    // assertions, so a roster that had merely LOST rows would not pass. The
    // double-sided flip itself is c14's contract for the union rows and the
    // PHASE6_ROSTER_ANCHORS flip-guard for the phase6 row — which is why the
    // pending set below is a state and not a wish.
    const statuses = [...new Set(HOOK_MANIFEST.map((row) => row.status))].sort()
    for (const status of statuses) {
      expect([PENDING_STATUS, PORTED_STATUS]).toContain(status)
    }
    // Non-vacuous: the roster is not empty, so the subset check saw something.
    expect(statuses.length).toBeGreaterThan(0)
    expect(HOOK_MANIFEST.length).toBeGreaterThan(0)
  })

  it('the two halves partition — the ported side IS the baseline 已移植 set', () => {
    const pendingIds = rowsWithStatus(HOOK_MANIFEST, PENDING_STATUS).map((row) => row.id)
    const portedIds = rowsWithStatus(HOOK_MANIFEST, PORTED_STATUS).map((row) => row.id)
    // P6-T6 split, audibly (see PHASE6_ROSTER_ANCHORS): the union-side ported
    // rows equal the baseline's 已移植 set, in the SAME order (the manifest is
    // authored in priority order and the baseline mirrors it); the Phase 6 row
    // lives outside the union by the §0-1 ruling and is accounted by anchors.
    const unionPortedIds = portedIds.filter((id) => !isPhase6Anchored(id))
    expect(unionPortedIds).toEqual(baselineRows.map((row) => row.id))
    // The pending side is EMPTY and STAYS PINNED to empty: P6-T6 reopened what
    // P4-T13 had closed, and P6-T7 closed it again — `ast-grep-sg-provision`
    // flipped to 'ported' together with its `ast-grep-sg-via-bash` scenario, its
    // reverse canary, and the phase6-mcp-editing.md §3/§6 cells. Pinned to the
    // exact set rather than left unasserted, because an over-broad expectation is
    // the easiest kind to satisfy by accident: `toEqual([])` here means a row
    // arriving 'pending' in future must be written down to pass again.
    expect(pendingIds).toEqual([])
    // …H-33 specifically is on the ported side, and it is the row whose flip
    // closed the pending era — a typo in the id, or a flip of the wrong row,
    // breaks here rather than passing on a loose pending set.
    expect(portedIds).toContain('keyword-detector')
    // …and the doc side must agree, or the manifest would claim a port the
    // coverage baseline has not recorded. (This is c14's `missing` direction, at
    // unit level: it goes red until the doc cell is flipped in the same commit.)
    expect(baselineRows.map((row) => row.id)).toContain('keyword-detector')
    // The partition is real: no id on both sides, and nothing falls through.
    expect(pendingIds.filter((id) => portedIds.includes(id))).toEqual([])
    expect(pendingIds.length + portedIds.length).toBe(HOOK_MANIFEST.length)
    // No third face: every union-side id (pending or ported) that is NOT a
    // registered phase6 row must have a union baseline counterpart, and every
    // registered anchor id must really be in the roster. A new row appearing in
    // the roster without joining either face is exactly the drift this catches.
    const anchoredIds = PHASE6_ROSTER_ANCHORS.map((entry) => entry.id)
    for (const id of HOOK_IDS) {
      if (isPhase6Anchored(id)) continue
      expect(baselineRows.map((row) => row.id), `roster id ${id} belongs to neither c14 face`).toContain(id)
    }
    for (const id of anchoredIds) {
      expect(HOOK_IDS, `phase6 anchor names a non-roster id`).toContain(id)
    }
  })

  it('every pending manifest row HAS a documented non-ported row (the flip anchor)', () => {
    // P4-T12's addition. A 'pending' manifest row with NO doc row is a row whose
    // eventual pending → ported flip has nothing to edit on the human-readable
    // side — the two-halves discipline would silently end there. This is the
    // assertion that makes "flip both sides in one commit" enforceable rather
    // than merely documented in manifest.ts's row comment.
    //
    // P6-T6 made the loop LIVE again (the pending set is no longer empty) and
    // split it across the two faces (see PHASE6_ROSTER_ANCHORS): a pending row
    // pairs against a non-ported UNION §1 row OR against its registered phase6
    // anchor line, and the anchor line must NOT already claim 已移植 while the
    // manifest row is still pending — the flip-guard half of the §0-1 split.
    const documentedPending = allBaselineRows.filter((row) => !row.ported)
    const pendingIds = rowsWithStatus(HOOK_MANIFEST, PENDING_STATUS).map((row) => row.id)
    const portedIds = rowsWithStatus(HOOK_MANIFEST, PORTED_STATUS).map((row) => row.id)
    // The pairing claim: every pending manifest row must have a non-ported
    // baseline row OR a registered, still-unflipped phase6 anchor, so its flip
    // has a doc cell to change.
    // EMPTY since P6-T7's flip. The loop below therefore has no iteration today,
    // and that is the honest shape of a closed flip anchor — the guard is kept
    // because the next pending row re-lights it, and because the phase6 flip
    // guard (the 已移植 direction) is asserted unconditionally further down.
    expect(pendingIds).toEqual([])
    for (const id of pendingIds) {
      const doc = documentedPending.find((row) => row.id === id)
      if (isPhase6Anchored(id)) {
        // The phase6 face: the anchor exists in the parallel stream's document
        // (read-only evidence), and while the manifest row is pending the anchor
        // line must not claim the port.
        const anchorLine = phase6AnchorLine(id)
        expect(anchorLine, `pending row ${id} has no anchor line in its phase6 doc`).not.toBeNull()
        expect(anchorLine ?? '', `pending row ${id} anchor already claims 已移植`).not.toContain('已移植')
        continue
      }
      expect(doc, `pending manifest row ${id} has no non-ported baseline row`).toBeDefined()
      // What happened to the bare `待移植` assertion that used to live here, and
      // why: commit e552cad rewrote H-33's status cell to a more precise
      // NON-ported state — `📋 代码已落地（P4-T12，commit 988a547）；ported 翻转随
      // P4-T13 e2e 与 manifest status 同 commit 双侧同步（c14 契约）`. It no longer
      // contains the literal 待移植, while still being (correctly) classified
      // non-ported by the parser, because c14's port group is keyed on the
      // POSITIVE 已移植 marker. So the `toContain(BASELINE_PENDING_MARKER)`
      // assertion was deleted as unsatisfiable, and what replaced it is the
      // claim that actually matters for a flip: the cell is non-empty AND the
      // parser still classifies the row as not-ported. That is strictly stronger
      // against the failure this guards — a silently collapsed non-ported side —
      // while surviving the legitimate reworded cell.
      expect(doc?.statusCell, `pending row ${id} has an empty status cell`).not.toBe('')
      expect(doc?.ported, `pending row ${id} parsed as ported`).toBe(false)
    }
    // The flip-guard's other half (P6-T6): a phase6 row that has ALREADY flipped
    // to 'ported' must find 已移植 in its anchor line — c14 never reads this
    // document, so this is the unit-level half of "flip both sides in one
    // commit" for the phase6 face. Empty today (the row is pending), but the
    // loop is the rule that will hold the day it flips.
    for (const id of portedIds.filter(isPhase6Anchored)) {
      const anchorLine = phase6AnchorLine(id)
      expect(anchorLine, `ported row ${id} has no anchor line in its phase6 doc`).not.toBeNull()
      expect(anchorLine ?? '', `ported row ${id} anchor does not yet claim 已移植`).toContain('已移植')
    }
    // And the reverse: a non-ported doc row whose manifest row is already
    // 'ported' is a doc that was never flipped (or was flipped late).
    expect(documentedPending.filter((row) => portedIds.includes(row.id))).toEqual([])
  })

  it('the baseline parser sees every manifest row, ported or not (non-vacuity)', () => {
    // A table-format change that made the parser see 0 rows must be LOUD here,
    // not silently green (the c14 vacuity guard's sibling). BOTH halves of the
    // union must contribute: a document whose §1 table drifted away would leave
    // the union silently carried by the other one.
    //
    // The parsed row count is deliberately NOT EXPECTED_HOOK_COUNT: §1 of a
    // baseline also lists 跳过 rows (phase3-hooks.md H-08 / H-09 carry a
    // 跳过 disposition and no status cell at all). The manifest only ever
    // carries port-group rows, so the count identity that matters is
    // "every manifest id is documented exactly once" — asserted below.
    // P6-T6 narrows it audibly to the UNION face: the phase6-anchored ids are
    // documented in phase6-mcp-editing.md (the registered anchor above), NOT in
    // the c14 union, per the §0-1 ruling — the anchor's existence is asserted
    // right below, so the id is never undocumented, just documented elsewhere.
    for (const doc of baselineDocuments) {
      const own = parseBaselineRows(doc.markdown)
      expect(own.length, `${doc.label} contributed no §1 rows`).toBeGreaterThan(0)
    }
    const documentedIds = allBaselineRows.map((row) => row.id)
    expect(new Set(documentedIds).size, 'a §1 row is documented twice').toBe(documentedIds.length)
    expect(HOOK_IDS.filter((id) => !documentedIds.includes(id) && !isPhase6Anchored(id))).toEqual([])
    for (const entry of PHASE6_ROSTER_ANCHORS) {
      expect(phase6AnchorLine(entry.id), `phase6 anchor '${entry.anchor}' absent from ${relative(process.cwd(), fileURLToPath(entry.docPath))}`).not.toBeNull()
    }
    // Every parsed ported row really carries the mapped marker in its STATUS
    // CELL — the cell-scoped contract with c14, asserted directly rather than
    // inferred from the row count.
    for (const row of allBaselineRows) {
      if (row.ported) expect(row.statusCell, row.heading).toContain(BASELINE_PORTED_MARKER)
    }
    // Anti-vacuity for the port group itself: the 已移植 set is not empty, and
    // it is NOT the whole §1 set (a matcher that accepted every row would make
    // the equality tests below agree with anything).
    expect(baselineRows.length).toBeGreaterThan(0)
    expect(baselineRows.length).toBeLessThan(allBaselineRows.length)
  })
})

describe('P3-T20 consistency — the ported manifest rows ⟺ the baseline union 已移植 rows', () => {
  it('the ported id sets agree in BOTH directions (with the one documented v5 rename)', () => {
    // The ported side of the manifest vs the 已移植 side of the union. The
    // `pending` row is excluded on BOTH sides symmetrically (the P4-T12
    // evolution, mirroring c14): a row is 'ported' here exactly when its
    // baseline status cell says 已移植.
    const baselineIds = baselineRows.map((row) => row.id)
    const portedIds = rowsWithStatus(HOOK_MANIFEST, PORTED_STATUS).map((row) => row.id)
    // The phase6-anchored row is excluded on the UNION side, symmetrically with
    // the way the pending row used to be excluded here: `ast-grep-sg-provision`
    // lives outside the c14 union by the FORKS.md §0-1 ruling, so its doc home
    // is the phase6 anchor line, not a §1 row. Comparing it against the union
    // would demand a union row the ruling forbids — the §0-1 split has to be
    // visible HERE, on the comparison, or the split is only a comment.
    const unionPortedIds = portedIds.filter((id) => !isPhase6Anchored(id))
    expect(new Set(baselineIds).size).toBe(baselineIds.length)
    expect(baselineIds).toEqual(unionPortedIds)
    expect(unionPortedIds.filter((id) => !baselineIds.includes(id))).toEqual([])
    expect(baselineIds.filter((id) => !unionPortedIds.includes(id))).toEqual([])
    // The two sides together still account for the WHOLE roster: nothing is
    // unaccounted for, and nothing is double-counted. The phase6-anchored rows
    // join on the doc side as their ANCHOR ids, not as union §1 rows — the same
    // §0-1 split as above, applied to the arithmetic so the accounting closes
    // over all three faces (union-ported, union-pending, phase6-anchored)
    // instead of silently leaving the phase6 row outside the sum.
    const anchoredIds = PHASE6_ROSTER_ANCHORS.map((entry) => entry.id)
    expect([...baselineIds, ...anchoredIds, ...rowsWithStatus(HOOK_MANIFEST, PENDING_STATUS).map((r) => r.id)].sort())
      .toEqual([...HOOK_IDS].sort())
  })

  it('the baseline 模块 names match the manifest upstream paths', () => {
    // The id check above is rename-tolerant; this one pins the OTHER half of the
    // rename: the module NAME in the doc must still be the upstream directory, so
    // `start-work` cannot silently become `ulw-execute` in the doc (which would
    // erase the v4.19.4 provenance the 署名 discipline depends on). Exactly ONE
    // rename is legal — a second entry means the two halves forked their naming.
    const renamed = baselineRows.filter((row) => row.id !== row.moduleName)
    expect(renamed.map((row) => `${row.heading} ${row.moduleName} → ${row.id}`))
      .toEqual(['H-32 start-work → ulw-execute'])
  })

  it('every scenario the baseline DOES record equals that row\'s manifest e2eScenario', () => {
    // At the TERMINAL baseline every §1 row names its scenario inside the status
    // cell (no row records 已移植 + task ids alone), and the manifest always
    // carries one. Two allowances stay deliberate and stated rather than implied:
    //   * one-directional in FORM (recorded ⟹ equal) — the reverse direction is
    //     covered jointly by the no-empty-scenario test below (no row may be
    //     silent) and the drive.mjs presence test (no manifest name may be fake);
    //   * a cell may record a trigger scenario AND its 对照 (H-32), so the
    //     manifest's single `e2eScenario` is compared against the FIRST recorded
    //     name and every EXTRA name is required to be a real drive.mjs scenario
    //     (asserted globally by the presence test).
    const mismatches: string[] = scenarioMismatches(baselineRows, HOOK_MANIFEST)
    expect(mismatches).toEqual([])
    // The multi-scenario rows are a known, pinned set — H-32 is the only one.
    const multi = baselineRows.filter((row) => row.scenarioNames.length > 1)
    expect(multi.map((row) => `${row.heading}: ${row.scenarioNames.join(', ')}`))
      .toEqual(['H-32: ulw-execute-activated, ulw-execute-no-intent'])
  })

  it('every §1 row names its scenario — full naming is part of exit criterion b', () => {
    // TERMINAL-state assertion, replacing the writing-time「known 7 unnamed」
    // allowance. The arbiter's §1 backfill (docs/plans/phase3-dev/phase3-hooks.md
    // §1) gave all 14 rows a scenario name, so the expected set is the EMPTY set:
    // naming every row is now a component of exit criterion b, and a row that
    // forgets to name its scenario is caught here directly.
    const withoutScenario = baselineRows
      .filter((row) => row.scenarioNames.length === 0)
      .map((row) => row.heading)
    expect(withoutScenario).toEqual([])
    // ⚠️ This runs over the PORTED rows only, and must keep doing so. A 'pending'
    // row's `e2eScenario` may be a not-yet-written scenario (a later task's
    // deliverable), so demanding a declared scenario of it would encode "pending
    // is impossible" into the suite. The 'pending' side is covered separately, by
    // the forward-promise registry test below — which is where the exemption now
    // lives, and where it is forced to be registered rather than implicit.
    // Anti-vacuity, against both ways that `[]` could lie: the parser must
    // still see every ported row (an empty row set is trivially []), and every
    // row's scenarioNames must be non-empty (a lost scenario column or an
    // over-tight SCENARIO_TOKEN must not shrink the check to nothing).
    // The union's row count equals the UNION-side ported count, with the
    // phase6-anchored rows subtracted — the §0-1 split again, on the count.
    expect(baselineRows.length).toBe(
      rowsWithStatus(HOOK_MANIFEST, PORTED_STATUS).filter((row) => !isPhase6Anchored(row.id)).length,
    )
    for (const row of baselineRows) {
      expect(row.scenarioNames, row.heading).not.toEqual([])
    }
  })

  it('every manifest e2eScenario is a REAL scenario name in tests/e2e/drive.mjs SCENARIOS', () => {
    // The grep-level assertion the task book asks for, strengthened from "appears
    // somewhere in the file / in a comment" to "is a declared SCENARIOS entry":
    // a commented-out or renamed scenario now fails instead of matching text.
    // The baseline's SECONDARY recorded scenarios are checked too (H-32's
    // `ulw-execute-no-intent` lives in §1 but is deliberately not a manifest
    // `e2eScenario`), so a stale 对照 name cannot survive on the doc side either.
    expect(declaredScenarios.length).toBeGreaterThan(0)
    expect([...new Set(declaredScenarios)].length).toBe(declaredScenarios.length)
    const baselineScenarios = baselineRows.flatMap((row) => row.scenarioNames)
    // ⚠️ The manifest side is the PORTED rows only, and must keep doing so: a
    // 'pending' row may name a scenario drive.mjs has not declared yet, so
    // including it here would make the suite red for a correct intermediate
    // state. The 'pending' side is not left unchecked — it is the
    // forward-promise registry test below, which requires such a name to be
    // either declared or registered in FORWARD_PROMISE_SCENARIOS, so it can
    // never be lost, misspelled, or quietly forgotten.
    const portedRows = rowsWithStatus(HOOK_MANIFEST, PORTED_STATUS)
    const wantScenarios = [...portedRows.map((row) => row.e2eScenario), ...baselineScenarios]
    const missing = [...new Set(wantScenarios)].filter((scenario) => !declaredScenarios.includes(scenario))
    expect(missing).toEqual([])
    // Every ported manifest scenario is distinct: the count is the second half
    // of the "no duplicate-name collision" guard.
    expect(new Set(portedRows.map((row) => row.e2eScenario)).size).toBe(portedRows.length)
    expect(new Set(baselineScenarios).size).toBe(baselineScenarios.length)
  })

  it('every row names a REAL drive.mjs scenario, or a registered forward promise', () => {
    // A `pending` row is allowed to name a scenario that does not exist yet —
    // that IS what 'pending' means (its e2e is a later task's deliverable), and
    // demanding a declared scenario of it would encode "pending is impossible"
    // into the suite. But the exemption must be EXPLICIT and self-discharging,
    // not a silent hole: a promise that is not registered here is a failure, and
    // a registered promise disappears from the set the moment the scenario ships
    // (asserted below), so the exemption cannot rot into a permanent blind spot.
    const undeclared = HOOK_MANIFEST
      .filter((row) => !declaredScenarios.includes(row.e2eScenario)
        && !FORWARD_PROMISE_SCENARIOS.has(row.e2eScenario))
      .map((row) => `${row.id} -> ${row.e2eScenario}`)
    expect(undeclared).toEqual([])

    // Anti-rot, rule 1: a promise that HAS been delivered must be struck from
    // the set. Keeping it would re-open the hole above for a scenario that now
    // exists, and a later regression in that scenario would no longer be caught.
    const discharged = [...FORWARD_PROMISE_SCENARIOS].filter((name) => declaredScenarios.includes(name))
    expect(discharged).toEqual([])

    // Anti-rot, rule 2: the only promise this suite has ever carried is struck
    // out, and it must never come back. P4-T12 named `keyword-mode-ultrawork`
    // for H-33; P4-T13 shipped `ultrawork-keyword-injected` instead, so the old
    // name was never written and must not be resurrected on either side.
    expect(FORWARD_PROMISE_SCENARIOS.has('keyword-mode-ultrawork')).toBe(false)
    expect(declaredScenarios).not.toContain('keyword-mode-ultrawork')
    expect(HOOK_MANIFEST.map((row) => row.e2eScenario)).not.toContain('keyword-mode-ultrawork')
    // The keyword row points at the primary of the four P4-T13 scenarios; the
    // three siblings are one per keyword type plus the negative controls. (The
    // original reason — "the session one-shot (S-6) makes 'injected' and
    // 'injected again' mutually exclusive" — was struck in PR #10's review: that
    // gate was deleted, so a session can now arm twice. The scenarios still do
    // not share a session, but because each asserts about its OWN injected text.)
    const keyword = HOOK_MANIFEST.find((row) => row.id === 'keyword-detector')
    expect(keyword?.e2eScenario).toBe('ultrawork-keyword-injected')
    for (const sibling of ['keyword-negative-controls', 'hyperplan-keyword-injected', 'combo-keyword-injected']) {
      expect(declaredScenarios, sibling).toContain(sibling)
    }
  })
})

describe('P3-T20 parser — the shared cell-scoped status contract', () => {
  it('a 跳过 row quoting 已移植 in its REASON is not a §1 port row', () => {
    // The shared-contract control. Both records match the STATUS CELL, so a skip
    // row whose reason quotes the word must not phantom-match. The fabricated row
    // is `H-99` — a genuine `H-xx` heading — because the earlier `S-99` form never
    // reached the status-cell check at all: the `^\|\s*(H-\d+)\s*\|` heading
    // anchor rejected it first, which made this control vacuous (P3-T20 review
    // MAJOR-2). With `H-99` the row is actually tested against the matcher.
    const parsed = parseBaselineRows(FABRICATED_MARKER_QUOTING_DOC).filter((row) => row.ported)
    expect(parsed.map((row) => row.id)).toEqual(['bash-file-read-guard'])
    expect(parsed[0]?.scenarioNames).toEqual(['bash-read-guard-warned'])
    // And the drop is on the STATUS-CELL rule, not on the heading anchor: the
    // fabricated H-99 row IS parsed, it is just not ported.
    expect(parseBaselineRows(FABRICATED_MARKER_QUOTING_DOC).map((row) => row.id))
      .toEqual(['ghost-hook', 'bash-file-read-guard'])
  })

  it('the H-99 control really bites: a LINE-scoped matcher phantom-matches it', () => {
    // Reverse proof of the control above, so it cannot silently go vacuous again.
    // The identical parser body is re-run under the line-scoped matcher c14 used
    // before this changeset's T19 NIT-1 fix — the shape a regression HERE would
    // take: the 已移植 quoted in H-99's REASON then selects the skip row, flipping
    // the control's expectation from ['bash-file-read-guard'] to
    // ['ghost-hook', 'bash-file-read-guard']. So if a future edit re-loosens this
    // parser's default matcher, the control test above turns red.
    const loosened = parseBaselineRows(
      FABRICATED_MARKER_QUOTING_DOC,
      (_statusCell, line) => line.includes(BASELINE_PORTED_MARKER),
    ).filter((row) => row.ported)
    expect(loosened.map((row) => row.id)).toEqual(['ghost-hook', 'bash-file-read-guard'])
    // And the discrimination is real on BOTH sides: the skip row's status cell
    // does NOT carry the marker (so any cell-scoped matcher skips it) while its
    // line does (so any line-scoped matcher selects it).
    const skipRow = FABRICATED_MARKER_QUOTING_DOC.split('\n').find((line) => line.startsWith('| H-99 '))
    expect(skipRow).toBeDefined()
    expect(skipRow).toContain(BASELINE_PORTED_MARKER)
    const skipHeading = skipRow?.match(/^\|\s*(H-\d+)\s*\|(.*)$/)
    expect(skipHeading).not.toBeNull()
    const skipCells = (skipHeading?.[2] ?? '').split('|').map((cell) => cell.trim())
    expect(skipCells[4]).not.toContain(BASELINE_PORTED_MARKER)
  })
})

describe('P3-T20 mutation sensitivity — the assertions above really bite', () => {
  it('flipping ONE status away from `ported` breaks the vocabulary mapping', () => {
    // Reverse proof, in-process: mutate the REAL roster (a copy, never the
    // module) and re-run the vocabulary computation. A test that only read
    // HOOK_MANIFEST could never fail this way, which is why the checks above are
    // derived from the parsed doc AND the roster rather than from either alone.
    const mutated = HOOK_MANIFEST.map((row, index) => (index === 0 ? { ...row, status: 'pending' } : row))
    const statuses = [...new Set(mutated.map((row) => row.status))]
    // The positive half first, so `.not` cannot pass vacuously on a broken fixture.
    expect(statuses).toContain('pending')
    expect(statuses).not.toEqual([PORTED_STATUS])
    expect(rowsWithStatus(mutated, PORTED_STATUS).map((row) => row.id)).not.toEqual([...HOOK_IDS])
  })

  it('changing ONE manifest scenario name breaks the drive.mjs membership check', () => {
    // Mutate row 0 (a PORTED row) so the membership check above is the one
    // under test — mutating the pending row instead would prove nothing, since
    // that check deliberately skips pending scenarios (P4-T12).
    expect(HOOK_MANIFEST[0]?.status).toBe(PORTED_STATUS)
    const mutated = HOOK_MANIFEST.map((row, index) => (
      index === 0 ? { ...row, e2eScenario: 'bash-read-guard-warned-TYPO' } : row
    ))
    const ported = mutated.filter((row) => row.status === PORTED_STATUS)
    const missing = ported
      .map((row) => row.e2eScenario)
      .filter((scenario) => !declaredScenarios.includes(scenario))
    expect(missing).toEqual(['bash-read-guard-warned-TYPO'])
  })

  it('changing ONE baseline scenario name breaks the recorded-scenario equality', () => {
    // The doc-side mutation: re-parse a baseline whose H-02 status cell names a
    // different scenario, and re-run the equality the suite asserts. Everything is
    // DERIVED from the parsed baseline (the recorded name and the manifest's) so
    // this test mutates a VALID doc no matter what the two currently say — a
    // hard-coded literal here would, after someone else's edit, mutate the
    // mutation-proof input instead of the tested property.
    const row = baselineRows.find((entry) => entry.heading === 'H-02')
    const recorded = row?.scenarioNames[0]
    expect(recorded).toBeDefined()
    const manifestScenario = HOOK_MANIFEST.find((entry) => entry.id === row?.id)?.e2eScenario
    // The precondition the mutation builds on: the doc and the manifest agree
    // here (the suite's own assertion), so `-x` is a REAL divergence.
    expect(recorded).toBe(manifestScenario)
    const mutatedScenario = `${recorded}-x`
    const mutatedDoc = baselineMarkdown.replace(`\`${recorded}\``, `\`${mutatedScenario}\``)
    expect(mutatedDoc).not.toBe(baselineMarkdown)
    const mutatedRows = parseBaselineRows(mutatedDoc).filter((entry) => entry.ported)
    expect(scenarioMismatches(mutatedRows, HOOK_MANIFEST)).toEqual([
      `H-02 records '${mutatedScenario}' but manifest says '${manifestScenario}'`,
    ])
  })
})
