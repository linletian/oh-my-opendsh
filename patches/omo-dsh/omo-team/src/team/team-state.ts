// team-state.ts — P5-T5 · team 状态机骨架（**纯内存、零 ctx、零 io**）。
//
// ── 语义移植声明（SEMANTIC PORT, NOT A COPY）────────────────────────────────
// 上游源路径（署名，OMO tag v4.19.4 = commit b072d279110bdda2c6ac2525d0d24dc54d16148a，
// PRE-3 冻结基线；逐字原文已入证据档）：
//   - packages/team-core/src/types.ts —— RuntimeStateSchema（:181-188）/
//     RuntimeStateMemberSchema（:159-173）/ RuntimeStateMemberModelSchema
//     （:135-149）/ RuntimeBoundsSchema（:175-181）/ ShutdownRequestSchema
//     （:159-166 区段）/ RuntimeStateTmuxLayoutSchema（:168-174 区段）/
//     RUNTIME_STATUSES（:16-24）。本文件**不 import zod、不抄 schema 代码**：
//     形状以 TypeScript interface 逐字段镜像，枚举由 `as const` 数组派生
//     （本仓词表派生纪律，manifest.ts / member-validator.ts 同款）。
//     逐字段语义对齐的证据 = .omo/evidence/p5t1/Q1b-teamcore-teammd.md
//     §C-2.4（两份 schema 的逐字转录在档）。
//   - packages/team-core/src/team-state-store/store.ts —— 迁移合法性表
//     ALLOWED_RUNTIME_TRANSITIONS（:15-23 逐字：creating→{active,failed}、
//     active→{shutdown_requested,deleting}、shutdown_requested→{deleting}、
//     deleting→{deleted}、deleted/failed/orphaned→∅）与 isValidTransition
//     （:115-119：同态放行 + **任意态→orphaned 放行**）——语义逐字对齐，
//     证据 = Q1a-tools-lifecycle.md §5.3（store 行段转录在档）。
//   - packages/senpi-task/src/team/normalize.ts:14 —— `TEAM_LEAD_SENTINEL =
//     "lead"`：lead 的称谓词汇（「the current senpi session is always the
//     lead sentinel… NEVER a spawnable member」的同一常量）。本仓 lead 恒为
//     创建者会话（fork (B) 裁定 + Q1a §4 runtime.ts:39-45 引文），sentinel
//     词汇照搬成本仓导出常量，成员名单里永远没有它。
//   - packages/team-core/src/team-state-store/store.ts:13 ——
//     STALE_DELETING_TTL_MS = 60_000 的「deleting 超时清」语义**不**随本
//     文件承载（回收属持久化域，随 T8 vendored store 落地；v1 内存态无
//     stale 概念——进程死即全清，差异见下方「持久化接缝」段）。
//
// ── v1 承载范围（任务书 P5-T5 钉死）────────────────────────────────────────
// 状态**形状**声明为上游全形状（tmuxLayout / model / color / worktreePath /
// lastInjectedTurnMarker / pendingInjectedMessageIds / shutdownRequests 逐枚
// 在册），v1 **承载**的只有 T5 用得上的子集：
//   * tmuxLayout：类型在册、永不赋值（D4 不采 tmux；字段留白是形状事实）。
//   * model：由三件套路径（roster-seats.ts）落 descriptor，状态行不重复承载
//     路由值——descriptor 是路由的事实源，状态机不建第二事实源。
//   * shutdownRequests：T7 起由握手工具层写入（request/approve/reject 三段
//     账本方法见下方「关停握手账」段；上游 shutdown.ts 只动本数组与成员
//     status、不改团队 status 的同纪律随行）。
//   * pendingInjectedMessageIds：恒空数组直至 T6（消息面注入账本）。
// 上游 strict() 的「多余字段即拒」由 TypeScript 的 closed interface 承担
// （无 zod——差异记此）。
//
// ── 持久化接缝（T8 vendored state-store 换持久化，写死不留白）──────────────
// 本类是**内存形态的 store**：T8 把 team-core harness-neutral 子集
// （team-state-store 除 reservation-reconciliation.ts，active-resume.ts 按
// FORK.md §3.3 删 reconcileMemberReservations 调用后 vendor）落
// patches/omo-dsh/vendor/team-core/ 后，本类的**方法签名不变**，方法体内接
// vendored store 的 load/save/withLock（锁+锁内重读+再校验迁移合法性三段序
// 随 vendor 件自然获得）。接缝纪律：
//   * 一切读写必须走本类方法——调用方（T5 team-create / T6 消息 / T7 关停）
//     不触内部 Map，否则换持久化时会出现旁路。
//   * randomUUID() 的 teamRunId 与上游同（store.ts createRuntimeState 亦
//     randomUUID）；换持久化后 id 语义不变。
//   * 上游「进程外可见」（state.json 跨进程 resume）在 v1 内存形态下**不
//     成立**——嵌套闸与索引只覆盖本进程生命周期，差异随 T8 落地翻正
//     （交卷回报 NOTES 同步登记）。
//
// ── 索引（三张 Map，全部方法内维护）─────────────────────────────────────────
//   * byTeamRunId：teamRunId → 状态（上游 state.json 一 run 一目录的内存镜像）。
//   * byLeadSession：lead sessionId → teamRunId（lead 参与账，嵌套闸的 lead 半）。
//   * byMemberSession：member sessionId → {teamRunId, memberName}（成员参与账，
//     嵌套闸的成员半 + 工具面按角色分发的身份来源）。成员行在 startContinuable
//     **之前**以预留 childId 入册（ContinuableStartSpec.childId 的「durable
//     parent record provisioning before child materialization」语义，
//     dsh-subagent types.d.ts:26-44 区段）——agent/created 事件到达时索引必须
//     已在场，这是按角色分发不竞态的唯一办法。
//
// 本文件不 import 任何其他 omo 包（边界纪律，index.ts 头部成文）；只 import
// node:crypto（randomUUID，上游同款运行时）。

