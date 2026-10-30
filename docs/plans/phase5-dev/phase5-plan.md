# Phase 5 开发计划：Team Mode（v5 模型，DSH 原生）

> **本目录**：[`docs/plans/phase5-dev/`](./) —— ROADMAP **Phase 5**（Team Mode）的实施计划。
>
> **上游依据**：[ROADMAP（中文）](../../roadmap_zh-CN.md) §4 Phase 5（含 2026-10-08 的 Phase 4.5 后锚点修订）· [决策 D14](../../decisions_zh-CN.md)（基线冻结）· [决策 D17](../../decisions_zh-CN.md)（0.2.x 单运行时）· [可行性报告 §2.5／§16.2](../../feasibility-report_zh-CN.md) · [agent 团队调查报告](../../omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md) §2（v5 team-mode 模型）· [dsh 0.2.0-rc.2 复核报告](../../dsh-0.2.0-rc.2-review_zh-CN.md)（运行时面权威）
>
> **配套文档**：[任务清单](./phase5-tasks.md) · [team 面清单与覆盖基线](./phase5-team.md)（计划期草案，T1 转实测）
>
> **状态**：🚧 立项（2026-10-08，基线 = Phase 4.5 结项后的 develop）。逐任务证据与退出标准核对见[任务清单](./phase5-tasks.md)。
>
> **修订记录**：
>
> - **2026-10-08 立项稿**——计划期实测（本机实装 `dsh@0.2.0-rc.2` 的 `.d.ts` 逐字核查，下文以 `$DSH` = `/home/linletian/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` 为引用基址）确立头条事实：**0.2.x 自带 experimental team 四包**（§3 首行），本阶段不是 greenfield——设计主轴是「DSH 原生优先」纪律下的**采用/扩展裁定**，而不是从 `ctx.subagents` 原样自建。
>
> - **2026-10-08 计划期评审修复（第 1 轮）**（4 项全部核验成立并采纳）——① **成员资格矩阵的 class 事实订正**（最实质）：`AgentClass` 四值无 `conductor`（`roster.ts:51` 逐字），sisyphus 为 route-only 行**无 `class` 字段**（`roster.ts:110-120`），multimodal-looker（allowlist 席）原矩阵漏列——真实分布 read-only 6 / worker 2 / orchestrator 1 / allowlist 1 / 无 class 1；资格规则改「class 为主输入 + seat id 兜底」，矩阵与 T4 判定改 **11 席全组合**（§3 roster 行 / §4.3 / 覆盖基线 §4 / T4 同步）。② §3 jobs 行与 ROADMAP 双语锚点的 `JobSpec{owner: SessionId}` → **`owner?: SessionId`**（复核报告 zh-CN :73 口径；owner 可选性支配访问围栏与 disposal 级联——§4.5 拆除推理的前提，误写的危害恰在本阶段承重处）。③ **残余量表述对齐**：ROADMAP 原写清单「收窄到 member-task 关联加 team 级状态」，与本计划 §4.4 已判「member-task 关联原生覆盖」漂移——双侧统一为「计划期判定：三项均大概率原生覆盖，残余 = 关停握手级语义 + team 级状态，P5-T1 Q-5 终态」；§4.4 三行补「计划期判定/T1 终态」标记，消除「划掉」的既成事实口吻。④ 附带：ROADMAP Phase 4.5 节（en/zh :76）的历史引文同字段笔误一并订正。
>
> - **2026-10-08 计划期评审修复（第 2 轮）**（2 项全部核验成立并采纳）——① **§1 ROADMAP 引文补齐**：引文体标「2026-10-08 修订后」却停在修订前的「须先重筛」半句——补上修订后的结论句「计划期裁定（P5-T1 终态化）：三项均大概率原生覆盖，清单预计收窄到关停握手级语义加 team 级状态」，与 §4.4 三行的「计划期判定」落笔及 ROADMAP 双语现文对齐（第 1 轮③的「双侧统一」由此才真正兑现到引文体）。② **oracle/prometheus 拒绝依据注记**（取证一致性）：上游 v5 拒绝清单只有 explore/librarian/plan-consultant/plan-reviewer + reviewer 三人组，oracle/prometheus 仅在 v4 hard-reject 名单——§4.3 与覆盖基线 §4 的 read-only 行依据格改双段式：四席 = v5 清单逐字对应；oracle/prometheus = **比上游更严的有意收紧**（v4 在册、v5 未列，按 roster class 统一收紧，Phase 2 登记口径），与 multimodal-looker 的逐席分歧注记同一取证标准。
>
> - **2026-10-09 T1 实测更正（第 3 轮，Q-1…Q-8 钉测闭环 + fork 裁定）**——**fork = (B)：`startContinuable` 自建**（裁定书 `.omo/evidence/p5t1/FORK.md`）。Q-2 激活钉测 5/5 PASS（R-4 解除），但 Q-3 钉死成员路由缝隙**结构性闭不合**：`spawn_teammate` 工具 schema 无 provider 参数（模型传的 provider 被静默丢弃）→ `SpawnTeammateRequest` 无三件套字段 → `spawnAdmitted` 硬编码 `request:{prompt,parent}`；`agentTeams` 公开 API 无外部子女 admission 接口；包装 provider 在 continuable 通道唯一参与点 `prepareContinuable({sessionId,parent,signal})→{seed?}` 非注入点。修复面在 dsh-experimental-agent-team（上游/pin 领域），按 R-2 协议裁 (B)。对照组实证 (B) 路基为绿：raw `startContinuable` 携三件套 → 成员 descriptor 逐字承载名册值 + mock 实效。连带更正：① §4.1 fork 翻转，experimental 三面（mailbox/任务板/projection/TeamAction）转为不采用，D18 登记；② §4.4 对账表按 (B) 重写（原生 inbox 替代 mailbox、team-core harness-neutral 子集 vendor、握手语义移植）；③ §4.6 可视化 = subagentchat + chat 帧，T11 复核点改 (B) 形态；④ R-3（工具遮蔽）随不挂 bundle 关闭；⑤ Q-1 实证：`describePlanError` 在 v4.19.4 不存在（等价物 = `execute.ts:69-81` 内联 suffix + `execute-batch.ts:95-105` + member-validator 文案）；12 个 `team_*` 工具全名单属 omo-opencode 面（senpi 面仅 `team_create`/`team_delete` + `task_*` 家族）；`TASK_STATUSES` 无 `failed`（上游提示词三处与 schema 矛盾，DSH 侧不照抄该文案）；上游任务板无 CAS/DAG/ready（锁+锁内重读、缺依赖可领）；⑥ Q-4 实证：原生 9 工具 lead/teammate **同面**（lead-only 靠执行期 `TEAM_LEAD_REQUIRED`），「成员结构性无 spawn_teammate」假设推翻；⑦ Q-8 实证：v4 准入只拒 `kind:'plugin'`、未知 kind 原样保留，约束 6 收窄为「omo 自有注入帧用 `omo-team-*`；经原生投递的载体承原生 kind」；⑧ Q-5 资格矩阵终态：atlas/multimodal-looker 拒入（有意收紧，覆盖基线 §4），v1 可入队席 = hephaestus + sisyphus-junior。

---

## 1. 目标

**DSH 上的并行多 agent 协作——当前会话即 lead，成员 = category worker（按 category 模型/技能开新 subagent 会话）与用户自定义 agent；mailbox 式协调。3 成员团队（lead + 2 category worker）在脚本化并行任务中完成协作且消息交换在 web UI 可见；嵌套 `team_create` 被拒；拆除后无孤儿会话。**

ROADMAP §4 Phase 5 原文（2026-10-08 修订后）：

