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
// THIS FILE IN P3-T2 IS A SKELETON. It exports `name` and an apply() whose body
// is intentionally empty; the ONLY thing P3-T2 delivers is the package shape
// plus manifest.ts (the single source of truth for WHICH hooks exist). The
// deliverable is deliberately not loadable-as-a-feature yet: mounting it in
// cordis.yml is P3-T3's job, and until then this plugin registers no listener
// and logs no marker — a half-loaded plugin that silently claimed success would
// be worse than one that plainly does nothing.
//
// For the same reason this module imports NOTHING: an import of manifest.ts
// whose only purpose is to keep a future reference alive is dead weight a
// bundled host would be right to drop, so P3-T3 adds that import together with
// the loop that actually consumes it.

export const name = 'omo-hooks'

/**
 * Minimal structural typing for the surface apply() will touch in P3-T3.
 * Declared here rather than imported from DSH for the reason in the header
 * (this workspace has no dsh dependency). An empty interface placeholder is
 * NOT used: `unknown` would be an unhelpful lie once the loop lands, and a
 * permissive `ctx: unknown` would let a typo'd property access typecheck
 * today and fail at boot tomorrow. When P3-T3 adds the registration loop, the
 * needed members (the `on`/`inject` listener forms and the boot logger) are
 * added to this interface AT THAT TIME, mirroring omo-agents'
 * PreStepRegistrationContext.
 */
export interface HooksRegistrationContext {
  /** Reserved for P3-T3: the cordis listener registration form. */
  readonly on?: (event: string, listener: (...args: readonly unknown[]) => unknown) => unknown
}

/**
 * The plugin entry. P3-T2 leaves the body empty ON PURPOSE.
 *
 * TODO(P3-T3): register the listener for every HOOK_MANIFEST row (one
 * `[omo-hooks] hook <id> registered on <event>` line each + one summary line,
 * the probe anchor), with the loud-but-non-fatal discipline proven by
 * P2-T16 — a single hook's registration failure logs its own FAILED line and
 * never suppresses the other rows. The loop is driven by
 * `hooksByEvent(HOOK_MANIFEST)` (manifest.ts), which exists for exactly that
 * consumer; note its header warning about the B+D / dual-event rows before
 * wiring it. `validateManifest(HOOK_MANIFEST)` lands here at the same time
 * (plan §4.1: the manifest is validated at apply() time, so a roster typo
 * becomes a boot-time line instead of a silently missing listener).
 */
export function apply(_ctx: HooksRegistrationContext): void {
  // TODO(P3-T3): validateManifest(HOOK_MANIFEST) + the registration loop + boot markers.
}
