# oh-my-openagent v4.19.4 vs v5.0.0-beta.53 调查报告：Agent 体系与 Team Mode

- 仓库：`/home/linletian/GithubRepo/oh-my-openagent/`（全程只读 git：`git show/ls-tree/diff/grep`，工作树未动）
- v4.19.4 = `b072d27`（2026-08-01，v4 线最后一个 release）
- v5.0.0-beta.53 = `7918f24`（2026-09-11，v5.0 beta 最新）
- 验证状态：全部结论均有直接 git 证据；个别小点标注"未完全核实"。

---

## 总览：一句话结论

v5.0 的主线是**"omo native（omo-senpi）成为第一公民 + 神话名 agent 退居 OpenCode 版内部 id，用户面改为角色名"**：senpi 侧 curated agent `metis→plan-consultant`、`momus→plan-reviewer`，主 agent 从"名为 Sisyphus 的编排人格"变成"当前会话本身"；新增 **mass-ulw / `workflow` DAG 编排**作为 task 扇出与 team 之外的第三种并行拓扑；Team Mode 核心包几乎没变，但文档与 senpi 校验层对齐为"lead 恒为当前会话、成员=任意 category worker 或用户自定义 agent"；`delegate-core` 仅 bug 级小改；新增 `model_profile`（capable/simple-work/deep-work）只选主会话模型，不进入任何委派链。

---

## 1. Agent 花名册

### 1.1 omo-opencode（OpenCode 插件）：两版名册完全一致（内部 id 不变）

`packages/omo-opencode/src/agents/types.ts` 的 `BuiltinAgentName` 两版逐字相同（10 个）：

| Agent | 角色一句话 | 默认模型链首（model-core `AGENT_MODEL_REQUIREMENTS`，v4→v5 变化） |
|---|---|---|
| `sisyphus` | 主编排者：规划、委派、驱动任务至完成 | 两版均 claude-opus-5 max → kimi-k3 → gpt-5.6-sol medium → glm-5.2 → big-pickle；v5 仅全线移除 `vercel` provider |
| `hephaestus` | GPT 原生自主 deep worker（"give it a goal, not a recipe"） | 两版均仅 gpt-5.6-sol medium（requiresProvider openai/copilot/opencode；v5 加 `openai-codex`） |
| `oracle` | 只读高智商架构/调试顾问 | 两版均 gpt-5.6-sol xhigh → gemini-3.1-pro high → claude-opus-5 max → glm-5.2 |
| `librarian` | 文档与 OSS 代码搜索 | gpt-5.6-luna-fast low → deepseek-v4-flash → qwen3.7-plus(v4 为 qwen3.5-plus) → … → claude-haiku-4-5 → gpt-5.4-nano |
| `explore` | 快速代码库 grep | 同 librarian 链 |
| `multimodal-looker` | 视觉/截图分析 | gpt-5.6-sol low → kimi-k3 → glm-4.6v → gpt-5-nano（两版同） |
| `metis` | 计划前 gap 分析（抓隐藏意图/歧义/AI 失败点） | claude-opus-5 high → kimi-k3 low（两版同） |
| `momus` | 计划评审（clarity/verification/context） | v4: gpt-5.6-terra high → gpt-5.6-sol xhigh → …；**v5 改为 gpt-6-astra xhigh/high → claude-opus-5 max → gemini-3.1-pro → glm-5.2** |
| `atlas` | todo 执行编排（`/start-work` 激活，分发子代理、独立验证） | claude-sonnet-5 → kimi-k3 → gpt-5.6-sol medium → minimax-m3 → …（两版同） |
| `sisyphus-junior` | 无委派权的专注执行器；category 路由中介 | 同 atlas 链 + big-pickle 兜底（两版同） |

另有第 11 个 **`prometheus`**（访谈式战略规划，Tab 模式），不在 `BuiltinAgentName` 而经 `packages/omo-opencode/src/plugin-handlers/prometheus-agent-config-builder.ts` 注册；链：v4 claude-fable-5 xhigh → kimi-k3 max；v5 改 **claude-fable-5-1** xhigh → kimi-k3 max。

