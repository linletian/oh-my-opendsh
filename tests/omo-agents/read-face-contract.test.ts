// tests/omo-agents/read-face-contract.test.ts — the executable contract of
// scripts/assert-concerto-read-face.mjs, the read-face validator shared by
// scripts/concerto-mode-probe.sh (gate 8 FACE B) and tests/e2e/drive.mjs
// (gate 3). WP2 MAJOR-1 and MINOR-1 both lived in this file's behaviour, and
// neither was covered by a test that could run on this machine: MAJOR-1 only
// fires on a 0.1.5-style FILE-supplied `agentPresets/read`, and MINOR-1 is an
// ABSENCE assertion that never existed. Both are reproduced here from crafted
// inputs, so the fix is re-runnable at gate 2 instead of only in a CI job
// nobody can run locally.
//
// Every expectation below is DERIVED from src/roster.ts (the same single source
// both consumers use) or stated as an explicit mutation of it. Nothing here
// restates a deny list by hand.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DELEGATION_ENTRIES,
  allowToolNamesFor,
  denyToolNamesFor,
} from '../../patches/omo-dsh/omo-agents/src/roster.ts'

const REPO_ROOT = dirname(dirname(dirname(realpathSync(new URL(import.meta.url).pathname))))
const VALIDATOR = join(REPO_ROOT, 'scripts', 'assert-concerto-read-face.mjs')
const EXPLORE_PROVIDER = 'deepseek'
const EXPLORE_MODEL = 'deepseek-v4-flash'
// The two platform-gated rows the real face carries. The validator demands the
// count come from OUTSIDE the bytes under assertion, so the test states it the
// same way the probe and drive do.
const EXPECTED_JS_GATES = 2

/**
 * js-yaml for the INSTALLED dsh — the validator loads it from <nm> so it
 * parses in the host's dialect. Mirrors tests/e2e/drive.mjs
 * `resolveDshNodeModules` (realpath first: `command -v dsh` answers the
 * symlink, and a `bin/node_modules` layout does not exist for a global
 * install). It throws rather than letting a test pass without parsing.
 */
