// P4-T14 — `/hyperplan` 命令 handler（**降级形态**语义移植）。
// P5-T13 — handler 升级为**双形态切换**：team 工具在场 → 完整对抗评审环；
// 缺席 → P4 降级形态原样（降级路径不许因升级死掉——T13 判定）。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:109-115 — the
//     command ENTRY（条目 = :109 `hyperplan: {` … :115 `},`；其 description (:110)
//     + template (:111-113) + argumentHint (:114) 的逐字引用不受影响）。
//     两基线实测一致（2026-10-12 双评审+仲裁亲核）：tag v4.19.4（b072d279）与
//     工作树该区间逐字节同（sha1 同值），无漂移——T13 评审 NIT 修复轮曾改符号名
//     引用，实测证伪后行号引用恢复（与 templates/hyperplan.ts 文件头同批登记）。
//   packages/omo-opencode/src/features/builtin-commands/templates/hyperplan.ts — the
//     body (17 lines upstream)。T13 起完整形态对位承载（见 templates/hyperplan.ts
//     的 T13 块注）。
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
//
// ═══ T13 的切换判据（本文件的升级核心）═══
//
// 「team 工具在场」不在这里硬编码——它是一枚**运行时读**：handler 每次调用
// `ctx.get('omoTeamHyperplanTeamFace')`（omo-team 的在场探测脸，provider 在
// omo-team/src/team/team-tool-presence.ts，跨包零 import，服务名两侧各自本地
// 声明、单测交叉钉死——`omoStopContinuation`/`omoTeamMemberQuery` 的 R-5 先例）。
// 服务缺席 / 形状不合 / teamToolsPresent 非 true ⇒ 一律降级（三态都是「不在场」，
// 消费侧不做乐观假设）。**绝不 apply 期缓存把手**——提供纤可能后挂载，缓存的
// 把手要么永远看不见、要么假装永不挂载的档也有（omo-hooks 消费侧同款理由）。

import { formatCommandTemplate, renderCommandTemplate } from '../templates/render.ts'
import { createUserMessage } from './user-message.ts'
import { describeError } from './errors.ts'

import {
  HYPERPLAN_COMMAND_TEMPLATE,
  HYPERPLAN_COMMAND_TEMPLATE_FULL,
} from '../templates/hyperplan.ts'
import type { CommandInvocationLike, CommandResultLike } from './command-types.ts'

/**
 * 在场探测脸的服务名（消费侧拼写；provider 侧在
 * omo-team/src/team/team-tool-presence.ts 的 `OMO_TEAM_HYPERPLAN_TEAM_FACE`，
 * 两侧零 import，交叉等值由 tests/omo-commands/hyperplan-team-upgrade.test.ts
 * 钉死——R-5 双拼写先例逐字同族）。
 */
export const OMO_TEAM_HYPERPLAN_TEAM_FACE = 'omoTeamHyperplanTeamFace'

/** 本命令消费的在场脸最小面（只读两个字段，形状校验只点到消费为止）。 */
export interface HyperplanTeamPresenceLike {
  readonly teamToolsPresent?: boolean
  readonly teamToolNames?: readonly string[]
}

/**
 * 每次调用现读一次在场判据（T9 `readTeamQueryService` 的同族镜像）。
 * 三态归一：无 `get` / 服务缺席 / 形状不合 / `teamToolsPresent` 非 true ⇒
 * false（降级）。只有显式 true 才点亮完整环——消费侧对「在场」做**保守**读。
 */
export function readTeamModePresent(
  get: ((name: string) => unknown) | undefined,
): boolean {
  if (typeof get !== 'function') return false
  const face = get(OMO_TEAM_HYPERPLAN_TEAM_FACE)
  if (typeof face !== 'object' || face === null) return false
  const candidate = face as HyperplanTeamPresenceLike
  if (!Array.isArray(candidate.teamToolNames)) return false
  return candidate.teamToolsPresent === true
}

/** 上游 `commands.ts:110` 的 description，**逐字**，作署名锚点保留。 */
export const UPSTREAM_HYPERPLAN_DESCRIPTION =
  '(builtin) Adversarial multi-agent planning via team-mode (5 hostile category members cross-critique, lead synthesizes)'

/**
 * 注册用 description = 上游原文 + **形态中立**后缀（T13）。
 *
 * MAJOR-1（P4）说：逐字保留原文不等于对外许诺它——P4 的部署两样都没有，所以
 * 后缀写明降级。T13 后两形态并存、按调用时刻切换，所以注册串（命令列表，
 * boot 时写死一次）不能再单向许诺任何一边：后缀把**切换事实**说全（在场跑
 * 完整环、缺席跑降级环、运行时判定）。模型可见的 Description 行则在渲染时刻
 * 换成**当次形态**的后缀（HYPERPLAN_FRAME_DESCRIPTION_FULL /
 * HYPERPLAN_DESCRIPTION），两个面各自诚实。
 */
