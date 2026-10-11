// P4-T6 — `/remove-ai-slops` 的模板常量组（语义移植 of upstream's template；
// 非计数表述——P4 的降级形态与 P5-T13 接盘后的在场完整形态各有常量，逐枚见下方 export）。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/templates/remove-ai-slops.ts:1-114
//     export const REMOVE_AI_SLOPS_TEMPLATE = `…`（指令正文）
//   packages/omo-opencode/src/features/builtin-commands/templates/remove-ai-slops.ts:116-216
//     export const REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM = `…`（P5-T13 接盘移植：在场拼接形态，见下）
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:83-92
//     "remove-ai-slops": { description, template: `<command-instruction>…</command-instruction><user-request>$ARGUMENTS</user-request>` }
//     （该条目**无** `argumentHint` 字段 —— 本仓 manifest 的 `argumentHint: null`
//     与之一致，逐字复核于 commands.ts:83-92。T13 评审 NIT 修复轮：原引 85-92
//     行首偏 2，实测 entry = 83-92 @b072d279。）
//
// 移植方式：**语义移植**。正文逐字照搬 upstream（指令资产不重写），本文件只做
// 三件登记性的事，每件都在下面有据可查：
//
// §1 P4 不移植段 → **P5-T13 接盘移植**（D-03 的接续行，omo-team manifest 行 ⑯）：
//   `REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM`（上游 L116-216，101 行）。P4 判「不移植」
//   的理由（本部署没有 team_* 工具族，照搬只会给模型一段无法执行的协议）在 P5-T13
//   后只对**缺席时刻**成立——在场时刻按探测切换附上本仓适配版 addendum
//   （`REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM`，见下方 T13 块）：上游的 phase 语义
//   （slop-squad 组建 / 增量评审 / rework 闭环 / 全退路拆除）与 MUST NOT 名单保留，
//   工具拼写换成本部署面（inline_spec 取代盘上 config.json、quick/deep 取代
//   category 臂与 subagent_type、评审走 roster 席队外委派、任务态五值 +
//   N1 拆弹注记）。**降级路径不许死**：在场脸缺席 ⇒ 渲染仍只含 Phase 1-4 主段
//   （P4 行为逐字），这是 T13 判定的反向腿。上游把两段导出为**两个独立常量**、
//   由 `commands.ts:83-92` 只拼接主段，所以本仓两形态也各是一个独立常量
//   （`REMOVE_AI_SLOPS_COMMAND_TEMPLATE` 降级 / `REMOVE_AI_SLOPS_COMMAND_TEMPLATE_FULL`
//   完整），由 handler 按调用时刻的在场判据选一枚。
//
// §2 载体映射登记（不改写正文）：正文 Phase 2 用 OpenCode 的
//   `task(category="quick", load_skills=["remove-ai-slops"], …)` 逐文件并行加载
//   skill，Phase 0/2/3/4 又多次以 `$omo:remove-ai-slops` 指代它。本部署**有**等
//   价的模型面：`skill` 工具（`@deepseek-ai/dsh-tool-skill`），且 `remove-ai-slops`
//   已由 P4-T5 注册进 skill catalog（19 个 vendored skill）。所以正文里的
//   `load_skills=["remove-ai-slops"]` / `$omo:remove-ai-slops` 在 DSH 侧等价于
//   「调用 skill 工具加载名为 `remove-ai-slops` 的 skill」——**逐字保留**，登记在
//   {@link REMOVE_AI_SLOPS_CARRIER_NOTE}。体例同
//   patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/messages.ts。
//
// §3 未收窄但登记：正文 Phase 1 的 Bash 代码块、Phase 4 的 per-file 反向 patch
//   流程，以及 "Codex Harness Tool Compatibility" 表，都是 OpenCode/Codex 的宿主
//   专有拼写。本移植不改写（见 handoff 侧同款理由：改写等于替模型发明工具名），
//   只在注记里说明"按能力对位"。
//
// 关于正文首段的 "Codex Harness Tool Compatibility"（上游 L3-19）：它整段是给
// **Codex 宿主**的对照表，与 DSH 无关，但删掉它就是改写上游正文，故逐字保留 —
// 注记里明确告知模型该表对本 harness 不适用。

