// explore-prompt.ts — T10 builder for the omo-explore subagent persona (FR-4).
// Assembles the explore persona from its markdown source in the fixed section
// order [explorePersona] — one section today, but the order is pinned so a
// future section slots in without an ordering debate; no hardcoded prompt
// strings here, the markdown file is the only source of prompt text.
//
// ARCHITECTURE DECISION (investigated, then chosen; citations verified
// read-only against the rc.7 source checkout, dsh 0.1.0-rc.6 runtime):
// explore is a SUBAGENT persona, not a run mode — so no agent-preset roster
// entry is authored (contrast with T6's concerto mode). A dsh-tool-subagent
// instance takes its per-child persona as INLINE TEXT:
//   * config field `persona?: string` — "Per-child persona that shadows
//     `deployment:persona-prefix` (renamed from `deployment:persona` at
//     dsh-v0.1.3-alpha.2; docs/dsh-0.1.5-rc.1-review.md §2). Requires the
//     provider's `persona` capability;
//     omission preserves the deployment persona."
//     (tool-subagent/src/index.ts:54-57; zod schema `persona: z.string()` at
//     index.ts:92)
//   * forwarded verbatim into the start request at tool-execute time
//     (tool-subagent/src/index.ts:384: `...config.persona !== undefined ?
//     { persona: config.persona } : {}`), on both the one-shot
//     (ctx.subagents.start) and continuable (startContinuable) paths;
//   * the spawn-in-process provider declares the capability
//     (subagent-spawn-in-process/src/index.ts:42: `{ outputSchema, depthLimit,
//     toolFilter, persona: true }`);
//   * applyChildComposition installs it as the child-scoped
//     `deployment:persona-prefix` system-prompt section at order 0, shadowing
//     the deployment persona (subagent/src/child-agent.ts:209-214 on
//     0.1.5-rc.1; :171-173 on rc.6 — both sides of the shadow moved together,
//     so the binding is unaffected; verified live, review §2.3).
// So the honest minimal shape is the T7/T8 chain reused: ONE markdown file in
// system-sections/ (loaded through the T7 loadSectionFile — same P-9-stable
// import.meta.url resolution) + THIS builder producing the string T11 binds
// as the instance's `persona` config value. A second markdown directory was
// rejected: one prompt-markdown home per plugin, and the T7 loader already
// resolves any file in it by name.
//
// T11 BINDING CONTRACT (zero open questions): T11 mounts one more
// dsh-tool-subagent instance (distinct `toolName`, e.g. `explore`) whose
// config carries `persona: <buildExploreSystemPrompt() output>`; the text
// flows config → start request (index.ts:384) → child-scoped
// `deployment:persona-prefix` section (child-agent.ts:209-214) → rendered by
// dsh-system-prompt's renderPrompt (core/system-prompt/src/index.ts:212-217),
// which interpolates strict `{{variable}}` references and THROWS on unknown
// ones — hence the `{{` rejection below, same hazard as the T8 sisyphus
// persona. Companion fields are other todos': `agentOptions` from
// resolveModelRoutes().explore (T14, already resolved), write-denying
// `toolFilter` (T12), depth cap (T13).
//
// COMPOSITION WITH T16 (FR-6): the hard-blocks injection listener owns the
// Hard Blocks + Anti-Patterns sections at RUNTIME for every sub-agent
// (agent.session.header.origin === 'subagent'), so this BASE persona must NOT
// carry them — the builder rejects both headings structurally, making
// duplication a build-time failure rather than a silent double-injection.
import { SYSTEM_SECTIONS_DIR, loadSectionFile } from './system-sections.ts'

/** The persona's markdown file inside the T7 sections directory. */
export const EXPLORE_PERSONA_FILE = 'explore-persona.md'

export interface ExploreSections {
  explorePersona: string
}

/** Fixed assembly order — the ONLY order the omo-explore prompt is built in. */
export const EXPLORE_SECTION_ORDER = [
  'explorePersona',
] as const satisfies readonly (keyof ExploreSections)[]

/**
 * Loads the explore persona section(s) through the T7 loader. Default dir:
 * the plugin-shipped system-sections/ (import.meta.url-resolved, P-9).
 */
export function loadExploreSections(dir: string = SYSTEM_SECTIONS_DIR): ExploreSections {
  return {
    explorePersona: loadSectionFile(dir, EXPLORE_PERSONA_FILE),
  }
}

/**
 * Assembles the omo-explore system prompt: the section(s), trimmed, blank-line
 * joined. Two structural guards, both load-bearing at the dsh layer:
 *  1. no `{{` sequences — the persona lands in a system-prompt section, and
 *     dsh renderPrompt throws on unknown prompt variables;
 *  2. no Hard Blocks / Anti-Patterns headings — T16's runtime injection owns
 *     those two sections for every sub-agent; a base-persona copy would
 *     double-deliver them (FR-6 composition boundary).
 */
export function buildExploreSystemPrompt(
  sections: ExploreSections = loadExploreSections(),
): string {
  const prompt = EXPLORE_SECTION_ORDER.map((key) => sections[key].trimEnd()).join('\n\n')
  if (prompt.includes('{{')) {
    throw new Error(
      'omo-explore persona contains a "{{" sequence: dsh renderPrompt '
      + 'would throw on the unknown prompt variable when the child agent '
      + 'renders its persona section — remove the sequence from '
      + `system-sections/${EXPLORE_PERSONA_FILE}`,
    )
  }
  for (const heading of ['## Hard Blocks', '## Anti-Patterns'] as const) {
    if (prompt.includes(heading)) {
      throw new Error(
        `omo-explore persona contains a "${heading}" section: the T16 `
        + 'hard-blocks injection listener delivers that section at runtime '
        + 'for every sub-agent — the base persona must not duplicate it '
        + `(remove it from system-sections/${EXPLORE_PERSONA_FILE})`,
      )
    }
  }
  return prompt
}
