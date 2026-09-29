// ulw-execute/context-builder.ts — P3-T17: the context document the ulw-execute
// listener injects (上游 start-work-hook.ts:167-241 + context-info-builder.ts
// 的整棵判定树 + context-info-formatters.ts + explicit-plan-context.ts)。
//
// Upstream: packages/omo-opencode/src/hooks/start-work/ @ v4.19.4（冻结基线 tag，
//   commit b072d279110bdda2c6ac2525d0d24dc54d16148a；逐文件处置表见
//   ../ulw-execute.ts 头部——本文件对应 context-info-builder.ts /
//   context-info-formatters.ts / explicit-plan-context.ts 三行）。
//   语义移植（非逐字复制）：判定树与文案半照搬，数据面换为调用方给的内存投影
//   （BoulderView / PlanInventory），落盘半改走 ctx.jobs（见 live-state.ts）。
//
// 上游判定树（context-info-builder.ts:24-104）在本文件里被完整重建为**纯函数**：
//
//   buildStartWorkContextInfo(params)
//     ├─ !explicitPlanName && resumeOptions > 1  → buildMultipleActiveWorksContext
//     ├─ !explicitPlanName && resumeOptions == 1 → shouldResumeSingleWorkOption?
//     │                                             ├─ 是 → buildExistingSessionContext
//     │                                             └─ 否 → 继续
//     ├─ !explicitPlanName && resumeOptions == 0 && activeWorks == 0
//     │                                           → buildPlanDiscoveryContext("")
//     └─ buildSelectedContextInfo(...)
//          ├─ explicitPlanName → buildExplicitPlanContext
//          ├─ shouldResumeExistingState → buildExistingSessionContext
//          └─ ""（其余）
//        → shouldDiscoverPlans? → buildPlanDiscoveryContext(contextInfo) : contextInfo
//
// **本移植的两处结构性收窄（逐条登记）**：
//
//   ① `resumeOptions` 的来源。上游 `getWorkResumeOptions(directory)` 从
//      `.omo/boulder.json` 的 `works` 表算出活动/暂停的 work 列表。DSH 没有这张
//      表，`BoulderView.resumeOptions` 因此是**调用方给的内存投影**；
//      `../ulw-execute.ts` 的默认实现是「空列表」（= 没有已知活动 work），
//      于是判定树在 DSH 上通常走「计划发现」这条主干——这正是本阶段要求的
//      「计划发现 / 上下文构建 / 脚手架语义」。
//   ② `existingState` 同理：DSH 侧的合法来源只有「本会话此前已注入过一次」
//      （幂等 marker / 会话内 `WeakMap` 守卫），而不是一个跨会话状态文件。
//   ③ 副作用半（`writeBoulderState` / `appendSessionId` / `ensureNotepadScaffold`）
//      全部经返回值里的 `selectPlan` 字段交给调用方，本文件不做任何 I/O。
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see ../index.ts).
import {
  ULW_EXECUTE_ID,
  WORKTREE_SETUP_HINT,
} from './constants.ts'
import { createPrDeliveryBlock, createWorktreeActiveBlock, type PrDeliveryFlags } from './worktree.ts'
import {
  buildAutoSelectedPlanContextInfoOnly,
  buildExistingSessionContextText,
  buildMissingPlanContext,
  buildMultipleActiveWorksContext,
  buildPlanAlreadyCompleteContext,
  decidePlanDiscovery,
  findPlanByName,
  getPlanName,
  shouldDiscoverPlans,
  shouldResumeExistingState,
  shouldResumeSingleWorkOption,
  type BoulderLikeState,
  type BoulderLikeWorkOption,
  type PlanDiscoveryOutcome,
  type PlanEntry,
  type PlanProgress,
} from './plan-discovery.ts'

/**
 * apply 时预构建的**静态文本块表**（计划书 §4.2 纪律③的可审计形态）：全部串
 * 只依赖模块常量，与工作区、会话、时间无关，因此在 apply() 时构建一次并闭包
 * 持有；事件路径只做字符串拼接。
 *
 * ⚠️ 纪律③的**字面边界**（登记在案）：`context-info-formatters` 的四段文案
 * **本质上包含运行期事实**（计划名/路径/进度/时间戳/会话 id），不可能在 apply
 * 时完全预构建——上游自己也用 `$SESSION_ID` / `$TIMESTAMP` 占位符在运行期替换
 * （start-work-hook.ts:25 `RUNTIME_PLACEHOLDER_PATTERN`）。本移植的处置：
 * **凡是不含运行期事实的长句与标题块**（"## No Plans Found" 段、worktree 块、
 * PR 交付块、notepad 头部）在 apply 时构建；**含事实的行**在事件路径上由纯函数
 * 拼装。事件路径上**没有读盘**（这是纪律③真正要防的：I/O 与不可预期的延迟）。
 */
