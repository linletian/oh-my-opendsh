// P3-T12 — session-notification listener (plan §4.2 pattern F; task book WP-5).
// The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/session-notification*.ts @ v4.19.4:
//
//   upstream  `session.idle` (+ message.* activity, permission/question prompts)
//             → `createIdleNotificationScheduler` (6 collections + a version
//               counter) → platform backend (`notify-send` / `osascript`)
//   this port `session/event` turn/end + `agent/status` idle (the two DSH
//             surfaces — DSH has NO `session.idle`/`session.error`) → the SAME
//             debounce state machine → the SAME two backends
//
// What each group below pins, and why the expectation is transcribed by hand
// rather than derived (the registration.test.ts discipline):
//   * the debounce matrix is upstream `session-notification-scheduler.ts` gate by
//     gate: the version bump, the activity GRACE PERIOD (100ms), the notified dedup,
//     the executing guard, and the post-await version re-check;
//   * the command strings are upstream argv, byte for byte
//     (`session-notification-linux.ts:13-18`, `session-notification-macos.ts:66-73`,
//     `session-notification-formatting.ts:1-3`). ONE deliberate divergence from
//     the upstream TEXT (PR #9 review F1): `escapeAppleScriptText` also escapes
//     newlines, because upstream's raw-LF body is an osascript COMPILE ERROR and
//     this port emits multiline bodies far more often. The group below pins both
//     the two upstream replacements and the added arm;
//   * the two H-05 predicates are upstream `session-todo-status.ts`, and the
//     contrast test at the end of that group pins the fact that upstream uses TWO
//     DIFFERENT incomplete predicates in two files (2-status here vs the E-mode
//     module's 4-status `todo.ts`) — a finding, not an accident.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it, vi } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  getIncompleteCount,
  type TodoLike as ContinuationTodoLike,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/todo-continuation-enforcer.ts'
import {
  DEFAULT_SESSION_NOTIFICATION_CONFIG,
  NOTIFICATION_FAILURE_PREFIX,
  NOTIFICATION_LOG_PREFIX,
  SESSION_NOTIFICATION_EVENT,
  SESSION_NOTIFICATION_ID,
  SESSION_NOTIFICATION_STATUS_EVENT,
  SESSION_NOTIFICATION_TODOS_PROJECTION_KEY,
  NOTIFY_SEND_COMMAND,
  OSASCRIPT_COMMAND,
  buildAppleScript,
  buildNotificationContent,
  buildNotifySendArgs,
  buildOsascriptArgs,
  classifySessionEvent,
  countIncompleteTodos,
  createLinuxNotifierBackend,
  createMacosNotifierBackend,
  createPlatformNotifierBackend,
  createSessionNotificationListener,
  detectNotificationPlatform,
  escapeAppleScriptText,
  formatNotificationFailureLine,
  formatNotificationLine,
  hasIncompleteTodos,
  hasPendingSessionWork,
  isPendingTodo,
  readAgentStatus,
  readTodosProjection,
  registerSessionNotification,
  shouldNotifyForSession,
  shouldSkipForPendingWork,
  type NotifierBackend,
  type TodoSnapshot,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/session-notification.ts'

/** The backend stand-in: the real interface, narrowed for the harness. */
type FakeBackend = NotifierBackend

/** A synthetic live session object (the WeakMap key + the header filter input). */
interface FakeSession {
  readonly id: string
  readonly header?: { readonly origin?: string; readonly delegationDepth?: number }
}

const SESSION: FakeSession = { id: 'ses_main' }

/** One armed timer in the harness (our own clock, no real timers). */
interface FakeTimer {
  readonly handle: number
  readonly fn: () => void
  readonly delayMs: number
  cleared: boolean
  fired: boolean
}

/**
 * The deterministic harness: an injected clock, timer table, backend recorder and
 * a combined `timeline` that proves the anchor is logged BEFORE the command runs.
 */
function harness(overrides: {
  readTodos?: (session: unknown) => TodoSnapshot
  hasPendingWork?: (session: unknown) => boolean | Promise<boolean>
  backend?: FakeBackend | undefined
  config?: Partial<typeof DEFAULT_SESSION_NOTIFICATION_CONFIG>
} = {}) {
  const lines: string[] = []
  const failures: string[] = []
  const timeline: string[] = []
  const sent: Array<{ title: string; body: string }> = []
  const timers: FakeTimer[] = []
  let nowMs = 1_000_000
  let nextHandle = 1

  const backend: FakeBackend | undefined = 'backend' in overrides
    ? overrides.backend
    : {
        platform: 'linux',
        async notify(title: string, body: string) {
          sent.push({ title, body })
          timeline.push(`notify:${title}`)
        },
      }

  const listener = createSessionNotificationListener({
    backend,
    readTodos: overrides.readTodos ?? (() => []),
    ...(overrides.hasPendingWork === undefined ? {} : { hasPendingWork: overrides.hasPendingWork }),
    log: (line) => {
      lines.push(line)
      timeline.push(`log:${line}`)
    },
    logFailure: (line) => {
      failures.push(line)
    },
    ...(overrides.config === undefined ? {} : { config: overrides.config }),
    now: () => nowMs,
    setTimer: (fn, delayMs) => {
      const handle = nextHandle
      nextHandle += 1
      timers.push({ handle, fn, delayMs, cleared: false, fired: false })
      return handle
    },
    clearTimer: (handle) => {
      const timer = timers.find((candidate) => candidate.handle === handle)
      if (timer !== undefined) timer.cleared = true
    },
  })

  return {
    listener,
    lines,
    failures,
    timeline,
    sent,
    timers,
    /** Advance the injected clock (the grace period is measured against it). */
    advanceClock(ms: number) {
      nowMs += ms
    },
    /** Fire every armed timer and drain the async dispatch chain. */
    async fireTimers() {
      for (const timer of timers) {
        if (timer.cleared || timer.fired) continue
        timer.fired = true
        timer.fn()
      }
      await drainMicrotasks()
    },
  }
}

/** Drains the microtask queue so an awaited dispatch chain settles. */
function drainMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

/** A controllable promise, for the in-flight (executing / post-await) cases. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Shorthand event constructors (the leaf shapes the listener reads). */
function turnStart() {
  return { type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } }
}
function stepEnd() {
  return { type: 'step/end', seq: 2, time: 0, data: { turn: 1, step: 1 } }
}
function turnEnd(kind: string) {
  return { type: 'turn/end', seq: 3, time: 0, data: { turn: 1, reason: { kind } } }
}
function idleStatus(session: unknown = SESSION) {
  return { agent: { session }, status: 'idle' }
}
function runningStatus(session: unknown = SESSION) {
  return { agent: { session }, status: 'running' }
}

