# NOTICE

This copy of `@oh-my-opencode/team-core` was vendored from
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) at tag
`v4.19.4`, commit `b072d279110bdda2c6ac2525d0d24dc54d16148a`
(upstream path `packages/team-core`).

**This copy has been MODIFIED.**

The complete list of modifications is recorded in the sibling file
`VENDOR-MANIFEST.json` (`deviations[]`).

This is a deliberate **subset** vendoring: `team-mailbox/`,
`team-layout-tmux/`, `team-worktree/`, the root barrel `src/index.ts`,
`resolve-caller-team-lead.ts`, `shell-quote.ts`,
`team-state-store/reservation-reconciliation.ts` and four upstream test
files are NOT part of this copy (enumerated per-file in
`VENDOR-MANIFEST.json` `subset.testsNotCarried[]`:
`loader-member-name-normalization.test.ts`,
`team-spec-input-normalizer.test.ts`, `paths.test.ts`, `resume.test.ts`)
(decision D4 + the phase 5 scope guardrails;
the `.delivering-` reservation reclaim is not ported — T1 ruling). The
package `exports` map is narrowed to the vendored surfaces accordingly.

External dependencies: `zod` (`^4.4.3`, the same value the upstream
`packages/team-core/package.json` declares) is taken as an npm dependency —
this is not a "port of the zod validators" (the S-10 narrowing boundary from
Phase 4 applies the same way: the dependency is declared, the upstream
validators' semantics ride along verbatim inside `types.ts` / `config.ts`).
The single `@oh-my-opencode/utils` import (`isPlainRecord` in
`team-state-store/store.ts`) is resolved by a 1-function semantic port at
`src/plain-record.ts`, attributed to its upstream source there.

Copyright remains with the original author, **code-yeongyu**. This copy is
distributed under the Sustainable Use License 1.0 (SUL-1.0); the license text
is kept at the repository root in `LICENSES/oh-my-openagent.LICENSE.md`. This
project claims only that it has modified the copy — it does not re-attribute
the work to itself and makes no implication of any commercial license or
commercial-use right.
