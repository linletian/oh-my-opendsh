// P4-T8 — 单测：stop-continuation guard 服务本体 + 跨插件可见性（R-5）。
//
// 本文件的上游种子：v4.19.4 `packages/omo-opencode/src/hooks/
// stop-continuation-guard/index.test.ts` 的 12 个 its，逐条映射到本移植的
// DSH 形态（`bun:test` → vitest、`PluginInput.directory` marker 文件 → 无 marker、
// `BackgroundManager` → `ctx.jobs`）。映射写在每个 describe 的注释里，便于回溯
// 「哪一条上游用例变成了哪一条本仓用例」。
//
// 12 条的落点（NIT-8：逐条点名，不留"归并"黑洞）：
//   ① 标停止            → 第一个 describe 的 ①
//   ② 未停止会话         → 第一个 describe 的 ②
//   ③ clear 复位        → 第一个 describe 的 ③
//   ④ 多会话独立         → 第一个 describe 的 ④
//   ⑤ session.deleted 清状态 → 第二个 describe 的 ⑤（DSH 事件名改为 session/disposed）
//   ⑥ 删一个不动其他      → 第二个 describe 的 ⑥
//   ⑦ 新用户消息**不**清除 → 第三个 describe 的 ⑦。DSH 没有这条钩子，所以断言换成
//                            同一性质的可观察等价物：反复查询状态不改变状态（见用例注释）
//   ⑧ 只由显式 clear 恢复 → 第三个 describe 的 ⑧
//   ⑨ 未停止会话不被误清   → 第三个 describe 的 ⑨
//   ⑩ 标记为 stopped     → 第三个 describe 的 ⑩（日志与返回值上的可观察性）
//   ⑪ 多会话连续 stop/clear 不互相污染 → **归并**进 ④ 与「stop 幂等 + clear 幂等」
//       那一条：上游该用例断言的是 marker 文件里多个 session 键并存，本仓无 marker
//       面，合并后的断言覆盖同一事实（幂等 + 会话独立）
//   ⑫ 只取消 running|pending → 第四个 describe 的 ⑫（DSH 词表 running|stopping，
//                             差异已登记）
//
// R-5 覆盖：最后两个 describe 用一个**同时装载两侧**的假宿主演示
// `omo-hooks` provide → `omo-commands` get 的真实链路，包括"消费方晚于提供方挂载"
// 与"提供方缺席"两种顺序。
//
// P4.5-T3 — 双形状参数化：本文件的级联场景从 T3 起在 **v1 面**（0.1.5：caller
// `{ id }`、快照 `ownerSession`、face 带 `onJobDone`、无 `events`）与 **v2 面**
// （0.2.x：caller 为 `sessionId` 字符串、快照 `owner`、face 带 `events`）各跑
// 一遍（`describe.each(['v1','v2'])`）。分叉信号是共享的 `dshRuntimeShape`
// （patches/…/src/dsh-runtime-shape.ts，身份标记非能力探针）。既有 v1 用例**一条
// 未删、语义未改**——fakeJobs 的 v1 围栏原样保留，只是 caller 取值改经
// `callerSessionOf(caller, 'v1')`：它对错误形状当场抛，所以「caller 形状写反」
// 在本文件里不可能静默通过（这是 §5.2 的承重断言，不是装饰）。

import { describe, expect, it, vi } from 'vitest'

import {
  STOP_CONTINUATION_GUARD_DISPOSED_EVENT,
  STOP_CONTINUATION_GUARD_ID,
  STOP_CONTINUATION_SERVICE,
  CANCELLABLE_JOB_STATUSES,
  STOP_CANCELLATION_REASON,
  createStopContinuationGuard,
  handleSessionDisposed,
  type StopContinuationCaller,
  type StopContinuationGuard,
  type StopContinuationJobsLike,
  type StopContinuationJobSnapshotLike,
} from '../../patches/omo-dsh/omo-hooks/src/services/stop-continuation-guard.ts'
import { dshRuntimeShape } from '../../patches/omo-dsh/omo-hooks/src/dsh-runtime-shape.ts'
import {
  STOP_CONTINUATION_SERVICE as COMMANDS_SIDE_SERVICE_NAME,
  createStopContinuationCommand,
  formatStopContinuationResult,
  renderStopContinuationInstruction,
} from '../../patches/omo-dsh/omo-commands/src/commands/stop-continuation.ts'
import { apply as applyHooks } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import { runCommandRegistrations, COMMAND_REGISTRARS } from '../../patches/omo-dsh/omo-commands/src/index.ts'
import { COMMAND_MANIFEST } from '../../patches/omo-dsh/omo-commands/src/manifest.ts'
import type { CommandAgentLike, CommandResultLike } from '../../patches/omo-dsh/omo-commands/src/commands/command-types.ts'

/** 上游 `createBackgroundTask(status, id)` 的等价最小件。 */
function job(id: string, status: string): { readonly id: string; readonly status: string } {
  return { id, status }
}

/** P4.5-T3: the two jobs-face generations this file now runs every cascade scenario on. */
type Shape = 'v1' | 'v2'

/** A fake job row: BOTH generations' owner keys, both optional (mirrors the guard's structural type). */
type FakeJob = {
  readonly id: string
  readonly status: string
  /** **[0.1.5]** fence key of `JobSnapshot`. */
  readonly ownerSession?: string
  /** **[0.2.x]** fence key of `JobView` (view.ts:76-77). */
  readonly owner?: string
}

/**
 * P4.5-T3 承重件：按世代从 caller 里取会话身份，**遇到另一代的形状就当场抛**。
 * v1 caller = `{ id }`（Agent-like）；v2 caller = `sessionId` 字符串（SessionId 的
 * 结构等价）。假围栏用它取 caller ⇒ caller 形状写反不可能静默通过：kill 会抛，
 * 被计入 `alreadyFinishedJobIds`，canary 断言当场红（任务书 §5.2）。
 */
