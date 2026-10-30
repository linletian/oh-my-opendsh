// team-shutdown.ts — P5-T7 · 关停握手三工具（team_shutdown_request /
// team_approve_shutdown / team_reject_shutdown）+ 双面按角色分发。
//
// ── 语义移植声明（SEMANTIC PORT, NOT A COPY）────────────────────────────────
// 上游源路径（署名，OMO tag v4.19.4 = commit b072d279110bdda2c2525d0d24dc54d16148a，
// PRE-3 冻结基线；逐字原文已入证据档 Q1a-tools-lifecycle.md §2.3/§2.4/§2.5/§5）：
//   - packages/omo-opencode/src/features/team-mode/team-runtime/shutdown.ts
//     —— 握手三段（requestShutdownOfMember :13-55 / approveShutdown :57-107 /
//     rejectShutdown :109-148）的状态机语义：request 幂等（未决请求早退
//     :24-28）、approve 无请求具名抛 `shutdown request missing for '<name>'`
//     （:63-65）+ 已批幂等（:68-70）+ 成员翻 shutdown_approved 且
//     completed/errored 保留终态（:79-86）、reject reason 必填 + 同 reason
//     已拒幂等（:122-124）+ 成员不 interrupt（team 存活语义）。账本三段
//     住在 src/team/team-state.ts 的「关停握手账」段（同一语义的持久接缝），
//     本文件是**调用方**：权限、状态闸、消息联动、返回形状。
//   - packages/omo-opencode/src/features/team-mode/tools/lifecycle-shutdown-tools.ts
//     —— 工具骨架与权限词汇：request 描述 :71 `"Request shutdown for a team
//     member."` 逐字承载；lead-only 具名拒 :74-76 `team_shutdown_request is
//     lead-only`（逐字）；approve 描述 :96 `"Approve a pending shutdown
//     request."`；approve/reject 的 caller 权限 :101/:121
//     `${toolName}: caller must be target member or team lead`（逐字承载，
//     与 gating hook.ts:110-116 同一裁决的二级面）；reason 必填 = 上游
//     reject 的 zod min(1)（§2.5 逐字在档）的运行时对应；返回 JSON 的
//     `status:"shutdown_requested"` 只是**工具返回字段**（§5.3 注：上游
//     工具层不改团队 status——本文件同样不改，team-state 三段账法同纪律）。
//   - packages/senpi-task/src/team/shutdown.ts —— senpi 并存的第二套握手面
//     （§1 头部两套面并存的事实）：requester 键恒 `TEAM_LEAD_SENTINEL`
//     （:72-101 语义）在本仓沿用——lead 恒创建者会话（fork (B)），询问帧
//     的 from 词恒 'lead'；「resolved 旧请求永不挡新请求」的倒序语义
//     已在 team-state.ts 账法承载。
//
// ── 消息联动（任务书 P5-T7 钉死的三帧）─────────────────────────────────────
//   * request 后 → 向目标成员投递**询问帧**（原生 ctx.subagents.sendMessage，
//     sender = 活体 lead，target = 成员 sessionId——相邻边，缺席成员由原生
//     coldResume 唤醒，Q-5b 实证面同 team_send_message）；帧文本 = 关停询问
//     语义 + **回复指引**（成员用 team_approve_shutdown / team_reject_shutdown
//     回复，坐标随帧给出——成员模型的 teamRunId 抄写源，与 briefing
//     coordinates 同一诚实性论证）。载体承原生 kind 'agent-message'
//     （Q-8 B1：omo 不改写 kind，帧文本在 content 内自标识）。
//   * approve/reject 后 → 向 lead 投递**结果帧**（approve 的 from = 批准者名、
//     body = 成员名；reject 的 from = 拒绝者名、body = reason——上游
//     createShutdownMessage 的 kind/body 语义 shutdown.ts:99-105/:133-139，
//     载体换原生帧）。caller = lead 时结果帧**自指**：原生相邻面无
//     lead→lead 边（team-message.ts SELF_DELIVERY_NOT_ADJACENT 同一事实），
//     跳过投递并在返回 note 里成文——上游 mailbox 可自投，(B) 形态以
//     「lead 即调用方，已知结果」承载同一信息（记差异）。
//   * **本地纪律帧（Q-8 A3 的 `omo-team-shutdown` kind）v1 不注入**：询问
//     帧已内嵌「收到须回复」的指引，再注一帧纪律只是重复；kind 席位保留
//     （常量在册），未来若需要 lead 侧超时提醒帧再启用（NOTES 登记）。
//
// ── 无自动超时（与上游同构，Q1a §5.4 第 5 条）──────────────────────────────
// 没有计时器、没有 TTL、没有自动批准/自动清理——「reasonable window」的
// 超时语义由提示词承担（上游 addendum refactor-sections/team-mode-addendum.ts
// :123 `team_shutdown_request for each member, then team_approve_shutdown if
// members do not self-approve within a reasonable window` 同一裁决）：第四路
// = lead 在合理窗口后**代批准**（team_approve_shutdown 的权限本就含 lead，
// 单测四路之四钉死该路径）。DSH 若要确定性超时 = 新增语义非移植，须另行
// 登记——v1 不加。
//
// ── 批准后成员收停 = interrupt 的归属 ───────────────────────────────────────
// 上游 approve → 成员 interrupt + drain 的联动住在 delete/拆除路径
// （delete-team.ts + T9 的 guardrail 收敛）；任务书 P5-T7 判定只要求**批准
// 态迁移 + 消息**——本文件的 approve 只翻账与投帧，interrupt 联动归
// tools/team-delete.ts（显式 team_delete）与 T9。差异与归属成文于此。
//
// strip-only 纪律（T5 NOTES-6）：本文件不用参数属性；零 @deepseek-ai
// import（宿主面全部最小结构化声明，team-message.ts 同款纪律——通道与
// Agent 类型直接复用其声明，一仓一词汇）。

