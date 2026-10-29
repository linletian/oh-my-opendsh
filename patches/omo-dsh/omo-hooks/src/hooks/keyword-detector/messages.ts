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
  TEAM_PATTERN,
  ULTRAWORK_PATTERN,
  UNMAPPED_REVIEWER_LITERALS,
  type InstructionTexts,
  type KeywordDetectorSpec,
  type KeywordMessageDeps,
  type KeywordType,
} from './constants.ts'

/** vendor 指令正文相对本模块的路径（P4-T4 的 shared-skills 包）。 */
export const ULTRAWORK_SKILL_RELATIVE_PATH =
  '../../../../vendor/shared-skills/skills/ultrawork/SKILL.md'
export const HYPERPLAN_SKILL_RELATIVE_PATH =
  '../../../../vendor/shared-skills/skills/hyperplan/SKILL.md'
/**
 * team 槽正文相对本模块的路径（P5-T12 的 prompts-team 包）。上游载体是
 * `packages/prompts-core/prompts/mode/team.md`（经 `team/default.ts` 的
 * `TEAM_MESSAGE` 引用），P5-T12 逐字 vendor 进 prompts-team 包后由这里
 * 以同一读盘形态装载（同一 loader、同一 fail-loud 纪律）。
 */
export const TEAM_MD_RELATIVE_PATH =
  '../../../../vendor/prompts-team/prompts/mode/team.md'

/** 仓库相对路径（用于日志 + 单测断言；读盘走模块目录，不走仓库根）。 */
export const ULTRAWORK_SKILL_REPO_PATH =
  'patches/omo-dsh/vendor/shared-skills/skills/ultrawork/SKILL.md'
export const HYPERPLAN_SKILL_REPO_PATH =
  'patches/omo-dsh/vendor/shared-skills/skills/hyperplan/SKILL.md'
/** team.md 的仓库相对路径（P5-T12；同一日志/断言用途）。 */
export const TEAM_MD_REPO_PATH =
  'patches/omo-dsh/vendor/prompts-team/prompts/mode/team.md'

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
 * 加载三份 vendored 指令正文（ultrawork / hyperplan / team），一次性，apply 期。
 *
 * FAIL LOUD, NEVER IMPROVISE. A missing/unreadable vendor file returns a
 * failure result, and the listener then injects NOTHING and logs a named
 * NOTE. It never falls back to a hand-written substitute body: a silently
 * different instruction would be worse than no instruction, because the mode
 * would appear to arm while carrying text nobody reviewed.
 *
 * P5-T12：team.md 进同一 loader = **all-or-nothing 覆盖到第三份正文**——
 * 半在场的 vendor 包是坏安装，诚实的启动姿态是「一个都不注入 + 具名 NOTE」，
 * 不是 team 缺席时 ultrawork 照常武装。
 */
