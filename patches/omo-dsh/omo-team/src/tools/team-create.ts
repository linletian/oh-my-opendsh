// team-create.ts — P5-T5 · team_create 工具（组建路径 + per-member 路由）。
//
// ── 语义移植声明（SEMANTIC PORT, NOT A COPY）────────────────────────────────
// 上游源路径（署名，OMO tag v4.19.4 = commit b072d279110bdda2c6ac2525d0d24dc54d16148a）：
//   - packages/omo-opencode/src/features/team-mode/lifecycle-create-tool.ts
//     —— team_create 的工具骨架（参数 union、执行序「解析→校验→嵌套闸→
//     spawn→active」、错误冒泡形态）；逐字段语义在 Q1a-tools-lifecycle.md
//     §2/§3 对账（v1 收窄：inline_spec 单臂，teamName 命名 spec = 记差异，
//     manifest.ts team_create 行成文）。
//   - packages/omo-opencode/src/features/team-mode/team-tool-gating/hook.ts
//     :102-108 —— 嵌套闸文案的真实出处：lead 与 member 都计入 participant，
//     `team_create denied: session is already a participant of team <id>` 的
//     语义逐字承载于本文件的 gate（Q1a §2.0 引文在档）。
//   - packages/senpi-task/src/team/spawn-members.ts:146-157 —— 成员 briefing
//     的 senpi 5 行版（identity / work-arrives-as-injected-messages /
//     report-to-lead-then-end-turn / no-child-delegation / wrap-up-summary）：
//     本文件的 buildTeamBriefingText 是其**语义移植**（DSH 载体措辞：注入
//     消息 = agent.inject 的 durable UserMessage，见「briefing 机制」段），
//     不是逐字复制；omo-opencode 的 member-guidance 版是**对照面**（其
//     「不再派生子女」纪律同一，载体不同）。
//   - packages/senpi-task/src/team/normalize.ts:40-42 —— 成员 label 惯例
//     `team:<teamRunId>:<memberName>`：本文件的 buildTeamMemberLabel 逐字
//     承载该词汇（fork (B) 沿用 senpi 命名空间，UI 上一眼可辨团队子女）。
//   - packages/omo-opencode/src/.../team-spec-input-normalizer.ts:127 ——
//     成员无 prompt 时的兜底初始指令语义：本文件以固定英文句承载（任务书
//     钉死默认句），不 import 上游件。
//
// ── briefing 机制：独立注入的 UserMessage，禁止并入 spawn prompt 正文 ──────
// 机制先例 = patches/omo-dsh/omo-agents/src/hard-blocks-injection.ts:134-141
// 的调用形状（origin==='subagent' 门 + agent.inject({id, role:'user',
// content:[{type:'text',text}], source:{kind, plugin, form:'instructions'}})），
// 本文件同构复用：
//   * source.kind = 'omo-team-briefing'（Q-8 的 canary 锚：成员会话日志里
//     briefing 帧的 source.kind 必须与 native 初始 prompt 帧的 kind:'user'
//     （dsh-subagent/lib/index.js:1738-1739 withContinuableReturnGuidance 的
//     盖章）可区分——两类帧各证各的，briefing 文本混进 kind:'user' 帧即
//     Q-8 违例）；
//   * 注入点在 agent/created 监听内（宿主对监听**串行 await**，
//     dsh-agent runtime-types.d.ts:139 区段），先于成员首个 pre-step——
//     briefing 必在成员第一次模型请求前入会话；
//   * **禁止并入 spawn prompt 正文**：request.prompt 只装调用方给的
//     member.prompt（缺省 = TEAM_MEMBER_DEFAULT_INITIAL_PROMPT），briefing
//     走独立注入帧——两帧两源，审计面才能分开「用户意图」与「运行时纪律」
//     （Q-8 §3 的分离命题；混装即无法证伪 briefing 是否泄漏进用户帧）。
//
// ── 执行链（任务书 P5-T5 钉死的五段序）────────────────────────────────────
// parse（T4 parseTeamSpec，object|JSON string 直吃）→ member-validator 逐
// 成员资格（拒绝具名、reason 原文冒泡为工具错误文本）→ 嵌套闸（participant
// 账查 team-state.ts，上游 hook.ts:102-108 文案）→ 状态机 creating → 逐成员
// startContinuable（三件套 = roster-seats.ts 席位值）→ active。
// 首败回滚：任一成员 startContinuable 拒绝 → 先翻 failed（嵌套闸即时松绑，
// lead 可重试）→ 已建成员逐个 interrupt（authority 'ancestor' 携 lead 活
// agent，dsh-subagent types.d.ts interrupt 的 lineage 校验语义）→
// drainContinuableChildren 释放驻留句柄 → 工具错误文本点名失败成员与回滚
// 计数。回滚自身 faults 不吞（并入错误文本，响亮优于静默）。
//
// childId 预留：randomUUID() 在 create 前入 store 成员索引（ContinuableStart
// .childId 的 caller-reserved 语义，types.d.ts:33-37「durable parent record
// provisioning before child materialization」）——agent/created 事件到达时
// participationOfMember 必已在场，按角色分发不竞态。startContinuable 返回的
// childId 与预留值不符 = 宿主违约，响亮抛（回滚链接管）。