/** The real manifest row — the registrar must read its event from the row. */
function notificationRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === SESSION_NOTIFICATION_ID)
  if (row === undefined) throw new Error('manifest is missing the session-notification row')
  return row
}

describe('P3-T12 session-notification — the debounce decision matrix', () => {
  it('① a completed turn with real work notifies once, after the idle confirmation delay', async () => {
    const h = harness()
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    // Exactly ONE timer, armed with upstream's default delay (1500ms).
    expect(h.timers).toHaveLength(1)
    expect(h.timers[0].delayMs).toBe(1500)
    expect(h.listener.pendingTimerCount()).toBe(1)
    // Nothing is sent before the delay elapses (upstream's idle confirmation).
    expect(h.sent).toEqual([])
    await h.fireTimers()
    expect(h.sent).toEqual([{ title: 'oh-my-opendsh', body: 'Agent is ready for input' }])
    expect(h.lines).toEqual(['[omo-hooks] session-notification: idle oh-my-opendsh'])
  })

  it('② a turn that produced NO work is never announced ("会话有实际工作产出")', async () => {
    const h = harness()
    // turn/start opens the turn but produces nothing; a completed turn/end with
    // no step/end in between is a turn that did not enter a step.
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    expect(h.listener.pendingTimerCount()).toBe(0)
    await h.fireTimers()
    expect(h.sent).toEqual([])
    expect(h.lines).toEqual([])
  })

  it('③ an idle status on a session that never worked is never announced', async () => {
    const h = harness()
    h.listener.onAgentStatus(idleStatus())
    expect(h.listener.pendingTimerCount()).toBe(0)
    await h.fireTimers()
    expect(h.sent).toEqual([])
  })

  it('④ an error turn notifies with the error body, and the todo gate does NOT suppress it', async () => {
    // Upstream has no error notification at all, and its skipIfIncompleteTodos
    // gate only ever guarded the idle notification — so the error kind bypasses
    // it (the header records the reasoning).
    let gateCalls = 0
    const h = harness({
      readTodos: () => [{ status: 'pending' }],
      hasPendingWork: () => {
        gateCalls += 1
        return true
      },
    })
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, turnEnd('error'))
    expect(h.listener.pendingTimerCount()).toBe(1)
    await h.fireTimers()
    expect(gateCalls).toBe(0)
    expect(h.sent).toEqual([
      {
        title: 'oh-my-opendsh',
        body: 'Agent stopped with an error\n1 todo still incomplete',
      },
    ])
    expect(h.lines).toEqual(['[omo-hooks] session-notification: error oh-my-opendsh'])
  })

  it('⑤ skipIfIncompleteTodos suppresses the COMPLETION notification while work remains', async () => {
    const h = harness({ readTodos: () => [{ status: 'pending' }, { status: 'completed' }] })
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    expect(h.sent).toEqual([])
    expect(h.lines).toEqual([])
    expect(h.listener.pendingTimerCount()).toBe(0)
  })

  it('⑥ the completion body carries the incomplete count when the gate is relaxed', async () => {
    const h = harness({
      readTodos: () => [{ status: 'in_progress' }, { status: 'completed' }, { status: 'cancelled' }],
      config: { skipIfIncompleteTodos: false },
    })
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    expect(h.sent).toEqual([
      {
        title: 'oh-my-opendsh',
        body: 'Agent is ready for input\n1 todo still incomplete',
      },
    ])
  })

  it('⑦ max-tokens / aborted / blocked / interrupted notify NOTHING by themselves', async () => {
    for (const reason of ['max-tokens', 'aborted', 'blocked', 'interrupted', 'who-knows']) {
      const h = harness()
      h.listener.onSessionEvent(SESSION, turnStart())
      h.listener.onSessionEvent(SESSION, stepEnd())
      h.listener.onSessionEvent(SESSION, turnEnd(reason))
      expect(h.listener.pendingTimerCount()).toBe(0)
      await h.fireTimers()
      expect(h.sent).toEqual([])
    }
  })

  it('⑧ the auxiliary idle status covers a turn that closed for a non-notified reason', async () => {
    // The four reasons above are not announced directly, but the session's own
    // idle transition IS the user-visible "the agent stopped" fact (upstream's
    // `session.idle` trigger), so nothing is silently dropped.
    const h = harness()
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('max-tokens'))
    expect(h.listener.pendingTimerCount()).toBe(0)
    h.listener.onAgentStatus(idleStatus())
    expect(h.listener.pendingTimerCount()).toBe(1)
    await h.fireTimers()
    expect(h.sent).toHaveLength(1)
  })

  it('⑨ an error notification and the following idle status never double-notify', async () => {
    const h = harness()
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, turnEnd('error'))
    // The idle status arrives while the error timer is still armed.
    h.listener.onAgentStatus(idleStatus())
    expect(h.listener.pendingTimerCount()).toBe(1)
    await h.fireTimers()
    expect(h.sent).toHaveLength(1)
    // …and a LATER idle status on the same (notified) session stays silent too.
    h.listener.onAgentStatus(idleStatus())
    await h.fireTimers()
    expect(h.sent).toHaveLength(1)
  })

  it('⑩ activity arriving AFTER the grace period cancels the pending notification', async () => {
    const h = harness()
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    expect(h.listener.pendingTimerCount()).toBe(1)
    h.advanceClock(500)
    h.listener.onSessionEvent(SESSION, turnStart())
    expect(h.listener.pendingTimerCount()).toBe(0)
    await h.fireTimers()
    expect(h.sent).toEqual([])
  })

  it('⑪ activity INSIDE the 100ms grace window is deliberately ignored (upstream verbatim)', async () => {
    // `session-notification-scheduler.ts:74-88`: activity that lands within
    // activityGracePeriodMs of a schedule is a late echo of the same turn, not a
    // resumption, so it must NOT cancel the notification.
    const h = harness()
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    h.advanceClock(50)
    h.listener.onSessionEvent(SESSION, turnStart())
    expect(h.listener.pendingTimerCount()).toBe(1)
    await h.fireTimers()
    expect(h.sent).toHaveLength(1)
  })

  it('⑫ activity arriving DURING the pending-work await invalidates the dispatch', async () => {
    // The upstream race guard (`scheduler.ts:120-123`): after awaiting the
    // hasIncompleteTodos probe the version is re-checked, so a notification that
    // was cancelled while the probe was in flight stands down.
    const gate = deferred<boolean>()
    const h = harness({
      readTodos: () => [],
      hasPendingWork: () => gate.promise,
    })
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    // The dispatch is parked on the probe; now resume the session.
    h.advanceClock(500)
    h.listener.onSessionEvent(SESSION, turnStart())
    gate.resolve(false)
    await drainMicrotasks()
    expect(h.sent).toEqual([])
  })

  it('⑬ a broken pending-work probe notifies instead of suppressing (upstream swallows)', async () => {
    const h = harness({
      readTodos: () => [],
      hasPendingWork: () => {
        throw new Error('projection exploded')
      },
    })
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    expect(h.sent).toHaveLength(1)
    expect(h.failures).toEqual([
      '[omo-hooks] session-notification FAILED: pending-work probe failed: Error: projection exploded',
    ])
  })

  it('⑭ a send already in flight blocks a second schedule (the executing guard)', async () => {
    const gate = deferred<void>()
    const h = harness({
      backend: {
        platform: 'linux',
        notify: async () => {
          await gate.promise
        },
      },
    })
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    // The dispatch is now executing; a second completion must not arm a timer.
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    expect(h.listener.pendingTimerCount()).toBe(0)
    gate.resolve()
    await drainMicrotasks()
    expect(h.listener.pendingTimerCount()).toBe(0)
  })

  it('⑮ activity clears the notified flag, so the next completion notifies again', async () => {
    const h = harness()
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    expect(h.sent).toHaveLength(1)
    // A new turn far enough after the schedule clears `notified`…
    h.advanceClock(1_000)
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    expect(h.sent).toHaveLength(2)
  })

  it('⑯ the disposable clears every armed timer and stops all further work', async () => {
    const h = harness()
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    expect(h.listener.pendingTimerCount()).toBe(1)
    h.listener.dispose()
    expect(h.timers[0].cleared).toBe(true)
    expect(h.listener.pendingTimerCount()).toBe(0)
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    h.listener.onAgentStatus(idleStatus())
    await h.fireTimers()
    expect(h.sent).toEqual([])
  })

  it('⑰ no backend on this platform means no notification AND no anchor line', async () => {
    const h = harness({ backend: undefined })
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    expect(h.sent).toEqual([])
    // The anchor never claims a notification that did not happen.
    expect(h.lines).toEqual([])
  })
})