/**
 * `/remove-ai-slops` 注入模型的指令正文（语义移植）。
 *
 * 逐字来自 upstream `templates/remove-ai-slops.ts:1-114`；**不含**上游
 * L116-216 的 team-mode addendum（§1：P4 不移植 → P5-T13 接盘移植）。
 * 本常量仍是**不含 addendum 的降级正文**——接盘移植的 addendum 在它下面的
 * {@link REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM}，在场时刻由
 * {@link REMOVE_AI_SLOPS_COMMAND_TEMPLATE_FULL} 拼进模型面。
 */
export const REMOVE_AI_SLOPS_TEMPLATE = `# Remove AI Slops Command

## Codex Harness Tool Compatibility

This command includes examples for the OpenCode harness. In Codex, do not call OpenCode-only tools such as \`call_omo_agent(...)\`, \`task(...)\`, \`background_output(...)\`, or \`team_*(...)\` literally. Translate those examples to Codex native tools:

| OpenCode example | Codex tool to use |
| --- | --- |
| \`call_omo_agent(subagent_type="explore", ...)\` | \`multi_agent_v1.spawn_agent({"message":"TASK: act as an explorer. ...","agent_type":"explorer","fork_context":false})\` |
| \`call_omo_agent(subagent_type="librarian", ...)\` | \`multi_agent_v1.spawn_agent({"message":"TASK: act as a librarian. ...","agent_type":"librarian","fork_context":false})\` |
| \`task(subagent_type="plan", ...)\` | \`multi_agent_v1.spawn_agent({"message":"TASK: act as a planning agent. ...","agent_type":"plan","fork_context":false})\` |
| \`task(subagent_type="oracle", ...)\` | \`multi_agent_v1.spawn_agent({"message":"TASK: act as a rigorous reviewer. ...","agent_type":"lazycodex-gate-reviewer","fork_context":false})\` |
| \`task(category="...", ...)\` | \`multi_agent_v1.spawn_agent({"message":"TASK: act as an implementation or QA worker. ...","fork_context":false})\` |
| \`background_output(task_id="...")\` | \`multi_agent_v1.wait_agent(...)\` for mailbox signals |
| \`team_*(...)\` | Use Codex native subagents via \`multi_agent_v1.spawn_agent\` and \`multi_agent_v1.wait_agent\`; use \`multi_agent_v1.send_input\` and \`multi_agent_v1.close_agent\` only when exposed in the active tools list |

Codex exposes ONE of two subagent tool surfaces per session; check your own tool list and route accordingly. If \`multi_agent_v1.*\` tools exist, use the table above as written. If instead a flat \`spawn_agent\` with a required \`task_name\` exists (\`multi_agent_v2\`), rewrite every \`multi_agent_v1.*\` example: \`multi_agent_v1.spawn_agent({...,"fork_context":false})\` becomes \`spawn_agent({"task_name":"<lowercase_digits_underscores>","message":...,"agent_type":...,"fork_turns":"none"})\` (\`"all"\` only when full parent history is truly required); \`send_input\` becomes \`send_message\`; do not call \`close_agent\`/\`resume_agent\` (finished agents end on their own; \`followup_task\` re-tasks one, \`interrupt_agent\` stops one); \`wait_agent\` takes only \`timeout_ms\` and returns on any child mailbox activity. \`agent_type\` works the same on both surfaces. If a code block below conflicts with this section, this section wins.

When translating \`load_skills=[...]\`, include the requested skill names in the spawned agent's \`message\`. If a code block below conflicts with this section, this section wins.

## What this command does
Analyzes all files changed in the current branch (compared to parent commit), removes AI-generated code smells in parallel, then critically reviews the changes to ensure safety and behavior preservation. Fixes any issues found during review.

## Step 0: Task Planning

Use TodoWrite to create the task list:
1. Get changed files from branch
2. Run $omo:remove-ai-slops on each file in parallel
3. Critically review all changes
4. Fix any issues found

## Role Definition
You are a senior code quality engineer specialized in identifying and removing AI-generated code patterns while preserving original functionality. You have deep expertise in code review, refactoring safety, and behavioral preservation.

## Process

### Phase 1: Identify Changed Files
Detect the repository base branch dynamically, then get all changed files in the current branch:
\`\`\`bash
BASE_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
git diff $(git merge-base "$BASE_BRANCH" HEAD)..HEAD --name-only
\`\`\`

If \`git symbolic-ref refs/remotes/origin/HEAD\` is unavailable, detect the base branch at runtime using the repo's configured remote default branch. Only fall back to \`main\` as a last resort.

### Phase 2: Parallel AI Slop Removal
For each changed file, spawn an agent in parallel using the Task tool with the $omo:remove-ai-slops skill:

\`\`\`
task(category="quick", load_skills=["remove-ai-slops"], run_in_background=true, description="Remove AI slops from {filename}", prompt="Remove AI slops from: {file_path}")
\`\`\`

**CRITICAL**: Launch ALL agents in a SINGLE message with multiple Task tool calls for maximum parallelism.

Before running $omo:remove-ai-slops on each file, save a file-specific rollback artifact that captures only the delta introduced by the slop-removal pass. Use a safe pattern such as generating a per-file patch and reverse-applying it if review fails.

Do NOT use \`git checkout -- {file_path}\` or any rollback that discards pre-existing branch changes in the file.

### Phase 3: Critical Review
After all $omo:remove-ai-slops agents complete, perform a critical review with the following checklist:

**Safety Verification**:
- [ ] No functional logic was accidentally removed
- [ ] All error handling is preserved
- [ ] Type hints remain correct and complete
- [ ] Import statements are still valid
- [ ] No breaking changes to public APIs

**Behavior Preservation**:
- [ ] Return values unchanged
- [ ] Side effects unchanged
- [ ] Exception behavior unchanged
- [ ] Edge case handling preserved

**Code Quality**:
- [ ] Removed changes are genuinely AI slop (not intentional patterns)
- [ ] Remaining code follows project conventions
- [ ] No orphaned code or dead references

### Phase 4: Fix Issues
If any issues are found during critical review:
1. Identify the specific problem
2. Explain why it's a problem
3. Revert only the $omo:remove-ai-slops delta using the saved per-file patch or an equivalent reverse-apply workflow
4. If remaining ai-slops are found after reverting, remove them by editing the file yourself - with parallel tool calls, per-file
5. Verify the fix doesn't introduce new issues

## Output Format

### Summary Report
\`\`\`
## AI Slop Removal Summary

### Files Processed
- file1.py: X changes
- file2.py: Y changes

### Critical Review Results
- Safety: PASS/FAIL
- Behavior: PASS/FAIL
- Quality: PASS/FAIL

### Issues Found & Fixed
1. [Issue description] -> [Fix applied]

### Final Status
[CLEAN / ISSUES FIXED / REQUIRES ATTENTION]
\`\`\`

## Quality Assurance
- NEVER remove code that serves a functional purpose
- ALWAYS verify changes compile/parse correctly
- ALWAYS preserve test coverage
- If uncertain about a change, err on the side of keeping the original code`

