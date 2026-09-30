// P4-T8 — the stop-continuation guard (语义移植 of upstream's
// `hooks/stop-continuation-guard/`), as a **cordis SERVICE PROVIDER**.
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/hooks/stop-continuation-guard/hook.ts:1-121
//     createStopContinuationGuardHook — stoppedSessions Set + stop/isStopped/clear
//     + the session.deleted cleanup + the background cascade
//   packages/omo-opencode/src/hooks/stop-continuation-guard/index.ts:1-2 (re-export)
//   packages/omo-opencode/src/hooks/stop-continuation-guard/index.test.ts (12 its,
//     ported as unit-test seeds in tests/omo-commands/stop-continuation.test.ts —
//     that file also covers the omo-commands half of the pair and the cross-plugin
//     (R-5) cases, so the two halves' tests sit together instead of being split)
//   packages/omo-opencode/src/plugin/stop-continuation.ts:1-33 — the command-side
//     glue, i.e. WHO calls `stop`: guard.stop + todoContinuationEnforcer
//     .cancelAllCountdowns() + goal.clearGoal(sessionID) + clearBoulderState(dir)
//
// WHY A SERVICE AND NOT A MANIFEST ROW (T8's fork, decided here; the arbiter keeps
// the doc-side flip):
//   * A manifest row carries `event` + `mode` — "the ONE event this listener owns
//     and how it injects". This module injects nothing and owns no primary event:
//     its only listener is the `session/disposed` CLEANUP fallback, and its real
//     consumer is a command in ANOTHER plugin. A row would force a truthful-looking
//     `event` value that says something the module does not do.
//   * The roster's status vocabulary has no honest value available to me either:
//     'ported' requires the coverage-baseline row to read 已移植, and
//     `docs/plans/` is outside my scope (the flip is the arbiter's). A row left
//     'pending' beside landed code would make the roster lie in the other
//     direction, and it would also drag EXPECTED_HOOK_COUNT / the manifest tests /
//     the c13 file-set census — files I am not allowed to touch — for no gate value.
//   * The coverage baseline already anticipates this outcome: phase4-commands.md
//     §1.2 H-34 reads "**manifest 条目 fork 见 T8**（若不适格为条目则文件放
//     `src/hooks/` 之外、本行不进 c14 解析面）". So this file lives at
//     `src/services/` — outside `src/hooks/`, which is exactly what c13's
//     bidirectional file-set check scans (`verify-concerto-static.mjs` c13 reads
//     HOOKS_DIR = src/hooks) — and the H-34 row keeps its 待移植 wording until
//     the arbiter flips it.
//
// 语义移植 — ported one-for-one, and the differences are each registered below:
//   ① `stoppedSessions` Set: **ported verbatim** (same add/has/delete vocabulary).
//   ② `stop` / `isStopped` / `clear`: **same names and signatures** as upstream's
//      `StopContinuationGuard` interface, so both consumers (the omo-commands
//      writer, the omo-hooks reader) speak upstream's vocabulary.
//   ③ the continuation MARKER (`setContinuationMarkerSource(directory, …,
//      "stopped")` / `"idle"`): **NOT ported** — upstream writes a marker file under
//      its own run-continuation state directory. This repo has no such directory or
//      reader (omo-hooks listeners are in-process only; nothing in this workspace
//      reads that marker), so writing one would create an unread artifact. The
//      in-memory Set IS the state.
//   ④ the background cascade: upstream `getAllDescendantTasks(sessionID)` + filter
//      `running | pending` + `cancelTask(id, {abortSession: status === 'running',
//      skipNotification: true})` + `allSettled` + a counts log. DSH: the jobs
//      service owns descendants natively, and
//      `kill(id, caller?, reason?)` is SYNCHRONOUS, returning
//      `'requested' | 'already-finished'` (dsh-jobs/lib/types/index.d.ts:84-90).
//      Three consequences:
//        - **the caller MUST be passed, and this is load-bearing, not politeness**
//          (P4-T8 双评审 MAJOR-1): `list(caller)` FILTERS
//          `job.owner === undefined || job.owner.id === caller?.id`
//          (dsh-jobs-local/lib/index.js:178-180), so calling it with no caller
//          returns **unowned jobs only** — and every real producer sets an owner
//          (dsh-tool-bash/lib/index.js:416-417 passes `owner: exec.agent`,
//          dsh-tool-subagent/lib/index.js:540-541 passes `owner: parent`). A
//          caller-less cascade would therefore cancel nothing at all on a real
//          machine while reporting zero counts. `kill` is fenced by the same id
//          (`assertAccess`, dsh-jobs-local/lib/index.js:313-315) and THROWS for an
//          owned job without a matching caller, so the two calls must agree.
//        - **the session filter is ours, not the service's**: `list(caller)`
//          deliberately also returns UNOWNED jobs ("caller-owned and unowned jobs
//          in registration order", index.d.ts:58-63), and an unowned job has no
//          session ancestry at all (`snapshot.ownerSession` is absent for unowned
//          jobs — dsh-jobs-local:317-319, types.d.ts:98-102). Upstream's
//          `getAllDescendantTasks(sessionID)` is a per-session set, so the port
//          keeps that scope: only snapshots whose `ownerSession === sessionId`
//          are cancelled. Killing a job nobody owns, from a session-scoped stop,
//          would be a scope escape.
//        - **no promise / no allSettled**: the DSH call returns a verdict, so the
//          counts are computed from verdicts, not from settled promises;
//        - **`running | stopping`, not `running | pending`**: DSH's JobStatus
//          vocabulary is `'running' | 'stopping' | 'completed' | 'killed' |
//          'failed'` (dsh-jobs/lib/types/types.d.ts:14) — there is NO 'pending', and
//          'stopping' is DSH's second live state (cancellation already requested,
//          producer winding down). Killing a stopping job is harmless
//          ('already-finished'), so the filter covers exactly "not finished".
//        - upstream's `abortSession` distinction has no DSH counterpart: `kill` is
//          one request regardless of how far along the job is.
//   ⑤ `chat.message` no-op: **kept, and it is load-bearing.** Upstream deliberately
//      stopped clearing on a user message (a regression made the command
//      ineffective). DSH has no equivalent hook on this path at all, so the
//      non-clearing property is structural here — and the unit suite pins it by
//      calling `isStopped` after anything the caller does.
//   ⑥ `session.deleted` → **DSH `session/disposed`**, the same mapping
//      directory-readme-injector.ts:236 already uses. Its payload is the Session,
//      whose `id: SessionId` (dsh-session/lib/types/types.d.ts:65) is the same
//      identity `invocation.agent.id` yields on the command side.
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see ../index.ts).

