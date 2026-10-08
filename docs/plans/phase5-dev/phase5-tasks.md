# Phase 5 任务清单

> **上游依据**：[开发计划书](./phase5-plan.md) · [team 面清单与覆盖基线](./phase5-team.md) · [ROADMAP Phase 5](../../roadmap_zh-CN.md) · [决策 D14／D17](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 5 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，覆盖基线给出"每条 team 面的处置"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：🚧 **0/16**（2026-10-08 立项）。`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）· ~~删除线~~ = 仲裁取消。
>
> **编号**：`P5-T<n>`（Phase 5 - Task n）。工作包归属见计划书 §7。
>
> **任务书头部规则**（沿用 Phase 4.5 纪律）：每个适配/移植任务的证据栏 = **受影响门 + 场景级记录**；fork 敏感任务（标 ⚖️）必须先把 fork 依据写进证据再动手。

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1 | installed dsh = pin 的 0.2.0-rc.2 | `dsh --version`；doctor-lite 基线 PASS | ⬜ |
| PRE-2 | 基线绿：`scripts/ci-local.sh` 8 门全绿 | 退出 0；记录基线（门 2 测试数、门 3 场景数、门 5 `checked`、门 6 断言数、门 8 proofs 数） | ⬜ |
| PRE-3 | 本地 OMO 检出只读可用 | `git -C ~/GithubRepo/oh-my-openagent rev-parse v4.19.4^{commit}` = `b072d279110bdda2c6ac2525d0d24dc54d16148a`；全程只用 `git show/ls-tree`，工作树不动 | ⬜ |
| PRE-4 | experimental team 四包在实装 dsh 树内 | `ls $DSH \| grep experimental-agent-team` 四包齐（`dsh-experimental-agent-team` / `-tool-` / `-client-ui-` / `-profile`） | ⬜（计划期已核在册，开工实跑复核） |
| PRE-5 | Phase 4 handoff 面在位 | `keyword-detector/constants.ts` 的 `TEAM_PATTERN` 预留位仍在；hyperplan/remove-ai-slops 模板的 team 降级段可定位 | ⬜ |

---

## WP-0 调研钉测（计划书 §4.1/§6，Q-1…Q-8）

### [ ] P5-T1 — team 面全对账 + 原生钉测 + fork 裁定 ⚖️

- **产出**：回填后的 [覆盖基线](./phase5-team.md)（§1 工具对账 / §2 deferred 处置 / §5 待核清单全部转实测）；**fork 裁定书**（(A′)/(B) + 依据，进 `.omo/evidence/p5t1/FORK.md`）；计划书 §4 按实测更正（DoD-d）；fork = (A′) 时起草 **D18 登记文**与 ROADMAP Phase 5 措辞修订（随 T2/T3 首个落地 commit 同发）。
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
- **证据**：`.omo/evidence/p5t1/`（Q 组逐 Q 一份 + `FORK.md`）。
- **依赖**：PRE-1…PRE-5。**量级**：1.5 天。

---

## WP-1 插件骨架（计划书 §4.2）

### [ ] P5-T2 — `omo-team` 包骨架 + `manifest.ts` 单一事实源

- **产出**：`patches/omo-dsh/omo-team/`（`package.json` `@oh-my-opendsh/omo-team` / `tsconfig.host.json`（client face 视 Q-7 裁定补 `tsconfig.client.json`）/ `src/index.ts` 空 apply / `src/manifest.ts`）。
- **做法**：布局镜像 omo-commands（host-only、Node 24 type-stripping、`.ts` 扩展 load-bearing 注释）；manifest 条目 = T1 后的移植/采用清单（形状：id / 上游源路径 / 原生面对应 / 处置枚举（`native-adopt`/`ported`/`recorded-difference`）/ e2e 场景名 / 状态）；派生函数供 boot marker 与一致性测试。
- **判定**：✅ `pnpm typecheck` 绿；manifest 形状单测（空字段 throw、id 唯一、处置枚举合法）；typecheck 链扩展。
- **证据**：⬜
- **依赖**：P5-T1。**量级**：3 小时。

### [ ] P5-T3 — 挂载（第四插行）+ boot marker + 同步网 3→4

- **产出**：根 `cordis.yml` 第四个 `- insert:` 行（`id: omo-team`）；apply 注册循环骨架 + boot marker（`[omo-team] loaded: …` 汇总行自 manifest 派生）；**同步网同 commit 全点位**：doctor-lite `EXPECTED_INSERT_ROW_IDS`（3→4）、`tests/omo-hooks/cordis-inserts.test.ts`、cold-start、drive.mjs、probe、smoke-real、cordis.yml 头注释计数；`verify-licenses` checked 56→57 预期登记。
- **做法**：P-8 schema 纪律；loud-but-non-fatal；注册表占位形态 = 空表 + 汇总行计数派生（P3-T3/P4-T3 先例）；D18/ROADMAP 回馈文稿若 T1 已起草，随本任务或首个语义任务同 commit。
- **判定**：✅ cold-start 绿且日志含 omo-team marker；门 4/8 绿；`--dump-config` 含第四行；门 6/7 不回归。
- **证据**：⬜
- **依赖**：P5-T2。**量级**：3 小时。

---

## WP-2 组建与成员模型（计划书 §4.3）

### [ ] P5-T4 — member-validator + inline spec 解析 ⚖️

- **产出**：`src/team/member-validator.ts` + `src/team/team-spec.ts`（纯函数）+ 单测；manifest 条目填入。
- **做法**：资格规则以 roster `class` 为**主输入 + seat id 兜底**（`AgentClass` 四值 = `'read-only'|'worker'|'orchestrator'|'allowlist'`，**无 `conductor`**，`roster.ts:51`；read-only 六席拒入；atlas（orchestrator）与 multimodal-looker（allowlist）按 Q-5 裁定；**sisyphus 无 `class` 字段**（route-only 行，`roster.ts:110-120`），按 seat id 结构性排除）；`UNRESOLVABLE_CATEGORY` 与可用项清单文案（`describePlanError` 语义移植，署名头注 `member-validator.ts` 上游路径）；inline spec `{name, members:[{name, category|seat, prompt?}]}` 解析与上游对齐、收窄处（category 释义、无 subagent_type）按 Q-5 终态表实现并记差异。
- **判定**：✅ 资格矩阵全组合单测（**11 席** × 允许/拒绝——含无 class 的 sisyphus 与 allowlist 席的 multimodal-looker，矩阵缺一席即红）；`UNRESOLVABLE_CATEGORY` 文案含可用清单；收窄差异进覆盖基线。
- **证据**：⬜
- **依赖**：P5-T1。**量级**：4 小时。

### [ ] P5-T5 — `team_create` 组建路径 + per-member 路由 ⚖️

- **产出**：`src/tools/team-create.ts`（(A′) = `ctx.agentTeams.spawnTeammate` 逐成员 + provider 适配器注册模块 `src/team/provider-adapters.ts`；(B) = `startContinuable` 直驱 + team 状态机骨架）+ 成员引导前缀（专属 source kind `omo-team-briefing`）+ 单测 + e2e `team-create-and-message` 的组队半段。
- **做法**：引导前缀 = 成员角色/姓名/「不再派生子女」纪律（上游 member guidance 语义移植）；路由断言面 = 成员 descriptor v3 的 `agentProvider`/`agentModel`/`persona`/`toolFilter`；**嵌套拒绝**：成员工具面无 `team_create` + 服务强制的逐字对齐（Q-4），e2e `team-nested-create-denied` 断言具名拒绝；fork 形态差异只准出现在适配层，工具语义两形态同构。
- **判定**：✅ 门 2/门 3 绿；成员 descriptor 断言名册路由值；嵌套拒绝场景绿且**反向金丝雀**（成员尝试组建不产生任何子会话——`listDescendants` 前后一致）。
- **证据**：⬜
- **依赖**：P5-T4（(A′) 另依赖 Q-3 钉测通过的 provider 适配器形态）。**量级**：1 天。

---

## WP-3 协调语义（计划书 §4.4）

### [ ] P5-T6 — mailbox 采用接线 + 消息工具层 ⚖️

- **产出**：`src/tools/team-message.ts`（`team_send` 语义 → (A′) 原生 `sendMessage`；(B) = 相邻约束下的 lead 中转——member↔member 非相邻，经 lead 转发并记差异）；广播差异与「仅 lead 广播」纪律的处置按 Q-5 成文落地；重投去重 e2e 断言（R-6）。
- **做法**：消息帧格式对齐上游（`Team message <id> from <name>:` 为原生帧——omo 侧追加帧一律专属 kind）；离线成员投递 → 醒来的金丝雀断言（fallback-wake 原生覆盖的实证点，Q-5 划掉结论的承重场景）；不移植 `.delivering-` 预约语义，差异成文。
- **判定**：✅ `team-create-and-message` 全段绿（双向消息 + `queued→delivered` 事件对 + 同 id 重投去重断言 + 离线唤醒断言）。
- **证据**：⬜
- **依赖**：P5-T5。**量级**：1 天。

### [ ] P5-T7 — 关停握手与 `team_delete` 语义

- **产出**：`src/tools/team-shutdown.ts` + `src/tools/team-delete.ts`（Q-5 裁定：握手 = 语义移植（lead 询问 → 成员批准/拒绝 → interrupt/drain），或记差异）；`team_delete` 的「活跃成员拒删，`force:true` 强删」语义（v5 调查报告 §2.1-4）。
- **做法**：(A′) 下 delete 底层 = 原生 disposal/interrupt 组合；所有拆除走 §4.5 的断言面；握手状态机单测（request/approve/reject/超时四路）。
- **判定**：✅ 单测四路 + e2e 关停场景（成员拒 → team 存活；批准 → 成员 interrupt 且 inbox 保留断言）。
- **证据**：⬜
- **依赖**：P5-T6。**量级**：4 小时。

---

## WP-4 任务板与生命周期（计划书 §4.5）

### [ ] P5-T8 — 任务板语义映射 + claim 协议

- **产出**：任务板消费层（(A′) = 原生 `team_task_*` 工具直通 + omo 语义文案；(B) = vendored team-tasklist 接线）+ claim 场景 e2e（`status:"claimed"` 映射 `updateTask{action:'claim'}`）。
- **做法**：CAS `expectedRevision`、依赖 DAG 校验（缺/重/环拒）、`ready` 派生、`writeScopeWarnings` 的工具描述文案对齐上游 tasklist 语义；`tasks/claims/` 与 `.highwatermark` 不移植的理由进覆盖基线。
- **判定**：✅ e2e：lead 建任务 → 成员 claim → `ownerName` 断言 + 依赖未就绪任务 `ready=false` 断言。
- **证据**：⬜
- **依赖**：P5-T5。**量级**：4 小时。

### [ ] P5-T9 — 拆除无孤儿 + stop-continuation team 语义

- **产出**：e2e `team-teardown-no-orphans`（含孙代金丝雀：成员放行委派 atlas 时造孙代，断言孙代同被收走）+ `stop-continuation-guard` 消费面扩展（team roster 的 interrupt/drain 分支，与既有 jobs 级联并列）。
- **做法**：断言面 = `listDescendants(leadSessionId)` 空 + roster projection 空 + `session/disposed` 对齐；guard 扩展保持既有降级 marker 可区分（Phase 4.5 金丝雀纪律）；**成员再委派的放行与否按 Q-6 裁定**（上游 = 引导不委派非硬闸——孙代金丝雀仅在放行裁定下适用，否则改为断言委派被拒）。
- **判定**：✅ 门 3 绿；guard 的 team 分支有独立 marker 与反向断言（未触达降级路径）。
- **证据**：⬜
- **依赖**：P5-T6（stop-continuation 面另依赖 Phase 4 的 H-34 服务契约）。**量级**：4 小时。

---

## WP-5 可视化（计划书 §4.6，D4）

### [ ] P5-T10 — 原生面板采用 + L1 断言

- **产出**：`ui-agent-team` 行挂载（Q-4/Q-7 裁定的落点）+ drive.mjs 的 projection/事件断言（`agentTeam` projection 的 members/tasks 形状、`team/message/*` 事件序列）+ probe 的 team 面探测 marker。
- **做法**：面板行挂载与既有 client 行的共存核对；`subagentchat` 面板达成员会话的断言（L1 可断言资源协议注册，肉眼核验归 T16）；**服务缺席具名 marker**（`agentTeams` 不在场时 boot 响亮——金丝雀纪律，probe 负断言锚点）。
- **判定**：✅ 门 3/8 绿；probe 含 team marker 双向断言（在场形态 / 缺席具名）。
- **证据**：⬜
- **依赖**：P5-T5。**量级**：4 小时。

### [ ] P5-T11 —（条件任务）自定义 ChatNode 兜底

- **触发条件**：仅当 Q-7 裁定原生面板对「team 消息交换」不可见。**不触发即整条取消（删除线 + 理由成文），不算未完成**。
- **产出**：omo-team client face（`ConversationNodeDefinition` 实现 + `ConversationEventRegistry.register` + disposer 纪律）。
- **判定**：✅ `match` 命中 `team/message/*`；`buildViewNode` 产出可渲染节点；L2 浏览器可见。
- **证据**：⬜
- **依赖**：P5-T10（仅 Q-7 兜底裁定触发）。**量级**：1 天。

---

## WP-6 关键词与 Phase 4 接盘（计划书 §4.7/§4.8）

### [ ] P5-T12 — team 关键词模式接线 + team.md vendor

- **产出**：keyword-detector 的 `team` 槽接线（`TEAM_PATTERN` 命中 → pre-step 注入，source kind `omo-team-keyword`）；`prompts-core/prompts/mode/team.md` **内容 vendor**（playbook 全套：NOTICES/manifest/deviations）；e2e `team-keyword-mode`（注入 + 对照不注入）。
- **做法**：H-33 模块内演进（不新增 hook 条目，`EXPECTED_HOOK_COUNT` 不变——若裁定新增条目则触发 R-8 同步网全网，任务书成文）；注入幂等沿用既有语义；上游载体引用段（worktree/`~/.omo`/tmux）正文保真、适配由工具层文案承担。
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

- **产出**：drive.mjs 场景群终态（`team-create-and-message` / `team-nested-create-denied` / `team-teardown-no-orphans` / `team-keyword-mode` / `stop-continuation-team` + T8 claim 场景）；门 4（第四插行 + team Config schema 校验）；门 6（c 组延续编号：四插行 / omo-team 署名覆盖 / manifest↔文件集合 / vendor 存在性 / **c14 并集扩展裁定**——phase5-team.md 含 H-号段条目时入 `COVERAGE_BASELINE_MDS`，同 commit）；门 8（probe/proofs 扩展）。
- **做法**：每场景含对照断言与反向金丝雀（计划书 §2 纪律）；门扩展只加严；变异反跑自证（门 6 新断言至少一条删行/改行变异实证）。
- **判定**：✅ 8 门全绿；场景 verdict JSON 含明细断言；变异实证记录。
- **证据**：⬜
- **依赖**：P5-T5…P5-T13 全部。**量级**：1.5 天。

---

## WP-8 收口

### [ ] P5-T15 — 合规复核 + 文档双语 + 覆盖基线终态

- **产出**：`THIRD_PARTY_NOTICES.md` Phase 5 小节终态；vendor manifest 漂移复跑；README 双语状态行（team 面 ≠ DAG ≠ 编辑面的措辞纪律沿用 Phase 2/3/4 先例）；CHANGELOG；D18（若 fork=(A′)/(B) 采用/弃用 experimental 面）与 ROADMAP Phase 5 措辞修订**双语同 commit**；dsh-0.2.0-rc.2 复核报告补「实施期订正」节（Q-2/Q-3/Q-7 的契约事实，双语）；覆盖基线全条目终态。
- **判定**：✅ 门 7 绿（d01–d10 现行断言集）；`verify-licenses` 绿且计数全对应；双语文档行数/结构一致。
- **证据**：⬜
- **依赖**：P5-T14。**量级**：4 小时。

### [ ] P5-T16 — 退出标准核对 + L2 真机

- **产出**：退出标准核对表（下节）全 ✅；L2 证据 `.omo/evidence/p5-l2-*.md`（真实 web boot + 浏览器核验 TeamAction 面板与成员会话消息可见 + 一次真实 3 成员协作 + 拆除核验）。
- **做法**：逐条对照计划书 §5 取证；L2 按 manual-testing 惯例；**「web UI 可见」以浏览器核验为准**，projection 断言只作回归网（R-5 纪律）。
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
