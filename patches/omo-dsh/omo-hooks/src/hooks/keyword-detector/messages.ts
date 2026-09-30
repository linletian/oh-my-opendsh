// keyword-detector/messages.ts — P4-T12: the injected instruction bodies.
//
// Upstream: packages/omo-opencode/src/hooks/keyword-detector/ @ v4.19.4
// (commit b072d279110bdda2c6ac2525d0d24dc54d16148a). Per-file attribution:
// ../keyword-detector.ts header.
//
// **语义移植（非逐字复制）**：上游的 6 份 message .md / 5 个变体工厂不作为
// 文件移植（它们的正文由 P4-T4 vendor 承载，见下），本模块只保留**组合规则**
// 与名册感知尾注这一层前端处理。
//
// WHAT IS PORTED VERBATIM vs WHAT MOVED. Upstream's message bodies are thin
// forwarders — `ultrawork/{default,gpt,gemini,glm,planner}.ts` are 7-15 lines
// each and all they do is `return ULTRAWORK_*_PROMPT` from
// `@oh-my-opencode/prompts-core` (S-1 in the header table: 6 prompt .md files,
// NOT ported as files). This port therefore has no message *prose* of its own
// to copy: the bodies are the **vendored skill content** from P4-T4
// (`patches/omo-dsh/vendor/shared-skills/skills/{ultrawork,hyperplan}/SKILL.md`),
// read from disk ONCE at apply time. The injection surface references that
// text; it never re-writes the instruction inside the listener.
//
// WHY VENDOR TEXT AND NOT A CODE CONSTANT. The task book's narrowing is
// explicit: "注入面引用 vendor 文本，不在 listener 里重写指令". A code copy
// would be a second, silently-diverging copy of ~30 KB of upstream copyright
// content, with nothing to detect the drift. Reading the vendored file keeps
// one copy, and the P4-T4 manifest is what pins its bytes.
//
// 前端剥离 (what this file DOES contribute):
//   ① the 5 model variants collapse to ONE roster-aware body (S-3),
//   ② the combo body = upstream's banner wrapper (verbatim, constants.ts) +
//     the ultrawork body — the same shape as upstream's
//     `getHyperplanUltraworkMessage` = BANNER + "\n\n" + getUltraworkMessage(...).
//
// MINOR-6 — `skill(name="hyperplan")` 的载体映射登记（**双评审更正了前提**）。
// 评审 MINOR 一度认为该调用在 DSH 无对应面、需在正文里改写；**实测结论相反**：
// DSH **有** skill 工具（`dsh-tool-skill` 模型面，e2e 实测在工具表里），且
// `hyperplan` 已由 P4-T5 注册进本部署的 skill catalog（19 个 vendored skill，
// e2e 的 skills 场景实测 `catalogSkillNames` 含 `hyperplan`）。所以
//   * **正文不改写** —— banner 里那句 `skill(name="hyperplan")` 逐字保留；
//   * 落地方式是命令语法而非工具名：`skill(name="X")` 这一 OMO 调用写法，在
//     DSH 侧等价于「调用 skill 工具加载名为 `X` 的 skill」。
// 与独立路径的关系：独立 hyperplan 走 {@link buildHyperplanMessage}，正文自带
// 全文（不需要再加载 skill）；组合路径下 hyperplan 侧被抑制，正文只剩
// ultrawork，所以由 banner 那句加载指令**替它**加载——两句都是 `skill(name=…)`
// 的同一载体，注记只登记一次，此处不重复。
//   ③ frontmatter is stripped, because the vendored file is a SKILL.md
//     (name/description/metadata) and those keys are catalogue metadata, not
//     instructions — injecting `name: ultrawork` at the model is noise, and it
//     would also pollute the message-level idempotency probe downstream.
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see index.ts).

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMBO_BANNER_PREFIX,
  HYPERPLAN_BANNER_LINE,
  HYPERPLAN_PATTERN,
  HYPERPLAN_ULTRAWORK_PATTERN,
  ROSTER_REVIEWER_IDS,
  ULTRAWORK_PATTERN,
  UNMAPPED_REVIEWER_LITERALS,
  type InstructionTexts,
  type KeywordDetectorSpec,
  type KeywordMessageDeps,
  type KeywordType,
} from './constants.ts'

/** 两个 vendor 指令正文相对本模块的路径（P4-T4 的 shared-skills 包）。 */
export const ULTRAWORK_SKILL_RELATIVE_PATH =
  '../../../../vendor/shared-skills/skills/ultrawork/SKILL.md'
