// argv: <dsh nm dir> <content file> <roster expectations json> <explore provider> <explore model> <expected !!js count>
// SIX arguments, consumed by callers scripts/concerto-mode-probe.sh and
// tests/e2e/drive.mjs name, and scripts/verify-concerto-static.mjs c23
// DISCOVERS on a repo scan — a third consumer that passes a different count
// goes red at gate 6, it does not escape. The 6th argument is the expected
// `!!js` gate count, derived by each caller from the WRITE face. This comment
// is the contract's only written form, and it previously listed five — the
// omission is exactly how the missing 6th argument travelled between the two
// consumers unnoticed.
// The 3rd argument's JSON carries TWO required fields: `rows` (the roster
// expectation, derived from src/roster.ts) and `sandboxEdits` (the consumer's
// declaration of every (row, LEAF key, after) it edited in the sandbox-owned
// materialized copy; `[]` when it edits nothing — a CONTAINER key such as
// `toolFilter` is rejected, see `DECLARATION_KEYS` below).
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const [nm, contentPath, expectPath, expectedProvider, expectedModel, expectedJsCountRaw] = process.argv.slice(2)
// The expected number of `!!js` gates comes from OUTSIDE this face — the
// probe passes the count it greps off the materialized file, which both faces
// are rendered from. Self-counting cannot catch silent degradation: dropping a
// tag removes one from the text count AND one from the node count, so the two
// stay equal and the face stays green (that was MINOR-2's real shape — my
// first fix, `jsExprNodes === jsLines.length`, was still self-referential and
// was measured passing a single-tag degradation). An external expected count
// is the only thing that turns 'a tag became a string' into a failure.
const expectedJsCount = Number(expectedJsCountRaw)
const yaml = (await import(pathToFileURL(nm + '/js-yaml/dist/js-yaml.mjs').href)).default
// The loader's OWN dialect, so `!!js` reads as declared (same full-qualified
// tag the include schema uses; construct-only is enough for a LOAD).
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
})
const text = readFileSync(contentPath, 'utf8')
const rows = yaml.load(text, { schema: yaml.JSON_SCHEMA.extend(JsExpr) })
const expectations = JSON.parse(readFileSync(expectPath, 'utf8'))
const problems = []

const walk = (list, visit) => {
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    visit(row)
    if (Array.isArray(row.config)) walk(row.config, visit)
  }
}
if (!Array.isArray(rows)) {
  console.error('READ-FACE FAIL: content did not parse to an entry list')
  process.exit(1)
}

// Negative: no sentinel residue may reach the face the runtime actually reads.
if (text.includes('__OMO_')) {
  const residue = [...new Set(text.match(/__OMO_[A-Z_]+__/g) ?? [])]
  problems.push(`read content carries surviving sentinel residue: ${residue.join(', ')}`)
}

