// tests/omo-commands/hyperplan-team-upgrade.test.ts — P5-T13 · hyperplan 双形态
// 升级的消费侧单测（T13 交付物 3 的 omo-commands 半）。
//
// 覆盖面（判定条件逐条对位）：
//   ① 探测缺席/畸形 ⇒ 渲染降级正文且**逐字节等于** P4 模板渲染（降级路径不许
//      因升级死掉——反向覆盖 = 本文件，e2e 沙箱恒在场故不承担反向腿）；
//   ② 探测在场 ⇒ 渲染完整环正文（首行逐字回上游 purpose 句、roster 契约段与
//      guidance 段各就其位、N1 五值词表进模型可见面）；
//   ③ **惰性读证明**：一次注册、两次调用之间服务从缺席变在场——第二次调用
//      必须渲染完整形态（apply 期缓存把手的写法在这条腿前当场死）；
//   ④ 服务名交叉等值（R-5 双拼写先例）：消费侧拼写 === 提供侧拼写；
//   ⑤ 完整正文的死链守护：上游四枚 category 名、`team_mode.enabled`、任何
//      `~/.` 载体路径都不许进完整正文（它们只活在注记里）。
// T13 评审 A 修复轮追加：
//   ⑥ MAJOR-1：task_send 死载体前置的拆解句逐字进完整 guidance + frame，
//      且死载体的可 act 形态（重启 flag/祈使句）不随拆解句回流；
//   ⑦ MAJOR-2b：32KB 消息上限补教进派单条款，数字钉 omo-team 活常量。

import { describe, expect, it } from 'vitest'

import {
  HYPERPLAN_CARRIER_NOTE,
  HYPERPLAN_COMMAND_TEMPLATE_FULL,
  HYPERPLAN_ROSTER_CONTRACT,
  HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT,
  HYPERPLAN_TEAM_MODE_GUIDANCE,
  HYPERPLAN_TEAM_MODE_ROSTER_CONTRACT,
} from '../../patches/omo-dsh/omo-commands/src/templates/hyperplan.ts'
import {
  HYPERPLAN_DESCRIPTION,
  HYPERPLAN_DESCRIPTION_REGISTERED,
  HYPERPLAN_FRAME_DESCRIPTION_FULL,
  OMO_TEAM_HYPERPLAN_TEAM_FACE,
  createHyperplanCommand,
  readTeamModePresent,
  renderHyperplanInstruction,
} from '../../patches/omo-dsh/omo-commands/src/commands/hyperplan.ts'
// R-5 交叉钉：跨包测试允许同时 import 两侧（生产代码零跨包 import 不受影响）。
import {
  OMO_TEAM_HYPERPLAN_TEAM_FACE as PROVIDER_FACE_NAME,
  TEAM_TOOL_ROW_IDS,
  teamToolPresenceSnapshot,
} from '../../patches/omo-dsh/omo-team/src/team/team-tool-presence.ts'
import { TEAM_TASK_STATUSES } from '../../patches/omo-dsh/omo-team/src/tools/team-task.ts'
import { TEAM_CATEGORY_SEAT_ALIASES_V1 } from '../../patches/omo-dsh/omo-team/src/team/member-validator.ts'
import { TEAM_MESSAGE_PAYLOAD_MAX_BYTES } from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

const FIXED_NOW = '2026-10-12T00:00:00.000Z'
const clock = () => FIXED_NOW

function invocation(rawInput: string) {
  const queued: string[] = []
  return {
    queued,
    value: {
      rawInput,
      agent: {
        id: 'session-t13-1',
        followup: (message: { content: readonly [{ text: string }] }) => {
          queued.push(message.content[0].text)
        },
      },
    },
  }
}

/** 在场脸（提供侧真函数的产物，不手搓形状）。
 *  P5-T16（评审 MINOR-7）：提供侧快照读的是**本次 boot 实际注册成功**的行 id 集
 *  （事实层），所以这里显式给一份「①–⑪ 全部注册成功」的注册结果集。 */
const presentFace = teamToolPresenceSnapshot(new Set(TEAM_TOOL_ROW_IDS))

describe('P5-T13 服务名交叉等值（R-5 双拼写先例）', () => {
  it('消费侧拼写与提供侧拼写逐字相等', () => {
    expect(OMO_TEAM_HYPERPLAN_TEAM_FACE).toBe(PROVIDER_FACE_NAME)
    expect(OMO_TEAM_HYPERPLAN_TEAM_FACE).toBe('omoTeamHyperplanTeamFace')
  })
})

