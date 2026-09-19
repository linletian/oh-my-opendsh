// todo-continuation-enforcer.ts — P3-T7 listener (task book WP-3; plan §4.2
// pattern E): OMO's todo continuation discipline, reborn as ONE DSH
// `agent/turn-stopping` serial listener. This is the E-mode pilot for Phase 3 —
// the "续行票" shape the rest of the executor group copies. The pair's e2e is
// **P3-T9** (scenario `todo-continuation-enforced`, tests/e2e/drive.mjs) — that,
// not a later batch task, is this module's next work item.
//
// Upstream: packages/omo-opencode/src/hooks/todo-continuation-enforcer/ @
//   v4.19.4 (frozen baseline tag, commit
//   b072d279110bdda2c6ac2525d0d24dc54d16148a). 语义移植（非逐字复制）: the
//   TODO-STATE PREDICATE (todo.ts) and the continuation TEXT (constants.ts,
//   plus the prompt assembly in continuation-injection.ts:167-174) are
//   transcribed verbatim; the DELIVERY is DSH's, not opencode's. No upstream
//   code is vendored; this is a new listener.
//
//   The 17 upstream implementation files this module's semantics were read from
//   (the plan §4.9 逐文件署名 requirement), each one either transcribed above or
//   explicitly excluded with its reason below:
//     abort-detection.ts              — NOT PORTED (opencode abort window)
//     compaction-guard.ts             — NOT PORTED (DSH compression cannot lose todos)
//     constants.ts                    — PORTED (MAX_CONSECUTIVE_FAILURES, CONTINUATION_PROMPT)
//     continuation-injection.ts       — PORTED (prompt assembly; delivery re-homed)
//     countdown.ts                    — NOT PORTED (TUI toast/countdown)
//     handler.ts                      — PORTED (event selection: turn-stopping replaces session.idle)
//     idle-event.ts                   — PARTIAL (the 24-gate idle machine shrinks to the gates below)
//     index.ts                        — PORTED (registration surface)
//     message-directory.ts            — NOT PORTED (opencode message-directory layout)
//     non-idle-events.ts              — NOT PORTED (opencode event vocabulary)
//     pending-question-detection.ts   — NOT PORTED (opencode question API)
//     resolve-message-info.ts         — NOT PORTED (message-directory lookup)
//     session-state.ts                — PARTIAL (in-process per-session state → closure WeakMap)
//     stagnation-detection.ts         — NOT PORTED (folded into the single breaker)
//     todo.ts                         — PORTED (the verbatim status predicate)
//     token-limit-detection.ts        — NOT PORTED (opencode token-limit event)
//     types.ts                        — PORTED (registration/event typing, re-declared structurally)
//
// THE E-MODE MECHANISM (P3-T1 correction — NOT a vote). The task book and plan
// §4.2 both record the same measured fact: a listener's RETURN VALUE on
// `agent/turn-stopping` is DISCARDED by the driver. The event's own contract
// (dsh-agent/lib/types/runtime-types.d.ts:379-400) reads, verbatim:
//
//   "Awaited before the boundary commits — a listener that objects steers
//    (`agent.steer(...)`) and the machine re-reads its inbox: fresh steering
//    runs another step, none closes the turn. Data decides, so listener order
//    cannot change the outcome."
//
// So the ONE effect of this file is the SIDE EFFECT `agent.steer(userMessage)`,
// exactly like DSH's own precedent
// (dsh-hooks-claude-code/lib/index.js:292-307, the Claude "Stop hook" bridge:
// `agent.steer(createUserMessage({content: [{type: 'text', text}], source}))`).
// Returning nothing is deliberate, and the listener below returns `void`.
//
// WHAT IS DELIBERATELY *NOT* PORTED (each with its reason — the plan §3 SUL
// discipline requires an audit trail, not an omission):
//   * toast / countdown UI (`countdown.ts`, `COUNTDOWN_SECONDS`,
//     `TOAST_DURATION_MS`, `COUNTDOWN_GRACE_PERIOD_MS`) — `ctx.client.tui
//     .showToast` is the opencode TUI's own API; DSH has no toast and plan §5
//     explicitly excludes pixel-level TUI fidelity. The observable effect of
//     this hook is the steering message, nothing else.
//   * abort-detection (`ABORT_WINDOW_MS`) / opencode-overload-continuation /
//     parent-wake-race (`backgroundManager.hasPendingParentWake`) — opencode
//     platform pathologies with no DSH surface: DSH has no `session.idle`
//     abort window, no opencode SDK overload mode, and no OMO background-agent
//     manager. Their upstream tests are named after the platform
//     (`opencode-overload-continuation.test.ts`, `parent-wake-race.test.ts`),
//     which P3-T1 already flagged as non-transplantable.
//   * the on-disk continuation marker (`message-directory.ts`,
//     `clearContinuationMarker`) — that is OMO's cross-process resume
//     mechanism. DSH's session log is the durable source of truth
//     (`dsh-session-persistence-jsonl` for the file backend;
//     `dsh-session-query-sqlite` for the SQLite/FTS5 backend — the pinned
//     install ships those two names, there is no
//     `dsh-session-persistence-sqlite`), so a second marker file would be a
//     parallel state store with no reader. This is why the state below is
//     purely in-process.
//   * `compaction-guard.ts` (`COMPACTION_GUARD_MS`, `recentCompactionEpoch`,
//     `acknowledgedCompactionEpoch`) — P3-T1 Q-3.3 proved the disease does not
//     exist in DSH: `todo/write` is a NON-surface log-only event
//     (dsh-tool-todo/lib/types/types.d.ts:28 "Log-only UI state; never derived
//     history"), so compaction cannot shadow the todo list.
//   * `pending-question-detection.ts` / message-directory lookup — both read
//     the opencode question API and message-directory layout
//     (`isSqliteBackend`, `getMessageDir`), which P3-T1 §3 平台耦合点 lists as
//     the heaviest platform coupling of this module. DSH has no such storage
//     probe (`p3t1-upstream-p0-p3.md` 移植难点 5: "不要试图移植该分支").
//   * `stagnation-detection.ts` (`MAX_STAGNATION_COUNT` = 3) and the remaining
//     24-gate `session.idle` state machine (`idle-event.ts`) — those gates
//     exist because opencode re-enters `session.idle` for many platform
//     reasons. DSH's single `agent/turn-stopping` boundary plus the
//     circuit breaker below is the whole surface this port owns. Shrinking the
//     gate set is recorded here as a KNOWING reduction, not a silent one.
//   * upstream `skipAgents` (`DEFAULT_SKIP_AGENTS`, constants.ts:5, verbatim
//     `["prometheus", "compaction", "plan"]`; enforced at
//     continuation-injection.ts:149 and by idle-event.ts gate 19, both on the
//     resolved agent's config key) — DELIBERATELY RELAXED, not dropped. DSH has
//     no per-agent hook configuration surface: a listener is registered once
//     per deployment, not per roster row, so this port steers EVERY agent and
//     the progress breaker below is the single bound. The noise from a
//     read-only subagent that leaves todos open is bounded (5 consecutive
//     no-progress continuations at most). L4 observation decides whether to
//     narrow by the roster `class` field; if so, that filter belongs in this
//     same listener as one more gate, not in configuration.
//
// R-8 — RELATIONSHIP TO `dsh-goal-round-driver` (mandatory record; plan §4.2
// R-8). Read at the pinned DSH install,
// dsh-goal-round-driver/lib/index.js. Verbatim findings:
//   * Its continuation predicate is `const goal = currentGoal(state); if (goal
//     === void 0 || goal.phase !== "active" || goal.activation !== "armed")
//     return;` — i.e. it continues ONLY for an armed, active GOAL.
//   * Its trigger surfaces are `agent/status(status==='idle')`,
//     `goal/changed`, `agent/inbox/inserted`, and the `agent/pre-step` /
//     post-decision fences — it NEVER listens on `agent/turn-stopping`.
//   * It CONTINUES BY OPENING ANOTHER TURN (`state.attempt` + a queued
//     `goal_round` message carrying `source.kind === "goal"`), not by steering
//     the current step.
//   CONCLUSION: the two are COMPLEMENTARY, not overlapping — different
//   predicate (goal vs todo), different event surface (idle/status vs
//   turn-stopping), different mechanism (next turn vs current-step steering).
//   There is no double-continuation to fix. The one real interaction is
//   ordering: when an armed goal IS driving rounds, a todo steer would race a
//   goal round inside the same turn boundary, so this port yields — the
//   `goal-owns-continuation` skip below consults the OPTIONAL `ctx.get('goals')`
//   service and steps aside whenever an active+armed goal exists. A context
//   without that service (or without the key) simply never yields: absence is
//   not an error and is never logged.
//
// U-4 — THE TODO DATA SOURCE (measured at the pinned DSH install). DSH has NO
// `ctx.todo` service; the task book's "ctx.get('todo')" candidate does not
// exist. `dsh-tool-todo` is a TOOL plus a session PROJECTION
// (dsh-tool-todo/lib/types/index.d.ts:26-31: "Register the `todo_write` tool on
// `ctx.tools` and the `todos` unit on `ctx.sessionProjections`"), so the native
// read face is the projection registry:
//     ctx.sessionProjections.stateOf(agent.session, 'todos')
// whose declared type is `TodoItem[] | null | undefined`
// (dsh-session-projection/lib/types/index.d.ts:175, `stateOf`; the `todos` key's
// state is `TodoItem[] | null` in types.d.ts:34-45). That is the ONE source
// this file reads — never OMO's storage form (see the compaction/marker
// exclusions above).
//
// THE STATUS FILTER IS VERBATIM UPSTREAM `todo.ts` — NOT `constants.ts`. The
// task book named constants.ts, but the predicate actually lives in
// `packages/omo-opencode/src/hooks/todo-continuation-enforcer/todo.ts:3-11`
// (re-verified with `git show v4.19.4:.../todo.ts`):
//
//   todo.status !== "completed" && todo.status !== "cancelled"
//     && todo.status !== "blocked" && todo.status !== "deleted"
//
// All four exclusions are transcribed below. DSH's `TodoItem.status` is the
// three-member union `'pending' | 'in_progress' | 'completed'`
// (dsh-tool-todo/lib/types/types.d.ts:24), so `cancelled`/`blocked`/`deleted`
// are currently INERT — they are kept anyway so the predicate stays the
// upstream one if DSH ever widens the union (a filter that silently dropped
// them would make a `cancelled` todo look unfinished).
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2, all modes):
//   ② the listener body wraps its OWN logic in try/catch: a throw inside an
//      `agent/turn-stopping` (serial) listener turns the whole turn into
//      `kind: "error"` (P3-T1 R-9), so every failure path here fails OPEN —
//      "do not steer", never "throw". `agent.steer` is called inside a second
//      try for the same reason: a rejected steer must not become a turn error.
//   ③ no disk reads on the event path — the text is assembled from the
//      in-memory projection and module constants.
//   ⑤ no module-level mutable state: the circuit-breaker state is a `WeakMap`
//      created INSIDE the registrar closure (fiber-scoped, collected with the
//      listener) and keyed by the session object, holding the granted count and
//      the progress baseline (`lastIncompleteCount`), so it can neither leak
//      across fibers nor keep a finished session alive (GC-friendly).
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar, HooksRegistrationContext } from '../index.ts'
import { describeError } from '../boot-markers.ts'