// Text anchors that survive the dump (measured on a real 0.2.0-rc.2 boot):
// the block scalars and the row/indent anchors stay line-stable, so they are
// still worth pinning as text.
// ⚠️ /m is REQUIRED on every one of these: without it `^` anchors to the
// START OF THE STRING. The first version of this face shipped exactly that
// bug and went RED against a real boot where the block scalars sit at line 4
// (`prefix: |-`) and line 199 (`persona: |-`) — archived as
// scenario-runner-2nd-attempt-FAILED.log and -3rd-attempt-FAILED.log. A gate
// that fails on its own syntax is worse than no gate, so the failure is kept
// in the comment where the next reader will hit it.
if (!/^    prefix: \|[-+]?$/m.test(text)) {
  problems.push('read content has no `prefix: |-` block scalar for the conductor persona')
}
if (!/^        persona: \|[-+]?$/m.test(text)) {
  problems.push('read content has no `persona: |-` block scalar on a delegation row')
}
for (const marker of ['      # Orchestrator Role', '      # Delegation Discipline', '      ## Hard Blocks']) {
  if (!text.includes(marker)) problems.push(`read content missing conductor persona section: ${marker}`)
}
if (!text.includes('          # Explore: Read-Only Retrieval Agent')) {
  problems.push('read content missing the explore persona heading')
}
// `!!js` must still be a REAL tag on this face, not a stringified one — the
// single-line form is what the upstream `represent` produces
// (vendor/include/src/index.ts:9-15 declares `represent: (data) => data['__jsExpr']`).
const jsLines = text.split('\n').filter((line) => line.includes('!!js '))
if (jsLines.length === 0) problems.push('read content carries no `!!js` line at all')
// Count EVERY parsed {__jsExpr} node, on any key — not just `disabled`. The
// earlier draft counted only `disabled` and then compared aggregates against
// aggregates (`jsLines.length === 0` / `jsExprStrings === 0`), so degrading
// BOTH halves went red while degrading exactly ONE of two tags stayed green
// (MINOR-2). One-to-one correspondence is the honest invariant: N `!!js`
// tokens in the text must produce exactly N expression nodes.
let jsExprNodes = 0
const jsNodeKeys = []
const countExprs = (row) => {
  for (const [key, value] of Object.entries(row)) {
    if (key === 'config') continue
    if (typeof value === 'string' && value.includes('!!js')) {
      problems.push(`row ${row.id} has a STRING \`!!js\` on \`${key}\`: ${JSON.stringify(value.slice(0, 80))}`)
    } else if (value && typeof value === 'object' && typeof value.__jsExpr === 'string') {
      jsExprNodes += 1
      jsNodeKeys.push(`${row.id}.${key}`)
    }
  }
}
walk(rows, countExprs)
if (jsExprNodes === 0 && jsLines.length > 0) {
  problems.push('`!!js` lines are present but no row parsed to a {__jsExpr} node — the dialect is wrong')
}
if (!Number.isInteger(expectedJsCount) || expectedJsCount < 0) {
  problems.push(`expected \`!!js\` gate count is not a non-negative integer: ${JSON.stringify(expectedJsCountRaw)}`)
}
if (Number.isInteger(expectedJsCount) && jsExprNodes !== expectedJsCount) {
  problems.push(
    `read face carries ${jsExprNodes} parsed expression node(s) [${jsNodeKeys.join(', ') || 'none'}] but the `
      + `materialized face declares ${expectedJsCount} \`!!js\` gate(s) — a tag silently became a string`,
  )
}
if (jsExprNodes !== jsLines.length) {
  problems.push(
    `\`!!js\` tokens and parsed expression nodes do not match one-to-one: ${jsLines.length}`
      + ` text token(s) vs ${jsExprNodes} node(s) [${jsNodeKeys.join(', ') || 'none'}]`
      + ' — a tag silently became a string',
  )
}

