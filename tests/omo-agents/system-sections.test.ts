// T7 — system-sections markdown + loader (TDD: written BEFORE the loader
// existed; first run must fail on the unresolved import).
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SYSTEM_SECTIONS_DIR,
  loadSectionFile,
  loadSystemSections,
} from '../../patches/omo-dsh/omo-agents/src/system-sections'

// Independently computed expectation (not taken from the module) so the
// test proves the loader's import.meta.url resolution, not its own input.
const EXPECTED_SECTIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'patches',
  'omo-dsh',
  'omo-agents',
  'system-sections',
)

const FIXED_ORDER = ['role', 'delegationDiscipline', 'hardBlocks', 'antiPatterns'] as const

describe('omo-agents system-sections loader (T7)', () => {
  it('resolves SYSTEM_SECTIONS_DIR from import.meta.url to the expected absolute path', () => {
    expect(SYSTEM_SECTIONS_DIR).toBe(EXPECTED_SECTIONS_DIR)
    expect(SYSTEM_SECTIONS_DIR.startsWith('/')).toBe(true)
  })

  it('loads all 4 sections and each is non-empty', () => {
    const sections = loadSystemSections()
    for (const key of FIXED_ORDER) {
      expect(sections[key].trim().length).toBeGreaterThan(0)
    }
  })

  it('returns sections in the fixed order [role, delegationDiscipline, hardBlocks, antiPatterns]', () => {
    const sections = loadSystemSections()
    expect(Object.keys(sections)).toEqual([...FIXED_ORDER])
  })

  it('role.md describes the orchestrator as conductor-not-worker whose default action is to delegate', () => {
    const { role } = loadSystemSections()
    expect(role.toLowerCase()).toContain('conductor')
    expect(role.toLowerCase()).toContain('delegate')
  })

  it('delegation-discipline.md mandates judge-then-delegate and forbids self-retrieval', () => {
    const { delegationDiscipline } = loadSystemSections()
    expect(delegationDiscipline.toLowerCase()).toContain('delegate')
    expect(delegationDiscipline.toLowerCase()).toContain('retrieval')
  })

  it('hard-blocks.md keeps the `## Hard Blocks` heading and at least one `**Never**` line', () => {
    const { hardBlocks } = loadSystemSections()
    expect(hardBlocks).toContain('## Hard Blocks')
    const neverLines = hardBlocks.split('\n').filter((line) => line.includes('**Never**'))
    expect(neverLines.length).toBeGreaterThanOrEqual(1)
  })

  it('anti-patterns.md keeps the `## Anti-Patterns (BLOCKING violations)` heading (softer wording gradient)', () => {
    const { antiPatterns } = loadSystemSections()
    expect(antiPatterns).toContain('## Anti-Patterns (BLOCKING violations)')
  })

  it('loadSectionFile: missing file -> error message contains the missing absolute path', () => {
    const missing = join(EXPECTED_SECTIONS_DIR, 'missing-file.md')
    try {
      loadSectionFile(EXPECTED_SECTIONS_DIR, 'missing-file.md')
      expect.unreachable('expected loadSectionFile to throw for a missing file')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toContain(missing)
    }
  })

  it('loadSystemSections: missing dir -> error message contains the missing absolute path', () => {
    const bogusDir = join(EXPECTED_SECTIONS_DIR, 'does-not-exist')
    const missing = join(bogusDir, 'role.md')
    try {
      loadSystemSections(bogusDir)
      expect.unreachable('expected loadSystemSections to throw for a missing dir')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toContain(missing)
    }
  })
})
