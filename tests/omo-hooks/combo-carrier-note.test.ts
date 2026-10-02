// 评审 A-4 的形状承载文件 —— 组合模式（`hyperplan ulw`）的 ultrawork 载体注记。
//
// WHY THIS FILE EXISTS SEPARATELY. The shape assertions for the combo body
// belong to tests/omo-hooks/keyword-detector.test.ts (⑥'s "the combo body is the
// verbatim wrapper + the ultrawork body only" case and the injection-surface case
// at its `:952`), but that file was mid-edit by another agent when A-4 was
// arbitrated, so this file carries the NEW expectations while the old ones are
// relaxed in the same merge. Everything asserted here is about the shape that
// A-4 CHANGED; everything unchanged stays where it was.
//
// The defect being pinned. `buildHyperplanUltraworkMessage` used to assemble
// `COMBO_BANNER_PREFIX + "\n\n" + texts.ultrawork`, so the combo path delivered
// the vendor body **without** `ULTRAWORK_CARRIER_NOTE` — the standalone
// ultrawork path (messages.ts's `buildUltraworkMessage`) has carried that note
// since P4-T12. The note registers three carrier-level differences (notepad
// location `$TMPDIR` vs `.omo/notepads/`, read-back `cat` vs `read`, and the
// `mktemp -t` vs `mktemp -p <dir>` form). Dropping them on the combo path is not
// cosmetic: the combo IS the workflow that depends most on cross-turn resumption
// (it is the mode a user picks when they intend to keep going), and without (1)
// the notepad lands in $TMPDIR where the next turn cannot see it — which kills
// the one rule the whole protocol turns on ("read the WHOLE notepad FIRST before
// any other action, then resume").
//
// THE CLAIM UNDER TEST, in three parts, each a separate assertion below:
//   1. PRESENT — the combo body carries the note;
//   2. IN POSITION — between the banner and the vendor body (not appended after
//      the body, which would put a carrier note below an instruction block the
//      model has already been told to execute verbatim);
//   3. NON-REGRESSING — the vendor body still arrives verbatim and still owns
//      the ONLY `<ultrawork-mode>` tag pair (the note carries no tag, so putting
//      it in front cannot nest a second pair).
//
// Plus the cross-cutting one the codebase's own writing discipline calls for
// ("两侧注记一致性纪律" in messages.ts): the note must be the **same constant
// object**, not a second copy that can drift. Asserting on the constant's
// identity is what makes "one constant, two call sites" a checked fact rather
// than a convention — a future edit that inlines a literal here is red.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see keyword-detector/index.ts's
// header).
import { describe, expect, it } from 'vitest'
import {
  COMBO_BANNER_PREFIX,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/constants.ts'
import {
  HYPERPLAN_CARRIER_NOTE,
  ROSTER_TAIL_NOTE,
  ULTRAWORK_CARRIER_NOTE,
  buildHyperplanUltraworkMessage,
  buildUltraworkMessage,
  loadInstructionTexts,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/messages.ts'
import { resolveConfig } from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/detector.ts'
import {
  decideKeywordInjection,
  type KeywordStepFacts,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector.ts'

/** The real loader result — the body under test is the vendored one, not a fixture. */
const loaded = loadInstructionTexts()
if (!loaded.ok) throw new Error(`vendored instruction texts unavailable: ${JSON.stringify(loaded.failures)}`)
const TEXTS = loaded.texts

/**
 * The facts for a MAIN-session turn carrying ONE user prose message.
 *
 * `promptTexts` is the BATCH read surface (a `readonly string[]`, not a single
 * string — see KeywordStepFacts' own comment and filters.ts's batch reader), and
 * `sessionOrigin` is the subagent判定面; `undefined` = main session, which is the
 * lane this file cares about (the combo is typed by a human into a main session).
 */
function mainFacts(text: string): KeywordStepFacts {
  return {
    hasInject: true,
    texts: TEXTS,
    promptTexts: [text],
    sessionOrigin: undefined,
    descriptor: { found: false, mode: undefined, persona: undefined, label: undefined },
    config: resolveConfig(),
  }
}

const combo = (agentName = 'sisyphus'): string => buildHyperplanUltraworkMessage({ texts: TEXTS, agentName })

describe('A-4 the combo body carries the ultrawork carrier note, in position', () => {
  it('① PRESENT — the note is in the combo body at all', () => {
    const message = combo()
    expect(message).toContain(ULTRAWORK_CARRIER_NOTE)
    // …as the SAME object the standalone path uses, not a second copy of it. A
    // copy would drift: fixing the standalone wording would leave the combo
    // declaring the old, possibly-wrong facts (the note's own style rule says a
    // stale false claim in model-facing text is worse than no claim).
    expect(message.split(ULTRAWORK_CARRIER_NOTE)).toHaveLength(2)
    expect(combo().includes(buildUltraworkMessage({ texts: TEXTS, agentName: 'sisyphus' })
      .slice(0, ULTRAWORK_CARRIER_NOTE.length))).toBe(true)
    // All THREE differences ride along (not just the note's header line): the
    // assertions below are the same three the standalone side pins, because the
    // defect was precisely that they did NOT ride along here.
    expect(message).toContain('$TMPDIR')
    expect(message).toContain('.omo/notepads/')
    expect(message).toContain('mktemp -p .omo/notepads')
    expect(message).toContain('bash-file-read-guard')
    expect(message).toContain('not `cat`')
    // …and the hyperplan-side note (team tools) still does NOT leak in: the two
    // notes govern different halves, and stacking them would be noise. Asserted
    // on the note constant rather than on the string `team_create`, because the
    // **ultrawork** vendor body itself mentions the team tools in its round-3
    // handoff — so `not.toContain('team_create')` on the message would be a
    // false claim about vendor text we do not own.
    expect(message).not.toContain(HYPERPLAN_CARRIER_NOTE)
  })

  it('② IN POSITION — banner, then note, then the vendor body', () => {
    const message = combo()
    // The banner is still first, byte-for-byte (it carries the user's first
    // spoken line and the "do NOT say the standalone banners" injunction).
    expect(message.startsWith(COMBO_BANNER_PREFIX)).toBe(true)
    // …and the note follows it, immediately, with the blank-line join the two
    // factory halves share.
    expect(message.startsWith(`${COMBO_BANNER_PREFIX}\n\n${ULTRAWORK_CARRIER_NOTE}`)).toBe(true)
    // …and the vendor body follows the note. Ordering is the whole point: a
    // carrier note appended BELOW a 30 KB instruction block the model was told to
    // follow verbatim reads as a footnote and loses to the block above it, so
    // this asserts the note is strictly before the body, not merely present.
    expect(message.indexOf(ULTRAWORK_CARRIER_NOTE))
      .toBeLessThan(message.indexOf(TEXTS.ultrawork))
    // The three segments are contiguous — no interleaved fragment between them.
    // `stripFrontmatter` is not needed here: the note is a literal constant, so
    // a strict equality on the joined prefix is a stronger statement than a
    // "contains" chain would be.
    expect(message.startsWith(`${COMBO_BANNER_PREFIX}\n\n${ULTRAWORK_CARRIER_NOTE}\n\n${TEXTS.ultrawork}`))
      .toBe(true)
  })

  it('③ NON-REGRESSING — the vendor body stays verbatim with the only tag pair', () => {
    const message = combo()
    // Delivered verbatim (the port's standing rule: the vendor body is not
    // rewritten, the carrier differences are declared outside it).
    expect(message).toContain(TEXTS.ultrawork)
    // The note carries no tag, so fronting it cannot nest a second pair — and
    // the pair is still unique to the vendor body. These are the assertions
    // that go red if someone "helpfully" wraps the combo body in
    // `<ultrawork-mode>` too (the exact defect buildUltraworkMessage documents
    // at length).
    expect(ULTRAWORK_CARRIER_NOTE).not.toContain('<ultrawork-mode>')
    expect(message.split('</ultrawork-mode>')).toHaveLength(2)
    expect(message.match(/<ultrawork-mode>/g)).toHaveLength(1)
    expect(message.endsWith(`</ultrawork-mode>\n\n${ROSTER_TAIL_NOTE}`)).toBe(true)
    // The standalone form's own shape is unchanged by this fix (regression
    // guard in the other direction — the note must not have been duplicated in
    // front of the standalone body, or it would appear twice there).
    const standalone = buildUltraworkMessage({ texts: TEXTS, agentName: 'sisyphus' })
    expect(standalone.split(ULTRAWORK_CARRIER_NOTE)).toHaveLength(2)
    expect(standalone.startsWith(`${ULTRAWORK_CARRIER_NOTE}\n\n${TEXTS.ultrawork}`)).toBe(true)
  })

  it('the injected text keeps the note between the banner and the body', () => {
    // The listener's own seam, not just the factory's: `decideKeywordInjection`
    // joins the built messages and appends the `---` separator, so the note's
    // position has to survive that assembly too. (This is the assertion that
    // replaces the `startsWith(COMBO_BANNER_PREFIX + "\n\n<ultrawork-mode>")`
    // pin in keyword-detector.test.ts: that shape is no longer true, and the
    // replacement asserts the same first-segment claim plus the new one.)
    const decision = decideKeywordInjection(mainFacts('hyperplan ulw now'))
    expect(decision.kind).toBe('inject')
    if (decision.kind !== 'inject') return
    expect(decision.types).toEqual(['hyperplan-ultrawork'])
    expect(decision.text.startsWith(`${COMBO_BANNER_PREFIX}\n\n${ULTRAWORK_CARRIER_NOTE}\n\n`))
      .toBe(true)
    // Still exactly one body and one tag pair after assembly, and the vendor
    // text is still the tail before the separator.
    expect(decision.text.match(/<ultrawork-mode>/g)).toHaveLength(1)
    expect(decision.text).not.toContain('<hyperplan-mode>')
    expect(decision.text).toContain(TEXTS.ultrawork)
    expect(decision.text.endsWith(`</ultrawork-mode>\n\n${ROSTER_TAIL_NOTE}\n\n---\n`)).toBe(true)
    // The note does not escape its segment: it appears once in the injected text,
    // between the banner and the body.
    expect(decision.text.split(ULTRAWORK_CARRIER_NOTE)).toHaveLength(2)
    expect(decision.text.indexOf(ULTRAWORK_CARRIER_NOTE))
      .toBeLessThan(decision.text.indexOf(TEXTS.ultrawork))
  })
})