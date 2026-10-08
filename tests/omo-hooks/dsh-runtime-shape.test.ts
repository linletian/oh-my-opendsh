// dsh-runtime-shape.test.ts — P4.5-T2 unit gate for the SHARED jobs
// runtime-identity marker (`patches/omo-dsh/omo-hooks/src/dsh-runtime-shape.ts`).
//
// WHY A SEPARATE FILE. The marker is the single switch three touch points share
// (plan §4.1 探针表, 评审 R1-I4): `hooks/background-notification.ts` (this
// Phase's T2), `services/stop-continuation-guard.ts` (T3) and
// `hooks/ulw-execute/live-state.ts` (T4). A predicate that three files fork on
// deserves its own gate: a bug here is not one hook's wrong branch, it is all of
// them, and the failure mode is the silent one this Phase exists to kill
// (docs/dsh-0.2.0-rc.2-review.md §3.2 — "each fails quietly").
//
// WHAT THIS SUITE IS NOT: it is not a capability test. The marker must NOT grow
// capability reasoning (`typeof events.subscribe === 'function'` and friends), and
// `③` below is the pin that keeps it from doing so by accident: a face whose
// `events.subscribe` is MISSING still answers `'v2'`, because the marker's only
// question is "whose shape is this?" and the CALL SITE owns the capability
// question. Turning `③` red would mean someone widened the probe — the exact
// "误当能力探针扩散" the plan forbids (plan §4.1).
//
// The `.ts` extension in the import path is load-bearing (Node 24 type-stripping
// does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it, vi } from 'vitest'
import {
  dshRuntimeShape,
  type DshRuntimeShape,
} from '../../patches/omo-dsh/omo-hooks/src/dsh-runtime-shape.ts'
import {
  registerBackgroundNotification,
  type JobsSurface,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/background-notification.ts'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'

function row(): HookManifestEntry {
  const entry = HOOK_MANIFEST.find((entry) => entry.id === 'background-notification')
  if (entry === undefined) throw new Error('manifest is missing the background-notification row')
  return entry
}

describe('P4.5-T2 dshRuntimeShape — the two generations', () => {
  it('① a 0.1.5-shaped face answers v1', () => {
    // The real 0.1.5 surface this plugin consults: `onJobDone` + `list`, and NO
    // `events` member anywhere (`dsh-jobs/lib/types/index.d.ts:63,111`).
    expect(dshRuntimeShape({ onJobDone: () => () => {} })).toBe('v1')
    expect(dshRuntimeShape({ onJobDone: () => () => {}, list: () => [] })).toBe('v1')
    expect(dshRuntimeShape({ list: () => [] })).toBe('v1')
    expect(dshRuntimeShape({})).toBe('v1')
    // An `events` member that is EXPLICITLY undefined is the absent case, not a
    // v2 face: the marker reads `events !== undefined`, and a decorator that
    // wrote `events: undefined` must not flip the fork.
    expect(dshRuntimeShape({ onJobDone: () => () => {}, events: undefined })).toBe('v1')
  })

  it('② a 0.2.x-shaped face answers v2', () => {
    // The real 0.2.x surface: `events.subscribe` (`packages/jobs/jobs/src/
    // index.ts:100`, `types.ts:243-253`), with no `onJobDone` at all.
    expect(dshRuntimeShape({ events: { subscribe: () => () => {} } })).toBe('v2')
    expect(dshRuntimeShape({ events: { subscribe: () => () => {} }, list: () => [] })).toBe('v2')
    // The v1 member ALSO being present does not pull it back — the whole-package
    // rewrite means the v2 members decide, and a decorated/hybrid face is still a
    // v2 registry (this is the priority T2's own suite pins behaviourally).
    expect(dshRuntimeShape({ events: { subscribe: () => () => {} }, onJobDone: () => () => {} })).toBe('v2')
  })

  it('③ it is an IDENTITY marker, not a capability probe (plan §4.1)', () => {
    // PRESENT-but-unusable members still say v2. This is deliberate and is the
    // pin against widening: if this ever goes red, someone made the probe answer
    // "can I subscribe?" instead of "whose shape is this?", and the call-site
    // guards (which DO check `typeof … === 'function'`) become dead code.
    expect(dshRuntimeShape({ events: {} })).toBe('v2')
    expect(dshRuntimeShape({ events: null })).toBe('v2')
    expect(dshRuntimeShape({ events: 0 })).toBe('v2')
    expect(dshRuntimeShape({ events: false })).toBe('v2')
    expect(dshRuntimeShape({ events: { subscribe: undefined } })).toBe('v2')
    expect(dshRuntimeShape({ events: { subscribe: 'not-a-function' } })).toBe('v2')
    // And it never touches the face BEYOND the discriminator: a `subscribe` that
    // throws on access is still answered, because the marker must not consult it.
    // (If someone widens the probe to `typeof events.subscribe`, this goes red in
    // the honest way — the access happens and the error escapes.)
    const hostileSubscribe = {
      events: {
        get subscribe(): unknown {
          throw new Error('subscribe must not be consulted by the marker')
        },
      },
    }
    expect(() => dshRuntimeShape(hostileSubscribe)).not.toThrow()
    expect(dshRuntimeShape(hostileSubscribe)).toBe('v2')
    // A v1 face whose `onJobDone` throws on access is answered the same way: the
    // marker never looks at it, because `events !== undefined` already decided.
    const hostileV1 = {
      get onJobDone(): unknown {
        throw new Error('onJobDone must not be consulted by the marker')
      },
    }
    expect(() => dshRuntimeShape(hostileV1)).not.toThrow()
    expect(dshRuntimeShape(hostileV1)).toBe('v1')
  })

  it('④ anything that is not an object answers v1 (the safe branch)', () => {
    expect(dshRuntimeShape(undefined)).toBe('v1')
    expect(dshRuntimeShape(null)).toBe('v1')
    expect(dshRuntimeShape('v2')).toBe('v1')
    expect(dshRuntimeShape(7)).toBe('v1')
    expect(dshRuntimeShape(true)).toBe('v1')
    expect(dshRuntimeShape(Symbol('jobs'))).toBe('v1')
    expect(dshRuntimeShape(() => {})).toBe('v1')
    expect(dshRuntimeShape([])).toBe('v1')
    // The union's two members are the ONLY answers — no 'unknown' escape hatch a
    // caller could forget to handle.
    const answers = new Set<DshRuntimeShape>([dshRuntimeShape(undefined), dshRuntimeShape({ events: {} })])
    expect([...answers].sort()).toEqual(['v1', 'v2'])
  })

  it('⑤ the marker IS the switch the hook uses — same face, same verdict (plan §4.2 R1-I4)', () => {
    // The consistency assertion in the form T2 can honour: for every face, the
    // channel the registrar ACTUALLY subscribed through must be the channel the
    // marker's verdict implies. Every member is WRAPPED (never replaced), so a
    // face that already provides one still records the call — the first draft of
    // this helper substituted the member when it was missing and silently
    // stopped recording when it was present; that bug is what the explicit
    // `toHaveLength(1)` assertions below are here to catch.
    function instrument(surface: JobsSurface): {
      wired: JobsSurface
      eventsCalls: unknown[]
      doneCalls: unknown[]
    } {
      const eventsCalls: unknown[] = []
      const doneCalls: unknown[] = []
      const wired: JobsSurface = {
        ...(surface as object),
        ...(surface.events === undefined || typeof surface.events.subscribe !== 'function'
          ? {}
          : {
              events: {
                subscribe: (filter: unknown, listener: (event: unknown) => void) => {
                  eventsCalls.push({ filter, listener })
                  return surface.events?.subscribe?.(filter, listener)
                },
              },
            }),
        ...(typeof surface.onJobDone !== 'function'
          ? {}
          : {
              onJobDone: (listener: (snapshot: unknown, owner: unknown) => void) => {
                doneCalls.push(listener)
                return surface.onJobDone?.(listener)
              },
            }),
      }
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        registerBackgroundNotification(
          {
            on: () => () => {},
            get: () => undefined,
            inject: (deps, callback) => {
              void callback({ jobs: wired })
              return { uid: 1 }
            },
          },
          row(),
        )
      } finally {
        logSpy.mockRestore()
        warnSpy.mockRestore()
      }
      return { wired, eventsCalls, doneCalls }
    }

    // v2 with a working subscribe → exactly one events subscription, zero v1.
    const v2 = instrument({ events: { subscribe: () => () => {} } })
    expect(dshRuntimeShape(v2.wired)).toBe('v2')
    expect(v2.eventsCalls).toHaveLength(1)
    expect(v2.doneCalls).toEqual([])

    // v2 ALSO carrying the v1 member → still events only (the priority pin).
    const both = instrument({
      events: { subscribe: () => () => {} },
      onJobDone: () => () => {},
    })
    expect(dshRuntimeShape(both.wired)).toBe('v2')
    expect(both.eventsCalls).toHaveLength(1)
    expect(both.doneCalls).toEqual([])

    // v1 → exactly one onJobDone subscription, zero events.
    const v1 = instrument({ onJobDone: () => () => {} })
    expect(dshRuntimeShape(v1.wired)).toBe('v1')
    expect(v1.doneCalls).toHaveLength(1)
    expect(v1.eventsCalls).toEqual([])

    // v1 with no push member at all → neither channel (the pull path's own NOTE
    // is pinned in background-notification.test.ts, suite ③).
    const pull = instrument({ list: () => [] })
    expect(dshRuntimeShape(pull.wired)).toBe('v1')
    expect(pull.eventsCalls).toEqual([])
    expect(pull.doneCalls).toEqual([])

    // v2 whose subscribe is MISSING → the marker still says v2, and the hook
    // does NOT fall back to the v1 member this runtime does not have. (The
    // recorder wraps an existing `subscribe` only, so the `eventsCalls` count
    // here is vacuous by construction — what is NOT vacuous is `doneCalls`:
    // the v1 member IS wired by `instrument` above, and a hook that ignored the
    // marker and fell back to it would land exactly one call in that array. The
    // NOTE this case emits is pinned in background-notification.test.ts ④.)
    const v2NoSub = instrument({ events: {}, onJobDone: () => () => {} })
    expect(dshRuntimeShape(v2NoSub.wired)).toBe('v2')
    expect(v2NoSub.doneCalls).toEqual([])
  })
})
