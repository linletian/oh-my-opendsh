// P4-T8 — the stop-continuation guard (语义移植 of upstream's
// `hooks/stop-continuation-guard/`), as a **cordis SERVICE PROVIDER**.
//
// DUAL-MODE since P4.5-T3 (plan §4.2; the fork signal is the SHARED runtime-
// identity marker `dshRuntimeShape(jobs)` at ../dsh-runtime-shape.ts — identity,
// not a capability probe, and never a version string): the jobs surface this
// cascade drives was WHOLE-PACKAGE-rewritten between the two generations, so
// this module forks on exactly two things and nothing else —
//   * the CALLER of `list`/`kill`: **[0.1.5]** an `Agent`-like object, ported as
//     `{ id: sessionId }` (behaviour unchanged since P4-T8), **[0.2.x]** the
//     `SessionId` STRING itself (`packages/jobs/jobs/src/index.ts:117`/`:160`,
//     re-opened at the mirror during P4.5-T3);
//   * the session FENCE key on each snapshot/view: **[0.1.5]** `ownerSession`,
//     **[0.2.x]** `owner` (`packages/jobs/jobs/src/view.ts:76-77`) — read as the
//     single double-read `owner ?? ownerSession` so ONE fence covers BOTH
//     generations and `owner` wins where both keys are present.
// Every section below marked **[0.1.5]** / **[0.2.x]** / **[BOTH]** says which
// generation it describes; an unmarked section describes both. PIN STATUS
// (corrected by P4.5-T13 under ruling D17, commit 2323658): CI is pinned to
// 0.2.0-rc.2 — the earlier sentence claiming 0.1.5-rc.1 was the CI pin is
// FALSE since the T12b cutover. The **[0.1.5]** text stays as the shape-fork
// documentation `dshRuntimeShape` still answers; the v1 caller/fence branch is
// kept as the defensive shape fork and its tests protect the FORK, not a
// supported runtime — 0.1.x support is dropped. The fence SEMANTICS are identical on
// both branches (only this session's jobs are touched; unowned jobs are skipped;
// the verdict/counting/reason/try-per-job discipline is shared) — the fork is
// the caller shape and the owner key name, nothing else.
//
// H2 CITATION STATUS (P4.5-T3): every `dsh-jobs*/lib/*.js` / `types.d.ts` line
// number below is a **P3-T8/T14-era reading on this repo's pinned 0.1.5
// install**, kept **verbatim and NOT re-verified this round** — this machine has
// no 0.1.5 binary (`.omo/evidence/p45t1/Q5-jobs-subscribe.md` §4.2-1), and a
// number nobody can check is safer kept than "fixed". Every **[0.2.x]** number
// was re-opened at the upstream mirror `~/GithubRepo/deepseek-harness` @
// `639ed01539` (= `dsh-v0.2.0-rc.2`) during P4.5-T3; see the P2 record in
// `.omo/evidence/p45t3/T3-stop-continuation-guard.md`.
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/hooks/stop-continuation-guard/hook.ts:1-123
//     (P4.5-T3 复核修正：原引 :1-121；`git show <tag>:…/hook.ts | wc -l` = 123)
//     createStopContinuationGuardHook — stoppedSessions Set + stop/isStopped/clear
//     + the session.deleted cleanup + the background cascade
//   packages/omo-opencode/src/hooks/stop-continuation-guard/index.ts:1-2 (re-export)
//   packages/omo-opencode/src/hooks/stop-continuation-guard/index.test.ts (12 `test(` cases,
//     ported as unit-test seeds in tests/omo-commands/stop-continuation.test.ts —
//     that file also covers the omo-commands half of the pair and the cross-plugin
//     (R-5) cases, so the two halves' tests sit together instead of being split)
//   packages/omo-opencode/src/plugin/stop-continuation.ts:1-27 — the command-side
//     glue, i.e. WHO calls `stop`: guard.stop + todoContinuationEnforcer
//     .cancelAllCountdowns() + goal.clearGoal(sessionID) + clearBoulderState(dir)
//     (P4.5-T3 复核修正：原引 :1-33；同一 tag 下 `wc -l` = 27)
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
//      `'requested' | 'already-finished'` — **[0.1.5]** dsh-jobs/lib/types/index.d.ts:84-90
//      (P3-T8-era reading, H2 unre-verified); **[0.2.x]** the SAME synchronous
//      verdict survives the rewrite verbatim,
//      `packages/jobs/jobs/src/index.ts:160` `abstract kill(id: JobId,
//      caller?: SessionId, reason?: string): 'requested' | 'already-finished'`
//      (re-opened at the mirror; its doc block :150-159 says `@param caller -
//      killing session checked against the owner.` :156 and `@returns \`requested\`
//      for live work, otherwise \`already-finished\`.` :158).
//      Three consequences, **[BOTH]** unless marked:
//        - **the caller MUST be passed, and this is load-bearing, not politeness**
//          (P4-T8 双评审 MAJOR-1): `list(caller)` FILTERS
//          **[0.1.5]** `job.owner === undefined || job.owner.id === caller?.id`
//          (dsh-jobs-local/lib/index.js:178-180), so calling it with no caller
//          returns **unowned jobs only** — and every real producer sets an owner
//          (dsh-tool-bash/lib/index.js:416-417 passes `owner: exec.agent`,
//          dsh-tool-subagent/lib/index.js:540-541 passes `owner: parent`). A
//          caller-less cascade would therefore cancel nothing at all on a real
//          machine while reporting zero counts. `kill` is fenced by the same id
//          (**[0.1.5]** `assertAccess`, dsh-jobs-local/lib/index.js:313-315) and
//          THROWS for an owned job without a matching caller, so the two calls
//          must agree.
//          **[0.2.x]** the trap is the SAME rewrite-deep trap, restated in the
//          abstract registry's own words — `list`'s doc `:113-116` `@param caller -
//          reading session; omission sees only unowned jobs.` above
//          `abstract list(caller?: SessionId): JobView[]` `:117` — and `kill`
//          throws for a foreign job the same class of way: the implementation is
//          `kill(id, caller, reason) { return this.killJob(this.expect(id, caller),
//          reason) }` (packages/jobs/jobs-local/src/index.ts:328-330), where
//          `expect` `:394-399` looks the job up and calls `assertAccess`
//          `:406-411`, which throws `job ${id} belongs to another session` when
//          `job.owner !== undefined && job.owner.id !== caller` — `caller` there
//          being the **SessionId string**, which is exactly why the v2 branch
//          hands the bare `sessionId` and NOT `{ id: sessionId }` (an object
//          would fence every owned job into a throw, i.e. silent zero-cancel
//          cascade reported as all-finished).
//        - **the session filter is ours, not the service's**: `list(caller)`
//          deliberately also returns UNOWNED jobs ("caller-owned and unowned jobs
//          in registration order", **[0.1.5]** index.d.ts:58-63), and an unowned
//          job has no session ancestry at all (**[0.1.5]** `snapshot.ownerSession`
//          is absent for unowned jobs — dsh-jobs-local:317-319, types.d.ts:98-102;
//          **[0.2.x]** the same absence on the new key — `JobView.owner` is
//          declared `/** Owning session; absent for an unowned job, which every
//          caller can see. */ readonly owner?: SessionId` at
//          packages/jobs/jobs/src/view.ts:76-77). Upstream's
//          `getAllDescendantTasks(sessionID)` is a per-session set, so the port
//          keeps that scope on BOTH generations: only rows whose
//          `owner ?? ownerSession === sessionId` are cancelled (the double-read IS
//          the fork on the key name; `owner` wins if both keys are present, and
//          an unowned row — neither key — is skipped). Killing a job nobody owns,
//          from a session-scoped stop, would be a scope escape.
//        - **no promise / no allSettled**: the DSH call returns a verdict on BOTH
//          generations, so the counts are computed from verdicts, not from settled
//          promises;
//        - **`running | stopping`, not `running | pending`**: DSH's JobStatus
//          vocabulary is `'running' | 'stopping' | 'completed' | 'killed' |
//          'failed'` (**[0.1.5]** dsh-jobs/lib/types/types.d.ts:14) — there is NO
//          'pending', and 'stopping' is DSH's second live state (cancellation
//          already requested, producer winding down). So the filter covers exactly
//          "not finished": `isTerminal` is `completed|killed|failed`
//          (**[0.1.5]** dsh-jobs-local:79-81) and `stopping` is **not** in it.
//          **[0.2.x]** the vocabulary survived the rewrite unchanged —
//          `export type JobStatus = 'running' | 'stopping' | 'completed' |
//          'killed' | 'failed'` (packages/jobs/jobs/src/view.ts:19) — and so did
//          the non-terminality of `stopping`: `killJob` returns `'already-finished'`
//          only when `isTerminal(job.status)` and otherwise cancels and returns
//          `'requested'` (packages/jobs/jobs-local/src/index.ts:458-468).
//        - ⚠️ **重复 stop 对仍在 `stopping` 的 job 不是 no-op**：本注释先前写的是
//          "Killing a stopping job is harmless ('already-finished')" —— 与实测相反。
//          `kill` 只在 `isTerminal` 时返回 `'already-finished'`；`stopping` 不满足，
//          于是走 `job.cancel(reason)` 并**再次**返回 `'requested'`
//          （dsh-jobs-local:197-208）。级联侧按 verdict 计数（下方 :429-430），所以
//          这些 job 会被**计入 `cancelledJobIds`**，而不是 `alreadyFinishedJobIds`。
//          **[0.2.x]** 同一语义在 `killJob`（jobs-local/src/index.ts:458-468）里
//          原样存活，本任务不改这条判定。
//        - ⚠️ **`stop()` 本身不短路，`cancelledJobIds` 也随之重复增长**
//          （`stop` 无条件调用 `cascadeCancelJobs`，见 :341-350 —— 它只有
//          `stoppedSessions.add`，没有 `has` 早退）。所以同会话连按两次
//          `/stop-continuation`，同一批 winding-down job 会被**再请求一次取消**、
//          **再计一次 cancelled**。真正的幂等载体是**下游的会话级 stop 行**：
//          `stoppedSessions` 一旦有该会话，`isStopped(sessionId)` 恒真，
//          todo-continuation 等消费者因此不再续行。读日志时请注意 —— 那行里的
//          `cancelled N` 是**本次调用的请求数**，不是累计去重后的 job 数，不能
//          拿它当幂等证据。
//        - upstream's `abortSession` distinction has no DSH counterpart: `kill` is
//          one request regardless of how far along the job is, on BOTH generations.
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
import { dshRuntimeShape } from '../dsh-runtime-shape.ts'

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
 * The **[0.1.5]** caller identity handed to the jobs service. Structural, and only
 * `{ id }`: the access check compares `job.owner.id !== caller?.id`
 * (dsh-jobs-local/lib/index.js:313-315) and nothing else in `list` / `kill` reads
 * the caller. Native callers pass a real `Agent` (`ctx.jobs.list(exec.agent)`,
 * dsh-tool-jobs/lib/index.js:151,299); this port has the session id, not the agent
 * object, so it declares the smallest shape the service actually consults.
 * **Zero behaviour change since P4-T8** — P4.5-T3 keeps this branch verbatim and
 * adds the 0.2.x caller beside it as a union member, not a replacement.
 */
