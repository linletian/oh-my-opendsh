// team-message.ts — P5-T6 · team_send_message 工具（mailbox 采用接线 + 消息工具层）。
//
// ── 语义移植声明（SEMANTIC PORT, NOT A COPY）────────────────────────────────
// 上游源路径（署名，OMO tag v4.19.4 = commit b072d279110bdda2c6ac2525d0d24dc54d16148a）：
//   - packages/omo-opencode/src/features/team-mode/tools/messaging.ts:38-116
//     —— team_send_message 的工具骨架：参数 zod 形状 :28-36（Q1a §2.6 逐字
//     在档：{teamRunId min(1), to min(1), body, kind?('message'|'announcement'),
//     correlationId?(uuid，空串→undefined 的 preprocess), summary?, references?}），
//     描述文案 :44/:47/:50，广播 lead-only 硬规则 :86-88，shutdown kind 禁令
//     :82-84。本文件**不 import 上游件、不抄 zod**：参数以 JSON Schema 方言
//     （dsh-tools raw register 面）逐字段对齐，运行时逐字段具名校验补齐
//     schema 表达不了的部分（correlationId 的 uuid 形与空串→undefined）。
//   - packages/team-core/src/team-mailbox/send.ts —— 错误族语义源（Q1a §8
//     逐字在档）：BroadcastNotPermittedError「broadcast requires lead role」
//     （:19，本文件逐字承载该文案）、PayloadTooLargeError「payload exceeds
//     32 KB」（:26，同承载）、InvalidRecipientError「unknown or inactive team
//     recipient: <r>」（:46-51，同承载）、DuplicateMessageIdError「duplicate
//     message id」（**语义对齐非逐字**——上游在 mailbox 里以抛拒，(B) 形态
//     无 mailbox 本体（FORK.md §3.3），本文件把它落成**正常返回的去重说明**
//     （任务书 P5-T6 钉死「不重复投递，返回去重说明」），text 里保留
//     「duplicate message id」词根）。TeamDeletingError「team is deleting」
//     （:53-58）同承载。**mailbox 本体（预约/ack/背压/poll）不移植**——
//     原生 inbox 替代，`.delivering-` 预约/TTL 记差异（manifest.ts 行注）。
//   - 帧格式：`Team message <id> from <name>:` —— 原生帧语义（Q-8 B1：
//     dsh-experimental-agent-team/lib/index.js:971-975 deliveryContent 的
//     文本形态；q3 run 的 spliced 帧逐字对照面）。经原生 ctx.subagents.
//     sendMessage 投递的载体承**原生 kind 'agent-message'**（continuation-
//     messages.js:8-14 agentMessageSource 的唯一构造点；Q-8 B3——omo 不改写
//     kind，帧文本在 content 内自标识）；`<id>` = correlationId ?? 生成
//     uuid，`<name>` = 发送者成员名或 lead sentinel。
//
// ── 投递面（fork (B) 已定，FORK.md §3.4 / 任务书 P5-T6）──────────────────
// 原生 `ctx.subagents.sendMessage(sender, targetSessionId, content, {signal})`
// 是**相邻**投递通道（dsh-subagent types/index.d.ts:157 逐字：*"Steer one
// model-authored message to the sender's direct parent or direct continuable
// child"*；实装 :1762-1775：sender 必须是**精确活体 Agent**，父方向走
// sendToParent，其余走 deliverToChild）：
//   * lead→member：sender = exec.agent（活体 lead），target = 成员 childId
//     ——直通（缺席成员由原生 coldResume 唤醒，Q-5b 条 3 实证）；
//   * member→lead：sender = exec.agent（活体成员），target = leadSessionId
//     ——直通（sendToParent；lead 不活原生响亮 PARENT_UNAVAILABLE，:1862）；
//   * **member↔member：非相邻**——原生无此边。工具层做 **lead 中转**：
//     以 `ctx.agents.get(leadSessionId)` 现取活体 lead 作 sender，把帧
//     投给目标成员；帧文本注明 `from <发送者> (relayed via lead)`——
//     中转事实对收件模型可见。**记差异**（覆盖基线已登记，manifest.ts
//     team_send_message 行 nativeFace 同词）：上游 mailbox 里成员互投是
//     平级直达，(B) 形态经 lead 承运，收件帧的 durable source 是 lead 的
//     'agent-message' relay（senderSessionId=lead），发送者名字住在帧文本里。
//
// ── 广播（仅 lead）───────────────────────────────────────────────────────────
// to='*'：lead 调用 = 逐成员投递（活跃成员序 = 状态骨架成员序；lead 自己
// 不收——上游 leadRecipient 在 v1 相邻面上不可达，记差异）；成员调用 =
// BroadcastNotPermittedError 语义具名拒（文案逐字「broadcast requires lead
// role」，send.ts:19）。广播正文与单投同帧同 kind。
//
// ── 重投去重（R-6）──────────────────────────────────────────────────────────
// messageId = correlationId ?? randomUUID()；去重账 = team-state.ts 的
// processedMessageIds（原子「查+记」markMessageProcessed）。**先记后投
// （账本 reservation，非上游 `.delivering-` 预约——那不移植，:23 已成文）**：
// 并发同 id 只有一个拿到入账位——先入账才碰原生通道，
// 「不重复投递」才不是查与投之间的竞态空话；单收件人投递失败 → 补偿退账
// （unmarkMessageProcessed，同 id 重试可再投）；广播**部分**失败 → **不退账**
// （宁漏不重，重投须换新 correlationId）；广播**零投递**失败（首个成员即失败）
// → **退账**（P5-T16 评审 MAJOR-2 更正：零投递时无人收到过，把 id 烧在去重
// 账里等于整条广播静默消失，而模型最自然的动作就是拿同一个 id 重试）。
// 同 id 重投（入账位已被占）→ 不再调用原生通道，返回去重说明
// （delivered:false, deduplicated:true）。时序与 team-state.ts
// markMessageProcessed/unmarkMessageProcessed 的账注逐点对齐。
//
// ── 与上游的其他成文差异（v1）───────────────────────────────────────────────
// * summary/references 参数在册（形状对齐），v1 不进帧文本——上游
//   deliveryContent 同样只发 `<id>/<name>` 前缀 + body（Q-8 B1 逐字），
//   summary 的消费面在上游 poll envelope（Q1b §C-5），(B) 形态无 poll。
// * shutdown kind 禁令由 schema enum 结构性承担（词表只有 message/
//   announcement，T7 的 shutdown kind 各自成工具——上游 messaging.ts:82-84
//   「must use lifecycle tools for shutdown kinds」的同一裁决面）。
// * 广播部分失败：整条消息一个去重 id，扇出中某成员投递抛 → 响亮冒泡
//   （点名成员与已投计数——DELIVERY_FAILED 文本实携
//   `(N delivered before failure)`，N = deliveries.length = 失败点前
//   已投成功数），预约账**不退**（R-6 不对称的广播臂）——同 id
//   重试会被整条去重（宁漏不重），补投须换新 id。差异记此（NOTES 同步）。
//   **零投递例外**（P5-T16 评审 MAJOR-2）：首个成员即失败（deliveries 为空）
//   时预约账**退**——此时无人收到过，同 id 重试可再投；错误文本同步改口
//   （"no member received the message, so the correlationId reservation is
//   released; re-send under the SAME correlationId"）。
// * bounds 执法面：v1 仅执法 payload 32 KB（PAYLOAD_TOO_LARGE 臂）；上游
//   RuntimeBounds 的 `maxMessagesPerRun`（10000/run）v1 **不执法**，差异记
//   此（Q1a §7 对账口径；team-state.ts bounds 常量注同词登记）。
//
// strip-only 纪律（T5 NOTES-6）：本文件不用参数属性；零 @deepseek-ai
// import（宿主面全部最小结构化声明，team-create.ts 同款纪律）。