describe('P5-T13 readTeamModePresent — 三态归一的保守读', () => {
  it('无 get / 服务缺席 / 形状不合 / 非 true ⇒ 一律 false', () => {
    expect(readTeamModePresent(undefined)).toBe(false)
    expect(readTeamModePresent(() => undefined)).toBe(false)
    expect(readTeamModePresent(() => null)).toBe(false)
    expect(readTeamModePresent(() => 'team')).toBe(false)
    expect(readTeamModePresent(() => ({ teamToolsPresent: true }))).toBe(false) // 缺 names 臂
    expect(readTeamModePresent(() => ({ teamToolNames: [] }))).toBe(false) // 缺 present 臂
    expect(readTeamModePresent(() => ({ teamToolsPresent: 'true', teamToolNames: [] }))).toBe(false)
    expect(readTeamModePresent(() => ({ teamToolsPresent: false, teamToolNames: [] }))).toBe(false)
  })

  it('显式 true + 名单成臂 ⇒ true（且提供侧真实快照就是 true）', () => {
    expect(readTeamModePresent(() => ({ teamToolsPresent: true, teamToolNames: ['team_create'] }))).toBe(true)
    expect(readTeamModePresent(() => presentFace)).toBe(true)
  })
})

describe('P5-T13 渲染 — 降级腿逐字节等于 P4', () => {
  it('teamModePresent 默认 false：渲染串与 P4 单测同一入口逐字节相等', () => {
    const { value } = invocation('plan the auth rewrite')
    const degraded = renderHyperplanInstruction(value, clock)
    const degradedExplicit = renderHyperplanInstruction(value, clock, false)
    expect(degraded).toBe(degradedExplicit)
    // 降级正文不含完整环的任何一段（反向钉）。
    expect(degraded).not.toContain('TEAM-MODE RING ACTIVE')
    expect(degraded).not.toContain(HYPERPLAN_TEAM_MODE_ROSTER_CONTRACT)
    expect(degraded).toContain(HYPERPLAN_ROSTER_CONTRACT)
    // Description 行是降级后缀原串（MAJOR-1 的 P4 面在降级时刻原样活着）。
    expect(degraded).toContain(HYPERPLAN_DESCRIPTION)
    expect(degraded).not.toContain(HYPERPLAN_FRAME_DESCRIPTION_FULL)
  })
})

describe('P5-T13 渲染 — 完整腿的形态与词表', () => {
  const { value } = invocation('plan the auth rewrite')
  const full = renderHyperplanInstruction(value, clock, true)

  it('首行逐字回上游 purpose 句（team-mode 此刻是 live 事实）', () => {
    expect(full).toContain('You are running the `/hyperplan` command — adversarial multi-agent planning via team-mode.')
    expect(full).not.toContain('DEGRADED form')
  })

  it('完整两段各就其位，Description 行换成完整后缀', () => {
    expect(full).toContain(HYPERPLAN_TEAM_MODE_ROSTER_CONTRACT)
    expect(full).toContain(HYPERPLAN_TEAM_MODE_GUIDANCE)
    expect(full).toContain(HYPERPLAN_FRAME_DESCRIPTION_FULL)
    expect(full).toContain(HYPERPLAN_COMMAND_TEMPLATE_FULL.replace('$ARGUMENTS', 'plan the auth rewrite').slice(0, 80))
  })

  it('roster 契约的词表逐字对 omo-team 的 live 事实（不转抄）', () => {
    // category 两臂逐字对别名表。
    for (const category of Object.keys(TEAM_CATEGORY_SEAT_ALIASES_V1)) {
      expect(HYPERPLAN_TEAM_MODE_ROSTER_CONTRACT).toContain(`\`${category}\``)
    }
    // 五值词表逐字对 TEAM_TASK_STATUSES（N1 的正面腿进模型可见面）。
    for (const status of TEAM_TASK_STATUSES) {
      expect(HYPERPLAN_TEAM_MODE_GUIDANCE).toContain(`\`${status}\``)
    }
    expect(HYPERPLAN_TEAM_MODE_GUIDANCE).toContain('there is NO `failed` state')
  })

  it('完整正文死链守护：上游四枚 category / 配置键 / `~/.` 路径都不进正文', () => {
    const bodies = [HYPERPLAN_TEAM_MODE_ROSTER_CONTRACT, HYPERPLAN_TEAM_MODE_GUIDANCE, HYPERPLAN_COMMAND_TEMPLATE_FULL]
    for (const dead of ['unspecified-low', 'unspecified-high', 'ultrabrain', 'artistry', 'team_mode.enabled', '~/.omo', '~/.config']) {
      for (const body of bodies) {
        expect(body, `${dead} must not ride the model-facing body`).not.toContain(dead)
      }
    }
    // 它们必须活在注记里（死链要有人记账——注记是唯一的登记面）。
    for (const dead of ['unspecified-low', 'ultrabrain', 'team_mode.enabled']) {
      expect(HYPERPLAN_CARRIER_NOTE).toContain(dead)
    }
  })

  it('team_* 祈使句在完整正文合法（在场即工具面）；环核心八枚逐名点名', () => {
    // 环核心 = 组建/广播/派单/更态/发消息/关停/批准/拆除 + 状态读。
    // 未点名的三枚（team_task_get / team_task_list / team_reject_shutdown）
    // 是运行时读面与成员侧动作——正文不点名不等于不可用，此处把"哪些名字
    // 进了模型面"记成显式名单而不是含糊的 every。
    const ringNamed = [
      'team_create', 'team_send_message', 'team_task_create', 'team_task_update',
      'team_shutdown_request', 'team_approve_shutdown', 'team_delete', 'team_status',
    ]
    for (const tool of ringNamed) {
      expect(HYPERPLAN_COMMAND_TEMPLATE_FULL, `ring body must speak ${tool}`).toContain(tool)
      expect(TEAM_TOOL_ROW_IDS).toContain(tool) // 名字必须活着（在分母名单里）
    }
    const notNamed = TEAM_TOOL_ROW_IDS.filter((tool) => !ringNamed.includes(tool))
    expect(notNamed.sort()).toEqual(['team_reject_shutdown', 'team_task_get', 'team_task_list'])
  })
})

