// P4-T10 — `/ulw-execute` 的单测：模板渲染、R-10 跨包常量一致性、注入形态。
//
// WHY THE CROSS-PACKAGE IMPORT IS LEGAL HERE (and only here). The two patch
// packages are installed independently (`dsh plugin add` links each), so a
// runtime import from omo-commands into omo-hooks would crash the whole package
// when the other is absent — which is why `commands/ulw-execute.ts` and
// `templates/ulw-execute.ts` declare the R-10 markers LOCALLY. A TEST may import
// both, because a test importing a missing file is a test failure, not a broken
// install. That asymmetry is the whole reason the consistency claim lives in a
// test: the values are written twice, and this file is what makes writing them
// twice safe. Same discipline as `stop-continuation.test.ts`'s cross-package
// service-name equality.

import { describe, expect, it } from 'vitest'

import {
  MissingCommandSessionIDError,
  renderCommandTemplate,
} from '../../patches/omo-dsh/omo-commands/src/templates/render.ts'
import {
  ULW_EXECUTE_ARGUMENT_HINT,
  ULW_EXECUTE_COMMAND_TEMPLATE,
  ULW_EXECUTE_SESSION_CONTEXT_CLOSE,
  ULW_EXECUTE_SESSION_CONTEXT_OPEN,
  ULW_EXECUTE_SESSION_ID_LINE,
  ULW_EXECUTE_TEMPLATE,
  ULW_EXECUTE_TEMPLATE_HEADER_MARKER,
  ULW_EXECUTE_TIMESTAMP_LINE,
} from '../../patches/omo-dsh/omo-commands/src/templates/ulw-execute.ts'
import {
  ULW_EXECUTE_DESCRIPTION,
  createUlwExecuteCommand,
  renderUlwExecuteInstruction,
} from '../../patches/omo-dsh/omo-commands/src/commands/ulw-execute.ts'
import { COMMAND_MANIFEST } from '../../patches/omo-dsh/omo-commands/src/manifest.ts'

