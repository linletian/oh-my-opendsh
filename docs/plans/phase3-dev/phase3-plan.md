# Phase 3 开发计划：hook listener 移植

> **本目录**：[`docs/plans/phase3-dev/`](./) —— ROADMAP **Phase 3**（hook listener 移植）的实施计划。
>
> **上游依据**：[ROADMAP（中文）](../../roadmap_zh-CN.md) §4 Phase 3 · [决策 D14](../../decisions_zh-CN.md)（基线冻结）· [可行性报告 §1.2／§2.2／§16](../../feasibility-report_zh-CN.md) · [MVP PRD](../../mvp-prd_zh-CN.md)（V3 假设）· [MVP 踩坑 P-3](../../mvp-pitfalls_zh-CN.md)（listener 翻译模式实证）
>
> **配套文档**：[任务清单](./phase3-tasks.md) · [hook 清单与覆盖基线](./phase3-hooks.md)
>
> **状态**：📋 **计划已立项，待实施**。实施期实测对本文的回填、逐任务证据与退出标准核对见[任务清单](./phase3-tasks.md)。
>
> **修订记录**：
>
> - **2026-09-19 P3-T1 调研回填与仲裁**（证据：`.omo/evidence/p3t1-*.md` 5 份，关键机制引用经仲裁抽核属实）——① §4.2 模式 C/E 机制更正（pre-execute 无 advisory 形态 → C 落 post-execute `accept+additionalContexts`；turn-stopping 非投票 → E = `agent.steer()` 副作用）；② 移植组 32 → **15**（17 模块移出：无 DSH 接缝/无病/依赖未移植子系统跳过 12、helper 并入 1、deferred 4）；**WP-4（compaction 辅助）整组取消**（H-08/H-09 均 DSH 原生覆盖）；③ §4.4 跳过表扩为 46 行（含补登 S-28 rules-injector / S-29 runtime-fallback / S-30 read-image-resizer 三行——对账裁定草案漏列 118 文件）；④ §4.5 ulw-execute 口径更正（20:0 划分，激活 marker 随 Phase 4）；⑤ §4.6 comment-checker 裁定 deferred；⑥ §6 R-2/R-4/R-9 口径按实测修正；⑦ §7 估算 12.5 → ~8.5 人日。全部更正按 DoD-d 落文档，覆盖基线 §4 待核清单全部闭环。

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
| **A 注入型 pre-step** | `agent/pre-step` waterfall | 观察 + `agent.inject()` 添上下文，永不权威，恒 `return next()` | directory-readme-injector（类）、atlas 注入段 | hard-blocks-injection.ts（V3 实证） |
| **B 权威 pre-execute 门** | `tools/pre-execute` waterfall | **可拒绝**：返回 `{kind:'deny', reason}` 阻断（agent 见 `Error: <reason>` 的 isError 结果）；放行 = `next()`/allow；另有 `ask` 决策（审批通道，本阶段不用） | write-existing-file-guard、prometheus-md-only、notepad-write-guard（类） | ✅ **P3-T1 已证实**（`PreToolDecision` = allow/deny/ask，`dsh-tools/lib/types/index.d.ts:419-427`） |
| **C 劝导演出型**（**P3-T1 更正：落点在 post-execute**） | `tools/post-execute` waterfall | 不阻断：`{kind:'accept', additionalContexts:[...]}`——工具照执行，劝导经 additionalContexts 进**下一请求**（消费点 `dsh-agent-loop/lib/index.js:578`）。⚠️ **pre-execute 无 advisory 形态**（allow 无附加字段、参数 deepFreeze 禁改写）——草案"pre-execute 附加 message"机制前提被推翻 | bash-file-read-guard（上游设 `output.message`） | P3-T1 实测裁定（Q-1.7） |
| **D 改写型 post-execute** | `tools/post-execute` waterfall | `accept{content?}`（换渲染内容）/ `accept{value}`（换结构化值，走工具 schema+render）/ `block{feedback}`（纠正反馈转 isError）；均可带 `additionalContexts`。⚠️ value↔content 互斥；失败结果不可 value 替换 | tool-output-truncator、edit-error-recovery、directory-readme-injector、empty-task-response-detector | P3-T1 实测裁定（Q-1.3） |
| **E 续行型 turn-stopping**（**P3-T1 更正：副作用非投票**） | `agent/turn-stopping` serial | payload `{agent, turn, signal}`；**listener 返回值被 driver 丢弃**——续行 = `agent.steer(createUserMessage(...))` 写入 inbox，driver 重读 inbox 决定（"Data decides, so listener order cannot change the outcome"）；不 steer = 不反对，回合关闭 | todo-continuation-enforcer | ✅ **P3-T1 已证实** + DSH 自带先例 `dsh-hooks-claude-code/lib/index.js:292-307` |
| **F 观察型 session/status** | `session/event` / `agent/status`（均 emit，失败被 contain——最安全通道） | 只观察，产生副作用（写日志/发通知）。⚠️ 无 `session.idle`/`session.error` 类型：idle = `agent/status(status==='idle')`，错误 = `turn/end.reason.kind==='error'`（+`agent/error`/`api-session/error`） | session-notification-*、background-notification | P3-T1 实测裁定（Q-4） |

