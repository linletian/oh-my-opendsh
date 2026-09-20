// @oh-my-opendsh/omo-hooks — Phase 3 hook-listener plugin (plan §4.1).
//
// WHAT THIS PLUGIN IS: the OMO **行为护栏层** (behaviour-guardrail layer)
// reborn as DSH event listeners. Each ported upstream hook module becomes one
// listener here — the write-before-read file guard, the bash-read advisory, the
// todo continuation discipline, the session notifications, and the remaining
// in-scope hooks enumerated ONCE in src/manifest.ts. Nothing in this plugin is
// a slash command, a tool implementation, or an agent definition.
//
// BOUNDARY WITH omo-agents (plan §4.1, last bullet): the roster / persona /
// route / hard-blocks-injection responsibilities stay in
// @oh-my-opendsh/omo-agents; the behaviour guardrails move here. The two
// plugins have NO import of each other — each keeps its own boot markers, and
// each declares only the minimal structural types of the DSH surface it touches
// (the same discipline as omo-agents/src/hard-blocks-injection.ts, because this
// workspace has no dsh dependency to import types from). If a future change
// wants to share code across the two, that is a plan-level decision, not an
// import added here.
//
// WHY A SEPARATE PACKAGE AT ALL (plan §4.1): folding the hooks into omo-agents
// would turn a roster plugin into a junk drawer. The feasibility report §4.4
// topology already reserved patches/omo-dsh/omo-hooks/.
//
// P3-T2 delivered the package shape + manifest.ts; P3-T3 mounts it; P3-T5 landed
// the first implementation; P3-T7 landed the P1 todo/goal executor pair; P3-T12
// landed the P3 session-notification family; P3-T14 landed the WP-6 批 A D-mode
// trio; P3-T15 (this revision) lands the 批 B injection/reminder trio. apply()
// validates the manifest, logs the summary boot marker, and runs the per-hook
// registration loop; the loop's implementation registry (HOOK_REGISTRARS) now
// carries ELEVEN entries — 'bash-file-read-guard' (the C-mode pilot),
// 'todo-continuation-enforcer' (E mode), 'empty-task-response-detector' (D mode),
// 'session-notification' (F mode, the completion/error observer + the platform
// backend abstraction), 'background-notification' (F mode, the
// `ctx.jobs.onJobDone` observer that REUSES session-notification's
// NotifierBackend), the P3-T14 D-mode trio 'edit-error-recovery' /
// 'json-error-recovery' / 'tool-output-truncator', and the P3-T15 批 B trio
// 'directory-readme-injector' / 'agent-usage-reminder' / 'task-resume-info' — so
// exactly eleven `registered` lines are logged after the summary. The remaining 3
// rows are filled by the WP-6 batches (T16/T17); nothing else in this file
// changes when a row lands.
//
// Note the roster is 14 entries, not 15: P3-T5's other half is the WP-2
// arbitration that REMOVED H-01 (write-existing-file-guard) from the port group
// — dsh-fs-observation-policy already covers "overwrite an unread file" natively
// and strictly more (manifest.ts header; plan revision 2026-09-19).
//
// BOOT-MARKER CONTRACT (probe / cold-start assertion anchors; the pure
// formatters live in boot-markers.ts, whose header carries the full grammar —
// KEEP THESE FORMATS STABLE and extend the probe, never the format):
//   * `[omo-hooks] loaded: manifest 14 entries (pre-step=<n>, pre-execute=<n>,
//      post-execute=<n>, turn-stopping=<n>, session/event=<n>, status=<n>)`
//     — ONE line per boot, AFTER validateManifest accepted the roster. Every
//       count is DERIVED from HOOK_MANIFEST (boot-markers.ts), never hard-coded.
//       cold-start.sh and scripts/concerto-mode-probe.sh grep the
//       `[omo-hooks] loaded` prefix (the probe derives the full expected line
//       from the plugin's own modules, so it cannot drift).
//   * `[omo-hooks] hook <id> registered on <event>`
//     — one line per hook whose registrar is implemented AND returned cleanly.
//       ELEVEN such lines today ('bash-file-read-guard',
//       'todo-continuation-enforcer', 'empty-task-response-detector',
//       'session-notification', 'background-notification',
//       'edit-error-recovery', 'json-error-recovery',
//       'tool-output-truncator', 'directory-readme-injector',
//       'agent-usage-reminder', 'task-resume-info'); T16/T17 add the rest.
//       NOTE (P3-T12): the event in this line is the manifest's PRIMARY event,
//       which for 'background-notification' is `session/event` — and that row's
//       registrar DOES register it (its push half additionally subscribes to
//       `ctx.jobs.onJobDone`, which is a service subscription, not one of the six
//       manifest events; see that file's header). The marker therefore stays a
//       true statement about the row's primary surface.
//   * `[omo-hooks] hook <id> FAILED: <describeError>`
//     — loud-but-non-fatal: the failing hook is named and the loop continues
//       (P2-T16 precedent — one broken hook never suppresses the others).
//   * `[omo-hooks] manifest validation FAILED: <describeError>`
//     — the roster itself is broken; the summary line is withheld (a count from
//       an untrusted roster would read like a successful mount) and the plugin
//       registers nothing.
//
// REGISTRATION DISCIPLINES the loop shape reserves (plan §4.2; P3-T4+ must keep
// them):
//   ① Fiber reversibility — a registrar registers through the cordis context it
//      is handed (`ctx.on` / `ctx.effect`), so stop/update/undefine disposes
//      every listener; a registrar MAY instead return a disposer, which the
//      loop registers as this fiber's disposal with `ctx.effect(() => disposer)`.
//      The forwarding arrow must RETURN the disposer and never CALL it: cordis
//      runs the effect's execute callback immediately and collects its RETURN
//      VALUE (Fiber#_execute: `const effect = runner.execute.call(this); if
//      (typeof effect === "function") return runner.collect(effect)`). So an
//      inline `ctx.effect(() => disposer())` would tear the listener down the
//      moment it was registered AND leave the fiber with no disposal at all.
//      Nothing may outlive the registering fiber.
//   ② Self-catching listener bodies — a listener body wraps its OWN logic in
//      try/catch and picks fail-open/fail-closed explicitly per the P3-T1
//      semantics (R-9); the loop's per-hook catch covers REGISTRATION only.
//   ③ No disk reads on the event path — state is built at apply() time (or from
//      in-memory session state); a listener never performs file I/O.
//   ④ The loop reads the manifest's PRIMARY event only for the marker text. A
//      B+D / dual-event row (manifest.ts header) owns its full surface set
//      inside its registrar — register from the implementation, never from
//      `hooksByEvent` alone.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import {
  HOOK_MANIFEST,
  validateManifest,
  type HookManifestEntry,
} from './manifest.ts'
import {
  formatHookFailedLine,
  formatHookRegisteredLine,
  formatLoadedSummaryLine,
  formatManifestValidationFailedLine,
} from './boot-markers.ts'
import { registerBashFileReadGuard } from './hooks/bash-file-read-guard.ts'
import { registerTodoContinuationEnforcer } from './hooks/todo-continuation-enforcer.ts'
import { registerEmptyTaskResponseDetector } from './hooks/empty-task-response-detector.ts'
import { registerSessionNotification } from './hooks/session-notification.ts'
import { registerBackgroundNotification } from './hooks/background-notification.ts'
import { registerEditErrorRecovery } from './hooks/edit-error-recovery.ts'
import { registerJsonErrorRecovery } from './hooks/json-error-recovery.ts'
import { registerToolOutputTruncator } from './hooks/tool-output-truncator.ts'
import { registerDirectoryReadmeInjector } from './hooks/directory-readme-injector.ts'
import { registerAgentUsageReminder } from './hooks/agent-usage-reminder.ts'
import { registerTaskResumeInfo } from './hooks/task-resume-info.ts'

