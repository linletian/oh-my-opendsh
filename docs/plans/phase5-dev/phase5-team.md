# Phase 5 team 面清单与覆盖基线（计划期草案）

> **上游依据**：[开发计划书](./phase5-plan.md) §4 · [任务清单](./phase5-tasks.md) T1 · [agent 团队调查报告](../../omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md) §2 · [Phase 3 hook 覆盖基线](../phase3-dev/phase3-hooks.md)（deferred 条目溯源）
>
> **用法**：与 Phase 3 `phase3-hooks.md`、Phase 4 `phase4-commands.md` 同例——**每一条 team 面都有成文处置才算闭环**。处置枚举：`原生采用`（DSH 面直接覆盖，零移植）/ `语义移植`（新写 DSH 代码，署名头）/ `内容 vendor`（上游版权内容逐字搬运，playbook 全套）/ `记差异`（语义有意不落地，理由成文）/ `deferred`（出本阶段，理由成文）。
>
> **状态**：🚧 **计划期草案**（2026-10-08）——全部行为**草案**，P5-T1（Q-1…Q-8）逐行转实测。门 6 c14 的 `COVERAGE_BASELINE_MDS` 并集当前**不含**本文；本文出现 H-号段「已移植」条目时须同 commit 扩展（计划书 R-8 同步网）。
>
> **引用基址**：`$DSH` = `/home/linletian/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`；`$OMO` = v4.19.4 tag（`b072d279…`）相对路径。

## 1. team 工具面对账（12 个 `team_*` ↔ 原生 9 工具 + omo-team 增补）

> OMO 侧 12 个 `team_*` 工具的**完整名录与逐工具语义待 T1 Q-1 枚举**（调查报告 §2.1-7 只确认「12 个工具两版未变」与 v5 删 `team_wait`、lead 工具 7→6）。已知的锚点行先登记，T1 补全。

| 工具面 | OMO v4.19.4 来源 | DSH 原生对应 | 处置（草案） |
|---|---|---|---|
| `team_create`（inline spec `{name, members:[{name, category\|subagent_type, prompt?}]}`） | `senpi-task/src/team/`（spawn-members.ts 等） | `ctx.agentTeams.spawnTeammate`（**无 persona/agentOptions/toolFilter**——缝隙见计划书 §1.1/§4.1） | **语义移植**（omo-team 工具层包原生 spawn + provider 适配器；(B) 形态 = `startContinuable` 直驱） |
| `team_delete`（活跃成员拒删，`force:true` 强删——v5 语义） | 同上 | disposal / `interrupt`（保 inbox）组合 | **语义移植**（工具层纪律 + 原生拆除原语） |
| `team_send`/消息工具（fire-and-forget） | `team-core/src/team-mailbox/` | 原生 `sendMessage`（任意成员↔任意成员，steer 恒成立，durable mailbox 落 Lead 日志） | **原生采用**；广播差异成文（计划书 §4.4） |
| `team_wait` | —（v5 已删） | `waitForChange` + steer 投递续行 | **原生采用**（v5 删除理由与原生形态同构） |
| 任务认领（`status:"claimed"`）与 `tasks/claims/`、`.highwatermark` | `team-core/src/team-tasklist/` | `team_task_*` 四工具（CAS / DAG 校验 / `ready` / `ownerName`） | **原生采用**；上游存储细节**记差异** |
| 关停握手（request/approve/reject） | `senpi-task/src/team/`（T1 定位逐字协议） | 无对应 | **语义移植或记差异**——T1 Q-5 裁定 |
| 其余 `team_*` 工具（T1 补全行） | T1 Q-1 | 9 工具余量逐行对账 | T1 填 |

## 2. Phase 3 deferred 条目处置（溯源编号保留）

| 溯源 | 模块 | 计划期草案处置 | 终态（T1 填） |
|---|---|---|---|
| S-07 | `team-mailbox-injector/` | **预计记差异/原生覆盖**——原生 mailbox 落 Lead 日志 + steer 投递，注入器语义大概率无对应接缝 | ⬜ |
| S-08 | `team-mode-status-injector/` | 预计**原生覆盖**（`agentTeam` projection 即状态面）或语义移植为成员引导段 | ⬜ |
| S-09 | `team-session-events/` | 预计**原生覆盖**（`team/message/*` + descriptor/catalog 事件族） | ⬜ |
| S-10 | `team-tool-gating/` | **语义移植**候选——成员资格/工具分发规则（与 T4 member-validator 同面） | ⬜ |
| S-11 | `category-skill-reminder/` | category 释义收窄后裁定（计划书 §4.3：v1 category = 名册 worker 席别名） | ⬜ |
| S-12 | `delegate-task-retry/` | 维持 Phase 3 判词：**纯函数参考级**，omo-team 委派错误族定型后吸收，不算移植 | ⬜ |
| S-39 | `atlas/`（60 条目） | 维持 **deferred**（boulder-state 依赖未移植；计划书 §5 护栏明示） | ⬜ |
| S-43 | `unstable-agent-babysitter/` | 预计**记差异**——原生拆除（disposal 关准入 + child-first drain）即 babysitter 的防护目标 | ⬜ |

