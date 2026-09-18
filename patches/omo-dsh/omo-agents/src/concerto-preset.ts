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
// T11: the same sentinel discipline bound the first omo-explore
// dsh-tool-subagent instance (form A static config; row documented in the
// template) — its persona text (buildExploreSystemPrompt, T10) plus its
// agentOptions route (resolveModelRoutes, T14 — env-overridable, so it MUST be
// resolved here rather than pasted into YAML).
//
// P2-T15 (plan §4.4): that explore-only renderer generalizes to the FULL
// 11-agent roster. ONE roster-driven pipeline (`renderAgentSentinels`) walks
// `DELEGATION_ENTRIES` (roster.ts is the single source, in roster order) and
// renders three sentinel families per row:
//   persona      __OMO_<ID>_PERSONA__        ← buildAgentPersona(id)
//   agentOptions __OMO_<ID>_AGENT_OPTIONS__  ← resolveModelRoutes()[id]
//   deny         __OMO_<ID>_DENY__           ← denyToolNamesFor(roster row)
// The deny family exists only for the class rows that own a filter: the six
// read-only rows and the two worker rows (8 sentinels); atlas (orchestrator)
// deliberately carries NO toolFilter key, and multimodal-looker's
// `allow: [read, read_image]` is a short static YAML list with no sentinel
// (plan §4.4). The T8 conductor sentinel is still rendered by system-prompt.ts
// — it is a `prefix:` value, not a delegation-row key. Sentinel census: 1 + 10
// + 10 + 8 = 29.
//
// WHY A SENTINEL PER ROW RATHER THAN ONE SHARED STRING (plan §4.4 "deny 列表的
// 哨兵渲染"): `replaceSentinelOnce` refuses a sentinel that occurs zero or
// more-than-one times, and that guard is the R-7 protection against a
// forgotten or doubled render. A single shared deny sentinel across ten rows
// would trip its own guard; a statically pasted deny list would make adding an
// agent an eleven-line YAML edit. Per-row-unique sentinels keep both
// properties. Every route value and every deny name is emitted as a
// JSON.stringify-quoted scalar (`"deepseek"`) — a JSON string is a valid YAML
// double-quoted scalar under the loader's JSON_SCHEMA dialect, so an env
// override or a future hyphenated tool name can never inject YAML.
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSisyphusSystemPrompt, renderPersonaIntoComposition } from './system-prompt.ts'
import { buildAgentPersona } from './persona-prompts.ts'
import { DELEGATION_ENTRIES, denyToolNamesFor } from './roster.ts'
import type { AgentId } from './roster.ts'
import { resolveModelRoutes, type ModelRoute, type ModelRoutes } from './model-routes.ts'

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
  | 'refreshed' // target content diverged (rewritten) or stale extra entries were removed
  | 'unchanged' // target content already matches the template; no write

/** The three sentinel families a roster delegation row can carry. */
export type AgentSentinelKind = 'PERSONA' | 'AGENT_OPTIONS' | 'DENY'

/**
 * The sentinel name for one (`id`, family) pair, e.g.
 * `__OMO_PLAN_CONSULTANT_PERSONA__`. Uppercasing the id and folding hyphens to
 * underscores is the SAME convention roster.ts uses for the
 * `OMO_<AGENT>_{PROVIDER,MODEL}` env pairs, so the YAML sentinel, the env
 * override and the log marker all spell one agent the same way. Exported
 * because scripts/verify-concerto-static.mjs derives its c10 expectations from
 * this naming rather than restating the literal format (P2-T15).
 */
export function agentSentinelName(id: string, kind: AgentSentinelKind): string {
  return `__OMO_${id.toUpperCase().replaceAll('-', '_')}_${kind}__`
}

/** Persona sentinel of the explore tool-subagent row (kept for compatibility). */
export const EXPLORE_PERSONA_SENTINEL = agentSentinelName('explore', 'PERSONA')

/** agentOptions sentinel of the explore tool-subagent row (kept for compatibility). */
export const EXPLORE_AGENT_OPTIONS_SENTINEL = agentSentinelName('explore', 'AGENT_OPTIONS')

/**
 * Content indent of every delegation row's config values. The row itself sits
 * at 4 spaces inside the `delegation` group's config list, its `config:` keys
 * at 8, so a block scalar's content lines take 10 — the T8 renderer's rule
 * (6 spaces under the persona row's `prefix:`) with this row's depth.
 */
