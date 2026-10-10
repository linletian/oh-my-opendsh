// @oh-my-opendsh/omo-team — Phase 5 team-mode plugin (plan §4.2; task P5-T2,
// mounted by P5-T3).
//
// WHAT THIS PLUGIN IS: the OMO **team 面** (team surface) reborn as a DSH
// cordis plugin on the fork-(B) footing (裁定书 .omo/evidence/p5t1/FORK.md,
// 2026-10-09): omo-team self-owns the team state machine and creates members
// through `ctx.subagents.startContinuable` — the experimental team bundle is
// NOT mounted (no `ctx.agentTeams`, no scoped team tools), because the Q-3
// triple-seal chain proved per-member roster routing cannot close on the
// native spawn path. Each ported / vendored / recorded team surface — the 12
// `team_*` tool-contract rows, the four Phase 4 handoff rows, the seven vendor
// rows — is enumerated ONCE in src/manifest.ts. Nothing in this plugin is a
// hook listener (that stays in @oh-my-opendsh/omo-hooks), a slash command
// (that stays in @oh-my-opendsh/omo-commands), an agent definition, or a
// persona.
//
// BOUNDARY WITH omo-agents / omo-hooks / omo-commands (plan §4.1–§4.2). The
// roster / persona / route / hard-blocks-injection responsibilities stay in
// @oh-my-opendsh/omo-agents — omo-team READS the roster's seat values
// (provider/model/persona/toolFilter per member, Q-3 对照组实证 raw 通道全承
// 载), it never re-spells them. The behaviour guardrails and the keyword
// detector stay in @oh-my-opendsh/omo-hooks — the `team` keyword slot wiring
// (TEAM_PATTERN → pre-step injection, kind `omo-team-keyword`) evolves the
// H-33 module in place (P5-T12), and the stop-continuation guard grows the
// team interrupt/drain branch there (P5-T9). The slash-command templates stay
// in @oh-my-opendsh/omo-commands — the hyperplan / remove-ai-slops team
// upgrades edit those templates, not this package. The plugins have NO import
// of each other — each keeps its own boot markers, and each declares only the
// minimal structural types of the DSH surface it touches (the same discipline
// as omo-commands/src/index.ts, because this workspace has no dsh dependency
// to import types from). Cross-plugin state, if any, is shared through cordis
// services — provider `ctx.provide`, consumer deferred `ctx.get`, never cached
// at apply time (plan §4.6 discipline) — never through an import.
//
// WHY A SEPARATE PACKAGE AT ALL (plan §4.2): folding team semantics into
// omo-hooks would turn a guardrail plugin into a junk drawer, and team state
// is neither a hook nor a command — it is a state machine with its own
// vendored substrate (team-core harness-neutral subset, FORK.md §3.3). The
// Phase 5 topology reserved patches/omo-dsh/omo-team/ for exactly this, and
// the root cordis.yml mounts it as the FOURTH insert row since P5-T3 (the
// 同步网 3→4 义务 landed there, all points, same commit).
//
// WHAT P5-T2 DELIVERED AND WHAT P5-T3 ADDED. P5-T2 delivered the package shape
// plus manifest.ts (the single source of truth for WHICH team surfaces exist)
// behind an EMPTY apply() that imported nothing; P5-T3 adds the mount itself —
// the registration-loop skeleton and the boot markers. The registry is
// DELIBERATELY EMPTY at this point and is populated one row at a time from T5
// (`team_create`) onward, which is the P3-T3 / P4-T3 precedent exactly: an
// empty implementation registry with the summary line derived from the manifest,
// filled entry by entry as each row lands. The CURRENT contents are
// {@link TEAM_REGISTRARS} below; the count of each status is not restated here
// on purpose — it moves as rows land, and it is computed from TEAM_MANIFEST at
// boot: manifest.ts's own `formatLoadedSummaryLine` derives the manifest half,
// and boot-markers.ts's same-named wrapper `formatLoadedSummaryLine` appends
// the registration half (`<r>/<N>` — what the loop actually registered), with
// the exact line pinned by tests/omo-team/boot-markers.test.ts and re-derived
// at probe time by scripts/concerto-mode-probe.sh. A hand-copied census in a
// comment is the drift this discipline exists to kill (the Phase 4 index.ts
// paragraph pasted one and outlived it).
//
// THE `.ts` extension in the imports below is LOAD-BEARING: Node 24
// type-stripping (P-8.6) does no specifier resolution, and this workspace has no
// bundler to rewrite it (the no-build rationale itself is recorded in
// patches/omo-dsh/omo-team/tsconfig.host.json's header, lines 6-8 — the same
// note the omo-hooks / omo-commands precedents carry above their import blocks).

