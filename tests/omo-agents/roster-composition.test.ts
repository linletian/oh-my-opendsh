// P2-T17 — roster ↔ rendered-composition consistency + the roster STRUCTURE
// snapshot (exit criterion b) + the Q-3 shape pin.
//
// WHAT THIS SUITE PROVES. Sibling suites each pin one artifact: roster.test.ts
// pins the roster table against a hand-transcribed copy of phase2-roster.md,
// concerto-preset.test.ts pins the renderer's guards and the template's
// sentinel census, and model-routes.test.ts pins route resolution. This suite
// is the CROSS-ARTIFACT one: it renders the real preset through the real sync
// path (`syncConcertoPreset` into a hermetic tmp dir — the same call apply()
// makes), parses the result in the loader's own YAML dialect, and asserts
// EVERY roster delegation entry against its composed row and vice versa. A
// roster row without a row in the composition, a composition row without a
// roster entry, or any per-cell drift (id / toolName / filter / maxDepth /
// agentOptions / persona) is a named failure here.
//
// WHY THE REAL SYNC PATH AND NOT THE TEMPLATE. The template carries sentinels;
// the artifact dsh actually mounts is the rendered file. Reading the template
// would prove nothing about the renderer, so this suite pays the sync cost once
// (beforeAll) and asserts on the rendered bytes, parsed by the installed dsh's
// js-yaml through `loadYamlDialect` (JSON_SCHEMA + !!js), exactly like
// scripts/doctor-lite.mjs and the sibling concerto-preset.test.ts.
//
// SNAPSHOT DISCIPLINE (part B). tests/omo-agents/__snapshots__/roster.md is a
// STRUCTURED, human-reviewable listing of the roster, generated from the single
// sources by tests/omo-agents/roster-snapshot.ts. The test below reads it with
// readFileSync and byte-compares against a fresh rendering; there is
// deliberately NO rewrite path in this file (contrast vitest's
// toMatchFileSnapshot), so the checked-in file can only change by an explicit
// regeneration. The non-empty / row-count assertions exist because a "collected
// zero rows" render would otherwise compare equal to an empty file (Phase 1 R-5
// anti-false-green lesson).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { syncConcertoPreset } from '../../patches/omo-dsh/omo-agents/src/concerto-preset'
import { buildAgentPersona } from '../../patches/omo-dsh/omo-agents/src/persona-prompts'
import { resolveModelRoutes } from '../../patches/omo-dsh/omo-agents/src/model-routes'
import {
  CONDUCTOR_ID,
  DELEGATION_ENTRIES,
  DELEGATION_TOOL_NAMES,
  ROSTER,
  allowToolNamesFor,
  denyToolNamesFor,
} from '../../patches/omo-dsh/omo-agents/src/roster'
import type { AgentId } from '../../patches/omo-dsh/omo-agents/src/roster'
import { loadYamlDialect } from '../../scripts/doctor-lite.mjs'
import { renderRosterSnapshot } from './roster-snapshot'

/**
 * The 10 delegation toolNames in roster order, restated INDEPENDENTLY (not read
 * from roster.ts) so the class-filter expectations below cannot agree with a
 * drifted roster. Same literal as roster.test.ts / concerto-preset.test.ts.
 */
const TEN_DELEGATION_NAMES = [
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

const Q3_LOOKER_ALLOW = ['read', 'read_image'] as const

/** Minimal row shape of a loaded composition (js-yaml returns data). */
type YamlRow = { id?: string; name?: string; config?: any }

let sandbox: string
let group: YamlRow[]
let composition: string

beforeAll(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'omo-roster-composition-test.'))
  const target = join(sandbox, '.agent-presets', 'concerto')
  // The REAL apply()-time path: default template, default conductor prompt,
  // default (single-source) personas and routes.
  expect(syncConcertoPreset(target)).toBe('materialized')
  composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
  const loaded = await loadYamlDialect(join(target, 'agent.cordis.yml'))
  const delegation = (loaded as YamlRow[]).find((row) => row.id === 'delegation')
  if (delegation === undefined || !Array.isArray(delegation.config)) {
    throw new Error('rendered composition has no `delegation` group with a row list')
  }
  group = delegation.config as YamlRow[]
})

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