**模式分类法脚注（P3-T1 附录 #12 的仲裁）**：不增列模式 G。① `ctx.tools.guard(fn)`（deny-only 单调门）允许作为 **B 模式实现内部**的可选通道（仍是工具管线门，不破坏分类法）；② 服务缝（提供 `toolResultPruner`、子类化 `BasicCompactionEngine.summarize()`）**本阶段明确不使用**——它们要求替换/提供服务实现，超出 listener 移植形态，有具体需求时由后续阶段个案裁定。

**纪律（全模式通用，P3-T1 实测口径）**：① 事件负载只读叶字段，不 dump live 对象（机制有强制力：`Readonly` + canonical WeakMap + 参数深冻结）；② **listener 必须自包 try/catch**——throw 在 pre-execute = 该次调用 fail-closed（final-result 绕过 post-execute）、在 post-execute = 整次成功结果被替换为 isError、在 turn-stopping(serial) = 回合 `kind:"error"`；**拒绝必须走显式 `{kind:'deny', reason}` 决策**，绝不用 throw 当拒绝手段（不可审计）；③ 注册返回 disposer 归当前 Fiber（`ctx.on` → `fiber.effect`，stop/update 可逆）；④ 静态文本 apply 时一次构建，不在事件路径上读盘（目标纪律——上游存在违反项如 plan-format-validator 同步读盘，移植时改造或显式记偏差）；⑤ **跨事件状态必须以 cordis 服务/`ctx.effect` 承载，不得用模块级裸 Map**（上游 `pending-calls.ts`/`sessionLastWarning` 为反例）；pre/post-execute 配对用 `exec.callId`/`exec.token` 原生关联。

### 4.3 优先级分组（ROADMAP 指定顺序）