const AGENT_ROW_CONTENT_INDENT = '          '

/** Any surviving sentinel after a full render (the sync residue check). */
const SENTINEL_PATTERN = /__OMO_[A-Z0-9_]+__/g

/**
 * The guard shared by every sentinel replacement: the template must carry the
 * exact sentinel string exactly once. Zero occurrences means the template and
 * this renderer disagree about a row (a dropped row, a renamed sentinel);
 * two or more means the sentinel stopped being row-addressed. Both are loud
 * apply-time failures (R-7) instead of a half-rendered composition.
 */
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
 * Renders one roster agent's persona sentinel into a `|-` block scalar under
 * that row's `persona:` key. Empty prompt lines stay truly empty; everything
 * else is preserved byte-for-byte behind the row's 10-space indent.
 */
export function renderAgentPersonaIntoComposition(
  template: string,
  id: string,
  persona: string,
): string {
  const block = persona
    .split('\n')
    .map((line) => (line.length > 0 ? `${AGENT_ROW_CONTENT_INDENT}${line}` : ''))
    .join('\n')
  return replaceSentinelOnce(
    template,
    `persona: ${agentSentinelName(id, 'PERSONA')}`,
    `persona: |-\n${block}`,
  )
}

/**
 * Renders one roster agent's agentOptions sentinel into the two-key mapping the
 * schema expects (`provider` / `model`; `maxTokens` intentionally omitted — the
 * child-loop default applies). Values are JSON.stringify-quoted: a JSON string
 * is a valid YAML double-quoted scalar under the loader's JSON_SCHEMA dialect,
 * so env-supplied route values cannot inject YAML.
 */
export function renderAgentOptionsIntoComposition(
  template: string,
  id: string,
  route: ModelRoute,
): string {
  const mapping = `agentOptions:\n`
    + `${AGENT_ROW_CONTENT_INDENT}provider: ${JSON.stringify(route.provider)}\n`
    + `${AGENT_ROW_CONTENT_INDENT}model: ${JSON.stringify(route.model)}`
  return replaceSentinelOnce(
    template,
    `agentOptions: ${agentSentinelName(id, 'AGENT_OPTIONS')}`,
    mapping,
  )
}

/**
 * Renders one row's deny sentinel into a YAML flow sequence. Each name is
 * JSON.stringify-quoted for the same injection-safety reason as the route
 * values. An empty list is rejected outright: `deny: []` is both meaningless
 * (deny nothing) and a schema-level throw downstream, so it must never be the
 * silent result of a roster change (R-7).
 */
export function renderAgentDenyIntoComposition(
  template: string,
  id: string,
  denyNames: readonly string[],
): string {
  if (denyNames.length === 0) {
    throw new Error(
      `concerto renderer: roster row '${id}' resolved an EMPTY deny list — a filter that `
      + 'denies nothing is never intended; fix denyToolNamesFor in roster.ts',
    )
  }
  const sequence = `[${denyNames.map((name) => JSON.stringify(name)).join(', ')}]`
  return replaceSentinelOnce(
    template,
    `deny: ${agentSentinelName(id, 'DENY')}`,
    `deny: ${sequence}`,
  )
}

/** Thin explore-named wrappers over the roster-driven renderers (T11 API). */
export function renderExplorePersonaIntoComposition(template: string, persona: string): string {
  return renderAgentPersonaIntoComposition(template, 'explore', persona)
}

export function renderExploreAgentOptionsIntoComposition(template: string, route: ModelRoute): string {
  return renderAgentOptionsIntoComposition(template, 'explore', route)
}

/**
 * Test-injection surface of the roster pipeline. Both maps are optional and
 * PARTIAL: an unset id falls back to the single source (buildAgentPersona(id),
 * resolveModelRoutes()[id]), so a hermetic test can stub one row while the
 * others still render from reality.
 */
export interface AgentSentinelInputs {
  readonly personas?: Partial<Record<string, string>>
  readonly routes?: Partial<Record<string, ModelRoute>>
}

/**
 * The ONE roster-driven pipeline: for every delegation entry, in roster order,
 * replaces the row's persona, agentOptions and (when the class owns a filter)
 * deny sentinels. Ids come from roster.ts, so the template, the roster and the
 * rendered composition cannot drift apart silently: a template row missing a
 * sentinel fails the exactly-once guard, and an extra sentinel survives to the
 * sync's residue check.
 */