/** Every delegation-group row whose id is `tool-subagent-<id>`. */
function rowsForId(id: string): YamlRow[] {
  return group.filter((row) => row.id === `tool-subagent-${id}`)
}

/** The single row of one roster delegation entry, or a loud failure. */
function rowFor(entry: { id: string }): YamlRow {
  const rows = rowsForId(entry.id)
  if (rows.length !== 1) {
    throw new Error(`expected exactly 1 row id tool-subagent-${entry.id}, found ${rows.length}`)
  }
  return rows[0]!
}

describe('roster ↔ rendered composition consistency (P2-T17 · A)', () => {
  it('renders the delegation group as control + list-agents + exactly one row per roster entry', () => {
    expect(group).toHaveLength(12)
    expect(group.map((row) => row.id)).toEqual([
      'tool-subagent-control',
      'tool-subagent-list-agents',
      ...DELEGATION_ENTRIES.map((entry) => `tool-subagent-${entry.id}`),
    ])
  })

  for (const entry of DELEGATION_ENTRIES) {
    describe(`${entry.id} (${entry.class})`, () => {
      it('binds the roster entry to exactly one dsh-tool-subagent row, id and toolName', () => {
        const rows = rowsForId(entry.id)
        expect(rows).toHaveLength(1)
        const row = rows[0]!
        expect(row.name).toBe('@deepseek-ai/dsh-tool-subagent')
        expect(row.id).toBe(`tool-subagent-${entry.id}`)
        expect(row.config.toolName).toBe(entry.id)
      })

      it('carries the class filter shape', () => {
        const row = rowFor(entry)
        const deny = denyToolNamesFor(entry)
        const allow = allowToolNamesFor(entry)
        if (entry.class === 'read-only') {
          // read-only → deny == denyToolNamesFor(entry) exactly: the two
          // mutation tools followed by the full 10-name delegation list.
          expect(deny).toEqual(['write', 'edit', ...TEN_DELEGATION_NAMES])
          expect(row.config.toolFilter).toEqual({ deny: [...deny!] })
        } else if (entry.class === 'worker') {
          // worker → deny == the 10-name list (no write/edit).
          expect(deny).toEqual([...TEN_DELEGATION_NAMES])
          expect(row.config.toolFilter).toEqual({ deny: [...TEN_DELEGATION_NAMES] })
        } else if (entry.class === 'orchestrator') {
          // atlas → NO toolFilter key at all (it keeps the delegation tools).
          expect(deny).toBeUndefined()
          expect('toolFilter' in row.config).toBe(false)
        } else {
          // multimodal-looker → allow == allowToolNamesFor(entry), NO deny key.
          expect(allow).toEqual([...Q3_LOOKER_ALLOW])
          expect(row.config.toolFilter).toEqual({ allow: [...allow!] })
          expect('deny' in row.config.toolFilter).toBe(false)
        }
      })

      it('carries maxDepth == entry.maxDepth', () => {
        expect(rowFor(entry).config.maxDepth).toBe(entry.maxDepth)
      })

      it('binds agentOptions to resolveModelRoutes()[id]', () => {
        const route = resolveModelRoutes()[entry.id as AgentId]
        expect(rowFor(entry).config.agentOptions).toEqual({
          provider: route.provider,
          model: route.model,
        })
      })

      it('renders the persona block byte-exactly to buildAgentPersona(id)', () => {
        const persona = rowFor(entry).config.persona
        expect(typeof persona).toBe('string')
        expect(persona).toBe(buildAgentPersona(entry.id))
      })
    })
  }

  it('has NO row for the conductor, and no generic or product rows', () => {
    // The conductor is the main-session persona row, never a delegation tool
    // (roster.ts `delegation: false`; plan §4.2).
    expect(group.some((row) => row.id === `tool-subagent-${CONDUCTOR_ID}`)).toBe(false)
    expect(group.some((row) => row.config?.toolName === CONDUCTOR_ID)).toBe(false)
    // F1 (PR #1 review, 2026-09-04) stays enforced: the generic spawn/fork rows
    // and the product-provider rows are DROPPED, so the named roster rows are
    // the conductor's only delegation paths.
    expect(group.some((row) => row.config?.toolName === 'subagent')).toBe(false)
    expect(group.some((row) => row.config?.toolName === 'subagent_fork')).toBe(false)
    expect(group.some((row) => row.id === 'tool-subagent-codex')).toBe(false)
    expect(group.some((row) => row.id === 'tool-subagent-claude-code')).toBe(false)
    expect(composition).not.toContain('toolName: subagent\n')
    expect(composition).not.toContain('toolName: subagent_fork')
  })

  it('Q-3 closure: the multimodal-looker row carries allow [read, read_image] and NO deny key', () => {
    // phase2-roster.md §3 Q-3 closure (P2-T1, 2026-09-12): `allow` and `deny`
    // together mean allow ∧ ¬deny, so the delegation names are already
    // invisible to the looker child and an extra deny would be pure redundancy
    // (plus more R-9 name-drift surface). The SHAPE is pinned here; the
    // MECHANISM is pinned through the installed dsh's real restrict() path in
    // tests/omo-agents/roster-toolfilter-mechanism.test.ts.
    const row = rowFor({ id: 'multimodal-looker' })
    expect(row.config.toolFilter).toEqual({ allow: ['read', 'read_image'] })
    expect(Object.keys(row.config.toolFilter)).toEqual(['allow'])
    expect('deny' in row.config.toolFilter).toBe(false)
    // The allow list is exactly the roster computation, not a copy: a roster
    // edit that changes allowTools changes this row or goes red here.
    const looker = DELEGATION_ENTRIES.find((entry) => entry.id === 'multimodal-looker')!
    expect(row.config.toolFilter.allow).toEqual([...allowToolNamesFor(looker)!])
    // And the delegation toolNames are all absent from the allow set by
    // construction — the Q-3 "no explicit deny needed" argument, checkable.
    for (const name of DELEGATION_TOOL_NAMES) {
      expect(row.config.toolFilter.allow).not.toContain(name)
    }
  })

  it('composes exactly the 10 roster delegation toolNames, in roster order', () => {
    expect(group
      .filter((row) => row.name === '@deepseek-ai/dsh-tool-subagent')
      .map((row) => row.config.toolName))
      .toEqual([...DELEGATION_TOOL_NAMES])
    expect([...DELEGATION_TOOL_NAMES]).toEqual([...TEN_DELEGATION_NAMES])
  })
})

