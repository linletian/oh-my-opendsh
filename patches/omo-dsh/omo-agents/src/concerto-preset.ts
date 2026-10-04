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
//
// P4.5-T5 (plan §4.3): this module gained the 0.2.x REGISTRATION OUTLET next
// to the materialization contract it already owned.
//   * `renderConcertoComposition()` is the PURE render of agent.cordis.yml —
//     the sentinel pipeline and the residue gate moved into it byte-for-byte
//     (zero format change; the 29-sentinel census above still holds), and
//     `syncConcertoPreset` now reuses it so the two outlets can never render
//     two different compositions (DRY). The write contract is KEPT verbatim:
//     scripts/doctor-lite.mjs:602 calls `syncConcertoPreset(temp)` and reads
//     the file it writes (gate 4's input face), so "stop writing" was never
//     an option (plan §4.3, review R1-B4).
//   * `registerConcertoPreset()` is the registration outlet the plugin calls
//     from INSIDE its `ctx.inject(['agentPresets'])` callback — the only
//     call site where the handle is measurably present (T1 Q-4: apply()'s
//     synchronous stretch 100% gets `undefined`, the inject callback 100%
//     gets the service; NO wait/retry/backoff is designed around it).
//   * The YAML parse path is ZERO new npm dependency (plan §4.3, T1 Q-2
//     arbitration 2026-10-04): the composition text is parsed with the
//     INSTALLED dsh's own js-yaml in the loader's exact dialect
//     (JSON_SCHEMA + the fully-qualified `tag:yaml.org,2002:js` type — the
//     short `!js` form is a hard `unknown tag` failure). The helper trio
//     below (`resolveDshNodeModules` / `imp` / `makeJsExprType`) is SAME-
//     SOURCE with scripts/doctor-lite.mjs:105-137, :140, :148-154 — copied
//     deliberately into the plugin runtime face because scripts/ is repo
//     tooling, not a plugin runtime surface (tests may import it; the plugin
//     may not). `resolveDshNodeModules` is restructured into two stages
//     (argv[1] first, PATH fallback) per the T5 implementation review — the
//     plugin runs INSIDE dsh and has a better signal than PATH lookup. KNOWN RISK, registered honestly (plan §4.9 / Q-2 §6(b)):
//     reaching into somebody else's node_modules at a pinned file layout is
//     FRAGILE COUPLING — if dsh repackages js-yaml away from
//     `js-yaml/dist/js-yaml.mjs`, this resolves to NO_PARSER. The
//     loud-but-non-fatal discipline below is what makes that failure mode
//     visible instead of silent.
//   * "Registered" is PROVEN by READBACK, not by a non-throwing register():
//     register() rejects ONLY empty/duplicate ids; every mount failure lands
//     in the roster's `broken` field and the host's logger.warn was NOT in
//     the captured stdout/stderr stream (T1 Q-3 §2.4, bounded). So
//     omo-agents reads the roster back itself and prints the verdict —
//     `… registered: id=concerto broken=absent` on success,
//     `concerto preset register FAILED: <reason>` otherwise (that FAILED
//     form is already inside the probe's negative grep,
//     scripts/concerto-mode-probe.sh:939). The first roster read may be
//     EMPTY (T1 Q-3 §1.4) — the readback re-reads once before judging.
//   * The disposer register() returns (arity 0, named `unregister`,
//     idempotent — T1 Q-3 §3.4) is held in a module-level slot AND returned
//     from the inject callback: cordis collects a plugin callback's resolved
//     return value as the child fiber's disposal (`effect.then(safeCollect)`,
//     vendor/cordis/src/fiber.ts:373-374 @ dsh-v0.2.0-rc.2; same mechanism
//     background-notification.ts documents at its :1040-1044), so the
//     registration is fiber-reversible with NO once guard of ours.
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { describeError } from './boot-markers.ts'
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
 * P4.5-T5: the PURE render outlet — reads the shipped template and returns the
 * RENDERED `agent.cordis.yml` text without touching the filesystem beyond that
 * one read. `syncConcertoPreset` is now a thin writer over this function (the
 * composition bytes the two outlets produce are the SAME call's semantics, not
 * a restatement), and the 0.2.x registration outlet feeds its output straight
 * into the loader-dialect parse below.
 *
 * The sentinel pipeline and the residue guard are the pre-T5 code moved
 * VERBATIM — same order (persona first, then the roster pipeline), same
 * `SENTINEL_PATTERN`, same error text — so the 29-sentinel census above and
 * every existing pin in tests/omo-agents/concerto-preset.test.ts hold without
 * edit.
 *
 * ⚠️ THIS RETURNS THE RENDERED YAML TEXT — byte-identical to what
 * `syncConcertoPreset` writes to `agent.cordis.yml`. It is NOT the
 * `agentPresets/read` document `content`: that one is a `yaml.dump()` of the
 * PARSED object (agent-preset-registry/src/index.ts:200-205 @
 * dsh-v0.2.0-rc.2), whose text form differs — flow sequences expand to block
 * sequences, redundant quotes drop, and a real `!!js` tag becomes a two-line
 * `__jsExpr` map. The two forms are NOT interchangeable as assertion inputs
 * (.omo/evidence/p45t5/ARBITRATION-primary-source-verification.md §6); the
 * P4.5-T6 `read`-face anchors must be derived from the dump form, never
 * copy-pasted from this text's anchors.
 *
 * @param personaPrompt rendered into the conductor persona sentinel (T8).
 * @param inputs the P2-T15 per-agent overrides; defaults build from the same
 *   single sources the rest of the plugin uses.
 * @throws {Error} a sentinel did not occur exactly once, a deny list resolved
 *   empty, or any `__OMO_*__` marker survived the render (residue check).
 */