- 证据：`packages/omo-opencode/src/agents/builtin-agents.ts`（两版 `agentSources` 相同）；`packages/model-core/src/agent-model-requirements.ts`（两版 key 集相同：sisyphus/hephaestus/oracle/librarian/explore/multimodal-looker/prometheus/metis/momus/atlas/sisyphus-junior）。
- **v4→v5 在 omo-opencode 层：无新增/删除/重命名**，仅链上 provider 调整（去 vercel、加 openai-codex）与 momus/prometheus 的模型升级。

### 1.2 omo-senpi / senpi-task（OmO Native）：重命名 + 扩充发生在这里

curated/builtin agent 定义在 `packages/senpi-task/src/agents/builtin/`：

| v4.19.4 | v5.0.0-beta.53 |
|---|---|
| `explore`（只读 grep） | `explore`（不变） |
| `librarian`（文档/OSS 搜索） | `librarian`（不变） |
| `metis`（gap 分析，plan-gated） | **`plan-consultant`**（同角色改名；文件 `metis.ts→plan-consultant.ts`） |
| `momus`（计划评审，plan-gated） | **`plan-reviewer`**（同角色改名；`momus.ts→plan-reviewer.ts`） |
| —（无） | **新增 ulw-loop reviewer 三人组**：`omo-senpi-code-reviewer`、`omo-senpi-qa-executor`、`omo-senpi-gate-reviewer`（`code-reviewer.ts/qa-executor.ts/gate-reviewer.ts`；可写报告工件，故不在只读集内，team 成员解析期硬拒） |
| —（无） | **新增 `Kibitzer`**：记忆回顾 nudge，只读，`packages/omo-senpi/src/components/memory/kibitzer-prompt.ts`（v4 grep 零命中；v5 overview 有专节 "Kibitzer is the memory side"） |

- 证据：`git show v5.0.0-beta.53:packages/senpi-task/src/agents/builtin/index.ts`：`CURATED_READONLY_AGENT_DEFAULTS = [EXPLORE, LIBRARIAN, PLAN_CONSULTANT, PLAN_REVIEWER]` + `ULW_REVIEWER_AGENT_DEFAULTS = [CODE_REVIEWER, QA_EXECUTOR, GATE_REVIEWER]`（注释："The ulw-loop reviewer trio writes report artifacts, so it stays out of the curated read-only set"）。
- 弃用窗口：`subagent_type: "metis"|"momus"`、`omo.json agents.metis|momus` 在 v5 仍可用但启动告警（`packages/omo-senpi/src/components/config-startup/index.test.ts`：`"omo.json agents.metis is deprecated; rename the key to agents.plan-consultant"`），CHANGELOG 标注"removed in the next tagged publish"。迁移映射表 `packages/utils/src/migration/agent-names.ts` 两版相同（旧名→规范名）。
- 链（`senpi-task/src/agents/builtin/fallback-chains.ts`，mirror 自 model-core，senpi 版每个 claude rung 前加 `claude-sdk-oauth` 订阅通道）：
  - plan-consultant（v4 metis 位）：claude-sonnet-4-6 → claude-opus-5 max → gpt-5.6-sol medium → glm-5.2 → kimi-k3
  - plan-reviewer（v4 momus 位）：**v5 改 gpt-6-astra xhigh→high** → claude-opus-5 max → gemini-3.1-pro high → glm-5.2（v4 首 rung 为 gpt-5.6-terra high）
  - explore/librarian：gpt-5.6-luna-fast low → deepseek-v4-flash max → qwen3.5-plus → minimax-m3 → … → claude-haiku-4-5 → gpt-5.4-nano（v5 去 vercel rung）
- 人格层：v5 主 agent = **当前会话本身**（overview："The main agent is your session"）；`/ulw-plan` 人格由 **Prometheus**（v4）改名 **Ultrawork Planner**（v5）；Sisyphus/Atlas/Prometheus/Metis/Momus 神话名退出 senpi 用户面，docs 改按角色命名（CHANGELOG："docs and omo.dev describe agents by role"）。
- 遥测 breaking：`delegation_started.name` / `delegation_completed.agent_type` 改报 plan-consultant/plan-reviewer；draft/plan frontmatter `review.momus` → `review.plan_reviewer`。

### 1.3 omo-codex（Codex 插件）：agent 名册两版相同

