// team-state.ts — P5-T5 骨架 · **P5-T8b 持久化换装**（state.json 落盘 + 锁 + resume，
// 全部经 vendored team-state-store；双账走 omo 侧 sidecar，vendored schema 不改）。
//
// ── 语义移植声明（SEMANTIC PORT, NOT A COPY）────────────────────────────────
// 上游源路径（署名，OMO tag v4.19.4 = commit b072d279110bdda2c6ac2525d0d24dc54d16148a，
// PRE-3 冻结基线；逐字原文已入证据档）：
//   - packages/team-core/src/types.ts —— RuntimeStateSchema（:176-188）/
//     RuntimeStateMemberSchema（:135-149）/ RuntimeStateMemberModelSchema
//     （:121-133）/ RuntimeBoundsSchema（:151-157）/ ShutdownRequestSchema
//     （:159-166）/ RuntimeStateTmuxLayoutSchema（:168-174）/
//     RUNTIME_STATUSES（:16-24）。本文件**不 import zod、不抄 schema 代码**：
//     形状以 TypeScript interface 逐字段镜像，枚举由 `as const` 数组派生
//     （本仓词表派生纪律，manifest.ts / member-validator.ts 同款）。
//     落盘字节由 vendored RuntimeStateSchema 校验（store.ts validateRuntimeState
//     :106-116）——形状校验不再靠 TS 的 closed interface 独扛（T5 的差异注
//     「无 zod」随换装翻正）。
//   - packages/team-core/src/team-state-store/store.ts —— 迁移合法性表
//     ALLOWED_RUNTIME_TRANSITIONS（:15-23 逐字）与 isValidTransition
//     （:118-122：同态放行 + **任意态→orphaned 放行**）。T8b 起**表在本包
//     只留一份**：写面全部走 vendored transitionRuntimeState（:185-204，
//     withLock + 锁内 loadRuntimeState 重读 + validateRuntimeState +
//     isValidTransition + saveRuntimeState 的三段序），本文件的
//     ALLOWED_TEAM_RUNTIME_TRANSITIONS / isValidTeamRuntimeTransition 退为
//     **读侧词表镜像 + 工具层预检**（同一张上游表的两个指针，值不手抄——
//     上游表逐字镜像的纪律不变，执法在 vendored 件）。
//   - packages/team-core/src/team-state-store/resume.ts —— resumeAllTeams
//     （:16-86）逐字承载 resume 语义：creating 超 30min → failed
//     （CREATING_TIMEOUT_MS :13）；active 查 lead/worker 活性，全灭 →
//     orphaned（active-resume.ts :17-47）；deleting/deleted/failed 终态
//     目录清扫（deleting-resume.ts / cleanTerminalTeam）。本文件的
//     store.resume() 是它的薄接线点（Q-5b run C 型重启夹具的事实源）。
//   - packages/senpi-task/src/team/normalize.ts:14 —— `TEAM_LEAD_SENTINEL =
//     "lead"`：lead 的称谓词汇。本仓 lead 恒为创建者会话（fork (B) 裁定 +
//     Q1a §4 runtime.ts:39-45 引文），sentinel 词汇照搬成本仓导出常量，成员
//     名单里永远没有它；换装后它同时是 vendored TeamSpec.leadAgentId 的取值
//     （createRuntimeState :143 的 leader 行判定因此永不命中成员——(B) 形态
//     成员恒 general-purpose，同一裁决）。
//   - packages/team-core/src/team-state-store/store.ts:13 ——
//     STALE_DELETING_TTL_MS = 60_000 的「deleting 超时清」语义**随 vendored
//     件自然承载**（listActiveTeams :206-256 的清扫只在 resume 面被调用，
//     见下方「扫面纪律」）——v1 内存形态的「进程死即全清」差异注作废。
//
// ── 持久化落地（T8b 换装完成；T5 的「接缝」段作废，以下为现行为）────────────
//   * **单一寻址**：一切落盘经 vendored 件（createRuntimeState /
//     loadRuntimeState / saveRuntimeState / transitionRuntimeState /
//     withLock / atomicWrite / getRuntimeStateDir / resolveBaseDir），config
//     = team-config.ts 的唯一构造点（base_dir = 项目 .omo/teams/ 面，T8b
//     裁定钉死；沙箱宿主随 HOME 指针入箱）。
//   * **写面**：状态行的每一次变更 = vendored transitionRuntimeState 的
//     「锁 + 锁内重读 + 再校验迁移合法性」三段序（上游原样）；force 旁路 =
//     saveRuntimeState 直存（上游 delete-team.ts:133-140 的同一绕表通道，
//     收窄为 forceTransitionToDeleting 的显式命名入口，纪律不变）。
//   * **create() 双写窗口（T8b 双评审 NIT 登记）**：create() 对 state.json
//     做两次顺序写——先 createRuntimeState 落无 sessionId 成员行的初版
//     （:721，status='creating'），再 saveRuntimeState 补 member.sessionId
//     （:736，childId 预留值回填）。两次写之间死机 = 磁盘留下**成员无
//     sessionId** 的 creating 态。boot 后无害推理（双评审核实）：参与索引
//     重建对 sessionId===undefined 的成员行直接跳过（registerState :666 的
//     continue）；orphan/活性判定把无 sessionId 成员按 wasSpawned:false /
//     stillAlive:true 计（vendored session-liveness.ts:41-43），不误伤、
//     不误翻 errored；僵死 run 另有 creating 30min→failed 超时兜底
//     （creating-resume）。**挂账 T15**：评估初版直接携带 sessionId 的
//     单写可能（createRuntimeState 的 spec 成员无 sessionId 槽位——上游
//     形状所限，收窄需 deviation，是否值得由 T15 裁）。
//   * **读面**：内存镜像（mirror）服务同步读——镜像只在「持久化成功之后」
//     更新（每个 await 落定才 replaceState），boot 时由 rebuildIndexes() 从
//     磁盘整幅重建；因此**同进程内镜像恒等于最后一次落定字节**。跨进程写者
//     的可见域 = 本进程 boot 时刻（差异记此：上游每次读都 loadRuntimeState；
//     v1 宿主模型为单写者 + 重启重建，读面镜像不越过这个模型，NOTES 同步
//     登记）。写面不受镜像影响——map 函数在锁内吃的是**磁盘重读值**。
//   * **扫面纪律**：listActiveTeams 的终态目录清扫语义（store.ts:229-247）
//     只在 resumeAllTeams（= store.resume()）里被调用；常态读面用
//     rebuildIndexes()/mirror，deleted tombstone 因此**在进程存活期内可读**
//     （T7 的「deleted 是状态不是缺账」裁决保持），进程重启后随上游清扫
//     自然消失（同一上游语义的另一个面，两句都是真话）。
//   * **双账 sidecar（任务书钉死：omo 侧扩展面，vendored schema 不改）**：
//     processedMessageIds（R-6 去重账）与 briefingInjectedMembers（briefing
//     注入账）**不在** 上游 RuntimeStateSchema 里（:176-188 逐字无此二键；
//     顶层非 strict 只意味着 zod 会**静默剥掉**塞进来的多余键——落盘即失真，
//     所以不能塞）；同 rationale 成员行的 `seat` 也不能上 state.json
//     （RuntimeStateMemberSchema :135-149 是 `.strict()`，多余键即拒）。
//     三枚扩展住在 `<runtimeDir>/omo-team-extensions.json`（本包自有的
//     sidecar），读写走 vendored withLock + atomicWrite（`omo-team-extensions
//     .lock`，与 state.lock 分锁不嵌套）——**原子「查+记」自此跨进程成立**
//     （锁内重读 sidecar 再判再写；T5 注的「保证域=本进程」差异翻正）。
//     sidecar 损坏/缺失 → 空账重建 + 响亮 warn（briefing 可能重注一次，
//     诚实降级，差异记此）。
//   * **briefing 账键契约（P5-T7 遗留③，随持久化重申）**：账键 =
//     (teamRunId, memberName)。continuable 子会话的 childId 在 resume 中
//     保持稳定（Q-5b 实证），同 run 同名成员跨重启仍是同一账——**不解除、
//     不重注**；若将来出现「同名成员换新 sessionId 重开」路径，新会话须先
//     releaseBriefingInjection 退账再重新武装（升级点在本文件，不在调用方
//     打补丁）。
//
// ── 索引（两张 Map + 镜像，全部方法内维护）───────────────────────────────────
//   * mirror：teamRunId → 状态（已落定字节的内存镜像；同步读面）。
//   * teamRunIdByLeadSession：lead sessionId → teamRunId（lead 参与账）。
//   * participationByMemberSession：member sessionId → 参与行（成员参与账，
//     按角色分发的身份来源；boot 时随 rebuildIndexes() 从磁盘重建——
//     startContinuable 之前以预留 childId 入册的 T5 纪律不变）。
//
// 本文件不 import 任何其他 omo 包（边界纪律，index.ts 头部成文）；T8b 起
// import 依赖边上的 vendored 件（@oh-my-opencode/team-core/*，铁律允许）与
// node:crypto / node:fs/promises（清账面）。