describe('P5-T13 修复轮 MAJOR-1 — task_send 死载体前置的拆解句', () => {
  // vendored SKILL.md:38 的 HARD PRECONDITIONS 要求 `team_create` / `task_send` /
  // `team_delete` 三名齐验，缺席则 STOP + senpi 重启指令。本部署 `task_send` 恒不
  // 存在（DSH 面 = team_send_message / team_task_*），完整 guidance 若不带拆解句，
  // 模型照字面跑前置检查即 STOP 并输出死载体指令——评审 A MAJOR-1 拆的弹。
  it('拆解句逐字进完整 guidance（常量级），语义锚点齐', () => {
    expect(HYPERPLAN_TEAM_MODE_GUIDANCE).toContain(HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT)
    // 语义锚点：上游拼写、本面对应物、参数名、判死句、开关句——缺一个就不是拆解。
    for (const anchor of [
      'task_send',
      'team_run_id',
      'team_send_message',
      'team_task_*',
      'teamRunId',
      'the senpi restart line is dead',
      'the live tool surface IS the switch',
    ]) {
      expect(HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT, `split sentence must speak ${anchor}`).toContain(anchor)
    }
    // 拆解句必须明说「不许 STOP」——只映射词汇不拆动作，前置检查照样炸。
    expect(HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT).toContain('never STOP on that check')
  })

  it('拆解句进渲染后的完整 frame（渲染级，不是注释里的许诺）', () => {
    const { value } = invocation('plan the auth rewrite')
    const rendered = renderHyperplanInstruction(value, clock, true)
    expect(rendered).toContain(HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT)
  })

  it('反向钉：死载体的可 act 形态不随拆解句回流（重启 flag / 重启祈使句不进正文）', () => {
    const bodies = [HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT, HYPERPLAN_TEAM_MODE_GUIDANCE, HYPERPLAN_COMMAND_TEMPLATE_FULL]
    for (const body of bodies) {
      // 判死可以提，复述不行：flag 原文与"重启宿主"祈使都不许出现在模型正文。
      expect(body, '--no-omo-task is a dead host flag').not.toContain('--no-omo-task')
      expect(body, 'restart-opencode imperative').not.toContain('restart opencode')
      expect(body, 'Restart-senpi imperative verbatim').not.toContain('Restart senpi')
    }
  })

  it('降级腿不受牵连：拆解句只在完整形态（降级有自己的第 2 条拆解）', () => {
    const { value } = invocation('plan the auth rewrite')
    const degraded = renderHyperplanInstruction(value, clock)
    // 降级正文本来就不出现 task_send 的非否认句（P4 守卫已钉），拆解句属于完整
    // 形态的词表面——降级模板逐字节不变（T13 反向腿），所以它也不该带新句。
    expect(degraded).not.toContain(HYPERPLAN_TEAM_MODE_CARRIER_SPELLING_SPLIT)
  })
})

