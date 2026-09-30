// @oh-my-opendsh/omo-commands — Phase 4 slash-command plugin (plan §4.1).
//
// WHAT THIS PLUGIN IS: the OMO **命令面** (command surface) reborn as a DSH
// cordis plugin. Each ported upstream command becomes one handler here — the
// orchestrator activation command, the hyperplan entry, the stop-continuation
// stop switch, the handoff summary, the AI-slop cleanup, and the skill-as-command
// delivery surface — enumerated ONCE in src/manifest.ts. Nothing in this plugin
// is a hook listener (that stays in @oh-my-opendsh/omo-hooks), an agent
// definition, or a persona.
//
// BOUNDARY WITH omo-agents AND omo-hooks (plan §4.1). The roster / persona /
// route / hard-blocks-injection responsibilities stay in
// @oh-my-opendsh/omo-agents; the behaviour guardrails stay in
// @oh-my-opendsh/omo-hooks. The three plugins have NO import of each other —
// each keeps its own boot markers, and each declares only the minimal
// structural types of the DSH surface it touches (the same discipline as
// omo-agents/src/hard-blocks-injection.ts, because this workspace has no dsh
// dependency to import types from). Cross-plugin state — the stop-continuation
// guard's stop marker — is shared through a **cordis service**, never through an
// import (plan §4.6: provider `ctx.provide`, consumer DEFERRED `ctx.get`, never
// cached at apply time). If a future change wants to share code across the
// plugins, that is a plan-level decision, not an import added here.
//
// WHY A SEPARATE PACKAGE AT ALL (plan §4.1): folding the commands into
// omo-agents or omo-hooks would turn a roster plugin or a guardrail plugin into
// a junk drawer. The feasibility report §4.4 topology reserved
// patches/omo-dsh/omo-commands/ for exactly this.
//
// WHAT P4-T2 DELIVERED AND WHAT P4-T3 ADDED. P4-T2 delivered the package shape
// plus manifest.ts (the single source of truth for WHICH commands exist) behind
// an EMPTY apply() that imported nothing; P4-T3 adds the mount itself — the
// `inject: ['commands']` dependency, the registration loop, and the boot
// markers. The implementation registry is DELIBERATELY EMPTY: all six manifest
// rows are 'pending' at this point (no command handler, unit test or e2e
// scenario has landed), so a correct boot logs the summary line
// `[omo-commands] loaded: manifest 6 entries (pending=6, ported=0) — 0/6 commands
// registered` and NOTHING else. That is the P3-T3 precedent exactly: an empty
// implementation registry with the summary line derived from the manifest,
// filled one command at a time from T6.
//
// The `.ts` extension in the imports below is LOAD-BEARING: Node 24
// type-stripping (P-8.6) does no specifier resolution, and this workspace has no
// bundler to rewrite it (the omo-hooks precedent carries the same note
// immediately above its import block; the no-build rationale itself is recorded
// in patches/omo-dsh/omo-commands/tsconfig.host.json's header, lines 6-8).

import {
  COMMAND_MANIFEST,
  validateManifest,
  type CommandManifestEntry,
} from './manifest.ts'
import {
  formatCommandFailedLine,
  formatCommandRegisteredLine,
  formatLoadedSummaryLine,
  formatManifestValidationFailedLine,
} from './boot-markers.ts'

export const name = 'omo-commands'

/**
 * Minimal structural typing for the surface apply() touches — the omo-hooks
 * HooksRegistrationContext discipline, at P4-T3 rather than at the skeleton.
 * Declared here rather than imported from DSH for the reason in the header (this
 * workspace has no dsh dependency).
 *
 * `commands` was OPTIONAL during P4-T2's skeleton (nothing read it) and is
 * REQUIRED now that the loop registers through it — the promotion P4-T2's
 * comment promised, and the reason P4-T3 declares it in `inject` below: cordis
 * then holds this plugin in the WAITING state and re-runs apply() when the
 * service appears, instead of throwing inside the loop on a profile without it.
 *
 * Why the hard dependency is safe, measured: the `commands` service is mounted
 * by the base bundle (`dsh-base/cordis.patch.yml` inserts `id: commands` →
 * `@deepseek-ai/dsh-commands`), so every profile that can boot this overlay
 * already carries it. The same choice is what `@deepseek-ai/dsh-command-goal`
 * makes (`inject = ["commands", "goals"]`).
 *
 * `effect` stays OPTIONAL because it is cordis's own member, touched only on the
 * branch where a registrar hands back a raw disposer. Its callback return type is
 * `CommandDisposer | void` (NOT `unknown`) so that the fiber contract is stated
 * where the loop consumes it — the same typed union omo-hooks' HooksRegistrationContext
 * uses for its `effect`.
 */
