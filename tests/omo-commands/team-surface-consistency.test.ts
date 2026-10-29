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
  HYPERPLAN_TEAM_SPEC_REPLACEMENT,
  TEAM_SURFACE_SHAPES_NOTE,
  VENDOR_SKILL_TEAM_ADAPTATION_NOTES,
  teamAdaptationNoteFor,
  toSkillRegistration,
} from '../../patches/omo-dsh/omo-commands/src/skills.ts'
import {
  HYPERPLAN_CARRIER_NOTE,
  TEAM_CARRIER_NOTE,
  ULTRAWORK_CARRIER_NOTE,
  ULTRAWORK_TEAM_CARRIER_NOTE,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/messages.ts'
import { parseTeamSpec } from '../../patches/omo-dsh/omo-team/src/team/team-spec.ts'
import { registerTeamTaskSurface } from '../../patches/omo-dsh/omo-team/src/tools/team-task.ts'
import { registerTeamCreateSurface } from '../../patches/omo-dsh/omo-team/src/tools/team-create.ts'
import { registerTeamDeleteSurface } from '../../patches/omo-dsh/omo-team/src/tools/team-delete.ts'
import { registerTeamStatusSurface } from '../../patches/omo-dsh/omo-team/src/tools/team-status.ts'
import {
  registerTeamApproveShutdownSurface,
  registerTeamRejectShutdownSurface,
  registerTeamShutdownRequestSurface,
} from '../../patches/omo-dsh/omo-team/src/tools/team-shutdown.ts'
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
  // P5-T19（第三轮评审 MINOR-4）：把**其余 team 工具**也收进来——上一轮只捕获
  // 五件，注释却宣称 "every ..."; `team_create` / `team_delete` / `team_status` /
  // 关停三件套的 required 集因此从未被比过。
  const moreCaptured: CapturedTool[] = []
  const moreCtx = {
    on: (_event: 'agent/created', listener: (payload: { agent: unknown }) => unknown) => {
      listener({ agent: makeCapturingAgent(moreCaptured) })
      return () => undefined
    },
  }
  registerTeamCreateSurface(moreCtx as never, { subagents: {} as never, store } as never)
  registerTeamDeleteSurface(moreCtx as never, { subagents: {} as never, agents: { get: () => undefined }, store } as never)
  registerTeamStatusSurface(moreCtx as never, { store, agents: { get: () => undefined } } as never)
  registerTeamShutdownRequestSurface(moreCtx as never, { subagents: {} as never, agents: { get: () => undefined }, store } as never)
  registerTeamApproveShutdownSurface(moreCtx as never, { subagents: {} as never, agents: { get: () => undefined }, store } as never)
  registerTeamRejectShutdownSurface(moreCtx as never, { subagents: {} as never, agents: { get: () => undefined }, store } as never)
  for (const row of moreCaptured) captured.push(row)
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

/**
 * 一个 `team_xxx(...)` 调用示例里点名的参数名。
 *
 * 两种调用形态都要认：`fn(arg=value, ...)` 与**对象字面量** `fn({ arg: value })`
 * （`HYPERPLAN_TEAM_SPEC_REPLACEMENT` 与 slops addendum 用的是后者）。
 */
function exampleArgNames(call: string): string[] {
  const inner = call.slice(call.indexOf('(') + 1, call.lastIndexOf(')'))
  // 三种写法都认：`arg=value`、`{ arg: value }`、以及**纯签名** `fn(a, b, c)`
  // （纯签名本身就是"点名必填参数"的最短写法，不该被判成残调用）。
  const names: string[] = []
  for (const part of inner.split(',')) {
    const trimmed = part.trim()
    const assigned = /([A-Za-z_][A-Za-z0-9_]*)\s*[:=]/.exec(trimmed)
    if (assigned !== null) {
      names.push(assigned[1])
      continue
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) names.push(trimmed)
  }
  return names
}

/** 文本里所有 `team_xxx(...)` 调用示例（逐个捕获）。 */
function callExamples(text: string): string[] {
  const found: string[] = []
  const pattern = /team_[a-z_]+\([^)]*\)/g
  for (const match of text.matchAll(pattern)) found.push(match[0])
  return found
}

