# Third-Party Notices

This project builds upon the work of the following third-party projects.
Each contributor retains the rights to their own work under the licenses
noted below.

## oh-my-openagent (OMO)

- **Author:** code-yeongyu
- **License:** SUL-1.0 ([LICENSES/oh-my-openagent.LICENSE.md](LICENSES/oh-my-openagent.LICENSE.md))
- **Homepage:** https://github.com/code-yeongyu/oh-my-openagent

oh-my-openagent is the source of the agent/hook design and the Hard Blocks /
Anti-Patterns prompt content used in this project. OMO-derived source code and
content are distributed under OMO's SUL-1.0 license; no commercial
distribution is authorized.

### Vendored package: `@oh-my-opencode/hashline-core` (OMO v4.19.4)

- **Source repository:** https://github.com/code-yeongyu/oh-my-openagent
- **Tag:** `v4.19.4`
- **Commit:** `b072d279110bdda2c6ac2525d0d24dc54d16148a`
- **Upstream path:** `packages/hashline-core`
- **License:** SUL-1.0 ([LICENSES/oh-my-openagent.LICENSE.md](LICENSES/oh-my-openagent.LICENSE.md)).
  The upstream package manifest carries no `license` field (all 19 OMO core packages
  are alike); the license is the OMO repository-root `LICENSE.md`, vendored here
  byte-for-byte (sha256 `b61ac928f152d13517328263e6bee9175b928f9ab696a2d2ca2b6cfd961ddc32`).
- **Vendored into this repository at:** [`patches/omo-dsh/vendor/hashline-core`](patches/omo-dsh/vendor/hashline-core)
  (a pnpm workspace package; the upstream package name `@oh-my-opencode/hashline-core@0.1.0` is kept unchanged as the provenance anchor for drift detection and targeted intake).

> ⚠️ **MODIFIED COPY — prominent notice required by SUL-1.0 "Notices".**
> This project has **modified** the vendored copy of `hashline-core`. The
> modifications are declared in the package-root
> [`NOTICE.md`](patches/omo-dsh/vendor/hashline-core/NOTICE.md) and itemized,
> with per-file sha256 and reasons, in
> [`VENDOR-MANIFEST.json`](patches/omo-dsh/vendor/hashline-core/VENDOR-MANIFEST.json)
> (`deviations[]`, 6 entries: 3 modifications, 1 copied-in file, 2 project additions).
> Copyright in the upstream work remains with the original author (code-yeongyu);
> this project claims only its modifications. No commercial use or distribution
> is authorized.

Every file in the vendored package is listed below, one row per file
(decision D15, paragraph 2). The `Disposition` column mirrors the manifest's
per-file `origin`: `verbatim` → `verbatim` (**23**), `已修改` → `modified` (**3**),
`包外复制` → `copied-in` (**1**), `本项目新增` → `project-new` (**2**) — **29 files** total,
aligned one-to-one with `VENDOR-MANIFEST.json` `files[]` (29 entries). Per-file
sha256 values live in the manifest and are not duplicated here. The authoritative
coverage table is [`docs/plans/phase1-dev/phase1-license-attribution.md`](docs/plans/phase1-dev/phase1-license-attribution.md) §3.2.1.

| # | File (relative to package root) | Disposition | Notes |
|---|---|---|---|
| 1 | `AGENTS.md` | `verbatim` | Upstream package documentation (public API table and consumer notes) |
| 2 | `package.json` | `已修改` | Added `license: "SUL-1.0"` (D15 ¶1) and a `test:vitest` script; all other fields unchanged |
| 3 | `tsconfig.json` | `已修改` | Rewritten to the `ES2022` + `node` shape and excludes test files (upstream uses `bun-types`) |
| 4 | `src/autocorrect-replacement-lines.ts` | `verbatim` | — |
| 5 | `src/constants.ts` | `verbatim` | — |
| 6 | `src/diff-utils.test.ts` | `verbatim` | `bun:test` is aliased to vitest by configuration; source unchanged (shim S-1) |
| 7 | `src/diff-utils.ts` | `verbatim` | The only file that uses the external `diff` dependency |
| 8 | `src/edit-deduplication.ts` | `verbatim` | — |
| 9 | `src/edit-operation-primitives.ts` | `verbatim` | — |
| 10 | `src/edit-operations.test.ts` | `verbatim` | — |
| 11 | `src/edit-operations.ts` | `verbatim` | — |
| 12 | `src/edit-ordering.ts` | `verbatim` | — |
| 13 | `src/edit-text-normalization.ts` | `verbatim` | — |
| 14 | `src/file-text-canonicalization.ts` | `verbatim` | — |
| 15 | `src/hash-computation.test.ts` | `verbatim` | — |
| 16 | `src/hash-computation.ts` | `verbatim` | — |
| 17 | `src/hashline-chunk-formatter.ts` | `verbatim` | — |
| 18 | `src/hashline-edit-diff.ts` | `verbatim` | — |
| 19 | `src/index.ts` | `verbatim` | Package public API entry (59 lines) |
| 20 | `src/normalize-edits.test.ts` | `已修改` | One import line rewritten (out-of-package `test-support` → in-package; shim S-2) |
| 21 | `src/normalize-edits.ts` | `verbatim` | — |
| 22 | `src/smoke-untested-modules.test.ts` | `verbatim` | — |
| 23 | `src/types.ts` | `verbatim` | — |
| 24 | `src/validation.test.ts` | `verbatim` | — |
| 25 | `src/validation.ts` | `verbatim` | — |
| 26 | `src/xxhash32.ts` | `verbatim` | Probes the Bun binding via `globalThis`, with a pure-JS fallback |
| 27 | `src/test-support/unsafe-test-value.ts` | `包外复制` | Content verbatim, but copied from the upstream **out-of-package** path `test-support/unsafe-test-value.ts` (4-line type helper) — not one of the package's 26 upstream files |
| 28 | `NOTICE.md` (package root) | `本项目新增` | **Not upstream content:** the prominent "modified" notice required by SUL-1.0 (D15 ¶3, N-1) |
| 29 | `VENDOR-MANIFEST.json` (package root) | `本项目新增` | **Not upstream content:** source tag/commit + per-file sha256 + `deviations[]` |

**Totals:** 23 `verbatim` + 3 `已修改` + 1 `包外复制` + 2 `本项目新增` = **29 files**.

## oh-my-pi

- **Author:** can1357
- **Homepage:** https://github.com/can1357/oh-my-pi

oh-my-pi is the origin of the "hashline" concept, which this project builds
upon for content integrity checking.

## superpowers

- **Author:** obra
- **Homepage:** https://github.com/obra/superpowers

superpowers is the inspiration for this project's cross-harness skill system,
which allows skills to be shared and used across multiple AI coding harnesses.

## deepseek-harness (DSH)

- **Author:** deepseek-ai
- **License:** MIT
- **Homepage:** https://github.com/deepseek-ai/deepseek-harness

deepseek-harness is the host framework for this project, providing the
foundation upon which the oh-my-opendsh skills and hooks are layered.
