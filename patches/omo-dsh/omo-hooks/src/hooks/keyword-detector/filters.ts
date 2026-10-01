// keyword-detector/filters.ts — P4-T12: the six input gates, mapped to DSH.
//
// Upstream: packages/omo-opencode/src/hooks/keyword-detector/hook.ts @ v4.19.4
// (commit b072d279110bdda2c6ac2525d0d24dc54d16148a), lines 69-117 quoted
// verbatim in ../keyword-detector.ts's S-1. Per-file attribution there.
//
// **语义移植（非逐字复制）**：六道闸的**判据**逐字移植（`isSystemDirective` 的
// 前缀与关键词宽限、`removeSystemReminders` 的标签对、slash 前导正则、
// `isNonOmoAgent` / `isPlannerAgent` 的名字谓词），**载体**全部换成 DSH 的
// `agent/pre-step` 载荷与 `subagent/descriptor` 身份面。每道闸的裁定理由写在
// 各自的导出函数上。
//
// WHY THE GATES EXIST AT ALL. The keyword surface is *user-typed text*: any
// pre-step in any session sees whatever text is on the wire. Upstream's six
// gates are the answer to "which of those texts is a human typing `ulw`, as
// opposed to the system talking, a code sample being quoted, a delegated task
// being relayed, or a planner describing the mode?". Dropping any gate lets a
// mode arm itself from text the user never wrote as a trigger — the failure
// mode is a 30 KB instruction appearing in a session nobody asked for.
//
// SO THIS FILE IS THE DSH MAPPING TABLE, one exported predicate per gate, each
// with its upstream citation and its narrowing reason. Every gate is
// REACHABLE in DSH and unit-tested (tests/omo-hooks/keyword-detector.test.ts);
// nothing here is a no-op standing in for a decision.
//
// The DSH fact that shapes four of the six: `agent/pre-step` carries no
// roster-seat identifier on `payload.agent` (prometheus-md-only.ts header,
// dsh-agent/lib/types/*: `agentPreset` on a CHILD session is the PARENT's,
// copied verbatim — so it names no seat). The only durable seat evidence is
// the child's own `subagent/descriptor` persona, which self-names as
// `omo-<seat-id>` in every Phase 2 persona file. Hence {@link resolveRosterSeat}.
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see index.ts).

import {
  OMO_ROSTER_AGENT_IDS,
  SYSTEM_DIRECTIVE_LEADING_KEYWORD_PATTERN,
  SYSTEM_DIRECTIVE_PREFIX,
  SYSTEM_REMINDER_PATTERN,
} from './constants.ts'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// ── 载荷读面（DSH `agent/pre-step` 形状） ───────────────────────────────────

/** `payload.agent.session`，读不到返回 undefined（与 ulw-execute.ts 同名函数同构）。 */
export function readPreStepSession(payload: unknown): unknown {
  if (!isObject(payload)) return undefined
  const agent = payload.agent
  if (!isObject(agent)) return undefined
  const session = agent.session
  return isObject(session) ? session : undefined
}

/** 一条会话日志事件的最小形状（本文件只需要 `type` 与 `data`）。 */
interface SessionLike {
  ownEvents?(): readonly unknown[]
  snapshotEvents?(): readonly unknown[]
}

/**
 * 扫描子会话自己的持久 `subagent/descriptor` 事件（DSH 原生的"我是谁"）。
 *
 * 与 ulw-execute/identity.ts 的 `readDescriptorIdentity` 同构但**多读一个
 * `mode`**——L6 的 background 分支需要它。两个插件之间禁止互相 import
 * （index.ts 纪律），所以这里是第二份最小实现；两侧单测各自对真实 descriptor
 * 形状断言，漂移风险由断言承担而非由 import 承担。
 *
 * descriptor 的两种形态（prometheus-md-only.ts 头部实测）：
 *   continuable → `{version, mode:'continuable', provider, label, …, persona, toolFilter?}`
 *   one-shot    → `{version, mode:'one-shot', provider, label}`（**无 persona**）
 * 首个 descriptor 是权威（establishing provider 只追加一次），故命中即停。
 */
export interface SessionDescriptor {
  readonly found: boolean
  /** descriptor v3 的 `mode`：continuable = 后台委派，one-shot = 前台委派。 */
  readonly mode: 'continuable' | 'one-shot' | undefined
  readonly persona: string | undefined
  readonly label: string | undefined
}