import { randomUUID } from 'node:crypto'
import {
  ACTIVE_TEAM_RUNTIME_STATUSES,
  TEAM_LEAD_SENTINEL,
  TEAM_MESSAGE_DELIVERABLE_PHASES,
  TEAM_MESSAGE_PAYLOAD_MAX_BYTES,
  type TeamStateStore,
} from '../team/team-state.ts'
import type { TeamAgent } from './team-create.ts'

/** 工具名（manifest.ts team_send_message 行的 id 同一词汇）。 */
export const TEAM_SEND_MESSAGE_TOOL_NAME = 'team_send_message'

/** 广播收件人哨兵（上游 messaging.ts:47 `"Recipient name or * for broadcast"`）。 */
export const TEAM_BROADCAST_RECIPIENT = '*'

/** 工具层 kind 词表，上游 MESSAGE_TOOL_KINDS（messaging.ts:18）逐字镜像。 */
export const TEAM_MESSAGE_TOOL_KINDS = ['message', 'announcement'] as const
export type TeamMessageToolKind = (typeof TEAM_MESSAGE_TOOL_KINDS)[number]

/** correlationId 的 uuid 形（上游 z.uuid() 的运行时对应物）。 */
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/** 本文件的日志前缀（与 team-create.ts 的工具层前缀体例对称）。 */
const LOG_PREFIX = '[omo-team team_send_message]'

