// P5-T4 — team-spec：inline spec 解析（收窄形状 + 上游语义对齐 + v1 记差异
// 具名拒绝）。上游逐字对照 = .omo/evidence/p5t1/Q1a-tools-lifecycle.md §2.1
// （lifecycle-inline-spec.ts / lifecycle-create-tool.ts 的 schema 原文）。
//
// WHY EVERY EXPECTATION BELOW IS HARD-CODED. 同 T2/T4 的变异敏感纪律：错误码
// 逐例硬编码字面量（从 TEAM_SPEC_ERROR_CODES 或实现派生的期望值会同意实现的
// 任何漂移）。成员上限钉 8 的两边（8 绿 / 9 红）、重名钉 DUPLICATE_MEMBER_
// NAME 逐字码、封闭形状钉「每枚 v1 不收的上游字段各一条用例」——删一条
// 用例即少一格防线，所以逐字段各立 its 而不是循环塞进一条。
//
// 文案断言同 member-validator.test.ts 的取舍：钉语义锚点（'duplicated' /
// 'exceeds max 8' / 'exactly one' / 'recorded-difference' / 'closed'）而非
// 整行——文案易演进，锚点是裁定与语义本身。
//
// The `.ts` extension in the import path is load-bearing: Node 24
// type-stripping does no specifier resolution (tsconfig.host.json header).
import { describe, expect, it } from 'vitest'
import {
  KEBAB_CASE_PATTERN,
  MAX_TEAM_MEMBERS,
  TEAM_MEMBER_ALLOWED_FIELDS_V1,
  TEAM_MEMBER_UNSUPPORTED_UPSTREAM_FIELDS_V1,
  TEAM_SPEC_ALLOWED_FIELDS_V1,
  TEAM_SPEC_ERROR_CODES,
  TEAM_SPEC_UNSUPPORTED_UPSTREAM_FIELDS_V1,
  nameStyleAdvisory,
  parseTeamSpec,
} from '../../patches/omo-dsh/omo-team/src/team/team-spec.ts'

/** 合法基线 spec（object 臂）；各负向用例只改一处。 */
function happySpec(): unknown {
  return {
    name: 'project-analysis-team',
    members: [
      { name: 'structure-analyst', category: 'quick', prompt: 'Analyze project structure.' },
      { name: 'deep-reviewer', seat: 'hephaestus' },
    ],
  }
}

describe('happy path — 三臂与解析产物', async () => {
  it('object 臂：category 臂解析到别名席（quick→sisyphus-junior，保留原词）', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick' }] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.spec.name).toBe('t')
      expect(result.spec.members).toHaveLength(1)
      const member = result.spec.members[0]!
      expect(member.name).toBe('a')
      expect(member.seat).toBe('sisyphus-junior')
      expect(member.seatClass).toBe('worker')
      expect(member.via).toBe('category')
      expect(member.category).toBe('quick')
      expect(member.prompt).toBeUndefined()
      expect(result.spec.advisories).toEqual([])
    }
  })

  it('object 臂：seat 臂直指定两席（hephaestus 与 sisyphus-junior 各一）', async () => {
    const result = parseTeamSpec({
      name: 'two-worker-team',
      members: [
        { name: 'm1', seat: 'hephaestus' },
        { name: 'm2', seat: 'sisyphus-junior' },
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.spec.members.map((m) => m.seat)).toEqual(['hephaestus', 'sisyphus-junior'])
      expect(result.spec.members.map((m) => m.seatClass)).toEqual(['worker', 'worker'])
      expect(result.spec.members.map((m) => m.via)).toEqual(['seat', 'seat'])
      expect(result.spec.members[0]!.category).toBeUndefined()
    }
  })

  it('JSON string 臂（上游 union string 臂语义，lifecycle-create-tool.ts:43）：与 object 臂同产物', async () => {
    const objectResult = parseTeamSpec(happySpec())
    const stringResult = parseTeamSpec(JSON.stringify(happySpec()))
    expect(stringResult.ok).toBe(true)
    expect(objectResult.ok).toBe(true)
    if (objectResult.ok && stringResult.ok) {
      expect(stringResult.spec).toEqual(objectResult.spec)
    }
  })

  it('prompt 原样透传（内容政策不在本层；EMPTY_PROMPT/CATEGORY_PROMPT_TOO_SHORT 记差异）', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', seat: 'hephaestus', prompt: '' }] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.spec.members[0]!.prompt).toBe('')
    }
  })

  it('恰好 8 名成员通过（MAX_TEAM_MEMBERS=8 的上边界绿）', async () => {
    const members = Array.from({ length: 8 }, (_, i) => ({ name: `worker-${i}`, category: 'quick' }))
    const result = parseTeamSpec({ name: 'eight-team', members })
    expect(result.ok).toBe(true)
    expect(MAX_TEAM_MEMBERS).toBe(8)
  })

  it('非 kebab 名不拒但进 advisories（宽严自定成文：建议性，保真不归一）', async () => {
    const result = parseTeamSpec({ name: 'My Team', members: [{ name: 'Fast Guy', category: 'quick' }] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.spec.name).toBe('My Team') // 保真——上游归一、v1 不归一
      expect(result.spec.advisories).toHaveLength(2)
      expect(result.spec.advisories[0]).toContain("team name 'My Team' is not kebab-case")
      expect(result.spec.advisories[1]).toContain("member name 'Fast Guy' is not kebab-case")
      expect(result.spec.advisories[0]).toContain('keeps the name verbatim')
    }
  })

  it('kebab 谓词本身：正例/反例各钉（advisory 的判据不漂移）', async () => {
    expect(KEBAB_CASE_PATTERN.test('structure-analyst')).toBe(true)
    expect(KEBAB_CASE_PATTERN.test('team-1')).toBe(true)
    expect(KEBAB_CASE_PATTERN.test('Structure-Analyst')).toBe(false)
    expect(KEBAB_CASE_PATTERN.test('my_team')).toBe(false)
    expect(KEBAB_CASE_PATTERN.test('-lead')).toBe(false)
    expect(nameStyleAdvisory('team', 'ok-name')).toBeUndefined()
  })
})