import { randomUUID } from 'node:crypto'
import { parseTeamSpec } from '../team/team-spec.ts'
import { resolveTeamSeat, type TeamSeatTrio } from '../team/roster-seats.ts'
import {
  ACTIVE_TEAM_RUNTIME_STATUSES,
  TEAM_LEAD_SENTINEL,
  type TeamStateMemoryStore,
} from '../team/team-state.ts'

/** 工具名（manifest.ts team_create 行的 id 同一词汇）。 */
export const TEAM_CREATE_TOOL_NAME = 'team_create'

/** briefing 注入帧的 source.kind（Q-8 canary 锚）与 source.plugin。 */
export const TEAM_BRIEFING_SOURCE_KIND = 'omo-team-briefing'
export const TEAM_BRIEFING_SOURCE_PLUGIN = 'omo-team'

/**
 * 成员缺省初始指令（上游 team-spec-input-normalizer.ts:127 的兜底语义承载，
 * 任务书钉死英文句）。member.prompt 在场则原文用之——用户意图不改写。
 */
export const TEAM_MEMBER_DEFAULT_INITIAL_PROMPT =
  'Work on the assigned team task and report findings to the lead.'

/** 本文件的日志前缀（与 index.ts 的 `[omo-team]` 面区分：工具层事件独立前缀）。 */
const LOG_PREFIX = '[omo-team team_create]'

// ── 宿主面的最小结构化声明（零 @deepseek-ai import，duck-typed ctx 纪律）────
// 每个成员的形状都对照 dsh 安装件的真实类型收窄到本文件用得到的子集；
// 真实类型：dsh-subagent/lib/types/types.d.ts（ContinuableStartSpec/
// ContinuableStart/SubagentInterruptAuthority）与 dsh-agent/lib/types/
// runtime-types.d.ts（Agent.inject / agent/created payload / Agent.ctx）。

/** startContinuable.request 的结构化子集（SubagentStartRequest 去 label/signal/outputSchema）。 */
export interface TeamMemberStartRequest {
  readonly prompt: readonly { type: 'text'; text: string }[]
  readonly parent: TeamAgent
  readonly agentOptions?: { provider: string; model: string }
  readonly persona?: string
  readonly toolFilter?: { deny?: readonly string[]; allow?: readonly string[] }
  readonly maxDepth?: number
}

/** 成员建立通道的结构化面（ctx.subagents 的 T5 子集；index.ts 的 inject 面同名）。 */
export interface TeamContinuableChannel {
  startContinuable(spec: {
    provider: string
    label: string
    childId?: string
    request: TeamMemberStartRequest
    signal: AbortSignal
  }): Promise<{ childId: string; messageId: string }>
  interrupt(targetSessionId: string, authority: { kind: 'ancestor'; agent: TeamAgent } | { kind: 'user'; parentSessionId: string }): unknown
  drainContinuableChildren(parent: TeamAgent, childIds: readonly string[]): Promise<void>
}

/** 工具执行处的 Agent 结构化面（session.header 身份 + ctx.tools 注册口 + inject）。 */
export interface TeamAgent {
  readonly session: {
    readonly header: {
      readonly id: string
      readonly parentSession?: string
      readonly origin?: string
    }
  }
  readonly ctx: {
    readonly tools: { register(definition: unknown): unknown }
  }
  inject(frame: {
    id: string
    role: 'user'
    content: readonly { type: 'text'; text: string }[]
    source: { kind: string; plugin: string; form: 'instructions' }
  }): unknown
}

/** execute 的第二参（dsh-tools 的 ToolExec 结构化子集）。 */
interface TeamToolExec {
  readonly agent?: TeamAgent
  readonly signal: AbortSignal
}

/** 工具层装配依赖：通道 + 状态机（单测注入 mock，生产由 index.ts 供真件）。 */
export interface TeamCreateDeps {
  readonly subagents: TeamContinuableChannel
  readonly store: TeamStateMemoryStore
}

