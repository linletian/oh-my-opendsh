// P5-T7 — team-delete.ts 的结构化 mock 单测（DELETABLE 门禁 / force 旁路 /
// 迁移序 / interrupt+drain 调用序 / tombstone 具名不可再用）。
//
// WHY A STRUCTURAL MOCK. The unit boundary is teardown's decision surface:
// WHICH gate fires (`members still active` vs lead-only vs the status
// whitelist), in WHICH ORDER the host channel is touched (逐成员 interrupt →
// 一把 drain — 先停火再收柄), whether the run lands on 'deleted' THROUGH
// 'deleting' (the transition table is the law), and whether the participation
// indexes are retired while the tombstone row survives (the named refusal of
// a deleted teamRunId needs a row to say the name). The real process-level
// teardown (no orphans across generations) is the e2e scenario's job.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping).
import { describe, expect, it } from 'vitest'
import { makeStore } from './support/ephemeral-store.ts'
import {
  TEAM_DELETE_TOOL_NAME,
  TEAM_DELETABLE_STATUSES,
  TEAM_FORCE_DELETABLE_STATUSES,
  TeamDeleteError,
  createTeamDeleteDefinition,
  executeTeamDelete,
  registerTeamDeleteSurface,
  type TeamDeleteDeps,
} from '../../patches/omo-dsh/omo-team/src/tools/team-delete.ts'
import { executeTeamSendMessage } from '../../patches/omo-dsh/omo-team/src/tools/team-message.ts'
import type { TeamAgent, TeamMemberStartRequest } from '../../patches/omo-dsh/omo-team/src/tools/team-create.ts'
import {
  TEAM_DELETABLE_MEMBER_PHASES,
  TEAM_FORCE_COMPLETABLE_MEMBER_PHASES,
  TeamStateStore,
} from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

const LEAD = 'lead-session-1'

function makeAgent(sessionId: string): TeamAgent {
  return {
    session: { header: { id: sessionId } },
    ctx: { tools: { register: (_def: unknown) => ({}) } },
    inject: (_frame: unknown) => ({}),
  } as unknown as TeamAgent
}

/** 通道 mock：interrupt / drain 调用逐枚记录（序 = 断言对象）。 */
interface MockChannel {
  // authority 按**原样**记录（对象不拆解）——评审 T7-MAJOR 的调用参数逐字钉：
  // 深等值 + 活体同一性（agent === 那枚 lead）都读这份原始记录。
  interrupts: Array<{ targetSessionId: string; authority: { kind: string; agent?: TeamAgent; parentSessionId?: string } }>
  drains: Array<{ parent: TeamAgent; parentId: string; childIds: readonly string[] }>
  failInterruptOn: Set<string>
  /** P5-T16（MINOR-6）：drain 失败开关（与 interrupt 失败分开判）。 */
  failDrain: boolean
  interrupt(targetSessionId: string, authority: { kind: string; agent?: TeamAgent; parentSessionId?: string }): unknown
  drainContinuableChildren(parent: TeamAgent, childIds: readonly string[]): Promise<void>
  startContinuable(spec: {
    provider: string
    label: string
    childId?: string
    request: TeamMemberStartRequest
    signal: AbortSignal
  }): Promise<{ childId: string; messageId: string }>
}

function makeChannel(): MockChannel {
  return {
    interrupts: [],
    drains: [],
    failInterruptOn: new Set<string>(),
    failDrain: false,
    interrupt(targetSessionId, authority) {
      this.interrupts.push({ targetSessionId, authority })
      if (this.failInterruptOn.has(targetSessionId)) throw new Error(`mock: interrupt rejected for ${targetSessionId}`)
    },
    async drainContinuableChildren(parent, childIds) {
      this.drains.push({ parent, parentId: parent.session.header.id, childIds })
      if (this.failDrain) throw new Error('mock: drain rejected (UNAUTHORIZED: stale parent)')
    },
    async startContinuable() {
      throw new Error('mock: team_delete never starts children')
    },
  }
}

