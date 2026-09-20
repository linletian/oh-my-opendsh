// ulw-execute/plan-discovery.ts — P3-T17: 计划发现与计划选择的核心判定，上游
// 三文件的语义移植（**判定逻辑逐条照搬，数据源换为内存投影**）。
//
// 上游源（packages/omo-opencode/src/hooks/start-work/ @ v4.19.4）：
//   * plan-selection.ts（82 行）           — 计划名归一化/模糊匹配 + 列表格式化 +
//                                            「计划未找到」上下文
//   * plan-discovery-context.ts（131 行）  — 三条 `should*` 判定 + 无计划/全完成/
//                                            多计划/自动选四条上下文
//   * features/boulder-state/src/plan-checklist.ts（181 行，**hooks/ 之外**） —
//                                            计划 markdown 的 checkbox 计数
//                                            （`parsePlanChecklist`）——计划进度的
//                                            唯一真实来源；本移植**逐行照搬**
//                                            （含 fence 跳过、结构化/简单两种模式）
//
// ⚠️ **数据源替换（本移植最关键的一处收窄）**：上游全部判定都经 `boulder-state`
// 的磁盘读取（`readBoulderState` / `getWorkResumeOptions` / `selectActiveWork` /
// `getActiveWorks` / `getWorkByPlanName` / `addBoulderWork` …）。DSH 没有
// `.omo/boulder.json` 这套跨会话工作表，本模块因此把这些函数的**输入**改成一份
// 已算好的内存投影 `BoulderView`（见 ../ulw-execute/live-state.ts 与
// ../ulw-execute.ts 的两侧：apply 时的静态半 + 事件路径的会话内半）。
// 逐条对应关系与「跳过段」理由见 ../ulw-execute.ts 头部表格。
//
// 所有函数均为**纯函数**（无 I/O、无 Date.now、无 fs），因此可在事件路径上调用；
// 时间戳一律由调用方作为参数传入（上游同形）。
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see ../index.ts).

/** 计划进度（上游 boulder-state `PlanProgress`，types.ts，逐字）。 */
export interface PlanProgress {
  readonly total: number
  readonly completed: number
  readonly isComplete: boolean
}

/** 空 checklist（上游 plan-checklist.ts:178-180 `emptyChecklist`，逐字）。 */
export function emptyChecklist(): { completed: number; remaining: number; total: number; nextTaskLabel: string | null } {
  return { completed: 0, remaining: 0, total: 0, nextTaskLabel: null }
}

// ── 上游 plan-checklist.ts 的逐行照搬（fence / 结构化 / 简单三态） ────────────

const SIMPLE_CHECKBOX_PATTERN = /^[-*][ \t]*\[[ \t]*([xX]?)[ \t]*\][ \t]+(.+)$/
const TODO_HEADING_PATTERN = /^##[ \t]+TODOs(?:[ \t]+#+)?[ \t]*$/i
const FINAL_VERIFICATION_HEADING_PATTERN = /^##[ \t]+Final Verification Wave(?:[ \t]+#+)?[ \t]*$/i
const SECTION_BOUNDARY_HEADING_PATTERN = /^#{1,2}(?:[ \t]+|$)/
const FENCE_PATTERN = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/
const TODO_CHECKBOX_PATTERN = /^- \[([ xX])\] ([1-9]\d*\. .+)$/
const FINAL_WAVE_CHECKBOX_PATTERN = /^- \[([ xX])\] (F[1-9]\d*\. .+)$/i

type ChecklistSection = 'todo' | 'final-wave' | 'other'

interface MarkdownFence {
  readonly marker: '`' | '~'
  readonly length: number
}

/**
 * 上游 `parsePlanChecklist`（plan-checklist.ts:56-63），逐字：结构化段落优先
 * （`## TODOs` / `## Final Verification Wave` 两条标题），否则退化为「任意层级
 * checkbox 计数」的简单模式。代码块（``` / ~~~ fence）内的 checkbox 不计。
 */
