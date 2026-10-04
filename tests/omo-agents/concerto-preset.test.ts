// T6 — concerto preset sync module (TDD: written BEFORE the module existed;
// first run must fail on the unresolved import).
//
// P2-T15 — the module's sentinel pipeline is roster-driven now: the concerto
// template carries ONE `dsh-tool-subagent` instance per roster delegation
// entry (10 rows) beside control / list-agents, and every per-row value
// (persona / agentOptions / class-filter deny) is rendered from a single
// source. These tests pin (a) the template's sentinel census, (b) the
// rendered row contract per class, derived from roster.ts AND restated as
// independent literals, and (c) the exactly-once guard.
//
// The rendered composition is parsed with `loadYamlDialect` — the repo's own
// wrapper over the INSTALLED dsh's js-yaml in the exact loader dialect
// (JSON_SCHEMA + `!!js`). The repo has no js-yaml dependency of its own, so
// importing the installed runtime's parser is the same zero-dep move
// scripts/doctor-lite.mjs and scripts/verify-concerto-static.mjs make; gate 2
// already requires the installed dsh (the workflow installs it before the
// gate chain), and `loadYamlDialect` fails loudly with code NO_PARSER rather
// than silently skipping.
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONCERTO_PRESET_FILES,
  CONCERTO_PRESET_ID,
  CONCERTO_REGISTER_FACE_ABSENT_LINE,
  CONCERTO_TEMPLATE_DIR,
  EXPLORE_AGENT_OPTIONS_SENTINEL,
  EXPLORE_PERSONA_SENTINEL,
  agentSentinelName,
  compositionStringDisabledProblem,
  concertoPresetDir,
  formatConcertoRegisterFailedLine,
  formatConcertoRegisteredLine,
  hasAgentPresetsRegisterFace,
  heldConcertoRegistration,
  parseCompositionInLoaderDialect,
  registerConcertoPreset,
  renderAgentDenyIntoComposition,
  renderAgentOptionsIntoComposition,
  renderAgentPersonaIntoComposition,
  renderConcertoComposition,
  renderExploreAgentOptionsIntoComposition,
  renderExplorePersonaIntoComposition,
  releaseConcertoRegistration,
  resolveDshHome,
  syncConcertoPreset,
} from '../../patches/omo-dsh/omo-agents/src/concerto-preset'
import {
  DELEGATION_ENTRIES,
  DELEGATION_TOOL_NAMES,
  allowToolNamesFor,
  denyToolNamesFor,
} from '../../patches/omo-dsh/omo-agents/src/roster'
import type { AgentId } from '../../patches/omo-dsh/omo-agents/src/roster'
import { buildAgentPersona } from '../../patches/omo-dsh/omo-agents/src/persona-prompts'
import { PERSONA_TEXT_SENTINEL } from '../../patches/omo-dsh/omo-agents/src/system-prompt'
import { resolveModelRoutes } from '../../patches/omo-dsh/omo-agents/src/model-routes'
import { loadYamlDialect } from '../../scripts/doctor-lite.mjs'

// Independently computed expectation (not taken from the module) so the test
// proves the module's import.meta.url resolution, not its own input.
const EXPECTED_TEMPLATE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'patches',
  'omo-dsh',
  'omo-agents',
  'concerto',
)

const sandboxes: string[] = []
function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'omo-concerto-preset-test.'))
  sandboxes.push(dir)
  return dir
}

afterEach(() => {
  while (sandboxes.length > 0) rmSync(sandboxes.pop()!, { recursive: true, force: true })
})

/** Minimal row shape of a loaded composition (loose: js-yaml returns data). */
type YamlRow = { id?: string; name?: string; config?: any }

function delegationGroup(rows: any): YamlRow[] {
  const group = (rows as YamlRow[]).find((row) => row.id === 'delegation')
  if (group === undefined || !Array.isArray(group.config)) {
    throw new Error('loaded composition has no `delegation` group with a row list')
  }
  return group.config as YamlRow[]
}

function toolRow(group: YamlRow[], toolName: string): YamlRow {
  const row = group.find(
    (candidate) => candidate.name === '@deepseek-ai/dsh-tool-subagent'
      && candidate.config?.toolName === toolName,
  )
  if (row === undefined) throw new Error(`no dsh-tool-subagent row with toolName '${toolName}'`)
  return row
}

/** Independent literals (not derived) — the roster order and classes of plan §4.1. */
const DELEGATION_ORDER = [
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
]
const READ_ONLY_IDS = ['explore', 'oracle', 'librarian', 'plan-consultant', 'plan-reviewer', 'prometheus']
const WORKER_IDS = ['hephaestus', 'sisyphus-junior']

/** Spot-check headings: first heading of each system-sections/<id>-persona.md. */
const PERSONA_HEADINGS: Record<string, string> = {
  explore: '# Explore: Read-Only Retrieval Agent',
  hephaestus: '# Hephaestus: Autonomous Deep Worker',
  oracle: '# Oracle: Read-Only Technical Advisor',
  librarian: '# The Librarian: Documentation and OSS Source Search',
  'plan-consultant': '# Plan Consultant: Pre-Planning Gap Analysis',
  'plan-reviewer': '# Plan Reviewer: Plan Critic and Review Gate',
  atlas: '# Atlas: Master Orchestrator (TODO Execution)',
  'multimodal-looker': '# Multimodal Looker: Media and Document Analysis',
  'sisyphus-junior': '# Sisyphus-Junior: Focused Task Executor',
  prometheus: '# Prometheus: Interview-Style Strategic Planner',
}