`packages/omo-codex/plugin/components/ultrawork/agents/` 两版均为 12 个 toml：`explorer`、`librarian`、`metis`、`momus`、`plan` + `lazycodex-worker-low/medium/high` + `lazycodex-code-reviewer`、`lazycodex-qa-executor`、`lazycodex-gate-reviewer`、`lazycodex-clone-fidelity-reviewer`。**codex 侧未跟随改名**。
组件目录变化：`codegraph/` 组件在 v5 从 omo-codex 移除（v5 全仓 packages 下 grep 不到 codegraph 代码，仅 CHANGELOG/evidence 归档提及"升级到 1.5.0、受控 runtime 再 provisioning"——外围变化，非 agent 体系）；`start-work-continuation/` → `ulw-execute-continuation/`（改名）。

---

## 2. Team Mode 组建机制

### 2.1 `docs/guide/team-mode.md` diff（18+/18-，针对性重写）

`git diff v4.19.4 v5.0.0-beta.53 -- docs/guide/team-mode.md` 关键变化：

1. **lead 声明移除**：v4 spec 示例含 `"lead": { "kind": "subagent_type", "subagent_type": "sisyphus" }`；v5 删除。v4 "write a top-level `lead: {...}` shorthand, mark one member with `isLead: true`…" → v5：**"The lead is always the current session, so there is no lead member to declare."** `team_create` 新增内联 spec `{ name, members: [{ name, category|subagent_type, prompt? }] }`。
2. **成员种类**：v4 category 成员 "routed through `sisyphus-junior`" → v5 "routed to the category worker, a fresh worker session configured by the category's model and skills"；未知 category 报 `UNRESOLVABLE_CATEGORY` 并列出可用项。`subagent_type`（别名 `"agent"`）= omo.json `agents` 里的用户自定义 agent。
3. **成员资格**：v4 "Eligible: sisyphus, atlas, sisyphus-junior；Conditional: hephaestus；Hard-reject: oracle, librarian, explore, multimodal-looker, metis, momus, prometheus" → v5 "**Eligible:** any resolvable category, and any user-defined agent.**Rejected at parse:** the curated read-only agents (`explore`, `librarian`, `plan-consultant`, `plan-reviewer`) and the ulw-loop reviewer trio (`omo-senpi-code-reviewer`, `omo-senpi-qa-executor`, `omo-senpi-gate-reviewer`)"，指向 `packages/senpi-task/src/team/member-validator.ts`。
4. `team_delete`：v4 "(lead only, no active members)" → v5 "rejects active members unless **`force: true`**"。
5. NOT-do 清单：v4 "No member-driven `delegate-task` (budget defaults to 0)" → v5 "Members are asked not to spawn further children (member guidance prompt); the `task` tool is not budget-gated to 0. Nested `team_create` is denied."
6. tmux pane 起始目录 "the repo root" → "`process.cwd()`"；存储布局删顶层 `~/.omo/.highwatermark`，新增 `tasks/claims/`（认领记录）与 `tasks/.highwatermark`（tasklist id 分配器）。
7. 未变：enable 配置（`team_mode.enabled` 等 11 字段）、12 个 `team_*` 工具、生命周期 5 步、mailbox `.delivering-` 预约语义、doctor 诊断。

注意：v4 代码里 senpi 路径已是"当前会话当 lead"（`packages/senpi-task/src/team/normalize.ts` 两版相同：`TEAM_LEAD_SENTINEL = "lead"`，"'lead' is reserved for the current-session sentinel"）；v4 文档描述的是 team-core 通用 loader 仍支持的旧声明式写法，v5 只是文档与 senpi 实现对齐。

### 2.2 组建机制（两版共性，核心代码几乎相同）

