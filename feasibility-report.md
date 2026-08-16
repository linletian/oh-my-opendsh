# 可行性报告：基于 deepseek-harness (DSH) 移植 oh-my-openagent (OMO) 的工程化与可持续 patch 框架

> 仓库证据快照：
> - **DSH** `/home/linletian/GithubRepo/deepseek-harness/` v0.1.0-rc.5, MIT
> - **OMO** `/home/linletian/GithubRepo/oh-my-openagent/` (HEAD 截屏, 实际仓库拼写为 `oh-my-openagent`，用户在指令中写成了 `oh-my-openagennt`)，SUL-1.0
> - **新工作区** `/home/linletian/SoftwareWorkspace/oh-my-opendsh/`（已创建，空目录）
>
> 本报告是预研结论，不实现任何代码，不修改任何文件除本 plan.md。

---

## Summary

**目标**：把 OMO 的能力体系（11 agent、54+ hook、LSP/AST-grep/codegraph MCP、`/goal`、`/ultrawork`、Team Mode、hashline edit、Rules Injection 等）以"插件 + profile"形式接到 DSH 框架之上，并搭一个能让 OMO 升级时快速 rebase 的 patch 工程。

**核心结论（先看这四条）**：
1. **可行性：高。** DSH 的扩展面（`agent/*`、`tools/*`、`ctx.goals`、`ctx.shell`、`ctx.fs`、`ctx.skill`、`ctx.jobs`、`ctx.subagent`、`ctx.terminals`、`ctx.plan`、`ctx.compaction`、`ctx.todo`）几乎一一对应 OMO 的 11 大能力。OMO 的 ROADMAP 已经把它拆成 19 个 harness-agnostic 核心包，恰好可被 DSH 直接吃下，无需重写。DSH 自己的 `dsh-base` bundle 已经内置了 `goal/plan/skill/compaction/ralph/workflow/todo/subagent/web-search` —— 这意味着 OMO 的 60% 能力**在 DSH 里早就有等价原生实现**，移植主要工作在"做对映射和命名"，不是"做新实现"。
2. **可持续 patch 框架：可行，且 DSH 体系天然契合。** DSH 的"profile + bundle + cordis.patch.yml"机制就是一个分层 patch 模型（底层包 → profile → home patch → `--patch` overlay）。我们只需要把 OMO 适配层放在最顶层 patch，并把 OMO 19 个核心包锁版本到工作区依赖（pnpm workspace + git tag），就可以做到"上游 OMO 改一个版本号 → `pnpm update` → `dsh typecheck/test` → 暴露的失败只在 adapter"这种最小冲突面。
3. **不是"替换 OMO"，是"做 OMO 的 DSH 适配器"。** OMO 已经在 ROADMAP 里把多 harness 适配器化（已有 `omo-opencode`、`omo-codex`、`omo-senpi`），因此"再加一个 DSH 适配器"是 OMO 官方允诺的扩展路径，与 OMO 维护者哲学一致。
4. **有一个硬约束必须前置处理：OMO 的 SUL-1.0 license。** 限制"免费 + 非商用"分发；如果在内部团队用没问题；如果将来要外发派生作品，patch 框架的对外发布需要保留 SUL-1.0 或仅分发不依赖 OMO 源码的"空壳"profile。详见 §6。

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

### 2.10 移植工作量估算（粗）

| 阶段 | 估时 | 关键产出 |
|---|---|---|
| 0. 搭骨架（pnpm workspace、profile 模板、空 adapter） | 1 周 | `oh-my-opendsh/` 仓库初始 commit；`dsh --profile omo` 能起一个空运行 |
| 1. 接 OMO core 19 包为 workspace 依赖 | 1 周 | 19 个 OMO 核心包在 DSH workspace 里 typecheck 过 |
| 2. 写 `omo-dsh-adapter` Cordis plugin（11 agent preset + 30 hook → DSH 事件） | 4 周 | 11 agent 能跑，30 hook 挂在 DSH 事件上 |
| 3. LLM adapter 补齐（先 DeepSeek + OpenAI compat，再补其余） | 2 周 | 6 个 llm-* adapter |
| 4. MCP 桥接（LSP / ast-grep / codegraph / git-bash / web 三件套） | 2 周 | model-facing tools 完整 |
| 5. Team Mode 移植（用 OMO team-core + DSH subagent） | 3 周 | lead + 8 member + tmux 可视化 |
| 6. Profile / bundle 化（`cordis.patch.yml` + `omo.profile.json`） | 1 周 | 用户能 `dsh --profile omo` 启动 |
| 7. 端到端测试 + 性能调优 | 2 周 | 全功能 smoke test |
| 8. 文档 + 上手指南 | 1 周 | docs/ |
| **合计** | **~16 周 / 4 个月**（一人主力） | |

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

