// session-notification.ts — P3-T12 listener (task book WP-5; plan §4.2 pattern
// F): OMO's session-completion notification, reborn as DSH event observers.
// This file is BOTH the scheduler port AND the platform/backend abstraction the
// sibling `background-notification.ts` reuses.
//
// Upstream: packages/omo-opencode/src/hooks/session-notification*.ts @ v4.19.4
//   (frozen baseline tag, commit
//   b072d279110bdda2c6ac2525d0d24dc54d16148a). The upstream module is a FILE
//   FAMILY, not a directory: `git ls-tree -r v4.19.4
//   packages/omo-opencode/src/hooks/ | grep session-notification` returns 21
//   files = 16 implementations + 5 tests (P3-T1 §10 实测; the task book's "约 14
//   文件" was a draft error, corrected as C-2). 语义移植（非逐字复制）: every
//   dispatch/debounce rule, the two H-05 predicates, the AppleScript escaping and
//   both backend command shapes are transcribed; the DELIVERY is DSH's. No
//   upstream code is vendored. ONE divergence from the upstream TEXT is
//   delivered on purpose and recorded with its reason: `escapeAppleScriptText`
//   also escapes newlines (PR #9 review F1 — upstream's osascript path is a
//   COMPILE ERROR for any multiline body, and this port's content reduction
//   emits multiline bodies more often than upstream does; see the function's
//   doc comment).
//
//   The 16 upstream implementation files this module's semantics were read from
//   (the plan §4.9 逐文件署名 requirement), each one either transcribed below or
//   explicitly excluded with its reason:
//     session-notification.ts             — PORTED (event dispatch + the gates)
//     session-notification-content.ts     — PARTIAL (title/message composition; the
//                                           session-title/message reads are NOT
//                                           PORTED — see "content reduction")
//     session-notification-event-properties.ts
//                                         — NOT PORTED (opencode `event.properties`
//                                           shape; DSH events are typed payloads)
//     session-notification-formatting.ts  — PORTED (escapeAppleScriptText, with ONE
//                                           deliberate addition — the newline arm,
//                                           PR #9 review F1, see the function's
//                                           doc comment; buildWindowsToastScript
//                                           excluded by D9)
//     session-notification-init.ts        — PARTIAL (lazy platform cache → the
//                                           registrar computes once at apply time)
//     session-notification-linux.ts       — PORTED (notify-send argv, verbatim)
//     session-notification-log.ts         — NOT PORTED (it is NOT a backend: 15 lines
//                                           of failure loggers; P3-T1 C-3/C-12. Our
//                                           log lines are the module's own stable
//                                           anchors below)
//     session-notification-macos.ts       — PARTIAL (the osascript tier only; the
//                                           cmux/terminal-notifier tiers are NOT
//                                           PORTED — see "macOS tiers")
//     session-notification-platform.ts    — PORTED (detectPlatform verbatim;
//                                           getDefaultSoundPath NOT PORTED — sound
//                                           is not ported, see "sound")
//     session-notification-runner.ts      — PARTIAL (the `execFile` fallback is the
//                                           only runner DSH has; `ctx.$` is
//                                           opencode's bun shell)
//     session-notification-scheduler.ts   — PORTED (the debounce state machine, the
//                                           core of this task)
//     session-notification-send.ts        — PARTIAL (the dispatch switch; the win32
//                                           arm removed by D9)
//     session-notification-sender.ts      — FUNCTION-MAPPED, NOT a surface port: the
//                                           barrel re-exports five names; three are
//                                           ported HERE (the `Platform` type →
//                                           `NotificationPlatform`; `detectPlatform` →
//                                           `detectNotificationPlatform`; the send
//                                           dispatch switch → the NotifierBackend
//                                           factories) and the remaining two
//                                           (`getDefaultSoundPath`,
//                                           `playSessionNotificationSound`) are not
//                                           ported at all (sound; see "sound"). No
//                                           single file "becomes this module's
//                                           exports"
//     session-notification-sound.ts       — NOT PORTED (sound; see "sound")
//     session-notification-utils.ts       — NOT PORTED (createCommandFinder; DSH's
//                                           execFile resolves through PATH itself —
//                                           see "command resolution")
//     session-notification-windows.ts     — NOT PORTED (D9, task book)
//
//   Plus the H-05 helper (N-04, merged here):
//     session-todo-status.ts              — PORTED (hasIncompleteTodos /
//                                           hasPendingSessionWork predicates; its
//                                           ONLY consumer upstream is
//                                           `session-notification.ts:7,52`, which is
//                                           why P3-T1 C-8 recorded it as "not a
//                                           listener" and the manifest row does not
//                                           carry it as a file)
//
// ============================ THE DSH EVENT MAPPING ==========================
// P3-T1 Q-4 is the mechanism fact this mapping rests on (plan §4.2 pattern F):
// DSH has NO `session.idle` and NO `session.error` event type. The two native
// surfaces are:
//
//   * completion / error — `session/event` (a post-commit, fire-and-forget
//     append feed whose observer failures are "logged and contained":
//     dsh-session/lib/types/index.d.ts:60-62) carrying
//     `turn/end { turn, reason }`. `reason.kind` is the `TurnEndReasonMap` union
//     (dsh-session/lib/types/types.d.ts:159-199): `completed` | `aborted` |
//     `blocked` | `error` | `max-tokens` | `interrupted`.
//   * idle — `agent/status` with `status === 'idle'` (dsh-agent/lib/types/
//     runtime-types.d.ts:246-250; `AgentStatus = 'idle' | 'running'`).
//
// THE `max-tokens` PRECISION TRAP (task book; verbatim, types.d.ts:190-193):
//
//     /** At least one step reached its output-token ceiling, even if a plugin
//      * continued the turn. */
//     'max-tokens': { kind: 'max-tokens' }
//
// So `max-tokens` is NEITHER a completion NOR an error, and it is not a reliable
// "the turn was cut short" signal either — the doc explicitly says the reason is
// recorded even when a plugin continued the turn. A naive
// `reason.kind !== 'completed' → error` would fire a false error notification on
// every token-limited turn, and treating it as `completed` would announce "ready
// for input" for a turn that hit its ceiling. This port therefore maps the reason
// union EXHAUSTIVELY and deliberately:
//
//   completed    → completion notification (kind 'idle')
//   error        → error notification (kind 'error')
//   aborted / blocked / max-tokens / interrupted / unknown
//                → NO direct notification. The session's own `agent/status`
//                  `idle` transition still covers the user-visible
//                  "the agent stopped and is waiting" fact (that is exactly the
//                  auxiliary role of the idle surface below), so a cancelled or
//                  blocked turn is not silently dropped — it is reported by the
//                  surface that owns that meaning, with no misleading reason.
//
// ============================ WHAT IS *NOT* PORTED ===========================
// Each with its reason (the plan §3 SUL discipline requires an audit trail, not
// an omission):
//
//   * the question/permission prompt notifications (`QUESTION_TOOLS`,
//     `PERMISSION_EVENTS`, `PERMISSION_HINT_PATTERN`, `questionMessage` /
//     `permissionMessage`, `session-notification.ts:74-76,130-168`). The task
//     book scopes this task to 完成通知 / 错误通知 / 每 session 去抖, and those two
//     halves need surfaces this module does not own (a `tools/pre-execute`
//     observer for the question tool name, and the DSH authorization flow for
//     permission asks). They are recorded as an explicit out-of-scope reduction
//     and reported as a 质疑建议 — NOT silently dropped. `permissionMessage` /
//     `questionMessage` therefore do not exist in the config below.
//   * the `detectExternalNotificationPlugin` suppression
//     (`plugin/hooks/create-session-hooks.ts:93-95`, P3-T1 移植难点 2): that
//     detects ANOTHER OPENCODE NOTIFICATION PLUGIN in the opencode config
//     directory. DSH has no opencode plugin directory and no notification plugin;
//     there is nothing to detect, so the whole hook is never suppressed. This is
//     the one upstream "抑制条件" and it is recorded here rather than ported.
//   * the main-session filter (`shouldNotifyForSession`,
//     `session-notification.ts:87-96`): upstream consults OMO's global
//     `subagentSessions` set plus `getMainSessionID()`
//     (`features/claude-code-session-state`). DSH's counterpart is the session's
//     own durable header — `origin === 'subagent'` and `delegationDepth > 0`
//     (dsh-session/lib/types/types.d.ts:76-90) — which this port reads instead
//     (see {@link shouldNotifyForSession}); there is no process-global session
//     roster to consult.
//   * **sound** (`session-notification-sound.ts`, `playSound`, `soundPath`,
//     `getDefaultSoundPath`, the `paplay`/`aplay`/`afplay`/PowerShell backends):
//     the task book's deliverable is the NOTIFICATION backend pair, the default
//     config value is `playSound: false` upstream, and a sound file path is a
//     host-specific asset this port has no way to validate. Not ported; recorded.
//   * **content reduction** — upstream's `buildReadyNotificationContent` reads
//     the session title and the last user/assistant message text
//     (`session-notification-content.ts:126-150`) and renders
//     `title = "${baseTitle} · ${sessionTitle}"`. DSH's `Session` exposes no title
//     (dsh-session/lib/types/index.d.ts:103-200 has `id`/`header`/events only) and
//     reading the messages back would be a storage read on the event path, which
//     plan §4.2 discipline ③ forbids. The port therefore builds
//     `title = baseTitle` and a static body (see
//     {@link buildNotificationContent}) from the in-memory todo count.
//   * **macOS tiers** — upstream `sendMacosSessionNotification` is a three-tier
//     probe chain: `cmux` (preferred), `terminal-notifier` (with bundle-id
//     activation), then `osascript`+AppleScript (fallback)
//     (`session-notification-macos.ts:17-74`). Only the `osascript` tier is
//     ported: `cmux`/`terminal-notifier` are non-system binaries, and the
//     bundle-id tier reads `process.env.__CFBundleIdentifier`, an
//     opencode.app-specific variable. The argv shape (`['-e', script]`) is
//     upstream's exactly; the SCRIPT TEXT is NOT byte-identical for a multiline
//     body — the port escapes newlines into AppleScript concatenation where
//     upstream emits a raw LF (PR #9 review F1). See the function's doc comment.
//   * **command resolution** — upstream resolves each binary to an absolute path
//     with a cached `createCommandFinder` over `bunWhich`
//     (`session-notification-utils.ts:25-50`) because its `ctx.$` shell template
//     interpolates that path. DSH runs the binary through `execFile`, which
//     resolves the name through PATH itself (upstream's own fallback path does the
//     same, `session-notification-runner.ts:47-50`), so the finder — and its
//     module-level cache, which plan §4.2 discipline ⑤ would forbid anyway — is
//     not ported.
//
// ============================ THE DEBOUNCE PORT ==============================
// `session-notification-scheduler.ts` is the semantic core, and its SIX
// per-session collections + version counter are ported one gate at a time:
//
//   upstream (`:20-25`)                    this port (one {@link SessionState} per
//                                          session, in a fiber-scoped WeakMap)
//   notifiedSessions: Set<string>          state.notified
//   pendingTimers: Map<string, Timeout>    state.pendingTimer
//   sessionActivitySinceIdle: Set<string>  state.activitySinceIdle
//   notificationVersions: Map<string, n>   state.version
//   executingNotifications: Set<string>    state.executing
//   scheduledAt: Map<string, number>       state.scheduledAt
//
// Every gate keeps upstream's ORDER, because the order is the semantics:
//   * `scheduleIdleNotification` (`:153-170`) — bail on notified / pending /
//     executing; clear the activity flag; stamp `scheduledAt`; bump the version;
//     arm the timer with THAT version (the stale-timer invalidation).
//   * `markSessionActivity` (`:74-88`) — the activity GRACE PERIOD first
//     (`Date.now() - scheduledAt <= activityGracePeriodMs` ⇒ ignore late
//     activity, default 100ms), then cancel-pending + clear `notified` unless a
//     notification is currently executing.
//   * `cancelPendingNotification` (`:63-72`) — clear the timer, drop
//     `scheduledAt`, set the activity flag, BUMP THE VERSION (which is what makes
//     any in-flight `executeNotification` observe a mismatch and stand down).
//   * `executeNotification` (`:90-151`) — executing/version/activity/notified
//     guards, then the version re-check around the `await
//     hasIncompleteTodos(...)` (the race upstream guards against), then
//     `notifiedSessions.add` BEFORE `send`, and the `finally` block that clears
//     executing/pending/scheduledAt and rolls `notified` back when activity
//     arrived mid-send. The consequence of the post-await re-check: a
//     completion whose probe is still in flight when activity resumes is
//     DROPPED, not queued — the new activity's own boundary is what schedules
//     the next notification.
//
// TWO KNOWING REDUCTIONS, recorded (not silent):
//   1. `maxTrackedSessions` / `cleanupOldSessions` (`:29-61`) and
//      `deleteSession` (`:172-179`) are NOT ported. They exist to bound and
//      prune ID-KEYED maps. Plan §4.2 discipline ⑤ forbids module-level bare
//      maps, so the six collections collapse into ONE WeakMap keyed by the
//      session OBJECT: an entry is collected with its session, so there is
//      nothing to prune and no `session.deleted` counterpart to register (DSH's
//      `session/disposed` is a cordis event on the session scope; GC already
//      does this). The debounce gates above are unaffected — they never read
//      these two helpers.
//   2. `skipIfIncompleteTodos` (upstream `:118-124`) is applied to the
//      COMPLETION kind only. Upstream has no error notification at all (its
//      `session.error` lived in `background-notification`'s event whitelist), so
//      the gate only ever guarded the idle notification. Suppressing an ERROR
//      notification because todos remain open would hide exactly the event the
//      user must hear about, so {@link shouldSkipForPendingWork} restricts the
//      gate to `kind === 'idle'`.
//
// ============================ H-05: THE TWO PREDICATES =======================
// N-04 merged the H-05 helper (`session-todo-status.ts`) into this module,
// because upstream's ONLY consumer is `session-notification.ts:7,52`
// (P3-T1 C-8). Verbatim upstream (`session-todo-status.ts:12-31`):
//
//   export async function hasIncompleteTodos(ctx, sessionID): Promise<boolean> {
//     const response = await ctx.client.session.todo({ path: { id: sessionID } })
//     const todos = normalizeSDKResponse(response, [] as Todo[], ...)
//     if (!todos || todos.length === 0) return false
//     return todos.some((todo) => todo.status !== "completed" && todo.status !== "cancelled")
//   }
//   export async function hasPendingSessionWork(ctx, sessionID): Promise<boolean> {
//     const marker = readContinuationMarker(ctx.directory, sessionID)
//     if (marker?.sources["background-task"]?.state === "active") return true
//     return hasIncompleteTodos(ctx, sessionID)
//   }
//
// The todo DATA SOURCE is the U-4 face P3-T7 established: DSH has no `ctx.todo`
// service; `dsh-tool-todo` is a tool plus a session PROJECTION, so the native
// read face is `ctx.sessionProjections.stateOf(session, 'todos')`
// (dsh-tool-todo/lib/types/index.d.ts:26-31;
// dsh-session-projection/lib/types/index.d.ts:175; the key's state type is
// `TodoItem[] | null`). This file carries its OWN small reader rather than
// importing the E-mode one: each `src/hooks/<id>.ts` is an independently
// auditable port (the probe derives its registered-line set from that file set),
// and the reader is 10 lines.
//
// ⚠️ UPSTREAM USES **TWO DIFFERENT** INCOMPLETE PREDICATES IN TWO FILES, and this
// port keeps each one in its own module — a real finding, not a style choice:
//   * `session-todo-status.ts:17` (here, the notification gate): TWO statuses —
//       `todo.status !== "completed" && todo.status !== "cancelled"`
//   * `todo-continuation-enforcer/todo.ts:3-11` (the E-mode hook): FOUR statuses
//       — also excludes `blocked` and `deleted`
// On DSH's three-member `TodoItem.status` union
// (`'pending' | 'in_progress' | 'completed'`, dsh-tool-todo/lib/types/types.d.ts:24)
// the two agree, but unifying them would be a silent semantic change to one of
// the two ports, so {@link isPendingTodo} stays the 2-status upstream predicate.
//
// THE `background-task` TERM — a documented DSH gap. Upstream's
// `hasPendingSessionWork` ORs a continuation-marker fact
// (`readContinuationMarker(...).sources["background-task"].state === "active"`,
// `features/run-continuation-state`) into the todo predicate.
// {@link hasPendingSessionWork} keeps that SHAPE with an explicit
// `backgroundTaskActive` input, and the registrar supplies `false` because the
// fact is NOT REACHABLE from this module's vantage:
//   * the DSH continuation-marker subsystem is not part of this port (the E-mode
//     module's header records the same exclusion: DSH's session log is the
//     durable source of truth, so a second marker file would have no reader);
//   * the DSH analogue of "a background task is active" IS observable —
//     `ctx.jobs` exposes `onJobDone` / `onJobsChanged` / `list`
//     (dsh-jobs/lib/types/index.d.ts:103-134) — but only through an `Agent`
//     caller (`list(caller?: Agent)`, `:57-63`: "a non-agent caller sees only
//     unowned jobs") and the `session/event` payload carries the `Session`, whose
//     class exposes no agent back-reference
//     (dsh-session/lib/types/index.d.ts:103-200). The live-job half therefore
//     belongs to `background-notification.ts`, which OWNS the jobs surface; the
//     seam here stays open so a future caller with an Agent can wire it.
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2, all modes):
//   ② the listener bodies wrap their OWN logic in try/catch: `session/event` and
//      `agent/status` are both `@mode emit` surfaces (failures are contained),
//      so this port's failure direction cannot break a turn — the try/catch keeps
//      our own bugs OUT of the append feed and out of the status transition.
//   ③ no disk reads on the event path — the notification text is assembled from
//      module constants plus the in-memory todo projection; the only subprocess
//      is the notification command itself.
//   ⑤ no module-level mutable state — all cross-event state (the six collections
//      above, the timer set) lives in the registrar closure, keyed by the session
//      OBJECT.
//
// LOG ANCHOR CONTRACT (probe / e2e; keep the format stable, extend the probe):
//   * `[omo-hooks] session-notification: <kind> <title>`
//     — ONE line, emitted immediately BEFORE the OS notification command is
//       dispatched (so a CI box with no notification daemon still produces the
//       anchor). `<kind>` is `idle` | `error`; `<title>` is the content title.
//       This is the CI/e2e carrier the task book asks for — there is NO upstream
//       "log backend" (P3-T1 C-3/C-12: `session-notification-log.ts` is only
//       failure loggers).
//   * `[omo-hooks] session-notification FAILED: <what>: <describeError>`
//     — a swallowed failure (backend rejection, malformed payload). Distinct from
//       the boot markers' `hook <id> FAILED` form on purpose: the probe fails the
//       boot on `[omo-hooks] hook .* FAILED`, and a notification command failing
//       at RUNTIME must never read as a registration failure.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar, HooksRegistrationContext } from '../index.ts'
import { describeError } from '../boot-markers.ts'

