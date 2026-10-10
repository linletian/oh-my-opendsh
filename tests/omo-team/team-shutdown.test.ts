// P5-T7 — team-shutdown.ts 的结构化 mock 单测（关停握手四路 + 幂等三向 +
// 权限具名拒 + 消息联动逐字段）。
//
// WHY A STRUCTURAL MOCK AND NOT A REAL HOST. The unit boundary is the
// handshake's decision surface: WHO may call (lead-only / target-or-lead),
// WHICH ledger row moves (pending → approved / rejected), WHETHER the native
// channel is touched (idempotent arms must NOT re-send), and WHAT the frame
// says (inquiry carries the reply guidance; result frames name approver and
// reason). The real wake/delivery machinery is the e2e scenario's job
// (`team-shutdown-handshake`). Every ctx.subagents.sendMessage call is
// recorded field-by-field; every rejection is NAMED with the upstream text.
//
// 四路（任务书钉死的单测面）：
//   ① request      — lead 询问，成员欠一个回复；
//   ② approve      — 目标成员本人批准（phase 翻 shutdown_approved）；
//   ③ reject       — 本人拒绝（reason 必填，team 存活、phase 不动）；
//   ④ lead 代批准 — 成员未自批的合理窗口后 lead 亲批（上游 addendum :123
//      的第四路；自指结果帧跳过投递，note 承载「lead 已知」）。
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping).
import { describe, expect, it } from 'vitest'
import {
  TEAM_APPROVE_SHUTDOWN_TOOL_NAME,
  TEAM_REJECT_SHUTDOWN_TOOL_NAME,
  TEAM_SHUTDOWN_REQUEST_TOOL_NAME,
  TEAM_SHUTDOWN_SOURCE_KIND,
  TeamShutdownError,
  buildTeamShutdownApprovedContent,
  buildTeamShutdownRejectedContent,
  buildTeamShutdownRequestContent,
  createTeamApproveShutdownDefinition,
  createTeamRejectShutdownDefinition,
  createTeamShutdownRequestDefinition,
  executeTeamApproveShutdown,
  executeTeamRejectShutdown,
  executeTeamShutdownRequest,
  registerTeamApproveShutdownSurface,
  registerTeamRejectShutdownSurface,
  registerTeamShutdownRequestSurface,
  type TeamShutdownDeps,
} from '../../patches/omo-dsh/omo-team/src/tools/team-shutdown.ts'
import type { TeamAgent } from '../../patches/omo-dsh/omo-team/src/tools/team-create.ts'
import {
  TEAM_DELETABLE_MEMBER_PHASES,
  TEAM_LEAD_SENTINEL,
  TeamStateMemoryStore,
} from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

// ── mocks ─────────────────────────────────────────────────────────────────────

interface RecordedSend {
  senderId: string
  targetSessionId: string
  content: readonly { type: string; text: string }[]
}

interface MockSendChannel {
  sends: RecordedSend[]
  failOn: Set<string>
  sendMessage(
    sender: TeamAgent,
    targetSessionId: string,
    content: readonly { type: 'text'; text: string }[],
    options: { signal: AbortSignal },
  ): Promise<string>
}

function makeSendChannel(): MockSendChannel {
  return {
    sends: [],
    failOn: new Set<string>(),
    async sendMessage(sender, targetSessionId, content) {
      this.sends.push({ senderId: sender.session.header.id, targetSessionId, content })
      if (this.failOn.has(targetSessionId)) {
        throw new Error(`mock: sendMessage rejected for target ${targetSessionId}`)
      }
      return `accepted-shutdown-frame-${this.sends.length}`
    },
  }
}

function makeAgent(sessionId: string): TeamAgent {
  return {
    session: { header: { id: sessionId } },
    ctx: { tools: { register: (_def: unknown) => ({ id: `scoped-${sessionId}` }) } },
    inject: (_frame: unknown) => ({}),
  } as unknown as TeamAgent
}

const LEAD = 'lead-session-1'
const ANALYST_SESSION = 'child-analyst'
const BUILDER_SESSION = 'child-builder'

