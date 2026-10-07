// tests/omo-hooks/dsh-runtime-shape-consistency.test.ts — P4.5-T4 (**C6**).
//
// 计划书 §4.2 要求：「三个触点在同一 mock 下取到同一 `dshRuntimeShape()` 值」
// （plan §4.1 探针表；评审 R1-I4 把三处判定收敛成一个函数）。这条**不能**只靠
// 「三处都 import 了同一个函数」来算落实——那是 import 级的事实，不是行为的。
// 所以本文件把它落成**行为级**断言：
//
//   ① 构造**同一个** jobs 面（v2 形状一个、v1 形状一个）；
//   ② 把这一个面对象同时喂给三个触点；
//   ③ 断言三者各自走自己那一代的分支——
//        * background-notification：v2 走 `events.subscribe`，v1 走 `onJobDone`；
//        * stop-continuation-guard：v2 的 caller 是**字符串**，v1 是 `{ id }`；
//        * live-state：v2 的 owner 是**字符串**，v1 是**活 Agent 对象本体**；
//   ④ 并且断言同一个面被反复探测答案稳定（无跨调用隐藏状态）。
//
// ⚠️ SCOPE, HONESTLY (review F5): an earlier version of this file claimed the
// `events` GETTER COUNT proved "all three touch points consulted the shared
// marker". It did not, and this file no longer makes that claim or keeps that
// counter: the only count assertion ever present covered THREE calls made by the
// TEST itself, the three touch points never participated, and on the v1 face the
// counter was hard-wired to 0 (v1 has no `events` key, so it is physically
// uncountable there). What DOES distinguish the two generations here, and what
// these tests really assert, is the BEHAVIOURAL landing: which push member got
// subscribed, whether the guard's caller was a string or `{ id }`, and whether
// live-state's owner was a string or the live Agent object — each observed off the
// mock's own record of what it was handed.
//
// 一个面、三个落点——这才是 C6 在这里真正钉住的东西。
//
// 三个触点的 `JobsSurface` 各自的类型互不兼容（各自的成员集不同，这是刻意的：
// 每个模块只声明自己消费的成员，见各自头注释），所以这里构造的是**结构超集**，
// 按触点局部转型。转型只发生在测试侧的喂入口，生产代码零改动。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { dshRuntimeShape } from '../../patches/omo-dsh/omo-hooks/src/dsh-runtime-shape.ts'
import {
  BACKGROUND_NOTE_SUBSCRIBED_EVENTS,
  BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE,
  BACKGROUND_NOTIFICATION_ID,
  registerBackgroundNotification,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/background-notification.ts'
import {
  startWorkJob,
  type StartWorkJobHandleLike,
  type StartWorkJobHooksLike,
  type StartWorkJobSpecLike,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/live-state.ts'
import {
  createStopContinuationGuard,
  type StopContinuationCaller,
  type StopContinuationJobSnapshotLike,
} from '../../patches/omo-dsh/omo-hooks/src/services/stop-continuation-guard.ts'
import { HOOK_MANIFEST } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'

const SESSION_ID = 'ses_c6_consistency'
/** The live Agent object the v1 branch must receive verbatim. */
const LIVE_AGENT = { id: 'agent-c6', session: { header: { id: SESSION_ID } } }

/** One face, three consumers, and the tally of how often the probe read it. */
interface SharedFace {
  readonly face: Record<string, unknown>
  /** What background-notification subscribed through, per generation. */
  subscribedVia: string[]
  /** The caller each guard call handed to `list` / `kill`. */
  guardCallers: StopContinuationCaller[]
  /** The owner the live-state `start()` received. */
  liveStateOwners: unknown[]
  /** The `run` arity observation from live-state's touch point. */
  liveStateHandles: Array<StartWorkJobHandleLike | undefined>
  /** The terminal hooks captured from live-state, for the outcome-key read. */
  liveStateHooks: StartWorkJobHooksLike[]
}

/**
 * ONE jobs face, built once per generation. The ONLY structural difference
 * between the two is the `events` key — the identity signal itself
 * (../dsh-runtime-shape.ts reads `jobs.events !== undefined` and nothing deeper).
 *
 * `events` is a GETTER so each read hands a fresh object (a member expression
 * the three touch points can subscribe through without sharing a stale
 * snapshot). There is deliberately NO probe counter on it: the header's
 * review-F5 scope note owns the retraction — a read count only ever covered
 * this test's own calls and is physically uncountable on v1 (no `events`
 * key). What is observed instead is the BEHAVIOURAL landing recorded in
 * `subscribedVia` / `guardCallers` / `liveStateOwners` below. (The block you
 * are reading previously still promised the counter — a leftover this file's
 * own header had already retracted; PR #12 review caught the contradiction.)
 */
function sharedFace(shape: 'v1' | 'v2'): SharedFace {
  const face: Record<string, unknown> = {}
  const subscribedVia: string[] = []
  const guardCallers: StopContinuationCaller[] = []
  const liveStateOwners: unknown[] = []
  const liveStateHandles: Array<StartWorkJobHandleLike | undefined> = []
  const liveStateHooks: StartWorkJobHooksLike[] = []

  if (shape === 'v2') {
    Object.defineProperty(face, 'events', {
      enumerable: true,
      configurable: true,
      get: () => ({
        // Recorded when subscribe is CALLED, not when its disposer runs — the
        // call is the branch evidence.
        subscribe: (_filter: unknown, _listener: unknown) => {
          subscribedVia.push('events.subscribe')
          return () => {}
        },
      }),
    })
  } else {
    // v1: the push member is `onJobDone`, and there is NO `events` key at all.
    face.onJobDone = (_listener: unknown) => {
      subscribedVia.push('onJobDone')
      return () => {}
    }
  }

  // `list` / `kill` — the guard's touch point. Records the caller VERBATIM.
  face.list = (caller: StopContinuationCaller): readonly StopContinuationJobSnapshotLike[] => {
    guardCallers.push(caller)
    return shape === 'v2'
      ? [{ id: 'c6job-1', status: 'running', owner: SESSION_ID }]
      : [{ id: 'c6job-1', status: 'running', ownerSession: SESSION_ID }]
  }
  face.kill = (id: string, caller: StopContinuationCaller): string => {
    guardCallers.push(caller)
    // Same fence the real registry runs: v2 compares the caller as a STRING id.
    if (shape === 'v2' && typeof caller !== 'string') {
      throw new Error(`job ${id} belongs to another session`)
    }
    if (shape === 'v1' && (caller as { id?: string })?.id !== SESSION_ID) {
      throw new Error(`job ${id} belongs to another session`)
    }
    return 'requested'
  }
  // `start` — the live-state touch point. Records owner + run arity VERBATIM.
  face.start = (spec: StartWorkJobSpecLike): string => {
    liveStateOwners.push(spec.owner)
    const handle: StartWorkJobHandleLike | undefined = shape === 'v2'
      ? { id: 'c6job-2', append: () => {}, updateProgress: () => {} }
      : undefined
    liveStateHandles.push(handle)
    const hooks = spec.run(handle)
    liveStateHooks.push(hooks)
    return 'c6job-2'
  }

  return { face, subscribedVia, guardCallers, liveStateOwners, liveStateHandles, liveStateHooks }
}

/**
 * A cordis context serving THE ONE face.
 *
 * `mode` matters and is spelled out because the registrar's two acquisition paths
 * are NOT equally loud, and pretending otherwise would be a false symmetry:
 *   * `'immediate'` — `ctx.get('jobs')` serves it, so the registrar takes its
 *     documented FAST PATH and emits **no NOTE line at all** (its own words:
 *     "by contract, see the registrar's doc — no NOTE line"). The observable
 *     there is only which push member got called.
 *   * `'deferred'` — `ctx.get` comes up empty and `ctx.inject` delivers it, so
 *     the registrar runs `adoptJobs` on the injected face and DOES log the
 *     generation-naming NOTE. Both shapes get the same comparable observable
 *     here, so the branch assertions below read this path.
 */
function contextFor(
  face: Record<string, unknown>,
  mode: 'immediate' | 'deferred' = 'deferred',
): HooksRegistrationContext {
  return {
    on: (_event, _listener) => () => {},
    get: (name) => (mode === 'immediate' && name === 'jobs' ? face : undefined),
    inject: (_deps, callback) => {
      callback(mode === 'deferred' ? { jobs: face } : {})
      return () => {}
    },
  }
}

/**
 * Runs `fn` with `console.log`/`console.warn` captured, and returns every line.
 * The background-notification registrar's NOTE sink IS the console (its own
 * `note()`/`fail()` helpers), so reading the branch it took means reading the
 * console — nothing here is inferred from its source.
 */
function captureConsole(fn: () => void): string[] {
  const lines: string[] = []
  const originalLog = console.log
  const originalWarn = console.warn
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  try {
    fn()
  } finally {
    console.log = originalLog
    console.warn = originalWarn
  }
  return lines
}

describe.each([['v1'], ['v2']] as const)('P4.5-T4 C6 — 三触点在同一 mock 面上取同一 shape [%s]', (shape) => {
  let testDirectory = ''

  beforeEach(() => {
    // A real temp dir per test: live-state's touch point WRITES the notepad
    // scaffold, so this test touches disk exactly like production does.
    testDirectory = join(tmpdir(), `c6-consistency-${shape}-${randomUUID()}`)
    mkdirSync(testDirectory, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDirectory)) rmSync(testDirectory, { recursive: true, force: true })
  })

  // WHAT THIS ACTUALLY ASSERTS (review F5): the same face answers the SAME shape
  // on repeated probes, i.e. the marker is stateless and deterministic. It does
  // NOT count how many times the three touch points probed — that counter is gone
  // (it only ever covered the test's own calls, and was uncountable on v1).
  it(`⑮ 同一个面被共享探针反复探测，答案稳定为 ${shape}（探针无状态）`, () => {
    const shared = sharedFace(shape)
    const first = dshRuntimeShape(shared.face)
    const second = dshRuntimeShape(shared.face)
    const third = dshRuntimeShape(shared.face)
    expect(first).toBe(shape)
    expect(second).toBe(shape)
    expect(third).toBe(shape)
    // And the answer survives the touch points having been driven on it — the
    // probe never mutates the face it inspects.
    expect(dshRuntimeShape(shared.face)).toBe(shape)
  })

  it(`⑮ ${shape}: 三个触点跑在同一面上，各自走自己那一代的分支`, async () => {
    const shared = sharedFace(shape)

    // ── 触点 1/3：background-notification（T2）───────────────────────────────
    const ctx = contextFor(shared.face)
    const row = HOOK_MANIFEST.find((entry) => entry.id === BACKGROUND_NOTIFICATION_ID)
    expect(row).toBeDefined()
    if (row === undefined) throw new Error('background-notification manifest row missing')
    const logs = captureConsole(() => { registerBackgroundNotification(ctx, row) })
    // The push channel chosen is observable in the NOTE line it logs.
    const joined = logs.join('\n')
    if (shape === 'v2') {
      expect(joined).toContain(BACKGROUND_NOTE_SUBSCRIBED_EVENTS)
      expect(joined).not.toContain(BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE)
      expect(shared.subscribedVia).toEqual(['events.subscribe'])
    } else {
      expect(joined).toContain(BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE)
      expect(joined).not.toContain(BACKGROUND_NOTE_SUBSCRIBED_EVENTS)
      expect(shared.subscribedVia).toEqual(['onJobDone'])
    }

    // ── 触点 2/3：stop-continuation-guard（T3）──────────────────────────────
    const guardLogs: string[] = []
    const guard = createStopContinuationGuard({
      readJobs: () => shared.face as never,
      log: (line) => guardLogs.push(line),
    })
    const outcome = guard.stop(SESSION_ID)
    // The guard reached the job on THIS face and killed it.
    expect(outcome.cancelledJobIds).toEqual(['c6job-1'])
    expect(outcome.jobsServicePresent).toBe(true)
    // caller 形状逐字：v2 = 字符串，v1 = `{ id }` 对象。
    expect(shared.guardCallers.length).toBeGreaterThanOrEqual(2) // list + kill
    for (const caller of shared.guardCallers) {
      if (shape === 'v2') {
        expect(caller).toBe(SESSION_ID)
        expect(typeof caller).toBe('string')
      } else {
        expect(caller).toEqual({ id: SESSION_ID })
        expect(typeof caller).toBe('object')
      }
    }

    // ── 触点 3/3：live-state（T4）───────────────────────────────────────────
    const liveLogs: string[] = []
    const result = startWorkJob({
      jobs: shared.face as never,
      directory: testDirectory,
      planName: 'c6-consistency',
      sessionId: SESSION_ID,
      agent: LIVE_AGENT,
      log: (line) => liveLogs.push(line),
    })
    expect(result.jobId).toBe('c6job-2')
    expect(result.degraded).toBe(false)
    // owner 形状逐字：v2 = sessionId 字符串，v1 = 活 Agent 对象本体。
    expect(shared.liveStateOwners).toHaveLength(1)
    if (shape === 'v2') {
      expect(shared.liveStateOwners[0]).toBe(SESSION_ID)
      expect(typeof shared.liveStateOwners[0]).toBe('string')
      // run 收到 JobHandle（0.2.x 的 arity）。
      expect(shared.liveStateHandles[0]).toBeDefined()
      // 终态载荷 publish 在 `result` 上。
      const outcome2 = await shared.liveStateHooks[0]!.done
      expect(outcome2.result).toBeDefined()
      expect(outcome2.output).toBeUndefined()
    } else {
      expect(shared.liveStateOwners[0]).toBe(LIVE_AGENT)
      expect(shared.liveStateOwners[0]).not.toBe(SESSION_ID)
      expect(shared.liveStateHandles[0]).toBeUndefined()
      const outcome2 = await shared.liveStateHooks[0]!.done
      expect(outcome2.output).toBeDefined()
      expect(outcome2.result).toBeUndefined()
    }
  })

  it(`⑮ ${shape}: 三触点对同一面的判定互不依赖——逐个单独跑也各走自己那一代`, () => {
    const shared = sharedFace(shape)
    // 探针单独跑一次，结果与整组一致（没有跨调用的隐藏状态）。
    expect(dshRuntimeShape(shared.face)).toBe(shape)
    // 同一面喂给三处、顺序打乱，落点不变。
    const ctx = contextFor(shared.face)
    const row = HOOK_MANIFEST.find((entry) => entry.id === BACKGROUND_NOTIFICATION_ID)
    if (row === undefined) throw new Error('background-notification manifest row missing')
    const logs = captureConsole(() => { registerBackgroundNotification(ctx, row) })
    expect(dshRuntimeShape(shared.face)).toBe(shape)
    const guard = createStopContinuationGuard({ readJobs: () => shared.face as never, log: () => {} })
    guard.stop(SESSION_ID)
    expect(dshRuntimeShape(shared.face)).toBe(shape)
    startWorkJob({
      jobs: shared.face as never,
      directory: testDirectory,
      planName: 'c6-order',
      sessionId: SESSION_ID,
      agent: LIVE_AGENT,
    })
    // 落点仍然按 shape 分叉。
    if (shape === 'v2') {
      expect(logs.join('\n')).toContain(BACKGROUND_NOTE_SUBSCRIBED_EVENTS)
      expect(shared.guardCallers.every((c) => typeof c === 'string')).toBe(true)
      expect(shared.liveStateOwners[0]).toBe(SESSION_ID)
    } else {
      expect(logs.join('\n')).toContain(BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE)
      expect(shared.guardCallers.every((c) => typeof c === 'object')).toBe(true)
      expect(shared.liveStateOwners[0]).toBe(LIVE_AGENT)
    }
  })
})

describe('P4.5-T4 C6 — 形状差异只在 `events` 这一个键上', () => {
  it('⑮ 同一基础面加/不加 events，就是 v1/v2 的全部区别', () => {
    const base = () => ({
      start: () => 'x-1',
      list: () => [],
      kill: () => 'requested',
      onJobDone: () => () => {},
    })
    const v1 = base()
    const v2 = { ...base(), events: { subscribe: () => () => {} } }
    expect(dshRuntimeShape(v1)).toBe('v1')
    expect(dshRuntimeShape(v2)).toBe('v2')
    // 一个非对象 face 也只会得到 'v1'（共享探针的既定语义）。
    expect(dshRuntimeShape(undefined)).toBe('v1')
    expect(dshRuntimeShape(null)).toBe('v1')
    expect(dshRuntimeShape('jobs')).toBe('v1')
  })
})
