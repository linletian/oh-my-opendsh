// team-probe-plugin — P5-T9 双评审修复轮的 e2e 沙箱探针 cordis 插件（不进 boot
// 默认面：只经 `dsh plugin add` + overlay `insert:` 行测进两枚 T9 场景的沙箱，
// Q-3/Q-5b 沙箱探针插件同款——.omo/evidence/p5t1/q5b/q5b-seat-plugin/ 的先例）。
//
// 它存在的全部理由：评审 B 的 MAJOR-1/MAJOR-2 钉死「恒真断言不可作证据」——
// `subagents/list` 这个 RPC 面在 web-remote 上根本没注册（typert.host.js 实测
// 404），旧断言的 404 容错支因此永远为真；jobs 面旧断言只验脚本自己没写
// run_in_background（构造性恒真）。修法是换**宿主服务直读面**：插件跑在 boot
// 进程内，经 `ctx.subagents`/`ctx.jobs` 的原生服务面读成员树/jobs 面，结果经
// tool/result 落进 lead 的 durable 会话日志——drive.mjs 逐字段断言那段文本
// （Q-5b 同款取证链：探针打真数据，drive 断真字段，造一次假必红）。
//
// ── 只读纪律 ──────────────────────────────────────────────────────────────────
// 两枚工具全是只读观测：listDescendants（dsh-subagent 0.2.0-rc.2 lib/index.js:
// 2989 → list-children.js 的目录遍历，不 load 不 resume 任何 Agent）与
// jobs.list（dsh-jobs-local 0.2.0-rc.2 lib/index.js:493，`owner.id === caller`
// 围栏 + 无主行，纯读）。零 interrupt、零 drain、零写盘——探针碰了执行面就
// 不再是旁观者。
//
// ── 零依赖 ────────────────────────────────────────────────────────────────────
// 零 @deepseek-ai import（q5b/omo 插件同构纪律），duck-typed ctx；`jobs` 经
// ctx.get 惰性取（未挂载时如实 ok:false + 具名 detail，绝不冒充空面）。
export const name = 'team-probe-plugin'
export const inject = ['agents', 'subagents', 'tools']