describe('members 边界（上游 MAX_TEAM_MEMBERS=8 / min 1）', async () => {
  it('9 名成员 → TEAM_MEMBER_LIMIT_EXCEEDED（上边界红，上游同码）', async () => {
    const members = Array.from({ length: 9 }, (_, i) => ({ name: `worker-${i}`, category: 'quick' }))
    const result = parseTeamSpec({ name: 'nine-team', members })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('TEAM_MEMBER_LIMIT_EXCEEDED')
      expect(result.message).toContain('exceeds max 8 members')
      expect(result.field).toBe('members')
    }
  })

  it('空 members → MEMBERS_EMPTY（「Provide 1-8 members」下半边）', async () => {
    const result = parseTeamSpec({ name: 't', members: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('MEMBERS_EMPTY')
    }
  })

  it('members 缺失 / 非数组 → MEMBERS_REQUIRED', async () => {
    for (const raw of [{ name: 't' }, { name: 't', members: { a: 1 } }, { name: 't', members: 'x' }]) {
      const result = parseTeamSpec(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('MEMBERS_REQUIRED')
        expect(result.field).toBe('members')
      }
    }
  })

  it('重名 → DUPLICATE_MEMBER_NAME（上游同码同语义，报后出现的那枚）', async () => {
    const result = parseTeamSpec({
      name: 't',
      members: [
        { name: 'dup', category: 'quick' },
        { name: 'other', category: 'deep' },
        { name: 'dup', seat: 'hephaestus' },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('DUPLICATE_MEMBER_NAME')
      expect(result.message).toContain("member name 'dup' is duplicated")
      expect(result.message).toContain('must be unique')
      expect(result.memberName).toBe('dup')
    }
  })
})

describe('category | seat 恰好其一', async () => {
  it('同给两臂 → CATEGORY_SEAT_BOTH（对齐上游 both-kinds issue）', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick', seat: 'hephaestus' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('CATEGORY_SEAT_BOTH')
      expect(result.message).toContain('specify exactly one')
      expect(result.memberName).toBe('a')
    }
  })

  it('两臂都不给 → CATEGORY_SEAT_MISSING（对齐上游 missing-kind issue）', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('CATEGORY_SEAT_MISSING')
      expect(result.message).toContain('specify exactly one')
    }
  })

  it('表外 category → UNRESOLVABLE_CATEGORY + 可用清单（上游语义 = 排序拼接）', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'ultrabrain' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('UNRESOLVABLE_CATEGORY')
      expect(result.message).toContain('references unknown category')
      expect(result.message).toContain('Available categories: deep, quick.')
      expect(result.message).toContain('Available seats: hephaestus, sisyphus-junior.')
      expect(result.field).toBe('category')
      expect(result.memberName).toBe('a')
    }
  })

  it('read-only 席直指定 → SEAT_NOT_ELIGIBLE（资格知识住 member-validator，本层搬运）', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', seat: 'explore' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('SEAT_NOT_ELIGIBLE')
      expect(result.message).toContain('selects an ineligible seat')
      expect(result.message).toContain('read-only seat')
      expect(result.memberName).toBe('a')
    }
  })

  it('表外 seat → UNKNOWN_SEAT + 可用席清单', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', seat: 'nobody' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('UNKNOWN_SEAT')
      expect(result.message).toContain('references unknown seat')
      expect(result.message).toContain('Available seats: hephaestus, sisyphus-junior.')
    }
  })

  it('sisyphus 走结构性排除（经 parse 同样具名拒绝）', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', seat: 'sisyphus' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('SEAT_NOT_ELIGIBLE')
      expect(result.message).toContain('structurally excluded')
    }
  })
})

