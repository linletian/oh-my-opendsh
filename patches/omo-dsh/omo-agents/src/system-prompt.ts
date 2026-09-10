// system-prompt.ts — T8 builder for the omo-sisyphus system prompt (FR-3,
// AC-3). Assembles the four T7 markdown policy sections in the fixed order
// [role, delegationDiscipline, hardBlocks, antiPatterns] — no 5th section,
// no hardcoded prompt strings here; the markdown files are the only source
// of prompt text.
//
// Integration design (a) — sync-time rendering: the concerto template's
// agent.cordis.yml keeps PERSONA_TEXT_SENTINEL as its persona value, and
// renderPersonaIntoComposition substitutes a YAML block scalar carrying the
// assembled prompt when syncConcertoPreset materializes the preset at
// apply() time. Chosen over (b) checked-in rendered content because honesty
// under (a) is structural — the persona that boots IS this builder's output,
// so no second artifact can drift — whereas (b) needs a manual re-render
// ritual after every markdown edit (its drift guard catches the staleness
// but cannot prevent it). Cost accepted: the block-scalar renderer below
// (~10 lines) and sync no longer being a pure byte-copy.
//
// dsh mechanics this module is shaped by (read-only inspection of the
// installed rc.6, key re-verified on 0.1.5-rc.1): a preset's persona row
// registers the `deployment:persona-prefix` section via @deepseek-ai/dsh-persona
// (renamed from `deployment:persona` at dsh-v0.1.3-alpha.2;
// docs/dsh-0.1.5-rc.1-review.md §2), and dsh-system-prompt's renderPrompt
// interpolates strict `{{variable}}` references, THROWING on unknown ones —
// so the assembled prompt is rejected at build time if any section smuggles
// a `{{` sequence in (none of the four markdown files contains one today).
import { loadSystemSections, type SystemSections } from './system-sections.ts'

/** Fixed assembly order — the ONLY order the omo-sisyphus prompt is built in. */
export const SISYPHUS_SECTION_ORDER = [
  'role',
  'delegationDiscipline',
  'hardBlocks',
  'antiPatterns',
] as const satisfies readonly (keyof SystemSections)[]

/**
 * Placeholder the concerto template carries as its persona `prefix` value
 * (the key `@deepseek-ai/dsh-persona` reads; renamed from `text` at
 * dsh-v0.1.3-alpha.2 — see docs/dsh-0.1.5-rc.1-review.md §2).
 * Never a `{{...}}` shape: if an unrendered template were ever mounted, dsh
 * would treat it as plain prose rather than a fatal unknown-variable throw.
 */
export const PERSONA_TEXT_SENTINEL = '__OMO_SISYPHUS_SYSTEM_PROMPT__'

/** Assembles the system prompt: the four sections, trimmed, blank-line joined. */
export function buildSisyphusSystemPrompt(
  sections: SystemSections = loadSystemSections(),
): string {
  const prompt = SISYPHUS_SECTION_ORDER.map((key) => sections[key].trimEnd()).join('\n\n')
  if (prompt.includes('{{')) {
    throw new Error(
      'omo-sisyphus system prompt contains a "{{" sequence: dsh renderPrompt '
      + 'would throw on the unknown prompt variable when a concerto session '
      + 'renders its persona — remove the sequence from system-sections/*.md',
    )
  }
  return prompt
}

/**
 * Replaces the template's persona sentinel with a `|-` block scalar (strip
 * chomping: the persona text is byte-exactly `prompt`) whose content lines
 * sit at the 6-space indent of the `config:` mapping. Empty prompt lines
 * stay truly empty — no trailing whitespace inside the scalar. Everything
 * outside the sentinel value is preserved byte-for-byte.
 */
export function renderPersonaIntoComposition(
  template: string,
  prompt: string = buildSisyphusSystemPrompt(),
): string {
  const sentinelValue = `prefix: ${PERSONA_TEXT_SENTINEL}`
  const occurrences = template.split(sentinelValue).length - 1
  if (occurrences !== 1) {
    throw new Error(
      `concerto template must carry the persona sentinel exactly once in a `
      + `\`prefix: ${PERSONA_TEXT_SENTINEL}\` value position; found ${occurrences}`,
    )
  }
  const block = prompt
    .split('\n')
    .map((line) => (line.length > 0 ? `      ${line}` : ''))
    .join('\n')
  return template.replace(sentinelValue, `prefix: |-\n${block}`)
}
