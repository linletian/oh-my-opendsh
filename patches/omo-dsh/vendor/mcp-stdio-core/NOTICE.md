# NOTICE

This copy of `@oh-my-opencode/mcp-stdio-core` was vendored from
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) at tag
`v4.19.4`, commit `b072d279110bdda2c6ac2525d0d24dc54d16148a`
(upstream path `packages/mcp-stdio-core`).

**This copy has been MODIFIED.**

The complete list of modifications is recorded in the sibling file
`VENDOR-MANIFEST.json` (`deviations[]`).

**Tests — carried vs not (measured 2026-10-13).** Upstream carries two test
files, both `bun:test` imports:

- `src/transport.test.ts` — **carried** (semantics unmodified). Its bun:test
  surface is `describe/expect/test` only, which the existing `bun:test`→`vitest`
  alias (shim S-1) carries unchanged; measured green 4/4 under vitest
  (`pnpm vitest run patches/omo-dsh/vendor/mcp-stdio-core`). The file bytes
  carry only the extension-wall completion (1 specifier), so the manifest
  origin is `modified`, not `verbatim`.
- `src/server.test.ts` — **not carried**. It imports `jest` from `bun:test`
  and drives `jest.useFakeTimers()/advanceTimersByTime()/getTimerCount()`
  (upstream L107–L258); vitest exports no `jest`, so shim S-1 cannot carry
  it — the same measured rationale that excluded team-core's `resume.test.ts`
  (`bun:test`'s `mock` absent under vitest). The `server.ts` module itself
  stays vendored verbatim.

The package `AGENTS.md` is not carried (package documentation, not part of the
ruled file set).

**Extension wall (T8b precedent).** Every relative import specifier in this
copy was rewritten from the upstream `.js` form to the explicit `.ts` form
(12 specifiers across 4 files) so the package loads under plain Node 24
type-stripping; machine-proven by
`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`.

External dependencies: none (upstream declares only the `bun-types`
devDependency, kept as declared — unused by this repo's node-shaped vendored
tsconfig, which registers as its own deviation).

Copyright remains with the original author, **code-yeongyu**. This copy is
distributed under the Sustainable Use License 1.0 (SUL-1.0); the license text
is kept at the repository root in `LICENSES/oh-my-openagent.LICENSE.md`. This
project claims only that it has modified the copy — it does not re-attribute
the work to itself and makes no implication of any commercial license or
commercial-use right.
