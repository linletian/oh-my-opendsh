// P4-T6 — the structural types both command handlers speak.
//
// WHY DECLARED HERE, NOT IMPORTED (P4-2 discipline, omo-commands/index.ts header):
// this workspace has no dsh dependency, and a patch plugin must not import dsh
// into its own tree. So every dsh surface this package touches is declared
// structurally, and each declaration carries the measured citation it was written
// from. A dsh change that breaks these shapes shows up as a typecheck failure here
// only if someone adds the dependency; until then the unit tests are the guard —
// which is why every field below is exercised by a test rather than merely typed.
//
// MEASURED SOURCES (dsh 0.1.5-rc.1):
//   CommandInvocation  dsh-commands/lib/types/index.d.ts:14-36
//     commandId / agent / rawInput / attachments / signal —— 五个字段，任务书 Q-2
//     实测暴露面。**没有**时间戳、没有 sessionId 字段：所以 `$SESSION_ID` 必须从
//     `agent.id` 派生，`$TIMESTAMP` 必须由调用方自己取。
//   CommandResult      dsh-commands/lib/types/types.d.ts:33-41
//     {kind:'success', text?} | {kind:'error', text}
//   CommandDefinition  dsh-commands/lib/types/index.d.ts:37-52（安装态逐行复核：
//     L37 是 `export interface CommandDefinition {`，L52 闭合）
//     name / description / input? / recordInput? / handler
//   Agent.followup     dsh-agent/lib/types/runtime-types.d.ts:186-192
//   UserMessage        dsh-llm（createUserMessage，lib/index.js:48-53）

/** `Agent` 的最小面：本包只用 `id` 与 `followup`。 */
export interface CommandAgentLike {
  /** 会话 id —— `$SESSION_ID` 的唯一来源（invocation 没有 sessionId 字段）。 */
  readonly id: string
  /**
   * 排入一条普通后续回合并唤醒 driver（dsh-agent runtime-types.d.ts:186-192）。
   * 该消息将成为**下一个**回合的唯一普通消息：本命令自身的回合 settle 之后才生效。
   */
  followup(message: CommandUserMessageLike): void
}

/** 一次命令调用的最小面。 */
export interface CommandInvocationLike {
  readonly rawInput: string
  readonly agent: CommandAgentLike
}

/**
 * 送进 agent 队列的用户消息 —— dsh `UserMessage` 的结构化子集。
 * 见 ./user-message.ts：逐字段对照实测的 `createUserMessage` 形态。
 */
export interface CommandUserMessageLike {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly [{ readonly type: 'text'; readonly text: string }]
  readonly source: { readonly kind: 'user' }
}

/** handler 的返回值 —— dsh `CommandResult` 的结构化子集，逐字对应该联合。 */
export type CommandResultLike =
  | { readonly kind: 'success'; readonly text?: string }
  | { readonly kind: 'error'; readonly text: string }
