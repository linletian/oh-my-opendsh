// P4-T14 — `/hyperplan` 命令 handler（**降级形态**语义移植）。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:109-115 — the
//     command ENTRY: description (:110) + template (:111-113) + argumentHint (:114)。
//   packages/omo-opencode/src/features/builtin-commands/templates/hyperplan.ts — the
//     body (17 lines upstream).
//
// 形态：**注入型**，与 T6 的 handoff / remove-ai-slops 和 T10 的 ulw-execute 同形
// （`createUserMessage` + `agent.followup`）。必须注入的理由：本命令的全部作用就
// 是「把 7 阶段工作流指令排进模型上下文」，不排它什么都不会发生。
//
// ═══ 与 `/ulw-execute` 的两点形态差异（都源于上游，不是本移植的选择）═══
//
//   ① **无 session id**：上游 hyperplan 的模板里**没有** `$SESSION_ID`，也没有
//      `<session-context>` 外框（其 `$ARGUMENTS` 就在模板本体的 `<user-request>`
//      里，模板只有一层 `<command-instruction>` 外壳）。所以本命令读不到、也
//      **不需要**会话 id —— `renderCommandTemplate` 不会为它抛
//      `MissingCommandSessionIDError`。这与 `/ulw-execute` 相反，故在单测里显式
//      断言「空 session id 仍然成功」，以免将来有人把 T10 的必需性套过来。
//   ② **无 agent 绑定**：manifest 行 `agentBinding: null` —— 上游 hyperplan 条目
//      没有 `agent:` 字段（对比 start-work 有 `agent: resolveStartWorkAgent`），
//      所以本命令不假造绑定，agentBinding 保持 null。
//
// 与 R-10 **无关**：本模板不产 marker，H-32 的激活检测对 `/hyperplan` 无意义。
// 它不是激活面，只是一条 followup 指令。

import { formatCommandTemplate, renderCommandTemplate } from '../templates/render.ts'
import { createUserMessage } from './user-message.ts'
import { describeError } from './errors.ts'

import { HYPERPLAN_COMMAND_TEMPLATE } from '../templates/hyperplan.ts'
import type { CommandInvocationLike, CommandResultLike } from './command-types.ts'

/** 上游 `commands.ts:110` 的 description，**逐字**，作署名锚点保留。 */
export const UPSTREAM_HYPERPLAN_DESCRIPTION =
  '(builtin) Adversarial multi-agent planning via team-mode (5 hostile category members cross-critique, lead synthesizes)'

/**
 * 注册用 description = 上游原文 + 降级后缀。
 *
 * MAJOR-1：逐字保留原文**不等于**对外许诺它。上游那句承诺 team-mode 与 5 个
 * category 成员，而本部署两样都没有；若把原文直接注册，用户在命令列表里读到的
 * 就是一个不存在的形态。所以对外注册的串带降级后缀，而
 * {@link UPSTREAM_HYPERPLAN_DESCRIPTION} 单独留着 —— 它是「上游原话是什么」这条
 * 信息的唯一载体，删掉它等于丢失署名事实（体例同 MAJOR-2 保留 "7-phase" 原文）。
 *
 * ⚠️ 这个串**同时**落在 `formatCommandTemplate` 的 Description 行，也就是
 * **模型可见的外框**里。所以后缀不只是给人看的：模型读到的是「上游原话 + 此处
 * 降级」二者并存，正好是它需要的判断依据（上游怎么做 / 这里实际怎么做）。
 * 这一点由 tests/omo-commands/hyperplan.test.ts 断言「渲染产物含后缀」，而不只是
 * 断言常量本身 —— 否则注册串与模型可见文本可以各说各话。
 */
export const HYPERPLAN_DESCRIPTION =
  `${UPSTREAM_HYPERPLAN_DESCRIPTION} (DEGRADED here: no team-mode surface; adversarial roles run as roster delegations)`

/**
 * 注入型命令的调用面：本命令**只读** `rawInput`（`$ARGUMENTS`）与
 * `agent.followup`（把消息排进本会话）。`agent.id` 被**刻意不读** —— 模板不含
 * `$SESSION_ID`，读了就是一次多余的依赖，会让读代码的人以为本命令也需要会话
 * 身份（见文件头 ①）。
 */
export type HyperplanInvocation = CommandInvocationLike

/**
 * `/hyperplan` 的纯渲染函数（与 `renderUlwExecuteInstruction` 同形）。
 *
 * 纯函数（时刻由 `now` 注入，但**本模板不含 `$TIMESTAMP`**，所以 `now` 只影响
 * 外框之外的东西 —— 参数保留是为了与另外三条命令的渲染函数同签名，将来模板若
 * 加上时间戳不必改调用点）。
 */
export function renderHyperplanInstruction(
  invocation: HyperplanInvocation,
  now?: () => string,
): string {
  return formatCommandTemplate({
    name: 'hyperplan',
    description: HYPERPLAN_DESCRIPTION,
    scope: 'builtin',
    arguments: invocation.rawInput,
    template: HYPERPLAN_COMMAND_TEMPLATE,
    content: renderCommandTemplate(HYPERPLAN_COMMAND_TEMPLATE, {
      arguments: invocation.rawInput,
      sessionId: undefined,
      ...now === undefined ? {} : { now },
    }),
  })
}

/**
 * 构造 `/hyperplan` 的 `CommandDefinition` 形态。
 *
 * 失败一律 settle 成 `kind:'error'`（T6 先例）。本命令最可能的失败其实很少 ——
 * 模板不含会话 id，所以「渲染必成」；catch 在这里是**结构**而不是
 * 「这里真的会抛」，即 handler 的契约对所有注入型命令一致，将来渲染器加了新的
 * 抛点时不必重新审计调用方。
 */
export function createHyperplanCommand(
  now?: () => string,
): { handler: (invocation: HyperplanInvocation) => CommandResultLike } {
  return {
    handler: (invocation: HyperplanInvocation): CommandResultLike => {
      try {
        const rendered = renderHyperplanInstruction(invocation, now)
        invocation.agent.followup(createUserMessage(rendered))
        return {
          kind: 'success',
          // 明说降级：本命令的输出**不是**上游那个完整对抗环，回报文本若只说
          // "queued" 会让用户以为跑的是完整形态。模板里也要求模型自己声明降级。
          text: `Hyperplan instruction queued (${rendered.length} chars) in DEGRADED mode `
            + '(no team-mode surface: the adversarial ring runs as roster delegations instead). '
            + 'It takes effect in the next turn.',
        }
      } catch (error) {
        return {
          kind: 'error',
          text: `/hyperplan could not queue its instruction: ${describeError(error)}`,
        }
      }
    },
  }
}