// ── 宿主面的最小结构化声明（零 @deepseek-ai import）─────────────────────────
// sendMessage 的真实形状 = dsh-subagent types/index.d.ts:157（sender 必须精确
// 活体、相邻、返回受理 messageId）；agents.get 的真实形状 = dsh-agent
// types/index.d.ts:343 `get(id: SessionId): Agent | undefined`（活体注册表，
// q5b-seat-plugin 的驻留观测即读此面）。本文件收窄到消息工具用得到的子集。

/** 原生相邻投递通道的结构化子集。 */
export interface TeamMessageSendChannel {
  sendMessage(
    sender: TeamAgent,
    targetSessionId: string,
    content: readonly { type: 'text'; text: string }[],
    options: { signal: AbortSignal },
  ): Promise<unknown>
}

/** 活体 Agent 注册表的结构化子集（中转取 lead + 投递时驻留观测）。 */
export interface TeamLiveAgents {
  get(sessionId: string): TeamAgent | undefined
}

/** 工具层装配依赖（单测注入 mock，生产由 index.ts 供真件）。 */
export interface TeamMessageDeps {
  readonly subagents: TeamMessageSendChannel
  readonly agents: TeamLiveAgents
  readonly store: TeamStateStore
}

/** execute 的第二参（与 team-create.ts 的 TeamToolExec 同一形状）。 */
interface TeamMessageToolExec {
  readonly agent?: TeamAgent
  readonly signal: AbortSignal
}

/**
 * 消息工具错误族：具名 code + 上游语义文案（错误族清单见文件头）。
 * 显式字段 + 构造体内赋值（strip-only 禁参数属性，T5 NOTES-6）。
 */
export class TeamMessageError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'TeamMessageError'
    this.code = code
  }
}

/** 单收件人的投递结果行（广播 = N 行）。residentAtSend = 投递前一刻的
 * 活体观测（Q-5b 金丝雀的工具级对应面：false = 缺席，原生 coldResume 唤醒）。 */
export interface TeamMessageDelivery {
  readonly to: string
  readonly sessionId: string
  readonly delivered: true
  readonly relayed: boolean
  readonly residentAtSend: boolean
}

/** team_send_message 的成功返回（去重路径 delivered:false）。 */
export interface TeamSendMessageResult {
  readonly teamRunId: string
  readonly messageId: string
  readonly kind: TeamMessageToolKind
  readonly delivered: boolean
  readonly deduplicated: boolean
  readonly deliveries: readonly TeamMessageDelivery[]
  readonly note: string
}

/** 发送者身份（lead 恒 sentinel 称谓；成员带成员名——帧文本的 from 词）。 */
type TeamMessageSender =
  | { readonly role: 'lead'; readonly name: typeof TEAM_LEAD_SENTINEL }
  | { readonly role: 'member'; readonly name: string }

/**
 * 帧前缀（上游 deliveryContent 语义，Q-8 B1）：直投 `Team message <id> from
 * <name>:`；lead 中转帧在同一前缀内注明 `(relayed via lead)`——中转事实进
 * 帧文本，对收件模型可见（记差异的文件头段）。
 */
export function buildTeamMessageFramePrefix(messageId: string, senderName: string, relayed: boolean): string {
  return relayed
    ? `Team message ${messageId} from ${senderName} (relayed via ${TEAM_LEAD_SENTINEL}):`
    : `Team message ${messageId} from ${senderName}:`
}

/** 帧 content = [前缀块, body 块]——q3 run spliced 帧逐字对照的两块形态。 */
export function buildTeamMessageContent(
  messageId: string,
  senderName: string,
  body: string,
  relayed: boolean,
): readonly { type: 'text'; text: string }[] {
  return [
    { type: 'text', text: buildTeamMessageFramePrefix(messageId, senderName, relayed) },
    { type: 'text', text: body },
  ]
}

/**
 * 参数清洗（上游 zod 形状的运行时对应，Q1a §2.6）：teamRunId/to min(1)、
 * kind 词表、correlationId 空串→undefined + uuid 形。全部具名抛。
 */
