// P5-T8b — tools/team-task.ts 四工具薄壳的单元测试。
//
// 钉什么（薄壳的分内）：参数校验、参与者闸（UNIVERSAL 双面 + 文案逐字）、
// sender 解析（lead → sentinel / member → 成员名）、**claim 路由的岔口**
// （status:'claimed' → vendored claimTask）、错误族**原样冒泡**（上游错误
// 不被壳改写）、读写面对 deleted tombstone 的分工、注册面（四件各自安装）。
// 任务板语义本身（高水位、锁内重读、BlockedBy/AlreadyClaimed 判定、宽容
// list）住在 vendored 件并有其自带 vitest（vendor/team-core/src/team-
// tasklist/*.test.ts，59 绿）——本文件不重抄上游的自证，只钉**接线**。
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping; tsconfig.host.json header).

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// vendored 错误类经**相对路径**取（tests/ 不在 omo-team 的 node_modules 作用
// 域内，package specifier 解析不到；相对路径与工具经 symlink 解析到的是同一
// 枚文件——类身份同一，instanceof 有效）。
import { AlreadyClaimedError, BlockedByError } from '../../patches/omo-dsh/vendor/team-core/src/team-tasklist/index.ts'
import { CrossOwnerUpdateError } from '../../patches/omo-dsh/vendor/team-core/src/team-tasklist/update.ts'

import {
  TEAM_TASK_CREATE_TOOL_NAME,
  TEAM_TASK_GET_TOOL_NAME,
  TEAM_TASK_LIST_TOOL_NAME,
  TEAM_TASK_UPDATE_TOOL_NAME,
  TeamTaskError,
  executeTeamTaskCreate,
  executeTeamTaskGet,
  executeTeamTaskList,
  executeTeamTaskUpdate,
  registerTeamTaskSurface,
} from '../../patches/omo-dsh/omo-team/src/tools/team-task.ts'
import { TEAM_LEAD_SENTINEL } from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'
import type { TeamAgent } from '../../patches/omo-dsh/omo-team/src/tools/team-create.ts'
import { cleanupEphemeralStores, makeStore } from './support/ephemeral-store.ts'
import type { TeamStateStore } from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

const LEAD = 'lead-session-1'
const ANALYST = 'child-analyst'
const BUILDER = 'child-builder'

afterEach(async () => {
  await cleanupEphemeralStores()
})

/** TeamAgent 全形状 mock（T8b 形状扩展后与 team-delete/status 的 makeAgent 先例对齐：
 *  薄壳只读 session.header.id 做身份闸，ctx/inject 供形状完整、留 no-op）。 */
function makeAgent(sessionId: string): TeamAgent {
  return {
    session: { header: { id: sessionId } },
    ctx: { tools: { register: (_def: unknown) => ({}) } },
    inject: (_frame: unknown) => ({}),
  } as unknown as TeamAgent
}

/** active 的两成员队（analyst@ANALYST, builder@BUILDER）。 */
async function activeTeam(): Promise<{ store: TeamStateStore; teamRunId: string }> {
  const store = makeStore()
  const state = await store.create({
    teamName: 'board-team',
    leadSessionId: LEAD,
    members: [
      { name: 'analyst', seat: 'sisyphus-junior', childId: ANALYST },
      { name: 'builder', seat: 'hephaestus', childId: BUILDER },
    ],
  })
  await store.transition(state.teamRunId, 'active')
  return { store, teamRunId: state.teamRunId }
}