export interface CommandsRegistrationContext {
  /** The command registry (`dsh-commands`); every registration goes through it. */
  readonly commands: {
    register: (definition: CommandsRegistrationDefinition) => unknown
  }
  /** cordis's fiber-scoped effect collector — used only to adopt a returned disposer. */
  readonly effect?: (execute: () => CommandDisposer | void) => unknown
}

/** A cordis-style disposal: what an effect's execute callback RETURNS to be collected. */
export type CommandDisposer = () => void

/**
 * The minimal structural shape this plugin passes to `ctx.commands.register`,
 * mirroring `CommandDefinition` in `@deepseek-ai/dsh-commands/lib/types/types.d.ts`
 * (measured on 0.1.5-rc.1) with the handler's invocation left opaque: the
 * invocation surface (commandId / agent / rawInput / attachments / signal) is
 * consumed by T6+ handlers, which declare their own structural types at that
 * time rather than widening this one speculatively.
 */
export interface CommandsRegistrationDefinition {
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: {
    readonly hint: string
    readonly attachments?: boolean
  }
  /** Execute against the receiving agent. */
  readonly handler: (invocation: unknown) => unknown
}

/**
 * One command's registration. Returns an optional disposer for anything the
 * registrar allocated BEYOND its `ctx.commands.register` call — a future T5+
 * registrar that registers a skill or provides the stop-continuation guard
 * service has to hand those back; a plain command handler returns nothing.
 */
export type CommandRegistrar = (
  ctx: CommandsRegistrationContext,
  entry: CommandManifestEntry,
) => CommandDisposer | void

/**
 * The implementation registry, EMPTY AT P4-T3 ON PURPOSE — every manifest row is
 * 'pending', so there is no handler to register yet. The loop below is complete
 * and unit-tested against synthetic registrars (tests/omo-commands/
 * registration.test.ts), and T6+ adds one entry per landed command.
 *
 * A row is registered only when BOTH hold: its status is 'ported' (the manifest
 * row says handler + unit test + e2e all landed) and a registrar exists under its
 * id. A 'ported' row with no registrar is NOT registered and NOT counted — the
 * summary line then reads `<r>/<N>` with `<r>` below the ported count, which is
 * the honest reading of "the manifest claims a port this tree cannot register".
 * The boot never claims success it did not achieve.
 *
 * NOTE — `ulw-plan` MUST NEVER BE REGISTERED HERE, by any task. Registering a
 * same-named command would shadow the `dsh-tool-skill` SKILL_GESTURE bridge
 * (dsh's own command layer would win the name before the skill gesture is ever
 * matched). This is a PRODUCT constraint, not a scheduling detail: the `ulw-plan`
 * manifest row says so in its own row comment and `effectSummary` field, and
 * tests/omo-commands/registration.test.ts pins it with a `not.toContain('ulw-plan')`
 * guard on this record, so the ban survives whatever lands in T6+ even though the
 * static gate does not (deliberately: the check belongs HERE, where a reviewer
 * adding a registry entry reads it).
 */
export const COMMAND_REGISTRARS: Record<string, CommandRegistrar> = {}