/** 一个 active 的两成员团队（analyst + builder），账本随 store 走。 */
function makeFixture(): { deps: TeamShutdownDeps; teamRunId: string; store: TeamStateMemoryStore } {
  const store = new TeamStateMemoryStore()
  const state = store.create({
    teamName: 'handshake-team',
    leadSessionId: LEAD,
    members: [
      { name: 'analyst', seat: 'sisyphus-junior', childId: ANALYST_SESSION },
      { name: 'builder', seat: 'hephaestus', childId: BUILDER_SESSION },
    ],
    now: 1700000000000,
  })
  store.transition(state.teamRunId, 'active')
  const deps: TeamShutdownDeps = { subagents: makeSendChannel(), store }
  return { deps, teamRunId: state.teamRunId, store }
}

const abortSignal = new AbortController().signal

/** 取回具名错误（.rejects.toMatchObject 读不到 code，这里逐枚收窄）。 */
async function rejectionOf(promise: Promise<unknown>): Promise<TeamShutdownError> {
  try {
    await promise
  } catch (err) {
    if (err instanceof TeamShutdownError) return err
    throw new Error(`expected TeamShutdownError, got ${String(err)}`)
  }
  throw new Error('expected a rejection, the promise resolved')
}

function frameText(content: readonly { type: string; text: string }[]): string {
  return content.map((block) => block.text).join('\n')
}

// ── ① team_shutdown_request ──────────────────────────────────────────────────

describe('P5-T7 executeTeamShutdownRequest — 询问路（lead-only）', () => {
  it('lead request delivers the inquiry frame to the member and records the pending row', async () => {
    const { deps, teamRunId } = makeFixture()
    const result = await executeTeamShutdownRequest(
      { teamRunId, targetMemberName: 'analyst' },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    )
    expect(result).toMatchObject({
      teamRunId,
      targetMemberName: 'analyst',
      requesterName: TEAM_LEAD_SENTINEL,
      status: 'shutdown_requested',
      alreadyPending: false,
      inquiryDelivered: true,
    })
    const sends = (deps.subagents as MockSendChannel).sends
    expect(sends).toHaveLength(1)
    expect(sends[0]!.senderId).toBe(LEAD)
    expect(sends[0]!.targetSessionId).toBe(ANALYST_SESSION)
    const text = frameText(sends[0]!.content)
    // 询问语义 + 回复指引（成员用 approve/reject 工具回复）+ 坐标。
    expect(text).toContain('Team shutdown request')
    expect(text).toContain('team_approve_shutdown')
    expect(text).toContain('team_reject_shutdown')
    expect(text).toContain(`"teamRunId":"${teamRunId}"`)
    expect(text).toContain(`"memberName":"analyst"`)
    const state = deps.store.get(teamRunId)!
    expect(state.shutdownRequests).toHaveLength(1)
    expect(state.shutdownRequests[0]).toMatchObject({ memberId: 'analyst', requesterName: TEAM_LEAD_SENTINEL })
    // 上游同纪律：request 不改团队 status（§5.3——`shutdown_requested` 只是返回字段）。
    expect(state.status).toBe('active')
    // 成员 phase 不动（询问不裁决）。
    expect(state.members.find((m) => m.name === 'analyst')!.phase).toBe('pending')
  })

  it('a non-lead caller is refused by the upstream verbatim text', async () => {
    const { deps, teamRunId } = makeFixture()
    const err = await rejectionOf(executeTeamShutdownRequest(
      { teamRunId, targetMemberName: 'analyst' },
      { agent: makeAgent(ANALYST_SESSION), signal: abortSignal },
      deps,
    ))
    expect(err.message).toBe(`${TEAM_SHUTDOWN_REQUEST_TOOL_NAME} is lead-only`)
    expect(err.code).toBe('LEAD_ONLY')
    expect((deps.subagents as MockSendChannel).sends).toHaveLength(0)
  })

  it('unknown member is refused by the upstream shutdown-helpers text', async () => {
    const { deps, teamRunId } = makeFixture()
    const err = await rejectionOf(executeTeamShutdownRequest(
      { teamRunId, targetMemberName: 'nobody' },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    ))
    expect(err.message).toBe(`unknown member 'nobody'`)
    expect(err.code).toBe('UNKNOWN_MEMBER')
  })

  it('an outstanding request short-circuits: no second inquiry, no second row (idempotent)', async () => {
    const { deps, teamRunId } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    const second = await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    expect(second.alreadyPending).toBe(true)
    expect(second.inquiryDelivered).toBe(false)
    expect(second.note).toContain('already pending')
    const sends = (deps.subagents as MockSendChannel).sends
    expect(sends).toHaveLength(1) // 通道只碰过一次
    expect(deps.store.get(teamRunId)!.shutdownRequests).toHaveLength(1)
  })

  it('a RESOLVED request never blocks a fresh one (senpi 倒序语义)', async () => {
    const { deps, teamRunId } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    await executeTeamRejectShutdown(
      { teamRunId, memberName: 'analyst', reason: 'still mid-analysis' },
      { agent: makeAgent(ANALYST_SESSION), signal: abortSignal },
      deps,
    )
    const again = await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    expect(again.alreadyPending).toBe(false)
    expect(deps.store.get(teamRunId)!.shutdownRequests).toHaveLength(2)
    expect((deps.subagents as MockSendChannel).sends).toHaveLength(3) // 询问 + 拒绝结果 + 新询问
  })

  it('delivery failure releases the ledger row so a retry can re-send', async () => {
    const { deps, teamRunId } = makeFixture()
    ;(deps.subagents as MockSendChannel).failOn.add(ANALYST_SESSION)
    const err = await rejectionOf(executeTeamShutdownRequest(
      { teamRunId, targetMemberName: 'analyst' },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    ))
    expect(err.code).toBe('DELIVERY_FAILED')
    expect(deps.store.get(teamRunId)!.shutdownRequests).toHaveLength(0) // 未送达不占幂等位
    // 修好通道后重试可再投。
    ;(deps.subagents as MockSendChannel).failOn.delete(ANALYST_SESSION)
    const retry = await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    expect(retry.alreadyPending).toBe(false)
    expect(retry.inquiryDelivered).toBe(true)
  })

  it('deleting/deleted teams refuse the handshake by name (assertTeamAcceptsMessages family)', async () => {
    const { deps, teamRunId, store } = makeFixture()
    store.transition(teamRunId, 'deleting')
    const deleting = await rejectionOf(executeTeamShutdownRequest(
      { teamRunId, targetMemberName: 'analyst' },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    ))
    expect(deleting.message).toBe('team is deleting')
    store.transition(teamRunId, 'deleted')
    const deleted = await rejectionOf(executeTeamShutdownRequest(
      { teamRunId, targetMemberName: 'analyst' },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    ))
    expect(deleted.code).toBe('TEAM_DELETED')
    expect(deleted.message).toBe(`team ${teamRunId} is deleted`)
  })
})

