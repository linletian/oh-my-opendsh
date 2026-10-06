// ulw-execute/live-state.ts — P3-T17: the LIVE halves of the ulw-execute port —
// 计划清单的读面、notepad 脚手架、以及 `ctx.jobs` 存储面。
//
// DUAL-MODE since P4.5-T4 (plan §4.2; review §3.2-3): the `ctx.jobs` STORAGE face
// this module writes through was WHOLE-PACKAGE-rewritten between the two
// generations. {@link startWorkJob} forks on exactly **TWO** things — and there is
// a **third difference that needs NO fork**, listed separately because conflating
// it with the forks is what review F2 caught: the code has TWO fork expressions
// (`owner` and the terminal key), and `run` is written as a ZERO-parameter
// closure, not a `(job?)` one. The fork signal is the SHARED runtime-identity
// marker `dshRuntimeShape(jobs)` at ../../dsh-runtime-shape.ts (identity, not a
// capability probe, and never a version string) — the SAME function
// background-notification.ts (P4.5-T2) and stop-continuation-guard.ts (P4.5-T3)
// import, so all three touch points answer the generation question with one
// predicate (plan §4.1 探针表; the consistency assertion is pinned at
// tests/omo-hooks/dsh-runtime-shape-consistency.test.ts):
//   * FORK 1 — the OWNER of `start()` (**C2**, the load-bearing fork): **[0.1.5]**
//     the LIVE `Agent` object, verbatim since P3-T17 and behaviourally unchanged;
//     **[0.2.x]** the SessionId STRING. The upstream doc says so in as many
//     words — "Owning session… the owner's live Agent must be the one currently
//     registered under that id" above `owner?: SessionId`
//     (packages/jobs/jobs/src/types.ts:131-137, re-opened at the mirror). Hand
//     the 0.2.x registry an Agent object where it wants an id and `resolveOwner`
//     misses the registry lookup → preflight throw → this hook degrades
//     PERMANENTLY and silently. That is why the owner shape is pinned verbatim
//     per generation by tests, not just "an owner was passed";
//   * FORK 2 — the RESULT KEY of the terminal payload (**C3**): **[0.1.5]**
//     `output`, **[0.2.x]** `result` (`JobOutcome.result?: string`,
//     packages/jobs/jobs/src/types.ts:16-31, re-opened at the mirror — and the
//     registry's `settle` reads `outcome.result` and NOTHING else,
//     packages/jobs/jobs-local/src/index.ts:577-592, so writing `output` alone
//     on 0.2.x drops the fact into a key nobody reads);
//   * NO FORK — the ARITY of `run` (**C3**, a difference between the two
//     DECLARATIONS that needs no branch): 0.1.5 declares `run()`, 0.2.x declares
//     `run(job: JobHandle)` (packages/jobs/jobs/src/types.ts:157, re-opened at
//     the mirror), and the 0.2.x runtime really does hand the handle over at
//     `const hooks = spec.run(handle)` (packages/jobs/jobs-local/src/index.ts:239,
//     re-opened at the mirror; the real-machine observation is `D-run-arity` in
//     `.omo/evidence/p45t4/logs/T4-scenario.ndjson` — `argType:"object"`,
//     `id:"t4probe-1"`). **ONE zero-parameter closure serves both**: JS ignores
//     an argument a closure does not name, so the 0.2.x handle simply lands
//     nowhere, and this port **deliberately consumes none of it** (the scaffolding
//     fact is already computed before `start()`, so appending it to the output ring
//     would duplicate a fact the terminal payload already carries).
// The WRITE is forked per generation (v1 → `output`, v2 → `result`) so each
// generation publishes the key ITS registry reads, and the 0.1.5 payload stays
// byte-identical to the P3-T17 one.
//
// READ SIDE, HONESTLY (review F6): **this module WRITES the terminal payload and
// READS nothing.** {@link readStartWorkJobOutcome} is the single auditable
// `result ?? output` expression kept for FUTURE read surfaces and for the canary —
// it currently has **no production caller** in this module, and the claim that
// "every read goes through it" was false. It stays exported because the canary
// probe consumes it; do not read its export as evidence of a live read path.
//
// ⚠️ **三态可区分（复核 §3.2-3 点名的病灶「日志依旧干净」）**：一个笼统的
// `catch → degraded` 让「服务没装」「预检拒了」「真炸了」三种情况在日志里长得
// 一模一样，运维读到一行降级也无处下手。所以 v2 分支把失败分成三态并各写各的
// 日志：**启动成功**（`jobId` 非空 + `degraded:false`，无降级行）/ **preflight
// 拒绝**（`jobId` undefined + `degraded:true` + 日志写明 `preflight rejected` 并
// 带上命中的那条逐字原因）/ **真实启动失败**（`jobId` undefined + `degraded:true`
// + 日志写明 `start failed` + 原因）。服务根本不在场是第四种、也是唯一沿用 P3-T17
// 原文的一态（`jobs service absent`）。分类依据是 jobs-local 的**逐字报错串**
// （{@link PREFLIGHT_REJECT_MARKERS}），不是猜测：命中标记 = preflight，其余 =
// 真实失败。返回值形状不变（**C5**），所以分类只走日志。
//
// Every section below marked **[0.1.5]** / **[0.2.x]** / **[BOTH]** says which
// generation it describes; an unmarked section describes both. PIN STATUS
// (corrected by P4.5-T13 under ruling D17, commit 2323658): CI is pinned to
// 0.2.0-rc.2 — the earlier sentence claiming 0.1.5-rc.1 was the CI pin is
// FALSE since the T12b cutover. The **[0.1.5]** text stays as the shape-fork
// documentation the shared identity marker still answers; the v1 branch is kept
// as the defensive shape fork and its tests protect the FORK, not a supported
// runtime — 0.1.x support is dropped. The notepad scaffold, the `cancel`
// semantics, the H-32 activation semantics and the `StartWorkJobResult` shape are
// all **zero-change** on this branch (**C5**); only the job CARRIER forks.
//
// H2 CITATION STATUS (P4.5-T4): every `dsh-jobs/lib/**` line number below is a
// **P3-T17-era reading on this repo's pinned 0.1.5 install**, kept **verbatim and
// NOT re-verified this round** — this machine has no 0.1.5 binary
// (`.omo/evidence/p45t1/Q5-jobs-subscribe.md` §4.2-1), and a number nobody can
// check is safer kept than "fixed". Every **[0.2.x]** number was re-opened at the
// upstream mirror `~/GithubRepo/deepseek-harness` @ `639ed01539`
// (= `dsh-v0.2.0-rc.2`) during P4.5-T4; see the P2 record in
// `.omo/evidence/p45t4/T4-live-state.md`.
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
// 语义移植（非逐字复制）：上列上游文件的判定与文案照搬，交付面是 DSH 的——读盘
// 只在 apply() 时一次，脚手架写盘与 work 登记（上游 `.omo/boulder.json` →
// `ctx.jobs`）是事件路径的副作用。
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
// ctx.jobs job**（`kind` 用本 hook 的 id、label 承载计划名、终态载荷承载落地
// 事实——键名按代分叉：**[0.1.5]** `output`，**[0.2.x]** `result`，见上）。逐条
// 对应关系与「跳过段」理由见 ../ulw-execute.ts 头部表格。
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see ../index.ts).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dshRuntimeShape } from '../../dsh-runtime-shape.ts'
import {
  LEGACY_PROMETHEUS_PLANS_DIR,
  NOTEPAD_DIR_SEGMENTS,
  NOTEPAD_FILES,
  NOTEPAD_FOOTER,
  NOTEPAD_LABELS,
  NOTEPAD_PURPOSES,
  PLAN_FILE_EXTENSION,
  PROMETHEUS_PLANS_DIR,
  ULW_EXECUTE_ID,
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
 * The terminal payload of this hook's job, BOTH generations' result keys declared
 * OPTIONAL and coexisting — the type-level statement of the **C3** double read:
 *   * `output` — **[0.1.5]** `JobOutcome.output` (dsh-jobs/lib/types/types.d.ts
 *     — P3-T17-era reading, H2 unre-verified; the P3-T17 shape of this very
 *     interface, kept verbatim).
 *   * `result` — **[0.2.x]** `JobOutcome.result`, whose upstream doc reads
 *     verbatim "Return value for jobs whose result is a value rather than a
 *     stream… handed out once by the model's next {@link JobRegistry.read}."
 *     above `result?: string` (packages/jobs/jobs/src/types.ts:25-30, re-opened
 *     at the mirror). The registry's `settle` copies `outcome.result` and never
 *     `outcome.output` (packages/jobs/jobs-local/src/index.ts:577-592), so on
 *     0.2.x this key is the only one that survives settlement.
 * `status` is the SAME closed vocabulary on both generations (**[0.1.5]**
 * dsh-jobs/lib/types/types.d.ts:14 — P3-T17-era reading, H2 unre-verified;
 * **[0.2.x]** `JobOutcome.status` at packages/jobs/jobs/src/types.ts:18,
 * re-opened at the mirror), so it is required and unforked.
 */
export interface StartWorkJobOutcomeLike {
  readonly status: 'completed' | 'killed' | 'failed'
  readonly detail?: string
  /** **[0.1.5]** the terminal result key. */
  readonly output?: string
  /** **[0.2.x]** the terminal result key (types.ts:30). */
  readonly result?: string
}

/**
 * The producer face `run` receives. **[0.2.x]** only: `run(job: JobHandle)`
 * (packages/jobs/jobs/src/types.ts:157, re-opened at the mirror; `JobHandle`
 * declared at :86-102 with `id` / `append` / `updateProgress`). ALL THREE members
 * of the real face are declared, each OPTIONAL:
 *   * declared, so a test handing us a throwing `append`/`updateProgress` stub is
 *     type-checked against the REAL contract rather than smuggling extra keys —
 *     the "this port never writes the ring" claim then has a compiler behind it;
 *   * optional, because this port calls NONE of them: the scaffolding fact is
 *     already computed before `start()` is reached, so appending it to the output
 *     ring would duplicate a fact the terminal payload already carries. The shape
 *     exists so the fork's arity is stated at the type level and the v2 test can
 *     pin that a handle really arrives.
 * **[0.1.5]** `run()` takes no argument at all (dsh-jobs/lib/types/types.d.ts —
 * P3-T17-era reading, H2 unre-verified), so nothing populates these there.
 */
export interface StartWorkJobHandleLike {
  readonly id?: string
  /** **[0.2.x]** types.ts:95 — declared, never called by this port. */
  readonly append?: (text: string, options?: unknown) => void
  /** **[0.2.x]** types.ts:101 — declared, never called by this port. */
  readonly updateProgress?: (line: string) => void
}

/**
 * The producer hooks this port hands back — identical on both generations
 * (**[0.1.5]** dsh-jobs/lib/types/types.d.ts — P3-T17-era reading, H2
 * unre-verified; **[0.2.x]** `JobHooks` at packages/jobs/jobs/src/types.ts:105-118,
 * re-opened at the mirror: `cancel(reason?)` synchronous + `done: Promise<
 * JobOutcome>`). **C5**: the `cancel` semantics are unchanged — this job's work
 * (the notepad scaffold) is already committed to disk before `start()` runs, so
 * there is nothing to unwind and `cancel` stays a no-op on both generations.
 */
export interface StartWorkJobHooksLike {
  readonly cancel: (reason?: string) => void
  readonly done: Promise<StartWorkJobOutcomeLike>
}

/**
 * The producer declaration handed to `start()` — ONE shape serving BOTH
 * generations. `run`'s parameter is OPTIONAL **at the type level**, and that is
 * what makes one shape serve both: an optional parameter is compatible with
 * **[0.1.5]** `run: () => JobHooks` (the slot is never filled) AND with
 * **[0.2.x]** `run: (job: JobHandle) => JobHooks` (types.ts:157), so no second
 * shape and no second call site are needed.
 *
 * ⚠️ This is a statement about the TYPE, not about the closure {@link startWorkJob}
 * actually writes: that closure is **ZERO-parameter** (`run: () => ({…})`), and it
 * consumes no handle on either generation (**NO FORK** — see the header's third
 * bullet). The optional parameter is what lets the zero-parameter closure type-check
 * against the 0.2.x declaration; it is NOT a parameter the written closure names.
 *
 * `owner` is `unknown` because the two generations genuinely want different types
 * there — **C2**, the load-bearing fork: **[0.1.5]** a live `Agent` instance,
 * **[0.2.x]** the SessionId string (types.ts:131-137). The runtime picks the value
 * at {@link startWorkJob}; a wider-looking type here is the honest statement of
 * "the shape is decided at runtime by one marker", not an invitation to pass either
 * value on either generation.
 */
export interface StartWorkJobSpecLike {
  readonly kind: string
  readonly label: string
  /** **[0.1.5]** live `Agent` / **[0.2.x]** SessionId string — see above. */
  readonly owner?: unknown
  readonly run: (job?: StartWorkJobHandleLike) => StartWorkJobHooksLike
}

/**
 * `ctx.jobs` 的最小结构面（**[0.1.5]** `dsh-jobs/lib/types/index.d.ts:51-77` 的
 * `start` — P3-T17-era reading, H2 unre-verified; **[0.2.x]** `JobRegistry.start
 * (spec: JobSpec): JobId` at packages/jobs/jobs/src/index.ts, spec declared at
 * packages/jobs/jobs/src/types.ts:126-158）。只声明本 hook 用到的成员：
 * `start(spec)` 返回 registry 发的 `<kind>-N` id。
 */
export interface JobsSurface {
  start?(spec: StartWorkJobSpecLike): string
  /**
   * **[0.2.x]** the `JobEvents` stream — declared OPTIONAL here as the
   * RUNTIME-IDENTITY SIGNAL only, read through `dshRuntimeShape` and NEVER
   * called by this module (the capability lives in ../../dsh-runtime-shape.ts;
   * widening this face past `unknown` would promise a member nothing in this
   * file consumes). Absent on **[0.1.5]**, where the identity signal is simply
   * "no `events` key".
   */
  readonly events?: unknown
}

/** true when the value carries the one `ctx.jobs` member this hook calls. */
export function isJobsSurface(value: unknown): value is JobsSurface {
  return typeof value === 'object' && value !== null && typeof (value as JobsSurface).start === 'function'
}

/**
 * THE DOUBLE READ of a terminal job payload (**C3**): `result ?? output`, so ONE
 * expression reads the settled fact off BOTH generations — `result` on 0.2.x
 * (the key `settle` actually stores, jobs-local/src/index.ts:577-592), `output`
 * on 0.1.5 (where `result` is absent from the shape entirely). `result` wins
 * where both keys are present: it is the 0.2.x authority, and a 0.1.5 snapshot
 * has no `result` key to lose to.
 *
 * STATUS (review **F6**): **this module has NO production caller of it.**
 * `startWorkJob` WRITES the terminal payload and reads nothing back, so this is
 * the single auditable double-read expression kept for FUTURE read surfaces and for
 * the canary probe (which does consume it — hence `export`, and do not demote it).
 * It is deliberately NOT inlined at N call sites, so a flipped `??` order can only
 * ever go RED in one place; the day a real read surface appears, it should call
 * THIS rather than re-deriving the `??`.
 *
 * ⚠️ **THIS DOUBLE READ IS FOR THE PRODUCER OUTCOME, NOT FOR A `JobView`.** P4
 * .5-T4's real-machine canary (`.omo/evidence/p45t4/logs/T4-scenario.ndjson`,
 * marker `C-get`) observed that on 0.2.x the job VIEW also carries an `output`
 * key — but its value is the ring-position object `{ total, earliest, spillPaths? }`,
 * NOT a string (`readonly output: { readonly total: number; readonly earliest:
 * number; readonly spillPaths?: readonly string[] }`, packages/jobs/jobs/src/
 * view.ts:91-99, re-opened at the mirror). So `result ?? output` aimed at a VIEW
 * would hand back an OBJECT on v2 instead of the fact. This function is typed over
 * {@link StartWorkJobOutcomeLike} — the producer/terminal payload, where `output`
 * is `string | undefined` — which is what keeps it safe. Do NOT widen its
 * parameter to a view without re-deriving this.
 */
export function readStartWorkJobOutcome(outcome: StartWorkJobOutcomeLike): string | undefined {
  return outcome.result ?? outcome.output
}

/**
 * The verbatim reason substrings that `jobs-local`'s `start()` throws BEFORE any
 * producer runs — i.e. the preflight gate. The word "preflight" is the UPSTREAM's
 * own, not this port's coinage: the abstract `start` doc reads verbatim "Preflight
 * access, validation, owner cleanup, and implementation-owned admission before
 * starting and atomically registering work. Any preflight rejection leaves no job
 * id or execution resource." above `abstract start(spec: JobSpec): JobId`
 * (packages/jobs/jobs/src/index.ts:102-110, re-opened at the mirror). That
 * sentence is the authority for **C4**'s split: a rejection on this table leaves
 * NO job id, and everything after `run` returns cannot fail registration — so a
 * throw carrying one of these strings is the registry refusing the DECLARATION,
 * and any other throw is the machinery breaking.
 *
 * Each marker is transcribed character-for-character from the upstream mirror
 * `~/GithubRepo/deepseek-harness` @ `639ed01539` (= `dsh-v0.2.0-rc.2`) during
 * P4.5-T4, with the throwing line:
 *   * `background job ownership requires the agent registry (load @deepseek-ai/
 *     dsh-agent)` — `packages/jobs/jobs-local/src/index.ts:361`, reached from
 *     `resolveOwner` `:357-367`;
 *   * `has no live agent (background job owner must be live)` — the templated
 *     tail of `` session "<id>" has no live agent (… `` at
 *     `packages/jobs/jobs-local/src/index.ts:365` (matched by tail because the
 *     session id is interpolated in front of it);
 *   * `background jobs unavailable: no job controller serves this agent (load
 *     @deepseek-ai/dsh-tool-jobs in its composition)` — `:209`;
 *   * `invalid job kind: expected a non-empty string` — `:211`;
 *   * `invalid job label: expected a non-empty string` — `:212`;
 *   * `invalid outputLimitBytes:` — `:215` (unreachable from this hook, which
 *     never sets the field; kept so the gate is complete rather than convenient);
 *   * `background job limit reached for this owner` — `:222`, the concurrency
 *     cap, which IS reachable from this hook under load.
 *
 * ⚠️ The order these fire in is the order in `start()`, NOT the order above:
 * `resolveOwner(spec.owner)` runs at `:207` — BEFORE the controller check at
 * `:208-210` and the label/kind checks at `:211-212`. So on a real 0.2.x
 * machine a wrong owner shape surfaces as `:365`, not as `:209`. Classification
 * here is by SUBSTRING MATCH on the message, so it is order-independent by
 * construction; the task book's listing order is documentation, not a sequence.
 *
 * Anything NOT matching this table is a REAL start failure — a throw from
 * `spec.run` itself (jobs-local/src/index.ts:239,
  * `const hooks = spec.run(handle)` — measured at the mirror; `:240` is a blank line), from
  * ring/controller plumbing, or from any future
 * gate not in this table. Those get their own log line (**C4**) precisely so a
 * reader can tell "the service refused my declaration" from "the service broke".
 * **[0.1.5]** has NO counterpart table: this classifier is consulted on the v2
 * branch only, so the 0.1.5 path never reads these strings.
 */
export const PREFLIGHT_REJECT_MARKERS: readonly string[] = [
  'background job ownership requires the agent registry',
  'has no live agent (background job owner must be live)',
  'background jobs unavailable: no job controller serves this agent',
  'invalid job kind: expected a non-empty string',
  'invalid job label: expected a non-empty string',
  'invalid outputLimitBytes:',
  'background job limit reached for this owner',
]

/**
 * Whether a `start()` throw is a PREFLIGHT rejection (the registry refused the
 * declaration before any producer ran) or a REAL start failure. Match is on the
 * verbatim marker, first hit wins, and the hit marker is returned so the log can
 * name WHICH gate fired instead of just "it failed" (**C4**).
 */
export function classifyStartWorkJobFailure(
  message: string,
): { readonly preflight: true; readonly marker: string } | { readonly preflight: false } {
  for (const marker of PREFLIGHT_REJECT_MARKERS) {
    if (message.includes(marker)) return { preflight: true, marker }
  }
  return { preflight: false }
}

/**
 * 本模块的诊断行前缀，与 ../ulw-execute.ts 的 `formatUlwExecuteLine` **逐字同形**
 * （`[omo-hooks] <hook-id>: `）。复制而非 import：`formatUlwExecuteLine` 住在父
 * 模块 `../ulw-execute.ts`，而父模块已经 import 了本文件——反向 import 会成环。
 * 三态日志（**C4**）靠这个前缀被 grep 到，所以同形是硬要求；同形由一致性测试钉。
 */
function formatLiveStateLine(what: string): string {
  return `[omo-hooks] ${ULW_EXECUTE_ID}: ${what}`
}

/**
 * 一次 work-session 建立的结果：job id（`ctx.jobs` 缺席时为 `undefined`）+
 * notepad 脚手架的落地事实。e2e / 单测断言的就是这三个字段。**C5**: this shape
 * is unchanged by P4.5-T4 — which is exactly why the four states of **C4** are
 * distinguishable only in the LOG, and why the log lines below are the contract.
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

/**
 * job 的终态事实（一行；e2e 的 grep 锚点）。The TEXT is generation-independent —
 * only the KEY it is published under forks (**C3**), so this string and the e2e
 * anchors on it survive both branches unchanged.
 */
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
 *   ① notepad 脚手架 —— **逐字保留**（同一四文件、同一 `wx` 幂等），且在
 *      `start()` **之前**完成，顺序不变（**C5**：脚手架副作用先于 job 登记，
 *      所以 `degraded:true` 时脚手架照常落地）；
 *   ② 「boulder work 建立」—— 登记为 **一个 `ctx.jobs` job**：`start()` 在
 *      预检后同步调用 `run()`，本 hook 的 `run()` 同步完成脚手架并立即结算
 *      （`done` 是一个已 resolve 的 promise，终态载荷承载落地事实）。这样
 *      「一次 work 建立了」这件事在 DSH 的作业面上**可观测**（`job_list` /
 *      通知面），而不是落进一个没有读者的平行状态文件。
 *
 * `ctx.jobs` 缺席（DSH 无该服务、或 cordis 严格读取拿到 `undefined`）时**只降级
 * 不失败**：`degraded: true`，脚手架照常落地（它是同步文件写，不需要 jobs）。
 * 这与 P3-T13 `background-notification` 的 loud-but-non-fatal 口径一致。
 *
 * ═════════════════ THE FORK (**C1** / **C2** / **C3**) ═════════════════
 * `dshRuntimeShape(jobs)` — the SHARED identity marker
 * (../../dsh-runtime-shape.ts), one call, one fork point, no second predicate —
 * decides exactly TWO things:
 *   * **owner** (**C2**, load-bearing): **[0.1.5]** `agent`, the live `Agent`
 *     instance — verbatim since P3-T17, zero change;
 *     `dsh-jobs/lib/types/types.d.ts:48-55` requires "Owning live agent… The
 *     instance must be the one currently registered under its agent id"
 *     (P3-T17-era reading, H2 unre-verified). **[0.2.x]** `sessionId`, the
 *     SessionId STRING — packages/jobs/jobs/src/types.ts:131-137 says the owner
 *     IS a session id whose live Agent is looked up under it, and `resolveOwner`
 *     (packages/jobs/jobs-local/src/index.ts:357-367) does exactly that lookup:
 *     `agents.get(session)`. Hand it an Agent object and `agents.get` misses →
 *     `:365` throws → this hook degrades on EVERY call, silently, forever. Both
 *     values are already in scope here, so the fork costs the call site nothing.
 *   * **terminal key** (**C3**): **[0.1.5]** publishes `output`; **[0.2.x]**
 *     publishes `result`, because `settle` copies `outcome.result` alone
 *     (packages/jobs/jobs-local/src/index.ts:577-592). A FUTURE read surface reads
 *     both through {@link readStartWorkJobOutcome} (`result ?? output`) and so
 *     never cares — though THIS module reads nothing back (**F6**).
 * `run`'s arity needs NO fork: the closure written here is ZERO-parameter and one
 * such closure type-checks against both declarations (see
 * {@link StartWorkJobSpecLike} and the header's NO FORK bullet).
 *
 * ⚠️ **三态可区分（C4）**：`log` 是**新增的可选**诊断汇（缺省 no-op，所以既有
 * 调用点与既有断言零改动）。它必须存在，是因为 **C5** 冻结了返回形状——三态在
 * 返回值上只剩 `jobId`/`degraded` 两比特，分不出「预检拒了」和「真炸了」，那
 * 正是复核 §3.2-3 点名的「日志依旧干净」病灶。四行日志：
 *   * 成功 → 不写降级行（`jobId` 非空即是事实）；
 *   * 服务缺席 → `… jobs service absent: …`（沿用 P3-T17 语义的唯一一态）；
 *   * preflight 拒绝 → `… preflight rejected by the jobs registry: <原因>
 *     (matched: <逐字标记>)`；
 *   * 真实启动失败 → `… start failed: <原因>`。
 *
 * 抛错（目录不可写）由调用方 try/catch 吞掉 —— 主链路（注入）不受影响（纪律②）；
 * `start()` 的抛出在本函数内分类并降级，绝不上抛。
 */
export function startWorkJob(params: {
  readonly jobs: JobsSurface | undefined
  readonly directory: string
  readonly planName: string
  readonly sessionId: string
  readonly agent: unknown
  /** 诊断汇（**C4**）；缺省 no-op，故既有调用点可不传（但生产调用点会传）。 */
  readonly log?: (line: string) => void
}): StartWorkJobResult {
  const { jobs, directory, planName, sessionId, agent } = params
  const log = params.log ?? noopLog
  // ① 脚手架先落地（顺序 **C5**：先写盘，后登记 job）。
  const scaffold = scaffoldNotepad(directory, planName)

  if (jobs === undefined || typeof jobs.start !== 'function') {
    // 态③ 服务缺席 —— 不是拒绝，是压根没有这个服务。
    log(formatLiveStateLine('work-session job skipped: jobs service absent; '
      + 'degraded to the notepad scaffold only') + ` (plan=${planName})`)
    return { jobId: undefined, scaffold, degraded: true }
  }

  // THE FORK (**C1**): one shared marker, TWO fork expressions, no third.
  const shape = dshRuntimeShape(jobs)
  // **C2** the owner shape. **C3** the terminal key. `run` below gets neither —
  // it is ZERO-parameter and consumes no handle (NO FORK, header bullet 3).
  const owner: unknown = shape === 'v2' ? sessionId : agent
  const terminalKey: 'output' | 'result' = shape === 'v2' ? 'result' : 'output'
  // ⚠️ **Error-surface note (review F8)**: `fact` is built HERE, OUTSIDE the try
  // below. In P3-T17 the same call sat INSIDE `run()`, i.e. inside the try, so a
  // throw from `startWorkJobOutput` was caught and degraded. Hoisting it means such
  // a throw now escapes `startWorkJob` and is caught by the caller's outer
  // `try`/`catch` at ../ulw-execute.ts (`plan selection failed`) instead — the
  // mainline (injection) is still unaffected (discipline ②), but the CATCH is one
  // frame higher and the result is no longer a degraded-with-scaffold record.
  // `startWorkJobOutput` is pure string concatenation over already-computed values
  // and cannot throw, so this is UNREACHABLE today; it is recorded because the
  // header claims C5 "error surface unchanged", and strictly it moved one frame.
  const fact = startWorkJobOutput(planName, scaffold, sessionId)

  let jobId: string | undefined
  try {
    jobId = jobs.start.call(jobs, {
      kind: ULW_EXECUTE_JOB_KIND,
      label: startWorkJobLabel(planName),
      owner,
      run: () => ({
        cancel: () => {},
        done: Promise.resolve({
          status: 'completed' as const,
          ...(terminalKey === 'result' ? { result: fact } : { output: fact }),
        }),
      }),
    })
  } catch (err) {
    const message = describeError(err)
    // The classifier is consulted on the v2 branch ONLY (**C4**): the preflight
    // table is a transcription of the 0.2.x registry's own gates, and the 0.1.5
    // path has no counterpart table to match against — inventing one would be
    // guessing at a binary this machine cannot run (H2). On v1 the throw keeps its
    // P3-T17 wording and takes the real-failure line, which is the honest label
    // for "we do not have a verified gate table for this generation".
    const verdict: { readonly preflight: true; readonly marker: string } | { readonly preflight: false }
      = shape === 'v2' ? classifyStartWorkJobFailure(message) : { preflight: false }
    if (verdict.preflight === true) {
      // 态② preflight 拒绝 —— registry 在本 hook 的声明上拒了，带上命中的标记。
      log(formatLiveStateLine(
        `work-session job preflight rejected by the jobs registry: ${message} `
        + `(matched: ${verdict.marker}) [degraded; plan=${planName}]`))
    } else {
      // 态④ 真实启动失败 —— 不在预检表上的任何抛出。
      log(formatLiveStateLine(
        `work-session job start failed: ${message} [degraded; plan=${planName}]`))
    }
    return { jobId: undefined, scaffold, degraded: true }
  }
  // 态① 启动成功 —— 不写降级行；`jobId` 非空 + `degraded:false` 即是事实。
  return { jobId, scaffold, degraded: false }
}

/** 诊断缺省汇：什么都不做（既有调用点零改动的来源）。 */
function noopLog(): void {
  // 刻意空实现：调用方没给汇就不诊断，不抛、不 console。
}

/** 与本仓其它 listener 相同的取值方式：Error 取 message，其余 String()。 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