export interface StopContinuationCallerLike {
  readonly id: string
}

/**
 * The caller of `list`/`kill` on BOTH generations, as a UNION of the two real
 * shapes — not a wider "accept anything" signature (P4.5-T3 B2):
 *   * **[0.1.5]** `StopContinuationCallerLike` — the `Agent`-like `{ id }` above.
 *   * **[0.2.x]** the `SessionId` STRING itself: `list(caller?: SessionId)` /
 *     `kill(id, caller?: SessionId, reason?)` (packages/jobs/jobs/src/index.ts:117
 *     / :160, re-opened at the mirror). `SessionId` is a branded string upstream;
 *     this workspace has no dsh dependency to name the brand with, so the
 *     structural equivalent is `string`.
 * The RUNTIME picks exactly one shape per call at {@link cascadeCancelJobs} via
 * the shared identity marker `dshRuntimeShape` (../dsh-runtime-shape.ts) — the
 * union is the type-level statement of the fork, and getting it wrong (passing
 * `{ id }` on v2) fences every owned job into a `kill` throw, i.e. a cascade
 * that silently cancels nothing. That is why the caller shape is pinned verbatim
 * per generation by tests, not just "some caller was passed".
 */
export type StopContinuationCaller = StopContinuationCallerLike | string

/**
 * The narrow `ctx.jobs` face this module needs — `list(caller)` and
 * `kill(id, caller, reason?)`, **[BOTH]** generations with the caller parameter
 * typed as the {@link StopContinuationCaller} union above (**[0.1.5]**
 * dsh-jobs/lib/types/index.d.ts:63,90 — P3-T8-era reading, H2 unre-verified;
 * **[0.2.x]** packages/jobs/jobs/src/index.ts:117 / :160 — re-opened at the
 * mirror). Declared structurally: this workspace has no dsh dependency (P4-2),
 * and a wider declaration would be a promise nothing checks. Both caller
 * parameters are REQUIRED here on purpose: omitting the caller is not a "wider"
 * call, it is a different and nearly useless one (see §④ — on BOTH generations
 * a caller-less `list` sees unowned jobs only).
 */
