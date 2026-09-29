// P3-T7 — empty-task-response-detector listener (plan §4.2 pattern D; task book
// WP-3). The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/empty-task-response-detector.ts @ v4.19.4:
//
//   upstream  `tool.execute.after` → `output.output = EMPTY_RESPONSE_WARNING`
//             (in-place result rewrite; tool name literal `Task` / `task`)
//   this port `tools/post-execute` → `{ kind: 'accept',
//             content: [{ type: 'text', text: EMPTY_RESPONSE_WARNING }] }`
//             (content replacement, applied by dsh-tools postExecute)
//
// The delegation tool-name set is the one place this port is a deliberate
// SUPERSET of the task book's stated set (the 10 roster ids): the pinned base
// composition also mounts `subagent` / `subagent_fork`. The first test below
// drift-guards the hand-copied 10 against the REAL roster export, so the copy
// cannot rot, and the second pins the documented superset so removing it is a
// deliberate edit rather than an accident.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it, vi } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import { DELEGATION_TOOL_NAMES as ROSTER_TOOL_NAMES_FROM_ROSTER } from '../../patches/omo-dsh/omo-agents/src/roster.ts'
import {
  BASE_SUBAGENT_TOOL_NAMES,
  DELEGATION_TOOL_NAMES,
  EMPTY_RESPONSE_WARNING,
  EMPTY_TASK_RESPONSE_DETECTOR_EVENT,
  EMPTY_TASK_RESPONSE_DETECTOR_ID,
  ROSTER_DELEGATION_TOOL_NAMES,
  decideEmptyTaskResponse,
  isDelegationExecution,
  readRenderedText,
  registerEmptyTaskResponseDetector,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/empty-task-response-detector.ts'

/** The upstream warning, transcribed by hand from the v4.19.4 file. */
const UPSTREAM_WARNING_PARTS: readonly string[] = [
  '[Task Empty Response Warning]',
  'The delegated task completed but returned no response.',
  'Note: The call has already completed',
  'you are NOT waiting for a response',
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

/** A fake cordis context that records registrations (same shape as T5's fake). */
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
function detectorRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === EMPTY_TASK_RESPONSE_DETECTOR_ID)
  if (row === undefined) throw new Error('manifest is missing the empty-task-response-detector row')
  return row
}

/**
 * Registers the real registrar against the REAL manifest row and returns the
 * captured listener, proving channel + event wiring rather than a hand-built
 * listener.
 */
function registerAndCapture(): {
  listener: (...args: readonly unknown[]) => unknown
  onCalls: OnCall[]
} {
  const { ctx, onCalls } = fakeContext()
  registerEmptyTaskResponseDetector(ctx, detectorRow())
  expect(onCalls).toHaveLength(1)
  return { listener: onCalls[0]!.listener, onCalls }
}

/** A delegation execution payload shaped like the dsh `ToolExecution` leaf fields. */
function delegationExec(name: string): { name: string } {
  return { name }
}

/** A successful result whose rendered content is one text block. */
function textResult(text: string): { isError: false; content: Array<{ type: string; text: string }> } {
  return { isError: false, content: [{ type: 'text', text }] }
}

/** The value `next()` resolves to — a sentinel so "delegated verbatim" is checkable. */
const NEXT_RESULT = Object.freeze({ kind: 'accept' })

/** A `next` double that records calls and resolves to the sentinel. */
function nextDouble(): { next: () => Promise<unknown>; calls: () => number } {
  const next = vi.fn(async () => NEXT_RESULT)
  return { next, calls: () => next.mock.calls.length }
}

