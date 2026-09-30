// P4-T3 — the omo-commands boot-marker formats (plan §4.1; task P4-T3).
//
// WHY THE MARKER STRINGS BELOW ARE HARD-CODED. These lines are probe anchors:
// scripts/cold-start.sh and scripts/concerto-mode-probe.sh grep them out of a
// real boot log, and tests/e2e/drive.mjs's `pluginLoaded` analysis matches the
// prefix. A test that derived its expectation from the formatter would agree
// with ANY drift and prove nothing, so the exact summary line is transcribed by
// hand — exactly like tests/omo-hooks/registration.test.ts transcribes
// `[omo-hooks] loaded: manifest 14 entries (…)`. The transcription doubles as the
// "counts are derived, not hard-coded" assertion: a hard-coded count INSIDE the
// plugin could not move at all.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it } from 'vitest'
import {
  COMMAND_MANIFEST,
  COMMAND_MANIFEST_STATUSES,
  type CommandManifestEntry,
} from '../../patches/omo-dsh/omo-commands/src/manifest.ts'
import {
  describeError,
  formatCommandFailedLine,
  formatCommandRegisteredLine,
  formatLoadedSummaryLine,
  formatManifestValidationFailedLine,
  formatSkillFailedLine,
  formatSkillsScanFailedLine,
  formatSkillsSummaryLine,
} from '../../patches/omo-dsh/omo-commands/src/boot-markers.ts'

/**
 * The exact summary line a real boot logs TODAY, transcribed by hand: 6 manifest
 * rows, all 'pending' (P4-T2 shipped the roster; P4-T3 ships the mount with an
 * empty implementation registry), 0 registered. The status field order is
 * COMMAND_MANIFEST_STATUSES = pending, ported. If a row flips to 'ported' or a
 * registrar lands, THIS file must be edited in the same commit — that is the
 * intended friction, and scripts/concerto-mode-probe.sh re-derives the same
 * line from the plugin's own modules at probe time.
 */
// P4-T8 更新：第三条命令落地后本行随之改写（pending=3, ported=3, 3/6 registered）。
// 逐字手打而非由 manifest 派生，正是这条断言的价值：派生会让它与被测对象同源，
// 恒真；cold-start.sh 与 concerto-mode-probe.sh 按同一字符串 grep，所以任何漂移
// 先在这里变红，而不是等到真机 boot。
const EXPECTED_SUMMARY_LINE =
  '[omo-commands] loaded: manifest 6 entries (pending=3, ported=3) — 3/6 commands registered'

/**
 * A legal manifest row with one field overridden — widened on purpose so these
 * tests can construct rosters the real table does not contain (mixed statuses, a
 * single-row roster). Only the fields a formatter reads matter here; the shape
 * mirrors tests/omo-commands/manifest.test.ts's RowFixture.
 */
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

/**
 * P4-T6: the formatter's `registered` argument is the roster rows the loop
 * actually registered, so the real-mount expectation passes the two ported
 * rows — named by hand, not filtered out of the same object under test, and
 * resolved through a lookup that throws on a renamed id (a rename must fail
 * here, not silently register 1/6).
 */
const REAL_REGISTERED_IDS = ['stop-continuation', 'handoff', 'remove-ai-slops']

function registeredRows(ids: readonly string[]): CommandManifestEntry[] {
  return ids.map((id) => {
    const found = COMMAND_MANIFEST.find((entry) => entry.id === id)
    if (found === undefined) throw new Error(`no manifest row named ${id} — the id changed, update the pinned line`)
    return found
  })
}

