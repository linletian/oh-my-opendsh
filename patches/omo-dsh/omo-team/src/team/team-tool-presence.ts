// team-tool-presence.ts — P5-T13 · manifest 行 ⑮ `hyperplan-upgrade` 与行 ⑯
// `remove-ai-slops-team-addendum` 的 omo-team 侧交付面：**team 工具在场探测面**
// （cordis service，两张脸一行一枚）。
// 署名（c25）：**无上游对应物——DSH 原生面**。行 ⑮/⑯ 的模板正文移植住在
// omo-commands 的 templates（那边自有逐字署名）；本文件只发在场探测，零上游字节。
//
// ── 为什么探测面住在 omo-team ─────────────────────────────────────────────────
// T13 的切换判据是「team 工具在场」——而**谁知道** team_* 工具在场？只有
// omo-team：工具名单、category 词表、任务态词表都是它的单事实源（tools/*.ts
// 的具名常量 + team-spec/member-validator 的别名表 + manifest.ts 的行 status）。
// 跨包纪律（index.ts 头注、R-5 双拼写先例）：omo-commands **不 import omo-team**
// ——它要在 /hyperplan 与 /remove-ai-slops 的调用时刻判「完整环还是降级环」，
// 就必须走 cordis 的 ctx 服务面。于是两行各拆两半、各住各家：
//   * omo-commands（消费半）：handler 每次调用**惰性 `ctx.get`** 自己那枚服务
//     （绝不 apply 期缓存——omo-hooks 消费 omoTeamMemberQuery 的同一理由：
//     提供纤可能后挂载，缓存的把手要么永远看不见、要么假装永不挂载的档也有）；
//   * omo-team（提供半，= 本文件）：把「在场」从**派生事实**算成一张只读快照，
//     由两行的 registrar 各自 `ctx.provide` 上线。
// 服务名两侧各自本地声明、互不 import，等值由单测钉死
// （tests/omo-team/team-tool-presence.test.ts 的 R-5 同族交叉断言）。
//
// ── 「在场」的诚实定义（事实层，不是声明层）───────────────────────────────
// `teamToolsPresent` **不是** registrar 跑过就 true 的橡皮章，也**不是**
// manifest 的 `status:'ported'` 声明层复读——它读的是**本次 boot 实际注册成功**
// 的行 id 集（team-registration-outcome.ts，注册循环逐行记账）：①–⑪ 十一枚工具
// 行**全部**在本次 boot 注册成功才在场；任何一枚注册 FAILED，两张脸同时翻
// false，两条命令同时降级。名单本身取自 tools/*.ts 的具名常量（名单与行 id 同
// 一词汇——manifest.ts 行注释成文的同一性），所以「在场」的分子分母都没有第二份
// 转抄。
//
// P5-T16 更正（评审 MINOR-7）：旧实现读 manifest 的 `status === 'ported'`——
// 那是**声明**。而注册循环是逐行 try/catch、loud-but-non-fatal 的：某枚工具行
// 的 registrar 在 boot 时抛错 ⇒ 该行打 FAILED、**没有注册** ⇒ 声明层仍说
// 'ported' ⇒ 在场判据仍报 true ⇒ `/hyperplan` 与 `/remove-ai-slops` 渲染
// FULL 环（"the team_* tools are live here"），向模型宣称一批并不存在的工具。
// **切换开关朝一个方向撒谎**——本面改读事实层。
//
// 诚实边界（与 T9 的 readTeamQueryService 同款，成文而非沉默）：service 在场 =
// omo-team 已挂载 + 本行已 ported + registrar 未抛 + ①–⑪ 本次 boot 全部注册
// 成功；某枚工具行在**本次 boot** 注册 FAILED 的瞬时事实由本面**如实反映**
// （判缺席 ⇒ 降级），census `<r>/<24>` 与 loud `FAILED` 行照旧各自可见。
//
// ── 两张脸，一枚快照 ──────────────────────────────────────────────────────────
// 行 ⑮ 消费半是 `/hyperplan`、行 ⑯ 消费半是 `/remove-ai-slops`——一行一处置，
// 各发各的服务名；载荷同出一枚 `teamToolPresenceSnapshot()`，两张脸的字节同源，
// 漂移无处存活。两行各有 registrar ⇒ census 14/24 → 16/24（同步网全点位随动）。
//
// strip-only 纪律（T5 NOTES-6）：本文件不用参数属性；零 @deepseek-ai import。

