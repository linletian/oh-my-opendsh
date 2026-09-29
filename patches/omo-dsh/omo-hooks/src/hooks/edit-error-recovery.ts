// edit-error-recovery.ts — P3-T14 listener (task book WP-6 批 A; plan §4.2
// pattern D): OMO's edit-mistake recovery reminder, reborn as ONE DSH
// `tools/post-execute` waterfall listener.
//
// Upstream: packages/omo-opencode/src/hooks/edit-error-recovery/hook.ts @
//   v4.19.4 (frozen baseline tag, commit
//   b072d279110bdda2c6ac2525d0d24dc54d16148a; 58 lines, ZERO state — the
//   smallest module of 批 A; test seed
//   packages/omo-opencode/src/hooks/edit-error-recovery/index.test.ts, 9 `it`).
//   语义移植（非逐字复制）: the TRIGGER DECISION (tool-name gate + the
//   substring error table + "append only") is the upstream contract; the
//   ERROR TABLE ITSELF IS REBUILT against DSH's real edit failure wording (see
//   the prerequisite section below), and the DELIVERY is DSH's, not opencode's.
//   No upstream code is vendored; this is a new listener.
//
// UPSTREAM EFFECT (verbatim, hook.ts:45-55):
//
//   if (input.tool.toLowerCase() !== "edit") return
//   if (typeof output.output !== "string") return
//   const outputLower = (output.output ?? "").toLowerCase()
//   const hasEditError = EDIT_ERROR_PATTERNS.some((pattern) =>
//     outputLower.includes(pattern.toLowerCase()))
//   if (hasEditError) { output.output += `\n${EDIT_ERROR_REMINDER}` }
//
// i.e. tool-name gate → substring match on the LOWERCASED result text → append
// the reminder to the RESULT TEXT. No blocking, no title/metadata change, no
// state, no disk, no platform service.
//
// ═══════════ 前置① — DSH EDIT ERROR WORDING, VERIFIED VERBATIM ═══════════
// (plan §4.2 DoD-d; the task book's mandatory 实施期 item. Upstream's three
// patterns are opencode's OWN edit vocabulary — `oldString`, "must be
// different", "not found", "found multiple times" — and a DSH tool result
// never contains any of them, so the transcribed table would make this hook
// DEAD CODE. Measured at the pinned install instead:)
//
//   1. `old_string and new_string must differ`
//      dsh-tool-fs/lib/index.js:713, `parseEditArgs` — thrown as a plain Error
//      BEFORE any filesystem work (an equal pair is a guaranteed no-op edit).
//   2. `old_string was not found in "<displayPath>"`
//      dsh-fs-local/lib/index.js:685, `applyLiteralEdit` — FsError
//      FS_EDIT_NOT_FOUND.
//   3. `old_string matched <N> times in "<displayPath>"; provide a more
//      specific old_string or set replace_all to true`
//      dsh-fs-local/lib/index.js:686 — FsError FS_AMBIGUOUS_EDIT (the
//      replace_all=false ambiguity the upstream "found multiple times" names).
//   4. `old_string must be a non-empty string`
//      dsh-tool-fs/lib/index.js:712 AND dsh-fs-local/lib/index.js:682 — the
//      DSH-only sibling of (1): the same argument-level class of edit mistake,
//      reached two ways (the tool's own validation and the backend's).
//
// EVERY one of these reaches the listener as the tool result text
// `Error: <message>`: a thrown tool error is materialized by dsh-tools
// `toolErrorResult` (dsh-tools/lib/index.js:3490-3502) as
// `[{type:'text', text: `Error: ${message}`}]` with `isError: true`, and
// post-execute receives that result (this file does not gate on isError — see
// below). The mapping UPSTREAM → DSH therefore reads:
//
//   "oldString and newString must be different" → "old_string and new_string must differ"
//   "oldString not found"                       → "old_string was not found"
//   "oldString found multiple times"            → "old_string matched"
//   (none)                                      → "old_string must be a non-empty string"
//
// The upstream three are kept in {@link UPSTREAM_EDIT_ERROR_PATTERNS} as the
// audit-trail reference (the unit suite asserts they are NOT the live table and
// that they do not match DSH's real text). The other two DSH edit failure
// classes are deliberately NOT in the table, recorded rather than silently
// dropped: the observation-policy remediations
// (`cannot modify "<path>": file has not been read — read the file, then retry`
// and its FS_STALE_VERSION sibling, dsh-tool-fs/lib/index.js:547-548) are about
// the HARNESS's read-before-write discipline, not about a wrong assumption on
// the file's content, so they are out of this hook's semantic.
//
// ═══════════ DELIVERY: `accept` + `content`, NOT `additionalContexts` ═══════
// The two DSH candidates were weighed (this is the T5-vs-T7 choice the task
// book asks to record):
//   * `{kind:'accept', additionalContexts:[…]}` (T5's bash-file-read-guard) —
//     REJECTED. It leaves the tool result UNCHANGED and ferries a separate
//     user message into the NEXT request. Upstream does the opposite: the
//     reminder becomes PART OF THE RESULT TEXT (`output.output += …`), i.e. it
//     is read as the outcome of the failed call.
//   * `{kind:'accept', content:[…]}` — CHOSEN. dsh-tools `postExecute`
//     (dsh-tools/lib/index.js:3377-3406) replaces `content` when the decision
//     carries it and keeps the call's success/error status. Rebuilding the
//     rendered text as `<original text>\n<REMINDER>` is the exact analog of a
//     string `+=`, which is what upstream performed.
// The rebuild is deliberately CONSERVATIVE: the listener only rewrites a result
// whose content is TEXT-ONLY (see {@link isTextOnlyResultContent}), so it can
// never drop an image/file block. `edit` satisfies that by construction — both
// its success render (dsh-tool-fs/lib/index.js:781-785) and every error path
// (toolErrorResult, and the sandbox denial marker at
// dsh-tool-fs/lib/index.js:1226-1228) produce exactly one text block.
//
// WHY NOT `block`: upstream never blocked. A `block` decision would turn a
// successful edit into an isError and could trigger retry logic the upstream
// hook deliberately avoided.
//
// ═══════════ ONE DELIBERATE ADDITION: THE IDEMPOTENCY SENTINEL ═══════════
// Upstream has NO de-duplication guard (contrast json-error-recovery's marker),
// so a second pass over the same text would append the reminder twice
// (P3-T1 §3.8.4 recommends adding one). This port refuses to append when the
// text already carries {@link EDIT_ERROR_REMINDER_MARKER} — the reminder's own
// first line. The behaviour is strictly narrower than upstream, is what the
// unit suite's "processed twice" case pins, and is recorded here as an
// intentional improvement rather than a transcription.
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2, all modes):
//   ② the listener body wraps its OWN logic in try/catch and fails OPEN
//      (`return next()`): a throw inside a `tools/post-execute` listener
//      replaces an entire SUCCESSFUL tool result with an isError —
//      dsh-tools/lib/index.js `finalizeScheduledExecution` (:3241-3248) awaits
//      `postExecute` inside a try/catch whose catch materializes
//      `toolErrorResult(error)`. (For an edit that ALREADY failed the status is
//      preserved either way, but the discipline is uniform across the mode.)
//      The `next()` calls sit OUTSIDE the try so a downstream rejection
//      propagates once instead of being swallowed and retried.
//   ③ no disk reads on the event path — the pattern table and the reminder are
//      module constants built at import time.
//   ⑤ no cross-event state: this listener is stateless (no Map, no session
//      bookkeeping) — the upstream module had no session map either, and the
//      only "state" is the sentinel INSIDE the text being processed.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar } from '../index.ts'

