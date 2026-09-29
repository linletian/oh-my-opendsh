// P3-T14 — edit-error-recovery listener (plan §4.2 pattern D; task book WP-6 批 A).
// The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/edit-error-recovery/hook.ts @ v4.19.4:
//
//   upstream  `tool.execute.after` → tool name `edit` (case-insensitive) + the
//             result text containing one of THREE opencode-worded error strings
//             → `output.output += "\n" + EDIT_ERROR_REMINDER`
//   this port `tools/post-execute` → the same gate on the rendered text of the
//             DSH result, but with the error table REBUILT against DSH's real
//             edit-failure wording (the file header's 前置①), delivered as
//             `{kind:'accept', content:[{type:'text', text: text + "\n" + REMINDER}]}`
//
// The nine upstream `it` cases (index.test.ts) are the seed: the three error
// kinds, the "no `Error:` prefix" case, the case-insensitive tool name, the
// non-edit tool, the successful output, the undefined-output crash guard and the
// pattern-table assertion. The DSH-side additions (the rebuilt table, the
// text-only-content guard, the idempotency sentinel, the fail-open contract)
// each have their own case below.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it, vi } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  EDIT_ERROR_PATTERNS,
  EDIT_ERROR_RECOVERY_EVENT,
  EDIT_ERROR_RECOVERY_ID,
  EDIT_ERROR_REMINDER,
  EDIT_ERROR_REMINDER_MARKER,
  EDIT_TOOL_NAME,
  UPSTREAM_EDIT_ERROR_PATTERNS,
  decideEditErrorRecovery,
  isEditExecution,
  isTextOnlyResultContent,
  matchesEditErrorTable,
  readRenderedText,
  registerEditErrorRecovery,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/edit-error-recovery.ts'

/**
 * The four DSH edit-failure messages, transcribed by hand from the pinned
 * install (the citations are in the module header's 前置①). Each is written the
 * way a tool result carries it: `Error: <message>` (dsh-tools `toolErrorResult`
 * :3490-3502).
 */
const DSH_EDIT_ERROR_TEXTS: readonly string[] = [
  'Error: old_string and new_string must differ',
  'Error: old_string was not found in "src/example.ts"',
  'Error: old_string matched 3 times in "src/example.ts"; '
    + 'provide a more specific old_string or set replace_all to true',
  'Error: old_string must be a non-empty string',
]

/** The upstream three, transcribed by hand from hook.ts:6-10 (the audit trail). */
const UPSTREAM_PATTERNS_TRANSCRIBED: readonly string[] = [
  'oldString and newString must be different',
  'oldString not found',
  'oldString found multiple times',
]

/** One recorded `ctx.on` call — the registration observable. */
interface OnCall {
  readonly event: string
  readonly listener: (...args: readonly unknown[]) => unknown
}

/** The decision shape this listener may return, widened for inspection. */
interface Decision {
  kind: string
  content?: Array<{ type: string; text: string }>
}

/** A fake cordis context that records registrations (same shape as T5/T7's). */
function fakeContext(): { ctx: HooksRegistrationContext; onCalls: OnCall[] } {
  const onCalls: OnCall[] = []
  return {
    ctx: {
      on(event, listener) {
        onCalls.push({ event, listener })
        return () => {}
      },
    },
    onCalls,
  }
}

/** The real manifest row — the registrar must read its event from the row. */
function editRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === EDIT_ERROR_RECOVERY_ID)
  if (row === undefined) throw new Error('manifest is missing the edit-error-recovery row')
  return row
}

/** Registers the real registrar against the REAL manifest row and captures it. */
function registerAndCapture(): {
  listener: (...args: readonly unknown[]) => unknown
  onCalls: OnCall[]
} {
  const { ctx, onCalls } = fakeContext()
  registerEditErrorRecovery(ctx, editRow())
  expect(onCalls).toHaveLength(1)
  return { listener: onCalls[0]!.listener, onCalls }
}

