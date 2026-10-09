// manifest.ts — Phase 5 SINGLE source of truth for the 24-row team-surface
// roster (docs/plans/phase5-dev/phase5-plan.md §4.2; task P5-T2; data tables
// docs/plans/phase5-dev/phase5-team.md §1 工具面对账 + §3 handoff 面 +
// fork 裁定书 .omo/evidence/p5t1/FORK.md §3.3 vendor 子集).
//
// 形态镜像 omo-hooks / omo-commands manifest 先例（P3-T2 / P4-T2 同款骨架）：
// 本文件在 P5-T2 阶段**不含任何上游代码**，只有声明式事实与注释。逐条行的
// 「上游源文件 tag 相对路径」在下面的行注释与 upstreamSources 数组里；引用
// 上游语义处只写 v4.19.4 tag 相对路径（anchor commit
// b072d279110bdda2c6ac2525d0d24dc54d16148a，PRE-1/PRE-3 冻结基线）。
//
// WHY THIS FILE EXISTS (plan §4.2). team 面知识——哪些 `team_*` 工具是移植、
// 哪些是 vendor、哪些记差异，上游哪个文件承载语义，(B) 形态落在哪个原生面，
// 哪个 e2e 场景证明它，是否已完成——在此**声明一次**。在此之前每个消费方都要
// 复述其中一片：T3 的 boot marker 需要逐行 id 与汇总计数；门 6 的静态门要拿
// manifest 对 `src/tools/`、`src/team/`、`vendor/team-core/` 文件集合做双向
// 核对（T14 扩展）；一致性单测要拿它对 phase5-team.md §1/§3 的终态表；e2e
// 套件按名字取场景。这是 omo-agents roster.ts / omo-hooks manifest.ts /
// omo-commands manifest.ts 的先例：一个手写表，所有消费方派生——本文件正是
// T3 boot marker、门 6 静态门、一致性单测与 e2e 场景名的**共同派生源**。
//
// DATA PROVENANCE — T1 实测证据包，非计划值。本表逐行数据来自三个已仲裁的
// 事实源（全部 2026-10-09 定稿，仲裁者亲核见 .omo/evidence/p5t1/ARBITRATION.md）：
//   ① `.omo/evidence/p5t1/`（Q1a/Q1b/Q2/Q3/Q4/Q6/Q7/Q8）——`upstreamSources`
//      的每个 tag 相对路径都出自 T1 调查员的只读命令族（本任务复跑核对）：
//        git -C <omo> ls-tree -r --name-only v4.19.4 -- packages/team-core/      # vendor 子集树
//        git -C <omo> ls-tree -r --name-only v4.19.4 -- packages/omo-opencode/src/features/team-mode/
//        git -C <omo> ls-tree -r --name-only v4.19.4 -- packages/omo-opencode/src/hooks/team-tool-gating/
//      注意两处实测事实：`features/team-mode/team-tasklist/*.ts` 只是
//      `@oh-my-opencode/team-core/team-tasklist/*` 的 re-export 壳（故任务板
//      行的语义源记 team-core 本尊）；`team-tool-gating/` 住在 `hooks/` 下而
//      不在 `features/team-mode/` 下（§1 表的简写 `team-tool-gating/hook.ts`
//      补全为 `packages/omo-opencode/src/hooks/team-tool-gating/hook.ts`）。
//   ② phase5-team.md（T1 实测终态覆盖基线）——§1 表逐行的「OMO v4.19.4 来源」
//      列 → upstreamSources；「处置（终态）」列 → disposition；「fork (B) 实现
//      面」列 → nativeFace。§3 表四行 → 接盘组。
//   ③ FORK.md（fork = (B) 裁定书）——§3.3 vendor 子集闭包 → vendor 组 7 行；
//      §3.2 成员创建 = startContinuable、§3.4 协调 = 原生 sendMessage 相邻投递，
//      是 (B) 形态 nativeFace 的定形依据。**闭包经 T2 双评审 32 文件 import 全
//      分析更正（原 Q1b N6 三件闭包不完整）**——FORK.md §3.3 与计划书 §4.1 已按
//      终态更正（verbatim 补 session-client.ts；排除 reservation-reconciliation.ts；
//      deviation = active-resume.ts；外部依赖登记 zod 与 @oh-my-opencode/utils 两件），
//      本表随行同步。
//
// ONE-WAY SYNC DISCIPLINE. phase5-team.md 是人读覆盖基线，本文件是机器读的
// 那一份，二者携带**同一批事实**：行与基线 §1/§3 一一对应（每行注释点名其基线
// 行）。落地时的**编辑顺序**是：phase5-team.md（文档是可审计记录）→ 本 manifest
// （status/e2eScenario）→ 实现代码。绝不反过来：只改 manifest 会让派生门去核对
// 一份已与现实脱节的文档，正是计划书 §4.2 单一事实源规则要防的漂移。
//
// DISPOSITION 枚举 = T1 更正后的四值（计划书 §4.2 已改）：'native-adopt' /
// 'ported' / 'content-vendor' / 'recorded-difference'。映射按 §1/§3 表终态列：
// 语义移植→ported、内容 vendor(+接线)→content-vendor、记差异→recorded-difference、
// 原生采用→native-adopt。**'native-adopt' 今日零行是有意的**：§1 表在 fork (B)
// 下没有任何「零移植原生覆盖」的工具行（原生 9 scoped 工具整体不采用，D18），
// 原生覆盖的事实住在覆盖基线 §2（S-07/S-09）而非本表；若未来某行改判
// native-adopt，覆盖基线先行、本表随行，四值词表不变。
//
// STATUS 是**封闭**联合，镜像 omo-commands manifest 的状态纪律（数据先行、
// `(typeof X)[number]` 派生、闭合联合让笔误在本文件行里即编译错误）：
//   'pending'  — 已声明，交付面（代码 + 单测 + 该行点名的 e2e 场景）未齐；
//                T2 骨架阶段所有 ported / content-vendor 行都是这个值。
//   'ported'   — ported 与 content-vendor 两类的共同终态：该行的交付面（语义
//                移植代码，或 vendor 件 + 接线）+ 单测 + e2e 三者齐备。
//   'recorded' — recorded-difference 行的终态：**差异本身就是交付面**，已成文
//                于覆盖基线与本行注释，无代码交付物——所以 team_list / team_wait
//                两行在 T2 即诚实终态（'recorded'），不与 pending 混写。
// 与 omo-hooks 的开放字符串 status 不同是有意的（omo-hooks 的词汇嵌场景名，
// 闭合联合拼不出；本表词汇恰好三枚，同 omo-commands 情形）。
//
// upstreamSources 的非空检查对 recorded-difference 行**显式豁免**（见
// validateManifest 检查 5 的注释）：team_wait 在 v4.19.4 的 12 工具名单中根本
// 不存在（Q-1 复核；v5 已删），一行「记差异」没有上游文件可指是事实，不是偷懒。
// 豁免只对 recorded-difference 开放——其余任何行空数组即 throw。
//
// e2e 场景名从 canonical 七名指派——**canonical 七名 = T1 仲裁定名，任务书
// P5-T2 条已登记全集、T7（team-shutdown-handshake）/T8（team-task-claim）/T14
// 同注册**：team-create-and-message / team-nested-create-denied /
// team-teardown-no-orphans / team-shutdown-handshake / team-task-claim /
// team-keyword-mode / stop-continuation-team。24 行对 7 名必然
// 多行共享一名（omo-commands 先例：无自有场景的行指最相关者）；唯一未被任何行
// 指用的 canonical 名是 `team-nested-create-denied`——它证明的是 team_create 行的
// 嵌套拒绝半边（T5），一行只有一个 e2eScenario 字段，主场景归
// team-create-and-message，嵌套半边由 T5 任务书与 drive.mjs 钉。
//
// TEMPLATE-LITERAL TYPES ARE LOAD-BEARING, NOT DECORATION.（沿用两包 manifest
// 头部同款纪律）`TeamManifestDisposition` / `TeamManifestStatus` 由下面的运行时
// 常量数组用 `(typeof X)[number]` 派生，不重打字面量列表——那会让两处「合法值」
// 漂移；运行时集合 `teamDispositionSet` / `teamStatusSet` 是 validateManifest
// 唯一核对的清单（负向单测因此必须加宽结构改写，见 tests/omo-team/
// manifest.test.ts 头部）。
//
// NO SEPARATE TYPES MODULE. 行接口需要 disposition/status 联合，而联合由本文件
// 的数组派生、数组的 satisfies 子句又需要接口——互相引用的声明序保持单文件
// 单遍；拆 `manifest-types.ts` 要么重打联合（两表可漂移）要么造 import 环。