const describeError = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

/**
 * 成员 label：`team:<teamRunId>:<memberName>`——senpi normalize.ts:40-42 的
 * 命名空间惯例逐字承载（UI/日志上一眼可辨团队子女）。
 */
export function buildTeamMemberLabel(teamRunId: string, memberName: string): string {
  return `team:${teamRunId}:${memberName}`
}

/**
 * 成员 briefing 文本：senpi spawn-members.ts:146-157 的 5 段版式语义移植
 * （identity / work-arrives / report-then-end / no-delegation / wrap-up），
 * 载体措辞换为 DSH 的注入消息模型。**不得**掺入 member.prompt（两帧两源，
 * Q-8 分离命题；单测逐字钉死）。lead 称谓用 TEAM_LEAD_SENTINEL。
 */
export function buildTeamBriefingText(teamName: string, memberName: string): string {
  return [
    '# Team Briefing',
    `You are '${memberName}', a member of team '${teamName}' running under the omo-team runtime on DSH. The team lead is addressed as '${TEAM_LEAD_SENTINEL}'.`,
    'Work arrives as injected messages steered into this resident session. Finish the instructions you were given, report your result to the lead, then end your turn — going idle after reporting is the expected flow: idle is not an error and does not end your membership; the next injected message wakes this session with more work.',
    'You must NOT spawn or delegate further children: team members never create sub-sessions and never create teams. No child-delegation channel exists on this surface and you must not attempt to create one — do the assigned work yourself with the tools you keep.',
    'When you complete assigned work, address a concise summary to the lead via the team messaging surface (team_send_message, once it is mounted in your tool set), then end your turn.',
  ].join('\n\n')
}

/** 执行链第 4/5 段的逐成员 spawn 计划行（parse+validator+seat 三关全过后的形状）。 */
interface MemberSpawnPlan {
  readonly name: string
  readonly seat: string
  readonly category?: string
  readonly initialPrompt: string
  readonly trio: TeamSeatTrio
  readonly childId: string
}

/**
 * 执行链主体（导出供单测以结构化 mock 逐字段断言调用序与实参）。
 * 五段序与回滚语义见文件头「执行链」段；一切失败路径具名冒泡，不静默。
 */