export function parsePlanChecklist(markdown: string): {
  completed: number
  remaining: number
  total: number
  nextTaskLabel: string | null
} {
  const lines = markdown.split(/\r?\n/)
  if (!hasStructuredSection(lines)) {
    return parseSimpleChecklist(lines)
  }
  return parseStructuredPlan(lines).checklist
}

/**
 * 上游 `hasStructuredSection`（plan-checklist.ts:151-168），逐字。
 */
function hasStructuredSection(lines: readonly string[]): boolean {
  let fence: MarkdownFence | null = null
  for (const line of lines) {
    if (fence !== null) {
      if (isClosingFence(line, fence)) fence = null
      continue
    }
    const openingFence = parseOpeningFence(line)
    if (openingFence !== null) {
      fence = openingFence
      continue
    }
    if (parseStructuredSectionHeading(line) !== 'other') return true
  }
  return false
}

/** 上游 `parseStructuredSectionHeading`（plan-checklist.ts:170-178），逐字。 */
function parseStructuredSectionHeading(line: string): ChecklistSection {
  if (TODO_HEADING_PATTERN.test(line)) return 'todo'
  if (FINAL_VERIFICATION_HEADING_PATTERN.test(line)) return 'final-wave'
  return 'other'
}

/**
 * 上游 `parseStructuredPlan` 的计数半（plan-checklist.ts:65-116 的 `checklist`
 * 字段）。上游同一函数还产出 `nextTask`（TopLevelTaskRef），其唯一消费者是
 * atlas hook（H-25，Phase 5 deferred）——本移植**不产出**该字段并登记为收窄：
 * 没有消费者，产出即死代码。
 */
function parseStructuredPlan(lines: readonly string[]): {
  checklist: { completed: number; remaining: number; total: number; nextTaskLabel: string | null }
} {
  let remaining = 0
  let total = 0
  let nextTaskLabel: string | null = null
  let section: ChecklistSection = 'other'
  let fence: MarkdownFence | null = null

  for (const line of lines) {
    if (fence !== null) {
      if (isClosingFence(line, fence)) fence = null
      continue
    }
    const openingFence = parseOpeningFence(line)
    if (openingFence !== null) {
      fence = openingFence
      continue
    }
    if (SECTION_BOUNDARY_HEADING_PATTERN.test(line)) {
      section = parseStructuredSectionHeading(line)
      continue
    }
    if (section === 'other') continue

    const checkbox = parseStructuredTopLevelCheckbox(line, section)
    if (checkbox === null) continue

    total += 1
    if (checkbox.checked) continue

    remaining += 1
    if (nextTaskLabel === null) nextTaskLabel = checkbox.label
  }

  return {
    checklist: { completed: total - remaining, remaining, total, nextTaskLabel },
  }
}

/** 上游 `parseStructuredTopLevelCheckbox`（plan-checklist.ts:180-196）的判定半。 */
function parseStructuredTopLevelCheckbox(
  line: string,
  section: 'todo' | 'final-wave',
): { checked: boolean; label: string } | null {
  const pattern = section === 'todo' ? TODO_CHECKBOX_PATTERN : FINAL_WAVE_CHECKBOX_PATTERN
  const match = line.match(pattern)
  const marker = match?.[1]
  const label = match?.[2]
  if (marker === undefined || label === undefined) return null
  return { checked: marker.toLowerCase() === 'x', label }
}

/** 上游 `parseSimpleChecklist`（plan-checklist.ts:118-149），逐字。 */
function parseSimpleChecklist(lines: readonly string[]): {
  completed: number
  remaining: number
  total: number
  nextTaskLabel: string | null
} {
  let remaining = 0
  let total = 0
  let nextTaskLabel: string | null = null
  let fence: MarkdownFence | null = null

  for (const line of lines) {
    if (fence !== null) {
      if (isClosingFence(line, fence)) fence = null
      continue
    }
    const openingFence = parseOpeningFence(line)
    if (openingFence !== null) {
      fence = openingFence
      continue
    }
    const checkbox = parseSimpleTopLevelCheckbox(line)
    if (checkbox === null) continue

    total += 1
    if (checkbox.checked) continue

    remaining += 1
    if (nextTaskLabel === null) nextTaskLabel = checkbox.label
  }

  return { completed: total - remaining, remaining, total, nextTaskLabel }
}