// The other side of the R-10 contract. ⚠️ Imported from `ulw-execute/constants.ts`,
// NOT from the hook module: the hook re-exports these under the upstream-ish
// aliases `START_WORK_TEMPLATE_MARKER` / `SESSION_CONTEXT_OPEN`, so importing
// through it would compare against a *copy* and the test would pass even if the
// constants module — the single source the registrar actually reads — drifted.
// The aliasing is real (it resolved to `undefined` on the first attempt).
import {
  TEMPLATE_HEADER_MARKER,
  TEMPLATE_SESSION_CONTEXT_OPEN,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/constants.ts'
import {
  hasCommandTemplateMarker,
  decideUlwExecuteActivation,
  type ActivationInput,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute.ts'
import { ATLAS_PERSONA_ANCHOR } from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/identity.ts'

/** The persona string the hook recognises, DERIVED from its own anchor constant. */
const ATLAS_PERSONA = `You are **${ATLAS_PERSONA_ANCHOR}**, the master orchestrator.`

const FIXED_NOW = '2026-10-05T00:00:00.000Z'
const clock = () => FIXED_NOW

function invocation(rawInput: string, sessionId: string = 'session-t10-1') {
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

describe('P4-T10 R-10 — the two packages agree on the interface constants, VERBATIM', () => {
  // THE load-bearing block of this file. Upstream's activation detection
  // (start-work-hook.ts:170-175) matches these two strings literally, and a
  // mismatch does not throw — the hook simply does not activate. So the failure
  // mode this guards is total silence, which is why it is asserted by VALUE
  // comparison across the package boundary rather than by anything structural.
  it('the template header marker is byte-identical in both packages', () => {
    expect(ULW_EXECUTE_TEMPLATE_HEADER_MARKER).toBe(TEMPLATE_HEADER_MARKER)
    // …and both are upstream's, spelled out here so a coordinated change on both
    // sides still has to pass through the frozen upstream text.
    expect(ULW_EXECUTE_TEMPLATE_HEADER_MARKER).toBe('You are starting an Atlas work session.')
  })

  it('the session-context open tag is byte-identical in both packages', () => {
    expect(ULW_EXECUTE_SESSION_CONTEXT_OPEN).toBe(TEMPLATE_SESSION_CONTEXT_OPEN)
    expect(ULW_EXECUTE_SESSION_CONTEXT_OPEN).toBe('<session-context>')
  })

  it('BOTH markers actually appear in the rendered message (constants agreeing is not enough)', () => {
    // The real risk is not two constants drifting — it is the two constants
    // agreeing while the TEMPLATE stops emitting one of them (a wrapper edit that
    // drops the `<session-context>` block, say). That would leave the equality
    // assertions green and the activation dead. So the claim is made on the
    // RENDERED product, which is what H-32 actually sees.
    const { value } = invocation('some-plan --ship')
    const rendered = renderUlwExecuteInstruction(value, clock)
    expect(rendered).toContain(ULW_EXECUTE_SESSION_CONTEXT_OPEN)
    expect(rendered).toContain(ULW_EXECUTE_TEMPLATE_HEADER_MARKER)
    // …and the conjunction H-32 uses accepts it. This is the end-to-end proof of
    // the R-10 contract: the message this command queues IS a command-template
    // product as far as the hook is concerned.
    expect(hasCommandTemplateMarker(rendered)).toBe(true)
  })

  it('the H-32 conjunction rejects a message carrying only ONE of the two markers', () => {
    // The other half of the contract: the gate is a conjunction (upstream's `&&`),
    // so a text that merely mentions one marker must NOT activate. Without this,
    // "either marker" would satisfy the hook and the gate would be a false
    // positive on arbitrary prose that happens to contain `<session-context>`.
    expect(hasCommandTemplateMarker(ULW_EXECUTE_TEMPLATE_HEADER_MARKER)).toBe(false)
    expect(hasCommandTemplateMarker(ULW_EXECUTE_SESSION_CONTEXT_OPEN)).toBe(false)
    expect(hasCommandTemplateMarker('please use <session-context> wisely')).toBe(false)
    expect(hasCommandTemplateMarker('')).toBe(false)
  })
})

describe('P4-T10 the template is the upstream three-layer wrapper, not just the body', () => {
  it('keeps all three layers in upstream order', () => {
    // R-10 (P4-T1 C-group measurement, plan §4.7 corrected): the wrapper is in
    // commands.ts:67-73, NOT in the template body. Both halves are required.
    expect(ULW_EXECUTE_COMMAND_TEMPLATE.startsWith('<command-instruction>')).toBe(true)
    const layers = ['</command-instruction>', ULW_EXECUTE_SESSION_CONTEXT_OPEN, '</session-context>', '<user-request>', '</user-request>']
    let cursor = -1
    for (const layer of layers) {
      const at = ULW_EXECUTE_COMMAND_TEMPLATE.indexOf(layer)
      expect(at, `layer ${layer} is missing or out of order`).toBeGreaterThan(cursor)
      cursor = at
    }
  })

  it('carries the two session-context lines upstream writes (commands.ts:68-69)', () => {
    // Both lines, not one: the rendered `Session ID:` and `Timestamp:` are the
    // only place the model learns which session it is in, and the CRITICAL
    // section of the body tells it to use the session id "injected by the
    // session context below". A body that promises it and a wrapper that omits it
    // is a silent, confusing failure.
    expect(ULW_EXECUTE_COMMAND_TEMPLATE).toContain(ULW_EXECUTE_SESSION_ID_LINE)
    expect(ULW_EXECUTE_COMMAND_TEMPLATE).toContain(ULW_EXECUTE_TIMESTAMP_LINE)
    expect(ULW_EXECUTE_SESSION_ID_LINE).toBe('Session ID: $SESSION_ID')
    expect(ULW_EXECUTE_TIMESTAMP_LINE).toBe('Timestamp: $TIMESTAMP')
    expect(ULW_EXECUTE_SESSION_CONTEXT_CLOSE).toBe('</session-context>')
  })

  it('starts the body with the header marker on its own line (marker is line 1)', () => {
    // Upstream start-work.ts:1 — the marker is the FIRST LINE of the body, and
    // H-32 matches it as a substring so a prefix would technically still match.
    // Asserting it as the body's first line is stricter than the hook needs, and
    // deliberately so: it documents the shape the hook was designed against.
    expect(ULW_EXECUTE_TEMPLATE.split('\n')[0]).toBe(ULW_EXECUTE_TEMPLATE_HEADER_MARKER)
  })

  it('keeps the flags syntax verbatim, four flags and their implications', () => {
    // The task book names the flags as verbatim-preserved, so they are pinned
    // individually: each one is a promise about behaviour, and dropping an
    // implication sentence (e.g. "--ship implies --make-pr") changes semantics
    // without changing a single character of syntax.
    expect(ULW_EXECUTE_ARGUMENT_HINT).toBe('[plan-name] [--worktree <path>] [--make-pr] [--ship]')
    expect(ULW_EXECUTE_TEMPLATE).toContain('--worktree <path>')
    expect(ULW_EXECUTE_TEMPLATE).toContain('IMPLIES worktree mode')
    expect(ULW_EXECUTE_TEMPLATE).toContain('implies `--make-pr`')
    expect(ULW_EXECUTE_TEMPLATE).toContain('until it is MERGED')
  })
})

describe('P4-T10 rendering is a pure function of template + three values', () => {
  it('substitutes all three placeholders', () => {
    const { value } = invocation('my-plan --make-pr', 'session-abc')
    const rendered = renderUlwExecuteInstruction(value, clock)
    expect(rendered).toContain('Session ID: session-abc')
    expect(rendered).toContain(`Timestamp: ${FIXED_NOW}`)
    expect(rendered).toContain('my-plan --make-pr')
    // No placeholder survives — a leftover `$ARGUMENTS` would reach the model as
    // literal text.
    expect(rendered).not.toContain('$ARGUMENTS')
    expect(rendered).not.toContain('$SESSION_ID')
    expect(rendered).not.toContain('$TIMESTAMP')
  })

  it('is byte-identical across two renders with the same clock (no hidden state)', () => {
    const a = renderUlwExecuteInstruction(invocation('x').value, clock)
    const b = renderUlwExecuteInstruction(invocation('x').value, clock)
    expect(a).toBe(b)
  })

  it('throws MissingCommandSessionIDError when the session id is absent', () => {
    // Loud on purpose. Rendering `Session ID: ` (empty) into the body would give
    // the model a session identity that exists but is blank — worse than not
    // queueing the instruction at all.
    const { value } = invocation('x', '')
    expect(() => renderUlwExecuteInstruction(value, clock)).toThrow(MissingCommandSessionIDError)
  })

  it('renders an empty $ARGUMENTS rather than failing (no-arg invocation is legal)', () => {
    // `/ulw-execute` with no flags is a normal call — the body says a plan may be
    // auto-selected. It must not throw, and must not leave the placeholder behind.
    const rendered = renderUlwExecuteInstruction(invocation('').value, clock)
    expect(rendered).toContain('<user-request>\n\n</user-request>')
  })
})

describe('P4-T10 the handler queues exactly one user message (T6 injection precedent)', () => {
  it('follows up once with the rendered template, and reports success', () => {
    const { value, queued } = invocation('plan-a', 'session-xyz')
    const result = createUlwExecuteCommand(clock).handler(value)
    expect(queued).toHaveLength(1)
    expect(queued[0]).toBe(renderUlwExecuteInstruction(value, clock))
    expect(result.kind).toBe('success')
    expect(result.kind === 'success' && result.text).toContain('session-xyz')
  })

  it('settles a missing session id as kind:error and queues NOTHING', () => {
    // The T6 discipline: a handler must never let an exception escape, and must
    // not leave a half-applied effect behind. Queueing nothing is the point —
    // the alternative is a followup carrying an empty session identity.
    const { value, queued } = invocation('plan-a', '')
    const result = createUlwExecuteCommand(clock).handler(value)
    expect(result.kind).toBe('error')
    expect(queued).toEqual([])
    // `describeError` returns `error.message` only (never `.name`), so the class
    // name is not in the text — the message is the user-facing line, and it is
    // upstream's message verbatim.
    expect(result.kind === 'error' && result.text)
      .toContain('/ulw-execute could not queue its instruction: Command template requires a session ID')
  })

  it('uses the upstream description verbatim', () => {
    expect(ULW_EXECUTE_DESCRIPTION).toBe('(builtin) Start Atlas work session from Prometheus plan')
  })

  it('the argument hint has ONE source: the template constant IS the manifest row', () => {
    // MINOR-5. `argumentHint` is declared twice — here and in the manifest row —
    // because the manifest is the roster's single source of truth for the
    // registered `input.hint` (index.ts reads it off the row and NEVER off this
    // module) while the template needs the same string in its ARGUMENTS section.
    // Nothing forced them to stay equal, and nothing would have failed if they
    // diverged: the registered hint would say one thing and the rendered
    // instruction another, with every other test still green. So they are
    // asserted equal here rather than left to discipline.
    const row = COMMAND_MANIFEST.find((entry) => entry.id === 'ulw-execute')
    if (row === undefined) throw new Error('no ulw-execute manifest row')
    expect(row.argumentHint).toBe(ULW_EXECUTE_ARGUMENT_HINT)
    // …and the hint that actually reaches the registry is the row's, not this
    // module's — the direction of the data flow, pinned so a future refactor
    // that starts reading the constant instead shows up as a real decision.
    expect(row.argumentHint).toBe('[plan-name] [--worktree <path>] [--make-pr] [--ship]')
  })
})

describe('P4-T10 how the queued message reaches H-32 (semantics corrected)', () => {
  // This block originally asserted that the command's own message activates the
  // hook **in a session with no atlas persona**, on the reasoning "the command
  // runs in the conductor's session, so there is no child persona to find".
  // That reasoning was wrong about the injection surface: `runUlwExecuteStep`
  // returns at `!identity.found`, so a descriptor-less session never reaches the
  // decision function at all — the bypass was unreachable in production and the
  // test was a pure-function fiction.
  //
  // The real chain: this command queues an instruction into the CONDUCTOR's
  // session; the conductor delegates to atlas; the marker then travels as the
  // delegation's TASK TEXT into the atlas CHILD session, which is where H-32
  // acts. The conductor session not injecting is **by design**. The listener-level
  // proof of both halves lives in tests/omo-hooks/ulw-execute.test.ts (it needs
  // the hook's own fixtures); what is asserted HERE is that this package's
  // product is the thing that carries the markers across that boundary.
  const base = (over: Partial<ActivationInput> = {}): ActivationInput => ({
    persona: ATLAS_PERSONA,
    taskText: '',
    alreadyInjected: false,
    contextText: 'CTX',
    ...over,
  })

  it('the queued message is recognised as a command-template product', () => {
    const { value } = invocation('plan-a')
    expect(hasCommandTemplateMarker(renderUlwExecuteInstruction(value, clock))).toBe(true)
  })

  it('in the ATLAS CHILD session (has persona) that same message activates', () => {
    // The evaluation surface: an atlas child session whose first user message is
    // the delegated task text — here, the command's own product standing in for
    // "the conductor passed the template along".
    const { value } = invocation('plan-a')
    const taskText = renderUlwExecuteInstruction(value, clock)
    expect(decideUlwExecuteActivation(base({ taskText }))).toEqual({ kind: 'inject', text: 'CTX' })
  })

  it('in a CONDUCTOR-shaped session (no atlas persona) it does NOT activate — by design', () => {
    // This used to assert `inject` and to justify it with "the command runs in the
    // conductor session". Corrected: the conductor is not H-32's injection surface,
    // which corresponds to upstream's "no command marker -> no activation" form.
    // Keeping the assertion as `not-atlas` makes the identity gate a guard: anyone
    // who re-adds the bypass to make the command activate here turns this red.
    const { value } = invocation('plan-a')
    const taskText = renderUlwExecuteInstruction(value, clock)
    expect(decideUlwExecuteActivation(base({ taskText, persona: undefined })))
      .toEqual({ kind: 'skip', reason: 'not-atlas' })
    expect(decideUlwExecuteActivation(base({ taskText, persona: 'omo-sisyphus' })))
      .toEqual({ kind: 'skip', reason: 'not-atlas' })
  })

  it('the idempotency key is shared: already-injected wins on the command product too', () => {
    // THE regression risk of adding a second intent track. Both tracks converge on
    // one `alreadyInjected` input, so a session that already has the context must
    // not get a second copy, and the skip reason is the existing one, not a new
    // branch. Now asserted WITH an atlas persona, because that is the only
    // surface where the decision function is reachable at all.
    const { value } = invocation('plan-a')
    const taskText = renderUlwExecuteInstruction(value, clock)
    expect(decideUlwExecuteActivation(base({ taskText, alreadyInjected: true })))
      .toEqual({ kind: 'skip', reason: 'already-injected' })
  })

  it('the native delegation track did not regress', () => {
    expect(decideUlwExecuteActivation(base({ taskText: 'start the work session on plan alpha' })))
      .toEqual({ kind: 'inject', text: 'CTX' })
  })

  it('an atlas session that received the command product is still injected ONCE', () => {
    // Both intent signals satisfied at once (the product also contains intent
    // words) must not produce two injections — the decision is a single value, so
    // this checks that the tracks CONVERGE rather than accumulate.
    const { value } = invocation('start the work session on plan alpha')
    const taskText = renderUlwExecuteInstruction(value, clock)
    expect(decideUlwExecuteActivation(base({ persona: ATLAS_PERSONA, taskText })))
      .toEqual({ kind: 'inject', text: 'CTX' })
  })
})
