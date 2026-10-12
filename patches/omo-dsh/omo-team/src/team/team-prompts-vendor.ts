// team-prompts-vendor.ts — P5-T12 · manifest 行 ㉔ `vendor-team-prompts`
// 的 omo-team 侧交付面：prompts-team vendor 包的**启动完整性把门 + 模板档案面**
// （cordis service）。
// 署名（c25）：**无上游对应物——DSH 原生面**。行 ㉔ 的上游字节住在
// vendor/prompts-team/（逐字 v4.19.4，sha pin 在 VENDOR-MANIFEST）；本模块是
// DSH 侧的守门人代码，零上游字节。
//
// ── 这一行交付的是什么 ────────────────────────────────────────────────────────
// 行 ㉔ 的 nativeFace 是 `vendor 两项文本（team.md + teamModeSkill.template）`。
// 字节的家在 `vendor/prompts-team/`（逐字 v4.19.4，sha pin 在 VENDOR-MANIFEST.json）；
// 本模块是那两枚字节的**启动期守门人**：
//   * 对 manifest 里**每一个**带 sha pin 的文件（package.json / NOTICE.md /
//     team.md / team-mode.ts）现算 sha 对账——注册期任何一字节漂移都抛具名
//     错，该行打 FAILED、census 诚实停在原地（注册循环的 loud-but-non-fatal
//     契约，stop-continuation-team 同族）；VENDOR-MANIFEST.json 自身豁免
//     （自指哈希不存在，manifest `sha256: null` 的在册事实）。
//   * 把两枚 sha + team-mode 模板全文发布成只读 service：team.md 的**运行
//     消费**在 omo-hooks 的 team 槽（盘读，跨包禁 import——见
//     team-keyword-slot.ts 头注），本面承载的是 T13 升级面要读的 lead 运行
//     协议档案（`teamModeTsText` = vendored team-mode.ts 全文，模板在 :7-202
//     的 `template:` 字段里，提取归消费方，字节归这里把门）与探针/单测的
//     sha 对账。
//
// ── 已知矛盾不在这里修 ────────────────────────────────────────────────────────
// N1（`status:"failed"` 空头指令——本仓 TEAM_TASK_STATUSES 五值无 failed）与
// N9（`delegate_task`/`delegate-task` 名称漂移——DSH 委派工具名 = roster 十名）
// 都是**正文矛盾**，登记在 vendor VENDOR-MANIFEST.json deviations[]，正文逐字
// 保真（任务书铁律）。本模块核验的是字节，不改一个字节。

import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { TeamRegistrationContext } from '../index.ts'

/**
 * 服务名（提供侧拼写；消费侧——T13 升级面/探针/测试——本地声明同字面常量，
 * 交叉等值由单测钉死，`omoTeamMemberQuery` 的 R-5 双拼写先例逐字同族）。
 */
export const OMO_TEAM_PROMPTS_SERVICE = 'omoTeamPromptsFace'

