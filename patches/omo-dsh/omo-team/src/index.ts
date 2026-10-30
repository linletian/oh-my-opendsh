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
  formatTeamBootResumeLine,
  formatTeamSurfaceFailedLine,
  formatTeamSurfaceRegisteredLine,
} from './boot-markers.ts'
// P5-T5: the first real registrar's module pair — the state machine (pure,
// host-singleton) and the team_create surface (tool + agent/created dispatch).
// P5-T6: the message surface (team_send_message + its own agent/created
// dispatch) lands the second row through the same door.
import { teamStateStore } from './team/team-state.ts'
import {
  recordTeamRowRegistered,
  resetTeamRegistrationOutcome,
} from './team/team-registration-outcome.ts'
import {
  registerTeamCreateSurface,
  type TeamAgent,
  type TeamContinuableChannel,
} from './tools/team-create.ts'
import {
  registerTeamMessageSurface,
  type TeamLiveAgents,
  type TeamMessageSendChannel,
} from './tools/team-message.ts'
// P5-T7: the shutdown handshake trio (request/approve/reject), the teardown
// row (team_delete) and the status query row (team_status) land through the
// same door — five registrars, three files (one file may own several manifest
// rows; the row↔registrar map is one row per registrar, not one per file).
import {
  registerTeamApproveShutdownSurface,
  registerTeamRejectShutdownSurface,
  registerTeamShutdownRequestSurface,
} from './tools/team-shutdown.ts'
import { registerTeamDeleteSurface } from './tools/team-delete.ts'
import { registerTeamStatusSurface } from './tools/team-status.ts'
// P5-T8b: the task-board quartet (create/list/update/get) — thin shells over
// the vendored team-tasklist, UNIVERSAL per the upstream gating roster; one
// registrar per row, four subscriptions, four disposers (the registration loop's
// one-row-per-registrar discipline keeps the `<r>/<N>` census honest).
import {
  TEAM_TASK_CREATE_TOOL_NAME,
  TEAM_TASK_GET_TOOL_NAME,
  TEAM_TASK_LIST_TOOL_NAME,
  TEAM_TASK_UPDATE_TOOL_NAME,
  registerTeamTaskSurface,
} from './tools/team-task.ts'
// P5-T8b: the vendored state-store换装's boot pair — persistence rebuild +
// resumeAllTeams through the session-context adapter (the OMO-shaped client
// ↔ DSH ctx.agents boundary, documented in session-context-adapter.ts).
import { buildTeamSessionContext } from './team/session-context-adapter.ts'
// P5-T9 · manifest 行 ⑰ `stop-continuation-team` 的 omo-team 半：guard 消费的
// 只读成员查询面（跨包纪律——omo-hooks 不 import omo-team，走 cordis 服务面；
// 取消动作本身住在 omo-hooks 的 guard，见 tools 侧注册行注与
// team/team-stop-continuation.ts 头注）。
import { registerTeamStopContinuationQuerySurface } from './team/team-stop-continuation.ts'
// P5-T12 · 行 ⑭/㉔ 的两个 registrar（team-keyword-slot.ts 与
// team-prompts-vendor.ts 头注：跨包零 import，消费侧本地字面量 + 单测交叉钉）。
import { registerTeamKeywordInjectionFace } from './team/team-keyword-slot.ts'
import { registerTeamPromptsVendorSurface } from './team/team-prompts-vendor.ts'
// P5-T15 · 行 ⑱–㉓ 六枚 `vendor-team-core-*` 的 registrar（team-core-vendor.ts
// 头注：字节的家在 vendor/team-core/（T8a），消费在 T8b 的薄壳与持久化换装；
// 本包这一侧的可见半 = **逐行启动完整性把门 + 档案脸**，一行一张脸六个服务名。
// 翻行的同 commit 义务就在这张脸上——注册循环只挂 'ported' 且有 registrar 的行，
// 探针的派生面对「ported 而无 registrar」响亮判红，六枚 registrar 因此随行落地。
import { registerTeamCoreVendorRowSurface } from './team/team-core-vendor.ts'
// P5-T13 · 行 ⑮/⑯ 的两个 registrar（team-tool-presence.ts 头注：完整对抗评审环
// 与 team-mode addendum 的模板正文住在 omo-commands，本包只发**在场探测脸**——
// 跨包零 import，消费侧本地字面量 + 单测交叉钉，`omoTeamMemberQuery` 同族）。
import {
  registerHyperplanUpgradePresenceFace,
  registerRemoveAiSlopsAddendumPresenceFace,
} from './team/team-tool-presence.ts'
// P5-T14 · 门 4：插件 row Config（dsh Config 契约形态，team-row-config.ts 头注
// 两臂——cordis 宿主 `~standard.validate` + doctor-lite `new Schema(config)`）。
// 消费链在 apply 的第二参数（cordis 把校验后的 config 递进来，
// @deepseek-ai/cordis lib/index.js:1071）→ row-config 单例 → team_create 的
// spec 成员上限。缺省 = MAX_TEAM_MEMBERS（vendored 硬顶，行为零漂移）。
import {
  Config as TeamRowConfigSchema,
  currentTeamRowConfig,
  setTeamRowConfig,
  type TeamRowConfig,
} from './team/team-row-config.ts'