```
oh-my-opendsh/                         # 我们的 patch 框架仓库
├── package.json                       # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.json
├── README.md
├── LICENSE                            # MIT (框架本身)
├── THIRD_PARTY_LICENSES.md            # 列出 OMO SUL-1.0 + 各上游
├── docs/
│   ├── feasi-2026-08.md              # 本文件（可行性报告）
│   ├── upgrade-playbook.md            # OMO 升级 SOP
│   ├── hook-translation-table.md      # 30 hook → DSH 事件对照表
│   ├── agent-preset-schema.md         # OMO agent → DSH preset 映射规则
│   └── license-notes.md               # SUL-1.0 + MIT 混用指引
├── dsh/                               # DSH 上游，git subtree
│   ├── .git subtree info
│   └── (DSH 完整源码，patches/ 下放我们的最小 patch)
├── omo/                               # OMO 上游，git subtree
│   ├── .git subtree info
│   └── (OMO 19 core + adapter 源码)
├── adapter/                           # 我们写的胶水
│   ├── package.json                   # @oh-my-opendsh/adapter-dsh
│   ├── src/
│   │   ├── index.ts                   # 主入口，注册 Cordis plugin
│   │   ├── agents/                    # 11 agent preset 注册
│   │   ├── hooks/                     # 30 hook → DSH 事件翻译
│   │   ├── llm/                       # 6 LLM adapter（如未在 DSH 自带）
│   │   ├── mcp/                       # MCP 桥接
│   │   └── team/                      # Team Mode 装配
│   ├── cordis.patch.yml               # 我们的 profile patch
│   └── tests/
├── profile/                           # DSH profile 声明
│   └── omo.profile.json
├── patches/                           # 对 DSH/OMO 的最小 patch（很少）
│   ├── dsh-*.patch                    # 偶尔需要给 DSH 提的 bugfix
│   └── omo-*.patch                    # 偶尔需要给 OMO 提的 SUL 友好的修复
└── scripts/
    ├── bump-omo.sh                    # 一键升级 OMO
    ├── bump-dsh.sh                    # 一键升级 DSH
    ├── upstream-watch.sh              # 监控 OMO dev branch
    ├── conflict-scan.sh               # 找出会被 OMO 升级影响的 adapter 文件
    └── verify-licenses.sh             # license 守门人
```

### 3.4 Patch 升级流程

#### 常规升级 OMO（推荐节奏：每 2–4 周）

```bash
# 1. 看 OMO 上了什么
./scripts/upstream-watch.sh omo --since 2w

# 2. bump OMO subtree 到指定 tag
./scripts/bump-omo.sh v3.2.0

# 3. 跑 conflict scan，看我们 adapter 的哪些文件会被影响
./scripts/conflict-scan.sh
# 输出（伪）：
#   ⚠ adapter/src/hooks/keyword-detector/index.ts: OMO 改了 hook signature
#   ⚠ adapter/src/agents/builtin-agents/sisyphus.ts: OMO 加了 system prompt 段
#   ✓ adapter/src/team/*  未受影响
#   ✓ adapter/src/mcp/*  未受影响

# 4. 跑全套 gate
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm lint

# 5. 暴露失败，挨个改 adapter（典型情况：1–3 处）
# 6. commit + tag
git tag omo/v3.2.0
```

#### 升级 DSH（推荐节奏：每 1–2 月）

```bash
./scripts/bump-dsh.sh v0.2.0
pnpm typecheck && pnpm test
# 主要风险：DSH 改了事件签名或 plugin API（看 DSH CHANGELOG）
```

#### 大版本（DSH 1.0 / OMO 4.x）

读上游的 migration guide，先在分支上 bump，过完所有 gate 才 merge main。

### 3.5 冲突最小化设计