describe('P4-T3 formatLoadedSummaryLine — the ONE summary line a boot logs', () => {
  it('renders the REAL manifest as the hard-coded line above', () => {
    // The single most load-bearing assertion in this file: it pins what
    // cold-start.sh and the probe will look for.
    expect(formatLoadedSummaryLine(COMMAND_MANIFEST, registeredRows(REAL_REGISTERED_IDS))).toBe(EXPECTED_SUMMARY_LINE)
  })

  it('still reports 0 registered when the loop registered nothing (empty is not a rounding error)', () => {
    // The `registered` half of the line comes from the loop's real output, not
    // from the manifest's statuses — so a roster of two ported rows with an
    // empty registration log must read 0/6, never 2/6.
    expect(formatLoadedSummaryLine(COMMAND_MANIFEST, [])).toBe(
      '[omo-commands] loaded: manifest 6 entries (pending=3, ported=3) — 0/6 commands registered',
    )
  })

  it('derives the status counts from the roster, in COMMAND_MANIFEST_STATUSES order', () => {
    const entries = [
      row({ id: 'a', status: 'ported' }),
      row({ id: 'b' }),
      row({ id: 'c', status: 'ported' }),
      row({ id: 'd' }),
    ]
    expect(formatLoadedSummaryLine(entries, [])).toBe(
      '[omo-commands] loaded: manifest 4 entries (pending=2, ported=2) — 0/4 commands registered',
    )
  })

  it('reports the loop outcome as <r>/<N> — registered rows, never a hard-coded zero', () => {
    const entries = [row({ id: 'a', status: 'ported' }), row({ id: 'b', status: 'ported' })]
    // A partial registration must be visible in the summary rather than hidden:
    // "<r> below the ported count" is how a 'ported' row with no registrar (or a
    // registrar that threw) reads in a boot log.
    expect(formatLoadedSummaryLine(entries, [entries[0]!])).toBe(
      '[omo-commands] loaded: manifest 2 entries (pending=0, ported=2) — 1/2 commands registered',
    )
    expect(formatLoadedSummaryLine(entries, entries)).toBe(
      '[omo-commands] loaded: manifest 2 entries (pending=0, ported=2) — 2/2 commands registered',
    )
  })

  it('renders an empty roster as all-zero counts, never as an empty field list', () => {
    // The summary must stay diffable across boots: a zero roster line still
    // prints every status field, in order.
    expect(formatLoadedSummaryLine([], [])).toBe(
      `[omo-commands] loaded: manifest 0 entries (`
      + `${COMMAND_MANIFEST_STATUSES.map((status) => `${status}=0`).join(', ')})`
      + ' — 0/0 commands registered',
    )
  })

  it('keeps the `[omo-commands] loaded` prefix every consumer greps by', () => {
    // cold-start.sh greps `\[omo-commands\] loaded`; drive.mjs matches the same
    // prefix inside its boot log. The prefix is a contract, not decoration.
    expect(formatLoadedSummaryLine(COMMAND_MANIFEST, [])).toMatch(/^\[omo-commands\] loaded: /)
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

describe('P4-T3 per-command and failure lines', () => {
  it('renders one registered line per command id', () => {
    expect(formatCommandRegisteredLine('ulw-execute')).toBe('[omo-commands] command ulw-execute registered')
    expect(formatCommandRegisteredLine('handoff')).toBe('[omo-commands] command handoff registered')
  })

  it('renders the FAILED line with the error name AND message', () => {
    // `describeError`'s `${name}: ${message}` form is what makes a registration
    // failure diagnosable from a boot log alone.
    expect(formatCommandFailedLine('hyperplan', new TypeError('boom'))).toBe(
      '[omo-commands] command hyperplan FAILED: TypeError: boom',
    )
  })

  it('renders a non-Error throw through String() so it is still visible', () => {
    expect(formatCommandFailedLine('hyperplan', 'plain string failure')).toBe(
      '[omo-commands] command hyperplan FAILED: plain string failure',
    )
    expect(formatCommandFailedLine('hyperplan', undefined)).toBe(
      '[omo-commands] command hyperplan FAILED: undefined',
    )
  })

  it('renders the manifest-validation failure line (the summary is withheld on that path)', () => {
    const line = formatManifestValidationFailedLine(new Error('expected 6 command entries, got 5'))
    expect(line).toBe(
      '[omo-commands] manifest validation FAILED: Error: expected 6 command entries, got 5',
    )
    // The three failure forms must never collide: the probe asserts the
    // per-command FAILED form and the manifest form are both ABSENT from a good
    // boot, so a renamed form could hide behind the other. The discriminator is
    // the PREFIX — the manifest form's own text legitimately contains the words
    // "command entries" (validateManifest's message), so the probe greps
    // `[omo-commands] command ` and `[omo-commands] manifest validation FAILED`.
    expect(line).not.toContain('[omo-commands] command ')
    expect(formatCommandFailedLine('x', new Error('y'))).not.toContain('manifest validation')
  })

  it('describeError handles both throwable shapes', () => {
    expect(describeError(new RangeError('r'))).toBe('RangeError: r')
    expect(describeError(42)).toBe('42')
    expect(describeError({ code: 'X' })).toBe('[object Object]')
  })
})

describe('P4-T5 the skill-delivery markers', () => {
  it('renders the healthy sweep as ONE field-ized line with no failure clause', () => {
    // Hand-transcribed: this is the line cold-start.sh and the probe grep for.
    // The failure clause is ABSENT at zero failures on purpose — a boot log that
    // always says ", 0 failed" is noise that trains readers to skip the field.
    expect(formatSkillsSummaryLine({ registered: 19, total: 19, failed: 0 })).toBe(
      '[omo-commands] skills: 19/19 registered (runtime, vendor path)',
    )
  })

  it('appends the failure count ONLY when non-zero, and derives the ratio from the inputs', () => {
    expect(formatSkillsSummaryLine({ registered: 18, total: 19, failed: 1 })).toBe(
      '[omo-commands] skills: 18/19 registered (runtime, vendor path), 1 failed',
    )
    expect(formatSkillsSummaryLine({ registered: 0, total: 2, failed: 2 })).toBe(
      '[omo-commands] skills: 0/2 registered (runtime, vendor path), 2 failed',
    )
    // A partial sweep must read as partial; nothing here can round to "all good".
    expect(formatSkillsSummaryLine({ registered: 1, total: 3, failed: 2 })).not.toContain('1/1')
  })

  it('keeps the `[omo-commands] skills:` prefix cold-start.sh greps by', () => {
    expect(formatSkillsSummaryLine({ registered: 0, total: 0, failed: 0 }))
      .toMatch(/^\[omo-commands\] skills: /)
  })

  it('names a failing skill by its DIRECTORY name, so an unparseable file is still nameable', () => {
    // The frontmatter name is unknowable exactly when the file is broken, so
    // the log line must not depend on having read it.
    expect(formatSkillFailedLine('remove-ai-slops', new Error('missing YAML frontmatter'))).toBe(
      '[omo-commands] skill remove-ai-slops FAILED: Error: missing YAML frontmatter',
    )
    expect(formatSkillFailedLine('x', 'plain string failure')).toBe(
      '[omo-commands] skill x FAILED: plain string failure',
    )
  })

  it('keeps the skill FAILED form distinct from the command FAILED form', () => {
    // The probe asserts BOTH are absent from a healthy boot; a renamed form
    // could hide behind the other.
    expect(formatSkillFailedLine('git-master', new Error('x'))).not.toContain('[omo-commands] command ')
    expect(formatCommandFailedLine('hyperplan', new Error('x'))).not.toContain('[omo-commands] skill ')
  })

  it('names the tree in the skills-scan FAILED form, which no per-skill form may collide with', () => {
    // The tree-level failure belongs to no skill, so it must NOT look like one:
    // the probe greps `[omo-commands] skill .* FAILED` as "no per-skill failure",
    // and a tree failure matching that pattern would be counted as a broken
    // vendored file instead of a missing tree.
    expect(formatSkillsScanFailedLine('/v/vendor/skills', new Error('ENOENT: no such file or directory'))).toBe(
      '[omo-commands] skills scan FAILED: Error: ENOENT: no such file or directory — 0 skills discovered under /v/vendor/skills',
    )
    expect(formatSkillsScanFailedLine('/v/vendor/skills', 'plain string failure')).not.toMatch(
      /\[omo-commands\] skill .* FAILED/,
    )
  })
})
