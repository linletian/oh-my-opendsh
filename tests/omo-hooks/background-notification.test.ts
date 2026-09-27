// P3-T12 — background-notification listener (plan §4.2 pattern F; task book
// WP-5). The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/background-notification/ @ v4.19.4:
//
//   upstream  a thin adapter: forward whitelisted opencode events to
//             `BackgroundManager.handleEvent` + inject pending notifications into
//             `chat.message`'s `output.parts`
//   this port observes the DSH job lifecycle directly: `ctx.jobs.onJobDone`
//             (the PUSH surface — the prerequisite answer, verbatim, is in the
//             module header) and, when that subscription is unavailable, a
//             `session/event` turn/end pull over `ctx.jobs.list()`
//
// Two findings these tests pin, both of which decide the port's shape:
//   * the MODEL-FACING half upstream injects is natively covered by DSH
//     (`dsh-tool-jobs/lib/index.js:206-224` injects the completion notice into
//     the owner) → NOT ported, so this listener must never touch the model;
//   * `snapshot.reported === true` already means "a kill, read, wait, or a
//     teardown cancel has reported or committed to report the terminal state"
//     (dsh-jobs types.d.ts), so it suppresses the OS notification. This port
//     mirrors the native reporter's `reported` half and NOT its
//     `owner === undefined` half. Behavioural consequence: DSH's native
//     reporter wakes an OWNED job's agent with a model notice, while this port
//     additionally pops the OS notification for that same owned settlement —
//     the OS layer is the half DSH has no notification package for, and the
//     `reported` gate is what keeps a user-collected job from popping twice
//     (dsh-tool-jobs/lib/index.js:206-207; the module header's REPORTED-JOB
//     GATE records the narrowing).
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  BACKGROUND_FAILURE_PREFIX,
  BACKGROUND_LOG_PREFIX,
  BACKGROUND_NOTE_ABSENT,
  BACKGROUND_NOTE_DEFERRED,
  BACKGROUND_NOTE_PREFIX,
  BACKGROUND_NOTE_PULL_ONLY,
  BACKGROUND_NOTE_SUBSCRIBED,
  BACKGROUND_NOTIFICATION_EVENT,
  BACKGROUND_NOTIFICATION_ID,
  TERMINAL_JOB_STATUSES,
  buildJobNotificationContent,
  createBackgroundNotificationListener,
  formatBackgroundNotificationFailureLine,
  formatBackgroundNotificationLine,
  formatBackgroundNotificationNoteLine,
  readJobsService,
  registerBackgroundNotification,
  shouldNotifyForJob,
  toJobSnapshot,
  type JobsSurface,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/background-notification.ts'
import type { NotifierBackend } from '../../patches/omo-dsh/omo-hooks/src/hooks/session-notification.ts'

/**
 * F2 (PR #9 review) — this suite must NEVER touch the host desktop-notification
 * system. `registerBackgroundNotification` wires the REAL platform backend with
 * the REAL `runCommandViaExecFile` (background-notification.ts:661-665), so the
 * registrar wiring tests would exec `notify-send`/`osascript`. On the official
 * CI runner that binary is absent and production records
 * `spawn notify-send ENOENT` as a warn, which made the "no warn" assertion red
 * at the exact head (both green-set runs); on a developer machine it really
 * popped a desktop notification. Neither belongs in a unit gate.
 *
 * PRODUCTION CODE IS NOT CHANGED (the review requires that). The runner is
 * replaced at the module boundary instead — the same seam
 * `createPlatformNotifierBackend` already takes as a constructor argument
 * (`{ run }`), reached through the module the registrar imports it from.
 * Everything else stays real: the registrar, the platform dispatch, the
 * listener, the argv builder, the whole notification pipeline.
 */
const runnerSpy = vi.hoisted(() => ({
  /** Every command the production runner WOULD have spawned. */
  calls: [] as Array<{ command: string; args: readonly string[] }>,
}))

vi.mock('../../patches/omo-dsh/omo-hooks/src/hooks/session-notification.ts', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../patches/omo-dsh/omo-hooks/src/hooks/session-notification.ts')
  >()
  return {
    ...actual,
    runCommandViaExecFile: async (command: string, args: readonly string[]): Promise<void> => {
      runnerSpy.calls.push({ command, args: [...args] })
    },
  }
})

/** Each case starts with an empty spawn ledger (the mock is file-wide). */
beforeEach(() => {
  runnerSpy.calls.length = 0
})

