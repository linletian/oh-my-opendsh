// agent-usage-reminder.ts — P3-T15 listener (task book WP-6 批 B; plan §4.2
// pattern D): OMO's "you searched directly instead of delegating" reminder,
// reborn as DSH `tools/post-execute` + session-life-cycle listeners.
//
// Upstream: packages/omo-opencode/src/hooks/agent-usage-reminder/ @ v4.19.4
//   (frozen baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a; SEVEN
//   files = 5 implementation (constants.ts, hook.ts, index.ts, storage.ts,
//   types.ts) + 2 test files; test seed `index.test.ts` (3 `test`) +
//   `storage.test.ts` (1 `test`) = 4). 语义移植（非逐字复制）: the TRIGGER ORDER
//   (orchestrator gate → delegation marks "used" → target-tool gate → cap →
//   append), `MAX_REMINDERS = 3` and the "used stays used" rule are transcribed
//   branch for branch; the ORCHESTRATOR SET, the TOOL NAME LISTS and the
//   REMINDER TEXT are rebuilt in DSH's vocabulary (each with its mapping table
//   below). No upstream code is vendored; this is a new listener.
//
// UPSTREAM EFFECT (verbatim, hook.ts:80-112):
//
//   const agent = getSessionAgent(sessionID)
//   if (agent && !isOrchestratorAgent(agent)) { return }
//   const toolLower = tool.toLowerCase()
//   if (AGENT_TOOLS.has(toolLower)) { markAgentUsed(sessionID); return }
//   if (!TARGET_TOOLS.has(toolLower)) { return }
//   const state = getOrCreateState(sessionID)
//   if (state.agentUsed || state.reminderCount >= MAX_REMINDERS) { return }
//   output.output += REMINDER_MESSAGE
//   state.reminderCount++
//
// i.e. the session's agent gate comes FIRST (a delegation TARGET must not be told
// to delegate), a delegation-style call flips `agentUsed` PERMANENTLY for the
// session, a search/fetch result gets the reminder appended at most three times.
// Never blocks; never touches title/metadata.
//
// ═══════════ 前置① — THE ORCHESTRATOR GATE, REBUILT IN DSH'S VOCABULARY ═══════════
// (plan §4.2 DoD-d; the task book's mandatory 实施期 item. Upstream asked
// `getSessionAgent(sessionID)` — OMO's opencode session-state adapter — and
// compared it against a hard-coded roster:
//
//   hook.ts:37-43  ORCHESTRATOR_AGENTS = new Set(["sisyphus", "sisyphus-junior",
//                                             "atlas", "hephaestus", "prometheus"])
//   hook.ts:47-49  isOrchestratorAgent(agent) = ORCHESTRATOR_AGENTS.has(getAgentConfigKey(agent))
//
// and its OWN comment states the intent: "Subagents (explore, librarian, oracle,
// etc.) are the targets of delegation, so reminding them to delegate to
// themselves is counterproductive.")
//
// MEASURED DSH FACTS. All five upstream names DO exist in the Phase 2 roster
// (patches/omo-dsh/omo-agents/src/roster.ts ids: sisyphus, explore, hephaestus,
// oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker,
// sisyphus-junior, prometheus) — but the roster name is NOT a readable property of
// a DSH session. What IS durable is `session.header.agentPreset`, which names the
// PRESET, not the seat: every session of the concerto preset — conductor AND every
// delegated child — carries `agentPreset: 'concerto'` (the child's meta is copied
// from the parent at dsh-subagent/lib/index.js:502-513, which sets `origin:
// "subagent"` + `delegationDepth` and copies the parent's preset). A name-based
// port of the set would therefore be DEAD CODE dressed as a transcription.
//
// THE PORT EXPRESSES THE INTENT WITH THE FACT THAT EXISTS: an agent that CANNOT
// delegate must not be reminded to delegate. DSH makes exactly that a first-class
// read — `tools.get(name, scope)` resolves a tool "as one scope sees it (scoped
// shadows global; a restricted-away global reads as absent)"
// (dsh-tools/lib/types/index.d.ts:646-655), and the concerto preset restricts the
// ten delegation names away from every child (agent.cordis.yml's per-row
// `toolFilter`; the mechanism is already PROVEN against the installed dsh by
// scripts/prove-explore-toolfilter.mjs and
// tests/omo-agents/roster-toolfilter-mechanism.test.ts:233-235). So:
//
//   upstream `agent && !isOrchestratorAgent(agent)` ⇒ SKIP
//     ↓
//   DSH      `canDelegate(exec) === false`           ⇒ SKIP
//
// `undefined` (no `tools` service, a registry without `get`, or an execution
// without a readable agent scope) means UNKNOWN and is treated exactly as
// upstream treated an unknown agent name — PROCEED (upstream's `agent &&` short
// circuit). atlas (the one sub-agent that keeps the delegation tools and may
// delegate again) is reminded, hephaestus/sisyphus-junior (workers that deny all
// ten) are not: this is NARROWER than upstream for `sisyphus-junior` and
// `hephaestus` in the current concerto composition — a deliberate, recorded
// consequence of DSH enforcing "cannot even SEE another agent's delegation tool",
// not a silent omission.
//
// ═══════════ 前置② — THE TOOL NAME LISTS, NAME BY NAME ═══════════
// MATCHING is upstream's: lowercase the tool, then Set membership.
//
// TARGET_TOOLS (upstream constants.ts:9-20, transcribed VERBATIM into
// {@link UPSTREAM_TARGET_TOOLS}) → DSH:
//
//   grep                          → `grep`       dsh-tool-fs-search/lib/index.js:1090
//   safe_grep                     → dropped      MCP plugin tool; no DSH mount
//   glob                          → `glob`       dsh-tool-fs-search:782
//   safe_glob                     → dropped      MCP plugin tool; no DSH mount
//   webfetch                      → `web_fetch`  dsh-tool-web/lib/index.js:737
//   context7_resolve-library-id   → dropped      Context7 MCP; no DSH mount
//   context7_query-docs           → dropped      Context7 MCP; no DSH mount
//   websearch_web_search_exa      → `web_search` dsh-tool-web/lib/index.js:262
//                                                (DSH's native web search is the
//                                                capability upstream reached for
//                                                through the Exa MCP)
//   context7_get-library-docs     → dropped      Context7 MCP; no DSH mount
//   grep_app_searchgithub         → dropped      Grep.app MCP; no DSH mount
//
// Net: 4 DSH names (grep / glob / web_fetch / web_search); the dropped six are
// MCP-plugin surface that does not exist here. `read`/`bash`/`job_output` are
// deliberately NOT added: upstream judged only its own list, and widening it is an
// arbitration decision, not a silent port convenience.
//
// AGENT_TOOLS (upstream constants.ts:22-26 — `new Set(["task",
// "call_omo_agent", "task"])`, i.e. TWO distinct OMO task-family names, one
// duplicated in the literal) → DSH's DELEGATION TOOL NAMES, the same list the
// orchestrator gate reads. The ten rows are taken from the shipped concerto
// composition (agent.cordis.yml toolName: lines 359-491) and the two generic
// subagent rows from the standard preset's own tool names (dsh-tool-subagent):
//
//   explore, hephaestus, oracle, librarian, plan-consultant, plan-reviewer,
//   atlas, multimodal-looker, sisyphus-junior, prometheus     (the ten rows)
//   subagent, subagent_fork                                    (the generic pair)
//
// OMO's `task` and `call_omo_agent` have NO direct DSH counterpart, so the port
// names DSH's own delegation surface instead of transcribing tool names that would
// never match. `workflow` / `ralph` / `send_message` are NOT here: they are DSH
// orchestration/control harnesses added after the OMO hook era, not the
// `task`/`call_omo_agent` family, and upstream's mark means "the model delegated"
// — which those tools do not by themselves express. 剔除并注记, per the task book.
//
// ═══════════ 前置③ — THE REMINDER TEXT: THE DSH REWRITE TABLE ═══════════
// Upstream's `REMINDER_MESSAGE` (constants.ts:28-52) is transcribed VERBATIM into
// {@link UPSTREAM_REMINDER_MESSAGE} (audit trail) and rewritten into
// {@link REMINDER_MESSAGE}. Line by line, the FIVE edits — nothing else differs:
//
//   upstream                                                     DSH
//   "Use task with explore/librarian agents for better results" → "Use the explore/librarian delegation tools for better results"
//   task(subagent_type="explore", load_skills=[], prompt="…")   → explore(description="…", prompt="…")
//   task(subagent_type="explore", load_skills=[], prompt="…")   → explore(description="…", prompt="…")
//   task(subagent_type="librarian", load_skills=[], prompt="…") → librarian(description="…", prompt="…")
//   "Multiple parallel task calls > Direct tool calls"          → "Multiple parallel delegation calls > Direct tool calls"
//
// WHY EACH: DSH has no tool named `task` and no `subagent_type` / `load_skills`
// parameters, so a transcribed call would instruct the model to invoke a
// nonexistent tool — the ONE rewrite the P3-T1 §3 coupling note requires. The DSH
// call shape is the `dsh-tool-subagent` schema's `description` + `prompt`
// (dsh-tool-subagent/lib/index.js:393-430). The BLOCK'S PROSE is deliberately
// untouched: DSH's delegation really does run in the background by default and
// the runtime really does notify the parent when a run settles
// (dsh-tool-subagent/lib/index.js:400 — "This tool runs in the background by
// default, immediately returns a durable subagent id … the runtime sends the
// parent a notice"), so the two comments inside the code block stay true.
//
// The named agents `explore` / `librarian` are the concerto roster's OWN ids, so
// the text is TRUE on the shipped composition. On a deployment that composes no
// such rows the text would name absent tools — upstream's text had exactly the
// same property (it named OMO agents unconditionally), and the alternative
// (dropping the example block) would delete the hook's actionable half. Recorded,
// not hidden.
//
// ═══════════ DELIVERY: `accept` + `content` (the H-14/H-15/H-21 choice) ═══════════
// Upstream's `output.output += REMINDER_MESSAGE` mutates the RESULT the model
// reads. `additionalContexts` would instead ferry a detached user message into the
// next request; `accept` + `content` (dsh-tools/lib/index.js:3377-3406) rebuilds
// the rendered text as `<原文本><提醒>`, the exact analog of `+=`. The rebuild only
// touches a TEXT-ONLY content (the sibling's `isTextOnlyResultContent`), so no
// image/file block can be lost. Upstream had no `typeof output.output ===
// 'string'` guard of its own (task-resume-info did); on DSH the rendered-text
// reader yields `''` for a result with no text block, and appending to `''` is the
// same "the reminder becomes the whole text" outcome upstream's `undefined + str`
// would have produced, without the `"undefined"` prefix artifact.
//
// ═══════════ STATE: ONE WeakMap, KEYED BY THE SESSION OBJECT (纪律⑤) ═══════════
// Upstream held `Map<sessionID, AgentUsageState>` plus a per-session JSON file
// under `OPENCODE_STORAGE/agent-usage-reminder` (`storage.ts`), loaded lazily and
// deleted on `session.deleted`. The port keeps the SAME two fields
// ({@link AgentUsageState} ← upstream types.ts:1-6 minus `sessionID`/`updatedAt`,
// which have no reader here) in a WeakMap keyed by the live Session OBJECT, so a
// finished session's record is collected with it, and reproduces the deletion on
// `session/disposed` (dsh-session/lib/types/index.d.ts:50 —
// `'session/disposed'(session: Session)`). `session/compacted` DELIBERATELY does
// NOT reset the state — upstream registered NO compaction surface at all
// (`hook.ts:114-123` handles `session.deleted` alone) and its own suite pins the
// consequence twice (`index.test.ts:30` "caps reminders and does not re-arm after
// session.compacted", asserted at :50-55, and :92 "does not re-arm after
// session.compacted when task delegation already happened"), and a WeakMap keyed
// by the surviving session object reproduces it for free. The durable half (a restart surviving the
// counter) is NOT ported: DSH has no side-store for it, and inventing one is a new
// file format on the event path — recorded as a scope limit.
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2): ② the post-execute listener wraps its
// OWN logic in try/catch and fails OPEN (`return next()`), with `next()` OUTSIDE
// the try; the life-cycle listener is contained on its own. ③ no disk reads on
// the event path — the tool lists and the reminder are module constants built at
// import time, and the capability gate is an in-memory registry read (looked up
// per event through `ctx.get`, because cordis's strict read can be empty during
// the loader batch — the P3-T13 lesson). ⑤ cross-event state is the single
// closure-scoped WeakMap above.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar, HooksRegistrationContext } from '../index.ts'
import {
  isTextOnlyResultContent,
  readRenderedText,
  type PostExecuteNextLike,
  type TruncatorAcceptDecision,
} from './tool-output-truncator.ts'