/**
 * 载体注记（carrier note）—— remove-ai-slops 侧的差异登记，**前置**在指令正文之前。
 *
 * 体例同 `omo-hooks/src/hooks/keyword-detector/messages.ts` 的
 * `ULTRAWORK_CARRIER_NOTE`：正文保持上游形态可逐字比对，差异写在正文之外并明确
 * 标注为移植注记。
 */
export const REMOVE_AI_SLOPS_CARRIER_NOTE = `[oh-my-opendsh] Remove AI slops carrier note (semantic port of omo v4.19.4 builtin-commands/templates/remove-ai-slops.ts):

1. SKILL LOADING CARRIES OVER VERBATIM. The body dispatches one agent per changed file with load_skills=["remove-ai-slops"] and refers to the skill as $omo:remove-ai-slops throughout. This harness has the equivalent model-facing surface - the skill tool (@deepseek-ai/dsh-tool-skill) - and remove-ai-slops is already registered in this deployment's skill catalog. So load_skills=["remove-ai-slops"] means: call the skill tool to load the skill named remove-ai-slops, and pass it along to the agent you spawn. Nothing in the body was rewritten.

2. TEAM MODE IS A RUNTIME SWITCH (P5-T13). Upstream ships a second export, REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM (its lines 116-216), which overrides Phase 2-4 when team_* tools are present. At P4 this harness had no team tool family, so that addendum was NOT ported (D-03) and you received only the Phase 1-4 flow. At P5-T13 the addendum IS ported - adapted to this deployment's tool face (inline spec instead of an on-disk team config file, quick/deep categories on worker seats, the reviewer kept OUTSIDE the team, the five-value task-status vocabulary with the failed-state defused) - and it is attached PER INVOCATION only when the omo-team presence probe reports the team_* tools live (read lazily through ctx.get at invocation, never cached at apply time). When the probe says absent - or the service is missing or malformed - you receive the Phase 1-4 flow above unchanged, exactly the P4 behavior; do not wait for a team protocol in that case. The team.md keyword text you may also receive ends with an upstream carrier sentence pointing at a configuration flag and a host restart - this deployment has no such flag; the live tool surface IS the switch, and the adaptation is registered in the prompts-team vendor deviations[] rather than left NOTICE-only.

3. HOST TOOL SPELLINGS NOT REWRITTEN. The Task/Bash/TodoWrite spellings and the leading "Codex Harness Tool Compatibility" table are upstream-host specifics. That table does not apply to this harness - ignore it rather than translating into its tools. Execute the remaining steps through whichever tools cover the same capability (spawning parallel workers, shell git commands, reading and writing the task list).

4. Everything else - the four phases, the Safety/Behavior/Quality checklists, the Output Format and the Quality Assurance list - is upstream's text unchanged.`