// ── `sandboxEdits` — the consumer's DECLARATION of every edit it made to the
// sandbox-owned materialized copy between boot and session composition
// (tests/e2e/drive.mjs `augmentMaterialized`). REQUIRED; `[]` when the
// consumer edits nothing.
//
// T13 ADJUDICATION (Review A MINOR): KEPT, and the block below stays verbatim.
// This is NOT a version fork: the validator applies the SAME accepted-set rule
// ({roster value, declared post-edit value}) on every runtime — the 0.1.5/0.2.x
// contrast below is the WP2-era MEASUREMENT that explains why the declaration
// mechanism exists (provenance, kept per ⑲: history stays as history), not a
// branch that selects behaviour by version. The capability difference it
// records (read answered from register() vs from file discovery) is still what
// decides what a sandbox edit can be visible through on any runtime the consumer
// targets, so the rule and its explanation both stay.
//
// WHY this exists (WP2 MAJOR-1, the gate-3 red on dsh 0.1.5): the two
// runtimes do NOT feed `agentPresets/read` from the same place. 0.2.x answers
// it from `register()`, which renders the REPO TEMPLATE, so a sandbox edit is
// invisible there; 0.1.5 answers it from FILE DISCOVERY — the sandbox's own
// materialized file — so the same edit IS visible there. One roster-derived
// expectation therefore cannot be the single truth on both faces: it was green
// on 0.2.x and RED by construction on `prometheus-md-only-denied` on 0.1.5,
// because that scenario lifts prometheus's `toolFilter` out of its own copy
// (tests/e2e/drive.mjs `enablePrometheusWriteTools`) while the expectation kept
// coming from the untouched src/roster.ts.
// The fix is NOT a scenario special case and NOT a skip: for a (row, key) the
// consumer declares it edited, the ACCEPTED SET is {roster value, declared
// post-edit value} and nothing else. A degraded deny list — one element
// dropped, one reordered — matches neither and still fails (measured: review A
// six degradations + review B attack 1, all RED).
//
// HONEST SCOPE OF THAT SENTENCE (review A NIT-1 / review B MAJOR-1, arbitrated
// to MINOR): the ROSTER member of the set is never read off the bytes under
// assertion; the `after` member is NOT — it is typed by the fixture in
// tests/e2e/drive.mjs and is NOT anchored to anything external. There is no
// external anchor available on this face: on dsh 0.1.5 `agentPresets/read` IS
// that materialized file, so no second source exists to cross-check it against
// (structural, not an oversight — review A §1b measured it).
// RESIDUAL TRUST BOUNDARY, stated instead of hidden: a fixture that rewrites
// its own `after` into the degraded bytes turns this gate green — that is a
// 'make the fixture lie to itself' class, which is why every change to an
// `augmentMaterialized` fixture goes through dual review, and why
// scripts/verify-concerto-static.mjs c24 reconciles each declared `after`
// against what the fixture body actually WRITES.
// THE SAME BOUNDARY ON THE OTHER SIDE, stated with the same care. The DENY
// half of the face this file reads and the DENY half of the expectation it
// compares against are rendered by the SAME function of the SAME module —
// roster.ts's denyToolNamesFor, called to RENDER the face into each row's
// `__OMO_<ID>_DENY__` sentinel at
// patches/omo-dsh/omo-agents/src/concerto-preset.ts:319 and to BUILD the
// expectation at tests/e2e/drive.mjs:14866 — so a degradation made INSIDE that
// function moves both sides of the comparison at once, and this validator, which
// compares face against expectation, cannot see it. Measured in round 3
// (.omo/evidence/wp2-fix3/mut/gates.log):
//   M-ROSTER-A  drop one name from denyToolNamesFor's read-only branch →
//               this file's own contract test stays GREEN (19/19, re-measured in
//               round 4: .omo/evidence/wp2-fix4/mut/M-ROSTER-A-contract.log);
//               the net that catches it is gate 2 (12 cases red: roster.test.ts
//               x2, roster-composition.test.ts x7, concerto-preset.test.ts x3)
//               and gate 6, which falls to 32/33 at c10.5.
//   M-ROSTER-B  degrade the MUTATION_TOOL_NAMES CONSTANT that function reads
//               instead → 12 cases red at gate 2, the SAME 12 in the SAME
//               distribution (roster-composition x7, concerto-preset x3,
//               roster.test x2, of 1492 tests, 0 skipped) — a number
//               RECOMPUTED in round 4 rather than inherited from round 3, under
//               four degradation shapes (drop 'edit', drop 'write', rename
//               'edit', empty the constant), all four: 12 red, same
//               3/7/2 split, and RE-MEASURED again in round 5 by the ONE command
//               that really runs all four shapes:
//               `bash .omo/evidence/wp2-fix5/mut/roster-shapes.sh`
//               (.omo/evidence/wp2-fix5/mut/roster-shapes.log — 4 shapes, each
//               gate2 exit=1 · total=1492 · failed=12 · pending(skipped)=0 ·
//               roster-composition x7 + concerto-preset x3 + roster.test x2,
//               gate6 33/33, RESTORE-OK x4).
//               THE WORDING CORRECTION, STATED BECAUSE A READER RUNS WHAT THIS
//               COMMENT POINTS AT. Round 4 wrote "recompute with
//               `bash .omo/evidence/wp2-fix4/mut/roster-cases.sh`" as if that
//               script covered all four shapes. It does not: it carries exactly
//               3 `run_case` labels — M-ROSTER-A, M-ROSTER-B with drop 'edit'
//               ONLY, and M-ALLOW (`grep -c "^run_case "` = 3, measured) — so it
//               reproduces ONE of the four shapes; its own output is
//               mut/roster-cases.log and mut/M-ROSTER-B-vitest.json. The other
//               three shapes existed in round 4 as loose JSON
//               (mut/m-roster-b-{drop-write,rename,empty}.json, re-parsed
//               OFFLINE in round 5 — not re-run — each reading total=1492,
//               failed=12, the same x3/x7/x2 split) with no runnable command of
//               its own, until the round-5 script above. Review B independently
//               ran those three shapes with its own script, kept at
//               .omo/evidence/wp2-fix1/review-B/roster-b-shapes.sh. That gap
//               between the promise and the command's real coverage is review B
//               round 4 MINOR-1. REVIEW B counted 11 here (concerto-preset x2);
//               that figure is not reproducible on this tree under any of the
//               four shapes, so it is recorded as an open reviewer disagreement
//               and the four-shape command above is the tie-breaker left for the
//               next reader.
//               gate 6 stays 33/33 (measured), because c10.5 rebuilds its own
//               expectation from that same constant. There, and only there, gate
//               2 is the last net.
// (The ALLOW half is NOT shared this way: the shipped template carries
// multimodal-looker's allow list as static YAML with no sentinel,
// concerto-preset.ts:36-38, so a change to allowToolNamesFor moves the
// expectation at tests/e2e/drive.mjs:14867 and nothing on the face. It is NOT
// visible HERE — measured, M-ALLOW leaves this validator's own contract test
// 19/19 GREEN (.omo/evidence/wp2-fix4/mut/M-ALLOW-contract.log), for the plain
// reason that the face this file reads never carried that allow list. What does
// catch it is c10.8 at gate 6 (32/33, allow became ["read"] against the static
// ["read","read_image"]) plus 7 red cases at gate 2 (roster-composition x3,
// concerto-preset x2, roster.test x1, roster-toolfilter-mechanism x1) — the
// nets are elsewhere, and saying so is the point. That asymmetry is a fact
// about this face, not a defence.)
// What this file's independence therefore covers is exactly ONE dimension: that
// the bytes of the READ face are not the source of the expectation — the
// 0.1.5-vs-0.2.x cross-face coin toss of MAJOR-1. That dimension is a property
// of HOW THE CONSUMERS BUILD `expectations.rows`, not something this file can
// self-prove: it receives the JSON and cannot see its provenance, which is why
// the PASS banner at the end of this file stopped asserting an absolute about it
// in round 4 (see the comment above that console.log, and
// .omo/evidence/wp2-fix4/mut/banner-probe.mjs for the probe that made the old
// wording print GREEN over a face-derived expectation of a degraded face). The
// line of defence against a single-source roster degradation is elsewhere, and
// it is gate 2 first.
const ABSENT = Symbol('absent')
const norm = (v) => (v === undefined || v === null ? ABSENT : v)
const sameNorm = (a, b) => JSON.stringify(a === ABSENT ? null : a) === JSON.stringify(b === ABSENT ? null : b)
const renderVal = (v) => (v === ABSENT ? '<absent>' : JSON.stringify(v))
const getPath = (obj, path) => {
  let cur = obj
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(key in cur)) return ABSENT
    cur = cur[key]
  }
  return norm(cur)
}
// The keys this validator owns. A declaration naming anything else is either
// junk or a key nobody asserts; both must be loud, never silently ignored.
const COMPARED_KEY_PATHS = ['toolName', 'maxDepth', 'toolFilter.deny', 'toolFilter.allow']
const DECLARED_NOT_COMPARED_KEYS = ['backgroundMode']
// LEAF PATHS ONLY. A container declaration (`toolFilter`) is rejected: one
// container edit exempts EVERY key beneath it, so a single sloppy `after`
// would widen the accepted set from one compared cell to two (review B attack
// 2, review A A1j — measured green before this round).
// 'The whole container is gone' is therefore expressed LEAF BY LEAF — one
// declaration per key beneath it that the ROSTER ACTUALLY GIVES THAT ROW, each
// with its own `after: null`, so every exempted cell is named individually. On
// today's roster that is exactly ONE leaf per row and never two: the census is
// 8 deny-only, 1 allow-only (`multimodal-looker`), 1 neither (`atlas`), 0
// carrying both (measured round 3, .omo/evidence/wp2-fix3/probes/leaf-vs-container.log
// Q1, importing src/roster.ts itself). Declaring the sibling leaf as well is
// RED, not green — the roster's value there is already absent, so that
// declaration changes nothing and the vacuity check below rejects it (same log,
// Q2: one leaf GREEN, two leaves RED). The two-leaf form is reserved for the
// day the roster hands ONE row both filters; on a synthesised row of that shape
// it is GREEN (same log, Q3). Until such a row exists, declare the leaf whose
// roster value is non-null, and only that one.
const DECLARATION_KEYS = [...COMPARED_KEY_PATHS, ...DECLARED_NOT_COMPARED_KEYS]
const governs = (editKey, keyPath) => editKey === keyPath
// The value a declaration puts on the compared path it names. `after: null`
// means the key is gone from the face.
const declaredValueFor = (edit, keyPath) => (edit.key === keyPath ? norm(edit.after) : ABSENT)
const rosterValueFor = (want, keyPath) => {
  if (keyPath === 'toolName') return want.id
  if (keyPath === 'maxDepth') return want.maxDepth
  if (keyPath === 'toolFilter.deny') return want.deny
  return want.allow
}
const sandboxEdits = Array.isArray(expectations.sandboxEdits) ? expectations.sandboxEdits : []
if (!Array.isArray(expectations.sandboxEdits)) {
  problems.push(
    'the expectations carry no `sandboxEdits` array — the contract is explicit: a consumer that '
      + 'edits nothing declares [], and a consumer that edits something names every (row, key, after) '
      + 'it changed. An absent field IS the cross-face same-source assumption this block exists to kill.',
  )
}
const rosterIds = new Set(expectations.rows.map((want) => want.id))
const editsNotCompared = []
for (const [index, edit] of sandboxEdits.entries()) {
  const where = `sandboxEdits[${index}]`
  if (!edit || typeof edit !== 'object' || typeof edit.row !== 'string' || typeof edit.key !== 'string'
      || !('after' in edit)) {
    problems.push(`${where} is not a \`{ row, key, after }\` triple: ${JSON.stringify(edit ?? null)}`)
    continue
  }
  if (!rosterIds.has(edit.row)) {
    problems.push(`${where} names row ${JSON.stringify(edit.row)}, which is not a roster delegation row — a vacuous declaration`)
    continue
  }
  if (!DECLARATION_KEYS.includes(edit.key)) {
    problems.push(`${where} names key ${JSON.stringify(edit.key)}, outside this validator's declaration vocabulary (${DECLARATION_KEYS.join(', ')})`)
    continue
  }
  if (DECLARED_NOT_COMPARED_KEYS.includes(edit.key)) {
    // Recorded, not asserted: printing the boundary is honest, pretending
    // coverage is not. The PASS banner below states it on every run.
    editsNotCompared.push(`${edit.row}.${edit.key}→${renderVal(norm(edit.after))}`)
    continue
  }
  const want = expectations.rows.find((entry) => entry.id === edit.row)
  const governed = COMPARED_KEY_PATHS.filter((keyPath) => governs(edit.key, keyPath))
  const differsFromRoster = governed.some((keyPath) => !sameNorm(declaredValueFor(edit, keyPath), norm(rosterValueFor(want, keyPath))))
  if (!differsFromRoster) {
    problems.push(
      `${where} declares an edit whose value(s) on every key it governs (${governed.map((keyPath) => renderVal(declaredValueFor(edit, keyPath))).join(' / ')}) are IDENTICAL to the roster expectation — `
        + 'either the fixture no longer edits what it declares, or the roster moved under it. A declaration that changes nothing is vacuous.',
    )
  }
}

