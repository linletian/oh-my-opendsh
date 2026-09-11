# oh-my-openagent v4.19.4 vs v5.0.0-beta.53 调查报告：架构与战略变化

- 仓库：`/home/linletian/GithubRepo/oh-my-openagent/`（全程只读 git：`git show/ls-tree/diff/grep`，工作树未动）
- v4.19.4 = `b072d2791`（2026-08-01，v4 线最后一个 release）
- v5.0.0-beta.53 = `7918f2449`（2026-09-11，v5.0 beta 最新）；beta.1 = `13db09a1a`（2026-08-10）
- 总 diff：6457 文件，+727k/-89k
- 姊妹报告（Agent 体系与 Team Mode）：[`omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md`](./omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md)

## 1. omo-ai / omo-native / senpi 是什么

- **senpi = code-yeongyu 自有的 harness 引擎，是 badlogic/pi-mono（Mario Zechner 的 pi-coding-agent）的 fork**，独立发布为 npm 包 `@code-yeongyu/senpi`（beta.53 pin 在 `2026.9.10-2`，仓库 code-yeongyu/senpi）。证据：`packages/omo-senpi/changes.md` 记 "`badlogic/pi-mono` main@`59a71b23` sync"；`packages/omo-senpi/AGENTS.md` 外化 `@earendil-works/pi-*`、`@mariozechner/pi-*`；QA 脚本自述 "senpi is a pi harness"；遗留 env 前缀 `PI_*`/`SENPI_*`；存在分支 `code-yeongyu/omo-pi-senpi-fork`。
- **omo-ai = senpi-native edition 的 npm 包**（仅 beta channel：`npm i -g omo-ai@beta`；裸装 ETARGET by design，`latest` 永远钉在被 deprecate 的占位 `0.0.0-beta.0`）。单 bin `omo`，launcher spawn pinned senpi + `--extension <pkgRoot>/plugin`（plugin/ 是 omo-senpi 构建产物），并注入 `SENPI_BRAND`（name=OmO、家目录 `~/.omo/agent`、env 前缀 `OMO_*`、UA=omo、update 走 omo-ai@beta）。证据：`docs/reference/omo-ai-publishing.md`。
- **packages/omo-native = omo-ai 的分发包**（launcher、doctor、`omo setup` 从其他 harness 导入凭证、bun 运行时自动选择 bun>=1.4.0、信号转发等）。package.json name 就是 `omo-ai`。
- **三条产品线定位**（README v5）：Ultimate=OpenCode 插件（npm `oh-my-opencode`/`oh-my-openagent`，全功能）；Light=Codex CLI 插件（npm `lazycodex-ai`，可移植子集）；Senpi Edition=standalone `omo` 命令（`omo-ai@beta`）。**上游确实在从「opencode 插件」转向「自有 harness」**：ROADMAP.md "Why Not OpenCode-Native" 明确说 opencode 插件 API 会破坏主 agent loop，"We treat OpenCode as one adapter target among several. Not the center of the architecture"；包分层重构（Core 19 个纯 TS 包 → MCP → Adapters(opencode/codex/senpi/pi-*) → Platform）就是为此服务。
- 注意：omo-senpi/omo-codex/senpi-task/pi-goal/pi-webfetch 在 v4.19.4 已存在；v5 新增包只有 `omo-native`、`memory-core`、`ast-grep-mcp`。

## 2. 统一配置 omo.jsonc

**重要修正：统一配置不是 v5 新增的——v4.19.3 已落地**（v4.19.2 的 configuration.md 还是 oh-my-openagent.json 链，v4.19.3 起改为 omo.jsonc + 迁移引擎）。所以对 v4.19.4 用户这不是 breaking。

结构（`docs/reference/omo-json.md` @beta.53）：