/** The manifest id this registrar implements (manifest.ts row H-22). */
export const AGENT_USAGE_REMINDER_ID = 'agent-usage-reminder'

/** The DSH event carrying the decision (pattern D). */
export const AGENT_USAGE_REMINDER_EVENT = 'tools/post-execute'

/** The auxiliary surface: upstream's `session.deleted` cleanup, re-homed. */
export const AGENT_USAGE_REMINDER_DISPOSED_EVENT = 'session/disposed'

/** Upstream hook.ts:45 — `const MAX_REMINDERS = 3`, verbatim. */
export const MAX_REMINDERS = 3

/**
 * Upstream constants.ts:9-20, transcribed VERBATIM as the audit-trail reference
 * for the DSH list below (the up/down mapping table is in the header).
 */
export const UPSTREAM_TARGET_TOOLS: readonly string[] = [
  'grep',
  'safe_grep',
  'glob',
  'safe_glob',
  'webfetch',
  'context7_resolve-library-id',
  'context7_query-docs',
  'websearch_web_search_exa',
  'context7_get-library-docs',
  'grep_app_searchgithub',
]

/**
 * The live target list in DSH's tool namespace (header 前置②), lowercase as
 * upstream normalized them. Set membership is by exact lowercase name.
 */
export const TARGET_TOOLS: readonly string[] = ['grep', 'glob', 'web_fetch', 'web_search']