/**
 * The cordis service name both sides resolve through `ctx.get` / `ctx.provide`.
 * Reported in the P4-T8 report as required; `omoStopContinuation` follows this
 * workspace's other provider names' shape (`omo-hooks` / `omo-agents` prefixes) so
 * a `dsh` user reading a composed config can attribute it.
 */
export const STOP_CONTINUATION_SERVICE = 'omoStopContinuation'

/** Stable log prefix, so a boot log line is greppable by id, not by prose. */
export const STOP_CONTINUATION_GUARD_ID = 'stop-continuation-guard'

/** The service surface — upstream's `StopContinuationGuard`, same three verbs. */
export interface StopContinuationGuard {
  /** Mark the session stopped (and cascade-kill its live jobs). */
  stop(sessionId: string): StopContinuationOutcome
  /** Whether `stop()` has been called for this session without a later `clear()`. */
  isStopped(sessionId: string): boolean
  /** Reset the session to "not stopped" — the explicit re-enable path. */
  clear(sessionId: string): void
}

/** What one `stop()` actually did — the fact the command reports to the user. */
export interface StopContinuationOutcome {
  readonly sessionId: string
  /** Live jobs whose cancellation this call requested (`kill` → 'requested'). */
  readonly cancelledJobIds: readonly string[]
  /** Jobs `kill` reported as already finished (nothing was cancelled). */
  readonly alreadyFinishedJobIds: readonly string[]
  /** False when no jobs service was mounted: nothing was cancelled, loudly. */
  readonly jobsServicePresent: boolean
}

/**
 * The caller identity handed to the jobs service. Structural, and only `{ id }`:
 * the access check compares `job.owner.id !== caller?.id`
 * (dsh-jobs-local/lib/index.js:313-315) and nothing else in `list` / `kill` reads
 * the caller. Native callers pass a real `Agent` (`ctx.jobs.list(exec.agent)`,
 * dsh-tool-jobs/lib/index.js:151,299); this port has the session id, not the agent
 * object, so it declares the smallest shape the service actually consults.
 */
