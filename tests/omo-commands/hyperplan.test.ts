// P4-T14 — `/hyperplan` 单测（降级形态）。
//
// 判定条件（任务书 T14）：单测覆盖 ① 模板渲染 ② 降级指引段在场
// ③ team 引用零硬编码死链。③ 是本文件最重的一条，见其 describe 块的说明。

import { describe, expect, it } from 'vitest'

import { MissingCommandSessionIDError, renderCommandTemplate } from '../../patches/omo-dsh/omo-commands/src/templates/render.ts'
import {
  DSH_SKILL_CALL_FORM,
  HYPERPLAN_ARGUMENT_HINT,
  HYPERPLAN_CARRIER_NOTE,
  HYPERPLAN_COMMAND_TEMPLATE,
  HYPERPLAN_DEGRADED_GUIDANCE,
  HYPERPLAN_ROSTER_CONTRACT,
  HYPERPLAN_SKILL_NAME,
  UPSTREAM_SKILL_CALL_FORM,
} from '../../patches/omo-dsh/omo-commands/src/templates/hyperplan.ts'
import {
  HYPERPLAN_DESCRIPTION,
  UPSTREAM_HYPERPLAN_DESCRIPTION,
  createHyperplanCommand,
  renderHyperplanInstruction,
} from '../../patches/omo-dsh/omo-commands/src/commands/hyperplan.ts'
import { COMMAND_MANIFEST } from '../../patches/omo-dsh/omo-commands/src/manifest.ts'
import { VENDOR_SKILLS_DIR } from '../../patches/omo-dsh/omo-commands/src/skills.ts'
// MINOR-6: the roster ids come from the roster module itself (a hand-typed copy in a
// test asserts nothing about the roster — only about itself).
import { ALL_AGENT_IDS } from '../../patches/omo-dsh/omo-agents/src/roster.ts'

const FIXED_NOW = '2026-10-05T00:00:00.000Z'
const clock = () => FIXED_NOW

function invocation(rawInput: string, sessionId: string = 'session-t14-1') {
  const queued: string[] = []
  return {
    queued,
    value: {
      rawInput,
      agent: {
        id: sessionId,
        followup: (message: { content: readonly [{ text: string }] }) => {
          queued.push(message.content[0].text)
        },
      },
    },
  }
}

