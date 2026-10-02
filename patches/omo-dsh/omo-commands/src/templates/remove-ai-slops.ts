// P4-T6 — `/remove-ai-slops` 的两个模板常量（语义移植 of upstream's template）。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/templates/remove-ai-slops.ts:1-114
//     export const REMOVE_AI_SLOPS_TEMPLATE = `…`（指令正文）
//   packages/omo-opencode/src/features/builtin-commands/templates/remove-ai-slops.ts:116-216
//     export const REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM = `…`（**不移植**，见下）
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:85-92
//     "remove-ai-slops": { description, template: `<command-instruction>…</command-instruction><user-request>$ARGUMENTS</user-request>` }
//     （该条目**无** `argumentHint` 字段 —— 本仓 manifest 的 `argumentHint: null`
//     与之一致，逐字复核于 commands.ts:85-92。）
//
// 移植方式：**语义移植**。正文逐字照搬 upstream（指令资产不重写），本文件只做
// 三件登记性的事，每件都在下面有据可查：
//
// §1 不移植段（D-03 裁定，Phase 5 接盘）：`REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM`
//   （上游 L116-216，101 行）整段**不移植**。它的消费前提是 Team Mode（`team_*`
//   工具族、`~/.omo/teams/slop-squad/config.json`、team 生命周期），本部署没有这
//   一族工具；照搬只会给模型一段无法执行的协议，并让"执行 team 段"看起来像可选
//   分支。上游把两段导出为**两个独立常量**、由 `commands.ts:85-92` 只拼接主段，
//   所以"不移植"在本仓的落地形态就是：不导出该常量、不在任何模板里引用它。
//   同一个决定已记于本仓 manifest 的 `remove-ai-slops` 行注释与 D-03 覆盖基线；
//   本仓 Phase 5 接盘时从同一上游路径同一行号（L116-216）恢复。
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
 * L116-216 的 team-mode addendum（§1 不移植）。
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

2. NO TEAM MODE. Upstream ships a second export, REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM (its lines 116-216), which overrides Phase 2-4 when team_* tools are present. This harness has no team tool family, so that addendum was NOT ported and you will not receive it. Follow the Phase 1-4 flow above; do not wait for a team protocol.

3. HOST TOOL SPELLINGS NOT REWRITTEN. The Task/Bash/TodoWrite spellings and the leading "Codex Harness Tool Compatibility" table are upstream-host specifics. That table does not apply to this harness - ignore it rather than translating into its tools. Execute the remaining steps through whichever tools cover the same capability (spawning parallel workers, shell git commands, reading and writing the task list).

4. Everything else - the four phases, the Safety/Behavior/Quality checklists, the Output Format and the Quality Assurance list - is upstream's text unchanged.`

/**
 * `/remove-ai-slops` 送进模型的完整消息模板 —— 逐字取自 upstream
 * `commands.ts:85-92` 的 `template` 字段（wrapper + `<user-request>` 段），
 * 只把正文常量换成 {@link REMOVE_AI_SLOPS_CARRIER_NOTE} +
 * {@link REMOVE_AI_SLOPS_TEMPLATE}。
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