/**
 * ⚠️ **未缓存**，缓存由调用方（registrar 闭包）持有，见下面 MINOR-5 的说明：
 * 本函数是纯函数，单测直接调用它；把 `WeakMap` 塞进这里会让"读一次"和"读 N 次"
 * 两种行为在单测里无法区分，而 pre-step 每**步**触发一次（H-32 实测单会话 268
 * 步），`ownEvents()` 的全事件副本不该在每步上重造。
 */
export function readSessionDescriptor(session: unknown): SessionDescriptor {
  const empty: SessionDescriptor = { found: false, mode: undefined, persona: undefined, label: undefined }
  if (!isObject(session)) return empty
  const s = session as SessionLike
  let events: readonly unknown[]
  try {
    if (typeof s.ownEvents === 'function') events = s.ownEvents()
    else if (typeof s.snapshotEvents === 'function') events = s.snapshotEvents()
    else return empty
  } catch {
    return empty
  }
  for (const event of events) {
    if (!isObject(event)) continue
    if (event.type !== 'subagent/descriptor') continue
    const data = event.data
    if (!isObject(data)) {
      return { found: true, mode: undefined, persona: undefined, label: undefined }
    }
    const mode = data.mode
    return {
      found: true,
      mode: mode === 'continuable' || mode === 'one-shot' ? mode : undefined,
      persona: typeof data.persona === 'string' ? data.persona : undefined,
      label: typeof data.label === 'string' && data.label.length > 0 ? data.label : undefined,
    }
  }
  return empty
}

/**
 * 把 persona 文本解析成名册席位 id。
 *
 * 每个 Phase 2 persona 文件都自称一次 `omo-<seat-id>`（实测：atlas /
 * explore / hephaestus / librarian / multimodal-looker / oracle /
 * plan-consultant / plan-reviewer / prometheus / sisyphus-junior）。做法是
 * **对名册逐个反查**而不是盲扫 `omo-([\w-]+)`：blind scan 会把
 * explore-persona 里的 `omo-agent`（泛称）误认成席位，也会把
 * `omo-sisyphus-junior` 截成 `omo-sisyphus`。
 *
 * 两个细节都是必需的：长 id 先试（`sisyphus-junior` 先于 `sisyphus`），
 * 尾部加 `(?![a-z0-9-])` 边界（否则 `omo-sisyphus` 命中
 * `omo-sisyphus-junior` 的前缀）。
 */
/**
 * 席位匹配器：每个名册 id 一个 `omo-<id>(?![a-z0-9-])`，**长 id 在前**。
 *
 * 模块级构建一次（MINOR-5：原来在函数体里 `new RegExp` × 11 + `sort` × 1，
 * 而本函数每个 pre-step 至少被调两次——`resolveRosterSeat` 一次，
 * `hasForeignOmoSelfName` 内部再一次）。名册快照 `OMO_ROSTER_AGENT_IDS` 是
 * `const`，构建顺序即加载顺序，运行时不会再变，所以模块级预构建是安全的；
 * 若它哪天变成可变快照，这里要改成惰性构建。
 */
const ROSTER_SEAT_MATCHERS: readonly (readonly [string, RegExp])[] = [...OMO_ROSTER_AGENT_IDS]
  .sort((a, b) => b.length - a.length)
  .map((id) => [id, new RegExp(`omo-${id}(?![a-z0-9-])`)] as const)

export function resolveRosterSeat(persona: string | undefined): string | undefined {
  if (persona === undefined || persona.length === 0) return undefined
  for (const [id, matcher] of ROSTER_SEAT_MATCHERS) {
    if (matcher.test(persona)) return id
  }
  return undefined
}

/**
 * 任何 `omo-*` 自称 token（不论是否在名册里）。用于 L4：自称了却不在名册的
 * persona 就是一个**外来 agent**，其会话不接 OMO 指令注入。
 */
export function hasForeignOmoSelfName(persona: string | undefined): boolean {
  if (persona === undefined) return false
  if (!/\bomo-[a-z0-9][a-z0-9-]*\b/.test(persona)) return false
  return resolveRosterSeat(persona) === undefined
}

// ── ① synthetic / internal（上游 hook.ts:69-72） ───────────────────────────

/** 一条消息是否由**用户**发出（DSH 的 `source.kind`，与 ulw-execute 同义）。 */
export function isUserAuthoredMessage(message: unknown): boolean {
  if (!isObject(message)) return false
  const source = message.source
  // source 缺席 = 手工构造 / 外部载荷（ulw-execute.ts 的同款口径）
  if (source === undefined) return false
  if (!isObject(source)) return false
  return source.kind === 'user'
}