export const HYPERPLAN_SKILL_RELATIVE_PATH =
  '../../../../vendor/shared-skills/skills/hyperplan/SKILL.md'

/** 仓库相对路径（用于日志 + 单测断言；读盘走模块目录，不走仓库根）。 */
export const ULTRAWORK_SKILL_REPO_PATH =
  'patches/omo-dsh/vendor/shared-skills/skills/ultrawork/SKILL.md'
export const HYPERPLAN_SKILL_REPO_PATH =
  'patches/omo-dsh/vendor/shared-skills/skills/hyperplan/SKILL.md'

/** 本模块所在目录（`src/hooks/keyword-detector/`），由 import.meta.url 解析。 */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** 注入面读盘用的可替换读函数（单测注入 fixture，不触真实磁盘）。 */
export type ReadTextFile = (absolutePath: string) => string

/** 读盘失败的具名原因（诊断与单测断言用）。 */
export type LoadFailure =
  | { readonly kind: 'missing'; readonly path: string }
  | { readonly kind: 'unreadable'; readonly path: string; readonly error: string }

export type LoadResult =
  | { readonly ok: true; readonly texts: InstructionTexts }
  | { readonly ok: false; readonly failures: readonly LoadFailure[] }

/**
 * Strips the SKILL.md YAML frontmatter. Only the file's own LEADING `---`
 * block is removed; a `---` later in the body is left alone (there is none
 * today, and one appearing mid-body must NOT be eaten).
 */
export function stripFrontmatter(text: string): string {
  const match = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
  if (match === null) return text
  return text.slice(match[0].length)
}

/**
 * Loads both vendored instruction bodies, once, at apply time.
 *
 * FAIL LOUD, NEVER IMPROVISE. A missing/unreadable vendor file returns a
 * failure result, and the listener then injects NOTHING and logs a named
 * NOTE. It never falls back to a hand-written substitute body: a silently
 * different instruction would be worse than no instruction, because the mode
 * would appear to arm while carrying text nobody reviewed.
 */
export function loadInstructionTexts(read: ReadTextFile = defaultRead): LoadResult {
  const failures: LoadFailure[] = []
  const bodies: Record<'ultrawork' | 'hyperplan', string> = { ultrawork: '', hyperplan: '' }
  for (const [name, relativePath, repoPath] of [
    ['ultrawork', ULTRAWORK_SKILL_RELATIVE_PATH, ULTRAWORK_SKILL_REPO_PATH],
    ['hyperplan', HYPERPLAN_SKILL_RELATIVE_PATH, HYPERPLAN_SKILL_REPO_PATH],
  ] as const) {
    const absolute = resolve(MODULE_DIR, relativePath)
    if (!existsSync(absolute)) {
      failures.push({ kind: 'missing', path: repoPath })
      continue
    }
    let raw: string
    try {
      raw = read(absolute)
    } catch (err) {
      failures.push({
        kind: 'unreadable',
        path: repoPath,
        error: String((err as Error | undefined)?.message ?? err),
      })
      continue
    }
    const body = stripFrontmatter(raw)
    if (body.trim().length === 0) {
      failures.push({
        kind: 'unreadable',
        path: repoPath,
        error: 'body is empty after frontmatter strip',
      })
      continue
    }
    bodies[name] = body.trim()
  }
  if (failures.length > 0) return { ok: false, failures }
  return {
    ok: true,
    texts: {
      ultrawork: bodies.ultrawork,
      hyperplan: bodies.hyperplan,
      ultraworkPath: ULTRAWORK_SKILL_REPO_PATH,
      hyperplanPath: HYPERPLAN_SKILL_REPO_PATH,
    },
  }
}

function defaultRead(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8')
}

/**
 * 上游 agent/model 路由（5 变体）收窄后的**唯一**名册感知尾注。
 *
 * 收窄理由（计划书 C-08「模型变体文案按 DSH 名册现实收窄」）：上游按
 * gpt/glm/glm/gemini/default/planner 分 5 份文案，DSH 名册里既无这些模型族、
 * 也无上游的 reviewer 代理。实测：vendor `ultrawork/SKILL.md` 正文点名
 * `momus`（3 次）与 `metis`（2 次）两个 plan-gated reviewer，而 Phase 2 名册
 * 的 11 行里没有它们（`subagent_type: "momus"` 也在正文里逐字出现）。因此
 * **最小收窄** = 正文逐字照搬 vendor，只把"reviewer 指向谁"这一处用代码补齐。
 */