/** The manifest id this registrar implements (manifest.ts row H-03). */
export const TODO_CONTINUATION_ENFORCER_ID = 'todo-continuation-enforcer'

/** The one and only DSH event this listener registers on (pattern E). */
export const TODO_CONTINUATION_ENFORCER_EVENT = 'agent/turn-stopping'

/** Plugin name stamped on the steering message's `source`. */
export const TODO_CONTINUATION_ENFORCER_PLUGIN = 'omo-hooks'

/**
 * The `sessionProjections` key this hook reads (U-4). Exported as a constant so
 * the unit test and the listener cannot disagree about the spelling.
 */
export const TODOS_PROJECTION_KEY = 'todos'

/**
 * The per-session continuation cap — `MAX_CONSECUTIVE_FAILURES` from upstream
 * constants.ts:24, transcribed verbatim (`export const
 * MAX_CONSECUTIVE_FAILURES = 5`). Upstream arms it against a failed internal
 * prompt dispatch; DSH has no such dispatch (`agent.steer` is synchronous and
 * returns `void` — dsh-agent/lib/types/runtime-types.d.ts:200), so this port
 * keeps the constant's literal meaning instead: consecutive FAILURES, i.e.
 * consecutive continuations granted with **no todo progress in between**
 * (进展复员, arbitration 2026-09-19). Each `agent/turn-stopping` boundary
 * compares the current incomplete count against the baseline recorded at the
 * last steer; a strictly smaller count is progress and resets the counter to
 * zero, so a long todo list that keeps moving is never mistaken for a stuck
 * one. Only 5 consecutive no-progress continuations stop steering and log; the
 * next boundary that finds progress (a decreased count) or a cleared list
 * starts the budget over.
 */