/** 上游 `parseSimpleTopLevelCheckbox`（plan-checklist.ts:144-152），逐字。 */
function parseSimpleTopLevelCheckbox(line: string): { checked: boolean; label: string } | null {
  const match = line.match(SIMPLE_CHECKBOX_PATTERN)
  const marker = match?.[1]
  const label = match?.[2]
  if (marker === undefined || label === undefined) return null
  return { checked: marker.toLowerCase() === 'x', label }
}

/** 上游 `parseOpeningFence`（plan-checklist.ts:186-201），逐字。 */
function parseOpeningFence(line: string): MarkdownFence | null {
  const match = line.match(FENCE_PATTERN)
  const run = match?.[1]
  const info = match?.[2]
  const marker = run?.charAt(0)
  if (
    run === undefined
    || info === undefined
    || (marker !== '`' && marker !== '~')
    || (marker === '`' && info.includes('`'))
  ) {
    return null
  }
  return { marker, length: run.length }
}

/** 上游 `isClosingFence`（plan-checklist.ts:203-206），逐字。 */
function isClosingFence(line: string, fence: MarkdownFence): boolean {
  const run = line.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/)?.[1]
  return run?.charAt(0) === fence.marker && run.length >= fence.length
}

/**
 * 上游 `getPlanProgress`（boulder-state plan-progress.ts:35-51）的纯形式：上游
 * 在这里读盘 + `parsePlanChecklist`；本移植把「读」交给调用方（计划清单已在
 * 内存里），只保留计数与 `isComplete` 的定义，逐字：
 *   `isComplete = total > 0 && remaining === 0`
 */
export function planProgressFromMarkdown(markdown: string): PlanProgress {
  const checklist = parsePlanChecklist(markdown)
  return {
    total: checklist.total,
    completed: checklist.completed,
    isComplete: checklist.total > 0 && checklist.remaining === 0,
  }
}

/** 上游 `getPlanProgress` 在文件缺失/读取失败时的返回值（plan-progress.ts:36-38），逐字。 */
export const EMPTY_PLAN_PROGRESS: PlanProgress = { total: 0, completed: 0, isComplete: false }

// ── 上游 plan-selection.ts ───────────────────────────────────────────────────

/** 上游 `getPlanName`（boulder-state plan-progress.ts:31-33）：basename 去 `.md`。 */
export function getPlanName(planPath: string): string {
  const normalized = planPath.replace(/\\/g, '/')
  const base = normalized.slice(normalized.lastIndexOf('/') + 1)
  return base.endsWith('.md') ? base.slice(0, -'.md'.length) : base
}

/**
 * 上游 `normalizePlanLookupValue`（plan-selection.ts:4-14），逐字：trim →
 * 剥离包裹引号 → lower → 空白/下划线→`-` → 非字母数字→`-` → 折叠连字符。
 * `\p{L}\p{N}` 的 Unicode 语义原样保留（中文计划名可用）。
 */
