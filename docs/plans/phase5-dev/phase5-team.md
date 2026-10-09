# Phase 5 team 面清单与覆盖基线（T1 实测终态）

> **上游依据**：[开发计划书](./phase5-plan.md) §4 · [任务清单](./phase5-tasks.md) T1 · [agent 团队调查报告](../../omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md) §2 · [Phase 3 hook 覆盖基线](../phase3-dev/phase3-hooks.md)（deferred 条目溯源）
>
> **用法**：与 Phase 3 `phase3-hooks.md`、Phase 4 `phase4-commands.md` 同例——**每一条 team 面都有成文处置才算闭环**。处置枚举：`原生采用`（DSH 面直接覆盖，零移植）/ `语义移植`（新写 DSH 代码，署名头）/ `内容 vendor`（上游版权内容逐字搬运，playbook 全套）/ `记差异`（语义有意不落地，理由成文）/ `deferred`（出本阶段，理由成文）。
>
> **状态**：✅ **T1 实测终态**（2026-10-09）——§1/§2/§4/§5 全条目终态，Q-1…Q-8 全闭环；**fork = (B)**（`.omo/evidence/p5t1/FORK.md`）。门 6 c14 的 `COVERAGE_BASELINE_MDS` 并集当前**不含**本文；本文出现 H-号段「已移植」条目时须同 commit 扩展（计划书 R-8 同步网）。
>
> **引用基址**：`$DSH` = `/home/linletian/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`；`$OMO` = v4.19.4 tag（`b072d279…`）相对路径。

## 1. team 工具面对账（12 个 `team_*` ↔ fork (B) omo-team 自建面）

> **T1 Q-1 已枚举完毕**（2026-10-09，证据 `.omo/evidence/p5t1/Q1a-tools-lifecycle.md`）：12 个 `team_*` 工具全名单属 **omo-opencode 面**（`packages/omo-opencode/src/plugin/tool-registry-team-tools.ts:11-48` 注册，`team_mode.enabled` 门控）；**senpi 面只有 `team_create`/`team_delete` + `task_*` 家族**（参数 snake_case），关停走 `task_send` 结构化消息——两套面并存于 v4.19.4。本仓工具契约基线 = **omo-opencode 12 工具面**；senpi 面 = 语义参考（成员引导 5 行版、`TEAM_LEAD_SENTINEL`、握手消息语义）。
>
> **fork = (B)**（2026-10-09 裁定，`.omo/evidence/p5t1/FORK.md`）：不挂 experimental bundle，原生 9 scoped 工具**不采用**；omo-team 在 `startContinuable` + 原生 inbox/sendMessage 上自建。下表「实现面」列 = (B) 终态。

