// P4-T10 — `/ulw-execute` 的模板常量（语义移植 of upstream's start-work template
// + its command-entry wrapper）。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/templates/start-work.ts
//     export const START_WORK_TEMPLATE = `You are starting an Atlas work session. …`（L1 起）
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:61-76 — the command
//     ENTRY: `agent: resolveStartWorkAgent(options)` (:62) + the THREE-LAYER wrapper
//     (:63-74) + `argumentHint` (:75)。
//
// ⚠️ **R-10：wrapper 与模板本体必须双层携带，缺一不可**（P4-T1 C 组实测，计划书 §4.7
// 已更正）。`<session-context>` 段**不在模板本体里** —— 它在 commands.ts:63-74 的
// wrapper（其中 :67-70 是 session-context 段的两行 + 闭合标签），
// 而 `You are starting an Atlas work session.` 在 start-work.ts:1。H-32 的上游激活
// 检测恰好逐字要求这两个（start-work-hook.ts:170-175 的合取），所以本文件
// **两层都写**：ULW_EXECUTE_TEMPLATE 首行带标头 marker，
// ULW_EXECUTE_COMMAND_TEMPLATE 带 wrapper 的 `<session-context>` 段。只移植其中
// 一层，激活会静默失配 —— 这是 R-10 登记的常量同步风险，跨包逐字相等由
// tests/omo-commands/ulw-execute.test.ts 钉住。
//
// 命名锚点（ROADMAP §2 规则 6）：命令 / 模板 / 常量一律用 v5 名 `ulw-execute`；
// 上游冻结基线里 **零命中**（P3-T1 startwork-split 裁定 C）。署名注明上游路径
// `start-work` —— 署名锚点不随改名移动。
//
// ═══ 移植方式：语义移植，差异逐条登记 ═══
//
// 上游正文约 120 行，承诺了四件本部署**做不到或语义不同**的事。任务书要求
// 「boulder-state / ledger 引用段按 Phase 3 H-32 已登记的收窄口径处理（复用其
// 差异清单）」—— 本文件就是那份复用，全部落点取自 omo-hooks 的 live 事实，不是
// 重新判断：
//
//   ① **`.omo/boulder.json` 不是本部署的存储面。** H-32 已把「一次 work session
//      的建立」落成**一个 `ctx.jobs` job**（`ULW_EXECUTE_JOB_KIND = 'ulw-execute'`，
//      label 承载计划名，output 承载落地事实；见 ulw-execute/live-state.ts）。
//      故正文第 2/5 步的「读 / 写 boulder.json」改写为 jobs 面的等价动作，**不**
//      再让模型手写一个本部署不消费的文件。
//   ② **没有活动 work 列表，所以"续接/新建"的判定分支当前不可达。** H-32 的
//      `BoulderView` 投影恒为 `EMPTY_BOULDER_VIEW`（`existingState: null`、
//      `activeWorks: []`、`resumeOptions: []`；见 ulw-execute/context-builder.ts:127），
//      相应的 S-4 分支级跳过段已登记在 H-32 头（`getWorkByPlanName` ①级）。
//      正文里"若列出多个活动 work → 问用户选哪个"这一段**保留但标注为当前不可达**
//      —— 删掉它会让将来接上非空投影时行为静默改变（这正是 H-32 警告的
//      「必须先补此项」），而标注为不可达是在现在就如实说明。
//   ③ **`.omo/start-work/ledger.jsonl` 无对应面。** H-32 的落地事实写在 job 的
//      `output` 上，notepad 脚手架写 `.omo/notepads/<planName>/`（live-state.ts:155
//      `join(directory, '.omo', 'notepads', planName)`）。故 "No goal tool -> record
//      the same objective as the first ledger.jsonl entry" 这一条改写为写到
//      notepad / job output，并说明目录位置。
//   ④ **`create_goal` 存在**（本仓有 dsh-goal 面，`ctx.goals`），所以上游
//      "When a goal tool is available (`create_goal`)" 的**条件式**写法在 DSH
//      恒真 —— 故正文把它**改为断言式**（"This harness has a goal tool
//      (create_goal): call it with a DETAILED objective…"），并把 notepad 写成
//      明确的兜底路径，而不是一条待定条件。（早期版本说"正文保留条件式写法"，
//      与正文实际写法不符，已更正；载体注记第 4 条同步。）
//
// 逐字保留的部分：命令首行（= R-10 标头 marker）、ARGUMENTS 段的 flags 语法
// `[plan-name] [--worktree <path>] [--make-pr] [--ship]` 与四个 flag 的语义、
// WHAT TO DO 的 6 步骨架、OUTPUT FORMAT 三段样例、CRITICAL 五条、GOAL + TASK
// BREAKDOWN 的两段强制要求与"不许留含糊任务"的例子、WORKTREE COMPLETION 的 6 步。
//
// 载体纪律（同 P4-T6 的 HANDOFF_CARRIER_NOTE / keyword-detector 的
// ULTRAWORK_CARRIER_NOTE）：**差异写在正文之外**（ULW_EXECUTE_CARRIER_NOTE，
// 前置在正文之前），正文保持可比对的形态。