/** One synthetic `JobSnapshot` (the leaf fields the listener reads). */
interface FakeJob {
  id: string
  kind: string
  label: string
  status: string
  detail?: string
  reported: boolean
}

function job(overrides: Partial<FakeJob> = {}): FakeJob {
  return {
    id: 'bash-1',
    kind: 'bash',
    label: 'pnpm vitest run',
    status: 'completed',
    reported: false,
    ...overrides,
  }
}

/** Drains the microtask queue so an awaited dispatch settles. */
function drainMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

/**
 * The deterministic harness: a recording backend, a recording log and an
 * injectable `ctx.jobs` face. `jobs` is optional on purpose — "no jobs service"
 * is one of the two paths under test.
 */
function harness(overrides: { jobs?: JobsSurface; backend?: NotifierBackend | undefined } = {}) {
  const lines: string[] = []
  const failures: string[] = []
  const timeline: string[] = []
  const sent: Array<{ title: string; body: string }> = []
  const backend: NotifierBackend | undefined = 'backend' in overrides
    ? overrides.backend
    : {
        platform: 'linux',
        async notify(title: string, body: string) {
          sent.push({ title, body })
          timeline.push(`notify:${title}`)
        },
      }
  const listener = createBackgroundNotificationListener({
    backend,
    jobs: overrides.jobs,
    log: (line) => {
      lines.push(line)
      timeline.push(`log:${line}`)
    },
    logFailure: (line) => {
      failures.push(line)
    },
  })
  return { listener, lines, failures, timeline, sent }
}

/** The real manifest row — the registrar must read its event from the row. */
function backgroundRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === BACKGROUND_NOTIFICATION_ID)
  if (row === undefined) throw new Error('manifest is missing the background-notification row')
  return row
}

const TURN_END = { type: 'turn/end', seq: 3, time: 0, data: { turn: 1, reason: { kind: 'completed' } } }

describe('P3-T12 background-notification — the jobs prerequisite answer', () => {
  it('① readJobsService reads ctx.get("jobs") and degrades to undefined', () => {
    const jobs: JobsSurface = { onJobDone: () => () => {} }
    expect(readJobsService({ get: () => jobs })).toBe(jobs)
    expect(readJobsService({ get: () => undefined })).toBeUndefined()
    expect(readJobsService({ get: () => 'not-a-service' })).toBeUndefined()
    expect(readJobsService({})).toBeUndefined()
  })

  it('② toJobSnapshot copies leaf fields only, and rejects anything malformed', () => {
    expect(toJobSnapshot(job())).toEqual({
      id: 'bash-1',
      kind: 'bash',
      label: 'pnpm vitest run',
      status: 'completed',
      reported: false,
    })
    expect(toJobSnapshot(job({ detail: 'exit code: 0' }))?.detail).toBe('exit code: 0')
    expect(toJobSnapshot(job({ reported: true }))?.reported).toBe(true)
    // A missing `reported` is treated as NOT reported (fail towards notifying).
    expect(toJobSnapshot({ id: 'x', kind: 'bash', label: 'l', status: 'completed' })?.reported).toBe(false)
    expect(toJobSnapshot(undefined)).toBeUndefined()
    expect(toJobSnapshot(null)).toBeUndefined()
    expect(toJobSnapshot('bash-1')).toBeUndefined()
    expect(toJobSnapshot({ ...job(), id: '' })).toBeUndefined()
    expect(toJobSnapshot({ ...job(), id: 7 })).toBeUndefined()
    expect(toJobSnapshot({ ...job(), kind: undefined })).toBeUndefined()
    expect(toJobSnapshot({ ...job(), label: undefined })).toBeUndefined()
    expect(toJobSnapshot({ ...job(), status: undefined })).toBeUndefined()
  })

  it('③ shouldNotifyForJob requires a terminal, not-yet-reported settlement', () => {
    expect(TERMINAL_JOB_STATUSES).toEqual(['completed', 'killed', 'failed'])
    for (const status of TERMINAL_JOB_STATUSES) {
      expect(shouldNotifyForJob({ ...job(), status, reported: false } as never)).toBe(true)
      // `reported` = "a kill, a read, a wait or a teardown cancel already told
      // someone" (dsh-jobs types.d.ts) ⇒ no second notification.
      expect(shouldNotifyForJob({ ...job(), status, reported: true } as never)).toBe(false)
    }
    expect(shouldNotifyForJob({ ...job(), status: 'running' } as never)).toBe(false)
    expect(shouldNotifyForJob({ ...job(), status: 'stopping' } as never)).toBe(false)
  })

  it('④ the notification content and the anchor line are pinned', () => {
    expect(buildJobNotificationContent(job())).toEqual({
      title: 'oh-my-opendsh',
      body: 'Background bash job bash-1 finished: completed\npnpm vitest run',
    })
    expect(buildJobNotificationContent(job({ detail: 'exit code: 3' })).body).toBe(
      'Background bash job bash-1 finished: completed\npnpm vitest run\nexit code: 3',
    )
    expect(formatBackgroundNotificationLine('completed', 'pnpm vitest run')).toBe(
      '[omo-hooks] background-notification: completed pnpm vitest run',
    )
    expect(formatBackgroundNotificationFailureLine('x failed', new Error('boom'))).toBe(
      '[omo-hooks] background-notification FAILED: x failed: Error: boom',
    )
    expect(BACKGROUND_LOG_PREFIX).toBe('[omo-hooks] background-notification: ')
    expect(BACKGROUND_FAILURE_PREFIX).toBe('[omo-hooks] background-notification FAILED: ')
    // Never shaped like a boot registration failure (the probe fails a boot on
    // `[omo-hooks] hook .* FAILED`).
    expect(
      formatBackgroundNotificationFailureLine('x failed', 'plain').startsWith('[omo-hooks] hook '),
    ).toBe(false)
  })

  it('⑤ the NOTE prefix is NOT the anchor prefix (a note must never count as a notification)', () => {
    // The e2e session/background scenarios count anchor lines with
    // `/\[omo-hooks\] background-notification: (\S+) (.+)/` and
    // `startsWith('[omo-hooks] background-notification: ')`. A deferred-
    // acquisition note written with the anchor prefix would be counted as a
    // dispatched notification and break the exactly-once claim, so the two
    // grammars are pinned apart here.
    expect(BACKGROUND_NOTE_PREFIX).toBe('[omo-hooks] background-notification NOTE: ')
    expect(BACKGROUND_NOTE_PREFIX.startsWith(BACKGROUND_LOG_PREFIX)).toBe(false)
    for (const text of [
      formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_DEFERRED),
      formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_SUBSCRIBED),
      formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_PULL_ONLY),
      formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_ABSENT),
    ]) {
      expect(text.startsWith(BACKGROUND_LOG_PREFIX)).toBe(false)
      expect(text.startsWith(BACKGROUND_FAILURE_PREFIX)).toBe(false)
      expect(/\[omo-hooks\] background-notification: (\S+) (.+)/.test(text)).toBe(false)
      expect(text.startsWith('[omo-hooks] hook ')).toBe(false)
    }
  })
})

