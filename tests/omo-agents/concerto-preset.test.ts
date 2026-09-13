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
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONCERTO_PRESET_FILES,
  CONCERTO_PRESET_ID,
  CONCERTO_TEMPLATE_DIR,
  EXPLORE_AGENT_OPTIONS_SENTINEL,
  EXPLORE_PERSONA_SENTINEL,
  agentSentinelName,
  concertoPresetDir,
  renderAgentDenyIntoComposition,
  renderAgentOptionsIntoComposition,
  renderAgentPersonaIntoComposition,
  renderExploreAgentOptionsIntoComposition,
  renderExplorePersonaIntoComposition,
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

  it('gives every row provider spawn + backgroundMode continuable, and the class maxDepth', async () => {
    const { group } = await renderDefault()
    for (const entry of DELEGATION_ENTRIES) {
      const row = toolRow(group, entry.id)
      expect(row.config.provider, entry.id).toBe('spawn')
      expect(row.config.backgroundMode, entry.id).toBe('continuable')
      expect(row.config.maxDepth, entry.id).toBe(entry.class === 'orchestrator' ? 2 : 1)
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
    expect(explore.config.maxDepth).toBe(1)
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
    expect(composition).toContain('maxDepth: 1')
    // F1 fix (2026-09-04) generalized by P2-T15: the rendered deny is the
    // roster-computed read-only class list, not the old inline triple.
    expect(composition).toContain(
      `deny: [${['write', 'edit', ...DELEGATION_ORDER].map((name) => JSON.stringify(name)).join(', ')}]`,
    )
  })
})