export interface StopContinuationJobsLike {
  list(caller: StopContinuationCaller): readonly StopContinuationJobSnapshotLike[]
  kill(id: string, caller: StopContinuationCaller, reason?: string): string
  /**
   * **[0.2.x]** the `JobEvents` stream (`packages/jobs/jobs/src/index.ts:100`
   * `abstract readonly events: JobEvents`) — declared OPTIONAL here as the
   * RUNTIME-IDENTITY SIGNAL only: this module reads its presence/absence through
   * `dshRuntimeShape` and NEVER calls it (the capability lives in
   * ../dsh-runtime-shape.ts; widening this face past `unknown` would promise a
   * member nothing in this file consumes). Absent on **[0.1.5]**, where the
   * identity signal is simply "no `events` key".
   */
  readonly events?: unknown
}

/**
 * The snapshot fields this module reads, BOTH generations' owner keys declared
 * OPTIONAL and coexisting (P4.5-T3 B3) — the type-level statement of the fence
 * double-read:
 *   * `ownerSession` — **[0.1.5]** `JobSnapshot.ownerSession`; absent for
 *     unowned jobs (dsh-jobs-local/lib/index.js:317-319 — P3-T8-era reading,
 *     H2 unre-verified).
 *   * `owner` — **[0.2.x]** `JobView.owner`, whose upstream doc reads verbatim
 *     "Owning session; absent for an unowned job, which every caller can see."
 *     above `readonly owner?: SessionId` (packages/jobs/jobs/src/view.ts:76-77,
 *     re-opened at the mirror; `SessionId` is a branded string, structural
 *     equivalent `string` here).
 * The fence reads `owner ?? ownerSession` — `owner` wins where both keys are
 * present — and a row with NEITHER key is unowned and skipped (fence semantics
 * unchanged since P4-T8: only this session's jobs are touched).
 */
