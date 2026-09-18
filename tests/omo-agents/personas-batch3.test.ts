// P2-T11 / P2-T12 / P2-T13 — the THIRD and FINAL batch of Phase 2 persona
// semantic ports: multimodal-looker (allowlist-class media/document analyst),
// sisyphus-junior (worker-class focused executor with no delegation rights) and
// prometheus (read-only interview-style strategic planner). Porting discipline:
// docs/plans/phase2-dev/phase2-plan.md §4.3; per-agent adaptation notes:
// phase2-roster.md §2.8/§2.9/§2.10 (BINDING); acceptance: phase2-tasks.md
// P2-T11/P2-T12/P2-T13.
//
// This suite replicates tests/omo-agents/personas-batch1.test.ts and
// personas-batch2.test.ts for the final batch: each id's real builder output is
// compared byte-for-byte against its checked-in snapshot (a plain read + toBe —
// deliberately NOT toMatchFileSnapshot, so no code path here can rewrite a
// snapshot), and each persona's role identity, binding declarations and output
// contract are pinned as exact markers so that deleting one is a loud failure.
//
// The capability-class split is again the structural point, and this batch
// carries all three remaining shapes:
//   - multimodal-looker is the roster's ONLY allowlist row: its persona must
//     declare the exact two-tool read face (`read` for UTF-8 text, `read_image`
//     for images — OMO's single `read` splits in DSH, plan §4.4 H-1) and the
//     conditional registration of `read_image`, and it must grant no write and
//     no delegation.
//   - sisyphus-junior is a worker: the exact OPPOSITE of a read-only
//     declaration — it MAY write, it may NOT delegate, and the upstream v4
//     "category routing intermediary" semantics are gone (roster §2.9 note ①),
//     so the persona BODY must not resurrect category-routing language.
//   - prometheus is read-only in this mirror (roster §2.10 note ③): no write
//     grant, no delegation, and the interviewee is the CONDUCTOR rather than the
//     user — questions are written back into the report and it never stalls on
//     an interactive question (roster §2.10 note ①).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  RUNTIME_INJECTED_HEADINGS,
  buildAgentPersona,
} from '../../patches/omo-dsh/omo-agents/src/persona-prompts'
import { ROSTER } from '../../patches/omo-dsh/omo-agents/src/roster'

/**
 * One batch-3 persona under test. `markers` are the exact strings a deletion or
 * a semantic regression would remove: the role-identity heading plus the
 * binding declarations / output contract each task requires be preserved.
 * `writeCapable` is the class from roster.ts §1 总表: only sisyphus-junior may
 * write; the other two may not.
 */
interface Batch3Persona {
  readonly id: 'multimodal-looker' | 'sisyphus-junior' | 'prometheus'
  readonly writeCapable: boolean
  readonly roleHeading: string
  readonly markers: readonly string[]
}

const BATCH3: readonly Batch3Persona[] = [
  {
    id: 'multimodal-looker',
    writeCapable: false,
    roleHeading: '# Multimodal Looker: Media and Document Analysis',
    markers: [
      // Role identity: the caller's eyes on content that cannot be read as
      // plain text (upstream prompt :24).
      'You can read text and you can read images',
      // THE tool face (bindings; plan §4.4 H-1 mapping): the DSH split of OMO's
      // single `read` into a text tool and an image tool.
      '`read` — UTF-8 text files.',
      '`read_image` — images and image-rendered documents',
      'You cannot write, edit, or run commands, and you cannot delegate.',
      // The conditional-registration caveat for `read_image` (plan §4.4/§6 R-9).
      'conditionally registered',
      // Output discipline: extract the INFORMATION, never the raw bytes.
      'Never return the raw file content',
      'a dump of the file is not an answer',
      // Say what could not be determined rather than guessing (upstream :55).
      'State what could not be determined, and why',
    ],
  },
  {
    id: 'sisyphus-junior',
    writeCapable: true,
    roleHeading: '# Sisyphus-Junior: Focused Task Executor',
    markers: [
      // Worker class: it CAN write and edit — never a read-only declaration
      // (upstream BLOCKED_TOOLS is `["task"]` only; agent.ts:39-41).
      'You can write and edit.',
      // Delegation absence — the OPPOSITE of upstream's force-allowed
      // call_omo_agent (agent.ts:137), deliberately not mirrored
      // (roster §2.9 note ③).
      'You cannot delegate.',
      // Upstream agent description: "Same discipline, no delegation."
      'Same discipline, no delegation',
      // Todo discipline (upstream default.ts:53-75).
      'Never batch completions.',
      'No todos on multi-step work = incomplete work.',
      // Verification + termination discipline (upstream default.ts:31-41).
      'Stop after the first successful verification. Do NOT re-verify.',
      'Maximum two status checks.',
      // Style discipline (upstream default.ts:43-47).
      'Dense beats verbose',
      'Lead with the outcome',
    ],
  },
  {
    id: 'prometheus',
    writeCapable: false,
    roleHeading: '# Prometheus: Interview-Style Strategic Planner',
    markers: [
      // Planner identity, plan-mode stickiness and the no-implementation pledge
      // (upstream default.md:1-3).
      'Plan mode is sticky.',
      'not directly, and not by proxy',
      'You are read-only.',
      // Explore-first research discipline (upstream SKILL.md:69-77).
      'Discoverable facts are researched, never asked.',
      'Explore to sufficiency, then STOP.',
      // The CLEAR / UNCLEAR intent routing framework (upstream SKILL.md:35-51)
      // preserved, including the override and the on-the-fence tie-break.
      '**CLEAR**',
      '**UNCLEAR**',
      'adopt a defensible best-practice default',
      'Explicit ask wins',
      'On the fence',
      'Two filters, in order',
      'gate trigger, not a style cue',
      // Topology lock and the clearance check — the two structural gates that
      // bracket the interview (upstream intent-clear.md:21, :29).
      'Lock the topology first.',
      'Clearance check.',
      // The binding adaptation: the interviewee is the conductor (roster §2.10
      // note ①), not the user, and the run never stalls.
      'conductor is your interviewee',
      'Never stall waiting for an answer.',
      'across session continuations',
      // Decision-complete plan contract (upstream SKILL.md:67, :69-80).
      'decision-complete',
      'Full scope is the default.',
      'Approval is not execution.',
      '- [ ] N. <title>',
      'agent-executed QA',
    ],
  },
]

