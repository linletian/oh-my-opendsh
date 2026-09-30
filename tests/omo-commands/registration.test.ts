// P4-T3 — the omo-commands mount: the loud-but-non-fatal registration loop
// (plan §4.1; task P4-T3).
//
// WHAT THIS SUITE PROVES. P4-T2 shipped the roster with every row 'pending';
// P4-T3 ships the loop that will register those rows one at a time from T6. The
// registry is empty on purpose, so **the real-manifest tests below are mostly
// about what a boot must NOT claim**: no `registered` line for a pending row, no
// FAILED line, and exactly one summary line whose counts are derived. The
// positive paths (a ported row registering, a registrar throwing, a disposer being
// adopted by the fiber) are driven through SYNTHETIC registrars and a synthetic
// roster — which is the point: the loop is proven now so T6+ only has to add a
// registrar entry.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COMMAND_MANIFEST,
  type CommandManifestEntry,
} from '../../patches/omo-dsh/omo-commands/src/manifest.ts'
import {
  COMMAND_REGISTRARS,
  apply,
  inject,
  runCommandRegistrations,
  type CommandRegistrar,
  type CommandsRegistrationContext,
} from '../../patches/omo-dsh/omo-commands/src/index.ts'

/**
 * A fake cordis context that models the REAL `ctx.effect` contract, verified
 * against cordis's own Fiber#_execute:
 *
 *   const effect = runner.execute.call(this)
 *   if (typeof effect === "function") return runner.collect(effect)
 *
 * i.e. `effect(execute)` CALLS `execute` at registration time and collects its
 * RETURN VALUE as the fiber disposal; returning undefined collects NOTHING. A
 * fake that merely stored the callback would make a buggy
 * `ctx.effect(() => { disposer() })` look correct, because it would never run
 * the callback — that is the inversion this model exists to prevent (the
 * omo-hooks registration suite models the same contract).
 *
 * `stopFiber()` is the simulated Fiber stop: it runs everything collected from
 * `effect` in reverse registration order, the way cordis's own `dispose` does.
 */
interface FakeContext {
  readonly ctx: CommandsRegistrationContext
  /** Definitions passed to `ctx.commands.register`, in call order. `hint` is the
   *  definition's `input.hint` — P4-T6 registrars add it from the manifest row. */
  readonly registered: { name: string; description: string; hint: string | undefined }[]
  stopFiber(): void
}

function fakeContext(): FakeContext {
  const disposals: (() => void)[] = []
  const registered: { name: string; description: string; hint: string | undefined }[] = []
  const ctx: CommandsRegistrationContext = {
    // P4-T5 added the required `skills` member (the plugin's second mechanism).
    // This suite drives the COMMAND loop only, so the fake records nothing here;
    // the skill loop's own behaviour is pinned in tests/omo-commands/skills.test.ts.
    skills: { register: () => undefined },
    commands: {
      register: (definition) => {
        registered.push({
          name: definition.name,
          description: definition.description,
          // P4-T6: the registrar's only addition to the definition is `input`,
          // derived from the manifest row's `argumentHint` — so the fake has to
          // record it for the assertion to mean anything.
          hint: definition.input?.hint,
        })
        // The real dsh-commands register() is
        //   `return this.layers.effect(this.ctx, (layer) => …)`  (lib/index.js:257-259)
        // — it registers the unregistration with the CALLING FIBER itself and
        // hands back that disposer. So the fake collects the unregistration in
        // the same disposal list `ctx.effect` writes to: stopping the fiber
        // unregisters commands without the plugin's loop doing anything, which
        // is exactly the measured asymmetry documented in index.ts's
        // FIBER REVERSIBILITY note.
        const unregister = () => {
          const index = registered.findIndex((row) => row.name === definition.name)
          if (index >= 0) registered.splice(index, 1)
        }
        disposals.push(unregister)
        return unregister
      },
    },
    effect: (execute) => {
      const disposal = execute()
      if (typeof disposal === 'function') {
        disposals.push(disposal)
        return disposal
      }
      return undefined
    },
  }
  return {
    ctx,
    registered,
    stopFiber: () => {
      // Reverse registration order, like cordis's dispose.
      for (const dispose of [...disposals].reverse()) dispose()
      disposals.length = 0
    },
  }
}

/** A legal row with one field overridden (same widening rationale as boot-markers.test.ts). */
function row(overrides: Partial<CommandManifestEntry> = {}): CommandManifestEntry {
  return {
    id: 'fixture-command',
    upstreamSources: ['packages/omo-opencode/src/features/builtin-commands/templates/fixture.ts'],
    argumentHint: '[fixture]',
    agentBinding: null,
    effectSummary: 'fixture summary',
    e2eScenario: 'fixture-scenario',
    status: 'pending',
    ...overrides,
  }
}

