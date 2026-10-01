// keyword-detector.ts — P4-T12 listener（task book WP：H-33 / Phase 3 S-06；
// manifest 第 15 行，模式 A pre-step）。
//
// WHAT THIS IS. OMO 的 `keyword-detector` hook（`chat.message` 上检测
// ultrawork / ulw / hyperplan / hpp / `hyperplan ulw` 组合词，命中即把整份
// 模式指令注入本轮）在 DSH 上的重生，形态 = **一个 `agent/pre-step`
// waterfall listener**（模式 A）：判别用户本轮文本 → 命中则用 `agent.inject()`
// 把模式指令排进该会话的下一步，**永远 `return next()`**。
//
// Upstream: packages/omo-opencode/src/hooks/keyword-detector/ @ v4.19.4
//   （冻结基线 tag，commit b072d279110bdda2c6ac2525d0d24dc54d16148a；PRE-1）。
//   语义移植（非逐字复制）：判别面（模式、剥壳、六级过滤、配置规则、组合
//   抑制、双幂等）逐条落地；**注入文案改为引用 P4-T4 vendor 的 SKILL.md 正文**；
//   交付面（事件、注入、会话身份）全是 DSH 的。
//
// ═══════════ 上游逐文件处置（`git ls-tree -r v4.19.4` 实测） ═════════════════
//
// **件数算术**：上游**目录** `hooks/keyword-detector/` = 24 条目 = 16 实现 +
// 7 测试 + 1 个 `AGENTS.md`；`AGENTS.md` 按 N-03 不计入移植面。另加**目录之外**
// 的 `config/schema/keyword-detector.ts`（KeywordType 枚举 + 两个配置字段的
// 定义处，被 constants.ts 与 hook.ts 共同 import）→ manifest 的
// `upstreamFiles` = 16 + 1 = **17**，`upstreamTestFiles` = **7**。
// （📌 覆盖文档 phase4-commands.md §1.2 写的是「25 文件」= 目录 24 + 配置
// schema 1；本移植按「两列之和」登记 17 + 7，差异登记在 P4-T12 报告里，
// 该文档是仲裁侧文件，本任务只读。）
//
// 本目录（keyword-detector/）承载 4 个模块 + 本文件承载 listener 与 registrar：
//   keyword-detector/constants.ts  — 模式表 / 剥壳模式 / banner 锚点 / 名册快照
//   keyword-detector/messages.ts   — vendor 正文加载 + 3 个文案工厂 + 关键词表
//   keyword-detector/detector.ts   — 剥壳 / slash 判定 / 配置规则 / 组合抑制 / 幂等
//   keyword-detector/filters.ts    — 六级输入过滤（payload 与会话身份面）
//
//   IMPLEMENTATION (16 目录内 + 1 目录外)
//   config/schema/keyword-detector.ts (9) — PORTED 逐字（KeywordType 四元枚举
//                                     含 team 预留位 + 两个 optional 字段 →
//                                     constants.ts 的 KeywordType /
//                                     detector.ts 的 KeywordDetectorConfig；
//                                     zod 校验器本身不移植——本插件的配置读面
//                                     是 ctx 侧的普通对象，见 S-10）
//   index.ts (5)                    — PORTED（barrel：上列 4 个模块 + 本文件）
//   types.ts (4)                    — 跳过段（`KeywordDetectorState{detected,
//                                     injected}` 是上游的**运行时状态载体**，
//                                     DSH 侧同一事实由 listener 闭包里的
//                                     `WeakSet<object>`（会话级一次性）承担，
//                                     单独保一个接口等于多一个无人写的状态面）
//   constants.ts (54)               — PORTED（模式逐字；5 个消息工厂 → messages.ts）
//   detector.ts (80)                — PORTED（extractPromptText → filters.ts）
//   hook.ts (248)                   — PARTIAL PORT（六级过滤 + 双幂等 + 注入面
//                                     落地；default-mode 与 toast 见 S-6/S-8）
//   AGENTS.md (104)                 — NOT PORTED（上游目录说明文档，非运行时面；
//                                     N-03 亦不入 manifest 两列）
//   hyperplan/index.ts (2)          — PORTED（barrel，合并进关键词表）
//   hyperplan/default.ts (33)       — PORTED（模式逐字 → constants.ts；8 步工作流
//                                     → messages.ts 的 hyperplan 文案 + S-7 载体声明）
//   team/index.ts (2)               — PORTED 逐字（枚举位；不接线，见 S-3）
//   team/default.ts (26)            — 跳过段（S-3：team_* 工具族 DSH 无等价面）
//   ultrawork/index.ts (2)          — PORTED（barrel，合并进关键词表）
//   ultrawork/default.ts (9)        — PORTED（转发 → vendor 正文，见 S-2）
//   ultrawork/gpt.ts (9)            — 跳过段（S-2：按模型分流，DSH 无模型族路由）
//   ultrawork/gemini.ts (9)         — 跳过段（S-2）
//   ultrawork/glm.ts (9)            — 跳过段（S-2）
//   ultrawork/planner.ts (7)        — 跳过段（S-2 + S-5：planner 席位整体被
//                                     ⑤ 号闸拦掉，文案永不送达）
//   ultrawork/source-detector.ts (51) — PORTED（isNonOmoAgent / isPlannerAgent
//                                     逐字 → filters.ts；getUltraworkSource /
//                                     getRuntimeVariant → S-2/S-6）
//
//   TEST SEEDS (7 — 89 its = 计划书 §4.7 L1 的移植种子)
//   index.test.ts (1307, 47)              — PORTED（命中/剥壳/配置/组合/幂等组；
//                                           toast/default-mode 断言剔除——见 S-6/S-8）
//   hyperplan.test.ts (328, 14)           — PORTED（模式组，含 #4215 的 `.hpp` 负例）
//   hook-ralph-loop.test.ts (259, 11)     — 跳过段（S-9：ralph-loop 的自注入面
//                                           是 opencode 专属，DSH 无等价面）
//   hyperplan-ultrawork.test.ts (262, 10) — PORTED（组合严格相邻 + 独立抑制组）
//   ultrawork-edge-trigger.test.ts (138, 4) — PORTED（注入文本已在上下文时的
//                                           消息级幂等组）
//   ultrawork-runtime-variant.test.ts (58, 2) — 跳过段（S-2）
//   ultrawork/ultrawork-source-routing.test.ts (55, 1) — PORTED（isPlannerAgent /
//                                           isNonOmoAgent 谓词组）
//
// ═══════════ S — 跳过段与收窄（逐条理由，不允许静默吞掉） ═══════════════════
//
// S-1 **上游 `chat.message` → DSH `agent/pre-step`（事件面）**。上游的触发面是
//     opencode 插件的 `chat.message`（一条**消息**一次）；DSH 的模式 A 面是
//     `agent/pre-step`（**一步**一次，H-32 实测同一会话一次会话可产生 268 步）。
//     这不是可选的换词：注入面只有 pre-step 有（`agent.inject()` 挂在 agent 上）。
//     **后果见 S-6**——两步一触发，必须补会话级一次性守卫。
//
// S-2 **模型变体收窄：5+1（hook 侧 5 个模型变体 + 1 份 codex 专用 md）→ 1**。
//     上游两份分流：(a) hook 侧按 `gpt`/`glm`/`gemini`/`default`/`planner` 五份
//     `ULTRAWORK_*_PROMPT`（判据 = `input.model.modelID` 与 session agent 名，
//     hook.ts:39-45）；(b) 1 份 `ULTRAWORK_CODEX.md`。DSH 名册里没有这些模型族，
//     pre-step 载荷也不带 model 字段，按模型分流**没有第二个消费方**。处置：一份
//     名册感知正文（messages.ts 的 `ROSTER_TAIL_NOTE` 补齐 reviewer 席位），
//     `getRuntimeVariant` 与 `getUltraworkSource` 随之不移植。**收窄面已登记**：
//     vendor ultrawork 正文点名 `momus`（3 次）/`metis`（2 次）两个名册里没有的
//     reviewer，尾注把它们映射到 `plan-consultant` / `plan-reviewer`。
//     （`UNMAPPED_REVIEWER_LITERALS` 与 `ROSTER_TAIL_NOTE` 的注释里不再另起
//     一套计数——本行是 S-2 计数的唯一定义处。）
//
// S-3 **team 跳过段（枚举位预留）**。`team/default.ts` 的 26 行是
//     `TEAM_MESSAGE = TEAM_MODE_PROMPT` 的一次转发，正文以 `team_create` 团队
//     工具族为骨架。C 组证据「载体」已判定该工具族 DSH **无等价面**（最近邻是
//     subagent，但缺 teamRunId / 广播 / 关闭协议）。处置：`team` 的 type 与
//     pattern 常量**保留**（枚举位，Phase 5 接 Team Mode 时只需补一个消息工厂），
//     但不接线——一个没有等价载体的关键词命中后只会产出死指令。
//
// S-4 **non-OMO agent 闸的可达形态**。上游 `isNonOmoAgent` 判的是"这个会话被
//     用户切到了 opencode 内置的 builder/plan"。DSH **没有"会话切 agent"这个
//     动作**（agent 在子会话创建时按 roster 行固定，ulw-execute/identity.ts 已
//     就位该事实），故上游谓词在 DSH 上恒假。谓词**逐字保留**（审计对照 +
//     将来 reintroduce 时的防线），真正可达的判定改为 §filters 的
//     `isForeignAgentSession`：子会话 persona 自称了一个**不在 Phase 2 名册**里的
//     `omo-*` agent（外来 agent 借 OMO 挂载的会话）→ 不注入。
//
// S-5 **planner 闸的覆盖面**。上游 `isPlannerAgent`（名字含 prometheus/planner，
//     或规范化后含独立词 `plan`）**在 DSH 名册上原样就位**：`prometheus` 命中
//     第一支；`plan-consultant` / `plan-reviewer` 规范化成 `plan consultant` /
//     `plan reviewer` 后命中 `\bplan\b`。三个规划席位全被覆盖，无需增补名字。
//     上游 `ultrawork/planner.ts` 那份文案因此永不送达（它在 ⑤ 号闸之后）。
//
// S-6 **双幂等的第二道在 DSH 上是必需的，且判据变了**。上游两道幂等是：
//     ① 消息级 `filterAlreadyInjectedKeywords`（`!text.includes(keyword.message)`，
//        hook.ts:31-36）——逐字移植；
//     ② 会话级一次性 Set（`defaultModeUltraworkInjectedSessions`，hook.ts:22）——
//        **但它属于 default-mode 特性**（`defaultMode.ultrawork` 配置：本部署
//        每次新会话自动开 ultrawork），不在关键词触发路径上；本任务书的配置面
//        只有 `disabled_keywords` / `enabled_expansions`，故 default-mode 不移植。
//     DSH 的后果：**同一条 "ulw" 消息会触发本会话的每一个 pre-step**
//     （S-1，268 步实测），一条消息会注入 268 次 30 KB 指令。处置：保留上游
//     同一个 `Set` 机制，但把判据从"default-mode 是否已开"换成"**本会话是否
//     已经注入过**"——这既是任务书要求的"session 级一次性 Set"，也是 S-1 的
//     必要适配。集合键 = 会话对象（`WeakSet`），随 fiber 回收。
//
// S-7 **hyperplan 的载体差异**。vendor `hyperplan/SKILL.md`（senpi 变体）以
//     `team_create` / `task_send` / `team_delete` 为骨架（实测 `team_*` 13 次、
//     `task_send` 17 次），与 S-3 同一载体问题；但 hyperplan **本阶段在计划书
//     的端口内**（`hyperplan.test.ts` 14 its 是移植种子），故不整词跳过。
//     处置：正文逐字照搬 vendor + banner 后加一段**载体声明**
//     （`HYPERPLAN_CARRIER_NOTE`：工具名的 DSH 对应物 = 5 次 `task(...)` 子代理
//     派发，无 `team_run_id`，lane 靠子会话标签）。声明是环境事实，不是指令改写。
//     ⚠️ 同时**不收尾**上游 hyperplan.md 那句 "enable `team_mode.enabled` in
//     `~/.config/opencode/oh-my-opencode.jsonc`"——P4-T1 已登记该配置路径
//     与模板 `~/.omo/omo.jsonc` 不一致，且 opencode 的配置面在 DSH 上根本不存在。
//
// S-8 **toast 收窄**。上游每次命中都调 `ctx.client.tui.showToast({…})` 弹 UI
//     提示（hook.ts:124-160，三处）。DSH 侧无 `client.tui` 等价面（本插件是纯
//     Host listener，且 Workspace 明确禁止跨进程读会话）。处置：**不移植**，
//     改以 `console.warn` 的审计行承载同样的可观测性（每次注入一行，含
//     session 标签与命中类型）。用户可见性由注入正文里的 banner
//     （"首行必须说 ULTRAWORK MODE ENABLED!"）承担——那本来就是主路径。
//
// S-10 **zod 配置校验器不移植**。上游 `config/schema/keyword-detector.ts` 用
//     zod 声明 `KeywordDetectorConfigSchema`，宿主在读用户配置时校验。DSH 的
//     omo-hooks 组合**不向插件暴露 config 服务**（index.ts 头部：本插件无
//     Config 导出），所以本移植的配置读面是 `ctx.config?.keywordDetector` 的
//     **可选**读（`readConfigOverride`）：缺席或非对象即回落默认（全启用、无
//     allowlist），字段非数组即视同缺席。**语义方向与 zod 一致**（非法值不
//     抛、只回落默认），差别是 zod 会**报错**而这里静默回落——这是刻意选择：
//     一份坏配置不该让每一步 pre-step 都失败。代价是拼错的键名不会有任何
//     提示，故两处字段名（camelCase 与上游 snake_case）都接受。
//     ⚠️ 若将来本插件真的挂上 cordis Config，zod 校验器应在那时接上，
//     而不是在这里先造一个（那会是一个永远不执行的校验器）。
//
// S-9 **hook-ralph-loop.test.ts 跳过段**。它的 11 例断言的是 ralph-loop 特性
//     把 keyword 注入文本自举进循环的那条自注入路径（opencode 专属面，DSH 无
//     ralph 特性）。不移植用例；该路径的**防御**（已注入文本不重复触发）由 S-6
//     的会话级 Set + ① 号消息级幂等共同承担，两条都在本移植的单测里。
//
// S-11 **登记：注入文本的抵达时机比上游晚一个 step 边界**（映射性质，非缺陷）。
//     上游（opencode）：命中后直接改写 `output.parts[textPartIndex].text`，注入
//     文本与原文本在**同一条消息**里，**该消息的首个模型请求就已经带上**它。
//     DSH：模式 A 只能在 waterfall 里 `agent.inject(...)`，而 dsh-agent-loop 在
//     进入 waterfall **之前**已经 claim 了本批 inbox（lib:888-899）——所以注入
//     消息要等**下一个 step 边界**才进 inbox，模型在**下一次**模型请求才看到。
//     后果：命中 `ulw` 的那一轮，模型的第一遍思考**看不到** ultrawork 协议，
//     从下一轮起才生效。
//     **不修**：这是模式 A 的固有语义（`agent/pre-step` 的时点由宿主决定，
//     插件无法把注入排进已 claim 的批次）。本移植**只登记**，不改时点。
//     ⚠️ **P4-T13 的 e2e 断言口径按此设计**：`ultrawork-keyword-injected` 场景
//     不得断言"首个模型请求就带 `ULTRAWORK MODE ENABLED!`"（会红），应断言
//     "本轮注入被记录进 session log，且**后续**某次模型请求带上了它"。
// S-12 **检测面剥掉命令扩展消息**（L4 真模型冒烟实证的移植分歧，已修）。
//     上游的检测面是**原始用户输入行**，匹配前先剥 slash 前导（`/ulw-execute
//     alpha` → `alpha`），因此上游**永不自触发**。DSH 侧读的是会话消息流，命令
//     准入后 omo-commands 会把命令模板作为一条 `source.kind==='user'` 的 followup
//     消息投进会话——user 源过滤与 synthetic 过滤都放它过，于是**命令模板本身**
//     被当成本轮用户散文送去匹配：实测 `/ulw-execute alpha` 触发了 ultrawork
//     绑定（模型在 turn 2 就喊 `ULTRAWORK MODE ENABLED!`），`/hyperplan` 同形风险。
//     修法：`readCurrentUserText` 跳过文本含 `<command-instruction>` 的消息——那是
//     上游**命令条目的 `template` 字面量**首尾行（v4.19.4 commands.ts:43/45），
//     本仓 `omo-commands/src/templates/*.ts` 逐字保留，两侧同锚。实测：外框不在
//     `formatCommandTemplate` 里。与上游**同源**（上游剥原始行上的 slash 前导，我们剥扩展消息上的
//     命令包裹，都是把派生产物从用户散文里摘出去）。`continue` 而非整体放弃，
//     所以「本轮命令扩展 + 更早真实散文」时后者仍被检测。详见 filters.ts。
//     `/ulw-plan` 手势不受影响：载体是 `<skill_content>`（source.kind ===
//     'skill-invocation'），早已被 user 源过滤排除。
//     另注：即使时点相同，S-6 的会话级一次性守卫也只会让它注入一次——所以
//     "晚一步"是唯一的可观测差别，不要把它和幂等混成一个失败现象。
//
// ═══════════ 注入面映射（模式 A） ═══════════
//
// 上游把注入文本**写回同一条消息的文本块**：
//     output.parts[textPartIndex].text = `${allMessages}\n\n---\n\n${originalText}`
// DSH 模式 A 没有"改写既有消息"的接口，唯一的注入面是 `agent.inject(message)`
// ——且参数是 `UserMessage` **对象**不是裸字符串（见上方 BLOCKER-1 注记：inbox
// 读 `message.id` 做 pending 唯一校验，裸字符串第二次注入即撞 id）
// ——它排一条**新消息**到下一步之前，用户原文本原样留在后面。因此：
//   * 注入文本 = 各命中文案以 `\n\n` 连接 + `\n\n---\n` 分隔尾行。
//     尾行保留上游的 `---` 分隔装置（它的用途是标出"以上是 hook 注入、以下是
//     用户原话"的边界；DSH 里两者在不同消息上，尾行让注入消息自带闭合标记）。
//   * 用户原文本**不被覆盖**（这是 DSH 面的能力，不是丢弃上游语义）。
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.