// ── ② team_approve_shutdown ──────────────────────────────────────────────────

describe('P5-T7 executeTeamApproveShutdown — 批准路（本人 + lead 代批第四路）', () => {
  it('the target member self-approves: phase flips, result frame rides to the lead', async () => {
    const { deps, teamRunId } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    ;(deps.subagents as MockSendChannel).sends.length = 0
    const result = await executeTeamApproveShutdown(
      { teamRunId, memberName: 'analyst' },
      { agent: makeAgent(ANALYST_SESSION), signal: abortSignal },
      deps,
    )
    expect(result).toMatchObject({
      teamRunId,
      memberName: 'analyst',
      approverName: 'analyst',
      status: 'shutdown_approved',
      alreadyApproved: false,
      memberPhaseFlipped: true,
      resultDelivered: true,
    })
    expect(result.approvedAt).toBeGreaterThan(0)
    const sends = (deps.subagents as MockSendChannel).sends
    expect(sends).toHaveLength(1)
    expect(sends[0]!.senderId).toBe(ANALYST_SESSION)
    expect(sends[0]!.targetSessionId).toBe(LEAD)
    expect(frameText(sends[0]!.content)).toContain('Team shutdown approved')
    expect(frameText(sends[0]!.content)).toContain('analyst')
    expect(deps.store.get(teamRunId)!.members.find((m) => m.name === 'analyst')!.phase).toBe('shutdown_approved')
    expect(deps.store.get(teamRunId)!.shutdownRequests[0]!.approvedAt).toBeDefined()
  })

  it('FOURTH PATH: the lead approves on the member\'s behalf after a reasonable window', async () => {
    // 上游 addendum refactor-sections/team-mode-addendum.ts:123 的同一动作：
    // 成员不自批，lead 亲调 team_approve_shutdown——权限天然覆盖，自指结果
    // 帧跳过原生投递（无 lead→lead 边），note 承载「lead 已知」。
    const { deps, teamRunId } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'builder' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    ;(deps.subagents as MockSendChannel).sends.length = 0
    const result = await executeTeamApproveShutdown(
      { teamRunId, memberName: 'builder' },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    )
    expect(result.approverName).toBe(TEAM_LEAD_SENTINEL)
    expect(result.memberPhaseFlipped).toBe(true)
    expect(result.resultDelivered).toBe(false)
    expect(result.note).toContain('self-addressed')
    expect((deps.subagents as MockSendChannel).sends).toHaveLength(0) // 自指不投
    expect(deps.store.get(teamRunId)!.members.find((m) => m.name === 'builder')!.phase).toBe('shutdown_approved')
  })

  it('no request at all is refused verbatim: shutdown request missing', async () => {
    const { deps, teamRunId } = makeFixture()
    const err = await rejectionOf(executeTeamApproveShutdown(
      { teamRunId, memberName: 'analyst' },
      { agent: makeAgent(ANALYST_SESSION), signal: abortSignal },
      deps,
    ))
    expect(err.message).toBe(`shutdown request missing for 'analyst'`)
    expect(err.code).toBe('SHUTDOWN_REQUEST_MISSING')
  })

  it('a second approval is idempotent: no re-send, no double stamp (幂等向二)', async () => {
    const { deps, teamRunId } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    const first = await executeTeamApproveShutdown({ teamRunId, memberName: 'analyst' }, { agent: makeAgent(ANALYST_SESSION), signal: abortSignal }, deps)
    ;(deps.subagents as MockSendChannel).sends.length = 0
    const second = await executeTeamApproveShutdown({ teamRunId, memberName: 'analyst' }, { agent: makeAgent(ANALYST_SESSION), signal: abortSignal }, deps)
    expect(second.alreadyApproved).toBe(true)
    expect(second.approvedAt).toBe(first.approvedAt)
    expect((deps.subagents as MockSendChannel).sends).toHaveLength(0)
  })

  it('completed/errored members KEEP their terminal phase even when approved', async () => {
    const { deps, teamRunId, store } = makeFixture()
    store.setMemberPhase(teamRunId, 'analyst', 'completed')
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    const result = await executeTeamApproveShutdown({ teamRunId, memberName: 'analyst' }, { agent: makeAgent(ANALYST_SESSION), signal: abortSignal }, deps)
    expect(result.memberPhaseFlipped).toBe(false)
    expect(store.get(teamRunId)!.members.find((m) => m.name === 'analyst')!.phase).toBe('completed')
    // 账照批（approvedAt 落行）——上游 map 臂同形。
    expect(store.get(teamRunId)!.shutdownRequests[0]!.approvedAt).toBeDefined()
    // completed 在 DELETABLE 集里——门禁词汇同一事实源。
    expect(TEAM_DELETABLE_MEMBER_PHASES.has('completed')).toBe(true)
  })

  it('a foreign caller is refused by the upstream verbatim permission text', async () => {
    const { deps, teamRunId } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    const err = await rejectionOf(executeTeamApproveShutdown(
      { teamRunId, memberName: 'analyst' },
      { agent: makeAgent(BUILDER_SESSION), signal: abortSignal },
      deps,
    ))
    expect(err.message).toBe(`${TEAM_APPROVE_SHUTDOWN_TOOL_NAME}: caller must be target member or team lead`)
    expect(err.code).toBe('PERMISSION_DENIED')
  })
})

