// P3-T2 — the Phase 3 hook manifest single source of truth (plan §4.1;
// coverage baseline docs/plans/phase3-dev/phase3-hooks.md §1).
//
// WHY EVERY EXPECTATION BELOW IS HARD-CODED. The point of this suite is
// mutation sensitivity: a test that derives its expectation from manifest.ts
// agrees with ANY drift in manifest.ts and is therefore worthless. So the
// expected id set, the hard-coded spot-checked rows and the 14-count are transcribed
// by hand from the coverage baseline, exactly like tests/omo-agents/roster.test.ts
// transcribes phase2-roster.md §1 总表. If a row changes, THIS file must be
// edited in the same commit — that is the intended friction (the plan §4.1
// single-source rule plus the T20 doc-consistency gate).
//
// The `.ts` extension in the import path is load-bearing (Node 24
// type-stripping does no specifier resolution; see index.ts's header).
import { describe, expect, it } from 'vitest'
import {
  EXPECTED_HOOK_COUNT,
  HOOK_IDS,
  HOOK_MANIFEST,
  MANIFEST_EVENTS,
  MANIFEST_MODES,
  hooksByEvent,
  hooksByStatus,
  manifestEventSet,
  manifestModeSet,
  validateManifest,
  type HookManifestEntry,
} from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'

/**
 * phase3-hooks.md §1 移植组 ids, in priority order, transcribed by hand
 * (H-02, H-03, H-07, H-10, H-11, H-14, H-15, H-16, H-21, H-22, H-23,
 * H-24, H-26, H-32 → their v5-named listener ids). H-01
 * (`write-existing-file-guard`) is deliberately ABSENT: WP-2/P3-T5 moved it to
 * the DSH-native skip list (dsh-fs-observation-policy covers it), 15 → 14.
 */
const EXPECTED_IDS: readonly string[] = [
  'bash-file-read-guard',
  'todo-continuation-enforcer',
  'empty-task-response-detector',
  'session-notification',
  'background-notification',
  'edit-error-recovery',
  'json-error-recovery',
  'tool-output-truncator',
  'directory-readme-injector',
  'agent-usage-reminder',
  'task-resume-info',
  'webfetch-redirect-guard',
  'prometheus-md-only',
  'ulw-execute',
]

/**
 * The harness's own row shape, WIDENED on purpose. validateManifest exists to
 * reject malformed INPUT, so the negative tests must be able to build rows that
 * the manifest.ts literal types would refuse at compile time (an illegal mode
 * 'G', an 'agent/session-idle' event that P3-T1 proved does not exist). Deriving
 * this from the real module's narrowed `HookManifestEntry` would make every
 * malformed fixture a type error — i.e. the rejection tests could not be
 * written at all.
 */
interface RowFixture {
  id: string
  upstreamFiles: readonly string[]
  upstreamTestFiles: readonly string[]
  event: string
  mode: string
  summary: string
  e2eScenario: string
  status: string
}

/** One legal baseline row, so each negative test changes exactly ONE field. */
function legalRow(overrides: Partial<RowFixture> = {}): RowFixture {
  return {
    id: 'fixture-hook',
    upstreamFiles: ['packages/omo-opencode/src/hooks/fixture-hook/hook.ts'],
    upstreamTestFiles: [],
    event: 'tools/pre-execute',
    mode: 'B',
    summary: 'fixture summary',
    e2eScenario: 'fixture-scenario',
    status: 'pending',
    ...overrides,
  }
}

/**
 * `n` distinct legal rows — validateManifest also pins the row COUNT
 * (EXPECTED_HOOK_COUNT), so any negative case must supply a full-length roster
 * or the count check would fire first and mask the check under test.
 */
function legalRows(count: number): RowFixture[] {
  return Array.from({ length: count }, (_unused, index) => legalRow({
    id: `fixture-hook-${index}`,
  }))
}

/** Calls validateManifest with widened fixtures and returns the thrown message. */
function rejectionMessage(rows: readonly RowFixture[]): string {
  try {
    validateManifest(rows as readonly HookManifestEntry[])
    throw new Error('validateManifest accepted an invalid roster')
  } catch (err) {
    if (err instanceof Error) return err.message
    throw err
  }
}