import { randomUUID } from 'node:crypto'

/**
 * 七态词表，上游 RUNTIME_STATUSES（types.ts:16-24）逐字镜像。顺序即上游
 * 声明序——生命周期图、日志与覆盖基线的读序都跟这个序走。
 */
export const TEAM_RUNTIME_STATUSES = [
  'creating',
  'active',
  'shutdown_requested',
  'deleting',
  'deleted',
  'failed',
  'orphaned',
] as const

/** team run 生命周期状态（派生自词表，不手抄）。 */
export type TeamRuntimeStatus = (typeof TEAM_RUNTIME_STATUSES)[number]

/**
 * 成员六态词表，上游 RuntimeStateMemberSchema.status（types.ts:151 枚举）
 * 逐字镜像。本仓字段名用 `phase`（任务书 P5-T5 钉死的形状命名）——语义 =
 * 上游 `status`：pending=已入册未启动 / running=有活跃 turn / idle=turn 间
 * 驻留（正常态非异常，member guidance 两版同口径）/ errored / completed /
 * shutdown_approved（T7 握手终态）。
 */
export const TEAM_MEMBER_PHASES = [
  'pending',
  'running',
  'idle',
  'errored',
  'completed',
  'shutdown_approved',
] as const

/** 成员阶段（派生自词表）。 */
export type TeamMemberPhase = (typeof TEAM_MEMBER_PHASES)[number]

/**
 * lead 称谓 sentinel——上游 packages/senpi-task/src/team/normalize.ts:14
 * `export const TEAM_LEAD_SENTINEL = "lead"` 的语义移植：lead 的**称谓**是
 * 常量而非可 spawn 的席位；成员通信语境里 'lead' 指创建者会话（本仓 lead 恒
 * 为当前会话，Q1a §4 / FORK.md §3.2）。
 */
export const TEAM_LEAD_SENTINEL = 'lead'

/** 状态版本号：上游 `version: z.literal(1)` 的镜像（types.ts:182）。 */
export const TEAM_RUNTIME_STATE_VERSION = 1

/**
 * 单条消息 payload 上限，上游 team_mode 配置 `message_payload_max_bytes`
 * （Q1a §7 / Q1b :391 逐字：`z.number().int().min(1024).default(32768)`）的
 * **同名常量默认值**——v1 不可配置（配置面随 T8 vendored config 落地，差异
 * 记此），执法在 tools/team-message.ts 的 PayloadTooLarge 臂（上游
 * PayloadTooLargeError「payload exceeds 32 KB」语义，send.ts §8 错误族在档）。
 */
export const TEAM_MESSAGE_PAYLOAD_MAX_BYTES = 32768

/**
 * 消息可投递的成员阶段（v1 词表收窄，记差异）：上游 mailbox 的收件人合法集
 * = activeMembers + reservedRecipients + leadRecipient（send.ts:82-90，Q1a §8
 * 在档）——「active」在上游是成员注册账语义。(B) 形态没有独立成员注册账，
 * 活跃判定落在本状态骨架的 phase 上：**running（在途 turn）与 idle（turn 间
 * 驻留/离线，Q-5b：原生 coldResume 把缺席成员原样唤醒）两态可收件**；
 * pending（startContinuable 未竟，无稳定收件身份）、errored / completed /
 * shutdown_approved（终态或准终态，T7 前除握手域外无人写入）拒收——
 * `unknown or inactive team recipient: <name>` 具名（上游 InvalidRecipientError
 * 语义逐字承载，send.ts:46-51）。**idle 写入方待 T9**：当前无生产者写
 * idle（v1 的 phase 写入面只产 pending/running/终态族），常量实际等价
 * {running}——'idle' 是为 cold-resume 驻留语义预置的席位，不是现役投递面。
 */
export const TEAM_MESSAGE_DELIVERABLE_PHASES: ReadonlySet<TeamMemberPhase> = new Set<TeamMemberPhase>([
  'running',
  'idle',
])

/**
 * 「可删成员」阶段集——上游 shutdown-helpers.ts:7-11 `DELETABLE_MEMBER_STATUSES`
 * （completed | shutdown_approved | errored，Q1a §4 步 5 逐字词表）的语义移植；
 * 本仓成员阶段字段名为 `phase`（TEAM_MEMBER_PHASES 注的同一改名理由），词表
 * 三值逐字同上游。执法面 = tools/team-delete.ts 的非 force 臂（`members still
 * active` 具名拒，delete-team.ts:74-76 语义）。
 */
export const TEAM_DELETABLE_MEMBER_PHASES: ReadonlySet<TeamMemberPhase> = new Set<TeamMemberPhase>([
  'completed',
  'shutdown_approved',
  'errored',
])

/**
 * force 强删时可翻 completed 的成员阶段——上游 delete-team.ts:33-37
 * `FORCE_COMPLETABLE_MEMBER_STATUSES`（pending|running|idle）逐字词表移植。
 * 执法面 = tools/team-delete.ts 的 force 臂（先 force-complete 活跃成员再拆，
 * 上游同序）。
 */
export const TEAM_FORCE_COMPLETABLE_MEMBER_PHASES: ReadonlySet<TeamMemberPhase> = new Set<TeamMemberPhase>([
  'pending',
  'running',
  'idle',
])

/**
 * 握手「未决」判定：approvedAt 与 rejectedAt 双双缺位 = 请求仍悬挂。上游
 * shutdown.ts:24-28（request 幂等臂）与 :71-73（approve 幂等臂）用的就是这
 * 一对 undefined 检查；本函数把同一判定收成一处，调用方不再手抄。
 */
export function isShutdownRequestPending(request: TeamShutdownRequest): boolean {
  return request.approvedAt === undefined && request.rejectedAt === undefined
}

