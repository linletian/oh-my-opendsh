// P3-T15 — task-resume-info listener (plan §4.2 pattern D; task book WP-6 批 B).
// The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/task-resume-info/ @ v4.19.4:
//
//   upstream  `tool.execute.after` → OMO task-family tool gate → `Error:`/`Failed`
//             and existing-`to continue:` guards → `extractTaskLink(metadata, text)`
//             → `output.output = text.trimEnd() + "\n\nto continue: task(task_id=…)"`
//   this port `tools/post-execute` → the same gates, the id from the DSH subagent
//             value (continuable `subagentId`) with the DSH text render as the
//             fallback, and the DSH continuation call
//             `send_message(agent_id="…", message="…")`
//
// The SEVEN upstream `it` cases (index.test.ts) are the seed and appear as cases
// ①–⑦ below: the undefined-output crash guard, the non-target tool, the session id
// in the text, the two assertions on the append shape (`run_in_background`, the id
// echoed), the metadata-object branch, the `Error:` branch and the
// already-continued branch. The remaining cases are the DSH side: the structured
// `value` branch, the background/foreground kinds, the text fallback, the gate
// parity, the rewrite audit and the fail-open listener contract.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it, vi } from 'vitest'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import { DELEGATION_TOOL_NAMES } from '../../patches/omo-dsh/omo-hooks/src/hooks/agent-usage-reminder.ts'
import {
  DSH_CONTINUABLE_TEXT_PREFIX,
  TASK_RESUME_CONTINUATION_MARKER,
  TASK_RESUME_ERROR_PREFIXES,
  TASK_RESUME_INFO_EVENT,
  TASK_RESUME_INFO_ID,
  TASK_RESUME_TARGET_TOOLS,
  UPSTREAM_TASK_RESUME_TARGET_TOOLS,
  buildTaskResumeHint,
  decideTaskResumeInfo,
  readTaskResumeLinkFromText,
  readTaskResumeLinkFromValue,
  readTrimmedStringField,
  registerTaskResumeInfo,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/task-resume-info.ts'
import { readRenderedText } from '../../patches/omo-dsh/omo-hooks/src/hooks/tool-output-truncator.ts'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'

/** A successful subagent result: the rendered text plus the structured value. */
function subagentResult(value: unknown, text?: string): object {
  const rendered = text ?? (
    isRecordWithKind(value) && value.kind === 'continuable'
      ? `${DSH_CONTINUABLE_TEXT_PREFIX}${String(value.subagentId)}`
      : isRecordWithKind(value) && value.kind === 'background'
        ? `started background subagent job ${String(value.jobId)}`
        : 'child output text'
  )
  return { isError: false, value, content: [{ type: 'text', text: rendered }] }
}

function isRecordWithKind(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && 'kind' in (value as object)
}

/** A tool result with one text block and no structured value. */
function textResult(text: string): object {
  return { isError: false, content: [{ type: 'text', text }] }
}

function execFixture(name: string): object {
  return { name, arguments: {}, agent: { session: { id: 'session-1' } } }
}

function fakeContext(): {
  ctx: HooksRegistrationContext
  listeners: Map<string, (...args: readonly unknown[]) => unknown>
} {
  const listeners = new Map<string, (...args: readonly unknown[]) => unknown>()
  return {
    listeners,
    ctx: {
      on(event, listener) {
        listeners.set(event, listener)
        return () => {}
      },
    },
  }
}

const MANIFEST_ROW = { event: TASK_RESUME_INFO_EVENT } as never

/**
 * The REAL manifest row (P3-T15 review MINOR-2): the sibling T14 modules pin
 * their row's `e2eScenario` name so a rename can never drift away from the
 * scenario the driver really prints; this row gets the same guard.
 */
function taskResumeManifestRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === TASK_RESUME_INFO_ID)
  if (row === undefined) throw new Error('manifest is missing the task-resume-info row')
  return row
}

