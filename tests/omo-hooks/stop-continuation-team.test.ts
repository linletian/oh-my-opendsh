// P5-T9 · 单测：stop-continuation guard 的 **team 分支**（manifest 行 ⑰
// `stop-continuation-team` 的消费半）+ 跨包服务名的交叉等值（R-5 同族）。
//
// 这个文件钉的是任务书交付面 3 的全部断言面：
//   * team 在场：逐成员 interrupt 的**调用序**（先 jobs 级联后 team 分支、
//     成员按查询面行序、drain 一把且只带成功开火的 id）；
//   * jobs 级联**并存**：同一 stop 里 jobs.kill 与 team.interrupt 都发生，
//     两族 marker 互不混淆（`stop-continuation-guard:` 与
//     `stop-continuation-guard team` 前缀互斥）；
//   * **降级 marker 可区分**：查询面缺席 / lead 不在场 / 通道缺席各自一句
//     NOTE，且 happy path 反向断言它们一条都不出现（Phase 4.5 金丝雀纪律）；
//   * team 缺席 = **静默**：非 team 会话的 stop 不产出任何 team 前缀行，
//     也不碰通道（反向断言）；
//   * **同步契约（Q-6 NOTES-7）**：stop() 在 drain 未 settle 时已同步返回
//     verdict；异步落地经 outcome.team.teamDrain 可 join，永不 reject。
//
// 跨包纪律的镜像：本文件 import omo-team 只为一件事——把提供侧的服务名常量
// 拿来与消费侧的本地常量做**等值断言**（`omoStopContinuation` 的 R-5 先例，
// tests/omo-commands/stop-continuation.test.ts 同族）。生产代码两侧零 import，
// 这里就是那个"钉"。

import { afterEach, describe, expect, it } from 'vitest'

import {
  OMO_TEAM_MEMBER_QUERY_SERVICE,
  STOP_CONTINUATION_GUARD_ID,
  createStopContinuationGuard,
  type StopContinuationGuard,
  type StopContinuationJobsLike,
  type StopContinuationOutcome,
} from '../../patches/omo-dsh/omo-hooks/src/services/stop-continuation-guard.ts'
import {
  OMO_TEAM_MEMBER_QUERY_SERVICE as PROVIDER_SIDE_SERVICE_NAME,
  createTeamMemberQueryService,
} from '../../patches/omo-dsh/omo-team/src/team/team-stop-continuation.ts'
import { TeamStateStore } from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'
import { cleanupEphemeralStores, makeStore } from '../omo-team/support/ephemeral-store.ts'

afterEach(async () => {
  await cleanupEphemeralStores()
})

const LEAD = 'lead-session-t9'

const members = [
  { teamRunId: 'run-1', memberName: 'analyst', sessionId: 'child-analyst' },
  { teamRunId: 'run-1', memberName: 'builder', sessionId: 'child-builder' },
]

// ── 假面（记录一切调用，形状贴着 guard 的结构声明）────────────────────────────

type RecordedInterrupt = { targetSessionId: string; authorityKind: string; agent: unknown }

interface FakeChannel {
  interrupts: RecordedInterrupt[]
  drains: Array<{ parent: unknown; childIds: readonly string[] }>
  /** drain 的可控 promise：默认 pending，测试手动 settle/reject。 */
  drainControl: { settle: () => void; fail: (err: Error) => void }
  drainPromise: Promise<unknown>
  interruptBehavior: (targetSessionId: string) => void
}

function makeChannel(): FakeChannel {
  let settle!: () => void
  let fail!: (err: Error) => void
  const drainPromise = new Promise<unknown>((resolve, reject) => {
    settle = () => resolve(undefined)
    fail = (err: Error) => reject(err)
  })
  // guard 只发起不 await；这条尾巴的 catch 归 guard，测试这里再挂一个 noop
  // 防 Node 的 unhandled-rejection 噪音（drain 失败用例专用）。
  drainPromise.catch(() => undefined)
  return {
    interrupts: [],
    drains: [],
    drainControl: { settle: () => settle(), fail: (err: Error) => fail(err) },
    drainPromise,
    interruptBehavior: () => undefined,
  }
}