/** Upstream constants.ts:22-26, transcribed verbatim (two distinct names, one duplicated). */
export const UPSTREAM_DELEGATION_TOOL_NAMES: readonly string[] = [
  'task',
  'call_omo_agent',
  'task',
]

/**
 * DSH's delegation surface, in two groups: the ten named roster tools the shipped
 * concerto composition mounts (agent.cordis.yml `toolName:` lines 359-491) and the
 * two generic subagent tools. Used BOTH as the "the model delegated" mark
 * (upstream's AGENT_TOOLS) and as the probe list of the orchestrator gate
 * (header 前置①) — one source, so a name can never be a mark without also being a
 * capability. task-resume-info.ts imports this list for its own tool gate, keeping
 * ONE statement of DSH's delegation surface.
 */
export const DELEGATION_TOOL_NAMES: readonly string[] = [
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
  'subagent',
  'subagent_fork',
]

/**
 * Upstream constants.ts:28-52, transcribed VERBATIM (including the leading and
 * trailing newline of the template literal) as the audit-trail reference. The
 * five edits that produce {@link REMINDER_MESSAGE} are tabulated in the header;
 * the unit suite pins that NO OMO tool signature survives in the live text.
 */
export const UPSTREAM_REMINDER_MESSAGE = `
[Agent Usage Reminder]

You called a search/fetch tool directly without leveraging specialized agents.

RECOMMENDED: Use task with explore/librarian agents for better results:

\`\`\`
// Parallel exploration - fire multiple agents simultaneously
task(subagent_type="explore", load_skills=[], prompt="Find all files matching pattern X")
task(subagent_type="explore", load_skills=[], prompt="Search for implementation of Y")
task(subagent_type="librarian", load_skills=[], prompt="Lookup documentation for Z")

// Then continue your work while they run in background
// System will notify you when each completes
\`\`\`

WHY:
- Agents can perform deeper, more thorough searches
- Background tasks run in parallel, saving time
- Specialized agents have domain expertise
- Reduces context window usage in main session

ALWAYS prefer: Multiple parallel task calls > Direct tool calls
`

