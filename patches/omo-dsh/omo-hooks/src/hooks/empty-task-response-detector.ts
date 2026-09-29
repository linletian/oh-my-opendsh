// empty-task-response-detector.ts — P3-T7 listener (task book WP-3; plan §4.2
// pattern D): OMO's empty-task-result detector, reborn as ONE DSH
// `tools/post-execute` waterfall listener. This is the D-mode companion of the
// E-mode pilot in the same task.
//
// Upstream: packages/omo-opencode/src/hooks/empty-task-response-detector.ts @
//   v4.19.4 (frozen baseline tag, commit
//   b072d279110bdda2c6ac2525d0d24dc54d16148a; ONE implementation file, no test
//   file — see manifest.ts row H-07). 语义移植（非逐字复制）: the TRIGGER
//   (`tool === Task/task` + empty trimmed output) is transcribed from
//   `:18-24`; the DELIVERY and the wording's harness-specific clauses are
//   DSH's. No upstream code is vendored.
//
// UPSTREAM EFFECT (verbatim, :18-24):
//
//   if (input.tool !== "Task" && input.tool !== "task") return
//   const responseText = output.output?.trim() ?? ""
//   if (responseText === "") {
//     output.output = EMPTY_RESPONSE_WARNING
//   }
//
// i.e. an IN-PLACE rewrite of the tool result — no blocking, no argument
// change. DSH's equivalent is the `accept` decision REPLACING `content`:
// `{ kind: 'accept', content: [<warning text block>] }`
// (dsh-tools/lib/types/index.d.ts:432-436; applied at dsh-tools/lib/index.js
// postExecute :3377-3406, which replaces `content` when the decision carries it
// and keeps the call successful). `additionalContexts` was the other candidate
// and was REJECTED: it ferries a separate message into the NEXT request and
// leaves the empty result in the transcript, which is exactly NOT what upstream
// does — upstream makes the warning BE the result text. On an empty original
// there is nothing to preserve, so a replacement is lossless here.
//
// WHY NOT `block`: upstream never blocked; a `block` would turn a SUCCESSFUL
// subagent run into an isError and could trigger retry logic the upstream hook
// deliberately avoided.
//
// U-7 — THE PREREQUISITE CHECK (mandatory; plan §4.2 DoD-d). Question: does DSH
// already correct an empty subagent result natively? Measured at the pinned
// install:
//   * dsh-subagent/lib/index.js `AssistantOutputFold.collect()` (:203-210) —
//     "the last non-empty assistant message, else the accumulated streamed
//     text, or `undefined` when the child produced neither".
//   * dsh-tool-subagent/lib/index.js:484-487 renders a foreground result as
//     `[{ type: 'text', text: outputValueText(value.output) }]`, and
//     `outputValueText` joins the text blocks — an empty `output` renders an
//     EMPTY text string, with no warning, no annotation, no diagnostic.
//   CONCLUSION: DSH has NO native equivalent correction, so the port proceeds
//   (U-7 前置通过). Two halves of upstream's warning ARE natively covered and
//   are therefore narrowed away — recorded here, not silently dropped:
//     (a) "Failed to execute properly" / "Did not terminate correctly": a
//         non-`completed` stop reason is materialized as an isError result by
//         `stopReasonError` (dsh-tool-subagent/lib/index.js:286-296) BEFORE
//         post-execute, with the child's diagnostic and partial output
//         attached. This listener therefore SKIPS `isError` results: they
//         already carry a non-empty diagnostic, and replacing their content
//         would erase the failure reason.
//     (b) The note sentence "The call has already completed - you are NOT
//         waiting for a response" IS true on DSH too (a foreground delegation
//         settles before post-execute runs), so its intent is kept and made
//         actionable: the model must not wait, it must re-delegate or proceed.
//
// THE DELEGATION TOOL-NAME SET (and the one place this port is a deliberate
// superset). Upstream tests two literals, `Task` / `task` (no `toLowerCase()`
// — P3-T1'S §7 note: upstream is internally inconsistent about this). DSH has
// one `dsh-tool-subagent` instance PER delegation tool, each with its own
// `toolName`:
//   * {@link ROSTER_DELEGATION_TOOL_NAMES} — the 10 roster ids, transcribed by
//     hand from patches/omo-dsh/omo-agents/src/roster.ts `DELEGATION_TOOL_NAMES`
//     (roster.ts:321-330, where `id == toolName` per roster.ts:70,10). They are
//     COPIED, not imported: the plan §4.1 boundary forbids an import between
//     omo-agents and omo-hooks ("The two plugins have NO import of each other").
//     A drift guard in the unit suite asserts the copy still equals the real
//     roster export, so the copy cannot rot silently.
//   * {@link BASE_SUBAGENT_TOOL_NAMES} — `subagent` / `subagent_fork`, the two
//     delegation tools the PINNED BASE composition mounts
//     (dsh-base/cordis.patch.yml:349-366). They are NOT roster tools, so the
//     task book's stated set (the 10) does not name them; they are included
//     anyway because the empty-result disease is identical for them and a
//     delegation that returns nothing is exactly what this hook exists to
//     catch. The split into two constants keeps the deviation explicit and
//     reversible — arbitration can drop the second from {@link
//     DELEGATION_TOOL_NAMES} without touching the transcribed 10.
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2, all modes):
//   ② the listener body wraps its OWN logic in try/catch and fails OPEN
//      (`return next()`): a throw inside a `tools/post-execute` listener
//      replaces an entire SUCCESSFUL tool result with an isError —
//      dsh-tools/lib/index.js `finalizeScheduledExecution` (:3241-3248) awaits
//      `postExecute` inside a try/catch whose catch materializes
//      `toolErrorResult(error)` (R-9). The delegation call itself sits OUTSIDE
//      the try, so a rejection from downstream is never mistaken for our own
//      fault and never re-invoked.
//   ③ no disk reads on the event path — the warning text is a module constant.
//   ⑤ no cross-event state: this listener is stateless (no Map, no session
//      bookkeeping).
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar } from '../index.ts'

