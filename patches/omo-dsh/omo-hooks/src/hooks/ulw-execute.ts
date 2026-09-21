// ulw-execute.ts — P3-T17 listener (task book WP-6 批 D, the largest single
// module of Phase 3; plan §4.3 P5 row, manifest H-32, plan §4.5 boundary).
//
// WHAT THIS IS. OMO 的 start-work hook 语义（激活检测 / 计划发现 / 上下文构建 /
// 脚手架）在 DSH 上的重生，形态 = **一个 `agent/pre-step` waterfall listener**
// （模式 A）：在**被显式委派出来的 atlas 子会话**的 pre-step 上，检测「工作计划
// 意图」，构建计划上下文文档，并在首次激活时用 `agent.inject()` 把上下文 +
// 计划发现的落地事实送进该子会话的下一步。
//
// Upstream: packages/omo-opencode/src/hooks/start-work/ @ v4.19.4（冻结基线 tag，
//   commit b072d279110bdda2c6ac2525d0d24dc54d16148a；PRE-1）。
//   命名锚点 = v5 名 `ulw-execute`（ROADMAP §2 规则 6）。⚠️ **该名在 v4.19.4 里
//   零命中**（P3-T1 裁定 C：`git grep -ln "ulw-execute" v4.19.4` 无输出），
//   所有 `start-work` 字面量都是人写改写点（逐处清单见 P3-T1 §4）。
//   语义移植（非逐字复制）：计划发现/进度/文案照搬，交付面（事件、注入、存储）
//   是 DSH 的。无上游代码 vendor。
//
// ═══════════ 上游 20 文件的逐文件处置（计划书 §4.9 逐文件署名要求） ═══════════
// P3-T1 startwork-split 的 20:0 划分（20 文件全部属 Phase 3 侧，命令面 0 件）
// 在本移植里的落地，逐文件一行（实现 13 + 测试 7）：
//
// 本目录（ulw-execute/）承载 7 个文件、本文件承载 listener 与 registrar：
//   ulw-execute/constants.ts       — 激活契约（marker / 意图表 / notepad / 文案常量）
//   ulw-execute/identity.ts        — 身份面（descriptor.persona 的 omo-atlas 锚点）
//   ulw-execute/parse-request.ts   — 上游 parse-user-request.ts 逐字
//   ulw-execute/plan-discovery.ts  — 上游 plan-selection / plan-discovery-context /
//                                    boulder-state plan-checklist 的纯判定
//   ulw-execute/context-builder.ts — 上游 context-info-builder 判定树 + 文案半
//   ulw-execute/live-state.ts      — 计划清单读面 / notepad 脚手架 / ctx.jobs 存储面
//   ulw-execute/worktree.ts        — 上游 worktree-block.ts 逐字
//
//   IMPLEMENTATION (13)
//   index.ts                    — PORTED (barrel：上列 7 个模块就是它的展开)
//   start-work-hook.ts (256)    — PORTED (激活检测 + 上下文注入 + 幂等守卫；
//                                 激活信号与交付面重定，见下)
//   parse-user-request.ts (49)  — PORTED 逐字 (parse-request.ts)
//   context-info-builder.ts(169)— PORTED (context-builder.ts 的整棵判定树)
//   context-info-formatters.ts  — PORTED (文案半逐字；落盘半 → ctx.jobs)
//   explicit-plan-context.ts    — PARTIAL PORT (context-builder.ts 的
//                                 buildExplicitPlanContext：②③④ 逐条落地；
//                                 ①级（活动 work 注册表）为分支级跳过段 S-4)
//   plan-discovery-context.ts   — PORTED (plan-discovery.ts 的四条分支 + 三条
//                                 should*；`findPrometheusPlans` 换内存清单)
//   plan-selection.ts (82)      — PORTED 逐字 (plan-discovery.ts；mtime 格式差异
//                                 登记在 formatIncompletePlanList)
//   session-plan-affinity.ts    — 跳过段 (见下 S-1)
//   work-initializer.ts (58)    — PORTED (副作用半 → live-state.ts 的
//                                 startWorkJob / scaffoldNotepad)
//   notepad-scaffold.ts (73)    — PORTED 逐字 (live-state.ts；仅命名锚点改写)
//   worktree-block.ts (32)      — PORTED 逐字 (worktree.ts)
//   worktree-detector.ts(109)   — 跳过段 (见下 S-2)
//
//   TEST SEEDS (7) — 计划书 §4.7 L1「上游有测试文件的移植其用例」：
//   context-info-builder.test.ts(520, 15)  — PORTED (本模块单测的判定树组)
//   index.test.ts (1247, 38)               — PARTIAL PORT (计划发现/格式化/
//                                            explicit-plan 主路径；集成组依赖
//                                            atlas hook 与命令模板形状的输入，
//                                            见 S-3)
//   notepad-scaffold.test.ts (159, 4)      — PORTED (脚手架组，含幂等)
//   parse-user-request.test.ts (122, 16)   — PORTED (解析组)
//   session-plan-affinity.test.ts (73, 2)  — 跳过段 (S-1)
//   start-work-hook.test.ts (201, 7)       — PARTIAL PORT (激活检测组；上游其中
//                                            1 例断言 Phase 4 模板头，剔除——见
//                                            P3-T1 §3 C-4)
//   worktree-detector.test.ts (200, 12)    — 跳过段 (S-2)
//
// ═══════════ S — 跳过段（逐条理由，不允许静默吞掉） ═══════════
//
// S-1 `session-plan-affinity.ts`（129 行）——**依赖 boulder-state 的会话历史面，
//     注册为跳过段**。上游语义：回扫**会话历史消息**找最近被引用的 `.omo/plans/
//     *.md` 路径，作为「用户最可能想继续的计划」。依赖面逐字：
//     `session-plan-affinity.ts:87` `input.client.session?.messages`、`:99`
//     `await input.client.session.messages({ path: { id: input.sessionID } })`
//     ——**opencode SDK 的会话消息 RPC**。DSH 侧没有等价的「按会话 id 拉全量消息
//     目录」的同步读面：会话日志的等价物是 `session.ownEvents()`（内存、且只含
//     **本会话自己的**事件，不是「本会话引用过的计划路径」的索引）。用
//     `ownEvents()` 复刻等于把每个历史事件文本过一遍正则，在一棵**每步都跑**的
//     pre-step listener 上是 O(历史) 的热路径开销，且**语义不等价**（上游扫的是
//     经过压缩/裁剪后的消息视图，DSH 的 ownEvents 是未裁剪的原始日志）。
//     处置：本移植的 `preferredPlanPath` 恒为 `null`（即「无偏好计划」），
//     判定树因此走「自动选中唯一未完成计划 / 多计划询问」两条主干——这正是
//     本阶段要求的计划发现语义；`pickPreferredIncompletePlan` 与
//     `shouldResumeSingleWorkOption` 的偏好分支保留并单测覆盖（Phase 4/5 若有
//     了会话历史读面，接上即生效，零改动）。
//
// S-2 `worktree-detector.ts`（109 行）——**git worktree 探测，DSH 工作区模型不同，
//     按语义等价改写为「不做探测」**。上游语义 = 两条 `execFileSync("git", …)`
//     （`:79` `git worktree list --porcelain`、`:96` `git rev-parse --show-toplevel`）
//     + 一个 porcelain 解析器 + 路径归一化（realpath）。处置：`--worktree <path>`
//     的**校验**改为「非空即接受」（DSH 的工作区由会话 header 的 cwd 决定，
//     沙箱化的工作区模型下「该 path 是不是一个 git worktree」不是本 hook 该
//     关心的事——写文件工具的沙箱策略才是权威）。因此 `parseWorktreeListPorcelain`
//     / `listWorktrees` / `detectWorktreePath` **不移植**；`worktree-block.ts` 的
//     文案（用户可见语义）**照搬**（worktree.ts）。「needs setup」提示块保留
//     （它的条件是「显式给了一个校验不过的路径」，在本移植里即空串/空白串）。
//
// S-3 `index.test.ts` 的**集成组**（上游 38 例中的 chat.message / retry-path /
//     command.execute.before 群）——**不逐例移植**：它们的输入是
//     `createStartWorkPrompt(...)` 构造的**命令模板形状**（`<command-instruction>`
//     + `<session-context>` + `<user-request>`），而 Phase 3 不交付命令模板
//     （Phase 4）。本移植的单测覆盖同一批纯语义（判定树 / 格式化 / 计划选择 /
//     脚手架幂等），集成面留给 Phase 4 模板落地后的对接测试。见 P3-T1 §3 C-1/C-4。
//
// S-4 `explicit-plan-context.ts` 的**①级**（`getWorkByPlanName`：`plan_name ===
//     explicitPlanName` 全等命中**活动 work 注册表** → 已完成 / 续接）——**分支级
//     跳过段**（同一文件 ②③④ 级照常移植）。这一级的读面是 boulder-state 的活动
//     work 列表；本移植的 `BoulderView` 投影恒为 `EMPTY_BOULDER_VIEW`（无已知活动
//     work，见 context-builder.ts 的接口与 ulw-execute.ts 的 `readBoulderView`），
//     既无 work 列表也无 `plan_name` 索引，故该分支**当前不可达**（无实际行为差）。
//     ⚠️ **接上非空 boulder 投影时必须先补此项**，否则「显式计划名命中活动 work」
//     会错误走「新建」而非「续接」。详见 context-builder.ts 的
//     `buildExplicitPlanContext` 注释（P3-T17 评审 F-2）。
//
// ═══════════ 激活信号（DSH 原生形态；计划书 §4.5 更正口径） ═══════════
//
// 上游的激活检测**只认命令模板产物**（P3-T1 裁定 B，逐字 start-work-hook.ts:170-175）：
//     if (!promptText.includes("<session-context>")
//         || !promptText.includes(START_WORK_TEMPLATE_MARKER)) return
// 两个 marker 都只能由 Phase 4 的 `features/builtin-commands/templates/start-work.ts`
// 产生；`hooks/start-work/` 目录内**没有任何自由文本激活路径**。故 Phase 3 必须
// 自定等价信号（计划书 §4.5；本任务书）。本移植的信号 = **两个合取条件**：
//
//   ① 身份：该 pre-step 属于一个 `omo-atlas` 子会话（descriptor.persona 锚点；
//      T16 先例）。上游的「激活目标 = atlas」在 DSH 上就是「这个子会话是 atlas」。
//   ② 意图：该子会话收到的**任务文本**命中 WORK_INTENT_MARKERS（constants.ts，
//      含 Phase 4 模板的 marker 语义 + 上游模板的措辞 + `ultrawork|ulw` 关键词）。
//      Phase 4 模板落地后，模板标头必然命中同一张表 —— 届时把
//      TEMPLATE_HEADER_MARKER / TEMPLATE_SESSION_CONTEXT_OPEN 的**逐字**对接
//      也接受（R-10 常量同步风险，见 constants.ts 的注释块）。
//
// 为什么不是「任何 atlas 委派都注入」：那会把本 listener 变成对 atlas 的**无差别
// 噪音源**（每个 atlas 委派都收到一份计划上下文），而上游的 marker 门是**精确**
// 的。收窄到「任务文本含工作计划意图」是 DSH 侧最接近 marker 门的等价物，且方向
// 是安全的（漏注入 ≠ 错注入）。
//
// ═══════════ ctx.jobs 作为存储面（任务书口径） ═══════════
//
// 上游把「一次 work session 的建立」写成 `.omo/boulder.json`（`writeBoulderState`
// / `addBoulderWork` / `createBoulderState`）。DSH 没有这张跨会话工作表，本移植
// 的存储面 = **`ctx.jobs`**：首次激活时注册一个 `kind: 'ulw-execute'` 的 job，
// label 承载计划名，同步 run() 里落 notepad 脚手架，`output` 承载落地事实
// （见 live-state.ts 的 `startWorkJob`）。
//
// **延迟获取（P3-T13 先例）**：`ctx.get('jobs')` 在 apply() 时**通常是
// `undefined`**——loader 与本插件同一批创建 `jobs` provider 行，cordis 的严格读取
// 对「provider fiber 尚未 active」返回 undefined（background-notification.ts 头部
// 记录了完整的 root cause 与逐字引用）。故本 registrar 同时走两条路：
//   * 立即：`ctx.get('jobs')` 命中就用（同一批次恰好先生效的情形）；
//   * 延迟：`ctx.inject(['jobs'], (jobsCtx) => …)` 武装一次，服务出现时把
//     surface 交给闭包。
// **jobs 缺席 loud-but-non-fatal**：listener 照常工作（脚手架是同步文件写，不需要
// jobs），job 面退化为「不登记」，并在启动时打一行 NOTE（与
// background-notification 的 `NOTE:` 形态同构，注册测试逐字钉死）。
//
// ═══════════ 本文件遵守的纪律（计划书 §4.2） ═══════════
//   ① Fiber 可逆：listener 经 `ctx.on` 注册（cordis 作用域 = 本 fiber）；
//      `ctx.inject` 的子 fiber、`session/disposed` 的清理同样随 fiber 销毁。
//   ② listener 体自包 try/catch 且 FAIL OPEN：`agent/pre-step` 是 waterfall，
//      抛错会让整步失败；本 listener 的所有失败路径都是「不注入」+ `return next()`。
//      **`next()` 结构性地位于 try 之外**（F-1）：自有逻辑全部收在
//      `runUlwExecuteStep`（内部零 `next()` 调用）；try 只 await 它，catch 记日志后
//      fail-open 调一次 `next()`，成功路径在 try 之后调一次——两者互斥，故每次调用
//      **恰好一次** `next()`。cordis 的 waterfall `next` 每次调用都会
//      推进回调队列，把 `next()` 放进 try 会让**下游**异常落进 catch 并二次推进、
//      吞掉下游错误（详见 listener 的注释与 directory-readme-injector.ts:528-550）。
//   ③ **事件路径无读盘**：计划清单在 apply() 时读一次（`readPlanInventory`）；
//      listener 只用缓存；上下文文档由**纯函数**拼装（无 fs、无 clock）。
//      ⚠️ 唯一的写盘是「选择计划后的 notepad 脚手架」——写，不是读，且与上游同形。
//   ④ 注册面读 manifest 的 PRIMARY event（`entry.event`），不写第二个字面量。
//   ⑤ 无模块级可变状态：per-session 幂等守卫是 registrar 闭包里的 `WeakMap`
//      （`WeakMap<object, true>`，keyed 会话对象；见 createUlwExecuteListener），
//      随 fiber 回收。
//   ⑥ 跨插件不 import：身份面（`omo-atlas` 锚点）与 prometheus-md-only 各自维持
//      一份最小实现（计划书 §4.1 末条）。
//
// R-10（计划书 §6）——**Phase 4 常量同步风险**，登记在 constants.ts：
//   `TEMPLATE_HEADER_MARKER` / `TEMPLATE_SESSION_CONTEXT_OPEN` /
//   `ULW_EXECUTE_CONTEXT_MARKER` 三个常量是**接口契约**。Phase 4 的 `/ulw-execute`
//   模板落地时，其产物必须与这三个常量逐字一致（尤其幂等 marker：不同步会让
//   幂等守卫静默失效）——本模块的单测对三个常量逐字断言，作为漂移哨兵。
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar, HooksRegistrationContext } from '../index.ts'
import { describeError } from '../boot-markers.ts'
import {
  TEMPLATE_HEADER_MARKER,
  TEMPLATE_SESSION_CONTEXT_OPEN,
  ULW_EXECUTE_CONTEXT_MARKER,
  ULW_EXECUTE_ID,
  ULW_EXECUTE_PLUGIN,
  UPSTREAM_CONTEXT_INFO_MARKER,
  WORK_INTENT_MARKERS,
} from './ulw-execute/constants.ts'
import { parseUserRequest, hasUserRequestTag, EMPTY_REQUEST, type ParsedUserRequest } from './ulw-execute/parse-request.ts'
import { readDescriptorIdentity, isAtlasPersona, type SessionLike } from './ulw-execute/identity.ts'
import {
  EMPTY_BOULDER_VIEW,
  buildStaticTextBlocks,
  buildWorkContextDocument,
  type BoulderView,
  type PlanSelection,
  type StaticTextBlocks,
} from './ulw-execute/context-builder.ts'
import type { PlanEntry } from './ulw-execute/plan-discovery.ts'
import {
  EMPTY_PLAN_INVENTORY,
  isJobsSurface,
  readPlanInventory,
  startWorkJob,
  type JobsSurface,
  type PlanInventory,
} from './ulw-execute/live-state.ts'