import {
  SUBAGENT_ALLOWED_TYPES,
  type KeywordType,
} from './keyword-detector/constants.ts'
import {
  detectKeywordsWithMessages,
  filterAlreadyInjectedKeywords,
  looksLikeSlashCommand,
  removeCodeBlocks,
  resolveConfig,
  type KeywordDetectorConfig,
} from './keyword-detector/detector.ts'
import {
  isBackgroundSession,
  isForeignAgentSession,
  isNonOmoAgent,
  isPlannerAgent,
  isSubagentSession,
  isSystemDirective,
  readCurrentUserTextDetail,
  readPreStepSession,
  readSessionDescriptor,
  removeSystemReminders,
  resolveRosterSeat,
  type SessionDescriptor,
} from './keyword-detector/filters.ts'
import {
  describeInstructionTexts,
  loadInstructionTexts,
} from './keyword-detector/messages.ts'
import type { InstructionTexts } from './keyword-detector/constants.ts'
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar, HooksRegistrationContext } from '../index.ts'

/** 本 hook 的 manifest id（= 文件名，c13 的双向绑定）。 */
export const KEYWORD_DETECTOR_ID = 'keyword-detector'

/**
 * 注入消息 `source.plugin` 用的**包名**，不是 hook id。
 *
 * 同包先例口径：ulw-execute（`ULW_EXECUTE_PLUGIN`）、bash-file-read-guard 的
 * notice 载荷都是 `'omo-hooks'`（e2e 实测 session log 里
 * `source:{kind:'plugin',plugin:'omo-hooks',form:'notice'}`）。`source.plugin`
 * 标识的是**写入方插件**，消费方按它分流；填 hook id 会让下游看到一个它不认识的
 * 写入方名。hook 身份由上面那个 `KEYWORD_DETECTOR_ID` + 诊断行前缀承担。
 */
