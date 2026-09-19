# Phase 3 开发计划：hook listener 移植

> **本目录**：[`docs/plans/phase3-dev/`](./) —— ROADMAP **Phase 3**（hook listener 移植）的实施计划。
>
> **上游依据**：[ROADMAP（中文）](../../roadmap_zh-CN.md) §4 Phase 3 · [决策 D14](../../decisions_zh-CN.md)（基线冻结）· [可行性报告 §1.2／§2.2／§16](../../feasibility-report_zh-CN.md) · [MVP PRD](../../mvp-prd_zh-CN.md)（V3 假设）· [MVP 踩坑 P-3](../../mvp-pitfalls_zh-CN.md)（listener 翻译模式实证）
>
> **配套文档**：[任务清单](./phase3-tasks.md) · [hook 清单与覆盖基线](./phase3-hooks.md)
>
> **状态**：📋 **计划已立项，待实施**。实施期实测对本文的回填、逐任务证据与退出标准核对见[任务清单](./phase3-tasks.md)。
>
> **修订记录**：（初稿，尚无修订）

---

## 1. 目标

**经 listener 翻译模式（MVP 已验证为 V3）把 OMO 的 hook 语义移植到 DSH 事件：OMO 在 opencode 适配层的 hook 模块，逐一以"监听 DSH 事件 + 语义等价效果"的 Cordis listener 形态重生，并由一份覆盖清单跟踪每个模块的"已移植 / 跳过（含理由）"。**

ROADMAP §4 Phase 3 原文：

- **范围**：按 §1.2 映射表移植约 30 个 hook 模块，去掉 `codegraph-bootstrap`（已死），`start-work` 内容按其 v5 名 `ulw-execute` 读取；优先级：文件护栏（write-existing-file-guard、bash-file-read-guard）→ todo/goal 执行器 → compaction 辅助 → 会话通知 → 其余。
- **关键约束**：凡 DSH 原生覆盖的 hook（`ctx.goals`、`ctx.compaction`、`ctx.todo`），直接用 DSH——不翻译 OMO 实现（README 原则一）。
- **退出标准**：每个移植的 hook 有 mock-LLM e2e 展示 DSH 事件 → OMO 语义效果；一份 hook 覆盖清单文档跟踪"已移植/跳过（含理由）"。

本阶段的成功标志不是"多几个 listener"，而是：**在 DSH 事件系统上重建 OMO 的"代理行为护栏层"——写文件前的读过校验、bash 读取劝导、todo 执行纪律、压缩时的上下文保全、会话状态通知——每一层护栏都有 e2e 证明 DSH 事件真实触发了 OMO 语义效果，且每个未移植的模块都有成文的、可审计的跳过理由。**

## 2. 上游依据与不可协商约束

本阶段受 ROADMAP §2（上游版本政策）与 §3（不可协商约束）同等约束。落到操作层面：

| 约束 | 来源 | 本阶段的具体含义 |
|---|---|---|
| **冻结基线 = OMO v4.19.4** | ROADMAP §2 规则 1 / D14 | hook 语义来源 = v4.19.4 tag（commit `b072d279110bdda2c6ac2525d0d24dc54d16148a`，与 Phase 1/2 同一锚点）的 `packages/omo-opencode/src/hooks/`；**只从 tag 取内容**（`git show v4.19.4:<path>`），不从工作树复制 |
| **命名锚点：start-work 按 v5 名 ulw-execute 读取** | ROADMAP §2 规则 6 / §4 Phase 3 | 移植 start-work hook 语义时，模块名、persona/注入文案、文档一律用 **`ulw-execute`**（v5 名），署名头注明 v4.19.4 源路径 `hooks/start-work/` |
| **codegraph-bootstrap 排除** | ROADMAP §4 Phase 3 / 可行性报告 §16.2 | 上游已删（v5 勘误），不移植，覆盖清单记"跳过（上游已删）" |
| **不追 beta** | ROADMAP §2 规则 2 | hook 语义取自 v4.19.4；不取 v5.0.0-beta.* 的 hook 重构（如 v5 把若干 hook 迁入 core 包的新组织） |
| **SUL-1.0 合规与署名** | ROADMAP §3 约束 1 / D10 / D15 | hook 移植是**语义移植**（新写 DSH listener 代码），不是 code vendor——但每个移植文件保留署名头（标明上游源文件，精确到 tag 路径 + "语义移植"声明），`THIRD_PARTY_NOTICES.md` 新增本阶段小节逐文件列出（沿用 Phase 2 persona 先例与 D15 逐文件精神） |
| **移植语义取自 harness-neutral core 层** | ROADMAP §3 约束 5 | ⚠️ **hook 恰恰在 opencode 适配层**（`packages/omo-opencode/src/hooks/`，直接依赖 `@opencode-ai/sdk` 的 `Hooks` 接口）——**不可 vendor、也不应 vendor**。可移植的语义是触发条件、判定逻辑、效果契约，形态 = 新写 DSH listener 代码。例外：当某 hook 的"大脑"真实住在 core 包（如 `comment-checker-core`、`rules-engine`），可按 Phase 1 vendoring playbook 单独 vendor 该 core 包——逐模块决策，记录在覆盖清单（§4.6） |
| **非商业** | ROADMAP §3 约束 2 / D8 | 无新增动作；署名文案不暗示商用授权 |
| **不给 OMO 提 PR；永不移除署名** | ROADMAP §3 约束 3 / D5 | 不向上游提交任何内容；既有署名条目只增不改 |
| **`verify-licenses` 常绿** | ROADMAP §3 约束 4 | 默认不新增 npm 依赖、不 vendor 新包，`checked` 计数应**不变**；若 vendor 了 core 包（上一条的例外），计数变化须有对应 NOTICES/manifest 条目（Phase 1 纪律） |
| **DSH 原生优先** | README 原则一 / ROADMAP §4 Phase 3 关键约束 | `goal/`（12 文件）、`preemptive-compaction*`（4 文件）、todo 工具语义已由 `dsh-goal` / `dsh-compaction` / `dsh-tool-todo` 原生覆盖的，**不翻译 OMO 实现**；`claude-code-hooks/`、`ralph-loop/` 同理（`dsh-hooks-claude-code`、DSH 原生 ralph）；逐模块判定并记录理由 |

