// ulw-execute/constants.ts — P3-T17: the activation contract of the
// ulw-execute port (manifest row H-32; upstream directory
// `packages/omo-opencode/src/hooks/start-work/` @ v4.19.4, 20 files = 13
// implementation + 7 test).
//
// 命名锚点（ROADMAP §2 规则 6）：本模块的 id、文案、目录名一律用 v5 名
// `ulw-execute`；上游冻结基线里 **零命中**（P3-T1 startwork-split 裁定 C：
// `git grep -ln "ulw-execute" v4.19.4` 无输出），全部 `start-work` 字面量都是
// 人写改写点。
//
// 署名（上游源，逐文件清单见 ../ulw-execute.ts 头部）：
//   hooks/start-work/start-work-hook.ts:19-24（HOOK_NAME / marker 常量）
//   hooks/start-work/parse-user-request.ts:1-5（关键词/flag 正则）
//   hooks/start-work/worktree-block.ts:1,18（worktree / PR 文案）
//   hooks/start-work/notepad-scaffold.ts:7-32（notepad 文件集与 footer）
//   features/builtin-commands/templates/start-work.ts:1（Phase 4 模板 marker）
//
// 语义移植（非逐字复制）：常量与纯格式化的**值**照搬上游逐字文本，命名锚点
// （id / 目录名）改写为 v5 名 `ulw-execute`；无上游代码 vendor。
//
// 本文件只放**常量与纯格式化**，不含任何 listener 逻辑、不做任何 I/O。
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.

/** 本 registrar 实现的 manifest id（manifest.ts H-32 行）。 */
export const ULW_EXECUTE_ID = 'ulw-execute'

/** 上游 HOOK_NAME（start-work-hook.ts:19）的 DSH 侧对应名（v5 命名锚点）。 */
export const HOOK_NAME = 'ulw-execute'

/** 上游 HOOK_NAME 逐字原文，仅作审计（v4.19.4:19 `"start-work"`）。 */
export const UPSTREAM_HOOK_NAME = 'start-work'

/** 本 listener 的**主事件面**（模式 A：pre-step 检测 + 注入）。 */
export const ULW_EXECUTE_EVENT = 'agent/pre-step'

/** 注入消息 `source.plugin` 盖章值。 */
export const ULW_EXECUTE_PLUGIN = 'omo-hooks'

// ── 激活信号：Phase 4 命令模板 marker（R-10 常量出处登记） ────────────────────
//
// 上游激活检测**只认命令模板产物**（P3-T1 裁定 B，逐字）：
//   start-work-hook.ts:170-175
//     if (!promptText.includes("<session-context>")
//         || !promptText.includes(START_WORK_TEMPLATE_MARKER)) return
// 两个 marker 都只能由 Phase 4 的命令模板产生：
//   features/builtin-commands/templates/start-work.ts:1
//     export const START_WORK_TEMPLATE = `You are starting an Atlas work session.
//   features/builtin-commands/commands.ts:63-74 的
//     `<command-instruction>…<session-context>…<user-request>` 三层包裹。
// 本阶段（Phase 3）**不写任何 `<session-context>` / 模板 marker 的产生面**
// （那是 Phase 4 的 slash 命令）；下面两个常量是**登记在案的接口契约**：
// Phase 4 的模板落地时，其产物的 marker 必须与这两个常量逐字一致，否则幂等
// 守卫（见 @see ULW_EXECUTE_CONTEXT_MARKER）静默失效 —— 这正是计划书 §6
// R-10 与 P3-T1 §4 记录的常量同步风险。

/** Phase 4 模板标头 marker（上游 START_WORK_TEMPLATE_MARKER，逐字）。 */
export const TEMPLATE_HEADER_MARKER = 'You are starting an Atlas work session.'

/** Phase 4 模板的 session-context 开标签（上游 SESSION_CONTEXT_OPEN，逐字）。 */
export const TEMPLATE_SESSION_CONTEXT_OPEN = '<session-context>'