// P5-T3 — cordis 插件的 apply() 装配面（本仓的插件形态，omo-commands P4-T3 同款
// 演进：骨架 → 挂载 + 注册循环 + boot marker）。
// 署名声明（c16 原生总体）：本文件**无上游对应物**——v4.19.4 没有任何同职责的
// 模块（OMO 的 team 工具面住在 `packages/omo-opencode/src/features/team-mode/`，
// 其语义逐条署名在 src/manifest.ts 的行里，不在这里）。它是 DSH 侧的原生代码，
// 不是语义移植；宣称上游来源就是假署名。语义移植文件请带「UPSTREAM SOURCE +
// @ v4.19.4 + 移植声明」三件套。

import {
  TEAM_MANIFEST,
  validateManifest,
  type TeamManifestEntry,
} from './manifest.ts'
import {
  formatLoadedSummaryLine,
  formatManifestValidationFailedLine,
  formatTeamSurfaceFailedLine,
  formatTeamSurfaceRegisteredLine,
} from './boot-markers.ts'
// P5-T5: the first real registrar's module pair — the state machine (pure,
// host-singleton) and the team_create surface (tool + agent/created dispatch).
import { teamStateStore } from './team/team-state.ts'
import {
  registerTeamCreateSurface,
  type TeamAgent,
  type TeamContinuableChannel,
} from './tools/team-create.ts'

export const name = 'omo-team'

/**
 * P5-T5 SERVICE INJECTION (the P4-T3 promotion pair, verbatim discipline): a
 * member of this interface becomes REQUIRED exactly when the loop starts
 * calling through it, and the service the registrar calls through is declared
 * here in the same commit so the host orders the dependency before apply()
 * runs (the omo-commands `inject = ['commands', 'skills']` precedent; the
 * continuable channel is proven injectable on this host by the P5-T1 Q-3
 * sandbox plugin, which declared `inject = ['subagents', 'tools']`).
 * 'tools' is deliberately NOT listed: this plugin registers nothing on the
 * plugin-level tools service — every registration is agent-scoped through
 * `agent.ctx.tools.register` inside the `agent/created` listener (the
 * tool-agent-team :230-241/:539-546 mechanism, learned for shape only; its
 * semantics are not adopted — experimental surfaces never are).
 */
export const inject = ['subagents'] as const

/** A cordis-style disposal: what an effect's execute callback RETURNS to be collected. */
export type TeamDisposer = () => void

/**
 * Minimal structural typing for the surface apply() touches — declared here
 * rather than imported from DSH for the reason in the header (this workspace has
 * no dsh dependency). EVERY member was OPTIONAL at P5-T3, and that was not
 * laziness but the mount's real shape: the registry was EMPTY, so the loop
 * called nothing on `ctx`. The promotion precedent is omo-commands' `commands`
 * at P4-T3 — a member becomes REQUIRED (and joins the `inject` declaration)
 * exactly when the loop starts calling through it.
 *
 * P5-T5 EXERCISES THAT DOCTRINE: `on` and `subagents` are REQUIRED now (the
 * `team_create` registrar subscribes to `agent/created` and closes over the
 * continuable channel), and `inject = ['subagents']` went up in the same
 * commit. The T3 paragraph's WHY-NO-INJECT reasoning stays true of T3 and is
 * kept for the record: declaring an `inject` the loop could not yet register
 * through would park the fiber in `waiting`, swallow the `[omo-team] loaded`
 * marker, and redden every mount gate on an installed plugin — the pair (the
 * first registrar that needs a service + its `inject` entry) is the only legal
 * moment to widen, and T5 is that moment for exactly these two members.
 */
