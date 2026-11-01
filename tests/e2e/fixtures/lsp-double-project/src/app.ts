// tests/e2e/fixtures/lsp-double-project/src/app.ts — the file the P6-T5 e2e
// scenario points `mcp__lsp__*` at.
//
// Deliberately tiny and self-contained: it is the DOCUMENT the double is asked
// about (`textDocument/didOpen` receives its bytes,
// patches/omo-dsh/vendor/lsp-core/src/lsp/workspace-document-state.ts:339-341),
// so the bytes below travel onto the wire and the double's canned answer comes
// back. Nothing in this project is compiled, executed, or type-checked by the
// double — it is a document, not code under test — but it stays typeclean
// because the repo's root tsconfig `include` covers `tests`.
import { lspDoubleDefinitionTarget } from './fixture-double-marker'

export function appEntry(): string {
  return `app: ${lspDoubleDefinitionTarget()}`
}