import { TEAM_CATEGORY_SEAT_ALIASES_V1 } from './member-validator.ts'
import { registeredTeamRowIds } from './team-registration-outcome.ts'
import { TEAM_CREATE_TOOL_NAME } from '../tools/team-create.ts'
import { TEAM_DELETE_TOOL_NAME } from '../tools/team-delete.ts'
import {
  TEAM_APPROVE_SHUTDOWN_TOOL_NAME,
  TEAM_REJECT_SHUTDOWN_TOOL_NAME,
  TEAM_SHUTDOWN_REQUEST_TOOL_NAME,
} from '../tools/team-shutdown.ts'
import { TEAM_SEND_MESSAGE_TOOL_NAME } from '../tools/team-message.ts'
import {
  TEAM_TASK_CREATE_TOOL_NAME,
  TEAM_TASK_GET_TOOL_NAME,
  TEAM_TASK_LIST_TOOL_NAME,
  TEAM_TASK_UPDATE_TOOL_NAME,
  TEAM_TASK_STATUSES,
} from '../tools/team-task.ts'
import { TEAM_STATUS_TOOL_NAME } from '../tools/team-status.ts'
import type { TeamRegistrationContext } from '../index.ts'

/**
 * 行 ⑮ 的服务名（提供侧拼写；消费侧在 omo-commands/src/commands/hyperplan.ts
 * 本地声明同字面常量，交叉等值由单测钉死——`omoTeamMemberQuery` 的 R-5 双拼写
 * 先例逐字同族）。
 */
export const OMO_TEAM_HYPERPLAN_TEAM_FACE = 'omoTeamHyperplanTeamFace'

/**
 * 行 ⑯ 的服务名（同上纪律；消费侧在 omo-commands/src/commands/remove-ai-slops.ts）。
 */
export const OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE = 'omoTeamSlopAddendumTeamFace'

/**
 * 十一枚工具行的名单（= tools/*.ts 具名常量 = manifest.ts 行 id，同一词汇的
 * 同一性由 manifest.ts 行注成文）。这是「在场」判据的分母——顺序 = manifest
 * 行序（①–⑪），派生断言在 tests/omo-team/team-tool-presence.test.ts。
 */
export const TEAM_TOOL_ROW_IDS: readonly string[] = [
  TEAM_CREATE_TOOL_NAME, // ①
  TEAM_DELETE_TOOL_NAME, // ②
  TEAM_SHUTDOWN_REQUEST_TOOL_NAME, // ③
  TEAM_APPROVE_SHUTDOWN_TOOL_NAME, // ④
  TEAM_REJECT_SHUTDOWN_TOOL_NAME, // ⑤
  TEAM_SEND_MESSAGE_TOOL_NAME, // ⑥
  TEAM_TASK_CREATE_TOOL_NAME, // ⑦
  TEAM_TASK_LIST_TOOL_NAME, // ⑧
  TEAM_TASK_UPDATE_TOOL_NAME, // ⑨
  TEAM_TASK_GET_TOOL_NAME, // ⑩
  TEAM_STATUS_TOOL_NAME, // ⑪
]

/** 已核验的在场快照（发布进 cordis 的冻结载荷；两枚服务同载荷）。 */
export interface TeamToolPresenceFace {
  /** ①–⑪ 全部 ported ⇒ true；任何一枚回落 pending ⇒ false（消费侧据此切环）。 */
  readonly teamToolsPresent: boolean
  /** 十一枚工具名，manifest 行序——消费侧文案引用的名单唯一来源。 */
  readonly teamToolNames: readonly string[]
  /** 可用 category 词表（member-validator 别名表的键，排序）：'deep', 'quick'。 */
  readonly teamCategories: readonly string[]
  /** 合法任务态词表（team-task.ts 五值，逐字）——N1 的消费侧注记来源。 */
  readonly teamTaskStatuses: readonly string[]
}