| 工具面 | OMO v4.19.4 来源（Q-1 逐字） | fork (B) 实现面 | 处置（终态） |
|---|---|---|---|
| `team_create`（inline spec `{name, members:[…]}`；`teamName` 命名 spec 面） | `features/team-mode/tools/lifecycle-create-tool.ts:60-119`；gating `team-tool-gating/hook.ts:102-108` | omo-team 工具层 → `ctx.subagents.startContinuable` 逐成员三件套（名册席值，Q-3 对照组实证 descriptor 全承载） | **语义移植**（inline spec 解析 + member-validator + 逐成员路由；`teamName` 命名 spec 注册表 = **记差异**，DSH 无 spec 注册表面；`leadSessionId` override = 记差异，lead 恒为当前会话） |
| `team_delete`（活跃成员拒删，`force:true` 强删） | `tools/lifecycle-shutdown-tools.ts:37-62` + `team-runtime/delete-team.ts:65-104`（`DELETABLE_MEMBER_STATUSES`） | omo-team 工具层纪律 + 原生 `interrupt`（保 inbox）+ continuable drain/disposal 组合 | **语义移植**（「拒活跃除非 force」纪律逐字对齐；orphaned/deleting 旁路 = (B) 状态机骨架承接，T7） |
| `team_shutdown_request`（lead-only，代码实证） | `tools/lifecycle-shutdown-tools.ts:64-79`（`:74` lead-only）；握手语义 `team-runtime/shutdown.ts:13-55`；senpi 参考 `senpi-task/src/team/shutdown.ts:72-101` | omo-team 握手状态机（vendored state-store 存 shutdownRequests）+ 询问消息经原生投递 | **语义移植**（幂等、无自动超时——超时语义由提示词承担，上游同构，Q1a §5.4） |
| `team_approve_shutdown`（lead 或目标成员） | 同文件 `:81-96`；`shutdown.ts:57-107` | 同上（批准后 interrupt + drain，inbox 保留断言） | **语义移植** |
| `team_reject_shutdown`（lead 或目标成员，reason 必填） | 同文件 `:98-113`；`shutdown.ts:109-148` | 同上 | **语义移植** |
| `team_send_message`（fire-and-forget；`to:"*"` 广播 lead-only；`MESSAGE_TOOL_KINDS = message/announcement`；correlationId/summary/references） | `tools/messaging.ts:38-116`；`team-mailbox/send.ts` 错误族（`BroadcastNotPermittedError`/`PayloadTooLargeError`/`RecipientBackpressureError`/`DuplicateMessageIdError` 等） | 原生 `ctx.subagents.sendMessage`（相邻：lead↔member 直通）；member↔member 非相邻 → **lead 中转（记差异）**；广播 = 工具层「仅 lead」纪律；kind/限额/去重错误族按上游语义在工具层重述 | **语义移植**（帧格式 `Team message <id> from <name>:` 语义对齐；`.delivering-` 预约/TTL **记差异**——原生 steer 推送投递无预约族，Q-5b 金丝雀；消息载体 kind：原生 `'agent-message'`，omo 自有帧 `omo-team-*`，Q-8 裁定） |
| `team_task_create` | `tools/tasks.ts:72-95`；team-tasklist `store.ts`（`.highwatermark` 水位） | vendored `team-tasklist`（harness-neutral 子集）+ omo-team 工具薄壳 | **内容 vendor + 语义移植接线**（上游语义原样：锁+锁内重读、无 revision-CAS、无 failed 态——Q1b N1/N2 实证；**上游比原生弱**的治理差异已在 T1 记录，DSH 失败终态 v1 不增设、记差异） |
| `team_task_list` / `team_task_get` | `tools/tasks.ts:97-151` | 同上 | **内容 vendor + 语义移植接线** |
| `team_task_update`（`status:"claimed"` → claim 路由；`AlreadyClaimedError`/`BlockedByError`；claim 锁 300s；cross-owner 拒） | `tools/tasks.ts:114-135`；`team-tasklist/claim.ts:45-97`、`update.ts:9-20,56-58`、`dependencies.ts:3-8` | 同上 | **内容 vendor + 语义移植接线**（`tasks/claims/` 瞬时锁目录与 `.highwatermark` 随 vendor 件自然成立——Q1b 实证其为锁/水位而非认领记录，覆盖基线原「不移植」草案作废） |
| `team_status`（聚合 runtime state） | `tools/query.ts:34-49` | vendored `team-state-store` runtime state 读取 + 工具层聚合 | **语义移植**（(B) 无原生 projection；状态面 = vendored state-store） |
| `team_list`（scope user/project/all 声明式团队注册表） | `tools/query.ts:51-111` | —（DSH 无 team spec 注册表面） | **记差异**（活跃团队枚举 = vendored state-store 承接进 `team_status`；声明式命名团队 v1 不落地，理由：spec 注册表是 OMO 载体语义，本仓 team 恒 ephemeral-per-lead-session） |
| `team_wait` | —（v5 已删；v4.19.4 的 12 工具名单亦无此件） | steer 投递续行 + 工具层引导 | **记差异**（v5 删除理由与原生形态同构，Q-1 复核 12 名单确无 `team_wait`） |