describe('P3-T2 HOOK_MANIFEST — shape and content', () => {
  it('① accepts the real HOOK_MANIFEST as currently authored', () => {
    // Non-vacuous by construction, not by this line: validateManifest's first
    // check is the EXPECTED_HOOK_COUNT equality (manifest.ts check 5), so an
    // empty table throws "expected 14 hook entries, got 0" rather than passing
    // a bare call. The explicit length assertion below documents that intent
    // for the reader.
    expect(HOOK_MANIFEST.length).toBeGreaterThan(0)
    expect(() => validateManifest(HOOK_MANIFEST)).not.toThrow()
  })

  it('⑥ declares exactly 14 entries — the P3-T5 port-group count (15 minus H-01)', () => {
    // Pins phase3-hooks.md §5 after the WP-2 arbitration removed H-01. Without
    // the non-empty assertion a dropped collection (suite never ran) would look
    // like a green.
    expect(HOOK_MANIFEST.length).toBe(14)
    expect(HOOK_MANIFEST.length).toBe(EXPECTED_HOOK_COUNT)
  })

  it('③ ids equal the hard-coded 14-id list, in priority order', () => {
    expect(HOOK_IDS).toEqual([...EXPECTED_IDS])
    expect([...new Set(HOOK_IDS)].length).toBe(EXPECTED_IDS.length)
  })

  it('③ the raw entry ids match too — HOOK_IDS cannot disagree with the table', () => {
    expect(HOOK_MANIFEST.map((entry) => entry.id)).toEqual([...EXPECTED_IDS])
  })

  it('declares only the six P3-T1-verified events and the six A–F modes', () => {
    expect([...MANIFEST_EVENTS]).toEqual([
      'agent/pre-step',
      'tools/pre-execute',
      'tools/post-execute',
      'agent/turn-stopping',
      'session/event',
      'agent/status',
    ])
    expect([...MANIFEST_MODES]).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    expect([...manifestEventSet]).toEqual([...MANIFEST_EVENTS])
    expect([...manifestModeSet]).toEqual([...MANIFEST_MODES])
  })

  it('exactly one row is ported as of P3-T7 (H-02; the other 13 still pending)', () => {
    // P3-T7 flipped H-02 after the WP-2 仲裁 accepted the T6 e2e (scenario
    // `bash-read-guard-warned`). The hard-coded split is the point: a second row
    // silently flipping would let a not-yet-e2e-proven hook look shipped.
    expect(hooksByStatus(HOOK_MANIFEST, 'pending').length).toBe(13)
    expect(hooksByStatus(HOOK_MANIFEST, 'ported').map((row) => row.id)).toEqual([
      'bash-file-read-guard',
    ])
  })
})