/** The manifest id this registrar implements (manifest.ts row H-14). */
export const EDIT_ERROR_RECOVERY_ID = 'edit-error-recovery'

/** The one and only DSH event this listener registers on (pattern D). */
export const EDIT_ERROR_RECOVERY_EVENT = 'tools/post-execute'

/** The verified DSH tool registration name (dsh-tool-fs/lib/index.js:742). */
export const EDIT_TOOL_NAME = 'edit'

/**
 * Upstream's three patterns, TRANSCRIBED VERBATIM from hook.ts:6-10. They are
 * the audit-trail reference for the rebuilt table below — NOT the live gate,
 * because no DSH edit result contains any of them.
 */
export const UPSTREAM_EDIT_ERROR_PATTERNS: readonly string[] = [
  'oldString and newString must be different',
  'oldString not found',
  'oldString found multiple times',
]

/**
 * The live error table, REBUILT against DSH's real edit failure wording (the
 * 前置① measurement in the header; each entry carries its source citation
 * there). Matching is upstream's: lowercase both sides, substring `includes`.
 */
export const EDIT_ERROR_PATTERNS: readonly string[] = [
  // ← "oldString and newString must be different" (dsh-tool-fs:713)
  'old_string and new_string must differ',
  // ← "oldString not found" (dsh-fs-local:685)
  'old_string was not found',
  // ← "oldString found multiple times" (dsh-fs-local:686; the live text is
  //   `old_string matched <N> times in "<path>"; provide a more specific
  //   old_string or set replace_all to true`). The fragment is deliberately the
  //   full `old_string matched` prefix: it occurs in that message and nowhere
  //   else in the edit vocabulary.
  'old_string matched',
  // DSH-only: the fourth edit-mistake class (dsh-tool-fs:712 / dsh-fs-local:682).
  'old_string must be a non-empty string',
]