/**
 * 每一行 `disposition` 可声明的处置词表（T1 更正后四值，计划书 §4.2）。
 * 顺序 = 覆盖基线处置枚举的读序（原生采用→移植→vendor→记差异）。
 */
export const TEAM_MANIFEST_DISPOSITIONS = [
  'native-adopt',
  'ported',
  'content-vendor',
  'recorded-difference',
] as const

/**
 * 每一行 `status` 可声明的状态词表——封闭三值，语义见本文件头部
 * 「STATUS 是**封闭**联合」段。
 */
export const TEAM_MANIFEST_STATUSES = ['pending', 'ported', 'recorded'] as const

/** 每一行 `disposition` 可声明的处置。 */
export type TeamManifestDisposition = (typeof TEAM_MANIFEST_DISPOSITIONS)[number]

/** 每一行 `status` 可声明的状态。 */
export type TeamManifestStatus = (typeof TEAM_MANIFEST_STATUSES)[number]

/**
 * 集合形态。导出的理由与两包先例的 manifestEventSet / commandStatusSet 相同：
 * validateManifest 需要集合对象，若在每个调用点重新 derive，两处「合法值」的
 * 写法就会各写各的（P2-T17 sentinel-list 先例）。
 */
export const teamDispositionSet: ReadonlySet<string> = new Set<string>(TEAM_MANIFEST_DISPOSITIONS)

/** 集合形态（见 teamDispositionSet）。 */
export const teamStatusSet: ReadonlySet<string> = new Set<string>(TEAM_MANIFEST_STATUSES)

/**
 * 一行 team 面声明（计划书 §4.2 行形状：id / upstreamSources / nativeFace /
 * disposition / e2eScenario / status / summary）。字段理由在本文件头部与各行
 * 注释里；接口导出，使行表与单测 fixture 共用**同一形状**。
 */
export interface TeamManifestEntry {
  /**
   * 行 id：工具行 = 上游工具名原样（`team_create` 等 snake_case——本仓工具
   * 契约基线 = omo-opencode 12 工具面，§1 头部钉死，工具名即契约名）；接盘行
   * 与 vendor 行 = kebab-case 语义 id（任务书 P5-T2 的命名）。
   */
  readonly id: string
  /**
   * 上游 v4.19.4 tag 相对路径，承载该行语义的文件（§1 表「OMO v4.19.4 来源」
   * 列的补全形态；不含 `AGENTS.md`——N-03 纪律；不含测试文件——本表的测试
   * 种子登记处是覆盖基线与各行注释，不是逐文件列）。recorded-difference 行
   * 可为空数组（显式豁免，见头部与 validateManifest 检查 5）。
   */
  readonly upstreamSources: readonly string[]
  /** fork (B) 形态落点（§1 表「fork (B) 实现面」列口径）——该行落在哪个原生面/自建面上。永不为空串。 */
  readonly nativeFace: string
  /** 处置枚举（四值，见头部 DISPOSITION 段）。 */
  readonly disposition: TeamManifestDisposition
  /** 计划 mock-LLM e2e 场景名（canonical 七名之一；多行可共享一名，见头部）。 */
  readonly e2eScenario: string
  /** 状态（封闭三值，见头部 STATUS 段）。 */
  readonly status: TeamManifestStatus
  /** 效果/处置摘要（phase5-team.md 终态列的机读浓缩）。 */
  readonly summary: string
}

/**
 * 本表行数 = 12 工具面行 + team_wait 差异行（§1 表展开，`team_task_list /
 * team_task_get` 合行拆两行）+ §3 接盘 4 行 + FORK.md §3.3 vendor 子集
 * 7 行 = 24。命名并导出，让这个期望值只写一次，validateManifest 据此拒绝
 * 被删行/超长行——「24 行真的存在」的守卫就是本常量（检查 0）加 id 唯一性。
 */
export const EXPECTED_TEAM_MANIFEST_COUNT = 24

