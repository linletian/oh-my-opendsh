// P5-T3 — the omo-team boot-marker formats + the registration loop's
// loud-but-non-fatal behaviour (plan §4.2; task P5-T3).
//
// WHY THE MARKER STRINGS BELOW ARE HARD-CODED. These lines are probe anchors:
// scripts/cold-start.sh and scripts/concerto-mode-probe.sh grep them out of a
// real boot log, and tests/e2e/drive.mjs's `pluginLoaded` analysis matches the
// prefix. A test that derived its expectation from the formatter would agree
// with ANY drift and prove nothing, so the exact summary line is transcribed by
// hand — exactly like tests/omo-commands/boot-markers.test.ts transcribes its
// `[omo-commands] loaded: manifest <N> entries (…)` line (whose `<N>` is left
// abstract THERE on purpose; the literal BELOW is this file's census, hand-placed
// precisely so that a flip has to turn it red in the same commit). The
// transcription doubles as the "counts are derived, not hard-coded" assertion: a
// hard-coded count INSIDE the plugin could not move at all.
//
// If a row flips status or a registrar lands, THIS file must be edited in the
// same commit — that is the intended friction. What IS an invariant and is
// therefore named: the status field ORDER is TEAM_MANIFEST_STATUSES =
// pending, ported, recorded (manifest.ts), so the line stays diffable across
// boots.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it } from 'vitest'
import {
  TEAM_MANIFEST,
  TEAM_MANIFEST_STATUSES,
  type TeamManifestEntry,
} from '../../patches/omo-dsh/omo-team/src/manifest.ts'
import {
  describeError,
  formatLoadedSummaryLine,
  formatManifestValidationFailedLine,
  formatTeamSurfaceFailedLine,
  formatTeamSurfaceRegisteredLine,
} from '../../patches/omo-dsh/omo-team/src/boot-markers.ts'
import {
  runTeamRegistrations,
  TEAM_REGISTRARS,
  type TeamRegistrationContext,
} from '../../patches/omo-dsh/omo-team/src/index.ts'

/**
 * The exact summary line a real boot logs, transcribed by hand.
 *
 * WHY THE CENSUS IS NOT REPEATED IN PROSE. How the rows split between the three
 * statuses, and how many registrars landed, are DERIVED at boot — the first from
 * TEAM_MANIFEST (via manifest.ts's `formatLoadedSummaryLine`, consumed by
 * boot-markers.ts), the second from the registration loop's own outcome — and the
 * whole rendered line is re-derived from the plugin's own modules by
 * scripts/concerto-mode-probe.sh at probe time. The literal BELOW is the
 * census — hand-placed here so a flip turns it red in the same commit, while the
 * derivation it stands in for never needs an edit.
 */
const EXPECTED_SUMMARY_LINE =
  '[omo-team] loaded: manifest 24 entries (pending=15, ported=7, recorded=2) — 7/24 team surfaces registered'

/**
 * P5-T5 landed the FIRST registrar (`team_create`); P5-T6 added the second
 * (`team_send_message`); **P5-T7 adds five** — `team_delete`,
 * `team_shutdown_request`, `team_approve_shutdown`, `team_reject_shutdown`,
 * `team_status` — so the honest `<r>` is 7 and the pinned line above carries
 * it, in MANIFEST ROSTER ORDER (the loop iterates the roster, not this list;
 * the list mirrors it so a reorder turns the boot-line test red). The flip of
 * this list and of the pinned line is the SAME-commit friction the T3 comment
 * predicted: the rows flipped status in manifest.ts, the registrars landed in
 * TEAM_REGISTRARS, and both halves meet in the line the probe re-derives
 * without an edit (scripts/concerto-mode-probe.sh). Ids are resolved through a
 * lookup that throws on a renamed id (a rename must fail HERE, not silently
 * register less).
 */
