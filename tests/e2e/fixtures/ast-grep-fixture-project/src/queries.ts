// queries.ts — P6-T7 e2e fixture source, the SECOND file, and the reason the
// scenario's expected set spans more than one file. A single-file fixture would
// let a `sg` double that only ever scanned one path pass; a set that spans two
// files forces the result to carry per-match `file` fields that are each right.
//
// One match lives here (`gamma-4e88`). Same rule as app.ts: the line is pinned in
// tests/e2e/fixtures/ast-grep-fixture-constants.mjs, and moving it moves the pin.
import { OMO_E2E_AST_GREP_TARGET } from './target'

/** The decoy callee app.ts points at: same single-string-argument shape as the
 *  sentinel, different name — so a pattern that matched by argument shape alone
 *  would pick this up and the negative leg would say so. */
export function formatLabel(label: string): string {
  return `label:${label}`
}

// The one match this file owes.
export const third = OMO_E2E_AST_GREP_TARGET('gamma-4e88')
