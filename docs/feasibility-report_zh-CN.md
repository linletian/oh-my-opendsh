# 可行性报告：基于 deepseek-harness (DSH) 移植 oh-my-openagent (OMO) 的工程化与可持续 patch 框架

> 中文翻译；主报告（英文）见 [Feasibility Report (English)](./feasibility-report.md). 项目决策（中文）见 [决策记录](./decisions_zh-CN.md). 项目 README（中文）见 [README_zh-CN.md](../README_zh-CN.md).
>
> 仓库证据快照：
> - **DSH** `<DSH_REPO>/` v0.1.0-rc.5, MIT
> - **OMO** `<OMO_REPO>/` (HEAD 截屏, 实际仓库拼写为 `oh-my-openagent`，用户在指令中写成了 `oh-my-openagennt`)，SUL-1.0
> - **新工作区** `./`（已创建，空目录）

---

## 设计原则

本项目所有设计决策都遵循以下两条原则，二者优先级同等，缺一不可：

### 1. 充分利用 DSH 框架的灵活优势做事

DSH 是一个以 Cordis 插件树 + 双面构建（host + client）+ 显式扩展点（`agent/*` / `tools/*` / `ctx.goals` / `ctx.shell` / `ctx.fs` / `ctx.skill` / `ctx.jobs` / `ctx.subagent` / `ctx.terminals` / `ctx.plan` / `ctx.compaction` / `ctx.todo` / `ConversationNodeDefinition`）为核心的现代 harness 框架。

- **优先用 DSH 原生能力** 解决 OMO 需求，**不重复造轮子** —— 例如 OMO 的 `/goal` 直接复用 `dsh-goal`、OMO 的 Team Mode 直接复用 `dsh-subagent-*`、OMO 的 pre-compact 直接复用 `dsh-compaction-*`
- **优先走 DSH 官方扩展路径**（cookbook 的 4 种 plugin 形态 + 官方 scratch plugin 模式）—— 不 fork DSH、不改 DSH 仓库、不在 DSH 已有的 row id 上动手脚
- **优先用 DSH 客户端能力做可视化**（web ChatNode via `ConversationNodeDefinition`）—— 而不是外挂 tmux
- **优先用 DSH 自身的 CI 工具链**（vitest / verify-licenses / cordis-catalog 检查）—— 不另起一套

### 2. 完整引入 OMO 的 harness 设计哲学，尊重 OMO 开源 License

OMO 是一个经过一年多实战检验的高质量 harness，其设计哲学（11 agent 编排 / 54+ lifecycle hook / 多 provider LLM 路由 / Team Mode 并行协作 / ultrawork 持续驱动 / hashline edit / etc.）是项目的核心价值。

- **完整保留 OMO 的能力体系** —— 不做能力裁剪，11 agent + 30+ hook + 5 MCP + Team Mode + hashline + 一切 slash command 全量移植
- **直接 import OMO 源码**（不重新实现）—— 让 OMO 上游的优化和 bug fix 自然流入；同时**升级成本最低**（1 小时内完成一次 OMO bump）
- **完整尊重 OMO 的 SUL-1.0 开源 License** —— 框架 dual license (MIT OR SUL-1.0)；`LICENSES/` 原样放 OMO LICENSE 文本；`THIRD_PARTY_NOTICES.md` 完整 attribution；README 顶部显式致谢
- **不向 OMO 提 PR**（避免其"反对过度抽象"的维护哲学冲突）—— 作为 OMO 用户而非贡献者身份存在
- **不做销售**（满足 SUL-1.0 的"非商业"要求）—— 内部使用 + 开源 = 完整合规

### 原则的边界

| 情况 | 行为 |
|---|---|
| DSH 原生能力能完整覆盖 OMO 某能力 | **不翻译 OMO 实现**，直接用 DSH（例：goal / compaction / todo / ralph）|
| DSH 缺 OMO 某能力的关键特性 | 写 **DSH 风格** 的扩展（例：`ConversationNodeDefinition` for team 可视化）|
| DSH 概念与 OMO 概念有差异 | 写 **薄 listener 翻译层** 桥接，**不** 在 DSH 上"硬塞" OMO 设计（例：listener 翻译 DSH event → OMO hook call）|
| OMO 上游 license 变更 | 立刻触发 `scripts/verify-licenses.sh` fail，**不绕过**|
| OMO 上游哲学变更（如"反对 listener 抽象"）| 在 `docs/upgrade-playbook.md` 记录，**不强行保留抽象层**（按 OMO 哲学调整适配器）|

---

## Summary

**目标**：把 OMO 的能力体系（11 agent、54+ hook、LSP/AST-grep/codegraph MCP、`/goal`、`/ultrawork`、Team Mode、hashline edit、Rules Injection 等）以 DSH 官方 scratch plugin 形式（`dsh --patch` overlay）接到 DSH 框架之上，并搭一个能让 OMO 升级时 1 小时内完成 rebase 的 patch 工程。

**核心结论（先看这四条）**：
1. **可行性：高。** DSH 的扩展面（`agent/*`、`tools/*`、`ctx.goals`、`ctx.shell`、`ctx.fs`、`ctx.skill`、`ctx.jobs`、`ctx.subagent`、`ctx.terminals`、`ctx.plan`、`ctx.compaction`、`ctx.todo`）几乎一一对应 OMO 的 11 大能力。OMO 的 ROADMAP 已经把它拆成 19 个 harness-agnostic 核心包，恰好可被 DSH 直接吃下，无需重写。DSH 自己的 `dsh-base` bundle 已经内置了 `goal/plan/skill/compaction/ralph/workflow/todo/subagent/web-search` —— 这意味着 OMO 的 60% 能力**在 DSH 里早就有等价原生实现**，移植主要工作在"做对映射和命名"，不是"做新实现"。
2. **可持续 patch 框架：可行，且 DSH 体系天然契合。** DSH cookbook 列了 4 种官方插件形态（tool / hook / UI / protocol-driver），加上 DSH 官方推荐的 `dsh --patch ./scratch-plugin/cordis.yml` scratch plugin 模式，**DSH 零修改**就能加载我们的 OMO 适配器。OMO 通过 npm 依赖直接 import，升级流程 = `pnpm update oh-my-opencode` + `pnpm test`（5 分钟脚本 + 0–1 小时修 listener）。
3. **不是"替换 OMO"，是"做 OMO 的 DSH 适配器"。** OMO 已经在 ROADMAP 里把多 harness 适配器化（已有 `omo-opencode`、`omo-codex`、`omo-senpi`），因此"再加一个 DSH 适配器"是 OMO 官方允诺的扩展路径，与 OMO 维护者哲学一致。
4. **有一个硬约束已处理：OMO 的 SUL-1.0 license。** 框架采用 **dual license（MIT OR SUL-1.0）**——OMO 源码可直接 import（升级最省事），同时给最终用户选择空间。"免费 + 非商业 + 不销售"已满足 SUL-1.0。详见 §7。

---

## 1. 现状速写（两个仓库）

### 1.1 DSH（deepseek-harness）

| 维度 | 现状 |
|---|---|
| 版本 | `0.1.0-rc.5` (`packages/dsh-root/package.json:3`) |
| 许可证 | MIT |
| 技术栈 | Node `^22.19 \|\| >=24`, TypeScript 6.0.3, pnpm 11.7, Cordis (vendored, `vendor/cosmokit/`) |
| 形态 | pnpm monorepo；200+ workspace package；`packages/{core,boot,bundle,preset,llm,subagent,goal,tools,compaction,workflow,hooks,web,plan,todo,fs,shell,sandbox,terminal,lsp,skill,jobs,session-query,subprocess,storage,credentials,session,...}/` |
| 心智 | "no privileged core to patch" — 整个 dsh 是 Cordis 插件树，profile = 一组 bundle 装出来的运行时；bundle = `cordis.patch.yml` + 代码；patch 层级 = `bundle 顺序 → profile patch → home patch → --patch overlay`（见 `docs/architecture.md:17-37`） |
| 暴露面 | `dsh` CLI（`apps/cli/src/bin.ts`）、JSON-RPC（`apps/gateway`）、SDK（`packages/sdk/{client,server,protocol}`）、ACP 协议（`packages/acp`）、Web 客户端（`apps/web-frontend`） |
| 双面构建 | `build:lib:host` + `build:lib:client`（`package.json:21-23`）—— 同一份代码能跑在 server 和 client 两种 build target |

**DSH 关键扩展点（从 `docs/architecture.md:107-128` "Where new behavior goes" 表抽出，直接对应 OMO 能力）**：

| DSH 扩展点 | 用途 | 对应 OMO 能力 |
|---|---|---|
| `ctx.llm` 注册 adapter | 新 LLM provider | OMO 多 provider 路由（Anthropic/OpenAI/DeepSeek/Kimi/Gemini） |
| `ctx.tools` | 注册 model-facing tool | OMO 全部内置 tool + 自定义 tool |
| `agent preset` + `isolate` realm | 会话级能力集 | OMO 11 个 agent 的差异化能力集 |
| `ctx.shell` backend | shell 执行 | OMO bash hooks |
| `ctx.terminals` backend | 持久终端 | OMO tmux integration |
| `ctx.commands` | 人类命令 | OMO `ultrawork / ulw / team / hyperplan / search` 命令 |
| `ctx.jobs` | 后台任务 | OMO ulw-loop + ralph-loop |
| `ctx.fs` provider + `fs/*` events | 文件系统策略 | OMO `bash-file-read-guard` / `write-existing-file-guard` |
| `ctx.sandbox` backend | 进程隔离 | OMO 命令审批（`landlock`/`bubblewrap` 等） |
| `agent/*` 事件 (waterfall) | 拦截/改写请求 | OMO IntentGate / Ultrawork keyword detector / Continuation / Todo Enforcer |
| `tools/*` 事件 (pre/post-execute waterfall) | 工具前后钩子 | OMO 全部 tool hook |
| `agent.inject()` | 注入上下文 | OMO AGENTS.md / `.omo/rules/**` 自动加载 |
| `ctx.sessionTitle` | 会话命名 | OMO 会话标题 |
| **`ctx.goals`** | **同会话目标** | **OMO `/goal` 与 Goal Enforcer（直接 native）** |
| `ctx.sessions.fork(...)` | fork 会话 | OMO 子会话 |
| `agent.ctx` 隔离 | 限定到具体 agent | OMO 每个 agent 的差异化 hook scope |
| `SessionEventMap` | 扩展持久事件 | OMO `tool/call`、`assistant/chunk` 等 |
| `ConversationNodeDefinition` | Web 客户端节点 | OMO Team Mode 的 tmux 可视化 |

**DSH 已有的、几乎"开箱即用覆盖 OMO" 的子系统**（`packages/bundle/base/package.json:42-119` 的依赖列出全部存在）：

- `dsh-goal` + `dsh-goal-round-driver` + `dsh-tool-goal` + `dsh-command-goal` → 完全覆盖 OMO `/goal`（`packages/goal/*`）
- `dsh-plan-mode` → OMO Prometheus Planner（`packages/plan/*`）
- `dsh-skill` + `dsh-skill-filesystem` + `dsh-tool-skill` → OMO skill 加载（`packages/skill/*`）
- `dsh-compaction-basic` + `dsh-compaction-tool-result-pruner` → OMO pre-compact（`packages/compaction/*`）
- `dsh-tool-ralph` + `dsh-tool-workflow` + `dsh-workflow-worker-thread` → OMO `ulw-loop` / `ralph-loop`（`packages/workflow/*`）
- `dsh-tool-todo` → OMO Todo Enforcer（`packages/todo/*`）
- `dsh-subagent` + `dsh-subagent-fork-in-process` + `dsh-subagent-spawn-in-process` + `dsh-tool-subagent*` → OMO Team Mode（`packages/subagent/*`，包括 `subagent-acp` / `subagent-codex` / `subagent-claude-code` / `subagent-dsh-sdk`）
- `dsh-terminal` + `dsh-tool-terminal` + `dsh-bash-local` → OMO tmux + bash 集成（`packages/terminal/*`）
- `dsh-lsp` + `dsh-lsp-stdio` + `dsh-tool-lsp` → OMO LSP（`packages/lsp/*`）
- `dsh-fs` + `dsh-fs-local` + `dsh-fs-sandbox` + `dsh-fs-observation-policy` + `dsh-tool-fs` + `dsh-tool-str-replace-editor` + `dsh-tool-fs-search` → OMO 文件系统工具（`packages/fs/*`，含 `str-replace-editor` 直接对应 hashline 的位置）
- `dsh-shell` + `dsh-shell-env` + `dsh-bash-sandbox` + `dsh-pwsh-sandbox` + `dsh-tool-bash` + `dsh-tool-pwsh` → OMO bash 工具（`packages/shell/*`，注意 OMO 有专门的 `git-bash-mcp` 处理 Windows）
- `dsh-sandbox-local` + `dsh-sandbox-policy` + `dsh-user-approval` + `dsh-permission-presets` → OMO 审批
- `dsh-session-*` 一整套 → OMO 会话持久化、checkpoint、replay、telemetry
- `dsh-web-search-deepseek` + `dsh-web` + `dsh-web-search-exa` + `dsh-web-search-perplexity` + `dsh-web-fetch-http` + `dsh-tool-web` → OMO 内置 web search 三个 provider
- `dsh-hooks-codex` + `dsh-hooks-claude-code` + `dsh-hook-protocol` → **直接吃 OMO 现有的 claude-code-hooks 和 codex hooks 配置文件**，零成本兼容
- `dsh-acp` + `packages/acp` → Agent Client Protocol，DSH 自己就是 ACP 客户端/服务端
- `dsh-jobs` + `dsh-jobs-local` + `dsh-tool-jobs` → OMO 后台任务
- `dsh-mcp/mcp-client` + `dsh-mcp-stdio-core`（DSH 内部命名）→ OMO 全部 MCP server

**结论：DSH 的扩展面已经接近 OMO 需要的 90%。** 移植主要是"配置 + 适配层"，不是"重新实现"。

### 1.2 OMO（oh-my-openagent）

| 维度 | 现状 |
|---|---|
| 仓库 | `https://github.com/code-yeongyu/oh-my-openagent` |
| 版本 | 主干在 `dev` 分支（README 顶部说 "Multi-Harness Agent OS Refactor in Progress"） |
| 许可证 | **SUL-1.0**（Sustainable Use License 1.0）— 非商用、不可二次销售、需带原 license（`LICENSE.md:25-27`） |
| 形态 | pnpm monorepo；19 core + 5 MCP + 4 adapter + 平台包 |
| 当前核心拆分（已经完成）| `ROADMAP.md:42-48` 列出已抽出的 19 个 harness-neutral 核心包：`utils, model-core, prompts-core, rules-engine, agents-md-core, comment-checker-core, hashline-core, boulder-state, telemetry-core, lsp-core, mcp-stdio-core, tmux-core, claude-code-compat-core, skills-loader-core, mcp-client-core, openclaw-core, team-core, delegate-core, omo-config-core` |
| Adapter（harness 胶水层） | `omo-opencode`（最大、最老）、`omo-codex`、`omo-senpi`、`pi-goal`、`pi-webfetch` —— 这就是 OMO 维护者已经定型的"多 harness 适配器"模式 |
| Agent 数量 | 11 个：Sisyphus, Hephaestus, Oracle, Librarian, Explore, Metis, Momus, Atlas, multimodal-looker, Sisyphus-junior（`packages/omo-opencode/src/agents/builtin-agents/`） |
| Hook 数量 | 54+（`packages/omo-opencode/src/hooks/` 目录里 200+ 文件，含 30+ hook 模块，每个 hook 自身可能 1–5 文件） |
| 编辑模型 | Hashline (`hashline-core`) — `LINE#ID` 内容哈希锚定 |
| 工作流 | ultrawork / ulw-loop / ralph-loop / team / hyperplan / Prometheus Planner / `/init-deep` |
| 内置 MCP | LSP, ast-grep, codegraph, grep_app, context7, exa, git-bash |
| 兼容性卖点 | "Claude Code Compatible"（hooks / commands / skills / MCPs / plugins） + Codex 兼容 + Senpi 独立发行 |
| 上下游 | "We are restructuring the codebase to support multiple agent harnesses (OpenCode, Codex, Pi, Claude Code, and others)" —— **官方明确欢迎新 adapter**（`README.md:11-14`） |
| 维护者哲学 | "Agent performance is the only metric" + 反对"过度抽象"（`ROADMAP.md:51-74`）—— **不要造统一抽象层，每个 adapter 独立写**。这与我们的方案天然一致。 |