import { randomUUID } from 'node:crypto'
import {
  ACTIVE_TEAM_RUNTIME_STATUSES,
  TEAM_LEAD_SENTINEL,
  TeamStateError,
  type TeamRuntimeState,
  type TeamShutdownRequest,
  type TeamStateStore,
} from '../team/team-state.ts'
import type { TeamAgent } from './team-create.ts'
import { sanitizeTeamNameFragment } from './team-create.ts'
import type { TeamMessageSendChannel } from './team-message.ts'

/** 工具名三枚（manifest.ts §1 行 3/4/5 的 id 同一词汇）。 */
export const TEAM_SHUTDOWN_REQUEST_TOOL_NAME = 'team_shutdown_request'
export const TEAM_APPROVE_SHUTDOWN_TOOL_NAME = 'team_approve_shutdown'
export const TEAM_REJECT_SHUTDOWN_TOOL_NAME = 'team_reject_shutdown'

/**
 * omo 本地注入帧的 kind 席位（Q-8 A3 定名 `omo-team-shutdown`）。v1 **无
 * 注入方**（文件头「消息联动」段的裁决）——常量在册是让 Q-8 的 kind 表
 * 与代码可对照，不是死代码装饰。
 */
export const TEAM_SHUTDOWN_SOURCE_KIND = 'omo-team-shutdown'

/** 本文件的日志前缀（工具层前缀体例，team-message.ts 对称）。 */
const LOG_PREFIX = '[omo-team team_shutdown]'

/**
 * 握手错误族：具名 code + 上游语义文案（错误族的清单与逐字出处见各抛点）。
 * 显式字段 + 构造体内赋值（strip-only 禁参数属性，T5 NOTES-6）。
 */
export class TeamShutdownError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'TeamShutdownError'
    this.code = code
  }
}

/** 工具层装配依赖（单测注入 mock，生产由 index.ts 供真件）。 */
export interface TeamShutdownDeps {
  readonly subagents: TeamMessageSendChannel
  readonly store: TeamStateStore
}

/** execute 的第二参（与 team-create.ts / team-message.ts 同一形状）。 */
interface TeamShutdownToolExec {
  readonly agent?: TeamAgent
  readonly signal: AbortSignal
}

/** 别名收口：approve/reject 的 exec 与 request 同形（一处声明防漂移）。 */
type TeamToolExecAlias = TeamShutdownToolExec

/** request 的返回（status 字段 = 上游工具返回 JSON 的同一词汇，§5.3 注）。 */
export interface TeamShutdownRequestResult {
  readonly teamRunId: string
  readonly targetMemberName: string
  readonly requesterName: string
  readonly status: 'shutdown_requested'
  readonly alreadyPending: boolean
  readonly inquiryDelivered: boolean
  readonly note: string
}

/** approve 的返回。 */
export interface TeamApproveShutdownResult {
  readonly teamRunId: string
  readonly memberName: string
  readonly approverName: string
  readonly status: 'shutdown_approved'
  readonly approvedAt: number
  readonly alreadyApproved: boolean
  readonly memberPhaseFlipped: boolean
  readonly resultDelivered: boolean
  readonly note: string
}

/** reject 的返回（rejectedBy/reason/status 三键 = 上游 §2.5 返回形状）。 */
export interface TeamRejectShutdownResult {
  readonly teamRunId: string
  readonly memberName: string
  readonly rejectedBy: string
  readonly reason: string
  readonly status: 'shutdown_rejected'
  readonly rejectedAt: number
  readonly alreadyRejected: boolean
  readonly resultDelivered: boolean
  readonly note: string
}

// ── 帧构造（原生 'agent-message' 载体上的自标识帧文本，Q-8 B1）──────────────
// 两块形态与 buildTeamMessageContent 同构（前缀块 + 正文块）；`<id>` =
// 询问/结果帧自己的关联 id（上游 createShutdownMessage 的 messageId 语义，
// randomUUID）。

