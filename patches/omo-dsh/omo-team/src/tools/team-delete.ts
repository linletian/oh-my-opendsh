// team-delete.ts — P5-T7 · team_delete 工具（拆除路径：DELETABLE 门禁 +
// force 旁路 + 原生 interrupt（保 inbox）+ drain + deleting→deleted）。
//
// ── 语义移植声明（SEMANTIC PORT, NOT A COPY）────────────────────────────────
// 上游源路径（署名，OMO tag v4.19.4 = commit b072d279110bdda2c6ac2525d0d24dc54d16148a，
// PRE-3 冻结基线；逐字原文已入证据档 Q1a-tools-lifecycle.md §2.2/§5）：
//   - packages/omo-opencode/src/features/team-mode/tools/lifecycle-shutdown-tools.ts
//     —— 工具骨架与门禁词汇：描述 :53-58 `"Delete a completed or
//     shutdown-approved team run. Pass force=true to tear it down even while
//     members are still active."` 逐字承载；lead-only 具名拒（gating hook
//     的 `team_delete is lead-only` 同一裁决）；force 旁路的 lead 半
//     （hook :87-98：force + orphaned/deleting + participant 可绕 lead-only）
//     在本文件 enforcePermissions 同形承载。
//   - packages/omo-opencode/src/features/team-mode/team-runtime/delete-team.ts
//     —— 拆除执行序（deleteTeam :72-108 + deleteTeamResources :110-196）：
//     ① 非 force 且存在非 DELETABLE 成员 → `members still active` 具名拒
//     （:74-76 逐字，DELETABLE_MEMBER_STATUSES = completed|shutdown_approved|
//     errored，shutdown-helpers.ts:7-11——本仓词表 = team-state.ts 的
//     TEAM_DELETABLE_MEMBER_PHASES，同一三值）；② run 状态白名单
//     DELETABLE_TEAM_STATUSES（active|shutdown_requested|deleting|deleted，
//     :25-30），force 扩 FORCE_DELETABLE_TEAM_STATUSES（+creating|orphaned，
//     :32-36），表外具名抛 `team cannot be deleted from '<status>'`（:81-83
//     逐字——failed 连 force 都不收，上游事实随行）；③ → deleting（force 对
//     creating|orphaned 走绕表直存，:133-140 语义 = team-state.ts
//     forceTransitionToDeleting）；④ 资源拆除（tmux/worktree 两臂 D4 不采，
//     (B) 形态的执行面 = 原生 interrupt + drain，见下）；⑤ → deleted
//     （transition 合法性由 team-state.ts 迁移表钉死：deleting→deleted）；
//     ⑥ unregisterTeamSessionsByTeam（:190）= team-state.ts
//     retireRunIndexes（tombstone 留行、参与索引撤账）。
//   - packages/senpi-task/src/team/runtime.ts:48-51 —— senpi 侧「缺账 =
//     已删 no-op」的幂等双删语义**不采**（Q1a NOTES 两套面并存的事实）：
//     本仓 team_delete 对无账团队具名拒 TEAM_NOT_FOUND（OMO 面 delete-team
//     的 loadRuntimeState 抛同一族），差异记此。
//
// ── 底层执行面（任务书 P5-T7 钉死，fork (B)）───────────────────────────────
// 原生 `ctx.subagents.interrupt(targetSessionId, { kind:'ancestor', agent })`
// ——T5 首败回滚同款：authority 'ancestor' 携 lead 活体 agent（dsh-subagent
// index.js:843-855 的 lineage 校验 + `cancel({kind:'parent'},
// { keepInbox: true })`——**保 inbox** 是这条原生边的固有语义（keepInbox
// 由宿主在 index.js:855 写死，本仓不传也不改），成员已收的询问帧/消息帧
// 不随 interrupt 抹除）+ 一把 `drainContinuableChildren(lead, childIds)`
// 释放驻留句柄（index.js:2957）。
// 调用序钉死（单测）：**逐成员 interrupt → 一次 drain**（与 T5 回滚同序——
// 先停火再收柄，反序会让 drain 等一个还在烧的会话）。
//
// 「保 inbox」的证明面（评审 T7-MAJOR 裁决，措辞如实收窄）：
//   * e2e **主锚** = delete 收停成员之后，driver 经原生通道（Remote
//     `subagents/prompt`，与团队消息同一条 deliverToChild/coldResume 管线）
//     向已停成员**再投一条新消息**，断言它落进成员日志（spliced/turn 活动）
//     ——成员会话与其原生 inbox 通道**活过了 teardown 的 interrupt+drain**、
//     仍接收投递，这才可证伪：若拆除把成员通道拆了（dispose 而非 interrupt
//     那类实现），这条投递落不进。drive.mjs
//     `postDeleteNativeDeliveryLandedAtAnalyst`。
//   * 旧断言（成员日志在 delete 之后仍**读到**删除前落库的询问帧/拒批/
//     批准结果）降级为**辅助证据**：append-only 日志下它不可单独证伪
//     keepInbox（drive.mjs `inboxPreservedThroughDelete` 行注同文）。
//   * keepInbox:true 本身钉在单测调用参数上（authority 'ancestor' + 精确
//     活体 lead agent + 闭形 authority 对象，与 T5 回滚臂对拍见
//     team-create.test.ts 的 `channel.interrupts` 深等值）——本仓经通道
//     不可表达 keepInbox:false，宿主写死处即语义所在，引用为证。
//
// ── deleted 后的具名不可再用（assertTeamAcceptsMessages 对齐）───────────────
// tombstone 行留在骨架（status='deleted'）：team_send_message / 握手三件对
// deleted 团队具名拒（TEAM_DELETED `team <id> is deleted`，team-message.ts
// 既有错误族——上游 assertTeamAcceptsMessages 对 deleting/deleted 的同一
// 裁决面，send.ts:67-80）；team_status 是**查询面**可读 tombstone（上游
// query.ts 对 deleted 态同样返回聚合，差异不成文即默认同构）。嵌套闸
// participantOf 只数 ACTIVE 态 + retireRunIndexes 双保险，lead 拆完可再组队。
//
// strip-only 纪律（T5 NOTES-6）：本文件不用参数属性；零 @deepseek-ai
// import（TeamContinuableChannel/TeamLiveAgents/TeamAgent 复用既有声明）。

