// member-validator.ts — P5-T4 · team 成员资格校验：11 席终态矩阵（纯函数，
// 零 ctx / 零副作用 / 零 io）。
//
// ── 语义移植声明（SEMANTIC PORT, NOT A COPY）────────────────────────────────
// 本文件**不抄任何上游代码**。语义逐条来自三个上游文件，其逐字原文已入证据
// 档 .omo/evidence/p5t1/Q1a-tools-lifecycle.md §3（引用基址 = OMO tag
// v4.19.4 = commit b072d279110bdda2c6ac2525d0d24dc54d16148a，PRE-3 冻结）：
//   ① packages/senpi-task/src/team/member-validator.ts —— UNRESOLVABLE_
//      CATEGORY 判定与「可用清单 = 排序拼接」文案惯例（:27-38 的
//      `Available categories: ${[...ports.categoryNames].sort().join(", ")}.`
//      与 :49-58 的 `Available agents:` 同族——本文件对齐的是**语义**：
//      不可解析即具名 + 附排序可用清单；措辞按本仓席面重写）。curated
//      只读拒入的文案骨架（:41-47 `curated read-only agent "X" cannot be a
//      team member; delegate via the task tool instead`）同源自 ①。
//   ② packages/team-core/src/team-registry/validator.ts —— 具名 code 的
//      错误族形状（TeamSpecValidationError 的 code/field/memberName 三件套
//      :15-25）与资格分派（validateMemberEligibility :91-114）。成员数上限
//      与重名两条不住这里，住 team-spec.ts（解析面）。
//   ③ packages/team-core/src/types.ts —— AGENT_ELIGIBILITY_REGISTRY
//      （:190-237）作**对照表**：上游三值 verdict（eligible / conditional /
//      hard-reject）逐席在册。本文件终态矩阵与上游 verdict 的**全部偏差**
//      都在行注释里点名（atlas = 上游 eligible 而本仓拒；multimodal-looker
//      = v4 hard-reject 在册收紧；oracle/prometheus = v5 清单未列而本仓按
//      class 收紧），差异的裁定依据 = 覆盖基线 §4（T1 终态，2026-10-09）。
//
// ── roster.ts 的声明式复制（禁止 import，单测对账）─────────────────────────
// omo-team 不 import 其他 omo 包（omo-commands 边界纪律，omo-commands/src/
// index.ts:11-25 先例）：跨包知识以**手抄声明式表 + 测试期对账**通行。
// tests/omo-team/member-validator.test.ts import omo-agents/src/roster.ts 的
// ALL_AGENT_IDS 做集合相等断言 **加逐位置行序相等断言**（「顺序 = roster.ts
// 行序」由后者钉死，集合相等拦不住 reordered；对账先例 = tests/omo-commands/
// hyperplan.test.ts:29），roster.ts 漂移即红。ONE-WAY SYNC：roster.ts 是事实源，席面
// 变更必须同 commit 改三处（roster.ts → 本表 → 测试期望表）。
// 形状事实逐字锚点：AgentClass 四值 = roster.ts:51（'read-only'|'worker'|
// 'orchestrator'|'allowlist'，**无 'conductor'**）；sisyphus = route-only 行
// 「no personaFile / class / maxDepth」= roster.ts:110-120 注释逐字，故本表
// 该行**没有 class 字段**，资格判定走 seat id 结构性排除、不经 class 匹配。
//
// ── 终态矩阵（覆盖基线 §4，T1 裁定 2026-10-09）─────────────────────────────
// 允许 = worker 两席 {hephaestus, sisyphus-junior}；拒绝 = read-only 六席 +
// atlas（orchestrator，有意收紧：T1 Q-6 实证成员工具面无委派通道，编排职责
// 在 team 内结构性不可行）+ multimodal-looker（allowlist，v4 hard-reject 在
// 册收紧）+ sisyphus（无 class，route-only 指挥席，lead 恒为当前会话）。
//
// ── 输出形态 ──────────────────────────────────────────────────────────────────
// 判定返回**判别联合**而非 throw（纯函数面：调用方 T5 的工具层决定何时把
// reason 变成工具错误；上游对应物是 throw，本仓把 throw 留给工具层——形态
// 差异成文于此）。每个拒绝 verdict 都带 reason 文案与 seatClass（roster 外
// 的 id 与无 class 的 sisyphus 是 undefined——「undefined 本身是事实」，
// 不伪造 class）。

