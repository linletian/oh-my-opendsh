// background-notification.ts — P3-T12 listener (task book WP-5; plan §4.2
// pattern F): OMO's background-task completion notification, reborn as a DSH
// observer of the native background-job surface.
//
// DUAL-MODE since P4.5-T2 (plan §4.2; review §3.2-1): the observation channel
// is chosen by `dshRuntimeShape(jobs)` — `events.subscribe` on the 0.2.x jobs
// package, `onJobDone` on the 0.1.5 one, and the turn/end pull over `list()`
// when neither push face exists. Every section below marked **[0.1.5]** /
// **[0.2.x]** / **[BOTH]** says which generation it describes; an unmarked
// section describes both. The 0.1.5 text is NOT rewritten away — it is the
// path CI is pinned to (0.1.5-rc.1) and the behaviour its tests protect.
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
// ANSWER: **YES — a native event surface exists on BOTH supported generations,
// and they are different members of it.** Neither is a `session/event` member
// and neither is a cordis event: both are SERVICE SUBSCRIPTIONS on `ctx.jobs`,
// chosen by `dshRuntimeShape(jobs)` (see ../dsh-runtime-shape.ts).
//
// ── **[0.1.5]** `ctx.jobs.onJobDone(fn)` ──
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
// the path this port took as its sole push answer from P3-T12 until P4.5-T2
// (the task book's "有事件面 → F 模式 listener"), and the path it still takes on
// the CI-pinned 0.1.5-rc.1.
// The sibling `onJobsChanged(listener)` (`index.d.ts:134`) is the visible-set
// observer; it is NOT used here (it "carries no delivery meaning and marks
// nothing reported", which is the wrong shape for a one-shot notification).
//
// ── **[0.2.x]** `ctx.jobs.events.subscribe({ owners: 'all' }, fn)` ──
// `onJobDone` is GONE there: `grep -rn "onJobDone" --include=*.ts
// packages/*/*/src/` over the upstream mirror `~/GithubRepo/deepseek-harness` @
// `639ed01539` (= `dsh-v0.2.0-rc.2`) returns 0 hits, and the abstract registry
// exposes the stream instead — verbatim, `packages/jobs/jobs/src/index.ts:99-100`:
//
//     /** Lifecycle and output events, filtered per subscription. */
//     abstract readonly events: JobEvents
//
// with, verbatim, `packages/jobs/jobs/src/types.ts:243-253`:
//
//     export interface JobEvents {
//       /**
//        * Register an effect-scoped listener. Events are dispatched synchronously
//        * after the commit they announce; a job's first event is `registered`, and
//        * a `settled` event follows the release of every waiter. No listener runs
//        * after service disposal.
//        * @param filter - which owners' events to deliver.
//        * @param listener - receives each matching event.
//        * @returns disposer that unregisters the listener.
//        */
//       subscribe(filter: JobEventFilter, listener: JobEventListener): () => void
//     }
//
// and `types.ts:240` — `export type JobEventListener = (event: JobEvent) => void`,
// whose comment says "Event callback; contained by the registry, never awaited"
// (the same containment contract `onJobDone` gave this listener, so the
// discipline-② shape below carries over unchanged).
//
// The stream carries SIX event TYPES across THREE union members (`types.ts:200-226`):
// `registered | progress | stopping | removed` (a `job`), `settled` (a `job` +
// `cause` + `awaited`), and `output` (an `id` + `total`, NO `job` field). This
// port consumes `settled` ONLY and ignores the rest explicitly — see
// {@link createBackgroundNotificationListener.onJobEvent}.
//
// `events` is a GETTER that binds the context it is read ON (`jobs-local/src/
// index.ts:199-204`, verbatim):
//
//     get events(): JobEvents {
//       const registrar = this.ctx
//       return {
//         subscribe: (filter, listener) => this.hub.subscribe(registrar, filter, listener),
//       }
//     }
//
// ⇒ read it ONCE per discovered face and hold the local (`adoptJobs` below); do
// NOT cache it at module level (that would bind one boot's registrar into
// another's, and would violate discipline ⑤ besides).
//
// ── **[BOTH]** the three tiers, in order ──
//   1. v2 (`dshRuntimeShape(jobs) === 'v2'`) → `events.subscribe({owners:'all'})`
//   2. v1 → `onJobDone(fn)`
//   3. neither push face → the degraded turn/end pull over `list()` below, recorded
//      with its own NOTE line. A subscription that THROWS is tier 3 in behaviour but
//      it is recorded on a **FAILED** line (`fail(...)`, v2 `:1173` / v1 `:1191`),
//      NOT a NOTE — that prefix split is the whole distinction (:1050-1055).
// The fork is the identity marker, not a capability probe
// (../dsh-runtime-shape.ts header): capability absence is guarded at each call
// site, tier by tier, and each tier says out loud which one it took.
//
// ═══════════ WHY `ctx.get('jobs')` IS `undefined` AT apply() (P3-T13) ═══════
// The first revision of this registrar read the service ONCE, synchronously, at
// apply() time:
//
//     const jobs = readJobsService(ctx)          // ctx.get('jobs')
//     ...
//     if (!listener.hasPushSurface() || jobs === undefined) return
//
// Measured on a real boot (e2e bonus.observedDefect, 2026-09-20): that read
// returned `undefined`, so the push subscription was NEVER made and the
// degraded pull path had no `jobs` face either — H-11 produced zero runtime
// output. The cause is CORDIS'S STRICT SERVICE READ, not a wrong service name
// and not an isolation scope:
//
//   1. `ctx.get(name)` is `ReflectService#get(name, strict = true)`, whose
//      strict arm only returns an implementation whose PROVIDING FIBER IS
//      CURRENTLY ACTIVE — verbatim, `cordis/lib/index.js:754-771`:
//
//          /**
//          * Read a service from the store without the inject requirement.
//          *
//          * @param name — the service name.
//          * @param strict — when `true`, only return implementations whose providing
//          * fiber is currently active.
//          * @returns the service value, or `undefined` when not (yet) provided.
//          */
//          get(name, strict = true) {
//              return getTraceable(this.ctx, this._getImpl(name, strict)?.value);
//          }
//          _getImpl(name, strict = true) {
//              const key = this.ctx[symbols.isolate][name];
//              const impl = key && this.store[key];
//              if (!impl) return;
//              if (strict && impl.fiber.state !== 2) return;
//              return impl;
//          }
//
//      (`state === 2` is Fiber's ACTIVE state, `_getState()` at `:1287-1292`.)
//   2. The loader creates EVERY row of one compose step CONCURRENTLY, because
//      the profile's whole patch stack reaches ONE `root.update(data)` call and
//      an entry list is built with `Promise.allSettled` — verbatim,
//      `cordis-plugin-loader/lib/index.js:97`:
//
//          const outcomes = await Promise.allSettled(config.map((options) => this.create(options)));
//
//      fed by `dsh-app-boot/lib/index.js:144-145`:
//
//          const data = this.applyPatches(this.data, config.patches);
//          await this.root.update(data);
//
//      The `jobs` row (`@deepseek-ai/dsh-jobs-local`, dsh-base
//      cordis.patch.yml:81-82) and this plugin's overlay row are therefore
//      created in the SAME batch, and whichever import/constructor wins the
//      race decides whether the jobs provider fiber is already state 2 when
//      this apply() runs. Reproduced hermetically: two `ctx.plugin(...)` calls
//      issued back to back (the loader's own shape) make
//      `ctx.get('jobs') === undefined` inside the second apply, while a
//      sequential `await` order returns the service.
//   3. It is NOT the service name — `jobs` is the name every native consumer
//      uses (`dsh-tool-jobs/lib/index.js:200,206`, `dsh-tool-bash/lib/index.js:405`,
//      `dsh-api-session-controller/lib/index.js:1017`) — and NOT an isolation
//      scope: these rows carry no `isolate:` option (the loader's
//      `loader/patch-context` hook only re-points a name when the entry
//      declares one), and `ctx.get` resolves through the ROOT isolate map
//      (`ReflectService#ctx` is the root context) regardless of the caller.
//
// THE FIX IS THE DEFERRED FORM, not a hard dependency. `Context#inject(deps,
// cb)` — verbatim, `cordis/lib/index.js:1592-1605`:
//
//     /**
//     * Start a callback once the requested dependencies are available.
//     * ...
//     */
//     inject(inject, callback) {
//         return this.plugin({ inject, apply: callback, name: callback.name });
//     }
//
// starts an injected CHILD fiber that stays inactive until every named service
// is available, then runs the callback (immediately when the service is already
// present), and disposes that child with the registering fiber — the child's
// disposer is an effect of the parent (`this.dispose = parent.fiber.effect(...)`,
// `cordis/lib/index.js:1074-1075`), so the subscription is fiber-reversible.
// It is exactly the shape the shipped session controller already uses for this
// same service, verbatim `dsh-api-session-controller/lib/index.js:1017-1018`:
//
//     ctx.inject(["jobs"], (jobsCtx) => {
//         jobsCtx.jobs.onJobsChanged((owner) => {
//
// It is deliberately NOT `inject: ['jobs']` on the whole plugin: that would
// gate every hook in the roster behind one optional service and turn "jobs is
// late" into "the whole guardrail layer never mounts". The registrar therefore
// keeps registering its primary manifest event synchronously, arms the deferred
// child for the push surface, and — when the service never appears — logs one
// loud NOTE line and keeps the degraded pull path (see the LOG ANCHOR CONTRACT).
//
// A second, deliberately weaker surface also exists and becomes the DEGRADED
// path when the push subscription is unavailable: `list()`. **[0.1.5]** it is
// `list(caller?: Agent)` — verbatim, `dsh-jobs/lib/types/index.d.ts:57-63`:
//
//     /**
//      * List caller-owned and unowned jobs in registration order without exposing
//      * another session's labels.
//      * @param caller - reading agent; a non-agent caller sees only unowned jobs.
//      * @returns fresh snapshots.
//      */
//     abstract list(caller?: Agent): JobSnapshot[];
//
// **[0.2.x]** the SAME degradation survives the rewrite with a different key
// type — verbatim, `packages/jobs/jobs/src/index.ts:112-117`:
//
//     /**
//      * List caller-owned and unowned jobs in registration order.
//      * @param caller - reading session; omission sees only unowned jobs.
//      * @returns fresh projections.
//      */
//     abstract list(caller?: SessionId): JobView[]
//
// ⚠️ The degradation is REAL and is recorded rather than hidden: the pull path
// is driven from `session/event`, whose payload is `(session, event)` — and the
// DSH `Session` class exposes NO agent back-reference
// (dsh-session/lib/types/index.d.ts:103-293 has `id`/`header`/event readers only), so
// the pull path can only call `list()` with NO caller, i.e. it sees UNOWNED jobs
// only. A background job started by a tool has an owner, so on a deployment
// without `onJobDone` this listener would notify for almost nothing. It is kept
// because the task book requires the degraded design to exist and be tested, and
// because "the push surface is missing" is not something to silently ignore.
// **[0.2.x]** a SECOND asymmetry rides on the same path, and it is the honest
// counterpart of the `awaited` gate below: `list()` hands back a `JobView`
// (`packages/jobs/jobs/src/view.ts:65-100`), which carries NO `reported` field —
// and no `awaited` either, because that is a property of the SETTLEMENT EVENT,
// not of the job. The pull path therefore reads `reported: false` for everything
// it finds (`toJobSnapshot`'s "missing means not reported" rule) and can
// re-announce a job the model already collected through a `wait()`. The push
// paths cannot drift into that: they are the primary paths, the pull path is the
// fallback that stands down while either is live, and the once-per-id set below
// bounds the duplication to one notification per job per boot.
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
// (`onJobDone` **[0.1.5]** / the `settled` event **[0.2.x]**) instead of
// replaying a platform event vocabulary. The
// `session.next.*` prefix whitelist (P3-T1 §11 移植难点 2: "DSH 的 SessionEvent
// 是否有同族前缀未核实") is consequently moot: there is nothing to forward.
//
// ── WHY `{ owners: 'all' }` ON 0.2.x **[0.2.x]** (P4.5-T2, plan §4.2) ──
// The filter has three shapes (`packages/jobs/jobs/src/types.ts:228-237`,
// verbatim):
//
//     /**
//      * Who a subscription hears about. `{ owner }` delivers that session's jobs
//      * plus every unowned job (the set that session can see). `{ owners: 'scope' }`
//      * delivers the owners composed under the subscribing context — one registry
//      * serves every composition in the process, and a mount under one preset must
//      * not hear another preset's agents. `{ owners: 'all' }` delivers everything.
//      */
//     export type JobEventFilter =
//       | { readonly owner: SessionId }
//       | { readonly owners: 'all' | 'scope' }
//
// PLAN §4.2's rule: the chosen filter's delivery set must MATCH what 0.1.5's
// `onJobDone` actually delivered, and if it does not, use `{owners:'all'}` and
// record the reason. The measurement (T1 Q-5, `.omo/evidence/p45t1/
// Q5-jobs-subscribe.md`) produced:
//
//   * **[MEASURED, Q5 §3.2/§3.3]** on the HOST PLANE — where this plugin mounts
//     — `{owners:'all'}`, `{owners:'scope'}` and `{owner:<live session>}` each
//     delivered the IDENTICAL set (30 rows / 10 jobs, byte-identical). The
//     mechanism is source-level, not measured (Q5 §3.3 flags it as such):
//     `jobs-local/src/events.ts:88` delivers `layers.global.scoped`
//     unconditionally, and an unscoped registering context files its `'scope'`
//     subscription into exactly that global layer (`scope/src/store.ts:231-237`).
//     So on this mount, `'scope'` ≡ `'all'` — and the ONLY way to observe a
//     difference is to subscribe from a context mounted under a preset scope,
//     which Q5 could not do (Q5 §7.5; `concerto` does not register on 0.2.x).
//   * **[NOT MEASURED — Q5 §4.1]** the DIRECT comparison against 0.1.5's
//     `onJobDone` delivery set in the same scenario never ran: no 0.1.5 binary
//     on this host (Q5 §4.2-1) and `onJobDone` no longer exists in 0.2.0 `src/`
//     (Q5 §4.2-2). The equivalence argument below is therefore a SOURCE reading
//     of both implementations, NOT a measured equality, and is not written as one
//     anywhere in this file.
//
// The source reading: 0.1.5's `onJobDone` appends the listener to
// `this.layers.effect(this.ctx, layer => layer.listeners.append(listener))`
// (verbatim, quoted at the top of this header from
// `dsh-jobs-local/lib/index.js:261-263`); this plugin's row mounts on the
// host plane, which has no scope, so the listener lands in the GLOBAL layer and
// hears EVERY owner's settlements. `{owners:'all'}` is the 0.2.x shape with the
// same property, by declaration ("`{ owners: 'all' }` delivers everything") and
// by implementation (`events.ts:85-86`: `{owner}` and `{owners:'all'}` live in
// `this.unscoped`, evaluated against EVERY event regardless of where they were
// registered). `{owner: X}` is the one that would NARROW it — and it narrows in
// a second, subtler way than its doc suggests: `events.ts:85`'s skip is guarded
// by two `&&`, so `{owner:X}` still hears unowned jobs, while `{owners:'all'}`
// does no owner filtering at all. Both readings match the 0.1.5 path's behaviour
// — 0.1.5's listener has NO caller concept whatsoever and takes everything.
//
// ⇒ **`{ owners: 'all' }`.** It is the only filter that cannot silently narrow
// the notification set relative to what 0.1.5 delivered, the narrowing risk is
// the whole point of plan §4.2's rule, and the plan's own fallback for a
// non-proven equivalence is this filter. If a later measurement shows
// host-plane `'scope'` is genuinely narrower, switching is a one-token edit with
// this paragraph as the counter-argument to re-weigh.
//
// ── THE GATE: `reported` [0.1.5] / `awaited` [0.2.x] (P4.5-T2) ──
// **[0.1.5]** REPORTED-JOB GATE (DSH-specific, derived from the native
// reporter): `snapshot.reported === true` means a kill, a read, a wait, or a
// teardown cancel already reported the terminal state — verbatim,
// `dsh-jobs/lib/types/types.d.ts` `JobSnapshot.reported`: "Completion reporters
// suppress redundant notices when set." The native reporter's first line is the
// same gate (`if (snapshot.reported || owner === void 0) return`), so this port
// mirrors it: a job the user already collected does not also pop an OS
// notification. This is a KNOWING narrowing (upstream forwarded everything it
// received).
//
// **[0.2.x]** `JobSnapshot.reported` is DELETED (review §3.1; `view.ts:65-100`
// has no such field). Its de-dup job is taken over by the SETTLEMENT EVENT's
// `awaited` — verbatim, `packages/jobs/jobs/src/types.ts:206-218`:
//
//     /**
//      * Whether this settlement released a live {@link JobRegistry.wait}. That
//      * waiter's caller receives the terminal projection as its own result, so
//      * a completion reporter treats an awaited settlement as already delivered
//      * and reports only the unawaited ones. A wait that timed out or was
//      * aborted before the settlement does not count.
//      */
//     readonly awaited: boolean
//
// Assigned at exactly one place, `jobs-local/src/index.ts:603`:
// `awaited: waitResolvers.length > 0` — the truth of "a live, un-fenced waiter
// was released at this settlement". **[MEASURED, Q5 §5.2]** `true` for a job with
// a live `wait(id, 20000, sessionId)`, `false` for one without, and `false` for
// a `wait()` that was fenced out (`Q5-attempt4-probe.ndjson:28`, `belongs to
// another session`) — so "a `wait()` was called" is NOT the same as `true`.
//
// ⇒ the 0.2.x gate is **terminal AND `awaited === false`**: if somebody was
// already standing there to collect this job when it settled, do not also pop an
// OS notification for it. The two generations' gates are NOT the same fact —
// `reported` covered kill/read/wait/teardown-collected, `awaited` covers only a
// released `wait()` — so on 0.2.x a job whose output was merely READ still pops a
// notification. That widening is forced (the field no longer exists) and is
// recorded here rather than hidden; it is the reason the once-per-id set is
// load-bearing on BOTH paths.
//
// IMPLEMENTATION NOTE (why the gate function has ONE body, not two): the v2
// branch maps `event.awaited` into the SAME `reported` field of the existing
// `JobSnapshotLike` (`onJobEvent` below), so `shouldNotifyForJob()` stays a
// single gate shared by both branches, and so do the content builder and the
// once-per-id dedup. `reported` is therefore this file's INTERNAL name for
// "already delivered to a human or a waiter", not a claim that the upstream field
// still exists.
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2, all modes):
//   ① / ③ no disk reads and no ambient work on the event path: the backend is
//      built at apply time and the content is assembled from the snapshot's leaf
//      fields only (never a live registry object). **[0.2.x]** the same rule is
//      why `onJobEvent` copies out of `event.job` through `toJobSnapshot()` and
//      never retains the event, the `JobView`, or the `events` getter it came
//      from.
//   ② every observer body wraps its OWN logic in try/catch. Both surfaces are
//      contained by their owners (`onJobDone` listeners are contained and their
//      rejections logged — `dsh-jobs-local/lib/index.js:378-386`; **[0.2.x]**
//      `events.ts:95-101` wraps every listener in try/catch and only warns —
//      "contained by the registry, never awaited", `types.ts:239`; `session/event`
//      observers are "logged and contained") — this port's try/catch keeps OUR
//      bugs out of all three.
//   ⑤ no module-level mutable state: the notified-id set (the pull path's dedup,
//      without which every later `turn/end` would re-notify for the same settled
//      job) lives in the registrar-side listener closure. **[0.2.x]** so does the
//      "released" latch that makes the subscription disposer idempotent.
//
// DISPOSER OWNERSHIP ON EVERY PATH (P4.5-T2; index.ts discipline ①; Q-4):
// `events.subscribe(...)` returns the cordis effect disposer that unregisters the
// listener — `types.ts:251` "@returns disposer that unregisters the listener",
// `jobs-local/src/events.ts:62-73`, measured `typeof === 'function'` /
// `length === 0` and idempotent on repeated calls **[MEASURED, Q5 §6.1/§6.2]**.
// `onJobDone` returns the same kind of disposer (`index.d.ts:109`, and the
// implementation returns `layers.effect(...)`'s disposer). This port holds it the
// SAME WAY ON BOTH GENERATIONS, and the shape is unchanged from P3-T13:
//   * IMMEDIATE path (the strict `ctx.get('jobs')` read won the loader race):
//     `adoptJobs` wraps the disposer and the registrar RETURNS it, so the
//     registration loop hands it to `ctx.effect` (return, never call).
//   * DEFERRED path (`ctx.inject(['jobs'], cb)`): the wrapped disposer is
//     RETURNED FROM the inject callback, and cordis collects it as the injected
//     child fiber's disposal — that child is itself an effect of this fiber
//     (`cordis/lib/index.js:1074-1075`), so the subscription is fiber-reversible.
//   * The wrapper flips the push verdict to `false` BEFORE running the service's
//     own unregister, and runs that unregister AT MOST ONCE, so a disposer that
//     is not idempotent upstream (the in-register case Q5 §7.7 lists as
//     unmeasured) cannot break teardown here.
//
// LOG ANCHOR CONTRACT (probe / e2e; keep the format stable, extend the probe):
//   * `[omo-hooks] background-notification: <status> <label>`
//     — ONE line per dispatched notification, emitted BEFORE the OS command runs
//       (the same CI-carrier rule as the sibling session-notification anchor).
//   * `[omo-hooks] background-notification FAILED: <what>: <describeError>`
//     — a swallowed failure (backend rejection, subscription failure). Kept out
//       of the boot markers' `hook <id> FAILED` form on purpose. The `<what>`
//       names the GENERATION that failed: `jobs.events.subscribe subscribe
//       failed` (v2) vs `jobs.onJobDone subscribe failed` (v1) — one line that
//       says only "subscribe failed" cannot tell a reviewer which runtime is
//       broken.
//   * `[omo-hooks] background-notification NOTE: <what>`
//     — the deferred-acquisition record, and the loud-but-non-fatal line for a
//       deployment whose `jobs` service never appears (the pull path keeps
//       running). DELIBERATELY NOT the anchor prefix: the anchor grammar is
//       `background-notification: <status> <label>`, so a note written with the
//       anchor prefix would be counted as a notification by every probe/e2e
//       that counts anchors (the e2e's exactly-once assertion included).
//     — P4.5-T2 TRISTATE: the NOTE text must make WHICH PATH IS ALIVE readable
//       at a glance, so three phrasings are distinct constants and never
//       interchangeable: `push path live (events)` (v2 subscribed), `push path
//       live (onJobDone)` (v1 subscribed), `degraded pull path` (no push face at
//       all). A single generic "push path live" would collapse exactly the
//       distinction this Phase exists to make observable.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookDisposer, HookRegistrar, HooksRegistrationContext } from '../index.ts'
import { describeError } from '../boot-markers.ts'
import { dshRuntimeShape } from '../dsh-runtime-shape.ts'
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