/**
 * 本移植的**幂等 marker**（上游 CONTEXT_INFO_MARKER，start-work-hook.ts:21）。
 * 上游原文是 `"<!-- omo-start-work-context -->"`；命名锚点统一改写为
 * `ulw-execute`。⚠️ 该串是幂等判据：上游 `start-work-hook.ts:224`
 * `if (part.text.includes(CONTEXT_INFO_MARKER))` 用它避免重复注入；DSH 侧
 * 同理由本模块的会话内 `WeakMap` 守卫 + marker 审计（见 ../ulw-execute.ts
 * `hasContextMarkerInSession` 与 `createUlwExecuteListener`）承担，marker 仍写进注入文本，
 * 作为**可 grep 的持久锚点**（e2e / 运维）与未来 Phase 4 模板的对接点。
 */
export const ULW_EXECUTE_CONTEXT_MARKER = '<!-- omo-ulw-execute-context -->'

/** 上游原文 marker，仅作审计。 */
export const UPSTREAM_CONTEXT_INFO_MARKER = '<!-- omo-start-work-context -->'

/**
 * **Phase 3 的 DSH 原生激活信号**（计划书 §4.5 更正口径 / 本任务书）。
 *
 * 上游没有自由文本激活路径（裁定 B），Phase 3 又不交付命令模板，因此按任务书
 * 定义：**指挥显式委派 atlas 且任务含工作计划意图** → pre-step 检测注入。
 * 两个合取条件：
 *   ① 身份面 = 子会话 descriptor.persona 含 `omo-atlas`（T16 先例，见
 *      ulw-execute/identity.ts 与 ../prometheus-md-only.ts 的实测边界）；
 *   ② 意图面 = 该子会话收到的**任务文本**命中下表任一 marker。
 *
 * 意图 marker 表是**受控收窄**，不是穷举：向上游 Phase 4 模板的语义取齐
 * （"start the work session" / "start-work" / "ulw-execute"），并保留计划名
 * 清洗用的 `ultrawork`/`ulw` 关键词（parse-user-request.ts:1）。命中即注入；
 * 未命中 = 不注入（绝不"对所有人触发"，与 T16 的降级方向一致）。
 */
export const WORK_INTENT_MARKERS: readonly string[] = [
  // 上游模板 headers / 命令名（Phase 4 对接后这两条必然命中）
  'start an atlas work session',
  'atlas work session',
  'start-work',
  'ulw-execute',
  // 上游模板 "WHAT TO DO" / "CRITICAL" 段的执行意图措辞
  'start work',
  'start the work',
  'begin execution',
  'start executing',
  'execute the plan',
  'execute this plan',
  'work the plan',
  'work on the plan',
  'continue from the first unchecked task',
  // parse-user-request.ts:1 的 `ultrawork|ulw` 关键词（计划名清洗词，同时是最
  // 原始的工作请求措辞）
  'ultrawork',
  'ulw',
]

/** 上游 parse-user-request.ts:1 `KEYWORD_PATTERN`，逐字（计划名清洗）。 */
export const KEYWORD_PATTERN = /\b(ultrawork|ulw)\b/gi

/** 上游 parse-user-request.ts:2 `WORKTREE_FLAG_PATTERN`，逐字。 */
export const WORKTREE_FLAG_PATTERN = /--worktree(?:\s+(\S+))?/

/** 上游 parse-user-request.ts:3 `MAKE_PR_FLAG_PATTERN`，逐字。 */
export const MAKE_PR_FLAG_PATTERN = /--make-pr\b/

/** 上游 parse-user-request.ts:4 `SHIP_FLAG_PATTERN`，逐字。 */
export const SHIP_FLAG_PATTERN = /--ship\b/