- **目标**：如上。
- **设计依据**：v5 team-mode 模型（可行性报告 §16.2）——不是 v4 的声明式 lead 模型；v5 模型与 `ctx.subagents` + `ctx.jobs` 一一对应；消费的 jobs 形状 = 0.2.x 重写后（`JobSpec{owner?: SessionId, run(job)}`、`jobs.events.subscribe`、`JobView.owner`）；定向搬运清单（成员复活 TTL / fallback-wake #5317 / member-task 关联）**须先对照原生 continuable-subagent 面重筛**——计划期裁定（P5-T1 终态化）：三项均大概率原生覆盖，清单预计收窄到关停握手级语义加 team 级状态。
- **关键约束（0.2.x 新增）**：注入成员会话的 team 协调消息是新消息生产者——v4 准入对 `kind:'plugin'` 抛 `SessionFormatError`，每个 team 生产者第一天就声明专属 source kind。
- **可视化**：D4——web ChatNode via `ConversationNodeDefinition`；不用外部 tmux。
- **退出标准**：3 成员团队脚本化协作 + web UI 可见消息交换；嵌套 `team_create` 被拒；拆除无孤儿会话。
- **观察**：mass-ulw DAG 与 `dsh-workflow` 重叠，挺不过"DSH 原生优先"检查不重议。

本阶段的成功标志不是"能 spawn 几个子会话"，而是：**v5 team-mode 的语义契约——lead 恒为当前会话、成员资格校验、mailbox 协调、任务认领、受控拆除——在 DSH 原生 team 面上真实成立，且每一条都有能区分「真组队」与「静默降级」的断言**（原生面缺席/未激活必须响亮，不许塌缩成"没组上队"）。

### 1.1 计划期头条发现：0.2.x 自带 experimental team 面

ROADMAP Phase 5 的「设计依据」行写于发现之前。计划期实测（`$DSH` `.d.ts` 逐字核查）：

| 包 | 内容 | 证据 |
|---|---|---|
| `dsh-experimental-agent-team` | host 服务 **`ctx.agentTeams`**：roster、**durable mailbox**（落 Lead 会话日志 `team/message/queued`/`delivered`）、**共享任务板**（CAS `expectedRevision`、依赖 DAG 校验拒缺/重/环）、`waitForChange`、interrupt、**受控拆除**（disposal 关准入 → abort/await 在飞创建 → 经 continuation owner 释放 roster 的 live children **及其后代**，非 team 的 continuable children 不动） | `dsh-experimental-agent-team/lib/types/index.d.ts:18-112`；`roster.d.ts:87-97` |
| `dsh-experimental-tool-agent-team` | **9 个模型面 scoped 工具**：`spawn_teammate` / `send_message` / `list_agents` / `wait_agent` / `interrupt_agent` / `team_task_create/list/get/update`；**遮蔽同名 legacy 全局工具**（`send_message`/`list_agents`/`interrupt_agent`）；固定策略「仅在用户明示要 team 时才创建」 | `dsh-experimental-tool-agent-team/README.md` Summary；`lib/types/index.d.ts:9-14` |
| `dsh-experimental-client-ui-agent-team` | web 面板：会话头 TeamAction（roster + 只读任务板 + `openTeammate` 跳转），读 Lead 会话的 **`agentTeam` projection**（`TeamProjection{members, tasks, failure?}`） | `dsh-experimental-client-ui-agent-team/lib/types/client/TeamAction.d.ts:5-13`；`projection.d.ts:54-64` |
| `dsh-experimental-agent-team-profile` | 现成的 cordis bundle 层：禁用 `tool-subagent`/`tool-subagent-fork`/`tool-subagent-control`/`tool-subagent-list-agents` 四行，insert `agent-team` + `tool-agent-team` + `ui-agent-team` 三行 | `dsh-experimental-agent-team-profile/cordis.patch.yml`（逐字） |

**v5 模型与原生面的对位比 ROADMAP 行文设想的更直接**：`TeamId` = Lead（根）会话 id，每个顶层会话天然是潜在 Lead（`types.d.ts:5-12`）——「lead 恒为当前会话」是原生结构，不是要移植的语义；成员 = Lead 的 continuable 直接子会话（cold resume、queue/steer 投递、`sendWaking` 全部原生）。**这意味着 ROADMAP Phase 5 的「设计依据」行在 T1 fork 裁定后需要一次措辞修订**（回馈项，§9）。

原生面的**已声明限制**（README §Known Limitations，逐字登记为设计前提）：单进程单共享 checkout（**无 worktree/隔离**）、扁平不可变 roster（无嵌套/改名/删除，名字不复用）、无任务 owner 自动释放、mailbox = retry+去重**非 exactly-once**、每次变更推全量 projection。限额：config `maxMembers`（profile 先例写 8）/ `maxTasks: 256` / `maxPendingMessagesPerMember: 64` / `maxMessageBytes: 65536`。

**与 ROADMAP 目标的关键缝隙（计划期 `.d.ts` 实证）**：`SpawnTeammateRequest = {name, description, prompt, context:'fresh'|'fork', provider, signal}`（`types.d.ts:139-150`）——**无 persona / agentOptions / toolFilter 字段**。而 ROADMAP 要求「成员 = category worker，按 category 模型/技能」。承载 roster 语义（persona/模型路由/工具限制）的服务入口在更底层：`ctx.subagents.startContinuable(spec)`，其 `request = Omit<SubagentStartRequest,'label'|'signal'|'outputSchema'>` 保留 `agentOptions`（provider/model/reasoningEffort/maxTokens）、`toolFilter`、`persona`（`dsh-subagent/lib/types/types.d.ts:26-44,136-192`）。**闭合这条缝隙是 §4.1 中心 fork 的裁判对象。**

## 2. 不可协商约束

本阶段受 ROADMAP §2/§3 同等约束，另加本阶段特有的六条，全部同等效力：