export function renderConcertoComposition(
  templateDir: string = CONCERTO_TEMPLATE_DIR,
  personaPrompt: string = buildSisyphusSystemPrompt(),
  inputs: ConcertoRenderInputs = {},
): string {
  const template = readFileSync(join(templateDir, 'agent.cordis.yml'), 'utf8')
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
  return rendered
}

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
    if (file !== 'agent.cordis.yml') {
      expected.set(file, readFileSync(join(templateDir, file), 'utf8'))
      continue
    }
    // P4.5-T5: the SAME pure outlet the registration path uses — one render
    // implementation, two carriers. Comparison/write/chmod/stale semantics
    // below are unchanged (gate 4's doctor-lite.mjs:602 contract).
    expected.set(file, renderConcertoComposition(templateDir, personaPrompt, inputs))
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

// ═══════════════════ P4.5-T5 · THE 0.2.x REGISTRATION OUTLET ═══════════════════
//
// Surface map (every claim cites its measurement; plan §4.3 仲裁修订 ①②③④):
//   * PROBE      `hasAgentPresetsRegisterFace` — a CAPABILITY probe on the
//                injected `agentPresets` handle (`typeof register ===
//                'function'`). It is NOT the shared `dshRuntimeShape()`
//                identity marker (omo-hooks/src/dsh-runtime-shape.ts): that
//                one answers "whose jobs package is this" and its own header
//                forbids reusing it as a capability probe for another surface;
//                the preset-registry face is exactly such a new surface
//                (plan §4.1 探针表注记). It lives HERE, next to its one
//                consumer, until a second consumer exists.
//   * PARSE      `parseCompositionInLoaderDialect` — the installed dsh's own
//                js-yaml, JSON_SCHEMA + the fully-qualified `!!js` Type; the
//                error contract (NO_PARSER / PARSE codes) mirrors
//                scripts/doctor-lite.mjs:163-187 verbatim-in-kind.
//   * GUARD      `compositionStringDisabledProblem` — plan §4.3 discipline:
//                a `disabled` that PARSED as a bare string means the YAML
//                carried the quoted `"!!js …"` form, which the loader mounts
//                silently DISABLED (Boolean of a truthy string, vendor/loader/
//                src/config/entry.ts:89-93 @ dsh-v0.2.0-rc.2) with NO
//                register() rejection and NO `broken` entry — entryListProblem
//                does NOT look at `disabled` at all (definition.ts:18-39,
//                T1 Q-3 §4.4). Zero cost here, so the guard is unconditional.
//   * READBACK   inside `registerConcertoPreset` — "registered" means the
//                roster entry exists with `broken` ABSENT (absent is the
//                normal form, source `...(broken === undefined ? {} : { broken })`,
//                agent-preset-registry/src/index.ts:161 @ dsh-v0.2.0-rc.2 —
//                so assert absence, never a value). The FIRST read may be
//                empty (T1 Q-3 §1.4: inject-firing `list()` = [], populated
//                one microtask later, two boots consistent) — so one settle
//                re-read happens before any verdict, and the marker text
//                carries the id (never a prefix-only grep surface).
//   * DISPOSER   held in `heldConcertoDisposer` AND returned to the caller,
//                which hands it back to cordis from the inject callback
//                (fiber.ts:373-374 collects the resolved return as the child
//                fiber's disposal). Idempotent, arity 0, named `unregister`
//                (T1 Q-3 §2.3/§3.4) — no once guard added here.