describe('P3-T12 session-notification — fail-open behaviour (discipline ②)', () => {
  it('① a rejected backend is swallowed and logged, never thrown at the emit feed', async () => {
    const h = harness({
      backend: {
        platform: 'linux',
        notify: async () => {
          throw new Error('notify-send missing')
        },
      },
    })
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    expect(h.failures).toEqual([
      '[omo-hooks] session-notification FAILED: notification dispatch failed: Error: notify-send missing',
    ])
    // The anchor is still logged BEFORE the command (the CI carrier rule).
    expect(h.lines).toEqual(['[omo-hooks] session-notification: idle oh-my-opendsh'])
  })

  it('② malformed payloads never throw and never arm a timer', async () => {
    const h = harness()
    expect(() => h.listener.onSessionEvent(undefined, undefined)).not.toThrow()
    expect(() => h.listener.onSessionEvent(SESSION, null)).not.toThrow()
    expect(() => h.listener.onSessionEvent(SESSION, { type: 'turn/end' })).not.toThrow()
    expect(() => h.listener.onSessionEvent(SESSION, turnEnd('completed'))).not.toThrow()
    expect(() => h.listener.onAgentStatus(null)).not.toThrow()
    expect(() => h.listener.onAgentStatus({ status: 'idle' })).not.toThrow()
    expect(() => h.listener.onAgentStatus({ agent: {}, status: 'idle' })).not.toThrow()
    expect(() => h.listener.onAgentStatus({ agent: { session: SESSION }, status: 'nonsense' })).not.toThrow()
    // `SESSION` never produced work, so nothing may be armed even though the
    // last call was a completed turn.
    expect(h.listener.pendingTimerCount()).toBe(0)
    expect(h.failures).toEqual([])
  })

  it('③ a throwing todo reader is a log line, not an exception', async () => {
    const h = harness({
      readTodos: () => {
        throw new Error('projection gone')
      },
      config: { skipIfIncompleteTodos: true },
    })
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    // TWO failures, in order: the gate probe throws ⇒ treated as "not pending"
    // (upstream's swallow, `session-todo-status.ts:18-21`), so the dispatch
    // proceeds; the CONTENT read then throws inside `send`, which is swallowed by
    // the dispatch catch. The listener never throws and never logs an anchor.
    expect(h.failures).toEqual([
      '[omo-hooks] session-notification FAILED: pending-work probe failed: Error: projection gone',
      '[omo-hooks] session-notification FAILED: notification dispatch failed: Error: projection gone',
    ])
    expect(h.lines).toEqual([])
  })

  it('④ a throwing log sink cannot break the emit feed', async () => {
    const listener = createSessionNotificationListener({
      backend: {
        platform: 'linux',
        notify: async () => {},
      },
      readTodos: () => [],
      log: () => {
        throw new Error('stdout closed')
      },
      logFailure: () => {
        throw new Error('stderr closed')
      },
      now: () => 0,
      setTimer: (fn) => {
        fn()
        return 1
      },
      clearTimer: () => {},
    })
    expect(() => {
      listener.onSessionEvent(SESSION, turnStart())
      listener.onSessionEvent(SESSION, stepEnd())
      listener.onSessionEvent(SESSION, turnEnd('completed'))
    }).not.toThrow()
    await drainMicrotasks()
  })
})

