// P2-T5 / P2-T6 / P2-T7 — the FIRST batch of Phase 2 persona semantic ports:
// hephaestus (autonomous deep worker), oracle (read-only advisor) and librarian
// (read-only docs/OSS search). Porting discipline: docs/plans/phase2-dev/
// phase2-plan.md §4.3; per-agent adaptation notes: phase2-roster.md §2.2/§2.3/
// §2.4 (BINDING); acceptance: phase2-tasks.md P2-T5/P2-T6/P2-T7.
//
// Division of proof with the sibling suites. tests/omo-agents/persona-prompts
// .test.ts pins the BUILDER (roster-driven resolution, guards, loud errors) and
// tests/omo-agents/explore-prompt.test.ts pins the T10 explore port. This suite
// is the per-persona CONTENT pin for batch 1: each id's real builder output is
// compared byte-for-byte against its checked-in snapshot (a plain read + toBe —
// deliberately NOT toMatchFileSnapshot, so no code path here can rewrite a
// snapshot), and each persona's role identity, binding declarations and output
// contract are pinned as exact markers so that deleting one is a loud failure.
//
// The "no write-capable capability grants" check for the two read-only agents
// reuses the explore suite's line discipline verbatim (PERSONA_MARKERS there):
// every line that even mentions write/create/modify/delete must negate it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  RUNTIME_INJECTED_HEADINGS,
  buildAgentPersona,
} from '../../patches/omo-dsh/omo-agents/src/persona-prompts'

/**
 * One batch-1 persona under test. `markers` are the exact strings a deletion or
 * a semantic regression would remove: the role-identity heading plus the
 * binding declarations / output contract each task requires be preserved.
 */
interface Batch1Persona {
  readonly id: 'hephaestus' | 'oracle' | 'librarian'
  /** The class from roster.ts §1 总表: worker may write, read-only may not. */
  readonly writeCapable: boolean
  readonly roleHeading: string
  readonly markers: readonly string[]
}

const BATCH1: readonly Batch1Persona[] = [
  {
    id: 'hephaestus',
    writeCapable: true,
    roleHeading: '# Hephaestus: Autonomous Deep Worker',
    markers: [
      // Role identity: goal-driven autonomous deep work (roster §2.2).
      'goals, not recipes',
      // Binding autonomy contract: work to completion, no premature stop.
      'Keep going until the goal is done',
      // Delegation-absence rewrite (recipe 3; upstream prompt used task()).
      'You cannot delegate',
      // Worker class: it CAN write/edit — never a read-only declaration.
      'You **can write and edit** files',
      // Question:"allow" upstream adapted to report-stated assumptions.
      'make a reasonable assumption',
      'Assumptions are part of the report',
    ],
  },
  {
    id: 'oracle',
    writeCapable: false,
    roleHeading: '# Oracle: Read-Only Technical Advisor',
    markers: [
      // Read-only advisor identity plus delegation absence.
      'You cannot write, edit, or patch anything',
      'you cannot delegate',
      // The continuable-session contract (roster §2.3 adaptation note).
      'follow-up questions via session continuation are',
      // Output contract — preserved COMPLETELY (roster §2.3).
      '**Bottom line**: 2-3 sentences maximum',
      'up to 7 numbered steps',
      'Quick (<1h)',
      '**Essential — always include:**',
      '**Expanded — include when relevant:**',
      '**Edge cases — only when genuinely applicable:**',
      '**Escalation triggers**',
      // Decision framework + evidence discipline.
      'Bias toward simplicity',
      'Never fabricate',
    ],
  },
  {
    id: 'librarian',
    writeCapable: false,
    roleHeading: '# The Librarian: Documentation and OSS Source Search',
    markers: [
      // Read-only search identity plus delegation absence.
      'You cannot write, edit, or delete anything',
      'you cannot delegate',
      // Request classification framework (upstream PHASE 0).
      'TYPE A — Conceptual',
      'TYPE B — Implementation',
      'TYPE C — Context',
      'TYPE D — Comprehensive',
      // Evidence contract (upstream mandatory citation format).
      'Every claim about external code carries a citation',
      // Tool face rewritten to the inherited web pair (recipe 3; roster §2.4).
      'web_search',
      'web_fetch',
    ],
  },
]

/** Absolute path of one checked-in snapshot (read, never written here). */
function snapshotPath(id: Batch1Persona['id']): string {
  return fileURLToPath(new URL(`__snapshots__/${id}-system-prompt.md`, import.meta.url))
}

