# Phase 3 hook 清单与覆盖基线

> **上游依据**：[开发计划书](./phase3-plan.md) §3/§4 · [ROADMAP Phase 3](../../roadmap_zh-CN.md) · [可行性报告 §1.2](../../feasibility-report_zh-CN.md)
>
> **用法**：本文件是 **ROADMAP Phase 3 退出标准 b 的载体**——v4.19.4 `packages/omo-opencode/src/hooks/` 全部模块的权威清单，逐行记录"已移植 / 跳过（含理由）/ deferred / 排除 / 非 hook"。
>
> **状态**：✅ **P3-T1 实测版**（2026-09-19）。由 5 份调研证据回填：`.omo/evidence/p3t1-dsh-mechanisms.md`（DSH 机制，Q-1…Q-6）· `p3t1-upstream-p0-p3.md` · `p3t1-upstream-p4ab.md` · `p3t1-upstream-p4cd.md` · `p3t1-tree-reconciliation.md` / `p3t1-startwork-split.md` / `p3t1-skip-verification.md`。全部模块经逐文件复核，文件计数为 `git ls-tree -r v4.19.4` 实测。关键机制引用经仲裁者抽核属实（PreToolDecision 联合、deny 物化、turn-stopping 派发点、steer、todo/write 非表面事件）。
>
> **清单完整性**：v4.19.4 `hooks/` 树 = **62 顶层目录 + 39 顶层单文件 = 101 条目 / 745 文件**（实测）。§1+§2+§3 覆盖全部 101 条目，无一漏列（对账证据：`p3t1-tree-reconciliation.md` §5 裁定的 3 处漏列已补登为 S-28/S-29/S-30）。
>
> **模式列**：A–F 见计划书 §4.2 分类法（经 P3-T1 机制更正：**C = 劝导落点在 post-execute `accept+additionalContexts`**；**E = `agent.steer()` 副作用续行**，非返回值投票）。

## 1. 移植组（实测 15 模块，按 ROADMAP 优先级）

### P0 文件护栏（WP-2）

| # | 模块（hooks/ 下路径） | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-02 | `bash-file-read-guard.ts` | 单文件 | C（= post-execute `accept` + `additionalContexts`） | 简单 `cat/head/tail` 读文件 → 劝导改用 read 工具。DSH pre-execute 无 advisory 形态 → 落 post-execute：命令照执行，warning 经 `additionalContexts` 进下一请求（模型劝导语义等价） | ✅ **已移植**（场景 `bash-read-guard-warned`，P3-T5 listener + P3-T6 e2e，commit 3e6903d+） |

### P1 todo/goal 执行器（WP-3；`goal/` 本体跳过见 §2 S-01）

| # | 模块 | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-03 | `todo-continuation-enforcer/` | 目录 | E（=`agent.steer()` 副作用） | todo 未清时回合将停 → steer 注入续行上下文。todo 状态源 = **session todos 投影（dsh-tool-todo `stateOf`；U-4 实测：DSH 无 `ctx.todo` 服务，ROADMAP 原文的 `ctx.todo` 即指该原生投影）**。R-8 已闭环（goal-round-driver 互补，goals 活跃跳过） | ✅ **已移植**（场景 `todo-continuation-enforced`，P3-T7 listener + P3-T9 e2e，commit 42f57db+；熔断 = 进展复员 cap 5） |
| H-07 | `empty-task-response-detector.ts` | 单文件 | D | 空任务响应检测 → 替换/追加纠正性工具结果（上游 `tool.execute.after` 原地改写 `output.output`）。U-7 已闭环（无原生等价纠正） | ✅ **已移植**（场景 `empty-task-response-corrected`，P3-T7 listener + P3-T14 e2e） |

### P2 compaction 辅助 —— **整组跳过（DSH 原生覆盖）**