const REAL_REGISTERED_IDS: readonly string[] = [
  'team_create',
  'team_delete',
  'team_shutdown_request',
  'team_approve_shutdown',
  'team_reject_shutdown',
  'team_send_message',
  'team_status',
]

function registeredRows(ids: readonly string[]): TeamManifestEntry[] {
  return ids.map((id) => {
    const found = TEAM_MANIFEST.find((entry) => entry.id === id)
    if (found === undefined) throw new Error(`no manifest row named ${id} — the id changed, update the pinned line`)
    return found
  })
}

/**
 * A legal manifest row with one field overridden — widened on purpose so these
 * tests can construct rosters the real table does not contain (mixed statuses, a
 * single-row roster). The shape mirrors tests/omo-team/manifest.test.ts's rows;
 * only the fields the formatter and the loop read matter here.
 */
function row(overrides: Partial<TeamManifestEntry> = {}): TeamManifestEntry {
  return {
    id: 'fixture-team-surface',
    upstreamSources: ['packages/team-core/src/fixture.ts'],
    nativeFace: 'fixture native face',
    disposition: 'ported',
    e2eScenario: 'team-create-and-message',
    status: 'pending',
    summary: 'fixture summary',
    ...overrides,
  }
}

/**
 * A roster validateManifest ACCEPTS: EXPECTED_TEAM_MANIFEST_COUNT unique-id
 * legal rows, with per-index overrides applied. The loop validates before it
 * registers (the omo-commands contract), so every loop test needs a
 * full-length table — which is also why the negative validation test feeds a
 * SHORT one and pins the withheld summary.
 */
function fullRoster(overrides: ReadonlyArray<Partial<TeamManifestEntry>> = []): TeamManifestEntry[] {
  return Array.from({ length: 24 }, (_, index) => {
    const override = overrides[index] ?? {}
    return row({ id: `fixture-surface-${index}`, ...override })
  })
}

/**
 * The loop's ctx stand-in. P5-T3 widened nothing (every member optional, the
 * registry empty); P5-T5 promoted `on` + `subagents` to REQUIRED (index.ts's
 * promotion pair); P5-T6 promoted `agents` and widened `subagents` with
 * `sendMessage` (the same pair, exercised a second time) — so the stand-in
 * carries inert stubs of exactly those: `on` records nothing and hands back a
 * disposer, `subagents` throws on any call, `agents.get` answers `undefined`
 * (a loop test that really resolved a live Agent would be the bug this stub
 * catches). Tests override either member when they need to observe more.
 */
function ctx(overrides: Partial<TeamRegistrationContext> = {}): TeamRegistrationContext {
  return {
    on: (_event, _listener) => () => {},
    subagents: {
      startContinuable: async () => {
        throw new Error('ctx-stub: startContinuable must not be called by a registration-loop test')
      },
      interrupt: () => {
        throw new Error('ctx-stub: interrupt must not be called by a registration-loop test')
      },
      drainContinuableChildren: async () => {
        throw new Error('ctx-stub: drainContinuableChildren must not be called by a registration-loop test')
      },
      sendMessage: async () => {
        throw new Error('ctx-stub: sendMessage must not be called by a registration-loop test')
      },
    },
    agents: {
      get: () => undefined,
    },
    ...overrides,
  }
}

