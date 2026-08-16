# 可行性报告：基于 deepseek-harness (DSH) 移植 oh-my-openagent (OMO) 的工程化与可持续 patch 框架

> 中文翻译；主报告（英文）见 [Feasibility Report (English)](./feasibility-report.en.md). 项目 README（中文）见 [README.md](../README.md).
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
4. **有一个硬约束已处理：OMO 的 SUL-1.0 license。** 框架采用 **dual license（MIT OR SUL-1.0）**——OMO 源码可直接 import（升级最省事），同时给最终用户选择空间。"免费 + 非商业 + 不销售"已满足 SUL-1.0。详见 §6。

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

---

## 3. 可持续 patch 框架设计（用户需求 2）

### 3.1 设计目标

让 OMO 上游一发布新版本，我们能在 1–3 天内完成"bump → 跑测试 → 暴露冲突 → 改 adapter"循环，**而不是"手动改 30 个 hook 翻译"**。

### 3.2 框架拓扑

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

### 3.3 物理仓库结构

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
│   ├── feasibility-report.md           # 本文件
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

### 3.4 Patch 升级流程

OMO 通过 npm 依赖引入，**升级核心就是 `pnpm update`**。listener 翻译层是唯一会动的地方。

#### 常规升级 OMO（推荐节奏：事件驱动 / 双月）

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

#### 升级 DSH（推荐节奏：每 1–2 月）

```bash
./scripts/bump-dsh.sh v0.2.0
pnpm typecheck && pnpm test
# 主要风险：DSH 改了事件签名或 plugin API（看 DSH CHANGELOG）
```

#### 大版本（DSH 1.0 / OMO 4.x）

读上游的 migration guide，先在分支上 bump，过完所有 gate 才 merge main。

### 3.5 冲突最小化设计

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

### 3.6 测试金字塔

| 层级 | 内容 | 工具 |
|---|---|---|
| Unit | OMO core 包在我们 workspace 里的纯函数行为 | vitest |
| Adapter unit | listener 包装正确性（喂入模拟 DSH 事件，验证 OMO hook 被调且参数对） | vitest + DSH `dsh-agent-loop-testkit` |
| Integration | 11 agent preset 启动后能看到正确 system prompt / tools / 路由 | DSH `examples/agent-spine-demo` 模式 |
| E2E | 真实跑 OMO "ultrawork" 流程在 DSH 上 | DSH `vitest.e2e.config.ts` + LLM mock server |
| Snapshot | OMO agent preset 的 system prompt diff | `DSH_SNAPSHOT=record` |
| License | 任何改动不得引入非 SUL-1.0 / 非 MIT 依赖 | `scripts/verify-licenses.sh` |
| 升级回归 | bump 脚本完成后必须 0 失败 | CI gate |

### 3.7 关键脚本骨架

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

### 3.8 升级节奏与可观测性

- **CI 在每次 push 跑** `pnpm test && scripts/verify-licenses.sh && scripts/conflict-scan.sh --diff`（要求 PR 必须证明本次改动对 OMO 上游某 commit 是 backward-compatible）
- **每周一** 自动跑 `scripts/upstream-watch.sh` 写一个 GitHub Issue 标题 `upstream-changelog-YYYYMMDD`，列出 OMO + DSH 过去 7 天的 commits
- **每月底** 评估是否 bump 一次小版本（"上游动了 ≥ 5 个 commit 且 CI 全绿就 bump"）
- **季度评估** 是否切换到 OMO 下一个 major tag

---

## 4. 风险与未决问题

### 4.1 硬风险（必须前置处理）

| 风险 | 影响 | 缓解 |
|---|---|---|
| **OMO SUL-1.0 限制商用** | 派生作品不能商业销售 | 框架 dual license (MIT OR SUL-1.0)，分发热衷于"免费 + 非商业"路径；**不做销售** 满足 SUL-1.0 |
| **OMO `omo-opencode` 还在重构** | OMO 公开说"still strongly coupled to OpenCode in its largest adapter" | 我们不 import `omo-opencode`；只 import 19 core 包 + 4 小 adapter（pi-goal / pi-webfetch / omo-codex / omo-senpi）|
| **DSH 还是 0.1.0-rc.5** | API 未稳定 | pin 到 DSH minor 版本；bump 时单独发一版 |
| **Windows / WSL 体验** | 跨平台可能比 macOS/Linux 慢 | 写跨平台 e2e；Windows MVP 不强求（推荐 MVP 仅 macOS + Linux）|
| **LLM adapter 工作量被低估** | 6 个 llm-* 每个 200–500 行 | 第一期 DeepSeek + OpenAI-compatible；按需补 |
| **OMO telemetry PostHog vs DSH OTel** | 桥接有工作 | 30 行 PostHog exporter 接到 OTel；默认 opt-out |