import { randomUUID } from 'node:crypto'
import { rm, readdir, readFile } from 'node:fs/promises'
import { renameSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import path from 'node:path'

import { buildTeamModeConfig } from './team-config.ts'

import { getRuntimeStateDir, resolveBaseDir } from '@oh-my-opencode/team-core/team-registry'
import {
  claimTask,
  createTask,
  getTask,
  listTasks,
  updateTaskStatus,
} from '@oh-my-opencode/team-core/team-tasklist'
import {
  createRuntimeState,
  InvalidTransitionError,
  loadRuntimeState,
  RuntimeStateError,
  saveRuntimeState,
  transitionRuntimeState,
} from '@oh-my-opencode/team-core/team-state-store'
import { resumeAllTeams, type ResumeReport } from '@oh-my-opencode/team-core/team-state-store/resume'
import { atomicWrite, withLock } from '@oh-my-opencode/team-core/team-state-store/locks'
import type { RuntimeState, Task } from '@oh-my-opencode/team-core/types'
import type { TeamModeConfig } from '@oh-my-opencode/team-core/config'
import type { TeamSessionContext } from '@oh-my-opencode/team-core/session-client'

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
 * 「可清账」状态集（`forgetRun` 的闸）——**终态三态**。
 *
 * P5-T16（评审 NIT-13）：活跃 run 的账只能走 `team_delete`（三重闸）收；
 * 诊断面（`forgetRun`）只许擦终态 run 的 tombstone——否则任何能把
 * `teamRunId` 透传给它的消费面都能无声拆掉另一支队的账与任务板。
 */
export const TEAM_FORGETTABLE_STATUSES: ReadonlySet<TeamRuntimeStatus> = new Set<TeamRuntimeStatus>([
  'deleted',
  'failed',
  'orphaned',
])

/**
 * 成员六态词表，上游 RuntimeStateMemberSchema.status（types.ts:144 枚举）
 * 逐字镜像。本仓字段名用 `phase`（任务书 P5-T5 钉死的形状命名）——语义 =
 * 上游 `status`：pending=已入册未启动 / running=有活跃 turn / idle=turn 间
 * 驻留（正常态非异常，member guidance 两版同口径）/ errored / completed /
 * shutdown_approved（T7 握手终态）。换装后词表与 vendored 枚举**同值同序**，
 * 落盘映射 = 同名字段的键改名（phase↔status），值零翻译。
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
 * 为当前会话，Q1a §4 / FORK.md §3.2）。换装后另承载一处词汇事实：vendored
 * TeamSpec.leadAgentId 的取值（成员名单里没有 'lead'，leader 行判定因此
 * 恒不命中——(B) 形态的同一事实）。
 */
export const TEAM_LEAD_SENTINEL = 'lead'

/** 状态版本号：上游 `version: z.literal(1)` 的镜像（types.ts:177）。 */
export const TEAM_RUNTIME_STATE_VERSION = 1

/**
 * 单条消息 payload 上限，上游 team_mode 配置 `message_payload_max_bytes`
 * （Q1a §7 / Q1b :391 逐字：`z.number().int().min(1024).default(32768)`）的
 * **同名常量默认值**——执法在 tools/team-message.ts 的 PayloadTooLarge 臂
 * （上游 PayloadTooLargeError「payload exceeds 32 KB」语义，send.ts §8 错误族
 * 在档）。换装后 config.message_payload_max_bytes 同值在场（vendored zod
 * 默认），本常量是工具层的稳定指针，config 是落盘面的同一值——两处指针，
 * 一个上游事实。
 */
export const TEAM_MESSAGE_PAYLOAD_MAX_BYTES = 32768

/**
 * 消息可投递的成员阶段（v1 词表收窄，记差异）：上游 mailbox 的收件人合法集
 * = activeMembers + reservedRecipients + leadRecipient（send.ts:82-90，Q1a §8
 * 在档）——「active」在上游是成员注册账语义。(B) 形态没有独立成员注册账，
 * 活跃判定落在本状态骨架的 phase 上：**running（在途 turn）与 idle（turn 间
 * 驻留/离线，Q-5b：原生 coldResume 把缺席成员原样唤醒）两态可收件**；
 * pending（startContinuable 未竟，无稳定收件身份）、errored / completed /
 * shutdown_approved（终态或准终态）拒收——`unknown or inactive team
 * recipient: <name>` 具名（上游 InvalidRecipientError 语义逐字承载，
 * send.ts:46-51）。**idle 写入方待 T9**：当前无生产者写 idle（v1 的 phase
 * 写入面只产 pending/running/终态族），常量实际等价 {running}——'idle' 是为
 * cold-resume 驻留语义预置的席位，不是现役投递面。
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
 * bounds 默认五值，上游 RuntimeBoundsSchema（types.ts:151-157）逐字同值：
 * 8 / 4 / 10000 / 120 / 500。**换装后的事实**：bounds 的落盘值由 vendored
 * createRuntimeState 从 config 取（store.ts:151-157 同一上游值的另一枚指针），
 * 本默认组 = config 缺省时 state.json 应有的同值——两处指针，一个上游事实；
 * team-spec.ts 解析层的同值双闸保持（上游 runtime 值在档）。
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
 * 成员状态行：上游 RuntimeStateMemberSchema（types.ts:135-149）全形状镜像
 * （sessionId/tmux 两枚/subagent_type/category/model/color/worktreePath/
 * injection 账本逐枚在册），加两枚本仓语义字段：
 *   * `seat`：名册席 id（本仓路由身份；上游 subagent_type/category 是它的
 *     OMO 载体，v1 两者并存——category 保留调用方原词，seat 是解析产物）。
 *     **seat 不上 state.json**（上游成员 schema `.strict()`，多余键即拒）——
 *     它住 sidecar（文件头「双账 sidecar」段）。
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

/** 关停请求行：上游 ShutdownRequestSchema 全形状镜像。 */
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
 * team run 状态：上游 RuntimeStateSchema（types.ts:176-188）全形状镜像 +
 * 两枚 omo 侧扩展账（sidecar 承载，见文件头）。
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
   * R-6 重投去重账（**非**上游字段——上游去重住 mailbox 的 messageId 唯一性
   * 里（DuplicateMessageIdError，send.ts 错误族，Q1a §8 在档）；mailbox 本体
   * 不 vendor（FORK.md §3.3），去重账遂借 omo 扩展面承载，执法在
   * tools/team-message.ts）。记的是**已受理投递**的消息 id
   * （correlationId ?? 生成 uuid）。**T8b 起随 sidecar 落盘**——跨进程同 id
   * 重投在锁内重读判定下去重（T5 注的「保证域=本进程」差异翻正）。
   */
  readonly processedMessageIds: readonly string[]
  /**
   * briefing 注入账（**非**上游字段，与 processedMessageIds 同一待遇——
   * 上游 briefing 随 spawn 一次性进 prompt 语境，(B) 形态的 briefing 是
   * agent/created 监听里的独立注入帧，而 agent/created 在冷启 wake 重物化时
   * 会**再 fire**（T6 实测 frameCount:2 实证），于是需要「这个成员注过没有」
   * 的账）。记的是**已注入 briefing 的成员名**；执法面 =
   * tools/team-create.ts 的 briefing 臂（claimBriefingInjection 原子「查+记」，
   * 注入抛错走 releaseBriefingInjection 退账——未送达不占幂等位）。
   * 账键契约（T7 遗留③，T8b 随持久化重申）：键 = (teamRunId, memberName)；
   * childId 跨 resume 稳定（Q-5b 实证），同名成员换新 sessionId 重开的路径
   * v1 不存在——若出现，新会话须先退账再重新武装（升级点在本文件）。
   * **T8b 起随 sidecar 落盘**：跨重启「恰好一次」的账不再依赖内存余温。
   */
  readonly briefingInjectedMembers: readonly string[]
}

