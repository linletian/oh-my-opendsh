// P5-T7 — team-status.ts 的单测（聚合形状 + 参与者闸 + tombstone 可读 +
// UNIVERSAL 双面分发）。纯内存骨架，零通道——team_status 是纯读面，mock 只
// 需要一个能记账的 store 与两枚身份 Agent。
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping).
import { describe, expect, it } from 'vitest'
import {
  TEAM_STATUS_TOOL_NAME,
  TeamStatusError,
  createTeamStatusDefinition,
  executeTeamStatus,
  registerTeamStatusSurface,
  type TeamStatusDeps,
} from '../../patches/omo-dsh/omo-team/src/tools/team-status.ts'
import type { TeamAgent } from '../../patches/omo-dsh/omo-team/src/tools/team-create.ts'
import { TeamStateMemoryStore } from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

const LEAD = 'lead-session-1'
const ANALYST = 'child-analyst'
const BUILDER = 'child-builder'

function makeAgent(sessionId: string): TeamAgent {
  return {
    session: { header: { id: sessionId } },
    ctx: { tools: { register: (_def: unknown) => ({}) } },
    inject: (_frame: unknown) => ({}),
  } as unknown as TeamAgent
}

function makeFixture(): { deps: TeamStatusDeps; teamRunId: string; store: TeamStateMemoryStore } {
  const store = new TeamStateMemoryStore()
  const state = store.create({
    teamName: 'status-team',
    leadSessionId: LEAD,
    members: [
      { name: 'analyst', seat: 'sisyphus-junior', childId: ANALYST },
      { name: 'builder', seat: 'hephaestus', childId: BUILDER },
    ],
    now: 1700000000000,
  })
  store.transition(state.teamRunId, 'active')
  return { deps: { store }, teamRunId: state.teamRunId, store }
}

const abortSignal = new AbortController().signal

async function rejectionOf(promise: Promise<unknown>): Promise<TeamStatusError> {
  try {
    await promise
  } catch (err) {
    if (err instanceof TeamStatusError) return err
    throw new Error(`expected TeamStatusError, got ${String(err)}`)
  }
  throw new Error('expected a rejection, the promise resolved')
}

