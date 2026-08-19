// concerto-preset.ts — T6 apply-time authoring for the 协奏 / Concerto Mode
// preset (FR-2, AC-2). The plugin ships the real preset directory beside its
// source (`../concerto/`, resolved from this module's own import.meta.url —
// the same discipline as system-sections.ts, P-9) and materializes it into
// `$DSH_HOME/.agent-presets/concerto/`, the user root that dsh-agent-presets
// auto-appends (includeUserRoot defaults to true; discovery is unmemoized, so
// a fresh listing sees the preset immediately). Files are the only
// composition editor, so direct authoring of the directory is legitimate —
// and necessary: mechanism (a), a config-override adding our repo dir to the
// agent-presets row's `roots`, is dead on rc.6 because composeProfile
// force-patches `roots` back to the shipped system root after all user
// overlays (profile-boot; evidence: .omo/evidence/task-6-mvp-implementation.log
// and docs/mvp-pitfalls.md P-1.3).
//
// T8: the sync is no longer a pure byte-copy for agent.cordis.yml — the
// template keeps a persona sentinel and this module renders it into the
// assembled omo-sisyphus system prompt at apply() time (design (a), see
// system-prompt.ts). preset.yml is still copied verbatim. Rendering is a
// pure function of the markdown sections, so idempotence is unchanged.
//
// T11: the same sentinel discipline binds the omo-explore dsh-tool-subagent
// instance (form A static config; row documented in the template). Two more
// sentinels are rendered at apply() time: the explore persona text (from
// buildExploreSystemPrompt, T10) and the explore agentOptions route (from
// resolveModelRoutes, T14 — env-overridable, so it MUST be resolved here
// rather than pasted into YAML). Both renderers keep the T8 exactly-once
// sentinel guard, and route values are emitted as JSON-quoted YAML scalars
// so an env override can never break the composition's YAML.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSisyphusSystemPrompt, renderPersonaIntoComposition } from './system-prompt.ts'
import { buildExploreSystemPrompt } from './explore-prompt.ts'
import { resolveModelRoutes, type ModelRoute } from './model-routes.ts'

/** The preset's roster id, which is also its directory name. */
export const CONCERTO_PRESET_ID = 'concerto'

/** The two files dsh-agent-presets reads per preset directory. */
export const CONCERTO_PRESET_FILES = ['preset.yml', 'agent.cordis.yml'] as const

/** Absolute path of the repo-shipped concerto template directory. */
export const CONCERTO_TEMPLATE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'concerto',
)

/**
 * Mirrors @deepseek-ai/dsh-home-paths' resolveDshHome (read-only inspection of
 * the installed rc.6): a non-empty `$DSH_HOME` wins, else `<osHome>/.dsh`.
 * Reimplemented in five lines so this plugin keeps zero runtime dependencies.
 */
export function resolveDshHome(
  env: { DSH_HOME?: string | undefined } = process.env,
  osHome: string = homedir(),
): string {
  const fromEnv = env.DSH_HOME
  return resolve(fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(osHome, '.dsh'))
}

/** The user-root directory this preset materializes into. */
export function concertoPresetDir(
  env: { DSH_HOME?: string | undefined } = process.env,
  osHome: string = homedir(),
): string {
  return join(resolveDshHome(env, osHome), '.agent-presets', CONCERTO_PRESET_ID)
}

export type ConcertoSyncOutcome =
  | 'materialized' // target did not exist; the preset was written
  | 'refreshed' // target existed with different content; rewritten to the template
  | 'unchanged' // target content already matches the template; no write

/** Persona sentinel of the T11 explore tool-subagent row (see the template). */
export const EXPLORE_PERSONA_SENTINEL = '__OMO_EXPLORE_PERSONA__'

/** agentOptions sentinel of the T11 explore tool-subagent row. */
export const EXPLORE_AGENT_OPTIONS_SENTINEL = '__OMO_EXPLORE_AGENT_OPTIONS__'