export function renderAgentSentinels(
  template: string,
  inputs: AgentSentinelInputs = {},
): string {
  let resolvedRoutes: ModelRoutes | undefined
  let rendered = template
  for (const entry of DELEGATION_ENTRIES) {
    const persona = inputs.personas?.[entry.id] ?? buildAgentPersona(entry.id)
    rendered = renderAgentPersonaIntoComposition(rendered, entry.id, persona)

    const route = inputs.routes?.[entry.id]
      // `RosterEntry.id` widens to string; every DELEGATION_ENTRIES row is a
      // roster id, so the index is a localized assertion (roster.ts owns the
      // union — cf. its DELEGATION_TOOL_NAMES derivation).
      ?? (resolvedRoutes ??= resolveModelRoutes())[entry.id as AgentId]
    rendered = renderAgentOptionsIntoComposition(rendered, entry.id, route)

    const denyNames = denyToolNamesFor(entry)
    if (denyNames !== undefined) {
      rendered = renderAgentDenyIntoComposition(rendered, entry.id, denyNames)
    }
  }
  return rendered
}

/** Test/consumer overrides for `syncConcertoPreset` (see AgentSentinelInputs). */
export type ConcertoRenderInputs = AgentSentinelInputs

/**
 * Writes the template into `targetDir`, idempotently: content-identical
 * targets are left untouched, divergent targets (e.g. a leftover from an
 * older plugin build) are rewritten to the template. A `concerto` directory
 * occupied by foreign content is still refreshed — the id is ours: this
 * plugin is the only author of the concerto mode, so entries in `targetDir`
 * outside CONCERTO_PRESET_FILES are stale leftovers from an older plugin
 * build and are removed on sight. The mode is re-applied to both files on
 * every sync even when the content is identical (a foreign editor or an
 * older sync may have loosened it), and the removal of a stale entry counts
 * as a change: the outcome is `refreshed`, not `unchanged`.
 *
 * `personaPrompt` is rendered into the conductor persona sentinel of the
 * template's agent.cordis.yml (T8); the default builds it from the shipped
 * markdown sections. `inputs` carries the P2-T15 per-agent overrides; their
 * defaults build from the same single sources the rest of the plugin uses
 * (persona-prompts.ts, model-routes.ts, roster.ts), so index.ts needs no new
 * wiring. Tests inject both to stay hermetic and sandboxed.
 *
 * @throws {Error} a sentinel did not occur exactly once, a deny list resolved
 *   empty, or any `__OMO_*__` marker survived the full render (residue check).
 */
export function syncConcertoPreset(
  targetDir: string,
  templateDir: string = CONCERTO_TEMPLATE_DIR,
  personaPrompt: string = buildSisyphusSystemPrompt(),
  inputs: ConcertoRenderInputs = {},
): ConcertoSyncOutcome {
  const expected = new Map<string, string>()
  for (const file of CONCERTO_PRESET_FILES) {
    const template = readFileSync(join(templateDir, file), 'utf8')
    if (file !== 'agent.cordis.yml') {
      expected.set(file, template)
      continue
    }
    const rendered = renderAgentSentinels(
      renderPersonaIntoComposition(template, personaPrompt),
      inputs,
    )
    const residue = rendered.match(SENTINEL_PATTERN)
    if (residue !== null) {
      throw new Error(
        `concerto template rendered with surviving sentinel residue: `
        + `${[...new Set(residue)].join(', ')} — every __OMO_*__ marker must be `
        + 'consumed by the roster pipeline (a template row without a roster entry, '
        + 'or a roster row without a template sentinel)',
      )
    }
    expected.set(file, rendered)
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
  let staleRemoved = false
  if (existed) {
    const stale = readdirSync(targetDir).filter(
      (entry) => !(CONCERTO_PRESET_FILES as readonly string[]).includes(entry),
    )
    for (const entry of stale) {
      rmSync(join(targetDir, entry), { recursive: true, force: true })
      staleRemoved = true
    }
  }
  if (identical) {
    for (const file of CONCERTO_PRESET_FILES) {
      chmodSync(join(targetDir, file), 0o600)
    }
    return staleRemoved ? 'refreshed' : 'unchanged'
  }
  mkdirSync(targetDir, { recursive: true })
  for (const file of CONCERTO_PRESET_FILES) {
    writeFileSync(join(targetDir, file), expected.get(file)!, {
      encoding: 'utf8',
      mode: 0o600,
    })
  }
  return existed ? 'refreshed' : 'materialized'
}
