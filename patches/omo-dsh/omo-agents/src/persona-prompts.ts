// persona-prompts.ts — P2-T4 ROSTER-DRIVEN general persona builder for every
// delegation agent (docs/plans/phase2-dev/phase2-plan.md §4.2 single source of
// truth + §4.3 persona porting discipline; task P2-T4). `buildAgentPersona(id)`
// looks the id up in roster.ts, loads the file the ROSTER names through the T7
// loader (system-sections.ts — same P-9-stable import.meta.url resolution),
// trims it, and applies the two structural guards. No prompt text and no file
// map lives here: the markdown file is the only source of prompt text and
// roster.ts is the only file map.
//
// WHY GENERALIZE (plan §4.2). The pre-Phase-2 shape had one hand-written
// builder per persona (explore-prompt.ts) plus an explore-only sentinel
// renderer in concerto-preset.ts. Scaling to the 11-agent roster would have
// reproduced that per-agent hardcoding ten times; after this module the 10
// delegation personas share ONE builder, and the T5–T13 tasks contribute
// markdown + a snapshot, never a new code path. explore-prompt.ts remains only
// as a thin wrapper preserving its exact public API, so index.ts and
// concerto-preset.ts need no changes (P2-T4 acceptance).
//
// ZERO-DRIFT PROOF (P2-T4 / phase2-tasks.md P2-T4 判定). buildAgentPersona
// ('explore') must reproduce buildExploreSystemPrompt() byte-for-byte, and the
// existing `matches the checked-in snapshot` test
// (tests/omo-agents/explore-prompt.test.ts → __snapshots__/explore-system-prompt.md)
// must pass unmodified. The wrapper delegates here; it does not re-implement
// the assembly.
//
// THE TWO STRUCTURAL GUARDS are the T16 composition boundary (FR-6, plan §4.3
// discipline 3 + discipline 4), inherited verbatim from the T10 explore
// builder:
//   a. no `{{` sequence — the persona lands in a system-prompt section, and
//      dsh-system-prompt's renderPrompt interpolates strict `{{variable}}`
//      references and THROWS on unknown ones (explore-prompt.ts carries the
//      full citation chain: tool-subagent/src/index.ts:92,384 →
//      subagent/src/child-agent.ts:209-214 → core/system-prompt/src/index.ts:212-217).
//   b. no `## Hard Blocks` / `## Anti-Patterns` heading — the T16
//      hard-blocks injection listener (hard-blocks-injection.ts) owns both
//      sections at RUNTIME for every sub-agent (origin === 'subagent'), so a
//      base persona that restates them double-delivers them. Rejecting here
//      makes duplication a build-time failure instead of a silent double
//      injection.
// Both guards are enforced for every id, so the discipline cannot be forgotten
// by one of the nine T5–T13 translations.
//
// ============================================================================
// PORTING RECIPE (P2-T4) — quoted verbatim into the P2-T5…T13 delegation
// prompts. Points 1–5 and 7 are authoring discipline; point 6's naming is
// pinned by what the builder loads (roster.ts `personaFile`) and by the
// snapshot path each task signs in. Where a point is mechanically enforceable
// the builder enforces it (guards a/b above); everything else is stated here
// because no checker can read a translator's intent.
//
//   1. Upstream prompt text comes ONLY from the frozen tag, read as
//      `git show v4.19.4:<path>` (commit
//      b072d279110bdda2c6ac2525d0d24dc54d16148a; ROADMAP §2 rule 1 / D14;
//      plan §2). NEVER copy from the working tree: the local OMO checkout's
//      HEAD is not on that tag.
//   2. Semantic condensation, not full-text 搬运: keep the three essentials —
//      role identity / binding declarations / output contract — and compress
//      the rest. explore precedent: ~80 upstream lines → 46. Long personas ×
//      10 tool descriptions raise the per-step prompt cost of every delegation
//      (plan §4.3 discipline 5).
//   3. Rewrite harness-specific references: `apply_patch` → no such DSH tool
//      (write-class refusals generalize to `write`/`edit`); `task` /
//      `call_omo_agent` → delegation-absence semantics (the child physically
//      lacks the delegation tools — plan §4.4 F1); opencode UI/Tab concepts →
//      delete or rewrite.
//   4. Per-file HTML-comment attribution header naming EVERY upstream source
//      file at its tag path, plus a "Semantic translation only" declaration
//      (explore precedent lists three sources; plan §4.3 discipline 2 / §4.9).
//   5. No `{{` sequence anywhere in the persona text (guard a; plan §4.3
//      discipline 3).
//   6. Naming double-convention (repo precedent, plan §4.3 discipline 4 — do
//      NOT invent a third): persona source
//      `system-sections/<id>-persona.md` (cf. explore-persona.md) and checked-in
//      snapshot `tests/omo-agents/__snapshots__/<id>-system-prompt.md` (cf.
//      explore-system-prompt.md / sisyphus-system-prompt.md).
//   7. Hard Blocks / Anti-Patterns non-duplication: the T16 runtime injection
//      owns both headings for every sub-agent (origin === 'subagent'), so a
//      base persona must not restate them (guard b; plan §4.3 discipline 4 /
//      FR-6).
// ============================================================================

