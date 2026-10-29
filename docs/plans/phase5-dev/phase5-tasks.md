# Phase 5 任务清单

> **上游依据**：[开发计划书](./phase5-plan.md) · [team 面清单与覆盖基线](./phase5-team.md) · [ROADMAP Phase 5](../../roadmap_zh-CN.md) · [决策 D14／D17](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 5 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，覆盖基线给出"每条 team 面的处置"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：✅ **22/22 全部收口**（2026-10-29 增补 T22 = 第五轮 delta 自查残余；2026-10-29 增补 T21 = PR #17 第五轮评审修复轮；2026-10-29 增补 T20 = PR #17 第四轮评审修复轮；2026-10-29 增补 T19 = PR #17 第三轮评审修复轮；2026-10-29 增补 T18 = PR #17 第二轮评审修复轮；2026-10-28 增补 T17 = PR #17 评审修复轮；2026-10-12：T1–T16 全部完成（T11 仲裁终裁不触发——条件任务，不算未完成）；退出标准 a/b/c + DoD c/d/e 全 ✅（见文末核对表）；fork = (B)（`.omo/evidence/p5t1/FORK.md`）；ci-local 8/8 全绿（`.omo/evidence/p5t15/ci-local.log`））。`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）· ~~删除线~~ = 仲裁取消。
>
> **编号**：`P5-T<n>`（Phase 5 - Task n）。工作包归属见计划书 §7。
>
> **任务书头部规则**（沿用 Phase 4.5 纪律）：每个适配/移植任务的证据栏 = **受影响门 + 场景级记录**；fork 敏感任务（标 ⚖️）必须先把 fork 依据写进证据再动手。

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1 | installed dsh = pin 的 0.2.0-rc.2 | `dsh --version`；doctor-lite 基线 PASS | ✅（2026-10-09 仲裁复核：`dsh --version` = `0.2.0-rc.2`；门 4 doctor-lite 随基线 PASS） |
| PRE-2 | 基线绿：`scripts/ci-local.sh` 8 门全绿 | 退出 0；记录基线（门 2 测试数、门 3 场景数、门 5 `checked`、门 6 断言数、门 8 proofs 数） | ✅（2026-10-09，日志 `.omo/evidence/p5-baseline.log`，EXIT=0。基线：门 2 = **59 文件 / 1567 测试**；门 3 = **34/34 场景**；门 5 = **checked=56** violations=0；门 6 = **33/33**；门 8 = **7/7 proofs**） |
| PRE-3 | 本地 OMO 检出只读可用 | `git -C ~/GithubRepo/oh-my-openagent rev-parse v4.19.4^{commit}` = `b072d279110bdda2c6ac2525d0d24dc54d16148a`；全程只用 `git show/ls-tree`，工作树不动 | ✅（2026-10-09：commit 逐字相符；T1 调查员全程只读，工作树未动） |
| PRE-4 | experimental team 四包在实装 dsh 树内 | `ls $DSH \| grep experimental-agent-team` 四包齐（`dsh-experimental-agent-team` / `-tool-` / `-client-ui-` / `-profile`） | ✅（2026-10-09 仲裁复核：`dsh-experimental-agent-team` / `dsh-experimental-tool-agent-team` / `dsh-experimental-client-ui-agent-team` / `dsh-experimental-agent-team-profile` 四包齐） |
| PRE-5 | Phase 4 handoff 面在位 | `keyword-detector/constants.ts` 的 `TEAM_PATTERN` 预留位仍在；hyperplan/remove-ai-slops 模板的 team 降级段可定位 | ✅（2026-10-09：`patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/constants.ts:64` `TEAM_PATTERN` 在位；`omo-commands/src/commands/hyperplan.ts:55,111` DEGRADED 段与 `remove-ai-slops.ts` 可定位） |

---

## WP-0 调研钉测（计划书 §4.1/§6，Q-1…Q-8）

### [x] P5-T1 — team 面全对账 + 原生钉测 + fork 裁定 ⚖️

> **进度（2026-10-09 仲裁）**：Q-1…Q-8 全闭环（证据 `.omo/evidence/p5t1/`：Q1a/Q1b/Q2/Q3/Q4/Q6/Q7/Q8 + Q5b 金丝雀 + ARBITRATION.md 亲核记录）；**fork = (B)**（`FORK.md`）；覆盖基线 §1/§2/§4/§5 已转实测终态；计划书 §4 已按实测更正（第 3 轮修订记录）。**双评审通过**：评审 A（opencode `opencode-go/step-5-preview-free`）+ 评审 B（mcode）两轮均 APPROVE（轮 1 各 2 MAJOR 收敛 + MINOR/NIT，仲裁后修复；delta 再审双 APPROVE，余 6 项措辞级 findings 已修复并由仲裁独立确认）；2 条评审 NIT/NOTES 经证据驳回（Config 行号 :1688-1694 精确、D18 重开锚已在），仲裁记录 = `ARBITRATION.md`。**（评审注：下述「做法」清单中的 spawnTeammate/agentTeams/Q-3 适配器等字样 = 已执行钉测的历史记录，非执行面；执行面 = fork (B)，以 FORK.md 与计划书第 3 轮修订为准。）**

- **产出**：回填后的 [覆盖基线](./phase5-team.md)（§1 工具对账 / §2 deferred 处置 / §5 待核清单全部转实测）；**fork 裁定书**（(A′)/(B) + 依据，进 `.omo/evidence/p5t1/FORK.md`）；计划书 §4 按实测更正（DoD-d）；fork = (A′) 时起草 **D18 登记文**与 ROADMAP Phase 5 措辞修订（随 T2/T3 首个落地 commit 同发）。**【仲裁注 2026-10-09：fork = (B)，D18 = 不采用 experimental team 面登记 + ROADMAP 修订，**随 T3 挂载 commit 同发**（T2 骨架不含语义落地，首个落地 commit = T3；草稿 `.omo/evidence/p5t1/D18-ROADMAP-DRAFT.md`）】**
- **做法**（逐 Q 独立交付，哪个先闭环先写证据；Q-2/Q-3 为阻断项）：
  1. **Q-1 上游对账**（全程 `git show/ls-tree` 只读）：12 个 `team_*` 工具逐一枚举（名/参数/语义/lead-member 权限）；`senpi-task/src/team/{normalize,member-validator,spawn-members,member-revival}.ts` 与 `team-core` 的 registry/tasklist/state-store/mailbox 逐文件语义；生命周期五步；mailbox `.delivering-` 预约与 TTL 回收；`team_mode.*` 11 配置字段；`prompts-core/prompts/mode/team.md` 全文；关停握手 request/approve/reject 协议；`describePlanError` 文案语义。
  2. **Q-2 激活钉测**：沙箱 profile 挂载 `dsh-experimental-agent-team` 三行（照搬 profile bundle 形状）→ 真实 boot → `ctx.agentTeams` 在场 marker、`spawn_teammate` 最小组队、`team/message/queued→delivered` 事件对落 v4 日志；持久化前提逐字确认。
  3. **Q-3 路由通道钉测**：`ctx.subagents.registerProvider` 包装 `spawn`（注入名册席的 agentOptions/persona/toolFilter + capabilities 声明）→ `spawnTeammate` 的 `provider` 字段逐成员解析 → 成员 `subagent/descriptor` 事件的 `agentProvider`/`agentModel`/`persona` 断言 = 名册值。**不通即 fork (B) 的第一条证据**，不试第二条路就直接裁 (B) 是违规。
  4. **Q-4 遮蔽盘点**：grep 既有 e2e/probe 对 `send_message`/`list_agents`/`interrupt_agent` 三名的消费（预期零）；team 工具按角色分发的逐字确认（成员是否结构性无 `spawn_teammate`）；组合行落点裁定（concerto 模板 vs 根 overlay）。
  5. **Q-5 缝隙终态表**：搬运清单三条逐条判「原生覆盖/记差异/移植」；category 释义收窄终态；orchestrator 席（atlas）入队裁定；广播差异成文；关停握手移植/差异裁定。
  6. **Q-6 深度与 jobs 边界**：成员深度语义实跑（host `subagent.maxDepth` 默认 1 下成员能否再委派——裁定对齐上游「引导不委派」）；team 成员不进 jobs 面对 background-notification/stop-continuation 的影响清单。
  7. **Q-7 可视化钉测**：`team/message/*` 进会话 event 流的实证；`subagentchat` 面板达成员会话；原生 TeamAction 在 web profile 的挂载形态；`ConversationNodeDefinition` 兜底必要性裁定。
  8. **Q-8 source kind 清单**：omo-team 全部注入点 → `omo-team-*` kind 命名表；原生 `team-message` 不重名核对。
- **判定**：✅ Q-1…Q-8 各有逐字引用结论；fork 裁定书含 (A′)/(B) 双向证据；覆盖基线全条目终态；计划书修订记录成文。
- **证据**：✅ 2026-10-09——`.omo/evidence/p5t1/`（`Q1a-tools-lifecycle.md` / `Q1b-teamcore-teammd.md` / `q2/Q2-activation.md`（5/5 PASS）/ `q3/Q3-provider-adapter.md`（三重封死链 + 对照组绿）/ `Q4-tool-shadowing.md` / `Q6-depth-jobs.md` / `Q7-visualization.md` / `Q8-source-kinds.md` / `q5b/Q5b-wake-canary.md`（PIN-OK 25/25）/ **`FORK.md`（fork = (B)）** / `ARBITRATION.md`（亲核与评审仲裁记录）/ `D18-ROADMAP-DRAFT.md`（随 T2/T3 首 commit 同发）/ 双评审输出 `review-A|opencode|B|mcode*.out`）；基线日志 `.omo/evidence/p5-baseline.log`（8 门绿：门2=59f/1567t、门3=34/34、门5=checked 56、门6=33/33、门8=7/7）。
- **依赖**：PRE-1…PRE-5。**量级**：1.5 天。

---

## WP-1 插件骨架（计划书 §4.2）

### [x] P5-T2 — `omo-team` 包骨架 + `manifest.ts` 单一事实源

- **产出**：`patches/omo-dsh/omo-team/`（`package.json` `@oh-my-opendsh/omo-team` / `tsconfig.host.json`（client face 视 Q-7 裁定补 `tsconfig.client.json`）/ `src/index.ts` 空 apply / `src/manifest.ts`）。
- **做法**：布局镜像 omo-commands（host-only、Node 24 type-stripping、`.ts` 扩展 load-bearing 注释）；manifest 条目 = T1 后的移植/采用清单（形状：id / 上游源路径 / 原生面对应 / 处置枚举（`native-adopt`/`ported`/`content-vendor`/`recorded-difference`——T1 第 3 轮修订后四值，计划书 §4.2 口径）/ e2e 场景名（canonical 七名 = T1 仲裁定名：team-create-and-message / team-nested-create-denied / team-teardown-no-orphans / **team-shutdown-handshake** / **team-task-claim**（后两者本条与 T7/T8 同注册）/ team-keyword-mode / stop-continuation-team）/ 状态）；派生函数供 boot marker 与一致性测试。
- **判定**：✅ `pnpm typecheck` 绿；manifest 形状单测（空字段 throw、id 唯一、处置枚举合法）；typecheck 链扩展。
- **证据**：✅ 2026-10-09——`patches/omo-dsh/omo-team/`（package.json 11 行 / tsconfig.host.json 54 行 / src/index.ts 106 行 / src/manifest.ts ~740 行 24 行条目 + validateManifest 12 检查 + 派生函数族）+ `tests/omo-team/manifest.test.ts`（45 用例，变异敏感，含 vendor 行无测试夹具负钉）+ 根 `package.json`（`typecheck:team` + 接入 `typecheck:libs`）+ `pnpm-lock.yaml`（workspace 机械登记）。实测：typecheck/typecheck:team/typecheck:libs 全绿；`tests/omo-team/` 45/45；全量 vitest 60f/1612t；verify-concerto-static 33/33；check-docs-consistency 10/10；**verify-licenses checked=57 violations=0（56→57 跃迁随本任务发生，T3 复核不变即可）**。**双评审通过**：轮 1 双 REJECT（闭包三缺口——session-client 缺失 / reservation-reconciliation 带 mailbox 运行时依赖 / zod 未登记——双通道收敛，仲裁 32 文件 import 全分析后文档先行更正 + 编码者修复）；轮 2 双 APPROVE（残留 4 项注释级 + 1 测试负钉，修复后仲裁独立确认）；2 条 findings 经证据驳回（mcode「§1 行 10」误读；opencode 首议的 D18 时点经统一为「随 T3 同发」非驳回但成文）。编码 NOTES 5 项全部经仲裁采纳（status 三值词表 / licenses 提前跃迁 / pnpm-lock 保留 / 单字段 e2eScenario / §3「升级」→ ported）。
- **依赖**：P5-T1。**量级**：3 小时。

### [x] P5-T3 — 挂载（第四插行）+ boot marker + 同步网 3→4

- **产出**：根 `cordis.yml` 第四个 `- insert:` 行（`id: omo-team`）；apply 注册循环骨架 + boot marker（`[omo-team] loaded: …` 汇总行自 manifest 派生）；**同步网同 commit 全点位**：doctor-lite `EXPECTED_INSERT_ROW_IDS`（3→4）、`tests/omo-hooks/cordis-inserts.test.ts`、cold-start、drive.mjs、probe、smoke-real、cordis.yml 头注释计数；`verify-licenses` checked 预期登记（**注意：56→57 的跃迁已在 T2 随 omo-team 包落位发生——本任务复核 checked=57 不变、violations=0 即可，勿误判为漂移**；D18/ROADMAP 回馈文稿随本任务同 commit——首个落地 commit = 本任务，T1 已起草 `.omo/evidence/p5t1/D18-ROADMAP-DRAFT.md`）。
- **做法**：P-8 schema 纪律；loud-but-non-fatal；注册表占位形态 = 空表 + 汇总行计数派生（P3-T3/P4-T3 先例）；D18/ROADMAP 回馈文稿若 T1 已起草，随本任务或首个语义任务同 commit。
- **判定**：✅ cold-start 绿且日志含 omo-team marker；门 4/8 绿；`--dump-config` 含第四行；门 6/7 不回归。
- **证据**：✅ 2026-10-09——`cordis.yml` 第四插行 + COUNT COUPLING NET 3→4 头注；`patches/omo-dsh/omo-team/src/{index.ts（TEAM_REGISTRARS 空表 + runTeamRegistrations：validate→loop→summary-last，loud-but-non-fatal）, boot-markers.ts（manifest 半场透传 + 注册半场拼接）}`；`tests/omo-team/boot-markers.test.ts` 19 用例；同步网 7 点位同 commit（doctor-lite-core.ts、cordis-inserts.test.ts、cold-start.sh、drive.mjs、concerto-mode-probe.sh、smoke-real.mjs、cordis.yml 头注）。实测：cold-start PASS 且日志逐字 `[omo-team] loaded: manifest 24 entries (pending=22, ported=0, recorded=2) — 0/24 team surfaces registered`；**门 3 drive.mjs 34/34 绿**；门 4 doctor 5/5（cordis-plugins = 4 rows mount order）；门 5 `checked=57 violations=0`（57 不变，未误判）；门 6 33/33；门 7 10/10；门 8 proofs 7/7；`--dump-config` :1267 含第四行；全量 vitest 61f/1631t。**双评审 APPROVE**（轮 1 即双 APPROVE，残留 6 项注释/prose 级 findings——静态门 c11/c15 计数 prose、probe PASS 汇总行补第四行证明、doctor-lite 头注、index.ts 病句/中英混排、drive.mjs marker 注释——修复轮落毕；仲裁者同批扫掉 decisions 双语「D1–D16」→「D1–D18」与 README 双语「14→18 decisions」陈旧计数）。**D18 双语登记（decisions.md/decisions_zh-CN.md）+ ROADMAP Phase 5 设计依据双语锚点（roadmap.md/roadmap_zh-CN.md）+ README 双语 Phase 5 状态行随本 commit 同发**。
- **依赖**：P5-T2。**量级**：3 小时。

---

## WP-2 组建与成员模型（计划书 §4.3）

### [x] P5-T4 — member-validator + inline spec 解析 ⚖️

> **仲裁注（manifest 状态翻动规则，2026-10-09；T5  refined 2026-10-10）**：manifest 行 `pending → ported` 的翻动时点 = **该行自身语义落地且其 e2e 覆盖转绿**（注册循环只挂载 `ported` 行——翻动是挂载前提而非事后标记；共享场景名的另一半归属对应行，如 team-create-and-message 的消息半段归 team_send_message 行、T6 翻动）。`recorded-difference` 行自 T2 已为 `recorded`（差异在覆盖基线成文即闭环）。翻动与语义落地同 commit。（T5 编码者按旧注「归 T6」与本注义务的冲突提出质疑——注册循环只注册 ported 行、不翻则工具永不挂载——经仲裁采纳并按本 refined 规则追认 T5 翻动；纪律提醒：manifest 是禁改面，正确流程 = NOTES 先行、仲裁同 commit 追认，本次已破例一次，下不为例。）
> **仲裁注 2**：本条产出中的「manifest 条目填入」= 已由 T2 manifest 行覆盖（行粒度 = 上游路径 + 处置，不逐登记本仓产物文件名），无需新增条目（评审疑问澄清）；后续条目同此理解。

- **产出**：`src/team/member-validator.ts` + `src/team/team-spec.ts`（纯函数）+ 单测；manifest 条目填入。
- **做法**：资格规则以 roster `class` 为**主输入 + seat id 兜底**（`AgentClass` 四值 = `'read-only'|'worker'|'orchestrator'|'allowlist'`，**无 `conductor`**，`roster.ts:51`；read-only 六席拒入；**atlas（orchestrator）与 multimodal-looker（allowlist）= T1 Q-5 终态均拒**（atlas = 有意收紧：Q-6 实证成员工具面无委派通道、orchestrator 职责在 team 内结构性不可行；multimodal-looker = v4 hard-reject 在册收紧——覆盖基线 §4 已终态）；**sisyphus 无 `class` 字段**（route-only 行，`roster.ts:110-120`），按 seat id 结构性排除）；`UNRESOLVABLE_CATEGORY` 与可用项清单文案（上游可用清单语义——**T1 Q-1 实证 `describePlanError` 在 v4.19.4 不存在**，等价物 = `execute.ts:69-81` 内联 suffix / `execute-batch.ts:95-105` / member-validator 文案，语义对齐，署名头注 `member-validator.ts` 上游路径）；inline spec `{name, members:[{name, category|seat, prompt?}]}` 解析与上游对齐、收窄处（category 释义、无 subagent_type）按 Q-5 终态表实现并记差异。
- **判定**：✅ 资格矩阵全组合单测（**11 席** × 允许/拒绝——含无 class 的 sisyphus 与 allowlist 席的 multimodal-looker，矩阵缺一席即红）；`UNRESOLVABLE_CATEGORY` 文案含可用清单；收窄差异进覆盖基线。
- **证据**：✅ 2026-10-10——`src/team/member-validator.ts`（11 席终态矩阵：允许 {hephaestus, sisyphus-junior}；category 别名 v1 {quick→sisyphus-junior, deep→hephaestus}，词表取自上游 openai-categories.ts；UNRESOLVABLE_CATEGORY 双可用清单排序拼接；subagent_type 具名差异；署名头三上游源）+ `src/team/team-spec.ts`（object/JSON string 双臂、members 1..8、DUPLICATE_MEMBER_NAME、category|seat 恰好其一、v1 不收字段逐枚具名 + closed shape；max-8 文案逐字复用已披露）+ `tests/omo-team/{member-validator,team-spec}.test.ts`（73 用例：11 席全组合逐席硬编码 + toHaveLength 双保险 + roster 行序逐位置对账 + ALL_AGENT_IDS 集合相等 + spec 级五枚逐枚独立 its + 19 错误码逐码钉）。实测：`tests/omo-team/` 137/137；全量 vitest 63f/1704t；typecheck 三链绿；门 6/7 不回归；缺一席即红双变异自证。**双评审 APPROVE**（A 首跑中段停摆无 verdict → 重试后 APPROVE；B APPROVE；findings：prompt 政策第三码 `category-missing-prompt` 补登、校验序注释收敛、max-8 文案披露、spec 级五枚拆分、行序对账补测、行号偏移两枚、manifest member-parser 行 prose 更正——修复轮 8 项落毕；仲裁确认「状态翻动规则注」为仲裁者亲笔；覆盖基线 §1 team_create 行收窄成文 + §4 实现面注 + 计划书 §4.3「名册可委派席」收紧为「名册 worker 席」同 commit）。
- **依赖**：P5-T1。**量级**：4 小时。

### [x] P5-T5 — `team_create` 组建路径 + per-member 路由 ⚖️

- **产出**：`src/tools/team-create.ts`（**fork 已裁 (B)（2026-10-09，FORK.md）：`startContinuable` 直驱 + team 状态机骨架**——~~(A′) = `ctx.agentTeams.spawnTeammate` 逐成员 + provider 适配器~~ Q-3 三重封死链证伪）+ 成员引导（**T1 Q-8 形态裁定写死：成员会话独立注入消息**（hard-blocks-injection 形态，`origin === 'subagent'` 门 + `form:'instructions'`），专属 source kind `omo-team-briefing`，**禁止并入 spawn prompt 正文**——原生 stamp `'user'` 会静默丢专属 kind）+ 单测 + e2e `team-create-and-message` 的组队半段。
- **做法**：引导 = 成员角色/姓名/「不再派生子女」纪律（上游 member guidance 语义移植——omo-opencode 45 行版与 senpi 5 行版均已逐字入档 Q1b §6，择语义对齐）；路由断言面 = 成员 descriptor v3 的 `agentProvider`/`agentModel`/`persona`/`toolFilter`（**(B) 由 startContinuable request 三件套直驱，Q-3 对照组实证逐字承载**）；**嵌套拒绝**：成员工具面结构性无 `team_create` + 服务强制具名拒绝（对齐上游 `TEAM_LEAD_REQUIRED` 语义族——T1 Q-4 实证原生面即「同面 + 执行期具名拒绝」形态），e2e `team-nested-create-denied` 断言具名拒绝。
- **判定**：✅ 门 2/门 3 绿；成员 descriptor 断言名册路由值；嵌套拒绝场景绿且**反向金丝雀**（成员尝试组建不产生任何子会话——`listDescendants` 前后一致）。
- **证据**：✅ 2026-10-10——`src/team/team-state.ts`（纯内存状态机骨架，全形镜像上游 RuntimeStateSchema，三索引，ALLOWED 转移合法性，T8 vendored 持久化接缝注；strip-only 无参数属性约束）+ `src/team/roster-seats.ts`（席位三件套声明表，persona 内嵌文本与 personaFile 逐字节对账）+ `src/tools/team-create.ts`（parse→validator→嵌套闸→creating→逐成员 startContinuable→active；首败回滚先翻 failed 再 interrupt/drain；briefing 独立注入 kind 'omo-team-briefing'；宿主预留身份违约响亮）+ `src/index.ts`（agent/created 角色分发：根会话 lead 面 / team 子女成员面结构性无 team_create / 其他子女不装）+ 单测 55→58 例 + **e2e 双场景**：`team-create-and-message`（22 断言：descriptor 四字段逐席值、briefing 帧 1+1 且 kind:'user' 帧零泄漏反例、两成员 lane 真实到 mock、无孙代）+ `team-nested-create-denied`（12 断言：lead 二次 = participant 具名 / 成员 = unknown tool 结构缺席 / lead 恰 2 子女）。实测：**门 3 drive.mjs 36/36（仲裁者独立复跑 EXIT 0）**；vitest 66f/1762t；typecheck 三链绿；cold-start marker `[omo-team] loaded: manifest 24 entries (pending=21, ported=1, recorded=2) — 1/24 team surfaces registered`；门 4/5/6/7/8 不回归。**双评审 APPROVE**（B 直过 + A 亲跑 ci-local 8 门复核后 APPROVE；修复轮 6 项：宿主违约分支补测/名不副实测试重写为成员臂直达/deny 排序全等/成员面状态闸+warn 日志/对称断言/drain 空闸前置；manifest 翻行 pending→ported 经 refined 翻动规则追认）。**执行面约束登记**：Node 24 type-stripping strip-only 模式不支持参数属性（`constructor(readonly x)`）——omo-team 全包禁用该写法（T5 NOTES-6）。
- **依赖**：P5-T4（**(B) 另依赖 T1 Q-3 对照组已证的 raw 通道三件套承载**）。**量级**：1 天。

---

## WP-3 协调语义（计划书 §4.4）

### [x] P5-T6 — mailbox 采用接线 + 消息工具层 ⚖️

- **产出**：`src/tools/team-message.ts`（`team_send` 语义 → **(B) 已定：原生 `ctx.subagents.sendMessage` 相邻投递——lead↔member 直通；member↔member 非相邻，经 lead 中转并记差异**）+ 广播「仅 lead」工具层纪律（Q-5 已成文）；重投去重 e2e 断言（R-6）。
- **做法**：消息帧格式对齐上游（`Team message <id> from <name>:` 帧语义——**经原生投递的载体承原生 kind `'agent-message'`，omo 自有帧才用 `omo-team-*`**，T1 Q-8 裁定）；离线成员投递 → 醒来的金丝雀断言（fallback-wake 原生覆盖的承重场景，Q-5 终态：原生投递统一经 inbox 准入、无 live-fallback 岔路——Q-5b 实证 warm 唤醒，cold 恢复本任务 e2e 断言）；不移植 `.delivering-` 预约语义，差异成文。
- **判定**：✅ `team-create-and-message` 全段绿（双向消息 + 投递事件对 + 同 id 重投去重断言 + 离线唤醒断言）。
- **证据**：✅ 2026-10-10——`src/tools/team-message.ts`（相邻投递 lead↔member 直通；member↔member 经 lead 中转帧注 `(relayed via lead)`，活 lead 判别式联合随 target 复用无竞态；广播仅 lead 具名拒「broadcast requires lead role」；R-6 去重账先记后投 reservation 语义——单投失败补偿退账、广播部分失败不退（宁漏不重）+ 错误文本携已投计数；帧格式 `Team message <id> from <name>:`；载体承原生 'agent-message' kind 不改写；payload 32KB 具名上限、maxMessagesPerRun v1 不执法记差异）+ `team-state.ts`（processedMessageIds 台账三方法 + TEAM_MESSAGE_DELIVERABLE_PHASES）+ 角色分发接线（成员面/lead 面同装）+ 单测 34 例 + **e2e `team-create-and-message` 全段**（43 检查：双向消息帧逐字 + 投递事件对跨进程同钟 + 同 id 重投恰一次 + 离线唤醒正反金丝雀 + 冻结窗收窄至恰 omo-team-briefing）+ mock-llm-server `{{teamRunId}}` 捕获（无源响亮 500）。实测：门 3 **36/36**（双评审各自独立复跑 EXIT 0）；vitest 67f/1800t；typecheck 三链；cold-start marker 2/24；门 4/5/6/7/8 不回归。**双评审通过**：轮 1 B REJECT（MAJOR「R-6 头注与实现矛盾」——头注写「受理后入账」实现是 reserve-first——+3 MINOR）/ A APPROVE（1 MINOR+3 NIT）；修复轮 8 项落毕；delta 再审双 APPROVE（残留 3 项 nit 级：reservation 消歧/先判后取/广播计数文案——修复后仲裁独立确认提交）。**manifest team_send_message 行翻 ported（refined 规则）**。遗留登记：briefing 重注入治理（T6 NOTES-7 实证）已归 T7 仲裁增补；relay/broadcast e2e 承重断言已归 T14 仲裁增补。
- **依赖**：P5-T5。**量级**：1 天。

### [x] P5-T7 — 关停握手与 `team_delete` 语义

> **仲裁注（team_status 归属，2026-10-10）**：任务书未给 `team_status` 派任务——规划缝隙，仲裁补位：**team_status 随本任务（T7）落地**（生命周期查询与握手/拆除同族；聚合面 = 状态骨架成员/状态/握手态，任务板段在 T8 vendored tasklist 到位后接线——T7 落地时 tasks 段为空并注释成文，T8 同 commit 补全）。
> **仲裁注 2（翻动规则 refined 读法追认，2026-10-10）**：team_delete 行的 canonical 场景 team-teardown-no-orphans 归 T9——本行在 T7 翻 ported 的读法 = 「拆除语义（interrupt+drain+迁移序+DELETABLE 门禁）在 T7 落地且 e2e team-shutdown-handshake 绿，T9 孤儿证据补其场景半边」；与 team_send_message 共享 team-create-and-message 同例，规则语义 = 行自身语义落地 + 有绿 e2e 覆盖。

- **产出**：`src/tools/team-shutdown.ts` + `src/tools/team-delete.ts`（**Q-5 已裁 = 语义移植**：lead 询问 → 成员批准/拒绝 → interrupt/drain；握手无自动超时与上游同构——超时语义由提示词承担 + closure invariant，Q1a §5.4 实证）；`team_delete` 的「活跃成员拒删，`force:true` 强删」语义（v5 调查报告 §2.1-4；orphaned/deleting 旁路由 (B) 状态机承接）。
- **做法**：**(B) 下 delete 底层 = 原生 `interrupt`（保 inbox）+ continuable drain/disposal 组合**；所有拆除走 §4.5 的断言面；握手状态机单测（request/approve/reject/超时四路——超时路 = 提示词语义的确定性部分 + 状态滞留可观测）。**【仲裁增补（T6 NOTES-7 实证，2026-10-10）**：briefing 重注入治理随本任务——冷启 wake 会重 materialize 成员 → `agent/created` 重放 → briefing 每物化重注一帧（T6 e2e 实测 `analystBriefingFrameCount:2`）；本任务把 briefing 改为**按 teamRunId+member 去重注入**（状态骨架记已注入账，重放跳过），并补单测 + e2e 断言（重唤醒后 briefing 帧数不增）。】
- **判定**：✅ 单测四路 + e2e 关停场景（**场景名 `team-shutdown-handshake`**——T1 仲裁 canonical 名表，本条与 T14 同注册）（成员拒 → team 存活；批准 → 成员 interrupt 且 inbox 保留断言）。
- **证据**：✅ 2026-10-10——`src/tools/team-shutdown.ts`（握手三工具：request lead-only 具名 + 幂等早退 + 投递失败退账不占幂等位；approve/reject = lead 或目标成员本人；无请求具名抛/已批同拒幂等/终态保留；第四路 lead 代批准；权限分层序在状态闸前）+ `src/tools/team-delete.ts`（DELETABLE 门禁点名活跃成员 + force 旁路（orphaned/deleting）+ 迁移序 active→deleting→deleted + 逐成员 interrupt（ancestor，保 inbox）+ 一把 drain + tombstone 留行）+ `src/tools/team-status.ts`（仲裁补位：聚合成员/握手投影/bounds/账本；tasks 段空 + T8 接缝注）+ briefing 去重治理（claimBriefingInjection + releaseBriefingInjection 退账臂，注入失败不占幂等位）+ 成员面增 approve/reject/status。**e2e `team-shutdown-handshake` 37 断言**：拒后存活多面/批准后 interrupt/inbox 保留**可证伪新锚**（delete 后经原生通道再投唯一金丝雀落成员日志——变异自证「恰新锚红、旧断言仍绿」双证）+ briefing 恰 1 帧硬断言 + deleted 后具名拒绑序。实测：门 3 **37/37**（仲裁者独立复跑 EXIT 0，verdict 归档 `.omo/evidence/p5t7/e2e-verdict.json`）；vitest 70f/1862t；typecheck 三链；cold-start marker 7/24（pending=15/ported=7/recorded=2）；门 4/5/6/7/8 不回归。**双评审通过**：轮 1 B REJECT（MAJOR 断言不可证伪 + 2 MINOR + 1 NIT）/ A APPROVE（1 MINOR + 3 NIT）→ 修复轮 8 项；delta 双 APPROVE → nit 微修 3 项（交叉注引行域/错误码名/时序门去 `?? 0` 兜底）仲裁独立确认。评审遗留已登记 T8（tasks 类型放宽/双账持久化携带/账键契约）与 T9（retireRunIndexes 成员/lead 不对称成文）。
- **依赖**：P5-T6。**量级**：4 小时。

---

## WP-4 任务板与生命周期（计划书 §4.5）

### [x] P5-T8a — vendor team-core 子集（playbook 全套）⚖️

> **仲裁注（T8 拆分，2026-10-10）**：T8 原条体量超出单任务评审面（vendor 合规 + 任务板接线 + 状态持久化换装三族），拆分为 T8a（vendor）→ T8b（接线+换装+e2e）。T8 原「产出/做法」两段的 vendor 闭包清单与语义纪律由两子条共同继承。

- **产出**：`patches/omo-dsh/vendor/team-core/`（playbook 全套：`VENDOR-MANIFEST.json`（逐文件 sha256 + origin + deviations[]）+ `NOTICE.md`（modified-copy 声明）+ `package.json`（license 字段，D15）+ src/ 树）+ 漂移检测/license 登记同 commit。
- **vendor 子集终态**（T2 双评审 32 文件 import 全分析）：**verbatim** = types.ts / member-parser.ts / config.ts / logger.ts / tolerant-fsync.ts / session-client.ts / team-registry 六件 / team-tasklist 七件（除 test-support.ts）/ team-state-store 十二件（除 reservation-reconciliation.ts）；**deviation** = team-state-store/active-resume.ts（删 `reconcileStaleReservationsForMember` 导入与 `reconcileMemberReservations` 调用/helper + 连删孤儿 `log` 导入——deviations[] 逐条登记）；**排除** = reservation-reconciliation.ts（`.delivering-` 预约回收不移植落点）；**不 vendor** = team-mailbox / team-layout-tmux / team-worktree（D4 + 范围护栏）。
- **外部依赖**：`zod ^4.4.3`（npm 依赖入 vendor 包 package.json，verify-licenses 白名单核对——非「移植 zod 校验器」）+ `@oh-my-opencode/utils` 的 isPlainRecord 一件（语义移植进闭包文件（如 `src/plain-record.ts`，署名头注上游 packages/utils 源路径，origin = 本项目新增/语义移植成文）或 vendor 原文件——二选一成文）。
- **合规钉**：上游测试文件若 vitest 兼容则随 vendor 携带并在 `pnpm vitest run` 跑绿（bun:test 则不携带 + 根 tsconfig 排除面不扩，D16 纪律）；**strip-only 合规实证**（vendored 件将被 omo-team 运行时 import（T8b），Node 24 type-stripping 不支持参数属性——逐文件 grep 证明无该写法或 deviation 改写并登记）；`THIRD_PARTY_NOTICES.md` Phase 5 小节新增（语义移植表先例格式）随本任务同 commit——注意该文件是合规面、由编码者按先例编辑（docs/plans 禁改面不含它）。
- **判定**：✅ vendor 漂移检测绿（`scripts/vendor-manifest.mjs` 族）；`verify-licenses` 绿且计数变化全对应（57→57+zod/team-core 包——实测登记）； vendored 测试（若携带）绿；typecheck 三链不回归。
- **证据**：✅ 2026-10-10——`patches/omo-dsh/vendor/team-core/` **47 件**（verbatim 7（逐字节 = 上游 blob，程序化全查）+ modified 37（active-resume 四点删节 + strip-only 参数属性改写 4 件 + exports 收窄 + package.json）+ 项目新增 3（plain-record.ts 语义移植 isPlainRecord / NOTICE.md / VENDOR-MANIFEST.json）+ 携带上游测试 10 件（bun:test→vitest alias）+ test-support 1 件）；playbook 全套（VENDOR-MANIFEST 47 files + 17 deviations + subset/counts 扩展 + NOTICE.md modified-copy + package.json license D15 + zod ^4.4.3 依赖）。实测：漂移门 `checked=367 violations=0`（team-core 自动发现）；`verify-licenses` **57→59**（+team-core SUL-1.0（D16 名门）+zod MIT，全对应）；vendored 测试 59/59（team-core）+137/137（vendor 域合计）；typecheck 三链不回归；全量 vitest 80f/1921t。**双评审通过**：轮 1 双 REJECT（收敛 MAJOR = tmux-core/utils 依赖删除未登记 + 「无其他变更」假话；opencode 另 MAJOR = member-parser/claim deviation 的测试证据不存在——插桩实证零构造）→ 修复轮 5 项（dependencies-narrowed 登记 + 假话尾句改实 + 证据改写为 tsc 位次等价 + strip-only 实跑构造验证 + NOTICE 计数 three→four + plain-record 措辞 + tsgo 脚本 note 登记）；delta 双 APPROVE（opencode FINDINGS none；mcode 1 NIT 措辞精确化——修复后仲裁独立确认）。**裁决注记**：test-support.ts 以测试辅助件携带（不计 31 件实现清单，FORK.md §3.3 已同步注记）；T8b 遗留 = 依赖边登记 + zod range 锁文件说明（见 T8b 判定行）。
- **依赖**：P5-T7。**量级**：半天。

### [x] P5-T8b — 任务板接线 + 状态持久化换装 + claim 协议

> **仲裁注（vendored import 墙裁定，2026-10-10）**：T8b 编码者按铁律 STOP 上报——vendored team-core 的 24 个非测试源文件含 **99 条无扩展名相对 specifier**（上游 bun 风格），dsh 宿主 = 裸 Node 24 原生 type-stripping**不做扩展名解析**（宿主级金标准探针 + 裸 node 复现 + 仲裁者独立复验 `Cannot find module …/claim`）；vitest 绿是 vite 解析器兜底，不构成反证。**裁定 = 路径 (A)：扩展名补全 = 语义零变更的登记式字节修改**——与 T8a strip-only 参数属性改写同族（宿主运行时兼容适配），vendored 树内全部相对 specifier 补 `.ts`（dir-form 补 `/index.ts`），逐文件 origin=modified + deviation 登记（双 sha 锚）+ **机械证明**（剥掉补的扩展名后字节 = 上游 blob）+ vendored 测试复跑绿。排除项维持（resolver hook = 实验面 monkey-patch；运行时改字节求值 = 执行字节≠受审字节）；路径 (B)（语义镜像绕行）**否决**——背离 vendor 保真 + 上游测试一致性两个初衷。证据档 `.omo/evidence/p5t1/t8b-vendor-import-wall/`。

- **产出**：`src/tools/team-task.ts`（**team_task_create/list/get/update 四工具薄壳接线 vendored team-tasklist**（T8a 落地件）；claim 路由 `status:"claimed"` → vendored `claimTask`）+ **状态骨架 → vendored team-state-store 持久化换装**（T5 接缝转正：state.json 落盘 + resume；**同 commit 携带 briefingInjectedMembers + processedMessageIds 双账**——T7 评审遗留②）+ `team_status` 的 tasks 段接线（`readonly []` 占位放宽为具名元素类型——T7 评审遗留①）+ claim 场景 e2e（**场景名 `team-task-claim`**——T1 仲裁 canonical 名表，本条与 T14 同注册）。
- **做法**：上游语义原样随 vendor（锁 + 锁内重读、缺依赖视为可领、无环检测、无 `ready`、**无 `failed` 态**——上游提示词三处与 schema 矛盾，DSH 侧不照抄 `failed` 文案、v1 不增设失败终态，记差异，Q1b N1/N2）；`writeScopeWarnings` 的工具描述文案对齐上游 tasklist 语义；**`tasks/claims/` 与 `.highwatermark` 随 vendor 件自然成立**（T1 更正：Q1b §C-4 实证其为瞬时锁目录 + ID 水位，原「不移植」草案作废，覆盖基线 §1 已回填）。**【T7 评审遗留登记（2026-10-10）**：① 见上（tasks 类型放宽）；② 见上（双账携带）；③ briefing 账键 = (run, memberName)——若出现「同名成员换新 sessionId 重开」路径，新会话须重新武装该账（契约成文）。】
- **判定**：✅ e2e：lead 建任务 → 成员 claim → `owner`/`claimedAt` 断言 + 依赖未就绪任务 `BlockedByError` 断言（注意：上游缺依赖视为可领，断言须按 vendored 语义钉）+ **持久化换装断言**（重启后 team 状态/任务板/双账可恢复——resume 路径）；门 2/3 绿。**【T8a 评审遗留（2026-10-10）**：① **依赖边登记**——vendored `@oh-my-opencode/team-core` 目前无任何 workspace 包声明依赖（pnpm 严格 node_modules 下子路径不可解析），本任务开工第一件事 = omo-team/package.json 增依赖边；② vendored 依赖 range（zod ^4.4.3 现解析 4.6.5）随本仓锁文件走的成文说明（本任务或 T15 收口补）。】
- **证据**：✅ 2026-10-10——**裁定执行面**：vendored 扩展名补全 34 文件/141 specifier（`git diff` 一补一删零语义行；机械证明 `prove-zero-semantic-change.mjs` C1 141/0 + C2 30/0 + C3 34/0 全绿，双评审独立复跑一致）；宿主金标准探针补全后 LOADED 绿；vendored 测试 59/59 复跑。**交付面**：依赖边登记（omo-team/package.json + `@oh-my-opencode/team-core` workspace:*——T8a 遗留①消解）+ `src/tools/team-task.ts` 四薄壳（claim 路由与上游 tasks.ts:128-130 同形；错误族冒泡）+ 持久化换装（team-state.ts 重写：vendored store + sidecar `omo-team-extensions.json` 双账携带 + TeamSessionContext 适配器（窄而诚实：不实现 session.messages——vendored 零消费）+ resume vendored 语义原样）+ `team_status` tasks 段真读（具名 TeamStatusTask）+ manifest 四行翻 ported（marker 11/24 同步网）。**e2e `team-task-claim` 17/17**：owner/claimedAt 断言 + BlockedByError 按 vendored 语义钉（缺依赖可领、存在未完成 blocker 才拒）+ 重启持久化（杀进程重启后磁盘重读：t1 completed/t2 claimed+blockedBy、state.json、双账；adopted lead 重放停滞的宿主行为如实成文——耐久锚落磁盘审计非真空）。实测：门 3 **38/38**；vitest 81f/1936t；root typecheck exit 0（T7 漏网回归 45 错已清零并亲验退出码）；门 4/5/6/7/8 不回归。**双评审 APPROVE**（B 独立复跑机械证明三判据 + 自写 strip 第二判据 141 对零失配；A 亲跑 38/38 + 宿主装载探针）；修复轮 6 项（toVendoredMember 死代码删除/标题翻正/双写窗口注/55 处 codemod 痕迹清扫/NOTES 执行口径卫生注/manifest 锁面措辞精确化）；mcode MINOR（双账 e2e 弱匹配）经其自书建议归 T14 加固（仲裁增补 2 成文）。
- **依赖**：P5-T8a + P5-T5。**量级**：1 天。

### [x] P5-T9 — 拆除无孤儿 + stop-continuation team 语义

- **产出**：e2e `team-teardown-no-orphans`（**孙代金丝雀 = 负向断言**——T1 Q-6 已裁：成员工具面无委派通道 = **结构性不派生**，断言 `listDescendants` 无 depth≥2 行；不再造孙代）+ `stop-continuation-guard` 消费面扩展（**(B) 形态 = continuable 子女树的 interrupt/drain 分支**（drainContinuableDescendants 族——成员与既有委派子女同族），与既有 jobs 级联并列；注意 guard 同步契约——Q-6 NOTES-7）。
- **做法**：断言面 = `listDescendants(leadSessionId)` 空 + vendored roster 状态清空 + **成员 interrupt/drain 证据**（`turn/end reason aborted(parent)` + drain settled——**更正 2026-10-10**：原文「`session/disposed` 对齐」是 (A′) disposal 语义残留；(B) 形态成员 = interrupt + drain（会话保留可冷恢复、inbox 保留），无 session/disposed 可断言）；guard 扩展保持既有降级 marker 可区分（Phase 4.5 金丝雀纪律）；**成员再委派 = Q-6 已裁结构性不可能**（9 工具名单无委派工具 + 成员工具面纪律双保险），反向断言钉死（**钉面必须含原生 `subagent`/`task` 工具名**——roster 十名的缺席是 toolFilter 构造性必然、不构成证据，评审 MAJOR 裁定）。
- **判定**：✅ 门 3 绿；guard 的 team 分支有独立 marker 与反向断言（未触达降级路径）。
- **证据**：✅ 2026-10-11——e2e `team-teardown-no-orphans`（24 检查：roster 闭合 tombstone + team_status 回读、成员 turn 关账 aborted(parent)、孙代负向金丝雀 = 探针真读 `listDescendants` 无活体成员行无 depth≥2、jobs 面探针真读无成员行）+ e2e `stop-continuation-team`（成员真停摆 aborted + 两族 marker 并存不混淆 + 降级反向断言）+ guard team 分支（`cascadeTeamMembers`：逐成员 interrupt ancestor + 一把 drain 只发起不 await + `teamDrain` 永不 reject + marker 互斥 token）+ omo-team 只读查询面 `team-stop-continuation.ts`（跨包零 import、cordis 服务名等值单测钉死）+ 单测 21 例（4 防御分支含抓出的真 bug：drain 同步抛 drainInitiated 冒报已修）。实测：门 3 **40/40**；vitest 83f/1958t；root typecheck exit 0 显式；门 4/5/6/7/8 不回归（licenses 59→60 = 探针包入册有对应）；cold-start 12/24。**双评审通过**：轮 1 B REJECT（3 MAJOR——catalog 404 恒真断言/jobs 面脚本纯度假断言/委派钉面构造性必然——仲裁主轴 = 真探针面替换恒真断言）+ A APPROVE → 修复轮 9 项（探针插件 team_probe_list_descendants/team_probe_jobs_list 真面断言 + 委派钉扩 subagent/subagent_fork/task + profileMount 前置 + guard 兜底/契约/注释修正）；delta 双 APPROVE → 微修 4 项（self-test 五腿×2 场景 defectCases 补齐红证俱全 + 互引 token 化 + 行号漂移清扫 + 探针优先级修正）。任务书「做法」断言面更正成文（session/disposed 系 (A′) 残留 → (B) = interrupt/drain 证据；委派钉面必须含原生工具名）。
- **依赖**：P5-T6（stop-continuation 面另依赖 Phase 4 的 H-34 服务契约）。**量级**：4 小时。

---

## WP-5 可视化（计划书 §4.6，D4）

### [x] P5-T10 — 原生面板采用 + L1 断言

- **产出**：**(B) 形态（T1 更正）= 通用面板承载断言**：drive.mjs 的目录/事件断言（成员 = continuable 子女入 `subagent/catalog` 即 subagentchat 可达——Q-7 实证 `establishCatalogChild` 路径；lead 会话 `'agent-message'` 帧事件序列；成员会话内消息帧）+ probe 的 team 面探测 marker（**omo-team 状态机/工具面在场性具名 marker**——状态机未初始化必须响亮，金丝雀纪律，probe 负断言锚点）。
- **做法**：`subagentchat` 面板达成员会话的断言（L1 可断言 catalog/descriptor 资源，肉眼核验归 T16）；**不挂 ui-agent-team**（fork (B)，D18）；T11 触发条件按 (B) 形态复核（仅当通用面板对「team 消息交换」不满足退出标准 a 时触发）。
- **判定**：✅ 门 3/8 绿；probe 含 team marker 双向断言（在场形态 / 缺席具名）。
- **证据**：✅ 2026-10-11——drive.mjs 目录/事件断言扩面（team-create-and-message +9：catalog 恰两枚 continuable 行逐字 label + descriptor mode 衔接 + 唤醒轮帧 seq 边界锚 + lead ack 帧；team-shutdown-handshake +4：握手四路径帧渲染面）+ probe 双向 marker（`scripts/assert-team-probe-face.mjs`：在场 = trio 注册行 + 状态机 boot resume 行（插件派生形状）+ `errors=0` 锚定；缺席 = noteam profile 宿主具名降级对 + 零 marker catch-all）+ `--self-test` 17 defect 腿 + drive 13 枚新检查 fabricated 腿（只红自己 named check 逐腿红证）+ T11 复核证据档 `.omo/evidence/p5t10/`（**L1 证据不支持触发 T11**，终裁见 T11 条仲裁注）。实测：门 3 40/40（766 checks）；vitest 83f/1961t；root typecheck exit 0；probe exit 0；门 4/5/6/7/8 不回归；cold-start 绿。**双评审通过**：轮 1 A REJECT（证据档漂移 MAJOR——旧版脚本产物不可再生）+ B APPROVE → 修复轮 8 项（log 重刷/defect 腿/catch-all/锚定/转义/措辞）；delta：B APPROVE（2 MINOR+1 NIT 再修：errors=05 腿真实化/ONLY-own-check 声明化/计数注释）+ A 端点三次中断后 30 分钟周期重试成功 **APPROVE**（余 1 证据档措辞 nit 已修）。
- **依赖**：P5-T5。**量级**：4 小时。

### ~~P5-T11 —（条件任务）自定义 ChatNode 兜底~~

> **仲裁终裁（2026-10-11）：不触发，整条取消，不算未完成。** 证据 = T10 L1 复核档 `.omo/evidence/p5t10/T11-review-input.md`：通用面板可见性三件套各有 durable 事件锚（① 成员入 subagentchat 目录——lead `subagent/catalog` 恰两枚 continuable 行逐字 label 实测；② 唤醒轮投递帧 = 'agent-message' 帧落首个 completed turn 之后（chat messageDefinition 认领面，non-'user' 判别式——渲染分类的肉眼终证归 T16 L2）；③ 成员/lead 会话消息帧双向可读）。缺口台账三项均为已登记差异（无 mailbox 集中视图 / 中途 steer 'context' kind 隐藏 / member↔member 直通（B) 结构性不存在），不动摇退出标准 a 的 L1 半边。故不建自定义 ChatNode。