function callerSessionOf(caller: StopContinuationCaller, shape: Shape): string {
  if (shape === 'v2') {
    if (typeof caller !== 'string') {
      throw new TypeError(`v2 caller must be the SessionId string, got ${JSON.stringify(caller)}`)
    }
    return caller
  }
  if (typeof caller !== 'object' || caller === null || typeof (caller as { id?: unknown }).id !== 'string') {
    throw new TypeError(`v1 caller must be the { id } Agent-like object, got ${JSON.stringify(caller)}`)
  }
  return (caller as { id: string }).id
}

/**
 * 上游 `createMockBackgroundManager` 的 DSH 形态，但**按实测的围栏建模**（不是随手
 * 的"返回全部"）：`list(caller)` 只回「caller 自己的 + 无主的」
 * （**[0.1.5]** dsh-jobs-local/lib/index.js:178-180 — P3-T8-era 读数，H2 本轮未复核），
 * `kill` 对有主 job 做同样的 assertAccess 并在不符时抛（:313-315；**[0.2.x]**
 * `expect(id, caller)` → `assertAccess`，jobs-local/src/index.ts:328-330/:394-411，
 * 已在镜像复核）。建模这一层是 MAJOR-1 的关键：先前那个"永远返回全部、
 * kill 永不抛"的假实现正好把真机上的空转藏了起来。
 *
 * P4.5-T3：加 `shape` 形参，默认 `'v1'` —— **既有 v1 调用点的围栏语义逐字不变**
 * （同一个键 `ownerSession`、同一个过滤、同一句抛错）。v2 面换成 `owner` 键 +
 * 字符串 caller（caller 形状经 `callerSessionOf` 硬校验）。face 同时带上各自世代
 * 的 push 面成员（v1 `onJobDone` / v2 `events`）作**忠实建模**：guard 不消费它们，
 * `dshRuntimeShape` 只看 `events` 的有无——face 谎报形状会被
 * 「形状自证」用例当场抓出。
 */
function fakeJobs(
  tasks: readonly FakeJob[],
  shape: Shape = 'v1',
): {
  jobs: StopContinuationJobsLike
  kills: { id: string; caller: unknown; reason: string | undefined }[]
  pushFaceCalls: unknown[][]
} {
  const kills: { id: string; caller: unknown; reason: string | undefined }[] = []
  const pushFaceCalls: unknown[][] = []
  const fenceOf = (task: FakeJob): string | undefined => (shape === 'v2' ? task.owner : task.ownerSession)
  const jobs = {
    ...(shape === 'v2'
      ? {
          events: {
            subscribe: (filter: unknown, listener: unknown) => {
              pushFaceCalls.push([filter, listener])
              return () => undefined
            },
          },
        }
      : {
          onJobDone: (listener: unknown) => {
            pushFaceCalls.push([listener])
            return () => undefined
          },
        }),
    list: (caller: StopContinuationCaller): readonly StopContinuationJobSnapshotLike[] => {
      const callerSession = callerSessionOf(caller, shape)
      return tasks.filter((task) => fenceOf(task) === undefined || fenceOf(task) === callerSession)
    },
    kill: (id: string, caller: StopContinuationCaller, reason?: string): string => {
      const callerSession = callerSessionOf(caller, shape)
      const target = tasks.find((task) => task.id === id)
      if (target === undefined) throw new Error(`unknown job ${id}`)
      const owner = fenceOf(target)
      if (owner !== undefined && owner !== callerSession) {
        throw new Error(`job ${id} belongs to another session`)
      }
      kills.push({ id, caller, reason })
      return 'requested'
    },
  }
  return { jobs, kills, pushFaceCalls }
}

/** 一个不会真的 followup 的 agent：本命令不注入任何消息（见 handler 文件头）。 */
function silentAgent(id: string): CommandAgentLike {
  return { id, followup: () => undefined }
}

function makeGuard(jobs?: StopContinuationJobsLike): {
  guard: StopContinuationGuard
  logs: string[]
} {
  const logs: string[] = []
  return {
    logs,
    guard: createStopContinuationGuard({
      readJobs: () => jobs,
      log: (line) => {
        logs.push(line)
      },
    }),
  }
}

describe('P4-T8 guard — upstream index.test.ts ①–④ (stop / isStopped / clear / independence)', () => {
  it('① marks the session stopped (upstream "should mark session as stopped")', () => {
    // 上游还断言了 marker 文件的 sources.stop.state === 'stopped'；DSH 无 marker
    // 面（见模块头 §3），故本仓断言换成「状态在 stop() 的返回值里如实可见」。
    const { guard } = makeGuard()
    const outcome = guard.stop('test-session-1')
    expect(guard.isStopped('test-session-1')).toBe(true)
    expect(outcome.sessionId).toBe('test-session-1')
    expect(outcome.jobsServicePresent).toBe(false)
    expect(outcome.cancelledJobIds).toEqual([])
  })

  it('② returns false for a session that was never stopped (upstream "non-stopped sessions")', () => {
    const { guard } = makeGuard()
    expect(guard.isStopped('non-existent-session')).toBe(false)
  })

  it('③ clear resets the session (upstream "should clear stopped state")', () => {
    const { guard } = makeGuard()
    guard.stop('test-session-2')
    guard.clear('test-session-2')
    expect(guard.isStopped('test-session-2')).toBe(false)
  })

  it('④ handles multiple sessions independently (upstream same)', () => {
    const { guard } = makeGuard()
    guard.stop('session-1')
    guard.stop('session-2')
    expect(guard.isStopped('session-1')).toBe(true)
    expect(guard.isStopped('session-2')).toBe(true)
    expect(guard.isStopped('session-3')).toBe(false)
  })

  it('stop is idempotent and clear is safe on an unknown session', () => {
    const { guard } = makeGuard()
    guard.stop('s')
    guard.stop('s')
    expect(guard.isStopped('s')).toBe(true)
    guard.clear('never-stopped')
    guard.clear('s')
    guard.clear('s')
    expect(guard.isStopped('s')).toBe(false)
  })
})