describe('roster structure snapshot (P2-T17 · B · exit criterion b)', () => {
  /** Absolute path of the checked-in snapshot (read here, never written). */
  const snapshotFile = fileURLToPath(new URL('./__snapshots__/roster.md', import.meta.url))

  it('checked-in roster.md byte-equals a fresh renderRosterSnapshot()', () => {
    const snapshot = readFileSync(snapshotFile, 'utf8')
    const rendering = renderRosterSnapshot()
    // R-5 anti-false-green, asserted IN this test (not only in the structural
    // one below) so the byte-compare can never be green vacuously — an empty
    // snapshot compared against an equally-empty rendering, which is what
    // happens the moment `renderRosterSnapshot()` loses its `lines` and the
    // file is regenerated. `-t 'byte-equals'` must not be able to pass on it.
    expect(snapshot.trim().length).toBeGreaterThan(0)
    expect(rendering.trim().length).toBeGreaterThan(0)
    // Plain read + toBe: a stale or hand-edited snapshot fails loudly and no
    // code path in this suite can rewrite it (deliberately NOT
    // toMatchFileSnapshot, which would rewrite it).
    expect(snapshot).toBe(rendering)
  })

  it('roster.md carries one structured table row per roster agent', () => {
    const snapshot = readFileSync(snapshotFile, 'utf8')
    const dataRows = snapshot.split('\n').filter((line) => /^\| \d+ \| `/.test(line))
    expect(dataRows).toHaveLength(ROSTER.length)
    for (const entry of ROSTER) {
      expect(snapshot, entry.id).toContain(`\`${entry.id}\``)
    }
    // The snapshot documents all three seat routes the plan §4.6 fixes.
    for (const route of [
      'deepseek-official/deepseek-v4-pro',
      'deepseek/deepseek-v4-flash',
      'deepseek-official/deepseek-v4-flash-vision-exp',
    ]) {
      expect(snapshot).toContain(route)
    }
  })
})

