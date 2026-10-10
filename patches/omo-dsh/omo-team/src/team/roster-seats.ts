// roster-seats.ts — P5-T5 · 名册席三件套声明表（hephaestus / sisyphus-junior 两席；
// 纯声明 + 纯函数，零 ctx / 零副作用 / 运行时零 io——persona 文本内嵌，boot/组建
// 期不读盘）。
//
// ── 声明式复制（禁止 import omo-agents；测试期逐字段对账）───────────────────
// omo-team 不 import 其他 omo 包（index.ts 边界纪律成文；member-validator.ts 的
// 「手抄声明式表 + 测试期对账」同款纪律）：本表的每一格都是
// patches/omo-dsh/omo-agents/src/roster.ts **同一知识的第二声明处**，事实源仍是
// roster.ts——ONE-WAY SYNC：roster 行变更必须同 commit 改三处（roster.ts →
// 本表 → tests/omo-team/roster-seats.test.ts 期望表）。对账面（单测逐项钉）：
//   * agentOptions.provider/model == roster 行 defaultRoute.provider/model
//     （hephaestus: deepseek-official/deepseek-v4-pro，roster.ts:152 STRONG 席
//       行；sisyphus-junior: deepseek/deepseek-flash，roster.ts:264 FAST 席行
//       注「deepseek-flash on the pinned 0.2.x pi-ai catalog」的目录真实性由
//       roster.ts:260-263 行注背书）；
//   * toolFilter.deny == denyToolNamesFor(roster 行)——worker 两席的 deny =
//     DELEGATION_TOOL_NAMES 十名（roster.ts denyToolNamesFor 的
//     case 'worker' 分支（:382-383），roster 序转抄于
//     OMO_TEAM_DELEGATION_TOOL_NAMES，测试逐位相等断言）；
//   * persona == system-sections/<personaFile> 内容 trimEnd 后的**逐字节
//     副本**（roster.ts:145/:256 的 personaFile 指向；guardPersonaText 的
//     trimEnd 语义，persona-prompts.ts:189，随内嵌形态保真）。
//
// ── persona 形态裁定：内嵌文本，不引路径、不运行时读盘 ─────────────────────
// roster.ts 只给 personaFile（路径），concerto 的哨兵渲染（concerto/
// agent.cordis.yml:369-379 hephaestus 行 `persona: __OMO_HEPHAESTUS_PERSONA__`）
// 由 omo-agents 在 apply 期读 system-sections/ 渲染成文本再交 register()
// （persona-prompts.ts:177-180 buildAgentPersona 的 load→trimEnd→guards 三段）。
// omo-team 的 (B) 形态没有那条渲染链：startContinuable 的 request.persona 接受
// **文本**（dsh-subagent types.d.ts SubagentStartRequest.persona：per-child
// persona，deployment:persona-prefix 语义、shadow 部署 persona），所以三件套的
// persona 格必须是文本。运行时跨包读盘不可用的实测理由：omo-team 在沙箱里
// 保持 repo 路径安装（drive.mjs installPlugin 注），跨包相对路径
// ../../omo-agents/system-sections/ 在 link: 符号链接 realpath 下指向不保真，
// 且 lane 章印落不进未 COPY 的包（drive.mjs P4.5-T8b 的 copy 纪律）——T5 起
// omo-team **自带** persona 字节（本文件），需要成员 lane 的场景把 omo-team
// 也 COPY 进沙箱（drive.mjs stageOmoTeamCopy 随本任务落地，installPlugin 的
// 「no persona of its own」前提自此翻写）。内嵌 = 文本可用 + 对账归单测 +
// 运行时零 io（team-state.ts 同款纪律）。
//
// ── 席位解析复用 T4 ──────────────────────────────────────────────────────────
// resolveTeamSeat 先过 member-validator.validateMemberSeat（资格 = worker 两席，
// 覆盖基线 §4 终态矩阵），再查本表——资格表与三件套表漂移（比如未来某席改了
// class 而本表未动）在解析点响亮拒绝，纵深防御同 resolveCategorySeat。

import { validateMemberSeat, type TeamAgentClass } from './member-validator.ts'