export const name = 'omo-team'

/**
 * P5-T14（门 4）：the plugin's row Config — re-exported from
 * team-row-config.ts so the cordis loader picks it up (`plugin.Config`,
 * @deepseek-ai/cordis lib/index.js:1631) and doctor-lite check 4's sweep of
 * the repo's own cordis.yml rows VALIDATES against it (checked face, no
 * longer unchecked). `{ maxMembers?: number }`, default 8 = the vendored
 * hard cap (team-spec.ts's MAX_TEAM_MEMBERS pointer, upstream validator.ts:5
 * 同名同值) — the knob tightens, never loosens past the vendored byte-frozen
 * ceiling. Consumed for real: apply(ctx, config) below feeds the row-config
 * singleton, and the `team_create` registrar reads it into its spec cap.
 */
export const Config = TeamRowConfigSchema
export type { TeamRowConfig }

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
 * 'agents' joins the list AT P5-T6: the message registrar reads the live
 * agent registry through it (lead relay + residency observation), never
 * caching an Agent beyond the call that looked it up.
 */
export const inject = ['subagents', 'agents'] as const

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
 * commit. P5-T6 EXERCISES IT AGAIN: `agents` is REQUIRED now (the
 * `team_send_message` registrar resolves the live lead agent through
 * `ctx.agents.get` for the member-to-member lead relay, and observes target
 * residency at send time), and `inject = ['subagents', 'agents']` goes up in
 * THIS commit — the same pair discipline, the same proof on this host
 * (q5b-seat-plugin declared `inject = ['agents', 'subagents', 'tools']` and
 * read `ctx.agents.get` live). The T3 paragraph's WHY-NO-INJECT reasoning
 * stays true of T3 and is kept for the record: declaring an `inject` the loop
 * could not yet register through would park the fiber in `waiting`, swallow
 * the `[omo-team] loaded` marker, and redden every mount gate on an installed
 * plugin — the pair (the first registrar that needs a service + its `inject`
 * entry) is the only legal moment to widen, and T5 was that moment for `on` +
 * `subagents`; T6 is that moment for `agents`.
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
   *
   * P5-T6 widens the SAME service object with `sendMessage` (the adjacent
   * delivery call of tools/team-message.ts) — an intersection over the two
   * structural subdeclarations, not a second service: dsh's `subagents` is
   * ONE service (dsh-subagent types/index.d.ts), and each consuming module
   * narrows the face it calls through (team-create.ts declared the T5
   * subset; team-message.ts declares the delivery subset).
   */
  readonly subagents: TeamContinuableChannel & TeamMessageSendChannel
  /**
   * The live Agent registry — PROMOTED TO REQUIRED AT P5-T6, declared in
   * `inject` in the same commit (the header's pair doctrine, exercised a
   * second time). The `team_send_message` registrar closes over this
   * registry and calls `get` at send time only: the member-to-member lead
   * relay resolves the live lead through it (the native channel's own
   * exact-live-sender check, dsh-subagent index.js:1763, reads the same
   * face), and every delivery observes target residency before sending
   * (the tool-level half of the Q-5b offline-wake canary). No Agent is
   * cached beyond the call that looked it up.
   */
  readonly agents: TeamLiveAgents
  /**
   * Cordis's service provider — PROMOTED TO PRESENT-DECLARED AT P5-T9: the
   * `stop-continuation-team` registrar publishes the read-only member query
   * surface the omo-hooks stop-continuation guard consumes through its own
   * `ctx.get` (the cross-package discipline of the row: omo-hooks never
   * imports omo-team; the `omoStopContinuation` provider/consumer pair is the
   * verbatim precedent, mirrored here in the other direction). Typed OPTIONAL
   * like `get`/`effect` for the same reason — the structural host contract of
   * this interface — and the registrar answers its absence with a named throw,
   * which the registration loop turns into the row's own FAILED line: a row
   * that could not publish does not register and is not counted.
   */
  readonly provide?: (name: string, service: unknown) => unknown
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
  team_create: (ctx) => registerTeamCreateSurface(ctx, { subagents: ctx.subagents, store: teamStateStore, maxMembers: currentTeamRowConfig().maxMembers }),
  // P5-T7 · ② §1 行 2：拆除面——interrupt（保 inbox）+ drain 走 subagents
  // 的 T5 臂，lead 活体经 agents 注册表取，状态迁移/清账走同一骨架。
  team_delete: (ctx) => registerTeamDeleteSurface(ctx, { subagents: ctx.subagents, agents: ctx.agents, store: teamStateStore }),
  // P5-T7 · ③④⑤ §1 行 3/4/5：关停握手三件——询问/结果帧走 sendMessage
  // 臂（Q-8 B1 原生 kind），握手账走 team-state.ts 的三段账法。
  team_shutdown_request: (ctx) => registerTeamShutdownRequestSurface(ctx, { subagents: ctx.subagents, store: teamStateStore }),
  team_approve_shutdown: (ctx) => registerTeamApproveShutdownSurface(ctx, { subagents: ctx.subagents, store: teamStateStore }),
  team_reject_shutdown: (ctx) => registerTeamRejectShutdownSurface(ctx, { subagents: ctx.subagents, store: teamStateStore }),
  // P5-T6 · ⑥ §1 行 6：消息面——同一 subagents 服务的 sendMessage 臂 +
  // 活体 agents 注册表（lead 中转/驻留观测）+ 同一状态骨架（去重账）。
  team_send_message: (ctx) => registerTeamMessageSurface(ctx, { subagents: ctx.subagents, agents: ctx.agents, store: teamStateStore }),
  // P5-T8b · ⑦⑧⑨⑩ §1 行 7/8/9/10：任务板四件——四行各自一个 registrar
  // 位（一 registrar 一行的注册循环纪律，marker 的 `<r>/<N>` 因此诚实计四），
  // 同一 tools/team-task.ts 的薄壳面（vendored team-tasklist 的接线点单
  // 在 store；claim 路由 = status:'claimed' → vendored claimTask，上游
  // tasks.ts:128-130 的同一岔口）。UNIVERSAL 双面（上游 gating hook.ts:12-19
  // 名单含四枚 team_task_*，Q1a §3 逐字在档）。
  team_task_create: (ctx) => registerTeamTaskSurface(ctx, { store: teamStateStore }, TEAM_TASK_CREATE_TOOL_NAME),
  team_task_list: (ctx) => registerTeamTaskSurface(ctx, { store: teamStateStore }, TEAM_TASK_LIST_TOOL_NAME),
  team_task_update: (ctx) => registerTeamTaskSurface(ctx, { store: teamStateStore }, TEAM_TASK_UPDATE_TOOL_NAME),
  team_task_get: (ctx) => registerTeamTaskSurface(ctx, { store: teamStateStore }, TEAM_TASK_GET_TOOL_NAME),
  // P5-T7 · ⑪ §1 行 11：查询面——纯读骨架（UNIVERSAL 双面），tasks 段的
  // T8 接缝在 tools/team-status.ts 文件头成文。行号按名册行序（manifest.ts
  // 的 24 条目读序，team_status 是第 11 条）——plan §1 表格把 task_list/
  // task_get 合一行，表格口径此行为第 10 行，manifest.ts 行注保持表格口径，
  // 两套锚各按各的序，逐枚可对（评审 T7-MINOR 的裁决面）。
  team_status: (ctx) => registerTeamStatusSurface(ctx, { store: teamStateStore, agents: ctx.agents }),
  // P5-T12 · ⑭ §3 行 1：team 关键词槽的 omo-team 可见半 = 启动期把门面
  // （vendored team.md 对 VENDOR-MANIFEST sha pin 核验 + 槽位机读契约
  // patternSource/injectionKind/memberSideAllowed=false 发布；注入动作的
  // nativeFace 在 omo-hooks 的 keyword-detector，跨包零 import，字面量
  // 交叉等值由单测钉死）。行号按名册行序（manifest.ts 第 14 条）。
  'team-keyword-injection': (ctx) => registerTeamKeywordInjectionFace(ctx),
  // P5-T13 · ⑮ §3 行 2：hyperplan 完整对抗评审环升级——本行在 omo-team 侧的
  // 可见半 = /hyperplan 消费的**在场探测脸**（ctx.provide 上线，fiber 收编；
  // 完整环模板正文与切换判断住在 omo-commands，跨包零 import，服务名交叉等值
  // 由单测钉死——`omoTeamMemberQuery` 的 R-5 同族）。在场判据从 TEAM_MANIFEST
  // 派生，不硬编码（team-tool-presence.ts 头注）。行号按名册行序（第 15 条）。
  'hyperplan-upgrade': (ctx) => registerHyperplanUpgradePresenceFace(ctx),
  // P5-T13 · ⑯ §3 行 3：remove-ai-slops 的 team-mode addendum 升级——本行在
  // omo-team 侧的可见半 = 同一枚在场快照的**另一张脸**（一行一处置：消费半
  // 各走各的服务名，快照同源）；addendum 正文住在 omo-commands。行号按名册
  // 行序（第 16 条）。
  'remove-ai-slops-team-addendum': (ctx) => registerRemoveAiSlopsAddendumPresenceFace(ctx),
  // P5-T9 · ⑰ §行 17：stop-continuation 的 team 分支——本行在 omo-team 侧的
  // 可见半 = guard 消费的只读成员查询面（ctx.provide 上线，fiber 收编）；
  // 取消动作的 nativeFace 在 omo-hooks 的 guard（跨包纪律：两侧零 import，
  // 服务名交叉等值由单测钉死）。行号按名册行序（manifest.ts 第 17 条）。
  'stop-continuation-team': (ctx) => registerTeamStopContinuationQuerySurface(ctx, { store: teamStateStore }),
  // P5-T15 · ⑱–㉓ §3.3 vendor 子集六行：team-core 字节的**逐行启动完整性把门**
  // （VENDOR-MANIFEST pin 逐枚 sha 对账，漂移 = 抛具名错 = 该行 FAILED）+ 逐行
  // 只读档案脸（六个服务名，team-core-vendor.ts 头注：一 registrar 一行、一行一
  // 张脸，census 因此诚实计六）。字节的家在 vendor/team-core/（T8a 落地），消费
  // 在 T8b（任务板薄壳 + 持久化换装）——本包这一侧不重打文件清单：核验集从
  // 行自身的 upstreamSources 剥前缀派生（manifest 少一行/多一行直接改变核验集）。
  // 行号按名册行序（manifest.ts 第 18/19/20/21/22/23 条）。
  'vendor-team-core-types': (ctx, entry) => registerTeamCoreVendorRowSurface(ctx, entry),
  'vendor-team-core-member-parser': (ctx, entry) => registerTeamCoreVendorRowSurface(ctx, entry),
  'vendor-team-core-team-registry': (ctx, entry) => registerTeamCoreVendorRowSurface(ctx, entry),
  'vendor-team-core-team-tasklist': (ctx, entry) => registerTeamCoreVendorRowSurface(ctx, entry),
  'vendor-team-core-team-state-store': (ctx, entry) => registerTeamCoreVendorRowSurface(ctx, entry),
  'vendor-team-core-closure': (ctx, entry) => registerTeamCoreVendorRowSurface(ctx, entry),
  // P5-T12 · ㉔ §3.3 vendor 行：prompts-team 两项文本的完整性把门（manifest
  // 在册文件逐枚 sha 核验，漂移 = 抛具名错 = 该行 FAILED）+ lead 运行协议
  // 档案面（teamModeTsText，T13 升级面的读取锚）。注入正文的盘读在 omo-hooks
  // ——一行一处置：这里把门与档案，不在这里路由正文。行号按名册行序（第 24 条）。
  'vendor-team-prompts': (ctx) => registerTeamPromptsVendorSurface(ctx),
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
  // P5-T16 (评审 MINOR-7): 本次 boot 的注册结果集清零——在场面读的是**事实**
  // （哪些行真的注册上了），不是 manifest 的**声明**（status:'ported'）。
  resetTeamRegistrationOutcome()
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
      // P5-T16 (评审 MINOR-7): 成功注册的行 id 进「本次 boot 实际注册」集——
      // 在场探测面读它，而不是 manifest 的声明（某枚工具行 registrar 在 boot
      // 时抛错 ⇒ 该行没注册 ⇒ 在场判据必须翻 false，两条命令必须降级，
      // 而不是向模型宣称一批不存在的工具）。
      recordTeamRowRegistered(entry.id)
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
 * A correct P5-T15 boot logs TWENTY-TWO `registered` lines from this plugin — the
 * loop's landed rows in roster order (`team_create`, `team_delete`, the
 * shutdown trio, `team_send_message`, the task-board quartet added at T8b,
 * `team_status`, `team-keyword-injection`, the two command-upgrade presence
 * faces added at T13 (`hyperplan-upgrade`, `remove-ai-slops-team-addendum`),
 * the `stop-continuation-team`
 * query surface added at T9, the six `vendor-team-core-*` vendor integrity gates
 * added at T15 (rows ⑱–㉓ — bytes landed at T8a, consumed at T8b; the rows'
 * omo-team-visible half is the per-row vendor integrity gate, the same split as
 * row ㉔), `vendor-team-prompts` last) — then the summary
 * line carrying the honest `22/24`, then AT
 * MOST the resume lines of the persistence boot (below): no FAILED line, no
 * validation line. (At P5-T3 it logged exactly ONE line, the summary with the
 * loop's honest zero, because the registry was empty; T5/T6 grew it to two;
 * T7 grew it to seven; T8b grew it to eleven; T9 grew it to twelve; T12 grew
 * it to fourteen; T13 grew it to sixteen; T15 grew it to twenty-two; the flips
 * are the markers the probe re-derives without an edit.)
 *
 * PERSISTENCE BOOT (T8b换装): after the registration loop, the store rebuilds
 * its read mirror from disk and runs the vendored `resumeAllTeams` through
 * the session-context adapter (creating>30min→failed / liveness-checked
 * orphaning / terminal-dir sweep — upstream semantics verbatim, owned by the
 * vendored resume artifacts). The boot awaits nothing: `apply` stays
 * synchronous (the cordis contract), the async boot reports itself loudly —
 * a resume report line on success, a `[omo-team] boot resume FAILED` line
 * otherwise (loud-but-non-fatal, the registration loop's same discipline: a
 * dead disk must not mean a dead plugin; the mirror simply stays boot-empty).
 * Consumers grep by prefix (`[omo-team]`), never by position, so the extra
 * lines cannot break the loaded-marker contract.
 *
 * P5-T16 (评审 BLOCKER-1 更正): the adapter's existence predicate is the
 * DURABLE session face (`ctx.sessionQuery.observeSession`), not the live
 * registry alone. Upstream's `client.session.get()` answers "does a session
 * RECORD exist" (a cold session still exists); `ctx.agents.get()` answers "is
 * a live agent present". Mapping the second onto the first made every boot
 * orphan every persisted team — and, with it, wipe the members' `sessionId`
 * (`markDeadWorkersErrored` is irreversible). The adapter now reads both
 * faces: live hit → present; durable hit → present (cold); durable
 * NOT-FOUND → absent; unprovable (service absent / read failed) → present
 * (conservative: orphaning is terminal, keeping a run is recoverable).
 *
 * P5-T14 (门 4): the SECOND parameter is the cordis-resolved row config — the
 * host validates it against the exported `Config` (`~standard.validate`,
 * @deepseek-ai/cordis lib/index.js:957-961) and passes the result in
 * (lib/index.js:1071 `runtime.callback(this.ctx, this.config)`). It lands in
 * the row-config singleton (`setTeamRowConfig`, the write-point-unique
 * discipline) and from there reaches the `team_create` spec cap. A caller
 * that passes nothing (the unit-fake ctxs, any direct apply(ctx) call) gets
 * the defaults — maxMembers = MAX_TEAM_MEMBERS, the vendored hard cap, i.e.
 * today's behavior byte-for-byte.
 */
