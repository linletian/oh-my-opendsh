// background-notification.ts — P3-T12 listener (task book WP-5; plan §4.2
// pattern F): OMO's background-task completion notification, reborn as a DSH
// observer of the native background-job surface.
//
// Upstream: packages/omo-opencode/src/hooks/background-notification/ @ v4.19.4
//   (frozen baseline tag, commit
//   b072d279110bdda2c6ac2525d0d24dc54d16148a; 4 files = 3 implementations +
//   1 test — P3-T1 §11 实测). 语义移植（非逐字复制）. No upstream code is
//   vendored.
//
//   The 3 upstream implementation files (the plan §4.9 逐文件署名 requirement):
//     hook.ts   — PORTED (the event whitelist + the two handler halves; see below)
//     index.ts  — PORTED (the registration surface becomes this registrar)
//     types.ts  — NOT PORTED, deliberately: `BackgroundNotificationHookConfig`
//                 is a type the upstream factory never accepts (`hook.ts:38` takes
//                 only the manager) — P3-T1 §11 移植难点 4 records it as an
//                 upstream defect, and copying it would invent a config face that
//                 does not exist. `formatNotification?: (tasks) => string` is
//                 therefore not part of this port.
//
// ═══════════════ PREREQUISITE ANSWER (task book: "必须先答") ═══════════════
// QUESTION: does a DSH background job's completion have an OBSERVABLE EVENT
// surface, or must the port degrade to a turn/end-time query?
//
// ANSWER: **YES — the native event surface exists.** It is not a `session/event`
// member and not a cordis event: it is a SERVICE SUBSCRIPTION on `ctx.jobs`.
// Verbatim, `dsh-jobs/lib/types/index.d.ts:103-111`:
//
//     /**
//      * Register an effect-scoped completion listener. It receives the settlements
//      * of the owners its registering context's scope covers; each listener is
//      * contained; returned promises are observed but not awaited. No listener runs
//      * after service disposal.
//      * @param listener - receives each terminal snapshot and its exact owner.
//      * @returns disposer that unregisters the listener.
//      */
//     abstract onJobDone(listener: JobDoneListener): () => void;
//
// with, verbatim, `dsh-jobs/lib/types/types.d.ts:131-135`:
//
//     /**
//      * Completion callback with the exact owner supplied at start, or `undefined`
//      * for an unowned job. Returned promises are observed but not awaited.
//      */
//     export type JobDoneListener = (snapshot: JobSnapshot, owner: Agent | undefined) => void | PromiseLike<void>;
//
// and the implementation, verbatim, `dsh-jobs-local/lib/index.js:261-263`:
//
//     onJobDone(listener) {
//         return this.layers.effect(this.ctx, (layer) => layer.listeners.append(listener), { label: "jobs.onJobDone()" });
//     }
//
// So `ctx.jobs.onJobDone(fn)` is a PUSH surface with an effect-scoped disposer —
// the primary path this port takes (the task book's "有事件面 → F 模式 listener").
// The sibling `onJobsChanged(listener)` (`index.d.ts:134`) is the visible-set
// observer; it is NOT used here (it "carries no delivery meaning and marks
// nothing reported", which is the wrong shape for a one-shot notification).
//
// A second, deliberately weaker surface also exists and becomes the DEGRADED
// path when the push subscription is unavailable: `list(caller?: Agent)` —
// verbatim, `dsh-jobs/lib/types/index.d.ts:57-63`:
//
//     /**
//      * List caller-owned and unowned jobs in registration order without exposing
//      * another session's labels.
//      * @param caller - reading agent; a non-agent caller sees only unowned jobs.
//      * @returns fresh snapshots.
//      */
//     abstract list(caller?: Agent): JobSnapshot[];
//
// ⚠️ The degradation is REAL and is recorded rather than hidden: the pull path
// is driven from `session/event`, whose payload is `(session, event)` — and the
// DSH `Session` class exposes NO agent back-reference
// (dsh-session/lib/types/index.d.ts:103-200 has `id`/`header`/events only), so
// the pull path can only call `list()` with NO caller, i.e. it sees UNOWNED jobs
// only. A background job started by a tool has an owner, so on a deployment
// without `onJobDone` this listener would notify for almost nothing. It is kept
// because the task book requires the degraded design to exist and be tested, and
// because "the push surface is missing" is not something to silently ignore.
//
// ═══════════ THE HALF DSH ALREADY COVERS (R-8, mandatory record) ═══════════
// Upstream `background-notification` is a 55-line THIN ADAPTER with TWO halves
// (`hook.ts:38-54`):
//
//     const eventHandler = async ({ event }: EventInput) => {
//       if (!shouldForwardEvent(event.type)) return
//       manager.handleEvent(event)
//     }
//     const chatMessageHandler = async (input, output) => {
//       manager.injectPendingNotificationsIntoChatMessage(output, input.sessionID)
//     }
//     return { "chat.message": chatMessageHandler, event: eventHandler }
//
// The MODEL-FACING half (inject the pending notification into the next message)
// is NATIVELY COVERED by DSH, verbatim at `dsh-tool-jobs/lib/index.js:206-224`:
//
//     ctx.jobs.onJobDone((snapshot, owner) => {
//         if (snapshot.reported || owner === void 0) return;
//         const message = createUserMessage({
//             content: [{ type: "text", text: fitCompletionNotice(snapshot) }],
//             source: { kind: "plugin", plugin: "tool-jobs", form: "notice", summary: completionSummary(snapshot) }
//         });
//         const spent = spentWakes.get(owner) ?? 0;
//         if (delivery === "wakeup" && owner.status === "idle" && spent < wakeBudget) {
//             spentWakes.set(owner, spent + 1);
//             owner.followup(message);
//             return;
//         }
//         owner.inject(message);
//     });
//
// i.e. DSH already turns a job settlement into a model-visible notice (with a
// wakeup/inject policy this port could only duplicate). That half is therefore
// NOT PORTED — a duplicate injection would spend a model request per job. The
// half that IS ported is the one DSH does not have at all: P3-T1 §10 移植难点 1
// records that the pinned install contains NO notification/toast package, so the
// USER-FACING OS notification is a new capability. Upstream's own user-facing
// half lives in `features/background-agent` (`BackgroundManager`, outside the
// surveyed `hooks/` scope) and is therefore not transcribed here; the port emits
// the notification directly from the settlement instead.
//
// DIFFERENCE FROM UPSTREAM PUSH SEMANTICS (the task book asks for this note):
// upstream forwards EVENTS to `BackgroundManager`, which owns all the real
// semantics (which task counts as a "pending notification", how it renders, when
// it is cleared). This port has no manager and no event whitelist (`hook.ts:20-36`
// forwards `message.*` / `todo.updated` / `session.*` / the `session.next.*`
// prefix purely to feed that manager) — the DSH jobs registry already carries the
// authoritative lifecycle, so the port observes the ONE terminal fact
// (`onJobDone`) instead of replaying a platform event vocabulary. The
// `session.next.*` prefix whitelist (P3-T1 §11 移植难点 2: "DSH 的 SessionEvent
// 是否有同族前缀未核实") is consequently moot: there is nothing to forward.
//
// REPORTED-JOB GATE (DSH-specific, derived from the native reporter):
// `snapshot.reported === true` means a kill, a read, a wait, or a teardown cancel
// already reported the terminal state — verbatim, `dsh-jobs/lib/types/types.d.ts`
// `JobSnapshot.reported`: "Completion reporters suppress redundant notices when
// set." The native reporter's first line is the same gate (`if (snapshot.reported
// || owner === void 0) return`), so this port mirrors it: a job the user already
// collected does not also pop an OS notification. This is a KNOWING narrowing
// (upstream forwarded everything it received).
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2, all modes):
//   ① / ③ no disk reads and no ambient work on the event path: the backend is
//      built at apply time and the content is assembled from the snapshot's leaf
//      fields only (never a live registry object).
//   ② every observer body wraps its OWN logic in try/catch. Both surfaces are
//      contained by their owners (`onJobDone` listeners are contained and their
//      rejections logged — `dsh-jobs-local/lib/index.js:378-386`; `session/event`
//      observers are "logged and contained") — this port's try/catch keeps OUR
//      bugs out of both.
//   ⑤ no module-level mutable state: the notified-id set (the pull path's dedup,
//      without which every later `turn/end` would re-notify for the same settled
//      job) lives in the registrar-side listener closure.
//
// LOG ANCHOR CONTRACT (probe / e2e; keep the format stable, extend the probe):
//   * `[omo-hooks] background-notification: <status> <label>`
//     — ONE line per dispatched notification, emitted BEFORE the OS command runs
//       (the same CI-carrier rule as the sibling session-notification anchor).
//   * `[omo-hooks] background-notification FAILED: <what>: <describeError>`
//     — a swallowed failure (backend rejection, subscription failure). Kept out
//       of the boot markers' `hook <id> FAILED` form on purpose.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar, HooksRegistrationContext } from '../index.ts'
import { describeError } from '../boot-markers.ts'
import {
  DEFAULT_SESSION_NOTIFICATION_CONFIG,
  createPlatformNotifierBackend,
  runCommandViaExecFile,
  type NotifierBackend,
} from './session-notification.ts'

