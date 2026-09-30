// keyword-detector/detector.ts — P4-T12: keyword recognition itself.
//
// Upstream: packages/omo-opencode/src/hooks/keyword-detector/detector.ts @
// v4.19.4 (commit b072d279110bdda2c6ac2525d0d24dc54d16148a) and the keyword
// table in constants.ts. Per-file attribution: ../keyword-detector.ts header.
//
// This is the closest thing to a verbatim port in the whole Phase 4 hook set:
// the recognition rules ARE the hook. Patterns live in constants.ts (verbatim);
// this file owns the four transformations upstream spreads across detector.ts
// and hook.ts:
//
//   ① 剥壳   removeCodeBlocks — drop fenced + inline code before matching.
//   ② slash  looksLikeSlashCommand — a leading `/name` is a command, not text.
//   ③ 配置   disabled / enabledExpansions, incl. the **intersection rule**
//            (disabling either base keyword also disables the combo).
//   ④ 组合   suppressComboStandalones — a combo hit removes the two
//            standalone hits (upstream hook.ts:25-29).
//
// 语义移植 note: upstream's `extractPromptText` walks opencode's `output.parts`
// array; DSH's `agent/pre-step` payload carries `messages[]` instead, so the
// extraction lives in filters.ts (it is a *payload-shape* concern) and this
// file stays harness-neutral.
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see index.ts).

import {
  CODE_BLOCK_PATTERN,
  COMBO_BASE_TYPES,
  INLINE_CODE_PATTERN,
  SLASH_COMMAND_LEAD_PATTERN,
  type KeywordType,
} from './constants.ts'
import { KEYWORD_DETECTORS } from './messages.ts'
import type { KeywordMessageDeps } from './constants.ts'

/** 一次命中的关键词：类型 + 已组装好的注入文本。 */
export interface DetectedKeyword {
  readonly type: KeywordType
  readonly message: string
}

/** 上游 config/schema/keyword-detector.ts 的等价面（两个字段都可缺席）。 */
export interface KeywordDetectorConfig {
  /**
   * 缺席 = 不禁用任何关键词（上游 `disabled_keywords` optional 无默认，
   * detector.ts:52 的 `?? []` 分支）。DSH 默认与之对齐。
   */
  readonly disabledKeywords?: readonly KeywordType[]
  /**
   * 缺席 = 无 allowlist（全部启用）；设置后只有名单内的类型会触发
   * （上游 `enabled_expansions`，detector.ts:58 的 `null` 分支）。
   */
  readonly enabledExpansions?: readonly KeywordType[]
}

/** 上游「两字段都 optional、无默认」的直接翻译。 */
export const DEFAULT_KEYWORD_DETECTOR_CONFIG: KeywordDetectorConfig = Object.freeze({
  disabledKeywords: undefined,
  enabledExpansions: undefined,
})

/** DSH 默认 = 上游默认：缺席即全启用、无 allowlist。 */
export function resolveConfig(overrides?: Partial<KeywordDetectorConfig>): KeywordDetectorConfig {
  return { ...DEFAULT_KEYWORD_DETECTOR_CONFIG, ...overrides }
}

/**
 * 剥 code fence + inline code（上游 detector.ts:14-16 逐字）。
 *
 * ⚠️ 注意与幂等的相互作用：注入文本本身**不含**反引号包裹的关键词问题，
 * 因为 vendor 正文里的关键词本来就带反引号（`` `ULTRAWORK MODE ENABLED!` ``）。
 * 匹配发生在**剥壳之后**，所以用户写 `` `ulw` `` 不触发——这正是上游要的。
 */
export function removeCodeBlocks(text: string): string {
  return text.replace(CODE_BLOCK_PATTERN, '').replace(INLINE_CODE_PATTERN, '')
}

/** slash 前导判定（上游 detector.ts:18-22 逐字）。 */
export function looksLikeSlashCommand(text: string): boolean {
  return SLASH_COMMAND_LEAD_PATTERN.test(text)
}

