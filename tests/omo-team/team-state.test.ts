// P5-T5 — team-state.ts 状态机骨架的单元测试（纯内存，零 io）。
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
import { describe, expect, it } from 'vitest'
import {
  ACTIVE_TEAM_RUNTIME_STATUSES,
  ALLOWED_TEAM_RUNTIME_TRANSITIONS,
  TEAM_LEAD_SENTINEL,
  TEAM_MEMBER_PHASES,
  TEAM_RUNTIME_BOUNDS_DEFAULTS,
  TEAM_RUNTIME_STATE_VERSION,
  TEAM_RUNTIME_STATUSES,
  TeamStateError,
  TeamStateMemoryStore,
  isValidTeamRuntimeTransition,
  type TeamRuntimeStatus,
} from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

/** 一个合法的两成员 create 入参（lead + 两席；childId 手打便于逐枚断言）。 */
function provisioningInput(overrides: Partial<Parameters<TeamStateMemoryStore['create']>[0]> = {}) {
  return {
    teamName: 'analysis-team',
    leadSessionId: 'lead-session-1',
    members: [
      { name: 'structure-analyst', seat: 'sisyphus-junior', category: 'quick', childId: 'child-a' },
      { name: 'deep-builder', seat: 'hephaestus', childId: 'child-b' },
    ],
    now: 1700000000000,
    ...overrides,
  }
}

