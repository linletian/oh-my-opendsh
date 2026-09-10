// T10 — omo-explore read-only retrieval subagent persona (FR-4) (TDD: written
// BEFORE the module existed; first run must fail on the unresolved import).
//
// Architecture decision (investigated, then chosen — see the evidence log):
// explore is a SUBAGENT persona, not a run mode. dsh-tool-subagent takes a
// per-child persona as INLINE TEXT: config field `persona: string`
// (tool-subagent/src/index.ts:57,92 — "Per-child persona that shadows
// deployment:persona-prefix", renamed at dsh-v0.1.3-alpha.2), forwarded
// verbatim into the start request
// (index.ts:384); the spawn-in-process provider declares the `persona`
// capability (subagent-spawn-in-process/src/index.ts:42), and
// applyChildComposition registers it as the child-scoped
// `deployment:persona-prefix` system-prompt section at order 0
// (subagent/src/child-agent.ts:209-214). So the honest minimal shape is the
// T7/T8 chain reused: ONE markdown file in system-sections/ (loaded through
// the T7 loadSectionFile, P-9-stable import.meta.url resolution) + ONE
// builder producing the string T11 binds as the instance's `persona`.
//
// Composition with T16 (FR-6): the hard-blocks injection listener owns the
// Hard Blocks + Anti-Patterns sections at RUNTIME for every sub-agent
// (origin === 'subagent'), so the explore BASE persona must not carry them —
// the builder rejects those headings structurally, and the tests below pin
// the non-duplication.
//
// Selection rationale (report §13.3.2): OMO's call_omo_agent allowlist holds
// ONLY ["explore","librarian"] (tools/call-omo-agent/constants.ts:1-4) —
// explore is OMO's own safest-subagent pick. Persona semantics translated
// from OMO's explore agent (agents/explore.ts) — markdown semantics only, no
// TypeScript code copied.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EXPLORE_PERSONA_FILE,
  EXPLORE_SECTION_ORDER,
  buildExploreSystemPrompt,
  loadExploreSections,
} from '../../patches/omo-dsh/omo-agents/src/explore-prompt'
import {
  SYSTEM_SECTIONS_DIR,
  loadSectionFile,
  loadSystemSections,
} from '../../patches/omo-dsh/omo-agents/src/system-sections'
import { buildSisyphusSystemPrompt } from '../../patches/omo-dsh/omo-agents/src/system-prompt'

// The three required declaration classes (read-only/no-write, no clarifying
// questions, answer-first reporting) pinned as exact markers. The
// failure-injection QA deletes the read-only declaration from the persona —
// these markers are what make that deletion a loud test failure.
const PERSONA_MARKERS = {
  roleHeading: '# Explore: Read-Only Retrieval Agent',
  readOnlyHeading: '## Read-Only Declarations',
  cannotWrite: 'cannot write',
  noFileMutation: 'never create, modify, or delete files',
  noClarifyingHeading: '## No Clarifying Questions',
  neverAsk: 'Never ask the user',
  assumption: 'reasonable assumption',
  answerFirstHeading: '## Answer-First Reporting',
  answerFirst: 'Answer first',
} as const

// Sections the T16 runtime injection owns — never part of the base persona.
const RUNTIME_INJECTED_MARKERS = ['## Hard Blocks', '## Anti-Patterns'] as const

