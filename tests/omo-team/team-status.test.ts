// P5-T7 — team-status.ts 的单测（聚合形状 + 参与者闸 + tombstone 可读 +
// UNIVERSAL 双面分发）。纯内存骨架，零通道——team_status 是纯读面，mock 只
// 需要一个能记账的 store 与两枚身份 Agent。
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping).
import { readFileSync, writeFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { makeStore } from './support/ephemeral-store.ts'
import {
  TEAM_STATUS_TOOL_NAME,
  TeamStatusError,
  createTeamStatusDefinition,
  executeTeamStatus,
  registerTeamStatusSurface,
  type TeamStatusDeps,
} from '../../patches/omo-dsh/omo-team/src/tools/team-status.ts'
import type { TeamAgent } from '../../patches/omo-dsh/omo-team/src/tools/team-create.ts'
import { TeamStateStore } from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

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

async function makeFixture(): Promise<{ deps: TeamStatusDeps; teamRunId: string; store: TeamStateStore }> {
  const store = makeStore()
  const state = await store.create({
    teamName: 'status-team',
    leadSessionId: LEAD,
    members: [
      { name: 'analyst', seat: 'sisyphus-junior', childId: ANALYST },
      { name: 'builder', seat: 'hephaestus', childId: BUILDER },
    ],
  })
  await store.transition(state.teamRunId, 'active')
  // P5-T16（评审 MINOR-5）：活体注册表读面——默认**全员冷**（无人活体），
  // resident 观测因此为 false；单独一腿覆盖「某成员活着」的情形。
  return { deps: { store, agents: { get: () => undefined } }, teamRunId: state.teamRunId, store }
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

describe('P5-T7 executeTeamStatus — 聚合形状（tasks 段的诚实空值）', async () => {
  it('lead queries an active team: full aggregate, handshakes none, tasks empty because the board has no task files yet', async () => {
    const { deps, teamRunId } = await makeFixture()
    const result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(result.teamRunId).toBe(teamRunId)
    expect(result.teamName).toBe('status-team')
    expect(result.status).toBe('active')
    expect(result.leadSessionId).toBe(LEAD)
    // T8b：createdAt 由 vendored createRuntimeState 自产（store.ts:138 的
    // Date.now()，上游值上游落）——此刻只能钉「正整数时间戳」，钉死值即假。
    expect(result.createdAt).toBeGreaterThan(0)
    expect(result.bounds).toBeDefined()
    expect(result.members).toHaveLength(2)
    expect(result.members[0]).toMatchObject({ name: 'analyst', seat: 'sisyphus-junior', sessionId: ANALYST, phase: 'pending' })
    expect(result.members[0]!.shutdown.state).toBe('none')
    // T8b 真读：板不存在时 vendored listTasks 回 []（上游宽容）——空是
    // 「板还没有任务」，不再是「接缝未接」（键位与形状自 T7 稳定不变）。
    expect(result.tasks).toEqual([])
    expect(result.taskBoardNote).toContain('P5-T8')
    expect(result.shutdownRequests).toEqual([])
    expect(result.processedMessageCount).toBe(0)
    expect(result.briefingInjectedMembers).toEqual([])
  })

  it('the handshake projection reads pending → approved → rejected off the ledger', async () => {
    const { deps, teamRunId, store } = await makeFixture()
    await store.requestShutdown(teamRunId, 'analyst', 'lead')
    let result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(result.members[0]!.shutdown.state).toBe('pending')
    expect(result.members[0]!.shutdown.requestedAt).toBeDefined()

    await store.approveShutdown(teamRunId, 'analyst')
    result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(result.members[0]!.shutdown.state).toBe('approved')
    expect(result.members[0]!.shutdown.approvedAt).toBeDefined()
    expect(result.members[1]!.shutdown.state).toBe('none')

    // 重拒臂（第四路批准后再来一问一拒）：latest 行双戳，读最后落笔。
    await store.requestShutdown(teamRunId, 'builder', 'lead')
    await store.rejectShutdown(teamRunId, 'builder', 'still compiling')
    result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(result.members[1]!.shutdown.state).toBe('rejected')
    expect(result.members[1]!.shutdown.rejectedReason).toBe('still compiling')
    // 账本行数 = 询问数（approve/reject 原地盖章，不加行——一行一问）。
    expect(result.shutdownRequests).toHaveLength(2)
  })

  it('a member may query its own team (UNIVERSAL face); a foreigner is refused verbatim', async () => {
    const { deps, teamRunId } = await makeFixture()
    const byMember = await executeTeamStatus({ teamRunId }, { agent: makeAgent(ANALYST) }, deps)
    expect(byMember.status).toBe('active')
    const err = await rejectionOf(executeTeamStatus({ teamRunId }, { agent: makeAgent('foreign-session') }, deps))
    expect(err.message).toBe(`team-mode tool ${TEAM_STATUS_TOOL_NAME} denied: not a participant of team ${teamRunId}`)
    expect(err.code).toBe('NOT_PARTICIPANT')
  })

  it('the deleted tombstone stays READABLE here (query face ≠ write face)', async () => {
    const { deps, teamRunId, store } = await makeFixture()
    await store.requestShutdown(teamRunId, 'analyst', 'lead')
    await store.approveShutdown(teamRunId, 'analyst')
    await store.requestShutdown(teamRunId, 'builder', 'lead')
    await store.approveShutdown(teamRunId, 'builder')
    await store.transition(teamRunId, 'deleting')
    await store.transition(teamRunId, 'deleted')
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
    const { deps } = await makeFixture()
    const err = await rejectionOf(executeTeamStatus({ teamRunId: 'no-run' }, { agent: makeAgent(LEAD) }, deps))
    expect(err.code).toBe('TEAM_NOT_FOUND')
  })
})

describe('P5-T7 team_status surface & definition', async () => {
  it('lead face YES, member face YES (UNIVERSAL), foreign child NOTHING', async () => {
    const { deps, teamRunId } = await makeFixture()
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

  it('the definition keeps the upstream first sentence verbatim', async () => {
    const def = createTeamStatusDefinition({ store: makeStore(), agents: { get: () => undefined } }) as {
      name: string
      description: string
      parameters: { required: string[] }
    }
    expect(def.name).toBe(TEAM_STATUS_TOOL_NAME)
    expect(def.description.startsWith('Return full status for a team run.')).toBe(true)
    expect(def.parameters.required).toEqual(['teamRunId'])
  })
})

describe('P5-T16 (MINOR-5) 成员活体观测面 — phase 是账面、resident 是活性', async () => {
  it('resident 反映活体注册表；phase 读法有说明（模型可见面）', async () => {
    const { deps, teamRunId, store } = await makeFixture()
    // 一枚活体成员（analyst）+ 一枚冷成员（builder）。
    const liveDeps: TeamStatusDeps = {
      store,
      agents: { get: (sessionId: string) => (sessionId === ANALYST ? makeAgent(ANALYST) : undefined) },
    }
    const result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, liveDeps)
    expect(result.members.map((m) => [m.name, m.resident])).toEqual([
      ['analyst', true],
      ['builder', false],
    ])
    // phase 仍是账面读数（唯一有生产者的态），但**读法**必须解释清楚，
    // 否则 lead 会把恒等于 running 的读数当活性判据。
    expect(result.members.every((m) => m.phase === 'pending' || m.phase === 'running')).toBe(true)
    expect(result.memberPhaseNote).toContain('resident')
    expect(result.memberPhaseNote).toContain('not a liveness fact')
    // P5-T19（第三轮评审 MINOR）：上一版写「only running has a producer」是**事实
    // 错误**——pending / shutdown_approved / completed / errored 各有生产者。
    // 未接线的是**正常 turn 生命周期**；注记必须这么写。
    expect(result.memberPhaseNote).not.toContain('only "running" has a producer')
    for (const producer of ['"pending"', '"shutdown_approved"', '"completed"', '"errored"']) {
      expect(result.memberPhaseNote, producer).toContain(producer)
    }
    expect(result.memberPhaseNote).toContain('normal turn lifecycle')
  })

  it('P5-T22 (自查残余 a) messageLedger 把预算拆成 delivered / inFlight / stalledInFlight', async () => {
    // 撞到 MESSAGE_LEDGER_FULL 的 lead 必须能从状态面看出"预算被谁吃掉了"：
    // 满载判据是 delivered + inFlight，而停滞在途行（发送者失联）**永不回收**。
    const { deps, teamRunId, store } = await makeFixture()
    // 造一个 cap=3 的小账：2 条已送达 + 1 条**停滞**在途。
    const capped = new TeamStateStore({ ...store.config, max_messages_per_run: 3 })
    await capped.rebuildIndexes()
    for (const id of ['d1', 'd2']) {
      const reserved = await capped.reserveMessageDelivery(teamRunId, id)
      if (reserved.state !== 'reserved') throw new Error('expected reserved')
      await capped.commitMessageDelivery(teamRunId, id, reserved.token)
    }
    const stalled = await capped.reserveMessageDelivery(teamRunId, 's1')
    if (stalled.state !== 'reserved') throw new Error('expected reserved')
    // 把 s1 改成 TTL 之外（模拟发送者失联）。
    const dir = String(capped.config.base_dir)
    const ledgerPath = `${dir}/runtime/${teamRunId}/omo-team-extensions.json`
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as { inFlightMessages: { id: string, at: number, token: string }[] }
    ledger.inFlightMessages = ledger.inFlightMessages.map((row) => ({ ...row, at: Date.now() - 10 * 60 * 1000 }))
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
    const result = await executeTeamStatus(
      { teamRunId },
      { agent: makeAgent(LEAD) },
      { store: capped, agents: { get: () => undefined } },
    )
    expect(result.messageLedger).toEqual({ delivered: 2, inFlight: 1, stalledInFlight: 1, cap: 3, remaining: 0 })
    // 读法说明进模型可见面，且点名"停滞行永不回收 + 满载是终态"。
    expect(result.messageLedgerNote).toContain('delivered + inFlight')
    expect(result.messageLedgerNote).toContain('NEVER reclaimed')
    expect(result.messageLedgerNote).toContain('a new correlationId does NOT help')
    // 满载（剩余 0）⇒ 下一条被拒，与 messageLedger 的读数一致。
    await expect(capped.reserveMessageDelivery(teamRunId, 'next')).rejects.toMatchObject({ code: 'MESSAGE_LEDGER_FULL' })
  })

  it('无人活体时全员 resident=false（不把冷成员说成活着）', async () => {
    const { deps, teamRunId } = await makeFixture()
    const result = await executeTeamStatus({ teamRunId }, { agent: makeAgent(LEAD) }, deps)
    expect(result.members.every((m) => m.resident === false)).toBe(true)
  })
})