**OMO hook 分类（已统计的 30 个 hook 模块，`packages/omo-opencode/src/hooks/`）**：

| Hook 模块 | 数量文件 | 在 DSH 上的目标事件 |
|---|---|---|
| `bash-file-read-guard` | 1 | `tools/pre-execute` waterfall |
| `empty-task-response-detector` | 1 | `agent/pre-step` |
| `tool-pair-validator/` | 8 | `tools/post-execute` + `agent/pre-step` |
| `hephaestus-agents-md-injector/` | 3 | `agent/pre-step` + `agent.inject()` |
| `todo-description-override/` | 4 | `tools/post-execute` |
| `team-tool-gating/` | 3 | `tools/pre-execute` |
| `goal/` (12 文件) | 12 | **`ctx.goals` (DSH 原生)** |
| `model-fallback/` | 5 | `agent/request` + `agent/request-error` |
| `webfetch-redirect-guard/` | 4 | `tools/pre-execute` |
| `no-hephaestus-non-gpt/` | 3 | `agent/pre-step` |
| `non-interactive-env/` | 5 | `agent/pre-step` |
| `keyword-detector/` (ultrawork/hyperplan/team, 13 文件) | 13 | `agent/pre-step` + `agent/turn-stopping` |
| `codegraph-bootstrap/` | 6 | `ctx.commands` (one-shot init) |
| `plan-format-validator/` | 3 | `tools/post-execute` |
| `start-work/` (15 文件) | 15 | `agent/pre-step` + `ctx.jobs` |
| `directory-readme-injector/` | 7 | `agent/pre-step` + `agent.inject()` |
| `write-existing-file-guard/` (5 文件) | 5 | `tools/pre-execute` |
| `edit-error-recovery/` | 3 | `tools/post-execute` |
| `preemptive-compaction*` (4 文件) | 4 | `ctx.compaction` (DSH 原生) |
| `session-notification-*` (5 文件) | 5 | `session/event` |
| `claude-code-hooks/` (20+ 文件) | 20+ | **DSH `hooks-claude-code` 直接吃** |
| `comment-checker-*` | 1+ | `tools/post-execute` |
| `tool-output-truncator` | 1 | `tools/post-execute` |
| `stop-continuation-guard/` | 3 | `agent/turn-stopping` |
| `monitor-status-injector/` | 3 | `agent/status` listener |
| `sisyphus-junior-notepad/` | 3 | `ctx.jobs` |
| `webfetch-*` | 1+ | `tools/pre-execute` |
| `question-label-truncator/` | 3 | `tools/post-execute` |
| `bash-file-read-guard` | 1 | `tools/pre-execute` |

**结论：OMO 的 30+ hook 模块全部能在 DSH 已有事件系统中找到挂载点。** 不需要修改 DSH 核心。

---

## 2. 移植可行性评估（用户需求 1）

### 2.1 11 个 agent → DSH `ctx.agents` 映射

OMO 的 11 个 agent 实际是"system prompt + 工具集 + 委派策略 + 模型路由"的组合。DSH 的 `agent preset`（需要 `isolate` realm）天然就是这套结构。

| OMO agent | DSH preset 配置 | 备注 |
|---|---|---|
| `sisyphus` (主调度) | `ctx.agents` 注册为 orchestrator preset，主用 GPT-5.6/Opus-5 路由 | preset 内放 system-prompt sections、tools、goal driver |
| `hephaestus` (实现主力) | preset + delegate 调用 | 用 `agent/*` + `agent.inject()` 链式触发 |
| `oracle` (咨询师) | preset，主用 Gemini | 写只读 fs 策略 |
| `librarian` (文档) | preset，主用 Claude | 内置 web search / context7 MCP |
| `explore` (代码搜索) | preset，主用 Gemini + ast-grep | 启 ast-grep MCP |
| `metis` (规划) | preset，主用 Claude Opus | 与 `ctx.plan` 联动 |
| `momus` (代码 review) | preset，主用 Claude Opus | 写 tool-restriction 不允许改文件 |
| `atlas` (高级调度) | preset | 含 `tool-restrictions` |
| `multimodal-looker` (图像) | preset | 模型白名单（vision-capable） |
| `sisyphus-junior` | preset，默认 5 个模型变体 | 用 `agent-presets` 包统一管理 |
| `prometheus` (planner) | preset | **直接复用 DSH `dsh-plan-mode`** |

**评估：11/11 可移植**，无任何 agent 需要从零写。

### 2.2 54+ hook → DSH 事件挂载

上面那张表（§1.2）已经把每个 hook 模块映射到 DSH 事件系统。关键点：

- **`agent/pre-step` waterfall**（`docs/architecture.md:84-88`）是"authoritative 拒绝 / 改写"语义，**正是 OMO 的 IntentGate / ultrawork detector / Todo Enforcer / start-work / 任何"看到 prompt 决定改不改"的 hook 想要的语义**。
- **`tools/pre-execute` / `tools/post-execute` waterfall**（`docs/tool-execution-pipeline.md:13-22`）支持"deny / block / replace / add context"四种转换，**正好对应 OMO 的 `tool-pair-validator`、`bash-file-read-guard`、`write-existing-file-guard`、`comment-checker`、`tool-output-truncator`**。
- **`ctx.goals` 服务**（`packages/goal/goal/`）是事件溯源的同会话目标服务，**OMO 的 `goal/` 12 文件 hook 模块可以直接删掉，用 `dsh-goal` + `dsh-tool-goal` + `dsh-command-goal` 替代**。
- **`ctx.compaction` 基础 + 工具结果剪枝**（`packages/compaction/`）替代 OMO 的 `preemptive-compaction*` 4 文件。
- **`dsh-hooks-claude-code`**（`packages/hooks/hooks-claude-code/package.json`）**直接执行 OMO 用户的 `claude-code-hooks/` 配置文件**（pre-tool-use / post-tool-use / user-prompt-submit / pre-compact / stop），OMO 自家写的那 20+ 文件直接转译。
- **`dsh-hooks-codex`**（`packages/hooks/hooks-codex/package.json`）同上，Codex Light edition 的 hooks 文件直接吃。

**评估：所有 hook 都能挂到 DSH。** 大约 15% 的 OMO hook 可以**直接删掉**（goal/compaction/skill/todo/ralph/workflow 这些 DSH 原生有的），剩下 85% 改成"监听 DSH 事件 + 调 OMO core 包" 的 Cordis plugin。

### 2.3 OMO MCP servers → DSH MCP

| OMO MCP | DSH 对应 |
|---|---|
| `lsp-tools-mcp` / `lsp-daemon` | `dsh-lsp` + `dsh-lsp-stdio` + `dsh-tool-lsp`（可复用 OMO 自己的 lsp-core） |
| `ast-grep-mcp` | 用 `dsh-mcp-client` 直接挂 stdio 进程 |
| `git-bash-mcp` | 同上 |
| `codegraph` | 同上 |
| `exa` / `context7` / `grep_app` (web) | `dsh-web-search-exa` 等价 + `dsh-web` |

**评估：MCP 全部可移植。** OMO 已经有 `mcp-stdio-core` 和 `mcp-client-core`，与 DSH 的 mcp 包层叠在一起几乎零摩擦。

### 2.4 LLM provider 路由

OMO 用 Anthropic + OpenAI + Gemini + Kimi + DeepSeek + Copilot + Z.ai 共 7 路。DSH 现成 `dsh-llm-deepseek` + `dsh-llm-pi-ai`（pi-mono 是 OpenAI/Anthropic 兼容的代理）。其余需要补：

- `dsh-llm-anthropic` — 缺
- `dsh-llm-openai` — 可能已并入 pi-ai
- `dsh-llm-gemini` — 缺
- `dsh-llm-kimi` — 缺
- `dsh-llm-copilot` — 缺
- `dsh-llm-zai` — 缺

**评估：LLM 路由层是个真活儿，但工作面比 hook 移植小一个数量级。** 主要是写 6 个新 `llm-*` adapter（每个 200–500 行）。可以分批做，第一期只接 DeepSeek + OpenAI-compatible，覆盖 80% 用例。

### 2.5 Team Mode（OMO 最强创新）

OMO Team Mode = lead + 8 parallel members + tmux 可视化 + `team_*` 工具集 + mailbox 协议。DSH 对应：

- **`dsh-subagent`** 是通用子 agent 服务（`packages/subagent/subagent/`）
- **`dsh-subagent-fork-in-process` / `dsh-subagent-spawn-in-process`** 是 in-process fork/spawn
- **`dsh-subagent-acp`** 通过 ACP 协议连外部 agent
- **`dsh-subagent-codex` / `dsh-subagent-claude-code` / `dsh-subagent-dsh-sdk`** 是不同宿主
- **`dsh-tool-subagent` / `dsh-tool-subagent-control` / `dsh-tool-subagent-report`** 是 model-facing 工具
- **OMO 的 `team-core` 是 harness-agnostic 的纯 TS**（`packages/team-core/src/index.ts:1-11` 看到只有 types/config/logger/member-parser/session-client/team-registry/team-mailbox/team-tasklist/team-state-store/team-worktree/team-layout-tmux），**可以原样作为 DSH workspace 依赖引入**

**评估：Team Mode 100% 可移植，且 70% 工作由 OMO 自己的 `team-core` 直接给我们用**，不用重写。

### 2.6 Hashline edit

OMO 的 `hashline-core` 是纯 TS 包（无 OpenCode 依赖）。直接作为 DSH `ctx.fs` provider + `tools/post-execute` listener 接入，替换 DSH 默认 `dsh-tool-str-replace-editor` 的写入路径。

**评估：直接接入。** 可选：给 DSH 提一个 PR 加一个 `dsh-tool-str-replace-editor-hashline` 变体。

### 2.7 Telemetry

OMO 用 PostHog + SHA256 hashed install id。DSH 有 `dsh-session-telemetry` + `dsh-session-telemetry-otel`（OTel 协议），可以直接走 OTel → PostHog 集成。

**评估：可移植。** 需要写一个 PostHog exporter（`@oh-my-opencode/telemetry-core` 也能复用）。

### 2.8 编辑工作流

| OMO 概念 | DSH 对应 |
|---|---|
| `ultrawork / ulw` | `ctx.commands` 注册命令，触发 `agent/pre-step` waterfall 装一个 ultrawork continuation listener |
| `team` mode | 切换到 team preset，启用 team_* tools |
| `hyperplan` | `dsh-plan-mode` preset + 5 敌对评审 |
| `start-work` | `ctx.commands` + `ctx.jobs` |
| `ralph-loop` / `ulw-loop` | `dsh-tool-ralph` + `dsh-tool-workflow` |
| `/init-deep` | `ctx.commands` + walk filesystem + 调 `agents-md-core` 写 AGENTS.md |
| `Prometheus Planner` | `dsh-plan-mode` |

**评估：所有 slash command 都能 1:1 翻译。**

### 2.9 DSH 优势利用

移植不只是"把 OMO 装到 DSH 上"，还能用上 DSH 比 OpenCode 更好的设计（这些是 OMO ROADMAP 自己承认 OpenCode 的痛）：

| DSH 提供 | 解决了 OMO 现有痛 |
|---|---|
| **Session log 是 source of truth**（`docs/architecture.md:92-96` "Model-visible means logged"）| OMO ROADMAP `Why Not OpenCode-Native`: "Multiple hooks observe the same idle or error edge and inject the same internal message ... Duplicate work. Infinite loops. State corruption" — DSH 的 session log + `agent/pre-step` authoritative 拒绝从根上解决 |
| **Landlock sandbox**（`native/landlock-run/`）| OMO 现在缺进程级 Linux sandbox |
| **完整的 LLM retry / token meter / session checkpoint** | OMO 自己要造这些 |
| **内置 subagent 隔离 + ACP 协议** | OMO Team Mode 现在要手工做 in-process 隔离 |
| **`agent/turn-stopping` 串行终止** | OMO 现在的 `stop-continuation-guard` 是在很多处手工判断的 |
| **双面构建（host + client）** | OMO 现在没法把同一个 agent runtime 嵌入到 IDE / Web UI 里 |
| **Web 客户端**（`apps/web-frontend`） | OMO 想要 Team Mode 的可视化，DSH 直接有 web UI |
| **`tools/result` 不可变快照** | OMO 工具结果改写后模型看不到原值，DSH 保留 |

**这些"白送"的能力升级也是"为什么值得移植到 DSH"的核心理由。**

### 2.10 移植工作量粗估

按工作类型分块估算（不构成实施计划，仅供可行性参考）：

| 工作类型 | 估时 | 说明 |
|---|---|---|
| 接 OMO core 19 包为 workspace 依赖 | 1 周 | 19 个 OMO 核心包在 DSH workspace 里 typecheck 过 |
| 写 `omo-dsh-adapter` Cordis plugin | 4 周 | 11 agent 能跑，30 hook 挂在 DSH 事件上 |
| LLM adapter 补齐 | 2 周 | 先 DeepSeek + OpenAI compat，再补其余 |
| MCP 桥接 | 2 周 | LSP / ast-grep / codegraph / git-bash / web 三件套 |
| Team Mode 移植 | 3 周 | 用 OMO team-core + DSH subagent |
| Profile / bundle 化 | 1 周 | `cordis.patch.yml` + `omo.profile.json` |
| 端到端测试 + 性能调优 | 2 周 | 全功能 smoke test |
| 文档 + 上手指南 | 1 周 | docs/ |
| **合计** | **~16 周 / 4 个月**（一人主力） | MVP 范围 |

**评估：可行性高，4 个月一个人能交付 MVP。** 大头不是"功能重写"（DSH 给了 60%），是"细致的事件映射 + LLM adapter"。

> ⚠️ **在把 §2.10 任何一行当作项目 commit 之前，请先读这一段。** §2.10 的行标签写"MVP 范围"是因为这是可行性研究的标准词汇，但本报告里"MVP"、"must"、"follow-up"、"工作量估算"都是研究阶段的观察，不是项目级 commit。完整定位说明见 §3。

---

## 3. 报告定位与使用边界

**本报告是什么**
- 一份**调查研究和可行性分析**——回答"OMO 能否移植到 DSH？如果能，一个可持续的 patch 框架长什么样？"
- 来自 OMO 和 DSH 源码的证据记录，附 `file:line` 引用。

**本报告不是**
- **不是**项目计划、**不是**MVP 范围定义、**不是**发布时间表、**不是**"must / follow-up"特性清单。
- **不是**任何特定实现形态的 commit（§4 里的目录树、脚本、metric 都是示意，不是蓝图——见 §4 顶部的 disclaimer）。
- **不**做项目级决策。用户已确认的决策见[决策记录](./decisions_zh-CN.md)（docs/decisions.md）；开放维度的选项分析见 §10。

**如何读后续章节**
- **§1–§11**：高层可行性与框架分析。某些子节含具体设计（如 §4.3 目录树、§4.4 升级流程、§4.7 脚本骨架、§4.8 metric 列表），这些是**示意性（illustrative）**——一种可能的形态以让讨论具体，不是项目 commit。
- **§12–§14**：三个后续问题的深入调研。每节末尾的"明确不做的事" / "Out of this research's scope" 子节描述的是**该问题的调研范围**（作者选择问什么），不是项目级 non-goal 清单。
- **决策文档（docs/decisions.md）**：唯一记录**项目决策**的地方。任何听起来像决策但不在此的，应读为研究阶段观察、研究阶段草稿、或开放问题。

**证据快照：** 本报告主体（§1–§11）完成于 2026-08-16（§11 社区截屏同日）；§12–§14 为 2026-08-19 追加的深入调研；决策更新见 §10。所有代码引用来自固定快照；对应日期之后的代码或文档变更不在本报告范围。

---

## 4. 可持续 patch 框架设计（用户需求 2）

> ⚠️ **示意节。** 目录树（§4.3）、升级流程伪代码（§4.4——已自带"Output (mock)"标识）、脚本骨架（§4.7）、metric 列表（§4.8）都是为让可行性讨论具体而呈现。**它们都不构成 commit**——不承诺使用那种确切形态、那些确切文件名、那些确切 cron 表达式、或那些确切 metric。如果项目进行，可自由选择讨论中的任一替代形态。

### 4.1 设计目标

让 OMO 上游一发布新版本，我们能在 1–3 天内完成"bump → 跑测试 → 暴露冲突 → 改 adapter"循环，**而不是"手动改 30 个 hook 翻译"**。

### 4.2 框架拓扑

