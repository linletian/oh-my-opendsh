// json-error-recovery.ts — P3-T14 listener (task book WP-6 批 A; plan §4.2
// pattern D): OMO's malformed-tool-arguments reminder, reborn as ONE DSH
// `tools/post-execute` waterfall listener.
//
// Upstream: packages/omo-opencode/src/hooks/json-error-recovery/hook.ts @
//   v4.19.4 (frozen baseline tag, commit
//   b072d279110bdda2c6ac2525d0d24dc54d16148a; 69 lines + 1 index.ts, zero
//   state; test seed
//   packages/omo-opencode/src/hooks/json-error-recovery/index.test.ts, 12 `it`).
//   语义移植（非逐字复制）: the SHAPE (blacklist gate → string gate →
//   idempotency marker → regex match → append-only) is transcribed; the live
//   error table ADDS the DSH-native signature (see 前置② below), the blacklist
//   is REBUILT in DSH's tool-name namespace (see the mapping below), and the
//   DELIVERY is DSH's. No upstream code is vendored; this is a new listener.
//
// UPSTREAM EFFECT (verbatim, hook.ts:58-66):
//
//   if (JSON_ERROR_EXCLUDED_TOOLS.has(input.tool.toLowerCase())) return
//   if (typeof output.output !== "string") return
//   if (output.output.includes(JSON_ERROR_REMINDER_MARKER)) return
//   const hasJsonError = JSON_ERROR_PATTERNS.some((pattern) => pattern.test(output.output))
//   if (hasJsonError) { output.output += `\n${JSON_ERROR_REMINDER}` }
//
// i.e. excluded tool → non-string result → already-reminded → regex match →
// append the reminder to the RESULT TEXT. Never blocks; never touches
// title/metadata; never reads the session, the disk, or a service.
//
// ═══════════ 前置② — DSH'S TOOL-ARGUMENTS FAILURE WORDING ═══════════
// (plan §4.2 DoD-d; the task book's "同前置核实 DSH 工具错误文案". Upstream's 8
// regexes are opencode/provider-worded; the task book asks whether they can hit
// DSH's real text. Measured at the pinned install — the DSH argument pipeline
// is:)
//
//   1. the agent loop parses the model's raw arguments string and KEEPS INVALID
//      JSON AS TEXT: `parseArguments` = `JSON.parse(raw)` with
//      `catch { return raw }` (dsh-agent-loop/lib/index.js:541-547, "Parse model
//      arguments, preserving invalid JSON as text and mapping empty input to
//      `{}`");
//   2. the tool's own schema walk then rejects a non-object root:
//      `checkValue` object branch → `"arguments" must be an object`
//      (dsh-tools/lib/index.js:423 + diagnosticPath :348-350), thrown as
//      `ToolArgsError` → message `invalid arguments: <violations>`
//      (dsh-tools/lib/index.js:812-818) → rendered `Error: invalid arguments:
//      "arguments" must be an object` by `toolErrorResult` (:3490-3502).
//
// CONCLUSION OF 前置② (recorded, not silent): NONE of upstream's 8 regexes
// matches that text — DSH's own malformed-arguments failure never says "json".
// The live table therefore keeps the 8 upstream regexes VERBATIM (they are the
// transcribed contract, and a provider/MCP-originated parse error can still
// reach a DSH tool result verbatim) and ADDS the DSH-native signatures
// ({@link DSH_JSON_ERROR_PATTERNS}), which are the only patterns that fire on
// DSH's own path. Without them this hook would be dead code on DSH; with only
// them, the upstream contract would be silently narrowed. Both halves are
// exported and pinned by the unit suite.
//
// ═══════════ THE BLACKLIST: 19 UPSTREAM NAMES → DSH TOOL NAMESPACE ═══════════
// Upstream's list is a blacklist (default INCLUDE — any unnamed tool is judged
// by the regexes). {@link JSON_ERROR_TOOL_EXCLUDE_LIST} transcribes all 19 names
// verbatim for the audit trail; {@link JSON_ERROR_EXCLUDED_TOOL_NAMES} is the
// set the gate actually uses. The OMO → DSH mapping, name by name:
//
//   bash                      → `bash` + `pwsh`   DSH has TWO shell tools
//                               (dsh-tool-bash/lib/index.js:260,
//                               dsh-tool-pwsh/lib/index.js:234; both mounted at
//                               dsh-base/cordis.patch.yml:247,251). Upstream
//                               could only name the one shell it had; the hazard
//                               ("a shell result is arbitrary text") is
//                               identical, so both are excluded.
//   read                      → `read`            dsh-tool-fs/lib/index.js:332
//   glob                      → `glob`            dsh-tool-fs-search:782
//   grep                      → `grep`            dsh-tool-fs-search:1090
//   webfetch                  → `web_fetch`       the DSH name is underscore-
//                               spelled (dsh-tool-web/lib/index.js:737)
//   look_at                   → `read_image`      OMO's multimodal look-at tool;
//                               DSH's multimodal tool is read_image
//                               (dsh-tool-fs:1042). Its content is an image
//                               block and can never carry JSON text, so this
//                               mapping is conservative (harmless).
//   grep_app_searchgithub     → DROPPED           an MCP plugin tool that has no
//                               DSH mount (the DSH tool catalog is the base
//                               composition's own; see the pinned file list).
//   websearch_web_search_exa  → `web_search`      dsh-tool-web:262
//   todowrite                 → `todo_write`      dsh-tool-todo:96
//   todoread                  → DROPPED           DSH has no todo-reading tool:
//                               the list is a session projection
//                               (dsh-tool-todo README/types), stateOf(session,
//                               'todos'), not a tool.
//   task                      → the DSH delegation namespace
//   call_omo_agent            → the same namespace  OMO's two delegation tools
//                               collapse onto DSH's: the 10 roster ids plus
//                               `subagent`/`subagent_fork`. The namespace has
//                               ONE definition in this package
//                               (hooks/empty-task-response-detector.ts
//                               DELEGATION_TOOL_NAMES — a same-package import,
//                               not the forbidden omo-agents ↔ omo-hooks edge),
//                               so it is reused rather than re-typed.
//   background_output         → `job_output`      dsh-tool-jobs/lib/index.js:229
//   session_read              → DROPPED           no DSH tool
//   session_search            → DROPPED           no DSH tool
//   session_info              → DROPPED           no DSH tool
//   session_list              → `list_agents`     the closest DSH "list what
//                               sessions/agents exist" surface
//                               (dsh-tool-subagent-control/list-agents). A
//                               PARTIAL analog, recorded as such: it lists
//                               continuable subagents, not arbitrary sessions.
//   skill                     → `skill`           dsh-tool-skill/lib/index.js:60
//   skill_mcp                 → DROPPED           DSH has no separate MCP-skill
//                               tool; `skill` covers MCP loading and is already
//                               excluded.
//
// Net: 13 upstream names mapped (two of them onto a namespace), 6 dropped with
// no DSH counterpart. DSH tools that upstream's list could not name and that are
// NOT excluded here — the honest residue, recorded for arbitration rather than
// silently widened: `write`, `edit`, `get_goal`/`create_goal`/`update_goal`,
// `present`, `exit_plan_mode`, `ralph`, `workflow`, `send_message`, `job_list`,
// `job_kill`, `ask_user_question`. Every residue entry keeps upstream's
// DEFAULT-INCLUDE semantics, exactly like an unnamed opencode tool did.
//
// ═══════════ DELIVERY: `accept` + `content` (same reasoning as H-14) ═══════════
// `additionalContexts` would leave the failed result untouched and ferry a
// separate message; upstream made the reminder BE part of the result text
// (`output.output += …`). `{kind:'accept', content:[…]}` is that append on the
// DSH surface (dsh-tools `postExecute` :3377-3406 replaces `content` and keeps
// the result's error status). The rewrite is restricted to TEXT-ONLY content so
// no non-text block can be dropped. `block` is rejected: upstream never blocked.
//
// ORDERING NOTE (P3-T1 §4.8.4 raised it): upstream ran json-error-recovery
// AFTER edit-error-recovery in one `tool.execute.after` chain and both mutate
// the same text. On DSH each is an independent `tools/post-execute` listener,
// and cordis's waterfall runs them outermost-first with a non-delegating
// listener vetoing the rest (cordis/lib/index.js `waterfall`). The two hooks
// therefore never see each other's rewrite, and no observable behaviour is lost
// here: `edit` is not on this blacklist, but no DSH edit failure text carries
// any of the 11 patterns either, so the two surfaces cannot both fire on one
// call. (The same holds for the truncator: its whitelist — grep / glob /
// web_fetch — is entirely inside this blacklist.)
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2): ② fail-open try/catch, `next()`
// outside the try; ③ no disk reads on the event path (the blacklist Set, the
// regex table and the reminder are built at import time); ⑤ no cross-event
// state — the module-level Set/list are IMMUTABLE declarations, not per-session
// bookkeeping, and the only runtime "state" is the marker inside the text.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar } from '../index.ts'
import { DELEGATION_TOOL_NAMES } from './empty-task-response-detector.ts'