- **触发条件**：仅当 T10 复核裁定通用面板（subagentchat + lead 会话 `'agent-message'` 帧）对「team 消息交换」不满足退出标准 a。**不触发即整条取消（删除线 + 理由成文），不算未完成**。（T1 Q-7 初步裁定：唤醒轮 turn-trigger 卡 + subagentchat 达成员会话 = 可见性成立，倾向不触发；缺口台账 = 无 mailbox 集中视图（记差异）/ 中途 steer 'context' kind 隐藏（记差异）/ **member↔member 直通 = (B) 形态结构性不存在**（lead 中转语义固化，评审登记——非可见性缺陷，不作触发条件）；T10 复核终定。）
- **产出**：omo-team client face（`ConversationNodeDefinition` 实现 + `ConversationEventRegistry.register` + disposer 纪律）。
- **判定**：✅ `match` 命中目标事件族（**(B) 形态事件族以 T10 裁定为准**——`team/message/*` 是 (A′) 形态事件族，(B) 不挂 bundle 不存在；候选 = `'agent-message'` 帧 / subagentchat 资源事件）；`buildViewNode` 产出可渲染节点；L2 浏览器可见。
- **依赖**：P5-T10（仅 Q-7 兜底裁定触发）。**量级**：1 天。

---

## WP-6 关键词与 Phase 4 接盘（计划书 §4.7/§4.8）