function channelFacade(channel: FakeChannel) {
  return {
    interrupt: (targetSessionId: string, authority: { kind: string; agent?: unknown }) => {
      if (authority.kind !== 'ancestor') {
        throw new Error(`fake channel: only ancestor authority is modeled, got ${authority.kind}`)
      }
      channel.interrupts.push({ targetSessionId, authorityKind: authority.kind, agent: authority.agent })
      channel.interruptBehavior(targetSessionId)
    },
    drainContinuableChildren: (parent: unknown, childIds: readonly string[]) => {
      channel.drains.push({ parent, childIds })
      return channel.drainPromise
    },
  }
}

function fakeJobs(rows: Array<{ id: string; status: string; owner: string }>): { jobs: StopContinuationJobsLike; kills: string[] } {
  const kills: string[] = []
  const jobs: StopContinuationJobsLike = {
    // v2 面（0.2.x）：caller 是 SessionId 字符串；带 `events` 让 dshRuntimeShape
    // 判 v2（身份标记，非能力探针）。
    events: {},
    list: () => rows,
    kill: (id: string) => {
      kills.push(id)
      return 'requested'
    },
  }
  return { jobs, kills }
}

interface GuardFixture {
  guard: StopContinuationGuard
  logs: string[]
  channel: FakeChannel
}

function makeGuard(opts: {
  members?: Array<{ teamRunId: string; memberName: string; sessionId: string }>
  /** undefined = 查询面缺席（ctx.get 回 undefined）；'unwired' = seam 缺席。 */
  queryService?: 'absent' | 'unwired'
  leadPresent?: boolean
  jobs?: Array<{ id: string; status: string; owner: string }>
  /** subagents 通道的三种不健康形态（评审 MINOR 补测的三扇门）：
   *  'unwired' = readAgents/readSubagents seam 缺席（cascadeTeamMembers ④
   *              seam-缺席的 NOTE 支）；
   *  'absent'  = seam 在、ctx.get 回 undefined（cascadeTeamMembers 里
   *              `subagents === undefined` 的 NOTE 支）；
   *  'throws'  = seam 的取数直接抛（cascadeTeamMembers 里
   *              `deps.readSubagents()` 补 try 后的新 NOTE 支）。 */
  subagentsSurface?: 'unwired' | 'absent' | 'throws'
  /** true = drainContinuableChildren **同步**抛（服务面坏，方法不在脸上）——
   *  cascadeTeamMembers ⑥ 的同步抛 catch 兜底支：NOTE + teamDrain 落成
   *  false，stop 不抛。 */
  drainThrowsSync?: boolean
}): GuardFixture {
  const logs: string[] = []
  const channel = makeChannel()
  const leadAgent = { id: LEAD }
  const members = opts.members ?? []
  const queryServicePresent = opts.queryService !== 'absent' && opts.queryService !== 'unwired'
  const { jobs, kills } = fakeJobs(opts.jobs ?? [])
  void kills
  const subagentsSurface = opts.subagentsSurface
  const facade = channelFacade(channel)
  const guard = createStopContinuationGuard({
    readJobs: () => jobs,
    ...(opts.queryService === 'unwired' ? {} : {
      readTeamQuery: () => (queryServicePresent
        ? { liveMembersOfLead: (leadSessionId: string) => (leadSessionId === LEAD ? members : []) }
        : undefined),
    }),
    ...(opts.queryService === 'unwired' || subagentsSurface === 'unwired' ? {} : {
      readSubagents: subagentsSurface === 'absent'
        ? () => undefined
        : subagentsSurface === 'throws'
          ? (() => {
              throw new Error('subagents registry exploded')
            })
          : () => (opts.drainThrowsSync
            ? {
                ...facade,
                drainContinuableChildren: () => {
                  throw new TypeError('drainContinuableChildren is not a function on this face')
                },
              }
            : facade),
      readAgents: () => ({ get: (sessionId: string) => (sessionId === LEAD && opts.leadPresent !== false ? leadAgent : undefined) }),
    }),
    log: (line) => logs.push(line),
  })
  return { guard, logs, channel }
}

const TEAM_MARKER_PREFIX = `[omo-hooks] ${STOP_CONTINUATION_GUARD_ID} team`
const JOBS_LINE_PREFIX = `[omo-hooks] ${STOP_CONTINUATION_GUARD_ID}: continuation stopped for session `
const TEAM_NOTE_PREFIX = `[omo-hooks] ${STOP_CONTINUATION_GUARD_ID} team NOTE:`