/** 本 registrar 实现的 manifest id（manifest.ts H-32 行）。 */
export const ULW_EXECUTE_HOOK_ID = ULW_EXECUTE_ID

/** 本 listener 注册的**唯一**事件（模式 A；= manifest 行的 `event`）。 */
export const ULW_EXECUTE_PRIMARY_EVENT = 'agent/pre-step'

/**
 * 上游 `START_WORK_TEMPLATE_MARKER` 的 re-export（常量在 constants.ts，本文件
 * 只是让单测/e2e 从 listener 模块也能读到同一常量，避免第二处字面量）。
 */
export const START_WORK_TEMPLATE_MARKER = TEMPLATE_HEADER_MARKER

/** 上游 `SESSION_CONTEXT_OPEN` 的 re-export（同上）。 */
export const SESSION_CONTEXT_OPEN = TEMPLATE_SESSION_CONTEXT_OPEN

/** 上游 `CONTEXT_INFO_MARKER`（命名锚点改写后）的 re-export（同上）。 */
export const CONTEXT_INFO_MARKER = ULW_EXECUTE_CONTEXT_MARKER

/** 上游原文 marker，仅作审计（漂移对照用）。 */
export const UPSTREAM_MARKER_AUDIT = UPSTREAM_CONTEXT_INFO_MARKER