export interface TeamRegistrationContext {
  /**
   * Cordis's OPTIONAL service lookup (`Context#get`). Team coordination runs
   * through the native `subagents` service (`startContinuable` / `sendMessage`,
   * FORK.md §3.2/§3.4); the consumer reads it per invocation, never caches it
   * at apply time. Typed `unknown` on purpose — the loop's real demand shapes
   * this when the first registrar lands (T5).
   */
  readonly get?: (name: string) => unknown
  /** cordis's fiber-scoped effect collector — used only to adopt a returned disposer. */
  readonly effect?: (execute: () => TeamDisposer | void) => unknown
  /**
   * Cordis event subscription — PROMOTED TO REQUIRED AT P5-T5 (the promotion
   * doctrine of this interface's header, exercised by the first registrar):
   * the `team_create` registrar subscribes to `agent/created` to install the
   * role-scoped tool surfaces — the lead face on every root session, the
   * member face (structurally WITHOUT team_create) plus the injected briefing
   * on team-member children, nothing on other children (task P5-T5 deliverable
   * 4; the payload's `agent` is the live TeamAgent from tools/team-create.ts's
   * structural declaration).
   */
  readonly on: (event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown) => unknown
  /**
   * The native subagents service — PROMOTED TO REQUIRED AT P5-T5, declared in
   * `inject` in the same commit. The team_create registrar closes over this
   * channel and calls `startContinuable` / `interrupt` /
   * `drainContinuableChildren` per tools/team-create.ts's execution chain;
   * the channel is NOT cached beyond the registrar's closure (the T3 note's
   * per-invocation reading discipline holds — the closure reads through the
   * service object on every call).
   */
  readonly subagents: TeamContinuableChannel
}

/**
 * One team surface's registration. Returns an optional disposer for anything the
 * registrar allocated BEYOND its registration calls — a future T5+ registrar that
 * provides a service or opens a subscription has to hand those back; a plain
 * registrar returns nothing.
 */
export type TeamRegistrar = (
  ctx: TeamRegistrationContext,
  entry: TeamManifestEntry,
) => TeamDisposer | void

/**
 * The implementation registry — the P3-T3 / P4-T3 skeleton precedent kept
 * verbatim (the loop below is complete and unit-tested against synthetic
 * registrars in tests/omo-team/boot-markers.test.ts), with P5-T5 landing its
 * FIRST real entry: `team_create`. T6 adds the message surface, T7 the
 * shutdown pair, and so on, one row per landed task.
 *
 * KEY SHAPE honored by the T5 row: a one-liner over its module — every
 * semantic (execution chain, briefing, rollback, dispatch) lives in
 * src/tools/team-create.ts with its attribution header; this record owns the
 * row's manifest id, the channel it injects, and the process-singleton state
 * machine it hands the surface — nothing else.
 *
 * A row is registered only when BOTH hold: its status is 'ported' (the manifest
 * row says the delivery surface — code + unit test + e2e — landed; 'recorded'
 * rows are the terminal state of recorded-difference rows, whose delivery IS prose
 * and which therefore never register) and a registrar exists under its id. A
 * 'ported' row with no registrar is NOT registered and NOT counted — the
 * summary line then reads `<r>/<N>` with `<r>` below the ported count, which is
 * the honest reading of "the manifest claims a port this tree cannot register".
 * The boot never claims success it did not achieve.
 *
 * KEY SHAPE — when T5 fills this record, each entry stays a one-liner over its
 * `src/tools/<id>.ts` (or `src/team/<id>.ts`) module: the module owns the
 * semantics (and its attribution header), this file owns exactly the facts it
 * must not duplicate — the row's manifest id and nothing else. Keep the record
 * in MANIFEST ROSTER ORDER (manifest.ts's row order is the coverage baseline's
 * read order); the order is pinned by tests/omo-team/boot-markers.test.ts.
 */
export const TEAM_REGISTRARS: Record<string, TeamRegistrar> = {
  // P5-T5 · ① §1 行 1（manifest.ts 行序 = 本表读序，boot-markers.test.ts 钉）。
  team_create: (ctx) => registerTeamCreateSurface(ctx, { subagents: ctx.subagents, store: teamStateStore }),
}