function validateMessageArgs(args: {
  teamRunId?: unknown
  to?: unknown
  body?: unknown
  kind?: unknown
  correlationId?: unknown
  summary?: unknown
  references?: unknown
}): {
  teamRunId: string
  to: string
  body: string
  kind: TeamMessageToolKind
  correlationId?: string
} {
  if (typeof args.teamRunId !== 'string' || args.teamRunId.length === 0) {
    throw new TeamMessageError('team_send_message requires a non-empty teamRunId', 'TEAM_RUN_ID_REQUIRED')
  }
  if (typeof args.to !== 'string' || args.to.length === 0) {
    throw new TeamMessageError('team_send_message requires a non-empty to (recipient name or *)', 'RECIPIENT_REQUIRED')
  }
  if (typeof args.body !== 'string') {
    throw new TeamMessageError('team_send_message requires a string body', 'BODY_REQUIRED')
  }
  if (Buffer.byteLength(args.body, 'utf8') > TEAM_MESSAGE_PAYLOAD_MAX_BYTES) {
    // 上游 PayloadTooLargeError 文案逐字承载 + 本仓同名常量与实测字节数
    //（send.ts:26；上限 = TEAM_MESSAGE_PAYLOAD_MAX_BYTES，不可配置 v1）。
    throw new TeamMessageError(
      `payload exceeds 32 KB (message_payload_max_bytes=${TEAM_MESSAGE_PAYLOAD_MAX_BYTES}, got ${Buffer.byteLength(args.body, 'utf8')})`,
      'PAYLOAD_TOO_LARGE',
    )
  }
  const kind: TeamMessageToolKind = args.kind === undefined || args.kind === null
    ? 'message'
    : (TEAM_MESSAGE_TOOL_KINDS as readonly unknown[]).includes(args.kind)
      ? (args.kind as TeamMessageToolKind)
      : (() => {
        throw new TeamMessageError(
          `unknown team message kind '${String(args.kind)}' — allowed: ${TEAM_MESSAGE_TOOL_KINDS.join(', ')}`,
          'UNKNOWN_KIND',
        )
      })()
  let correlationId: string | undefined
  if (args.correlationId === '' || args.correlationId === null) {
    correlationId = undefined // 上游 preprocess 逐字：value === "" ? undefined
  } else if (args.correlationId !== undefined) {
    if (typeof args.correlationId !== 'string' || !UUID_PATTERN.test(args.correlationId)) {
      throw new TeamMessageError(
        `correlationId must be a UUID (do not use task IDs like 'task-1')`,
        'INVALID_CORRELATION_ID',
      )
    }
    correlationId = args.correlationId
  }
  return { teamRunId: args.teamRunId, to: args.to, body: args.body, kind, ...(correlationId === undefined ? {} : { correlationId }) }
}

/**
 * 执行链主体（导出供单测以结构化 mock 逐字段断言调用序与实参）。
 * 序：参数清洗 → team 在场 → 参与者身份（非参与者具名拒，上游 gating 文案）
 * → 广播 lead-only → 收件人解析（含相邻/中转判定）→ 去重原子闸（先记后投，
 * R-6）→ 原生投递。一切失败具名冒泡，不静默；账目补偿走不对称（单收件人
 * 投递失败 → 补偿退账；广播部分失败 → 不退；文件头 R-6 段）。
 */
