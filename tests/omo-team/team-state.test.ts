// P5-T5 — team-state.ts 状态机骨架的单元测试。**P5-T8b 换装注**：store
// 已是持久化形态（vendored team-state-store + sidecar），单测因此走**临时目录
// 基座**（makeStore：mkdtemp + buildTeamModeConfig(OMO_TEAM_BASE_DIR)）——
// 「纯内存，零 io」的 T5 注作废，每笔写都真落盘，每把锁都真存在。
//
// WHY THE TRANSITION TABLE IS HARD-CODED. 迁移合法性是上游
// team-state-store/store.ts:15-23（ALLOWED_RUNTIME_TRANSITIONS）+ :115-119
// （isValidTransition）逐字承载的裁定——从 team-state.ts 派生期望的测试会同意
// 它的任何漂移，毫无价值。所以七态、每条合法迁移、每个非法迁移具名抛，全部
// 手抄自 Q1a-tools-lifecycle.md §5.3 的转录。
//
// 三张索引（byTeamRunId / byLeadSession / byMemberSession）是 T5 组队路径与
// T6/T7 按角色分发的共同事实源，所以「create 即入册」「participantOf 命中两
// 臂」「forgetRun 清账」逐枚钉死——索引漏一处，换持久化时就是旁路（文件头
// 持久化接缝段）。
//
// The `.ts` extension in the import path is load-bearing: Node 24
// type-stripping does no specifier resolution (tsconfig.host.json header).
import { mkdtempSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, afterEach } from 'vitest'

import { buildTeamModeConfig } from '../../patches/omo-dsh/omo-team/src/team/team-config.ts'
import { buildTeamSessionContext } from '../../patches/omo-dsh/omo-team/src/team/session-context-adapter.ts'
import type { TeamLiveAgents } from '../../patches/omo-dsh/omo-team/src/tools/team-message.ts'
import {
  ACTIVE_TEAM_RUNTIME_STATUSES,
  ALLOWED_TEAM_RUNTIME_TRANSITIONS,
  TEAM_LEAD_SENTINEL,
  TEAM_MEMBER_PHASES,
  TEAM_RUNTIME_BOUNDS_DEFAULTS,
  TEAM_RUNTIME_STATE_VERSION,
  TEAM_RUNTIME_STATUSES,
  TEAM_DELETABLE_MEMBER_PHASES,
  TEAM_FORCE_COMPLETABLE_MEMBER_PHASES,
  TeamStateError,
  TeamStateStore,
  isShutdownRequestPending,
  isValidTeamRuntimeTransition,
  type TeamRuntimeStatus,
} from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

