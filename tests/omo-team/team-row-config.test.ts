// P5-T14 — 门 4：omo-team 的插件 row Config（dsh Config 契约形态）+ 活体消费
// 链。契约面（team-row-config.ts 头注两臂逐字对应）：
//   * arm 1（cordis 宿主，@deepseek-ai/cordis lib/index.js:957-961）：
//     `Config['~standard'].validate(config)` → {value} | {issues}；
//   * arm 2（doctor-lite check 4 扫描）：`typeof Config === 'function'` +
//     `new Config(config)` 构造即校验、非法抛。
// 消费面（schema 不是装饰的自证）：parseTeamSpec(raw, maxMembers) 旋钮收紧
// （row 给 3 → 4 成员具名拒 `exceeds max 3`），缺省路径文案与 8 顶逐字节不变
// （team-spec.test.ts 的 8/9 边界用例是缺省面的既有钉，本文件不重复）。
//
// WHY EVERY EXPECTATION IS HARD-CODED: 同 T4 的变异敏感纪律——期望值从实现
// 派生会同意实现的任何漂移；合法域的字面量（8 / 3 / 9 / 0 / 1.5）逐例钉死。
//
// The `.ts` extension in the import path is load-bearing: Node 24
// type-stripping does no specifier resolution (tsconfig.host.json header).
import { describe, expect, it } from 'vitest'
import {
  Config,
  TEAM_ROW_CONFIG_DEFAULTS,
  currentTeamRowConfig,
  setTeamRowConfig,
  validateTeamRowConfig,
} from '../../patches/omo-dsh/omo-team/src/team/team-row-config.ts'
import { MAX_TEAM_MEMBERS, parseTeamSpec } from '../../patches/omo-dsh/omo-team/src/team/team-spec.ts'

const member = (name: string) => ({ name, category: 'quick', prompt: `do ${name}` })
const specWith = (count: number) => ({
  name: 'row-config-team',
  members: Array.from({ length: count }, (_unused, index) => member(`member-${index + 1}`)),
})

describe('P5-T14 row Config — defaults and legal domain', () => {
  it('default maxMembers IS the vendored hard cap (pointer, not a restated number)', () => {
    expect(TEAM_ROW_CONFIG_DEFAULTS.maxMembers).toBe(MAX_TEAM_MEMBERS)
    expect(new Config().maxMembers).toBe(8)
    expect(new Config({}).maxMembers).toBe(8)
    expect(new Config(undefined as unknown as {}).maxMembers).toBe(8)
  })

  it('the tightening knob accepts every integer in 1..8', () => {
    for (const n of [1, 2, 3, 7, 8]) {
      expect(new Config({ maxMembers: n }).maxMembers).toBe(n)
    }
  })

  it('refuses past-the-cap and malformed values BY NAME, never silently defaulting', () => {
    for (const bad of [0, -1, 9, 100, 1.5, '3', true, null]) {
      expect(() => new Config({ maxMembers: bad })).toThrow(TypeError)
      const outcome = validateTeamRowConfig({ maxMembers: bad })
      expect(outcome.ok).toBe(false)
    }
    // 越顶的放宽被拒——vendored 硬顶之上没有本旋钮的合法域。
    expect(() => new Config({ maxMembers: MAX_TEAM_MEMBERS + 1 })).toThrow(/maxMembers/)
  })

  it('unknown fields and non-object configs are named, not dropped', () => {
    expect(() => new Config({ maxMember: 3 })).toThrow(/unknown team row config field/)
    const arr = validateTeamRowConfig([1])
    expect(arr.ok).toBe(false)
    const str = validateTeamRowConfig('8')
    expect(str.ok).toBe(false)
  })
})

describe('P5-T14 row Config — arm 1: the cordis host standard-schema face', () => {
  it('Config["~standard"].validate is the interface @deepseek-ai/cordis resolveConfig calls', () => {
    const standard = (Config as unknown as { '~standard': { version: number; validate: (c: unknown) => unknown } })['~standard']
    expect(standard.version).toBe(1)
    const ok = standard.validate(undefined) as { value?: { maxMembers?: number }; issues?: unknown }
    expect(ok.issues).toBeUndefined()
    expect(ok.value?.maxMembers).toBe(8)
    const tightened = standard.validate({ maxMembers: 3 }) as { value?: { maxMembers?: number } }
    expect(tightened.value?.maxMembers).toBe(3)
    const bad = standard.validate({ maxMembers: 0 }) as { issues?: { message: string }[] }
    expect(Array.isArray(bad.issues)).toBe(true)
    expect(bad.issues?.[0]?.message).toMatch(/maxMembers/)
  })

  it('the two arms agree: constructor-throws iff standard-reports-issues', () => {
    for (const input of [undefined, {}, { maxMembers: 1 }, { maxMembers: 8 }, { maxMembers: 9 }, { maxMembers: 'x' }, { extra: 1 }, [2]]) {
      const standard = (Config as unknown as { '~standard': { validate: (c: unknown) => { issues?: unknown } } })['~standard'].validate(input)
      let threw = false
      try {
        new Config(input as never)
      } catch {
        threw = true
      }
      expect(threw).toBe(standard.issues !== undefined)
    }
  })
})

describe('P5-T14 row Config — the live consumption chain', () => {
  it('apply-time set + registrar read: the singleton carries the mounted row config', () => {
    // 默认态 = 缺省（未挂载/直调 apply(ctx) 的形态）。
    setTeamRowConfig(undefined)
    expect(currentTeamRowConfig().maxMembers).toBe(8)
    // 挂载行给 3 → 单例收紧。
    const applied = setTeamRowConfig({ maxMembers: 3 })
    expect(currentTeamRowConfig().maxMembers).toBe(3)
    expect(applied.maxMembers).toBe(3)
    // 坏 config 在写入点就被拒（apply 会把抛冒泡给宿主，不是静默吞）。
    expect(() => setTeamRowConfig({ maxMembers: 9 })).toThrow(TypeError)
    expect(currentTeamRowConfig().maxMembers).toBe(3) // 被拒的写入不改变现状
    // 复位缺省，别把旋钮留在测试里。
    setTeamRowConfig(undefined)
    expect(currentTeamRowConfig().maxMembers).toBe(8)
  })

  it('parseTeamSpec consumes the cap: row 3 refuses a 4-member spec BY NAME', () => {
    const four = specWith(4)
    expect(parseTeamSpec(four).ok).toBe(true) // 缺省 8 = 今日行为逐字节不变
    const tightened = parseTeamSpec(four, 3)
    expect(tightened.ok).toBe(false)
    if (!tightened.ok) {
      expect(tightened.code).toBe('TEAM_MEMBER_LIMIT_EXCEEDED')
      expect(tightened.message).toContain('exceeds max 3 members.')
    }
    // 收紧不伤及格内：3 成员在收紧后仍绿。
    expect(parseTeamSpec(specWith(3), 3).ok).toBe(true)
    // 缺省顶仍逐字钉 8（与 team-spec.test.ts 的既有钉同锚，双处各守各的）。
    const nine = parseTeamSpec(specWith(9))
    expect(nine.ok).toBe(false)
    if (!nine.ok) expect(nine.message).toContain('exceeds max 8 members.')
  })
})