function replaceSentinelOnce(template: string, sentinel: string, replacement: string): string {
  const occurrences = template.split(sentinel).length - 1
  if (occurrences !== 1) {
    throw new Error(
      `concerto template must carry the sentinel ${sentinel} exactly once; `
      + `found ${occurrences}`,
    )
  }
  return template.replace(sentinel, replacement)
}

/**
 * Renders the explore persona sentinel into a `|-` block scalar under the
 * explore row's `persona:` key. That key sits at 8-space indent (the row is
 * nested in the delegation group's config list), so content lines take 10 —
 * the T8 renderer's rule with the row's indent. Empty prompt lines stay
 * truly empty; everything else is preserved byte-for-byte.
 */
export function renderExplorePersonaIntoComposition(template: string, persona: string): string {
  const block = persona
    .split('\n')
    .map((line) => (line.length > 0 ? `          ${line}` : ''))
    .join('\n')
  return replaceSentinelOnce(
    template,
    `persona: ${EXPLORE_PERSONA_SENTINEL}`,
    `persona: |-\n${block}`,
  )
}

/**
 * Renders the agentOptions sentinel into the two-key mapping the schema
 * expects (`provider` / `model`; `maxTokens` intentionally omitted — the
 * child-loop default applies). Values are JSON.stringify-quoted: a JSON
 * string is a valid YAML double-quoted scalar under the loader's
 * JSON_SCHEMA dialect, so env-supplied route values cannot inject YAML.
 */
export function renderExploreAgentOptionsIntoComposition(template: string, route: ModelRoute): string {
  const mapping = `agentOptions:\n`
    + `          provider: ${JSON.stringify(route.provider)}\n`
    + `          model: ${JSON.stringify(route.model)}`
  return replaceSentinelOnce(
    template,
    `agentOptions: ${EXPLORE_AGENT_OPTIONS_SENTINEL}`,
    mapping,
  )
}

/**
 * Writes the template into `targetDir`, idempotently: content-identical
 * targets are left untouched, divergent targets (e.g. a leftover from an
 * older plugin build) are rewritten to the template. A `concerto` directory
 * occupied by foreign content is still refreshed — the id is ours: this
 * plugin is the only author of the concerto mode.
 *
 * `personaPrompt` is rendered into the persona sentinel of the template's
 * agent.cordis.yml (T8); the default builds it from the shipped markdown
 * sections, and tests inject their own to stay hermetic. T11 adds
 * `explorePersona` / `exploreRoute`, rendered into the explore tool-subagent
 * row's sentinels; the defaults build from the same single sources
 * (explore-prompt.ts, model-routes.ts) the rest of the plugin uses, so
 * index.ts needs no new wiring.
 */
export function syncConcertoPreset(
  targetDir: string,
  templateDir: string = CONCERTO_TEMPLATE_DIR,
  personaPrompt: string = buildSisyphusSystemPrompt(),
  explorePersona: string = buildExploreSystemPrompt(),
  exploreRoute: ModelRoute = resolveModelRoutes().explore,
): ConcertoSyncOutcome {
  const expected = new Map<string, string>()
  for (const file of CONCERTO_PRESET_FILES) {
    const template = readFileSync(join(templateDir, file), 'utf8')
    expected.set(
      file,
      file === 'agent.cordis.yml'
        ? renderExploreAgentOptionsIntoComposition(
          renderExplorePersonaIntoComposition(
            renderPersonaIntoComposition(template, personaPrompt),
            explorePersona,
          ),
          exploreRoute,
        )
        : template,
    )
  }
  const existed = existsSync(targetDir)
  let identical = existed
  for (const file of CONCERTO_PRESET_FILES) {
    let actual: string | undefined
    try {
      actual = readFileSync(join(targetDir, file), 'utf8')
    } catch {
      actual = undefined
    }
    if (actual !== expected.get(file)) identical = false
  }
  if (identical) return 'unchanged'
  mkdirSync(targetDir, { recursive: true })
  for (const file of CONCERTO_PRESET_FILES) {
    writeFileSync(join(targetDir, file), expected.get(file)!, {
      encoding: 'utf8',
      mode: 0o600,
    })
  }
  return existed ? 'refreshed' : 'materialized'
}
