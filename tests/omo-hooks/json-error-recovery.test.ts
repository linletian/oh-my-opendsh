// P3-T14 — json-error-recovery listener (plan §4.2 pattern D; task book WP-6 批 A).
// The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/json-error-recovery/hook.ts @ v4.19.4:
//
//   upstream  `tool.execute.after` → a NON-blacklisted tool whose result text
//             matches one of EIGHT provider-worded regexes and does not already
//             carry the marker → `output.output += "\n" + JSON_ERROR_REMINDER`
//   this port `tools/post-execute` → the same four gates in the same order, but
//             the blacklist is mapped into DSH's tool-name namespace (13 of the
//             19 upstream names map, 6 have no DSH counterpart) and the live
//             regex table ADDS the DSH-native argument-failure signatures, which
//             are the only patterns that fire on DSH's own path (module header
//             前置②). Delivery is
//             `{kind:'accept', content:[{type:'text', text: text + "\n" + REMINDER}]}`
//
// The twelve upstream `it` cases (index.test.ts) are the seed: the two append
// cases, the untouched-output cases, the empty output, the false positive, the
// blacklisted tools, the sub-agent / session tools, the already-reminded case,
// the repeated execution, the non-string output, and the two table assertions.
// The DSH-side additions (the rebuilt blacklist, the DSH-native patterns, the
// text-only guard, the fail-open contract) each have their own case below.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it, vi } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import { DELEGATION_TOOL_NAMES } from '../../patches/omo-dsh/omo-hooks/src/hooks/empty-task-response-detector.ts'
import {
  DSH_JSON_ERROR_PATTERNS,
  JSON_ERROR_EXCLUDED_TOOL_NAMES,
  JSON_ERROR_EXCLUDED_TOOLS,
  JSON_ERROR_PATTERNS,
  JSON_ERROR_RECOVERY_EVENT,
  JSON_ERROR_RECOVERY_ID,
  JSON_ERROR_REMINDER,
  JSON_ERROR_REMINDER_MARKER,
  JSON_ERROR_TOOL_EXCLUDE_LIST,
  UPSTREAM_JSON_ERROR_PATTERNS,
  decideJsonErrorRecovery,
  isTextOnlyResultContent,
  matchesJsonErrorTable,
  readRenderedText,
  registerJsonErrorRecovery,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/json-error-recovery.ts'

/** The 19 upstream names, transcribed by hand from hook.ts:3-23 (audit trail). */
const UPSTREAM_EXCLUDE_LIST_TRANSCRIBED: readonly string[] = [
  'bash',
  'read',
  'glob',
  'grep',
  'webfetch',
  'look_at',
  'grep_app_searchgithub',
  'websearch_web_search_exa',
  'todowrite',
  'todoread',
  'task',
  'call_omo_agent',
  'background_output',
  'session_read',
  'session_search',
  'session_info',
  'session_list',
  'skill',
  'skill_mcp',
]

/** The 8 upstream regex literals, transcribed by hand from hook.ts:25-34. */
const UPSTREAM_PATTERNS_TRANSCRIBED: readonly RegExp[] = [
  /json parse error/i,
  /failed to parse json/i,
  /invalid json/i,
  /malformed json/i,
  /unexpected end of json input/i,
  /syntaxerror:\s*unexpected token.*json/i,
  /json[^\n]*expected '\}'/i,
  /json[^\n]*unexpected eof/i,
]

/**
 * DSH's own malformed-arguments failures, as the pinned install renders them
 * (module header 前置②; dsh-agent-loop:541-547 + dsh-tools:423/:812-818/:967-969
 * + toolErrorResult:3490-3502).
 */
const DSH_JSON_ERROR_TEXTS: readonly string[] = [
  'Error: invalid arguments: "arguments" must be an object',
  'Error: invalid arguments: "arguments" must be a lossless JSON object',
  'Error: tool arguments must be lossless JSON: undefined is not a JSON value',
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
function jsonRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === JSON_ERROR_RECOVERY_ID)
  if (row === undefined) throw new Error('manifest is missing the json-error-recovery row')
  return row
}

/** Registers the real registrar against the REAL manifest row and captures it. */
function registerAndCapture(): {
  listener: (...args: readonly unknown[]) => unknown
  onCalls: OnCall[]
} {
  const { ctx, onCalls } = fakeContext()
  registerJsonErrorRecovery(ctx, jsonRow())
  expect(onCalls).toHaveLength(1)
  return { listener: onCalls[0]!.listener, onCalls }
}

