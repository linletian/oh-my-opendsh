// P4-T6 — the `/handoff` command handler.
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:100-107 —
//   the command ENTRY (description / template / argumentHint). Upstream ships no
//   per-command handler: the executor formats the template into one user message
//   (hooks/auto-slash-command/executor.ts:92-115) and the agent's turn consumes it.
//   So there is no upstream handler body to port — this file IS the DSH-side
//   equivalent of "format the template and hand it to the agent".
//
// 语义移植, not a code copy: upstream has no dsh equivalent to copy from, and the
// body is upstream's instruction asset living in ../templates/handoff.ts.
//
// HOW THE MESSAGE REACHES THE MODEL (measured, dsh 0.1.5-rc.1):
//   `invocation.agent.followup(message)` — dsh-agent/lib/types/runtime-types.d.ts:186-192
//   "Queue an ordinary follow-up turn and wake the driver. The item becomes the
//   sole ordinary message of its own turn." So the rendered template takes effect
//   in the NEXT turn, after this command's own turn settles — the same queueing
//   semantic as `@deepseek-ai/dsh-command-goal`'s handler (lib/index.js:98-105),
//   which is the pinned precedent named by the task book.
//   `createUserMessage({content, source:{kind:'user'}})` — dsh-llm/lib/index.js:48-53.
//   We do NOT import it (this workspace has no dsh dependency, and importing
//   dsh into a patch plugin is the discipline P4-2 forbids); §"message shape" in
//   ./user-message.ts reproduces the measured shape and says why that is enough.

import { formatCommandTemplate, renderCommandTemplate } from '../templates/render.ts'
import { HANDOFF_COMMAND_TEMPLATE } from '../templates/handoff.ts'
import { describeError } from './errors.ts'
import { createUserMessage } from './user-message.ts'
import type { CommandInvocationLike, CommandResultLike } from './command-types.ts'

/** upstream commands.ts:101 的 description，逐字。 */
export const HANDOFF_DESCRIPTION =
  '(builtin) Create a detailed context summary for continuing work in a new session'

/**
 * `/handoff` 的纯渲染函数：模板 + 三个值 → 送进模型的那条完整消息（含上游外框）。
 *
 * 两层都是纯函数（不碰 agent、不取全局时钟——`now` 可注入）所以单测能钉死全集；
 * handler 只负责接线。`sessionId` 取自 `invocation.agent.id`，实测这是
 * `CommandInvocation` 五个字段（commandId / agent / rawInput / attachments /
 * signal，dsh-commands/lib/types/index.d.ts:14-36）里唯一能回答"这是哪个会话"
 * 的值。
 *
 * NIT-7: 外框的 `# /handoff Command` 与 `**Scope**: builtin` 是**写死的字面量**，
 * 不是参数 —— 上游这两处是 `cmd.name` / `cmd.scope`，而 `name` 在本包已有唯一事实
 * 源（manifest 行的 `id`，registrar 就用它注册），再传一份进来就是第二个事实源。
 * `scope: 'builtin'` 则是本包**全部**命令的共同实测事实（两条移植行都是内置命令，
 * 无 scope 字段的第三方命令面），写成一个字面量并在此注释说明，比引入一个只被两处
 * 传同一个值的参数更诚实。
 */
export function renderHandoffInstruction(
  invocation: CommandInvocationLike,
  now?: () => string,
): string {
  const template = HANDOFF_COMMAND_TEMPLATE
  return formatCommandTemplate({
    name: 'handoff',
    description: HANDOFF_DESCRIPTION,
    scope: 'builtin',
    arguments: invocation.rawInput,
    template,
    content: renderCommandTemplate(template, {
      arguments: invocation.rawInput,
      sessionId: invocation.agent.id,
      ...now === undefined ? {} : { now },
    }),
  })
}

/**
 * 构造 `/handoff` 的 `CommandDefinition` 形态（dsh-commands 的结构化子集，
 * 与 index.ts 的 `CommandsRegistrationDefinition` 同一纪律：不 import DSH）。
 *
 * 失败一律 settle 成 `kind:'error'` 而**不**让异常穿过 handler：命令层抛出的
 * 异常会绕过 `command/done` 的正常配对（dsh-command-goal 也是返回 error 结果，
 * 见其 lib/index.js:113-124 的 try/catch 先例）。
 */
export function createHandoffCommand(
  now?: () => string,
): { handler: (invocation: CommandInvocationLike) => CommandResultLike } {
  return {
    handler: (invocation: CommandInvocationLike): CommandResultLike => {
      try {
        const rendered = renderHandoffInstruction(invocation, now)
        invocation.agent.followup(createUserMessage(rendered))
        return {
          kind: 'success',
          text: `Handoff instruction queued (${rendered.length} chars, session ${invocation.agent.id}); it takes effect in the next turn.`,
        }
      } catch (error) {
        return {
          kind: 'error',
          text: `/handoff could not queue its instruction: ${describeError(error)}`,
        }
      }
    },
  }
}

