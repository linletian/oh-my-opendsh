// team-task.ts — P5-T8b · team_task_create / team_task_list / team_task_get /
// team_task_update 四工具薄壳（**vendored team-tasklist 的接线面**——上游实现
// 是铁律，本文件只做参数校验、身份裁决与错误族冒泡，任务板语义零重写）。
//
// ── 语义移植声明（SEMANTIC PORT, NOT A COPY）────────────────────────────────
// 上游源路径（署名，OMO tag v4.19.4 = commit b072d279110bdda2c6ac2525d0d24dc54d16148a，
// PRE-3 冻结基线；逐字段对账在 Q1b §C-4 全档）：
//   - packages/omo-opencode/src/features/team-mode/tools/tasks.ts（151 行）——
//     四工具的参数面与执行序逐条承载：
//       * team_task_create 入参只有 teamRunId/subject/description/blockedBy?，
//         落盘写死 blocks: []、status: "pending"（tasks.ts:84-90 逐字）；
//       * team_task_list 过滤仅 status/owner（tasks.ts:104-105）——**无 ready
//         过滤、无 ready 字段返回**（任务书钉死，上游事实）；
//       * team_task_get = teamRunId/taskId 两枚（getTask 畸形即抛的宽容差异在
//         Q1b §C-4.6 在档）；
//       * team_task_update 的 status 枚举逐字（tasks.ts:122）
//         ["pending","claimed","in_progress","completed","deleted"]；
//         **status === "claimed" 走 claimTask，否则走
//         updateTaskStatus(..., args.owner ?? senderName, ...)**
//         （tasks.ts:128-130 逐字——claim 路由的同一岔口，本文件同一形状）；
//       * resolveSenderName（tasks.ts:61-70）：按 sessionId 匹配成员，否则退回
//         leader，都找不到抛 `team member not found for session <id>`——文案
//         逐字承载。
//   - packages/omo-opencode/src/hooks/team-tool-gating/hook.ts:12-19 ——
//     **UNIVERSAL 名单含四枚 team_task_***（team_task_create/list/update/get
//     与 team_send_message/team_status 同列，Q1a §3 :172-179 逐字在档）：
//     lead + member 双面可用，参与者身份 + teamRunId 对账，非参与者
//     `team-mode tool <name> denied: not a participant of team <id>` 具名拒
//     （:129-146 的 UNIVERSAL 臂，team_status/team_send_message 已同族携带的
//     同一裁决）。
//   - packages/team-core/src/team-tasklist/*（T8a vendored 件，本文件的**执行
//     体**）——createTask（高水位 + 锁 + TaskSchema.parse）、claimTask
//     （300s claim 锁、锁内重读、AlreadyClaimedError/BlockedByError）、
//     updateTaskStatus（pending→in_progress 自动过 claim、跨 owner 拒
//     CrossOwnerUpdateError、无逆向 InvalidTaskTransitionError）、listTasks
//     （点文件/目录排除、malformed 宽容跳过、id 数值升序、status/owner 过滤）、
//     getTask（畸形即抛）。**上游语义原样随 vendor**（任务书钉死）：
//     锁+锁内重读、**缺依赖视为可领**（dependencies.ts:3-8：blocker 不存在
//     → canClaim=true；存在且未完成才拒）、**无环检测**、**无 ready**、
//     **无 failed 终态**（TASK_STATUSES 五值无 failed——上游提示词三处与
//     schema 矛盾处不照抄 `failed` 文案，DSH 侧 v1 不增设失败终态，差异记
//     manifest.ts 行注 + Q1b N1/N2）。
//
// ── base_dir = 项目 .omo/teams/ 面（T8b 裁定钉死）────────────────────────────
// 任务板的一切寻址 = vendored resolveBaseDir(config)，config 来自
// team-config.ts 的唯一构造点（base_dir = `<home>/.omo/teams`，沙箱宿主随
// HOME 指针入箱）。`tasks/claims/` 与 `.highwatermark` 随 vendored 件自然成立
// （T1 更正：瞬时锁目录 + ID 水位，Q1b §C-4 实证；getTasksDir/
// getTaskClaimsDir/assertSafeTaskId 全在 vendored paths.ts）。
//
// ── 错误族冒泡（工具层不做语义改写，具名 code + 上游文案原样上浮）──────────
// AlreadyClaimedError('already_claimed') / BlockedByError('blocked by <ids>') /
// InvalidTaskTransitionError('no reverse transitions from X to Y') /
// CrossOwnerUpdateError('cross-owner updates are not allowed') /
// TeamPathTraversalError / ENOENT→team_task_not_found / zod 校验失败原文——
// 全部 catch 后以 `err.message` 冒给模型（dsh 工具面的错误文本即裁决文本），
// code 记日志。
//
// strip-only 纪律（T5 NOTES-6）：本文件不用参数属性；零 @deepseek-ai import。