// ── 最小结构面（dsh 事件载荷；本工作区无 dsh 依赖） ──────────────────────────

/** 会话 header 本文件读到的两个叶子（cwd 是工作区根）。 */
export interface SessionHeaderLike {
  readonly cwd?: unknown
}

/** pre-step 载荷里的 agent（读 session / inject）。 */
export interface PreStepAgentLike {
  readonly id?: unknown
  readonly session?: unknown
  inject?(message: InjectedUserMessage): void
}

/** pre-step 载荷（waterfall 四参 + next）。 */
export interface PreStepPayloadLike {
  readonly agent?: unknown
  readonly messages?: unknown
}

/**
 * `agent/pre-step` waterfall 的 `next`。调用它 = 保留当前消息集合（waterfall
 * 合同："Calling next() preserves the current messages"）；本 listener 永远调用它。
 */
export type PreStepNextLike = () => Promise<unknown>

/** 注入消息的文本块（dsh-llm ContentBlock 的 text 成员）。 */
export interface InjectedTextBlock {
  readonly type: 'text'
  readonly text: string
}

/** 注入消息的 source（`form: 'instructions'` = 「这段内容在指导模型」）。 */
export interface InjectedPluginSource {
  readonly kind: 'plugin'
  readonly plugin: string
  readonly form: 'instructions'
}

/** 注入的用户消息（id 每注入一次新铸，inbox 校验 pending-id 唯一）。 */
export interface InjectedUserMessage {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly InjectedTextBlock[]
  readonly source: InjectedPluginSource
}