// ── ③ team_reject_shutdown ───────────────────────────────────────────────────

describe('P5-T7 executeTeamRejectShutdown — 拒绝路（reason 必填，team 存活）', () => {
  it('the target member rejects with a reason: request resolved, phase untouched, frame carries reason', async () => {
    const { deps, teamRunId } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    ;(deps.subagents as MockSendChannel).sends.length = 0
    const result = await executeTeamRejectShutdown(
      { teamRunId, memberName: 'analyst', reason: 'halfway through the dependency map' },
      { agent: makeAgent(ANALYST_SESSION), signal: abortSignal },
      deps,
    )
    expect(result).toMatchObject({
      teamRunId,
      memberName: 'analyst',
      rejectedBy: 'analyst',
      reason: 'halfway through the dependency map',
      status: 'shutdown_rejected',
      alreadyRejected: false,
      resultDelivered: true,
    })
    const sends = (deps.subagents as MockSendChannel).sends
    expect(sends).toHaveLength(1)
    expect(sends[0]!.targetSessionId).toBe(LEAD)
    expect(frameText(sends[0]!.content)).toContain('Team shutdown rejected')
    expect(frameText(sends[0]!.content)).toContain('halfway through the dependency map')
    const state = deps.store.get(teamRunId)!
    expect(state.members.find((m) => m.name === 'analyst')!.phase).toBe('pending') // 不 interrupt、phase 不动
    expect(state.status).toBe('active') // team 存活
    expect(state.shutdownRequests[0]!.rejectedReason).toBe('halfway through the dependency map')
  })

  it('a missing reason is refused (上游 zod min(1) 的运行时对应)', async () => {
    const { deps, teamRunId } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    const err = await rejectionOf(executeTeamRejectShutdown(
      { teamRunId, memberName: 'analyst' },
      { agent: makeAgent(ANALYST_SESSION), signal: abortSignal },
      deps,
    ))
    expect(err.message).toContain('requires a non-empty reason')
    expect(err.code).toBe('REASON_REQUIRED')
  })

  it('the SAME reason twice is idempotent: no re-send (幂等向三)', async () => {
    const { deps, teamRunId } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    await executeTeamRejectShutdown({ teamRunId, memberName: 'analyst', reason: 'mid-work' }, { agent: makeAgent(ANALYST_SESSION), signal: abortSignal }, deps)
    ;(deps.subagents as MockSendChannel).sends.length = 0
    const second = await executeTeamRejectShutdown({ teamRunId, memberName: 'analyst', reason: 'mid-work' }, { agent: makeAgent(ANALYST_SESSION), signal: abortSignal }, deps)
    expect(second.alreadyRejected).toBe(true)
    expect(second.resultDelivered).toBe(false)
    expect((deps.subagents as MockSendChannel).sends).toHaveLength(0)
  })

  it('a DIFFERENT reason re-rejects: alreadyRejected=false, both frames sent, new reason lands (幂等向三的对偶)', async () => {
    // 上游 rejectShutdown :122-124 的幂等判据是 `rejectedAt && rejectedReason
    // === reason`——换 reason = 上游放行的重拒：账落新 reason，工具层**再投
    // 一帧**结果帧（mailbox 同判据的 (B) 承载）。与同 reason 幂等例对偶：
    // 那一例钉「同 reason 不发」，这一例钉「异 reason 必发」。
    const { deps, teamRunId, store } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    ;(deps.subagents as MockSendChannel).sends.length = 0 // 只数结果帧
    await executeTeamRejectShutdown({ teamRunId, memberName: 'analyst', reason: 'mid-work' }, { agent: makeAgent(ANALYST_SESSION), signal: abortSignal }, deps)
    const again = await executeTeamRejectShutdown(
      { teamRunId, memberName: 'analyst', reason: 'blocked on failing tests after all' },
      { agent: makeAgent(ANALYST_SESSION), signal: abortSignal },
      deps,
    )
    expect(again.alreadyRejected).toBe(false)
    expect(again.resultDelivered).toBe(true)
    expect(again.reason).toBe('blocked on failing tests after all')
    const sends = (deps.subagents as MockSendChannel).sends
    expect(sends).toHaveLength(2) // 两枚结果帧都发了——重拒不是幂等位
    expect(sends.every((s) => s.targetSessionId === LEAD)).toBe(true)
    expect(frameText(sends[0]!.content)).toContain('mid-work')
    expect(frameText(sends[1]!.content)).toContain('blocked on failing tests after all')
    // 账随行：最新一行的 reason 是新的，行数不涨（盖章不加行）。
    const requests = store.get(teamRunId)!.shutdownRequests
    expect(requests).toHaveLength(1)
    expect(requests[0]!.rejectedReason).toBe('blocked on failing tests after all')
  })

  it('no request at all is refused verbatim (approve/reject 同一具名)', async () => {
    const { deps, teamRunId } = makeFixture()
    const err = await rejectionOf(executeTeamRejectShutdown(
      { teamRunId, memberName: 'builder', reason: 'whatever' },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    ))
    expect(err.message).toBe(`shutdown request missing for 'builder'`)
  })
})