describe('P3-T12 background-notification — path 1: the ctx.jobs.onJobDone PUSH surface', () => {
  it('① a settlement notifies once, anchor before command', async () => {
    const h = harness({ jobs: { onJobDone: () => () => {} } })
    expect(h.listener.hasPushSurface()).toBe(true)
    h.listener.onJobDone(job(), undefined)
    await drainMicrotasks()
    expect(h.sent).toEqual([
      {
        title: 'oh-my-opendsh',
        body: 'Background bash job bash-1 finished: completed\npnpm vitest run',
      },
    ])
    expect(h.lines).toEqual([
      '[omo-hooks] background-notification: completed pnpm vitest run',
    ])
    expect(h.timeline).toEqual([
      'log:[omo-hooks] background-notification: completed pnpm vitest run',
      'notify:oh-my-opendsh',
    ])
  })

  it('② the owner is ignored (no live Agent is retained)', async () => {
    const h = harness({ jobs: { onJobDone: () => () => {} } })
    const owner = { session: { id: 'ses_1' }, status: 'idle' }
    h.listener.onJobDone(job(), owner)
    await drainMicrotasks()
    expect(h.sent).toHaveLength(1)
    expect(h.failures).toEqual([])
  })

  it('③ terminal-but-reported / still-running settlements are silent', async () => {
    const h = harness({ jobs: { onJobDone: () => () => {} } })
    h.listener.onJobDone(job({ reported: true }), undefined)
    h.listener.onJobDone(job({ id: 'bash-2', status: 'running' }), undefined)
    h.listener.onJobDone(job({ id: 'bash-3', status: 'stopping' }), undefined)
    await drainMicrotasks()
    expect(h.sent).toEqual([])
    expect(h.lines).toEqual([])
  })

  it('④ one job id notifies at most once, whatever the surface repeats', async () => {
    const h = harness({ jobs: { onJobDone: () => () => {} } })
    h.listener.onJobDone(job(), undefined)
    h.listener.onJobDone(job(), undefined)
    await drainMicrotasks()
    expect(h.sent).toHaveLength(1)
  })

  it('⑤ different job ids each notify', async () => {
    const h = harness({ jobs: { onJobDone: () => () => {} } })
    h.listener.onJobDone(job(), undefined)
    h.listener.onJobDone(job({ id: 'bash-2', kind: 'subagent', label: 'explore' }), undefined)
    await drainMicrotasks()
    expect(h.sent).toHaveLength(2)
    expect(h.lines).toEqual([
      '[omo-hooks] background-notification: completed pnpm vitest run',
      '[omo-hooks] background-notification: completed explore',
    ])
  })

  it('⑥ the pull path STANDS DOWN while the push surface is live (no double notification)', async () => {
    const list = vi.fn(() => [job()])
    const h = harness({ jobs: { onJobDone: () => () => {}, list } })
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    // The degraded path is a FALLBACK: it must not even read the registry.
    expect(list).not.toHaveBeenCalled()
    expect(h.sent).toEqual([])
  })

  it('⑦ malformed settlements never throw', () => {
    const h = harness({ jobs: { onJobDone: () => () => {} } })
    expect(() => {
      h.listener.onJobDone(undefined, undefined)
      h.listener.onJobDone({}, undefined)
      h.listener.onJobDone('bash-1', undefined)
    }).not.toThrow()
    expect(h.failures).toEqual([])
  })
})