```
┌───────────────────────────────────────────────────────────────┐
│  不可变底层：DSH v0.1.0+ (MIT, 上游独立 release)               │
│  200+ package，pnpm monorepo，semver 严格                       │
└──────────────────────────────┬────────────────────────────────┘
                               │ workspace 依赖（pin 到 minor）
┌──────────────────────────────▼────────────────────────────────┐
│  可变中间层：OMO 上游 19 个 core 包                              │
│  通过 git subtree 或 pnpm git protocol 引入                    │
│  - 主干 pin：dev branch 每周 rebase                             │
│  - 发布 pin：每 2–4 周 bump 到 OMO 官方 tag                     │
└──────────────────────────────┬────────────────────────────────┘
                               │ workspace 依赖（pin 到 SHA / tag）
┌──────────────────────────────▼────────────────────────────────┐
│  我们写的最小胶水：oh-my-opendsh/adapter/                        │
│  - 11 agent preset 注册                                         │
│  - ~30 hook 翻译为 DSH 事件 listener                            │
│  - LLM adapter 补全                                             │
│  - omo-dsh profile 声明                                         │
│  - 关键面：cordis.patch.yml + agent preset JSON                 │
└──────────────────────────────┬────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────┐
│  不可变顶层：用户 project 的 cordis.patch.yml                   │
│  用户的"我要额外加一个 hook / 一个 agent"                  │
└───────────────────────────────────────────────────────────────┘
```

**关键洞察**：**真正每次 OMO 升级会动的，就是中间这一层（core 版本号）和最底这一层（adapter 翻译）**。底层 DSH 和顶层 user patch 几乎不动。

### 4.3 物理仓库结构

> **示意性目录布局**——一种可能形态；不是项目 commit。

**采用 DSH 官方 scratch plugin 模式**（`dsh --patch ./oh-my-opendsh/cordis.yml`）—— 一个独立 npm 包，DSH 一行不改。

```
oh-my-opendsh/                          # patch 框架仓库（独立 npm 包，license: MIT OR SUL-1.0）
├── package.json                        # "license": "MIT OR SUL-1.0"
├── pnpm-workspace.yaml                 # 内含 4 个 sub-plugin
├── tsconfig.json
├── README.md
├── LICENSE                             # "MIT OR SUL-1.0" 全文
├── LICENSES/
│   ├── LICENSE-MIT                     # MIT 全文
│   └── oh-my-openagent.LICENSE.md      # OMO 原文原样
├── THIRD_PARTY_NOTICES.md              # 致谢 + attribution
├── docs/
│   ├── feasibility-report.md           # 英文主报告（调研依据）
│   ├── feasibility-report_zh-CN.md     # 本文件（中文，调研依据）
│   ├── decisions.md                    # 英文决策记录（项目级决策唯一登记处）
│   ├── decisions_zh-CN.md              # 决策记录（中文）
│   ├── upgrade-playbook.md
│   ├── hook-translation-table.md
│   ├── agent-preset-schema.md
│   ├── license-notes.md
│   ├── dsh-plugin-patterns.md
│   └── llm-adapter-survey.md
├── patches/omo-dsh/                    # 4 个 DSH sub-plugin（对应 cookbook 4 形态）
│   ├── omo-agents/                     # Tool plugin：11 agent preset 包装
│   ├── omo-hooks/                      # Hook plugin：DSH event → OMO hook listener
│   ├── omo-team-ui/                    # UI plugin：web ChatNode for team 可视化
│   └── omo-bundle/                     # profile 声明 + 配置（4 形态的"协议驱动"层）
├── cordis.yml                          # root patch 入口，加载上面 4 个 sub-plugin
└── scripts/
    ├── bump-omo.sh                     # pnpm update + 测（核心 5 分钟）
    ├── bump-dsh.sh
    ├── upstream-watch.sh               # 监控 OMO + DSH release
    └── verify-licenses.sh              # license 守门人
```

### 4.4 Patch 升级流程

OMO 通过 npm 依赖引入，**升级核心就是 `pnpm update`**。listener 翻译层是唯一会动的地方。

#### 常规升级 OMO（节奏选项：事件驱动 / 双月；见 §10.7）

```bash
# 1. 看 OMO 上了什么
./scripts/upstream-watch.sh omo --since 2w

# 2. 一键 bump（核心就是 pnpm update + 跑测试）
./scripts/bump-omo.sh v3.2.0
# 输出（伪）：
#   ✓ pnpm lockfile updated (3.1.0 → 3.2.0)
#   ✓ typecheck 通过
#   ✓ 412 tests pass
#   ⚠ 3 个 listener 受影响（git diff 列出文件清单）：
#       patches/omo-dsh/omo-hooks/keyword-detector/listener.ts
#       patches/omo-dsh/omo-agents/sisyphus/preset.ts
#       patches/omo-dsh/omo-hooks/tool-pair-validator/listener.ts
#   → 改 listener 签名（典型 0.5–1 小时）

# 3. commit + tag
git tag omo/v3.2.0
```

**总耗时：5 分钟（脚本）+ 0–1 小时（修 listener）= 1 小时内完成一次 OMO 升级**。

#### 升级 DSH（节奏选项：每 1–2 月；待 §10.7 决策）

```bash
./scripts/bump-dsh.sh v0.2.0
pnpm typecheck && pnpm test
# 主要风险：DSH 改了事件签名或 plugin API（看 DSH CHANGELOG）
```

#### 大版本（DSH 1.0 / OMO 4.x）

读上游的 migration guide，先在分支上 bump，过完所有 gate 才 merge main。

### 4.5 冲突最小化设计

OMO 主体通过 npm 依赖引入（patch 框架直接 import OMO 19 core + 4 adapter），所以"冲突面"被锁在 **listener 翻译层**这一薄层。DSH event → OMO hook call 的双向转换是唯一会动的地方。

| 风险点 | 缓解策略 |
|---|---|
| OMO 改 hook 签名 | `patches/omo-dsh/omo-hooks/*/listener.ts` 是 listener 翻译层（DSH event → OMO hook call）；OMO 改 hook 签名时，tsc 报错精准指向 listener，10 分钟–1 小时修复 |
| OMO 改 agent 配置 | `patches/omo-dsh/omo-agents/*/preset.ts` 是 preset 包装（OMO JSON config → DSH preset）；OMO 改 agent 定义时，重读 OMO JSON 重新包装 |
| OMO 改 core API | npm lockfile pin + `pnpm test` 在升级时跑通；tsc 报错精准指向 |
| OMO 加新 hook | `scripts/upstream-watch.sh` 提示"OMO 新加 3 个 hook"；我们手动加 3 个 listener |
| DSH 改事件签名 | 集中放在 `patches/omo-dsh/omo-hooks/dsh-compat.ts` 一个文件里做"事件 shim"，全 adapter 共享 |
| 上游 release 频率不可控 | pin 到 minor 版本；不自动追 dev branch；只在显式 bump 时升级 |
| OMO license 变更 | `scripts/verify-licenses.sh` 每次 CI 跑，禁止误改成更严格的 license |

### 4.6 测试金字塔

| 层级 | 内容 | 工具 |
|---|---|---|
| Unit | OMO core 包在我们 workspace 里的纯函数行为 | vitest |
| Adapter unit | listener 包装正确性（喂入模拟 DSH 事件，验证 OMO hook 被调且参数对） | vitest + DSH `dsh-agent-loop-testkit` |
| Integration | 11 agent preset 启动后能看到正确 system prompt / tools / 路由 | DSH `examples/agent-spine-demo` 模式 |
| E2E | 真实跑 OMO "ultrawork" 流程在 DSH 上 | DSH `vitest.e2e.config.ts` + LLM mock server |
| Snapshot | OMO agent preset 的 system prompt diff | `DSH_SNAPSHOT=record` |
| License | 任何改动不得引入非 SUL-1.0 / 非 MIT 依赖 | `scripts/verify-licenses.sh` |
| 升级回归 | bump 脚本完成后必须 0 失败 | CI gate |

### 4.7 关键脚本骨架

> **示意性脚本骨架**——一种可能形态；不是项目 commit。

只列契约，不写实现：

```text
scripts/bump-omo.sh <version>
  - pnpm update oh-my-opencode @oh-my-opencode/* --filter <version>
  - pnpm install
  - pnpm typecheck && pnpm test
  - 如果有 listener 签名破坏：tsc 报错精准指向
  - 输出 diff 摘要：受影响 listener 列表 + OMO 这次 changelog 链接
  - 返回非 0 如果测试不过

scripts/bump-dsh.sh <version>
  - pnpm update @deepseek-ai/dsh-* --filter <version>
  - pnpm typecheck && pnpm test
  - 同上格式输出

scripts/upstream-watch.sh omo --since 2w
  - 调 GitHub API 列 commits
  - 过滤 packages/omo-opencode/src/hooks 与 packages/omo-opencode/src/agents 的改动
  - 输出"hook 数量变化 / agent 数量变化 / 新文件"摘要

scripts/verify-licenses.sh
  - 扫描 pnpm-lock.yaml + 我们写的 package.json
  - 任何依赖 license 不是 MIT / Apache-2.0 / BSD / ISC / SUL-1.0（仅 OMO）就 fail
```

升级 OMO 的实际工作量：**5 分钟（脚本）+ 0–1 小时（修 listener）**。

### 4.8 升级节奏与可观测性

> **示意性 metric 与节奏列表**——一种可能形态；不是项目 commit。

- **CI 在每次 push 跑** `pnpm test && scripts/verify-licenses.sh && scripts/conflict-scan.sh --diff`（要求 PR 必须证明本次改动对 OMO 上游某 commit 是 backward-compatible）
- **每周一** 自动跑 `scripts/upstream-watch.sh` 写一个 GitHub Issue 标题 `upstream-changelog-YYYYMMDD`，列出 OMO + DSH 过去 7 天的 commits
- **每月底** 评估是否 bump 一次小版本（"上游动了 ≥ 5 个 commit 且 CI 全绿就 bump"）
- **季度评估** 是否切换到 OMO 下一个 major tag

---

## 5. 风险与未决问题

### 5.1 硬风险（必须前置处理）

| 风险 | 影响 | 缓解 |
|---|---|---|
| **OMO SUL-1.0 限制商用** | 派生作品不能商业销售 | 框架 dual license (MIT OR SUL-1.0)，分发热衷于"免费 + 非商业"路径；**不做销售** 满足 SUL-1.0；商业服务 / SaaS 亦不做（2026-08-19，决策文档 D8） |
| **OMO `omo-opencode` 还在重构** | OMO 公开说"still strongly coupled to OpenCode in its largest adapter" | 我们不 import `omo-opencode`；只 import 19 core 包 + 4 小 adapter（pi-goal / pi-webfetch / omo-codex / omo-senpi）|
| **DSH 还是 0.1.0-rc.5** | API 未稳定 | pin minor（`0.1.x`，2026-08-19 决策，见决策文档 D7）；minor 及以上升级一律经 `bump-dsh.sh` 显式进入并过全量 gate |
| **Windows / WSL 体验** | 跨平台可能比 macOS/Linux 慢 | 不纳入当前范围（2026-08-19 决策，见决策文档 D9）|
| **LLM adapter 工作量被低估** | 6 个 llm-* 每个 200–500 行 | 第一期 DeepSeek + OpenAI-compatible；按需补 |
| **OMO telemetry PostHog vs DSH OTel** | 桥接有工作 | 30 行 PostHog exporter 接到 OTel；默认 opt-out |

### 5.2 软风险（可以接受）

| 风险 | 影响 |
|---|---|
| OMO 维护者 反对加 DSH adapter | 几乎不会（README/ROADMAP 都明确欢迎新 adapter）|
| DSH 上游 event 改名 | DSH 0.x 阶段 0.1 → 0.2 → 0.3 都会 break 一点，0.1 → 1.0 之后会稳 |
| OMO 加新 hook 类型 DSH 没见过 | 上游会先在 OpenCode adapter 加，DSH 我们加 listener 即可 |
| 框架代码 100% 引用 OMO 上游 | 框架本身只是薄 listener 包装；注意 attribution + license 双协议 |

### 5.3 暂未决

本节原列的 6 个决策点已全部由用户确认（见决策文档 D1–D6）。其余开放维度的选项分析见 §10，决策状态跟踪见决策文档 O1–O8；风险处置决策（接受现状 / 暂不处理，2026-08-19，R1–R6）亦记录于[决策记录](./decisions_zh-CN.md)。

---

## 6. 决策矩阵——已重组

> 本节原先的"决策矩阵"已重组到：
> - **已确认决策**——10 项（2026-08-16 六项 D1–D6 + 2026-08-19 四项 D7–D10），记录于[决策记录](./decisions_zh-CN.md)。
> - **开放维度**——8 项（其中 2 项已于 2026-08-19 决策，转为 D7 / D9）；研究阶段选项分析见本报告 §10，状态跟踪见决策文档 O1–O8。
>
> 本节保留为索引；所有项目级决策见决策记录。原矩阵草案被移除，因为它把"研究阶段分析"和"项目决策"混在一起——见 §3。

---

## 7. License 处理（SUL-1.0 专项）

### 7.1 关键事实

- **DSH**: MIT（友好）
- **OMO**: Sustainable Use License v1.0（`<OMO_REPO>/LICENSE.md`）
  - 允许：用 / 复制 / 分发 / 修改 / 准备派生作品
  - **限制 A**：仅"自己的内部业务目的"或"非商业或个人使用"可使用 / 修改
  - **限制 B**：分发给他人时必须**免费 + 非商业**
  - **限制 C**：不得删除 / 模糊任何 license / copyright 声明
  - 专利：mutual termination
  - 终止：30 天 cure period

### 7.2 对 patch 框架的含义

| 场景 | 是否允许 | 处理 |
|---|---|---|
| 内部团队使用 patch 框架 | ✅ 允许 | 直接用 |
| 把 patch 框架发到 GitHub 公开 | ✅ 满足（免费 + 非商业）| repo 加 `LICENSE = MIT OR SUL-1.0`；`LICENSES/oh-my-openagent.LICENSE.md` 原样放 OMO 文本；README 显式声明 dual license |
| 把 patch 框架的派生作品给客户 | ❌ **违反 SUL-1.0**（商业分发） | 不要做；客户需要自己跑 OMO 上游 |
| 在 patch 框架里"卖服务 / SaaS" | ❌ 不做（2026-08-19 决策） | 彻底规避 "Use vs Distribute" 灰色地带；见决策文档 D8 |
| 在 patch 框架里 import `omo-core/*` 源码 | ✅ 满足（派生作品整体受 SUL-1.0 传染，但以 dual license 形式发布）| 仍可发；框架整体 dual license（MIT OR SUL-1.0）|
| 仅用 OMO 的 API 思想重新实现，不复制源码 | ✅ 允许 | clean-room rewrite；可用但**升级成本高**——见 §7.3 / §7.4 的选项分析 |

### 7.3 License 缓解选项（分析，非决策）

下面三个选项是研究阶段分析的。用户随后在 2026-08-16 选择了方案 1（dual license + 直接 import）——见决策文档 D6。本节保留分析作为记录；不重新作为推荐。

1. **dual license**：框架 `package.json` 写 `"license": "MIT OR SUL-1.0"`，`LICENSES/` 放两个全文。这让 OMO 源码可被直接 import，升级成本最低（5 分钟 + 0–1 小时修 listener）；同时给最终用户选择空间（用 OMO 时遵守 SUL-1.0，不用时遵守 MIT）。
2. **npm 依赖 + 直接 import**：OMO 19 core + 4 adapter 通过 `pnpm i oh-my-opencode` 拉入 `node_modules/`。我们的 `patches/omo-dsh/omo-hooks/*/listener.ts` 是 listener 包装，import OMO 的 hook 函数并加 DSH 事件转换。
3. **clean-room**：adapter 全自己写，不 import OMO 源码。license 最干净（框架纯 MIT），但每次 OMO 升级需要重写翻译层（1–5 天 vs 1 小时），得不偿失。

### 7.4 研究阶段推荐的最终落点

研究阶段倾向（用户复核之前）偏方案 1——dual license + 直接 import，理由见 §7.3。

2026-08-16 用户确认了这一选择，并记录在决策文档 D6 作为项目的 license 策略。本节作为研究阶段分析记录保留；不重新作为推荐。其它两个选项（仅 npm / clean-room）作为替代路径留存，以备未来项目 license 立场需要变化时使用。

**关于选项 3（clean-room）的注脚**：如果项目未来需要以纯 MIT（无 SUL-1.0 继承）重新发布，唯一路径是 clean-room 重写，升级成本取舍如上。这是为参考而记录，不是当前决策。