/** The manifest id this registrar implements (manifest.ts row H-10). */
export const SESSION_NOTIFICATION_ID = 'session-notification'

/** The manifest's PRIMARY event — the completion/error surface (pattern F). */
export const SESSION_NOTIFICATION_EVENT = 'session/event'

/**
 * The AUXILIARY event this listener also registers on. Not a second manifest
 * row: the row records the primary surface, and index.ts discipline ④ makes the
 * implementation own its full surface set (the B+D rows' documented rule).
 */
export const SESSION_NOTIFICATION_STATUS_EVENT = 'agent/status'

/** The stable log-anchor prefix (see the header's LOG ANCHOR CONTRACT). */
export const NOTIFICATION_LOG_PREFIX = '[omo-hooks] session-notification: '

/** The swallowed-failure log prefix (deliberately not the boot-marker form). */
export const NOTIFICATION_FAILURE_PREFIX = '[omo-hooks] session-notification FAILED: '

/** The two notification kinds this port emits. */
export type NotificationKind = 'idle' | 'error'

/** The upstream `Platform` union, verbatim (`session-notification-platform.ts:3`). */
export type NotificationPlatform = 'darwin' | 'linux' | 'win32' | 'unsupported'

/**
 * The merged config, with upstream's defaults (`session-notification.ts:31-43`)
 * except where a comment says otherwise. `activityGracePeriodMs` is upstream's
 * optional scheduler field with its documented default (`scheduler.ts:27`).
 */
