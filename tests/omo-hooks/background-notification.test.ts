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
import { dshRuntimeShape } from '../../patches/omo-dsh/omo-hooks/src/dsh-runtime-shape.ts'
import {
  BACKGROUND_FAILURE_PREFIX,
  BACKGROUND_LOG_PREFIX,
  BACKGROUND_NOTE_ABSENT,
  BACKGROUND_NOTE_DEFERRED,
  BACKGROUND_NOTE_PREFIX,
  BACKGROUND_NOTE_PULL_ONLY,
  BACKGROUND_NOTE_SUBSCRIBED_EVENTS,
  BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE,
  BACKGROUND_NOTE_V2_WITHOUT_SUBSCRIBE,
  BACKGROUND_NOTIFICATION_EVENT,
  BACKGROUND_NOTIFICATION_ID,
  TERMINAL_JOB_STATUSES,
  buildJobNotificationContent,
  createBackgroundNotificationListener,
  formatBackgroundNotificationFailureLine,
  formatBackgroundNotificationLine,
  formatBackgroundNotificationNoteLine,
  hasPushFace,
  isSettledJobEvent,
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
 * the REAL `runCommandViaExecFile` (wired at background-notification.ts:1095-1097,
 * imported at :503), so the
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
      formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_SUBSCRIBED_EVENTS),
      formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE),
      formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_V2_WITHOUT_SUBSCRIBE),
      formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_PULL_ONLY),
      formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_ABSENT),
    ]) {
      expect(text.startsWith(BACKGROUND_LOG_PREFIX)).toBe(false)
      expect(text.startsWith(BACKGROUND_FAILURE_PREFIX)).toBe(false)
      expect(/\[omo-hooks\] background-notification: (\S+) (.+)/.test(text)).toBe(false)
      expect(text.startsWith('[omo-hooks] hook ')).toBe(false)
    }
  })

  // P4.5-T2 ADR-4 — the NOTE TRISTATE. "Which path is alive" must be readable
  // off the note text alone, because on 0.2.x the OLD single `push path live`
  // wording stayed true-looking while the hook had silently fallen to the pull
  // path (docs/dsh-0.2.0-rc.2-review.md §3.2-1). Three states ⇒ three distinct
  // phrasings, and each is pinned to the ONLY state that may emit it.
  it('⑥ the NOTE tristate names the live path and never collides (P4.5-T2 ADR-4)', () => {
    // Each wording belongs to exactly one state.
    expect(BACKGROUND_NOTE_SUBSCRIBED_EVENTS).toContain('push path live (events)')
    expect(BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE).toContain('push path live (onJobDone)')
    // The v2 note must not claim the v1 channel and vice versa — a note that
    // contains both would make the tristate unreadable again.
    expect(BACKGROUND_NOTE_SUBSCRIBED_EVENTS).not.toContain('push path live (onJobDone)')
    expect(BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE).not.toContain('push path live (events)')
    expect(BACKGROUND_NOTE_SUBSCRIBED_EVENTS).not.toBe(BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE)
    // The two degraded texts say the push path is NOT live.
    for (const text of [
      BACKGROUND_NOTE_PULL_ONLY,
      BACKGROUND_NOTE_V2_WITHOUT_SUBSCRIBE,
      BACKGROUND_NOTE_ABSENT,
      BACKGROUND_NOTE_DEFERRED,
    ]) {
      expect(text).toContain('degraded pull path')
      expect(text).not.toContain('push path live')
    }
    // A v2 face whose `subscribe` is missing gets its OWN text: collapsing it
    // onto the v1 PULL_ONLY note would hide the fact that the identity fork said
    // v2 and the capability guard then refused it (the marker is not a capability
    // probe — src/dsh-runtime-shape.ts).
    expect(BACKGROUND_NOTE_V2_WITHOUT_SUBSCRIBE).toContain('events.subscribe')
    expect(BACKGROUND_NOTE_V2_WITHOUT_SUBSCRIBE).not.toBe(BACKGROUND_NOTE_PULL_ONLY)
    expect(BACKGROUND_NOTE_PULL_ONLY).toContain('onJobDone')
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
        // P4.5-T2 ADR-4: this fake is a v1-shaped face (`onJobDone` only), so
        // the note must name THAT channel — the tristate is the point.
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE),
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

// ══════════════════════════════════════════════════════════════════════════
// P4.5-T2 — the DUAL-MODE fork: the 0.2.x `jobs.events` shape (plan §4.2;
// review §3.2-1; ADR-1…ADR-5 in the module header).
//
// Everything ABOVE this line is the P3-T12/T13 suite and stays untouched in
// meaning: it pins the 0.1.5 (`onJobDone`) path that CI runs today, and it is
// the regression net for this change — a fork written backwards goes red here.
// Everything BELOW adds the 0.2.x half, with the mock shaped like the REAL 0.2.x
// surface (a `JobView` with NO `reported`, a `settled` event with `awaited`, an
// `events.subscribe` that hands back a disposer, and the four non-terminal event
// types present on the stream).
//
// THE GOLDEN RULE OF THIS BLOCK: an assertion is only worth what a wrong
// implementation would cost it. Every "it did not throw" here is paired with the
// POSITIVE fact (an anchor line, a recorded subscribe, a `list()` call count),
// because the P0 this Phase exists to fix was precisely a path that "did not
// throw" while delivering nothing (review §3.2-1).
// ══════════════════════════════════════════════════════════════════════════

/**
 * One synthetic 0.2.x `JobView` (upstream `packages/jobs/jobs/src/view.ts:65-100`).
 * Deliberately includes the fields the 0.1.5 `JobSnapshot` did NOT have
 * (`owner`, `startedAt`, `finishedAt`, `output`) and DELIBERATELY OMITS
 * `reported` — its presence here would make the v2 branch pass for the wrong
 * reason (the hook would be reading a field the real runtime never sends).
 */
interface FakeJobView {
  id: string
  kind: string
  label: string
  status: string
  owner?: string
  detail?: string
  startedAt: number
  finishedAt?: number
  output: { total: number; earliest: number }
}

function jobView(overrides: Partial<FakeJobView> = {}): FakeJobView {
  return {
    id: 'bash-1',
    kind: 'bash',
    label: 'pnpm vitest run',
    status: 'completed',
    startedAt: 1,
    finishedAt: 2,
    output: { total: 2048, earliest: 0 },
    ...overrides,
  }
}

/** One v2 `settled` JobEvent (`types.ts:206-218`), `cause` pinned to producer. */
function settledEvent(view: unknown, awaited: boolean): { type: 'settled'; job: unknown; cause: string; awaited: boolean } {
  return { type: 'settled', job: view, cause: 'producer', awaited }
}

/**
 * A 0.2.x-shaped `jobs` face: `events.subscribe` records EVERY call (filter and
 * listener, verbatim) and hands back a disposer of the cordis shape Q5 §6.1
 * measured (`() => void`, `length === 0`).
 */
function v2JobsSurface(options: {
  subscribeThrows?: Error
  /** Give a `list()` too, so a silent fallback to pull is VISIBLE as a call. */
  list?: () => readonly unknown[]
  /** `events` present but `subscribe` absent — the guard case (ADR-1's limit). */
  withoutSubscribe?: boolean
  /** Also carry the v1 member, to pin the fork's priority. */
  onJobDone?: (listener: (snapshot: unknown, owner: unknown) => void) => unknown
} = {}): {
  surface: JobsSurface
  subscribes: Array<{ filter: unknown; listener: (event: unknown) => void }>
  disposerCalls: number[]
  onJobDoneCalls: unknown[]
} {
  const subscribes: Array<{ filter: unknown; listener: (event: unknown) => void }> = []
  const disposerCalls: number[] = []
  const onJobDoneCalls: unknown[] = []
  const subscribe = options.withoutSubscribe
    ? undefined
    : (filter: unknown, listener: (event: unknown) => void): unknown => {
        if (options.subscribeThrows !== undefined) throw options.subscribeThrows
        subscribes.push({ filter, listener })
        return () => {
          disposerCalls.push(1)
        }
      }
  return {
    surface: {
      ...(subscribe === undefined ? { events: {} } : { events: { subscribe } }),
      ...(options.list === undefined ? {} : { list: options.list }),
      ...(options.onJobDone === undefined
        ? {}
        : { onJobDone: (listener: (snapshot: unknown, owner: unknown) => void) => onJobDoneCalls.push(listener) }),
    },
    subscribes,
    disposerCalls,
    onJobDoneCalls,
  }
}

/**
 * A context with the strict read ALREADY served (the fast path). Note the
 * consequence pinned by `⑦ …` in the registrar suites: this path logs NO note.
 */
function immediateContext(jobs: JobsSurface | undefined): HooksRegistrationContext {
  return {
    on: () => () => {},
    get: (name: string) => (name === 'jobs' ? jobs : undefined),
  }
}

/**
 * A context with the strict read EMPTY and `ctx.inject` armed — the REAL
 * deployment shape (P3-T13: the loader creates the `jobs` row concurrently with
 * this plugin, so the strict read usually loses the race). The test calls the
 * recorded callback to model the service appearing.
 */
function injectContext(): {
  ctx: HooksRegistrationContext
  injectCalls: Array<(injected: { jobs?: unknown }) => unknown>
  onCalls: Array<(session: unknown, event: unknown) => unknown>
} {
  const injectCalls: Array<(injected: { jobs?: unknown }) => unknown> = []
  const onCalls: Array<(session: unknown, event: unknown) => unknown> = []
  return {
    ctx: {
      on(event, listener) {
        onCalls.push(listener as (session: unknown, event: unknown) => unknown)
        return () => {}
      },
      get: () => undefined,
      inject(deps, callback) {
        expect(deps).toEqual(['jobs'])
        injectCalls.push(callback as (injected: { jobs?: unknown }) => unknown)
        return { uid: 1 }
      },
    },
    injectCalls,
    onCalls,
  }
}

describe('P4.5-T2 background-notification — the runtime-identity fork (ADR-1)', () => {
  it('① hasPushFace asks the GENERATION the marker named, not the other one', () => {
    // v2 face: `events.subscribe` is the push member; `onJobDone` is not even
    // consulted (a v1-shaped face with only `onJobDone` answers true too, so a
    // swapped fork would show up as one of these two going the wrong way).
    expect(hasPushFace(v2JobsSurface().surface)).toBe(true)
    expect(hasPushFace({ onJobDone: () => () => {} })).toBe(true)
    // Capability absent in the generation the marker named ⇒ false, even though
    // the OTHER generation's member is present. This is the explicit call-site
    // guard ADR-1 requires (the marker itself never looks past `events`).
    expect(hasPushFace({ events: {} })).toBe(false)
    expect(hasPushFace({ events: {}, onJobDone: () => () => {} })).toBe(false)
    expect(hasPushFace({ onJobDone: 'not-a-function' } as unknown as JobsSurface)).toBe(false)
    expect(hasPushFace({ list: () => [] })).toBe(false)
    expect(hasPushFace(undefined)).toBe(false)
  })

  it('② the NOTE the registrar emits IS dshRuntimeShape()’s verdict, per face (plan §4.2 R1-I4)', async () => {
    // The consistency assertion the plan asks for (R1-I4), in the form THIS task
    // can honour: the branch the registrar announces must be the shared marker's
    // verdict on the SAME face, never a second private predicate. (The
    // three-touch-point form of this assertion lands with T3/T4, which own the
    // other two files.) The deferred path is used because it is the one that
    // SPEAKS — the immediate fast path is note-free by contract (header).
    const cases: Array<{ surface: JobsSurface; expectNote: string; expectLive: string }> = [
      {
        surface: v2JobsSurface().surface,
        expectNote: BACKGROUND_NOTE_SUBSCRIBED_EVENTS,
        expectLive: 'push path live (events)',
      },
      {
        surface: { onJobDone: () => () => {} } as JobsSurface,
        expectNote: BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE,
        expectLive: 'push path live (onJobDone)',
      },
      {
        surface: v2JobsSurface({ withoutSubscribe: true }).surface,
        expectNote: BACKGROUND_NOTE_V2_WITHOUT_SUBSCRIBE,
        expectLive: 'degraded pull path',
      },
      {
        surface: { list: () => [] } as JobsSurface,
        expectNote: BACKGROUND_NOTE_PULL_ONLY,
        expectLive: 'degraded pull path',
      },
    ]
    for (const testCase of cases) {
      // The marker's own verdict, re-read here so a fork that disagrees with it
      // cannot pass by also having a matching-looking string.
      expect(['v1', 'v2']).toContain(dshRuntimeShape(testCase.surface))
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { ctx, injectCalls } = injectContext()
        registerBackgroundNotification(ctx, backgroundRow())
        injectCalls[0]({ jobs: testCase.surface })
        const notes = logSpy.mock.calls.map((call) => String(call[0]))
        expect(notes[notes.length - 1]).toBe(formatBackgroundNotificationNoteLine(testCase.expectNote))
        expect(notes.some((line) => line.includes(testCase.expectLive))).toBe(true)
        // And NOT the other generation's live-claim: the marker is the only switch.
        expect(notes.some((line) => line.includes('push path live') && !line.includes(testCase.expectLive))).toBe(false)
        expect(warnSpy).not.toHaveBeenCalled()
      } finally {
        logSpy.mockRestore()
        warnSpy.mockRestore()
      }
    }
  })

  it('③ isSettledJobEvent admits settled and refuses all four other types (ADR-3)', () => {
    expect(isSettledJobEvent(settledEvent(jobView(), false))).toBe(true)
    expect(isSettledJobEvent(settledEvent(jobView(), true))).toBe(true)
    for (const type of ['registered', 'progress', 'stopping', 'removed']) {
      expect(isSettledJobEvent({ type, job: jobView() })).toBe(false)
    }
    // `output` has NO `job` member at all (`types.ts:219-226`) — the type that
    // would reach `toJobSnapshot()` as `undefined` if the filter were missing.
    expect(isSettledJobEvent({ type: 'output', id: 'bash-1', total: 10 })).toBe(false)
    expect(isSettledJobEvent(undefined)).toBe(false)
    expect(isSettledJobEvent(null)).toBe(false)
    expect(isSettledJobEvent('settled')).toBe(false)
    expect(isSettledJobEvent({})).toBe(false)
  })

  it('④ a face carrying BOTH members takes v2 and never calls onJobDone', () => {
    const v2 = v2JobsSurface({
      onJobDone: () => () => {},
    })
    const disposer = registerBackgroundNotification(immediateContext(v2.surface), backgroundRow())
    // The v1 member was recorded by the mock and must still be EMPTY: the fork is
    // the identity marker, so a face that merely ALSO has `onJobDone` is v2.
    expect(v2.onJobDoneCalls).toEqual([])
    expect(v2.subscribes).toHaveLength(1)
    expect(typeof disposer).toBe('function')
  })
})

