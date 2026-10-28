// team-keyword-slot.ts — P5-T12 · manifest 行 ⑭ `team-keyword-injection`
// 的 omo-team 侧交付面：team 关键词槽的**启动期把门面**（cordis service）。
// 署名（c25）：**无上游对应物——DSH 原生面**。行 ⑭ 的上游语义住在 omo-hooks 的
// keyword-detector（那边自有逐字署名）；本文件是 DSH 服务面的原生把门代码。
//
// ── 为什么这一行的 nativeFace 住在 omo-hooks，这里却有一张面 ────────────────
// 行 ⑭ 的 nativeFace 写的是 omo-hooks keyword-detector 的 team 槽接线
// （TEAM_PATTERN 命中 → pre-step 注入，kind `omo-team-keyword`）。跨包纪律
// （任务书铁律 + R-5 / stop-continuation-team 先例）：omo-hooks **不 import
// omo-team**，注入正文它自己从 vendor 盘读（`keyword-detector/messages.ts`，
// 与 ultrawork/hyperplan 同一读盘形态，铁律「vendored 内容经 vendor 包消费」
// 的字面落点）。于是本行的 omo-team 可见半不是正文路由，而是**把门**：
//   * 启动期把 `vendor/prompts-team/prompts/mode/team.md` 的字节对
//     VENDOR-MANIFEST.json 的 sha pin 核一遍——漂移即抛具名错，注册循环打
//     该行 FAILED、census 诚实停在原地（「boot 从不宣称没有发生的成功」）；
//     消费侧此刻仍会读盘注入，但 census 的 FAILED 行就是那条「注入的字节
//     没被把过门」的显式事故登记，离线漂移测（tests/vendor/）与启动把门
//     是两道独立的眼。
//   * 把本行槽位的**机读契约**（pattern 源串 + flags / 注入 kind / 成员侧不
//     放行）连同已核验正文发布成 service——探针与单测按它核对「行 ⑭ 声称的
//     pattern/kind 与 omo-hooks 实际接线的是同一枚」，跨包等值不靠 import
//     靠钉。
//
// ── 三枚字面量的交叉对账（零 import 的代价与补偿）─────────────────────────
// `TEAM_KEYWORD_PATTERN_SOURCE` / `TEAM_KEYWORD_INJECTION_KIND` 在本模块是
// **独立第二锚**：omo-hooks 的 constants.ts 各自持有模式与 kind，两侧零
// import，等值由 tests/omo-team/team-keyword-slot.test.ts 逐字符钉死（同
// 文件还钉 face.promptText === vendor 盘字节）。任何一侧单独改字面量 = 红。
// `memberSideAllowed: false` 是 Q-8 裁定的机读浓缩（成员语境由
// omo-team-briefing 帧承担，不经关键词面）。

import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { TeamRegistrationContext } from '../index.ts'
import { teamToolsRegisteredThisBoot } from './team-tool-presence.ts'

/**
 * 服务名（提供侧拼写；消费侧——探针/测试——本地声明同字面常量，交叉等值由
 * 单测钉死，`omoTeamMemberQuery` 的 R-5 双拼写先例逐字同族）。
 */
export const OMO_TEAM_KEYWORD_SERVICE = 'omoTeamKeywordFace'

/**
 * 行 ⑭ 槽位的判别模式源串（= omo-hooks constants.ts TEAM_PATTERN.source）。
 * ⚠️ flags excluded（RegExp.prototype.source 的语义本就剥 flags）：本常量是
 * **string-equality-only contract** 的比对面，只供跨包逐字符对账；真实判别
 * 模式的 flags 由 {@link TeamKeywordFace.patternFlags} 随面发布（今天实测
 * `TEAM_PATTERN.flags === 'i'`）。消费方若只拿本串 `new RegExp(source)` 会
 * 静默得到大小写敏感匹配器——所以 flags 必须走 patternFlags，不靠默认值。
 */
export const TEAM_KEYWORD_PATTERN_SOURCE = '\\bteam[\\s_-]?mode\\b'

/** 行 ⑭ 槽位的注入 kind（= omo-hooks constants.ts TEAM_KEYWORD_INJECTION_KIND，Q-8 A1）。 */
export const TEAM_KEYWORD_INJECTION_KIND = 'omo-team-keyword'