/** The manifest id this registrar implements (manifest.ts row H-15). */
export const JSON_ERROR_RECOVERY_ID = 'json-error-recovery'

/** The one and only DSH event this listener registers on (pattern D). */
export const JSON_ERROR_RECOVERY_EVENT = 'tools/post-execute'

/**
 * The 19 upstream excluded names, TRANSCRIBED VERBATIM from hook.ts:3-23 (order
 * included, so a diff against upstream stays a line-by-line read). This is the
 * audit trail; the live gate consumes {@link JSON_ERROR_EXCLUDED_TOOLS}.
 */
export const JSON_ERROR_TOOL_EXCLUDE_LIST: readonly string[] = [
  'bash',
  'read',
  'glob',
  'grep',
  'webfetch',
  'look_at',
  'grep_app_searchgithub',
  'websearch_web_search_exa',
  'todowrite',
  'todoread',
  'task',
  'call_omo_agent',
  'background_output',
  'session_read',
  'session_search',
  'session_info',
  'session_list',
  'skill',
  'skill_mcp',
]

/**
 * The live blacklist in DSH's tool-name namespace (the mapping table with its
 * per-name citations is in the header). Built ONCE at import time — the event
 * path only reads the Set (discipline ③).
 */
export const JSON_ERROR_EXCLUDED_TOOL_NAMES: readonly string[] = [
  'bash',
  'pwsh',
  'read',
  'read_image',
  'glob',
  'grep',
  'web_fetch',
  'web_search',
  'todo_write',
  ...DELEGATION_TOOL_NAMES,
  'job_output',
  'list_agents',
  'skill',
]