import { TEAM_DELETABLE_MEMBER_PHASES, type TeamStateStore } from '../team/team-state.ts'
import type { TeamAgent, TeamContinuableChannel } from './team-create.ts'
import type { TeamLiveAgents } from './team-message.ts'

/** 工具名（manifest.ts team_delete 行的 id 同一词汇）。 */
export const TEAM_DELETE_TOOL_NAME = 'team_delete'

/** 本文件的日志前缀（工具层前缀体例）。 */
const LOG_PREFIX = '[omo-team team_delete]'

/**
 * run 状态白名单（上游 delete-team.ts:25-30 DELETABLE_TEAM_STATUSES 逐字
 * 词表）与 force 扩展集（:32-36 +creating|orphaned）。deleting/deleted 在
 * 白名单内 = 幂等重删的入口（上游同：重删走一遍资源拆除，interrupt/drain
 * 对已散的孩子天然 no-op，dsh-subagent index.js:849 的 resident-miss 早退）。
 */
export const TEAM_DELETABLE_STATUSES: ReadonlySet<string> = new Set<string>([
  'active',
  'shutdown_requested',
  'deleting',
  'deleted',
])
export const TEAM_FORCE_DELETABLE_STATUSES: ReadonlySet<string> = new Set<string>([
  ...TEAM_DELETABLE_STATUSES,
  'creating',
  'orphaned',
])

/** team_delete 错误族（具名 code + 上游文案；显式字段，strip-only）。 */
export class TeamDeleteError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'TeamDeleteError'
    this.code = code
  }
}

/** 工具层装配依赖（interrupt + drain 通道、活体注册表取 lead、状态骨架）。 */
export interface TeamDeleteDeps {
  readonly subagents: TeamContinuableChannel
  readonly agents: TeamLiveAgents
  readonly store: TeamStateStore
}

/** execute 的第二参（同族工具同一形状）。 */
interface TeamDeleteToolExec {
  readonly agent?: TeamAgent
  readonly signal: AbortSignal
}

/** team_delete 的成功返回（interruptedSessionIds = 本次 interrupt 的具名单）。 */
export interface TeamDeleteResult {
  readonly teamRunId: string
  readonly status: 'deleted'
  readonly forced: boolean
  readonly forceCompletedMembers: readonly string[]
  readonly interruptedSessionIds: readonly string[]
  readonly note: string
}