| 风险点 | 缓解策略 |
|---|---|
| OMO 改 hook 签名 | 我们的 `adapter/src/hooks/*` 文件**与 OMO 同名**但内容完全重写（不是"引用"）；OMO 改 hook 我们就同步重写翻译层 |
| OMO 改 agent 配置 | 我们的 `adapter/src/agents/*` 文件**不直接 import OMO 的 agent 实现**，而是读 OMO core 包的 JSON 配置 + 加 DSH preset metadata 包装 |
| OMO 加新 hook | `scripts/upstream-watch.sh` 提示"OMO 新加 3 个 hook"；我们手动加 3 个 DSH event listener |
| DSH 改事件签名 | 集中放在 `adapter/src/dsh-compat.ts` 一个文件里做"事件 shim"，全 adapter 共享 |
| OMO license 变更 | `scripts/verify-licenses.sh` 每次 CI 跑，禁止误改成更严格的 license |
| 上游 release 频率不可控 | pin 到 SHA，不自动追 dev branch；只在显式 bump 时升级 |

### 3.6 测试金字塔

| 层级 | 内容 | 工具 |
|---|---|---|
| Unit | OMO core 包在我们 workspace 里的纯函数行为 | vitest |
| Adapter unit | 30 hook 翻译正确性（喂入模拟 DSH 事件，验证 OMO hook 被调且参数对） | vitest + DSH `dsh-agent-loop-testkit` |
| Integration | 11 agent preset 启动后能看到正确 system prompt / tools / 路由 | DSH `examples/agent-spine-demo` 模式 |
| E2E | 真实跑 OMO "ultrawork" 流程在 DSH 上 | DSH `vitest.e2e.config.ts` + LLM mock server |
| Snapshot | OMO agent preset 的 system prompt diff | `DSH_SNAPSHOT=record` |
| License | 任何改动不得引入非 SUL-1.0 / 非 MIT 依赖 | `scripts/verify-licenses.sh` |
| 升级回归 | bump 脚本完成后必须 0 失败 | CI gate |

### 3.7 关键脚本骨架

只列契约，不写实现：

```text
scripts/bump-omo.sh <tag>
  - git fetch omo-upstream <tag>
  - git subtree pull --prefix=omo/ omo-upstream <tag> --squash
  - 触发 pnpm install
  - 返回非 0 如果 cordis compat 检查失败

scripts/conflict-scan.sh
  - diff omo/HEAD~1 omo/HEAD --name-only
  - 对每个改名文件，检查 adapter/src/ 里有没有同名文件
  - 输出可能被影响的 adapter 文件清单

scripts/upstream-watch.sh omo --since 2w
  - 调 GitHub API 列 commits
  - 过滤 packages/omo-opencode/src/hooks 与 packages/omo-opencode/src/agents 的改动
  - 输出"hook 数量变化 / agent 数量变化 / 新文件"摘要

scripts/verify-licenses.sh
  - 扫描 pnpm-lock.yaml + 我们写的 package.json
  - 任何依赖 license 不是 MIT / Apache-2.0 / BSD / ISC / SUL-1.0（仅 OMO）就 fail
```

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
| **OMO SUL-1.0 限制商用** | 不能把 OMO 派生作品商业销售；外部用户拿到 patch 框架时需自带 SUL-1.0 | 见 §6 详细 license 策略；**MVP 阶段只做内部使用，外发需要法务评估** |
| **OMO `omo-opencode` 是最大耦合 adapter** | 这是 OMO 还在重构的部分（ROADMAP 说"still strongly coupled to OpenCode in its largest adapter"） | 我们**不** import `omo-opencode`，只 import OMO 的 19 core 包 + 4 个小 adapter（pi-goal / pi-webfetch / omo-codex / omo-senpi）的逻辑 |
| **DSH 还是 0.1.0-rc.5** | API 未稳定，patch 升级时 DSH 本身也可能在变 | pin 到 DSH minor 版本；bump 时单独发一版 |
| **Windows / WSL 体验** | DSH 有 `bash-sandbox`、`pwsh-sandbox`、`native/landlock-run` 表明做了跨平台；OMO 有 `git-bash-mcp` 表明也对 Windows 友好 | 移植时需要写跨平台 e2e；Windows 体验可能比 macOS/Linux 慢一拍 |
| **LLM adapter 工作量被低估** | 6 个 llm-* 适配器每个 200–500 行，第一期只接 1–2 个 | 第一期 MVP 只接 DeepSeek + 一个 OpenAI-compatible 代理（覆盖 80% 用例）；其余按需补 |
| **OMO telemetry 走 PostHog 协议** | DSH 用 OTel 协议，桥接有工作 | 用现成的 `@opentelemetry/exporter-prometheus` 或自己写 30 行的 PostHog exporter |