describe('omo-explore persona markdown (T10, FR-4)', () => {
  it('ships as explore-persona.md inside the T7 system-sections dir, loaded via the T7 loader', () => {
    expect(EXPLORE_PERSONA_FILE).toBe('explore-persona.md')
    // The file physically exists at the import.meta.url-resolved dir (P-9).
    const fromDisk = readFileSync(join(SYSTEM_SECTIONS_DIR, EXPLORE_PERSONA_FILE), 'utf8')
    expect(fromDisk.trim().length).toBeGreaterThan(0)
    // The builder's loader path IS the T7 loadSectionFile against the same dir.
    expect(loadExploreSections().explorePersona).toBe(
      loadSectionFile(SYSTEM_SECTIONS_DIR, EXPLORE_PERSONA_FILE),
    )
  })

  it('carries the OMO attribution header (source named, semantics-only translation)', () => {
    const persona = loadExploreSections().explorePersona
    expect(persona).toContain('<!-- Source: oh-my-openagent (SUL-1.0)')
    expect(persona).toContain('Semantic translation only')
  })

  it('declares the role: a read-only retrieval agent', () => {
    const persona = loadExploreSections().explorePersona
    expect(persona).toContain(PERSONA_MARKERS.roleHeading)
    const lower = persona.toLowerCase()
    expect(lower).toContain('read-only')
    expect(lower).toContain('retrieval')
  })

  it('declares it can read but NOT write (the binding read-only declarations)', () => {
    const persona = loadExploreSections().explorePersona
    expect(persona).toContain(PERSONA_MARKERS.readOnlyHeading)
    expect(persona.toLowerCase()).toContain('can read')
    expect(persona.toLowerCase()).toContain(PERSONA_MARKERS.cannotWrite)
    expect(persona).toContain(PERSONA_MARKERS.noFileMutation)
  })

  it('forbids clarifying questions: make a reasonable assumption and continue', () => {
    const persona = loadExploreSections().explorePersona
    expect(persona).toContain(PERSONA_MARKERS.noClarifyingHeading)
    expect(persona).toContain(PERSONA_MARKERS.neverAsk)
    expect(persona.toLowerCase()).toContain('clarifying question')
    expect(persona.toLowerCase()).toContain(PERSONA_MARKERS.assumption)
    expect(persona.toLowerCase()).toContain('continue')
  })

  it('mandates answer-first, concise reporting', () => {
    const persona = loadExploreSections().explorePersona
    expect(persona).toContain(PERSONA_MARKERS.answerFirstHeading)
    expect(persona).toContain(PERSONA_MARKERS.answerFirst)
    const lower = persona.toLowerCase()
    expect(lower).toContain('concise')
    expect(lower).toContain('absolute path')
  })

  it('declares NO write-capable capability grants (plan T10 must-not)', () => {
    const persona = loadExploreSections().explorePersona
    // No sentence may grant write ability; the only write mentions are bans.
    for (const line of persona.split('\n')) {
      if (!/write|create|modify|delete/i.test(line)) continue
      expect(line.toLowerCase()).toMatch(/never|cannot|not|read-only/)
    }
  })
})

describe('buildExploreSystemPrompt (T10)', () => {
  it('declares the fixed section order [explorePersona]', () => {
    expect([...EXPLORE_SECTION_ORDER]).toEqual(['explorePersona'])
  })

  it('assembles the persona section trimmed (fixed order, single source file)', () => {
    expect(buildExploreSystemPrompt()).toBe(loadExploreSections().explorePersona.trimEnd())
  })

  it('NON-duplication: the assembled explore prompt carries no hard-blocks / anti-patterns sections', () => {
    const prompt = buildExploreSystemPrompt()
    for (const marker of RUNTIME_INJECTED_MARKERS) {
      expect(prompt).not.toContain(marker)
    }
    // The raw markdown file is clean too — duplication cannot hide in a join artifact.
    const persona = loadExploreSections().explorePersona
    for (const marker of RUNTIME_INJECTED_MARKERS) {
      expect(persona).not.toContain(marker)
    }
  })

  it('the builder REJECTS a section smuggling the runtime-injected headings (structural guard)', () => {
    expect(() =>
      buildExploreSystemPrompt({ explorePersona: 'role text\n\n## Hard Blocks\n\n- Never X' }),
    ).toThrow(/Hard Blocks/)
    expect(() =>
      buildExploreSystemPrompt({ explorePersona: 'role text\n\n## Anti-Patterns (BLOCKING violations)' }),
    ).toThrow(/Anti-Patterns/)
  })

  it('contains no {{...}} sequences (dsh renderPrompt throws on unknown prompt variables)', () => {
    expect(buildExploreSystemPrompt()).not.toContain('{{')
    expect(() =>
      buildExploreSystemPrompt({ explorePersona: 'read-only {{unknown_var}}' }),
    ).toThrow(/\{\{/)
  })

  it('no cross-contamination: the explore persona never leaks into the sisyphus prompt', () => {
    const sisyphus = buildSisyphusSystemPrompt()
    expect(sisyphus).not.toContain(PERSONA_MARKERS.roleHeading)
    // …and the four sisyphus sections are exactly the T7 four (no 5th key).
    expect(Object.keys(loadSystemSections())).toEqual([
      'role',
      'delegationDiscipline',
      'hardBlocks',
      'antiPatterns',
    ])
  })

  it('matches the checked-in snapshot', () => {
    expect(buildExploreSystemPrompt()).toMatchFileSnapshot('__snapshots__/explore-system-prompt.md')
  })
})