export interface StopContinuationCallerLike {
  readonly id: string
}

/**
 * The narrow `ctx.jobs` face this module needs (dsh-jobs/lib/types/index.d.ts:63,90)
 * — `list(caller)` and `kill(id, caller, reason?)`. Declared structurally: this
 * workspace has no dsh dependency (P4-2), and a wider declaration would be a promise
 * nothing checks. Both caller parameters are REQUIRED here on purpose: omitting the
 * caller is not a "wider" call, it is a different and nearly useless one (see §④).
 */
export interface StopContinuationJobsLike {
  list(caller: StopContinuationCallerLike): readonly StopContinuationJobSnapshotLike[]
  kill(id: string, caller: StopContinuationCallerLike, reason?: string): string
}

/**
 * The two snapshot fields this module reads. `ownerSession` is the fence that keeps
 * the cascade per-session — absent for unowned jobs (dsh-jobs-local/lib/index.js:317-319).
 */
export interface StopContinuationJobSnapshotLike {
  readonly id: string
  readonly status: string
  readonly ownerSession?: string
}

/** The live-job statuses this port cancels — DSH's `running | stopping`. */
export const CANCELLABLE_JOB_STATUSES: readonly string[] = ['running', 'stopping']

/**
 * 清理事件名：上游 `session.deleted` 的 DSH 映射（directory-readme-injector.ts:236
 * 已用同一映射），payload 是 `Session`，其 `id` 就是会话身份。
 */
export const STOP_CONTINUATION_GUARD_DISPOSED_EVENT = 'session/disposed'

/** The reason string forwarded to `kill` (upstream's `reason` field, same wording). */
export const STOP_CANCELLATION_REASON = 'Continuation stopped via /stop-continuation'

/**
 * Injection seams. `readJobs` is a LAZY accessor, never a cached service handle:
 * the provider runs inside `apply()`, and a jobs service that appears later (or in a
 * profile that never mounts one) must be visible to the first `/stop-continuation`
 * rather than to a handle frozen at boot. This is the H-11 precedent.
 */
export interface StopContinuationGuardDeps {
  /** Lazily read the jobs service; `undefined` means "not mounted" (degraded). */
  readonly readJobs: () => StopContinuationJobsLike | undefined
  /** Diagnostic sink. Never throws out of the guard. */
  readonly log: (line: string) => void
}

/**
 * 建一个 guard。`stoppedSessions` 在闭包里，与上游同形：一个进程一个集合。
 *
 * 每次 `stop()` 返回本次真实做了什么（out-of-band 的结果，不靠日志反推），因为
 * 命令结果那句话是给人看的 —— 上游那条只在日志里，DSH 侧把同一事实搬到了返回值。
 */
export function createStopContinuationGuard(
  deps: StopContinuationGuardDeps,
): StopContinuationGuard {
  const stoppedSessions = new Set<string>()

  const stop = (sessionId: string): StopContinuationOutcome => {
    stoppedSessions.add(sessionId)
    const cascade = cascadeCancelJobs(deps, sessionId)
    deps.log(
      `[omo-hooks] ${STOP_CONTINUATION_GUARD_ID}: continuation stopped for session ${sessionId}`
      + ` (cancelled ${cascade.cancelledJobIds.length}, already finished ${cascade.alreadyFinishedJobIds.length}`
      + `, jobs service ${cascade.jobsServicePresent ? 'present' : 'absent — nothing cancelled'})`,
    )
    return { sessionId, ...cascade }
  }

  const isStopped = (sessionId: string): boolean => stoppedSessions.has(sessionId)

  const clear = (sessionId: string): void => {
    stoppedSessions.delete(sessionId)
    deps.log(`[omo-hooks] ${STOP_CONTINUATION_GUARD_ID}: guard cleared for session ${sessionId}`)
  }

  return { stop, isStopped, clear }
}