/**
 * 帧里插值的**净化**（P5-T16 第二轮评审 NIT-19 的后半段）。
 *
 * 第一轮只净化了 briefing 帧；关停三帧（request / approve / reject）仍原样插
 * 成员名——评审复现：一个**合法**成员名 `bad"member\n# forged` 会让
 * coordinates 的 JSON 解析失败、并伪造出一行新的帧结构。
 *
 * 处置：① 坐标用 `JSON.stringify` **构造**（不是字符串拼接）⇒ JSON 永远合法；
 * ② 其余插值统一走 {@link sanitizeTeamNameFragment}（控制字符清理 + 引号配对
 * 保护）⇒ 插值永远落在同一行、且不破坏包裹引号。
 */
export function buildTeamShutdownRequestContent(
  requestId: string,
  targetMemberName: string,
  teamRunId: string,
): readonly { type: 'text'; text: string }[] {
  const coordinates = JSON.stringify({ teamRunId, memberName: targetMemberName })
  return [
    { type: 'text', text: `Team shutdown request ${requestId} from ${TEAM_LEAD_SENTINEL}:` },
    {
      type: 'text',
      text:
        `The team lead requests that you shut down. Finish any critical work, then reply with the shutdown lifecycle tool: `
        + `team_approve_shutdown to approve (your session will be eligible for teardown), `
        + `or team_reject_shutdown with a reason to refuse and keep working. `
        + `Your coordinates: ${coordinates}.`,
    },
  ]
}

/** 批准结果帧（发往 lead；body 携成员名 = 上游 approved body 语义）。 */
export function buildTeamShutdownApprovedContent(
  requestId: string,
  approverName: string,
  memberName: string,
): readonly { type: 'text'; text: string }[] {
  return [
    { type: 'text', text: `Team shutdown approved ${requestId} from ${sanitizeTeamNameFragment(approverName)}:` },
    {
      type: 'text',
      text: `Member '${sanitizeTeamNameFragment(memberName)}' approved the shutdown request and is now shutdown_approved — the run can be torn down with team_delete when all members are deletable.`,
    },
  ]
}

/** 拒绝结果帧（发往 lead；body = reason = 上游 rejected body 语义）。 */
export function buildTeamShutdownRejectedContent(
  requestId: string,
  rejectorName: string,
  memberName: string,
  reason: string,
): readonly { type: 'text'; text: string }[] {
  return [
    { type: 'text', text: `Team shutdown rejected ${requestId} from ${sanitizeTeamNameFragment(rejectorName)}:` },
    {
      type: 'text',
      text: `Member '${sanitizeTeamNameFragment(memberName)}' rejected the shutdown request. The team stays active and this member keeps working. Reason: ${sanitizeTeamNameFragment(reason)}`,
    },
  ]
}

// ── 共用闸（参数清洗 / 状态闸 / 权限）────────────────────────────────────────

/** teamRunId min(1) 的逐字段具名校验（schema 之外的运行时对应，同族工具同形）。 */
function requireTeamRunId(teamRunId: unknown): string {
  if (typeof teamRunId !== 'string' || teamRunId.length === 0) {
    throw new TeamShutdownError('teamRunId is required and must be a non-empty string', 'TEAM_RUN_ID_REQUIRED')
  }
  return teamRunId
}

/** 成员名 min(1) 的具名校验。 */
function requireMemberName(memberName: unknown, toolName: string): string {
  if (typeof memberName !== 'string' || memberName.length === 0) {
    throw new TeamShutdownError(`${toolName} requires a non-empty member name`, 'MEMBER_NAME_REQUIRED')
  }
  return memberName
}

/**
 * run 状态闸：deleting/deleted 具名拒（上游 assertTeamAcceptsMessages 语义，
 * team-core send.ts:67-80——与 team-message.ts 的同一错误族同一文案，握手
 * 与消息共用「拆中的队不收」裁决）；failed/orphaned 无活体成员可询，同族。
 */
function assertTeamAcceptsHandshake(state: TeamRuntimeState, teamRunId: string): void {
  if (state.status === 'deleting') {
    throw new TeamShutdownError('team is deleting', 'TEAM_DELETING')
  }
  if (state.status === 'deleted') {
    throw new TeamShutdownError(`team ${teamRunId} is deleted`, 'TEAM_DELETED')
  }
  if (!ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) {
    throw new TeamShutdownError(
      `team run ${teamRunId} is ${state.status} — no live members to handshake with`,
      'TEAM_NOT_ACTIVE',
    )
  }
}

/**
 * 审批权限（approve/reject 共用）：**lead 或目标成员本人**。上游词汇逐字
 * （lifecycle-shutdown-tools.ts:101/:121 与 gating hook.ts:110-116 同一
 * 裁决）：`${toolName}: caller must be target member or team lead`。
 * 返回批准/拒绝者的称谓（lead = sentinel；成员 = 成员名——帧的 from 词）。
 */
function authorizeShutdownApproval(
  toolName: string,
  state: TeamRuntimeState,
  caller: TeamAgent,
  memberName: string,
): string {
  const callerSessionId = caller.session.header.id
  if (state.leadSessionId === callerSessionId) return TEAM_LEAD_SENTINEL
  if (isTargetMemberSession(state, callerSessionId, memberName)) return memberName
  throw new TeamShutdownError(`${toolName}: caller must be target member or team lead`, 'PERMISSION_DENIED')
}