export interface SessionNotificationConfig {
  /** Notification title. Upstream default "OpenCode" is an OMO identity → rewritten. */
  readonly baseTitle: string
  /** Upstream default, verbatim (`session-notification.ts:33`). */
  readonly baseMessage: string
  /** DSH addition: upstream has NO error notification (see the header). */
  readonly errorMessage: string
  /** Upstream default 1500 (`session-notification.ts:38`). */
  readonly idleConfirmationDelay: number
  /** Upstream default true (`session-notification.ts:39`); applied to 'idle' only. */
  readonly skipIfIncompleteTodos: boolean
  /** Upstream default 100 (`scheduler.ts:27`). */
  readonly activityGracePeriodMs: number
}

/**
 * The default config. Every numeric default and both message strings are
 * upstream's; `baseTitle` is this port's identity (`'OpenCode'` would
 * misattribute a notification to a harness that is not running — the same
 * rewrite the E-mode directive header records).
 */
export const DEFAULT_SESSION_NOTIFICATION_CONFIG: SessionNotificationConfig = {
  baseTitle: 'oh-my-opendsh',
  baseMessage: 'Agent is ready for input',
  errorMessage: 'Agent stopped with an error',
  idleConfirmationDelay: 1500,
  skipIfIncompleteTodos: true,
  activityGracePeriodMs: 100,
}