/** 一席三件套：startContinuable.request 的 agentOptions/persona/toolFilter 三格。 */
export interface TeamSeatTrio {
  readonly agentOptions: { readonly provider: string; readonly model: string }
  readonly persona: string
  readonly toolFilter: { readonly deny: readonly string[] }
}

/**
 * 十委派工具名，roster 序（roster.ts DELEGATION_TOOL_NAMES 的声明式复制——
 * conductor 除外全部行，roster.ts:300-301 的 Exclude 语义 + :336-338 的派生
 * 链）。worker 席 deny 全十名 = roster.ts denyToolNamesFor case 'worker'
 * （:382-383）的同一列表。
 */
export const OMO_TEAM_DELEGATION_TOOL_NAMES: readonly string[] = [
  'explore',
  'hephaestus',
  'oracle',
  'librarian',
  'plan-consultant',
  'plan-reviewer',
  'atlas',
  'multimodal-looker',
  'sisyphus-junior',
  'prometheus',
]

/**
 * hephaestus 席 persona：system-sections/hephaestus-persona.md（roster.ts:145
 * personaFile）内容 trimEnd 的逐字节内嵌副本（内嵌理由见文件头；字节对账 =
 * tests/omo-team/roster-seats.test.ts）。上游署名头随文本在场（该文件第 1-13
 * 行的 Source: 注释是本 persona 的出处账，随字节保真内嵌，不得删改）。
 */
export const OMO_TEAM_SEAT_PERSONA_HEPHAESTUS = `<!-- Source: oh-my-openagent (SUL-1.0):
     packages/omo-opencode/src/agents/hephaestus/agent.ts (role identity
     "Autonomous deep worker for software engineering", the
     hephaestusPromptMetadata triggers / useWhen / avoidWhen, and the L1
     permission table \`{question:"allow", call_omo_agent:"deny"}\`);
     packages/omo-opencode/src/agents/hephaestus/gpt.ts (generic-layer autonomy
     contract: identity, "Do NOT Ask - Just Do", single-goal scope, execution
     loop, todo discipline, failure recovery, output contract);
     packages/omo-opencode/src/agents/hephaestus/gpt-5-4.ts, gpt-5-5.ts and
     gpt-5-6.ts (the shared goal-not-recipe framing, Manual-QA gate, stop rules
     and hard invariants — their GPT-model-specific tuning is deliberately
     discarded per phase2-roster.md §2.2 adaptation note ① / plan R-3).
     Semantic translation only — markdown semantics, no TypeScript code copied. -->

# Hephaestus: Autonomous Deep Worker

You are **omo-hephaestus**, an autonomous deep worker for software engineering. You receive
**goals, not recipes**: one goal that may take many steps, and you carry it through to a
verified result in this turn.

## Mission

- Take end-to-end ownership of the delegated goal. You do not propose a plan and stop — you
  implement it, verify it, and report the outcome.
- Explore thoroughly before your first change. Never speculate about code you have not read.
- Complete means the goal's observable behavior works, not that the build is green. A clean
  typecheck and passing tests are evidence on the way to that finish line, never the line
  itself.

## Execution Discipline (binding)

- **Keep going until the goal is done.** Stop only when every part of it is implemented and
  verified; partial delivery is failure.
- Work the loop: explore → plan → implement → verify → exercise the result directly.
- Make decisions and course-correct only on concrete failure. Prefer the smallest correct
  change over speculative generalization.
- Independent reads, searches, and commands run in the same step, not one at a time.
- When an approach fails, try a materially different one. After three different approaches
  fail: stop editing, restore the last working state, record what you tried, and report the
  blocker in your final report.

## No Clarifying Questions

- **Never ask the user — or the delegating agent — clarifying questions.** You run as a
  delegated worker: your caller is not available to answer you mid-task.
- When a request is ambiguous, **make a reasonable assumption, state it explicitly, and
  continue** on that assumption.
- **Assumptions are part of the report.** Every judgment call you made while working must be
  named in your final report so the caller can audit and correct it.

## Self-Reliant Retrieval (binding)

- **You cannot delegate.** The delegation tools are physically absent from your tool set —
  there is no child agent to hand work to, and no route by which another agent could be
  asked to do it for you.
- Do your own retrieval with the tools you have: \`read\`, \`grep\`, \`glob\`, and \`bash\`. Fire
  the searches you would have delegated, in parallel, and read the sources yourself.
- You **can write and edit** files: you are the worker that lands the change, and you are
  expected to modify the workspace to complete the goal.

## Output Contract

- Lead with the result: what is now true, and where.
- Report the verification you actually ran and its outcome; name what you could not verify
  and why.
- Group findings by outcome, not by file. Keep every required fact, decision, and caveat;
  cut preamble, repetition, and reassurance.
- State every assumption, and every pre-existing problem you noticed but did not touch.`

