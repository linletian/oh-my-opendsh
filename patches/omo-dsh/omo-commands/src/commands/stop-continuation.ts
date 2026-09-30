// P4-T8 — the `/stop-continuation` command handler: the WRITER side of the guard
// service.
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/plugin/stop-continuation.ts:1-33 — `stopContinuation()`,
//   the whole command-side effect list, in upstream's order:
//       guard.stop(sessionID)
//       todoContinuationEnforcer.cancelAllCountdowns()
//       goal.clearGoal(sessionID)
//       clearBoulderState(directory)
//   packages/omo-opencode/src/plugin/command-execute-before.ts:66 — the slash-command
//   dispatch that calls it; packages/omo-opencode/src/plugin/chat-message.ts:104 — the
//   second dispatch path (native chat commands).
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:77-82 — the
//   command entry (description / wrapper template).
//
// 语义移植, no code copy: upstream's four calls are re-expressed against DSH's own
// surfaces, and each of the four is either landed or registered as a difference —
// nothing is dropped silently. Q-5 机制清单，逐条落点：
//
//   ① todo 续行：upstream 的 `todoContinuationEnforcer.cancelAllCountdowns()` 在 DSH
//      **无对应物** —— 本仓 H-03 没有倒计时（T5 已在能力盘点里判定 DSH 无 toast 面），
//      所以「取消倒计时」是空的。真正让续行停下来的机制是 guard 本身：
//      `guard.stop()` 写状态，H-03 在 steer 前读它（`stopped-by-command`）。
//   ② goal 轮驱动：**pause** 当前 active goal（`ctx.goals.pause(agent, ref)`），
//      而不是 upstream 的 `clearGoal`。实测语义见 dsh-goal/lib/types/index.d.ts:96-98
//      —— "Pause an active goal and disarm automatic continuation"，正是"停止续行"；
//      差异（目标保留、不删除）已在模板正文与载体注记里如实交代。
//   ③ ralph：**无可编程 stop API**。DSH 无 ralph，本仓也未移植；命令不承诺取消，
//      模板正文改为用户层面指引。
//   ④ 后台任务级联取消：**由 guard 做**（`ctx.jobs.list(caller)` + 逐个
//      `kill(id, caller, reason)`），因为取消能力属于 guard 的定义域，命令只调
//      `stop()` 一个入口。这也让 H-03 之外任何未来写入方都自动获得级联，而不必各自
//      重写一遍。caller 与会话围栏的实测依据在 guard 模块头 §④（MAJOR-1：不传 caller
//      的 `list` 只回无主 job，而真实生产者一律带 owner，所以真机上会静默空转）。
//
// 服务可见性纪律（Q-5 定案）：
//   * `ctx.get('omoStopContinuation')` 是**延迟取**，在 handler 执行期取，绝不在
//     apply 期缓存 —— 两插件挂载顺序不保证，缓存会拿到 `undefined` 并永久降级。
//   * **不用 `inject`**：把它写成硬依赖会让本插件进入 waiting，直到对方挂载；而
//     对方缺席是合法部署形态（guard 不在时命令如实告知，而不是挂死）。
//   * 服务缺席 = loud-but-non-fatal：返回一段「guard 不可用」的指引文案，不 throw。
//     抛异常会把这个命令变成 `kind:'error'`，而事实上没有任何东西出错 —— 只是这
//     个部署没提供这个能力。

import { formatCommandTemplate, renderCommandTemplate } from '../templates/render.ts'

import { STOP_CONTINUATION_COMMAND_TEMPLATE } from '../templates/stop-continuation.ts'
import { describeError } from './errors.ts'
import type { CommandResultLike } from './command-types.ts'

/**
 * 本命令需要的调用面 —— **比 {@link CommandInvocationLike} 窄**：只读 `agent.id`。
 *
 * 写窄而不是复用宽类型，是因为这条命令**不注入任何消息**（它做的事就是命令本身），
 * 声明一个用不到的 `followup` 会让每个调用方都得造一个假的 followup 才能通过类型
 * 检查，而那正是「这个命令可能会注入」的假信号。宽类型传进来仍然兼容（结构化）。
 */
export interface StopContinuationInvocation {
  readonly rawInput: string
  readonly agent: { readonly id: string }
}

/** upstream commands.ts:78 的 description，逐字。 */
export const STOP_CONTINUATION_DESCRIPTION =
  '(builtin) Stop all continuation mechanisms (ralph loop, todo continuation, boulder) for this session'