describe('P4-T14 the template is a semantic port of upstream hyperplan, DEGRADED', () => {
  it('keeps upstream\'s verbatim strings', () => {
    expect(UPSTREAM_HYPERPLAN_DESCRIPTION).toBe('(builtin) Adversarial multi-agent planning via team-mode (5 hostile category members cross-critique, lead synthesizes)')
    // MAJOR-1: the REGISTERED string keeps the upstream sentence verbatim as its
    // prefix and appends the degraded suffix — so the user-facing description can no
    // longer promise a team-mode surface this deployment does not have.
    expect(HYPERPLAN_DESCRIPTION.startsWith(UPSTREAM_HYPERPLAN_DESCRIPTION)).toBe(true)
    expect(HYPERPLAN_DESCRIPTION).toContain('(DEGRADED here: no team-mode surface; adversarial roles run as roster delegations)')
    expect(HYPERPLAN_ARGUMENT_HINT).toBe('[planning-request]')
    expect(HYPERPLAN_SKILL_NAME).toBe('hyperplan')
  })

  it('the argument hint has ONE source: the manifest row carries the same literal', () => {
    // Same reasoning as ulw-execute (MINOR-5): the constant is declared twice, and
    // the registry reads the ROW, not the constant — so a divergence would ship an
    // `input.hint` that disagrees with the rendered instruction, silently.
    const row = COMMAND_MANIFEST.find((entry) => entry.id === 'hyperplan')
    if (row === undefined) throw new Error('no hyperplan manifest row')
    expect(row.argumentHint).toBe(HYPERPLAN_ARGUMENT_HINT)
    // Upstream has NO `agent:` field on this entry (unlike start-work), so the row
    // must stay unbound — inventing a binding would fabricate an upstream fact.
    expect(row.agentBinding).toBeNull()
  })

  it('the degraded suffix reaches the MODEL-visible frame, not only the registry', () => {
    // The description is interpolated into formatCommandTemplate's Description line,
    // which the model reads. If the suffix lived only in the registered command
    // listing, the model would still receive upstream's unqualified promise — and the
    // model is the actor that could try to call team-mode.
    const rendered = renderHyperplanInstruction(invocation('x').value, clock)
    expect(rendered).toContain('DEGRADED here: no team-mode surface')
    expect(rendered).toContain(UPSTREAM_HYPERPLAN_DESCRIPTION)
  })

  it('loads the skill by NAME while rewriting the CALL FORM', () => {
    // Upstream's `skill(name="hyperplan")` is OMO's own tool syntax. The NAME is
    // the attribution anchor and is what T5 registered in the catalog; only the
    // invocation shape changes, to the dsh-tool-skill model face.
    expect(UPSTREAM_SKILL_CALL_FORM).toBe('skill(name="hyperplan")')
    expect(DSH_SKILL_CALL_FORM).toContain('`skill` tool')
    // The upstream form must NOT reach the model as executable text.
    expect(HYPERPLAN_COMMAND_TEMPLATE).not.toContain(UPSTREAM_SKILL_CALL_FORM)
    expect(HYPERPLAN_COMMAND_TEMPLATE).toContain(HYPERPLAN_SKILL_NAME)
  })

  it('points at the REAL vendored skill path (derived, not retyped)', () => {
    // If the vendor tree ever moves, the instruction would send the model to a
    // path that does not exist; deriving it from the same constant the catalog
    // uses means both move together.
    expect(HYPERPLAN_COMMAND_TEMPLATE).toContain(`${VENDOR_SKILLS_DIR}/${HYPERPLAN_SKILL_NAME}/SKILL.md`)
  })

  it('keeps the upstream outer frame and the <user-request> wrapper', () => {
    expect(HYPERPLAN_COMMAND_TEMPLATE.startsWith('<command-instruction>')).toBe(true)
    expect(HYPERPLAN_COMMAND_TEMPLATE).toContain('</command-instruction>')
    expect(HYPERPLAN_COMMAND_TEMPLATE).toContain('<user-request>\n$ARGUMENTS\n</user-request>')
    // Upstream's wording for the workflow instruction, kept.
    // MAJOR-2: upstream's wording is kept VERBATIM, including its "7-phase" — the
    // skill is actually headed Phase 0..7 (eight), but restating a corrected count
    // would be "upstream is wrong, so we are wrong too". The discrepancy is recorded
    // in carrier-note item 4, and this assertion pins that the wording did NOT drift
    // into a silent correction.
    expect(HYPERPLAN_COMMAND_TEMPLATE).toContain('follow its 7-phase workflow EXACTLY using this user request')
  })
})

describe('P4-T14 ② the degraded guidance is present, and says what to do instead', () => {
  it('is in the rendered message (not merely exported)', () => {
    // Exported-but-unused is the failure mode this guards: a carrier note that
    // documents the rewrite while the body still carries upstream's dead link.
    const rendered = renderHyperplanInstruction(invocation('design the auth rewrite').value, clock)
    expect(rendered).toContain(HYPERPLAN_DEGRADED_GUIDANCE)
    expect(rendered).toContain('DEGRADED')
  })

  it('does NOT reproduce either upstream config path (both are dead here)', () => {
    // Upstream template says ~/.omo/omo.jsonc; upstream mode prompt says
    // ~/.config/opencode/oh-my-opencode.jsonc. Reproducing EITHER would point the
    // user at a file that does not exist and whose absence nothing can change.
    // ⚠️ The two are checked as substrings of the CARRIER NOTE too — the note must
    // be allowed to quote them (it records the inconsistency), so the assertion is
    // scoped to the rendered body, where quoting them would be the dead link.
    const rendered = renderHyperplanInstruction(invocation('x').value, clock)
    const open = rendered.indexOf('<command-instruction>')
    const body = rendered.slice(open, rendered.indexOf('</command-instruction>'))
    // Anti-vacuity: the slice really covers the template (not an empty string).
    expect(body.length).toBeGreaterThan(1000)
    // The ACTIONABLE form is what must be absent: upstream tells the user to SET a
    // flag in a config file and restart. Neither of those instructions may survive.
    //
    // MINOR-5: no filesystem path of ANY shape reaches the model-facing body — `~`
    // catches both upstream config paths without naming them. The carrier note may
    // still quote them (it must: recording the inconsistency is required).
    expect(body).not.toMatch(/omo\.jsonc|oh-my-opencode|~[/.]/)
    expect(body).not.toContain('team_mode.enabled')
    expect(body).not.toContain('restart opencode')
    // …and the model-facing guidance carries the disclaimer in words instead.
    expect(body).toContain('nothing in this deployment that such a flag would switch on')
    expect(body).toContain(HYPERPLAN_DEGRADED_GUIDANCE)
  })

  it('names the FULL ring as a Phase 5 surface and gives a working path today', () => {
    // A degraded notice that only says "this is degraded" leaves the model with no
    // instruction; the value is in the "instead do this" half.
    expect(HYPERPLAN_DEGRADED_GUIDANCE).toContain('Phase 5')
    expect(HYPERPLAN_DEGRADED_GUIDANCE).toContain('prometheus')
    expect(HYPERPLAN_DEGRADED_GUIDANCE).toContain('plan-consultant')
    expect(HYPERPLAN_DEGRADED_GUIDANCE).toContain('plan-reviewer')
    // …and requires the model to SAY it ran degraded, so the user is not misled.
    expect(HYPERPLAN_DEGRADED_GUIDANCE).toContain('DEGRADED mode')
  })
})