describe('P4-T8 the disposed-session cleanup — upstream ⑤–⑥ (session.deleted → session/disposed)', () => {
  it('⑤ clears the stop state when the session is disposed (upstream "session.deleted event")', () => {
    const { guard, logs } = makeGuard()
    guard.stop('test-session-3')
    handleSessionDisposed(guard, { id: 'test-session-3' }, (line) => logs.push(line))
    expect(guard.isStopped('test-session-3')).toBe(false)
    expect(logs.some((line) => line.includes('session disposed'))).toBe(true)
  })

  it('⑥ disposing one session leaves the others stopped (upstream same)', () => {
    const { guard } = makeGuard()
    guard.stop('session-keep')
    guard.stop('session-delete')
    handleSessionDisposed(guard, { id: 'session-delete' }, () => {})
    expect(guard.isStopped('session-keep')).toBe(true)
    expect(guard.isStopped('session-delete')).toBe(false)
  })

  it('a payload without a usable id is ignored — the clear must not fall back to "everything"', () => {
    // 没有 id 就什么都不做。退化成「清掉全部停止标记」会静默解除别的会话的暂停。
    const { guard } = makeGuard()
    guard.stop('keep-me')
    handleSessionDisposed(guard, {}, () => {})
    handleSessionDisposed(guard, undefined, () => {})
    handleSessionDisposed(guard, { id: 42 }, () => {})
    expect(guard.isStopped('keep-me')).toBe(true)
  })

  it('names the DSH event the listener must subscribe to', () => {
    // 上游是 session.deleted；DSH 的对应面是 session/disposed（directory-readme-injector
    // 已用同一映射）。断言的是这个字符串本身，避免有人改回上游名字。
    expect(STOP_CONTINUATION_GUARD_DISPOSED_EVENT).toBe('session/disposed')
  })
})

describe('P4-T8 stop persists across anything the caller does — upstream ⑦–⑫ (chat.message no-op / explicit clear)', () => {
  // DSH 侧没有 chat.message 钩子，所以「不发新消息也会保持停止」不是靠 no-op 实现
  // 的，而是**结构上**没有这条路径。逐条把上游用例翻译成可断言的事实：
  it('⑦ repeated no-op interactions never clear the stop (upstream "NOT clear on new user message")', () => {
    const { guard } = makeGuard()
    guard.stop('test-session-4')
    // 上游在这里 await guard["chat.message"]({sessionID}) 三次；本仓没有该面，
    // 于是断言「反复查询状态不改变状态」——这正是 no-op 的可观察等价物。
    for (let round = 0; round < 3; round += 1) {
      expect(guard.isStopped('test-session-4')).toBe(true)
    }
  })

  it('⑧ only an explicit clear re-enables continuation (upstream same)', () => {
    const { guard } = makeGuard()
    guard.stop('test-session-explicit-clear')
    expect(guard.isStopped('test-session-explicit-clear')).toBe(true)
    guard.clear('test-session-explicit-clear')
    expect(guard.isStopped('test-session-explicit-clear')).toBe(false)
  })

  it('⑨ a session that was never stopped stays not-stopped through the same interactions', () => {
    const { guard } = makeGuard()
    guard.stop('some-other-session')
    expect(guard.isStopped('test-session-5')).toBe(false)
  })

  it('⑩ stop() logs one greppable line naming the guard id and the session', () => {
    const { guard, logs } = makeGuard()
    guard.stop('log-session')
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain(`[omo-hooks] ${STOP_CONTINUATION_GUARD_ID}`)
    expect(logs[0]).toContain('log-session')
    guard.clear('log-session')
    expect(logs).toHaveLength(2)
    expect(logs[1]).toContain('cleared for session log-session')
  })
})

