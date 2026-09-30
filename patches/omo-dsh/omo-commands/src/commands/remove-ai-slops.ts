// P4-T6 — the `/remove-ai-slops` command handler. 形态与 ./handoff.ts 同构，语义
// 移植来源见该文件头。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:85-92 —
//   description / template / （**无** argumentHint）。
//
// 一处与 handoff 不同的实测事实，代码里必须显式承认：上游这个条目**没有**
// `argumentHint` 字段，所以 `createRemoveAiSlopsCommand()` **不声明** `input`
// ——声明一个上游没有的 hint 就是凭空发明 UI 契约。该条命令没有
// `<session-context>` 段，于是 `$SESSION_ID` / `$TIMESTAMP` 不出现，
// 渲染不依赖 `agent.id`，`MissingCommandSessionIDError` 在此不可达（单测钉死）。

import { formatCommandTemplate, renderCommandTemplate } from '../templates/render.ts'
import { REMOVE_AI_SLOPS_COMMAND_TEMPLATE } from '../templates/remove-ai-slops.ts'
import { describeError } from './errors.ts'
import { createUserMessage } from './user-message.ts'
import type { CommandInvocationLike, CommandResultLike } from './command-types.ts'

/** upstream commands.ts:86 的 description，逐字。 */
export const REMOVE_AI_SLOPS_DESCRIPTION =
  '(builtin) Remove AI-generated code smells from branch changes and critically review the results'

/**
 * 纯渲染：`$ARGUMENTS` ← `invocation.rawInput`。没有会话 id、没有时刻 ——
 * 模板里没有这两个占位符（见文件头）。
 */
export function renderRemoveAiSlopsInstruction(invocation: CommandInvocationLike): string {
  const template = REMOVE_AI_SLOPS_COMMAND_TEMPLATE
  return formatCommandTemplate({
    name: 'remove-ai-slops',
    description: REMOVE_AI_SLOPS_DESCRIPTION,
    scope: 'builtin',
    arguments: invocation.rawInput,
    template,
    content: renderCommandTemplate(template, {
      arguments: invocation.rawInput,
      // Explicit `undefined`, not omitted: the renderer asks for a session id only
      // when the template contains `$SESSION_ID`, and this one does not. Passing it
      // anyway keeps both handlers' call shapes identical.
      sessionId: undefined,
    }),
  })
}

/**
 * 构造 `/remove-ai-slops` 的 `CommandDefinition` 形态。**不声明 `input`**：
 * 上游该条目无 argumentHint（commands.ts:85-92 逐字复核）。
 */
export function createRemoveAiSlopsCommand(): {
  handler: (invocation: CommandInvocationLike) => CommandResultLike
} {
  return {
    handler: (invocation: CommandInvocationLike): CommandResultLike => {
      try {
        const rendered = renderRemoveAiSlopsInstruction(invocation)
        invocation.agent.followup(createUserMessage(rendered))
        return {
          kind: 'success',
          text: `Remove-AI-slops instruction queued (${rendered.length} chars); it takes effect in the next turn.`,
        }
      } catch (error) {
        return {
          kind: 'error',
          text: `/remove-ai-slops could not queue its instruction: ${describeError(error)}`,
        }
      }
    },
  }
}
