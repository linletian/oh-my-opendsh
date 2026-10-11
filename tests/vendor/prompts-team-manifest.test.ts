// tests/vendor/prompts-team-manifest.test.ts — P5-T12 一致性单测：
// `vendor/prompts-team/` 的漂移检测、账目三方对账与 deviations 登记。
//
// 为什么单独一个文件而不是并进 shared-skills-manifest.test.ts：那个文件的
// 三方对账锚在 291 文件 / 19 目录 / NOTICES 的 Phase 4 段——两套账本各自
// 独立，混表就是 c19 式的双面失真。本包 4 文件、双上游根（prompts-core +
// skills-loader-core）、deviations 全部是 note 类（零字节改动）——账目形态
// 与 shared-skills 的 rename/modification 形态**不同族**，各钉各的。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkVendorPackage, listFiles } from '../../scripts/vendor-manifest.mjs'
import { repoManifestFiles } from '../../scripts/verify-licenses.mjs'

const REPO = resolve(import.meta.dirname, '../..')
const PKG = join(REPO, 'patches/omo-dsh/vendor/prompts-team')

const manifest = JSON.parse(readFileSync(join(PKG, 'VENDOR-MANIFEST.json'), 'utf8'))
const entries: Array<{
  path: string
  sha256: string | null
  origin: string
  upstreamPath?: string
  upstreamSha256?: string
}> = manifest.files

/** Q1b §5 的实测锚：两个上游 blob 的 sha（`.omo/evidence/p5t1/Q1b-teamcore-teammd.md`）。 */
const TEAM_MD_SHA = '5e7ab9391fcd43ebf9471de3de7babff6af228f17bbffa47685f47877f380a87'
const TEAM_MODE_TS_SHA = 'cc0607a9a883b8b22de3b4de83b4aba4ac473978e4229a8fc150ef55bf793e4d'

