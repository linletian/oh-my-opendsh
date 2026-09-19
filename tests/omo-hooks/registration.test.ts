// P3-T3 — the omo-hooks mount: boot-marker formats + the loud-but-non-fatal
// registration loop (plan §4.1; task P3-T3).
//
// WHY THE MARKER STRINGS BELOW ARE HARD-CODED. These lines are probe anchors:
// scripts/cold-start.sh and scripts/concerto-mode-probe.sh grep them out of a
// real boot log, and P3-T19 extends the probe to the full per-hook set. A test
// that derived its expectation from the formatter would agree with any drift
// and prove nothing, so the exact summary line (including the per-event counts
// and their order) is transcribed by hand — exactly like
// tests/omo-hooks/manifest.test.ts transcribes the id set. If a manifest row
// moves event, THIS file must be edited in the same commit: that is the
// intended friction, and it is also the "counts are derived from the manifest"
// assertion — a hard-coded count inside the plugin could not move at all.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HOOK_IDS,
  HOOK_MANIFEST,
  type HookManifestEntry,
} from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import {
  describeError,
  formatHookFailedLine,
  formatHookRegisteredLine,
  formatLoadedSummaryLine,
  formatManifestValidationFailedLine,
  SUMMARY_EVENT_FIELDS,
} from '../../patches/omo-dsh/omo-hooks/src/boot-markers.ts'
import {
  HOOK_REGISTRARS,
  apply,
  runHookRegistrations,
  type HooksRegistrationContext,
  type HookRegistrar,
} from '../../patches/omo-dsh/omo-hooks/src/index.ts'

/**
 * The exact summary line a real boot logs, transcribed from the manifest by
 * hand (14 rows: 1 pre-step, 2 pre-execute, 8 post-execute, 1 turn-stopping,
 * 2 session/event, 0 status, in SUMMARY_EVENT_FIELDS order). It is 14, not 15,
 * because P3-T5 removed the H-01 write-existing-file-guard row (WP-2
 * arbitration: dsh-fs-observation-policy covers it natively), which is also why
 * pre-execute moved 3 → 2.
 */
const EXPECTED_SUMMARY_LINE =
  '[omo-hooks] loaded: manifest 14 entries (pre-step=1, pre-execute=2, '
  + 'post-execute=8, turn-stopping=1, session/event=2, status=0)'

/** One recorded `ctx.on` call — the loop-wiring observable. */
interface OnCall {
  readonly event: string
  readonly listener: (...args: readonly unknown[]) => unknown
}

/**
 * A fake cordis context that models the REAL `ctx.effect` contract, verified
 * against cordis's own Fiber#_execute
 * (node_modules/@deepseek-ai/cordis/lib/index.js):
 *
 *   const effect = runner.execute.call(this)
 *   if (typeof effect === "function") return runner.collect(effect)
 *
 * i.e. `effect(execute)` CALLS `execute` at registration time and collects its
 * RETURN VALUE as the fiber disposal; returning undefined collects NOTHING.
 * The earlier shape of this fake (push the callback, let the test call it) was
 * exactly the inversion being fixed: it made a buggy `ctx.effect(() => {
 * disposer() })` look correct, because the fake never ran the callback.
 *
 * `stopFiber()` is the simulated Fiber stop: it runs everything collected from
 * `effect` in reverse registration order, the way cordis's own `dispose` does
 * (`disposables.splice(0).reverse()`). That is the ONLY moment a forwarded
 * disposer may run.
 *
 * `on` returns a disposer like cordis does; a registrar that registers through
 * `ctx.on` is already fiber-scoped, so the loop never needs to consume it.
 */
function fakeContext(): {
  ctx: HooksRegistrationContext
  onCalls: OnCall[]
  /** Every execute callback handed to `ctx.effect`, in order (proof it ran). */
  effectCalls: Array<() => unknown>
  stopFiber: () => void
} {
  const onCalls: OnCall[] = []
  const effectCalls: Array<() => unknown> = []
  const collectedDisposals: Array<() => void> = []
  return {
    ctx: {
      on(event, listener) {
        onCalls.push({ event, listener })
        return () => {}
      },
      effect(execute) {
        effectCalls.push(execute)
        const collected = execute()
        if (typeof collected === 'function') collectedDisposals.push(collected)
        return () => {}
      },
    },
    onCalls,
    effectCalls,
    stopFiber() {
      for (const dispose of collectedDisposals.splice(0).reverse()) dispose()
    },
  }
}

/** Collects every line the loop logs through an injected sink. */
function collectLines(
  ctx: HooksRegistrationContext,
  entries: readonly HookManifestEntry[],
  registrars: Readonly<Record<string, HookRegistrar>>,
): string[] {
  const lines: string[] = []
  runHookRegistrations(ctx, entries, registrars, (line) => {
    lines.push(line)
  })
  return lines
}

/** A widened row fixture, so a synthetic roster is not forced through the manifest types. */
function rowFixture(event: string, index: number): HookManifestEntry {
  return {
    id: `fixture-${index}`,
    upstreamFiles: ['packages/omo-opencode/src/hooks/fixture/hook.ts'],
    upstreamTestFiles: [],
    event,
    mode: 'B',
    summary: 'fixture',
    e2eScenario: 'fixture',
    status: 'pending',
  } as unknown as HookManifestEntry
}

