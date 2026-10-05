// tests/omo-agents/doctor-lite.test.ts — unit coverage for doctor-lite's pure
// helpers (T21): the D7 pin matcher (parseDshVersion/isPinnedDshVersion), the
// P-8 patch-entry analysis (analyzePatchEntries) and — P2-T20 — the per-row
// delegation contract (expectedDelegationRowContract /
// delegationRowContractProblems), which live in the typed
// scripts/doctor-lite-core.ts module shared with the .mjs runner.
import { describe, expect, it } from 'vitest'
import {
  analyzePatchEntries,
  delegationRowContractProblems,
  expectedDelegationRowContract,
  isPinnedDshVersion,
  parseDshVersion,
} from '../../scripts/doctor-lite-core.ts'
import type { DelegationRowContract } from '../../scripts/doctor-lite-core.ts'

describe('parseDshVersion', () => {
  it('parses a plain semver line', () => {
    expect(parseDshVersion('0.1.0-rc.6\n')).toEqual({ major: 0, minor: 1, patch: 0 })
    expect(parseDshVersion('0.1.5-rc.1\n')).toEqual({ major: 0, minor: 1, patch: 5 })
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
    expect(isPinnedDshVersion(parseDshVersion('0.1.5-rc.1'))).toBe(true)
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

// P2-T20 — the semantic half of doctor-lite check 4. The contract builder
// encodes the class → filter SHAPE rule; the list CONTENTS always arrive from
// the caller (roster.ts in the real run), which these tests mimic with
// synthetic roster views so each branch is exercised independently.
describe('expectedDelegationRowContract (P2-T20 per-row contract builder)', () => {
  const route = { provider: 'deepseek-official', model: 'deepseek-v4-pro' }

  it('renders a deny-class expectation from the roster-computed deny list', () => {
    const contract = expectedDelegationRowContract(
      { id: 'explore', className: 'read-only', maxDepth: 2, deny: ['write', 'edit', 'explore'] },
      route,
    )
    expect(contract).toEqual({
      id: 'explore',
      className: 'read-only',
      maxDepth: 2,
      toolFilter: { deny: ['write', 'edit', 'explore'] },
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    })
  })

  it('renders an allow-class expectation from the roster allowTools', () => {
    const contract = expectedDelegationRowContract(
      { id: 'multimodal-looker', className: 'allowlist', maxDepth: 2, allow: ['read', 'read_image'] },
      route,
    )
    expect(contract.toolFilter).toEqual({ allow: ['read', 'read_image'] })
  })

  it('expects NO toolFilter key when the roster entry owns neither list (orchestrator)', () => {
    const contract = expectedDelegationRowContract(
      { id: 'atlas', className: 'orchestrator', maxDepth: 2 },
      route,
    )
    expect(contract.toolFilter).toBeNull()
  })

  it('copies the deny list instead of aliasing the roster array', () => {
    const rosterDeny = ['write', 'edit']
    const contract = expectedDelegationRowContract(
      { id: 'explore', className: 'read-only', maxDepth: 2, deny: rosterDeny },
      route,
    )
    expect(contract.toolFilter).toEqual({ deny: ['write', 'edit'] })
    expect((contract.toolFilter as { deny: string[] }).deny).not.toBe(rosterDeny)
  })
})

describe('delegationRowContractProblems (P2-T20 per-row contract checker)', () => {
  const route = { provider: 'deepseek', model: 'deepseek-v4-flash' }
  const contractFor = (shape: { deny?: string[]; allow?: string[]; className?: string }): DelegationRowContract =>
    expectedDelegationRowContract(
      {
        id: 'explore',
        className: shape.className ?? (shape.deny !== undefined ? 'read-only' : 'allowlist'),
        maxDepth: 2,
        deny: shape.deny,
        allow: shape.allow,
      },
      route,
    )
  const readOnlyContract = () => contractFor({ deny: ['write', 'edit', 'explore'] })

  /** A schema-normalized row that honours the deny-class contract. */
  const goodRow = (): Record<string, unknown> => ({
    provider: 'spawn',
    toolName: 'explore',
    backgroundMode: 'continuable',
    maxDepth: 2,
    toolFilter: { deny: ['write', 'edit', 'explore'] },
    agentOptions: { provider: 'deepseek', model: 'deepseek-v4-flash' },
    persona: '# Explore: Read-Only Retrieval Agent\n…',
  })

  it('accepts a row that honours every field of the contract', () => {
    expect(delegationRowContractProblems(goodRow(), readOnlyContract())).toEqual([])
  })

  it('flags a drifted toolName (the roster id is the only expected name)', () => {
    const problems = delegationRowContractProblems({ ...goodRow(), toolName: 'call_omo_explore' }, readOnlyContract())
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('toolName="call_omo_explore"')
    expect(problems[0]).toContain('want "explore"')
  })

  it('flags a drifted deny list even when the filter key is shaped correctly', () => {
    const problems = delegationRowContractProblems({ ...goodRow(), toolFilter: { deny: ['write'] } }, readOnlyContract())
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('want {"deny":["write","edit","explore"]}')
  })

  it('flags a filter key on an orchestrator row that must carry none', () => {
    const problems = delegationRowContractProblems(
      { ...goodRow(), toolFilter: { deny: ['write'] } },
      contractFor({ className: 'orchestrator' }),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('carries NO filter key')
  })

  it('flags an allow-list drift for the allowlist class', () => {
    const problems = delegationRowContractProblems(
      { ...goodRow(), toolFilter: { allow: ['read'] } },
      contractFor({ allow: ['read', 'read_image'] }),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('want {"allow":["read","read_image"]}')
  })

  it('flags provider / backgroundMode / maxDepth drift', () => {
    const problems = delegationRowContractProblems(
      { ...goodRow(), provider: 'in-process', backgroundMode: 'one-shot', maxDepth: 1 },
      readOnlyContract(),
    )
    expect(problems).toEqual([
      'provider="in-process" (want spawn)',
      'backgroundMode="one-shot" (want continuable)',
      'maxDepth=1 (want 2 — roster value)',
    ])
  })

  it('flags a route that does not match the entry’s resolved route', () => {
    const problems = delegationRowContractProblems(
      { ...goodRow(), agentOptions: { provider: 'deepseek', model: 'deepseek-v4-pro' } },
      readOnlyContract(),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('want "deepseek"/"deepseek-v4-flash"')
  })

  it('flags a missing, empty or non-string persona (unrendered sentinel)', () => {
    const contract = readOnlyContract()
    expect(delegationRowContractProblems({ ...goodRow(), persona: undefined }, contract)).toEqual([
      'persona missing or empty (sentinels unrendered?)',
    ])
    expect(delegationRowContractProblems({ ...goodRow(), persona: '   ' }, contract)).toEqual([
      'persona missing or empty (sentinels unrendered?)',
    ])
    expect(delegationRowContractProblems({ ...goodRow(), persona: ['x'] }, contract)).toEqual([
      'persona missing or empty (sentinels unrendered?)',
    ])
  })

  it('reports every violation of one badly drifted row in a single pass', () => {
    const problems = delegationRowContractProblems(
      { provider: 'spawn', toolName: 'atlas', backgroundMode: 'one-shot', maxDepth: 3, toolFilter: { deny: [] }, agentOptions: {}, persona: undefined },
      readOnlyContract(),
    )
    expect(problems).toHaveLength(6)
  })
})