/**
 * The deferred-acquisition NOTE prefix. Distinct from {@link BACKGROUND_LOG_PREFIX}
 * on purpose — see the header's LOG ANCHOR CONTRACT: a note written with the
 * anchor prefix would satisfy every `background-notification: <status> <label>`
 * probe as if a notification had been dispatched.
 */
export const BACKGROUND_NOTE_PREFIX = '[omo-hooks] background-notification NOTE: '

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

/** Builds the deferred-acquisition note line. */
export function formatBackgroundNotificationNoteLine(what: string): string {
  return `${BACKGROUND_NOTE_PREFIX}${what}`
}

// --- The `ctx.jobs` face (structural, minimal) -------------------------------

/**
 * The minimal `ctx.jobs` face this file reads. Declared structurally because the
 * registrar's context is the plugin's own (`ctx.get(name)` returns `unknown`), so
 * every member is optional and verified with `typeof === 'function'` before use —
 * a service that is absent, reloaded, or a different implementation degrades to
 * the pull path instead of throwing at boot.
 *
 * P4.5-T2: the face carries BOTH generations' push surfaces at once, as optional
 * members. That is not indecision, it is the type-level statement of the fork:
 *   * `onJobDone` is the **[0.1.5]** completion subscription
 *     (`dsh-jobs/lib/types/index.d.ts:111`); deleted in 0.2.x — a 0.2.x registry
 *     typed against its own `src/` has no such member, so this stays optional and
 *     is verified before use.
 *   * `events` is the **[0.2.x]** event stream
 *     (`packages/jobs/jobs/src/index.ts:100` `abstract readonly events:
 *     JobEvents`, `types.ts:243-253` `subscribe(filter, listener): () => void`);
 *     absent in 0.1.5.
 *     ⚠️ `events` is a GETTER that binds the accessing context
 *     (`jobs-local/src/index.ts:199-204`), so the registrar reads it ONCE off
 *     the discovered face and subscribes through that local — it is never rebuilt
 *     per event and never cached at module level.
 * The runtime chooses between them with {@link dshRuntimeShape} (a runtime-identity
 * marker, NOT a capability probe — see ../dsh-runtime-shape.ts); the `typeof`
 * guards here are the CALL-SITE capability guards that the marker deliberately
 * does not do, and a face that fails one takes the pull path with its own NOTE
 * line instead of pretending to be subscribed.
 */