describe('P5-T8b team_task_create — 薄壳写入与闸', async () => {
  it('lead creates: pending/blocks=[] verbatim, task file lands under the run dir', async () => {
    const { store, teamRunId } = await activeTeam()
    const task = await executeTeamTaskCreate(
      { teamRunId, subject: 'parse', description: 'structure scan' },
      { agent: makeAgent(LEAD) },
      { store },
    )
    expect(task).toMatchObject({ id: '1', status: 'pending', blocks: [], blockedBy: [], subject: 'parse' })
    // 高水位第二枚 = 2（vendored store.ts 的水位账）。
    const second = await executeTeamTaskCreate(
      { teamRunId, subject: 'build', description: 'implement' },
      { agent: makeAgent(LEAD) },
      { store },
    )
    expect(second.id).toBe('2')
  })

  it('member (participant) may create; a non-participant is refused by the gating sentence verbatim', async () => {
    const { store, teamRunId } = await activeTeam()
    const task = await executeTeamTaskCreate(
      { teamRunId, subject: 'from member', description: 'x' },
      { agent: makeAgent(ANALYST) },
      { store },
    )
    expect(task.status).toBe('pending')
    await expect(
      executeTeamTaskCreate({ teamRunId, subject: 'sneak', description: 'x' }, { agent: makeAgent('foreign') }, { store }),
    ).rejects.toThrowError(`team-mode tool ${TEAM_TASK_CREATE_TOOL_NAME} denied: not a participant of team ${teamRunId}`)
  })

  it('blockedBy is validated to numeric ids before the board sees it', async () => {
    const { store, teamRunId } = await activeTeam()
    try {
      await executeTeamTaskCreate(
        { teamRunId, subject: 'x', description: 'x', blockedBy: ['oops'] },
        { agent: makeAgent(LEAD) },
        { store },
      )
      throw new Error('expected a rejection')
    } catch (err) {
      expect((err as TeamTaskError).code).toBe('BLOCKED_BY_INVALID')
    }
  })

  it('a deleted teamRunId is closed for writes but stays readable (T7 tombstone division)', async () => {
    const { store, teamRunId } = await activeTeam()
    await store.transition(teamRunId, 'deleting')
    await store.transition(teamRunId, 'deleted')
    await expect(
      executeTeamTaskCreate({ teamRunId, subject: 'x', description: 'x' }, { agent: makeAgent(LEAD) }, { store }),
    ).rejects.toThrowError(/is deleted — the task board is closed/)
    // 读面放行（tombstone 是状态不是缺账）。
    const list = await executeTeamTaskList({ teamRunId }, { agent: makeAgent(LEAD) }, { store })
    expect(list).toEqual({ tasks: [] }) // 上游形：JSON.stringify({ tasks })（宿主 object 校验）
  })
})

describe('P5-T8b team_task_list / get — 读面直通上游形', async () => {
  it('list is id-ascending, filters by status/owner ONLY (no ready), skips malformed leniently', async () => {
    const { store, teamRunId } = await activeTeam()
    await executeTeamTaskCreate({ teamRunId, subject: 'a', description: 'a' }, { agent: makeAgent(LEAD) }, { store })
    await executeTeamTaskCreate({ teamRunId, subject: 'b', description: 'b' }, { agent: makeAgent(LEAD) }, { store })
    const all = await executeTeamTaskList({ teamRunId }, { agent: makeAgent(ANALYST) }, { store })
    expect(all.tasks.map((t) => t.id)).toEqual(['1', '2'])
    expect(all.tasks[0]).not.toHaveProperty('ready') // 上游形：无 ready 字段
    const claimedFirst = await executeTeamTaskUpdate(
      { teamRunId, taskId: '1', status: 'claimed' },
      { agent: makeAgent(ANALYST) },
      { store },
    )
    expect(claimedFirst.owner).toBe('analyst')
    const byStatus = await executeTeamTaskList({ teamRunId, status: 'claimed' }, { agent: makeAgent(LEAD) }, { store })
    expect(byStatus.tasks.map((t) => t.id)).toEqual(['1'])
    const byOwner = await executeTeamTaskList({ teamRunId, owner: 'analyst' }, { agent: makeAgent(LEAD) }, { store })
    expect(byOwner.tasks.map((t) => t.id)).toEqual(['1'])
    // 畸形文件宽容：塞一枚坏 JSON，list 跳过它但总数诚实。
    await writeFile(path.join(store.config.base_dir ?? '', 'runtime', teamRunId, 'tasks', '999.json'), '{ broken', 'utf8')
    const after = await executeTeamTaskList({ teamRunId }, { agent: makeAgent(LEAD) }, { store })
    expect(after.tasks.map((t) => t.id)).toEqual(['1', '2'])
  })

  it('get hits by id; a missing id is TEAM_TASK_NOT_FOUND; malformed throws raw (strict-get)', async () => {
    const { store, teamRunId } = await activeTeam()
    const created = await executeTeamTaskCreate({ teamRunId, subject: 'x', description: 'y' }, { agent: makeAgent(LEAD) }, { store })
    const fetched = await executeTeamTaskGet({ teamRunId, taskId: created.id }, { agent: makeAgent(BUILDER) }, { store })
    expect(fetched.subject).toBe('x')
    await expect(executeTeamTaskGet({ teamRunId, taskId: '777' }, { agent: makeAgent(LEAD) }, { store }))
      .rejects.toThrowError(/no task '777'/)
    const badDir = path.join(store.config.base_dir ?? '', 'runtime', teamRunId, 'tasks')
    await mkdir(badDir, { recursive: true })
    await writeFile(path.join(badDir, '888.json'), '{"id":"888"}', 'utf8') // 缺必填 → zod 抛
    await expect(executeTeamTaskGet({ teamRunId, taskId: '888' }, { agent: makeAgent(LEAD) }, { store }))
      .rejects.toThrow()
  })
})