| 约束 | 来源 | 本阶段的具体含义 |
|---|---|---|
| **冻结基线 = OMO v4.19.4** | ROADMAP §2 规则 1 / D14 | team 语义内容（12 个 `team_*` 工具契约、member-validator、mailbox 语义、生命周期、team.md 提示词）取自 v4.19.4 tag（commit `b072d279…`，与 Phase 1–4 同一锚点），只读 `git show/ls-tree`；**v5 的角色是模型依据**（lead=当前会话等文档对齐在 v4.19.4 senpi 代码路径已是实现事实——调查报告 §2.1 注，`TEAM_LEAD_SENTINEL` 两版相同），不是源码来源 |
| **DSH 原生优先（本阶段头号纪律）** | README 原则一 / ROADMAP Phase 5 | experimental team 面（`ctx.agentTeams` + 9 工具 + projection + web 面板）**先过采用检查**；只有结构性障碍（§4.1 的缝隙闭合不了）才退自建。凡原生已覆盖的语义（mailbox、cold resume、任务板、拆除）**禁止重写一份**；OMO 侧残余语义以「omo-team 工具层语义移植」或「记差异」二选一落地。【T1 执行注 2026-10-09：采用检查已做——Q-2 激活全绿但 Q-3 路由缝隙结构性闭不合 → fork (B)；(B) 下「原生已覆盖」的实指 = **原生 inbox/steer 投递、cold resume、continuable 生命周期与拆除原语**（禁重写的对象）；mailbox（team 专用帧/预约族）与任务板 = **vendor 上游语义**，不再属「原生已覆盖」】 |
| **SUL-1.0 合规与署名** | ROADMAP §3 约束 1 / D10 / D15 / D16 | 两类产物两种形态：① omo-team 插件代码 = **语义移植**（新写 DSH 代码，署名头 + NOTICES 逐文件，Phase 2/3/4 先例）；② `team.md` 提示词等内容 = **内容 vendor**（Phase 1 playbook 全套：per-file NOTICES、`VENDOR-MANIFEST.json` sha256、包级 `NOTICE.md`、`license` 字段、deviations[]）。**team-core 是否 vendor 是 fork 结果**——(B) 形态才 vendor（harness-neutral 子集：types/member-parser/team-registry/team-tasklist/team-state-store；**不 vendor** team-mailbox（原生 inbox 替代）与 team-layout-tmux（D4 否决 tmux）） |
| **门只加严不放松** | Phase 1–4 惯例 | 8 门链全绿维持；扩展既有门（门 2/3/4/6/8），**不加新门、不绕过旧门**；挂载同步网（cordis.yml 头注释的 COUNT COUPLING NET）3→4 行同 commit 全点位同步 |
| **静默失效类必配金丝雀** | Phase 4.5 惯例 | team 面的失效模式多是静默的（状态机未初始化、成员没被唤醒、拆除漏后代、注入没落地）——每个验收断言必须能区分「成立了」与「静默没发生」；(B) 形态在册具名状态优先做反向断言（settlement `settled.cause`、descriptor 缺席、`subagent/catalog` 空、vendored state-store 的 runtime status），原 (A′) 形态的 `TeamProjection.failure` 等面不挂载、不得作为断言对象【T1 更正 2026-10-09】 |
| **专属 source kind（v4 准入）** | ROADMAP Phase 5 关键约束 / P4.5-T9 | omo-team 侧**自有注入**消息（team 关键词指令、成员引导帧、握手纪律帧、广播镜像帧）用**专属 kind**（命名表 = Q-8 终态：`omo-team-keyword`/`omo-team-briefing`/`omo-team-shutdown`/`omo-team-broadcast`）；**经原生投递通道（sendMessage/mailbox）的载体承原生 kind 不可改**（(A′) 形态 `'team-message'`、(B) 形态 `'agent-message'`，omo 帧在 content 内自标识）。【T1 Q-8 修订 2026-10-09：① v4 准入实测只拒 `kind:'plugin'`/非对象/空串，未知 kind 原样保留（`dsh-session-format-v3-to-v4/lib/index.js:118-126`）——`omo-team-*` 准入安全是已证事实；② 原括注「`team-message` 已在 `MessageSourceMap`（continuation-messages 合并面）」指错文件，登记处实为 `dsh-experimental-agent-team/lib/types/types.d.ts:113-124`（TS 声明合并），continuation-messages 只登记 `'agent-message'`/`'subagent-settled'`】 |
| **双语同步 / 非商业 / 不提 PR** | docs 惯例 / D8 / D5 | 交付文档（README/CHANGELOG/decisions/ROADMAP 回馈）en + zh 同 commit；本目录为纯中文工作文档 |

## 3. 现状盘点（Phase 4.5 结项基线）

| 构件 | 现状 | 本阶段的影响面 |
|---|---|---|
| **原生 experimental team 面** | §1.1 四包随 `dsh@0.2.0-rc.2` 安装件在场，**默认不挂载**（dsh-base 无引用；以 profile bundle 形式发布）；激活前提 = durable session 存储（`dsh-session-persistence-jsonl` 在 dsh-base `cordis.patch.yml:130-131` 已挂载——前提**看上去**满足，T1 Q-2 实跑钉测） | §4.1 fork 的 (A) 侧基料；挂载形态（照搬 profile bundle vs 自有行）由 T1 定 |
| **continuable subagent 面** | `ctx.subagents.startContinuable` 携带 roster 语义三件套（agentOptions/toolFilter/persona）；`sendMessage` 限**相邻 Agent**（直系父/子）；delivery = `queue`/`steer`；冷恢复由「向非驻留子会话投递」触发，descriptor v3 供全部重建输入；`SubagentInbox`/`sendWaking`/`drainContinuableDescendants` 完备 | fork (B) 的基料；(A) 侧的成员路由缝隙闭合候选（per-member provider 适配器，Q-3） |
| **concerto 组合** | 10 条 `tool-subagent-<agent>` 委派行（`backgroundMode: continuable`、maxDepth 2、per-row persona/agentOptions/deny 三族 sentinel，census 29）+ 已挂载 `tool-subagent-control`（全局 `send_message`/`interrupt_agent`）与 `tool-subagent-list-agents`；上游 team profile 恰好**禁用这两行 + 两个 generic 行**（generic 两行本仓早已 DROP） | team 9 工具与既有行的遮蔽/共存裁定（Q-4）→ **T1 终态：fork (B) 不挂 bundle，组合零改动**（12 行序列/静态门/census 全不动；Q-4 证据存档） |
| **roster 与资格输入** | `roster.ts` 11 agent + `class` 语义（`AgentClass = 'read-only'|'worker'|'orchestrator'|'allowlist'`，`roster.ts:51` 逐字——**无 `conductor` 值**；分布 = read-only 6 / worker 2 / orchestrator 1 / **allowlist 1**（multimodal-looker）/ **无 class 1**（sisyphus 为 route-only 行、无 `class` 字段，`roster.ts:110-120` 注释逐字）），Phase 2 已登记「成员资格语义（只读禁入）归 Phase 5，以 class 字段为输入」 | member-validator 的 DSH 形态 = **class 为主输入 + seat id 兜底**（无 class 席结构性排除，不经 class 匹配）；category 体系概念在 DSH 无对应物——**category worker 的 DSH 释义 = 名册 worker 席 + 其模型路由**（Q-5 收窄裁定） |
| **jobs 面（0.2.x 形状）** | `JobSpec{owner?: SessionId, run(job)}`、`jobs.events.subscribe({owners})` + `settled{awaited, cause}`、`JobView.owner`——**owner 可选**：略 owner 即无围栏 job，任何 caller 可操作直至 service disposal（复核报告 zh-CN :73 口径）；owner 的有无恰支配访问围栏与 disposal 级联，是 §4.5 拆除推理的前提。`JobKindMap = {bash, subagent}`——**subagent 是一等 job kind，但只有 one-shot 后台 run 进 jobs**；continuable children 无 Task/job（`run-settlement.d.ts:1-4`） | team 成员（continuable）**不在 jobs 里**——「拆除无孤儿」的断言面 = subagent catalog/descriptor + **omo-team 自持 vendored state-store**（(B) 形态，T1 更正；无原生 roster projection）；后台通知/级联取消与 team 的边界裁定（Q-6） |
| **关键词检测 team 槽** | `keyword-detector/constants.ts:30-31,64`：`KeywordType` 含 `'team'` 预留位、`TEAM_PATTERN = /\bteam[\s_-]?mode\b/i` 已在；`TEAM_MESSAGE` 未接线（注释：上游指向 `prompts-core/prompts/mode/team.md`，当时判「DSH 无等价面」）——**Phase 5 到位后该判词过期** | §4.7：接线 = vendor team.md + 注入面开通（H-33 模块内演进，不是新 hook 条目） |
| **Phase 3 deferred（本阶段接盘）** | S-07 `team-mailbox-injector/`、S-08 `team-mode-status-injector/`、S-09 `team-session-events/`、S-10 `team-tool-gating/`、S-11 `category-skill-reminder/`、S-12 `delegate-task-retry/`（纯函数参考级）、S-39 `atlas/`（60 条目，boulder 依赖）、S-43 `unstable-agent-babysitter/` | 逐模块处置进[覆盖基线](./phase5-team.md) §2——原生 team 面到位后，多数预计判「原生覆盖/无守卫对象」而非移植；**每个都要有成文裁定**（不许默认滑过） |
| **Phase 4 handoff** | ① team 关键词子模式（上条）；② `/hyperplan` 完整对抗评审环（Phase 4 落的是降级形态，模板自带 team 缺席降级文案）；③ remove-ai-slops 模板 team-mode addendum 段；④ stop-continuation 的 team 后代取消语义 | §4.8 接盘清单 |
| **e2e/观测基础设施** | drive.mjs v4 夹具 + sandbox-vanished SKIP 三计数密封；prove/smoke 信封读取点双形状已收口到 v4；会话日志 v4 准入（producer-owned source kind 强制） | team 场景群（§4.9）直接复用；`team/message/*` 事件断言 = v4 形状 |
| **门链与同步网** | 8 门全绿（Phase 4.5 结项快照由 PRE-2 重采）；根 `cordis.yml` 3 insert 行 + COUNT COUPLING NET（doctor-lite `EXPECTED_INSERT_ROW_IDS`、`tests/omo-hooks/cordis-inserts.test.ts`、cold-start/drive/probe/smoke 安装点）；`verify-licenses` checked=56 | omo-team = **第四插行**，3→4 全网同 commit；新包入 license 检查（checked 56→57 预期） |
| **0.2.x 其它相关面** | host `subagent.maxDepth` 默认 **1**（tool 行不写 maxDepth 时逐委派读 host 设置）；`PreToolDecision` 有 `{kind:'cancel'}`；`agent/session-start` 已删（并入串行 `agent/created`）；`turn/end` 有 `forked` 变体 | 成员深度语义（Q-6）；member 的 pre-tool 拦截若需要，用 `cancel` 不用 deny 改写 |