/** 成员账核对：caller 会话恰好是该 run 的该成员（本人自批/自拒的身份源）。 */
function isTargetMemberSession(state: TeamRuntimeState, callerSessionId: string, memberName: string): boolean {
  return state.members.some((member) => member.name === memberName && member.sessionId === callerSessionId)
}

/**
 * 账本错误的工具层包装：team-state.ts 的 TeamStateError（SHUTDOWN_REQUEST_
 * MISSING 等）在工具边界统一收窄成 TeamShutdownError——文案逐字不动（上游
 * `shutdown request missing for '<name>'` 的具面在 message），只换错误族，
 * 让工具契约的错误族是这一文件的。
 */
function wrapStoreError(err: unknown): TeamShutdownError {
  if (err instanceof TeamStateError && err.code === 'SHUTDOWN_REQUEST_MISSING') {
    return new TeamShutdownError(err.message, 'SHUTDOWN_REQUEST_MISSING')
  }
  if (err instanceof TeamShutdownError) return err
  return new TeamShutdownError(err instanceof Error ? err.message : String(err), 'LEDGER_FAULT')
}

/** 投递执行 + 失败具名（询问帧的失败面：退账由调用方决定，这里只冒错）。 */
async function deliverShutdownFrame(
  deps: TeamShutdownDeps,
  sender: TeamAgent,
  targetSessionId: string,
  content: readonly { type: 'text'; text: string }[],
  signal: AbortSignal,
): Promise<void> {
  await deps.subagents.sendMessage(sender, targetSessionId, content, { signal })
}

// ── ① team_shutdown_request（lead-only）─────────────────────────────────────

/**
 * 执行链（上游 requestShutdownOfMember shutdown.ts:13-55 的语义序）：
 * 参数 → team 在场 → **lead-only 具名拒**（`team_shutdown_request
 * is lead-only`，上游 :74-76 逐字；权限层先于状态闸——上游 gating 分层序）
 * → 状态闸 → 目标成员在场（`unknown member
 * '<name>'`，shutdown-helpers 语义）→ 原子幂等闸（未决请求早退，不重发
 * ——上游 :24-28）→ 询问帧原生投递 → 投递失败退账（未送达不占幂等位，
 * 与 team-message.ts reservation 同一族）。
 */
export async function executeTeamShutdownRequest(
  args: { teamRunId?: unknown; targetMemberName?: unknown },
  exec: TeamShutdownToolExec,
  deps: TeamShutdownDeps,
): Promise<TeamShutdownRequestResult> {
  const teamRunId = requireTeamRunId(args.teamRunId)
  const targetMemberName = requireMemberName(args.targetMemberName, TEAM_SHUTDOWN_REQUEST_TOOL_NAME)
  const caller = exec.agent
  if (caller === undefined) {
    throw new TeamShutdownError(
      `${TEAM_SHUTDOWN_REQUEST_TOOL_NAME}: exec.agent is undefined — the tool needs the live calling agent to authorize the inquiry`,
      'CALLER_MISSING',
    )
  }
  const state = deps.store.get(teamRunId)
  if (state === undefined) {
    throw new TeamShutdownError(
      `${TEAM_SHUTDOWN_REQUEST_TOOL_NAME}: no team run '${teamRunId}' in the team state store`,
      'TEAM_NOT_FOUND',
    )
  }
  // 权限层先于运行态闸（上游 gating 分层序，评审 T7-NIT）：非 lead 撞
  // deleting/deleted 团队时先拿 `team_shutdown_request is lead-only` 具名拒
  // ——「你不能做这件事」先于「这件事现在不能做」。
  if (state.leadSessionId !== caller.session.header.id) {
    throw new TeamShutdownError(`${TEAM_SHUTDOWN_REQUEST_TOOL_NAME} is lead-only`, 'LEAD_ONLY')
  }
  assertTeamAcceptsHandshake(state, teamRunId)
  const target = state.members.find((member) => member.name === targetMemberName)
  if (target === undefined) {
    throw new TeamShutdownError(`unknown member '${targetMemberName}'`, 'UNKNOWN_MEMBER')
  }
  if (target.sessionId === undefined) {
    throw new TeamShutdownError(
      `member '${targetMemberName}' has no durable session yet — the inquiry has no delivery target`,
      'MEMBER_SESSION_MISSING',
    )
  }

  const { alreadyPending } = await deps.store.requestShutdown(teamRunId, targetMemberName, TEAM_LEAD_SENTINEL)
  if (alreadyPending) {
    // 上游幂等臂的同一早退（shutdown.ts:24-28）：有未决请求 → 直接返回，
    // 不重发询问帧（成员已经欠着一个回复，再问只是噪声）。
    const note = `shutdown request for '${targetMemberName}' is already pending — no new inquiry sent`
    console.log(`${LOG_PREFIX} ${note} (team ${teamRunId})`)
    return {
      teamRunId,
      targetMemberName,
      requesterName: TEAM_LEAD_SENTINEL,
      status: 'shutdown_requested',
      alreadyPending: true,
      inquiryDelivered: false,
      note,
    }
  }

  try {
    await deliverShutdownFrame(
      deps,
      caller,
      target.sessionId,
      buildTeamShutdownRequestContent(randomUUID(), targetMemberName, teamRunId),
      exec.signal,
    )
  } catch (err) {
    // 未送达的询问不占幂等位：退账让 lead 的下一拍 request 可以重投
    // （上游 send→record 序里 send 抛则无痕的等价承载，见 team-state.ts
    // releaseShutdownRequest 注）。
    await deps.store.releaseShutdownRequest(teamRunId, targetMemberName)
    throw new TeamShutdownError(
      `${TEAM_SHUTDOWN_REQUEST_TOOL_NAME}: inquiry delivery to '${targetMemberName}' failed: ${err instanceof Error ? err.message : String(err)}`,
      'DELIVERY_FAILED',
    )
  }
  console.log(`${LOG_PREFIX} shutdown inquiry delivered to '${targetMemberName}' (team ${teamRunId})`)
  return {
    teamRunId,
    targetMemberName,
    requesterName: TEAM_LEAD_SENTINEL,
    status: 'shutdown_requested',
    alreadyPending: false,
    inquiryDelivered: true,
    note: `shutdown inquiry delivered to '${targetMemberName}' — reply expected via team_approve_shutdown / team_reject_shutdown`,
  }
}

