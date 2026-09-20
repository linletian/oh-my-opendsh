// ulw-execute/live-state.ts — P3-T17: the LIVE halves of the ulw-execute port —
// 计划清单的读面、notepad 脚手架、以及 `ctx.jobs` 存储面。
//
// 上游对应（packages/omo-opencode/src/hooks/start-work/ + features/boulder-state/
// @ v4.19.4）：
//   * boulder-state/src/storage/plan-progress.ts:10-29 `findPrometheusPlans`
//     → {@link readPlanInventory}（同一两目录探测 + `.md` 过滤 + mtime 倒序）
//   * boulder-state/src/storage/plan-progress.ts:35-51 `getPlanProgress`
//     → 本文件的读盘半（解析半在 plan-discovery.ts 的 `planProgressFromMarkdown`）
//   * notepad-scaffold.ts:38-73 `ensureNotepadScaffold`
//     → {@link scaffoldNotepad}（`wx` 幂等 + EEXIST 跳过）
//   * work-initializer.ts:11-32 `createNewWorkOrInitialize` /
//     `buildAutoSelectedPlanContextWithStateInit`
//     → {@link startWorkJob}（`ctx.jobs` 注册面，**存储面替换**）
//   * storage/path.ts（`getBoulderFilePath`）→ {@link boulderStatePath}
//
// ⚠️ **磁盘 vs 事件路径的分工（计划书 §4.2 纪律③）**：本文件的读盘函数**只在
// apply() 时调用一次**（`readPlanInventory`），事件路径上绝不调用——listener
// 用的是 apply 时缓存的 `PlanInventory`。相反，{@link scaffoldNotepad} 与
// {@link startWorkJob} 是**副作用**（写文件 / 注册 job），只能发生在事件路径
// （选择计划之后），且写脚手架本身不做任何**读**。
//
// ⚠️ **`ctx.jobs` 作为存储面（任务书口径）**：上游把 work 状态写进
// `.omo/boulder.json` 并用一套 work-id / session_ids / 计时器 API 维护它。DSH
// 没有这套跨会话工作表，本移植把「一次 work session 的建立」登记为**一个
// ctx.jobs job**（`kind` 用本 hook 的 id、label 承载计划名、`output` 承载
// 落地事实）。逐条对应关系与「跳过段」理由见 ../ulw-execute.ts 头部表格。
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see ../index.ts).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LEGACY_PROMETHEUS_PLANS_DIR,
  NOTEPAD_DIR_SEGMENTS,
  NOTEPAD_FILES,
  NOTEPAD_FOOTER,
  NOTEPAD_LABELS,
  NOTEPAD_PURPOSES,
  PLAN_FILE_EXTENSION,
  PROMETHEUS_PLANS_DIR,
} from './constants.ts'
import {
  EMPTY_PLAN_PROGRESS,
  planProgressFromMarkdown,
  type PlanEntry,
  type PlanProgress,
} from './plan-discovery.ts'

/** 上游 `PROMETHEUS_PLAN_DIRS`（plan-progress.ts:9-10），逐字两项。 */
export const PROMETHEUS_PLAN_DIRS: readonly string[] = [
  PROMETHEUS_PLANS_DIR,
  LEGACY_PROMETHEUS_PLANS_DIR,
]

/**
 * 一份**已算好**的计划清单（apply 时一次性构建，事件路径只读）。`entries`
 * 按上游的 mtime 倒序（最新在前）——顺序有语义：多计划询问的编号即此顺序。
 */
export interface PlanInventory {
  readonly entries: readonly PlanEntry[]
  /** 计划文件所在的两条目录的绝对路径（省略未命中的那条）。 */
  readonly scannedDirs: readonly string[]
}

/** 空清单（cwd 未知、目录不存在、读盘异常都会退化为它）。 */
export const EMPTY_PLAN_INVENTORY: PlanInventory = { entries: [], scannedDirs: [] }

/**
 * 上游 `getPlanProgress` 的读盘半（plan-progress.ts:35-51），逐字容错：
 * 文件不存在 → `{total:0, completed:0, isComplete:false}`；读取/解析抛错同样
 * 退化（上游 `catch` 返回空 progress）。解析交给 plan-discovery 的纯函数。
 */
export function readPlanProgress(planPath: string): PlanProgress {
  if (!existsSync(planPath)) return EMPTY_PLAN_PROGRESS
  try {
    return planProgressFromMarkdown(readFileSync(planPath, 'utf-8'))
  } catch {
    return EMPTY_PLAN_PROGRESS
  }
}

/**
 * 上游 `findPrometheusPlans`（plan-progress.ts:10-29）的等价读面，外加本移植
 * 在**同一趟**里算好的进度与 mtime（上游 `getPlanProgress` 是惰性另调的）。
 *
 * 逐字保留的三件事：
 *   ① 两条目录（`.omo/plans` + 旧布局 `.sisyphus/plans`）都扫；
 *   ② 只收 `.md`；
 *   ③ 按 mtime **倒序**（`statSync(right).mtimeMs - statSync(left).mtimeMs`）。
 * 上游把「目录不存在」与「任何异常」都吞成空数组，本移植同形。
 */