| 组 | 模块（v4.19.4 路径，hooks/ 下） | 模式 | 为何此序 |
|---|---|---|---|
| **P0 文件护栏** | `write-existing-file-guard/`（6 文件）、`bash-file-read-guard.ts` | B + C | ROADMAP 第一优先；直接防止"覆写未读文件"这类高代价 agent 事故；B/C 两模式的打样组 |
| **P1 todo/goal 执行器** | `todo-continuation-enforcer/`、`empty-task-response-detector.ts` | E + D | todo 纪律是协奏执行质量的骨干；`goal/`（16 文件）按关键约束**不移植**（dsh-goal 原生）；E 模式打样组 |
| **P2 compaction 辅助** | ~~`compaction-context-injector/`、`compaction-todo-preserver/`~~ | — | **P3-T1 裁定：整组跳过（DSH 原生覆盖）**——todo/write 非表面事件压缩不丢、无 per-session 配置漂移、无对应注入接缝（覆盖基线 §1 P2 组）。WP-4 取消，e2e 不承担该组 |
| **P3 会话通知** | `session-notification-*`（21 文件，后端 = darwin/linux/win32）、`background-notification/` | F | 用户可观测性；**Linux 后端（notify-send）为 CI 可验载体**（草案"log 后端"系自拟，上游无），macOS 后端 L4 手工验证，Windows 后端不移植（D9） |
| **P4 其余在范围模块** | `edit-error-recovery/`、`json-error-recovery/`、`tool-output-truncator.ts`、`directory-readme-injector/`（8 文件）、`agent-usage-reminder/`、`task-resume-info/`、`webfetch-redirect-guard/`（5 文件）、`prometheus-md-only/` | D 为主 + B/D | ROADMAP"其余"；按 R3 建议批内排序（先小后大：edit-error → json-error → truncator → 注入/提醒类 → 门类）；另 12 个草案模块经实测移 §4.4（无 DSH 接缝/无病/依赖未移植子系统） |
| **P5 ulw-execute**（= start-work hook 语义） | `start-work/`（20 文件） | A/E + `ctx.jobs` | 体量最大的单模块；激活目标 atlas 已就位（Phase 2）；**命令面 `/ulw-execute` 属 Phase 4**（§4.5 的 20:0 划分实测）；激活检测的命令模板 marker 随 Phase 4 交付，本阶段激活信号以 DSH 原生形态定义 |

各组的**确实范围已经 P3-T1 逐模块复核**（本表为实测版）：原草案移植组 32 模块中 17 个经证据移出（12 跳过 + 1 helper 并入 + 4 deferred），剩余 **15 个移植模块**（P0=2 · P1=2 · P3=2 · P4=8 · P5=1）；全部移出项的终态理由见 §4.4 与[覆盖基线](./phase3-hooks.md) §2。

### 4.4 跳过/deferred 清单（P3-T1 实测汇总；权威逐行版 = [覆盖基线 §2](./phase3-hooks.md)）

| 类别 | 模块 | 理由 |
|---|---|---|
| **DSH 原生跳过** | `goal/`（16）、`preemptive-compaction*`（10）、`claude-code-hooks/`、`ralph-loop/`、`hephaestus-agents-md-injector/`、`directory-agents-injector/`、`rules-injector/`（41，补登）、`compaction-context-injector/`、`compaction-todo-preserver/` | 关键约束（goal/compaction）· dsh-hooks-claude-code 直接吃 · DSH 原生 ralph · dsh-agent-instructions 覆盖 AGENTS.md 注入（含 rules-injector 主体）· todo/write 非表面事件压缩不丢 + 无 per-session 配置漂移 |
| **无 DSH 对应接缝/结构性无病跳过** | `todo-description-override/`（tool.definition hook，DSH 无该事件）、`tool-pair-validator/`（DSH 全路径物化结果，配对缺失结构性不存在）、`question-label-truncator/`（pre-execute 参数改写被禁）、`sisyphus-junior-notepad/`（同前 + notepad 未移植）、`notepad-write-guard/`（守卫对象未移植）、`tasks-todowrite-disabler/`（无 task 系统）、`monitor-status-injector/`（MonitorManager 未移植）、`plan-format-validator/`（boulder-state 未移植） | pre-execute 禁参数改写（deepFreeze）+ 无 tool.definition/历史变换面 + 依赖子系统未移植 |
| **平台耦合/语义不适用跳过** | `auto-update-checker/`、`legacy-plugin-toast/`、`auto-slash-command/`、`non-interactive-env/`、`interactive-bash-session/`、`fsync-skip-warning/`、`anthropic-context-window-limit-recovery/`、`think-mode/`、`no-hephaestus-non-gpt/`、`no-sisyphus-gpt/`、`task-reminder/`（上游 dead code） | opencode 平台适配或 OMO 模型链身份守卫，无 DSH 行为语义 |
| **deferred → Phase 4** | `keyword-detector/`（24）、`stop-continuation-guard/`（服务形态，消费面 = stop-continuation 命令） | 命令面 |
| **deferred → Phase 5** | `team-mailbox-injector/`、`team-mode-status-injector/`、`team-session-events/`、`team-tool-gating/`、`category-skill-reminder/`、`delegate-task-retry/`（task 工具参数契约强绑定）、`atlas/`（60 条目，重依赖 boulder-state/计划 checkbox/notepads）、`unstable-agent-babysitter/`（background-agent 面） | Team Mode / 委派面邻域 |
| **deferred → Phase 6** | `hashline-edit-diff-enhancer/`、`hashline-read-enhancer/`、`ast-grep-sg-provision/`、`read-image-resizer/`（18，补登） | 编辑模型决策 / MCP 面 / 视觉工具面 |
| **deferred → Phase 7** | `model-fallback/`（7）、`runtime-fallback/`（59，补登） | DSH 无 fallback 语义；retry/fallback wrapper = Phase 7 硬化候选 |
| **deferred（其他）** | `comment-checker/`（核心能力在第三方外部二进制，vendor core 拿不到且 core 无 license 字段；未来需要时只移植内层启发式） | p3t1 Q-6 裁定 |
| **排除** | `codegraph-bootstrap/`（8 文件实有；v5 已删故不移植，理由更正） | ROADMAP 明示 |
| **非 hook** | `shared/`、`zauc-mocks-*`（5）、`index.ts`/`AGENTS.md`、`session-todo-status.ts`（helper 并入 H-10） | 不进移植计数 |