// ═══════════════════════════════════════════════════════════════════════════
// P5-T13 — team-mode addendum（team 工具在场时拼进完整模板）。
//
// 上游源：`templates/remove-ai-slops.ts:116-216`（L116 起 `export const
// REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM = \`\n---\n\n# Team Mode Protocol ...`，
// 实测行号）。本段是它的**语义移植**：phase 骨架（Phase 2 setup / Phase 3
// 增量评审 / Phase 4 顺带收编 / Phase 5 全退路拆除）、worker 契约的三段结构
// （per-file / reporting / UNCLEAR）、"reviewer is NOT a team member" 原则、
// broadcast-once 纪律、MUST NOT 名单——逐条对位保留；换掉的只有载体：
//   * 盘上 team config（`~/.omo/teams/slop-squad/config.json`）→ 本部署无此
//     文件面，spec 走 `team_create` 的 `inline_spec` 臂（上游 inline_spec 的
//     同一扇门，v1 唯一臂）；
//   * `lead: {kind:"subagent_type","subagent_type":"sisyphus"}` → 本部署 lead
//     就是收令会话（v1 `subagent_type` 记差异，工具具名拒）；
//   * `team_list`（本部署 recorded-difference，无此工具）→ 孤儿检查走自己
//     持有的 `teamRunId` + `team_status` 读；
//   * `unspecified-low` fix worker（本部署不可解析 category）→ quick 席
//     rework 车道；
//   * 队外评审 `task(category="deep")` → roster 具名席 `plan-reviewer` 的
//     队外委派（比上游的 category 降级更指名，且遵守"只读席不入队"）；
//   * N1 拆弹：上游 Closure 教过 `failed` 终态——本面五值词表（pending/
//     claimed/in_progress/completed/deleted）无此态，addendum 自带 Status rule
//     段就地拆弹（T13 仲裁增补：空头指令不许原样进模型可见面）。
//   * 上游前置条件 1「Load the `team-mode` skill via the `skill` tool」（上游
//     :127，同句还点名 32KB message cap 与 4 parallel worker cap）→ **删去，
//     T13 评审 A MAJOR-2 修复轮补登成文**：本部署 19 件技能目录（src/skills.ts
//     的 `EXPECTED_VENDOR_SKILL_COUNT = 19`）没有 `team-mode`——vendor/
//     prompts-team/src/features/builtin-skills/skills/team-mode.ts 只是
//     sha 档案面（team-prompts-vendor 的漂移种子），不是可加载的技能条目，
//     照搬加载指令必落空。删它事实必要，但静默删违反逐差成文体例，故此处
//     登记删去本身（此前只活在六项清单之外，是评审抓出的静默面）。
//   * 该 skill 承载的 **32KB 消息上限知识**（vendored team-mode.ts:190
//     "Max 32KB per message."）→ 上游靠上面那条加载指令把这条**本部署真实
//     强制**的约束教给模型；本部署 `TEAM_MESSAGE_PAYLOAD_MAX_BYTES = 32768`
//     （omo-team/src/team/team-state.ts:193），team-message.ts:237-241 超限
//     硬拒并具名报限（`message_payload_max_bytes=32768`）。删了加载面却不补
//     知识 = 强制约束从指引中静默消失——补教进模型可见面：本文件 addendum 的
//     per-file worker 报告契约（下方，`body=<full removal report>` 正是鼓励
//     长 body 的地方）与 templates/hyperplan.ts 的完整环 guidance 派单条款
//     各一句 32KB 拆分规则；工具拒绝响亮、具名报限、可恢复，
//     但知识不再外包给一件加载不到的 skill。
// 并列纪律：正文不进任何可 act 的上游载体路径（config 路径只活在注记里）。
// ═══════════════════════════════════════════════════════════════════════════