## 4. 方案设计

### 4.1 总体策略与中心 fork（**T1 已裁定：fork = (B)**，2026-10-09）

> **裁定书**：`.omo/evidence/p5t1/FORK.md`。本节以下原文为计划期双形态设计，**裁定后仅 (B) 分支为执行面**；(A′) 分支保留为裁定依据档案（Q-2 激活 5/5 PASS、Q-3 缝隙三重封死链）。

**默认方向（A′）采用原生 team 服务 + omo 工具层**，**降级方向（B）`startContinuable` 自建**——T1 钉测后 fork 裁定，证据驱动、不得默认滑入（Phase 4.5 安装器线先例）。

- **（A′）原生采用 + 缝隙闭合**（**T1 裁定：不可行**）：Q-2 实证服务激活/mailbox/事件面全绿（R-4 解除）；但 Q-3 钉死成员路由缝隙**结构性闭不合**——① `spawn_teammate` 工具 schema 无 provider 参数（模型逐字传的 provider 被静默丢弃，`tool-agent-team/lib/index.js:245-266,:290`）；② `SpawnTeammateRequest` 无 persona/agentOptions/toolFilter 字段且 provider 仅字符串（`agent-team types.d.ts:139-146`、`:557`）；③ `spawnAdmitted` 硬编码 `startContinuable request:{prompt,parent}`（`agent-team/lib/index.js:573-582`）；④ `agentTeams` 公开 API 无外部子女 admission 接口（spawnTeammate 唯一入场口）；⑤ 包装 provider 在 continuable 通道唯一参与点 `prepareContinuable({sessionId,parent,signal})→{seed?}` 非注入点。修复面在 dsh-experimental-agent-team（上游/pin 领域，D7 不动）。按 R-2「闭不合 → (B)，不是『接受无路由』」执行。
- **（B）自建（T1 裁定为执行面）**：omo-team 直接在 `startContinuable` + 原生 inbox/sendMessage 上实现 team 状态机，team-core harness-neutral 子集按 §2 vendor 约束 vendor 进 `patches/omo-dsh/vendor/team-core/`（子集闭包 = **T2 双评审后终态**：verbatim = types/member-parser/config/logger/tolerant-fsync/**session-client（纯类型，评审补入）**/team-registry/team-tasklist（除 test-support）/team-state-store（**除 reservation-reconciliation**——`.delivering-` 预约回收不移植的机械落点，唯一带 team-mailbox 运行时依赖的文件）；deviation = active-resume.ts（删预约回收调用）；外部依赖 = `zod`（^4.4.3，npm 引入）+ `@oh-my-opencode/utils` 一件（**isPlainRecord**，store.ts:1 唯一消费点；isRecord 原消费点随 reservation-reconciliation 排除件出局——T8 二选一 vendor/语义移植）；**不 vendor** team-mailbox——原生 inbox 替代——与 team-layout-tmux——D4）。**(B) 路基已实测为绿**：raw `startContinuable` 携三件套 → 成员 descriptor 逐字承载名册路由值（Q-3 对照组）+ mock 实效（模型/persona/工具面三验）。**不挂 experimental bundle**（成员无法入其 journal，挂载只买遮蔽冲突——R-3 随之关闭）。
- **两形态共通的验收不变量**：退出标准三条（§5）与成员路由可观测性（成员会话 descriptor 的 `agentProvider`/`agentModel` = 名册路由值）在任一形态下都必须成立——fork 选的是**实现面**，不是语义缩水。(B) 下该不变量由 Q-3 对照组实证成立。

### 4.2 插件拓扑：`omo-team`（新，第四插行）——**T1 终态（fork (B)）**

- **新包** `patches/omo-dsh/omo-team/`（`@oh-my-opendsh/omo-team`），host 为主 + 视 §4.6 裁定可能带 client face（omo-agents 的双 tsconfig 先例）。职责单一口径：team 组建/协调语义与 OMO 接盘项——不吸收名册（omo-agents）、不吸收通用护栏（omo-hooks）。**(B) 形态职责扩展（T1 裁定）**：除模型面工具层外，omo-team 自持 team 状态机（vendored team-core 子集接线）与成员创建（`startContinuable` 逐成员三件套）——全部消费点收在 omo-team 单一适配层的纪律不变。
- **单一事实源 `src/manifest.ts`**（omo-hooks/omo-commands 先例）：每行 = team 面条目（id / 上游源路径 / 原生面对应 / 处置（原生采用/语义移植/内容 vendor/记差异）/ e2e 场景名 / 状态）；[覆盖基线](./phase5-team.md) 由 manifest 派生核对（一致性单测）。
- **挂载**：根 `cordis.yml` 第四个 `- insert:` 行（`id: omo-team`）——**COUNT COUPLING NET 3→4 同 commit 全点位**（doctor-lite `EXPECTED_INSERT_ROW_IDS`、`tests/omo-hooks/cordis-inserts.test.ts`、cold-start、drive.mjs、probe、smoke-real、头部注释）；boot marker `[omo-team] …` 逐行 + 汇总行（probe 断言锚点；loud-but-non-fatal）。**(B) 形态不插 experimental 三行**（agent-team/tool-agent-team/ui-agent-team 均不挂载，D18 登记）。
- **组合面改动**：**T1 裁定 = 零改动**（fork (B) 不挂 bundle → 无 scoped 遮蔽 → concerto 模板 12 行序列、control/list-agents 两行、10 命名委派行全部不动；Q-4 落点裁定因失对象而关闭；vendor shared-skills 文本的 `team_send_message` OMO 参数残留转 T12/T13 处置，R-3 关闭注记）。

### 4.3 组建与成员模型

