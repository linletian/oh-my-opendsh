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
// THIS FILE IN P4-T2 IS A SKELETON. It exports `name` and an apply() whose body
// is intentionally empty; the ONLY thing P4-T2 delivers is the package shape
// plus manifest.ts (the single source of truth for WHICH commands exist). The
// deliverable is deliberately not mountable-as-a-feature yet: wiring it into
// cordis.yml is P4-T3's job, and until then this plugin registers no command
// and logs no marker — a half-loaded plugin that silently claimed success would
// be worse than one that plainly does nothing.
//
// For the same reason this module imports NOTHING: an import of manifest.ts
// whose only purpose is to keep a future reference alive is dead weight a
// bundled host would be right to drop, so P4-T3 adds that import together with
// the registration loop that actually consumes it.
//
// THE `.ts` EXTENSION IN THAT IMPORT IS LOAD-BEARING: Node 24 type-stripping
// (P-8.6) does no specifier resolution, and this workspace has no bundler to
// rewrite it — so P4-T3's `from './manifest.ts'` must carry the extension
// verbatim (the omo-hooks precedent, patches/omo-dsh/omo-hooks/src/index.ts,
// carries the same note immediately above its import block; the no-build
// rationale itself is recorded in patches/omo-dsh/omo-commands/
// tsconfig.host.json's header).

export const name = 'omo-commands'

/**
 * Minimal structural typing for the surface apply() will touch in P4-T3.
 * Declared here rather than imported from DSH for the reason in the header
 * (this workspace has no dsh dependency). An empty interface placeholder is
 * NOT used: `unknown` would be an unhelpful lie once the loop lands, and a
 * permissive `ctx: unknown` would let a typo'd property access typecheck today
 * and fail at boot tomorrow. When P4-T3 adds the registration loop, the needed
 * members (the `commands.register` / `skills.register` forms and the boot
 * logger) are added to this interface AT THAT TIME, mirroring omo-hooks'
 * HooksRegistrationContext.
 *
 * EVERY MEMBER IS OPTIONAL **ON PURPOSE, FOR THE SKELETON PHASE ONLY**. Today
 * `apply()` reads nothing off `ctx`, so a required member would be a lie the
 * typechecker could not keep; P4-T3, the moment the registration loop lands,
 * promotes `commands` (and then `skills`) to REQUIRED and keeps the interface
 * honest about what the loop actually touches. A leftover `?` after the loop
 * ships is a reviewable sign that this transition was not completed.
 */
export interface CommandsRegistrationContext {
  /** Reserved for P4-T3: the cordis command registration form. */
  readonly commands?: {
    register?: (definition: unknown) => unknown
  }
}

/**
 * The plugin entry. P4-T2 leaves the body empty ON PURPOSE.
 *
 * TODO(P4-T3): `validateManifest(COMMAND_MANIFEST)` + one registration loop over
 * the manifest rows (one `[omo-commands] command <id> registered` line each plus
 * one summary line whose per-status counts come from `countsByStatus`, never
 * hard-coded), with the loud-but-non-fatal discipline proven by P2-T16 — a single
 * command's registration failure logs its own FAILED line and never suppresses
 * the other rows. The manifest is validated at apply() time so a roster typo
 * becomes a boot-time line instead of a silently missing command.
 *
 * NOTE for whoever writes that loop: the `ulw-plan` row MUST NOT get a handler.
 * Its port is the DSH-native skill gesture bridge (plan §4.3), and registering a
 * same-named command would shadow the bridge (a commands admission miss is what
 * lets the line fall back to an ordinary prompt). The row exists so the coverage
 * bookkeeping and the "do not register" constraint have one declared home.
 */
export function apply(_ctx: CommandsRegistrationContext): void {
  // TODO(P4-T3): validateManifest(COMMAND_MANIFEST) + the registration loop + boot markers.
}