---

## 8. 本研究识别的能力面（不含 MVP 定义）

> ⚠️ 本节**不是**项目 MVP 定义。它是研究阶段的能力清单——列出"如果项目进行，移植工作需要触及哪些能力面"。**未对任何能力做"必须 / 不必" commit**；相关决策待用户输入（见 §10.8 开放维度）。

如果项目进行，本研究识别出以下 12 项能力面，移植工作将以某种形式触及它们：

1. **冷启动**：`dsh web --patch ./oh-my-opendsh/cordis.yml` 能冷启到 idle
2. **Agent presets**：OMO agent 注册为 DSH preset
3. **Hook listeners**：OMO 生命周期 hook 通过 DSH event listener 挂载
4. **Slash 命令**：`ultrawork / ulw / team / hyperplan / search` 5 个命令工作
5. **MCP servers**：LSP / ast-grep / codegraph / web-search 4 个 MCP 启动
6. **Team Mode**：lead + N 个 member + web 可视化
7. **Hashline edit tool** 工作
8. **端到端冒烟测试**：一条命令能跑通
9. **Bump 脚本**：`./scripts/bump-omo.sh v3.x.0` 在有限时间内完成
10. **License hygiene**：`LICENSES/`、`THIRD_PARTY_NOTICES.md`、显著 credits
11. **文档**：8 篇文档完成
12. **CI**：所有 check 在支持的平台上为 green

**如何使用本清单**：如果/当项目 MVP 范围被定义时，本清单是出发点。实际 must/follow-up 的拆分（这 12 项中哪几项属于 MVP）是**开放决策**（见 §10.8），本节不做。

---

## 9. 参考材料（仓库内部链接）

- DSH 架构概览：`<DSH_REPO>/docs/architecture.md`
- DSH agent 生命周期：`<DSH_REPO>/docs/agent-lifecycle.md`
- DSH 工具执行管线：`<DSH_REPO>/docs/tool-execution-pipeline.md`
- DSH Cordis 入门：`<DSH_REPO>/docs/cordis-primer.md`
- DSH bundle 范例：`<DSH_REPO>/packages/bundle/base/package.json`
- DSH hook 协议：`<DSH_REPO>/packages/hooks/hook-protocol/package.json`
- DSH claude/codex hook 桥接：`<DSH_REPO>/packages/hooks/hooks-claude-code/`, `.../hooks-codex/`
- DSH subagent 系列：`<DSH_REPO>/packages/subagent/`
- DSH goal 服务：`<DSH_REPO>/packages/goal/`
- DSH workflow / ralph：`<DSH_REPO>/packages/workflow/`
- DSH todo / plan / skill / compaction：`<DSH_REPO>/packages/{todo,plan,skill,compaction}/`
- OMO ROADMAP：`<OMO_REPO>/ROADMAP.md`
- OMO hooks 目录：`<OMO_REPO>/packages/omo-opencode/src/hooks/`
- OMO agents 目录：`<OMO_REPO>/packages/omo-opencode/src/agents/`
- OMO team-core（harness-agnostic）：`<OMO_REPO>/packages/team-core/src/index.ts`
- OMO LICENSE：`<OMO_REPO>/LICENSE.md`

---

## 10. 开放维度分析（决策记录见决策文档）

> **决策记录已移出本报告**（2026-08-19）。所有项目级决策——已确认决策（D1–D10）、风险处置（R1–R6）、开放维度状态跟踪（O1–O8）——记录在独立的决策文档：[decisions.md](./decisions.md)（英文）/ [decisions_zh-CN.md](./decisions_zh-CN.md)（中文）。
>
> 本报告定位为**调研与依据文档**：决策文档中的每项决策以编号（D# / R# / O#）引用本报告章节作为依据。本节保留下列 8 个开放维度的**研究阶段选项分析**（原 §10.2）——这属于调研内容；各维度当前是否已决，见决策文档 O1–O8。（本节早期版本把某些选项标为"推荐"——那些标签已移除，因为它们把研究阶段分析与项目决策混在一起。"推荐"标签的底层分析以纯文本形式保留在右栏中。）

### 10.1 OMO 19 core 包 pin 策略

| 备选 | 含义 |
|---|---|
| A. exact（`3.2.0`）| 完全不自动接 patch |
| B. caret（`^3.2.0`）| 接 patch + minor；OMO 公开 bug fix 自动进入。研究阶段分析：人工维护成本最低，但要接受非预期的 minor 变更。|
| C. tilde（`~3.2.0`）| 只接 patch |

### 10.2 DSH 自身 pin 策略

> ✅ **已决（2026-08-19）**：选 A（pin minor `0.1.x`），见决策文档 D7。下表保留为研究阶段分析记录。

| 备选 | 含义 |
|---|---|
| A. pin minor（`0.1.x`）| DSH 0.x 阶段 0.1→0.2 有 API 变化，pin minor 是最稳妥的防御位。研究阶段分析：在 0.x 阶段推荐。|
| B. pin patch（`0.1.5`）| 严格锁 |
| C. 跟进 dev branch head | 激进，CI 要能跑通 head |

### 10.3 npm 包命名

| 备选 | 含义 |
|---|---|
| A. `@oh-my-opendsh/*`（scoped）| 4 个 sub-plugin 各自独立包；DSH 自家是 `@deepseek-ai/dsh-*` 同款模式。研究阶段分析：与 DSH 惯例一致。|
| B. `oh-my-opendsh`（单包）| 4 个 sub-plugin 作为内部目录 |

### 10.4 Windows 是否在 MVP 范围

> ✅ **已决（2026-08-19）**：选 B（不纳入当前范围），见决策文档 D9。下表保留为研究阶段分析记录。

| 备选 | 含义 |
|---|---|
| A. 是（写跨平台 e2e）| +1 周工作量 |
| B. 否（macOS + Linux only）| DSH 0.1 跨平台坑多。研究阶段分析：推迟 Windows 避免已知成本税；Windows 用户会被阻塞到 follow-up 之前。|

### 10.5 Telemetry 默认状态

| 备选 | 含义 |
|---|---|
| A. 默认 opt-in（用户主动开）| 最干净 |
| B. 默认 opt-out（用户主动关）| 对齐 OMO 原版 PostHog 默认；提供开箱即用。研究阶段分析：UX 最好，隐私成本小。|
| C. 完全不接 | 最省事但失去 OMO 兼容性 |

### 10.6 OMO 上游 release 通知

| 备选 | 含义 |
|---|---|
| A. GitHub Watch + RSS | 最简，依赖个人习惯 |
| B. GitHub Actions weekly cron + auto-issue | 写个 `upstream-watch.yml` workflow，周一跑一次生成 issue 摘要。研究阶段分析：低成本，无需人在环。|
| C. 订阅 OMO Discord announcements channel | 实时但有信息噪声 |

### 10.7 升级节奏

| 备选 | 含义 |
|---|---|
| A. 事件驱动（OMO 发了 release 就 bump）| 最省心。研究阶段分析：与自然触发匹配；需要 CI 可信。|
| B. 双月 | 之前默认 |
| C. 双周 / 季度 | 看你团队节奏 |

### 10.8 能力面：MVP vs. follow-up（开放）

§8 列出的 12 项能力是清单，不是项目 commit。是否要把它们分成"MVP must / follow-up"（以及怎么分）是开放决策。

研究阶段草拟的拆分（文档早期版本中提出，**当前未采纳**）是：

| 层 | 能力项 |
|---|---|
| 研究阶段草稿 "MVP must" | #1（冷启）/ #2（agent preset）/ #3（hook listener）/ #9（bump 脚本）/ #10（license）/ #12（CI）|
| 研究阶段草稿 "follow-up" | #4（5 命令）/ #5（4 MCP）/ #6（Team Mode + web）/ #7（hashline）/ #8（e2e smoke）/ #11（8 doc）|

该拆分**不是**项目决策；用户未做选择。如果/当项目 MVP 范围被定义时，决策权在用户。

---

## 11. 社区现状调研（2026-08-16 截屏）

**核心结论**：在 2026-08-16 截屏，**没有任何公开项目在"把 OMO 移植到 DSH"**。我们是先发者。

### 11.1 没有直接竞品

| 查询内容 | 结果 |
|---|---|
| `"oh-my-openagent" "deepseek-harness" OR "dsh"` 全文搜索 | **0 个相关项目** |
| GitHub repo 搜索 `topic:deepseek-harness + topic:oh-my-openagent` | **0 个相关 repo** |
| `npm search oh-my-opendsh` | 0 结果 |
| OMO 仓库 issue 搜索 `dsh OR deepseek` | 命中 #3788（"添加 DeepSeek V4 模型配置"，仅 model 路由，不涉及 DSH 框架）|

### 11.2 OMO 官方对"新 harness adapter"的官方表态

- **README 顶部**（`code-yeongyu/oh-my-openagent`）："Multi-Harness Agent OS Refactor in Progress ... we are restructuring the codebase to support multiple agent harnesses (OpenCode, Codex, Pi, Claude Code, and others)"。**官方明确欢迎新 adapter。**
- **ROADMAP**（"Multi-Harness Support (Exploratory)" 节）：已落地 `omo-opencode` / `omo-codex` / `omo-senpi` / `pi-goal` / `pi-webfetch` 5 个 adapter。"We are skeptical of this abstraction"——但**反对的是"过度抽象"**，不是"新 adapter 本身"。每个 adapter 独立写是被鼓励的。
- **贡献指南**：明确写了"Adding a New Agent / Hook / Tool / MCP Server"的模板，但**没有"Adding a New Harness Adapter"模板**。可以推断：OMO 期待新 adapter 由外部独立仓库实现，**不需要在 OMO 仓库内改动**。
- **CONTRIBUTING.md 提到**：Harness-specific glue 是独立包（`omo-opencode/` / `omo-codex/` / `omo-senpi/` 都是平级 package）。我们 `omo-dsh` 完全契合这个模式。

### 11.3 间接证据：DSH 社区"自下而上"已经在爆发

DSH 8月13日发布后 3 天内（截至 8月16日）：

| 现象 | 证据 |
|---|---|
| **爆炸式增长** | GitHub 1.5 小时破 24k star（破 Grok-1 记录），3 天接近 95k star |
| **UI 皮肤在第一个周末出现** | `github.com/Small-tailqwq/dsh-deep-whale` 等换皮肤包 |
| **换工具层** | 多个开发者把默认 tool 换成多模态版本 |
| **换主循环** | "Agent 怎么运行的、下一步做什么、什么时候调用工具，全都自己手搓了"（@卡尔 评测原文）—— 48 小时内已有人这么做 |
| **官方文档承认"一切皆插件"是核心设计** | 230+ workspace package，6 天从 0 到 2.4 万到 9.5 万 star 的曲线表明 DSH 社区**比 OMO 当年更早期就接受了"插件化"心智** |

**对我们的含义**：DSH 是个**对第三方扩展友好的宿主**。我们发布 scratch plugin 后，DSH 社区很可能直接看到、试、给反馈——**首月就有真实用户**的概率比 OMO 早期更高。

### 11.4 相关项目（非直接竞品，但值得研究）

| 项目 | 做什么 | 与我们的关系 |
|---|---|---|
| **`oh-my-pi`**（11.1k stars） | Pi 的 fork，专门解决"harness problem"（编辑工具不稳定）—— 用了 hashline 机制，OMO 后来借鉴了 | **思路印证**——hashline 这个核心创新 OMO 已经做出来，我们可以直接 import 用；不需要重复发明 |
| **`superpowers`**（126k stars） | 跨平台 Agent skill 系统（Claude Code / Cursor / Codex / OpenCode / Gemini CLI） | **方向印证**——证明"跨 harness 共享 skill / hook 概念"是有用户需求的 |
| **`codeagents`**（wenshao 个人收集） | 收录各种 AI Agent 工具的对比 + 文档 | **间接对比**——他们已经写了 OMO 的 analysis（确认我们调研的版本和数据对得上）|
| **`omo-senpi`**（OMO 自家） | OMO 的"独立 / native" 发行版（`npm i -g omo-ai@beta`） | **OMO 在 multi-harness 路上已经踩坑**——senpi 适配器最近 issue #6794 报告"omo senpi edition cannot resolve opencode omo config"—— config schema 兼容性问题。**这正好是 §10 要避免的坑** |

### 11.5 OMO 维护者的"反过度抽象"哲学（关键约束）

从 OMO ROADMAP：
> "The industry changes too fast. Fixed patterns and agreed conventions should be implemented directly. Uncertain parts should not be over-abstracted. If an adapter for a new harness is needed, an agent can write it in one shot."

**对 adapter 含义**：
- ✅ **要做的**：写一个独立 `omo-dsh` adapter（独立仓库 + 独立命名 + 不在 OMO 仓库里改代码）
- ❌ **不要做的**：不要在 OMO 仓库里提 PR 试图"加一个 DSH adapter 模板 / 抽象层 / 共享代码"——会被维护者以"反过度抽象"为由拒绝
- ❌ **不要做的**：不要在 OMO Discord 提议"做 DSH 支持"——会被引导到"你自己写一个"的标准答案

### 11.6 关键观察及其含义（无任何行动 commit）

> 早期版本"Action"列把研究观察和项目 commit 混在一起。本版把每行"Action"改为"Implication"——描述观察对读者的含义，不是"该做什么"。

| 观察 | 含义（无决策）|
|---|---|
| **本快照日（2026-08-16）没有直接竞品** | 如果项目进行，first-mover 机会存在。**这里不对"是否抓住该机会"、"发布时间表"、"卡位姿态"做决策。**|
| **OMO README 头部写 "Multi-Harness Agent OS Refactor in Progress ... we are restructuring the codebase to support multiple agent harnesses"** | 项目（如果建）会是"用户侧 adapter"，不是给 OMO 上游做贡献。**用户已确认的"不给外部 PR"决策**记录在决策文档 D5；本行不重新派生它。|
| **OMO 维护者的公开哲学："The industry changes too fast. Fixed patterns and agreed conventions should be implemented directly. Uncertain parts should not be over-abstracted. If an adapter for a new harness is needed, an agent can write it in one shot."** | 如果建项目，建"DSH 通用 adapter 框架"（在多个假想 adapter 上做可复用抽象）会与该哲学冲突。研究阶段分析偏好一个具体 `omo-dsh` 实例，不是一个 framework。**这里不对"建一个还是多个"做决策**；项目实际范围是开放维度。|
| **DSH 社区早期 3 天 95k star** | 表明 DSH 侧工具需求可能存在。项目的实际目标人群（如果建）是开放维度（见 §10 与决策文档开放项）。|
| **omo-senpi 踩过 config schema 兼容性的坑（issue #6794）** | 如果建项目，验证 `omo-config-core` schema 在 DSH 事件流下的兼容性是候选早期项。**这里不排优先级或 commit。**|
| **oh-my-pi（11.1k star）实现了 hashline edit** | hashline 概念源头在 OMO 之上。如果发布 hashline 包装，§7.2 要求署名。署名已决策：尊重原作者、完整署名（2026-08-19，见决策文档 D10）；具体措辞在实施时定。|

### 11.6.1 开放跟进项（不在本调研范围）

以下**不在本调研内**，但作为候选跟进项标记——如果/当项目进行时可考虑：

- OMO Discord `#building-in-public` 频道——可能讨论过 "DSH adapter"，但 GitHub issues 看不到
- DSH 官方 Discord / 微信群、Reddit r/LocalLLaMA、Hacker News——早期社区反应
- DSH 的采纳高峰是可持续的还是短期 fomo

**不为这些项排优先级或时间表**；如果推进，应属于未来的研究回合，不在本报告范围。

### 11.7 调研局限（不能下的结论）

- 我没找到 OMO Discord 内部的讨论（Discord 抓取困难），可能有人在 Discord 提过"做 DSH 版"但 GitHub issues 上没有
- 我没找到微信群 / 中文社区的讨论（可能 GitHub 之外的论坛有人提过）
- DSH 发布 3 天太短，无法判断"DSH 社区是否长期繁荣"还是"fomo 短期高峰"

---

## 12. 调研结论：DSH 是否能做到像 OMO 那样给不同 sub-agent 路由不同 LLM？

**日期**：2026-08-19
**状态**：调研结论（非实施计划）。回答一个具体问题，揭示 OMO 默默吸收、但 DSH 没有提供的一项隐藏成本。

### 12.1 问题

