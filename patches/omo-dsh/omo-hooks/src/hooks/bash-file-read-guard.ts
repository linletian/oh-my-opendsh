// bash-file-read-guard.ts — P3-T5 listener (task book WP-2; plan §4.2 pattern C):
// OMO's bash file-read advisory, reborn as ONE DSH `tools/post-execute`
// waterfall listener. This is the C-mode pilot for Phase 3 — the shape the
// other "劝导演出型" hooks copy.
//
// Upstream: packages/omo-opencode/src/hooks/bash-file-read-guard.ts @ v4.19.4
//   (frozen baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a).
//   语义移植（非逐字复制）: the TRIGGER is transcribed verbatim — the three
//   FILE_READ_PATTERNS regexes and the isSimpleFileReadCommand predicate are
//   byte-for-byte upstream (see the regex block below); the DELIVERY is DSH's,
//   not opencode's. No upstream code is vendored; this is a new listener.
//
// KEY DIFFERENCES FROM UPSTREAM (the audit trail the plan §3 SUL discipline
// requires — each one is a deliberate adaptation, not an omission):
//   * Hook point + effect. Upstream registers `tool.execute.before` and its
//     whole effect is `output.message = WARNING_MESSAGE` — a NON-blocking
//     advisory displayed alongside the tool output; the command still runs.
//     DSH's `tools/pre-execute` has NO advisory channel (an `allow` decision
//     carries no payload, and the parsed arguments are deep-frozen, so the
//     upstream trick of attaching a field to `output` has no equivalent —
//     P3-T1 arbitration, plan §4.2 mode C row). The semantically equivalent
//     landing is `tools/post-execute` returning
//     `{ kind: 'accept', additionalContexts: [<user message>] }`: the command
//     executes UNCHANGED (the result is kept, only context is attached) and
//     the advisory reaches the model's NEXT request
//     (dsh-agent-loop/lib/index.js:578).
//   * Advisory text. Upstream's second clause — "and hash anchors" — is
//     dropped: DSH's read tool has no hashline anchors (whether to add one is
//     a Phase 6 hashline-edit decision, plan §4.4). The port therefore promises
//     only what DSH's read tool actually provides: line numbers.
//   * Tool name. Upstream lowercases an opencode-supplied tool id before
//     comparing to "bash"; DSH's tool registry already names the bash tool the
//     canonical lowercase `bash` (dsh-tool-bash/lib/index.js:260, and the
//     persistent variant at dsh-tool-bash-persistent/lib/index.js:330;
//     dsh-bash-local is the executor SERVICE behind it, not a tool), so the
//     comparison is a plain equality against that verified name.
//   * Upstream logged a `[bash-file-read-guard] warned …` line. This port does
//     not: the advisory message IS the observable effect, and boot markers stay
//     the plugin's only boot-time contract (boot-markers.ts header).
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2, all modes):
//   ② the listener body wraps its OWN logic in try/catch and fails OPEN
//      (`return next()`): a throw inside a `tools/post-execute` listener
//      replaces an entire SUCCESSFUL tool result with an isError
//      (dsh-tools/lib/index.js postExecute runs inside the outer try/catch —
//      R-9). The delegation call itself sits OUTSIDE the try, so a rejection
//      from downstream is never mistaken for our own fault and never re-invoked.
//   ③ no disk reads on the event path — the message is built per invocation
//      from a module constant, and nothing else is read.
//   ⑤ no cross-event state: this listener is stateless (no module-level Map,
//      no session bookkeeping), so there is nothing to carry on a service.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar } from '../index.ts'

/** The manifest id this registrar implements (manifest.ts row H-02). */
export const BASH_FILE_READ_GUARD_ID = 'bash-file-read-guard'

/** The one and only DSH event this listener registers on (pattern C). */
export const BASH_FILE_READ_GUARD_EVENT = 'tools/post-execute'