/**
 * 提醒正文 — the DSH rewrite of the block above (header 前置③'s table). Keep this
 * text stable: the unit suite pins it verbatim and the e2e asserts the injected
 * result ENDS with these exact bytes.
 */
export const REMINDER_MESSAGE = `
[Agent Usage Reminder]

You called a search/fetch tool directly without leveraging specialized agents.

RECOMMENDED: Use the explore/librarian delegation tools for better results:

\`\`\`
// Parallel exploration - fire multiple agents simultaneously
explore(description="Find all files matching pattern X", prompt="Find all files matching pattern X")
explore(description="Search for implementation of Y", prompt="Search for implementation of Y")
librarian(description="Lookup documentation for Z", prompt="Lookup documentation for Z")

// Then continue your work while they run in background
// System will notify you when each completes
\`\`\`

WHY:
- Agents can perform deeper, more thorough searches
- Background tasks run in parallel, saving time
- Specialized agents have domain expertise
- Reduces context window usage in main session

ALWAYS prefer: Multiple parallel delegation calls > Direct tool calls
`

/** The first line of the reminder; also its idempotency sentinel in a result. */
export const REMINDER_MESSAGE_MARKER = '[Agent Usage Reminder]'

/** The one accept-decision shape this module produces (mode D). */
export type AgentUsageReminderDecision = TruncatorAcceptDecision