export function readPlanInventory(directory: string | undefined): PlanInventory {
  if (typeof directory !== 'string' || directory.length === 0) return EMPTY_PLAN_INVENTORY
  try {
    const found: { path: string; mtimeMs: number }[] = []
    const scannedDirs: string[] = []
    for (const planDir of PROMETHEUS_PLAN_DIRS) {
      const plansDir = join(directory, planDir)
      if (!existsSync(plansDir)) continue
      scannedDirs.push(plansDir)
      for (const file of readdirSync(plansDir)) {
        if (!file.endsWith(PLAN_FILE_EXTENSION)) continue
        const path = join(plansDir, file)
        let mtimeMs = 0
        try {
          mtimeMs = statSync(path).mtimeMs
        } catch {
          // 一个读不到 mtime 的文件仍是一份计划：进度照算，排序退化到 0
          // （上游会在同一个 statSync 上抛出并整体退化为空数组——这是本移植
          // 的一处**明确放宽**，理由是「一个坏文件不该吃掉整份清单」）。
          mtimeMs = 0
        }
        found.push({ path, mtimeMs })
      }
    }
    found.sort((left, right) => right.mtimeMs - left.mtimeMs)
    return {
      entries: found.map((item) => ({
        path: item.path,
        progress: readPlanProgress(item.path),
        modifiedAt: item.mtimeMs > 0 ? new Date(item.mtimeMs).toISOString() : undefined,
      })),
      scannedDirs,
    }
  } catch {
    return EMPTY_PLAN_INVENTORY
  }
}

// ── notepad 脚手架（上游 notepad-scaffold.ts） ───────────────────────────────

/** 脚手架结果（上游 `ensureNotepadScaffold` 的返回形状，逐字）。 */
export interface NotepadScaffoldResult {
  readonly created: readonly string[]
  readonly skipped: readonly string[]
  /** 脚手架目录的绝对路径（本移植新增的可观测面，供 job output 记录）。 */
  readonly directory: string
}

/**
 * 上游 `buildHeader`（notepad-scaffold.ts:34-44），逐字。注意上游刻意忽略
 * `timestamp`（`void timestamp`）——本移植保留该行为并把形参去掉，登记为
 * 「上游死参数」。
 */
export function buildNotepadHeader(fileName: string, planName: string): string {
  const label = NOTEPAD_LABELS[fileName]
  const purpose = NOTEPAD_PURPOSES[fileName]
  return `# ${label} \u2014 ${planName}\n\n${purpose}\n\n${NOTEPAD_FOOTER}\n\n---\n`
}

/** notepad 目录的绝对路径：`join(directory, '.omo', 'notepads', planName)`。 */
export function notepadDirectory(directory: string, planName: string): string {
  return join(directory, ...NOTEPAD_DIR_SEGMENTS, planName)
}

/**
 * 上游 `ensureNotepadScaffold`（notepad-scaffold.ts:46-73），逐字：
 *   * `mkdirSync(notepadDir, { recursive: true })`；
 *   * 四个文件用 `flag: 'wx'` **创建**（不覆盖）；
 *   * `EEXIST` → 记入 `skipped`（幂等）；其它 errno → 抛出（由调用方兜）。
 */
export function scaffoldNotepad(directory: string, planName: string): NotepadScaffoldResult {
  const notepadDir = notepadDirectory(directory, planName)
  mkdirSync(notepadDir, { recursive: true })

  const created: string[] = []
  const skipped: string[] = []

  for (const fileName of NOTEPAD_FILES) {
    const header = buildNotepadHeader(fileName, planName)
    try {
      writeFileSync(join(notepadDir, fileName), header, { flag: 'wx' })
      created.push(fileName)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        skipped.push(fileName)
      } else {
        throw err
      }
    }
  }

  return { created, skipped, directory: notepadDir }
}

// ── `ctx.jobs` 存储面 ───────────────────────────────────────────────────────

/**
 * 本 hook 注册的 job kind。`dsh-jobs` 的 `JobKindMap` 是可声明合并的开放 map
 * （dsh-jobs/lib/types/types.d.ts:19-24："Plugins extend this map by declaration
 * merging"），因此 `'ulw-execute'` 是一个**合法的生产者 kind**；本工作区没有
 * dsh 依赖，故这里只声明**最小结构面**（同 omo-hooks 既有纪律）。
 */
export const ULW_EXECUTE_JOB_KIND = 'ulw-execute'

/** `agent/turn-stopping`-style 的最小 agent 面：本 hook 只读 `session`。 */
export interface JobsAgentLike {
  readonly session?: unknown
}

/**
 * `ctx.jobs` 的最小结构面（`dsh-jobs/lib/types/index.d.ts:51-77` 的 `start`）。
 * 只声明本 hook 用到的成员：`start(spec)` 返回 registry 发的 `<kind>-N` id。
 */