describe('v1 不收字段逐枚具名拒绝（Q1a §2.1:21-44 全集，诚实优于静默）', async () => {
  it('member 级：kind → V1_UNSUPPORTED_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick', kind: 'category' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('V1_UNSUPPORTED_FIELD')
      expect(result.message).toContain("field 'kind'")
      expect(result.message).toContain('v1 does not support')
      expect(result.field).toBe('kind')
    }
  })

  it('member 级：subagent_type → 专属 SUBAGENT_TYPE_UNSUPPORTED（旗舰差异码，先于通用表命中）', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', subagent_type: 'sisyphus-junior' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('SUBAGENT_TYPE_UNSUPPORTED')
      expect(result.message).toContain("'subagent_type' is recorded-difference in v1")
      expect(result.message).toContain('no user-defined agent registry')
    }
  })

  // 逐枚立用例（不循环塞一条）：删一枚即少一格防线。
  it('member 级：systemPrompt → V1_UNSUPPORTED_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', seat: 'hephaestus', systemPrompt: 'x' }] })
    expect(!result.ok && result.code).toBe('V1_UNSUPPORTED_FIELD')
    expect(!result.ok && result.field).toBe('systemPrompt')
  })

  it('member 级：loadSkills → V1_UNSUPPORTED_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', seat: 'hephaestus', loadSkills: ['s'] }] })
    expect(!result.ok && result.code).toBe('V1_UNSUPPORTED_FIELD')
    expect(!result.ok && result.field).toBe('loadSkills')
  })

  it('member 级：role → V1_UNSUPPORTED_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', seat: 'hephaestus', role: 'reviewer' }] })
    expect(!result.ok && result.code).toBe('V1_UNSUPPORTED_FIELD')
    expect(!result.ok && result.field).toBe('role')
  })

  it('member 级：description → V1_UNSUPPORTED_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', seat: 'hephaestus', description: 'd' }] })
    expect(!result.ok && result.code).toBe('V1_UNSUPPORTED_FIELD')
    expect(!result.ok && result.field).toBe('description')
  })

  // spec 级五枚同样逐枚立用例（与 member 级同纪律）：删一枚即少一格防线。
  it('spec 级：teamAllowedPaths → V1_UNSUPPORTED_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick' }], teamAllowedPaths: ['src'] })
    expect(!result.ok && result.code).toBe('V1_UNSUPPORTED_FIELD')
    expect(!result.ok && result.field).toBe('teamAllowedPaths')
  })

  it('spec 级：sessionPermission → V1_UNSUPPORTED_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick' }], sessionPermission: 'allow' })
    expect(!result.ok && result.code).toBe('V1_UNSUPPORTED_FIELD')
    expect(!result.ok && result.field).toBe('sessionPermission')
  })

  it('spec 级：leadAgentId → V1_UNSUPPORTED_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick' }], leadAgentId: 'a' })
    expect(!result.ok && result.code).toBe('V1_UNSUPPORTED_FIELD')
    expect(!result.ok && result.field).toBe('leadAgentId')
  })

  it('spec 级：lead → V1_UNSUPPORTED_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick' }], lead: { name: 'a', seat: 'hephaestus' } })
    expect(!result.ok && result.code).toBe('V1_UNSUPPORTED_FIELD')
    expect(!result.ok && result.field).toBe('lead')
  })

  it('spec 级：description → V1_UNSUPPORTED_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick' }], description: 'team description' })
    expect(!result.ok && result.code).toBe('V1_UNSUPPORTED_FIELD')
    expect(!result.ok && result.field).toBe('description')
  })

  it('member 级 v1 不收表逐字 = 上游五件（subagent_type 有专属码，不入通用表）', async () => {
    expect(TEAM_MEMBER_UNSUPPORTED_UPSTREAM_FIELDS_V1).toEqual(['kind', 'systemPrompt', 'loadSkills', 'role', 'description'])
    expect(TEAM_MEMBER_ALLOWED_FIELDS_V1).toEqual(['name', 'category', 'seat', 'prompt'])
    expect(TEAM_SPEC_ALLOWED_FIELDS_V1).toEqual(['name', 'members'])
    expect(TEAM_SPEC_UNSUPPORTED_UPSTREAM_FIELDS_V1).toEqual(['description', 'leadAgentId', 'lead', 'teamAllowedPaths', 'sessionPermission'])
  })
})