// ── ① team 在场：调用序 + marker 可区分 + jobs 并存 ─────────────────────────

describe('P5-T9 team branch — team present: call order, markers, jobs coexistence', () => {
  it('interrupts every member in roster order under ancestor authority, then initiates ONE drain with the interrupted ids', () => {
    const { guard, channel } = makeGuard({ members })
    const outcome = guard.stop(LEAD)
    // 逐成员 interrupt，行序 = 查询面行序；authority = ancestor + 活体精确实例。
    expect(channel.interrupts.map((i) => i.targetSessionId)).toEqual(['child-analyst', 'child-builder'])
    expect(channel.interrupts.every((i) => i.authorityKind === 'ancestor')).toBe(true)
    expect(channel.interrupts.every((i) => i.agent !== undefined)).toBe(true)
    // drain 一把，集合 = 成功开火的 id（guard 的集合语义 = 成功开火集，
    // **不是** T7 的尝试全集——两态差异的成文处 = guard.ts ⑥ 注）。
    expect(channel.drains).toHaveLength(1)
    expect(channel.drains[0]!.childIds).toEqual(['child-analyst', 'child-builder'])
    // verdict 同步在场。
    expect(outcome.team?.teamServicePresent).toBe(true)
    expect(outcome.team?.teamRunId).toBe('run-1')
    expect(outcome.team?.interruptedMemberSessionIds).toEqual(['child-analyst', 'child-builder'])
    expect(outcome.team?.interruptFailedMemberSessionIds).toEqual([])
    expect(outcome.team?.drainInitiated).toBe(true)
  })

  it('the jobs cascade coexists and the two marker families are mutually exclusive strings', async () => {
    const { guard, logs, channel } = makeGuard({
      members,
      jobs: [{ id: 'job-1', status: 'running', owner: LEAD }],
    })
    const outcome = guard.stop(LEAD)
    // jobs 级联照常跑（并存，不是被 team 分支替换）。
    expect(outcome.cancelledJobIds).toEqual(['job-1'])
    expect(outcome.team?.interruptedMemberSessionIds).toHaveLength(2)
    // jobs 行在场且不含 team token；team 行在场且不含 jobs 从句。
    const jobsLines = logs.filter((line) => line.startsWith(JOBS_LINE_PREFIX))
    const teamLines = logs.filter((line) => line.startsWith(TEAM_MARKER_PREFIX))
    expect(jobsLines).toHaveLength(1)
    expect(teamLines.length).toBeGreaterThanOrEqual(1)
    expect(jobsLines[0]).not.toContain('stop-continuation-guard team')
    expect(teamLines.every((line) => !line.includes('jobs service'))).toBe(true)
    // 降级 NOTE 一条都不出现（happy path 反向断言）。
    expect(logs.some((line) => line.startsWith(TEAM_NOTE_PREFIX))).toBe(false)
    expect(logs.some((line) => line.includes('drain FAILED'))).toBe(false)
    // drain settle 后自己的 marker 行落地（异步出口可观察）。
    channel.drainControl.settle()
    await outcome.team?.teamDrain
    expect(logs.some((line) => line.includes('drain settled') && line.includes('run-1'))).toBe(true)
  })

  it('the drain settles AFTER stop() returned — the synchronous contract of NOTES-7 survives', () => {
    const { guard, logs } = makeGuard({ members })
    let returned: StopContinuationOutcome | undefined
    // stop() 必须同步返回（没有任何 await 点）；drain 此刻仍 pending。
    const call = () => {
      returned = guard.stop(LEAD)
    }
    call()
    expect(returned).toBeDefined()
    expect(returned!.team?.drainInitiated).toBe(true)
    // stop 返回时日志里只有发起行，没有 settle 行——settle 是异步尾巴。
    expect(logs.some((line) => line.includes('drain settled'))).toBe(false)
    expect(returned!.team?.teamDrain).toBeInstanceOf(Promise)
  })

  it('a rejected drain is loud-but-non-fatal: its own FAILED marker, the promise resolves false', async () => {
    const { guard, logs, channel } = makeGuard({ members })
    const outcome = guard.stop(LEAD)
    channel.drainControl.fail(new Error('manager exploded'))
    const settled = await outcome.team?.teamDrain
    expect(settled).toBe(false)
    expect(logs.some((line) => line.includes('team drain FAILED') && line.includes('manager exploded'))).toBe(true)
    // FAILED 行仍带 team 前缀（marker 纪律：整族可 grep）。
    expect(logs.filter((line) => line.includes('team drain FAILED')).every((line) => line.startsWith(TEAM_MARKER_PREFIX))).toBe(true)
  })

  it('one member whose interrupt throws goes to its own bucket; the rest keep going; drain carries only the interrupted ids', () => {
    const { guard, logs, channel } = makeGuard({ members })
    channel.interruptBehavior = (targetSessionId: string) => {
      if (targetSessionId === 'child-analyst') throw new Error('UNAUTHORIZED: not a live target of this parent')
    }
    const outcome = guard.stop(LEAD)
    expect(outcome.team?.interruptedMemberSessionIds).toEqual(['child-builder'])
    expect(outcome.team?.interruptFailedMemberSessionIds).toEqual(['child-analyst'])
    expect(channel.drains[0]!.childIds).toEqual(['child-builder'])
    // 失败成员有自己的行，汇总行报出非零失败数（不谎报零失败）。
    expect(logs.some((line) => line.includes('interrupt child-analyst') && line.includes('UNAUTHORIZED'))).toBe(true)
    expect(logs.some((line) => line.includes('interrupted 1 member session(s)') && line.includes('interrupt failed 1'))).toBe(true)
  })
})