/** A full-length roster (validateManifest pins the count) of rows with overrides. */
function rosterOf(count: number, build: (index: number) => Partial<CommandManifestEntry>): CommandManifestEntry[] {
  return Array.from({ length: count }, (_unused, index) =>
    row({ id: `fixture-command-${index}`, ...build(index) }))
}

/** Runs the loop and returns every line it logged, in order. */
function runLoop(
  entries: readonly CommandManifestEntry[],
  registrars: Readonly<Record<string, CommandRegistrar>>,
  context: FakeContext = fakeContext(),
): { lines: string[]; context: FakeContext } {
  const lines: string[] = []
  runCommandRegistrations(context.ctx, entries, registrars, (line) => lines.push(line))
  return { lines, context }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('P4-T3/T6/T8 the real mount: three commands register, the pending three stay silent', () => {
  it('apply() logs the command summary plus exactly the lines for the three ported rows', () => {
    const logged: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line?: unknown) => {
      logged.push(String(line))
    })
    apply(fakeContext().ctx)
    // TWO lines since P4-T5 — the command summary, then the skill sweep's own
    // summary (this fake's `skills.register` accepts every document, so the
    // real 19-skill sweep reports 19/19 here; the sweep itself is pinned in
    // tests/omo-commands/skills.test.ts). The command surface's contribution is
    // still exactly ONE line.
    // Hand-transcribed, roster order (manifest.ts MANIFEST_ROWS):
    //   ulw-execute, ulw-plan, hyperplan          → pending, silent
    //   stop-continuation, handoff, remove-ai-slops → ported, registered
    // The two `skills:` lines are the OTHER mechanism's (P4-T5's summary) — they
    // are listed only to pin that the command surface contributes exactly one
    // summary line plus its own per-command lines, in that order.
    expect(logged).toEqual([
      '[omo-commands] command stop-continuation registered',
      '[omo-commands] command handoff registered',
      '[omo-commands] command remove-ai-slops registered',
      '[omo-commands] loaded: manifest 6 entries (pending=3, ported=3) — 3/6 commands registered',
      '[omo-commands] skills: 19/19 registered (runtime, vendor path)',
    ])
  })

  it('registers EXACTLY the three ported commands, and never the pending three', () => {
    // The invariant that makes an empty registry honest: silence, never a line
    // that claims success.
    const { lines } = runLoop(COMMAND_MANIFEST, COMMAND_REGISTRARS)
    // Anchored to the per-command PREFIX, not `includes('command ')`: a future
    // line whose text merely mentions the word (e.g. a manifest-validation
    // message counting "command entries") must not be able to satisfy or break
    // this assertion.
    expect(lines.filter((line) => /^\[omo-commands\] command /.test(line))).toEqual([
      '[omo-commands] command stop-continuation registered',
      '[omo-commands] command handoff registered',
      '[omo-commands] command remove-ai-slops registered',
    ])
    // NOTHING may be reported as FAILED on a healthy mount: the two ported rows
    // registered, so a FAILED line here would mean the loop logged both a success
    // and a failure for the same roster.
    expect(lines.filter((line) => line.includes('FAILED'))).toEqual([])
    expect(lines).toEqual([
      '[omo-commands] command stop-continuation registered',
      '[omo-commands] command handoff registered',
      '[omo-commands] command remove-ai-slops registered',
      '[omo-commands] loaded: manifest 6 entries (pending=3, ported=3) — 3/6 commands registered',
    ])
  })

  it('registers the three ported commands with their measured descriptions and hints', () => {
    // `input.hint` comes from the manifest row's `argumentHint` (one fact, one
    // place). `remove-ai-slops` has NO hint upstream (commands.ts:85-92) and so
    // no `input` member at all — asserted as `undefined`, not as an empty string.
    const { context } = runLoop(COMMAND_MANIFEST, COMMAND_REGISTRARS)
    expect(context.registered.map((entry) => [entry.name, entry.hint])).toEqual([
      ['stop-continuation', undefined],
      ['handoff', '[goal]'],
      ['remove-ai-slops', undefined],
    ])
    expect(context.registered.map((entry) => entry.description)).toEqual([
      '(builtin) Stop all continuation mechanisms (ralph loop, todo continuation, boulder) for this session',
      '(builtin) Create a detailed context summary for continuing work in a new session',
      '(builtin) Remove AI-generated code smells from branch changes and critically review the results',
    ])
  })

  it('COMMAND_REGISTRARS holds exactly the ported rows, in roster order', () => {
    // If this fails, the summary line in the test above is stale prose: a landed
    // command needs the hard-coded line updated in the SAME commit. Both halves
    // are named — the registry keys AND the statuses they correspond to.
    expect(Object.keys(COMMAND_REGISTRARS)).toEqual(['stop-continuation', 'handoff', 'remove-ai-slops'])
    expect(COMMAND_MANIFEST.map((entry) => entry.status)).toEqual([
      'pending', 'pending', 'pending', 'ported', 'ported', 'ported',
    ])
  })

  it('declares BOTH registry services as injected hard dependencies', () => {
    // Why the boot waits instead of throwing: cordis holds the fiber in the
    // waiting state until the registry services exist. dsh-base mounts both —
    // `- id: commands → @deepseek-ai/dsh-commands` and
    // `- id: skill → @deepseek-ai/dsh-skill` (cordis.patch.yml:273-274) — so
    // every profile that can boot the overlay already carries them. Order is
    // the plugin's own (commands, then skills), matching apply()'s two loops.
    expect(inject).toEqual(['commands', 'skills'])
  })

  it('NEVER carries a `ulw-plan` registrar — the product ban, pinned where the registry lives', () => {
    // Registering a same-named `ulw-plan` command would shadow dsh's own
    // SKILL_GESTURE bridge (dsh-tool-skill): dsh's command layer resolves the
    // name first, so the skill gesture would never be matched. This is a
    // PRODUCT constraint, not a scheduling detail — from T6 on, any of the other
    // five rows may be added here, never this one.
    //
    // It is asserted on COMMAND_REGISTRARS (not only "the registry is empty",
    // which the previous test covers) so that it SURVIVES T6+ filling the
    // registry: the ban is a per-id property, and an `toEqual([])` emptiness
    // check would be replaced wholesale by the first landed command, taking
    // this guard with it.
    expect(Object.keys(COMMAND_REGISTRARS)).not.toContain('ulw-plan')
    // Same fact from the manifest side, transcribed from the row itself: its
    // effectSummary is where the ban is recorded (the row is a
    // skill-as-command landing — `agentBinding: null`, no handler). Asserting
    // here means a future edit cannot quietly drop the row's own statement
    // while the registry guard still passes.
    const ulwPlan = COMMAND_MANIFEST.find((entry) => entry.id === 'ulw-plan')
    expect(ulwPlan?.effectSummary).toContain('omo-commands 不注册同名命令')
  })
})

