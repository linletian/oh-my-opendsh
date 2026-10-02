// P4-T6 — `/handoff` 的两个模板常量（语义移植 of upstream's handoff template）。
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/features/builtin-commands/templates/handoff.ts:1-196
//     export const HANDOFF_TEMPLATE = `…`（196 行，指令正文）
//   packages/omo-opencode/src/features/builtin-commands/commands.ts:100-107
//     handoff: { description, template: `<command-instruction>…`, argumentHint: "[goal]" }
//
// 移植方式：**语义移植**。指令正文逐字照搬 upstream（它是上游的指令资产，本仓
// 不重写指令），只有两处按 DSH 的载体现实做了收窄，每一处都在下面 §1 / §2 登记
// 差异，并在正文内以载体注记（carrier note）显式说明——体例同
// patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/messages.ts 的
// `ULTRAWORK_CARRIER_NOTE`（先读，再读正文）。
//
// 正文改写共三处（逐条见下）：§1 的 PHASE 0.5 `session_read`、§2 的 PHASE 1/3
// 宿主工具拼写、§3 的 PHASE 4 会话面。本仓**不**再有任何一处声称"唯一改写"。
//
// §1 收窄：PHASE 0.5 的 `session_read({...})`。
//   上游把 `session_read` 当**第一步强制数据步**，因为它是"用户最初问了什么"的唯一
//   权威来源。DSH 侧实测：`@deepseek-ai/dsh-session-query` 是**近等价 service 但没有
//   现成的模型工具**（服务在、模型面无工具），所以指令里的
//   `Call session_read(...)` 变成一句模型无法执行的命令——那会让 PHASE 0.5 静默失败、
//   后面整份交接摘要在"凭记忆重建用户请求"的基础上产出，正好是这一段要防的事。
//   处置：该段改写为**指引文案**（经会话导出/查询面取得本会话历史的第一条用户
//   消息），其余 PHASE 0.5 的规则原样保留（逐字引用、不复述、不凭记忆）。
//   差异注记见 {@link HANDOFF_CARRIER_NOTE}。
//
// §2 按能力指引改写（**这一条是改写，不是原样保留** —— 双评审 MAJOR-1 裁定：
//   原先的登记说反了话）：上游 PHASE 1 的 `todoread()` / `Bash({ command: … })`
//   拼写与紧随其后的 `Suggested execution order` 代码块、PHASE 3 的
//   `[Include current todo state from todoread()]` 后缀，都按能力改成了散文指引：
//     * `todoread()` —— DSH **没有** todoread 面（最近的是 `todo_write` 工具），
//       照抄会教模型去调一个不存在的工具名；
//     * `Bash({ command: … })` —— DSH 的 bash 工具形态相近但**拼写不同源**，故
//       改写为「run `git diff --stat HEAD~10..HEAD`」这类按能力表达；
//     * `Suggested execution order` 的**顺序内容保留**（它是有用的编排意图），
//       只是载体从代码块变成了 1-4 的散文顺序表。
//   每一处都在 {@link HANDOFF_CARRIER_NOTE} 第 2 条与 THIRD_PARTY_NOTICES 的
//   语义移植表里如实登记，改写的意图与范围都可被 grep 回溯。
//
// §3 PHASE 4 第 1 步补 DSH 会话面（双评审 MAJOR-2 裁定）：上游只写 OpenCode 的
//   「press 'n' in TUI / run 'opencode'」，那是上游宿主；DSH 的等价面是 **Web GUI
//   新会话**或**再次运行 `dsh`**。该步措辞已补这两者（OpenCode 写法保留在括注
//   里），差异登记见 {@link HANDOFF_CARRIER_NOTE} 第 3 条、文件头 §3 与
//   manifest 的 handoff 行注释。
//
// 模板 wrapper（`<command-instruction>` 包裹与 `$SESSION_ID` / `$TIMESTAMP` /
// `$ARGUMENTS` 三段）逐字取自 upstream commands.ts:100-107，不在本文件重打——
// 见 {@link HANDOFF_COMMAND_TEMPLATE}。

/**
 * `/handoff` 注入模型的指令正文（语义移植）。
 *
 * 逐字来自 upstream `templates/handoff.ts:1-196`，**正文改写共三处**（见文件头
 * §1/§2/§3）：本段 `# PHASE 0.5: SESSION READ FIRST`、PHASE 1/3 的宿主工具拼写、
 * PHASE 4 第 1 步的会话面。本段的 4 条 Rules 与 PHASE 1 对它的引用保持不变 ——
 * 这一处收窄只回答"用什么去读"，不回答"读到什么算"。
 */