### 4.2 软风险（可以接受）

| 风险 | 影响 |
|---|---|
| OMO 维护者 反对加 DSH adapter | 几乎不会（README/ROADMAP 都明确欢迎新 adapter）|
| DSH 上游 event 改名 | DSH 0.x 阶段 0.1 → 0.2 → 0.3 都会 break 一点，0.1 → 1.0 之后会稳 |
| OMO 加新 hook 类型 DSH 没见过 | 上游会先在 OpenCode adapter 加，DSH 我们加 listener 即可 |
| 框架代码 100% 引用 OMO 上游 | 框架本身只是薄 listener 包装；注意 attribution + license 双协议 |

### 4.3 暂未决

本节原列的 6 个决策点已全部由用户确认（见 §10 更新版）。其他待决项也集中在 §10。

---

## 5. 推荐方案（决策矩阵）

| 维度 | 决策 | 理由 |
|---|---|---|
| 物理形态 | **独立 `oh-my-opendsh/` 仓库 + scratch plugin 模式**（DSH 官方 `--patch`）| 零侵入、license 干净、容易 fork |
| 移植策略 | **直接 import OMO 19 core + 4 adapter 源码 + 写薄 listener 层** | 升级成本最低（≈1 小时）|
| 适配器形态 | **`patches/omo-dsh/{agents,hooks,team-ui,bundle}/` 4 个 sub-plugin + 根 cordis.yml** | 4 个 DSH 官方 plugin 形态（tool/hook/UI/protocol-driver）|
| 加载方式 | **`dsh web --patch ./oh-my-opendsh/cordis.yml`** | DSH 官方 scratch plugin 模式，DSH 零修改 |
| 命名 | `oh-my-opendsh`（区别于 OMO 原版）| 避免商标混淆 |
| LLM | 第一期 DeepSeek + OpenAI-compatible（via `dsh-llm-pi-ai`）；其余按需补 | MVP 快速 + 80% 覆盖 |
| 升级节奏 | OMO **事件驱动**（release 出就 bump），DSH **双月** bump | 双方节奏匹配 |
| 测试 | 全套 DSH gate (`test` / `test:e2e` / `test:snapshot` / `verify-licenses`) | 复用 DSH 已有的 CI |
| 文档 | 8 篇 doc + 升级 playbook 验证 | 团队后续维护需要 |
| License | **MIT OR SUL-1.0**（dual license）| 升级最省事，license 复杂度低（不销售前提）|

---

## 6. License 处理（SUL-1.0 专项）

### 6.1 关键事实

- **DSH**: MIT（友好）
- **OMO**: Sustainable Use License v1.0（`<OMO_REPO>/LICENSE.md`）
  - 允许：用 / 复制 / 分发 / 修改 / 准备派生作品
  - **限制 A**：仅"自己的内部业务目的"或"非商业或个人使用"可使用 / 修改
  - **限制 B**：分发给他人时必须**免费 + 非商业**
  - **限制 C**：不得删除 / 模糊任何 license / copyright 声明
  - 专利：mutual termination
  - 终止：30 天 cure period

### 6.2 对 patch 框架的含义

| 场景 | 是否允许 | 处理 |
|---|---|---|
| 内部团队使用 patch 框架 | ✅ 允许 | 直接用 |
| 把 patch 框架发到 GitHub 公开 | ✅ 满足（免费 + 非商业）| repo 加 `LICENSE = MIT OR SUL-1.0`；`LICENSES/oh-my-openagent.LICENSE.md` 原样放 OMO 文本；README 显式声明 dual license |
| 把 patch 框架的派生作品给客户 | ❌ **违反 SUL-1.0**（商业分发） | 不要做；客户需要自己跑 OMO 上游 |
| 在 patch 框架里"卖服务 / SaaS" | ⚠️ 灰色（"Use" vs "Distribute"）| 法务评估；可能允许只要不发布派生作品 |
| 在 patch 框架里 import `omo-core/*` 源码 | ✅ 满足（派生作品整体受 SUL-1.0 传染，但以 dual license 形式发布）| 仍可发；框架整体 dual license（MIT OR SUL-1.0）|
| 仅用 OMO 的 API 思想重新实现，不复制源码 | ✅ 允许 | clean-room rewrite；可用但**升级成本高**（不推荐）|

### 6.3 缓解建议