### 4.2 软风险（可以接受）

| 风险 | 影响 |
|---|---|
| OMO 维护者 反对加 DSH adapter | 几乎不会（README/ROADMAP 都明确欢迎新 adapter；philosophy 也支持每个 adapter 独立写）|
| DSH 上游 event 改名 | DSH 0.x 阶段 0.1 → 0.2 → 0.3 都会 break 一点，0.1 → 1.0 之后会稳 |
| OMO 加新 hook 类型 DSH 没见过 | 上游会先在 OpenCode adapter 加，DSH 我们加监听器即可 |
| 我们 adapter 的代码 100% 由 OMO 翻译 | 这是事实，**注意 attribution** —— README/THIRD_PARTY_LICENSES.md 必须明列 |

### 4.3 暂未决（Plan 阶段需要用户决策）

| 问题 | 备选 |
|---|---|
| 工作区放在 `oh-my-opendsh/` 仓库还是 fork DSH monorepo 内部？ | A. **独立仓库 + git subtree**（推荐：解耦清晰，license 干净）<br>B. fork DSH monorepo，在 `packages/adapter/omo-dsh/` 加一个包（侵入大） |
| LLM 适配器第一期覆盖哪些 provider？ | A. 仅 DeepSeek + OpenAI-compatible（80% 用例，2 周）<br>B. 全 6 个（6 周） |
| 是否同时支持 DSH 的 web UI（`apps/web-frontend`）做 OMO Team Mode 可视化？ | A. 第一期只做 CLI，第二期再做 web（推荐）<br>B. 第一期就上 web（多 3–4 周） |
| 是否要把适配器作为上游 PR 推到 DSH 官方？ | A. 不推，自家仓库 + subtree（license 干净，灵活）<br>B. 推官方 PR（荣耀大但 license 协调成本高） |
| 是否同步给 OMO 提 PR（"om 的 dsh 适配器"作为 omo-dsh adapter）？ | A. 不提，作为 OMO 用户而非 OMO 贡献者（避免和 OMO 维护者哲学冲突）<br>B. 提 PR 作为 showcase（风险：OMO 维护者可能"过抽象"反对） |
| bump 频率：双周 vs 双月 vs 季度？ | 默认 **双月**（OMO 发布频率约每月 1–2 次 minor，太快会冲突） |
| OMO 上游拿不下来（极端情况，OMO 项目终止）| 我们还有 19 core 包 + DSH 一整套，至少能维持一个"OMO 风格但 DSH-native"的等价体验 |

---

## 5. 推荐方案（决策矩阵）

| 维度 | 决策 | 理由 |
|---|---|---|
| 物理形态 | **独立 `oh-my-opendsh/` 仓库 + git subtree 引入 DSH 和 OMO** | 干净 license、干净依赖图、容易 fork |
| 移植策略 | **消费 OMO 19 core 包 + 写一个 `omo-dsh-adapter` Cordis plugin** | 与 OMO "adapter 是独立写" 的哲学一致 |
| 适配器挂载点 | **`packages/adapter/omo-dsh/` + `cordis.patch.yml` + `omo.profile.json`** | 用 DSH 自己的 profile/bundle 机制，未来加 DSH 官方 features 自动获益 |
| 命名 | `dsh --profile omo` 启动 OMO 模式；保留 OMO 自己的 `omo` 命令别名为 `dsh omo` 子命令 | 兼容 OMO 用户习惯 |
| LLM | 第一期 DeepSeek + OpenAI-compatible，第二期补全 | MVP 快速 + 覆盖 80% 用例 |
| 升级节奏 | OMO **双月** bump，DSH **双月** bump | OMO 节奏匹配，DSH 节奏匹配 |
| 测试 | 全套 DSH gate (`test` / `test:e2e` / `test:snapshot` / `verify-licenses`) | 复用 DSH 已有的 CI |
| 文档 | 8 篇 doc（升级 SOP、hook 翻译表、agent preset schema、license 指引 …） | 团队后续维护需要 |
| License | 框架本身 **MIT**；分发的派生作品中 OMO 部分保留 **SUL-1.0**，并在根目录加 `THIRD_PARTY_LICENSES.md` | 合规 |

---

## 6. License 处理（SUL-1.0 专项）

### 6.1 关键事实