### 4.5 ulw-execute 的 Phase 3/4 边界（P3-T1 实测口径）

ROADMAP 把 start-work **hook 语义**列在 Phase 3（按 v5 名 ulw-execute 读取），把 `/ulw-execute` **slash 命令**列在 Phase 4。P3-T1 逐文件划分实测（证据 `p3t1-startwork-split.md`）：

- **20:0 划分**：`hooks/start-work/` 20 个文件**全部**属 Phase 3 侧（hook 语义：激活检测、计划发现、上下文构建、脚手架）；命令面（命令注册、`agent: atlas` 绑定、模板）住在 hooks/ 之外的 `features/builtin-commands/commands.ts:60-72` + `templates/start-work.ts`，天然属 Phase 4——本目录无命令面胶水文件。
- **激活检测的实测语义（草案更正）**：上游检测 = **命令模板 marker**（prompt 含 `<session-context>` + `You are starting an Atlas work session.`），不是"工作计划意图"泛化检测。模板随 Phase 4 交付 → **本阶段激活信号以 DSH 原生形态定义**（指挥显式委派 atlas + 工作计划意图的 pre-step 检测），清单注明 Phase 4 届时对接模板 marker（常量同步风险入 §6 R-10）。
- **收窄**：依赖 boulder-state 计划子系统的部分（session-plan-affinity 等）记跳过段，理由成文；persona 与注入文案中的命令引用一律写 `ulw-execute`（命名锚点）。

### 4.6 core 包 brain 的 vendor 例外（收窄的）—— P3-T1 裁定闭环

默认 = 不 vendor，纯 listener 重写。P3-T1 对两个候选的逐件裁定（证据 `p3t1-dsh-mechanisms.md` Q-5/Q-6）：