## 3. 现状盘点（Phase 2 结项基线）

Phase 0–2 交付的、本阶段直接复用的资产：

| 构件 | 现状 | Phase 3 的影响面 |
|---|---|---|
| **V3 listener 翻译模式** | `omo-agents/src/hard-blocks-injection.ts`——1 个 `agent/pre-step` waterfall listener，observe + `agent.inject()` + `return next()` 纪律，文本 apply 时一次构建，disposer 返回 | **本阶段的方法论模板**；§4.2 把它抽象为模式 A，并新增 B–F 五类模式（首个**权威拒绝**型 listener 在本阶段诞生） |
| **omo-agents 插件** | `patches/omo-dsh/omo-agents/`（host-only cordis 插件，11 agent 名册 + 路由 + persona + boot markers） | **不动**。hook 进新插件 `omo-hooks`（§4.1），omo-agents 的 listener 保持唯一（名册相关注入），两插件各自独立 boot marker |
| **e2e 基础设施** | `tests/e2e/drive.mjs` + `mock-llm-server.mjs`：mock-LLM 沙箱、MOCKROLE 名册驱动注入（P2-T18 泛化）、**`tool_calls` 并行批次支持**（P2-T18）、7 场景 | 护栏类 hook 的 e2e 需要 mock 发 **write/bash 工具调用**——tool_calls 通道已就绪；session JSONL 断言通道既有 |
| **门链** | `scripts/ci-local.sh` 8 门全绿（门 2 = 432 单测，门 3 = 7 场景，门 5 `checked=52`，门 6 = c01–c10，门 8 = 3 proofs） | 全部保持绿；新增 omo-hooks 的静态断言与 probe marker **扩展既有门**，不加新门、不绕过旧门 |
| **挂载机制** | 根 `cordis.yml` 的 `- insert:` patch 行（P-8 schema 实证）+ `dsh plugin --profile add` + pnpm workspace `patches/omo-dsh/*` | omo-hooks 作为第二个 `- insert:` 行挂载；workspace glob 已覆盖，无需改 pnpm-workspace.yaml |
| **DSH 事件面（已在 pinned 0.1.5-rc.1 实测存在）** | `agent/pre-step`（waterfall，MVP 实证）；`tools/pre-execute` waterfall（dsh-tools lib:3116，默认 `{ kind: "allow" }`）；`tools/post-execute` waterfall（lib:3378，默认 `{ kind: "accept" }`）；`agent/turn-stopping`（serial，dsh-agent-loop:967）；`session/event`、`agent/status`；`ctx.goals`/`ctx.compaction`/`ctx.todo`/`ctx.jobs` 服务（base composition 实有） | §1.2 映射表的目标事件全部实有；**决策种类的精确词汇表**（deny/block/replace/add-context 各形态）由 P3-T1 逐件核实（Q-1） |
| **上游 OMO 检出** | `~/GithubRepo/oh-my-openagent`，v4.19.4 = `b072d279…` 只读可用 | P3-T1 逐模块复核的唯一来源 |