/** Builds the stable anchor line (header: LOG ANCHOR CONTRACT). */
export function formatNotificationLine(kind: NotificationKind, title: string): string {
  return `${NOTIFICATION_LOG_PREFIX}${kind} ${title}`
}

/** Builds the swallowed-failure line. */
export function formatNotificationFailureLine(what: string, err: unknown): string {
  return `${NOTIFICATION_FAILURE_PREFIX}${what}: ${describeError(err)}`
}

// --- Platform detection + the backend abstraction ----------------------------

/**
 * Upstream `detectPlatform` verbatim (`session-notification-platform.ts:5-9`):
 * the three supported names pass through, anything else is `unsupported`. Note
 * that `win32` IS still detected here — D9 removes the Windows BACKEND
 * (deliverable: "Windows 后端不移植"), not the platform fact, which keeps this
 * function 1:1 with upstream.
 */
export function detectNotificationPlatform(runtimePlatform: string): NotificationPlatform {
  if (runtimePlatform === 'darwin' || runtimePlatform === 'linux' || runtimePlatform === 'win32') {
    return runtimePlatform
  }
  return 'unsupported'
}

/**
 * The one abstraction the task book requires: `notify(title, body)`. A backend
 * is chosen by platform at registration time and is injectable, so the unit
 * suite swaps in a recording fake and never spawns a process.
 */
export interface NotifierBackend {
  readonly platform: NotificationPlatform
  notify(title: string, body: string): Promise<void>
}

/**
 * The command executor seam. Production uses
 * {@link runCommandViaExecFile} — upstream's own fallback path, verbatim
 * semantics (`session-notification-runner.ts:47-50`:
 * `promisify(execFile)(commandPath, [...args], { windowsHide: true })`).
 */
export type CommandRunner = (command: string, args: readonly string[]) => Promise<void>

/** The binary the Linux backend dispatches (`session-notification-linux.ts:10`). */
export const NOTIFY_SEND_COMMAND = 'notify-send'

/** The binary the macOS backend dispatches (`session-notification-macos.ts:63`). */
export const OSASCRIPT_COMMAND = 'osascript'

/**
 * Upstream Linux argv, VERBATIM (`session-notification-linux.ts:13-18`):
 *
 *   await runNotificationCommand(ctx, notifySendPath, [title, message],
 *     (shell) => shell`${notifySendPath} ${title} ${message} 2>/dev/null`)
 *
 * The argv the binary receives is exactly `[title, message]`; the `2>/dev/null`
 * is the shell template's stderr suppression, which `execFile` (no shell) does
 * not need — stderr is captured by the child-process API instead.
 */
export function buildNotifySendArgs(title: string, body: string): readonly string[] {
  return [title, body]
}

/**
 * Upstream `escapeAppleScriptText` (`session-notification-formatting.ts:1-3`):
 *
 *   return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
 *
 * DELIBERATE DIVERGENCE from upstream verbatim (PR #9 review F1). Upstream
 * escapes backslash and double-quote only, and AppleScript has NO backslash-n
 * escape — so a raw line feed inside the string literal built by
 * {@link buildAppleScript} is an osascript COMPILE ERROR: the whole
 * notification is swallowed into one `session-notification FAILED:` log line.
 * Upstream is not newline-free either — its own `buildReadyNotificationContent`
 * joins a head line and a todo-count line with LF — so the latent osascript bug
 * is upstream's; the port inherited it verbatim AND widened the exposure,
 * because this file's {@link buildNotificationContent} emits a two-line body
 * for a NON-EMPTY incomplete count on EVERY kind, including `error`, which
 * bypasses the pending-work gate ({@link shouldSkipForPendingWork} gates `idle`
 * only). On macOS that is the most common error-notification shape.
 *
 * The third replacement turns CRLF / CR / LF into AppleScript's concatenation
 * form `" & return & "` — close the string literal, concatenate the `return`
 * constant, reopen the literal. Replacement ORDER is load-bearing:
 *   1. backslash first (escaping quotes first would then re-escape their own
 *      backslashes);
 *   2. quote second;
 *   3. NEWLINE LAST — its replacement INTRODUCES `"` characters on purpose, and
 *      running the quote escape after it would turn those structural quotes
 *      into `\"` and corrupt the script.
 * CRLF is matched as ONE unit so a DOS line ending concatenates ONE `return`,
 * not two.
 *
 * Injection note: `baseTitle` / `baseMessage` / `errorMessage` are module
 * constants today (see the header's content reduction), so today's input is
 * author-controlled; this function is the single choke point that must stay
 * correct if any of them ever becomes configurable.
 */
export function escapeAppleScriptText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, '" & return & "')
}

/**
 * Upstream's osascript-tier AppleScript, VERBATIM
 * (`session-notification-macos.ts:66-68`):
 *
 *   const appleScript = "display notification \"" + escapedMessage + "\" with title \""
 *     + escapedTitle + "\""
 *
 * Note the ORDER: **message first, then title** — a transcription trap.
 */
export function buildAppleScript(title: string, body: string): string {
  const escapedTitle = escapeAppleScriptText(title)
  const escapedBody = escapeAppleScriptText(body)
  return `display notification "${escapedBody}" with title "${escapedTitle}"`
}

/** Upstream osascript argv, verbatim (`session-notification-macos.ts:69-73`): `['-e', script]`. */
export function buildOsascriptArgs(title: string, body: string): readonly string[] {
  return ['-e', buildAppleScript(title, body)]
}

/**
 * The Linux backend (`session-notification-linux.ts:5-19`). Ported in full: the
 * argv is {@link buildNotifySendArgs} and the dispatch is the injected runner.
 * (The sibling `playLinuxSessionNotificationSound`'s `paplay`→`aplay` fallback is
 * sound, not ported — see the header.)
 */