/** DSH 的合成/内部标记（读不到即 false，不靠缺席推断）。 */
function isSyntheticOrInternalMessage(message: unknown): boolean {
  if (!isObject(message)) return false
  if (message.synthetic === true) return true
  if (message.internal === true) return true
  if (message.role !== 'user') return true
  return false
}

/** 一条消息的文本块（`content[].type === 'text'`，与 ulw-execute 同形）。 */
function textOfMessage(message: unknown): string {
  if (!isObject(message)) return ''
  const content = message.content
  if (!Array.isArray(content)) return ''
  const texts: string[] = []
  for (const block of content) {
    if (!isObject(block)) continue
    if (block.type !== 'text') continue
    const text = block.text
    if (typeof text === 'string' && text.length > 0) texts.push(text)
  }
  return texts.join('\n')
}

/**
 * S-12 的判据锚（v4.19.4 逐字）。
 *
 * MINOR-6 更正：归属**不是** `formatCommandTemplate`。实测（反跑时改 `render.ts`
 * 里的标记，一个都没命中才定位到）：外框是**命令条目自己的 `template` 字面量**的
 * 首尾两行——上游 `src/features/builtin-commands/commands.ts:43` 与 `:45`
 * （`template: \`<command-instruction>` … `</command-instruction>\``），本仓
 * `omo-commands/src/templates/*.ts` 逐字保留（如 `handoff.ts:280`）。
 * 归属写错会让下一个改外框的人去改 render.ts，而那里根本没有它。
 */
export const COMMAND_INSTRUCTION_MARKER = '<command-instruction>'

/**
 * S-12：**命令扩展消息不是用户散文**，因此不参与关键词检测。
 *
 * 判据锚 = 消息文本含 `<command-instruction>`。实测（L4 反跑）：这个外框**不在**
 * `formatCommandTemplate` 里，而在**命令条目自身的 `template` 字面量**里——上游
 * v4.19.4 `src/features/builtin-commands/commands.ts:43/45`（`template:`
 * 字面量首尾行），本仓 `omo-commands/src/templates/*.ts` 逐字保留（如
 * `handoff.ts:280`）。所以两侧的锚是同一个字符串——不是我们另选的约定。
 *
 * （第一版把来源写成 `formatCommandTemplate`，反跑时改 `render.ts` 里的标记根本没
 * 命中任何东西，才定位到真实出处。锚的归属写错，会让下一个改外框的人改错文件。）
 *
 * **为什么必须跳**（L4 真模型冒烟实证，非推测）。用户在会话里敲 `/ulw-execute
 * alpha`：命令准入后，omo-commands 把命令模板作为**一条 source.kind==='user' 的
 * followup 消息**投进会话。`isUserAuthoredMessage` 放它过（它确实是 user 源），
 * `isSyntheticOrInternalMessage` 也放它过（`role` 是 'user'，无 synthetic 标记）
 * ——于是 `readCurrentUserText` 把**命令模板本身**当成本轮用户散文交给检测面，
 * 模板里的 `ulw` token 命中 ultrawork 规则，模型在 turn 2 就喊
 * `ULTRAWORK MODE ENABLED!`。`/hyperplan` 同形：模板含 `hyperplan` token。
 *
 * **与上游的对齐关系**（这是本条属于「语义移植」而不是「多了一个过滤」的理由）：
 * 上游的检测面是**原始用户输入行**，且在匹配前先剥掉 slash 前导（`/ulw-execute
 * alpha` → `alpha`），因此上游**永不自触发**。DSH 侧没有「原始行」可读——本 hook
 * 看到的是会话消息流，而 followup 模板是以 user 身份混在里面的**扩展产物**。
 * 所以对齐动作是同源的：上游剥的是**原始行上的 slash 前导**，我们剥的是**扩展
 * 消息上的命令包裹**。两者都在做同一件事——把「派生产物」从「用户手写的散文」里
 * 摘出去，让检测面只面对用户真的敲下去的散文。
 *
 * `/ulw-plan` 手势不受影响：它的载体是 `<skill_content>`（source.kind ===
 * 'skill-invocation'），早已被 user 源过滤排除，与本条无关。
 *
 * ── 采纳-12：自触发的 token 来自**帧头**，不是模板正文 ──────────────────
 * 触发自触发的那处 `ulw` 是命令帧头 `# /ulw-execute Command` 里的 `ulw`——
 * `-` 是词边界，故 `\bulw\b` 命中。模板**正文**（start-work 那套文案）本身并无
 * `ulw` token。这解释了为什么上游永不自触发：上游剥掉 slash 前导后，检测面根本
 * 看不到这个帧头；而帧头是**本移植新造**的（v5 改名把 `start-work` 改成
 * `ulw-execute` 才产生它）——这条差异是改名造出来的，不是上游文本本来就带的。
 *
 * ── 采纳-11：评估过并**否决**「位置锚」方案 ──────────────────────────
 * 备选：要求标记是首个非空 token、或落在帧头区（`# /name Command` 之后），而不是
 * 任意位置出现即算。好处是保留「散文里顺口提到该标记」的保真度。否决理由：
 *   1. 它不比 `includes` **更**难被构造击败——把标记挪到正文、或让帧头改名，位置锚
 *      同样失效；而它对前导空行、缩进、markdown 包裹都敏感，是一类**假阴性**来源。
 *   2. 它把判据从「这是命令面的派生产物」漂移成「这条消息长得像命令」——前者是
 *      语义，后者是形状。S-12 要对齐的是上游的**语义**（派生产物不参与检测），
 *      形状匹配恰好丢掉这个对齐理由。
 *   3. 误判面已被单测 ④ **钉成已知行为**而非潜伏缺陷；要收紧时那条测试会先红。
 * 维持 `includes`，把位置锚的收益与代价记在此处，便于日后重估。
 */