- **lead**：恒为当前会话（原生结构，零移植）；`TEAM_LEAD_SENTINEL = "lead"` 的词汇保留在 omo-team 工具层文案（语义移植，署名头注上游 `senpi-task/src/team/normalize.ts`）。
- **team_create**：OMO v5 inline spec `{name, members:[{name, category|subagent_type, prompt?}]}`（调查报告 §2.1-1）映射为 omo-team 工具（**(B) 下底层 = `startContinuable` 逐成员**——名册席三件套随 request 流入 descriptor，Q-3 对照组实证；成员 `context:'fresh'` 为默认，`fork` 语义与 OMO 无对应——**不暴露在 v1 工具面**，记差异）。**nested team_create 拒绝**：omo 侧两道（T1 Q-4 后按 (B) 形态重写）：成员会话的 team 工具集**结构性不含 `team_create`**（工具面按角色分发，T5 实现）+ 服务强制具名拒绝（对齐上游 `TEAM_LEAD_REQUIRED` 语义族——T1 Q-4 实证原生 9 工具 lead/teammate 同面、lead-only 全靠执行期具名错误，(B) 形态沿用该「同面 + 执行期具名拒绝」双层形态）；e2e 断言成员尝试组建被拒且**带具名错误**。
- **成员种类**：① category worker——**DSH 释义裁定（T1 Q-5 终态 2026-10-09）**：OMO category = 命名模型+技能包；本仓无 category 注册表，最近邻 = **名册 worker 席**（hephaestus/sisyphus-junior，自带模型路由与 deny 面）——v1 成员种类收窄为「**名册 worker 席 + 其 category 别名**」（T4 落地面：别名表 {quick→sisyphus-junior, deep→hephaestus}，评审更正 2026-10-09——原「名册可委派席」字面含 10 个委派目标，与 T1 终态矩阵相悖，收紧为 worker 席），`UNRESOLVABLE_CATEGORY` 语义保留（报可用清单）；② `subagent_type`（用户自定义 agent）——DSH 无用户自定义 agent 注册表，**v1 记差异不实现**（覆盖基线成文）。两个收窄都是语义层裁定，不是实现偷懒：上游成员种类的**作用**（按工种定模型/技能）由名册席承载。
- **成员资格（member-validator）**：上游 v5 规则（调查报告 §2.1-3）= curated 只读四席 + ulw-loop reviewer 三人组 parse 期硬拒。DSH 映射：以 roster `class` 为**主输入、seat id 兜底**——read-only 六席（explore/oracle/librarian/plan-consultant/plan-reviewer/prometheus）**拒入 team**，其中 explore/librarian/plan-consultant/plan-reviewer 与上游 v5 拒绝清单逐字对应，**oracle/prometheus 是比上游更严的有意收紧**（v4 hard-reject 名单在册、v5 拒绝清单未列——按 class 统一收紧，Phase 2 登记口径；与 multimodal-looker 同类的逐席分歧注记见[覆盖基线 §4](./phase5-team.md)）；**orchestrator 席（atlas）与 allowlist 席（multimodal-looker）= T1 Q-5 终态：均拒**（atlas = 有意收紧：Q-6 实证成员工具面无委派通道、orchestrator 职责在 team 内结构性不可行；multimodal-looker = v4 hard-reject 在册收紧）；**sisyphus 无 `class` 字段**（route-only 行，`roster.ts:110-120`），按 seat id 结构性排除——lead 恒为当前会话，指挥席不作成员；reviewer 三人组本仓无对应席，记名即可。**v1 可入队席 = hephaestus + sisyphus-junior**（11 席矩阵见覆盖基线 §4）。拒绝文案列出可用项（上游可用清单文案语义——T1 Q-1 实证 `describePlanError` 在 v4.19.4 不存在，等价物 = `execute.ts:69-81` 内联 suffix / `execute-batch.ts:95-105` / member-validator 文案三处，语义对齐而非符号对齐）。
- **per-member 路由**：成员会话 descriptor v3 的 `agentProvider`/`agentModel`/`persona`/`toolFilter` 字段 = 验收断言面（descriptor 事件在日志可读）；「成员带着自己席位的模型路由」是退出标准 a 的隐含分项（ROADMAP Phase 2 的 AC-5 模式推广到 team 成员）——**(B) 形态由 `startContinuable` request 三件套直驱，Q-3 对照组实证 descriptor 逐字承载**。

### 4.4 协调语义映射（mailbox / 广播 / 关停握手 / 工具对账）——**T1 终态（fork (B)）**

| OMO 语义（v4.19.4 + v5 模型） | fork (B) 实现面 | 处置（T1 终态） |
|---|---|---|
| 文件式 per-member inbox + `.delivering-` 预约（崩溃 10min TTL 回收） | 原生 inbox/sendMessage：steer = 最近步边界准入；空闲目标直接开 turn；缺席目标冷恢复；durable 落会话 v4 日志（Q-5b 金丝雀实证唤醒） | **原生 inbox 替代（不 vendor team-mailbox）**；预约/TTL 语义**记差异**（原生统一 inbox 准入，无预约族；Q1b 另钉四层 TTL 全名单：预约 10min / claim 锁 300s / deleting 60s / 消费者租约 0——vendor 侧 team-state-store 自带前两者语义，差异逐条记）；「仅 lead 广播」= 工具层纪律（member↔member 非相邻、天然经 lead，与上游意图一致） |
| live delivery 经 `promptAsync`；fallback-wake（#5317：live 落 fallback 后唤醒空闲成员） | 原生投递路径统一经 inbox 准入，无「live 失败落 fallback」岔路——#5317 病灶形态**结构性不存在** | **原生覆盖（T1 Q-5 终态）**，搬运清单划掉 fallback-wake；Q-5b 金丝雀 = warm 唤醒实测 + cold 恢复 T6 e2e 断言 |
| 成员复活 TTL（终态成员不再重生，TTL 锚 `terminal_at`） | 原生 settlement（`ownedChildren` 空 + inbox 空才 settle）+ vendored `team-state-store` 的 resume/TTL 语义（creating 30min / deleting 60s / 预约 10min） | **vendor + 原生组合（T1 Q-5 终态）**；「终态不再重生」差异逐条进覆盖基线（T6 e2e 断言面） |
| member-task 关联（`team_run_id`/`team_member_name`/`child_session_id` 入 TaskRecord） | vendored `team-tasklist` 的 `owner`/`claimedAt` + omo-team 状态机的 member↔session 映射 | **vendor 覆盖（T1 Q-5 终态）**，搬运清单划掉 |
| 关停握手（request/approve/reject；无自动超时——Q1a §5.4 实证超时是提示词语义） | omo-team 工具层状态机（vendored state-store 存 shutdownRequests）+ 询问/回复消息经原生投递 + 批准/超时后 interrupt/drain | **语义移植（T1 Q-5 终态）**——lead-only request、approve/reject = lead 或目标成员（上游代码为准，AGENTS.md:41 文档陈旧记差异）；幂等语义逐字对齐；无自动超时同构（lead 提示词承担 + closure invariant） |
| 12 个 `team_*` 工具 | omo-team 工具层（(B) 自建面） | **T1 已逐行终态**——见[覆盖基线 §1](./phase5-team.md)（`team_create`/`team_delete`/握手三件/`team_send_message` = 语义移植；`team_task_*` 四件 = vendor+接线；`team_status` = 语义移植；`team_list`/`team_wait` = 记差异） |

### 4.5 任务板与生命周期（**T1 终态：fork (B)**）