// ── 临时目录基座（T8b）───────────────────────────────────────────────────────
// 每测一箱：mkdtemp 的 base_dir 经 buildTeamModeConfig 的覆盖臂进来（生产
// 不设此变量 = HOME 派生，行为不变——team-config.ts 钉死的同一指针）。
const tempDirs: string[] = []
afterEach(async () => {
  const dirs = tempDirs.splice(0, tempDirs.length)
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

function makeStore(): TeamStateStore {
  const dir = mkdtempSync(join(tmpdir(), 'omo-team-state-test-'))
  tempDirs.push(dir)
  return new TeamStateStore(buildTeamModeConfig({ OMO_TEAM_BASE_DIR: dir }))
}

/** 一个合法的两成员 create 入参（lead + 两席；childId 手打便于逐枚断言）。
 *  T8b 注：`now` 入参已删——createdAt 由 vendored createRuntimeState 自产。 */
function provisioningInput(overrides: Partial<Parameters<TeamStateStore['create']>[0]> = {}) {
  return {
    teamName: 'analysis-team',
    leadSessionId: 'lead-session-1',
    members: [
      { name: 'structure-analyst', seat: 'sisyphus-junior', category: 'quick', childId: 'child-a' },
      { name: 'deep-builder', seat: 'hephaestus', childId: 'child-b' },
    ],
    ...overrides,
  }
}

describe('P5-T5 team-state vocabulary — 上游逐字镜像的派生纪律', async () => {
  it('seven runtime statuses, in upstream declaration order', async () => {
    expect([...TEAM_RUNTIME_STATUSES]).toEqual([
      'creating',
      'active',
      'shutdown_requested',
      'deleting',
      'deleted',
      'failed',
      'orphaned',
    ])
  })

  it('six member phases, in upstream enum order', async () => {
    expect([...TEAM_MEMBER_PHASES]).toEqual([
      'pending',
      'running',
      'idle',
      'errored',
      'completed',
      'shutdown_approved',
    ])
  })

  it('TEAM_LEAD_SENTINEL is the senpi "lead" vocabulary (normalize.ts:14)', async () => {
    expect(TEAM_LEAD_SENTINEL).toBe('lead')
  })

  it('bounds defaults are the five upstream values', async () => {
    expect(TEAM_RUNTIME_BOUNDS_DEFAULTS).toEqual({
      maxMembers: 8,
      maxParallelMembers: 4,
      maxMessagesPerRun: 10000,
      maxWallClockMinutes: 120,
      maxMemberTurns: 500,
    })
    expect(TEAM_RUNTIME_STATE_VERSION).toBe(1)
  })

  it('ACTIVE gating set is creating|active|shutdown_requested (hook.ts:11)', async () => {
    expect([...ACTIVE_TEAM_RUNTIME_STATUSES].sort()).toEqual(
      [...['creating', 'active', 'shutdown_requested'].sort()],
    )
  })
})

describe('P5-T5 isValidTeamRuntimeTransition — the store.ts:115-119 short-circuit', async () => {
  it('allows every same-state transition', async () => {
    for (const status of TEAM_RUNTIME_STATUSES) {
      expect(isValidTeamRuntimeTransition(status, status)).toBe(true)
    }
  })

  it('allows ANY source state to orphaned (the adoption entry)', async () => {
    for (const from of TEAM_RUNTIME_STATUSES) {
      expect(isValidTeamRuntimeTransition(from, 'orphaned')).toBe(true)
    }
  })

  it('honors the forward table exactly (creating→{active,failed} etc.)', async () => {
    // 手抄的合法正向迁移，逐条钉。
    const legal: ReadonlyArray<[TeamRuntimeStatus, TeamRuntimeStatus]> = [
      ['creating', 'active'],
      ['creating', 'failed'],
      ['active', 'shutdown_requested'],
      ['active', 'deleting'],
      ['shutdown_requested', 'deleting'],
      ['deleting', 'deleted'],
    ]
    for (const [from, to] of legal) {
      expect(isValidTeamRuntimeTransition(from, to)).toBe(true)
    }
  })

  it('rejects the illegal forward/backward jumps by name', async () => {
    const illegal: ReadonlyArray<[TeamRuntimeStatus, TeamRuntimeStatus]> = [
      ['creating', 'shutdown_requested'],
      ['creating', 'deleting'],
      ['creating', 'deleted'],
      ['active', 'creating'],
      ['deleted', 'active'],
      ['failed', 'creating'],
      ['shutdown_requested', 'active'],
      ['deleting', 'shutdown_requested'],
    ]
    for (const [from, to] of illegal) {
      expect(isValidTeamRuntimeTransition(from, to)).toBe(false)
    }
  })

  it('terminal states have an empty forward set (deleted/failed/orphaned)', async () => {
    for (const terminal of ['deleted', 'failed', 'orphaned'] as const) {
      expect([...ALLOWED_TEAM_RUNTIME_TRANSITIONS[terminal]]).toEqual([])
    }
  })
})

describe('P5-T5 TeamStateStore.create — 入册与索引在场', async () => {
  it('creates a creating-state with reserved childIds indexed before any spawn', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    expect(state.status).toBe('creating')
    expect(state.specSource).toBe('user')
    expect(state.version).toBe(1)
    expect(state.leadSessionId).toBe('lead-session-1')
    expect(state.members.map((m) => m.sessionId)).toEqual(['child-a', 'child-b'])
    expect(state.members.map((m) => m.phase)).toEqual(['pending', 'pending'])
    expect(state.members.map((m) => m.agentType)).toEqual(['general-purpose', 'general-purpose'])
    expect(state.members[0]!.category).toBe('quick')
    expect(state.members[1]!.category).toBeUndefined()
    expect(state.shutdownRequests).toEqual([])
    // teamRunId is a random UUID (36 chars, hyphenated) — not empty, not fixed.
    expect(state.teamRunId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

    // All three indexes carry the row the moment create returns.
    expect(store.get(state.teamRunId)).toBe(state)
    expect(store.teamOfLead('lead-session-1')?.teamRunId).toBe(state.teamRunId)
    expect(store.participationOfMember('child-a')).toEqual({ role: 'member', teamRunId: state.teamRunId, memberName: 'structure-analyst' })
    expect(store.participationOfMember('child-b')).toEqual({ role: 'member', teamRunId: state.teamRunId, memberName: 'deep-builder' })
  })

  it('assigns distinct teamRunIds to successive runs', async () => {
    const store = makeStore()
    const a = await store.create(provisioningInput({ teamName: 'team-a' }))
    const b = await store.create(provisioningInput({ teamName: 'team-b', leadSessionId: 'lead-2' }))
    expect(a.teamRunId).not.toBe(b.teamRunId)
  })

  it('rejects empty team name / empty members / bounds overflow by named code', async () => {
    const store = makeStore()
    await expect(store.create(provisioningInput({ teamName: '' }))).rejects.toThrowError(TeamStateError)
    try {
      await store.create(provisioningInput({ teamName: '' }))
    } catch (err) {
      expect((err as TeamStateError).code).toBe('TEAM_NAME_REQUIRED')
    }
    try {
      await store.create(provisioningInput({ members: [] }))
    } catch (err) {
      expect((err as TeamStateError).code).toBe('MEMBERS_EMPTY')
    }
    const nine = Array.from({ length: 9 }, (_, i) => ({ name: `m${i}`, seat: 'hephaestus', childId: `c${i}` }))
    try {
      await store.create(provisioningInput({ members: nine }))
    } catch (err) {
      expect((err as TeamStateError).code).toBe('BOUNDS_VIOLATION')
    }
  })

  it('rejects a lead that is already an active participant (the storage half of the nested gate)', async () => {
    const store = makeStore()
    await store.create(provisioningInput())
    // Same lead, second team → ALREADY_PARTICIPANT (the gate in team-create.ts
    // reads the same via participantOf; the store refuses at the source too).
    try {
      await store.create(provisioningInput({ teamName: 'second-team' }))
      throw new Error('expected a throw')
    } catch (err) {
      expect(err).toBeInstanceOf(TeamStateError)
      expect((err as TeamStateError).code).toBe('ALREADY_PARTICIPANT')
      expect((err as TeamStateError).message).toContain('already a participant of team')
    }
  })
})

describe('P5-T5 participantOf — the nested gate reads both arms', async () => {
  it('hits the member arm and the lead arm for an active run', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    expect(store.participantOf('lead-session-1')).toEqual({ role: 'lead', teamRunId: state.teamRunId })
    expect(store.participantOf('child-a')?.role).toBe('member')
    expect(store.participantOf('unrelated-session')).toBeUndefined()
  })

  it('does NOT gate a lead whose run reached a terminal status (ledger cleared)', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    await store.transition(state.teamRunId, 'failed')
    // failed is not ACTIVE → the lead is free to create again (first-failure
    // rollback frees the lead, task P5-T5).
    expect(store.participantOf('lead-session-1')).toBeUndefined()
    // And the store will now accept a fresh run for the same lead.
    const next = await store.create(provisioningInput({ teamName: 'retry-team' }))
    expect(next.teamRunId).not.toBe(state.teamRunId)
  })
})

