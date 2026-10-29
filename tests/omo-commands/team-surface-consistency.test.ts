// tests/omo-commands/team-surface-consistency.test.ts — P5-T16 第二轮评审 MAJOR-3/MAJOR-4：
// **模型可见的调用示例 ↔ 实际工具 required schema** 的一致性门。
//
// 问题（本轮评审抓出）：FULL 形态的模板里教模型的三处调用**照写必失败**——
//   1. `team_send_message(teamRunId=<id>, to="*", kind="announcement")` 缺必填
//      `body` ⇒ 工具抛 `BODY_REQUIRED`；
//   2. `team_send_message(to="lead")` 缺 `teamRunId` 与 `body` ⇒
//      `TEAM_RUN_ID_REQUIRED` / `BODY_REQUIRED`；
//   3. `team_task_update(status="completed")` 缺 `teamRunId` 与 `taskId` ⇒
//      `TEAM_RUN_ID_REQUIRED` / `TASK_ID_INVALID`。
// 模板是**模型可见面**：照着写的每一次调用都被工具拒——广播、成员汇报、任务
// 结算三条主路径全断（remove-ai-slops 的任务未结算还会卡住后面的清空与清理
// 闭环）。
//
// 这条门把「示例」与「schema」绑在一起：**模板里出现的每一个
// `team_xxx(...)` 调用示例，都必须点名该工具的全部必填参数**。以后任何人
// 改工具的 required 集、或在模板里加一个新示例而漏参数，这里立刻红。
//
// 跨包纪律：测试允许同时 import 两侧（生产代码零跨包 import 不受影响）——
// omo-commands 的模板与 omo-team 的工具 schema 各属一包，等值只能靠这道
// 交叉钉（与 `hyperplan-team-upgrade.test.ts` 的 R-5 交叉钉同族）。

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  HYPERPLAN_TEAM_MODE_GUIDANCE,
  HYPERPLAN_COMMAND_TEMPLATE_FULL,
} from '../../patches/omo-dsh/omo-commands/src/templates/hyperplan.ts'
import {
  REMOVE_AI_SLOPS_COMMAND_TEMPLATE_FULL,
  REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM,
} from '../../patches/omo-dsh/omo-commands/src/templates/remove-ai-slops.ts'
import { createTeamSendMessageDefinition } from '../../patches/omo-dsh/omo-team/src/tools/team-message.ts'
import {
  VENDOR_SKILL_TEAM_ADAPTATION_NOTES,
  teamAdaptationNoteFor,
  toSkillRegistration,
} from '../../patches/omo-dsh/omo-commands/src/skills.ts'
import { registerTeamTaskSurface } from '../../patches/omo-dsh/omo-team/src/tools/team-task.ts'
import { registerTeamMessageSurface } from '../../patches/omo-dsh/omo-team/src/tools/team-message.ts'

interface CapturedTool {
  readonly name: string
  readonly required: readonly string[]
}

/** 假 agent：捕获装上来的工具定义（只取 name + parameters.required）。 */
function makeCapturingAgent(captured: CapturedTool[]): {
  readonly session: { readonly header: { readonly id: string } }
  readonly ctx: { readonly tools: { register: (def: unknown) => unknown } }
  readonly inject: () => void
} {
  return {
    session: { header: { id: 'lead-session-1' } },
    ctx: {
      tools: {
        register: (def: unknown) => {
          const typed = def as { name: string, parameters?: { required?: readonly string[] } }
          captured.push({ name: typed.name, required: typed.parameters?.required ?? [] })
          return {}
        },
      },
    },
    inject: () => undefined,
  }
}

/** 装一遍所有 team 工具面，拿到每枚工具的 required 集。 */
function captureToolSchemas(): Map<string, readonly string[]> {
  const captured: CapturedTool[] = []
  const ctx = {
    on: (_event: 'agent/created', listener: (payload: { agent: unknown }) => unknown) => {
      listener({ agent: makeCapturingAgent(captured) })
      return () => undefined
    },
  }
  const store = {
    participationOfMember: () => undefined,
    get: () => undefined,
    listTasks: async () => [],
  } as never
  const deps = { subagents: {} as never, agents: { get: () => undefined }, store }
  registerTeamMessageSurface(ctx as never, deps as never)
  for (const toolName of ['team_task_create', 'team_task_list', 'team_task_get', 'team_task_update']) {
    registerTeamTaskSurface(ctx as never, deps as never, toolName)
  }
  // `team_send_message` 的定义不经 agent/created 装配（它在 lead/member 面上
  // 各自注册），这里直接读定义函数——同一个事实源。
  const messageDef = createTeamSendMessageDefinition(deps as never) as {
    name: string
    parameters: { required: readonly string[] }
  }
  captured.push({ name: messageDef.name, required: messageDef.parameters.required })
  const byName = new Map<string, readonly string[]>()
  for (const row of captured) byName.set(row.name, row.required)
  return byName
}

/** 一个 `team_xxx(...)` 调用示例里点名的参数名。 */
function exampleArgNames(call: string): string[] {
  const inner = call.slice(call.indexOf('(') + 1, call.lastIndexOf(')'))
  return inner
    .split(',')
    .map((part) => part.split('=')[0]!.trim())
    .filter((name) => name.length > 0)
}

/** 文本里所有 `team_xxx(...)` 调用示例（逐个捕获）。 */
function callExamples(text: string): string[] {
  const found: string[] = []
  const pattern = /team_[a-z_]+\([^)]*\)/g
  for (const match of text.matchAll(pattern)) found.push(match[0])
  return found
}

