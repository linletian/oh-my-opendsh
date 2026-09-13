// P2-T8 / P2-T9 / P2-T10 — the SECOND batch of Phase 2 persona semantic ports:
// plan-consultant (pre-planning gap analysis; upstream v4 name metis),
// plan-reviewer (plan review gate; upstream v4 name momus) and atlas
// (todo-execution orchestrator — the ONE delegation keeper). Porting discipline:
// docs/plans/phase2-dev/phase2-plan.md §4.3; per-agent adaptation notes:
// phase2-roster.md §2.5/§2.6/§2.7 (BINDING); acceptance: phase2-tasks.md
// P2-T8/P2-T9/P2-T10.
//
// This suite replicates tests/omo-agents/personas-batch1.test.ts for the second
// batch: each id's real builder output is compared byte-for-byte against its
// checked-in snapshot (a plain read + toBe — deliberately NOT
// toMatchFileSnapshot, so no code path here can rewrite a snapshot), and each
// persona's role identity, binding declarations and output contract are pinned
// as exact markers so that deleting one is a loud failure.
//
// The capability-class split is the structural point of this batch. The two
// read-only agents (plan-consultant / plan-reviewer) reuse the explore suite's
// no-write-grant line discipline and must state that the delegation tools are
// absent. atlas is the exact OPPOSITE rewrite (plan §4.5: maxDepth 2 is the
// structural expression of its orchestrator class): it must NOT carry a
// read-only declaration, it MUST state that it can delegate, and it MUST carry
// the upstream "YOU ARE AN ORCHESTRATOR — NEVER THE IMPLEMENTER" core together
// with the independent-verification discipline (roster §2.7).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  RUNTIME_INJECTED_HEADINGS,
  buildAgentPersona,
} from '../../patches/omo-dsh/omo-agents/src/persona-prompts'

/**
 * One batch-2 persona under test. `markers` are the exact strings a deletion or
 * a semantic regression would remove: the role-identity heading plus the
 * binding declarations / output contract each task requires be preserved.
 * `upstreamV4Name` is the OMO v4.19.4 agent name this DSH id was renamed from;
 * only the two renamed agents carry it (plan §2 naming anchor).
 */
interface Batch2Persona {
  readonly id: 'plan-consultant' | 'plan-reviewer' | 'atlas'
  /** The class from roster.ts §1 总表: atlas (orchestrator) may write, the two reviewers may not. */
  readonly writeCapable: boolean
  readonly roleHeading: string
  readonly upstreamV4Name?: 'metis' | 'momus'
  /**
   * True when upstream v4.19.4 `packages/utils/src/migration/agent-names.ts`
   * really carries the `<id>` → `<v4 name>` pair — verified true only for
   * plan-consultant (:28). False when the rename is project-anchored and the
   * header must state the absence instead. Meaningful only alongside
   * `upstreamV4Name`.
   */
  readonly upstreamAgentNamesEntry?: boolean
  readonly markers: readonly string[]
}

const BATCH2: readonly Batch2Persona[] = [
  {
    id: 'plan-consultant',
    writeCapable: false,
    roleHeading: '# Plan Consultant: Pre-Planning Gap Analysis',
    upstreamV4Name: 'metis',
    upstreamAgentNamesEntry: true,
    markers: [
      // Read-only consultant identity plus delegation absence (recipe 3;
      // upstream prompt used call_omo_agent — roster §2.5 note ④).
      'READ-ONLY',
      'You cannot delegate.',
      // The gap-analysis framework: PHASE 0 intent classification and the
      // per-intent PHASE 1 analysis (upstream METIS_SYSTEM_PROMPT).
      '## Phase 0 — Classify the Intent (mandatory first step)',
      '**Build from scratch**',
      '**Mid-sized task**',
      '**Collaborative**',
      '**Architecture**',
      '**Research**',
      // Output contract (upstream OUTPUT FORMAT) — preserved as a shape.
      '## Intent Classification',
      '## Pre-Analysis Findings',
      '## Questions for the Caller',
      '## Identified Risks',
      '## Directives for the Planner',
      // The mandatory zero-user-intervention QA directive block.
      'ZERO USER INTERVENTION',
      // Critical rules.
      'classify first',
      'Never fabricate',
    ],
  },
  {
    id: 'plan-reviewer',
    writeCapable: false,
    roleHeading: '# Plan Reviewer: Plan Critic and Review Gate',
    upstreamV4Name: 'momus',
    upstreamAgentNamesEntry: false,
    markers: [
      // Read-only review-gate identity plus delegation absence.
      'You cannot delegate.',
      // The namesake framing (upstream source docstring / roster §2.6).
      'Momus',
      'ruthless eye',
      // The review framework on the three axes.
      'clarity, verification, and',
      '### 1. Verification',
      '### 2. Clarity',
      '### 3. Context',
      'BLOCKER-finder, not a PERFECTIONIST',
      // The single question the role exists to answer.
      'developer execute this plan without getting stuck?',
      // Decision framework + output contract, preserved (upstream binding).
      'APPROVAL BIAS',
      'Maximum 3 issues per rejection.',
      '**[OKAY]** or **[REJECT]**',
      'Never open with filler',
      'Match the language of the plan content',
    ],
  },
  {
    id: 'atlas',
    writeCapable: true,
    roleHeading: '# Atlas: Master Orchestrator (TODO Execution)',
    markers: [
      // THE core: the orchestrator class keeps the delegation tools, unlike
      // every other sub-agent in the roster (plan §4.5 — exact opposite
      // rewrite of the read-only agents' delegation-absence line).
      'YOU ARE AN ORCHESTRATOR — NEVER THE IMPLEMENTER',
      'You can delegate.',
      'never write implementation code yourself',
      // Write capability expressed as orchestration bookkeeping only
      // (roster §2.7: writeCapable, but never the implementer).
      'orchestration bookkeeping',
      'What You Do vs What You Delegate',
      // Parallel-by-default dispatch + delegation prompt contract.
      'Parallel by default.',
      'Anti-duplication rule',
      // Independent verification before declaring done (roster §2.7 note ②).
      'You are the QA gate',
      'workers over-report',
      'No evidence = not complete.',
      // Activation by the conductor (no /ulw-* command face — Phase 4).
      'Activation and Scope',
      'activated by the conductor',
    ],
  },
]