describe('P5-T5 transition / setMemberPhase / forgetRun', async () => {
  it('walks creating→active→shutdown_requested→deleting→deleted legally', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    let s = await store.transition(state.teamRunId, 'active')
    expect(s.status).toBe('active')
    s = await store.transition(state.teamRunId, 'shutdown_requested')
    expect(s.status).toBe('shutdown_requested')
    s = await store.transition(state.teamRunId, 'deleting')
    expect(s.status).toBe('deleting')
    s = await store.transition(state.teamRunId, 'deleted')
    expect(s.status).toBe('deleted')
  })

  it('throws INVALID_TRANSITION on an illegal jump, leaving the state unchanged', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    try {
      await store.transition(state.teamRunId, 'deleted')
      throw new Error('expected a throw')
    } catch (err) {
      expect(err).toBeInstanceOf(TeamStateError)
      expect((err as TeamStateError).code).toBe('INVALID_TRANSITION')
    }
    expect(store.get(state.teamRunId)!.status).toBe('creating')
  })

  it('throws TEAM_NOT_FOUND for an unknown teamRunId', async () => {
    const store = makeStore()
    try {
      await store.transition('nope', 'active')
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as TeamStateError).code).toBe('TEAM_NOT_FOUND')
    }
  })

  it('setMemberPhase moves a known member and rejects unknown member / phase', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    const next = await store.setMemberPhase(state.teamRunId, 'structure-analyst', 'running')
    expect(next.members.find((m) => m.name === 'structure-analyst')!.phase).toBe('running')
    // The other member is untouched.
    expect(next.members.find((m) => m.name === 'deep-builder')!.phase).toBe('pending')
    try {
      await store.setMemberPhase(state.teamRunId, 'nobody', 'running')
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as TeamStateError).code).toBe('MEMBER_NOT_FOUND')
    }
    // An out-of-vocabulary phase cannot be constructed through the typed API,
    // so cast at the seam to prove the runtime guard is real, not just types.
    try {
      await store.setMemberPhase(state.teamRunId, 'structure-analyst', 'bogus' as never)
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as TeamStateError).code).toBe('UNKNOWN_MEMBER_PHASE')
    }
  })

  it('forgetRun clears every index for the run', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    await store.transition(state.teamRunId, 'active')
    await store.forgetRun(state.teamRunId)
    expect(store.get(state.teamRunId)).toBeUndefined()
    expect(store.teamOfLead('lead-session-1')).toBeUndefined()
    expect(store.participationOfMember('child-a')).toBeUndefined()
    expect(store.listActive()).toEqual([])
    // A freed lead can create again.
    const next = await store.create(provisioningInput())
    expect(next.status).toBe('creating')
  })

  it('listActive reports only the gating trio', async () => {
    const store = makeStore()
    const a = await store.create(provisioningInput({ teamName: 'a', leadSessionId: 'l-a' }))
    const b = await store.create(provisioningInput({ teamName: 'b', leadSessionId: 'l-b' }))
    const c = await store.create(provisioningInput({ teamName: 'c', leadSessionId: 'l-c' }))
    await store.transition(b.teamRunId, 'active')
    await store.transition(c.teamRunId, 'failed')
    expect(store.listActive().map((s) => s.teamName).sort()).toEqual(['a', 'b'])
    expect(store.listAll().length).toBe(3)
    // c (failed) is in listAll but never in listActive.
    expect(store.listActive().some((s) => s.teamRunId === c.teamRunId)).toBe(false)
    expect(a.status).toBe('creating')
  })
})