export async function executeTeamSendMessage(
  args: {
    teamRunId?: unknown
    to?: unknown
    body?: unknown
    kind?: unknown
    correlationId?: unknown
    summary?: unknown
    references?: unknown
  },
  exec: TeamMessageToolExec,
  deps: TeamMessageDeps,
): Promise<TeamSendMessageResult> {
  const clean = validateMessageArgs(args)
  const caller = exec.agent
  if (caller === undefined) {
    throw new TeamMessageError(
      'team_send_message: exec.agent is undefined — the tool needs the live calling agent to authorize delivery',
      'CALLER_MISSING',
    )
  }

  // 1) team 不存在具名拒（错误族第一枚）。
  const state = deps.store.get(clean.teamRunId)
  if (state === undefined) {
    throw new TeamMessageError(
      `team_send_message: no team run '${clean.teamRunId}' in the team state store`,
      'TEAM_NOT_FOUND',
    )
  }
  // 2) run 状态闸：deleting/deleted 拒收（上游 assertTeamAcceptsMessages
  //    语义，send.ts:67-80）；failed/orphaned 无活体收件人，同一具名族。
  if (state.status === 'deleting') {
    throw new TeamMessageError('team is deleting', 'TEAM_DELETING')
  }
  if (state.status === 'deleted') {
    throw new TeamMessageError(`team ${clean.teamRunId} is deleted`, 'TEAM_DELETED')
  }
  if (!ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) {
    throw new TeamMessageError(
      `team run ${clean.teamRunId} is ${state.status} — no live recipients to deliver to`,
      'TEAM_NOT_ACTIVE',
    )
  }

  // 3) 参与者身份：lead 臂查 lead 账，成员臂查成员账；两臂皆空 = 上游
  //    gating 的 non-participant 拒（文案逐字承载，Q1a:234）。
  const callerSessionId = caller.session.header.id
  const isLead = state.leadSessionId === callerSessionId
  const memberParticipation = isLead ? undefined : deps.store.participationOfMember(callerSessionId)
  if (!isLead && memberParticipation?.teamRunId !== clean.teamRunId) {
    throw new TeamMessageError(
      `team-mode tool ${TEAM_SEND_MESSAGE_TOOL_NAME} denied: not a participant of team ${clean.teamRunId}`,
      'NOT_PARTICIPANT',
    )
  }
  const sender: TeamMessageSender = isLead
    ? { role: 'lead', name: TEAM_LEAD_SENTINEL }
    : { role: 'member', name: memberParticipation!.memberName }

  // 4) 广播 lead-only（send.ts:19 文案逐字；messaging.ts:86-88 硬规则同臂）。
  const isBroadcast = clean.to === TEAM_BROADCAST_RECIPIENT
  if (isBroadcast && sender.role !== 'lead') {
    throw new TeamMessageError('broadcast requires lead role', 'BROADCAST_NOT_PERMITTED')
  }

  // 5) 收件人解析。
  const messageId = clean.correlationId ?? randomUUID()
  const invalidRecipient = (recipient: string): TeamMessageError =>
    new TeamMessageError(`unknown or inactive team recipient: ${recipient}`, 'INVALID_RECIPIENT')

  // 两形目标：直投（sender = caller）与 lead 中转。中转臂把解析段（步骤 5）
  // 已验活的活体 lead 以 relaySender 随 target 带进投递循环**复用**——跨
  // await 再解析会新开一个 lead 驱逐窗口（评审 T6-2 修的正是这个竞态）。
  interface ResolvedDirectTarget {
    readonly name: string
    readonly sessionId: string
    readonly relayed: false
  }
  interface ResolvedRelayTarget {
    readonly name: string
    readonly sessionId: string
    readonly relayed: true
    readonly relaySender: TeamAgent
  }
  type ResolvedTarget = ResolvedDirectTarget | ResolvedRelayTarget
  let targets: ResolvedTarget[]
  if (isBroadcast) {
    // lead 广播 = 逐活跃成员投递；lead 自己不收（leadRecipient 在相邻面
    // 不可达——self-delivery 非边，差异成文于文件头）。
    targets = state.members
      .filter((member) => member.sessionId !== undefined && TEAM_MESSAGE_DELIVERABLE_PHASES.has(member.phase))
      .map((member) => ({ name: member.name, sessionId: member.sessionId as string, relayed: false }))
    if (targets.length === 0) {
      throw invalidRecipient(clean.to)
    }
  } else {
    if (clean.to === TEAM_LEAD_SENTINEL) {
      if (state.leadSessionId === undefined) {
        throw invalidRecipient(clean.to)
      }
      // lead 给自己投递不是相邻边（原生无 self 弧）——具名拒，差异成文。
      if (sender.role === 'lead') {
        throw new TeamMessageError(
          `self-delivery to the lead is not an adjacent edge on the native relay surface (sender is already the lead of team ${clean.teamRunId})`,
          'SELF_DELIVERY_NOT_ADJACENT',
        )
      }
      targets = [{ name: TEAM_LEAD_SENTINEL, sessionId: state.leadSessionId, relayed: false }]
    } else {
      const row = state.members.find((m) => m.name === clean.to)
      if (row === undefined || row.sessionId === undefined || !TEAM_MESSAGE_DELIVERABLE_PHASES.has(row.phase)) {
        throw invalidRecipient(clean.to)
      }
      if (sender.role === 'lead') {
        targets = [{ name: row.name, sessionId: row.sessionId, relayed: false }]
      } else {
        if (row.sessionId === callerSessionId) {
          throw new TeamMessageError(
            `self-delivery to member '${row.name}' is not an adjacent edge (the caller is that member)`,
            'SELF_DELIVERY_NOT_ADJACENT',
          )
        }
        // member↔member 非相邻 → lead 中转（文件头「投递面」段的记差异臂）：
        // 活体 lead 在解析段取一次、验一次活（ctx.agents.get 与原生 UNAUTHORIZED
        // 校验同一查法，dsh-subagent index.js:1763），lead 不活即响亮拒，不静默
        // 降级；验活的 relayLead 随 target 带进投递循环复用（ResolvedRelayTarget
        // .relaySender）——不在循环里跨 await 重解析，驱逐窗口由此关闭。
        // 先判后取：leadSessionId 缺席即响亮拒，不对活体注册表做 `get('')`
        // 哨兵查找（dsh-agent index.d.ts:343 的 get 面不以空串为合法查询）；
        // 两臂同一错误族 RELAY_LEAD_NOT_LIVE，文本与改前
        // `String(state.leadSessionId)` 的渲染逐字节一致（undefined 臂渲染
        // "undefined"，行为零漂移）。
        if (state.leadSessionId === undefined) {
          throw new TeamMessageError(
            `member-to-member delivery needs the live lead of team ${clean.teamRunId} as relay — lead session undefined is not live`,
            'RELAY_LEAD_NOT_LIVE',
          )
        }
        const relayLead = deps.agents.get(state.leadSessionId)
        if (relayLead === undefined) {
          throw new TeamMessageError(
            `member-to-member delivery needs the live lead of team ${clean.teamRunId} as relay — lead session ${state.leadSessionId} is not live`,
            'RELAY_LEAD_NOT_LIVE',
          )
        }
        targets = [{ name: row.name, sessionId: row.sessionId, relayed: true, relaySender: relayLead }]
      }
    }
  }

  // 6) R-6 去重原子闸：整条消息一个 id（广播 = 整条一个 id，扇出部分
  //    失败的后果成文于文件头）。见过 → 不再调用原生通道，返回去重说明。
  //
  //    P5-T16（评审 MAJOR-2）：去重账**满载**时 store 抛具名
  //    `MESSAGE_LEDGER_FULL`（显式拒收，不裁剪任何一条——裁剪会让补偿退账
  //    永久丢失被挤掉那条的去重记忆）。这里把它**翻译成本工具的错误族**
  //    （响亮、可恢复：换新 correlationId 即可继续），不把 store 的内部码
  //    泄给模型。
  let reserved = false
  try {
    reserved = await deps.store.markMessageProcessed(clean.teamRunId, messageId)
  } catch (err) {
    if (err instanceof TeamMessageError) throw err
    const code = (err as { code?: unknown } | undefined)?.code
    if (code === 'MESSAGE_LEDGER_FULL') {
      throw new TeamMessageError(
        `team_send_message: ${err instanceof Error ? err.message : String(err)}`,
        'MESSAGE_LEDGER_FULL',
      )
    }
    throw err
  }
  if (!reserved) {
    const note = `duplicate message id: ${messageId} was already delivered for team ${clean.teamRunId} — not delivered again (deduplicated)`
    console.log(`${LOG_PREFIX} deduplicated ${messageId} for team ${clean.teamRunId}`)
    return {
      teamRunId: clean.teamRunId,
      messageId,
      kind: clean.kind,
      delivered: false,
      deduplicated: true,
      deliveries: [],
      note,
    }
  }

  // 7) 原生投递（逐目标）。residentAtSend = 投递前一刻活体观测（金丝雀的
  //    工具级对应面）。任一目标抛 → 响亮冒泡（点名成员）；退账按 R-6 的
  //    不对称（单收件人 → 补偿退账可重试；广播部分失败 → 不退，宁漏不重）。
  const deliveries: TeamMessageDelivery[] = []
  for (const target of targets) {
    const relayed = target.relayed
    const content = buildTeamMessageContent(messageId, sender.name, clean.body, relayed)
    // sender 复用：直投臂 = caller 本体；中转臂 = 解析段已验活的 lead
    // （target.relaySender）——不在这里跨 await 重解析 agents.get（那正是
    // lead 驱逐窗口的竞态，评审 T6-2）；非空断言随之绝迹，判别式联合钉死。
    const deliverySender = target.relayed ? target.relaySender : caller
    const residentAtSend = deps.agents.get(target.sessionId) !== undefined
    try {
      await deps.subagents.sendMessage(deliverySender, target.sessionId, content, { signal: exec.signal })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      // 补偿退账的不对称（文件头成文）：单收件人投递失败 → 退账，同 id
      // 重试可再投（消息从未送达，不该被「已送达」的账拦）；广播**部分**失败
      // → **不退**（退了会对已收到的成员重投——宁漏不重，补投须换新 id）；
      // 广播**零投递**失败（首个成员即失败，deliveries.length === 0）→ **退账**
      // （P5-T16 评审 MAJOR-2）：此时**一个成员都没收到**，把 correlationId 烧在
      // 去重账里等于让整条广播静默消失——模型看到 DELIVERY_FAILED 后最自然的
      // 动作是拿同一个 correlationId 重试（工具描述第 505 行还明写着「Re-sending
      // the same correlationId is deduplicated: it is not delivered twice」），而
      // 旧行为会把它变成 `deduplicated:true, delivered:false, deliveries:[]`
      // ——读起来像「已经发过了」，实则全丢。零投递时根本不存在「重」的余地
      // （没有收件人收到过），退账不违反「宁漏不重」，只把「零投递」与
      // 「部分投递」分账。
      const zeroDeliveryBroadcast = isBroadcast && deliveries.length === 0
      if (!isBroadcast || zeroDeliveryBroadcast) {
        await deps.store.unmarkMessageProcessed(clean.teamRunId, messageId)
      }
      // 广播臂实况计数（文件头差异段「点名成员与已投计数」的成文兑现）：
      // deliveries 此刻 = 扇出序中失败点之前已投成功的成员——随 throw 丢弃
      // 会白丢实况，拼进错误文本 `(N delivered before failure)`。
      throw new TeamMessageError(
        `team_send_message: delivery to ${isBroadcast ? 'broadcast member' : 'member'} '${target.name}' (${target.sessionId}) failed: ${reason}${isBroadcast ? ` (${deliveries.length} delivered before failure) — ${zeroDeliveryBroadcast ? 'no member received the message, so the correlationId reservation is released; re-send under the SAME correlationId' : 'broadcast ledger keeps the reservation; re-deliver under a NEW correlationId'}` : ''}`,
        'DELIVERY_FAILED',
      )
    }
    deliveries.push({ to: target.name, sessionId: target.sessionId, delivered: true, relayed, residentAtSend })
    console.log(
      `${LOG_PREFIX} delivered ${messageId} ${relayed ? 'via lead relay ' : ''}to '${target.name}' (session ${target.sessionId}, residentAtSend=${residentAtSend})`,
    )
  }

  return {
    teamRunId: clean.teamRunId,
    messageId,
    kind: clean.kind,
    delivered: true,
    deduplicated: false,
    deliveries,
    note: isBroadcast
      ? `broadcast ${messageId} delivered to ${deliveries.length} member(s)`
      : `message ${messageId} delivered to '${deliveries[0]!.to}'`,
  }
}