export const HYPERPLAN_DESCRIPTION_REGISTERED =
  `${UPSTREAM_HYPERPLAN_DESCRIPTION} (ring form decided per invocation: the full team-mode ring while the team_* tools are live, the DEGRADED roster-delegation form when they are not)`

/**
 * 降级形态的对外 description（P4-T14 原串，逐字保留——降级路径的署名面）。
 *
 * P4 MAJOR-1 的理由原样成立（缺席时模型读到的必须是「上游原话 + 此处降级」）；
 * T13 只是把它从「注册串」降格为「降级时刻的 frame 串」，注册串交给
 * {@link HYPERPLAN_DESCRIPTION_REGISTERED}。
 */
export const HYPERPLAN_DESCRIPTION =
  `${UPSTREAM_HYPERPLAN_DESCRIPTION} (DEGRADED here: no team-mode surface; adversarial roles run as roster delegations)`

/**
 * 完整形态的 frame description 后缀（在场时刻进模型可见 Description 行）。
 * team-mode 此刻是 live 事实，括号里说的就是当次真实形态。
 */
export const HYPERPLAN_FRAME_DESCRIPTION_FULL =
  `${UPSTREAM_HYPERPLAN_DESCRIPTION} (FULL ring active: adversarial roles run as live team members, lead synthesizes)`

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
 *
 * `teamModePresent`（T13）：形态选择是**入参**不是**内读**——渲染器保持纯
 * （render.ts 的 PURE BY CONSTRUCTION 契约），在场判据由 handler 在调用时刻读
 * 一次再传进来。默认 false = 降级形态：任何不显式给在场信号的老调用点
 * （含全部 P4 单测）渲染的仍是降级正文——降级路径在函数签名层面也死不掉。
 */
export function renderHyperplanInstruction(
  invocation: HyperplanInvocation,
  now?: () => string,
  teamModePresent = false,
): string {
  const template = teamModePresent ? HYPERPLAN_COMMAND_TEMPLATE_FULL : HYPERPLAN_COMMAND_TEMPLATE
  return formatCommandTemplate({
    name: 'hyperplan',
    description: teamModePresent ? HYPERPLAN_FRAME_DESCRIPTION_FULL : HYPERPLAN_DESCRIPTION,
    scope: 'builtin',
    arguments: invocation.rawInput,
    template,
    content: renderCommandTemplate(template, {
      arguments: invocation.rawInput,
      sessionId: undefined,
      ...now === undefined ? {} : { now },
    }),
  })
}

/**
 * 构造 `/hyperplan` 的 `CommandDefinition` 形态。
 *
 * `presence`（T13）：唯一的跨包读面，形状 = cordis ctx 的 `get` 一臂（结构化
 * 声明，零 dsh import——command-types.ts 的同款纪律）。handler 每次调用现读；
 * 缺席 ⇒ 降级形态渲染（P4 行为逐字不变，含回报文本）。
 *
 * 失败一律 settle 成 `kind:'error'`（T6 先例）。本命令最可能的失败其实很少 ——
 * 模板不含会话 id，所以「渲染必成」；catch 在这里是**结构**而不是
 * 「这里真的会抛」，即 handler 的契约对所有注入型命令一致，将来渲染器加了新的
 * 抛点时不必重新审计调用方。
 */
export function createHyperplanCommand(
  presence?: { readonly get?: (name: string) => unknown },
  now?: () => string,
): { handler: (invocation: HyperplanInvocation) => CommandResultLike } {
  return {
    handler: (invocation: HyperplanInvocation): CommandResultLike => {
      try {
        // 每次调用现读——不缓存（T9 消费半的同款惰性纪律）。
        const teamModePresent = readTeamModePresent(
          presence === undefined ? undefined : (name: string) => presence.get?.(name),
        )
        const rendered = renderHyperplanInstruction(invocation, now, teamModePresent)
        invocation.agent.followup(createUserMessage(rendered))
        return {
          kind: 'success',
          // 明说当次形态：完整环说完整环，降级说降级（T6/T14 的「回报文本
          // 不许把降级说成完整」纪律反向同样成立——不许把完整说成降级）。
          text: teamModePresent
            ? `Hyperplan instruction queued (${rendered.length} chars) in FULL team-mode ring form `
              + '(the adversarial ring runs as live team members; lead synthesizes). '
              + 'It takes effect in the next turn.'
            : `Hyperplan instruction queued (${rendered.length} chars) in DEGRADED mode `
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