// ── P5-T7 追加：关停握手账 + briefing 账 + 拆除账（三段新账法的账本层）────
// 工具层的四路/幂等/权限在 team-shutdown.test.ts / team-delete.test.ts；这里
// 钉的是**账本本身**的原子性与读序——工具重组装、账法改不动。

describe('P5-T7 shutdown ledger — 一行一问、盖章不加行', async () => {
  it('requestShutdown claims the pending slot atomically; a second claim says alreadyPending', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    const first = await store.requestShutdown(state.teamRunId, 'structure-analyst', TEAM_LEAD_SENTINEL, 1700000000001)
    expect(first.alreadyPending).toBe(false)
    expect(first.request).toMatchObject({ memberId: 'structure-analyst', requesterName: TEAM_LEAD_SENTINEL, requestedAt: 1700000000001 })
    const second = await store.requestShutdown(state.teamRunId, 'structure-analyst', TEAM_LEAD_SENTINEL, 1700000000002)
    expect(second.alreadyPending).toBe(true)
    expect(second.request.requestedAt).toBe(1700000000001) // 旧行不被覆盖
    expect(store.get(state.teamRunId)!.shutdownRequests).toHaveLength(1)
  })

  it('requestShutdown refuses an unknown member by name (no phantom rows)', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    try {
      await store.requestShutdown(state.teamRunId, 'nobody', TEAM_LEAD_SENTINEL)
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as TeamStateError).code).toBe('UNKNOWN_MEMBER')
    }
    expect(store.get(state.teamRunId)!.shutdownRequests).toHaveLength(0)
  })

  it('approve stamps in place; completed/errored keep phase; missing request throws verbatim', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    try {
      await store.approveShutdown(state.teamRunId, 'structure-analyst')
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as TeamStateError).message).toBe(`shutdown request missing for 'structure-analyst'`)
      expect((err as TeamStateError).code).toBe('SHUTDOWN_REQUEST_MISSING')
    }
    await store.requestShutdown(state.teamRunId, 'structure-analyst', TEAM_LEAD_SENTINEL, 1700000000001)
    const approved = await store.approveShutdown(state.teamRunId, 'structure-analyst', 1700000000005)
    expect(approved).toMatchObject({ alreadyApproved: false, memberPhaseFlipped: true, approvedAt: 1700000000005 })
    expect(store.get(state.teamRunId)!.members.find((m) => m.name === 'structure-analyst')!.phase).toBe('shutdown_approved')
    const again = await store.approveShutdown(state.teamRunId, 'structure-analyst', 1700000000009)
    expect(again.alreadyApproved).toBe(true)
    expect(again.approvedAt).toBe(1700000000005) // 首戳不动
    // completed 保留终态：
    await store.requestShutdown(state.teamRunId, 'deep-builder', TEAM_LEAD_SENTINEL)
    await store.setMemberPhase(state.teamRunId, 'deep-builder', 'completed')
    const terminal = await store.approveShutdown(state.teamRunId, 'deep-builder')
    expect(terminal.memberPhaseFlipped).toBe(false)
    expect(store.get(state.teamRunId)!.members.find((m) => m.name === 'deep-builder')!.phase).toBe('completed')
    expect(terminal.request.approvedAt).toBeDefined() // 账照盖
  })

  it('reject same-reason is idempotent; a different reason re-stamps; resolved never blocks (倒序)', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    try {
      await store.rejectShutdown(state.teamRunId, 'structure-analyst', 'no request')
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as TeamStateError).code).toBe('SHUTDOWN_REQUEST_MISSING')
    }
    await store.requestShutdown(state.teamRunId, 'structure-analyst', TEAM_LEAD_SENTINEL, 1700000000001)
    const r1 = await store.rejectShutdown(state.teamRunId, 'structure-analyst', 'mid-analysis', 1700000000002)
    expect(r1.alreadyRejected).toBe(false)
    expect(r1.request.rejectedReason).toBe('mid-analysis')
    const r2 = await store.rejectShutdown(state.teamRunId, 'structure-analyst', 'mid-analysis', 1700000000003)
    expect(r2.alreadyRejected).toBe(true)
    expect(r2.request.rejectedAt).toBe(1700000000002) // 首戳不动
    // 不同 reason 重拒（上游 rejectShutdown 对已批请求的第四路再拒臂）：
    const r3 = await store.rejectShutdown(state.teamRunId, 'structure-analyst', 'blocked on tests', 1700000000004)
    expect(r3.alreadyRejected).toBe(false)
    expect(r3.request.rejectedReason).toBe('blocked on tests')
    // resolved 后新请求照开（行不加，pending 位已空）：
    const fresh = await store.requestShutdown(state.teamRunId, 'structure-analyst', TEAM_LEAD_SENTINEL)
    expect(fresh.alreadyPending).toBe(false)
    expect(store.get(state.teamRunId)!.shutdownRequests).toHaveLength(2)
  })

  it('releaseShutdownRequest frees ONLY the latest pending row (delivery-failure rollback)', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    await store.requestShutdown(state.teamRunId, 'structure-analyst', TEAM_LEAD_SENTINEL, 1700000000001)
    await store.approveShutdown(state.teamRunId, 'structure-analyst', 1700000000002)
    await store.requestShutdown(state.teamRunId, 'structure-analyst', TEAM_LEAD_SENTINEL, 1700000000003)
    await store.releaseShutdownRequest(state.teamRunId, 'structure-analyst')
    const rows = store.get(state.teamRunId)!.shutdownRequests
    expect(rows).toHaveLength(1)
    expect(rows[0]!.approvedAt).toBe(1700000000002) // 已决行不碰
    // latest 仍指已决行（倒序含 resolved），但 pending 位已空：新 request 照开。
    expect(store.latestShutdownRequest(state.teamRunId, 'structure-analyst')!.approvedAt).toBe(1700000000002)
    expect((await store.requestShutdown(state.teamRunId, 'structure-analyst', TEAM_LEAD_SENTINEL)).alreadyPending).toBe(false)
    // 无 pending 时 release 是安静 no-op（幂等）——先 release 再数行。
    const before = store.get(state.teamRunId)!.shutdownRequests.length
    await store.releaseShutdownRequest(state.teamRunId, 'structure-analyst') // 撤掉刚开的 pending
    expect(store.get(state.teamRunId)!.shutdownRequests).toHaveLength(before - 1)
    await store.releaseShutdownRequest(state.teamRunId, 'structure-analyst') // 再 release 无 pending
    expect(store.get(state.teamRunId)!.shutdownRequests).toHaveLength(before - 1)
  })

  it('isShutdownRequestPending reads the two stamps', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    const { request } = await store.requestShutdown(state.teamRunId, 'structure-analyst', TEAM_LEAD_SENTINEL)
    expect(isShutdownRequestPending(request)).toBe(true)
    expect(isShutdownRequestPending((await store.approveShutdown(state.teamRunId, 'structure-analyst')).request)).toBe(false)
  })
})