### [x] P5-T12 — team 关键词模式接线 + team.md vendor

- **产出**：keyword-detector 的 `team` 槽接线（`TEAM_PATTERN` 命中 → pre-step 注入，source kind `omo-team-keyword`）；**vendor 两项**（T1 Q1b N5 实证扩清单）：`prompts-core/prompts/mode/team.md`（615B 关键词命中单段指令）**+ `skills-loader-core/src/features/builtin-skills/skills/team-mode.ts` 的 `teamModeSkill.template`**（204 行真·lead 运行协议——Closure Contract/工具分权/bounds 全在其中）——playbook 全套（NOTICES/manifest/deviations）；e2e `team-keyword-mode`（注入 + 对照不注入）。
- **做法**：H-33 模块内演进（不新增 hook 条目，`EXPECTED_HOOK_COUNT` 不变——若裁定新增条目则触发 R-8 同步网全网，任务书成文）；注入幂等沿用既有语义；上游载体引用段（worktree/`~/.omo`/tmux）正文保真、适配由工具层文案承担；**成员侧不放行 team 关键词注入**（T1 Q-8 裁定：keyword-detector 子会话过滤链 `keyword-detector.ts:570-621` 六具名 skip 逐字复核后钉死——成员语境由 `omo-team-briefing` 承担，重复注入是噪声）；**vendor 文本已知矛盾登记**（Q1b N1：模板/引导里 `status:"failed"` 是空头指令——core schema 无 `failed`；N9：`delegate_task` vs `delegate-task` 名称漂移——正文保真、deviations 注记，DSH 侧适配文案以 vendored tasklist schema 为准）；**Q-4 NOTES-6 联动**：`vendor/shared-skills/` 的 debugging/refactor 技能文本教 `team_send_message`/`team_task_create` OMO 参数——omo-team 工具面定型后同 commit 加注记或改写（防模型被引向参数必错的调用）。
- **判定**：✅ 门 2/3 绿；vendor 漂移检测绿；`verify-licenses` 计数变化有对应条目。
- **证据**：✅ 2026-10-12——`patches/omo-dsh/vendor/prompts-team/`（新 vendor 包：team.md 615B + team-mode skill 模板 204 行，双向 sha256 对账 IDENTICAL；deviations 登记 N1 failed 空头指令 + N9 delegate_task 名漂移，正文保真）+ keyword-detector team 槽接线（TEAM_PATTERN 命中 → pre-step 注入 vendored team.md 正文逐字，kind `omo-team-keyword`；成员侧结构性不放行 = `SUBAGENT_ALLOWED_TYPES` 无 team + `memberSideAllowed: false` 机读化；幂等沿用；H-33 模块内演进 EXPECTED_HOOK_COUNT 不变）+ 单测 8 腿 + e2e `team-keyword-mode`（18 检查 + 7 defect 腿各红各的）+ Q-4 NOTES-6 联动核实成文（~~shared-skills 文本与本仓工具面一致，无需改写——双评审独立复核成立~~）**【T18 订正：该结论已被 PR #17 第二轮评审证伪并更正**——`vendor/shared-skills/skills/refactor/SKILL.md` 的 Team Mode 分支（Phase 5.1-T）与本仓工具面**不兼容**（调 `team_list`／写盘上 team config／`team_create(teamName=…)`／`category:"unspecified-low"`／缺必填参数的 `team_task_update`），`hyperplan` 技能正文的 category 词表与 `task_send`／`team_run_id` 拼写同样不解析；更正 = **消费侧**（技能注册面）前置适配注记 + 强制 `refactor` 走 legacy 路径 + 「带 team 调用示例的技能必须登记注记」反向门，见 T18〕。实测：门 3 41/41；vitest 85f/1993t；root typecheck exit 0；licenses 60→61（prompts-team 入册有对应）；vendor 漂移 372；门 4/6/7/8 不回归；cold-start 14/24。**双评审 APPROVE**（B 直过含 vendor 字节双向对账；A 2 NIT——patternFlags 机读面补齐 + promptText 载体措辞；mcode 1 NIT 尾换行——修复轮落毕仲裁独立确认）；**staged COPY 带 vendor 字节修复**（cpSync vendor/prompts-team——T5 staging 教训面）；T13 仲裁增补成文（N1 处置 + team.md opencode 载体句适配评估）。
- **依赖**：P5-T5（team 工具面在场是注入语义的前提）。**量级**：4 小时。