/**
 * 迁移合法性表：上游 ALLOWED_RUNTIME_TRANSITIONS（store.ts:15-23）逐字语义
 * 镜像。**T8b 换装注**：执法已移入 vendored transitionRuntimeState（同一张
 * 上游表，锁内重读后判）；本表退为读侧词表镜像 + 工具层预检（值逐字同
 * 上游，两处指针一个事实，漂移由 vendored 件的 validate + 本包单测双向钉）。
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
 * store.ts:118-122 的三条短路逐字语义）+ 表查。orphaned 全源放行是上游
 * 「孤儿收养」入口（进程重启后失联 run 的归宿）——T8b 起该入口的真实写者
 * = vendored resumeActiveTeam（orphan 判定经本表同构的 isValidTransition），
 * 本函数是其读侧镜像 + 工具层预检。
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
 * 状态机错误：上游 RuntimeStateError（store.ts:25-33）的 code 族镜像——
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

/**
 * create 入参。**T8b 注**：`now` 已删——createdAt 由 vendored
 * createRuntimeState 自产（store.ts:138 的 Date.now()，上游值上游落）；
 * 握手/账本的 `now` 注入臂保留（那些是 map 函数内的落账值，非 state.json
 * 的 createdAt）。
 */
export interface TeamRunCreateInput {
  readonly teamName: string
  readonly leadSessionId: string
  readonly members: readonly TeamMemberProvisioning[]
  readonly bounds?: Partial<TeamRuntimeBounds>
}

/**
 * omo 侧 sidecar 账本（`omo-team-extensions.json` 的落盘形状；本包自有
 * schema——vendored schema 不改的裁定面，见文件头）。
 */
export interface OmoTeamRunLedger {
  readonly version: 1
  readonly teamRunId: string
  /** memberName → seat（seat 非上游字段，state.json 装不下，sidecar 承载）。 */
  readonly memberSeats: Readonly<Record<string, string>>
  /** memberName → category（同上待遇；上游 createRuntimeState 的 map 不
   *  搬运 spec 成员的 category（store.ts:141-149 逐字只搬 name/agentType/
   *  status/color/worktreePath），omo 侧的 category 遂入 sidecar——差异记
   *  NOTES：category 的落盘位是 sidecar，不是 state.json 的成员行）。 */
  readonly memberCategories: Readonly<Record<string, string>>
  readonly processedMessageIds: readonly string[]
  readonly briefingInjectedMembers: readonly string[]
}

/** sidecar 文件名（runtime 目录内，与 vendored state.json / state.lock 并列而不相犯）。 */
export const OMO_TEAM_LEDGER_FILE = 'omo-team-extensions.json'
/** sidecar 专属锁名（与 vendored `state.lock` 分锁——两把锁不嵌套，不死锁）。 */
export const OMO_TEAM_LEDGER_LOCK = 'omo-team-extensions.lock'

/** 日志前缀（sidecar 降级面响亮用）。 */
const LOG_PREFIX = '[omo-team team-state]'