| # | 模块 | 处置 | 理由 |
|---|---|---|---|
| H-08 | `compaction-context-injector/` | **跳过（DSH 语义不适用）** | 上游两半：① `experimental.session.compacting` 注入 `output.context.push`——DSH 无该接缝（dsh-compaction 无任何 cordis 事件，Q-3）；② checkpoint/恢复 per-session agent 配置——DSH 路由是 per-target 配置（roster），无 per-session 配置漂移病例。证据：p3t1-dsh-mechanisms Q-3.4、p3t1-upstream-p0-p3 C-11/U-3 |
| H-09 | `compaction-todo-preserver/` | **跳过（DSH 原生覆盖）** | 要治的病（压缩丢 todo）在 DSH 结构性不存在：`todo/write` 是 log-only 非表面事件（dsh-tool-todo/lib/types/types.d.ts:28 "Log-only UI state; never derived history"），压缩只 shadow 表面节点；且其参数改写半（`replaceToolArgs`）DSH 禁止。证据：p3t1-dsh-mechanisms Q-3.3/Q-3.4 |

### P3 会话通知（WP-5）

| # | 模块 | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-10 | `session-notification-*`（**21 文件 = 16 实现 + 5 测试**） | 文件族 | F | 会话完成/错误的用户通知。事件源：`session/event` 的 `turn/end` + `reason.kind`（无 session.idle/session.error 类型）；idle = `agent/status(status==='idle')`。**后端口径（草案更正 C-3/C-12）**：上游后端 = darwin / **linux（notify-send）** / win32 三个，无 log 后端——移植 = 调度器 + **Linux 后端（CI 可验载体）** + macOS 后端（L4 手工验证）；Windows 后端不移植（D9）。H-05（`session-todo-status.ts`）实测为 helper，语义已并入本模块实施 | ✅ **已移植**（场景 `session-notification-log`，P3-T12 listener + P3-T13 e2e） |
| H-11 | `background-notification/` | 目录 | F | 后台任务完成通知。`ctx.jobs` 获取 = ctx.inject 延迟订阅（T13 修复运行时缺陷）；continuable 后台委派不建 job（e2e 经 one-shot 沙箱形态覆盖） | ✅ **已移植**（场景 `background-notification-log`，P3-T12 listener + P3-T13 修复 + e2e） |

### P4 其余在范围模块（WP-6，按 R3 建议批内排序：先小后大）

| # | 模块 | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-14 | `edit-error-recovery/`（3 文件） | 目录 | D | edit 输出命中错误串表 → 尾部追加回读提醒。前置已闭环：错误串表按 **DSH 实际 edit 失败文案**重建（上游串不命中的差异注记） | ✅ **已移植**（P3-T14 listener+单测+e2e） |
| H-15 | `json-error-recovery/`（3 文件） | 目录 | D | 非排除工具输出命中 JSON 错误正则 → 追加提醒（幂等哨兵 + 19 项排除表的 DSH 工具名空间映射） | ✅ **已移植**（P3-T14 listener+单测+e2e） |
| H-16 | `tool-output-truncator.ts`（1 + 4 shared 支撑文件） | 单文件 | D | 超长工具输出截断。**读取面（MAJOR-1 修复）**：自适应预算按 token-meter wire.view 公式自算（stateOf 返回 host state 无 projectedTokens，lib:511-514 等价性钉测）；无容量宣告时走固定阈值回退 | ✅ **已移植**（P3-T14 listener+单测+e2e） |
| H-21 | `directory-readme-injector/`（**8 文件**） | 目录 | D | 读文件后把所在目录链 README 注入工具输出。与 dsh-agent-instructions 无重叠（lib:17-18 候选名不含 README）；读 README.md 自身 ×2 注入的上游后果保留登记；compaction/prune 不重新武装 = 已知组合语义 | ✅ **已移植**（P3-T15 listener+单测+e2e） |
| H-22 | `agent-usage-reminder/` | 目录 | D | 工具结果尾部追加 agent 使用提醒（REMINDER_MESSAGE 按 DSH 名册现实改写） | ✅ **已移植**（P3-T15 listener+单测+e2e） |
| H-23 | `task-resume-info/` | 目录 | D | 工具结果追加任务恢复信息。前置闭环：可独立成立、不依赖 OMO task 系统；foreground 不产提示的登记假设已注记 | ✅ **已移植**（P3-T15 listener+单测+e2e） |
| H-24 | `webfetch-redirect-guard/`（**5 文件**） | 目录 | B + D | webfetch 重定向护栏：B 段 deny（reason 携带最终 URL 指引）+ D 段（被 row-10 agent-usage-reminder 抢占 = ACCEPTED 登记）。预解析 GET 绕过 DSH resolvePublicAddresses 公网策略 = upstream parity 已评审接受 | ✅ **已移植**（场景 `webfetch-redirect-denied`，P3-T16 listener+单测+e2e，B 模式打样） |
| H-26 | `prometheus-md-only/` | 目录 | B + D | prometheus 仅可写 .md：B 段 deny 非 .md 写（hook.ts:40-62 1:1）+ D 段劝导落 post-execute（注入警告段无附言缝）。foreground one-shot 委派身份缺口已注记（标识面收窄）。Phase 2"有意不镜像"是 persona/permission 层的决策，本模块在 hook listener 层补齐，层不冲突 | ✅ **已移植**（P3-T16 listener+单测+e2e 门场景） |

