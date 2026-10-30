// team-status.ts — P5-T7 · team_status 工具（仲裁补位 2026-10-10：聚合
// runtime state 的查询面；UNIVERSAL 语义族 = lead + member 双面可用）。
//
// ── 语义移植声明（SEMANTIC PORT, NOT A COPY）────────────────────────────────
// 上游源路径（署名，OMO tag v4.19.4 = commit b072d279110bdda2c6ac2525d0d24dc54d16148a，
// PRE-3 冻结基线）：
//   - packages/omo-opencode/src/features/team-mode/tools/query.ts ——
//     createTeamStatusTool :36-45：描述 `"Return full status for a team
//     run."` 逐字承载；参数只有 teamRunId（zod string，:41）——本文件
//     同形（min(1) 的运行时补齐是 (B) 工具层的同族纪律）；返回 =
//     JSON.stringify(aggregateStatus(...))——聚合住在 team-runtime/status.ts，
//     (B) 形态的聚合源 = 本仓状态骨架（team-state.ts，T8 vendored store
//     换持久化后本聚合零改动——聚合读的是方法面，接缝纪律同 family）。
//   - packages/omo-opencode/src/hooks/team-tool-gating/hook.ts ——
//     team_status 在 UNIVERSAL_TOOLS 名单（lead+member 皆可调，hook.ts:12-19
//     在档）：非参与者具名拒的文案 `team-mode tool team_status denied: not
//     a participant of team <id>` 逐字承载（:102-108 的 participant 臂，
//     team_send_message 已同族携带的同一裁决）。
//   - packages/team-core/src/team-state-store/store.ts —— loadRuntimeState
//     对 deleted tombstone 照样返回（deleted 是状态不是缺账；上游删目录后
//     才是 team_state_missing——(B) 形态 tombstone 留行，deleted 可读是
//     同一「查询面不因终态失明」的裁决；写面（消息/握手）对 deleted 具名
//     拒，见 tools/team-message.ts / tools/team-shutdown.ts 的状态闸）。
//
// ── 聚合形状（任务书 P5-T7 交付面 3：成员/状态/握手态/bounds）──────────────
// 每行取自状态骨架的只读面；成员行附**握手态**（latestShutdownRequest 的
// 投影：none|pending|approved|rejected + 三枚时间戳 + reason），lead 从
// 成员名单里天然缺席（lead 是 sentinel 不是成员——上游 getLeadMemberName
// 的 leader 行在 (B) 形态不存在于 members，lead 身份由 leadSessionId 承载，
// 形状差异见 team-state.ts 成员行注）。
//
// ── tasks 段：T8b 已接线（T7 的「空数组接缝」翻正为真读）───────────────────
// 任务板的语义源 = team-core/team-tasklist（manifest.ts §1 行 7-10 的
// content-vendor 组），T8a vendored 件落地、**T8b 接线落地**：tasks 段 =
// deps.store.listTasks（vendored listTasks 的薄直通：status/owner 过滤、
// id 数值升序、malformed 宽容跳过、点文件/目录排除——上游原样），板不存在
// 时上游 ENOENT→[] 的宽容让聚合面对「无板 team」天然诚实。元素类型自 T8b
// 起为**具名** TeamStatusTask（= vendored Task 的字段镜像，T7 预留的键位
// 与形状不变——只把 `readonly []` 放宽为具名元素，任务书钉的 T7 遗留①）。
//
// strip-only 纪律（T5 NOTES-6）：本文件不用参数属性；零 @deepseek-ai import。

import {
  ACTIVE_TEAM_RUNTIME_STATUSES,
  TEAM_LEAD_SENTINEL,
  type TeamRuntimeState,
  type TeamShutdownRequest,
  type TeamStateStore,
} from '../team/team-state.ts'
import type { Task } from '@oh-my-opencode/team-core/types'

import type { TeamAgent } from './team-create.ts'
import type { TeamLiveAgents } from './team-message.ts'

/** 工具名（manifest.ts team_status 行的 id 同一词汇）。 */
export const TEAM_STATUS_TOOL_NAME = 'team_status'

/** 本文件的日志前缀（工具层前缀体例）。 */
const LOG_PREFIX = '[omo-team team_status]'

/** team_status 错误族（具名 code；显式字段，strip-only）。 */
export class TeamStatusError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'TeamStatusError'
    this.code = code
  }
}