export async function executeTeamCreate(
  args: { inline_spec?: unknown },
  exec: TeamToolExec,
  deps: TeamCreateDeps,
): Promise<{
  teamRunId: string
  teamName: string
  status: 'active'
  members: readonly { name: string; seat: string; sessionId: string }[]
}> {
  // 1) parse（T4 解析器直吃 object | JSON string；失败原因原文冒泡）。
  const parsed = parseTeamSpec(args.inline_spec)
  if (!parsed.ok) {
    throw new Error(`team_create: ${parsed.message}`)
  }

  const lead = exec.agent
  if (lead === undefined) {
    throw new Error('team_create: exec.agent is undefined — the tool needs the live lead agent to parent its members')
  }
  const leadSessionId = lead.session.header.id

  // 2) 嵌套闸：lead 本人的 participant 账（上游 hook.ts:102-108 语义：lead
  // 也计入 participant——同会话二次 team_create 同样被拒，文案逐字对齐）。
  const participant = deps.store.participantOf(leadSessionId)
  if (participant !== undefined) {
    throw new Error(`team_create denied: session is already a participant of team ${participant.teamRunId}`)
  }

  // 3) 逐成员资格 + 三件套解析（parse 层已定 seat；此处纵深再判，拒绝
  // 具名、reason 原文冒泡）。childId 预留先于任何通道调用（防竞态注见文件头）。
  const plans: MemberSpawnPlan[] = []
  for (const member of parsed.spec.members) {
    const seat = resolveTeamSeat(member.seat)
    if (!seat.ok) {
      throw new Error(`team_create: member '${member.name}' rejected — ${seat.reason}`)
    }
    plans.push({
      name: member.name,
      seat: member.seat,
      ...(member.category === undefined ? {} : { category: member.category }),
      initialPrompt: member.prompt ?? TEAM_MEMBER_DEFAULT_INITIAL_PROMPT,
      trio: seat.trio,
      childId: randomUUID(),
    })
  }

  // 4) 状态机 creating（成员索引随 create 在场；bounds 执法在 team-spec 与
  // store.create 双闸）。
  const state = deps.store.create({
    teamName: parsed.spec.name,
    leadSessionId,
    members: plans.map((plan) => ({
      name: plan.name,
      seat: plan.seat,
      ...(plan.category === undefined ? {} : { category: plan.category }),
      childId: plan.childId,
    })),
  })
  console.log(`${LOG_PREFIX} creating team ${state.teamRunId} '${state.teamName}' with ${plans.length} member(s)`)

  // 5) 逐成员 startContinuable：provider 'spawn'（内建 continuable 后端），
  // 三件套 = 席位值逐格；briefing 不在这里（独立注入帧，见文件头机制段）。
  const startedChildIds: string[] = []
  for (const plan of plans) {
    try {
      const started = await deps.subagents.startContinuable({
        provider: 'spawn',
        label: buildTeamMemberLabel(state.teamRunId, plan.name),
        childId: plan.childId,
        request: {
          prompt: [{ type: 'text', text: plan.initialPrompt }],
          parent: lead,
          agentOptions: { ...plan.trio.agentOptions },
          persona: plan.trio.persona,
          toolFilter: { deny: [...plan.trio.toolFilter.deny] },
        },
        signal: exec.signal,
      })
      if (started.childId !== plan.childId) {
        throw new Error(
          `host returned childId ${started.childId} for reserved ${plan.childId} — the reserved-identity contract is broken`,
        )
      }
      startedChildIds.push(plan.childId)
      deps.store.setMemberPhase(state.teamRunId, plan.name, 'running')
      console.log(`${LOG_PREFIX} member '${plan.name}' seated at '${plan.seat}' -> session ${started.childId}`)
    } catch (err) {
      // 首败回滚（先翻 failed 让嵌套闸即时松绑，再 interrupt/drain 已建成员；
      // 语义对齐上游 spawn-members 的首败回滚 + 任务书 P5-T5 钉死序）。
      deps.store.transition(state.teamRunId, 'failed')
      const faults: string[] = []
      for (const childId of startedChildIds) {
        try {
          deps.subagents.interrupt(childId, { kind: 'ancestor', agent: lead })
        } catch (rollbackErr) {
          faults.push(`interrupt ${childId}: ${describeError(rollbackErr)}`)
        }
      }
      // 有已建成员才 drain：空清单不调通道（drain([]) 是通道上的无意义往返，
      // 零成员回滚的真相是「什么都没发生」，不是「drain 了零个」）。
      if (startedChildIds.length > 0) {
        try {
          await deps.subagents.drainContinuableChildren(lead, startedChildIds)
        } catch (rollbackErr) {
          faults.push(`drain: ${describeError(rollbackErr)}`)
        }
      }
      throw new Error(
        `team_create rolled back: member '${plan.name}' failed to start: ${describeError(err)} — `
        + `${startedChildIds.length} already-created member(s) interrupted and drained; team ${state.teamRunId} is failed`
        + `${faults.length > 0 ? ` (rollback faults: ${faults.join('; ')})` : ''}`,
      )
    }
  }

  // 全员就位 → active。briefing 注入与成员工具面已在各自的 agent/created 里
  // 完成（监听串行 await，startContinuable 解析前已发生——时序注见注册段）。
  deps.store.transition(state.teamRunId, 'active')
  console.log(`${LOG_PREFIX} team ${state.teamRunId} active`)
  return {
    teamRunId: state.teamRunId,
    teamName: state.teamName,
    status: 'active',
    members: plans.map((plan) => ({ name: plan.name, seat: plan.seat, sessionId: plan.childId })),
  }
}

/**
 * team_create 的工具定义（dsh-tools raw register 方言：parameters 是编译后
 * JSON Schema，`required` 只挂 type:'object' 节点——q3 坑实录的同一纪律；
 * output 必携 {schema, render}）。inline_spec 两臂 = T4 解析器的 union 直吃。
 */