/** The manifest id this registrar implements (manifest.ts row H-11). */
export const BACKGROUND_NOTIFICATION_ID = 'background-notification'

/**
 * The AUXILIARY event of the degraded (pull) path. The manifest's declared
 * primary event is the same string (`session/event`), and the registrar always
 * observes it — see {@link registerBackgroundNotification}.
 */
export const BACKGROUND_NOTIFICATION_EVENT = 'session/event'

/** The stable log-anchor prefix (see the header's LOG ANCHOR CONTRACT). */
export const BACKGROUND_LOG_PREFIX = '[omo-hooks] background-notification: '

/** The swallowed-failure log prefix (never the boot-marker form). */
export const BACKGROUND_FAILURE_PREFIX = '[omo-hooks] background-notification FAILED: '

/** The three terminal `JobStatus` members (types.d.ts:14). */
export const TERMINAL_JOB_STATUSES: readonly string[] = ['completed', 'killed', 'failed']

/** Builds the stable anchor line. */
export function formatBackgroundNotificationLine(status: string, label: string): string {
  return `${BACKGROUND_LOG_PREFIX}${status} ${label}`
}

/** Builds the swallowed-failure line. */
export function formatBackgroundNotificationFailureLine(what: string, err: unknown): string {
  return `${BACKGROUND_FAILURE_PREFIX}${what}: ${describeError(err)}`
}