/** Absolute path of one checked-in snapshot (read, never written here). */
function snapshotPath(id: Batch2Persona['id']): string {
  return fileURLToPath(new URL(`__snapshots__/${id}-system-prompt.md`, import.meta.url))
}

/** Reads one checked-in snapshot exactly as signed in (no trim). */
function readSnapshot(id: Batch2Persona['id']): string {
  return readFileSync(snapshotPath(id), 'utf8')
}

describe('Phase 2 batch-2 personas (P2-T8/T9/T10) — checked-in snapshots', () => {
  for (const persona of BATCH2) {
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

describe('Phase 2 batch-2 personas — attribution headers and structural guards', () => {
  for (const persona of BATCH2) {
    it(`${persona.id}: carries the OMO attribution header (source named, semantics-only)`, () => {
      const text = buildAgentPersona(persona.id)
      expect(text).toContain('<!-- Source: oh-my-openagent (SUL-1.0)')
      expect(text).toContain('Semantic translation only')
    })

    it(`${persona.id}: names every upstream source file it translates`, () => {
      const text = buildAgentPersona(persona.id)
      // Per-file attribution must name real tag paths, not a bare package name
      // (recipe 4). Each batch-2 port has at least one primary source file.
      expect(text).toContain('packages/omo-opencode/src/agents/')
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

describe('Phase 2 batch-2 personas — per-agent content markers', () => {
  for (const persona of BATCH2) {
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

describe('Phase 2 batch-2 personas — upstream rename mapping (v5 naming anchor)', () => {
  for (const persona of BATCH2.filter((entry) => entry.upstreamV4Name !== undefined)) {
    it(`${persona.id}: the attribution header maps the v4 name "${persona.upstreamV4Name}" to this id`, () => {
      const text = buildAgentPersona(persona.id)
      // plan §2 / ROADMAP §4 Phase 2: metis → plan-consultant,
      // momus → plan-reviewer. This direction (v4 name → DSH id) is the naming
      // anchor for BOTH renamed agents and must stay pinned.
      expect(text).toContain(
        `RENAME MAPPING: upstream v4 agent name "${persona.upstreamV4Name}" → DSH agent id`,
      )
    })

    if (persona.upstreamAgentNamesEntry === true) {
      it(`${persona.id}: the header pins the upstream agent-names.ts mapping that exists`, () => {
        // Verified against v4.19.4: agent-names.ts:28 maps
        // "plan-consultant" → "metis". This is the only one of the two v5
        // renames upstream actually records.
        expect(buildAgentPersona(persona.id)).toContain(
          `agent-names.ts maps "${persona.id}" → "${persona.upstreamV4Name}"`,
        )
      })
      continue
    }

    it(`${persona.id}: the header states there is NO upstream agent-names.ts entry`, () => {
      const text = buildAgentPersona(persona.id)
      // Verified against v4.19.4: agent-names.ts carries no "plan-reviewer"
      // key at all — its momus entries are only the v4 variants
      // ("Momus - Plan Critic" / "Momus (Plan Critic)" / "momus", :33-36). The
      // rename is project-anchored, so the corrected header must say so.
      expect(text).toContain('carries NO momus rename entry')
      expect(text).toContain('project-anchored, not upstream-mapped')
      // The fabricated mapping this suite previously pinned must never return.
      expect(text).not.toContain(
        `agent-names.ts maps "${persona.id}" → "${persona.upstreamV4Name}"`,
      )
    })
  }
})

describe('Phase 2 batch-2 personas — capability-class discipline', () => {
  for (const persona of BATCH2.filter((entry) => !entry.writeCapable)) {
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

  it('atlas (orchestrator): must NOT carry a read-only declaration', () => {
    const persona = buildAgentPersona('atlas')
    expect(persona).not.toContain('## Read-Only Declarations')
    expect(persona.toLowerCase()).not.toContain('read-only')
    expect(persona.toLowerCase()).not.toContain('cannot write')
    // The exact-opposite rewrite of the read-only class line: atlas is the only
    // sub-agent that keeps the delegation tools (plan §4.5 / roster §2.7).
    expect(persona.toLowerCase()).not.toContain('cannot delegate')
  })

  it('atlas (orchestrator): states it CAN delegate and owns independent verification', () => {
    const persona = buildAgentPersona('atlas')
    expect(persona).toContain('You can delegate.')
    // The NEVER-THE-IMPLEMENTER core, plus its verification consequence.
    expect(persona).toContain('YOU ARE AN ORCHESTRATOR — NEVER THE IMPLEMENTER')
    expect(persona).toContain('never write implementation code yourself')
    expect(persona).toContain('No evidence = not complete.')
  })
})