/**
 * The registration loop, exported so its loud-but-non-fatal behaviour is
 * unit-testable with a fake registry while `apply()` keeps the one-argument
 * cordis entry-point signature (a test-only second parameter on apply would be a
 * production seam for no production caller — the omo-hooks / omo-commands
 * precedent).
 *
 * Contract, in order:
 *   1. `validateManifest(entries)` — a broken roster logs the ONE
 *      `manifest validation FAILED` line and returns; NO summary line, NO
 *      registrations (loud-but-non-fatal: dsh keeps booting, and cold-start /
 *      the probe fail on the missing `[omo-team] loaded` marker).
 *   2. one iteration per roster row, in roster order: skip rows that are not
 *      'ported' (nothing to register yet — 'recorded' rows deliver prose) and
 *      rows with no registrar; otherwise run the registrar inside its OWN
 *      try/catch and log exactly one `registered` or `FAILED` line. A throw
 *      never stops the loop, so "one surface bad" can never mean "the rest
 *      never registered".
 *   3. the summary marker LAST — it reports the loop's outcome (`<r>/<N>`), so
 *      it cannot be printed before the loop has run (the omo-commands ORDER note
 *      in boot-markers.ts: consumers grep by prefix, never by position).
 *
 * FIBER REVERSIBILITY (discipline ①). A registrar that registers through a dsh
 * service gets its disposal from that service's own fiber wiring; only a
 * registrar that RETURNS a raw disposer reaches `ctx.effect` here — and the
 * forwarding arrow must RETURN the disposer and never CALL it (cordis runs the
 * effect's execute callback immediately and collects its RETURN value as the
 * fiber's disposal, Fiber#_execute — the omo-commands measured note applies
 * unchanged).
 */
export function runTeamRegistrations(
  ctx: TeamRegistrationContext,
  entries: readonly TeamManifestEntry[],
  registrars: Readonly<Record<string, TeamRegistrar>>,
  log: (line: string) => void,
): void {
  try {
    validateManifest(entries)
  } catch (err) {
    log(formatManifestValidationFailedLine(err))
    return
  }
  const registered: TeamManifestEntry[] = []
  for (const entry of entries) {
    if (entry.status !== 'ported') continue
    const register = registrars[entry.id]
    if (register === undefined) continue
    try {
      const disposer = register(ctx, entry)
      // Register, never invoke: cordis runs this execute callback right now and
      // collects what it RETURNS as the fiber's disposal, so the arrow must
      // return `disposer`. Calling it inline would dispose at registration time;
      // returning undefined would leave the fiber nothing to dispose. The
      // `ctx.effect` half of this guard cannot be false on a real fiber — cordis's
      // fiber mixin provides `effect` on every ctx — so this mirrors the two
      // precedents' identical implicit fallback.
      if (typeof disposer === 'function' && typeof ctx.effect === 'function') {
        ctx.effect(() => disposer)
      }
      registered.push(entry)
      log(formatTeamSurfaceRegisteredLine(entry.id))
    } catch (err) {
      log(formatTeamSurfaceFailedLine(entry.id, err))
    }
  }
  log(formatLoadedSummaryLine(entries, registered))
}

/**
 * The plugin entry point: wire the real manifest, the real (empty, at P5-T3)
 * registry and the loop above. Everything observable from boot is produced by
 * unit-tested functions, so this stays assembly-only and the markers cannot
 * drift from their tests.
 *
 * A correct P5-T5 boot logs TWO lines from this plugin — the per-surface
 * `registered` line for `team_create` (the loop's first real registration) and
 * the summary line carrying the honest `1/24` — and nothing else: no FAILED
 * line, no validation line. (At P5-T3 it logged exactly ONE line, the summary
 * with the loop's honest zero, because the registry was empty; the flip is the
 * marker the probe re-derives without an edit.)
 */
export function apply(ctx: TeamRegistrationContext): void {
  const log = (line: string): void => {
    console.log(line)
  }
  runTeamRegistrations(ctx, TEAM_MANIFEST, TEAM_REGISTRARS, log)
}