/** The 29 sentinels of the T8 + P2-T15 template, from the renderer's naming. */
function templateSentinels(): string[] {
  const sentinels = [`prefix: ${PERSONA_TEXT_SENTINEL}`]
  for (const entry of DELEGATION_ENTRIES) {
    sentinels.push(`persona: ${agentSentinelName(entry.id, 'PERSONA')}`)
    sentinels.push(`agentOptions: ${agentSentinelName(entry.id, 'AGENT_OPTIONS')}`)
    if (denyToolNamesFor(entry) !== undefined) {
      sentinels.push(`deny: ${agentSentinelName(entry.id, 'DENY')}`)
    }
  }
  return sentinels
}

describe('omo-agents concerto preset sync (T6)', () => {
  it('resolves CONCERTO_TEMPLATE_DIR from import.meta.url to the expected absolute path', () => {
    expect(CONCERTO_TEMPLATE_DIR).toBe(EXPECTED_TEMPLATE_DIR)
    expect(CONCERTO_TEMPLATE_DIR.startsWith('/')).toBe(true)
  })

  it('ships exactly the two preset files the roster reads (preset.yml + agent.cordis.yml)', () => {
    expect([...CONCERTO_PRESET_FILES]).toEqual(['preset.yml', 'agent.cordis.yml'])
    for (const file of CONCERTO_PRESET_FILES) {
      const content = readFileSync(join(EXPECTED_TEMPLATE_DIR, file), 'utf8')
      expect(content.trim().length).toBeGreaterThan(0)
    }
  })

  it('shipped preset.yml carries the real 协奏模式 / Concerto Mode display name', () => {
    const presetYml = readFileSync(join(EXPECTED_TEMPLATE_DIR, 'preset.yml'), 'utf8')
    expect(presetYml).toContain('协奏')
    expect(presetYml).toContain('Concerto')
    expect(CONCERTO_PRESET_ID).toBe('concerto')
  })

  it('shipped agent.cordis.yml keeps the delegation tools (orchestration-first composition)', () => {
    const composition = readFileSync(join(EXPECTED_TEMPLATE_DIR, 'agent.cordis.yml'), 'utf8')
    expect(composition).toContain('@deepseek-ai/dsh-tool-subagent')
  })

  it('resolveDshHome prefers a non-empty DSH_HOME, then falls back to ~/.dsh', () => {
    expect(resolveDshHome({ DSH_HOME: '/tmp/sandbox-dsh' }, '/home/someone')).toBe('/tmp/sandbox-dsh')
    expect(resolveDshHome({ DSH_HOME: '   ' }, '/home/someone')).toBe(join('/home/someone', '.dsh'))
    expect(resolveDshHome({}, '/home/someone')).toBe(join('/home/someone', '.dsh'))
  })

  it('concertoPresetDir lands under <dshHome>/.agent-presets/concerto', () => {
    expect(concertoPresetDir({ DSH_HOME: '/tmp/sandbox-dsh' }, '/home/someone'))
      .toBe(join('/tmp/sandbox-dsh', '.agent-presets', 'concerto'))
  })

  it('syncConcertoPreset materializes the preset into an empty target root', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target)).toBe('materialized')
    // preset.yml is copied verbatim; agent.cordis.yml is RENDERED at sync
    // time (T8 design a): the persona sentinel becomes the assembled
    // omo-sisyphus system prompt, so the materialized file differs from the
    // template exactly in the rendered sentinel positions.
    expect(readFileSync(join(target, 'preset.yml'), 'utf8')).toBe(
      readFileSync(join(EXPECTED_TEMPLATE_DIR, 'preset.yml'), 'utf8'),
    )
    const composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(composition).not.toContain('__OMO_SISYPHUS_SYSTEM_PROMPT__')
    expect(composition).toContain('# Orchestrator Role')
    expect(composition).toContain('# Delegation Discipline')
    expect(composition).toContain('## Hard Blocks')
    // P2-T15: EVERY sentinel is consumed — no marker of any family survives.
    expect(composition).not.toContain('__OMO_')
  })

  it('syncConcertoPreset is a no-op when the target content is already identical', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target)).toBe('materialized')
    expect(syncConcertoPreset(target)).toBe('unchanged')
  })

  it('syncConcertoPreset refreshes a divergent existing preset back to the template', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target)).toBe('materialized')
    writeFileSync(join(target, 'preset.yml'), 'name: tampered\n', 'utf8')
    expect(syncConcertoPreset(target)).toBe('refreshed')
    const expected = readFileSync(join(EXPECTED_TEMPLATE_DIR, 'preset.yml'), 'utf8')
    expect(readFileSync(join(target, 'preset.yml'), 'utf8')).toBe(expected)
  })

  it('syncConcertoPreset removes stale extra files and reports the sync as refreshed', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target)).toBe('materialized')
    // A leftover from an older plugin build: the plugin is the only author
    // of this directory, so anything outside the two known files is stale.
    writeFileSync(join(target, 'stale-legacy.yml'), 'name: legacy\n', 'utf8')
    expect(syncConcertoPreset(target)).toBe('refreshed')
    expect(existsSync(join(target, 'stale-legacy.yml'))).toBe(false)
    expect(existsSync(join(target, 'preset.yml'))).toBe(true)
    expect(existsSync(join(target, 'agent.cordis.yml'))).toBe(true)
  })

  it('syncConcertoPreset re-applies mode 0o600 on an unchanged sync', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target)).toBe('materialized')
    for (const file of CONCERTO_PRESET_FILES) chmodSync(join(target, file), 0o644)
    expect(syncConcertoPreset(target)).toBe('unchanged')
    for (const file of CONCERTO_PRESET_FILES) {
      expect(statSync(join(target, file)).mode & 0o777).toBe(0o600)
    }
  })
})