describe('P5-T7 briefing ledger — 原子 claim，重复物化不重注', async () => {
  it('claimBriefingInjection flips once per (run, member); others answer false', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    expect(store.hasBriefingInjected(state.teamRunId, 'structure-analyst')).toBe(false)
    expect(await store.claimBriefingInjection(state.teamRunId, 'structure-analyst')).toBe(true)
    expect(store.hasBriefingInjected(state.teamRunId, 'structure-analyst')).toBe(true)
    expect(await store.claimBriefingInjection(state.teamRunId, 'structure-analyst')).toBe(false)
    expect(await store.claimBriefingInjection(state.teamRunId, 'deep-builder')).toBe(true)
    expect(store.get(state.teamRunId)!.briefingInjectedMembers).toEqual(['structure-analyst', 'deep-builder'])
    // 账是 per-run 的：另一个 run 同名成员不受影响。
    const other = await store.create(provisioningInput({ teamName: 'other', leadSessionId: 'l-2' }))
    expect(await store.claimBriefingInjection(other.teamRunId, 'structure-analyst')).toBe(true)
  })

  it('releaseBriefingInjection frees the claim — 未送达不占幂等位（评审 T7-MINOR）', async () => {
    // 与 releaseShutdownRequest/unmarkMessageProcessed 同一族不变量：注入
    // 抛错 = 未送达，退账后下一次物化才能再 claim 再投。
    const store = makeStore()
    const state = await store.create(provisioningInput())
    expect(await store.claimBriefingInjection(state.teamRunId, 'structure-analyst')).toBe(true)
    expect(await store.claimBriefingInjection(state.teamRunId, 'structure-analyst')).toBe(false) // 占位挡重注
    await store.releaseBriefingInjection(state.teamRunId, 'structure-analyst')
    expect(store.hasBriefingInjected(state.teamRunId, 'structure-analyst')).toBe(false)
    expect(await store.claimBriefingInjection(state.teamRunId, 'structure-analyst')).toBe(true) // 退账后可再注
    // 账面只动被退的名：同 run 另一成员的账纹丝不动。
    expect(await store.claimBriefingInjection(state.teamRunId, 'deep-builder')).toBe(true)
    await store.releaseBriefingInjection(state.teamRunId, 'structure-analyst')
    expect(store.get(state.teamRunId)!.briefingInjectedMembers).toEqual(['deep-builder'])
    // 未入账的名退账 = 安静 no-op（幂等，不炸不改账面）。
    await store.releaseBriefingInjection(state.teamRunId, 'nobody') // no-op 不炸
    expect(store.get(state.teamRunId)!.briefingInjectedMembers).toEqual(['deep-builder'])
    // 键 = (run, memberName)：别的 run 同名成员不受本 run 退账牵连。
    const other = await store.create(provisioningInput({ teamName: 'other', leadSessionId: 'l-2' }))
    expect(await store.claimBriefingInjection(other.teamRunId, 'deep-builder')).toBe(true)
    await store.releaseBriefingInjection(state.teamRunId, 'deep-builder')
    expect(store.hasBriefingInjected(other.teamRunId, 'deep-builder')).toBe(true)
  })
})

