// tests/omo-commands/remove-ai-slops-team-upgrade.test.ts — P5-T13 ·
// remove-ai-slops 双形态升级的消费侧单测（与 hyperplan-team-upgrade.test.ts
// 同构，另一张脸：`omoTeamSlopAddendumTeamFace`）。
//
// 覆盖面：① 缺席 ⇒ 渲染逐字节 = P4 主段模板（commands.test.ts 钉过的
// "slop-squad/team_create/Team Mode Protocol 不进降级串"在此镜像成渲染级断言）；
// ② 在场 ⇒ addendum 拼进正文、N1 五值词表与"无配置开关"句进模型可见面；
// ③ 惰性读（中途挂载）；④ 服务名交叉等值；⑤ addendum 死链守护；
// ⑥ T13 修复轮 MAJOR-2b：32KB 上限补教进 worker 报告契约（钉活常量）。

import { describe, expect, it } from 'vitest'

import {
  REMOVE_AI_SLOPS_ADDENDUM_STATUS_RULE,
  REMOVE_AI_SLOPS_CARRIER_NOTE,
  REMOVE_AI_SLOPS_COMMAND_TEMPLATE,
  REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM,
  REMOVE_AI_SLOPS_TEMPLATE,
} from '../../patches/omo-dsh/omo-commands/src/templates/remove-ai-slops.ts'
import {
  OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE,
  createRemoveAiSlopsCommand,
  readSlopTeamModePresent,
  renderRemoveAiSlopsInstruction,
} from '../../patches/omo-dsh/omo-commands/src/commands/remove-ai-slops.ts'
import {
  OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE as PROVIDER_FACE_NAME,
  teamToolPresenceSnapshot,
} from '../../patches/omo-dsh/omo-team/src/team/team-tool-presence.ts'
import { TEAM_TASK_STATUSES } from '../../patches/omo-dsh/omo-team/src/tools/team-task.ts'
import { TEAM_MESSAGE_PAYLOAD_MAX_BYTES } from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

function invocation(rawInput: string) {
  const queued: string[] = []
  return {
    queued,
    value: {
      rawInput,
      agent: {
        id: 'session-t13-slop',
        followup: (message: { content: readonly [{ text: string }] }) => {
          queued.push(message.content[0].text)
        },
      },
    },
  }
}

describe('P5-T13 服务名交叉等值 + 保守读', () => {
  it('消费侧拼写 === 提供侧拼写', () => {
    expect(OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE).toBe(PROVIDER_FACE_NAME)
    expect(OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE).toBe('omoTeamSlopAddendumTeamFace')
  })

  it('三态归一：无 get / 畸形 / 非 true ⇒ false；本腿消费 teamTaskStatuses 臂', () => {
    expect(readSlopTeamModePresent(undefined)).toBe(false)
    expect(readSlopTeamModePresent(() => undefined)).toBe(false)
    expect(readSlopTeamModePresent(() => ({ teamToolsPresent: true }))).toBe(false) // 缺 statuses 臂
    expect(readSlopTeamModePresent(() => ({ teamToolsPresent: 'yes', teamTaskStatuses: [] }))).toBe(false)
    expect(readSlopTeamModePresent(() => teamToolPresenceSnapshot())).toBe(true)
  })
})

describe('P5-T13 渲染 — 降级腿逐字节等于 P4', () => {
  it('默认缺席渲染 = P4 主段模板渲染；addendum 三特征词零出现', () => {
    const { value } = invocation('clean the branch')
    const degraded = renderRemoveAiSlopsInstruction(value)
    expect(degraded).toBe(renderRemoveAiSlopsInstruction(value, false))
    expect(degraded).toContain(REMOVE_AI_SLOPS_CARRIER_NOTE)
    // 渲染器替换过 `$ARGUMENTS`，所以整串比对用替换后的模板。
    expect(degraded).toContain(REMOVE_AI_SLOPS_COMMAND_TEMPLATE.replace('$ARGUMENTS', 'clean the branch'))
    // 降级串的三特征反向钉（commands.test.ts 的常量级钉在此升成渲染级）。
    expect(degraded).not.toContain('slop-squad')
    expect(degraded).not.toContain('Team Mode Protocol')
    expect(degraded).not.toContain('team_create')
  })
})