- **leader/member**：`team_create` 由 lead（当前会话）发起，经 BackgroundManager 为每个 member spawn 后台会话（`parentSessionId = leadSessionId`）。member 运行时 `agentType: "leader" | "general-purpose"`。
- **worktree 自动化**：可选、按成员（`"worktreePath": "../wt-scout"`，拒绝裸分支名；落于 `~/.omo/worktrees/{teamRunId}/{member}/`）；senpi 版落盘基目录改为 `<project>/.omo/senpi-task/teams/...`（`team-core/AGENTS.md` v5 新增段落，"consumed by omo-desktop"）。
- **tmux 布局**：`tmux_visualization: true` 时每成员一个 pane，经 `opencode attach` 挂成员会话跑完整 TUI；缺 tmux 不阻塞创建；`team_delete` 拆 layout，单成员关闭 rebalance（`team-layout-tmux/` 两版无改动）。
- **mailbox 通信**：文件式 per-member inbox（`runtime/{teamRunId}/inboxes/{member}/{uuid}.json`），live delivery 经 `promptAsync`；`.delivering-*.json` 预约文件成功入 `processed/`、失败回滚、崩溃 10 分钟 TTL 回收；fire-and-forget，仅 lead 可广播。
- **生命周期**：create → 委派（send_message/task_create）→ 成员 claim（`status:"claimed"`）→ shutdown 握手（request/approve/reject）→ delete 清理 state/worktrees/tmux。
- **v5 新增（上层，不在 team-core）**：spawn 时写入 `team_run_id/team_name/team_member_name/team_role:"member"` 并把 `child_session_id` 持久化到 TaskRecord（供 omo-desktop 关联）；member-revival（终态成员不再重生，TTL 锚定 `terminal_at`）；`messaging-fallback-wake.ts`（live delivery 落 fallback 后唤醒空闲成员，fixes #5317）；`describePlanError` 列出可用 agents/categories 便于重试。

### 2.3 `packages/team-core` diff

`git diff --stat`：仅 4 文件 **+136/-5**——`AGENTS.md`（+27，senpi 落盘布局文档）、`src/team-mailbox/inbox.ts`（+61，新增 `readUnreadMessageById()`，候选路径 `[reservation.inboxPath, reservation.reservedPath]`）、`src/team-mailbox/reservation.ts`（`buildReservation`→`buildDeliveryReservation` 改名导出）、`inbox.test.ts`（+49）。**架构结论：team-core 本体几乎没动**（team-registry/team-tasklist/team-layout-tmux/`types.ts` 均未改；v5 的 `AGENT_ELIGIBILITY_REGISTRY` 仍列 sisyphus/atlas/sisyphus-junior/hephaestus——opencode 版资格表未删）。真正的演进在上层：`packages/omo-opencode/src/features/team-mode`（+806/-37）与 `packages/senpi-task/src/team`（+697/-29）。team-core 消费方两版相同：omo-opencode、senpi-task、omo-senpi。

### 2.4 是否存在 TeamMode v3 / 新范式？

**不存在。** `git grep -il 'team.*v3\|v3.*team' v5.0.0-beta.53 -- 'packages/**/*.ts' 'docs/**'` 零命中（不限定路径时仅命中 minified 打包产物里 "team-message" 与变量名 "V3" 共现的误报）。变化性质是**演进而非 v3 范式**：lead=当前会话、神话名退役改角色名、成员-任务记录关联、fallback wake、member revival。v5 真正的"新组建范式"不是 team 的升级，而是新增了并列的 **mass-ulw / workflow DAG 拓扑**（见下节）。

---

## 3. ultrawork / ulw 体系与 team 的关系

### 3.1 各命令定义（两版对照）