describe('P4-T3 the loop: registering a row that flipped to ported', () => {
  it('registers it, logs its line, and counts it in the summary', () => {
    const entries = rosterOf(6, (index) => (index === 0 ? { id: 'ulw-execute', status: 'ported' } : {}))
    const registrar: CommandRegistrar = vi.fn((ctx, entry) => {
      ctx.commands.register({ name: entry.id, description: entry.effectSummary, handler: () => ({ kind: 'success' }) })
    })
    const { lines, context } = runLoop(entries, { 'ulw-execute': registrar })
    expect(lines).toEqual([
      '[omo-commands] command ulw-execute registered',
      '[omo-commands] loaded: manifest 6 entries (pending=5, ported=1) — 1/6 commands registered',
    ])
    expect(registrar).toHaveBeenCalledTimes(1)
    expect(context.registered).toEqual([{ name: 'ulw-execute', description: 'fixture summary' }])
  })

  it('skips a ported row whose registrar is missing — silent, uncounted, never claimed', () => {
    // The "manifest claims a port this tree cannot register" case: the summary
    // must read 0/1 registered with ported=1, never a registered line.
    const entries = rosterOf(6, (index) => (index === 2 ? { id: 'hyperplan', status: 'ported' } : {}))
    const { lines } = runLoop(entries, {})
    expect(lines).toEqual([
      '[omo-commands] loaded: manifest 6 entries (pending=5, ported=1) — 0/6 commands registered',
    ])
  })

  it('skips a pending row even when a registrar exists for it', () => {
    // Status is the gate, not the registry: a registrar that lands before the
    // manifest row flips (or after a re-open) must not register a pending row.
    const entries = rosterOf(6, (index) => (index === 1 ? { id: 'ulw-plan', status: 'pending' } : {}))
    const registrar: CommandRegistrar = vi.fn()
    const { lines } = runLoop(entries, { 'ulw-plan': registrar })
    expect(registrar).not.toHaveBeenCalled()
    expect(lines).toEqual([
      '[omo-commands] loaded: manifest 6 entries (pending=6, ported=0) — 0/6 commands registered',
    ])
  })

  it('processes rows in roster order', () => {
    const entries = rosterOf(6, (index) => ({ status: 'ported' }))
    const registrars: Record<string, CommandRegistrar> = Object.fromEntries(
      entries.map((entry) => [entry.id, () => {}]),
    )
    const { lines } = runLoop(entries, registrars)
    expect(lines.slice(0, 6)).toEqual([
      '[omo-commands] command fixture-command-0 registered',
      '[omo-commands] command fixture-command-1 registered',
      '[omo-commands] command fixture-command-2 registered',
      '[omo-commands] command fixture-command-3 registered',
      '[omo-commands] command fixture-command-4 registered',
      '[omo-commands] command fixture-command-5 registered',
    ])
  })
})