/** The manifest id this registrar implements (manifest.ts row H-07). */
export const EMPTY_TASK_RESPONSE_DETECTOR_ID = 'empty-task-response-detector'

/** The one and only DSH event this listener registers on (pattern D). */
export const EMPTY_TASK_RESPONSE_DETECTOR_EVENT = 'tools/post-execute'

/**
 * The 10 roster delegation toolNames, transcribed by hand from roster.ts
 * `DELEGATION_TOOL_NAMES` (see the header for why this is a copy). Order is the
 * roster's priority order and is not load-bearing for detection — it is kept so
 * a diff against roster.ts stays a line-by-line read.
 */
export const ROSTER_DELEGATION_TOOL_NAMES: readonly string[] = [
  'explore',
  'hephaestus',
  'oracle',
  'librarian',
  'plan-consultant',
  'plan-reviewer',
  'atlas',
  'multimodal-looker',
  'sisyphus-junior',
  'prometheus',
]

/**
 * The two delegation tools the pinned base composition mounts
 * (dsh-base/cordis.patch.yml:349-366; `toolName` defaults and overrides there).
 * See the header: an explicit, reversible superset of the task book's set.
 */
export const BASE_SUBAGENT_TOOL_NAMES: readonly string[] = ['subagent', 'subagent_fork']

/** Every tool name whose result this listener inspects. */
export const DELEGATION_TOOL_NAMES: readonly string[] = [
  ...ROSTER_DELEGATION_TOOL_NAMES,
  ...BASE_SUBAGENT_TOOL_NAMES,
]

/**
 * 纠正文案 — the semantic port of upstream's `EMPTY_RESPONSE_WARNING`
 * (`:3-10`). Verbatim except for two adaptations the header records in full:
 * the two "failed / did not terminate" bullets are collapsed into one (those
 * cases are isError natively in DSH, and this listener skips isError), and the
 * closing sentence is made actionable rather than merely reassuring. Keep this
 * text stable: the unit test pins it verbatim, and it is the whole
 * model-facing effect of the hook.
 */
export const EMPTY_RESPONSE_WARNING = `[Task Empty Response Warning]

The delegated task completed but returned no response. This indicates the subagent either:
- Did not report a result
- Returned an empty result

Note: The call has already completed - the result is final and you are NOT waiting for a response. Do not wait for it. Re-delegate with a more explicit instruction, or continue the work yourself.`

/** The `tools/post-execute` delegator handed to the listener by the waterfall. */
export type PostExecuteNextLike = () => Promise<unknown>

/** One `text` block of a tool result's rendered content (dsh-llm ContentBlock). */
export interface DetectorTextBlock {
  readonly type: 'text'
  readonly text: string
}

/** The `accept` decision replacing the empty result's content (plan §4.2 mode D). */
export interface DetectorAcceptDecision {
  readonly kind: 'accept'
  readonly content: readonly DetectorTextBlock[]
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * True when `exec.name` is one of {@link DELEGATION_TOOL_NAMES}. A missing /
 * non-object exec or name is "not our call".
 */
export function isDelegationExecution(exec: unknown): boolean {
  if (!isObject(exec)) return false
  const name = (exec as { readonly name?: unknown }).name
  return typeof name === 'string' && DELEGATION_TOOL_NAMES.includes(name)
}

/**
 * The DSH analog of upstream's `output.output?.trim() ?? ""`: the concatenated
 * `text` blocks of the result's rendered content, trimmed. A result with no
 * readable text block at all counts as empty — that is precisely the shape an
 * empty `outputValueText` render produces (dsh-tool-subagent/lib/index.js:484).
 * Non-text blocks (images, files) are NOT required to be absent: upstream
 * judged only the text output, so this does too.
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
 * The pure decision: `undefined` means "not our call, delegate", a decision
 * means "replace the content with the warning". All leaf reads only — no live
 * dsh object is copied or serialized (plan §4.2 discipline ① for payloads).
 *
 * `isError` results are skipped BY DESIGN (header U-7(a)): DSH already attached
 * the child's diagnostic there, and upstream's warning would erase it.
 */
export function decideEmptyTaskResponse(
  exec: unknown,
  result: unknown,
): DetectorAcceptDecision | undefined {
  if (!isDelegationExecution(exec)) return undefined
  if (!isObject(result)) return undefined
  if ((result as { readonly isError?: unknown }).isError === true) return undefined
  if (readRenderedText(result).trim() !== '') return undefined
  return { kind: 'accept', content: [{ type: 'text', text: EMPTY_RESPONSE_WARNING }] }
}

/**
 * The listener body: decide from OUR logic inside a fail-open try/catch, then
 * delegate — or return the corrective decision. The `next()` calls are
 * deliberately OUTSIDE the try so a downstream rejection propagates once
 * instead of being swallowed and retried (see the header's discipline ②).
 */
async function handleEmptyTaskResponse(
  exec: unknown,
  result: unknown,
  next: unknown,
): Promise<unknown> {
  const delegate = next as PostExecuteNextLike
  let decision: DetectorAcceptDecision | undefined
  try {
    decision = decideEmptyTaskResponse(exec, result)
  } catch {
    // Fail open (discipline ②): our own fault must never turn a successful
    // delegation result into an isError.
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
export const registerEmptyTaskResponseDetector: HookRegistrar = (
  ctx,
  entry: HookManifestEntry,
) => {
  ctx.on(entry.event, (exec, result, next) => handleEmptyTaskResponse(exec, result, next))
}
