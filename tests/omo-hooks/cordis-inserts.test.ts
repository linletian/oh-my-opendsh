// P3-T3 — the `cordis-plugins` doctor check's pure half (plan §4.1; task P3-T3).
//
// `collectInsertRowIds` answers "WHICH plugin rows does the patch overlay mount"
// for scripts/doctor-lite.mjs check 2b, independently of the YAML parser (the
// check feeds it the parsed document; these tests feed it plain objects). The
// real cordis.yml is covered by the doctor-lite gate itself (ci-local gate 4),
// so this suite pins the COLLECTION rules — patch order, one insert entry or
// several, and the anonymous-row case — not a regex over the shipped file.
import { describe, expect, it } from 'vitest'
import {
  collectInsertRowIds,
  EXPECTED_INSERT_ROW_IDS,
} from '../../scripts/doctor-lite-core.ts'

describe('P3-T3 collectInsertRowIds — the mount-order id list', () => {
  it('① collects one row per top-level insert entry, in patch order', () => {
    // The shipped shape: three separate `- insert:` entries, one row each
    // (omo-commands added by P4-T3).
    const rows = [
      { insert: [{ id: 'omo-agents', name: '@oh-my-opendsh/omo-agents' }] },
      { insert: [{ id: 'omo-hooks', name: '@oh-my-opendsh/omo-hooks' }] },
      { insert: [{ id: 'omo-commands', name: '@oh-my-opendsh/omo-commands' }] },
    ]
    expect(collectInsertRowIds(rows)).toEqual(['omo-agents', 'omo-hooks', 'omo-commands'])
  })

  it('② also collects several rows inside ONE insert entry', () => {
    // dsh's applyEntryPatches handles both shapes (`data.push(...insert)`), so
    // the check must not assume one row per entry.
    const rows = [
      { insert: [{ id: 'a' }, { id: 'b' }] },
      { insert: [{ id: 'c' }] },
    ]
    expect(collectInsertRowIds(rows)).toEqual(['a', 'b', 'c'])
  })

  it('③ ignores rows that contribute no usable id', () => {
    const rows = [
      { insert: [{ id: '' }, { name: 'no-id-here' }, 'not-a-mapping'] },
      { insert: [] },
      { insert: null },
      { id: 'override-row-without-insert' },
      'not-a-mapping',
    ]
    expect(collectInsertRowIds(rows)).toEqual([])
  })

  it('④ preserves duplicates so a doubled row cannot hide', () => {
    const rows = [
      { insert: [{ id: 'omo-agents' }] },
      { insert: [{ id: 'omo-agents' }] },
    ]
    expect(collectInsertRowIds(rows)).toEqual(['omo-agents', 'omo-agents'])
  })

  it('⑤ pins the expected row list the check compares against', () => {
    // Transcribed by hand from the root cordis.yml (P3-T3; third row by P4-T3):
    // a manifest of which packages a sandbox profile must install. If a row is
    // added to the overlay, THIS list, the constant itself and every install
    // site (cold-start.sh / drive.mjs / concerto-mode-probe.sh / smoke-real.mjs)
    // must move together — the constant alone would leave this pin red, which is
    // the intended friction.
    expect([...EXPECTED_INSERT_ROW_IDS]).toEqual([
      'omo-agents', 'omo-hooks', 'omo-commands',
    ])
  })
})