/** vendored 成员行 → omo 成员行（seat 从 sidecar 补；缺位 = 空串 + 调用方 warn）。 */
function toOmoMember(row: RuntimeState['members'][number], seat: string, category?: string): TeamRuntimeStateMember {
  return {
    name: row.name,
    seat,
    ...(row.sessionId !== undefined ? { sessionId: row.sessionId } : {}),
    phase: row.status,
    agentType: row.agentType,
    ...(row.subagent_type !== undefined ? { subagent_type: row.subagent_type } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(row.model !== undefined ? { model: row.model } : {}),
    ...(row.tmuxPaneId !== undefined ? { tmuxPaneId: row.tmuxPaneId } : {}),
    ...(row.tmuxGridPaneId !== undefined ? { tmuxGridPaneId: row.tmuxGridPaneId } : {}),
    ...(row.color !== undefined ? { color: row.color } : {}),
    ...(row.worktreePath !== undefined ? { worktreePath: row.worktreePath } : {}),
    ...(row.lastInjectedTurnMarker !== undefined ? { lastInjectedTurnMarker: row.lastInjectedTurnMarker } : {}),
    pendingInjectedMessageIds: row.pendingInjectedMessageIds,
  }
}

// （P5-T8b 双评审 MINOR：`toVendoredMember()` 死代码已删——全仓零调用点
// grep 实证；omo→vendored 方向无运行时消费者，写面直传 vendored 形。留此
// 一行作删除记录，防「为何没有反向转换器」的考古成本。）

/** 持久化成功后的镜像行组装（vendored state.json 行 + sidecar 扩展账 → omo 形）。 */
function assembleState(vendored: RuntimeState, ledger: OmoTeamRunLedger): TeamRuntimeState {
  return {
    version: vendored.version,
    teamRunId: vendored.teamRunId,
    teamName: vendored.teamName,
    specSource: vendored.specSource,
    createdAt: vendored.createdAt,
    status: vendored.status,
    ...(vendored.leadSessionId !== undefined ? { leadSessionId: vendored.leadSessionId } : {}),
    ...(vendored.tmuxLayout !== undefined ? { tmuxLayout: vendored.tmuxLayout } : {}),
    members: vendored.members.map((row) => toOmoMember(row, ledger.memberSeats[row.name] ?? '', ledger.memberCategories[row.name])),
    shutdownRequests: vendored.shutdownRequests.map((row) => ({ ...row })),
    bounds: { ...vendored.bounds },
    processedMessageIds: [...ledger.processedMessageIds],
    briefingInjectedMembers: [...ledger.briefingInjectedMembers],
  }
}

/**
 * 持久化状态机（T8b 换装完成）。方法名与 T5 内存骨架逐枚相同（接缝纪律：
 * 调用方改的只有 await 与构造），语义升级 = vendored 件的三段序随每笔写、
 * 双账 sidecar 随每笔记账、resume 随 boot。
 */
export class TeamStateStore {
  // 显式字段 + 构造体内赋值（strip-only 纪律，TeamStateError 同一理由）。
  //
  // P5-T16（NIT-14）：`config` 从**字段**改成**惰性 getter**——构造入参既可以
  // 是配置对象，也可以是**配置提供者**（`() => TeamModeConfig`）。
  //
  // 旧形态：`export const teamStateStore = new TeamStateStore(buildTeamModeConfig())`
  // 在**模块 import 期**就读了 `process.env.OMO_TEAM_BASE_DIR`——那早于插件的
  // `apply()`，于是「base_dir 的生效时点」与「row config（`maxMembers`）的生效
  // 时点」（apply() 里 `setTeamRowConfig` 落的）分属两个时刻。今天 base_dir 只有
  // env 一条路，影响是潜在的；但配置生效时点不该由「谁先 import」决定。
  //
  // 新形态：单例传**提供者**（`buildTeamModeConfig` 本身），配置在**首次真正
  // 使用**时解析（= boot resume 的时刻，已在 apply() 之后）；`apply()` 再显式
  // `refreshConfig()` 一次，把解析时点钉在「两条配置线同一刻生效」上。
  private readonly configProvider: () => TeamModeConfig
  private resolvedConfig: TeamModeConfig | undefined
  private readonly mirror = new Map<string, TeamRuntimeState>()
  private readonly teamRunIdByLeadSession = new Map<string, string>()
  private readonly participationByMemberSession = new Map<string, TeamMemberParticipation>()

  constructor(config: TeamModeConfig | (() => TeamModeConfig)) {
    if (typeof config === 'function') {
      this.configProvider = config
      this.resolvedConfig = undefined
    } else {
      this.configProvider = () => config
      this.resolvedConfig = config
    }
  }

  /** 惰性解析后的配置（memoize：env 读面在一次解析里只发生一次）。 */
  get config(): TeamModeConfig {
    if (this.resolvedConfig === undefined) this.resolvedConfig = this.configProvider()
    return this.resolvedConfig
  }

  /**
   * 丢弃已解析的配置，下次访问时重新解析（apply() 时点调用——两条配置线的
   * 生效时点就此对齐）。
   */
  refreshConfig(): void {
    this.resolvedConfig = undefined
  }

  // ── 寻址与 sidecar ──────────────────────────────────────────────────────────

  /** run 的 runtime 目录（vendored paths 的唯一调用点，防寻址散落）。 */
  private runtimeDir(teamRunId: string): string {
    return getRuntimeStateDir(resolveBaseDir(this.config), teamRunId)
  }

  private ledgerPath(teamRunId: string): string {
    return path.join(this.runtimeDir(teamRunId), OMO_TEAM_LEDGER_FILE)
  }

  private ledgerLockPath(teamRunId: string): string {
    return path.join(this.runtimeDir(teamRunId), OMO_TEAM_LEDGER_LOCK)
  }

  /** 空账模板（sidecar 缺失/损坏时的重建值）。 */
  private emptyLedger(
    teamRunId: string,
    seats: Readonly<Record<string, string>> = {},
    categories: Readonly<Record<string, string>> = {},
  ): OmoTeamRunLedger {
    return { version: 1, teamRunId, memberSeats: seats, memberCategories: categories, processedMessageIds: [], briefingInjectedMembers: [] }
  }

  /** sidecar 读（锁内）：缺失 → 空账（成员 seat 从 state.json 行名兜底为空）；损坏 → 空账 + 响亮 warn。 */
  private async readLedgerUnderLock(teamRunId: string): Promise<OmoTeamRunLedger> {
    return withLock(this.ledgerLockPath(teamRunId), async () => {
      return this.readLedgerUnlocked(teamRunId)
    }, { ownerTag: 'omo-team-ledger' })
  }

  /** 非加锁读（只允许在已持锁的临界区内调用——transition 组合面用）。 */
  private async readLedgerUnlocked(teamRunId: string): Promise<OmoTeamRunLedger> {
    try {
      const raw = await readFile(this.ledgerPath(teamRunId), 'utf8')
      const parsed = JSON.parse(raw) as Partial<OmoTeamRunLedger>
      if (parsed.version !== 1 || parsed.teamRunId !== teamRunId) {
        throw new Error('ledger version/teamRunId mismatch')
      }
      return {
        version: 1,
        teamRunId,
        memberSeats: parsed.memberSeats ?? {},
        memberCategories: parsed.memberCategories ?? {},
        processedMessageIds: Array.isArray(parsed.processedMessageIds) ? parsed.processedMessageIds.filter((x): x is string => typeof x === 'string') : [],
        briefingInjectedMembers: Array.isArray(parsed.briefingInjectedMembers) ? parsed.briefingInjectedMembers.filter((x): x is string => typeof x === 'string') : [],
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        // 账**尚未存在**（首次记前的正常态）——不是损坏，不告警。
        return this.emptyLedger(teamRunId)
      }
      // P5-T16（评审 MINOR-9）：**损坏**不再静默重置两个幂等账。
      //
      // 旧行为：解析失败（半写、磁盘故障、手工编辑）⇒ 账被重置为空 ⇒
      //   * 已投递过的 correlationId 可以**再投一次**（去重语义反了），
      //   * briefing 可以**再注一帧**（破坏 T6/T7 的「恰好一次」不变量——
      //     `tools/team-create.ts` 的注入闸完全依赖这张账）。
      // 头注只承认了后者（"briefing 可能重注一次"），去重丢失**没有单独记一笔**
      // ——它不是良性降级，是正确性回归。
      //
      // 更正：① 坏文件**先改名留档**（`omo-team-extensions.json.corrupt-<ts>`）
      // （现场不丢，可事后取证）；② 两种后果**分别具名**告警——不再合成一句
      // "briefing dedup restarts from zero, processed-message dedup likewise"。
      //
      // P5-T16（第二轮评审 MINOR）：留档**可能失败**，所以告警**不许**无条件
      // 宣称「文件已保存」——旧形态 renameSync 的失败被吞掉，而告警仍写着
      // "the damaged file was preserved as …"，且告警里的路径是**另一次**
      // `Date.now()` 生成的（跨毫秒时根本不是实际留档的那个路径）。
      // 更正：留档函数返回**实际结果**（成功=实际路径 / 失败=错误），告警按
      // 结果分流；路径**只生成一次**（同一次留档与告警共用它）。
      const quarantine = this.quarantineCorruptLedger(teamRunId)
      const preserved = quarantine.preserved
        ? `the damaged file was preserved as ${quarantine.path}`
        : `the damaged file could NOT be archived (${quarantine.error}) — it was overwritten by the rebuilt empty ledger, so the original bytes are gone`
      console.warn(
        `${LOG_PREFIX} sidecar ledger CORRUPT for team ${teamRunId} (${err instanceof Error ? err.message : String(err)}) — ${preserved} and an empty ledger was rebuilt. `
        + 'CONSEQUENCE 1: processed-message dedup restarts from zero — a correlationId that was already delivered may be delivered AGAIN. '
        + 'CONSEQUENCE 2: briefing dedup restarts from zero — a member may receive a SECOND briefing frame.',
      )
      return this.emptyLedger(teamRunId)
    }
  }

  /**
   * 坏账留档的结果：**成功**（实际留档路径）或**失败**（错误文本）。
   * 路径只在这里生成一次（告警与实际改名共用同一个串）。
   */
  private quarantineCorruptLedger(teamRunId: string):
    { readonly preserved: true, readonly path: string } | { readonly preserved: false, readonly error: string } {
    const target = `${this.ledgerPath(teamRunId)}.corrupt-${Date.now()}-${randomUUID().slice(0, 8)}`
    try {
      renameSync(this.ledgerPath(teamRunId), target)
      return { preserved: true, path: target }
    } catch (err) {
      return { preserved: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** sidecar 写（锁内原子；调用方已持 ledger 锁时用 *Unlocked 变体）。 */
  private async writeLedgerUnlocked(teamRunId: string, ledger: OmoTeamRunLedger): Promise<void> {
    await atomicWrite(this.ledgerPath(teamRunId), `${JSON.stringify(ledger, null, 2)}\n`)
  }

  // ── boot：磁盘重建 + resume ─────────────────────────────────────────────────

  /**
   * 从磁盘整幅重建镜像与参与索引（boot 时 / resume 后调用；扫面**不**清扫
   * 终态目录——清扫只在 resumeAllTeams，见文件头「扫面纪律」）。
   */
  async rebuildIndexes(): Promise<void> {
    this.mirror.clear()
    this.teamRunIdByLeadSession.clear()
    this.participationByMemberSession.clear()
    const runtimeRoot = path.join(resolveBaseDir(this.config), 'runtime')
    let entries: Dirent[]
    try {
      entries = await readdir(runtimeRoot, { withFileTypes: true })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw err
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const vendored = await loadRuntimeState(entry.name, this.config)
        const ledger = await this.readLedgerUnderLock(entry.name)
        const state = assembleState(vendored, ledger)
        this.registerState(state)
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} runtime state skipped at rebuild for run '${entry.name}': ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  /**
   * boot resume：vendored resumeAllTeams 原样承载（creating 30min→failed /
   * active 活性核查 orphan / deleting 完结 / 终态清扫），完成后磁盘整幅重建
   * 镜像。返回上游 ResumeReport（resumed/marked_failed/marked_orphaned/
   * cleaned/errors 五段账，resume-report.ts 逐字形状）。
   */
  async resume(ctx: TeamSessionContext): Promise<ResumeReport> {
    const report = await resumeAllTeams(ctx, this.config)
    await this.rebuildIndexes()
    return report
  }

  /** 索引登记（create/rebuild 共用的唯一登记点）。 */
  private registerState(state: TeamRuntimeState): void {
    this.mirror.set(state.teamRunId, state)
    if (state.leadSessionId !== undefined) {
      this.teamRunIdByLeadSession.set(state.leadSessionId, state.teamRunId)
    }
    for (const member of state.members) {
      if (member.sessionId === undefined) continue
      this.participationByMemberSession.set(member.sessionId, {
        role: 'member',
        teamRunId: state.teamRunId,
        memberName: member.name,
      })
    }
  }

  // ── create ───────────────────────────────────────────────────────────────────

  /**
   * 创建 run：vendored createRuntimeState 落 state.json（status='creating'，
   * teamRunId/createdAt 上游自产），seat 账随 sidecar 落盘，成员索引**先于**
   * 任何 startContinuable 在场（按角色分发不竞态的 T5 前提不变）。
   * @throws TeamStateError TEAM_NAME_REQUIRED / MEMBERS_EMPTY / BOUNDS_VIOLATION /
   *         ALREADY_PARTICIPANT（嵌套闸；上游 hook.ts:102-108 文案）。
   */
  async create(input: TeamRunCreateInput): Promise<TeamRuntimeState> {
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
    // vendored spec：leadAgentId = sentinel（成员名单里没有 'lead' → leader 行
    // 判定恒不命中，(B) 形态成员恒 general-purpose 的同一事实走上游通道）；
    // 成员 kind 走 subagent_type 臂（seat = 委派目标名，roster-seats 已验）。
    const spec = {
      version: 1 as const,
      name: input.teamName,
      createdAt: Date.now(),
      leadAgentId: TEAM_LEAD_SENTINEL,
      members: input.members.map((member) => ({
        name: member.name,
        kind: 'subagent_type' as const,
        subagent_type: member.seat,
        backendType: 'in-process' as const,
        isActive: true,
      })),
    }
    const vendored = await createRuntimeState(spec, input.leadSessionId, 'user', this.config)
    const seats: Record<string, string> = {}
    const categories: Record<string, string> = {}
    for (const member of input.members) {
      seats[member.name] = member.seat
      if (member.category !== undefined) categories[member.name] = member.category
    }
    // sidecar 初账（childId 预留随 sessionId 上 state.json；seat/双账入 sidecar）。
    const vendoredWithSessions: RuntimeState = {
      ...vendored,
      members: vendored.members.map((row, index) => ({
        ...row,
        sessionId: input.members[index]!.childId,
      })),
    }
    await saveRuntimeState(vendoredWithSessions, this.config)
    const initialLedger = this.emptyLedger(vendored.teamRunId, seats, categories)
    await withLock(this.ledgerLockPath(vendored.teamRunId), async () => {
      await this.writeLedgerUnlocked(vendored.teamRunId, initialLedger)
    }, { ownerTag: 'omo-team-ledger' })
    const state = assembleState(vendoredWithSessions, initialLedger)
    this.registerState(state)
    return state
  }

  // ── 读面（镜像同步；写后镜像恒等于落定字节）───────────────────────────────

  /** 按 teamRunId 取状态（镜像读；行不可原地改——写全走方法）。 */
  get(teamRunId: string): TeamRuntimeState | undefined {
    return this.mirror.get(teamRunId)
  }

  /** lead 参与账查询。 */
  teamOfLead(leadSessionId: string): TeamRuntimeState | undefined {
    const teamRunId = this.teamRunIdByLeadSession.get(leadSessionId)
    return teamRunId === undefined ? undefined : this.mirror.get(teamRunId)
  }

  /** 成员参与账查询（诊断面，不按状态过滤——T5 裁决不变）。 */
  participationOfMember(memberSessionId: string): TeamMemberParticipation | undefined {
    return this.participationByMemberSession.get(memberSessionId)
  }

  /**
   * 嵌套闸谓词：该会话是否已是任何未终态 run 的参与者（lead 或 member）。
   * 上游对应物 = gating hook 的 participant.role !== 'neither'（hook.ts:102-
   * 108）——含 lead 本人。T8b 后账的持久性：boot 由 rebuildIndexes() 从
   * state.json 整幅重建，跨进程嵌套在 boot 后同样被拦（保证域差异收小为
   * 「本进程 boot 时刻 + 本进程写面」，NOTES 登记）。
   */
  participantOf(sessionId: string): TeamParticipation | undefined {
    const asMember = this.participationByMemberSession.get(sessionId)
    if (asMember !== undefined) {
      const state = this.mirror.get(asMember.teamRunId)
      if (state !== undefined && ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) return asMember
    }
    const leadRunId = this.teamRunIdByLeadSession.get(sessionId)
    if (leadRunId !== undefined) {
      const state = this.mirror.get(leadRunId)
      if (state !== undefined && ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) {
        return { role: 'lead', teamRunId: leadRunId }
      }
    }
    return undefined
  }

  /**
   * 落定后的镜像收口：写面成功返回后统一走这里（镜像更新唯一入口）。
   * sidecar 在此**重读**（权威账目，不从镜像倒推——镜像可能缺位：另一进程
   * 建的 run 在本进程 boot 之后，账目只能从磁盘取）。
   */
  private async settle(vendored: RuntimeState): Promise<TeamRuntimeState> {
    const ledger = await this.readLedgerUnderLock(vendored.teamRunId)
    const state = assembleState(vendored, ledger)
    // lead/member 索引漂移防护：成员 sessionId 若在 vendored 行上新增（create
    // 之外的路径理论上不改 sessionId），补登记保持索引完备。
    if (state.leadSessionId !== undefined) this.teamRunIdByLeadSession.set(state.leadSessionId, state.teamRunId)
    for (const member of state.members) {
      if (member.sessionId !== undefined && !this.participationByMemberSession.has(member.sessionId)) {
        this.participationByMemberSession.set(member.sessionId, { role: 'member', teamRunId: state.teamRunId, memberName: member.name })
      }
    }
    // P5-T16（评审 MINOR-10）：**撤掉陈旧行**。旧实现只增不删——一旦某个成员的
    // `sessionId` 变了或被抹掉（vendored `markDeadWorkersErrored` 把它写成
    // `undefined` 落盘），旧 sessionId 的参与行仍留在索引里 ⇒
    // `participationOfMember(oldSessionId)` 仍返回一行「活着的参与账」⇒
    // `team_send_message` 的成员闸或成员面分发可能认下一个**已经不属于本队**
    // 的会话。
    //
    // 撤行的判据 = 「上一份镜像里有、这一份里没有（或换成了别的 id）」。只撤
    // 本队自己的行（别队的行不归本队处置）。
    const previous = this.mirror.get(vendored.teamRunId)
    if (previous !== undefined) {
      const currentSessionIds = new Set(
        state.members
          .map((member) => member.sessionId)
          .filter((id): id is string => id !== undefined),
      )
      for (const member of previous.members) {
        if (member.sessionId === undefined) continue
        if (currentSessionIds.has(member.sessionId)) continue
        const indexed = this.participationByMemberSession.get(member.sessionId)
        if (indexed !== undefined && indexed.teamRunId === vendored.teamRunId) {
          this.participationByMemberSession.delete(member.sessionId)
        }
      }
    }
    this.mirror.set(state.teamRunId, state)
    return state
  }

  private requireState(teamRunId: string): TeamRuntimeState {
    const state = this.mirror.get(teamRunId)
    if (state === undefined) {
      throw new TeamStateError(`no team run '${teamRunId}' in the team state store`, 'TEAM_NOT_FOUND')
    }
    return state
  }

  // ── 写面（vendored 三段序：锁 + 锁内重读 + 校验落盘）───────────────────────

  /**
   * 生命周期迁移：vendored transitionRuntimeState 的「锁 + 锁内重读 +
   * isValidTransition 再校验 + saveRuntimeState」三段序原样（上游
   * store.ts:185-204）；非法迁移把上游 InvalidTransitionError 换成同语义的
   * TeamStateError INVALID_TRANSITION（消息含上游词根 `invalid transition`）。
   */
  async transition(teamRunId: string, toStatus: TeamRuntimeStatus): Promise<TeamRuntimeState> {
    try {
      const next = await transitionRuntimeState(teamRunId, (current) => ({ ...current, status: toStatus }), this.config)
      return this.settle(next)
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        throw new TeamStateError(
          `illegal team runtime transition ${err.message} for team ${teamRunId}`,
          'INVALID_TRANSITION',
        )
      }
      throw this.wrapStateError(err, teamRunId)
    }
  }

  /**
   * 成员阶段迁移：只认六态词表（UNKNOWN_MEMBER_PHASE）；行不存在具名抛
   * （MEMBER_NOT_FOUND，锁内判定——重读值才是判定对象）。
   */
  async setMemberPhase(teamRunId: string, memberName: string, phase: TeamMemberPhase): Promise<TeamRuntimeState> {
    if (!TEAM_MEMBER_PHASES.includes(phase)) {
      throw new TeamStateError(
        `unknown member phase '${phase}' for member '${memberName}' of team ${teamRunId}`,
        'UNKNOWN_MEMBER_PHASE',
      )
    }
    try {
      const next = await transitionRuntimeState(teamRunId, (current) => {
        let found = false
        const members = current.members.map((member) => {
          if (member.name !== memberName) return member
          found = true
          return { ...member, status: phase }
        })
        if (!found) {
          throw new TeamStateError(
            `team ${teamRunId} has no member '${memberName}' — phase update has no carrier`,
            'MEMBER_NOT_FOUND',
          )
        }
        return { ...current, members }
      }, this.config)
      return this.settle(next)
    } catch (err) {
      if (err instanceof TeamStateError) throw err
      throw this.wrapStateError(err, teamRunId)
    }
  }

  /** 上游 RuntimeStateError（state 缺位/畸形）→ omo code 族映射。 */
  private wrapStateError(err: unknown, teamRunId: string): Error {
    if (err instanceof RuntimeStateError) {
      const code = err.code === 'invalid_runtime_state' ? 'INVALID_RUNTIME_STATE' : 'TEAM_NOT_FOUND'
      return new TeamStateError(err.message, code)
    }
    const errno = (err as NodeJS.ErrnoException)?.code
    if (errno === 'ENOENT' || errno === 'ENOTDIR') {
      return new TeamStateError(`no team run '${teamRunId}' in the team state store`, 'TEAM_NOT_FOUND')
    }
    return err instanceof Error ? err : new Error(String(err))
  }

  // ── 双账（sidecar，锁内「查+记」——跨进程原子自此成立）────────────────────

  /**
   * R-6 去重账查询（只读诊断面，镜像）。判重走 markMessageProcessed——
   * 与 T5 同一分工。
   */
  hasProcessedMessage(teamRunId: string, messageId: string): boolean {
    return this.requireState(teamRunId).processedMessageIds.includes(messageId)
  }

  /**
   * 原子「查+记」（R-6 去重闸的账本体）：**sidecar 锁内重读 → 判 → 原子写
   * → 镜像更新**，先记后投（reservation 语义）。T8b 起原子域 = 跨进程
   * （withLock 的 O_EXCL 锁 + 锁内读；T5 内存形态的「保证域=本进程」注
   * 作废）。失败时调用方 unmarkMessageProcessed 补偿退账，同一不变量：
   * 未送达不占幂等位。
   *
   * P5-T16（评审 MINOR-8 + MAJOR-2）：去重账**有上界**，但**不裁剪**。
   *
   * 第一轮修复轮曾实现「追加后裁掉最旧的一条」（滚动窗口）——第二轮评审驳回
   * 了它，理由成立：**裁剪是不可逆的**，而预约失败要走 `unmarkMessageProcessed`
   * 补偿退账（只删新增的那一条）。于是：
   *   cap=3，账=[m1,m2,m3] → 预约 m4（追加⇒[m1,m2,m3,m4]⇒裁剪⇒[m2,m3,m4]）
   *   → 投递失败退账（删 m4）⇒ 账=[m2,m3] —— **m1 的去重记忆被永久抹掉**，
   *   再次 `mark(m1)` 会返回 true（允许重复投递）。连续失败可以在没有一条新
   *   成功消息的情况下逐步清空历史去重账。
   *
   * 更正：**满载时显式拒收**（第一轮评审自己的措辞：「按 maxMessagesPerRun
   * 封顶并**显式拒收超限**」），不裁剪任何一条：
   *   * 账长 = vendored `max_messages_per_run`（上游同值 10000）——账本大小与
   *     内存占用**有上界**（MINOR-8 的诉求达成）；
   *   * 满载 ⇒ 抛具名 `MESSAGE_LEDGER_FULL`（响亮、可恢复：模型换新
   *     correlationId 即可继续），**账里的任何一条都不丢** ⇒ 补偿退账永远
   *     精确（MAJOR-2 的不变量）。
   */
  async markMessageProcessed(teamRunId: string, messageId: string): Promise<boolean> {
    this.requireState(teamRunId)
    return withLock(this.ledgerLockPath(teamRunId), async () => {
      const ledger = await this.readLedgerUnlocked(teamRunId)
      if (ledger.processedMessageIds.includes(messageId)) return false
      const cap = this.config.max_messages_per_run
      if (ledger.processedMessageIds.length >= cap) {
        throw new TeamStateError(
          `message dedup ledger for team ${teamRunId} is full (${cap} recorded ids = the vendored max_messages_per_run bound) — `
          + `refusing to record '${messageId}' rather than evicting an older id (an eviction would silently drop that older message's dedup memory); `
          + `send under a NEW correlationId, or tear the run down and start a new one`,
          'MESSAGE_LEDGER_FULL',
        )
      }
      const next = [...ledger.processedMessageIds, messageId]
      await this.writeLedgerUnlocked(teamRunId, {
        ...ledger,
        processedMessageIds: next,
      })
      this.applyLedgerToMirror(teamRunId, {
        processedMessageIds: next,
      })
      return true
    }, { ownerTag: 'omo-team-ledger' })
  }

  /** 补偿退账（reservation 回执作废；账不在位 = 幂等无操作）。 */
  async unmarkMessageProcessed(teamRunId: string, messageId: string): Promise<void> {
    this.requireState(teamRunId)
    await withLock(this.ledgerLockPath(teamRunId), async () => {
      const ledger = await this.readLedgerUnlocked(teamRunId)
      if (!ledger.processedMessageIds.includes(messageId)) return
      const next = ledger.processedMessageIds.filter((id) => id !== messageId)
      await this.writeLedgerUnlocked(teamRunId, { ...ledger, processedMessageIds: next })
      this.applyLedgerToMirror(teamRunId, { processedMessageIds: next })
    }, { ownerTag: 'omo-team-ledger' })
  }

  /**
   * briefing 注入账的原子「查+记」（P5-T6 NOTES-7 治理的账本体）：账键 =
   * (teamRunId, memberName)（契约见 TeamRuntimeState.briefingInjectedMembers
   * 注——T8b 随持久化重申）。锁内重读判定，跨重启不再重注。
   */
  async claimBriefingInjection(teamRunId: string, memberName: string): Promise<boolean> {
    this.requireState(teamRunId)
    return withLock(this.ledgerLockPath(teamRunId), async () => {
      const ledger = await this.readLedgerUnlocked(teamRunId)
      if (ledger.briefingInjectedMembers.includes(memberName)) return false
      await this.writeLedgerUnlocked(teamRunId, {
        ...ledger,
        briefingInjectedMembers: [...ledger.briefingInjectedMembers, memberName],
      })
      this.applyLedgerToMirror(teamRunId, {
        briefingInjectedMembers: [...ledger.briefingInjectedMembers, memberName],
      })
      return true
    }, { ownerTag: 'omo-team-ledger' })
  }

  /** briefing 注入账退账（inject 抛错臂专用——未送达不占幂等位，T7 不变量）。 */
  async releaseBriefingInjection(teamRunId: string, memberName: string): Promise<void> {
    this.requireState(teamRunId)
    await withLock(this.ledgerLockPath(teamRunId), async () => {
      const ledger = await this.readLedgerUnlocked(teamRunId)
      if (!ledger.briefingInjectedMembers.includes(memberName)) return
      const next = ledger.briefingInjectedMembers.filter((name) => name !== memberName)
      await this.writeLedgerUnlocked(teamRunId, { ...ledger, briefingInjectedMembers: next })
      this.applyLedgerToMirror(teamRunId, { briefingInjectedMembers: next })
    }, { ownerTag: 'omo-team-ledger' })
  }

  /** briefing 注入账查询（只读诊断面，镜像）。 */
  hasBriefingInjected(teamRunId: string, memberName: string): boolean {
    return this.requireState(teamRunId).briefingInjectedMembers.includes(memberName)
  }

  /** 镜像的账本投影更新（sidecar 写成功后的同步镜像维护）。 */
  private applyLedgerToMirror(
    teamRunId: string,
    patch: { readonly processedMessageIds?: readonly string[]; readonly briefingInjectedMembers?: readonly string[] },
  ): void {
    const state = this.mirror.get(teamRunId)
    if (state === undefined) return
    this.mirror.set(teamRunId, {
      ...state,
      ...(patch.processedMessageIds !== undefined ? { processedMessageIds: [...patch.processedMessageIds] } : {}),
      ...(patch.briefingInjectedMembers !== undefined ? { briefingInjectedMembers: [...patch.briefingInjectedMembers] } : {}),
    })
  }

  // ── 关停握手账（P5-T7；账本在 state.json 的 shutdownRequests 里——上游
  //    ShutdownRequestSchema 原生字段，换装后**不落 sidecar**，三段序随
  //    vendored transitionRuntimeState）─────────────────────────────────────────

  /** 握手账查询：该成员最近一条请求（倒序扫描，含已批/已拒；镜像读）。 */
  latestShutdownRequest(teamRunId: string, memberId: string): TeamShutdownRequest | undefined {
    const requests = this.requireState(teamRunId).shutdownRequests
    for (let index = requests.length - 1; index >= 0; index -= 1) {
      if (requests[index]!.memberId === memberId) return requests[index]
    }
    return undefined
  }

  /**
   * 握手请求入账（上游 shutdown.ts:13-55 幂等语义，锁内判定）：未决请求
   * 在场 → alreadyPending=true 不追加；无未决 → 追加行。**判定与落账同在
   * transitionRuntimeState 的锁内**（T5 的内存原子注升级为锁原子）。
   */
  async requestShutdown(
    teamRunId: string,
    memberId: string,
    requesterName: string,
    now?: number,
  ): Promise<{ alreadyPending: boolean; request: TeamShutdownRequest }> {
    let captured: { alreadyPending: boolean; request: TeamShutdownRequest } | undefined
    try {
      const next = await transitionRuntimeState(teamRunId, (current) => {
        if (!current.members.some((member) => member.name === memberId)) {
          throw new TeamStateError(
            `unknown member '${memberId}' — shutdown request has no carrier`,
            'UNKNOWN_MEMBER',
          )
        }
        const requests = current.shutdownRequests
        for (let index = requests.length - 1; index >= 0; index -= 1) {
          const row = requests[index]!
          if (row.memberId === memberId && row.approvedAt === undefined && row.rejectedAt === undefined) {
            captured = { alreadyPending: true, request: { ...row } }
            return current
          }
        }
        const request: TeamShutdownRequest = { memberId, requesterName, requestedAt: now ?? Date.now() }
        captured = { alreadyPending: false, request }
        return { ...current, shutdownRequests: [...current.shutdownRequests, request] }
      }, this.config)
      await this.settle(next)
      return captured ?? this.latestShutdownRequestAndThrow(teamRunId, memberId)
    } catch (err) {
      if (err instanceof TeamStateError) throw err
      throw this.wrapStateError(err, teamRunId)
    }
  }

  /** 理论不可达防御（captured 未落 = 上游行为漂移，具名抛）。 */
  private latestShutdownRequestAndThrow(teamRunId: string, memberId: string): never {
    throw new TeamStateError(
      `shutdown request accounting desync for '${memberId}' of team ${teamRunId}`,
      'SHUTDOWN_LEDGER_DESYNC',
    )
  }

  /** 握手请求退账：撤该成员**最新一条未决**行（resolved 不撤，T7 不变量）。 */
  async releaseShutdownRequest(teamRunId: string, memberId: string): Promise<void> {
    try {
      const next = await transitionRuntimeState(teamRunId, (current) => {
        const index = current.shutdownRequests.reduce(
          (found: number, row, i: number) =>
            row.memberId === memberId && row.approvedAt === undefined && row.rejectedAt === undefined ? i : found,
          -1,
        )
        if (index < 0) return current
        return { ...current, shutdownRequests: current.shutdownRequests.filter((_, i) => i !== index) }
      }, this.config)
      await this.settle(next)
    } catch (err) {
      if (err instanceof TeamStateError) throw err
      throw this.wrapStateError(err, teamRunId)
    }
  }

  /**
   * 握手批准入账（上游 shutdown.ts:57-107 账本语义逐字；判定+落账同在锁内）：
   * 无请求 → 具名抛（上游 :63-65 文案逐字）；已批 → alreadyApproved=true 早退
   * （上游 :68-70）；否则 approvedAt 落账 + 成员 phase 翻 shutdown_approved
   * （completed/errored 保留终态——上游 :79-86 map 臂逐字）。
   */
  async approveShutdown(
    teamRunId: string,
    memberName: string,
    now?: number,
  ): Promise<{ alreadyApproved: boolean; memberPhaseFlipped: boolean; request: TeamShutdownRequest; approvedAt: number }> {
    let captured: { alreadyApproved: boolean; memberPhaseFlipped: boolean; request: TeamShutdownRequest; approvedAt: number } | undefined
    try {
      const next = await transitionRuntimeState(teamRunId, (current) => {
        const requests = current.shutdownRequests
        let latestIndex = -1
        for (let index = requests.length - 1; index >= 0; index -= 1) {
          if (requests[index]!.memberId === memberName) { latestIndex = index; break }
        }
        if (latestIndex < 0) {
          throw new TeamStateError(`shutdown request missing for '${memberName}'`, 'SHUTDOWN_REQUEST_MISSING')
        }
        const latest = requests[latestIndex]!
        if (latest.approvedAt !== undefined) {
          captured = { alreadyApproved: true, memberPhaseFlipped: false, request: { ...latest }, approvedAt: latest.approvedAt }
          return current
        }
        const stampedAt = now ?? Date.now()
        let memberPhaseFlipped = false
        const members = current.members.map((member) => {
          if (member.name !== memberName || member.status === 'completed' || member.status === 'errored') {
            return member
          }
          memberPhaseFlipped = true
          return { ...member, status: 'shutdown_approved' as const }
        })
        captured = {
          alreadyApproved: false,
          memberPhaseFlipped,
          request: { ...latest, approvedAt: stampedAt },
          approvedAt: stampedAt,
        }
        return {
          ...current,
          members,
          shutdownRequests: current.shutdownRequests.map((row, index) =>
            index === latestIndex ? { ...row, approvedAt: stampedAt } : row,
          ),
        }
      }, this.config)
      await this.settle(next)
      if (captured === undefined) {
        throw new TeamStateError(`shutdown approval desync for '${memberName}' of team ${teamRunId}`, 'SHUTDOWN_LEDGER_DESYNC')
      }
      return captured
    } catch (err) {
      if (err instanceof TeamStateError) throw err
      throw this.wrapStateError(err, teamRunId)
    }
  }

  /**
   * 握手拒绝入账（上游 shutdown.ts:109-148 账本语义逐字；锁内判定）：无请求
   * → 同一具名抛；同 reason 已拒 → alreadyRejected=true（上游 :122-124 判定
   * 逐字）；不同 reason = 重拒落新值；拒绝**不动成员 phase**（team 存活语义）。
   */
  async rejectShutdown(
    teamRunId: string,
    memberName: string,
    reason: string,
    now?: number,
  ): Promise<{ alreadyRejected: boolean; request: TeamShutdownRequest }> {
    let captured: { alreadyRejected: boolean; request: TeamShutdownRequest } | undefined
    try {
      const next = await transitionRuntimeState(teamRunId, (current) => {
        const requests = current.shutdownRequests
        let latestIndex = -1
        for (let index = requests.length - 1; index >= 0; index -= 1) {
          if (requests[index]!.memberId === memberName) { latestIndex = index; break }
        }
        if (latestIndex < 0) {
          throw new TeamStateError(`shutdown request missing for '${memberName}'`, 'SHUTDOWN_REQUEST_MISSING')
        }
        const latest = requests[latestIndex]!
        if (latest.rejectedAt !== undefined && latest.rejectedReason === reason) {
          captured = { alreadyRejected: true, request: { ...latest } }
          return current
        }
        const rejectedAt = now ?? Date.now()
        captured = { alreadyRejected: false, request: { ...latest, rejectedAt, rejectedReason: reason } }
        return {
          ...current,
          shutdownRequests: current.shutdownRequests.map((row, index) =>
            index === latestIndex ? { ...row, rejectedAt, rejectedReason: reason } : row,
          ),
        }
      }, this.config)
      await this.settle(next)
      if (captured === undefined) {
        throw new TeamStateError(`shutdown rejection desync for '${memberName}' of team ${teamRunId}`, 'SHUTDOWN_LEDGER_DESYNC')
      }
      return captured
    } catch (err) {
      if (err instanceof TeamStateError) throw err
      throw this.wrapStateError(err, teamRunId)
    }
  }

  /**
   * force 臂成员预清账（上游 delete-team.ts:114-123 语义；锁内翻 + 返回名单）。
   */
  async forceCompleteMembers(teamRunId: string): Promise<readonly string[]> {
    const flipped: string[] = []
    try {
      const next = await transitionRuntimeState(teamRunId, (current) => {
        const members = current.members.map((member) => {
          if (!TEAM_FORCE_COMPLETABLE_MEMBER_PHASES.has(member.status)) return member
          flipped.push(member.name)
          return { ...member, status: 'completed' as const }
        })
        return { ...current, members }
      }, this.config)
      await this.settle(next)
      return flipped
    } catch (err) {
      throw this.wrapStateError(err, teamRunId)
    }
  }

  /**
   * force 旁路入 deleting（上游 delete-team.ts:133-140 的 saveRuntimeState
   * 旁路语义——**绕开迁移表**是上游自己的通道，本方法把它收窄成显式命名入口，
   * 入口门禁逐字同上游 FORCE_BYPASS_DELETING_STATUSES（creating|orphaned，
   * delete-team.ts:39）；其余来源具名拒 INVALID_TRANSITION 族）。
   */
  async forceTransitionToDeleting(teamRunId: string): Promise<TeamRuntimeState> {
    let vendored: RuntimeState
    try {
      vendored = await loadRuntimeState(teamRunId, this.config)
    } catch (err) {
      throw this.wrapStateError(err, teamRunId)
    }
    if (vendored.status === 'deleting') return this.settle(vendored)
    if (vendored.status !== 'creating' && vendored.status !== 'orphaned') {
      throw new TeamStateError(
        `illegal force-deleting bypass from ${vendored.status} for team ${teamRunId}`,
        'INVALID_TRANSITION',
      )
    }
    const next: RuntimeState = { ...vendored, status: 'deleting' }
    await saveRuntimeState(next, this.config)
    return this.settle(next)
  }

  /**
   * deleted 后的参与索引撤账（上游 unregisterTeamSessionsByTeam
   * delete-team.ts:190 语义）；state.json 的 deleted tombstone **留在磁盘**，
   * 进程存活期内可读（扫面纪律，文件头），重启后随 resume 清扫消失。
   */
  retireRunIndexes(teamRunId: string): void {
    const state = this.mirror.get(teamRunId)
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
   * 清账（诊断/管理面）：删整个 runtime 目录（state.json + sidecar + 任务板
   * 随目录同灭——上游清扫的显式手动形态）+ 镜像/索引撤账。
   *
   * P5-T16（评审 NIT-13）：补一道**状态白名单闸**——默认只许清**终态** run
   * （deleted / failed / orphaned）。旧形态无闸：任何 `teamRunId` 都能被无声
   * 拆掉整支队的账与任务板。今天本方法只有诊断面可达（**不是**注册工具），
   * 所以这道闸不是堵漏洞，而是把「将来任何把 teamRunId 透传给它的消费面」
   * 的后果**前置成显式约束**：活跃队的账只能走 `team_delete`（三重闸）收。
   *
   * 诊断面要清活跃队时，走**具名**的 `{ force: true }` 旁路——旁路必须写在
   * 调用点（可见），而不是默认开着（不可见）。
   */
  async forgetRun(teamRunId: string, options?: { readonly force?: boolean }): Promise<void> {
    const force = options?.force === true
    const state = this.mirror.get(teamRunId)
    // P5-T16（第二轮评审 MINOR）：**mirror 缺位不许直接 rm**。
    //
    // 旧形态：`state === undefined`（本进程的镜像不认识这个 run——例如另一个
    // store 实例共享同一 base_dir 但还没 rebuildIndexes）时**直接**递归删目录，
    // 于是「一个 active run 的整份账 + 任务板」被无声拆掉——评审已独立复现。
    //
    // 更正：**失败封闭**。镜像不认识 ⇒ 从磁盘**确证**状态（锁内，与 vendored
    // 的状态写入同一把锁），确证不到（读不出 state.json / 读失败）⇒ 抛具名
    // 错、**不删**；确证到了 ⇒ 走与镜像路径**同一条**终态白名单闸。
    let status: TeamRuntimeStatus | undefined = state?.status
    if (status === undefined) {
      let onDisk: RuntimeState
      try {
        onDisk = await withLock(
          path.join(this.runtimeDir(teamRunId), 'state.lock'),
          async () => loadRuntimeState(teamRunId, this.config),
          { ownerTag: 'omo-team-state' },
        )
      } catch (err) {
        throw new TeamStateError(
          `forgetRun cannot confirm the status of team run '${teamRunId}' from disk (${err instanceof Error ? err.message : String(err)}) — refusing to erase an unconfirmed run directory; pass force to erase it anyway`,
          'TEAM_STATUS_UNCONFIRMED',
        )
      }
      status = onDisk.status
    }
    if (!force && !TEAM_FORGETTABLE_STATUSES.has(status)) {
      throw new TeamStateError(
        `forgetRun refuses to erase an active team run '${teamRunId}' (status '${status}') — only a terminal run (${[...TEAM_FORGETTABLE_STATUSES].join(' / ')}) may be erased; use team_delete for a live run (or pass force for the diagnostic face)`,
        'TEAM_NOT_FORGETTABLE',
      )
    }
    await rm(this.runtimeDir(teamRunId), { recursive: true, force: true })
    if (state === undefined) return
    this.mirror.delete(teamRunId)
    if (state.leadSessionId !== undefined) this.teamRunIdByLeadSession.delete(state.leadSessionId)
    for (const member of state.members) {
      if (member.sessionId !== undefined) this.participationByMemberSession.delete(member.sessionId)
    }
  }

  /** 活跃 run 清单（镜像读；gating 三态，上游 ACTIVE_RUNTIME_STATUSES 同集）。 */
  listActive(): readonly TeamRuntimeState[] {
    return [...this.mirror.values()].filter((state) => ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status))
  }

  /** 全量清单（仅诊断/单测用；业务面走 listActive/participantOf）。 */
  listAll(): readonly TeamRuntimeState[] {
    return [...this.mirror.values()]
  }

  // ── 任务板薄接线（T8b 交付物 2 的接线点——vendored team-tasklist 的
  // 同一 config 寻址，工具层经此调用，上游语义零改写）─────────────────────────

  /** 建任务（vendored createTask 直通：高水位 + 锁 + TaskSchema.parse 上游原样）。 */
  createTask(teamRunId: string, taskInput: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<Task> {
    return createTask(teamRunId, taskInput, this.config)
  }

  /** 领任务（vendored claimTask 直通：300s claim 锁 + 锁内重读 + BlockedBy 语义）。 */
  claimTask(teamRunId: string, taskId: string, memberName: string): Promise<Task> {
    return claimTask(teamRunId, taskId, memberName, this.config)
  }

  /** 取任务（vendored getTask 直通：畸形即抛，与 list 的宽容不同——上游事实）。 */
  getTask(teamRunId: string, taskId: string): Promise<Task> {
    return getTask(teamRunId, taskId, this.config)
  }

  /** 列任务（vendored listTasks 直通：过滤/排序/宽容 malformed 上游原样）。 */
  listTasks(teamRunId: string, filter?: { status?: Task['status']; owner?: string }): Promise<Task[]> {
    return listTasks(teamRunId, this.config, filter)
  }

  /** 改任务态（vendored updateTaskStatus 直通：pending→in_progress 自动过 claim、
   * 跨 owner 拒、无逆向——上游语义零改写）。 */
  updateTaskStatus(teamRunId: string, taskId: string, newStatus: Task['status'], memberName: string): Promise<Task> {
    return updateTaskStatus(teamRunId, taskId, newStatus, memberName, this.config)
  }
}

/**
 * 进程单例：config 由 team-config.ts 的唯一构造点给出（base_dir = 项目
 * .omo/teams/ 面，T8b 裁定钉死）。index.ts 的 apply() 在 boot 时经本实例
 * rebuildIndexes() + resume()（vendored resumeAllTeams 原样承载 creating
 * 30min→failed 等语义）。调用方（T5-T7 工具层 + T8b 任务板）经同一实例读写，
 * 绕过方法面的旁路不存在。
 *
 * P5-T16（NIT-14）：单例传的是**配置提供者**（`buildTeamModeConfig` 本体）
 * 而不是它的**结果**——env 读面因此不在**模块 import 期**发生，而落在首次
 * 真正使用时（boot resume，已在 apply() 之后）；apply() 再显式
 * `refreshConfig()` 一次，把 base_dir 与 row config 的生效时点对齐到同一刻。
 */
export const teamStateStore = new TeamStateStore(buildTeamModeConfig)