**§1.2 映射表与 v4.19.4 实际树的差距（诚实声明）**：§1.2 统计了约 30 个 hook 模块；v4.19.4 tag 的 `hooks/` 树实际有 **59 个目录 + 7 个单文件模块**（含 `shared/` 辅助目录与 5 个 `zauc-mocks-*` 测试设施）——报告写作时的快照早于冻结 tag。P3-T1 的首要产出就是**权威清单**（[hook 清单与覆盖基线](./phase3-hooks.md) 从草案转实测），每个模块的处置（移植 / DSH 原生跳过 / 阶段外 deferred / 排除）逐一落行。

## 4. 方案设计

### 4.1 新插件 `omo-hooks`：名册化的 hook 注册处

hook 模块约 25+ 个移植目标，若散进 omo-agents 会把该插件从"名册"变成"杂物间"；可行性报告 §4.4 的框架拓扑本就预留了 `patches/omo-dsh/omo-hooks/` 位置。设计：

- **新包** `patches/omo-dsh/omo-hooks/`（`@oh-my-opendsh/omo-hooks`），host-only cordis 插件，布局镜像 omo-agents（`package.json` / `tsconfig.host.json` / `src/index.ts` + 每 hook 一个 `src/hooks/<name>.ts`）。
- **单一事实源 `src/manifest.ts`**（roster.ts 先例）：每个移植 hook 一条声明——`id`（kebab-case，v5 命名锚点适用处用 v5 名）、上游源路径（tag 相对路径，逐文件）、目标 DSH 事件、模式（§4.2 A–F）、效果摘要、e2e 场景名。覆盖清单文档由 manifest **派生核对**（单测断言文档行 ↔ manifest 条目，防名册漂移——delegation-roster.test.ts 先例）。
- **挂载**：根 `cordis.yml` 增加第二个 `- insert:` 行（`id: omo-hooks`）；cold-start / probe / doctor-lite / 静态门相应扩展（§4.7）。
- **boot marker**：`[omo-hooks] hook <id> registered on <event>` 逐 hook 一行 + 一行汇总（probe 断言锚点）；loud-but-non-fatal 纪律（单 hook 注册失败不拖垮其余，P2-T16 先例）。
- **与 omo-agents 的边界**：名册/persona/路由/hard-blocks 注入留 omo-agents；**行为护栏**（文件护栏、todo 纪律、压缩辅助、通知、其余 hook 语义）进 omo-hooks。两插件无相互 import；共享的 dsh 结构类型声明各自维持 minimal structural typings（hard-blocks-injection.ts 既有纪律——本 workspace 无 dsh 依赖）。

### 4.2 Listener 模式分类法（A–F）

§1.2 映射表落到 pinned dsh 的六种注册形态。每个移植 hook 在 manifest 里声明其一；**模式即测试夹具**——同模式 hook 共享单测脚手架：

| 模式 | DSH 事件 | 语义 | 对应 OMO hook 形态 | 先例 |
|---|---|---|---|---|
| **A 注入型 pre-step** | `agent/pre-step` waterfall | 观察 + `agent.inject()` 添上下文，永不权威，恒 `return next()` | directory-readme-injector、monitor-status-injector（类） | hard-blocks-injection.ts（V3 实证） |
| **B 权威 pre-execute 门** | `tools/pre-execute` waterfall | **可拒绝**：返回 deny 决策阻断工具调用，或放行 | write-existing-file-guard、team-tool-gating（后者 Phase 5） | **本阶段首个**——P3-T1 先核实决策词汇表（Q-1） |
| **C 劝导演出型 pre-execute** | `tools/pre-execute` waterfall | 不阻断，附加 warning/message 后放行 | bash-file-read-guard（上游设 `output.message` 而非 deny） | P3-T1 核实 dsh 的"放行但附加"决策形态 |
| **D 改写型 post-execute** | `tools/post-execute` waterfall | 变换/截断/注解工具结果 | tool-output-truncator、edit-error-recovery、todo-description-override、plan-format-validator | P3-T1 核实 `{ kind: "accept" }` 外的决策形态 |
| **E 停止票 turn-stopping** | `agent/turn-stopping` serial | 对"回合将停"投票续行 | todo-continuation-enforcer、stop-continuation-guard、keyword-detector（Phase 4） | dsh-agent-loop:967 实证事件存在；语义 P3-T1 核实 |
| **F 观察型 session/status** | `session/event` / `agent/status` | 只观察，产生副作用（写日志/发通知） | session-notification-*、session-todo-status、background-notification | dsh-api-session-controller 等处实证 |