describe('P5-T7 executeTeamStatus — 聚合形状（tasks 段的诚实空值）', () => {
  it('lead queries an active team: full aggregate, handshakes none, tasks empty by seam', async () => {
    const { deps, teamRunId } = makeFixture()
    const result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(result.teamRunId).toBe(teamRunId)
    expect(result.teamName).toBe('status-team')
    expect(result.status).toBe('active')
    expect(result.leadSessionId).toBe(LEAD)
    expect(result.createdAt).toBe(1700000000000)
    expect(result.bounds).toBeDefined()
    expect(result.members).toHaveLength(2)
    expect(result.members[0]).toMatchObject({ name: 'analyst', seat: 'sisyphus-junior', sessionId: ANALYST, phase: 'pending' })
    expect(result.members[0]!.shutdown.state).toBe('none')
    // T8 接缝：空数组是此刻唯一诚实值（键位先占，形状自 T7 稳定）。
    expect(result.tasks).toEqual([])
    expect(result.taskBoardNote).toContain('P5-T8')
    expect(result.shutdownRequests).toEqual([])
    expect(result.processedMessageCount).toBe(0)
    expect(result.briefingInjectedMembers).toEqual([])
  })

  it('the handshake projection reads pending → approved → rejected off the ledger', async () => {
    const { deps, teamRunId, store } = makeFixture()
    store.requestShutdown(teamRunId, 'analyst', 'lead')
    let result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(result.members[0]!.shutdown.state).toBe('pending')
    expect(result.members[0]!.shutdown.requestedAt).toBeDefined()

    store.approveShutdown(teamRunId, 'analyst')
    result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(result.members[0]!.shutdown.state).toBe('approved')
    expect(result.members[0]!.shutdown.approvedAt).toBeDefined()
    expect(result.members[1]!.shutdown.state).toBe('none')

    // 重拒臂（第四路批准后再来一问一拒）：latest 行双戳，读最后落笔。
    store.requestShutdown(teamRunId, 'builder', 'lead')
    store.rejectShutdown(teamRunId, 'builder', 'still compiling')
    result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(result.members[1]!.shutdown.state).toBe('rejected')
    expect(result.members[1]!.shutdown.rejectedReason).toBe('still compiling')
    // 账本行数 = 询问数（approve/reject 原地盖章，不加行——一行一问）。
    expect(result.shutdownRequests).toHaveLength(2)
  })

  it('a member may query its own team (UNIVERSAL face); a foreigner is refused verbatim', async () => {
    const { deps, teamRunId } = makeFixture()
    const byMember = await executeTeamStatus({ teamRunId }, { agent: makeAgent(ANALYST) }, deps)
    expect(byMember.status).toBe('active')
    const err = await rejectionOf(executeTeamStatus({ teamRunId }, { agent: makeAgent('foreign-session') }, deps))
    expect(err.message).toBe(`team-mode tool ${TEAM_STATUS_TOOL_NAME} denied: not a participant of team ${teamRunId}`)
    expect(err.code).toBe('NOT_PARTICIPANT')
  })

  it('the deleted tombstone stays READABLE here (query face ≠ write face)', async () => {
    const { deps, teamRunId, store } = makeFixture()
    store.requestShutdown(teamRunId, 'analyst', 'lead')
    store.approveShutdown(teamRunId, 'analyst')
    store.requestShutdown(teamRunId, 'builder', 'lead')
    store.approveShutdown(teamRunId, 'builder')
    store.transition(teamRunId, 'deleting')
    store.transition(teamRunId, 'deleted')
    // lead 亲询 tombstone：可读，状态是 deleted，握手账完整回放。
    const result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(result.status).toBe('deleted')
    expect(result.members.map((m) => m.shutdown.state)).toEqual(['approved', 'approved'])
    // 成员面的闸在 RETIRE 之后收——retireRunIndexes 撤参与索引，deleted 后
    // 成员不再是 participant（具名拒）；这是写面已死、lead 读面独活的形态。
    store.retireRunIndexes(teamRunId)
    const err = await rejectionOf(executeTeamStatus({ teamRunId }, { agent: makeAgent(ANALYST) }, deps))
    expect(err.code).toBe('NOT_PARTICIPANT')
    const leadStillReads = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(leadStillReads.status).toBe('deleted')
  })

  it('unknown teamRunId is refused TEAM_NOT_FOUND by name', async () => {
    const { deps } = makeFixture()
    const err = await rejectionOf(executeTeamStatus({ teamRunId: 'no-run' }, { agent: makeAgent(LEAD) }, deps))
    expect(err.code).toBe('TEAM_NOT_FOUND')
  })
})

describe('P5-T7 team_status surface & definition', () => {
  it('lead face YES, member face YES (UNIVERSAL), foreign child NOTHING', () => {
    const { deps, teamRunId } = makeFixture()
    void teamRunId
    let captured: ((payload: { agent: TeamAgent }) => unknown) | undefined
    registerTeamStatusSurface({ on: (_event, listener) => { captured = listener; return () => {} } }, deps)
    const track = (sessionId: string, isChild: boolean): string[] => {
      const names: string[] = []
      const agent = {
        session: { header: { id: sessionId, ...(isChild ? { origin: 'subagent' as const, parentSession: LEAD } : {}) } },
        ctx: { tools: { register: (def: unknown) => { names.push((def as { name: string }).name); return {} } } },
        inject: () => ({}),
      } as unknown as TeamAgent
      captured!({ agent })
      return names
    }
    expect(track(LEAD, false)).toEqual([TEAM_STATUS_TOOL_NAME])
    expect(track(ANALYST, true)).toEqual([TEAM_STATUS_TOOL_NAME])
    expect(track('foreign-child', true)).toEqual([])
  })

  it('the definition keeps the upstream first sentence verbatim', () => {
    const def = createTeamStatusDefinition({ store: new TeamStateMemoryStore() }) as {
      name: string
      description: string
      parameters: { required: string[] }
    }
    expect(def.name).toBe(TEAM_STATUS_TOOL_NAME)
    expect(def.description.startsWith('Return full status for a team run.')).toBe(true)
    expect(def.parameters.required).toEqual(['teamRunId'])
  })
})