// ── ② team_approve_shutdown（lead 或目标成员本人）───────────────────────────

/**
 * 执行链（上游 approveShutdown shutdown.ts:57-107 的语义序）：参数 → team
 * 在场 → 权限（lead 或本人，词汇逐字；先于状态闸——gating 分层序）→ 状态闸
 * → 账本 approve（无请求具名
 * 抛 `shutdown request missing for '<name>'` / 已批幂等 / completed+errored
 * 保留终态）→ 结果帧发 lead（lead 自批 = 自指帧跳过原生投递，note 成文）。
 * **第四路（lead 代批准）**：成员不自批的合理窗口后，lead 亲调本工具即
 * 上游 addendum 的同一动作（:123）——权限臂天然覆盖，单测钉死。
 */
export async function executeTeamApproveShutdown(
  args: { teamRunId?: unknown; memberName?: unknown },
  exec: TeamToolExecAlias,
  deps: TeamShutdownDeps,
): Promise<TeamApproveShutdownResult> {
  const teamRunId = requireTeamRunId(args.teamRunId)
  const memberName = requireMemberName(args.memberName, TEAM_APPROVE_SHUTDOWN_TOOL_NAME)
  const caller = exec.agent
  if (caller === undefined) {
    throw new TeamShutdownError(
      `${TEAM_APPROVE_SHUTDOWN_TOOL_NAME}: exec.agent is undefined — the tool needs the live calling agent to authorize the approval`,
      'CALLER_MISSING',
    )
  }
  const state = deps.store.get(teamRunId)
  if (state === undefined) {
    throw new TeamShutdownError(
      `${TEAM_APPROVE_SHUTDOWN_TOOL_NAME}: no team run '${teamRunId}' in the team state store`,
      'TEAM_NOT_FOUND',
    )
  }
  // 权限层先于运行态闸（与 request 的 lead-only 上提同一分层序，评审
  // T7-NIT）：越权 caller 撞 deleting/deleted 团队时先拿
  // `caller must be target member or team lead` 族具名拒，再论运行态。
  const approverName = authorizeShutdownApproval(
    TEAM_APPROVE_SHUTDOWN_TOOL_NAME, state, caller, memberName,
  )
  assertTeamAcceptsHandshake(state, teamRunId)

  let alreadyApproved: boolean
  let approvedAt: number
  let memberPhaseFlipped: boolean
  try {
    ({ alreadyApproved, approvedAt, memberPhaseFlipped } = await deps.store.approveShutdown(teamRunId, memberName))
  } catch (err) {
    throw wrapStoreError(err)
  }
  if (alreadyApproved) {
    const note = `shutdown for '${memberName}' is already approved — idempotent, no result frame re-sent`
    console.log(`${LOG_PREFIX} ${note} (team ${teamRunId})`)
    return {
      teamRunId,
      memberName,
      approverName,
      status: 'shutdown_approved',
      approvedAt,
      alreadyApproved: true,
      memberPhaseFlipped: false,
      resultDelivered: false,
      note,
    }
  }

  let resultDelivered = false
  let note = `member '${memberName}' is shutdown_approved`
  if (approverName === TEAM_LEAD_SENTINEL) {
    // 自指帧臂（文件头成文的 (B) 形态差异）：lead 亲批（含第四路代批准）
    // 时结果帧的收件人就是调用方自己，原生相邻面无此边——不投，note 承载
    // 「lead 已知」的事实。上游 mailbox leadRecipient 可自投，语义等价。
    note = `${note} (result frame self-addressed — the lead is the approver, nothing to relay)`
    console.log(`${LOG_PREFIX} ${note} (team ${teamRunId})`)
  } else {
    const leadSessionId = state.leadSessionId
    if (leadSessionId === undefined) {
      throw new TeamShutdownError(
        `team ${teamRunId} is missing a leadSessionId — the approval result frame has no addressee`,
        'LEAD_SESSION_MISSING',
      )
    }
    try {
      await deliverShutdownFrame(
        deps,
        caller,
        leadSessionId,
        buildTeamShutdownApprovedContent(randomUUID(), approverName, memberName),
        exec.signal,
      )
      resultDelivered = true
    } catch (err) {
      // 账已落（上游 transition→send 同序：批准先于投帧提交），投帧失败
      // 响亮冒泡但不退批准账——批准是已发生的事实。
      throw new TeamShutdownError(
        `${TEAM_APPROVE_SHUTDOWN_TOOL_NAME}: approval recorded but the result frame to the lead failed: ${err instanceof Error ? err.message : String(err)}`,
        'DELIVERY_FAILED',
      )
    }
  }
  console.log(`${LOG_PREFIX} shutdown approved by '${approverName}' for member '${memberName}' (team ${teamRunId}, phaseFlipped=${memberPhaseFlipped})`)
  return {
    teamRunId,
    memberName,
    approverName,
    status: 'shutdown_approved',
    approvedAt,
    alreadyApproved: false,
    memberPhaseFlipped,
    resultDelivered,
    note,
  }
}