/**
 * R-10 接口常量（**本地声明**，不从 omo-hooks import）。
 *
 * 为什么不 import：两个补丁包各自独立安装（`dsh plugin add` 各自 link），跨包
 * 相对路径 import 会在对方缺席时直接崩掉本包的加载 —— 与
 * `commands/stop-continuation.ts` 的 `STOP_CONTINUATION_SERVICE` 同一纪律。
 *
 * 两侧一致不靠"记性好"，而靠 tests/omo-commands/ulw-execute.test.ts 里那条
 * **跨包相等断言**（同时 import 两个包的模块比较常量值）—— 双侧漂移会先在单测
 * 变红，而不是在真机上让 H-32 的激活门静默失配。
 */

/** 模板本体首行（上游 START_WORK_TEMPLATE_MARKER，逐字；= H-32 TEMPLATE_HEADER_MARKER）。 */
export const ULW_EXECUTE_TEMPLATE_HEADER_MARKER = 'You are starting an Atlas work session.'

/** wrapper 的 session-context 开标签（上游 SESSION_CONTEXT_OPEN，逐字；= H-32 TEMPLATE_SESSION_CONTEXT_OPEN）。 */
export const ULW_EXECUTE_SESSION_CONTEXT_OPEN = '<session-context>'

/** wrapper 的 session-context 闭合标签（上游 SESSION_CONTEXT_CLOSE，逐字）。 */
export const ULW_EXECUTE_SESSION_CONTEXT_CLOSE = '</session-context>'

/** `$SESSION_ID` 在 wrapper 里的那一行（上游 commands.ts:68，逐字）。 */
export const ULW_EXECUTE_SESSION_ID_LINE = 'Session ID: $SESSION_ID'

/** `$TIMESTAMP` 在 wrapper 里的那一行（上游 commands.ts:69，逐字）。 */
export const ULW_EXECUTE_TIMESTAMP_LINE = 'Timestamp: $TIMESTAMP'

/** 上游 commands.ts:75 的 argumentHint，逐字。 */
export const ULW_EXECUTE_ARGUMENT_HINT = '[plan-name] [--worktree <path>] [--make-pr] [--ship]'

/**
 * `/ulw-execute` 的指令正文（语义移植；与上游的差异见文件头 §①②③④）。
 *
 * ⚠️ 首行**必须**逐字等于 {@link ULW_EXECUTE_TEMPLATE_HEADER_MARKER} —— 它就是
 * R-10 三个接口常量之一，H-32 的激活检测按它逐字匹配。改写首行等于让激活门静默
 * 失配（不是报错，是不激活），所以它单独由单测从本常量派生比对。
 */
