// tests/vendor/shared-skills-manifest.test.ts — consistency unit for the
// Phase 4 skills vendoring (P4-T4).
//
// What this pins, and why each one is a real failure mode rather than a
// restatement of the manifest:
//
//   1. drift      — every manifest entry re-hashed against disk, in BOTH
//                   directions (a file on disk the manifest does not list is
//                   drift too). Delegates to scripts/vendor-manifest.mjs, the
//                   tool the phase 1 playbook §6 deferred.
//   2. three-way  — `find … -type f | wc -l` == manifest `files[]` == the
//                   per-file rows in THIRD_PARTY_NOTICES.md. D15 ¶2 requires
//                   per-file disclosure; a row that silently falls out of the
//                   manifest (or vice versa) is unattributed third-party
//                   content.
//   3. catalog    — every SKILL.md frontmatter is parsed the way the delivery
//                   mechanism (P4-T5) will read it, and the resulting bare
//                   names must be exactly the 19-name set, with `ulw-execute`
//                   present and `start-work` absent.
//   4. residue    — no `start-work` left in the vendored skill text other than
//                   the two OMO carrier paths the manifest registers as
//                   deliberately retained, and no `shared/` name prefix
//                   anywhere (the prefix was already gone at v4.19.4; §16 of
//                   the feasibility report).
//   5. deviations — the playbook's self-check: non-verbatim files and
//                   `deviations[]` entries correspond 1:1, and every renamed
//                   file keeps its pre-rename upstream sha256 (R-8 two-way
//                   anchor).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkVendorPackage, listFiles } from '../../scripts/vendor-manifest.mjs'
import { repoManifestFiles } from '../../scripts/verify-licenses.mjs'

const REPO = resolve(import.meta.dirname, '../..')
const PKG = join(REPO, 'patches/omo-dsh/vendor/shared-skills')
const SKILLS = join(PKG, 'skills')
const NOTICES = readFileSync(join(REPO, 'THIRD_PARTY_NOTICES.md'), 'utf8')

const manifest = JSON.parse(readFileSync(join(PKG, 'VENDOR-MANIFEST.json'), 'utf8'))
const entries: Array<{
  path: string
  sha256: string | null
  origin: string
  upstreamPath?: string
  upstreamSha256?: string
}> = manifest.files

/** The 19 bare names this project expects in the catalog (17 shared + 2 senpi). */
const EXPECTED_SKILLS = [
  'ast-grep',
  'coding-agent-sessions',
  'data-scientist',
  'debugging',
  'frontend',
  'git-master',
  'hyperplan',
  'init-deep',
  'lsp-setup',
  'programming',
  'refactor',
  'remove-ai-slops',
  'review-work',
  'ulw-execute',
  'ultimate-browsing',
  'ultrawork',
  'ulw-plan',
  'ulw-research',
  'visual-qa',
]

/** Minimal YAML-frontmatter reader: the flat `key: value` head of a SKILL.md. */
function frontmatter(file: string): Record<string, string> {
  const text = readFileSync(file, 'utf8')
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) throw new Error(`no frontmatter: ${file}`)
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (!kv) continue
    let v = kv[2].trim()
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1)
    out[kv[1]] = v
  }
  return out
}

const skillDirs = readdirSync(SKILLS).filter((d) => statSync(join(SKILLS, d)).isDirectory()).sort()

/** Every file under skills/ that still mentions the pre-rename name. */
function startWorkResidue(): Array<{ file: string; literals: string[] }> {
  const out: Array<{ file: string; literals: string[] }> = []
  for (const rel of listFiles(SKILLS)) {
    const text = readFileSync(join(SKILLS, rel), 'utf8')
    if (!text.includes('start-work')) continue
    const literals = new Set<string>()
    for (const m of text.matchAll(/[^\s`()]*start-work[^\s`()]*/g)) literals.add(m[0])
    out.push({ file: rel, literals: [...literals].sort() })
  }
  return out
}

describe('P4-T4 shared-skills: manifest drift detection', () => {
  const report = checkVendorPackage(PKG)

  it('every manifest entry re-hashes to its recorded sha256 (no hand edits)', () => {
    expect(report.drift).toEqual([])
  })

  it('no file on disk is missing from the manifest, and no entry lacks a file', () => {
    expect(report.untracked).toEqual([])
    expect(report.missing).toEqual([])
  })

  it('re-checks the phase 1 vendor package too, with the same tool', () => {
    const hashline = checkVendorPackage(join(REPO, 'patches/omo-dsh/vendor/hashline-core'))
    expect(hashline.ok).toBe(true)
    expect(hashline.files).toBe(29)
  })
})