/**
 * roster.ts:51 `AgentClass` 的声明式镜像——四值，**无 'conductor'**（覆盖
 * 基线 §4 头部「类型事实」段逐字复核）。派生词表同 omo-team manifest.ts 的
 * 纪律：运行时数组是唯一声明处，类型由 `(typeof X)[number]` 派生。
 */
export const TEAM_AGENT_CLASSES = ['read-only', 'worker', 'orchestrator', 'allowlist'] as const

/** 名册镜像类（roster.ts:51 四值）。 */
export type TeamAgentClass = (typeof TEAM_AGENT_CLASSES)[number]

/**
 * 资格表一行。`class` **可选且只对 sisyphus 缺席**——这是 roster.ts:110-120
 * route-only 行的形状事实，不是偷懒字段。
 */
export interface TeamSeatRow {
  /** seat id = roster 行 id = DSH toolName（roster.ts:70 同款同一性）。 */
  readonly id: string
  /** 镜像类；route-only 的 sisyphus 行没有该字段。 */
  readonly class?: TeamAgentClass
}

/**
 * 11 席资格表，**顺序 = roster.ts 行序**（sisyphus, explore, hephaestus,
 * oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker,
 * sisyphus-junior, prometheus；roster.ts:110-270 的 id 逐行转抄；行序由
 * tests/omo-team/member-validator.test.ts 的逐位置对账测试钉死，非 prose-only
 * 声明）。
 * class 值逐行对 roster.ts:134/153/166/182/195/208/224/244/264/278 的
 * `class:` 字段转抄；sisyphus 无 class（roster.ts:110-120）。
 *
 * ⚠️ ONE-WAY SYNC DISCIPLINE：本表是 roster.ts 的第 2 份转抄（第 1 份是
 * roster.ts 本尊，第 3 份是 tests/omo-team/member-validator.test.ts 的
 * 期望表）；roster 增删改席必须同 commit 动三处，测试期对账兜底。
 */
// 形状注：这里**不用** `as const satisfies`（manifest.ts 同款手法）是有意的
// 偏离——`as const` 会把 sisyphus 行窄化成「没有 class 键的字面量类型」，
// 消费点对联合访问 row.class 即编译错误；而本表没有任何消费方需要字面量 id
// （对账在测试期做）。声明成 `readonly TeamSeatRow[]`，「sisyphus 行无
// class」这一事实由 TeamSeatRow.class 的可选性承载、由测试逐席钉死。
const TEAM_SEAT_ROWS: readonly TeamSeatRow[] = [
  { id: 'sisyphus' },
  { id: 'explore', class: 'read-only' },
  { id: 'hephaestus', class: 'worker' },
  { id: 'oracle', class: 'read-only' },
  { id: 'librarian', class: 'read-only' },
  { id: 'plan-consultant', class: 'read-only' },
  { id: 'plan-reviewer', class: 'read-only' },
  { id: 'atlas', class: 'orchestrator' },
  { id: 'multimodal-looker', class: 'allowlist' },
  { id: 'sisyphus-junior', class: 'worker' },
  { id: 'prometheus', class: 'read-only' },
]

/** 11 个 seat id，按 roster 行序派生。 */
export const TEAM_SEAT_IDS: readonly string[] = TEAM_SEAT_ROWS.map((row) => row.id)

/**
 * v1 全部可入队席 = worker 两席（覆盖基线 §4 终态：允许 = hephaestus /
 * sisyphus-junior）。从本表 class 派生——roster 若把某 read-only 席改成
 * worker，它会**安静地**获得入队资格，兜底不是这里而是测试的逐席硬编码
 * 期望矩阵（tests/omo-team/member-validator.test.ts）：矩阵缺一席即红，
 * 翻一格即红。
 */