describe('concerto template — the 12-row delegation roster (P2-T15)', () => {
  const template = readFileSync(join(EXPECTED_TEMPLATE_DIR, 'agent.cordis.yml'), 'utf8')

  it('carries control + list-agents + one tool-subagent row per roster delegation entry, in roster order', async () => {
    const group = delegationGroup(await loadYamlDialect(join(EXPECTED_TEMPLATE_DIR, 'agent.cordis.yml')))
    expect(group.map((row) => row.id)).toEqual([
      'tool-subagent-control',
      'tool-subagent-list-agents',
      ...DELEGATION_ORDER.map((id) => `tool-subagent-${id}`),
    ])
    // F1 (PR #1 review, 2026-09-04): no generic spawn/fork row, no product row.
    expect(group.some((row) => row.config?.toolName === 'subagent')).toBe(false)
    expect(group.some((row) => row.config?.toolName === 'subagent_fork')).toBe(false)
    expect(group.some((row) => row.id === 'tool-subagent-codex' || row.id === 'tool-subagent-claude-code')).toBe(false)
    expect(template).not.toContain('toolName: subagent\n')
    expect(template).not.toContain('toolName: subagent_fork')
  })

  it('declares every sentinel exactly once (29: 1 conductor prefix + 10 persona + 10 agentOptions + 8 deny)', () => {
    const sentinels = templateSentinels()
    expect(sentinels).toHaveLength(29)
    for (const sentinel of sentinels) {
      expect(template.split(sentinel).length - 1, sentinel).toBe(1)
    }
    // The deny family is per-row unique: the old inline explore triple is gone
    // and the class filters are sentinels now, not literals.
    expect(template).not.toContain('deny: [write')
    expect(template).not.toContain('deny: [write, edit, explore]')
    // Sentinel delimiters appear ONLY in value/sentinel positions, never inside
    // prose comments: a "is the template still carrying a sentinel" grep stays
    // an unambiguous statement about the artifact.
    const proseLines = template.split('\n').filter((line) => line.trimStart().startsWith('#'))
    expect(proseLines.filter((line) => line.includes('__OMO_'))).toEqual([])
  })
})