### [x] P5-T13 — hyperplan / remove-ai-slops 完整形态升级

- **产出**：omo-commands 两模板的 team 段升级（降级文案 → 完整对抗评审环 / team-mode addendum）；**切换判据 = team 工具在场探测**（运行时可判，不硬编码）；e2e 升级。
- **做法**：模板两处状态的探测函数单测；升级后语义对齐上游模板（v4.19.4 源路径署名头更新）；omo-commands manifest 条目状态与覆盖基线（phase4-commands.md）同 commit 回填。**【仲裁增补（T12 评审登记，2026-10-12）**：**N1 处置随本任务**——vendored team-mode skill 模板的 `status:"failed"` 是空头指令（vendored tasklist schema 无 failed 态）；vendor 正文保真不动，但**若本任务把 team-mode 模板注册进技能目录或引用其文本**，消费侧文案/加注须说明「failed 无对应 schema 态，终态词表 = pending/claimed/in_progress/completed/deleted」——空头指令不许原样进模型可见面。② **team.md 的 opencode 载体句**（"set team_mode.enabled=true and restart opencode" 兜底句）在 DSH 无对应面——本任务若消费 team.md 正文，须评估该句的适配注记位置（deviations[] 登记优先于 NOTICE-only，opencode 评审登记）。】
- **判定**：✅ 门 2/3 绿；team 缺席时降级语义**保持绿**（反向场景——降级路径不许因升级死掉）。
- **证据**：✅ 2026-10-12——`omo-team/src/team/team-tool-presence.ts`（在场探测面：TEAM_TOOL_ROW_IDS ①–⑪ 派生快照 + ctx.provide 双服务，provide 缺席具名抛不发假脸；声明层在场 × 运行时服务在场的双层边界头注成文）+ omo-commands 两模板升级（hyperplan 完整对抗评审环 + remove-ai-slops team-mode addendum，**运行时可判切换**：handler 每次调用现读 ctx.get（apply 期不缓存），三态归一保守判——服务缺席/形状不合/非 true ⇒ 降级逐字节 = P4）；N1 拆弹进模型可见面（五值词表 + NO failed state）；team.md opencode 载体句进 deviations[]（第 5 条 note）。单测 25 it（探测矩阵/双形态渲染/中途挂载点亮）；e2e 两场景完整形态断言。**评审修复轮**：① MAJOR 死载体指令拆弹（SKILL.md task_send 词汇 + senpi 重启句→拆解句 + never STOP 钉 + dead-link 第 4 规则）；② MAJOR 静默删去补登（team-mode skill 加载前置 + 32KB 知识）+ 32KB 拆分句进两模型可见面（钉活常量）；③ MINOR carrier note 重复段去重（P4 遗留）+ 守卫 3 腿；④ NIT 行号改准/恢复（109-115 双基线实测一致）；⑤ delta 残留（remove-ai-slops 登记一致性两段式 + NOTICES:596 矛盾行 + 陈旧计数/行号清扫）。实测：门 3 **41/41**（终审后全量复跑 EXIT 0）；vitest 88f/2036t；root typecheck exit 0；门 4/5/6/7/8 不回归；probe PASS；cold-start 16/24。**双评审通过**（轮 1 A REJECT 2 MAJOR + B APPROVE → 修复轮；delta 双 APPROVE → 微修两轮）。**phase4-commands.md 四行回填**（C-04/C-07/S5-02/C组⑤）+ THIRD_PARTY_NOTICES.md 同步 + omo-commands manifest 两行翻动同 commit；manifest omo-team 侧两行翻 ported（16/24）。**误开 GitHub issue 4 件已关闭**（check-compat-probes 本地误跑的副作用清理）。
- **依赖**：P5-T6。**量级**：4 小时。

