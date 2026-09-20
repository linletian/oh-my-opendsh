// task-resume-info.ts — P3-T15 listener (task book WP-6 批 B; plan §4.2 pattern
// D): OMO's "here is how to continue that delegation" tip, reborn as ONE DSH
// `tools/post-execute` waterfall listener.
//
// Upstream: packages/omo-opencode/src/hooks/task-resume-info/ @ v4.19.4 (frozen
//   baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a; THREE files =
//   2 implementation (hook.ts, index.ts) + 1 test file; test seed
//   `index.test.ts`, 7 `it`). 语义移植（非逐字复制）: the THREE GATES (tool gate →
//   error/duplicate guards → id extraction → append) are transcribed branch for
//   branch; the ID SOURCE and the appended CALL are DSH's (mapping below). No
//   upstream code is vendored; this is a new listener.
//
// ═══════════ 前置（任务书要求先答）: 是否实质依赖未移植的 OMO task 工具族？—— 否，可独立成立 ═══════════
// The task book's condition was: "若实质依赖未移植 task 系统 → 停止实现、报告改判跳过
// 建议与逐字证据". Measured file by file with `git show v4.19.4:<path>`, the
// answer is NO, and the evidence is the module's ENTIRE dependency surface —
// there is nothing else in these three files:
//
//   hook.ts:1   import { extractTaskLink } from "../../features/tool-metadata-store"
//   hook.ts:3   const TARGET_TOOLS = ["task", "Task", "task_tool", "call_omo_agent"]
//   hook.ts:10  if (!TARGET_TOOLS.includes(input.tool)) return
//   hook.ts:11  const outputText = output.output ?? ""
//   hook.ts:12  if (outputText.startsWith("Error:") || outputText.startsWith("Failed")) return
//   hook.ts:13  if (outputText.includes("\nto continue:")) return
//   hook.ts:15  const link = extractTaskLink(output.metadata, outputText)
//   hook.ts:16  const taskId = link.taskId ?? link.sessionId
//   hook.ts:17  if (!taskId) return
//   hook.ts:19-21  output.output = outputText.trimEnd() +
//                    `\n\nto continue: task(task_id="${taskId}", load_skills=[], run_in_background=false, prompt="...")`
//
// and the one imported helper is a PURE PARSER, not part of the task system
// (features/tool-metadata-store/task-metadata-contract.ts:115-143 `extractTaskLink`
// reads a metadata record's `sessionId`/`taskId`/`backgroundTaskId`/`agent`/
// `category` (readSessionIdFromMetadata :23-25 etc.), else a `<task_metadata>`
// block, else the regex `/Session ID:\s*(ses_[a-zA-Z0-9_-]+)/g` (:51) — it calls
// no task tool, holds no state, touches no store).
//
// THREE consequences, each fixing one mapping below:
//   1. `TARGET_TOOLS` names OMO's task-family TOOLS; the hook never CALLS them. So
//      the dependency is a NAME LIST, and the DSH port needs DSH's own delegation
//      names — which exist (agent-usage-reminder.ts {@link DELEGATION_TOOL_NAMES}).
//   2. `link.backgroundTaskId` IS PARSED AND THEN DELIBERATELY UNUSED
//      (`const taskId = link.taskId ?? link.sessionId`, :16). That is upstream's
//      own judgement that only a session/task id is continuable, and it is why the
//      DSH port maps exactly the CONTINUABLE subagent id and ignores the
//      one-shot background job id (below).
//   3. The appended string is OMO's `task(task_id=…)` signature. DSH has no `task`
//      tool, no `task_id` argument and no `load_skills`; the P3-T1 §4 note already
//      marks this as a MUST-REWRITE coupling point.
// CONCLUSION (recorded, not silent): the module stands on its own. It does NOT
// depend on the OMO task tool family — it depends on (a) the name of whatever tool
// returns a delegatable child and (b) how that child is continued, and DSH has both.
// It is therefore PORTED, not skipped; no DoD-d reclassification is proposed.
//
// ═══════════ 前置① — THE DSH DELEGATION RESULT, VERIFIED VERBATIM ═══════════
// Upstream read `output.metadata` (+ text fallback) for a `ses_…` session id. The
// DSH subagent tool publishes a STRUCTURED value with a discriminated `kind`
// (dsh-tool-subagent/lib/index.js:440-486, the output schema + its render):
//
//   { kind: "continuable", subagentId }      → text `started subagent ${subagentId}`
//   { kind: "background",  jobId }           → text `started background subagent job ${jobId}`
//   { kind: "foreground",  runId, output }   → text = the child's own rendered output
//
// `normalizeDispatchResult` (dsh-tools/lib/index.js:3447-3459) re-creates the
// successful result through `createSuccessResult(exec, tool, result.value)`, so a
// `tools/post-execute` listener DOES see `result.value` — the structured copy — and
// `result.content` carries the rendered text above. The port reads `value` first
// (upstream's metadata branch) and falls back to the rendered TEXT (upstream's
// `extractExplicitSessionId` branch) via `/started subagent (\S+)/`.
//
// THE CONTINUATION SURFACE (the rewrite that matters): DSH resumes a delegated
// child with `send_message` — "Send a message to a direct continuable child by its
// agent id. … if it is idle, the message starts a turn"
// (dsh-tool-subagent-control/lib/index.js:23-24; `agent_id` + `message` are its two
// declared arguments). So upstream's appended call becomes
//
//   upstream  `\n\nto continue: task(task_id="${taskId}", load_skills=[], run_in_background=false, prompt="...")`
//   DSH       `\n\nto continue: send_message(agent_id="${subagentId}", message="...")`
//
// WHY THE BACKGROUND KIND GETS NOTHING (a scope boundary inherited from upstream,
// not a silent narrowing): upstream parsed `backgroundTaskId` and never used it
// (前置 point 2). On DSH a one-shot background job has no durable agent id to
// continue — the shipped concerto rows are all `continuable`
// (agent.cordis.yml's `backgroundMode: continuable`; P3-T13 measured that a
// `one-shot` flip is a scenario-local fixture edit precisely because the shipped
// composition never produces one) — so `job_output(job_id=…)` would be a COLLECT
// call, not a continuation. Emitting no hint for that kind therefore reproduces
// upstream's `taskId ?? sessionId` judgement instead of inventing a new one; the
// unit suite pins that the `background` value is left untouched.
//
// `subagent_fork` publishes the SAME value shape and is included in the tool gate
// for the same reason.
//
// ═══════════ REGISTERED ASSUMPTION — WHY `foreground` PRODUCES NO TIP ═══════════
// (P3-T15 arbitration note + the companion half of the composition registration.)
// The `foreground` kind is recognized and deliberately left alone (前置 point 2).
// That gate rests on ONE current DSH fact: a foreground child is disposed when its
// run settles (`settleForegroundRun`; a settled foreground run leaves no
// continuable id behind), so there is no id this tip could name. REGISTERED
// ASSUMPTION: if a future DSH release makes a foreground sub-session continuable —
// an id that outlives the settled run — this gate MUST be re-evaluated, because the
// port would then owe the `foreground` kind the same tip it already gives
// `continuable`. It is an assumption about the HOST, not a property of this hook.
// The ORDERED-PAIR half of this row's registration (row 11 relative to the earlier
// `empty-task-response-detector`, row 3, which ends the waterfall chain without
// `next()` on an empty render) is recorded ONCE in index.ts' COMPOSITION-ORDER
// SEMANTICS note and is deliberately not duplicated here: the check found that the
// pair has no behavioral interaction, and both facts are registered together per
// the P3-T15 arbitration.
//
// ═══════════ 前置② — THE TOOL GATE ═══════════
// Upstream matched with `Array.includes` — EXACT, CASE-SENSITIVE — over
// ["task", "Task", "task_tool", "call_omo_agent"] (i.e. three distinct names plus
// the `Task` case variant OMO also registered). DSH registers canonical lowercase
// tool ids, so the case variant has no DSH analog and the port matches DSH's
// delegation surface exactly: {@link TASK_RESUME_TARGET_TOOLS} IS
// `DELEGATION_TOOL_NAMES` (one statement of that surface, shared with
// agent-usage-reminder.ts so a name can never diverge). The upstream list is kept
// verbatim as the audit trail.
//
// ═══════════ DELIVERY: `accept` + `content` (the 批 B choice) ═══════════
// Upstream assigned `output.output = outputText.trimEnd() + "\n\nto continue: …"`,
// i.e. it rewrote the RESULT the model reads (and note the `trimEnd()`: trailing
// whitespace of the original text is dropped — ported as-is). `accept` + `content`
// (dsh-tools/lib/index.js:3377-3406) rebuilds the rendered text the same way;
// `additionalContexts` would instead detach the tip into a later request. The
// rebuild only touches TEXT-ONLY content (the sibling's `isTextOnlyResultContent`),
// so no image/file block can be lost.
//
// THE THREE GATES ARE TRANSCRIBED LITERALLY, including the `"Failed"` prefix, which
// is OMO wording with no DSH producer: it is kept because dropping it would narrow
// the upstream contract, and the unit suite pins it as retained-by-transcription.
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2): ② the listener body wraps its OWN logic
// in try/catch and fails OPEN (`return next()`), with `next()` OUTSIDE the try;
// ③ no disk reads on the event path — the tool list, the two gate literals and the
// hint template are module constants built at import time; ⑤ no cross-event state —
// upstream had none either (no Map, no storage.ts, one registered surface).
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar } from '../index.ts'
import { DELEGATION_TOOL_NAMES } from './agent-usage-reminder.ts'
import {
  isTextOnlyResultContent,
  readRenderedText,
  type PostExecuteNextLike,
  type TruncatorAcceptDecision,
} from './tool-output-truncator.ts'

