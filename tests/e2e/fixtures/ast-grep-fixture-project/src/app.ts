// app.ts — P6-T7 e2e fixture source, the PRIMARY match target.
//
// Every line the `ast-grep-sg-via-bash` scenario expects in `sg`'s JSON carries a
// call to `OMO_E2E_AST_GREP_TARGET(…)`. That token is the sentinel FAMILY: the
// hermetic `sg` answers for it and honestly returns `[]` for anything else. The
// argument literals are the per-match discriminators, pinned beside this file in
// tests/e2e/fixtures/ast-grep-fixture-constants.mjs.
//
// DO NOT reformat, reflow, sort or rename the matching lines without moving the
// pinned constants in the same commit. The scenario compares `file` / `line` /
// `text` BYTE-FOR-BYTE between two independent readers — the `sg` that reads THIS
// file at run time, and the driver's own scan of it — against the pinned set. An
// edit here moves the readers and leaves the pin standing, so the byte-equality
// assertion goes red BY NAME. That red is the mutation self-proof the task book
// demands; it is not noise to be silenced by "fixing" the pin.
import { formatLabel } from './queries'
import { OMO_E2E_AST_GREP_TARGET } from './target'

// The two matches this file owes: one call bound to a const, one bare statement.
export function runFirst(): string {
  const first = OMO_E2E_AST_GREP_TARGET('alpha-7f3c')
  return first
}

export function runSecond(): void {
  OMO_E2E_AST_GREP_TARGET('beta-9d21')
}

// DECOYS — three shapes that must NOT appear in the result set, each failing the
// pattern for a DIFFERENT reason, so the scenario's negative leg has teeth rather
// than resting on an expectation that is empty by default:
//   1. the token referenced but NOT called — not call-shaped;
//   2. a different callee, same argument shape — wrong function name;
//   3. the token INSIDE a string literal, in full call shape `'TOKEN(x) …'` — the
//      text and the parens are both present, and only the quote state distinguishes
//      it from a call, which is precisely the grep-vs-ast-grep distinction the
//      skill draws. (It used to be written without parens, which meant it failed
//      the same gate as decoy 1 and the third gate did not exist.)
export const DECOY_TOKEN_REFERENCED_NOT_CALLED = OMO_E2E_AST_GREP_TARGET

// The alias exists so the MARKER sits on the line a wrong reader would report, not
// only on the declaration above it: `noDecoyShapeReported` looks for the marker in
// the text of any row that should not have matched, and `return formatLabel(…)`
// carried none — so a bogus report of this line was undetectable by name. The name
// is spelled with a LOWERCASE `decoyDifferentCallee` after the underscore because
// the marker match is case-sensitive, and the callee is still not the sentinel, so
// this stays a genuine wrong-callee decoy.
const formatLabel_decoyDifferentCallee = formatLabel

export function decoyDifferentCallee(): string {
  return formatLabel_decoyDifferentCallee('beta-9d21')
}

export const DECOY_INSIDE_STRING_LITERAL = 'OMO_E2E_AST_GREP_TARGET(x) appears here as text only'