const log = (msg) => console.log(`[team-probe-plugin] ${msg}`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// render 的两段式是取证协议：第一行人读（marker + 计数 + settled），第二行是
// 纯 JSON——drive.mjs 按 `TEAM-PROBE-*-JSON=` 前缀取尾行 JSON.parse，逐字段
// 断言。改这里 = 改取证协议，drive 侧的 reader 必须同 commit 对齐。
const DESCENDANTS_MARKER = 'TEAM-PROBE-DESCENDANTS_JSON='
const JOBS_MARKER = 'TEAM-PROBE-JOBS_JSON='

export function apply(ctx) {
  log('loaded')

  // ── team_probe_list_descendants ────────────────────────────────────────────
  // 真面 = ctx.subagents.listDescendants(rootSessionId)（0.2.0-rc.2 已装面，
  // typert.host.js:176-177 的签名 listDescendants(rootSessionId: SessionId,
  // signal?: AbortSignal): Promise<SubagentDescendantListEntry[]>）。
  // 行形状逐列搬：{kind, id, parentId, depth, activity, mode, hasChildren}
  // （diagnostic 行带 reason）。activity 的语义钉：list-children.js 的
  // `sessions.get(entry.id) === undefined ? 'inactive' : 'running'`——
  // ctx.sessions 是内存态 store（dsh-session lib/index.js 的 SessionStore
  // 头注逐字 "In-memory session store"），成员 Agent 结算 dispose 后该行必转 inactive；
  // durable catalog 的 append-only 事实（catalog.ts 无移除事件）意味着成员行
  // **留在**目录里、以 inactive 的形态存在——「拆除后无活体成员行」钉的就是
  // 这个 inactive 形态 + depth<2（无孙代）+ 行集恰等于两名成员（多报必红）。
  //
  // settled 轮询窗口：interrupt 的 durable 关账在前、内存 dispose 有自己的
  // 落地拍——探针在窗口内轮询到全员 inactive，超时**如实报 settled:false**
  // （drive 判红），不谎报（q5b_probe_wait_settled 同一纪律）。
  ctx.tools.register({
    name: 'team_probe_list_descendants',
    description: 'P5-T9 probe: read the caller-rooted descendant tree through the native host service ctx.subagents.listDescendants (in-process direct read, no web-remote RPC); polls until every child row reports activity=inactive or the window expires, and returns every row verbatim (id/parentId/depth/kind/activity) for the driver to assert field by field.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {
        wait_inactive_ms: { type: 'integer', description: 'milliseconds to keep polling for all-children-inactive before reporting honestly (default 20000, capped 30000)' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'rootSessionId', 'settled', 'waitedMs', 'rowCount', 'rows'],
        properties: {
          ok: { type: 'boolean' },
          rootSessionId: { type: 'string' },
          settled: { type: 'boolean' },
          waitedMs: { type: 'integer' },
          rowCount: { type: 'integer' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'parentId', 'depth', 'kind'],
              properties: {
                id: { type: 'string' },
                parentId: { type: 'string' },
                depth: { type: 'integer' },
                kind: { type: 'string' },
                activity: { type: 'string' },
                mode: { type: 'string' },
                hasChildren: { type: 'boolean' },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `TEAM-PROBE-DESCENDANTS ok=${value.ok} settled=${value.settled} waitedMs=${value.waitedMs} rows=${value.rowCount}` },
        { type: 'text', text: `${DESCENDANTS_MARKER}${JSON.stringify(value.rows)}` },
      ],
    },
    async execute(args, exec) {
      const sender = exec.agent
      if (sender === undefined) throw new Error('team_probe_list_descendants: exec.agent is undefined')
      const rootSessionId = String(sender.id)
      const waitMs = Math.max(0, Math.min(30_000, Number(args.wait_inactive_ms ?? 20_000)))
      const startedAt = Date.now()
      const deadline = startedAt + waitMs
      let rows = []
      let settled = false
      let failure = undefined
      for (;;) {
        try {
          exec.signal?.throwIfAborted?.()
          const listed = await ctx.subagents.listDescendants(rootSessionId, exec.signal)
          rows = listed.map((row) => ({
            id: String(row.id),
            parentId: String(row.parentId),
            depth: Number(row.depth),
            kind: String(row.kind),
            activity: String(row.activity ?? row.kind),
            ...row.mode === undefined ? {} : { mode: String(row.mode) },
            ...row.hasChildren === undefined ? {} : { hasChildren: Boolean(row.hasChildren) },
            ...row.reason === undefined ? {} : { reason: String(row.reason) },
          }))
          settled = rows.every((row) => row.kind !== 'child' || row.activity === 'inactive')
          failure = undefined
        } catch (error) {
          // 服务面坏了不静默：ok:false + 具名 detail 进 JSON，drive 判红。
          failure = error instanceof Error ? error.message : String(error)
          settled = false
        }
        if (settled || failure !== undefined || Date.now() >= deadline) break
        await sleep(250)
      }
      const waitedMs = Date.now() - startedAt
      log(`team_probe_list_descendants root=${rootSessionId} settled=${settled} waitedMs=${waitedMs} rows=${rows.length}${failure === undefined ? '' : ` error=${failure}`}`)
      return {
        ok: failure === undefined,
        rootSessionId,
        settled,
        waitedMs,
        rowCount: rows.length,
        rows: failure === undefined ? rows : [{ id: `PROBE-ERROR:${failure}`, parentId: rootSessionId, depth: 0, kind: 'probe-error', activity: 'unknown' }],
      }
    },
  })

  // ── team_probe_jobs_list ───────────────────────────────────────────────────
  // 真面 = ctx.jobs 的 lead owner 读（0.2.0-rc.2 dsh-jobs-local lib/index.js:
  // 493 `list(caller)`：`owner.id === caller` 的行 + 无主行；v2 caller 是
  // SessionId 字符串——guard §④ 的同一 caller 形状裁决）。成员不进 jobs 面
  // （Q-6 §4）的运行时证据 = 这些行的 owner 列里一个成员会话 id 都不出现。
  // jobs 服务缺席时 ok:false + 具名 detail（drive 判红，不空转蒙绿）。
  ctx.tools.register({
    name: 'team_probe_jobs_list',
    description: 'P5-T9 probe: read the caller-owned jobs surface through the native host service ctx.jobs.list (lead owner face: caller-owned + unowned rows); returns every row (id/status/owner) verbatim so the driver can assert that NO row is owned by a team member session (Q-6 §4 members-never-enter-jobs runtime evidence).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'ownerSessionId', 'rowCount', 'rows'],
        properties: {
          ok: { type: 'boolean' },
          ownerSessionId: { type: 'string' },
          rowCount: { type: 'integer' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'status'],
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                owner: { type: 'string' },
                kind: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `TEAM-PROBE-JOBS ok=${value.ok} rows=${value.rowCount}` },
        { type: 'text', text: `${JOBS_MARKER}${JSON.stringify(value.rows)}` },
      ],
    },
    execute(args, exec) {
      const sender = exec.agent
      if (sender === undefined) throw new Error('team_probe_jobs_list: exec.agent is undefined')
      const ownerSessionId = String(sender.id)
      const jobs = ctx.get?.('jobs')
      if (jobs === undefined || jobs === null || typeof jobs.list !== 'function') {
        log('team_probe_jobs_list jobs service absent')
        return { ok: false, ownerSessionId, rowCount: 1, rows: [{ id: 'PROBE-ERROR:jobs service absent', status: 'unknown' }] }
      }
      const listed = jobs.list(ownerSessionId)
      const rows = listed.map((row) => ({
        id: String(row.id),
        status: String(row.status),
        ...row.owner === undefined || row.owner === null ? {} : { owner: String(row.owner) },
        ...row.kind === undefined ? {} : { kind: String(row.kind) },
      }))
      log(`team_probe_jobs_list owner=${ownerSessionId} rows=${rows.length}`)
      return { ok: true, ownerSessionId, rowCount: rows.length, rows }
    },
  })

  log('tools registered: team_probe_list_descendants, team_probe_jobs_list')
}