export const TEAM_ELIGIBLE_SEATS: readonly string[] = TEAM_SEAT_ROWS
  .filter((row) => row.class === 'worker')
  .map((row) => row.id)

/**
 * curated 只读四席 = 上游 v5 parse 期拒绝清单的逐字对应（调查报告 §2.1-3
 * 逐字："Rejected at parse: the curated read-only agents (`explore`,
 * `librarian`, `plan-consultant`, `plan-reviewer`)"）。oracle / prometheus
 * **不在此列**——v5 清单未列、v4 registry hard-reject 在册（types.ts:200-204
 * / :231-235），本仓按 roster class 统一收紧（覆盖基线 §4 read-only 行的
 * 「比上游更严的有意收紧」注）；两类的拒绝文案因此分岔（curated 对应 vs
 * 收紧注）。
 */
export const CURATED_READONLY_SEATS_V1: readonly string[] = [
  'explore',
  'librarian',
  'plan-consultant',
  'plan-reviewer',
]

/**
 * category 别名表 v1（T4 仲裁定案）：{ quick → sisyphus-junior, deep →
 * hephaestus }。
 *
 * 释义依据（成文，计划书 §4.3 / 覆盖基线 §4 worker 行 / S-11 终态）：
 * 上游 category 的语义作用 = 按工种/成本定模型路由（senpi 把 category 解析
 * 到 fallback model chain）；本仓名册 worker 两席天然两级——sisyphus-junior
 * 是 FAST 席（deepseek-flash，roster.ts:255-264 行注）、hephaestus 是 STRONG
 * 席（deepseek-v4-pro，roster.ts:144-153 行注）——故 quick=flash 席、
 * deep=pro 席。类别名**取自上游内建 category 词表**（senpi-task/src/category/
 * openai-categories.ts：`name: "deep"` :170 / `name: "quick"` :178，非新造），
 * 收窄到 worker 两级是 v1 决定（其余上游 category 如 ultrabrain /
 * unspecified-* 不在 v1 词表，命中即 UNRESOLVABLE_CATEGORY）。席位自带
 * persona/模型/deny 路由，category 技能提醒语义由席位 persona 承载（S-11）。
 */
export const TEAM_CATEGORY_SEAT_ALIASES_V1: Readonly<Record<string, string>> = {
  quick: 'sisyphus-junior',
  deep: 'hephaestus',
}

/**
 * `subagent_type` = **v1 记差异不实现**（计划书 §4.3）：上游用它指向
 * AGENT_ELIGIBILITY_REGISTRY 里的具体 agent（validator.ts:91-114）；DSH 无
 * 用户自定义 agent 注册表，名册封闭 11 席之外没有可指之物——故 spec 携带
 * subagent_type 时给**具名差异错误**（不静默忽略；静默忽略会让调用方以为
 * 自己点名成功）。文案的唯一声明处在这里，team-spec.ts 消费它。
 */
export const SUBAGENT_TYPE_UNSUPPORTED_REASON =
  "'subagent_type' is recorded-difference in v1 (plan §4.3): DSH has no user-defined agent"
  + ' registry — the closed roster of 11 seats is the only vocabulary;'
  + " specify exactly one of 'category' (deep, quick) or 'seat' instead."

/** 直接指定席的判定结果（判别联合，见文件头「输出形态」段）。 */
export type MemberSeatVerdict =
  | { readonly ok: true; readonly seat: string; readonly seatClass: TeamAgentClass }
  | {
      readonly ok: false
      readonly seat: string
      /** UNKNOWN_SEAT = id 不在 11 席表内；SEAT_NOT_ELIGIBLE = 在册但拒。 */
      readonly code: 'UNKNOWN_SEAT' | 'SEAT_NOT_ELIGIBLE'
      readonly reason: string
      /** roster 外的 id 与无 class 的 sisyphus 是 undefined（事实非偷懒）。 */
      readonly seatClass: TeamAgentClass | undefined
    }

/** category 别名解析结果（判别联合）。 */
export type CategorySeatResolution =
  | { readonly ok: true; readonly category: string; readonly seat: string; readonly seatClass: TeamAgentClass }
  | { readonly ok: false; readonly category: string; readonly code: 'UNRESOLVABLE_CATEGORY'; readonly reason: string }