describe('P3-T3 boot markers — format contract', () => {
  it('① pins the exact real-manifest summary line (counts + order)', () => {
    expect(formatLoadedSummaryLine(HOOK_MANIFEST)).toBe(EXPECTED_SUMMARY_LINE)
  })

  it('② derives every count from the roster it is handed, never from a literal', () => {
    // A 4-row synthetic roster with a deliberately non-uniform distribution:
    // the counts must follow the INPUT, which a hard-coded 14-row string cannot.
    const synthetic = [
      rowFixture('agent/pre-step', 1),
      rowFixture('tools/post-execute', 2),
      rowFixture('tools/post-execute', 3),
      rowFixture('agent/status', 4),
    ]
    expect(formatLoadedSummaryLine(synthetic)).toBe(
      '[omo-hooks] loaded: manifest 4 entries (pre-step=1, pre-execute=0, '
      + 'post-execute=2, turn-stopping=0, session/event=0, status=1)',
    )
  })

  it('③ covers all six DSH events exactly once, in the documented order', () => {
    // The summary can only be total if its field list is exactly MANIFEST_EVENTS;
    // a missing event would silently drop rows from the line.
    expect(SUMMARY_EVENT_FIELDS.map((field) => field.event)).toEqual([
      'agent/pre-step',
      'tools/pre-execute',
      'tools/post-execute',
      'agent/turn-stopping',
      'session/event',
      'agent/status',
    ])
    expect(SUMMARY_EVENT_FIELDS.map((field) => field.label)).toEqual([
      'pre-step',
      'pre-execute',
      'post-execute',
      'turn-stopping',
      'session/event',
      'status',
    ])
  })

  it('④ reports a row outside the six fields instead of dropping it (total function)', () => {
    const synthetic = [rowFixture('agent/session-idle', 1)]
    expect(formatLoadedSummaryLine(synthetic)).toBe(
      '[omo-hooks] loaded: manifest 1 entries (pre-step=0, pre-execute=0, '
      + 'post-execute=0, turn-stopping=0, session/event=0, status=0, other=1)',
    )
  })

  it('⑤ pins the registered / FAILED / validation-FAILED forms', () => {
    expect(formatHookRegisteredLine('bash-file-read-guard', 'tools/post-execute')).toBe(
      '[omo-hooks] hook bash-file-read-guard registered on tools/post-execute',
    )
    expect(formatHookFailedLine('bash-file-read-guard', new Error('boom'))).toBe(
      '[omo-hooks] hook bash-file-read-guard FAILED: Error: boom',
    )
    expect(formatHookFailedLine('x', 'plain string')).toBe(
      '[omo-hooks] hook x FAILED: plain string',
    )
    expect(formatManifestValidationFailedLine(new Error('manifest: expected 14'))).toBe(
      '[omo-hooks] manifest validation FAILED: Error: manifest: expected 14',
    )
    expect(describeError(new TypeError('t'))).toBe('TypeError: t')
  })
})