export const name = 'omo-hooks'

/**
 * A disposer returned by a registrar, or by an `effect` execute callback, for
 * the loop to register as the registering fiber's disposal. It runs at FIBER
 * STOP, not when it is handed over (discipline ① in the header).
 */
export type HookDisposer = () => void

/**
 * Minimal structural typing for the surface apply() touches. Declared here
 * rather than imported from DSH for the reason in the header (this workspace
 * has no dsh dependency). `on` is the cordis listener form and is REQUIRED:
 * every hook this plugin will ever carry registers through it, so a context
 * without it is a wiring bug that must fail the typecheck, not a boot-time
 * surprise.
 *
 * `effect` is the cordis "run this now, dispose whatever it RETURNS with my
 * fiber" form, used by the loop only for a registrar that returns a raw
 * disposer instead of registering through `ctx.on` (see discipline ① in the
 * header). Its signature returns `HookDisposer | void` deliberately: cordis
 * calls the callback during registration and collects its RETURN VALUE as the
 * fiber disposal (Fiber#_execute), so the return position — not the body — is
 * the contract; a callback that returns undefined contributes no disposal.
 * `effect` itself is optional because a context that already exposes `on`
 * needs nothing else, and the loop degrades to "the registrar owns its
 * disposal" rather than throwing.
 */
