// tests/omo-team/team-keyword-slot.test.ts — P5-T12 · manifest 行 ⑭/㉔ 的
// omo-team 侧 registrar 单测：把门真读盘、漂移必抛、面真发布、跨包字面量
// 交叉等值。
//
// ── 这张测试钉的四件事 ──────────────────────────────────────────────────────
//   1. **交叉等值（R-5 双拼写先例）**：omo-team 的 patternSource/patternFlags/
//      injectionKind/服务名与 omo-hooks 的 TEAM_PATTERN.source / TEAM_PATTERN.flags
//      / TEAM_KEYWORD_INJECTION_KIND 逐字符相等——两侧零 import，等值只能在这里
//      对账；patternSource 是 flags-excluded 的 source 面，flags 由 face 的
//      patternFlags 独立携带（堵上消费方裸重建丢 `i` 的静默敏感面）；
//   2. **把门真实**：sha 对不上 = 抛具名错（注册循环接住打 FAILED），
//      一字节的漂移都不放行——用 fake read 注入脏字节证明这不是装饰；
//   3. **发布真实**：ctx.provide 在场才发布、缺席抛具名错、disposer 退服务；
//   4. **正文同源**：face.promptText === vendor 盘字节（trim 后，610 字符）===
//      keyword-detector loader 的 TEXTS.team——注入正文的载体与把门的字节同一枚
//      （真实注入的 INJECTION_SEPARATOR 尾装置由 omo-hooks 注入面追加，616）。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  OMO_TEAM_KEYWORD_SERVICE,
  TEAM_KEYWORD_INJECTION_KIND,
  TEAM_KEYWORD_PATTERN_SOURCE,
  loadVerifiedTeamKeywordFace,
  registerTeamKeywordInjectionFace,
} from '../../patches/omo-dsh/omo-team/src/team/team-keyword-slot.ts'
import {
  OMO_TEAM_PROMPTS_SERVICE,
  loadVerifiedTeamPromptsVendorFace,
  registerTeamPromptsVendorSurface,
} from '../../patches/omo-dsh/omo-team/src/team/team-prompts-vendor.ts'
import { TEAM_MANIFEST } from '../../patches/omo-dsh/omo-team/src/manifest.ts'
// 跨包对账：测试可以 import 两侧（测试不在生产 import 边上），生产两侧零 import。
import {
  TEAM_KEYWORD_INJECTION_KIND as HOOKS_KIND,
  TEAM_PATTERN,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/constants.ts'
import { loadInstructionTexts } from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/messages.ts'

const REPO = resolve(import.meta.dirname, '../..')
const TEAM_MD = join(REPO, 'patches/omo-dsh/vendor/prompts-team/prompts/mode/team.md')

describe('P5-T12 team-keyword-slot: 跨包字面量交叉等值（零 import 的补偿面）', () => {
  it('patternSource === omo-hooks TEAM_PATTERN.source（逐字符）', () => {
    expect(TEAM_KEYWORD_PATTERN_SOURCE).toBe(TEAM_PATTERN.source)
    // 独立第二锚：omo-hooks 侧若漂移，这一行仍对着 v4.19.4 的字面量红。
    expect(TEAM_KEYWORD_PATTERN_SOURCE).toBe('\\bteam[\\s_-]?mode\\b')
  })

  it('patternFlags === omo-hooks TEAM_PATTERN.flags === "i"（flags 独立成面，不静默裸跑）', () => {
    // patternSource 是 flags-excluded 的 source 面；flags 由 face.patternFlags
    // 携带。下面两条把「消费方裸重建」的失败形态也钉成可证伪断言：同一枚
    // source 配 flags 命中大小写混排，裸 new RegExp(source) 必须不命中——
    // 若哪天有人翻转 flags 或删掉 patternFlags，这里红，不是静默。
    const face = loadVerifiedTeamKeywordFace()
    expect(TEAM_PATTERN.flags).toBe('i')
    expect(face.patternFlags).toBe('i')
    expect(new RegExp(TEAM_KEYWORD_PATTERN_SOURCE, face.patternFlags).test('TEAM-MODE')).toBe(true)
    expect(new RegExp(TEAM_KEYWORD_PATTERN_SOURCE).test('TEAM-MODE')).toBe(false)
  })

  it('injectionKind === omo-hooks TEAM_KEYWORD_INJECTION_KIND === omo-team-keyword（Q-8 A1）', () => {
    expect(TEAM_KEYWORD_INJECTION_KIND).toBe(HOOKS_KIND)
    expect(TEAM_KEYWORD_INJECTION_KIND).toBe('omo-team-keyword')
  })

  it('服务名与行 ⑭/㉔ 的 id 同名不同面（face 命名可 grep）', () => {
    expect(OMO_TEAM_KEYWORD_SERVICE).toBe('omoTeamKeywordFace')
    expect(OMO_TEAM_PROMPTS_SERVICE).toBe('omoTeamPromptsFace')
    expect(TEAM_MANIFEST.some((row) => row.id === 'team-keyword-injection')).toBe(true)
    expect(TEAM_MANIFEST.some((row) => row.id === 'vendor-team-prompts')).toBe(true)
  })
})

describe('P5-T12 team-keyword-slot: 把门真实', () => {
  it('真盘真字节：face 的正文与 loader 的 TEXTS.team 同一枚（注入=把门同源）', () => {
    const face = loadVerifiedTeamKeywordFace()
    const loaded = loadInstructionTexts()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(face.promptText).toBe(loaded.texts.team)
    expect(face.promptText).toBe(readFileSync(TEAM_MD, 'utf8').trim())
    expect(face.promptText.startsWith('[team-mode]')).toBe(true)
    expect(face.memberSideAllowed).toBe(false)
    expect(face.teamMdSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('一字节的漂移都不放行：sha mismatch 抛具名错（脏字节实测）', () => {
    const clean = readFileSync(TEAM_MD, 'utf8')
    // path-aware：manifest 走真字节，team.md 多一个字母——sha 必须响。
    const dirtyRead = (p: string): string =>
      p.endsWith('team.md') ? clean.replace('[team-mode]', '[team-modes]') : readFileSync(p, 'utf8')
    expect(() => loadVerifiedTeamKeywordFace(dirtyRead)).toThrowError(/sha256 mismatch/)
    expect(() => loadVerifiedTeamKeywordFace(dirtyRead)).toThrowError(/team-keyword-injection/)
  })

  it('正文被换 = 抛具名错；manifest 畸形 = 抛具名错（把门没有第二档）', () => {
    // path-aware fake read：manifest 读真字节，team.md 读空白——sha 把门先响
    // （`body is empty` 守卫在其后，是 sha 命中被未来改动绕过时的防御层，
    // 今天可证不可达：pin 非空且 sha 命中 ⟹ 正文非空）。断言取"必抛具名错"。
    const emptyBodyRead = (p: string): string =>
      p.endsWith('team.md') ? '   \n' : readFileSync(p, 'utf8')
    expect(() => loadVerifiedTeamKeywordFace(emptyBodyRead)).toThrowError(/team-keyword-injection/)
    const badManifestRead = (p: string): string =>
      p.endsWith('VENDOR-MANIFEST.json') ? '{"files":[]}' : readFileSync(p, 'utf8')
    expect(() => loadVerifiedTeamKeywordFace(badManifestRead)).toThrowError(/vendor manifest unreadable/)
  })
})

describe('P5-T12 team-keyword-slot: registrar 的 provide 契约', () => {
  it('ctx.provide 在场：发布进 map，disposer 退服务', () => {
    const provided = new Map<string, unknown>()
    const ctx = {
      provide: (name: string, service: unknown) => {
        provided.set(name, service)
        return () => {
          provided.delete(name)
        }
      },
    } as never
    const disposer = registerTeamKeywordInjectionFace(ctx)
    expect(provided.has(OMO_TEAM_KEYWORD_SERVICE)).toBe(true)
    const face = provided.get(OMO_TEAM_KEYWORD_SERVICE) as Record<string, unknown>
    expect(face.injectionKind).toBe('omo-team-keyword')
    expect(face.patternSource).toBe('\\bteam[\\s_-]?mode\\b')
    expect(face.patternFlags).toBe('i')
    expect(typeof disposer).toBe('function')
    ;(disposer as () => void)()
    expect(provided.has(OMO_TEAM_KEYWORD_SERVICE)).toBe(false)
  })

  it('ctx.provide 缺席：抛具名错，不静默（该行 FAILED 由注册循环打）', () => {
    expect(() => registerTeamKeywordInjectionFace({} as never)).toThrowError(/no ctx\.provide/)
    expect(() => registerTeamPromptsVendorSurface({} as never)).toThrowError(/no ctx\.provide/)
  })
})

describe('P5-T12 vendor-team-prompts: 完整性把门全文件核验', () => {
  it('真盘：5 在册文件、4 实核（自指豁免）、两枚内容 sha 对 Q1b 锚', () => {
    const face = loadVerifiedTeamPromptsVendorFace()
    expect(face.fileCount).toBe(5)
    expect(face.verifiedCount).toBe(4)
    expect(face.teamMdSha256).toBe('5e7ab9391fcd43ebf9471de3de7babff6af228f17bbffa47685f47877f380a87')
    expect(face.teamModeTsSha256).toBe('cc0607a9a883b8b22de3b4de83b4aba4ac473978e4229a8fc150ef55bf793e4d')
    // 档案面 = 全文逐字（模板 :7-202 的提取归消费方）
    expect(face.teamModeTsText).toContain('teamModeSkill')
    expect(face.teamModeTsText).toContain('delegate-task')
  })

  it('任一在册文件漂移 = 抛具名错（package.json 一枚脏字节实测）', () => {
    const dirtyRead = (p: string): string =>
      p.endsWith('package.json') ? readFileSync(p, 'utf8') + '\n' : readFileSync(p, 'utf8')
    expect(() => loadVerifiedTeamPromptsVendorFace(dirtyRead)).toThrowError(/sha256 drift on package\.json/)
  })

  it('在册文件缺席 = 抛具名错（把门数得清缺了谁）', () => {
    const existsNothing = () => false
    expect(() => loadVerifiedTeamPromptsVendorFace(() => '', existsNothing)).toThrowError(/manifest absent/)
  })
})