- **任务板 = vendored team-tasklist + omo-team 工具薄壳**：`team_task_create/list/get/update` 经 vendor 件接线，上游语义原样（Q1b 实证：**锁 + 锁内重读**非 revision-CAS、**缺依赖视为可领**、**无环检测**、**无 `ready` 派生**、**无 `failed` 态**——上游提示词三处命令 `failed` 与 schema 矛盾，DSH 侧不照抄该文案，v1 不增设失败终态、记差异）；成员 claim（`status:"claimed"`）= vendored `claimTask`（`AlreadyClaimedError`/`BlockedByError`/claim 锁 300s 逐字随 vendor）。`tasks/claims/`（瞬时锁目录）与 `.highwatermark`（ID 水位）随 vendor 件自然成立（Q1b §C-4 实证其为锁/水位，原计划「不移植」草案经 T1 更正为「随 vendor 成立」）。
- **显式决策（双评审建议登记 2026-10-09）：为何不照抄原生任务板的更强语义（CAS `expectedRevision`/DAG 拒缺重环/`ready` 派生/`failed` 态）？**——① **冻结基线纪律（§2 约束 1）**：team 语义内容的唯一来源 = OMO v4.19.4 tag；原生板的更强语义不在冻结基线内，照抄 = 新设计而非移植，既无上游锚点也无法用上游行为做一致性验证；② **基线可测性**：vendored 弱语义与上游逐字同构，e2e 断言可对上游逐字对账（`BlockedByError`、缺依赖可领等）；自造强语义只能自证，破坏「冻结基线可逐字核对」的取证模型；③ **范围纪律**：加强语义（CAS/DAG/ready/failed）是独立设计题，若真需要，走将来单独的提案与决策登记，不搭 Team Mode 移植的车。**故：v1 任务板 = vendored 上游弱语义原样，强弱差异成文，不无声继承也不无声加强。**
- **生命周期五步**（create → 委派 → claim → 关停握手 → delete 清理）逐段映射进覆盖基线；delete 的「拒活跃成员除非 `force:true`」（v5 语义）= omo-team 工具层纪律，底层 = 原生 `interrupt`（保 inbox）+ continuable drain/disposal 组合。
- **拆除无孤儿（退出标准 c）**：(B) 形态成员 = 普通 continuable 子女——断言面 = `listDescendants(leadSessionId)` 空 + vendored roster 状态清空 + `session/disposed` 对齐；反向金丝雀 = 孙代**负向断言**（T1 Q-6 裁定：成员工具面无委派通道 = 结构性不派生，断言 `listDescendants` 无 depth≥2 行）。

### 4.6 可视化（D4）——**T1 终态（fork (B)）**

- **(B) 形态无 TeamAction/projection**（不挂 bundle）。**默认 = 通用面板承载**：成员 = lead 的 continuable 直接子会话 → 天然入 `dsh-client-ui-subagent` 的 `subagentchat` 目录面板（T1 Q-7 实证 `establishCatalogChild` 路径）；消息交换 = lead 会话的 `'agent-message'` 帧渲染（唤醒轮 turn-trigger 卡，Q-7 同族证据）+ 成员会话内消息经 subagentchat 可读。
- **T1 Q-7 已钉的可见性事实**：`isVisibleChatNode` 隐藏中途 steer 的 'context' kind 帧（chat client.js:7718-7722）——唤醒轮投递可见、中途 steer 隐藏，记差异；**member↔member 直通消息在 (B) 形态结构性不存在**（原生 sendMessage 相邻约束 → 必经 lead 中转，语义固化非缺陷——评审登记 2026-10-09）；经 lead 中转的帧在 lead 工具面可见、在目标成员会话可见，不作为 T11 触发条件。
- **兜底 = 自定义 ChatNode**：`ConversationNodeDefinition` 契约已核（`match/start/update/buildViewNode`，client 侧 `ConversationEventRegistry.register` 返回 disposer；fallback 槽已被占用、普通 Definition 即可）——仅当 T10 复核裁定通用面板对「team 消息交换」不满足退出标准 a 时自建（T11 触发条件，(B) 形态复核）。
- **证据分层**：L1（CI 可跑）= 事件/目录断言（headless）；L2 = 真浏览器肉眼核验（手动冒烟，证据截图/记录进 `.omo/evidence/`）。**「web UI 可见」的退出标准以 L2 为终证，L1 为回归网**——CI 没有浏览器是环境事实，不许反过来把退出标准缩水成「projection 有数据」。

### 4.7 team 关键词模式（H-33 模块内演进）

- 接线 `TEAM_PATTERN` 命中 → 注入 team 指令：`TEAM_MESSAGE` 内容 = 上游 `prompts-core/prompts/mode/team.md`（**内容 vendor**，§2 约束 3——单文件 vendor 走 Phase 1 playbook 全套）；注入面 = keyword-detector 既有 pre-step 注入，专属 source kind `omo-team-keyword`（§2 约束 6）。
- **v1 语义收窄裁定（T1 终态化）**：上游 team.md 是 `team_create` 团队的运行协议全文——其中引用 OMO 载体（worktree 自动化、`~/.omo` 布局、tmux）的段落按「内容保真 + 消费侧适配」纪律处理（vendor 正文不动；omo-team 工具层文案与成员引导前缀承担 DSH 现实收窄），差异记覆盖基线。
- 配置面复用 H-33 既有 `disabled_keywords`/`enabled_expansions` 机制，无新增配置。

### 4.8 Phase 4 接盘项

| 项 | 内容 | 形态 |
|---|---|---|
| `/hyperplan` 升级 | Phase 4 落的是降级形态（模板自带 team 缺席指引）；team 面到位后恢复完整对抗评审环语义 | omo-commands 模板段升级 + e2e 场景升级；**模板文本两处状态（降级/完整）的切换判据 = team 工具在场探测**，不许硬编码 |
| remove-ai-slops team addendum | 模板 addendum 段（team 语境的清扫纪律） | 同上，随 team 在场探测恢复 |
| stop-continuation team 语义 | 级联取消扩展到 team 成员树 | guard 服务消费面扩展：**(B) 形态 = 对 continuable 子女树的 interrupt/drain 分支**（dsh-subagent 的 drainContinuableDescendants 族——成员与既有委派子女同族，T1 Q-6），与既有 jobs 级联并列；e2e 断言 team 成员真实停摆 |

### 4.9 门与 e2e 扩展（不加新门）

| 层 | 扩展内容 |
|---|---|
| **门 2 单测** | manifest 形状/一致性；member-validator 纯函数（资格矩阵全组合）；inline spec 解析；工具层 handler 结构式 mock（**(B) 形态 = `startContinuable`/`sendMessage` 调用序列与参数**，T1 更正）；关键词 team 模式检测用例（H-33 种子扩）；广播/握手状态机 |
| **门 3 e2e** | **team 场景群**（drive.mjs 新增）：`team-create-and-message`（3 成员组队 + 双向消息 + descriptor 路由断言 + **(B) 形态投递事件对**（`'agent-message'` 帧 + `agent/inbox/spliced` 槽，T1 更正））、`team-nested-create-denied`（成员尝试组建 → 具名拒绝）、`team-teardown-no-orphans`（孙代负向金丝雀，T1 Q-6 更正）、`team-keyword-mode`（TEAM_PATTERN 注入 + 对照不注入）、`stop-continuation-team`（级联停摆）；全部复用 v4 夹具与 sandbox-vanished 纪律 |
| **门 4 doctor-lite** | 第四插行断言（EXPECTED_INSERT_ROW_IDS 扩展）；team 行 Config schema 校验 |
| **门 6 静态门** | c 组延续编号：四插行、omo-team 署名头覆盖、manifest↔文件集合、vendor 条目存在性；**c14 基线文档并集扩展裁定**——phase5-team.md 含 H-号段条目时须入 `COVERAGE_BASELINE_MDS`（同步网，R-8） |
| **门 8 proofs/probe** | 冷启动日志断言 omo-team marker；probe 增 team 面探测（**(B) 形态 = omo-team 状态机/工具面在场性具名 marker**——状态机未初始化/工具缺席必须响亮，§2 金丝雀纪律，T1 更正） |
| **L2 真机** | 真实 web boot + 浏览器核验面板可见性 + 一次真实 3 成员协作；证据 `.omo/evidence/p5-l2-*.md` |

### 4.10 署名与合规

- omo-team 新写文件 = 署名头（上游源文件 tag 相对路径 + 「语义移植」声明）+ `THIRD_PARTY_NOTICES.md` Phase 5 小节（语义移植表先例 = Phase 4 的逐命令表）。
- 内容 vendor（`team.md` 及 T1 增补的提示词类）= playbook 全套；`verify-licenses` checked 预期 56 → 57（omo-team 包）+ vendor 条目数，逐条对应。
- (B) 形态才发生的 team-core vendor：子集清单与「不 vendor mailbox/tmux」的理由进 NOTICES 与计划修订记录。

## 5. 退出标准与证据