export interface HooksRegistrationContext {
  on(event: string, listener: (...args: readonly unknown[]) => unknown): unknown
  effect?(execute: () => HookDisposer | void): unknown
  /**
   * Cordis's optional service lookup (`Context#get(name)`), used by the hooks
   * that must read a DSH service rather than only observe events — the E-mode
   * `todo-continuation-enforcer` reads the `todos` session projection (U-4) and
   * consults the OPTIONAL `goals` service (R-8); the F-mode notification pair
   * reads the same projection (`session-notification`, the H-05 predicates) and
   * the OPTIONAL `jobs` service (`background-notification`, the `onJobDone`
   * push surface). Declared optional on purpose:
   * a context without it, a deployment without the service, and a service
   * without the key all mean "capability absent", which every such hook treats
   * as a skip — never a boot or turn failure (plan §4.2). Declaring it required
   * would make every existing fake in the unit suite illegal for no benefit.
   *
   * ⚠️ `get` is a STRICT read: cordis returns `undefined` for a service whose
   * providing fiber is not ACTIVE yet, which is exactly the state of a service
   * row the loader is still creating CONCURRENTLY with this plugin (verbatim
   * `cordis/lib/index.js:754-771`; the full root cause is recorded in
   * hooks/background-notification.ts's WHY section). A hook that must observe a
   * service rather than sample it once therefore uses {@link inject} below.
   */
  get?(name: string): unknown
  /**
   * Cordis's DEFERRED dependency form (`Context#inject(deps, callback)`,
   * verbatim `cordis/lib/index.js:1592-1605`): "start a callback once the
   * requested dependencies are available". The callback runs as its own child
   * fiber — immediately when every named service is already active, and again
   * (after the old child unloads) when one is replaced — receives the injected
   * context, and may RETURN a disposer, which cordis collects as that child
   * fiber's disposal. That child is itself an effect of the registering fiber
   * (`cordis/lib/index.js:1074-1075`), so everything the callback registers is
   * disposed with this plugin (discipline ①).
   *
   * Declared optional for the same reason as `get`: a structural fake without
   * it must stay legal, and a hook that cannot defer simply keeps its
   * synchronous behaviour. It exists for hooks whose service is created in the
   * SAME loader batch as this plugin (P3-T13: `background-notification`'s
   * `jobs` — see that module's WHY section), and it is deliberately NOT the
   * plugin-level `inject: ['jobs']` form: that would gate every hook in the
   * roster behind one optional service.
   */
  inject?(deps: readonly string[], callback: (injected: HooksInjectedContext) => unknown): unknown
}