export interface StaticTextBlocks {
  /** notepad 头部的三行结构（标题行留 `$PLAN_NAME` 占位）。 */
  readonly notepadHeaderTemplate: string
  /** `## No Plans Found` 段（`decidePlanDiscovery` 直接内联，这里留作审计锚点）。 */
  readonly noPlansBlock: string
  /** worktree 主动块模板（`$WORKTREE_PATH` 占位）。 */
  readonly worktreeActiveTemplate: string
  /** PR 交付块（四个 flag 形态各一份，避免事件路径分支）。 */
  readonly prDelivery: Readonly<Record<'none' | 'makePr' | 'ship', string>>
}

/**
 * Builds {@link StaticTextBlocks}. Called ONCE by the registrar; every field is
 * a pure function of module constants (no directory, no session, no clock).
 */
export function buildStaticTextBlocks(): StaticTextBlocks {
  const flagsOf = (makePr: boolean, ship: boolean): PrDeliveryFlags => ({ makePr, ship })
  return {
    notepadHeaderTemplate: '# $LABEL \u2014 $PLAN_NAME',
    noPlansBlock: `
## No Plans Found

 No Prometheus plan files found in the .omo plans directory.
 Use the Prometheus agent to create a work plan first.`,
    worktreeActiveTemplate: createWorktreeActiveBlock('$WORKTREE_PATH'),
    prDelivery: {
      none: createPrDeliveryBlock(flagsOf(false, false), undefined),
      makePr: createPrDeliveryBlock(flagsOf(true, false), undefined),
      ship: createPrDeliveryBlock(flagsOf(false, true), undefined),
    },
  }
}

/**
 * 本 hook 需要的**内存投影**：上游 `readBoulderState` / `getActiveWorks` /
 * `getWorkResumeOptions` 三个读面的 DSH 等价物。全部由调用方在事件路径上从
 * **会话内**数据构造（不是磁盘）——见 ../ulw-execute.ts 的
 * `readBoulderView`。
 */
export interface BoulderView {
  /** 上游 `readBoulderState(directory)`：活动 work 的镜像状态。 */
  readonly existingState: BoulderLikeState | null
  /** 上游 `getActiveWorks(directory)`：未完成/未放弃的 work 列表。 */
  readonly activeWorks: readonly BoulderLikeWorkOption[]
  /** 上游 `getWorkResumeOptions(directory).filter(status ∈ {active, paused})`。 */
  readonly resumeOptions: readonly BoulderLikeWorkOption[]
}

/** 空的 boulder 投影：DSH 默认（没有 `.omo/boulder.json` 读者）。 */
export const EMPTY_BOULDER_VIEW: BoulderView = {
  existingState: null,
  activeWorks: [],
  resumeOptions: [],
}

/**
 * 计划选择的**副作用描述**：调用方（registrar）据此注册 `ctx.jobs` work session
 * 并写 notepad 脚手架（上游 `createNewWorkOrInitialize` /
 * `buildAutoSelectedPlanContextWithStateInit` 的副作用半）。
 */
export interface PlanSelection {
  readonly planPath: string
  /** 上游 `writeBoulderState` 的 agent 字段。 */
  readonly activeAgent: string
  /** 上游 `reason`（仅自动选中的偏好计划分支有）。 */
  readonly reason?: string
  /** 上游的两条调用点（决定 job label 与日志措辞）。 */
  readonly source: 'explicit-plan' | 'plan-discovery'
}

/** {@link buildWorkContextDocument} 的输入：全部已是叶子值。 */
export interface WorkContextParams {
  readonly blocks: StaticTextBlocks
  readonly sessionId: string
  readonly timestamp: string
  /** 会话的工作区根（上游 `ctx.directory`；DSH = `session.header.cwd`）。 */
  readonly directory: string
  /** 上游 `activeAgent`：本移植恒为 `'atlas'`（激活目标）。 */
  readonly activeAgent: string
  /** apply 时算好的计划清单（**无读盘**）。 */
  readonly inventory: readonly PlanEntry[]
  readonly explicitPlanName: string | null
  readonly explicitWorktreePath: string | null
  readonly makePr: boolean
  readonly ship: boolean
  readonly preferredPlanPath: string | null
  readonly boulder: BoulderView
  /**
   * 上游 `detectWorktreePath(explicitWorktreePath)` 的等价物：DSH 侧由调用方
   * 提供一个**同步、无 I/O 的校验器**（默认 = 「路径非空即接受」，见
   * ../ulw-execute.ts 的跳过段：git worktree 探测不移植）。返回
   * `undefined` 表示未通过校验 → 走「needs setup」提示块。
   */
  readonly validateWorktree: (candidate: string) => string | undefined
}