export const MAX_CONSECUTIVE_FAILURES = 5

/**
 * 续行文案 — the semantic port of upstream constants.ts:7-14
 * (`CONTINUATION_PROMPT`), verbatim except for the directive header. Upstream's
 * first line is
 *   `[SYSTEM DIRECTIVE: OH-MY-OPENCODE - TODO CONTINUATION]`
 * built by `createSystemDirective(SystemDirectiveTypes.TODO_CONTINUATION)`.
 * That prefix is an OMO identity: `shared/system-directive.ts` exports
 * `isSystemDirective` so OMO's keyword-detector can filter system-authored
 * text, and that consumer is not ported. Keeping "OH-MY-OPENCODE" would
 * misattribute the message to a harness that is not running, so the header is
 * rewritten to this port's own identity while the machine-recognizable
 * `[SYSTEM DIRECTIVE: … - TODO CONTINUATION]` structure is preserved. The four
 * instruction bullets and the skeptical-recheck paragraph are transcribed
 * word-for-word.
 */
export const CONTINUATION_DIRECTIVE = '[SYSTEM DIRECTIVE: OH-MY-OPENDSH - TODO CONTINUATION]'

/** The static half of the continuation text (see {@link CONTINUATION_DIRECTIVE}). */
export const CONTINUATION_PROMPT = `${CONTINUATION_DIRECTIVE}

Incomplete tasks remain in your todo list. Continue working on the next pending task.

- Proceed without asking for permission
- Mark each task complete when finished
- Do not stop until all tasks are done
- If you believe all work is already complete, the system is questioning your completion claim. Critically re-examine each todo item from a skeptical perspective, verify the work was actually done correctly, and update the todo list accordingly.`