/** Reads one checked-in snapshot exactly as signed in (no trim). */
function readSnapshot(id: Batch1Persona['id']): string {
  return readFileSync(snapshotPath(id), 'utf8')
}

describe('Phase 2 batch-1 personas (P2-T5/T6/T7) — checked-in snapshots', () => {
  for (const persona of BATCH1) {
    it(`${persona.id}: buildAgentPersona output byte-equals the checked-in snapshot`, () => {
      // Plain read + toBe: a mismatch fails loudly and there is no snapshot
      // rewrite path in this suite (contrast the explore suite's
      // toMatchFileSnapshot, which stays pinned to the T10 wrapper).
      expect(buildAgentPersona(persona.id)).toBe(readSnapshot(persona.id))
    })

    it(`${persona.id}: the snapshot is non-empty and is the loaded persona text`, () => {
      const snapshot = readSnapshot(persona.id)
      expect(snapshot.trim().length).toBeGreaterThan(0)
      // The builder trims the file's trailing newline; the checked-in snapshot
      // is that trimmed text, so a byte compare already implies equality — this
      // asserts it explicitly so a "collected zero personas" false green cannot
      // masquerade as a pass (Phase 1 R-5 lesson).
      expect(snapshot).toBe(buildAgentPersona(persona.id))
    })
  }
})

describe('Phase 2 batch-1 personas — attribution headers and structural guards', () => {
  for (const persona of BATCH1) {
    it(`${persona.id}: carries the OMO attribution header (source named, semantics-only)`, () => {
      const text = buildAgentPersona(persona.id)
      expect(text).toContain('<!-- Source: oh-my-openagent (SUL-1.0)')
      expect(text).toContain('Semantic translation only')
    })

    it(`${persona.id}: no {{ sequence and no runtime-injected heading`, () => {
      const text = buildAgentPersona(persona.id)
      // Guard a: dsh renderPrompt throws on an unknown {{variable}}.
      expect(text).not.toContain('{{')
      // Guard b: the T16 listener owns both sections at runtime.
      for (const heading of RUNTIME_INJECTED_HEADINGS) {
        expect(text).not.toContain(heading)
      }
    })
  }
})

describe('Phase 2 batch-1 personas — per-agent content markers', () => {
  for (const persona of BATCH1) {
    it(`${persona.id}: declares its role identity heading`, () => {
      expect(buildAgentPersona(persona.id)).toContain(persona.roleHeading)
    })

    it(`${persona.id}: carries every binding declaration / output-contract marker`, () => {
      const text = buildAgentPersona(persona.id)
      for (const marker of persona.markers) {
        expect(text).toContain(marker)
      }
    })
  }
})

describe('Phase 2 batch-1 personas — capability-class discipline', () => {
  for (const persona of BATCH1.filter((entry) => !entry.writeCapable)) {
    it(`${persona.id} (read-only): declares NO write-capable capability grants`, () => {
      // The explore suite's discipline: no line may grant write ability; every
      // line that even mentions mutation must negate it.
      for (const line of buildAgentPersona(persona.id).split('\n')) {
        if (!/write|create|modify|delete/i.test(line)) continue
        expect(line.toLowerCase()).toMatch(/never|cannot|not|read-only/)
      }
    })

    it(`${persona.id} (read-only): states the delegation tools are absent`, () => {
      expect(buildAgentPersona(persona.id).toLowerCase()).toContain('cannot delegate')
    })
  }

  it('hephaestus (worker): must NOT carry read-only declarations', () => {
    const persona = buildAgentPersona('hephaestus')
    expect(persona).not.toContain('## Read-Only Declarations')
    expect(persona.toLowerCase()).not.toContain('cannot write')
    expect(persona.toLowerCase()).not.toContain('read-only')
    // Instead it owns the write grant the worker class requires.
    expect(persona).toContain('can write and edit')
  })

  it('librarian: the MCP/context7 tool face is deleted (Phase 6 scope)', () => {
    const persona = buildAgentPersona('librarian')
    // Strip the attribution comment, whose accurate provenance line NAMES the
    // dropped references; the persona body itself must not resurrect them.
    const body = persona.replace(/^<!--[\s\S]*?-->\n/, '')
    expect(body.toLowerCase()).not.toContain('context7')
    expect(body.toLowerCase()).not.toContain('mcp')
  })
})