/**
 * 24 行 team 面表，顺序 = phase5-team.md §1 表行序（12 工具 + team_wait）
 * → §3 表行序（4 接盘）→ FORK.md §3.3 子集序（7 vendor），使 boot marker 日志
 * 确定、与覆盖基线的逐行 diff 是一行一行的读法。
 * 展开规则：**合行拆两行按上游注册表序**（tool-registry-team-tools.ts 注册序：
 * team_task_create→team_task_list→team_task_update→team_task_get→team_status→
 * team_list，…list→update→get…，故 ⑩ 行 8 拆分之二 team_task_get 排在 ⑨ 行 9
 * team_task_update 之后；§1 行号序列 1..7,8,9,8,10.. 非单调是有意的，每行另有
 * 显式『§1 行 N』锚点，逐行 diff 无歧义）。
 *
 * `as const` STAYS ON THE AUTHORED TABLE; CONSUMERS GET THE DECLARED SHAPE.
 * （omo-hooks manifest :936-938 同款化解句——omo-commands/omo-hooks 现状同款，
 * 化解原「WIDENED, NOT `as const`」措辞与本表末尾 `as const satisfies` 子句的
 * 自相矛盾）`as const` **留在本作者表上**供编写期检查：`satisfies
 * readonly TeamManifestEntry[]` 子句检查形状与每个字面量（非法枚举值 / 错类型在
 * 这里即编译错误），字面量 id 推导喂给下方 `TEAM_IDS` 的派生行；**消费方拿的
 * 是声明形状**——导出的 `TEAM_MANIFEST: readonly TeamManifestEntry[]` 与
 * `TEAM_IDS: readonly string[]` 是刻意宽化，关键消费方 validateManifest **必须**
 * 能接受畸形行以便拒绝它们——导出侧若被窄化成字面量类型，「空 id / 非法
 * disposition」这些负向单测将无法书写。
 */