export function createTeamCreateDefinition(deps: TeamCreateDeps): unknown {
  return {
    name: TEAM_CREATE_TOOL_NAME,
    description:
      'Create a team run from an inline team spec. Each member becomes a continuable child session routed through its roster seat '
      + '(provider/model/persona/tool-filter come from the seat, not from you). inline_spec accepts an object or its JSON string: '
      + '{ name, members: [{ name, category | seat, prompt? }] } with category in {quick, deep} and seat in {hephaestus, sisyphus-junior}. '
      + 'The calling session becomes the team lead — the lead is a participant and cannot create another team while this run is active. '
      + `Members receive their standing orders as an injected briefing (source kind '${TEAM_BRIEFING_SOURCE_KIND}'), never inside the spawn prompt.`,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['inline_spec'],
      properties: {
        inline_spec: {
          oneOf: [{ type: 'object' }, { type: 'string' }],
          description:
            'Inline team spec as an object or JSON string, e.g. {"name":"analysis-team","members":[{"name":"structure-analyst","category":"quick","prompt":"Analyze the project structure."}]}.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['teamRunId', 'teamName', 'status', 'members'],
        properties: {
          teamRunId: { type: 'string' },
          teamName: { type: 'string' },
          status: { type: 'string' },
          members: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'seat', 'sessionId'],
              properties: {
                name: { type: 'string' },
                seat: { type: 'string' },
                sessionId: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args: { inline_spec?: unknown }, exec: TeamToolExec) => executeTeamCreate(args, exec, deps),
  }
}

/**
 * 按角色分发的 agent/created 装配（任务书交付面 4 的 T5 半）：
 *   * 根会话（无 parentSession 且 origin !== 'subagent'）→ scoped lead 面：
 *     team_create +（T6 team_send_message / T7 team_delete 的占位注）——
 *     scoped 注册走 agent.ctx.tools.register（dsh-tools/lib/index.js:2873-2890：
 *     agent 局部贡献、dispose 自动 unwind、同名遮蔽全局）；
 *   * team 子女（byMemberSession 索引命中）→ scoped member 面：**结构上不含
 *     team_create**（成员派生子女被 fork (B) 的「不再派生」纪律裁决为无通道，
 *     结构缺席是最强执法），T6 消息工具占位注 + briefing 注入帧
 *     （source.kind='omo-team-briefing'，机制 = hard-blocks-injection.ts:134-141
 *     先例同构）；
 *   * 其他子女（普通 delegation child，无团队账）→ 什么都不装。
 * 机制学习面 = $DSH/dsh-experimental-tool-agent-team/lib/index.js:230-241
 * （agent/created + 按身份 scoped 安装的骨架）与 :539-546——**只学机制不采
 * 语义**（experimental 面不作执行面，计划书裁决）。
 *
 * 返回 disposer（订阅退订；已 scoped 安装的贡献随各 agent dispose 自动 unwind）。
 */
export function registerTeamCreateSurface(
  ctx: {
    on(event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown): unknown
  },
  deps: TeamCreateDeps,
): () => void {
  const off = ctx.on('agent/created', ({ agent }) => {
    const header = agent.session.header
    const isChild = header.origin === 'subagent' || header.parentSession !== undefined
    if (!isChild) {
      // lead 面：每个根会话都收 team_create（lead 恒为当前会话——无独立
      // lead 席位可指，Q1a §4 的同一裁决）。T6/T7 占位：lead 面后续追加
      // team_send_message（T6）与 team_delete（T7），同一 scoped 口。
      agent.ctx.tools.register(createTeamCreateDefinition(deps))
      console.log(`${LOG_PREFIX} lead surface installed on root session ${header.id}`)
      return
    }
    const participation = deps.store.participationOfMember(header.id)
    if (participation === undefined) {
      // 非团队子女（普通 delegation 等）：本插件不碰其工具面。
      return
    }
    const state = deps.store.get(participation.teamRunId)
    if (state === undefined) {
      // 成员账在场而 run 状态缺失 = 应不可能态（账与状态同 commit 维护，
      // 见 team-state.ts 索引段注）——响亮 warn 优于静默 return。
      console.warn(
        `${LOG_PREFIX} impossible state: member session ${header.id} has a participation row for team run ${participation.teamRunId} but that run's state is missing from the store — member surface NOT installed`,
      )
      return
    }
    // 状态闸：只给还活着的 run（creating/active/shutdown_requested，上游
    // ACTIVE_RUNTIME_STATUSES 同态集）装成员面——briefing 只属于进行中的编队，
    // failed/deleted/orphaned 的终态账是诊断面不是分发依据。组建期 agent/created
    // 先于 startContinuable 解析、彼时状态恒 'creating'，闸不误伤正常时序。
    if (!ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) return
    // member 面：结构上无 team_create（上面的「其他子女不装」是其退化形）；
    // T6 占位：team_send_message 随 T6 落此 scoped 口。briefing 独立注入：
    // prompt 正文与 briefing 帧两源（Q-8 分离命题），帧形 = hard-blocks 先例。
    agent.inject({
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text: buildTeamBriefingText(state.teamName, participation.memberName) }],
      source: {
        kind: TEAM_BRIEFING_SOURCE_KIND,
        plugin: TEAM_BRIEFING_SOURCE_PLUGIN,
        form: 'instructions',
      },
    })
    console.log(`${LOG_PREFIX} member surface + briefing on session ${header.id} (team ${participation.teamRunId})`)
  })
  return () => {
    if (typeof off === 'function') (off as () => void)()
  }
}