/** 上游 parse-user-request.ts:5 `WRAPPING_QUOTES_PATTERN`，逐字。 */
export const WRAPPING_QUOTES_PATTERN = /^(["'`])([\s\S]*)\1$/

/** 上游 `<user-request>` 标签解析正则（parse-user-request.ts:22），逐字。 */
export const USER_REQUEST_TAG_PATTERN = /<user-request>\s*([\s\S]*?)\s*<\/user-request>/i

// ── notepad 脚手架（上游 notepad-scaffold.ts:7-32） ─────────────────────────

/** 上游 notepad-scaffold.ts:7-12 `NOTEPAD_FILES`，逐字。 */
export const NOTEPAD_FILES: readonly string[] = [
  'learnings.md',
  'decisions.md',
  'issues.md',
  'problems.md',
]

/** 上游 notepad-scaffold.ts:16-21 `NOTEPAD_PURPOSES`，逐字。 */
export const NOTEPAD_PURPOSES: Readonly<Record<string, string>> = {
  'learnings.md': 'Conventions, patterns, and successful approaches discovered during work on this plan.',
  'decisions.md': 'Architectural choices and rationales discovered during work on this plan.',
  'issues.md': 'Problems and gotchas encountered during work on this plan.',
  'problems.md': 'Unresolved blockers and technical debt discovered during work on this plan.',
}

/** 上游 notepad-scaffold.ts:23-28 `NOTEPAD_LABELS`，逐字。 */
export const NOTEPAD_LABELS: Readonly<Record<string, string>> = {
  'learnings.md': 'Learnings',
  'decisions.md': 'Decisions',
  'issues.md': 'Issues',
  'problems.md': 'Problems',
}

/**
 * 上游 notepad-scaffold.ts:30-31 `NOTEPAD_FOOTER`，**命名锚点改写**：上游原文
 * 是 `_Auto-scaffolded by /start-work. Append new entries below - never
 * overwrite._`；本移植写 `ulw-execute`，且**不写 `/` 前缀**——`/ulw-execute`
 * 是 Phase 4 的 slash 命令，本阶段不存在该命令，写出一个不存在的命令引用会
 * 误导（prometheus-md-only 的 D 半先例，同一处置）。
 */
export const NOTEPAD_FOOTER =
  '_Auto-scaffolded by ulw-execute. Append new entries below - never overwrite._'

/** 上游 footer 原文，仅作审计。 */
export const UPSTREAM_NOTEPAD_FOOTER =
  '_Auto-scaffolded by /start-work. Append new entries below - never overwrite._'

/** notepad 目录：上游 BOULDER_DIR/NOTEPAD_DIR（`.omo/notepads`）。 */
export const NOTEPAD_DIR_SEGMENTS: readonly string[] = ['.omo', 'notepads']

// ── 计划文件位置（上游 boulder-state constants.ts） ───────────────────────────

/** 上游 `PROMETHEUS_PLANS_DIR = ".omo/plans"`，逐字。 */
export const PROMETHEUS_PLANS_DIR = '.omo/plans'

/** 上游 `LEGACY_PROMETHEUS_PLANS_DIR = ".sisyphus/plans"`，逐字（兼容旧布局）。 */
export const LEGACY_PROMETHEUS_PLANS_DIR = '.sisyphus/plans'

/** 计划文件必须的扩展名（上游 findPrometheusPlans 的 `endsWith(".md")`）。 */
export const PLAN_FILE_EXTENSION = '.md'

// ── worktree（上游 worktree-block.ts / worktree-detector.ts） ────────────────

/** 上游 worktree-block.ts:1-13 `createWorktreeActiveBlock` 正文，逐字模板。 */
export const WORKTREE_ACTIVE_TEMPLATE = `
## Worktree Active

**Worktree**: \`$WORKTREE_PATH\`

**CRITICAL - DO NOT FORGET**: You are working inside a git worktree. ALL operations MUST be performed exclusively within this worktree directory.
- Every file read, write, edit, and git operation MUST target paths under: \`$WORKTREE_PATH\`
- When delegating tasks to subagents, you MUST include the worktree path in your delegation prompt so they also operate exclusively within the worktree
- NEVER operate on the main repository directory - always use the worktree path above`

/** 上游 worktree-block.ts:10 / :28 的路径占位符（本移植的文本替换点）。 */
export const WORKTREE_PLACEHOLDER = '$WORKTREE_PATH'

/**
 * 上游 worktree-detector.ts:32 的「worktree 需要手工建立」提示块
 * （start-work-hook.ts:154-157 逐字），命名锚点未涉及命令面，逐字保留。
 */
export const WORKTREE_SETUP_HINT = (path: string): string =>
  `\n**Worktree** (needs setup): \`git worktree add ${path} <branch>\`, then add \`"worktree_path"\` to boulder.json`