/**
 * team_send_message 的工具定义（dsh-tools raw register 方言，team_create 同
 * 款纪律：required 只挂 type:'object' 节点；output 必携 {schema, render}）。
 * parameters 逐字段对齐上游 zod 形状（Q1a §2.6）；描述词承载上游词汇
 * （"Send a message to a team member or broadcast to the team." /
 *  "Recipient name or * for broadcast" / correlationId 的 task-ID 告诫）。
 */
export function createTeamSendMessageDefinition(deps: TeamMessageDeps): unknown {
  return {
    name: TEAM_SEND_MESSAGE_TOOL_NAME,
    description:
      'Send a message to a team member or broadcast to the team. '
      + 'Recipients: a member name, \'' + TEAM_LEAD_SENTINEL + '\' (the leading session), or * for broadcast — broadcast requires the lead role. '
      + 'Delivery rides the native adjacent-relay channel: lead↔member direct; member-to-member is relayed through the lead and the frame says so. '
      + 'An offline recipient is woken by the delivery itself. '
      + 'Re-sending the same correlationId is deduplicated: it is not delivered twice. '
      + 'A failed delivery that reached NO recipient releases the id, so you may retry that same correlationId; '
      + 'a broadcast that reached SOME recipients keeps the id and must be re-sent under a NEW correlationId.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['teamRunId', 'to', 'body'],
      properties: {
        teamRunId: { type: 'string', minLength: 1, description: 'Active team run id (from team_create).' },
        to: { type: 'string', minLength: 1, description: 'Recipient name or * for broadcast.' },
        body: { type: 'string', description: `Message body, at most ${TEAM_MESSAGE_PAYLOAD_MAX_BYTES} bytes.` },
        kind: {
          type: 'string',
          enum: [...TEAM_MESSAGE_TOOL_KINDS],
          description: 'Message kind (shutdown kinds live on the lifecycle tools, not here).',
        },
        correlationId: {
          type: 'string',
          description: 'Optional UUID correlation ID. Do not use task IDs like \'task-1\'.',
        },
        summary: { type: 'string', description: 'Optional one-line summary.' },
        references: {
          type: 'array',
          description: 'Optional file references.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path'],
            properties: {
              path: { type: 'string', minLength: 1 },
              description: { type: 'string' },
            },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['teamRunId', 'messageId', 'kind', 'delivered', 'deduplicated', 'deliveries', 'note'],
        properties: {
          teamRunId: { type: 'string' },
          messageId: { type: 'string' },
          kind: { type: 'string', enum: [...TEAM_MESSAGE_TOOL_KINDS] },
          delivered: { type: 'boolean' },
          deduplicated: { type: 'boolean' },
          deliveries: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['to', 'sessionId', 'delivered', 'relayed', 'residentAtSend'],
              properties: {
                to: { type: 'string' },
                sessionId: { type: 'string' },
                delivered: { type: 'boolean' },
                relayed: { type: 'boolean' },
                residentAtSend: { type: 'boolean' },
              },
            },
          },
          note: { type: 'string' },
        },
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (
      args: {
        teamRunId?: unknown
        to?: unknown
        body?: unknown
        kind?: unknown
        correlationId?: unknown
        summary?: unknown
        references?: unknown
      },
      exec: TeamMessageToolExec,
    ) => executeTeamSendMessage(args, exec, deps),
  }
}

