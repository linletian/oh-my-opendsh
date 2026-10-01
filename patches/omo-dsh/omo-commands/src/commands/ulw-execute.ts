// P4-T10 — `/ulw-execute` 命令 handler：把命令模板作为一条用户消息排进**本会话**。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:61-76 — the command
//     ENTRY: `agent: resolveStartWorkAgent(options)` (:62), the three-layer template
//     (:63-74; its session-context segment is :67-70), `argumentHint` (:75)。
//   packages/omo-opencode/src/features/builtin-commands/start-work-agent.ts（实测）——
//     `resolveStartWorkAgent` 的两分支实现：`atlas` 已注册 → `atlas`，
//     否则 → `sisyphus`。
//
// ═══ 与另外三条移植命令的形态差异：它是**第一条注入型**的指挥者命令 ═══
//
// `handoff` / `remove-ai-slops` 注入的是「把结论喂进上下文」；`stop-continuation`
// 刻意**零注入**。`/ulw-execute` 属于第三种：模板正文本身就是**这次工作的指令**，
// 不排进模型上下文它就什么都不会发生，所以 handler **必须** followup。
// 注入面与 T6 先例同形（`createUserMessage` + `agent.followup`），本命令不做例外。
//
// ⚠️ **本 handler 注入的是「指挥者会话」，而 H-32 的注入面是「atlas 子会话」**
// —— 两者不是同一处，这一句必须说清，否则整条链会被读成「命令直接激活 hook」。
// 真实链路：`/ulw-execute` 在指挥者会话排一条指令（此处）→ 指挥者读模板并**委派
// atlas** → marker 作为**委派任务文本**进入 atlas 子会话 → H-32 在那里激活。
// atlas 子会话有 descriptor、首条 user 消息即委派任务；指挥者会话没有 descriptor，
// H-32 在 `!identity.found` 处早退，属设计如此。
//
// agent 绑定（计划书 §4.2 / manifest `agentBinding: 'atlas'`）：**DSH 无 per-command
// agent 字段**（`CommandDefinition` 只有 name / description / input? /
// recordInput? / handler，dsh-commands/lib/types/index.d.ts:37-52），所以
// `agent: resolveStartWorkAgent(options)` 没有落点。绑定改为**两处显式承载**：
//   ① 模板身份 —— 正文首行就是「You are starting an Atlas work session.」
//      （R-10 标头 marker，同时也是 H-32 激活门的逐字判据）；
//   ② 名册委派链 —— Phase 2 已就位，atlas 是名册常驻席位，实际执行由指挥者按
//      名册委派到 atlas；**这条委派也是 R-10 marker 抵达 H-32 注入面的唯一通道**
//      （见上方链路说明）。
//
// ⚠️ **上游 `resolveStartWorkAgent` 的 `sisyphus` 回退分支在 DSH 不触发**，如实
// 登记而非假装移植：DSH 的名册里 atlas 是 Phase 2 就位的常驻席位，不存在
// 「atlas 未注册」这个部署形态。上游那个分支是为 opencode 的动态注册表写的，
// 其前提（agent 可以缺席）在本部署不成立。写在这里是因为：若将来名册允许
// atlas 缺席，这个回退需要被**重新实现**而不是自动生效 —— 静默继承上游代码
// 会给出「已回退」的假象。

import { formatCommandTemplate, renderCommandTemplate } from '../templates/render.ts'
import { createUserMessage } from './user-message.ts'
import { describeError } from './errors.ts'

import {
  ULW_EXECUTE_ARGUMENT_HINT,
  ULW_EXECUTE_COMMAND_TEMPLATE,
} from '../templates/ulw-execute.ts'
import type { CommandInvocationLike, CommandResultLike } from './command-types.ts'

/**
 * 上游 `commands.ts:62` 的 description，逐字。
 *
 * 定义在本命令模块而不在模板文件：与 `HANDOFF_DESCRIPTION` /
 * `REMOVE_AI_SLOPS_DESCRIPTION` / `STOP_CONTINUATION_DESCRIPTION` 同一归属 ——
 * description 是**命令条目**的字段（upstream 三处都写在 commands.ts 的条目里，
 * 与 template 并列），不是模板正文的一部分。
 */
export const ULW_EXECUTE_DESCRIPTION =
  '(builtin) Start Atlas work session from Prometheus plan'

/**
 * 注入型命令的调用面：需要 `rawInput`（`$ARGUMENTS`）与 `agent.id`
 * （`$SESSION_ID`）+ `agent.followup`（把消息排进本会话）。
 */
export type UlwExecuteInvocation = CommandInvocationLike

/**
 * `/ulw-execute` 的纯渲染函数。
 *
 * 与 `renderHandoffInstruction` 同一形：读 `invocation.rawInput` 与
 * `invocation.agent.id`（`CommandInvocation` 五个字段里唯一能回答"这是哪个会话"
 * 的值，见 ./command-types.ts 的实测引用），渲染后由调用方决定去哪儿。
 *
 * ⚠️ 渲染是**纯函数**（时刻由 `now` 注入），所以本命令的产物能被单测逐字节钉
 * 死 —— 而它必须被钉死：模板里任何一处改写都可能动到 R-10 的两个 marker，那会
 * 让 H-32 的激活门**静默失配**（不报错，只是不激活）。R-10 的跨包相等断言在
 * tests/omo-commands/ulw-execute.test.ts。
 */
export function renderUlwExecuteInstruction(
  invocation: UlwExecuteInvocation,
  now?: () => string,
): string {
  return formatCommandTemplate({
    name: 'ulw-execute',
    description: ULW_EXECUTE_DESCRIPTION,
    scope: 'builtin',
    arguments: invocation.rawInput,
    template: ULW_EXECUTE_COMMAND_TEMPLATE,
    content: renderCommandTemplate(ULW_EXECUTE_COMMAND_TEMPLATE, {
      arguments: invocation.rawInput,
      sessionId: invocation.agent.id,
      ...now === undefined ? {} : { now },
    }),
  })
}

/**
 * 构造 `/ulw-execute` 的 `CommandDefinition` 形态（dsh-commands 的结构化子集，
 * 与 index.ts 的 `CommandsRegistrationDefinition` 同一纪律：不 import DSH）。
 *
 * 失败一律 settle 成 `kind:'error'` 而不让异常穿过 handler（与 handoff /
 * remove-ai-slops 同先例）。本命令最可能的失败是
 * `MissingCommandSessionIDError` —— 即 `invocation.agent.id` 为空，此时**不应该**
 * 排一条渲染出空会话 id 的指令回去。
 */
export function createUlwExecuteCommand(
  now?: () => string,
): { handler: (invocation: UlwExecuteInvocation) => CommandResultLike } {
  return {
    handler: (invocation: UlwExecuteInvocation): CommandResultLike => {
      try {
        const rendered = renderUlwExecuteInstruction(invocation, now)
        invocation.agent.followup(createUserMessage(rendered))
        return {
          kind: 'success',
          text: `Ulw-execute instruction queued (${rendered.length} chars, session ${invocation.agent.id}); `
            + 'it takes effect in the next turn. The plan flags are '
            + `${ULW_EXECUTE_ARGUMENT_HINT}.`,
        }
      } catch (error) {
        return {
          kind: 'error',
          text: `/ulw-execute could not queue its instruction: ${describeError(error)}`,
        }
      }
    },
  }
}