describe('concerto rendered composition — per-row contract (P2-T15)', () => {
  async function renderDefault(): Promise<{ group: YamlRow[]; composition: string }> {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target)).toBe('materialized')
    const composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    const group = delegationGroup(await loadYamlDialect(join(target, 'agent.cordis.yml')))
    return { group, composition }
  }

  it('renders all 29 sentinels: a parsed composition with no `__OMO_` residue', async () => {
    const { composition, group } = await renderDefault()
    expect(composition).not.toContain('__OMO_')
    expect(group).toHaveLength(12)
  })

  it('binds every roster delegation entry to exactly one row, in roster order', async () => {
    const { group } = await renderDefault()
    const tools = group.filter((row) => row.name === '@deepseek-ai/dsh-tool-subagent')
    expect(tools.map((row) => row.config?.toolName)).toEqual(DELEGATION_ORDER)
    for (const entry of DELEGATION_ENTRIES) {
      const row = toolRow(group, entry.id)
      expect(row.id).toBe(`tool-subagent-${entry.id}`)
    }
    expect([...DELEGATION_TOOL_NAMES]).toEqual(DELEGATION_ORDER)
  })

  it('gives every row provider spawn + backgroundMode continuable, and the roster maxDepth', async () => {
    const { group } = await renderDefault()
    for (const entry of DELEGATION_ENTRIES) {
      const row = toolRow(group, entry.id)
      expect(row.config.provider, entry.id).toBe('spawn')
      expect(row.config.backgroundMode, entry.id).toBe('continuable')
      // Roster-derived: dsh caps on the INVOKED row, so a uniform 2 on all ten
      // rows is what makes the chain cap 2 (D-2026-09-13-01; roster §1 修正块).
      expect(row.config.maxDepth, entry.id).toBe(entry.maxDepth)
      expect(entry.maxDepth, entry.id).toBe(2)
    }
    expect(toolRow(group, 'atlas').config.maxDepth).toBe(2)
  })

  it('renders each row\'s agentOptions as the resolved {provider, model} route', async () => {
    const { group } = await renderDefault()
    const routes = resolveModelRoutes()
    for (const entry of DELEGATION_ENTRIES) {
      const route = routes[entry.id as AgentId]
      expect(toolRow(group, entry.id).config.agentOptions, entry.id)
        .toEqual({ provider: route.provider, model: route.model })
    }
    // Spot checks (independent of the roster rows): the two pre-existing seats
    // plus the one vision seat stay where the plan puts them.
    expect(toolRow(group, 'explore').config.agentOptions)
      .toEqual({ provider: 'deepseek', model: 'deepseek-v4-flash' })
    expect(toolRow(group, 'multimodal-looker').config.agentOptions)
      .toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp' })
  })

  it('renders each row\'s persona as that agent\'s block scalar', async () => {
    const { group } = await renderDefault()
    for (const entry of DELEGATION_ENTRIES) {
      const persona = toolRow(group, entry.id).config.persona
      expect(typeof persona, entry.id).toBe('string')
      expect(persona, entry.id).toBe(buildAgentPersona(entry.id))
      expect(persona, entry.id).toContain(PERSONA_HEADINGS[entry.id])
    }
  })

  it('mirrors the roster classes onto toolFilter: read-only and worker deny, atlas none, allowlist allow', async () => {
    const { group } = await renderDefault()
    const delegationNames = DELEGATION_ORDER
    // The class split itself, restated independently (plan §4.4).
    expect(DELEGATION_ENTRIES.filter((entry) => entry.class === 'read-only').map((entry) => entry.id))
      .toEqual(READ_ONLY_IDS)
    expect(DELEGATION_ENTRIES.filter((entry) => entry.class === 'worker').map((entry) => entry.id))
      .toEqual(WORKER_IDS)
    expect(DELEGATION_ENTRIES.filter((entry) => entry.class === 'orchestrator').map((entry) => entry.id))
      .toEqual(['atlas'])
    expect(DELEGATION_ENTRIES.filter((entry) => entry.class === 'allowlist').map((entry) => entry.id))
      .toEqual(['multimodal-looker'])

    for (const id of READ_ONLY_IDS) {
      expect(toolRow(group, id).config.toolFilter, id)
        .toEqual({ deny: ['write', 'edit', ...delegationNames] })
    }
    for (const id of WORKER_IDS) {
      expect(toolRow(group, id).config.toolFilter, id).toEqual({ deny: [...delegationNames] })
    }
    // atlas (orchestrator): the key is ABSENT — it keeps the delegation tools.
    expect('toolFilter' in toolRow(group, 'atlas').config).toBe(false)
    // multimodal-looker (allowlist): the static vision-safe list.
    expect(toolRow(group, 'multimodal-looker').config.toolFilter).toEqual({ allow: ['read', 'read_image'] })

    // The response above is the roster's own computation, per row.
    for (const entry of DELEGATION_ENTRIES) {
      const row = toolRow(group, entry.id)
      const deny = denyToolNamesFor(entry)
      const allow = allowToolNamesFor(entry)
      if (deny !== undefined) expect(row.config.toolFilter, entry.id).toEqual({ deny })
      else if (allow !== undefined) expect(row.config.toolFilter, entry.id).toEqual({ allow })
      else expect('toolFilter' in row.config, entry.id).toBe(false)
    }
  })

  it('keeps the explore row unregressed except for its roster-computed deny', async () => {
    const { group } = await renderDefault()
    const explore = toolRow(group, 'explore')
    expect(explore.id).toBe('tool-subagent-explore')
    expect(explore.name).toBe('@deepseek-ai/dsh-tool-subagent')
    expect(explore.config.provider).toBe('spawn')
    expect(explore.config.toolName).toBe('explore')
    expect(explore.config.backgroundMode).toBe('continuable')
    // Roster-derived (was the literal 1 before the D-2026-09-13-01 correction):
    // explore is a delegation target, and every target row caps at 2.
    expect(explore.config.maxDepth)
      .toBe(DELEGATION_ENTRIES.find((entry) => entry.id === 'explore')!.maxDepth)
    expect(explore.config.persona).toContain('# Explore: Read-Only Retrieval Agent')
    expect(explore.config.agentOptions).toEqual({ provider: 'deepseek', model: 'deepseek-v4-flash' })
    // The T12 + F1 guardrails, now the read-only class list (P2-T15): write/edit
    // plus all ten delegation tools, so the child physically cannot delegate.
    const deny = denyToolNamesFor(DELEGATION_ENTRIES.find((entry) => entry.id === 'explore')!)!
    expect(explore.config.toolFilter).toEqual({ deny })
    for (const name of ['write', 'edit', ...DELEGATION_ORDER]) {
      expect(explore.config.toolFilter.deny, name).toContain(name)
    }
    expect(explore.config.toolFilter.deny).not.toEqual(['write', 'edit', 'explore'])
  })

  it('renders the explore persona block scalar at the row\'s 10-space content indent', async () => {
    const { composition } = await renderDefault()
    expect(composition).toContain('        persona: |-\n')
    expect(composition).toContain('          # Explore: Read-Only Retrieval Agent\n')
    // Every one of the ten rows is a block scalar under its own persona key.
    expect(composition.split('        persona: |-\n').length - 1).toBe(10)
  })
})