function resolveDshNodeModules(): string {
  const which = spawnSync('sh', ['-c', 'command -v dsh'], { encoding: 'utf8' })
  const candidates: string[] = []
  if (which.status === 0 && which.stdout.trim() !== '') {
    let dir = dirname(realpathSync(which.stdout.trim()))
    for (let hop = 0; hop < 8; hop += 1) {
      candidates.push(join(dir, 'node_modules'))
      if (existsSync(join(dir, 'node_modules', 'js-yaml', 'dist', 'js-yaml.mjs'))) {
        return join(dir, 'node_modules')
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  throw new Error(
    `no installed-dsh js-yaml for the read-face contract test; tried ${JSON.stringify(candidates)} — `
      + 'the validator parses in the host dialect, so a stand-in parser would test nothing',
  )
}

type RowSpec = {
  id: string
  // readonly, because that is what the roster hands out — widening it here
  // would let a mutation rewrite the roster's own list in place.
  deny: readonly string[] | null
  allow: readonly string[] | null
  maxDepth: number
}

/** The roster's own expectation set, derived — never transcribed. */
function rosterRows(): RowSpec[] {
  return DELEGATION_ENTRIES.map((entry) => ({
    id: entry.id,
    deny: denyToolNamesFor(entry) ?? null,
    allow: allowToolNamesFor(entry) ?? null,
    maxDepth: entry.maxDepth as number,
  }))
}

/**
 * A minimal composition in the shape of a real `agentPresets/read` `content`:
 * block scalars at the same indents the host dumps, delegation rows nested in
 * a group, the two platform-gated `!!js` rows at top level.
 */
function buildFace(rows: RowSpec[]): string {
  const lines: string[] = [
    '- id: conductor',
    "  name: '@fake/dsh-conductor'",
    '  config:',
    '    prefix: |-',
    '      # Orchestrator Role',
    '      # Delegation Discipline',
    '      ## Hard Blocks',
    '- id: delegation-group',
    "  name: '@fake/dsh-group'",
    '  config:',
  ]
  for (const row of rows) {
    lines.push(`    - id: tool-subagent-${row.id}`)
    lines.push("      name: '@fake/dsh-tool-subagent'")
    lines.push('      config:')
    lines.push('        provider: spawn')
    lines.push(`        toolName: ${row.id}`)
    if (row.id === 'explore') {
      lines.push('        agentOptions:')
      lines.push(`          provider: ${EXPLORE_PROVIDER}`)
      lines.push(`          model: ${EXPLORE_MODEL}`)
    }
    lines.push('        persona: |-')
    lines.push(`          ${row.id} persona body`)
    if (row.id === 'explore') lines.push('          # Explore: Read-Only Retrieval Agent')
    if (row.deny !== null || row.allow !== null) {
      lines.push('        toolFilter:')
      if (row.deny !== null) {
        lines.push('          deny:')
        for (const name of row.deny) lines.push(`            - ${name}`)
      }
      if (row.allow !== null) {
        lines.push('          allow:')
        for (const name of row.allow) lines.push(`            - ${name}`)
      }
    }
    lines.push(`        maxDepth: ${row.maxDepth}`)
  }
  lines.push('- id: tool-bash')
  lines.push("  name: '@fake/dsh-tool-bash'")
  lines.push('  disabled: !!js process.platform === \'win32\'')
  lines.push('- id: tool-pwsh')
  lines.push("  name: '@fake/dsh-tool-pwsh'")
  lines.push('  disabled: !!js process.platform !== \'win32\'')
  return `${lines.join('\n')}\n`
}

type Edit = { row: string; key: string; after: unknown }

function runValidator(content: string, sandboxEdits: Edit[] | undefined): { status: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'read-face-contract-'))
  const contentPath = join(dir, 'content.yml')
  const expectPath = join(dir, 'expectations.json')
  writeFileSync(contentPath, content)
  const expectations: Record<string, unknown> = {
    rows: rosterRows(),
    uniformMaxDepth: DELEGATION_ENTRIES[0]?.maxDepth,
  }
  if (sandboxEdits !== undefined) expectations.sandboxEdits = sandboxEdits
  writeFileSync(expectPath, JSON.stringify(expectations, null, 2))
  const result = spawnSync(
    process.execPath,
    [VALIDATOR, NM_DIR, contentPath, expectPath, EXPLORE_PROVIDER, EXPLORE_MODEL, String(EXPECTED_JS_GATES)],
    { encoding: 'utf8', timeout: 60_000 },
  )
  rmSync(dir, { recursive: true, force: true })
  return { status: result.status ?? -1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

let NM_DIR = ''
let pristine = ''

beforeAll(() => {
  NM_DIR = resolveDshNodeModules()
  pristine = buildFace(rosterRows())
  // Non-vacuity of the fixture itself: the generator has to really produce the
  // anchors the validator pins, or every 'green' below is an artefact.
  expect(pristine).toContain('    prefix: |-')
  expect(pristine).toContain('        persona: |-')
  expect(pristine.split('\n').filter((l) => l.includes('!!js ')).length).toBe(EXPECTED_JS_GATES)
})

// The describe titles below deliberately do NOT repeat the validator's path:
// verify-concerto-static.mjs c23 treats every non-comment mention of that path
// as either a classified invocation or a path binding, and a prose title is
// neither — it must not be able to hide among them.
describe('the read-face validator — the roster comparison is real', () => {
  it('passes a pristine, unedited face and reports every comparison it made', () => {
    const { status, out } = runValidator(pristine, [])
    expect(out).toContain('READ-FACE PASS')
    expect(status).toBe(0)
    // 10 rows x 4 compared keys, counted by the validator itself.
    expect(out).toContain(`${rosterRows().length * 4} row-key comparisons`)
  })

  it('REJECTS an expectations file that omits sandboxEdits (the contract is explicit)', () => {
    const { status, out } = runValidator(pristine, undefined)
    expect(status).toBe(1)
    expect(out).toContain('no `sandboxEdits` array')
  })

  it('fails when a deny list degrades by ONE element — the comparison is element-wise', () => {
    const rows = rosterRows().map((row) => (row.id === 'librarian' && row.deny !== null
      ? { ...row, deny: row.deny.slice(0, row.deny.length - 1) }
      : row))
    const { status, out } = runValidator(buildFace(rows), [])
    expect(status).toBe(1)
    expect(out).toContain('librarian.toolFilter.deny')
  })

  it('fails when a deny list is REORDERED, not just when it is shortened', () => {
    const rows = rosterRows().map((row) => (row.id === 'oracle' && row.deny !== null
      ? { ...row, deny: [...row.deny].reverse() }
      : row))
    const { status, out } = runValidator(buildFace(rows), [])
    expect(status).toBe(1)
    expect(out).toContain('oracle.toolFilter.deny')
  })
})

describe('MINOR-1 — a null roster expectation now asserts ABSENCE', () => {
  it('fails when the orchestrator row (atlas) grows a deny list the roster does not declare', () => {
    const atlas = rosterRows().find((row) => row.id === 'atlas')
    expect(atlas?.deny).toBeNull() // derived precondition, not a belief
    const lines = pristine.split('\n')
    const anchor = lines.findIndex((line) => line === '    - id: tool-subagent-atlas')
    const injectAt = lines.findIndex((line, index) => index > anchor && line === '        maxDepth: 2')
    expect(injectAt).toBeGreaterThan(anchor)
    lines.splice(injectAt, 0, '        toolFilter:', '          deny:', '            - read')
    const { status, out } = runValidator(lines.join('\n'), [])
    expect(status).toBe(1)
    expect(out).toContain('atlas.toolFilter.deny = ["read"]')
    expect(out).toContain('must be ABSENT')
  })

  it('fails when the allowlist row (multimodal-looker) grows an extra allow name', () => {
    const looker = rosterRows().find((row) => row.id === 'multimodal-looker')
    expect(looker?.allow).not.toBeNull() // it is the allowlist class
    const lines = pristine.split('\n')
    const anchor = lines.findIndex((line) => line === '    - id: tool-subagent-multimodal-looker')
    const injectAt = lines.findIndex((line, index) => index > anchor && line === '          allow:')
    expect(injectAt).toBeGreaterThan(anchor)
    lines.splice(injectAt + 1, 0, '            - write')
    const { status, out } = runValidator(lines.join('\n'), [])
    // Adding a name changes the list element-wise; the roster's own list must
    // still match exactly, in order, count included.
    expect(status).toBe(1)
    expect(out).toContain('multimodal-looker.toolFilter.allow')
  })

  it('fails when the orchestrator row grows an allow list (roster declares none)', () => {
    const lines = pristine.split('\n')
    const anchor = lines.findIndex((line) => line === '    - id: tool-subagent-atlas')
    const maxDepthAt = lines.findIndex((line, index) => index > anchor && line === '        maxDepth: 2')
    lines.splice(maxDepthAt, 0, '        toolFilter:', '          allow:', '            - read')
    const { status, out } = runValidator(lines.join("\n"), [])
    expect(status).toBe(1)
    expect(out).toContain('atlas.toolFilter.allow = ["read"]')
  })
})

describe('MAJOR-1 — a scenario-declared sandbox edit, both runtimes', () => {
  // The exact shape of the gate-3 red on dsh 0.1.5: the prometheus scenario
  // lifts `toolFilter` from ITS OWN materialized copy, and 0.1.5 serves the
  // read face from that file. Lazy on purpose — `pristine` is filled in
  // beforeAll, and a module-scope computation lifted an EMPTY string and
  // certified nothing (the first draft of this test failed exactly there).
  const liftToolFilter = (text: string, rowId: string): string => {
    const lines = text.split('\n')
    const anchor = lines.findIndex((line) => line === `    - id: tool-subagent-${rowId}`)
    expect(anchor).toBeGreaterThanOrEqual(0)
    const filterAt = lines.findIndex((line, index) => index > anchor && line === '        toolFilter:')
    expect(filterAt).toBeGreaterThan(anchor)
    let end = filterAt + 1
    while (/^\s{10,}/.test(lines[end])) end += 1
    lines.splice(filterAt, end - filterAt)
    const lifted = lines.join('\n')
    expect(lifted.split('\n').filter((line) => line === '        toolFilter:').length).toBe(
      pristine.split('\n').filter((line) => line === '        toolFilter:').length - 1,
    )
    return lifted
  }

  it('is RED when the face lost toolFilter and the scenario declared nothing', () => {
    const { status, out } = runValidator(liftToolFilter(pristine, 'prometheus'), [])
    expect(status).toBe(1)
    expect(out).toContain('prometheus.toolFilter.deny = <absent>')
    expect(out).toContain('none declared')
  })

  it('is GREEN on a FILE-supplied face when the scenario declares the lift', () => {
    const { status, out } = runValidator(liftToolFilter(pristine, 'prometheus'), [{ row: 'prometheus', key: 'toolFilter.deny', after: null }])
    expect(status).toBe(0)
    expect(out).toContain('1 of them resolved against a DECLARED sandbox edit [prometheus.toolFilter.deny=<absent>]')
    expect(out).toContain('FILE-supplied')
  })

  it('is GREEN on a register()-supplied face too — the roster value still matches', () => {
    const { status, out } = runValidator(pristine, [{ row: 'prometheus', key: 'toolFilter.deny', after: null }])
    expect(status).toBe(0)
    expect(out).toContain('0 of them resolved against a DECLARED sandbox edit')
    expect(out).toContain('declared edits invisible here [prometheus.toolFilter.deny]')
  })

  it('refuses a CONTAINER declaration — one `after` may not exempt a whole subtree', () => {
    // review B attack 2 / review A A1j: `key: 'toolFilter'` used to be legal
    // and exempted toolFilter.deny AND toolFilter.allow from one value. It is
    // now outside the vocabulary, and the run must STILL compare the cell it
    // tried to exempt — two facts, asserted together.
    const { status, out } = runValidator(liftToolFilter(pristine, 'prometheus'), [{ row: 'prometheus', key: 'toolFilter', after: null }])
    expect(status).toBe(1)
    expect(out).toContain('outside this validator\'s declaration vocabulary')
    expect(out).toContain('prometheus.toolFilter.deny = <absent> matches NEITHER')
  })

  it('is RED when the declared post-edit value is NOT what the face carries', () => {
    // Face: toolFilter lifted (ABSENT). Declared post-edit value: ['write'].
    // Accepted set is {roster list, ["write"]} — the face matches neither, so
    // the two-value set is not a blanket pass.
    const { status, out } = runValidator(liftToolFilter(pristine, 'prometheus'), [{ row: 'prometheus', key: 'toolFilter.deny', after: ['write'] }])
    expect(status).toBe(1)
    expect(out).toContain('prometheus.toolFilter.deny = <absent>')
    expect(out).toContain('["write"]')
  })

  it('is GREEN when the declared post-edit value is what the face carries', () => {
    const rows = rosterRows().map((row) => (row.id === 'prometheus' ? { ...row, deny: ['write'] } : row))
    const { status, out } = runValidator(buildFace(rows), [{ row: 'prometheus', key: 'toolFilter.deny', after: ['write'] }])
    expect(status).toBe(0)
    expect(out).toContain('prometheus.toolFilter.deny=["write"]')
  })

  it('refuses a declaration naming a row that is not in the roster (vacuous)', () => {
    const { status, out } = runValidator(pristine, [{ row: 'not-a-roster-row', key: 'toolFilter.deny', after: null }])
    expect(status).toBe(1)
    expect(out).toContain('not a roster delegation row')
  })

  it('refuses a declaration naming a key nobody compares (junk)', () => {
    const { status, out } = runValidator(pristine, [{ row: 'prometheus', key: 'toolFilter.nope', after: null }])
    expect(status).toBe(1)
    expect(out).toContain('outside this validator')
  })

  it('refuses a declaration that changes nothing versus the roster (anti-vacuous)', () => {
    const prometheus = rosterRows().find((row) => row.id === 'prometheus')
    const { status, out } = runValidator(pristine, [{ row: 'prometheus', key: 'toolFilter.deny', after: prometheus?.deny ?? null }])
    expect(status).toBe(1)
    expect(out).toContain('IDENTICAL to the roster expectation')
  })

  it('records an edit on a key it does not compare, and says so instead of claiming coverage', () => {
    const { status, out } = runValidator(pristine, [{ row: 'explore', key: 'backgroundMode', after: 'one-shot' }])
    expect(status).toBe(0)
    expect(out).toContain('asserted by nothing here [explore.backgroundMode→"one-shot"]')
  })

  it('catches a degraded deny list EVEN WHEN another row carries a declared edit', () => {
    // The declared edit must not become a blanket pass for the whole face.
    const rows = rosterRows().map((row) => (row.id === 'atlas' && row.deny === null
      ? { ...row, deny: ['write'] }
      : row))
    const { status, out } = runValidator(buildFace(rows), [{ row: 'prometheus', key: 'toolFilter.deny', after: null }])
    expect(status).toBe(1)
    expect(out).toContain('atlas.toolFilter.deny = ["write"]')
  })

  it('exempts the declared CELL only, not the rest of the declared row', () => {
    // Same row, different cell: the declaration covers toolFilter.deny, so a
    // row that also lost its maxDepth must still fail on maxDepth. This is the
    // per-cell property a container declaration would have destroyed.
    const lifted = liftToolFilter(pristine, 'prometheus').split('\n')
    const depthAt = lifted.findIndex((line, index) => index > lifted.indexOf('    - id: tool-subagent-prometheus') && line === '        maxDepth: 2')
    expect(depthAt).toBeGreaterThan(0)
    lifted.splice(depthAt, 1)
    const { status, out } = runValidator(lifted.join('\n'), [{ row: 'prometheus', key: 'toolFilter.deny', after: null }])
    expect(status).toBe(1)
    expect(out).toContain('prometheus.maxDepth = <absent>')
  })
})