export interface JobsSurface {
  /** **[0.1.5]** `dsh-jobs/lib/types/index.d.ts:111` — returns the unregister disposer. */
  onJobDone?(listener: (snapshot: unknown, owner: unknown) => void): unknown
  /** **[0.2.x]** `packages/jobs/jobs/src/index.ts:100` — the event stream of the same registry. */
  readonly events?: {
    /**
     * **[0.2.x]** `types.ts:253` — `subscribe(filter, listener): () => void`,
     * declared OPTIONAL and with `unknown` filter/event: this workspace has no dsh
     * types to name `JobEventFilter` / `JobEvent` with, and the filter this port
     * passes (`{ owners: 'all' }`) plus the event it consumes (`settled`) are
     * pinned by tests instead.
     */
    subscribe?(filter: unknown, listener: (event: unknown) => void): unknown
  }
  /**
   * The degraded read face: **[0.1.5]** `dsh-jobs/lib/types/index.d.ts:63`
   * `list(caller?: Agent)` / **[0.2.x]** `packages/jobs/jobs/src/index.ts:117`
   * `list(caller?: SessionId)` — called with NO caller here, on purpose.
   */
  list?(caller?: unknown): readonly unknown[]
}

/**
 * The leaf fields of one settlement this file reads — **[0.1.5]** the leaf fields
 * of `JobSnapshot` (types.d.ts:88-119), **[0.2.x]** a subset of `JobView`
 * (`packages/jobs/jobs/src/view.ts:65-100`, which carries `id`/`kind`/`label`/
 * `status`/`detail` too, plus `owner`/`progress`/`startedAt`/`output` this port
 * never reads).
 *
 * ⚠️ `reported` is this file's OWN field, not a 0.2.x field: 0.2.x deleted
 * `JobSnapshot.reported`, and the v2 push path fills this slot from the
 * `settled` event's `awaited` (header: THE GATE). `false` on the pull path,
 * where neither fact is readable off a `JobView`.
 */