---

## WP-7 门与 e2e 扩展（计划书 §4.9）

### [x] P5-T14 — team 场景群补全 + 门扩展

- **产出**：drive.mjs 场景群终态（**canonical 七名**——T1 仲裁定名并已在 T7/T8/T12 同注册：`team-create-and-message` / `team-nested-create-denied` / `team-teardown-no-orphans` / `team-shutdown-handshake`（T7）/ `team-task-claim`（T8）/ `team-keyword-mode` / `stop-continuation-team`）；门 4（第四插行 + team Config schema 校验）；门 6（c 组延续编号：四插行 / omo-team 署名覆盖 / manifest↔文件集合 / vendor 存在性 / **c14 并集扩展裁定**——phase5-team.md 含 H-号段条目时入 `COVERAGE_BASELINE_MDS`，同 commit）；门 8（probe/proofs 扩展）。
- **做法**：每场景含对照断言与反向金丝雀（计划书 §2 纪律）；门扩展只加严；变异反跑自证（门 6 新断言至少一条删行/改行变异实证）。**【仲裁增补（双评审收敛，2026-10-10）**：T6 的 relay（member↔member lead 中转）与 broadcast（仅 lead）两面当前只有单测、无 e2e——本任务给 team-create-and-message 或新场景补**至少一条真实中转断言 + 一条广播断言**（帧注 `(relayed via lead)` + durable source = lead 的 'agent-message'），否则该路径回归网只有结构 mock（mcode NOTES-3 / opencode NOTES 双登记）。】**【仲裁增补 2（T8b 评审遗留，2026-10-10）**：drive.mjs `dualLedgerDurableAcrossReboot` 的弱匹配断言（空数组可过）在本任务加固为结构化读账 + 非空成员集判定（mcode 建议落点 T9/T14，归此）。】
- **判定**：✅ 8 门全绿；场景 verdict JSON 含明细断言；变异实证记录。
- **证据**：✅ 2026-10-12——场景群终态（canonical 七名全绿 + relay 真断言（中转帧 `(relayed via lead)` + durable source=lead 'agent-message'）+ broadcast 真断言（扇出双成员恰一次 + lead 不自收 + 成员广播具名拒）+ dualLedger 结构化加固（非空成员集判定）+ hyperplan 正名 `hyperplan-team-mode-full-ring` 全仓同步 + 降级腿证据边界成文）；门 4（omo-team Config schema `{maxMembers?:number}` 默认 8 = MAX_TEAM_MEMBERS 指针 + doctor-lite repo 行扫描臂 `validated=omo-team(maxMembers=8)` + `REPO_ROWS_WITH_SCHEMA` 针）；门 6（c25 署名覆盖 / c26 manifest↔文件集合双向钉 / c27 vendor 存在性 + 排除面 + 终态钉 + c14「不扩展」裁定成文 + 活体针 phase5-team.md `| H-N |` 行数恒 0）；门 8（第 8 证 prove-team-runtime.mjs：vendored team-core 宿主 Node 直载回归网 + manifest 完整性 + resume 零形态 + row Config）。实测：**ci-local 8/8 全绿**（归档 `.omo/evidence/p5t14/ci-local.log`）；vitest 89f/2044t；root typecheck exit 0；probe PASS；cold-start 绿。**双评审通过**：轮 1 B REJECT（2 MAJOR——c27 glob 真空臂 + vendor 反向钉缺失）+ A APPROVE → 修复轮（glob 臂前缀目录化 + declared/really-checked/vacuous 三数绿幅 + vendor 反向钉 + 变异腿 C/D/E/F）；delta 双 APPROVE → 微修轮（反向钉整树化 + fail-closed 前缀计数（declared 钉常数 8）+ 剪枝顺序 + 豁免纪律成文 + 变异腿 G/H/I）仲裁独立确认。**首轮红诚实账**：settleReachedChildren 误用 eventText（JSON 转义陷阱→toolResultTextOf 原文提取器）+ dualLedger 漏带结构化字段——修复为收紧非放水（评审核实）。
- **依赖**：P5-T5…P5-T13 全部。**量级**：1.5 天。