/** An `edit` execution payload shaped like the dsh `ToolExecution` leaf fields. */
function editExec(name = EDIT_TOOL_NAME): { name: string } {
  return { name }
}

/** A result whose rendered content is one text block (the dsh result shape). */
function textResult(text: string, isError = true): {
  isError: boolean
  content: Array<{ type: string; text: string }>
} {
  return { isError, content: [{ type: 'text', text }] }
}

/** The value `next()` resolves to — a sentinel so "delegated verbatim" is checkable. */
const NEXT_RESULT = Object.freeze({ kind: 'accept' })

/** A `next` double that records calls and resolves to the sentinel. */
function nextDouble(): { next: () => Promise<unknown>; calls: () => number } {
  const next = vi.fn(async () => NEXT_RESULT)
  return { next, calls: () => next.mock.calls.length }
}

describe('P3-T14 edit error table — REBUILT against the DSH wording', () => {
  it('① the upstream three are the audit trail, NOT the live gate', () => {
    // hook.ts:6-10, transcribed by hand: the opencode vocabulary (`oldString`)
    // never appears in a DSH edit result, so the live table must not be them.
    expect([...UPSTREAM_EDIT_ERROR_PATTERNS]).toEqual([...UPSTREAM_PATTERNS_TRANSCRIBED])
    expect([...EDIT_ERROR_PATTERNS]).not.toEqual([...UPSTREAM_EDIT_ERROR_PATTERNS])
    for (const upstreamPattern of UPSTREAM_EDIT_ERROR_PATTERNS) {
      expect(EDIT_ERROR_PATTERNS, upstreamPattern).not.toContain(upstreamPattern)
    }
    // …and none of them matches any real DSH edit failure text, which is exactly
    // why the rebuild was mandatory (a transcribed table would be dead code).
    for (const text of DSH_EDIT_ERROR_TEXTS) {
      for (const upstreamPattern of UPSTREAM_EDIT_ERROR_PATTERNS) {
        expect(text.toLowerCase().includes(upstreamPattern.toLowerCase()), text).toBe(false)
      }
    }
  })

  it('② the live table matches EVERY real DSH edit failure message verbatim', () => {
    for (const text of DSH_EDIT_ERROR_TEXTS) {
      expect(matchesEditErrorTable(text), text).toBe(true)
    }
    // Matching is upstream's mechanism (hook.ts:47-52): substring on the
    // lowercased text — a differently-cased result still matches.
    expect(matchesEditErrorTable('OLD_STRING WAS NOT FOUND in "f.ts"')).toBe(true)
    expect(matchesEditErrorTable('error: OLD_STRING MATCHED 2 times in "f.ts"')).toBe(true)
  })

  it('③ a successful edit / an unrelated error text does not match', () => {
    for (const text of [
      'The file src/example.ts has been updated successfully.',
      'The file src/example.ts has been updated. All occurrences were successfully replaced.',
      // The two DSH edit failures deliberately OUT of scope (harness
      // read-before-write discipline, not an edit mistake — module header).
      'Error: cannot modify "src/example.ts": file has not been read — read the file, then retry',
      'Error: cannot edit "src/example.ts": file changed since it was read',
      '',
    ]) {
      expect(matchesEditErrorTable(text), text).toBe(false)
    }
  })

  it('④ the reminder is the upstream text verbatim, newlines included', () => {
    // hook.ts:16-27, transcribed by hand (not derived from the module): the
    // template literal's leading AND trailing newline are load-bearing, because
    // upstream appends `\n${REMINDER}` to the result text.
    expect(EDIT_ERROR_REMINDER).toBe(`
[EDIT ERROR - IMMEDIATE ACTION REQUIRED]

You made an Edit mistake. STOP and do this NOW:

1. READ the file immediately to see its ACTUAL current state
2. VERIFY what the content really looks like (your assumption was wrong)
3. APOLOGIZE briefly to the user for the error
4. CONTINUE with corrected action based on the real file content

DO NOT attempt another edit until you've read and verified the file state.
`)
    expect(EDIT_ERROR_REMINDER.startsWith('\n')).toBe(true)
    expect(EDIT_ERROR_REMINDER.endsWith('\n')).toBe(true)
    // The sentinel is the reminder's own first line — that is what makes the
    // idempotency check able to see its own output.
    expect(EDIT_ERROR_REMINDER_MARKER).toBe('[EDIT ERROR - IMMEDIATE ACTION REQUIRED]')
    expect(EDIT_ERROR_REMINDER).toContain(EDIT_ERROR_REMINDER_MARKER)
  })
})