/**
 * The upstream non-incomplete statuses, verbatim from todo.ts:3-11 (see the
 * header for why this is todo.ts and not constants.ts, and why the three
 * DSH-impossible members are kept).
 */
export const NON_INCOMPLETE_STATUSES: readonly string[] = [
  'completed',
  'cancelled',
  'blocked',
  'deleted',
]

// --- Minimal structural typings of the DSH surface this file touches ---------
// Same discipline as bash-file-read-guard.ts / hard-blocks-injection.ts: this
// workspace has no dsh dependency, so only the leaf shapes actually read are
// declared. Everything is `readonly` because the real payload objects are owned
// by the agent loop (discipline ①: read leaf fields, never dump a live object).

/** The two leaf fields read from one `dsh-tool-todo` TodoItem (types.d.ts:20-25). */
export interface TodoLike {
  readonly status: string
  readonly content: string
}

/** A caller-supplied todo snapshot; `null`/`undefined` mean "no list yet". */
export type TodoSnapshot = readonly TodoLike[] | null | undefined

/**
 * The `agent` field of the `agent/turn-stopping` payload, narrowed to the two
 * members this listener uses: the live session (the todo projection's subject)
 * and the steering entry point. `steer` is optional here so a malformed payload
 * is a silent no-op instead of a turn error.
 */
export interface SteeringAgentLike {
  readonly session?: unknown
  steer?: (message: ContinuationUserMessage) => void
}

/** The `{agent, turn, signal}` payload, widened for defensive narrowing. */
export interface TurnStoppingPayloadLike {
  readonly agent?: unknown
}