export function isCommandExpansionMessage(text: string): boolean {
  return text.includes(COMMAND_INSTRUCTION_MARKER)
}


/**
 * 取**本轮**的用户文本（上游 `extractPromptText(output.parts)` 的 DSH 形状）。
 *
 * 取**最后**一条用户消息而非第一条（ulw-execute 取第一条，因为委派子会话
 * 只有一条任务消息）。理由：本 hook 判别的是"用户此刻敲下的那句话"，主会话
 * 的历史里可能已经有更早的 `ulw`（那一条不该在每一轮都重新武装模式）；
 * 委派子会话的任务消息同时也是最后一条，两种会话在此取到同一对象。
 *
 * 合成/内部消息（插件注入、非 user role、`synthetic`/`internal` 标记）一律
 * 不参与——这就是上游 ① 号闸在 DSH 上的落点。
 */
export interface CurrentUserText {
  readonly text: string | undefined
  /**
   * MINOR-7：S-12 跳过了一条**命令扩展消息**——这与「没有用户文本」是两件不同的事。
   * 合并成同一个 `synthetic-internal` 会让本文件「每个 reason 对应一行日志」的
   * 纪律破掉：① 号（绝大多数 pre-step 的常态）刻意不记日志，于是 S-12 也会跟着
   * 静默——而 S-12 恰恰是**最该被看见**的一条（它意味着命令面与关键词面发生了
   * 一次交互）。故单列具名 reason，调用方据此打日志。
   */
  readonly commandExpansionSkipped: boolean
}

export function readCurrentUserTextDetail(payload: unknown): CurrentUserText {
  if (!isObject(payload)) return { text: undefined, commandExpansionSkipped: false }
  const messages = payload.messages
  if (!Array.isArray(messages)) return { text: undefined, commandExpansionSkipped: false }
  let skippedExpansion = false
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!isUserAuthoredMessage(message)) continue
    if (isSyntheticOrInternalMessage(message)) continue
    const text = textOfMessage(message)
    if (text.length === 0) continue
    // S-12：命令模板消息是命令面的**扩展产物**，不是用户散文。见上。
    //
    // `continue` 而不是 `return undefined`：本轮可能既有命令扩展消息又有更早的
    // 真实用户散文，后者仍应被检测——判据是「这条不是散文」，不是「本轮不可判」。
    //
    // ⚠️ 与上游的一处**方向差**（采纳-12 记录）：上游的检测面只看本轮输入行，
    // 从不向更早的消息回看；这里回看，因为 DSH 的检测面是整条消息流，天然含有
    // 历史。后果是：一条命令扩展消息之后，用户在**更早**那一轮敲的 `ulw` 仍会
    // 武装模式。该差异被 S-6（一次性守卫 `alreadyInjected`）夹住——同一注入不会
    // 重复发生，所以回看不会累积成多份指令。维持现状并登记。
    if (isCommandExpansionMessage(text)) { skippedExpansion = true; continue }
    return { text, commandExpansionSkipped: skippedExpansion }
  }
  return { text: undefined, commandExpansionSkipped: skippedExpansion }
}

export function readCurrentUserText(payload: unknown): string | undefined {
  return readCurrentUserTextDetail(payload).text
}