export interface StopContinuationJobSnapshotLike {
  readonly id: string
  readonly status: string
  /** **[0.1.5]** the session fence key of `JobSnapshot`. */
  readonly ownerSession?: string
  /** **[0.2.x]** the session fence key of `JobView` (view.ts:76-77). */
  readonly owner?: string
}

/**
 * The live-job statuses this port cancels — DSH's `running | stopping`, the
 * SAME vocabulary on both generations (**[0.1.5]** dsh-jobs/lib/types/types.d.ts:14
 * — P3-T8-era reading, H2 unre-verified; **[0.2.x]** `JobStatus` at
 * packages/jobs/jobs/src/view.ts:19, re-opened at the mirror).
 */
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
 * 级联取消：DSH 侧 = `ctx.jobs.list(caller)` → 过滤**本会话**（围栏键
 * `owner ?? ownerSession === sessionId`，**[0.1.5]** `ownerSession` / **[0.2.x]**
 * `owner`，view.ts:76-77）且 `running | stopping` → 逐个 `kill(id, caller, reason)`。
 *
 * caller 必须传（模块头 §④ 有实测依据）：不传 caller 的 `list` 只回无主 job，而真实
 * 生产者一律带 owner，于是真机上这一层会静默返回空集——**两代都是这个坑**
 * （**[0.2.x]** 抽象面的文档逐字承认：index.ts:114 `omission sees only unowned
 * jobs.`）。caller 的**形状**按 `dshRuntimeShape(jobs)` 分叉（共享身份标记，
 * ../dsh-runtime-shape.ts，不是能力探针、不是版本号）：**[0.1.5]** 传
 * `{ id: sessionId }`（P4-T8 原样，零变化）；**[0.2.x]** 传 `sessionId` 字符串
 * （`SessionId` 上游是品牌 string，本仓无 dsh 依赖 ⇒ 结构等价 `string`）。
 * 形状传错不会崩——会被 fence 成静默空转，所以 caller 形状由测试逐字钉死。
 *
 * 全程不抛：命令结果已经 settle 了，一个挂掉的 jobs 服务不该把它变成失败 ——
 * 记录（cancelled/already-finished 的真实数字）比抛错更有用。两分支下围栏语义、
 * verdict 计数、reason 逐字、单 job 失败不放弃其余**完全一致**（P4.5-T3 B4）；
 * 分叉只有 caller 形状与围栏键名两处。
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
  // THE FORK (P4.5-T3 B1/B2): the shared identity marker decides the caller
  // generation — 'v1' (no `events` key, 0.1.5) keeps the `{ id }` Agent-like
  // caller verbatim; 'v2' (0.2.x) hands the bare SessionId STRING, because the
  // 0.2.x fence compares the caller against the id as a string
  // (`job.owner.id !== caller`, jobs-local/src/index.ts:407, re-opened at the
  // mirror). One marker, one fork point, no second predicate (B5).
  const shape = dshRuntimeShape(jobs)
  const caller: StopContinuationCaller = shape === 'v2' ? sessionId : { id: sessionId }
  let snapshots: readonly StopContinuationJobSnapshotLike[]
  try {
    snapshots = jobs.list(caller)
  } catch (error) {
    // 对**外来或无** caller，`list` 是过滤而不是抛（**[0.1.5]** dsh-jobs-local:178-180；
    // **[0.2.x]** 抽象文档 index.ts:113-116 同义）；抛只会来自服务本身坏了。注意不传
    // caller 看到的是**更少**的 job（只有无主的），不是"更多"——这正是 ④ 要传 caller
    // 的原因，两代同理。
    deps.log(`[omo-hooks] ${STOP_CONTINUATION_GUARD_ID}: jobs list failed: ${describeError(error)}`)
    return { cancelledJobIds: [], alreadyFinishedJobIds: [], jobsServicePresent: true }
  }
  for (const snapshot of snapshots) {
    // 会话围栏（键名双读，P4.5-T3 B3）：`list(caller)` 也会回无主 job（无会话血缘，
    // **[0.1.5]** `ownerSession` 缺席 / **[0.2.x]** `owner` 缺席，view.ts:76-77），
    // 而上游 `getAllDescendantTasks(sessionID)` 是按会话语义的，所以只动本会话的；
    // 两个键都不在 = 无主 = 跳过。`owner` 在两键都在时优先——它是 0.2.x 的权威键，
    // 0.1.5 的真实快照根本没有这个键，优先级因此只影响畸形/装饰 face，不影响两代
    // 任一真实形状。
    const ownerSessionId = snapshot.owner ?? snapshot.ownerSession
    if (ownerSessionId !== sessionId) continue
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