// P5-T4 — member-validator：11 席资格矩阵全组合 + 可用清单文案 + category
// 别名 + subagent_type 差异错误（覆盖基线 docs/plans/phase5-dev/phase5-team.md
// §4 终态表；上游逐字对照 = .omo/evidence/p5t1/Q1a-tools-lifecycle.md §3）。
//
// WHY EVERY EXPECTATION BELOW IS HARD-CODED. 同 tests/omo-team/manifest.test.ts
// 与 tests/omo-hooks/manifest.test.ts 的变异敏感纪律：从 member-validator.ts
// 派生期望值的测试会同意它的任何漂移，因而毫无价值。所以 11 席 id、每席的
// 允许/拒绝、每席的 seatClass、每段拒绝文案的关键片段，全部**手抄**自覆盖
// 基线 §4 与 roster.ts。
//
// 11 席 id 转抄自 patches/omo-dsh/omo-agents/src/roster.ts（id 行号：
// :110 sisyphus / :122 explore / :144 hephaestus / :159 oracle / :172
// librarian / :188 plan-consultant / :201 plan-reviewer / :214 atlas /
// :230 multimodal-looker / :255 sisyphus-junior / :270 prometheus）。
// ⚠️ ONE-WAY SYNC DISCIPLINE：roster.ts 是事实源 → member-validator.ts 的
// 资格表 → 本测试的期望表；增删改席同 commit 动三处，src 侧禁止 import
// roster（跨包边界纪律），对账只能在测试期——本文件 import roster 的
// ALL_AGENT_IDS 做集合相等断言 **加逐位置行序相等断言**（行序声明的钉，
// 集合相等拦不住 reordered），先例 = tests/omo-commands/hyperplan.test.ts:29。
//
// 两难点席：sisyphus（无 class 字段，按 seat id 结构性排除）与
// multimodal-looker（allowlist，v4 hard-reject 在册收紧）——矩阵里两席
// 各占一行独立用例，缺一席即红。
//
// 文案断言钉**语义锚点 + 差异词**而非整行——文案易演进（整行手打会让一次
// 无害的措辞打磨变成三处红），而「read-only / v5 parse-reject list /
// intentional tightening / structurally excluded」这些锚点是覆盖基线 §4
// 裁定本身的关键词，漂了就等于裁定被悄悄改写。
//
// The `.ts` extension in the import paths is load-bearing: Node 24
// type-stripping does no specifier resolution (tsconfig.host.json header).
import { describe, expect, it } from 'vitest'
import { ALL_AGENT_IDS } from '../../patches/omo-dsh/omo-agents/src/roster.ts'
import {
  CURATED_READONLY_SEATS_V1,
  SUBAGENT_TYPE_UNSUPPORTED_REASON,
  TEAM_AGENT_CLASSES,
  TEAM_CATEGORY_SEAT_ALIASES_V1,
  TEAM_ELIGIBLE_SEATS,
  TEAM_SEAT_IDS,
  resolveCategorySeat,
  seatRejectionReason,
  unresolvableCategoryReason,
  validateMemberSeat,
  type TeamAgentClass,
} from '../../patches/omo-dsh/omo-team/src/team/member-validator.ts'

/**
 * 资格矩阵（覆盖基线 §4 终态表逐行手抄）。`seatClass` 是 roster class 的
 * 转抄；`fragments` 是该席拒绝文案必须含的语义锚点（见文件头取舍注）。
 * allowed 的席 fragments 为空（允许路径没有拒绝文案可钉）。
 *
 * ⚠️ 11 行硬编码 + 下方长度钉 = 「缺一席即红」的双保险：删本表一行由
 *toHaveLength(11) 拦；翻一格 allowed/seatClass 由逐席用例拦。
 */