describe('P4-T8 the background cascade — upstream ⑫ (cancel only running|pending)', () => {
  it('⑫ cancels running and stopping jobs, and leaves finished ones alone (upstream "cancel only running and pending")', () => {
    // 状态词表的差异已登记：DSH 无 'pending'，其第二个活状态是 'stopping'。
    // 每个 job 都带 ownerSession —— 真实生产者一律带 owner，而**无主**的 job 只能
    // 测"没有被误杀"这条反向断言（见 ⑬）。
    const owner = 'test-session-bg'
    const { jobs, kills } = fakeJobs([
      { ...job('task-running', 'running'), ownerSession: owner },
      { ...job('task-stopping', 'stopping'), ownerSession: owner },
      { ...job('task-completed', 'completed'), ownerSession: owner },
      { ...job('task-killed', 'killed'), ownerSession: owner },
      { ...job('task-failed', 'failed'), ownerSession: owner },
    ])
    const { guard } = makeGuard(jobs)
    const outcome = guard.stop(owner)
    expect(outcome.jobsServicePresent).toBe(true)
    expect(kills.map((call) => call.id)).toEqual(['task-running', 'task-stopping'])
    expect(outcome.cancelledJobIds).toEqual(['task-running', 'task-stopping'])
    expect(outcome.alreadyFinishedJobIds).toEqual([])
    // 上游 cancelTask 带 {source, reason, abortSession, skipNotification}；DSH kill 只有
    // (id, caller?, reason?)，所以断言的是「reason 到位 + caller 是本会话」。
    expect(kills.every((call) => call.reason === STOP_CANCELLATION_REASON)).toBe(true)
    expect(kills.every((call) => call.caller !== undefined)).toBe(true)
    expect(CANCELLABLE_JOB_STATUSES).toEqual(['running', 'stopping'])
  })

  it('⑬ an OWNED job is really cancelled — the caller fence, proven against the measured behaviour', () => {
    // MAJOR-1 的回归护栏。上一版把 caller 留空，于是：`list` 只回无主 job（有主的
    // 真机 job 一个都不在结果里）→ 级联静默空转 → 命令却报告"取消 0 个"。
    // 这里用**会照围栏过滤、会照 assertAccess 抛错**的 fake，所以"没传 caller"的
    // 实现必然失败，而传了才过。
    const owned = { ...job('bash-4711', 'running'), ownerSession: 'owning-session' }
    const { jobs, kills } = fakeJobs([owned])
    const outcome = makeGuard(jobs).guard.stop('owning-session')
    expect(outcome.cancelledJobIds).toEqual(['bash-4711'])
    // caller 与 list 同源，且带 reason（真机 kill 需要它转发给 producer）
    expect(kills).toHaveLength(1)
    expect(kills[0].caller).toEqual({ id: 'owning-session' })
    expect(kills[0].reason).toBe(STOP_CANCELLATION_REASON)
  })

  it('⑬b a session never cancels another session\'s jobs — the per-session fence (upstream getAllDescendantTasks)', () => {
    // 同一次 list 会同时看到本会话的、有主但属于别处的、以及无主的；只有第一个该被取消。
    const { jobs, kills } = fakeJobs([
      { ...job('mine', 'running'), ownerSession: 'my-session' },
      { ...job('theirs', 'running'), ownerSession: 'their-session' },
      job('unowned', 'running'),
    ])
    const outcome = makeGuard(jobs).guard.stop('my-session')
    expect(outcome.cancelledJobIds).toEqual(['mine'])
    expect(kills.map((call) => call.id)).toEqual(['mine'])
  })

  it('⑬c a REPEATED stop re-requests a still-`stopping` job and re-counts it as cancelled', () => {
    // T14 的注释修正的回归护栏。guard.ts 曾写 "Killing a stopping job is harmless
    // ('already-finished')" —— 与实测相反：`isTerminal` 只含
    // completed|killed|failed（dsh-jobs-local:79-81），`stopping` 不在其中，所以
    // `kill` 再次 `cancel` 并**再次**返回 `'requested'`（:197-208）。
    //
    // 这个 fake 刻意**不复用** fakeJobs —— 那个把 kill 的返回值写死成 'requested'，
    // 拿它断言 verdict 等于断言"我写死的值等于我写死的值"。这里按实测建模终态判据，
    // 并同时放一个真终态 job 作对照，这样 'requested' 的断言才有内容。
    const owner = 'session-repeat-stop'
    const kills: { id: string; verdict: string }[] = []
    const TERMINAL = ['completed', 'killed', 'failed']
    const tasks = [
      { id: 'winding-down', status: 'stopping', ownerSession: owner },
      { id: 'already-done', status: 'completed', ownerSession: owner },
    ]
    const jobs: StopContinuationJobsLike = {
      // P4.5-T3 类型适配（语义不变）：caller 改经 v1 形状硬校验取值。
      list: (caller) => tasks.filter((task) => task.ownerSession === callerSessionOf(caller, 'v1')),
      kill: (id) => {
        const target = tasks.find((task) => task.id === id)
        if (target === undefined) throw new Error(`unknown job ${id}`)
        const verdict = TERMINAL.includes(target.status) ? 'already-finished' : 'requested'
        kills.push({ id, verdict })
        // 真机把 status 重设为 'stopping'（同值），所以第二次 stop 看到的仍是
        // 'stopping' —— 静态列表天然复现这一点，不需要可变 fake。
        return verdict
      },
    }
    const { guard } = makeGuard(jobs)

    const first = guard.stop(owner)
    // 第一次：winding-down 被请求取消。`already-done` 连 kill 都不会被调用 ——
    // 级联在调用 kill **之前**按 CANCELLABLE_JOB_STATUSES 过滤（running|stopping），
    // 所以终态 job 不出现在两个计数里的任何一个。`alreadyFinishedJobIds` 只会收
    // 到"过滤时看着可取消、kill 时已成终态"的竞态 job。
    expect(first.cancelledJobIds).toEqual(['winding-down'])
    expect(first.alreadyFinishedJobIds).toEqual([])
    expect(kills.map((call) => call.id)).toEqual(['winding-down'])

    // 第二次 stop：job 仍在 stopping → kill 再次返回 'requested'，且被**再次**计入
    // 当次的 cancelledJobIds。stop() 没有 has 早退，所以级联照跑。
    const second = guard.stop(owner)
    expect(second.cancelledJobIds).toEqual(['winding-down'])
    expect(second.alreadyFinishedJobIds).toEqual([])
    expect(kills.filter((call) => call.id === 'winding-down').map((call) => call.verdict))
      .toEqual(['requested', 'requested'])

    // 幂等的真正载体是会话级 stop 行，不是 cancelled 计数 —— 计数在这两次里重复了。
    expect(guard.isStopped(owner)).toBe(true)
    guard.clear(owner)
    expect(guard.isStopped(owner)).toBe(false)
  })

  it('reports kill()=already-finished separately from requested (the synchronous allSettled)', () => {
    const kills: string[] = []
    const jobs: StopContinuationJobsLike = {
      list: () => [{ ...job('live', 'running'), ownerSession: 's' }, { ...job('done', 'running'), ownerSession: 's' }],
      kill: (id) => {
        kills.push(id)
        return id === 'done' ? 'already-finished' : 'requested'
      },
    }
    const outcome = makeGuard(jobs).guard.stop('s')
    expect(kills).toEqual(['live', 'done'])
    expect(outcome.cancelledJobIds).toEqual(['live'])
    expect(outcome.alreadyFinishedJobIds).toEqual(['done'])
  })

  it('one failing kill does not abandon the rest of the cascade (upstream allSettled)', () => {
    const logs: string[] = []
    const jobs: StopContinuationJobsLike = {
      list: () => [
        { ...job('a', 'running'), ownerSession: 's' },
        { ...job('b', 'running'), ownerSession: 's' },
        { ...job('c', 'running'), ownerSession: 's' },
      ],
      kill: (id) => {
        if (id === 'b') throw new Error('kill rejected')
        return 'requested'
      },
    }
    const guard = createStopContinuationGuard({ readJobs: () => jobs, log: (line) => logs.push(line) })
    const outcome = guard.stop('s')
    // 上游 allSettled 的同步等价物：失败被计数，链条继续。
    expect(outcome.cancelledJobIds).toEqual(['a', 'c'])
    expect(outcome.alreadyFinishedJobIds).toEqual(['b'])
    expect(logs.some((line) => line.includes('kill b failed: kill rejected'))).toBe(true)
  })

  it('a throwing list() is reported, not propagated — the command result must stay usable', () => {
    const logs: string[] = []
    const jobs: StopContinuationJobsLike = {
      list: () => { throw new Error('foreign caller') },
      kill: () => 'requested',
    }
    const guard = createStopContinuationGuard({ readJobs: () => jobs, log: (line) => logs.push(line) })
    const outcome = guard.stop('s')
    expect(guard.isStopped('s')).toBe(true)
    expect(outcome.jobsServicePresent).toBe(true)
    expect(outcome.cancelledJobIds).toEqual([])
    expect(logs.some((line) => line.includes('jobs list failed: foreign caller'))).toBe(true)
  })

  it('a throwing jobs accessor degrades to "no jobs service" and says so', () => {
    const logs: string[] = []
    const guard = createStopContinuationGuard({
      readJobs: () => { throw new Error('service exploded') },
      log: (line) => logs.push(line),
    })
    const outcome = guard.stop('s')
    expect(outcome.jobsServicePresent).toBe(false)
    expect(guard.isStopped('s')).toBe(true)
    expect(logs.some((line) => line.includes('jobs lookup failed: service exploded'))).toBe(true)
  })

  it('no jobs service at all: stop still happens and the absence is visible', () => {
    const { guard, logs } = makeGuard()
    const outcome = guard.stop('s')
    expect(guard.isStopped('s')).toBe(true)
    expect(outcome.jobsServicePresent).toBe(false)
    expect(logs[0]).toContain('jobs service absent — nothing cancelled')
  })
})