export function createLinuxNotifierBackend(run: CommandRunner): NotifierBackend {
  return {
    platform: 'linux',
    async notify(title, body) {
      await run(NOTIFY_SEND_COMMAND, buildNotifySendArgs(title, body))
    },
  }
}

/**
 * The macOS backend — the `osascript` tier ONLY (see the header's "macOS tiers"):
 * code-ported so the argv shape is pinned, but **L4-verified only** (plan §6 R-4:
 * no macOS runner in CI; the unit suite pins {@link buildOsascriptArgs} instead).
 */
export function createMacosNotifierBackend(run: CommandRunner): NotifierBackend {
  return {
    platform: 'darwin',
    async notify(title, body) {
      await run(OSASCRIPT_COMMAND, buildOsascriptArgs(title, body))
    },
  }
}

/**
 * The platform dispatch, a port of upstream `sendSessionNotification`'s switch
 * (`session-notification-send.ts:14-25`) with the `win32` arm REMOVED
 * (D9 — the task book: "Windows 后端不移植"; P3-T1 §10 另答(1) verified the win32
 * arm has zero cross-dependency, so dropping it cannot affect the other two).
 * `undefined` means "no backend on this platform" — the caller sends nothing and
 * logs nothing, exactly like upstream's silent `unsupported` case
 * (`send.ts:15-25` has no `unsupported` arm and `session-notification.ts:112`
 * returns before ever reaching it).
 */
export function createPlatformNotifierBackend(input: {
  readonly runtimePlatform: string
  readonly run: CommandRunner
}): NotifierBackend | undefined {
  const platform = detectNotificationPlatform(input.runtimePlatform)
  switch (platform) {
    case 'linux':
      return createLinuxNotifierBackend(input.run)
    case 'darwin':
      return createMacosNotifierBackend(input.run)
    // win32 (D9, not ported) and unsupported: no notification backend.
    default:
      return undefined
  }
}

/**
 * The production command runner — upstream's `execFile` fallback
 * (`session-notification-runner.ts:47-50`) with `windowsHide` kept. A rejection
 * is caught by the caller ({@link createSessionNotificationListener}'s dispatch
 * try/catch), never by this function: a missing `notify-send` is a diagnostic,
 * not a session failure.
 */
export async function runCommandViaExecFile(
  command: string,
  args: readonly string[],
): Promise<void> {
  const execFileAsync = promisify(execFile)
  await execFileAsync(command, [...args], { windowsHide: true })
}

// --- H-05: the two predicates (N-04 merged helper) ---------------------------

/** The two leaf fields read from one `dsh-tool-todo` TodoItem (types.d.ts:20-25). */
export interface TodoLike {
  readonly status: string
}

/** A caller-supplied todo snapshot; `null`/`undefined` mean "no list yet". */
export type TodoSnapshot = readonly TodoLike[] | null | undefined

/**
 * Upstream's `session-todo-status.ts:17` predicate, transcribed:
 * `todo.status !== "completed" && todo.status !== "cancelled"`.
 *
 * Kept as the TWO-status form on purpose — see the header: the E-mode module's
 * `todo.ts` predicate excludes two more statuses, and unifying them would change
 * one of the two ports silently. A missing/non-string status counts as pending
 * (upstream's `!==` chain does the same for `undefined`).
 */
export function isPendingTodo(todo: TodoLike): boolean {
  return todo.status !== 'completed' && todo.status !== 'cancelled'
}

/**
 * The incomplete subset, preserving the projection's order (upstream `some`).
 * `null`/`undefined`/`[]` all mean "nothing pending" — upstream's
 * `if (!todos || todos.length === 0) return false` early exit, verbatim.
 */
export function countIncompleteTodos(todos: TodoSnapshot): number {
  if (todos === null || todos === undefined) return 0
  let count = 0
  for (const todo of todos) {
    if (isPendingTodo(todo)) count += 1
  }
  return count
}

/** `hasIncompleteTodos` (`session-todo-status.ts:12-22`): pending count > 0. */
export function hasIncompleteTodos(todos: TodoSnapshot): boolean {
  return countIncompleteTodos(todos) > 0
}

/**
 * The shape upstream ORs together (`session-todo-status.ts:24-31`). The
 * `backgroundTaskActive` term is the DSH seam for the continuation marker's
 * `sources["background-task"].state === "active"` fact — see the header's
 * "background-task term" for why the registrar supplies `false` today.
 */
export interface PendingWorkSignals {
  readonly backgroundTaskActive?: boolean
}

/** `hasPendingSessionWork` (`session-todo-status.ts:24-31`), shape preserved. */
export function hasPendingSessionWork(
  todos: TodoSnapshot,
  signals: PendingWorkSignals = {},
): boolean {
  if (signals.backgroundTaskActive === true) return true
  return hasIncompleteTodos(todos)
}

// --- Notification content ----------------------------------------------------

/**
 * Builds the notification `{title, body}`. The content reduction is recorded in
 * the file header: DSH's `Session` has no title and reading messages back is a
 * storage read on the event path (discipline ③), so `title` is the configured
 * base title, and the body carries the H-05 fact the task book asks for — the
 * INCOMPLETE TODO COUNT — as a second line when it is non-zero.
 */
export function buildNotificationContent(input: {
  readonly kind: NotificationKind
  readonly baseTitle: string
  readonly baseMessage: string
  readonly errorMessage: string
  readonly incompleteCount: number
}): { readonly title: string; readonly body: string } {
  const head = input.kind === 'error' ? input.errorMessage : input.baseMessage
  if (input.incompleteCount <= 0) return { title: input.baseTitle, body: head }
  const noun = input.incompleteCount === 1 ? 'todo' : 'todos'
  return {
    title: input.baseTitle,
    body: `${head}\n${input.incompleteCount} ${noun} still incomplete`,
  }
}

// --- The U-4 todo reader (local, minimal — see the header) -------------------

/**
 * The `sessionProjections` key this hook reads (U-4). Exported so the unit test
 * and the listener cannot disagree about the spelling.
 */
export const SESSION_NOTIFICATION_TODOS_PROJECTION_KEY = 'todos'

/**
 * The narrow `ctx.get` face this file needs. `HooksRegistrationContext` already
 * exposes `get?`, so a fake context in a unit test needs no service registry and
 * the loop's contract is unchanged.
 */
