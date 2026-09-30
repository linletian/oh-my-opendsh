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
| 27 | `src/test-support/unsafe-test-value.ts` | `包外复制` | Content verbatim, but copied from the upstream **out-of-package** path `test-support/unsafe-test-value.ts` (5-line type helper) — not one of the package's 26 upstream files |
| 28 | `NOTICE.md` (package root) | `本项目新增` | **Not upstream content:** the prominent "modified" notice required by SUL-1.0 (D15 ¶3, N-1) |
| 29 | `VENDOR-MANIFEST.json` (package root) | `本项目新增` | **Not upstream content:** source tag/commit + per-file sha256 + `deviations[]` |

**Totals:** 23 `verbatim` + 3 `已修改` + 1 `包外复制` + 2 `本项目新增` = **29 files**.

### Phase 2 persona semantic ports

The Concerto Mode agent personas are **not vendored code and not a copy**: each one is an
independent markdown rewrite of OMO prompt *content* — **semantic translation only**, no
TypeScript code copied. They extend decision D15's per-file disclosure discipline to derived
non-vendor content (plan §4.9). Every upstream path below is pinned to OMO tag `v4.19.4`
(commit `b072d279110bdda2c6ac2525d0d24dc54d16148a`), and each derived file carries its own
HTML-comment attribution header naming the same sources with line spans; those headers, not
this table, are the per-file authority.

#### Phase 2 additions (10 derived files)

