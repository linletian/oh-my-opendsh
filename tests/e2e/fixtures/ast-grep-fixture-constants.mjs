// ast-grep-fixture-constants.mjs — the PINNED expectation set for the P6-T7
// `ast-grep-sg-via-bash` scenario, and the reason that scenario can go red.
//
// WHY A PIN EXISTS AT ALL (and why this file is not "hand-transcription", the
// habit this repo rightly distrusts). Two readers read the fixture at run time:
// the hermetic `sg` (which scans the sandbox COPY) and the driver (which scans
// the repo ORIGINAL). If those were the only two, they would move together and
// byte-equality between them would prove only that the bytes rode the chain —
// which IS the scenario's subject, but it would leave the scenario unable to
// notice the fixture itself changing. So a third, INERT reader stands in: this
// file. It is the only place the expected `file`/`line`/`text` triples are
// written down, it does not read anything, and it is the fixed point both live
// readers are measured against.
//
// The three-way split, and what each pair of readers proves:
//   * `sg` output vs driver's scan  → the bytes travelled mock → bash → sg →
//     stdout → session log intact (transport).
//   * pinned set vs driver's scan   → the fixture is still the fixture the
//     scenario was written for (content). Mutate a fixture line and THIS is the
//     assertion that goes red, because the scan moves and the pin does not.
//   * pinned set vs `sg` output     → the tool answered what the spec says, not
//     what the fixture happens to contain today.
// Each pair is a separate named check; none is implied by another.
//
// REPRODUCING THE PIN (this is how the numbers below were obtained, and how to
// re-derive them after an intentional fixture edit — never by editing the numbers
// to make a red go green):
//   node --input-type=module -e '…scan src/*.ts for `TOKEN(` outside comments,
//   strings and the declaration…'  →  the triples below, byte for byte.
// The scanner's rule is stated in ast-grep-fake-sg.mjs's header and is shared by
// the driver's own scan; the pin is what it produced once, on purpose.

/** The sentinel FAMILY token. The only string the fake `sg` and the driver share
 *  by import — everything else they each derive for themselves. */
export const AST_GREP_SENTINEL_TOKEN = 'OMO_E2E_AST_GREP_TARGET'

/** The pattern the scenario's mock agent sends, verbatim. ast-grep wildcards are
 *  `$VAR` (one node) / `$$$` (many), and the skill teaches this exact spelling
 *  (`sg run -p '…' --lang ts --json=compact <dir>`); the token plus `(` is what
 *  makes it call-shaped rather than a bare mention. */
export const AST_GREP_SENTINEL_PATTERN = `${AST_GREP_SENTINEL_TOKEN}($ARG)`

/** The fixture's source files, relative to the fixture project root. THE LIST IS
 *  THE CONTRACT, and the two live readers do not read the same thing by design:
 *  the driver scans exactly what is named here (2 files today), while the double
 *  walks the whole directory for `*.ts` — which includes `target.ts`, the file
 *  that only DECLARES the sentinel. The two sets agree today for one specific
 *  reason: `target.ts` contains no CALL, so walking it yields nothing extra. If a
 *  call shape ever appears in `target.ts`, the double will report MORE rows than
 *  the driver expects, that divergence is permitted by this contract rather than a
 *  bug in it, and this note is where it was foretold — the fix being to add the
 *  file here, which makes the enlargement a decision. The point of the list is
 *  that a file OUTSIDE it cannot silently enlarge the expected set on either side. */
export const AST_GREP_FIXTURE_SOURCE_FILES = Object.freeze([
  'src/app.ts',
  'src/queries.ts',
])

/**
 * The pinned match set: every match the sentinel pattern owes, in the order the
 * fixture owes it (file order, then line order). `text` is the matched line's
 * code with any trailing `//` comment stripped and the remainder trimmed — the
 * same normalisation both live readers apply.
 *
 * Three matches, two files, three different columns: the columns differ because
 * the call sits at a different indentation in each shape (inside a function
 * body's `const`, as a bare statement, and after `export const … =`), and a
 * column that was always 1 would prove the field was never read from the file.
 */
export const AST_GREP_PINNED_MATCHES = Object.freeze([
  Object.freeze({
    file: 'src/app.ts',
    line: 21,
    column: 17,
    text: "const first = OMO_E2E_AST_GREP_TARGET('alpha-7f3c')",
  }),
  Object.freeze({
    file: 'src/app.ts',
    line: 26,
    column: 3,
    text: "OMO_E2E_AST_GREP_TARGET('beta-9d21')",
  }),
  Object.freeze({
    file: 'src/queries.ts',
    line: 18,
    column: 22,
    text: "export const third = OMO_E2E_AST_GREP_TARGET('gamma-4e88')",
  }),
])

/** The count, derived from the pin rather than restated: a pin and a count that
 *  disagree is this file's own bug, and `AST_GREP_PINNED_MATCHES.length` cannot
 *  drift from itself. */
export const AST_GREP_PINNED_MATCH_COUNT = AST_GREP_PINNED_MATCHES.length

/** The decoys, named so the scenario's negative leg can say WHICH shape it
 *  refused rather than merely "nothing extra". Each fails the pattern through a
 *  genuinely different door: no call parens at all; the parens and the argument
 *  shape present but the callee name wrong; and a FULL call shape sitting inside a
 *  string literal, where only the quote state separates it from a call. The third
 *  door is the one that did not exist until FIX-T7 — the decoy used to be written
 *  without parens, so it fell through door one and the scenario believed it had
 *  three.
 *
 *  A marker only has teeth if it appears on the line a wrong reader would actually
 *  REPORT, which is not always where the shape is declared: `decoyDifferentCallee`
 *  used to live solely on the `export function` line while the call-shaped row sat
 *  on the next one carrying `formatLabel(…)` and no marker at all, so a bogus
 *  report of THAT line slipped past `noDecoyShapeReported` unnamed. The callee is
 *  now aliased so the marker is on the call line itself. When adding a decoy, the
 *  test is: if a reader wrongly reported this shape, would the marker be in the
 *  text it printed? */
export const AST_GREP_FIXTURE_DECOY_MARKERS = Object.freeze([
  'DECOY_TOKEN_REFERENCED_NOT_CALLED',
  'decoyDifferentCallee',
  'DECOY_INSIDE_STRING_LITERAL',
])

/** The fake `sg`'s own evidence file env var (the T1 fixture's `*_LOG` habit):
 *  every invocation appends `spawned <argv> cwd=<cwd>` so "the tool really ran"
 *  is read off disk, not inferred from a non-empty result. */
export const AST_GREP_FAKE_SG_LOG_ENV = 'FAKE_SG_LOG'
