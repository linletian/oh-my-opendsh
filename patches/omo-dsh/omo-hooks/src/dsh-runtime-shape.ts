// dsh-runtime-shape.ts — Phase 4.5 (P4.5-T2) shared `ctx.jobs` RUNTIME-IDENTITY
// marker for @oh-my-opendsh/omo-hooks.
//
// NO UPSTREAM PORT SOURCE. This file is ORIGINAL work of this repository,
// written in Phase 4.5: it transplants nothing from
// `packages/omo-opencode/**` @ v4.19.4 and therefore deliberately carries no
// upstream attribution template (the `src/hooks/**/*.ts` signature-header
// contract — "upstream path + @ v4.19.4 + semantic-port declaration", gate 6
// c12 — is a rule about PORTED listeners, and this is not one; it lives at
// `src/` root, outside the directory c12/c13/c21 enumerate). What this header
// owes the reader instead is why the file exists at all, and why it exists at
// this exact path.
//
// ═══════════════════ WHY THIS FILE EXISTS ═══════════════════
// dsh 0.1.5 → 0.2.x rewrote `ctx.jobs` as a WHOLE PACKAGE (plan §4.2; review
// §3.1; `.omo/compat.yaml` `untested[0]`): the caller of `list`/`get`/`read`/
// `kill`/`wait`/`remove` changed from `Agent` to `SessionId`, `JobSnapshot
// .ownerSession` became `JobView.owner`, `JobSnapshot.reported` was deleted,
// and `jobs.onJobDone` / `jobs.onJobsChanged` were replaced by
// `jobs.events.subscribe(filter, listener)`. Verified read-only against the
// upstream mirror `~/GithubRepo/deepseek-harness` @ `639ed01539`
// (= `dsh-v0.2.0-rc.2`):
//   * `packages/jobs/jobs/src/index.ts:85` `export abstract class JobRegistry
//     extends Service`, `:100` `abstract readonly events: JobEvents`,
//     `:117` `abstract list(caller?: SessionId): JobView[]` — no `onJobDone`
//     member anywhere in the class.
//   * `grep -rn "onJobDone" --include=*.ts packages/*/*/src/` at that mirror →
//     0 hits (the 4 remaining hits are stale `lib/*.d.ts` build artifacts).
// This plugin touches that surface in THREE places, and each one has to fork on
// the same question — "which generation of the jobs package am I mounted
// against?":
//   * `src/hooks/background-notification.ts` (P4.5-T2, this Phase's first fork)
//   * `src/services/stop-continuation-guard.ts` (P4.5-T3)
//   * `src/hooks/ulw-execute/live-state.ts` (P4.5-T4)
// Three copies of the same predicate would be three chances to write one of
// them backwards — the exact 双模漂移 (dual-mode drift) risk the plan names as
// R-1 (plan §5, risk table). So the predicate is written ONCE, here, and the
// three touch points import it (plan §4.1 探针表, 评审 R1-I4 收敛).
//
// ═══════════ IT IS AN IDENTITY MARKER, NOT A CAPABILITY PROBE ═══════════
// READ THIS BEFORE REUSING IT. `dshRuntimeShape()` answers "which dsh jobs
// package is this", NOT "does this object support X". Consequences:
//
//   1. The signal is `jobs.events !== undefined` — the presence of ONE member,
//      nothing deeper. It does NOT check `typeof jobs.events.subscribe ===
//      'function'`, and it must never start. A capability probe would ask "can
//      I subscribe?"; this asks "whose shape is this?", and those two questions
//      have different answers when a face is half-built (see ③).
//   2. That is SOUND here only because the two generations switch over as a
//      WHOLE PACKAGE: `caller Agent → SessionId`, `ownerSession → owner`,
//      `reported` deleted, `onJobDone → events.subscribe` all land in the same
//      release of the same package (review §3.1). There is no intermediate dsh
//      where `events` exists but `list()` still wants an `Agent`, so one signal
//      legitimately decides all three forks, and the three touch points may share
//      it (plan §4.1: "三处共用同一信号、同一切换点").
//   3. It is therefore WRONG to reuse this marker as a capability probe for any
//      OTHER surface — a different package, a plugin that decorates `jobs`, a
//      half-mocked service. Where a face is present but a member is missing, the
//      CALL SITE must guard that member explicitly and say so in its log
//      (background-notification does: a v2 face without `events.subscribe` takes
//      the pull path with its own NOTE line, it does not silently pretend to be
//      subscribed). Widen the probe and you turn a package-identity fork into a
//      per-method guess, which is precisely the "误当能力探针扩散" failure the
//      plan forbids.
//   4. Nothing here reads a VERSION STRING. That is deliberate: a version check
//      would need a pin, a parser, and a rule for `rc` suffixes, and it would
//      still be wrong for a locally patched dsh. The shape is the fact; the
//      version is an inference from it.
//
// WHY `src/` ROOT AND NOT `src/hooks/` (checked against gate 6 before this file
// was created; do not move it without re-checking):
//   * `scripts/verify-concerto-static.mjs:806-845` (c13) enumerates
//     `src/hooks/` and requires EVERY `.ts` under it to belong to a manifest id
//     (`orphans = allTs.filter(rel => !wantIds.includes(owner))`, `:828-831`).
//     A shared file placed there with no manifest row of its own goes RED.
//   * c21 (`:1580-1600`) derives the THIRD_PARTY_NOTICES counts from the same
//     directory listing, so the same stray file also moves a legal-artifact
//     count the plugin may not edit here.
//   * `src/` root — the layer holding `index.ts`, `manifest.ts` and
//     `boot-markers.ts` — is not enumerated by c12/c13/c21 (all three take
//     `HOOKS_DIR = src/hooks`, `scripts/verify-concerto-static.mjs:116`), and
//     it is the layer the shared helpers of this package already live on. It is
//     also the only layer reachable from BOTH consumers (`src/hooks/` and
//     `src/services/`, which sit side by side under it).
//
// The `.ts` extension on every import specifier in this package is load-bearing:
// Node 24 type-stripping (P-8.6) does no specifier resolution, and there is no
// bundler to rewrite it.

/** The two generations of the dsh `ctx.jobs` surface this plugin supports. */
export type DshRuntimeShape = 'v1' | 'v2'

/**
 * Decides which generation of the dsh jobs package a discovered `ctx.jobs` face
 * belongs to: `events` present → `'v2'` (0.2.x, `events.subscribe`), absent →
 * `'v1'` (0.1.5, `onJobDone`). Anything that is not an object — `undefined`,
 * `null`, a string, a number, a function — answers `'v1'`, because the honest
 * reading of "no object" is "no v2 package here", and `'v1'` is the branch every
 * caller already degrades safely through (v1 without `onJobDone` = the pull
 * path; v2 without `events.subscribe` = its own guarded NOTE).
 *
 * The input is `unknown` on purpose: this package declares no dsh types (there
 * is no dsh dependency to import from), and the caller's face arrives through
 * `ctx.get('jobs')` / an `ctx.inject(['jobs'])` callback, i.e. as `unknown`.
 *
 * REMEMBER: identity marker, not capability probe — see the header's second
 * section. No member of the face is called, inspected, or required here.
 */
export function dshRuntimeShape(jobs: unknown): DshRuntimeShape {
  if (typeof jobs !== 'object' || jobs === null) return 'v1'
  return (jobs as { readonly events?: unknown }).events === undefined ? 'v1' : 'v2'
}