describe('P3-T12 session-notification — the pure classification table', () => {
  it('① maps every session/event type this hook cares about', () => {
    expect(classifySessionEvent(turnStart())).toEqual({ kind: 'turn-start' })
    expect(classifySessionEvent(stepEnd())).toEqual({ kind: 'work' })
    expect(classifySessionEvent({ type: 'assistant/message' })).toEqual({ kind: 'work' })
    expect(classifySessionEvent({ type: 'tool/result' })).toEqual({ kind: 'work' })
    expect(classifySessionEvent(turnEnd('completed'))).toEqual({ kind: 'complete' })
    expect(classifySessionEvent(turnEnd('error'))).toEqual({ kind: 'error' })
    expect(classifySessionEvent(turnEnd('max-tokens'))).toEqual({ kind: 'none' })
    expect(classifySessionEvent(turnEnd('aborted'))).toEqual({ kind: 'none' })
    expect(classifySessionEvent({ type: 'user/message' })).toEqual({ kind: 'none' })
    expect(classifySessionEvent({ type: 'turn/end', data: {} })).toEqual({ kind: 'none' })
    expect(classifySessionEvent({})).toEqual({ kind: 'none' })
    expect(classifySessionEvent(undefined)).toEqual({ kind: 'none' })
  })

  it('② reads the agent status vocabulary only', () => {
    expect(readAgentStatus({ status: 'idle' })).toBe('idle')
    expect(readAgentStatus({ status: 'running' })).toBe('running')
    expect(readAgentStatus({ status: 'disposed' })).toBeUndefined()
    expect(readAgentStatus(undefined)).toBeUndefined()
  })

  it('③ the pending-work gate applies to the completion kind only', () => {
    expect(shouldSkipForPendingWork('idle')).toBe(true)
    expect(shouldSkipForPendingWork('error')).toBe(false)
  })

  it('④ filters subagent children through the session header (the DSH main-session filter)', () => {
    expect(shouldNotifyForSession(SESSION)).toBe(true)
    expect(shouldNotifyForSession({ id: 'x', header: {} })).toBe(true)
    expect(shouldNotifyForSession({ id: 'x', header: { origin: 'subagent' } })).toBe(false)
    expect(shouldNotifyForSession({ id: 'x', header: { delegationDepth: 1 } })).toBe(false)
    expect(shouldNotifyForSession({ id: 'x', header: { delegationDepth: 0 } })).toBe(true)
    expect(shouldNotifyForSession(undefined)).toBe(false)
  })

  it('⑤ a subagent child session is filtered before any timer is armed', () => {
    const h = harness()
    const child: FakeSession = { id: 'ses_child', header: { origin: 'subagent' } }
    h.listener.onSessionEvent(child, turnStart())
    h.listener.onSessionEvent(child, stepEnd())
    h.listener.onSessionEvent(child, turnEnd('completed'))
    h.listener.onAgentStatus(idleStatus(child))
    expect(h.listener.pendingTimerCount()).toBe(0)
  })

  it('⑥ running status is activity: it cancels a pending notification past the grace window', () => {
    const h = harness()
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    expect(h.listener.pendingTimerCount()).toBe(1)
    h.advanceClock(500)
    h.listener.onAgentStatus(runningStatus())
    expect(h.listener.pendingTimerCount()).toBe(0)
  })
})