| 命令 | v4.19.4 | v5.0.0-beta.53 |
|---|---|---|
| **/ultrawork**（实为关键词模式，非 slash 命令） | prompt 含 `ulw`/`ultrawork` 时 input hook 注入隐藏 directive（customType `omo-ultrawork:directive`）。绑定式 "CODE RED" 模式：首行必须 `ULTRAWORK MODE ENABLED!`；强制 `create_goal`、持久 notepad（`mktemp -t ulw-...`）、LIGHT/HEAVY tier triage、eval 批量并行、PIN→RED→GREEN→SURFACE→CLEAN 执行环、plan-gated reviewer 闸门。定义 `packages/omo-senpi/skills/ultrawork/SKILL.md` | 同机制；SKILL.md 大改 287 行：reviewer 改名 plan-consultant/plan-reviewer；明确计划必须命名 delegation topology（"a cooperating team (`team_create`) for interdependent lanes, parallel background `task` subagents for independent parts, per-part `category` routing"）；"overlapping units go to a team with per-member worktrees or run in sequence" |
| **/ulw-plan** | `packages/shared-skills/skills/ulw-plan/SKILL.md`，人格 **Prometheus**；explore-first 规划顾问，intent 路由 CLEAR/UNCLEAR，只读研究扇出（explore/librarian/metis/momus），高精度评审 = momus + Oracle 双评审；批准后写 `.omo/plans/<slug>.md`，执行交 `$start-work` | **新增 senpi 原生版** `packages/omo-senpi/skills/ulw-plan/SKILL.md`；人格改 **Ultrawork Planner**；评审改 **plan-reviewer-only**（一轮=一次完整计划评审，默认开启，5 轮上限）+ plan-consultant gap 分析 + architect/ultrabrain 顾问 lanes；执行交 `/ulw-execute` |
| **/ulw-execute**（= 旧 /start-work） | `packages/shared-skills/skills/start-work/SKILL.md` + opencode builtin 模板 `templates/start-work.ts`：**纯编排者绝不亲手实现**（"YOU ARE AN ORCHESTRATOR — NEVER THE IMPLEMENTER"），选 plan → 写 `.omo/boulder.json` → 逐 checkbox 并行派发 worker → 五道闸门验证 → 独立 AdversarialVerify。flags：`[plan-name] [--worktree <path>] [--make-pr] [--ship]` | **改名 /ulw-execute**（硬切换无 alias；config key `start_work`→`ulw_execute` 留一版弃用警告；ledger 路径 `.omo/start-work/ledger.jsonl`→`.omo/ulw-execute/ledger.jsonl`）。flags 不变。新增「Parallel delivery lanes」拓扑决策：独立 lanes→并行 worker burst；**有依赖顺序→每 wave 一个 `workflow` run（先读 mass-ulw）**；重叠 lanes→team；PR 模式→每 lane 一 worktree 一 PR；每 phase 独立 worktree + goal |
| **/ulw-loop** | `packages/omo-senpi/skills/ulw-loop/SKILL.md`；CLI `omo ulw-loop`，状态 `.omo/ulw-loop`；已含「Team mode: decide it, do not default to it」（只有两个条件同时成立——scope 无法干净切分 + 并行真的更快——才 `team_create`；成员每人独立 worktree、按单元落地、冲突归 lead） | CLI 改 `omo-agent-toolkit ulw-loop --session-id <id>`（session 隔离状态 + `.state.lock`）；新增 run contract：**每 goal = 一 phase = 自己的 worktree；有依赖顺序的 lanes 派成 ONE `workflow` run** |

重命名铁证：`git diff -M` 显示 `packages/shared-skills/skills/{start-work => ulw-execute}/SKILL.md`（similarity 53%）；`packages/omo-opencode/src/features/builtin-commands/commands.ts:60` 注册键 `"start-work"`→`"ulw-execute"`；hooks 目录、codex/senpi continuation 组件、config schema 全套改名。

### 3.2 mass-ulw-protocol（v5 全新）

- **mass-ulw 是什么**：v5 新增的 **DAG 编排体系**——技能 `packages/omo-senpi/skills/mass-ulw/SKILL.md` + 必读 `references/planning.md`，经原生 **`workflow` 工具**在 eval cell 驱动（JS SDK 在 `OMO_DAG_SDK_ROOT`）：`sdk.define({key,name})` → `dag.node({id, prompt, category, dependsOn})` → `sdk.start/wait`。`dependsOn` 只表顺序不传数据；**run 按依赖解锁以 parallel waves 执行**；一个 run 只覆盖一个 phase（下一阶段开新 run 或 amend）；恢复三动词 retry/send/amend（已完成节点缓存复用）；journaled 可断点续跑；改代码的图必须以 verification node 收尾（"TREAT AS FALSE UNTIL YOU PROVE IT"）。
- **扇出规模**：split-first 教条（默认 `quick` 类目、宽波；<3 节点视为 under-split）；每模型 slot limiter 默认 5 并发（`task.default_concurrency`）；上限 64 节点/run、16 run/session；mass research 第 1 波 **60+ 节点**故意 over-collect，再 fan-in 到多个 architect 切片 + 一个 reducer。
- **`docs/reference/mass-ulw-protocol.md`**（+292 行）本身是**外部 viewer 的 wire 合同**：4 个推送通道（`omo.dag.event` 唯一带 seq 的 WAL 账本，17 种 journaled 事件：run.created/started、wave.started、node.transitioned/retried、definition.amended、stream.overflow 等；`omo.dag.heartbeat` 15s；`omo.dag.activity` 150ms 合并遥测；`omo.dag.updated` 50ms 防抖全量快照）+ 4 个请求方法（`omo.dag.list/snapshot/history/subscribe`），schemaVersion=1，含 gap-free catch-up 与 overflow 恢复规则。ground 在 `packages/senpi-task/src/dag/types.ts` + `packages/omo-senpi/src/components/task/dag-rpc-bridge.ts`/`dag-rpc-handlers.ts`，有 doc↔code 一致性测试（`mass-ulw-protocol-doc.test.ts`）。
- **与 team 的关系**（planning.md "Dag or team"）：阶段型工作用 chained dags（免费获得 journaled resume/幂等 key/`/dag` 视图）；**需要工作中途对话（广播发现、多轮辩论、跨 re-tasking 累积上下文）用 `team_create`**——"A dag node takes ONE prompt at dispatch; ... the graph has no mid-run conversation between nodes"。mass-ulw 不取代 team/ulw-loop，而是嵌套为其 phase 执行引擎："Under `ulw-loop` or `ulw-execute`, that contract owns the goal, criteria, evidence, and checkpoints; this skill owns only how each phase's run is defined, driven, and recovered."
- v5 `docs/guide/orchestration.md` 重写（560→306 行）为四路决策表：`ulw` 关键词 / `/ulw-plan`+`/ulw-execute` / `mass-ulw`（有真实顺序）/ team mode（lanes 重叠需中途交流）。