/**
 * bounds 默认五值，上游 RuntimeBoundsSchema（types.ts:175-181）逐字同值：
 * 8 / 4 / 10000 / 120 / 500。v1 只有 maxMembers 被 team_create 执行链
 * **实际执法**（成员数上限在 team-spec.ts 解析层同值双闸）；其余四枚是
 * 形状事实 + T6/T7 的执法锚。**执法面差异**：T6 消息域 v1 仅执法 payload
 * 32 KB（team-message.ts 的 PayloadTooLarge 臂）；`maxMessagesPerRun`
 * （10000/run）v1 不执法，差异记此（Q1a §7 对账口径；team-message.ts
 * 文件头差异段同词登记）。
 */
export const TEAM_RUNTIME_BOUNDS_DEFAULTS = {
  maxMembers: 8,
  maxParallelMembers: 4,
  maxMessagesPerRun: 10000,
  maxWallClockMinutes: 120,
  maxMemberTurns: 500,
} as const

/** 状态行的模型子形状，上游 RuntimeStateMemberModelSchema 全形状镜像。 */
export interface TeamRuntimeStateMemberModel {
  readonly providerID: string
  readonly modelID: string
  readonly variant?: string
  readonly reasoningEffort?: string
  readonly temperature?: number
  readonly top_p?: number
  readonly maxTokens?: number
  readonly thinking?: {
    readonly type: 'enabled' | 'disabled'
    readonly budgetTokens?: number
  }
}

/**
 * 成员状态行：上游 RuntimeStateMemberSchema 全形状镜像（sessionId/tmux 两枚/
 * subagent_type/category/model/color/worktreePath/injection 账本逐枚在册），
 * 加两枚本仓语义字段：
 *   * `seat`：名册席 id（本仓路由身份；上游 subagent_type/category 是它的
 *     OMO 载体，v1 两者并存——category 保留调用方原词，seat 是解析产物）。
 *   * `phase`：即上游 `status`（改名理由见 TEAM_MEMBER_PHASES 注）。
 * agentType 上游枚举 leader|general-purpose：(B) 形态成员恒 general-purpose
 * （lead 是 sentinel 不入成员名单），字段承载常量是形状忠实而非冗余。
 */
export interface TeamRuntimeStateMember {
  readonly name: string
  readonly seat: string
  readonly sessionId?: string
  readonly phase: TeamMemberPhase
  readonly agentType: 'leader' | 'general-purpose'
  readonly subagent_type?: string
  readonly category?: string
  readonly model?: TeamRuntimeStateMemberModel
  readonly tmuxPaneId?: string
  readonly tmuxGridPaneId?: string
  readonly color?: string
  readonly worktreePath?: string
  readonly lastInjectedTurnMarker?: string
  readonly pendingInjectedMessageIds: readonly string[]
}

/** 关停请求行：上游 ShutdownRequestSchema 全形状镜像（T7 前恒空集）。 */
export interface TeamShutdownRequest {
  readonly memberId: string
  readonly requesterName: string
  readonly requestedAt: number
  readonly approvedAt?: number
  readonly rejectedReason?: string
  readonly rejectedAt?: number
}

/** tmux 布局行：上游 RuntimeStateTmuxLayoutSchema 全形状镜像（D4：永不赋值）。 */
export interface TeamRuntimeStateTmuxLayout {
  readonly ownedSession: boolean
  readonly targetSessionId: string
  readonly focusWindowId?: string
  readonly gridWindowId?: string
  readonly paneIds?: readonly string[]
}

/** bounds 行：上游 RuntimeBoundsSchema 全形状镜像（五值全必填）。 */
export interface TeamRuntimeBounds {
  readonly maxMembers: number
  readonly maxParallelMembers: number
  readonly maxMessagesPerRun: number
  readonly maxWallClockMinutes: number
  readonly maxMemberTurns: number
}

/**
 * team run 状态：上游 RuntimeStateSchema（types.ts:181-188）全形状镜像。
 * `specSource` 上游枚举 project|user：v1 只有 inline spec，恒 'user'
 * （命名 spec = 记差异，manifest.ts team_create 行成文）。
 * `leadSessionId` 上游 optional：(B) 形态必填语义（lead 恒创建者会话），
 * 类型保持 optional 是形状忠实，store.create 的入参把它收为必填。
 */
export interface TeamRuntimeState {
  readonly version: 1
  readonly teamRunId: string
  readonly teamName: string
  readonly specSource: 'project' | 'user'
  readonly createdAt: number
  readonly status: TeamRuntimeStatus
  readonly leadSessionId?: string
  readonly tmuxLayout?: TeamRuntimeStateTmuxLayout
  readonly members: readonly TeamRuntimeStateMember[]
  readonly shutdownRequests: readonly TeamShutdownRequest[]
  readonly bounds: TeamRuntimeBounds
  /**
   * R-6 重投去重账（**非**上游 RuntimeStateSchema 字段——上游的去重住在
   * mailbox 的 messageId 唯一性里（DuplicateMessageIdError「duplicate message
   * id」，send.ts 错误族，Q1a §8 在档）；mailbox 本体不 vendor（FORK.md
   * §3.3），去重账遂借本状态骨架承载，执法在 tools/team-message.ts）。
   * 记的是**已受理投递**的消息 id（correlationId ?? 生成 uuid）。
   * 持久化接缝（文件头成文的同一纪律）：T8 vendored store 换持久化时此账
   * 随 state.json 落盘；v1 内存态进程死即清——「同 id 重投」的保证域 =
   * 本进程生命周期，差异记此（与上游跨进程去重的差距，NOTES 同步登记）。
   */
  readonly processedMessageIds: readonly string[]
  /**
   * briefing 注入账（**非**上游字段，与 processedMessageIds 同一待遇——
   * 上游无此账：briefing 在上游随 spawn 一次性进 prompt 语境，(B) 形态的
   * briefing 是 agent/created 监听里的独立注入帧，而 agent/created 在冷启
   * wake 重物化时会**再fire**（T6 实测 frameCount:2 的实证，任务书
   * P5-T6 NOTES-7），于是需要一个「这个成员注过没有」的账）。记的是
   * **已注入 briefing 的成员名**；执法面 = tools/team-create.ts 的 briefing
   * 臂（claimBriefingInjection 原子「查+记」，重复物化跳过重注；注入抛错
   * 走 releaseBriefingInjection 退账——未送达不占幂等位，与
   * releaseShutdownRequest 同一不变量）。
   * 键域 = 本 run 内成员名（teamRunId 已是状态行的行键，成员名在行内唯一，
   * 上游 RuntimeStateMemberSchema 同名多行不存在——去重键的充分性在此）。
   * 持久化接缝与去重账同一条：T8 换持久化随 state.json 落盘；v1 内存态
   * 保证域 = 本进程生命周期（差异记此）。
   */
  readonly briefingInjectedMembers: readonly string[]
}

