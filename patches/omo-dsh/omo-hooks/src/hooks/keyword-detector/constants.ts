// keyword-detector/constants.ts — P4-T12: the keyword registry, the shell
// patterns and the banner anchors for the ultrawork / hyperplan keyword mode.
//
// Upstream: packages/omo-opencode/src/hooks/keyword-detector/ @ v4.19.4
// (frozen baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a;
// PRE-1). Per-file attribution, see ../keyword-detector.ts's header table.
//
// This file is a SEMANTIC PORT (语义移植), not a byte copy: the pattern values
// are carried over **verbatim** (they are the hook's whole discrimination
// surface), while the message factories point at the vendored skill content
// (P4-T4) instead of `@oh-my-opencode/prompts-core`, and the `team` entry is
// registered as a reserved slot but not wired.
//
// VERBATIM FROM UPSTREAM (constants.ts:1-2, detector.ts:18; hyperplan/default.ts:20;
// team/default.ts:10; constants.ts:14-15):
//   CODE_BLOCK_PATTERN / INLINE_CODE_PATTERN — the text shell that is removed
//     before any keyword is matched, so a keyword quoted inside code never
//     arms the mode.
//   SLASH_COMMAND_LEAD_PATTERN — a prompt that *starts* with a slash command is
//     a command invocation, not free text; upstream skips the whole message.
//   HYPERPLAN_PATTERN — `(?<![\w.])` is upstream issue #4215: the C++ header
//     extension `.hpp` must not trigger hyperplan mode. Do not "simplify" it.
//   HYPERPLAN_ULTRAWORK_PATTERN — STRICT adjacency, both word orders
//     (`hyperplan ulw`, `hpp ultrawork`, `ulw hpp`, `ultrawork hyperplan`).
//     Two unrelated words separated by a sentence are NOT the combo.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.

/** Keyword kinds the detector can fire. `team` is a reserved, unwired slot. */
export type KeywordType = 'ultrawork' | 'team' | 'hyperplan' | 'hyperplan-ultrawork'

/** 剥壳：code fence + inline code（上游 constants.ts:1-2 逐字）。 */
export const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g
export const INLINE_CODE_PATTERN = /`[^`]+`/g

/** slash 前导判定（上游 detector.ts:18 逐字）。 */
export const SLASH_COMMAND_LEAD_PATTERN = /^\s*\/[a-zA-Z][\w-]*(?:\s|$)/

/** 上游 shared/system-directive.ts 的前缀与「关键词在前」的宽限（逐字）。 */
export const SYSTEM_DIRECTIVE_PREFIX = '[SYSTEM DIRECTIVE: OH-MY-OPENCODE'
export const SYSTEM_DIRECTIVE_LEADING_KEYWORD_PATTERN = /^\s*(?:ultrawork|ulw)\s+/i
/** `<system-reminder>…</system-reminder>`（上游 removeSystemReminders 逐字）。 */
export const SYSTEM_REMINDER_PATTERN = /<system-reminder>[\s\S]*?<\/system-reminder>/gi

/** ultrawork（上游 constants.ts:36 逐字）。 */
export const ULTRAWORK_PATTERN = /\b(ultrawork|ulw)\b/i

/**
 * hyperplan（上游 hyperplan/default.ts:20 逐字）。
 * ⚠️ `(?<![\w.])` = 上游 issue #4215：`.hpp`（C++ 头文件扩展名）不得误触。
 */
export const HYPERPLAN_PATTERN = /\bhyperplan\b|(?<![\w.])hpp\b/i

/**
 * team（上游 team/default.ts:10 逐字）——**枚举位预留，本阶段不接线**。
 * 上游的 `TEAM_MESSAGE` 指向 `prompts-core/prompts/mode/team.md`，其语义是
 * `team_create` 团队的运行协议，而 DSH 无等价面（C 组证据 §「载体」：team
 * 工具族 = 无等价面，subagent 是最近邻但缺 teamRunId/广播/关闭协议）。
 * 处置：模式与消息槽位都留着（Phase 5 接 Team Mode 时只需接上消息工厂），
 * 但 {@link WIRED_KEYWORD_DETECTORS} 不含它——一个没有等价载体的关键词
 * 命中后只会产出死指令。
 */
export const TEAM_PATTERN = /\bteam[\s_-]?mode\b/i

/** 组合模式：严格相邻 + 双词序（上游 constants.ts:14-15 逐字）。 */
export const HYPERPLAN_ULTRAWORK_PATTERN =
  /\b(?:hpp|hyperplan)\s+(?:ulw|ultrawork)\b|\b(?:ulw|ultrawork)\s+(?:hpp|hyperplan)\b/i

// ── banner 锚点（逐字，单测钉死） ───────────────────────────────────────────
//
// 上游这些字符串是**用户可见**的第一句话，且都被写成"逐字照说"的强制指令；
// 它们是本 hook 最容易被静默改坏的产物，所以在此集中定义 + 单测断言。
// ultrawork 的锚点在 vendor 的 `ultrawork/SKILL.md` 正文里（见 messages.ts
// 的 ANCHOR 行），hyperplan 的在 `hyperplan/SKILL.md` 的 Phase 0 里；组合
// banner 是上游 constants.ts 的 wrapper（两个文件里都没有），故在此定义。

/**
 * 独立 ultrawork 模式的第一句。
 *
 * ⚠️ **test-only anchor**：这句**只**被单测和 vendor 漂移守测引用，**不参与
 * 组装任何注入正文**——vendor `ultrawork/SKILL.md` 自己就带着这句
 * `**MANDATORY**: Say "ULTRAWORK MODE ENABLED!" exactly once…`，正文原样交付，
 * 所以"首句是什么"由 vendor 文件决定，不由本常量决定。删掉它不会改变任何输出，
 * 只会让守测失去锚点。
 */
export const ULTRAWORK_BANNER_LINE = 'ULTRAWORK MODE ENABLED!'
/** 独立 hyperplan 模式的第一句（vendor hyperplan/SKILL.md Phase 0 的锚点行）。 */
export const HYPERPLAN_BANNER_LINE = 'HYPERPLAN MODE ENABLED!'
/** 组合模式的第一句（上游 constants.ts 的 HYPERPLAN_ULTRAWORK_BANNER 逐字）。 */
export const COMBO_BANNER_LINE = 'HYPERPLAN ULTRAWORK MODE ENABLED!'

/**
 * 上游 `constants.ts:22-26` 的 `HYPERPLAN_ULTRAWORK_BANNER` **逐字**
 * （含行内换行位置与两个空格）。它显式禁止两个独立 banner
 * （`Do NOT say the standalone …`），这正是 combo 抑制独立注入的**文案侧**
 * 理由——与 listener 侧的 `suppressComboStandalones` 互为双保险。
 * ⚠️ 不要"改善"换行或标点：这是注入面最容易被静默改坏的一段文本。
 */
export const COMBO_BANNER_PREFIX = `<hyperplan-ultrawork-mode>
**MANDATORY**: Say "${COMBO_BANNER_LINE}" exactly once as your first response. Do NOT say the standalone "ULTRAWORK MODE ENABLED!" or "HYPERPLAN MODE ENABLED!" banners.