/**
 * The registration loop, exported so its loud-but-non-fatal behaviour is
 * unit-testable with a fake registry while `apply()` keeps the one-argument
 * cordis entry-point signature (a test-only second parameter on apply would be a
 * production seam for no production caller — the omo-hooks precedent).
 *
 * Contract, in order:
 *   1. `validateManifest(entries)` — a broken roster logs the ONE
 *      `manifest validation FAILED` line and returns; NO summary line, NO
 *      registrations (loud-but-non-fatal: dsh keeps booting, and cold-start /
 *      the probe fail on the missing `[omo-commands] loaded` marker).
 *   2. one iteration per roster row, in roster order: skip rows that are not
 *      'ported' (nothing to register yet) and rows with no registrar; otherwise
 *      run the registrar inside its OWN try/catch and log exactly one
 *      `registered` or `FAILED` line. A throw never stops the loop, so "one
 *      command bad" can never mean "the rest never registered".
 *   3. the summary marker LAST — it reports the loop's outcome (`<r>/<N>`), so
 *      it cannot be printed before the loop has run (see boot-markers.ts's
 *      ORDER note for why this differs from omo-hooks, which logs its summary
 *      first because its counts come from the roster alone).
 *
 * FIBER REVERSIBILITY (discipline ①). A command registered through
 * `ctx.commands.register` needs no re-wiring here: measured dsh-commands
 * `lib/index.js:257-259`, `register()` returns `this.layers.effect(this.ctx, …)`,
 * so the registration already belongs to the calling fiber and cordis disposes
 * it on stop/update/undefine. That is a real difference from omo-hooks, whose
 * registrars wire listeners through `ctx.on` and therefore own their own
 * teardown. Only a registrar that RETURNS a raw disposer reaches `ctx.effect`
 * here — and the forwarding arrow must RETURN the disposer and never CALL it
 * (cordis runs the effect's execute callback immediately and collects its
 * RETURN value as the fiber's disposal, Fiber#_execute).
 */
export function runCommandRegistrations(
  ctx: CommandsRegistrationContext,
  entries: readonly CommandManifestEntry[],
  registrars: Readonly<Record<string, CommandRegistrar>>,
  log: (line: string) => void,
): void {
  try {
    validateManifest(entries)
  } catch (err) {
    log(formatManifestValidationFailedLine(err))
    return
  }
  const registered: CommandManifestEntry[] = []
  for (const entry of entries) {
    if (entry.status !== 'ported') continue
    const register = registrars[entry.id]
    if (register === undefined) continue
    try {
      const disposer = register(ctx, entry)
      // Register, never invoke: cordis runs this execute callback right now and
      // collects what it RETURNS as the fiber's disposal, so the arrow must
      // return `disposer`. Calling it inline would dispose at registration
      // time; returning undefined would leave the fiber nothing to dispose.
      // The `ctx.effect` half of this guard cannot be false on a real fiber —
      // cordis's fiber mixin provides `effect` on every ctx — so this mirrors
      // omo-hooks' identical implicit fallback: if it WERE absent, the returned
      // disposer would be silently dropped while the row still logs
      // `registered`, i.e. a leak no marker would reveal. Kept as a guard rather
      // than asserted because the alternative is an unconditional call on an
      // optional member.
      if (typeof disposer === 'function' && typeof ctx.effect === 'function') {
        ctx.effect(() => disposer)
      }
      registered.push(entry)
      log(formatCommandRegisteredLine(entry.id))
    } catch (err) {
      log(formatCommandFailedLine(entry.id, err))
    }
  }
  log(formatLoadedSummaryLine(entries, registered))
}

/**
 * The plugin entry point: wire the real manifest and the real registry into the
 * loop above. Everything observable from boot is produced by
 * runCommandRegistrations (unit-tested), so this function stays a one-line
 * assembly and the markers cannot drift from their tests.
 */
export function apply(ctx: CommandsRegistrationContext): void {
  runCommandRegistrations(ctx, COMMAND_MANIFEST, COMMAND_REGISTRARS, (line) => {
    console.log(line)
  })
}

/**
 * `commands` is a hard dependency (see the interface comment above), so cordis
 * holds this plugin in the waiting state until the registry service is
 * available and re-runs apply() then — the same shape as
 * `@deepseek-ai/dsh-command-goal`'s `inject = ["commands", "goals"]`. Declaring
 * it rather than reading `ctx.get('commands')` inside apply() is what turns a
 * missing service into a WAIT instead of a boot-time throw inside the loop.
 */
export const inject = ['commands']