describe.each(['v1', 'v2'] as const)('P4.5-T3 the %s-shaped cascade — the same matrix on both generations', (shape) => {
  const session = `t3-cascade-${shape}`
  const owned = (id: string, status: string, owner = session): FakeJob =>
    shape === 'v2' ? { ...job(id, status), owner } : { ...job(id, status), ownerSession: owner }

  it(`${shape}: the mock's identity is what dshRuntimeShape says, and the guard NEVER touches the push face`, () => {
    // 形状自证：v1 face = 有 onJobDone / 无 events，v2 face = 有 events——若 fake
    // 谎报形状，整条矩阵测的就不是它声称的那一代。同时钉死：guard 把 `events` /
    // `onJobDone` 只当**身份信号**（dshRuntimeShape 读其有无），一次都不调用——
    // 身份标记不是能力探针（../dsh-runtime-shape.ts 头）。
    const { jobs, pushFaceCalls } = fakeJobs([owned('self-id', 'running')], shape)
    expect(dshRuntimeShape(jobs)).toBe(shape)
    expect('events' in jobs).toBe(shape === 'v2')
    const outcome = makeGuard(jobs).guard.stop(session)
    expect(outcome.jobsServicePresent).toBe(true)
    expect(pushFaceCalls).toEqual([])
  })

  it(`${shape}: cancels this session's running+stopping jobs; skips foreign, unowned and terminal ones (§5.1)`, () => {
    const { jobs, kills } = fakeJobs([
      owned('mine-running', 'running'),
      owned('mine-stopping', 'stopping'),
      owned('theirs-running', 'running', 'other-session'),
      job('unowned-running', 'running'),
      owned('mine-completed', 'completed'),
      owned('mine-killed', 'killed'),
      owned('mine-failed', 'failed'),
    ], shape)
    const outcome = makeGuard(jobs).guard.stop(session)
    expect(outcome.jobsServicePresent).toBe(true)
    // 外会话 job 连 list 都出不来（服务围栏），无主的被 guard 围栏跳过，
    // 终态的被状态过滤跳过——只有本会话的 running|stopping 被 kill。
    expect(kills.map((call) => call.id)).toEqual(['mine-running', 'mine-stopping'])
    expect(outcome.cancelledJobIds).toEqual(['mine-running', 'mine-stopping'])
    expect(outcome.alreadyFinishedJobIds).toEqual([])
    // §6：reason 逐字，两分支同值。
    expect(kills.every((call) => call.reason === STOP_CANCELLATION_REASON)).toBe(true)
    expect(CANCELLABLE_JOB_STATUSES).toEqual(['running', 'stopping'])
  })

  it(`${shape}: the caller handed to kill is EXACTLY the ${shape} shape (B2, the load-bearing §5.2 pin)`, () => {
    // 承重断言：v1 逐字 `{ id: sessionId }`，v2 逐字 sessionId 字符串。fake 的
    // 围栏对错误形状当场抛（callerSessionOf），所以这条红 = 形状错 = 真机上
    // 0.2.x 会被 fence 成空转——错误不可能静默通过。
    const { jobs, kills } = fakeJobs([owned('caller-shape', 'running')], shape)
    makeGuard(jobs).guard.stop(session)
    expect(kills).toHaveLength(1)
    if (shape === 'v2') {
      expect(typeof kills[0].caller).toBe('string')
      expect(kills[0].caller).toBe(session)
    } else {
      expect(typeof kills[0].caller).toBe('object')
      expect(kills[0].caller).toEqual({ id: session })
    }
  })

  it(`${shape}: CANARY — the cascade REALLY cancels: cancelledJobIds carries the target id, not an empty list (§5.3)`, () => {
    // 任务书点名的可分辨判定：「级联真的取消了」≠「静默空转」。空转的样子是
    // cancelledJobIds=[] 且 alreadyFinishedJobIds=[]（一个 job 都没碰），这里必须
    // 含目标 id 且不在 alreadyFinished 里。
    const { jobs, kills } = fakeJobs([owned('canary-target', 'running')], shape)
    const outcome = makeGuard(jobs).guard.stop(session)
    expect(outcome.cancelledJobIds).toContain('canary-target')
    expect(outcome.cancelledJobIds).not.toEqual([])
    expect(outcome.alreadyFinishedJobIds).toEqual([])
    expect(outcome.jobsServicePresent).toBe(true)
    expect(kills.map((call) => call.id)).toEqual(['canary-target'])
  })

  it(`${shape}: an all-foreign/unowned/terminal result is IDLE-but-PRESENT, distinguishable from an absent service (§5.4)`, () => {
    const { jobs, kills } = fakeJobs([
      owned('theirs', 'running', 'other-session'),
      job('unowned', 'running'),
      owned('mine-done', 'completed'),
    ], shape)
    const outcome = makeGuard(jobs).guard.stop(session)
    expect(outcome.cancelledJobIds).toEqual([])
    expect(kills).toEqual([])
    // 空转 ≠ 缺席：present 为 true，而服务缺席那条是 false。
    expect(outcome.jobsServicePresent).toBe(true)
    const absent = makeGuard().guard.stop(session)
    expect(absent.jobsServicePresent).toBe(false)
    expect(absent.cancelledJobIds).toEqual([])
  })

  it(`${shape}: verdict tristate — requested→cancelled, already-finished→alreadyFinished, throw→alreadyFinished+log+continue (§7)`, () => {
    const logs: string[] = []
    const tasks = [owned('v-live', 'running'), owned('v-late', 'running'), owned('v-boom', 'running')]
    const jobs: StopContinuationJobsLike = {
      ...(shape === 'v2' ? { events: { subscribe: () => () => undefined } } : {}),
      list: (caller) => {
        callerSessionOf(caller, shape)
        return tasks
      },
      kill: (id, caller) => {
        callerSessionOf(caller, shape)
        if (id === 'v-boom') throw new Error('kill rejected')
        return id === 'v-late' ? 'already-finished' : 'requested'
      },
    }
    const guard = createStopContinuationGuard({ readJobs: () => jobs, log: (line) => logs.push(line) })
    const outcome = guard.stop(session)
    expect(outcome.cancelledJobIds).toEqual(['v-live'])
    expect(outcome.alreadyFinishedJobIds).toEqual(['v-late', 'v-boom'])
    expect(logs.some((line) => line.includes('kill v-boom failed: kill rejected'))).toBe(true)
    // 抛错不放弃其余：v-boom 之后没有更多 job 了，但顺序证明 v-late/v-boom 都被尝试。
    expect(guard.isStopped(session)).toBe(true)
  })
})