describe('P3-T12 session-notification — H-05 predicates (upstream session-todo-status.ts)', () => {
  it('① isPendingTodo is the upstream TWO-status predicate, verbatim', () => {
    expect(isPendingTodo({ status: 'pending' })).toBe(true)
    expect(isPendingTodo({ status: 'in_progress' })).toBe(true)
    expect(isPendingTodo({ status: 'completed' })).toBe(false)
    expect(isPendingTodo({ status: 'cancelled' })).toBe(false)
    // DSH's TodoItem union has no blocked/deleted member, but upstream's `!==`
    // chain would treat BOTH as pending — so this port does too, and the
    // behavioural consequence is that a blocked/deleted item keeps the
    // completion notification suppressed, exactly as upstream would. The two
    // extra statuses are the ONLY divergence from the E-mode module's 4-status
    // predicate (the header records why they are not added here: they are
    // unreachable on this union, and adding them would be a silent semantic
    // change to this port).
    expect(isPendingTodo({ status: 'blocked' })).toBe(true)
    expect(isPendingTodo({ status: 'deleted' })).toBe(true)
  })

  it('② countIncompleteTodos treats null/undefined/[] as nothing pending (upstream early exit)', () => {
    expect(countIncompleteTodos(null)).toBe(0)
    expect(countIncompleteTodos(undefined)).toBe(0)
    expect(countIncompleteTodos([])).toBe(0)
    expect(
      countIncompleteTodos([
        { status: 'completed' },
        { status: 'pending' },
        { status: 'cancelled' },
        { status: 'in_progress' },
      ]),
    ).toBe(2)
    expect(hasIncompleteTodos([{ status: 'completed' }])).toBe(false)
    expect(hasIncompleteTodos([{ status: 'completed' }, { status: 'pending' }])).toBe(true)
    expect(hasIncompleteTodos(null)).toBe(false)
  })

  it('③ hasPendingSessionWork keeps upstream OR shape (background-task term is the seam)', () => {
    expect(hasPendingSessionWork([])).toBe(false)
    expect(hasPendingSessionWork([{ status: 'pending' }])).toBe(true)
    // The continuation-marker term: active background task ⇒ pending work even
    // with a fully completed todo list (this is the seam the registrar leaves
    // `false` today — see the file header's "background-task term").
    expect(hasPendingSessionWork([{ status: 'completed' }], { backgroundTaskActive: true })).toBe(true)
    expect(hasPendingSessionWork(null, { backgroundTaskActive: false })).toBe(false)
  })

  it('④ pins the upstream TWO-predicate discrepancy against the E-mode module', () => {
    // session-todo-status.ts:17 (this module) excludes 2 statuses;
    // todo-continuation-enforcer/todo.ts excludes 4. Asserting the divergence
    // here makes a future "unification" refactor a deliberate, visible edit.
    const blocked: ContinuationTodoLike = { status: 'blocked', content: 'x' }
    expect(isPendingTodo(blocked)).toBe(true)
    expect(getIncompleteCount([blocked])).toBe(0)
  })

  it('⑤ buildNotificationContent appends the count only when it is positive', () => {
    expect(
      buildNotificationContent({
        kind: 'idle',
        baseTitle: 'T',
        baseMessage: 'M',
        errorMessage: 'E',
        incompleteCount: 0,
      }),
    ).toEqual({ title: 'T', body: 'M' })
    expect(
      buildNotificationContent({
        kind: 'error',
        baseTitle: 'T',
        baseMessage: 'M',
        errorMessage: 'E',
        incompleteCount: 2,
      }),
    ).toEqual({ title: 'T', body: 'E\n2 todos still incomplete' })
  })
})