/**
 * 迁移合法性表：上游 ALLOWED_RUNTIME_TRANSITIONS（store.ts:15-23）逐字语义
 * 镜像——creating→{active,failed}（首败回滚走 failed，任务书 P5-T5 / Q1a §4
 * spawn-members 首败回滚）；active→{shutdown_requested,deleting}；
 * shutdown_requested→{deleting}；deleting→{deleted}；deleted/failed/orphaned
 * 为终态（∅）。
 */
export const ALLOWED_TEAM_RUNTIME_TRANSITIONS: Readonly<Record<TeamRuntimeStatus, ReadonlySet<TeamRuntimeStatus>>> = {
  creating: new Set<TeamRuntimeStatus>(['active', 'failed']),
  active: new Set<TeamRuntimeStatus>(['shutdown_requested', 'deleting']),
  shutdown_requested: new Set<TeamRuntimeStatus>(['deleting']),
  deleting: new Set<TeamRuntimeStatus>(['deleted']),
  deleted: new Set<TeamRuntimeStatus>([]),
  failed: new Set<TeamRuntimeStatus>([]),
  orphaned: new Set<TeamRuntimeStatus>([]),
}

/**
 * 迁移判定：同态放行 + 任意态→orphaned 放行（上游 isValidTransition
 * store.ts:115-119 的三条短路逐字语义）+ 表查。orphaned 全源放行是上游
 * 「孤儿收养」入口（进程重启后失联 run 的归宿），v1 内存态无人调用但表语义
 * 保持上游完整。
 */
export function isValidTeamRuntimeTransition(from: TeamRuntimeStatus, to: TeamRuntimeStatus): boolean {
  if (from === to) return true
  if (to === 'orphaned') return true
  return ALLOWED_TEAM_RUNTIME_TRANSITIONS[from].has(to)
}

/**
 * 上游 gating 的 ACTIVE_RUNTIME_STATUSES（team-tool-gating/hook.ts:11）：
 * creating|active|shutdown_requested 三态算「还活着的 run」。
 */
export const ACTIVE_TEAM_RUNTIME_STATUSES: ReadonlySet<TeamRuntimeStatus> = new Set<TeamRuntimeStatus>([
  'creating',
  'active',
  'shutdown_requested',
])

/**
 * 状态机错误：上游 RuntimeStateError（store.ts:25-31）的 code 族镜像——
 * 具名 code + 具名 message，调用方（工具层）决定把哪段冒给模型。
 */
export class TeamStateError extends Error {
  // 显式字段 + 构造体内赋值，而非 TS 参数属性（`constructor(readonly code)`）：
  // dsh 的 cordis 装载走 node 原生 type-stripping（strip-only），参数属性在其中
  // 是 `not supported in strip-only mode`，会让 omo-team 整个插件 import 失败。
  // 语义逐字等价——同名字段、同值、同 readonly——只是把声明从参数搬到字段。
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'TeamStateError'
    this.code = code
  }
}

/** 参与身份（嵌套闸的并集判定；lead/member 两臂）。 */
export type TeamParticipation =
  | { readonly role: 'lead'; readonly teamRunId: string }
  | TeamMemberParticipation

/** 成员参与身份（byMemberSession 索引的唯一值；工具面按角色分发消费）。 */
export interface TeamMemberParticipation {
  readonly role: 'member'
  readonly teamRunId: string
  readonly memberName: string
}

/** team_create 入册用的成员计划行（childId = 预留 durable 子会话 id）。 */
export interface TeamMemberProvisioning {
  readonly name: string
  readonly seat: string
  readonly category?: string
  readonly childId: string
}

/** create 入参。`now` 仅供测试注入时钟；生产不传（Date.now()）。 */
export interface TeamRunCreateInput {
  readonly teamName: string
  readonly leadSessionId: string
  readonly members: readonly TeamMemberProvisioning[]
  readonly bounds?: Partial<TeamRuntimeBounds>
  readonly now?: number
}

/**
 * 内存状态机。方法即持久化接缝（文件头「持久化接缝」段成文）；一切违规
 * 具名抛 TeamStateError，不静默。
 */
export class TeamStateMemoryStore {
  private readonly statesByTeamRunId = new Map<string, TeamRuntimeState>()
  private readonly teamRunIdByLeadSession = new Map<string, string>()
  private readonly participationByMemberSession = new Map<string, TeamMemberParticipation>()