describe('P3-T7 delegation tool-name set — the hand-copied roster subset', () => {
  it('① the transcribed 10 equal the REAL roster export (drift guard)', () => {
    // A copy, not an import, because plan §4.1 forbids an import edge between
    // omo-agents and omo-hooks — so THIS assertion is what keeps the copy
    // honest. Source: roster.ts `DELEGATION_TOOL_NAMES` (id == toolName).
    expect([...ROSTER_DELEGATION_TOOL_NAMES]).toEqual([...ROSTER_TOOL_NAMES_FROM_ROSTER])
    expect(ROSTER_DELEGATION_TOOL_NAMES).toHaveLength(10)
    expect(ROSTER_DELEGATION_TOOL_NAMES).toContain('explore')
    expect(ROSTER_DELEGATION_TOOL_NAMES).toContain('oracle')
    // The conductor has no delegation tool of its own (roster.ts CONDUCTOR_ID).
    expect(ROSTER_DELEGATION_TOOL_NAMES).not.toContain('sisyphus')
  })

  it('② pins the documented base-composition superset (subagent / subagent_fork)', () => {
    // dsh-base/cordis.patch.yml:349-365 mounts these two `dsh-tool-subagent`
    // instances; the empty-result disease is identical for them, so they are
    // detected too. Pinned as a separate list so arbitration can drop them.
    expect([...BASE_SUBAGENT_TOOL_NAMES]).toEqual(['subagent', 'subagent_fork'])
    expect([...DELEGATION_TOOL_NAMES]).toEqual([
      ...ROSTER_DELEGATION_TOOL_NAMES,
      ...BASE_SUBAGENT_TOOL_NAMES,
    ])
  })
})