import type { Task } from '@oh-my-opencode/team-core/types'

import { ACTIVE_TEAM_RUNTIME_STATUSES, TEAM_LEAD_SENTINEL, type TeamStateStore } from '../team/team-state.ts'
import type { TeamAgent } from './team-create.ts'

/** 四工具名（manifest.ts ⑦⑧⑨⑩ 行的 id 同一词汇）。 */
export const TEAM_TASK_CREATE_TOOL_NAME = 'team_task_create'
export const TEAM_TASK_LIST_TOOL_NAME = 'team_task_list'
export const TEAM_TASK_GET_TOOL_NAME = 'team_task_get'
export const TEAM_TASK_UPDATE_TOOL_NAME = 'team_task_update'

/** 本文件的日志前缀（工具层前缀体例）。 */
const LOG_PREFIX = '[omo-team team_task]'

/** 任务态词表，上游 TASK_STATUSES（types.ts:14）逐字镜像（update 参数臂执法）。 */
export const TEAM_TASK_STATUSES = ['pending', 'claimed', 'in_progress', 'completed', 'deleted'] as const

/** 工具层错误（具名 code；显式字段，strip-only；上游任务板错误族之外的那几枚
 *  参数/身份裁决走本类，上游错误族则原样上浮——见文件头冒泡纪律）。 */
export class TeamTaskError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'TeamTaskError'
    this.code = code
  }
}

/** 工具层装配依赖（状态骨架 = 身份/在场/镜像；任务板操作经 store 的薄直通臂
 *  调用 vendored team-tasklist——接线点单一在 store）。 */
export interface TeamTaskDeps {
  readonly store: TeamStateStore
}

/** execute 的第二参（同族工具同一形状）。 */
interface TeamTaskToolExec {
  readonly agent?: TeamAgent
}

/**
 * 参与者闸 + 状态闸（四工具共用；上游 gating hook.ts:129-146 的 UNIVERSAL 臂
 * + (B) 形态的 deleted 写面拒——裁决文案与 team_status/team_send_message 同族
 * 逐字）。查询面（get/list）与写面（create/update）共用参与者判定；写面对
 * deleted/deleting 具名拒（「team is deleted」词族 = team-message.ts 已承载
 * 的同一上游裁决），读面对 tombstone 放行（T7「deleted 是状态不是缺账」）。
 */