/** The manifest id this registrar implements (manifest.ts row H-23). */
export const TASK_RESUME_INFO_ID = 'task-resume-info'

/** The one and only DSH event this listener registers on (pattern D). */
export const TASK_RESUME_INFO_EVENT = 'tools/post-execute'

/** Upstream hook.ts:3, transcribed VERBATIM as the audit-trail reference. */
export const UPSTREAM_TASK_RESUME_TARGET_TOOLS: readonly string[] = [
  'task',
  'Task',
  'task_tool',
  'call_omo_agent',
]

/**
 * The live gate in DSH's tool namespace: the SAME delegation surface
 * agent-usage-reminder.ts owns (header 前置②). Exported so the unit suite can pin
 * that the two modules cannot drift apart.
 */
export const TASK_RESUME_TARGET_TOOLS: readonly string[] = DELEGATION_TOOL_NAMES

/** Upstream hook.ts:12 — the two error prefixes, transcribed verbatim. */
export const TASK_RESUME_ERROR_PREFIXES: readonly string[] = ['Error:', 'Failed']

/** Upstream hook.ts:13 / :21 — the continuation sentinel AND the appended prefix. */
export const TASK_RESUME_CONTINUATION_MARKER = 'to continue:'

/** Upstream hook.ts:16 — the id field it actually used (`taskId ?? sessionId`). */
export const DSH_CONTINUABLE_KIND = 'continuable'