describe('P3-T15 task-resume-info — the seven upstream cases', () => {
  it('① a result with NO output at all does not crash and is left alone (upstream MCP `undefined` case)', () => {
    expect(decideTaskResumeInfo(execFixture('subagent'), {})).toBeUndefined()
    expect(decideTaskResumeInfo(execFixture('subagent'), { isError: false })).toBeUndefined()
    // Upstream's `output.output ?? ""` reads the SAME thing as an empty render.
    expect(readRenderedText({ isError: false, content: [{ type: 'text', text: '' }] })).toBe('')
  })

  it('② a non-target tool is never touched', () => {
    for (const name of ['read', 'grep', 'edit', 'bash', 'job_output', 'send_message']) {
      expect(decideTaskResumeInfo(execFixture(name), subagentResult({ kind: 'continuable', subagentId: 'sa-1' })))
        .toBeUndefined()
    }
  })

  it('③ a continuable delegation result gets the continuation tip appended', () => {
    const decision = decideTaskResumeInfo(
      execFixture('subagent'),
      subagentResult({ kind: 'continuable', subagentId: 'sa-abc123' }),
    )
    const text = readRenderedText(decision)
    expect(text).toContain(TASK_RESUME_CONTINUATION_MARKER)
    expect(text).toContain('send_message(agent_id="sa-abc123"')
    expect(text).toContain('sa-abc123')
  })

  it('④ the tip carries the whole DSH continuation call, not OMO\'s arguments', () => {
    const decision = decideTaskResumeInfo(
      execFixture('subagent'),
      subagentResult({ kind: 'continuable', subagentId: 'sa-abc123' }),
    )
    const text = readRenderedText(decision)
    expect(text).toContain('message="..."')
    expect(text.endsWith('send_message(agent_id="sa-abc123", message="...")')).toBe(true)
    // The three OMO-only argument names must NOT survive anywhere in the tip.
    expect(text).not.toContain('task_id')
    expect(text).not.toContain('load_skills')
    expect(text).not.toContain('run_in_background')
    expect(text).not.toContain('task(')
  })

  it('⑤ the structured value is the PRIMARY id source (upstream\'s metadata branch)', () => {
    // The text deliberately says something ELSE, so only the value can explain a
    // successful append — and the rendered text is fully rebuilt from the value.
    const decision = decideTaskResumeInfo(
      execFixture('explore'),
      subagentResult({ kind: 'continuable', subagentId: 'sa-from-value' }, 'started subagent sa-from-text'),
    )
    const text = readRenderedText(decision)
    expect(text).toContain('send_message(agent_id="sa-from-value"')
  })

  it('⑥ an `Error:` result is left alone (upstream gate 2)', () => {
    expect(decideTaskResumeInfo(
      execFixture('subagent'),
      subagentResult({ kind: 'continuable', subagentId: 'sa-1' }, 'Error: delegation failed'),
    )).toBeUndefined()
    expect(decideTaskResumeInfo(
      execFixture('subagent'),
      textResult('Error: something went wrong'),
    )).toBeUndefined()
  })

  it('⑦ an already-continued result gets NO second tip (upstream gate 3)', () => {
    const first = decideTaskResumeInfo(
      execFixture('subagent'),
      subagentResult({ kind: 'continuable', subagentId: 'sa-abc123' }),
    )
    const once = readRenderedText(first)
    // Feed the rewritten text back (same value): the marker gate stops the second.
    const second = decideTaskResumeInfo(
      execFixture('subagent'),
      subagentResult({ kind: 'continuable', subagentId: 'sa-abc123' }, once),
    )
    expect(second).toBeUndefined()
    expect(once.match(/to continue:/g)?.length).toBe(1)
  })
})