const MANIFEST_ROWS = [
  // ── §1 工具面对账组（12 工具 + team_wait）─────────────────────────────────
  // ① phase5-team.md §1 行 1。inline spec `{name, members:[{name, category|seat,
  // prompt?}]}`；`teamName` 命名 spec 注册表面与 `leadSessionId` override 两项
  // **记差异**（DSH 无 spec 注册表面；lead 恒为当前会话）——差异随本行落地成文。
  // gating 源在 `hooks/team-tool-gating/`（§1 简写的补全，实测路径）。
  {
    id: 'team_create',
    upstreamSources: [
      'packages/omo-opencode/src/features/team-mode/tools/lifecycle-create-tool.ts',
      'packages/omo-opencode/src/hooks/team-tool-gating/hook.ts',
    ],
    nativeFace: 'omo-team 工具层 → ctx.subagents.startContinuable 逐成员三件套（名册席值，Q-3 对照组实证 descriptor 全承载）',
    disposition: 'ported',
    e2eScenario: 'team-create-and-message',
    status: 'pending',
    summary:
      '组建命令：inline spec 解析 + member-validator（T4）+ 逐成员路由（T5）；嵌套拒绝 = 成员工具面无 team_create + 服务具名拒绝（TEAM_LEAD_REQUIRED 语义族）；teamName/leadSessionId 记差异',
  },
  // ② §1 行 2。「活跃成员拒删，force:true 强删」纪律逐字对齐（DELETABLE_MEMBER_
  // STATUSES 语义）；orphaned/deleting 旁路 = (B) 状态机骨架承接（T7）。
  {
    id: 'team_delete',
    upstreamSources: [
      'packages/omo-opencode/src/features/team-mode/tools/lifecycle-shutdown-tools.ts',
      'packages/omo-opencode/src/features/team-mode/team-runtime/delete-team.ts',
    ],
    nativeFace: 'omo-team 工具层纪律 + 原生 interrupt（保 inbox）+ continuable drain/disposal 组合',
    disposition: 'ported',
    e2eScenario: 'team-teardown-no-orphans',
    status: 'pending',
    summary:
      '拆除命令：拒活跃除非 force 的纪律移植；底层 = 原生 interrupt 保 inbox + continuable drain/disposal（T7/T9 断言面 listDescendants 空 + roster 清空）',
  },
  // ③ §1 行 3。lead-only 为代码实证（lifecycle-shutdown-tools.ts:74）；握手
  // 语义源 = team-runtime/shutdown.ts:13-55；senpi 握手消息语义作参考
  // （senpi-task/src/team/shutdown.ts:72-101，两套面并存于 v4.19.4，§1 头部）。
  {
    id: 'team_shutdown_request',
    upstreamSources: [
      'packages/omo-opencode/src/features/team-mode/tools/lifecycle-shutdown-tools.ts',
      'packages/omo-opencode/src/features/team-mode/team-runtime/shutdown.ts',
      'packages/senpi-task/src/team/shutdown.ts',
    ],
    nativeFace: 'omo-team 握手状态机（vendored team-state-store 存 shutdownRequests）+ 询问消息经原生投递',
    disposition: 'ported',
    e2eScenario: 'team-shutdown-handshake',
    status: 'pending',
    summary:
      '关停请求（lead-only）：幂等、无自动超时——超时语义由提示词承担（上游同构，Q1a §5.4）；询问消息走原生 sendMessage（T7）',
  },
  // ④ §1 行 4。approve 路径：shutdown.ts:57-107 → interrupt + drain，
  // inbox 保留是 e2e 断言面（T7）。
  {
    id: 'team_approve_shutdown',
    upstreamSources: [
      'packages/omo-opencode/src/features/team-mode/tools/lifecycle-shutdown-tools.ts',
      'packages/omo-opencode/src/features/team-mode/team-runtime/shutdown.ts',
    ],
    nativeFace: '握手状态机：批准后 → 原生 interrupt + drain（inbox 保留断言）',
    disposition: 'ported',
    e2eScenario: 'team-shutdown-handshake',
    status: 'pending',
    summary: '关停批准（lead 或目标成员）：批准 → interrupt + drain，成员 inbox 保留（T7 单测四路之一）',
  },
  // ⑤ §1 行 5。reject 路径：shutdown.ts:109-148；reason 必填是上游 schema
  // 事实，随语义移植。
  {
    id: 'team_reject_shutdown',
    upstreamSources: [
      'packages/omo-opencode/src/features/team-mode/tools/lifecycle-shutdown-tools.ts',
      'packages/omo-opencode/src/features/team-mode/team-runtime/shutdown.ts',
    ],
    nativeFace: '握手状态机：拒绝（reason 必填）→ team 存活、成员不 interrupt',
    disposition: 'ported',
    e2eScenario: 'team-shutdown-handshake',
    status: 'pending',
    summary: '关停拒绝（lead 或目标成员，reason 必填）：拒 → team 存活（T7 e2e「成员拒 → team 存活」半边）',
  },
  // ⑥ §1 行 6。fire-and-forget；to:"*" 广播 lead-only；MESSAGE_TOOL_KINDS =
  // message/announcement；correlationId/summary/references。错误族
  // （BroadcastNotPermittedError/PayloadTooLargeError/RecipientBackpressureError/
  // DuplicateMessageIdError）住 team-core/team-mailbox/send.ts——**mailbox 本体
  // 不 vendor**（FORK.md §3.3，原生 inbox 替代），错误族在工具层按上游语义重述。
  // `.delivering-` 预约/TTL **记差异**（原生 steer 推送无预约族，Q-5b 金丝雀）。
  {
    id: 'team_send_message',
    upstreamSources: [
      'packages/omo-opencode/src/features/team-mode/tools/messaging.ts',
      'packages/team-core/src/team-mailbox/send.ts',
    ],
    nativeFace: '原生 ctx.subagents.sendMessage 相邻投递（lead↔member 直通；member↔member 非相邻 → lead 中转，记差异）；广播 = 工具层「仅 lead」纪律',
    disposition: 'ported',
    e2eScenario: 'team-create-and-message',
    status: 'pending',
    summary:
      '消息工具：帧格式 `Team message <id> from <name>:` 语义对齐；kind 载体——经原生投递承原生 \'agent-message\'，omo 自有帧 omo-team-*（Q-8）；同 id 重投去重 + 离线唤醒金丝雀（T6）；.delivering- 预约/TTL 记差异',
  },
  // ⑦ §1 行 7。`.highwatermark` 水位语义随 vendored store.ts 自然成立
  // （Q1b §C-4：瞬时锁目录 + ID 水位，原「不移植」草案作废）。
  {
    id: 'team_task_create',
    upstreamSources: [
      'packages/omo-opencode/src/features/team-mode/tools/tasks.ts',
      'packages/team-core/src/team-tasklist/store.ts',
    ],
    nativeFace: 'vendored team-tasklist（harness-neutral 子集）+ omo-team 工具薄壳',
    disposition: 'content-vendor',
    e2eScenario: 'team-task-claim',
    status: 'pending',
    summary:
      '任务创建：上游语义原样随 vendor（锁 + 锁内重读、无 revision-CAS、无 failed 态，Q1b N1/N2）；比原生弱的治理差异已在 T1 成文，v1 不增设失败终态',
  },
  // ⑧ §1 行 8（合行拆分之一）：tasks.ts:97-151 的 list 半边。
  {
    id: 'team_task_list',
    upstreamSources: ['packages/omo-opencode/src/features/team-mode/tools/tasks.ts'],
    nativeFace: 'vendored team-tasklist 读取 + 工具薄壳',
    disposition: 'content-vendor',
    e2eScenario: 'team-task-claim',
    status: 'pending',
    summary: '任务列表读取：随 vendored team-tasklist 语义（无 ready 派生——上游事实，不照抄原生 ready）',
  },
  // ⑨ §1 行 9。claim 路由：status:"claimed" → vendored claimTask；
  // AlreadyClaimedError/BlockedByError；claim 锁 300s；cross-owner 拒。
  // 上游「缺依赖视为可领」——e2e 断言按 vendored 语义钉（T8 判定原文）。
  {
    id: 'team_task_update',
    upstreamSources: [
      'packages/omo-opencode/src/features/team-mode/tools/tasks.ts',
      'packages/team-core/src/team-tasklist/claim.ts',
      'packages/team-core/src/team-tasklist/update.ts',
      'packages/team-core/src/team-tasklist/dependencies.ts',
    ],
    nativeFace: 'vendored team-tasklist claim/update + 工具薄壳',
    disposition: 'content-vendor',
    e2eScenario: 'team-task-claim',
    status: 'pending',
    summary:
      '任务更新：claimed → vendored claimTask（owner/claimedAt 断言）；AlreadyClaimedError/BlockedByError 族随 vendor；依赖未就绪 BlockedByError 按 vendored 语义钉',
  },
  // ⑩ §1 行 8（合行拆分之二）：tasks.ts:97-151 的 get 半边。
  {
    id: 'team_task_get',
    upstreamSources: ['packages/omo-opencode/src/features/team-mode/tools/tasks.ts'],
    nativeFace: 'vendored team-tasklist 读取 + 工具薄壳',
    disposition: 'content-vendor',
    e2eScenario: 'team-task-claim',
    status: 'pending',
    summary: '任务单读：随 vendored team-tasklist 语义（T8 claim 场景的读取半边）',
  },
  // ⑪ §1 行 10。(B) 无原生 projection——状态面 = vendored state-store +
  // 工具层聚合（覆盖基线 S-08 终态同口径：每轮状态注入 v1 不移植）。
  {
    id: 'team_status',
    upstreamSources: ['packages/omo-opencode/src/features/team-mode/tools/query.ts'],
    nativeFace: 'vendored team-state-store runtime state 读取 + 工具层聚合',
    disposition: 'ported',
    e2eScenario: 'team-create-and-message',
    status: 'pending',
    summary: '状态聚合：(B) 无 projection；聚合 runtime state（成员/任务/握手态）自 vendored state-store（T8/T10 probe marker 的在场性锚）',
  },
  // ⑫ §1 行 11。**记差异**：声明式命名团队 v1 不落地——spec 注册表是 OMO
  // 载体语义，本仓 team 恒 ephemeral-per-lead-session；活跃团队枚举由
  // vendored state-store 承接进 team_status。差异理由 = §1 表终态列逐字。
  {
    id: 'team_list',
    upstreamSources: ['packages/omo-opencode/src/features/team-mode/tools/query.ts'],
    nativeFace: 'vendored team-state-store → team_status 承接（活跃枚举）；声明式命名团队 v1 不落地',
    disposition: 'recorded-difference',
    e2eScenario: 'team-create-and-message',
    status: 'recorded',
    summary:
      '记差异：scope user/project/all 的声明式团队注册表不落地（team 恒 ephemeral-per-lead-session）；活跃枚举语义由 team_status 承接——差异成文于 §1 行 11',
  },
  // ⑬ §1 行 12。**记差异**：v4.19.4 的 12 工具名单**无 team_wait**（Q-1 复核
  // 逐字；v5 已删），所以本行 upstreamSources = []——upstreamSources 非空检查
  // 对 recorded-difference 行的显式豁免就是为这一行开的（validateManifest
  // 检查 5）。上游「等成员进展」的语义由 steer 投递续行 + 工具层引导覆盖。
  {
    id: 'team_wait',
    upstreamSources: [],
    nativeFace: '原生 steer 投递续行 + 工具层引导（无 wait 工具）',
    disposition: 'recorded-difference',
    e2eScenario: 'team-create-and-message',
    status: 'recorded',
    summary:
      '记差异：v4.19.4 12 工具名单无此件（v5 已删，Q-1）；等待语义 = steer 投递续行 + 离线唤醒（Q-5b 金丝雀 PIN-OK 25/25）——差异成文于 §1 行 12',
  },
  // ── §3 Phase 4 handoff 与关键词面（4 行）──────────────────────────────────
  // ⑭ §3 行 1。注入面 = omo-hooks keyword-detector（H-33）模块内演进：
  // TEAM_PATTERN 预留位已在（constants.ts:64，PRE-5 实测），T12 接 team 槽 →
  // pre-step 注入，source kind `omo-team-keyword`；**成员侧不放行**（Q-8 裁定，
  // 子会话过滤链六具名 skip）。内容 vendor 的载体（team.md + team-mode 模板）
  // 另见 vendor-team-prompts 行——一行一处置，不重复记账。
  {
    id: 'team-keyword-injection',
    upstreamSources: [
      'packages/omo-opencode/src/hooks/keyword-detector/constants.ts',
      'packages/omo-opencode/src/hooks/keyword-detector/team/default.ts',
      'packages/omo-opencode/src/hooks/keyword-detector/team/index.ts',
    ],
    nativeFace: 'omo-hooks keyword-detector 的 TEAM_PATTERN team 槽接线 → pre-step 注入（kind omo-team-keyword）；team 工具面在场是注入语义前提',
    disposition: 'ported',
    e2eScenario: 'team-keyword-mode',
    status: 'pending',
    summary:
      'team 关键词子模式：TEAM_PATTERN 命中 → 注入（H-33 模块内演进，不新增 hook 条目，EXPECTED_HOOK_COUNT 不变）；上游 team/default.ts 的 TEAM_MESSAGE=TEAM_MODE_PROMPT 载体随 vendor 行',
  },
  // ⑮ §3 行 2。降级形态已在位（P4 先例，hyperplan.ts DEGRADED 段）；完整
  // 对抗评审环在 team 工具在场时启用——**切换判据 = 运行时探测，不硬编码**
  // （T13 原文）。降级路径的反向场景不许因升级死掉（T13 判定）。
  {
    id: 'hyperplan-upgrade',
    upstreamSources: [
      'packages/omo-opencode/src/features/builtin-commands/templates/hyperplan.ts',
      'packages/omo-senpi/skills/hyperplan/SKILL.md',
    ],
    nativeFace: 'omo-commands hyperplan 模板 team 段升级（team 工具在场探测切换，不硬编码）',
    disposition: 'ported',
    e2eScenario: 'team-create-and-message',
    status: 'pending',
    summary:
      '/hyperplan 完整对抗评审环升级：降级文案 → 完整环（team 在场探测）；主场景取 team-create-and-message（team 在场前提），降级反向场景由 T13 自钉',
  },
  // ⑯ §3 行 3。上游 addendum 段 = REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM
  // （remove-ai-slops.ts:116，实测行号）；Phase 4 不移植段 D-03 的接续行。
  {
    id: 'remove-ai-slops-team-addendum',
    upstreamSources: ['packages/omo-opencode/src/features/builtin-commands/templates/remove-ai-slops.ts'],
    nativeFace: 'omo-commands remove-ai-slops 模板 team-mode addendum 升级（同 team 在场探测）',
    disposition: 'ported',
    e2eScenario: 'team-create-and-message',
    status: 'pending',
    summary:
      'remove-ai-slops 的 team-mode addendum 段升级（Phase 4 D-03 不移植段的接续）：slop-squad 编排语义按 DSH 工具面重写，上游载体引用段（~/.omo/tmux）适配由工具层文案承担',
  },
  // ⑰ §3 行 4。(B) 形态 = continuable 子女树的 interrupt/drain 分支
  // （drainContinuableDescendants 族，FORK.md §2.4：成员与既有委派子女同族）；
  // guard 同步契约注意（Q-6 NOTES-7）。落点在 omo-hooks 的 guard 模块（T9）。
  {
    id: 'stop-continuation-team',
    upstreamSources: [
      'packages/omo-opencode/src/hooks/stop-continuation-guard/hook.ts',
      'packages/omo-opencode/src/hooks/stop-continuation-guard/index.ts',
    ],
    nativeFace: 'omo-hooks stop-continuation guard 的 team 分支（continuable 子女树 interrupt/drain，与既有 jobs 级联并列）',
    disposition: 'ported',
    e2eScenario: 'stop-continuation-team',
    status: 'pending',
    summary:
      'stop-continuation 的 team 后代取消分支：成员树 drain + 独立降级 marker 可区分（Phase 4.5 金丝雀纪律）；guard 同步契约按 Q-6 NOTES-7',
  },
  // ── vendor 子集组（FORK.md §3.3 **T2 双评审后终态**，7 行）─────────────────
  // §3.3 终态（原 Q1b N6 三件闭包经 32 文件 import 全分析更正）：verbatim =
  // types / member-parser / config / logger / tolerant-fsync / session-client
  //（纯类型 15 行，评审发现补入）/ team-registry / team-tasklist（除
  // test-support）/ team-state-store（**除 reservation-reconciliation.ts**）；
  // vendor with deviation = active-resume.ts（删 `reconcileStaleReservationsForMember`
  // 导入与 `reconcileMemberReservations` 调用——其即 `.delivering-` 预约回收，
  // T1 已裁不移植）；排除 = reservation-reconciliation.ts（唯一带 team-mailbox
  // 运行时依赖的文件）；外部依赖 = `zod`（^4.4.3，T8 作 npm 依赖引入）+
  // `@oh-my-opencode/utils` **一件**（isPlainRecord，store.ts:1 唯一消费点；
  // isRecord 原消费点随 reservation-reconciliation 排除件出局；T8 二选一 vendor/
  // 语义移植，deviations 登记）；**不 vendor** team-mailbox（原生 inbox 替代）
  // 与 team-layout-tmux（D4）。落点 = patches/omo-dsh/vendor/team-core/。
  // vendor 纪律：上游版权内容逐字搬运、playbook 全套（NOTICES/VENDOR-MANIFEST/
  // deviations）归 T3–T8 落地任务；本表只钉**范围**，行序 = FORK.md 子集序。
  // 上游目录里的 `*.test.ts` **及 test-support 等测试夹具**不进 upstreamSources
  // （vendor payload 是实现文件；test-support.ts 是被 *.test.ts import 的夹具
  // 而非实现本体，规则显式覆盖它；测试种子的登记处是覆盖基线与 NOTICES playbook，
  // 同 omo-hooks 的列拆分理由）。
  {
    id: 'vendor-team-core-types',
    upstreamSources: ['packages/team-core/src/types.ts'],
    nativeFace: 'patches/omo-dsh/vendor/team-core/src/types.ts（逐字 vendor）',
    disposition: 'content-vendor',
    e2eScenario: 'team-create-and-message',
    status: 'pending',
    summary: 'vendor：team-core 域类型（成员/任务/状态形状）——子集闭包的地基，team-tasklist 全树 import 它（Q1b N6）',
  },
  {
    id: 'vendor-team-core-member-parser',
    upstreamSources: ['packages/team-core/src/member-parser.ts'],
    nativeFace: 'vendor/team-core/src/member-parser.ts（T5 team_create 的 inline spec 解析消费）',
    disposition: 'content-vendor',
    e2eScenario: 'team-create-and-message',
    status: 'pending',
    summary: 'vendor：成员 spec 解析（inline members[] 归一）——与 T4 member-validator 分层：解析随 vendor，资格判定是移植面',
  },
  {
    id: 'vendor-team-core-team-registry',
    upstreamSources: [
      'packages/team-core/src/team-registry/index.ts',
      'packages/team-core/src/team-registry/caller-team-lead.ts',
      'packages/team-core/src/team-registry/loader.ts',
      'packages/team-core/src/team-registry/paths.ts',
      'packages/team-core/src/team-registry/team-spec-input-normalizer.ts',
      'packages/team-core/src/team-registry/validator.ts',
    ],
    nativeFace: 'vendor/team-core/src/team-registry/（team 记录与路径/归一/校验；DSH 侧仅 ephemeral-per-lead-session 语义）',
    disposition: 'content-vendor',
    e2eScenario: 'team-create-and-message',
    status: 'pending',
    summary: 'vendor：team-registry 目录模块 6 实现文件（index/caller-team-lead/loader/paths/team-spec-input-normalizer/validator）——声明式命名团队面不激活（team_list 记差异的同一事实）',
  },
  {
    id: 'vendor-team-core-team-tasklist',
    upstreamSources: [
      'packages/team-core/src/team-tasklist/claim.ts',
      'packages/team-core/src/team-tasklist/dependencies.ts',
      'packages/team-core/src/team-tasklist/get.ts',
      'packages/team-core/src/team-tasklist/index.ts',
      'packages/team-core/src/team-tasklist/list.ts',
      'packages/team-core/src/team-tasklist/store.ts',
      'packages/team-core/src/team-tasklist/update.ts',
    ],
    nativeFace: 'vendor/team-core/src/team-tasklist/（T8 任务板消费层基座）',
    disposition: 'content-vendor',
    e2eScenario: 'team-task-claim',
    status: 'pending',
    summary:
      'vendor：team-tasklist 7 实现文件——上游弱语义原样（锁+锁内重读、缺依赖可领、无 ready/无 failed，Q1b N1/N2；显式决策行：不照抄原生 CAS/DAG，§1 末段三条理由）',
  },
  // T2 双评审更正：13 → **12 文件 + 1 deviation + 1 excluded**。排除
  // reservation-reconciliation.ts（:5-6 运行时 import ../team-mailbox/{ack,
  // reservation}——唯一带 team-mailbox 运行时依赖的文件，其语义 = `.delivering-`
  // 预约回收 = T1 已裁不移植项，原生 inbox 无预约族）；active-resume.ts =
  // vendor with deviation（:5 同文件导入 + :12/:20/:56 调用链随删，T8 落法；
  // 并连删因此成孤儿的 `log` 导入——:28 唯一调用点随被删 helper 出局，
  // root tsconfig 无 noUnusedLocals 不会编译报错，死导入须靠本指令显式清除）。
  {
    id: 'vendor-team-core-team-state-store',
    upstreamSources: [
      'packages/team-core/src/team-state-store/active-resume.ts',
      'packages/team-core/src/team-state-store/creating-resume.ts',
      'packages/team-core/src/team-state-store/deleting-resume.ts',
      'packages/team-core/src/team-state-store/error-normalization.ts',
      'packages/team-core/src/team-state-store/index.ts',
      'packages/team-core/src/team-state-store/locks.ts',
      'packages/team-core/src/team-state-store/resume-report.ts',
      'packages/team-core/src/team-state-store/resume.ts',
      'packages/team-core/src/team-state-store/runtime-cleanup.ts',
      'packages/team-core/src/team-state-store/session-liveness.ts',
      'packages/team-core/src/team-state-store/store.ts',
      'packages/team-core/src/team-state-store/worker-resume-status.ts',
    ],
    nativeFace: 'vendor/team-core/src/team-state-store/ 12 文件（team_status 状态面 + shutdownRequests 持久化 + orphaned/deleting 旁路承接；active-resume.ts = vendor with deviation，reservation-reconciliation.ts = excluded 不落）',
    disposition: 'content-vendor',
    e2eScenario: 'team-shutdown-handshake',
    status: 'pending',
    summary:
      'vendor：team-state-store 12 实现文件 + 1 deviation + 1 excluded（T2 双评审 32 文件 import 全分析终态）——deviation = active-resume.ts（删 reconcileStaleReservationsForMember 导入与 reconcileMemberReservations 调用/helper，T8 执行时落法；resume 族 TeamSessionContext harness 耦合面标 T8 复核点）；excluded = reservation-reconciliation.ts（唯一带 team-mailbox 运行时依赖 ../team-mailbox/{ack,reservation}，语义 = .delivering- 预约回收 = T1 已裁不移植，原生 inbox 无预约族）——(B) 状态机骨架的持久化基座；其余收窄处（如 session-liveness 对 (B) 的适配）进 deviations',
  },
  // T2 双评审更正：闭包补三件 → **四件**——session-client.ts 补入（纯类型
  // 零 import 15 行，state-store 族 **3 文件** type-only import 它（active-resume.ts:3 /
  // resume.ts:3 / session-liveness.ts:1；第 4 个消费者 reservation-reconciliation.ts:4
  // 随排除件出局——原「4 文件」计数沿用排除前 32 文件集，评审回落）；闭包
  // typecheck 完整性）。外部依赖从一件改**两件登记**：zod ^4.4.3（原缺口）+
  // @oh-my-opencode/utils。
  {
    id: 'vendor-team-core-closure',
    upstreamSources: [
      'packages/team-core/src/config.ts',
      'packages/team-core/src/logger.ts',
      'packages/team-core/src/session-client.ts',
      'packages/team-core/src/tolerant-fsync.ts',
    ],
    nativeFace: 'vendor/team-core/src/{config,logger,session-client,tolerant-fsync}.ts + 外部依赖 zod（^4.4.3，T8 作 npm 依赖引入）与 @oh-my-opencode/utils 一件（isPlainRecord，store.ts:1 唯一消费点；isRecord 原消费点随 reservation-reconciliation 排除件出局；T8 二选一 vendor/语义移植，deviations 登记）',
    disposition: 'content-vendor',
    e2eScenario: 'team-task-claim',
    status: 'pending',
    summary:
      'vendor：子集闭包补四件（T2 双评审 32 文件 import 全分析更正，原 Q1b N6 三件闭包不完整）——config/logger/tolerant-fsync + session-client.ts（纯类型 15 行零 import，state-store 族 **3 文件** type-only import 它——active-resume.ts:3 / resume.ts:3 / session-liveness.ts:1，第 4 个消费者 reservation-reconciliation.ts:4 随排除件出局）；实测 import 链：team-tasklist import ../config/../logger/../types/../team-registry/../team-state-store/locks；state-store/locks import ../tolerant-fsync；state-store/store import @oh-my-opencode/utils 的 isPlainRecord。外部依赖登记两件：zod ^4.4.3（types.ts:1/config.ts:1 `import * as z`、loader.ts:3 `import { ZodError }` 三处运行时依赖；T8 作 npm 依赖引入——**非「移植 zod 校验器」**，S-10 先例管自家配置面新造校验器）与 @oh-my-opencode/utils **一件**（isPlainRecord，store.ts:1 唯一消费点；isRecord 原消费点随 reservation-reconciliation 排除件出局；T8 二选一 vendor/语义移植，deviations 登记）——两件外部依赖都不进 upstreamSources（非 packages/ 路径），但必须登记 NOTICES/VENDOR-MANIFEST，否则编译期断链',
  },
  {
    id: 'vendor-team-prompts',
    upstreamSources: [
      'packages/prompts-core/prompts/mode/team.md',
      'packages/skills-loader-core/src/features/builtin-skills/skills/team-mode.ts',
    ],
    nativeFace: 'vendor 两项文本（team.md 615B 关键词命中单段指令 + teamModeSkill.template 204 行真·lead 运行协议）→ T12 注入正文消费',
    disposition: 'content-vendor',
    e2eScenario: 'team-keyword-mode',
    status: 'pending',
    summary:
      'vendor：team.md + team-mode skill 模板两项（T1 Q1b N5 实证扩清单——真协议在 team-mode.ts 不在 team.md）；已知矛盾登记 N1（status:"failed" 空头指令）/ N9（delegate_task 名称漂移），正文保真、deviations 注记',
  },
] as const satisfies readonly TeamManifestEntry[]

