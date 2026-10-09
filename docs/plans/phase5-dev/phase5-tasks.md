# Phase 5 任务清单

> **上游依据**：[开发计划书](./phase5-plan.md) · [team 面清单与覆盖基线](./phase5-team.md) · [ROADMAP Phase 5](../../roadmap_zh-CN.md) · [决策 D14／D17](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 5 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，覆盖基线给出"每条 team 面的处置"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：🚧 **T1 完成、T2 待开工**（2026-10-09：PRE 全绿；Q-1…Q-8 闭环；**fork = (B)**（`.omo/evidence/p5t1/FORK.md`）；T4–T16 已按 (B) 形态仲裁更正）。`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）· ~~删除线~~ = 仲裁取消。
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

### [ ] P5-T3 — 挂载（第四插行）+ boot marker + 同步网 3→4

- **产出**：根 `cordis.yml` 第四个 `- insert:` 行（`id: omo-team`）；apply 注册循环骨架 + boot marker（`[omo-team] loaded: …` 汇总行自 manifest 派生）；**同步网同 commit 全点位**：doctor-lite `EXPECTED_INSERT_ROW_IDS`（3→4）、`tests/omo-hooks/cordis-inserts.test.ts`、cold-start、drive.mjs、probe、smoke-real、cordis.yml 头注释计数；`verify-licenses` checked 预期登记（**注意：56→57 的跃迁已在 T2 随 omo-team 包落位发生——本任务复核 checked=57 不变、violations=0 即可，勿误判为漂移**；D18/ROADMAP 回馈文稿随本任务同 commit——首个落地 commit = 本任务，T1 已起草 `.omo/evidence/p5t1/D18-ROADMAP-DRAFT.md`）。
- **做法**：P-8 schema 纪律；loud-but-non-fatal；注册表占位形态 = 空表 + 汇总行计数派生（P3-T3/P4-T3 先例）；D18/ROADMAP 回馈文稿若 T1 已起草，随本任务或首个语义任务同 commit。
- **判定**：✅ cold-start 绿且日志含 omo-team marker；门 4/8 绿；`--dump-config` 含第四行；门 6/7 不回归。
- **证据**：⬜
- **依赖**：P5-T2。**量级**：3 小时。

---

## WP-2 组建与成员模型（计划书 §4.3）

### [ ] P5-T4 — member-validator + inline spec 解析 ⚖️

- **产出**：`src/team/member-validator.ts` + `src/team/team-spec.ts`（纯函数）+ 单测；manifest 条目填入。
- **做法**：资格规则以 roster `class` 为**主输入 + seat id 兜底**（`AgentClass` 四值 = `'read-only'|'worker'|'orchestrator'|'allowlist'`，**无 `conductor`**，`roster.ts:51`；read-only 六席拒入；**atlas（orchestrator）与 multimodal-looker（allowlist）= T1 Q-5 终态均拒**（atlas = 有意收紧：Q-6 实证成员工具面无委派通道、orchestrator 职责在 team 内结构性不可行；multimodal-looker = v4 hard-reject 在册收紧——覆盖基线 §4 已终态）；**sisyphus 无 `class` 字段**（route-only 行，`roster.ts:110-120`），按 seat id 结构性排除）；`UNRESOLVABLE_CATEGORY` 与可用项清单文案（上游可用清单语义——**T1 Q-1 实证 `describePlanError` 在 v4.19.4 不存在**，等价物 = `execute.ts:69-81` 内联 suffix / `execute-batch.ts:95-105` / member-validator 文案，语义对齐，署名头注 `member-validator.ts` 上游路径）；inline spec `{name, members:[{name, category|seat, prompt?}]}` 解析与上游对齐、收窄处（category 释义、无 subagent_type）按 Q-5 终态表实现并记差异。
- **判定**：✅ 资格矩阵全组合单测（**11 席** × 允许/拒绝——含无 class 的 sisyphus 与 allowlist 席的 multimodal-looker，矩阵缺一席即红）；`UNRESOLVABLE_CATEGORY` 文案含可用清单；收窄差异进覆盖基线。
- **证据**：⬜
- **依赖**：P5-T1。**量级**：4 小时。

### [ ] P5-T5 — `team_create` 组建路径 + per-member 路由 ⚖️

- **产出**：`src/tools/team-create.ts`（**fork 已裁 (B)（2026-10-09，FORK.md）：`startContinuable` 直驱 + team 状态机骨架**——~~(A′) = `ctx.agentTeams.spawnTeammate` 逐成员 + provider 适配器~~ Q-3 三重封死链证伪）+ 成员引导（**T1 Q-8 形态裁定写死：成员会话独立注入消息**（hard-blocks-injection 形态，`origin === 'subagent'` 门 + `form:'instructions'`），专属 source kind `omo-team-briefing`，**禁止并入 spawn prompt 正文**——原生 stamp `'user'` 会静默丢专属 kind）+ 单测 + e2e `team-create-and-message` 的组队半段。
- **做法**：引导 = 成员角色/姓名/「不再派生子女」纪律（上游 member guidance 语义移植——omo-opencode 45 行版与 senpi 5 行版均已逐字入档 Q1b §6，择语义对齐）；路由断言面 = 成员 descriptor v3 的 `agentProvider`/`agentModel`/`persona`/`toolFilter`（**(B) 由 startContinuable request 三件套直驱，Q-3 对照组实证逐字承载**）；**嵌套拒绝**：成员工具面结构性无 `team_create` + 服务强制具名拒绝（对齐上游 `TEAM_LEAD_REQUIRED` 语义族——T1 Q-4 实证原生面即「同面 + 执行期具名拒绝」形态），e2e `team-nested-create-denied` 断言具名拒绝。
- **判定**：✅ 门 2/门 3 绿；成员 descriptor 断言名册路由值；嵌套拒绝场景绿且**反向金丝雀**（成员尝试组建不产生任何子会话——`listDescendants` 前后一致）。
- **证据**：⬜
- **依赖**：P5-T4（**(B) 另依赖 T1 Q-3 对照组已证的 raw 通道三件套承载**）。**量级**：1 天。

---

## WP-3 协调语义（计划书 §4.4）

### [ ] P5-T6 — mailbox 采用接线 + 消息工具层 ⚖️

- **产出**：`src/tools/team-message.ts`（`team_send` 语义 → **(B) 已定：原生 `ctx.subagents.sendMessage` 相邻投递——lead↔member 直通；member↔member 非相邻，经 lead 中转并记差异**）+ 广播「仅 lead」工具层纪律（Q-5 已成文）；重投去重 e2e 断言（R-6）。
- **做法**：消息帧格式对齐上游（`Team message <id> from <name>:` 帧语义——**经原生投递的载体承原生 kind `'agent-message'`，omo 自有帧才用 `omo-team-*`**，T1 Q-8 裁定）；离线成员投递 → 醒来的金丝雀断言（fallback-wake 原生覆盖的承重场景，Q-5 终态：原生投递统一经 inbox 准入、无 live-fallback 岔路——Q-5b 实证 warm 唤醒，cold 恢复本任务 e2e 断言）；不移植 `.delivering-` 预约语义，差异成文。
- **判定**：✅ `team-create-and-message` 全段绿（双向消息 + 投递事件对 + 同 id 重投去重断言 + 离线唤醒断言）。
- **证据**：⬜
- **依赖**：P5-T5。**量级**：1 天。

### [ ] P5-T7 — 关停握手与 `team_delete` 语义

- **产出**：`src/tools/team-shutdown.ts` + `src/tools/team-delete.ts`（**Q-5 已裁 = 语义移植**：lead 询问 → 成员批准/拒绝 → interrupt/drain；握手无自动超时与上游同构——超时语义由提示词承担 + closure invariant，Q1a §5.4 实证）；`team_delete` 的「活跃成员拒删，`force:true` 强删」语义（v5 调查报告 §2.1-4；orphaned/deleting 旁路由 (B) 状态机承接）。
- **做法**：**(B) 下 delete 底层 = 原生 `interrupt`（保 inbox）+ continuable drain/disposal 组合**；所有拆除走 §4.5 的断言面；握手状态机单测（request/approve/reject/超时四路——超时路 = 提示词语义的确定性部分 + 状态滞留可观测）。
- **判定**：✅ 单测四路 + e2e 关停场景（**场景名 `team-shutdown-handshake`**——T1 仲裁 canonical 名表，本条与 T14 同注册）（成员拒 → team 存活；批准 → 成员 interrupt 且 inbox 保留断言）。
- **证据**：⬜
- **依赖**：P5-T6。**量级**：4 小时。

---

## WP-4 任务板与生命周期（计划书 §4.5）

### [ ] P5-T8 — 任务板语义映射 + claim 协议

- **产出**：任务板消费层（**(B) 已定：vendored team-tasklist 接线**——子集闭包 = **T2 双评审后终态**：verbatim = types/member-parser/config/logger/tolerant-fsync/**session-client（纯类型）**/team-registry/team-tasklist（除 test-support）/team-state-store（除 **reservation-reconciliation**——`.delivering-` 预约回收不移植落点）；deviation = active-resume.ts（删预约回收调用/helper，**并连删因此成孤儿的 `log` 导入**——:28 唯一调用点随被删 helper 出局，评审登记）；外部依赖 = `zod`（^4.4.3 npm 引入，verify-licenses 白名单核对）+ `@oh-my-opencode/utils` 一件（**isPlainRecord**，store.ts:1 唯一消费点；isRecord 原消费点随 reservation-reconciliation 排除件出局——二选一 vendor/语义移植，deviations 登记）；resume 族的 TeamSessionContext harness 耦合面执行时复核）+ claim 场景 e2e（**场景名 `team-task-claim`**——T1 仲裁 canonical 名表，本条与 T14 同注册）。
- **做法**：上游语义原样随 vendor（锁 + 锁内重读、缺依赖视为可领、无环检测、无 `ready`、**无 `failed` 态**——上游提示词三处与 schema 矛盾，DSH 侧不照抄 `failed` 文案、v1 不增设失败终态，记差异，Q1b N1/N2）；`writeScopeWarnings` 的工具描述文案对齐上游 tasklist 语义；**`tasks/claims/` 与 `.highwatermark` 随 vendor 件自然成立**（T1 更正：Q1b §C-4 实证其为瞬时锁目录 + ID 水位，原「不移植」草案作废，覆盖基线 §1 已回填）。
- **判定**：✅ e2e：lead 建任务 → 成员 claim → `owner`/`claimedAt` 断言 + 依赖未就绪任务 `BlockedByError` 断言（注意：上游缺依赖视为可领，断言须按 vendored 语义钉）。
- **证据**：⬜
- **依赖**：P5-T5。**量级**：4 小时。

### [ ] P5-T9 — 拆除无孤儿 + stop-continuation team 语义

- **产出**：e2e `team-teardown-no-orphans`（**孙代金丝雀 = 负向断言**——T1 Q-6 已裁：成员工具面无委派通道 = **结构性不派生**，断言 `listDescendants` 无 depth≥2 行；不再造孙代）+ `stop-continuation-guard` 消费面扩展（**(B) 形态 = continuable 子女树的 interrupt/drain 分支**（drainContinuableDescendants 族——成员与既有委派子女同族），与既有 jobs 级联并列；注意 guard 同步契约——Q-6 NOTES-7）。
- **做法**：断言面 = `listDescendants(leadSessionId)` 空 + vendored roster 状态清空 + `session/disposed` 对齐；guard 扩展保持既有降级 marker 可区分（Phase 4.5 金丝雀纪律）；**成员再委派 = Q-6 已裁结构性不可能**（9 工具名单无委派工具 + 成员工具面纪律双保险），反向断言钉死。
- **判定**：✅ 门 3 绿；guard 的 team 分支有独立 marker 与反向断言（未触达降级路径）。
- **证据**：⬜
- **依赖**：P5-T6（stop-continuation 面另依赖 Phase 4 的 H-34 服务契约）。**量级**：4 小时。

---

## WP-5 可视化（计划书 §4.6，D4）

### [ ] P5-T10 — 原生面板采用 + L1 断言

- **产出**：**(B) 形态（T1 更正）= 通用面板承载断言**：drive.mjs 的目录/事件断言（成员 = continuable 子女入 `subagent/catalog` 即 subagentchat 可达——Q-7 实证 `establishCatalogChild` 路径；lead 会话 `'agent-message'` 帧事件序列；成员会话内消息帧）+ probe 的 team 面探测 marker（**omo-team 状态机/工具面在场性具名 marker**——状态机未初始化必须响亮，金丝雀纪律，probe 负断言锚点）。
- **做法**：`subagentchat` 面板达成员会话的断言（L1 可断言 catalog/descriptor 资源，肉眼核验归 T16）；**不挂 ui-agent-team**（fork (B)，D18）；T11 触发条件按 (B) 形态复核（仅当通用面板对「team 消息交换」不满足退出标准 a 时触发）。
- **判定**：✅ 门 3/8 绿；probe 含 team marker 双向断言（在场形态 / 缺席具名）。
- **证据**：⬜
- **依赖**：P5-T5。**量级**：4 小时。

### [ ] P5-T11 —（条件任务）自定义 ChatNode 兜底

- **触发条件**：仅当 T10 复核裁定通用面板（subagentchat + lead 会话 `'agent-message'` 帧）对「team 消息交换」不满足退出标准 a。**不触发即整条取消（删除线 + 理由成文），不算未完成**。（T1 Q-7 初步裁定：唤醒轮 turn-trigger 卡 + subagentchat 达成员会话 = 可见性成立，倾向不触发；缺口台账 = 无 mailbox 集中视图（记差异）/ 中途 steer 'context' kind 隐藏（记差异）/ **member↔member 直通 = (B) 形态结构性不存在**（lead 中转语义固化，评审登记——非可见性缺陷，不作触发条件）；T10 复核终定。）
- **产出**：omo-team client face（`ConversationNodeDefinition` 实现 + `ConversationEventRegistry.register` + disposer 纪律）。
- **判定**：✅ `match` 命中目标事件族（**(B) 形态事件族以 T10 裁定为准**——`team/message/*` 是 (A′) 形态事件族，(B) 不挂 bundle 不存在；候选 = `'agent-message'` 帧 / subagentchat 资源事件）；`buildViewNode` 产出可渲染节点；L2 浏览器可见。
- **证据**：⬜
- **依赖**：P5-T10（仅 Q-7 兜底裁定触发）。**量级**：1 天。

---

## WP-6 关键词与 Phase 4 接盘（计划书 §4.7/§4.8）

### [ ] P5-T12 — team 关键词模式接线 + team.md vendor

- **产出**：keyword-detector 的 `team` 槽接线（`TEAM_PATTERN` 命中 → pre-step 注入，source kind `omo-team-keyword`）；**vendor 两项**（T1 Q1b N5 实证扩清单）：`prompts-core/prompts/mode/team.md`（615B 关键词命中单段指令）**+ `skills-loader-core/src/features/builtin-skills/skills/team-mode.ts` 的 `teamModeSkill.template`**（204 行真·lead 运行协议——Closure Contract/工具分权/bounds 全在其中）——playbook 全套（NOTICES/manifest/deviations）；e2e `team-keyword-mode`（注入 + 对照不注入）。
- **做法**：H-33 模块内演进（不新增 hook 条目，`EXPECTED_HOOK_COUNT` 不变——若裁定新增条目则触发 R-8 同步网全网，任务书成文）；注入幂等沿用既有语义；上游载体引用段（worktree/`~/.omo`/tmux）正文保真、适配由工具层文案承担；**成员侧不放行 team 关键词注入**（T1 Q-8 裁定：keyword-detector 子会话过滤链 `keyword-detector.ts:570-621` 六具名 skip 逐字复核后钉死——成员语境由 `omo-team-briefing` 承担，重复注入是噪声）；**vendor 文本已知矛盾登记**（Q1b N1：模板/引导里 `status:"failed"` 是空头指令——core schema 无 `failed`；N9：`delegate_task` vs `delegate-task` 名称漂移——正文保真、deviations 注记，DSH 侧适配文案以 vendored tasklist schema 为准）；**Q-4 NOTES-6 联动**：`vendor/shared-skills/` 的 debugging/refactor 技能文本教 `team_send_message`/`team_task_create` OMO 参数——omo-team 工具面定型后同 commit 加注记或改写（防模型被引向参数必错的调用）。
- **判定**：✅ 门 2/3 绿；vendor 漂移检测绿；`verify-licenses` 计数变化有对应条目。
- **证据**：⬜
- **依赖**：P5-T5（team 工具面在场是注入语义的前提）。**量级**：4 小时。

### [ ] P5-T13 — hyperplan / remove-ai-slops 完整形态升级

- **产出**：omo-commands 两模板的 team 段升级（降级文案 → 完整对抗评审环 / team-mode addendum）；**切换判据 = team 工具在场探测**（运行时可判，不硬编码）；e2e 升级。
- **做法**：模板两处状态的探测函数单测；升级后语义对齐上游模板（v4.19.4 源路径署名头更新）；omo-commands manifest 条目状态与覆盖基线（phase4-commands.md）同 commit 回填。
- **判定**：✅ 门 2/3 绿；team 缺席时降级语义**保持绿**（反向场景——降级路径不许因升级死掉）。
- **证据**：⬜
- **依赖**：P5-T6。**量级**：4 小时。

---

## WP-7 门与 e2e 扩展（计划书 §4.9）

### [ ] P5-T14 — team 场景群补全 + 门扩展

- **产出**：drive.mjs 场景群终态（**canonical 七名**——T1 仲裁定名并已在 T7/T8/T12 同注册：`team-create-and-message` / `team-nested-create-denied` / `team-teardown-no-orphans` / `team-shutdown-handshake`（T7）/ `team-task-claim`（T8）/ `team-keyword-mode` / `stop-continuation-team`）；门 4（第四插行 + team Config schema 校验）；门 6（c 组延续编号：四插行 / omo-team 署名覆盖 / manifest↔文件集合 / vendor 存在性 / **c14 并集扩展裁定**——phase5-team.md 含 H-号段条目时入 `COVERAGE_BASELINE_MDS`，同 commit）；门 8（probe/proofs 扩展）。
- **做法**：每场景含对照断言与反向金丝雀（计划书 §2 纪律）；门扩展只加严；变异反跑自证（门 6 新断言至少一条删行/改行变异实证）。
- **判定**：✅ 8 门全绿；场景 verdict JSON 含明细断言；变异实证记录。
- **证据**：⬜
- **依赖**：P5-T5…P5-T13 全部。**量级**：1.5 天。

---

## WP-8 收口

### [ ] P5-T15 — 合规复核 + 文档双语 + 覆盖基线终态

- **产出**：`THIRD_PARTY_NOTICES.md` Phase 5 小节终态（**(B) 形态 = 语义移植表 + team-core vendor 子集表**）；vendor manifest 漂移复跑；README 双语状态行（team 面 ≠ DAG ≠ 编辑面的措辞纪律沿用 Phase 2/3/4 先例）；CHANGELOG；**D18（fork 已裁 (B)：不采用 experimental team 面登记——依据 = Q-3 三重封死链 + FORK.md）与 ROADMAP Phase 5 措辞修订双语同 commit**；dsh-0.2.0-rc.2 复核报告补「实施期订正」节（Q-2/Q-3/Q-7 的契约事实，双语）；覆盖基线全条目终态。
- **判定**：✅ 门 7 绿（d01–d10 现行断言集）；`verify-licenses` 绿且计数全对应；双语文档行数/结构一致。
- **证据**：⬜
- **依赖**：P5-T14。**量级**：4 小时。

### [ ] P5-T16 — 退出标准核对 + L2 真机

- **产出**：退出标准核对表（下节）全 ✅；L2 证据 `.omo/evidence/p5-l2-*.md`（真实 web boot + 浏览器核验 **subagentchat 面板达成员会话 + lead 会话 `'agent-message'` 帧消息可见**（(B) 形态——无 TeamAction/projection，fork 裁定见 T1）+ 一次真实 3 成员协作 + 拆除核验）。
- **做法**：逐条对照计划书 §5 取证；L2 按 manual-testing 惯例；**「web UI 可见」以浏览器核验为准**，L1 事件/目录断言只作回归网（R-5 纪律）。
- **判定**：✅ 核对表 a/b/c + DoD c/d/e 全 ✅。
- **证据**：⬜
- **依赖**：P5-T15。**量级**：4 小时。

---

## 退出标准核对表（T16 填写）

| # | 标准（计划书 §5） | 证据 | 状态 |
|---|---|---|---|
| a | 3 成员脚本化协作 + web UI 可见消息交换 | L1 场景 + L2 证据文件 | ⬜ |
| b | 嵌套 `team_create` 被拒（具名拒绝 + 零子会话金丝雀） | 场景 + 单测 | ⬜ |
| c | 拆除无孤儿会话（含孙代） | 场景断言 | ⬜ |
| DoD-c | 8 门全绿，只加严 | ci-local 日志 | ⬜ |
| DoD-d | 文档与实测无冲突；fork 裁定回填计划书与 ROADMAP | 修订记录 | ⬜ |
| DoD-e | 署名零移除；计数变化全对应 | verify-licenses 输出 | ⬜ |