**纪律（全模式通用）**：① 事件负载只读叶字段，不 dump live 对象；② listener 出错不得使会话/工具管线崩（loud-but-non-fatal；B 模式的"拒绝"必须是**显式决策**而非异常——P3-T1 核实 waterfall 对 throw 的处理，Q-1）；③ 注册返回 disposer 归当前 Fiber（stop/update 可逆）；④ 静态文本 apply 时一次构建，不在事件路径上读盘。

### 4.3 优先级分组（ROADMAP 指定顺序）

| 组 | 模块（v4.19.4 路径，hooks/ 下） | 模式 | 为何此序 |
|---|---|---|---|
| **P0 文件护栏** | `write-existing-file-guard/`（5 文件）、`bash-file-read-guard.ts`（1 文件） | B + C | ROADMAP 第一优先；直接防止"覆写未读文件"这类高代价 agent 事故；语义自包含、上游文件少 |
| **P1 todo/goal 执行器** | `todo-continuation-enforcer/`、`todo-description-override/`（4）、`session-todo-status.ts`、`task-reminder/`、`empty-task-response-detector.ts` | E/D/F/A | todo 纪律是协奏执行质量的骨干；`goal/`（12 文件）按关键约束**不移植**（dsh-goal 原生） |
| **P2 compaction 辅助** | `compaction-context-injector/`、`compaction-todo-preserver/` | A/F（挂 `ctx.compaction` 相关事件——确切事件 P3-T1 核实） | 与 DSH 原生压缩**协作**而非取代；`preemptive-compaction*`（4 文件）**不移植**（dsh-compaction 原生，关键约束） |
| **P3 会话通知** | `session-notification-*`（约 14 文件）、`background-notification/` | F | 用户可观测性；平台特定后端（macos/windows）按 D9 收窄——Windows 出范围，macOS 后端以平台抽象 + log 后端移植（§6 R-4） |
| **P4 其余在范围模块** | `tool-pair-validator/`（8）、`plan-format-validator/`（3）、`edit-error-recovery/`（3）、`json-error-recovery/`、`tool-output-truncator.ts`、`question-label-truncator/`（3）、`comment-checker/`、`stop-continuation-guard/`（3）、`monitor-status-injector/`（3）、`directory-readme-injector/`（7）、`agent-usage-reminder/`、`task-resume-info/`、`webfetch-redirect-guard/`（4）、`atlas/`、`prometheus-md-only/`、`notepad-write-guard/`、`sisyphus-junior-notepad/`（3）、`tasks-todowrite-disabler/`、`unstable-agent-babysitter/`、`fsync-skip-warning/` 等 | 各异 | ROADMAP"其余"；按模式聚批移植（WP-6），每批内先小后大 |
| **P5 ulw-execute**（= start-work hook 语义） | `start-work/`（20 文件） | A/E + `ctx.jobs` | 体量最大的单模块；激活目标 atlas 已就位（Phase 2）；**命令面 `/ulw-execute` 属 Phase 4**，本阶段只移植 hook 的激活/脚手架语义（§4.5 边界） |

每组的**确实范围**以 P3-T1 逐模块复核为准（§4.4 的清单是草案）；复核发现"语义实为 opencode 平台耦合、无 OMO 行为语义"的模块（候选：`auto-update-checker`、`legacy-plugin-toast`、`auto-slash-command`、`fsync-skip-warning`、`interactive-bash-session`、`non-interactive-env`）从移植组移入跳过清单并记理由（DoD-d：改文档不改结论）。

### 4.4 跳过/deferred 清单（草案，P3-T1 核定）