### 3.3 核心结论

**ultrawork 默认不组队**：主 agent 经 `task` 工具以并行后台 subagent 扇出；team（`team_create`）是两版都要求"显式论证、按需付费"的拓扑（成员独立 worktree、按单元落地、冲突归 lead）；curated 只读 agent 两版均**被禁止做 team 成员**（"REJECTED as team members; route them through `task`, never `team_create`"）。v5 在此之上新增第三种拓扑 mass-ulw/workflow DAG，与 team 互补（dag 节点无中途对话，辩论类工作仍归 team）。

---

## 4. delegate / subagent 机制

### 4.1 `packages/delegate-core` diff：几乎无架构变化

`git diff --stat`：5 文件 **+17/-7**，文件清单两版完全一致。实质改动 3 处：

1. `src/model-selection.ts`：新增 `modelIDForProvider()`——fallback entry 的 model 若已带 `provider/` 前缀先剥离再 `transformModelForProvider`（fallback 解析 bugfix）。
2. `src/retry-patterns.ts` / `retry-guidance.ts`：修复提示的默认 spawn 模式反转——`"Add run_in_background=true (the standard spawn) or run_in_background=false for a short child whose result gates your very next call"`。
3. `AGENTS.md` 消费者清单修正（v4 称 "OpenCode edition only"，实际 senpi-task 在 v4 已 import 9 处；v5 新增 omo-senpi `model-profile/resolve.ts` 真实调用 `resolveModelForDelegateTask`）。

### 4.2 spawn 方式（两版对照）

两版均为双 edition：

| | omo-opencode | omo-senpi / senpi-task |
|---|---|---|
| 工具名 | 注册为 **`task`**（`plugin/tool-registry-core-tools.ts`：`tools.task = delegateTask`；目录名 delegate-task 是历史遗留）；`delegate_task` 只存在于 permission 兼容映射（`shared/permission-compat.ts`，两版相同）。伴随工具 `call_omo_agent` 直调只读 agent | **`task`**（`senpi-task/src/tools/task/tool.ts`：`TASK_TOOL_NAME = "task"`），从未叫 delegate_task；配套 `task_send`/`task_output`/`task_cancel` + lead-only team 工具 |
| 参数 | `prompt`、`description`、`category`/`subagent_type`（互斥必给其一）、`run_in_background`、**`task_id`（传 `ses_...` 续同 session，"FULL CONTEXT PRESERVED"）**、`load_skills`、`command`；**无批量参数**，并行靠多次 background 调用 | 同左但**无 task_id**；另有 `task_summary`、`name`、`model`（仅 subagent_type）、**`tasks:[...]` 批量（≤16）**；续聊用 `task_send`（to=id/name，可 revive 已结束的 resident child） |
| category 路由 | 两版均经 **Sisyphus-Junior** 中介 | v4 经 Sisyphus-Junior → **v5 直连 category worker**（senpi-task 中 Sisyphus-Junior 引用 2→0） |
| 后台/同步 | `true` → BackgroundManager 返回 `bg_...`，completion notification + `background_output`；`false` 同步轮询（30min 无活动窗口） | runner 分 in-process（默认，共享父工具闭包剔除 task_*/team_*）与 process（JSON-RPC 子进程），两版均有 |

### 4.3 v5 变化点清单

