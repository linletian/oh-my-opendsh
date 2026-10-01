// P4-T12 — the keyword-detector listener (manifest H-33, Phase 3 S-06;
// coverage row docs/plans/phase4-dev/phase4-commands.md §1.2 H-33).
//
// SEED PROVENANCE. The 7 upstream test files at packages/omo-opencode/src/hooks/
// keyword-detector/ @ v4.19.4 (commit b072d279110bdda2c6ac2525d0d24dc54d16148a)
// are the seeds; this suite is a **语义移植（非逐字复制）** of their 89 cases,
// regrouped by the decision surface rather than copied case-for-case:
//
//   index.test.ts (47)                    → ①③ pattern anchors · ② shell/slash
//                                            · ④ default config · ⑤ idempotency
//   hyperplan.test.ts (14)                → ① #4215 lookbehind + banner anchors
//   hyperplan-ultrawork.test.ts (10)      → ① strict adjacency · ⑤ combo suppression
//   ultrawork-edge-trigger.test.ts (4)    → ⑤ message-level idempotency
//   ultrawork-source-routing.test.ts (1) → ③ isPlannerAgent / isNonOmoAgent
//   hook-ralph-loop.test.ts (11)          → SKIP (no ralph feature on DSH; its
//                                            defensive assertion is covered by ⑤'s
//                                            two independent gates — see
//                                            ../keyword-detector.ts S-9)
//   ultrawork-runtime-variant.test.ts (2) → SKIP (model-variant routing collapsed
//                                            to one roster-aware body — S-2)
//
// Dropped by narrowing, not by oversight: upstream's toast assertions (no DSH
// equivalent, S-8) and its default-mode assertions (not in this task's config
// surface, S-6).
//
// WHAT THIS SUITE IS FOR. The hook's whole job is a chain of DISCRIMINATIONS:
// which text counts as a human asking for a mode, and which keyword arms which
// one. Every one of those is a place where a plausible-looking simplification
// silently changes behaviour (strip the code fence and the user writing about
// `ulw` gets the 30 KB directive; drop a gate and the system arms the mode off
// its own reminder). So the suite is organised as: recognition → the six input
// gates → the config rules → the two idempotency guards → the injection surface.
//
// WHY THE EXPECTATIONS ARE HARD-CODED, in the same spirit as manifest.test.ts:
// a test that re-derives its expectation from the module under test agrees
// with ANY drift in it. The regex sources below are the upstream ones, and
// tests ① deliberately re-assert them as LITERALS so a "simplification"
// (dropping the `(?<![\w.])` lookbehind, say) is a red test rather than a
// silent behaviour change. See tests ① and ② for the verbatim anchors.
//
// THE VENDOR BODY IS NOT FAKE-FILLED. The injected text is the P4-T4 vendored
// `ultrawork/SKILL.md` / `hyperplan/SKILL.md` body, read from disk at apply
// time. These tests read the SAME real files (tests ⑦) and assert that the
// anchor sentences and the `momus`/`metis` reviewer literals really are in
// there — so "the injection carries the vendored instruction" is a checked
// fact, not a comment.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see index.ts's header).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// S-12：命令扩展消息由 omo-commands 的**真实渲染器**产出，不在本测试里手抄外框。
// 走的就是 handler 自己那两行（`createFrame()` → `formatCommandTemplate`），
// 所以测试与实机发到会话里的那条消息是同一条构造路径。
const renderPort = await import('../../patches/omo-dsh/omo-commands/src/templates/render.ts')
const ulwCommand = await import('../../patches/omo-dsh/omo-commands/src/commands/ulw-execute.ts')
// 模板常量本身在 templates/ 下；commands/ulw-execute.ts 只是 import 它（不 re-export），
// 所以取模板要从模板模块取，与 handler 内部引用的是同一个对象。
const ulwTemplate = await import('../../patches/omo-dsh/omo-commands/src/templates/ulw-execute.ts')
const hyperplanTemplate = await import('../../patches/omo-dsh/omo-commands/src/templates/hyperplan.ts')
const hyperplanCommand = await import('../../patches/omo-dsh/omo-commands/src/commands/hyperplan.ts')

/** 走 handler 自己那两行：`renderCommandTemplate` + `formatCommandTemplate`。 */
function buildFollowup(
  name: string,
  description: string,
  template: string,
  args: string,
): string {
  return renderPort.formatCommandTemplate({
    name,
    description,
    scope: 'builtin',
    arguments: args,
    template,
    content: renderPort.renderCommandTemplate(template, { arguments: args, sessionId: 'agent-proof' }),
  })
}
const renderUlwExecuteFollowup = (args: string): string => buildFollowup(
  'ulw-execute', ulwCommand.ULW_EXECUTE_DESCRIPTION, ulwTemplate.ULW_EXECUTE_COMMAND_TEMPLATE, args)
const renderHyperplanFollowup = (args: string): string => buildFollowup(
  'hyperplan', hyperplanCommand.HYPERPLAN_DESCRIPTION, hyperplanTemplate.HYPERPLAN_COMMAND_TEMPLATE, args)