/** {@link buildWorkContextDocument} 的结果。 */
export interface WorkContextResult {
  /** 要注入的上下文文档；空串 = 「没有可注入的内容」。 */
  readonly text: string
  /** 需要初始化（notepad + jobs）的计划选择；`undefined` = 本趟无副作用。 */
  readonly selectPlan: PlanSelection | undefined
  /** 上游 `buildStartWorkContextInfo` 的分支名（单测/日志的可观测面）。 */
  readonly branch: string
}

/**
 * 上游 `resolveWorktreeContext`（start-work-hook.ts:141-158）的等价物，逐字：
 * 未指定 `--worktree` → `{undefined, ""}`；校验通过 → 用 active block；
 * 校验失败 → 走 `needs setup` 提示块。
 */
export function resolveWorktreeContext(
  explicitWorktreePath: string | null,
  validate: (candidate: string) => string | undefined,
): { worktreePath: string | undefined; block: string } {
  if (explicitWorktreePath === null) {
    return { worktreePath: undefined, block: '' }
  }
  const validatedPath = validate(explicitWorktreePath)
  if (validatedPath) {
    return { worktreePath: validatedPath, block: createWorktreeActiveBlock(validatedPath) }
  }
  return { worktreePath: undefined, block: WORKTREE_SETUP_HINT(explicitWorktreePath) }
}

/**
 * 上游 `buildStartWorkContextInfo`（context-info-builder.ts:18-104）整棵判定树，
 * 纯函数版。分支名进 {@link WorkContextResult.branch}，便于单测对上游的
 * 「哪条分支」而不是只对文案断言。
 */
export function buildWorkContextDocument(params: WorkContextParams): WorkContextResult {
  const {
    blocks,
    sessionId,
    timestamp,
    directory,
    activeAgent,
    inventory,
    explicitPlanName,
    explicitWorktreePath,
    makePr,
    ship,
    preferredPlanPath,
    boulder,
    validateWorktree,
  } = params

  const { worktreePath, block } = resolveWorktreeContext(explicitWorktreePath, validateWorktree)
  const prFlags: 'none' | 'makePr' | 'ship' = ship ? 'ship' : makePr ? 'makePr' : 'none'
  // 上游 start-work-hook.ts:161-162：`block + createPrDeliveryBlock(flags, worktreePath)`。
  // 本移植的静态表只预构建了 `worktreePath === undefined` 的三种 flag 形态；有
  // 具体 worktree 路径时 `createPrDeliveryBlock` 的第一条指令不同，故在这种情况下
  // 现算一次（纯字符串，无 I/O）。
  const worktreeBlock = worktreePath === undefined
    ? block + blocks.prDelivery[prFlags]
    : block + createPrDeliveryBlock({ makePr, ship }, worktreePath)

  const resumeOptions = boulder.resumeOptions

  // ── 分支 1：多活动 work → 询问（上游 :47-53） ─────────────────────────────
  if (!explicitPlanName && resumeOptions.length > 1) {
    return {
      branch: 'multiple-active-works',
      text: buildMultipleActiveWorksContext({ resumeOptions, sessionId, timestamp }),
      selectPlan: undefined,
    }
  }

  // ── 分支 2：恰好一个活动 work 且偏好计划允许 → 续接（上游 :55-70） ────────
  if (!explicitPlanName && resumeOptions.length === 1) {
    const onlyOption = resumeOptions[0]
    if (shouldResumeSingleWorkOption({ option: onlyOption, preferredPlanPath, allPlans: inventory })) {
      const selectedState = boulder.existingState
      if (selectedState) {
        const planPath = selectedState.activePlan
        const progress = selectedState.activePlanProgress
        return {
          branch: 'resume-single-work',
          text: buildExistingSessionContextText({
            existingState: selectedState,
            planPath,
            progress,
            sessionId,
            worktreePath,
            worktreeBlock,
            createWorktreeBlock: createWorktreeActiveBlock,
          }),
          selectPlan: {
            planPath,
            activeAgent,
            source: 'plan-discovery',
          },
        }
      }
    }
  }

  // ── 分支 3：无活动 work / 无续接选项 → 直接计划发现（上游 :72-83） ────────
  if (!explicitPlanName && resumeOptions.length === 0 && boulder.activeWorks.length === 0) {
    return finishDiscovery(decidePlanDiscovery({
      contextInfo: '',
      sessionId,
      timestamp,
      worktreeBlock,
      allPlans: inventory,
      preferredPlanPath,
    }), activeAgent)
  }

  // ── 分支 4：buildSelectedContextInfo（上游 :85-103） ──────────────────────
  const selected = buildSelectedContextInfo({
    explicitPlanName,
    existingState: boulder.existingState,
    sessionId,
    timestamp,
    activeAgent,
    worktreePath,
    worktreeBlock,
    inventory,
    preferredPlanPath,
  })

  if (shouldDiscoverPlans({ existingState: boulder.existingState, explicitPlanName, preferredPlanPath })) {
    return finishDiscovery(decidePlanDiscovery({
      contextInfo: selected.text,
      sessionId,
      timestamp,
      worktreeBlock,
      allPlans: inventory,
      preferredPlanPath,
    }), activeAgent, selected.selection)
  }

  return {
    branch: selected.branch,
    text: selected.text,
    selectPlan: selected.selection,
  }
}