export const KEYWORD_DETECTOR_PLUGIN = 'omo-hooks'

/** 注入文本里的分隔尾行（上游 `${allMessages}\n\n---\n\n${originalText}` 的尾装置）。 */
export const INJECTION_SEPARATOR = '---'

// ── 注入载荷（BLOCKER-1：必须是 UserMessage，不能是裸字符串） ──────────────
//
// 上游（opencode 的 `agent.inject`）收一个字符串；**DSH 不然**：
//   * dsh-agent 的类型是 `inject(message: UserMessage)`（runtime-types.d.ts:209）；
//   * dsh-agent-loop 把注入消息 splice 进 inbox，随后 **读 `message.id` 做
//     pending 唯一性校验**（lib:192-194）。裸字符串的 `id` 是 `undefined`，所以
//     同一个会话里第二次注入就撞上 `message "undefined" is already pending`。
//   * 而且裸字符串缺 `role` / `content` / `source`，对下游是残缺载荷。
// 形态与同插件先例 ulw-execute.ts（`buildInjectionMessage`，:264-284 / :390）完全
// 同构：id 每注入一次新铸，`source.form = 'instructions'` 表明"这段在指导模型"。

export interface InjectedTextBlock {
  readonly type: 'text'
  readonly text: string
}

export interface InjectedPluginSource {
  readonly kind: 'plugin'
  readonly plugin: string
  readonly form: 'instructions'
}