describe('P5-T3 formatLoadedSummaryLine — the ONE summary line a boot logs', () => {
  it('renders the REAL manifest as the hard-coded line above', () => {
    // The single most load-bearing assertion in this file: it pins what
    // cold-start.sh and the probe will look for.
    expect(formatLoadedSummaryLine(TEAM_MANIFEST, registeredRows(REAL_REGISTERED_IDS))).toBe(EXPECTED_SUMMARY_LINE)
  })

  it('reports the loop outcome, never a rounding of the manifest statuses', () => {
    // The `registered` half of the line comes from the loop's real output, not
    // from the manifest's statuses — so the REAL roster with NOTHING registered
    // reads `0/24` even though seven rows are ported (the state between the
    // manifest flip and the loop's run is exactly this), and one registered row
    // reads `1/24`.
    const portedStandIn = registeredRows([]).concat(row({ id: 'team_send_message', status: 'ported' }))
    expect(formatLoadedSummaryLine(TEAM_MANIFEST, [])).toBe(
      '[omo-team] loaded: manifest 24 entries (pending=15, ported=7, recorded=2) — 0/24 team surfaces registered',
    )
    expect(formatLoadedSummaryLine(TEAM_MANIFEST, portedStandIn)).toBe(
      '[omo-team] loaded: manifest 24 entries (pending=15, ported=7, recorded=2) — 1/24 team surfaces registered',
    )
  })

  it('derives the status counts from the roster, in TEAM_MANIFEST_STATUSES order', () => {
    const entries = [
      row({ id: 'a', status: 'ported' }),
      row({ id: 'b' }),
      row({ id: 'c', status: 'ported' }),
      row({ id: 'd', status: 'recorded', disposition: 'recorded-difference' }),
    ]
    expect(formatLoadedSummaryLine(entries, [])).toBe(
      '[omo-team] loaded: manifest 4 entries (pending=1, ported=2, recorded=1) — 0/4 team surfaces registered',
    )
  })

  it('reports the loop outcome as <r>/<N> — registered rows, never a hard-coded zero', () => {
    const entries = [row({ id: 'a', status: 'ported' }), row({ id: 'b', status: 'ported' })]
    // A partial registration must be visible in the summary rather than hidden:
    // "<r> below the ported count" is how a 'ported' row with no registrar (or a
    // registrar that threw) reads in a boot log.
    expect(formatLoadedSummaryLine(entries, [entries[0]!])).toBe(
      '[omo-team] loaded: manifest 2 entries (pending=0, ported=2, recorded=0) — 1/2 team surfaces registered',
    )
    expect(formatLoadedSummaryLine(entries, entries)).toBe(
      '[omo-team] loaded: manifest 2 entries (pending=0, ported=2, recorded=0) — 2/2 team surfaces registered',
    )
  })

  it('renders an empty roster as all-zero counts, never as an empty field list', () => {
    // The summary must stay diffable across boots: a zero roster line still
    // prints every status field, in order.
    expect(formatLoadedSummaryLine([], [])).toBe(
      `[omo-team] loaded: manifest 0 entries (`
      + `${TEAM_MANIFEST_STATUSES.map((status) => `${status}=0`).join(', ')})`
      + ' — 0/0 team surfaces registered',
    )
  })

  it('keeps the `[omo-team] loaded` prefix every consumer greps by', () => {
    // cold-start.sh greps `\[omo-team\] loaded`; drive.mjs and smoke-real.mjs
    // match the same prefix inside their boot logs; the probe greps the whole
    // line with -F. The prefix is a contract, not decoration.
    expect(formatLoadedSummaryLine(TEAM_MANIFEST, [])).toMatch(/^\[omo-team\] loaded: /)
  })

  it('is pure — the same inputs render the same line and nothing is mutated', () => {
    const entries = [row({ id: 'a', status: 'ported' }), row({ id: 'b' })]
    const snapshot = JSON.stringify(entries)
    const first = formatLoadedSummaryLine(entries, [entries[0]!])
    const second = formatLoadedSummaryLine(entries, [entries[0]!])
    expect(second).toBe(first)
    expect(JSON.stringify(entries)).toBe(snapshot)
  })
})