**原生 9 scoped 工具**（`spawn_teammate`/`send_message`/`list_agents`/`wait_agent`/`interrupt_agent`/`team_task_*`）：**不采用**——随 experimental bundle 整体不挂载（fork (B)，D18 登记；Q-3 三重封死链证据）。其语义中可对齐部分（成员引导 prefix 形状、roster 视图、`TEAM_LEAD_REQUIRED` 具名错误族）作 omo-team 工具层文案参照。

**显式决策行（双评审建议登记 2026-10-09）：v1 任务板取 vendored 上游弱语义、不照抄原生更强语义（CAS/DAG/ready/failed）**——理由三条（冻结基线纪律 / 基线可测性 / 范围纪律）见计划书 §4.5 决策段；强弱差异成文，不无声继承也不无声加强。

## 2. Phase 3 deferred 条目处置（溯源编号保留）

| 溯源 | 模块 | 计划期草案处置 | 终态（T1 填） |
|---|---|---|---|
| S-07 | `team-mailbox-injector/` | **预计记差异/原生覆盖**——原生 mailbox 落 Lead 日志 + steer 投递，注入器语义大概率无对应接缝 | ✅ **原生覆盖（(B) 形态）**——投递 = 原生 inbox steer **推送式**（消息直接唤醒成员开 turn，Q-5b 金丝雀），无文件 mailbox 轮询对象，注入器语义结构性无承载；`.delivering-` 预约/TTL **记差异**（Q1b §C-3；原生 = 统一 inbox 准入，无预约族） |
| S-08 | `team-mode-status-injector/` | 预计**原生覆盖**（`agentTeam` projection 即状态面）或语义移植为成员引导段 | ✅ **记差异（(B) 形态）**——(B) 无 projection；状态面 = `team_status` 工具 + vendored state-store；每轮状态注入 v1 不移植（闭合纪律由 T12 vendor 的 team 协议文案承担）；若 T12 后实测 lead 丢闭合纪律再重议 |
| S-09 | `team-session-events/` | 预计**原生覆盖**（`team/message/*` + descriptor/catalog 事件族） | ✅ **原生覆盖（(B) 形态）**——`'agent-message'` 投递帧 + `subagent/descriptor`/`subagent/catalog` 事件族即成员会话事件面（Q-7/Q-8；成员 = continuable 子女，事件族同既有委派子女） |
| S-10 | `team-tool-gating/` | **语义移植**候选——成员资格/工具分发规则（与 T4 member-validator 同面） | ✅ **语义移植**——资格校验 = T4 member-validator；工具分发纪律（lead-only 四件 + 成员无 `team_create`）= omo-team 工具层按角色分发 + 服务强制（(B) 形态无原生 gating 层，全部自建于 omo-team，T5 嵌套拒绝具名错误对齐上游 `TEAM_LEAD_REQUIRED` 语义族） |
| S-11 | `category-skill-reminder/` | category 释义收窄后裁定（计划书 §4.3：v1 category = 名册 worker 席别名） | ✅ **记差异**（T1 Q-5 裁定：v1 category = 名册 worker 席（hephaestus/sisyphus-junior）别名，席位自带 persona/模型/deny 路由——category 技能提醒语义由席位 persona 承载，无独立注入对象） |
| S-12 | `delegate-task-retry/` | 维持 Phase 3 判词：**纯函数参考级**，omo-team 委派错误族定型后吸收，不算移植 | ✅ 维持 Phase 3 判词（T1 复核：omo-team 错误族 = `TEAM_LEAD_REQUIRED`/`TEAM_MEMBER_NOT_FOUND`/`UNRESOLVABLE_CATEGORY` 等，T4/T5 定型后参照吸收） |
| S-39 | `atlas/`（60 条目） | 维持 **deferred**（boulder-state 依赖未移植；计划书 §5 护栏明示） | ✅ 维持 **deferred**（护栏不变） |
| S-43 | `unstable-agent-babysitter/` | 预计**记差异**——原生拆除（disposal 关准入 + child-first drain）即 babysitter 的防护目标 | ✅ **记差异**（T1 Q-6（(B) 形态）：原生 continuable drain/disposal（`drainContinuableDescendants` 族）即防护目标；babysitter 的轮询复活语义与原生 cold-resume-by-delivery 不同族，不移植） |