describe('P3-T12 session-notification — platform backends and command construction', () => {
  it('① detects the three upstream platform names and nothing else', () => {
    expect(detectNotificationPlatform('darwin')).toBe('darwin')
    expect(detectNotificationPlatform('linux')).toBe('linux')
    expect(detectNotificationPlatform('win32')).toBe('win32')
    expect(detectNotificationPlatform('freebsd')).toBe('unsupported')
  })

  it('② the Linux argv is upstream session-notification-linux.ts:16, verbatim', () => {
    expect(NOTIFY_SEND_COMMAND).toBe('notify-send')
    expect(buildNotifySendArgs('Title', 'Body')).toEqual(['Title', 'Body'])
  })

  it('③ AppleScript escaping keeps upstream session-notification-formatting.ts:1-3 plus the F1 newline arm', () => {
    expect(escapeAppleScriptText('plain')).toBe('plain')
    expect(escapeAppleScriptText('back\\slash')).toBe('back\\\\slash')
    expect(escapeAppleScriptText('say "hi"')).toBe('say \\"hi\\"')
    // Backslashes first: the quote escape must not be re-escaped.
    expect(escapeAppleScriptText('a\\"b')).toBe('a\\\\\\"b')
    // F1: LINE TERMINATORS become AppleScript's concatenation form. AppleScript
    // has no backslash-n, so this is the only correct spelling — a raw LF inside
    // the literal is an osascript compile error.
    expect(escapeAppleScriptText('a\nb')).toBe('a" & return & "b')
    // CRLF is ONE line terminator: a naive /\r|\n/ split would concatenate two
    // `return`s for a DOS line ending.
    expect(escapeAppleScriptText('a\r\nb')).toBe('a" & return & "b')
    expect(escapeAppleScriptText('a\rb')).toBe('a" & return & "b')
    // The introduced quotes are STRUCTURAL and must survive unescaped — proving
    // the newline arm really runs last.
    expect(escapeAppleScriptText('a"b\nc')).toBe('a\\"b" & return & "c')
    // ... and the backslash arm really ran first: the backslash is doubled
    // BEFORE the newline arm adds its own quotes.
    expect(escapeAppleScriptText('a\\\nb')).toBe('a\\\\" & return & "b')
  })

  it('④ the macOS script and argv are upstream session-notification-macos.ts:66-73, verbatim', () => {
    expect(buildAppleScript('Title', 'Body')).toBe('display notification "Body" with title "Title"')
    // Escaped on the way in, message-before-title order preserved.
    expect(buildAppleScript('Ti"tle', 'Bo\\dy')).toBe(
      'display notification "Bo\\\\dy" with title "Ti\\"tle"',
    )
    expect(buildOsascriptArgs('Title', 'Body')).toEqual([
      '-e',
      'display notification "Body" with title "Title"',
    ])
    expect(OSASCRIPT_COMMAND).toBe('osascript')
  })

  it('⑤ each backend dispatches its own binary through the injected runner', async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = []
    const run = async (command: string, args: readonly string[]): Promise<void> => {
      calls.push({ command, args })
    }
    await createLinuxNotifierBackend(run).notify('Title', 'Body')
    await createMacosNotifierBackend(run).notify('Title', 'Body')
    expect(calls).toEqual([
      { command: 'notify-send', args: ['Title', 'Body'] },
      { command: 'osascript', args: ['-e', 'display notification "Body" with title "Title"'] },
    ])
  })

  it('⑥ platform selection: linux/darwin get a backend, win32 and unknown get none (D9)', () => {
    const run = async (): Promise<void> => {}
    expect(createPlatformNotifierBackend({ runtimePlatform: 'linux', run })?.platform).toBe('linux')
    expect(createPlatformNotifierBackend({ runtimePlatform: 'darwin', run })?.platform).toBe('darwin')
    // D9: the Windows backend is NOT ported — the platform is still DETECTED
    // (upstream's detectPlatform verbatim) but maps to no backend.
    expect(createPlatformNotifierBackend({ runtimePlatform: 'win32', run })).toBeUndefined()
    expect(createPlatformNotifierBackend({ runtimePlatform: 'freebsd', run })).toBeUndefined()
  })

  it('⑦ the log-line formats are the stable probe anchors', () => {
    expect(formatNotificationLine('idle', 'oh-my-opendsh')).toBe(
      '[omo-hooks] session-notification: idle oh-my-opendsh',
    )
    expect(formatNotificationLine('error', 'oh-my-opendsh')).toBe(
      '[omo-hooks] session-notification: error oh-my-opendsh',
    )
    expect(formatNotificationFailureLine('x failed', new Error('boom'))).toBe(
      '[omo-hooks] session-notification FAILED: x failed: Error: boom',
    )
    expect(NOTIFICATION_LOG_PREFIX).toBe('[omo-hooks] session-notification: ')
    expect(NOTIFICATION_FAILURE_PREFIX).toBe('[omo-hooks] session-notification FAILED: ')
    // The failure form must never look like a boot registration failure (the
    // probe fails a boot on `[omo-hooks] hook .* FAILED`).
    expect(formatNotificationFailureLine('x failed', 'plain').startsWith('[omo-hooks] hook ')).toBe(false)
  })

  it('⑧ the anchor is logged BEFORE the command is dispatched', async () => {
    const h = harness()
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    expect(h.timeline).toEqual([
      'log:[omo-hooks] session-notification: idle oh-my-opendsh',
      'notify:oh-my-opendsh',
    ])
  })
})