export function apply(ctx: TeamRegistrationContext, config?: unknown): void {
  // Row config first: the registration loop must not register a surface that
  // would read a stale config (there is exactly one write, right here).
  setTeamRowConfig(config)
  // P5-T16 (NIT-14): base_dir 的 env 读面与 row config **同一时点**生效——
  // 状态机的配置此刻重新解析（此前它在模块 import 期就读了 env，早于 apply）。
  teamStateStore.refreshConfig()
  const log = (line: string): void => {
    console.log(line)
  }
  runTeamRegistrations(ctx, TEAM_MANIFEST, TEAM_REGISTRARS, log)
  // Boot persistence pass — fire-and-forget by contract (apply is sync), loud
  // either way. The adapter maps the OMO-shaped session client onto DSH's
  // session-existence faces: the live ctx.agents registry AND the durable
  // ctx.sessionQuery surface (session-context-adapter.ts, boundary documented).
  // P5-T16 BLOCKER-1: the durable face is what makes "cold but existing"
  // (a continuable member after a restart) read as ALIVE — mapping the
  // question onto the live registry alone orphaned every persisted team on
  // every DSH boot and wiped the members' sessionId for good.
  teamStateStore
    .rebuildIndexes()
    .then(() => teamStateStore.resume(buildTeamSessionContext({ agents: ctx.agents, get: ctx.get })))
    .then((report) => {
      // The state machine's own boot answer (boot-markers.ts carries the
      // format contract; the probe derives its expectation from the shipped
      // formatter — never restates it here or there).
      log(formatTeamBootResumeLine(report))
      for (const issue of report.errors) {
        console.warn(`[omo-team] boot resume error: ${issue.message}`)
      }
    })
    .catch((err: unknown) => {
      console.warn(`[omo-team] boot resume FAILED (loud-but-non-fatal): ${err instanceof Error ? err.message : String(err)}`)
    })
}
