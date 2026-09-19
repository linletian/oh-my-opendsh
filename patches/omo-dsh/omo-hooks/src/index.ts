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
// P3-T2 delivered the package shape + manifest.ts; P3-T3 (this revision) MOUNTS
// it. apply() now validates the manifest, logs the summary boot marker, and runs
// the per-hook registration loop. The loop's implementation registry
// (HOOK_REGISTRARS) is deliberately EMPTY: no hook has been ported yet
// (phase3-hooks.md §5: 已移植 0/15), and the two hooks that will land first
// (P3-T4/T5) define the shape. An empty registry is honest — the plugin mounts,
// the summary line proves it, and no `registered` line is logged because no
// listener exists. T4+ fill the registry one entry at a time; nothing else in
// this file changes at that point.
//
// BOOT-MARKER CONTRACT (probe / cold-start assertion anchors; the pure
// formatters live in boot-markers.ts, whose header carries the full grammar —
// KEEP THESE FORMATS STABLE and extend the probe, never the format):
//   * `[omo-hooks] loaded: manifest 15 entries (pre-step=<n>, pre-execute=<n>,
//      post-execute=<n>, turn-stopping=<n>, session/event=<n>, status=<n>)`
//     — ONE line per boot, AFTER validateManifest accepted the roster. Every
//       count is DERIVED from HOOK_MANIFEST (boot-markers.ts), never hard-coded.
//       cold-start.sh and scripts/concerto-mode-probe.sh grep the
//       `[omo-hooks] loaded` prefix.
//   * `[omo-hooks] hook <id> registered on <event>`
//     — one line per hook whose registrar is implemented AND returned cleanly.
//       Empty set today (registry empty); the loop that emits it is in place.
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
 * The implementation registry — the ONE extension point T4+ fill. Keys are
 * manifest ids, so a row's implementation and its declared event/scenario stay
 * joined by the manifest (a test asserts every key is a real manifest id).
 *
 * EMPTY ON PURPOSE in P3-T3: no hook has been ported (phase3-hooks.md §5,
 * 已移植 0/15). TODO(P3-T4+): add one entry per ported hook, e.g.
 *   'write-existing-file-guard': (ctx, entry) => { ctx.on(entry.event, listener) },
 * one hook per task, keeping disciplines ①–④ above. Nothing else in this file
 * needs to change when a row lands.
 */
export const HOOK_REGISTRARS: Record<string, HookRegistrar> = {}

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