export interface JobSnapshotLike {
  readonly id: string
  readonly kind: string
  readonly label: string
  readonly status: string
  readonly detail?: string
  /**
   * "Already delivered to somebody else" — **[0.1.5]** `JobSnapshot.reported`,
   * **[0.2.x]** the `settled` event's `awaited` mapped in by `onJobEvent`,
   * `false` on the pull path (a `JobView` carries neither).
   */
  readonly reported: boolean
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * Copies a settlement snapshot into a small owned record of leaf values
 * (discipline ①: never retain or serialize the live registry projection).
 * `undefined` means "not a snapshot this hook can notify about".
 *
 * Shared by THREE producers: the **[0.1.5]** `onJobDone` snapshot, the
 * **[0.2.x]** `settled` event's `JobView`, and the pull path's `list()` entries.
 * A 0.2.x `JobView` has no `reported` member, so `reported` lands as `false`
 * here; the v2 push path OVERWRITES it with the `settled` event's `awaited` at
 * the call site (`onJobEvent` below) — the field is this port's internal
 * "already delivered" slot, see {@link JobSnapshotLike.reported}.
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
 * The notify gate: a terminal, not-yet-delivered snapshot. ONE gate for BOTH
 * generations, because both feed the same `reported` slot:
 *   * **[0.1.5]** it mirrors the native reporter's own suppression
 *     (`dsh-tool-jobs/lib/index.js:207`; header: THE GATE).
 *   * **[0.2.x]** the caller puts the `settled` event's `awaited` in it, so the
 *     gate reads "terminal AND nobody was waiting for it" (header: THE GATE;
 *     `types.ts:206-218`).
 */
export function shouldNotifyForJob(snapshot: JobSnapshotLike): boolean {
  if (snapshot.reported) return false
  return TERMINAL_JOB_STATUSES.includes(snapshot.status)
}

/**
 * **[0.2.x]** `true` for a `settled` JobEvent, `false` for every other member of
 * the union — defensively, so any shape (including a non-object) answers rather
 * than throwing.
 *
 * The explicit filter is load-bearing, not stylistic: `output` events carry an
 * `id` and a `total` and NO `job` field (`types.ts:219-226`), so feeding the
 * whole union to `toJobSnapshot()` would produce `undefined` and stay silent BY
 * ACCIDENT. Silence-by-accident is not a contract; this is the contract, and
 * `registered` / `progress` / `stopping` / `removed` (`types.ts:201-205`) are
 * excluded because they announce NON-terminal commits — a notification per
 * progress line would be the "replaying a platform event vocabulary" failure this
 * port explicitly refused (header: DIFFERENCE FROM UPSTREAM PUSH SEMANTICS).
 */
export function isSettledJobEvent(event: unknown): boolean {
  if (!isObject(event)) return false
  return (event as { readonly type?: unknown }).type === 'settled'
}

/** Reads `event.type === 'turn/end'`-ness of a session event, defensively. */
function isTurnEndEvent(event: unknown): boolean {
  if (!isObject(event)) return false
  return (event as { readonly type?: unknown }).type === 'turn/end'
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
 * The observation surface. ALL THREE observer methods are always present so the
 * registrar can wire them unconditionally; `hasPushSurface` decides which one
 * does work, and the two `attach`/`setPush` mutators let the DEFERRED
 * acquisition adopt a service that was not there at construction time (see the
 * header's WHY section).
 */
export interface BackgroundNotificationListener {
  /** **[0.1.5]** The `ctx.jobs.onJobDone` callback (push path). */
  onJobDone(snapshot: unknown, owner: unknown): void
  /**
   * **[0.2.x]** The `ctx.jobs.events.subscribe({ owners: 'all' }, …)` callback
   * (push path). Consumes `settled` and nothing else (see {@link isSettledJobEvent})
   * and maps `awaited` onto the shared `reported` gate (header: THE GATE).
   */
  onJobEvent(event: unknown): void
  /** The `session/event` observer (pull path; inert while the push path is live). */
  onSessionEvent(session: unknown, event: unknown): void
  /**
   * Whether a PUSH channel is the live observation surface right now —
   * `events.subscribe` **[0.2.x]** or `onJobDone` **[0.1.5]**, whichever the
   * fork took. `false` means the pull path owns the notifications.
   */
  hasPushSurface(): boolean
  /**
   * Adopts the `jobs` face discovered after construction (deferred acquisition).
   * This is the DEGRADED pull path's read face only — the push channel is
   * decided by {@link setPushSurfaceLive}, because a face that HAS a push member
   * (`onJobDone` or `events.subscribe`) is not live until that subscription
   * really succeeded.
   */
  attachJobsSurface(jobs: JobsSurface | undefined): void
  /**
   * Records whether the push subscription is live. `true` makes the pull path
   * stand down (one settlement must not produce two notifications); `false`
   * (subscription failed, or its disposer ran) lets the pull path work again.
   */
  setPushSurfaceLive(live: boolean): void
}

/**
 * Whether a discovered `jobs` face exposes a push surface AT ALL — the CALL-SITE
 * capability guard that {@link dshRuntimeShape} deliberately refuses to be
 * (../dsh-runtime-shape.ts: identity, not capability). It asks the per-generation
 * question (`events.subscribe` on a v2 face, `onJobDone` on a v1 face) and its
 * only job is to decide whether subscribing is even possible, so that a v2 face
 * WITHOUT `subscribe` reaches the pull path with its own NOTE line instead of
 * being silently treated as subscribed.
 */
export function hasPushFace(jobs: JobsSurface | undefined): boolean {
  if (jobs === undefined) return false
  return dshRuntimeShape(jobs) === 'v2'
    ? typeof jobs.events?.subscribe === 'function'
    : typeof jobs.onJobDone === 'function'
}

/**
 * Builds the observer trio.
 *
 * `jobs`/`hasPush` are closure state seeded from the injected service and
 * updated by {@link BackgroundNotificationListener.attachJobsSurface} /
 * {@link BackgroundNotificationListener.setPushSurfaceLive} when the deferred
 * acquisition adopts a later-arriving service. While the push subscription is
 * live the pull path stands down (`onSessionEvent` returns immediately),
 * because both would otherwise notify for the same settlement. The pull path is
 * therefore a genuine FALLBACK, not dead code — it is what a deployment without
 * `ctx.jobs.onJobDone` **[0.1.5]** or without `ctx.jobs.events.subscribe`
 * **[0.2.x]** gets, and the unit suite exercises both branches.
 *
 * `notifiedJobIds` is the pull path's essential dedup: the registry keeps settled
 * jobs in `list()`, so without it every later `turn/end` would re-announce the
 * same job. It is a closure-local `Set` (fiber-scoped, discipline ⑤) and needs no
 * prune — job ids are process-bounded and a notification per id is exactly once.
 * P4.5-T2: it is the dedup for BOTH push paths too, which is what lets the two
 * generations' gates differ in strictness (`reported` vs `awaited`, header: THE
 * GATE) without either one ever popping twice for one job.
 */
export function createBackgroundNotificationListener(
  deps: BackgroundNotificationDeps,
): BackgroundNotificationListener {
  const baseTitle = deps.baseTitle ?? DEFAULT_SESSION_NOTIFICATION_CONFIG.baseTitle
  // Mutable by design: the service may arrive AFTER construction (the deferred
  // `ctx.inject(['jobs'])` path — see the header's WHY section), so both the
  // read face and the push-live verdict are closure state, not frozen inputs.
  // The constructor still reads them eagerly, which keeps the direct-construction
  // callers (and the unit suite's path-1/path-2 harnesses) unchanged.
  let jobs = deps.jobs
  // `hasPushFace` (not a bare `onJobDone` check) so a v2 face seeded here is
  // judged by ITS push member; the shape fork lives in one place.
  let hasPush = hasPushFace(deps.jobs)
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

    attachJobsSurface: (surface) => {
      jobs = surface
    },

    setPushSurfaceLive: (live) => {
      hasPush = live
    },

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

    /**
     * **[0.2.x]** The push entry of the rewritten jobs surface. Three steps, in
     * the order that keeps each one's failure contained:
     *   1. {@link isSettledJobEvent} — the explicit event-type filter. `output`
     *      has no `job` member at all (`types.ts:219-226`), and the four
     *      non-terminal types announce commits that are NOT completions.
     *   2. `toJobSnapshot(event.job)` — the SAME leaf-copying mapper the v1 path
     *      uses, so a `JobView`'s `id`/`kind`/`label`/`status`/`detail` are the
     *      only things retained (discipline ①).
     *   3. `reported: event.awaited === true` — the ADR-3 mapping. `awaited`
     *      means "a live `wait()` was released by THIS settlement"
     *      (`types.ts:206-218`, assigned at `jobs-local/src/index.ts:603`,
     *      measured Q5 §5.2), i.e. somebody already received this terminal
     *      projection as their own result, so the OS notification would be the
     *      second delivery of it. Writing it into the existing `reported` slot
     *      keeps {@link shouldNotifyForJob} one function for both generations.
     *      ⚠️ The comparison is `=== true`, so a missing or non-boolean
     *      `awaited` reads as NOT delivered and notifies (fail towards telling
     *      the user, the same direction `toJobSnapshot` takes on `reported`).
     */
    onJobEvent: (event) => {
      try {
        if (!isSettledJobEvent(event)) return
        const settled = event as { readonly job?: unknown; readonly awaited?: unknown }
        const job = toJobSnapshot(settled.job)
        if (job === undefined) return
        void notifyForJob({ ...job, reported: settled.awaited === true }).catch((err) => {
          reportFailure('notification dispatch failed', err)
        })
      } catch (err) {
        reportFailure('job-event observer failed', err)
      }
    },

    onSessionEvent: (_session, event) => {
      try {
        // The pull path is a FALLBACK: while the push subscription is live it
        // stands down so one settlement cannot produce two notifications. Same rule
        // for both generations — `hasPush` is true for a live `onJobDone` [0.1.5]
        // and for a live `events.subscribe` [0.2.x] alike.
        if (hasPush) return
        if (!isTurnEndEvent(event)) return
        // `_session` is unused by construction — see the header's PREREQUISITE
        // ANSWER: the `Session` object carries no agent reference, which is why
        // this path can only call `list()` without a caller.
        const list = jobs?.list
        if (typeof list !== 'function') return
        // No caller: see the header's PREREQUISITE ANSWER — an unowned-jobs-only
        // view is the best this vantage has.
        const snapshots = list.call(jobs)
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

/**
 * Reads `ctx.get('jobs')` defensively (absent service ⇒ pull path with nothing).
 *
 * ⚠️ `undefined` here means "the service is not ACTIVE **right now**", not "the
 * deployment has no jobs service": cordis's `ctx.get(name)` defaults to a
 * STRICT read that hides an implementation whose providing fiber is not yet in
 * state 2 (verbatim `cordis/lib/index.js:754-771`; the header's WHY section
 * records the full root cause). The registrar therefore uses this only as the
 * immediate fast path and arms `ctx.inject(['jobs'])` for the real acquisition.
 */
export function readJobsService(ctx: { get?(name: string): unknown }): JobsSurface | undefined {
  if (typeof ctx.get !== 'function') return undefined
  const jobs = ctx.get('jobs')
  return isObject(jobs) ? (jobs as JobsSurface) : undefined
}

// --- The registrar -----------------------------------------------------------

/**
 * The deferred-acquisition / which-path-is-alive NOTE texts (single-sourced so
 * the unit suite and the e2e probe pin the same strings). Never the anchor form;
 * see the header's LOG ANCHOR CONTRACT.
 *
 * P4.5-T2 TRISTATE (ADR-4): the three states a reader must be able to tell apart
 * at a glance get three DIFFERENT phrasings — `push path live (events)` **[0.2.x]**,
 * `push path live (onJobDone)` **[0.1.5]**, `degraded pull path` **[NEITHER]**.
 * Before P4.5-T2 there was ONE "push path live" line, which collapsed the first
 * two into one string — precisely the ambiguity that let this hook sit on the
 * degraded path on 0.2.x while its log still looked healthy (review §3.2-1).
 *
 * ⚠️ `BACKGROUND_NOTE_ABSENT` is pinned VERBATIM by `tests/omo-hooks/
 * registration.test.ts:356,:486` (a full-roster boot log transcription), so its
 * text is not this task's to change.
 */
export const BACKGROUND_NOTE_DEFERRED =
  'jobs service not active at apply; ctx.inject(["jobs"]) armed '
  + '(degraded pull path active until it appears)'
/** **[0.2.x]** the v2 push subscription landed. */
export const BACKGROUND_NOTE_SUBSCRIBED_EVENTS =
  'jobs service observed (v2 shape); ctx.jobs.events.subscribe({owners:"all"}) '
  + 'subscribed (push path live (events))'
/** **[0.1.5]** the v1 push subscription landed. */
export const BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE =
  'jobs service observed (v1 shape); ctx.jobs.onJobDone subscribed '
  + '(push path live (onJobDone))'
/** A v1-shaped face with no push member at all — the degraded pull path owns it. */
export const BACKGROUND_NOTE_PULL_ONLY =
  'jobs service observed without onJobDone; degraded pull path only'
/**
 * A v2-shaped face whose `events.subscribe` is MISSING — the case the identity
 * marker cannot see (it reads `events !== undefined` and nothing deeper,
 * ../dsh-runtime-shape.ts), so the CALL SITE must guard it and say so. Loud by
 * design: silently taking the pull path here is the same class of failure as
 * review §3.2-1.
 */
export const BACKGROUND_NOTE_V2_WITHOUT_SUBSCRIBE =
  'jobs service observed (v2 shape) without events.subscribe; '
  + 'no push subscription (degraded pull path only)'
export const BACKGROUND_NOTE_ABSENT =
  'jobs service never appeared; no push subscription (degraded pull path only)'

/** What one discovered `jobs` face yielded (the registrar's log decision). */
type JobsAdoption =
  | {
    readonly kind: 'push'
    /** Which generation's push member answered, so the NOTE line can name it. */
    readonly note: string
    readonly disposer: HookDisposer | undefined
  }
  | {
    readonly kind: 'pull-only'
    /** Why there is no push surface, so the NOTE line can name the shape. */
    readonly note: string
  }
  | { readonly kind: 'failed' }

/**
 * Registers the observers:
 *   1. the manifest's declared primary event (`session/event`) — ALWAYS, through
 *      `ctx.on`, so the row's primary surface is genuinely observed and the boot
 *      marker's `registered on session/event` line is true (index.ts discipline
 *      ④ + the probe's source-derived expectation);
 *   2. the PUSH surface — `ctx.jobs.events.subscribe({ owners: 'all' }, …)` on a
 *      v2 jobs package, `ctx.jobs.onJobDone(…)` on a v1 one (ADR-1's fork,
 *      ../dsh-runtime-shape.ts), acquired through the IMMEDIATE strict read when
 *      the service is already active, and otherwise through
 *      `ctx.inject(['jobs'], cb)`, which starts the callback as soon as the
 *      service appears (immediately when it is already provided, and again after
 *      a reload). The subscription's disposer is returned for the immediate path
 *      (the loop registers it with `ctx.effect`), and RETURNED FROM the inject
 *      callback for the deferred path — cordis collects an injected callback's
 *      return value as the injected child fiber's disposal, and that child is
 *      itself an effect of this fiber (`cordis/lib/index.js:1074-1075`), so both
 *      paths are fiber-reversible (index.ts discipline ①). The WHY section in
 *      the header records the concurrency root cause this exists for, and the
 *      DISPOSER OWNERSHIP section records why the SAME wrapper serves both
 *      generations.
 *
 * A subscription that throws is a loud-but-non-fatal log line, never a
 * registration failure: the probe fails a boot on `[omo-hooks] hook .* FAILED`,
 * and a background-notification service hiccup must not fail the whole plugin's
 * mount. A `jobs` service that never appears is the same class of outcome, one
 * step milder: ONE NOTE line ({@link BACKGROUND_NOTE_ABSENT} /
 * {@link BACKGROUND_NOTE_DEFERRED}) and the degraded pull path keeps working.
 *
 * ONE DELIBERATE ASYMMETRY, pinned by tests: the IMMEDIATE path logs no NOTE.
 * Its contract predates P4.5-T2 (`registration.test.ts` / the P3-T13 case that
 * pins "fast path ⇒ no inject child, no note"), and it is the rare path — the
 * loader creates the `jobs` row CONCURRENTLY with this plugin (header: WHY
 * `ctx.get('jobs')` IS `undefined` AT apply()), so a real boot arms the inject
 * child and gets the generation-naming NOTE from there. Adding a note to the
 * fast path would rewrite an existing 0.1.5-shaped contract for no observability
 * gain on the path that actually runs; the fast path is instead pinned by the
 * tests that assert its SUBSCRIPTION and its disposer.
 *
 * NOTHING here waits synchronously for `jobs` at apply() time, and the plugin's
 * own `inject` stays empty: a hard `inject: ['jobs']` would gate every other
 * hook in the roster behind this one optional service.
 *
 * WHY NO `jobs.attachController()` (the task book's "可选" half): a controller
 * is the authority that lets `jobs.start` admit an owner at all — verbatim
 * `dsh-jobs-local/lib/index.js:132`:
 *
 *     if (!this.servesOwner(spec.owner)) throw new Error("background jobs
 *     unavailable: no job controller serves this agent (load
 *     @deepseek-ai/dsh-tool-jobs in its composition)");
 *
 * i.e. attaching one is a CLAIM TO COLLECT AND STOP work, and a global one makes
 * `servesOwner` (`dsh-jobs-local/lib/index.js:279-282`) true for every owner. This
 * port only OBSERVES settlements — it never reads or cancels a job — so
 * attaching a controller would both overstate its authority and mask a
 * composition that deliberately mounted no collector. The real composition
 * already has one (`dsh-tool-jobs/lib/index.js:200`
 * `ctx.jobs.attachController("tool-jobs")`, mounted globally by dsh-base), so
 * the push subscription is all this port needs — `events.subscribe` **[0.2.x]**
 * reads no controller state either (`events.ts:62-73` touches only the hub's own
 * layer/unscoped sets).
 */
export const registerBackgroundNotification: HookRegistrar = (
  ctx: HooksRegistrationContext,
  entry: HookManifestEntry,
) => {
  const listener = createBackgroundNotificationListener({
    backend: createPlatformNotifierBackend({
      runtimePlatform: process.platform,
      run: runCommandViaExecFile,
    }),
    jobs: undefined,
    log: (line) => console.log(line),
    logFailure: (line) => console.warn(line),
  })

  /** The stable NOTE sink (never the anchor/failure prefixes). */
  const note = (what: string): void => {
    try {
      console.log(formatBackgroundNotificationNoteLine(what))
    } catch {
      // Diagnostics are not worth breaking a mount (discipline ②).
    }
  }

  /** The stable FAILED sink. */
  const fail = (what: string, err: unknown): void => {
    try {
      console.warn(formatBackgroundNotificationFailureLine(what, err))
    } catch {
      // Nothing left to report with; the plugin still boots.
    }
  }

  /**
   * Wraps a subscription's own disposer in this port's fiber-scoped one
   * (header: DISPOSER OWNERSHIP). Order and once-only-ness are the contract:
   *   * flip the push verdict FIRST, so a throwing service disposer cannot leave
   *     `hasPushSurface()` stuck on `true` while nothing is subscribed;
   *   * run the service disposer AT MOST ONCE — cordis disposers are measured
   *     idempotent for the one-shot case (Q5 §6.2) and explicitly UNMEASURED
   *     for an in-register subscription (Q5 §7.7), so this port does not bet on
   *     it; a second call here is a no-op rather than a re-entry.
   */
  const wrapDisposer = (disposer: unknown): HookDisposer => {
    let released = false
    return () => {
      listener.setPushSurfaceLive(false)
      if (released) return
      released = true
      if (typeof disposer === 'function') (disposer as () => void)()
    }
  }

  /**
   * Adopts one discovered `jobs` face: registers the pull read face, then the
   * push subscription the face's GENERATION offers. The fork is
   * {@link dshRuntimeShape} — identity, so BOTH branches exist in this one
   * function and a v2 face NEVER calls `onJobDone` even if a mock hands it one
   * (pinned by test). The outcome tells the caller which NOTE line is true and
   * carries the subscription's fiber-scoped disposer.
   *
   * `events` is read ONCE here off the discovered face, never re-read per event
   * and never stored at module level: it is a GETTER bound to the accessing
   * context (`jobs-local/src/index.ts:199-204`).
   */
  const adoptJobs = (jobs: JobsSurface): JobsAdoption => {
    listener.attachJobsSurface(jobs)
    if (dshRuntimeShape(jobs) === 'v2') {
      const events = jobs.events
      const subscribe = events?.subscribe
      if (typeof subscribe !== 'function') {
        // Identity says v2, capability says no: guarded HERE (this is exactly the
        // call-site guard the identity marker refuses to be) and said out loud.
        listener.setPushSurfaceLive(false)
        return { kind: 'pull-only', note: BACKGROUND_NOTE_V2_WITHOUT_SUBSCRIBE }
      }
      try {
        const disposer = subscribe.call(events, { owners: 'all' }, (event: unknown) => {
          listener.onJobEvent(event)
        })
        listener.setPushSurfaceLive(true)
        return { kind: 'push', note: BACKGROUND_NOTE_SUBSCRIBED_EVENTS, disposer: wrapDisposer(disposer) }
      } catch (err) {
        listener.setPushSurfaceLive(false)
        fail('jobs.events.subscribe subscribe failed', err)
        return { kind: 'failed' }
      }
    }
    const onJobDone = jobs.onJobDone
    if (typeof onJobDone !== 'function') {
      // A v1 jobs face without `onJobDone` still serves the degraded pull path.
      listener.setPushSurfaceLive(false)
      return { kind: 'pull-only', note: BACKGROUND_NOTE_PULL_ONLY }
    }
    try {
      const disposer = onJobDone.call(jobs, (snapshot, owner) => {
        listener.onJobDone(snapshot, owner)
      })
      listener.setPushSurfaceLive(true)
      return { kind: 'push', note: BACKGROUND_NOTE_SUBSCRIBED_ONJOB_DONE, disposer: wrapDisposer(disposer) }
    } catch (err) {
      listener.setPushSurfaceLive(false)
      fail('jobs.onJobDone subscribe failed', err)
      return { kind: 'failed' }
    }
  }

  ctx.on(entry.event, (session, event) => listener.onSessionEvent(session, event))

  // Fast path: the service is already active (e.g. a unit harness, or a boot
  // whose jobs row really did win the race). One acquisition, no inject child,
  // and — by contract, see the registrar's doc — no NOTE line.
  const immediate = readJobsService(ctx)
  if (immediate !== undefined && hasPushFace(immediate)) {
    const adoption = adoptJobs(immediate)
    return adoption.kind === 'push' ? adoption.disposer : undefined
  }

  if (typeof ctx.inject !== 'function') {
    // A context without `inject` (structural fakes, or a minimal host) can only
    // see what is already there — and this branch is only reached when that is
    // NOT a push-capable face (the fast path above already took that case).
    if (immediate === undefined) note(BACKGROUND_NOTE_ABSENT)
    else {
      const adoption = adoptJobs(immediate)
      if (adoption.kind === 'pull-only') note(adoption.note)
    }
    return
  }

  // The real deployment path: the loader creates this row concurrently with the
  // jobs row, so the service is usually NOT active yet. `ctx.inject` starts the
  // callback when it appears (see the header's WHY section). The flag records a
  // callback that ran DURING the arm (a service that appeared between the strict
  // read and this call): its own NOTE is the truthful one, and a stale
  // "not active at apply" line must not follow it.
  let injectCallbackRan = false
  try {
    ctx.inject(['jobs'], (injected) => {
      injectCallbackRan = true
      const jobs = isObject(injected.jobs) ? (injected.jobs as JobsSurface) : readJobsService(injected)
      if (jobs === undefined) {
        note(BACKGROUND_NOTE_ABSENT)
        return
      }
      const adoption = adoptJobs(jobs)
      // The adoption carries the note that names the GENERATION it took:
      // `push path live (events)` [0.2.x] / `push path live (onJobDone)`
      // [0.1.5] / `degraded pull path` [neither] — ADR-4's tristate.
      if (adoption.kind === 'push') note(adoption.note)
      else if (adoption.kind === 'pull-only') note(adoption.note)
      // `failed` already logged its own FAILED line inside adoptJobs.
      // Returned, never called: cordis collects this as the injected fiber's
      // disposal (header: DEFERRED FORM).
      return adoption.kind === 'push' ? adoption.disposer : undefined
    })
  } catch (err) {
    try {
      console.warn(formatBackgroundNotificationFailureLine('ctx.inject(["jobs"]) failed', err))
    } catch {
      // The plugin still boots and the pull path is still registered.
    }
    return
  }
  // `BACKGROUND_NOTE_DEFERRED`'s text claims the service was "not active at
  // apply", which is true ONLY when the strict read above came up empty AND the
  // injected callback has not already run: an already-active face with no push
  // member (the callback runs immediately for it) is described by its own
  // PULL_ONLY / V2_WITHOUT_SUBSCRIBE note, and a face that appears during the arm
  // is described by the SUBSCRIBED note naming its generation. Emitting the
  // deferred line after either would both misstate the state and reverse the real
  // order (NOTE text/order aligned with the code).
  if (immediate === undefined && !injectCallbackRan) note(BACKGROUND_NOTE_DEFERRED)
  return
}