describe('P5-T8b team_task_update — claimed 岔口与错误族冒泡', async () => {
  it('status claimed routes to vendored claimTask (owner=sender, claimedAt set; lead claims as sentinel)', async () => {
    const { store, teamRunId } = await activeTeam()
    await executeTeamTaskCreate({ teamRunId, subject: 'x', description: 'y' }, { agent: makeAgent(LEAD) }, { store })
    const byMember = await executeTeamTaskUpdate(
      { teamRunId, taskId: '1', status: 'claimed' },
      { agent: makeAgent(ANALYST) },
      { store },
    )
    expect(byMember.owner).toBe('analyst')
    expect(byMember.claimedAt).toBeGreaterThan(0)
    // lead 的 claim 走 sentinel owner（上游 tasks.ts:128 的 senderName 词汇）。
    await executeTeamTaskCreate({ teamRunId, subject: 'z', description: 'w' }, { agent: makeAgent(LEAD) }, { store })
    const byLead = await executeTeamTaskUpdate(
      { teamRunId, taskId: '2', status: 'claimed' },
      { agent: makeAgent(LEAD) },
      { store },
    )
    expect(byLead.owner).toBe(TEAM_LEAD_SENTINEL)
  })

  it('AlreadyClaimedError bubbles verbatim (message already_claimed, class intact)', async () => {
    const { store, teamRunId } = await activeTeam()
    await executeTeamTaskCreate({ teamRunId, subject: 'x', description: 'y' }, { agent: makeAgent(LEAD) }, { store })
    await executeTeamTaskUpdate({ teamRunId, taskId: '1', status: 'claimed' }, { agent: makeAgent(ANALYST) }, { store })
    try {
      await executeTeamTaskUpdate({ teamRunId, taskId: '1', status: 'claimed' }, { agent: makeAgent(BUILDER) }, { store })
      throw new Error('expected a rejection')
    } catch (err) {
      expect(err).toBeInstanceOf(AlreadyClaimedError)
      expect((err as Error).message).toBe('already_claimed')
    }
  })

  it('BlockedByError refuses ONLY existing unfinished blockers; missing blockers are claimable (vendored semantics verbatim)', async () => {
    const { store, teamRunId } = await activeTeam()
    await executeTeamTaskCreate({ teamRunId, subject: 'blocker', description: 'b' }, { agent: makeAgent(LEAD) }, { store })
    await executeTeamTaskCreate(
      { teamRunId, subject: 'dependent', description: 'd', blockedBy: ['1'] },
      { agent: makeAgent(LEAD) },
      { store },
    )
    try {
      await executeTeamTaskUpdate({ teamRunId, taskId: '2', status: 'claimed' }, { agent: makeAgent(BUILDER) }, { store })
      throw new Error('expected a rejection')
    } catch (err) {
      expect(err).toBeInstanceOf(BlockedByError)
      expect((err as Error).message).toBe('blocked by 1')
    }
    // 幽灵 blocker（999 不存在）= 可领（canClaim 的上游裁定）。
    await executeTeamTaskCreate(
      { teamRunId, subject: 'ghost-blocked', description: 'g', blockedBy: ['999'] },
      { agent: makeAgent(LEAD) },
      { store },
    )
    const ghost = await executeTeamTaskUpdate({ teamRunId, taskId: '3', status: 'claimed' }, { agent: makeAgent(BUILDER) }, { store })
    expect(ghost.status).toBe('claimed')
    // blocker 走完 claimed→in_progress→completed（上游转移表：completed 只能
    // 从 in_progress 进——合法序，不是壳的自由）。
    await executeTeamTaskUpdate({ teamRunId, taskId: '1', status: 'claimed' }, { agent: makeAgent(ANALYST) }, { store })
    await executeTeamTaskUpdate({ teamRunId, taskId: '1', status: 'in_progress' }, { agent: makeAgent(ANALYST) }, { store })
    await executeTeamTaskUpdate({ teamRunId, taskId: '1', status: 'completed' }, { agent: makeAgent(ANALYST) }, { store })
    const freed = await executeTeamTaskUpdate({ teamRunId, taskId: '2', status: 'claimed' }, { agent: makeAgent(BUILDER) }, { store })
    expect(freed.status).toBe('claimed')
  })

  it('cross-owner update bubbles CrossOwnerUpdateError; unknown status is refused by the shell', async () => {
    const { store, teamRunId } = await activeTeam()
    await executeTeamTaskCreate({ teamRunId, subject: 'x', description: 'y' }, { agent: makeAgent(LEAD) }, { store })
    await executeTeamTaskUpdate({ teamRunId, taskId: '1', status: 'claimed' }, { agent: makeAgent(ANALYST) }, { store })
    await executeTeamTaskUpdate({ teamRunId, taskId: '1', status: 'in_progress' }, { agent: makeAgent(ANALYST) }, { store })
    // owner=analyst 的行被 builder 以 owner 名义改 completed：跨主拒（上游
    // 判定在合法迁移之后——序也是上游的）。
    await expect(
      executeTeamTaskUpdate({ teamRunId, taskId: '1', status: 'completed', owner: 'builder' }, { agent: makeAgent(BUILDER) }, { store }),
    ).rejects.toBeInstanceOf(CrossOwnerUpdateError)
    try {
      await executeTeamTaskUpdate({ teamRunId, taskId: '1', status: 'failed' }, { agent: makeAgent(LEAD) }, { store })
      throw new Error('expected a rejection')
    } catch (err) {
      expect((err as TeamTaskError).code).toBe('TASK_STATUS_INVALID') // 无 failed 态——上游五值词汇
    }
  })
})