// ── P4.5-T5: the R-9 STRUCTURAL INVARIANT on the registered carrier ─────────
// T5 registers this very composition through `agentPresets.register()` inside
// the omo-agents inject callback. That is deadlock-safe for exactly ONE reason
// (plan §4.3 / R-9, review R2-I1): `omo-agents` is NOT a row of what it
// registers — it rides the repo-root cordis.yml's own insert row
// (cordis.yml:36-38). The registry's audit waits for the HOST Loader tree to
// settle (agent-preset-registry/src/index.ts:126-127 @ dsh-v0.2.0-rc.2); if a
// future "make it self-contained" edit ever moves omo-agents INTO the
// composition, the settle could wait on the caller's own activation and the
// deadlock becomes reachable — this pair of tests goes RED the moment the
// structure changes, which is the entire point (Q-3 §6.1: assert the structure,
// never a timing).
describe('R-9 structural invariant on the registered carrier (P4.5-T5)', () => {
  /** Recursive walk collecting every (id, name) pair at every nesting depth. */
  function deepIds(rows: unknown): string[] {
    const ids: string[] = []
    const walk = (list: unknown): void => {
      if (!Array.isArray(list)) return
      for (const row of list) {
        if (typeof row !== 'object' || row === null) continue
        const record = row as { id?: unknown; group?: unknown; config?: unknown }
        if (typeof record.id === 'string') ids.push(record.id)
        if (record.group === true) walk(record.config)
      }
    }
    walk(rows)
    return ids
  }

  it('the FULL rendered composition (all depths) has no omo-agents row', async () => {
    // The pre-T5 suite only ever looked INSIDE the delegation group; the T5
    // registration registers the TOP-LEVEL list, so the census must be the
    // whole document at every depth — that is the row set register() mounts.
    // Non-vacuity: the census really walks (top-level ids + nested rows).
    // 'materialized' requires the target NOT to pre-exist (syncConcertoPreset
    // creates it) — mkdtemp the PARENT only, the sibling suite's shape.
    const sandbox = mkdtempSync(join(tmpdir(), 'omo-roster-r9-census.'))
    const target = join(sandbox, '.agent-presets', 'concerto')
    try {
      expect(syncConcertoPreset(target)).toBe('materialized')
      const loaded = await loadYamlDialect(join(target, 'agent.cordis.yml'))
      const ids = deepIds(loaded)
      // Non-vacuity: the census really walks (top-level ids + nested rows).
      expect(ids.length).toBeGreaterThan(12)
      expect(ids).toContain('delegation')
      expect(ids).toContain('tool-subagent-explore')
      // The invariant: neither the plugin id nor its package name appears.
      expect(ids).not.toContain('omo-agents')
      const raw = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
      expect(raw).not.toContain('@oh-my-opendsh/omo-agents')
      // And the same for what T5 registers through the pure outlet (same bytes).
      expect(deepIds(await loadYamlDialect(join(target, 'agent.cordis.yml')))).not.toContain('omo-agents')
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('omo-agents rides the repo-root host insert row — the deadlock-safe carrier', async () => {
    // The other half: the plugin IS mounted, but as a HOST row of a DIFFERENT
    // document — the repo-root cordis.yml `- insert:` row at :36-38. Read the
    // real file, parse it in the loader dialect, and pin the row's existence
    // and its insert shape (id + name), so "the caller is external to the
    // registered tree" is checkable, not folklore.
    const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
    const rows = await loadYamlDialect(join(repoRoot, 'cordis.yml'))
    const inserted = (Array.isArray(rows) ? rows : [])
      .flatMap((patch: any) => (Array.isArray(patch?.insert) ? patch.insert : []))
    const hostRow = inserted.find((row: any) => row?.id === 'omo-agents')
    expect(hostRow).toBeDefined()
    expect(hostRow.name).toBe('@oh-my-opendsh/omo-agents')
    // And it is NOT inside any group config of the host document either — it
    // is a top-level insert row (the settle-audit cannot reach through it).
    const nested = inserted.filter((row: any) => row?.group === true)
    for (const groupRow of nested) {
      expect(deepIds(groupRow.config)).not.toContain('omo-agents')
    }
  })
})
