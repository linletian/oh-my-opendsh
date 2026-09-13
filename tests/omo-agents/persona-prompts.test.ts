// P2-T4 — persona-prompts.ts, the roster-driven general persona builder, and
// its zero-drift identity with the T10 explore wrapper (plan §4.2 single
// source / §4.3 porting discipline; phase2-tasks.md P2-T4).
//
// Division of proof with the T10 suite: tests/omo-agents/explore-prompt.test.ts
// stays UNMODIFIED and keeps pinning the byte-level snapshot; this suite proves
// the generalization — roster-driven file resolution, the API-level byte
// identity, the two loud errors (unknown id / conductor), and the two
// structural guards through injected + instrumented section content.
//
// NO MODULE-MOCKING FRAMEWORK is used: the flip-proof and the guard tests drive
// the builder's own injectable sections directory (the T7 loader's `dir`
// parameter), so what runs is the real resolution + assembly path.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  ConductorPersonaError,
  RUNTIME_INJECTED_HEADINGS,
  UnknownAgentPersonaError,
  buildAgentPersona,
  buildAgentPersonaFromText,
  loadAgentPersonaText,
  personaFileFor,
} from '../../patches/omo-dsh/omo-agents/src/persona-prompts'
import {
  EXPLORE_PERSONA_FILE,
  buildExploreSystemPrompt,
  loadExploreSections,
} from '../../patches/omo-dsh/omo-agents/src/explore-prompt'
import {
  CONDUCTOR_ID,
  DELEGATION_ENTRIES,
  ROSTER,
} from '../../patches/omo-dsh/omo-agents/src/roster'
import {
  SYSTEM_SECTIONS_DIR,
  loadSectionFile,
} from '../../patches/omo-dsh/omo-agents/src/system-sections'

/** The checked-in snapshot the T10 suite compares against (read, never written). */
const EXPLORE_SNAPSHOT_PATH = fileURLToPath(
  new URL('__snapshots__/explore-system-prompt.md', import.meta.url),
)

const tempDirs: string[] = []

/** Materials a throwaway sections dir; registered for afterAll cleanup. */
function makeTempSectionsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'omo-persona-prompts-'))
  tempDirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf8')
  }
  return dir
}