describe('P5-T7 teardown ledger — force 清账、绕表臂、retire 留 tombstone', async () => {
  it('forceCompleteMembers flips only the completable trio and names who moved', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    await store.setMemberPhase(state.teamRunId, 'deep-builder', 'completed')
    const moved = await store.forceCompleteMembers(state.teamRunId)
    expect(moved).toEqual(['structure-analyst']) // builder 已 completed，不动
    expect(store.get(state.teamRunId)!.members.find((m) => m.name === 'structure-analyst')!.phase).toBe('completed')
    expect([...TEAM_FORCE_COMPLETABLE_MEMBER_PHASES].sort()).toEqual(['idle', 'pending', 'running'])
  })

  it('forceTransitionToDeleting takes only creating/orphaned; the rest is INVALID_TRANSITION', async () => {
    const store = makeStore()
    const a = await store.create(provisioningInput())
    expect((await store.forceTransitionToDeleting(a.teamRunId)).status).toBe('deleting')
    const b = await store.create(provisioningInput({ leadSessionId: 'l-b' }))
    await store.transition(b.teamRunId, 'active')
    try {
      await store.forceTransitionToDeleting(b.teamRunId)
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as TeamStateError).code).toBe('INVALID_TRANSITION')
    }
    // deleting 同态放行（重入幂等）。
    expect((await store.forceTransitionToDeleting(a.teamRunId)).status).toBe('deleting')
  })

  it('retireRunIndexes drops the participation indexes but the tombstone row READS ON', async () => {
    const store = makeStore()
    const state = await store.create(provisioningInput())
    await store.transition(state.teamRunId, 'active')
    store.retireRunIndexes(state.teamRunId)
    expect(store.teamOfLead('lead-session-1')).toBeUndefined()
    expect(store.participationOfMember('child-a')).toBeUndefined()
    expect(store.participantOf('lead-session-1')).toBeUndefined()
    // listActive 是状态视角：retire 不改状态（deleted 由拆除路径盖章），
    // 索引撤净后它不再被 participant 视角命中。
    const tombstone = store.get(state.teamRunId)
    expect(tombstone).toBeDefined()
    expect(tombstone!.status).toBe('active') // retire 不改状态——deleted 由拆除路径盖章
    // freed lead can create again（嵌套闸随索引撤而开）。
    const next = await store.create(provisioningInput())
    expect(next.status).toBe('creating')
  })

  it('TEAM_DELETABLE_MEMBER_PHASES is upstream shutdown-helpers word-for-word', async () => {
    expect([...TEAM_DELETABLE_MEMBER_PHASES].sort()).toEqual(['completed', 'errored', 'shutdown_approved'])
  })
})