### P5 ulw-execute（= start-work hook 语义，WP-6 尾部）

| # | 模块 | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-32 | `start-work/`（20 文件）→ **ulw-execute** | 目录 | A/E + `ctx.jobs` | **逐文件划分实测：20:0 全属 Phase 3 侧**（命令面在 hooks/ 之外的 `features/builtin-commands/`，天然 Phase 4）。移植 = 计划发现 / 上下文构建 / 脚手架语义；**收窄①**：上游激活检测 = 命令模板 marker（`<session-context>` + "You are starting an Atlas work session."），模板随 Phase 4 交付——本阶段激活信号以 DSH 原生形态定义（指挥显式委派/工作计划意图 pre-step 检测），清单注明届时对接；**收窄②**：依赖 boulder-state 计划子系统的部分（session-plan-affinity 等）记跳过段，理由成文。命名锚点全用 `ulw-execute` | ✅ 待移植 |

## 2. 跳过 / deferred / 排除组（实测 47 模块）

| # | 模块 | 处置 | 理由（P3-T1 实测口径） |
|---|---|---|---|
| S-01 | `goal/`（**16 文件**） | 跳过（DSH 原生） | 关键约束：`dsh-goal` + `dsh-tool-goal` + `dsh-command-goal` 原生覆盖 |
| S-02 | `preemptive-compaction*`（**10 文件 = 5 实现 + 5 测试**） | 跳过（DSH 原生） | `dsh-compaction` 族原生覆盖（压力压缩 + 溢出恢复 + 剪枝，p3t1-dsh-mechanisms Q-3） |
| S-03 | `claude-code-hooks/`（20+ 文件） | 跳过（DSH 原生） | §1.2："DSH `hooks-claude-code` 直接吃"用户配置 |
| S-04 | `ralph-loop/` | 跳过（DSH 原生） | DSH 原生 ralph 能力 |
| S-05 | `codegraph-bootstrap/`（**8 文件**） | 排除（v5 已删） | **理由更正**：v4.19.4 树实有 8 文件；codegraph 在 v5 已删（§16.2），ROADMAP 明示排除——是"v5 已删故不移植"，不是"树上没有" |
| S-06 | `keyword-detector/`（**24 文件**） | deferred → Phase 4 | ultrawork/hyperplan/team 关键词模式 = 命令面 |
| S-07 | `team-mailbox-injector/` | deferred → Phase 5 | Team Mode 邻域 |
| S-08 | `team-mode-status-injector/` | deferred → Phase 5 | 同上 |
| S-09 | `team-session-events/` | deferred → Phase 5 | 同上 |
| S-10 | `team-tool-gating/` | deferred → Phase 5 | 同上 |
| S-11 | `category-skill-reminder/` | deferred → Phase 5 | category 体系 = Team Mode 邻域 |
| S-12 | `delegate-task-retry/` | deferred → Phase 5 | **理由更正**：与 OMO `task` 工具参数契约（category/subagent_type/load_skills/run_in_background）强绑定；hook 层零状态，实现为 `delegate-core` 两个纯函数，**不是通用重试，不与 team 生命周期耦合**；DSH 委派工具错误族定型后可作纯函数级参考吸收 |
| S-13 | `model-fallback/`（**7 文件**） | 跳过（DSH 无 fallback 语义） | §12.5：`model-unavailable` = error；Phase 7 硬化候选 |
| S-14 | `hashline-edit-diff-enhancer/` | deferred → Phase 6 | 编辑模型决策未裁定 |
| S-15 | `hashline-read-enhancer/` | deferred → Phase 6 | 同上 |
| S-16 | `ast-grep-sg-provision/` | deferred → Phase 6 | ast-grep provisioning 随 MCP 面 |
| S-17 | `no-hephaestus-non-gpt/` | 跳过（语义不适用） | OMO 模型链身份守卫；DSH 路由在配置，persona 已适配 |
| S-18 | `no-sisyphus-gpt/` | 跳过（语义不适用） | 同上 |
| S-19 | `auto-update-checker/` | 跳过（opencode 平台耦合） | 宿主平台适配，无 OMO 行为语义 |
| S-20 | `legacy-plugin-toast/` | 跳过（opencode 平台耦合） | 同上 |
| S-21 | `auto-slash-command/` | 跳过（opencode 平台耦合） | 同上 |
| S-22 | `non-interactive-env/` | 跳过（平台耦合） | **理由更正**：实现为 opencode bash 参数改写；DSH 已原生覆盖 pager/颜色/stdin-ignore 子集，未覆盖 git editor 与 credential prompt 抑制——如需补建应做独立 listener（认知项，不属本阶段） |
| S-23 | `anthropic-context-window-limit-recovery/` | 跳过（平台耦合） | **标签更正**：opencode client 平台耦合 + Anthropic 错误形状；DSH compaction-basic 原生做 context-overflow→condense+retry |
| S-24 | `think-mode/` | 跳过（语义不适用） | 实测为模型变体/配置切换（`output.message.variant`），非注入语义 |
| S-25 | `interactive-bash-session/` | 跳过（平台耦合） | 绑定 OMO `interactive_bash` 工具与 tmux 参数 |
| S-26 | `hephaestus-agents-md-injector/` | 跳过（DSH 原生覆盖） | Q-5 裁定：`dsh-agent-instructions` 原生覆盖且为超集（baseline 链/嵌套/增量含 remove/去重/截断诊断），两份 preset 已挂载；不 vendor agents-md-core/rules-engine |
| S-27 | `directory-agents-injector/` | 跳过（DSH 原生覆盖） | 同上（nested 发现在 read/write/edit 后原生发生，粒度更宽） |
| S-28 | `rules-injector/`（**41 文件**，补登） | 跳过（DSH 原生覆盖主体） | rules-engine 适配层；主体（AGENTS.md 链注入）已被 dsh-agent-instructions 覆盖；残余差异（额外规则文件模式/GitHub instructions 发现）记认知项，有具体需求时按定向搬运处理（D14 规则 4） |
| S-29 | `runtime-fallback/`（**59 文件**，补登） | deferred → Phase 7 | 与 S-13 同族（auto-retry/错误分类/fallback 链）；计划书 §5 已列"模型 fallback 链 / retry wrapper"为 Phase 7 硬化候选 |
| S-30 | `read-image-resizer/`（**18 文件**，补登） | deferred → Phase 6 | 读图前缩放，与视觉工具面绑定；multimodal-looker 真实视觉链路属 Phase 6 叠加面（Phase 2 R-4 邻域），届时连同 DSH 请求侧图像预算（imagePixelBudget/imageMaxBytes）一并裁定 |
| S-31 | `todo-description-override/`（4 文件，原 H-04） | 跳过（无 DSH 对应接缝） | 实测为 opencode `tool.definition` hook（改写工具 schema 描述）；DSH 无 tool-definition 事件；语义近似面已由 omo-agents 的 hard-blocks/persona 注入覆盖 |
| S-32 | `task-reminder/`（原 H-06） | 跳过（上游未接线 + 依赖未移植工具族） | 上游 dead code（barrel 未导出、无 composer 引用）；匹配依赖 OMO 专属 `task_*` 工具族 |
| S-33 | `tool-pair-validator/`（**7 文件**，原 H-12） | 跳过（DSH 结构性无病） | 上游治"tool_use 有、tool_result 缺"的配对缺失；DSH 工具管线全路径物化结果（deny→post-result :3127、throw→final-result :3149、post-execute throw→isError :3243），配对缺失结构性不存在；触发面（`experimental.chat.messages.transform` 历史变换）亦无 DSH 对应 |
| S-34 | `plan-format-validator/`（3 文件，原 H-13） | 跳过（依赖未移植子系统） | 校验对象是 OMO 计划文件格式（`getPlanProgress` 依赖 boulder-state 计划子系统）；本项目计划载体不同（docs/plans markdown），无对应语义载体 |
| S-35 | `question-label-truncator/`（3 文件，原 H-17） | 跳过（无 DSH 对应接缝） | 上游为 pre-execute 参数改写（`replaceToolArgs` 截断 option.label）；DSH 参数 deepFreeze 禁改写；DSH web 渲染截断情况记认知项 |
| S-36 | `comment-checker/`（13 + core 4 文件，原 H-18） | deferred | ① 核心能力在第三方外部二进制 `@code-yeongyu/comment-checker`（需联网下载、多平台分发），vendor `comment-checker-core` 拿不到该能力且 core 无 license 字段；② 模块文档与实现不一致；③ 可逆性缺口。**注**：若未来需要，只移植内层启发式（纯 listener，D 模式）即可避开二进制依赖 |
| S-37 | `stop-continuation-guard/`（3 文件，原 H-19） | deferred → Phase 4 | 实测为被查询的服务（stop/isStopped/clear 导出）+ 级联取消，消费面 = Phase 4 的 stop-continuation 命令；依赖 backgroundManager 后代遍历等价物（未核实） |
| S-38 | `monitor-status-injector/`（3 文件，原 H-20） | 跳过（依赖未移植特性） | 数据源 = OMO `features/monitor` 的 MonitorManager（未移植），DSH 无被监视对象概念；挂点更正记录（上游为 `experimental.chat.messages.transform`，非 agent/status） |
| S-39 | `atlas/`（**60 条目 = 32 实现 + 26 测试 + 2 其他**，原 H-25） | deferred | 重度依赖 boulder-state / 计划 checkbox / notepads 等未移植子系统；三条接缝并存（E/F + D + C）；随 Phase 4 命令面 / Phase 5 atlas 编排一并重议。上游 AGENTS.md 自称"17 files"不可信 |
| S-40 | `notepad-write-guard/`（原 H-27） | 跳过（守卫对象未移植） | 守卫 OMO notepad 文件族；notepad 子系统未移植（见 S-41），无守卫对象 |
| S-41 | `sisyphus-junior-notepad/`（3 文件，原 H-28） | 跳过（无对应接缝 + 子系统未移植） | 上游为 task prompt 前置注入（C 形态参数改写，DSH 无）；notepad 子系统在 DSH 无载体（`ctx.jobs` 是任务作业非记事本） |
| S-42 | `tasks-todowrite-disabler/`（原 H-29） | 跳过（无对应语义） | DSH 无 `experimental.task_system`，也无 TaskList/TaskGet/TaskCreate/TaskUpdate 工具族 |
| S-43 | `unstable-agent-babysitter/`（原 H-30） | deferred | 依赖 OMO background-agent 运行时面（`backgroundManager.getTasksByParentSession`）；DSH 等价面（ctx.jobs/subagent 生命周期）随 Phase 5 定型后重议 |
| S-44 | `fsync-skip-warning/`（原 H-31） | 跳过（平台耦合） | 生产者仅 2 个 opencode TUI 调用点，无 OMO 行为语义 |
| S-45 | `todo-description-override` 占位 | — | （并入 S-31，此行不占用——保持编号连续性的说明行） |
| S-46 | `write-existing-file-guard/`（6 文件，原 H-01） | 跳过（DSH 原生覆盖且为超集） | **2026-09-19 WP-2 开工仲裁**：`dsh-fs-observation-policy` 已在 base composition 挂载（dsh-base/cordis.patch.yml:257-258）并被 dsh-tool-fs 经 `fs/write-intent`/`fs/edit-intent` 消费（lib:650/:801）——原生实现"覆写未读文件拒绝"（`createIfAbsent` no-clobber）+ **版本 CAS 过期检测 `FS_STALE_VERSION`**（OMO 无等价，严格更强）+ 缺失读取授权 guarded-create + session  keyed WeakMap；OMO 残余语义均无移植价值：一次性票据（弱于 CAS）、`.omo/**` 豁免（OMO 专属路径）、`overwrite` 参数剥离（OMO write 工具参数，DSH 无）。证据：dsh-fs-observation-policy/README.md（"write creates new files but refuses to overwrite an existing file that the session has not read… FS_STALE_VERSION"）+ lib/index.js:50-68。P0 防护目标已由原生交付，移植 = 以更弱模型复制原生门（原则一禁止）。B 模式打样移至 T16（H-24/H-26） |