## 3. Phase 4 handoff 与关键词面

| 项 | 来源 | 处置（草案） | 任务 |
|---|---|---|---|
| team 关键词子模式（`TEAM_PATTERN` 已在，`TEAM_MESSAGE` 未接线） | Phase 4 §9 / `keyword-detector/constants.ts:30-31,64` | **语义移植**（注入面）+ **内容 vendor**（`prompts-core/prompts/mode/team.md`） | P5-T12 |
| `/hyperplan` 完整对抗评审环 | Phase 4 §9（降级形态就位） | **升级**（team 在场探测切换，不硬编码） | P5-T13 |
| remove-ai-slops team-mode addendum | Phase 4 §9 | **升级**（同上） | P5-T13 |
| stop-continuation team 后代取消 | Phase 4 §9 | **语义移植**（guard 扩展 team interrupt/drain 分支） | P5-T9 |

## 4. 成员资格矩阵（T1 Q-1/Q-5 终态化）

> **类型事实（计划期复核，`roster.ts:51` 逐字）**：`AgentClass = 'read-only' | 'worker' | 'orchestrator' | 'allowlist'`——**无 `conductor` 值**；且 sisyphus 行是「Route-only conductor row: no personaFile / class / maxDepth」（`roster.ts:110-120` 注释逐字），**根本没有 `class` 字段**。11 席真实分布 = read-only 6 / worker 2 / orchestrator 1 / **allowlist 1**（multimodal-looker）/ **无 class 1**（sisyphus）。⇒ 资格规则的输入 = **class 为主 + seat id 兜底**——无 class 的 sisyphus 走结构性排除，不参与 class 匹配。

| 名册席 | class | 入队（草案） | 依据 |
|---|---|---|---|
| explore / oracle / librarian / plan-consultant / plan-reviewer / prometheus | read-only | **拒**（parse 期具名拒绝 + 可用清单） | explore/librarian/plan-consultant/plan-reviewer = 上游 v5 拒绝清单逐字对应（curated 只读四席，调查报告 §2.1-3）；**oracle/prometheus = 比上游更严的有意收紧**——v4 hard-reject 名单在册（同 §2.1-3）、v5 拒绝清单未列，本仓按 roster class 统一收紧（Phase 2 登记口径） |
| hephaestus / sisyphus-junior | worker | **允许**（category worker 释义的本仓承载席） | 调查报告 §2.1-2 |
| atlas | orchestrator | **T1 Q-5 裁定**（可委派性是否允许入队） | — |
| multimodal-looker | allowlist | **T1 Q-5 裁定**（草案建议**拒**：上游 v4 hard-reject 名单含 multimodal-looker（调查报告 §2.1-3）；v5 拒绝清单只列 curated 只读四席 + reviewer 三人组，未提及该席） | 调查报告 §2.1-3 |
| sisyphus | —（无 `class` 字段） | **拒**（结构性排除：lead 恒为当前会话，route-only 指挥席不作成员；按 seat id 判定，不经 class 匹配） | v5 模型 / `roster.ts:110-120` |

## 5. 待核清单（T1 Q 组镜像，闭环后转 ✅ 或更正）

| # | 待核项 | 计划书锚点 | 状态 |
|---|---|---|---|
| Q-1 | 12 个 `team_*` 工具全枚举 + 握手协议 + team.md 全文 | §6 | ⬜ |
| Q-2 ⚠️ | `ctx.agentTeams` 激活前提实跑 | §4.1 | ⬜ |
| Q-3 ⚠️ | per-member provider 适配器通透 | §4.1 | ⬜ |
| Q-4 | 工具遮蔽/共存与组合行落点 | §4.2 | ⬜ |
| Q-5 | 缝隙终态表（搬运清单重筛 + 收窄裁定） | §4.3/§4.4 | ⬜ |
| Q-6 | 深度与 jobs 边界 | §3 | ⬜ |
| Q-7 | 可视化面（面板可见性 / ChatNode 兜底裁定） | §4.6 | ⬜ |
| Q-8 | source kind 清单（`omo-team-*`） | §2 约束 6 | ⬜ |