describe('P3-T2 HOOK_MANIFEST — spot checks (hard-coded against phase3-hooks.md)', () => {
  it('④ the removed H-01 row really is gone (no write-existing-file-guard)', () => {
    // WP-2/P3-T5: dsh-fs-observation-policy covers the write-before-read guard
    // natively (and adds version CAS staleness detection), so the row must NOT
    // reappear without a plan-level reversal.
    expect(HOOK_MANIFEST.some((row) => row.id === 'write-existing-file-guard')).toBe(false)
    expect(HOOK_IDS).not.toContain('write-existing-file-guard')
    expect(HOOK_MANIFEST.some(
      (row) => row.upstreamFiles.some((file) => file.includes('write-existing-file-guard')),
    )).toBe(false)
  })

  it('④ bash-file-read-guard is the C half on tools/post-execute (the new first row)', () => {
    const entry = HOOK_MANIFEST.find((row) => row.id === 'bash-file-read-guard')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('C')
    expect(entry?.event).toBe('tools/post-execute')
    expect(entry?.upstreamFiles).toEqual([
      'packages/omo-opencode/src/hooks/bash-file-read-guard.ts',
    ])
    expect(entry?.upstreamTestFiles).toEqual([])
    expect(entry?.e2eScenario).toBe('bash-read-guard-warned')
    // Flipped by P3-T7: listener + unit test + T6 e2e all landed.
    expect(entry?.status).toBe('ported')
    expect(HOOK_IDS[0]).toBe('bash-file-read-guard')
  })

  it('④ session-notification is the F family, 16 implementation files, no AGENTS.md', () => {
    const entry = HOOK_MANIFEST.find((row) => row.id === 'session-notification')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('F')
    expect(entry?.event).toBe('session/event')
    // 21 upstream files = 16 implementation + 5 test (phase3-hooks.md §1 H-10).
    expect(entry?.upstreamFiles.length).toBe(16)
    expect(entry?.upstreamTestFiles.length).toBe(5)
    expect(entry?.upstreamFiles[0]).toBe(
      'packages/omo-opencode/src/hooks/session-notification-content.ts',
    )
    expect(entry?.upstreamFiles.at(-1)).toBe(
      'packages/omo-opencode/src/hooks/session-notification.ts',
    )
    // The helper merged into this module (N-04) is NOT a session-notification
    // prefix file, so it must not appear in either list.
    expect(entry?.upstreamFiles.some((file) => file.includes('session-todo-status'))).toBe(false)
    expect(entry?.e2eScenario).toBe('session-notification-log')
  })

  it('④ background-notification is the F sibling, pinned to its landed e2e scenario', () => {
    // F1 (P3-T13 review): the H-11 row declared `background-notification-logged`
    // while the landed scenario is `background-notification-log`. The pin below
    // is the hand-transcribed expectation that makes that drift loud — the same
    // shape as the session-notification row above. The scenario name itself is
    // the SCENARIOS row in tests/e2e/drive.mjs.
    const entry = HOOK_MANIFEST.find((row) => row.id === 'background-notification')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('F')
    expect(entry?.event).toBe('session/event')
    expect(entry?.e2eScenario).toBe('background-notification-log')
  })

  it('④ ulw-execute is the pre-step A row sourced from hooks/start-work/', () => {
    const entry = HOOK_MANIFEST.find((row) => row.id === 'ulw-execute')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('A')
    expect(entry?.event).toBe('agent/pre-step')
    // v5 naming anchor on the ID, v4.19.4 path in the source attribution
    // (ROADMAP §2 规则 6): 20 files = 13 implementation + 7 test.
    expect(entry?.upstreamFiles.length).toBe(13)
    expect(entry?.upstreamTestFiles.length).toBe(7)
    expect(entry?.upstreamFiles.every(
      (file) => file.startsWith('packages/omo-opencode/src/hooks/start-work/'),
    )).toBe(true)
    expect(entry?.upstreamFiles.some((file) => file.includes('/start-work/index.test.ts'))).toBe(false)
    expect(entry?.e2eScenario).toBe('ulw-execute-plan-intent')
  })

  it('④ tool-output-truncator is the single-file hooks/ row with its co-located test', () => {
    // First-round MAJOR site: the row must stay the ONE hooks/ implementation
    // file plus its co-located test, so any attempt to "fix" the H-16 accounting
    // by smuggling shared/ support files (or the AGENTS.md-adjacent doc) into
    // either list is caught here — the upstreamTestFiles list is pinned exactly,
    // not by length. Measured at v4.19.4 with
    // `git ls-tree -r --name-only v4.19.4 .../hooks/ | grep tool-output-truncator`
    // (2 entries).
    const entry = HOOK_MANIFEST.find((row) => row.id === 'tool-output-truncator')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('D')
    expect(entry?.event).toBe('tools/post-execute')
    expect(entry?.upstreamFiles).toEqual([
      'packages/omo-opencode/src/hooks/tool-output-truncator.ts',
    ])
    expect(entry?.upstreamTestFiles).toEqual([
      'packages/omo-opencode/src/hooks/tool-output-truncator.test.ts',
    ])
    expect(entry?.e2eScenario).toBe('tool-output-truncated')
  })

  it('the B+D rows record the primary decision surface (event/mode) plus D in the summary', () => {
    for (const id of ['webfetch-redirect-guard', 'prometheus-md-only']) {
      const entry = HOOK_MANIFEST.find((row) => row.id === id)
      expect(entry, id).toBeDefined()
      expect(entry?.mode, id).toBe('B')
      expect(entry?.event, id).toBe('tools/pre-execute')
      // The manifest has no secondary-event field, so the D half must be
      // discoverable from the summary — pin the full-width "（含 D）" marker
      // the two rows use (the manifest comments are Chinese; the ASCII
      // parens would silently not match).
      expect(entry?.summary, id).toContain('（含 D）')
    }
  })
})

