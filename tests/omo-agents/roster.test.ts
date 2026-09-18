// P2-T2 — the Phase 2 roster single source of truth (plan §4.2/§4.4).
// Asserts the 11 rows cell-by-cell against a hard-coded copy of
// phase2-roster.md §1 总表 (never derived from roster.ts, or the test would
// agree with any drift), plus the derived delegation toolName list and the
// per-class deny/allow computation.
import { describe, expect, it } from 'vitest'
import {
  ALL_AGENT_IDS,
  CONDUCTOR_ID,
  DELEGATION_ENTRIES,
  DELEGATION_TOOL_NAMES,
  MUTATION_TOOL_NAMES,
  ROSTER,
  allowToolNamesFor,
  denyToolNamesFor,
  isDelegationEntry,
} from '../../patches/omo-dsh/omo-agents/src/roster'

interface ExpectedEntry {
  readonly id: string
  readonly personaFile: string | undefined
  readonly class: string | undefined
  readonly maxDepth: number | undefined
  readonly delegation: boolean
  readonly writeCapable: boolean
  readonly allowTools: readonly string[] | undefined
  readonly defaultRoute: { readonly provider: string; readonly model: string }
  readonly routeEnvVars: { readonly provider: string; readonly model: string }
}

/**
 * phase2-roster.md §1 总表, transcribed by hand. `undefined` marks the `—`
 * cells of the route-only conductor row.
 */
const EXPECTED: readonly ExpectedEntry[] = [
  {
    id: 'sisyphus',
    personaFile: undefined,
    class: undefined,
    maxDepth: undefined,
    delegation: false,
    writeCapable: true,
    allowTools: undefined,
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    routeEnvVars: { provider: 'OMO_SISYPHUS_PROVIDER', model: 'OMO_SISYPHUS_MODEL' },
  },
  {
    id: 'explore',
    personaFile: 'explore-persona.md',
    class: 'read-only',
    maxDepth: 2,
    delegation: true,
    writeCapable: false,
    allowTools: undefined,
    defaultRoute: { provider: 'deepseek', model: 'deepseek-v4-flash' },
    routeEnvVars: { provider: 'OMO_EXPLORE_PROVIDER', model: 'OMO_EXPLORE_MODEL' },
  },
  {
    id: 'hephaestus',
    personaFile: 'hephaestus-persona.md',
    class: 'worker',
    maxDepth: 2,
    delegation: true,
    writeCapable: true,
    allowTools: undefined,
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    routeEnvVars: { provider: 'OMO_HEPHAESTUS_PROVIDER', model: 'OMO_HEPHAESTUS_MODEL' },
  },
  {
    id: 'oracle',
    personaFile: 'oracle-persona.md',
    class: 'read-only',
    maxDepth: 2,
    delegation: true,
    writeCapable: false,
    allowTools: undefined,
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    routeEnvVars: { provider: 'OMO_ORACLE_PROVIDER', model: 'OMO_ORACLE_MODEL' },
  },
  {
    id: 'librarian',
    personaFile: 'librarian-persona.md',
    class: 'read-only',
    maxDepth: 2,
    delegation: true,
    writeCapable: false,
    allowTools: undefined,
    defaultRoute: { provider: 'deepseek', model: 'deepseek-v4-flash' },
    routeEnvVars: { provider: 'OMO_LIBRARIAN_PROVIDER', model: 'OMO_LIBRARIAN_MODEL' },
  },
  {
    id: 'plan-consultant',
    personaFile: 'plan-consultant-persona.md',
    class: 'read-only',
    maxDepth: 2,
    delegation: true,
    writeCapable: false,
    allowTools: undefined,
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    routeEnvVars: {
      provider: 'OMO_PLAN_CONSULTANT_PROVIDER',
      model: 'OMO_PLAN_CONSULTANT_MODEL',
    },
  },
  {
    id: 'plan-reviewer',
    personaFile: 'plan-reviewer-persona.md',
    class: 'read-only',
    maxDepth: 2,
    delegation: true,
    writeCapable: false,
    allowTools: undefined,
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    routeEnvVars: {
      provider: 'OMO_PLAN_REVIEWER_PROVIDER',
      model: 'OMO_PLAN_REVIEWER_MODEL',
    },
  },
  {
    id: 'atlas',
    personaFile: 'atlas-persona.md',
    class: 'orchestrator',
    maxDepth: 2,
    delegation: true,
    writeCapable: true,
    allowTools: undefined,
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    routeEnvVars: { provider: 'OMO_ATLAS_PROVIDER', model: 'OMO_ATLAS_MODEL' },
  },
  {
    id: 'multimodal-looker',
    personaFile: 'multimodal-looker-persona.md',
    class: 'allowlist',
    maxDepth: 2,
    delegation: true,
    writeCapable: false,
    allowTools: ['read', 'read_image'],
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp' },
    routeEnvVars: {
      provider: 'OMO_MULTIMODAL_LOOKER_PROVIDER',
      model: 'OMO_MULTIMODAL_LOOKER_MODEL',
    },
  },
  {
    id: 'sisyphus-junior',
    personaFile: 'sisyphus-junior-persona.md',
    class: 'worker',
    maxDepth: 2,
    delegation: true,
    writeCapable: true,
    allowTools: undefined,
    defaultRoute: { provider: 'deepseek', model: 'deepseek-v4-flash' },
    routeEnvVars: {
      provider: 'OMO_SISYPHUS_JUNIOR_PROVIDER',
      model: 'OMO_SISYPHUS_JUNIOR_MODEL',
    },
  },
  {
    id: 'prometheus',
    personaFile: 'prometheus-persona.md',
    class: 'read-only',
    maxDepth: 2,
    delegation: true,
    writeCapable: false,
    allowTools: undefined,
    defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    routeEnvVars: { provider: 'OMO_PROMETHEUS_PROVIDER', model: 'OMO_PROMETHEUS_MODEL' },
  },
]