/** 已核验的 prompts-team 档案面（发布进 cordis 的冻结载荷）。 */
export interface TeamPromptsVendorFace {
  /** VENDOR-MANIFEST 在册文件数（含自指豁免行；翻转它 = 扩清单，须翻 manifest）。 */
  readonly fileCount: number
  /** 启动期实际核验过的文件数（豁免自指行后的实核数）。 */
  readonly verifiedCount: number
  readonly teamMdSha256: string
  readonly teamModeTsSha256: string
  /** vendored team-mode.ts 全文（lead 运行协议档案，逐字；提取 `template` 归消费方）。 */
  readonly teamModeTsText: string
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

export const PROMPTS_TEAM_VENDOR_DIR = resolve(MODULE_DIR, '../../../vendor/prompts-team')
export const PROMPTS_TEAM_VENDOR_MANIFEST_PATH = resolve(PROMPTS_TEAM_VENDOR_DIR, 'VENDOR-MANIFEST.json')

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * 读 manifest、对全部带 pin 的文件逐枚 sha 核验，回冻结档案面。
 * 一切失败模式都抛具名错（注册循环接住打 FAILED）：manifest 缺席/畸形、
 * 任一在册文件缺席、任一 sha 不等。
 */
export function loadVerifiedTeamPromptsVendorFace(
  read: (absolutePath: string) => string = (p) => readFileSync(p, 'utf8'),
  exists: (absolutePath: string) => boolean = existsSync,
): TeamPromptsVendorFace {
  if (!exists(PROMPTS_TEAM_VENDOR_MANIFEST_PATH)) {
    throw new Error(`vendor-team-prompts: manifest absent at ${PROMPTS_TEAM_VENDOR_MANIFEST_PATH}`)
  }
  let files: { path: string; sha256: string | null }[]
  try {
    const parsed = JSON.parse(read(PROMPTS_TEAM_VENDOR_MANIFEST_PATH)) as {
      files?: { path?: unknown; sha256?: unknown }[]
    }
    if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
      throw new Error('files[] absent or empty')
    }
    files = parsed.files.map((f, i) => {
      if (typeof f?.path !== 'string' || f.path.length === 0) {
        throw new Error(`files[${i}] has no path`)
      }
      if (f.sha256 !== null && typeof f.sha256 !== 'string') {
        throw new Error(`files[${i}] (${f.path}) sha256 must be a string or null`)
      }
      return { path: f.path, sha256: f.sha256 }
    })
  } catch (err) {
    throw new Error(
      `vendor-team-prompts: manifest unreadable at ${PROMPTS_TEAM_VENDOR_MANIFEST_PATH}: `
      + `${err instanceof Error ? err.message : String(err)}`,
    )
  }
  let verifiedCount = 0
  const shas: Record<'prompts/mode/team.md' | 'src/features/builtin-skills/skills/team-mode.ts', string> = {
    'prompts/mode/team.md': '',
    'src/features/builtin-skills/skills/team-mode.ts': '',
  }
  for (const file of files) {
    if (file.sha256 === null) continue // self-referential row (VENDOR-MANIFEST.json itself)
    const absolute = resolve(PROMPTS_TEAM_VENDOR_DIR, file.path)
    if (!exists(absolute)) {
      throw new Error(`vendor-team-prompts: registered file absent at ${file.path}`)
    }
    const raw = read(absolute)
    const actual = sha256(raw)
    if (actual !== file.sha256) {
      throw new Error(
        `vendor-team-prompts: sha256 drift on ${file.path} — manifest pins ${file.sha256}, `
        + `disk holds ${actual}`,
      )
    }
    if (file.path in shas) shas[file.path as keyof typeof shas] = actual
    verifiedCount += 1
  }
  const teamModeTsText = read(resolve(PROMPTS_TEAM_VENDOR_DIR, 'src/features/builtin-skills/skills/team-mode.ts'))
  if (shas['prompts/mode/team.md'].length === 0 || shas['src/features/builtin-skills/skills/team-mode.ts'].length === 0) {
    throw new Error('vendor-team-prompts: the two content rows are not both pinned in the manifest')
  }
  return Object.freeze({
    fileCount: files.length,
    verifiedCount,
    teamMdSha256: shas['prompts/mode/team.md'],
    teamModeTsSha256: shas['src/features/builtin-skills/skills/team-mode.ts'],
    teamModeTsText,
  })
}

/**
 * 行 ㉔ 的 registrar（TEAM_REGISTRARS 的落点）。`ctx.provide` 缺席 = 抛具名
 * 错打 FAILED（同 stop-continuation-team 契约）；disposer 交回 ctx.effect 收编。
 */
export function registerTeamPromptsVendorSurface(
  ctx: TeamRegistrationContext,
): (() => void) | void {
  if (typeof ctx.provide !== 'function') {
    throw new Error(
      `vendor-team-prompts: this host exposes no ctx.provide — the ${OMO_TEAM_PROMPTS_SERVICE} service cannot be published and the vendor integrity gate would have no published face`,
    )
  }
  const face = loadVerifiedTeamPromptsVendorFace()
  return ctx.provide(OMO_TEAM_PROMPTS_SERVICE, face) as (() => void) | void
}