/**
 * The context an {@link HooksRegistrationContext.inject} callback receives: a
 * context whose named dependencies are available. Cordis exposes each injected
 * service as a property (the shipped session controller reads `jobsCtx.jobs`,
 * `dsh-api-session-controller/lib/index.js:1017-1018`), so the index signature
 * is `unknown` and every consumer narrows structurally — the same discipline as
 * `HooksRegistrationContext.get`.
 */
export interface HooksInjectedContext {
  readonly [name: string]: unknown
  /** The same strict lookup, available inside the injected context. */
  get?(name: string): unknown
}

/**
 * One hook's registration entry point. Receives the context and the whole
 * manifest row (so an implementation never restates its own id/event), and
 * performs the registration: either through `ctx.on`/`ctx.effect` (preferred —
 * cordis then disposes it with this fiber) or by returning a disposer, which
 * the loop registers with `ctx.effect` for this fiber (registered, never
 * invoked — discipline ①). It may throw; the loop catches per hook.
 *
 * The listener body itself is the implementation's responsibility, including
 * its own try/catch and its fail-open/closed choice (header discipline ②).
 */
export type HookRegistrar = (
  ctx: HooksRegistrationContext,
  entry: HookManifestEntry,
) => HookDisposer | void

/**
 * The implementation registry — the ONE extension point each port task fills.
 * Keys are manifest ids, so a row's implementation and its declared
 * event/scenario stay joined by the manifest (a test asserts every key is a
 * real manifest id).
 *
 * THREE ENTRIES as of P3-T7 — the C-mode pilot plus the E/D executor pair:
 *   'bash-file-read-guard': registerBashFileReadGuard (hooks/bash-file-read-guard.ts),
 *     the C-mode pilot, which wires its listener through `ctx.on` and returns
 *     nothing (the preferred channel — cordis scopes it to this fiber).
 *   'todo-continuation-enforcer': registerTodoContinuationEnforcer
 *     (hooks/todo-continuation-enforcer.ts) — the E-mode steering listener plus
 *     its per-session circuit breaker (fiber-scoped WeakMap).
 *   'empty-task-response-detector': registerEmptyTaskResponseDetector
 *     (hooks/empty-task-response-detector.ts) — the D-mode result rewrite.
 * All three use the same preferred channel and return nothing.
 * P3-T12 added TWO MORE — the F-mode notification pair, and they are the first
 * entries to exercise the RETURNED-DISPOSER channel of discipline ①:
 *   'session-notification': registerSessionNotification
 *     (hooks/session-notification.ts) — registers on its primary manifest event
 *     (`session/event`) AND the auxiliary `agent/status` through `ctx.on`, and
 *     returns a disposer that cancels any armed notification timer.
 *   'background-notification': registerBackgroundNotification
 *     (hooks/background-notification.ts) — registers on its primary manifest
 *     event unconditionally, and additionally subscribes to the `ctx.jobs`
 *     service (`onJobDone`, a service subscription rather than one of the six
 *     manifest events). Since P3-T13 that subscription is acquired through
 *     `ctx.inject(['jobs'], …)` (the {@link HooksRegistrationContext.inject}
 *     deferred form) rather than a synchronous `ctx.get` sample: the loader
 *     creates this row concurrently with the `jobs` provider row, so the strict
 *     read is usually empty at apply() time — the root cause and its verbatim
 *     citations are in that module's header. It returns a disposer only on the
 *     immediate path; the deferred path hands the subscription's disposer back
 *     through the injected child fiber, which cordis disposes with this fiber.
 * P3-T14 added THREE MORE — the WP-6 批 A D-mode trio — through the same
 * preferred `ctx.on` channel and returning nothing:
 *   'edit-error-recovery': registerEditErrorRecovery
 *     (hooks/edit-error-recovery.ts) — appends the read-the-file reminder to an
 *     `edit` result whose text carries one of DSH's real edit-mistake strings.
 *   'json-error-recovery': registerJsonErrorRecovery
 *     (hooks/json-error-recovery.ts) — appends the malformed-arguments reminder
 *     to a non-blacklisted tool result matching the (upstream 8 + DSH-native)
 *     regex table, self-idempotent through its own marker line.
 *   'tool-output-truncator': registerToolOutputTruncator
 *     (hooks/tool-output-truncator.ts) — replaces a whitelisted tool's oversized
 *     result with the min(remaining × 0.5, tool threshold) truncation; its
 *     remaining-token input is the `contextPressure` session projection, looked
 *     up per event (the module header's 前置③).
 * P3-T15 added THREE MORE — the 批 B injection/reminder trio, all through the
 * same preferred `ctx.on` channel and all returning nothing. Two of them own MORE
 * than their primary manifest event (index.ts discipline ④ — a multi-surface row
 * registers its full set from the implementation, and the boot marker keeps
 * printing the PRIMARY event):
 *   'directory-readme-injector': registerDirectoryReadmeInjector
 *     (hooks/directory-readme-injector.ts) — appends the directory-chain READMEs
 *     to a `read` result; ALSO registers `session/event` (a successful
 *     `compaction/end` re-arms the per-session directory cache, upstream's
 *     `session.compacted`) and `session/disposed` (upstream's `session.deleted`).
 *   'agent-usage-reminder': registerAgentUsageReminder
 *     (hooks/agent-usage-reminder.ts) — appends the delegation reminder to a
 *     search/fetch result at most MAX_REMINDERS times; ALSO registers
 *     `session/disposed` (upstream's `session.deleted` reset). Its orchestrator
 *     gate reads the `tools` registry per event through `ctx.get`.
 *   'task-resume-info': registerTaskResumeInfo (hooks/task-resume-info.ts) — the
 *     ONE-surface case: upstream registered one surface too, and the module is
 *     stateless (the 前置 conclusion in its header).
 *
 * COMPOSITION-ORDER SEMANTICS — THE WATERFALL IS ORDER-SENSITIVE, AND ONE PAIR
 * SHORT-CIRCUITS (P3-T15 review MINOR-3; arbitrated: REGISTER, do not chain-merge).
 * Every row above registers on `tools/post-execute` through `ctx.on`, so the
 * listeners run in ROSTER ORDER (the order of the keys below / of HOOK_MANIFEST),
 * and cordis' waterfall ends the chain at the first listener that returns WITHOUT
 * calling `next()` (cordis/lib/index.js:317-325: callbacks are shifted in
 * registration order; the decision replaces the result, so the remaining listeners
 * never see it). Exactly one ordered pair therefore carries a composed effect:
 *   'tool-output-truncator' (row 8) → 'agent-usage-reminder' (row 10).
 *     TRUNCATABLE_TOOLS = {grep, glob, web_fetch} is a SUBSET of the reminder's
 *     TARGET_TOOLS = {grep, glob, web_fetch, web_search}, and the truncator returns
 *     its accept decision without `next()` when a result is over the adaptive
 *     limit. A truncated grep/glob/web_fetch result is consequently short-circuited
 *     out of the reminder listener entirely: the reminder is NOT appended AND
 *     `reminderCount` is NOT incremented for it (upstream registered the two hooks
 *     as independent appends, so the count can outlive one more result than
 *     upstream's MAX_REMINDERS would allow). The direction is BENIGN — truncation
 *     is the more urgent rewrite — and `web_search` is reminder-only, so it is
 *     unaffected. ACCEPTED as known composition semantics; the registered order is
 *     pinned implicitly by this key order and explicitly by the registration unit
 *     suite, and no chain-merge (truncator → `next()` → re-bound downstream) is
 *     introduced.
 *   The complementary ordered pair 'empty-task-response-detector' (row 3) →
 *   'task-resume-info' (row 11) was CHECKED and has NO behavioral interaction: the
 *   detector also ends the chain without `next()`, but only when the rendered text
 *   is EMPTY, while every render the resume tip triggers on (`continuable` /
 *   `foreground`) is non-empty by construction. It is recorded as a vacuum here so
 *   the negative result is not mistaken for an unexamined gap.
 *
 * TODO(P3-T16+): add one entry per remaining ported hook, the same way —
 *   'webfetch-redirect-guard': registerWebfetchRedirectGuard, ...
 * one task per hook, keeping disciplines ①–④ above. Nothing else in this file
 * needs to change when a row lands.
 */