// ── 权限分层序（评审 T7-NIT）：权限闸先于运行态闸 ──────────────────────────

describe('P5-T7 permission layering — 越权具名拒先于运行态拒（gating 分层序）', () => {
  it('request: a non-lead hitting a deleting/deleted team gets the lead-only family FIRST', async () => {
    const { deps, teamRunId, store } = makeFixture()
    store.transition(teamRunId, 'deleting')
    const deleting = await rejectionOf(executeTeamShutdownRequest(
      { teamRunId, targetMemberName: 'analyst' },
      { agent: makeAgent(ANALYST_SESSION), signal: abortSignal },
      deps,
    ))
    // 「你不能做这件事」先于「这件事现在不能做」：LEAD_ONLY，不是 team is deleting。
    expect(deleting.code).toBe('LEAD_ONLY')
    expect(deleting.message).toBe(`${TEAM_SHUTDOWN_REQUEST_TOOL_NAME} is lead-only`)
    store.transition(teamRunId, 'deleted')
    const deleted = await rejectionOf(executeTeamShutdownRequest(
      { teamRunId, targetMemberName: 'analyst' },
      { agent: makeAgent(BUILDER_SESSION), signal: abortSignal },
      deps,
    ))
    expect(deleted.code).toBe('LEAD_ONLY')
    expect(deleted.message).not.toContain('is deleted')
    // 对照（分层不是偏置）：lead 撞 deleted 仍走运行态闸——TEAM_DELETED 具名。
    const leadHit = await rejectionOf(executeTeamShutdownRequest(
      { teamRunId, targetMemberName: 'analyst' },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    ))
    expect(leadHit.code).toBe('TEAM_DELETED')
  })

  it('approve/reject: a foreign caller on a deleted team gets the permission family, not the tombstone', async () => {
    const { deps, teamRunId, store } = makeFixture()
    await executeTeamShutdownRequest({ teamRunId, targetMemberName: 'analyst' }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    store.transition(teamRunId, 'deleting')
    store.transition(teamRunId, 'deleted')
    const approveErr = await rejectionOf(executeTeamApproveShutdown(
      { teamRunId, memberName: 'analyst' },
      { agent: makeAgent(BUILDER_SESSION), signal: abortSignal },
      deps,
    ))
    expect(approveErr.code).toBe('PERMISSION_DENIED')
    expect(approveErr.message).toBe(`${TEAM_APPROVE_SHUTDOWN_TOOL_NAME}: caller must be target member or team lead`)
    const rejectErr = await rejectionOf(executeTeamRejectShutdown(
      { teamRunId, memberName: 'analyst', reason: 'team is gone anyway' },
      { agent: makeAgent(BUILDER_SESSION), signal: abortSignal },
      deps,
    ))
    expect(rejectErr.code).toBe('PERMISSION_DENIED')
    expect(rejectErr.message).toBe(`${TEAM_REJECT_SHUTDOWN_TOOL_NAME}: caller must be target member or team lead`)
    // 对照：本人撞 deleted 仍拿 tombstone（权限过了才轮到运行态闸）。
    const selfHit = await rejectionOf(executeTeamApproveShutdown(
      { teamRunId, memberName: 'analyst' },
      { agent: makeAgent(ANALYST_SESSION), signal: abortSignal },
      deps,
    ))
    expect(selfHit.code).toBe('TEAM_DELETED')
  })
})

// ── 帧构造与 kind 席位 ───────────────────────────────────────────────────────

describe('P5-T7 shutdown frames & the reserved omo-team-shutdown kind', () => {
  it('frame builders carry the id/name/reason vocabulary in the two-block native shape', () => {
    const inquiry = buildTeamShutdownRequestContent('req-1', 'analyst', 'run-9')
    expect(inquiry[0]!.text).toBe('Team shutdown request req-1 from lead:')
    expect(frameText(inquiry)).toContain('"teamRunId":"run-9"')
    const approved = buildTeamShutdownApprovedContent('req-2', 'analyst', 'analyst')
    expect(approved[0]!.text).toBe('Team shutdown approved req-2 from analyst:')
    expect(frameText(approved)).toContain('shutdown_approved')
    const rejected = buildTeamShutdownRejectedContent('req-3', 'builder', 'builder', 'not yet')
    expect(rejected[0]!.text).toBe('Team shutdown rejected req-3 from builder:')
    expect(frameText(rejected)).toContain('not yet')
  })

  it('the Q-8 A3 kind seat is declared and v1 injects NO local frame', () => {
    // kind 常量在册（Q-8 §3.A3 的席位）；本 suite 的每一次通道触碰都是
    // 原生 sendMessage（sends 记录里没有 inject 面）——本地纪律帧 v1 不产，
    // 差异在 team-shutdown.ts 文件头成文。
    expect(TEAM_SHUTDOWN_SOURCE_KIND).toBe('omo-team-shutdown')
  })
})

// ── 按角色分发（面收窄）─────────────────────────────────────────────────────

describe('P5-T7 shutdown surfaces — lead 全装，成员面只有 approve/reject', () => {
  interface Registered { toolNames: string[] }
  function trackingAgent(sessionId: string, isChild: boolean): { agent: TeamAgent; log: Registered } {
    const log: Registered = { toolNames: [] }
    const agent = {
      session: { header: { id: sessionId, ...(isChild ? { origin: 'subagent', parentSession: LEAD } : {}) } },
      ctx: { tools: { register: (def: unknown) => { log.toolNames.push((def as { name: string }).name); return {} } } },
      inject: (_frame: unknown) => ({}),
    } as unknown as TeamAgent
    return { agent, log }
  }

  function listenerFor(register: typeof registerTeamShutdownRequestSurface, deps: TeamShutdownDeps) {
    let captured: ((payload: { agent: TeamAgent }) => unknown) | undefined
    register({ on: (_event, listener) => { captured = listener; return () => {} } }, deps)
    return (agent: TeamAgent) => captured!({ agent })
  }

  it('root session: request + approve + reject all land on the lead face', () => {
    const { deps, teamRunId } = makeFixture()
    void teamRunId
    const lead = trackingAgent(LEAD, false)
    listenerFor(registerTeamShutdownRequestSurface, deps)(lead.agent)
    listenerFor(registerTeamApproveShutdownSurface, deps)(lead.agent)
    listenerFor(registerTeamRejectShutdownSurface, deps)(lead.agent)
    expect(lead.log.toolNames).toEqual([
      TEAM_SHUTDOWN_REQUEST_TOOL_NAME,
      TEAM_APPROVE_SHUTDOWN_TOOL_NAME,
      TEAM_REJECT_SHUTDOWN_TOOL_NAME,
    ])
  })

  it('team-member child: approve + reject YES, request STRUCTURALLY ABSENT', () => {
    const { deps, teamRunId } = makeFixture()
    void teamRunId
    const member = trackingAgent(ANALYST_SESSION, true)
    listenerFor(registerTeamShutdownRequestSurface, deps)(member.agent)
    listenerFor(registerTeamApproveShutdownSurface, deps)(member.agent)
    listenerFor(registerTeamRejectShutdownSurface, deps)(member.agent)
    expect(member.log.toolNames).toEqual([TEAM_APPROVE_SHUTDOWN_TOOL_NAME, TEAM_REJECT_SHUTDOWN_TOOL_NAME])
  })

  it('a foreign child gets NOTHING from any of the three registrars', () => {
    const { deps, teamRunId } = makeFixture()
    void teamRunId
    const foreign = trackingAgent('foreign-child', true)
    listenerFor(registerTeamShutdownRequestSurface, deps)(foreign.agent)
    listenerFor(registerTeamApproveShutdownSurface, deps)(foreign.agent)
    listenerFor(registerTeamRejectShutdownSurface, deps)(foreign.agent)
    expect(foreign.log.toolNames).toEqual([])
  })

  it('the tool definitions keep the upstream first sentences verbatim', () => {
    const { deps, teamRunId } = makeFixture()
    void teamRunId
    const req = createTeamShutdownRequestDefinition(deps) as { name: string; description: string }
    expect(req.name).toBe(TEAM_SHUTDOWN_REQUEST_TOOL_NAME)
    expect(req.description.startsWith('Request shutdown for a team member.')).toBe(true)
    const approve = createTeamApproveShutdownDefinition(deps) as { description: string }
    expect(approve.description.startsWith('Approve a pending shutdown request.')).toBe(true)
    const reject = createTeamRejectShutdownDefinition(deps) as { description: string; parameters: { required: string[] } }
    expect(reject.description.startsWith('Reject a pending shutdown request.')).toBe(true)
    expect(reject.parameters.required).toEqual(['teamRunId', 'memberName', 'reason'])
  })
})