// ── ② team 缺席：静默 + 不碰通道（反向断言）─────────────────────────────────

describe('P5-T9 team branch — team absent: silence, zero channel calls (the reverse canary)', () => {
  it('a session leading no team produces NO team-prefixed line and touches neither interrupt nor drain', () => {
    const { guard, logs, channel } = makeGuard({ members: [] })
    const outcome = guard.stop(LEAD)
    expect(logs.filter((line) => line.startsWith(TEAM_MARKER_PREFIX))).toHaveLength(0)
    expect(channel.interrupts).toHaveLength(0)
    expect(channel.drains).toHaveLength(0)
    // 诚实由 verdict 自证：查询面在场、无事可做。
    expect(outcome.team?.teamServicePresent).toBe(true)
    expect(outcome.team?.interruptedMemberSessionIds).toEqual([])
    expect(outcome.team?.drainInitiated).toBe(false)
  })

  it('the unwired seam (a pre-T9 caller) stays silent too — one stop, one log line', () => {
    const { guard, logs, channel } = makeGuard({ queryService: 'unwired' })
    guard.stop(LEAD)
    // 构造期事实不占运行时日志：既有的"一次 stop 一行日志"契约逐字不变。
    expect(logs).toHaveLength(1)
    expect(logs[0]!.startsWith(JOBS_LINE_PREFIX)).toBe(true)
    expect(channel.interrupts).toHaveLength(0)
  })

  it('service absent at lookup time = the degraded NOTE, greppable and distinct from the jobs degraded clause', () => {
    const { guard, logs, channel } = makeGuard({ queryService: 'absent', members })
    const outcome = guard.stop(LEAD)
    expect(outcome.team?.teamServicePresent).toBe(false)
    expect(outcome.team?.note).toBe('team query service absent')
    const noteLines = logs.filter((line) => line.startsWith(TEAM_NOTE_PREFIX))
    expect(noteLines).toHaveLength(1)
    expect(noteLines[0]).toContain('team query service absent')
    // 与 jobs 的降级从句词汇级区分：jobs 行说的是 'jobs service absent'。
    expect(noteLines[0]).not.toContain('jobs service')
    expect(channel.interrupts).toHaveLength(0)
    expect(channel.drains).toHaveLength(0)
  })

  it('a live roster without a live lead agent degrades loudly and does NOT fire', () => {
    const { guard, logs, channel } = makeGuard({ members, leadPresent: false })
    const outcome = guard.stop(LEAD)
    const noteLines = logs.filter((line) => line.startsWith(TEAM_NOTE_PREFIX))
    expect(noteLines).toHaveLength(1)
    expect(noteLines[0]).toContain('live lead agent')
    expect(noteLines[0]).toContain('NOT interrupted')
    expect(outcome.team?.note).toContain('live lead agent absent')
    expect(channel.interrupts).toHaveLength(0)
    expect(channel.drains).toHaveLength(0)
  })

  // ── 评审 MINOR 补测：三处防御分支 + readSubagents 抛的新 catch，逐扇进门 ──

  it('query wired with members but the subagents/agents SEAM unwired = NOTE + zero fire (guard cascadeTeamMembers step ④ seam-absent branch)', () => {
    const { guard, logs, channel } = makeGuard({ members, subagentsSurface: 'unwired' })
    const outcome = guard.stop(LEAD)
    // 运行时 NOTE（区别于 seam-缺席的静默①：查询面在、成员在，通道半缺席）。
    const noteLines = logs.filter((line) => line.startsWith(TEAM_NOTE_PREFIX))
    expect(noteLines).toHaveLength(1)
    expect(noteLines[0]).toContain('subagents/agents seam not wired')
    expect(noteLines[0]).toContain(`${members.length} member(s) NOT interrupted`)
    expect(outcome.team?.teamServicePresent).toBe(true)
    expect(outcome.team?.teamRunId).toBe('run-1')
    expect(outcome.team?.interruptedMemberSessionIds).toEqual([])
    expect(outcome.team?.drainInitiated).toBe(false)
    expect(outcome.team?.note).toBe('subagents/agents seam not wired')
    expect(channel.interrupts).toHaveLength(0)
    expect(channel.drains).toHaveLength(0)
  })

  it('subagents seam wired but resolves undefined = NOTE + zero fire (guard cascadeTeamMembers `subagents === undefined` NOTE branch)', () => {
    const { guard, logs, channel } = makeGuard({ members, subagentsSurface: 'absent' })
    const outcome = guard.stop(LEAD)
    const noteLines = logs.filter((line) => line.startsWith(TEAM_NOTE_PREFIX))
    expect(noteLines).toHaveLength(1)
    expect(noteLines[0]).toContain('subagents service absent')
    expect(outcome.team?.note).toBe('subagents service absent')
    expect(outcome.team?.drainInitiated).toBe(false)
    expect(channel.interrupts).toHaveLength(0)
    expect(channel.drains).toHaveLength(0)
  })

  it('readSubagents THROWING degrades to the same family NOTE, never throws out of stop() (guard cascadeTeamMembers `deps.readSubagents()` try/catch, MINOR-4)', () => {
    const { guard, logs, channel } = makeGuard({ members, subagentsSurface: 'throws' })
    let outcome: StopContinuationOutcome | undefined
    expect(() => {
      outcome = guard.stop(LEAD)
    }).not.toThrow()
    const noteLines = logs.filter((line) => line.startsWith(TEAM_NOTE_PREFIX))
    expect(noteLines).toHaveLength(1)
    // 具名降级：'subagents lookup failed' 与缺席支的 'service absent' 词汇
    // 级可区分（抛与缺席各有各的 NOTE）。
    expect(noteLines[0]).toContain('subagents lookup failed')
    expect(noteLines[0]).toContain('subagents registry exploded')
    expect(outcome!.team?.teamServicePresent).toBe(true)
    expect(outcome!.team?.interruptedMemberSessionIds).toEqual([])
    expect(outcome!.team?.drainInitiated).toBe(false)
    expect(outcome!.team?.note).toContain('subagents lookup failed')
    expect(channel.interrupts).toHaveLength(0)
    expect(channel.drains).toHaveLength(0)
  })

  it('drainContinuableChildren throwing SYNCHRONOUSLY = NOTE + teamDrain resolves false, stop never throws (guard cascadeTeamMembers step ⑥ sync-throw catch)', async () => {
    const { guard, logs, channel } = makeGuard({ members, drainThrowsSync: true })
    let outcome: StopContinuationOutcome | undefined
    expect(() => {
      outcome = guard.stop(LEAD)
    }).not.toThrow()
    // interrupt 照常开火（坏的是 drain 面，不是 interrupt 面）。
    expect(channel.interrupts).toHaveLength(2)
    expect(channel.drains).toHaveLength(0)
    const noteLines = logs.filter((line) => line.startsWith(TEAM_NOTE_PREFIX))
    expect(noteLines).toHaveLength(1)
    expect(noteLines[0]).toContain('drain could not even be initiated')
    expect(noteLines[0]).toContain('2 interrupted member(s) stay resident')
    expect(outcome!.team?.drainInitiated).toBe(false)
    // 异步出口仍然可 join 且落 false——never-reject 契约对同步抛同样成立。
    await expect(outcome!.team?.teamDrain).resolves.toBe(false)
  })
})

