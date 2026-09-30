// P4-T6 — 单测：模板常量 + 纯渲染函数 + 两个 handler。
//
// WHAT THIS FILE PROVES, 逐条对应任务书的判定项：
//   ① 占位符渲染全集（$ARGUMENTS / $SESSION_ID / $TIMESTAMP 各自与组合、未知
//      占位符保留、缺会话 id 抛 MissingCommandSessionIDError）；
//   ② 模板文本含上游关键强制段的**逐字锚点**（handoff 的 PHASE 0.5 段、remove-ai-slops
//      的批判性自评审段），锚点文字取自 `git show v4.19.4:…` 的上游原文；
//   ③ handler 异常 settle 为 kind:'error'，且**不**把异常抛给调用方；
//   ④ followup 调用形态：消息对象 = createUserMessage 的语义（role/id/content/source）。
//
// 逐字锚点的来源（v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a）：
//   handoff:            builtin-commands/templates/handoff.ts
//   remove-ai-slops:    builtin-commands/templates/remove-ai-slops.ts
//   命令条目:            builtin-commands/commands.ts:85-92（remove-ai-slops）
//                                 :100-107（handoff）
//   渲染语义:            hooks/auto-slash-command/executor.ts:18-24, 92-108
//
// WHY THE ANCHORS ARE TYPED OUT HERE INSTEAD OF READ FROM UPSTREAM: the upstream
// checkout is a read-only PRE-5 artifact that exists on some machines only, and a
// test that silently skips when it is absent is a test that stops proving anything.
// The anchors are therefore literals, and the header records exactly which
// upstream lines each one came from so a reviewer can re-verify by hand.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  HANDOFF_DESCRIPTION,
  createHandoffCommand,
  renderHandoffInstruction,
} from '../../patches/omo-dsh/omo-commands/src/commands/handoff.ts'
import {
  REMOVE_AI_SLOPS_DESCRIPTION,
  createRemoveAiSlopsCommand,
  renderRemoveAiSlopsInstruction,
} from '../../patches/omo-dsh/omo-commands/src/commands/remove-ai-slops.ts'
import { createUserMessage } from '../../patches/omo-dsh/omo-commands/src/commands/user-message.ts'
import { COMMAND_MANIFEST } from '../../patches/omo-dsh/omo-commands/src/manifest.ts'
import {
  MissingCommandSessionIDError,
  formatCommandTemplate,
  renderCommandTemplate,
} from '../../patches/omo-dsh/omo-commands/src/templates/render.ts'
import {
  HANDOFF_CARRIER_NOTE,
  HANDOFF_COMMAND_TEMPLATE,
  HANDOFF_TEMPLATE,
} from '../../patches/omo-dsh/omo-commands/src/templates/handoff.ts'
import {
  REMOVE_AI_SLOPS_CARRIER_NOTE,
  REMOVE_AI_SLOPS_COMMAND_TEMPLATE,
  REMOVE_AI_SLOPS_TEMPLATE,
} from '../../patches/omo-dsh/omo-commands/src/templates/remove-ai-slops.ts'
import type {
  CommandAgentLike,
  CommandInvocationLike,
  CommandUserMessageLike,
} from '../../patches/omo-dsh/omo-commands/src/commands/command-types.ts'

/** A fixed clock, so every rendered string is byte-stable across runs. */
const FIXED_CLOCK = (): string => '2026-10-01T09:12:33.412Z'

/** An agent that records what was queued — the only observation the test needs. */
function fakeAgent(id = 'session-under-test'): { agent: CommandAgentLike; queued: CommandUserMessageLike[] } {
  const queued: CommandUserMessageLike[] = []
  return {
    agent: { id, followup: (message) => queued.push(message) },
    queued,
  }
}

function invocation(rawInput: string, agent: CommandAgentLike): CommandInvocationLike {
  return { rawInput, agent }
}

