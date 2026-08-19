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
  concertoPresetDir,
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