| 模块 | 处置 | 理由 |
|---|---|---|
| `goal/`（12 文件） | **跳过（DSH 原生）** | 关键约束：`dsh-goal` + `dsh-tool-goal` + `dsh-command-goal` 原生覆盖（base composition 实有） |
| `preemptive-compaction*`（4 文件） | **跳过（DSH 原生）** | 关键约束：`dsh-compaction` + `dsh-compaction-basic` + `dsh-compaction-tool-result-pruner` |
| `claude-code-hooks/`（20+ 文件） | **跳过（DSH 原生）** | §1.2 定论："DSH `hooks-claude-code` 直接吃"用户配置；OMO 自家的 opencode 适配翻译无 DSH 对应需求 |
| `ralph-loop/` | **跳过（DSH 原生）** | DSH 原生 ralph 能力（可行性报告 §2.2 的 15% 直接删名单） |
| `codegraph-bootstrap/` | **排除（上游已删）** | ROADMAP 明示；codegraph 已死（§16.2） |
| `keyword-detector/`（13 文件） | **deferred → Phase 4** | ultrawork/hyperplan/team 关键词模式 = 命令面，ROADMAP Phase 4 范围 |
| `team-mailbox-injector/`、`team-mode-status-injector/`、`team-session-events/`、`team-tool-gating/` | **deferred → Phase 5** | Team Mode 邻域（v5 模型，DSH 原生） |
| `model-fallback/`（5 文件） | **跳过（DSH 无 fallback 语义）** | 可行性报告 §12.5 已裁定 `model-unavailable` = error；Phase 2 同决策（retry/fallback wrapper = Phase 7 硬化候选） |
| `hashline-edit-diff-enhancer/`、`hashline-read-enhancer/` | **deferred → Phase 6** | 编辑模型决策（hashline vs str-replace-editor）未裁定前不移植其增强器 |
| `ast-grep-sg-provision/` | **deferred → Phase 6** | ast-grep  provisioning 随 Phase 6 MCP 面 |
| `no-hephaestus-non-gpt/`、`no-sisyphus-gpt/` | **跳过（语义不适用）** | OMO 模型链身份守卫；DSH 路由在配置（Phase 2 roster），persona 已按 DeepSeek 座适配（R-3 记录） |
| `category-skill-reminder/` | **deferred → Phase 5** | category 体系 = Team Mode 邻域（Phase 2 同决策） |
| `delegate-task-retry/` | **deferred → Phase 5**（P3-T1 复核） | delegate-core 任务重试与 team 委派生命周期耦合 |
| `auto-update-checker/`、`legacy-plugin-toast/`、`auto-slash-command/` | **跳过（opencode 平台耦合）** | 无 OMO 行为语义，纯宿主平台适配 |
| `zauc-mocks-*`（5 目录）、`shared/` | **非 hook（上游测试设施/辅助）** | 不进覆盖清单的移植计数，清单附注说明 |

### 4.5 ulw-execute 的 Phase 3/4 边界

ROADMAP 把 start-work **hook 语义**列在 Phase 3（按 v5 名 ulw-execute 读取），把 `/ulw-execute` **slash 命令**列在 Phase 4。边界：

- **Phase 3 移植**：hook 的激活检测（用户请求中的工作计划意图）、计划发现/上下文构建、脚手架语义——以 `agent/pre-step` 注入 + `ctx.jobs` 形态（§1.2 映射）；persona 与注入文案中的命令引用一律写 `ulw-execute`（命名锚点）。
- **Phase 4 才做**：`/ulw-execute` 命令注册（`ctx.commands`）与 atlas 完整编排流（Phase 2 §9 已声明）。
- P3-T1 复核 start-work 20 个文件，把"hook 语义"与"命令面胶水"逐文件分开，分不动的整体移 Phase 4 并记理由（DoD-d）。

### 4.6 core 包 brain 的 vendor 例外（收窄的）

默认 = 不 vendor，纯 listener 重写。例外判定（逐模块，记入覆盖清单）：当 hook 的判定逻辑**实质住在** 19 个 core 包之一（候选：`comment-checker` → `comment-checker-core`；`hephaestus-agents-md-injector`/`directory-agents-injector` → `agents-md-core`），按 Phase 1 vendoring playbook vendor 该 core 包、`verify-licenses` 与 NOTICES 同步（D15/D16 既有机制）。⚠️ **前置检查**：该 core 能力是否已被 DSH 原生覆盖（`dsh-agent-instructions` 实有——AGENTS.md 注入类 hook 极可能判"DSH 原生跳过"而非 vendor；P3-T1 + Q-5 裁定）。

### 4.7 门与 e2e 扩展

退出标准 a（每移植 hook 有 mock-LLM e2e 展示 DSH 事件 → OMO 语义效果）与 b（覆盖清单常绿）落到既有 8 门链的扩展，**不加新门、不绕过旧门**：