  /** 创建 run：status='creating'，成员行以预留 childId 入册（phase='pending'，
   * 成员索引**先于**任何 startContinuable 在场——按角色分发不竞态的前提）。
   * @throws TeamStateError TEAM_NAME_REQUIRED / MEMBER_PROVISIONING_REQUIRED /
   *         BOUNDS_VIOLATION / DUPLICATE_LEAD（同一 lead 已有未终态 run——
   *         嵌套闸的存储层半，工具层文案在 team-create.ts）。 */
  create(input: TeamRunCreateInput): TeamRuntimeState {
    if (input.teamName.length === 0) {
      throw new TeamStateError('team_create requires a non-empty team name', 'TEAM_NAME_REQUIRED')
    }
    if (input.members.length === 0) {
      throw new TeamStateError('team_create requires at least one member provisioning row', 'MEMBERS_EMPTY')
    }
    const bounds: TeamRuntimeBounds = { ...TEAM_RUNTIME_BOUNDS_DEFAULTS, ...input.bounds }
    if (input.members.length > bounds.maxMembers) {
      throw new TeamStateError(
        `team '${input.teamName}' exceeds max ${bounds.maxMembers} members`,
        'BOUNDS_VIOLATION',
      )
    }
    const leadConflict = this.participantOf(input.leadSessionId)
    if (leadConflict !== undefined) {
      throw new TeamStateError(
        `team_create denied: session is already a participant of team ${leadConflict.teamRunId}`,
        'ALREADY_PARTICIPANT',
      )
    }
    const teamRunId = randomUUID()
    const state: TeamRuntimeState = {
      version: TEAM_RUNTIME_STATE_VERSION,
      teamRunId,
      teamName: input.teamName,
      specSource: 'user',
      createdAt: input.now ?? Date.now(),
      status: 'creating',
      leadSessionId: input.leadSessionId,
      members: input.members.map((member) => ({
        name: member.name,
        seat: member.seat,
        sessionId: member.childId,
        phase: 'pending' as TeamMemberPhase,
        agentType: 'general-purpose' as const,
        ...(member.category === undefined ? {} : { category: member.category }),
        pendingInjectedMessageIds: [],
      })),
      shutdownRequests: [],
      bounds,
      processedMessageIds: [],
      briefingInjectedMembers: [],
    }
    this.statesByTeamRunId.set(teamRunId, state)
    this.teamRunIdByLeadSession.set(input.leadSessionId, teamRunId)
    for (const member of state.members) {
      this.participationByMemberSession.set(member.sessionId as string, {
        role: 'member',
        teamRunId,
        memberName: member.name,
      })
    }
    return state
  }

  /** 按 teamRunId 取状态（副本语义：返回冻结引用，行不可原地改——写全走方法）。 */
  get(teamRunId: string): TeamRuntimeState | undefined {
    return this.statesByTeamRunId.get(teamRunId)
  }

  /** lead 参与账查询。 */
  teamOfLead(leadSessionId: string): TeamRuntimeState | undefined {
    const teamRunId = this.teamRunIdByLeadSession.get(leadSessionId)
    return teamRunId === undefined ? undefined : this.statesByTeamRunId.get(teamRunId)
  }

  /** 成员参与账查询（按角色分发的事件里查身份；只可能命中 member 臂）。
   * 不按状态过滤是刻意的：本查询是**诊断面**（终态 run 的账要能被诊断查见，
   * 如首败回滚后 failed 账仍可读），非分发依据——分发处的状态闸在
   * team-create.ts 的 agent/created 成员臂（ACTIVE_TEAM_RUNTIME_STATUSES）。 */
  participationOfMember(memberSessionId: string): TeamMemberParticipation | undefined {
    return this.participationByMemberSession.get(memberSessionId)
  }

  /**
   * 嵌套闸谓词：该会话是否已是任何未终态 run 的参与者（lead 或 member）。
   * 上游对应物 = gating hook 的 participant.role !== 'neither'（hook.ts:102-
   * 108）——含 lead 本人：上游 lead 也计入 participant，同会话二次 team_create
   * 同样被拒（这是 'team-nested-create-denied' 具名文案的真实触发路径）。
   * 终态 run（deleted/failed/orphaned）的账目已随 forgetRun 清账，不再拦。
   */
  participantOf(sessionId: string): TeamParticipation | undefined {
    const asMember = this.participationByMemberSession.get(sessionId)
    if (asMember !== undefined) {
      const state = this.statesByTeamRunId.get(asMember.teamRunId)
      if (state !== undefined && ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) return asMember
    }
    const leadRunId = this.teamRunIdByLeadSession.get(sessionId)
    if (leadRunId !== undefined) {
      const state = this.statesByTeamRunId.get(leadRunId)
      if (state !== undefined && ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) {
        return { role: 'lead', teamRunId: leadRunId }
      }
    }
    return undefined
  }

  /**
   * 生命周期迁移：isValidTeamRuntimeTransition 把关，非法迁移具名抛
   * INVALID_TRANSITION（上游 transitionRuntimeState 的「再校验迁移合法性」
   * 一步语义，锁与落盘随 T8 接入）。同态迁移放行（上游同）。
   */
  transition(teamRunId: string, toStatus: TeamRuntimeStatus): TeamRuntimeState {
    const state = this.requireState(teamRunId)
    if (!isValidTeamRuntimeTransition(state.status, toStatus)) {
      throw new TeamStateError(
        `illegal team runtime transition ${state.status} -> ${toStatus} for team ${teamRunId}`,
        'INVALID_TRANSITION',
      )
    }
    return this.replaceState(teamRunId, { ...state, status: toStatus })
  }

  /**
   * 成员阶段迁移：只认六态词表；行不存在具名抛。v1 由 team_create 在
   * startContinuable 成功点置 'running'；idle/errored/completed 的实时同步
   * 属 T6/T9 域（内存骨架先承载形状——上游 phases 全在册）。
   */
  setMemberPhase(teamRunId: string, memberName: string, phase: TeamMemberPhase): TeamRuntimeState {
    const state = this.requireState(teamRunId)
    if (!TEAM_MEMBER_PHASES.includes(phase)) {
      throw new TeamStateError(
        `unknown member phase '${phase}' for member '${memberName}' of team ${teamRunId}`,
        'UNKNOWN_MEMBER_PHASE',
      )
    }
    let found = false
    const members = state.members.map((member) => {
      if (member.name !== memberName) return member
      found = true
      return { ...member, phase }
    })
    if (!found) {
      throw new TeamStateError(
        `team ${teamRunId} has no member '${memberName}' — phase update has no carrier`,
        'MEMBER_NOT_FOUND',
      )
    }
    return this.replaceState(teamRunId, { ...state, members })
  }