describe('P3-T12 background-notification — path 2: the DEGRADED pull over jobs.list()', () => {
  it('① without onJobDone, a turn/end scans list() and notifies terminal unreported jobs', async () => {
    const list = vi.fn(() => [job(), job({ id: 'bash-2', status: 'running' }), job({ id: 'bash-3', reported: true })])
    const h = harness({ jobs: { list } })
    expect(h.listener.hasPushSurface()).toBe(false)
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(list).toHaveBeenCalledTimes(1)
    // No caller: the degraded vantage sees unowned jobs only (the header's
    // PREREQUISITE ANSWER records why).
    expect(list.mock.calls[0]).toEqual([])
    expect(h.sent).toHaveLength(1)
    expect(h.lines).toEqual(['[omo-hooks] background-notification: completed pnpm vitest run'])
  })

  it('② the pull path dedups across repeated turn/end scans', async () => {
    const h = harness({ jobs: { list: () => [job()] } })
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(h.sent).toHaveLength(1)
  })

  it('③ only turn/end drives the pull path, and it is reason-agnostic', async () => {
    const list = vi.fn(() => [job()])
    const h = harness({ jobs: { list } })
    for (const type of ['turn/start', 'step/end', 'assistant/message', 'user/message', 'session/start']) {
      h.listener.onSessionEvent({ id: 'ses_1' }, { type, data: {} })
    }
    h.listener.onSessionEvent({ id: 'ses_1' }, undefined)
    await drainMicrotasks()
    expect(list).not.toHaveBeenCalled()
    expect(h.sent).toEqual([])
    // A turn/end is only a "read the registry now" CHECKPOINT: the job lifecycle
    // is authoritative, not the turn's reason, so an aborted or reason-less
    // turn/end still lets a settled job be announced.
    h.listener.onSessionEvent({ id: 'ses_1' }, { type: 'turn/end', data: {} })
    h.listener.onSessionEvent({ id: 'ses_1' }, { type: 'turn/end', data: { reason: { kind: 'error' } } })
    await drainMicrotasks()
    expect(list).toHaveBeenCalledTimes(2)
    expect(h.sent).toHaveLength(1)
  })

  it('④ no jobs service at all means no notification and no throw', async () => {
    const h = harness()
    expect(h.listener.hasPushSurface()).toBe(false)
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(h.sent).toEqual([])
    expect(h.failures).toEqual([])
  })

  it('⑤ a jobs face with only onJobDone (no list) degrades to nothing, not a throw', async () => {
    const h = harness({ jobs: { onJobDone: () => () => {} } })
    // hasPushSurface is true, so the pull path is inert by design; force the
    // degenerate case through a jobs face with neither member.
    const bare = harness({ jobs: {} })
    expect(bare.listener.hasPushSurface()).toBe(false)
    bare.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(bare.sent).toEqual([])
    expect(bare.failures).toEqual([])
    expect(h.listener.hasPushSurface()).toBe(true)
  })

  it('⑥ a throwing list() is a log line, never an exception', async () => {
    const h = harness({
      jobs: {
        list: () => {
          throw new Error('registry gone')
        },
      },
    })
    expect(() => h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)).not.toThrow()
    await drainMicrotasks()
    expect(h.failures).toEqual([
      '[omo-hooks] background-notification FAILED: session event observer failed: Error: registry gone',
    ])
  })

  it('⑦ a non-array list() result is ignored', async () => {
    const h = harness({ jobs: { list: (() => 'nope') as unknown as JobsSurface['list'] } })
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(h.sent).toEqual([])
    expect(h.failures).toEqual([])
  })

  it('⑧ attachJobsSurface/setPushSurfaceLive adopt a LATE service (the deferred path)', async () => {
    // P3-T13: the registrar can no longer hand the service to the constructor
    // (the loader creates the jobs row concurrently with this plugin, so the
    // strict `ctx.get` read is usually empty at apply). These two mutators are
    // how the deferred acquisition lands, and the pull/push verdict must follow
    // them exactly.
    const h = harness() // no jobs face at construction
    expect(h.listener.hasPushSurface()).toBe(false)
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(h.sent).toEqual([])

    const list = vi.fn(() => [job()])
    h.listener.attachJobsSurface({ onJobDone: () => () => {}, list })
    // Adopting the READ face alone does not make the push channel live: until
    // the subscription really succeeded, the degraded path is what works.
    expect(h.listener.hasPushSurface()).toBe(false)
    h.listener.setPushSurfaceLive(true)
    expect(h.listener.hasPushSurface()).toBe(true)
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(list).not.toHaveBeenCalled()
    expect(h.sent).toEqual([])

    // ... and when the subscription is gone again, the pull path resumes over
    // the adopted face.
    h.listener.setPushSurfaceLive(false)
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(list).toHaveBeenCalledTimes(1)
    expect(h.sent).toHaveLength(1)
  })
})

