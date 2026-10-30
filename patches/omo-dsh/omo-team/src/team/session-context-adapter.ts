// session-context-adapter.ts — P5-T8b · TeamSessionContext 适配器（DSH 原生，无上游对应物）。
//
// ── 边界（任务书钉死：OMO 形 session client → DSH ctx.agents/catalog 面映射）──
// vendored team-core 的 resume 族（session-liveness.ts:16 逐字
// `ctx.client.session.get({ path: { id } })`）说的是 **OMO 的 opencode-sdk 形
// HTTP client 话术**——`{ path: { id } }` 入参、`{ data?, error? }` 回包、404/
// 'not found' 判缺席（error-normalization.ts:17-22 的判定面）。DSH 宿主没有这
// 台 HTTP server，但有**同一事实的载体**：会话记录既在**活体注册表**
// （`ctx.agents.get(id)`，dsh-agent types/index.d.ts:343）也在**持久会话面**
// （`ctx.sessionQuery.observeSession(id)`，dsh-session-query）。
//
// ⚠️ P5-T16 评审 BLOCKER-1 的更正（本文件的**语义更正**，不是措辞）：
//   旧版把 `ctx.agents.get(id)` 当成「会话是否存在」的等价面，并写下
//   「命中 = 活体在场 … 语义等价」。**那不是等价面**——宿主逐字写的是
//   "Look up a **live** agent … returns the agent, or undefined when **no live
//   agent** has that id"（dsh-agent types/index.d.ts:339-343）：它查的是**活体
//   注册表**，不是持久会话账。上游 OMO 的 `client.session.get()` 查的是
//   server 侧**会话记录是否存在**——会话冷着也算存在。
//   两者语义不同 ⇒ 旧映射在**每次 DSH 重启**时确定性地失配：
//     * 插件 apply() 是**启动期**同步调用，resume 是 fire-and-forget——此刻
//       lead 会话尚未物化，`agents.get(leadSessionId)` 必为 undefined ⇒ run 被
//       永久翻成 `orphaned`（终态，回不来）；
//     * 即便 lead 在场，continuable 成员在重启后是**冷态**（DSH 的 cold resume
//       证明：成员会话落盘可冷启，但未唤醒即未物化）⇒ `stillAlive:false` ⇒
//       同样孤儿化，且 `markDeadWorkersErrored` 把成员的 `sessionId` 抹成
//       undefined 落盘（**不可逆**，参与索引从此失配）。
//   本文件的更正 = 把「存在性」判据换到**持久会话面**：
//
//   OMO 形                              DSH 形
//   client.session.get({path:{id}}) →  活体注册表命中            → { data: <agent> }
//                                  →  持久会话面命中（冷但存在）→ { data: {id} }
//                                  →  持久会话面**确证**不存在    → { error: 404 'not found' }
//                                  →  **无法证伪**（服务缺席/读失败）→ { data: {id} }（保守）
//
//   保守方向的选择是刻意的：`orphaned` 是**终态**（迁移表
//   ALLOWED_TEAM_RUNTIME_TRANSITIONS.orphaned = ∅），判错的代价是**销毁**
//   （run 终态化 + 成员 `sessionId` 被抹）；而「多留一个 active run」的代价是
//   可回收的（lead 可 `team_delete`、boot 的 creating 30min 超时与 deleting
//   扫描照样收口）。**不可证伪的缺席一律按「存在」处理**——宁可漏删，不可误杀。
//
//   持久会话面 = `ctx.sessionQuery.observeSession(id)`（dsh-session-query，
//   基础 bundle 恒挂载：dsh-base/cordis.patch.yml 的 `session-query-sqlite`
//   行，`openAt: never` 仍保留 exact read）。它对**成员子会话**同样成立——
//   DSH 的 cold resume 就是用同一调用读回冷态成员
//   （dsh-subagent/lib/index.js `coldResume()`：`query.observeSession(childId)`），
//   且子会话的落盘头带 `parentSession`/`origin:'subagent'`
//   （dsh-session-persistence-jsonl 的 header 词表）。故「成员存在性」与
//   「lead 存在性」用**同一张面**判定，不需要父子推导。
//
//   * **不伪造 catalog**：不实现 `session.messages`（optional 成员，resume 族
//     零调用点，grep vendored 树：0 处消费）——缺就缺，不造第二事实源；
//   * 每次调用现读，不缓存 Agent 引用（T6 的同一驻留纪律）；持久面读到的
//     observation 租约**即读即放**（`Symbol.dispose`），不把冷读缓存钉住。

import type { TeamSessionClient, TeamSessionContext } from '@oh-my-opencode/team-core/session-client'

import type { TeamLiveAgents } from '../tools/team-message.ts'

/**
 * 持久会话读取面（`ctx.sessionQuery` 的结构化子集）——
 * `observeSession(sessionId, options?)` 解析即「该会话记录存在」，拒绝即缺席
 * （`SESSION_QUERY_SESSION_NOT_FOUND`）。`data` 的具体形状**不承诺**
 * （vendored resume 族只判 `response.data != null`）。
 */
export interface TeamDurableSessions {
  observeSession(
    sessionId: string,
    options?: { readonly signal?: AbortSignal; readonly projectionMode?: 'all' | 'none' },
  ): Promise<unknown>
}