/**
 * 执行链（上游 deleteTeam 的序逐段对齐，见文件头①-⑥）：
 * 参数 → team 在场（TEAM_NOT_FOUND 具名）→ 权限（lead-only；force +
 * orphaned/deleting + 本队 participant 的旁路上游同形）→ 非 force 的
 * DELETABLE 门禁（`members still active` 逐字 + 点名活跃名单）→ force 的
 * 成员预清账（pending|running|idle → completed）→ 状态白名单（表外
 * `team cannot be deleted from '<status>'` 逐字）→ deleting（正常迁移；
 * force 对 creating|orphaned 绕表）→ interrupt 逐成员（ancestor = lead
 * 活体）→ drain 一把 → deleted → retireRunIndexes（tombstone 留行）。
 */
export async function executeTeamDelete(
  args: { teamRunId?: unknown; force?: unknown },
  exec: TeamDeleteToolExec,
  deps: TeamDeleteDeps,
): Promise<TeamDeleteResult> {
  if (typeof args.teamRunId !== 'string' || args.teamRunId.length === 0) {
    throw new TeamDeleteError('teamRunId is required and must be a non-empty string', 'TEAM_RUN_ID_REQUIRED')
  }
  const teamRunId = args.teamRunId
  const forced = args.force === true
  const caller = exec.agent
  if (caller === undefined) {
    throw new TeamDeleteError(
      `${TEAM_DELETE_TOOL_NAME}: exec.agent is undefined — teardown needs the live calling agent`,
      'CALLER_MISSING',
    )
  }
  const state = deps.store.get(teamRunId)
  if (state === undefined) {
    throw new TeamDeleteError(
      `${TEAM_DELETE_TOOL_NAME}: no team run '${teamRunId}' in the team state store`,
      'TEAM_NOT_FOUND',
    )
  }
  const callerSessionId = caller.session.header.id

  // 权限：lead-only；上游 hook.ts:87-98 的 force 旁路半同形——force 且
  // run 卡在 deleting/orphaned 且 caller 是本队 participant（lead 或成员）
  // 时可绕（(B) 形态无独立 session-registry，participant 查状态骨架双账）。
  const isLead = state.leadSessionId === callerSessionId
  const isMember = deps.store.participationOfMember(callerSessionId)?.teamRunId === teamRunId
  const forceBypass = forced && (state.status === 'orphaned' || state.status === 'deleting') && (isLead || isMember)
  if (!isLead && !forceBypass) {
    throw new TeamDeleteError(`${TEAM_DELETE_TOOL_NAME} is lead-only`, 'LEAD_ONLY')
  }

  // ① 非 force 的 DELETABLE 门禁（上游 :74-76 逐字文案 + 点名活跃名单，
  // 点名词尾格式与 team-message.ts 的 32KB 臂同一族）。
  if (!forced) {
    const stillActive = state.members.filter((member) => !TEAM_DELETABLE_MEMBER_PHASES.has(member.phase))
    if (stillActive.length > 0) {
      throw new TeamDeleteError(
        `members still active (${stillActive.map((member) => `${member.name}=${member.phase}`).join(', ')})`,
        'MEMBERS_STILL_ACTIVE',
      )
    }
  }

  // ② 状态白名单（表外连 force 都拒——failed 不在 force 扩展集里，上游
  // FORCE_DELETABLE_TEAM_STATUSES 的闭包事实逐字随表）。
  const deletableStatuses = forced ? TEAM_FORCE_DELETABLE_STATUSES : TEAM_DELETABLE_STATUSES
  if (!deletableStatuses.has(state.status)) {
    throw new TeamDeleteError(`team cannot be deleted from '${state.status}'`, 'TEAM_NOT_DELETABLE')
  }

  // ③ force 的成员预清账（上游 :114-123）+ 入 deleting（:125-141）。
  const forceCompletedMembers = forced ? await deps.store.forceCompleteMembers(teamRunId) : []
  if (state.status === 'creating' || state.status === 'orphaned') {
    // force 绕表臂（上游 saveRuntimeState 绕 VALIDATION 的同一语义，收窄
    // 成显式入口 team-state.ts:forceTransitionToDeleting）。
    await deps.store.forceTransitionToDeleting(teamRunId)
  } else if (state.status === 'active' || state.status === 'shutdown_requested') {
    await deps.store.transition(teamRunId, 'deleting')
  }
  // deleting/deleted：同态放行（幂等重删入口，上游 :126 同一早判）。

  // ④ 资源拆除：interrupt 逐成员（保 inbox 的原生 cancel）→ drain 一把。
  // lead 活体 = ancestor authority 的载体；lead 不在场 = 响亮具名拒
  // （账已入 deleting，重试的下一拍 lead 若在，路径可续）。
  const lead = deps.agents.get(state.leadSessionId ?? callerSessionId)
  const interruptAgent = state.leadSessionId === undefined || state.leadSessionId === callerSessionId ? caller : lead
  if (interruptAgent === undefined) {
    throw new TeamDeleteError(
      `${TEAM_DELETE_TOOL_NAME}: live lead agent for session ${state.leadSessionId ?? callerSessionId} is required as ancestor authority for interrupt — retry once the lead is live`,
      'LEAD_NOT_LIVE',
    )
  }
  const interruptedSessionIds: string[] = []
  const faults: string[] = []
  const current = deps.store.get(teamRunId) ?? state
  for (const member of current.members) {
    if (member.sessionId === undefined) continue
    interruptedSessionIds.push(member.sessionId)
    try {
      deps.subagents.interrupt(member.sessionId, { kind: 'ancestor', agent: interruptAgent })
    } catch (err) {
      // 响亮不吞（T5 回滚同纪律）：fault 进错误文本，其余成员继续拆。
      faults.push(`${member.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  try {
    await deps.subagents.drainContinuableChildren(interruptAgent, interruptedSessionIds)
  } catch (err) {
    faults.push(`drain: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (faults.length > 0) {
    throw new TeamDeleteError(
      `${TEAM_DELETE_TOOL_NAME}: teardown faults for team ${teamRunId}: ${faults.join('; ')}`,
      'TEARDOWN_FAULT',
    )
  }

  // ⑤ → deleted + ⑥ 参与索引撤账（tombstone 留行）。
  await deps.store.transition(teamRunId, 'deleted')
  deps.store.retireRunIndexes(teamRunId)
  console.log(
    `${LOG_PREFIX} team ${teamRunId} deleted (${interruptedSessionIds.length} member session(s) interrupted + drained, forced=${forced}${forceCompletedMembers.length > 0 ? `, force-completed: ${forceCompletedMembers.join(', ')}` : ''})`,
  )
  return {
    teamRunId,
    status: 'deleted',
    forced,
    forceCompletedMembers,
    interruptedSessionIds,
    note: `team ${teamRunId} deleted — member sessions interrupted with inbox preserved (native keepInbox); the teamRunId is now retired`,
  }
}

/** team_delete 定义（描述 = 上游 lifecycle-shutdown-tools.ts:53-58 逐字）。 */
export function createTeamDeleteDefinition(deps: TeamDeleteDeps): unknown {
  return {
    name: TEAM_DELETE_TOOL_NAME,
    description:
      'Delete a completed or shutdown-approved team run. Pass force=true to tear it down even while members are still active. '
      + 'Teardown interrupts every member session (native keepInbox — received messages are preserved) and drains the continuable children, then the teamRunId is retired: messaging/shutdown tools refuse it by name.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['teamRunId'],
      properties: {
        teamRunId: { type: 'string', minLength: 1, description: 'Team run id to delete.' },
        force: { type: 'boolean', description: 'Tear down even while members are still active.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['teamRunId', 'status', 'forced', 'forceCompletedMembers', 'interruptedSessionIds', 'note'],
        properties: {
          teamRunId: { type: 'string' },
          status: { type: 'string', enum: ['deleted'] },
          forced: { type: 'boolean' },
          forceCompletedMembers: { type: 'array', items: { type: 'string' } },
          interruptedSessionIds: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
        },
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args: { teamRunId?: unknown; force?: unknown }, exec: TeamDeleteToolExec) =>
      executeTeamDelete(args, exec, deps),
  }
}

/**
 * 按角色分发：lead 面（root 会话）装 team_delete；**成员面结构性缺席**
 * （任务书 P5-T7 交付面 5：结构性仍无 team_create/team_delete/
 * team_shutdown_request——权限闸是第二道，结构缺面是第一道）。
 */
export function registerTeamDeleteSurface(
  ctx: { on(event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown): unknown },
  deps: TeamDeleteDeps,
): () => void {
  const off = ctx.on('agent/created', ({ agent }) => {
    const header = agent.session.header
    const isChild = header.origin === 'subagent' || header.parentSession !== undefined
    if (isChild) return
    agent.ctx.tools.register(createTeamDeleteDefinition(deps))
    console.log(`${LOG_PREFIX} lead-only delete surface installed on root session ${header.id}`)
  })
  return () => {
    if (typeof off === 'function') (off as () => void)()
  }
}