/** Runs `fn` and returns the thrown Error (fails loudly if nothing throws). */
function captureError(fn: () => unknown): Error {
  try {
    fn()
  } catch (err) {
    return err as Error
  }
  throw new Error('expected the call to throw, but it returned normally')
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

describe('buildAgentPersona — roster-driven resolution (P2-T4)', () => {
  it('follows the naming double-convention: roster personaFile === <id>-persona.md', () => {
    for (const entry of DELEGATION_ENTRIES) {
      expect(entry.personaFile).toBe(`${entry.id}-persona.md`)
      expect(personaFileFor(entry.id)).toBe(entry.personaFile)
    }
  })

  it('reads exactly the file the roster names (direct assertion against roster.ts)', () => {
    const exploreRow = ROSTER.find((entry) => entry.id === 'explore')
    expect(exploreRow?.personaFile).toBe('explore-persona.md')
    expect(personaFileFor('explore')).toBe(exploreRow!.personaFile)
    // The T7 loader is the read path, against the roster-derived file name.
    expect(loadAgentPersonaText('explore')).toBe(
      loadSectionFile(SYSTEM_SECTIONS_DIR, exploreRow!.personaFile!),
    )
  })

  it('FLIP-PROOF: a per-id roster map, not one hardcoded file name', () => {
    // One temp dir holding one file per delegation row, each named ONLY by the
    // roster's personaFile and each carrying unique content. A module with its
    // own hardcoded file (the pre-P2-T4 shape) would resolve at most the row it
    // hardcoded; the other nine would read a missing file and throw. Passing
    // for all ten is what proves the builder follows roster.ts.
    const files: Record<string, string> = {}
    for (const entry of DELEGATION_ENTRIES) {
      files[entry.personaFile] = `PERSONA-CONTENT-${entry.id}\n`
    }
    const dir = makeTempSectionsDir(files)
    for (const entry of DELEGATION_ENTRIES) {
      expect(loadAgentPersonaText(entry.id, dir)).toBe(`PERSONA-CONTENT-${entry.id}\n`)
      // The builder trims, so the trailing newline of the source is gone.
      expect(buildAgentPersona(entry.id, dir)).toBe(`PERSONA-CONTENT-${entry.id}`)
    }
  })

  it('reports a missing persona file loudly with its absolute path (T7 loader)', () => {
    const dir = makeTempSectionsDir({})
    const error = captureError(() => buildAgentPersona('oracle', dir))
    expect(error.message).toContain('oracle-persona.md')
    expect(error.message).toContain(dir)
  })
})

describe('buildAgentPersona — zero-drift with the T10 explore wrapper (P2-T4)', () => {
  it("buildAgentPersona('explore') equals buildExploreSystemPrompt(), byte for byte", () => {
    const viaGeneralBuilder = buildAgentPersona('explore')
    const viaWrapper = buildExploreSystemPrompt()
    expect(viaGeneralBuilder).toBe(viaWrapper)
    expect(viaGeneralBuilder).toBe(loadExploreSections().explorePersona.trimEnd())
  })

  it('reproduces the checked-in explore snapshot byte-for-byte (read-only compare)', () => {
    // Deliberately a plain read + toBe (not toMatchFileSnapshot): a mismatch
    // must fail loudly without any path that could rewrite the snapshot.
    expect(buildAgentPersona('explore')).toBe(readFileSync(EXPLORE_SNAPSHOT_PATH, 'utf8'))
  })

  it('derives EXPLORE_PERSONA_FILE from the roster (no second copy of the map)', () => {
    expect(EXPLORE_PERSONA_FILE).toBe('explore-persona.md')
    expect(EXPLORE_PERSONA_FILE).toBe(personaFileFor('explore'))
  })

  it('the wrapper still honours injected sections through the general guards', () => {
    expect(buildExploreSystemPrompt({ explorePersona: 'role text\n' }))
      .toBe(buildAgentPersonaFromText('explore', 'role text\n'))
  })
})

describe('buildAgentPersona — loud named errors (P2-T4)', () => {
  it('throws a loud, named error on an unknown id (never an empty prompt)', () => {
    const error = captureError(() => buildAgentPersona('not-an-agent'))
    expect(error).toBeInstanceOf(UnknownAgentPersonaError)
    expect(error.name).toBe('UnknownAgentPersonaError')
    expect(error.message).toContain("unknown agent id 'not-an-agent'")
    // The same lookup is loud for the file-name resolver and the text path.
    expect(() => personaFileFor('nope')).toThrow(UnknownAgentPersonaError)
    expect(() => buildAgentPersonaFromText('nope', 'text')).toThrow(UnknownAgentPersonaError)
  })

  it('throws a named conductor error on sisyphus (separate SISYPHUS_SECTION_ORDER path)', () => {
    const error = captureError(() => buildAgentPersona(CONDUCTOR_ID))
    expect(error).toBeInstanceOf(ConductorPersonaError)
    expect(error.name).toBe('ConductorPersonaError')
    expect(error.message).toContain('SISYPHUS_SECTION_ORDER')
    // Not a persona file: the roster row says so (the §1 总表 `—` cell).
    expect(ROSTER.find((entry) => entry.id === CONDUCTOR_ID)?.personaFile).toBeUndefined()
    // Injected text cannot sneak the conductor through either.
    expect(() => buildAgentPersonaFromText(CONDUCTOR_ID, 'text')).toThrow(ConductorPersonaError)
    expect(() => loadAgentPersonaText(CONDUCTOR_ID)).toThrow(ConductorPersonaError)
  })
})

describe('buildAgentPersona — the two structural guards (P2-T4 / T16 boundary)', () => {
  it('pins the runtime-owned headings it refuses to duplicate', () => {
    expect([...RUNTIME_INJECTED_HEADINGS]).toEqual(['## Hard Blocks', '## Anti-Patterns'])
    // The shipped explore persona is clean (guard b is not a false positive).
    expect(buildAgentPersona('explore')).not.toContain('## Hard Blocks')
    expect(buildAgentPersona('explore')).not.toContain('## Anti-Patterns')
  })

  it('guard a: rejects injected text smuggling a {{ sequence', () => {
    const error = captureError(
      () => buildAgentPersonaFromText('explore', 'read-only {{unknown_var}}'),
    )
    expect(error.message).toMatch(/\{\{/)
    expect(error.message).toContain('explore-persona.md')
    // The hazard (dsh renderPrompt throws on unknown variables) is generic:
    // every roster id is guarded the same way, not just explore.
    expect(() => buildAgentPersonaFromText('oracle', 'advisor {{x}}')).toThrow(/\{\{/)
  })

  it('guard b: rejects injected text carrying a runtime-injected heading', () => {
    expect(() =>
      buildAgentPersonaFromText('explore', 'role text\n\n## Hard Blocks\n\n- Never X'),
    ).toThrow(/Hard Blocks/)
    expect(() =>
      buildAgentPersonaFromText('explore', 'role text\n\n## Anti-Patterns (BLOCKING violations)'),
    ).toThrow(/Anti-Patterns/)
    // Generic across ids, not an explore-only check.
    expect(() => buildAgentPersonaFromText('plan-reviewer', '## Hard Blocks')).toThrow(/Hard Blocks/)
  })

  it('both guards also fire on the builder path through a real instrumented file', () => {
    const dir = makeTempSectionsDir({
      [personaFileFor('explore')]: 'read-only {{unknown_var}}',
    })
    expect(() => buildAgentPersona('explore', dir)).toThrow(/\{\{/)

    const hardBlocksDir = makeTempSectionsDir({
      [personaFileFor('explore')]: 'role text\n\n## Hard Blocks\n',
    })
    expect(() => buildAgentPersona('explore', hardBlocksDir)).toThrow(/Hard Blocks/)

    const antiPatternsDir = makeTempSectionsDir({
      [personaFileFor('explore')]: 'role text\n\n## Anti-Patterns (BLOCKING violations)',
    })
    expect(() => buildAgentPersona('explore', antiPatternsDir)).toThrow(/Anti-Patterns/)
  })
})