describe('concerto sentinel renderers — injection and guard (P2-T15)', () => {
  const EXPLORE_MARKER = 'T11-EXPLORE-PERSONA-MARKER\nsecond line of the injected explore persona'

  it('renders an injected persona at the row indent and an injected route JSON-quoted', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target, EXPECTED_TEMPLATE_DIR, 'SISYPHUS-STUB', {
      personas: { explore: EXPLORE_MARKER },
      routes: { explore: { provider: 'deep"seek', model: 'x: y # z' } },
    })).toBe('materialized')
    const composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(composition).not.toContain(EXPLORE_PERSONA_SENTINEL)
    expect(composition).not.toContain(EXPLORE_AGENT_OPTIONS_SENTINEL)
    expect(composition).not.toContain('__OMO_')
    expect(composition).toContain('          T11-EXPLORE-PERSONA-MARKER\n')
    expect(composition).toContain('          second line of the injected explore persona\n')
    expect(composition).toContain(`          provider: ${JSON.stringify('deep"seek')}\n`)
    expect(composition).toContain(`          model: ${JSON.stringify('x: y # z')}\n`)
  })

  it('renders deny names as a JSON-quoted YAML flow sequence', () => {
    const rendered = renderAgentDenyIntoComposition(
      `deny: ${agentSentinelName('oracle', 'DENY')}`,
      'oracle',
      ['write', 'x: y # z', 'a"b'],
    )
    expect(rendered).toBe(`deny: ["write", "x: y # z", "a\\"b"]`)
    expect(rendered).not.toContain(agentSentinelName('oracle', 'DENY'))
    expect(() => renderAgentDenyIntoComposition('no sentinel here', 'oracle', ['write']))
      .toThrow(/exactly once/)
    expect(() => renderAgentDenyIntoComposition(`deny: ${agentSentinelName('oracle', 'DENY')}`, 'oracle', []))
      .toThrow(/EMPTY deny list/)
  })

  it('throws for a sentinel that does not occur exactly once (every family)', () => {
    expect(() => renderExplorePersonaIntoComposition('no sentinel here', 'x')).toThrow(/exactly once/)
    expect(() => renderExploreAgentOptionsIntoComposition('no sentinel here', { provider: 'p', model: 'm' }))
      .toThrow(/exactly once/)
    expect(() => renderAgentPersonaIntoComposition('no sentinel here', 'plan-consultant', 'x'))
      .toThrow(/exactly once/)
    expect(() => renderAgentOptionsIntoComposition('no sentinel here', 'plan-reviewer', { provider: 'p', model: 'm' }))
      .toThrow(/exactly once/)
    const doubled = `persona: ${EXPLORE_PERSONA_SENTINEL}\npersona: ${EXPLORE_PERSONA_SENTINEL}`
    expect(() => renderExplorePersonaIntoComposition(doubled, 'x')).toThrow(/exactly once/)
    const doubledDeny = `deny: ${agentSentinelName('atlas', 'DENY')}\ndeny: ${agentSentinelName('atlas', 'DENY')}`
    expect(() => renderAgentDenyIntoComposition(doubledDeny, 'atlas', ['write'])).toThrow(/exactly once/)
  })

  it('sentinel names follow the roster env-name convention (id upper-cased, hyphens folded)', () => {
    expect(agentSentinelName('explore', 'PERSONA')).toBe('__OMO_EXPLORE_PERSONA__')
    expect(agentSentinelName('explore', 'AGENT_OPTIONS')).toBe('__OMO_EXPLORE_AGENT_OPTIONS__')
    expect(agentSentinelName('plan-consultant', 'DENY')).toBe('__OMO_PLAN_CONSULTANT_DENY__')
    expect(agentSentinelName('multimodal-looker', 'AGENT_OPTIONS')).toBe('__OMO_MULTIMODAL_LOOKER_AGENT_OPTIONS__')
    expect(EXPLORE_PERSONA_SENTINEL).toBe(agentSentinelName('explore', 'PERSONA'))
    expect(EXPLORE_AGENT_OPTIONS_SENTINEL).toBe(agentSentinelName('explore', 'AGENT_OPTIONS'))
  })

  it('the rendered composition survives sync idempotence (second sync is a no-op)', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    const inputs = { personas: { explore: EXPLORE_MARKER } }
    expect(syncConcertoPreset(target, EXPECTED_TEMPLATE_DIR, 'SISYPHUS-STUB', inputs)).toBe('materialized')
    const first = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(first).toContain('          T11-EXPLORE-PERSONA-MARKER\n')
    expect(syncConcertoPreset(target, EXPECTED_TEMPLATE_DIR, 'SISYPHUS-STUB', inputs)).toBe('unchanged')
    expect(readFileSync(join(target, 'agent.cordis.yml'), 'utf8')).toBe(first)
  })

  it('default sync (no injected values) renders the real explore persona and the resolved route', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target)).toBe('materialized')
    const composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    // Real persona content from system-sections/explore-persona.md (T10 source).
    expect(composition).toContain('          # Explore: Read-Only Retrieval Agent')
    // Real route from src/model-routes.ts defaults (T14 source).
    expect(composition).toContain('          provider: "deepseek"')
    expect(composition).toContain('          model: "deepseek-v4-flash"')
    // Roster-derived (was the literal `maxDepth: 1` before the
    // D-2026-09-13-01 correction): the rendered row carries the roster value.
    const exploreMaxDepth = DELEGATION_ENTRIES.find((entry) => entry.id === 'explore')!.maxDepth
    expect(composition).toContain(`maxDepth: ${exploreMaxDepth}`)
    // F1 fix (2026-09-04) generalized by P2-T15: the rendered deny is the
    // roster-computed read-only class list, not the old inline triple.
    expect(composition).toContain(
      `deny: [${['write', 'edit', ...DELEGATION_ORDER].map((name) => JSON.stringify(name)).join(', ')}]`,
    )
  })
})