/** 工具层装配依赖（状态骨架——纯读面，零通道调用；tasks 段经 store 的
 *  vendored listTasks 薄直通臂读取，T8b）。
 *
 * P5-T16（评审 MINOR-5）：加一枚**活体注册表**读面（`agents`），供
 * `team_status` 给出成员行的 `resident` 活体观测——`phase` 六态里只有
 * `'running'` 有生产者，账面阶段不足以回答「成员还活着吗」。 */
export interface TeamStatusDeps {
  readonly store: TeamStateStore
  readonly agents: TeamLiveAgents
}

/** execute 的第二参（同族工具同一形状）。 */
interface TeamStatusToolExec {
  readonly agent?: TeamAgent
}

/** 握手态投影（成员行上的 `shutdown` 字段；none = 从未有请求）。 */
export type TeamShutdownState = 'none' | 'pending' | 'approved' | 'rejected'

/** 聚合的成员行（骨架行 + 握手投影 + 活体观测）。 */
export interface TeamStatusMember {
  readonly name: string
  readonly seat: string
  readonly sessionId?: string
  readonly phase: string
  /**
   * **活体观测**（P5-T16 评审 MINOR-5）：该成员会话此刻**在不在活体注册表里**。
   *
   * 为什么要有这一列：`phase` 词表六态里只有 `'running'` 有生产者（全仓唯一
   * 的 `setMemberPhase` 调用点写的就是它），其余三态（`completed` /
   * `errored` / `idle`）**至今无任何写入方**——所以 `phase` 在生产上恒读作
   * `running`，成员做完活、报错、掉线都读不出来。一个会系统性误导 lead 的
   * 状态面（lead 据此决定要不要再等、要不要重派）。
   *
   * `resident` 不需要新事件源就能给出**真值**：成员会话在活体注册表里 = 它此刻
   * 活着；不在 = 它冷着（DSH 的 cold resume 会在下一次投递时把它唤醒）或已经
   * 没了。与 `phase` 读数并列，lead 拿到的是「阶段（账面）+ 活性（观测）」两
   * 条独立的线。
   */
  readonly resident: boolean
  readonly agentType: string
  readonly shutdown: {
    readonly state: TeamShutdownState
    readonly requestedAt?: number
    readonly approvedAt?: number
    readonly rejectedAt?: number
    readonly rejectedReason?: string
  }
}

/**
 * 任务板行（T8b 具名元素类型，T7 遗留①的放宽落地）：= vendored Task
 * （@oh-my-opencode/team-core/types 的 TaskSchema 推断形）的字段镜像别名——
 * **不重抄字段**：类型直接从 vendored 件取，形状漂移在编译期即红（vendored
 * schema 不改的裁定面下，这里是 omo 侧唯一的读侧别名指针）。
 */
export type TeamStatusTask = Task

/** team_status 的聚合返回（shape 自 T7 稳定；tasks 段 T8b 起为真读）。 */
export interface TeamStatusResult {
  readonly teamRunId: string
  readonly teamName: string
  readonly status: string
  readonly specSource: string
  readonly createdAt: number
  readonly leadSessionId?: string
  readonly bounds: TeamRuntimeState['bounds']
  readonly members: readonly TeamStatusMember[]
  readonly shutdownRequests: readonly TeamShutdownRequest[]
  /** 任务板（T8b 真读：vendored listTasks 直通；板不存在 = [] 上游宽容）。 */
  readonly tasks: readonly TeamStatusTask[]
  readonly taskBoardNote: string
  /** 消息面观测（去重账的规模——lead 排障一眼可见，非上游字段，同账待遇）。 */
  readonly processedMessageCount: number
  /**
   * **完整消息预算**（P5-T22·自查残余 a）：`processedMessageCount` 只数已送达，
   * 而满载判据是 `delivered + inFlight`。lead 撞到 `MESSAGE_LEDGER_FULL` 时，
   * 必须能从状态面看出预算是被**在途行**吃掉的（含**停滞**在途行——发送者挂起/
   * 崩溃后那一行**不会自动**释放名额，P5-T21 的取舍；原 owner 迟到 settle 仍可释放）。
   */
  readonly messageLedger: {
    readonly delivered: number
    readonly inFlight: number
    /** 已超过 TTL 的在途行（再被请求即 `quarantined`）。 */
    readonly stalledInFlight: number
    readonly cap: number
    readonly remaining: number
  }
  /** `messageLedger` 的读法说明（模型可见：满载时的排障口径）。 */
  readonly messageLedgerNote: string
  readonly briefingInjectedMembers: readonly string[]
  /**
   * `phase` 读数的**读法说明**（P5-T16 评审 MINOR-5）。
   *
   * 词表六态（`pending` / `running` / `idle` / `errored` / `completed` /
   * `shutdown_approved`）里**只有 `'running'` 有生产者**——成员建队后即写
   * `'running'`，其余五态的生产者尚未接线（`idle` 的写入方在文件头登记为
   * 「待 T9」，`completed` / `errored` 至今无写入方）。所以 `phase` 此刻读的是
   * **账面阶段**，不是**活性事实**；活性事实看每行的 `resident`（活体观测）。
   *
   * 这条说明进模型可见面，是因为一个恒等于 `running` 的读数若不解释，lead 会
   * 把它当成活性判据——那正是评审点名的「系统性误导」。
   */
  readonly memberPhaseNote: string
}