  /**
   * R-6 去重账查询（只读；调用方 = tools/team-message.ts 的诊断/断言面）。
   * 一切写入走 markMessageProcessed——查与记不拆成两次调用是给业务面的，
   * 这个方法存在的理由是观测，不是判重。
   */
  hasProcessedMessage(teamRunId: string, messageId: string): boolean {
    return this.requireState(teamRunId).processedMessageIds.includes(messageId)
  }

  /**
   * 原子「查+记」（R-6 去重闸的账本体）：未见过该 id → 入账并返回 true
   * （放行投递）；见过 → 不入账返回 false（去重拒投）。原子性在内存形态下
   * 由单线程事件循环天然成立；换持久化（T8 vendored store）时落进 withLock
   * 的锁内重读三段序——方法签名不变，锁语义随 vendor 件获得（接缝注见
   * 文件头）。
   * **先记后投**（reservation 语义）：并发同 id 的两个调用只有一个能拿到
   * true——先入账才去碰原生通道，「不重复投递」才不是查与投之间的竞态空话。
   * 单投递失败时由调用方 unmarkMessageProcessed 补偿退账（从未送达的消息
   * 不该被「已送达」的账拦住）；广播部分失败**不退**（宁漏不重，差异在
   * team-message.ts 文件头成文）。
   */
  markMessageProcessed(teamRunId: string, messageId: string): boolean {
    const state = this.requireState(teamRunId)
    if (state.processedMessageIds.includes(messageId)) return false
    this.replaceState(teamRunId, {
      ...state,
      processedMessageIds: [...state.processedMessageIds, messageId],
    })
    return true
  }

  /**
   * 补偿退账（reservation 的回执作废）：单收件人投递抛错后把预约退掉，
   * 同 id 重试才可能真正送达——「duplicate」判定的事实源是「已受理/已送达」，
   * 不是「已尝试」。广播的部分失败**不调用本方法**（整条消息一个账，退了
   * 会对已收到的成员重投——宁漏不重的裁决见 team-message.ts 文件头）。
   */
  unmarkMessageProcessed(teamRunId: string, messageId: string): void {
    const state = this.requireState(teamRunId)
    if (!state.processedMessageIds.includes(messageId)) return
    this.replaceState(teamRunId, {
      ...state,
      processedMessageIds: state.processedMessageIds.filter((id) => id !== messageId),
    })
  }

  /**
   * briefing 注入账的原子「查+记」（P5-T6 NOTES-7 治理的账本体，T7 落地）：
   * 未注过该成员 → 入账返回 true（briefing 臂可注）；已注 → 不入账返回 false
   * （agent/created 重放/冷启重物化时的跳过依据）。原子性与 markMessageProcessed
   * 同一论证（单线程事件循环；T8 换持久化落 withLock 锁内重读）。
   * 键 = (teamRunId, memberName)（行内唯一性见 TeamRuntimeState
   * .briefingInjectedMembers 注）——**v1 无「同名成员换新 sessionId 重开」
   * 的路径**（参与索引一名一 sessionId，成员身份 = 名字）；若将来出现该
   * 路径（T8/T9），新会话**须重新武装该账**——要么先 releaseBriefingInjection
   * 退账再重注，要么把键升级为 (run, name, sessionId) 三元；改动落在这里，
   * 不在调用方打补丁。
   */
  claimBriefingInjection(teamRunId: string, memberName: string): boolean {
    const state = this.requireState(teamRunId)
    if (state.briefingInjectedMembers.includes(memberName)) return false
    this.replaceState(teamRunId, {
      ...state,
      briefingInjectedMembers: [...state.briefingInjectedMembers, memberName],
    })
    return true
  }

  /**
   * briefing 注入账退账（reservation 的回执作废，与 unmarkMessageProcessed /
   * releaseShutdownRequest 同一族、同一不变量：**未送达不占幂等位**）——
   * agent.inject 抛错时把该成员的账撤掉，下一次物化（agent/created 重放/
   * 冷启重物化）claimBriefingInjection 才能再入账再投。briefing 是常驻
   * 纪律，「注入抛错」≠「已注入」；已送达的账**不该由本方法撤**——调用方
   * 只在 inject 抛错的臂上退账（送达是事实，撤了会对同一成员重注，briefing
   * 恰好一次的治理反被破坏）。执法方 = tools/team-create.ts 的 briefing 臂。
   */
  releaseBriefingInjection(teamRunId: string, memberName: string): void {
    const state = this.requireState(teamRunId)
    if (!state.briefingInjectedMembers.includes(memberName)) return
    this.replaceState(teamRunId, {
      ...state,
      briefingInjectedMembers: state.briefingInjectedMembers.filter((name) => name !== memberName),
    })
  }

  /**
   * briefing 注入账查询（只读诊断面——判重走 claimBriefingInjection，与
   * hasProcessedMessage/markMessageProcessed 的同一分工）。
   */
  hasBriefingInjected(teamRunId: string, memberName: string): boolean {
    return this.requireState(teamRunId).briefingInjectedMembers.includes(memberName)
  }

  // ── 关停握手账（P5-T7；上游 team-runtime/shutdown.ts 的账本半）───────────
  // 三段方法只动 shutdownRequests 数组 + 成员 phase——**不改团队 status**
  // （上游 shutdown.ts 同纪律：request/approve/reject 全程不迁移团队态，
  // `shutdown_requested` 团队态在 v4.19.4 由别的写者产生，握手不产——
  // Q1a §5 对账在档）。执法方 = tools/team-shutdown.ts。

  /** 握手账查询：该成员最近一条请求（上游 findLatestShutdownRequestIndex
   *  :58-66 的倒序扫描语义——**最新一条**，含已批/已拒；无 = undefined）。 */
  latestShutdownRequest(teamRunId: string, memberId: string): TeamShutdownRequest | undefined {
    const requests = this.requireState(teamRunId).shutdownRequests
    for (let index = requests.length - 1; index >= 0; index -= 1) {
      if (requests[index]!.memberId === memberId) return requests[index]
    }
    return undefined
  }