/** promisify wrapper for the read-only `command -v dsh` lookup (no shell state). */
const execFileAsync = promisify(execFile)

/**
 * SAME-SOURCE with scripts/doctor-lite.mjs:105-137 (read that doc block for
 * the full contract), RESTRUCTURED into two stages (implementation review
 * 2026-10-04): this helper runs INSIDE the dsh process, where `argv[1]` is
 * the dsh entry script — the authoritative path, no child process needed.
 *   Stage 1: realpath(process.argv[1]) → walk up ≤8 levels.
 *   Stage 2 (only if stage 1 misses): the doctor-lite PATH shape —
 *            `command -v dsh` → realpath → walk up ≤8 levels.
 * First hit returns; the PATH spawn does NOT run when stage 1 resolves.
 * Both stages demand the SAME two read-only markers as doctor-lite's probe
 * (:127-128): dsh-tool-subagent/lib/index.js AND js-yaml/dist/js-yaml.mjs.
 * WHY the argv-first order: `command -v dsh` answers empty when dsh runs
 * outside PATH (desktop/packaged launches, absolute-path starts) — as a
 * repo-side script doctor-lite can live with PATH, but a plugin mounted
 * inside dsh has a strictly better signal available for free.
 *
 * FRAGILE COUPLING, REGISTERED (plan §4.9, Q-2 §6(b)): both stages pin the
 * installed dsh's INTERNAL packaging layout. A dsh release that moves
 * js-yaml off that path turns this into null → NO_PARSER below — a loud
 * gate/boot failure, not a silent one. The phase accepts that trade against
 * adding an npm dependency it has already proven it does not need.
 */
async function resolveDshNodeModules(): Promise<string | null> {
  // The shared ≤8-level upward walk from a starting directory (both stages).
  const walkUp = (startDir: string): string | null => {
    let dir = startDir
    for (let i = 0; i < 8; i++) {
      const candidate = join(dir, 'node_modules')
      if (
        existsSync(join(candidate, '@deepseek-ai', 'dsh-tool-subagent', 'lib', 'index.js'))
        && existsSync(join(candidate, 'js-yaml', 'dist', 'js-yaml.mjs'))
      ) {
        return candidate
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  }
  const real = (p: string): string => {
    try {
      return realpathSync(p)
    } catch {
      return p
    }
  }
  // Stage 1 — the in-process authority: argv[1] is the dsh entry script
  // itself (or, outside dsh — e.g. vitest workers — a path that simply
  // misses here and falls through to stage 2).
  if (typeof process.argv[1] === 'string' && process.argv[1].length > 0) {
    const fromArgv = walkUp(dirname(real(process.argv[1])))
    if (fromArgv !== null) return fromArgv
  }
  // Stage 2 — the doctor-lite PATH fallback (spawn only when stage 1 missed).
  let binPath
  try {
    const { stdout } = await execFileAsync('sh', ['-c', 'command -v dsh'], {
      timeout: 15000,
      encoding: 'utf8',
    })
    binPath = stdout.trim().split('\n')[0]
  } catch {
    return null
  }
  if (binPath === '') return null
  return walkUp(dirname(real(binPath)))
}

/** Dynamic import from the installed dsh's node_modules (doctor-lite.mjs:140 same-source). */
const imp = (nm: string, specifier: string): Promise<any> =>
  import(pathToFileURL(join(nm, specifier)).href)

/**
 * The `!!js` scalar Type dsh's patch loader registers — SAME-SOURCE with
 * scripts/doctor-lite.mjs:148-154. The tag is the FULLY-QUALIFIED
 * `tag:yaml.org,2002:js`; the short `!js` form THROWS `unknown tag !<!js>`
 * (measured, Q-2 §4.1), and a quoted `"!!js …"` string parses to a plain
 * string that the loader then reads as a truthy constant — hence the guard.
 */
function makeJsExprType(yaml: any): any {
  return new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    resolve: (data: string) => typeof data === 'string',
    construct: (data: string) => ({ __jsExpr: data }),
  })
}