/** Absolute path of one checked-in snapshot (read, never written here). */
function snapshotPath(id: Batch3Persona['id']): string {
  return fileURLToPath(new URL(`__snapshots__/${id}-system-prompt.md`, import.meta.url))
}

/** Reads one checked-in snapshot exactly as signed in (no trim). */
function readSnapshot(id: Batch3Persona['id']): string {
  return readFileSync(snapshotPath(id), 'utf8')
}

/**
 * The persona body with the attribution comment stripped. Negative content
 * assertions must run on the body only: an accurate provenance header legitimately
 * NAMES what was not ported (the category-routing framing, `ask_user`, the Phase 4
 * command face), and pinning its absence over the whole file would forbid the
 * honest note rather than the regression.
 */
function body(id: Batch3Persona['id']): string {
  return buildAgentPersona(id).replace(/^<!--[\s\S]*?-->\n/, '')
}

/** The roster row for an id, so class assertions read the single source of truth. */
function rosterRow(id: Batch3Persona['id']) {
  const row = ROSTER.find((entry) => entry.id === id)
  if (row === undefined) throw new Error(`roster has no row for '${id}'`)
  return row
}

describe('Phase 2 batch-3 personas (P2-T11/T12/T13) — checked-in snapshots', () => {
  for (const persona of BATCH3) {
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

describe('Phase 2 batch-3 personas — attribution headers and structural guards', () => {
  for (const persona of BATCH3) {
    it(`${persona.id}: carries the OMO attribution header (source named, semantics-only)`, () => {
      const text = buildAgentPersona(persona.id)
      expect(text).toContain('<!-- Source: oh-my-openagent (SUL-1.0)')
      expect(text).toContain('Semantic translation only')
    })

    it(`${persona.id}: names the real upstream source file(s) at their tag path`, () => {
      const text = buildAgentPersona(persona.id)
      // Per-file attribution must name real tag paths, not a bare package name
      // (recipe 4). Each batch-3 port has at least one primary source file.
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

describe('Phase 2 batch-3 personas — per-agent content markers', () => {
  for (const persona of BATCH3) {
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

describe('Phase 2 batch-3 personas — capability-class discipline', () => {
  for (const persona of BATCH3.filter((entry) => !entry.writeCapable)) {
    it(`${persona.id} (non-writer): declares NO write-capable capability grants`, () => {
      // The explore suite's discipline: no line may grant write ability; every
      // line that even mentions mutation must negate it.
      for (const line of buildAgentPersona(persona.id).split('\n')) {
        if (!/write|create|modify|delete/i.test(line)) continue
        expect(line.toLowerCase()).toMatch(/never|cannot|not|read-only/)
      }
    })

    it(`${persona.id} (non-writer): states the delegation tools are absent`, () => {
      expect(buildAgentPersona(persona.id).toLowerCase()).toContain('cannot delegate')
    })

    it(`${persona.id} (non-writer): the roster agrees it is not write-capable`, () => {
      // Cross-pin: the persona's class claim and roster.ts must not drift.
      expect(rosterRow(persona.id).writeCapable).toBe(false)
    })
  }

  it('multimodal-looker (allowlist): declares exactly the roster allowlist tool face', () => {
    const row = rosterRow('multimodal-looker')
    // The roster is the single source of truth for the filter (plan §4.2): the
    // allowlist class and its exact two tool names.
    expect(row.class).toBe('allowlist')
    expect(row.allowTools).toEqual(['read', 'read_image'])
    expect(row.writeCapable).toBe(false)
    // ...and the persona must actually declare BOTH names, because an allowlist
    // filter hides every name it does not list (plan §4.4 H-1: `allow: [read]`
    // alone would close the vision entry point).
    const text = buildAgentPersona('multimodal-looker')
    for (const toolName of row.allowTools ?? []) {
      expect(text).toContain(toolName)
    }
    // The DSH read split is named explicitly, so a future reader cannot mistake
    // `read` for the image-capable tool.
    expect(text).toContain('`read` — UTF-8 text files.')
    expect(text).toContain('`read_image` — images and image-rendered documents')
    // `read_image` is conditionally registered; the caveat must survive (R-9).
    expect(text).toContain('conditionally registered')
  })

  it('multimodal-looker (allowlist): grants no write, no shell, no delegation', () => {
    const persona = buildAgentPersona('multimodal-looker')
    expect(persona).toContain(
      'You cannot write, edit, or run commands, and you cannot delegate.',
    )
    // The upstream `apply_patch` class of references has no DSH counterpart; the
    // attribution header may NAME it (recipe 3 coverage note), but the body must
    // not resurrect it as a tool the agent has.
    expect(body('multimodal-looker')).not.toContain('apply_patch')
    // It must not claim the text tool reads images.
    expect(persona).not.toContain('`read` — images')
  })

  it('sisyphus-junior (worker): must NOT carry a read-only declaration', () => {
    const persona = buildAgentPersona('sisyphus-junior')
    expect(persona).not.toContain('## Read-Only Declarations')
    expect(persona.toLowerCase()).not.toContain('read-only')
    expect(persona.toLowerCase()).not.toContain('cannot write')
    // Instead it owns the write grant the worker class requires.
    expect(persona).toContain('You can write and edit.')
    expect(rosterRow('sisyphus-junior').class).toBe('worker')
    expect(rosterRow('sisyphus-junior').writeCapable).toBe(true)
  })

  it('sisyphus-junior (worker): can write but cannot delegate', () => {
    const persona = buildAgentPersona('sisyphus-junior')
    expect(persona).toContain('You can write and edit.')
    // The delegation-absence declaration, not a conditional allowance: upstream's
    // force-allowed call_omo_agent (agent.ts:137) is deliberately not mirrored
    // (roster §2.9 note ③).
    expect(persona).toContain('You cannot delegate.')
    expect(persona.toLowerCase()).toContain('physically absent')
  })

  it('sisyphus-junior (worker): the category-routing intermediary semantics are gone', () => {
    // roster §2.9 note ①: v4 sisyphus-junior doubled as a category routing
    // intermediary; v5 removed the intermediary and the category system is out
    // of scope at this stage. The attribution header says so (that is the honest
    // NOT-ported note), but the BODY must not describe this agent as a router.
    const text = buildAgentPersona('sisyphus-junior')
    expect(text).toContain('category-routing-intermediary semantics are NOT ported')
    expect(body('sisyphus-junior').toLowerCase()).not.toContain('categor')
  })

  it('prometheus (read-only): the interview target is the conductor, not the user', () => {
    const persona = buildAgentPersona('prometheus')
    expect(rosterRow('prometheus').class).toBe('read-only')
    expect(rosterRow('prometheus').writeCapable).toBe(false)
    expect(persona).toContain('conductor is your interviewee')
    expect(persona).toContain('Never stall waiting for an answer.')
    expect(persona).toContain('across session continuations')
  })

  it('prometheus (read-only): no interactive-question stalling instruction', () => {
    // roster §2.10 note ①: it runs in the background, so a stalling question is
    // a failed run. The body must carry the prohibition, not an instruction to
    // wait for an interactive answer.
    const text = body('prometheus')
    expect(text).toContain('Ask nothing through an interactive question tool')
    expect(text).not.toContain('ask_user')
    expect(text).not.toMatch(/wait for the (user|caller)/i)
    expect(text).not.toMatch(/ask the user/i)
  })

  it('prometheus (read-only): the Phase 4 command face is not referenced as available', () => {
    // roster §2.10 note ②: the /ulw-plan flow (with its plan-reviewer loop) is
    // Phase 4; the read-only narrowing (note ③) means plans come back as report
    // text, so no plan command or skill load may be assumed.
    const text = body('prometheus')
    expect(text).not.toContain('ulw-plan')
    expect(text).not.toContain('plan-reviewer')
    expect(text).toContain('conductor decides what lands on disk')
  })
})