export const HANDOFF_TEMPLATE = `# Handoff Command

## Purpose

Use /handoff when:
- The current session context is getting too long and quality is degrading
- You want to start fresh while preserving essential context from this session
- The context window is approaching capacity

This creates a detailed context summary that can be used to continue work in a new session.

---

# PHASE 0: VALIDATE REQUEST

Before proceeding, confirm:
- [ ] There is meaningful work or context in this session to preserve
- [ ] The user wants to create a handoff summary (not just asking about it)

If the session is nearly empty or has no meaningful context, inform the user there is nothing substantial to hand off.

---

# PHASE 0.5: SESSION READ FIRST (MANDATORY FIRST DATA STEP)

Before any other context gathering step, retrieve this session's own history through the session export / query surface available to you, and read the earliest entry whose role is "user". That entry is the only authoritative source for what the user originally asked; do not reconstruct memory of the first request, because long sessions and post-compact sessions truncate or summarize early messages, so in-context memory is unreliable.

From the retrieved session history:

1. Find the first user message in the returned session history (the earliest entry with role "user").
2. Copy the text of that first user message verbatim into a working note. You will later place it into the USER REQUESTS (AS-IS) section unchanged.
3. If the user has sent multiple distinct top-level requests in the session, also collect each subsequent verbatim user message that is a new top-level ask (not a follow-up clarification).

Rules:
- Do not reconstruct user requests from memory. Always quote from the retrieved session history.
- Do not paraphrase, summarize, or "tidy up" the user's wording.
- Do not skip this step even if you feel you remember the first user message.
- If the session history is unavailable or returns no user messages, state that explicitly in the USER REQUESTS (AS-IS) section rather than guessing.

---

# PHASE 1: GATHER PROGRAMMATIC CONTEXT

Execute these tools to gather concrete data:

1. The session history retrieved in PHASE 0.5 (already executed; reuse its output here)
2. The current task/todo list - read the active task list the session exposes
3. Recent file changes - run \`git diff --stat HEAD~10..HEAD\`
4. Uncommitted changes - run \`git status --porcelain\`

Suggested execution order:

1. The session history from PHASE 0.5 (already retrieved; reuse it)
2. The task/todo list
3. \`git diff --stat HEAD~10..HEAD\`
4. \`git status --porcelain\`

Analyze the gathered outputs to understand:
- What work was completed
- What tasks remain incomplete (include todo state)
- What decisions were made
- What files were modified or discussed (include git diff/stat + status)
- What patterns, constraints, or preferences were established

USER REQUESTS were already captured verbatim from the session history in PHASE 0.5; do not re-derive them here.

---

# PHASE 2: EXTRACT CONTEXT

Write the context summary from first person perspective ("I did...", "I told you...").

Focus on:
- Capabilities and behavior, not file-by-file implementation details
- What matters for continuing the work
- Avoiding excessive implementation details (variable names, storage keys, constants) unless critical
- USER REQUESTS (AS-IS) must come from the PHASE 0.5 session-history extraction, copied verbatim (do not paraphrase, do not reconstruct from memory)
- EXPLICIT CONSTRAINTS must be verbatim only (do not invent)

Questions to consider when extracting:
- What did I just do or implement?
- What instructions did I already give which are still relevant (e.g. follow patterns in the codebase)?
- What files did I tell you are important or that I am working on?
- Did I provide a plan or spec that should be included?
- What did I already tell you that is important (libraries, patterns, constraints, preferences)?
- What important technical details did I discover (APIs, methods, patterns)?
- What caveats, limitations, or open questions did I find?

---

# PHASE 3: FORMAT OUTPUT

Generate a handoff summary using this exact format:

\`\`\`
HANDOFF CONTEXT
===============

USER REQUESTS (AS-IS)
---------------------
- [Exact verbatim user requests - NOT paraphrased]

GOAL
----
[One sentence describing what should be done next]

WORK COMPLETED
--------------
- [First person bullet points of what was done]
- [Include specific file paths when relevant]
- [Note key implementation decisions]

CURRENT STATE
-------------
- [Current state of the codebase or task]
- [Build/test status if applicable]
- [Any environment or configuration state]

PENDING TASKS
-------------
- [Tasks that were planned but not completed]
- [Next logical steps to take]
- [Any blockers or issues encountered]
- [Include the current todo state you read in PHASE 1]

KEY FILES
---------
- [path/to/file1] - [brief role description]
- [path/to/file2] - [brief role description]
(Maximum 10 files, prioritized by importance)
- (Include files from git diff/stat and git status)

IMPORTANT DECISIONS
-------------------
- [Technical decisions that were made and why]
- [Trade-offs that were considered]
- [Patterns or conventions established]

EXPLICIT CONSTRAINTS
--------------------
- [Verbatim constraints only - from user or existing AGENTS.md]
- If none, write: None

CONTEXT FOR CONTINUATION
------------------------
- [What the next session needs to know to continue]
- [Warnings or gotchas to be aware of]
- [References to documentation if relevant]
\`\`\`

Rules for the summary:
- Plain text with bullets
- No markdown headers with # (use the format above with dashes)
- No bold, italic, or code fences within content
- Use workspace-relative paths for files
- Keep it focused - only include what matters for continuation
- Pick an appropriate length based on complexity
- USER REQUESTS (AS-IS) and EXPLICIT CONSTRAINTS must be verbatim only

---

# PHASE 4: PROVIDE INSTRUCTIONS

After generating the summary, instruct the user:

\`\`\`
---

TO CONTINUE IN A NEW SESSION:

1. Start a new session in your harness (DSH: open a new session from the Web GUI, or run \`dsh\` again in a new terminal; OpenCode: press 'n' in the TUI, or run 'opencode' in a new terminal)
2. Paste the HANDOFF CONTEXT above as your first message
3. Add your request: "Continue from the handoff context above. [Your next task]"

The new session will have all context needed to continue seamlessly.
\`\`\`

---

# IMPORTANT CONSTRAINTS

- DO NOT attempt to programmatically create new sessions (no API available to agents)
- DO provide a self-contained summary that works without access to this session
- DO include workspace-relative file paths
- DO NOT include sensitive information (API keys, credentials, secrets)
- DO NOT exceed 10 files in the KEY FILES section
- DO keep the GOAL section to a single sentence or short paragraph

---

# EXECUTE NOW

Begin by gathering programmatic context, then synthesize the handoff summary.
`

