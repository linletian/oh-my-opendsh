#!/usr/bin/env node
// scripts/assert-team-probe-face.mjs — P5-T10: the TWO team faces of
// scripts/concerto-mode-probe.sh, in ONE script so the probe's live boots and
// its hermetic defect legs run the SAME assertions (the
// tests/e2e/assert-concerto-read-face.mjs / drive.mjs-runAnalysisSelfTest
// precedent — a green live face and a lying assertion are indistinguishable
// until a fabricated defect log runs through the same code).
//
// Usage:
//   node scripts/assert-team-probe-face.mjs present <boot-log>
//   node scripts/assert-team-probe-face.mjs absent  <boot-log>
//   node scripts/assert-team-probe-face.mjs --self-test
//
// ── FACE `present` — the omo-team 在场形态 (both normal probe boots) ─────────
//   namedToolLines  — `[omo-team] team surface team_create|team_send_message|
//                     team_status registered`, each BY NAME. These three are the
//                     canonical trio of the (B)-form execution surface (组建 /
//                     消息 / 状态机读面, manifest ids pinned by
//                     tests/omo-team/manifest.test.ts); the FULL registered set
//                     is derived and asserted by the probe itself above this
//                     call — the trio is the named, human-readable half of that
//                     evidence, not a replacement for it.
//   stateMachineAnswer — the state machine's own boot line, shape DERIVED from
//                     the plugin's shipped `formatTeamBootResumeLine`
//                     (boot-markers.ts — single source; index.ts logs it exactly
//                     once per boot and ONLY after rebuildIndexes() + the
//                     vendored resumeAllTeams() RESOLVED, five counters, in
//                     order; measured verbatim at the kept e2e sandbox boot.log:
//                     `[omo-team] boot resume: resumed=0, failed=0, orphaned=0,
//                     cleaned=0, errors=0`). A state machine that never
//                     initialized cannot print it — that is the honest anchor the
//                     task demands (no fake RPC: the probe has no model key, so
//                     it does not pretend to open a session; it reads the
//                     machine's OWN durable answer instead).
//   bootClean       — exactly ONE such line, `errors=0` at its END (anchored
//                     `/errors=0$/` — a forged `errors=05` tail must NOT read
//                     clean; review NIT, and the self-test's
//                     `state-machine-answer-errors-nonzero` leg forges EXACTLY
//                     that tail, because it is the only shape that separates the
//                     anchor from a loose `includes('errors=0')`), and NO
//                     `[omo-team] boot resume error:` line — the sandbox is
//                     pristine, so a non-zero counter here is real damage.
//   noLoudForms     — `[omo-team] boot resume FAILED` and
//                     `[omo-team] team surface … FAILED` ABSENT (the loud-but-
//                     non-fatal forms; their absence is asserted, and the
//                     fabricated loud log proves the assertion fires).
//
// ── FACE `absent` — the omo-team 缺席形态 (the probe's `noteam` boot: the
//    profile installs only the OTHER THREE plugins, so cordis.yml's fourth
//    insert row cannot import) ──────────────────────────────────────────────────
//   hostWarnsInactiveRow / hostNamesOmoTeam — the host's NAMED degradation
//     pair, measured verbatim on the pinned dsh 0.2.0-rc.2:
//       `dsh: warning: 1 entry did not activate`
//       `omo-team (@oh-my-opendsh/omo-team): failed to import`
//     Canary discipline: an absent plugin is LOUD and NAMES ITSELF — never a
//     silent half-mount. If a future host drops the named warning, this leg
//     goes red by name.
//   noLoadedMarker / noRegisteredLines / noStateMachineBootAnswer — ZERO
//                     `[omo-team]` markers of any shape (loaded / team surface
//                     … registered / boot resume): the negative half of the
//                     SAME strings the present face asserts present, so the
//                     bidirectionality is by construction.
//   noOmoTeamMarkerAtAll — the CATCH-ALL (review MINOR, mcode): ZERO
//                     `[omo-team]` of ANY shape, named or not — the FOURTH of
//                     this face's four zero-marker checks, sitting on top of
//                     the three NAMED leak checks (which keep their per-leg
//                     attribution) and closing the gap between them: a marker
//                     like `[omo-team] manifest validation FAILED` is none of
//                     the three named shapes and used to slip through green.
//     Readiness is NOT asserted either way: loudness is the discipline; the
//     probe REPORTS whether the never-ready rc.2 shape still holds.
//
// ── `--self-test` — hermetic defect legs (drive.mjs --self-test precedent):
//    the fabricated GOOD log of each face PASSES, and every fabricated defect
//    FAILs on EXACTLY the ordered set of named checks it DECLARES — ONLY-own-
//    check, drive.mjs:13631 discipline (review MINOR, mcode): a leg may not
//    go green by riding a co-fired check it never declared, and a check that
//    starts reddening the WRONG leg stops being invisible. SIXTEEN defect legs
//    — four declare TWO checks, because their fabrication reddens two by
//    construction (measured, not arranged); the other twelve declare one. Plus
//    the derived-shape leg = the 17 the PASS banner attests to (the count the
//    probe's own banner repeats).
//    Run by the probe BEFORE any spawn, so the two live boots cannot go green
//    on assertions that are lying.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The state-machine answer shape, DERIVED from the plugin's own shipped
// formatter — never transcribed here (P4-T16 再审 ③ discipline: the probe
// names what it derives, and the numbers live in one place). Distinct
// multi-digit sentinels so each counter becomes its own \d+ group.
async function deriveStateMachineAnswerRegex() {
  const { formatTeamBootResumeLine } = await import(
    pathToFileURL(join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-team', 'src', 'boot-markers.ts')).href
  )
  const sentinel = formatTeamBootResumeLine({
    resumed: 1111,
    marked_failed: 2222,
    marked_orphaned: 3333,
    cleaned: 4444,
    errors: new Array(5555),
  })
  const escaped = sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped
    .replace('1111', '\\d+')
    .replace('2222', '\\d+')
    .replace('3333', '\\d+')
    .replace('4444', '\\d+')
    .replace('5555', '\\d+')}$`, 'm')
}

const TOOL_TRIO = ['team_create', 'team_send_message', 'team_status']

// ── host-owned strings, measured verbatim on dsh 0.2.0-rc.2 (the pin) ───────
const HOST_WARN_INACTIVE = /^dsh: warning: \d+ entr(?:y|ies) did not activate$/m
const HOST_NAMES_OMO_TEAM = /^omo-team \(@oh-my-opendsh\/omo-team\): failed to import$/m

/**
 * PRESENT face. Returns { problems, passed } — problems is the list of named
 * failed checks (empty = PASS).
 */
export async function assertPresentFace(bootLog) {
  const answerRe = await deriveStateMachineAnswerRegex()
  const problems = []
  for (const id of TOOL_TRIO) {
    if (!bootLog.includes(`[omo-team] team surface ${id} registered`)) {
      problems.push(`namedToolLine:${id}`)
    }
  }
  const answerLines = bootLog.split('\n').filter((line) => answerRe.test(line))
  if (answerLines.length < 1) problems.push('stateMachineAnswer:line')
  if (answerLines.length > 1) problems.push(`stateMachineAnswer:exactly-one(saw ${answerLines.length})`)
  // ANCHORED `/errors=0$/` on the already whole-line-validated answer line
  // (P5-T10 review NIT): the derived regex ends its errors field with `\d+`,
  // so a substring `includes('errors=0')` would also accept the forged tail
  // `errors=05` — the end anchor closes that hole.
  if (answerLines.length === 1 && !/errors=0$/.test(answerLines[0])) {
    problems.push(`bootClean:errors(non-zero in "${answerLines[0]}")`)
  }
  if (bootLog.includes('[omo-team] boot resume error:')) problems.push('bootClean:resume-error-line')
  if (bootLog.includes('[omo-team] boot resume FAILED')) problems.push('noLoudForms:boot-resume-FAILED')
  if (/\[omo-team\] team surface .+ FAILED/.test(bootLog)) problems.push('noLoudForms:team-surface-FAILED')
  return { problems, passed: problems.length === 0 }
}

/**
 * ABSENT face. Same contract shape. FOUR "no…" checks, and the fourth is a
 * check, not a footnote (P5-T10 delta review NIT: this doc still said "the
 * three" and "NEITHER trio" after the catch-all joined the list):
 *   1. `noLoadedMarker`
 *   2. `noRegisteredLines`
 *   3. `noStateMachineBootAnswer`
 *        the THREE NAMED negatives — the exact negatives of the present face's
 *        assertions, and that is the bidirectionality; each keeps its own
 *        per-leg attribution (WHICH marker leaked).
 *   4. `noOmoTeamMarkerAtAll` — the catch-all (P5-T10 review MINOR, mcode),
 *        ON TOP of the named three and never replacing them: it closes the
 *        gap between them, because a `[omo-team]` marker of a shape NONE of
 *        the three names (e.g. `manifest validation FAILED`) used to pass this
 *        face green.
 */
export function assertAbsentFace(bootLog) {
  const problems = []
  if (!HOST_WARN_INACTIVE.test(bootLog)) problems.push('hostWarnsInactiveRow')
  if (!HOST_NAMES_OMO_TEAM.test(bootLog)) problems.push('hostNamesOmoTeam')
  if (bootLog.includes('[omo-team] loaded')) problems.push('noLoadedMarker')
  if (/\[omo-team\] team surface .+ registered/.test(bootLog)) problems.push('noRegisteredLines')
  if (bootLog.includes('[omo-team] boot resume')) problems.push('noStateMachineBootAnswer')
  if (/\[omo-team\]/.test(bootLog)) problems.push('noOmoTeamMarkerAtAll')
  return { problems, passed: problems.length === 0 }
}

// ── fabricated fixtures for --self-test ────────────────────────────────────────
// Built from the SAME derived shape so a formatter drift reddens both the
// live face and the self-test together.
async function fabricatedPresentLog(answerRe) {
  const answer = (await import(
    pathToFileURL(join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-team', 'src', 'boot-markers.ts')).href
  )).formatTeamBootResumeLine({ resumed: 0, marked_failed: 0, marked_orphaned: 0, cleaned: 0, errors: [] })
  return [
    '[omo-team] loaded: manifest 24 entries (pending=8, ported=14, recorded=2) — 14/24 team surfaces registered',
    '[omo-team] team surface team_create registered',
    '[omo-team] team surface team_send_message registered',
    '[omo-team] team surface team_status registered',
    answer,
  ].join('\n')
}

/**
 * ONLY-own-check comparison (P5-T10 delta review MINOR, mcode): ELEMENT-WISE
 * ordered equality of a leg's ACTUAL problem list against the list the leg
 * DECLARES. This is drive.mjs's `verdict.failed.join(',') !== expectedCheck`
 * discipline (drive.mjs:13631, the P5-T10 surface legs) carried over verbatim
 * in intent — a leg may redden NOTHING but what it declares — with one honest
 * mechanical difference: a join is not usable here, because the
 * `bootClean:errors(…)` problem string embeds the WHOLE answer line, commas
 * included, so `join(',')` would split one problem into five. Length plus
 * per-index equality is the same contract, unambiguous.
 */
function sameProblems(actual, expected) {
  return actual.length === expected.length && actual.every((p, i) => p === expected[i])
}

/**
 * Hermetic self-test. Returns the list of attested defect labels; pushes into
 * `problems` on any leg that misbehaves (GOOD must PASS, every defect must
 * FAIL on EXACTLY the ordered check set it declares — ONLY-own-check).
 */
export async function runSelfTest() {
  const problems = []
  const attested = []
  const answerRe = await deriveStateMachineAnswerRegex()

  // ── present face ──
  const goodPresent = await fabricatedPresentLog(answerRe)
  const goodPresentVerdict = await assertPresentFace(goodPresent)
  if (!goodPresentVerdict.passed) {
    problems.push(`fabricated GOOD present log must PASS, failed on: ${goodPresentVerdict.problems.join(', ')}`)
  }
  // Each leg declares the FULL ordered set of checks it reddens — transcribed
  // from the measured output of every leg, never guessed (see the P5-T10
  // delta-review NOTES). A leg that reddens a SECOND check declares both, so
  // the declaration stays honest and the comparison stays strict.
  const presentDefects = [
    ['team-create-registered-line-dropped', (log) => log.replace('[omo-team] team surface team_create registered', '[dropped]'), ['namedToolLine:team_create']],
    ['team-send-message-registered-line-dropped', (log) => log.replace('[omo-team] team surface team_send_message registered', '[dropped]'), ['namedToolLine:team_send_message']],
    ['team-status-registered-line-dropped', (log) => log.replace('[omo-team] team surface team_status registered', '[dropped]'), ['namedToolLine:team_status']],
    ['state-machine-answer-line-dropped', (log) => log.replace(/^.*boot resume: resumed=.*/m, '[dropped]'), ['stateMachineAnswer:line']],
    ['state-machine-answer-line-malformed-no-cleaned-counter', (log) => log.replace(/, cleaned=\d+/, ''), ['stateMachineAnswer:line']],
    ['state-machine-answer-line-twice', (log) => `${log}\n${log.split('\n').find((l) => answerRe.test(l)) ?? ''}`, ['stateMachineAnswer:exactly-one(saw 2)']],
    // THE ANCHOR'S OWN FALSIFIER (P5-T10 delta review MINOR, mcode). The
    // mutation used to be `errors=0`→`errors=2`, which reddens a LOOSE
    // `includes('errors=0')` cleanliness check too — so it could never reach
    // the hole the `/errors=0$/` anchor closed, and the anchoring fix could
    // have been reverted with this leg still green. `errors=05` is a forged
    // tail that CONTAINS the substring `errors=0` (the loose check reads it
    // CLEAN — measured, the bug) while its counter is non-zero, so ONLY the
    // end anchor rejects it: MEASURED red on `bootClean:errors(…errors=05)`.
    ['state-machine-answer-errors-nonzero', (log) => log.replace('errors=0', 'errors=05'), ['bootClean:errors(non-zero in "[omo-team] boot resume: resumed=0, failed=0, orphaned=0, cleaned=0, errors=05")']],
    ['boot-resume-error-line-present', (log) => `${log}\n[omo-team] boot resume error: index blew up`, ['bootClean:resume-error-line']],
    // Two declared checks, by construction: the loud form REPLACES the answer
    // line, so the state machine stops answering on the same leg that prints
    // the loud form. Both are this leg's own doing; both are declared.
    ['boot-resume-FAILED-loud-form-present', (log) => log.replace(/^.*boot resume: resumed=.*/m, '[omo-team] boot resume FAILED (loud-but-non-fatal): disk gone'), ['stateMachineAnswer:line', 'noLoudForms:boot-resume-FAILED']],
    ['team-surface-FAILED-loud-form-present', (log) => `${log}\n[omo-team] team surface team_status FAILED: Error: boom`, ['noLoudForms:team-surface-FAILED']],
  ]
  for (const [label, mutate, expectedProblems] of presentDefects) {
    const verdict = await assertPresentFace(mutate(goodPresent))
    if (!sameProblems(verdict.problems, expectedProblems)) {
      problems.push(`present defect "${label}" must FAIL on EXACTLY [${expectedProblems.join(' | ')}] and nothing else, got ${verdict.passed ? 'PASS (green on a fabricated defect)' : `[${verdict.problems.join(' | ')}]`}`)
    }
    attested.push(`present:${label}`)
  }

  // ── absent face ──
  const goodAbsent = [
    '[omo-agents] loaded',
    '[omo-hooks] loaded',
    '[omo-commands] loaded: manifest 6 entries (pending=1, ported=5) — 5/6 commands registered',
    'dsh: warning: 1 entry did not activate',
    'omo-team (@oh-my-opendsh/omo-team): failed to import',
  ].join('\n')
  const goodAbsentVerdict = assertAbsentFace(goodAbsent)
  if (!goodAbsentVerdict.passed) {
    problems.push(`fabricated GOOD absent log must PASS, failed on: ${goodAbsentVerdict.problems.join(', ')}`)
  }
  // Same ONLY-own-check contract as the present face, and the three named
  // LEAK legs are exactly where it bites: every one of them leaks a real
  // `[omo-team]` marker, so the catch-all reddens ON TOP of the named leg —
  // that double red is the honest shape of the evidence (named leg says WHICH
  // marker, catch-all says the zero-marker invariant broke), so both are
  // DECLARED and anything beyond the declared pair is a self-test failure.
  const absentDefects = [
    ['host-did-not-name-the-inactive-row', (log) => log.replace('dsh: warning: 1 entry did not activate', '[dropped]'), ['hostWarnsInactiveRow']],
    ['host-did-not-name-omo-team', (log) => log.replace('omo-team (@oh-my-opendsh/omo-team): failed to import', 'some-other (@some/other): failed to import'), ['hostNamesOmoTeam']],
    ['loaded-marker-leaked-into-absent-boot', (log) => `${log}\n[omo-team] loaded: manifest 24 entries (pending=8, ported=14, recorded=2) — 14/24 team surfaces registered`, ['noLoadedMarker', 'noOmoTeamMarkerAtAll']],
    ['registered-line-leaked-into-absent-boot', (log) => `${log}\n[omo-team] team surface team_create registered`, ['noRegisteredLines', 'noOmoTeamMarkerAtAll']],
    ['state-machine-answer-leaked-into-absent-boot', (log) => `${log}\n[omo-team] boot resume: resumed=0, failed=0, orphaned=0, cleaned=0, errors=0`, ['noStateMachineBootAnswer', 'noOmoTeamMarkerAtAll']],
    // Leg 17 (P5-T10 review MINOR, mcode): a `[omo-team]` marker of a shape
    // no named leak check covers — the roster-broken loud form — must still
    // redden the absent face through the catch-all, and ONLY through it: the
    // single-element declaration below is now CHECKED, not asserted in prose
    // (the ONLY-own-check comparison refuses any extra reddened check).
    ['manifest-validation-FAILED-leaked-into-absent-boot', (log) => `${log}\n[omo-team] manifest validation FAILED: manifest rows drifted`, ['noOmoTeamMarkerAtAll']],
  ]
  for (const [label, mutate, expectedProblems] of absentDefects) {
    const verdict = assertAbsentFace(mutate(goodAbsent))
    if (!sameProblems(verdict.problems, expectedProblems)) {
      problems.push(`absent defect "${label}" must FAIL on EXACTLY [${expectedProblems.join(' | ')}] and nothing else, got ${verdict.passed ? 'PASS (green on a fabricated defect)' : `[${verdict.problems.join(' | ')}]`}`)
    }
    attested.push(`absent:${label}`)
  }

  // ── the derived shape itself: a formatter that stopped printing a counter
  // would silently shrink every live present-face grep — the self-test pins
  // that the derived regex still matches the formatter's own zero-report AND
  // rejects a line with one counter dropped.
  const derivedLines = goodPresent.split('\n').filter((line) => answerRe.test(line))
  if (derivedLines.length !== 1) {
    problems.push('the derived state-machine-answer regex does not match the formatter\'s own zero-report exactly once — the shape derivation is broken')
  }
  if (answerRe.test('[omo-team] boot resume: resumed=0, failed=0, errors=0')) {
    problems.push('the derived state-machine-answer regex accepts a line MISSING the orphaned/cleaned counters — shape too loose')
  }
  attested.push('derived-shape:matches-zero-report-and-rejects-short-form')
  return { problems, attested }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
if (process.argv[2] === '--self-test') {
  runSelfTest().then(({ problems, attested }) => {
    if (problems.length > 0) {
      console.error(`TEAM-FACE SELF-TEST FAIL (${problems.length} problem(s)):`)
      for (const p of problems) console.error(`  - ${p}`)
      process.exit(1)
    }
    console.log(`TEAM-FACE SELF-TEST PASS: ${attested.length} defect legs attested (${attested.join(', ')}) — every fabricated defect failed on EXACTLY the ordered check set it declares (ONLY-own-check, drive.mjs discipline: nothing extra reddened, nothing co-fired undeclared) and both GOOD logs passed; the state-machine answer shape is derived from the shipped formatTeamBootResumeLine, the host degradation pair is the dsh 0.2.0-rc.2 measurement`)
  }).catch((err) => {
    console.error(`TEAM-FACE SELF-TEST CRASHED: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
    process.exit(1)
  })
} else {
  const face = process.argv[2]
  const file = process.argv[3]
  if ((face !== 'present' && face !== 'absent') || !file) {
    console.error('usage: assert-team-probe-face.mjs present|absent <boot-log> | --self-test')
    process.exit(2)
  }
  const bootLog = readFileSync(file, 'utf8')
  const verdict = face === 'present' ? await assertPresentFace(bootLog) : assertAbsentFace(bootLog)
  if (!verdict.passed) {
    console.error(`TEAM-FACE ${face.toUpperCase()} FAIL: ${verdict.problems.join(', ')}`)
    process.exit(1)
  }
  console.log(`TEAM-FACE ${face.toUpperCase()} PASS`)
}