/** The Set form the gate consumes (upstream's `new Set<string>(…)`). */
export const JSON_ERROR_EXCLUDED_TOOLS: ReadonlySet<string> =
  new Set<string>(JSON_ERROR_EXCLUDED_TOOL_NAMES)

/**
 * Upstream's 8 regexes, TRANSCRIBED VERBATIM from hook.ts:25-34 (flags
 * included). Kept in the live table — see the 前置② conclusion: a
 * provider- or MCP-originated parse error can still surface verbatim inside a
 * DSH tool result, and dropping them would silently narrow the upstream
 * contract.
 */
export const UPSTREAM_JSON_ERROR_PATTERNS: readonly RegExp[] = [
  /json parse error/i,
  /failed to parse json/i,
  /invalid json/i,
  /malformed json/i,
  /unexpected end of json input/i,
  /syntaxerror:\s*unexpected token.*json/i,
  /json[^\n]*expected '\}'/i,
  /json[^\n]*unexpected eof/i,
]

/**
 * The DSH-native signatures (前置② measurement), the ONLY patterns that match
 * DSH's own malformed-arguments path:
 *   1. `invalid arguments: "arguments" must be an object`
 *      dsh-agent-loop/lib/index.js:541-547 (raw invalid JSON preserved as text)
 *      × dsh-tools/lib/index.js:423 + :812-818 (a non-object root violation).
 *   2. `"arguments" must be a lossless JSON object` / `… must be a lossless JSON
 *      value` — dsh-tools/lib/index.js:423/:443, the lossless-value violations.
 *   3. `tool arguments must be lossless JSON: …` / `tool arguments must be
 *      lossless JSON (call the tool with an arguments object, e.g. `{}`)` —
 *      dsh-tools/lib/index.js:967-969, the `run_code`/PTC binding path.
 */
export const DSH_JSON_ERROR_PATTERNS: readonly RegExp[] = [
  /invalid arguments:\s*"arguments" must be an object/i,
  /must be a lossless json/i,
  /tool arguments must be lossless json/i,
]

/** The live table: upstream's 8 first (order preserved), then the DSH signatures. */
export const JSON_ERROR_PATTERNS: readonly RegExp[] = [
  ...UPSTREAM_JSON_ERROR_PATTERNS,
  ...DSH_JSON_ERROR_PATTERNS,
]

/**
 * The idempotency sentinel, transcribed VERBATIM from hook.ts:36. It is the
 * reminder's own first line, which is what makes the append self-idempotent: a
 * second pass sees its own marker and returns (`:60`).
 */
export const JSON_ERROR_REMINDER_MARKER = '[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]'

/**
 * 修正提醒 — the semantic port of upstream's `JSON_ERROR_REMINDER` (hook.ts:39-50),
 * transcribed VERBATIM including the leading and trailing newline (upstream
 * appends `` `\n${JSON_ERROR_REMINDER}` ``). Keep this text stable: the unit
 * test pins it verbatim, and it is the whole model-facing effect of the hook.
 */
export const JSON_ERROR_REMINDER = `
[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]

You sent invalid JSON arguments. The system could not parse your tool call.
STOP and do this NOW:

1. LOOK at the error message above to see what was expected vs what you sent.
2. CORRECT your JSON syntax (missing braces, unescaped quotes, trailing commas, etc).
3. RETRY the tool call with valid JSON.

DO NOT repeat the exact same invalid call.
`