// ── 激活检测（纯函数，单测的第一组） ─────────────────────────────────────────

/** 不注入的原因（每个值都可单独断言；`undefined` 会让「没工作意图」与「不是
 *  atlas」糊在一起，单测就分辨不出「门在工作」还是「门坏了」）。 */
export type ActivationSkipReason =
  | 'no-agent'
  | 'no-inject'
  | 'not-a-delegated-child'
  | 'not-atlas'
  | 'no-task-text'
  | 'no-work-intent'
  | 'already-injected'
  | 'no-context'

/** 一次激活评估的结果。 */
export type ActivationDecision =
  | { readonly kind: 'inject'; readonly text: string }
  | { readonly kind: 'skip'; readonly reason: ActivationSkipReason }

/** {@link decideUlwExecuteActivation} 的输入：全部已是读出来的叶子值。 */
export interface ActivationInput {
  /** 子会话 descriptor.persona（本模块读出的锚点源）。 */
  readonly persona: string | undefined
  /** 该会话本趟收到的任务文本（已从 messages 里抽出并 join）。 */
  readonly taskText: string
  /** 该会话是否已经注入过一次（registrar 的会话内 `WeakMap` 或会话内 marker 审计，任一命中）。 */
  readonly alreadyInjected: boolean
  /** 由 `buildWorkContextDocument` 算出的上下文文档（可能为空串）。 */
  readonly contextText: string
}

/**
 * 激活判定，顺序固定（单测对每条理由断言）：
 *   ① 非子会话 / 不是 atlas → `not-a-delegated-child` / `not-atlas`
 *   ② 已有幂等记录 → `already-injected`
 *   ③ 任务文本为空 → `no-task-text`
 *   ④ 无工作计划意图 → `no-work-intent`
 *   ⑤ 上下文文档为空 → `no-context`
 *   ⑥ 否则 inject
 *
 * 顺序的理由：「身份」先于「内容」（不是 atlas 就根本不该看它的文本），
 * 「幂等」先于「意图」（已注入的会话每步都会再命中意图，必须短路）。
 */
export function decideUlwExecuteActivation(input: ActivationInput): ActivationDecision {
  const { persona, taskText, alreadyInjected, contextText } = input
  if (!isAtlasPersona(persona)) {
    return { kind: 'skip', reason: 'not-atlas' }
  }
  if (alreadyInjected) {
    return { kind: 'skip', reason: 'already-injected' }
  }
  if (taskText.length === 0) {
    return { kind: 'skip', reason: 'no-task-text' }
  }
  if (!hasWorkIntent(taskText)) {
    return { kind: 'skip', reason: 'no-work-intent' }
  }
  if (contextText.length === 0) {
    return { kind: 'skip', reason: 'no-context' }
  }
  return { kind: 'inject', text: contextText }
}

/**
 * 任务文本是否命中工作计划意图。
 *
 * ⚠️ **必须按词边界匹配，不能按子串**（P3-T17 e2e 实测踩到）。marker 表里有
 * `ulw` 与 `ulw-execute` 这类**短**词：子串匹配会让 `ulw` 命中
 * `sULW-1.0`（每个 omo-agents 注入文本都带的 `SUL-1.0` 署名行）与普通英文词
 * `wo**ulw**d`；实测后果是把"无工作计划意图"的对照会话也判成有意图、照常注入
 * ——激活门的**假阳性**，正是本 hook 明确不该有的方向（漏注入 ≠ 错注入）。
 *
 * 边界定义：marker 两侧必须是「非字母/数字/下划线/连字符」或字符串端点。取这个
 * 而非 `\b`，是因为 `\b` 在 `-` 两侧不成立，`ulw-execute` 会被切碎；排除 `-`
 * 也让 `start-work` 不会命中 `start-work-foo`。
 */
const INTENT_BOUNDARY = '[^\\p{L}\\p{N}_-]'
const WORK_INTENT_PATTERN = new RegExp(
  `(?:^|${INTENT_BOUNDARY})(${WORK_INTENT_MARKERS
    .map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?=$|${INTENT_BOUNDARY})`,
  'iu',
)

/**
 * 大小写不敏感的词边界匹配。导出的正则形式让单测能直接钉住「子串不算命中」
 * 这条判定（`SUL-1.0` / `would` 两个真实反例都在单测里）。
 */
export function hasWorkIntent(taskText: string): boolean {
  return WORK_INTENT_PATTERN.test(taskText)
}

/**
 * 上游 `buildContinuationText` 式的文本拼装：注入正文 = 幂等 marker 行 +
 * `---` 分隔 + 上下文文档（上游 start-work-hook.ts:233-235 逐字形态：
 * `text += \`\n\n---\n${CONTEXT_INFO_MARKER}\n${contextInfo}\``）。
 *
 * 与上游的唯一差别：上游把这段**追加到已有的 text part**（就地改写命令模板
 * 产出的 prompt part）；DSH 的 pre-step 载荷是**冻结**的（不能改写已入队消息），
 * 故本移植把同一段文本作为**新消息**注入（`agent.inject`）。
 */
export function buildInjectionText(contextText: string): string {
  return `\n\n---\n${CONTEXT_INFO_MARKER}\n${contextText}`
}

/** 铸一条注入消息（每注入一次新 id）。 */
export function buildInjectionMessage(contextText: string): InjectedUserMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: buildInjectionText(contextText) }],
    source: { kind: 'plugin', plugin: ULW_EXECUTE_PLUGIN, form: 'instructions' },
  }
}

// ── 载荷读取（防御式；每处都可能是别的插件/别的形态） ────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** `payload.agent`，读不到返回 undefined。 */
export function readPreStepAgent(payload: unknown): PreStepAgentLike | undefined {
  if (!isObject(payload)) return undefined
  const agent = payload.agent
  return isObject(agent) ? (agent as PreStepAgentLike) : undefined
}

/** `agent.session`，读不到返回 undefined。 */
export function readAgentSession(agent: PreStepAgentLike | undefined): unknown {
  return agent?.session
}

