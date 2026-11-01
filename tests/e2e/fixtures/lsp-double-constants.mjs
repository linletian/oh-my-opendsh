// tests/e2e/fixtures/lsp-double-constants.mjs — the SINGLE SOURCE of every
// literal the P6-T5 LSP double and its e2e scenarios share (P6-T5, task book
// gate 3). Split from lsp-double-server.mjs on purpose: importing the server
// would RUN it (it is a stdio entry that calls main() at module scope), and a
// second hand-copied list of markers in tests/e2e/drive.mjs is exactly the
// drift this repo's derivation discipline exists to prevent (see the cordis.yml
// header's 「NO CENSUS NUMBERS HERE, AND THAT IS THE RULE」).
//
// What is NOT here, and why: the canned definition LINE is not a constant. The
// double derives it by reading the sentinel out of the committed marker file
// (`cannedDefinition` in lsp-double-server.mjs) and tests/e2e/drive.mjs derives
// the SAME number with its OWN independent read of that file. Two readers, one
// file: they must agree, and a broken reader on either side turns the check red
// instead of moving both halves of one hand-typed number together.
//
// Pure data: this module opens no files, spawns nothing, reads no env.

/** The config id the scenario's user config gives the double. The engine's
 *  `status` tool prints it as `<id>: <state>; source=<source>; extensions=…`
 *  (patches/omo-dsh/vendor/lsp-core/src/tools/status.ts:10-13), so this string
 *  in a tool result is the proof the engine read the config row off disk. */
export const LSP_DOUBLE_SERVER_ID = 'lsp-double'
/** `serverInfo.name` on the LSP `initialize` result — this double's own name. */
export const LSP_DOUBLE_SERVER_NAME = 'lsp-double'
/** The canned definition target, relative to the fixture workspace root. */
export const LSP_DOUBLE_MARKER_RELATIVE = 'src/fixture-double-marker.ts'
/** The sentinel INSIDE that file whose line becomes the canned location. */
export const LSP_DOUBLE_MARKER_SENTINEL = 'LSP-DOUBLE-DEFINITION-TARGET-7c4d19'
/** 0-based character offset of the canned selection range's start. */
export const LSP_DOUBLE_MARKER_CHARACTER = 13
/** The canned diagnostic, answered on BOTH the push (`publishDiagnostics`
 *  after `textDocument/didOpen`) and pull (`textDocument/diagnostic`) paths, so
 *  the assertion does not depend on which half of the engine's freshness state
 *  machine resolved it (patches/omo-dsh/vendor/lsp-core/src/lsp/client.ts:186-235). */
export const LSP_DOUBLE_DIAGNOSTIC_MESSAGE = 'OMO-E2E-LSP-DOUBLE canned diagnostic 4b8e2a'
export const LSP_DOUBLE_DIAGNOSTIC_SOURCE = 'lsp-double'
export const LSP_DOUBLE_DIAGNOSTIC_CODE = 9001
/** The reverse-canary pair: a config row whose command names a binary that
 *  cannot exist, mapped to an extension NO builtin server claims
 *  (patches/omo-dsh/vendor/lsp-core/src/lsp/server-definitions.ts:54-160 owns
 *  no `.dbl`), so nothing but that row can answer a call against it. */
export const LSP_DOUBLE_MISSING_SERVER_ID = 'lsp-double-missing'
export const LSP_DOUBLE_MISSING_COMMAND = 'lsp-double-not-installed-binary'
export const LSP_DOUBLE_MISSING_EXTENSION = '.dbl'
/** The fixture-workspace-relative document the canary call addresses. */
export const LSP_DOUBLE_MISSING_PROBE_FILE = 'missing-server-probe.dbl'
/** The stdio child's own boot announcement, DERIVED from the vendored entry
 *  that writes it — `patches/omo-dsh/vendor/lsp-core/src/cli.ts:29`
 *  `stderr.write(\`[lsp-mcp] stdio server starting pid=${…}\n\`)`, stderr being
 *  inherited into every boot log (@modelcontextprotocol/client/dist/stdio.mjs:76
 *  `stderr ?? "inherit"`; cold-start.sh:215-223 is the landed grep of the same
 *  line). Nothing here re-types it: a reworded announcement moves this
 *  expectation with it, and a vanished one makes the derivation THROW instead of
 *  silently grepping for nothing.
 *
 *  Takes the SOURCE TEXT so this module stays free of filesystem access and the
 *  derivation is unit-testable; each caller reads cli.ts itself, and
 *  scripts/concerto-mode-probe.sh runs the SAME derivation in awk — two
 *  independent readers of one shipped literal, cross-checked by the PASS line
 *  printing the value they each produced.
 *
 *  @param cliSource the verbatim text of vendor/lsp-core/src/cli.ts
 *  @returns the static prefix of the child's starting announcement
 */
export function deriveLspMcpStartingMarker(cliSource) {
  // SELECTOR: the first `stderr.write(`…`)` whose literal carries the
  // `[lsp-mcp]` log prefix (cli.ts writes three stderr lines: this
  // announcement, a usage line, and the top-level catch — the prefix picks the
  // announcement out of them, and NOTHING else about the expectation is typed).
  // DERIVED: the wording after the prefix, and the truncation of the `pid=${…}`
  // suffix — the interpolation is per-boot state, so the greppable expectation
  // is everything before it.
  const match = /stderr\.write\(`(\[lsp-mcp\][^`]*)`\)/.exec(cliSource)
  if (match === null) {
    throw new Error(
      'deriveLspMcpStartingMarker: no `[lsp-mcp]` stderr.write announcement found in the vendored '
      + 'lsp-core cli.ts — the stdio child no longer announces itself, so every boot-log grep for it is stale',
    )
  }
  const marker = match[1].replace(/\\n$/, '').split('${')[0].trim()
  if (marker.length === 0) {
    throw new Error(`deriveLspMcpStartingMarker: the derived marker is empty (raw ${JSON.stringify(match[1])})`)
  }
  return marker
}