/**
 * N1 拆弹段（T13 仲裁增补的落点）：五值终态词表 + `failed` 无 schema 态的
 * 就地拆弹。单独成常量是为了让消费侧测试能**逐字**对 TEAM_TASK_STATUSES 钉
 * （词表转抄第二份 = 漂移源），正文里它只出现一次（拼进 addendum 的 Status
 * rule 段）。
 */
export const REMOVE_AI_SLOPS_ADDENDUM_STATUS_RULE = `## Status rule (this surface)

\`team_task_update\` accepts EXACTLY five statuses: \`pending\`, \`claimed\`, \`in_progress\`, \`completed\`, \`deleted\`. There is NO \`failed\` state on this execution surface - the upstream carrier prose that teaches "completed or failed" has no schema behind it here, and a \`failed\` status call is refused by the tool. A task that cannot succeed is settled \`completed\` with the failure reported to the lead in the message BODY, or \`deleted\` when withdrawn - the vocabulary stays inside the five.`

/**
 * team-mode addendum（T13 移植 + 适配版）——在场时刻拼进完整模板；缺席时刻
 * 不出现（降级路径 = 主段 Phase 1-4 原样）。
 */
export const REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM = `
---

# Team Mode Protocol (active when team_* tools are present)

Team mode is live in this session. The rules below **override Phase 2-4** of the legacy flow above. Follow this protocol instead of the per-file fire-and-forget \`task()\` dispatch. This section is upstream's team-mode addendum ported to this deployment: upstream's phase semantics, worker contracts and MUST NOT list are kept; the tool spellings are this surface's, and the upstream carrier pieces (an on-disk team config file, \`team_list\`, a \`subagent_type\` lead) are replaced by what this deployment's team tools actually take - noted inline where the shape changed.

## Phase 2 (team): \`slop-squad\` setup

**Precondition checks** (fail hard if any step fails):

1. Orphan check: this deployment has no \`team_list\` tool, so the check reads YOUR OWN run - if you already hold a \`teamRunId\` from an earlier attempt, read it via \`team_status(teamRunId=<id>)\` before creating anything; an orphan from a crashed prior run is torn down with \`team_shutdown_request\` + \`team_approve_shutdown\` + \`team_delete\` before proceeding. Do not rename the team or run concurrent runs under the same name.
2. This deployment keeps NO on-disk team config file - the spec goes INLINE to the create call, in this surface's vocabulary (\`category\` resolves to \`quick\` or \`deep\`; a \`subagent_type\` field is a recorded difference the tool names and refuses, and the lead is the receiving session itself):

\`\`\`
team_create(inline_spec={"name":"slop-squad","members":[
  {"name":"sweeper-1","category":"quick","prompt":<per-file worker contract below>},
  {"name":"sweeper-2","category":"quick","prompt":"Same contract as peer quick worker."},
  {"name":"sweeper-3","category":"quick","prompt":"Same contract as peer quick worker."},
  {"name":"fixer","category":"quick","prompt":<rework contract below>}
]})
\`\`\`

**Per-file worker contract** (each sweeper prompt): run the slop-removal pass on ONE file per task - load the skill named \`remove-ai-slops\` via the \`skill\` tool; take the detection criteria from the Phase 2 broadcast, not from the task text. After edits, report via \`team_send_message(teamRunId=<id>, to="lead", summary=<change count>, body=<full removal report>)\` and settle the task with \`team_task_update(status="completed")\`. A single \`team_send_message\` body is capped at 32768 bytes on this surface - over the cap the tool refuses the send and its refusal names the limit (\`message_payload_max_bytes=32768\`); the refusal is loud and recoverable: split a longer report into sequential messages (mark the part in \`summary\`, e.g. "report 2/3") and settle the task only after the last part is delivered. On ambiguity: send \`team_send_message(teamRunId=<id>, to="lead", summary="UNCLEAR", body=<reason>)\` and leave the task \`in_progress\` - this surface has no failed task state, see the Status rule below; never invent one. Never git add, never run tests, never touch other files.

**Rework contract** (the fixer prompt): you claim rework tasks the lead creates after the external reviewer flags issues. Read the reviewer's per-hunk rollback instructions in the task description, apply the reverse patch, then run the slop pass ONLY on the non-rolled-back remainder. Same reporting rule as the sweepers; handle UNCLEAR the same way.

Rationale for this composition (upstream's, mapped):
- **4 worker members** = upstream's parallel-squad shape; this surface's ceiling is 8 members, so the squad fits with headroom.
- **The reviewer is NOT a team member** - review demands stronger reasoning than worker routing provides, and read-only seats are team-ineligible here anyway (the tool refuses them by name). The reviewer runs OUTSIDE the team as a roster delegation; see Phase 3.
- **quick x 3** absorbs the mass of per-file slop removal; the **fixer** lane is the rework lane for fixes triggered by reviewer findings.

**Team lifecycle** (create once, reuse until Phase 5 cleanup):

1. \`team_create(inline_spec=...)\` above. Record \`teamRunId\` - every subsequent team call needs it.
2. Broadcast the detection criteria ONCE so each task description stays minimal:
   \`\`\`
   team_send_message(
     teamRunId=<id>, to="*", kind="announcement",
     summary="slop-criteria",
     body=<the slop categories + KEEP rules; reference the remove-ai-slops skill content>
   )
   \`\`\`
   Broadcast is lead-only here - the tool enforces that verbatim.
3. Before spawning tasks, save a per-file rollback artifact that captures only the delta the slop-removal pass will introduce. Do NOT use \`git checkout -- <file>\` - that would discard pre-existing branch changes.
4. For each changed file, \`team_task_create(teamRunId=<id>, subject="slop: <file>", description=<file path + rollback artifact path + reporting format>)\`.

## Phase 3 (team): Incremental reviewer dispatch

While any team task is \`pending\`, \`claimed\` or \`in_progress\`:

- Wait for member messages - the runtime delivers them. Do NOT tight-poll \`team_status\`; a single \`team_status\` check is acceptable if no notification arrives within roughly 10 seconds of expected completion.
- On each worker completion report:
  - Log the report to the pending final summary (no blocking).
  - Immediately dispatch the **external reviewer** OUTSIDE the team: delegate to the \`plan-reviewer\` roster seat (adversarial review; it cannot be a team member, which is exactly upstream's reason for keeping its reviewer out of the team). Feed it the file path + the full worker report + the Safety/Behavior/Quality checklist, and require an answer of "PASS" or "FAIL:<per-hunk rollback instructions>".
- On a reviewer FAIL:
  - Create a rework team task: \`team_task_create(teamRunId=<id>, subject="rework: <file>", description=<reverse-patch hunks from the reviewer + "then run the slop pass on remaining non-rolled-back issues only">)\`. The \`fixer\` member claims it.
  - Pair a fresh reviewer delegation to the rework's completion (same incremental pattern as upstream).
- Loop until every file has a PASS from the reviewer AND no team task is outstanding.

## Phase 4 (team): Fix issues

Fixes happen incrementally during Phase 3's loop via rework tasks - this phase is already handled when the loop exits. Any remaining manual fix that neither sweeper nor fixer could resolve is handled by the lead here, editing files directly.

## Phase 5 (team): Team cleanup

Before producing the summary report, dismantle the team on EVERY exit path - success, escalation, abort - otherwise the next run's Phase 2 precondition check catches the orphan.

1. \`team_shutdown_request\` for each active member, then \`team_approve_shutdown\` if members do not self-approve within a reasonable window.
2. \`team_delete(teamRunId=<id>)\`.
3. Confirm the run is gone with one \`team_status(teamRunId=<id>)\` read - the refusal naming the unknown run IS the confirmation.

${REMOVE_AI_SLOPS_ADDENDUM_STATUS_RULE}

## MUST NOT (team mode)

- Lead never edits files directly during the run - orchestrate only; if editing is needed, it goes into a team task (the Phase 4 leftover-fix above is the single exception upstream itself carves out).
- Do not inline the full slop-criteria into every task description; rely on the Phase 2 broadcast.
- Do not call \`team_create\` again mid-session. One team per resolution.
- Do not name \`oracle\`, \`librarian\`, \`plan-reviewer\`, \`plan-consultant\`, \`prometheus\` or any other read-only seat as team members - the tool refuses them; call them outside the team via their roster delegation when needed.
- Do not tell the user to enable team-mode through any configuration file or restart ritual - this deployment has no such switch; the live team_* tool surface IS the switch, and it is live exactly while this addendum is attached.`

