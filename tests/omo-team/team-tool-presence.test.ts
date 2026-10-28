// tests/omo-team/team-tool-presence.test.ts — P5-T13 · 在场探测面的单测。
// P5-T16（评审 MINOR-7）**判据换源**：在场不再读 manifest 的**声明**
// （`status:'ported'`），改读**本次 boot 实际注册成功**的行 id 集
// （team-registration-outcome.ts，注册循环逐行记账）。
//
// 判定条件（任务书 T13 交付物 3 的 omo-team 半）：探测函数的单元测试——
// 「在场」是**派生**事实，所以每条腿都从 tools 常量 / 注册结果集派生断言，
// 不做第二份转抄：
//   ① 快照派生：①–⑪ 全部注册成功 ⇒ present=true；任何一枚**没注册上**
//      ⇒ present=false（逐枚翻红的矩阵腿）；
//   ② 两枚服务名各归其行（⑮/⑯），交叉等值由消费侧测试钉（R-5 同族，本文件
//      钉提供侧的名单与形状）；
//   ③ registrar 契约：ctx.provide 在场 ⇒ 上线并回 disposer；缺席 ⇒ 抛具名错
//      （该行 FAILED，不发假脸）；
//   ④ 名单同一性：TEAM_TOOL_ROW_IDS 与 manifest 的 ①–⑪ 行 id 逐位相等。
//   ⑤ **事实层腿**（P5-T16 新增）：声明层全 ported 但某枚工具行**没注册上**
//      ⇒ 在场判 false —— 旧实现读声明，这一腿会让它红。

import { describe, expect, it } from 'vitest'

import { TEAM_MANIFEST } from '../../patches/omo-dsh/omo-team/src/manifest.ts'
import {
  OMO_TEAM_HYPERPLAN_TEAM_FACE,
  OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE,
  TEAM_TOOL_ROW_IDS,
  registerHyperplanUpgradePresenceFace,
  registerRemoveAiSlopsAddendumPresenceFace,
  teamToolPresenceSnapshot,
  teamToolsRegisteredThisBoot,
  type TeamToolPresenceFace,
} from '../../patches/omo-dsh/omo-team/src/team/team-tool-presence.ts'
import {
  recordTeamRowRegistered,
  resetTeamRegistrationOutcome,
} from '../../patches/omo-dsh/omo-team/src/team/team-registration-outcome.ts'
import { TEAM_TASK_STATUSES } from '../../patches/omo-dsh/omo-team/src/tools/team-task.ts'
import { TEAM_CATEGORY_SEAT_ALIASES_V1 } from '../../patches/omo-dsh/omo-team/src/team/member-validator.ts'

/** 造一份「①–⑪ 全部注册成功」的注册结果集（事实层输入）。 */
function allToolRowsRegistered(): ReadonlySet<string> {
  return new Set(TEAM_TOOL_ROW_IDS)
}

describe('P5-T13 在场快照 — 派生判据（事实层）', () => {
  it('①–⑪ 全部注册成功 ⇒ 在场', () => {
    const face = teamToolPresenceSnapshot(allToolRowsRegistered())
    expect(face.teamToolsPresent).toBe(true)
  })

  it('名单同一性：TEAM_TOOL_ROW_IDS 与 manifest ①–⑪ 行 id 逐位相等', () => {
    // 「在场」的分母不许有第二份转抄——这一腿把名单钉回 manifest 行序。
    const firstEleven = TEAM_MANIFEST.slice(0, 11).map((entry) => entry.id)
    expect([...TEAM_TOOL_ROW_IDS]).toEqual(firstEleven)
    expect(TEAM_TOOL_ROW_IDS).toHaveLength(11)
  })

  it('任何一枚工具行**没注册上** ⇒ 立即不在场（逐枚翻红的矩阵腿）', () => {
    for (const toolRowId of TEAM_TOOL_ROW_IDS) {
      const registered = new Set(TEAM_TOOL_ROW_IDS.filter((id) => id !== toolRowId))
      const face = teamToolPresenceSnapshot(registered)
      expect(face.teamToolsPresent, `row ${toolRowId} not registered must flip presence off`).toBe(false)
    }
  })

  it('非工具行的登记扰动不改判（team_list 是 recorded，不在分母里）', () => {
    // 判据只数 ①–⑪——recorded 行（team_list/team_wait）永远不 ported，
    // 若误入分母，快照恒 false，/hyperplan 恒降级——这一腿防的就是它。
    const registered = new Set([...allToolRowsRegistered(), 'team_list', 'team_wait'])
    const face = teamToolPresenceSnapshot(registered)
    const teamList = TEAM_MANIFEST.find((entry) => entry.id === 'team_list')
    expect(teamList?.status).toBe('recorded')
    expect(face.teamToolsPresent).toBe(true)
  })

  it('⑤ 事实层腿：声明层全 ported，但某枚工具行没注册上 ⇒ 不在场', () => {
    // 旧实现读 manifest 的 `status:'ported'` ⇒ 这一腿会红（它总报在场）。
    // P5-T16 更正后读**实际注册结果** ⇒ 缺席。
    const declaredPorted = TEAM_MANIFEST
      .slice(0, 11)
      .every((entry) => entry.status === 'ported')
    expect(declaredPorted).toBe(true)
    const registered = new Set(TEAM_TOOL_ROW_IDS.filter((id) => id !== 'team_create'))
    expect(teamToolPresenceSnapshot(registered).teamToolsPresent).toBe(false)
  })

  it('词表随源：categories=别名表键、statuses=TEAM_TASK_STATUSES 逐字', () => {
    const face = teamToolPresenceSnapshot(allToolRowsRegistered())
    expect([...face.teamCategories]).toEqual(Object.keys(TEAM_CATEGORY_SEAT_ALIASES_V1).sort())
    expect([...face.teamTaskStatuses]).toEqual([...TEAM_TASK_STATUSES])
    // N1 的正面腿：五值词表进脸，`failed` 不在其中。
    expect(face.teamTaskStatuses).not.toContain('failed')
  })

  it('快照冻结：发布载荷不可被消费方改写', () => {
    const face = teamToolPresenceSnapshot(allToolRowsRegistered())
    expect(Object.isFrozen(face)).toBe(true)
    expect(Object.isFrozen(face.teamToolNames)).toBe(true)
  })
})