/**
 * 回读提醒 — the semantic port of upstream's `EDIT_ERROR_REMINDER`
 * (hook.ts:16-27), transcribed VERBATIM including its leading and trailing
 * newline (upstream appends `` `\n${EDIT_ERROR_REMINDER}` ``, so the durable
 * text keeps the blank line before the block and the final newline). Keep this
 * text stable: the unit test pins it verbatim, and it is the whole
 * model-facing effect of the hook.
 */
export const EDIT_ERROR_REMINDER = `
[EDIT ERROR - IMMEDIATE ACTION REQUIRED]

You made an Edit mistake. STOP and do this NOW:

1. READ the file immediately to see its ACTUAL current state
2. VERIFY what the content really looks like (your assumption was wrong)
3. APOLOGIZE briefly to the user for the error
4. CONTINUE with corrected action based on the real file content

DO NOT attempt another edit until you've read and verified the file state.
`

/**
 * The idempotency sentinel: the reminder's own first line (the one deliberate
 * addition recorded in the header). A result already carrying it is left alone.
 */
export const EDIT_ERROR_REMINDER_MARKER = '[EDIT ERROR - IMMEDIATE ACTION REQUIRED]'

// --- Minimal structural typings of the DSH surface this file touches --------
// Same discipline as bash-file-read-guard.ts / empty-task-response-detector.ts:
// this workspace has no dsh dependency, so only the shapes actually read are
// declared. Everything is `readonly` because the real result is deep-frozen.

/** One `text` block of a tool result's rendered content (dsh-llm ContentBlock). */
export interface ResultTextBlock {
  readonly type: 'text'
  readonly text: string
}

/** The `accept` decision replacing the failed result's content (mode D). */
export interface EditRecoveryAcceptDecision {
  readonly kind: 'accept'
  readonly content: readonly ResultTextBlock[]
}

/** The `tools/post-execute` delegator handed to the listener by the waterfall. */
export type PostExecuteNextLike = () => Promise<unknown>

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * True when `exec.name` lowercased is `edit` — upstream's tool gate
 * (hook.ts:45, case-insensitive). Total on purpose: upstream would throw on a
 * missing tool field, which for a listener is exactly the fail-open-relevant
 * hazard; here it is simply "not our call".
 */