/**
 * 24 行 team 面表，形态为 `readonly TeamManifestEntry[]`，顺序同 MANIFEST_ROWS。
 * 加宽理由同 MANIFEST_ROWS 的注释。
 */
export const TEAM_MANIFEST: readonly TeamManifestEntry[] = MANIFEST_ROWS

/**
 * 24 个行 id，按表顺序派生（所以 id 里的笔误无法悄悄扩大这份列表）。T3 的
 * boot marker 逐行打印的正是它们，顺序固定。
 */
export const TEAM_IDS: readonly string[] = MANIFEST_ROWS.map((entry) => entry.id)

/**
 * 校验一份 team 面表（计划书 §4.2 / P5-T2 判定）。在**第一个**问题上抛错而不是
 * 收集列表：这里每种失败都是编写错误，其消息点名肇事行，而抛错正是让 T3 的
 * `apply()` 落一条响亮但非致命的 boot 行、而不是静默通过的方式。
 *
 * 检查清单（**0 是循环前的守卫**，1…11 是逐行检查，顺序即代码顺序；一行有多处
 * 问题时报先命中的那处）：
 *   0. **循环前**：行数 == EXPECTED_TEAM_MANIFEST_COUNT——「24 行真的存在」的
 *      守卫，少一行与多一行都在此被拒（负向单测因此必须供给满长度或超长度表）；
 *   1. `id` 非空；
 *   2. `id` 全表唯一；
 *   3. `disposition` ∈ TEAM_MANIFEST_DISPOSITIONS——先于 upstreamSources 检查，
 *      使「非法处置 + 空来源」的双畸形行报处置错（豁免判断要求处置**已知合法**）；
 *   4. `status` ∈ TEAM_MANIFEST_STATUSES；
 *   5. `upstreamSources` 非空——**recorded-difference 行显式豁免**：记差异行
 *      可以没有上游文件可指（team_wait 在 v4.19.4 的 12 工具名单中根本不存在，
 *      Q-1 复核；这是事实不是偷懒），豁免只对 recorded-difference 开放，其余
 *      任何处置空数组即 throw；
 *   6. `nativeFace` 非空——(B) 形态落点是每行的实质交付面描述，「无落点」的
 *      行不存在（连记差异行也有「由谁承接」要写）；
 *   7. `summary` 非空；
 *   8. `e2eScenario` 非空；
 *   9. `status === 'recorded'` 仅允许 `disposition === 'recorded-difference'`
 *      的行——终态词与处置的耦合：一条有代码交付物的行不得用「差异已成文」
 *      冒充完成；
 *  10. 每个 `upstreamSources` 条目为 tag 相对路径（位于 `packages/` 命名空间下
 *      ——该前缀检查同时排除绝对路径与仓内相对路径）；
 *  11. basename 不是 `AGENTS.md`（N-03 纪律：上游文档不是语义源；匹配 basename
 *      而非后缀子串，`.../AGENTS.md.ts` 仍合法）。
 */