// ═════════════════ P4.5-T5 — render outlet + registration outlet ═════════════════
//
// The registration-outlet tests drive the REAL registerConcertoPreset against a
// FAKE agentPresets service (no dsh boot): the fake mirrors the measured 0.2.x
// registry contract (T1 Q-3/Q-4) — register resolves with an id-capturing
// disposer, mount failure NEVER rejects and only shows up as `broken` on the
// roster row, and the first list() may be empty. The YAML inside the tests is
// parsed by the installed dsh's js-yaml through the same dialect helper the
// plugin uses. Two of these tests are the MUTATION PAIRS (P0 evidence): the
// broken-readback test and the string-disabled guard test each have a sibling
// that corrupts the input (roster broken / quoted "!!js" template) and proves
// the success-side assertion actually goes red.

/** A disposable fake of the 0.2.x agent-preset-registry service face. */
function makeV2PresetService(options: {
  /** list() answers `broken` on this id (the mount-failure form). */
  brokenOn?: string
  /** list() answers [] for its first N calls (the Q-3 §1.4 empty-first-read). */
  emptyFirstReads?: number
} = {}) {
  const definitions = new Map<string, { id: string; definition: any }>()
  const service = {
    registerCalls: [] as any[],
    listCalls: 0,
    async list(): Promise<Array<{ id: string; broken?: string }>> {
      service.listCalls += 1
      if (service.listCalls <= (options.emptyFirstReads ?? 0)) return []
      return [...definitions.values()].map(({ id }) => ({
        id,
        ...(id === options.brokenOn ? { broken: 'fake: q3-does-not-exist-package never started' } : {}),
      }))
    },
    async register(definition: { id: string }): Promise<() => Promise<void>> {
      service.registerCalls.push(definition)
      if (definitions.has(definition.id)) {
        throw new Error(`Duplicate agent preset: ${definition.id}`)
      }
      const record = { id: definition.id, definition }
      definitions.set(definition.id, record)
      let disposed = false
      const disposer = async (): Promise<void> => {
        if (disposed) return
        disposed = true
        // Identity check: a stale disposer must never clobber a NEWER
        // registration of the same id (the anti-crosstalk half of the
        // double-registration disposer test).
        if (definitions.get(definition.id) === record) definitions.delete(definition.id)
      }
      return disposer
    },
  }
  return service
}

/** The 0.1.5 shape: list exists, register does NOT (capability probe answers no). */
function makeV1PresetService() {
  return {
    registerCalls: [] as any[],
    async list(): Promise<Array<{ id: string; trust?: string }>> {
      return [{ id: 'concerto', trust: 'user' }]
    },
  }
}

describe('renderConcertoComposition — the pure render outlet (P4.5-T5)', () => {
  it('renders the full anchor set with ZERO sentinel residue and writes nothing', () => {
    const sandbox = makeSandbox()
    // DEFAULT conductor prompt — the section headings ARE the prompt content
    // rendered into the persona sentinel; a stub would erase them and make the
    // anchor assertions vacuous in the other direction.
    const composition = renderConcertoComposition(EXPECTED_TEMPLATE_DIR)
    // All render anchors the materialized file carries (probe §T8/T11 set):
    expect(composition).toContain('prefix: |-')
    expect(composition).toContain('# Orchestrator Role')
    expect(composition).toContain('# Delegation Discipline')
    expect(composition).toContain('## Hard Blocks')
    expect(composition).toContain('          # Explore: Read-Only Retrieval Agent')
    expect(composition).toContain('          provider: "deepseek"')
    expect(composition).not.toContain('__OMO_')
    // Pure = no filesystem side effect: the sandbox stays EMPTY.
    expect(readdirSync(sandbox)).toEqual([])
  })

  it('is the SAME bytes syncConcertoPreset writes (single render implementation)', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target)).toBe('materialized')
    const written = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(renderConcertoComposition()).toBe(written)
  })
})

describe('hasAgentPresetsRegisterFace — the capability probe (P4.5-T5)', () => {
  it('answers YES only for a function-valued register member', () => {
    expect(hasAgentPresetsRegisterFace({ list: async () => [], register: async () => async () => {} }))
      .toBe(true)
  })

  it('answers NO for the 0.1.5 shape and every non-object', () => {
    expect(hasAgentPresetsRegisterFace(makeV1PresetService())).toBe(false)
    expect(hasAgentPresetsRegisterFace(undefined)).toBe(false)
    expect(hasAgentPresetsRegisterFace(null)).toBe(false)
    expect(hasAgentPresetsRegisterFace('register')).toBe(false)
    expect(hasAgentPresetsRegisterFace({ register: 'not-a-function' })).toBe(false)
  })
})