  /**
   * 握手请求入账（上游 requestShutdownOfMember shutdown.ts:13-55 的账本
   * 语义）：**幂等**——该成员有未决请求（approvedAt/rejectedAt 双缺）则
   * 原样返回 alreadyPending=true，不追加行（询问消息的「不重发」由调用方
   * 依据本返回值短路——上游同构：幂等臂在 sendMessage 之前）。无未决 →
   * 追加 {memberId, requesterName, requestedAt} 行。resolved（已批/已拒）
   * 的旧请求**永不挡新请求**（上游倒序找未决的同一语义）。
   */
  requestShutdown(
    teamRunId: string,
    memberId: string,
    requesterName: string,
    now?: number,
  ): { alreadyPending: boolean; request: TeamShutdownRequest } {
    const state = this.requireState(teamRunId)
    if (!state.members.some((member) => member.name === memberId)) {
      throw new TeamStateError(
        `unknown member '${memberId}' — shutdown request has no carrier`,
        'UNKNOWN_MEMBER',
      )
    }
    const pending = this.latestShutdownRequest(teamRunId, memberId)
    if (pending !== undefined && isShutdownRequestPending(pending)) {
      return { alreadyPending: true, request: pending }
    }
    const request: TeamShutdownRequest = {
      memberId,
      requesterName,
      requestedAt: now ?? Date.now(),
    }
    this.replaceState(teamRunId, { ...state, shutdownRequests: [...state.shutdownRequests, request] })
    return { alreadyPending: false, request }
  }

  /**
   * 握手请求退账（reservation 的回执作废，与 unmarkMessageProcessed 同一
   * 族）：询问帧投递失败时把该成员**最新一条未决**行撤掉，让「重试 request」
   * 可再入账再投递——上游 send→record 序里 send 抛则账上无痕的等价承载
   * （(B) 形态把幂等判定做成原子 claim，失败面遂以退账补偿；保证域同：
   * 未送达的请求不占幂等位）。已批/已拒的行**不撤**（resolved 是事实）。
   */
  releaseShutdownRequest(teamRunId: string, memberId: string): void {
    const state = this.requireState(teamRunId)
    const index = state.shutdownRequests.reduce(
      (found: number, row: TeamShutdownRequest, i: number) =>
        row.memberId === memberId && isShutdownRequestPending(row) ? i : found,
      -1,
    )
    if (index < 0) return
    this.replaceState(teamRunId, {
      ...state,
      shutdownRequests: state.shutdownRequests.filter((_, i) => i !== index),
    })
  }

  /**
   * 握手批准入账（上游 approveShutdown shutdown.ts:57-107 的账本语义逐字）：
   *   * 该成员**无任何请求** → 具名抛 `shutdown request missing for '<name>'`
   *     （上游 :63-65 的文案逐字承载，Q1a §5.2 在档）；
   *   * 最新请求已批（approvedAt 在场）→ 幂等返回 alreadyApproved=true，
   *     不重发结果帧（上游 :68-70 的同一早退）；
   *   * 否则：approvedAt 落账 + 成员 phase 翻 shutdown_approved——
   *     **completed/errored 保留终态**（上游 :79-86 的 map 臂逐字：这两态
   *     原样返回），pending/running/idle 一律翻（上游同）。
   */
  approveShutdown(
    teamRunId: string,
    memberName: string,
    now?: number,
  ): { alreadyApproved: boolean; memberPhaseFlipped: boolean; request: TeamShutdownRequest; approvedAt: number } {
    const state = this.requireState(teamRunId)
    const latest = this.latestShutdownRequest(teamRunId, memberName)
    if (latest === undefined) {
      throw new TeamStateError(`shutdown request missing for '${memberName}'`, 'SHUTDOWN_REQUEST_MISSING')
    }
    if (latest.approvedAt !== undefined) {
      return { alreadyApproved: true, memberPhaseFlipped: false, request: latest, approvedAt: latest.approvedAt }
    }
    const stampedAt = now ?? Date.now()
    const request: TeamShutdownRequest = { ...latest, approvedAt: stampedAt }
    const indexOfLatest = state.shutdownRequests.lastIndexOf(latest)
    let memberPhaseFlipped = false
    const members = state.members.map((member) => {
      if (member.name !== memberName || member.phase === 'completed' || member.phase === 'errored') {
        return member
      }
      memberPhaseFlipped = true
      return { ...member, phase: 'shutdown_approved' as TeamMemberPhase }
    })
    this.replaceState(teamRunId, {
      ...state,
      members,
      shutdownRequests: state.shutdownRequests.map((row, index) => (index === indexOfLatest ? request : row)),
    })
    return { alreadyApproved: false, memberPhaseFlipped, request, approvedAt: stampedAt }
  }

  /**
   * 握手拒绝入账（上游 rejectShutdown shutdown.ts:109-148 的账本语义逐字）：
   *   * 无请求 → 同一具名抛（上游 :116-118 同文案）；
   *   * 最新请求**同 reason 已拒** → 幂等返回 alreadyRejected=true（上游
   *     :122-124 的 `rejectedAt !== undefined && rejectedReason === reason`
   *     判定逐字）；不同 reason 再拒 = 上游放行的**重拒**（落新 reason），
   *     本账随行（上游 mailbox 此时会再发一帧——(B) 形态工具层同判：
   *     alreadyRejected=false，调用方重投结果帧）；
   *   * 批准/未决态被拒 → 落 rejectedAt + rejectedReason（approvedAt 若
   *     在场保留——上游 map 的 spread 同形，两枚时间戳可共存是上游事实，
   *     判序读时间戳）。
   * 拒绝**不动成员 phase**（team 存活语义：成员继续跑，Q1a §5.2 reject 段）。
   */
  rejectShutdown(
    teamRunId: string,
    memberName: string,
    reason: string,
    now?: number,
  ): { alreadyRejected: boolean; request: TeamShutdownRequest } {
    const state = this.requireState(teamRunId)
    const latest = this.latestShutdownRequest(teamRunId, memberName)
    if (latest === undefined) {
      throw new TeamStateError(`shutdown request missing for '${memberName}'`, 'SHUTDOWN_REQUEST_MISSING')
    }
    if (latest.rejectedAt !== undefined && latest.rejectedReason === reason) {
      return { alreadyRejected: true, request: latest }
    }
    const request: TeamShutdownRequest = { ...latest, rejectedAt: now ?? Date.now(), rejectedReason: reason }
    const indexOfLatest = state.shutdownRequests.lastIndexOf(latest)
    this.replaceState(teamRunId, {
      ...state,
      shutdownRequests: state.shutdownRequests.map((row, index) => (index === indexOfLatest ? request : row)),
    })
    return { alreadyRejected: false, request }
  }