// PR #9 review F1 — the multiline AppleScript regression. The pre-fix code
// escaped backslash and double-quote only, so the LF of a two-line body landed
// RAW inside the `display notification "…"` literal, which osascript refuses to
// COMPILE (AppleScript has no backslash-n). The listener swallows that into one
// `FAILED:` line, so the user simply never hears about the error — and the error
// shape below is the COMMON case, because `buildNotificationContent` appends the
// incomplete-todo count to the body for every kind and `error` bypasses the
// pending-work gate (`shouldSkipForPendingWork` gates `idle` only).
describe('P3-T12 session-notification — F1 multiline AppleScript (PR #9 review)', () => {
  /**
   * The ` & return & ` concatenation marker the newline arm emits. Split on it
   * and every piece must be a self-contained operand of the concatenation: no
   * raw line terminator (that is the compile error) and paired structural
   * quotes (an odd count means a literal was left open). Pre-fix this yields ONE
   * operand containing the raw LF, so both assertions below are red.
   */
  function concatenationOperands(script: string): readonly string[] {
    return script.split(' & return & ')
  }

  /** Count the UNESCAPED double quotes in one operand, left to right. */
  function structuralQuotes(operand: string): number {
    let count = 0
    for (let i = 0; i < operand.length; i += 1) {
      if (operand[i] === '\\') {
        i += 1
        continue
      }
      if (operand[i] === '"') count += 1
    }
    return count
  }

  it('① the real error body (kind=error, incompleteCount=3) is a compilable two-operand script', () => {
    const content = buildNotificationContent({
      kind: 'error',
      baseTitle: 'oh-my-opendsh',
      baseMessage: 'Ready for input',
      errorMessage: 'Turn failed',
      incompleteCount: 3,
    })
    // The multiline body this test is about really is what the listener emits.
    expect(content.body).toBe('Turn failed\n3 todos still incomplete')
    expect(content.title).toBe('oh-my-opendsh')

    const args = buildOsascriptArgs(content.title, content.body)
    expect(args[0]).toBe('-e')
    expect(args[1]).toBe(
      'display notification "Turn failed" & return & "3 todos still incomplete"'
      + ' with title "oh-my-opendsh"',
    )
    // The concatenation marker IS present ...
    expect(args[1]).toContain('" & return & "')
    // ... and no raw line terminator survives inside the script.
    expect(args[1]).not.toMatch(/[\r\n]/)
    expect(buildAppleScript(content.title, content.body)).toBe(args[1])
  })

  it('② CRLF and a lone CR are also lifted out of the literal, one return each', () => {
    // CRLF as ONE terminator: /[\r\n]/ would emit two adjacent returns here.
    expect(buildOsascriptArgs('T', 'a\r\nb')[1]).toBe(
      'display notification "a" & return & "b" with title "T"',
    )
    expect(buildOsascriptArgs('T', 'a\rb')[1]).toBe(
      'display notification "a" & return & "b" with title "T"',
    )
    // Two DOS line terminators ⇒ two concatenations, still no raw CR/LF.
    expect(buildOsascriptArgs('T', 'a\r\n\r\nb')[1]).toBe(
      'display notification "a" & return & "" & return & "b" with title "T"',
    )
  })

  it('③ a multiline TITLE takes the same path', () => {
    const script = buildOsascriptArgs('Ti\ntle', 'Body')[1]!
    expect(script).toBe('display notification "Body" with title "Ti" & return & "tle"')
    expect(script).not.toMatch(/[\r\n]/)
  })

  it('④ structural guard: every concatenation operand is quote-balanced and LF-free', () => {
    const script = buildOsascriptArgs(
      'oh-my-opendsh',
      'Turn failed\n3 todos still incomplete',
    )[1]!
    const operands = concatenationOperands(script)
    // Red pre-fix: without the newline arm there is nothing to split on.
    expect(operands.length).toBeGreaterThan(1)
    for (const operand of operands) {
      // Red pre-fix: operand 0 carries the raw LF inside its literal.
      expect(operand).not.toMatch(/[\r\n]/)
      expect(structuralQuotes(operand) % 2).toBe(0)
    }
    // The escaped-quote inputs exercise the same guard with the other arms.
    const mixed = buildOsascriptArgs('T"it', 'a\\"b\nc')[1]!
    expect(mixed).not.toMatch(/[\r\n]/)
    expect(structuralQuotes(concatenationOperands(mixed)[0]!)).toBe(2)
  })
})