/** 会话工作区根（`session.header.cwd`），上游 `ctx.directory` 的 DSH 等价物。 */
export function readSessionCwd(session: unknown): string | undefined {
  if (!isObject(session)) return undefined
  const header = (session as { readonly header?: unknown }).header
  if (!isObject(header)) return undefined
  const cwd = (header as SessionHeaderLike).cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/**
 * 会话 id（`session.header.id`）。DSH 的 Session header 带 durable id
 * （e2e/日志用）；缺失时退化为空串（`$SESSION_ID` 语义，不阻断）。
 */
export function readSessionId(session: unknown): string {
  if (!isObject(session)) return ''
  const header = (session as { readonly header?: unknown }).header
  if (!isObject(header)) return ''
  const id = (header as { readonly id?: unknown }).id
  return typeof id === 'string' ? id : ''
}

/**
 * DSH's continuable-return guidance prefix, verbatim from the pinned install's
 * `withContinuableReturnGuidance` (dsh-subagent/lib/index.js:627-636):
 *
 *   `Your parent agent id is ${encodedParentId}. Before you finish, send your
 *    result to that agent with send_message({ agent_id: …, message: "…" }). …`
 *
 * The continuation prose CONTAINS the word pair "start work" ("…when a finding
 * changes what the parent should **start work**ing on…" is NOT the wording, but
 * the guidance's second sentence plus other prompt sections do produce the
 * bigram), which is one of {@link WORK_INTENT_MARKERS}. That is why
 * {@link readDelegationTaskText} cuts at this prefix instead of scanning the
 * whole claimed batch (see that function's note).
 */
export const RETURN_GUIDANCE_PREFIX = 'Your parent agent id is '

/**
 * 从 pre-step 载荷的 `messages` 里抽出**模型可见的任务文本**：每个 user
 * 消息的 `text` 内容块 join。非 user 消息、非 text 块、畸形条目一律跳过
 * （live 对象只读叶子，不复制、不序列化——纪律①）。
 */
export function readTaskText(payload: unknown): string {
  if (!isObject(payload)) return ''
  const messages = payload.messages
  if (!Array.isArray(messages)) return ''
  const texts: string[] = []
  for (const message of messages) {
    if (!isObject(message)) continue
    if (message.role !== 'user') continue
    const content = message.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!isObject(block)) continue
      if (block.type !== 'text') continue
      const text = block.text
      if (typeof text === 'string' && text.length > 0) texts.push(text)
    }
  }
  return texts.join('\n').trim()
}

/**
 * 本次激活检测真正要看的文本：**委派自己的任务**，不是「本步认领的全部文本」。
 *
 * ⚠️ **这是 P3-T17 e2e 实测踩出的第二处假阳性修正**（第一处是 `ulw` 的子串匹配，
 * 见 {@link hasWorkIntent}）。`agent/pre-step` 的 `messages` 是**本步认领的
 * 全部消息**——首步之后它还会带上**别的插件注入的上下文**（`omo-agents` 的
 * hard-blocks / delegation-discipline 段、dsh 自己的 system-prompt 快照，以及
 * **本 hook 自己的 `ctx.jobs` 完成通知**）。实测两轮假阳性：
 *   * 第二轮 pre-step 把 hard-blocks 注入段当成任务文本（其中含
 *     `Start work only when …` 一类措辞）；
 *   * 第三轮 pre-step 把 **job 完成通知**当成任务文本——该通知的 label 恰好是
 *     `ulw-execute: alpha`，于是命中了意图表里的 `ulw-execute` 标记（自指假阳性）。
 * 上游的对应面是**命令模板的 prompt 文本**（一个明确的、唯一的输入），本移植的
 * 等价物就是「委派子会话收到的**那一条**、**由用户发起**的任务消息」，因此：
 *
 *   ① 跳过**插件来源**的 user 消息（`source.kind !== 'user'`）——注入上下文、
 *      system-prompt 快照、job 通知全部不是「用户的任务表达」；
 *   ② 取第一条通过的 user 消息的文本块（= 委派的任务，见 dsh-tool-subagent
 *      构造的 `prompt` 块）；
 *   ③ 在 {@link RETURN_GUIDANCE_PREFIX} 处截断，去掉 dsh 追加的续作指引
 *      （那段指引不属于用户的意图表达）。
 *
 * 空结果 → 判定为 `no-task-text`（`decideUlwExecuteActivation` 的第三条），
 * 即「没拿到任务文本就不注入」——保守方向（漏注入 ≠ 错注入）。
 */
export function readDelegationTaskText(payload: unknown): string {
  if (!isObject(payload)) return ''
  const messages = payload.messages
  if (!Array.isArray(messages)) return ''
  for (const message of messages) {
    if (!isObject(message)) continue
    if (message.role !== 'user') continue
    if (!isUserAuthored(message)) continue
    const content = message.content
    if (!Array.isArray(content)) continue
    const texts: string[] = []
    for (const block of content) {
      if (!isObject(block)) continue
      if (block.type !== 'text') continue
      const text = block.text
      if (typeof text === 'string' && text.length > 0) texts.push(text)
    }
    const joined = texts.join('\n')
    if (joined.length === 0) continue
    const guidanceIndex = joined.indexOf(RETURN_GUIDANCE_PREFIX)
    const task = guidanceIndex >= 0 ? joined.slice(0, guidanceIndex) : joined
    return task.trim()
  }
  return ''
}

/**
 * true when a claimed message was authored by the USER side rather than a plugin.
 * A message whose `source.kind` is anything other than `'user'` (or whose
 * `source` is absent, which only a foreign/hand-built payload produces) is NOT
 * the delegation's task text — see {@link readDelegationTaskText}.
 */
function isUserAuthored(message: Record<string, unknown>): boolean {
  const source = message.source
  if (source === undefined) return true
  if (!isObject(source)) return false
  return (source as { readonly kind?: unknown }).kind === 'user'
}

/**
 * 本会话是否**已经**注入过（幂等审计的唯一真源 = 会话内日志）。上游的判据是
 * 「命令 pane 的 text part 里已有 CONTEXT_INFO_MARKER」（start-work-hook.ts:224），
 * 落点就是**已入队的消息文本**；DSH 的等价物 = 会话日志里已有一条 user 消息
 * 带该 marker。
 *
 * 与 registrar 的会话内守卫的关系：`injected`（`WeakMap<object, true>`）是 O(1) 的
 * **热路径**短路——每个会话在**本进程内**首次注入后打标，keyed 会话对象、随 fiber
 * 回收；本审计是**跨重启/冷续**的兜底真源（会话日志持久）。注册面把两者接成
 * **或**：**任一**命中即跳过注入（见 listener 的短路条件与单测两条各自独立触发的
 * 用例）——保守方向（漏注入 ≠ 重复注入）。
 */