export const ROSTER_TAIL_NOTE =
  '[oh-my-opendsh] Roster note: the upstream reviewer agents '
  + `\`${UNMAPPED_REVIEWER_LITERALS.join('` / `')}\` have no row in this deployment's roster; `
  + `the reviewer seat here is \`${ROSTER_REVIEWER_IDS.join('` / `')}\` `
  + '(read-only advisors). A "momus"/"metis" reference in the body above means one of those two.'

/** 名册感知尾注是否需要（已在只读顾问会话里则不追加，避免自我指涉的噪音）。 */
export function needsRosterNote(agentName: string | undefined): boolean {
  if (agentName === undefined) return true
  return !ROSTER_REVIEWER_IDS.includes(agentName)
}

function withRosterNote(body: string, agentName: string | undefined): string {
  return needsRosterNote(agentName) ? `${body}\n\n${ROSTER_TAIL_NOTE}` : body
}

/**
 * 独立 ultrawork 模式正文。
 *
 * ⚠️ **不额外包 `<ultrawork-mode>`**：vendor `ultrawork/SKILL.md` 的正文**自带**
 * 这一对标签（实测：frontmatter 之后第一行是 `<ultrawork-mode>`，全文 1 开 1 闭，
 * 文件共 538 行）。上游 `ULTRAWORK_DEFAULT_PROMPT` 同样自带标签，所以"再包一层"
 * 会在模型面前产生嵌套同名标签。本移植因此**原样交付 vendor 正文**；单测 ⑥
 * 断言它确实以 `<ultrawork-mode>` 开头、以 `</ultrawork-mode>` 结尾（若某次
 * vendor 更新去掉这对标签，单测会报出来，而不是让注入文本悄悄失去边界标记）。
 *
 * 唯一的偏离是**前置**一段载体注记（{@link ULTRAWORK_CARRIER_NOTE}，见那里
 * 的三条差异），它不带标签，因此不改变"标签唯一"这一性质。
 *
 * 对照：hyperplan 的 vendor 正文**没有**标签（首行是
 * `# HYPERPLAN — Adversarial Multi-Agent Planning`），所以
 * {@link buildHyperplanMessage} 保留上游形状的 `<hyperplan-mode>` 包装。
 */
export function buildUltraworkMessage(deps: KeywordMessageDeps): string {
  // 载体注记放在 vendor 正文**之前**（与 hyperplan 侧同形），且不带
  // `<ultrawork-mode>` 标签——那个标签必须仍然是正文的唯一一对（vendor 正文
  // 自带，本函数不再包第二层，见下方注释）。
  const body = `${ULTRAWORK_CARRIER_NOTE}\n\n${deps.texts.ultrawork}`
  return withRosterNote(body, deps.agentName)
}

/**
 * 独立 hyperplan 模式正文。
 *
 * 载体差异登记（S-7，**必须先读**）：上游 `HYPERPLAN_MESSAGE` 的 8 步工作流
 * 内联在 `prompts-core/prompts/mode/hyperplan.md` 里，并依赖 opencode 的
 * `team_create` 团队工具族；本移植的正文是 P4-T4 vendor 的
 * `hyperplan/SKILL.md`（senpi 变体，同样以 `team_create` / `task_send` /
 * `team_delete` 为骨架：实测正文 `team_*` 出现 13 次、`task_send` 17 次）。
 * DSH 侧**这三个工具没有等价面**（C 组证据「载体」：team 工具族无等价面，
 * subagent 是最近邻但缺 teamRunId/广播/关闭协议）。
 *
 * 处置：正文逐字照搬 vendor（不重写指令），在 banner 之后加一段**载体声明**
 * ——它陈述工具名的 DSH 对应物，是环境事实而非指令改写。若不声明，模型会去
 * 调用一个不存在的 `team_create` 并空手而归；若照上游那句 "If team-mode is
 * unavailable … enable `team_mode.enabled`" 收尾，则会把用户引向本部署里
 * 根本不存在的 opencode 配置文件（P4-T1 已登记的配置面不一致，见
 * ../keyword-detector.ts 的 S-7）。
 */
export const HYPERPLAN_CARRIER_NOTE = [
  '[oh-my-opendsh] Carrier note: the opencode lead-team tools this workflow names',
  '(`team_create`, `task_send`, `team_delete`) have NO equivalent in this deployment.',
  'The nearest surface is DSH subagent dispatch: spawn the 5 members as 5 separate',
  '`task(...)` subagent calls (categories `unspecified-low`, `unspecified-high`,',
  '`deep`, `ultrabrain`, `artistry`; drop `deep` when the category does not resolve),',
  "use each subagent's own session as the lane (there is no `team_run_id`: the five",
  'returned session labels are your lane map), and treat a returned message as a',
  '`task_send` reply. The round-3 handoff is the same `task(...)` dispatch the',
  'ultrawork body describes. Everything else in the body below is verbatim.',
].join('\n')

