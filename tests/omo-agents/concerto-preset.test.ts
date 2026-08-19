// T6 — concerto preset sync module (TDD: written BEFORE the module existed;
// first run must fail on the unresolved import).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  concertoPresetDir,
  renderExploreAgentOptionsIntoComposition,
  renderExplorePersonaIntoComposition,
  resolveDshHome,
  syncConcertoPreset,
} from '../../patches/omo-dsh/omo-agents/src/concerto-preset'

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
    // template exactly in the persona value.
    expect(readFileSync(join(target, 'preset.yml'), 'utf8')).toBe(
      readFileSync(join(EXPECTED_TEMPLATE_DIR, 'preset.yml'), 'utf8'),
    )
    const composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(composition).not.toContain('__OMO_SISYPHUS_SYSTEM_PROMPT__')
    expect(composition).toContain('# Orchestrator Role')
    expect(composition).toContain('# Delegation Discipline')
    expect(composition).toContain('## Hard Blocks')
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
})

describe('omo-agents explore delegation binding (T11, form A static config)', () => {
  const EXPLORE_MARKER = 'T11-EXPLORE-PERSONA-MARKER\nsecond line of the injected explore persona'

  it('the template mounts exactly one explore tool-subagent row carrying both sentinels', () => {
    const template = readFileSync(join(EXPECTED_TEMPLATE_DIR, 'agent.cordis.yml'), 'utf8')
    expect(template.split('- id: tool-subagent-explore').length - 1).toBe(1)
    expect(template.split('toolName: explore').length - 1).toBe(1)
    // The generic spawn/fork instances keep their own toolNames — no collision.
    expect(template).toContain('toolName: subagent\n')
    expect(template).toContain('toolName: subagent_fork')
    expect(template.split(`persona: ${EXPLORE_PERSONA_SENTINEL}`).length - 1).toBe(1)
    expect(template.split(`agentOptions: ${EXPLORE_AGENT_OPTIONS_SENTINEL}`).length - 1).toBe(1)
    // The T8 sentinel path stays intact alongside them.
    expect(template.split('text: __OMO_SISYPHUS_SYSTEM_PROMPT__').length - 1).toBe(1)
  })

  it('sync renders the explore persona sentinel into a |- block scalar inside the explore row', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target, EXPECTED_TEMPLATE_DIR, 'SISYPHUS-STUB', EXPLORE_MARKER)).toBe('materialized')
    const composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(composition).not.toContain(EXPLORE_PERSONA_SENTINEL)
    expect(composition).not.toContain(EXPLORE_AGENT_OPTIONS_SENTINEL)
    expect(composition).not.toContain('__OMO_SISYPHUS_SYSTEM_PROMPT__')
    // The explore persona lands as a block scalar at the row's config indent
    // (persona key at 8 spaces inside the delegation group → content at 10).
    expect(composition).toContain('        persona: |-\n')
    expect(composition).toContain('          T11-EXPLORE-PERSONA-MARKER\n')
    expect(composition).toContain('          second line of the injected explore persona\n')
  })

  it('sync renders agentOptions from the injected explore route (YAML-safe quoted scalars)', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    syncConcertoPreset(
      target,
      EXPECTED_TEMPLATE_DIR,
      'SISYPHUS-STUB',
      'EXPLORE-STUB',
      { provider: 'deepseek', model: 'deepseek-v4-flash' },
    )
    const composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(composition).toContain('        agentOptions:\n')
    expect(composition).toContain('          provider: "deepseek"\n')
    expect(composition).toContain('          model: "deepseek-v4-flash"\n')
  })

  it('renders route values JSON-quoted so YAML-hostile characters cannot break the composition', () => {
    const rendered = renderExploreAgentOptionsIntoComposition(
      `agentOptions: ${EXPLORE_AGENT_OPTIONS_SENTINEL}`,
      { provider: 'deep"seek', model: 'x: y # z' },
    )
    expect(rendered).toContain(`provider: ${JSON.stringify('deep"seek')}`)
    expect(rendered).toContain(`model: ${JSON.stringify('x: y # z')}`)
    expect(rendered).not.toContain(EXPLORE_AGENT_OPTIONS_SENTINEL)
  })

  it('the rendered explore row survives sync idempotence (second sync is a no-op)', () => {
    const target = join(makeSandbox(), '.agent-presets', 'concerto')
    expect(syncConcertoPreset(target, EXPECTED_TEMPLATE_DIR, 'SISYPHUS-STUB', EXPLORE_MARKER)).toBe('materialized')
    const first = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(first).toContain('          T11-EXPLORE-PERSONA-MARKER\n')
    expect(syncConcertoPreset(target, EXPECTED_TEMPLATE_DIR, 'SISYPHUS-STUB', EXPLORE_MARKER)).toBe('unchanged')
    expect(readFileSync(join(target, 'agent.cordis.yml'), 'utf8')).toBe(first)
  })

  it('each renderer throws when its sentinel does not occur exactly once', () => {
    expect(() => renderExplorePersonaIntoComposition('no sentinel here', 'x')).toThrow(/exactly once/)
    expect(() => renderExploreAgentOptionsIntoComposition('no sentinel here', { provider: 'p', model: 'm' })).toThrow(/exactly once/)
    const doubled = `persona: ${EXPLORE_PERSONA_SENTINEL}\npersona: ${EXPLORE_PERSONA_SENTINEL}`
    expect(() => renderExplorePersonaIntoComposition(doubled, 'x')).toThrow(/exactly once/)
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
    expect(composition).toContain('deny: [write, edit]')
  })
})