/**
 * guard 服务的名字。**本包本地声明**，不从 omo-hooks 源码 import：两个补丁包各自
 * 独立安装（`dsh plugin add` 各自 link），跨包相对路径 import 会在对方缺席时直接
 * 崩掉本包的加载。同一个名字因此有两处书写，但两侧一致不靠"记性好"，而靠
 * tests/omo-commands/stop-continuation.test.ts 里那条**跨包相等断言**（同时 import
 * 两个模块比较常量值）—— 双侧漂移会先在单测变红。
 */
export const STOP_CONTINUATION_SERVICE = 'omoStopContinuation'


/**
 * guard 服务的最小读面。结构化声明：本插件零 dsh 依赖（P4-2），而服务本体住在
 * omo-hooks 插件里（跨插件服务，通过服务名解析），所以这里只声明用到的一个方法，
 * 而不是 import 对方的类型 —— 那会把两个补丁插件耦合成一个包。
 */
export interface StopContinuationGuardLike {
  stop(sessionId: string): unknown
}

/** `ctx.goals` 的最小读面（dsh-goal 实测：`get` / `pause`）。 */
export interface GoalsServiceLike {
  get(agent: unknown): { readonly id: string; readonly revision: number; readonly phase: string } | undefined
  pause(agent: unknown, ref: { readonly id: string; readonly revision: number }): unknown
}

/**
 * 本命令要用到的服务读取面。**延迟取**，不缓存：每次调用都重新 `ctx.get`，所以对方
 * 插件晚挂载也能被看见（never cache a service handle at apply time）。
 */
export interface StopContinuationServices {
  get?(name: string): unknown
}

/** handler 实际做掉的事，逐条如实报告（用户看到的就是这段文字）。 */
export interface StopContinuationEffects {
  readonly guardAvailable: boolean
  readonly sessionId: string
  readonly cancelledJobIds: readonly string[]
  readonly alreadyFinishedJobIds: readonly string[]
  readonly jobsServicePresent: boolean
  /**
   * What happened to the goal — **absent means the goal branch never ran**.
   * It is undefined only on the guard-unavailable path, where the handler returned
   * before touching goals: reporting `'unavailable'` there would claim the service
   * was consulted when it was not (B 评审 NIT-10).
   */
  readonly goal?: 'paused' | 'absent' | 'not-active' | 'unavailable' | 'failed'
}

/**
 * 纯函数：把一次 stop 的真实结果组织成人读的一行。单独抽出来是为了能对**每种组合**
 * 做断言（服务缺席 / 有 goal / 无 goal / pause 失败），而不必真的去跑插件。
 */
export function formatStopContinuationResult(effects: StopContinuationEffects): string {
  if (!effects.guardAvailable) {
    return 'Stop guard unavailable: the omo-hooks plugin that publishes the '
      + `${STOP_CONTINUATION_SERVICE} service is not mounted in this composition, so nothing was stopped. `
      + 'Todo continuation keeps running; mount @oh-my-opendsh/omo-hooks to make /stop-continuation effective.'
  }
  if (effects.goal === undefined) {
    // 可达性上的防御：goal 缺失只应出现在 guard 缺席那条路上（B NIT-10 的修法让那条路
    // 不再声称 goal 结果）。真到这里说明调用方漏填，如实说出来而不是静默按某个分支走。
    return 'Continuation stopped for session ' + effects.sessionId
      + '; the goal outcome was not reported.'
  }
  const parts = [`Continuation stopped for session ${effects.sessionId}`]
  parts.push(
    effects.jobsServicePresent
      ? `cancelled ${effects.cancelledJobIds.length} running/stopping job(s)`
        + (effects.alreadyFinishedJobIds.length > 0 ? `, ${effects.alreadyFinishedJobIds.length} already finished` : '')
      : 'no jobs service mounted, so no background job was cancelled',
  )
  parts.push(
    effects.goal === 'paused' ? 'paused the active goal (kept, resumable)'
      : effects.goal === 'absent' ? 'no goal on this session'
        : effects.goal === 'not-active' ? 'the session goal is not active, nothing to pause'
          : effects.goal === 'unavailable' ? 'no goals service mounted, the goal was left alone'
            : 'could not pause the goal; todo continuation is still stopped',
  )
  parts.push('todo continuation is stopped for this session until it is cleared or the session ends')
  return `${parts.join('; ')}.`
}

