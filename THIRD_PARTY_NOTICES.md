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