// ⚠️ Test ① asserts these patterns' `.source` against UPSTREAM LITERALS, so the
// import must be the module's OWN constants — never a re-declared copy in this
// file (a local copy would assert nothing about the code under test).
import {
  CODE_BLOCK_PATTERN,
  COMBO_BANNER_LINE,
  COMBO_BANNER_PREFIX,
  HYPERPLAN_BANNER_LINE,
  HYPERPLAN_PATTERN,
  HYPERPLAN_ULTRAWORK_PATTERN,
  INLINE_CODE_PATTERN,
  OMO_ROSTER_AGENT_IDS,
  SLASH_COMMAND_LEAD_PATTERN,
  SUBAGENT_ALLOWED_TYPES,
  SYSTEM_DIRECTIVE_PREFIX,
  TEAM_PATTERN,
  ULTRAWORK_BANNER_LINE,
  ULTRAWORK_PATTERN,
  UNMAPPED_REVIEWER_LITERALS,
  type KeywordType,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/constants.ts'
import {
  KEYWORD_DETECTORS,
  ROSTER_TAIL_NOTE,
  WIRED_KEYWORD_TYPES,
  ULTRAWORK_CARRIER_NOTE,
  buildHyperplanMessage,
  buildHyperplanUltraworkMessage,
  buildUltraworkMessage,
  describeInstructionTexts,
  loadInstructionTexts,
  needsRosterNote,
  stripFrontmatter,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/messages.ts'
import {
  DEFAULT_KEYWORD_DETECTOR_CONFIG,
  detectKeywordsWithMessages,
  effectiveDisabledTypes,
  filterAlreadyInjectedKeywords,
  looksLikeSlashCommand,
  removeCodeBlocks,
  resolveConfig,
  suppressComboStandalones,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/detector.ts'
import {
  hasForeignOmoSelfName,
  isBackgroundSession,
  isForeignAgentSession,
  isNonOmoAgent,
  isPlannerAgent,
  isSubagentSession,
  isSyntheticOrInternalPayload,
  isUserAuthoredMessage,
  readCurrentUserTextDetail,
  isSystemDirective,
  readCurrentUserText,
  readSessionDescriptor,
  removeSystemReminders,
  resolveRosterSeat,
  type SessionDescriptor,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/filters.ts'
import {
  KEYWORD_DETECTOR_ID,
  KEYWORD_DETECTOR_PLUGIN,
  buildInjectionMessage,
  createKeywordDetectorListener,
  decideKeywordInjection,
  formatKeywordDetectorDegradedLine,
  formatKeywordDetectorLine,
  readConfigOverride,
  type InjectedUserMessage,
  type KeywordStepFacts,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector.ts'
import { HOOK_MANIFEST } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import { ROSTER } from '../../patches/omo-dsh/omo-agents/src/roster.ts'
import { NOTEPAD_DIR_SEGMENTS } from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/constants.ts'

// ── the vendored bodies (the real files, not fixtures) ──────────────────────

const ULTRAWORK_VENDOR_PATH = new URL(
  '../../patches/omo-dsh/vendor/shared-skills/skills/ultrawork/SKILL.md',
  import.meta.url,
)
const HYPERPLAN_VENDOR_PATH = new URL(
  '../../patches/omo-dsh/vendor/shared-skills/skills/hyperplan/SKILL.md',
  import.meta.url,
)
const ultraworkVendor = readFileSync(ULTRAWORK_VENDOR_PATH, 'utf8')
/**
 * The messages module's own source, read to assert the falsifier clause in its
 * doc comment. Reading a source file from a test is unusual, but it is the only
 * hermetic way to check a comment — shelling out to `man` would make this suite
 * depend on a host toolchain, and the suite is otherwise pure.
 */
const MESSAGES_SOURCE = readFileSync(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/messages.ts', import.meta.url),
  'utf8',
)
const hyperplanVendor = readFileSync(HYPERPLAN_VENDOR_PATH, 'utf8')

/** The real loader result — the bodies these tests inject are the vendor ones. */
const loaded = loadInstructionTexts()
if (!loaded.ok) throw new Error(`vendored instruction texts unavailable: ${JSON.stringify(loaded.failures)}`)
const TEXTS = loaded.texts

// ── fixtures ────────────────────────────────────────────────────────────────

/** A user-authored DSH message (the `source.kind === 'user'` shape). */
function userMessage(text: string): unknown {
  return { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] }
}

/** A pre-step payload carrying ONE user message. */
function payloadWith(text: string): unknown {
  return { messages: [userMessage(text)] }
}

const NO_DESCRIPTOR: SessionDescriptor = { found: false, mode: undefined, persona: undefined, label: undefined }

/** A delegated child session descriptor (persona = the seat's real self-name). */
function childDescriptor(seat: string | undefined, mode: 'continuable' | 'one-shot' = 'one-shot'): SessionDescriptor {
  return {
    found: true,
    mode,
    persona: seat === undefined ? undefined : `You are **omo-${seat}**, a teammate.`,
    label: `${seat ?? 'child'}-1`,
  }
}

/** The facts for a main-session turn whose user text is `text`. */
function mainFacts(text: string, overrides: Partial<KeywordStepFacts> = {}): KeywordStepFacts {
  return {
    hasInject: true,
    texts: TEXTS,
    promptText: text,
    descriptor: NO_DESCRIPTOR,
    alreadyInjected: false,
    config: resolveConfig(),
    ...overrides,
  }
}

/**
 * Runs the pure decision. The second argument is a **partial override of the
 * facts** (the production function takes one argument — see the single-source
 * note on {@link decideKeywordInjection}), so a case can vary just the config or
 * just the descriptor without rebuilding the whole facts object.
 */
function decide(facts: KeywordStepFacts, override: Partial<KeywordStepFacts> = {}) {
  return decideKeywordInjection({ ...facts, ...override })
}

// ═══════════ ① 逐字锚点：模式与 banner ═══════════════════════════════════════

describe('P4-T12 ① the patterns and banner lines are the upstream literals', () => {
  // These are asserted as literal sources, not as behaviour, so that a
  // well-meaning edit to a regex is a RED test. Upstream citations:
  // constants.ts:1-2/14-15/36, detector.ts:18, hyperplan/default.ts:20,
  // team/default.ts:10, shared/system-directive.ts:5/11.
  it('every shell/keyword pattern has the upstream source verbatim', () => {
    expect(CODE_BLOCK_PATTERN.source).toBe('```[\\s\\S]*?```')
    expect(CODE_BLOCK_PATTERN.flags).toBe('g')
    expect(INLINE_CODE_PATTERN.source).toBe('`[^`]+`')
    expect(INLINE_CODE_PATTERN.flags).toBe('g')
    expect(SLASH_COMMAND_LEAD_PATTERN.source).toBe('^\\s*\\/[a-zA-Z][\\w-]*(?:\\s|$)')
    expect(ULTRAWORK_PATTERN.source).toBe('\\b(ultrawork|ulw)\\b')
    expect(ULTRAWORK_PATTERN.flags).toBe('i')
    expect(HYPERPLAN_PATTERN.source).toBe('\\bhyperplan\\b|(?<![\\w.])hpp\\b')
    expect(HYPERPLAN_PATTERN.flags).toBe('i')
    expect(HYPERPLAN_ULTRAWORK_PATTERN.source)
      .toBe('\\b(?:hpp|hyperplan)\\s+(?:ulw|ultrawork)\\b|\\b(?:ulw|ultrawork)\\s+(?:hpp|hyperplan)\\b')
    expect(TEAM_PATTERN.source).toBe('\\bteam[\\s_-]?mode\\b')
    expect(SYSTEM_DIRECTIVE_PREFIX).toBe('[SYSTEM DIRECTIVE: OH-MY-OPENCODE')
  })

  it('the #4215 lookbehind survives: `.hpp` is NOT hyperplan, `hpp` IS', () => {
    // Upstream issue #4215 verbatim: `\b` alone would match the `.hpp` file
    // extension because a dot is a non-word character.
    const text = (body: string) => removeCodeBlocks(body)
    expect(HYPERPLAN_PATTERN.test(text('src/buffer.hpp'))).toBe(false)
    expect(HYPERPLAN_PATTERN.test(text('include/vector.hpp'))).toBe(false)
    expect(HYPERPLAN_PATTERN.test(text('run hpp please'))).toBe(true)
    expect(HYPERPLAN_PATTERN.test(text('switch to hyperplan'))).toBe(true)
    // The lookbehind is a NEGATIVE one on `[\w.]`, so a dotted bare token is
    // excluded but a following dot is fine.
    expect(HYPERPLAN_PATTERN.test(text('hpp.'))).toBe(true)
  })

  it('the combo is STRICT ADJACENCY, in both word orders', () => {
    // Upstream: "hyperplan ulw" / "hpp ultrawork" / "ulw hpp" / "ultrawork
    // hyperplan" — and nothing with anything in between.
    for (const text of ['hyperplan ulw', 'hpp ultrawork', 'ulw hpp', 'ultrawork hyperplan', 'HYPERPLAN ULW']) {
      expect(HYPERPLAN_ULTRAWORK_PATTERN.test(text), text).toBe(true)
    }
    for (const text of [
      'hyperplan, then ulw',
      'hyperplan and also ulw',
      'hyperplan please run ulw',
      'hyperplanulw',
      'hyperplan.ulw',
      'hpp,ulw',
    ]) {
      expect(HYPERPLAN_ULTRAWORK_PATTERN.test(text), text).toBe(false)
    }
    // One upstream quirk worth pinning, because it looks like a bug and is not:
    // the lookbehind only guards the base keyword, so a dotted `.hpp` FOLLOWED by
    // the adjacent combo partner DOES match (`.hpp ulw` — the base `hpp` here is
    // preceded by a dot, which the combo pattern does not look behind for).
    // Recorded rather than "fixed": the combo pattern is verbatim upstream, and
    // a user typing `x.hpp ulw` is asking for the combo anyway.
    expect(HYPERPLAN_ULTRAWORK_PATTERN.test('x.hpp ulw')).toBe(true)
  })

  it('the three banner lines are the exact user-visible strings', () => {
    // The first-line banners are the most silently-breakable product of this
    // hook: they are what the model must SAY, and the vendored bodies name
    // them literally. Pinned here and re-checked against the vendor text in ⑦.
    expect(ULTRAWORK_BANNER_LINE).toBe('ULTRAWORK MODE ENABLED!')
    expect(HYPERPLAN_BANNER_LINE).toBe('HYPERPLAN MODE ENABLED!')
    expect(COMBO_BANNER_LINE).toBe('HYPERPLAN ULTRAWORK MODE ENABLED!')
    // The combo wrapper is upstream constants.ts:22-26 VERBATIM, including its
    // "do NOT say the standalone banners" clause (the text-side half of the
    // combo suppression) and the hyperplan load instruction.
    expect(COMBO_BANNER_PREFIX).toBe(
      '<hyperplan-ultrawork-mode>\n'
      + '**MANDATORY**: Say "HYPERPLAN ULTRAWORK MODE ENABLED!" exactly once as your first '
      + 'response. Do NOT say the standalone "ULTRAWORK MODE ENABLED!" or '
      + '"HYPERPLAN MODE ENABLED!" banners.\n'
      + '\n'
      + 'Apply the ultrawork protocol below as your execution framework. You MUST ALSO load '
      + 'the hyperplan skill immediately via `skill(name="hyperplan")` and follow its full '
      + 'adversarial workflow — do NOT improvise, do NOT skip rounds, do NOT write the plan '
      + 'yourself.\n'
      + '</hyperplan-ultrawork-mode>',
    )
  })

  it('the wired table is exactly the three non-team types, and team is reserved', () => {
    // S-3: `team` keeps its type + pattern (Phase 5 slots in here) but has NO
    // message factory, so it can never arm. A fourth entry appearing here means
    // someone wired a keyword without a carrier.
    expect(WIRED_KEYWORD_TYPES).toEqual(['ultrawork', 'hyperplan', 'hyperplan-ultrawork'])
    expect(KEYWORD_DETECTORS.map((detector) => detector.type)).toEqual([...WIRED_KEYWORD_TYPES])
    // The enum slot is still there on the type side, and the pattern still
    // matches — only the wiring is absent.
    const teamAsKeyword: KeywordType = 'team'
    expect(TEAM_PATTERN.test('team mode')).toBe(true)
    expect(WIRED_KEYWORD_TYPES).not.toContain(teamAsKeyword)
    // Non-main sessions keep exactly ultrawork + combo (upstream hook.ts:150-152).
    expect([...SUBAGENT_ALLOWED_TYPES]).toEqual(['ultrawork', 'hyperplan-ultrawork'])
  })
})

// ═══════════ ② 剥壳与 slash 闸 ═══════════════════════════════════════════════

describe('P4-T12 ② the code shell is removed before matching', () => {
  it('a keyword inside a fence or inline code does not arm the mode', () => {
    // Upstream detector.ts:14-16. The realistic case: a user pasting a snippet
    // that MENTIONS ulw must not get the 30 KB ultrawork directive.
    for (const text of [
      'my config has `ulw` in it',
      '```js\n// run ulw here\nultrawork("x")\n```',
      'before ```\nhyperplan\n``` after',
      'and `hyperplan ulw` in this snippet',
    ]) {
      expect(removeCodeBlocks(text), text).not.toMatch(/\b(ultrawork|ulw|hyperplan)\b/i)
    }
    // …and the boundary of the narrowing: upstream strips fences and INLINE code
    // only. A keyword in bare quoted prose is still a keyword — the gate is about
    // code, not about quotation marks.
    expect(removeCodeBlocks('the word "ultrawork" appears in this log line'))
      .toMatch(/\bultrawork\b/i)
    // …and the same keyword OUTSIDE a shell still arms it, so the strip is not
    // simply eating the whole message.
    expect(removeCodeBlocks('```\nnoise\n```\nnow run ulw')).toMatch(/\bulw\b/i)
    expect(removeCodeBlocks('use `x` then ulw')).toMatch(/\bulw\b/i)
  })

  it('a leading slash command is a command, not free text', () => {
    // Upstream detector.ts:18-22 — gate ③.
    for (const text of ['/ulw-execute do the thing', '  /hyperplan now', '/go', '/a-b_c rest']) {
      expect(looksLikeSlashCommand(text), text).toBe(true)
    }
    for (const text of ['run /ulw-execute for me', 'ulw /go', 'no leading slash', '/', '5 / 2 ulw']) {
      expect(looksLikeSlashCommand(text), text).toBe(false)
    }
  })
})

// ═══════════ ③ 六级输入过滤 ═════════════════════════════════════════════════

describe('P4-T12 ③ the six input gates, one DSH mapping each', () => {
  it('① synthetic/internal: only a real user turn is judged at all', () => {
    // Gate ①. DSH shape: the last user-authored message with text. A plugin
    // injection (source.kind !== 'user'), a synthetic flag, a non-user role,
    // and an empty text all yield undefined.
    expect(readCurrentUserText(payloadWith('ulw go'))).toBe('ulw go')
    expect(readCurrentUserText({ messages: [] })).toBeUndefined()
    expect(readCurrentUserText({})).toBeUndefined()
    expect(readCurrentUserText('not a payload')).toBeUndefined()
    expect(readCurrentUserText({ messages: [{ role: 'user', content: [{ type: 'text', text: 'ulw' }] }] }))
      .toBeUndefined() // no `source` = hand-built/foreign payload, not a user turn
    expect(readCurrentUserText({
      messages: [{ role: 'user', source: { kind: 'user' }, synthetic: true, content: [{ type: 'text', text: 'ulw' }] }],
    })).toBeUndefined()
    expect(readCurrentUserText({
      messages: [{ role: 'assistant', source: { kind: 'user' }, content: [{ type: 'text', text: 'ulw' }] }],
    })).toBeUndefined()
    // The turn's LAST user message wins (the main session's history may already
    // contain an earlier "ulw"; re-arming on it every turn would be wrong).
    const history = { messages: [userMessage('ulw earlier'), userMessage('now something else')] }
    expect(readCurrentUserText(history)).toBe('now something else')
    // The named gate predicate (upstream's `isSyntheticOrInternalOnlyTextParts`)
    // agrees with the reader, and the decision short-circuits on it with its own
    // reason rather than falling through to 'no-keyword'.
    expect(isSyntheticOrInternalPayload(payloadWith('ulw go'))).toBe(false)
    expect(isSyntheticOrInternalPayload({ messages: [] })).toBe(true)
    expect(isSyntheticOrInternalPayload({})).toBe(true)
    expect(decide({ ...mainFacts('ulw go'), promptText: undefined })).toEqual({
      kind: 'skip',
      reason: 'synthetic-internal',
    })
  })

  it('② system directive: OMO’s own messages cannot trigger a mode', () => {
    // Gate ②, upstream shared/system-directive.ts verbatim — INCLUDING the
    // leading-keyword allowance, which exists so a text like
    // "ulw [SYSTEM DIRECTIVE: OH-MY-OPENCODE - TODO CONTINUATION]" is skipped.
    expect(isSystemDirective('[SYSTEM DIRECTIVE: OH-MY-OPENCODE - TODO CONTINUATION] do ulw')).toBe(true)
    expect(isSystemDirective('ulw [SYSTEM DIRECTIVE: OH-MY-OPENCODE - TODO CONTINUATION]')).toBe(true)
    expect(isSystemDirective('  [SYSTEM DIRECTIVE: OH-MY-OPENCODE - RALPH LOOP] ulw')).toBe(true)
    expect(isSystemDirective('please run ulw')).toBe(false)
    expect(isSystemDirective('mentioning [SYSTEM DIRECTIVE: OH-MY-OPENCODE] in prose')).toBe(false)
    // `<system-reminder>` content is removed, not rejected (upstream
    // removeSystemReminders: the message still gets judged on its own text).
    expect(removeSystemReminders('<system-reminder>ulw</system-reminder> do the thing'))
      .toBe('do the thing')
    expect(removeSystemReminders('ulw <system-reminder>noise</system-reminder> please'))
      .toBe('ulw  please')
    // A keyword carried ONLY by the reminder is not the user's ask: the
    // reminder block is removed and the remaining text is judged on its own.
    expect(decide(mainFacts('<system-reminder>ulw</system-reminder> build the thing')))
      .toEqual({ kind: 'skip', reason: 'no-keyword' })
    // A keyword in the user's own words, alongside a reminder, still arms.
    expect(decide(mainFacts('<system-reminder>some context</system-reminder> now run ulw')).kind)
      .toBe('inject')
  })

  // ── S-12：命令扩展消息不是用户散文 ────────────────────────────────────────
  //
  // L4 真模型冒烟实证的移植分歧。`/ulw-execute alpha` 准入后，omo-commands 把命令
  // 模板作为一条 source.kind==='user' 的 followup 消息投进会话，keyword-detector
  // 把它当成本轮用户散文 → 模板里的 `ulw` 命中 → turn 2 就喊
  // ULTRAWORK MODE ENABLED!。上游的检测面是原始输入行（slash 前导已剥离），因此
  // 永不自触发。
  //
  // ①/② 用 **omo-commands 的真实渲染器**产出命令扩展消息，而不是在这里手抄一段
  // 假的外框：锚 `<command-instruction>` 是那条渲染路径产出的，手抄一份就等于把
  // 「锚变了」这件事从本测试的视野里拿掉——而那正是 S-12 最需要被看见的失效。
  describe('S-12 command-expansion messages are not user prose', () => {
    it('① a /ulw-execute followup template carrying `ulw` produces no detection at all', () => {
      const template = renderUlwExecuteFollowup('alpha')
      // 前置事实：这条消息**确实是** user 源、role 也是 'user'，两条既有过滤都
      // 放它过——这正是它曾经能自触发的原因。
      const message = { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: template }] }
      expect(isUserAuthoredMessage(message)).toBe(true)
      // 正文形态核对：真实模板里确实带着触发词与包裹标记。
      expect(template).toContain('<command-instruction>')
      expect(template).toMatch(/\bulw\b/)
      // MINOR-9 **正向前提**：同一条消息若无 S-12，判定确实会注入。这一条才是本次
      // 修复针对的那个回归的承担者——只断言「现在不注入」的话，一个恒不注入的实现
      // 也能通过（恒 false 的守卫与恒 true 的守卫在结果上不可区分）。
      const withoutS12 = decide(mainFacts(template, { texts: { ...TEXTS, ultrawork: template } }))
      expect(withoutS12.kind).toBe('inject')
      // 判据：读不出可判别的用户散文 → ① 号闸关 → 零注入。
      expect(readCurrentUserText({ messages: [message] })).toBeUndefined()
      expect(isSyntheticOrInternalPayload({ messages: [message] })).toBe(true)
      // MINOR-7：S-12 有自己的具名 reason，不再并进 synthetic-internal。
      expect(readCurrentUserTextDetail({ messages: [message] }))
        .toEqual({ text: undefined, commandExpansionSkipped: true })
      // promptText 必须真是 undefined 才会走到那两闸；给空串会落到 no-keyword。
      expect(decide(mainFacts('unused', { promptText: undefined, commandExpansionSkipped: true })))
        .toEqual({ kind: 'skip', reason: 'command-expansion' })
    })

    it('② a /hyperplan followup template carrying `hyperplan` produces no match either', () => {
      const template = renderHyperplanFollowup('把用户登录改造成支持单点登录')
      expect(template).toContain('<command-instruction>')
      expect(template).toContain('hyperplan')
      const message = { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: template }] }
      // MINOR-9：hyperplan 侧的正向前提。
      expect(decide(mainFacts(template, { texts: { ...TEXTS, hyperplan: template } })).kind).toBe('inject')
      expect(readCurrentUserText({ messages: [message] })).toBeUndefined()
    })

    it('③ user prose containing ulw still arms — the filter is not a blanket relaxation', () => {
      expect(decide(mainFacts('please run ulw for the migration')).kind).toBe('inject')
      expect(readCurrentUserText(payloadWith('just ulw please'))).toBe('just ulw please')
    })

    it('④ user prose containing the marker is skipped — the anchor\'s false-positive face, pinned', () => {
      // 锚的**误判面**：用户在自己的散文里提到/粘贴了 `<command-instruction>`。
      // S-12 的判据是「文本含该标记」，不看它是不是正文——所以这一条会**被跳过**。
      //
      // MINOR-8 更正：第一版把这行标题写成「围栏代码块内仍应命中」，而夹具里根本没有
      // 围栏、断言也是 `toBeUndefined`——标题与断言相反。标题现在只说夹具真正做的事。
      //
      // 有意如此，理由：为了一个只在用户刻意粘贴命令模板原文时才出现的场景，去做
      // 「标记是否在代码块内 / 是否在首行 / 是否成对」的解析，会引入一个**更糟**
      // 的东西——一个可被构造绕过的启发式（把标记拆开就能重新触发）。而上游对齐
      // 的方向是「派生产物不参与检测」，不是「精确识别派生产物」。这条断言把
      // 误判面**钉成已知行为**而不是让它潜伏：将来若要改判据，这条会先红。
      const prose = 'please run ulw — here is the template that fires it:\n<command-instruction>\nrun ulw\n</command-instruction>'
      expect(readCurrentUserText(payloadWith(prose))).toBeUndefined()
    })

    it('⑤ a command-expansion message does not mask an EARLIER real user message', () => {
      // `continue` 而非整体放弃：判据是「这条不是散文」，不是「本轮不可判」。
      const earlier = { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'run ulw now' }] }
      const expansion = { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '<command-instruction># /ulw-execute Command\nbody\n</command-instruction>' }] }
      expect(readCurrentUserText({ messages: [earlier, expansion] })).toBe('run ulw now')
    })
  })

  it('③ slash lead, ④ foreign agent, ⑤ planner, ⑥ background/非主', () => {
    // ③ — reached through the decision, not the raw predicate (② has its own).
    expect(decide(mainFacts('/ulw-execute now'))).toEqual({ kind: 'skip', reason: 'slash-command' })

    // ④ — a persona self-naming an agent OUTSIDE the Phase 2 roster is a
    // foreign agent; the upstream builder/plan literals are kept for parity.
    expect(hasForeignOmoSelfName('You are **omo-experiment**, an experiment.')).toBe(true)
    expect(hasForeignOmoSelfName('You are **omo-atlas**, the orchestrator.')).toBe(false)
    expect(isForeignAgentSession('You are **omo-experiment**')).toBe(true)
    expect(isForeignAgentSession(undefined)).toBe(false)
    expect(isNonOmoAgent('builder')).toBe(true)
    expect(isNonOmoAgent('plan')).toBe(true)
    expect(isNonOmoAgent('sisyphus')).toBe(false)
    expect(decide(mainFacts('ulw go', { descriptor: childDescriptor('experiment') })))
      .toEqual({ kind: 'skip', reason: 'foreign-agent' })

    // ⑤ — the upstream predicate covers all three DSH planning seats as-is
    // (S-5): prometheus by name; plan-consultant / plan-reviewer by `\bplan\b`
    // after [_-] → space normalization.
    for (const seat of ['prometheus', 'plan-consultant', 'plan-reviewer']) {
      expect(isPlannerAgent(seat), seat).toBe(true)
      expect(decide(mainFacts('ulw go', { descriptor: childDescriptor(seat) })), seat)
        .toEqual({ kind: 'skip', reason: 'planner-agent' })
    }
    expect(isPlannerAgent('sisyphus')).toBe(false)
    expect(isPlannerAgent('atlas')).toBe(false)

    // ⑥a — a background (continuable) delegation gets NO keyword mode, even
    // though its text is a real user-authored one.
    expect(isBackgroundSession(childDescriptor('explore', 'continuable'))).toBe(true)
    expect(isBackgroundSession(childDescriptor('explore', 'one-shot'))).toBe(false)
    expect(decide(mainFacts('ulw go', { descriptor: childDescriptor('explore', 'continuable') })))
      .toEqual({ kind: 'skip', reason: 'background-session' })

    // ⑥b — a foreground delegation keeps ultrawork + combo but NOT standalone
    // hyperplan (upstream hook.ts:150-152).
    expect(isSubagentSession(childDescriptor('explore'))).toBe(true)
    expect(isSubagentSession(NO_DESCRIPTOR)).toBe(false)
    const hyperplanOnly = decide(mainFacts('hyperplan this', { descriptor: childDescriptor('explore') }))
    expect(hyperplanOnly).toEqual({ kind: 'skip', reason: 'subagent-keyword-filtered' })
    const ultrawork = decide(mainFacts('ulw go', { descriptor: childDescriptor('explore') }))
    expect(ultrawork.kind).toBe('inject')
    expect(ultrawork.kind === 'inject' && ultrawork.types).toEqual(['ultrawork'])
    const combo = decide(mainFacts('hyperplan ulw go', { descriptor: childDescriptor('explore') }))
    expect(combo.kind === 'inject' && combo.types).toEqual(['hyperplan-ultrawork'])
  })

  it('the descriptor reader reads mode AND persona from the session log', () => {
    // The DSH-native "who am I" surface (S-4): the child's own durable
    // `subagent/descriptor` event. A one-shot descriptor has no persona (the
    // measured H-26/H-32 boundary), so the SEAT is unknown there — which is
    // exactly why gate ④ is written against the self-name rather than the id.
    const session = {
      ownEvents: () => [
        { type: 'other/event' },
        {
          type: 'subagent/descriptor',
          data: { version: 3, mode: 'continuable', provider: 'dsh-subagent', label: 'explore-1', persona: 'You are **omo-explore**.' },
        },
        { type: 'subagent/descriptor', data: { mode: 'one-shot' } },
      ],
    }
    expect(readSessionDescriptor(session)).toEqual({
      found: true,
      mode: 'continuable',
      persona: 'You are **omo-explore**.',
      label: 'explore-1',
    })
    // The function stays a PURE reader (no cache inside it) — the cache lives in
    // the listener closure, so two direct calls re-read. If this ever changes,
    // the pure-function seam the rest of the suite relies on is gone.
    let calls = 0
    const counting = { ownEvents: () => { calls += 1; return [] } }
    expect(readSessionDescriptor(counting).found).toBe(false)
    expect(readSessionDescriptor(counting).found).toBe(false)
    expect(calls).toBe(2)
    // The FIRST descriptor is authoritative (establishing provider writes it
    // once) — the second event above must not win.
    expect(readSessionDescriptor({ ownEvents: () => [{ type: 'subagent/descriptor', data: { mode: 'one-shot' } }] }))
      .toEqual({ found: true, mode: 'one-shot', persona: undefined, label: undefined })
    // Degenerate inputs are inert, never throwing (this runs on EVERY pre-step).
    expect(readSessionDescriptor(undefined).found).toBe(false)
    expect(readSessionDescriptor({}).found).toBe(false)
    expect(readSessionDescriptor({ ownEvents: () => { throw new Error('boom') } }).found).toBe(false)
    expect(readSessionDescriptor({ snapshotEvents: () => [] }).found).toBe(false)
  })

  it('the seat resolver is roster-exact — no prefix or generic-name false hits', () => {
    // `sisyphus-junior` must not be read as `sisyphus` (the trailing
    // `(?![a-z0-9-])` boundary), and `omo-agent` (explore's generic
    // self-reference) must not be read as a seat.
    expect(resolveRosterSeat('You are **omo-sisyphus-junior**.')).toBe('sisyphus-junior')
    expect(resolveRosterSeat('You are **omo-sisyphus**.')).toBe('sisyphus')
    expect(resolveRosterSeat('You are **omo-multimodal-looker**.')).toBe('multimodal-looker')
    expect(resolveRosterSeat('You are **omo-agent** of omo-opencode.')).toBeUndefined()
    expect(resolveRosterSeat('')).toBeUndefined()
    expect(resolveRosterSeat(undefined)).toBeUndefined()
    // Every roster seat resolves from its own real persona self-name.
    for (const id of OMO_ROSTER_AGENT_IDS) {
      expect(resolveRosterSeat(`You are **omo-${id}**.`), id).toBe(id)
    }
  })

  it('the roster snapshot in constants.ts has not drifted from the real roster', () => {
    // The snapshot is deliberate (no cross-plugin import — index.ts discipline),
    // so its drift guard is THIS assertion, against the live roster table.
    const realIds = ROSTER.map((row) => row.id).sort()
    expect([...OMO_ROSTER_AGENT_IDS].sort()).toEqual(realIds)
    expect(OMO_ROSTER_AGENT_IDS.length).toBe(11)
  })
})

