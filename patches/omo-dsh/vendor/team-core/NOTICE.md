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

**ESM extension completion (P5-T8b, arbitration ruling path (A), 2026-10-10).**
Every extensionless relative specifier in this copy — 141 specifiers across 34
source files (implementation files AND test files, one uniform grammar: file
form gains `.ts`, directory form gains `/index.ts`) — was completed so the
package loads under the host runtime: bare Node 24 native type-stripping
resolves NO extensionless relative specifier (the upstream copy is bun-style;
the wall and the ruling are recorded in
`.omo/evidence/p5t1/t8b-vendor-import-wall/` and in the P5-T8b arbitration
note of `docs/plans/phase5-dev/phase5-tasks.md`). This is a registration-graded
**semantically-zero-change** byte modification, the same family as the
strip-only param-property rewrites above: machine-proven by
`.omo/evidence/p5t1/t8b-vendor-import-wall/prove-zero-semantic-change.mjs`
(diff-face lint: stripping the completion reproduces every pre-image line
byte-for-byte; upstream-blob equality at tag `v4.19.4` for every file that
was verbatim at registration; base-commit equality for all affected files —
the previously registered deviation faces were not touched). Per-file hashes
and the per-directory deviation entries live in `VENDOR-MANIFEST.json`
(`kind: esm-extension-completion`, dual sha anchors kept: `upstreamSha256`
stays pinned at the upstream blobs, `sha256` re-pinned at the completed bytes).

**Dependency-range addendum (P5-T8b, T8a 遗留② 成文).** The range `^4.4.3`
stays as upstream declared — the range lives in this package's `package.json`
and NOWHERE else; the resolution is owned by the single root `pnpm-lock.yaml`
(measured at registration: resolved `zod@4.6.5`, which satisfies `^4.4.3`).
When `@oh-my-opendsh/omo-team` gained its consumer edge
(`"@oh-my-opencode/team-core": "workspace:*"`, P5-T8b deliverable 1), the
edge landed in the SAME lockfile (`link:../vendor/team-core`) — one workspace,
one lock, no second range anywhere. Nothing in this repo re-declares or
narrows zod's range; a future bump moves the lock, not any hand-copied
number.

Copyright remains with the original author, **code-yeongyu**. This copy is
distributed under the Sustainable Use License 1.0 (SUL-1.0); the license text
is kept at the repository root in `LICENSES/oh-my-openagent.LICENSE.md`. This
project claims only that it has modified the copy — it does not re-attribute
the work to itself and makes no implication of any commercial license or
commercial-use right.