// --- Minimal structural typings of the DSH surface this file touches --------
// Same discipline as the sibling listeners: only the shapes actually read are
// declared (this workspace has no dsh dependency to import types from).

/** One `text` block of a tool result's rendered content (dsh-llm ContentBlock). */
export interface ResultTextBlock {
  readonly type: 'text'
  readonly text: string
}

/** The `accept` decision replacing the failed result's content (mode D). */
export interface JsonRecoveryAcceptDecision {
  readonly kind: 'accept'
  readonly content: readonly ResultTextBlock[]
}

/** The `tools/post-execute` delegator handed to the listener by the waterfall. */
export type PostExecuteNextLike = () => Promise<unknown>

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * Reads the tool name and returns its lowercased form, or `undefined` for a
 * missing/non-string name. Upstream lowercased before the blacklist lookup
 * (`:58`); DSH's registered names are already canonical lowercase, so the
 * lowercasing is a total, fidelity-preserving formality.
 */
function readLoweredToolName(exec: unknown): string | undefined {
  if (!isObject(exec)) return undefined
  const name = (exec as { readonly name?: unknown }).name
  return typeof name === 'string' ? name.toLowerCase() : undefined
}

/** The DSH analog of upstream's `output.output` (see the sibling H-14 helper). */
export function readRenderedText(result: unknown): string {
  if (!isObject(result)) return ''
  const content = (result as { readonly content?: unknown }).content
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (!isObject(block)) continue
    const type = (block as { readonly type?: unknown }).type
    const value = (block as { readonly text?: unknown }).text
    if (type === 'text' && typeof value === 'string') text += value
  }
  return text
}

/**
 * True when EVERY content block is a `text` block (an empty array qualifies).
 * The rewrite replaces `content`, so this is what keeps it unable to drop a
 * non-text block.
 */
export function isTextOnlyResultContent(result: unknown): boolean {
  if (!isObject(result)) return false
  const content = (result as { readonly content?: unknown }).content
  if (!Array.isArray(content)) return false
  return content.every((block) => isObject(block)
    && (block as { readonly type?: unknown }).type === 'text')
}

/**
 * Upstream's predicate (`:62`): ANY of the 11 regexes matches the raw result
 * text (no lowercasing — the regexes carry the `i` flag).
 */
export function matchesJsonErrorTable(text: string): boolean {
  return JSON_ERROR_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * The pure decision: `undefined` means "not our call, delegate"; a decision
 * means "replace the content with the text + reminder". All leaf reads only —
 * no live dsh object is copied or serialized (plan §4.2 discipline ①).
 *
 * The four gates are upstream's, in upstream's ORDER (`:58-63`): blacklist →
 * non-empty string → idempotency marker → regex table.
 */
export function decideJsonErrorRecovery(
  exec: unknown,
  result: unknown,
): JsonRecoveryAcceptDecision | undefined {
  const tool = readLoweredToolName(exec)
  if (tool === undefined) return undefined
  if (JSON_ERROR_EXCLUDED_TOOLS.has(tool)) return undefined
  if (!isObject(result)) return undefined
  if (!isTextOnlyResultContent(result)) return undefined
  const text = readRenderedText(result)
  if (text === '') return undefined
  if (text.includes(JSON_ERROR_REMINDER_MARKER)) return undefined
  if (!matchesJsonErrorTable(text)) return undefined
  return { kind: 'accept', content: [{ type: 'text', text: `${text}\n${JSON_ERROR_REMINDER}` }] }
}

/**
 * The listener body: decide from OUR logic inside a fail-open try/catch, then
 * delegate — or return the rewrite. The `next()` calls are deliberately OUTSIDE
 * the try (header discipline ②).
 */
async function handleJsonErrorRecovery(
  exec: unknown,
  result: unknown,
  next: unknown,
): Promise<unknown> {
  const delegate = next as PostExecuteNextLike
  let decision: JsonRecoveryAcceptDecision | undefined
  try {
    decision = decideJsonErrorRecovery(exec, result)
  } catch {
    // Fail open: our own fault must never turn a successful tool result into an
    // isError, nor erase a malformed-arguments diagnostic.
    return delegate()
  }
  if (decision === undefined) return delegate()
  return decision
}

/**
 * Registers the ONE listener through `ctx.on` (the preferred channel). The
 * event comes from the manifest row, never a second literal.
 */
export const registerJsonErrorRecovery: HookRegistrar = (
  ctx,
  entry: HookManifestEntry,
) => {
  ctx.on(entry.event, (exec, result, next) => handleJsonErrorRecovery(exec, result, next))
}