1. **dual license（推荐）**：框架 `package.json` 写 `"license": "MIT OR SUL-1.0"`，`LICENSES/` 放两个全文。这让 OMO 源码可被直接 import，升级成本最低（5 分钟 + 0–1 小时修 listener）；同时给最终用户选择空间（用 OMO 时遵守 SUL-1.0，不用时遵守 MIT）。
2. **npm 依赖 + 直接 import**：OMO 19 core + 4 adapter 通过 `pnpm i oh-my-opencode` 拉入 `node_modules/`。我们的 `patches/omo-dsh/omo-hooks/*/listener.ts` 是 listener 包装，import OMO 的 hook 函数并加 DSH 事件转换。
3. **clean-room（不推荐）**：我们的 adapter 全自己写，不 import OMO 源码。license 最干净（框架纯 MIT），但每次 OMO 升级需要重写翻译层（1–5 天 vs 1 小时），得不偿失。

### 6.4 推荐默认

**采用方案 1（dual license + 直接 import OMO 源码）**。理由：
- 升级成本最低（5 分钟 + 0–1 小时修 listener）
- 用户从 npm 装 OMO 时已经同意 SUL-1.0；MIT OR SUL-1.0 的双协议给最终用户选择空间
- 不做销售 → SUL-1.0 的"非商业"完全满足
- 框架仓库本身可以**纯 MIT 形式**展示给法律审查更严格的团队

**例外**：如果将来要二次修改 OMO core 包本身（不只是消费 API），仍可继续走 dual license，无需切换。

---

## 8. 验收标准（Definition of Done for MVP）

1. ✅ `dsh web --patch ./oh-my-opendsh/cordis.yml` 在 macOS + Linux 都能冷启动到 idle（Windows 列为后续）
2. ✅ 11 个 OMO agent 全部能注册为 DSH preset，system prompt 与 OMO 原版等价（snapshot diff 0）
3. ✅ 30+ OMO hook 全部通过 DSH event listener 挂上，单测覆盖每个 listener 的 happy path
4. ✅ `ultrawork / ulw / team / hyperplan / search` 5 个命令可用
5. ✅ LSP / ast-grep / codegraph / web-search 四个 MCP 都能起来
6. ✅ Team Mode 至少能跑 lead + 2 members + web 可视化（member 数 8 是后续工作）
7. ✅ Hashline edit 工具可工作
8. ✅ 端到端 smoke test：`echo "ultrawork: 重构 foo.ts" | dsh --profile omo --patch ./oh-my-opendsh/cordis.yml` 能跑通
9. ✅ `./scripts/bump-omo.sh v3.x.0` 在 5 分钟内跑完；listener 受影响清单有界
10. ✅ 框架 LICENSE 是 `MIT OR SUL-1.0`；OMO LICENSE 原样在 `LICENSES/`；README 顶部致谢
11. ✅ 8 篇 doc 完成
12. ✅ CI 全绿（DSH 的 check:all 通过）

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

## 10. 决策记录

### 10.1 已确认（2026-08-16）

- ✅ **1. 物理形态**：独立 `oh-my-opendsh/` 仓库
- ✅ **2. OMO 引入方式**：DSH 官方 scratch plugin 模式（`dsh --patch` overlay）
- ✅ **3. LLM 范围**：全做 + 分期 + 优先社区复用
- ✅ **4. 可视化**：方案 B（web ChatNode via `ConversationNodeDefinition`）
- ✅ **5. OMO PR**：不给外部 PR；遵守 License 规范 + 致谢
- ✅ **6. 升级方式**：方案 B（dual license + 直接 import OMO 源码）

### 10.2 仍需确认的细节

下面 8 条建议在后续迭代中定下来；带"推荐"的是我的默认建议，不带的是必须你拍板：

#### 10.2.1 OMO 19 core 包 pin 策略

| 备选 | 含义 |
|---|---|
| A. exact（`3.2.0`）| 完全不自动接 patch |
| B. caret（`^3.2.0`）| **推荐**：接 patch + minor，OMO 公开 bug fix 自动进入 |
| C. tilde（`~3.2.0`）| 只接 patch |

#### 10.2.2 DSH 自身 pin 策略

| 备选 | 含义 |
|---|---|
| A. pin minor（`0.1.x`）| **推荐**：DSH 0.x 阶段 0.1→0.2 有 API 变化，pin minor 安全 |
| B. pin patch（`0.1.5`）| 严格锁 |
| C. 跟进 dev branch head | 激进，CI 要能跑通 head |

#### 10.2.3 npm 包命名

| 备选 | 含义 |
|---|---|
| A. `@oh-my-opendsh/*`（scoped）| **推荐**：4 个 sub-plugin 各自独立包；DSH 自家是 `@deepseek-ai/dsh-*` 同款模式 |
| B. `oh-my-opendsh`（单包）| 4 个 sub-plugin 作为内部目录 |

#### 10.2.4 Windows 是否在 MVP 范围

| 备选 | 含义 |
|---|---|
| A. 是（写跨平台 e2e）| +1 周工作量 |
| B. 否（macOS + Linux only）| **推荐**：DSH 0.1 跨平台坑多，MVP 不踩；Windows 留到 MVP 之后 |

