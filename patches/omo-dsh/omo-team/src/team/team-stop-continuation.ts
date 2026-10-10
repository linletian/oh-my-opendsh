// team-stop-continuation.ts — P5-T9 · manifest 行 ⑰ `stop-continuation-team`
// 的 omo-team 侧交付面：guard 消费的**只读成员查询服务**（cordis service）。
//
// ── 为什么这里只有一张「查询面」，取消动作却住在 omo-hooks ──────────────────
// 行 ⑰ 的 nativeFace 写的是 omo-hooks 的 stop-continuation guard 的 team 分支
// （guard 在 stop 时对成员树做 interrupt/drain）。跨包纪律（任务书铁律 + R-5
// 先例）：omo-hooks **不 import omo-team**——它要消费 team 状态（成员清单），
// 就必须走 cordis 的 ctx 服务面。于是本行拆成两半、各住各家：
//   * omo-hooks（消费半）：guard.stop() 并联 team 分支，经 `ctx.get` 惰性取本
//     服务、经 `ctx.subagents` 执行 interrupt/drain（stop-continuation-guard.ts
//     §⑦ + NOTES-7 的同步契约裁决）；
//   * omo-team（提供半，= 本文件）：把状态骨架里「这个 lead 会话此刻领着哪些
//     成员会话」投影成一张只读查询面，`ctx.provide` 上线。
// 服务名两侧各自本地声明、互不 import，等值由单测钉死
// （tests/omo-hooks/stop-continuation-team.test.ts 的 R-5 同族交叉断言）。
//
// ── 只读的边界（写面一寸不碰）──────────────────────────────────────────────
// 本模块不迁移状态、不写盘、不碰通道——它读的全部是 TeamStateStore 的内存镜像
// 读面（`teamOfLead`），且只挑 guard 需要的三列 (teamRunId, memberName,
// sessionId)。状态骨架的写面（transition/retire/force…）与本文件零交集。
//
// ── 状态过滤的裁决（诚实边界）───────────────────────────────────────────────
// 只回 `ACTIVE_TEAM_RUNTIME_STATUSES`（creating|active|shutdown_requested，
// 上游 team-tool-gating/hook.ts:11 的同一词表，team-state.ts 在册）的 run 的
// 成员。理由逐条：
//   * `deleting|deleted`：拆除已在途或已完成——成员树的 interrupt/drain 归
//     team_delete（T7 的执行面），guard 再伸手就是对正在退场的树重复开火；
//     且 deleted 后 `retireRunIndexes` 已退 lead 索引，`teamOfLead` 本就查无
//     此队（member/lead 的不对称账见 tools/team-delete.ts 头注 T7 遗留句）。
//   * `failed|orphaned`：lead 失联是这两态的定义性事实，而 guard 的 stop 发生
//     在 lead 会话活着、命令正在它上面跑的时刻——「lead 活着但它的队 orphaned」
//     的组合里成员树已被 resume 面接管，不是 continuation 停止的语义对象。
//   * `creating` 留在集合里：spawn 在途的成员一旦驻留就该被停得下来，漏掉
//     creating 等于给「刚建队就 /stop-continuation」留一条停不到成员的缝。
// 无 sessionId 的成员行（spawn 未落账）跳过——没有可寻址的会话就没有可取消
// 的树；这跟 T7 team_delete 的 `if (member.sessionId === undefined) continue`
// 是同一判据。
//
// strip-only 纪律（T5 NOTES-6）：本文件不用参数属性；零 @deepseek-ai import。

import type { TeamStateStore } from './team-state.ts'
import { ACTIVE_TEAM_RUNTIME_STATUSES } from './team-state.ts'
import type { TeamRegistrationContext } from '../index.ts'

/**
 * 服务名（提供侧拼写；消费侧在 omo-hooks 各自本地声明同字面常量，交叉等值由
 * 单测钉死——`omoStopContinuation` 的 R-5 双拼写先例，逐字同族）。
 */
export const OMO_TEAM_MEMBER_QUERY_SERVICE = 'omoTeamMemberQuery'