- 文件层：`~/.omo/omo.jsonc`（user，最低优先级）+ 从 cwd 向上走到 $HOME 的 `.omo/omo.jsonc`（最近的赢）。JSONC（注释/尾逗号），strict schema + unknown-keys diagnostic。
- 视图解析（VSCode 式，后者覆盖前者）：shared base keys → `[harness]` block（`[opencode]`/`[senpi]`/`[codex]`）→ `profiles.<name>` → `profiles.<name>.[harness]`。`[opencode]` 是 freeform（装全部插件配置），`[senpi]`/`[codex]` 是 typed。
- profile 激活：`OMO_PROFILE` > `OCX_PROFILE` > `OPENCODE_CONFIG_DIR` 尾部。无默认 profile。
- `models` 共享 catalog：短名 → `{model, reasoning?}`，agent/category 的 model 字符串匹配即展开；`2026-08-reasoning-unification` 迁移把 `variant`/`reasoningEffort`/`fallback_models`/`thinking`/`textVerbosity`/`maxTokens` 归一到 `reasoning`/`models`/`provider_options`，model 串支持 `:level` 后缀（该迁移在 v4.19.4 已存在）。
- 迁移引擎：lock+journal、no-clobber、`_migrations` 标记、源文件移入 `~/.omo/migration-backup-<UTC>-opencode-config/`；触发点=opencode/senpi/codex 启动 + install + `oh-my-openagent config migrate`。
- **v5 相对 v4.19.4 的配置新增**：`model_profiles`/`model_profile`（senpi 主会话模型链，内置 capable/simple-work/deep-work，session 级不落盘）；typed `memory`（记忆子系统，默认 ON）、`telemetry`（senpi，默认 ON）、`git_master`；`task.dag` 等 task 引擎键。安全不变量：`mcp_env_allowlist` 和 playwright args 只认 user 层。

## 3. Breaking changes（v4.19.4→v5.0.0-beta.53 区间真实发生的）

注意：origin/dev 的 CHANGELOG.md 停在 [4.14.0]，"Unreleased" 节累积了 4.15 之后的一切，需甄别。逐条核实结果：

1. **`omo` bin 改名 `omo-agent-toolkit`**（已核实 root package.json bin diff：v4 有 `omo`，v5 换成 `omo-agent-toolkit`）。npm 升级自动剪掉旧 bin；Codex wrapper 下次启动自动删。`omo` 名字保留给 omo-ai。
2. **start-work → ulw-execute 硬切换**（无 alias）：slash command、shared skill、hook 目录、`start_work` config key → `ulw_execute`（旧 key 一个 release 可读+deprecation 警告）、flag `omo-senpi-start-work-continuation-disabled` → `omo-senpi-ulw-execute-continuation-disabled`、telemetry `skill_loaded` 值 `start-work`→`ulw-execute`。已核实 hooks/skills/commands 三处 rename。
3. **CodeGraph 整体删除**（commit e5ab78a2d，2026-09-02，首个包含 tag = beta.35）：opencode 内置 MCP + session-start bootstrap hook、codex component、shared config block 全部移除，非 deprecation；遗留 `codegraph` 配置键按 unknown key 忽略。注意 CHANGELOG 里 "CodeGraph upgraded to 1.5.0" 是 beta 早期写的、后被删除，**以「已移除」为准**。
4. **senpi curated agents 改名**：`metis`→`plan-consultant`、`momus`→`plan-reviewer`（beta.51 起旧 id alias 一个 release 后删除）；telemetry `delegation_started.name`/`delegation_completed.agent_type` 值变更；frontmatter `review.momus`→`review.plan_reviewer`。opencode 侧的 sisyphus/atlas/prometheus/oracle/metis/momus 等 agents **未改名**（src/agents 目录两版本一致）。
5. **Memorian → Kibitzer** 改名（memory recall judge）：entry type `omo-memorian:*` → `omo-kibitzer:*`（legacy 仍可渲染）。
6. 以下两条 changelog 列为 breaking 但**在 v4.19.4 之前已落地**，对 v4.19.4 基线不算新 breaking：`shared/<name>` skill 前缀移除（PR #6180，2026-07-17 合入，已在 v4.19.4）；omo.jsonc 统一 + reasoning 归一（v4.19.3 落地）。从 ≤v4.19.2 升级则算。
7. 混版本注意：strict schema，旧版 omo-config-core 读含 `models`/`profiles`/harness blocks 的新 omo.jsonc 会 validation 失败；降级需从 migration-backup 恢复旧文件。

