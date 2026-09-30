// P4-T8 — `/stop-continuation` 的模板常量（语义移植 of upstream's template）。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/templates/stop-continuation.ts:1-15
//     export const STOP_CONTINUATION_TEMPLATE = `…`（15 行）
//   packages/omo-opencode/src/features/builtin-commands/templates/stop-continuation.test.ts
//     （4 its 描述该模板的行为，作为本仓单测的锚点种子）
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:77-82 —
//     the command ENTRY: description + `<command-instruction>` wrapper，**无**
//     `argumentHint`，模板里**没有** `$ARGUMENTS`（本仓 manifest 的
//     `argumentHint: null` 与之逐字一致）。
//
// 移植方式：**语义移植**，但本文件是 P4-T6 两条模板里**唯一正文被改写**的一条，原因
// 见下 §2：上游这段文案承诺了四件本部署**做不到或语义不同**的事，而 T6 双评审已经
// 定下「不得在正文里承诺不存在的工具/能力」。逐条差异都在下面登记，并在
// {@link STOP_CONTINUATION_CARRIER_NOTE} 与 THIRD_PARTY_NOTICES 的语义移植表里重复
// 一遍，让模型在读正文前先读到差异。
//
// §1 逐字保留的部分：命令的第一句、"After running this command" 三条、
// "The stop state is per-session and clears when the session ends"（DSH 侧由
// `session/disposed` 兜底清除，语义成立）、以及收尾的 "Use this when…"。
//
// §2 四条承诺的 DSH 落点（Q-5 盘点，逐条给落点或诚实记差异）：
//   ① "Stop the todo-continuation-enforcer" → **成立**：H-03 在 steer 前查
//      `omoStopContinuation.isStopped(agent.session.id)`（skip reason
//      `stopped-by-command`）。
//   ② "Cancel any active Ralph Loop" → **无程序化落点**：DSH 没有 ralph 的可编程
//      取消面（本仓也未移植 ralph）。措辞改为**用户层面**的指引，不承诺程序化取消。
//   ③ "Clear the active Goal" → **改为 pause**：`ctx.goals.pause(agent, ref)`
//      的实测语义是 "Pause an active goal and disarm automatic continuation"
//      （dsh-goal/lib/types/index.d.ts:96-98）—— 正是"停止续行"，而 upstream 的
//      `clearGoal` 会让目标消失。改写为 pause 并在注记里说明「目标仍在，恢复即可」。
//   ④ "Clear the boulder state for the current project" → **无对应面**：boulder
//      state 属 `ulw-execute`（H-32），该行在本仓 manifest 仍是 `pending`，未移植；
//      故本条删除，并在注记里说明它随 `ulw-execute` 一起接盘。
//
// §3 一条**新增**的诚实交代：本命令只做「停止续行」，不结束会话、不取消用户在
// 别的窗口发起的工作；上游文案没有这句，但 DSH 的 handler 返回值会这么说，为了让
// 正文与返回结果不打架，这里补一句。这属于"新增而非改写"，已如实标注。
//
// §4 **本模板不下发给模型**（与本节另外两个模板的刻意差异，B 评审 NIT-9）：
// `/stop-continuation` 的作用就是命令本身 —— 它停掉续行并把真实结果告诉用户。把它
// 的正文再作为一条用户消息 followup 回去，只会让模型对着"我已经停好了"再回一轮，
// 而 handoff / remove-ai-slops 那种"把结论喂进上下文"的价值在这里并不存在。
// 因此 handler 刻意**不**注入指令消息；`renderStopContinuationInstruction()` 仍然
// 存在（可读、可测、供将来某天改回注入），但当前是零注入形态 —— 这条形态选择在此
// 如实登记，THIRD_PARTY_NOTICES 该节前言与行内 Disposition 同样写明，避免"看着像
// 死代码"的误读。

/**
 * `/stop-continuation` 的指令正文（语义移植；与上游的差异见文件头 §2）。
 *
 * 15 行里 5 行被改写（②③④ 三条承诺 + "This command will:" 的编号结构），
 * 其余逐字。
 */
export const STOP_CONTINUATION_TEMPLATE = `Stop all continuation mechanisms for the current session.

This command will:
1. Stop the todo-continuation-enforcer from automatically continuing incomplete tasks
2. Pause an active goal for this session, so its goal rounds stop driving the loop (the goal itself is kept, not deleted)
3. Cancel this session's running and stopping background jobs
4. Report that any Ralph-style loop must be ended from your side, since this harness exposes no programmatic stop for one

After running this command:
- The session will not auto-continue when idle
- You can manually continue work when ready
- The stop state is per-session and clears when the session ends
- Nothing else is touched: the session stays open, and work started elsewhere keeps running

Use this when you need to pause automated continuation and take manual control.`

/**
 * 载体注记（carrier note）—— stop-continuation 侧的差异登记，**前置**在正文之前。
 *
 * 体例同 `omo-hooks/src/hooks/keyword-detector/messages.ts` 的载体注记与 P4-T6 的
 * `HANDOFF_CARRIER_NOTE`：正文保持可比对的形态，差异写在正文之外并明确标注。
 */
export const STOP_CONTINUATION_CARRIER_NOTE = `[oh-my-opendsh] Stop-continuation carrier note (semantic port of omo v4.19.4 builtin-commands/templates/stop-continuation.ts):

1. TODO CONTINUATION: real. This harness's todo-continuation enforcer checks the omoStopContinuation service before it steers, so a stopped session is not continued.

2. GOAL: paused, not cleared. Upstream calls clearGoal(sessionID). Here the handler calls ctx.goals.pause(agent, ref), whose contract is "pause an active goal and disarm automatic continuation". That is the stop-continuation effect; the goal and its budget survive, and a later resume picks it up.

3. BACKGROUND JOBS: real. This session's running and stopping jobs are cancelled through ctx.jobs.kill, scoped by owner session so another session's jobs are never touched. DSH has no "pending" job status, so the cancelled set is running + stopping.

4. RALPH LOOP: not programmable here. This harness ships no ralph loop, so there is nothing for the command to cancel. If you started a loop-like process yourself, end it from your side; do not claim it was cancelled by this command.

5. BOULDER STATE: absent. That state belongs to the ulw-execute command surface, which this deployment has not ported yet. Nothing to clear.

6. WHEN THE GUARD IS UNAVAILABLE: the command reports that the stop guard is unavailable and changes nothing. That happens only when the omo-hooks plugin is not mounted in this composition.`

/**
 * `/stop-continuation` 送进模型的完整消息模板 —— 逐字取自 upstream
 * `commands.ts:77-82` 的 `template` 字段（只有 `<command-instruction>` 包裹，
 * **没有** `<user-request>` 段、**没有** `$ARGUMENTS`），只把正文常量换成
 * {@link STOP_CONTINUATION_CARRIER_NOTE} + {@link STOP_CONTINUATION_TEMPLATE}。
 *
 * 因此这条模板不含任何占位符：渲染结果与调用参数无关（单测钉死这一点），也不会触发
 * `MissingCommandSessionIDError`。
 */
export const STOP_CONTINUATION_COMMAND_TEMPLATE = `<command-instruction>
${STOP_CONTINUATION_CARRIER_NOTE}

---

${STOP_CONTINUATION_TEMPLATE}
</command-instruction>`