## 3. Phase 4 handoff 与关键词面

| 项 | 来源 | 处置（草案） | 任务 |
|---|---|---|---|
| team 关键词子模式（`TEAM_PATTERN` 已在，`TEAM_MESSAGE` 未接线） | Phase 4 §9 / `keyword-detector/constants.ts:30-31,64` | **语义移植**（注入面）+ **内容 vendor**（`prompts-core/prompts/mode/team.md`） | P5-T12 |
| `/hyperplan` 完整对抗评审环 | Phase 4 §9（降级形态就位） | **升级**（team 在场探测切换，不硬编码） | P5-T13 |
| remove-ai-slops team-mode addendum | Phase 4 §9 | **升级**（同上） | P5-T13 |
| stop-continuation team 后代取消 | Phase 4 §9 | **语义移植**（guard 扩展 team interrupt/drain 分支） | P5-T9 |

## 4. 成员资格矩阵（T1 Q-1/Q-5 终态化）

> **类型事实（计划期复核，`roster.ts:51` 逐字）**：`AgentClass = 'read-only' | 'worker' | 'orchestrator' | 'allowlist'`——**无 `conductor` 值**；且 sisyphus 行是「Route-only conductor row: no personaFile / class / maxDepth」（`roster.ts:110-120` 注释逐字），**根本没有 `class` 字段**。11 席真实分布 = read-only 6 / worker 2 / orchestrator 1 / **allowlist 1**（multimodal-looker）/ **无 class 1**（sisyphus）。⇒ 资格规则的输入 = **class 为主 + seat id 兜底**——无 class 的 sisyphus 走结构性排除，不参与 class 匹配。

| 名册席 | class | 入队（终态，T1 裁定 2026-10-09） | 依据 |
|---|---|---|---|
| explore / oracle / librarian / plan-consultant / plan-reviewer / prometheus | read-only | **拒**（parse 期具名拒绝 + 可用清单） | explore/librarian/plan-consultant/plan-reviewer = 上游 v5 拒绝清单逐字对应（curated 只读四席，调查报告 §2.1-3；上游代码实证 `AGENT_ELIGIBILITY_REGISTRY` hard-reject 在册，Q1a §3.2）；**oracle/prometheus = 比上游更严的有意收紧**——v4 hard-reject 名单在册（同 §2.1-3）、v5 拒绝清单未列，本仓按 roster class 统一收紧（Phase 2 登记口径） |
| hephaestus / sisyphus-junior | worker | **允许**（category worker 释义的本仓承载席；v1 全部可入队席） | 调查报告 §2.1-2；上游 `AGENT_ELIGIBILITY_REGISTRY` eligible/conditional 在册（Q1a §3.2） |
| atlas | orchestrator | **拒**（T1 Q-5 裁定：比上游更严的有意收紧——上游 eligible 在册） | 证据：(a) T1 Q-6 实证成员工具面 = team 9 工具、**无任何委派通道**（profile 形态下 legacy 委派四行已禁），orchestrator 席的核心职责（编排委派）在 team 内结构性不可行，入队即携带死指令；(b) 退出标准 = lead + 2 category worker，不需要 orchestrator 席；(c) 与原生扁平不可变 roster、无嵌套模型一致。v1 收紧，后续若放行须先解 (a) |
| multimodal-looker | allowlist | **拒**（T1 Q-5 裁定：维持草案） | 上游 v4 hard-reject 名单在册（调查报告 §2.1-3、`AGENT_ELIGIBILITY_REGISTRY` hard-reject，Q1a §3.2）；v5 拒绝清单只列 curated 只读四席 + reviewer 三人组，未提及该席——按 v4 在册收紧 |
| sisyphus | —（无 `class` 字段） | **拒**（结构性排除：lead 恒为当前会话，route-only 指挥席不作成员；按 seat id 判定，不经 class 匹配） | v5 模型 / `roster.ts:110-120`；T1 Q-4 实证 conductor（无 descriptor 主会话根）在原生 `tryMembership` 恒判 lead |