## 4. 能力面变化

- **OpenCode hooks**（`packages/omo-opencode/src/hooks/`）：100 → 99 个条目；净变化 = 删 `codegraph-bootstrap`、`start-work`→`ulw-execute` 改名；其余名字不变（diff 192 files, +5758/-3547 主要是内部演进）。sisyphus/atlas/team-mode/hashline/ralph-loop/goal 等 hook 均在。
- **omo-senpi components**：12 → 26。新增：agent-home、ast-grep、builtin-mcps、formatter、git-master、init-deep-advisor、**memory**、model-profile、native-badge、onboarding、post-mutation、skill-pointers、thread（未装配）、todo-fanout-reminder、ulw-execute-continuation（rename）、x-search；删 codegraph。注册顺序见 `src/extension/component-list.ts`（AGENTS.md 列出 20 个 live components）。
- **MCP 清单**：v4 opencode = websearch/context7/grep_app/lsp/**codegraph** → v5 = websearch/context7/grep_app/lsp（codegraph 移除）。senpi 侧：`builtin-mcps` 注册 context7+grep_app（http, lazy）；`ast-grep` 组件注册 stdio MCP；lsp 走 direct tools 不封装 MCP；senpi 自带 websearch/webfetch 故无 websearch MCP。**ast-grep-mcp 回归已核实**：v4.5–v4.10 存在、v4.15 前消失、2026-08-03 由 c930964d4 重新 scaffold（`@oh-my-opencode/ast-grep-mcp`，bin `omo-ast-grep`）。**memory-core 是 engine 包而非 MCP server**（但 senpi plugin bundle 里有 memory MCP 构建产物）。
- **skills**：shared-skills 17→17（仅 start-work→ulw-execute；内容增强：debugging 加 DAP/frida、frontend 加 design/ambience/stylegallery refs、data-scientist references 重写、ultimate-browsing 加 surrogate engine）。senpi-native skills 5→10：新增 dag-library、init-deep、mass-ulw、onboarding、ulw-plan（另有条件加载的 x-search）。
- **slash commands**：opencode builtin 7 个，唯一变化 start-work→ulw-execute（goal/refactor/ulw-execute/stop-continuation/handoff/remove-ai-slops/hyperplan）；新增 `/btw` `/side` 侧问 feature（`src/features/btw-side/`）。senpi memory 带来 13 个新命令：/memory /memfs /remember /init /doctor /recompile /memory-repository /sleeptime /reflect /dream /search /people /facts，外加 task 组件的 /tasks /task-kill。

## 5. memory-core 是什么

**是。v5 新增的 Letta-Code 风格持久 agent 记忆系统**，默认开启（`memory.enabled` 默认 true）。

- 架构两层：`packages/memory-core` = harness-neutral engine（明确对标 letta-code@a75f4d93e 的本地能力矩阵，独立重实现、未抄源码；`src/harness-neutrality.test.ts` 强制零 harness import）。子模块：git（命令边界/commit/merge/worktree）、memfs（markdown+frontmatter 校验）、tools、locks（跨进程锁）、journal（transcript cursor）、facts、people（人物卡）、soul、reflection（状态机）、compile、search、sync（远程镜像+密钥脱敏）、seeds。适配层在 `packages/omo-senpi/src/components/memory/`（约 200+ 文件）。
- 核心机制：git-backed markdown "MemFS" 仓库在 `~/.omo/memory/agents/<id>/`（`OMO_MEMORY_HOME` 可覆盖）；`memory` + `memory_apply_patch` 两个工具（letta 精确语义，`memory-write` 锁 + clean-check → commit）；`before_agent_start` 注入 compiled memory block（sentinel 分隔、按 (template,HEAD) 缓存、只编译已提交内容）；背景 reflection/"dreaming"：`agent_settled` 触发 detached `senpi -p` 子进程在 git worktree 里跑，完成记录持久化、以非模型可见 entry 交付；facts pipeline（durable queue+cursor watermark，`record_fact`）；Kibitzer recall judge（tool_call 触发、quick 模型 in-process child、nudge-only）；palace/ = 自包含 HTML 记忆查看器（0600/0700 权限、机器门禁）；worker/ = detached reflection/dream 子进程执行层（supervisor、硬 deadline、进程组 kill、completion ledger）。
- 声明的 divergences：无 Letta Cloud 行、不执行 mods/、无 arena/channels、本地 search 纯文本（lexical）、reflection sandbox 默认 auto（letta 是 fail-closed required 可选）。

## 6. 版本节奏

- beta.1(2026-08-10) → beta.53(2026-09-11)：33 天 53 个 tag ≈ 每天 1.6 个。策略：单 dev 主干线性推进（v4.19.4 是 beta.53 的祖先）+ `/publish <semver>` 手动 dispatch publish.yml + npm dist-tag `beta` 承载 channel 语义 + GitHub release 总是 full release、Latest badge 按最高 semver 计算；有 release-lane 分支（release-lane/v5.0.0-beta.25）和 hotfix 回滚先例（hotfix/beta40-rollback-to-beta36）。典型「主干高频 beta + 即时回滚」的 solo-maintainer 快速迭代模式。
- **v4 线已停维护**：v4.19.4(2026-08-01) 是最后一个 4.x tag，之后无任何 4.x tag；`release/v4.19.x-source-state` 只是发布存档分支；`release/4.17.1-corrections` 最后提交 2026-07-13。无活跃 4.x 维护分支。

## 7. 核心包的 npm 发布形态（决定 O1 的关键事实）

- 19 个 harness-neutral core 包在两版中全部 `"private": true`（例：`packages/team-core/package.json`，两版均 version 0.1.0、private、不发布）。
- npm registry 上 `@oh-my-opencode/team-core` / `delegate-core` / `hashline-core` / `rules-engine` / `omo-config-core` / `memory-core` 全部 404（2026-09-11 实测）。
- 发布的 `oh-my-opencode` npm 包只导出打包后的 `dist/index.js`（exports 仅 `.` / `./server` / `./tui` / `./schema.json`），core 包被 bundle 进 dist，仅个别 `package.json`（lsp-core 等）随包附带。
- **结论：本项目 O1 设想的「npm import 19 个 core 包」在 npm 语义下不存在平滑升级流**；现实的代码引进路径是 git vendor（SUL-1.0 允许带署名复制）或深抠发布包 bundle。该事实已由 D14 吸收（见 `decisions.md`）。

## 8. 对 oh-my-opendsh 移植的要点提示

1. 配置范式已从「per-harness 文件」定型为「单 omo.jsonc + harness blocks + profiles + models catalog」，且 v4.19.3 起就稳定——移植应以 omo.jsonc schema 为准而非旧 oh-my-openagent.json。
2. v5 的战略重心是 senpi（自有 pi fork）+ memory 系统；opencode adapter 仍在维护但被定位为「target 之一」。能力移植时建议对标 core 层包（team-core/delegate-core/memory-core/hashline-core/boulder-state 等 harness-neutral 包）而非 opencode 适配层。
3. 命名锚点：ulw-execute（非 start-work）、plan-consultant/plan-reviewer（senpi 侧）、Kibitzer、omo-agent-toolkit。telemetry 事件字段有 breaking 变更。
4. codegraph 已死，不要移植；ast-grep-mcp 是活的方向。

未完全核实点（影响小）：`2026-08-reasoning-unification` 迁移精确落地在 v4.19.3 还是 v4.19.4（v4.19.3 的 config-migration 目录未见该子目录，可能 v4.19.4 才加）；telemetry 字段除 changelog 所述外未逐字段 diff。