/** ① 闸：没有可判别的真实用户文本（合成/内部/空）→ 不注入。 */
export function isSyntheticOrInternalPayload(payload: unknown): boolean {
  return readCurrentUserText(payload) === undefined
}

// ── ② system directive（上游 hook.ts:76-79） ──────────────────────────────

/**
 * system directive 闸（上游 shared/system-directive.ts 的 `isSystemDirective`
 * 逐字 + 注释）：OMO 自己的内部消息前缀，且**允许关键词打头**（上游的
 * `SYSTEM_DIRECTIVE_LEADING_KEYWORD_PATTERN` 就是为 `[SYSTEM DIRECTIVE …
 * - TODO CONTINUATION]` 这类文本不会被 `ulw` 误触而存在的）。
 */
export function isSystemDirective(text: string): boolean {
  const trimmed = text.trimStart()
  if (trimmed.startsWith(SYSTEM_DIRECTIVE_PREFIX)) return true
  const withoutLeadingKeyword = trimmed.replace(SYSTEM_DIRECTIVE_LEADING_KEYWORD_PATTERN, '')
  return withoutLeadingKeyword.startsWith(SYSTEM_DIRECTIVE_PREFIX)
}

/** 剔 `<system-reminder>…</system-reminder>`（上游 `removeSystemReminders` 逐字）。 */
export function removeSystemReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER_PATTERN, '').trim()
}

// ── ④ non-OMO agent（上游 hook.ts:88-91） ──────────────────────────────────

/**
 * 上游谓词逐字（ultrawork/source-detector.ts:31-35）：名字含 `builder`
 * 或正好等于 `plan`。DSH 名册里没有这两个 agent（它们是 opencode 内置的），
 * 保留谓词是为了**审计对照**与万一将来 reintroduce；真正的 DSH 判定见
 * {@link isForeignAgentSession}。
 */
export function isNonOmoAgent(agentName: string | undefined): boolean {
  if (!agentName) return false
  const lowerName = agentName.toLowerCase()
  return lowerName.includes('builder') || lowerName === 'plan'
}

/**
 * ④ 闸（DSH）：本会话的 persona 自称了一个**不在 Phase 2 名册**里的
 * `omo-*` agent → 外来 agent 的会话，不接 OMO 指令。
 *
 * 主会话没有 descriptor，因此没有 persona，也就无从"自称"——它按定义是本
 * 插件所在的那个 agent 自己的会话，故判定为 OMO 会话。DSH 没有上游的
 * "会话切 agent"动作（ulw-execute/identity.ts 已登记该事实），所以这一闸
 * 的可达形态是**外来 persona**，而不是"用户把会话切到了非 OMO agent"。
 */
export function isForeignAgentSession(persona: string | undefined): boolean {
  return hasForeignOmoSelfName(persona)
}

// ── ⑤ planner agent（上游 hook.ts:98-106） ────────────────────────────────

/**
 * 上游谓词逐字（source-detector.ts:20-28）：名字含 `prometheus` / `planner`，
 * 或规范化后含独立词 `plan`。
 *
 * 这一条**在 DSH 名册上原样就位**：`prometheus` 命中第一支；
 * `plan-consultant` / `plan-reviewer` 规范化成 `plan consultant` /
 * `plan reviewer` 后命中 `\bplan\b` 第二支。三个规划席位全部被覆盖，无需
 * 为 DSH 增补名字。
 */
export function isPlannerAgent(agentName: string | undefined): boolean {
  if (!agentName) return false
  const lowerName = agentName.toLowerCase()
  if (lowerName.includes('prometheus') || lowerName.includes('planner')) return true
  const normalized = lowerName.replace(/[_-]+/g, ' ')
  return /\bplan\b/.test(normalized)
}

// ── ⑥ background / 非主 session（上游 hook.ts:108-117、144-155） ───────────

/**
 * ⑥a background session 闸：descriptor 的 `mode === 'continuable'`，
 * 即 `run_in_background: true` 的后台委派会话。上游的判据是
 * `subagentSessions.has(input.sessionID)`（opencode 的后台任务会话表），
 * DSH 的等价物就是委派模式——两者都回答"这个会话是不是一条后台跑起来的委派"。
 */
export function isBackgroundSession(descriptor: SessionDescriptor): boolean {
  return descriptor.found && descriptor.mode === 'continuable'
}

/** ⑥b 非主 session：有 descriptor 即为被委派出来的子会话（否则是用户主会话）。 */
export function isSubagentSession(descriptor: SessionDescriptor): boolean {
  return descriptor.found
}