// --- The `ctx.jobs` face (structural, minimal) -------------------------------

/**
 * The minimal `ctx.jobs` face this file reads. Declared structurally because the
 * registrar's context is the plugin's own (`ctx.get(name)` returns `unknown`), so
 * every member is optional and verified with `typeof === 'function'` before use —
 * a service that is absent, reloaded, or a different implementation degrades to
 * the pull path instead of throwing at boot.
 */
export interface JobsSurface {
  /** `dsh-jobs/lib/types/index.d.ts:111` — returns the unregister disposer. */
  onJobDone?(listener: (snapshot: unknown, owner: unknown) => void): unknown
  /** `dsh-jobs/lib/types/index.d.ts:63` — the degraded read face. */
  list?(caller?: unknown): readonly unknown[]
}

/** The leaf fields of one `JobSnapshot` this file reads (types.d.ts:88-119). */
export interface JobSnapshotLike {
  readonly id: string
  readonly kind: string
  readonly label: string
  readonly status: string
  readonly detail?: string
  readonly reported: boolean
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * Copies a settlement snapshot into a small owned record of leaf values
 * (discipline ①: never retain or serialize the live registry projection).
 * `undefined` means "not a snapshot this hook can notify about".
 */
export function toJobSnapshot(value: unknown): JobSnapshotLike | undefined {
  if (!isObject(value)) return undefined
  const record = value as Record<string, unknown>
  const id = record.id
  const kind = record.kind
  const label = record.label
  const status = record.status
  if (typeof id !== 'string' || id === '') return undefined
  if (typeof kind !== 'string' || typeof label !== 'string' || typeof status !== 'string') {
    return undefined
  }
  const detail = record.detail
  return {
    id,
    kind,
    label,
    status,
    ...(typeof detail === 'string' ? { detail } : {}),
    reported: record.reported === true,
  }
}

/**
 * The notify gate: a terminal, not-yet-reported snapshot. `reported` mirrors the
 * native reporter's own suppression (`dsh-tool-jobs/lib/index.js:207`; see the
 * header's REPORTED-JOB GATE).
 */
export function shouldNotifyForJob(snapshot: JobSnapshotLike): boolean {
  if (snapshot.reported) return false
  return TERMINAL_JOB_STATUSES.includes(snapshot.status)
}

/** The notification `{title, body}` for one settlement. */
export function buildJobNotificationContent(
  snapshot: JobSnapshotLike,
  baseTitle: string = DEFAULT_SESSION_NOTIFICATION_CONFIG.baseTitle,
): { readonly title: string; readonly body: string } {
  const lines = [
    `Background ${snapshot.kind} job ${snapshot.id} finished: ${snapshot.status}`,
    snapshot.label,
  ]
  if (snapshot.detail !== undefined && snapshot.detail !== '') lines.push(snapshot.detail)
  return { title: baseTitle, body: lines.join('\n') }
}

// --- The listener ------------------------------------------------------------

/** The injected seams (the backend is the sibling module's abstraction). */
export interface BackgroundNotificationDeps {
  /** The platform backend, or `undefined` for "no notification on this platform". */
  readonly backend: NotifierBackend | undefined
  /** The `ctx.jobs` service, or `undefined` when it is not mounted. */
  readonly jobs: JobsSurface | undefined
  /** The stable notification anchor sink. */
  readonly log: (line: string) => void
  /** The swallowed-failure sink; defaults to {@link log} when absent. */
  readonly logFailure?: (line: string) => void
  /** Title override; defaults to the sibling module's base title. */
  readonly baseTitle?: string
}

/**
 * The observation surface. Both methods are always present so the registrar can
 * wire them unconditionally; {@link hasPushSurface} decides which one does work.
 */
export interface BackgroundNotificationListener {
  /** The `ctx.jobs.onJobDone` callback (push path). */
  onJobDone(snapshot: unknown, owner: unknown): void
  /** The `session/event` observer (pull path; inert while the push path is live). */
  onSessionEvent(session: unknown, event: unknown): void
  /** Whether `jobs.onJobDone` was available when this listener was built. */
  hasPushSurface(): boolean
}

/** Reads `event.type === 'turn/end'`-ness of a session event, defensively. */
function isTurnEndEvent(event: unknown): boolean {
  if (!isObject(event)) return false
  return (event as { readonly type?: unknown }).type === 'turn/end'
}

/**
 * Builds the observer pair.
 *
 * `hasPush` is decided ONCE, at construction, from the injected service: when the
 * push subscription is available the pull path stands down (`onSessionEvent`
 * returns immediately), because both would otherwise notify for the same
 * settlement. The pull path is therefore a genuine FALLBACK, not dead code — it
 * is what a deployment without `ctx.jobs.onJobDone` gets, and the unit suite
 * exercises both branches.
 *
 * `notifiedJobIds` is the pull path's essential dedup: the registry keeps settled
 * jobs in `list()`, so without it every later `turn/end` would re-announce the
 * same job. It is a closure-local `Set` (fiber-scoped, discipline ⑤) and needs no
 * prune — job ids are process-bounded and a notification per id is exactly once.
 */
export function createBackgroundNotificationListener(
  deps: BackgroundNotificationDeps,
): BackgroundNotificationListener {
  const baseTitle = deps.baseTitle ?? DEFAULT_SESSION_NOTIFICATION_CONFIG.baseTitle
  const hasPush = typeof deps.jobs?.onJobDone === 'function'
  const notifiedJobIds = new Set<string>()

  function reportFailure(what: string, err: unknown): void {
    const line = formatBackgroundNotificationFailureLine(what, err)
    try {
      if (deps.logFailure !== undefined) deps.logFailure(line)
      else deps.log(line)
    } catch {
      // Diagnostics are not worth breaking a settlement (discipline ②).
    }
  }

  function logSafely(line: string): void {
    try {
      deps.log(line)
    } catch {
      // Same.
    }
  }

  /**
   * The one dispatch: gate, content, ANCHOR, backend. The anchor precedes the
   * command for the same reason as the sibling module's (a CI box with no
   * notification daemon must still yield the probe/e2e anchor), and it claims
   * nothing when there is no backend.
   */
  async function notifyForJob(snapshot: JobSnapshotLike): Promise<void> {
    if (!shouldNotifyForJob(snapshot)) return
    if (notifiedJobIds.has(snapshot.id)) return
    notifiedJobIds.add(snapshot.id)
    const backend = deps.backend
    if (backend === undefined) return
    const content = buildJobNotificationContent(snapshot, baseTitle)
    logSafely(formatBackgroundNotificationLine(snapshot.status, snapshot.label))
    await backend.notify(content.title, content.body)
  }

  return {
    hasPushSurface: () => hasPush,

    onJobDone: (snapshot, _owner) => {
      try {
        const job = toJobSnapshot(snapshot)
        if (job === undefined) return
        // `_owner` is intentionally unused: it is the settlement's exact Agent
        // (the `JobDoneListener` second argument), but every fact the
        // notification needs (id/kind/label/status/detail) is on the snapshot,
        // and retaining a live Agent in a closure would be exactly the
        // discipline-① mistake this port avoids.
        void notifyForJob(job).catch((err) => {
          reportFailure('notification dispatch failed', err)
        })
      } catch (err) {
        reportFailure('job-done observer failed', err)
      }
    },

    onSessionEvent: (_session, event) => {
      try {
        // The pull path is a FALLBACK: while the push subscription is live it
        // stands down so one settlement cannot produce two notifications.
        if (hasPush) return
        if (!isTurnEndEvent(event)) return
        // `_session` is unused by construction — see the header's PREREQUISITE
        // ANSWER: the `Session` object carries no agent reference, which is why
        // this path can only call `list()` without a caller.
        const list = deps.jobs?.list
        if (typeof list !== 'function') return
        // No caller: see the header's PREREQUISITE ANSWER — an unowned-jobs-only
        // view is the best this vantage has.
        const snapshots = list.call(deps.jobs)
        if (!Array.isArray(snapshots)) return
        for (const raw of snapshots) {
          const job = toJobSnapshot(raw)
          if (job === undefined) continue
          void notifyForJob(job).catch((err) => {
            reportFailure('notification dispatch failed', err)
          })
        }
      } catch (err) {
        reportFailure('session event observer failed', err)
      }
    },
  }
}

/** Reads `ctx.get('jobs')` defensively (absent service ⇒ pull path with nothing). */
export function readJobsService(ctx: { get?(name: string): unknown }): JobsSurface | undefined {
  if (typeof ctx.get !== 'function') return undefined
  const jobs = ctx.get('jobs')
  return isObject(jobs) ? (jobs as JobsSurface) : undefined
}

// --- The registrar -----------------------------------------------------------

/**
 * Registers the observers:
 *   1. the manifest's declared primary event (`session/event`) — ALWAYS, through
 *      `ctx.on`, so the row's primary surface is genuinely observed and the boot
 *      marker's `registered on session/event` line is true (index.ts discipline
 *      ④ + the probe's source-derived expectation);
 *   2. `ctx.jobs.onJobDone` — the PUSH surface, when the service exposes it. The
 *      subscription's disposer is returned, and the loop registers it with
 *      `ctx.effect` so fiber stop/update unsubscribes (index.ts discipline ①).
 *
 * A subscription that throws is a loud-but-non-fatal log line, never a
 * registration failure: the probe fails a boot on `[omo-hooks] hook .* FAILED`,
 * and a background-notification service hiccup must not fail the whole plugin's
 * mount.
 */
export const registerBackgroundNotification: HookRegistrar = (
  ctx: HooksRegistrationContext,
  entry: HookManifestEntry,
) => {
  const jobs = readJobsService(ctx)
  const listener = createBackgroundNotificationListener({
    backend: createPlatformNotifierBackend({
      runtimePlatform: process.platform,
      run: runCommandViaExecFile,
    }),
    jobs,
    log: (line) => console.log(line),
    logFailure: (line) => console.warn(line),
  })
  ctx.on(entry.event, (session, event) => listener.onSessionEvent(session, event))
  if (!listener.hasPushSurface() || jobs === undefined) return
  const onJobDone = jobs.onJobDone
  if (typeof onJobDone !== 'function') return
  try {
    const disposer = onJobDone.call(jobs, (snapshot, owner) => {
      listener.onJobDone(snapshot, owner)
    })
    return typeof disposer === 'function' ? (disposer as () => void) : undefined
  } catch (err) {
    try {
      console.warn(formatBackgroundNotificationFailureLine('jobs.onJobDone subscribe failed', err))
    } catch {
      // Nothing left to report with; the plugin still boots.
    }
    return
  }
}