async function authorizeCaller(
  toolName: string,
  teamRunId: string,
  exec: TeamTaskToolExec,
  deps: TeamTaskDeps,
  write: boolean,
): Promise<{ isLead: boolean; senderName: string }> {
  const caller = exec.agent
  if (caller === undefined) {
    throw new TeamTaskError(
      `${toolName}: exec.agent is undefined — the task surface needs the calling identity to authorize`,
      'CALLER_MISSING',
    )
  }
  const state = deps.store.get(teamRunId)
  if (state === undefined) {
    throw new TeamTaskError(
      `${toolName}: no team run '${teamRunId}' in the team state store`,
      'TEAM_NOT_FOUND',
    )
  }
  if (write && (state.status === 'deleted' || state.status === 'deleting')) {
    throw new TeamTaskError(
      `${toolName}: team ${teamRunId} is ${state.status} — the task board is closed`,
      'TEAM_DELETED',
    )
  }
  const callerSessionId = caller.session.header.id
  const isLead = state.leadSessionId === callerSessionId
  const participation = isLead ? undefined : deps.store.participationOfMember(callerSessionId)
  if (!isLead && participation?.teamRunId !== teamRunId) {
    throw new TeamTaskError(
      `team-mode tool ${toolName} denied: not a participant of team ${teamRunId}`,
      'NOT_PARTICIPANT',
    )
  }
  // resolveSenderName（tasks.ts:61-70 逐字语义）：成员命中成员名，lead 退回
  // sentinel；闸已保证二者必居其一，理论不可达臂留具名抛。
  const senderName = isLead ? TEAM_LEAD_SENTINEL : participation!.memberName
  return { isLead, senderName }
}

/** blockedBy 入参校验（上游 tasks.ts 的 zod 臂：可选字符串数组；元素须是
 *  vendored assertSafeTaskId 认的纯数字串——提前具名拒，免得落盘后才炸）。 */
function parseBlockedBy(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((x) => typeof x !== 'string' || !/^\d+$/.test(x))) {
    throw new TeamTaskError(
      'blockedBy must be an array of numeric task id strings',
      'BLOCKED_BY_INVALID',
    )
  }
  return value as string[]
}

/**
 * team_task_create（上游 tasks.ts:84-90 逐字：blocks: []、status: 'pending'
 * 写死；id/createdAt/updatedAt 由 vendored createTask 的高水位 + 锁产出）。
 */
export async function executeTeamTaskCreate(
  args: { teamRunId?: unknown; subject?: unknown; description?: unknown; blockedBy?: unknown },
  exec: TeamTaskToolExec,
  deps: TeamTaskDeps,
): Promise<Task> {
  if (typeof args.teamRunId !== 'string' || args.teamRunId.length === 0) {
    throw new TeamTaskError('teamRunId is required and must be a non-empty string', 'TEAM_RUN_ID_REQUIRED')
  }
  if (typeof args.subject !== 'string' || args.subject.length === 0) {
    throw new TeamTaskError('subject is required and must be a non-empty string', 'SUBJECT_REQUIRED')
  }
  if (typeof args.description !== 'string') {
    throw new TeamTaskError('description is required and must be a string', 'DESCRIPTION_REQUIRED')
  }
  const teamRunId = args.teamRunId
  await authorizeCaller(TEAM_TASK_CREATE_TOOL_NAME, teamRunId, exec, deps, true)
  const blockedBy = parseBlockedBy(args.blockedBy)
  const task = await deps.store.createTask(teamRunId, {
    subject: args.subject,
    description: args.description,
    status: 'pending',
    blocks: [],
    blockedBy,
  })
  console.log(`${LOG_PREFIX} task ${task.id} created on team ${teamRunId} (blockedBy=${blockedBy.join(',') || '-'})`)
  return task
}