// ── ③ team_reject_shutdown（lead 或目标成员本人；reason 必填）──────────────

/**
 * 执行链（上游 rejectShutdown shutdown.ts:109-148 的语义序）：参数（reason
 * 必填 min(1)，上游 zod 的运行时对应）→ team 在场 → 权限（lead 或
 * 本人；先于状态闸——gating 分层序）→ 状态闸 → 账本 reject（无请求具名抛 / 同 reason 已拒幂等 / 不同 reason 重拒）
 * → 结果帧发 lead（拒绝者 = lead 时自指跳过）。**成员不 interrupt、团队
 * status 不变**（team 存活语义，Q1a §5.2）。
 */
export async function executeTeamRejectShutdown(
  args: { teamRunId?: unknown; memberName?: unknown; reason?: unknown },
  exec: TeamToolExecAlias,
  deps: TeamShutdownDeps,
): Promise<TeamRejectShutdownResult> {
  const teamRunId = requireTeamRunId(args.teamRunId)
  const memberName = requireMemberName(args.memberName, TEAM_REJECT_SHUTDOWN_TOOL_NAME)
  if (typeof args.reason !== 'string' || args.reason.length === 0) {
    throw new TeamShutdownError(
      `${TEAM_REJECT_SHUTDOWN_TOOL_NAME} requires a non-empty reason`,
      'REASON_REQUIRED',
    )
  }
  const reason = args.reason
  const caller = exec.agent
  if (caller === undefined) {
    throw new TeamShutdownError(
      `${TEAM_REJECT_SHUTDOWN_TOOL_NAME}: exec.agent is undefined — the tool needs the live calling agent to authorize the rejection`,
      'CALLER_MISSING',
    )
  }
  const state = deps.store.get(teamRunId)
  if (state === undefined) {
    throw new TeamShutdownError(
      `${TEAM_REJECT_SHUTDOWN_TOOL_NAME}: no team run '${teamRunId}' in the team state store`,
      'TEAM_NOT_FOUND',
    )
  }
  // 权限层先于运行态闸（approve/request 两处同序，评审 T7-NIT）。
  const rejectorName = authorizeShutdownApproval(
    TEAM_REJECT_SHUTDOWN_TOOL_NAME, state, caller, memberName,
  )
  assertTeamAcceptsHandshake(state, teamRunId)

  let alreadyRejected: boolean
  let request: TeamShutdownRequest
  try {
    ({ alreadyRejected, request } = await deps.store.rejectShutdown(teamRunId, memberName, reason))
  } catch (err) {
    throw wrapStoreError(err)
  }
  if (alreadyRejected) {
    const note = `shutdown for '${memberName}' is already rejected with the same reason — idempotent, no result frame re-sent`
    console.log(`${LOG_PREFIX} ${note} (team ${teamRunId})`)
    return {
      teamRunId,
      memberName,
      rejectedBy: rejectorName,
      reason,
      status: 'shutdown_rejected',
      rejectedAt: request.rejectedAt ?? 0,
      alreadyRejected: true,
      resultDelivered: false,
      note,
    }
  }

  let resultDelivered = false
  let note = `shutdown request of '${memberName}' rejected; team stays active`
  if (rejectorName === TEAM_LEAD_SENTINEL) {
    note = `${note} (result frame self-addressed — the lead is the rejector, nothing to relay)`
    console.log(`${LOG_PREFIX} ${note} (team ${teamRunId})`)
  } else {
    const leadSessionId = state.leadSessionId
    if (leadSessionId === undefined) {
      throw new TeamShutdownError(
        `team ${teamRunId} is missing a leadSessionId — the rejection result frame has no addressee`,
        'LEAD_SESSION_MISSING',
      )
    }
    try {
      await deliverShutdownFrame(
        deps,
        caller,
        leadSessionId,
        buildTeamShutdownRejectedContent(randomUUID(), rejectorName, memberName, reason),
        exec.signal,
      )
      resultDelivered = true
    } catch (err) {
      throw new TeamShutdownError(
        `${TEAM_REJECT_SHUTDOWN_TOOL_NAME}: rejection recorded but the result frame to the lead failed: ${err instanceof Error ? err.message : String(err)}`,
        'DELIVERY_FAILED',
      )
    }
  }
  console.log(`${LOG_PREFIX} shutdown rejected by '${rejectorName}' for member '${memberName}' (team ${teamRunId})`)
  return {
    teamRunId,
    memberName,
    rejectedBy: rejectorName,
    reason,
    status: 'shutdown_rejected',
    rejectedAt: request.rejectedAt ?? 0,
    alreadyRejected: false,
    resultDelivered,
    note,
  }
}