/**
 * 载体注记（ultrawork 侧）：notepad 落点 / 回读方式 / `mktemp -t` 的形态三处。
 *
 * vendor `ultrawork/SKILL.md` 第 173-174 行逐字要求：
 *
 *     ## 2. Open the durable notepad
 *     Run: `NOTE=$(mktemp -t ulw-$(date +%Y%m%d-%H%M%S).XXXXXX.md)`.
 *
 * ⚠️ **体例（本注记的自律条款）**：每条差异都必须**可被一条命令或一段文件内容
 * 证伪**。写进注入文本的是给模型读的环境事实，事实错了比不说更糟——模型会照着
 * 一条假陈述行动。所以每条后面标出可核验它的手段（命令 / 文件行号），且**没有**
 * 任何一条以"我以为"成立。
 *
 * 三处与本部署不一致，正文**不改写**（逐字是纪律），差异在此声明：
 *
 *   1. **notepad 落点**：`mktemp -t` 把文件建在平台默认的临时目录
 *      （`$TMPDIR`，未设时 `/tmp`），而本部署的持久约定是工作区内的
 *      `.omo/notepads/`（同插件先例 `ulw-execute/constants.ts` 的
 *      `NOTEPAD_DIR_SEGMENTS = ['.omo','notepads']`，Phase 2 已建立）。
 *      临时目录里的 notepad 跨会话不可见——而 notepad 的**全部价值**就是跨会话
 *      续写（正文第 207 行 "the WHOLE notepad FIRST before any other action,
 *      then resume"）。
 *      证伪手段：`echo $TMPDIR; man mktemp | grep -A2 '^ *-t'`（`-t` 的
 *      目录由 TMPDIR 决定），对照 `tests/omo-hooks/keyword-detector.test.ts`
 *      对 `NOTEPAD_DIR_SEGMENTS` 的断言。
 *   2. **回读方式**：`cat` 读 notepad 在本部署会触发 `bash-file-read-guard`
 *      告警（dsh-fs-observation-policy：读文件用 `read` 工具）。正文里的
 *      "read the WHOLE notepad" 按本部署语义执行即 `read(NOTE)`。
 *      证伪手段：同包 guardrail 的 e2e 场景 `bash-read-guard-warned`
 *      （断言 `cat` 带 advisory、`read` 不带）。
 *   3. **`mktemp -t` 的形态（⚠️ 2026-10 更正过一次，见下）**：`-t` 在 **GNU
 *      coreutils 上仍然可用**，只是被手册标为 `[deprecated]`；vendor 的模板不含
 *      斜杠，符合 `-t` 的约束，所以**这条命令在本部署会成功执行**（实测
 *      exit 0）。所以差异**不在语法**，而在 `-t` 把落点交给了平台约定：它不给
 *      你选目录的机会。`-p <dir>` 才是能指定落点的形态（BSD 与 GNU 都支持），
 *      而这正是第 (1) 条需要的那个能力。
 *      证伪手段：`mktemp --version; man mktemp | grep -A2 '^ *-t'`（看
 *      `[deprecated]`），以及实跑
 *      `T=$(mktemp -t ulw-test.XXXXXX.md) && echo $? $T && rm -f $T`。
 *
 * 这三条都是**载体**差异，与指令语义无关——所以注记只声明差异，不重写流程。
 */
