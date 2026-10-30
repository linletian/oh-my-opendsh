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
- **Consumption status: vendored but NOT consumed** (fork E = **(E-A)**, D19). Nothing mounts or
  imports this package: it has no row in `cordis.yml` and no import site anywhere in
  `patches/omo-dsh/omo-*` or `tests/` — the only mentions that treat it as a **dependency** are
  attribution/licensing ones (the license and vendor-manifest tooling). Two other mentions exist and are
  not hidden here, and neither is a dependency edge: `vitest.config.ts:23` names the package in a comment
  that records the collection split — the shared-skills skill-payload tests are excluded (they need the Bun
  runtime), while the vendored *package* tests (hashline-core) **keep running** through the `include` above,
  and
  `patches/omo-dsh/omo-hooks/src/hooks/bash-file-read-guard.ts:28-31` names hashline (the concept, not a
  package specifier) while recording why the hashline clause was dropped from the read advisory. Naming a
  thing in a comment is not importing it — no import, no mount, no execution path anywhere outside its own
  tree. The contrast is
  `@oh-my-opencode/lsp-core`, which DOES have a mount row (`omo-lsp`) and is live. Attribution here
  is therefore unconditional and does not depend on consumption: the copy exists, so the notice
  exists, whether or not anything runs it.

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

#### Phase 3 additions (16 hook ids — all 16 ported since P6-T7 flipped `ast-grep-sg-provision`, whose e2e scenarios `ast-grep-sg-via-bash` and `ast-grep-sg-absent-named-failure` landed there; the 15th, `keyword-detector`, landed in Phase 4; the 16th, `ast-grep-sg-provision`, landed in Phase 6 and was flipped to ported in the P6-T7 e2e commit)

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
| keyword-detector | src/hooks/keyword-detector.ts + src/hooks/keyword-detector/（constants.ts, detector.ts, filters.ts, messages.ts） | config/schema/keyword-detector.ts, hooks/keyword-detector/constants.ts, detector.ts, hook.ts, index.ts, types.ts, hyperplan/default.ts, hyperplan/index.ts, team/default.ts, team/index.ts, ultrawork/default.ts, ultrawork/gemini.ts, ultrawork/glm.ts, ultrawork/gpt.ts, ultrawork/planner.ts, ultrawork/source-detector.ts, ultrawork/index.ts（+ 7 上游测试文件作移植种子） | semantic port only（**Phase 4 落地，Phase 3 的 S-06 顺延项**：上游在 `chat.message` 上判别 ultrawork / ulw / hyperplan / hpp 与 `hyperplan ulw` 组合词后注入整份模式指令，本移植形态 = 一个 `agent/pre-step` waterfall listener（模式 A），命中即 `agent.inject()` 并永远 `next()`；**注入正文改为引用本仓 vendor 的 ultrawork / hyperplan SKILL.md**（P4-T4），5+1 个上游模型变体收窄为单一名册感知文案，`team` 枚举位**预留不接线**（Phase 5 面），toast 收窄为审计行。逐文件处置注记于 `src/hooks/keyword-detector.ts` 文件头，上游目录 **24 条目 = 16 实现 + 7 测试 + 1 `AGENTS.md`**（`AGENTS.md` 按 N-03 不计入移植面；再加目录外的 `config/schema/keyword-detector.ts` → manifest 两列之和 `upstreamFiles` 17 + `upstreamTestFiles` 7 = 24，与覆盖文档 §1.2 的「25 文件」差 1 即此 `AGENTS.md` 口径）） |
| ast-grep-sg-provision | src/hooks/ast-grep-sg-provision.ts + src/ast-grep/（types.ts, sg-manifest.ts, sg-resolver.ts, sg-provisioner.ts, install-script.ts, index.ts——供给层，见下方 P6-T6 节） | ast-grep-sg-provision/hook.ts, index.ts（+ 1 上游测试文件作移植种子）；供给层语义源 `packages/utils/src/ast-grep/` 6 文件（types.ts, sg-manifest.ts, sg-resolver.ts, sg-provisioner.ts, install-script.ts, index.ts，+ 4 上游测试文件作移植种子）+ `packages/utils/src/runtime/which.ts`（`whichOnPath` 语义源，内联进 sg-resolver.ts，不建文件） | semantic port only（**Phase 6 落地（P6-T6，fork G (G-A) 裁定）**：上游 `session.created` 事件 → 本移植 seam = `session/created` emit（seam 证据链注记于 listener 文件头）；**Windows 面按 D9 整族丢弃**——win32 slug / sg.exe / win32 assets 两行 / install.ps1 / pwsh / powershell.exe 分支逐条注记于 manifest 行 note ⑤ 与供给层文件头；provision 失败 = 具名 marker 响亮日志 + 结构化指引，**永不**打断 session/boot；hermetic：真实下载只在 resolver 三闸（`OMO_AST_GREP_SG_PATH` → runtimeDir → PATH）全空时才可达，e2e/CI 以 env 预置 fake sg 短路（FORKS.md §5.1）） |

> Deliberately **not** listed as ported: the 47 hook modules with a terminal
> skip/defer/excluded disposition (DSH-native coverage, no DSH seam, platform coupling,
> later-phase ownership, upstream-dead) — the per-module reasons are the coverage
> authority: `docs/plans/phase3-dev/phase3-hooks.md` §2.

**Counts:** Phase 3 derived listener files listed = **16 hook ids / 27 derived files**
(16 top-level `src/hooks/*.ts` + 11 files in the `keyword-detector/` and
`ulw-execute/` submodule directories). P4-T16: these two numbers were `14 / 21`
and had been stale since P4-T12 added `keyword-detector/` (P4-T8 added the
`stop-continuation-guard` service, which is NOT in this count — it lives in
`src/services/`, outside the `src/hooks/` set) — the file set moved
twice (P4-T10's ulw-execute submodules, P4-T12's keyword-detector) and the prose
did not. A hand-written count in a notices file is a count nobody re-reads, so
they are now **derived**: `scripts/verify-concerto-static.mjs` record c21
recomputes both from `manifest.ts` and the filesystem and fails if this paragraph
disagrees. Editing the number without moving a file is now impossible. P6-T6:
the numbers moved again `15 / 26` → `16 / 27` when `ast-grep-sg-provision`
landed — the +1 id and the +1 top-level listener file are the same row; the
hook's `src/ast-grep/` provisioning layer (6 files) is **not** in these two
numbers either (same exclusion discipline as `src/services/` above), and is
disclosed as its own section below with record c29 as its re-counter.

No existing entry above this section was modified (additions only).

**P4-T8 addition (add-only, and deliberately NOT one of the 16 manifest rows):**

| Derived file under `patches/omo-dsh/omo-hooks/` | Upstream source file(s) at `v4.19.4` | Disposition |
|---|---|---|
| `src/services/stop-continuation-guard.ts`（**无 manifest 条目** —— 它是 cordis **服务提供方**，发布 `omoStopContinuation` 供 `omo-commands` 的 `/stop-continuation` 消费，H-03 在同一插件内经 `ctx.get` 读取） | hooks/stop-continuation-guard/hook.ts, index.ts, index.test.ts（12 its 作移植种子）, plugin/stop-continuation.ts（命令侧四机制调用序列） | semantic port only（continuation marker 文件不移植：本仓无该读写面；后台级联改为 `ctx.jobs.list(caller)` + 同步 `kill(id, caller, reason)`—— **caller 必须传**：`list` 对无 caller 只回无主 job，而真实生产者一律带 owner（实测 dsh-jobs-local:178-180、dsh-tool-bash:416-417），不传会真机静默空转；再按 `ownerSession === sessionId` 收窄到本会话，对齐上游 `getAllDescendantTasks`；状态词表 `running｜stopping` —— DSH 无上游的 `pending`；`session.deleted` → `session/disposed`；**不入 c13 文件集核对**（`src/services/` 不在 `src/hooks/`），故 16 ids / 27 files 的计数不含它） |

### Phase 6 provisioning layer: `src/ast-grep/` (P6-T6, ast-grep-sg-provision)