describe('P5-T13 修复轮 MAJOR-2b — 32KB 消息上限的补教', () => {
  // 上游靠「加载 team-mode skill」教会模型 32KB 上限；本部署该 skill 不可加载
  // （19 件目录无 team-mode），删了加载面就必须把知识补进模型可见面——上限本身
  // 是本部署真实强制（team-message.ts 超限硬拒并具名报限，可恢复）。
  it('派单条款教上限：数字逐字钉活常量，拆分规则与可恢复性齐', () => {
    // 数字不转抄自注记——钉 omo-team 的活常量（漂移即红）。
    expect(TEAM_MESSAGE_PAYLOAD_MAX_BYTES).toBe(32768)
    expect(HYPERPLAN_TEAM_MODE_GUIDANCE).toContain(String(TEAM_MESSAGE_PAYLOAD_MAX_BYTES))
    expect(HYPERPLAN_TEAM_MODE_GUIDANCE).toContain('split')
    expect(HYPERPLAN_TEAM_MODE_GUIDANCE).toContain('team_send_message')
    // 具名拒绝：工具拒绝文本自己点名上限（message_payload_max_bytes），指引与
    // 拒绝面用同一个键名，模型对得上号。
    expect(HYPERPLAN_TEAM_MODE_GUIDANCE).toContain('message_payload_max_bytes')
  })
})

describe('P5-T13 handler — 惰性读证明（一次注册，中途挂载）', () => {
  it('第一次调用无服务=降级；服务后挂载，第二次调用即完整（无 apply 期缓存）', () => {
    let mounted: unknown = undefined
    const presence = { get: (name: string) => (name === OMO_TEAM_HYPERPLAN_TEAM_FACE ? mounted : undefined) }
    const command = createHyperplanCommand(presence, clock)

    const first = invocation('plan a')
    const r1 = command.handler(first.value)
    expect(r1.kind).toBe('success')
    expect(r1.kind === 'success' && r1.text).toContain('DEGRADED')
    expect(first.queued[0]).toContain(HYPERPLAN_ROSTER_CONTRACT)

    // provider 纤在两次调用**之间**挂载（roster 顺序无关性的运行时形态）。
    mounted = teamToolPresenceSnapshot(new Set(TEAM_TOOL_ROW_IDS))
    const second = invocation('plan b')
    const r2 = command.handler(second.value)
    expect(r2.kind === 'success' && r2.text).toContain('FULL team-mode ring')
    expect(second.queued[0]).toContain(HYPERPLAN_TEAM_MODE_ROSTER_CONTRACT)
  })

  it('presence 整个缺席（undefined）= 恒降级（P4 宿主原样）', () => {
    const command = createHyperplanCommand(undefined, clock)
    const { value, queued } = invocation('plan c')
    const result = command.handler(value)
    expect(result.kind === 'success' && result.text).toContain('DEGRADED')
    expect(queued[0]).toBe(renderHyperplanInstruction(value, clock))
  })

  it('get 抛错 = 该行 error 回报，不拖垮调用方（保守面）', () => {
    const command = createHyperplanCommand({
      get: () => {
        throw new Error('service exploded')
      },
    }, clock)
    const { value } = invocation('plan d')
    const result = command.handler(value)
    expect(result.kind).toBe('error')
    expect(result.kind === 'error' && result.text).toContain('service exploded')
  })
})

describe('P5-T13 注册 description 形态中立（命令列表不许单向许诺）', () => {
  it('注册串含两形态的切换事实，不含单向词', () => {
    expect(HYPERPLAN_DESCRIPTION_REGISTERED.startsWith(
      '(builtin) Adversarial multi-agent planning via team-mode (5 hostile category members cross-critique, lead synthesizes)',
    )).toBe(true)
    expect(HYPERPLAN_DESCRIPTION_REGISTERED).toContain('ring form decided per invocation')
    // 注册串自己不许写死 DEGRADED-only 或 FULL-only 的许诺。
    expect(HYPERPLAN_DESCRIPTION_REGISTERED).toContain('DEGRADED roster-delegation form when they are not')
    expect(HYPERPLAN_DESCRIPTION_REGISTERED).toContain('full team-mode ring while the team_* tools are live')
  })
})