const abortSignal = new AbortController().signal

/** lead + 两成员（analyst/builder）的 active 团队。**活体 lead 是稳定单例**
 * ——ancestor authority 的同一性断言（评审 T7-MAJOR）必须读 agents.get 返回
 * 的那枚精确实例；每次 get 造新对象会让同一性假绿/假红。 */
async function makeFixture(): Promise<{ deps: TeamDeleteDeps; teamRunId: string; store: TeamStateStore; channel: MockChannel; leadAgent: TeamAgent }> {
  const store = makeStore()
  const state = await store.create({
    teamName: 'teardown-team',
    leadSessionId: LEAD,
    members: [
      { name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst' },
      { name: 'builder', seat: 'hephaestus', childId: 'child-builder' },
    ],
  })
  await store.transition(state.teamRunId, 'active')
  const channel = makeChannel()
  const leadAgent = makeAgent(LEAD)
  const agents = {
    get: (sessionId: string) => (sessionId === LEAD ? leadAgent : undefined),
  }
  const deps: TeamDeleteDeps = { subagents: channel, agents, store }
  return { deps, teamRunId: state.teamRunId, store, channel, leadAgent }
}

/** 建队但停在指定态（creating 原样；failed 走 creating→failed 合法边）。 */
async function makeFixtureInStatus(status: 'creating' | 'failed'): Promise<{ deps: TeamDeleteDeps; teamRunId: string; store: TeamStateStore }> {
  const store = makeStore()
  const state = await store.create({
    teamName: 'stalled-team',
    leadSessionId: LEAD,
    members: [{ name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst' }],
  })
  if (status === 'failed') await store.transition(state.teamRunId, 'failed')
  const channel = makeChannel()
  const agents = { get: (sessionId: string) => (sessionId === LEAD ? makeAgent(LEAD) : undefined) }
  return { deps: { subagents: channel, agents, store }, teamRunId: state.teamRunId, store }
}

async function rejectionOf(promise: Promise<unknown>): Promise<TeamDeleteError> {
  try {
    await promise
  } catch (err) {
    if (err instanceof TeamDeleteError) return err
    throw new Error(`expected TeamDeleteError, got ${String(err)}`)
  }
  throw new Error('expected a rejection, the promise resolved')
}

async function approveBoth(store: TeamStateStore, teamRunId: string): Promise<void> {
  await store.requestShutdown(teamRunId, 'analyst', 'lead')
  await store.requestShutdown(teamRunId, 'builder', 'lead')
  await store.approveShutdown(teamRunId, 'analyst')
  await store.approveShutdown(teamRunId, 'builder')
}

describe('P5-T7 executeTeamDelete — DELETABLE 门禁', async () => {
  it('non-force with a RUNNING member is refused verbatim: members still active', async () => {
    const { deps, teamRunId, store } = await makeFixture()
    await store.setMemberPhase(teamRunId, 'analyst', 'running')
    await store.setMemberPhase(teamRunId, 'builder', 'running')
    const err = await rejectionOf(executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps))
    expect(err.code).toBe('MEMBERS_STILL_ACTIVE')
    expect(err.message).toContain('members still active')
    expect(err.message).toContain('analyst=running')
    // 门禁先于通道：interrupt/drain 一次都没碰。
    expect(deps.subagents).toMatchObject({ interrupts: [], drains: [] })
    expect((deps.subagents as MockChannel).interrupts).toHaveLength(0)
    expect(store.get(teamRunId)!.status).toBe('active')
  })

  it('non-force with ALL members shutdown_approved deletes through deleting→deleted', async () => {
    const { deps, teamRunId, store, channel, leadAgent } = await makeFixture()
    await approveBoth(store, teamRunId)
    // caller **就是** agents.get(LEAD) 那枚活体（fixture 单例）——executeTeamDelete
    // 的 carrier 选择在 caller 即 lead 时取 caller（team-delete.ts:214），
    // 同一实例让「携 lead 活体」的同一性钉读的是真身而非复刻。
    const result = await executeTeamDelete({ teamRunId }, { agent: leadAgent, signal: abortSignal }, deps)
    expect(result).toMatchObject({ teamRunId, status: 'deleted', forced: false })
    expect(result.interruptedSessionIds).toEqual(['child-analyst', 'child-builder'])
    expect(result.forceCompletedMembers).toEqual([])
    // 终点钉：到 deleted 时 status 落账。**经由 deleting 的中间态**不由本例
    // 直接观测（一次调用内不可见）——它钉在下面 TEARDOWN_FAULT 例（interrupt
    // 抛错时账**停在 deleting**，:321-336，断言行 :331）；绕表直达 deleted 被
    // 迁移表当场抛 INVALID_TRANSITION（team-state.ts:525），活不到断言行。迁移
    // 表是法、TEARDOWN_FAULT 是实证，两例合读才是序（评审 T7-NIT 的如实措辞）。
    const states = store.listAll().filter((row) => row.teamRunId === teamRunId).map((row) => row.status)
    expect(states).toEqual(['deleted'])
    // interrupt+drain 调用序：逐成员 interrupt（ancestor=lead）→ 一把 drain。
    expect(channel.interrupts.map((row) => row.targetSessionId)).toEqual(['child-analyst', 'child-builder'])
    // 调用参数**逐字钉死**（评审 T7-MAJOR 的单测半）：深等值携**活体实例**，
    // 与 T5 回滚臂对拍——team-create.test.ts:306/:358 钉的是同一对语义
    // （interrupt {targetSessionId, kind:'ancestor'} 携 lead 活体 + drain
    // childIds 恰已建成员）；拆除臂多钉两枚：活体同一性 + authority 闭形。
    expect(channel.interrupts).toEqual([
      { targetSessionId: 'child-analyst', authority: { kind: 'ancestor', agent: leadAgent } },
      { targetSessionId: 'child-builder', authority: { kind: 'ancestor', agent: leadAgent } },
    ])
    // 活体同一性：authority.agent **就是** agents.get(LEAD) 那枚实例
    // （宿主 dsh-subagent lib/index.js:843-847 的 UNAUTHORIZED 判据读精确
    // 身份，不是读快照）。
    expect(channel.interrupts.every((row) => row.authority.agent === leadAgent)).toBe(true)
    // 闭形：authority 恰 {kind, agent} 两键——**没有 keepInbox 可传**。
    // keepInbox:true 由宿主 interrupt 臂写死（dsh-subagent lib/index.js:855
    // `cancel({kind:'parent'}, {keepInbox:true})`），本仓经通道不可表达
    // keepInbox:false——「保 inbox」的 e2e 主锚因此不在参数面而在通道面
    // （delete 后原生再投落库：drive.mjs postDeleteNativeDeliveryLandedAtAnalyst）。
    expect(channel.interrupts.every((row) => Object.keys(row.authority).sort().join(',') === 'agent,kind')).toBe(true)
    expect(channel.drains).toEqual([{ parent: leadAgent, parentId: LEAD, childIds: ['child-analyst', 'child-builder'] }])
    // tombstone：状态行在、参与索引撤。
    expect(store.get(teamRunId)!.status).toBe('deleted')
    expect(store.participantOf(LEAD)).toBeUndefined()
    expect(store.participationOfMember('child-analyst')).toBeUndefined()
  })

  it('the deleted tombstone makes the teamRunId unusable BY NAME on messaging', async () => {
    const { deps, teamRunId, store } = await makeFixture()
    await approveBoth(store, teamRunId)
    await executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    // team_send_message 对 deleted 团队具名拒（TEAM_DELETED，assertTeamAccepts
    // Messages 对齐——team-message.ts 的既有错误族）。
    const sendChannel = {
      sendMessage: async () => {
        throw new Error('must never deliver to a deleted team')
      },
    }
    const sendDeps = { subagents: sendChannel, agents: { get: () => makeAgent(LEAD) }, store }
    const err = await executeTeamSendMessage(
      { teamRunId, to: 'analyst', body: 'still there?' },
      { agent: makeAgent(LEAD), signal: abortSignal },
      sendDeps,
    ).then(() => undefined, (caught: unknown) => caught as { code: string; message: string })
    expect(err?.code).toBe('TEAM_DELETED')
    expect(err?.message).toBe(`team ${teamRunId} is deleted`)
  })

  it('a re-delete of a deleted team is idempotent success (上游白名单含 deleted)', async () => {
    const { deps, teamRunId, store } = await makeFixture()
    await approveBoth(store, teamRunId)
    await executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    const again = await executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    expect(again.status).toBe('deleted')
    expect(store.get(teamRunId)!.status).toBe('deleted')
  })
})

describe('P5-T7 executeTeamDelete — force 旁路与 lead-only', async () => {
  it('force tears down RUNNING members: force-complete first, then interrupt + drain', async () => {
    const { deps, teamRunId, store, channel } = await makeFixture()
    await store.setMemberPhase(teamRunId, 'analyst', 'running')
    await store.setMemberPhase(teamRunId, 'builder', 'running')
    const result = await executeTeamDelete(
      { teamRunId, force: true },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    )
    expect(result.forced).toBe(true)
    expect(result.forceCompletedMembers).toEqual(['analyst', 'builder'])
    expect(result.interruptedSessionIds).toEqual(['child-analyst', 'child-builder'])
    expect(channel.interrupts).toHaveLength(2)
    expect(channel.drains).toHaveLength(1)
    expect(store.get(teamRunId)!.status).toBe('deleted')
  })

  it('force from CREATING bypasses the transition table into deleting, then lands deleted', async () => {
    // creating 态专用 fixture（迁移表 creating→{active,failed}——把 active
    // 队「拉回」creating 本身就是表违规，所以这里从建队就不推 active）。
    const { deps, teamRunId, store } = await makeFixtureInStatus('creating')
    expect(store.get(teamRunId)!.status).toBe('creating')
    // 非 force 先撞**成员门**（上游 delete-team.ts 的序：:74 members-still-
    // active 在 :81 状态白名单之前——creating 队的成员是 pending，先落成员门）。
    const polite = await rejectionOf(executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps))
    expect(polite.code).toBe('MEMBERS_STILL_ACTIVE')
    // 成员全清后仍撞白名单（creating ∉ DELETABLE_TEAM_STATUSES，非 force）。
    for (const m of store.get(teamRunId)!.members) await store.setMemberPhase(teamRunId, m.name, 'shutdown_approved')
    const whitelisted = await rejectionOf(executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps))
    expect(whitelisted.code).toBe('TEAM_NOT_DELETABLE')
    expect(whitelisted.message).toBe(`team cannot be deleted from 'creating'`)
    // force 走绕表臂 creating→(bypass)→deleting→deleted。
    const forced = await executeTeamDelete({ teamRunId, force: true }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    expect(forced.status).toBe('deleted')
    expect(store.get(teamRunId)!.status).toBe('deleted')
    expect(TEAM_FORCE_DELETABLE_STATUSES.has('creating')).toBe(true)
    expect(TEAM_DELETABLE_STATUSES.has('creating')).toBe(false)
  })

  it('failed teams cannot be deleted even with force (上游 FORCE 集不含 failed)', async () => {
    const { deps, teamRunId, store } = await makeFixtureInStatus('failed')
    expect(store.get(teamRunId)!.status).toBe('failed')
    const err = await rejectionOf(executeTeamDelete(
      { teamRunId, force: true },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    ))
    expect(err.code).toBe('TEAM_NOT_DELETABLE')
    expect(err.message).toBe(`team cannot be deleted from 'failed'`)
  })

  it('a non-lead caller is refused lead-only by name', async () => {
    const { deps, teamRunId } = await makeFixture()
    const err = await rejectionOf(executeTeamDelete(
      { teamRunId },
      { agent: makeAgent('child-analyst'), signal: abortSignal },
      deps,
    ))
    expect(err.message).toBe(`${TEAM_DELETE_TOOL_NAME} is lead-only`)
    expect(err.code).toBe('LEAD_ONLY')
  })

  it('force + deleting + a participant caller rides the upstream force-bypass', async () => {
    const { deps, teamRunId, store } = await makeFixture()
    await approveBoth(store, teamRunId)
    await store.transition(teamRunId, 'deleting')
    // builder 是本队成员：force + deleting + participant = 上游 hook :87-98 旁路。
    const bypassAgents = {
      get: (sessionId: string) => (sessionId === LEAD ? makeAgent(LEAD) : sessionId === 'child-builder' ? makeAgent('child-builder') : undefined),
    }
    const forced = await executeTeamDelete(
      { teamRunId, force: true },
      { agent: makeAgent('child-builder'), signal: abortSignal },
      { ...deps, agents: bypassAgents },
    )
    expect(forced.status).toBe('deleted')
    // ancestor authority 落 lead（不是 caller）——interrupt 的 lineage 语义。
    expect((deps.subagents as MockChannel).interrupts.every(
      (row) => row.authority.kind === 'ancestor' && row.authority.agent?.session.header.id === LEAD,
    )).toBe(true)
  })

  it('a foreign non-lead caller with force is STILL refused lead-only', async () => {
    const { deps, teamRunId } = await makeFixture()
    const err = await rejectionOf(executeTeamDelete(
      { teamRunId, force: true },
      { agent: makeAgent('foreign-session'), signal: abortSignal },
      deps,
    ))
    expect(err.code).toBe('LEAD_ONLY')
  })

  it('interrupt faults are surfaced, not swallowed; the run stays deleting for retry', async () => {
    const { deps, teamRunId, store, channel } = await makeFixture()
    await approveBoth(store, teamRunId)
    channel.failInterruptOn.add('child-builder')
    const err = await rejectionOf(executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps))
    expect(err.code).toBe('TEARDOWN_FAULT')
    expect(err.message).toContain('child-builder')
    // analyst 的 interrupt 已经发生（不吞别的成员）。
    expect(channel.interrupts.map((row) => row.targetSessionId)).toContain('child-analyst')
    // 账停在 deleting：重试合法（deleting 在门禁白名单）。
    expect(store.get(teamRunId)!.status).toBe('deleting')
    channel.failInterruptOn.delete('child-builder')
    const retry = await executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    expect(retry.status).toBe('deleted')
    expect(store.get(teamRunId)!.status).toBe('deleted')
  })

  it('P5-T16 (MAJOR-1) a drain fault does NOT close the ledger — the run stays deleting and may retry', async () => {
    // 第二轮评审 MAJOR-1 的正面腿：**drain 失败不许收账**。
    // 原生 `interrupt` 只是发起异步取消；DSH 的 `drainChildren` 在
    // exact-live-parent 校验失败时**在任何 child release 之前**抛
    // `UNAUTHORIZED`（dsh-subagent/lib/index.js:929-940）——所以 drain 失败
    // 恰恰意味着「成员可能仍在 resident 且仍在跑」。此时收账（deleted + 撤
    // 参与索引）会制造**无主且仍在运行**的成员。
    const { deps, teamRunId, store, channel } = await makeFixture()
    await approveBoth(store, teamRunId)
    channel.failDrain = true
    const err = await rejectionOf(executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps))
    expect(err.code).toBe('TEARDOWN_FAULT')
    expect(err.message).toContain('drain:')
    expect(err.message).toContain('the ledger is NOT closed')
    // 账留在 deleting，参与索引**不动**（成员仍属于本队，不是孤儿）。
    // （`participationOfMember` 刻意**不**按状态过滤——那正是「成员还属于本队」
    // 的读面；`participantOf` 会按 ACTIVE 三态过滤，`deleting` 不在其中。）
    expect(store.get(teamRunId)!.status).toBe('deleting')
    expect(store.participationOfMember('child-analyst')).toBeDefined()
    expect(store.participationOfMember('child-builder')).toBeDefined()
    // 重跑即续上（interrupt/drain 幂等）。
    channel.failDrain = false
    const retry = await executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    expect(retry.status).toBe('deleted')
    expect(store.get(teamRunId)!.status).toBe('deleted')
    expect(store.participationOfMember('child-analyst')).toBeUndefined()
  })

  it('P5-T16 (MINOR-6) the idempotent re-delete succeeds (deleted is terminal — no INVALID_TRANSITION)', async () => {
    // 「deleting/deleted 在白名单内 = 幂等重删的入口」这句契约今天名不副实：
    // 末段的 transition('deleted') 在已是 deleted 的 run 上会被迁移表当场拒
    // （`deleted: ∅`）。更正后终态已到位时跳过迁移，重删返回成功。
    const { deps, teamRunId, store } = await makeFixture()
    await approveBoth(store, teamRunId)
    const first = await executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    expect(first.status).toBe('deleted')
    const second = await executeTeamDelete({ teamRunId }, { agent: makeAgent(LEAD), signal: abortSignal }, deps)
    expect(second.status).toBe('deleted')
    expect(store.get(teamRunId)!.status).toBe('deleted')
  })

  it('unknown teamRunId is refused TEAM_NOT_FOUND (senpi 缺账 no-op 不采，差异成文)', async () => {    const { deps } = await makeFixture()
    const err = await rejectionOf(executeTeamDelete(
      { teamRunId: 'no-such-run' },
      { agent: makeAgent(LEAD), signal: abortSignal },
      deps,
    ))
    expect(err.code).toBe('TEAM_NOT_FOUND')
  })
})