1. **spawn 哲学反转**：`run_in_background=true` 从"仅限 5+ 并行探索"升格为 **"the standard spawn"**；opencode 工具描述、senpi params、delegate-core retry 提示、plan agent 系统提示全部同步反转。
2. **senpi 去掉 Sisyphus-Junior 中介**：category 直接 spawn "category worker"（fresh worker session configured by the category's model and skills）；omo-opencode v5 仍保留 Sisyphus-Junior。
3. **新增 DAG 引擎 + `workflow` 工具**：`packages/senpi-task/src/dag/`（compileDag→依赖前沿准入调度、WAL journal、fingerprint run 复用/amend、crash recovery）+ `packages/omo-senpi/src/components/task/dag-tool.ts`（`WORKFLOW_TOOL_NAME = "workflow"`，v5 新增文件）。节点各选 category 或 subagent_type，无依赖节点并行至 resident-child 上限。
4. **builtin 名册重命名/扩充**：见 §1.2；plan-gated 门禁与触发词（start-work→ulw-execute）相应迁移。
5. **批量 spawn**：v5 给 `tasks[]` item 加 `run_in_background` 字段（v4 item 无）。
6. **session 挂起/复活重写（senpi-task lifecycle）**：shutdown 由销毁改为挂起（record → `persisted_only`/`rpc_detached`），session resume 时经 admission lease 批量 reclaim/respawn（`lifecycle/reconcile-revival.ts`、`admission-lease.ts`、两阶段 TTL tombstone）。
7. **team 工具面收窄**：lead 工具 7→6，**删除 `team_wait`**（"send with task_send, end the turn, and let the steered team-message notification resume the conversation"）。
8. **category 双重门控**：`requiresModel` 单 id → id 列表（ultrabrain/deep 由 "gpt-6-astra OR gpt-5.6-sol" 门控）；新增 `isCategoryChainViable` 剔除整条链不可解析的 builtin。
9. **omo-opencode delegate-task 小幅演进**（31 文件 +1208/-413）：`loadCurrentModelConfig()` 调用时重读 omo.json categories/agents；新增 `sync-session-cleanup.ts`、`category-model-availability`；工具名/参数/续聊语义不变。
10. **规模**：senpi-task 430 文件 +43158/-2977；omo-senpi 979 文件 +130179/-4777；delegate-core 5 文件 +17/-7。

**结论**：v5 没有重命名 spawn 工具（opencode 侧 `task`+`call_omo_agent`、senpi 侧 `task`，两版相同）；核心变化是 background=true 成为标准、senpi 去掉 Sisyphus-Junior 中介、新增 DAG/`workflow` 编排、删除 `team_wait`、session 挂起/复活重写；delegate-core 本身只是 bug 级小改。

---

## 5. model_profiles（v5 新增）对 agent→模型分配的影响

### 5.1 是否 v5 新增

是。`git grep -l 'model_profile' v4.19.4` → **0 命中**；v5.0.0-beta.53 → 25 文件。v4 唯一的 "profile" 概念是 `profiles` 配置层 overlay（`OMO_PROFILE`/`OCX_PROFILE` 激活），是完全不同的东西；v5 文档明确区分两者（`docs/reference/omo-json.md`："This is not the `profiles` key..."）。

### 5.2 三个内置 profile 的完整模型链

来源：`v5:packages/omo-senpi/src/components/model-profile/builtin-profiles.ts`（`BUILTIN_MODEL_PROFILES`；每个 rung = `{providers, model, variant}`，按序回退）：

- **capable**（默认推荐，最强通用）：claude-fable-5-1 (max) → claude-opus-5 (max) → kimi-k3 (max) → glm-5.3 (max)
- **simple-work**（快/便宜，小而有明确规格的修改）：gpt-5.6-luna-fast (low) → deepseek-v4-flash → claude-haiku-4-5
- **deep-work**（最大推理；**逐字复用 `deep` category 链**，有 deep-equal 测试防漂移）：gpt-6-astra (high) → gpt-5.6-sol (medium)

用户可在 `omo.json` 用 `model_profiles.<name>` 新增 profile 或**整体替换**同名内置（无字段级合并）。

### 5.3 解析 / 优先级 / 会话作用域语义

实现：`packages/omo-senpi/src/components/model-profile/{resolve.ts,index.ts}`；schema 在 `packages/omo-config-core/src/schema/config.ts`（`model_profiles` record + `model_profile` string）。