/**
 * 本次 boot **实际注册成功**的 ①–⑪ 工具行齐备 ⇒ true（事实层）。
 *
 * P5-T16（评审 MINOR-7）：这是「team 工具在场」的**事实**判据的唯一实现——
 * 在场脸（行 ⑮/⑯）与关键词槽的在场闸（行 ⑭）共用它，两处读同一枚事实，
 * 口径不可能分叉。
 */
export function teamToolsRegisteredThisBoot(): boolean {
  const registered = registeredTeamRowIds()
  return TEAM_TOOL_ROW_IDS.every((id) => registered.has(id))
}

/**
 * 从**本次 boot 的实际注册结果** + 词表派生一枚在场快照。纯函数：输入是
 * 已注册行 id 集 + tools/member-validator 的冻结常量，无 io、无时钟。
 *
 * P5-T16（评审 MINOR-7）：入参从「manifest 行集」改成「**实际注册成功的行
 * id 集**」——声明层（status:'ported'）会说谎，事实层不会。
 */
export function teamToolPresenceSnapshot(
  registeredRowIds: ReadonlySet<string> = registeredTeamRowIds(),
): TeamToolPresenceFace {
  const teamToolsPresent = TEAM_TOOL_ROW_IDS.every((id) => registeredRowIds.has(id))
  return Object.freeze({
    teamToolsPresent,
    teamToolNames: Object.freeze([...TEAM_TOOL_ROW_IDS]),
    teamCategories: Object.freeze(Object.keys(TEAM_CATEGORY_SEAT_ALIASES_V1).sort()),
    teamTaskStatuses: Object.freeze([...TEAM_TASK_STATUSES]),
  })
}

/**
 * registrar 的共用尾巴：`ctx.provide` 缺席 = 抛具名错打该行自己的 FAILED
 * （stop-continuation-team 的同款契约——发不出面的行不声称自己注册过）；
 * disposer 交回注册循环经 ctx.effect 收编（fiber 可逆性纪律）。
 */
function providePresenceFace(
  ctx: TeamRegistrationContext,
  serviceName: string,
  rowId: string,
): (() => void) | void {
  if (typeof ctx.provide !== 'function') {
    throw new Error(
      `${rowId}: this host exposes no ctx.provide — the ${serviceName} service cannot be published and its consuming command would see only its degraded form`,
    )
  }
  return ctx.provide(serviceName, teamToolPresenceSnapshot()) as (() => void) | void
}

/**
 * 行 ⑮ 的 registrar（TEAM_REGISTRARS 的落点，manifest 行序的 ⑮ 号位）。
 * 本行在 omo-team 侧的可见半 = /hyperplan 消费的在场脸；完整对抗评审环的
 * 模板正文住在 omo-commands（一行一处置，跨包零 import）。
 */
export function registerHyperplanUpgradePresenceFace(
  ctx: TeamRegistrationContext,
): (() => void) | void {
  return providePresenceFace(ctx, OMO_TEAM_HYPERPLAN_TEAM_FACE, 'hyperplan-upgrade')
}

/**
 * 行 ⑯ 的 registrar（TEAM_REGISTRARS 的落点，manifest 行序的 ⑯ 号位）。
 * 本行在 omo-team 侧的可见半 = /remove-ai-slops 消费的在场脸；team-mode
 * addendum 的模板正文住在 omo-commands（同一枚快照，另一张脸）。
 */
export function registerRemoveAiSlopsAddendumPresenceFace(
  ctx: TeamRegistrationContext,
): (() => void) | void {
  return providePresenceFace(ctx, OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE, 'remove-ai-slops-team-addendum')
}