- **DSH**: MIT（友好）
- **OMO**: Sustainable Use License v1.0（`/home/linletian/GithubRepo/oh-my-openagent/LICENSE.md`）
  - 允许：用 / 复制 / 分发 / 修改 / 准备派生作品
  - **限制 A**：仅"自己的内部业务目的"或"非商业或个人使用"可使用 / 修改
  - **限制 B**：分发给他人时必须**免费 + 非商业**
  - **限制 C**：不得删除 / 模糊任何 license / copyright 声明
  - 专利：mutual termination
  - 终止：30 天 cure period

### 6.2 对 patch 框架的含义

| 场景 | 是否允许 | 处理 |
|---|---|---|
| 内部 MiniMax 团队使用 patch 框架 | ✅ 允许 | 直接用 |
| 把 patch 框架的派生作品发到 GitHub 公开 | ⚠️ 允许，**但** 必须免费 + 非商业 + 保留 SUL-1.0 | repo 加 `LICENSE` = SUL-1.0；`THIRD_PARTY_LICENSES.md` 列明 OMO 部分来源；README 显式声明"non-commercial use" |
| 把 patch 框架的派生作品给客户 | ❌ **违反 SUL-1.0**（商业分发） | 不要做；客户需要自己跑 OMO 上游 |
| 在 patch 框架里"卖服务 / SaaS" | ⚠️ 灰色（"Use" vs "Distribute"）| 法务评估；可能允许只要不发布派生作品 |
| 仅用 OMO 的 API 思想重新实现，不复制源码 | ✅ 允许 | 这是 clean-room rewrite；我们 adapter 是翻译而非 import，所以这条路畅通 |
| 在 patch 框架里 import `omo-core/*` 源码 | ⚠️ 受 SUL-1.0 传染 | 仍可发，但**派生作品**整体 SUL-1.0 |

### 6.3 缓解建议

1. **adapter 本身尽量"薄"**：我们的 `adapter/src/*` 文件**翻译** OMO hook 行为，**不直接 import OMO 源码**。这一点可行，因为 DSH 的事件 listener 签名（`tools/post-execute` waterfall）和 OMO 的 hook 签名（`postToolUse`）形态相近，翻译成本不高。
2. **OMO core 包**（19 个）可以**作为 npm 依赖**而非 git subtree。这样 patch 框架的 `package.json` 里只有 OMO 上游 release，不需要把 OMO 源码进我们的仓库 → 我们的 repo 严格 MIT，OMO 版权归 OMO。
3. **如果选 git subtree 模式**（更深的"可持续 patch"）→ 我们仓库的 `omo/` 子目录按 SUL-1.0 暴露，框架整体 **dual license**（`MIT OR SUL-1.0`），用户在安装时选 license。

### 6.4 推荐默认

**采用方案 2**（OMO 作 npm 依赖，patch 框架本身纯 MIT）。这能让 patch 框架以 MIT 在 GitHub 公开，最大化"快速移植最新 omo"的便利性，同时 SUL-1.0 通过 npm 依赖自然传递（用户从 npm 装 OMO 时已同意 SUL-1.0）。

**例外**：如果将来要二次修改 OMO core 包本身（不只是消费 API），则需要切到方案 3（dual license）。

---

## 7. 实施路线（待用户批准后启动）

### Phase 0：脚手架（1 周）
- 初始化 `oh-my-opendsh/` 仓库，pnpm workspace 配置
- 引入 DSH v0.1.0-rc.5（git subtree 到 `dsh/`）
- 引入 OMO v3.x（git subtree 到 `omo/` 或 npm 依赖，先 npm 依赖）
- 跑通 `dsh --profile omo` 启动空 profile

### Phase 1：核心联通（2 周）
- 写 `adapter/src/index.ts`（空 Cordis plugin）
- 写 `cordis.patch.yml` 加载 plugin
- 跑通 1 个 OMO agent preset + 1 个 hook 翻译作为样板
- 建立"hook 翻译表"文档

### Phase 2：能力平移（8 周）
- 接入 11 个 agent preset
- 接入 30 个 hook 翻译（按重要度排序：先 IntentGate / Ultrawork / Goal / LSP / Comment-checker / Hashline / Todo Enforcer，后 start-work / team-tool-gating / preemptive-compaction …）
- 接入 6 个 LLM adapter（第一期只 2 个）
- 接入 MCP 桥接

### Phase 3：Team Mode + UX（3 周）
- Team Mode 移植
- web UI 验证（如要做）