describe('P3-T12 background-notification — fail-open behaviour (discipline ②)', () => {
  it('① a rejected backend is swallowed and logged, and the anchor precedes the command', async () => {
    const h = harness({
      jobs: { onJobDone: () => () => {} },
      backend: {
        platform: 'linux',
        notify: async () => {
          // Recorded from INSIDE the command so the ordering claim is about the
          // real dispatch point, not about a harness-side assumption.
          h.timeline.push('notify:oh-my-opendsh')
          throw new Error('notify-send missing')
        },
      },
    })
    h.listener.onJobDone(job(), undefined)
    await drainMicrotasks()
    expect(h.lines).toEqual(['[omo-hooks] background-notification: completed pnpm vitest run'])
    expect(h.failures).toEqual([
      '[omo-hooks] background-notification FAILED: notification dispatch failed: Error: notify-send missing',
    ])
    // The command really was ATTEMPTED, and the anchor was logged BEFORE it —
    // the same carrier rule the sibling module's anchor test pins (the CI box
    // has no notification daemon, so the anchor is the only durable evidence).
    expect(h.timeline).toEqual([
      'log:[omo-hooks] background-notification: completed pnpm vitest run',
      'notify:oh-my-opendsh',
    ])
  })

  it('② no backend on this platform means no notification AND no anchor', async () => {
    const h = harness({ jobs: { onJobDone: () => () => {} }, backend: undefined })
    h.listener.onJobDone(job(), undefined)
    await drainMicrotasks()
    expect(h.sent).toEqual([])
    expect(h.lines).toEqual([])
  })

  it('③ a throwing log sink cannot break a settlement commit', async () => {
    const listener = createBackgroundNotificationListener({
      backend: {
        platform: 'linux',
        notify: async () => {},
      },
      jobs: { onJobDone: () => () => {} },
      log: () => {
        throw new Error('stdout closed')
      },
      logFailure: () => {
        throw new Error('stderr closed')
      },
    })
    expect(() => listener.onJobDone(job(), undefined)).not.toThrow()
    await drainMicrotasks()
  })
})