export function validateManifest(entries: readonly TeamManifestEntry[]): void {
  if (entries.length !== EXPECTED_TEAM_MANIFEST_COUNT) {
    throw new Error(
      `manifest: expected ${EXPECTED_TEAM_MANIFEST_COUNT} team entries, got ${entries.length}`,
    )
  }
  const seen = new Set<string>()
  for (const entry of entries) {
    if (entry.id === '') {
      throw new Error('manifest: entry with empty id')
    }
    if (seen.has(entry.id)) {
      throw new Error(`manifest: duplicate team id '${entry.id}'`)
    }
    seen.add(entry.id)
    if (!teamDispositionSet.has(entry.disposition)) {
      throw new Error(
        `manifest: team '${entry.id}' declares illegal disposition '${entry.disposition}'`,
      )
    }
    if (!teamStatusSet.has(entry.status)) {
      throw new Error(
        `manifest: team '${entry.id}' declares illegal status '${entry.status}'`,
      )
    }
    if (entry.upstreamSources.length === 0 && entry.disposition !== 'recorded-difference') {
      throw new Error(
        `manifest: team '${entry.id}' declares no upstreamSources`
        + " — only recorded-difference rows may declare none (e.g. team_wait does not exist at v4.19.4)",
      )
    }
    if (entry.nativeFace === '') {
      throw new Error(`manifest: team '${entry.id}' declares an empty nativeFace`)
    }
    if (entry.summary === '') {
      throw new Error(`manifest: team '${entry.id}' declares an empty summary`)
    }
    if (entry.e2eScenario === '') {
      throw new Error(`manifest: team '${entry.id}' declares an empty e2eScenario`)
    }
    if (entry.status === 'recorded' && entry.disposition !== 'recorded-difference') {
      throw new Error(
        `manifest: team '${entry.id}' declares status 'recorded' on a '${entry.disposition}' row`
        + " — 'recorded' is the terminal state of recorded-difference rows only",
      )
    }
    for (const file of entry.upstreamSources) {
      if (!file.startsWith('packages/')) {
        throw new Error(
          `manifest: team '${entry.id}' lists non-tag-relative source '${file}'`
          + ' — upstream paths are v4.19.4 tag-relative, e.g. packages/team-core/…',
        )
      }
      if (file.split('/').at(-1) === 'AGENTS.md') {
        throw new Error(
          `manifest: team '${entry.id}' lists AGENTS.md in upstreamSources`
          + ' — upstream documentation is not a semantic source (N-03)',
        )
      }
    }
  }
}