describe('P5-T8b registerTeamTaskSurface — 四件双面安装', async () => {
  function makeCtx() {
    const listeners: Array<(payload: { agent: unknown }) => unknown> = []
    const ctx = {
      on: (_event: 'agent/created', listener: (payload: { agent: unknown }) => unknown) => {
        listeners.push(listener)
        return () => { listeners.length = 0 }
      },
    }
    return { ctx, fire: (agent: unknown) => listeners[0]!({ agent }) }
  }

  function face(sessionId: string, opts: { parentSession?: string; origin?: string }) {
    const registered: unknown[] = []
    return {
      agent: {
        session: { header: { id: sessionId, ...opts } },
        ctx: { tools: { register: (d: unknown) => { registered.push(d) } } },
      },
      registered,
    }
  }

  it('lead face installs its row; member face installs only for indexed participants of ACTIVE runs', async () => {
    const { store, teamRunId } = await activeTeam()
    const { ctx, fire } = makeCtx()
    registerTeamTaskSurface(ctx as never, { store }, TEAM_TASK_LIST_TOOL_NAME)
    const lead = face('root-1', {})
    fire(lead.agent)
    expect(lead.registered).toHaveLength(1)
    const member = face(ANALYST, { parentSession: LEAD, origin: 'subagent' })
    fire(member.agent)
    expect(member.registered).toHaveLength(1)
    const foreign = face('foreign', { parentSession: 'other', origin: 'subagent' })
    fire(foreign.agent)
    expect(foreign.registered).toHaveLength(0)
    // 终态 run 不再给成员装面（ACTIVE 闸同 family）。
    await store.transition(teamRunId, 'deleting')
    await store.transition(teamRunId, 'deleted')
    const late = face(BUILDER, { parentSession: LEAD, origin: 'subagent' })
    fire(late.agent)
    expect(late.registered).toHaveLength(0)
  })

  it('an unknown tool row is a registration-time throw, loud by name', async () => {
    const { store } = await activeTeam()
    const { ctx } = makeCtx()
    expect(() => registerTeamTaskSurface(ctx as never, { store }, 'team_task_teleport' as never)).toThrowError(/team_task_teleport/)
  })
})