describe('compositionStringDisabledProblem — the bare-string disabled guard (P4.5-T5)', () => {
  it('passes the REAL rendered composition (real !!js tags parse to objects)', async () => {
    const rows = await parseCompositionInLoaderDialect(renderConcertoComposition())
    expect(Array.isArray(rows)).toBe(true)
    expect(compositionStringDisabledProblem(rows)).toBeUndefined()
    // Positive control: the guard has rows to look at — the real composition
    // carries TWO real-tag platform gates (tool-bash/tool-pwsh).
    const flat = JSON.stringify(rows)
    expect(flat).toContain('__jsExpr')
  })

  it('names the first bare-string disabled row, nested groups included', () => {
    expect(compositionStringDisabledProblem([
      { id: 'a', name: 'x' },
      { id: 'tool-bash', name: 'y', disabled: '!!js process.platform === \'win32\'' },
    ])).toContain('row 2 (id=tool-bash)')

    expect(compositionStringDisabledProblem([
      { id: 'g', name: 'cordis:group', group: true, config: [
        { id: 'inner', name: 'z', disabled: '!!js true' },
      ] },
    ])).toContain('row 1 group row 1 (id=inner)')

    // Real-tag objects and plain booleans pass.
    expect(compositionStringDisabledProblem([
      { id: 'a', name: 'x', disabled: { __jsExpr: 'process.platform' } },
      { id: 'b', name: 'y', disabled: false },
      { id: 'c', name: 'z' },
    ])).toBeUndefined()
  })
})

describe('registerConcertoPreset — the 0.2.x registration outlet (P4.5-T5)', () => {
  const logs: string[] = []
  const log = (line: string): void => { logs.push(line) }

  beforeEach(() => { logs.length = 0 })

  it('0.1.5 shape: face absent → the face-absent marker, ZERO register calls', async () => {
    const svc = makeV1PresetService()
    const disposer = await registerConcertoPreset(svc, log, EXPECTED_TEMPLATE_DIR, 'T5-STUB')
    expect(disposer).toBeUndefined()
    expect(logs).toContain(CONCERTO_REGISTER_FACE_ABSENT_LINE)
    expect(svc.registerCalls).toHaveLength(0)
    expect(logs.some((line) => line.includes('register FAILED'))).toBe(false)
  })

  it('0.2.x shape: parses, registers, READS BACK broken-absent, holds the disposer', async () => {
    const svc = makeV2PresetService()
    const disposer = await registerConcertoPreset(svc, log, EXPECTED_TEMPLATE_DIR, 'T5-STUB')
    expect(svc.registerCalls).toHaveLength(1)
    const definition = svc.registerCalls[0]
    expect(definition.id).toBe(CONCERTO_PRESET_ID)
    expect(Array.isArray(definition.plugins)).toBe(true)
    expect(definition.plugins.length).toBeGreaterThan(0)
    // Display identity rides from the SAME preset.yml the materialized path ships.
    expect(definition.name).toContain('协奏')
    expect(definition.order).toBe(5)
    // The success marker is the readback verdict, not the non-throw.
    expect(logs).toContain(formatConcertoRegisteredLine())
    expect(logs.some((line) => line.includes('register FAILED'))).toBe(false)
    // Disposer contract (T1 Q-3 §2.3/§3.4): arity 0, held in the slot.
    expect(typeof disposer).toBe('function')
    expect(disposer!).toHaveLength(0)
    expect(heldConcertoRegistration()).toBe(disposer)
    // Roster readback shows concerto.
    const roster = await svc.list()
    expect(roster.map((row) => row.id)).toContain(CONCERTO_PRESET_ID)
    // Releasing through the slot removes it; a second release is a 0ms no-op.
    await releaseConcertoRegistration()
    expect((await svc.list()).map((row) => row.id)).not.toContain(CONCERTO_PRESET_ID)
    await expect(releaseConcertoRegistration()).resolves.toBeUndefined()
  })

  it('survives the empty first read (Q-3 §1.4): settles, then marks success', async () => {
    const svc = makeV2PresetService({ emptyFirstReads: 1 })
    const disposer = await registerConcertoPreset(svc, log, EXPECTED_TEMPLATE_DIR, 'T5-STUB')
    expect(typeof disposer).toBe('function')
    expect(logs).toContain(formatConcertoRegisteredLine())
    expect(svc.listCalls).toBeGreaterThanOrEqual(2)
  })

  it('double registration: two disposers, each releases its OWN registration only', async () => {
    const svc = makeV2PresetService()
    const disposer1 = await registerConcertoPreset(svc, log, EXPECTED_TEMPLATE_DIR, 'T5-STUB')
    expect(typeof disposer1).toBe('function')
    await disposer1!()
    expect((await svc.list()).map((row) => row.id)).not.toContain(CONCERTO_PRESET_ID)

    // Re-register after release: a NEW disposer for a NEW registration.
    const disposer2 = await registerConcertoPreset(svc, log, EXPECTED_TEMPLATE_DIR, 'T5-STUB')
    expect(typeof disposer2).toBe('function')
    expect(disposer2).not.toBe(disposer1)

    // The STALE disposer must not clobber the live registration.
    await disposer1!()
    expect((await svc.list()).map((row) => row.id)).toContain(CONCERTO_PRESET_ID)

    // The live disposer releases it; repeat is idempotent.
    await disposer2!()
    expect((await svc.list()).map((row) => row.id)).not.toContain(CONCERTO_PRESET_ID)
    await expect(disposer2!()).resolves.toBeUndefined()
  })

  it('MUTATION pair: a broken roster row turns the success marker into FAILED', async () => {
    // The fake answers every readback with `broken` present (the measured
    // mount-failure form, Q-3 §2.4: register resolves, roster carries broken).
    const svc = makeV2PresetService({ brokenOn: CONCERTO_PRESET_ID })
    const disposer = await registerConcertoPreset(svc, log, EXPECTED_TEMPLATE_DIR, 'T5-STUB')
    // register() itself still resolved (mount failure never rejects)…
    expect(svc.registerCalls).toHaveLength(1)
    expect(typeof disposer).toBe('function')
    // …but the SUCCESS marker must NOT appear and the FAILED marker must.
    expect(logs).not.toContain(formatConcertoRegisteredLine())
    expect(logs.filter((line) => line.startsWith('[omo-agents] concerto preset register FAILED: ')))
      .toHaveLength(1)
    expect(logs[logs.length - 1]).toContain('broken')
  })

  it('MUTATION pair: a quoted "!!js …" template row trips the string-disabled guard', async () => {
    const dir = makeSandbox()
    // Corrupt the template the way the silent failure actually happens: the
    // real tag quoted into a string (Q-2 §4.2 B-case).
    for (const file of CONCERTO_PRESET_FILES) {
      writeFileSync(join(dir, file), readFileSync(join(EXPECTED_TEMPLATE_DIR, file), 'utf8'), 'utf8')
    }
    const tampered = readFileSync(join(dir, 'agent.cordis.yml'), 'utf8')
      .replace(`disabled: !!js process.platform === 'win32'`, `disabled: "!!js process.platform === 'win32'"`)
    expect(tampered).toContain(`disabled: "!!js process.platform === 'win32'"`)
    writeFileSync(join(dir, 'agent.cordis.yml'), tampered, 'utf8')

    const svc = makeV2PresetService()
    const disposer = await registerConcertoPreset(svc, log, dir, 'T5-STUB')
    expect(disposer).toBeUndefined()
    expect(svc.registerCalls).toHaveLength(0)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('STRING disabled')
    expect(logs[0]).toContain('tool-bash')
  })

  it('duplicate id: register rejects loudly, nothing is held, host survives', async () => {
    const svc = makeV2PresetService()
    const first = await registerConcertoPreset(svc, log, EXPECTED_TEMPLATE_DIR, 'T5-STUB')
    expect(typeof first).toBe('function')
    logs.length = 0
    const second = await registerConcertoPreset(svc, log, EXPECTED_TEMPLATE_DIR, 'T5-STUB')
    expect(second).toBeUndefined()
    expect(logs.filter((line) => line.startsWith('[omo-agents] concerto preset register FAILED: ')))
      .toHaveLength(1)
    expect(logs[0]).toContain('Duplicate agent preset')
    expect(logs).not.toContain(formatConcertoRegisteredLine())
  })
})

