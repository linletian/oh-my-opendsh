// P5-T5 — roster-seats.ts 三件套声明表的测试期对账（ONE-WAY SYNC 的收口）。
//
// WHY THE SRC SIDE CANNOT SELF-CHECK. omo-team 禁止 import omo-agents（跨包
// 边界纪律，index.ts / member-validator.ts 头部成文），所以 roster-seats.ts 是
// roster.ts 同一知识的**第二声明处**，运行时无法自动对齐——对账只能在测试期：
// 本文件同时 import roster.ts（事实源）与 roster-seats.ts（声明表），逐格比。
// 这正是 member-validator.test.ts 的 ALL_AGENT_IDS 集合+序对账先例的延续，只是
// 这次比的是路由值、persona 字节与 deny 列表三样。
//
// 三张对账面（任务书 P5-T5 钉死）：
//   1. agentOptions.provider/model == roster 行 defaultRoute.provider/model；
//   2. toolFilter.deny == denyToolNamesFor(roster 行)（worker → DELEGATION_
//      TOOL_NAMES 十名，逐位相等，roster 序）；
//   3. persona == system-sections/<personaFile> 内容 trimEnd 的逐字节副本
//      （guardPersonaText 的 trimEnd 语义，persona-prompts.ts:189）。
// 任一漂移（有人改了 roster 没改三件套，或反之）在本文件响亮红。
//
// The `.ts` extension in the import paths is load-bearing: Node 24
// type-stripping does no specifier resolution (tsconfig.host.json header).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DELEGATION_TOOL_NAMES,
  ROSTER,
  denyToolNamesFor,
  type RosterEntry,
} from '../../patches/omo-dsh/omo-agents/src/roster.ts'
import {
  OMO_TEAM_DELEGATION_TOOL_NAMES,
  OMO_TEAM_SEAT_PERSONA_HEPHAESTUS,
  OMO_TEAM_SEAT_PERSONA_SISYPHUS_JUNIOR,
  TEAM_ROSTER_SEATS,
  resolveTeamSeat,
  teamSeatClass,
} from '../../patches/omo-dsh/omo-team/src/team/roster-seats.ts'

const SYSTEM_SECTIONS_DIR = fileURLToPath(new URL('../../patches/omo-dsh/omo-agents/system-sections/', import.meta.url))

function rosterRow(id: string): RosterEntry {
  const row = ROSTER.find((entry) => entry.id === id)
  if (row === undefined) throw new Error(`roster.ts has no row '${id}' — the seat moved, reconcile this test`)
  return row
}

/** 两席的 (seat id, roster personaFile) 对照，手抄自 roster.ts:144/:255。 */
const SEAT_PERSONA_FILES: Readonly<Record<string, string>> = {
  hephaestus: 'hephaestus-persona.md',
  'sisyphus-junior': 'sisyphus-junior-persona.md',
}

describe('P5-T5 TEAM_ROSTER_SEATS — 表就是 v1 可入队两席', () => {
  it('carries exactly hephaestus + sisyphus-junior, no more', () => {
    expect(Object.keys(TEAM_ROSTER_SEATS).sort()).toEqual(['hephaestus', 'sisyphus-junior'])
  })

  it('OMO_TEAM_DELEGATION_TOOL_NAMES is the ten-name roster-order deny list', () => {
    // 逐位相等 roster 序（手抄转抄的钉，member-validator.test.ts 同款序纪律）。
    expect([...OMO_TEAM_DELEGATION_TOOL_NAMES]).toEqual([
      'explore',
      'hephaestus',
      'oracle',
      'librarian',
      'plan-consultant',
      'plan-reviewer',
      'atlas',
      'multimodal-looker',
      'sisyphus-junior',
      'prometheus',
    ])
  })
})

