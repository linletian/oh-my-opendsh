// T8 — omo-sisyphus system prompt builder + concerto persona rendering
// (TDD: written BEFORE the module existed; first run must fail on the
// unresolved import).
//
// Integration design (a) — sync-time rendering: the shipped concerto
// template keeps a PLACEHOLDER sentinel as its persona text, and
// syncConcertoPreset renders the sentinel into a YAML block scalar carrying
// buildSisyphusSystemPrompt() at apply() time. Drift between the markdown
// sections and the booted persona is impossible by construction — there is
// no second, checked-in rendering to go stale (that is design (b)'s honesty
// hazard: its guard catches drift but the remediation is a manual re-render
// ritual). Verified end-to-end by scripts/concerto-mode-probe.sh, which
// greps the MATERIALIZED $DSH_HOME preset file for the section markers.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONCERTO_TEMPLATE_DIR } from '../../patches/omo-dsh/omo-agents/src/concerto-preset'
import { loadSystemSections, type SystemSections } from '../../patches/omo-dsh/omo-agents/src/system-sections'
import {
  PERSONA_TEXT_SENTINEL,
  SISYPHUS_SECTION_ORDER,
  buildSisyphusSystemPrompt,
  renderPersonaIntoComposition,
} from '../../patches/omo-dsh/omo-agents/src/system-prompt'

// The five section headings used as markers. The AC-3 case below asserts the
// first four (orchestrator role + delegation discipline + the P2-T14 roster +
// the injected hard-blocks section); `antiPatterns` is the fifth, checked by
// the persona-rendering tests.
const SECTION_MARKERS = {
  role: '# Orchestrator Role',
  delegationDiscipline: '# Delegation Discipline',
  delegationRoster: '# Delegation Roster',
  hardBlocks: '## Hard Blocks',
  antiPatterns: '## Anti-Patterns (BLOCKING violations)',
} as const

/** Extracts the persona block-scalar content lines from a rendered composition. */
function personaBlockLines(rendered: string): string[] {
  const lines = rendered.split('\n')
  const start = lines.findIndex((line) => line.trim() === 'prefix: |-')
  if (start < 0) throw new Error('no `prefix: |-` block scalar in the rendered composition')
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('      ')) body.push(line.slice(6))
    else if (line.length === 0) body.push('')
    else break
  }
  // `|-` strip chomping drops trailing blank lines, and a blank separator
  // after the block (or the file's final newline) is not content.
  while (body.length > 0 && body[body.length - 1] === '') body.pop()
  return body
}

describe('omo-sisyphus system prompt builder (T8)', () => {
  it('declares the fixed section order [role, delegationDiscipline, delegationRoster, hardBlocks, antiPatterns]', () => {
    expect([...SISYPHUS_SECTION_ORDER]).toEqual([
      'role',
      'delegationDiscipline',
      'delegationRoster',
      'hardBlocks',
      'antiPatterns',
    ])
  })

  it('assembles exactly the 5 T7/T14 sections, each trimmed, joined by a single blank line', () => {
    const sections = loadSystemSections()
    const expected = [
      sections.role,
      sections.delegationDiscipline,
      sections.delegationRoster,
      sections.hardBlocks,
      sections.antiPatterns,
    ]
      .map((section) => section.trimEnd())
      .join('\n\n')
    expect(buildSisyphusSystemPrompt()).toBe(expected)
  })

  it('carries exactly the 5 section headings, in ascending order (the roster 3rd, before the runtime-injected pair)', () => {
    const prompt = buildSisyphusSystemPrompt()
    const positions = [
      SECTION_MARKERS.role,
      SECTION_MARKERS.delegationDiscipline,
      SECTION_MARKERS.delegationRoster,
      SECTION_MARKERS.hardBlocks,
      SECTION_MARKERS.antiPatterns,
    ].map((marker) => prompt.indexOf(marker))
    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]!)
    }
  })

  it('the roster section (P2-T14) is non-empty and names every delegation target id', () => {
    const { delegationRoster } = loadSystemSections()
    expect(delegationRoster.trim().length).toBeGreaterThan(0)
    for (const id of [
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
    ]) {
      expect(delegationRoster).toContain(`\`${id}\``)
    }
  })

  it('contains no {{...}} sequences (dsh renderPrompt throws on unknown prompt variables)', () => {
    expect(buildSisyphusSystemPrompt()).not.toContain('{{')
  })

  it('rejects a {{...}} sequence in ANY of the 5 sections, including the new roster section', () => {
    const base: SystemSections = {
      role: 'role',
      delegationDiscipline: 'delegate',
      delegationRoster: 'roster',
      hardBlocks: 'blocks',
      antiPatterns: 'patterns',
    }
    for (const key of SISYPHUS_SECTION_ORDER) {
      const sections: SystemSections = { ...base, [key]: 'section with {{unknown_var}}' }
      expect(() => buildSisyphusSystemPrompt(sections)).toThrow(/\{\{/)
    }
  })

  it('AC-3: matches the checked-in snapshot and asserts all required markers (5 sections)', () => {
    const prompt = buildSisyphusSystemPrompt()
    expect(prompt).toContain(SECTION_MARKERS.role) // orchestrator role content
    expect(prompt).toContain(SECTION_MARKERS.delegationDiscipline) // delegation discipline content
    expect(prompt).toContain(SECTION_MARKERS.delegationRoster) // the P2-T14 delegation roster content
    expect(prompt).toContain(SECTION_MARKERS.hardBlocks) // the injected `## Hard Blocks` section
    expect(prompt).toMatchFileSnapshot('__snapshots__/sisyphus-system-prompt.md')
  })
})