const MATRIX: ReadonlyArray<{
  readonly seat: string
  readonly allowed: boolean
  readonly seatClass: TeamAgentClass | undefined
  readonly code: 'UNKNOWN_SEAT' | 'SEAT_NOT_ELIGIBLE' | undefined
  readonly fragments: readonly string[]
}> = [
  // worker 两席 = v1 全部可入队席（覆盖基线 §4 worker 行）。
  { seat: 'hephaestus', allowed: true, seatClass: 'worker', code: undefined, fragments: [] },
  { seat: 'sisyphus-junior', allowed: true, seatClass: 'worker', code: undefined, fragments: [] },
  // curated 只读四席 = 上游 v5 parse-reject 清单逐字对应（调查报告 §2.1-3）。
  { seat: 'explore', allowed: false, seatClass: 'read-only', code: 'SEAT_NOT_ELIGIBLE', fragments: ['read-only seat \'explore\'', 'cannot be a team member', 'curated read-only', 'v5 parse-reject list', 'subagent tool'] },
  { seat: 'librarian', allowed: false, seatClass: 'read-only', code: 'SEAT_NOT_ELIGIBLE', fragments: ['read-only seat \'librarian\'', 'curated read-only'] },
  { seat: 'plan-consultant', allowed: false, seatClass: 'read-only', code: 'SEAT_NOT_ELIGIBLE', fragments: ['read-only seat \'plan-consultant\'', 'curated read-only'] },
  { seat: 'plan-reviewer', allowed: false, seatClass: 'read-only', code: 'SEAT_NOT_ELIGIBLE', fragments: ['read-only seat \'plan-reviewer\'', 'curated read-only'] },
  // oracle / prometheus = 比上游更严的有意收紧（v4 hard-reject 在册、v5 未列）。
  { seat: 'oracle', allowed: false, seatClass: 'read-only', code: 'SEAT_NOT_ELIGIBLE', fragments: ['read-only seat \'oracle\'', 'v5 parse-reject list does not enumerate', 'intentional tightening'] },
  { seat: 'prometheus', allowed: false, seatClass: 'read-only', code: 'SEAT_NOT_ELIGIBLE', fragments: ['read-only seat \'prometheus\'', 'v5 parse-reject list does not enumerate', 'intentional tightening'] },
  // atlas = orchestrator 有意收紧（上游 eligible 在册；成员工具面无委派通道）。
  { seat: 'atlas', allowed: false, seatClass: 'orchestrator', code: 'SEAT_NOT_ELIGIBLE', fragments: ['orchestrator seat \'atlas\'', 'intentional tightening', 'no delegation channel', 'AGENT_ELIGIBILITY_REGISTRY marks this seat eligible'] },
  // multimodal-looker = allowlist，v4 hard-reject 在册收紧。
  { seat: 'multimodal-looker', allowed: false, seatClass: 'allowlist', code: 'SEAT_NOT_ELIGIBLE', fragments: ['allowlist seat \'multimodal-looker\'', 'v4 registry', 'hard-rejects'] },
  // sisyphus = 无 class 的 route-only 行，seat id 结构性排除、不经 class 匹配。
  { seat: 'sisyphus', allowed: false, seatClass: undefined, code: 'SEAT_NOT_ELIGIBLE', fragments: ['structurally excluded', 'route-only conductor', 'no \'class\' field', 'lead is always the current session', 'not by class match'] },
]