/**
 * 按角色分发的 agent/created 装配（T6 交付面 2——双面同装，上游 UNIVERSAL
 * 名单语义，hook.ts:12-19：lead+member 皆可调；非参与者根本没有这张面）：
 *   * 根会话 → lead 面追加 team_send_message（与 team_create 同一 scoped 口，
 *     两个 listener 各装各的——一 manifest 行一 registrar）；
 *   * team 子女（byMemberSession 命中 + ACTIVE 状态闸，team-create.ts 同一
 *     闸序）→ member 面装 team_send_message（成员回报/互投的唯一出口）；
 *   * 其他子女 → 什么都不装。
 * 结构无 team_create 的成员面纪律不受影响（本 listener 不碰 team_create）。
 *
 * 返回 disposer（订阅退订；已 scoped 安装的贡献随各 agent dispose 自动 unwind）。
 */
export function registerTeamMessageSurface(
  ctx: {
    on(event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown): unknown
  },
  deps: TeamMessageDeps,
): () => void {
  const off = ctx.on('agent/created', ({ agent }) => {
    const header = agent.session.header
    const isChild = header.origin === 'subagent' || header.parentSession !== undefined
    if (!isChild) {
      // lead 面：team_send_message 与 team_create 并行同装（各自 registrar 的
      // scoped 贡献，互不重叠）。T7 占位：team_delete 随 T7 落此 scoped 口。
      agent.ctx.tools.register(createTeamSendMessageDefinition(deps))
      console.log(`${LOG_PREFIX} lead message surface installed on root session ${header.id}`)
      return
    }
    const participation = deps.store.participationOfMember(header.id)
    if (participation === undefined) return
    const state = deps.store.get(participation.teamRunId)
    if (state === undefined) {
      // 与 team-create.ts 成员臂同一响亮纪律（账与状态同 commit 维护）。
      console.warn(
        `${LOG_PREFIX} impossible state: member session ${header.id} has a participation row for team run ${participation.teamRunId} but that run's state is missing from the store — message surface NOT installed`,
      )
      return
    }
    // 状态闸与 team-create.ts 成员面同套：终态账是诊断面，不是分发依据。
    if (!ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) return
    agent.ctx.tools.register(createTeamSendMessageDefinition(deps))
    console.log(`${LOG_PREFIX} member message surface installed on session ${header.id} (team ${participation.teamRunId})`)
  })
  return () => {
    if (typeof off === 'function') (off as () => void)()
  }
}