  /**
   * force 臂的成员预清账（上游 delete-team.ts:114-123 语义）：force 强删时
   * 把 TEAM_FORCE_COMPLETABLE_MEMBER_PHASES（pending|running|idle）的成员
   * 翻 completed，返回翻动名单。非 force **不调用本方法**（DELETABLE 门禁
   * 在工具层先行，`members still active` 具名拒）。
   */
  forceCompleteMembers(teamRunId: string): readonly string[] {
    const state = this.requireState(teamRunId)
    const flipped: string[] = []
    const members = state.members.map((member) => {
      if (!TEAM_FORCE_COMPLETABLE_MEMBER_PHASES.has(member.phase)) return member
      flipped.push(member.name)
      return { ...member, phase: 'completed' as TeamMemberPhase }
    })
    this.replaceState(teamRunId, { ...state, members })
    return flipped
  }

  /**
   * force 旁路入 deleting（上游 delete-team.ts:133-140 的 saveRuntimeState
   * 旁路语义）：**仅** force 执法方在 FORCE_BYPASS_DELETING_STATUSES
   * （creating|orphaned，delete-team.ts:39 逐字）上调用——这两态在迁移表上
   * 不通向 deleting（creating→{active,failed}、orphaned→∅），上游遂以
   * 「直接 save 绕表」承载强拆；本方法把同一旁路收窄成显式命名的入口，
   * 其余来源具名拒（INVALID_TRANSITION 族）。同态放行（已在 deleting）。
   */
  forceTransitionToDeleting(teamRunId: string): TeamRuntimeState {
    const state = this.requireState(teamRunId)
    if (state.status === 'deleting') return state
    if (state.status !== 'creating' && state.status !== 'orphaned') {
      throw new TeamStateError(
        `illegal force-deleting bypass from ${state.status} for team ${teamRunId}`,
        'INVALID_TRANSITION',
      )
    }
    return this.replaceState(teamRunId, { ...state, status: 'deleting' })
  }

  /**
   * deleted 后的参与索引清账（上游 unregisterTeamSessionsByTeam
   * delete-team.ts:190 的语义移植）：**状态行保留**（deleted tombstone——
   * 「deleted 后团队具名不可再用」的具名拒依据，tools 层对 deleted 行抛
   * TEAM_DELETED 族），lead/成员的**参与索引**撤账——v1 内存形态下
   * participantOf/participationOfMember 的状态闸已让 tombstone 不拦路，
   * 本方法是同一语义的显式收口（T8 换持久化后随目录删除自然成立）。
   */
  retireRunIndexes(teamRunId: string): void {
    const state = this.statesByTeamRunId.get(teamRunId)
    if (state === undefined) return
    if (state.leadSessionId !== undefined && this.teamRunIdByLeadSession.get(state.leadSessionId) === teamRunId) {
      this.teamRunIdByLeadSession.delete(state.leadSessionId)
    }
    for (const member of state.members) {
      if (member.sessionId === undefined) continue
      const indexed = this.participationByMemberSession.get(member.sessionId)
      if (indexed !== undefined && indexed.teamRunId === teamRunId) {
        this.participationByMemberSession.delete(member.sessionId)
      }
    }
  }

  /**
   * 清账（T7 team_delete 的内存半语义先备；T5 首败回滚只翻 failed 不清账——
   * failed 账目保留给诊断，上游 listActiveTeams 顺带清 stale 的语义随 T8）。
   */
  forgetRun(teamRunId: string): void {
    const state = this.statesByTeamRunId.get(teamRunId)
    if (state === undefined) return
    this.statesByTeamRunId.delete(teamRunId)
    if (state.leadSessionId !== undefined) this.teamRunIdByLeadSession.delete(state.leadSessionId)
    for (const member of state.members) {
      if (member.sessionId !== undefined) this.participationByMemberSession.delete(member.sessionId)
    }
  }

  /** 活跃 run 清单（上游 listActiveTeams 的内存镜像：gating 三态）。 */
  listActive(): readonly TeamRuntimeState[] {
    return [...this.statesByTeamRunId.values()].filter((state) => ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status))
  }

  /** 全量清单（仅诊断/单测用；业务面走 listActive/participantOf）。 */
  listAll(): readonly TeamRuntimeState[] {
    return [...this.statesByTeamRunId.values()]
  }

  private requireState(teamRunId: string): TeamRuntimeState {
    const state = this.statesByTeamRunId.get(teamRunId)
    if (state === undefined) {
      throw new TeamStateError(`no team run '${teamRunId}' in the team state store`, 'TEAM_NOT_FOUND')
    }
    return state
  }

  private replaceState(teamRunId: string, next: TeamRuntimeState): TeamRuntimeState {
    this.statesByTeamRunId.set(teamRunId, next)
    return next
  }
}

/**
 * 进程单例：apply() 的 team_create registrar 与 agent/created 分发共用同一
 * 实例（换持久化时这里换成 vendored store 的构造，调用方零改动）。
 */
export const teamStateStore = new TeamStateMemoryStore()