export function hasContextMarkerInSession(session: unknown): boolean {
  if (!isObject(session)) return false
  const s = session as SessionLike
  let events: readonly unknown[]
  try {
    if (typeof s.ownEvents === 'function') events = s.ownEvents()
    else if (typeof s.snapshotEvents === 'function') events = s.snapshotEvents()
    else return false
  } catch {
    return false
  }
  for (const event of events) {
    if (!isObject(event)) continue
    if ((event as { readonly type?: unknown }).type !== 'user/message') continue
    const data = (event as { readonly data?: unknown }).data
    if (!isObject(data)) continue
    const content = data.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!isObject(block)) continue
      const text = block.text
      if (typeof text === 'string' && text.includes(ULW_EXECUTE_CONTEXT_MARKER)) return true
    }
  }
  return false
}

// ── boulder 投影（S-1 的落地：会话内事实，非磁盘） ──────────────────────────

/**
 * 本会话的 work 身份（descriptor 的 label，一次 descriptor 扫描的副产物）。
 * **不是**上游的 `plan_name`：DSH 的委派 label 是模型自填的 `description`
 * （dsh-tool-subagent），因此它只用作**日志/观测**，绝不参与「哪个计划」的判定
 * （计划身份只能来自计划文件本身）。
 *
 * 导出是为了让单测能直接钉住这条「label 只观测不判定」的契约；listener 走的是
 * `readDescriptorIdentity(...).label`（同一次扫描，不重复读 `ownEvents()`）。
 */
export function readWorkLabel(session: unknown): string | undefined {
  return readDescriptorIdentity(session).label
}

/**
 * S-1 的落地形态：DSH 侧没有 `.omo/boulder.json` 的读者，故 boulder 投影的
 * **默认**是空的（= 「没有已知的活动 work」），判定树因此走计划发现主干。
 *
 * 保留为函数（而不是直接内联 `EMPTY_BOULDER_VIEW`）是为了让「未来接上会话内
 * work 状态」有一个唯一接缝：本函数是唯一构造 `BoulderView` 的地方。
 */
export function readBoulderView(_session: unknown): BoulderView {
  return EMPTY_BOULDER_VIEW
}

// ── listener ────────────────────────────────────────────────────────────────

/** listener 的依赖缝（单测注入，registrar 用真实实现）。 */
export interface UlwExecuteDeps {
  /** apply 时预构建的静态文本块表（纪律③）。 */
  readonly blocks: StaticTextBlocks
  /**
   * 计划清单的**读取缝**。计划清单是唯一真正需要读盘的输入：`.omo/plans/*.md`
   * 的进度来自文件内容，而上游 `getPlanProgress` 同样是「每次问就现读」
   * （boulder-state plan-progress.ts:35-51，无缓存）。
   *
   * ⚠️ **纪律③的实测边界（登记在案，不静默放宽）**：`apply()` 时**拿不到**会话
   * 的工作区根——插件的 `process.cwd()` 是 dsh 服务的启动目录，而本 hook 要读的
   * 是**子会话 header 的 cwd**（委派子会话的 cwd 由父会话复制，两者不必等于
   * 服务启动目录；e2e 沙箱里也确实不同）。因此本移植把读面做成**按 cwd 记忆化**：
   * 某个工作区根在**首次**被某个 atlas 会话看到时读一次（`readPlanInventory`），
   * 之后同一 cwd 的每一次 pre-step 都命中内存缓存，**不再触盘**。即本 listener
   * 对每个工作区根总共读一次盘，而不是每步一次——这正是纪律③要防的「每步 I/O
   * 与不可预期延迟」；完全零读盘在此处会让计划发现（本模块的核心语义）无输入。
   * 首个读点另打一行 `inventory loaded` 日志，使这条边界在运行时可审计。
   * 单测注入固定清单（零 I/O 与真实读盘两条路径都有覆盖）。
   */
  readonly inventoryFor: (directory: string) => PlanInventory
  /** 读取当前 jobs surface（延迟获取的落地值；缺席为 undefined）。 */
  readonly readJobs: () => JobsSurface | undefined
  /** 诊断口（registrar 传 console.warn；单测传收集器）。 */
  readonly log: (line: string) => void
  /** 时钟（单测可注入固定值；生产用 `new Date().toISOString()`）。 */
  readonly now: () => string
}

/**
 * 按 cwd 记忆化的计划清单读取器（见 {@link UlwExecuteDeps.inventoryFor}）。
 * 缓存是 registrar 闭包里的一个 Map（fiber 作用域，随插件销毁）；键是会话的
 * 工作区根，值是**已解析的清单**（不含任何 live 对象）。`onFirstLoad` 在该键
 * **首次**被读取后回调一次（调用方据此打审计日志），缓存命中时不回调。
 */
export function createInventoryReader(
  read: (directory: string) => PlanInventory,
  onFirstLoad?: (directory: string, inventory: PlanInventory) => void,
): (directory: string) => PlanInventory {
  const cache = new Map<string, PlanInventory>()
  return (directory) => {
    const cached = cache.get(directory)
    if (cached !== undefined) return cached
    let inventory: PlanInventory
    try {
      inventory = read(directory)
    } catch {
      inventory = EMPTY_PLAN_INVENTORY
    }
    cache.set(directory, inventory)
    if (onFirstLoad !== undefined) {
      try {
        onFirstLoad(directory, inventory)
      } catch {
        // 审计日志不值得一次 pre-step 失败。
      }
    }
    return inventory
  }
}

/** `agent/pre-step` waterfall listener 的签名（返回未知值给 driver）。 */
export type PreStepListener = (payload: unknown, next: unknown) => Promise<unknown>

/** 一行诊断（稳定、可 grep，与 boot marker 区分）。 */
export function formatUlwExecuteLine(what: string): string {
  return `[omo-hooks] ${ULW_EXECUTE_ID}: ${what}`
}

/** jobs 缺席的 NOTE 行（loud-but-non-fatal；注册测试逐字钉死）。 */
export const JOBS_MISSING_NOTE =
  `[omo-hooks] ${ULW_EXECUTE_ID} NOTE: jobs service never appeared; `
  + 'work-session registration degraded to the notepad scaffold only'

/** 吞掉的失败行。 */
export function formatUlwExecuteFailureLine(what: string, err: unknown): string {
  return `[omo-hooks] ${ULW_EXECUTE_ID}: ${what}: ${describeError(err)}`
}

/** 一次日志调用绝不能让一步失败（纪律②）。 */
function logSafely(deps: UlwExecuteDeps, line: string): void {
  try {
    deps.log(line)
  } catch {
    // 诊断不值得一次 turn/step 失败。
  }
}