export const HOOK_REGISTRARS: Record<string, HookRegistrar> = {
  'bash-file-read-guard': registerBashFileReadGuard,
  'todo-continuation-enforcer': registerTodoContinuationEnforcer,
  'empty-task-response-detector': registerEmptyTaskResponseDetector,
  'session-notification': registerSessionNotification,
  'background-notification': registerBackgroundNotification,
  'edit-error-recovery': registerEditErrorRecovery,
  'json-error-recovery': registerJsonErrorRecovery,
  'tool-output-truncator': registerToolOutputTruncator,
  'directory-readme-injector': registerDirectoryReadmeInjector,
  'agent-usage-reminder': registerAgentUsageReminder,
  'task-resume-info': registerTaskResumeInfo,
}

/**
 * The registration loop, exported so its loud-but-non-fatal behaviour is
 * unit-testable with fake registries while `apply()` keeps the one-argument
 * cordis entry-point signature (a test-only second parameter on apply would be
 * a production seam for no production caller).
 *
 * Contract, in order:
 *   1. `validateManifest(entries)` — a broken roster logs the ONE
 *      `manifest validation FAILED` line and returns; NO summary line, NO
 *      registrations (loud-but-non-fatal: dsh keeps booting, the probe fails on
 *      the missing `[omo-hooks] loaded` marker).
 *   2. the summary marker (counts derived from the roster).
 *   3. one iteration per roster row, in roster order: skip rows with no
 *      registrar (not ported yet), otherwise run its registrar inside its OWN
 *      try/catch and log exactly one `registered` or `FAILED` line. A throw
 *      never stops the loop, so "one hook bad" can never mean "the rest never
 *      registered".
 *   4. a registrar that wired its listener through `ctx.on` has nothing left to
 *      hand over (cordis scopes `on` to the registering fiber itself). Only a
 *      registrar that RETURNED a raw disposer reaches `ctx.effect`, which
 *      registers that disposer for the fiber; it is not called here
 *      (discipline ①).
 */