describe('P5-T5 team-state vocabulary — 上游逐字镜像的派生纪律', () => {
  it('seven runtime statuses, in upstream declaration order', () => {
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

  it('six member phases, in upstream enum order', () => {
    expect([...TEAM_MEMBER_PHASES]).toEqual([
      'pending',
      'running',
      'idle',
      'errored',
      'completed',
      'shutdown_approved',
    ])
  })

  it('TEAM_LEAD_SENTINEL is the senpi "lead" vocabulary (normalize.ts:14)', () => {
    expect(TEAM_LEAD_SENTINEL).toBe('lead')
  })

  it('bounds defaults are the five upstream values', () => {
    expect(TEAM_RUNTIME_BOUNDS_DEFAULTS).toEqual({
      maxMembers: 8,
      maxParallelMembers: 4,
      maxMessagesPerRun: 10000,
      maxWallClockMinutes: 120,
      maxMemberTurns: 500,
    })
    expect(TEAM_RUNTIME_STATE_VERSION).toBe(1)
  })

  it('ACTIVE gating set is creating|active|shutdown_requested (hook.ts:11)', () => {
    expect([...ACTIVE_TEAM_RUNTIME_STATUSES].sort()).toEqual(
      [...['creating', 'active', 'shutdown_requested'].sort()],
    )
  })
})

describe('P5-T5 isValidTeamRuntimeTransition — the store.ts:115-119 short-circuit', () => {
  it('allows every same-state transition', () => {
    for (const status of TEAM_RUNTIME_STATUSES) {
      expect(isValidTeamRuntimeTransition(status, status)).toBe(true)
    }
  })

  it('allows ANY source state to orphaned (the adoption entry)', () => {
    for (const from of TEAM_RUNTIME_STATUSES) {
      expect(isValidTeamRuntimeTransition(from, 'orphaned')).toBe(true)
    }
  })

  it('honors the forward table exactly (creating→{active,failed} etc.)', () => {
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

  it('rejects the illegal forward/backward jumps by name', () => {
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

  it('terminal states have an empty forward set (deleted/failed/orphaned)', () => {
    for (const terminal of ['deleted', 'failed', 'orphaned'] as const) {
      expect([...ALLOWED_TEAM_RUNTIME_TRANSITIONS[terminal]]).toEqual([])
    }
  })
})

describe('P5-T5 TeamStateMemoryStore.create — 入册与索引在场', () => {
  it('creates a creating-state with reserved childIds indexed before any spawn', () => {
    const store = new TeamStateMemoryStore()
    const state = store.create(provisioningInput())
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

  it('assigns distinct teamRunIds to successive runs', () => {
    const store = new TeamStateMemoryStore()
    const a = store.create(provisioningInput({ teamName: 'team-a' }))
    const b = store.create(provisioningInput({ teamName: 'team-b', leadSessionId: 'lead-2' }))
    expect(a.teamRunId).not.toBe(b.teamRunId)
  })

  it('rejects empty team name / empty members / bounds overflow by named code', () => {
    const store = new TeamStateMemoryStore()
    expect(() => store.create(provisioningInput({ teamName: '' }))).toThrowError(TeamStateError)
    try {
      store.create(provisioningInput({ teamName: '' }))
    } catch (err) {
      expect((err as TeamStateError).code).toBe('TEAM_NAME_REQUIRED')
    }
    try {
      store.create(provisioningInput({ members: [] }))
    } catch (err) {
      expect((err as TeamStateError).code).toBe('MEMBERS_EMPTY')
    }
    const nine = Array.from({ length: 9 }, (_, i) => ({ name: `m${i}`, seat: 'hephaestus', childId: `c${i}` }))
    try {
      store.create(provisioningInput({ members: nine }))
    } catch (err) {
      expect((err as TeamStateError).code).toBe('BOUNDS_VIOLATION')
    }
  })

  it('rejects a lead that is already an active participant (the storage half of the nested gate)', () => {
    const store = new TeamStateMemoryStore()
    store.create(provisioningInput())
    // Same lead, second team → ALREADY_PARTICIPANT (the gate in team-create.ts
    // reads the same via participantOf; the store refuses at the source too).
    try {
      store.create(provisioningInput({ teamName: 'second-team' }))
      throw new Error('expected a throw')
    } catch (err) {
      expect(err).toBeInstanceOf(TeamStateError)
      expect((err as TeamStateError).code).toBe('ALREADY_PARTICIPANT')
      expect((err as TeamStateError).message).toContain('already a participant of team')
    }
  })
})

describe('P5-T5 participantOf — the nested gate reads both arms', () => {
  it('hits the member arm and the lead arm for an active run', () => {
    const store = new TeamStateMemoryStore()
    const state = store.create(provisioningInput())
    expect(store.participantOf('lead-session-1')).toEqual({ role: 'lead', teamRunId: state.teamRunId })
    expect(store.participantOf('child-a')?.role).toBe('member')
    expect(store.participantOf('unrelated-session')).toBeUndefined()
  })

  it('does NOT gate a lead whose run reached a terminal status (ledger cleared)', () => {
    const store = new TeamStateMemoryStore()
    const state = store.create(provisioningInput())
    store.transition(state.teamRunId, 'failed')
    // failed is not ACTIVE → the lead is free to create again (first-failure
    // rollback frees the lead, task P5-T5).
    expect(store.participantOf('lead-session-1')).toBeUndefined()
    // And the store will now accept a fresh run for the same lead.
    const next = store.create(provisioningInput({ teamName: 'retry-team' }))
    expect(next.teamRunId).not.toBe(state.teamRunId)
  })
})

describe('P5-T5 transition / setMemberPhase / forgetRun', () => {
  it('walks creating→active→shutdown_requested→deleting→deleted legally', () => {
    const store = new TeamStateMemoryStore()
    const state = store.create(provisioningInput())
    let s = store.transition(state.teamRunId, 'active')
    expect(s.status).toBe('active')
    s = store.transition(state.teamRunId, 'shutdown_requested')
    expect(s.status).toBe('shutdown_requested')
    s = store.transition(state.teamRunId, 'deleting')
    expect(s.status).toBe('deleting')
    s = store.transition(state.teamRunId, 'deleted')
    expect(s.status).toBe('deleted')
  })

  it('throws INVALID_TRANSITION on an illegal jump, leaving the state unchanged', () => {
    const store = new TeamStateMemoryStore()
    const state = store.create(provisioningInput())
    try {
      store.transition(state.teamRunId, 'deleted')
      throw new Error('expected a throw')
    } catch (err) {
      expect(err).toBeInstanceOf(TeamStateError)
      expect((err as TeamStateError).code).toBe('INVALID_TRANSITION')
    }
    expect(store.get(state.teamRunId)!.status).toBe('creating')
  })

  it('throws TEAM_NOT_FOUND for an unknown teamRunId', () => {
    const store = new TeamStateMemoryStore()
    try {
      store.transition('nope', 'active')
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as TeamStateError).code).toBe('TEAM_NOT_FOUND')
    }
  })

  it('setMemberPhase moves a known member and rejects unknown member / phase', () => {
    const store = new TeamStateMemoryStore()
    const state = store.create(provisioningInput())
    const next = store.setMemberPhase(state.teamRunId, 'structure-analyst', 'running')
    expect(next.members.find((m) => m.name === 'structure-analyst')!.phase).toBe('running')
    // The other member is untouched.
    expect(next.members.find((m) => m.name === 'deep-builder')!.phase).toBe('pending')
    try {
      store.setMemberPhase(state.teamRunId, 'nobody', 'running')
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as TeamStateError).code).toBe('MEMBER_NOT_FOUND')
    }
    // An out-of-vocabulary phase cannot be constructed through the typed API,
    // so cast at the seam to prove the runtime guard is real, not just types.
    try {
      store.setMemberPhase(state.teamRunId, 'structure-analyst', 'bogus' as never)
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as TeamStateError).code).toBe('UNKNOWN_MEMBER_PHASE')
    }
  })

  it('forgetRun clears every index for the run', () => {
    const store = new TeamStateMemoryStore()
    const state = store.create(provisioningInput())
    store.transition(state.teamRunId, 'active')
    store.forgetRun(state.teamRunId)
    expect(store.get(state.teamRunId)).toBeUndefined()
    expect(store.teamOfLead('lead-session-1')).toBeUndefined()
    expect(store.participationOfMember('child-a')).toBeUndefined()
    expect(store.listActive()).toEqual([])
    // A freed lead can create again.
    const next = store.create(provisioningInput())
    expect(next.status).toBe('creating')
  })

  it('listActive reports only the gating trio', () => {
    const store = new TeamStateMemoryStore()
    const a = store.create(provisioningInput({ teamName: 'a', leadSessionId: 'l-a' }))
    const b = store.create(provisioningInput({ teamName: 'b', leadSessionId: 'l-b' }))
    const c = store.create(provisioningInput({ teamName: 'c', leadSessionId: 'l-c' }))
    store.transition(b.teamRunId, 'active')
    store.transition(c.teamRunId, 'failed')
    expect(store.listActive().map((s) => s.teamName).sort()).toEqual(['a', 'b'])
    expect(store.listAll().length).toBe(3)
    // c (failed) is in listAll but never in listActive.
    expect(store.listActive().some((s) => s.teamRunId === c.teamRunId)).toBe(false)
    expect(a.status).toBe('creating')
  })
})
