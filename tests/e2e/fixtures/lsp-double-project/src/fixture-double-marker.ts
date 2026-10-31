// tests/e2e/fixtures/lsp-double-project/src/fixture-double-marker.ts — the
// CANNED definition target of the P6-T5 LSP double.
//
// This file is the answer, not the question: `textDocument/definition` against
// `src/app.ts` returns the location of the sentinel comment below (the double
// derives the line by reading this file — see
// tests/e2e/fixtures/lsp-double-server.mjs `cannedDefinition`, and
// tests/e2e/drive.mjs, which derives the SAME number independently so the two
// readers must agree). Its content is therefore LOAD-BEARING at the byte level:
// moving the sentinel moves the asserted line, and deleting the sentinel makes
// the double answer -32603 rather than invent a location.
//
// It is committed TypeScript and must stay typeclean: the repo's root
// tsconfig.json `include` covers `tests`, so `pnpm typecheck` compiles it.
//
// Nothing here is imported by the product; the fixture project is a workspace
// root for the double (its package.json is what
// patches/omo-dsh/vendor/lsp-core/src/lsp/client-wrapper.ts:23 WORKSPACE_MARKERS
// stops the root search at), and this module is the symbol the fixture's
// `goto definition` resolves to.
export const LSP_DOUBLE_MARKER_EXPORTED = 'marker-symbol'

// LSP-DOUBLE-DEFINITION-TARGET-7c4d19
export function lspDoubleDefinitionTarget(): string {
  return `lsp-double marker ${LSP_DOUBLE_MARKER_EXPORTED}`
}