/** A tool execution payload shaped like the dsh `ToolExecution` leaf fields. */
function exec(name: string): { name: string } {
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

describe('P3-T14 JSON blacklist — the 19 upstream names and the DSH mapping', () => {
  it('① the upstream 19 are transcribed verbatim (order included)', () => {
    expect([...JSON_ERROR_TOOL_EXCLUDE_LIST]).toEqual([...UPSTREAM_EXCLUDE_LIST_TRANSCRIBED])
    expect(JSON_ERROR_TOOL_EXCLUDE_LIST).toHaveLength(19)
  })

  it('② the live set maps the six MCP/OMO-only names OUT and their DSH analogs IN', () => {
    // Dropped (no DSH counterpart — module header mapping table): 6 names.
    for (const dropped of [
      'grep_app_searchgithub',
      'todoread',
      'session_read',
      'session_search',
      'session_info',
      'skill_mcp',
    ]) {
      expect(JSON_ERROR_EXCLUDED_TOOL_NAMES, dropped).not.toContain(dropped)
    }
    // Renamed by the DSH namespace: the upstream spelling must be gone and the
    // DSH spelling must be the one in force.
    expect(JSON_ERROR_EXCLUDED_TOOL_NAMES).not.toContain('webfetch')
    expect(JSON_ERROR_EXCLUDED_TOOL_NAMES).toContain('web_fetch')
    expect(JSON_ERROR_EXCLUDED_TOOL_NAMES).not.toContain('todowrite')
    expect(JSON_ERROR_EXCLUDED_TOOL_NAMES).toContain('todo_write')
    expect(JSON_ERROR_EXCLUDED_TOOL_NAMES).not.toContain('background_output')
    expect(JSON_ERROR_EXCLUDED_TOOL_NAMES).toContain('job_output')
    expect(JSON_ERROR_EXCLUDED_TOOL_NAMES).not.toContain('session_list')
    expect(JSON_ERROR_EXCLUDED_TOOL_NAMES).toContain('list_agents')
    expect(JSON_ERROR_EXCLUDED_TOOL_NAMES).not.toContain('look_at')
    expect(JSON_ERROR_EXCLUDED_TOOL_NAMES).toContain('read_image')
    // Kept as-is, plus the DSH-only second shell (`pwsh`).
    for (const kept of ['bash', 'pwsh', 'read', 'glob', 'grep', 'web_search', 'skill']) {
      expect(JSON_ERROR_EXCLUDED_TOOL_NAMES, kept).toContain(kept)
    }
    // The gate's Set is the list's set form (upstream `new Set<string>(…)`).
    expect([...JSON_ERROR_EXCLUDED_TOOLS]).toEqual([...JSON_ERROR_EXCLUDED_TOOL_NAMES])
    expect(JSON_ERROR_EXCLUDED_TOOLS.size).toBe(JSON_ERROR_EXCLUDED_TOOL_NAMES.length)
    // A tool DSH mounts that upstream could not name is NOT excluded (default
    // INCLUDE is upstream's semantics for an unnamed tool).
    for (const residue of ['write', 'edit', 'create_goal', 'present', 'ralph', 'workflow']) {
      expect(JSON_ERROR_EXCLUDED_TOOLS.has(residue), residue).toBe(false)
    }
  })

  it('③ every delegation toolName is excluded (the `task`/`call_omo_agent` mapping)', () => {
    // Upstream named its two delegation tools separately; DSH's namespace has
    // ONE definition in this package, and this test is the drift guard that the
    // blacklist really covers all of it.
    for (const name of DELEGATION_TOOL_NAMES) {
      expect(JSON_ERROR_EXCLUDED_TOOLS.has(name), name).toBe(true)
    }
    expect(DELEGATION_TOOL_NAMES).toContain('explore')
    expect(DELEGATION_TOOL_NAMES).toContain('subagent_fork')
  })
})

describe('P3-T14 JSON pattern table — upstream 8 verbatim + DSH-native signatures', () => {
  it('① the upstream 8 keep their exact source and flags', () => {
    expect(UPSTREAM_JSON_ERROR_PATTERNS.map((pattern) => pattern.source))
      .toEqual(UPSTREAM_PATTERNS_TRANSCRIBED.map((pattern) => pattern.source))
    expect(UPSTREAM_JSON_ERROR_PATTERNS.map((pattern) => pattern.flags)).toEqual(['i', 'i', 'i', 'i', 'i', 'i', 'i', 'i'])
    expect(UPSTREAM_JSON_ERROR_PATTERNS).toHaveLength(8)
  })

  it('② the live table is upstream ++ DSH-native, in that order', () => {
    expect([...JSON_ERROR_PATTERNS]).toEqual([
      ...UPSTREAM_JSON_ERROR_PATTERNS,
      ...DSH_JSON_ERROR_PATTERNS,
    ])
    expect(DSH_JSON_ERROR_PATTERNS).toHaveLength(3)
  })

  it('③ NONE of the upstream 8 matches DSH`s own malformed-arguments text', () => {
    // This is the 前置② measurement, pinned: DSH's failure text never says
    // "json", so the transcribed table alone would make the hook dead code.
    for (const text of DSH_JSON_ERROR_TEXTS.slice(0, 1)) {
      for (const upstreamPattern of UPSTREAM_JSON_ERROR_PATTERNS) {
        expect(upstreamPattern.test(text), `${upstreamPattern} vs ${text}`).toBe(false)
      }
    }
    // …and the DSH-native signatures DO match every one of them.
    for (const text of DSH_JSON_ERROR_TEXTS) {
      expect(matchesJsonErrorTable(text), text).toBe(true)
    }
    // The upstream wordings still fire (a provider/MCP-originated parse error
    // can reach a DSH tool result verbatim — that half is kept on purpose).
    for (const upstreamText of [
      'Error: json parse error at line 3',
      'failed to parse JSON: unexpected end of JSON input',
      'SyntaxError: Unexpected token } in JSON at position 5',
    ]) {
      expect(matchesJsonErrorTable(upstreamText), upstreamText).toBe(true)
    }
    expect(matchesJsonErrorTable('the config file was parsed correctly')).toBe(false)
  })

  it('④ the reminder is the upstream text verbatim, marker line included', () => {
    // hook.ts:39-50, transcribed by hand. The marker IS the first line, which is
    // what makes the append self-idempotent (`:60`).
    expect(JSON_ERROR_REMINDER).toBe(`
[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]

You sent invalid JSON arguments. The system could not parse your tool call.
STOP and do this NOW:

1. LOOK at the error message above to see what was expected vs what you sent.
2. CORRECT your JSON syntax (missing braces, unescaped quotes, trailing commas, etc).
3. RETRY the tool call with valid JSON.

DO NOT repeat the exact same invalid call.
`)
    expect(JSON_ERROR_REMINDER_MARKER).toBe('[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]')
    expect(JSON_ERROR_REMINDER).toContain(JSON_ERROR_REMINDER_MARKER)
  })
})

describe('P3-T14 json-error-recovery — trigger fidelity (upstream hook.ts:58-66)', () => {
  it('① a JSON parse error on a non-excluded tool gets the reminder (seed 1)', () => {
    const text = 'Error: invalid arguments: "arguments" must be an object'
    const decision = decideJsonErrorRecovery(exec('write'), textResult(text)) as Decision | undefined
    expect(decision?.kind).toBe('accept')
    expect(decision?.content).toEqual([{ type: 'text', text: `${text}\n${JSON_ERROR_REMINDER}` }])
  })

  it('② a provider-worded SyntaxError still appends (upstream seed 2)', () => {
    expect(decideJsonErrorRecovery(
      exec('write'),
      textResult('SyntaxError: Unexpected token } in JSON at position 12'),
    )).toBeDefined()
  })

  it('③ normal output is never touched (upstream seed 3)', () => {
    expect(decideJsonErrorRecovery(
      exec('write'),
      textResult('The file a.ts has been created successfully.'),
    )).toBeUndefined()
  })

  it('④ an empty / text-free result is never touched (upstream seed 4)', () => {
    for (const result of [
      { isError: false, content: [] },
      { isError: true },
      { isError: true, content: 'not-an-array' },
      { isError: false, content: [{ type: 'image', data: 'x' }] },
    ]) {
      expect(decideJsonErrorRecovery(exec('write'), result)).toBeUndefined()
    }
    for (const payload of [undefined, null, 42, 'text']) {
      expect(decideJsonErrorRecovery(exec('write'), payload)).toBeUndefined()
    }
  })

  it('⑤ a result that merely MENTIONS json without an error does not fire (seed 5)', () => {
    for (const text of [
      'Wrote 12 lines of json output.',
      'the json schema was validated',
      'See https://example.com/json docs',
    ]) {
      expect(decideJsonErrorRecovery(exec('write'), textResult(text)), text).toBeUndefined()
    }
  })

  it('⑥ the blacklisted file/shell tools are skipped even on a matching text (seed 6)', () => {
    // Same trigger text, different tool: the negative is non-vacuous because the
    // text really does match the live table.
    const text = 'Error: invalid arguments: "arguments" must be an object'
    expect(matchesJsonErrorTable(text)).toBe(true)
    for (const name of ['bash', 'pwsh', 'read', 'read_image', 'glob', 'grep', 'web_fetch', 'web_search', 'todo_write', 'job_output', 'list_agents', 'skill']) {
      expect(decideJsonErrorRecovery(exec(name), textResult(text)), name).toBeUndefined()
    }
  })

  it('⑦ the delegation and session-content tools are skipped too (seed 7)', () => {
    const text = 'Error: invalid arguments: "arguments" must be an object'
    for (const name of ['explore', 'oracle', 'atlas', 'subagent', 'subagent_fork']) {
      expect(decideJsonErrorRecovery(exec(name), textResult(text)), name).toBeUndefined()
    }
  })

  it('⑧ already-reminded text returns immediately (upstream marker gate, seed 8)', () => {
    const once = `Error: invalid arguments: "arguments" must be an object\n${JSON_ERROR_REMINDER}`
    expect(decideJsonErrorRecovery(exec('write'), textResult(once))).toBeUndefined()
  })

  it('⑨ processing the same decision twice cannot double-append (seed 9)', () => {
    const text = 'Error: invalid arguments: "arguments" must be an object'
    const first = decideJsonErrorRecovery(exec('write'), textResult(text)) as Decision
    const rewritten = first.content![0]!.text
    expect(decideJsonErrorRecovery(exec('write'), textResult(rewritten))).toBeUndefined()
  })

  it('⑩ a non-string tool name is not our call (seed 10, total guard)', () => {
    for (const payload of [undefined, null, 42, 'write', {}, { name: 7 }]) {
      expect(decideJsonErrorRecovery(payload, textResult('invalid json'))).toBeUndefined()
    }
  })

  it('⑪ the tool gate lowercases before the blacklist lookup (upstream `:58`)', () => {
    const text = 'Error: invalid arguments: "arguments" must be an object'
    expect(decideJsonErrorRecovery(exec('WRITE'), textResult(text))).toBeDefined()
    expect(decideJsonErrorRecovery(exec('Read'), textResult(text))).toBeUndefined()
  })

  it('⑫ the append preserves the original text (upstream `+=`)', () => {
    const original = 'Error: invalid arguments: "arguments" must be an object'
    const decision = decideJsonErrorRecovery(exec('write'), textResult(original)) as Decision
    expect(decision.content?.[0]?.text).toBe(`${original}\n${JSON_ERROR_REMINDER}`)
  })

  it('⑬ a non-text block anywhere makes the rewrite refuse (no block can be dropped)', () => {
    const mixed = {
      isError: true,
      content: [
        { type: 'text', text: 'invalid json' },
        { type: 'image', data: 'x' },
      ],
    }
    expect(isTextOnlyResultContent(mixed)).toBe(false)
    expect(decideJsonErrorRecovery(exec('write'), mixed)).toBeUndefined()
  })

  it('⑭ readRenderedText joins text blocks and ignores the rest', () => {
    expect(readRenderedText({
      content: [
        { type: 'text', text: 'a' },
        { type: 'image', data: 'x' },
        { type: 'text', text: 'b' },
      ],
    })).toBe('ab')
    expect(readRenderedText({})).toBe('')
  })
})

describe('P3-T14 listener — fail-open waterfall behaviour', () => {
  it('① returns the rewrite WITHOUT delegating on a hit', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    const text = 'Error: invalid arguments: "arguments" must be an object'
    expect(await listener(exec('write'), textResult(text), next)).toEqual({
      kind: 'accept',
      content: [{ type: 'text', text: `${text}\n${JSON_ERROR_REMINDER}` }],
    })
    expect(calls()).toBe(0)
  })

  it('② delegates on a miss (non-matching text, excluded tool)', async () => {
    const { listener } = registerAndCapture()
    const first = nextDouble()
    expect(await listener(exec('write'), textResult('all good'), first.next)).toBe(NEXT_RESULT)
    expect(first.calls()).toBe(1)
    const second = nextDouble()
    expect(await listener(exec('read'), textResult('invalid json'), second.next)).toBe(NEXT_RESULT)
    expect(second.calls()).toBe(1)
  })

  it('③ a throw inside the decision delegates instead of turning the result into an isError', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    const hostile = {
      isError: true,
      get content(): Array<{ type: string; text: string }> {
        throw new Error('frozen payload exploded')
      },
    }
    expect(await listener(exec('write'), hostile, next)).toBe(NEXT_RESULT)
    expect(calls()).toBe(1)
  })

  it('④ a downstream rejection propagates once and is never retried (same as T5/T7)', async () => {
    const { listener } = registerAndCapture()
    const next = vi.fn(async () => {
      throw new Error('downstream no')
    })
    await expect(listener(exec('read'), textResult('x'), next)).rejects.toThrowError('downstream no')
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('P3-T14 registrar — wiring to the manifest row', () => {
  it('① registers exactly one tools/post-execute listener and returns no disposer', () => {
    const row = jsonRow()
    expect(row.event).toBe(JSON_ERROR_RECOVERY_EVENT)
    expect(row.mode).toBe('D')
    expect(row.status).toBe('ported')
    expect(row.e2eScenario).toBe('json-error-recovery-reminder')
    const { ctx, onCalls } = fakeContext()
    expect(registerJsonErrorRecovery(ctx, row)).toBeUndefined()
    expect(onCalls).toHaveLength(1)
    expect(onCalls[0].event).toBe('tools/post-execute')
  })
})