export const ULW_EXECUTE_TEMPLATE = `${ULW_EXECUTE_TEMPLATE_HEADER_MARKER}

## ARGUMENTS

- \`/ulw-execute ${ULW_EXECUTE_ARGUMENT_HINT}\`
  - \`plan-name\` (optional): name or partial match of the plan to start
  - \`--worktree <path>\` (optional): absolute path to an existing git worktree to work in
    - If specified and valid: the flag is recorded on this work session, which runs from that worktree
    - If specified but invalid: you must run \`git worktree add <path> <branch>\` first
    - If omitted: work directly in the current project directory (no worktree)
  - \`--make-pr\` (optional): deliver the work as a pull request. IMPLIES worktree mode - when \`--worktree\` is omitted, create a task-owned worktree before implementation. On completion push the branch, open a reviewer-readable PR, and hand off with the PR URL (merge only on explicit user ask)
  - \`--ship\` (optional): full delivery lifecycle; implies \`--make-pr\`. After the PR opens, keep working until it is MERGED (CI + review gates, feedback addressed), then clean up the worktree and sync \`.omo/\` state back

## WHAT TO DO

1. **Find available plans**: the Prometheus-generated plan files under \`.omo/plans/\` are read for you and listed in the session context below. If that list is empty, say so plainly instead of inventing a plan.

2. **Check for active work state**: the active work session, if any, is reported in the session context below.

3. **Decision logic**:
   - If the session context reports an active plan and the user did not name a plan:
     - Auto-resume that single active work
   - If no active plan OR plan is complete:
     - List available plan files
     - If ONE plan: auto-select it
     - If MULTIPLE plans: show list with timestamps, ask user to select
   - (The upstream "multiple active works -> ask the user which to resume" branch is reproduced VERBATIM in carrier note item 2 above. It is currently unreachable — this deployment's work-state projection reports no activity list — and it is marked here rather than deleted so H-32's S-4 restoration requirement stays satisfiable.)

4. **Worktree Setup** (ONLY when \`--worktree\` was explicitly specified):
   1. \`git worktree list --porcelain\` - see available worktrees
   2. Create if needed: \`git worktree add <absolute-path> <branch-or-HEAD>\`
   3. Work happens inside that worktree directory for the rest of the session
   4. DSH has no boulder.json to pre-set, so the worktree path is carried in the session context instead

5. **Record the work session**: the harness registers this work as a tracked work session and creates the plan's notepad directory. You do not hand-write a state file.

6. **Read the plan file** and start executing tasks according to atlas workflow

## OUTPUT FORMAT

When listing plans for selection:
\`\`\`
Available Work Plans

Current Time: {ISO timestamp}
Session ID: {current session id}

1. [plan-name-1.md] - Modified: {date} - Progress: 3/10 tasks
2. [plan-name-2.md] - Modified: {date} - Progress: 0/5 tasks

Which plan would you like to work on? (Enter number or plan name)
\`\`\`

When resuming existing work:
\`\`\`
Resuming Work Session

Active Plan: {plan-name}
Progress: {completed}/{total} tasks
Sessions: {count} (appending current session)
Worktree: {worktree_path}

Reading plan and continuing from last incomplete task...
\`\`\`

When auto-selecting single plan:
\`\`\`
Starting Work Session

Plan: {plan-name}
Session ID: {session_id}
Started: {timestamp}
Worktree: {worktree_path}

Reading plan and beginning execution...
\`\`\`

## CRITICAL

- The session_id is injected by the session context below - use it directly
- The work session is registered by the harness; do not hand-write its state file
- If a worktree is in use, all work happens inside that worktree directory
- Read the FULL plan file before delegating any tasks
- Follow atlas delegation protocols (7-section format)

## GOAL + TASK BREAKDOWN (MANDATORY)

Do BOTH of these immediately after reading the plan file, BEFORE starting any work. Skipping either is a defect.

**1. Set the goal, in detail.** This harness has a goal tool (\`create_goal\`): call it with a DETAILED objective: the plan name and path, the concrete end state, the phase/task counts, the delivery mode (direct, \`--make-pr\`, or \`--ship\`), and how completion will be verified. One work session = one goal. If the goal tool is unavailable, record the same objective in the plan's notepad directory under \`.omo/notepads/<plan-name>/\` instead.

**2. Register every phase and task as todos.** Decompose every plan task into granular, implementation-level sub-steps and register ALL of them as task/todo items, grouped phase by phase (one phase per plan wave), BEFORE starting any work. Keep them current at every moment: mark in_progress when work dispatches and done immediately after its verification passes - never batch-complete at the end, never execute work that is not a registered todo. Discovered work is appended as a todo before it runs.

**How to break down**:
- Each plan checkbox item (e.g., \`- [ ] Add user authentication\`) must be split into concrete, actionable sub-tasks
- Sub-tasks should be specific enough that each one touches a clear set of files/functions
- Include: file to modify, what to change, expected behavior, and how to verify
- Do NOT leave any task vague - "implement feature X" is NOT acceptable; "add validateToken() to src/auth/middleware.ts that checks JWT expiry and returns 401" IS acceptable

**Example breakdown**:
Plan task: \`- [ ] Add rate limiting to API\`
→ Todo items:
  1. Create \`src/middleware/rate-limiter.ts\` with sliding window algorithm (max 100 req/min per IP)
  2. Add RateLimiter middleware to \`src/app.ts\` router chain, before auth middleware
  3. Add rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining) to response in \`src/middleware/rate-limiter.ts\`
  4. Add test: verify 429 response after exceeding limit in \`src/middleware/rate-limiter.test.ts\`
  5. Add test: verify headers are present on normal responses

Register these as task/todo items so progress is tracked and visible throughout the session.

## WORKTREE COMPLETION

When working in a worktree and ALL plan tasks are complete:
1. Commit all remaining changes in the worktree
2. **Sync .omo state back**: Copy \`.omo/\` from the worktree to the main repo before removal.
   This is CRITICAL when \`.omo/\` is gitignored - state written during worktree execution would otherwise be lost.
   \`\`\`bash
   cp -r <worktree-path>/.omo/* <main-repo>/.omo/ 2>/dev/null || true
   \`\`\`
3. Switch to the main working directory (the original repo, NOT the worktree)
4. Merge the worktree branch into the current branch: \`git merge <worktree-branch>\`
5. If merge succeeds, clean up: \`git worktree remove <worktree-path>\`
6. The work session ends with the session; nothing else needs clearing by hand

This is the DEFAULT behavior when \`--worktree\` was used alone. When \`--make-pr\` or \`--ship\` is active, skip the local merge and follow the PR Delivery Mode instructions in the session context instead: push the branch and open a PR (\`--make-pr\` hands off with the PR URL; \`--ship\` keeps working until the PR is merged), then clean up. Otherwise skip merge only if the user explicitly instructs otherwise (e.g., asks to create a PR instead).`