- **AGENTS.md 注入类（`hephaestus-agents-md-injector`、`directory-agents-injector`、`rules-injector`）**：✅ **跳过（DSH 原生覆盖）**，不 vendor `agents-md-core`/`rules-engine`——`dsh-agent-instructions` 覆盖 baseline 链/嵌套/增量（含 remove）/去重/截断诊断且为超集，两份 preset 已挂载。
- **`comment-checker`**：⚠️ **deferred**——`comment-checker-core` 实有且被 import，但核心检测能力在第三方外部二进制 `@code-yeongyu/comment-checker`（需联网下载、多平台分发），vendor core 拿不到能力；core 自身 `package.json` 无 license 字段（合规前置未决）；模块文档与实现不一致、可逆性有缺口。**未来需要时只移植内层启发式**（`hasCommentSyntax` + `hasNewCommentsOnly` + 30s 去重 + append 文案，纯 listener D 模式），避开二进制依赖。
- 其余移植模块的判定逻辑均在 hook 文件内（hook 层适配代码），无 core 包 brain 依赖 → 纯 listener 重写，`verify-licenses` 的 `checked` 应保持 **52 不变**。

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
| **R-1** | ~~§1.2 清单与 v4.19.4 实际树漂移~~ | ✅ **已闭环**（P3-T1）：全树 101 条目/745 文件对账，3 处漏列补登，移植组 32→15 | 覆盖清单全模块终态是退出标准 b 的硬判定 |
| **R-2** | ~~权威门语义未证实~~ | ✅ **已闭环**（P3-T1 Q-1）：`PreToolDecision` = allow/deny/ask 齐备；deny 物化为 `Error: <reason>` isError 结果；**但连带发现两个硬约束**：① pre-execute 无 advisory 形态（模式 C 改落 post-execute）；② 参数 deepFreeze 禁改写（上游 4+ 模块的参数改写语义无对应形态，已移跳过组） | 约束已写进 §4.2 模式表与纪律⑤；行为差异（如 write-guard 的 overwrite 剥离）逐模块记覆盖清单 |
| **R-3** | **hook 语义移植失真**：代码逻辑翻译比 persona 浓缩更易走样（边界条件、正则、状态机） | 高（质量） | 上游测试用例移植为单测种子（各模块用例数已登记：如 edit-error-recovery 9、json-error-recovery 12、write-guard 见 p3t1-upstream-p0-p3）；每 hook 单测 + e2e 双层；双评审逐文件对照上游 |
| **R-4** | **通知类 hook 的平台耦合** | 中（**口径更正**：上游后端 = darwin/linux/win32 三个，无 log 后端） | 移植调度器 + **Linux 后端（notify-send，CI 可验载体）**；macOS 后端代码移植但仅 L4 手工验证；Windows 后端不移植（D9） |
| **R-5** | **多 listener 同事件排序/相互干扰**：omo-agents 的 pre-step 注入 + omo-hooks 的若干 pre-step/pre-execute listener 共存 | 中 | waterfall 纪律（非权威恒 next()）；turn-stopping 数据决定免疫顺序（官方 JSDoc）；单测模拟多 listener 链；boot 顺序在 cordis.yml 行序中固定 |
| **R-6** | **e2e 剧本复杂度**：护栏场景需要 mock 精确发出"违规工具调用"，turn-stopping 场景需要构造"将停未停"回合 | 中 | tool_calls 通道已就绪（P2-T18）；每模式先做一个**模式打样场景**（P0 两护栏即 B/C 模式打样），同组复用 |
| **R-7** | **范围误读**：产出被理解为"OMO 工作流已可用"（实际命令面/Team Mode 仍缺席） | 低（沟通） | README/CHANGELOG 写明：hook 护栏层 ≠ `/ulw-*` 命令面（Phase 4）≠ Team Mode（Phase 5） |
| **R-8** | **与 DSH 原生语义重复**：todo-continuation-enforcer 与 dsh-goal-round-driver 的续行语义可能重叠或冲突 | 中 | 每 hook 过"DSH 原生优先"检查（P3-T1 已逐模块记录，14 个模块因此移跳过组）；重叠处以 DSH 原生为主、OMO 语义收窄为补充并记录 |
| **R-9** | ~~listener 异常击穿管线~~ | ✅ **已闭环**（P3-T1 Q-1.5/Q-2.4）：throw 全部 fail-closed 但**仅限该次调用/该回合**（"冻结全部工具调用"的草案措辞更正）；post-execute throw 会吃掉整次成功结果（有损） | 纪律②（自包 try/catch + 显式决策）为强制；门 8 prove 断言"护栏 listener 抛错时工具调用按预期失败、管线不死" |
| **R-10** | **ulw-execute 激活 marker 的常量同步**：DSH 原生激活信号（本阶段自定）与 Phase 4 命令模板 marker（`<session-context>` + "You are starting an Atlas work session."）届时需对接，常量漂移会造成双轨 | 低-中 | Phase 4 对接项显式记覆盖清单 H-32 与任务书；模板常量出处（`features/builtin-commands/templates/start-work.ts`）已登记 |