export interface InjectedUserMessage {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly InjectedTextBlock[]
  readonly source: InjectedPluginSource
}

/** 铸一条注入消息（**每次注入一个新 id** —— 唯一性语义由单测钉死）。 */
export function buildInjectionMessage(text: string): InjectedUserMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: KEYWORD_DETECTOR_PLUGIN, form: 'instructions' },
  }
}

/** `payload.agent`，读不到返回 undefined。 */
interface PreStepAgentLike {
  readonly inject?: (message: InjectedUserMessage) => unknown
  readonly session?: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// ── 诊断行 ──────────────────────────────────────────────────────────────────

/** 每次注入一行（替代上游的 toast，理由见 S-8）。 */
export function formatKeywordDetectorLine(text: string): string {
  return `[omo-hooks] ${KEYWORD_DETECTOR_ID}: ${text}`
}

/** 吞掉的失败行（pre-step 抛错会让整步失败，纪律②）。 */
export function formatKeywordDetectorFailureLine(what: string, err: unknown): string {
  const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return formatKeywordDetectorLine(`${what}: ${reason}`)
}

/** vendor 正文不可用时的具名 NOTE（一次性，不注入任何替代文本）。 */
export function formatKeywordDetectorDegradedLine(reason: string): string {
  return formatKeywordDetectorLine(`NOTE: keyword injection disabled — ${reason}`)
}

// ── 判定（纯函数，单测直接打它） ────────────────────────────────────────────

/** 每一条"不注入"的具名原因；**不静默**：每个值都对应上游的一行 log。 */
export type KeywordSkipReason =
  | 'no-inject-surface'
  | 'synthetic-internal'
  /** MINOR-7：S-12 跳过了命令扩展消息——与「没有用户文本」分开命名，故它会记日志。 */
  | 'command-expansion'
  | 'system-directive'
  | 'slash-command'
  | 'foreign-agent'
  | 'non-omo-agent'
  | 'planner-agent'
  | 'background-session'
  | 'no-keyword'
  | 'already-injected-message'
  | 'subagent-keyword-filtered'
  | 'session-one-shot'
  | 'vendor-texts-unavailable'

export type KeywordDecision =
  | { readonly kind: 'skip'; readonly reason: KeywordSkipReason }
  | {
    readonly kind: 'inject'
    readonly types: readonly KeywordType[]
    readonly text: string
    readonly agentName: string | undefined
  }

/** 判定所需的全部输入（把载荷读面收在一个窄接口后面）。 */
export interface KeywordStepFacts {
  /** 是否有 `agent.inject` 注入面。 */
  readonly hasInject: boolean
  /** vendor 正文；缺席即降级（不注入替代文本，见 messages.ts）。 */
  readonly texts: InstructionTexts | undefined
  /** 本轮用户文本（已过 ① 闸；`undefined` 即 ① 号 skip）。 */
  readonly promptText: string | undefined
  /** MINOR-7：本轮是否因为 S-12 跳过了一条命令扩展消息（故 `promptText` 为 undefined）。 */
  readonly commandExpansionSkipped?: boolean
  readonly descriptor: SessionDescriptor
  /** 会话级一次性守卫的当前值。 */
  readonly alreadyInjected: boolean
  readonly config: KeywordDetectorConfig
}

/**
 * 六级过滤 + 双幂等 + 组合抑制的**纯判定**。
 *
 * 单一数据源：`KeywordStepFacts` 一次带齐载荷面 / 身份面 / 配置面。之前这里
 * 还有一个并行的 `KeywordDecisionDeps`（texts + config），而两项在
 * `facts` 里同样存在——两个来源可以各说各话（"降级判定看过 facts.texts，正文
 * 却用 deps.texts 组装"），那正是最难查的一类漂移。故合并为一处。
 *
 * 实际顺序（本文件即顺序，逐条对齐上游 hook.ts:69-161 的六道闸）：
 *   ① 合成/内部 → ② system directive → ③ slash 前导
 *   → ④ 外来 persona → ④' 上游 builder/plan 谓词 → ⑤ planner 席位
 *   → ⑥a background session → 命中判别（含组合抑制与配置规则）
 *   → ⑥b 非主会话只留 ultrawork/combo → ①号幂等（消息级）→ ②号幂等（会话级）
 *
 * 两处与上游不同，都是刻意的：
 *   * **⑤ 提前到判别之前**：上游在判别之后才用 planner 谓词清空三类命中
 *     （hook.ts:98-106），本移植在判别之前就返回 skip——结果集完全相同，但
 *     少组装两份 30 KB 文案（upstream 的顺序会先把 planner 席位的三份正文
 *     构造出来再全部丢掉）。
 *   * **⑥b 提前到幂等之前**：两者都是逐条独立的纯过滤，交换顺序不改变结果集，
 *     但先收窄候选让审计日志更准。
 */
export function decideKeywordInjection(facts: KeywordStepFacts): KeywordDecision {
  if (!facts.hasInject) return { kind: 'skip', reason: 'no-inject-surface' }
  if (facts.texts === undefined) return { kind: 'skip', reason: 'vendor-texts-unavailable' }
  // MINOR-7：`command-expansion` 必须排在 `synthetic-internal` **之前**——S-12 跳过后
  // `promptText` 同样是 undefined，不先判就会被并进去，而并进去它就不记日志了。
  if (facts.promptText === undefined && facts.commandExpansionSkipped === true) {
    return { kind: 'skip', reason: 'command-expansion' }
  }
  if (facts.promptText === undefined) return { kind: 'skip', reason: 'synthetic-internal' }
  if (isSystemDirective(facts.promptText)) return { kind: 'skip', reason: 'system-directive' }
  if (looksLikeSlashCommand(facts.promptText)) return { kind: 'skip', reason: 'slash-command' }

  const agentName = resolveRosterSeat(facts.descriptor.persona)
  // ④ 号闸的两个分支：外来 persona 优先，上游谓词次之（谓词逐字保留，见 S-4）。
  if (isForeignAgentSession(facts.descriptor.persona)) {
    return { kind: 'skip', reason: 'foreign-agent' }
  }
  if (isNonOmoAgent(agentName)) return { kind: 'skip', reason: 'non-omo-agent' }
  // ⑤ 号闸：规划席位不接关键词指令（三个 DSH 席位全覆盖，见 S-5）。
  if (isPlannerAgent(agentName)) return { kind: 'skip', reason: 'planner-agent' }
  // ⑥a：后台委派会话（descriptor mode = continuable）整会话跳过。
  if (isBackgroundSession(facts.descriptor)) {
    return { kind: 'skip', reason: 'background-session' }
  }

  const cleanText = removeSystemReminders(facts.promptText)
  let hits = detectKeywordsWithMessages(
    removeCodeBlocks(cleanText),
    { texts: facts.texts, agentName },
    facts.config,
  )
  // ⑥b：非主会话（被委派的子会话）只保留 ultrawork 与组合模式。
  if (isSubagentSession(facts.descriptor)) {
    hits = hits.filter((hit) => SUBAGENT_ALLOWED_TYPES.includes(hit.type))
    if (hits.length === 0) return { kind: 'skip', reason: 'subagent-keyword-filtered' }
  }
  if (hits.length === 0) return { kind: 'skip', reason: 'no-keyword' }
  // ① 号幂等（消息级）：注入正文已在本轮文本里 → 不重复注入。
  hits = filterAlreadyInjectedKeywords(hits, cleanText)
  if (hits.length === 0) return { kind: 'skip', reason: 'already-injected-message' }
  // ② 号幂等（会话级一次性，DSH 必需适配，理由见 S-6）。
  if (facts.alreadyInjected) return { kind: 'skip', reason: 'session-one-shot' }

  return {
    kind: 'inject',
    types: hits.map((hit) => hit.type),
    text: `${hits.map((hit) => hit.message).join('\n\n')}\n\n${INJECTION_SEPARATOR}\n`,
    agentName,
  }
}

// ── listener ───────────────────────────────────────────────────────────────

/** listener 的依赖（全部可替换，便于单测与降级）。 */
export interface KeywordDetectorDeps {
  readonly texts: InstructionTexts | undefined
  readonly config: KeywordDetectorConfig
  readonly log: (line: string) => void
  /** 读 `payload.agent`；默认取 `payload.agent`（与 ulw-execute 同名函数同构）。 */
  readonly readAgent?: (payload: unknown) => PreStepAgentLike | undefined
}

type PreStepNextLike = () => unknown
type PreStepListener = (payload: unknown, next: unknown) => unknown

/**
 * 构造 `agent/pre-step` listener。会话级一次性守卫是**闭包内的 `WeakSet`**
 * （键 = 会话对象），随 fiber 回收（纪律⑤）。
 *
 * 永远 `return next()`（waterfall 合同）；效果是 `agent.inject(...)` 的副作用。
 * 与 ulw-execute.ts 同纪律：`next()` 结构性地位于 try **之外**（F-1），本
 * listener 自己的逻辑收在零 `next()` 调用的 `runKeywordDetectorStep` 里。
 */
export function createKeywordDetectorListener(deps: KeywordDetectorDeps): PreStepListener {
  const injectedSessions = new WeakSet<object>()
  // MINOR-5：**descriptor 缓存**。pre-step 每**步**触发一次（H-32 实测单会话 268
  // 步），而 `ownEvents()` 每次都返回全事件副本（slice + freeze），身份面却
  // 一次会话内不变——每步重造是纯浪费。`WeakMap` 与 `injectedSessions` 同为
  // 闭包级（纪律⑤：随 fiber 回收），先例 prometheus-md-only / ulw-execute
  // identity。键 = 会话对象；**非对象**键（主会话的 undefined）不进缓存。
  const descriptorCache = new WeakMap<object, SessionDescriptor>()
  const readDescriptorCached = (session: unknown): SessionDescriptor => {
    if (!isObject(session)) return readSessionDescriptor(session)
    const cached = descriptorCache.get(session)
    if (cached !== undefined) return cached
    const descriptor = readSessionDescriptor(session)
    descriptorCache.set(session, descriptor)
    return descriptor
  }
  return async (payload, next) => {
    const delegate = next as PreStepNextLike
    try {
      runKeywordDetectorStep(deps, payload, injectedSessions, readDescriptorCached)
    } catch (err) {
      logSafely(deps, formatKeywordDetectorFailureLine('listener failed', err))
      return await delegate()
    }
    return await delegate()
  }
}

function logSafely(deps: KeywordDetectorDeps, line: string): void {
  try {
    deps.log(line)
  } catch {
    // 诊断不值得一次 step 失败。
  }
}

/** listener 自有逻辑：零 `next()` 调用（见上方 F-1 注记）。 */
function runKeywordDetectorStep(
  deps: KeywordDetectorDeps,
  payload: unknown,
  injectedSessions: WeakSet<object>,
  readDescriptorCached: (session: unknown) => SessionDescriptor,
): void {
  const agent = (deps.readAgent ?? readPreStepAgent)(payload)
  // 载荷没有 agent —— 与 ① 号同为"绝大多数 pre-step 之前就没有可判别对象"的
  // 常态，不记日志。`KeywordSkipReason` 因此不含 `no-agent`：该分支根本不进
  // 判定函数，一个永远不产生的 reason 就是一条永远没人核对的分支。
  if (agent === undefined) return
  const session = isObject(agent.session) ? agent.session : undefined
  const descriptor = readDescriptorCached(session)
  if (deps.texts === undefined) {
    // 降级态：无 vendor 正文时一条日志都不打（registrar 已在 apply 期打过
    // 具名 NOTE），每步再打一次只会刷屏。
    return
  }
  const current = readCurrentUserTextDetail(payload)
  const decision = decideKeywordInjection(
    {
      hasInject: typeof agent.inject === 'function',
      texts: deps.texts,
      promptText: (current.commandExpansionSkipped === true && current.text === undefined
        ? undefined
        : current.text),
      commandExpansionSkipped: current.commandExpansionSkipped,
      descriptor,
      alreadyInjected: session !== undefined && injectedSessions.has(session),
      config: deps.config,
    },
  )
  if (decision.kind === 'skip') {
    // MINOR-7：只有 ① 号（`synthetic-internal`，绝大多数 pre-step 的常态）不记日志。
    // `command-expansion` **要记**——它意味着命令面与关键词面发生过一次交互，是本
    // 文件里最该留下痕迹的一条。
    if (decision.reason !== 'synthetic-internal') {
      // ① 号是绝大多数 pre-step 的常态（无用户文本），不记日志。
      logSafely(deps, formatKeywordDetectorLine(`skipped: ${decision.reason}`))
    }
    return
  }
  // ⚠️ 这里刻意**不写** `if (agent.inject === undefined) return`：`hasInject` 事实是
  // `inject` 判定的**充要前置**，所以那条守卫不可达——而不可达的守卫意味着
  // "判定通过但没有注入面"这条路径永远无人核对，正是本次评审 MINOR-4 点名的
  // 坏味道。`?.` 仅用于类型收窄：若将来判定条件放宽到不依赖 `hasInject`，
  // 这里会静默吞掉一次注入**并且**把会话标记为已注入（最坏的组合），届时
  // 单测 `an agent without an inject surface skips with a named reason` 里的
  // 两条无-inject 载荷必须重新审视（它们今天都走 no-inject-surface）。
  agent.inject?.(buildInjectionMessage(decision.text))
  if (session !== undefined) injectedSessions.add(session)
  logSafely(
    deps,
    formatKeywordDetectorLine(
      `injected [${decision.types.join(', ')}] into `
      + `${descriptor.label ?? 'main session'} (${decision.text.length} chars)`,
    ),
  )
}

function readPreStepAgent(payload: unknown): PreStepAgentLike | undefined {
  if (!isObject(payload)) return undefined
  const agent = payload.agent
  return isObject(agent) ? (agent as PreStepAgentLike) : undefined
}

// ── 注册 ────────────────────────────────────────────────────────────────────

/**
 * 本 registrar。上游 25 文件 → 1 个 pre-step listener + 1 次 apply 期的
 * vendor 正文加载。
 *
 * `entry.event`（manifest 的 PRIMARY event = `agent/pre-step`）是唯一事件来源；
 * 本文件不写第二个事件字面量（纪律④）。
 */
export const registerKeywordDetector: HookRegistrar = (
  ctx: HooksRegistrationContext,
  entry: HookManifestEntry,
) => {
  const config = resolveConfig(readConfigOverride(ctx))
  const loaded = loadInstructionTexts()
  let texts: InstructionTexts | undefined
  if (loaded.ok) {
    texts = loaded.texts
    console.log(formatKeywordDetectorLine(`instruction texts loaded: ${describeInstructionTexts(texts)}`))
  } else {
    for (const failure of loaded.failures) {
      console.warn(formatKeywordDetectorDegradedLine(
        `${failure.kind} vendor text ${failure.path}`
        + ('error' in failure ? ` (${failure.error})` : '')
        + ' — no keyword will be injected, and no substitute text is ever used',
      ))
    }
  }

  const listener = createKeywordDetectorListener({
    texts,
    config,
    log: (line) => console.warn(line),
  })
  ctx.on(entry.event, (payload: unknown, next: unknown) => listener(payload, next))
}

/**
 * 配置覆盖读面。**导出**是为了让它可单测——一个不导出、也没有其他可达路径的
 * 配置读面就是死代码，而死代码比没有配置更糟（它看起来在工作）。
 * `ctx.config?.keywordDetector`（若宿主提供了）覆盖默认值；
 * 上游两个字段都是 optional 无默认，本移植默认即"全启用、无 allowlist"。
 * 读面缺席（当前 DSH 组合不向插件暴露 config 服务）不是错误：默认生效。
 */
export function readConfigOverride(
  ctx: HooksRegistrationContext,
): Partial<KeywordDetectorConfig> | undefined {
  // ⚠️ **`ctx.get('config')`, never `ctx.config`.** The cordis ctx is a Proxy that
  // THROWS on an undeclared property access — `ctx.config` on a context with no
  // injected `config` service raises `cannot get property "config" without
  // inject`. P4-T13's e2e caught exactly that: the whole hook failed to register
  // (`[omo-hooks] hook keyword-detector FAILED: Error: cannot get property
  // "config" without inject`) and every keyword assertion was vacuously red.
  // The optional-chaining `?.` did NOT help — the throw happens on the property
  // GET, before the chain applies. `ctx.get(name)` is the sanctioned optional
  // read (same idiom as ulw-execute's `ctx.get('jobs')`, which has the same
  // "the service is usually absent at apply() time" property).
  const service = readOptionalService(ctx, 'config')
  const raw = isObject(service) ? (service as { keywordDetector?: unknown }).keywordDetector : undefined
  if (!isObject(raw)) return undefined
  const disabled = raw.disabledKeywords ?? raw.disabled_keywords
  const enabled = raw.enabledExpansions ?? raw.enabled_expansions
  return {
    ...(Array.isArray(disabled) ? { disabledKeywords: disabled as KeywordType[] } : {}),
    ...(Array.isArray(enabled) ? { enabledExpansions: enabled as KeywordType[] } : {}),
  }
}

/**
 * `ctx.get(name)` narrowed to a readable value, and **inert on a throwing ctx**.
 *
 * Two independent reasons for the try/catch, both learned the hard way:
 *   * the ctx proxy throws for an undeclared property, and a future cordis could
 *     throw from `get()` itself — either way a *config read* must not be able to
 *     take hook registration down with it;
 *   * S-10's whole premise is "a bad config degrades to the default, it does not
 *     fail the step". A config read that throws would break that premise at
 *     apply() time, long before any step runs.
 */
function readOptionalService(ctx: unknown, name: string): unknown {
  if (!isObject(ctx)) return undefined
  const get = (ctx as { get?: unknown }).get
  if (typeof get !== 'function') return undefined
  try {
    return (get as (service: string) => unknown).call(ctx, name)
  } catch {
    return undefined
  }
}
