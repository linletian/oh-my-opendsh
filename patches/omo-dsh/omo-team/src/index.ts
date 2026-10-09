// @oh-my-opendsh/omo-team — Phase 5 team-mode plugin (plan §4.2; task P5-T2).
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
// the root cordis.yml will mount it as the FOURTH insert row at P5-T3
// (同步网 3→4 义务在那一任务全点位落地).
//
// WHAT P5-T2 DELIVERED AND WHAT P5-T3 ADDS. P5-T2 delivers the package shape
// plus manifest.ts (the single source of truth for WHICH team surfaces exist,
// each row carrying id / upstreamSources / nativeFace / disposition /
// e2eScenario / status / summary) behind an EMPTY apply() that imports nothing
// — the omo-commands P4-T2 precedent exactly. P5-T3 adds the mount itself:
// the registration-loop skeleton and the boot marker (`[omo-team] loaded: …`,
// the summary line derived from the manifest through `formatLoadedSummaryLine`
// there). The census (how many rows sit in each status / disposition) is
// deliberately NOT restated here — it moves as rows land; it is computed from
// TEAM_MANIFEST at boot and pinned by tests/omo-team/manifest.test.ts.
//
// NO IMPORTS IN THIS FILE — ON PURPOSE AT P5-T2. The omo-commands P4-T2
// precedent shipped the skeleton with zero imports so the empty apply() could
// not half-mount anything; this file keeps that. When T3+ add imports, the
// `.ts` extension is LOAD-BEARING: Node 24 type-stripping (P-8.6) does no
// specifier resolution and this workspace has no bundler to rewrite it (the
// no-build rationale itself is recorded in
// patches/omo-dsh/omo-team/tsconfig.host.json's header, lines 6-8).

// P5-T2 — cordis 插件的 apply() 装配面骨架（本仓的插件形态，同 omo-commands
// P4-T2 先例）。
// 署名声明（c16 原生总体）：本文件**无上游对应物**——v4.19.4 没有任何同职责的
// 模块（OMO 的 team 工具面住在 `packages/omo-opencode/src/features/team-mode/`，
// 其语义逐条署名在 src/manifest.ts 的行里，不在这里）。它是 DSH 侧的原生代码，
// 不是语义移植；宣称上游来源就是假署名。语义移植文件请带「UPSTREAM SOURCE +
// @ v4.19.4 + 移植声明」三件套。

export const name = 'omo-team'

/** A cordis-style disposal: what an effect's execute callback RETURNS to be collected. */
export type TeamDisposer = () => void

/**
 * Minimal structural typing for the surface apply() will touch from P5-T3 on —
 * declared here rather than imported from DSH for the reason in the header
 * (this workspace has no dsh dependency). EVERY member is OPTIONAL at P5-T2:
 * the skeleton reads nothing, and a required member would promise a mount that
 * P5-T3 has not built yet. T3 promotes what its loop actually calls
 * (the omo-commands `commands` promotion at P4-T3 is the precedent — including
 * the `inject` declaration and the loud-but-non-fatal failure path).
 */
export interface TeamRegistrationContext {
  /**
   * Cordis's OPTIONAL service lookup (`Context#get`). Team coordination runs
   * through the native `subagents` service (`startContinuable` / `sendMessage`,
   * FORK.md §3.2/§3.4); the consumer reads it per invocation, never caches it
   * at apply time. Typed `unknown` at P5-T2 on purpose — the loop's real
   * demand shapes this in T3+.
   */
  readonly get?: (name: string) => unknown
  /** cordis's fiber-scoped effect collector — reserved for a returned disposer. */
  readonly effect?: (execute: () => TeamDisposer | void) => unknown
}

/**
 * The EMPTY apply() — P5-T2 ships the shape, not the mount. It registers
 * nothing, injects nothing, and logs nothing: a correct boot of the mount-less
 * skeleton must stay silent, because the `[omo-team] loaded:` marker is P5-T3's
 * deliverable and a premature line would make cold-start's future grep pass on a
 * plugin that mounted nothing (the loud-but-non-fatal discipline starts where
 * the mount starts).
 */
export function apply(_context: TeamRegistrationContext): void {
  // Deliberately empty until P5-T3. See the header: WHAT P5-T2 DELIVERED.
}