/**
 * 暂停当前 active goal（Q-5 机制 ②）。
 *
 * 只 pause **active** 的目标：`get` 返回的是任何 phase 的当前目标，而对 paused /
 * complete / blocked 的目标再 pause 是一次无意义（且可能抛）的写入。CAS 用
 * `get` 读到的 `revision`，正是 `pause(agent, ref)` 契约要求的 "expected current
 * revision"。
 */
function pauseActiveGoal(services: StopContinuationServices, agent: unknown): StopContinuationEffects['goal'] {
  const goals = services.get?.('goals')
  if (typeof goals !== 'object' || goals === null) return 'unavailable'
  const candidate = goals as Partial<GoalsServiceLike>
  if (typeof candidate.get !== 'function' || typeof candidate.pause !== 'function') return 'unavailable'
  try {
    const goal = candidate.get(agent)
    if (goal === undefined || goal === null) return 'absent'
    if (goal.phase !== 'active') return 'not-active'
    candidate.pause(agent, { id: goal.id, revision: goal.revision })
    return 'paused'
  } catch (error) {
    // `goals.get` THROWS for an agent that is not the registry's live instance
    // (dsh-goal/lib/types/index.d.ts:63-67), and `pause` throws on a stale
    // revision. Neither may become a command failure: the guard stop already
    // happened, and undoing it would be worse than reporting the gap.
    void describeError(error)
    return 'failed'
  }
}

/**
 * `/stop-continuation` 的纯渲染函数。与另外两条命令一样走
 * {@link formatCommandTemplate} 外框；本模板**不含任何占位符**，所以
 * `renderCommandTemplate` 在这里是一个恒等变换（仍然调用它，是为了让"渲染 → 外框"
 * 这条链路只有一条实现，将来模板新增占位符时不需要改这里）。
 */
export function renderStopContinuationInstruction(): string {
  return formatCommandTemplate({
    name: 'stop-continuation',
    description: STOP_CONTINUATION_DESCRIPTION,
    scope: 'builtin',
    arguments: '',
    template: STOP_CONTINUATION_COMMAND_TEMPLATE,
    content: renderCommandTemplate(STOP_CONTINUATION_COMMAND_TEMPLATE, {
      arguments: '',
      sessionId: undefined,
    }),
  })
}

/**
 * 构造 `/stop-continuation` 的 `CommandDefinition` 形态。**不声明 `input`**：上游
 * 该条目无 argumentHint（commands.ts:77-82）。
 *
 * 本命令**不** followup 注入指令正文：它做的事就是命令本身，模板正文由用户在需要
 * 时自行查看；把"我已经停好了"再当一条用户消息喂回模型，只会制造一次多余的回合。
 * 这是与 handoff / remove-ai-slops 的一处有意的差异，理由随代码记录。
 */
export function createStopContinuationCommand(services: StopContinuationServices): {
  handler: (invocation: StopContinuationInvocation) => CommandResultLike
} {
  return {
    handler: (invocation: StopContinuationInvocation): CommandResultLike => {
      try {
        const sessionId = invocation.agent.id
        // 延迟取服务：每次调用现取，绝不在 apply 期缓存（Q-5）。
        const guard = services.get?.(STOP_CONTINUATION_SERVICE)
        if (typeof guard !== 'object' || guard === null || typeof (guard as Partial<StopContinuationGuardLike>).stop !== 'function') {
          return {
            kind: 'success',
            text: formatStopContinuationResult({
              guardAvailable: false,
              sessionId,
              cancelledJobIds: [],
              alreadyFinishedJobIds: [],
              jobsServicePresent: false,
            }),
          }
        }
        const outcome = (guard as StopContinuationGuardLike).stop(sessionId) as {
          readonly cancelledJobIds?: readonly string[]
          readonly alreadyFinishedJobIds?: readonly string[]
          readonly jobsServicePresent?: boolean
        }
        const effects: StopContinuationEffects = {
          guardAvailable: true,
          sessionId,
          cancelledJobIds: outcome?.cancelledJobIds ?? [],
          alreadyFinishedJobIds: outcome?.alreadyFinishedJobIds ?? [],
          jobsServicePresent: outcome?.jobsServicePresent ?? false,
          goal: pauseActiveGoal(services, invocation.agent),
        }
        return { kind: 'success', text: formatStopContinuationResult(effects) }
      } catch (error) {
        // 兜底：任何未预期的抛出仍然 settle 成 error 结果，而不是穿过 handler。
        return {
          kind: 'error',
          text: `/stop-continuation could not stop continuation: ${describeError(error)}`,
        }
      }
    },
  }
}