describe('P3-T15 task-resume-info — the DSH gates, kinds and fallbacks', () => {
  it('⑧ the `Failed` prefix is RETAINED by transcription (OMO wording, no DSH producer)', () => {
    expect(TASK_RESUME_ERROR_PREFIXES).toEqual(['Error:', 'Failed'])
    expect(decideTaskResumeInfo(
      execFixture('subagent'),
      subagentResult({ kind: 'continuable', subagentId: 'sa-1' }, 'Failed to delegate'),
    )).toBeUndefined()
  })

  it('⑨ the BACKGROUND kind gets nothing (upstream parsed `backgroundTaskId` and never used it)', () => {
    const decision = decideTaskResumeInfo(
      execFixture('subagent'),
      subagentResult({ kind: 'background', jobId: 'job-42' }),
    )
    expect(decision).toBeUndefined()
    // Recognized, so the text fallback is NOT consulted (upstream's early return).
    expect(readTaskResumeLinkFromValue({ kind: 'background', jobId: 'job-42' }))
      .toEqual({ recognized: true, link: {} })
    expect(readTaskResumeLinkFromValue({ kind: 'foreground', runId: 'r', output: [] }))
      .toEqual({ recognized: true, link: {} })
  })

  it('⑩ the FOREGROUND kind gets nothing — even when the child\'s own text looks like an id', () => {
    const decision = decideTaskResumeInfo(
      execFixture('subagent'),
      subagentResult(
        { kind: 'foreground', runId: 'r1', output: [] },
        `${DSH_CONTINUABLE_TEXT_PREFIX}sa-not-mine`,
      ),
    )
    expect(decision).toBeUndefined()
  })

  it('⑪ the TEXT fallback works when the value is not a recognizable subagent value', () => {
    expect(decideTaskResumeInfo(
      execFixture('subagent'),
      textResult(`${DSH_CONTINUABLE_TEXT_PREFIX}sa-from-text`),
    )).toBeDefined()
    expect(readTaskResumeLinkFromText(`x\n${DSH_CONTINUABLE_TEXT_PREFIX}sa-1\ny`)).toEqual({ subagentId: 'sa-1' })
    expect(readTaskResumeLinkFromText('no id here')).toEqual({})
    expect(readTaskResumeLinkFromValue({ kind: 'unknown' })).toEqual({ recognized: false, link: {} })
    expect(readTaskResumeLinkFromValue(undefined)).toEqual({ recognized: false, link: {} })
    // An empty/whitespace id is no id (upstream `readString` trims).
    expect(readTaskResumeLinkFromValue({ kind: 'continuable', subagentId: '   ' }))
      .toEqual({ recognized: true, link: {} })
  })

  it('⑫ the tool gate IS the shared DSH delegation surface (one source, two modules)', () => {
    expect(TASK_RESUME_TARGET_TOOLS).toBe(DELEGATION_TOOL_NAMES)
    expect(TASK_RESUME_TARGET_TOOLS).toContain('subagent')
    expect(TASK_RESUME_TARGET_TOOLS).toContain('subagent_fork')
    expect(TASK_RESUME_TARGET_TOOLS).toContain('explore')
    // Upstream's list is the audit trail and is retained verbatim.
    expect(UPSTREAM_TASK_RESUME_TARGET_TOOLS).toEqual(['task', 'Task', 'task_tool', 'call_omo_agent'])
    // Case-SENSITIVE, like upstream's `Array.includes` (DSH ids are lowercase).
    expect(decideTaskResumeInfo(
      execFixture('Task'),
      textResult(`${DSH_CONTINUABLE_TEXT_PREFIX}sa-1`),
    )).toBeUndefined()
  })

  it('⑬ a non-text-only result is left alone', () => {
    const withImage = {
      isError: false,
      value: { kind: 'continuable', subagentId: 'sa-1' },
      content: [{ type: 'text', text: 'x' }, { type: 'image', data: 'y' }],
    }
    expect(decideTaskResumeInfo(execFixture('subagent'), withImage)).toBeUndefined()
  })

  it('⑭ the append preserves upstream\'s `trimEnd()` and the leading blank line', () => {
    const decision = decideTaskResumeInfo(
      execFixture('subagent'),
      subagentResult({ kind: 'continuable', subagentId: 'sa-1' }, `${DSH_CONTINUABLE_TEXT_PREFIX}sa-1\n\n\n`),
    )
    expect(readRenderedText(decision)).toBe(
      `${DSH_CONTINUABLE_TEXT_PREFIX}sa-1${buildTaskResumeHint('sa-1')}`,
    )
  })

  it('⑮ `readTrimmedStringField` is total on hostile payloads', () => {
    expect(readTrimmedStringField({ a: '  x  ' }, 'a')).toBe('x')
    expect(readTrimmedStringField({ a: '' }, 'a')).toBeUndefined()
    expect(readTrimmedStringField({ a: 7 }, 'a')).toBeUndefined()
    expect(readTrimmedStringField(undefined, 'a')).toBeUndefined()
  })
})

describe('P3-T15 task-resume-info — registration + fail-open listener', () => {
  it('⑯ registers exactly ONE surface (upstream `hook.ts:24-26` had one too, and the module is stateless)', () => {
    const { ctx, listeners } = fakeContext()
    expect(registerTaskResumeInfo(ctx, MANIFEST_ROW)).toBeUndefined()
    expect([...listeners.keys()]).toEqual([TASK_RESUME_INFO_EVENT])
    expect(TASK_RESUME_INFO_ID).toBe('task-resume-info')
  })

  it('⑰ the manifest row pins the real e2eScenario name (T13 MINOR-2 guard)', () => {
    expect(taskResumeManifestRow().e2eScenario).toBe('task-resume-info-appended')
  })

  it('⑱ the listener returns the rewrite, delegates when not ours, and fails OPEN', async () => {
    const { ctx, listeners } = fakeContext()
    registerTaskResumeInfo(ctx, MANIFEST_ROW)
    const listener = listeners.get(TASK_RESUME_INFO_EVENT) as (
      exec: unknown, result: unknown, next: () => Promise<unknown>,
    ) => Promise<unknown>

    const next = vi.fn(async () => 'delegated')
    const decision = await listener(
      execFixture('subagent'),
      subagentResult({ kind: 'continuable', subagentId: 'sa-1' }),
      next,
    )
    expect(decision).toMatchObject({ kind: 'accept' })
    expect(next).not.toHaveBeenCalled()

    await expect(listener(execFixture('read'), textResult('x'), next)).resolves.toBe('delegated')

    // Our own logic throwing must NOT replace a successful tool result with an
    // isError — the listener delegates instead.
    const poisoned = new Proxy({}, {
      get() {
        throw new Error('poisoned execution')
      },
    })
    await expect(listener(poisoned, textResult('x'), next)).resolves.toBe('delegated')
    expect(next).toHaveBeenCalledTimes(2)
  })
})