/**
 * 载体注记（carrier note）—— ulw-execute 侧的差异登记，**前置**在正文之前。
 *
 * 体例同 P4-T6 的 HANDOFF_CARRIER_NOTE / STOP_CONTINUATION_CARRIER_NOTE：正文保持
 * 可比对的形态，差异写在正文之外并明确标注，让模型在读正文前先读到差异。
 */
export const ULW_EXECUTE_CARRIER_NOTE = `[oh-my-opendsh] Ulw-execute carrier note (semantic port of omo v4.19.4 builtin-commands/templates/start-work.ts + commands.ts):

1. WORK STATE IS A JOB, NOT A FILE. Upstream writes .omo/boulder.json. This deployment has no such cross-session work table: the work session is registered as one tracked job (kind "ulw-execute", the plan name as its label, the landed facts in its output). Do not hand-write or hand-maintain a boulder.json - nothing here reads one. The upstream "hook pre-sets worktree_path in boulder.json" step therefore has no DSH landing point, and the worktree path is carried in the session context instead.

2. NO ACTIVE-WORK LIST (upstream's resume branch is currently unreachable). The work-state projection reports no activity list, so the upstream branch "multiple active works -> ask the user which to resume" cannot fire today. It is preserved HERE VERBATIM (upstream templates/start-work.ts:21-25) and in the body's decision logic as a marked branch — never deleted. H-32's S-4 requirement ("when a non-empty projection is wired up this branch-level skip must be re-added FIRST, or an explicit plan name will wrongly take the 'new work' path instead of 'resume'") can only be honoured if the text to restore is still here, so the exact wording is reproduced instead of paraphrased:

     - If multiple active works are listed in your context:
       - This means boulder.json has more than one work with status: \`active\` or \`paused\`
       - Use the Question tool to ask the user which plan to resume
       - Resume by running \`/start-work {plan-name}\` for the selected plan
       - If the user says "start a new plan", continue with cold-start auto-selection logic

   Restoration note: the branch above refers to \`.omo/boulder.json\` and the Question tool, neither of which is this deployment's surface. When it comes back it must be re-pointed at the jobs projection and at an ask mechanism — do NOT paste it back verbatim, use it as the specification of the DECISION, not of the vocabulary. The matching branch-level skip is registered in omo-hooks ulw-execute (H-32, its S-4 note on getWorkByPlanName level one).

3. NO LEDGER FILE. Upstream's ".omo/start-work/ledger.jsonl" has no DSH landing point either. The same objective that upstream would write as the first ledger entry goes to the goal tool when it is available, and otherwise into the plan's notepad directory at .omo/notepads/<plan-name>/.

4. THE GOAL TOOL IS PRESENT, AND THE BODY SAYS SO ASSERTIVELY. Upstream words the requirement as a conditional ("When a goal tool is available (create_goal)"); this harness HAS create_goal, so the body drops the conditional and states it as a fact — "This harness has a goal tool (create_goal): call it with a DETAILED objective..." — with the notepad path as an explicit fallback rather than as a conditional branch. The requirement itself (one work session = one detailed goal) is upstream's, kept verbatim.

5. THE UPSTREAM RESUME-BRANCH LISTING is reproduced verbatim in spirit, not in storage: plan listing still comes from .omo/plans/ and progress is still read from the plan file, because both are plain files this deployment really does read.

6. FLAG SYNTAX IS VERBATIM. [plan-name] [--worktree <path>] [--make-pr] [--ship] and all four flag semantics are upstream's, unchanged; --make-pr implies worktree mode and --ship implies --make-pr, exactly as upstream states.

7. ATLAS BINDING IS A TEMPLATE IDENTITY, NOT A DISPATCH. Upstream sets agent: resolveStartWorkAgent(options) on the command entry, choosing atlas when it is registered and falling back to sisyphus otherwise. This harness has no per-command agent field, so the binding is carried two ways: this template states the Atlas work session identity, and the work runs through the roster's atlas seat. The roster keeps atlas permanently present, so upstream's sisyphus fallback branch is unreachable in this deployment.`