describe('P3-T7 empty-task-response-detector — trigger fidelity (upstream :18-24)', () => {
  it('① detects an empty delegation result and returns the corrective content', () => {
    const decision = decideEmptyTaskResponse(
      delegationExec('explore'),
      textResult(''),
    ) as Decision | undefined
    expect(decision).toBeDefined()
    expect(decision?.kind).toBe('accept')
    expect(decision?.content).toEqual([{ type: 'text', text: EMPTY_RESPONSE_WARNING }])
  })

  it('② a whitespace-only result counts as empty (upstream `.trim()`)', () => {
    // `output.output?.trim() ?? ""` — "   \n" is empty upstream too.
    for (const blank of ['   ', '\n\t ', '\n\n']) {
      expect(decideEmptyTaskResponse(delegationExec('oracle'), textResult(blank))).toBeDefined()
    }
  })

  it('③ a result with no readable text block at all counts as empty', () => {
    // The dsh-tool-subagent render joins zero text blocks into an empty string
    // (lib/index.js:484-487), so "no content" and "empty content" are the same
    // failure; non-text blocks do not make the result non-empty.
    expect(decideEmptyTaskResponse(
      delegationExec('oracle'),
      { isError: false, content: [] },
    )).toBeDefined()
    expect(decideEmptyTaskResponse(
      delegationExec('oracle'),
      { isError: false, content: [{ type: 'image', data: 'x' }] },
    )).toBeDefined()
  })

  it('④ a non-empty result is left alone (delegated)', () => {
    expect(decideEmptyTaskResponse(delegationExec('explore'), textResult('here is the answer')))
      .toBeUndefined()
    // Whitespace AROUND real text is not emptiness.
    expect(decideEmptyTaskResponse(delegationExec('explore'), textResult('  answer  ')))
      .toBeUndefined()
  })

  it('⑤ covers every delegation tool name, and nothing else', () => {
    for (const name of DELEGATION_TOOL_NAMES) {
      expect(isDelegationExecution(delegationExec(name)), name).toBe(true)
      expect(decideEmptyTaskResponse(delegationExec(name), textResult('')), name).toBeDefined()
    }
    // Upstream's literals are `Task` / `task`; DSH's tools are lowercase ids, so
    // an unrelated tool (including a differently-cased name) is NOT our call.
    for (const name of ['bash', 'read', 'edit', 'Task', 'task', 'explore-extra', '']) {
      expect(isDelegationExecution(delegationExec(name)), name).toBe(false)
    }
  })

  it('⑥ skips isError results — DSH already attached the child diagnostic there', () => {
    // U-7(a): a non-`completed` stop reason is materialized as an isError with
    // the diagnostic + partial output BEFORE post-execute
    // (dsh-tool-subagent/lib/index.js:286-296). Replacing that content with the
    // warning would erase the failure reason.
    expect(decideEmptyTaskResponse(
      delegationExec('explore'),
      { isError: true, content: [] },
    )).toBeUndefined()
  })

  it('⑦ malformed exec / result payloads are not our call', () => {
    for (const exec of [undefined, null, 42, 'subagent', {}, { name: 7 }]) {
      expect(decideEmptyTaskResponse(exec, textResult(''))).toBeUndefined()
    }
    for (const result of [undefined, null, 42, 'text']) {
      expect(decideEmptyTaskResponse(delegationExec('explore'), result)).toBeUndefined()
    }
  })

  it('⑧ readRenderedText joins every text block and ignores non-text ones', () => {
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

describe('P3-T7 warning text — semantic port of the upstream constant (:3-10)', () => {
  it('① keeps every upstream clause it did not deliberately narrow', () => {
    for (const part of UPSTREAM_WARNING_PARTS) {
      expect(EMPTY_RESPONSE_WARNING, part).toContain(part)
    }
  })

  it('② drops the two isError-native bullets and makes the note actionable', () => {
    // U-7(a): "Failed to execute properly" / "Did not terminate correctly" are
    // isError outcomes in DSH, which this listener skips — advertising them here
    // would describe states this hook can never see.
    expect(EMPTY_RESPONSE_WARNING).not.toContain('Failed to execute properly')
    expect(EMPTY_RESPONSE_WARNING).not.toContain('Did not terminate correctly')
    // U-7(b): the note's wait semantics hold on DSH and are made actionable.
    expect(EMPTY_RESPONSE_WARNING).toContain('Do not wait for it.')
  })
})

describe('P3-T7 listener — fail-open waterfall behaviour', () => {
  it('① returns the corrective decision WITHOUT delegating when the result is empty', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    const decision = await listener(delegationExec('explore'), textResult(''), next)
    expect(decision).toEqual({
      kind: 'accept',
      content: [{ type: 'text', text: EMPTY_RESPONSE_WARNING }],
    })
    expect(calls()).toBe(0)
  })

  it('② delegates to next() for a non-empty result and for a non-delegation tool', async () => {
    const { listener } = registerAndCapture()
    const first = nextDouble()
    expect(await listener(delegationExec('explore'), textResult('answer'), first.next))
      .toBe(NEXT_RESULT)
    expect(first.calls()).toBe(1)
    const second = nextDouble()
    expect(await listener(delegationExec('bash'), textResult(''), second.next))
      .toBe(NEXT_RESULT)
    expect(second.calls()).toBe(1)
  })

  it('③ a throw inside the decision delegates instead of turning the result into an isError', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    // A getter that throws is the realistic hazard: every other check here is
    // total, so this is how a fail-open regression would surface.
    const hostile = {
      isError: false,
      get content(): Array<{ type: string; text: string }> {
        throw new Error('frozen payload exploded')
      },
    }
    expect(await listener(delegationExec('explore'), hostile, next)).toBe(NEXT_RESULT)
    expect(calls()).toBe(1)
  })

  it('④ a downstream rejection propagates once and is never retried (same as T5)', async () => {
    const { listener } = registerAndCapture()
    const next = vi.fn(async () => {
      throw new Error('downstream no')
    })
    await expect(listener(delegationExec('bash'), textResult('x'), next)).rejects
      .toThrowError('downstream no')
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('P3-T7 registrar — wiring to the manifest row', () => {
  it('① registers exactly one tools/post-execute listener and returns no disposer', () => {
    const row = detectorRow()
    expect(row.event).toBe(EMPTY_TASK_RESPONSE_DETECTOR_EVENT)
    expect(row.mode).toBe('D')
    const { ctx, onCalls } = fakeContext()
    expect(registerEmptyTaskResponseDetector(ctx, row)).toBeUndefined()
    expect(onCalls).toHaveLength(1)
    expect(onCalls[0].event).toBe('tools/post-execute')
  })
})