/**
 * 构造 `agent/pre-step` listener。幂等守卫是**闭包内的 WeakMap**
 * （keyed 会话对象 → 已注入标记），随 fiber 回收（纪律⑤）；它只加速，
 * 真源仍是会话日志里的 marker（`hasContextMarkerInSession`）。
 *
 * 返回 `void` 语义：永远 `return next()`（waterfall 合同），效果是
 * `agent.inject(...)` 的**副作用**（把上下文排到下一个 pre-step）。
 */
export function createUlwExecuteListener(deps: UlwExecuteDeps): PreStepListener {
  const injected = new WeakMap<object, true>()
  return async (payload, next) => {
    const delegate = next as PreStepNextLike
    // The `next()` calls are deliberately OUTSIDE the try (discipline ②, the
    // directory-readme-injector.ts:528-550 precedent). A cordis waterfall `next`
    // advances the callback queue on EVERY call, so a `delegate()` inside the try
    // would route a *downstream* throw into this catch, re-enter the waterfall a
    // second time, and — when that second call succeeds — swallow the real
    // downstream error (the F-1 defect). The body's own logic lives in
    // `runUlwExecuteStep`, which contains no `next()` call at all; the two
    // mutually exclusive delegates below (catch = fail open, fall-through =
    // success) make `next()` run exactly once per invocation.
    try {
      await runUlwExecuteStep(deps, payload, injected)
    } catch (err) {
      // FAIL OPEN（纪律②）：pre-step 抛错会让整步失败；不注入是安全方向。
      logSafely(deps, formatUlwExecuteFailureLine('listener failed', err))
      return await delegate()
    }
    return await delegate()
  }
}

/**
 * The listener's OWN logic, deliberately free of any `next()` call (F-1): it runs
 * inside the fail-open try, its early exits are plain `return`s, and the single
 * `next()` call happens in the caller after this resolves. Splitting it out is
 * what makes "next() 永远在 try 之外" structurally true instead of a comment.
 *
 * Per-event descriptor read (one `ownEvents()` pass per pre-step, never two): the
 * identity gate and the job label read the SAME descriptor, and a second scan per
 * step would be pure waste on the hot path. `workLabel` is a local, so no state
 * leaks across steps (纪律⑤).
 */
async function runUlwExecuteStep(
  deps: UlwExecuteDeps,
  payload: unknown,
  injected: WeakMap<object, true>,
): Promise<void> {
  const agent = readPreStepAgent(payload)
  if (agent === undefined || typeof agent.inject !== 'function') return
  const session = readAgentSession(agent)
  const identity = readDescriptorIdentity(session)
  if (!identity.found) {
    // 非委派子会话（没有 descriptor）：本 hook 不适用（上游的对应形态是
    // 「没有命令 marker」）。不记日志——这是绝大多数 pre-step 的常态。
    return
  }
  const workLabel = identity.label
  const alreadyInjected = (isObject(session) && injected.has(session))
    || hasContextMarkerInSession(session)
  const taskText = readDelegationTaskText(payload)
  const built = alreadyInjected || !isAtlasPersona(identity.persona)
    ? { text: '', selection: undefined, directory: '' }
    : buildContextTextFor(deps, session, taskText)
  const decision = decideUlwExecuteActivation({
    persona: identity.persona,
    taskText,
    alreadyInjected,
    contextText: built.text,
  })
  // ⚠️ 副作用必须在**决定注入之后**才落地（P3-T17 e2e 实测的 runaway）：
  // 早期版本把 `runPlanSelection` 放在构建上下文里（= 每次 pre-step 都跑），
  // 于是「跳过注入」的会话也在反复注册 `ctx.jobs` work session；每个 job 立即
  // 结算又给该会话投递一条完成通知 → 新的 pre-step → 再注册……形成**自激循环**
  // （无意图对照场景实测 268 步、job 号一路涨到 ulw-execute-268）。
  // 上游同形：只有**选中计划**的那几个分支才 `writeBoulderState` /
  // `ensureNotepadScaffold`，而选中分支必然产出非空 contextInfo 并被注入。
  if (decision.kind === 'skip') {
    logSafely(deps, formatUlwExecuteLine(`skipped: ${decision.reason}`))
    return
  }

  logSafely(deps, formatUlwExecuteLine(`branch=${built.branch ?? '(none)'}`))
  runPlanSelection(
    deps,
    session,
    agent,
    built.directory,
    readSessionId(session),
    built.selection,
    workLabel,
  )
  agent.inject(buildInjectionMessage(decision.text))
  if (isObject(session)) injected.set(session, true)
  logSafely(deps, formatUlwExecuteLine(`context injected (${decision.text.length} chars)`))
}

/**
 * 算上下文文档 + 把「计划选择」的副作用（notepad 脚手架 + jobs work session）
 * 落到注册的 jobs surface 上。所有 I/O 都在 `startWorkJob`（写脚手架）里，
 * 且只在**选中了计划**的这一趟发生（上游同形：只有选计划的三个分支写 state）。
 */
function buildContextTextFor(
  deps: UlwExecuteDeps,
  session: unknown,
  taskText: string,
): {
  readonly text: string
  readonly selection: PlanSelection | undefined
  readonly directory: string
  readonly branch?: string
} {
  const cwd = readSessionCwd(session)
  if (cwd === undefined) {
    // 没有工作区根 → 计划发现无输入 → 空文档（判定树会返回 no-plans 文案，
    // 但空 cwd 连 `.omo/plans` 都拼不出来，直接短路比伪造一个路径诚实）。
    return { text: '', selection: undefined, directory: '' }
  }
  const sessionId = readSessionId(session)
  const timestamp = deps.now()
  const request = parseUserRequestFor(taskText)
  const result = buildWorkContextDocument({
    blocks: deps.blocks,
    sessionId,
    timestamp,
    directory: cwd,
    activeAgent: 'atlas',
    inventory: deps.inventoryFor(cwd).entries,
    explicitPlanName: request.planName,
    explicitWorktreePath: request.explicitWorktreePath,
    makePr: request.makePr,
    ship: request.ship,
    // S-1：无偏好计划（会话历史读面未移植）。
    preferredPlanPath: null,
    boulder: readBoulderView(session),
    // S-2：`--worktree <path>` 的校验 = 非空即接受（不做 git 探测）。
    validateWorktree: (candidate) => (candidate.trim().length > 0 ? candidate.trim() : undefined),
  })
  return { text: result.text, selection: result.selectPlan, directory: cwd, branch: result.branch }
}