| # | ROADMAP 原文 | 证据（本计划的关键判定） |
|---|---|---|
| **a** | 3 成员团队完成脚本化并行任务，消息交换在 web UI 可见 | L1：`team-create-and-message` 场景绿（组队 + 双向消息事件对 + descriptor 路由断言 + 任务板 claim）；L2：真实 web boot 浏览器核验 **subagentchat 面板达成员会话 + lead 会话 'agent-message' 帧可见**（(B) 形态，T1 更正），证据文件成文。**两条都要**——L1 是回归网，L2 是退出标准的字面兑现 |
| **b** | 嵌套 `team_create` 被拒 | `team-nested-create-denied` 场景绿：成员调组建工具 → 具名拒绝（非静默无-op）；单测资格矩阵覆盖 |
| **c** | 拆除后无孤儿会话 | `team-teardown-no-orphans` 场景绿：`listDescendants` 无残留 + **vendored roster 状态清空**（(B) 形态，T1 更正）+ 孙代负向金丝雀（T1 Q-6 裁定：成员结构性不派生，断言无 depth≥2 行）；stop-continuation 场景复验 |

**DoD 补充**（沿用 Phase 1–4 的 c/d/e）：

- **c**：`scripts/ci-local.sh` 全 8 门绿，门扩展只加严不放松。
- **d**：本计划目录文档与实测无冲突——凡 T1 钉测推翻计划假设处（Q-2 激活前提、Q-3 provider 适配器、Q-4 遮蔽共存、Q-7 面板可见性），改文档而不是改结论（修订记录成文）；**fork 裁定的结果（A′)/(B) 连同依据回填本节与 ROADMAP Phase 5 措辞**。
- **e**：未移除任何既有署名；`verify-licenses` 计数变化全部有对应条目；`THIRD_PARTY_NOTICES.md` 既有条目只增不改。

**明确不属于退出标准**（范围蔓延护栏）：

- ❌ worktree 自动化（原生面明示无隔离/checkout 语义；OMO 侧本就可选）——记录差异，不建设；
- ❌ `subagent_type` 用户自定义 agent 成员种类（DSH 无注册表，记差异；真有需求走将来的 agent-presets 面重议）；
- ❌ mass-ulw / DAG 拓扑、`dsh-workflow` 消费（ROADMAP §6 观察项）；
- ❌ S-39 `atlas/` 模块移植（boulder-state 依赖未移植，维持 deferred）；
- ❌ experimental 面之外的 0.2.x 新特性消费；OMO 侧任何改动（D14）；
- ❌ 对 0.2.x rc 线追新（pin 纪律 D7/D17：本阶段全程钉 `0.2.0-rc.2`，中途不换靶）。

## 6. 风险与开放问题

| # | 风险 / 问题 | 影响 | 处置 |
|---|---|---|---|
| **R-1** | **experimental 面的稳定性**：四包以 experimental 名义发布、自述无稳定性保证；0.2.x rc 线后续版本可能改契约 | 高 | **实质关闭（2026-10-09，fork (B)）**：不采用 experimental 面（D18 登记），其契约漂移不再是本阶段风险；残余义务转化 = pin 钉死 rc.2（D7）不变 + **每次 bump-dsh 复核 `dsh-subagent` 的 `.d.ts` diff**（(B) 的真正依赖面 = startContinuable/sendMessage/descriptor v3/drain 族）+ omo-team 消费点收单一适配层（不散落） |
| **R-2** | **fork (A′) 的缝隙闭不合**：provider 适配器链不通（Q-3），成员拿不到名册路由——(A′) 塌缩成「通用无路由成员」，背离 ROADMAP 目标 | 高 | **已触发并处置（2026-10-09）**：Q-3 钉死三重封死链 → **fork = (B)**（FORK.md）；(B) 路基 Q-3 对照组实证为绿；vendor 成本按 §7 已登记的 +3 天执行 |
| **R-3** | **工具遮蔽冲突**：team 9 工具遮蔽 `send_message`/`list_agents`/`interrupt_agent`——本仓组合已挂载 `tool-subagent-control`（同名全局工具）且上游 profile 的解法是**禁用**它；既有 e2e 场景若消费这些工具会受影响 | 中 | **已关闭（2026-10-09，fork (B)）**：不挂 bundle 即无遮蔽面；Q-4 盘点结论（零工具调用场景、零工具面在场断言；文本/名单/行 id 三类名称级消费）存档备查；Q-4 NOTES-6（vendor shared-skills 的 `team_send_message` OMO 参数残留）转 T12/T13 处置 |
| **R-4** | **服务激活前提不成立**：team 服务需 durable 会话存储；本仓沙箱 profile 的 `compression: none` + jsonl 持久化看似满足，未实跑 | 中 | **已关闭（2026-10-09）**：Q-2 激活钉测 5/5 PASS（挂载/boot/在场/组队/事件对/持久化全绿）——(A′) 侧激活前提成立（fork 转向的原因是 R-2 而非 R-4） |
| **R-5** | **「web UI 可见」证据缩水**：CI 无浏览器，L1 只能断言事件/目录——把退出标准 a 执行成「事件有数据」是静默缩水 | 中（验收诚信） | §5(a) 双证据纪律成文；L2 真机核验列为收口任务（T16）的硬性组成 |
| **R-6** | **OMO mailbox 语义差被掩盖**：原生 retry+去重 ≠ 预约/exactly-once；消息乱序/重复在成员长任务上才显现 | 中 | 差异逐条记覆盖基线（不许「差不多」带过）；e2e 含一条「同 id 重投去重」断言 |
| **R-7** | **范围蔓延进 DAG/workflow**：mass-ulw 与 `dsh-workflow` 的诱惑在 team 到位后变大 | 低 | 观察项维持；本阶段任何 workflow 消费 = 破门信号 |
| **R-8** | **同步网漏点位**：第四插行（COUNT COUPLING NET 3→4）、c14 基线文档并集、census/静态门、`checked` 计数——同类坑在 Phase 4（R-11）与 Phase 4.5 都踩过 | 高（破门/破启动） | §4.2/§4.9 的同步清单成文；首个触碰任务（T3）同 commit 落地全网；T15 复验 |

### 开放问题（T1 钉测清单——逐 Q 独立交付，阻断项标 ⚠️）