describe('P3-T12 background-notification — registrar wiring', () => {
  /** A fake context recording `ctx.on` plus the `ctx.get` service lookup. */
  function fakeContext(jobs?: JobsSurface): {
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
        get(name) {
          return name === 'jobs' ? jobs : undefined
        },
      },
      onCalls,
    }
  }

  it('① with the push surface: registers the manifest event AND subscribes, returning its disposer', () => {
    const unsubscribed: number[] = []
    const subscribed: Array<(snapshot: unknown, owner: unknown) => void> = []
    const jobs: JobsSurface = {
      onJobDone(listener) {
        subscribed.push(listener as (snapshot: unknown, owner: unknown) => void)
        return () => {
          unsubscribed.push(1)
        }
      },
    }
    const { ctx, onCalls } = fakeContext(jobs)
    const row = backgroundRow()
    const disposer = registerBackgroundNotification(ctx, row)
    expect(row.event).toBe(BACKGROUND_NOTIFICATION_EVENT)
    expect(onCalls.map((call) => call.event)).toEqual([BACKGROUND_NOTIFICATION_EVENT])
    expect(subscribed).toHaveLength(1)
    expect(typeof disposer).toBe('function')
    // The disposer is the job subscription's own unregister, handed to the loop
    // for `ctx.effect` — forwarding it must not invoke it here.
    expect(unsubscribed).toEqual([])
    ;(disposer as () => void)()
    expect(unsubscribed).toEqual([1])
  })

  it('② without the jobs service: registers the manifest event, returns no disposer', () => {
    const { ctx, onCalls } = fakeContext(undefined)
    const disposer = registerBackgroundNotification(ctx, backgroundRow())
    expect(onCalls.map((call) => call.event)).toEqual([BACKGROUND_NOTIFICATION_EVENT])
    expect(disposer).toBeUndefined()
  })

  it('③ a jobs face without onJobDone: manifest event only, no subscription, no throw', () => {
    const { ctx, onCalls } = fakeContext({ list: () => [] })
    const disposer = registerBackgroundNotification(ctx, backgroundRow())
    expect(onCalls.map((call) => call.event)).toEqual([BACKGROUND_NOTIFICATION_EVENT])
    expect(disposer).toBeUndefined()
  })

  it('④ a throwing subscription is a log line, not a registration failure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { ctx, onCalls } = fakeContext({
        onJobDone: () => {
          throw new Error('service disposed')
        },
      })
      const disposer = registerBackgroundNotification(ctx, backgroundRow())
      expect(disposer).toBeUndefined()
      // The manifest event is still registered: the degraded path survives.
      expect(onCalls.map((call) => call.event)).toEqual([BACKGROUND_NOTIFICATION_EVENT])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toBe(
        '[omo-hooks] background-notification FAILED: jobs.onJobDone subscribe failed: Error: service disposed',
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('⑤ the wired session/event listener drives the degraded path end to end', async () => {
    const list = vi.fn(() => [job()])
    const { ctx, onCalls } = fakeContext({ list })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      registerBackgroundNotification(ctx, backgroundRow())
      const sessionEvent = onCalls[0].listener
      sessionEvent({ id: 'ses_1' }, TURN_END)
      await drainMicrotasks()
      expect(list).toHaveBeenCalledTimes(1)
      // The registrar builds its backend from the REAL `process.platform`, so a
      // platform with no ported backend (win32 per D9, or an unsupported OS)
      // emits no anchor BY DESIGN — both branches are asserted, so this stays a
      // real assertion everywhere instead of pinning the CI platform.
      const backendExists = process.platform === 'linux' || process.platform === 'darwin'
      expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
        // P3-T13: a context WITHOUT `ctx.inject` can never defer, so the
        // registrar records the degraded capability with its NOTE line before
        // the pull path is exercised below.
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_PULL_ONLY),
        ...(backendExists ? ['[omo-hooks] background-notification: completed pnpm vitest run'] : []),
      ])
      // F2: the dispatch is now driven by the INJECTED runner (the module mock
      // above), so "no warn" is a statement about the pipeline, not about
      // whether this host happens to have `notify-send` installed.
      expect(warnSpy).not.toHaveBeenCalled()
      if (backendExists) {
        // The REAL backend and REAL argv builder ran; only the OS spawn is
        // replaced. This is what keeps the registrar wiring genuinely covered.
        expect(runnerSpy.calls).toHaveLength(1)
        expect(runnerSpy.calls[0]!.command).toBe(
          process.platform === 'linux' ? 'notify-send' : 'osascript',
        )
        expect(runnerSpy.calls[0]!.args.length).toBeGreaterThan(0)
      } else {
        expect(runnerSpy.calls).toHaveLength(0)
      }
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})