DSH 框架原生是否支持"给不同 sub-agent 路由不同 LLM 提供商/模型"——和 OMO 那套一样（例如 `sisyphus` 用 `claude-opus-5`、`hephaestus` 用 `gpt-5.6-sol`、`librarian`/`explore` 用 `gpt-5.6-luna-fast` / `deepseek-v4-flash`）？换句话说，OMO 移植项目是否需要新增基础设施，还是这已经是 DSH 的一等公民能力？

### 12.2 结论（一句话）

**能。DSH 按精确的 `{provider, model}` 路由 LLM，每个 sub-agent 都能携带自己的 `agentOptions: { provider?, model?, maxTokens? }` 来覆盖父 agent 继承来的 LLM。无需新增任何 DSH 基础设施。** OMO 风格的"每个 agent 一条 model 链"在 DSH 里对应"每个 `tool-subagent` 实例的 config"或每次 `agent()` 调用的参数。

### 12.3 证据链

#### 12.3.1 DSH 的路由以 `{provider, model}` 为 key，不是单 model

- `packages/core/agent/src/runtime-types.ts:24-31` — `AgentOptions` 是 per-agent 创建选项；`provider?` 和 `model?` 是一等字段，带 merge-extensible 语义。
- `packages/core/agent/src/runtime-types.ts:64-68` — 每个 `Agent` 都带 `readonly options: AgentOptions`；注释是 "The provider route and model this agent's requests use."
- `.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.md:17` — `LlmAdapter.resolveModel(provider, model, signal?)` 解析一条精确路由；同一 model id 可存在于多个 provider 下。
- `.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.md:27-29` — compact-basic 可以持有按 `{provider, model}` 精确对 key 的 `modelPolicies` map，每条路由独立 ratio / retention / summarizer 覆盖。该架构是**有意设计**的，"全局一个 context window" 不再是必要假设。

#### 12.3.2 Sub-agent 的 model 在启动时可被覆盖

- `packages/subagent/subagent-in-process-driver/README.md:19`（直接引用）—"The child gets the parent's working-directory/session lineage and **inherits the parent provider, model, and output-token cap unless `request.agentOptions` overrides them**."
- `packages/subagent/subagent/src/types.ts` + `docs/subsystems/subagent.md:283` — continuable child 的 `SubagentDescriptorData` 会 snapshot 已解析的 `agentOptions.provider` / `model`，cold resume 时能重建同一 LLM 目标。
- `packages/subagent/subagent-in-process-driver/README.md:18-20` — depth / policy 的继承也都被 gate；覆盖不是继承层之上的 hack，而是显式开关。

#### 12.3.3 三个已落地的"暴露点"（model 覆盖能写在哪些地方）

| 暴露点 | 谁来配置 | 文件 | 用途 |
|---|---|---|---|
| **`tool-subagent` plugin config** | Preset / `cordis.yml` 作者 | `packages/subagent/tool-subagent/README.md`（Config 表，`agentOptions` 行） | 一个 `dsh-tool-subagent` 实例 = 一个固定的 `{provider, model}`。挂四个不同 config 的实例 = 四个 sub-agent LLM 目标 |
| **`tool-workflow` 的 `agent(prompt, opts?)` 调用** | Workflow 脚本作者 | `packages/workflow/tool-workflow/src/index.ts:143`；runtime 校验在 `workflow-worker-thread/src/runtime.ts:371-373` | `agent('task', { provider: 'openai', model: 'gpt-x' })` — 独立 `provider` / `model` 覆盖；其他字段（`effort` / `isolation` / `agentType`）直接拒绝 |
| **`api-proxy` 顶层选择** | Web UI 用户 | `packages/host/apiproxy/src/api-proxy.ts:1081-1084`；注入逻辑在 `packages/core/agent/src/model-selection.ts:39-75` | `defaultModelSelection()` 给顶层 agent 一个 seed；UI 切换经 `installModelSelection()` 投影到 `system-prompt/assemble` 和 `agent/request` 两个 waterfall |

前两条是 scratch plugin 真正会用到的路径。第三条已经为顶层 session 存在，sub-agent 端不需要重新发明。

#### 12.3.4 OMO 的机制（对比参考）

- `packages/model-core/AGENTS.md:27-37` — 6 步 resolution pipeline：UI override → user-config override → category default → user fallback chain → 硬编码 `AGENT_MODEL_REQUIREMENTS` → system default。
- `packages/model-core/src/agent-model-requirements.ts:3-30` — 11 个 agent，每个一条有序 fallback chain。`sisyphus` 开 `claude-opus-5`（variant: max）和 `kimi-k3`；`hephaestus` 开 `gpt-5.6-sol`（medium）；`librarian` / `explore` 开 `gpt-5.6-luna-fast`（low）和 `deepseek-v4-flash`（max）；等等。
- `packages/model-core/src/model-resolution-pipeline.ts:1-274` — runtime selector；跨 provider 对 `ProviderCache` 注入的 `availableModels` 做 fuzzy match。

OMO 在"静态 `{provider, model}` 表格"之上多做的事是：(a) **多步 fallback**（目标 provider 挂了 → 静默轮换到 chain 下一项）；(b) **对 `availableModels` 的 fuzzy match**（用户输入"gpt-5.6"，系统找到连上的那条）；(c) **category 分组**（一处编辑即可把"research"类整体换 model）。DSH 这三件都没有为 sub-agent 配套。

### 12.4 落到我们 patch 框架的"三种绑定形态"

"这个 sub-agent 用哪个 LLM" 在 DSH 侧变成"如何把 `agentOptions` 绑到 sub-agent 类型上"。三种绑定形态，在 DSH 0.1.0-rc.5 下都合规：

| 绑定形态 | model 写在哪里 | DSH 升级时成本 |
|---|---|---|
| **A. 静态 plugin config** | 在 `agent.cordis.yml` 里，每个 `dsh-tool-subagent` 实例有自己的 `agentOptions: { provider, model }`。四个实例 = 四个 LLM 目标 | 0 — `agentOptions` 在 `core/agent`，属于文档化的 seam |
| **B. 脚本时覆盖** | workflow 脚本里，主 agent 运行时决定：`agent(prompt, { provider, model })`。model 编进 system prompt 或 persona | 0 — `tool-workflow` 已经接受 |
| **C. settings 驱动（用户可编辑）**（后续） | `settings.yaml` 里加 `subagents.research.model: ...`；我们 plugin 读它、构造 `agentOptions`、通过自定义 tool wrapper 注入 | 仅 plugin 内部改动；DSH 不动 |

A + B 覆盖 OMO 静态 `AGENT_MODEL_REQUIREMENTS` 全部用例。C 仅当用户需要"不重启 plugin 就能换 sub-agent LLM"时才需要。

### 12.5 风险与一项 OMO 默默吸收的隐藏成本

| 风险 | 影响 | 缓解 |
|---|---|---|
| **DSH 没有 fallback chain** | model 在 provider 上不可用时，DSH 抛 `LlmError('model-unavailable')`（见 `packages/host/apiproxy/src/api/rpc.ts:36`），sub-agent run 以 `stopReason: 'error'` 结束。不会静默轮换。 | 想要 OMO 那种"try next"，就在 plugin 里包一层薄 retry：捕获 `model-unavailable`，按配置 fallback 列表重新发请求。**这是 OMO 默认给你、DSH 没给你的那一块**。估算 30–80 行 / plugin 实例 |
| **同一 provider name 只能注册一个 adapter** | `packages/llm/llm/src/index.ts:380` — 重复注册抛 `DUPLICATE_ADAPTER`。不能为不同 sub-agent 临时换 adapter；只能复用同一 route 名字 | 我们要做的只是换 `{provider, model}` 对（指向同一 adapter），不是换 adapter。**除非未来需求是"sub-agent 用不同 HTTP endpoint"**（不在 MVP 范围） |
| **Tool schema 对 `dsh-tool-subagent` 一个实例是固定的** | 同一个 tool 实例收到的所有调用 schema 都一样（`run_in_background` / `persona` / `toolFilter` ...），不随 LLM 变化 | 小模型若跟不动长 schema，可以为它 fork schema，或挂多个 schema 较短的实例。MVP 不需要 |
| **Token meter 故意不感知 model** | `packages/llm/token-meter/` 故意没有 per-model 配置（见 `routed-model-context-and-compaction-policy.md:21-23`）。容量和 policy 在 LLM adapter 里 | 这是架构特性不是风险 — context window per `{provider, model}` 已被正确处理 |
| **同名 model 在不同 provider 下字符串不同** | 同一逻辑 model 在 OpenAI / Anthropic / Vercel / opencode 下 `model` 字符串不同 | plugin config 绑定的是一个具体的 `(provider, model)` 对，config 时刻定；跨 provider 轮换需要单独 config |

### 12.6 不在本调研范围

以下问题**未**在本调研内展开。省略是对"调研作者选择问什么"的取舍，不是把这些项目级拒为"非目标"。

- **OMO 的 6 步 resolution pipeline**（`override → category → user fallback → hardcoded chain → system default`）。成本（5–10 天）和对内部使用工具不明确的收益参与了该取舍；OMO 维护者的"反过度抽象"立场（§11.5）也相关。
- **OMO 的 `ProviderCache`**（`model-core/AGENTS.md:41-44`——"ProviderCache is injected, not imported"）。DSH 的 adapter registry 已是等价物；未进一步调研。
- **OMO 的 fuzzy model matcher**（`packages/model-core/src/model-availability.ts`）。`pi-ai` adapter 已接受动态 model id；静态 config 可写精确名；未进一步调研。

### 12.7 调研局限

- DSH 仍在 0.1.0-rc.5；`agentOptions.provider` / `agentOptions.model` 字段属于 merge-extensible `AgentOptions` 接口，将来可能改名。§10.2 列出 DSH pin 策略的候选选项；上述成本估算均假设选了 A（pin minor `0.1.x`）——该选项已于 2026-08-19 确认为项目决策（见决策文档 D7）。
- `tool-subagent` 的 Config 表是读英文 README 拿的；中文版可能额外记载了字段。本调研结论不依赖这些字段。
- 我没有针对 DSH 0.1.0-rc.5 实际 checkout 写 runtime 测试；证据来自读 `workflow-worker-thread.spec.ts:211-235` 和 `tool-subagent.spec.ts` 的现有 fixture，它们已经覆盖 `agentOptions` 覆盖路径。建议 MVP sign-off 前在我们自己的 plugin 下做一次冒烟测试，但**不阻塞本调研结论**。

---

## 13. 调研结论：OMO 设计"主 agent 调 sub-agent"时的 prompt 机制？以及如何让 sub-agent 不跑偏（含"对抗审查"角度）

**日期**：2026-08-19
**状态**：调研结论（非实施计划）。这是 §12 的自然延伸——既然 DSH 能给 sub-agent 路由不同 LLM，下一个问题就是：**OMO 究竟给那个 sub-agent 发了什么 prompt？怎么让 sub-agent 不跑偏？**（也顺便回答非正式的"对抗审查"问题。）

### 13.1 问题

当 OMO 编排器（如 `sisyphus`）决定调一个 sub-agent（`librarian` / `hephaestus` / `category=deep` task）时，**实际送到那个 sub-agent LLM 的 prompt 是什么**？具体：
1. 调用形态长什么样（子 agent 看到哪些 tool、注入了什么 `system` 内容、什么 generation params）？
2. OMO 怎么让子 agent **做**该做的事、**不做**不该做的事——包括软性的"对抗规避"属性（子 agent 想偷工、或与父 agent 意图相悖）？
3. OMO 怎么**防**子 agent 输出回写污染父 agent（深度限制、输出脱敏等）？

### 13.2 结论（一句话）

OMO 在**三个同心圈**上控 sub-agent：**（1）`task` / `call_omo_agent` 的 tool description 控父 agent**；**（2）system prompt + category prompt append 控子 agent**（由 `dynamic-agent-prompt-builder.ts` 和 `prompt-builder.ts` 组装）；**（3）generation params + tool allow/deny + 深度限制 + 输出脱敏约束子 agent**。"对抗规避"不是一个单独的 guard，是**11 个正交机制**叠加——任意一个被攻破，整体还有 10 个兜底。

### 13.3 两条调起链路（父 agent 端）

OMO 把"调 sub-agent"这件事拆成**两个 tool**，不是同一个 tool。拆开的理由很能说明问题。

#### 13.3.1 `task(...)` — 通用委派 tool

- 实现：`packages/omo-opencode/src/tools/delegate-task/`
- 两种执行模式：
  - **Background**（`run_in_background=true`）— `BackgroundManager.launch()` → 异步 poll → 通知父。用于 `explore` / `librarian` / 并行工作
  - **Sync**（`run_in_background=false`）— 建 session → 发 prompt → poll 到 idle → 返回结果。用于顺序工作、要立即拿答案
- tool 自身被强约束：`task` 的 tool description（`tool-description.ts:39-79`）写得**像合同**——告诉父 LLM"你 MUST 给 category OR subagent_type"，配 `❌ FAILS` vs `✅ CORRECT` 例子，末尾"**Prompts MUST be in English**"。这个 description 是父 agent 那一侧的第一道防线。

#### 13.3.2 `call_omo_agent(...)` — 仅研究类 fast path

- 实现：`packages/omo-opencode/src/tools/call-omo-agent/`
- 该 tool **故意只允许 `["explore", "librarian"]`**（`constants.ts:1-4`）：
  ```ts
  export const ALLOWED_AGENTS = ["explore", "librarian"] as const
  ```
  描述（`constants.ts:6-13`）直接说："Other built-in agents, custom agents, and task categories are intentionally not supported by this tool."
- 为什么要拆出来？两个理由，都体现 OMO 的"对抗规避"本能：
  - **schema 更小更尖**——LLM 调错研究类 sub-agent 的概率大幅降低，因为这个 tool 根本不暴露 `category` 或非研究类 agent
  - **更小的 prompt injection 攻击面**——`call_omo_agent` 这条线下的 sub-agent 树深度只有 1-2 层（`explore` 不调 `task`）；`task` 是会递归的

这个拆分就是 OMO "不只是在 stitch prompt，而是在 narrow affordance" 的第一个信号。

### 13.4 子 agent 实际收到什么（组装链）

"父 LLM 调了 tool" → "子 LLM 看到 prompt" 完整路径：

```
父 LLM
  └─ 调 `task(category="deep", prompt="...", load_skills=[...], run_in_background=false)`
       └─ delegate-task/tools.ts:130-222  （入口：校验 args、解析 model、构造 systemContent）
            ├─ category-resolver.ts       （"deep" → DelegatedModelConfig + fallbackChain）
            ├─ subagent-resolver.ts       （"explore" → subagent + model）
            ├─ skill-resolver.ts          （["git", "codegraph"] → 加载的 skill 内容）
            └─ prompt-builder.ts          （组装 systemContent）
                 ├─ token-limiter.ts      （优先级截断：skills → categoryAppend → agentsContext）
                 └─ sync-prompt-sender.ts （POST 到 OpenCode session.prompt）
                      └─ body: { agent, system, tools, parts, model, variant, ... }
                           └─ 子 LLM run
```

#### 13.4.1 子 agent system prompt 的四块拼图

`prompt-builder.ts:57-93` + `token-limiter.ts:51-122` —— 子 agent 的 `system` 字段，按优先级：

| # | 段 | 来源 | 溢出时丢弃顺序 |
|---|---|---|---|
| 1 | `agentsContext`（plan agent 时也叫 `planAgentPrepend`） | `dynamic-agent-prompt-builder.ts` | **第 3 丢（最后丢）** |
| 2 | `skillContents[]`（`load_skills[]` 里每个 skill） | `skill-resolver.ts` | **第 1 丢** |
| 3 | `categoryPromptAppend`（按 category，例如 `DEEP_CATEGORY_PROMPT_APPEND_GPT_5_5`） | `delegate-task/openai-categories.ts` 等 | **第 2 丢** |

拼接：`joinSystemParts([agentsContext, ...skillParts, categoryPromptAppend])`，分隔符 `\n\n`（`token-limiter.ts:32-39`）。

#### 13.4.2 子 agent *user* prompt 的四块拼图

`sync-prompt-sender.ts:103-121` + `prompt-builder.ts:95-101`：