// ── 工具定义（dsh-tools raw register 方言；与 team_create/team_send_message 同款纪律）──

/** team_shutdown_request 定义（描述首句 = 上游 lifecycle-shutdown-tools.ts:71 逐字）。 */
export function createTeamShutdownRequestDefinition(deps: TeamShutdownDeps): unknown {
  return {
    name: TEAM_SHUTDOWN_REQUEST_TOOL_NAME,
    description:
      'Request shutdown for a team member. '
      + 'Lead-only: the inquiry rides the native adjacent channel to the member, who replies with team_approve_shutdown or team_reject_shutdown. '
      + 'There is NO automatic timeout — after a reasonable window without a self-approval, the lead may approve on the member\'s behalf.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['teamRunId', 'targetMemberName'],
      properties: {
        teamRunId: { type: 'string', minLength: 1, description: 'Active team run id (from team_create).' },
        targetMemberName: { type: 'string', minLength: 1, description: 'Member to request shutdown for.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['teamRunId', 'targetMemberName', 'requesterName', 'status', 'alreadyPending', 'inquiryDelivered', 'note'],
        properties: {
          teamRunId: { type: 'string' },
          targetMemberName: { type: 'string' },
          requesterName: { type: 'string' },
          status: { type: 'string', enum: ['shutdown_requested'] },
          alreadyPending: { type: 'boolean' },
          inquiryDelivered: { type: 'boolean' },
          note: { type: 'string' },
        },
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args: { teamRunId?: unknown; targetMemberName?: unknown }, exec: TeamShutdownToolExec) =>
      executeTeamShutdownRequest(args, exec, deps),
  }
}

/** team_approve_shutdown 定义（描述首句 = 上游 :96 逐字；代批准语义 = addendum :123）。 */
export function createTeamApproveShutdownDefinition(deps: TeamShutdownDeps): unknown {
  return {
    name: TEAM_APPROVE_SHUTDOWN_TOOL_NAME,
    description:
      'Approve a pending shutdown request. '
      + 'Caller must be the target member or the team lead — a lead approving after a reasonable window without a self-approval is the sanctioned fourth path. '
      + 'Approving flips the member to shutdown_approved (completed/errored members keep their terminal state); teardown itself is team_delete\'s job.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['teamRunId', 'memberName'],
      properties: {
        teamRunId: { type: 'string', minLength: 1, description: 'Active team run id (from team_create).' },
        memberName: { type: 'string', minLength: 1, description: 'Member whose shutdown request is approved.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['teamRunId', 'memberName', 'approverName', 'status', 'approvedAt', 'alreadyApproved', 'memberPhaseFlipped', 'resultDelivered', 'note'],
        properties: {
          teamRunId: { type: 'string' },
          memberName: { type: 'string' },
          approverName: { type: 'string' },
          status: { type: 'string', enum: ['shutdown_approved'] },
          approvedAt: { type: 'number' },
          alreadyApproved: { type: 'boolean' },
          memberPhaseFlipped: { type: 'boolean' },
          resultDelivered: { type: 'boolean' },
          note: { type: 'string' },
        },
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args: { teamRunId?: unknown; memberName?: unknown }, exec: TeamToolExecAlias) =>
      executeTeamApproveShutdown(args, exec, deps),
  }
}

/** team_reject_shutdown 定义（描述首句 = 上游 :116 逐字；reason 必填 = 上游 zod min(1)）。 */
export function createTeamRejectShutdownDefinition(deps: TeamShutdownDeps): unknown {
  return {
    name: TEAM_REJECT_SHUTDOWN_TOOL_NAME,
    description:
      'Reject a pending shutdown request. '
      + 'Caller must be the target member or the team lead; a reason is required. '
      + 'Rejecting keeps the team active and the member running — the request stays resolved until a fresh request.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['teamRunId', 'memberName', 'reason'],
      properties: {
        teamRunId: { type: 'string', minLength: 1, description: 'Active team run id (from team_create).' },
        memberName: { type: 'string', minLength: 1, description: 'Member whose shutdown request is rejected.' },
        reason: { type: 'string', minLength: 1, description: 'Why the shutdown is refused (required).' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['teamRunId', 'memberName', 'rejectedBy', 'reason', 'status', 'rejectedAt', 'alreadyRejected', 'resultDelivered', 'note'],
        properties: {
          teamRunId: { type: 'string' },
          memberName: { type: 'string' },
          rejectedBy: { type: 'string' },
          reason: { type: 'string' },
          status: { type: 'string', enum: ['shutdown_rejected'] },
          rejectedAt: { type: 'number' },
          alreadyRejected: { type: 'boolean' },
          resultDelivered: { type: 'boolean' },
          note: { type: 'string' },
        },
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args: { teamRunId?: unknown; memberName?: unknown; reason?: unknown }, exec: TeamToolExecAlias) =>
      executeTeamRejectShutdown(args, exec, deps),
  }
}

// ── 按角色分发（三 manifest 行 = 三 registrar = 三 listener，一 row 一间）───
// lead 面：root 会话追加三件（request 只在这张面上存在——member 面结构上
// 没有 team_shutdown_request，任务书 P5-T7 交付面 5 的结构性纪律）；
// member 面：team 子女（participation + ACTIVE 状态闸，team-create.ts 同一
// 闸序）装 approve/reject（本人回复的唯一出口），**不装** request/delete。
// 真闸在工具执行处（权限/状态），分发处的面收窄是第一道结构性防线。

/** 三 registrar 共用的成员面资格判定（team-create.ts / team-message.ts 同一闸序）。 */
function memberFaceEligible(deps: TeamShutdownDeps, sessionId: string): string | undefined {
  const participation = deps.store.participationOfMember(sessionId)
  if (participation === undefined) return undefined
  const state = deps.store.get(participation.teamRunId)
  if (state === undefined) {
    console.warn(
      `${LOG_PREFIX} impossible state: member session ${sessionId} has a participation row for team run ${participation.teamRunId} but that run's state is missing from the store — shutdown surface NOT installed`,
    )
    return undefined
  }
  if (!ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) return undefined
  return participation.memberName
}

/** team_shutdown_request 的面装配：lead-only（root 会话），成员面结构性缺席。 */
export function registerTeamShutdownRequestSurface(
  ctx: { on(event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown): unknown },
  deps: TeamShutdownDeps,
): () => void {
  const off = ctx.on('agent/created', ({ agent }) => {
    const header = agent.session.header
    const isChild = header.origin === 'subagent' || header.parentSession !== undefined
    if (isChild) return // member 面结构性无 team_shutdown_request（lead-only 的结构半）
    agent.ctx.tools.register(createTeamShutdownRequestDefinition(deps))
    console.log(`${LOG_PREFIX} lead-only shutdown-request surface installed on root session ${header.id}`)
  })
  return () => {
    if (typeof off === 'function') (off as () => void)()
  }
}

/** team_approve_shutdown 的面装配：lead + 成员本人（UNIVERSAL 语义族）。 */
export function registerTeamApproveShutdownSurface(
  ctx: { on(event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown): unknown },
  deps: TeamShutdownDeps,
): () => void {
  const off = ctx.on('agent/created', ({ agent }) => {
    const header = agent.session.header
    const isChild = header.origin === 'subagent' || header.parentSession !== undefined
    if (!isChild) {
      agent.ctx.tools.register(createTeamApproveShutdownDefinition(deps))
      console.log(`${LOG_PREFIX} approve surface installed on root session ${header.id}`)
      return
    }
    const memberName = memberFaceEligible(deps, header.id)
    if (memberName === undefined) return
    agent.ctx.tools.register(createTeamApproveShutdownDefinition(deps))
    console.log(`${LOG_PREFIX} approve surface installed on member session ${header.id} ('${memberName}')`)
  })
  return () => {
    if (typeof off === 'function') (off as () => void)()
  }
}

/** team_reject_shutdown 的面装配：lead + 成员本人（与 approve 同族同形）。 */
export function registerTeamRejectShutdownSurface(
  ctx: { on(event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown): unknown },
  deps: TeamShutdownDeps,
): () => void {
  const off = ctx.on('agent/created', ({ agent }) => {
    const header = agent.session.header
    const isChild = header.origin === 'subagent' || header.parentSession !== undefined
    if (!isChild) {
      agent.ctx.tools.register(createTeamRejectShutdownDefinition(deps))
      console.log(`${LOG_PREFIX} reject surface installed on root session ${header.id}`)
      return
    }
    const memberName = memberFaceEligible(deps, header.id)
    if (memberName === undefined) return
    agent.ctx.tools.register(createTeamRejectShutdownDefinition(deps))
    console.log(`${LOG_PREFIX} reject surface installed on member session ${header.id} ('${memberName}')`)
  })
  return () => {
    if (typeof off === 'function') (off as () => void)()
  }
}