export interface JobsSurface {
  start?(spec: {
    readonly kind: string
    readonly label: string
    readonly owner?: unknown
    readonly run: () => {
      readonly cancel: (reason?: string) => void
      readonly done: Promise<{ readonly status: 'completed' | 'killed' | 'failed'; readonly detail?: string; readonly output?: string }>
    }
  }): string
}

/** true when the value carries the one `ctx.jobs` member this hook calls. */
export function isJobsSurface(value: unknown): value is JobsSurface {
  return typeof value === 'object' && value !== null && typeof (value as JobsSurface).start === 'function'
}

/**
 * 一次 work-session 建立的结果：job id（`ctx.jobs` 缺席时为 `undefined`）+
 * notepad 脚手架的落地事实。e2e / 单测断言的就是这三个字段。
 */
export interface StartWorkJobResult {
  readonly jobId: string | undefined
  readonly scaffold: NotepadScaffoldResult
  /** `ctx.jobs` 缺席时为 true（loud-but-non-fatal，见 ../ulw-execute.ts）。 */
  readonly degraded: boolean
}

/** job 的 label（模型可见的一行）：上游 work 的 `plan_name` 位置。 */
export function startWorkJobLabel(planName: string): string {
  return `${ULW_EXECUTE_JOB_KIND}: ${planName}`
}

/** job 的 output（终态事实，一行；e2e 的 grep 锚点）。 */
export function startWorkJobOutput(
  planName: string,
  scaffold: NotepadScaffoldResult,
  sessionId: string,
): string {
  return `plan=${planName} session=${sessionId} notepad=${scaffold.directory} `
    + `created=[${scaffold.created.join(',')}] skipped=[${scaffold.skipped.join(',')}]`
}

/**
 * 上游 `createNewWorkOrInitialize` + `buildAutoSelectedPlanContextWithStateInit`
 * 的**副作用半**（`addBoulderWork`/`createBoulderState`/`writeBoulderState` 三个
 * 磁盘写入；`ensureNotepadScaffold` 保留）。DSH 侧的对应物：
 *
 *   ① notepad 脚手架 —— **逐字保留**（同一四文件、同一 `wx` 幂等）；
 *   ② 「boulder work 建立」—— 登记为 **一个 `ctx.jobs` job**：`start()` 在
 *      预检后同步调用 `run()`，本 hook 的 `run()` 同步完成脚手架并立即结算
 *      （`done` 是一个已 resolve 的 promise，`output` 承载落地事实）。这样
 *      「一次 work 建立了」这件事在 DSH 的作业面上**可观测**（`job_list` /
 *      通知面），而不是落进一个没有读者的平行状态文件。
 *
 * `ctx.jobs` 缺席（DSH 无该服务、或 cordis 严格读取拿到 `undefined`）时**只降级
 * 不失败**：`degraded: true`，脚手架照常落地（它是同步文件写，不需要 jobs）。
 * 这与 P3-T13 `background-notification` 的 loud-but-non-fatal 口径一致。
 *
 * `agent` 参数是 `JobStart.owner`：`dsh-jobs/lib/types/types.d.ts:48-55` 逐字要求
 * "Owning live agent… The instance must be the one currently registered under its
 * agent id"，即**活 Agent 实例**，不是它的 session。传 session 会被预检拒绝 →
 * 落到本函数的 catch → 永久降级（job 面静默失效），故调用方传的是 pre-step
 * 载荷里的 `payload.agent`。
 *
 * 抛错（目录不可写、job 预检拒绝）由调用方 try/catch 吞掉 —— 主链路（注入）
 * 不受影响（纪律②）。
 */
export function startWorkJob(params: {
  readonly jobs: JobsSurface | undefined
  readonly directory: string
  readonly planName: string
  readonly sessionId: string
  readonly agent: unknown
}): StartWorkJobResult {
  const { jobs, directory, planName, sessionId, agent } = params
  const scaffold = scaffoldNotepad(directory, planName)

  if (jobs === undefined || typeof jobs.start !== 'function') {
    return { jobId: undefined, scaffold, degraded: true }
  }

  let jobId: string | undefined
  try {
    jobId = jobs.start.call(jobs, {
      kind: ULW_EXECUTE_JOB_KIND,
      label: startWorkJobLabel(planName),
      owner: agent,
      run: () => ({
        cancel: () => {},
        done: Promise.resolve({
          status: 'completed' as const,
          output: startWorkJobOutput(planName, scaffold, sessionId),
        }),
      }),
    })
  } catch {
    // 预检拒绝（owner 不是 registry 里的活实例等）→ 降级，不抛出。
    return { jobId: undefined, scaffold, degraded: true }
  }
  return { jobId, scaffold, degraded: false }
}

/**
 * 上游 `getBoulderFilePath`（boulder-state storage/path.ts）的等价物：
 * `.omo/boulder.json` 的绝对路径。本移植**不读写**它（见 ../ulw-execute.ts 头部
 * 跳过段），只保留函数用于「已存在的 boulder.json → 视为一份活动 work」这条
 * **只读**兼容判定（读面见 index.ts 的会话内半）。
 */
export function boulderStatePath(directory: string): string {
  return join(directory, '.omo', 'boulder.json')
}