describe('P3-T14 edit-error-recovery — trigger fidelity (upstream hook.ts:45-55)', () => {
  it('① each DSH edit-mistake message gets the reminder appended (§seed 1/3/4)', () => {
    for (const text of DSH_EDIT_ERROR_TEXTS) {
      const decision = decideEditErrorRecovery(editExec(), textResult(text)) as Decision | undefined
      expect(decision, text).toBeDefined()
      expect(decision?.kind).toBe('accept')
      expect(decision?.content).toEqual([{ type: 'text', text: `${text}\n${EDIT_ERROR_REMINDER}` }])
    }
  })

  it('② a hit WITHOUT the `Error: ` prefix still matches (upstream seed 2)', () => {
    const decision = decideEditErrorRecovery(
      editExec(),
      textResult('old_string was not found in content'),
    )
    expect(decision).toBeDefined()
  })

  it('③ appends to the ORIGINAL text — no prefix is dropped (upstream `+=`)', () => {
    const original = 'Error: old_string was not found in "a.ts"'
    const decision = decideEditErrorRecovery(editExec(), textResult(original)) as Decision
    const rewritten = decision.content?.[0]?.text ?? ''
    expect(rewritten.startsWith(original)).toBe(true)
    expect(rewritten).toBe(`${original}\n${EDIT_ERROR_REMINDER}`)
  })

  it('④ a non-edit tool is never touched (upstream seed 5)', () => {
    for (const name of ['read', 'write', 'bash', 'edit_file', '']) {
      expect(decideEditErrorRecovery(editExec(name), textResult(DSH_EDIT_ERROR_TEXTS[1]!)))
        .toBeUndefined()
    }
  })

  it('⑤ the tool gate is case-insensitive (upstream `.toLowerCase()`, seed 8)', () => {
    // DSH's registry names the tool the canonical lowercase `edit`
    // (dsh-tool-fs:742); upstream lowercased before comparing, and so does this
    // port, so the opencode-seed case `Edit` also matches.
    for (const name of ['edit', 'Edit', 'EDIT']) {
      expect(isEditExecution(editExec(name)), name).toBe(true)
      expect(decideEditErrorRecovery(editExec(name), textResult(DSH_EDIT_ERROR_TEXTS[0]!)), name)
        .toBeDefined()
    }
    expect(isEditExecution(undefined)).toBe(false)
    expect(isEditExecution({})).toBe(false)
    expect(isEditExecution({ name: 7 })).toBe(false)
  })

  it('⑥ a successful edit result is left alone (upstream seed 6)', () => {
    expect(decideEditErrorRecovery(
      editExec(),
      textResult('The file a.ts has been updated successfully.', false),
    )).toBeUndefined()
  })

  it('⑦ a result with no text / malformed payloads never crashes (upstream seed 7)', () => {
    // Upstream's `typeof output.output !== 'string'` early return (`:46`), on
    // the DSH shape: no content, empty content, non-array content, non-text
    // blocks only.
    for (const result of [
      { isError: true, content: [] },
      { isError: true },
      { isError: true, content: 'not-an-array' },
      { isError: true, content: [{ type: 'image', data: 'x' }] },
    ]) {
      expect(decideEditErrorRecovery(editExec(), result)).toBeUndefined()
    }
    for (const payload of [undefined, null, 42, 'text']) {
      expect(decideEditErrorRecovery(editExec(), payload)).toBeUndefined()
    }
  })

  it('⑧ a non-text block anywhere makes the rewrite refuse (no block can be dropped)', () => {
    const mixed = {
      isError: true,
      content: [
        { type: 'text', text: DSH_EDIT_ERROR_TEXTS[1]! },
        { type: 'image', data: 'x' },
      ],
    }
    expect(isTextOnlyResultContent(mixed)).toBe(false)
    expect(decideEditErrorRecovery(editExec(), mixed)).toBeUndefined()
    expect(isTextOnlyResultContent({ content: [{ type: 'text', text: 'x' }] })).toBe(true)
    expect(isTextOnlyResultContent({ content: [] })).toBe(true)
  })

  it('⑨ already-reminded text is NOT appended twice (the deliberate sentinel)', () => {
    const once = `${DSH_EDIT_ERROR_TEXTS[1]!}\n${EDIT_ERROR_REMINDER}`
    expect(decideEditErrorRecovery(editExec(), textResult(once))).toBeUndefined()
  })

  it('⑩ readRenderedText joins every text block, like upstream`s string `+=`', () => {
    expect(readRenderedText({
      content: [
        { type: 'text', text: 'a' },
        { type: 'image', data: 'x' },
        { type: 'text', text: 'b' },
      ],
    })).toBe('ab')
    expect(readRenderedText({})).toBe('')
    expect(readRenderedText({ content: 'not-an-array' })).toBe('')
  })
})