/** One `text` block of a model-facing user message (dsh-llm ContentBlock). */
export interface ContinuationTextBlock {
  readonly type: 'text'
  readonly text: string
}

/**
 * The producer declaration on the steering message. `form: 'instructions'` is
 * the DSH vocabulary for "context that instructs the model": it is declared on
 * `ContextFormed` (dsh-llm/lib/types/message.d.ts:71-89) and the
 * `MessageSourceMap['plugin']` arm extends it (`& ContextFormed`,
 * dsh-llm/lib/types/message.d.ts:94-101); `notice` would describe "here is what
 * happened", which is the C-mode advisory's form, not a continuation directive.
 */
export interface ContinuationPluginSource {
  readonly kind: 'plugin'
  readonly plugin: string
  readonly form: 'instructions'
}

/**
 * The steering user message. `id` must be unique per message — the inbox
 * validates pending-id uniqueness — so every steer mints a fresh UUID, exactly
 * like dsh-llm's createUserMessage and the bash-guard precedent.
 */
export interface ContinuationUserMessage {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly ContinuationTextBlock[]
  readonly source: ContinuationPluginSource
}

// --- Pure predicates (the verbatim half of the port) -------------------------

/**
 * Upstream `getIncompleteCount`'s per-item predicate, verbatim in behaviour
 * (todo.ts:4-9): a todo counts as incomplete unless its status is one of
 * {@link NON_INCOMPLETE_STATUSES}. A missing/non-string status is TREATED AS
 * INCOMPLETE — upstream's `!==` chain does the same for `undefined`, and the
 * conservative direction (steer) is the one that cannot silently drop work.
 */
export function isIncompleteTodo(todo: TodoLike): boolean {
  return !NON_INCOMPLETE_STATUSES.includes(todo.status)
}

/** The incomplete subset, preserving the projection's order (upstream filter). */
export function getIncompleteTodos(todos: readonly TodoLike[]): readonly TodoLike[] {
  return todos.filter(isIncompleteTodo)
}

/**
 * Upstream's `getIncompleteCount` (todo.ts:3-11), verbatim. Exported because it
 * is the gate the whole hook turns on and the unit suite pins it directly.
 */
export function getIncompleteCount(todos: readonly TodoLike[]): number {
  return getIncompleteTodos(todos).length
}

/**
 * The full steering text, assembled exactly like upstream
 * continuation-injection.ts:167-174: the static {@link CONTINUATION_PROMPT},
 * then `[Status: <completed>/<total> completed, <n> remaining]`, then the
 * remaining list rendered as `- [<status>] <content>`.
 *
 * ONE DELIBERATE UNIFICATION. Upstream renders the list with a 2-status filter
 * (`status !== "completed" && status !== "cancelled"`,
 * continuation-injection.ts:167) while its count comes from the 4-status
 * `getIncompleteCount` (line 110) — the two agree only because no upstream todo
 * can be `blocked`/`deleted` at that point. This port uses the 4-status
 * predicate for BOTH, so the count and the list can never disagree. On DSH's
 * three-status union the two forms are identical anyway.
 */
export function buildContinuationText(todos: readonly TodoLike[]): string {
  const incomplete = getIncompleteTodos(todos)
  const todoList = incomplete.map((todo) => `- [${todo.status}] ${todo.content}`).join('\n')
  return `${CONTINUATION_PROMPT}

[Status: ${todos.length - incomplete.length}/${todos.length} completed, ${incomplete.length} remaining]

Remaining tasks:
${todoList}`
}

/** Builds the ONE steering message, with a fresh identity per invocation. */
export function buildContinuationMessage(text: string): ContinuationUserMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: 'plugin',
      plugin: TODO_CONTINUATION_ENFORCER_PLUGIN,
      form: 'instructions',
    },
  }
}

// --- The decision ------------------------------------------------------------

/**
 * Why this boundary is NOT continued. Every value is a deliberate, individually
 * testable skip; `undefined` would blur "no todos" with "the goal driver owns
 * it" and make the unit suite unable to tell a working gate from a broken one.
 */
export type ContinuationSkipReason =
  | 'projection-absent'
  | 'no-todos'
  | 'all-complete'
  | 'goal-owns-continuation'
  | 'circuit-breaker'