export interface ServiceAccessorContext {
  get?(name: string): unknown
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * Reads `ctx.get(name)` defensively. A context without `get` (or a service that
 * is not mounted) yields `undefined`, which every caller treats as "capability
 * absent" — never an error (an optional service must not become a boot failure).
 */
function getService(ctx: ServiceAccessorContext, name: string): unknown {
  if (typeof ctx.get !== 'function') return undefined
  return ctx.get(name)
}

/**
 * Copies the `todos` projection into a small owned array of leaf values
 * (discipline ①: never dump or retain the live projection value). Anything that
 * is not an array of `{status: string}` is reported as `undefined` —
 * indistinguishable from "no list yet", which is exactly the answer the
 * notification gate wants.
 */
function toTodoSnapshot(value: unknown): TodoSnapshot {
  if (!Array.isArray(value)) return undefined
  const todos: TodoLike[] = []
  for (const item of value) {
    if (!isObject(item)) return undefined
    const status = (item as { readonly status?: unknown }).status
    if (typeof status !== 'string') return undefined
    todos.push({ status })
  }
  return todos
}

/**
 * U-4: the native todo read face — `ctx.sessionProjections.stateOf(session,
 * 'todos')`. Returns `undefined` when the service, the method, or the key is
 * absent, so an unmounted `dsh-tool-todo` degrades to "nothing pending" instead
 * of a throw. Mirrors todo-continuation-enforcer.ts's reader (same source, kept
 * local — see the header).
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
      SESSION_NOTIFICATION_TODOS_PROJECTION_KEY,
    ),
  )
}

// --- The event classification (pure) ----------------------------------------

/**
 * What one `session/event` asks this hook to do. A closed union so a new DSH
 * event type cannot silently fall into a default behaviour, and so the unit
 * suite can pin the complete mapping table (the header's DSH EVENT MAPPING).
 */
export type SessionNotificationTrigger =
  /** A new turn opened: activity, and no work produced yet by THIS turn. */
  | { readonly kind: 'turn-start' }
  /** A step/message/result landed: activity, and the session produced work. */
  | { readonly kind: 'work' }
  /** `turn/end` with `reason.kind === 'completed'`. */
  | { readonly kind: 'complete' }
  /** `turn/end` with `reason.kind === 'error'`. */
  | { readonly kind: 'error' }
  /** Everything else — including the four non-completed/non-error reasons. */
  | { readonly kind: 'none' }

/**
 * The event types that mean "the session produced real work". `step/end` is one
 * model call plus its tool executions
 * (dsh-session/lib/types/types.d.ts:270-271); `assistant/message` and
 * `tool/result` are the two surface events that carry its outcome. `turn/start`
 * is deliberately NOT here: it opens a turn, it does not produce anything.
 */
export const WORK_EVENT_TYPES: readonly string[] = ['step/end', 'assistant/message', 'tool/result']

/** Reads `event.data.reason.kind` for a `turn/end`, defensively. */
function readTurnEndReasonKind(event: object): string | undefined {
  const data = (event as { readonly data?: unknown }).data
  if (!isObject(data)) return undefined
  const reason = (data as { readonly reason?: unknown }).reason
  if (!isObject(reason)) return undefined
  const kind = (reason as { readonly kind?: unknown }).kind
  return typeof kind === 'string' ? kind : undefined
}

/**
 * The pure `session/event` → trigger map. Leaf reads only (discipline ①): the
 * `type` discriminator and, for `turn/end`, `data.reason.kind`. Anything
 * unrecognized (including a malformed payload) is `none`, never a throw.
 *
 * The reason union is exhaustive BY EXCLUSION: only `completed` and `error`
 * produce a trigger, so `aborted` / `blocked` / `max-tokens` / `interrupted` /
 * unknown all fall to `none`. That is the `max-tokens` trap handled structurally
 * rather than by a default (see the file header).
 */
export function classifySessionEvent(event: unknown): SessionNotificationTrigger {
  if (!isObject(event)) return { kind: 'none' }
  const type = (event as { readonly type?: unknown }).type
  if (type === 'turn/start') return { kind: 'turn-start' }
  if (typeof type === 'string' && WORK_EVENT_TYPES.includes(type)) return { kind: 'work' }
  if (type !== 'turn/end') return { kind: 'none' }
  const reason = readTurnEndReasonKind(event)
  if (reason === 'completed') return { kind: 'complete' }
  if (reason === 'error') return { kind: 'error' }
  return { kind: 'none' }
}

/** The DSH lifecycle statuses (`AgentStatus`, runtime-types.d.ts:84). */
export type AgentStatusLike = 'idle' | 'running'

/** Reads `payload.status` for an `agent/status` emit, defensively. */
export function readAgentStatus(payload: unknown): AgentStatusLike | undefined {
  if (!isObject(payload)) return undefined
  const status = (payload as { readonly status?: unknown }).status
  if (status === 'idle' || status === 'running') return status
  return undefined
}

/**
 * The main-session filter (upstream `shouldNotifyForSession`,
 * `session-notification.ts:87-96`), re-homed onto the DSH fact that exists: the
 * session's own durable header. Upstream consults OMO's process-global
 * `subagentSessions` set and `getMainSessionID()`; DSH marks a subagent child in
 * the session header itself — `origin === 'subagent'` and
 * `delegationDepth === parent + 1`, both written by the producer at
 * `dsh-subagent/lib/index.js:510-511` (`{ origin: "subagent", delegationDepth:
 * childDepth }`) and declared at dsh-session/lib/types/types.d.ts:76-90 — so a
 * child session is filtered out WITHOUT a global roster.
 *
 * A session whose header cannot be read is NOT filtered (fail open towards
 * notifying): the filter exists to suppress noise from delegated children, and
 * suppressing a real completion is the worse failure.
 */
export function shouldNotifyForSession(session: unknown): boolean {
  if (!isObject(session)) return false
  const header = (session as { readonly header?: unknown }).header
  if (!isObject(header)) return true
  const origin = (header as { readonly origin?: unknown }).origin
  if (origin === 'subagent') return false
  const depth = (header as { readonly delegationDepth?: unknown }).delegationDepth
  if (typeof depth === 'number' && depth > 0) return false
  return true
}

// --- The scheduler + listener (the port of session-notification-scheduler) ---

/** A timer handle, kept opaque so the injected timer seams stay testable. */
export type TimerHandle = unknown

/**
 * The injected seams. Everything with an ambient dependency (the clock, timers,
 * the backend, the todo reader, the service registry) is injectable so the unit
 * suite is deterministic and never spawns a process.
 */
export interface SessionNotificationDeps {
  /** The platform backend, or `undefined` for "no notification on this platform". */
  readonly backend: NotifierBackend | undefined
  /** Reads the `todos` projection for one session (U-4). */
  readonly readTodos: (session: unknown) => TodoSnapshot
  /**
   * The `skipIfIncompleteTodos` gate (`scheduler.ts:118-124`). Defaults to the
   * H-05 predicate over {@link readTodos}; injectable because upstream's
   * `hasPendingSessionWork` also ORs the continuation marker's background-task
   * fact (see the header's "background-task term").
   */
  readonly hasPendingWork?: (session: unknown) => boolean | Promise<boolean>
  /** The stable notification anchor sink. */
  readonly log: (line: string) => void
  /** The swallowed-failure sink; defaults to {@link log} when absent. */
  readonly logFailure?: (line: string) => void
  /** Config overrides merged over {@link DEFAULT_SESSION_NOTIFICATION_CONFIG}. */
  readonly config?: Partial<SessionNotificationConfig>
  /** Clock seam; defaults to `Date.now`. */
  readonly now?: () => number
  /** Timer seam; defaults to `setTimeout`. */
  readonly setTimer?: (fn: () => void, delayMs: number) => TimerHandle
  /** Timer seam; defaults to `clearTimeout`. */
  readonly clearTimer?: (handle: TimerHandle) => void
}

/**
 * One session's scheduler record — the six upstream collections collapsed into
 * one WeakMap value (header: "THE DEBOUNCE PORT"). Field-by-field:
 * `notified` ← notifiedSessions, `pendingTimer` ← pendingTimers, `activitySinceIdle`
 * ← sessionActivitySinceIdle, `version` ← notificationVersions, `executing` ←
 * executingNotifications, `scheduledAt` ← scheduledAt.
 *
 * `hasWorked` is this port's DSH addition for the task book's
 * "完成通知（会话有实际工作产出）": `turn/start` clears it, {@link WORK_EVENT_TYPES}
 * sets it, and the `idle` kind refuses to schedule without it. Without it, DSH's
 * `agent/status(idle)` — which fires at boot and after every trivially-closed
 * turn — would announce a session that never did anything.
 */
interface SessionState {
  /** The live session object; the notification content and gate both need it. */
  readonly session: unknown
  /** notificationVersions: bumped by every cancel and every schedule. */
  version: number
  /** notifiedSessions: this session already got its notification. */
  notified: boolean
  /** sessionActivitySinceIdle: activity arrived and no re-schedule has cleared it. */
  activitySinceIdle: boolean
  /** executingNotifications: `send` is in flight. */
  executing: boolean
  /** scheduledAt: the epoch-ms stamp the grace period measures from. */
  scheduledAt: number | undefined
  /** pendingTimers: the armed timer handle. */
  pendingTimer: TimerHandle
  /** This port's "the session produced something" flag (see the interface doc). */
  hasWorked: boolean
}

/** The observation surface the registrar wires; two emitters, one state machine. */
export interface SessionNotificationListener {
  /** The `session/event` observer: `(session, event)`. */
  onSessionEvent(session: unknown, event: unknown): void
  /** The `agent/status` observer: `(payload)` with `{agent, status}`. */
  onAgentStatus(payload: unknown): void
  /** How many timers are currently armed (diagnostics + the unit suite). */
  pendingTimerCount(): number
  /** Cancels every armed timer and stops all further work (fiber stop). */
  dispose(): void
}

/**
 * Whether the `skipIfIncompleteTodos` gate applies to one notification kind.
 * TRUE for the completion notification only — the header records why (an error
 * notification suppressed by unfinished todos would hide the event the user must
 * hear about, and upstream had no error notification for the gate to guard).
 */
export function shouldSkipForPendingWork(kind: NotificationKind): boolean {
  return kind === 'idle'
}

/** Reads `payload.agent.session` for an `agent/status` emit, defensively. */
function readAgentSession(payload: unknown): unknown {
  if (!isObject(payload)) return undefined
  const agent = (payload as { readonly agent?: unknown }).agent
  if (!isObject(agent)) return undefined
  return (agent as { readonly session?: unknown }).session
}

/**
 * Builds the completion/error notification observer pair. Cross-event state
 * lives in this closure (discipline ⑤): a `WeakMap` keyed by the session OBJECT
 * (a finished session's record is collected with it, so the upstream
 * `maxTrackedSessions` prune has no job left — see the header) plus a `Set` of
 * armed timer handles, which is what {@link SessionNotificationListener.dispose}
 * needs and is itself fiber-scoped.
 *
 * The `state.session` reference does NOT keep the key alive: a WeakMap value that
 * refers back to its own key is the standard ephemeron case, and the pair stays
 * collectable together.
 */
export function createSessionNotificationListener(
  deps: SessionNotificationDeps,
): SessionNotificationListener {
  const config: SessionNotificationConfig = {
    ...DEFAULT_SESSION_NOTIFICATION_CONFIG,
    ...deps.config,
  }
  const now = deps.now ?? (() => Date.now())
  const setTimer = deps.setTimer
    ?? ((fn: () => void, delayMs: number): TimerHandle => setTimeout(fn, delayMs))
  const clearTimer = deps.clearTimer
    ?? ((handle: TimerHandle): void => {
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    })
  const states = new WeakMap<object, SessionState>()
  const liveTimers = new Set<TimerHandle>()
  let disposed = false

  const hasPendingWork = deps.hasPendingWork
    ?? ((session: unknown): boolean => hasPendingSessionWork(deps.readTodos(session)))

  function reportFailure(what: string, err: unknown): void {
    const line = formatNotificationFailureLine(what, err)
    try {
      if (deps.logFailure !== undefined) deps.logFailure(line)
      else deps.log(line)
    } catch {
      // Diagnostics are not worth breaking an append feed for (discipline ②).
    }
  }

  function logSafely(line: string): void {
    try {
      deps.log(line)
    } catch {
      // Same.
    }
  }

  function stateOf(session: object): SessionState {
    let state = states.get(session)
    if (state === undefined) {
      state = {
        session,
        version: 0,
        notified: false,
        activitySinceIdle: false,
        executing: false,
        scheduledAt: undefined,
        pendingTimer: undefined,
        hasWorked: false,
      }
      states.set(session, state)
    }
    return state
  }

  /**
   * `cancelPendingNotification` (`scheduler.ts:63-72`) — the version bump is the
   * load-bearing part: an `executeNotification` already past its guards compares
   * the version again after every `await` and stands down when it moved.
   */
  function clearPending(state: SessionState): void {
    const handle = state.pendingTimer
    if (handle !== undefined) {
      state.pendingTimer = undefined
      liveTimers.delete(handle)
      try {
        clearTimer(handle)
      } catch (err) {
        reportFailure('clear timer failed', err)
      }
    }
    state.scheduledAt = undefined
  }

  function cancelPending(state: SessionState): void {
    clearPending(state)
    state.activitySinceIdle = true
    state.version += 1
  }

  /**
   * `markSessionActivity` (`scheduler.ts:74-88`), including the activity GRACE
   * PERIOD first: activity arriving within `activityGracePeriodMs` of a schedule
   * is deliberately IGNORED (upstream's "ignore late-arriving activity events
   * after scheduling"). Then cancel + clear `notified` unless a send is in
   * flight (upstream keeps `notified` while `executing`, because the in-flight
   * send is about to claim it).
   */
  function markActivity(state: SessionState): void {
    const scheduledTime = state.scheduledAt
    if (
      config.activityGracePeriodMs > 0
      && scheduledTime !== undefined
      && now() - scheduledTime <= config.activityGracePeriodMs
    ) {
      return
    }
    cancelPending(state)
    if (!state.executing) state.notified = false
  }

  /**
   * `scheduleIdleNotification` (`scheduler.ts:153-170`), plus this port's
   * `hasWorked` gate for the completion kind. Upstream's three early exits are
   * kept in order, the activity flag is cleared, `scheduledAt` is stamped, the
   * version is bumped, and the timer captures THAT version.
   */
  function schedule(state: SessionState, kind: NotificationKind): void {
    if (kind === 'idle' && !state.hasWorked) return
    if (state.notified) return
    if (state.pendingTimer !== undefined) return
    if (state.executing) return
    state.activitySinceIdle = false
    state.scheduledAt = now()
    state.version += 1
    const version = state.version
    const handle = setTimer(() => {
      // The timer has FIRED, so it is no longer pending: drop the handle from
      // the live set before dispatching (a later `clearPending` re-deletes it,
      // and clearing an already-fired handle is a no-op). This is what makes
      // {@link SessionNotificationListener.pendingTimerCount} mean "still armed"
      // rather than "armed or in flight".
      liveTimers.delete(handle)
      void executeNotification(state, version, kind)
    }, config.idleConfirmationDelay)
    state.pendingTimer = handle
    liveTimers.add(handle)
  }

  /**
   * `executeNotification` (`scheduler.ts:90-151`) — the guard ladder, the
   * post-await re-checks, `notified` claimed BEFORE the send, and the `finally`
   * that rolls it back when activity arrived mid-send.
   *
   * Fail-open towards the SESSION: the whole body is inside a try/catch, because
   * `session/event` is an emit feed and a rejection from a notification command
   * must never surface as anything but a log line (discipline ②).
   */
  async function executeNotification(
    state: SessionState,
    version: number,
    kind: NotificationKind,
  ): Promise<void> {
    if (
      state.executing
      || disposed
      || state.version !== version
      || state.activitySinceIdle
      || state.notified
    ) {
      clearPending(state)
      return
    }
    state.executing = true
    try {
      if (shouldSkipForPendingWork(kind) && config.skipIfIncompleteTodos) {
        let pending = false
        try {
          pending = await hasPendingWork(state.session)
        } catch (err) {
          // Upstream's `hasIncompleteTodos` swallows its own read failure and
          // answers "not pending" (`session-todo-status.ts:18-21`), i.e. it
          // notifies. Mirrored here: a broken probe never suppresses a
          // completion notification.
          reportFailure('pending-work probe failed', err)
          pending = false
        }
        if (state.version !== version) return
        if (pending) return
      }
      if (disposed) return
      if (state.version !== version) return
      if (state.activitySinceIdle) {
        state.activitySinceIdle = false
        return
      }
      state.notified = true
      await send(state.session, kind)
    } catch (err) {
      reportFailure('notification dispatch failed', err)
    } finally {
      state.executing = false
      clearPending(state)
      if (state.activitySinceIdle) {
        state.notified = false
        state.activitySinceIdle = false
      }
    }
  }

  /**
   * The dispatch itself: content first, then the STABLE ANCHOR LINE, then the
   * OS command. The anchor is logged before the command so a CI box with no
   * notification daemon still produces the probe/e2e anchor (header: LOG ANCHOR
   * CONTRACT). A `backend === undefined` platform notifies nothing and logs
   * nothing — the anchor never claims a notification that did not happen.
   */
  async function send(session: unknown, kind: NotificationKind): Promise<void> {
    const incompleteCount = countIncompleteTodos(deps.readTodos(session))
    const content = buildNotificationContent({
      kind,
      baseTitle: config.baseTitle,
      baseMessage: config.baseMessage,
      errorMessage: config.errorMessage,
      incompleteCount,
    })
    const backend = deps.backend
    if (backend === undefined) return
    logSafely(formatNotificationLine(kind, content.title))
    await backend.notify(content.title, content.body)
  }

  function onSessionEvent(session: unknown, event: unknown): void {
    try {
      if (disposed) return
      const trigger = classifySessionEvent(event)
      if (trigger.kind === 'none') return
      if (!isObject(session)) return
      const state = stateOf(session)
      switch (trigger.kind) {
        case 'turn-start':
          // A new turn is starting: the previous turn's work is consumed, so a
          // later idle without work in BETWEEN cannot announce anything.
          state.hasWorked = false
          markActivity(state)
          return
        case 'work':
          state.hasWorked = true
          markActivity(state)
          return
        case 'complete':
          if (!shouldNotifyForSession(session)) return
          schedule(state, 'idle')
          return
        case 'error':
          if (!shouldNotifyForSession(session)) return
          schedule(state, 'error')
          return
      }
    } catch (err) {
      // Fail open: `session/event` observers are contained, but our own bug must
      // not spam the feed with a rejection either.
      reportFailure('session event observer failed', err)
    }
  }

  function onAgentStatus(payload: unknown): void {
    try {
      if (disposed) return
      const status = readAgentStatus(payload)
      if (status === undefined) return
      const session = readAgentSession(payload)
      if (!isObject(session)) return
      const state = stateOf(session)
      if (status === 'running') {
        // A driver became active again — the DSH counterpart of upstream's
        // message.updated activity marks (see the file header).
        markActivity(state)
        return
      }
      if (!shouldNotifyForSession(session)) return
      // The AUXILIARY trigger: upstream's `session.idle`. It is what covers a
      // turn that closed for a reason this port deliberately does not notify on
      // (aborted / blocked / max-tokens / interrupted); when a completion or
      // error notification is already scheduled, `schedule`'s pending guard
      // makes this a no-op, so there is never a double notification.
      schedule(state, 'idle')
    } catch (err) {
      reportFailure('agent status observer failed', err)
    }
  }

  return {
    onSessionEvent,
    onAgentStatus,
    pendingTimerCount: () => liveTimers.size,
    dispose: () => {
      disposed = true
      for (const handle of [...liveTimers]) {
        try {
          clearTimer(handle)
        } catch {
          // A timer that refuses to clear cannot block fiber teardown.
        }
      }
      liveTimers.clear()
    },
  }
}

// --- The registrar -----------------------------------------------------------

/**
 * Registers BOTH observers through `ctx.on` (the preferred channel — cordis then
 * scopes them to the registering fiber) and returns a disposer that cancels any
 * armed notification timer, which the loop registers with `ctx.effect`
 * (index.ts discipline ①). The primary event comes from the manifest row, never
 * a second literal, so the row stays the single source of truth.
 *
 * The platform and the command runner are resolved HERE, at apply time — never on
 * the event path (discipline ③ and the plan's "静态文案 apply 时构建" rule).
 */
export const registerSessionNotification: HookRegistrar = (
  ctx: HooksRegistrationContext,
  entry: HookManifestEntry,
) => {
  const listener = createSessionNotificationListener({
    backend: createPlatformNotifierBackend({
      runtimePlatform: process.platform,
      run: runCommandViaExecFile,
    }),
    readTodos: (session) => readTodosProjection(ctx, session),
    log: (line) => console.log(line),
    logFailure: (line) => console.warn(line),
  })
  ctx.on(entry.event, (session, event) => listener.onSessionEvent(session, event))
  ctx.on(SESSION_NOTIFICATION_STATUS_EVENT, (payload) => listener.onAgentStatus(payload))
  return () => listener.dispose()
}