describe('P5-T16 注册结果集 — 事实层的输入面', () => {
  it('清零后为空；逐行记账后只含记过的行', () => {
    resetTeamRegistrationOutcome()
    expect(teamToolsRegisteredThisBoot()).toBe(false)
    recordTeamRowRegistered('team_create')
    expect(teamToolsRegisteredThisBoot()).toBe(false)
    for (const id of TEAM_TOOL_ROW_IDS) recordTeamRowRegistered(id)
    expect(teamToolsRegisteredThisBoot()).toBe(true)
    resetTeamRegistrationOutcome()
    expect(teamToolsRegisteredThisBoot()).toBe(false)
  })
})

describe('P5-T13 registrar — provide 契约与两枚服务名', () => {
  function provideCtx() {
    const provided: Array<{ name: string, service: unknown }> = []
    const ctx = {
      provide: (name: string, service: unknown) => {
        provided.push({ name, service })
        return () => undefined
      },
    }
    return { ctx, provided }
  }

  it('两枚服务名各归其位（⑮ hyperplan / ⑯ slop-addendum，拼写即事实）', () => {
    expect(OMO_TEAM_HYPERPLAN_TEAM_FACE).toBe('omoTeamHyperplanTeamFace')
    expect(OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE).toBe('omoTeamSlopAddendumTeamFace')
    expect(OMO_TEAM_HYPERPLAN_TEAM_FACE).not.toBe(OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE)
  })

  it('hyperplan 脸 provide 上线同派生快照（读**实际注册结果**）', () => {
    resetTeamRegistrationOutcome()
    for (const id of TEAM_TOOL_ROW_IDS) recordTeamRowRegistered(id)
    const { ctx, provided } = provideCtx()
    const disposer = registerHyperplanUpgradePresenceFace(ctx as never)
    expect(provided).toHaveLength(1)
    expect(provided[0]!.name).toBe(OMO_TEAM_HYPERPLAN_TEAM_FACE)
    const face = provided[0]!.service as TeamToolPresenceFace
    expect(face.teamToolsPresent).toBe(true)
    expect([...face.teamToolNames]).toEqual([...TEAM_TOOL_ROW_IDS])
    expect(typeof disposer).toBe('function')
    resetTeamRegistrationOutcome()
  })

  it('P5-T16 事实层腿：某枚工具行注册 FAILED ⇒ 上线的脸判**不在场**', () => {
    // 这一腿是 MINOR-7 的正面证明：注册循环逐行 try/catch，某枚工具行的
    // registrar 抛错 ⇒ 该行没注册 ⇒ 在场判 false ⇒ 两条命令降级，
    // 而不是向模型宣称一批不存在的工具。
    resetTeamRegistrationOutcome()
    for (const id of TEAM_TOOL_ROW_IDS) {
      if (id === 'team_create') continue
      recordTeamRowRegistered(id)
    }
    const { ctx, provided } = provideCtx()
    registerHyperplanUpgradePresenceFace(ctx as never)
    const face = provided[0]!.service as TeamToolPresenceFace
    expect(face.teamToolsPresent).toBe(false)
    resetTeamRegistrationOutcome()
  })

  it('slop addendum 脸与 hyperplan 脸同源（同一枚快照的字节）', () => {
    resetTeamRegistrationOutcome()
    for (const id of TEAM_TOOL_ROW_IDS) recordTeamRowRegistered(id)
    const a = teamToolPresenceSnapshot()
    const { ctx, provided } = provideCtx()
    registerRemoveAiSlopsAddendumPresenceFace(ctx as never)
    const face = provided[0]!.service as TeamToolPresenceFace
    expect(JSON.stringify(face)).toBe(JSON.stringify(a))
    expect(face.teamTaskStatuses).toContain('deleted')
    resetTeamRegistrationOutcome()
  })

  it('无 ctx.provide 的宿主 = 具名抛（该行 FAILED，不发假脸）', () => {
    expect(() => registerHyperplanUpgradePresenceFace({} as never)).toThrow(/ctx\.provide/)
    expect(() => registerHyperplanUpgradePresenceFace({} as never)).toThrow(OMO_TEAM_HYPERPLAN_TEAM_FACE)
    expect(() => registerRemoveAiSlopsAddendumPresenceFace({} as never)).toThrow(/ctx\.provide/)
    expect(() => registerRemoveAiSlopsAddendumPresenceFace({} as never)).toThrow(OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE)
  })
})