/** 握手投影：latest 请求 → 四值态（approved 优先于 rejected 的读序——
 *  两枚时间戳可共存的行（先批后拒的重拒臂）按**最后落笔**读：rejectedAt
 *  更晚则 rejected，否则 approved；上游无重拒后的双戳先例时的读序在此
 *  成文，不静默）。 */
function projectShutdownState(request: TeamShutdownRequest | undefined): TeamShutdownState {
  if (request === undefined) return 'none'
  if (request.rejectedAt !== undefined && request.approvedAt !== undefined) {
    return request.rejectedAt >= request.approvedAt ? 'rejected' : 'approved'
  }
  if (request.approvedAt !== undefined) return 'approved'
  if (request.rejectedAt !== undefined) return 'rejected'
  return 'pending'
}

/**
 * 执行链：参数 teamRunId min(1) → team 在场（TEAM_NOT_FOUND 具名）→
 * 参与者身份（lead 或本队成员；非参与者 = 上游 gating 文案逐字）→ 聚合。
 * **无状态闸**：deleted tombstone 可读（文件头 query.ts 裁决），failed/
 * orphaned 同样可读——查询面的失明才是 bug。
 */
export async function executeTeamStatus(
  args: { teamRunId?: unknown },
  exec: TeamStatusToolExec,
  deps: TeamStatusDeps,
): Promise<TeamStatusResult> {
  if (typeof args.teamRunId !== 'string' || args.teamRunId.length === 0) {
    throw new TeamStatusError('teamRunId is required and must be a non-empty string', 'TEAM_RUN_ID_REQUIRED')
  }
  const teamRunId = args.teamRunId
  const caller = exec.agent
  if (caller === undefined) {
    throw new TeamStatusError(
      `${TEAM_STATUS_TOOL_NAME}: exec.agent is undefined — the query needs the calling identity to authorize`,
      'CALLER_MISSING',
    )
  }
  const state = deps.store.get(teamRunId)
  if (state === undefined) {
    throw new TeamStatusError(
      `${TEAM_STATUS_TOOL_NAME}: no team run '${teamRunId}' in the team state store`,
      'TEAM_NOT_FOUND',
    )
  }
  const callerSessionId = caller.session.header.id
  const isLead = state.leadSessionId === callerSessionId
  const participation = isLead ? undefined : deps.store.participationOfMember(callerSessionId)
  if (!isLead && participation?.teamRunId !== teamRunId) {
    throw new TeamStatusError(
      `team-mode tool ${TEAM_STATUS_TOOL_NAME} denied: not a participant of team ${teamRunId}`,
      'NOT_PARTICIPANT',
    )
  }

  const members: TeamStatusMember[] = state.members.map((member) => {
    const latest = deps.store.latestShutdownRequest(teamRunId, member.name)
    const shutdownState = projectShutdownState(latest)
    return {
      name: member.name,
      seat: member.seat,
      ...(member.sessionId === undefined ? {} : { sessionId: member.sessionId }),
      phase: member.phase,
      // P5-T16（评审 MINOR-5）：活体观测——不依赖任何新事件源的事实面。
      resident: member.sessionId !== undefined && deps.agents.get(member.sessionId) !== undefined,
      agentType: member.agentType,
      shutdown: {
        state: shutdownState,
        ...(latest === undefined ? {} : { requestedAt: latest.requestedAt }),
        ...(latest?.approvedAt === undefined ? {} : { approvedAt: latest.approvedAt }),
        ...(latest?.rejectedAt === undefined ? {} : { rejectedAt: latest.rejectedAt }),
        ...(latest?.rejectedReason === undefined ? {} : { rejectedReason: latest.rejectedReason }),
      },
    }
  })

  console.log(
    `${LOG_PREFIX} status of team ${teamRunId}: status=${state.status}, members=${members.length}, shutdownRequests=${state.shutdownRequests.length}, caller=${isLead ? TEAM_LEAD_SENTINEL : participation?.memberName ?? '?'}`,
  )
  return {
    teamRunId: state.teamRunId,
    teamName: state.teamName,
    status: state.status,
    specSource: state.specSource,
    createdAt: state.createdAt,
    ...(state.leadSessionId === undefined ? {} : { leadSessionId: state.leadSessionId }),
    bounds: state.bounds,
    members,
    shutdownRequests: state.shutdownRequests,
    // T8b 真读（文件头成文）：vendored listTasks 直通，id 升序、malformed
    // 宽容跳过、无 ready 字段——上游形状零改写；板不存在时上游回 []。
    tasks: await deps.store.listTasks(teamRunId),
    taskBoardNote: 'tasks are read live from the vendored team-tasklist board (P5-T8b); an empty list means the board has no task files yet — the board itself exists from team_create onward',
    processedMessageCount: state.processedMessageIds.length,
    messageLedger: await (async () => {
      const budget = await deps.store.messageBudget(teamRunId)
      return {
        delivered: budget.delivered,
        inFlight: budget.inFlight,
        stalledInFlight: budget.stalledInFlight,
        cap: budget.cap,
        remaining: Math.max(0, budget.cap - budget.delivered - budget.inFlight),
      }
    })(),
    messageLedgerNote: TEAM_MESSAGE_LEDGER_NOTE,
    briefingInjectedMembers: state.briefingInjectedMembers,
    memberPhaseNote: TEAM_MEMBER_PHASE_NOTE,
  }
}