/**
 * 从任务文本解析出上游 `parseUserRequest` 的四元组，**且区分两种输入形态**
 * （P3-T1 §3 C-2 的落地处置）：
 *
 *   * **Phase 4 形态**：任务文本真的带 `<user-request>…</user-request>` 标签
 *     （命令模板产物）→ 直接交给 `parseUserRequest`，上游语义逐字成立
 *     （planName / --worktree / --make-pr / --ship 全部生效）。
 *   * **Phase 3 形态**：**没有**标签 → 上游的解析器无从下手（它会返回
 *     `EMPTY_REQUEST`），而此时把**整段任务文本**当作计划名是**错的**：委派
 *     prompt 是一段自然语言（"start work on the plan: read it and begin
 *     execution"），把它当计划名会让判定树走进「计划未找到 → 只有唯一未完成
 *     计划 → 兜底选中」的分支，并给用户可见文案塞进一条**虚假的**
 *     `**Reason**: Only incomplete plan available after "<整段话>" did not match
 *     any plan`。故 Phase 3 形态下本函数返回 `EMPTY_REQUEST`（= **无显式计划
 *     名、无 flag**），判定树因此走它的自然主干：无活动 work → 计划发现 →
 *     唯一未完成计划自动选中 / 多计划询问。这正是本阶段定义的语义，也让
 *     `--worktree` / `--make-pr` / `--ship` 三个 flag 在 Phase 3 **不生效**
 *     （它们是 Phase 4 命令面参数；本文件头部 S-2 已把 worktree 探测登记为跳过段）。
 *
 * 两个形态都由单测钉死；Phase 4 模板落地后**无需改动**本函数。
 */
export function parseUserRequestFor(taskText: string): ParsedUserRequest {
  if (!hasUserRequestTag(taskText)) return EMPTY_REQUEST
  return parseUserRequest(taskText)
}

/**
 * 执行计划选择的副作用（上游 `createNewWorkOrInitialize` /
 * `buildAutoSelectedPlanContextWithStateInit`）。任何失败都只记一行、绝不上抛
 * （纪律②：注入已决定，副作用失败不能吃掉它）。
 */
function runPlanSelection(
  deps: UlwExecuteDeps,
  session: unknown,
  agent: PreStepAgentLike,
  cwd: string,
  sessionId: string,
  selection: PlanSelection | undefined,
  workLabel: string | undefined,
): void {
  if (selection === undefined) return
  try {
    const planName = planNameOf(selection.planPath)
    const jobs = deps.readJobs()
    const result = startWorkJob({
      jobs,
      directory: cwd,
      planName,
      sessionId,
      // `dsh-jobs` 的 `JobStart.owner` 要求的是**活 Agent 实例**（"The instance
      // must be the one currently registered under its agent id"），不是它的
      // session；传错对象会被 registry 预检拒绝并降级（startWorkJob 吞掉），
      // 那样 job 面就永远不生效。
      agent,
    })
    logSafely(deps, formatUlwExecuteLine(
      `work session ${result.jobId ?? '(no jobs)'} plan=${planName}`
      + ` notepad=${result.scaffold.created.length} created`
      + `/${result.scaffold.skipped.length} skipped`
      + (result.degraded ? ' [jobs absent]' : '')
      + (workLabel !== undefined ? ` label="${workLabel}"` : ''),
    ))
  } catch (err) {
    logSafely(deps, formatUlwExecuteFailureLine('plan selection failed', err))
  }
}

/** 计划文件名（去 `.md`）；与 plan-discovery 的 `getPlanName` 同语义。 */
export function planNameOf(planPath: string): string {
  const normalized = planPath.replace(/\\/g, '/')
  const base = normalized.slice(normalized.lastIndexOf('/') + 1)
  return base.endsWith('.md') ? base.slice(0, -'.md'.length) : base
}

// ── 注册 ────────────────────────────────────────────────────────────────────

/**
 * 读取 `ctx.get('jobs')`（严格读；缺席 ⇒ 降级路径）。与
 * background-notification 的 `readJobsService` 同形。
 */
export function readJobsService(ctx: HooksRegistrationContext): JobsSurface | undefined {
  if (typeof ctx.get !== 'function') return undefined
  const jobs = ctx.get('jobs')
  return isJobsSurface(jobs) ? jobs : undefined
}

/**
 * 本 registrar。上游 20 文件 → 1 个 pre-step listener + 1 个 jobs 延迟获取 +
 * 1 个 `session/disposed` 清理（纪律⑤：幂等守卫随会话回收）。
 *
 * `entry.event`（manifest 的 PRIMARY event = `agent/pre-step`）是唯一事件来源；
 * 本文件不写第二个事件字面量（纪律④）。
 */
export const registerUlwExecute: HookRegistrar = (
  ctx: HooksRegistrationContext,
  entry: HookManifestEntry,
) => {
  // 纪律③的静态半：静态文本块在 apply() 时构建一次（纯常量函数）；
  // 计划清单走按 cwd 记忆化的读面（见 UlwExecuteDeps.inventoryFor —— 每个工作区
  // 根首次现形时读一次并打一行审计日志，之后的 pre-step 不再触盘）。
  const inventoryFor = createInventoryReader(readPlanInventory, (directory, inventory) => {
    console.warn(formatUlwExecuteLine(
      `inventory loaded for ${directory}: ${inventory.entries.length} plan(s)`
      + ` (${inventory.scannedDirs.length} dir(s) scanned)`,
    ))
  })
  const blocks = buildStaticTextBlocks()

  let jobs = readJobsService(ctx)
  if (jobs === undefined && typeof ctx.inject === 'function') {
    try {
      ctx.inject(['jobs'], (injected) => {
        const discovered = isJobsSurface(injected.jobs)
          ? injected.jobs
          : (typeof injected.get === 'function' ? injected.get('jobs') : undefined)
        if (isJobsSurface(discovered)) {
          jobs = discovered
          console.log(formatUlwExecuteLine('jobs service observed; work-session registration live'))
          return
        }
        console.log(JOBS_MISSING_NOTE)
      })
    } catch (err) {
      console.warn(formatUlwExecuteFailureLine('ctx.inject("jobs") failed', err))
    }
  } else if (jobs === undefined) {
    console.log(JOBS_MISSING_NOTE)
  }

  const listener = createUlwExecuteListener({
    blocks,
    inventoryFor,
    readJobs: () => jobs,
    log: (line) => console.warn(line),
    now: () => new Date().toISOString(),
  })

  ctx.on(entry.event, (payload, next) => listener(payload, next))

  // 幂等守卫的 WeakMap 是 listener 闭包内的；这条注册是**兜底**：将来若守卫
  // 改成强引用，会话回收的清理点已经就位（纪律⑤）。
  ctx.on('session/disposed', () => {})
}