const MODEL_VISIBLE_TEMPLATES: readonly { readonly label: string, readonly text: string }[] = [
  { label: 'hyperplan FULL template', text: HYPERPLAN_COMMAND_TEMPLATE_FULL },
  { label: 'hyperplan team-mode guidance', text: HYPERPLAN_TEAM_MODE_GUIDANCE },
  { label: 'remove-ai-slops FULL template', text: REMOVE_AI_SLOPS_COMMAND_TEMPLATE_FULL },
  { label: 'remove-ai-slops team addendum', text: REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM },
]

describe('P5-T16 (MAJOR-3) 模型可见调用示例 ↔ 工具 required schema', () => {
  const schemas = captureToolSchemas()

  it('the capture really saw the team tool surface (non-vacuous)', () => {
    expect(schemas.size).toBeGreaterThanOrEqual(5)
    expect(schemas.get('team_send_message')).toEqual(['teamRunId', 'to', 'body'])
    expect(schemas.get('team_task_update')).toEqual(['teamRunId', 'taskId', 'status'])
  })

  it('every model-visible team_* call example names ALL of that tool\'s required parameters', () => {
    const problems: string[] = []
    let checked = 0
    for (const { label, text } of MODEL_VISIBLE_TEMPLATES) {
      for (const call of callExamples(text)) {
        const toolName = call.slice(0, call.indexOf('('))
        const required = schemas.get(toolName)
        if (required === undefined) continue // 不是本仓的 team 工具（散文提及）
        checked += 1
        const named = exampleArgNames(call)
        const missing = required.filter((param) => !named.includes(param))
        if (missing.length > 0) {
          problems.push(`${label}: \`${call}\` is missing required param(s): ${missing.join(', ')}`)
        }
      }
    }
    // 非真空：模板里确实有 team_* 调用示例被这条门读到。
    expect(checked).toBeGreaterThan(0)
    expect(problems).toEqual([])
  })

  it('the three examples the review named are present AND complete', () => {
    // 正面钉：评审点名的三处，逐条落到模板里且参数齐。
    const hyperplan = HYPERPLAN_TEAM_MODE_GUIDANCE
    expect(hyperplan).toContain('team_send_message(teamRunId=<id>, to="*", kind="announcement", body=')
    expect(hyperplan).toContain('team_send_message(teamRunId=<id>, to="lead", body=')
    const slops = REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM
    expect(slops).toContain('team_task_update(teamRunId=<id>, taskId=')
    expect(slops).toContain('status="completed"')
  })
})

describe('P5-T16 (MAJOR-4) vendored skill 的 team 面适配注记（消费侧，vendor 字节不动）', () => {
  it('refactor 的注册正文前置适配注记，并强制走 legacy 路径', () => {
    const note = teamAdaptationNoteFor('refactor')
    expect(note).toBeDefined()
    expect(note).toContain('run the')
    expect(note).toContain('LEGACY path (Phase 5.1-L)')
    expect(note).toContain('`team_list`')
    expect(note).toContain('`inline_spec`')
    expect(note).toContain('`quick`')
    expect(note).toContain('`deep`')
    expect(note).toContain('`teamRunId`')
    // 注册面：注记在正文**之前**（模型先读到它）。
    const entry = {
      document: {
        name: 'refactor',
        description: 'd',
        content: 'BODY',
      },
      path: '/tmp/refactor/SKILL.md',
    } as never
    const registration = toSkillRegistration(entry)
    expect(registration.content.startsWith(teamAdaptationNoteFor('refactor')!)).toBe(true)
    expect(registration.content).toContain('BODY')
  })

  it('hyperplan 的注册正文前置词汇翻译注记', () => {
    const note = teamAdaptationNoteFor('hyperplan')
    expect(note).toBeDefined()
    expect(note).toContain('team_send_message(teamRunId=<id>')
    expect(note).toContain('`team_run_id` becomes `teamRunId`')
    expect(note).toContain('`quick` and `deep` are the only two member')
  })

  it('未被登记的技能不前置任何注记（默认逐字）', () => {
    expect(teamAdaptationNoteFor('debugging')).toBeUndefined()
    const entry = {
      document: { name: 'debugging', description: 'd', content: 'BODY' },
      path: '/tmp/debugging/SKILL.md',
    } as never
    expect(toSkillRegistration(entry).content).toBe('BODY')
  })

  it('门：任何带 team 调用示例的 vendored 技能都必须登记适配注记', () => {
    // 「named, not pattern-matched」纪律的**反向门**：扫描 vendor 树，凡是正文
    // 里出现可执行的 team_* 调用示例的技能，都必须在
    // VENDOR_SKILL_TEAM_ADAPTATION_NOTES 里登记它的注记——漏登记 = 该技能的
    // 不兼容正文原样进模型面（这正是 MAJOR-4 的形状）。
    const skillsDir = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../patches/omo-dsh/vendor/shared-skills/skills',
    )
    const offenders: string[] = []
    for (const dir of readdirSync(skillsDir)) {
      const file = join(skillsDir, dir, 'SKILL.md')
      if (!existsSync(file)) continue
      const body = readFileSync(file, 'utf8')
      const hasTeamCall = /team_(create|send_message|task_create|task_update|task_list|list)\s*\(/.test(body)
      if (!hasTeamCall) continue
      if (teamAdaptationNoteFor(dir) === undefined) offenders.push(dir)
    }
    expect(offenders).toEqual([])
    // 非真空：至少两枚技能带 team 调用（refactor / hyperplan）。
    expect(Object.keys(VENDOR_SKILL_TEAM_ADAPTATION_NOTES).sort()).toEqual(['hyperplan', 'refactor'])
  })
})