describe('P5-T7 team-delete vocabulary & surface', async () => {
  it('the deletable vocab mirrors upstream word-for-word', async () => {
    expect([...TEAM_DELETABLE_MEMBER_PHASES].sort()).toEqual(['completed', 'errored', 'shutdown_approved'])
    expect([...TEAM_FORCE_COMPLETABLE_MEMBER_PHASES].sort()).toEqual(['idle', 'pending', 'running'])
    expect([...TEAM_DELETABLE_STATUSES].sort()).toEqual(['active', 'deleted', 'deleting', 'shutdown_requested'])
  })

  it('the definition carries the upstream description first sentence verbatim', async () => {
    const def = createTeamDeleteDefinition({ subagents: makeChannel(), agents: { get: () => undefined }, store: makeStore() }) as {
      name: string
      description: string
    }
    expect(def.name).toBe(TEAM_DELETE_TOOL_NAME)
    expect(def.description.startsWith('Delete a completed or shutdown-approved team run. Pass force=true to tear it down even while members are still active.')).toBe(true)
  })

  it('lead face YES, member face structurally absent', async () => {
    const names: string[] = []
    const store = makeStore()
    const state = await store.create({
      teamName: 't',
      leadSessionId: LEAD,
      members: [{ name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst' }],
    })
    await store.transition(state.teamRunId, 'active')
    let captured: ((payload: { agent: TeamAgent }) => unknown) | undefined
    registerTeamDeleteSurface({ on: (_event, listener) => { captured = listener; return () => {} } }, {
      subagents: makeChannel(),
      agents: { get: () => undefined },
      store,
    })
    const track = (sessionId: string, isChild: boolean) => {
      const agent = {
        session: { header: { id: sessionId, ...(isChild ? { origin: 'subagent' as const, parentSession: LEAD } : {}) } },
        ctx: { tools: { register: (def: unknown) => { names.push((def as { name: string }).name); return {} } } },
        inject: () => ({}),
      } as unknown as TeamAgent
      captured!({ agent })
    }
    track(LEAD, false)
    track('child-analyst', true)
    expect(names).toEqual([TEAM_DELETE_TOOL_NAME]) // 只有 lead 面收到
  })
})