describe('P3-T13 background-notification — the DEFERRED acquisition (ctx.inject(["jobs"]))', () => {
  /**
   * A fake context with the cordis deferred form. `inject` records the callback
   * instead of running it, which is exactly what cordis does while the service
   * is not (yet) available; the test then calls it to model the service
   * appearing. `get` returns whatever the test's current "strict read" would.
   */
  function deferredContext(initialJobs?: JobsSurface): {
    ctx: HooksRegistrationContext
    onCalls: Array<{ event: string; listener: (...args: readonly unknown[]) => unknown }>
    injectCalls: Array<(injected: { jobs?: unknown }) => unknown>
    setStrictRead(jobs: JobsSurface | undefined): void
  } {
    const onCalls: Array<{ event: string; listener: (...args: readonly unknown[]) => unknown }> = []
    const injectCalls: Array<(injected: { jobs?: unknown }) => unknown> = []
    let strictRead = initialJobs
    return {
      ctx: {
        on(event, listener) {
          onCalls.push({ event, listener })
          return () => {}
        },
        get(name) {
          return name === 'jobs' ? strictRead : undefined
        },
        inject(deps, callback) {
          expect(deps).toEqual(['jobs'])
          injectCalls.push(callback as (injected: { jobs?: unknown }) => unknown)
          return { uid: 1 }
        },
      },
      onCalls,
      injectCalls,
      setStrictRead(jobs) {
        strictRead = jobs
      },
    }
  }

  it('① registers the manifest event immediately and defers the push subscription', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { ctx, onCalls, injectCalls } = deferredContext(undefined)
      const disposer = registerBackgroundNotification(ctx, backgroundRow())
      // The row's primary surface is registered SYNCHRONOUSLY: the boot marker
      // must stay true, and no other hook may wait for jobs (P3-T13).
      expect(onCalls.map((call) => call.event)).toEqual([BACKGROUND_NOTIFICATION_EVENT])
      expect(injectCalls).toHaveLength(1)
      // Nothing is subscribed yet, and nothing is returned for ctx.effect (the
      // injected child fiber owns the deferred subscription).
      expect(disposer).toBeUndefined()
      expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_DEFERRED),
      ])
    } finally {
      logSpy.mockRestore()
    }
  })

  it('② the inject callback subscribes, turns the push path live, and the anchor fires', async () => {
    const subscribed: Array<(snapshot: unknown, owner: unknown) => void> = []
    const list = vi.fn(() => [job()])
    const jobs: JobsSurface = {
      onJobDone(listener) {
        subscribed.push(listener as (snapshot: unknown, owner: unknown) => void)
        return () => {}
      },
      list,
    }
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { ctx, onCalls, injectCalls } = deferredContext(undefined)
      registerBackgroundNotification(ctx, backgroundRow())
      expect(subscribed).toEqual([])

      // The service appears: cordis runs the deferred callback with the
      // injected context (the shipped session controller reads `jobsCtx.jobs`
      // the same way).
      const returned = injectCalls[0]({ jobs })
      expect(subscribed).toHaveLength(1)
      expect(typeof returned).toBe('function')
      expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_DEFERRED),
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_SUBSCRIBED),
      ])

      // The push channel really delivers: one settlement -> one anchor.
      subscribed[0](job({ id: 'subagent-1', kind: 'subagent', label: 'explore' }), undefined)
      await drainMicrotasks()
      const backendExists = process.platform === 'linux' || process.platform === 'darwin'
      if (backendExists) {
        expect(logSpy.mock.calls.map((call) => call[0])).toContain(
          '[omo-hooks] background-notification: completed explore',
        )
      }

      // ... and the pull path stands down while it is live.
      onCalls[0].listener({ id: 'ses_1' }, TURN_END)
      await drainMicrotasks()
      expect(list).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
    }
  })

  it('③ the callback\'s returned disposer unsubscribes and lets the pull path resume', async () => {
    const unsubscribed: number[] = []
    const list = vi.fn(() => [job()])
    const jobs: JobsSurface = {
      onJobDone() {
        return () => {
          unsubscribed.push(1)
        }
      },
      list,
    }
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { ctx, onCalls, injectCalls } = deferredContext(undefined)
      registerBackgroundNotification(ctx, backgroundRow())
      const disposer = injectCalls[0]({ jobs }) as () => void
      expect(unsubscribed).toEqual([])
      // Cordis collects the returned function as the injected fiber's disposal —
      // it must not run at hand-over time.
      disposer()
      expect(unsubscribed).toEqual([1])
      // The push channel is gone: the degraded read face is live again.
      onCalls[0].listener({ id: 'ses_1' }, TURN_END)
      await drainMicrotasks()
      expect(list).toHaveBeenCalledTimes(1)
    } finally {
      logSpy.mockRestore()
    }
  })

  it('④ a late pull-only face logs the pull-only note and serves the degraded path', async () => {
    const list = vi.fn(() => [job()])
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { ctx, onCalls, injectCalls } = deferredContext(undefined)
      registerBackgroundNotification(ctx, backgroundRow())
      const returned = injectCalls[0]({ jobs: { list } })
      expect(returned).toBeUndefined()
      expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_DEFERRED),
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_PULL_ONLY),
      ])
      onCalls[0].listener({ id: 'ses_1' }, TURN_END)
      await drainMicrotasks()
      expect(list).toHaveBeenCalledTimes(1)
    } finally {
      logSpy.mockRestore()
    }
  })

  it('⑤ an injected context without a jobs face is recorded, never thrown', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { ctx, injectCalls } = deferredContext(undefined)
      registerBackgroundNotification(ctx, backgroundRow())
      expect(() => injectCalls[0]({})).not.toThrow()
      expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_DEFERRED),
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_ABSENT),
      ])
    } finally {
      logSpy.mockRestore()
    }
  })

  it('⑥ a throwing deferred subscription is a FAILED line and the pull path still works', async () => {
    const list = vi.fn(() => [job()])
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { ctx, onCalls, injectCalls } = deferredContext(undefined)
      registerBackgroundNotification(ctx, backgroundRow())
      const jobs: JobsSurface = {
        onJobDone: () => {
          throw new Error('service disposed')
        },
        list,
      }
      expect(() => injectCalls[0]({ jobs })).not.toThrow()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(String(warnSpy.mock.calls[0][0])).toBe(
        '[omo-hooks] background-notification FAILED: jobs.onJobDone subscribe failed: Error: service disposed',
      )
      // No `subscribed` note (the subscription never landed) and no anchor-shaped
      // line; the pull path is live over the adopted face.
      expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_DEFERRED),
      ])
      onCalls[0].listener({ id: 'ses_1' }, TURN_END)
      await drainMicrotasks()
      expect(list).toHaveBeenCalledTimes(1)
    } finally {
      warnSpy.mockRestore()
      logSpy.mockRestore()
    }
  })

  it('⑦ without ctx.inject, the jobs absence is recorded and the manifest event still registers', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const events: string[] = []
      // No `inject` member at all: the structural fake of a minimal host.
      const disposer = registerBackgroundNotification(
        {
          on(event) {
            events.push(event)
            return () => {}
          },
          get: () => undefined,
        },
        backgroundRow(),
      )
      expect(events).toEqual([BACKGROUND_NOTIFICATION_EVENT])
      expect(disposer).toBeUndefined()
      expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_ABSENT),
      ])
    } finally {
      logSpy.mockRestore()
    }
  })

  it('⑧ an ALREADY-active jobs face is adopted immediately (no inject child, same disposer contract)', () => {
    const unsubscribed: number[] = []
    const subscribed: unknown[] = []
    const jobs: JobsSurface = {
      onJobDone(listener) {
        subscribed.push(listener)
        return () => {
          unsubscribed.push(1)
        }
      },
    }
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { ctx, injectCalls } = deferredContext(jobs)
      const disposer = registerBackgroundNotification(ctx, backgroundRow())
      expect(subscribed).toHaveLength(1)
      // The fast path must NOT also arm the inject child, or one settlement
      // would be delivered twice.
      expect(injectCalls).toEqual([])
      expect(logSpy.mock.calls).toEqual([])
      expect(typeof disposer).toBe('function')
      expect(unsubscribed).toEqual([])
      ;(disposer as () => void)()
      expect(unsubscribed).toEqual([1])
    } finally {
      logSpy.mockRestore()
    }
  })

  it('⑨ the PLUGIN declares no hard `inject` — only this registrar defers', async () => {
    // The task book's hard prohibition: "禁止把整个插件改成 inject: ['jobs']
    // 硬等待（其他 hook 不应被连坐）". Cordis reads a plugin's static `inject`
    // from the loaded module object (`Inject.resolve(plugin.inject)`,
    // cordis/lib/index.js:1634), so a module-level `inject` export WOULD gate
    // every hook in the roster behind the optional jobs service. The plugin
    // module must therefore carry no such export — the deferred child fiber
    // this registrar arms is the only thing that waits.
    const mod = await import('../../patches/omo-dsh/omo-hooks/src/index.ts')
    expect('inject' in mod).toBe(false)
    expect(Object.keys(mod)).not.toContain('inject')
  })
})