/**
 * Parses YAML TEXT (not a path — the registration outlet parses the in-memory
 * render) in the exact dialect dsh loads patch/preset files with (JSON_SCHEMA
 * + `!!js`). Error contract mirrors scripts/doctor-lite.mjs:163-187:
 * `code === 'NO_PARSER'` when the installed dsh/parser is unreachable,
 * `code === 'PARSE'` on a YAML syntax error.
 */
export async function parseCompositionInLoaderDialect(text: string): Promise<unknown> {
  const nm = await resolveDshNodeModules()
  if (nm === null) {
    const error = new Error('installed dsh not found')
    ;(error as Error & { code?: string }).code = 'NO_PARSER'
    throw error
  }
  let yaml: any
  try {
    yaml = (await imp(nm, 'js-yaml/dist/js-yaml.mjs')).default
  } catch (cause) {
    const error = new Error(`js-yaml import from the installed dsh failed: ${(cause as Error).message}`)
    ;(error as Error & { code?: string }).code = 'NO_PARSER'
    throw error
  }
  try {
    return yaml.load(text, {
      schema: yaml.JSON_SCHEMA.extend(makeJsExprType(yaml)),
    })
  } catch (cause) {
    const error = new Error(String((cause as Error).message ?? cause))
    ;(error as Error & { code?: string }).code = 'PARSE'
    throw error
  }
}

/**
 * Capability probe, NOT an identity marker (surface map above). Answers only
 * "can this handle register presets?" — 0.1.5's agent-presets service says no
 * (no `register` member), 0.2.x's agent-preset-registry says yes. A
 * non-object always answers false: the honest reading of "no object" is "no
 * register face".
 */
export function hasAgentPresetsRegisterFace(agentPresets: unknown): boolean {
  if (typeof agentPresets !== 'object' || agentPresets === null) return false
  return typeof (agentPresets as { register?: unknown }).register === 'function'
}

/** One parsed composition row (loose — js-yaml returns data, guards narrow it). */
export type CompositionRow = { [key: string]: unknown }

/** What `register()` resolves to: the unregister disposer (registry :80, :87-96). */
export type PresetDisposer = () => Promise<void>

/** The 0.2.x `PresetDefinition` shape this outlet builds (definition.ts:5-11). */
export interface ConcertoPresetDefinition {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly order?: number
  readonly plugins: readonly CompositionRow[]
}

/** The minimal structural shape of a roster row the readback consumes. */
export interface RosterRowLike {
  id?: string
  name?: string
  description?: string
  order?: number
  broken?: string
}

/** The structural agentPresets surface the outlet consumes (no dsh types). */
export interface AgentPresetsRegisterLike {
  register(definition: ConcertoPresetDefinition): Promise<PresetDisposer>
  list(): Promise<RosterRowLike[]>
}