| 层 | 扩展内容 |
|---|---|
| **L1 单测（门 2）** | ① 每 hook 的判定逻辑单测（上游有测试文件的，**移植其用例**——语义保真的最强抓手）；② 六模式共享脚手架（伪造 payload/next/决策断言）；③ manifest ↔ 覆盖清单文档一致性测试（行数、id 集合、状态枚举）；④ boot marker 纯函数测试（P2-T16 先例） |
| **e2e（门 3）** | 每移植 hook ≥ 1 场景（小而专，复用既有沙箱）：护栏类 = mock 发违规 write/bash 调用 → 断言 deny/warning 决策 + session log 效果 + 对照组（合规调用放行）；注入类 = 断言注入内容出现在子级/主级上下文；通知类 = 断言通知副作用（log 后端）；turn-stopping 类 = 剧本构造"todo 未完但回合将停" → 断言续行票。tool_calls 通道（P2-T18）已支持 mock 发工具调用 |
| **doctor-lite（门 4）** | omo-hooks 行的 Config schema 校验 + cordis.yml 双 insert 行断言 |
| **concerto-static（门 6）** | 新增 omo-hooks 静态断言组（**延续 c 编号**，如 c11+）：cordis.yml 恰好 2 个 insert 行（omo-agents + omo-hooks）、omo-hooks 包的署名头覆盖（每 src/hooks/*.ts 含上游源标注）、manifest 与文件集合一致。c01–c09 断归档路径不动，c10 断 live 名册不动 |
| **probe（门 8）** | 冷启动日志断言 `[omo-hooks] hook <id> registered on <event>` 逐 hook 行 + 汇总行；prove 脚本对护栏 hook 的"deny 决策真实生效"做 session 级证明（prove-explore-toolfilter.mjs 先例——真实注册表 + stub 工具体） |
| **L4 真模型手动冒烟（非 CI）** | 一次手工 run 真实触发 2–3 个护栏（如故意让 agent 覆写未读文件）；证据进 `.omo/evidence/`（gitignored），结论回填任务清单 |

### 4.8 覆盖清单文档（退出标准 b 的载体）

[hook 清单与覆盖基线](./phase3-hooks.md) 从计划期即建立，三列核心：**模块（v4.19.4 路径）· 处置（已移植/DSH 原生跳过/deferred/排除/非 hook）· 理由与证据（e2e 场景名/跳过依据）**。每移植完成一个 hook，状态从"待移植"翻"已移植（场景 xxx）"；P3-T1 把草案清单转实测清单；manifest ↔ 清单一致性由门 2 钉死（§4.7）。

### 4.9 署名与合规

- 每个移植的 listener 文件头部署名注释：上游源文件（tag 相对路径，逐文件列出）+ "语义移植，非逐字复制"声明（persona 署名头先例的代码版）。
- `THIRD_PARTY_NOTICES.md` 新增 "Phase 3 hook semantic ports" 小节：逐文件列出移植产物 ↔ 上游源（D15 逐文件精神沿用到派生代码）。
- 默认零新增 npm 依赖、零新 vendor：`verify-licenses` 的 `checked` 应**不变**（52）；若触发 §4.6 vendor 例外，按 Phase 1 全套（manifest/NOTICES/NOTICE.md/license 字段）落地，计数变化有对应条目。

## 5. 退出标准与证据

ROADMAP §4 Phase 3 给出 2 条退出标准，逐条落到可执行证据：

| # | ROADMAP 原文 | 证据（本计划的关键判定） |
|---|---|---|
| **a** | 每个移植的 hook 有 mock-LLM e2e 展示 DSH 事件 → OMO 语义效果 | 覆盖清单每行"已移植"状态带 e2e 场景名；门 3 全绿；每场景含**对照断言**（合规路径不受护栏误伤） |
| **b** | 一份 hook 覆盖清单文档跟踪"已移植/跳过（含理由）" | [phase3-hooks.md](./phase3-hooks.md) 全模块有终态 + 理由；manifest ↔ 清单一致性测试绿；清单覆盖 v4.19.4 树的**全部** hook 模块（无一漏列——含"非 hook"附注） |

**DoD 补充**（沿用 Phase 1/2 的 c/d/e）：

- **c**：`scripts/ci-local.sh` 全 8 门绿（门扩展只加严不放松——c 组新断言不得让既有断言变弱）。
- **d**：本计划目录文档与实测无冲突——凡 P3-T1 复核推翻计划假设处（如 §4.3/§4.4 草案分组与实际语义不符），改文档而不是改结论。
- **e**：未移除任何既有署名；`verify-licenses` 的 `checked` 计数与基线（52）一致，或 vendor 例外有对应 NOTICE/manifest 条目；`THIRD_PARTY_NOTICES.md` 既有条目只增不改。

**明确不属于退出标准**（避免范围蔓延）：

- ❌ `/ulw-execute`、`/ulw-plan` 等 slash 命令注册（Phase 4）；keyword-detector 关键词模式（Phase 4）
- ❌ team-* 四模块与 category 体系（Phase 5）；Team Mode 成员资格语义
- ❌ hashline 编辑增强器、ast-grep provisioning、LSP（Phase 6）
- ❌ 模型 fallback 链 / retry wrapper（Phase 7 硬化候选）
- ❌ OMO hook 的 opencode UI 副作用（toast、status 栏渲染）的像素级复刻——DSH 无对应表面的以 log/notification 语义等价落地
- ❌ `claude-code-hooks/` 的用户配置执行（`dsh-hooks-claude-code` 原生覆盖，非本阶段产出）

## 6. 风险与开放问题

| # | 风险 / 问题 | 影响 | 处置 |
|---|---|---|---|
| **R-1** | **§1.2 清单与 v4.19.4 实际树漂移**：§1.2 约 30 模块 vs 实际约 55+（含 §1.2 未列的 `todo-continuation-enforcer`、`atlas/`、`think-mode/` 等）；移植范围算错 | 高（范围） | P3-T1 以 tag 树为唯一权威生成全量清单（§4.3/§4.4 均为草案）；覆盖清单全模块有终态是退出标准 b 的硬判定 |
| **R-2** | **权威门语义未证实**：`tools/pre-execute` 的 deny 决策词汇表、waterfall 中 throw 的 fail-open/fail-closed 行为未在 pinned dsh 逐字核实 | 高（P0 护栏的形态） | P3-T1 读 installed lib 钉死决策种类 + throw 语义（Q-1）；若 deny 形态不存在，降级为 C 模式（warning）并记坑——**护栏变劝导是语义降级，必须显式记录** |
| **R-3** | **hook 语义移植失真**：代码逻辑翻译比 persona 浓缩更易走样（边界条件、正则、状态机） | 高（质量） | 上游有测试文件的**移植其测试用例**作为我们的单测种子；每 hook 单测 + e2e 双层；评审逐文件对照上游 |
| **R-4** | **通知类 hook 的平台耦合**：macos/windows 后端在 CI 不可验，Windows 出范围（D9） | 中 | 移植平台抽象 + log 后端（CI 可验语义）；macOS 后端代码可移植但仅 L4 手工验证；Windows 后端不移植（D9） |
| **R-5** | **多 listener 同事件排序/相互干扰**：omo-agents 的 pre-step 注入 + omo-hooks 的若干 pre-step/pre-execute listener 共存 | 中 | waterfall 纪律（非权威恒 next()）；单测模拟多 listener 链；boot 顺序在 cordis.yml 行序中固定 |
| **R-6** | **e2e 剧本复杂度**：护栏场景需要 mock 精确发出"违规工具调用"，turn-stopping 场景需要构造"将停未停"回合 | 中 | tool_calls 通道已就绪（P2-T18）；每模式先做一个**模式打样场景**（P0 两护栏即 B/C 模式打样），同组复用 |
| **R-7** | **范围误读**：产出被理解为"OMO 工作流已可用"（实际命令面/Team Mode 仍缺席） | 低（沟通） | README/CHANGELOG 写明：hook 护栏层 ≠ `/ulw-*` 命令面（Phase 4）≠ Team Mode（Phase 5） |
| **R-8** | **与 DSH 原生语义重复**：todo-continuation-enforcer 与 dsh-goal-round-driver 的续行语义可能重叠或冲突 | 中 | 每 hook 过"DSH 原生优先"检查（P3-T1 逐模块记录）；重叠处以 DSH 原生为主、OMO 语义收窄为补充并记录 |
| **R-9** | **listener 异常击穿管线**：pre-execute waterfall 中 throw 若 fail-closed 会冻结全部工具调用 | 高（稳定性） | Q-1 核实 throw 语义；所有 listener 体 try/catch 自包（loud-but-non-fatal）；门 8 prove 断言"护栏 listener 抛错时工具调用不死" |

### 开放问题（实施中回答，不阻塞启动）

| # | 问题 | 何时回答 |
|---|---|---|
| Q-1 | `tools/pre-execute` / `tools/post-execute` waterfall 的完整决策词汇表（deny/block/replace/add-context 各形态的确切 kind 与字段）、listener throw 的 fail-open/closed 语义 | P3-T1（读 installed dsh lib） |
| Q-2 | `agent/turn-stopping` 的投票协议（续行/停止的决策形状、多 listener 合成规则） | P3-T1 |
| Q-3 | compaction 辅助 hook 应挂的 DSH 事件（`ctx.compaction` 是否有 before/after 钩子事件） | P3-T1 |
| Q-4 | session-notification 的事件源（`session/event` 的哪些事件类型驱动通知调度） | P3-T12 前 |
| Q-5 | 哪些 hook 有值得 vendor 的 core 包 brain（候选 comment-checker-core / agents-md-core / rules-engine），以及 `dsh-agent-instructions` 是否已原生覆盖 AGENTS.md 注入 | P3-T1 |

## 7. 工作包与估算

按 ROADMAP §7 的定性惯例（无 buffer、非承诺，R3），仅给工作量级：

| 工作包 | 内容 | 任务 | 量级 |
|---|---|---|---|
| **WP-0 调研核对** | v4.19.4 全量 hook 清单 + DSH 事件面逐件核实（Q-1/2/3/5）→ 覆盖基线转实测 | P3-T1 | ~1 天 |
| **WP-1 插件骨架** | omo-hooks 包 + manifest.ts + 挂载（cordis.yml/cold-start/doctor-lite/probe marker） | P3-T2 … P3-T3 | ~1 天 |
| **WP-2 P0 文件护栏** | write-existing-file-guard + bash-file-read-guard 移植 + 单测 + e2e（B/C 模式打样） | P3-T4 … P3-T6 | ~1.5 天 |
| **WP-3 P1 todo 执行器** | todo-continuation-enforcer 等 5 模块 + 单测 + e2e（E 模式打样） | P3-T7 … P3-T9 | ~1.5 天 |
| **WP-4 P2 compaction 辅助** | 2 模块 + 单测 + e2e | P3-T10 … P3-T11 | ~1 天 |
| **WP-5 P3 会话通知** | session-notification（平台抽象 + log 后端）+ background-notification + e2e | P3-T12 … P3-T13 | ~1.5 天 |
| **WP-6 P4/P5 其余 + ulw-execute** | 按模式聚批移植（21 模块 = 20 + ulw-execute）+ e2e | P3-T14 … P3-T18 | ~3.5 天 |
| **WP-7 门扩展** | 静态门 c 组 / doctor-lite / probe / proofs 扩展 | P3-T19 | ~0.5 天 |
| **WP-8 收口** | 署名、README/docs、覆盖清单终态、退出标准核对 + L4 | P3-T20 … P3-T21 | ~1 天 |

**合计 ≈ 12.5 人日**。体量主体在 WP-6（模块数量）与 WP-2/3（模式打样成本摊薄后续批次）。R1 风险（清单漂移）若实测模块数显著超出草案，WP-6 按模式批次的粒度自然吸收，估算随 P3-T1 回填修正。

## 8. 交付物清单

| 交付物 | 路径 | 类型 |
|---|---|---|
| omo-hooks 插件 | `patches/omo-dsh/omo-hooks/`（package.json / tsconfig / `src/index.ts` / `src/manifest.ts` / `src/hooks/*.ts`） | 代码 |
| 挂载 | 根 `cordis.yml` 第二个 `- insert:` 行 | 配置 |
| 测试 | `tests/omo-hooks/`（单测 + manifest↔清单一致性）· `tests/e2e/` 新增 hook 场景 | 测试 |
| 门扩展 | `scripts/verify-concerto-static.mjs`（c 组扩展）· `doctor-lite*` · `concerto-mode-probe.sh` · proofs | 配置 |
| 覆盖清单 | [`docs/plans/phase3-dev/phase3-hooks.md`](./phase3-hooks.md)（全模块终态 + 理由） | 文档 |
| 署名 | `THIRD_PARTY_NOTICES.md` 新增 Phase 3 小节 + 每 listener 文件署名头 | 合规 |
| 说明 | `README*.md`（hook 护栏层 ≠ 命令面 ≠ Team Mode）· `CHANGELOG.md` · `docs/mvp-pitfalls*.md`（新坑，如有） | 文档 |
| **本计划目录** | `docs/plans/phase3-dev/phase3-plan.md`（本文）· [`phase3-tasks.md`](./phase3-tasks.md) · [`phase3-hooks.md`](./phase3-hooks.md) | 文档 |

## 9. 与后续阶段的关系

- **Phase 4（slash 命令与 skills）**：`/ulw-execute` 命令注册消费本阶段的 ulw-execute hook 语义与 atlas 绑定；keyword-detector 的关键词检测与本阶段移植的 pre-step 注入面（模式 A）共享注册处；stop-continuation-guard 的命令面（stop-continuation 命令）届时对接本阶段已移植的 guard listener。
- **Phase 5（Team Mode）**：team-* 四模块届时以本阶段的模式分类法（A–F）与 manifest 机制移植；member 资格语义消费 Phase 2 名册 class 字段。
- **Phase 6（MCP 与编辑）**：hashline 编辑决策裁定后，hashline-*-enhancer 两模块按本阶段模式移植（很可能 D 模式 + Phase 1 已 vendor 的 hashline-core）。
- **Phase 7（硬化）**：model-fallback 的 retry/fallback wrapper 重议；本阶段积累的模式打样与 prove 机制纳入发布矩阵。