/** team_task_list（上游 tasks.ts:104-105：过滤仅 status/owner——无 ready）。 */
export async function executeTeamTaskList(
  args: { teamRunId?: unknown; status?: unknown; owner?: unknown },
  exec: TeamTaskToolExec,
  deps: TeamTaskDeps,
): Promise<{ tasks: Task[] }> {
  if (typeof args.teamRunId !== 'string' || args.teamRunId.length === 0) {
    throw new TeamTaskError('teamRunId is required and must be a non-empty string', 'TEAM_RUN_ID_REQUIRED')
  }
  const teamRunId = args.teamRunId
  await authorizeCaller(TEAM_TASK_LIST_TOOL_NAME, teamRunId, exec, deps, false)
  const filter: { status?: Task['status']; owner?: string } = {}
  if (args.status !== undefined) {
    if (typeof args.status !== 'string' || !(TEAM_TASK_STATUSES as readonly string[]).includes(args.status)) {
      throw new TeamTaskError(
        `unknown task status '${String(args.status)}' — allowed: ${TEAM_TASK_STATUSES.join('|')}`,
        'TASK_STATUS_INVALID',
      )
    }
    filter.status = args.status as Task['status']
  }
  if (args.owner !== undefined) {
    if (typeof args.owner !== 'string' || args.owner.length === 0) {
      throw new TeamTaskError('owner must be a non-empty string', 'OWNER_INVALID')
    }
    filter.owner = args.owner
  }
  // 上游 tasks.ts:109 逐字：`return JSON.stringify({ tasks })`——输出面是
  // **对象**（宿主对工具输出做 object 校验，裸数组会被拒为
  // `returned invalid output: "value" must be an object`，P5-T8b e2e run 1
  // 实测）；薄壳保留同一个 `{tasks}` 形状，过滤语义仍在 vendored listTasks。
  const tasks = await deps.store.listTasks(teamRunId, Object.keys(filter).length > 0 ? filter : undefined)
  return { tasks }
}

/** team_task_get（vendored getTask：畸形即抛——与 list 的宽容不同，上游事实）。 */
export async function executeTeamTaskGet(
  args: { teamRunId?: unknown; taskId?: unknown },
  exec: TeamTaskToolExec,
  deps: TeamTaskDeps,
): Promise<Task> {
  if (typeof args.teamRunId !== 'string' || args.teamRunId.length === 0) {
    throw new TeamTaskError('teamRunId is required and must be a non-empty string', 'TEAM_RUN_ID_REQUIRED')
  }
  if (typeof args.taskId !== 'string' || !/^\d+$/.test(args.taskId)) {
    throw new TeamTaskError('taskId is required and must be a numeric string', 'TASK_ID_INVALID')
  }
  const teamRunId = args.teamRunId
  await authorizeCaller(TEAM_TASK_GET_TOOL_NAME, teamRunId, exec, deps, false)
  try {
    return await deps.store.getTask(teamRunId, args.taskId)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new TeamTaskError(
        `team_task_get: no task '${args.taskId}' on team ${teamRunId}`,
        'TEAM_TASK_NOT_FOUND',
      )
    }
    throw err
  }
}

/**
 * team_task_update（上游 tasks.ts:122-130 逐字形状）：status 枚举五值；
 * **'claimed' → vendored claimTask**（300s claim 锁、锁内重读、缺依赖可领、
 * 存在未完成 blocker 才拒——AlreadyClaimedError/BlockedByError 原样冒泡）；
 * 否则 → updateTaskStatus(status, args.owner ?? senderName)（跨 owner 拒、
 * 无逆向、pending→in_progress 自动过 claim——全在 vendored 件内）。
 */
export async function executeTeamTaskUpdate(
  args: { teamRunId?: unknown; taskId?: unknown; status?: unknown; owner?: unknown },
  exec: TeamTaskToolExec,
  deps: TeamTaskDeps,
): Promise<Task> {
  if (typeof args.teamRunId !== 'string' || args.teamRunId.length === 0) {
    throw new TeamTaskError('teamRunId is required and must be a non-empty string', 'TEAM_RUN_ID_REQUIRED')
  }
  if (typeof args.taskId !== 'string' || !/^\d+$/.test(args.taskId)) {
    throw new TeamTaskError('taskId is required and must be a numeric string', 'TASK_ID_INVALID')
  }
  if (typeof args.status !== 'string' || !(TEAM_TASK_STATUSES as readonly string[]).includes(args.status)) {
    throw new TeamTaskError(
      `status must be one of ${TEAM_TASK_STATUSES.join('|')}`,
      'TASK_STATUS_INVALID',
    )
  }
  if (args.owner !== undefined && (typeof args.owner !== 'string' || args.owner.length === 0)) {
    throw new TeamTaskError('owner must be a non-empty string', 'OWNER_INVALID')
  }
  const teamRunId = args.teamRunId
  const status = args.status as Task['status']
  const { senderName } = await authorizeCaller(TEAM_TASK_UPDATE_TOOL_NAME, teamRunId, exec, deps, true)
  if (status === 'claimed') {
    // claim 路由（上游同一岔口）：认领人以 senderName 落 owner——lead 以
    // sentinel 认领也是上游事实（tasks.ts:128 的 claimTask(…, senderName)）。
    const task = await deps.store.claimTask(teamRunId, args.taskId, senderName)
    console.log(`${LOG_PREFIX} task ${args.taskId} on team ${teamRunId} claimed by ${senderName}`)
    return task
  }
  const task = await deps.store.updateTaskStatus(teamRunId, args.taskId, status, args.owner ?? senderName)
  console.log(`${LOG_PREFIX} task ${args.taskId} on team ${teamRunId} -> ${status} (actor=${senderName})`)
  return task
}