describe('R-9 structural invariant — omo-agents is NOT a row of what it registers (P4.5-T5)', () => {
  /** Recursive id/name census of a parsed row list (nested groups included). */
  function census(rows: unknown): { ids: string[]; names: string[] } {
    const ids: string[] = []
    const names: string[] = []
    const walk = (list: unknown): void => {
      if (!Array.isArray(list)) return
      for (const row of list) {
        if (typeof row !== 'object' || row === null) continue
        const record = row as { id?: unknown; name?: unknown; group?: unknown; config?: unknown }
        if (typeof record.id === 'string') ids.push(record.id)
        if (typeof record.name === 'string') names.push(record.name)
        if (record.group === true) walk(record.config)
      }
    }
    walk(rows)
    return { ids, names }
  }

  it('the registered composition has NO omo-agents row (deadlock canary)', async () => {
    const rows = await parseCompositionInLoaderDialect(renderConcertoComposition())
    const { ids, names } = census(rows)
    expect(ids.length).toBeGreaterThan(0)
    expect(names.length).toBeGreaterThan(0)
    expect(ids).not.toContain('omo-agents')
    expect(names).not.toContain('@oh-my-opendsh/omo-agents')
    // And the census is not vacuously empty by shape: the delegation group and
    // its nested rows ARE inside it (the walk reaches depth 2+).
    expect(ids).toContain('delegation')
    expect(ids).toContain('tool-subagent-explore')
  })

  it('the plugin itself rides the repo-root cordis.yml host insert row', () => {
    // The other half of the invariant: omo-agents is a HOST row (its own
    // insert), never a row of the preset the plugin registers. REPO_ROOT is
    // two levels up from tests/omo-agents (doctor-lite.mjs:91 same shape).
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const rootCordis = readFileSync(join(repoRoot, 'cordis.yml'), 'utf8')
    expect(rootCordis).toContain('- id: omo-agents')
    expect(rootCordis).toContain(`name: '@oh-my-opendsh/omo-agents'`)
  })
})