### Phase 4：硬化 + 文档（2 周）
- 全套 CI gate
- 8 篇 doc
- 升级 playbook 验证一次（"假设 OMO 这周发了 v3.3.0，我们能不能在 1 天内完成"）

### 总计：~16 周（一人主力 MVP）

---

## 8. 验收标准（Definition of Done for MVP）

1. ✅ `dsh --profile omo` 在 Linux + macOS + Windows 三个平台都能冷启动到 idle
2. ✅ 11 个 OMO agent 全部能注册为 DSH preset，system prompt 与 OMO 原版等价（snapshot diff 0）
3. ✅ 30+ OMO hook 全部挂在 DSH 事件上，单测覆盖每个 hook 的 happy path
4. ✅ `ultrawork / ulw / team / hyperplan / search` 5 个命令可用
5. ✅ LSP / ast-grep / codegraph / web-search 四个 MCP 都能起来
6. ✅ Team Mode 至少能跑 lead + 2 members（member 数 8 是后续工作）
7. ✅ Hashline edit 工具可工作
8. ✅ 端到端 smoke test：`echo "ultrawork: 重构 foo.ts" | dsh --profile omo` 能跑通
9. ✅ `scripts/bump-omo.sh v3.x.0` 在 5 分钟内跑完；conflict-scan 输出有界
10. ✅ 框架本身的 LICENSE 是 MIT；OMO 部分的 license 显式声明
11. ✅ 8 篇 doc 完成
12. ✅ CI 全绿（DSH 的 check:all 通过）

---

## 9. 参考材料（仓库内部链接）

- DSH 架构概览：`/home/linletian/GithubRepo/deepseek-harness/docs/architecture.md`
- DSH agent 生命周期：`/home/linletian/GithubRepo/deepseek-harness/docs/agent-lifecycle.md`
- DSH 工具执行管线：`/home/linletian/GithubRepo/deepseek-harness/docs/tool-execution-pipeline.md`
- DSH Cordis 入门：`/home/linletian/GithubRepo/deepseek-harness/docs/cordis-primer.md`
- DSH bundle 范例：`/home/linletian/GithubRepo/deepseek-harness/packages/bundle/base/package.json`
- DSH hook 协议：`/home/linletian/GithubRepo/deepseek-harness/packages/hooks/hook-protocol/package.json`
- DSH claude/codex hook 桥接：`/home/linletian/GithubRepo/deepseek-harness/packages/hooks/hooks-claude-code/`, `.../hooks-codex/`
- DSH subagent 系列：`/home/linletian/GithubRepo/deepseek-harness/packages/subagent/`
- DSH goal 服务：`/home/linletian/GithubRepo/deepseek-harness/packages/goal/`
- DSH workflow / ralph：`/home/linletian/GithubRepo/deepseek-harness/packages/workflow/`
- DSH todo / plan / skill / compaction：`/home/linletian/GithubRepo/deepseek-harness/packages/{todo,plan,skill,compaction}/`
- OMO ROADMAP：`/home/linletian/GithubRepo/oh-my-openagent/ROADMAP.md`
- OMO hooks 目录：`/home/linletian/GithubRepo/oh-my-openagent/packages/omo-opencode/src/hooks/`
- OMO agents 目录：`/home/linletian/GithubRepo/oh-my-openagent/packages/omo-opencode/src/agents/`
- OMO team-core（harness-agnostic）：`/home/linletian/GithubRepo/oh-my-openagent/packages/team-core/src/index.ts`
- OMO LICENSE：`/home/linletian/GithubRepo/oh-my-openagent/LICENSE.md`

---

## 10. 待用户确认（AskUser）

进入实现前，需要用户拍板的关键选择（**不阻塞写代码，但会影响 §5 推荐方案**）：

1. **物理形态**：独立仓库（推荐）vs fork DSH monorepo 加包
2. **OMO 引入方式**：npm 依赖（推荐，patch 框架纯 MIT）vs git subtree（dual license）
3. **LLM 范围**：第一期 2 个 provider（DeepSeek + OpenAI-compatible）vs 6 个全做
4. **web UI**：MVP 是否包含 web 可视化（影响 3–4 周）
5. **是否要给 OMO 官方提 PR**：作为 OMO 外部贡献者（可能引发"过抽象"争议）vs 纯用户身份
6. **license 风险评估**：是否需要走法务（如果只内部用可跳过）

这 6 个问题在 Plan 阶段只需要答 1–2 个最影响方向的；其余可以在 Phase 0/1 阶段决定。