/**
 * The `disabled`-carrier guard (plan §4.3 discipline, Q-3 §4.3/§4.4): walks
 * every row INCLUDING nested `group: true` configs and returns the label of
 * the first row whose parsed `disabled` is a bare string. A string there is
 * never legitimate — real `!!js` parses to `{ __jsExpr }`, a plain boolean is
 * a boolean — it means the YAML carried `"!!js …"` quoted, and dsh would
 * mount that row permanently disabled with zero diagnostics.
 */
export function compositionStringDisabledProblem(rows: unknown, at = ''): string | undefined {
  if (!Array.isArray(rows)) return undefined
  for (const [index, row] of rows.entries()) {
    const label = at === '' ? `row ${String(index + 1)}` : `${at} row ${String(index + 1)}`
    if (typeof row !== 'object' || row === null || Array.isArray(row)) continue
    const record = row as CompositionRow
    if (typeof record.disabled === 'string') {
      const id = typeof record.id === 'string' ? record.id : '(no id)'
      return `${label} (id=${id}) carries a STRING disabled ${JSON.stringify(record.disabled)}`
    }
    if (record.group === true && Array.isArray(record.config)) {
      const nested = compositionStringDisabledProblem(record.config, `${label} group`)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/** Marker: the register face is absent (0.1.5) — the materialized path owns it. */
export const CONCERTO_REGISTER_FACE_ABSENT_LINE
  = '[omo-agents] concerto preset register face absent, materialized path only'

/** Marker: registered AND read back with `broken` absent (the only success). */
export function formatConcertoRegisteredLine(): string {
  return `[omo-agents] concerto preset registered: id=${CONCERTO_PRESET_ID} broken=absent`
}

/** Marker: loud-but-non-fatal registration failure (probe :939 negative grep). */
export function formatConcertoRegisterFailedLine(reason: string): string {
  return `[omo-agents] concerto preset register FAILED: ${reason}`
}

/**
 * The module-level disposer slot (plan §4.3 disposer 持有). OVERWRITTEN on every
 * successful register — NOT written once: a second register bumps the first one's
 * pointer off the slot (measured: after a re-register the slot === disposer2 and
 * !== disposer1). That is NOT a leak — every disposer is separately returned to
 * index.ts and collected by cordis on its own; the slot is only the DIAGNOSTIC /
 * TEST face and holds ONE pointer, so do not read it as holding several
 * registrations at once. PRODUCTION RELEASE DOES NOT RUN THROUGH THIS SLOT:
 * the same disposer is returned to index.ts, which returns it from the
 * `ctx.inject(['agentPresets'])` callback, and cordis collects the resolved
 * return as the injected child fiber's disposal (fiber.ts:366, :373-374 @
 * dsh-v0.2.0-rc.2 — arbitration #4). The slot is the DIAGNOSTIC / TEST face:
 * `releaseConcertoRegistration()` below is for TESTS ONLY — do NOT wire it
 * into a production dispose path (the fiber already disposes this disposer;
 * a second wire-up would be a double-release by choice rather than by
 * accident). Because the upstream disposer is idempotent (registry :88
 * `if (disposed) return`), even test-plus-fiber double calls are 0ms
 * no-ops — the hazard being avoided here is misleading the next reader, not
 * a leak.
 */
let heldConcertoDisposer: PresetDisposer | undefined

/** The currently held disposer (tests / diagnostics; undefined before any register). */
export function heldConcertoRegistration(): PresetDisposer | undefined {
  return heldConcertoDisposer
}

/**
 * TEST-ONLY release of the held registration (see the slot's comment above —
 * production release rides cordis's child-fiber dispose, not this function).
 * No once guard: the disposer is idempotent (registry :86-88
 * `if (disposed) return`), so a double release — ours plus cordis's fiber
 * disposal of the inject child — costs 0ms and cannot double-collect.
 */
export async function releaseConcertoRegistration(): Promise<void> {
  if (heldConcertoDisposer === undefined) return
  await heldConcertoDisposer()
}

/**
 * The registration outlet — called ONLY from inside the plugin's
 * `ctx.inject(['agentPresets'])` callback (Q-4: the only measured call site;
 * apply()'s synchronous stretch gets `undefined` 100% of the time and the
 * error would drift to `.register of undefined`; NO wait/retry/backoff is
 * designed here — the arbitration forbids inventing complexity around a
 * binary handle-availability fact).
 *
 * Flow: probe → render (pure outlet) → loader-dialect parse → `!!js`-carrier
 * guard → register → hold disposer → READ BACK (empty-first-read tolerant:
 * one settle re-read) → verdict marker. Success is marked ONLY after the
 * roster entry exists with `broken` ABSENT (arbitration ②: register() not
 * throwing is NOT evidence — mount failures never reject).
 *
 * loud-but-non-fatal by contract: every failure prints
 * `concerto preset register FAILED: <reason>` and returns — the host keeps
 * booting, the probe fails loudly, never a dressed-up success. A disposer
 * that exists at failure time (register resolved, readback judged it broken)
 * is STILL held and returned, so the dispose channel can clean up.
 *
 * @returns the disposer on success or on post-register failure; undefined
 *   when the face is absent (0.1.5) or register never ran.
 */
export async function registerConcertoPreset(
  agentPresets: unknown,
  log: (line: string) => void,
  templateDir: string = CONCERTO_TEMPLATE_DIR,
  personaPrompt: string = buildSisyphusSystemPrompt(),
  inputs: ConcertoRenderInputs = {},
): Promise<PresetDisposer | undefined> {
  if (!hasAgentPresetsRegisterFace(agentPresets)) {
    log(CONCERTO_REGISTER_FACE_ABSENT_LINE)
    return undefined
  }
  const svc = agentPresets as AgentPresetsRegisterLike
  let disposer: PresetDisposer | undefined
  try {
    const composition = renderConcertoComposition(templateDir, personaPrompt, inputs)
    const rows = await parseCompositionInLoaderDialect(composition)
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('parsed composition is not a non-empty top-level row list')
    }
    const stringDisabled = compositionStringDisabledProblem(rows)
    if (stringDisabled !== undefined) {
      throw new Error(
        `loader-dialect parse left a bare-string disabled on ${stringDisabled} — `
        + 'dsh would mount it silently DISABLED (Boolean of a truthy string); the '
        + 'template must carry the real !!js tag',
      )
    }
    // Display identity comes from the SAME preset.yml the materialized path
    // ships — single source, so the roster entry keeps 协奏模式/Concerto Mode
    // and order: 5 after the official 4 (preset.yml header).
    const meta = (await parseCompositionInLoaderDialect(
      readFileSync(join(templateDir, 'preset.yml'), 'utf8'),
    )) as { name?: unknown; description?: unknown; order?: unknown }
    const definition: ConcertoPresetDefinition = {
      id: CONCERTO_PRESET_ID,
      ...(typeof meta.name === 'string' ? { name: meta.name } : {}),
      ...(typeof meta.description === 'string' ? { description: meta.description } : {}),
      ...(typeof meta.order === 'number' ? { order: meta.order } : {}),
      plugins: rows as CompositionRow[],
    }
    disposer = await svc.register(definition)
    heldConcertoDisposer = disposer
    // READBACK — the only success evidence (arbitration ②). First read may be
    // empty (Q-3 §1.4); one settle re-read is not "retry logic" — it is the
    // documented settle discipline, bounded to two reads, no timers.
    let roster = await svc.list()
    if (!roster.some((row) => row?.id === CONCERTO_PRESET_ID)) {
      roster = await svc.list()
    }
    const entry = roster.find((row) => row?.id === CONCERTO_PRESET_ID)
    if (entry === undefined) {
      throw new Error(
        `roster readback has no entry id=${CONCERTO_PRESET_ID} after register resolved `
        + '(two reads — the roster did not settle with our definition)',
      )
    }
    if (entry.broken !== undefined) {
      throw new Error(`roster readback marks id=${CONCERTO_PRESET_ID} broken: ${entry.broken}`)
    }
    log(formatConcertoRegisteredLine())
    return disposer
  } catch (err) {
    log(`${formatConcertoRegisterFailedLine(describeError(err))}${disposer === undefined ? '' : ' (disposer held — release still available)'}`)
    return disposer
  }
}