| # | 问题 | 关闭判据 | 状态（2026-10-09 全闭环，证据 `.omo/evidence/p5t1/`） |
|---|---|---|---|
| Q-1 | OMO team 面全枚举（v4.19.4 tag 只读） | 12 个 `team_*` 工具名/参数/语义、member-validator 逐条规则、生命周期五步逐字、mailbox 预约语义、`team_mode.*` 11 配置字段、team.md 全文、关停握手协议——覆盖基线 §1/§2 从草案转实测 | ✅（Q1a/Q1b；`describePlanError` 证无、等价物三处；12 工具属 omo-opencode 面；team.md=615B 真协议在 skill 模板） |
| Q-2 ⚠️ | `ctx.agentTeams` 在本仓组合的激活 | 真实沙箱 boot：挂载后服务在场、组队成功、`team/message/*` 事件落 v4 日志；持久化前提逐字确认 | ✅ **5/5 PASS**（R-4 解除；fork 转向原因不在此） |
| Q-3 ⚠️ | per-member 路由通道 | provider 适配器钉测：`registerProvider` 包装 spawn（注入 agentOptions/persona/toolFilter + capabilities 声明）→ `spawnTeammate` 按成员指定 provider → 成员 descriptor 带名册路由值。不通即 fork (B) | ✅ **不通（结构性三重封死链）→ fork (B)**；对照组实证 raw 通道全承载（(B) 路基绿） |
| Q-4 | 工具遮蔽与组合行裁定 | 既有场景对 `send_message`/`list_agents`/`interrupt_agent` 的消费盘点；禁用 vs 共存裁定；team 工具是否按角色分发（成员无 `spawn_teammate`）逐字确认；组合行落点（concerto 模板 vs 根 overlay） | ✅（零调用/零在场断言 + 三类名称级消费；9 工具 lead/teammate 同面、lead-only 执行期强制——「成员结构性无 spawn_teammate」推翻；fork (B) 不挂 bundle，遮蔽裁定与落点裁定失对象） |
| Q-5 | 语义缝隙终态表 | 搬运清单重筛终态（fallback-wake/复活 TTL/member-task 逐条「原生覆盖/记差异」）；category 释义收窄；orchestrator 席入队裁定；广播差异；关停握手移植/差异裁定 | ✅（§4.4 表已按 (B) 终态；资格矩阵终态 = atlas/multimodal-looker 拒入收紧、v1 可入队 = hephaestus+sisyphus-junior；唤醒金丝雀 = Q-5b） |
| Q-6 | 深度与 jobs 边界 | 成员深度 = 1 时 host `subagent.maxDepth` 默认 1 的约束（成员能否再委派 = 裁定，上游 = 引导不委派而非闸）；team 成员不在 jobs 面的事实对 background-notification / stop-continuation 级联的影响 | ✅（成员无委派工具 = **结构性不派生**（非 maxDepth 闸）；成员不进 jobs——background-notification 失明记差异；stop-continuation 扩展接缝 = continuable drain 族） |
| Q-7 | 可视化面钉测 | `team/message/*` 事件是否进会话 event 流；`subagentchat` 面板对成员会话的可达性；原生 TeamAction 在本仓 web profile 的挂载形态；`ConversationNodeDefinition` 兜底是否必要 | ✅（(B) 形态：subagentchat 天然达成员会话 + 'agent-message' 唤醒轮可见；中途 steer 隐藏记差异；T11 触发与否 T10 复核） |
| Q-8 | source kind 清单 | omo-team 侧全部注入点枚举（关键词指令/引导前缀/握手帧）→ 各自专属 kind 名；原生 `team-message` 不重复注册的核对 | ✅（四自有 kind：`omo-team-keyword`/`omo-team-briefing`/`omo-team-shutdown`/`omo-team-broadcast`；v4 准入只拒 'plugin'；约束 6 收窄裁定——见 §2 约束 6 修订注） |

## 7. 工作包与估算

按 ROADMAP §7 的定性惯例（无 buffer、非承诺，R3），仅给工作量级：

| 工作包 | 内容 | 任务 | 量级 |
|---|---|---|---|
| **WP-0 调研钉测** | Q-1…Q-8（逐 Q 独立交付）+ fork 裁定 + 覆盖基线转实测 | P5-T1 | ~1.5 天 |
| **WP-1 插件骨架** | omo-team 包 + manifest + 第四插行 + boot marker + 同步网 3→4 | P5-T2 … P5-T3 | ~1 天 |
| **WP-2 组建与成员** | member-validator + inline spec + spawn 通道（(A′) provider 适配器 / (B) startContinuable）+ 嵌套拒绝 | P5-T4 … P5-T5 | ~1.5 天 |
| **WP-3 协调语义** | mailbox 采用接线 + 工具层（广播差异/关停握手）+ source kind | P5-T6 … P5-T7 | ~1.5 天 |
| **WP-4 任务板与生命周期** | 任务板映射 + claim + 拆除无孤儿 + stop-continuation team | P5-T8 … P5-T9 | ~1 天 |
| **WP-5 可视化** | 原生面板采用 + L1 断言 +（条件）ChatNode 兜底 | P5-T10 … P5-T11 | ~1 天 |
| **WP-6 关键词与接盘** | TEAM_PATTERN 接线 + team.md vendor + hyperplan/remove-ai-slops 升级 | P5-T12 … P5-T13 | ~1 天 |
| **WP-7 门与 e2e** | team 场景群 + 门扩展 + probe/proofs | P5-T14 | ~1.5 天 |
| **WP-8 收口** | vendor 合规复核 + 文档双语 + 退出标准核对 + L2 + ROADMAP 回馈 | P5-T15 … P5-T16 | ~1 天 |

**合计 ≈ 11 人日**（T1 实测后按 DoD-d 修正；fork (B) 触发则 +3 天 vendor/状态机成本）。与可行性报告 §2.10「Team Mode 移植 3 周」的对账：v5 调查已判下调，本计划再下调的依据 = 原生 team 面吸收了 mailbox/任务板/拆除/可视化四大块（§1.1）——**下调的全部依据都押在 fork (A′) 成立上，这正是 Q-2/Q-3 标阻断的原因**。

## 8. 交付物清单

| 交付物 | 路径 | 类型 |
|---|---|---|
| omo-team 插件 | `patches/omo-dsh/omo-team/`（package.json / tsconfig.* / `src/index.ts` / `src/manifest.ts` / `src/{tools,team,…}`） | 代码 |
| 挂载 | 根 `cordis.yml` 第四 `- insert:` 行 + 同步网全点位 | 配置 |
| 组合改动 | **T1 裁定：零改动**（fork (B) 不挂 bundle，concerto 模板 12 行序列/静态门/census 全部不动；Q-4 落点裁定失对象关闭） | 配置 |
| 内容 vendor | `patches/omo-dsh/vendor/` 新增 team.md 等（manifest/NOTICE/deviations 全套） | 内容 |
| 测试 | `tests/omo-team/`（单测）· `tests/e2e/` team 场景群 | 测试 |
| 门扩展 | doctor-lite / verify-concerto-static（c 组 + c14 裁定）/ probe / proofs | 配置 |
| 覆盖基线 | [`phase5-team.md`](./phase5-team.md)（全条目终态 + 理由） | 文档 |
| 合规 | `THIRD_PARTY_NOTICES.md` Phase 5 小节 + 逐文件署名头 | 合规 |
| 决策与回馈 | **fork 已裁 (B)（2026-10-09）→ D18 登记（不采用 experimental team 面，双语）** + ROADMAP Phase 5「设计依据」措辞修订（双语）；CHANGELOG；README 状态行 | 文档 |
| 证据 | `.omo/evidence/p5t1/`（Q 组）· `.omo/evidence/p5-l2-*.md`（真机） | 证据 |
| **本计划目录** | `docs/plans/phase5-dev/phase5-plan.md`（本文）· [`phase5-tasks.md`](./phase5-tasks.md) · [`phase5-team.md`](./phase5-team.md) | 文档 |

## 9. 与前后阶段的关系

- **对 Phase 2/3/4 的回馈**：名册 `class` 字段消费（Phase 2 登记的成员资格输入）落地；Phase 3 deferred 八项（S-07…S-12/S-39/S-43）逐条裁定终态进覆盖基线；Phase 4 三个 handoff（team 关键词、hyperplan 完整形态、remove-ai-slops addendum、stop-continuation team 语义）在本阶段闭环。
- **对 ROADMAP 的回馈**：Phase 5「设计依据」行的 `ctx.subagents + ctx.jobs 一一对应」表述写于 experimental 面发现之前——**T1 fork 裁定已落地（2026-10-09，fork = (B)）**：该行修订与 **D18（不采用 experimental team 面）登记**随 T2/T3 首个落地 commit 同发（双语）。
- **Phase 6/7**：team 成员若携 LSP/编辑能力（hephaestus 席位），Phase 6 的编辑模型决策会影响成员工具面；发布节奏（Phase 7）的矩阵行含 team 面。
- **对 dsh 复核报告的回馈**：experimental team 面不在 0.2.0-rc.2 复核报告范围内（当时与本项目无触点）——本阶段钉测中发现的契约事实（Q-2/Q-3/Q-7），以「实施期订正」节补入复核报告（双语），沿用 Phase 4.5 §9 的研究产物随实施证据更新纪律。