// ═══════════ ④ 配置面（禁用 / allowlist / 交集禁用） ════════════════════════

describe('P4-T12 ④ the config rules, including the intersection rule', () => {
  it('the default is upstream’s: nothing disabled, no allowlist', () => {
    // Upstream detector.ts:52/58 — both fields optional, no defaults, so an
    // absent config means EVERY keyword is armed.
    expect(DEFAULT_KEYWORD_DETECTOR_CONFIG).toEqual({
      disabledKeywords: undefined,
      enabledExpansions: undefined,
    })
    expect(effectiveDisabledTypes(resolveConfig())).toEqual(new Set())
    const decision = decide(mainFacts('ulw go'))
    expect(decision.kind === 'inject' && decision.types).toEqual(['ultrawork'])
  })

  it('disabled_keywords removes a keyword from the table', () => {
    const config = resolveConfig({ disabledKeywords: ['ultrawork'] })
    expect(decide(mainFacts('ulw go'), { config }))
      .toEqual({ kind: 'skip', reason: 'no-keyword' })
    // …and only that one.
    expect(decide(mainFacts('hyperplan go'), { config }).kind).toBe('inject')
  })

  it('THE INTERSECTION RULE: disabling either base also disables the combo', () => {
    // Upstream detector.ts:53-56 verbatim. The combo needs BOTH bases; a user
    // who disabled hyperplan must not still get hyperplan by saying
    // "hyperplan ulw".
    // Disabling one base kills the combo but leaves the OTHER base armed — that
    // is upstream's shape too (each detector is filtered independently, and
    // `suppressComboStandalones` only runs when a combo actually survived).
    const intersectionCases: readonly (readonly [readonly KeywordType[], KeywordType])[] = [
      [['hyperplan'], 'ultrawork'],
      [['ultrawork'], 'hyperplan'],
    ]
    for (const [disabled, survivor] of intersectionCases) {
      const config = resolveConfig({ disabledKeywords: disabled })
      expect(effectiveDisabledTypes(config).has('hyperplan-ultrawork'), String(disabled)).toBe(true)
      const decision = decide(mainFacts('hyperplan ulw go'), { config })
      expect(decision.kind === 'inject' && decision.types, String(disabled)).toEqual([survivor])
    }
    // Disabling BOTH bases leaves nothing at all — the combo can only be reached
    // through the two of them.
    const both = resolveConfig({ disabledKeywords: ['hyperplan', 'ultrawork'] })
    expect(effectiveDisabledTypes(both).has('hyperplan-ultrawork')).toBe(true)
    expect(decide(mainFacts('hyperplan ulw go'), { config: both }))
      .toEqual({ kind: 'skip', reason: 'no-keyword' })
    // Disabling something UNRELATED leaves the combo armed.
    const unrelated = resolveConfig({ disabledKeywords: ['team'] })
    expect(effectiveDisabledTypes(unrelated).has('hyperplan-ultrawork')).toBe(false)
    expect(decide(mainFacts('hyperplan ulw go'), { config: unrelated }).kind).toBe('inject')
  })

  it('the ctx config reader goes through ctx.get, and is inert on a throwing ctx', () => {
    // ⚠️ The e2e found what this test now pins: `ctx.config` on a cordis ctx
    // with no injected `config` service **throws** `cannot get property "config"
    // without inject` (the ctx is a Proxy). The reader must go through
    // `ctx.get('config')`, and it must be the only thing it touches.
    const proxyCtx = new Proxy({}, {
      get(target, property) {
        if (property === 'get') {
          return (name: string) => (name === 'config' ? undefined : undefined)
        }
        throw new Error(`cannot get property "${String(property)}" without inject`)
      },
    })
    expect(readConfigOverride(proxyCtx as never)).toBeUndefined()

    // A ctx whose `get` itself throws must also degrade, not propagate — a
    // config read must never be able to fail hook registration.
    expect(readConfigOverride({ get: () => { throw new Error('service container exploded') } } as never))
      .toBeUndefined()
    expect(readConfigOverride({ get: 'not a function' } as never)).toBeUndefined()
    expect(readConfigOverride(undefined as never)).toBeUndefined()
    // …and `ctx.config` is NEVER read, even when the object happens to carry one:
    // reading it is the exact bug, so a fixture with the property must not change
    // the answer (the service channel is `get`, not the property).
    expect(readConfigOverride({ config: { keywordDetector: { disabledKeywords: ['team'] } }, get: () => undefined } as never))
      .toBeUndefined()

    // S-10: omo-hooks mounts no cordis Config, so the read is optional. What
    // matters is that a MISSING or malformed surface degrades to the default
    // rather than throwing — a bad config must not fail every pre-step.
    const withConfig = (value: unknown) => ({ get: (name: string) => (name === 'config' ? value : undefined) })
    expect(readConfigOverride(withConfig(undefined) as never)).toBeUndefined()
    expect(readConfigOverride(withConfig({}) as never)).toBeUndefined()
    expect(readConfigOverride(withConfig({ keywordDetector: 'nope' }) as never)).toBeUndefined()
    expect(readConfigOverride(withConfig({ keywordDetector: {} }) as never)).toEqual({})
    // camelCase (this package's convention) …
    expect(readConfigOverride(withConfig({
      keywordDetector: { disabledKeywords: ['team'], enabledExpansions: ['ultrawork'] },
    }) as never)).toEqual({ disabledKeywords: ['team'], enabledExpansions: ['ultrawork'] })
    // … and upstream's snake_case spellings, so a config carried over from an
    // opencode `oh-my-opencode.jsonc` is not silently ignored.
    expect(readConfigOverride(withConfig({
      keywordDetector: { disabled_keywords: ['hyperplan'], enabled_expansions: ['ultrawork'] },
    }) as never)).toEqual({ disabledKeywords: ['hyperplan'], enabledExpansions: ['ultrawork'] })
    // A field of the wrong TYPE is treated as absent (zod upstream would throw;
    // S-10 records why we chose the silent fallback).
    expect(readConfigOverride(withConfig({
      keywordDetector: { disabledKeywords: 'ultrawork' },
    }) as never)).toEqual({})
  })

  it('enabled_expansions is an allowlist, and the two lists compose', () => {
    const only = resolveConfig({ enabledExpansions: ['hyperplan'] })
    expect(decide(mainFacts('hyperplan go'), { config: only }).kind).toBe('inject')
    expect(decide(mainFacts('ulw go'), { config: only }))
      .toEqual({ kind: 'skip', reason: 'no-keyword' })
    // Both at once: the allowlist names the combo, but disabling `ultrawork`
    // takes it away through the intersection rule — and standalone `ultrawork`
    // was never allowlisted, so nothing at all fires.
    const both = resolveConfig({
      enabledExpansions: ['hyperplan', 'hyperplan-ultrawork'],
      disabledKeywords: ['ultrawork'],
    })
    expect(decide(mainFacts('hyperplan go'), { config: both }).kind).toBe('inject')
    const combo = decide(mainFacts('hyperplan ulw go'), { config: both })
    expect(combo.kind === 'inject' && combo.types).toEqual(['hyperplan'])
    // An allowlist naming ONLY the combo cannot be reached when a base is off.
    const comboOnly = resolveConfig({ enabledExpansions: ['hyperplan-ultrawork'] })
    expect(decide(mainFacts('hyperplan ulw go'), { config: comboOnly }).kind)
      .toBe('inject')
    expect(decide(mainFacts('ulw go'), { config: comboOnly }))
      .toEqual({ kind: 'skip', reason: 'no-keyword' })
  })
})