import {
  ALL_AGENT_IDS,
  CONDUCTOR_ID,
  ROSTER,
} from './roster.ts'
import { SYSTEM_SECTIONS_DIR, loadSectionFile } from './system-sections.ts'

/**
 * The two headings the T16 hard-blocks injection listener delivers at runtime
 * for every sub-agent. A base persona carrying either one is rejected — see
 * the composition-boundary note in the file header.
 */
export const RUNTIME_INJECTED_HEADINGS = ['## Hard Blocks', '## Anti-Patterns'] as const

/**
 * Loud failure for an id that is not a roster row at all (typo / stale caller).
 * Named so a boot log or test can branch on `err.name` without parsing prose.
 */
export class UnknownAgentPersonaError extends Error {
  constructor(id: string) {
    super(
      `persona-prompts: unknown agent id '${id}' — not a roster row. Known ids: `
      + `${ALL_AGENT_IDS.join(', ')}. Personas are built only for roster entries.`,
    )
    this.name = 'UnknownAgentPersonaError'
  }
}

/**
 * Loud failure for the conductor row. sisyphus is deliberately NOT a persona
 * markdown file: its prompt is assembled from SISYPHUS_SECTION_ORDER in
 * system-prompt.ts (four T7 sections), so asking this builder for it is a
 * caller bug, named rather than answered with an empty string.
 */
export class ConductorPersonaError extends Error {
  constructor(id: string) {
    super(
      `persona-prompts: roster row '${id}' is the conductor and declares no `
      + 'personaFile — the omo-sisyphus prompt is the separate '
      + 'SISYPHUS_SECTION_ORDER path in system-prompt.ts, never buildAgentPersona.',
    )
    this.name = 'ConductorPersonaError'
  }
}

/**
 * Resolves the persona markdown file name for a roster id — the ONLY file map
 * in the codebase (roster.ts). Throws `UnknownAgentPersonaError` for an id
 * outside the roster and `ConductorPersonaError` for the conductor row.
 */
export function personaFileFor(id: string): string {
  const entry = ROSTER.find((candidate) => candidate.id === id)
  if (entry === undefined) throw new UnknownAgentPersonaError(id)
  if (entry.id === CONDUCTOR_ID || !entry.delegation) throw new ConductorPersonaError(id)
  if (entry.personaFile === undefined) {
    throw new Error(
      `persona-prompts: roster delegation row '${id}' declares no personaFile — `
      + 'every dsh-tool-subagent target must name its persona markdown file (plan §4.2)',
    )
  }
  return entry.personaFile
}

/**
 * Loads one roster agent's persona markdown through the T7 loader. Default
 * dir: the plugin-shipped system-sections/ (import.meta.url-resolved, P-9);
 * tests inject a temp dir to instrument section content.
 */
export function loadAgentPersonaText(
  id: string,
  dir: string = SYSTEM_SECTIONS_DIR,
): string {
  return loadSectionFile(dir, personaFileFor(id))
}

/**
 * Applies the two structural guards to already-loaded persona text and returns
 * it trimmed. Split out so a thin wrapper (explore-prompt.ts) that already
 * holds the text still resolves its file name — and therefore its error
 * message — from the roster rather than restating it.
 */
export function buildAgentPersonaFromText(id: string, personaText: string): string {
  return guardPersonaText(id, personaFileFor(id), personaText)
}

/**
 * The general builder: roster id → roster `personaFile` → T7 load → trim →
 * guards. This is the one entry point the T5–T13 personas are consumed
 * through.
 *
 * @throws {UnknownAgentPersonaError} the id is not a roster row.
 * @throws {ConductorPersonaError} the id is the conductor (no persona file).
 * @throws {Error} the persona text smuggles `{{` or a runtime-injected heading,
 *   or the roster file is unreadable (named absolute path from loadSectionFile).
 */
export function buildAgentPersona(id: string, dir: string = SYSTEM_SECTIONS_DIR): string {
  const personaFile = personaFileFor(id)
  return guardPersonaText(id, personaFile, loadSectionFile(dir, personaFile))
}

/**
 * Guard (a) `{{` rejection + guard (b) runtime-injected-heading rejection,
 * over the trimmed prompt. Message text keeps the pre-refactor explore
 * wording (id and file named) so the T10 tests' `toThrow(/Hard Blocks/)` /
 * `/Anti-Patterns/` / `/\{\{/` assertions stay meaningful unmodified.
 */
function guardPersonaText(id: string, personaFile: string, personaText: string): string {
  const prompt = personaText.trimEnd()
  if (prompt.includes('{{')) {
    throw new Error(
      `omo-${id} persona contains a "{{" sequence: dsh renderPrompt would throw `
      + 'on the unknown prompt variable when the child agent renders its persona '
      + `section — remove the sequence from system-sections/${personaFile}`,
    )
  }
  for (const heading of RUNTIME_INJECTED_HEADINGS) {
    if (prompt.includes(heading)) {
      throw new Error(
        `omo-${id} persona contains a "${heading}" section: the T16 hard-blocks `
        + 'injection listener delivers that section at runtime for every sub-agent '
        + '— the base persona must not duplicate it '
        + `(remove it from system-sections/${personaFile})`,
      )
    }
  }
  return prompt
}
