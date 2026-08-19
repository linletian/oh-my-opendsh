// tests/omo-agents/doctor-lite.test.ts — unit coverage for doctor-lite's pure
// helpers (T21): the D7 pin matcher (parseDshVersion/isPinnedDshVersion) and
// the P-8 patch-entry analysis (analyzePatchEntries), which live in the typed
// scripts/doctor-lite-core.ts module shared with the .mjs runner.
import { describe, expect, it } from 'vitest'
import {
  analyzePatchEntries,
  isPinnedDshVersion,
  parseDshVersion,
} from '../../scripts/doctor-lite-core.ts'

describe('parseDshVersion', () => {
  it('parses a plain semver line', () => {
    expect(parseDshVersion('0.1.0-rc.6\n')).toEqual({ major: 0, minor: 1, patch: 0 })
  })

  it('tolerates a leading v and surrounding whitespace', () => {
    expect(parseDshVersion('  v0.1.9  ')).toEqual({ major: 0, minor: 1, patch: 9 })
  })

  it('parses non-pinned versions instead of hiding them', () => {
    expect(parseDshVersion('0.2.0')).toEqual({ major: 0, minor: 2, patch: 0 })
    expect(parseDshVersion('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 })
  })

  it('returns null for unrecognized output', () => {
    expect(parseDshVersion('dsh version unknown')).toBeNull()
    expect(parseDshVersion('0.1')).toBeNull()
    expect(parseDshVersion('')).toBeNull()
  })
})

describe('isPinnedDshVersion (decision D7: 0.1.x)', () => {
  it('accepts every 0.1.x, prerelease or not', () => {
    expect(isPinnedDshVersion(parseDshVersion('0.1.0-rc.6'))).toBe(true)
    expect(isPinnedDshVersion(parseDshVersion('0.1.42'))).toBe(true)
  })

  it('rejects everything outside 0.1.x', () => {
    expect(isPinnedDshVersion(parseDshVersion('0.2.0'))).toBe(false)
    expect(isPinnedDshVersion(parseDshVersion('1.0.0'))).toBe(false)
    expect(isPinnedDshVersion(parseDshVersion('0.0.9'))).toBe(false)
    expect(isPinnedDshVersion(null)).toBe(false)
  })
})

describe('analyzePatchEntries (P-8: plain rows silently skip)', () => {
  it('counts insert-form rows cleanly', () => {
    const result = analyzePatchEntries([{ insert: [{ id: 'omo-agents', name: '@oh-my-opendsh/omo-agents' }] }])
    expect(result.insertForm).toBe(1)
    expect(result.nonMapping).toBe(0)
    expect(result.issues).toEqual([])
  })

  it('flags a top-level row lacking insert:', () => {
    const result = analyzePatchEntries([{ id: 'omo-agents', name: '@oh-my-opendsh/omo-agents' }])
    expect(result.insertForm).toBe(0)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toContain('id=omo-agents')
    expect(result.issues[0]).toContain('lacks insert:')
  })

  it('flags a falsy insert value as a silent skip', () => {
    const result = analyzePatchEntries([{ insert: [] }, { insert: null }])
    expect(result.insertForm).toBe(0)
    expect(result.issues).toHaveLength(2)
    for (const issue of result.issues) expect(issue).toContain('not a non-empty array')
  })

  it('flags non-mapping rows as apply-time rejections', () => {
    const result = analyzePatchEntries([['not', 'a', 'mapping'], null])
    expect(result.nonMapping).toBe(2)
    expect(result.issues).toHaveLength(2)
    for (const issue of result.issues) expect(issue).toContain('not a mapping')
  })

  it('mixes insert-form and silent-skip rows in one report', () => {
    const result = analyzePatchEntries([
      { insert: [{ id: 'a' }] },
      { id: 'b', name: 'x' },
      { insert: [] },
    ])
    expect(result.insertForm).toBe(1)
    expect(result.nonMapping).toBe(0)
    expect(result.issues).toHaveLength(2)
  })
})