/** 已核验的 team 关键词面（发布进 cordis 的冻结载荷）。 */
export interface TeamKeywordFace {
  /**
   * 判别模式源串（RegExp.prototype.source 语义，**flags excluded**）。这是
   * string-equality-only contract：跨包只逐字符比 source；用它单独重建
   * `new RegExp(patternSource)` 会静默得到大小写敏感匹配器——flags 走下面的
   * {@link patternFlags}，重建完整模式 = `new RegExp(patternSource, patternFlags)`。
   */
  readonly patternSource: string
  /**
   * 判别模式 flags（RegExp.prototype.flags 语义；今天实测
   * `= omo-hooks TEAM_PATTERN.flags === 'i'`）。存在就是为了堵上「消费方
   * 拿 source 裸重建丢 flag」的静默失败面；翻转它 = 翻转判别语义，单测钉死。
   */
  readonly patternFlags: 'i'
  readonly injectionKind: string
  /** Q-8 裁定：成员/子会话侧不放行（唯一的 false，翻转它 = 翻转裁定）。 */
  readonly memberSideAllowed: false
  /**
   * 已 sha 核验的 vendored team.md 正文（trim 后，实测 610 字符）——注入正文
   * 的**载体**；真实注入追加 `INJECTION_SEPARATOR` 尾装置（`\n\n---\n`，
   * 实测注入面 616 字符），尾置由 omo-hooks 注入面追加，不在本面内。
   */
  readonly promptText: string
  /** 核验通过的 sha256（VENDOR-MANIFEST pin 与实测字节同一枚的凭证）。 */
  readonly teamMdSha256: string
  /**
   * **本次 boot 实际注册成功**的 ①–⑪ 工具行齐备 ⇒ true（事实层，读自
   * team-registration-outcome.ts 的注册结果集）。
   *
   * P5-T16（评审 MAJOR-4）：这枚字段是**消费侧的缺席闸**——`team.md` 正文
   * 教模型用 `team_create` / `team_task_*` / `team_send_message` 编排，尾部还
   * 指向一个本部署**没有**的开关（"set team_mode.enabled=true and restart
   * opencode"）。载体不在场时注入这段正文 = 产出一条**死指令**（Phase 4 当初
   * 刻意不接线该槽的理由："一个没有等价载体的关键词命中后只会产出死指令"）。
   * 消费侧（omo-hooks 的 keyword-detector）据此判：**载体缺席 ⇒ 不注入**
   * team 正文（降级为空串），把 Phase 4 的纪律补回来。
   */
  readonly teamToolsPresent: boolean
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** vendor 包相对本模块的落点（启动把门的读面，只读）。 */
export const TEAM_VENDOR_MANIFEST_PATH =
  resolve(MODULE_DIR, '../../../vendor/prompts-team/VENDOR-MANIFEST.json')
export const TEAM_VENDOR_TEAM_MD_PATH =
  resolve(MODULE_DIR, '../../../vendor/prompts-team/prompts/mode/team.md')

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * 读盘 + sha 把门，回已核验的 face。任何一环缺席/漂移都**抛具名错**——
 * 注册循环接住打该行 FAILED（loud-but-non-fatal，census 不涨）：
 *   * manifest 缺席/畸形 → `vendor manifest …`（把门本身没有门）；
 *   * team.md 缺席 → `vendored team.md …`；
 *   * sha 不等 → `sha256 mismatch`（钉 pin 与实际字节，一字节的漂移都不放行）。
 */
export function loadVerifiedTeamKeywordFace(
  read: (absolutePath: string) => string = (p) => readFileSync(p, 'utf8'),
  exists: (absolutePath: string) => boolean = existsSync,
  teamToolsPresent: boolean = teamToolsRegisteredThisBoot(),
): TeamKeywordFace {
  if (!exists(TEAM_VENDOR_MANIFEST_PATH)) {
    throw new Error(`team-keyword-injection: vendor manifest absent at ${TEAM_VENDOR_MANIFEST_PATH}`)
  }
  let pin: string
  try {
    const manifest = JSON.parse(read(TEAM_VENDOR_MANIFEST_PATH)) as {
      files?: { path?: unknown; sha256?: unknown }[]
    }
    const row = (manifest.files ?? []).find((f) => f?.path === 'prompts/mode/team.md')
    if (row === undefined || typeof row.sha256 !== 'string' || row.sha256.length === 0) {
      throw new Error('entry missing or sha256 not pinned')
    }
    pin = row.sha256
  } catch (err) {
    throw new Error(
      `team-keyword-injection: vendor manifest unreadable at ${TEAM_VENDOR_MANIFEST_PATH}: `
      + `${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (!exists(TEAM_VENDOR_TEAM_MD_PATH)) {
    throw new Error(`team-keyword-injection: vendored team.md absent at ${TEAM_VENDOR_TEAM_MD_PATH}`)
  }
  const raw = read(TEAM_VENDOR_TEAM_MD_PATH)
  const actual = sha256(raw)
  if (actual !== pin) {
    throw new Error(
      `team-keyword-injection: vendored team.md sha256 mismatch — manifest pins ${pin}, `
      + `disk holds ${actual} (vendor bytes must stay verbatim at v4.19.4)`,
    )
  }
  const promptText = raw.trim()
  if (promptText.length === 0) {
    throw new Error('team-keyword-injection: vendored team.md body is empty')
  }
  return Object.freeze({
    patternSource: TEAM_KEYWORD_PATTERN_SOURCE,
    patternFlags: 'i' as const,
    injectionKind: TEAM_KEYWORD_INJECTION_KIND,
    memberSideAllowed: false as const,
    promptText,
    teamMdSha256: actual,
    teamToolsPresent,
  })
}

/**
 * 行 ⑭ 的 registrar（TEAM_REGISTRARS 的落点）。`ctx.provide` 缺席 = 这台
 * 宿主给不出面，抛具名错让循环打 FAILED（stop-continuation-team 同一契约）；
 * 返回 provide 的 disposer 交回循环经 ctx.effect 收编。
 */
export function registerTeamKeywordInjectionFace(
  ctx: TeamRegistrationContext,
): (() => void) | void {
  if (typeof ctx.provide !== 'function') {
    throw new Error(
      `team-keyword-injection: this host exposes no ctx.provide — the ${OMO_TEAM_KEYWORD_SERVICE} service cannot be published and the slot's registration contract would be unobservable`,
    )
  }
  const face = loadVerifiedTeamKeywordFace()
  return ctx.provide(OMO_TEAM_KEYWORD_SERVICE, face) as (() => void) | void
}