describe('renderPersonaIntoComposition (T8, design a: sync-time rendering)', () => {
  it('the shipped concerto template keeps the sentinel as its persona text, exactly once', () => {
    const template = readFileSync(join(CONCERTO_TEMPLATE_DIR, 'agent.cordis.yml'), 'utf8')
    const occurrences = template.split(`prefix: ${PERSONA_TEXT_SENTINEL}`).length - 1
    expect(occurrences).toBe(1)
    expect(template).not.toContain('# Orchestrator Role')
  })

  it('renders the sentinel into a |- block scalar carrying the assembled prompt', () => {
    const template = readFileSync(join(CONCERTO_TEMPLATE_DIR, 'agent.cordis.yml'), 'utf8')
    const rendered = renderPersonaIntoComposition(template)
    expect(rendered).not.toContain(PERSONA_TEXT_SENTINEL)
    expect(rendered).toContain('prefix: |-')
    for (const marker of Object.values(SECTION_MARKERS)) {
      expect(rendered).toContain(`      ${marker}`)
    }
    // Everything outside the persona value is byte-identical to the template.
    const templateBefore = template.slice(0, template.indexOf(`prefix: ${PERSONA_TEXT_SENTINEL}`))
    expect(rendered.startsWith(templateBefore)).toBe(true)
  })

  it('round-trips: stripping the 6-space indent recovers buildSisyphusSystemPrompt() byte-for-byte', () => {
    const template = readFileSync(join(CONCERTO_TEMPLATE_DIR, 'agent.cordis.yml'), 'utf8')
    const rendered = renderPersonaIntoComposition(template)
    expect(personaBlockLines(rendered).join('\n')).toBe(buildSisyphusSystemPrompt())
  })

  it('throws when the sentinel is missing (template regressed to hardcoded text)', () => {
    expect(() => renderPersonaIntoComposition('- id: persona\n  config:\n    prefix: hardcoded\n')).toThrow(
      /exactly once/,
    )
  })

  it('throws when the sentinel appears more than once (ambiguous persona slot)', () => {
    const doubled = `prefix: ${PERSONA_TEXT_SENTINEL}\n  prefix: ${PERSONA_TEXT_SENTINEL}\n`
    expect(() => renderPersonaIntoComposition(doubled)).toThrow(/exactly once/)
  })

  it('accepts an explicit prompt (sync module injects; tests stay hermetic)', () => {
    const rendered = renderPersonaIntoComposition(`prefix: ${PERSONA_TEXT_SENTINEL}\n`, 'line one\n\nline two')
    expect(personaBlockLines(rendered)).toEqual(['line one', '', 'line two'])
  })
})