describe('P4-T4 shared-skills: three-way count (disk / manifest / NOTICES)', () => {
  it('manifest totals block agrees with the entries themselves', () => {
    const tally = entries.reduce<Record<string, number>>((a, e) => {
      a[e.origin] = (a[e.origin] ?? 0) + 1
      return a
    }, {})
    expect(manifest.counts.total).toBe(entries.length)
    expect(manifest.counts.verbatim).toBe(tally.verbatim)
    expect(manifest.counts.modified).toBe(tally.modified)
    expect(manifest.counts.projectNew).toBe(tally['project-new'])
  })

  it('files on disk == manifest entries == 291 (288 skill files + 3 package-root)', () => {
    const onDisk = listFiles(PKG)
    expect(onDisk).toHaveLength(291)
    expect(entries.map((e) => e.path).sort()).toEqual(onDisk)
    const skillFiles = onDisk.filter((p) => p.startsWith('skills/'))
    expect(skillFiles).toHaveLength(288)
    expect(manifest.counts.sharedSkillsSkillFiles + manifest.counts.senpiSkillFiles).toBe(288)
    expect(manifest.counts.skillDirectories).toBe(19)
  })

  it('THIRD_PARTY_NOTICES.md lists exactly the manifest file set, one row each', () => {
    const rows = [...NOTICES.matchAll(/^\| (\d+) \| `([^`]+)` \| `(verbatim|已修改|本项目新增)` \|/gm)]
    const section = NOTICES.slice(NOTICES.indexOf('### Phase 4 skills vendoring'))
    const phase4Rows = [...section.matchAll(/^\| (\d+) \| `([^`]+)` \| `(verbatim|已修改|本项目新增)` \|/gm)]
    // 291 numbered per-file rows; the phase 3 table also has numbered rows, so
    // the phase-4 slice is what the count is asserted against.
    expect(phase4Rows).toHaveLength(entries.length)
    expect(phase4Rows.map((r) => r[2]).sort()).toEqual(entries.map((e) => e.path).sort())
    expect(rows.length).toBeGreaterThanOrEqual(phase4Rows.length)
    // numbering is dense and 1-based, so a dropped row cannot hide
    expect(phase4Rows.map((r) => Number(r[1]))).toEqual(entries.map((_, i) => i + 1))
  })

  it('every NOTICES row is a truthful label of the manifest origin', () => {
    const section = NOTICES.slice(NOTICES.indexOf('### Phase 4 skills vendoring'))
    const byPath = new Map(entries.map((e) => [e.path, e.origin]))
    const LABEL: Record<string, string> = {
      verbatim: 'verbatim',
      modified: '已修改',
      'project-new': '本项目新增',
    }
    for (const [, , path, label] of section.matchAll(
      /^\| (\d+) \| `([^`]+)` \| `(verbatim|已修改|本项目新增)` \|/gm,
    )) {
      expect(`${path}:${label}`).toBe(`${path}:${LABEL[byPath.get(path)!]}`)
    }
  })
})

describe('P4-T4 shared-skills: catalog bare names after the rename', () => {
  it('19 skill directories, one SKILL.md each', () => {
    expect(skillDirs).toEqual([...EXPECTED_SKILLS].sort())
    for (const d of skillDirs) {
      expect(statSync(join(SKILLS, d, 'SKILL.md')).isFile()).toBe(true)
    }
  })

  it('frontmatter parses to exactly the 19 expected bare names', () => {
    const names = skillDirs.map((d) => frontmatter(join(SKILLS, d, 'SKILL.md')).name)
    expect(names.sort()).toEqual([...EXPECTED_SKILLS].sort())
    // no path-style or prefixed names leak into the catalog
    for (const n of names) expect(n).toMatch(/^[a-z0-9][a-z0-9-]*$/)
  })

  it('the renamed skill appears as ulw-execute, never as start-work', () => {
    const fm = frontmatter(join(SKILLS, 'ulw-execute', 'SKILL.md'))
    expect(fm.name).toBe('ulw-execute')
    expect(fm.description.length).toBeGreaterThan(0)
    expect(frontmatter(join(SKILLS, 'ulw-execute', 'SKILL.md')).name).not.toBe('start-work')
  })

  it('every SKILL.md carries the DSH-required name + description keys (P4-T1 C-group)', () => {
    for (const d of skillDirs) {
      const fm = frontmatter(join(SKILLS, d, 'SKILL.md'))
      expect(fm.name, d).toBe(d)
      expect(fm.description, d).toBeTruthy()
    }
  })

  it('keeps upstream extra frontmatter as-is (ulw-plan metadata.short-description)', () => {
    const text = readFileSync(join(SKILLS, 'ulw-plan', 'SKILL.md'), 'utf8')
    expect(text).toMatch(/^metadata:$/m)
    expect(text).toMatch(/^\s+short-description:/m)
  })
})

describe('P4-T4 shared-skills: no rename residue, no shared/ prefix', () => {
  it('the only surviving start-work literals are the two registered carrier paths', () => {
    const declared = (manifest.renames[0].retainedLiterals as Array<{ file: string; literal: string }>).map(
      (r) => `${r.file.replace(/^skills\//, '')}:${r.literal}`,
    )
    const actual = startWorkResidue().map((r) => `${r.file}:${r.literals.join(' ')}`)
    expect(actual).toEqual([
      'ulw-execute/SKILL.md:.omo/start-work/ledger.jsonl components/start-work-continuation',
    ])
    expect(declared.sort()).toEqual(
      [
        'ulw-execute/SKILL.md:components/start-work-continuation',
        'ulw-execute/SKILL.md:.omo/start-work/ledger.jsonl',
      ].sort(),
    )
  })

  it('no file on disk is named start-work, and no manifest entry references it', () => {
    expect(listFiles(SKILLS).some((p) => p.split('/').includes('start-work'))).toBe(false)
    expect(entries.some((e) => e.path.includes('start-work'))).toBe(false)
  })

  it('no shared/ name prefix survives anywhere in the vendored text', () => {
    const offenders: string[] = []
    for (const rel of listFiles(SKILLS)) {
      const text = readFileSync(join(SKILLS, rel), 'utf8')
      if (/shared\/[a-z0-9-]+\//i.test(text) || /^name:\s*shared-/im.test(text)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})

describe('P4-T4 shared-skills: deviations bookkeeping (D15 / R-8)', () => {
  const deviations: Array<{ class: string; path: string; renames?: number }> = manifest.deviations

  it('non-verbatim files and deviations[] entries correspond 1:1', () => {
    const modified = entries.filter((e) => e.origin === 'modified').map((e) => e.path).sort()
    const projectNew = entries.filter((e) => e.origin === 'project-new').map((e) => e.path).sort()
    expect(deviations.filter((d) => d.class === 'modification').map((d) => d.path).sort()).toEqual(modified)
    expect(deviations.filter((d) => d.class === 'addition').map((d) => d.path).sort()).toEqual(projectNew)
    expect(manifest.counts.deviations).toBe(deviations.length)
  })

  it('every modified file keeps its pre-rename upstream sha256 (R-8 two-way anchor)', () => {
    for (const e of entries.filter((x) => x.origin === 'modified')) {
      expect(e.upstreamSha256, e.path).toMatch(/^[0-9a-f]{64}$/)
      expect(e.upstreamSha256).not.toBe(e.sha256)
    }
  })

  it('the renamed skill points back at the upstream start-work path', () => {
    const entry = entries.find((e) => e.path === 'skills/ulw-execute/SKILL.md')!
    expect(entry.upstreamPath).toBe('packages/shared-skills/skills/start-work/SKILL.md')
    expect(manifest.renames[0].from).toBe('skills/start-work')
    expect(manifest.renames[0].to).toBe('skills/ulw-execute')
    expect(manifest.renames[0].tokenOccurrencesRenamed).toBe(40)
  })

  it('token-rename counts add up to the recorded total', () => {
    const sum = deviations.reduce((a, d) => a + (d.renames ?? 0), 0)
    expect(sum).toBe(manifest.renames[0].tokenOccurrencesRenamed)
  })

  it('the package carries the SUL-1.0 field and the prominent notice', () => {
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))
    expect(pkg.license).toBe('SUL-1.0')
    expect(pkg.name).toBe('@oh-my-opencode/shared-skills')
    const notice = readFileSync(join(PKG, 'NOTICE.md'), 'utf8')
    expect(notice).toMatch(/MODIFIED/)
    expect(notice).toContain('b072d279110bdda2c6ac2525d0d24dc54d16148a')
  })
})

describe('P4-T4 shared-skills: the license gate scores the package, not its content', () => {
  const scanned = repoManifestFiles(REPO).map((f) => f.slice(REPO.length + 1).split('\\').join('/'))

  it('the vendored package manifest is scored (its SUL-1.0 field is load-bearing)', () => {
    expect(scanned).toContain('patches/omo-dsh/vendor/shared-skills/package.json')
    expect(scanned).toContain('patches/omo-dsh/vendor/hashline-core/package.json')
  })

  it('vendored skill content is NOT scored as a package of this repo', () => {
    // ultimate-browsing ships a Playwright helper manifest the skill tells the
    // *user* to copy into their own project. Upstream declares no license for
    // it, and this repo neither publishes nor resolves it, so scoring it would
    // fail the gate on content we merely vendored (measured: gate 5 red, 1
    // violation, before the walk rule was added).
    const template = 'patches/omo-dsh/vendor/shared-skills/skills/ultimate-browsing/engine/templates/package.json'
    expect(scanned).not.toContain(template)
    // sanity: the file really is there, so the rule is not passing by absence
    expect(
      readFileSync(join(REPO, template), 'utf8'),
    ).toContain('"insane-search-templates"')
  })

  it('no repo package outside the vendor tree was dropped by the rule', () => {
    expect(scanned).toContain('package.json')
    // Every repo package must be in the sample, so "no repo package outside the
    // vendor tree was dropped by the rule" cannot pass by omission when a new
    // patch package lands (omo-commands added by P4-T3).
    for (const p of [
      'patches/omo-dsh/omo-agents/package.json',
      'patches/omo-dsh/omo-hooks/package.json',
      'patches/omo-dsh/omo-commands/package.json',
    ]) {
      expect(scanned).toContain(p)
    }
    // every scored path is a workspace project, never nested content
    for (const p of scanned) {
      expect(p.split('/').filter((s) => s === 'vendor').length).toBeLessThanOrEqual(1)
    }
  })
})
