// ulw-execute/identity.ts — P3-T17: 激活信号的身份面（`omo-atlas` 锚点）。
//
// 上游：`hooks/start-work/start-work-hook.ts:186-192` 把**发起命令的会话**切换
// 成 atlas（`updateSessionAgent(input.sessionID, "atlas")` /
// `output.message["agent"] = resolveRegisteredAgentName("atlas")`）——上游的
// 「激活目标」是**同一个会话被指派给 atlas**。DSH 的组合模型没有「会话切 agent」
// 这个动作（agent 在子会话创建时按 roster 行固定），所以本移植的激活目标是
// **已被委派出来的 atlas 子会话**（Phase 2 名册已就位）。
//
// 身份面 = 子会话自有的持久 `subagent/descriptor` 事件里的 `persona`（T16 先例，
// 见 ../prometheus-md-only.ts 的实测段）：descriptor v3 的
// `ContinuableSubagentDescriptorData.persona` 是「该委派行的 persona 文本」
// （dsh-subagent/lib/types/descriptor.d.ts），而
// `omo-agents/system-sections/atlas-persona.md:35` 恰好自称一次
// `omo-atlas` —— 逐行唯一锚点（单测对真实 persona 文件集做漂移守测）。
//
// ⚠️ **实测边界（与 H-26 完全相同，已登记）**：persona 只在
// `mode: 'continuable'`（`run_in_background: true`）的子会话 descriptor 上存在；
// 前台（one-shot）委派的 descriptor 逐字构造为
// `{version, mode:'one-shot', provider, label}`，**无 persona 字段**
// （dsh-subagent/lib/index.js:3150-3154）。因此**前台 atlas 委派不可识别、本
// listener 静默**——降级为「不触发」，绝不「对所有人触发」。
// 读取面 = `session.ownEvents()`（**内存**会话日志，非读盘）；descriptor 在子
// 会话创建窗口内（首个请求之前）落地，故首个 pre-step 即已可见（测试实测）。
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see ../index.ts).

/**
 * THE DSH identity anchor: the `omo-<id>` self-name that
 * `omo-agents/system-sections/atlas-persona.md` carries exactly once
 * (`You are **omo-atlas**, the master orchestrator.`). The unit suite asserts
 * against the REAL file set that this string appears in exactly one persona
 * file — the drift guard for the assumption above.
 */
export const ATLAS_PERSONA_ANCHOR = 'omo-atlas'

/** The persona file the anchor is drift-guarded against (repo-relative). */
export const ATLAS_PERSONA_FILE = 'patches/omo-dsh/omo-agents/system-sections/atlas-persona.md'

/** 会话面（live Session）本文件真正读到的叶子。 */
export interface SessionLike {
  ownEvents?(): readonly unknown[]
  snapshotEvents?(): readonly unknown[]
}

/** 一次 descriptor 扫描的结果：是否找到 + persona 文本 + 委派 label。 */
export interface DescriptorIdentity {
  readonly found: boolean
  readonly persona: string | undefined
  /** descriptor 的 `label`（上游没有对应物；本移植只用它做日志/观测）。 */
  readonly label: string | undefined
}

/**
 * Reads the child's own durable `subagent/descriptor` persona from the session's
 * IN-MEMORY log. The FIRST descriptor is authoritative (descriptor.d.ts: "appended
 * once by the establishing provider"), so the scan stops at the first one found.
 *
 * 与 ../prometheus-md-only.ts 的 `readDescriptorIdentity` **同构**——两插件之间
 * 禁止互相 import（计划书 §4.1），故各自维持一份最小实现；漂移风险由两侧单测
 * 各自对真实 descriptor 形状断言承担。本移植多带一个 `label`：它在一次扫描里
 * 顺手取出，`readWorkLabel` 因此不必再扫第二遍（本 listener 每步只扫一次
 * `ownEvents()`）。
 */
export function readDescriptorIdentity(session: unknown): DescriptorIdentity {
  if (typeof session !== 'object' || session === null) {
    return { found: false, persona: undefined, label: undefined }
  }
  const s = session as SessionLike
  let events: readonly unknown[]
  try {
    if (typeof s.ownEvents === 'function') events = s.ownEvents()
    else if (typeof s.snapshotEvents === 'function') events = s.snapshotEvents()
    else return { found: false, persona: undefined, label: undefined }
  } catch {
    return { found: false, persona: undefined, label: undefined }
  }
  for (const event of events) {
    if (typeof event !== 'object' || event === null) continue
    if ((event as { readonly type?: unknown }).type !== 'subagent/descriptor') continue
    const data = (event as { readonly data?: unknown }).data
    if (typeof data !== 'object' || data === null) {
      return { found: true, persona: undefined, label: undefined }
    }
    const persona = (data as { readonly persona?: unknown }).persona
    const label = (data as { readonly label?: unknown }).label
    return {
      found: true,
      persona: typeof persona === 'string' ? persona : undefined,
      label: typeof label === 'string' && label.length > 0 ? label : undefined,
    }
  }
  return { found: false, persona: undefined, label: undefined }
}

/** 该会话是否是 atlas 子会话（persona 含 {@link ATLAS_PERSONA_ANCHOR}）。 */
export function isAtlasPersona(persona: string | undefined): boolean {
  return persona !== undefined && persona.includes(ATLAS_PERSONA_ANCHOR)
}