// --- Minimal structural typings of the DSH surface this file touches --------

/**
 * Upstream types.ts:1-6 minus the two fields with no DSH reader. `agentUsed`
 * survives compaction; `reminderCount` is the MAX_REMINDERS counter.
 */
export interface AgentUsageState {
  agentUsed: boolean
  reminderCount: number
}

/**
 * The orchestrator gate's answer (header 前置①): `true` = the session's agent can
 * delegate, `false` = it cannot (skip), `undefined` = unknown (upstream's
 * unknown-agent case ⇒ proceed).
 */
export type DelegationCapabilityReader = (exec: unknown) => boolean | undefined

/** The injectable seams of {@link createAgentUsageReminder}. */
export interface AgentUsageReminderDeps {
  /** The orchestrator gate. Absent ⇒ unknown ⇒ upstream's proceed. */
  readonly canDelegate?: DelegationCapabilityReader
}

/** The reminder's fiber-scoped face (one instance per registration). */
export interface AgentUsageReminder {
  /** The post-execute half: `undefined` ⇒ "not our call / suppressed", delegate. */
  decide(exec: unknown, result: unknown): AgentUsageReminderDecision | undefined
  /** The `session/disposed` half: upstream's `resetState`. */
  onSessionDisposed(session: unknown): void
  /** Diagnostics for the unit suite: the state, or undefined when untouched. */
  stateOf(session: unknown): AgentUsageState | undefined
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/** The live Session behind one execution (`exec.agent.session`), if reachable. */
export function readExecutionSession(exec: unknown): unknown {
  if (!isObject(exec)) return undefined
  const agent = (exec as { readonly agent?: unknown }).agent
  if (!isObject(agent)) return undefined
  return (agent as { readonly session?: unknown }).session
}

/** The agent scope key behind one execution (`exec.agent`), if reachable. */
export function readExecutionAgent(exec: unknown): object | undefined {
  if (!isObject(exec)) return undefined
  const agent = (exec as { readonly agent?: unknown }).agent
  return isObject(agent) ? agent : undefined
}

/** The lowercase tool name, total on a hostile execution. */
export function readToolName(exec: unknown): string | undefined {
  if (!isObject(exec)) return undefined
  const name = (exec as { readonly name?: unknown }).name
  return typeof name === 'string' ? name.toLowerCase() : undefined
}

/**
 * Builds the orchestrator gate the registrar hands to the decision (header
 * 前置①): it asks the tool registry whether ANY delegation tool is visible to
 * THIS execution's agent scope. A context without `get`, a deployment without a
 * `tools` service, or a registry without `get` yields `undefined` — upstream's
 * unknown-agent case, which proceeds.
 */
export function buildDelegationCapabilityReader(
  ctx: HooksRegistrationContext,
): DelegationCapabilityReader {
  return (exec: unknown): boolean | undefined => {
    if (typeof ctx.get !== 'function') return undefined
    const tools = ctx.get('tools')
    if (!isObject(tools)) return undefined
    const get = (tools as { readonly get?: unknown }).get
    if (typeof get !== 'function') return undefined
    const scope = readExecutionAgent(exec)
    // No readable agent scope ⇒ no scope to judge ⇒ unknown, not "cannot".
    if (scope === undefined) return undefined
    for (const name of DELEGATION_TOOL_NAMES) {
      try {
        if ((get as (this: unknown, n: string, s: object) => unknown).call(tools, name, scope) !== undefined) {
          return true
        }
      } catch {
        return undefined
      }
    }
    return false
  }
}

/**
 * Builds the reminder. All cross-event state lives HERE (discipline ⑤): one
 * WeakMap keyed by the live Session OBJECT, reproducing upstream's
 * `Map<sessionID, state>` + `session.deleted` cleanup without either the id
 * bookkeeping or the disk half.
 */
export function createAgentUsageReminder(
  deps: AgentUsageReminderDeps = {},
): AgentUsageReminder {
  const sessionStates = new WeakMap<object, AgentUsageState>()

  function getOrCreateState(session: object): AgentUsageState {
    const existing = sessionStates.get(session)
    if (existing !== undefined) return existing
    const created: AgentUsageState = { agentUsed: false, reminderCount: 0 }
    sessionStates.set(session, created)
    return created
  }

  function decide(exec: unknown, result: unknown): AgentUsageReminderDecision | undefined {
    const tool = readToolName(exec)
    if (tool === undefined) return undefined

    // Gate 1 — the orchestrator gate, in DSH's vocabulary (header 前置①).
    if (deps.canDelegate?.(exec) === false) return undefined

    const session = readExecutionSession(exec)
    if (!isObject(session)) return undefined

    // Gate 2 — a delegation call marks the session as "used" and stops there.
    if (DELEGATION_TOOL_NAMES.includes(tool)) {
      getOrCreateState(session).agentUsed = true
      return undefined
    }

    // Gate 3 — only a search/fetch result can carry the reminder.
    if (!TARGET_TOOLS.includes(tool)) return undefined

    const state = getOrCreateState(session)
    // Gate 4 — once used, or once the cap is reached, the reminder never returns.
    if (state.agentUsed || state.reminderCount >= MAX_REMINDERS) return undefined
    if (!isObject(result) || !isTextOnlyResultContent(result)) return undefined

    state.reminderCount += 1
    return {
      kind: 'accept',
      content: [{ type: 'text', text: `${readRenderedText(result)}${REMINDER_MESSAGE}` }],
    }
  }

  return {
    decide,
    onSessionDisposed(session: unknown): void {
      try {
        if (isObject(session)) sessionStates.delete(session)
      } catch {
        // A contained emit feed: our own bug must not reach it.
      }
    },
    stateOf(session: unknown): AgentUsageState | undefined {
      if (!isObject(session)) return undefined
      return sessionStates.get(session)
    },
  }
}

/**
 * The listener body: decide from OUR logic inside a fail-open try/catch, then
 * delegate — or return the rewrite. `next()` sits OUTSIDE the try (discipline ②):
 * a throw inside a `tools/post-execute` listener replaces an entire successful
 * tool result with an isError (dsh-tools/lib/index.js:3241-3248).
 */
function handleAgentUsageReminder(
  reminder: AgentUsageReminder,
  exec: unknown,
  result: unknown,
  next: unknown,
): unknown {
  const delegate = next as PostExecuteNextLike
  let decision: AgentUsageReminderDecision | undefined
  try {
    decision = reminder.decide(exec, result)
  } catch {
    return delegate()
  }
  if (decision === undefined) return delegate()
  return decision
}

/**
 * Registers the row's full surface set through `ctx.on` (the preferred channel).
 * The post-execute event comes from the manifest row; the disposed event is this
 * module's own constant (a row has ONE primary event — index.ts discipline ④).
 */
export const registerAgentUsageReminder: HookRegistrar = (
  ctx: HooksRegistrationContext,
  entry: HookManifestEntry,
) => {
  const reminder = createAgentUsageReminder({
    canDelegate: buildDelegationCapabilityReader(ctx),
  })
  ctx.on(entry.event, (exec, result, next) => handleAgentUsageReminder(reminder, exec, result, next))
  ctx.on(AGENT_USAGE_REMINDER_DISPOSED_EVENT, (session) => {
    reminder.onSessionDisposed(session)
  })
}