---

## WP-8 收口

### [x] P5-T15 — 合规复核 + 文档双语 + 覆盖基线终态

> **仲裁增补（T14 评审遗留登记，2026-10-12；前提订正 2026-10-12 晚）**：① `drive.mjs` 的 `settleReachedChildren` 弱形（`settleReached !== false` 恒过——非 T14 引入的存量弱断言）在本任务评估是否加固为具名 settle 证据钉（加固则同 commit 成文，不加则记差异理由）；② ~~门 6 的 c26/c27 与门 4 新臂的变异实证缺口（T14 只有 c25 两腿真破真红）——本任务补 c26/c27/doctor-lite 新臂各至少一条变异腿~~ **②订正**：c26/c27 变异腿已于 T14 终审后的 `p5t14/mutation-gate6.log`（c26=腿 F；c27=腿 C/D/E/G/H/I，均真破真红真还原）闭环，本增补写下时该终态未发生——真实缺口仅门 4 新臂，由 T15 的腿 A–D（`p5t15/mutation-gate4-doctor-lite.log`）补上；② 全项闭环。

- **产出**：`THIRD_PARTY_NOTICES.md` Phase 5 小节终态（**(B) 形态 = 语义移植表 + team-core vendor 子集表**）；vendor manifest 漂移复跑；README 双语状态行（team 面 ≠ DAG ≠ 编辑面的措辞纪律沿用 Phase 2/3/4 先例）；CHANGELOG；**D18（fork 已裁 (B)：不采用 experimental team 面登记——依据 = Q-3 三重封死链 + FORK.md）与 ROADMAP Phase 5 措辞修订双语同 commit**；dsh-0.2.0-rc.2 复核报告补「实施期订正」节（Q-2/Q-3/Q-7 的契约事实，双语）；覆盖基线全条目终态。
- **判定**：✅ 门 7 绿（d01–d10 现行断言集）；`verify-licenses` 绿且计数全对应；双语文档行数/结构一致。
- **证据**：✅ 2026-10-12——**合规面**：THIRD_PARTY_NOTICES.md 终态（team-core 表漂移修复 verbatim 7/modified 37/deviations 17 与 manifest 逐行零分歧——漂移系 T8b 扩展名补全翻 30 行 modified 未跟进，T15 抓出；+ **Phase 5 omo-team semantic ports 语义移植表 9 行**（Phase 4 逐命令表先例）+ 分隔符修正）+ vendor 漂移复跑 `checked=372 violations=0` + `verify-licenses checked=61 violations=0` 计数全对应（57→59→60→61 逐次有对应）；**文档双语**：dsh-0.2.0-rc.2 复核报告补 §9「实施期订正」（Q-2/Q-3/Q-7 契约事实，双语同 commit，结构对应）+ README 双语 hyperplan 行改完成时；**覆盖基线终态**：manifest vendor 六行翻 ported（pending=0/ported=22/recorded=2，同步网全点位 + team-core-vendor.ts 守门面 + c28 NOTICES-mirror 派生臂——防 T8a→T8b 型漂移再存活）；**T14 遗留**：settleReachedChildren 弱形→具名 settle 证据钉 ×3 场景 + handshake 追加（四枚具名钉）+ fabricated settle 腿；doctor-lite 门 4 新臂变异腿 A–D；**评审修复轮**：c26/c27 增补②前提订正（已于 p5t14 闭环）+ NOTICES 三行分隔符 + RUN-SUMMARY/CHANGELOG 诚实账同步 + **settle ④钉竞态修复**（opencode 实测 4 跑 1 红——插桩实测裁两案取①：settle 钩子增三 lane 静默轮询 + 快照静默 2s，④钉满贯零豁免；6 连跑 PASS + 4 独立连跑复核）+ 证据指针校正。实测：**ci-local 8/8 全绿**（归档 p5t15/ci-local.log）；vitest 90f/2056t；root typecheck exit 0；verify-concerto-static 37/37；cold-start 22/24；probe PASS。**双评审通过**（轮 1 双 REJECT（B 的 MAJOR 经 p5t14 日志证据驳回 + A 的 NOTICES 缺表 MAJOR 成立）→ 修复轮；delta B APPROVE 零 findings + A REJECT（settle 竞态 MAJOR）→ 竞态修复轮；race-delta 双 APPROVE → nit 微修仲裁独立确认）。
- **依赖**：P5-T14。**量级**：4 小时。

### [x] P5-T16 — 退出标准核对 + L2 真机

- **产出**：退出标准核对表（下节）全 ✅；L2 证据 `.omo/evidence/p5-l2-*.md`（真实 web boot + 浏览器核验 **subagentchat 面板达成员会话 + lead 会话 `'agent-message'` 帧消息可见**（(B) 形态——无 TeamAction/projection，fork 裁定见 T1）+ 一次真实 3 成员协作 + 拆除核验）。
- **做法**：逐条对照计划书 §5 取证；L2 按 manual-testing 惯例；**「web UI 可见」以浏览器核验为准**，L1 事件/目录断言只作回归网（R-5 纪律）。
- **判定**：✅ 核对表 a/b/c + DoD c/d/e 全 ✅。
- **证据**：✅ 2026-10-12——**L2 真机半段**（`.omo/evidence/p5-l2/`）：真实 LLM 3 成员协作（l2-drive.mjs，沙箱真 boot + 真实 ~/.dsh digest 不动；凭据卫生：API 凭据全树零泄漏；launch token 初版误落明文 3 处——评审 BLOCKER 修复轮已杀进程失效 + 脱敏 + 全树复扫零命中，见 p5-l2/ui/token-hygiene-grep.txt）：21 次真实模型调用（lead 9 / analyst 8 / builder 4），路由逐席（lead deepseek-official/v4-pro、analyst deepseek/deepseek-flash、builder deepseek-official/v4-pro）；协作内容真实（成员各自读 README/CHANGELOG 并回报，lead 汇总）；消息双向 10 帧；拆除核验（team_delete forced + interruptedSessionIds 恰两枚 + boot drain 行 + state.json 墓碑 deleted + 探针 rows 全 inactive + no revival + no grandchildren）。**verdict-final.json 28/28 PASS**（首跑 2 项 check 模式误报——arguments JSON string 未 parse + 墓碑取错条——l2-reanalyze.mjs 冻结日志零付费重判修正，模式差异成文）。**浏览器核验**（`.omo/evidence/p5-l2/ui/`：headless Chrome 154 + CDP 驱动 + 8 截图 + ui-evidence.md **10 PASS + 1 RECORDED**）：lead 会话轨迹 tab Team message 唤醒卡双向可见（from analyst/builder 全文可展开）+ subagentchat 列出两成员会话（可继续标记）+ 点开成员会话 lead→成员帧可见 + (B) 形态无 team 专属面板；native picker 旁路（zenity 宿主不可驱动）用 UI 客户端同款网关 API 注册的诚实记录。**退出标准核对表 a/b/c + DoD c/d/e 全 ✅（见下节）**。
- **依赖**：P5-T15。**量级**：4 小时。

### [x] P5-T17 — PR #17 评审修复轮（BLOCKER-1 + MAJOR-2/3/4/5 + MINOR/NIT 收敛）

> **触发**：PR #17 的 OWNER 评审（`gh pr view 17`，head = `1bc9fbd`）给出 1 条 BLOCKER + 4 条 MAJOR + 8 条 MINOR + 9 条 NIT。本任务 = 该评审的**修复轮**（评审意见逐条复核 → 成立的修 → 不成立的回帖说明 → 门禁复跑）。
> **复核结论**：BLOCKER-1 与 MAJOR-2/3/4/5 **全部成立**（逐条追到代码与宿主契约）；MINOR-5/6/7/9/10/12 与 NIT-13/14/15/17/18/19/20 成立（已修）；MINOR-8 **部分修**（去重账封顶但**不裁剪**——见 T18：裁剪会破坏补偿退账的不变量）、MINOR-11 与 NIT-12 **不修并说明理由**（见 PR 回帖）；NIT-16 已修（PR 描述 + README 双语的「12 个工具面」口径）。

- **产出**：BLOCKER-1 的**持久会话面**适配（`session-context-adapter.ts` 改读 `ctx.sessionQuery`，冷但存在的成员判「在场」，无法证伪的缺席按「存在」处理）；广播**零投递退账**（MAJOR-2）；`/remove-ai-slops` **降级路径载体注记逐字节回 P4**（MAJOR-3，两枚注记按路径分立）；关键词槽**在场闸 + 载体注记拆弹死链**（MAJOR-4）；任务书 T8a **vendor 计数回正**（MAJOR-5）；`team_status` **成员活体观测**（MINOR-5）；`team_delete` **拆解失败不搁浅**（MINOR-6）；在场面**改读实际注册结果**（MINOR-7，`team-registration-outcome.ts` 新模块）；sidecar **损坏留档 + 后果分别具名**（MINOR-9）；`settle()` **撤陈旧参与行**（MINOR-10）；README 双语 **D1–D18**（MINOR-12）；NIT-13/14/15/17/18/19/20 逐条修。
- **判定**：✅ 门 1（typecheck）绿；门 2（vitest）绿且**计数增长**（新增 19 条评审专属腿：2056 → 2075）；门 3（e2e）绿；门 4–8 绿。
- **证据**：✅ 2026-10-28——**BLOCKER-1**：适配器的存在性判据从「活体注册表」换成「**持久会话面**」（`ctx.sessionQuery.observeSession`，基础 bundle 恒挂载 `session-query-sqlite`）；三态归一 = 活体命中 → 在场 / 持久命中（冷但存在）→ 在场 / 持久**确证**缺席（`SESSION_QUERY_SESSION_NOT_FOUND`）→ 缺席 / **无法证伪**（服务缺席或读失败）→ 按在场处理（孤儿化是**终态**且抹掉成员 `sessionId`，误判不可逆）。新增跨重启腿：冷态 lead + 冷态成员 ⇒ run 仍 `active`、成员 `sessionId` 仍在（落盘字节同证）。**MAJOR-2**：广播**零投递**（首个成员即失败）退账 ⇒ 同 `correlationId` 可重投；**部分投递**仍不退（宁漏不重），错误文本分两种措辞。**MAJOR-3**：降级路径的载体注记**逐字节 = P4**（"NO TEAM MODE" 措辞——降级形态下它是真话），P5 的「运行时开关」解释只留在**在场路径**的注记（`REMOVE_AI_SLOPS_CARRIER_NOTE_P5`）。**MAJOR-4**：关键词槽读 omo-team 发布的 `omoTeamKeywordFace.teamToolsPresent`（**本次 boot 实际注册成功**的 ①–⑪ 齐备）作**在场闸**——载体缺席 ⇒ 不注入 team 正文（新增具名 reason `team-surface-absent`）；在场时注入正文**前置载体注记**（就地拆弹 "set team_mode.enabled=true and restart opencode" 死链 + N9 工具名漂移 + N1 空头终态）。**MAJOR-5**：T8a 证据行的 vendor 计数回正为 verbatim 7 / modified 37 / deviations 17（与 manifest `counts` 与 T15 行同口径）。**MINOR-7**：在场面从「manifest 声明」改读「本次 boot 实际注册结果」（新模块 `team/team-registration-outcome.ts`，注册循环逐行记账）——某枚工具行注册 FAILED ⇒ 在场判 false ⇒ 两条命令降级。实测：**vitest 90f/2075t**（+19 评审腿）；root typecheck exit 0；`verify-concerto-static` 37/37（c25/c26 的新模块归属按门自己的命名清单登记，未放宽任何断言）；`vendor-manifest` checked=372 violations=0；`verify-licenses` checked=61 violations=0；`check-docs-consistency` 10/10；`ci-local` 8/8 全绿。
- **依赖**：P5-T16。**量级**：6 小时。