The `ast-grep-sg-provision` listener is the roster's first hook with a **non-hook
provisioning layer** beside it: `patches/omo-dsh/omo-hooks/src/ast-grep/` 6 files
(`types.ts`, `sg-manifest.ts`, `sg-resolver.ts`, `sg-provisioner.ts`,
`install-script.ts`, `index.ts`), the 语义移植 of upstream
`packages/utils/src/ast-grep/` @ `v4.19.4` (plus the `whichOnPath` semantics of
`packages/utils/src/runtime/which.ts`, inlined into `sg-resolver.ts` — no file of
its own). 4 upstream test files served as port seeds (all five upstream tests of
this port unit were runner-ruled bun:test-import + runner-neutral bodies and were
carried, adapted — the adaptations are itemised in each test file's header). The
provisioning path is **sha256-verified against pinned 0.43.0 release hashes** and
fires, if ever, off the `session/created` seam only after the resolver's three
gates are all empty. Which faces can reach that seam is a **measured list, not a
category**, and reaching the seam takes TWO things at once — mounting `omo-hooks`
AND creating a session. Faces, enumerated:
* **Mounts omo-hooks AND creates a session — exactly two, both sealed by the same
  floor:** `tests/e2e/drive.mjs` (RPC `session.create`/`session/create`; the floor
  export is the `if (env.OMO_AST_GREP_SG_PATH === undefined)` assignment inside its
  `scenarioEnv` builder — cited by construct, not by line number, because that file is
  ~31k lines (measured) and every phase adding a scenario moves the number (the one that used to sit
  here was stale before this line was written), and it is the e2e face that runs in CI,
  exporting `OMO_AST_GREP_SG_PATH`
  **globally** from its `scenarioEnv`; and `scripts/smoke-real.mjs` — the MANUAL
  real-model face, needs a real key, never runs in CI — whose two anchors are split so
  neither is asked to carry a fact it does not sit on: RPC session-creating call sites
  at :790-791, floor export at :488 (`??=`), so an operator who deliberately wants the
  real binary to smoke provisioning itself can override it.
* **Boot without creating a session — no floor needed:** `scripts/concerto-mode-probe.sh`
  and `scripts/cold-start.sh` create no session at all (grep for session-CREATING calls
  over both: zero hits),
  so they never reach the seam.
* **Creates a session but does NOT mount omo-hooks — cannot reach the seam:**
  `scripts/prove-route-logging.mjs`, run by `scripts/run-proofs.sh:104` in CI gate 8,
  creates sessions IN-PROCESS via dsh's own AgentLoop — `ctx.agentLoop.create(SessionId(
  't15-parent'), …)` at :310, plus a continuable child — `ctx.subagents.startContinuable`
  at :332-341, which passes that parent at :337 — but its plugin face
  (:287-299: LlmRuntime, SessionStore, SystemPrompt, ToolRuntime, AgentRegistry,
  SessionProjections, JsonlSessionPersistence, AgentLoop, SubagentRuntime, SpawnProvider)
  carries **no omo-hooks**, so the listener is never registered and the seam is never
  touched. It is on the list because a claim about session-creating faces that omits it
  is simply false, even though the sealed-network conclusion is unchanged.
* **Unit suites** never reach it either — the hook is deps-injected and the hermetic
  drive in its test pre-seeds gate ① explicitly.
The RPC session-creating call sites in the tree are the two sealed faces above (this
replaces a stronger claim this file used to make — "the only `session.create` hits" —
which failed as a grep proposition the moment prose and comments were counted,
ARBITRATION-r3 B-MINOR-1). The pre-seed both floors point at is the
committed `tests/e2e/fixtures/fake-sg.sh` (executable; `--version` →
`ast-grep 0.43.0`, the same version as `SG_PINNED_VERSION`; any other argv → a
named stderr line + exit 2, never silent). A scenario may still re-point or empty
that key through its own env overrides (the shape T7's reverse canary needs), and
`drive.mjs --self-test` refuses a pre-seed that is missing, relative, empty,
non-executable or pinned to a different version — before any spawn (hermetic rule:
`OMO_AST_GREP_SG_PATH` pre-seed short-circuits it; the pre-seed itself is pinned by
the self-test and by the scenario belts, not by this prose). The vendored skill's own
`install.sh` stays the documented, **non-duplicated** fallback (dual-source
ruling: the hook layer is authoritative; the shared `OMO_AST_GREP_BIN_DIR` →
`astGrepRuntimeDir` targetDir convention is pinned by tests, not by prose).

**不入 c13 文件集核对**（`src/ast-grep/` 不在 `src/hooks/`，非 listener），故 16 ids / 27 files 的计数不含它；此供给层由 `scripts/verify-concerto-static.mjs` record **c29** 逐文件核对（文件集双向、署名头、barrel 接线、manifest 行、本段的 `src/ast-grep/ 供给层 = 6 files` 计数镜像，以及下表与磁盘 / manifest 的逐文件双向对账）。

| Derived file under `patches/omo-dsh/omo-hooks/` | Upstream source file(s) at `v4.19.4` | Disposition |
|---|---|---|
| `src/ast-grep/types.ts` | `packages/utils/src/ast-grep/types.ts` | semantic port only（win32 平台位按 D9 从 union 中丢弃，注记于文件头） |
| `src/ast-grep/sg-manifest.ts` | `packages/utils/src/ast-grep/sg-manifest.ts` | semantic port only（win32-x64 / win32-arm64 两行 assets 与 `.exe` 名分支丢弃；保留四 slug 的 pinned sha256 逐字） |
| `src/ast-grep/sg-resolver.ts` | `packages/utils/src/ast-grep/sg-resolver.ts`（+ `packages/utils/src/runtime/which.ts` 的 `whichOnPath` 语义，内联） | semantic port only（`Bun.which` 快径与 win32 `PATHEXT` 候选丢弃；三闸顺序 env → runtimeDir → PATH 逐字） |
| `src/ast-grep/sg-provisioner.ts` | `packages/utils/src/ast-grep/sg-provisioner.ts` | semantic port only（手写 zip 解包 stored+deflate、`.partial` 原子改名、`chmod 755` 逐字；win32 `.exe` preferredNames 丢弃） |
| `src/ast-grep/install-script.ts` | `packages/utils/src/ast-grep/install-script.ts` | semantic port only（`install.ps1` / `pwsh` / `powershell.exe` 选择分支整段丢弃，仅存 bash 面） |
| `src/ast-grep/index.ts` | `packages/utils/src/ast-grep/index.ts` | semantic port only（barrel 五 re-export 成员集不变） |

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

### Phase 4 commands semantic porting (add-only)

The `omo-commands` plugin's command definitions are **not vendored code and not a
copy**: each one is an independent DSH semantic port of an OMO builtin command —
the instruction body (upstream's own prose, the part an agent reads) is
reproduced, while the command entry and the injection path are DSH-native.
**Semantic port only**, the same discipline as the Phase 3 `omo-hooks` listeners
above. Every upstream path below is pinned to OMO tag `v4.19.4` (commit
`b072d279110bdda2c6ac2525d0d24dc54d16148a`, under
`packages/omo-opencode/src/features/builtin-commands/`); each derived file carries
its own attribution header naming the same sources — those headers and
`patches/omo-dsh/omo-commands/src/manifest.ts` (per-file machine-readable lists),
not this table, are the per-file authority.

`src/templates/stop-continuation.ts` is the one template in this section that is
**never handed to the model**: `/stop-continuation` performs its effect and reports
the real outcome (see the row below), so `renderStopContinuationInstruction()` is a
deliberate zero-injection shape, not a used path.

| Command (manifest id) | Derived file(s) under `patches/omo-dsh/omo-commands/` | Upstream source file(s) at `v4.19.4` | Disposition |
|---|---|---|---|
| handoff | src/commands/handoff.ts + src/commands/user-message.ts + src/commands/command-types.ts + src/commands/errors.ts + src/templates/handoff.ts + src/templates/render.ts | templates/handoff.ts, commands.ts（条目）, hooks/auto-slash-command/executor.ts（模板变量替换 + `formatCommandTemplate` 消息外框） | semantic port only（PHASE 0.5 的 `session_read` 调用收窄为指引文案：DSH 有近等价 service `@deepseek-ai/dsh-session-query` 但无现成模型工具；PHASE 1 的 `todoread()` / `Bash({command: …})` 拼写、`Suggested execution order` 代码块与 PHASE 3 的 `from todoread()` 后缀**按能力改写为散文指引**（DSH 无 todoread 面，bash 工具形态相近但拼写不同源，顺序内容保留）；PHASE 4 第 1 步补 DSH 会话面（Web GUI 新会话 / 再跑 `dsh`），OpenCode 写法留作括注 —— 三处收窄逐条注记于模板文件头 §1/§2/§3 与 `HANDOFF_CARRIER_NOTE` 第 1/2/3 条） |
| remove-ai-slops | src/commands/remove-ai-slops.ts + src/templates/remove-ai-slops.ts（共用上面两个 structural-type / 渲染文件） | templates/remove-ai-slops.ts（正文 L1-114）、同文件 L116-216（team-mode addendum，**P4 不移植 → P5-T13 接盘移植**，在场拼接形态）、commands.ts（条目）, hooks/auto-slash-command/executor.ts | semantic port only（team-mode addendum **P4 不移植 → P5-T13 接盘移植为在场拼接形态**：在场时按 `team_*` 探测把 addendum 拼进完整模板，缺席回落不含 addendum 的降级正文逐字；P4 不移植的理由与恢复路径、T13 的适配注记于文件头；`load_skills=["remove-ai-slops"]` / `$omo:remove-ai-slops` 的载体映射登记于 `REMOVE_AI_SLOPS_CARRIER_NOTE`，正文逐字保留） |
| stop-continuation | src/commands/stop-continuation.ts + src/templates/stop-continuation.ts（共用上面三个 structural-type / 渲染 / 错误模块；服务名常量本地重述，与 omo-hooks 侧由跨包相等单测钉住） | templates/stop-continuation.ts, commands.ts（条目）, plugin/stop-continuation.ts（命令侧效果序列） | semantic port only（四机制逐条映射：todo 续行 = H-03 查 guard 停止标记（真）；goal = `ctx.goals.pause`（**pause 而非 upstream 的 clearGoal**，目标保留可恢复）；后台任务 = `ctx.jobs.list` + `kill`（真）；ralph = **无程序化 stop API**，模板改为用户层面指引不承诺取消；boulder state 无对应面，随 `ulw-execute` 接盘）。**本命令的模板不下发给模型**（刻意零注入，见该节前言）：命令做的事就是命令本身，把"我已经停好了"再当一条用户消息喂回去只会多一个回合） |
| ulw-execute | src/commands/ulw-execute.ts + src/templates/ulw-execute.ts（共用上面四个 structural-type / 渲染 / user-message / 错误模块；R-10 的三个 marker 常量**本地重述**，与 omo-hooks 侧由跨包相等单测钉住） | templates/start-work.ts（正文 L1-120）、同文件 L1 标头 marker、commands.ts（条目 :61-76：agent 绑定 :62 / 三层 wrapper :63-74（session-context 段 :67-70）/ argumentHint :75）、start-work-agent.ts（`resolveStartWorkAgent` 的 atlas→sisyphus 两分支） | semantic port only（**R-10 双层携带**：wrapper 段在 commands.ts:63-74（session-context 段 :67-70）而不在模板本体，`<session-context>` 开标签 + `You are starting an Atlas work session.` 两个 marker 都必须逐字产出，缺一层则 H-32 激活门**静默失配**（不报错，只是不激活）—— 这是 H-32 constants.ts 登记的常量同步风险，跨包逐字相等由 tests/omo-commands/ulw-execute.test.ts 断言，且断言打在**渲染产物**上而不只是常量上；**boulder-state 段按 H-32 已登记收窄口径复用**（不重新判断）：① `.omo/boulder.json` 非本部署存储面，work session 落成**一个 `ctx.jobs` job**（kind `ulw-execute`，label 承载计划名，output 承载落地事实），故「hook pre-sets worktree_path in boulder.json」无落点，worktree 路径改由 session-context 承载；② `BoulderView` 恒为 `EMPTY_BOULDER_VIEW`（无活动 work 列表），故上游「多个活动 work → 问用户选哪个」分支**当前不可达** —— 正文**保留并标注**该分支而非删除（H-32 的 S-4 警告：接上非空投影时必须一并补回，否则显式计划名会错走「新建」而非「续接」）；③ `.omo/start-work/ledger.jsonl` 无对应面，同一目标改写入 goal 工具或 `.omo/notepads/<plan-name>/`；④ `create_goal` 本部署**恒真**，上游的条件式写法保留（能力面若收窄文案无需再改）；⑤ `agent: resolveStartWorkAgent(options)` **无 per-command agent 字段可落**（计划书 §4.2），绑定改为「模板身份明示 + 名册委派链」两处承载，**轨 B 相对轨 A 的实际增量**：两条轨的差别**只在第 ④ 条意图门**，身份门是共享前提，轨 B 不是独立激活路径 —— 在**真实模板产物**上两轨结果相同（`TEMPLATE_HEADER_MARKER` 自身含 `atlas work session`，而那是 `WORK_INTENT_MARKERS` 的一条，词表同样命中），故轨 B 的价值取决于**指挥者如何委派**：只有当委派任务文本是纯 marker 文本（不带词表词）时，两轨才给出不同结果，而那种输入在生产中能否出现不由本部署保证。判定面是 **atlas 子会话**的委派任务文本（marker 经「指挥者 → atlas 委派」抵达；指挥者会话无 descriptor，H-32 在 `!identity.found` 处早退，属**设计如此**，与上游「无命令 marker」形态对应）。且**上游的 sisyphus 回退分支在 DSH 不触发**（名册 atlas 为 Phase 2 常驻席位，不存在「atlas 未注册」这个部署形态）—— 如实登记而非假装移植，将来若名册允许 atlas 缺席，该回退需**重新实现**；**逐字保留**：命令首行（= R-10 标头 marker）、flags 语法 `[plan-name] [--worktree <path>] [--make-pr] [--ship]` 与四条 flag 语义、WHAT TO DO 六步骨架、OUTPUT FORMAT 三段样例、CRITICAL 五条、GOAL + TASK BREAKDOWN 两段强制要求、WORKTREE COMPLETION 六步 |
| hyperplan | src/commands/hyperplan.ts + src/templates/hyperplan.ts（共用上面四个 structural-type / 渲染 / user-message / 错误模块） | templates/hyperplan.ts（全文 17 行）、commands.ts（条目 :109-115：description :110 / `<command-instruction>` 外框 :111-113 / argumentHint `[planning-request]` :114）、packages/omo-senpi/skills/hyperplan/SKILL.md（自称 7-phase、标题实为 8 段 Phase 0–7 的 460 行正文，本仓已 vendor 于 vendor/shared-skills/skills/hyperplan/ 并由 T5 注册进 catalog） | semantic port only（**降级形态**）：① **无 team-mode 面** —— 上游建于 `team_create` + category 成员（`unspecified-low` / `unspecified-high` / `ultrabrain` / `artistry` / 可选 `deep`）+ `task_send` + `team_delete`，本部署全无；roster 契约段按 Phase 2 的 11 名册改写为 `plan-consultant`（≈上游 validator 角色）/ `plan-reviewer`（≈architect 角色）/ `prometheus`（接管 Phase 6 的 plan 角色），**上游 5 个成员角色中 3 个（skeptic / researcher / creative）无专属席位且被显式声明为缺席**而非静默删除（无「每 category 一个席位」机制 —— team-mode 才是那个机制）—— **零硬编码死链**由 tests/omo-commands/hyperplan.test.ts 按「可执行形式」判定（模型可见正文内不得出现配置路径 / `team_mode.enabled` / `restart opencode`，且 `team_create` / `team_delete` 的每次出现都必须处在「不存在/跳过」的否定句中）；② **完整对抗评审环不移植**（Phase 5 面），降级路径 = 多席位并行独立分析 → 交叉质询 → 一轮精修，并**要求模型在回复中声明降级**、不得把降级产物当作完整对抗环；③ **降级指引段为重写而非移植**：上游让用户「set `team_mode.enabled: true` in `~/.omo/omo.jsonc` and restart opencode」—— 本部署既无该 flag 也无该文件，照搬等于给用户一个「看起来能改、其实什么都不会变」的死链；**上游两处出处不一致如实登记**：命令模板 hyperplan.ts:17 写 `~/.omo/omo.jsonc`，而 prompts/mode/hyperplan.md 写 `~/.config/opencode/oh-my-opencode.jsonc` —— **两处均不在模型可执行面上复现**（原文引文与不一致记录只留在载体注记里，面向读者的注记需要原文，面向模型的指引需要没有死链）；④ **上游自身 “7-phase” 与 SKILL 的实际阶段数不一致**（SKILL 标题为 Phase 0…Phase 7 共 8 段），正文保留上游措辞、实际段数登记于载体注记第 4 条，以免日后按「7」核对而误判 vendor 文件被截断；⑤ **skill 调用形态改写、名字逐字保留**：上游 `skill(name="hyperplan")` 是 OMO 自有工具语法，本移植改为 dsh-tool-skill 模型面，而 skill 名 `hyperplan` 作为署名锚点不变（catalog 中的注册由 T5 与 skills 单测负责）；⑥ **无 session id** —— 上游 hyperplan 模板**不含** `$SESSION_ID` 也无 `<session-context>` 外框（其 `$ARGUMENTS` 就在模板本体的 `<user-request>` 里），故渲染器不会为它抛 `MissingCommandSessionIDError`，与 `/ulw-execute` 相反并有单测钉住；⑦ `agentBinding: null` —— 上游该条目**无 `agent:` 字段**（对比 start-work 的 `agent: resolveStartWorkAgent`），不假造绑定；⑧ **与 R-10 无关**：本模板不产 marker，H-32 的激活检测对 `/hyperplan` 无意义，它是纯 followup 指令而非激活面 | 降级语义为改写而非逐字：上游原话 description 逐字保留于 `UPSTREAM_HYPERPLAN_DESCRIPTION`，注册串在其后追加降级后缀（模型可见外框同串）。

> Deliberately **not** listed as ported: the one manifest row still `pending`
> (`ulw-plan`) — its per-row
> reasons and ownership are the coverage authority:
> `docs/plans/phase4-dev/phase4-commands.md` §1.2. `ulw-plan` in particular must
> never become a registered command: it would shadow DSH's own skill gesture.
>
> `ulw-execute` left the `pending` set in P4-T10 (handler + template + unit tests
> landed) and is listed above; its declared `e2eScenario`
> (`ulw-execute-command-activates-atlas`) landed with P4-T11, so that row is
> terminal on all three faces — manifest, coverage baseline and a real mock-LLM
> e2e scenario.
>
> Every ported command row now names a scenario that exists:
> `ulw-execute` → `ulw-execute-command-activates-atlas`,
> `handoff` → `handoff-summary-driven`,
> `remove-ai-slops` → `remove-ai-slops-driven`,
> `stop-continuation` → `stop-continuation-halts-todo`,
> `hyperplan` → `hyperplan-team-mode-full-ring`（P5-T14 翻名，旧名
> `hyperplan-degraded-noted`——T13 完整环在场形态下旧名与事实相反，诚实命名
> 优先；覆盖基线按 H-号段行锚收录，不随场景名翻动）。The one remaining `pending` row is
> `ulw-plan`, and its pendingness is a **permanent ruling, not unfinished work**
> (Q-3: registering a command of that name would shadow DSH's own skill gesture
> bridge). Its declared scenario `ulw-plan-loads-prometheus-skill` names the
> zero-code gesture path that was delivered in its place.

**Counts:** Phase 4 derived command files listed = **5 command ids / 14 derived
files** (`src/templates/{handoff,hyperplan,remove-ai-slops,render,stop-continuation,ulw-execute}.ts` +
`src/commands/{handoff,hyperplan,remove-ai-slops,user-message,command-types,errors,stop-continuation,ulw-execute}.ts`).
No existing entry above this section was modified (additions only).

The P4-T10 row also changes the **omo-hooks** side: `ulw-execute.ts`'s activation
detection gained a second track that matches the command-template markers
(`hasCommandTemplateMarker`), unioned with the existing delegation path behind
the same idempotency key. That file already has a row in the table above, so this
is a **modification of an existing entry's subject matter** rather than a new
entry — the narrowed storage face (`ctx.jobs` instead of `.omo/boulder.json`), the
empty work-state projection, the no-ledger difference and the marker constants are
all registered in `omo-hooks/src/hooks/ulw-execute.ts` + `ulw-execute/constants.ts`
and are referenced, not restated, by the template's carrier note.

### Phase 5 vendored package: `@oh-my-opencode/team-core` (OMO v4.19.4)

- **Source repository:** https://github.com/code-yeongyu/oh-my-openagent
- **Tag:** `v4.19.4`
- **Commit:** `b072d279110bdda2c6ac2525d0d24dc54d16148a`
- **Upstream path:** `packages/team-core`
- **License:** SUL-1.0 ([LICENSES/oh-my-openagent.LICENSE.md](LICENSES/oh-my-openagent.LICENSE.md)).
  The upstream package manifest carries no `license` field (all 19 OMO core packages
  are alike); the license is the OMO repository-root `LICENSE.md`, vendored here
  byte-for-byte (sha256 `b61ac928f152d13517328263e6bee9175b928f9ab696a2d2ca2b6cfd961ddc32`).
- **Vendored into this repository at:** [`patches/omo-dsh/vendor/team-core`](patches/omo-dsh/vendor/team-core)
  (a pnpm workspace package; the upstream package name `@oh-my-opencode/team-core@0.1.0` is
  kept unchanged as the provenance anchor, so the D16 name gate releases its `SUL-1.0` field).

> ⚠️ **MODIFIED COPY — prominent notice required by SUL-1.0 "Notices".**
> This project has **modified** the vendored copy of `team-core`. The
> modifications are declared in the package-root
> [`NOTICE.md`](patches/omo-dsh/vendor/team-core/NOTICE.md) and itemized,
> with per-file sha256 and reasons, in
> [`VENDOR-MANIFEST.json`](patches/omo-dsh/vendor/team-core/VENDOR-MANIFEST.json)
> (`deviations[]`, 17 entries: 9 modifications, 4 ESM-extension completions added at the
> T8b import-wall ruling, 3 project additions, 1 explanatory note — count re-read off
> the manifest at the T15 close-up; this line said 13 until then, a pre-T8b shape that
> the T8b completion wave never re-stated here).
> Copyright in the upstream work remains with the original author (code-yeongyu);
> this project claims only its modifications. No commercial use or distribution
> is authorized.

**Subset carve-outs (deliberately NOT vendored, decision D4 + the phase 5 scope
guardrails):** `src/team-mailbox/**`, `src/team-layout-tmux/**`, `src/team-worktree/**`,
the root barrel `src/index.ts` (it re-exports exactly the three excluded directories),
`src/resolve-caller-team-lead.ts`, `src/shell-quote.ts`,
`src/team-state-store/reservation-reconciliation.ts` (the only team-core file with a
team-mailbox runtime dependency — the `.delivering-` reservation reclaim is not ported,
T1 ruling) and the package `AGENTS.md` (not part of the T2-arbitrated 31-file
implementation subset). The package `exports` map is narrowed accordingly (D4).

**Tests — carried vs not (measured 2026-10-10):** all 14 upstream subset tests are
`bun:test` imports; 10 run byte-identically under this repo's vitest via the existing
`bun:test`→`vitest` alias (shim S-1) and are carried; 4 are not carried, each for a
measured reason registered in `VENDOR-MANIFEST.json` `subset.testsNotCarried[]`: two
import `../resolve-caller-team-lead` (outside the arbitrated subset), one uses the
bun-only chai matcher `toBeObject()` (red under vitest: `Invalid Chai property`), one
imports `mock` from `bun:test` (vitest exports no `mock`) and doubly tests the not-ported
reservation-reclaim semantics. `team-tasklist/test-support.ts` is carried verbatim as the
test helper the five tasklist tests import. The root tsconfig/vitest vendor-test exclusion
surfaces already cover this tree generically and were **not** widened (D16 discipline).

**External dependencies:** `zod` `^4.4.3` is declared in the vendor package's
`package.json` — the same value upstream `packages/team-core/package.json` declares —
as a normal npm dependency (locked `zod@4.6.5`, MIT, license-gate covered). This is
**not** a port of the zod validators: the upstream schemas ride along verbatim inside
`src/types.ts` / `src/config.ts` (the S-10 "zod 校验器不移植" narrowing boundary from
Phase 4 applies identically here). The single cross-package import of
`@oh-my-opencode/utils` (`isPlainRecord` at upstream `team-state-store/store.ts:1`,
the vendored tree's only such consumer) is resolved by a one-function **semantic port**
at [`src/plain-record.ts`](patches/omo-dsh/vendor/team-core/src/plain-record.ts),
attributed to `packages/utils/src/record-type-guard.ts` in its header; `isRecord` is
not ported (its consumers all live in the excluded files). The upstream `workspace:*`
dependencies `@oh-my-opencode/tmux-core` and `@oh-my-opencode/utils` are **removed**
from the vendored manifest — the first one's only upstream team-core consumers sit in
`src/team-layout-tmux/**` (not vendored, D4), the second one's only vendored consumer
was `team-state-store/store.ts:1` (now the `plain-record.ts` port), and both
`workspace:*` specifiers are unresolvable in this repo's workspace (measured:
`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` in a scratch workspace — leaving them would break
`pnpm install`); registered as `deviations[]` kind=`dependencies-narrowed`.

**Strip-only compliance (T5 NOTES-6):** vendored files are imported by the omo-team
runtime under Node 24 type-stripping, which rejects TypeScript parameter properties.
A multi-line scan found 4 upstream files using them; all 4 were rewritten
deviation-registered, semantically equivalent (declared fields + post-`super()`
assignments, the exact position `tsc` emits): `src/member-parser.ts`,
`src/team-registry/validator.ts`, `src/team-tasklist/claim.ts`,
`src/team-state-store/store.ts`. Evidence: per-file amaro parse probe across all 43
`.ts` files — 0 syntax failures (remaining probe errors are upstream's extensionless
import shape and the `bun:` scheme, both handled by the vitest toolchain, same as the
hashline-core precedent). Behavioral pinning, stated exactly (review-round calibration):
`TeamSpecValidationError` is constructed on the carried tests' code path —
validator.test.ts pins class + messages and loader.test.ts `toMatchObject` pins
`code` / `field` / `memberName` on the thrown instance; `claim.test.ts` and
`store.test.ts` pin only instance identity (`toBeInstanceOf(BlockedByError)` /
`toBeInstanceOf(RuntimeStateError)`) and do **not** read `err.blockers` /
`RuntimeStateError.code` (the only `.code` read in `store.test.ts`, L81, is on a Node
`ErrnoException` — `nodeError.code === "ENOENT"` after a failed `stat` — not on that class);
no carried test constructs `MemberValidationError` at all (0 construction sites measured).
The remaining fields are pinned by live construction instead: a one-shot instrumented
vitest probe against the real modules (`new BlockedByError(['1'])` → `blockers=['1']`;
`RuntimeStateError.code`; `TeamSpecValidationError.code/.field/.memberName` — probe file
deleted after the run, vendored file set unchanged) and a `node --experimental-strip-types`
run (`new MemberValidationError('msg','lead','both-kinds')` keeps `memberName` / `issue`);
per-class evidence is registered in the corresponding `deviations[]` entries.

Every file in the vendored package is listed below (decision D15 ¶2; rows are numbered
`P5-n` to keep the numbering space disjoint from the phase 1/4 tables). The
`Disposition` column mirrors the manifest's per-file `origin`: `verbatim` (**7**),
`已修改` → `modified` (**37**), `本项目新增` → `project-new` (**3**) — **47 files**
total, aligned one-to-one with `VENDOR-MANIFEST.json` `files[]` (47 entries). The
`modified` tally split, stated exactly: **7** rows are substantive (5 implementation
files — `member-parser.ts` / `team-registry/validator.ts` / `team-state-store/active-resume.ts` /
`team-state-store/store.ts` / `team-tasklist/claim.ts`, the T5/T8a strip-only + removal
rewrites — plus `package.json` + `tsconfig.json`); **30** rows carry ONLY the mechanical
`esm-extension-completion` of the T8b import-wall ruling (every extensionless relative
specifier gained its `.ts` / `/index.ts` so the host's Node 24 type-stripping resolves
it — semantically zero-change, machine-proven by `prove-zero-semantic-change.mjs`,
registered as the 4 `esm-extension-completion` entries of `deviations[]`; 4 of the
substantive rows sit inside those groups too — hence 34 completion files over 37
modified). This column once said verbatim **37** / modified **7** — the pre-T8b shape;
the manifest flipped honestly at T8b (`git log -S esm-extension-completion`) while this
table stayed stale until the T15 close-up re-read. Per-file sha256 values live in the
manifest and are not duplicated here; every `modified` entry also carries its pre-change
upstream blob sha256 (R-8 two-way anchor — verified across all 37). Drift detection
is mechanical and auto-discovers this package: `node scripts/vendor-manifest.mjs`.

| # | File (relative to package root) | Disposition | Notes |
|---|---|---|---|
| P5-1 | `package.json` | `已修改` | Added `license: "SUL-1.0"` (D15 ¶1) + `test:vitest` script; `exports` narrowed to the vendored subpaths (D4 — `.`, `./team-mailbox`, `./team-worktree`, `./team-layout-tmux` and the dangling `types` removed); `dependencies` narrowed — `@oh-my-opencode/tmux-core` + `@oh-my-opencode/utils` (both upstream `workspace:*`) removed, `zod` kept verbatim (consumers excluded/ported; `workspace:*` unresolvable here — `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` measured); all other fields unchanged (field-by-field diff vs the pinned upstream manifest verified 2026-10-10); `scripts.typecheck` kept upstream-shape (`tsgo`) as drift reference — no `tsgo` in this repo, package not in the typecheck gate (deviations kind=`notes`) |
| P5-2 | `tsconfig.json` | `已修改` | Rewritten to the `ES2022` + `node` shape and excludes test files (upstream uses `bun-types`; hashline-core precedent) |
| P5-3 | `src/config.ts` | `verbatim` | — |
| P5-4 | `src/logger.ts` | `verbatim` | — |
| P5-5 | `src/member-parser.ts` | `已修改` | **Strip-only rewrite:** `MemberValidationError` parameter properties → declared fields + post-`super()` assignments (Node 24 type-stripping, T5 NOTES-6); tsc-emit position-equivalent — no carried test constructs this class (0 sites measured), so evidence is a `node --experimental-strip-types` construction probe: `memberName` / `issue` preserved (2026-10-10) |
| P5-6 | `src/plain-record.ts` | `本项目新增` | **Not upstream-package content:** the `isPlainRecord` function, upstream expression byte-for-byte from `packages/utils/src/record-type-guard.ts`, with attribution header (the only project-written `.ts` in this copy) |
| P5-7 | `src/session-client.ts` | `verbatim` | — |
| P5-8 | `src/team-registry/caller-team-lead.ts` | `verbatim` | — |
| P5-9 | `src/team-registry/index.ts` | `已修改` | **ESM extension completion (T8b):** 3 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-10 | `src/team-registry/loader.test.ts` | `已修改` | **ESM extension completion (T8b):** 2 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-11 | `src/team-registry/loader.ts` | `已修改` | **ESM extension completion (T8b):** 10 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-12 | `src/team-registry/paths.ts` | `已修改` | **ESM extension completion (T8b):** 2 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-13 | `src/team-registry/team-spec-input-normalizer.ts` | `已修改` | **ESM extension completion (T8b):** 1 extensionless relative specifier completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-14 | `src/team-registry/validator.test.ts` | `已修改` | **ESM extension completion (T8b):** 3 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-15 | `src/team-registry/validator.ts` | `已修改` | **Strip-only rewrite:** `TeamSpecValidationError` parameter properties → declared fields + post-`super()` assignments (T5 NOTES-6); pinned by validator.test.ts (class + messages) and loader.test.ts `toMatchObject` (`code` / `field` / `memberName` on the thrown instance); **T8b ESM completion rode along:** 2 specifiers in its directory group (same ruling, same proof) |
| P5-16 | `src/team-state-store/active-resume.ts` | `已修改` | **Removals (T1 ruling):** upstream L2 orphaned `log` import, L5 `reservation-reconciliation` import, L12-36 `reconcileMemberReservations` helper, L56 its call — `.delivering-` reservation reclaim not ported; **T8b ESM completion rode along:** 6 specifiers in its directory group (same ruling, same proof) |
| P5-17 | `src/team-state-store/creating-resume.ts` | `已修改` | **ESM extension completion (T8b):** 4 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-18 | `src/team-state-store/deleting-resume.ts` | `已修改` | **ESM extension completion (T8b):** 4 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-19 | `src/team-state-store/error-normalization.ts` | `verbatim` | — |
| P5-20 | `src/team-state-store/index.ts` | `已修改` | Barrel exports only `./store` — verified clean of excluded modules; **ESM extension completion (T8b):** 1 extensionless relative specifier completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-21 | `src/team-state-store/locks.test.ts` | `已修改` | **ESM extension completion (T8b):** 10 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-22 | `src/team-state-store/locks.ts` | `已修改` | **ESM extension completion (T8b):** 1 extensionless relative specifier completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-23 | `src/team-state-store/resume-report.ts` | `verbatim` | — |
| P5-24 | `src/team-state-store/resume.ts` | `已修改` | **ESM extension completion (T8b):** 10 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-25 | `src/team-state-store/runtime-cleanup.ts` | `已修改` | **ESM extension completion (T8b):** 3 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-26 | `src/team-state-store/session-liveness.ts` | `已修改` | **ESM extension completion (T8b):** 3 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-27 | `src/team-state-store/store.test.ts` | `已修改` | **ESM extension completion (T8b):** 4 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-28 | `src/team-state-store/store.ts` | `已修改` | **Import rewrite + strip-only rewrite:** `isPlainRecord` now resolves to `../plain-record` (semantic port); `RuntimeStateError.code` parameter property → declared field + post-`super()` assignment (T5 NOTES-6); pinned by store.test.ts (`toBeInstanceOf`; the test does not read `RuntimeStateError.code` — the only `.code` read in that file, L81, is on a Node `ErrnoException` (`nodeError.code === "ENOENT"`), not on this class — construction-time preservation confirmed by the instrumented probe, 2026-10-10); **T8b ESM completion rode along:** 6 specifiers in its directory group (same ruling, same proof) |
| P5-29 | `src/team-state-store/worker-resume-status.ts` | `已修改` | **ESM extension completion (T8b):** 2 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-30 | `src/team-tasklist/claim.test.ts` | `已修改` | **ESM extension completion (T8b):** 5 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-31 | `src/team-tasklist/claim.ts` | `已修改` | **Strip-only rewrite:** `BlockedByError.blockers` parameter property → declared field + post-`super()` assignment (T5 NOTES-6); claim.test.ts pins `toBeInstanceOf(BlockedByError)` only (no test reads `err.blockers`) — instrumented probe measured `new BlockedByError(['1'])` → `blockers=['1']` preserved (2026-10-10); **T8b ESM completion rode along:** 8 specifiers in its directory group (same ruling, same proof) |
| P5-32 | `src/team-tasklist/dependencies.test.ts` | `已修改` | **ESM extension completion (T8b):** 2 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-33 | `src/team-tasklist/dependencies.ts` | `已修改` | **ESM extension completion (T8b):** 1 extensionless relative specifier completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-34 | `src/team-tasklist/get.test.ts` | `已修改` | **ESM extension completion (T8b):** 3 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-35 | `src/team-tasklist/get.ts` | `已修改` | **ESM extension completion (T8b):** 4 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-36 | `src/team-tasklist/index.ts` | `已修改` | Barrel re-exports only vendored files — verified; **ESM extension completion (T8b):** 6 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-37 | `src/team-tasklist/list.test.ts` | `已修改` | **ESM extension completion (T8b):** 5 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-38 | `src/team-tasklist/list.ts` | `已修改` | **ESM extension completion (T8b):** 5 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-39 | `src/team-tasklist/store.test.ts` | `已修改` | **ESM extension completion (T8b):** 3 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-40 | `src/team-tasklist/store.ts` | `已修改` | **ESM extension completion (T8b):** 5 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-41 | `src/team-tasklist/test-support.ts` | `已修改` | Test helper imported by the five tasklist tests — carried as test support, not implementation; **ESM extension completion (T8b):** 4 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-42 | `src/team-tasklist/update.test.ts` | `已修改` | **ESM extension completion (T8b):** 5 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-43 | `src/team-tasklist/update.ts` | `已修改` | **ESM extension completion (T8b):** 7 extensionless relative specifiers completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-44 | `src/tolerant-fsync.ts` | `verbatim` | — |
| P5-45 | `src/types.ts` | `已修改` | **ESM extension completion (T8b):** 1 extensionless relative specifier completed to `.ts`/`/index.ts` — semantically zero-change, machine-proven (deviations kind=`esm-extension-completion`); upstream blob anchored (R-8) |
| P5-46 | `NOTICE.md` | `本项目新增` | **Not upstream content:** the prominent "modified" notice required by SUL-1.0 (D15 ¶3, N-1) |
| P5-47 | `VENDOR-MANIFEST.json` | `本项目新增` | **Not upstream content:** source tag/commit + per-file sha256 + `deviations[]` |

**Totals:** 7 `verbatim` + 37 `已修改` + 3 `本项目新增` = **47 files**
= 31 upstream implementation files of the T2-arbitrated subset (5 substantively
modified at T5/T8a + 19 carrying only the T8b `esm-extension-completion` + 7 verbatim)
+ 10 carried upstream tests + `src/team-tasklist/test-support.ts` (test helper) — all
11 `.ts` test faces carry the T8b completion too (one grammar, no split shape)
+ `src/plain-record.ts` (semantic port) + 4 package-root files
(`package.json`, `tsconfig.json`, `NOTICE.md`, `VENDOR-MANIFEST.json`).

### Phase 5 vendored package: `@oh-my-opencode/prompts-team` (OMO v4.19.4)

- **Source repository:** https://github.com/code-yeongyu/oh-my-openagent
- **Tag:** `v4.19.4`
- **Commit:** `b072d279110bdda2c6ac2525d0d24dc54d16148a`
- **Upstream paths:** `packages/prompts-core/prompts/mode/team.md` +
  `packages/skills-loader-core/src/features/builtin-skills/skills/team-mode.ts`
  (a two-root pair; the T1 arbitration Q1b N5 widened the vendor list from one
  item to two — the keyword-hit lead instruction lives in `team.md`, the real
  lead run protocol lives in the `teamModeSkill.template`).
- **License:** SUL-1.0 ([LICENSES/oh-my-openagent.LICENSE.md](LICENSES/oh-my-openagent.LICENSE.md)).
  Neither upstream package manifest carries a `license` field (all OMO core
  packages are alike, D15); the license is the OMO repository-root `LICENSE.md`.
- **Vendored into this repository at:** [`patches/omo-dsh/vendor/prompts-team`](patches/omo-dsh/vendor/prompts-team)
  (a pnpm workspace package with a **project-new package identity** — no single
  upstream manifest exists for a two-root pair; the name follows the vendored
  content, the shared-skills/hashline-core SUL scope precedent kept).

> ✅ **VERBATIM COPY — no content modification.** Both content files are
> byte-for-byte the frozen `v4.19.4` blobs (taken read-only via
> `git -C <omo-repo> show v4.19.4:<path>`):
> `prompts/mode/team.md` 615 B / 2 lines, sha256
> `5e7ab9391fcd43ebf9471de3de7babff6af228f17bbffa47685f47877f380a87`
> (cross-pinned by `.omo/evidence/p5t1/Q1b-teamcore-teammd.md` §5);
> `src/features/builtin-skills/skills/team-mode.ts` 9450 B / 204 lines, sha256
> `cc0607a9a883b8b22de3b4de83b4aba4ac473978e4229a8fc150ef55bf793e4d`.
> The package-root records (`package.json`, `NOTICE.md`, `VENDOR-MANIFEST.json`)
> are project-new; the drift detector
> ([`scripts/vendor-manifest.mjs`](scripts/vendor-manifest.mjs), consumed by
> [`tests/vendor/prompts-team-manifest.test.ts`](tests/vendor/prompts-team-manifest.test.ts))
> re-hashes every registered file in both directions. Copyright remains with the
> original author (code-yeongyu); this project claims nothing over the content.

**Known contradictions registered, NOT rewritten (deviations[] in
[`VENDOR-MANIFEST.json`](patches/omo-dsh/vendor/prompts-team/VENDOR-MANIFEST.json),
all 5 entries are `note`-class — zero byte changes):**

- **N1 — `status:"failed"` is a hollow instruction:** the `team-mode` template
  teaches a `failed` terminal task state (and `team.md` teaches re-checking after
  a update that "completes or fails" a task) that the vendored team-core tasklist
  schema does not contain — this repo's `TEAM_TASK_STATUSES` is
  `pending|claimed|in_progress|completed|deleted` (`omo-team/src/tools/team-task.ts:76`).
  The tool's refusal names the legal enum; the adaptation authority is the
  vendored tasklist schema (Q1b N1 ruling).
- **N9 — delegation-tool name drift:** `team.md` names `delegate_task`, the
  `team-mode` template names `delegate-task`; neither exists on DSH, where
  delegation is the roster's ten toolNames (`omo-agents/src/roster.ts`). The
  prohibition's semantics ("ordinary delegation is not team orchestration")
  survives the naming drift (Q1b N9 ruling).
- **M-3 dangling import:** `team-mode.ts:1` imports the `BuiltinSkill` type
  from `../types` (outside the vendored subset); recorded, not rewritten — the
  file is archive content, nothing in this repo imports it.
- **Q-4 NOTES-6 consistency check (P5-T12):** the team_* call shapes the
  vendored shared-skills teach were verified consistent with this repo's
  tool face — `refactor/SKILL.md` teaches `team_send_message(teamRunId, to,
  summary, body)` (L672/L703/L729), the `to="*"` lead broadcast,
  `team_task_create(teamRunId, subject, description, blockedBy)` (L709) and
  `team_task_update(status=completed|pending)` (L672/L678/L729);
  `debugging/references/methodology/02-investigate.md` references
  `team_send_message` / `team_task_create` (L58/L79). This repo's surface
  accepts exactly those parameters (`team-message.ts` teamRunId min1 / to
  min1 / body / summary? / references? with the lead-only broadcast refusal
  `broadcast requires lead role`; `team-task.ts:76` five-value status incl.
  `completed`/`pending`), and NO vendored shared-skill teaches
  `team_task_update(status=failed)` — the only `status: "failed"` hit under
  `vendor/shared-skills/` is `08-qa.md:54`, about READING a response
  sub-field, not a tool parameter. No rewrite needed on those texts; the
  remaining texts-vs-surface contradictions are exactly N1/N9 above.
- **T13 opencode carrier fallback sentence (P5-T13):** `team.md`'s closing sentence
  tells the user to "set team_mode.enabled=true and restart opencode" — an
  opencode-carrier instruction. DSH has no such configuration key, no such file and
  no restart ritual behind it; following it literally sends the user at a dead
  switch. Registered in `deviations[]` (kind=`note`; deviations registration takes
  priority over NOTICE-only, per the T13 arbitration), body kept verbatim; the
  adaptation lives in the consuming command texts — the hyperplan full guidance
  item 7 and the remove-ai-slops addendum MUST-NOT line each state "the live
  team_* tool surface IS the switch", neither naming the flag.

**Consumption (registration-time, both rows flipped to `ported` at P5-T12):**
`prompts/mode/team.md` is the live injection body of the keyword-detector `team`
slot — `omo-hooks` reads it from this path at apply time
(`keyword-detector/messages.ts`, the same disk-read shape as the ultrawork /
hyperplan SKILL.md bodies) and injects it verbatim on a `TEAM_PATTERN` hit,
stamped `source.kind = 'omo-team-keyword'` (Q-8 A1; members are NOT released —
`team` stays out of `SUBAGENT_ALLOWED_TYPES`).
`src/features/builtin-skills/skills/team-mode.ts` is the archived lead run
protocol: its bytes are gated at boot by the `vendor-team-prompts` registrar
([`omo-team/src/team/team-prompts-vendor.ts`](patches/omo-dsh/omo-team/src/team/team-prompts-vendor.ts),
sha-vs-manifest, drift = the row logs FAILED) and its template is the T13
upgrade surface's read anchor.

### Phase 5 omo-team semantic ports (the 9 ported files — c25's ported population)

The `omo-team` plugin's own implementation files are **not vendored code and not a
copy**: each of the 9 files below is an independent DSH **semantic port** of an OMO
team-mode surface — the upstream semantics (judgement rules, permission vocabulary,
error families, state-machine transitions) are re-expressed in DSH-native code with
zero upstream code bytes, no zod, no upstream imports — the same discipline as the
Phase 3 `omo-hooks` listeners and the Phase 4 `omo-commands` templates above. Every
upstream path below is pinned to OMO tag `v4.19.4` (commit
`b072d279110bdda2c6ac2525d0d24dc54d16148a`); each ported file carries its own
attribution header naming the same sources, `patches/omo-dsh/omo-team/src/manifest.ts`
(`upstreamSources[]`, machine-readable per row) and the verbatim upstream excerpts in
`.omo/evidence/p5t1/` (Q1a/Q1b) are the per-file authority — **this table is the
index, not the authority** (Phase 4 commands precedent). The 9-file population is
exactly what c25 counts (`9 ported .ts files … over 21 files`); the other 12 are
11 DSH-native files + `manifest.ts` as INFRA (native list below the table).

| DSH file (under `patches/omo-dsh/omo-team/`) | Upstream source file(s) at `v4.19.4` | Disposition |
|---|---|---|
| src/team/member-validator.ts (P5-T4) | packages/senpi-task/src/team/member-validator.ts, packages/team-core/src/team-registry/validator.ts, packages/team-core/src/types.ts | semantic port only（11 席资格终态矩阵为全新纯函数：零 ctx / 零副作用 / 零 io / 无 zod；不可解析即具名 + 附排序可用清单 = 对齐 senpi `UNRESOLVABLE_CATEGORY` 惯例（:27-38）的**语义**而非措辞，curated 只读拒入骨架同源自 :41-47；`TeamSpecValidationError` 的 code/field/memberName 三件套形状取自 team-core validator.ts :15-25；与上游 `AGENT_ELIGIBILITY_REGISTRY`（types.ts :190-237）三值 verdict 的**全部偏差**逐条行注释点名——atlas 上游 eligible 而本仓拒 / multimodal-looker 随 v4 hard-reject 收紧 / oracle+prometheus 上游未列而本仓按 class 收紧，裁定依据 = 覆盖基线 §4（T1 终态）；roster 知识以手抄声明式表 + 测试期对账通行（`tests/omo-team/member-validator.test.ts` 对 `omo-agents/src/roster.ts` 断集合相等 + 逐位置行序相等），跨包 import 为边界纪律所禁） |
| src/team/team-spec.ts (P5-T4) | packages/omo-opencode/src/features/team-mode/tools/lifecycle-inline-spec.ts, packages/omo-opencode/src/features/team-mode/tools/lifecycle-create-tool.ts | semantic port only（inline spec 解析：string 臂 JSON.parse + normalize → safeParse → validateSpec 三段序语义对齐（:67-89）；v1 收窄为 `{name, members:[{name, category\|seat, prompt?}]}`，`seat` 为本仓新增臂、取代上游 kind+subagent_type 的指名席；上游 member/spec 级形状之外的每一枚字段（kind / subagent_type / systemPrompt / loadSkills / role / description / leadAgentId / lead / teamAllowedPaths / sessionPermission，Q1a §2.1 全集）= `V1_UNSUPPORTED_FIELD` 具名错误不静默，subagent_type 另有专属 code；个别**错误文案**逐字复用（max-8 句 validator.ts:28-34）——工具错误文本 = 契约面，纪律下有意为之，代码零抄） |
| src/team/team-state.ts (P5-T5 骨架 · P5-T8b 持久化换装) | packages/team-core/src/types.ts, packages/team-core/src/team-state-store/store.ts, packages/team-core/src/team-state-store/resume.ts | semantic port only（RuntimeState 形状以 TypeScript interface 逐字段镜像 types.ts（:121-188 + RUNTIME_STATUSES :16-24）——**不 import zod、不抄 schema 代码**，落盘字节由 vendored `validateRuntimeState` 校验（store.ts :106-116，T5 的「无 zod」差异注随换装翻正）；迁移合法性表 ALLOWED_RUNTIME_TRANSITIONS（store.ts :15-23 逐字，同态放行 + 任意态→orphaned 放行）**只留一份、执法在 vendored `transitionRuntimeState`**（:185-204），本文件同名表退为读侧词表镜像 + 工具层预检——同一张上游表的两个指针，值不手抄；resume 语义（creating 超 30min→failed / 活性全灭→orphaned / 终态目录清扫）由 vendored `resumeAllTeams`（resume.ts :16-86）承载） |
| src/tools/team-create.ts (P5-T5) | packages/omo-opencode/src/features/team-mode/tools/lifecycle-create-tool.ts, packages/omo-opencode/src/hooks/team-tool-gating/hook.ts, packages/senpi-task/src/team/spawn-members.ts, packages/senpi-task/src/team/normalize.ts, packages/team-core/src/team-registry/team-spec-input-normalizer.ts | semantic port only（工具骨架对齐：参数 union、执行序「解析→校验→嵌套闸→spawn→active」、错误冒泡形态；嵌套闸文案真实出处 = hook.ts :102-108，lead 与 member 都计 participant，`team_create denied: session is already a participant of team <id>` 逐字承载于本文件 gate；v1 收窄 inline_spec 单臂、teamName 命名 spec = 记差异（manifest team_create 行成文）；成员 briefing = senpi 5 行版（spawn-members.ts:146-157）的**语义移植**——DSH 载体措辞（注入消息 = `agent.inject` 的 durable UserMessage），非逐字，omo-opencode 的 member-guidance 版为对照面；成员 label 惯例 `team:<teamRunId>:<memberName>` 逐字承载（normalize.ts:40-42）；成员无 prompt 兜底 = normalizer :127 的固定英文句语义，不 import 上游件） |
| src/tools/team-delete.ts (P5-T7) | packages/omo-opencode/src/features/team-mode/tools/lifecycle-shutdown-tools.ts, packages/omo-opencode/src/features/team-mode/team-runtime/delete-team.ts, packages/senpi-task/src/team/runtime.ts | semantic port only（门禁词汇逐字承载：描述句 :53-58、`members still active`（:74-76）、`team cannot be deleted from '<status>'`（:81-83）——failed 连 force 都不收 = 上游事实随行；DELETABLE_MEMBER_STATUSES 三值 = 本仓 TEAM_DELETABLE_MEMBER_PHASES 同一三值（shutdown-helpers.ts:7-11 对照）；force 旁路 + 状态白名单 + 绕表直存语义 = team-state.ts forceTransitionToDeleting；**tmux/worktree 两臂 D4 不采**——fork (B) 形态执行面 = 原生 interrupt（保 inbox）+ drain；`unregisterTeamSessionsByTeam`（:190）= retireRunIndexes——tombstone 留行、参与索引撤账；senpi 侧「缺账 = 已删 no-op」幂等双删语义**不采**（runtime.ts:48-51，两套面并存的事实 Q1a NOTES 在档）——本仓对无账团队具名拒 TEAM_NOT_FOUND，差异记此） |
| src/tools/team-message.ts (P5-T6) | packages/omo-opencode/src/features/team-mode/tools/messaging.ts, packages/team-core/src/team-mailbox/send.ts | semantic port only（参数 zod 形状 :28-36 → dsh-tools raw register 面的 JSON Schema 方言逐字段对齐 + 运行时逐字段具名校验补齐 schema 表达不了的部分（correlationId uuid 形、空串→undefined preprocess）；错误族承载：`broadcast requires lead role`（send.ts :19 逐字）/ `payload exceeds 32 KB`（:26）/ `unknown or inactive team recipient: <r>`（:46-51）/ `team is deleting`（:53-58）；`duplicate message id` = **语义对齐非逐字**——上游 mailbox 抛拒，fork (B) 无 mailbox 本体（FORK.md §3.3），本仓落成正常返回的去重说明（任务书 P5-T6 钉死「不重复投递，返回去重说明」），词根保留；**mailbox 本体（预约/ack/背压/poll）不移植**——原生 inbox 替代，`.delivering-` 预约/TTL 记差异（manifest 行注）；帧 `Team message <id> from <name>:` + 经原生投递承原生 kind 'agent-message'（Q-8 B1/B3）） |
| src/tools/team-shutdown.ts (P5-T7) | packages/omo-opencode/src/features/team-mode/team-runtime/shutdown.ts, packages/omo-opencode/src/features/team-mode/tools/lifecycle-shutdown-tools.ts, packages/senpi-task/src/team/shutdown.ts | semantic port only（握手三段状态机语义对齐 shutdown.ts：request 幂等早退（:24-28）/ approve 无请求具名抛 `shutdown request missing for '<name>'` 逐字（:63-65）/ 已批幂等（:68-70）/ 成员翻 shutdown_approved 且 completed-errored 保终态（:79-86）/ reject reason 必填（上游 zod min(1) 的运行时对应）+ 同 reason 已拒幂等（:122-124）+ 成员不 interrupt = team 存活语义；权限词汇逐字（`team_shutdown_request is lead-only` :74-76、`${toolName}: caller must be target member or team lead` :101/:121，与 gating hook.ts:110-116 同一裁决的二级面）；账本三段住 team-state.ts 关停握手账，本文件是**调用方**：权限、状态闸、消息联动、返回形状；senpi 并存第二套握手面的 requester sentinel `TEAM_LEAD_SENTINEL`（:72-101 语义）沿用——lead 恒创建者会话、询问帧 from 词恒 'lead'；「resolved 旧请求永不挡新请求」由 team-state 账法承载） |
| src/tools/team-status.ts (P5-T7 · 仲裁补位 2026-10-10) | packages/omo-opencode/src/features/team-mode/tools/query.ts, packages/omo-opencode/src/hooks/team-tool-gating/hook.ts, packages/team-core/src/team-state-store/store.ts | semantic port only（描述 `"Return full status for a team run."` 逐字承载（query.ts :36-45）；参数 teamRunId 同形（min(1) 运行时补齐 = (B) 工具层同族纪律）；聚合源 = 本仓状态骨架 team-state.ts，T8b vendored store 换持久化后聚合**零改动**——聚合读的是方法面，接缝纪律同 family；UNIVERSAL 双面可用 = hook.ts:12-19 名单事实，非参与者具名拒文案逐字 `team-mode tool team_status denied: not a participant of team <id>`（:102-108 participant 臂）；deleted tombstone **可读** = store.ts loadRuntimeState 对 deleted 照样返回（deleted 是状态不是缺账——(B) 形态 tombstone 留行，「查询面不因终态失明」同一裁决；写面对 deleted 具名拒，见 team-message.ts / team-shutdown.ts 状态闸）；成员行附握手态投影，lead 不入 members 名单——lead 身份由 leadSessionId 承载，形状差异注在 team-state.ts 成员行注） |
| src/tools/team-task.ts (P5-T8b) | packages/omo-opencode/src/features/team-mode/tools/tasks.ts, packages/team-core/src/team-tasklist/store.ts, packages/team-core/src/team-tasklist/claim.ts, packages/team-core/src/team-tasklist/update.ts, packages/team-core/src/team-tasklist/dependencies.ts | semantic port only（四工具薄壳 = vendored team-tasklist 的**接线面**——上游实现是铁律，本文件只做参数校验、身份裁决与错误族冒泡，任务板语义零重写；create 落盘写死 `status:"pending"`/`blocks:[]` 随 tasks.ts:84-90 逐字；list 过滤仅 status/owner（:104-105）——**无 ready 过滤、无 ready 字段返回**（任务书钉死，上游事实）；update 的 status 枚举逐字（:122）+ `status === "claimed"` 走 claimTask 否则 updateTaskStatus（:128-130 同一岔口，本文件同一形状）；`resolveSenderName` 的 `team member not found for session <id>` 逐字承载（:61-70）；UNIVERSAL 四枚双面 + 非参与者具名拒 = 与 team_status/team_send_message 同族裁决（hook.ts:12-19/:129-146）；高水位/锁/TaskSchema.parse 全在 vendored store，薄壳不重述） |

**Deliberately NOT in this table:** the 11 DSH-native files (`index.ts`,
`boot-markers.ts`, `team/roster-seats.ts`, `team/session-context-adapter.ts`,
`team/team-config.ts`, `team/team-core-vendor.ts`, `team/team-keyword-slot.ts`,
`team/team-prompts-vendor.ts`, `team/team-row-config.ts`, `team/team-stop-continuation.ts`,
`team/team-tool-presence.ts`) carry an explicit 「无上游对应物 / DSH 原生」 declaration in
their own headers (c25's named native list — a false upstream attribution in a NOTICE is
exactly what this file exists to prevent), and `manifest.ts` is the recording face (INFRA,
row-attributed by c26). The vendored byte-side of the same feature area lives in the two
package sections above (`team-core`, `prompts-team`): a thin shell that consumes vendored
bytes (e.g. `team-task.ts`) ports the **tool layer's** semantics only and never restates
the vendored implementation.

### Phase 6 vendored package: `@oh-my-opencode/lsp-core` (OMO v4.19.4)

- **Source repository:** https://github.com/code-yeongyu/oh-my-openagent
- **Tag:** `v4.19.4`
- **Commit:** `b072d279110bdda2c6ac2525d0d24dc54d16148a`
- **Upstream path:** `packages/lsp-core`
- **License:** SUL-1.0 ([LICENSES/oh-my-openagent.LICENSE.md](LICENSES/oh-my-openagent.LICENSE.md)).
  The upstream package manifest carries no `license` field (all 19 OMO core packages
  are alike); the license is the OMO repository-root `LICENSE.md`, vendored here
  byte-for-byte (sha256 `b61ac928f152d13517328263e6bee9175b928f9ab696a2d2ca2b6cfd961ddc32`).
- **Vendored into this repository at:** [`patches/omo-dsh/vendor/lsp-core`](patches/omo-dsh/vendor/lsp-core)
  (a pnpm workspace package; the upstream package name `@oh-my-opencode/lsp-core@0.1.0` is
  kept unchanged as the provenance anchor, so the D16 name gate releases its `SUL-1.0` field).

> ⚠️ **MODIFIED COPY — prominent notice required by SUL-1.0 "Notices".**
> This project has **modified** the vendored copy of `lsp-core`. The
> modifications are declared in the package-root
> [`NOTICE.md`](patches/omo-dsh/vendor/lsp-core/NOTICE.md) and itemized,
> with per-file sha256 and reasons, in
> [`VENDOR-MANIFEST.json`](patches/omo-dsh/vendor/lsp-core/VENDOR-MANIFEST.json)
> (`deviations[]`: 1 fields-added, 1 tsconfig rewrite, 1 modern-era deviation,
> 1 wire-log seam, 1 extension-wall entry (227 specifiers across 55 files +
> 1 package-name — lsp-core's own face; the sibling `mcp-stdio-core` carries
> its own 12 across 4; 239 across 59 is the two-package total),
> 9 strip-only param-property rewrites, 3 additions, 1 tests-excluded note).
> Copyright in the upstream work remains with the original author (code-yeongyu);
> this project claims only its modifications. No commercial use or distribution
> is authorized.

**Carried surface (the (L-B) narrowed engine, FORKS.md §0-4):** all 65 upstream
non-test `.ts` sources + the single `.mjs` fixture. All 21 upstream `.test.ts`
suites are **not carried** — they are `bun:test` and this repo's runner is vitest
(the ruled exclusion, §2.6); `AGENTS.md` is not carried (package documentation).
The thin MCP server face is the project-written `src/cli.ts` (see its row), which
references the semantics of the MIT `@code-yeongyu/lsp-tools-mcp` `src/cli.ts`
(~30 lines; that package is **not vendored** — attribution only, per the ruling).

**Modern-era wire face (the ruled deviation, §2.6 ⑤):** `src/mcp.ts` answers
`server/discover` and stamps the 2026-07-28 result fields (`resultType`,
+`ttlMs`/`cacheScope` on cacheable lists) so the dsh-mcp-client SDK keeps the
MODERN era on this connection instead of silently downgrading to legacy
(`.omo/evidence/p6t1/mcp-client-probe/RESULTS.md` §1 codec evidence; live proof
`.omo/evidence/p6t4/face-probe/`).

Every file in the vendored package is listed below (decision D15 ¶2; rows are numbered
`P6-n` to keep the numbering space disjoint from the phase 1/4/5 tables). The
`Disposition` column mirrors the manifest's per-file `origin`: `verbatim` (**9**),
`已修改` → `modified` (**59**), `本项目新增` → `project-new` (**3**) —
**71 files** total, aligned one-to-one with `VENDOR-MANIFEST.json` `files[]`
(71 entries). Per-file sha256 values live in the manifest and are not
duplicated here; every `modified` entry also carries its pre-change upstream blob sha256
(R-8 two-way anchor). Drift detection is mechanical and auto-discovers this package:
`node scripts/vendor-manifest.mjs`. The mirror is pinned row-for-row by
`tests/vendor/lsp-stdio-manifest.test.ts` (gate 2).

| # | File (relative to package root) | Disposition | Notes |
|---|---|---|---|
| P6-1 | `NOTICE.md` | `本项目新增` | **Not upstream content:** the prominent "modified" notice required by SUL-1.0 (D15 ¶3, N-1) |
| P6-2 | `VENDOR-MANIFEST.json` | `本项目新增` | **Not upstream content:** source tag/commit + per-file sha256 + `deviations[]` |
| P6-3 | `package.json` | `已修改` | Added `license: "SUL-1.0"` (D15 ¶1) + `test:vitest` script (vendor-test wiring precedent); `exports` map kept **verbatim** (all seven subpaths point at existing `src/*.ts`); `dependencies` kept **verbatim** — `@oh-my-opencode/mcp-stdio-core` `workspace:*` resolves to the sibling vendored package in this workspace (unlike team-core's unresolvable edges, no narrowing needed); `scripts.typecheck` kept upstream-shape (`tsgo`) as drift reference — no `tsgo` in this repo, package not in the typecheck:libs chain (root `tsc --noEmit` compiles it via the `patches` include) |
| P6-4 | `src/cli.ts` | `本项目新增` | **Not upstream content:** the project-written thin stdio entry (P6-T4) — runs the vendored `runMcpStdioServer`, disposes the default LSP manager on exit; semantics reference the MIT `@code-yeongyu/lsp-tools-mcp` `src/cli.ts` (~30 lines; that package is NOT vendored per the (L-B) ruling — attribution-only entry, see the MIT note below) |
| P6-5 | `src/index.ts` | `已修改` | **ESM extension completion (T8b grammar):** 29 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-6 | `src/lsp/cleanup-errors.ts` | `verbatim` | — |
| P6-7 | `src/lsp/client-wrapper.ts` | `已修改` | **ESM extension completion (T8b grammar):** 8 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-8 | `src/lsp/client.ts` | `已修改` | **ESM extension completion (T8b grammar):** 7 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-9 | `src/lsp/config-loader.ts` | `已修改` | **ESM extension completion (T8b grammar):** 3 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-10 | `src/lsp/connection.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-11 | `src/lsp/constants.ts` | `verbatim` | — |
| P6-12 | `src/lsp/directory-diagnostics.ts` | `已修改` | **ESM extension completion (T8b grammar):** 9 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-13 | `src/lsp/effective-extension.ts` | `verbatim` | — |
| P6-14 | `src/lsp/errors.ts` | `已修改` | **Strip-only rewrite (T5 NOTES-6):** constructor parameter properties → declared fields + assignment at the tsc-emit position (Node 24 strip-only rejects parameter properties; measured at first load smoke); **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-15 | `src/lsp/fixtures/diagnostics-freshness-contract-probe.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-16 | `src/lsp/fixtures/workspace-edit-contract-probe.ts` | `已修改` | **ESM extension completion (T8b grammar):** 2 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-17 | `src/lsp/fixtures/workspace-edit-server.mjs` | `verbatim` | — |
| P6-18 | `src/lsp/formatters.ts` | `已修改` | **ESM extension completion (T8b grammar):** 3 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-19 | `src/lsp/infer-extension.ts` | `已修改` | **ESM extension completion (T8b grammar):** 2 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-20 | `src/lsp/json-rpc-connection.ts` | `已修改` | **Strip-only rewrite (T5 NOTES-6):** constructor parameter properties → declared fields + assignment at the tsc-emit position (Node 24 strip-only rejects parameter properties; measured at first load smoke) |
| P6-21 | `src/lsp/language-mappings.ts` | `verbatim` | — |
| P6-22 | `src/lsp/manager.ts` | `已修改` | **ESM extension completion (T8b grammar):** 5 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-23 | `src/lsp/process-signal-cleanup.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-24 | `src/lsp/process.ts` | `已修改` | **ESM extension completion (T8b grammar):** 2 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-25 | `src/lsp/server-definitions.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-26 | `src/lsp/server-install-state.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-27 | `src/lsp/server-installation.ts` | `verbatim` | — |
| P6-28 | `src/lsp/server-resolution.ts` | `已修改` | **ESM extension completion (T8b grammar):** 4 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-29 | `src/lsp/startup-failure.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-30 | `src/lsp/transport-protocol.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-31 | `src/lsp/transport.ts` | `已修改` | **Strip-only rewrite (T5 NOTES-6):** constructor parameter properties → declared fields + assignment at the tsc-emit position (Node 24 strip-only rejects parameter properties; measured at first load smoke); **ESM extension completion (T8b grammar):** 9 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-32 | `src/lsp/types.ts` | `verbatim` | — |
| P6-33 | `src/lsp/utils.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-34 | `src/lsp/workspace-apply-edit-failure.ts` | `verbatim` | — |
| P6-35 | `src/lsp/workspace-apply-edit-test-support.ts` | `已修改` | **ESM extension completion (T8b grammar):** 5 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-36 | `src/lsp/workspace-document-state.ts` | `已修改` | **Strip-only rewrite (T5 NOTES-6):** constructor parameter properties → declared fields + assignment at the tsc-emit position (Node 24 strip-only rejects parameter properties; measured at first load smoke); **ESM extension completion (T8b grammar):** 4 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-37 | `src/lsp/workspace-edit-commit.ts` | `已修改` | **ESM extension completion (T8b grammar):** 2 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-38 | `src/lsp/workspace-edit-contract-evidence.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-39 | `src/lsp/workspace-edit-fingerprint.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-40 | `src/lsp/workspace-edit-parse-helpers.ts` | `已修改` | **ESM extension completion (T8b grammar):** 2 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-41 | `src/lsp/workspace-edit-parser.ts` | `已修改` | **ESM extension completion (T8b grammar):** 6 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-42 | `src/lsp/workspace-edit-path.ts` | `已修改` | **Strip-only rewrite (T5 NOTES-6):** constructor parameter properties → declared fields + assignment at the tsc-emit position (Node 24 strip-only rejects parameter properties; measured at first load smoke); **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-43 | `src/lsp/workspace-edit-plan-types.ts` | `已修改` | **ESM extension completion (T8b grammar):** 2 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-44 | `src/lsp/workspace-edit-plan.ts` | `已修改` | **ESM extension completion (T8b grammar):** 8 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-45 | `src/lsp/workspace-edit-resource-parser.ts` | `已修改` | **ESM extension completion (T8b grammar):** 4 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-46 | `src/lsp/workspace-edit-simulation.ts` | `已修改` | **ESM extension completion (T8b grammar):** 4 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-47 | `src/lsp/workspace-edit-snapshot.ts` | `已修改` | **Strip-only rewrite (T5 NOTES-6):** constructor parameter properties → declared fields + assignment at the tsc-emit position (Node 24 strip-only rejects parameter properties; measured at first load smoke); **ESM extension completion (T8b grammar):** 3 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-48 | `src/lsp/workspace-edit-text.ts` | `已修改` | **ESM extension completion (T8b grammar):** 2 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-49 | `src/lsp/workspace-edit-types.ts` | `已修改` | **Strip-only rewrite (T5 NOTES-6):** constructor parameter properties → declared fields + assignment at the tsc-emit position (Node 24 strip-only rejects parameter properties; measured at first load smoke); **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-50 | `src/lsp/workspace-edit.ts` | `已修改` | **ESM extension completion (T8b grammar):** 8 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-51 | `src/lsp/workspace-mutation-controller.ts` | `已修改` | **Strip-only rewrite (T5 NOTES-6):** constructor parameter properties → declared fields + assignment at the tsc-emit position (Node 24 strip-only rejects parameter properties; measured at first load smoke); **ESM extension completion (T8b grammar):** 6 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-52 | `src/mcp.ts` | `已修改` | **Modern-era deviation (P6-T4, FORKS.md §2.6 ⑤):** answers `server/discover` with the 2026-07-28 advertisement, tracks the negotiated era per process (sibling saw `server/discover`; session infers from the per-request `_meta` envelope), stamps `resultType` (+`ttlMs: 0` + `cacheScope: "private"` — the honest no-cache values, the SDK's own defaults) on cacheable results; `initialize` echo semantics kept upstream-verbatim; env-gated `LSP_MCP_WIRE_LOG` diagnostic seam (unset = zero behaviour change); **extension wall rode along:** 2 specifiers + the 1 package-name rewrite |
| P6-53 | `src/missing-dependency-result.ts` | `已修改` | **ESM extension completion (T8b grammar):** 4 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-54 | `src/post-edit/index.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-55 | `src/post-edit/orchestration.ts` | `verbatim` | — |
| P6-56 | `src/request-context.ts` | `已修改` | **Strip-only rewrite (T5 NOTES-6):** constructor parameter properties → declared fields + assignment at the tsc-emit position (Node 24 strip-only rejects parameter properties; measured at first load smoke) |
| P6-57 | `src/tools.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-58 | `src/tools/definitions.ts` | `已修改` | **ESM extension completion (T8b grammar):** 8 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-59 | `src/tools/diagnostics.ts` | `已修改` | **ESM extension completion (T8b grammar):** 10 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-60 | `src/tools/index.ts` | `已修改` | **ESM extension completion (T8b grammar):** 10 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-61 | `src/tools/install-decision.ts` | `已修改` | **ESM extension completion (T8b grammar):** 5 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-62 | `src/tools/navigation.ts` | `已修改` | **ESM extension completion (T8b grammar):** 7 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-63 | `src/tools/parameters.ts` | `已修改` | **ESM extension completion (T8b grammar):** 2 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-64 | `src/tools/rename.ts` | `已修改` | **ESM extension completion (T8b grammar):** 6 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-65 | `src/tools/result.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-66 | `src/tools/runtime.ts` | `已修改` | **ESM extension completion (T8b grammar):** 3 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-67 | `src/tools/schema.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-68 | `src/tools/status.ts` | `已修改` | **ESM extension completion (T8b grammar):** 4 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-69 | `src/tools/symbols.ts` | `已修改` | **ESM extension completion (T8b grammar):** 8 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-70 | `src/tools/types.ts` | `已修改` | **ESM extension completion (T8b grammar):** 2 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6-71 | `tsconfig.json` | `已修改` | Rewritten to the `ES2022` + `node` shape extending the repo root tsconfig (upstream is bun-shaped: `bun-types` + DOM + the strictest flags; M-2 precedent, hashline-core/team-core) |

**Totals:** 9 `verbatim` + 59 `已修改` + 3 `本项目新增` = **71 files**
= 65 upstream implementation `.ts` files + 1 `.mjs` fixture + `src/cli.ts` (project-new stdio face)
+ 3 package-root files (`package.json`, `tsconfig.json`, `NOTICE.md`) + `VENDOR-MANIFEST.json`;
zero carried tests (the 21 upstream `bun:test` suites are excluded per §2.6).

### Phase 6 vendored package: `@oh-my-opencode/mcp-stdio-core` (OMO v4.19.4)

- **Source repository:** https://github.com/code-yeongyu/oh-my-openagent
- **Tag:** `v4.19.4`
- **Commit:** `b072d279110bdda2c6ac2525d0d24dc54d16148a`
- **Upstream path:** `packages/mcp-stdio-core`
- **License:** SUL-1.0 ([LICENSES/oh-my-openagent.LICENSE.md](LICENSES/oh-my-openagent.LICENSE.md)).
  The upstream package manifest carries no `license` field; the license is the OMO
  repository-root `LICENSE.md` (same byte-verified copy as above).
- **Vendored into this repository at:** [`patches/omo-dsh/vendor/mcp-stdio-core`](patches/omo-dsh/vendor/mcp-stdio-core)
  (a pnpm workspace package; the upstream package name `@oh-my-opencode/mcp-stdio-core@0.1.0`
  is kept unchanged as the provenance anchor, so the D16 name gate releases its `SUL-1.0`
  field — and the vendored `lsp-core`'s verbatim `workspace:*` edge resolves to it).

> ⚠️ **MODIFIED COPY — prominent notice required by SUL-1.0 "Notices".**
> This project has **modified** the vendored copy of `mcp-stdio-core`. The
> modifications are declared in the package-root
> [`NOTICE.md`](patches/omo-dsh/vendor/mcp-stdio-core/NOTICE.md) and itemized,
> with per-file sha256 and reasons, in
> [`VENDOR-MANIFEST.json`](patches/omo-dsh/vendor/mcp-stdio-core/VENDOR-MANIFEST.json)
> (`deviations[]`: 1 fields-added, 1 tsconfig rewrite, 1 extension-wall entry
> (12 specifiers), 2 additions, 1 test-excluded note).
> Copyright in the upstream work remains with the original author (code-yeongyu);
> this project claims only its modifications. No commercial use or distribution
> is authorized.

**Tests — carried vs not (measured 2026-10-13):** `src/transport.test.ts` is
**carried** with semantics unmodified (bun:test surface `describe/expect/test` only, green 4/4
through the shim S-1 alias; the file bytes carry only the extension-wall completion);
`src/server.test.ts` is **not carried** — it imports
`jest` from `bun:test` and drives fake timers (`jest.useFakeTimers()` etc.,
upstream L107–L258); vitest exports no `jest`, so shim S-1 cannot carry it — the
same measured rationale that excluded team-core's `resume.test.ts` (`mock`).
`AGENTS.md` is not carried (package documentation).

Every file in the vendored package is listed below (decision D15 ¶2; rows are
numbered `P6S-n` — the `S` keeps the two Phase 6 tables' numbering spaces disjoint).
The `Disposition` column mirrors the manifest's per-file `origin`: `verbatim`
(**3**), `已修改` → `modified` (**6**),
`本项目新增` → `project-new` (**2**) — **11 files** total, aligned
one-to-one with `VENDOR-MANIFEST.json` `files[]` (11 entries). Drift detection:
`node scripts/vendor-manifest.mjs`. The mirror is pinned row-for-row by
`tests/vendor/lsp-stdio-manifest.test.ts` (gate 2).

| # | File (relative to package root) | Disposition | Notes |
|---|---|---|---|
| P6S-1 | `NOTICE.md` | `本项目新增` | **Not upstream content:** the prominent "modified" notice required by SUL-1.0 (D15 ¶3, N-1) |
| P6S-2 | `VENDOR-MANIFEST.json` | `本项目新增` | **Not upstream content:** source tag/commit + per-file sha256 + `deviations[]` |
| P6S-3 | `package.json` | `已修改` | Added `license: "SUL-1.0"` (D15 ¶1) + `test:vitest` script; `exports` map kept verbatim; `devDependencies.bun-types` kept upstream-verbatim (unused by the vendored node-shaped tsconfig — registered in the tsconfig deviation) |
| P6S-4 | `src/index.ts` | `已修改` | **ESM extension completion (T8b grammar):** 5 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6S-5 | `src/record.ts` | `verbatim` | — |
| P6S-6 | `src/responses.ts` | `已修改` | **ESM extension completion (T8b grammar):** 1 relative `.js` specifier completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6S-7 | `src/server.ts` | `已修改` | **ESM extension completion (T8b grammar):** 5 relative `.js` specifiers completed to `.ts` — semantically zero-change, machine-proven (`.omo/evidence/p6t4/vendor-import-wall/prove-extension-wall.mjs`) |
| P6S-8 | `src/transport.test.ts` | `已修改` | **Carried test (semantics unmodified):** bun:test surface `describe/expect/test` only — unchanged through the shim S-1 alias, measured green 4/4 under vitest (2026-10-13); **extension wall rode along:** 1 specifier (so the origin is `modified`, not `verbatim`) |
| P6S-9 | `src/transport.ts` | `verbatim` | — |
| P6S-10 | `src/types.ts` | `verbatim` | — |
| P6S-11 | `tsconfig.json` | `已修改` | Rewritten to the `ES2022` + `node` shape extending the repo root tsconfig (upstream bun-shaped `bun-types` + DOM; M-2 precedent) |

**Totals:** 3 `verbatim` + 6 `已修改` + 2 `本项目新增` = **11 files**
= 6 upstream implementation `.ts` files + 1 carried upstream test + 3 package-root files
(`package.json`, `tsconfig.json`, `NOTICE.md`) + `VENDOR-MANIFEST.json`.

**MIT reference — `@code-yeongyu/lsp-tools-mcp` (no files vendored):** the
project-written `patches/omo-dsh/vendor/lsp-core/src/cli.ts` references the
semantics of that MIT package's `src/cli.ts` (~30 lines: run the MCP stdio server,
dispose the default LSP manager on exit). Per the (L-B) ruling (FORKS.md §0-6) the
package is NOT vendored — no license file is copied; this paragraph is the
attribution. Copyright of the referenced semantics remains with code-yeongyu (MIT).

### Phase 6 license paths: MIT and SUL are two different doors, not one

The `checked=66` this phase ends on is reached through **two independent allow paths** in
`scripts/verify-licenses.mjs`, and conflating them hides what each unit actually rests on.
They are listed separately here, each with the predicate that decides it.

**Path A — `SUL-1.0`, gated by package name.** `tokenAllowed` grants `SUL-1.0` **only** when
`SUL_ALLOWED_NAME` matches the package name (`scripts/verify-licenses.mjs:97`, applied at that
function's SUL branch). Riding this path: the six vendored `@oh-my-opencode/*` packages —
hashline-core, lsp-core, mcp-stdio-core, prompts-team, shared-skills, team-core. This is the
only way in for them: upstream ships no `license` field at all, so the field had to be added
(D15 ¶1) **and** the name gate had to be extended to this scope (D16); the first without the
second still scores a violation.

**Path B — the `MIT` token, name-blind.** `UNIVERSAL_WHITELIST` grants plain `MIT` without
looking at the name (`scripts/verify-licenses.mjs:71`, consulted before the SUL branch). Riding
this path: the two e2e fixture workspaces, `@oh-my-opendsh/fixture-lsp-double-project` and
`@oh-my-opendsh/fixture-ast-grep-project`, each declaring `MIT OR SUL-1.0`. Their names do
**not** satisfy `SUL_ALLOWED_NAME`, so the `SUL-1.0` alternative inside that expression is inert
— measured against the exported predicate, `exprAllowed('SUL-1.0',
'@oh-my-opendsh/fixture-lsp-double-project')` is `false`, while the same name with
`MIT OR SUL-1.0` is `true`. The `MIT OR` half is therefore load-bearing rather than decorative:
it is what these two units actually stand on, and dropping it would turn both into violations.

One accuracy note, because the upstream **author** and an upstream **package scope** are
different things and have been read as one: `code-yeongyu` is the author handle, appearing
throughout this file as the copyright holder of `oh-my-openagent`; there is **no
`@code-yeongyu/*` package** in this repository — `grep -c code-yeongyu pnpm-lock.yaml` returns
0. Path B is carried by the two fixture workspaces and by ordinary MIT-licensed dependencies,
not by a scope of that name.

The count, every step accounted for: **61** at the Phase 6 baseline (task book PRE-2) →
**64** at P6-T4 (+3: `vendor/lsp-core`, `vendor/mcp-stdio-core`, and `bun-types@1.3.12`,
which arrives as a devDependency of the vendored `mcp-stdio-core`
(`patches/omo-dsh/vendor/mcp-stdio-core/package.json:41`) and enters the lockfile in that same
commit — easy to miss, because it is not a vendored directory) → **65** at the P6-T5+T6 commit
(+1: `tests/e2e/fixtures/lsp-double-project/package.json`) → **66** at P6-T7 (+1:
`tests/e2e/fixtures/ast-grep-fixture-project/package.json`), re-verified by
`scripts/verify-licenses.sh` at the close of this phase.

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