/**
 * 级联取消：DSH 侧 = `ctx.jobs.list(caller)` → 过滤**本会话**（`ownerSession ===
 * sessionId`）且 `running | stopping` → 逐个 `kill(id, caller, reason)`。
 *
 * caller 必须传（模块头 §④ 有实测依据）：不传 caller 的 `list` 只回无主 job，而真实
 * 生产者一律带 owner，于是真机上这一层会静默返回空集。
 *
 * 全程不抛：命令结果已经 settle 了，一个挂掉的 jobs 服务不该把它变成失败 ——
 * 记录（cancelled/already-finished 的真实数字）比抛错更有用。
 */
function cascadeCancelJobs(
  deps: StopContinuationGuardDeps,
  sessionId: string,
): Pick<StopContinuationOutcome, 'cancelledJobIds' | 'alreadyFinishedJobIds' | 'jobsServicePresent'> {
  let jobs: StopContinuationJobsLike | undefined
  try {
    jobs = deps.readJobs()
  } catch (error) {
    deps.log(`[omo-hooks] ${STOP_CONTINUATION_GUARD_ID}: jobs lookup failed: ${describeError(error)}`)
    return { cancelledJobIds: [], alreadyFinishedJobIds: [], jobsServicePresent: false }
  }
  if (jobs === undefined) {
    return { cancelledJobIds: [], alreadyFinishedJobIds: [], jobsServicePresent: false }
  }

  const cancelledJobIds: string[] = []
  const alreadyFinishedJobIds: string[] = []
  const caller: StopContinuationCallerLike = { id: sessionId }
  let snapshots: readonly StopContinuationJobSnapshotLike[]
  try {
    snapshots = jobs.list(caller)
  } catch (error) {
    // 对**外来或无** caller，`list` 是过滤而不是抛（dsh-jobs-local:178-180）；抛只
    // 会来自服务本身坏了。注意不传 caller 看到的是**更少**的 job（只有无主的），不是
    // "更多"——这正是 ④ 要传 caller 的原因。
    deps.log(`[omo-hooks] ${STOP_CONTINUATION_GUARD_ID}: jobs list failed: ${describeError(error)}`)
    return { cancelledJobIds: [], alreadyFinishedJobIds: [], jobsServicePresent: true }
  }
  for (const snapshot of snapshots) {
    // 会话围栏：`list(caller)` 也会回无主 job（无会话血缘，`ownerSession` 缺席），
    // 而上游 `getAllDescendantTasks(sessionID)` 是按会话语义的，所以只动本会话的。
    if (snapshot.ownerSession !== sessionId) continue
    if (!CANCELLABLE_JOB_STATUSES.includes(snapshot.status)) continue
    try {
      const verdict = jobs.kill(snapshot.id, caller, STOP_CANCELLATION_REASON)
      if (verdict === 'already-finished') alreadyFinishedJobIds.push(snapshot.id)
      else cancelledJobIds.push(snapshot.id)
    } catch (error) {
      // One job's kill failing must not abandon the rest of the cascade — upstream
      // `allSettled` has exactly this property, and this is its synchronous
      // equivalent: count the failure and keep going.
      alreadyFinishedJobIds.push(snapshot.id)
      deps.log(`[omo-hooks] ${STOP_CONTINUATION_GUARD_ID}: kill ${snapshot.id} failed: ${describeError(error)}`)
    }
  }
  return { cancelledJobIds, alreadyFinishedJobIds, jobsServicePresent: true }
}

/**
 * 会话被销毁时的清理（上游 `session.deleted` → DSH `session/disposed`）。
 *
 * 只删标记、不级联取消：会话已经没了，它的后台任务已经随会话结束，再去 kill 只是
 * 对着已终止的东西发请求。上游的 `session.deleted` 分支同样只 `clear`。
 */
export function handleSessionDisposed(
  guard: StopContinuationGuard,
  session: unknown,
  log: (line: string) => void,
): void {
  const sessionId = readSessionId(session)
  if (sessionId === undefined) return
  guard.clear(sessionId)
  log(`[omo-hooks] ${STOP_CONTINUATION_GUARD_ID}: session disposed: stop state cleared`)
}

/** 从 `session/disposed` 的 payload 里取 `id`（Session.id: SessionId，dsh-session types.d.ts:65）。 */
function readSessionId(session: unknown): string | undefined {
  if (typeof session !== 'object' || session === null) return undefined
  const id = (session as { readonly id?: unknown }).id
  return typeof id === 'string' ? id : undefined
}

/** 与本仓其它 listener 相同的取值方式：Error 取 message，其余 String()，不序列化整个 error。 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}