describe('closed shape — 表外字段具名拒绝 + 其余形状错误', async () => {
  it('spec 级未知字段 → UNKNOWN_SPEC_FIELD（不静默吞）', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick' }], inline_spec: {} })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('UNKNOWN_SPEC_FIELD')
      expect(result.message).toContain('unknown field')
      expect(result.message).toContain('closed')
    }
  })

  it('member 级未知字段 → UNKNOWN_MEMBER_FIELD', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick', nickname: 'x' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('UNKNOWN_MEMBER_FIELD')
      expect(result.field).toBe('nickname')
    }
  })

  it('team name 缺失 / 非串 / 纯空白 → TEAM_NAME_REQUIRED（三形同码，message 点名）', async () => {
    for (const raw of [{ members: [{ name: 'a', category: 'quick' }] }, { name: 7, members: [{ name: 'a', category: 'quick' }] }, { name: '   ', members: [{ name: 'a', category: 'quick' }] }]) {
      const result = parseTeamSpec(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('TEAM_NAME_REQUIRED')
        expect(result.field).toBe('name')
      }
    }
  })

  it('member name 缺失 / 非串 / 空白 → MEMBER_NAME_REQUIRED', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ category: 'quick' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('MEMBER_NAME_REQUIRED')
    }
    const typed = parseTeamSpec({ name: 't', members: [{ name: 42, category: 'quick' }] })
    expect(typed.ok).toBe(false)
    if (!typed.ok) {
      expect(typed.code).toBe('FIELD_NOT_STRING') // 给了但类型错 → FIELD_NOT_STRING（两码分界成文）
    }
  })

  it('成员不是对象 → MEMBER_NOT_OBJECT', async () => {
    const result = parseTeamSpec({ name: 't', members: ['hephaestus'] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('MEMBER_NOT_OBJECT')
    }
  })

  it('prompt 非串 → FIELD_NOT_STRING', async () => {
    const result = parseTeamSpec({ name: 't', members: [{ name: 'a', category: 'quick', prompt: 1 }] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('FIELD_NOT_STRING')
      expect(result.field).toBe('prompt')
    }
  })

  it('两臂之外的输入（null / 数组 / number / undefined）→ SPEC_NOT_OBJECT', async () => {
    for (const raw of [null, 42, undefined, [{ name: 't' }]]) {
      const result = parseTeamSpec(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('SPEC_NOT_OBJECT')
      }
    }
  })

  it('坏 JSON string → INVALID_JSON_STRING（文案形随上游 :77）', async () => {
    const result = parseTeamSpec('{name: "t", oops')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('INVALID_JSON_STRING')
      expect(result.message).toContain('inline_spec is a string but not valid JSON')
    }
  })

  it('JSON string 臂 parse 出非对象（如 "42"）→ SPEC_NOT_OBJECT（臂语义只覆盖 object JSON）', async () => {
    const result = parseTeamSpec('42')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('SPEC_NOT_OBJECT')
    }
  })

  it('校验序成文兑现：name 缺失先于 members 畸形报（TEAM_NAME_REQUIRED 赢）', async () => {
    const result = parseTeamSpec({ members: 'nope' })
    expect(!result.ok && result.code).toBe('TEAM_NAME_REQUIRED')
  })

  it('错误码词表封闭且逐字（删码/加码/改名即红；19 枚）', async () => {
    expect(TEAM_SPEC_ERROR_CODES).toHaveLength(19)
    expect([...TEAM_SPEC_ERROR_CODES]).toContain('DUPLICATE_MEMBER_NAME')
    expect([...TEAM_SPEC_ERROR_CODES]).toContain('TEAM_MEMBER_LIMIT_EXCEEDED')
    expect([...TEAM_SPEC_ERROR_CODES]).toContain('UNRESOLVABLE_CATEGORY')
    expect([...TEAM_SPEC_ERROR_CODES]).toContain('SUBAGENT_TYPE_UNSUPPORTED')
  })
})