// ═══════════ ⑤ 组合抑制 + 幂等双闸 ═══════════════════════════════════════════

describe('P4-T12 ⑤ the combo suppresses the standalones, and both idempotency gates bite', () => {
  it('a combo hit removes both standalone hits (upstream hook.ts:25-29)', () => {
    const hits = detectKeywordsWithMessages('hyperplan ulw now', { texts: TEXTS, agentName: undefined }, resolveConfig())
    expect(hits.map((hit) => hit.type)).toEqual(['hyperplan-ultrawork'])
    // The suppressed messages are not merely filtered from the list — the
    // injected text really carries neither standalone body.
    const text = hits.map((hit) => hit.message).join('\n\n')
    expect(text).toContain(COMBO_BANNER_PREFIX)
    expect(text).not.toContain('<hyperplan-mode>')
    expect(suppressComboStandalones([{ type: 'ultrawork', message: 'a' }, { type: 'hyperplan', message: 'b' }]))
      .toEqual([{ type: 'ultrawork', message: 'a' }, { type: 'hyperplan', message: 'b' }])
  })

  it('gate ① — message-level: text already carrying the body is not re-injected', () => {
    // Upstream hook.ts:31-36 verbatim: `!text.includes(keyword.message)`.
    const hits = detectKeywordsWithMessages('ulw', { texts: TEXTS, agentName: undefined }, resolveConfig())
    const message = hits[0]?.message ?? ''
    expect(filterAlreadyInjectedKeywords(hits, `please do this ulw ${message} thanks`)).toEqual([])
    expect(filterAlreadyInjectedKeywords(hits, 'please do this ulw thanks')).toHaveLength(1)
    // Through the decision: the exact injected text pasted back into a turn is
    // recognised and skipped rather than doubled.
    const pasted = decide(mainFacts(`ulw\n\n${message}`))
    expect(pasted).toEqual({ kind: 'skip', reason: 'already-injected-message' })
  })

  it('gate ② — session-level one-shot: the DSH-required adaptation', () => {
    // S-6. DSH's pre-step fires per STEP, not per message (H-32 measured 268
    // steps in one session), so without a session-level one-shot a single "ulw"
    // would inject 268 times. The guard is the upstream mechanism with the
    // predicate changed from "default-mode already armed" to "this session was
    // already injected".
    expect(decide(mainFacts('ulw go', { alreadyInjected: true })))
      .toEqual({ kind: 'skip', reason: 'session-one-shot' })
    // A different session is unaffected.
    expect(decide(mainFacts('ulw go', { alreadyInjected: false })).kind).toBe('inject')
  })

  it('both gates are INDEPENDENT — each alone blocks, and neither masks the other', () => {
    const hits = detectKeywordsWithMessages('ulw', { texts: TEXTS, agentName: undefined }, resolveConfig())
    const message = hits[0]?.message ?? ''
    // Message gate only.
    expect(decide(mainFacts(`ulw ${message}`)))
      .toEqual({ kind: 'skip', reason: 'already-injected-message' })
    // Session gate only.
    expect(decide(mainFacts('ulw', { alreadyInjected: true })))
      .toEqual({ kind: 'skip', reason: 'session-one-shot' })
    // Both, with the message gate reported first (it is the cheaper, narrower one).
    expect(decide(mainFacts(`ulw ${message}`, { alreadyInjected: true })))
      .toEqual({ kind: 'skip', reason: 'already-injected-message' })
  })
})