describe('P5-T12 prompts-team: manifest drift detection', () => {
  const report = checkVendorPackage(PKG)

  it('every manifest entry re-hashes to its recorded sha256 (no hand edits)', () => {
    expect(report.drift).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('no file on disk is missing from the manifest, and no entry lacks a file', () => {
    expect(report.untracked).toEqual([])
    expect(report.missing).toEqual([])
  })

  it('the two content files hash to the Q1b upstream anchors (verbatim, byte-identical)', () => {
    const teamMd = entries.find((e) => e.path === 'prompts/mode/team.md')!
    const teamMode = entries.find((e) => e.path === 'src/features/builtin-skills/skills/team-mode.ts')!
    expect(teamMd.sha256).toBe(TEAM_MD_SHA)
    expect(teamMd.upstreamSha256).toBe(TEAM_MD_SHA)
    expect(teamMode.sha256).toBe(TEAM_MODE_TS_SHA)
    expect(teamMode.upstreamSha256).toBe(TEAM_MODE_TS_SHA)
    // verbatim 行不写 upstreamPath 之外的偏离；两枚正文的 upstreamPath 指回双根
    expect(teamMd.origin).toBe('verbatim')
    expect(teamMode.origin).toBe('verbatim')
    expect(teamMd.upstreamPath).toBe('packages/prompts-core/prompts/mode/team.md')
    expect(teamMode.upstreamPath).toBe('packages/skills-loader-core/src/features/builtin-skills/skills/team-mode.ts')
  })
})

describe('P5-T12 prompts-team: 账目与 NOTICES', () => {
  it('manifest totals block agrees with the entries themselves', () => {
    const tally = entries.reduce<Record<string, number>>((a, e) => {
      a[e.origin] = (a[e.origin] ?? 0) + 1
      return a
    }, {})
    expect(manifest.counts.total).toBe(entries.length)
    expect(manifest.counts.verbatim).toBe(tally.verbatim)
    expect(manifest.counts.projectNew).toBe(tally['project-new'])
    expect(manifest.counts.modified).toBe(tally.modified ?? 0)
  })

  it('files on disk == manifest entries == 5（2 正文 + 3 包根记录）', () => {
    const onDisk = listFiles(PKG)
    expect(onDisk).toHaveLength(5)
    expect(entries.map((e) => e.path).sort()).toEqual(onDisk)
  })

  it('THIRD_PARTY_NOTICES.md carries the prompts-team section with both content rows', () => {
    const notices = readFileSync(join(REPO, 'THIRD_PARTY_NOTICES.md'), 'utf8')
    const section = notices.slice(notices.indexOf('### Phase 5 vendored package: `@oh-my-opencode/prompts-team`'))
    expect(section).not.toBe(notices) // 段名在场（slice 未命中会回整篇）
    for (const path of ['prompts/mode/team.md', 'src/features/builtin-skills/skills/team-mode.ts']) {
      expect(section, path).toContain(`\`${path}\``)
    }
    expect(section).toContain(TEAM_MD_SHA)
    expect(section).toContain(TEAM_MODE_TS_SHA)
  })
})

describe('P5-T12 prompts-team: deviations 登记（N1/N9/M-3/Q-4）', () => {
  const deviations: Array<{ kind: string; id: string; files?: string[] }> = manifest.deviations

  it('deviations 恰四条，全是 note 类（零字节改动的包不许长出 modification 类）', () => {
    expect(deviations.map((d) => d.id).sort()).toEqual([
      'N1-terminal-status-hollow',
      'N9-delegation-name-drift',
      'Q4-NOTES-6-parameter-face-consistency',
      'dangling-import-M-3',
    ])
    expect(deviations.every((d) => d.kind === 'note')).toBe(true)
    expect(manifest.counts.deviations).toBe(deviations.length)
    expect(manifest.counts.deviationsByClass.modification).toBe(0)
  })

  it('N1 的落点文件与正文事实成文（team-mode.ts:108 的 failed 教学 + 本仓五值枚举）', () => {
    const n1 = deviations.find((d) => d.id === 'N1-terminal-status-hollow')!
    expect(n1.files).toEqual([
      'prompts/mode/team.md',
      'src/features/builtin-skills/skills/team-mode.ts',
    ])
    // 正文里 failed 教学仍在（逐字保真的反面检查：被改写 = 红）
    const teamMode = readFileSync(join(PKG, 'src/features/builtin-skills/skills/team-mode.ts'), 'utf8')
    // 正文是 TS 模板字面量，反引号带转义——按字面钉转义形态。
    expect(teamMode).toContain('\\`completed\\` or \\`failed\\`')
    // 本仓工具面五值无 failed（空头指令的"空"钉在这两行的差集上）
    const teamTask = readFileSync(join(REPO, 'patches/omo-dsh/omo-team/src/tools/team-task.ts'), 'utf8')
    expect(teamTask).toContain("'pending', 'claimed', 'in_progress', 'completed', 'deleted'")
    expect(teamTask).not.toMatch(/TEAM_TASK_STATUSES[^\]]*'failed'/)
  })

  it('N9 的两种漂移拼写各归其主（team.md=delegate_task，team-mode.ts=delegate-task）', () => {
    const teamMd = readFileSync(join(PKG, 'prompts/mode/team.md'), 'utf8')
    const teamMode = readFileSync(join(PKG, 'src/features/builtin-skills/skills/team-mode.ts'), 'utf8')
    expect(teamMd).toContain('delegate_task')
    expect(teamMd).not.toContain('delegate-task')
    expect(teamMode).toContain('delegate-task')
    // DSH 十名委派面里两枚都不存在（roster 逐字对账）
    const roster = readFileSync(join(REPO, 'patches/omo-dsh/omo-agents/src/roster.ts'), 'utf8')
    expect(roster).not.toContain('delegate_task')
    expect(roster).not.toContain('delegate-task')
  })

  it('M-3 dangling import 在册（../types 不在子集里，不改写）', () => {
    const m3 = deviations.find((d) => d.id === 'dangling-import-M-3')!
    expect(m3.files).toEqual(['src/features/builtin-skills/skills/team-mode.ts'])
    const teamMode = readFileSync(join(PKG, 'src/features/builtin-skills/skills/team-mode.ts'), 'utf8')
    expect(teamMode.startsWith('import type { BuiltinSkill } from "../types"')).toBe(true)
  })
})

describe('P5-T12 prompts-team: 许可门计分', () => {
  const scanned = repoManifestFiles(REPO).map((f) => f.slice(REPO.length + 1).split('\\').join('/'))

  it('the vendored package manifest is scored (its SUL-1.0 field is load-bearing)', () => {
    expect(scanned).toContain('patches/omo-dsh/vendor/prompts-team/package.json')
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))
    expect(pkg.license).toBe('SUL-1.0')
    expect(pkg.name).toBe('@oh-my-opencode/prompts-team')
  })

  it('the vendored content files are NOT scored as packages of this repo', () => {
    expect(scanned).not.toContain('patches/omo-dsh/vendor/prompts-team/prompts/mode/team.md')
    expect(scanned).not.toContain('patches/omo-dsh/vendor/prompts-team/src/features/builtin-skills/skills/team-mode.ts')
  })
})
