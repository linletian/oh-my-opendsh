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
//   * `snapshot.reported === true` already means "another reporter told
//     someone", so it suppresses the OS notification (mirroring the native
//     reporter's own first line).
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it, vi } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  BACKGROUND_FAILURE_PREFIX,
  BACKGROUND_LOG_PREFIX,
  BACKGROUND_NOTIFICATION_EVENT,
  BACKGROUND_NOTIFICATION_ID,
  TERMINAL_JOB_STATUSES,
  buildJobNotificationContent,
  createBackgroundNotificationListener,
  formatBackgroundNotificationFailureLine,
  formatBackgroundNotificationLine,
  readJobsService,
  registerBackgroundNotification,
  shouldNotifyForJob,
  toJobSnapshot,
  type JobsSurface,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/background-notification.ts'
import type { NotifierBackend } from '../../patches/omo-dsh/omo-hooks/src/hooks/session-notification.ts'

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
})

describe('P3-T12 background-notification — fail-open behaviour (discipline ②)', () => {
  it('① a rejected backend is swallowed and logged, and the anchor is still emitted', async () => {
    const h = harness({
      jobs: { onJobDone: () => () => {} },
      backend: {
        platform: 'linux',
        notify: async () => {
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
      expect(logSpy.mock.calls.map((call) => call[0])).toEqual(
        backendExists ? ['[omo-hooks] background-notification: completed pnpm vitest run'] : [],
      )
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})