/** The two recognized non-continuable kinds (upstream parsed but never used them). */
export const DSH_NON_CONTINUABLE_KINDS: readonly string[] = ['background', 'foreground']

/**
 * The DSH render prefix of a continuable delegation (dsh-tool-subagent:486,
 * verbatim `` `started subagent ${value.subagentId}` ``). The text fallback is the
 * DSH analog of upstream's `extractExplicitSessionId` regex.
 */
export const DSH_CONTINUABLE_TEXT_PREFIX = 'started subagent '
export const DSH_CONTINUABLE_TEXT_PATTERN = /started subagent (\S+)/

/** The one accept-decision shape this module produces (mode D). */
export type TaskResumeDecision = TruncatorAcceptDecision

/** Upstream's `TaskLink`, reduced to the ONE field its call site used. */
export interface TaskResumeLink {
  readonly subagentId?: string
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/** A non-empty trimmed string leaf, or undefined (hostile payloads are total). */
export function readTrimmedStringField(source: unknown, key: string): string | undefined {
  if (!isObject(source)) return undefined
  const value = (source as Record<string, unknown>)[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Upstream's `link.taskId ?? link.sessionId` (`hook.ts:16`), re-homed onto the DSH
 * value: the CONTINUABLE child id and nothing else. `background`/`foreground` are
 * RECOGNIZED (so the text fallback is not consulted, exactly as upstream returned
 * early from its metadata branch) but carry no continuable id.
 */
export function readTaskResumeLinkFromValue(value: unknown): {
  readonly recognized: boolean
  readonly link: TaskResumeLink
} {
  if (!isObject(value)) return { recognized: false, link: {} }
  const kind = readTrimmedStringField(value, 'kind')
  if (kind === DSH_CONTINUABLE_KIND) {
    return { recognized: true, link: { subagentId: readTrimmedStringField(value, 'subagentId') } }
  }
  if (kind !== undefined && DSH_NON_CONTINUABLE_KINDS.includes(kind)) {
    return { recognized: true, link: {} }
  }
  return { recognized: false, link: {} }
}

/** Upstream's text fallback (its `extractExplicitSessionId`), in DSH wording. */
export function readTaskResumeLinkFromText(text: string): TaskResumeLink {
  const match = DSH_CONTINUABLE_TEXT_PATTERN.exec(text)
  const subagentId = match?.[1]?.trim()
  return subagentId === undefined || subagentId === '' ? {} : { subagentId }
}

/**
 * The appended continuation tip — the ONE rewrite the header records:
 * `send_message(agent_id="<id>", message="...")` replaces OMO's
 * `task(task_id="<id>", load_skills=[], run_in_background=false, prompt="...")`.
 * It carries the same leading `\n\n` and the same `to continue:` sentinel, so the
 * duplicate gate above is self-satisfying after one injection.
 */
export function buildTaskResumeHint(subagentId: string): string {
  return `\n\n${TASK_RESUME_CONTINUATION_MARKER} send_message(agent_id="${subagentId}", message="...")`
}

/**
 * The pure decision: `undefined` means "not our call / nothing to say, delegate";
 * a decision means "rewrite the content as the trimmed text plus the tip".
 * Gate order is upstream's, one for one.
 */
export function decideTaskResumeInfo(
  exec: unknown,
  result: unknown,
): TaskResumeDecision | undefined {
  if (!isObject(exec)) return undefined
  const name = (exec as { readonly name?: unknown }).name
  if (typeof name !== 'string' || !TASK_RESUME_TARGET_TOOLS.includes(name)) return undefined
  if (!isObject(result) || !isTextOnlyResultContent(result)) return undefined

  const outputText = readRenderedText(result)
  if (TASK_RESUME_ERROR_PREFIXES.some((prefix) => outputText.startsWith(prefix))) return undefined
  if (outputText.includes(`\n${TASK_RESUME_CONTINUATION_MARKER}`)) return undefined

  const fromValue = readTaskResumeLinkFromValue((result as { readonly value?: unknown }).value)
  const link = fromValue.recognized ? fromValue.link : readTaskResumeLinkFromText(outputText)
  const subagentId = link.subagentId
  if (subagentId === undefined) return undefined

  return {
    kind: 'accept',
    content: [{ type: 'text', text: `${outputText.trimEnd()}${buildTaskResumeHint(subagentId)}` }],
  }
}

/**
 * The listener body: decide from OUR logic inside a fail-open try/catch, then
 * delegate — or return the rewrite. `next()` sits OUTSIDE the try (discipline ②):
 * a throw inside a `tools/post-execute` listener replaces an entire successful tool
 * result with an isError (dsh-tools/lib/index.js:3241-3248).
 */
async function handleTaskResumeInfo(
  exec: unknown,
  result: unknown,
  next: unknown,
): Promise<unknown> {
  const delegate = next as PostExecuteNextLike
  let decision: TaskResumeDecision | undefined
  try {
    decision = decideTaskResumeInfo(exec, result)
  } catch {
    return delegate()
  }
  if (decision === undefined) return delegate()
  return decision
}

/**
 * Registers the ONE listener through `ctx.on` — the preferred channel, so cordis
 * scopes it to the registering Fiber and the registrar returns nothing. Upstream
 * registered exactly ONE surface too (`hook.ts:24-26`), and this module holds no
 * state, so there is no life-cycle half. The event comes from the manifest row.
 */
export const registerTaskResumeInfo: HookRegistrar = (
  ctx,
  entry: HookManifestEntry,
) => {
  ctx.on(entry.event, (exec, result, next) => handleTaskResumeInfo(exec, result, next))
}