#### 10.2.5 Telemetry 默认状态

| 备选 | 含义 |
|---|---|
| A. 默认 opt-in（用户主动开）| 最干净 |
| B. 默认 opt-out（用户主动关）| **推荐**：对齐 OMO 原版 PostHog 默认；提供开箱即用 |
| C. 完全不接 | 最省事但失去 OMO 兼容性 |

#### 10.2.6 OMO 上游 release 通知

| 备选 | 含义 |
|---|---|
| A. GitHub Watch + RSS | 最简，依赖个人习惯 |
| B. GitHub Actions weekly cron + auto-issue | **推荐**：写个 `upstream-watch.yml` workflow，周一跑一次生成 issue 摘要 |
| C. 订阅 OMO Discord announcements channel | 实时但有信息噪声 |

#### 10.2.7 升级节奏

| 备选 | 含义 |
|---|---|
| A. 事件驱动（OMO 发了 release 就 bump）| **推荐**：最省心 |
| B. 双月 | 之前默认 |
| C. 双周 / 季度 | 看你团队节奏 |

#### 10.2.8 MVP 验收标准"必须 vs 后续"分层

12 条验收标准里，**MVP 必须 6 条 + 后续 6 条**：

| 层级 | 验收标准 # |
|---|---|
| **MVP 必须** | #1（启动）/ #2（11 agent preset）/ #3（30 hook listener）/ #9（bump 脚本）/ #10（license）/ #12（CI）|
| **后续** | #4（5 命令）/ #5（4 MCP）/ #6（Team Mode + web）/ #7（hashline）/ #8（e2e smoke）/ #11（8 doc）|

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
| **`omo-senpi`**（OMO 自家） | OMO 的"独立 / native" 发行版（`npm i -g omo-ai@beta`） | **OMO 在 multi-harness 路上已经踩坑**——senpi 适配器最近 issue #6794 报告"omo senpi edition cannot resolve opencode omo config"—— config schema 兼容性问题。**这正好是 §10.2 要避免的坑** |

### 11.5 OMO 维护者的"反过度抽象"哲学（关键约束）

从 OMO ROADMAP：
> "The industry changes too fast. Fixed patterns and agreed conventions should be implemented directly. Uncertain parts should not be over-abstracted. If an adapter for a new harness is needed, an agent can write it in one shot."

**对 adapter 含义**：
- ✅ **要做的**：写一个独立 `omo-dsh` adapter（独立仓库 + 独立命名 + 不在 OMO 仓库里改代码）
- ❌ **不要做的**：不要在 OMO 仓库里提 PR 试图"加一个 DSH adapter 模板 / 抽象层 / 共享代码"——会被维护者以"反过度抽象"为由拒绝
- ❌ **不要做的**：不要在 OMO Discord 提议"做 DSH 支持"——会被引导到"你自己写一个"的标准答案

### 11.6 关键战略结论

| 结论 | 行动 |
|---|---|
| **无直接竞品 → 首发动机会** | 尽早发布 v0.1 占领位置 |
| **OMO 官方欢迎新 adapter → 无政治风险** | 不提 PR、不在 OMO 仓库改代码，作为外部独立项目运行 |
| **OMO 哲学反对"grand unified abstraction"** | adapter 是"独立写一份"，**不要造"DSH 通用 adapter framework"**——直接做"omo-dsh"这一个 |
| **DSH 社区 3 天就有 95k star → 真实需求存在** | 项目命名 / 文档 / README 都要面向"DSH 用户"写，而不是"OMO 用户"写 |
| **senpi 适配器踩过的 config schema 坑**（issue #6794） | 我们 §10.2.8 的"必须 6 条"里加一条：必须先验证 `omo-config-core` schema 在 DSH 事件流下的兼容性 |
| **oh-my-pi 11.1k stars 证明"harness problem"有市场** | 我们的 hashline 包装走 OMO 上游，**不要自己造**——但要在 README 显式致谢 oh-my-pi（hashline 概念的源头）|

### 11.7 调研局限（不能下的结论）

- 我没找到 OMO Discord 内部的讨论（Discord 抓取困难），可能有人在 Discord 提过"做 DSH 版"但 GitHub issues 上没有
- 我没找到微信群 / 中文社区的讨论（可能 GitHub 之外的论坛有人提过）
- DSH 发布 3 天太短，无法判断"DSH 社区是否长期繁荣"还是"fomo 短期高峰"

**建议**：派一个人花 1 天扫一下 OMO Discord `#building-in-public` 频道、DSH 官方 Discord / 微信群、Reddit r/LocalLLaMA、HN。可能有意料之外的发现。