### [x] P5-T18 — PR #17 第二轮评审修复轮（4 MAJOR + 6 MINOR/NIT）

> **触发**：PR #17 的第二轮 OWNER 评审（`gh pr view 17`，`1bc9fbd → ec45e3f`），结论 = **Request changes（暂缓合入）**。给出 **4 个 MAJOR**（其中两个是 T17 修复组合引入的**新回归**）+ 6 个 MINOR/NIT。
> **复核结论**：4 个 MAJOR **全部成立**（本轮逐条追到代码与已安装 DSH 宿主契约；MAJOR-1/MAJOR-2 是**驳回 T17 的两条修复**——它们成立，T17 那两处的推理是错的）；6 个 MINOR/NIT 全部成立。

- **产出**：**MAJOR-1**：`team_delete` 的拆解失败**一律不收账**（drain 失败 ≠ 成员已停——原生 `interrupt` 只是发起异步取消，DSH 的 `drainChildren` 在任何 child release **之前**就可能抛 `UNAUTHORIZED`；收账会制造无主且仍在运行的成员）⇒ 账留在 `deleting` + 错误文本写明「重跑同一 teamRunId 即可续上」。**MAJOR-2**：去重账**封顶但不裁剪**——满载时**显式拒收**（具名 `MESSAGE_LEDGER_FULL`，工具层译成本工具错误族），因为裁剪**不可逆**而预约失败要走补偿退账（第一轮的滚动窗口会让「满载 + 连续失败」逐步清空历史去重账）。**MAJOR-3**：FULL 模板里三处**照写必失败**的调用示例补齐必填参数（`team_send_message` 缺 `body` / 缺 `teamRunId`+`body`；`team_task_update` 缺 `teamRunId`+`taskId`）+ 新增「**模型可见调用示例 ↔ 工具 required schema**」一致性门。**MAJOR-4**：`refactor` 技能的 Team Mode 分支与本部署工具面不兼容（`team_list` / 盘上 team config / `team_create(teamName=)` / `category:"unspecified-low"` / 缺参的 `team_task_update`）⇒ **消费侧**（技能注册面）前置适配注记**强制走 legacy 路径**（vendor 字节不动）+ 新增「带 team 调用示例的技能必须登记注记」反向门。MINOR 六项：重启 e2e 补**硬断言**（run 仍 `active` / 成员 `sessionId` 未抹 / `orphaned=0`+`errors=0` / resume 行不得是 FAILED 形）；`forgetRun` 对 mirror 缺位**失败封闭**（锁内从盘上确证终态）；`memberPhaseNote` **事实订正**（`pending`/`shutdown_approved`/`completed`/`errored` 各有生产者，未接的是**正常 turn 生命周期**）；关停三帧的成员名**同样净化** + 坐标改 `JSON.stringify` 构造；sidecar 留档**失败不许宣称已保存**（路径只生成一次、按结果分流）；README 双语「12 个工具面」口径改正 + 本任务书 T17 证据数字订正。
- **判定**：✅ 门 1（typecheck）绿；门 2（vitest）绿且**计数增长**；门 3（e2e，含重启硬断言）绿；门 4–8 绿。
- **证据**：✅ 2026-10-29（⚠️ **T19 订正**：本行末句「MINOR 六项逐条落地（详见各文件头的成文注记与**对应单测**）」口径过满——`team-shutdown.test.ts` / `team-status.test.ts` 在本轮**零 diff**，forget mirror 缺位、quarantine 失败、重启新断言当时都**没有**负向回归腿；缺的腿已在 T19 补齐）：**MAJOR-1**：回退 T17 的「仅 drain 失败 ⇒ 收账」那一条（`team-delete.ts` 的 fault 分流整体作废），改为「任一 fault ⇒ 留在 `deleting` + 具名 TEARDOWN_FAULT + 重跑指引」；新增腿断言 drain 失败时 `participationOfMember` 仍在（成员仍属于本队，不是孤儿）、重跑即收敛到 `deleted`。**MAJOR-2**：去重账改为 `max_messages_per_run` **封顶 + 显式拒收**（`MESSAGE_LEDGER_FULL`），删掉第一轮的滚动窗口（`boundedProcessedIds`）；新增腿：满载 ⇒ 新 id 被拒且**旧的一条不少**；「满载 + 单投失败」「满载 + 广播零投递」两条联合回归腿。**MAJOR-3**：三处示例补齐 + 新门 `tests/omo-commands/team-surface-consistency.test.ts`（扫全部模型可见模板里的 `team_xxx(...)` 示例，逐个核对该工具的 required 集——已实测它能抓出评审点名的三处）。**MAJOR-4**：新增 `VENDOR_SKILL_TEAM_ADAPTATION_NOTES`（按名登记，不按模式扫）+ 注册面前置；`refactor` 的注记强制 legacy 路径，`hyperplan` 的注记做词汇翻译（`task_send`→`team_send_message`、`team_run_id`→`teamRunId`、category 只剩 quick/deep）；反向门扫 vendor 树，任何带 team 调用示例的技能都必须登记注记。MINOR 六项逐条落地（详见各文件头的成文注记与对应单测）。实测：**vitest 91f/2085t**（新增一致性门文件 `tests/omo-commands/team-surface-consistency.test.ts`）；root typecheck exit 0；`verify-concerto-static` 37/37；`vendor-manifest` checked=372 violations=0（**vendor 字节零改动**——MAJOR-4 走的是消费侧）；`verify-licenses` checked=61 violations=0；`check-docs-consistency` 10/10；e2e **41/41**；`ci-local` 8/8 全绿。
- **依赖**：P5-T17。**量级**：6 小时。

### [x] P5-T19 — PR #17 第三轮评审修复轮（4 MAJOR + 5 MINOR + 1 NIT）

> **触发**：PR #17 的第三轮 OWNER 评审（`gh pr view 17`，`ec45e3f → 8e46c23`），结论 = **Request changes（暂缓合入）**：4 个 MAJOR（并发预约误报已交付 / `debugging` 漏适配 / `ultrawork` 漏适配 / `hyperplan` 注记未拆 closed-spec 冲突）+ 5 个 MINOR + 1 个 NIT。
> **复核结论**：**全部成立**（逐条复现；MAJOR-1 是评审给出的真实并发复现，MAJOR-2/3 指出上一轮「按名登记」的名单**漏了两枚技能**，MAJOR-4 指出上一轮的注记**不足以让 spec 通过解析**）。

- **产出**：**MAJOR-1**：去重账拆成「**在途预约**」与「**已送达**」两态（`inFlightMessages` / `processedMessageIds`），三段序 `reserveMessageDelivery` → 投递 → `commitMessageDelivery` / `rollbackMessageReservation`；并发同 ID 的第二个调用拿到 `in-flight` 并返回**可重试**的 `inFlight:true`（`delivered:false, deduplicated:false`），**不再宣称已交付**；预约带时刻 + TTL 兜底崩溃。**MAJOR-2/3/4**：技能适配注记扩到**四枚**（refactor / hyperplan / debugging / ultrawork），`debugging` 强制走 Path B、`ultrawork` 翻译 team 词汇（含 keyword 注入面）、`hyperplan` 给出**可直接抄的合规 inline spec**（删 spec 级 `description` 与 member 级 `kind`）。**MINOR**：满载指引改为真实终态（换新 id 无效，只能拆队重建）；`forgetRun` 的 force 先行 + 检查与删除同临界区；坏账留档失败的文案不再断言原字节已丢失（抽成纯函数分两条腿钉）；反向门递归扫 `references/**` + 扩检测面 + 非真空断言 + 超集约束；重启 e2e 按**成员名**对照 sessionId + 数值解析 `orphaned`/`errors`。**NIT**：补 `team-shutdown` / `team-status` / `forgetRun` / 坏账文案的回归腿，并订正 T18 的口径。
- **判定**：✅ 门 1（typecheck）绿；门 2（vitest）绿且**计数增长**；门 3（e2e）绿；门 4–8 绿。
- **证据**：✅ 2026-10-29——**MAJOR-1**：`reserveMessageDelivery` 返回三态（`reserved` / `duplicate` / `in-flight`），满载判据读**已送达**账；工具层 `inFlight:true` 走独立返回形状（不给 `deduplicated`、不给 "was already delivered"）。新腿：并发同 ID（A 挂起、B 读 in-flight、A 成功后 B 才 dedup；A 失败后 B 重试真投递）+ store 级三段序 + 过期在途行剔除。**MAJOR-2/3/4**：`VENDOR_SKILL_TEAM_ADAPTATION_NOTES` 四枚；`TEAM_SURFACE_SHAPES_NOTE` 跨包逐字同源（交叉钉）；`HYPERPLAN_TEAM_SPEC_REPLACEMENT` 进 FULL guidance + 技能注记，并用**真实** `parseTeamSpec` 证明「照抄能过、上游原样被拒（`V1_UNSUPPORTED_FIELD`，先 description 后 kind）」。**MINOR**：`MESSAGE_LEDGER_FULL` 文本改为「拆队重建」；`forgetRun` 的 `force` 先行（force 时直接擦，非 force 才锁内确证 + 白名单 + 同一临界区 `rm`）；`formatCorruptLedgerWarning` 纯函数两分支；反向门命中数 `['debugging','hyperplan','refactor','ultrawork']`；e2e 重启腿按名对照。**E2E harness（同轮实测修的挂死面）**：mock 钳位步从 `team_status` 工具调用改成文本终止符（游标越界会重复最后一 step ⇒ 钳位成工具调用会把「队列没预料的额外唤醒轮」变成无界工具循环，实测 1169 次 status 直到 step-cap 打断）、静默前置改**真轮询**（250ms×120s）、`stopDsh` 对已退出子进程立即返回、restart 步 8 分钟 + 采纳 90s 时间盒。实测：**vitest 91f/2094t**；root typecheck exit 0；`verify-concerto-static` 37/37；`vendor-manifest` checked=372 violations=0（**vendor 字节零改动**）；`verify-licenses` checked=61 violations=0；`check-docs-consistency` 10/10；e2e **41/41**；`ci-local` 8/8 全绿。
- **依赖**：P5-T18。**量级**：6 小时。

### [x] P5-T20 — PR #17 第四轮评审修复轮（3 MAJOR + 1 MINOR）

> **触发**：PR #17 的第四轮 OWNER 评审（`gh pr view 17`，`8e46c23 → e97a648`），结论 = **Request changes（暂缓合入）**：3 MAJOR（在途不计 cap 导致超帽/无界、TTL 无 owner 导致旧 rollback 删新预约、hyperplan keyword 注入路径仍带 closed-spec 违规字段）+ 1 MINOR（`forgetRun` 的锁没覆盖 `orphaned→deleting` 的实际写者）。
> **复核结论**：**全部成立**（MAJOR-1/2 是第三轮两态账引入的新边界；MAJOR-3 是第三轮只修了技能注册面与命令路径、**漏了 keyword 注入面**；MINOR 是第三轮只锁住了 forgetRun 自己那一半）。