describe('P5-T13 渲染 — 完整腿的 addendum 形态', () => {
  const { value } = invocation('clean the branch')
  const full = renderRemoveAiSlopsInstruction(value, true)

  it('addendum 拼进正文（Phase 2-5 骨架 + MUST NOT 名单各就其位）', () => {
    expect(full).toContain(REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM)
    expect(full).toContain('# Team Mode Protocol (active when team_* tools are present)')
    expect(full).toContain('## Phase 5 (team): Team cleanup')
    expect(full).toContain('## MUST NOT (team mode)')
    // 主段仍在（addendum 是**追加**，不是替换——上游语义 override 的是 Phase 2-4
    // 的执行方式，正文四段仍是底本）。主段无占位符，可逐字整段比对。
    expect(full).toContain(REMOVE_AI_SLOPS_TEMPLATE)
  })

  it('N1 词表规则进模型可见面且逐字对 TEAM_TASK_STATUSES', () => {
    expect(full).toContain(REMOVE_AI_SLOPS_ADDENDUM_STATUS_RULE)
    for (const status of TEAM_TASK_STATUSES) {
      expect(REMOVE_AI_SLOPS_ADDENDUM_STATUS_RULE).toContain(`\`${status}\``)
    }
    expect(REMOVE_AI_SLOPS_ADDENDUM_STATUS_RULE).toContain('There is NO `failed` state')
    // 空头指令拆弹的反向钉：addendum 自己绝不发 `status="failed"`。
    expect(REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM).not.toContain('status="failed"')
  })

  it('载体死链守护：上游 config 路径 / 键名 / team_list 不进 addendum 正文', () => {
    for (const dead of ['~/.omo', 'team_mode.enabled', 'team_list(']) {
      expect(REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM, `${dead} must not ride the addendum`).not.toContain(dead)
    }
    // inline_spec 是本部署真臂（工具面实测），必须点名。
    expect(REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM).toContain('inline_spec')
    expect(REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM).toContain('"category":"quick"')
    // 注记同样**不点名**该键（注记也是模型可见面——它只说"pointing at a
    // configuration flag"，键名只活在 vendor deviations[] 与源码注释里）。
    expect(REMOVE_AI_SLOPS_CARRIER_NOTE).toContain('pointing at a configuration flag')
    expect(REMOVE_AI_SLOPS_CARRIER_NOTE).not.toContain('team_mode.enabled')
  })

  it('评审席队外委派点名 plan-reviewer（只读席不入队的反面点名进 MUST NOT）', () => {
    expect(REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM).toContain('plan-reviewer')
    expect(REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM).toContain('The reviewer is NOT a team member')
  })

  it('T13 修复轮 MAJOR-2b：worker 报告契约教 32KB 拆分规则（数字钉活常量）', () => {
    // 上游靠「Load the team-mode skill」教会模型这条上限（其 :127 同句点名
    // 32KB message cap）；本部署 team-mode 不可加载（19 件目录），知识必须
    // 补进 addendum 的模型可见面——`body=<full removal report>` 正是鼓励长
    // body 的位置，上限是真实强制（超限硬拒、具名报限、可恢复）。
    expect(TEAM_MESSAGE_PAYLOAD_MAX_BYTES).toBe(32768)
    expect(REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM).toContain(String(TEAM_MESSAGE_PAYLOAD_MAX_BYTES))
    expect(REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM).toContain('split')
    // 与拒绝面对齐：工具拒绝文本点名的键名（team-message.ts:237-241）也进指引。
    expect(REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM).toContain('message_payload_max_bytes')
    // 渲染级：完整腿带它，降级腿逐字节不变所以不带（P4 面不长新句）。
    expect(full).toContain(String(TEAM_MESSAGE_PAYLOAD_MAX_BYTES))
    expect(renderRemoveAiSlopsInstruction(invocation('clean the branch').value))
      .not.toContain(String(TEAM_MESSAGE_PAYLOAD_MAX_BYTES))
  })
})

describe('P5-T13 handler — 惰性读 + 回报文本分形态', () => {
  it('中途挂载：第一次降级回报、第二次完整回报（addendum attached）', () => {
    let mounted: unknown = undefined
    const presence = { get: (name: string) => (name === OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE ? mounted : undefined) }
    const command = createRemoveAiSlopsCommand(presence)

    const first = invocation('clean a')
    const r1 = command.handler(first.value)
    expect(r1.kind).toBe('success')
    expect(r1.kind === 'success' && r1.text).not.toContain('team-mode addendum attached')
    expect(first.queued[0]).not.toContain('Team Mode Protocol')

    mounted = teamToolPresenceSnapshot()
    const second = invocation('clean b')
    const r2 = command.handler(second.value)
    expect(r2.kind === 'success' && r2.text).toContain('team-mode addendum attached')
    expect(second.queued[0]).toContain('Team Mode Protocol')
  })

  it('presence 缺席 = P4 回报文本逐字不变', () => {
    const { value, queued } = invocation('clean c')
    const result = createRemoveAiSlopsCommand().handler(value)
    expect(result.kind).toBe('success')
    expect(result.kind === 'success' && result.text).toBe(
      `Remove-AI-slops instruction queued (${queued[0].length} chars); it takes effect in the next turn.`,
    )
    expect(queued[0]).toBe(renderRemoveAiSlopsInstruction(value))
  })

  it('get 抛错 = error 回报（不拖垮调用方）', () => {
    const command = createRemoveAiSlopsCommand({
      get: () => {
        throw new Error('probe exploded')
      },
    })
    const result = command.handler(invocation('clean d').value)
    expect(result.kind).toBe('error')
    expect(result.kind === 'error' && result.text).toContain('probe exploded')
  })
})