| 字段 | 内容 | 机制 |
|---|---|---|
| `parts[0]` | 父 agent 写的原始 `args.prompt`（verbatim，带 `createInternalAgentTextPart` 标记） | 透传 |
| `parts[0]` 追加（仅 plan agent） | `buildTaskPromptAppend(...)` —— `tddEnabled` 时加 TDD 一行 | `prompt-builder.ts:95-101` |
| `system` | §13.4.1 组装的 system content | §13.4.1 |
| `tools` | allow/deny 映射 — 见 §13.5.1 | `sync-prompt-sender.ts:53-70` |
| `model` / `variant` | 从 `category-resolver` 解出的 model + variant | §12.3.4 |
| `temperature` / `topP` / `maxOutputTokens` | 从 `categoryModel` 取 | `sync-prompt-sender.ts:25-41` |
| `reasoningEffort` / `thinking` | 从 `categoryModel.reasoning` 取 | `sync-prompt-sender.ts:30-34` |

`createInternalAgentTextPart` 这个标记很重要：它让 OMO 在后处理子 transcript 时能区分"这段是 parent 发的" vs "这段是 child 说的"——用于 §13.6.3 的输出脱敏。

#### 13.4.3 Generation params 也是契约的一部分

子 agent 没权力自己选 temperature。`buildPromptGenerationParams(model)` 写死 `{ temperature, topP, maxOutputTokens, options: { reasoningEffort, thinking } }` 的 map，从 category config 来。**`deep` task 跑的 temperature 和 `quick` 不一样**——category 同时是 prompt 又是 sampler。

### 13.5 让子 agent 留在正轨的 11 个正交机制

这是问题核心。OMO 没有单一的"反规避" guard。它有 11 个机制，**组合**才能让子 agent 难被带偏。

#### 13.5.1 子 agent 的 tool allow/deny

`buildSyncPromptTools(agentToUse, permission)`（`sync-prompt-sender.ts:53-70`）：

```ts
return {
  task: isPlanFamily(agentToUse),   // 仅 plan 系 agent
  call_omo_agent: true,             // 仅研究类
  question: false,                  // 子 agent 不能反问用户
  ...userDenied,                    // category config 里 deny 的
  ...getAgentToolRestrictions(agentToUse),  // agent 自己的白名单
}
```

三件值得注意：
- `question: false` —— **子 agent 不能向用户问澄清问题**。子 agent 迷茫时必须合理假设并继续。这是个故意的设计选择（`DEEP_CATEGORY_PROMPT_APPEND`："Do not ask clarifying questions - the goal is already defined"）
- `task: isPlanFamily(...)` —— 只有 `plan` 系 agent 能再调 `task`。这在编排方向上 cap 了 sub-agent 嵌套；§13.6.1 的 depth limit 在**层数**上 cap
- `getAgentToolRestrictions(agentToUse)` —— 每个 agent 自己的 allow/deny map（`explore` 不能 `bash`，`oracle` 不能编辑文件）。**子 agent 物理上跑不了它不该跑的 tool**

#### 13.5.2 Hard Blocks (NEVER violate)

`buildHardBlocksSection()`（`dynamic-agent-policy-sections.ts:7-20`）—— 拼到每个子 agent 的 system prompt 头部：

```
## Hard Blocks (NEVER violate)

- Type error suppression (`as any`, `@ts-ignore`) - **Never**
- Commit without explicit request - **Never**
- Speculate about unread code - **Never**
- Leave code in broken state after failures - **Never**
- `background_cancel(all=true)` - **Never.** Always cancel individually by taskId.
- Delivering final answer before collecting Oracle result - **Never.**
```

这不是软建议。`## Hard Blocks (NEVER violate)` 模式 + 每行 `- **Never**` 后缀，是 LLM 侧的 `// eslint-disable-next-line` 级规则。

#### 13.5.3 Anti-Patterns (BLOCKING violations)

`buildAntiPatternsSection()`（`dynamic-agent-policy-sections.ts:22-37`）—— 同样在头部：

```
## Anti-Patterns (BLOCKING violations)

- **Type Safety**: `as any`, `@ts-ignore`, `@ts-expect-error`
- **Error Handling**: Empty catch blocks `catch(e) {}`
- **Testing**: Deleting failing tests to "pass"
- **Search**: Firing agents for single-line typos or obvious syntax errors
- **Debugging**: Shotgun debugging, random changes
- **Background Tasks**: Polling `background_output` on running tasks
- **Delegation Duplication**: Delegating exploration to explore/librarian and then manually doing the same search yourself
- **Oracle**: Delivering answer without collecting Oracle results
```

注意措辞梯度："Hard Blocks"用 **Never**（二元）；"Anti-Patterns"用 **BLOCKING**（略软但仍硬）。**这种措辞梯度是有意的 LLM 训练小把戏**：二元词模型更容易 pattern match。

#### 13.5.4 Category 专用 prompt append（这是大头）

每个 category 都有自己的 `promptAppend` 字符串，定义在：
- `delegate-task/openai-categories.ts`（OpenAI 类）
- `delegate-task/anthropic-categories.ts`（Anthropic 类）
- `delegate-task/google-categories.ts`（Google 类）
- `delegate-task/kimi-categories.ts`（Kimi 类）

**不是一行小注。是 30–200 行结构化 prompt block**。两个最激进的例子：

**`VISUAL_CATEGORY_PROMPT_APPEND`**（`google-categories.ts`）：整个 prompt 包在 `<DESIGN_SYSTEM_WORKFLOW_MANDATE>` 里，分**四个 phase**，每个 phase 有 "**PHASE 1: ANALYZE THE DESIGN SYSTEM (MANDATORY FIRST ACTION)**" + 子 agent 必须回答的 checklist + "BEFORE reporting visual work as complete, answer these: [ ]" 验证清单。失败模式明说："YOUR FAILURE MODE: You skip design system analysis and jump straight to writing components... The result is INCONSISTENT GARBAGE... THIS STOPS NOW."

**`DEEP_CATEGORY_PROMPT_APPEND_GPT_5_5`**（`openai-categories.ts`）：同一个 `deep` category 的另一个 prompt，但为 GPT 5.5/5.6 调优——加显式 framing：*"This is the category reserved for goal-oriented autonomous work on hairy problems that reward thorough exploration..."*，列命名 sub-mode：*Exploration budget: generous*、*Goal, not plan*、*Atomic task treatment*、*Root cause bias*、*Ambition scaled to context*、*Completion bar: full delivery*、*Status cadence: sparse*。**Category 本质上是子 agent 的"角色卡"**。

`resolveDeepCategoryPromptAppend(model)`（`openai-categories.ts:67-71`）按 model 分派到模型特定变体——明显说明 OMO 把 category 当成 **model-specific persona**，不是 model-agnostic。

#### 13.5.5 Caller_Warning — 告诉子 agent 你跑在什么模型上

很多 category 在 prompt 里 append 一个 `<Caller_Warning>` block，**告诉子 LLM 你是哪个模型在执行它**。`QUICK_CATEGORY_PROMPT_APPEND`（`openai-categories.ts`）的例子：

```
<Caller_Warning>
THIS CATEGORY USES A SMALLER/FASTER MODEL (gpt-5.6-luna-fast).

The model executing this task is optimized for speed over depth. Your prompt MUST be:

**EXHAUSTIVELY EXPLICIT** - Leave NOTHING to interpretation:
1. MUST DO: List every required action as atomic, numbered steps
2. MUST NOT DO: Explicitly forbid likely mistakes and deviations
3. EXPECTED OUTPUT: Describe exact success criteria with concrete examples
```

这是个迷人的 trick：OMO 不在抽象层"给小模型设计好 prompt"，而是**告诉子 agent 你就是小模型**，让它**自己 meta-reason** 怎么写自己的 prompt。子 agent 知道"今天我必须比平时更显式"。

#### 13.5.6 Selection_Gate — 防止 category 偷懒

`UNSPECIFIED_HIGH_CATEGORY_PROMPT_APPEND`（`anthropic-categories.ts:3-16`）有一个 `<Selection_Gate>`：

```
BEFORE selecting this category, VERIFY ALL conditions:
1. Task does NOT fit: quick (trivial), visual-engineering (UI), ultrabrain (deep logic), artistry (creative), writing (docs)
2. Task requires substantial effort across multiple systems/modules
3. Changes have broad impact or require careful coordination
4. NOT just "complex" - must be genuinely unclassifiable AND high-effort

If task fits ANY other category, DO NOT select unspecified-high.
```

这是个 category 级 *prior*。子 agent 被告知："别偷懒选 catch-all，选具体的。"

#### 13.5.7 Plan-agent `<system>` 信封 + `<CRITICAL_REQUIREMENT_*>` 块

`PLAN_AGENT_SYSTEM_PREPEND_STATIC_BEFORE_SKILLS`（`constants.ts:21-197`）是 OMO 最激进的 prompt block。它包在 `<system>...</system>` 里（LLM 厂商承认的高优先级区），含：

- 一个 `<system>` block 带 **MANDATORY CONTEXT GATHERING PROTOCOL**，**自己**就调 sub-agent（`call_omo_agent(..., run_in_background=true, prompt="...")`）——告诉子 agent 在做任何事之前先发 tool call
- 一个 `<CRITICAL_REQUIREMENT_DEPENDENCY_PARALLEL_EXECUTION_CATEGORY_SKILLS>` block —— 全宽 `#` 字符墙、ASCII art `REQUIRED` 横幅、**四个强制输出 section** + 例子 markdown 表格
- 一个 `<DELIVERABLE_ENVELOPE>` block —— 整个 plan 输出必须包在 `<plan>...</plan>` 标签里，规则："Emit EXACTLY ONE <plan> ... </plan> block, and only in your FINAL message. ... Anything emitted outside the envelope may be discarded."

`<plan>` 信封是 plan-agent 和父 agent 之间的契约：父 agent verbatim 抽出 plan，忽略其余。**这就是 OMO 在子 agent 啰嗦十段"thinking aloud"时还能 survive 的方式**。

#### 13.5.8 Markdown 输出模板（预格式化、可复制粘贴）

`PLAN_AGENT_SYSTEM_PREPEND_STATIC_BEFORE_SKILLS`（行 200–264）结尾是一个完整格式化的 markdown TODO 模板：

```markdown
## TODO List (ADD THESE)
> CALLER: Add these TODOs using TodoWrite/TaskCreate and execute by wave.

### Wave 1 (Start Immediately - No Dependencies)
- [ ] **1. [Task Title]**
  - What: [Clear implementation steps]
  - Depends: None
  - Blocks: [Tasks that depend on this]
  - Category: `category-name`
  - Skills: [`skill-1`, `skill-2`]
  - QA: [How to verify completion - specific command or check]
```

子 agent 复制模板，填占位符，父 LLM 就能机械解析。**这是 OMO 最接近"agent 之间 DSL"的东西**。

#### 13.5.9 "WHY THIS MATTERS" — 抗长上下文漂移的语义论证

`PLAN_AGENT_SYSTEM_PREPEND_STATIC_BEFORE_SKILLS` 里每个强制 section 末尾都有一行 `WHY THIS MATTER(S|FORM IS MANDATORY):`。例：
- *"WHY THIS MATTERS: Executors need to know execution ORDER. Prevents blocked work from starting prematurely. Identifies critical path for project timeline."*
- *"WHY THIS FORMAT IS MANDATORY: Caller can directly copy TODO items. Wave grouping enables parallel execution. Each task has clear task parameters. QA criteria ensure verifiable completion."*

这不是 hand-waving。~10k tokens 的 system prompt 之后，LLM 开始从 working memory 丢低优先级指令。**"WHY" 给规则一个"理由"——理由比规则本身更难丢**。

#### 13.5.10 Mode 特定的 prompt 变体

agent 级别 `MODE`（`agents/AGENTS.md:104-114`）：
- `primary` — 尊重用户在 UI 选的 model（sisyphus, hephaestus, atlas, prometheus）
- `subagent` — 用自己的 fallback chain，忽略 UI 选择（oracle, librarian, explore, multimodal-looker, metis, momus, sisyphus-junior）

`subagent` mode 的子 agent 拿到更紧、更独立的 persona prompt；`primary` mode 的子 agent 是"面对用户"的 persona。**同一个 agent 名在不同 mode 下 prompt 不同**。

#### 13.5.11 Retry-guidance hook —— 父 agent *自己* 的自我纠正

`hooks/delegate-task-retry/hook.ts:7-22` 订阅 `tool.execute.after` for `task` tool。如果子 agent 输出含 9 个错误模式之一（`delegate-core/src/retry-patterns.ts:7-57`），OMO **在父 agent 下一条消息末尾 append 一条纠正提示**：

```
[task CALL FAILED - IMMEDIATE RETRY REQUIRED]

**Error Type**: missing_run_in_background
**Fix**: Add run_in_background=false (for delegation) or run_in_background=true (for parallel exploration)

**Action**: Retry task NOW with corrected parameters.

Example of CORRECT call:
task(
  description="Task description",
  prompt="Detailed prompt...",
  category="unspecified-low",  // OR subagent_type="explore"
  run_in_background=false,
  load_skills=[]
)
```

**这是 OMO 在 in-band 教父 agent 正确用 tool**。9 个模式正是父 LLM 最容易踩的坑。

### 13.6 防御机制（contain blast radius）

即使有 §13.5 全部 prompt shaping，OMO 也知道子 agent 还会跑偏。所以它在调用周围放了一圈 perimeter。

#### 13.6.1 Sub-agent 深度上限

`background_task.maxDepth=3` 是默认。`delegate-task/sync-task.test.ts:1069`：

```
"Subagent spawn blocked: child depth 4 exceeds background_task.maxDepth=3. Parent session: parent. Root session: root. Continue in an existing subagent session instead of spawning another."
```

depth 4 的子 agent 想再 spawn 一个，会被 hard error 顶回去。**Worst case 是 sub-agent 不能递归启动自己**。

#### 13.6.2 Callable agent 白名单

`call_omo_agent` 的 `ALLOWED_AGENTS = ["explore", "librarian"]`（constants.ts:1-4）在 `tools.ts:160-170` 强制执行——非法 agent 类型返回**字面 error 字符串**，不是软 fail。子 agent 想调自己或调非研究类 agent，在 tool 层就被挡住。

#### 13.6.3 输出脱敏（防跨 session 污染）

`features/background-agent/manager.ts:445-466` —— background task **归档**时，`prompt` 字段被替换为 `"[redacted]"` 再持久化。这防的是：
- 子 agent 的 prompt 被另一个 session 用同一 task id 读回去
- 子 agent 在自己 session 后续轮次里看到自己早先的 prompt、被它二次影响
- telemetry / log export 不小心把子 agent 内容泄露到比父 agent 更宽的表面

"归档时脱敏，创建时不脱敏"的时序是故意的：run 期间 prompt 还要用；run 完就缩成占位符。

#### 13.6.4 内部 agent tag 剥离

`stripInvisibleAgentCharacters(agentToUse)`（`shared/agent-display-names.ts`）在每个 agent 名送进子 agent 前调用。**零宽空格**和类似不可见字符被剥掉。**这是防 category / agent 名 prompt injection 的小但真防御**：恶意或粗心的 `category="\u200Blibrarian"` 不能蒙混过字符串相等检查。

#### 13.6.5 子 agent error → 父 agent 可读化

`error-formatting.ts` + `sync-prompt-sender.ts:138-153` 的 `formatDetailedError` 调用——把子侧的 error（"agent.name undefined"）转换成**父 LLM 可读**的错误消息，带完整上下文（operation, args, sessionID, agent, category）。父 LLM 看到的是结构化 error，不是 stack trace。

### 13.7 风险 + OMO 没防的一处

| 表面 | 防御了吗 | 怎么防的 |
|---|---|---|
| 子 agent 在 *内容* 上跑偏 | 部分 | §13.5.2–13.5.4（Hard Blocks / Anti-Patterns / category append） |
| 子 agent 偷懒选"catch-all" category | 是 | §13.5.6（Selection_Gate） |
| 子 agent 反问用户 | 是（hard block） | §13.5.1（`question: false`） |
| 子 agent 递归 spawn sub-sub-agent | 是（hard cap） | §13.6.1（maxDepth） |
| 子 agent 在 `call_omo_agent` 里调非研究类 | 是（allow-list） | §13.6.2 |
| 子 agent 的 prompt 跨 session 泄露 | 是（archive 脱敏） | §13.6.3 |
| 子 agent agent 名夹带不可见字符 | 是（strip） | §13.6.4 |
| 子 agent 给父 agent 返回 error | 是（结构化 format） | §13.6.5 |
| **子 agent 的 `prompt` 字段含 prompt-injection 内容，*父 agent* 稍后会读回去** | **否**——`args.prompt` 从父到子是 verbatim 透传（`sync-prompt-sender.ts:109`），无脱敏 | 见 §13.7.1 |
| **子 agent 输出污染父 agent 后续轮** | **弱**——只有 envelope 提取（`<plan>...</plan>`）能限制父 agent 怎么 act on | 见 §13.7.2 |