// Element-wise comparison of every roster delegation row.
const byRowId = new Map()
walk(rows, (row) => {
  if (typeof row.id === 'string' && row.id.startsWith('tool-subagent-')) byRowId.set(row.id.slice('tool-subagent-'.length), row)
})
const seenToolNames = []
walk(rows, (row) => {
  const config = row.config
  if (config && typeof config === 'object' && typeof config.toolName === 'string') seenToolNames.push(config.toolName)
})
if (seenToolNames.length !== expectations.rows.length) {
  problems.push(`read content has ${seenToolNames.length} toolName rows, roster has ${expectations.rows.length}`)
}
// The audit trail of the comparison below: how many row-keys were compared, and
// which of them resolved against a DECLARED sandbox edit rather than the
// roster. Both counts print in the PASS banner, so 'this scenario compared
// nothing' and 'this face is the edited file' are facts a reader can see in the
// gate log instead of facts a reader has to trust.
let comparisons = 0
const editMatches = []
const editsInvisibleOnThisFace = []
for (const want of expectations.rows) {
  const row = byRowId.get(want.id)
  if (row === undefined) {
    problems.push(`read content has no tool-subagent-${want.id} row`)
    continue
  }
  const config = row.config ?? {}
  // ONE routine for every compared key, so a key cannot be 'forgotten' the way
  // `deny`/`allow` each forgot their own `else` branch (MINOR-1: a row the
  // roster gives NO filter — orchestrator `atlas`, allowlist
  // `multimodal-looker` — now fails if the key APPEARS on the face; measured
  // green before this round with `toolFilter.deny: [read]` injected into atlas).
  for (const keyPath of COMPARED_KEY_PATHS) {
    const wantValue = norm(rosterValueFor(want, keyPath))
    const got = getPath(config, keyPath)
    const governingEdits = sandboxEdits.filter((edit) => edit.row === want.id && governs(edit.key, keyPath))
    const accepted = [{ source: 'roster', value: wantValue }]
    for (const edit of governingEdits) accepted.push({ source: `declared sandbox edit ${edit.row}.${edit.key}`, value: declaredValueFor(edit, keyPath) })
    const hit = accepted.find((entry) => sameNorm(entry.value, got))
    if (hit === undefined) {
      problems.push(
        `${want.id}.${keyPath} = ${renderVal(got)} matches NEITHER the roster expectation ${renderVal(wantValue)} `
          + `nor any declared sandbox edit (${governingEdits.map((e) => renderVal(declaredValueFor(e, keyPath))).join(' / ') || 'none declared'})`
          + (wantValue === ABSENT
            ? ' — the roster declares NO such key for this row (orchestrator/allowlist class), so the key must be ABSENT on the face the runtime reads'
            : ' — neither the roster list element-wise nor the declared post-edit state'),
      )
      continue
    }
    comparisons += 1
    if (hit.source !== 'roster') {
      editMatches.push(`${want.id}.${keyPath}=${renderVal(got)}`)
    } else {
      // The roster matched although the scenario declared an edit here: on this
      // runtime the read face is NOT the edited file (0.2.x register()/template).
      if (governingEdits.length > 0) editsInvisibleOnThisFace.push(`${want.id}.${keyPath}`)
    }
  }
  if (want.id === 'explore') {
    if (config.provider !== 'spawn') problems.push(`explore: parsed provider=${JSON.stringify(config.provider)} want "spawn" (unquoted on this face)`)
    const seat = config.agentOptions ?? {}
    if (seat.provider !== expectedProvider) problems.push(`explore: parsed agentOptions.provider=${JSON.stringify(seat.provider)} want ${expectedProvider}`)
    if (seat.model !== expectedModel) problems.push(`explore: parsed agentOptions.model=${JSON.stringify(seat.model)} want ${expectedModel}`)
    if (typeof config.persona !== 'string' || !config.persona.includes('# Explore: Read-Only Retrieval Agent')) {
      problems.push('explore: parsed persona missing the heading')
    }
  }
}
const depths = expectations.rows.map(() => expectations.uniformMaxDepth)
const gotDepths = expectations.rows
  .map((want) => byRowId.get(want.id)?.config?.maxDepth)
  .filter((d) => d !== undefined)