/**
 * 「可用席清单」= 排序拼接（上游语义：senpi member-validator.ts:29-31 对
 * available 清单 `[...names].sort().join(", ")`——语义对齐非逐字）。
 */
export function formatAvailableSeatsList(): string {
  return [...TEAM_ELIGIBLE_SEATS].sort().join(', ')
}

/** 「可用 category 清单」= 排序拼接（同上惯例）：'deep, quick'。 */
export function formatAvailableCategoriesList(): string {
  return Object.keys(TEAM_CATEGORY_SEAT_ALIASES_V1).sort().join(', ')
}

/**
 * UNRESOLVABLE_CATEGORY 文案（上游可用清单语义 = 排序拼接，Q1a §3.1 的
 * `Available categories: …` / `Available agents: …` 先例——语义对齐非逐字）：
 * 同时给 category 与 seat 两枚清单，因为调用方拿到任一即可自救。
 */
export function unresolvableCategoryReason(category: string): string {
  return `unknown category '${category}'.`
    + ` Available categories: ${formatAvailableCategoriesList()}.`
    + ` Available seats: ${formatAvailableSeatsList()}.`
    + " Specify exactly one of 'category' or 'seat'."
}

/** 表外 seat id 的文案（附可用席清单；对齐上游 UNKNOWN_SUBAGENT_TYPE 文案族， validator.ts:12-13）。 */
export function unknownSeatReason(seatId: string): string {
  return `unknown seat '${seatId}'. Available seats: ${formatAvailableSeatsList()}.`
}

/**
 * sisyphus 的结构性排除注（覆盖基线 §4 sisyphus 行）：无 class 字段故不经
 * class 匹配；lead 恒为当前会话（fork (B) + senpi runtime「the current
 * session is always the lead sentinel」，Q1a §4 引 runtime.ts:39-45），指挥
 * 席不作成员。
 */
export function conductorExclusionReason(seatId: string): string {
  return `seat '${seatId}' is structurally excluded from team membership — route-only conductor`
    + " row with no 'class' field (roster.ts:110-120); the team lead is always the current"
    + ' session, so the conductor seat is never a member. Excluded by seat id, not by class match.'
}

/**
 * 不可入队 class = 四值去掉 worker（worker 是允许席，没有拒绝文案可生成
 * ——「没有第五种文案」由 Exclude 在类型层钉死，穷尽 switch 的第四个 case
 * 不存在才是正确的封闭）。
 */
export type IneligibleTeamAgentClass = Exclude<TeamAgentClass, 'worker'>

/**
 * 拒绝文案生成器：逐类理由成文（覆盖基线 §4 各行的「依据」列口径）。
 * 穷尽 switch over Exclude<_, 'worker'> 三值——worker 无文案（见类型注），
 * 第五种 class 出现即编译错误，这正是词表由数组派生的意义。
 */
export function seatRejectionReason(seatId: string, seatClass: IneligibleTeamAgentClass): string {
  switch (seatClass) {
    case 'read-only':
      return CURATED_READONLY_SEATS_V1.includes(seatId)
        // 上游 v5 拒绝清单逐字对应的四席（调查报告 §2.1-3）；逃生门措辞按
        // DSH 载体改写：上游的 'task tool'/'delegate-task' 是 OMO 载体，本仓
        // 只读席的既有载体 = 对同一席的 subagent 委派（roster 十席皆委派目标）。
        ? `read-only seat '${seatId}' cannot be a team member — curated read-only agent`
          + ' (matching the upstream v5 parse-reject list); delegate this work via the'
          + ` '${seatId}' subagent tool instead of team membership.`
        // oracle / prometheus：v5 清单未列、v4 hard-reject 在册——收紧注成文。
        : `read-only seat '${seatId}' cannot be a team member — delegate this work via the`
          + ` '${seatId}' subagent tool instead. Note: the upstream v5 parse-reject list does`
          + ' not enumerate this seat (the v4 registry hard-rejects it); this repo rejects it'
          + ' uniformly by roster class as an intentional tightening (coverage baseline §4).'
    case 'orchestrator':
      // atlas：有意收紧（覆盖基线 §4 atlas 行 (a)(b)(c) 三条依据的浓缩）。
      return `orchestrator seat '${seatId}' cannot be a team member — intentional tightening:`
        + ' the member tool surface has no delegation channel (T1 Q-6), so orchestrating work'
        + ' inside a team is structurally impossible and admitting the seat would ship dead'
        + ' instructions; the upstream AGENT_ELIGIBILITY_REGISTRY marks this seat eligible —'
        + ' reopening it in a later phase must first solve the missing delegation channel.'
    case 'allowlist':
      // multimodal-looker：v4 hard-reject 在册收紧（types.ts:215-219）。
      return `allowlist seat '${seatId}' cannot be a team member — the upstream v4 registry`
        + ' hard-rejects it (AGENT_ELIGIBILITY_REGISTRY) and the v5 reject list never mentions'
        + ' it; this repo keeps the v4-side tightening (coverage baseline §4).'
  }
}