/**
 * 完整形态送进模型的完整消息模板（T13）= 载体注记 + 主段正文 + team-mode
 * addendum 三段拼接，外框与降级模板同形（`<command-instruction>` +
 * `<user-request>$ARGUMENTS</user-request>`，占位符仍只有 `$ARGUMENTS`）。
 */
export const REMOVE_AI_SLOPS_COMMAND_TEMPLATE_FULL = `<command-instruction>
${REMOVE_AI_SLOPS_CARRIER_NOTE}

---

${REMOVE_AI_SLOPS_TEMPLATE}

${REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM}
</command-instruction>

<user-request>
$ARGUMENTS
</user-request>`

/**
 * `/remove-ai-slops` 送进模型的完整消息模板 —— 逐字取自 upstream
 * `commands.ts:83-92` 的 `template` 字段（wrapper + `<user-request>` 段），
 * 只把正文常量换成 {@link REMOVE_AI_SLOPS_CARRIER_NOTE} +
 * {@link REMOVE_AI_SLOPS_TEMPLATE}。
 *
 * T13 后这是**降级导出**（不含 addendum，P4 形态逐字保留——缺席时刻与老调用点
 * 渲染的就是它）；在场时刻渲染 {@link REMOVE_AI_SLOPS_COMMAND_TEMPLATE_FULL}。
 *
 * 该模板只用 `$ARGUMENTS` 一个占位符（upstream 的这个条目没有
 * `<session-context>` 段，故没有 `$SESSION_ID` / `$TIMESTAMP`）——所以
 * `/remove-ai-slops` 的渲染**不依赖会话 id**，`MissingCommandSessionIDError`
 * 在这条命令上不可能触发（单测钉死这一点）。
 */
export const REMOVE_AI_SLOPS_COMMAND_TEMPLATE = `<command-instruction>
${REMOVE_AI_SLOPS_CARRIER_NOTE}

---

${REMOVE_AI_SLOPS_TEMPLATE}
</command-instruction>

<user-request>
$ARGUMENTS
</user-request>`
