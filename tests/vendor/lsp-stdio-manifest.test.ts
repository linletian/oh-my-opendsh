// tests/vendor/lsp-stdio-manifest.test.ts — P6-T4 consistency unit for the
// two Phase 6 vendored packages (lsp-core + mcp-stdio-core).
//
// Why each pin is a real failure mode and not a restatement of the manifest:
//
//   1. drift (both packages, both directions) — delegates to
//      scripts/vendor-manifest.mjs; a hand edit to a vendored byte, a file
//      silently dropped from the manifest, or a manifest entry with no file
//      all RED here.
//   2. mirror — the THIRD_PARTY_NOTICES.md tables (P6-1.. and P6S-1..) are
//      re-parsed with the SAME mechanics gate 6 c28 applies to team-core:
//      contiguous row numbering, closed origin vocabulary (an unmapped token
//      FAILs, never skips), row↔manifest cross-check in both directions,
//      origin-for-origin. c28 itself stays team-core-scoped (37 assertions,
//      FORKS.md §5.2 — no new package assertions under the (L-B) narrowing);
//      this file is the gate-2 counterpart for the two new tables.
//   3. the ruled file-set face — lsp-core carries ZERO *.test.ts bytes
//      (the 21 bun:test suites are excluded per FORKS.md §2.6) while
//      mcp-stdio-core carries EXACTLY transport.test.ts and NOT
//      server.test.ts (the jest-fake-timers exclusion, measured rationale in
//      the package NOTICE). The exclusion is a file-set claim; a claim about
//      bytes must be checked against bytes.
//   4. cli.ts project-new face — exists, carries the MIT attribution to
//      @code-yeongyu/lsp-tools-mcp, and imports ONLY relative .ts
//      specifiers (no package-name imports, no extensionless ones) — the
//      entry the cordis.yml omo-lsp row boots.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkVendorPackage, listFiles } from '../../scripts/vendor-manifest.mjs'

const REPO = resolve(import.meta.dirname, '../..')
const LSP = join(REPO, 'patches/omo-dsh/vendor/lsp-core')
const STDIO = join(REPO, 'patches/omo-dsh/vendor/mcp-stdio-core')

const NOTICES = readFileSync(join(REPO, 'THIRD_PARTY_NOTICES.md'), 'utf8')

// The closed vocabulary, same table c28 uses.
const ORIGIN_TOKENS = new Map([
  ['verbatim', 'verbatim'],
  ['已修改', 'modified'],
  ['本项目新增', 'project-new'],
])

type ManifestRow = { path: string; sha256: string | null; origin: string }

function manifest(pkg: string): { files: ManifestRow[]; counts: Record<string, number>; deviations: Array<{ class: string; kind: string; path: string }> } {
  return JSON.parse(readFileSync(join(pkg, 'VENDOR-MANIFEST.json'), 'utf8'))
}