// ── P5-T8b 换装追加：落盘在场、双账跨重启、resume 经适配器 ──────────────────
// T5 时代的「纯内存」证明不了 T8b 的三件事：state.json 真在磁盘上、双账在
// sidecar 里跨「新实例」仍在、resume 经 session-context 适配器真把失联 lead
// 的 run 标 orphaned 并落盘。逐枚钉。

describe('P5-T8b persistence — 落盘在场、双账跨实例、resume 经适配器', async () => {
  it('create writes state.json + omo-team sidecar under <base_dir>/runtime/<runId>/', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omo-team-state-test-'))
    tempDirs.push(dir)
    const store = new TeamStateStore(buildTeamModeConfig({ OMO_TEAM_BASE_DIR: dir }))
    const state = await store.create(provisioningInput())
    const runtimeDir = join(dir, 'runtime', state.teamRunId)
    const stateJson = JSON.parse(readFileSync(join(runtimeDir, 'state.json'), 'utf8')) as {
      status: string
      teamRunId: string
      members: { name: string; sessionId?: string; status: string }[]
      shutdownRequests: unknown[]
    }
    expect(stateJson.teamRunId).toBe(state.teamRunId)
    expect(stateJson.status).toBe('creating')
    expect(stateJson.members.map((m) => m.sessionId)).toEqual(['child-a', 'child-b'])
    // 成员行是 vendored 词汇：status 不叫 phase，且**没有 seat/双账键**——
    // strict schema 的裁定面在此留影。
    expect(stateJson.members[0]).not.toHaveProperty('seat')
    expect(stateJson).not.toHaveProperty('processedMessageIds')
    expect(stateJson).not.toHaveProperty('briefingInjectedMembers')
    const ledger = JSON.parse(readFileSync(join(runtimeDir, 'omo-team-extensions.json'), 'utf8')) as {
      version: number
      memberSeats: Record<string, string>
      memberCategories: Record<string, string>
    }
    expect(ledger.version).toBe(1)
    expect(ledger.memberSeats).toEqual({ 'structure-analyst': 'sisyphus-junior', 'deep-builder': 'hephaestus' })
    expect(ledger.memberCategories).toEqual({ 'structure-analyst': 'quick' })
  })

  it('dual ledgers survive a fresh store instance over the same base_dir (restart)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omo-team-state-test-'))
    tempDirs.push(dir)
    const config = buildTeamModeConfig({ OMO_TEAM_BASE_DIR: dir })
    const first = new TeamStateStore(config)
    const state = await first.create(provisioningInput())
    await first.markMessageProcessed(state.teamRunId, 'msg-1')
    await first.claimBriefingInjection(state.teamRunId, 'structure-analyst')
    await first.transition(state.teamRunId, 'active')

    // 「重启」= 同一 base_dir 上的新实例 + rebuildIndexes（boot 的同形）。
    const second = new TeamStateStore(config)
    await second.rebuildIndexes()
    expect(second.get(state.teamRunId)?.status).toBe('active')
    expect(second.hasProcessedMessage(state.teamRunId, 'msg-1')).toBe(true)
    expect(second.hasBriefingInjected(state.teamRunId, 'structure-analyst')).toBe(true)
    // 锁内重读的去重跨实例成立：新实例再投同 id = false。
    expect(await second.markMessageProcessed(state.teamRunId, 'msg-1')).toBe(false)
    // 参与账跨重启重建：嵌套闸对新实例的同一 lead 照样拦。
    expect(second.participantOf('lead-session-1')?.teamRunId).toBe(state.teamRunId)
  })

  it('resume through the session-context adapter orphans a run whose lead is gone (verbatim vendored semantics)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omo-team-state-test-'))
    tempDirs.push(dir)
    const config = buildTeamModeConfig({ OMO_TEAM_BASE_DIR: dir })
    const store = new TeamStateStore(config)
    const state = await store.create(provisioningInput())
    await store.transition(state.teamRunId, 'active')
    // 空注册表 = lead 与成员都不在场（适配器把 ctx.agents.get 译成 404 形）。
    const agents: TeamLiveAgents = { get: () => undefined }
    const report = await store.resume(buildTeamSessionContext(agents))
    expect(report.marked_orphaned).toBe(1)
    expect(readFileSync(join(dir, 'runtime', state.teamRunId, 'state.json'), 'utf8')).toContain('"orphaned"')
    // orphaned 非 ACTIVE：镜像随 resume 重建后嵌套闸已松绑。
    expect(store.participantOf('lead-session-1')).toBeUndefined()
  })
})