describe('P5-T3 per-surface and failure lines', () => {
  it('renders one registered line per team surface id', () => {
    expect(formatTeamSurfaceRegisteredLine('team_create')).toBe('[omo-team] team surface team_create registered')
    expect(formatTeamSurfaceRegisteredLine('team_send_message')).toBe('[omo-team] team surface team_send_message registered')
  })

  it('renders the FAILED line with the error name AND message', () => {
    // `describeError`'s `${name}: ${message}` form is what makes a registration
    // failure diagnosable from a boot log alone.
    expect(formatTeamSurfaceFailedLine('team_create', new TypeError('boom'))).toBe(
      '[omo-team] team surface team_create FAILED: TypeError: boom',
    )
  })

  it('renders a non-Error throw through String() so it is still visible', () => {
    expect(formatTeamSurfaceFailedLine('team_create', 'plain string failure')).toBe(
      '[omo-team] team surface team_create FAILED: plain string failure',
    )
    expect(formatTeamSurfaceFailedLine('team_create', undefined)).toBe(
      '[omo-team] team surface team_create FAILED: undefined',
    )
  })

  it('renders the manifest-validation failure line (the summary is withheld on that path)', () => {
    const line = formatManifestValidationFailedLine(new Error('expected 24 team entries, got 23'))
    expect(line).toBe(
      '[omo-team] manifest validation FAILED: Error: expected 24 team entries, got 23',
    )
    // The two failure forms must never collide: the probe asserts BOTH are
    // absent from a healthy boot, so a renamed form could hide behind the other.
    expect(line).not.toContain('[omo-team] team surface ')
    expect(formatTeamSurfaceFailedLine('x', new Error('y'))).not.toContain('manifest validation')
  })

  it('describeError handles both throwable shapes', () => {
    expect(describeError(new RangeError('r'))).toBe('RangeError: r')
    expect(describeError(42)).toBe('42')
    expect(describeError({ code: 'X' })).toBe('[object Object]')
  })
})