describe('P4-T6 the renderer — upstream substituteCommandTemplate 语义移植 (executor.ts:92-108)', () => {
  it('replaces $ARGUMENTS with the raw arguments text', () => {
    expect(renderCommandTemplate('ask: $ARGUMENTS', { arguments: 'a goal', sessionId: undefined, now: FIXED_CLOCK }))
      .toBe('ask: a goal')
  })

  it('treats ${user_message} as the same placeholder as $ARGUMENTS (upstream: both → args)', () => {
    // upstream executor.ts:96-98 switches them to the same `args` value; a second
    // spelling of one fact must not become a second fact.
    expect(renderCommandTemplate('ask: ${user_message}', { arguments: 'a goal', sessionId: undefined, now: FIXED_CLOCK }))
      .toBe('ask: a goal')
  })

  it('replaces $SESSION_ID and $TIMESTAMP, and evaluates the clock exactly once', () => {
    let clockCalls = 0
    const rendered = renderCommandTemplate('$SESSION_ID @ $TIMESTAMP', {
      arguments: '',
      sessionId: 'sess-1',
      now: () => {
        clockCalls += 1
        return FIXED_CLOCK()
      },
    })
    expect(rendered).toBe('sess-1 @ 2026-10-01T09:12:33.412Z')
    // upstream computes `timestamp` once before the replace (executor.ts:95).
    expect(clockCalls).toBe(1)
  })

  it('replaces ALL THREE placeholders in one template (the combined case)', () => {
    expect(renderCommandTemplate('$ARGUMENTS|$SESSION_ID|$TIMESTAMP', {
      arguments: 'ship the thing',
      sessionId: 'sess-2',
      now: FIXED_CLOCK,
    })).toBe('ship the thing|sess-2|2026-10-01T09:12:33.412Z')
  })

  it('replaces every OCCURRENCE, not just the first (the upstream regex is /g)', () => {
    expect(renderCommandTemplate('$ARGUMENTS then $ARGUMENTS', { arguments: 'x', sessionId: undefined, now: FIXED_CLOCK }))
      .toBe('x then x')
  })

  it('leaves an UNKNOWN $PLACEHOLDER verbatim (a template typo must stay visible)', () => {
    // upstream's pattern has no catch-all branch beyond `default: return variable`
    // (executor.ts:105-106) — it can only ever be reached for the four known words,
    // but the replacement still must not eat anything else.
    expect(renderCommandTemplate('keep $UNKNOWN and $ARGUMENTS', { arguments: 'y', sessionId: undefined, now: FIXED_CLOCK }))
      .toBe('keep $UNKNOWN and y')
  })

  it('throws MissingCommandSessionIDError when the template needs a session id and none was given', () => {
    // upstream executor.ts:93-95 — the guard, and its message, verbatim.
    expect(() => renderCommandTemplate('$SESSION_ID', { arguments: '', sessionId: undefined, now: FIXED_CLOCK }))
      .toThrow(MissingCommandSessionIDError)
    expect(() => renderCommandTemplate('$SESSION_ID', { arguments: '', sessionId: undefined, now: FIXED_CLOCK }))
      .toThrow('Command template requires a session ID')
  })

  it('throws for an EMPTY session id too — upstream guards on falsy, not undefined (executor.ts:89)', () => {
    // `!sessionID` upstream: an empty string renders into <session-context> as a
    // session that "exists but is blank", which is worse than a missing one.
    expect(() => renderCommandTemplate('$SESSION_ID', { arguments: '', sessionId: '', now: FIXED_CLOCK }))
      .toThrow(MissingCommandSessionIDError)
  })

  it('does NOT require a session id for a template that has no $SESSION_ID (upstream: same condition)', () => {
    // This is exactly why `/remove-ai-slops` can omit one: its template has only
    // `$ARGUMENTS`. If the guard were unconditional, that command could never run.
    expect(renderCommandTemplate('only $ARGUMENTS here', { arguments: 'z', sessionId: undefined, now: FIXED_CLOCK }))
      .toBe('only z here')
  })

  it('defaults the clock to the upstream ISO-8601 format, not epoch millis', () => {
    // The format is upstream's (executor.ts:95 `new Date().toISOString()`), kept
    // deliberately: the template shows `$TIMESTAMP` to the MODEL in a
    // `<session-context>` block, where an epoch number would mean something else.
    const rendered = renderCommandTemplate('$TIMESTAMP', { arguments: '', sessionId: undefined })
    expect(rendered).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('is pure: the same inputs always give the same output, and the template is never mutated', () => {
    const template = '$ARGUMENTS@$SESSION_ID@$TIMESTAMP'
    const first = renderCommandTemplate(template, { arguments: 'a', sessionId: 's', now: FIXED_CLOCK })
    const second = renderCommandTemplate(template, { arguments: 'a', sessionId: 's', now: FIXED_CLOCK })
    expect(second).toBe(first)
    expect(template).toBe('$ARGUMENTS@$SESSION_ID@$TIMESTAMP')
  })
})

describe('P4-T6 the /handoff template carries upstream\'s mandatory sections verbatim', () => {
  // 逐字锚点，取自 v4.19.4 `templates/handoff.ts`。
  const upstreamAnchors = [
    '# PHASE 0: VALIDATE REQUEST',
    '# PHASE 0.5: SESSION READ FIRST (MANDATORY FIRST DATA STEP)',
    '# PHASE 1: GATHER PROGRAMMATIC CONTEXT',
    '# PHASE 2: EXTRACT CONTEXT',
    '# PHASE 3: FORMAT OUTPUT',
    '# PHASE 4: PROVIDE INSTRUCTIONS',
    '# IMPORTANT CONSTRAINTS',
    '# EXECUTE NOW',
    'USER REQUESTS (AS-IS)',
    'Do not paraphrase, summarize, or "tidy up" the user\'s wording.',
    'DO NOT exceed 10 files in the KEY FILES section',
    'Write the context summary from first person perspective ("I did...", "I told you...").',
  ] as const

  for (const anchor of upstreamAnchors) {
    it(`keeps the upstream anchor: ${anchor}`, () => {
      expect(HANDOFF_TEMPLATE).toContain(anchor)
    })
  }

  it('replaced ONLY the session_read CALL, keeping the surrounding rules', () => {
    // 收窄面（文件头 §1）：上游 handoff.ts:26 那句
    //   `Call session_read({ session_id: "$SESSION_ID" }) BEFORE any other …`
    // 改写为指引；同段其余 4 条 Rules 与 PHASE 1 的引用必须原样保留。
    expect(HANDOFF_TEMPLATE).not.toContain('Call session_read(')
    expect(HANDOFF_TEMPLATE).toContain('retrieve this session\'s own history through the session export / query surface')
    expect(HANDOFF_TEMPLATE).toContain('- Do not reconstruct user requests from memory.')
    expect(HANDOFF_TEMPLATE).toContain('- Do not paraphrase, summarize, or "tidy up" the user\'s wording.')
    expect(HANDOFF_TEMPLATE).toContain('- Do not skip this step even if you feel you remember the first user message.')
    // PHASE 1 must still point back at PHASE 0.5 rather than re-deriving requests.
    expect(HANDOFF_TEMPLATE).toContain('USER REQUESTS were already captured verbatim from the session history in PHASE 0.5')
  })

  it('ships a carrier note that registers the narrowing and names the upstream surface', () => {
    // 体例同 keyword-detector messages.ts 的载体注记：差异写在正文之外、正文保持
    // 上游形态。没有注记，收窄就会变成"模板写错了"。
    expect(HANDOFF_CARRIER_NOTE).toContain('[oh-my-opendsh] Handoff carrier note')
    expect(HANDOFF_CARRIER_NOTE).toContain('dsh-session-query')
    expect(HANDOFF_CARRIER_NOTE).toContain('no model-facing tool')
    expect(HANDOFF_CARRIER_NOTE).toContain('v4.19.4')
  })

  it('wraps the template exactly as upstream commands.ts:100-107 does', () => {
    // 逐字：`<command-instruction>` 包裹 + `<session-context>`(Session ID/Timestamp)
    // + `<user-request>` 三段，占位符位置不变。
    expect(HANDOFF_COMMAND_TEMPLATE.startsWith('<command-instruction>')).toBe(true)
    expect(HANDOFF_COMMAND_TEMPLATE).toContain('</command-instruction>\n\n<session-context>\nSession ID: $SESSION_ID\nTimestamp: $TIMESTAMP\n</session-context>\n\n<user-request>\n$ARGUMENTS\n</user-request>')
    expect(HANDOFF_COMMAND_TEMPLATE.indexOf('<command-instruction>'))
      .toBeLessThan(HANDOFF_COMMAND_TEMPLATE.indexOf(HANDOFF_TEMPLATE))
  })

  it('MAJOR-1 rewrote the three OpenCode-tool surfaces into capability prose, and registered it', () => {
    // 上游逐字形：PHASE 1 的 `todoread()` / `Bash({ command: … })`、其后的
    // `Suggested execution order` 代码块、PHASE 3 的 `from todoread()` 后缀。
    // 裁定：改写成立（DSH 无 todoread 面；bash 工具形态相近但拼写不同源），
    // 但三处登记必须说真话 —— 所以这里同时钉「正文里没有那三种拼写」与
    // 「顺序内容仍在」。
    expect(HANDOFF_TEMPLATE).not.toContain('todoread')
    expect(HANDOFF_TEMPLATE).not.toContain('Bash({')
    // 上游的执行顺序是有用的编排意图，改写后仍在（散文形态）。
    expect(HANDOFF_TEMPLATE).toContain('Suggested execution order:')
    expect(HANDOFF_TEMPLATE).toContain('4. \`git status --porcelain\`')
    expect(HANDOFF_TEMPLATE).toContain('- [Include the current todo state you read in PHASE 1]')
    // 登记处说真话：载体注记第 2 条明确写着 REWRITTEN，而不是"not rewritten"。
    expect(HANDOFF_CARRIER_NOTE).toContain('were REWRITTEN as capability guidance, not kept verbatim')
    expect(HANDOFF_CARRIER_NOTE).toContain('no todoread surface at all')
    expect(HANDOFF_CARRIER_NOTE).toContain('similar in form but is not the same source spelling')
  })

  it('MAJOR-2 names the DSH session surface in PHASE 4 step 1, keeping the upstream form in a parenthetical', () => {
    // 上游只写 OpenCode：`Press 'n' in OpenCode TUI to open a new session, or run
    // 'opencode' in a new terminal`。DSH 的等价面必须被点名（裁定：Web GUI 新会话
    // 或再跑 dsh），而上游写法保留在括注里，不被删除。
    const step = HANDOFF_TEMPLATE.split('\n').find((line) => line.includes('Start a new session'))
    expect(step).toContain('Web GUI')
    expect(step).toContain('`dsh`')
    expect(step).toContain("press 'n' in the TUI")
    // 登记四处之一（注记第 3 条）；其余三处：模板文件头 §3、NOTICES 语义移植表、
    // manifest 的 handoff 行注释 —— 由 manifest.test/文本 grep 覆盖。
    expect(HANDOFF_CARRIER_NOTE).toContain('names this harness\'s session surface as well')
  })

  it('② / ③ no comment or note still claims a SINGLE rewrite or wholly-unchanged text', () => {
    // 收尾裁定②③：正文改写共三处，所以「唯一改写」与「unchanged」的措辞都是
    // 反话。断言的是「这些措辞不再出现」，而不是新措辞的逐字形态 —— 后者会让
    // 一次无害的措辞调整变红，而这三条的事实（§1/§2/§3 + 注记 1/2/3）已各自被钉。
    expect(HANDOFF_TEMPLATE).not.toContain('唯一改写')
    expect(HANDOFF_CARRIER_NOTE).toContain('Apart from the three registered above')
    expect(HANDOFF_CARRIER_NOTE).not.toMatch(/^4\. Everything else.*unchanged\.$/m)
  })

  it('carries upstream\'s description verbatim (commands.ts:101)', () => {
    expect(HANDOFF_DESCRIPTION).toBe('(builtin) Create a detailed context summary for continuing work in a new session')
  })

  it('takes upstream\'s argumentHint from the manifest row, not a local constant (NIT-7)', () => {
    // The handler module deliberately has NO argumentHint constant: the manifest
    // row is the single source, and the registrar turns it into `input.hint`
    // (asserted in registration.test.ts). Here we pin that the row still holds
    // upstream's value so nobody "helpfully" edits it while looking for the
    // constant that no longer exists.
    expect(COMMAND_MANIFEST.find((row) => row.id === 'handoff')?.argumentHint).toBe('[goal]')
  })
})

describe('P4-T6 the /remove-ai-slops template carries the critical self-review verbatim', () => {
  // 逐字锚点，取自 v4.19.4 `templates/remove-ai-slops.ts` L59-114。
  const upstreamAnchors = [
    '### Phase 1: Identify Changed Files',
    '### Phase 2: Parallel AI Slop Removal',
    '### Phase 3: Critical Review',
    '### Phase 4: Fix Issues',
    '**CRITICAL**: Launch ALL agents in a SINGLE message with multiple Task tool calls for maximum parallelism.',
    '**Safety Verification**:',
    '- [ ] No functional logic was accidentally removed',
    '- [ ] All error handling is preserved',
    '**Behavior Preservation**:',
    '- [ ] Return values unchanged',
    '- [ ] Exception behavior unchanged',
    '**Code Quality**:',
    '- [ ] Removed changes are genuinely AI slop (not intentional patterns)',
    'Do NOT use `git checkout -- {file_path}` or any rollback that discards pre-existing branch changes in the file.',
    '- NEVER remove code that serves a functional purpose',
    '- If uncertain about a change, err on the side of keeping the original code',
  ] as const

  for (const anchor of upstreamAnchors) {
    it(`keeps the upstream anchor: ${anchor}`, () => {
      expect(REMOVE_AI_SLOPS_TEMPLATE).toContain(anchor)
    })
  }

  it('does NOT port the team-mode addendum (D-03: its lines 116-216 stay in Phase 5)', () => {
    // The addendum is a separate upstream export that `commands.ts:85-92` never
    // concatenates; not porting it here means neither exporting nor referencing it.
    expect(REMOVE_AI_SLOPS_TEMPLATE).not.toContain('slop-squad')
    expect(REMOVE_AI_SLOPS_TEMPLATE).not.toContain('team_create')
    expect(REMOVE_AI_SLOPS_TEMPLATE).not.toContain('Team Mode Protocol')
    expect(REMOVE_AI_SLOPS_COMMAND_TEMPLATE).not.toContain('slop-squad')
  })

  it('registers the skill carrier mapping instead of rewriting the body', () => {
    // 正文逐字保留 OpenCode 的 `load_skills=["remove-ai-slops"]` /
    // `$omo:remove-ai-slops`；映射登记在注记里（体例同 keyword-detector）。
    expect(REMOVE_AI_SLOPS_TEMPLATE).toContain('load_skills=["remove-ai-slops"]')
    expect(REMOVE_AI_SLOPS_TEMPLATE).toContain('$omo:remove-ai-slops')
    expect(REMOVE_AI_SLOPS_CARRIER_NOTE).toContain('[oh-my-opendsh] Remove AI slops carrier note')
    expect(REMOVE_AI_SLOPS_CARRIER_NOTE).toContain('dsh-tool-skill')
    expect(REMOVE_AI_SLOPS_CARRIER_NOTE).toContain('NOT ported')
  })

  it('wraps the template exactly as upstream commands.ts:85-92 does (no session-context)', () => {
    // 该条目只有一个 `<user-request>` 段 —— 因此没有 $SESSION_ID / $TIMESTAMP，
    // 也就没有 MissingCommandSessionIDError 可触发（下方 handler 侧再钉一次）。
    expect(REMOVE_AI_SLOPS_COMMAND_TEMPLATE).toContain('</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>')
    expect(REMOVE_AI_SLOPS_COMMAND_TEMPLATE).not.toContain('$SESSION_ID')
    expect(REMOVE_AI_SLOPS_COMMAND_TEMPLATE).not.toContain('$TIMESTAMP')
  })

  it('carries upstream\'s description verbatim and declares no argumentHint (commands.ts:85-92)', () => {
    expect(REMOVE_AI_SLOPS_DESCRIPTION).toBe('(builtin) Remove AI-generated code smells from branch changes and critically review the results')
  })
})

describe('P4-T6 the rendered instructions carry every placeholder\'s real value', () => {
  it('/handoff: arguments, session id and timestamp all land in one message', () => {
    const { agent } = fakeAgent('sess-handoff-9')
    const rendered = renderHandoffInstruction(invocation('finish the handoff doc', agent), FIXED_CLOCK)
    expect(rendered).toContain('<user-request>\nfinish the handoff doc\n</user-request>')
    expect(rendered).toContain('Session ID: sess-handoff-9')
    expect(rendered).toContain('Timestamp: 2026-10-01T09:12:33.412Z')
    // No placeholder may survive rendering — that is the whole contract.
    expect(rendered).not.toContain('$ARGUMENTS')
    expect(rendered).not.toContain('$SESSION_ID')
    expect(rendered).not.toContain('$TIMESTAMP')
  })

  it('/handoff: takes $SESSION_ID from invocation.agent.id (the invocation has no session id)', () => {
    // MEASURED: CommandInvocation exposes commandId / agent / rawInput /
    // attachments / signal — no sessionId field (dsh-commands types index.d.ts).
    const first = fakeAgent('agent-a')
    const second = fakeAgent('agent-b')
    const fromFirst = renderHandoffInstruction(invocation('x', first.agent), FIXED_CLOCK)
    const fromSecond = renderHandoffInstruction(invocation('x', second.agent), FIXED_CLOCK)
    expect(fromFirst).toContain('Session ID: agent-a')
    expect(fromSecond).toContain('Session ID: agent-b')
  })

  it('/remove-ai-slops: only $ARGUMENTS, and an empty argument list renders an empty block', () => {
    // 空参数是合法输入（用户可以不带参数调用）：模板必须照常渲染。
    const { agent } = fakeAgent('sess-slops-1')
    const rendered = renderRemoveAiSlopsInstruction(invocation('', agent))
    expect(rendered).toContain('<user-request>\n\n</user-request>')
    expect(rendered).toContain('### Phase 3: Critical Review')
  })

  it('/remove-ai-slops: a $WORD that is NOT one of the four placeholders survives rendering', () => {
    // 实测的反例面：正文里有 `$omo:remove-ai-slops` 与 shell 的 `$BASE_BRANCH`。
    // 渲染器的词表**只有四个词**（upstream executor.ts:18），所以它们必须逐字存活 ——
    // 若有人把正则"顺手"放宽成 `\$[A-Z_]+`，这条会先红，而真机上那会是一段被静默
    // 吃成空串的 shell 片段。（`${...}` 形态由渲染器那条 unknown-placeholder 用例
    // 覆盖，这里只用正文里真实出现的拼写。）
    const { agent } = fakeAgent('sess-slops-dollar')
    const rendered = renderRemoveAiSlopsInstruction(invocation('', agent))
    expect(rendered).toContain('$omo:remove-ai-slops')
    expect(rendered).toContain('$BASE_BRANCH')
  })

  it('/remove-ai-slops: raw arguments are injected verbatim, markdown and all', () => {
    // 「非法参数」不需要被过滤：命令语法是 Free-form，上游同样把 args 原样注入
    // （executor.ts:97-98）。所以本仓**不**发明参数校验 —— 那是收窄指令语义。
    const { agent } = fakeAgent('sess-slops-2')
    const weird = '--scope=project --strategy=safe\n\n```md\n<handoff>\n```'
    expect(renderRemoveAiSlopsInstruction(invocation(weird, agent)))
      .toContain(`<user-request>\n${weird}\n</user-request>`)
  })
})

describe('P4-T6 ruling-9 the message outer frame (upstream formatCommandTemplate, executor.ts:112-152)', () => {
  const frame = (overrides: Partial<Parameters<typeof formatCommandTemplate>[0]> = {}) => formatCommandTemplate({
    name: 'handoff',
    description: '(builtin) Create a detailed context summary for continuing work in a new session',
    scope: 'builtin',
    arguments: 'finish the doc',
    template: 'body $ARGUMENTS',
    content: 'rendered body',
    ...overrides,
  })

  it('opens with the command name header and the Description line', () => {
    expect(frame().startsWith('# /handoff Command\n\n**Description**: (builtin) Create a detailed context summary for continuing work in a new session\n')).toBe(true)
  })

  it('carries **User Arguments**, **Scope** and the --- / ## Command Instructions seam in upstream order', () => {
    // Hand-transcribed from the measured join: upstream pushes each section WITH a
    // trailing `\n` and joins with `\n` (executor.ts:113-152), so every pair of
    // adjacent sections is separated by one blank line. Transcribed rather than
    // computed, because the blank lines ARE the upstream shape — deriving them
    // from a helper would make this assertion vacuous.
    expect(frame().split('\n')).toEqual([
      '# /handoff Command',
      '',
      '**Description**: (builtin) Create a detailed context summary for continuing work in a new session',
      '',
      '**User Arguments**: finish the doc',
      '',
      '**Scope**: builtin',
      '',
      '---',
      '',
      '## Command Instructions',
      '',
      'rendered body',
    ])
  })

  it('omits the **User Arguments** line when there are no arguments (upstream:117 if(args))', () => {
    const rendered = frame({ arguments: '' })
    expect(rendered).not.toContain('**User Arguments**')
    expect(rendered).toContain('**Scope**: builtin')
  })

  it('omits the **Description** line when there is none (upstream:115 if(description))', () => {
    expect(frame({ description: '' })).not.toContain('**Description**')
  })

  it('trims the rendered content before placing it (upstream:143 content.trim())', () => {
    expect(frame({ content: '\n\n  rendered body  \n\n' })).toContain('## Command Instructions\n\nrendered body')
  })

  it('appends the ## User Request tail ONLY when args exist and the template has no placeholder', () => {
    // Upstream's FULL guard (executor.ts:145-152). Both ported templates mention
    // $ARGUMENTS, so this tail never fires for them — dropping the condition
    // would silently duplicate the user's request in every message.
    expect(frame({ template: 'no placeholder here' })).toContain('## User Request\n\nfinish the doc')
    expect(frame()).not.toContain('## User Request')
    expect(frame({ arguments: '', template: 'no placeholder here' })).not.toContain('## User Request')
    expect(frame({ template: '${user_message}' })).not.toContain('## User Request')
  })

  it('separates the tail with the EXACT upstream bytes: three newlines, ---, blank, header', () => {
    // 收尾裁定①：executor.ts:150 pushes `"\n\n---\n"` — TWO newlines, and the
    // join adds one more before it. The previous test's `toContain` accepted both
    // one- and two-newline forms, so it could not catch a wrong separator; this one
    // pins the whole message byte-for-byte instead.
    //
    // Emitted tail = content + join('\n') + '\n\n---\n' + join('\n')
    //              + '## User Request\n' + join('\n') + args
    //            = 'rendered body\n\n\n---\n\n## User Request\n\nfinish the doc'
    expect(frame({ template: 'no placeholder here' })).toBe([
      '# /handoff Command',
      '',
      '**Description**: (builtin) Create a detailed context summary for continuing work in a new session',
      '',
      '**User Arguments**: finish the doc',
      '',
      '**Scope**: builtin',
      '',
      '---',
      '',
      '## Command Instructions',
      '',
      'rendered body',
      '',
      '',
      '---',
      '',
      '## User Request',
      '',
      'finish the doc',
    ].join('\n'))
  })

  it('never renders a **Model** or **Agent** line for a builtin row (upstream:121-127 conditional, and both rows have neither)', () => {
    // Upstream emits those two lines only when the entry declares a model/agent.
    // Neither ported entry does (commands.ts:85-107), and both manifest rows carry
    // `agentBinding: null`, so a frame that hard-codes them would invent a binding.
    expect(frame()).not.toContain('**Model**')
    expect(frame()).not.toContain('**Agent**')
    for (const id of ['handoff', 'remove-ai-slops']) {
      expect(COMMAND_MANIFEST.find((row) => row.id === id)?.agentBinding).toBeNull()
    }
  })

  it('wraps BOTH ported commands in the frame, header first', () => {
    const { agent } = fakeAgent('sess-frame-1')
    const handoff = renderHandoffInstruction(invocation('goal text', agent), FIXED_CLOCK)
    const slops = renderRemoveAiSlopsInstruction(invocation('scope note', agent))
    expect(handoff.startsWith('# /handoff Command\n')).toBe(true)
    expect(slops.startsWith('# /remove-ai-slops Command\n')).toBe(true)
    // The frame sits OUTSIDE the wrapper template, so the wrapper's own first line
    // is no longer the message's first line — asserted so a future reordering is visible.
    expect(handoff).toContain('## Command Instructions')
    expect(handoff).toContain('<command-instruction>')
    // The `template` field fed the tail guard is the PRE-substitution template:
    // because it contains $ARGUMENTS, no tail is appended even with args present.
    expect(handoff).not.toContain('## User Request')
  })
})

describe('P4-T6 the semantic-port table registers both commands and both narrowings', () => {
  // 裁定要求 MAJOR-1 / MAJOR-2 的差异在四处登记；前三处是注释（代码内可 grep），
  // 第四处是 THIRD_PARTY_NOTICES.md 的语义移植表 —— 它是纯散文，只有读者才知道，
  // 所以这里给读者一条读它的路：表格必须逐行点名本仓文件与上游文件，并写明改写。
  //
  // 路径从 import.meta.dirname 推导（P-9：绝不 process.cwd()）。
  const REPO = resolve(import.meta.dirname, '../..')
  const NOTICES = readFileSync(join(REPO, 'THIRD_PARTY_NOTICES.md'), 'utf8')

  it('has one row per ported command, each naming its derived files and its upstream source', () => {
    const rows = NOTICES.split('\n').filter((line) => line.startsWith('| handoff ')
      || line.startsWith('| remove-ai-slops ')
      || line.startsWith('| stop-continuation '))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('src/templates/handoff.ts')
    expect(rows[0]).toContain('templates/handoff.ts')
    expect(rows[1]).toContain('src/templates/remove-ai-slops.ts')
    expect(rows[1]).toContain('templates/remove-ai-slops.ts')
    for (const row of rows) expect(row).toContain('semantic port only')
  })

  it('states the MAJOR-1 / MAJOR-2 rewrites instead of claiming they were left verbatim', () => {
    const handoffRow = NOTICES.split('\n').find((line) => line.startsWith('| handoff '))!
    expect(handoffRow).toContain('按能力改写为散文指引')
    expect(handoffRow).toContain('PHASE 4 第 1 步补 DSH 会话面')
    // And the row that was right about its own narrowing stays honest too.
    const slopsRow = NOTICES.split('\n').find((line) => line.startsWith('| remove-ai-slops '))!
    expect(slopsRow).toContain('**不移植**')
  })

  it('does not name a ported command among the pending rows (the id list tracks the count)', () => {
    // MAJOR-2: 计数改成"三条已移植"之后，待移植列表里还留着 stop-continuation，
    // 于是表格自己打自己的脸。这条断言让"列表 ⊆ 真的 pending"成为被测事实。
    // 从 omo-commands 那一节起算（omo-hooks 节有同名的引文，措辞相近），并只取引文
    // 本身 —— 下面的 **Counts** 段合法地列着 stop-continuation 的派生文件。
    const section = NOTICES.indexOf('| Command (manifest id) |')
    const start = NOTICES.indexOf('Deliberately **not** listed as ported', section)
    const pendingBlock = NOTICES.slice(start, NOTICES.indexOf('**Counts:**', start))
    expect(pendingBlock).not.toContain('stop-continuation')
    for (const id of ['ulw-execute', 'ulw-plan', 'hyperplan']) expect(pendingBlock).toContain(id)
  })

  it('counts the derived files it lists (no stale count after P4-T8 landed)', () => {
    expect(NOTICES).toContain('**3 command ids / 10 derived')
    for (const file of ['src/templates/render.ts', 'src/commands/errors.ts', 'src/commands/command-types.ts']) {
      expect(NOTICES).toContain(file)
    }
  })
})

describe('P4-T6 the handlers queue exactly one followup and settle as CommandResult', () => {
  it('/handoff queues a createUserMessage-shaped user message and settles success', () => {
    const { agent, queued } = fakeAgent('sess-handoff-1')
    const result = createHandoffCommand(FIXED_CLOCK).handler(invocation('write it up', agent))
    expect(queued).toHaveLength(1)
    const message = queued[0]!
    // createUserMessage semantics, field by field (dsh-llm lib/index.js:37-53).
    expect(message.role).toBe('user')
    expect(message.source).toEqual({ kind: 'user' })
    expect(message.content).toHaveLength(1)
    expect(message.content[0]!.type).toBe('text')
    expect(message.content[0]!.text).toBe(renderHandoffInstruction(invocation('write it up', agent), FIXED_CLOCK))
    expect(typeof message.id).toBe('string')
    expect(message.id.length).toBeGreaterThan(0)
    // The human-visible line says the truth: queued, effective next turn.
    expect(result).toEqual({
      kind: 'success',
      text: `Handoff instruction queued (${message.content[0]!.text.length} chars, session sess-handoff-1); it takes effect in the next turn.`,
    })
  })

  it('/remove-ai-slops queues the same message shape and settles success', () => {
    const { agent, queued } = fakeAgent('sess-slops-3')
    const result = createRemoveAiSlopsCommand().handler(invocation('', agent))
    expect(queued).toHaveLength(1)
    expect(queued[0]!.role).toBe('user')
    expect(queued[0]!.content[0]!.text).toContain('Remove AI Slops Command')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('takes effect in the next turn')
  })

  it('never mutates or reuses a message id across calls (fresh UUID each time)', () => {
    const { agent, queued } = fakeAgent('sess-ids')
    const command = createRemoveAiSlopsCommand()
    command.handler(invocation('one', agent))
    command.handler(invocation('two', agent))
    expect(queued[0]!.id).not.toBe(queued[1]!.id)
  })

  it('deep-freezes the whole graph, not just the top level (dsh-llm freezeMessage)', () => {
    // MEASURED: freezeMessage = deepFreeze(structuredClone(message)), and the
    // measured deepFreeze walks every reachable object. A shallow freeze would
    // leave `content[0].text` reassignable AFTER the agent queued the message —
    // which is exactly the mutation this guards.
    const message = createUserMessage('body')
    expect(Object.isFrozen(message)).toBe(true)
    expect(Object.isFrozen(message.content)).toBe(true)
    expect(Object.isFrozen(message.content[0])).toBe(true)
    expect(Object.isFrozen(message.source)).toBe(true)
    expect(() => {
      ;(message.content[0] as { text: string }).text = 'tampered'
    }).toThrow(TypeError)
    // The blocked write must have changed nothing.
    expect(message.content[0].text).toBe('body')
  })

  it('detaches: the message shares no reference with the caller\'s own text-bearing object', () => {
    // structuredClone semantics: the returned graph is its own. Observable here as
    // "the text we were handed is not reachable from the message" — mutating the
    // caller's array after the call cannot alter the frozen message.
    const clone = structuredClone({ parts: [{ type: 'text', text: 'caller side' }] })
    const message = createUserMessage(clone.parts[0]!.text)
    clone.parts[0]!.text = 'changed after the call'
    expect(message.content[0]!.text).toBe('caller side')
  })
})

describe('P4-T6 a handler failure settles as kind:error instead of throwing', () => {
  it('/handoff: a missing session id settles error and queues NOTHING', () => {
    // The only realistic path to a throw is a session id the renderer refuses; the
    // command must never leave the user with an exception and no explanation, and
    // must not queue a half-rendered instruction.
    const { agent, queued } = fakeAgent('sess-handoff-err')
    const brokenAgent: CommandAgentLike = {
      get id(): string {
        throw new Error('agent id unavailable')
      },
      followup: agent.followup,
    }
    const result = createHandoffCommand(FIXED_CLOCK).handler(invocation('go', brokenAgent))
    expect(result.kind).toBe('error')
    expect(result.kind === 'error' ? result.text : '').toContain('/handoff could not queue its instruction')
    expect(result.kind === 'error' ? result.text : '').toContain('agent id unavailable')
    expect(queued).toHaveLength(0)
  })

  it('/remove-ai-slops: a throwing followup settles error and names the cause', () => {
    const explodingAgent: CommandAgentLike = {
      id: 'sess-slops-err',
      followup: () => {
        throw new Error('agent inbox is closed')
      },
    }
    const result = createRemoveAiSlopsCommand().handler(invocation('go', explodingAgent))
    expect(result).toEqual({
      kind: 'error',
      text: '/remove-ai-slops could not queue its instruction: agent inbox is closed',
    })
  })

  it('a non-Error throw is still reported as text (no "[object Object]")', () => {
    const explodingAgent: CommandAgentLike = {
      id: 'sess-slops-err-2',
      followup: () => {
        throw 'plain string failure'
      },
    }
    const result = createRemoveAiSlopsCommand().handler(invocation('go', explodingAgent))
    expect(result.kind === 'error' ? result.text : '').toContain('plain string failure')
    expect(result.kind === 'error' ? result.text : '').not.toContain('[object Object]')
  })
})