### 开放问题（P3-T1 已闭环 5 项；其余转为实施期回答，不阻塞启动）

| # | 问题 | 状态 |
|---|---|---|
| Q-1 | pre/post-execute 决策词汇表 + throw 语义 | ✅ P3-T1 闭环（模式表即结论） |
| Q-2 | turn-stopping 投票协议 | ✅ P3-T1 闭环（steer 副作用，非投票） |
| Q-3 | compaction 可挂事件 | ✅ P3-T1 闭环（无 cordis 事件；4 个 Session 事件可观察；服务缝本阶段不用） |
| Q-4 | session-notification 事件源 | ✅ P3-T1 闭环（turn/end + reason.kind；idle = agent/status） |
| Q-5 | core 包 vendor 例外与 AGENTS.md 注入覆盖 | ✅ P3-T1 闭环（§4.6） |
| 实施期 | `ctx.todo` API 形状 · dsh-tool-subagent 空结果提示（U-7）· DSH edit 错误文案 · token 用量暴露面 · `ctx.jobs` 事件面 · task-resume-info 的 task 族依赖 | 已分散到对应任务的"前置"步骤，逐任务回答 |

## 7. 工作包与估算

按 ROADMAP §7 的定性惯例（无 buffer、非承诺，R3），仅给工作量级：

| 工作包 | 内容 | 任务 | 量级 |
|---|---|---|---|
| **WP-0 调研核对** | v4.19.4 全量 hook 清单 + DSH 事件面逐件核实（Q-1…Q-6）→ 覆盖基线转实测 | P3-T1 | ✅ 已完成（1 天） |
| **WP-1 插件骨架** | omo-hooks 包 + manifest.ts + 挂载（cordis.yml/cold-start/doctor-lite/probe marker） | P3-T2 … P3-T3 | ~1 天 |
| **WP-2 P0 文件护栏** | write-existing-file-guard + bash-file-read-guard 移植 + 单测 + e2e（B/C 模式打样） | P3-T4 … P3-T6 | ~1.5 天 |
| **WP-3 P1 todo 执行器** | todo-continuation-enforcer + empty-task-response-detector + 单测 + e2e（E 模式打样） | P3-T7、P3-T9（P3-T8 取消——3 模块实测移出） | ~1 天 |
| ~~WP-4 P2 compaction 辅助~~ | **取消**——两模块均判 DSH 原生跳过（P3-T1 裁定，覆盖基线 §1 P2 组） | ~~P3-T10 … P3-T11~~ | 0 |
| **WP-5 P3 会话通知** | session-notification（调度器 + Linux 后端 CI 载体 + macOS 后端 L4）+ background-notification + e2e | P3-T12 … P3-T13 | ~1.5 天 |
| **WP-6 P4/P5 其余 + ulw-execute** | 9 模块（8 P4 + ulw-execute）按批移植 + e2e | P3-T14 … P3-T17（P3-T18 取消——批次吸收） | ~2.5 天 |
| **WP-7 门扩展** | 静态门 c 组 / doctor-lite / probe / proofs 扩展 | P3-T19 | ~0.5 天 |
| **WP-8 收口** | 署名、README/docs、覆盖清单终态、退出标准核对 + L4 | P3-T20 … P3-T21 | ~1 天 |

**合计 ≈ 9 人日**（P3-T1 实测后从 12.5 下调：移植组 32→15、WP-4 取消、WP-6 21→9 模块）。体量主体在 WP-6（9 模块）与 WP-2/5（模式打样 + 通知调度器）。

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