/** Plugin name stamped on the injected advisory message's `source`. */
export const BASH_FILE_READ_GUARD_PLUGIN = 'omo-hooks'

/** The verified DSH bash tool registration name (see the header). */
export const BASH_TOOL_NAME = 'bash'

/**
 * 劝导文案 — the semantic port of upstream's WARNING_MESSAGE. Upstream reads:
 *   "Prefer the Read tool over `cat`/`head`/`tail` for reading file contents.
 *    The Read tool provides line numbers and hash anchors for precise editing."
 * DSH has no hashline anchors (Phase 6 decision), so the second clause is
 * reduced to the capability DSH's read tool actually has. Keep this text
 * stable: the unit test pins it verbatim, and it is the whole model-facing
 * effect of the hook.
 */
export const WARNING_MESSAGE =
  'Prefer the read tool over cat/head/tail for reading file contents. '
  + 'The read tool provides line numbers for precise editing.'

/**
 * The three upstream patterns, TRANSCRIBED VERBATIM from
 * packages/omo-opencode/src/hooks/bash-file-read-guard.ts @ v4.19.4 — including
 * the `(?!-)` negative lookahead that makes an option-carrying invocation
 * (`cat -n f`, `head -3 f`) NOT a match, and the `[^\s|&;]+` class that refuses
 * pipelines, chained commands and redirections spelled with whitespace.
 *
 *   /^\s*cat\s+(?!-)[^\s|&;]+\s*$/                            — `cat <file>`
 *   /^\s*head\s+(-n\s+\d+\s+)?(?!-)[^\s|&;]+\s*$/             — `head [-n N] <file>`
 *   /^\s*tail\s+(-n\s+\d+\s+)?(?!-)[^\s|&;]+\s*$/             — `tail [-n N] <file>`
 *
 * The ORDER is upstream's and is not load-bearing (the predicate is an `some`),
 * but it is kept so a diff against upstream stays a line-by-line read.
 */
export const FILE_READ_PATTERNS: readonly RegExp[] = [
  /^\s*cat\s+(?!-)[^\s|&;]+\s*$/,
  /^\s*head\s+(-n\s+\d+\s+)?(?!-)[^\s|&;]+\s*$/,
  /^\s*tail\s+(-n\s+\d+\s+)?(?!-)[^\s|&;]+\s*$/,
]

/**
 * Upstream's `isSimpleFileReadCommand`, verbatim in behaviour: a command is a
 * simple file read when it matches ANY of the three patterns. Deliberately
 * total — a non-string input is the caller's concern (the listener type-checks
 * `command` before calling this).
 */
export function isSimpleFileReadCommand(command: string): boolean {
  return FILE_READ_PATTERNS.some((pattern) => pattern.test(command))
}

// --- Minimal structural typings of the DSH surface this file touches ---------
// Same discipline as omo-agents/src/hard-blocks-injection.ts: this workspace has
// no dsh dependency, so only the shapes actually read are declared. Everything
// is `readonly` because the real `ToolExecution` is deep-frozen (P3-T1 Q-1).

/** One `text` block of a model-facing user message (dsh-llm ContentBlock). */
export interface AdvisoryTextBlock {
  readonly type: 'text'
  readonly text: string
}

/**
 * The producer declaration on the advisory message. `form: 'notice'` is the
 * DSH vocabulary for "here is what just happened" (the derived
 * `MessageSourceMap['plugin']` shape). Mirrors the hard-blocks precedent's
 * `{ kind: 'plugin', plugin, form }` triple, with this plugin's own name.
 */
export interface AdvisoryPluginSource {
  readonly kind: 'plugin'
  readonly plugin: string
  readonly form: 'notice'
}

/**
 * The advisory user message ferried to the next request. `id` must be unique
 * per message — the inbox validates pending-id uniqueness — so every
 * invocation mints a fresh UUID, exactly like dsh-llm's createUserMessage
 * (mirrored from hard-blocks-injection.ts, the V3 precedent).
 */