/**
 * 本仓**所有**模型可见文本（P5-T19 第三轮评审 MINOR-4：上一轮只列四个模板，
 * 注释却宣称 "every model-visible"——现在把命令模板、技能注记、keyword 注记
 * 全部收进来，声明与覆盖对齐）。
 */
const MODEL_VISIBLE_TEMPLATES: readonly { readonly label: string, readonly text: string }[] = [
  { label: 'hyperplan FULL template', text: HYPERPLAN_COMMAND_TEMPLATE_FULL },
  { label: 'hyperplan team-mode guidance', text: HYPERPLAN_TEAM_MODE_GUIDANCE },
  { label: 'remove-ai-slops FULL template', text: REMOVE_AI_SLOPS_COMMAND_TEMPLATE_FULL },
  { label: 'remove-ai-slops team addendum', text: REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM },
  // 技能注册面的适配注记（MAJOR-2/3/4 的产物：它们自己也在教调用形状）。
  ...Object.entries(VENDOR_SKILL_TEAM_ADAPTATION_NOTES)
    .map(([skill, text]) => ({ label: `skill adaptation note: ${skill}`, text })),
  // keyword 注入面的注记（omo-hooks）。
  { label: 'keyword note: team', text: TEAM_CARRIER_NOTE },
  { label: 'keyword note: ultrawork', text: ULTRAWORK_CARRIER_NOTE },
  { label: 'keyword note: hyperplan', text: HYPERPLAN_CARRIER_NOTE },
]