export function runHookRegistrations(
  ctx: HooksRegistrationContext,
  entries: readonly HookManifestEntry[],
  registrars: Readonly<Record<string, HookRegistrar>>,
  log: (line: string) => void,
): void {
  try {
    validateManifest(entries)
  } catch (err) {
    log(formatManifestValidationFailedLine(err))
    return
  }
  log(formatLoadedSummaryLine(entries))
  for (const entry of entries) {
    const register = registrars[entry.id]
    if (register === undefined) continue
    try {
      const disposer = register(ctx, entry)
      // Register, never invoke: cordis runs this execute callback right now and
      // collects what it RETURNS as the fiber's disposal (Fiber#_execute), so
      // the arrow must return `disposer`. Calling it inline would dispose the
      // listener at registration time; returning undefined (a braced body that
      // calls it) would leave the fiber nothing to dispose at all.
      if (typeof disposer === 'function' && typeof ctx.effect === 'function') {
        ctx.effect(() => disposer)
      }
      log(formatHookRegisteredLine(entry.id, entry.event))
    } catch (err) {
      log(formatHookFailedLine(entry.id, err))
    }
  }
}

/**
 * The plugin entry point: wire the real manifest and the real registry into the
 * loop above. Everything observable from boot is produced by
 * runHookRegistrations (unit-tested), so this function stays a one-line
 * assembly and the markers cannot drift from their tests.
 */
export function apply(ctx: HooksRegistrationContext): void {
  runHookRegistrations(ctx, HOOK_MANIFEST, HOOK_REGISTRARS, (line) => {
    console.log(line)
  })
}