- **产出**：**MAJOR-1**：满载判据改为 `delivered + inFlight ≥ cap`（锁内串行 ⇒ 任一时刻总数 ≤ cap；commit 只移行不改总数 ⇒ 提交路径无需再查）；**MAJOR-2**：在途行加**归属 token**（每次预约现铸 uuid），`commit` / `rollback` 只作用于同一 token 的那一行（记账仍无条件——迟到的成功投递必须记账）；**MAJOR-3**：omo-hooks 的 `HYPERPLAN_CARRIER_NOTE` 补「**整段替换** spec」的指令 + 合规 replacement（与 omo-commands 那份逐字相同，跨包交叉钉保证）；replacement 同时改成 **JSON 形态**（引号键），模型可原样当 `inline_spec` 传。**MINOR**：`forceTransitionToDeleting`（`orphaned → deleting` 的唯一写者）的「读 + 判 + 写」收进同一把 `state.lock`。
- **判定**：✅ 门 1（typecheck）绿；门 2（vitest）绿且**计数增长**；门 3（e2e）绿；门 4–8 绿。
- **证据**：✅ 2026-10-29——**MAJOR-1**：store 腿 cap=3 时三条**不同** ID 全停在在途 ⇒ 第四条被拒、在途行恰 3 条（有界）、三条 commit 后仍不越界；工具腿 cap=1 时 A（挂起）已占在途 ⇒ B（不同 ID）拿 `MESSAGE_LEDGER_FULL` 且一次原生投递都没发。**MAJOR-2**：确定性复现腿——A 预约后把 `at` 改成 TTL 之外 ⇒ B 拿到新 token ⇒ **旧 A 的 rollback 不动 B 的行**（落盘逐字段断言）⇒ C 取同 id 仍是 `in-flight`。**MAJOR-3**：对**实际** `buildHyperplanMessage` 输出取证（不是常量）——replacement 在场、指令在场，并从消息正文抠出那段 JSON 跑**真实** `parseTeamSpec` 通过；反向腿（上游原样 spec）仍被 `V1_UNSUPPORTED_FIELD` 拒；另有跨包逐字等值钉。**MINOR**：外部占住 `state.lock` 时 `forceTransitionToDeleting` 必须等待（250ms 后仍未完成），释放后收敛到 `deleting`。实测：**vitest 91f/2100t**；root typecheck exit 0；e2e **41/41**；`verify-concerto-static` 37/37；`vendor-manifest` 372/0（**vendor 字节零改动**）；`verify-licenses` 61/0；`check-docs-consistency` 10/10；`doctor-lite` pass。
- **依赖**：P5-T19。**量级**：5 小时。

### [x] P5-T21 — PR #17 第五轮评审修复轮（3 MAJOR）

> **触发**：PR #17 的第五轮 OWNER 评审（`gh pr view 17`，`e97a648 → 99eb108`），结论 = **Request changes（暂缓合入）**：3 MAJOR（TTL 重新预约不是投递 fence ⇒ 同 correlationId 物理重复投递；TTL 迟到 commit 仍可超帽；keyword 的 HARD PRECONDITIONS **STOP/Restart 死前置**未拆）+ 0 MINOR。
> **复核结论**：**全部成立**（前两条是第四轮 owner-token 方案的边界：token 保住了**账**的归属，但没保住**物理投递**的唯一性；第三条是 keyword 面只补了 spec、没补 STOP/Restart 拆弹）。

- **产出**：**MAJOR-1/2 同一根因，一处修**：**TTL 不再交出投递权**。过期行不再被读时剔除；请求同一 id 的调用拿到新的 `quarantined` 结果——**不投递**、**不宣称已交付**（我们并不知道它是否落地过）、并让调用方换新 correlationId 重发。于是 `delivered + inFlight ≤ cap` 从"靠锁串行"升级为**严格不变量**（过期不释放名额；迟到 commit 只把一行从在途**移**到已送达，总数不变）。**MAJOR-3**：keyword 注记补 STOP/Restart 拆弹段（与命令路径的 `HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT` 同一口径），放在正文**之前**。
- **判定**：✅ 门 1（typecheck）绿；门 2（vitest）绿且**计数增长**；门 3（e2e）绿；门 4–8 绿。
- **证据**：✅ 2026-10-29——**MAJOR-1**：工具级复现腿（评审原式）——A 挂起在 `sendMessage` 里 ⇒ 把 A 的 `at` 改到 TTL 之外 ⇒ B 用**同一** correlationId 拿到 `quarantined`（`delivered/inFlight/deduplicated` 三项皆 false，note 含 QUARANTINED 且**不含** "was already delivered"）⇒ `channel.sends` 恒为 1，**同一 correlationId 没有被物理重复投递**。store 级腿：过期 ⇒ `quarantined`（不是 `reserved`），且旧 owner 用自己 token 的 rollback 才能清掉封存行（那是"我失败了"的证明）。**MAJOR-2**：cap=1 复现腿——A 预约 → `at` 改到 TTL 之外 → B（不同 id）**被 cap 拒**（过期不释放名额）→ A 的迟到 commit ⇒ 磁盘 `processedMessageIds=['A']`、在途 0，总数恒 1 → C 仍被拒。**MAJOR-3**：对**实际** `buildHyperplanMessage` 输出取证——拆弹句在场、且在正文 "Before starting, verify:" **之前**；命令路径同一句仍在（两侧口径一致）。实测：**vitest 91f/2102t**；root typecheck exit 0；e2e **41/41**；`verify-concerto-static` 37/37；`vendor-manifest` 372/0（**vendor 字节零改动**）；`verify-licenses` 61/0；`check-docs-consistency` 10/10；`doctor-lite` pass。
- **依赖**：P5-T20。**量级**：4 小时。

### [x] P5-T22 — 第五轮 delta 的自查残余（不留到下一轮）

> **触发**：不等第六轮评审，主动把第五轮 delta 里我能看见的三处残余**先处理掉**：① `team_status` 只暴露 `processedMessageCount`（已送达），而满载判据是 `delivered + inFlight`——lead 撞到 `MESSAGE_LEDGER_FULL` 时从状态面看不出预算被谁吃掉；② quarantine 只有单投腿，广播路径无证据；③ "死掉的发送者永久占用一格预算"这个**取舍**只写在代码注释里，没进工具合同。

- **产出**：**① 可观测性**：`team_status.messageLedger = { delivered, inFlight, stalledInFlight, cap, remaining }` + 模型可见的 `messageLedgerNote`（三条事实：满载判据是 delivered+inFlight / 停滞行**永不回收** / 满载是终态）。store 新增 `messageBudget()`（锁内读落盘账，因为镜像只投影已送达）。**② 覆盖**：广播路径的 quarantine 腿（`to='*'` + 停滞 id ⇒ `quarantined:true`、`deliveries:[]`、**零扇出**）。**③ 合同**：`team_send_message` 描述写明「被隔离的 correlationId **永久占用**一格 `max_messages_per_run` 预算，从不回收；`team_status.messageLedger` 让它可见而非静默」。
- **判定**：✅ 门 1（typecheck）绿；门 2（vitest）绿且**计数增长**；门 3（e2e）绿；门 4–8 绿。
- **证据**：✅ 2026-10-29——`tests/omo-team/team-status.test.ts` 新增「cap=3、2 条已送达 + 1 条停滞在途 ⇒ `messageLedger={delivered:2,inFlight:1,stalledInFlight:1,cap:3,remaining:0}`，且随后一条确实被 `MESSAGE_LEDGER_FULL` 拒」；`tests/omo-team/team-message.test.ts` 新增广播 quarantine 腿（零扇出）。实测：**vitest 91f/2104t**；root typecheck exit 0；e2e **41/41**；`verify-concerto-static` 37/37；`vendor-manifest` 372/0；`verify-licenses` 61/0；`check-docs-consistency` 10/10；`doctor-lite` pass。
- **决策记录（③ 的取舍，明确写死）**：采用 **at-least-once + 同 ID 不重投**。停滞预约**不回收**（回收等于把投递权交还给"可能还活着"的旧 owner，正是第五轮 MAJOR-1 的根因）；代价是死发送者永久占一格预算、且那条消息可能两次都没到——两条都在工具合同与 `messageLedgerNote` 里对模型明说。若要严格 exactly-once，需要宿主导航层提供幂等或投递 fencing（本仓做不到，登记为 follow-up）。
- **依赖**：P5-T21。**量级**：2 小时。

---

## 退出标准核对表（T16 填写）

| # | 标准（计划书 §5） | 证据 | 状态 |
|---|---|---|---|
| a | 3 成员脚本化协作 + web UI 可见消息交换 | L1：`team-create-and-message` 场景（65 检查：组队+双向消息+descriptor 路由+投递事件对+离线唤醒）；**L2 真机**（2026-10-12，`.omo/evidence/p5-l2/`）：真实 LLM 3 成员协作 21 次模型调用（lead v4-pro / analyst deepseek-flash / builder v4-pro 逐席路由），`verdict-final.json` **28/28 PASS**（组队+任务板+双向消息帧+汇总+拆除核验）；**浏览器核验**（headless Chrome + CDP，`ui-evidence.md` **10 PASS + 1 RECORDED** + 8 张截图）：lead 会话轨迹 tab 的 Team message 唤醒卡双向可见（from analyst/builder 逐字帧全文可展开）、subagentchat 面板列出两成员会话并可点开、成员会话内 lead→成员帧可见、(B) 形态无 team 专属面板（fork 印证） | ✅ |
| b | 嵌套 `team_create` 被拒（具名拒绝 + 零子会话金丝雀） | `team-nested-create-denied` 场景（13 断言：lead 二次组建 = `session is already a participant of team <id>` 具名拒 / 成员试组建 = unknown tool 结构性缺席 / **零子会话金丝雀 = `noSessionParentedUnderMembers`（会话头 `parentSession` 扫描无任何 parent=成员的会话）+ `leadHasExactlyTwoChildren`（lead 恰两枚子女）**——评审订正 2026-10-12：本场景无 listDescendants 探针读，金丝雀机制以此两轴为准）+ 单测嵌套闸成员臂直达（拒绝文案冒泡 + `starts` 零新增） | ✅ |
| c | 拆除无孤儿会话（含孙代） | `team-teardown-no-orphans` 场景（26 检查：roster 闭合 tombstone + 成员 turn 关账 aborted(parent) + **探针真读 listDescendants 无活体成员行无 depth≥2** + jobs 面探针无成员行 + inbox 保留可证伪新锚）+ **L2 真机**：`interruptedSessionIds` 恰两枚 + boot drain 行 + 探针 rows 全 inactive + **no revival / no grandchildren（3 会话日志扫描）** | ✅ |
| DoD-c | 8 门全绿，只加严 | `.omo/evidence/p5t15/ci-local.log`：8/8 门绿（门 2 = 90f/2056t、门 3 = 41/41、门 4 doctor 含 omo-team(maxMembers=8)、门 5 licenses checked=61、门 6 concerto-static **33→37 只加严**、门 7 docs 10/10、门 8 proofs **7→8**） | ✅ |
| DoD-d | 文档与实测无冲突；fork 裁定回填计划书与 ROADMAP | 计划书第 3 轮修订记录（fork=(B) 全量更正，T1）；**ROADMAP Phase 5 设计依据双语锚点**（roadmap.md/roadmap_zh-CN.md，T3 commit `7039cb1`）；**D18 双语登记**（decisions.md/decisions_zh-CN.md：不采用 experimental team 面，三重封死链依据，同 commit）；dsh-0.2.0-rc.2 复核报告 §9「实施期订正」双语（T15 commit `7f7ae34`）；`FORK.md` 裁定书 + `ARBITRATION.md` 亲核记录 | ✅ |
| DoD-e | 署名零移除；计数变化全对应 | `verify-licenses`：`checked=56 → 57（omo-team 包）→ 59（team-core + zod）→ 60（e2e 探针包）→ 61（prompts-team）`逐次有对应条目，violations=0 全链；署名零移除 = 门 6 c25（omo-team 全文件署名覆盖断言）+ c28（NOTICES ↔ VENDOR-MANIFEST 逐行 mirror）+ THIRD_PARTY_NOTICES Phase 5 小节终态审计（T15 漂移修复 + 9 行语义移植表） | ✅ |