export function loadInstructionTexts(read: ReadTextFile = defaultRead): LoadResult {
  const failures: LoadFailure[] = []
  const bodies: Record<'ultrawork' | 'hyperplan' | 'team', string> = {
    ultrawork: '',
    hyperplan: '',
    team: '',
  }
  for (const [name, relativePath, repoPath] of [
    ['ultrawork', ULTRAWORK_SKILL_RELATIVE_PATH, ULTRAWORK_SKILL_REPO_PATH],
    ['hyperplan', HYPERPLAN_SKILL_RELATIVE_PATH, HYPERPLAN_SKILL_REPO_PATH],
    ['team', TEAM_MD_RELATIVE_PATH, TEAM_MD_REPO_PATH],
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
      team: bodies.team,
      ultraworkPath: ULTRAWORK_SKILL_REPO_PATH,
      hyperplanPath: HYPERPLAN_SKILL_REPO_PATH,
      teamPath: TEAM_MD_REPO_PATH,
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
 * ⚠️ **两侧注记一致性纪律（A-4）**：组合形态 {@link buildHyperplanUltraworkMessage}
 * 交付**同一份** vendor 正文，所以那一侧也前置**同一个常量**；改这里必须同步看
 * 那一侧（详细纪律写在那里的注释里）。
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
  '[oh-my-opendsh] Carrier note: the body below is upstream\'s hyperplan text and names the',
  'opencode lead-team tools (`team_create`, `task_send`, `team_delete`) and the opencode',
  'category roster (`unspecified-low`, `unspecified-high`, `deep`, `ultrabrain`, `artistry`).',
  '',
  'THIS DEPLOYMENT HAS A TEAM SURFACE — it is not the opencode one. Translate the team calls:',
  '  * `team_create` takes ONE argument: `inline_spec` (an object or a JSON string of one)',
  '    whose members are `{"name":..., "category":"quick"|"deep", "prompt":...}`.',
  '  * `task_send({to, team_run_id, message})` becomes',
  '    `team_send_message(teamRunId=<id>, to=<member|"lead"|"*">, body=<text>)` — `body` is',
  '    REQUIRED on this surface.',
  '  * `team_run_id` becomes `teamRunId`.',
  '  * The opencode categories do NOT resolve here — `quick` and `deep` are the only two',
  '    member categories.',
  '  * The `/hyperplan` command carries this deployment\'s adapted full adversarial ring.',
  '',
  'IF the team_* tools are ABSENT in this session, the nearest surface is DSH subagent',
  'dispatch: one delegation per member over this deployment\'s seats (explore, hephaestus,',
  'oracle, librarian, plan-consultant, plan-reviewer, atlas, multimodal-looker,',
  'sisyphus-junior, prometheus), each returned session being one lane — there is no `team_run_id`',
  'then (the returned session labels are your lane map), and a returned',
  'message being the reply. The round-3 handoff is the same delegation dispatch the',
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
  '',
  // P5-T19（第三轮评审 MAJOR-3）：ultrawork 正文里那段 "omo-senpi task + team tools"
  // （`SKILL.md:373-393`）教的是 opencode 的 team 词汇——`category | subagent_type`
  // （本面**拒** `subagent_type`，`SUBAGENT_TYPE_UNSUPPORTED`）、`task_send`、
  // `team_run_id`、`task_create/task_list/...`（本面是 `team_task_*`）。上一轮只给
  // 技能注册面加了注记，**keyword 注入面**没有——而 prose 命中 "ulw" 走的就是这条
  // 路。这一段与 `omo-commands/src/skills.ts` 的 `TEAM_SURFACE_SHAPES_NOTE`
  // **逐字相同**（跨包禁 import，等值由
  // `tests/omo-commands/team-surface-consistency.test.ts` 的交叉钉保证）。
  '(4) TEAM SURFACE HERE (not the opencode one): `team_create` takes ONLY `inline_spec`',
  '(`{ name, members: [{ name, category, prompt }] }` — spec level accepts ONLY `name`',
  'and `members`, so NO `description`/`lead`/`leadAgentId`; a member accepts ONLY',
  '`name`/`category`/`seat`/`prompt`, so NO `kind`/`subagent_type`); a member `category`',
  'is exactly `quick` or `deep`; messages are',
  '`team_send_message(teamRunId=<id>, to=<member|"lead"|"*">, body=<text>)` (`body` REQUIRED);',
  'the task board is `team_task_create/team_task_list/team_task_update/team_task_get`',
  '(NOT `task_create`/`task_list`/`task_update`/`task_get`); teardown is',
  '`team_delete(teamRunId=<id>)`; there is NO `team_list`, NO on-disk team config',
  '(`~/.omo/teams/**.json` is never read here), and `team_run_id` is spelled `teamRunId`.',
].join('\n')

/**
 * ultrawork 注记里的 team 段——**逐字等于** `omo-commands/src/skills.ts` 的
 * `TEAM_SURFACE_SHAPES_NOTE`（跨包禁 import；等值由交叉钉测试保证，R-5 双拼写
 * 先例）。
 */
export const ULTRAWORK_TEAM_CARRIER_NOTE = [
  'TEAM SURFACE HERE (not the opencode one): `team_create` takes ONLY `inline_spec`',
  '(`{ name, members: [{ name, category, prompt }] }` — spec level accepts ONLY `name`',
  'and `members`, so NO `description`/`lead`/`leadAgentId`; a member accepts ONLY',
  '`name`/`category`/`seat`/`prompt`, so NO `kind`/`subagent_type`); a member `category`',
  'is exactly `quick` or `deep`; messages are',
  '`team_send_message(teamRunId=<id>, to=<member|"lead"|"*">, body=<text>)` (`body` REQUIRED);',
  'the task board is `team_task_create/team_task_list/team_task_update/team_task_get`',
  '(NOT `task_create`/`task_list`/`task_update`/`task_get`); teardown is',
  '`team_delete(teamRunId=<id>)`; there is NO `team_list`, NO on-disk team config',
  '(`~/.omo/teams/**.json` is never read here), and `team_run_id` is spelled `teamRunId`.',
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
 * 组合模式正文 = 上游 constants.ts 的 banner 包装（逐字）**+** ultrawork 载体注记
 * **+** ultrawork 正文。
 *
 * 上游 `getHyperplanUltraworkMessage` 是 `BANNER + "\n\n" + getUltraworkMessage(...)`：
 * hyperplan 侧在独立词被抑制后，由 banner 里那句 `skill(name="hyperplan")`
 * 负责加载。本移植保持同一形状——banner 逐字保留（含"不要说独立 banner"的
 * 禁令与加载指令），正文只挂 ultrawork 一侧。
 *
 * ⚠️ **两侧注记一致性纪律（A-4）**：本函数交付的 ultrawork 段与
 * {@link buildUltraworkMessage} 交付的是**同一份 vendor 正文**，因此两处对它的
 * 载体声明必须同形——独立形态 {@link ULTRAWORK_CARRIER_NOTE} 前置在正文之前，
 * 组合形态也必须前置（位置：`banner` 之后、正文之前）。若只有独立形态挂注记，
 * 组合形态（用户敲 `hyperplan ulw`）就丢掉了三条载体差异声明（notepad 落点
 * `.omo/notepads/` vs `$TMPDIR`、`read` vs `cat` 回读、`mktemp -p` 形态），而组合
 * 模式恰是最看重跨轮续接的工作流：notepad 落进临时目录，下一轮根本看不见，
 * 正文"read the WHOLE notepad FIRST … then resume"这条唯一的续接规则随之失效。
 * 纪律推论（编辑时两条一起看）：
 *
 *   1. vendor 正文**逐字**两处共用 → 注记必须两处同挂，不允许"组合形态省略"
 *      之类的形状分叉；
 *   2. 注记**不带** `<ultrawork-mode>` 标签，所以前置它不改变"标签唯一"
 *      这一性质（vendor 正文自带该对标签，本移植两处都不再包第二对）。
 *
 * 单测纪律：形状变更由 `tests/omo-hooks/combo-carrier-note.test.ts` 承载
 * （注记存在、位置在 banner 与正文之间、正文仍自带唯一一对标签）。
 */
export function buildHyperplanUltraworkMessage(deps: KeywordMessageDeps): string {
  // 上游形状逐字照搬：`getHyperplanUltraworkMessage` = BANNER + "\n\n" +
  // getUltraworkMessage(...)。banner 逐字保留（含"不要说独立 banner"的禁令与
  // hyperplan 加载指令）；ultrawork 侧先挂载体注记再挂 vendor 正文——正文自带
  // `<ultrawork-mode>` 标签，所以这里不再补第二对。
  //
  // ⚠️ 载体注记与 buildUltraworkMessage 的那一份**同一个常量**：组合形态漏挂它
  // 会让 notepad 落进 $TMPDIR（下一轮不可见），见本函数上方注释的"两侧注记一致性
  // 纪律（A-4）"。不要因为这里"多了一段"就顺手删掉。
  const body = `${COMBO_BANNER_PREFIX}\n\n${ULTRAWORK_CARRIER_NOTE}\n\n${deps.texts.ultrawork}`
  return withRosterNote(body, deps.agentName)
}

/**
 * team 槽的**载体注记**（P5-T16 评审 MAJOR-4）——前置在 vendored 正文之前，
 * 体例同 {@link ULTRAWORK_CARRIER_NOTE}：**正文逐字不动，差异写在正文之外**。
 *
 * 为什么必须有它（评审的实证）：vendored `team.md` 的**最后一句**是
 * "If the team_* tools are absent, team_mode is disabled — tell the user to set
 * team_mode.enabled=true and restart opencode."。本部署**没有** `team_mode.enabled`
 * 这个配置键、没有对应配置文件、也没有"重启 opencode"这回事（本仓是 DSH；
 * `omo-team` 的 row Config 只有 `{ maxMembers?: number }`）。逐字把这句送进
 * 模型 = 把用户领向一个不存在的开关——**死指令**。
 *
 * 处置分两层（评审的两条建议都在这里落地）：
 *   1. **在场闸**（在 keyword-detector.ts 的判定面）：载体不在场 ⇒ **不注入**
 *      team 正文（降级为空串）——把 Phase 4 当初刻意不接线该槽的理由（"一个
 *      没有等价载体的关键词命中后只会产出死指令"）补回来；
 *   2. **载体注记**（本常量）：载体在场时正文照旧注入，但那句死链就地拆弹
 *      ——把"存在配置开关"改写成"活着的 team_* 工具面就是开关"。
 *
 * 另外两条已登记 deviation（N1 空头终态 / N9 工具名漂移）同样逐字进模型，
 * 按评审意见在注记里**就地拆弹**（vendor 正文保真不动，注记只声明差异）。
 */
export const TEAM_CARRIER_NOTE = [
  '[oh-my-opendsh] Carrier note (team mode): three carrier-level differences from this',
  'deployment, declared rather than rewritten — the protocol below is verbatim.',
  '(1) THE SWITCH IS THE TOOL SURFACE, NOT A FLAG. The last sentence of the body below',
  'points at `team_mode.enabled=true` and a host restart. This deployment has NEITHER:',
  'there is no `team_mode.enabled` setting, no config file for it, and no host to',
  'restart. The live `team_*` tool surface IS the switch — you received this body',
  'because those tools are present in this session. If they are absent, team mode is',
  'simply off and there is nothing to enable or restart.',
  '(2) `delegate_task` IS NOT A TOOL NAME HERE. The body names it only to forbid',
  'substituting ordinary delegation for team orchestration — that ban still holds,',
  'whichever name this deployment\'s delegation tools use.',
  '(3) `status:"failed"` IS NOT A TASK STATE HERE. This surface accepts exactly five',
  'task statuses: `pending`, `claimed`, `in_progress`, `completed`, `deleted`. A task',
  'that cannot succeed is settled `completed` with the failure reported to the lead in',
  'the message body.',
].join('\n')

/**
 * team 槽正文（P5-T12）= vendored `team.md` **逐字** + 一段**载体注记**（P5-T16）。
 *
 * 上游形状：`team/default.ts` 的 `TEAM_MESSAGE` 就是 `TEAM_MODE_PROMPT`
 * （`prompts-core/prompts/mode/team.md` 全文，仅 `stripFinalLineFeed`），
 * 没有 banner 包装、没有载体注记——与 ultrawork 侧同族（正文自带
 * `[team-mode]` 标记行，本移植不再包第二层）。名册尾注同样**不挂**：
 * team.md 不点名任何 reviewer 字面量（`momus`/`metis` 零出现），
 * {@link needsRosterNote} 的收窄对它没有作用对象；它点名的 `delegate_task`
 * 是**工具名漂移**（N9），登记在 vendor VENDOR-MANIFEST.json 的
 * deviations[]，由运行期工具面自证——注记改写正文的每一条冲动都交给
 * deviations 登记，不进正文。
 *
 * P5-T16（评审 MAJOR-4）的**一处形状变更**：正文**前置**一段载体注记
 * （{@link TEAM_CARRIER_NOTE}），把 vendored 正文尾部那句指向本部署**不存在**
 * 的配置开关与宿主重启的死链就地拆弹。**vendor 字节不动**（注记在正文之外，
 * 与 ultrawork 侧同体例）；判别面是「在场闸」——载体不在场时**根本不注入**
 * team 正文（keyword-detector.ts 的判定面），所以这段注记只会出现在
 * 「team 工具确实在场」的时刻。
 *
 * 正文的 `team.md` 无 YAML frontmatter（实测首行即 `[team-mode]`），
 * loader 的 stripFrontmatter 对它是 no-op；`.trim()` 剥尾部换行 = 上游
 * `stripFinalLineFeed` 同形。
 */
export function buildTeamMessage(deps: KeywordMessageDeps): string {
  return `${TEAM_CARRIER_NOTE}\n\n${deps.texts.team}`
}

/**
 * 实际接线的关键词表（P5-T12 起四条目）。`team` 于 P5-T12 接线（此前是
 * 枚举位预留，见 constants.ts 的 TEAM_PATTERN 注释）：type/pattern/消息
 * 工厂三者齐备，正文 = vendored team.md 逐字。注入的 source kind 走
 * `omo-team-keyword`（Q-8 A1），与其余三类共用的 `omo-keyword-detector`
 * 分面（组装在 ../keyword-detector.ts）。表放在本模块而非 constants.ts，
 * 是因为每个条目都要引用这里的 vendor 文案工厂，而 constants.ts 必须保持
 * 零 import。
 */
export const KEYWORD_DETECTORS: readonly KeywordDetectorSpec[] = [
  { type: 'ultrawork', pattern: ULTRAWORK_PATTERN, buildMessage: buildUltraworkMessage },
  { type: 'hyperplan', pattern: HYPERPLAN_PATTERN, buildMessage: buildHyperplanMessage },
  {
    type: 'hyperplan-ultrawork',
    pattern: HYPERPLAN_ULTRAWORK_PATTERN,
    buildMessage: buildHyperplanUltraworkMessage,
  },
  { type: 'team', pattern: TEAM_PATTERN, buildMessage: buildTeamMessage },
]

/** 表里的类型集合（listener 的过滤谓词按它判定「合法类型」）。 */
export const WIRED_KEYWORD_TYPES: readonly KeywordType[] = KEYWORD_DETECTORS.map((d) => d.type)

/** 仅供诊断：本次 load 读到的正文来源与体量。 */
export function describeInstructionTexts(texts: InstructionTexts): string {
  return `ultrawork=${texts.ultraworkPath} (${texts.ultrawork.length} chars) + `
    + `hyperplan=${texts.hyperplanPath} (${texts.hyperplan.length} chars) + `
    + `team=${texts.teamPath} (${texts.team.length} chars)`
}