/**
 * `phase` 读法的说明（进模型可见面；P5-T16 评审 MINOR-5，第二轮订正措辞）。
 *
 * 词表六态里**已接线**的生产者：`pending`（建队）/ `running`（成员起跑）/
 * `shutdown_approved`（握手批准）/ `completed`（force 拆除清账）/ `errored`
 * （resume 发现成员会话不在）。**未接线**的是**正常 turn 生命周期**——turn
 * 跑完、turn 失败、turn 之间的 idle 三种情形都不写 phase。所以 `phase` 此刻
 * 是**账面阶段**；活性事实看每行的 `resident`。
 */
/**
 * 消息预算的读法说明（模型可见；P5-T22 立、P5-T23/P5-T25 订正）。
 *
 * 三条事实必须一起读，否则 `processedMessageCount` 会误导：
 *   1. 满载判据 = `delivered + inFlight`（不是在途只算"过程态"）；
 *   2. **停滞在途行不自动回收**（自动回收 = 把投递权交还给可能还活着的旧 owner），
 *      但**不是永久**：原 owner 迟到 settle 会释放（迟到 rollback 归还、
 *      迟到 commit 转已送达 ⇒ `stalledInFlight` 会下降）；
 *   3. 满载**不一定是终态**：全由已送达占满才是终态；还有 fresh 在途 ⇒ 等 settle，
 *      失败的会释放名额。
 */
export const TEAM_MESSAGE_LEDGER_NOTE =
  'messageLedger is the full message budget: the fullness test is delivered + inFlight (not delivered alone), '
  + 'so a lead that hit MESSAGE_LEDGER_FULL can see which side consumed the budget. '
  + 'stalledInFlight counts reservations whose sender has not confirmed for longer than the reservation TTL: those rows are '
  + 'NOT auto-reclaimed (auto-reclaiming would let a hung-but-alive sender deliver the same correlationId twice), but they are '
  + 'not lost either — the original sender settling late frees the unit (a late rollback) or turns the id into delivered '
  + '(a late commit), so stalledInFlight can go down. '
  + 'remaining=0 is not always terminal: if inFlight > 0 and not all of it is stalled, those sends can still settle and release '
  + 'units (wait and retry); if delivered alone has reached cap, the budget is spent and only team_delete and a fresh run remain.'