## 3. 非 hook 条目（不进移植计数，附注）

| # | 条目 | 说明 |
|---|---|---|
| N-01 | `shared/` | 上游 hook 共享辅助（log、binary-downloader、dynamic-truncator 等）；移植时按需吸收其语义（如 H-16 的 4 个支撑文件），不逐文件对应 |
| N-02 | `zauc-mocks-bg/`、`zauc-mocks-cache/`、`zauc-mocks-hook/`、`zauc-mocks-ws/`、`zauc-sync-mocks/` | 上游测试设施，非 hook |
| N-03 | `index.ts`、`AGENTS.md` | 上游注册表与文档，非 hook。**注意**：上游 `hooks/AGENTS.md` 多处与代码不符（C-13、S-39），一律以代码为准 |
| N-04 | `session-todo-status.ts`（原 H-05） | 实测为 helper（2 个导出谓词，唯一消费方 = session-notification），不占 listener 清单行；语义并入 H-10 实施 |

## 4. P3-T1 待核清单 —— ✅ 全部闭环（2026-09-19）

**A 组（清单完整性）**：✅ 全树对账（101 条目/745 文件），3 处漏列补登（S-28/29/30），8 处计数更正，S-05 理由更正。证据 `p3t1-tree-reconciliation.md`。
**B 组（DSH 机制）**：✅ Q-1 决策词汇表（pre = allow/deny/ask，无 advisory，参数 deepFreeze；post = accept×2/block + additionalContexts；throw 全 fail-closed）· Q-2 turn-stopping = steer 副作用 · Q-3 compaction 无 cordis 事件（4 个 Session 事件可观察，服务缝本阶段不用）· Q-4 事件名映射（无 session.idle/session.error；idle=agent/status；错误=turn/end.reason）· Q-5 dsh-agent-instructions 覆盖 AGENTS.md 注入（S-26/27/28 跳过）· Q-6 comment-checker core vendor 拿不到能力（S-36 deferred）。证据 `p3t1-dsh-mechanisms.md`。
**C 组（逐模块语义）**：✅ 移植组全部模块逐文件复核（模式更正 11 处：H-02/H-03/H-07/H-21/H-22/H-23/H-24/H-26 等）；start-work 20:0 划分（证据 `p3t1-startwork-split.md`）；跳过组抽核 7 项（证据 `p3t1-skip-verification.md`）。

**实施期回答项**（不阻塞启动，已分散到各任务）：U-4 `ctx.todo` API 形状（T7）· U-7 dsh-tool-subagent 空结果提示（T7 前置）· U-8 read 是否经 pre-execute 的 e2e 实证（T6）· H-14/H-15 的 DSH 错误文案（T14）· H-16 的 token 用量暴露面（T14）· H-23 的 task 族依赖（T16）· H-11 的 jobs 事件面（T12）。

## 5. 覆盖统计（随实施滚动更新）

| 状态 | 计数 | 口径 |
|---|---|---|
| 移植组（§1） | **14**（P0=1 · P1=2 · P3=2 · P4=8 · P5=1；P2 组整组跳过） | 2026-09-19 仲裁：H-01 改判跳过（DSH 原生超集，S-46） |
| 已移植（listener+单测+e2e） | 11 / 14（余 H-32 ulw-execute） | 逐任务翻转 |
| 跳过 / deferred / 排除（§2） | **47**（S-01…S-46 去占位行） | 每行终态理由齐备 |
| 非 hook（§3） | 4 类条目 | 不计入 |
| 全树覆盖 | 101 / 101 条目 | 退出标准 b 的完整性硬判定 ✅ |