/** 一行 = 一个可寻址的活成员会话（guard 只需要这三列）。 */
export interface TeamMemberQueryRow {
  readonly teamRunId: string
  readonly memberName: string
  readonly sessionId: string
}

/**
 * 只读查询面：`liveMembersOfLead(leadSessionId)` → 该 lead 此刻领着的
 * ACTIVE run 的成员行（无队/终态/无 sessionId ⇒ 空数组，从不抛）。
 */
export interface TeamMemberQueryService {
  liveMembersOfLead(leadSessionId: string): readonly TeamMemberQueryRow[]
}

/**
 * 装配依赖：只读地借状态骨架的镜像面（store 是进程单例，见 team-state.ts 尾）。
 */
export interface TeamMemberQueryDeps {
  readonly store: TeamStateStore
}

/**
 * 建查询面。每次调用现读镜像（不缓存投影结果）：run 状态、成员 sessionId、
 * lead 索引都在被同一骨架的写面持续更新，缓存一张旧投影就是让 guard 对着一张
 * 死名册开火。
 *
 * **单 run 契约（评审 MINOR 成文——这是提供侧的显式声明，消费侧的
 * `members[0]!.teamRunId` 合法性就钉在这段话上）**：一次 `liveMembersOfLead`
 * 的全部成员行读自**同一个** `teamOfLead` 快照（team-state.ts:754-757 的
 * `teamRunIdByLeadSession` 是 Map<leadSessionId, teamRunId> 单值索引 + 一个
 * mirror 对象），所以返回集里 `state.teamRunId` 只有一个值、逐行相等——
 * 「一个 lead 会话此刻至多领着一个 ACTIVE run」不是巧合，是索引形状 +
 * `participantOf` 嵌套闸（同文件 :770+，T5 裁决）的构造性事实。契约由
 * tests/omo-team/team-stop-continuation.test.ts 的 single-run pin 逐行钉：
 * 任何一行 teamRunId 偏离快照 run id，测试红。
 */
export function createTeamMemberQueryService(deps: TeamMemberQueryDeps): TeamMemberQueryService {
  const liveMembersOfLead = (leadSessionId: string): readonly TeamMemberQueryRow[] => {
    const state = deps.store.teamOfLead(leadSessionId)
    if (state === undefined || !ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) return []
    const rows: TeamMemberQueryRow[] = []
    for (const member of state.members) {
      if (member.sessionId === undefined) continue
      rows.push({ teamRunId: state.teamRunId, memberName: member.name, sessionId: member.sessionId })
    }
    return rows
  }
  return { liveMembersOfLead }
}

/**
 * 行 ⑰ 的 registrar（TEAM_REGISTRARS 的落点，注册循环的 ⑰ 号位）。
 *
 * `ctx.provide` 在真实 cordis 纤体上恒在场（fiber mixin 给每个 ctx 都配了
 * provide/effect——runTeamRegistrations 的 `ctx.effect` 同款隐式兜底注）；
 * 缺席 = 这台宿主给不出查询面，抛具名错让注册循环打该行自己的 FAILED 行、
 * census 诚实停在原地——「boot 从不宣称没有发生的成功」（注册循环头注的同一
 * 契约）。返回 provide 的 disposer 交回循环经 ctx.effect 收编（fiber 可逆性
 * 纪律：provide 挂在调用纤体上，停纤即退服务，零手工回收）。
 */
export function registerTeamStopContinuationQuerySurface(
  ctx: TeamRegistrationContext,
  deps: TeamMemberQueryDeps,
): (() => void) | void {
  if (typeof ctx.provide !== 'function') {
    throw new Error(
      `stop-continuation-team: this host exposes no ctx.provide — the ${OMO_TEAM_MEMBER_QUERY_SERVICE} service cannot be published and the guard's team branch would see only its degraded marker`,
    )
  }
  return ctx.provide(OMO_TEAM_MEMBER_QUERY_SERVICE, createTeamMemberQueryService(deps)) as (() => void) | void
}