describe('P4.5-T2 background-notification — the 0.2.x PUSH path (events.subscribe)', () => {
  it('① the v2 surface is subscribed EXACTLY once, with the filter verbatim { owners: "all" }', () => {
    const v2 = v2JobsSurface({ list: () => [] })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const disposer = registerBackgroundNotification(immediateContext(v2.surface), backgroundRow())
      expect(v2.subscribes).toHaveLength(1)
      // VERBATIM: same keys, same value. `{ owners: 'scope' }` (the plan's first
      // choice, rejected by ADR-2) and `{ owner: … }` both go red here.
      expect(v2.subscribes[0].filter).toEqual({ owners: 'all' })
      expect(Object.keys(v2.subscribes[0].filter as object)).toEqual(['owners'])
      expect(typeof v2.subscribes[0].listener).toBe('function')
      expect(typeof disposer).toBe('function')
    } finally {
      logSpy.mockRestore()
    }
  })

  it('② CANARY: one settled{awaited:false} really dispatches one anchor, no pull fallback', async () => {
    // THE assertion of this task: under the 0.2.x shape, a real settlement on the
    // v2 push path produces exactly ONE anchor line and the real runner WAS
    // invoked — not "it did not throw", and not the degraded path.
    const list = vi.fn(() => [jobView()])
    const v2 = v2JobsSurface({ list })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      registerBackgroundNotification(immediateContext(v2.surface), backgroundRow())
      expect(v2.subscribes).toHaveLength(1)
      v2.subscribes[0].listener(settledEvent(jobView({ id: 'bash-9', label: 'cargo test' }), false))
      await drainMicrotasks()
      const anchors = logSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.startsWith(BACKGROUND_LOG_PREFIX))
      const backendExists = process.platform === 'linux' || process.platform === 'darwin'
      if (backendExists) {
        expect(anchors).toEqual(['[omo-hooks] background-notification: completed cargo test'])
        // The REAL backend and the REAL argv builder ran; only the OS spawn is
        // mocked (the F2 seam at the top of this file).
        expect(runnerSpy.calls).toHaveLength(1)
        expect(runnerSpy.calls[0]!.command).toBe(process.platform === 'linux' ? 'notify-send' : 'osascript')
      } else {
        expect(anchors).toEqual([])
        expect(runnerSpy.calls).toHaveLength(0)
      }
      // NO FALLBACK: while the v2 subscription is live the pull path must not
      // even read the registry (`list` counts are the visible proof).
      expect(list).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })

  it('③ awaited:true is SILENT and awaited:false notifies — the observable face of ADR-3', async () => {
    const h = harness({ jobs: v2JobsSurface().surface })
    expect(h.listener.hasPushSurface()).toBe(true)
    // A live `wait()` collected this one (`types.ts:206-218`, `awaited` at `:217`; Q5 §5.2 measured `true`) ⇒
    // the OS notification would be its SECOND delivery.
    h.listener.onJobEvent(settledEvent(jobView({ id: 'bash-awaited' }), true))
    await drainMicrotasks()
    expect(h.lines).toEqual([])
    expect(h.sent).toEqual([])
    // The same shape with no waiter ⇒ exactly one. Flipping the comparison in the
    // implementation (the deliberate break this suite is built to catch) inverts
    // both halves of this test.
    h.listener.onJobEvent(settledEvent(jobView({ id: 'bash-unawaited' }), false))
    await drainMicrotasks()
    expect(h.lines).toEqual(['[omo-hooks] background-notification: completed pnpm vitest run'])
    expect(h.sent).toHaveLength(1)
  })

  it('④ dedup: a second settled for one id, then a pull scan, never adds a line', async () => {
    const h = harness({ jobs: v2JobsSurface().surface })
    h.listener.onJobEvent(settledEvent(jobView(), false))
    await drainMicrotasks()
    // A re-delivery of the same settlement (a reload re-runs the inject child)
    // must not pop twice — the once-per-id set is shared by BOTH push paths.
    h.listener.onJobEvent(settledEvent(jobView(), false))
    h.listener.onJobEvent(settledEvent(jobView({ status: 'completed' }), false))
    await drainMicrotasks()
    expect(h.lines).toHaveLength(1)
    expect(h.sent).toHaveLength(1)
    // ...and after the push verdict goes away, the pull path sees the SAME job in
    // `list()` and still stays quiet: the dedup is per id, not per path.
    h.listener.attachJobsSurface({ list: () => [jobView()] })
    h.listener.setPushSurfaceLive(false)
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(h.lines).toHaveLength(1)
    expect(h.sent).toHaveLength(1)
  })

  it('⑤ the four non-terminal event types and the shapeless output never notify', async () => {
    const h = harness({ jobs: v2JobsSurface().surface })
    for (const type of ['registered', 'progress', 'stopping', 'removed']) {
      h.listener.onJobEvent({ type, job: jobView({ id: `bash-${type}` }) })
    }
    h.listener.onJobEvent({ type: 'output', id: 'bash-1', total: 4096 })
    await drainMicrotasks()
    expect(h.lines).toEqual([])
    expect(h.sent).toEqual([])
    expect(h.failures).toEqual([])
    // And the settled that DOES arrive after them still gets through — the filter
    // must not have swallowed the listener.
    h.listener.onJobEvent(settledEvent(jobView(), false))
    await drainMicrotasks()
    expect(h.lines).toHaveLength(1)
  })

  it('⑥ malformed events are contained: no throw, no line, no failure log', async () => {
    const h = harness({ jobs: v2JobsSurface().surface })
    expect(() => {
      h.listener.onJobEvent(undefined)
      h.listener.onJobEvent(null)
      h.listener.onJobEvent('settled')
      h.listener.onJobEvent({ type: 'settled' })
      h.listener.onJobEvent({ type: 'settled', job: null, awaited: false })
      h.listener.onJobEvent({ type: 'settled', job: 'bash-1', awaited: false })
      h.listener.onJobEvent({ type: 'settled', job: { id: '', kind: 'bash', label: 'l', status: 'completed' }, awaited: false })
      // `job.status` is the wrong type: `toJobSnapshot` rejects it, and the
      // notification must not be built from a half-read projection.
      h.listener.onJobEvent({ type: 'settled', job: { id: 'x', kind: 'bash', label: 'l', status: 7 }, awaited: false })
      // `awaited` is not a boolean: it reads as NOT delivered (fail towards
      // telling the user), so this one DOES notify — asserted below.
      h.listener.onJobEvent({ type: 'settled', job: jobView({ id: 'bash-odd-awaited' }), awaited: 'yes' })
    }).not.toThrow()
    await drainMicrotasks()
    expect(h.failures).toEqual([])
    // Exactly ONE line, and it is the odd-`awaited` job: every malformed input
    // above stayed silent, while a non-boolean `awaited` reads as NOT delivered
    // and therefore notifies (fail towards telling the user — the same direction
    // `toJobSnapshot` takes on a missing `reported`).
    expect(h.lines).toEqual(['[omo-hooks] background-notification: completed pnpm vitest run'])
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0].body).toContain('bash-odd-awaited')
  })

  it('⑦ a settled whose job is not terminal does not notify (defensive gate)', async () => {
    const h = harness({ jobs: v2JobsSurface().surface })
    for (const status of ['running', 'stopping']) {
      h.listener.onJobEvent(settledEvent(jobView({ id: `bash-${status}`, status }), false))
    }
    await drainMicrotasks()
    expect(h.lines).toEqual([])
    expect(h.sent).toEqual([])
    // Every terminal status DOES notify, so the gate above is a status decision
    // and not a swallowed listener.
    for (const status of TERMINAL_JOB_STATUSES) {
      h.listener.onJobEvent(settledEvent(jobView({ id: `bash-t-${status}`, status }), false))
    }
    await drainMicrotasks()
    expect(h.lines).toHaveLength(TERMINAL_JOB_STATUSES.length)
  })

  it('⑧ the settled event carries the terminal STATUS into the anchor line', async () => {
    const h = harness({ jobs: v2JobsSurface().surface })
    h.listener.onJobEvent(settledEvent(jobView({ id: 'bash-2', kind: 'subagent', label: 'explore', status: 'killed', detail: 'cancelled by user' }), false))
    await drainMicrotasks()
    expect(h.lines).toEqual(['[omo-hooks] background-notification: killed explore'])
    expect(h.sent[0].body).toBe('Background subagent job bash-2 finished: killed\nexplore\ncancelled by user')
  })
})

