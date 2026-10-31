# NOTICE

This copy of `@oh-my-opencode/lsp-core` was vendored from
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) at tag
`v4.19.4`, commit `b072d279110bdda2c6ac2525d0d24dc54d16148a`
(upstream path `packages/lsp-core`).

**This copy has been MODIFIED.**

The complete list of modifications is recorded in the sibling file
`VENDOR-MANIFEST.json` (`deviations[]`).

**Carried surface.** All 65 upstream non-test `.ts` sources and the single
`.mjs` fixture are carried. All 21 upstream `.test.ts` files are NOT part of
this copy: they are `bun:test` suites and this repo's runner is vitest — the
exclusion rationale ruled at `.omo/evidence/p6t1/FORKS.md` §2.6 and the
hashline-core/team-core precedent (`bun:test`→`vitest` alias S-1 carries the
module name, not every API; the ruled discipline here is straight exclusion).
The package `AGENTS.md` is also not carried (package documentation, not part
of the ruled file set).

**Extension wall (T8b precedent).** Every relative import specifier in this
copy was rewritten from the upstream `.js` form to the explicit `.ts` form
(227 specifiers across 55 files — this package's own count, per its
`VENDOR-MANIFEST.json`; the sibling `mcp-stdio-core` carries its own 12
across 4; 239 across 59 is the TWO-PACKAGE total, not this package's), and
the single cross-package specifier
`@oh-my-opencode/mcp-stdio-core` in `src/mcp.ts` was rewritten to the
relative path `../../mcp-stdio-core/src/index.ts` (the sibling vendored
package). Machine-proven by
`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`
(zero remaining relative `.js` specifiers; every rewritten specifier resolves
to an existing file; `rewrite(upstream) == vendored bytes` for every file
whose only deviation is the wall; reverse-face lint).

**Strip-only parameter-property rewrites (T5 NOTES-6 precedent).** 14
constructors across 9 files used TypeScript parameter properties, which plain
Node 24 type-stripping rejects (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`; the
first load smoke hit the wall at `src/lsp/transport.ts` and the fix family is
the one team-core registered). Each was rewritten to declared field + explicit
assignment at the exact position tsc emits (after `super()` where present).
Files: `errors.ts`, `json-rpc-connection.ts`, `transport.ts`,
`workspace-document-state.ts`, `workspace-edit-path.ts`,
`workspace-edit-snapshot.ts`, `workspace-edit-types.ts`,
`workspace-mutation-controller.ts`, `request-context.ts`.

**Modern-era deviation in `src/mcp.ts` (P6-T4).** The vendored server gained
the 2026-07-28-era wire behaviour: it answers `server/discover` with the
modern advertisement, tracks the negotiated era per process, and stamps
`resultType` (+ `ttlMs`/`cacheScope` on cacheable lists) onto results, so the
dsh-mcp-client SDK stays in the modern era instead of silently downgrading to
legacy (ruling `.omo/evidence/p6t1/FORKS.md` §2.6 ⑤; codec ground truth the
installed `@modelcontextprotocol/client` dist; probe technique
`.omo/evidence/p6t1/mcp-client-probe/`). The `initialize` echo semantics are
upstream-verbatim (the server echoes the requested protocol version). An
env-gated wire diagnostic seam (`LSP_MCP_WIRE_LOG`, unset = zero behaviour
change) was added in the same file for probe evidence.

**`src/cli.ts` is project-new** (not upstream content): the thin stdio
entry for this repo's mount row. Its semantics REFERENCE the MIT package
`@code-yeongyu/lsp-tools-mcp`'s `src/cli.ts` (~30 lines: run the MCP stdio
server, dispose the default LSP manager on exit); attribution in the
repository-root `THIRD_PARTY_NOTICES.md`.

External dependencies: `@oh-my-opencode/mcp-stdio-core` (`workspace:*`) is
declared as upstream declares it and resolves to the sibling vendored package
in this workspace; `src/mcp.ts` imports it by relative path, so the declared
edge is provenance bookkeeping, not a runtime fetch.

Copyright remains with the original author, **code-yeongyu**. This copy is
distributed under the Sustainable Use License 1.0 (SUL-1.0); the license text
is kept at the repository root in `LICENSES/oh-my-openagent.LICENSE.md`. This
project claims only that it has modified the copy — it does not re-attribute
the work to itself and makes no implication of any commercial license or
commercial-use right.