describe('P5-T3 runTeamRegistrations — the loop skeleton, loud-but-non-fatal', () => {
  it('P5-T7: the real manifest + the real registry log the registered lines THEN the summary', () => {
    // The mount-state proof cold-start.sh and the probe grep for: at P5-T3 the
    // registry was empty and the summary stood alone; with `team_create` landed
    // the honest boot was TWO lines at T6; P5-T7 lands five rows (delete +
    // the shutdown trio + status), so the honest boot is exactly SEVEN lines —
    // seven per-surface registered lines in roster order and the summary
    // carrying `7/24` — still no FAILED / validation line.
    const lines: string[] = []
    runTeamRegistrations(ctx(), TEAM_MANIFEST, TEAM_REGISTRARS, (line) => lines.push(line))
    expect(lines).toEqual([
      '[omo-team] team surface team_create registered',
      '[omo-team] team surface team_delete registered',
      '[omo-team] team surface team_shutdown_request registered',
      '[omo-team] team surface team_approve_shutdown registered',
      '[omo-team] team surface team_reject_shutdown registered',
      '[omo-team] team surface team_send_message registered',
      '[omo-team] team surface team_status registered',
      EXPECTED_SUMMARY_LINE,
    ])
  })

  it('the registry table is exactly the landed rows (T8+ must flip this red)', () => {
    // Hand-placed pin, same intended friction as the summary line above: T5
    // landed `team_create`, T6 the message surface, T7 the delete + shutdown
    // trio + status; when T8 lands the task rows, this goes red in the same
    // commit and the flip is reviewed, not discovered.
    expect(Object.keys(TEAM_REGISTRARS)).toEqual([
      'team_create',
      'team_delete',
      'team_shutdown_request',
      'team_approve_shutdown',
      'team_reject_shutdown',
      'team_send_message',
      'team_status',
    ])
  })

  it('a registrar that throws logs FAILED and the loop keeps going (P2-T16)', () => {
    // The loud-but-non-fatal discipline: "one surface bad" must never mean "the
    // rest never registered". Row 0 throws, row 1 still registers, the summary
    // still prints — with the honest `1/24`.
    const roster = fullRoster([
      { id: 'team_create', status: 'ported' },
      { id: 'team_send_message', status: 'ported' },
    ])
    const lines: string[] = []
    runTeamRegistrations(ctx(), roster, {
      team_create: () => {
        throw new TypeError('boom')
      },
      team_send_message: () => {},
    }, (line) => lines.push(line))
    expect(lines).toEqual([
      '[omo-team] team surface team_create FAILED: TypeError: boom',
      '[omo-team] team surface team_send_message registered',
      '[omo-team] loaded: manifest 24 entries (pending=22, ported=2, recorded=0) — 1/24 team surfaces registered',
    ])
  })

  it("skips rows that are not 'ported' — a registrar on a pending row stays SILENT", () => {
    // 'pending' rows have no delivery surface yet and 'recorded' rows deliver
    // prose (status/`disposition` coupling, manifest.ts check 9) — registering
    // either would print a success the tree has not earned.
    const roster = fullRoster([
      { id: 'team_status', status: 'pending' },
      { id: 'team_list', disposition: 'recorded-difference', status: 'recorded' },
    ])
    const lines: string[] = []
    runTeamRegistrations(ctx(), roster, {
      team_status: () => {},
      team_list: () => {},
    }, (line) => lines.push(line))
    expect(lines).toEqual([
      '[omo-team] loaded: manifest 24 entries (pending=23, ported=0, recorded=1) — 0/24 team surfaces registered',
    ])
  })

  it('a ported row with no registrar registers nothing and is NOT counted', () => {
    // The honest `<r>`: the manifest claims the port, the registry cannot
    // register it, and the summary reads the gap instead of hiding it.
    const roster = fullRoster([{ id: 'team_create', status: 'ported' }])
    const lines: string[] = []
    runTeamRegistrations(ctx(), roster, {}, (line) => lines.push(line))
    expect(lines).toEqual([
      '[omo-team] loaded: manifest 24 entries (pending=23, ported=1, recorded=0) — 0/24 team surfaces registered',
    ])
  })

  it('a broken roster logs ONE validation line and WITHHOLDS the summary', () => {
    // A count from an untrusted roster would read like a successful mount — so
    // the `[omo-team] loaded` marker must be ABSENT on this path (cold-start's
    // grep fails loudly, which is the point), and nothing registers.
    const truncated = fullRoster().slice(0, 23)
    const lines: string[] = []
    const registered: string[] = []
    runTeamRegistrations(ctx(), truncated, {
      'fixture-surface-0': () => {
        registered.push('called')
      },
    }, (line) => lines.push(line))
    expect(lines).toEqual([
      '[omo-team] manifest validation FAILED: Error: manifest: expected 24 team entries, got 23',
    ])
    expect(registered).toEqual([])
    expect(lines.join('\n')).not.toContain('[omo-team] loaded')
  })

  it('a returned disposer is REGISTERED, never invoked, at the fiber seam', () => {
    // cordis runs the effect's execute callback immediately and collects its
    // RETURN value as the fiber's disposal (Fiber#_execute) — so the forwarding
    // arrow must return the disposer. Calling it at registration time would
    // dispose the row the moment it registered.
    let disposed = 0
    const effects: Array<() => (() => void) | void> = []
    const roster = fullRoster([{ id: 'team_create', status: 'ported' }])
    const lines: string[] = []
    runTeamRegistrations(
      ctx({ effect: (execute) => effects.push(execute) }),
      roster,
      { team_create: () => () => { disposed += 1 } },
      (line) => lines.push(line),
    )
    expect(effects).toHaveLength(1)
    expect(disposed).toBe(0)
    const collected = effects[0]!()
    expect(disposed).toBe(0)
    collected!()
    expect(disposed).toBe(1)
    expect(lines).toEqual([
      '[omo-team] team surface team_create registered',
      '[omo-team] loaded: manifest 24 entries (pending=23, ported=1, recorded=0) — 1/24 team surfaces registered',
    ])
  })
})