/**
 * `/ulw-execute` 送进模型的完整消息模板 —— 逐字取自 upstream `commands.ts:63-74`
 * 的 `template` 字段的**三层结构**（`<command-instruction>` 包裹正文 + 空的
 * `<session-context>` 两行 + `<user-request>`），只把正文常量换成
 * {@link ULW_EXECUTE_CARRIER_NOTE} + {@link ULW_EXECUTE_TEMPLATE}。
 *
 * ⚠️ 三层都不可省。上游是**单条 prompt 字符串**；本移植把三层原样放进一条
 * followup 消息，所以 H-32 的 marker 检测拿到的是完整包裹的文本，而不是模板
 * 本体。少写 wrapper 段 → 轨 B 失配；少写 `<user-request>` → 模型的请求文本
 * 没有归属段。
 *
 * 本模板**含占位符**（`$ARGUMENTS` / `$SESSION_ID` / `$TIMESTAMP`），所以
 * `renderCommandTemplate` 在这里是真正的替换（`/stop-continuation` 的模板不含
 * 占位符，那里是恒等变换）。`$SESSION_ID` 缺席时渲染器会抛
 * `MissingCommandSessionIDError` —— 那是**期望**行为：一个渲染出空会话 id 的
 * 指令比没有指令更坏。
 */
export const ULW_EXECUTE_COMMAND_TEMPLATE = `<command-instruction>
${ULW_EXECUTE_CARRIER_NOTE}

---

${ULW_EXECUTE_TEMPLATE}
</command-instruction>

${ULW_EXECUTE_SESSION_CONTEXT_OPEN}
${ULW_EXECUTE_SESSION_ID_LINE}
${ULW_EXECUTE_TIMESTAMP_LINE}
${ULW_EXECUTE_SESSION_CONTEXT_CLOSE}

<user-request>
$ARGUMENTS
</user-request>`