#### 13.7.1 `args.prompt` 的信任边界

`createInternalAgentTextPart(effectivePrompt)`（`sync-prompt-sender.ts:109`）把父的 prompt 标记为 `text` part + 内部 marker。子 agent 的输出是独立的 `assistant` turn。**没有 text/assistant 跨污染 guard**。唯一隔离是 OpenCode 的 session 边界本身：每个 `task` 调起拿一个独立 session。

**这在父 agent 是 trusted 的前提下没问题**（即父是 `sisyphus` 跑在非 adversarial 控制的模型上）。如果父 LLM 本身被攻击（比如 `bash` / `webfetch` 的 tool result 含注入指令），父可以造一个 `prompt` 把指令注入到子。OMO 两个方向都不脱敏。

**对我们的启示**：如果我们让 orchestrator 把用户控制的文本（如 chat 里的 `@mention`）送进子 agent 的 `prompt`，需要 sanitization。OMO 没有是因为它假设父是 trusted 内部 LLM。

#### 13.7.2 `<plan>` 信封是单向 extract，不是 sanitization

`PLAN_AGENT_SYSTEM_PREPEND_STATIC_BEFORE_SKILLS` 告诉 plan-agent 把输出包在 `<plan>...</plan>`。**父 agent 然后 *抽* 出 envelope 内容**。但：
- 父 LLM 在自己的 context window 里**还是能看到**子 agent 整个 response
- 只有"parser 侧"（读 `<plan>` 的）拿到安全子集
- 如果父 LLM 自己就是消费者（不是 parser），父还是看到未剥的输出

**Envelope 是 *通信契约*，不是 *安全边界***。

### 13.8 对 oh-my-opendsh 移植的启示

| OMO 机制 | DSH 对应 | 自己造的成本 |
|---|---|---|
| `task` tool + 严格 description | `dsh-tool-subagent`（已经有 `agentOptions`） | 0 — DSH tool description 是 plain JSON，我们只写一个长 `description` 字段 |
| `call_omo_agent` 独立 tool + allow-list | 挂**第二个** `dsh-tool-subagent` 实例，description 更窄、不允许嵌套调 task | 1 行 cordis.yml |
| `buildSystemContent`（组装 system prompt） | 写一个薄 builder：`[planPrepend, ...skills, categoryAppend].join("\n\n")` | ~50 行 TS |
| `token-limiter.ts`（优先级截断） | 同一个 builder，copy 优先级顺序 | ~80 行 TS（在 `delegate-task/` 已有，可 re-export） |
| `buildHardBlocksSection` / `buildAntiPatternsSection` | 一个 `patches/omo-dsh/system-sections/hard-blocks.md` 文件，运行时加载 | 0 行 — 只是 markdown |
| `CATEGORY_PROMPT_APPENDS`（per-category persona） | 每个 category 一个 `patches/omo-dsh/system-sections/category-*.md`，按 category 名加载 | ~10 个小 markdown 文件 |
| `planAgentPrepend`（`<system>` 信封 + `<CRITICAL_REQUIREMENT_*>` + `<DELIVERABLE_ENVELOPE>`） | 一个 `patches/omo-dsh/system-sections/plan-prepend.md` | 1 个 markdown 文件（~200 行） |
| Per-agent tool allow/deny | DSH `toolFilter` 字段在 `dsh-tool-subagent` config —— per-instance 声明 | 0 行 — 纯 config |
| Sub-agent depth cap | DSH `ctx.subagent` 已经有 `policy.maxDepth`；verify 并透传 | ~10 行 TS |
| Archive 时输出脱敏 | DSH `ctx.compaction` 是最近的 seam；我们 hook 进去 | ~30 行 TS |
| `retry-guidance` hook | DSH 有类似 `tool.execute.after` waterfall；写 9-pattern regex + `formatRetryGuidance` | ~60 行 TS |
| `createInternalAgentTextPart`（标记父文本） | DSH `part.role` 已经区分 user/assistant parts；OMO 的 marker 也许不需要 | 0 |
| 模型特定 prompt 变体（`resolveDeepCategoryPromptAppend`） | `patches/omo-dsh/system-sections/category-deep.gpt5.md` vs `category-deep.default.md` —— 文件命名约定，运行时按 `agentOptions.model` 选 | ~5 个小 markdown 文件 |
| Generation params（temperature, topP, maxOutputTokens）per category | `agentOptions` 已有 `maxTokens`；扩展它 via 小 DSH listener 或 via `model` route | ~10 行 TS 或一个小 listener |

**净结果**：prompt 控制面积**以 markdown 为主，不是代码**。"我们要写的代码" 总计约 250–400 行 TS glue + 10–20 个 markdown 文件（大多从 OMO 复制，在 `THIRD_PARTY_NOTICES.md` 里加 `oh-my-opendsh` 归属 per §7.2 / §7.4）。

#### 13.8.1 不该移植的东西

- **6 步 model resolution pipeline**（§12.6 已定 — 不在 scope）
- **`ProviderCache` / fuzzy model matcher**（§12.6 已定 — 不在 scope）
- **PostHog telemetry / Anthropic context-window recovery / claude-code-compat-core**：这些是 OMO 的 Claude Code 兼容层，不是 prompt 控制核心。除非我们要 Claude Code parity，否则不在 scope

### 13.9 不在本调研范围

以下**未**在本调研内展开。省略是对"调研作者选择问什么"的取舍，不是把这些项目级拒为"非目标"。

- **Persona prompt 运行时变更**。OMO 不在 session 中途改 persona prompt；该机制是否需要/可行未调研。（DSH `subagent.continuable` 是跨 session 延续机制；进一步调研应从那里起）
- **跨 session prompt 延续**。OMO sub-agent 是 session 隔离的；session 级 prompt 拼接的设计未调研
- **不可信父 agent 下的对抗鲁棒性**。OMO 假设父是 trusted；对 `args.prompt` 的对抗硬化未调研
- **按 category 分 token budget**。OMO 的 `FREE_OR_LOCAL_PROMPT_TOKEN_LIMIT = 24000` 是单一 hard cap；按 category 分 token budget 未调研

### 13.10 调研局限

- 我没有对任何 prompt 跑过 live LLM 测试。证据来自读源码和 test fixtures。生产里的行为取决于 LLM 实际是否尊重 framing；不同模型对 `<system>` block、`<CRITICAL_REQUIREMENT_*>` 横幅、`<plan>` 信封的 compliance 不同。OMO 自己的 README / Discord 经验证据是：Anthropic 和 OpenAI top-tier 模型 first-try compliance >95%；小 / local 模型（Kimi K3, GPT-5.6-luna-fast）更飘
- 我没有穷举 8 个内置 category 的 prompt append——读了 `openai-categories.ts`（变体最多：`ultrabrain`, `deep`, `quick`, `writing` 等）、`anthropic-categories.ts`（只 `unspecified-high`）、部分 `google-categories.ts`（visual + artistry）。`google-categories.ts` 另外 2 个 + `kimi-categories.ts` 3 个没读完。**机制层面的结论不受影响**；per-category 措辞需要单独读
- 我没读 `omo-codex` / `omo-senpi` 的等价机制——OMO 多 adapter 家族。如果 OMO 在那些 adapter 里有**额外** prompt 控制机制（比如 Codex 特定 framing），这里没捕到。可以延后到 §10.1 的 "omo-codex / omo-senpi" 升级问题变 real 时再做
- `dynamic-agent-prompt-builder.ts` 还有比 `dynamic-agent-prompt-builder.ts` barrel 6 个 re-export 更多的 section（`agent-identity`, `mode`, `restrictions`, `citation`, `verification`, `anti-patterns`, `tool categorization`, `category-skills guide`）。我完整读了 policy-sections 部分，没读 core-sections。**"11 个机制"枚举对此稳健**——我读的是最 policy-heavy、最与"反规避"相关的

---

## 14. 调研结论：OMO 怎么确保 agent teams 正确运行？有哪些自动化测试方法？

**日期**：2026-08-19
**状态**：调研结论（非实施计划）。在 §12（LLM 路由）和 §13（prompt 控制）之后的自然延伸：*给定一个复杂的多 agent 系统，怎么实际证明它能工作？*

### 14.1 问题

OMO 是 5万+ LOC 代码库，编排 11 个 agent、30+ hooks、5 个 MCP、Team Mode 并行协作、continuous Ultrawork drive。自然担心：这么多动件 + 这么多 LLM-driven 行为，OMO **怎么验证 agent teams 真的正确运行**？用了什么 *自动化* 测试方法？尤其是：*"lead 正确把工作交给 member、member 正确回应、inbox 正确送达、agent 崩溃后能 resume"* 这类问题，怎么变成一个 *无人在环、无 $200/月 LLM 账单* 就能跑的测试？

### 14.2 结论（一句话）

OMO 用一个 **4 层测试金字塔**——**（1）单元测试**（983 个 `.test.ts` 文件，3万+ 断言，`bun test`，3 OS 矩阵）；**（2）mock-provider 驱动的 e2e 测试**（`packages/omo-senpi/scripts/qa/` 下 31 个文件，剧本式 LLM 按顺序发 tool call，观察跨进程 side effect）；**（3）`omo doctor` 自检**（46 个 check 跑在用户机器上，验环境 + model resolution + team mode 依赖）；**（4）真模型 "Sisyphus agent" e2e**（维护者手动触发的工作流，跑真 OMO plugin + 真 Anthropic API，catch prompt drift）。中间这一层——**剧本驱动的 mock LLM provider，把观察写到共享目录**——是 DSH 端没有现成对等物、且最值得我们复刻的那一块。

### 14.3 4 层测试金字塔

| 层 | 在哪儿 | 何时跑 | 成本 | catch 什么 |
|---|---|---|---|---|
| **L1 单元** | monorepo 全量 `bun test` | 每个 PR，3 OS 矩阵（Linux, macOS, Windows × 2 shard） | 免费，~30 min wall | 逻辑 bug、类型错误、内部模块集成 |
| **L2 mock-provider e2e** | `packages/omo-senpi/scripts/qa/*.test.ts` + `*.mjs` | 同 CI 跑，独立 job | 免费，~5–15 min 每个 scenario | tool call 时序、跨进程状态转换、crash recovery、plan-gating、model fallback |
| **L3 doctor 自检** | `omo doctor` CLI | 用户 opt-in（或 pre-MVP gate） | 免费，30s | 环境变量、缺失依赖（tmux、git）、model resolution 破损、config schema 漂移、telemetry 接线 |
| **L4 真模型 e2e** | `.github/workflows/sisyphus-agent.yml` | 维护者手动触发（`@sisyphus-dev-ai`） | ~$1–5 / 次 | prompt 漂移、LLM 侧 instruction-following、UX 回归 |

**其中 L2 是最 novel、最相关于 oh-my-opendsh 的**。L1 谁都有；L3 谁都应该有（我们会建）；L4 太贵不能 gate。L2 是让 OMO 能有信心 ship 19 包多 agent 系统的关键——"agent-to-agent 互动真的能跑"。

#### 14.3.1 L1 单元 —— 983 个测试文件，三种命名风格

仓库 grep 结果：
- `find . -name "*.test.ts" | wc -l` → **983**（2026-08-19 截屏）
- `packages/team-core/src/**.test.ts` → **28**（mailbox, registry, state-store, tasklist, layout-tmux）
- `packages/omo-opencode/src/features/background-agent/manager.test.ts` → **8774 行，238 个 test**（一个文件，核心调度器）

最常见的测试风格是 `#given ... #when ... #then` BDD 字符串 + `describe/test`（`background-agent/manager.test.ts`）：
```ts
describe("invokeTmuxSessionCreatedCallback", () => {
  test("#given enabled tmux callback inside tmux #when invoked #then forwards the child session", async () => { ... })
})
```
BDD 字符串在 `bun test --filter` 输出和任何 agent-driven 调试里都显眼。不是严格必要，但**统一的风格是 983 个文件能 navigate 的关键**。

还有更小的 `.mjs` 测试集（用于 scripts / QA driver）和 `.test.mjs`（`node --test` 风格、非 Bun 专属的 smoke test）。

#### 14.3.2 L2 mock-provider e2e —— 真正的核心

`packages/omo-senpi/scripts/qa/` 含 **31 个 e2e harness**：

```
team-e2e.mjs                    ← 顶层 driver
team-e2e-runtime.mjs            ← process lifecycle
team-e2e-process.mjs            ← process 监控
team-e2e-analysis.mjs           ← 结果分析
team-e2e-support.mjs            ← 共享 helpers
team-e2e-scripts.mjs            ← mock 剧本（LEAD_SCRIPT, DURA_REVIVE_SCRIPT, ...）
team-e2e-crash.mjs              ← crash recovery 场景
team-e2e-mock-provider.ts       ← THE mock LLM（按 MOCKROLE per-script 分支）
fallback-architect-e2e.mjs      ← 5 个 fallback 场景（A-E）
fallback-architect-mock-provider.ts
plan-gated-agents-e2e.mjs       ← plan-gate（denial / read-unlock / sequence）
no-todo-continuity-e2e.mjs      ← 跨 session 连续性
curated-agents-e2e.mjs          ← curated agent roster
curated-agents-e2e-mock-provider.ts
curated-agents-e2e-scenarios.mjs
curated-agents-e2e-analysis.mjs
lsp-e2e.mjs                     ← LSP 集成
memory-e2e.mjs                  ← memory 系统
memory-model-fallback-e2e.mjs
memory-skill-startup-e2e.mjs
ast-grep-mcp-e2e.mjs            ← AST-grep MCP
task-e2e-mock-provider.ts       ← 通用 task mock
task-rpc-e2e-mock-provider.ts
task-runtime-fallback-mock-provider.ts
task-id-race-mock-provider.mjs
task-resume-e2e-mock-provider.ts
facts-backlog-e2e-mock-provider.ts
task-category-unavailable-mock-provider.ts
variant-thinking-mock-provider.ts
mock-completions-server.mjs     ← OpenAI 兼容 SSE server（test bed）
mock-provider/                  ← index.ts：原始 mock provider base
drive.mjs                       ← createSandbox / seedSandbox / credentialDigest
team-e2e-runtime.test.ts        ← bun test 包装的 .mjs
team-e2e-support.test.ts
```

**31 个共同的 pattern**：一个 `*-e2e.mjs`（或 `.ts`）是 **scenario driver**，用 `*-mock-provider.{ts,mjs}` 给真 OMO plugin 喂剧本化的 LLM 响应，然后读 observable side effect（沙箱里的文件、transcript JSONL、inbox 目录计数）并断言业务结果。

### 14.4 mock-provider 模式到底怎么工作

这是核心机制。mock provider 是 **一个真 HTTP server 讲 OpenAI Completions 协议**，但不是从 model 生成文本——而是 **按剧本顺序回放 tool call 和 text 输出**。

#### 14.4.1 剧本语言（5 种 step 类型）

来自 `packages/omo-senpi/scripts/qa/mock-provider/index.ts:30-36` 和 `team-e2e-mock-provider.ts:40-45`：

```ts
type MockStep =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; arguments: Record<string, unknown>; id?: string }
  | { type: "hang" }                        // 永不返回；保持 turn 存活
  | { type: "wait_for_liveness" }           // block 直到 team-member-liveness 事件
```

一个剧本是 `Record<string, MockStep[]>` —— **role 名 → 有序 step** 的映射。mock provider 用 system prompt 里的 `MOCKROLE=<role>` 标记来选哪个 key：

```ts
// team-e2e-mock-provider.ts:111-113
["MOCKROLE=quick", "quick"],
["MOCKROLE=fixture", "fixture"],
["MOCKROLE=dura", "dura"],
```

所以 **一个 scenario 文件描述整个 team 的行为**，按 role 拆分到子剧本。

#### 14.4.2 一个具体例子 —— `LEAD_SCRIPT`（team-e2e-scripts.mjs:15-36）

```js
export const LEAD_SCRIPT = {
  lead: [
    toolCall("team_create", {
      team_name: "stale-named-team",
      inline_spec: {
        name: "e2eteam",
        members: [
          { name: "quick",   kind: "category",      category: "quick",   prompt: QUICK_PROMPT },
          { name: "fixture", kind: "subagent_type", subagent_type: "fixture", prompt: FIXTURE_PROMPT },
        ],
      },
    }),
    toolCall("task_send", { team_run_id: "__TEAM_RUN_ID__", to: "quick", message: "LEAD2QUICK injected handshake: report QUICK2LEAD after this arrives" }),
    toolCall("task_list", { team_run_id: "__TEAM_RUN_ID__" }),
  ],
  quick: [
    text("quick initial turn ended; waiting for an injected lead message"),
    toolCall("task_send", { to: "lead", message: "QUICK2LEAD member report delivered by injection" }),
    { type: "hang" },
  ],
  fixture: [text("fixture member acknowledged")],
}
```