/** 适配器的装配依赖（`ctx.get` = cordis 的可选服务查表，**调用时现读**）。 */
export interface TeamSessionLookupDeps {
  /** 活体 Agent 注册表（`ctx.agents`）——命中即在场，短路持久面。 */
  readonly agents: TeamLiveAgents
  /**
   * cordis 的可选服务查表（`ctx.get`）。用于**现读** `sessionQuery`——
   * 不在 apply 期解析（服务可能晚于插件装载挂载），不缓存未命中的结果
   * （缺席 ≠ 永缺席），只缓存**已命中**的读者（避免每成员一次查表）。
   */
  readonly get?: (name: string) => unknown
}

/** 缺席回包的错误形状（isSessionNotFoundError 的 404 + 'not found' 双判据齐载）。 */
function sessionNotFound(id: string): { status: number; name: string; message: string } {
  return { status: 404, name: 'NotFoundError', message: `session not found: ${id}` }
}

/** 持久面服务名（dsh-session-query 的 cordis 服务名 = `sessionQuery`）。 */
export const TEAM_DURABLE_SESSION_SERVICE = 'sessionQuery'

/**
 * `Symbol.dispose` 的**运行期**取值。TypeScript 的 `lib: ["ES2022"]`
 * 不含 `esnext.disposable`，故此处用一次运行期取值 + 结构化索引访问租约的
 * 释放钩子——不引 `any`，不引 `@deepseek-ai` 类型。
 */
const DISPOSE_SYMBOL: symbol | undefined = (Symbol as unknown as { dispose?: symbol }).dispose

/**
 * 释放持久面租约（观察对象的 `Symbol.dispose` 钩子）。best-effort：释放失败
 * 只让冷读缓存多留一条（容量有界，会被 LRU 逐出），不影响存在性判定。
 */
function releaseObservation(observation: unknown): void {
  if (DISPOSE_SYMBOL === undefined) return
  if (typeof observation !== 'object' || observation === null) return
  const holder = observation as Record<symbol, unknown>
  const dispose = holder[DISPOSE_SYMBOL]
  if (typeof dispose !== 'function') return
  try {
    ;(dispose as () => void).call(observation)
  } catch {
    // 释放是尽力面：租约未放行不改变「存在/不存在」的判定结果。
  }
}

/**
 * 缺席判据：持久面**确证**不存在（而非「读失败」）。
 *
 *   * `SESSION_QUERY_SESSION_NOT_FOUND` —— dsh-session-query 的缺席码
 *     （dsh-session-query/lib/index.js `notFound()`）；
 *   * `SessionPersistenceNotFoundError` —— 持久层自身的缺席名；
 *   * 文本兜底含 'not found' / 'missing'（与 vendored
 *     error-normalization.ts 的判定同族，但**只**用于缺席，不用于别的语义）。
 *
 * 读失败/损坏/服务缺席**不在**此列——它们落到保守臂（按存在处理）。
 */
function isSessionAbsentError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  if (code === 'SESSION_QUERY_SESSION_NOT_FOUND') return true
  const name = (error as { name?: unknown }).name
  if (name === 'SessionPersistenceNotFoundError') return true
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return false
  const lower = message.toLowerCase()
  return lower.includes('not found') || lower.includes('missing')
}

/**
 * 把 DSH 的会话存在性面包成 OMO 形 TeamSessionContext。resumeAllTeams 吃的就是
 * 这个对象（resume.ts:16-19 的 ctx 臂）；除 session.get 外不承诺任何面。
 *
 * 语义更正见文件头（P5-T16 评审 BLOCKER-1）：**存在性 = 持久会话记录存在**
 * （活体或冷态皆算），不是「活体在场」。
 */
export function buildTeamSessionContext(deps: TeamSessionLookupDeps): TeamSessionContext {
  // 已命中的持久面读者（只缓存命中项；未命中不缓存——服务可能晚挂载）。
  let durable: TeamDurableSessions | undefined

  const client: TeamSessionClient = {
    session: {
      async get(input: { readonly path: { readonly id: string } }) {
        const id = input.path.id
        // ① 活体命中 = 在场（短路：活体必然有会话记录）。
        const live = deps.agents.get(id)
        if (live !== undefined) return { data: live }

        // ② 持久面（现读服务表）。
        if (durable === undefined && typeof deps.get === 'function') {
          const candidate = deps.get(TEAM_DURABLE_SESSION_SERVICE) as TeamDurableSessions | undefined
          if (candidate !== undefined && typeof candidate.observeSession === 'function') {
            durable = candidate
          }
        }
        if (durable === undefined) {
          // 无持久面 ⇒ **无法证伪缺席** ⇒ 保守按「存在（冷）」处理。
          // 这一条是 BLOCKER-1 的核心：旧实现在此处把「不活」直接译成
          // 「不存在」，于是每次重启都把活着的团队判死。
          return { data: { id, durable: false } }
        }

        // ③ 持久面精确读：解析 = 记录存在（冷态成员同样成立）。
        try {
          const observation = await durable.observeSession(id, { projectionMode: 'none' })
          releaseObservation(observation)
          return { data: { id, durable: true } }
        } catch (error) {
          if (isSessionAbsentError(error)) {
            return { error: sessionNotFound(id) }
          }
          // 读失败 ≠ 不存在：保守按存在处理（宁可漏删，不可误杀）。
          console.warn(
            `[omo-team] durable session read failed for '${id}' (${error instanceof Error ? error.message : String(error)}) — treating the session as still existing (the resume pass will not orphan it on an unprovable absence)`,
          )
          return { data: { id, durable: false } }
        }
      },
    },
  }
  return { client }
}
