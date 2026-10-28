// P4-T6 — the `/remove-ai-slops` command handler. 形态与 ./handoff.ts 同构，本文件
// 是语义移植的落点，来源见下方 UPSTREAM SOURCE 块。
// P5-T13 — handler 升级为**在场切换**：team 工具在场 → 拼上 team-mode addendum
// 的完整模板；缺席 → P4 主段模板原样（降级路径不许因升级死掉——T13 判定）。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:83-92 —
//   description / template / （**无** argumentHint）。（T13 评审 NIT 修复轮：
//   原引 85-92 行首偏 2，实测 entry = 83-92 @b072d279。）
//   packages/omo-opencode/src/features/builtin-commands/templates/remove-ai-slops.ts
//   :116-216 — REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM（T13 起对位移植，见
//   templates/remove-ai-slops.ts 的 T13 块注）。
//
// 一处与 handoff 不同的实测事实，代码里必须显式承认：上游这个条目**没有**
// `argumentHint` 字段，所以 `createRemoveAiSlopsCommand()` **不声明** `input`
// ——声明一个上游没有的 hint 就是凭空发明 UI 契约。该条命令没有
// `<session-context>` 段，于是 `$SESSION_ID` / `$TIMESTAMP` 不出现，
// 渲染不依赖 `agent.id`，`MissingCommandSessionIDError` 在此不可达（单测钉死）。
//
// ═══ T13 的切换判据（与 ./hyperplan.ts 同构，另一张脸）═══
//
// 在场判据 = 每次调用现读 `ctx.get('omoTeamSlopAddendumTeamFace')`（omo-team
// 的在场探测脸 team/team-tool-presence.ts 发的第二张脸；与 hyperplan 消费的
// 同一枚快照、不同的服务名——一行一处置）。跨包零 import，服务名两侧各自本地
// 声明、单测交叉钉死（R-5 先例）。缺席 / 形状不合 / 非 true ⇒ 降级（P4 行为
// 逐字）。**绝不 apply 期缓存把手**（T9 消费半同款理由）。

import { formatCommandTemplate, renderCommandTemplate } from '../templates/render.ts'
import {
  REMOVE_AI_SLOPS_COMMAND_TEMPLATE,
  REMOVE_AI_SLOPS_COMMAND_TEMPLATE_FULL,
} from '../templates/remove-ai-slops.ts'
import { describeError } from './errors.ts'
import { createUserMessage } from './user-message.ts'
import type { CommandInvocationLike, CommandResultLike } from './command-types.ts'

/**
 * 在场探测脸的服务名（消费侧拼写；provider 侧在
 * omo-team/src/team/team-tool-presence.ts 的 `OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE`，
 * 两侧零 import，交叉等值由 tests/omo-commands/remove-ai-slops-team-upgrade.test.ts
 * 钉死——R-5 双拼写先例逐字同族）。
 */
export const OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE = 'omoTeamSlopAddendumTeamFace'

/** 本命令消费的在场脸最小面（与 hyperplan 消费面同款形状，独立声明）。 */
export interface SlopAddendumTeamPresenceLike {
  readonly teamToolsPresent?: boolean
  readonly teamToolNames?: readonly string[]
  readonly teamTaskStatuses?: readonly string[]
}

/**
 * 每次调用现读一次在场判据（`readTeamModePresent` 的同族镜像）。
 *
 * P5-T16（评审 NIT-15）：两侧的**校验臂现在同形**——都校验
 * `teamToolsPresent`（读的字段）与 `teamToolNames`（共同臂）。旧形态是
 * 「校验的字段与消费的字段不对位」：本命令校验 `teamTaskStatuses` 却读
 * `teamToolsPresent`，hyperplan 校验 `teamToolNames` 却读 `teamToolsPresent`
 * ——两张脸字段集相同，今天无 bug，但降级判据的**形状**两侧不对称（改一侧
 * 不会让另一侧变红）。
 *
 * 任务态五值这一臂（`teamTaskStatuses`）**仍在**校验里：N1 注记不许在没有词表
 * 背书时进模型面——它是 addendum 正文的引用来源，缺臂 = 脸不完整 = 降级。
 */
export function readSlopTeamModePresent(
  get: ((name: string) => unknown) | undefined,
): boolean {
  if (typeof get !== 'function') return false
  const face = get(OMO_TEAM_SLOP_ADDENDUM_TEAM_FACE)
  if (typeof face !== 'object' || face === null) return false
  const candidate = face as SlopAddendumTeamPresenceLike
  if (!Array.isArray(candidate.teamToolNames)) return false
  if (!Array.isArray(candidate.teamTaskStatuses)) return false
  return candidate.teamToolsPresent === true
}

/** upstream commands.ts:84 的 description，逐字。（T13 评审 NIT 修复轮：原引 :86，实测 :84。） */
export const REMOVE_AI_SLOPS_DESCRIPTION =
  '(builtin) Remove AI-generated code smells from branch changes and critically review the results'

/**
 * 纯渲染：`$ARGUMENTS` ← `invocation.rawInput`。没有会话 id、没有时刻 ——
 * 模板里没有这两个占位符（见文件头）。
 *
 * `teamModePresent`（T13）：形态是**入参**不是内读（渲染器保持纯）；默认
 * false = P4 降级正文——不显式给在场信号的老调用点渲染不变（降级路径在
 * 签名层面死不掉）。
 */
export function renderRemoveAiSlopsInstruction(
  invocation: CommandInvocationLike,
  teamModePresent = false,
): string {
  const template = teamModePresent ? REMOVE_AI_SLOPS_COMMAND_TEMPLATE_FULL : REMOVE_AI_SLOPS_COMMAND_TEMPLATE
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
 * 上游该条目无 argumentHint（commands.ts:83-92 逐字复核）。
 *
 * `presence`（T13）：唯一的跨包读面（结构化声明，零 dsh import）。handler
 * 每次调用现读在场判据；缺席 ⇒ 主段模板（P4 行为逐字，含回报文本）。
 */
export function createRemoveAiSlopsCommand(presence?: {
  readonly get?: (name: string) => unknown
}): {
  handler: (invocation: CommandInvocationLike) => CommandResultLike
} {
  return {
    handler: (invocation: CommandInvocationLike): CommandResultLike => {
      try {
        const teamModePresent = readSlopTeamModePresent(
          presence === undefined ? undefined : (name: string) => presence.get?.(name),
        )
        const rendered = renderRemoveAiSlopsInstruction(invocation, teamModePresent)
        invocation.agent.followup(createUserMessage(rendered))
        return {
          kind: 'success',
          // 当次形态写进回报文本（不许把附了 addendum 的完整投递说成主段，
          // 也不许把主段说成完整——T14 纪律的镜像）。
          text: teamModePresent
            ? `Remove-AI-slops instruction queued (${rendered.length} chars, team-mode addendum attached); it takes effect in the next turn.`
            : `Remove-AI-slops instruction queued (${rendered.length} chars); it takes effect in the next turn.`,
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