- **单键两用**：`model_profile` 值含 `/` 即 **pin**（字面 `provider/model`），否则按 profile id 处理（resolve.ts 注释："A value carrying a slash IS the pin... `settings.json` is never consulted"）。
- **优先级**：`--model` flag / scoped model（原样保留，profile 完全不运行）→ pin → profile（内置表被用户覆盖后取 registry 能服务的第一个 rung）→ senpi 默认（未设置 `model_profile` 时完全不干预）。
- **会话作用域**：仅对 fresh session（reason=startup/new 且无 cli/scoped provenance）应用一次/每 session；走 session-only setter（`persistDefault: false`），**绝不写 settings.json/omo.json**；rung 的 variant 映射为 senpi thinking level。会话中途失败走 senpi 自己的 `retry.fallbackChains`，不走 profile 链。
- **通知**：如 `omo-senpi: model profile "capable" selected anthropic/claude-fable-5-1 (skipped: ...); mid-session fallback follows senpi's retry chains`；无可用/空链/未知 id 各有对应文案。
- rung 匹配复用 `resolveModelForDelegateTask`（`packages/delegate-core/src/model-selection.ts`），与 category 链同一 matcher。

### 5.4 影响范围：**仅主会话模型**，不进入任何委派链

三重证据：

1. `docs/guide/agent-model-matching.md`："**A model profile picks the main session model and nothing else.** Every delegated child, curated agent or category, walks its own chain, and `model_profile` isn't consulted at any rung of that path."
2. `git grep model_profile v5.0.0-beta.53 -- packages/senpi-task packages/delegate-core` → **0 命中**（委派/分类解析路径完全不读 model_profile）；组件仅在 `packages/omo-senpi/src/extension/component-list.ts` 注册一次，只监听 `session_start`。
3. 在 `categories.*.models`/`agents.*.models` 中引用 profile id 会得到诊断："splicing a profile into a category chain is not supported yet: profiles pick the main session model and never enter a delegated child's chain"（`docs/reference/omo-json.md`）。

categories 与 curated agents 的分配机制不变：`omo.json` 覆盖（`categories.<name>.model(s)`/`agents.<name>.model(s)`，用户配置永远优先）→ 内置链（`senpi-task/src/category/fallback-chains.ts`、`senpi-task/src/agents/builtin/fallback-chains.ts`）→ 第一个能被已连接 provider 服务的 rung 胜出。唯一交集：`deep-work` profile 逐字复用 `deep` category 链；`profiles.<name>`（配置层 overlay）可以设置 `model_profile` 键。

---

## 附：关键文件索引

- 名册：`packages/omo-opencode/src/agents/types.ts` + `builtin-agents.ts`；`packages/model-core/src/agent-model-requirements.ts`；`packages/senpi-task/src/agents/builtin/{index,fallback-chains,plan-consultant,plan-reviewer,code-reviewer,gate-reviewer,qa-executor}.ts`；`packages/utils/src/migration/agent-names.ts`
- Team：`docs/guide/team-mode.md`；`packages/team-core/src/team-mailbox/{inbox,reservation}.ts`；`packages/senpi-task/src/team/{normalize,member-validator,spawn-members,member-revival}.ts`；`packages/omo-opencode/src/features/team-mode/tools/messaging-fallback-wake.ts`
- ulw：`packages/omo-senpi/skills/{ultrawork,ulw-plan,ulw-loop,mass-ulw}/SKILL.md`；`packages/shared-skills/skills/{start-work→ulw-execute,ulw-plan}/SKILL.md`；`docs/reference/mass-ulw-protocol.md`；`docs/guide/orchestration.md`
- delegate：`packages/delegate-core/src/{model-selection,retry-patterns}.ts`；`packages/omo-opencode/src/tools/delegate-task/`；`packages/senpi-task/src/tools/task/params.ts`；`packages/omo-senpi/src/components/task/dag-tool.ts`
- model_profile：`packages/omo-senpi/src/components/model-profile/{builtin-profiles,resolve,index}.ts`；`packages/omo-config-core/src/schema/config.ts`；`docs/guide/agent-model-matching.md`；`docs/reference/omo-json.md`
- 变更日志：`CHANGELOG.md`（v5 "Changed"/"Deprecated" 节含全部 rename 的官方确认）