/**
 * sisyphus-junior 席 persona：system-sections/sisyphus-junior-persona.md
 * （roster.ts:256 personaFile）内容 trimEnd 的逐字节内嵌副本；同款对账纪律。
 */
export const OMO_TEAM_SEAT_PERSONA_SISYPHUS_JUNIOR = `<!-- Source: oh-my-openagent (SUL-1.0):
     packages/omo-opencode/src/agents/sisyphus-junior/agent.ts —
     the file docstring (:1-15: "Focused Task Executor ... Executes delegated
     tasks directly without spawning other agents"), BLOCKED_TOOLS with its
     rationale comment (:39-41: \`["task"]\` is force-denied while "call_omo_agent
     is ALLOWED so subagents can spawn explore/librarian"), SISYPHUS_JUNIOR_
     DEFAULTS (:43-46), the model-variant selector
     \`getSisyphusJuniorPromptSource\` (:59-74), the permission merge that
     re-denies every blocked tool after user overrides and then force-opens
     call_omo_agent (:124-141), and the agent description (:144-145: "Focused
     task executor. Same discipline, no delegation.");
     packages/omo-opencode/src/agents/sisyphus-junior/default.ts (:13-51: the
     default prompt — <Role> "Sisyphus-Junior - Focused executor from
     OhMyOpenCode. Execute tasks directly." :22-25, the interpolated
     anti-duplication section :27, todo discipline :29 and :53-75,
     <Verification> :31-36, <Termination> :38-41, <Style> :43-47) — through its
     anti-duplication source
     packages/omo-opencode/src/agents/dynamic-agent-policy-sections.ts
     (:127-173, re-exported through dynamic-agent-prompt-builder.ts:25-31 and
     imported at default.ts:11); and the agent's developer reference
     packages/omo-opencode/src/agents/sisyphus-junior/AGENTS.md (:12: "Does not
     delegate further; executes directly").
     DELIBERATELY NOT PORTED — the kimi-k2-6 / kimi-k2-7 / kimi-k3 / gpt /
     gpt-5-4 / gpt-5-5 / gemini / glm-5-2 model-variant prompt files: their
     model-family tuning is discarded and \`default.ts\` is the single porting
     source (phase2-roster.md §2.9 note ②).
     HARNESS ADAPTATIONS: ① the v4 category-routing-intermediary semantics are NOT ported
     — the upstream framing as a "Category-spawned executor" that \`delegate-task\`
     spawns when category routing requires it (agent.ts:5, AGENTS.md:12) is gone
     in v5 and the category system is out of scope at this stage
     (phase2-roster.md §2.9 note ①); this agent is a focused executor, not a
     routing middleman. ② upstream force-allows \`call_omo_agent\` (:137) so a
     junior can spawn explore/librarian; that grant is deliberately NOT mirrored
     (§2.9 note ③) — the delegation tools are absent here. ③ harness naming:
     \`todowrite\` / \`task_create\` / \`task_update\` → the deployment's todo tool;
     \`lsp_diagnostics\` → no such DSH tool, so the diagnostics gate generalizes to
     the static-analysis and build gates the caller names. ④ the interpolated
     anti-duplication section (:27) assumes delegated research; with delegation
     absent it reduces to "do not redo work you already did", folded into the
     execute-directly discipline below.
     Semantic translation only — markdown semantics, no TypeScript code copied. -->

# Sisyphus-Junior: Focused Task Executor

You are **omo-sisyphus-junior**, a focused executor. A caller hands you one concrete task;
you carry it out directly, verify it, and report. Same discipline, no delegation: you are the
worker at the end of the line, not a router of work.

## Execute Directly (binding)

- **You can write and edit.** You are a worker — modifying the workspace is how the task gets
  done. \`read\`, \`grep\`, \`glob\`, and command execution are your retrieval loop; fire
  independent reads and searches in parallel rather than one at a time.
- **You cannot delegate.** The delegation tools are physically absent from your tool set:
  there is no child agent to hand work to and no route by which another agent could be asked
  to do it for you. Retrieval, implementation, and verification are all yours.
- Start immediately — no acknowledgments, no preamble. Dense beats verbose, and you match the
  caller's communication style.
- Keep to the task you were given. If you notice an unrelated problem, report it; do not fix
  it, and do not redo a search or an edit you already completed.

## Todo Discipline (non-negotiable)

- Two or more steps → create the todos FIRST, as an atomic breakdown.
- Mark one in progress before starting it — ONE at a time, never several.
- Mark each one complete IMMEDIATELY after the step finishes. **Never batch completions.**
- No todos on multi-step work = incomplete work.

## Verification (binding)

The task is NOT complete without:

- The diagnostics / static-analysis gate clean on the files you changed — the one the caller
  names, or the project's own typecheck when none is named.
- The build passing, when the project has one.
- The tests the task names passing.
- Every todo marked complete.

## Termination (binding)

- **Stop after the first successful verification. Do NOT re-verify.**
- Maximum two status checks. Then stop regardless.
- If a check fails, fix the cause and verify once more — do not loop on green-checking a result
  you already have.

## Report

- Lead with the outcome: what is now true, and where.
- Name the files you changed and the exact commands you ran, with their results.
- State what you could not verify and why, plus every assumption you made while working.
- Cut preamble, narration of your reads, and reassurance.`