/** The pure outcome of one turn-stopping evaluation. */
export type ContinuationDecision =
  | { readonly kind: 'steer'; readonly text: string }
  | { readonly kind: 'skip'; readonly reason: ContinuationSkipReason }

/** Inputs to {@link decideTodoContinuation} — all already-read leaf values. */
export interface ContinuationDecisionInput {
  /** The native `todos` projection value (U-4). */
  readonly todos: TodoSnapshot
  /** Whether an active, armed goal already owns continuation (R-8). */
  readonly goalOwned: boolean
  /**
   * This session's consecutive granted continuations SINCE THE LAST PROGRESS
   * (the breaker's memory). The listener applies the 进展复员 reset — comparing
   * the live incomplete count against the baseline recorded at the last steer —
   * before calling this pure function, so the value seen here is already
   * net of any progress.
   */
  readonly consecutiveSteers: number
}

/**
 * The pure decision: may THIS boundary steer, and with what text? Order matters
 * and mirrors the upstream gate ordering (idle-event.ts gates 13 → 14 → 16):
 * "there is nothing to continue" is checked BEFORE "we have continued too
 * often", so a converged session always clears the breaker instead of being
 * left armed.
 *
 * `goalOwned` is checked before the breaker because yielding to the goal driver
 * is not a failure and must not consume budget. The caller owns the
 * progress-reset bookkeeping (see {@link createTodoContinuationListener}); this
 * function is pure and only reads the net count it is handed.
 */
export function decideTodoContinuation(
  input: ContinuationDecisionInput,
): ContinuationDecision {
  const { todos, goalOwned, consecutiveSteers } = input
  if (todos === null || todos === undefined) {
    return { kind: 'skip', reason: 'projection-absent' }
  }
  if (todos.length === 0) {
    return { kind: 'skip', reason: 'no-todos' }
  }
  if (getIncompleteCount(todos) === 0) {
    return { kind: 'skip', reason: 'all-complete' }
  }
  if (goalOwned) {
    return { kind: 'skip', reason: 'goal-owns-continuation' }
  }
  if (consecutiveSteers >= MAX_CONSECUTIVE_FAILURES) {
    return { kind: 'skip', reason: 'circuit-breaker' }
  }
  return { kind: 'steer', text: buildContinuationText(todos) }
}

// --- The U-4 / R-8 service readers ------------------------------------------

/**
 * The narrow `ctx.get` face this file needs. `HooksRegistrationContext` extends
 * this optionally, so a fake context in a unit test needs no service registry
 * at all and the loop's existing contract is unchanged.
 */