describe('P4-T14 ③ team references are ZERO hardcoded dead links', () => {
  // The rule: the rendered model-facing body must not contain upstream surface
  // that does not exist here. `team_create` / `team_send` / `team_delete` and the
  // four category names are exactly that — copying them verbatim would be five
  // dead links the model could try to call.
  //
  // SCOPED TO THE BODY: the carrier note is REQUIRED to name them (that is how a
  // reader learns what was dropped and why), and the degraded guidance names
  // `team_create`/`team_delete` in order to say "skip this phase". A guard that
  // forbade the words anywhere would make both honest texts impossible to write —
  // which is how a "dead-link guard" turns into a guard against documentation.
  // ⚠️ 这段切片**曾经写反**，导致整个守卫是空的：第一次写成
  // `slice(indexOf('</command-instruction>'))`（从闭合标签往后切），于是它只覆盖
  // 降级指引段，而**模板正文**（roster 契约、`<user-request>` 之前的一切）落在
  // 切片之外。注入一个真死链（`team_create` + `unspecified-low`）进去，19 条测试
  // 全绿 —— 负向断言最危险的形态：看着在管一整块，实际只管了一小块。
  // 现在从**开标签**切到闭合标签，才是真的"模型看到的正文"。
  const body = (): string => {
    const rendered = renderHyperplanInstruction(invocation('x').value, clock)
    const open = rendered.indexOf('<command-instruction>')
    const close = rendered.indexOf('</command-instruction>')
    if (open === -1 || close === -1 || close <= open) {
      throw new Error(`frame not found (open=${open} close=${close}) — the slice below would be silently empty`)
    }
    return rendered.slice(open, close)
  }

  /**
   * THE judgment function, named once, so the mutation tests below can run the
   * *same* predicate against a deliberately polluted copy. Extracting it is the
   * point: a falsification that re-implements the rule proves only that the
   * re-implementation catches something, not that the shipped guard does.
   *
   * Returns every violation found; empty means clean.
   */
  function deadLinkFindings(text: string): string[] {
    const found: string[] = []
    for (const dead of ['team_create', 'task_send', 'team_delete']) {
      // MINOR-4: the window is ONE SENTENCE. A before/after window was too generous
      // — a denial in the PREVIOUS sentence laundered an imperative in the NEXT one.
      for (const sentence of text.split(/(?<=[.;])|\n/).filter((part) => part.includes(dead))) {
        const denies = /\b(no|not|never|without|skip|absent|does not|do not|don'?t|cannot)\b/i.test(sentence)
        if (!denies) found.push(`${dead} sits in a non-denying sentence: ${JSON.stringify(sentence.trim())}`)
      }
    }
    for (const category of ['unspecified-low', 'unspecified-high', 'ultrabrain', 'artistry', 'deep']) {
      if (text.includes(category)) found.push(`category ${category} appears in the model-facing body`)
    }
    // MINOR-5: no filesystem path of ANY shape — `~` catches both upstream config
    // paths without naming them. The carrier note may still quote them (it must:
    // recording the inconsistency is required).
    const pathish = /omo\.jsonc|oh-my-opencode|~[/.]/.exec(text)
    if (pathish !== null) found.push(`a filesystem path reached the model-facing body: ${pathish[0]}`)
    return found
  }

  it('the model-facing body carries NO dead link (the shipped guard is clean)', () => {
    // A dead link is an instruction the model can act on, so the guard is on the
    // IMPERATIVE, not on the word. The body DOES contain "team_create" /
    // "team_delete" — necessarily, because the guidance has to say which skill
    // phases to skip. What it must never do is tell the model to call them.
    //
    // First attempt at this guard asserted the bare words were absent, and it
    // passed while a real injected `Call team_create with category members …`
    // sat in the body — because the body slice was inverted (see `body()`). Both
    // defects together produced a guard that looked strict and was empty.
    const text = body()
    // The guidance MUST name the two tools whose skill phases it tells the model
    // to skip — otherwise the instruction cannot be followed.
    for (const mustName of ['team_create', 'team_delete']) {
      expect(text.split(mustName).length - 1, `${mustName} is never named`).toBeGreaterThan(0)
    }
    expect(deadLinkFindings(text)).toEqual([])
    // The model is told the surface is absent, in words.
    expect(text).toContain('no team-mode surface')
  })

  // ── MUTATION TESTS (②). Each builds a polluted copy of the REAL body in place and
  // runs the SAME `deadLinkFindings` over it. Without these, the guard above would be
  // "it passes on the good text" — which is also what a completely broken guard does.
  it('MUTATION: a cross-sentence denial does NOT launder the next imperative', () => {
    // The exact regression the sentence split exists for: the denial is real, and in
    // the PREVIOUS sentence, so a wider window would wave this through.
    const polluted = `${body()}\n\nThere is no team_create here. Then call team_create with the roster members.`
    const found = deadLinkFindings(polluted)
    expect(found.some((line) => line.includes('non-denying sentence'))).toBe(true)
    expect(found.some((line) => line.includes('Then call team_create'))).toBe(true)
  })

  it('MUTATION: the upstream config instruction is caught by the path assertion', () => {
    // This pins specifically that the PATH rule fires — the rule that survives even if
    // someone later loosens the negation-word list.
    const polluted = `${body()}\n\nInstruct the user to set team mode in ~/.omo/omo.jsonc.`
    expect(deadLinkFindings(polluted).some((line) => line.includes('filesystem path'))).toBe(true)
  })

  it('MUTATION: a bare category name is caught', () => {
    // Upstream's most likely real regression is someone restoring one category into
    // the body; the category rule covers that independently of the tool-name rule.
    const polluted = `${body()}\n\nMembers are drawn from the ultrabrain pool when available.`
    expect(deadLinkFindings(polluted).some((line) => line.includes('ultrabrain'))).toBe(true)
  })

  it('the guard is a HEURISTIC, not a proof — the known residual risk, stated', () => {
    // `deadLinkFindings` accepts a sentence as safe if it contains ANY negation word
    // anywhere. So a contrived same-sentence construction such as
    // "no team_create is available? Call team_create." passes this guard.
    // That is a deliberate, accepted limit: the rule is tuned for the regressions this
    // port actually risks — a restored imperative, a restored category name, a restored
    // config path — each proven caught by the mutation tests above. The upstream-most-
    // likely regression shape is covered independently by the category rule, so closing
    // the same-sentence hole would add complexity without adding protection against any
    // known real-world edit. This test PINS the residual so it cannot be forgotten: if
    // the rule is ever tightened, this test fails and forces the note to be rewritten.
    expect(deadLinkFindings('no team_create is available? Call team_create.')).toEqual([])
  })

  it('…so the names are only ever quoted in the carrier note, never in the body', () => {
    // Each dead name must appear somewhere in the port (the note), proving the
    // audit above is not passing merely because the port forgot about them.
    // `task_send`, not `team_send` — that is upstream's actual name (SKILL.md HARD
    // PRECONDITIONS #1: `team_create`, `task_send`, `team_delete`).
    for (const dead of ['team_create', 'task_send', 'team_delete', 'unspecified-low', 'ultrabrain', 'artistry']) {
      expect(HYPERPLAN_CARRIER_NOTE, `${dead} is not documented anywhere`).toContain(dead)
    }
  })

  it('every roster seat the contract names is a REAL roster id', () => {
    // MINOR-6: the seat list is DERIVED from the roster module, not retyped. A
    // hand-typed copy is a self-referential assertion — it passes as long as the
    // template and this list agree, and says nothing about the roster. Seven other
    // tests already import from omo-agents/src/roster.ts; this follows suit.
    const seats = ['plan-consultant', 'plan-reviewer', 'prometheus']
    for (const seat of seats) {
      expect(HYPERPLAN_ROSTER_CONTRACT).toContain(seat)
      expect([...ALL_AGENT_IDS], `${seat} is not a roster id`).toContain(seat)
    }
    // And the contract must not name a seat OUTSIDE the roster: every backticked
    // single-token identifier in it is checked against ALL_AGENT_IDS, so a future
    // edit that invents `the-analyst` cannot pass.
    for (const named of HYPERPLAN_ROSTER_CONTRACT.matchAll(/`([a-z][a-z-]{2,})`/g)) {
      const token = named[1]
      expect([...ALL_AGENT_IDS], `the contract names \`${token}\`, which is not a roster id`).toContain(token)
    }
  })

  it('the absent members are declared ABSENT, not silently dropped', () => {
    // Upstream's skeptic/researcher/creative have no seat here. Silently omitting
    // them would make the degraded run look complete; the declaration must exist.
    //
    // ⚠️ The declaration lives in the CONTRACT (model-facing, by name-of-role) but
    // the upstream member NAMES live in the carrier note. They are deliberately not
    // both in the body: a first draft named skeptic/researcher/creative in the
    // contract, which is the same dead-link mistake as naming the categories — the
    // body should name real roster seats, the note should name what was dropped.
    expect(HYPERPLAN_ROSTER_CONTRACT).toContain('no dedicated roster seat')
    expect(HYPERPLAN_ROSTER_CONTRACT).toContain('Do not invent seats')
    for (const member of ['skeptic', 'researcher', 'creative']) {
      expect(HYPERPLAN_CARRIER_NOTE, `${member} is not documented as dropped`).toContain(member)
      // …and must NOT be in the body as if it were a usable seat.
      expect(body()).not.toContain(member)
    }
  })
})

describe('P4-T14 the upstream inconsistencies are recorded, not silently resolved', () => {
  it('(A) both conflicting config paths are recorded in the note', () => {
    // A reviewer must be able to SEE that upstream disagrees with itself here.
    // If a future change picks one, this assertion is what stops the record from
    // quietly becoming a claim that the other path was always wrong.
    expect(HYPERPLAN_CARRIER_NOTE).toContain('~/.omo/omo.jsonc')
    expect(HYPERPLAN_CARRIER_NOTE).toContain('~/.config/opencode/oh-my-opencode.jsonc')
    expect(HYPERPLAN_CARRIER_NOTE).toContain('inconsistent')
  })

  it('(B) the "7-phase" wording vs the skill\'s 8 stage headings is recorded', () => {
    // The template keeps upstream's "7-phase"-style wording; the SKILL has Phase 0
    // through Phase 7. Without this note a 7-vs-8 mismatch reads as a bad vendor.
    expect(HYPERPLAN_CARRIER_NOTE).toContain('7-PHASE')
    expect(HYPERPLAN_CARRIER_NOTE).toContain('Phase 0')
    expect(HYPERPLAN_CARRIER_NOTE).toContain('Phase 7')
  })
})

describe('P4-T14 rendering: this template needs NO session id (the opposite of ulw-execute)', () => {
  it('substitutes $ARGUMENTS and leaves no placeholder', () => {
    const rendered = renderHyperplanInstruction(invocation('plan the auth rewrite').value, clock)
    expect(rendered).toContain('plan the auth rewrite')
    expect(rendered).not.toContain('$ARGUMENTS')
    expect(rendered).not.toContain('$SESSION_ID')
    expect(rendered).not.toContain('$TIMESTAMP')
  })

  it('does NOT throw MissingCommandSessionIDError for a falsy session id', () => {
    // Upstream's hyperplan template has no `$SESSION_ID` and no <session-context>
    // frame, so this command genuinely does not need one. Asserted explicitly
    // because /ulw-execute DOES throw for the same input — someone generalising
    // T10's requirement to every command would break this one.
    const { value } = invocation('x', '')
    expect(() => renderHyperplanInstruction(value, clock)).not.toThrow(MissingCommandSessionIDError)
    expect(renderHyperplanInstruction(value, clock)).toContain('<user-request>\nx\n</user-request>')
  })
})

describe('P4-T14 the handler queues exactly one user message (T6 injection precedent)', () => {
  it('follows up once and reports the degraded mode in its reply', () => {
    const { value, queued } = invocation('plan the auth rewrite', 'session-xyz')
    const result = createHyperplanCommand(clock).handler(value)
    expect(queued).toHaveLength(1)
    expect(queued[0]).toBe(renderHyperplanInstruction(value, clock))
    expect(result.kind).toBe('success')
    // The human-visible line must not read as "ran the full adversarial ring".
    expect(result.kind === 'success' && result.text).toContain('DEGRADED')
  })

  it('queues the message with a falsy session id too (no session dependency)', () => {
    const { value, queued } = invocation('x', '')
    const result = createHyperplanCommand(clock).handler(value)
    expect(queued).toHaveLength(1)
    expect(result.kind).toBe('success')
  })
})