/**
 * 载体注记（carrier note）—— handoff 侧的差异登记，**前置**在指令正文之前。
 *
 * 体例同 `omo-hooks/src/hooks/keyword-detector/messages.ts` 的
 * `ULTRAWORK_CARRIER_NOTE`：差异写在正文之外、被明确标注为移植注记，正文保持
 * 上游形态可逐字比对。必须先读这一段再读 PHASE 0.5，否则模型会把"没有
 * session_read 工具"读成模板写错了。
 */
export const HANDOFF_CARRIER_NOTE = `[oh-my-opendsh] Handoff carrier note (semantic port of omo v4.19.4 builtin-commands/templates/handoff.ts):

1. PHASE 0.5 no longer calls a session_read tool. Upstream's mandatory first data step reads session_read({session_id}) because that call is the only authoritative source for the user's original request. This harness ships @deepseek-ai/dsh-session-query as a near-equivalent SERVICE but exposes no model-facing tool for it, so the call was rewritten as the guidance in PHASE 0.5: retrieve this session's history through the session export / query surface you actually have. The rules below that section are unchanged - still quote verbatim, never reconstruct from memory, and still state plainly when the history is unavailable. If your harness does expose a session history tool, prefer it.

2. PHASE 1's todoread() and Bash({command: ...}) spellings, its "Suggested execution order" code block, and PHASE 3's "from todoread()" suffix were REWRITTEN as capability guidance, not kept verbatim. This harness has no todoread surface at all (the nearest is a todo/task-list write tool), and its bash tool is similar in form but is not the same source spelling - so the body now says what to do (read the task list; run git diff --stat HEAD~10..HEAD) instead of naming tools that do not exist here. The execution ORDER upstream asked for is preserved as prose.

3. PHASE 4's "start a new session" step names this harness's session surface as well (Web GUI new session, or run dsh again in a terminal); upstream names only its own (press 'n' in TUI, or run 'opencode'), which stays in the parenthetical. The remaining three steps are upstream's text.

4. Apart from the three registered above, everything else in the instruction body - PHASE 0 through PHASE 4, the HANDOFF CONTEXT format, and the IMPORTANT CONSTRAINTS list - is upstream's text unchanged.`

/**
 * `/handoff` 送进模型的完整消息模板 —— 逐字取自 upstream `commands.ts:100-107`
 * 的 `template` 字段（wrapper + 三段上下文），只把正文常量换成
 * {@link HANDOFF_CARRIER_NOTE} + {@link HANDOFF_TEMPLATE}。
 *
 * 三处占位符正是 upstream 在这个模板里用的那三个：`$SESSION_ID` / `$TIMESTAMP`
 * 在 `<session-context>` 段，`$ARGUMENTS` 在 `<user-request>` 段。
 */
export const HANDOFF_COMMAND_TEMPLATE = `<command-instruction>
${HANDOFF_CARRIER_NOTE}

---

${HANDOFF_TEMPLATE}
</command-instruction>

<session-context>
Session ID: $SESSION_ID
Timestamp: $TIMESTAMP
</session-context>

<user-request>
$ARGUMENTS
</user-request>`