## 5. 待核清单（T1 Q 组镜像，闭环后转 ✅ 或更正）

| # | 待核项 | 计划书锚点 | 状态 |
|---|---|---|---|
| Q-1 | 12 个 `team_*` 工具全枚举 + 握手协议 + team.md 全文 | §6 | ✅（2026-10-09 仲裁验收：`.omo/evidence/p5t1/Q1a-tools-lifecycle.md` + `Q1b-teamcore-teammd.md`；12 工具属 omo-opencode 面、senpi 面仅 team_create/delete + task_* 家族；`describePlanError` v4.19.4 不存在、等价物三处；握手 lead-only request、无自动超时；team.md=615B、真协议在 skills-loader-core team-mode.ts） |
| Q-2 ⚠️ | `ctx.agentTeams` 激活前提实跑 | §4.1 | ✅ **5/5 PASS**（2026-10-09，`.omo/evidence/p5t1/q2/Q2-activation.md`：挂载/boot/在场/组队/事件对/持久化全绿；R-4 解除） |
| Q-3 ⚠️ | per-member provider 适配器通透 | §4.1 | ✅ **不通（结构性三重封死链）→ fork (B)**（2026-10-09，裁定书 `FORK.md` + `q3/Q3-provider-adapter.md`：工具 schema 无 provider 参数 → `SpawnTeammateRequest` 无三件套 → `spawnAdmitted` 硬编码 `request:{prompt,parent}`；对照组实证 raw 通道三件套全承载 = (B) 路基绿） |
| Q-4 | 工具遮蔽/共存与组合行落点 | §4.2 | ✅（2026-10-09：`.omo/evidence/p5t1/Q4-tool-shadowing.md` + Q-2 runtime 附带——遮蔽实证、profile disabled 不穿透嵌套、web-app bundle 已自禁顶层 legacy 四行；落点裁定见 T3 仲裁） |
| Q-5 | 缝隙终态表（搬运清单重筛 + 收窄裁定） | §4.3/§4.4 | ✅（2026-10-09：§4.4 表已按 (B) 终态；资格矩阵终态 = atlas/multimodal-looker 拒入收紧、v1 可入队 = hephaestus+sisyphus-junior；**Q-5b 唤醒金丝雀 PIN-OK 25/25**——warm steer + 进程内冷 + 跨进程 reboot 冷恢复三形态全醒，`submitAdmitted` 的 `try deliver finally wake` 结构排「投了不叫」，#5317 病灶形态结构性不存在） |
| Q-6 | 深度与 jobs 边界 | §3 | ✅（2026-10-09：`.omo/evidence/p5t1/Q6-depth-jobs.md`——成员无委派工具 = 结构性不派生；成员不进 jobs；background-notification 失明记差异；stop-continuation 接缝 = liveChildrenByRoot/drainContinuableChildren） |
| Q-7 | 可视化面（面板可见性 / ChatNode 兜底裁定） | §4.6 | ✅（2026-10-09：`.omo/evidence/p5t1/Q7-visualization.md`——唤醒轮 turn-trigger 卡 + subagentchat 达成员会话 = 消息交换可见；三缺口记差异；**T11 兜底初步裁定不触发**，L2 终证归 T16） |
| Q-8 | source kind 清单（`omo-team-*`） | §2 约束 6 | ✅（2026-10-09：`.omo/evidence/p5t1/Q8-source-kinds.md`——四自有 kind 命名表 + 六原生载体；v4 准入只拒 'plugin'；约束 6 改写经原生 mailbox 帧承 'team-message'） |