export interface ServiceAccessorContext {
  get?(name: string): unknown
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * Reads `ctx.get(name)` defensively. A context without `get` (or a service that
 * is simply not mounted) yields `undefined`, which every caller below treats as
 * "capability absent" — never as an error (plan §4.2: an optional service must
 * not turn into a boot or turn failure).
 */
function getService(ctx: ServiceAccessorContext, name: string): unknown {
  if (typeof ctx.get !== 'function') return undefined
  return ctx.get(name)
}

/**
 * Copies the `todos` projection into a small owned array of leaf values
 * (discipline ①: never dump or retain the live projection value). Anything that
 * is not an array of `{status: string, content: string}` is reported as
 * `undefined` — indistinguishable from "no list yet", which is exactly the
 * skip the hook wants.
 */
function toTodoSnapshot(value: unknown): TodoSnapshot {
  if (!Array.isArray(value)) return undefined
  const todos: TodoLike[] = []
  for (const item of value) {
    if (!isObject(item)) return undefined
    const status = (item as { readonly status?: unknown }).status
    const content = (item as { readonly content?: unknown }).content
    if (typeof status !== 'string' || typeof content !== 'string') return undefined
    todos.push({ status, content })
  }
  return todos
}

/**
 * U-4: the native todo read face — `ctx.sessionProjections.stateOf(session,
 * 'todos')`. Returns `undefined` when the service, the method, or the key is
 * absent, so an unmounted `dsh-tool-todo` degrades to "do not steer" instead of
 * a throw.
 */
export function readTodosProjection(
  ctx: ServiceAccessorContext,
  session: unknown,
): TodoSnapshot {
  const projections = getService(ctx, 'sessionProjections')
  if (!isObject(projections)) return undefined
  const stateOf = (projections as { readonly stateOf?: unknown }).stateOf
  if (typeof stateOf !== 'function') return undefined
  return toTodoSnapshot(
    (stateOf as (s: unknown, key: string) => unknown).call(
      projections,
      session,
      TODOS_PROJECTION_KEY,
    ),
  )
}

/**
 * R-8: whether an active, armed goal already owns continuation for this agent.
 * `ctx.get('goals')` is OPTIONAL — a deployment without `dsh-goal` (and every
 * unit test that does not wire one) never yields and never logs. `goal.get`
 * throws for an agent that is not the registry's live instance
 * (dsh-goal/lib/types/index.d.ts:63-67), which the listener's outer catch turns
 * into "do not steer" — the conservative direction.
 */
export function hasActiveGoal(ctx: ServiceAccessorContext, agent: unknown): boolean {
  const goals = getService(ctx, 'goals')
  if (!isObject(goals)) return false
  const get = (goals as { readonly get?: unknown }).get
  if (typeof get !== 'function') return false
  const goal = (get as (a: unknown) => unknown).call(goals, agent)
  if (!isObject(goal)) return false
  const phase = (goal as { readonly phase?: unknown }).phase
  const activation = (goal as { readonly activation?: unknown }).activation
  return phase === 'active' && activation === 'armed'
}

// --- The listener ------------------------------------------------------------

/** The seams the listener depends on, injected so the unit suite owns them. */
export interface ContinuationDeps {
  /** Reads the `todos` projection for one session (U-4). */
  readonly readTodos: (session: unknown) => TodoSnapshot
  /** Whether an armed goal already drives continuation (R-8). */
  readonly hasActiveGoal: (agent: unknown) => boolean
  /** Diagnostic sink for the breaker and for swallowed failures. */
  readonly log: (line: string) => void
}

/** The `agent/turn-stopping` listener form: takes the payload, returns nothing. */
export type TurnStoppingListener = (payload: unknown) => void

/** The circuit-breaker line (stable, greppable, distinct from boot markers). */
export function formatCircuitBreakerLine(count: number): string {
  return `[omo-hooks] ${TODO_CONTINUATION_ENFORCER_ID}: stopped steering after `
    + `${count} consecutive continuations with no todo progress `
    + `(cap ${MAX_CONSECUTIVE_FAILURES})`
}

/** The swallowed-failure line; `describeError` is boot-markers' shared formatter. */
export function formatContinuationFailureLine(what: string, err: unknown): string {
  return `[omo-hooks] ${TODO_CONTINUATION_ENFORCER_ID}: ${what}: ${describeError(err)}`
}

/** A log call that can never itself break a turn. */
function logSafely(deps: ContinuationDeps, line: string): void {
  try {
    deps.log(line)
  } catch {
    // Diagnostics are not worth a turn error (discipline ②).
  }
}

function readSteeringAgent(payload: unknown): SteeringAgentLike | undefined {
  if (!isObject(payload)) return undefined
  const agent = (payload as TurnStoppingPayloadLike).agent
  if (!isObject(agent)) return undefined
  return agent as SteeringAgentLike
}

/** The WeakMap key: the session when present, else the agent itself. */
function counterKey(agent: SteeringAgentLike): object {
  return isObject(agent.session) ? agent.session : agent
}

/**
 * One session's breaker memory, stored in the closure `WeakMap` below.
 * `consecutiveSteers` counts continuations granted since the last observed
 * progress; `lastIncompleteCount` is the progress BASELINE — the incomplete
 * count recorded at the last granted steer (the same field upstream keeps as
 * `SessionState.lastIncompleteCount`, todo-continuation-enforcer/types.ts:33).
 * A boundary whose incomplete count is strictly below that baseline has
 * progressed and resets `consecutiveSteers` to zero.
 */
interface BreakerState {
  readonly consecutiveSteers: number
  readonly lastIncompleteCount: number
}

/**
 * Builds the `agent/turn-stopping` listener. The circuit-breaker state lives in
 * this closure as a `WeakMap` keyed by the session object (discipline ⑤:
 * fiber-scoped state, no module-level map) — a finished session's entry is
 * collected with the session, so the hook needs no TTL or prune timer.
 *
 * 进展复员 (arbitration 2026-09-19). `MAX_CONSECUTIVE_FAILURES` is a
 * consecutive-FAILURE bound upstream, and upstream re-arms it on success; the
 * first DSH port read it as a flat cap on continuations, which permanently
 * silenced any todo list needing more than 5 continuation turns. The reset
 * condition here is therefore the port's success signal: at each boundary the
 * live incomplete count is compared with the baseline recorded at the last
 * steer, and a strictly smaller count (a todo actually moved) restores the
 * full budget. Only 5 consecutive no-progress continuations trip the breaker;
 * progress after a trip resumes steering.
 *
 * Return value is `void` BY CONTRACT: the driver discards whatever a listener
 * returns, and the effect is the `steer` side effect (see the file header).
 */
export function createTodoContinuationListener(deps: ContinuationDeps): TurnStoppingListener {
  const breakers = new WeakMap<object, BreakerState>()
  return (payload) => {
    try {
      const agent = readSteeringAgent(payload)
      if (agent === undefined) return
      const steer = agent.steer
      if (typeof steer !== 'function') return
      const key = counterKey(agent)
      const todos = deps.readTodos(agent.session)
      const previous = breakers.get(key)
      // 进展复员: a strictly smaller incomplete count than the baseline recorded
      // at the last steer means the previous continuation did move work, so the
      // failure streak was broken and the budget is full again.
      let granted = previous?.consecutiveSteers ?? 0
      if (previous !== undefined && todos !== null && todos !== undefined) {
        const liveIncompleteCount = getIncompleteCount(todos)
        if (liveIncompleteCount > 0 && liveIncompleteCount < previous.lastIncompleteCount) {
          granted = 0
        }
      }
      const decision = decideTodoContinuation({
        todos,
        goalOwned: deps.hasActiveGoal(agent),
        consecutiveSteers: granted,
      })
      if (decision.kind === 'skip') {
        if (decision.reason === 'all-complete' || decision.reason === 'no-todos') {
          // Convergence clears the breaker: the next incomplete list starts
          // with a full budget (upstream resets on a completed session too).
          breakers.delete(key)
        }
        if (decision.reason === 'circuit-breaker') {
          logSafely(deps, formatCircuitBreakerLine(granted))
        }
        return
      }
      // A granted steer records the new baseline: `decision.kind === 'steer'`
      // implies the snapshot is a non-empty array (see decideTodoContinuation).
      const incompleteCount = getIncompleteCount(todos ?? [])
      const next: BreakerState = {
        consecutiveSteers: granted + 1,
        lastIncompleteCount: incompleteCount,
      }
      try {
        steer.call(agent, buildContinuationMessage(decision.text))
        breakers.set(key, next)
      } catch (err) {
        // A rejected steer is still a consumed continuation: counting it keeps
        // the breaker honest against a persistently failing inbox, and the
        // swallow keeps a serial listener throw out of the turn boundary.
        breakers.set(key, next)
        logSafely(deps, formatContinuationFailureLine('steer failed', err))
      }
    } catch (err) {
      // Fail OPEN (discipline ②): a throw here would make the turn
      // `kind: "error"`. Not steering is the safe direction — the turn closes.
      logSafely(deps, formatContinuationFailureLine('listener failed', err))
    }
  }
}

/**
 * Registers the ONE listener through `ctx.on` — the preferred channel, so
 * cordis scopes it to the registering Fiber and the registrar returns nothing.
 * The event comes from the manifest row, never a second literal, so the row
 * stays the single source of truth for "which surface this hook owns".
 */
export const registerTodoContinuationEnforcer: HookRegistrar = (
  ctx: HooksRegistrationContext,
  entry: HookManifestEntry,
) => {
  const listener = createTodoContinuationListener({
    readTodos: (session) => readTodosProjection(ctx, session),
    hasActiveGoal: (agent) => hasActiveGoal(ctx, agent),
    log: (line) => console.warn(line),
  })
  ctx.on(entry.event, (payload) => listener(payload))
}
