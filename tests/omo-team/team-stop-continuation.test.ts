// P5-T9 · 单测：行 ⑰ `stop-continuation-team` 的 omo-team 侧 registrar——
// 只读成员查询面的发布半（team-stop-continuation.ts）。
//
// 钉的三件事：
//   ① registrar 在带 provide 的纤体上发布服务，且发布的就是读通的那张面
//      （provide 收进 map → 从 map 取出来对真 store 现读）；
//   ② 没有 provide 的宿主 = 具名抛（注册循环把它变成该行的 FAILED 行，
//      census 诚实停步——「boot 从不宣称没有发生的成功」）；
//   ③ 服务的只读性：查询不产生任何写（store 的镜像与磁盘在查询前后逐字
//      不变——写面一寸不碰的边界由这条反向断言兜底）。

import { afterEach, describe, expect, it } from 'vitest'

import {
  OMO_TEAM_MEMBER_QUERY_SERVICE,
  createTeamMemberQueryService,
  registerTeamStopContinuationQuerySurface,
} from '../../patches/omo-dsh/omo-team/src/team/team-stop-continuation.ts'
import { cleanupEphemeralStores, makeStore } from './support/ephemeral-store.ts'
import type { TeamRegistrationContext } from '../../patches/omo-dsh/omo-team/src/index.ts'

afterEach(async () => {
  await cleanupEphemeralStores()
})

const LEAD = 'lead-session-t9-registrar'

function providerCtx(provided: Map<string, unknown>): TeamRegistrationContext {
  return {
    on: (_event, _listener) => () => {},
    subagents: {
      startContinuable: async () => {
        throw new Error('registrar test: the channel must not be touched by the query surface')
      },
      interrupt: () => {
        throw new Error('registrar test: interrupt belongs to the guard, not to this row')
      },
      drainContinuableChildren: async () => {
        throw new Error('registrar test: drain belongs to the guard, not to this row')
      },
      sendMessage: async () => undefined,
    },
    agents: { get: () => undefined },
    provide: (name: string, service: unknown) => {
      provided.set(name, service)
      return () => {
        provided.delete(name)
      }
    },
  }
}

describe('P5-T9 registerTeamStopContinuationQuerySurface — the publish half of row ⑰', () => {
  it('publishes the query surface under the shared name, and the published face reads the live run', async () => {
    const store = makeStore()
    const state = await store.create({
      teamName: 'publish-team',
      leadSessionId: LEAD,
      members: [{ name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst' }],
    })
    await store.transition(state.teamRunId, 'active')
    const provided = new Map<string, unknown>()
    const disposer = registerTeamStopContinuationQuerySurface(providerCtx(provided), { store })
    expect(provided.has(OMO_TEAM_MEMBER_QUERY_SERVICE)).toBe(true)
    const published = provided.get(OMO_TEAM_MEMBER_QUERY_SERVICE) as ReturnType<typeof createTeamMemberQueryService>
    expect(published.liveMembersOfLead(LEAD).map((row) => row.sessionId)).toEqual(['child-analyst'])
    // fiber 收编：provide 的 disposer 被交回循环；调它 = 退服务。
    expect(typeof disposer).toBe('function')
    if (typeof disposer === 'function') disposer()
    expect(provided.has(OMO_TEAM_MEMBER_QUERY_SERVICE)).toBe(false)
  })

  it('a host without ctx.provide gets a NAMED throw — the loop turns it into the row-s own FAILED line', () => {
    const noProvide = { ...providerCtx(new Map()), provide: undefined } as unknown as TeamRegistrationContext
    expect(() => registerTeamStopContinuationQuerySurface(noProvide, { store: makeStore() })).toThrow(/ctx\.provide/)
    expect(() => registerTeamStopContinuationQuerySurface(noProvide, { store: makeStore() })).toThrow(OMO_TEAM_MEMBER_QUERY_SERVICE)
  })

  it('reading is inert: two queries leave the store mirror byte-identical (the read-only boundary)', async () => {
    const store = makeStore()
    const state = await store.create({
      teamName: 'inert-team',
      leadSessionId: LEAD,
      members: [{ name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst' }],
    })
    await store.transition(state.teamRunId, 'active')
    const query = createTeamMemberQueryService({ store })
    const before = JSON.stringify(store.get(state.teamRunId))
    query.liveMembersOfLead(LEAD)
    query.liveMembersOfLead(LEAD)
    query.liveMembersOfLead('nobody')
    expect(JSON.stringify(store.get(state.teamRunId))).toBe(before)
  })

  // ── 单 run 契约 pin（评审 MINOR 的提供侧成文面）────────────────────────────
  // guard 消费面的 `members[0]!.teamRunId`（stop-continuation-guard.ts 的
  // cascadeTeamMembers，单 run 契约注所在处）
  // 合法当且仅当：一次 liveMembersOfLead 的全部行同源同 run。这条钉就是那个
  // 「当且仅当」的右半边——逐行校验 teamRunId 全等快照 run id，任何一行漂移
  // （多 run 混进同一返回集）必红。
  it('single-run contract: EVERY row of one answer shares the snapshot run id (the guard reads members[0])', async () => {
    const store = makeStore()
    const state = await store.create({
      teamName: 'single-run-team',
      leadSessionId: LEAD,
      members: [
        { name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst' },
        { name: 'builder', seat: 'hephaestus', childId: 'child-builder' },
      ],
    })
    await store.transition(state.teamRunId, 'active')
    const query = createTeamMemberQueryService({ store })
    const rows = query.liveMembersOfLead(LEAD)
    expect(rows).toHaveLength(2)
    // 逐行校验（不是抽查第一行）：每行的 teamRunId 都等于快照 run id。
    for (const row of rows) {
      expect(row.teamRunId).toBe(state.teamRunId)
    }
    // 唯一性：返回集里 run id 的 distinct 值恰一枚——`members[0]!.teamRunId`
    // 与「全体」是同一个值，guard 的单值读法在此得证。
    expect([...new Set(rows.map((row) => row.teamRunId))]).toEqual([state.teamRunId])
    // 索引形状自证：lead→run 是单值 Map（team-state.ts teamOfLead），第二枚
    // ACTIVE run 对同一 lead 结构性不存在——查询面两次调用同值。
    expect(query.liveMembersOfLead(LEAD)).toEqual(rows)
  })
})