| # | Derived file under `patches/omo-dsh/omo-agents/system-sections/` | Upstream source file(s) at `v4.19.4` (all under `packages/`) | Disposition |
|---|---|---|---|
| 1 | `hephaestus-persona.md` | `omo-opencode/src/agents/hephaestus/agent.ts` (role identity, `hephaestusPromptMetadata`, L1 permission table); `.../hephaestus/gpt.ts` (generic-layer autonomy contract); `.../hephaestus/gpt-5-4.ts`, `gpt-5-5.ts`, `gpt-5-6.ts` (shared goal-not-recipe framing, Manual-QA gate, stop rules — model-specific tuning deliberately discarded, plan R-3) | semantic translation only |
| 2 | `oracle-persona.md` | `omo-opencode/src/agents/oracle.ts` (`ORACLE_PROMPT_METADATA`, `ORACLE_DEFAULT_PROMPT`, `ORACLE_GPT_PROMPT`, `ORACLE_GPT_5_5_PROMPT`, read-only restriction list) | semantic translation only |
| 3 | `librarian-persona.md` | `omo-opencode/src/agents/librarian.ts` (`LIBRARIAN_PROMPT_METADATA` + prompt body). Context7 / MCP tool references dropped (MCP is Phase 6) | semantic translation only |
| 4 | `plan-consultant-persona.md` | `omo-opencode/src/agents/metis.ts` (`metisPromptMetadata`, `METIS_SYSTEM_PROMPT`, read-only restriction list); `utils/src/migration/agent-names.ts` (the upstream `plan-consultant` → `metis` rename mapping). Not ported: `METIS_K2_7_SYSTEM_PROMPT`, the embedded Anti-Duplication section | semantic translation only |
| 5 | `plan-reviewer-persona.md` | `omo-opencode/src/agents/momus.ts` (`momusPromptMetadata`, `MOMUS_DEFAULT_PROMPT`, `MOMUS_GPT_PROMPT`, source docstring, read-only restriction list). Not ported: `momus-gpt-5-6.ts`. NOTE: unlike metis, upstream `agent-names.ts` carries **no** momus rename entry — this rename is project-anchored | semantic translation only |
| 6 | `atlas-persona.md` | `omo-opencode/src/agents/atlas/agent.ts` (`atlasPromptMetadata`, dynamic-prompt assembly, model-variant routing table, agent config); `.../atlas/prompt-section-builder.ts`; `.../atlas/index.ts`; `prompts-core/prompts/atlas/default.md` (orchestrator prompt body); `prompts-core/src/atlas-prompts.ts`; `shared-skills/skills/start-work/SKILL.md` (the "NEVER THE IMPLEMENTER" absolute-rule phrase) | semantic translation only |
| 7 | `multimodal-looker-persona.md` | `omo-opencode/src/agents/multimodal-looker.ts` (`MULTIMODAL_LOOKER_PROMPT_METADATA`, `createMultimodalLookerAgent` and its single-tool read-only allowlist, mode declaration, agent description, prompt body); `omo-opencode/src/shared/permission-compat.ts` (allowlist expansion). Invocation model inverted: the caller supplies paths, `read` + `read_image` replace upstream's `look_at` attachment | semantic translation only |
| 8 | `sisyphus-junior-persona.md` | `omo-opencode/src/agents/sisyphus-junior/agent.ts` (docstring, `BLOCKED_TOOLS`, `SISYPHUS_JUNIOR_DEFAULTS`, variant selector, permission merge, agent description); `.../sisyphus-junior/default.ts` (the default prompt, sole porting source); `omo-opencode/src/agents/dynamic-agent-policy-sections.ts` (anti-duplication source, re-exported through `dynamic-agent-prompt-builder.ts`); `.../sisyphus-junior/AGENTS.md`. Not ported: the eight model-variant prompt files; upstream's forced `call_omo_agent` grant; the category-router semantics | semantic translation only |
| 9 | `prometheus-persona.md` | `prompts-core/prompts/prometheus/default.md`; `prompts-core/src/prometheus-prompts.ts`; `omo-opencode/src/agents/prometheus/system-prompt.ts` (`PROMETHEUS_PERMISSION`, `PROMETHEUS_SYSTEM_PROMPT`, `getPrometheusPrompt`); `.../prometheus/index.ts`; `omo-opencode/src/plugin-handlers/prometheus-agent-config-builder.ts`; `omo-opencode/src/hooks/prometheus-md-only/path-policy.ts`, `.../prometheus-md-only/hook.ts`, `.../prometheus-md-only/constants.ts`; `shared-skills/skills/ulw-plan/SKILL.md`; `.../ulw-plan/references/intent-clear.md`, `.../intent-unclear.md` | semantic translation only |
| 10 | `delegation-roster.md` (the sisyphus prompt's new 3rd section, of 5) | `omo-opencode/src/agents/dynamic-agent-core-sections.ts` (`buildKeyTriggersSection`, `buildToolSelectionTable` with its FREE→CHEAP→EXPENSIVE cost order, `buildDelegationTable`); `omo-opencode/src/agents/types.ts` (`AgentPromptMetadata` shape); the `*_PROMPT_METADATA` constants in `explore.ts`, `oracle.ts`, `librarian.ts`, `metis.ts`, `momus.ts`, `multimodal-looker.ts`, `hephaestus/agent.ts`, `atlas/agent.ts`. Four rows are derived rather than transcribed (see the file header) | semantic translation only |

#### Pre-existing OMO-derived content (backfilled context, plan §4.9)

Listed here so the OMO-derived-content inventory is complete; these predate Phase 2 and their
own attribution headers are unchanged.

| # | Derived file under `patches/omo-dsh/omo-agents/system-sections/` | Upstream source file(s) at `v4.19.4` (all under `packages/`) | Disposition |
|---|---|---|---|
| 11 | `explore-persona.md` | `omo-opencode/src/agents/explore.ts` (role, read-only constraints, reporting discipline); `omo-opencode/src/tools/call-omo-agent/constants.ts` (selection rationale); OMO `DEEP_CATEGORY_PROMPT_APPEND` semantics per feasibility report §13.5.1 | semantic translation only |
| 12 | `hard-blocks.md` | `omo-opencode/src/agents/dynamic-agent-policy-sections.ts:7-20` | semantic translation only |
| 13 | `anti-patterns.md` | `omo-opencode/src/agents/dynamic-agent-policy-sections.ts:22-37` | semantic translation only |

> Deliberately **not** listed: `delegation-discipline.md` and `role.md` carry
> `Source: original (oh-my-opendsh task T7 spec, this repo)` headers — they are this project's
> own content, not OMO-derived.

**Counts:** Phase 2 derived files listed = **10** (9 personas + `delegation-roster.md`);
pre-existing OMO-derived files backfilled = **3**; OMO-derived markdown files inventoried in
total = **13**. No existing entry above this section was modified (additions only).

### Phase 3 hook semantic ports

The omo-hooks plugin's listeners are **not vendored code and not a copy**: each one is an
independent DSH event-listener rewrite of OMO hook *semantics* — **semantic port only**, no
TypeScript code copied (the upstream hook bodies depend on `@opencode-ai/sdk`'s `Hooks`
interface and are not vendorable; see plan §2/§4.6). Same discipline as Phase 2 (D15's
per-file disclosure extended to derived content). Every upstream path below is pinned to OMO
tag `v4.19.4` (commit `b072d279110bdda2c6ac2525d0d24dc54d16148a`, under
`packages/omo-opencode/src/hooks/`); each derived file carries its own attribution header
naming the same sources — those headers and `patches/omo-dsh/omo-hooks/src/manifest.ts`
(per-file machine-readable lists), not this table, are the per-file authority.

#### Phase 3 additions (14 ported hook listeners)

| Hook (manifest id) | Derived file(s) under `patches/omo-dsh/omo-hooks/` | Upstream source file(s) at `v4.19.4` | Disposition |
|---|---|---|---|
| bash-file-read-guard | src/hooks/bash-file-read-guard.ts | bash-file-read-guard.ts | semantic port only |
| todo-continuation-enforcer | src/hooks/todo-continuation-enforcer.ts | todo-continuation-enforcer/abort-detection.ts, compaction-guard.ts, constants.ts, continuation-injection.ts, countdown.ts, handler.ts, idle-event.ts, index.ts, message-directory.ts, non-idle-events.ts, pending-question-detection.ts, resolve-message-info.ts, session-state.ts, stagnation-detection.ts, todo.ts, token-limit-detection.ts, types.ts（+ 16 上游测试文件作移植种子） | semantic port only（toast/countdown/abort-detection/磁盘 marker 等平台语义未移植，逐条注记于文件头） |
| empty-task-response-detector | src/hooks/empty-task-response-detector.ts | empty-task-response-detector.ts | semantic port only |
| session-notification | src/hooks/session-notification.ts | session-notification-content.ts, -event-properties.ts, -formatting.ts, -init.ts, -linux.ts, -log.ts, -macos.ts, -platform.ts, -runner.ts, -scheduler.ts, -send.ts, -sender.ts, -sound.ts, -utils.ts, -windows.ts, session-notification.ts（+ 5 上游测试文件作移植种子；session-todo-status.ts 的两谓词语义并入本文件） | semantic port only（Windows 后端不移植 D9；声音后端与外部插件检测未移植，注记于文件头） |
| background-notification | src/hooks/background-notification.ts | background-notification/hook.ts, index.ts, types.ts（+ 1 上游测试文件作移植种子） | semantic port only |
| edit-error-recovery | src/hooks/edit-error-recovery.ts | edit-error-recovery/hook.ts, index.ts（+ 1 上游测试文件作移植种子；错误串表按 DSH 实际文案重建，差异注记于文件头） | semantic port only |
| json-error-recovery | src/hooks/json-error-recovery.ts | json-error-recovery/hook.ts, index.ts（+ 1 上游测试文件作移植种子） | semantic port only |
| tool-output-truncator | src/hooks/tool-output-truncator.ts | tool-output-truncator.ts（+ 1 上游测试文件作移植种子）；另吸收 `packages/omo-opencode/src/shared/` 的 dynamic-truncator 族支撑语义（dynamic-truncator.ts, dynamic-truncator-types.ts, token-limit-truncator.ts, context-window-usage.ts, context-limit-resolver.ts, logger.ts, normalize-sdk-response.ts, plugin-identity.ts——import 闭包 8 实现文件，语义吸收非逐字） | semantic port only |
| directory-readme-injector | src/hooks/directory-readme-injector.ts | directory-readme-injector/constants.ts, finder.ts, hook.ts, index.ts, injector.ts, storage.ts（+ 2 上游测试文件作移植种子） | semantic port only（磁盘持久化未移植，注记于文件头） |
| agent-usage-reminder | src/hooks/agent-usage-reminder.ts | agent-usage-reminder/constants.ts, hook.ts, index.ts, storage.ts, types.ts（+ 2 上游测试文件作移植种子） | semantic port only |
| task-resume-info | src/hooks/task-resume-info.ts | task-resume-info/hook.ts, index.ts（+ 1 上游测试文件作移植种子） | semantic port only |
| webfetch-redirect-guard | src/hooks/webfetch-redirect-guard.ts | webfetch-redirect-guard/constants.ts, hook.ts, index.ts, redirect-resolution.ts（+ 1 上游测试文件作移植种子） | semantic port only |
| prometheus-md-only | src/hooks/prometheus-md-only.ts | prometheus-md-only/agent-matcher.ts, agent-resolution.ts, constants.ts, hook.ts, index.ts, path-policy.ts（+ 1 上游测试文件作移植种子） | semantic port only |
| ulw-execute（上游名 start-work，按 v5 命名锚点） | src/hooks/ulw-execute.ts + src/hooks/ulw-execute/（constants.ts, context-builder.ts, identity.ts, live-state.ts, parse-request.ts, plan-discovery.ts, worktree.ts） | start-work/context-info-builder.ts, context-info-formatters.ts, explicit-plan-context.ts, index.ts, notepad-scaffold.ts, parse-user-request.ts, plan-discovery-context.ts, plan-selection.ts, session-plan-affinity.ts, start-work-hook.ts, work-initializer.ts, worktree-block.ts, worktree-detector.ts（+ 7 上游测试文件作移植种子；命令面在 hooks/ 之外，属 Phase 4；boulder-state 依赖段跳过，逐条注记） | semantic port only |

> Deliberately **not** listed as ported: the 47 hook modules with a terminal
> skip/defer/excluded disposition (DSH-native coverage, no DSH seam, platform coupling,
> later-phase ownership, upstream-dead) — the per-module reasons are the coverage
> authority: `docs/plans/phase3-dev/phase3-hooks.md` §2.

**Counts:** Phase 3 derived listener files listed = **14 hook ids / 21 derived files**
(14 `src/hooks/*.ts` + 7 `src/hooks/ulw-execute/` 子模块). No existing entry above this
section was modified (additions only).

### Phase 4 skills vendoring

The 19 instruction skills of Phase 4 are **vendored content**, not a port: every
`SKILL.md` (and its reference files, scripts and templates) is copied
byte-for-byte from the frozen tag. What an agent is told to do is upstream's
text, so the file bodies are treated as copyright content under SUL-1.0 and
disclosed here file by file, exactly as decision D15 ¶2 requires — 291 rows is
large, which is why the directory-level inventory comes first and the
per-file enumeration follows as the auditable expansion.

- **Source repository:** https://github.com/code-yeongyu/oh-my-openagent
- **Tag:** `v4.19.4`
- **Commit:** `b072d279110bdda2c6ac2525d0d24dc54d16148a`
- **Upstream paths:** `packages/shared-skills/skills/` (17 skills, 286 files) +
  `packages/omo-senpi/skills/ultrawork/SKILL.md` and
  `packages/omo-senpi/skills/hyperplan/SKILL.md` (2 skills, 1 file each, the
  senpi command-instruction content consumed by the keyword mode and
  `/hyperplan`) — **288 skill files** in total.
- **License:** SUL-1.0 ([LICENSES/oh-my-openagent.LICENSE.md](LICENSES/oh-my-openagent.LICENSE.md)).
  The upstream package manifest carries no `license` field; the license is the
  OMO repository-root `LICENSE.md`, already vendored byte-for-byte in phase 1
  (sha256 `b61ac928f152d13517328263e6bee9175b928f9ab696a2d2ca2b6cfd961ddc32`).
- **Vendored into this repository at:** [`patches/omo-dsh/vendor/shared-skills`](patches/omo-dsh/vendor/shared-skills)
  (a pnpm workspace package; the upstream package name
  `@oh-my-opencode/shared-skills@0.1.0` is kept unchanged as the provenance
  anchor, so the D16 name gate releases its `SUL-1.0` field).

> ⚠️ **MODIFIED COPY — prominent notice required by SUL-1.0 "Notices".**
> This project has **modified** the vendored copy of `shared-skills`. The
> modifications are declared in the package-root
> [`NOTICE.md`](patches/omo-dsh/vendor/shared-skills/NOTICE.md) and itemized,
> with per-file sha256 and reasons, in
> [`VENDOR-MANIFEST.json`](patches/omo-dsh/vendor/shared-skills/VENDOR-MANIFEST.json)
> (`deviations[]`, 14 entries: 12 modifications, 2 project additions). All 12
> modifications are one of exactly two kinds: the `license` field added to
> `package.json`, and the `start-work` → `ulw-execute` naming-anchor rename
> (11 files, 40 token renames). No skill body was semantically rewritten, and
> no carrier-narrowing note was inserted into skill text.
> Copyright in the upstream work remains with the original author
> (code-yeongyu); this project claims only its modifications. No commercial use
> or distribution is authorized.

#### Directory-level inventory (19 skill directories — 288 files)

| Skill (bare name) | Upstream path at `v4.19.4` | Files | Disposition |
|---|---|---|---|
| `ast-grep` | `packages/shared-skills/skills/ast-grep/` | 17 | all verbatim |
| `coding-agent-sessions` | `packages/shared-skills/skills/coding-agent-sessions/` | 33 | all verbatim |
| `data-scientist` | `packages/shared-skills/skills/data-scientist/` | 9 | all verbatim |
| `debugging` | `packages/shared-skills/skills/debugging/` | 20 | all verbatim |
| `frontend` | `packages/shared-skills/skills/frontend/` | 26 | 19 verbatim + 7 renamed |
| `git-master` | `packages/shared-skills/skills/git-master/` | 2 | all verbatim |
| `hyperplan` | `packages/omo-senpi/skills/hyperplan/` | 1 | all verbatim |
| `init-deep` | `packages/shared-skills/skills/init-deep/` | 1 | all verbatim |
| `lsp-setup` | `packages/shared-skills/skills/lsp-setup/` | 25 | all verbatim |
| `programming` | `packages/shared-skills/skills/programming/` | 75 | all verbatim |
| `refactor` | `packages/shared-skills/skills/refactor/` | 1 | all verbatim |
| `remove-ai-slops` | `packages/shared-skills/skills/remove-ai-slops/` | 1 | all verbatim |
| `review-work` | `packages/shared-skills/skills/review-work/` | 1 | all verbatim |
| `ulw-execute` | `packages/shared-skills/skills/start-work/` → **renamed to `ulw-execute/`** (v5 naming anchor) | 1 | 0 verbatim + 1 renamed |
| `ultimate-browsing` | `packages/shared-skills/skills/ultimate-browsing/` | 48 | all verbatim |
| `ultrawork` | `packages/omo-senpi/skills/ultrawork/` | 1 | all verbatim |
| `ulw-plan` | `packages/shared-skills/skills/ulw-plan/` | 6 | 3 verbatim + 3 renamed |
| `ulw-research` | `packages/shared-skills/skills/ulw-research/` | 2 | all verbatim |
| `visual-qa` | `packages/shared-skills/skills/visual-qa/` | 18 | all verbatim |
| `package.json` (package root) | `packages/shared-skills/package.json` | 1 | `已修改` (license field) |
| `NOTICE.md` (package root) | — not upstream | 1 | `本项目新增` |
| `VENDOR-MANIFEST.json` (package root) | — not upstream | 1 | `本项目新增` |

#### Per-file enumeration (291 rows = `VENDOR-MANIFEST.json` `files[]` = `find patches/omo-dsh/vendor/shared-skills -type f | wc -l`)

The `Disposition` column mirrors the manifest's per-file `origin`:
`verbatim` → `verbatim`, `modified` → `已修改`, `project-new` → `本项目新增`
(**277 / 12 / 2** —
**291 files** total, aligned one-to-one with the manifest). Per-file
sha256 values live in the manifest and are not duplicated here; the pre-rename
upstream sha256 of every renamed file is likewise recorded there
(`upstreamSha256`, the R-8 two-way anchor), so a targeted upstream intake can
still address the original bytes.

| # | File (relative to package root) | Disposition | Notes |
|---|---|---|---|
| 1 | `skills/ast-grep/.gitignore` | `verbatim` | — |
| 2 | `skills/ast-grep/LICENSE` | `verbatim` | — |
| 3 | `skills/ast-grep/README.md` | `verbatim` | — |
| 4 | `skills/ast-grep/SKILL.md` | `verbatim` | — |
| 5 | `skills/ast-grep/SOURCE` | `verbatim` | — |
| 6 | `skills/ast-grep/install.ps1` | `verbatim` | — |
| 7 | `skills/ast-grep/install.sh` | `verbatim` | — |
| 8 | `skills/ast-grep/references/cli.md` | `verbatim` | — |
| 9 | `skills/ast-grep/references/install.md` | `verbatim` | — |
| 10 | `skills/ast-grep/references/patterns.md` | `verbatim` | — |
| 11 | `skills/ast-grep/references/pitfalls.md` | `verbatim` | — |
| 12 | `skills/ast-grep/references/recipes.md` | `verbatim` | — |
| 13 | `skills/ast-grep/references/sgconfig.md` | `verbatim` | — |
| 14 | `skills/ast-grep/references/yaml-rules.md` | `verbatim` | — |
| 15 | `skills/ast-grep/scripts/ast_grep_helper.py` | `verbatim` | — |
| 16 | `skills/ast-grep/tests/smoke.ps1` | `verbatim` | — |
| 17 | `skills/ast-grep/tests/smoke.sh` | `verbatim` | — |
| 18 | `skills/coding-agent-sessions/.gitignore` | `verbatim` | — |
| 19 | `skills/coding-agent-sessions/.npmignore` | `verbatim` | — |
| 20 | `skills/coding-agent-sessions/SKILL.md` | `verbatim` | — |
| 21 | `skills/coding-agent-sessions/agents/openai.yaml` | `verbatim` | — |
| 22 | `skills/coding-agent-sessions/pyrightconfig.json` | `verbatim` | — |
| 23 | `skills/coding-agent-sessions/references/all-platforms.md` | `verbatim` | — |
| 24 | `skills/coding-agent-sessions/references/claude.md` | `verbatim` | — |
| 25 | `skills/coding-agent-sessions/references/codex.md` | `verbatim` | — |
| 26 | `skills/coding-agent-sessions/references/opencode.md` | `verbatim` | — |
| 27 | `skills/coding-agent-sessions/references/senpi.md` | `verbatim` | — |
| 28 | `skills/coding-agent-sessions/scripts/agent_sessions/__init__.py` | `verbatim` | — |
| 29 | `skills/coding-agent-sessions/scripts/agent_sessions/aside_scanner.py` | `verbatim` | — |
| 30 | `skills/coding-agent-sessions/scripts/agent_sessions/claude.py` | `verbatim` | — |
| 31 | `skills/coding-agent-sessions/scripts/agent_sessions/cli.py` | `verbatim` | — |
| 32 | `skills/coding-agent-sessions/scripts/agent_sessions/codex.py` | `verbatim` | — |
| 33 | `skills/coding-agent-sessions/scripts/agent_sessions/file_scanners.py` | `verbatim` | — |
| 34 | `skills/coding-agent-sessions/scripts/agent_sessions/jsonio.py` | `verbatim` | — |
| 35 | `skills/coding-agent-sessions/scripts/agent_sessions/kiro_scanner.py` | `verbatim` | — |
| 36 | `skills/coding-agent-sessions/scripts/agent_sessions/opencode.py` | `verbatim` | — |
| 37 | `skills/coding-agent-sessions/scripts/agent_sessions/pi_family.py` | `verbatim` | — |
| 38 | `skills/coding-agent-sessions/scripts/agent_sessions/scanners.py` | `verbatim` | — |
| 39 | `skills/coding-agent-sessions/scripts/agent_sessions/sqlite_optional_scanners.py` | `verbatim` | — |
| 40 | `skills/coding-agent-sessions/scripts/agent_sessions/sqlite_scanners.py` | `verbatim` | — |
| 41 | `skills/coding-agent-sessions/scripts/agent_sessions/timeparse.py` | `verbatim` | — |
| 42 | `skills/coding-agent-sessions/scripts/agent_sessions/transcript.py` | `verbatim` | — |
| 43 | `skills/coding-agent-sessions/scripts/agent_sessions/types.py` | `verbatim` | — |
| 44 | `skills/coding-agent-sessions/scripts/find-agent-sessions.py` | `verbatim` | — |
| 45 | `skills/coding-agent-sessions/scripts/tests/test_agent_sessions.py` | `verbatim` | — |
| 46 | `skills/coding-agent-sessions/scripts/tests/test_aside_scanner.py` | `verbatim` | — |
| 47 | `skills/coding-agent-sessions/scripts/tests/test_cli_contract.py` | `verbatim` | — |
| 48 | `skills/coding-agent-sessions/scripts/tests/test_extended_scanners.py` | `verbatim` | — |
| 49 | `skills/coding-agent-sessions/scripts/tests/test_optional_sqlite_scanners.py` | `verbatim` | — |
| 50 | `skills/coding-agent-sessions/scripts/tests/test_pi_family_scanners.py` | `verbatim` | — |
| 51 | `skills/data-scientist/SKILL.md` | `verbatim` | — |
| 52 | `skills/data-scientist/references/common-scenarios.md` | `verbatim` | — |
| 53 | `skills/data-scientist/references/execution-templates.md` | `verbatim` | — |
| 54 | `skills/data-scientist/references/integration-patterns.md` | `verbatim` | — |
| 55 | `skills/data-scientist/references/performance-benchmarks.md` | `verbatim` | — |
| 56 | `skills/data-scientist/references/uv-setup.md` | `verbatim` | — |
| 57 | `skills/data-scientist/scripts/quick-query.py` | `verbatim` | — |
| 58 | `skills/data-scientist/scripts/setup-uv.ps1` | `verbatim` | — |
| 59 | `skills/data-scientist/scripts/setup-uv.sh` | `verbatim` | — |
| 60 | `skills/debugging/SKILL.md` | `verbatim` | — |
| 61 | `skills/debugging/references/methodology/00-setup.md` | `verbatim` | — |
| 62 | `skills/debugging/references/methodology/02-investigate.md` | `verbatim` | — |
| 63 | `skills/debugging/references/methodology/03-flaky-triage.md` | `verbatim` | — |
| 64 | `skills/debugging/references/methodology/04-oracle-triple.md` | `verbatim` | — |
| 65 | `skills/debugging/references/methodology/05-escalate.md` | `verbatim` | — |
| 66 | `skills/debugging/references/methodology/06-fix.md` | `verbatim` | — |
| 67 | `skills/debugging/references/methodology/08-qa.md` | `verbatim` | — |
| 68 | `skills/debugging/references/methodology/09-cleanup.md` | `verbatim` | — |
| 69 | `skills/debugging/references/methodology/partial-runtime-evidence.md` | `verbatim` | — |
| 70 | `skills/debugging/references/runtimes/bundled-js-binary.md` | `verbatim` | — |
| 71 | `skills/debugging/references/runtimes/go.md` | `verbatim` | — |
| 72 | `skills/debugging/references/runtimes/native-binary.md` | `verbatim` | — |
| 73 | `skills/debugging/references/runtimes/node.md` | `verbatim` | — |
| 74 | `skills/debugging/references/runtimes/python.md` | `verbatim` | — |
| 75 | `skills/debugging/references/runtimes/rust.md` | `verbatim` | — |
| 76 | `skills/debugging/references/tools/ghidra.md` | `verbatim` | — |
| 77 | `skills/debugging/references/tools/playwright-cli.md` | `verbatim` | — |
| 78 | `skills/debugging/references/tools/pwndbg.md` | `verbatim` | — |
| 79 | `skills/debugging/references/tools/pwntools.md` | `verbatim` | — |
| 80 | `skills/frontend/.gitignore` | `verbatim` | — |
| 81 | `skills/frontend/.npmignore` | `verbatim` | — |
| 82 | `skills/frontend/ATTRIBUTION.md` | `verbatim` | — |
| 83 | `skills/frontend/LICENSE-Apache-2.0.txt` | `verbatim` | — |
| 84 | `skills/frontend/SKILL.md` | `已修改` | **Renamed:** 1 `start-work` → `ulw-execute` reference(s) rewritten to the v5 naming anchor; no other byte changed |
| 85 | `skills/frontend/references/design/README.md` | `verbatim` | — |
| 86 | `skills/frontend/references/design/_INDEX.md` | `verbatim` | — |
| 87 | `skills/frontend/references/design/aside.md` | `verbatim` | — |
| 88 | `skills/frontend/references/design/clone-from-url.md` | `verbatim` | — |
| 89 | `skills/frontend/references/design/design-system-architecture.md` | `verbatim` | — |
| 90 | `skills/frontend/references/design/interaction-skill.md` | `verbatim` | — |
| 91 | `skills/frontend/references/design/layout-skill.md` | `verbatim` | — |
| 92 | `skills/frontend/references/design/lazyweb.md` | `verbatim` | — |
| 93 | `skills/frontend/references/design/react-dev-tooling-skill.md` | `verbatim` | — |
| 94 | `skills/frontend/references/designpowers/EVIDENCE.md` | `verbatim` | — |
| 95 | `skills/frontend/references/designpowers/README.md` | `已修改` | **Renamed:** 1 `start-work` → `ulw-execute` reference(s) rewritten to the v5 naming anchor; no other byte changed |
| 96 | `skills/frontend/references/designpowers/UPSTREAM.md` | `verbatim` | — |
| 97 | `skills/frontend/references/designpowers/lane-a-direction.md` | `已修改` | **Renamed:** 1 `start-work` → `ulw-execute` reference(s) rewritten to the v5 naming anchor; no other byte changed |
| 98 | `skills/frontend/references/designpowers/lane-b-execution.md` | `已修改` | **Renamed:** 11 `start-work` → `ulw-execute` reference(s) rewritten to the v5 naming anchor; no other byte changed |
| 99 | `skills/frontend/references/designpowers/lane-c-review.md` | `verbatim` | — |
| 100 | `skills/frontend/references/designpowers/lane-d-memory.md` | `已修改` | **Renamed:** 3 `start-work` → `ulw-execute` reference(s) rewritten to the v5 naming anchor; no other byte changed |
| 101 | `skills/frontend/references/designpowers/orchestration.md` | `已修改` | **Renamed:** 1 `start-work` → `ulw-execute` reference(s) rewritten to the v5 naming anchor; no other byte changed |
| 102 | `skills/frontend/references/designpowers/routing.md` | `已修改` | **Renamed:** 5 `start-work` → `ulw-execute` reference(s) rewritten to the v5 naming anchor; no other byte changed |
| 103 | `skills/frontend/references/perfection/README.md` | `verbatim` | — |
| 104 | `skills/frontend/references/perfection/react-perf-tooling.md` | `verbatim` | — |
| 105 | `skills/frontend/scripts/perfection/lighthouse-audit.py` | `verbatim` | — |
| 106 | `skills/git-master/SKILL.md` | `verbatim` | — |
| 107 | `skills/git-master/agents/openai.yaml` | `verbatim` | — |
| 108 | `skills/hyperplan/SKILL.md` | `verbatim` | Vendored from the **senpi** package path (`packages/omo-senpi/skills/…`), not from `packages/shared-skills` — it is the command-instruction content for the keyword-mode / `/hyperplan` surfaces |
| 109 | `skills/init-deep/SKILL.md` | `verbatim` | — |
| 110 | `skills/lsp-setup/SKILL.md` | `verbatim` | — |
| 111 | `skills/lsp-setup/references/bash/README.md` | `verbatim` | — |
| 112 | `skills/lsp-setup/references/c-cpp/README.md` | `verbatim` | — |
| 113 | `skills/lsp-setup/references/csharp/README.md` | `verbatim` | — |
| 114 | `skills/lsp-setup/references/dart/README.md` | `verbatim` | — |
| 115 | `skills/lsp-setup/references/elixir/README.md` | `verbatim` | — |
| 116 | `skills/lsp-setup/references/go/README.md` | `verbatim` | — |
| 117 | `skills/lsp-setup/references/haskell/README.md` | `verbatim` | — |
| 118 | `skills/lsp-setup/references/java/README.md` | `verbatim` | — |
| 119 | `skills/lsp-setup/references/julia/README.md` | `verbatim` | — |
| 120 | `skills/lsp-setup/references/kotlin/README.md` | `verbatim` | — |
| 121 | `skills/lsp-setup/references/lua/README.md` | `verbatim` | — |
| 122 | `skills/lsp-setup/references/php/README.md` | `verbatim` | — |
| 123 | `skills/lsp-setup/references/python/README.md` | `verbatim` | — |
| 124 | `skills/lsp-setup/references/ruby/README.md` | `verbatim` | — |
| 125 | `skills/lsp-setup/references/rust/README.md` | `verbatim` | — |
| 126 | `skills/lsp-setup/references/swift/README.md` | `verbatim` | — |
| 127 | `skills/lsp-setup/references/terraform/README.md` | `verbatim` | — |
| 128 | `skills/lsp-setup/references/typescript/README.md` | `verbatim` | — |
| 129 | `skills/lsp-setup/references/yaml/README.md` | `verbatim` | — |
| 130 | `skills/lsp-setup/references/zig/README.md` | `verbatim` | — |
| 131 | `skills/lsp-setup/scripts/detect-lsp.ts` | `verbatim` | — |
| 132 | `skills/lsp-setup/scripts/lsp-server-table.ts` | `verbatim` | — |
| 133 | `skills/lsp-setup/scripts/tsconfig.json` | `verbatim` | — |
| 134 | `skills/lsp-setup/scripts/verify-lsp.ts` | `verbatim` | — |
| 135 | `skills/programming/SKILL.md` | `verbatim` | — |
| 136 | `skills/programming/references/code-smells.md` | `verbatim` | — |
| 137 | `skills/programming/references/go/README.md` | `verbatim` | — |
| 138 | `skills/programming/references/go/backend-stack.md` | `verbatim` | — |
| 139 | `skills/programming/references/go/bootstrap.md` | `verbatim` | — |
| 140 | `skills/programming/references/go/bubbletea-v2.md` | `verbatim` | — |
| 141 | `skills/programming/references/go/cobra-stack.md` | `verbatim` | — |
| 142 | `skills/programming/references/go/concurrency.md` | `verbatim` | — |
| 143 | `skills/programming/references/go/data-modeling.md` | `verbatim` | — |
| 144 | `skills/programming/references/go/error-handling.md` | `verbatim` | — |
| 145 | `skills/programming/references/go/golangci-strict.md` | `verbatim` | — |
| 146 | `skills/programming/references/go/grpc-connect.md` | `verbatim` | — |
| 147 | `skills/programming/references/go/libraries.md` | `verbatim` | — |
| 148 | `skills/programming/references/go/one-liners.md` | `verbatim` | — |
| 149 | `skills/programming/references/go/sqlc-pgx.md` | `verbatim` | — |
| 150 | `skills/programming/references/go/testing.md` | `verbatim` | — |
| 151 | `skills/programming/references/go/type-patterns.md` | `verbatim` | — |
| 152 | `skills/programming/references/logging.md` | `verbatim` | — |
| 153 | `skills/programming/references/python/README.md` | `verbatim` | — |
| 154 | `skills/programming/references/python/async-anyio.md` | `verbatim` | — |
| 155 | `skills/programming/references/python/data-modeling.md` | `verbatim` | — |
| 156 | `skills/programming/references/python/data-processing.md` | `verbatim` | — |
| 157 | `skills/programming/references/python/error-handling.md` | `verbatim` | — |
| 158 | `skills/programming/references/python/fastapi-stack.md` | `verbatim` | — |
| 159 | `skills/programming/references/python/httpx2-optimization.md` | `verbatim` | — |
| 160 | `skills/programming/references/python/libraries.md` | `verbatim` | — |
| 161 | `skills/programming/references/python/one-liners.md` | `verbatim` | — |
| 162 | `skills/programming/references/python/orjson-stack.md` | `verbatim` | — |
| 163 | `skills/programming/references/python/pydantic-ai.md` | `verbatim` | — |
| 164 | `skills/programming/references/python/pyproject-strict.md` | `verbatim` | — |
| 165 | `skills/programming/references/python/textual-tui.md` | `verbatim` | — |
| 166 | `skills/programming/references/python/type-patterns.md` | `verbatim` | — |
| 167 | `skills/programming/references/rust/README.md` | `verbatim` | — |
| 168 | `skills/programming/references/rust/async-tokio.md` | `verbatim` | — |
| 169 | `skills/programming/references/rust/axum-stack.md` | `verbatim` | — |
| 170 | `skills/programming/references/rust/cargo-strict.md` | `verbatim` | — |
| 171 | `skills/programming/references/rust/clap-stack.md` | `verbatim` | — |
| 172 | `skills/programming/references/rust/concurrency.md` | `verbatim` | — |
| 173 | `skills/programming/references/rust/libraries.md` | `verbatim` | — |
| 174 | `skills/programming/references/rust/one-liners.md` | `verbatim` | — |
| 175 | `skills/programming/references/rust/proptest-insta.md` | `verbatim` | — |
| 176 | `skills/programming/references/rust/type-state.md` | `verbatim` | — |
| 177 | `skills/programming/references/rust/unsafe-discipline.md` | `verbatim` | — |
| 178 | `skills/programming/references/rust/zero-cost-safety.md` | `verbatim` | — |
| 179 | `skills/programming/references/rust-ub/README.md` | `verbatim` | — |
| 180 | `skills/programming/references/rust-ub/miri-sanitizers-loom.md` | `verbatim` | — |
| 181 | `skills/programming/references/rust-ub/ub-taxonomy.md` | `verbatim` | — |
| 182 | `skills/programming/references/typescript/README.md` | `verbatim` | — |
| 183 | `skills/programming/references/typescript/backend-hono.md` | `verbatim` | — |
| 184 | `skills/programming/references/typescript/bootstrap.md` | `verbatim` | — |
| 185 | `skills/programming/references/typescript/data-modeling.md` | `verbatim` | — |
| 186 | `skills/programming/references/typescript/error-handling.md` | `verbatim` | — |
| 187 | `skills/programming/references/typescript/tsconfig-strict.md` | `verbatim` | — |
| 188 | `skills/programming/references/typescript/type-patterns.md` | `verbatim` | — |
| 189 | `skills/programming/scripts/go/check-no-excuse-rules.sh` | `verbatim` | — |
| 190 | `skills/programming/scripts/go/new-project.py` | `verbatim` | — |
| 191 | `skills/programming/scripts/go/templates/.editorconfig` | `verbatim` | — |
| 192 | `skills/programming/scripts/go/templates/.golangci.yml` | `verbatim` | — |
| 193 | `skills/programming/scripts/go/templates/AGENTS.md.tmpl` | `verbatim` | — |
| 194 | `skills/programming/scripts/go/templates/README.md.tmpl` | `verbatim` | — |
| 195 | `skills/programming/scripts/go/templates/Taskfile.yml` | `verbatim` | — |
| 196 | `skills/programming/scripts/go/templates/ci.yml` | `verbatim` | — |
| 197 | `skills/programming/scripts/go/templates/config.go` | `verbatim` | — |
| 198 | `skills/programming/scripts/go/templates/gitignore` | `verbatim` | — |
| 199 | `skills/programming/scripts/go/templates/main.go.tmpl` | `verbatim` | — |
| 200 | `skills/programming/scripts/go/templates/run.go` | `verbatim` | — |
| 201 | `skills/programming/scripts/python/check-no-excuse-rules.py` | `verbatim` | — |
| 202 | `skills/programming/scripts/python/new-project.py` | `verbatim` | — |
| 203 | `skills/programming/scripts/python/new-script.py` | `verbatim` | — |
| 204 | `skills/programming/scripts/rust/check-no-excuse-rules.py` | `verbatim` | — |
| 205 | `skills/programming/scripts/rust/check-no-excuse-rules.sh` | `verbatim` | — |
| 206 | `skills/programming/scripts/rust/new-project.py` | `verbatim` | — |
| 207 | `skills/programming/scripts/typescript/check-no-excuse-rules.test.ts` | `verbatim` | — |
| 208 | `skills/programming/scripts/typescript/check-no-excuse-rules.ts` | `verbatim` | — |
| 209 | `skills/programming/scripts/typescript/new-project.ts` | `verbatim` | — |
| 210 | `skills/refactor/SKILL.md` | `verbatim` | — |
| 211 | `skills/remove-ai-slops/SKILL.md` | `verbatim` | — |
| 212 | `skills/review-work/SKILL.md` | `verbatim` | — |
| 213 | `skills/ultimate-browsing/.gitignore` | `verbatim` | — |
| 214 | `skills/ultimate-browsing/ATTRIBUTION.md` | `verbatim` | — |
| 215 | `skills/ultimate-browsing/SKILL.md` | `verbatim` | — |
| 216 | `skills/ultimate-browsing/engine/__init__.py` | `verbatim` | — |
| 217 | `skills/ultimate-browsing/engine/__main__.py` | `verbatim` | — |
| 218 | `skills/ultimate-browsing/engine/bias_check.py` | `verbatim` | — |
| 219 | `skills/ultimate-browsing/engine/curl_probe.py` | `verbatim` | — |
| 220 | `skills/ultimate-browsing/engine/executor.py` | `verbatim` | — |
| 221 | `skills/ultimate-browsing/engine/fetch_chain.py` | `verbatim` | — |
| 222 | `skills/ultimate-browsing/engine/referers.py` | `verbatim` | — |
| 223 | `skills/ultimate-browsing/engine/result_schema.py` | `verbatim` | — |
| 224 | `skills/ultimate-browsing/engine/summary.py` | `verbatim` | — |
| 225 | `skills/ultimate-browsing/engine/templates/package.json` | `verbatim` | — |
| 226 | `skills/ultimate-browsing/engine/templates/playwright_mobile_chrome.js` | `verbatim` | — |
| 227 | `skills/ultimate-browsing/engine/templates/playwright_real_chrome.js` | `verbatim` | — |
| 228 | `skills/ultimate-browsing/engine/tests/test_fetch_chain.py` | `verbatim` | — |
| 229 | `skills/ultimate-browsing/engine/tests/test_playwright_templates.py` | `verbatim` | — |
| 230 | `skills/ultimate-browsing/engine/url_transforms.py` | `verbatim` | — |
| 231 | `skills/ultimate-browsing/engine/validators.py` | `verbatim` | — |
| 232 | `skills/ultimate-browsing/engine/waf_detector.py` | `verbatim` | — |
| 233 | `skills/ultimate-browsing/engine/waf_profiles.yaml` | `verbatim` | — |
| 234 | `skills/ultimate-browsing/references/agent-reach/README.md` | `verbatim` | — |
| 235 | `skills/ultimate-browsing/references/agent-reach/career.md` | `verbatim` | — |
| 236 | `skills/ultimate-browsing/references/agent-reach/dev.md` | `verbatim` | — |
| 237 | `skills/ultimate-browsing/references/agent-reach/search.md` | `verbatim` | — |
| 238 | `skills/ultimate-browsing/references/agent-reach/social.md` | `verbatim` | — |
| 239 | `skills/ultimate-browsing/references/agent-reach/video.md` | `verbatim` | — |
| 240 | `skills/ultimate-browsing/references/agent-reach/web.md` | `verbatim` | — |
| 241 | `skills/ultimate-browsing/references/chrome-stealth.md` | `verbatim` | — |
| 242 | `skills/ultimate-browsing/references/insane-search/README.md` | `verbatim` | — |
| 243 | `skills/ultimate-browsing/references/insane-search/cache-archive.md` | `verbatim` | — |
| 244 | `skills/ultimate-browsing/references/insane-search/fallback.md` | `verbatim` | — |
| 245 | `skills/ultimate-browsing/references/insane-search/jina.md` | `verbatim` | — |
| 246 | `skills/ultimate-browsing/references/insane-search/json-api.md` | `verbatim` | — |
| 247 | `skills/ultimate-browsing/references/insane-search/media.md` | `verbatim` | — |
| 248 | `skills/ultimate-browsing/references/insane-search/metadata.md` | `verbatim` | — |
| 249 | `skills/ultimate-browsing/references/insane-search/naver.md` | `verbatim` | — |
| 250 | `skills/ultimate-browsing/references/insane-search/playwright.md` | `verbatim` | — |
| 251 | `skills/ultimate-browsing/references/insane-search/public-api.md` | `verbatim` | — |
| 252 | `skills/ultimate-browsing/references/insane-search/rss.md` | `verbatim` | — |
| 253 | `skills/ultimate-browsing/references/insane-search/tls-impersonate.md` | `verbatim` | — |
| 254 | `skills/ultimate-browsing/references/insane-search/twitter.md` | `verbatim` | — |
| 255 | `skills/ultimate-browsing/scripts/cookie_crypto.py` | `verbatim` | — |
| 256 | `skills/ultimate-browsing/scripts/cookie_domains.py` | `verbatim` | — |
| 257 | `skills/ultimate-browsing/scripts/cookie_paths.py` | `verbatim` | — |
| 258 | `skills/ultimate-browsing/scripts/extract_cookies.py` | `verbatim` | — |
| 259 | `skills/ultimate-browsing/scripts/tests/test_cookie_domain_filter.py` | `verbatim` | — |
| 260 | `skills/ultimate-browsing/scripts/tests/test_extract_cookies.py` | `verbatim` | — |
| 261 | `skills/ultrawork/SKILL.md` | `verbatim` | Vendored from the **senpi** package path (`packages/omo-senpi/skills/…`), not from `packages/shared-skills` — it is the command-instruction content for the keyword-mode / `/hyperplan` surfaces |
| 262 | `skills/ulw-execute/SKILL.md` | `已修改` | **Renamed skill** (upstream `start-work/`): frontmatter `name:`, body heading, and 2 gesture references now say `ulw-execute`; the two OMO carrier paths (`.omo/start-work/ledger.jsonl`, `components/start-work-continuation`) are kept verbatim on purpose — see the package `NOTICE.md` and `VENDOR-MANIFEST.json` `renames[]` |
| 263 | `skills/ulw-plan/SKILL.md` | `已修改` | **Renamed:** 4 `start-work` → `ulw-execute` reference(s) rewritten to the v5 naming anchor; no other byte changed |
| 264 | `skills/ulw-plan/agents/openai.yaml` | `verbatim` | — |
| 265 | `skills/ulw-plan/references/full-workflow.md` | `已修改` | **Renamed:** 6 `start-work` → `ulw-execute` reference(s) rewritten to the v5 naming anchor; no other byte changed |
| 266 | `skills/ulw-plan/references/intent-clear.md` | `verbatim` | — |
| 267 | `skills/ulw-plan/references/intent-unclear.md` | `已修改` | **Renamed:** 3 `start-work` → `ulw-execute` reference(s) rewritten to the v5 naming anchor; no other byte changed |
| 268 | `skills/ulw-plan/scripts/scaffold-plan.mjs` | `verbatim` | — |
| 269 | `skills/ulw-research/ATTRIBUTION.md` | `verbatim` | — |
| 270 | `skills/ulw-research/SKILL.md` | `verbatim` | — |
| 271 | `skills/visual-qa/SKILL.md` | `verbatim` | — |
| 272 | `skills/visual-qa/references/agent-browser-setup.md` | `verbatim` | — |
| 273 | `skills/visual-qa/scripts/ansi.test.ts` | `verbatim` | — |
| 274 | `skills/visual-qa/scripts/ansi.ts` | `verbatim` | — |
| 275 | `skills/visual-qa/scripts/cli.test.ts` | `verbatim` | — |
| 276 | `skills/visual-qa/scripts/cli.ts` | `verbatim` | — |
| 277 | `skills/visual-qa/scripts/east-asian-width.test.ts` | `verbatim` | — |
| 278 | `skills/visual-qa/scripts/east-asian-width.ts` | `verbatim` | — |
| 279 | `skills/visual-qa/scripts/image-diff.test.ts` | `verbatim` | — |
| 280 | `skills/visual-qa/scripts/image-diff.ts` | `verbatim` | — |
| 281 | `skills/visual-qa/scripts/png-crc.ts` | `verbatim` | — |
| 282 | `skills/visual-qa/scripts/png-decode.test.ts` | `verbatim` | — |
| 283 | `skills/visual-qa/scripts/png-decode.ts` | `verbatim` | — |
| 284 | `skills/visual-qa/scripts/png-synth.ts` | `verbatim` | — |
| 285 | `skills/visual-qa/scripts/tui-grid.test.ts` | `verbatim` | — |
| 286 | `skills/visual-qa/scripts/tui-grid.ts` | `verbatim` | — |
| 287 | `skills/visual-qa/scripts/types.ts` | `verbatim` | — |
| 288 | `skills/visual-qa/scripts/visual-qa.mjs` | `verbatim` | — |
| 289 | `package.json` | `已修改` | Added `license: "SUL-1.0"` (D15 ¶1) — the only change; upstream `exports`/`types`/`files` kept as-is (dangling `./index.mjs` is playbook M-3: recorded, not rewritten) |
| 290 | `NOTICE.md` | `本项目新增` | **Not upstream content:** the prominent "modified" notice required by SUL-1.0 (D15 ¶3, N-1) |
| 291 | `VENDOR-MANIFEST.json` | `本项目新增` | **Not upstream content:** source tag/commit + per-file sha256 + `deviations[]` |

**Totals:** 277 `verbatim` + 12 `已修改` + 2 `本项目新增` = **291 files**
(286 from `packages/shared-skills/skills` + 2 from `packages/omo-senpi/skills` + 3 package-root files).
Drift detection for this package (and for `hashline-core`) is mechanical:
`node scripts/vendor-manifest.mjs` re-hashes every entry and fails on any
mismatch, a file on disk that the manifest does not list, or a manifest entry
with no file.

> Deliberately **not** changed: the two OMO carrier paths named after the old
> skill — `.omo/start-work/ledger.jsonl` and `components/start-work-continuation`
> in `skills/ulw-execute/SKILL.md` — stay verbatim. They are runtime paths of
> the upstream harness, not references to the skill's name; renaming them would
> repoint an instruction at paths this project never creates. The carrier gap is
> tracked by the `omo-hooks` H-32 port (phase 3, risk R-6), not inside skill
> bodies.

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

## undici

- **Author:** Matteo Collina and Undici contributors
- **License:** MIT (the installed package's own `LICENSE`; its manifest declares
  `"license": "MIT"`)
- **Homepage:** https://github.com/nodejs/undici

undici is the HTTP transport the `webfetch-redirect-guard` hook uses to **pin** a
probe's connection to the address set it just validated (PR #9 review round 2,
N1) — the same primitive `dsh-web-fetch-http` builds its own pinned `Agent` from,
which is why the mirror uses it rather than reimplementing a connector. It is the
only third-party runtime dependency of the `@oh-my-opendsh/omo-hooks` package;
`patches/omo-dsh/omo-hooks/package.json` declares `undici@^8.10.0` (the major the
pinned dsh itself depends on), and `scripts/verify-licenses.sh` covers it like
every other locked package.