describe('P4.5-T3 the owner double-read — `owner ?? ownerSession` priority pinned (B3, §5.5)', () => {
  // 宽容 list face：list **全部返回**（含外会话行）。真实 dsh 的 list 已按 caller
  // 过滤外会话行；宽容面建模"被装饰/被重载的服务"，把裁决逼到 guard 自己的围栏上，
  // 钉死键优先级——`owner` 赢，两键都无 = 无主 = 跳过。
  function lenientFace(tasks: readonly FakeJob[], shape: Shape): {
    jobs: StopContinuationJobsLike
    kills: string[]
  } {
    const kills: string[] = []
    const jobs: StopContinuationJobsLike = {
      ...(shape === 'v2' ? { events: { subscribe: () => () => undefined } } : {}),
      list: (caller) => {
        callerSessionOf(caller, shape)
        return tasks
      },
      kill: (id, caller) => {
        callerSessionOf(caller, shape)
        kills.push(id)
        return 'requested'
      },
    }
    return { jobs, kills }
  }

  it('only `owner` present and mine → cancelled (v2 key fences IN)', () => {
    const { jobs, kills } = lenientFace([{ ...job('owner-in', 'running'), owner: 's' }], 'v2')
    const outcome = makeGuard(jobs).guard.stop('s')
    expect(kills).toEqual(['owner-in'])
    expect(outcome.cancelledJobIds).toEqual(['owner-in'])
  })

  it('only `ownerSession` present and mine → cancelled (v1 key fences IN)', () => {
    const { jobs, kills } = lenientFace([{ ...job('owner-session-in', 'running'), ownerSession: 's' }], 'v1')
    const outcome = makeGuard(jobs).guard.stop('s')
    expect(kills).toEqual(['owner-session-in'])
    expect(outcome.cancelledJobIds).toEqual(['owner-session-in'])
  })

  it('both keys present: `owner` WINS — IN when owner is mine, SKIPPED when it is foreign, on BOTH faces', () => {
    for (const shape of ['v1', 'v2'] as const) {
      const mineOwner = lenientFace([{ ...job('both-in', 'running'), owner: 's', ownerSession: 'foreign' }], shape)
      makeGuard(mineOwner.jobs).guard.stop('s')
      expect(mineOwner.kills, `owner mine must win on the ${shape} face`).toEqual(['both-in'])
      const foreignOwner = lenientFace([{ ...job('both-out', 'running'), owner: 'foreign', ownerSession: 's' }], shape)
      const outcome = makeGuard(foreignOwner.jobs).guard.stop('s')
      expect(foreignOwner.kills, `a foreign owner must fence OUT on the ${shape} face`).toEqual([])
      expect(outcome.cancelledJobIds).toEqual([])
    }
  })

  it('NEITHER key present → unowned → skipped on BOTH faces (the fence never touches unowned jobs)', () => {
    for (const shape of ['v1', 'v2'] as const) {
      const { jobs, kills } = lenientFace([job('unowned', 'running')], shape)
      const outcome = makeGuard(jobs).guard.stop('s')
      expect(kills, `unowned must be skipped on the ${shape} face`).toEqual([])
      expect(outcome.cancelledJobIds).toEqual([])
      // 与"服务缺席"仍可分辨：围栏跳过是 present=true 的空转。
      expect(outcome.jobsServicePresent).toBe(true)
    }
  })
})