export const ULTRAWORK_CARRIER_NOTE = [
  '[oh-my-opendsh] Carrier note (notepad): three carrier-level differences from this',
  'deployment, declared rather than rewritten — the protocol below is verbatim.',
  '(1) LOCATION: `mktemp -t` writes to $TMPDIR, but the durable convention here is the',
  'workspace-local `.omo/notepads/` (the surface this package already scaffolds; see',
  'ulw-execute/constants.ts NOTEPAD_DIR_SEGMENTS). A $TMPDIR notepad is invisible to the',
  'next session, which defeats the only reason a notepad exists — the "read the WHOLE',
  'notepad FIRST … then resume" rule below is the workflow, so write it where the next',
  'turn will find it: `mkdir -p .omo/notepads` then',
  '`NOTE=$(mktemp -p .omo/notepads "ulw-$(date +%Y%m%d-%H%M%S).XXXXXX.md")`.',
  '(2) READ-BACK: `cat` on the notepad raises a bash-file-read-guard advisory here',
  '(dsh-fs-observation-policy: read files with the read tool). "Read the WHOLE notepad"',
  'means `read(' + "'" + '${NOTE}' + "'" + ')` here, not `cat`.',
  '(3) FORM: `mktemp -t` still works here (GNU coreutils marks it [deprecated], not',
  'removed; the slash-free template above satisfies its constraint and it exits 0), so this',
  'is NOT a syntax error. What `-t` cannot do is choose the destination — it defers to the',
  'platform temporary dir. `-p <dir>` is the form that takes a directory (supported by both',
  'BSD and GNU), which is exactly what (1) needs; that is why (1) uses `-p`.',
].join('\n')

/**
 * 独立 hyperplan 模式正文。
 *
 * hyperplan 的 vendor 正文**没有**标签（首行是
 * `# HYPERPLAN — Adversarial Multi-Agent Planning`），所以这里保留上游形状的
 * `<hyperplan-mode>` 包装——这是与 ultrawork 侧唯一的结构差异（见上方
 * buildUltraworkMessage 的注释：那一侧 vendor 正文自带标签，不能再包第二对）。
 */
export function buildHyperplanMessage(deps: KeywordMessageDeps): string {
  const body = [
    '<hyperplan-mode>',
    '',
    `**MANDATORY**: Say "${HYPERPLAN_BANNER_LINE}" exactly once as your first response.`,
    '',
    HYPERPLAN_CARRIER_NOTE,
    '',
    deps.texts.hyperplan,
    '',
    '</hyperplan-mode>',
  ].join('\n')
  return withRosterNote(body, deps.agentName)
}

/**
 * 组合模式正文 = 上游 constants.ts 的 banner 包装（逐字）**+** ultrawork 正文。
 *
 * 上游 `getHyperplanUltraworkMessage` 是 `BANNER + "\n\n" + getUltraworkMessage(...)`：
 * hyperplan 侧在独立词被抑制后，由 banner 里那句 `skill(name="hyperplan")`
 * 负责加载。本移植保持同一形状——banner 逐字保留（含"不要说独立 banner"的
 * 禁令与加载指令），正文只挂 ultrawork 一侧。
 */
export function buildHyperplanUltraworkMessage(deps: KeywordMessageDeps): string {
  // 上游形状逐字照搬：`getHyperplanUltraworkMessage` = BANNER + "\n\n" +
  // getUltraworkMessage(...)。banner 逐字保留（含"不要说独立 banner"的禁令与
  // hyperplan 加载指令），ultrawork 侧直接挂 vendor 正文——它自带
  // `<ultrawork-mode>` 标签，所以这里不再补第二对。
  return withRosterNote(`${COMBO_BANNER_PREFIX}\n\n${deps.texts.ultrawork}`, deps.agentName)
}

/**
 * 实际接线的关键词表。`team` 不在其中（枚举位预留，见 constants.ts 的
 * TEAM_PATTERN 处置注释）：type/pattern 常量在，消息工厂不在，于是它既不会
 * 命中也不会产出死指令。表放在本模块而非 constants.ts，是因为每个条目都要
 * 引用这里的 vendor 文案工厂，而 constants.ts 必须保持零 import。
 */
export const KEYWORD_DETECTORS: readonly KeywordDetectorSpec[] = [
  { type: 'ultrawork', pattern: ULTRAWORK_PATTERN, buildMessage: buildUltraworkMessage },
  { type: 'hyperplan', pattern: HYPERPLAN_PATTERN, buildMessage: buildHyperplanMessage },
  {
    type: 'hyperplan-ultrawork',
    pattern: HYPERPLAN_ULTRAWORK_PATTERN,
    buildMessage: buildHyperplanUltraworkMessage,
  },
]

/** 表里的类型集合（listener 的过滤谓词按它判定「合法类型」）。 */
export const WIRED_KEYWORD_TYPES: readonly KeywordType[] = KEYWORD_DETECTORS.map((d) => d.type)

/** 仅供诊断：本次 load 读到的正文来源与体量。 */
export function describeInstructionTexts(texts: InstructionTexts): string {
  return `ultrawork=${texts.ultraworkPath} (${texts.ultrawork.length} chars) + `
    + `hyperplan=${texts.hyperplanPath} (${texts.hyperplan.length} chars)`
}