Apply the ultrawork protocol below as your execution framework. You MUST ALSO load the hyperplan skill immediately via \`skill(name="hyperplan")\` and follow its full adversarial workflow — do NOT improvise, do NOT skip rounds, do NOT write the plan yourself.
</hyperplan-ultrawork-mode>`

// ── 名册感知（Phase 2 名册收窄，见 ../keyword-detector.ts 的 S-3） ───────────

/**
 * 上游 5 份模型变体文案（default/gpt/glm/gemini/planner）收窄成**一份**名册
 * 感知文案时，唯一需要在代码里写死的名册事实：vendor ultrawork 正文点名的
 * 两个 reviewer（`momus` 3 次 / `metis` 2 次）在 Phase 2 名册里**不存在**，
 * 席位由两个只读顾问占位。单测对这些字面量做守测。
 */
export const ROSTER_REVIEWER_IDS: readonly string[] = ['plan-consultant', 'plan-reviewer']

/** vendor ultrawork 正文中被点名、但名册里没有的 reviewer 字面量。 */
export const UNMAPPED_REVIEWER_LITERALS: readonly string[] = ['momus', 'metis']

// ── DSH 名册（按 Phase 2 名册现实裁定，见 ../keyword-detector.ts 的 S-4） ────

/**
 * Phase 2 名册的 11 个 agent id（patches/omo-dsh/omo-agents/src/roster.ts 的
 * `ROSTER` 行）。**故意不 import omo-agents**：两个插件之间禁止互相 import
 * （index.ts 头部纪律），所以这里是名册的一份**快照**；漂移方向由本文件单测
 * 对真实 roster.ts 做一次守测承担（见 tests/omo-hooks/keyword-detector.test.ts
 * 的 ① 号断言），而不是靠跨包 import。
 */
export const OMO_ROSTER_AGENT_IDS: readonly string[] = [
  'sisyphus',
  'sisyphus-junior',
  'hephaestus',
  'explore',
  'oracle',
  'librarian',
  'plan-consultant',
  'plan-reviewer',
  'atlas',
  'multimodal-looker',
  'prometheus',
]

/** 组装一条注入正文（listener 注入 vendor 文案与名册感知参数）。 */
export type KeywordMessageBuilder = (deps: KeywordMessageDeps) => string

/** 一个关键词条目：类型 + 判别模式 + 文案工厂。表在 messages.ts（需要 vendor 文案）。 */
export interface KeywordDetectorSpec {
  readonly type: KeywordType
  readonly pattern: RegExp
  readonly buildMessage: KeywordMessageBuilder
}

export interface KeywordMessageDeps {
  /** vendor 文案正文（ultrawork / hyperplan 的 SKILL.md 正文）。 */
  readonly texts: InstructionTexts
  /** 当前 agent 名（名册感知用；缺席即未知）。 */
  readonly agentName: string | undefined
}

/** 组合模式依赖的两个基词（交集禁用规则的输入，见 detector.ts）。 */
export const COMBO_BASE_TYPES: readonly KeywordType[] = ['ultrawork', 'hyperplan']

/** 非主会话（子会话）只保留的类型：上游 hook.ts 的过滤谓词逐字。 */
export const SUBAGENT_ALLOWED_TYPES: readonly KeywordType[] = [
  'ultrawork',
  'hyperplan-ultrawork',
]

/** vendor 文案载体（messages.ts 从 vendored SKILL.md 读盘后构造）。 */
export interface InstructionTexts {
  readonly ultrawork: string
  readonly hyperplan: string
  /** 两个正文各自的来源路径（仓库相对），用于日志与单测断言。 */
  readonly ultraworkPath: string
  readonly hyperplanPath: string
}