describe('P4-T8 R-5 cross-plugin visibility — the real apply() path, both mount orders', () => {
  /**
   * 一个假宿主：cordis 的 `provide` / `get` / `on` 语义按实测契约建模
   * （cordis/lib/index.js:792-826 provide 存到**调用方 fiber**；:371-380 on 注册到
   * 同一 fiber）。返回的服务表就是两个插件之间唯一的通道。
   */
  function host() {
    const services = new Map<string, unknown>()
    const listeners = new Map<string, ((...args: readonly unknown[]) => unknown)[]>()
    const published: string[] = []
    // 命令注册面按真形状建模：register 收的是 `{name, description, handler, input?}`
    // （omo-commands/src/index.ts:279-284，P4.5-T3 复核修正——原引 `index.ts:234-239`
    // 早已被后续改动移出该范围），handler 是被 adaptHandler 包过的那个，所以 MINOR-4 能
    // 拿到**经注册表那条路**的 handler，而不是直接调工厂。
    const definitions: { name: string; handler: (invocation: unknown) => unknown }[] = []
    const ctx = {
      on(event: string, listener: (...args: readonly unknown[]) => unknown) {
        const bucket = listeners.get(event) ?? []
        bucket.push(listener)
        listeners.set(event, bucket)
      },
      effect: () => undefined,
      get: (name: string) => services.get(name),
      provide: (name: string, value: unknown) => {
        services.set(name, value)
        published.push(name)
        return () => services.delete(name)
      },
      commands: {
        register: (definition: { name: string; handler: (invocation: unknown) => unknown }) => {
          definitions.push(definition)
          return () => {
            const at = definitions.indexOf(definition)
            if (at >= 0) definitions.splice(at, 1)
          }
        },
      },
      skills: { register: () => undefined },
    }
    return { ctx, services, listeners, published, definitions }
  }

  it('omo-hooks publishes the service, and omo-commands resolves it (provider first)', () => {
    const { ctx, services, published } = host()
    applyHooks(ctx)
    expect(published).toContain(STOP_CONTINUATION_SERVICE)
    expect(services.has(STOP_CONTINUATION_SERVICE)).toBe(true)

    const command = createStopContinuationCommand(ctx)
    const result = command.handler({ rawInput: '', agent: silentAgent('r5-session') })
    expect(result.kind).toBe('success')
    expect(result.kind === 'success' ? result.text : '').toContain('Continuation stopped for session r5-session')
    // The write really landed on the PUBLISHED instance — i.e. the H-03 reader, which
    // resolves the same service, now sees the stop.
    const guard = services.get(STOP_CONTINUATION_SERVICE) as StopContinuationGuard
    expect(guard.isStopped('r5-session')).toBe(true)
  })

  it('the consumer asked for the service LATE — a handle cached at apply time would have missed it', () => {
    // 这一条是「绝不在 apply 期缓存服务」的回归护栏：命令在 provide 之前被构造，
    // 仍然能停住会话。若实现改成在构造期取一次服务，这里就会红。
    const { ctx, services } = host()
    const command = createStopContinuationCommand(ctx)
    expect(command.handler({ rawInput: '', agent: silentAgent('late-session') }).kind).toBe('success')
    applyHooks(ctx)
    const result = command.handler({ rawInput: '', agent: silentAgent('late-session') })
    expect(result.kind === 'success' ? result.text : '').toContain('Continuation stopped')
    const guard = services.get(STOP_CONTINUATION_SERVICE) as StopContinuationGuard
    expect(guard.isStopped('late-session')).toBe(true)
  })

  it('MINOR-4: the real registration path hands a get-capable ctx to the command', () => {
    // 堵的是一个具体的接线洞：`runCommandRegistrations` 把 **ctx** 交给 registrar，
    // 而只有 `/stop-continuation` 的 registrar 会把 ctx 继续交给命令工厂。若哪天有人
    // 把它改成 `createStopContinuationCommand()`（无参）或 `…({})`，本文件其它用例仍
    // 全绿 —— 它们都直接调工厂，绕过了这一段接线。真实链路：
    // apply() 发布服务 → 注册循环注册 → 取注册到的 definition → 调它的 handler。
    const { ctx, services, definitions } = host()
    applyHooks(ctx)
    runCommandRegistrations(ctx, COMMAND_MANIFEST, COMMAND_REGISTRARS, () => {})

    const definition = definitions.find((entry) => entry.name === 'stop-continuation')
    expect(definition).toBeDefined()
    const result = definition?.handler({
      commandId: 'stop-continuation',
      rawInput: '',
      attachments: [],
      signal: undefined,
      agent: silentAgent('registrar-session'),
    }) as CommandResultLike
    expect(result.kind).toBe('success')
    expect(result.kind === 'success' ? result.text : '').toContain('Continuation stopped for session registrar-session')
    const guard = services.get(STOP_CONTINUATION_SERVICE) as StopContinuationGuard
    expect(guard.isStopped('registrar-session')).toBe(true)
  })

  it('the consumer mounted WITHOUT the provider: loud-but-non-fatal, nothing changed', () => {
    const { ctx } = host()
    const result = createStopContinuationCommand(ctx).handler({ rawInput: '', agent: silentAgent('solo') })
    expect(result.kind).toBe('success')
    expect(result.kind === 'success' ? result.text : '').toContain('Stop guard unavailable')
    expect(result.kind === 'success' ? result.text : '').toContain(STOP_CONTINUATION_SERVICE)
  })

  it('the provider on a host without provide() degrades loudly instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lines: string[] = []
    const ctx = {
      on: () => undefined,
      log: (line: string) => lines.push(line),
    }
    // The degraded path must survive a context that has no `provide` at all (the unit
    // fakes in tests/omo-hooks/registration.test.ts are exactly such a host).
    expect(() => applyHooks(ctx as never)).not.toThrow()
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls.some((call) => String(call[0]).includes('NOT published'))).toBe(true)
    warn.mockRestore()
  })

  it('both plugins agree on the service NAME (the one fact written on both sides)', () => {
    // 两个包各自本地声明服务名（跨包 import 会在对方缺席时崩掉加载），所以相等性
    // 必须被钉住，否则两侧漂移只会在真机表现为「命令报告 guard 不可用」。
    expect(COMMANDS_SIDE_SERVICE_NAME).toBe(STOP_CONTINUATION_SERVICE)
  })

  it('the provider wires the session/disposed cleanup listener on the same fiber', () => {
    const { ctx, listeners } = host()
    applyHooks(ctx)
    const bucket = listeners.get(STOP_CONTINUATION_GUARD_DISPOSED_EVENT) ?? []
    expect(bucket.length).toBeGreaterThanOrEqual(1)
    const guard = ctx.get(STOP_CONTINUATION_SERVICE) as StopContinuationGuard
    guard.stop('disposed-session')
    for (const listener of bucket) listener({ id: 'disposed-session' })
    expect(guard.isStopped('disposed-session')).toBe(false)
  })
})