/**
 * 上游 `buildSelectedContextInfo`（context-info-builder.ts:106-157），逐字：
 *   * `explicitPlanName` → `buildExplicitPlanContext`（本文件内联）；
 *   * `shouldResumeExistingState && existingState` → `buildExistingSessionContext`；
 *   * 其余 → `""`（上游在「存在但与本会话无关的活动 state」时只打一行 log，
 *     本移植把该 log 交给调用方——listener 的统一日志口）。
 */
function buildSelectedContextInfo(params: {
  readonly explicitPlanName: string | null
  readonly existingState: BoulderLikeState | null
  readonly sessionId: string
  readonly timestamp: string
  readonly activeAgent: string
  readonly worktreePath: string | undefined
  readonly worktreeBlock: string
  readonly inventory: readonly PlanEntry[]
  readonly preferredPlanPath: string | null
}): { branch: string; text: string; selection: PlanSelection | undefined } {
  const {
    explicitPlanName,
    existingState,
    sessionId,
    timestamp,
    activeAgent,
    worktreePath,
    worktreeBlock,
    inventory,
    preferredPlanPath,
  } = params

  if (explicitPlanName) {
    return buildExplicitPlanContext({
      explicitPlanName,
      sessionId,
      timestamp,
      activeAgent,
      worktreePath,
      worktreeBlock,
      inventory,
    })
  }

  if (shouldResumeExistingState({ existingState, preferredPlanPath }) && existingState) {
    return {
      branch: 'resume-existing-state',
      text: buildExistingSessionContextText({
        existingState,
        planPath: existingState.activePlan,
        progress: existingState.activePlanProgress,
        sessionId,
        worktreePath,
        worktreeBlock,
        createWorktreeBlock: createWorktreeActiveBlock,
      }),
      selection: {
        planPath: existingState.activePlan,
        activeAgent,
        source: 'plan-discovery',
      },
    }
  }

  return { branch: 'ignored-unrelated-state', text: '', selection: undefined }
}

/**
 * 上游 `buildExplicitPlanContext`（explicit-plan-context.ts:11-95）的移植：
 * 上游四级里 **①级是分支级跳过段**（登记为 S-4，理由见下），本实现逐条落地 ②③④。
 *
 *   ① **跳过段（S-4，未实现但已登记、不静默吞）** work 名命中：上游用
 *      `getWorkByPlanName`（`plan_name === explicitPlanName` **全等**）在**活动
 *      work 注册表**里找同名 work，命中且已完成 → "Plan Already Complete"，
 *      否则**续接**该 work。本移植的 `BoulderView` 投影（:110-121 +
 *      ../ulw-execute.ts 的 `readBoulderView`）恒为 `EMPTY_BOULDER_VIEW`
 *      （无已知活动 work），既无 work 列表也无 `plan_name` 索引，故这一级
 *      **当前不可达**（无实际行为差）。⚠️ **接上非空 boulder 投影时必须先补
 *      此项**，否则「显式计划名命中活动 work」会错误走「新建」而非「续接」。
 *   ② 计划文件模糊匹配（`findPlanByName`）失败：
 *        * 恰好一个未完成计划 → 自动选它（建 work + 脚手架）+ 带 reason 文案；
 *        * 否则 → `buildMissingPlanContext`；
 *   ③ 命中的计划已完成 → "Plan Already Complete"；
 *   ④ 否则建 work + 脚手架 + 自动选中文案。
 *
 * ⚠️ **上游语义的忠实保留（不是 bug 修复）**：上游 ① 的 `plan_name ===
 * explicitPlanName` 是**全等**匹配，而 `explicitPlanName` 来自用户原文（可能含
 * 空格/大小写差异），故 ① 在模糊输入上通常不命中，上游判定落到 ②。本移植的 ②
 * 逐字保留该行为（上游测试也钉死了 ② 的模糊路径），不擅自加归一化。
 */