export function isEditExecution(exec: unknown): boolean {
  if (!isObject(exec)) return false
  const name = (exec as { readonly name?: unknown }).name
  return typeof name === 'string' && name.toLowerCase() === EDIT_TOOL_NAME
}

/**
 * The DSH analog of upstream's `output.output` string: the concatenated `text`
 * blocks of the result's rendered content. A result with no readable text block
 * yields `''`, which is upstream's `typeof output.output !== 'string'` early
 * return (`:46`) expressed on the DSH shape.
 */
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
 * The rebuild in {@link decideEditErrorRecovery} replaces `content`, so this
 * guard is what makes the rewrite unable to drop a non-text block (see the
 * header's DELIVERY section).
 */
export function isTextOnlyResultContent(result: unknown): boolean {
  if (!isObject(result)) return false
  const content = (result as { readonly content?: unknown }).content
  if (!Array.isArray(content)) return false
  return content.every((block) => isObject(block)
    && (block as { readonly type?: unknown }).type === 'text')
}

/**
 * Upstream's predicate, verbatim in behaviour (hook.ts:47-52): lowercase the
 * text once and ask whether ANY pattern is a substring of it.
 */
export function matchesEditErrorTable(text: string): boolean {
  const lower = text.toLowerCase()
  return EDIT_ERROR_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()))
}

/**
 * The pure decision: `undefined` means "not our call, delegate"; a decision
 * means "replace the content with the text + reminder". All leaf reads only —
 * no live dsh object is copied or serialized (plan §4.2 discipline ① for
 * payloads).
 *
 * `isError` is deliberately NOT gated: upstream read only the output text, and
 * an edit failure is a plain isError result on DSH. Gating on `isError` would
 * change the trigger upstream defined (it would also exclude a hypothetical
 * non-error result whose text carried the same wording, which upstream
 * matched).
 */
export function decideEditErrorRecovery(
  exec: unknown,
  result: unknown,
): EditRecoveryAcceptDecision | undefined {
  if (!isEditExecution(exec)) return undefined
  if (!isObject(result)) return undefined
  if (!isTextOnlyResultContent(result)) return undefined
  const text = readRenderedText(result)
  if (text === '') return undefined
  if (text.includes(EDIT_ERROR_REMINDER_MARKER)) return undefined
  if (!matchesEditErrorTable(text)) return undefined
  return { kind: 'accept', content: [{ type: 'text', text: `${text}\n${EDIT_ERROR_REMINDER}` }] }
}

/**
 * The listener body: decide from OUR logic inside a fail-open try/catch, then
 * delegate — or return the rewrite. The `next()` calls are deliberately OUTSIDE
 * the try (header discipline ②).
 */
async function handleEditErrorRecovery(
  exec: unknown,
  result: unknown,
  next: unknown,
): Promise<unknown> {
  const delegate = next as PostExecuteNextLike
  let decision: EditRecoveryAcceptDecision | undefined
  try {
    decision = decideEditErrorRecovery(exec, result)
  } catch {
    // Fail open: our own fault must never turn a successful tool result into an
    // isError, nor erase an edit failure's own diagnostic.
    return delegate()
  }
  if (decision === undefined) return delegate()
  return decision
}

/**
 * Registers the ONE listener through `ctx.on` — the preferred channel, so
 * cordis scopes it to the registering Fiber and the registrar returns nothing.
 * The event comes from the manifest row, never a second literal, so the row
 * stays the single source of truth for "which surface this hook owns".
 */
export const registerEditErrorRecovery: HookRegistrar = (
  ctx,
  entry: HookManifestEntry,
) => {
  ctx.on(entry.event, (exec, result, next) => handleEditErrorRecovery(exec, result, next))
}