export const TEAM_MEMBER_PHASE_NOTE =
  'member.phase is the ledger phase, not a liveness fact. The phase producers wired today are: '
  + '"pending" (the team was created), "running" (the member was spawned), "shutdown_approved" '
  + '(the member approved the shutdown handshake), "completed" (a forced teardown completed it) '
  + 'and "errored" (a resume pass found the member session gone). What is NOT wired yet is the '
  + 'normal turn lifecycle: a member whose turn finished, whose turn failed, or that is sitting '
  + 'idle between turns still reads "running" here. Use member.resident (a live-registry '
  + 'observation: true = the member session is live right now, false = it is cold or gone) for '
  + 'liveness.'

/** team_status 定义（描述 = 上游 query.ts:38 逐字首句）。 */
export function createTeamStatusDefinition(deps: TeamStatusDeps): unknown {
  return {
    name: TEAM_STATUS_TOOL_NAME,
    description:
      'Return full status for a team run. '
      + 'Aggregates runtime state from the team state skeleton: run status, bounds, every member with its handshake state (pending/approved/rejected shutdown), the shutdown request ledger, and the live task board read through the vendored team-tasklist (P5-T8b). '
      + `Callable by the lead and by team members; non-participants are refused by name. Deleted tombstones stay readable here — messaging and shutdown tools are the ones that refuse a deleted teamRunId.`,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['teamRunId'],
      properties: {
        teamRunId: { type: 'string', minLength: 1, description: 'Team run ID' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['teamRunId', 'teamName', 'status', 'specSource', 'createdAt', 'bounds', 'members', 'shutdownRequests', 'tasks', 'taskBoardNote', 'processedMessageCount', 'messageLedger', 'messageLedgerNote', 'briefingInjectedMembers', 'memberPhaseNote'],
        properties: {
          teamRunId: { type: 'string' },
          teamName: { type: 'string' },
          status: { type: 'string' },
          specSource: { type: 'string' },
          createdAt: { type: 'number' },
          leadSessionId: { type: 'string' },
          bounds: { type: 'object' },
          members: { type: 'array', items: { type: 'object' } },
          shutdownRequests: { type: 'array', items: { type: 'object' } },
          tasks: { type: 'array', items: { type: 'object' } },
          taskBoardNote: { type: 'string' },
          processedMessageCount: { type: 'number' },
          messageLedger: {
            type: 'object',
            additionalProperties: false,
            required: ['delivered', 'inFlight', 'stalledInFlight', 'cap', 'remaining'],
            properties: {
              delivered: { type: 'number' },
              inFlight: { type: 'number' },
              stalledInFlight: { type: 'number' },
              cap: { type: 'number' },
              remaining: { type: 'number' },
            },
          },
          messageLedgerNote: { type: 'string' },
          briefingInjectedMembers: { type: 'array', items: { type: 'string' } },
          memberPhaseNote: { type: 'string' },
        },
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args: { teamRunId?: unknown }, exec: TeamStatusToolExec) => executeTeamStatus(args, exec, deps),
  }
}

/**
 * 按角色分发（UNIVERSAL 语义族，hook.ts:12-19 的名单裁决）：**lead +
 * member 双面可用**——root 会话装（lead 面），team 子女装（member 面，
 * participation + ACTIVE 状态闸，family 同序）；非团队子女不装（它连队
 * 都没有）。真闸在执行处（participant 校验），分发收窄是第一道。
 */
export function registerTeamStatusSurface(
  ctx: { on(event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown): unknown },
  deps: TeamStatusDeps,
): () => void {
  const off = ctx.on('agent/created', ({ agent }) => {
    const header = agent.session.header
    const isChild = header.origin === 'subagent' || header.parentSession !== undefined
    if (!isChild) {
      agent.ctx.tools.register(createTeamStatusDefinition(deps))
      console.log(`${LOG_PREFIX} status surface installed on root session ${header.id}`)
      return
    }
    const participation = deps.store.participationOfMember(header.id)
    if (participation === undefined) return
    const state = deps.store.get(participation.teamRunId)
    if (state === undefined) {
      console.warn(
        `${LOG_PREFIX} impossible state: member session ${header.id} has a participation row for team run ${participation.teamRunId} but that run's state is missing from the store — status surface NOT installed`,
      )
      return
    }
    // 状态闸 family 同序：终态账是诊断面不是分发依据（deleted tombstone 的
    // 可读面 = 执行处对 lead 亲询放行；分发面不再给死队装工具）。
    if (!ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) return
    agent.ctx.tools.register(createTeamStatusDefinition(deps))
    console.log(`${LOG_PREFIX} status surface installed on member session ${header.id} (team ${participation.teamRunId})`)
  })
  return () => {
    if (typeof off === 'function') (off as () => void)()
  }
}