function buildExplicitPlanContext(params: {
  readonly explicitPlanName: string
  readonly sessionId: string
  readonly timestamp: string
  readonly activeAgent: string
  readonly worktreePath: string | undefined
  readonly worktreeBlock: string
  readonly inventory: readonly PlanEntry[]
}): { branch: string; text: string; selection: PlanSelection | undefined } {
  const {
    explicitPlanName,
    sessionId,
    timestamp,
    activeAgent,
    worktreePath,
    worktreeBlock,
    inventory,
  } = params

  const allPlans = inventory
  const matchedPlan = findPlanByName(allPlans.map((entry) => entry.path), explicitPlanName)
  if (!matchedPlan) {
    const incompletePlans = allPlans.filter((entry) => !entry.progress.isComplete)
    if (incompletePlans.length === 1) {
      const onlyPlan = incompletePlans[0]
      return {
        branch: 'explicit-plan-fallback-single-incomplete',
        text: buildAutoSelectedPlanContextInfoOnly({
          planPath: onlyPlan.path,
          planProgress: onlyPlan.progress,
          sessionId,
          timestamp,
          worktreeBlock,
          reason: `Only incomplete plan available after "${explicitPlanName}" did not match any plan`,
        }),
        selection: {
          planPath: onlyPlan.path,
          activeAgent,
          reason: `Only incomplete plan available after "${explicitPlanName}" did not match any plan`,
          source: 'explicit-plan',
        },
      }
    }
    return {
      branch: 'explicit-plan-missing',
      text: buildMissingPlanContext(explicitPlanName, allPlans),
      selection: undefined,
    }
  }

  const matchedEntry = allPlans.find((entry) => entry.path === matchedPlan)
  const progress = matchedEntry?.progress ?? { total: 0, completed: 0, isComplete: false }
  if (progress.isComplete) {
    return {
      branch: 'explicit-plan-complete',
      text: buildPlanAlreadyCompleteContext(getPlanName(matchedPlan), progress.total),
      selection: undefined,
    }
  }

  return {
    branch: 'explicit-plan-auto-selected',
    text: buildAutoSelectedPlanContextInfoOnly({
      planPath: matchedPlan,
      planProgress: progress,
      sessionId,
      timestamp,
      worktreeBlock,
    }),
    selection: {
      planPath: matchedPlan,
      activeAgent,
      source: 'explicit-plan',
    },
  }
}

/**
 * 把 `decidePlanDiscovery` 的纯结果翻成 {@link WorkContextResult}：`auto-selected`
 * 分支同时产出一个 `selectPlan`（上游那个分支顺带 `writeBoulderState` +
 * `ensureNotepadScaffold`）。若上层已有一个 selection（`buildSelectedContextInfo`
 * 的续接分支），**它优先**——上游 `buildPlanDiscoveryContext` 只在
 * `contextInfo` 之后追加文案，副作用由选定分支承担。
 */
function finishDiscovery(
  outcome: PlanDiscoveryOutcome,
  activeAgent: string,
  inherited: PlanSelection | undefined = undefined,
): WorkContextResult {
  switch (outcome.kind) {
    case 'no-plans':
      return { branch: 'discovery-no-plans', text: outcome.text, selectPlan: inherited }
    case 'all-complete':
      return { branch: 'discovery-all-complete', text: outcome.text, selectPlan: inherited }
    case 'ask':
      return { branch: 'discovery-ask', text: outcome.text, selectPlan: inherited }
    case 'auto-selected':
      return {
        branch: 'discovery-auto-selected',
        text: outcome.text,
        selectPlan: inherited ?? {
          planPath: outcome.planPath,
          activeAgent,
          reason: outcome.reason,
          source: 'plan-discovery',
        },
      }
  }
}

/** 本模块的渲染前后缀（注入文本的可 grep 锚点，见 constants.ts 的 marker）。 */
export function describeBranchForLog(branch: string): string {
  return `[${ULW_EXECUTE_ID}] context branch: ${branch}`
}