// ── ③ 跨包服务名交叉等值（R-5 同族）+ 查询面在真 store 上的读语义 ──────────

describe('P5-T9 cross-package pin — the two spellings of the service name are ONE name', () => {
  it('omo-hooks consumer constant === omo-team provider constant', () => {
    expect(OMO_TEAM_MEMBER_QUERY_SERVICE).toBe(PROVIDER_SIDE_SERVICE_NAME)
    expect(OMO_TEAM_MEMBER_QUERY_SERVICE).toBe('omoTeamMemberQuery')
  })
})

describe('P5-T9 the read-only query surface over the real state skeleton', () => {
  it('an ACTIVE run answers its addressable members; a non-lead session answers empty', async () => {
    const store: TeamStateStore = makeStore()
    const state = await store.create({
      teamName: 'query-team',
      leadSessionId: LEAD,
      members: [
        { name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst' },
        { name: 'builder', seat: 'hephaestus', childId: 'child-builder' },
      ],
    })
    await store.transition(state.teamRunId, 'active')
    const query = createTeamMemberQueryService({ store })
    expect(query.liveMembersOfLead(LEAD).map((row) => row.sessionId)).toEqual(['child-analyst', 'child-builder'])
    expect(query.liveMembersOfLead(LEAD).map((row) => row.memberName)).toEqual(['analyst', 'builder'])
    // 非 lead 会话查无此队——空集，不抛。
    expect(query.liveMembersOfLead('some-other-session')).toEqual([])
  })

  it('teardown retires the lead index: the query goes EMPTY while the tombstone stays readable by run id (the T7 asymmetry)', async () => {
    const store: TeamStateStore = makeStore()
    const state = await store.create({
      teamName: 'retire-team',
      leadSessionId: LEAD,
      members: [{ name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst' }],
    })
    await store.transition(state.teamRunId, 'active')
    const query = createTeamMemberQueryService({ store })
    expect(query.liveMembersOfLead(LEAD)).toHaveLength(1)
    // 拆除的账面：deleted + retireRunIndexes（team_delete 执行链的 ⑤⑥ 步）。
    await store.transition(state.teamRunId, 'deleting')
    await store.transition(state.teamRunId, 'deleted')
    store.retireRunIndexes(state.teamRunId)
    // guard 的视角：查无成员（对退场的树不开火）。
    expect(query.liveMembersOfLead(LEAD)).toEqual([])
    // 不对称的另一面：lead 经 tombstone 仍读得到事实行（team_status 的查询面）。
    const tombstone = store.get(state.teamRunId)
    expect(tombstone?.status).toBe('deleted')
    // 成员的参与账同步撤清。
    expect(store.participationOfMember('child-analyst')).toBeUndefined()
  })

  it('a run in a terminal-but-not-deleted state answers empty (failed/orphaned are not continuation-stop objects)', async () => {
    const store: TeamStateStore = makeStore()
    const state = await store.create({
      teamName: 'failed-team',
      leadSessionId: LEAD,
      members: [{ name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst' }],
    })
    await store.transition(state.teamRunId, 'failed')
    const query = createTeamMemberQueryService({ store })
    expect(query.liveMembersOfLead(LEAD)).toEqual([])
  })

  it('creating stays in the set — a team stopped mid-spawn still reaches its resident members', async () => {
    const store: TeamStateStore = makeStore()
    const state = await store.create({
      teamName: 'spawning-team',
      leadSessionId: LEAD,
      members: [{ name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst' }],
    })
    // status stays 'creating' — no transition.
    const query = createTeamMemberQueryService({ store })
    expect(query.liveMembersOfLead(state.leadSessionId ?? '').map((row) => row.sessionId)).toEqual(['child-analyst'])
  })
})