这文件 *就是* 测试。读它就懂：
1. **Lead** 调 `team_create`（2 个成员：quick + fixture）
2. **Lead** `task_send` 给 `quick` 一条特定握手消息
3. **Lead** `task_list`（查状态）
4. **Quick** ack + `task_send` 回 `lead`（"QUICK2LEAD" 消息）
5. **Quick** hang（让 turn 保持存活，便于观察异步事件）
6. **Fixture** 只 ack

`__TEAM_RUN_ID__` 占位符由 mock 在运行时从 live message thread 解析（见 `team-e2e-mock-provider.ts:4-6` docstring）。mock *不是* 静态 replayer；它 interpolate 真实 run-time 标识，让静态剧本能寻址到 OMO plugin 实际创建的 team。

#### 14.4.3 两个非平凡的 primitive：`hang` 和 `wait_for_liveness`

`{ type: "hang" }` 是 *异步 primitive*。mock 把 SSE stream 挂着不发 `stop` 事件。**这是关键的**因为：
- OMO mailbox poller 是 **1 秒 tick**（`team-e2e-scripts.mjs:68-70` 注释）
- ack scanner 只在 *注入的 envelope 落到 session JSONL tool boundary 之后* 才 commit
- 没有 `hang`，剧本跑完、test process 退出，async observation 还没发生

`{ type: "wait_for_liveness" }` 是 *handshake primitive*。mock 订阅真实 OMO 事件（`senpi-task.team-member-liveness`，见 `team-e2e-mock-provider.ts:394-400`），只在该事件 fire 后才进入下一步。这让 test 能 *证明* liveness 事件真的 fire，不只是假设。

#### 14.4.4 观察通道 —— 共享目录里的文件

mock 写到目录，driver 从同一目录读。测试本质上是 **两个进程共享一个文件系统**，LLM call 作为同步点。从 `team-e2e-analysis.mjs:38-49`：

```ts
export function injectionEvidence(cwd, runId, quickTask, leadMessage, obsDir) {
  const leadReceipt = join(obsDir, "lead-received.txt")
  return {
    runId,
    quickTask,
    leadMessage,
    memberEnvelopeEchoed:
      quickTask !== undefined
      && leadMessage !== undefined
      && sessionContainsText(cwd, quickTask, leadMessage),
    memberToLeadInjected:
      existsSync(leadReceipt)
      && readFileSync(leadReceipt, "utf8").includes("QUICK2LEAD"),
    leadInbox: runId === undefined
      ? { unread: 0, reserved: 0, processed: 0 }
      : inboxCounts(memberInboxDir(cwd, runId, "lead")),
  }
}
```

这是断言层。test driver *不 scrape transcript*。它查 **两件事**：
- **文件存在 + 子串**（`lead-received.txt` 含 `"QUICK2LEAD"`）—— 证明 child 写了 receipt 文件，**只在注入 round-trip 完成后**才写
- **目录计数**（`inboxCounts` 返回 `{unread, reserved, processed}`）—— 证明 lead 的 inbox 真的被排空，不只是"看起来空"

这是 *业务规则* 断言：*"lead 成功把消息注入 member，member 成功回报"？* ——不是 *"LLM 调了 `task_send`"*。两者差别巨大。

#### 14.4.5 Verdict

从 `team-e2e-analysis.mjs:61-62`：
```ts
export function verdict(checks) {
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return { result: failed.length === 0 ? "PASS" : "FAIL", failed }
}
```

每个 e2e driver 返回 `{ result: "PASS" | "FAIL" | "SKIP", scenarios: [...] }` 作为 **stdout JSON**。CI 解析。`--self-test` 模式（`fallback-architect-e2e.mjs:300`）在 spawn 进程 *之前* 先跑分析自身，捕获分析 bug 先于贵的那段。

### 14.5 沙箱与 credential 隔离

不隔离，e2e 会污染开发者的真 OMO install。OMO 的 `drive.mjs`（`packages/omo-senpi/scripts/qa/drive.mjs:66-89`）：

```ts
export function createSandbox() {
  const root = mkdtempSync(join(tmpdir(), "omo-senpi-qa-"))
  const cwd = join(root, "project")
  const agentDir = join(root, "agent")
  const xdgConfigHome = join(root, "xdg")
  const homeDir = join(root, "home")
  return { root, cwd, agentDir, xdgConfigHome, homeDir, canonicalCwd: ... }
}
```

加 `scenarioEnv()`（`no-todo-continuity-e2e.mjs:21-31`）：
```ts
return {
  ...process.env,
  HOME: home, USERPROFILE: home,
  XDG_CONFIG_HOME: sandbox.xdgConfigHome,
  SENPI_CODING_AGENT_DIR: sandbox.agentDir,
  SENPI_CODING_AGENT_SESSION_DIR: sessionDir,
  PI_CODING_AGENT_DIR: sandbox.agentDir,
  PI_CODING_AGENT_SESSION_DIR: sessionDir,
  OMO_SENPI_QA: "1",
}
```

**关键洞察**：OMO 用 **沙箱化 HOME / XDG_CONFIG_HOME / agent dir**（via env vars），让 test process 读写 tmpdir，不动开发者的 `~/.senpi/agent`。

但这还不够。OMO e2e driver 还做 **基于 digest 的 credential 检查**（`plan-gated-agents-e2e.mjs:43-67`）：
```ts
const CREDENTIAL_FILES = ["auth.json", "models.json", "settings.json", "trust.json"]
export function isolationDigest(agentDir) {
  const hash = createHash("sha256")
  for (const name of CREDENTIAL_FILES) { ... }
  ...
}
```
test 必须跑 before-and-after `isolationDigest(realSenpiAgentDir)`。**真**的 `~/.senpi/agent/auth.json` 等等若变了字节，test **失败**——即使 scenario 本身 PASS。**这 catch 的是最差那类 test pollution**：env override 配错、悄悄摸到真 agent dir。

`HOST_VOLATILE_SETTINGS_KEYS = ["workflow-skills", "tipsHistory", "skills"]`（`plan-gated-agents-e2e.mjs:21`）—— OMO 知道开发者的交互 TUI 持续写 *自己的* `settings.json`（`tipsHistory` 等），所以白名单这些 key 为"这种 churn 不是 test 干的"。**聪明**：不这么做，test 在开发者 TUI 里每打一次字就 flake。

### 14.6 `omo doctor` —— 46 个自检

`packages/omo-opencode/src/cli/doctor/checks/` 含 **46 个 check 文件**。doctor 是 4 层中**唯一在生产跑**的那个——装在用户机器上、装 OMO 时验环境无 sanity。

选出的 check（从 `index.ts` 注册表）：

| Check | 验什么 | 为何重要 |
|---|---|---|
| `system` | `opencode --version`、plugin version、bun version、config path 有效性 | 装错版本先在这里 catch |
| `config` | `validatePluginConfig` 对 `omo-config-core` schema | catch `omo.json` 拼写错 |
| `model-resolution`（6 个子 check） | cache state、fallback chain、variant、types、details、effective model | catch "我加了 model 到 config，但 OMO 找不到" |
| `team-mode` | `tmux` + `git` binary 在 PATH，`team_mode.base_dir` 存在或可创建 | catch "team mode 静默 no-op，因为缺 tmux" |
| `tools-lsp` / `tools-mcp` / `tools-gh` | 各 tool 的 CLI 可调 | catch 半装的依赖 |
| `telemetry` | telemetry 接线对 | catch telemetry 端破损 |
| `codex`（4 个子 check） | codex plugin 表面、components、runtime wrapper | catch senpi-codex plumbing 破损 |
| `deprecated-reasoning-keys` | `omo.json` 不用老的 `reasoning: { effort: "low" }` 形状 | 迁移提示 |
| `legacy-config-leftovers` | 没有 `omo-cache` / `omo-preferences` legacy 文件 | 清理提示 |

doctor 是单 CLI：`omo doctor`（或开发期 `bun run packages/omo-opencode/src/cli/doctor/index.ts`）。每个 check 返回 `{ status: "pass" | "fail" | "warn" | "skip", message, issues[] }`。runner（`runner.ts:43-49`）算汇总，**有 fail 则 exit code 1** ——所以 doctor 也能当 CI gate（`omo doctor --json`）。

`checkTeamMode` 例子（`team-mode.ts:11-31`）很说明问题：
```ts
const teamModeConfig = TeamModeConfigSchema.parse(config.team_mode ?? {})
if (!teamModeConfig.enabled) {
  return { name: ..., status: "skip", message: "team_mode: disabled", issues: [] }
}
const deps = await checkTeamModeDependencies(teamModeConfig)
const baseDir = resolveBaseDir(teamModeConfig)
...
return {
  status: deps.tmuxAvailable && deps.gitAvailable ? "pass" : "warn",
  message: `team_mode: enabled | tmux: ... | git: ... | declared: ${teamCount} | runtime dirs: ${runtimeCount}`,
  issues: [],
}
```
注意 4-state status：`pass` / `fail` / `warn` / `skip`。**`skip` 是一等公民状态**——doctor 不会对跑不上的 check 撒谎（比如 team mode 禁用）。这是微妙但重要的 UX 选：意味着 "FAIL count = N" 是有意义的，但 "PASS count = M" 不是（"这 check 是跑了还是 skip？"）。

### 14.7 L4 —— 真模型 Sisyphus agent

`.github/workflows/sisyphus-agent.yml` 是 **手动触发的工作流**：
1. 装真 OpenCode + OMO plugin（来自工作树）
2. 从 repo secret 配 Anthropic API key
3. spawn 真 `opencode` session + 真 prompt
4. 让 Sisyphus（OMO 顶层编排器）真跑一个多 agent 任务
5. 抓日志

触发条件（`sisyphus-agent.yml:14-22`）特意收窄：
```yaml
on:
  workflow_dispatch: ...
  issue_comment:
    types: [created]
```
job condition 是 `contains(comment.body, '@sisyphus-dev-ai')` ——只 ping bot 的 comment 触发。这是 **维护者工具，不是 per-PR gate**。每次 ~$1–$5 API + 5–15 min wall。L4 是 *实际 prompt compliance 被验证* 的那一层——L1–L3 catch 不了 LLM 静默忽略的 prompt。

sisyphus-agent.yml 有注释 *"Only issue_comment works for fork PRs (secrets available)"* ——OMO 知道 fork PR 不能用 `pull_request` 触发（secret 受限），所以用 comment 触发让 bot-callable e2e 对外部贡献者也工作。

### 14.8 我们能复用 / 不能复用的部分

| OMO 测试机制 | oh-my-opendsh 能复用吗 | 移植成本 |
|---|---|---|
| `bun test` for unit | **能**——`bun` 跨平台；DSH 自己用 `vitest`，但 **patch framework 的** test 可以 bun-native | 0 |
| `*.test.ts` BDD 字符串 | **能**——命名约定，不是库 | 0 |
| Mock-provider `MockStep` + 剧本化响应 | **能，要适配**——DSH 没现成 mock LLM server，但能建一个 ~200 LoC、说 OpenAI 兼容 HTTP 的（因为 DSH LLM 用类似 adapter） | ~200 LoC TS + 1 个 mock server skeleton |
| Per-scenario driver（`*-e2e.mjs`） | **能**——pattern 与 framework 无关；我们 copy `drive.mjs`（sandbox helpers）逐字，适配 OMO 特定位 | ~150 LoC TS per scenario |
| `observation-files` 断言 pattern | **能，要适配**——DSH `subagent` 包写自己的 session JSONL；我们读那个，而不是 OMO 的 `~/.senpi/agent/sessions/.../chat.jsonl` | 0 —— 同 pattern、不同路径 |
| `inboxCounts` / `memberInboxDir` | **不能**——OMO 特定（用 `senpi-task` 目录布局） | 我们用 DSH `ctx.subagent` mailbox 等价物 |
| `credentialDigest` 隔离 | **适配**——DSH config dir 在 `~/.config/dsh/` 或类似（DSH 特定）；我们把 `~/.senpi/agent` 替换成那个路径。digest-and-compare 逻辑能复用 | ~30 LoC TS |
| `omo doctor`（L3） | **能，我们要建**——DSH 没 `doctor` CLI；我们要 ship 一个。46 个 check 大多 OMO 特定，但 ~5 个（system, config, model-resolution, team-mode, tools）直接适用 | ~500–800 LoC TS for 我们自己的 doctor 含相关子集 |
| 真模型 e2e（L4） | **能，但 MVP 后**——Sisyphus pattern 能复用；成本是"$5/月 API 预算 + 一个维护者愿意跑" | 0 LoC，但持续 API 成本 |
| `tty-driver.py`（PTY fork for 交互式 launch） | **也许**——如果 ship 交互式 `oh-my-opendsh` install，会需要。DSH 自己没 PTY install，用例是假设的 | ~80 LoC Python（可以直接搬 OMO 的；是个通用工具） |

**净：pattern 能复用；路径和 OMO 特定断言不能**。"OMO 是 OMO，oh-my-opendsh 是 oh-my-opendsh" 这条原则保持——我们不需要 clone OMO 的 test corpus，只需要 *shape* of OMO's testing strategy。

### 14.9 不在本调研范围

以下**未**在本调研内展开。省略是对"调研作者选择问什么"的取舍，不是把这些项目级拒为"非目标"。

- **对抗 / 红队测 LLM 输出**。OMO 也不做；L1–L4 是 positive-only。§13.5 的"反规避"机制由 L2（mock-provider 证明 prompt 真的 *发了*）验证，不是对抗变异 LLM 行为。如果要 red-team 覆盖，那是 *separate from* 这套金字塔
- **性能 regression gate**。OMO 在 CI 不 benchmark。sub-agent 调度延迟 *没* 在任何地方断言。最接近的是 `team-e2e-process.mjs`（process liveness，不是 perf）
- **属性测试**（fast-check / property tests）。OMO 只用 example-based。19 包 × 单元，example-based 足够；LLM 才是随机源，不是 SUT
- **Web UI 视觉回归**。`web-ci.yml` 跑 format + lint + typecheck + build 对 `packages/web`，但不跑 visual diff。Web UI 通过 `doctor`（TUI 子 check）和人工 review 测

### 14.10 调研局限

- 我没读完 31 个 e2e harness。读了 `team-e2e.mjs` + `team-e2e-runtime.test.ts` + `team-e2e-analysis.mjs` + `team-e2e-scripts.mjs` + `team-e2e-support.mjs` + `team-e2e-mock-provider.ts` + `fallback-architect-e2e.mjs` + `fallback-architect-mock-provider.ts` + `no-todo-continuity-e2e.mjs` + `plan-gated-agents-e2e.mjs` + `curated-agents-e2e.mjs` + `drive.mjs`。其余 19 个（大多 `*-e2e-mock-provider.ts` 和 `task-*-e2e-*.mjs`）假设跟同 pattern。**机制**结论对此稳健；具体 scenario 需要 per-file 读
- 我没跑任何 e2e harness。证据来自读源码和 test fixture。CI matrix（`.github/workflows/ci.yml` + `codex-compatibility` job）才是真正 exercise 它们的地方；上面 snapshot 是 CI *会* 跑的内容
- `omo doctor` 注册表（`checks/index.ts`）完整读了；46 个 check 文件 skim（system, config, model-resolution, team-mode, tools, telemetry, codex, deprecated-reasoning-keys）。其余 ~38 个 check（MCP server, LSP daemon 等）本文未刻画
- Sisyphus e2e（`.github/workflows/sisyphus-agent.yml`）从 workflow YAML 和维护者文档化意图总结；没审实际的 Anthropic API prompt payload 或 success criteria
- `tty-driver.py`（PTY helper）完整读了；周围的 `launcher.test.ts` 和 `setup-detect.test.ts` 是 OMO-native 特定，DSH 端 scratch plugin 不直接适用
- 31 个 e2e harness 文件是 `packages/omo-senpi/scripts/qa/` 里 match `e2e` / `mock-provider` pattern 的文件数。**实际不同 scenario 数**更少（有些是 helper 或 analysis）。没枚举 1-to-1 mapping