export function normalizePlanLookupValue(value: string): string {
  return value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * 上游 `findPlanByName`（plan-selection.ts:15-38），逐字四级匹配：
 *   ① 名称小写全等 → ② 归一化全等 → ③ 名称小写子串 → ④ 归一化子串。
 * 顺序即优先级，任一级命中即返回（上游 `find` 取首个）。
 */
export function findPlanByName(plans: readonly string[], requestedName: string): string | null {
  const lowerName = requestedName.toLowerCase()
  const normalizedRequestedName = normalizePlanLookupValue(requestedName)
  const exactMatch = plans.find((planPath) => getPlanName(planPath).toLowerCase() === lowerName)
  if (exactMatch) return exactMatch

  const normalizedExactMatch = plans.find(
    (planPath) => normalizePlanLookupValue(getPlanName(planPath)) === normalizedRequestedName,
  )
  if (normalizedExactMatch) return normalizedExactMatch

  const partialMatch = plans.find((planPath) => getPlanName(planPath).toLowerCase().includes(lowerName))
  if (partialMatch) return partialMatch

  return (
    plans.find((planPath) =>
      normalizePlanLookupValue(getPlanName(planPath)).includes(normalizedRequestedName),
    ) ?? null
  )
}

/**
 * 上游 `pickPreferredIncompletePlan`（plan-selection.ts:40-49），逐字：偏好计划
 * 必须**逐字命中**未完成计划列表中的某一项（`===`，非模糊）。
 */
export function pickPreferredIncompletePlan(
  incompletePlans: readonly string[],
  preferredPlanPath: string | null,
): string | null {
  if (!preferredPlanPath) return null
  return incompletePlans.find((planPath) => planPath === preferredPlanPath) ?? null
}

/**
 * 上游 `formatIncompletePlanList`（plan-selection.ts:51-66）的**收窄形态**：上游
 * 的 `includeModifiedTime` 分支会 `statSync(planPath).mtimeMs` 读盘，按纪律③
 * （事件路径无读盘）本移植**不读盘**，mtime 由调用方在 `PlanEntry.modifiedAt`
 * 里带上（apply 时读一次或缺失为 `undefined`）。`undefined` 时该行省略
 * ` - Modified: …`，与上游 `includeModifiedTime=false` 分支同形。
 *
 * ⚠️ 与上游的**唯一格式差异**（登记在案）：上游用 `new Date(mtimeMs).toISOString()`，
 * 本移植直接用调用方给的 ISO 串——同一显示语义，少一层时间格式耦合。
 */
export function formatIncompletePlanList(
  plans: readonly PlanEntry[],
  includeModifiedTime: boolean,
): string {
  return plans
    .map((entry, index) => {
      const modified = includeModifiedTime && entry.modifiedAt !== undefined
        ? ` - Modified: ${entry.modifiedAt}`
        : ''
      return `${index + 1}. [${getPlanName(entry.path)}]${modified} - Progress: `
        + `${entry.progress.completed}/${entry.progress.total}`
    })
    .join('\n')
}

/**
 * 一条计划的内存投影：路径 + 进度 + 可选的 mtime ISO 串（见
 * `formatIncompletePlanList` 的格式差异说明）。
 */
export interface PlanEntry {
  readonly path: string
  readonly progress: PlanProgress
  readonly modifiedAt?: string
}

/**
 * 上游 `buildMissingPlanContext`（plan-selection.ts:68-82），逐字（含上游正文里
 * 那句前导空格，原样保留——它是上游字符串的一部分，不是本移植的缩进）。
 */
export function buildMissingPlanContext(
  explicitPlanName: string,
  allPlans: readonly PlanEntry[],
): string {
  const incompletePlans = allPlans.filter((entry) => !entry.progress.isComplete)
  if (incompletePlans.length > 0) {
    return `
## Plan Not Found

Could not find a plan matching "${explicitPlanName}".

Available incomplete plans:
${formatIncompletePlanList(incompletePlans, false)}

Ask the user which plan to work on.`
  }

  return `
## Plan Not Found

 Could not find a plan matching "${explicitPlanName}".
 No incomplete plans available. Create a new plan using the Prometheus agent.`
}

// ── 上游 plan-discovery-context.ts 的三条 `should*` ──────────────────────────

/**
 * 上游 `shouldResumeExistingState`（plan-discovery-context.ts:9-27），逐字三条：
 * 无 state → false；活动计划已完成 → false；有偏好计划且与活动计划不同 → false；
 * 否则 true。
 */
export function shouldResumeExistingState(input: {
  readonly existingState: BoulderLikeState | null
  readonly preferredPlanPath: string | null
}): boolean {
  const { existingState, preferredPlanPath } = input
  if (existingState === null) return false
  if (existingState.activePlanProgress.isComplete) return false
  if (preferredPlanPath && existingState.activePlan !== preferredPlanPath) return false
  return true
}

/** 上游 `shouldDiscoverPlans`（plan-discovery-context.ts:29-37），逐字。 */
export function shouldDiscoverPlans(input: {
  readonly existingState: BoulderLikeState | null
  readonly explicitPlanName: string | null
  readonly preferredPlanPath: string | null
}): boolean {
  const { existingState, explicitPlanName, preferredPlanPath } = input
  return !explicitPlanName && !shouldResumeExistingState({ existingState, preferredPlanPath })
}

/**
 * 上游 `shouldResumeSingleWorkOption`（plan-discovery-context.ts:39-56），逐字：
 * 无偏好计划、或该 work 的活动计划就是偏好计划 → true；否则「偏好计划仍是未完成
 * 计划之一」时返回 false（即不自动续接这个 work）。
 *
 * 上游第二支调用 `findPrometheusPlans(directory)` —— 本移植改为读内存投影
 * `allPlans`（同一语义，无读盘）。
 */
export function shouldResumeSingleWorkOption(input: {
  readonly option: BoulderLikeWorkOption
  readonly preferredPlanPath: string | null
  readonly allPlans: readonly PlanEntry[]
}): boolean {
  const { option, preferredPlanPath, allPlans } = input
  if (!preferredPlanPath || option.activePlan === preferredPlanPath) return true
  return !allPlans.some(
    (entry) => entry.path === preferredPlanPath && !entry.progress.isComplete,
  )
}

/**
 * 上游 `buildPlanDiscoveryContext`（plan-discovery-context.ts:58-131）的**四条
 * 分支判定半**。上游同一函数内联了四条文案与「自动选并初始化 state」的副作用；
 * 本移植把判定与文案都收在这里（纯函数），把「初始化」（脚手架/状态写入）留给
 * 调用方 `onPlanSelected` 回调——DSH 侧那个副作用是 `ctx.jobs` 注册，见
 * ../ulw-execute.ts。
 *
 * 返回判别联合，调用方据此决定是否需要初始化回调。
 */
export type PlanDiscoveryOutcome =
  | { readonly kind: 'no-plans'; readonly text: string }
  | { readonly kind: 'all-complete'; readonly text: string; readonly planCount: number }
  | {
    readonly kind: 'auto-selected'
    readonly planPath: string
    readonly reason?: string
    readonly text: string
  }
  | { readonly kind: 'ask'; readonly text: string; readonly incompleteCount: number }

export function decidePlanDiscovery(params: {
  readonly contextInfo: string
  readonly sessionId: string
  readonly timestamp: string
  readonly worktreeBlock: string
  readonly allPlans: readonly PlanEntry[]
  readonly preferredPlanPath: string | null
}): PlanDiscoveryOutcome {
  const { contextInfo, sessionId, timestamp, worktreeBlock, allPlans, preferredPlanPath } = params
  const incompletePlans = allPlans.filter((entry) => !entry.progress.isComplete)
  const preferredIncompletePlan = pickPreferredIncompletePlan(
    incompletePlans.map((entry) => entry.path),
    preferredPlanPath,
  )

  if (allPlans.length === 0) {
    return {
      kind: 'no-plans',
      text: contextInfo + `
## No Plans Found

 No Prometheus plan files found in the .omo plans directory.
 Use the Prometheus agent to create a work plan first.`,
    }
  }

  if (incompletePlans.length === 0) {
    return {
      kind: 'all-complete',
      planCount: allPlans.length,
      text: contextInfo + `

## All Plans Complete

 All ${allPlans.length} plan(s) are complete. Create a new plan using the Prometheus agent.`,
    }
  }

  if (preferredIncompletePlan) {
    return {
      kind: 'auto-selected',
      planPath: preferredIncompletePlan,
      reason: 'Most recently referenced plan in this session',
      text: contextInfo + buildAutoSelectedPlanContextInfoOnly({
        planPath: preferredIncompletePlan,
        planProgress: progressOf(allPlans, preferredIncompletePlan),
        sessionId,
        timestamp,
        worktreeBlock,
        reason: 'Most recently referenced plan in this session',
      }),
    }
  }

  if (incompletePlans.length === 1) {
    const planPath = incompletePlans[0].path
    return {
      kind: 'auto-selected',
      planPath,
      text: contextInfo + buildAutoSelectedPlanContextInfoOnly({
        planPath,
        planProgress: incompletePlans[0].progress,
        sessionId,
        timestamp,
        worktreeBlock,
      }),
    }
  }

  return {
    kind: 'ask',
    incompleteCount: incompletePlans.length,
    text: contextInfo + `

<system-reminder>
## Multiple Plans Found

Current Time: ${timestamp}
Session ID: ${sessionId}

${formatIncompletePlanList(incompletePlans, true)}

Ask the user which plan to work on. Present the options above and wait for their response.
${worktreeBlock}
</system-reminder>`,
  }
}

function progressOf(allPlans: readonly PlanEntry[], planPath: string): PlanProgress {
  return allPlans.find((entry) => entry.path === planPath)?.progress ?? EMPTY_PLAN_PROGRESS
}

/**
 * 本移植对上游 `BoulderState` 的**最小结构镜像**：只保留判定真正读到的叶子。
 * 上游 `BoulderState`（packages/boulder-state/src/types.ts:1-19）有 14 个字段；
 * 本移植用到的只有 `active_plan` / `plan_name` / `started_at` / `session_ids` /
 * `agent` / `worktree_path` / `works` / `active_work_id` —— 其余（`elapsed_ms` /
 * `task_sessions` / `session_origins` / `status` / `updated_at`）的消费者都在
 * 未移植的 atlas hook（H-25，Phase 5）或计时器里，登记为跳过段。
 */
export interface BoulderLikeState {
  readonly activePlan: string
  /** 上游 `plan_name`。 */
  readonly planName: string
  /** 上游 `started_at`（ISO 串）。 */
  readonly startedAt: string
  /** 上游 `session_ids`。 */
  readonly sessionIds: readonly string[]
  /** 上游可选 `agent`。 */
  readonly agent?: string
  /** 上游可选 `worktree_path`。 */
  readonly worktreePath?: string
  /** 活动计划的进度（上游每次 `getPlanProgress(active_plan)` 现算）。 */
  readonly activePlanProgress: PlanProgress
}

/**
 * 本移植对上游 `BoulderWorkResumeOption`（types.ts:52-66）的最小镜像：判定与
 * 「多活动 work」文案真正读到的字段。
 */
export interface BoulderLikeWorkOption {
  readonly workId: string
  readonly planName: string
  readonly activePlan: string
  readonly worktreePath?: string
  readonly status: string
  readonly startedAt: string
  readonly sessionCount: number
  readonly progress: PlanProgress
  readonly elapsedMs?: number
}

/**
 * 上游 `formatElapsedHuman`（context-info-formatters.ts:36-54），逐字。
 */
export function formatElapsedHuman(elapsedMs: number | undefined): string {
  if (typeof elapsedMs !== 'number' || elapsedMs <= 0) {
    return 'running'
  }
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/**
 * 上游 `buildMultipleActiveWorksContext`（context-info-formatters.ts:56-84），
 * 逐字，**唯二人为改写**（命名锚点，P3-T1 §4 表第 1 行）：
 *   上游 `- If the user chooses one option, run /start-work {plan-name} for that plan.`
 *   →     `- If the user chooses one option, run ulw-execute {plan-name} for that plan.`
 * `/ulw-execute`（带斜杠）是 Phase 4 的 slash 命令，本阶段不写（任务书口径）；
 * 去掉斜杠后该句仍是「选择一个计划并据此继续」的可执行指引。
 */
export function buildMultipleActiveWorksContext(params: {
  readonly resumeOptions: readonly BoulderLikeWorkOption[]
  readonly sessionId: string
  readonly timestamp: string
}): string {
  const { resumeOptions, sessionId, timestamp } = params
  const optionList = resumeOptions
    .map((option, index) => {
      const percent = option.progress.total === 0
        ? 0
        : Math.floor((option.progress.completed / option.progress.total) * 100)
      return `${index + 1}. ${option.planName} - ${option.progress.completed}/${option.progress.total} `
        + `(${percent}%) - elapsed: ${formatElapsedHuman(option.elapsedMs)} - worktree: `
        + `${option.worktreePath ?? 'current directory'} - sessions: ${option.sessionCount}`
    })
    .join('\n')

  return `
<system-reminder>
## Multiple Active Works Found

Current Time: ${timestamp}
Session ID: ${sessionId}

${optionList}

Use the Question tool to ask the user which plan to resume.
- If the user chooses one option, run ulw-execute {plan-name} for that plan.
- If the user chooses to start a new plan, proceed with cold-start auto-selection flow.
</system-reminder>`
}

/**
 * 上游 `buildAutoSelectedPlanContextInfoOnly`（context-info-formatters.ts:8-31），
 * 逐字。`**Path**` 行给出绝对路径，`**Progress**` 由调用方算好的进度给出。
 */
export function buildAutoSelectedPlanContextInfoOnly(params: {
  readonly planPath: string
  readonly planProgress: PlanProgress
  readonly sessionId: string
  readonly timestamp: string
  readonly worktreeBlock: string
  readonly reason?: string
}): string {
  const { planPath, planProgress, sessionId, timestamp, worktreeBlock, reason } = params
  const reasonLine = reason ? `**Reason**: ${reason}\n` : ''

  return `
## Auto-Selected Plan

**Plan**: ${getPlanName(planPath)}
**Path**: ${planPath}
**Progress**: ${planProgress.completed}/${planProgress.total} tasks
**Session ID**: ${sessionId}
**Started**: ${timestamp}
${reasonLine}${worktreeBlock}

boulder.json has been created. Read the plan and begin execution.`
}

/**
 * 上游 `buildExistingSessionContext`（context-info-formatters.ts:86-143）的文案
 * 半，逐字（`**Status**: RESUMING existing work` 等六行与结尾句）。上游同一函数
 * 内含三处**状态写入**（`writeBoulderState` / `appendSessionId`）与一处
 * `ensureNotepadScaffold` —— 那部分在 DSH 侧由调用方的 `onPlanSelected` 回调
 * 承载（`ctx.jobs`），本函数保持纯净。
 *
 * `worktreeDisplay` 的判定逐字：有效 worktree 路径存在时用（可能为空的）
 * `worktreeBlock`，否则现建一个 active block——上游 `worktreeBlock || create…`。
 */
export function buildExistingSessionContextText(params: {
  readonly existingState: BoulderLikeState
  readonly planPath: string
  readonly progress: PlanProgress
  readonly sessionId: string
  readonly worktreePath: string | undefined
  readonly worktreeBlock: string
  readonly createWorktreeBlock: (path: string) => string
}): string {
  const {
    existingState,
    planPath,
    progress,
    sessionId,
    worktreePath,
    worktreeBlock,
    createWorktreeBlock,
  } = params
  if (progress.isComplete) {
    return `
## Previous Work Complete

The previous plan (${existingState.planName}) has been completed.
Looking for new plans...`
  }

  const effectiveWorktree = worktreePath ?? existingState.worktreePath
  const worktreeDisplay = effectiveWorktree
    ? worktreeBlock || createWorktreeBlock(effectiveWorktree)
    : worktreeBlock

  return `
## Active Work Session Found

**Status**: RESUMING existing work
**Plan**: ${existingState.planName}
**Path**: ${planPath}
**Progress**: ${progress.completed}/${progress.total} tasks completed
**Sessions**: ${existingState.sessionIds.length + 1} (current session appended)
**Started**: ${existingState.startedAt}
${worktreeDisplay}

The current session (${sessionId}) has been added to session_ids.
Read the plan file and continue from the first unchecked task.`
}

/**
 * 上游 `buildPlanAlreadyCompleteContext`（explicit-plan-context.ts:126-138），
 * 逐字（含正文前导空格）。
 */
export function buildPlanAlreadyCompleteContext(planName: string, totalTasks: number): string {
  return `
## Plan Already Complete

 The requested plan "${planName}" has been completed.
 All ${totalTasks} tasks are done. Create a new plan using the Prometheus agent.`
}