/** The 10 delegation toolNames in roster order (§1 总表 order minus sisyphus). */
const DELEGATION_EXPECTED = [
  'explore',
  'hephaestus',
  'oracle',
  'librarian',
  'plan-consultant',
  'plan-reviewer',
  'atlas',
  'multimodal-looker',
  'sisyphus-junior',
  'prometheus',
] as const

function entryById(id: string) {
  const entry = ROSTER.find((candidate) => candidate.id === id)
  if (entry === undefined) throw new Error(`roster has no entry '${id}'`)
  return entry
}

describe('omo-agents roster (P2-T2)', () => {
  it('declares exactly 11 entries in phase2-roster.md §1 总表 order', () => {
    expect(ROSTER).toHaveLength(11)
    expect(ROSTER.map((entry) => entry.id)).toEqual(EXPECTED.map((entry) => entry.id))
  })

  it('matches the §1 总表 cell by cell (id / class / maxDepth / route / env / write / allowTools)', () => {
    for (const [index, expected] of EXPECTED.entries()) {
      const entry = ROSTER[index]!
      expect(entry.id).toBe(expected.id)
      expect(entry.personaFile).toBe(expected.personaFile)
      expect(entry.class).toBe(expected.class)
      expect(entry.maxDepth).toBe(expected.maxDepth)
      expect(entry.delegation).toBe(expected.delegation)
      expect(entry.writeCapable).toBe(expected.writeCapable)
      expect(entry.allowTools).toEqual(expected.allowTools)
      expect(entry.defaultRoute).toEqual(expected.defaultRoute)
      expect(entry.routeEnvVars).toEqual(expected.routeEnvVars)
    }
  })

  it('derives each env pair from the id (OMO_<ID>_PROVIDER / OMO_<ID>_MODEL)', () => {
    for (const entry of ROSTER) {
      const upper = entry.id.toUpperCase().replaceAll('-', '_')
      expect(entry.routeEnvVars).toEqual({
        provider: `OMO_${upper}_PROVIDER`,
        model: `OMO_${upper}_MODEL`,
      })
    }
    // The four MVP names survive the roster-ization byte-for-byte.
    expect(entryById('sisyphus').routeEnvVars.provider).toBe('OMO_SISYPHUS_PROVIDER')
    expect(entryById('sisyphus').routeEnvVars.model).toBe('OMO_SISYPHUS_MODEL')
    expect(entryById('explore').routeEnvVars.provider).toBe('OMO_EXPLORE_PROVIDER')
    expect(entryById('explore').routeEnvVars.model).toBe('OMO_EXPLORE_MODEL')
  })

  it('computes the ORDERED delegation toolName list as exactly the 10 non-conductor ids', () => {
    expect(DELEGATION_TOOL_NAMES).toEqual([...DELEGATION_EXPECTED])
    expect(DELEGATION_TOOL_NAMES).toHaveLength(10)
    expect(DELEGATION_ENTRIES.map((entry) => entry.id)).toEqual([...DELEGATION_EXPECTED])
    expect(ALL_AGENT_IDS).toEqual(ROSTER.map((entry) => entry.id))
  })

  it('has exactly one conductor entry: route-only, not a delegation name', () => {
    const conductors = ROSTER.filter((entry) => entry.id === CONDUCTOR_ID)
    expect(conductors).toHaveLength(1)
    const conductor = conductors[0]!
    expect(conductor.delegation).toBe(false)
    expect(isDelegationEntry(conductor)).toBe(false)
    // The §1 `—` cells: absent, not fabricated.
    expect(conductor.personaFile).toBeUndefined()
    expect(conductor.class).toBeUndefined()
    expect(conductor.maxDepth).toBeUndefined()
    expect(conductor.allowTools).toBeUndefined()
    // Its route is still part of the single source (11 routes).
    expect(conductor.defaultRoute).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
    })
    expect(DELEGATION_TOOL_NAMES).not.toContain(CONDUCTOR_ID)
    expect(ROSTER.filter(isDelegationEntry)).toHaveLength(10)
  })

  it('caps every delegation row at maxDepth 2 (target-row semantics, D-2026-09-13-01)', () => {
    // dsh reads the INVOKED row's cap, so the chain cap is 2 levels only when
    // EVERY delegation row is 2: atlas(depth 1) invoking any row yields
    // depth 2, which must not exceed that row's own maxDepth. A per-class 1
    // here would make atlas re-delegation impossible (roster §1 修正块).
    for (const entry of DELEGATION_ENTRIES) {
      expect(entry.maxDepth, entry.id).toBe(2)
    }
    expect(entryById('atlas').maxDepth).toBe(2)
    expect(entryById('explore').maxDepth).toBe(2)
  })

  it('derives writeCapable from the class (worker/orchestrator true, read-only/allowlist false)', () => {
    for (const entry of DELEGATION_ENTRIES) {
      expect(entry.writeCapable).toBe(entry.class === 'worker' || entry.class === 'orchestrator')
    }
    expect(entryById(CONDUCTOR_ID).writeCapable).toBe(true)
  })

  it('computes the read-only deny list as [write, edit, ...10 delegation names]', () => {
    const readOnlyIds = DELEGATION_ENTRIES
      .filter((entry) => entry.class === 'read-only')
      .map((entry) => entry.id)
    expect(readOnlyIds).toEqual([
      'explore',
      'oracle',
      'librarian',
      'plan-consultant',
      'plan-reviewer',
      'prometheus',
    ])
    expect(readOnlyIds).toHaveLength(6)
    for (const id of readOnlyIds) {
      expect(denyToolNamesFor(entryById(id))).toEqual(['write', 'edit', ...DELEGATION_EXPECTED])
    }
  })

  it('computes the worker deny list as just the 10 delegation names (no write/edit)', () => {
    const workerIds = DELEGATION_ENTRIES
      .filter((entry) => entry.class === 'worker')
      .map((entry) => entry.id)
    expect(workerIds).toEqual(['hephaestus', 'sisyphus-junior'])
    for (const id of workerIds) {
      const deny = denyToolNamesFor(entryById(id))
      expect(deny).toEqual([...DELEGATION_EXPECTED])
      expect(deny).not.toContain('write')
      expect(deny).not.toContain('edit')
    }
  })

  it('gives atlas (orchestrator) no deny list and multimodal-looker an allow list instead', () => {
    expect(denyToolNamesFor(entryById('atlas'))).toBeUndefined()
    expect(allowToolNamesFor(entryById('atlas'))).toBeUndefined()

    const looker = entryById('multimodal-looker')
    // Q-3: allow ∧ ¬deny already hides the delegation names — no extra deny.
    expect(denyToolNamesFor(looker)).toBeUndefined()
    expect(allowToolNamesFor(looker)).toEqual(['read', 'read_image'])
    expect(looker.allowTools).toEqual(['read', 'read_image'])

    // The allowlist is unique: no other roster row declares one.
    for (const entry of ROSTER) {
      if (entry.id === 'multimodal-looker') continue
      expect(entry.allowTools).toBeUndefined()
      expect(allowToolNamesFor(entry)).toBeUndefined()
    }
  })

  it('computes both deny classes from the derived delegation list (roster-driven)', () => {
    expect(MUTATION_TOOL_NAMES).toEqual(['write', 'edit'])
    for (const entry of DELEGATION_ENTRIES) {
      const deny = denyToolNamesFor(entry)
      if (deny === undefined) {
        expect(['orchestrator', 'allowlist']).toContain(entry.class)
        continue
      }
      // Every deny list contains the full 10-name delegation list, in roster order.
      expect(deny.slice(deny.length - DELEGATION_TOOL_NAMES.length)).toEqual([
        ...DELEGATION_TOOL_NAMES,
      ])
      expect(deny.slice(0, deny.length - DELEGATION_TOOL_NAMES.length))
        .toEqual(entry.class === 'read-only' ? ['write', 'edit'] : [])
    }
  })
})