describe('P5-T16 (MAJOR-3) 模型可见调用示例 ↔ 工具 required schema', () => {
  const schemas = captureToolSchemas()

  it('the capture really saw the team tool surface (non-vacuous)', () => {
    expect(schemas.size).toBeGreaterThanOrEqual(11)
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
    expect(note).toContain('a member `category`')
    expect(note).toContain('is exactly `quick` or `deep`')
    expect(note).toContain('REPLACE the inline spec printed in the body below')
  })

  it('未被登记的技能不前置任何注记（默认逐字）', () => {
    // 用一枚**真的**没有 team 内容的技能（`git-master`），不是 `debugging`——
    // P5-T19（第三轮评审 MINOR）：上一轮这里拿 `debugging` 当「无注记」的例子，
    // 而它其实有 team 路径（在 references 里）⇒ 等于把**遗漏**钉成了预期行为。
    expect(teamAdaptationNoteFor('git-master')).toBeUndefined()
    const entry = {
      document: { name: 'git-master', description: 'd', content: 'BODY' },
      path: '/tmp/git-master/SKILL.md',
    } as never
    expect(toSkillRegistration(entry).content).toBe('BODY')
  })

  it('门：任何带 team 调用的 vendored 技能（含 references/）都必须登记适配注记', () => {
    // P5-T19（第三轮评审 MINOR-4）：上一轮的反向门只扫**顶层 SKILL.md**，正则也只认
    // 少数带括号的 `team_xxx(` ——于是 `debugging`（team 路径在
    // `references/methodology/02-investigate.md`）与 `ultrawork`（`task_send` /
    // `team_run_id` 拼写）都被漏掉了。本轮：**递归扫 SKILL.md + references/**`,
    // 检测面扩到 team 工具调用、`task_send(`、`team_run_id`、盘上 team config 路径。
    const skillsDir = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../patches/omo-dsh/vendor/shared-skills/skills',
    )
    // 检测面：team 工具调用 / `task_send(` / `team_run_id` / 盘上 team config 路径。
    // （JS 没有 `x` 标志 ⇒ 用数组 join 拼，保持可读。）
    const TEAM_MARKER = new RegExp([
      '\\bteam_(?:create|delete|list|send_message|task_create|task_list|task_update|task_get|status|shutdown_request|approve_shutdown|reject_shutdown)\\s*\\(',
      '\\btask_send\\s*\\(',
      '\\bteam_run_id\\b',
      '~\\/\\.omo\\/teams\\/',
    ].join('|'))
    /** 递归收集一枚技能目录下所有 .md（SKILL.md + references/**）。 */
    const collectMarkdown = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) collectMarkdown(full, out)
        else if (entry.name.endsWith('.md')) out.push(full)
      }
      return out
    }
    const offenders: string[] = []
    const hits: string[] = []
    for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!skill.isDirectory()) continue
      const files = collectMarkdown(join(skillsDir, skill.name))
      if (!files.some((file) => TEAM_MARKER.test(readFileSync(file, 'utf8')))) continue
      hits.push(skill.name)
      if (teamAdaptationNoteFor(skill.name) === undefined) offenders.push(skill.name)
    }
    expect(offenders).toEqual([])
    // **非真空**：扫描确实命中了四枚带 team 内容的技能（不是"什么都没匹配到"）。
    expect(hits.sort()).toEqual(['debugging', 'hyperplan', 'refactor', 'ultrawork'])
    // 注记表是**超集**约束（不是 exact-set）：将来正确新增第五枚注记不该误红，
    // 但上面四枚必须都在。
    for (const skill of hits) {
      expect(Object.keys(VENDOR_SKILL_TEAM_ADAPTATION_NOTES), skill).toContain(skill)
    }
  })

  it('P5-T19 (MAJOR-4) 替换规格**真的能过** parseTeamSpec（上游原样 spec 过不了）', () => {
    // 评审的实测：vendored spec 先以 `V1_UNSUPPORTED_FIELD` 拒 `description`、
    // 再拒 member 的 `kind`。替换规格必须是**可直接抄**的合规形状。
    const spec = {
      name: 'hyperplan',
      members: [
        { name: 'skeptic', category: 'quick', prompt: 'p' },
        { name: 'validator', category: 'quick', prompt: 'p' },
        { name: 'researcher', category: 'deep', prompt: 'p' },
        { name: 'architect', category: 'deep', prompt: 'p' },
        { name: 'creative', category: 'quick', prompt: 'p' },
      ],
    }
    const parsed = parseTeamSpec(JSON.stringify(spec))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.spec.members).toHaveLength(5)
    // 上游原样形状**必须**继续被拒（证明这条腿不是空转）。
    const upstream = parseTeamSpec(JSON.stringify({
      ...spec,
      description: 'Adversarial planning team for cross-critique debate.',
      members: spec.members.map((member) => ({ kind: 'category', ...member })),
    }))
    expect(upstream.ok).toBe(false)
    if (upstream.ok) return
    expect(upstream.code).toBe('V1_UNSUPPORTED_FIELD')
    // 只删 description（保留 kind）⇒ 仍被拒（评审的第二段实测）。
    const halfFixed = parseTeamSpec(JSON.stringify({
      ...spec,
      members: spec.members.map((member) => ({ kind: 'category', ...member })),
    }))
    expect(halfFixed.ok).toBe(false)
    if (halfFixed.ok) return
    expect(halfFixed.code).toBe('V1_UNSUPPORTED_FIELD')
  })

  it('P5-T19 (MAJOR-3) 跨包 team 形状声明逐字相同（R-5 双拼写先例）', () => {
    // omo-commands 与 omo-hooks 各持一份（跨包禁 import），等值靠这道钉。
    expect(ULTRAWORK_TEAM_CARRIER_NOTE).toBe(TEAM_SURFACE_SHAPES_NOTE)
    // 替换规格必须点名两个被拒字段（否则模型不知道该删什么）。
    expect(HYPERPLAN_TEAM_SPEC_REPLACEMENT).toContain('category: "quick"')
    expect(HYPERPLAN_TEAM_SPEC_REPLACEMENT).not.toContain('description')
    expect(HYPERPLAN_TEAM_SPEC_REPLACEMENT).not.toContain('kind:')
  })
})