describe('资格矩阵 — 11 席全组合（覆盖基线 §4 终态）', async () => {
  it('矩阵本身恰好 11 行（缺一席即红的测试侧保险丝）', async () => {
    expect(MATRIX).toHaveLength(11)
  })

  it('矩阵席集 == 手抄 11 席 id（按允许/收紧/排除分组序；roster 对账见后两条）', async () => {
    expect(MATRIX.map((row) => row.seat)).toEqual([
      'hephaestus',
      'sisyphus-junior',
      'explore',
      'librarian',
      'plan-consultant',
      'plan-reviewer',
      'oracle',
      'prometheus',
      'atlas',
      'multimodal-looker',
      'sisyphus',
    ])
  })

  it('被测表的席集与 roster.ts 的 ALL_AGENT_IDS 集合相等（跨包对账，src 禁 import 的测试期补偿）', async () => {
    expect([...TEAM_SEAT_IDS].sort()).toEqual([...ALL_AGENT_IDS].sort())
  })

  it('TEAM_SEAT_IDS 逐位置等于 roster.ts 的 ALL_AGENT_IDS（行序对账——钉死 member-validator.ts:74「顺序 = roster.ts 行序」声明）', async () => {
    // 集合相等只拦增删，拦不住转抄时 reordered 的席表；逐位置 toEqual 把
    // 「序也照抄」这一声明钉死（roster.ts:110-270 的 id 行序为事实源）。
    expect([...ALL_AGENT_IDS]).toEqual([
      'sisyphus',
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
    expect([...TEAM_SEAT_IDS]).toEqual([...ALL_AGENT_IDS])
  })

  it('TEAM_SEAT_IDS 恰好 11 席（缺一席即红的被测侧保险丝）', async () => {
    expect(TEAM_SEAT_IDS).toHaveLength(11)
  })

  for (const row of MATRIX) {
    it(`seat '${row.seat}' → ${row.allowed ? '允许' : '拒绝'}（class=${row.seatClass ?? '无 class'}）`, () => {
      const verdict = validateMemberSeat(row.seat)
      expect(verdict.ok).toBe(row.allowed)
      expect(verdict.seat).toBe(row.seat)
      expect(verdict.seatClass).toBe(row.seatClass)
      if (!verdict.ok) {
        expect(verdict.code).toBe(row.code)
        for (const fragment of row.fragments) {
          expect(verdict.reason).toContain(fragment)
        }
      }
    })
  }
})

describe('可入队席与词表', async () => {
  it('TEAM_ELIGIBLE_SEATS === worker 两席（手抄覆盖基线 §4 允许列）', async () => {
    expect(TEAM_ELIGIBLE_SEATS).toEqual(['hephaestus', 'sisyphus-junior'])
  })

  it('TEAM_AGENT_CLASSES === roster.ts:51 四值，无 conductor', async () => {
    expect(TEAM_AGENT_CLASSES).toEqual(['read-only', 'worker', 'orchestrator', 'allowlist'])
    expect((TEAM_AGENT_CLASSES as readonly string[]).includes('conductor')).toBe(false)
  })

  it('CURATED_READONLY_SEATS_V1 === 上游 v5 拒绝清单四席（调查报告 §2.1-3 逐字名单）', async () => {
    expect(CURATED_READONLY_SEATS_V1).toEqual(['explore', 'librarian', 'plan-consultant', 'plan-reviewer'])
  })
})

describe('category 别名表 v1（quick→sisyphus-junior / deep→hephaestus）', async () => {
  it('别名表恰好两枚 key（词表封闭）', async () => {
    expect(Object.keys(TEAM_CATEGORY_SEAT_ALIASES_V1).sort()).toEqual(['deep', 'quick'])
  })

  it('quick → sisyphus-junior（FAST 席）', async () => {
    const resolution = resolveCategorySeat('quick')
    expect(resolution.ok).toBe(true)
    if (resolution.ok) {
      expect(resolution.seat).toBe('sisyphus-junior')
      expect(resolution.seatClass).toBe('worker')
      expect(resolution.category).toBe('quick')
    }
  })

  it('deep → hephaestus（STRONG 席）', async () => {
    const resolution = resolveCategorySeat('deep')
    expect(resolution.ok).toBe(true)
    if (resolution.ok) {
      expect(resolution.seat).toBe('hephaestus')
      expect(resolution.seatClass).toBe('worker')
      expect(resolution.category).toBe('deep')
    }
  })

  it('表外 category（含上游在册的 ultrabrain）→ UNRESOLVABLE_CATEGORY', async () => {
    for (const category of ['ultrabrain', 'unspecified-low', 'git', 'QUICK', 'deep ']) {
      const resolution = resolveCategorySeat(category)
      expect(resolution.ok).toBe(false)
      if (!resolution.ok) {
        expect(resolution.code).toBe('UNRESOLVABLE_CATEGORY')
        expect(resolution.category).toBe(category)
      }
    }
  })
})

describe('UNRESOLVABLE_CATEGORY 可用清单文案（上游语义 = 排序拼接）', async () => {
  it('含逐字可用 category 清单（排序：deep 先于 quick）', async () => {
    expect(unresolvableCategoryReason('nope')).toContain('Available categories: deep, quick.')
  })

  it('含逐字可用 seat 清单（排序：hephaestus 先于 sisyphus-junior）', async () => {
    expect(unresolvableCategoryReason('nope')).toContain('Available seats: hephaestus, sisyphus-junior.')
  })

  it('点名肇事 category 并指两臂自救路径', async () => {
    const reason = unresolvableCategoryReason('nope')
    expect(reason).toContain("unknown category 'nope'")
    expect(reason).toContain("Specify exactly one of 'category' or 'seat'")
  })

  it('resolveCategorySeat 的失败 reason 与生成器同源（一文案一住所）', async () => {
    const resolution = resolveCategorySeat('nope')
    expect(!resolution.ok && resolution.reason).toBe(unresolvableCategoryReason('nope'))
  })
})

describe('拒绝文案逐类锚点 + 表外席 + subagent_type 差异', async () => {
  it('seatRejectionReason 对 read-only 分岔：curated 四席 vs oracle/prometheus 收紧注', async () => {
    expect(seatRejectionReason('explore', 'read-only')).toContain('matching the upstream v5 parse-reject list')
    expect(seatRejectionReason('oracle', 'read-only')).toContain('intentional tightening')
    expect(seatRejectionReason('oracle', 'read-only')).not.toContain('matching the upstream v5 parse-reject list')
  })

  it('atlas 文案携带三条依据锚（委派通道缺失 / 上游 eligible 对照 / 重开前置）', async () => {
    const reason = seatRejectionReason('atlas', 'orchestrator')
    expect(reason).toContain('no delegation channel')
    expect(reason).toContain('structurally impossible')
    expect(reason).toContain('reopening')
  })

  it('multimodal-looker 文案钉 v4 收紧与 v5 沉默', async () => {
    const reason = seatRejectionReason('multimodal-looker', 'allowlist')
    expect(reason).toContain('v4 registry')
    expect(reason).toContain('v5 reject list never mentions')
  })

  it('sisyphus 结构性排除文案不经 class 匹配（文案自证 + verdict.seatClass undefined）', async () => {
    const verdict = validateMemberSeat('sisyphus')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.code).toBe('SEAT_NOT_ELIGIBLE')
      expect(verdict.seatClass).toBeUndefined()
      expect(verdict.reason).toContain('not by class match')
    }
  })

  it('表外 seat id → UNKNOWN_SEAT + 可用席清单 + seatClass undefined', async () => {
    const verdict = validateMemberSeat('not-a-seat')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.code).toBe('UNKNOWN_SEAT')
      expect(verdict.reason).toContain("unknown seat 'not-a-seat'")
      expect(verdict.reason).toContain('Available seats: hephaestus, sisyphus-junior.')
      expect(verdict.seatClass).toBeUndefined()
    }
  })

  it('subagent_type 差异文案：具名 v1 记差异 + 无用户自定义 agent 注册表 + 两臂自救', async () => {
    expect(SUBAGENT_TYPE_UNSUPPORTED_REASON).toContain("'subagent_type' is recorded-difference in v1")
    expect(SUBAGENT_TYPE_UNSUPPORTED_REASON).toContain('no user-defined agent registry')
    expect(SUBAGENT_TYPE_UNSUPPORTED_REASON).toContain("'category' (deep, quick) or 'seat'")
  })
})