/** 四定义的参数面（dsh-tools raw register 面，逐字段对齐上游 zod 形状）。 */
function taskToolDefinition(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: readonly string[],
  execute: (args: Record<string, unknown>, exec: TeamTaskToolExec) => Promise<unknown>,
): unknown {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: [...required],
      properties,
    },
    output: {
      // 宿主对工具输出做根 object 校验（裸数组被拒为
      // `returned invalid output: "value" must be an object`，P5-T8b e2e 实测）；
      // 四件工具的真实输出面：create/update/get = Task 对象，list =
      // `{tasks: Task[]}`（上游 tasks.ts:109 `JSON.stringify({ tasks })`）。
      // schema 因此只钉根 object + 放行附加键，不虚构 `result` 包装。
      schema: {
        type: 'object',
        additionalProperties: true,
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args: Record<string, unknown>, exec: TeamTaskToolExec) => execute(args, exec),
  }
}

/**
 * 任务面注册（UNIVERSAL 双面，manifest ⑦⑧⑨⑩ 四行共用一个注册循环位）：
 * lead 面装四件（root session），成员面装四件（team-member child，参与者
 * 身份由状态骨架裁决）。每行 registrar 只装**自己那一件** def（一
 * registrar 一行的注册循环纪律，index.ts runTeamRegistrations），四行各自
 * 订阅 agent/created、各自可 dispose——marker 的 `<r>/<N>` 因此诚实计四。
 */
