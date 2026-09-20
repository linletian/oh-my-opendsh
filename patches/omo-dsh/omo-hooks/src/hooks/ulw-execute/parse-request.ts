// ulw-execute/parse-request.ts — P3-T17: 上游 parse-user-request.ts（49 行）的
// 逐行语义移植。
//
// 上游：packages/omo-opencode/src/hooks/start-work/parse-user-request.ts @ v4.19.4。
// **逐字移植**（非改写）：5 条正则、`EMPTY_REQUEST` 短路、flag 剥离顺序、
// `ultrawork|ulw` 关键词清洗、包裹引号剥离——全部照搬（常量在 constants.ts，
// 便于单测对原文逐字断言）。
//
// ⚠️ **输入来源的跨阶段耦合（P3-T1 §3 C-2）**：上游解析的是命令模板注入的
// `<user-request>…</user-request>` 标签（`commands.ts:72-74`，hooks/ 之外）。
// Phase 3 不交付命令模板，故调用方不是本函数、而是 ../ulw-execute.ts 的
// `parseUserRequestFor`，它按标签**在场与否**分流：
//   * **有** `<user-request>` 标签（= Phase 4 模板形态）→ 交给本函数，上游语义
//     逐字成立（本函数**保留原样**，Phase 4 模板落地后零改动即生效）；
//   * **没有**标签（= Phase 3 的自然语言委派文本）→ 返回 `EMPTY_REQUEST`。
//     **这不是「兜底解析」，方向正相反**：调用方**故意不**把全文当 rawArg——
//     把整段自然语言当计划名会产出虚假的 "…did not match any plan" 文案
//     （理由逐字见 `parseUserRequestFor` 的注释）。故本文件既可能拿到带标签的
//     文本（Phase 4），也可能根本不被调用（Phase 3 无标签短路）。两种形态都由
//     单测钉死，上游语义与 Phase 4 对接口同时成立。
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see ../index.ts).
import {
  KEYWORD_PATTERN,
  MAKE_PR_FLAG_PATTERN,
  SHIP_FLAG_PATTERN,
  USER_REQUEST_TAG_PATTERN,
  WORKTREE_FLAG_PATTERN,
  WRAPPING_QUOTES_PATTERN,
} from './constants.ts'

/** 上游 parse-user-request.ts:7-12 `ParsedUserRequest`，逐字。 */
export interface ParsedUserRequest {
  planName: string | null
  explicitWorktreePath: string | null
  makePr: boolean
  ship: boolean
}

/** 上游 parse-user-request.ts:14-19 `EMPTY_REQUEST`，逐字。 */
export const EMPTY_REQUEST: ParsedUserRequest = {
  planName: null,
  explicitWorktreePath: null,
  makePr: false,
  ship: false,
}

/**
 * 上游 parse-user-request.ts:21-48 `parseUserRequest`，逐行照搬。
 *
 * `rawArg` 的清洗顺序（与上游一致，顺序有语义）：
 *   ① 取 `<user-request>` 标签体并 trim；
 *   ② 抽出 `--worktree <path>` 并从文本里删除；
 *   ③ 探测 `--make-pr` / `--ship` 并从文本里删除；
 *   ④ 清洗 `ultrawork|ulw` 关键词；
 *   ⑤ 剥离整体包裹引号 → planName。
 */
export function parseUserRequest(promptText: string): ParsedUserRequest {
  const match = promptText.match(USER_REQUEST_TAG_PATTERN)
  if (!match) return EMPTY_REQUEST

  let rawArg = match[1].trim()
  if (!rawArg) return EMPTY_REQUEST

  const worktreeMatch = rawArg.match(WORKTREE_FLAG_PATTERN)
  const explicitWorktreePath = worktreeMatch ? (worktreeMatch[1] ?? null) : null

  if (worktreeMatch) {
    rawArg = rawArg.replace(worktreeMatch[0], '').trim()
  }

  const makePr = MAKE_PR_FLAG_PATTERN.test(rawArg)
  const ship = SHIP_FLAG_PATTERN.test(rawArg)
  rawArg = rawArg.replace(MAKE_PR_FLAG_PATTERN, '').replace(SHIP_FLAG_PATTERN, '').trim()

  const cleanedArg = rawArg.replace(KEYWORD_PATTERN, '').trim()
  const quotedPlanMatch = cleanedArg.match(WRAPPING_QUOTES_PATTERN)
  const normalizedPlanName = quotedPlanMatch ? quotedPlanMatch[2].trim() : cleanedArg

  return {
    planName: normalizedPlanName || null,
    explicitWorktreePath,
    makePr,
    ship,
  }
}

/** true when the text carries the command face's `<user-request>` wrapper. */
export function hasUserRequestTag(promptText: string): boolean {
  return USER_REQUEST_TAG_PATTERN.test(promptText)
}
