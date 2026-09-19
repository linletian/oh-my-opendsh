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
// (this revision) lands the P3 session-notification family. apply() validates the
// manifest, logs the summary boot marker, and runs the per-hook registration
// loop; the loop's implementation registry (HOOK_REGISTRARS) now carries FIVE
// entries — 'bash-file-read-guard' (the C-mode pilot), 'todo-continuation-enforcer'
// (E mode), 'empty-task-response-detector' (D mode), 'session-notification' (F
// mode, the completion/error observer + the platform backend abstraction) and
// 'background-notification' (F mode, the `ctx.jobs.onJobDone` observer that
// REUSES session-notification's NotifierBackend) — so exactly five `registered`
// lines are logged after the summary. The remaining 9 rows are filled one task at
// a time by the WP-6 batches (T14+); nothing else in this file changes when a row
// lands.
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
//       Five such lines today ('bash-file-read-guard',
//       'todo-continuation-enforcer', 'empty-task-response-detector',
//       'session-notification', 'background-notification'); T14+ add the rest.
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
   */
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
 *     manifest events); the subscription's own disposer is what it returns.
 * TODO(P3-T14+): add one entry per remaining ported hook, the same way —
 *   'edit-error-recovery': registerEditErrorRecovery, ...
 * one task per hook, keeping disciplines ①–④ above. Nothing else in this file
 * needs to change when a row lands.
 */
export const HOOK_REGISTRARS: Record<string, HookRegistrar> = {
  'bash-file-read-guard': registerBashFileReadGuard,
  'todo-continuation-enforcer': registerTodoContinuationEnforcer,
  'empty-task-response-detector': registerEmptyTaskResponseDetector,
  'session-notification': registerSessionNotification,
  'background-notification': registerBackgroundNotification,
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