export function registerTeamTaskSurface(
  ctx: {
    on: (event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown) => unknown
  },
  deps: TeamTaskDeps,
  toolName: string,
): () => void {
  const build = (): { name: string; description: string; properties: Record<string, unknown>; required: readonly string[]; execute: (args: Record<string, unknown>, exec: TeamTaskToolExec) => Promise<unknown> } | undefined => {
    if (toolName === TEAM_TASK_CREATE_TOOL_NAME) {
      return {
        name: TEAM_TASK_CREATE_TOOL_NAME,
        description:
          'Create a task on a team board (persisted task file via the vendored team-tasklist: high-watermark id, atomic write under lock). '
          + 'blockedBy lists numeric task ids; missing blockers are treated as claimable (upstream semantics). status starts at "pending", blocks is always []. '
          + 'Callable by the lead and by team members.',
        properties: {
          teamRunId: { type: 'string', minLength: 1, description: 'Team run ID' },
          subject: { type: 'string', minLength: 1, description: 'Task subject' },
          description: { type: 'string', description: 'Task description' },
          blockedBy: { type: 'array', items: { type: 'string' }, description: 'Numeric task ids blocking this task' },
        },
        required: ['teamRunId', 'subject', 'description'],
        execute: (args, exec) => executeTeamTaskCreate(args, exec, deps),
      }
    }
    if (toolName === TEAM_TASK_LIST_TOOL_NAME) {
      return {
        name: TEAM_TASK_LIST_TOOL_NAME,
        description:
          'List tasks on a team board, sorted by numeric id ascending; malformed task files are skipped with a log (vendored semantics). '
          + 'Filter by status or owner only — there is NO "ready" filter and no "ready" field (upstream shape, recorded). '
          + 'Callable by the lead and by team members.',
        properties: {
          teamRunId: { type: 'string', minLength: 1, description: 'Team run ID' },
          status: { type: 'string', enum: [...TEAM_TASK_STATUSES], description: 'Filter by status' },
          owner: { type: 'string', minLength: 1, description: 'Filter by owner' },
        },
        required: ['teamRunId'],
        execute: (args, exec) => executeTeamTaskList(args, exec, deps),
      }
    }
    if (toolName === TEAM_TASK_GET_TOOL_NAME) {
      return {
        name: TEAM_TASK_GET_TOOL_NAME,
        description:
          'Get one task by numeric taskId from a team board (strict parse — a malformed task file throws, unlike the lenient list). '
          + 'Callable by the lead and by team members.',
        properties: {
          teamRunId: { type: 'string', minLength: 1, description: 'Team run ID' },
          taskId: { type: 'string', pattern: '^\\d+$', description: 'Numeric task id' },
        },
        required: ['teamRunId', 'taskId'],
        execute: (args, exec) => executeTeamTaskGet(args, exec, deps),
      }
    }
    if (toolName === TEAM_TASK_UPDATE_TOOL_NAME) {
      return {
        name: TEAM_TASK_UPDATE_TOOL_NAME,
        description:
          'Update a task status on a team board. status "claimed" routes to the vendored claimTask (claim lock, re-read under lock, AlreadyClaimed/BlockedBy refuse — blockers that do not exist are NOT blocking). '
          + 'Other statuses go through updateTaskStatus: no reverse transitions, cross-owner updates refused, pending→in_progress claims implicitly first. '
          + 'Callable by the lead and by team members.',
        properties: {
          teamRunId: { type: 'string', minLength: 1, description: 'Team run ID' },
          taskId: { type: 'string', pattern: '^\\d+$', description: 'Numeric task id' },
          status: { type: 'string', enum: [...TEAM_TASK_STATUSES], description: 'Target status' },
          owner: { type: 'string', minLength: 1, description: 'Actor name for the ownership check (defaults to the caller)' },
        },
        required: ['teamRunId', 'taskId', 'status'],
        execute: (args, exec) => executeTeamTaskUpdate(args, exec, deps),
      }
    }
    return undefined
  }
  const def = build()
  if (def === undefined) {
    throw new TeamTaskError(`unknown team task tool row '${toolName}'`, 'TASK_TOOL_UNKNOWN')
  }
  const definition = taskToolDefinition(def.name, def.description, def.properties, def.required, def.execute)
  const off = ctx.on('agent/created', (payload: { agent: TeamAgent }) => {
    const agent = payload.agent
    const header = agent.session.header
    const isRootTeamLeadFace = header.parentSession === undefined && header.origin !== 'subagent'
    if (isRootTeamLeadFace) {
      agent.ctx.tools.register(definition)
      console.log(`${LOG_PREFIX} ${def.name} installed on lead face (session ${header.id})`)
      return
    }
    if (header.origin === 'subagent') {
      const participation = deps.store.participationOfMember(header.id)
      if (participation === undefined) return
      const state = deps.store.get(participation.teamRunId)
      if (state === undefined) return
      // 状态闸 family 同序：终态账不给新工具装面（ACTIVE 三态，上游 gating
      // ACTIVE_RUNTIME_STATUSES 同一词表）。
      if (!ACTIVE_TEAM_RUNTIME_STATUSES.has(state.status)) return
      agent.ctx.tools.register(definition)
      console.log(`${LOG_PREFIX} ${def.name} installed on member face (session ${header.id}, team ${participation.teamRunId})`)
    }
  })
  return () => {
    if (typeof off === 'function') (off as () => void)()
  }
}