describe('P3-T12 session-notification — U-4 todo projection reader', () => {
  it('① reads ctx.sessionProjections.stateOf(session, "todos")', () => {
    const seen: Array<{ session: unknown; key: string }> = []
    const ctx = {
      get(name: string) {
        if (name !== 'sessionProjections') return undefined
        return {
          stateOf(session: unknown, key: string) {
            seen.push({ session, key })
            return [{ status: 'pending' }, { status: 'completed' }]
          },
        }
      },
    }
    expect(readTodosProjection(ctx, SESSION)).toEqual([{ status: 'pending' }, { status: 'completed' }])
    expect(seen).toEqual([{ session: SESSION, key: SESSION_NOTIFICATION_TODOS_PROJECTION_KEY }])
    expect(SESSION_NOTIFICATION_TODOS_PROJECTION_KEY).toBe('todos')
  })

  it('② an absent service / method / key degrades to undefined instead of throwing', () => {
    expect(readTodosProjection({}, SESSION)).toBeUndefined()
    expect(readTodosProjection({ get: () => undefined }, SESSION)).toBeUndefined()
    expect(readTodosProjection({ get: () => ({}) }, SESSION)).toBeUndefined()
    expect(readTodosProjection({ get: () => ({ stateOf: 42 }) }, SESSION)).toBeUndefined()
    expect(readTodosProjection({ get: () => ({ stateOf: () => null }) }, SESSION)).toBeUndefined()
    expect(readTodosProjection({ get: () => ({ stateOf: () => 'nope' }) }, SESSION)).toBeUndefined()
    // A malformed ITEM poisons the whole snapshot (read leaf fields only).
    expect(readTodosProjection({ get: () => ({ stateOf: () => [{ status: 1 }] }) }, SESSION)).toBeUndefined()
  })

  it('③ the reader is what the listener wires as its todo source', async () => {
    const ctx = { get: () => ({ stateOf: () => [{ status: 'pending' }] }) }
    const h = harness({ readTodos: (session) => readTodosProjection(ctx, session) })
    // With a pending todo and the default gate, the completion is suppressed —
    // which is the proof the reader's value reached the gate.
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    expect(h.sent).toEqual([])
  })
})

describe('P3-T12 session-notification — registrar wiring', () => {
  /** A fake cordis context recording `ctx.on` (same shape as the sibling suites). */
  function fakeContext(): {
    ctx: HooksRegistrationContext
    onCalls: Array<{ event: string; listener: (...args: readonly unknown[]) => unknown }>
  } {
    const onCalls: Array<{ event: string; listener: (...args: readonly unknown[]) => unknown }> = []
    return {
      ctx: {
        on(event, listener) {
          onCalls.push({ event, listener })
          return () => {}
        },
      },
      onCalls,
    }
  }

  it('① registers the manifest event AND the auxiliary status event, and returns a disposer', () => {
    const { ctx, onCalls } = fakeContext()
    const row = notificationRow()
    const disposer = registerSessionNotification(ctx, row)
    expect(row.event).toBe(SESSION_NOTIFICATION_EVENT)
    expect(onCalls.map((call) => call.event)).toEqual([
      SESSION_NOTIFICATION_EVENT,
      SESSION_NOTIFICATION_STATUS_EVENT,
    ])
    expect(typeof disposer).toBe('function')
    expect(() => (disposer as () => void)()).not.toThrow()
  })

  it('② the wired listeners are alive: a session/event drives the state machine', () => {
    const { ctx, onCalls } = fakeContext()
    const disposer = registerSessionNotification(ctx, notificationRow())
    const sessionEvent = onCalls.find((call) => call.event === SESSION_NOTIFICATION_EVENT)?.listener
    const statusEvent = onCalls.find((call) => call.event === SESSION_NOTIFICATION_STATUS_EVENT)?.listener
    expect(typeof sessionEvent).toBe('function')
    expect(typeof statusEvent).toBe('function')
    // The registrar wires the REAL backend/clock, so this test only proves the
    // plumbing: no throw, no real notification timer armed (the synthetic session
    // never produced work), and the disposer is what the loop will register.
    expect(() => {
      sessionEvent?.({ id: 'x' }, turnStart())
      sessionEvent?.({ id: 'x' }, stepEnd())
      statusEvent?.({ agent: { session: { id: 'x' } }, status: 'idle' })
    }).not.toThrow()
    expect(() => (disposer as () => void)()).not.toThrow()
  })

  it('③ a context without `get` still registers (the services are optional)', () => {
    const { ctx } = fakeContext()
    expect(() => registerSessionNotification(ctx, notificationRow())).not.toThrow()
  })

  it('④ the config defaults are upstream\'s, with only the identity string rewritten', () => {
    expect(DEFAULT_SESSION_NOTIFICATION_CONFIG).toEqual({
      baseTitle: 'oh-my-opendsh',
      baseMessage: 'Agent is ready for input',
      errorMessage: 'Agent stopped with an error',
      idleConfirmationDelay: 1500,
      skipIfIncompleteTodos: true,
      activityGracePeriodMs: 100,
    })
  })

  it('⑤ the harness really used an injected backend (the injectability requirement)', async () => {
    const spy = vi.fn(async () => {})
    const h = harness({ backend: { platform: 'darwin', notify: spy } })
    h.listener.onSessionEvent(SESSION, turnStart())
    h.listener.onSessionEvent(SESSION, stepEnd())
    h.listener.onSessionEvent(SESSION, turnEnd('completed'))
    await h.fireTimers()
    expect(spy).toHaveBeenCalledWith('oh-my-opendsh', 'Agent is ready for input')
  })
})