describe('P4-T3 the loop: loud-but-non-fatal (P2-T16 discipline)', () => {
  it('logs FAILED for a throwing registrar, keeps going, and does NOT count it', () => {
    const entries = rosterOf(6, (index) => (index === 0 || index === 1 ? { status: 'ported' } : {}))
    const boom: CommandRegistrar = () => {
      throw new TypeError('template render failed')
    }
    const fine: CommandRegistrar = vi.fn()
    const { lines } = runLoop(entries, {
      'fixture-command-0': boom,
      'fixture-command-1': fine,
    })
    expect(lines).toEqual([
      '[omo-commands] command fixture-command-0 FAILED: TypeError: template render failed',
      '[omo-commands] command fixture-command-1 registered',
      // The summary counts only what actually registered — 1, not 2.
      '[omo-commands] loaded: manifest 6 entries (pending=4, ported=2) — 1/6 commands registered',
    ])
    expect(fine).toHaveBeenCalledTimes(1)
  })

  it('withholds the summary and registers nothing when the roster itself is invalid', () => {
    // The manifest-validation form is a WHOLE-ROSTER failure: no summary line at
    // all, so cold-start's `[omo-commands] loaded` grep fails loudly instead of
    // reading a count from an untrusted roster.
    const { lines, context } = runLoop(rosterOf(5, () => ({})), {})
    expect(lines).toEqual([
      // The inner text is validateManifest's own message, `manifest: …` prefix
      // included — the boot line does not restate it.
      '[omo-commands] manifest validation FAILED: Error: manifest: expected 6 command entries, got 5',
    ])
    expect(context.registered).toEqual([])
  })

  it('accepts a valid full-length roster with no problems (positive control)', () => {
    const { lines } = runLoop(rosterOf(6, () => ({})), {})
    expect(lines).toEqual([
      '[omo-commands] loaded: manifest 6 entries (pending=6, ported=0) — 0/6 commands registered',
    ])
  })
})

describe('P4-T3 the loop: fiber reversibility (discipline ①)', () => {
  it('adopts a returned disposer via ctx.effect — collected, and run on fiber stop', () => {
    // The forwarding arrow RETURNS the disposer (cordis collects the effect's
    // return value); an inline call would have torn the registration down at
    // registration time and left the fiber with no disposal at all.
    const entries = rosterOf(6, (index) => (index === 0 ? { status: 'ported' } : {}))
    let disposed = false
    const registrar: CommandRegistrar = (ctx, entry) => {
      ctx.commands.register({ name: entry.id, description: entry.effectSummary, handler: () => ({ kind: 'success' }) })
      return () => {
        disposed = true
      }
    }
    const { lines, context } = runLoop(entries, { 'fixture-command-0': registrar })
    // Still registered right after the loop: the disposer was collected, not called.
    expect(disposed).toBe(false)
    expect(context.registered).toHaveLength(1)
    expect(lines[0]).toBe('[omo-commands] command fixture-command-0 registered')

    context.stopFiber()
    expect(disposed).toBe(true)
    // The command registration itself is fiber-scoped by dsh (register() returns
    // layers.effect(...)), so stopping the fiber unregisters it too.
    expect(context.registered).toEqual([])
  })

  it('tolerates a registrar that returns nothing (the plain-handler case)', () => {
    const entries = rosterOf(6, (index) => (index === 0 ? { status: 'ported' } : {}))
    const registrar: CommandRegistrar = () => {}
    const { lines } = runLoop(entries, { 'fixture-command-0': registrar })
    expect(lines[0]).toBe('[omo-commands] command fixture-command-0 registered')
  })
})