describe('P5-T5 field-wise reconciliation against roster.ts (ONE-WAY SYNC)', () => {
  for (const seatId of ['hephaestus', 'sisyphus-junior']) {
    describe(seatId, () => {
      const trio = TEAM_ROSTER_SEATS[seatId]!
      const row = rosterRow(seatId)

      it('agentOptions.provider/model == roster defaultRoute', () => {
        // 对账面 1：手抄的 defaultRoute 不许漂。
        expect(trio.agentOptions.provider).toBe(row.defaultRoute.provider)
        expect(trio.agentOptions.model).toBe(row.defaultRoute.model)
      })

      it('toolFilter.deny == denyToolNamesFor(roster row), roster order', () => {
        // 对账面 2：worker 席的 deny 由 roster 的 denyToolNamesFor 计算，
        // 逐位相等（序也是事实，roster 序）。
        const rosterDeny = denyToolNamesFor(row)
        expect(rosterDeny).toBeDefined()
        expect([...(rosterDeny ?? [])]).toEqual([...DELEGATION_TOOL_NAMES])
        expect([...trio.toolFilter.deny]).toEqual([...(rosterDeny ?? [])])
      })

      it(`persona == system-sections/${SEAT_PERSONA_FILES[seatId]} content trimEnd`, () => {
        // 对账面 3：逐字节。trimEnd 语义随内嵌形态保真（persona-prompts.ts:189）。
        expect(row.personaFile).toBe(SEAT_PERSONA_FILES[seatId])
        const fileText = readFileSync(`${SYSTEM_SECTIONS_DIR}${SEAT_PERSONA_FILES[seatId]}`, 'utf8').trimEnd()
        expect(trio.persona).toBe(fileText)
      })
    })
  }

  it('the two embedded persona consts are the same bytes the table carries', () => {
    // 常量与表引用同一文本（防「表指新值、旧常量留档」的双源漂移）。
    expect(TEAM_ROSTER_SEATS.hephaestus!.persona).toBe(OMO_TEAM_SEAT_PERSONA_HEPHAESTUS)
    expect(TEAM_ROSTER_SEATS['sisyphus-junior']!.persona).toBe(OMO_TEAM_SEAT_PERSONA_SISYPHUS_JUNIOR)
    // 两席 persona 必须互不相同（若复制时粘错文本，这里红）。
    expect(OMO_TEAM_SEAT_PERSONA_HEPHAESTUS).not.toBe(OMO_TEAM_SEAT_PERSONA_SISYPHUS_JUNIOR)
  })

  it('embedded personas carry their upstream Source: attribution header intact', () => {
    // persona 文件第 1 行是出处账（Source: oh-my-openagent …），内嵌必须保真，
    // 不得在复制时删署名头（c16 署名纪律随字节走）。
    expect(OMO_TEAM_SEAT_PERSONA_HEPHAESTUS.startsWith('<!-- Source:')).toBe(true)
    expect(OMO_TEAM_SEAT_PERSONA_SISYPHUS_JUNIOR.startsWith('<!-- Source:')).toBe(true)
  })
})

describe('P5-T5 resolveTeamSeat — 先资格后查表，两关各自具名拒绝', () => {
  it('resolves both eligible seats with their full trio', () => {
    const h = resolveTeamSeat('hephaestus')
    expect(h.ok).toBe(true)
    if (h.ok) {
      expect(h.seat).toBe('hephaestus')
      expect(h.trio.agentOptions).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
      expect(h.trio.toolFilter.deny).toHaveLength(10)
    }
    const j = resolveTeamSeat('sisyphus-junior')
    expect(j.ok).toBe(true)
    if (j.ok) {
      expect(j.trio.agentOptions).toEqual({ provider: 'deepseek', model: 'deepseek-flash' })
    }
  })

  it('rejects an ineligible roster seat by the validator reason (read-only)', () => {
    const explore = resolveTeamSeat('explore')
    expect(explore.ok).toBe(false)
    if (!explore.ok) {
      expect(explore.reason).toContain('read-only')
    }
  })

  it('rejects the conductor seat by structural-exclusion reason', () => {
    const sisyphus = resolveTeamSeat('sisyphus')
    expect(sisyphus.ok).toBe(false)
    if (!sisyphus.ok) {
      expect(sisyphus.reason).toContain('structurally excluded')
    }
  })

  it('rejects an unknown seat id with the available-seats list', () => {
    const nope = resolveTeamSeat('qixi-bot')
    expect(nope.ok).toBe(false)
    if (!nope.ok) {
      expect(nope.reason).toContain('unknown seat')
      expect(nope.reason).toContain('hephaestus, sisyphus-junior')
    }
  })

  it('teamSeatClass reports worker for eligible seats and undefined otherwise', () => {
    expect(teamSeatClass('hephaestus')).toBe('worker')
    expect(teamSeatClass('sisyphus-junior')).toBe('worker')
    expect(teamSeatClass('explore')).toBeUndefined()
    expect(teamSeatClass('nope')).toBeUndefined()
  })
})