/**
 * 交集禁用规则（上游 detector.ts:53-56 逐字 + 注释）：
 * combo 需要两个基词都启用，禁用任一即禁用 combo。
 */
export function effectiveDisabledTypes(config: KeywordDetectorConfig): Set<KeywordType> {
  const disabled = new Set<KeywordType>(config.disabledKeywords ?? [])
  for (const base of COMBO_BASE_TYPES) {
    if (disabled.has(base)) disabled.add('hyperplan-ultrawork')
  }
  return disabled
}

/** allowlist（上游 detector.ts:57-58 + 65）。 */
function allowlistOf(config: KeywordDetectorConfig): Set<KeywordType> | null {
  return config.enabledExpansions ? new Set(config.enabledExpansions) : null
}

/**
 * 纯匹配：给定（已剥壳的）文本，产出命中的类型 + 注入文本。
 *
 * `agentName` 只经 {@link KeywordMessageDeps} 流向文案工厂（名册感知），
 * 不参与判别——上游的 agent 分流只改文案不改是否命中。
 */
export function detectKeywordsWithMessages(
  text: string,
  deps: KeywordMessageDeps,
  config: KeywordDetectorConfig,
): DetectedKeyword[] {
  const disabled = effectiveDisabledTypes(config)
  const allowlist = allowlistOf(config)
  const hits: DetectedKeyword[] = []
  for (const { type, pattern, buildMessage } of KEYWORD_DETECTORS) {
    if (!pattern.test(text)) continue
    if (allowlist !== null && !allowlist.has(type)) continue
    if (disabled.has(type)) continue
    hits.push({ type, message: buildMessage(deps) })
  }
  return suppressComboStandalones(hits)
}

/**
 * 组合命中时抑制两个独立命中（上游 hook.ts:25-29 逐字）：
 * banner 侧已经声明"不要说独立 banner"，若同时注入两份正文，模型会把
 * 两条互相排斥的 MANDATORY 指令一起收到。
 */
export function suppressComboStandalones(hits: readonly DetectedKeyword[]): DetectedKeyword[] {
  if (!hits.some((hit) => hit.type === 'hyperplan-ultrawork')) return [...hits]
  return hits.filter((hit) => hit.type !== 'ultrawork' && hit.type !== 'hyperplan')
}

/**
 * 消息级幂等（上游 hook.ts:31-36 逐字 + hook.ts:157-161 的调用点）：
 * 注入文本已经出现在本轮用户文本里 → 该关键词不重复注入。
 *
 * 这是**逐字移植**的那一道。会话级一次性守卫（`../keyword-detector.ts` 的
 * `injectedSessions` WeakSet）复用的是上游的 `Set` 机制，但判据不同——上游那个
 * Set 属于 default-mode 特性、不在关键词触发路径上，DSH 需要它是因为 pre-step
 * 每**步**触发一次（理由见 listener 头部 S-6）。
 *
 * ⚠️ 判据用**未剥壳**的 `cleanText`（系统提醒已剔、代码壳保留）：注入正文落在
 * 指令块里，用户原封不动贴回同一段正文时也必须被认出。
 */
export function filterAlreadyInjectedKeywords(
  hits: readonly DetectedKeyword[],
  text: string,
): DetectedKeyword[] {
  // 逐字对齐上游 hook.ts:35 的 `!originalText.trim().includes(keyword.message)`。
  // 今天的 `text` 由 `removeSystemReminders()` 产出、那里已经 `.trim()`，所以这个
  // `.trim()` **不改变当下行为**；写出来是为了让本函数与上游 byte-for-byte：将来
  // 若调用方换成未 trim 的文本（PRE 事件的载荷就未经 removeSystemReminders），
  // 幂等谓词不会悄悄退化。
  const trimmed = text.trim()
  return hits.filter((hit) => !trimmed.includes(hit.message))
}