/**
 * 某一处置下的行，按表顺序——门 2 一致性单测的进度视图（「还剩哪些 ported？」）
 * 与 T3 汇总面的分组输入。空 `disposition` 匹配不到任何行而不是匹配全部：
 * 传进来一个未赋值的变量的调用方不该被告知整张表都处于该处置（两包先例同款）。
 */
export function teamsByDisposition(
  entries: readonly TeamManifestEntry[],
  disposition: TeamManifestDisposition,
): readonly TeamManifestEntry[] {
  return entries.filter((entry) => entry.disposition === disposition)
}

/**
 * 某一状态下的行，按表顺序——T3 boot marker 的汇总计数输入与「还剩哪些
 * pending？」的进度视图。空 `status` 匹配不到任何行（同款纪律）。
 */
export function teamsByStatus(
  entries: readonly TeamManifestEntry[],
  status: TeamManifestStatus,
): readonly TeamManifestEntry[] {
  return entries.filter((entry) => entry.status === status)
}

/**
 * 每一状态的行数（汇总计数），键集合恒等于 TEAM_MANIFEST_STATUSES 且按其声明
 * 顺序插入，使 T3 汇总行的 `(pending=<n>, ported=<n>, recorded=<n>)` 字段顺序
 * 确定、可跨启动 diff。**不存在的状态也出现在结果里（计数 0）**。
 *
 * 表外的状态（加宽 fixture 才能造出，validateManifest 会拒绝）不静默丢弃：它
 * 作为额外键追加（两包 boot-markers 的 `other=` 防御尾同款），让「计数之和 <
 * 行数」这件事在数据里看得见。
 */