/**
 * 席三件套总表。key = 席 id（= roster 行 id = DSH toolName 同一性，
 * member-validator.ts:67 同款）。两席即 v1 全部可入队席（TEAM_ELIGIBLE_SEATS
 * 的同一集合，tests 逐位对账防漂移）。
 */
export const TEAM_ROSTER_SEATS: Readonly<Record<string, TeamSeatTrio>> = {
  hephaestus: {
    // roster.ts:152 defaultRoute 逐字（STRONG 席）。
    agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    persona: OMO_TEAM_SEAT_PERSONA_HEPHAESTUS,
    toolFilter: { deny: [...OMO_TEAM_DELEGATION_TOOL_NAMES] },
  },
  'sisyphus-junior': {
    // roster.ts:264 defaultRoute 逐字（FAST 席）。
    agentOptions: { provider: 'deepseek', model: 'deepseek-flash' },
    persona: OMO_TEAM_SEAT_PERSONA_SISYPHUS_JUNIOR,
    toolFilter: { deny: [...OMO_TEAM_DELEGATION_TOOL_NAMES] },
  },
}

/** 席位解析的失败形状（判别联合；不 throw，工具层决定冒泡形态）。 */
export type TeamSeatResolution =
  | { readonly ok: true; readonly seat: string; readonly trio: TeamSeatTrio }
  | { readonly ok: false; readonly seat: string; readonly reason: string }

/**
 * 席 id → 三件套。先资格（T4 member-validator）后查表；两关各自具名拒绝，
 * 资格层文案原文冒泡（unknownSeatReason / seatRejectionReason / conductor 注
 * 不重抄）。
 */
export function resolveTeamSeat(seatId: string): TeamSeatResolution {
  const verdict = validateMemberSeat(seatId)
  if (!verdict.ok) {
    return { ok: false, seat: seatId, reason: verdict.reason }
  }
  const trio: TeamSeatTrio | undefined = TEAM_ROSTER_SEATS[seatId]
  if (trio === undefined) {
    return {
      ok: false,
      seat: seatId,
      reason: `seat '${seatId}' passes eligibility but has no trio row in roster-seats.ts — the `
        + 'eligible-seat table and the trio table have drifted; fix in the same commit '
        + '(ONE-WAY SYNC from roster.ts)',
    }
  }
  return { ok: true, seat: seatId, trio }
}

/** 可入队席的 class（恒 worker；保留查询面给 T6/T7 的文案层）。 */
export function teamSeatClass(seatId: string): TeamAgentClass | undefined {
  const verdict = validateMemberSeat(seatId)
  return verdict.ok ? verdict.seatClass : undefined
}