describe('P3-T3 registration loop — loud-but-non-fatal', () => {
  it('① with an empty registry logs the summary line and registers nothing', () => {
    const { ctx, onCalls } = fakeContext()
    const lines = collectLines(ctx, HOOK_MANIFEST, {})
    expect(lines).toEqual([EXPECTED_SUMMARY_LINE])
    expect(onCalls).toEqual([])
  })

  it('② registers an implemented hook on its manifest event and logs one line', () => {
    const { ctx, onCalls } = fakeContext()
    const lines = collectLines(ctx, HOOK_MANIFEST, {
      'bash-file-read-guard': (c, entry) => {
        c.on(entry.event, () => 'advisory')
      },
    })
    expect(lines).toEqual([
      EXPECTED_SUMMARY_LINE,
      '[omo-hooks] hook bash-file-read-guard registered on tools/post-execute',
    ])
    expect(onCalls).toHaveLength(1)
    expect(onCalls[0].event).toBe('tools/post-execute')
  })

  it('③ a throwing registrar logs FAILED and the remaining hooks still register', () => {
    const { ctx, onCalls } = fakeContext()
    // The throwing hook is FIRST in roster order (bash-file-read-guard is the
    // P0 row now that H-01 is gone), so a loop that aborted on the throw could
    // not reach the second implemented hook.
    const lines = collectLines(ctx, HOOK_MANIFEST, {
      'bash-file-read-guard': () => {
        throw new Error('registration exploded')
      },
      'todo-continuation-enforcer': (c, entry) => {
        c.on(entry.event, () => 'steer')
      },
    })
    expect(lines).toEqual([
      EXPECTED_SUMMARY_LINE,
      '[omo-hooks] hook bash-file-read-guard FAILED: Error: registration exploded',
      '[omo-hooks] hook todo-continuation-enforcer registered on agent/turn-stopping',
    ])
    expect(onCalls).toHaveLength(1)
    expect(onCalls[0].event).toBe('agent/turn-stopping')
  })

  it('④ never runs a registrar for an id outside the manifest', () => {
    const { ctx, onCalls } = fakeContext()
    // The loop iterates the MANIFEST, not the registry: a stale registry entry
    // (a hook removed from the roster) must not register silently.
    const lines = collectLines(ctx, HOOK_MANIFEST, {
      'not-in-the-manifest': (c) => {
        c.on('agent/pre-step', () => 'ghost')
      },
    })
    expect(lines).toEqual([EXPECTED_SUMMARY_LINE])
    expect(onCalls).toEqual([])
  })

  it('⑤ registers a returned disposer as the fiber disposal — not an immediate call', () => {
    const { ctx, effectCalls, stopFiber } = fakeContext()
    const dispose = vi.fn()
    collectLines(ctx, HOOK_MANIFEST, {
      'bash-file-read-guard': () => dispose,
    })
    // cordis really did run the execute callback (that is HOW it collects) …
    expect(effectCalls).toHaveLength(1)
    // … but the listener it guards is still live: the disposer was handed over,
    // not called. This is the assertion the flipped forwarding used to break.
    expect(dispose).not.toHaveBeenCalled()
    // Fiber stop is the only moment a forwarded disposer may run — exactly once.
    stopFiber()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('⑥ a registrar that wires ctx.on (the preferred channel) is not forwarded to ctx.effect', () => {
    const { ctx, onCalls, effectCalls, stopFiber } = fakeContext()
    collectLines(ctx, HOOK_MANIFEST, {
      'bash-file-read-guard': (c, entry) => {
        // The preferred channel: cordis scopes `on` to the registering fiber
        // itself, so the registrar returns nothing. The loop must not invent an
        // effect (an execute callback) for it — that would be double wiring.
        c.on(entry.event, () => 'advisory')
      },
    })
    expect(onCalls).toHaveLength(1)
    expect(onCalls[0].event).toBe('tools/post-execute')
    expect(effectCalls).toEqual([])
    // Nothing was collected, so a fiber stop has nothing to run here.
    expect(() => stopFiber()).not.toThrow()
  })

  it('⑦ a broken roster logs ONLY the validation-FAILED line and registers nothing', () => {
    const { ctx, onCalls } = fakeContext()
    // A one-row roster trips validateManifest's EXPECTED_HOOK_COUNT check first.
    const lines = collectLines(ctx, [rowFixture('tools/pre-execute', 1)], {
      'fixture-0': (c) => {
        c.on('tools/pre-execute', () => 'x')
      },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('[omo-hooks] manifest validation FAILED: ')
    expect(lines[0]).toContain('expected 14 hook entries, got 1')
    // No summary line: a count from an untrusted roster must not read as a mount.
    expect(lines.some((line) => line.startsWith('[omo-hooks] loaded'))).toBe(false)
    expect(onCalls).toEqual([])
  })
})

describe('P3-T3 apply() — wiring to the real manifest and registry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('① mounts with the real registry: summary + the one registered listener', () => {
    // P3-T5 filled the registry with its first real entry, so a real boot now
    // logs the summary line AND one `registered` line, and wires one listener.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { ctx, onCalls } = fakeContext()
    apply(ctx)
    expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
      EXPECTED_SUMMARY_LINE,
      '[omo-hooks] hook bash-file-read-guard registered on tools/post-execute',
    ])
    expect(onCalls).toHaveLength(1)
    expect(onCalls[0].event).toBe('tools/post-execute')
  })

  it('② drives a newly added pending registrar through ctx.on (the registry is the extension point)', () => {
    // apply() has no injection seam on purpose (it is the one-argument cordis
    // entry point), so this test saves/restores a real registry entry around the
    // call instead of leaking a permanent fake into sibling tests. The real
    // bash-file-read-guard entry stays in place, so the expected log carries
    // BOTH registered lines in roster order (bash-file-read-guard is row 1,
    // todo-continuation-enforcer is row 2 now that H-01 is gone).
    const id = 'todo-continuation-enforcer'
    expect(HOOK_IDS).toContain(id)
    const previous = HOOK_REGISTRARS[id]
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { ctx, onCalls } = fakeContext()
    try {
      HOOK_REGISTRARS[id] = (c, entry) => {
        c.on(entry.event, () => 'steer')
      }
      apply(ctx)
    } finally {
      if (previous === undefined) delete HOOK_REGISTRARS[id]
      else HOOK_REGISTRARS[id] = previous
    }
    expect(onCalls.map((call) => call.event)).toEqual([
      'tools/post-execute',
      'agent/turn-stopping',
    ])
    expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
      EXPECTED_SUMMARY_LINE,
      '[omo-hooks] hook bash-file-read-guard registered on tools/post-execute',
      '[omo-hooks] hook todo-continuation-enforcer registered on agent/turn-stopping',
    ])
  })

  it('③ every registry key is a real manifest id (no dead registrar can lurk)', () => {
    for (const key of Object.keys(HOOK_REGISTRARS)) {
      expect(HOOK_IDS).toContain(key)
    }
  })
})