// ═══════════ ⑥ 注入面 ═══════════════════════════════════════════════════════

describe('P4-T12 ⑥ the injected text is the vendored body, and the listener never blocks a step', () => {
  it('the ultrawork body carries the banner, the vendor text and the roster note', () => {
    const message = buildUltraworkMessage({ texts: TEXTS, agentName: 'sisyphus' })
    // Shape = 载体注记 + vendor 正文（+ 名册尾注）。The vendor body is delivered
    // AS-IS and is self-delimiting: it opens with `<ultrawork-mode>` and closes
    // with `</ultrawork-mode>` on its own. Adding another pair here (as an
    // earlier draft did) would nest two identically named tags in front of the
    // model, so the wrapper is deliberately absent — and these two assertions
    // are what notice if a vendor update drops it.
    expect(message.startsWith(ULTRAWORK_CARRIER_NOTE)).toBe(true)
    expect(TEXTS.ultrawork).toMatch(/^<ultrawork-mode>/)
    expect(TEXTS.ultrawork).toMatch(/<\/ultrawork-mode>\s*$/)
    // The body follows the note verbatim, and the tag pair is still unique to it.
    expect(message).toContain(TEXTS.ultrawork)
    expect(message.endsWith(`</ultrawork-mode>\n\n${ROSTER_TAIL_NOTE}`)).toBe(true)
    expect(message.split('</ultrawork-mode>')).toHaveLength(2)
    expect(message).toContain(ULTRAWORK_BANNER_LINE)
    expect(message).toContain(TEXTS.ultrawork)
    // The reviewer narrowing (S-2): the vendor body names two agents the roster
    // does not have, and the tail note maps them to the two that exist.
    for (const literal of UNMAPPED_REVIEWER_LITERALS) {
      expect(ultraworkVendor, literal).toContain(literal)
      expect(message, literal).toContain(literal)
    }
    expect(ROSTER_TAIL_NOTE).toContain('plan-consultant')
    expect(ROSTER_TAIL_NOTE).toContain('plan-reviewer')
    // No frontmatter leaked into the model-facing text.
    expect(message).not.toContain('short-description:')
    expect(message).not.toContain('metadata:')
  })

  it('the ultrawork carrier note registers all THREE notepad differences', () => {
    // MAJOR-3: the task book asks for the notepad / mktemp differences to be
    // **registered**. Each of the three is asserted against a fact that is
    // checkable, not just present — a note that merely *mentions* a difference
    // is not a registered difference.
    // (1) LOCATION — the vendor body writes to $TMPDIR; the durable convention
    //     here is the workspace-local notepad dir, same as the ulw-execute
    //     precedent. Assert the note names BOTH and the vendor line it corrects.
    expect(ultraworkVendor).toContain('mktemp -t ulw-')
    expect(ULTRAWORK_CARRIER_NOTE).toContain('$TMPDIR')
    expect(ULTRAWORK_CARRIER_NOTE).toContain('.omo/notepads/')
    expect(ULTRAWORK_CARRIER_NOTE).toContain('mkdir -p .omo/notepads')
    expect(ULTRAWORK_CARRIER_NOTE).toContain('mktemp -p .omo/notepads')
    // The workspace-local dir really is the convention (the precedent constant).
    expect(NOTEPAD_DIR_SEGMENTS).toEqual(['.omo', 'notepads'])
    // (2) READ-BACK — the note must route the notepad read through the read tool,
    //     because `cat` is what the guardrail advises against here.
    expect(ULTRAWORK_CARRIER_NOTE).toContain('bash-file-read-guard')
    expect(ULTRAWORK_CARRIER_NOTE).toContain('read(')
    expect(ULTRAWORK_CARRIER_NOTE).toContain('not `cat`')
    // …and the vendor body really does demand that read-back, which is the
    // workflow the note is protecting (the phrase wraps a line in the vendor
    // file too, hence `flat`).
    expect(flat(ULTRAWORK_CARRIER_NOTE)).toContain('"Read the WHOLE notepad"')
    expect(flat(ultraworkVendor)).toContain('read the WHOLE notepad FIRST before any other action')
    // (3) FORM — ⚠️ the first draft of this note claimed `mktemp -t` "fails with
    //     too few arguments" under GNU coreutils. That was FALSE: GNU keeps `-t`
    //     and marks it [deprecated]; the slash-free vendor template satisfies its
    //     constraint and it exits 0. Verified on this host:
    //       $ T=$(mktemp -t ulw-$(date +%Y%m%d-%H%M%S).XXXXXX.md); echo $? $T
    //       0 /tmp/ulw-20261001-030916.9gmSGQ.md
    //       $ man mktemp | grep -A2 '^ *-t'   →  … [deprecated]
    //     So the assertions below are (a) the true claim is present and (b) the
    //     false claim is GONE — the second half matters more, because a stale
    //     wrong statement in model-facing text is worse than no statement.
    expect(flat(ULTRAWORK_CARRIER_NOTE)).toContain('`mktemp -t` still works here')
    expect(flat(ULTRAWORK_CARRIER_NOTE)).toContain('[deprecated], not removed')
    expect(flat(ULTRAWORK_CARRIER_NOTE)).toContain('exits 0')
    expect(flat(ULTRAWORK_CARRIER_NOTE)).toContain('NOT a syntax error')
    // The real point of (3): `-t` cannot choose the destination, `-p` can.
    expect(flat(ULTRAWORK_CARRIER_NOTE)).toContain('cannot do is choose the destination')
    expect(flat(ULTRAWORK_CARRIER_NOTE)).toContain('`-p <dir>` is the form that takes a directory')
    for (const falseClaim of ['too few arguments', 'is BSD. Under GNU', 'does not exist', '`-t` 前缀形式在 GNU']) {
      expect(ULTRAWORK_CARRIER_NOTE, falseClaim).not.toContain(falseClaim)
    }
    // The note must therefore keep pointing (1) at `-p`, which is the fix for the
    // location difference rather than a syntax patch.
    expect(ULTRAWORK_CARRIER_NOTE).toContain('mktemp -p .omo/notepads')
    // …and every one of the three must carry its falsifier, so a future reader can
    // check the note instead of trusting it (the style rule the note states).
    for (const falsifier of ['man mktemp', 'echo $TMPDIR', 'bash-read-guard-warned', 'NOTEPAD_DIR_SEGMENTS']) {
      // The falsifiers live in the doc comment, not in the model-facing text.
      expect(flat(MESSAGES_SOURCE), falsifier).toContain(falsifier)
    }
    // The note is a declaration, not a rewrite: the vendor instruction is still
    // present verbatim in the delivered text.
    const delivered = buildUltraworkMessage({ texts: TEXTS, agentName: 'sisyphus' })
    expect(delivered).toContain('mktemp -t ulw-')
    // It rides on the ultrawork side only — the combo carries it too (same body),
    // and the hyperplan side is governed by its OWN note (team tools), not this one.
    expect(ULTRAWORK_CARRIER_NOTE).not.toContain('team_create')
    expect(buildHyperplanMessage({ texts: TEXTS, agentName: 'sisyphus' })).not.toContain(ULTRAWORK_CARRIER_NOTE)
  })

  it('the hyperplan body declares the carrier gap instead of naming a dead tool', () => {
    // S-7. The vendored hyperplan body is built on `team_create` / `task_send`,
    // which have no DSH equivalent. The body stays verbatim; a carrier note
    // states the mapping, and the upstream "enable team_mode.enabled in
    // ~/.config/opencode/…" tail is NOT reproduced (that config surface does not
    // exist in this deployment — P4-T1 flagged the path inconsistency).
    const message = buildHyperplanMessage({ texts: TEXTS, agentName: 'sisyphus' })
    expect(message).toContain(HYPERPLAN_BANNER_LINE)
    expect(message).toContain(TEXTS.hyperplan)
    expect(message).toContain('`team_create`')
    expect(message).toContain('`task_send`')
    expect(message).toContain('`team_delete`')
    expect(message).toContain('NO equivalent in this deployment')
    expect(message).toContain('no `team_run_id`')
    expect(message).not.toContain('team_mode.enabled')
    expect(message).not.toContain('.config/opencode/')
    // The body really does name the team tools (that is why the note is needed).
    expect(hyperplanVendor).toContain('team_create')
  })

  it('the combo body is the verbatim wrapper + the ultrawork body only', () => {
    // Upstream getHyperplanUltraworkMessage = BANNER + "\n\n" + ultrawork.
    const message = buildHyperplanUltraworkMessage({ texts: TEXTS, agentName: 'sisyphus' })
    expect(message.startsWith(COMBO_BANNER_PREFIX)).toBe(true)
    expect(message).toContain(TEXTS.ultrawork)
    expect(message).not.toContain('<hyperplan-mode>')
    expect(message).not.toContain(TEXTS.hyperplan)
  })

  it('the roster tail note is suppressed inside a reviewer seat, added elsewhere', () => {
    // Inside plan-consultant/plan-reviewer the note would be self-referential
    // noise ("the reviewer seat is plan-consultant" said BY plan-consultant).
    expect(needsRosterNote('plan-consultant')).toBe(false)
    expect(needsRosterNote('plan-reviewer')).toBe(false)
    expect(needsRosterNote('sisyphus')).toBe(true)
    expect(needsRosterNote(undefined)).toBe(true)
    expect(buildUltraworkMessage({ texts: TEXTS, agentName: 'plan-reviewer' }))
      .not.toContain(ROSTER_TAIL_NOTE)
    expect(buildUltraworkMessage({ texts: TEXTS, agentName: 'plan-reviewer' }).endsWith('</ultrawork-mode>'))
      .toBe(true)
    // …and the hyperplan body, which this port DOES wrap (its vendor file has
    // no tag of its own), is wrapped exactly once.
    const hyperplan = buildHyperplanMessage({ texts: TEXTS, agentName: 'plan-reviewer' })
    expect(hyperplan.startsWith('<hyperplan-mode>')).toBe(true)
    expect(hyperplan.split('</hyperplan-mode>')).toHaveLength(2)
    expect(TEXTS.hyperplan).not.toContain('<hyperplan-mode>')
  })

  it('the injected text ends with the upstream separator, joined by blank lines', () => {
    const decision = decide(mainFacts('hyperplan ulw now'))
    expect(decision.kind).toBe('inject')
    if (decision.kind !== 'inject') return
    expect(decision.text.endsWith('\n\n---\n')).toBe(true)
    expect(decision.text.startsWith(`${COMBO_BANNER_PREFIX}\n\n<ultrawork-mode>`)).toBe(true)
    // Only ONE body: the two standalone bodies are suppressed (⑤), and the
    // vendored ultrawork body is not double-wrapped.
    expect(decision.text.match(/<ultrawork-mode>/g)).toHaveLength(1)
    expect(decision.text).not.toContain('<hyperplan-mode>')
  })

  it('the listener injects ONCE per session, always calls next, and never throws', async () => {
    const lines: string[] = []
    const listener = createKeywordDetectorListener({ texts: TEXTS, config: resolveConfig(), log: (line) => lines.push(line) })
    const injected: InjectedUserMessage[] = []
    const session: object = {}
    const payload = {
      messages: [userMessage('ulw build the thing')],
      agent: { session, inject: (message: InjectedUserMessage) => { injected.push(message) } },
    }
    let nextCalls = 0
    const next = () => { nextCalls += 1; return 'next' }
    // Three steps in the same session = three pre-steps, ONE injection.
    for (let step = 0; step < 3; step += 1) {
      expect(await listener(payload, next)).toBe('next')
    }
    expect(nextCalls).toBe(3)
    expect(injected).toHaveLength(1)
    // ⚠️ BLOCKER-1: the payload is a **UserMessage object**, not a bare string.
    // dsh-agent's signature is `inject(message: UserMessage)`; dsh-agent-loop
    // reads `message.id` for pending uniqueness (lib:192-194), so a bare string
    // carries id `undefined` and the second injection throws
    // `message "undefined" is already pending`. Assert the whole shape.
    const message = injected[0]
    expect(message?.role).toBe('user')
    expect(message?.source).toEqual({ kind: 'plugin', plugin: KEYWORD_DETECTOR_PLUGIN, form: 'instructions' })
    // `source.plugin` is the PACKAGE name, not this hook's id (same as the
    // ulw-execute / guardrail carriers).
    expect(KEYWORD_DETECTOR_PLUGIN).toBe('omo-hooks')
    expect(KEYWORD_DETECTOR_ID).toBe('keyword-detector')
    expect(Array.isArray(message?.content)).toBe(true)
    expect(message?.content).toHaveLength(1)
    expect(message?.content[0]?.type).toBe('text')
    expect(message?.content[0]?.text.endsWith('\n\n---\n')).toBe(true)
    // A fresh, non-empty id per injection (uuid shape).
    expect(message?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(typeof message?.id).not.toBe('undefined')
    expect(lines.filter((line) => line.includes('injected ['))).toHaveLength(1)
    expect(lines.filter((line) => line.includes('skipped: session-one-shot'))).toHaveLength(2)

    // A throwing inject surface must NOT fail the step: fail open, still next().
    const boom = createKeywordDetectorListener({
      texts: TEXTS,
      config: resolveConfig(),
      log: (line) => lines.push(line),
    })
    const exploding = {
      messages: [userMessage('ulw go')],
      agent: { session: {}, inject: () => { throw new Error('inject exploded') } },
    }
    expect(await boom(exploding, next)).toBe('next')
    expect(lines.some((line) => line.includes('listener failed: Error: inject exploded'))).toBe(true)
  })

  it('two consecutive injections carry DISTINCT ids — the inbox uniqueness contract', () => {
    // The property the bare-string payload violated. dsh-agent-loop splices each
    // injected message into the inbox and then checks `message.id` against the
    // pending set (lib:192-194); a second injection with the same (or missing)
    // id throws `message "undefined" is already pending` and takes the step with
    // it. This test models that check rather than trusting the comment: it
    // simulates the host's pending set over a run with two different sessions and
    // asserts no id repeats.
    const seen = new Set<string>()
    const inject = (message: InjectedUserMessage) => {
      expect(seen.has(message.id)).toBe(false)
      seen.add(message.id)
    }
    for (let i = 0; i < 50; i += 1) inject(buildInjectionMessage(`body ${i}`))
    expect(seen.size).toBe(50)
    // …and the two-in-a-row case the hook actually produces (a session one-shot
    // expires when the session object changes): distinct ids, so no throw.
    const first = buildInjectionMessage('same body')
    const second = buildInjectionMessage('same body')
    expect(first.id).not.toBe(second.id)
    // The text may repeat; only the id must not. (Both carry the same body, which
    // is exactly the shape that used to collide.)
    expect(first.content[0]?.text).toBe(second.content[0]?.text)
  })

  it('the descriptor is read ONCE per session, and the seat matchers are prebuilt', async () => {
    // MINOR-5: pre-step fires per STEP (H-32 measured 268 steps in one session)
    // and `ownEvents()` returns a full copy of the event log each call, while the
    // identity face is constant for the life of the session. Assert the cache
    // actually bites — otherwise this is an optimisation nobody can regress.
    let ownEventsCalls = 0
    const session = {
      ownEvents: () => {
        ownEventsCalls += 1
        return [{
          type: 'subagent/descriptor',
          data: { version: 3, mode: 'continuable', label: 'explore-1', persona: 'You are **omo-explore**.' },
        }]
      },
    }
    const lines: string[] = []
    const listener = createKeywordDetectorListener({ texts: TEXTS, config: resolveConfig(), log: (l) => lines.push(l) })
    const next = () => 'next'
    const payload = { messages: [userMessage('ulw go')], agent: { session, inject: () => undefined } }
    for (let step = 0; step < 5; step += 1) await listener(payload, next)
    expect(ownEventsCalls).toBe(1)
    // A second session gets its own read (the cache is keyed, not global-once).
    let otherCalls = 0
    const other = {
      ownEvents: () => {
        otherCalls += 1
        return [{ type: 'subagent/descriptor', data: { mode: 'one-shot', label: 'other-1' } }]
      },
    }
    for (let step = 0; step < 3; step += 1) {
      await listener({ messages: [userMessage('ulw go')], agent: { session: other, inject: () => undefined } }, next)
    }
    expect(otherCalls).toBe(1)
    // …and the main session (no session object at all) still works, uncached.
    expect(await listener({ messages: [userMessage('ulw go')], agent: { inject: () => undefined } }, next)).toBe('next')
  })

  it('an agent without an inject surface skips with a NAMED reason, injects nothing', async () => {
    // MINOR-4: the reachability fix. `no-inject-surface` is a **reachable**
    // reason — a payload whose `agent` has no `inject` — and it is now covered
    // end-to-end through the listener, not just through the pure decision. The
    // non-object `inject` cases matter too: `inject: 'nope'` must read as absent,
    // not as a callable.
    const lines: string[] = []
    const listener = createKeywordDetectorListener({ texts: TEXTS, config: resolveConfig(), log: (l) => lines.push(l) })
    let nextCalls = 0
    const next = () => { nextCalls += 1; return 'next' }
    for (const agent of [{}, { session: {} }, { inject: 'not a function' }, { inject: null }]) {
      lines.length = 0
      expect(await listener({ messages: [userMessage('ulw go')], agent }, next)).toBe('next')
      expect(lines.filter((l) => l.includes('skipped: no-inject-surface')), JSON.stringify(agent)).toHaveLength(1)
      // Critically: a skipped-for-no-inject-surface step must NOT be recorded as
      // injected. If it were, the session would be marked done and a later
      // working step would silently never arm the mode.
      expect(lines.filter((l) => l.includes('injected ['))).toHaveLength(0)
    }
    expect(nextCalls).toBe(4)
  })

  it('a payload without an agent, or without an inject surface, injects nothing', () => {
    // The listener-level coverage of the no-inject path lives in
    // `an agent without an inject surface skips with a NAMED reason` above; this
    // one pins the *fact extraction* that feeds it — `inject` counts as present
    // only when it is a function, whatever the surrounding shape.
    for (const payload of [{}, { messages: [userMessage('ulw go')] }, { agent: {} }]) {
      expect(isInjectable(payload), JSON.stringify(payload)).toBe(false)
    }
    for (const agent of [
      { inject: () => undefined },
      { inject: () => undefined, session: {} },
      { inject: () => undefined, session: { ownEvents: () => [] } },
    ]) {
      expect(isInjectable({ agent }), JSON.stringify(agent)).toBe(true)
    }
    // A session alone is NOT an inject surface — the classic way to get this
    // wrong is to treat "we found the session" as "we can inject".
    expect(isInjectable({ agent: { session: { ownEvents: () => [] } } })).toBe(false)
    // …and the decision given those facts takes the named branch.
    expect(decide(mainFacts('ulw go', { hasInject: false })))
      .toEqual({ kind: 'skip', reason: 'no-inject-surface' })
    expect(decide(mainFacts('ulw go', { hasInject: true })).kind).toBe('inject')
  })
})

// ═══════════ ⑦ vendor 载体与降级 ═════════════════════════════════════════════

describe('P4-T12 ⑦ the vendor carrier is real, and a missing one degrades loudly', () => {
  it('the loader reads the REAL vendored SKILL.md files, frontmatter stripped', () => {
    expect(loaded.ok).toBe(true)
    expect(TEXTS.ultraworkPath)
      .toBe('patches/omo-dsh/vendor/shared-skills/skills/ultrawork/SKILL.md')
    expect(TEXTS.hyperplanPath)
      .toBe('patches/omo-dsh/vendor/shared-skills/skills/hyperplan/SKILL.md')
    expect(TEXTS.ultrawork.length).toBeGreaterThan(1000)
    expect(TEXTS.hyperplan.length).toBeGreaterThan(1000)
    // The body is the vendored file minus its frontmatter, trimmed.
    expect(TEXTS.ultrawork).toBe(stripFrontmatter(ultraworkVendor).trim())
    expect(TEXTS.hyperplan).toBe(stripFrontmatter(hyperplanVendor).trim())
    expect(describeInstructionTexts(TEXTS))
      .toBe(`ultrawork=${TEXTS.ultraworkPath} (${TEXTS.ultrawork.length} chars) + `
        + `hyperplan=${TEXTS.hyperplanPath} (${TEXTS.hyperplan.length} chars)`)
    // Frontmatter stripping is anchored to the LEADING block only.
    expect(stripFrontmatter('---\na: 1\n---\nbody\n---\nmore')).toBe('body\n---\nmore')
    expect(stripFrontmatter('no frontmatter here')).toBe('no frontmatter here')
  })

  it('the vendored files still carry the banner anchors this hook depends on', () => {
    // The drift guard for the whole narrowing: if a vendor update renames the
    // banner sentence, this test says so instead of the model silently
    // receiving a directive whose "first line must be X" no longer matches.
    expect(ultraworkVendor).toContain(`\`${ULTRAWORK_BANNER_LINE}\``)
    expect(hyperplanVendor).toContain(`"${HYPERPLAN_BANNER_LINE}"`)
  })

  it('a missing carrier degrades to a NAMED NOTE and injects nothing', () => {
    // The rule: never improvise instruction text. A missing vendor file means no
    // injection at all for the process lifetime, loudly.
    const decision = decide({ ...mainFacts('ulw go'), texts: undefined })
    expect(decision).toEqual({ kind: 'skip', reason: 'vendor-texts-unavailable' })
    const line = formatKeywordDetectorDegradedLine('missing vendor text X — no keyword will be injected')
    expect(line).toBe('[omo-hooks] keyword-detector: NOTE: keyword injection disabled — missing vendor text X — no keyword will be injected')
    // And the loader classifies the failure rather than throwing.
    const failure = loadInstructionTexts(() => { throw new Error('EACCES') })
    expect(failure.ok).toBe(false)
    if (failure.ok) return
    expect(failure.failures.every((entry) => entry.kind === 'unreadable' || entry.kind === 'missing')).toBe(true)
  })

  it('the diagnostic lines are greppable and carry the hook id', () => {
    expect(formatKeywordDetectorLine('injected [ultrawork] into explore-1 (12000 chars)'))
      .toBe('[omo-hooks] keyword-detector: injected [ultrawork] into explore-1 (12000 chars)')
    expect(KEYWORD_DETECTOR_ID).toBe('keyword-detector')
    // Every diagnostic the hook can emit names the hook — the cold-start /
    // probe greps anchor on this prefix.
    expect(formatKeywordDetectorLine('x').startsWith('[omo-hooks] keyword-detector: ')).toBe(true)
  })
})

// ═══════════ ⑧ manifest 一致性 ══════════════════════════════════════════════

describe('P4-T12 ⑧ the manifest row describes exactly this implementation', () => {
  it('H-33 is the roster\'s keyword row, on the mode-A pre-step event', () => {
    const row = HOOK_MANIFEST.find((entry) => entry.id === 'keyword-detector')
    expect(row).toBeDefined()
    expect(row?.event).toBe('agent/pre-step')
    expect(row?.mode).toBe('A')
    // `ported` since P4-T13: listener + unit tests (P4-T12) + the e2e (P4-T13),
    // flipped as the 双侧同步 commit that also moves the coverage doc's §1.2
    // status cell. c14 fails in both directions if the two halves ever disagree.
    expect(row?.status).toBe('ported')
    // The scenario name, by contrast, IS settled: it points at the P4-T13
    // scenario that really exists. The pre-T13 forward promise
    // `keyword-mode-ultrawork` named a scenario that was never written.
    expect(row?.e2eScenario).toBe('ultrawork-keyword-injected')
  })

  it('the row counts 17 upstream files + 7 test files, and names no test as a source', () => {
    const row = HOOK_MANIFEST.find((entry) => entry.id === 'keyword-detector')
    expect(row?.upstreamFiles).toHaveLength(17)
    expect(row?.upstreamTestFiles).toHaveLength(7)
    // The N-03 rules the validator enforces, asserted here so the row's intent
    // is visible: no `.test.ts` in the source column, no `AGENTS.md` in either.
    expect(row?.upstreamFiles.filter((file) => file.endsWith('.test.ts'))).toEqual([])
    expect(row?.upstreamFiles.some((file) => file.endsWith('AGENTS.md'))).toBe(false)
    // The config schema (the KeywordType + config-field home) IS listed — it is
    // outside the hook directory but is genuinely part of this hook.
    expect(row?.upstreamFiles).toContain('packages/omo-opencode/src/config/schema/keyword-detector.ts')
    // …and the hyperplan directory files, so the six gates' provenance is whole.
    for (const file of [
      'packages/omo-opencode/src/hooks/keyword-detector/hook.ts',
      'packages/omo-opencode/src/hooks/keyword-detector/detector.ts',
      'packages/omo-opencode/src/hooks/keyword-detector/constants.ts',
      'packages/omo-opencode/src/hooks/keyword-detector/ultrawork/source-detector.ts',
      'packages/omo-opencode/src/hooks/keyword-detector/hyperplan/default.ts',
      'packages/omo-opencode/src/hooks/keyword-detector/team/default.ts',
    ]) {
      expect(row?.upstreamFiles, file).toContain(file)
    }
  })
})

// ── helpers referenced by ⑥ ─────────────────────────────────────────────────

/**
 * Collapses all whitespace runs to single spaces. The carrier notes are
 * hard-wrapped arrays of lines (readability for the model), so a phrase that
 * spans a wrap boundary needs this to be matched on its words rather than on
 * the current line-wrapping choice — which is presentation, not contract.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ')
}

/** True when the payload carries a usable `agent.inject` surface. */
function isInjectable(payload: unknown): boolean {
  return typeof (payload as { agent?: { inject?: unknown } } | null)?.agent?.inject === 'function'
}