export interface AdvisoryUserMessage {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly AdvisoryTextBlock[]
  readonly source: AdvisoryPluginSource
}

/** The `accept` decision carrying the advisory (plan §4.2 mode C). */
export interface AdvisoryAcceptDecision {
  readonly kind: 'accept'
  readonly additionalContexts: readonly AdvisoryUserMessage[]
}

/** The `tools/post-execute` delegator handed to the listener by the waterfall. */
export type PostExecuteNextLike = () => Promise<unknown>

/** Builds the ONE advisory message, with a fresh identity per invocation. */
export function buildAdvisoryMessage(): AdvisoryUserMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: WARNING_MESSAGE }],
    source: { kind: 'plugin', plugin: BASH_FILE_READ_GUARD_PLUGIN, form: 'notice' },
  }
}

/** True when `exec.name` is the verified bash tool name. */
function isBashExecution(exec: unknown): boolean {
  if (typeof exec !== 'object' || exec === null) return false
  return (exec as { readonly name?: unknown }).name === BASH_TOOL_NAME
}

/**
 * Reads `exec.arguments.command` defensively: a missing/non-object arguments
 * bag or a missing field is simply "not a match" (upstream's
 * `typeof command !== "string"` early return). A THROWING property accessor is
 * the caller's problem — `decideBashFileReadAdvisory` runs inside the fail-open
 * try/catch.
 */
function readBashCommand(argumentsBag: unknown): unknown {
  if (typeof argumentsBag !== 'object' || argumentsBag === null) return undefined
  return (argumentsBag as { readonly command?: unknown }).command
}

/**
 * The pure decision: `undefined` means "not our call, delegate" and a decision
 * means "attach the advisory, keep the result". All leaf reads only — no live
 * dsh object is copied or serialized (plan §4.2 discipline ① for payloads).
 */
export function decideBashFileReadAdvisory(exec: unknown): AdvisoryAcceptDecision | undefined {
  if (!isBashExecution(exec)) return undefined
  const command = readBashCommand((exec as { readonly arguments?: unknown }).arguments)
  if (typeof command !== 'string') return undefined
  if (!isSimpleFileReadCommand(command)) return undefined
  return { kind: 'accept', additionalContexts: [buildAdvisoryMessage()] }
}

/**
 * The listener body: decide from OUR logic inside a fail-open try/catch, then
 * delegate — or return the advisory decision. The `next()` calls are
 * deliberately OUTSIDE the try so a downstream rejection propagates once
 * instead of being swallowed and retried (see the header's discipline ②).
 *
 * Parameters are typed `unknown` because `ctx.on` (index.ts
 * HooksRegistrationContext) hands a listener `readonly unknown[]`; the two
 * branches narrow through the typed helpers above rather than casting the
 * payload into a pretend shape.
 */
async function handleBashFileReadGuard(exec: unknown, next: unknown): Promise<unknown> {
  const delegate = next as PostExecuteNextLike
  let decision: AdvisoryAcceptDecision | undefined
  try {
    decision = decideBashFileReadAdvisory(exec)
  } catch {
    // Fail open (discipline ②): our own fault must never turn a successful bash
    // result into an isError. The upstream hook had no such hazard because a
    // pre-execute advisory cannot corrupt a result.
    return delegate()
  }
  if (decision === undefined) return delegate()
  return decision
}

/**
 * Registers the ONE listener through `ctx.on` — the preferred channel, so cordis
 * scopes it to the registering Fiber and the registrar returns nothing (the T3
 * loop only forwards a RAW disposer to `ctx.effect`; index.ts header ①). The
 * event comes from the manifest row, never a second literal, so the row stays
 * the single source of truth for "which surface this hook owns".
 */
export const registerBashFileReadGuard: HookRegistrar = (
  ctx,
  entry: HookManifestEntry,
) => {
  ctx.on(entry.event, (exec, _result, next) => handleBashFileReadGuard(exec, next))
}