/**
 * 直接指定席的资格判定（主输入 = roster `class` 字段，seat id 兜底：
 * sisyphus 无 class 走结构性排除分支）。判定序：
 *   1. id 不在 11 席表 → UNKNOWN_SEAT（附可用席清单）；
 *   2. sisyphus（无 class 的 route-only 行）→ SEAT_NOT_ELIGIBLE + 结构性
 *      排除注（不经 class 匹配，覆盖基线 §4）；
 *   3. class === 'worker' → 允许（v1 全部可入队席）；
 *   4. 其余 class → SEAT_NOT_ELIGIBLE + 逐类文案（seatRejectionReason）。
 */
export function validateMemberSeat(seatId: string): MemberSeatVerdict {
  const row = TEAM_SEAT_ROWS.find((candidate) => candidate.id === seatId)
  if (row === undefined) {
    return { ok: false, seat: seatId, code: 'UNKNOWN_SEAT', reason: unknownSeatReason(seatId), seatClass: undefined }
  }
  if (row.class === undefined) {
    // 形状事实：11 席里只有 sisyphus 无 class（roster.ts:110-120）。若未来
    // 某席也缺 class，本分支照样诚实拒绝（「无 class 即无从定岗」），文案
    // 点名的 conductor 措辞是否仍贴切由那次 roster 变更的仲裁者复核。
    return { ok: false, seat: seatId, code: 'SEAT_NOT_ELIGIBLE', reason: conductorExclusionReason(seatId), seatClass: undefined }
  }
  if (row.class === 'worker') {
    return { ok: true, seat: seatId, seatClass: row.class }
  }
  return { ok: false, seat: seatId, code: 'SEAT_NOT_ELIGIBLE', reason: seatRejectionReason(seatId, row.class), seatClass: row.class }
}

/**
 * category 别名 → worker 席的解析（别名表见 TEAM_CATEGORY_SEAT_ALIASES_V1
 * 的释义注释）。命中别名后再过一遍 validateMemberSeat——纵深防御：别名表与
 * 资格表若漂移（比如别名指向了一个被改类的席），这里照样响亮拒绝。
 */
export function resolveCategorySeat(category: string): CategorySeatResolution {
  // 显式 `string | undefined` 标注：Record<string, string> 的索引返回是
  // string（本仓不开 noUncheckedIndexedAccess），不标注则 `=== undefined`
  // 是 TS2367「无重叠比较」编译错误——标注让「查不到」成为类型里在场的分支。
  const seat: string | undefined = TEAM_CATEGORY_SEAT_ALIASES_V1[category]
  if (seat === undefined) {
    return { ok: false, category, code: 'UNRESOLVABLE_CATEGORY', reason: unresolvableCategoryReason(category) }
  }
  const verdict = validateMemberSeat(seat)
  if (!verdict.ok) {
    return { ok: false, category, code: 'UNRESOLVABLE_CATEGORY', reason: verdict.reason }
  }
  return { ok: true, category, seat: verdict.seat, seatClass: verdict.seatClass }
}