/** Parse one notices table, mirroring the c28 row grammar. */
function noticesRows(prefix: string, heading: string) {
  const headingAt = NOTICES.indexOf(heading)
  expect(headingAt, `THIRD_PARTY_NOTICES.md carries no section: ${heading}`).toBeGreaterThan(-1)
  const rest = NOTICES.slice(headingAt + heading.length)
  const next = rest.search(/^###? /m)
  const section = next < 0 ? rest : rest.slice(0, next)
  return [...section.matchAll(new RegExp(`^\\| ${prefix}-(\\d+) \\| \`([^\`]+)\` \\| \`([^\`]+)\` \\|`, 'gm'))]
    .map((m) => ({ n: Number(m[1]), path: m[2], token: m[3] }))
}

function mirrorTable(prefix: string, heading: string, pkgDir: string) {
  const rows = noticesRows(prefix, heading)
  expect(rows.length, 'the notices table parsed 0 rows — the mirror would be vacuous').toBeGreaterThan(0)
  for (let i = 0; i < rows.length; i++) {
    expect(rows[i]!.n, `row numbering breaks at position ${i + 1}`).toBe(i + 1)
  }
  const m = manifest(pkgDir)
  const originByPath = new Map<string, string>()
  for (const f of m.files as ManifestRow[]) {
    expect(originByPath.has(f.path), `duplicate manifest row ${f.path}`).toBe(false)
    originByPath.set(f.path, f.origin)
  }
  const seen = new Set<string>()
  for (const row of rows) {
    expect(seen.has(row.path), `notices lists ${row.path} twice`).toBe(false)
    seen.add(row.path)
    const mapped = ORIGIN_TOKENS.get(row.token)
    expect(mapped, `${prefix}-${row.n} (${row.path}) token ${row.token} is outside the closed vocabulary`).toBeDefined()
    expect(originByPath.has(row.path), `${prefix}-${row.n} lists ${row.path}, the manifest does not register it`).toBe(true)
    expect(mapped, 'mapping invariant').toBe(originByPath.get(row.path))
  }
  for (const f of m.files as ManifestRow[]) {
    expect(seen.has(f.path), `manifest registers ${f.path}, the notices table has no row for it`).toBe(true)
  }
  return { rows, manifest: m }
}

describe('P6-T4 lsp-core: drift + notices mirror (P6-n table)', () => {
  const report = checkVendorPackage(LSP)

  it('no drift, no untracked, no missing (71 files)', () => {
    expect(report.drift).toEqual([])
    expect(report.missing).toEqual([])
    expect(report.untracked).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('the P6 table mirrors the manifest row-for-row, origin-for-origin', () => {
    const { rows, manifest: m } = mirrorTable('P6', '### Phase 6 vendored package: `@oh-my-opencode/lsp-core`', LSP)
    expect(rows.length).toBe(m.files.length)
    expect(m.counts.total).toBe(71)
    expect(m.counts.verbatim).toBe(9)
    expect(m.counts.modified).toBe(59)
    expect(m.counts.projectNew).toBe(3)
    // prose tally re-derived from the table itself (the c28 discipline)
    const derived = rows.reduce((a, r) => { a[ORIGIN_TOKENS.get(r.token)!] += 1; return a }, { verbatim: 0, modified: 0, 'project-new': 0 } as Record<string, number>)
    expect(derived).toEqual({ verbatim: 9, modified: 59, 'project-new': 3 })
    const section = NOTICES.slice(NOTICES.indexOf('### Phase 6 vendored package: `@oh-my-opencode/lsp-core`'))
    expect(section.slice(0, section.indexOf('### Phase 6 vendored package: `@oh-my-opencode/mcp-stdio-core`'))).toContain('**71 files**')
  })

  it('the ruled exclusion face: zero *.test.ts bytes under the vendored copy', () => {
    const tests = listFiles(LSP).filter((f) => f.endsWith('.test.ts'))
    expect(tests).toEqual([])
  })

  it('AGENTS.md is not carried (both packages)', () => {
    expect(listFiles(LSP).filter((f) => f === 'AGENTS.md')).toEqual([])
    expect(listFiles(STDIO).filter((f) => f === 'AGENTS.md')).toEqual([])
  })

  it('cli.ts is project-new, attributed to the MIT reference, relative imports only', () => {
    const cli = readFileSync(join(LSP, 'src/cli.ts'), 'utf8')
    expect(cli).toContain('@code-yeongyu/lsp-tools-mcp')
    expect(cli).toContain('project-new')
    const specifiers = [...cli.matchAll(/from "([^"]+)"/g)].map((m) => m[1]!)
    expect(specifiers.length).toBeGreaterThan(0)
    for (const s of specifiers) {
      // node: builtins are allowed; everything else must be a relative .ts that resolves
      if (s.startsWith('node:')) continue
      expect(s.startsWith('./'), `cli.ts specifier ${s} must be relative`).toBe(true)
      expect(s.endsWith('.ts'), `cli.ts specifier ${s} must carry .ts`).toBe(true)
      expect(existsSync(join(LSP, 'src', s)), `cli.ts specifier ${s} does not resolve`).toBe(true)
    }
  })

  it('the modern-era deviation is registered in deviations[] exactly once (src/mcp.ts)', () => {
    const m = manifest(LSP)
    const modern = m.deviations.filter((d) => d.kind === 'modern-era-fields')
    expect(modern.length).toBe(1)
    expect(modern[0]!.path).toBe('src/mcp.ts')
  })
})

describe('P6-T4 mcp-stdio-core: drift + notices mirror (P6S-n table) + test exclusion', () => {
  const report = checkVendorPackage(STDIO)

  it('no drift, no untracked, no missing (11 files)', () => {
    expect(report.drift).toEqual([])
    expect(report.missing).toEqual([])
    expect(report.untracked).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('the P6S table mirrors the manifest row-for-row, origin-for-origin', () => {
    const { rows, manifest: m } = mirrorTable('P6S', '### Phase 6 vendored package: `@oh-my-opencode/mcp-stdio-core`', STDIO)
    expect(rows.length).toBe(m.files.length)
    expect(m.counts.total).toBe(11)
    expect(m.counts.verbatim).toBe(3)
    expect(m.counts.modified).toBe(6)
    expect(m.counts.projectNew).toBe(2)
    const derived = rows.reduce((a, r) => { a[ORIGIN_TOKENS.get(r.token)!] += 1; return a }, { verbatim: 0, modified: 0, 'project-new': 0 } as Record<string, number>)
    expect(derived).toEqual({ verbatim: 3, modified: 6, 'project-new': 2 })
  })

  it('transport.test.ts carried, server.test.ts NOT carried (bytes match the ruling)', () => {
    const tests = listFiles(STDIO).filter((f) => f.endsWith('.test.ts'))
    expect(tests).toEqual(['src/transport.test.ts'])
    expect(existsSync(join(STDIO, 'src/server.test.ts'))).toBe(false)
    const m = manifest(STDIO)
    expect(m.files.map((f) => f.path)).toContain('src/transport.test.ts')
    expect(m.counts.carriedTestFiles).toBe(1)
    // the carried test passes with UNMODIFIED semantics (its bun:test API
    // surface is describe/expect/test only); its file bytes carry the
    // extension-wall completion, so the manifest origin is `modified`.
    const row = m.files.find((f) => f.path === 'src/transport.test.ts')!
    expect(row.origin).toBe('modified')
  })

  it('the exclusion rationale is recorded in the manifest subset, not just prose', () => {
    const m = JSON.parse(readFileSync(join(STDIO, 'VENDOR-MANIFEST.json'), 'utf8'))
    const excluded: string[] = m.subset.excludedUpstreamPaths
    expect(excluded.some((e) => e.includes('server.test.ts') && e.includes('jest'))).toBe(true)
  })
})