if (gotDepths.some((d, k) => d !== depths[k])) {
  problems.push(`delegation maxDepth set ${JSON.stringify(gotDepths)} != roster-uniform ${JSON.stringify(depths)}`)
}

if (problems.length > 0) {
  console.error(`READ-FACE FAIL: ${problems.join('; ')}`)
  process.exit(1)
}
// The provenance clause in the banner below is NARROWED on purpose, and the
// narrowing is the finding: an earlier draft of this line asserted
// "every expectation derived from the roster … — never from these bytes", an
// absolute this file cannot self-prove. Measured (review A round 3, and again
// here with .omo/evidence/wp2-fix4/mut/banner-probe.mjs): hand it a DEGRADED
// face (prometheus missing its last deny element) with `expectations.rows`
// parsed off THOSE VERY BYTES, registered with the same `!!js` type, and the
// validator exits 0 while printing the banner. It has no access to how a caller
// built the JSON, so the sentence was falsifiable and false. What IS true, and
// what the banner now states instead: both real consumers do derive from the
// roster — tests/e2e/drive.mjs maps DELEGATION_ENTRIES through
// denyToolNamesFor/allowToolNamesFor, and scripts/concerto-mode-probe.sh
// serializes rows its `node -e` resolved from src/roster.ts — so no live
// consumer is lying; the guarantee is theirs, and the single dimension THIS
// file owns is the one named in the header comment above.
console.log(
  `READ-FACE PASS: ${expectations.rows.length} delegation rows compared element-wise against src/roster.ts `
    + `(${comparisons} row-key comparisons over ${COMPARED_KEY_PATHS.join('/')}, expectations consumed AS HANDED IN on \`expectations.rows\` — this file cannot see their provenance and so asserts no absolute like "never derived from these bytes"; its two real consumers do derive them from src/roster.ts (drive.mjs DELEGATION_ENTRIES.map over denyToolNamesFor/allowToolNamesFor, the probe's roster \`node -e\`), which is a fact about them and not a fact this gate verifies), `
    + `${editMatches.length} of them resolved against a DECLARED sandbox edit [${editMatches.join(', ') || 'none'}]`
    + (editMatches.length > 0
      ? ' — on this runtime agentPresets/read is FILE-supplied, i.e. the sandbox copy the scenario edited'
      : ' — on this runtime no declared sandbox edit reached the read face (register()/template-supplied)')
    + (editsInvisibleOnThisFace.length > 0 ? `; declared edits invisible here [${editsInvisibleOnThisFace.join(', ')}]` : '')
    + (editsNotCompared.length > 0 ? `; declared OUTSIDE this validator's compared vocabulary, asserted by nothing here [${editsNotCompared.join(', ')}]` : '')
    + `, conductor persona + explore persona block scalars present, ${jsExprNodes} parsed expression node(s) [${jsNodeKeys.join(', ')}] == ${expectedJsCount} \`!!js\` gate(s) declared by the materialized face, no sentinel residue`,
)