describe('P3-T14 listener — fail-open waterfall behaviour', () => {
  it('① returns the rewrite WITHOUT delegating when the result is an edit failure', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    const text = DSH_EDIT_ERROR_TEXTS[1]!
    const decision = await listener(editExec(), textResult(text), next)
    expect(decision).toEqual({
      kind: 'accept',
      content: [{ type: 'text', text: `${text}\n${EDIT_ERROR_REMINDER}` }],
    })
    expect(calls()).toBe(0)
  })

  it('② delegates for a non-edit tool and for a clean edit result', async () => {
    const { listener } = registerAndCapture()
    const first = nextDouble()
    expect(await listener(editExec('read'), textResult(DSH_EDIT_ERROR_TEXTS[0]!), first.next))
      .toBe(NEXT_RESULT)
    expect(first.calls()).toBe(1)
    const second = nextDouble()
    expect(await listener(editExec(), textResult('The file a.ts has been updated successfully.'), second.next))
      .toBe(NEXT_RESULT)
    expect(second.calls()).toBe(1)
  })

  it('③ a throw inside the decision delegates instead of turning the result into an isError', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    // A getter that throws is the realistic hazard: every other check here is
    // total, so this is how a fail-open regression would surface.
    const hostile = {
      isError: true,
      get content(): Array<{ type: string; text: string }> {
        throw new Error('frozen payload exploded')
      },
    }
    expect(await listener(editExec(), hostile, next)).toBe(NEXT_RESULT)
    expect(calls()).toBe(1)
  })

  it('④ a downstream rejection propagates once and is never retried (same as T5/T7)', async () => {
    const { listener } = registerAndCapture()
    const next = vi.fn(async () => {
      throw new Error('downstream no')
    })
    await expect(listener(editExec('read'), textResult('x'), next)).rejects.toThrowError('downstream no')
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('P3-T14 registrar — wiring to the manifest row', () => {
  it('① registers exactly one tools/post-execute listener and returns no disposer', () => {
    const row = editRow()
    expect(row.event).toBe(EDIT_ERROR_RECOVERY_EVENT)
    expect(row.mode).toBe('D')
    expect(row.status).toBe('ported')
    expect(row.e2eScenario).toBe('edit-error-recovery-reminder')
    const { ctx, onCalls } = fakeContext()
    expect(registerEditErrorRecovery(ctx, row)).toBeUndefined()
    expect(onCalls).toHaveLength(1)
    expect(onCalls[0].event).toBe('tools/post-execute')
  })
})