describe('P3-T2 validateManifest — rejection branches', () => {
  it('② throws on an empty id', () => {
    const rows = legalRows(EXPECTED_HOOK_COUNT)
    rows[0] = legalRow({ id: '' })
    expect(rejectionMessage(rows)).toContain('empty id')
  })

  it('② throws on an empty upstreamFiles array', () => {
    const rows = legalRows(EXPECTED_HOOK_COUNT)
    rows[0] = legalRow({ upstreamFiles: [] })
    expect(rejectionMessage(rows)).toContain('declares no upstreamFiles')
  })

  it('② throws on an empty summary', () => {
    const rows = legalRows(EXPECTED_HOOK_COUNT)
    rows[0] = legalRow({ summary: '' })
    expect(rejectionMessage(rows)).toContain('empty summary')
  })

  it('② throws on an empty e2eScenario', () => {
    const rows = legalRows(EXPECTED_HOOK_COUNT)
    rows[0] = legalRow({ e2eScenario: '' })
    expect(rejectionMessage(rows)).toContain('empty e2eScenario')
  })

  it("② throws on an illegal mode ('G' is outside A–F)", () => {
    const rows = legalRows(EXPECTED_HOOK_COUNT)
    rows[0] = legalRow({ mode: 'G' })
    expect(rejectionMessage(rows)).toContain("illegal mode 'G'")
  })

  it("② throws on an illegal event ('session.idle' does not exist — P3-T1 Q-4)", () => {
    const rows = legalRows(EXPECTED_HOOK_COUNT)
    rows[0] = legalRow({ event: 'session.idle' })
    expect(rejectionMessage(rows)).toContain("illegal event 'session.idle'")
  })

  it('② throws on a duplicate id', () => {
    const rows = legalRows(EXPECTED_HOOK_COUNT)
    rows[1] = legalRow({ id: rows[0]?.id ?? '' })
    expect(rejectionMessage(rows)).toContain('duplicate hook id')
  })

  it('② throws when a test file leaks into upstreamFiles', () => {
    const rows = legalRows(EXPECTED_HOOK_COUNT)
    rows[0] = legalRow({
      upstreamFiles: ['packages/omo-opencode/src/hooks/todo-continuation-enforcer/handler.test.ts'],
    })
    expect(rejectionMessage(rows)).toContain('lists test file')
  })

  it('② throws when AGENTS.md leaks into upstreamFiles', () => {
    const rows = legalRows(EXPECTED_HOOK_COUNT)
    rows[0] = legalRow({
      upstreamFiles: ['packages/omo-opencode/src/hooks/todo-continuation-enforcer/AGENTS.md'],
    })
    expect(rejectionMessage(rows)).toContain('lists AGENTS.md')
  })

  it('② accepts a full-length roster that changes nothing', () => {
    // The positive control for every negative case above: the fixture shape
    // itself is legal, so a rejection proves the field under test, not the
    // fixture.
    expect(() => validateManifest(legalRows(EXPECTED_HOOK_COUNT) as readonly HookManifestEntry[]))
      .not.toThrow()
  })

  it('⑤ throws when the roster is short (a dropped row is not a valid roster)', () => {
    const rows = legalRows(EXPECTED_HOOK_COUNT)
    rows.pop()
    expect(rejectionMessage(rows)).toContain('expected 14 hook entries, got 13')
  })
})

describe('P3-T2 derived helpers', () => {
  it('⑤ hooksByEvent groups each row under its own event, preserving roster order', () => {
    const grouped = hooksByEvent(HOOK_MANIFEST)
    // Every bucket member really declares that event, and the buckets partition
    // the roster (no row dropped, none duplicated).
    let total = 0
    for (const [event, rows] of grouped) {
      expect(manifestEventSet.has(event)).toBe(true)
      for (const row of rows) expect(row.event).toBe(event)
      total += rows.length
    }
    expect(total).toBe(HOOK_MANIFEST.length)
    expect([...grouped.keys()].sort()).toEqual(
      [...new Set(HOOK_MANIFEST.map((row) => row.event))].sort(),
    )
  })

  it('⑤ hooksByEvent keeps the authored primary events, with the hard-coded bucket sizes', () => {
    const grouped = hooksByEvent(HOOK_MANIFEST)
    // Hand-counted from the manifest rows: A/B/C/D/E all appear; agent/status
    // and tools/pre-execute carry exactly the rows named here.
    expect(grouped.get('agent/pre-step')?.map((row) => row.id)).toEqual(['ulw-execute'])
    expect(grouped.get('tools/pre-execute')?.map((row) => row.id)).toEqual([
      'webfetch-redirect-guard',
      'prometheus-md-only',
    ])
    expect(grouped.get('tools/post-execute')?.map((row) => row.id)).toEqual([
      'bash-file-read-guard',
      'empty-task-response-detector',
      'edit-error-recovery',
      'json-error-recovery',
      'tool-output-truncator',
      'directory-readme-injector',
      'agent-usage-reminder',
      'task-resume-info',
    ])
    expect(grouped.get('agent/turn-stopping')?.map((row) => row.id)).toEqual([
      'todo-continuation-enforcer',
    ])
    expect(grouped.get('session/event')?.map((row) => row.id)).toEqual([
      'session-notification',
      'background-notification',
    ])
    // No row lands on agent/status yet (it is the idle half of the F rows).
    expect(grouped.has('agent/status')).toBe(false)
  })

  it('⑤ hooksByStatus filters by status and matches nothing for an empty status', () => {
    const pending = hooksByStatus(HOOK_MANIFEST, 'pending')
    // P3-T7 flipped H-02, so the pending list is the id list minus exactly that
    // row — a hard-coded difference, not a length, so a wrong row cannot pass.
    expect(pending.map((row) => row.id)).toEqual(
      EXPECTED_IDS.filter((id) => id !== 'bash-file-read-guard'),
    )
    expect(hooksByStatus(HOOK_MANIFEST, 'ported').map((row) => row.id)).toEqual([
      'bash-file-read-guard',
    ])
    expect(hooksByStatus(HOOK_MANIFEST, '')).toEqual([])
    expect(hooksByStatus([], 'pending')).toEqual([])
  })
})