describe('P4-T8 the command handler — upstream plugin/stop-continuation.ts 的四机制映射', () => {
  it('reports each mechanism truthfully: guard stopped, jobs cancelled, goal paused', () => {
    const { jobs, kills } = fakeJobs([
      { ...job('j1', 'running'), ownerSession: 'agent-session' },
      { ...job('j2', 'completed'), ownerSession: 'agent-session' },
    ])
    const guard = createStopContinuationGuard({ readJobs: () => jobs, log: () => {} })
    const pauses: { id: string; revision: number }[] = []
    const ctx = {
      get: (name: string) => {
        if (name === STOP_CONTINUATION_SERVICE) return guard
        if (name === 'goals') {
          return {
            get: () => ({ id: 'goal-1', revision: 7, phase: 'active' }),
            pause: (_agent: unknown, ref: { id: string; revision: number }) => pauses.push(ref),
          }
        }
        return undefined
      },
    }
    const result = createStopContinuationCommand(ctx).handler({ rawInput: '', agent: { id: 'agent-session' } })
    expect(result.kind).toBe('success')
    const text = result.kind === 'success' ? result.text : ''
    expect(text).toContain('Continuation stopped for session agent-session')
    expect(text).toContain('cancelled 1 running/stopping job(s)')
    expect(text).toContain('paused the active goal (kept, resumable)')
    // The goal was paused with the CAS revision the service handed us — NOT cleared,
    // and NOT paused with a stale/zero revision.
    expect(pauses).toEqual([{ id: 'goal-1', revision: 7 }])
    expect(kills.map((call) => call.id)).toEqual(['j1'])
  })

  it('never touches a goal that is not active, and says which case it was', () => {
    const guard = createStopContinuationGuard({ readJobs: () => undefined, log: () => {} })
    for (const [phase, expected] of [['paused', 'the session goal is not active'], ['complete', 'the session goal is not active'], ['blocked', 'the session goal is not active']] as const) {
      const ctx = {
        get: (name: string) => (name === STOP_CONTINUATION_SERVICE
          ? guard
          : { get: () => ({ id: 'g', revision: 1, phase }), pause: () => { throw new Error('must not pause') } }),
      }
      const text = createStopContinuationCommand(ctx).handler({ rawInput: '', agent: { id: 's' } })
      expect(text.kind === 'success' ? text.text : '').toContain(expected)
    }
  })

  it('a missing / throwing goals service leaves the goal alone and says so', () => {
    const guard = createStopContinuationGuard({ readJobs: () => undefined, log: () => {} })
    const absent = createStopContinuationCommand({
      get: (name) => (name === STOP_CONTINUATION_SERVICE ? guard : undefined),
    }).handler({ rawInput: '', agent: { id: 's' } })
    expect(absent.kind === 'success' ? absent.text : '').toContain('no goals service mounted')

    // `goals.get` THROWS for an agent that is not the registry's live instance.
    const throwing = createStopContinuationCommand({
      get: (name) => (name === STOP_CONTINUATION_SERVICE
        ? guard
        : { get: () => { throw new Error('not a live agent') }, pause: () => {} }),
    }).handler({ rawInput: '', agent: { id: 's' } })
    expect(throwing.kind).toBe('success')
    expect(throwing.kind === 'success' ? throwing.text : '').toContain('could not pause the goal')
    // The stop that already happened is NOT undone by a goal failure.
    expect(guard.isStopped('s')).toBe(true)
  })

  it('a throwing guard.stop settles as kind:error instead of escaping the handler', () => {
    const ctx = {
      get: () => ({
        stop: () => { throw new Error('guard exploded') },
      }),
    }
    const result = createStopContinuationCommand(ctx).handler({ rawInput: '', agent: { id: 's' } })
    expect(result).toEqual({
      kind: 'error',
      text: '/stop-continuation could not stop continuation: guard exploded',
    })
  })

  it('a context with no get() at all is the degraded path, not a crash', () => {
    const result = createStopContinuationCommand({}).handler({ rawInput: '', agent: { id: 's' } })
    expect(result.kind === 'success' ? result.text : '').toContain('Stop guard unavailable')
  })

  it('the rendered instruction names every mechanism this deployment really has', () => {
    const rendered = renderStopContinuationInstruction()
    expect(rendered.startsWith('# /stop-continuation Command\n')).toBe(true)
    expect(rendered).toContain('(builtin) Stop all continuation mechanisms (ralph loop, todo continuation, boulder) for this session')
    expect(rendered).toContain('## Command Instructions')
    // 逐条对应 §2 的四机制 + 注记的六条登记。
    expect(rendered).toContain('Stop the todo-continuation-enforcer')
    expect(rendered).toContain('Pause an active goal')
    expect(rendered).toContain('Cancel this session\'s running and stopping background jobs')
    expect(rendered).toContain('must be ended from your side')
    // 上游承诺过、DSH 做不到的两件事不得出现在正文里。
    expect(rendered).not.toContain('Cancel any active Ralph Loop')
    expect(rendered).not.toContain('Clear the boulder state')
  })

  it('every effect combination has its own sentence — no branch is a silent no-op', () => {
    const base = { guardAvailable: true, sessionId: 's', cancelledJobIds: [], alreadyFinishedJobIds: [], jobsServicePresent: false }
    expect(formatStopContinuationResult({ ...base, goal: 'paused' })).toContain('paused the active goal')
    expect(formatStopContinuationResult({ ...base, goal: 'absent' })).toContain('no goal on this session')
    expect(formatStopContinuationResult({ ...base, goal: 'not-active' })).toContain('not active')
    expect(formatStopContinuationResult({ ...base, goal: 'unavailable' })).toContain('no goals service mounted')
    expect(formatStopContinuationResult({ ...base, goal: 'failed' })).toContain('could not pause the goal')
    const withJobs = formatStopContinuationResult({
      ...base,
      goal: 'absent',
      jobsServicePresent: true,
      cancelledJobIds: ['a'],
      alreadyFinishedJobIds: ['b', 'c'],
    })
    expect(withJobs).toContain('cancelled 1 running/stopping job(s), 2 already finished')
    expect(formatStopContinuationResult({ ...base, guardAvailable: false }))
      .toContain('nothing was stopped')
    // B 评审 NIT-10：guard 缺席那条路**没有**碰过 goal，所以不报 goal 结果；
    // 而 goal 为 undefined 的防御分支要说实话，而不是静默按某个分支走。
    expect(formatStopContinuationResult({ ...base, goal: undefined }))
      .toContain('the goal outcome was not reported')
  })
})