describe('P4.5-T2 background-notification — the 0.2.x registrar: NOTE tristate, disposer, guards', () => {
  it('① the deferred v2 subscription logs `push path live (events)` and NOT the v1 wording', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { ctx, injectCalls } = injectContext()
      registerBackgroundNotification(ctx, backgroundRow())
      const v2 = v2JobsSurface()
      const returned = injectCalls[0]({ jobs: v2.surface })
      expect(v2.subscribes).toHaveLength(1)
      expect(v2.subscribes[0].filter).toEqual({ owners: 'all' })
      expect(typeof returned).toBe('function')
      const notes = logSpy.mock.calls.map((call) => String(call[0]))
      expect(notes).toEqual([
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_DEFERRED),
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_SUBSCRIBED_EVENTS),
      ])
      expect(notes.some((line) => line.includes('push path live (events)'))).toBe(true)
      expect(notes.some((line) => line.includes('push path live (onJobDone)'))).toBe(false)
      expect(notes.some((line) => line.includes('degraded pull path') && line.includes('subscribed'))).toBe(false)
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })

  it('② a v1-shaped face still gets `push path live (onJobDone)` — the tristate is forked, not renamed', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { ctx, injectCalls } = injectContext()
      registerBackgroundNotification(ctx, backgroundRow())
      const subscribed: unknown[] = []
      const returned = injectCalls[0]({
        jobs: { onJobDone: (listener: unknown) => { subscribed.push(listener); return () => {} } } as JobsSurface,
      })
      expect(subscribed).toHaveLength(1)
      expect(typeof returned).toBe('function')
      const notes = logSpy.mock.calls.map((call) => String(call[0]))
      expect(notes).toEqual([
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_DEFERRED),
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE),
      ])
      expect(notes.some((line) => line.includes('push path live (events)'))).toBe(false)
    } finally {
      logSpy.mockRestore()
    }
  })

  it('③ DEGRADED: list() with neither push face — the note says degraded and pull delivers', async () => {
    const list = vi.fn(() => [jobView()])
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onCalls: Array<(session: unknown, event: unknown) => unknown> = []
    try {
      const ctx: HooksRegistrationContext = {
        on: (event, listener) => { onCalls.push(listener as (s: unknown, e: unknown) => unknown); return () => {} },
        // The face IS there — it just has no push member of EITHER generation.
        get: (name: string) => (name === 'jobs' ? { list } : undefined),
      }
      const disposer = registerBackgroundNotification(ctx, backgroundRow())
      expect(disposer).toBeUndefined()
      const notes = logSpy.mock.calls.map((call) => String(call[0]))
      // No `inject` on this host, so the degraded capability is recorded here.
      expect(notes).toEqual([formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_PULL_ONLY)])
      expect(notes.some((line) => line.includes('degraded pull path'))).toBe(true)
      expect(notes.some((line) => line.includes('push path live'))).toBe(false)
      // And the pull path really delivers for the SAME v2-shaped view.
      onCalls[0]({ id: 'ses_1' }, TURN_END)
      await drainMicrotasks()
      expect(list).toHaveBeenCalledTimes(1)
      const backendExists = process.platform === 'linux' || process.platform === 'darwin'
      const anchors = logSpy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith(BACKGROUND_LOG_PREFIX))
      expect(anchors).toEqual(backendExists ? ['[omo-hooks] background-notification: completed pnpm vitest run'] : [])
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })

  it('③b a host with NEITHER inject NOR any jobs face says ABSENT, and stays silent otherwise', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const events: string[] = []
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
      // Pinned verbatim: `registration.test.ts:356,:486` transcribes this same
      // line into a full-roster boot log, so its text is a cross-file contract.
      expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_ABSENT),
      ])
    } finally {
      logSpy.mockRestore()
    }
  })

  it('④ v2 shape WITHOUT events.subscribe: its own NOTE, pull path live, never a fake subscribe', async () => {
    const list = vi.fn(() => [jobView()])
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { ctx, injectCalls, onCalls } = injectContext()
      registerBackgroundNotification(ctx, backgroundRow())
      const v2 = v2JobsSurface({ withoutSubscribe: true, list })
      const returned = injectCalls[0]({ jobs: v2.surface })
      expect(returned).toBeUndefined()
      expect(v2.subscribes).toEqual([])
      const notes = logSpy.mock.calls.map((call) => String(call[0]))
      expect(notes).toEqual([
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_DEFERRED),
        formatBackgroundNotificationNoteLine(BACKGROUND_NOTE_V2_WITHOUT_SUBSCRIBE),
      ])
      expect(notes.some((line) => line.includes('push path live'))).toBe(false)
      expect(notes.some((line) => line.includes('degraded pull path'))).toBe(true)
      // The claim is not just "a note was printed": the degraded path must
      // actually DELIVER over the same v2 views, so the turn/end scan has to read
      // `list()` and produce the anchor. Without the guard this branch would have
      // claimed a subscription it never made and produced nothing at all.
      onCalls[0]({ id: 'ses_1' }, TURN_END)
      await drainMicrotasks()
      expect(list).toHaveBeenCalledTimes(1)
      const backendExists = process.platform === 'linux' || process.platform === 'darwin'
      const anchors = logSpy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith(BACKGROUND_LOG_PREFIX))
      expect(anchors).toEqual(backendExists ? ['[omo-hooks] background-notification: completed pnpm vitest run'] : [])
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })

  it('⑤ a THROWING events.subscribe: one FAILED line naming v2, no throw, pull resumes', async () => {
    const list = vi.fn(() => [jobView()])
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const onCalls: Array<(session: unknown, event: unknown) => unknown> = []
    try {
      const v2 = v2JobsSurface({ subscribeThrows: new Error('hub disposed'), list })
      const ctx: HooksRegistrationContext = {
        on: (_event, listener) => { onCalls.push(listener as (s: unknown, e: unknown) => unknown); return () => {} },
        get: (name: string) => (name === 'jobs' ? v2.surface : undefined),
      }
      const disposer = registerBackgroundNotification(ctx, backgroundRow())
      expect(disposer).toBeUndefined()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      // The FAILED line names the GENERATION (ADR-4's sibling rule): a line that
      // says only "subscribe failed" cannot tell a reviewer which runtime broke.
      expect(String(warnSpy.mock.calls[0][0])).toBe(
        '[omo-hooks] background-notification FAILED: jobs.events.subscribe subscribe failed: Error: hub disposed',
      )
      expect(String(warnSpy.mock.calls[0][0])).not.toContain('onJobDone')
      // The primary manifest event is still registered and the pull path works.
      onCalls[0]({ id: 'ses_1' }, TURN_END)
      await drainMicrotasks()
      expect(list).toHaveBeenCalledTimes(1)
      expect(logSpy.mock.calls.map((call) => String(call[0])).some((line) => line.includes('push path live'))).toBe(false)
    } finally {
      warnSpy.mockRestore()
      logSpy.mockRestore()
    }
  })

  it('⑥ the disposer is HELD on both paths, flips the verdict, resumes pull, and is once-only', async () => {
    // IMMEDIATE path: returned by the registrar (and by it to `ctx.effect`).
    const listA = vi.fn(() => [jobView({ id: 'bash-imm' })])
    const v2a = v2JobsSurface({ list: listA })
    const disposerA = registerBackgroundNotification(immediateContext(v2a.surface), backgroundRow())
    expect(typeof disposerA).toBe('function')
    expect(v2a.disposerCalls).toEqual([])
    ;(disposerA as () => void)()
    expect(v2a.disposerCalls).toEqual([1])
    // What the eight lines below ACTUALLY assert, stated plainly: they do NOT
    // observe the registrar's own listener (that would need the listener the
    // registrar built at :1536, which is not returned to the test). They build a
    // SECOND, independent listener over the same v2 surface and show the CONSEQUENCE
    // the flip is meant to have — a listener whose verdict is "not live" drives the
    // turn/end pull over that surface. So this is the flag's CONTRACT, demonstrated
    // on a stand-in; the ORDERING of the registrar's own flip is pinned where it
    // can be observed, in ⑦ below, through the listener `ctx.on` captured.
    const h = harness({ jobs: v2a.surface })
    expect(h.listener.hasPushSurface()).toBe(true)
    h.listener.setPushSurfaceLive(false)
    expect(h.listener.hasPushSurface()).toBe(false)
    h.listener.onSessionEvent({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(listA).toHaveBeenCalledTimes(1)

    // DEFERRED path: RETURNED FROM the inject callback, never called at hand-over.
    const listB = vi.fn(() => [jobView({ id: 'bash-def' })])
    const v2b = v2JobsSurface({ list: listB })
    const { ctx, injectCalls } = injectContext()
    registerBackgroundNotification(ctx, backgroundRow())
    const disposerB = injectCalls[0]({ jobs: v2b.surface }) as () => void
    expect(typeof disposerB).toBe('function')
    expect(v2b.disposerCalls).toEqual([])
    disposerB()
    expect(v2b.disposerCalls).toEqual([1])
    // REPEATED calls are inert: the service disposer runs AT MOST ONCE, so an
    // upstream disposer that is not idempotent (the in-register case Q5 §7.7
    // lists as UNMEASURED) cannot be re-entered from here.
    expect(() => disposerB()).not.toThrow()
    expect(() => disposerB()).not.toThrow()
    expect(v2b.disposerCalls).toEqual([1])
  })

  it('⑦ a disposer that throws does not strand the push verdict on `live`', async () => {
    // THE CLAIM IS ORDERING. `wrapDisposer` flips `setPushSurfaceLive(false)`
    // BEFORE running the service's unregister, so a throwing unregister still
    // leaves the pull path in charge. The assertion below is the observable face
    // of that order: dispose (throws, swallowed by the test), then drive a real
    // turn/end through the SAME listener the registrar registered, and require
    // `list()` to be consulted. Were the flip placed after the service call,
    // the flag would still read `live`, the pull path would stand down, and
    // `list` would never be called — this test would go red.
    const list = vi.fn(() => [jobView({ id: 'bash-throw-disposer' })])
    const throwingSurface: JobsSurface = {
      events: {
        subscribe: (_filter: unknown, _listener: (event: unknown) => void) => () => {
          throw new Error('unregister failed')
        },
      },
      list,
    }
    const events: Array<(session: unknown, event: unknown) => unknown> = []
    const ctx: HooksRegistrationContext = {
      on: (_event, listener) => {
        events.push(listener as (session: unknown, event: unknown) => unknown)
        return () => {}
      },
      get: (name: string) => (name === 'jobs' ? throwingSurface : undefined),
    }
    const disposer = registerBackgroundNotification(ctx, backgroundRow())
    expect(typeof disposer).toBe('function')
    // The service's own failure escapes the wrapper UNTOUCHED — the wrapper does
    // not invent a try/catch that would hide a broken unregister (the caller, the
    // loader, is the right place to see it). Pinned so nobody "hardens" it away.
    expect(() => (disposer as () => void)()).toThrow('unregister failed')
    // And yet the verdict already flipped: the pull path is in charge NOW.
    events[0]({ id: 'ses_1' }, TURN_END)
    await drainMicrotasks()
    expect(list).toHaveBeenCalledTimes(1)
  })
})