export function countsByStatus(
  entries: readonly TeamManifestEntry[],
): Map<TeamManifestStatus, number> {
  const counts = new Map<TeamManifestStatus, number>(
    TEAM_MANIFEST_STATUSES.map((status) => [status, 0]),
  )
  for (const entry of entries) {
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1)
  }
  return counts
}

/**
 * 每一处置的行数（分组计数），键集合恒等于 TEAM_MANIFEST_DISPOSITIONS 且按其
 * 声明顺序插入（门 2 一致性单测对覆盖基线 §1/§3 分组数字的派生输入；防御尾
 * 语义同 countsByStatus）。
 */
export function countsByDisposition(
  entries: readonly TeamManifestEntry[],
): Map<TeamManifestDisposition, number> {
  const counts = new Map<TeamManifestDisposition, number>(
    TEAM_MANIFEST_DISPOSITIONS.map((disposition) => [disposition, 0]),
  )
  for (const entry of entries) {
    counts.set(entry.disposition, (counts.get(entry.disposition) ?? 0) + 1)
  }
  return counts
}

/**
 * `[omo-team] loaded: manifest <N> entries (pending=<n>, ported=<n>,
 * recorded=<n>)` — P5-T3 boot marker 的汇总行派生（同款先例 = omo-commands
 * boot-markers.ts 的 formatLoadedSummaryLine；本函数住在 manifest.ts 是因为
 * P5-T2 还没有 boot-markers.ts，T3 若拆出该文件、把注册计数并入行格式，
 * 派生输入仍从这里取——**格式扩展在 probe 侧加，不在这里改**）。
 *
 * 每个数字都是派生的：`<N>` 与三个状态计数来自 `entries`（经由
 * countsByStatus，状态词表与其顺序只声明一次）。纯函数，单测可喂合成表观察
 * 派生计数，真表测试钉死 T2 时点的确切行。
 */
export function formatLoadedSummaryLine(entries: readonly TeamManifestEntry[]): string {
  const counts = countsByStatus(entries)
  const fields = TEAM_MANIFEST_STATUSES.map(
    (status) => `${status}=${counts.get(status) ?? 0}`,
  )
  return `[omo-team] loaded: manifest ${entries.length} entries (${fields.join(', ')})`
}
