// P3-T15 — agent-usage-reminder listener (plan §4.2 pattern D; task book
// WP-6 批 B). The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/agent-usage-reminder/ @ v4.19.4:
//
//   upstream  `tool.execute.after` → orchestrator-agent gate → a `task`-family
//             call flips `agentUsed` → a search/fetch call appends
//             `REMINDER_MESSAGE` while `reminderCount < 3`
//   this port `tools/post-execute` → the same ORDER, with the orchestrator gate
//             re-expressed as "can THIS agent's scope see a delegation tool?"
//             (module header 前置①), DSH tool lists (前置②), the DSH-rewritten
//             reminder text (前置③) and D-mode delivery
//
// The four upstream `test` cases (index.test.ts 3 + storage.test.ts 1) are the
// seed for the trigger/mark/cap behaviour; the DSH-side cases cover the capability
// gate, the text rewrite audit, the two registered surfaces and the fail-open
// listener contract.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it, vi } from 'vitest'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  AGENT_USAGE_REMINDER_DISPOSED_EVENT,
  AGENT_USAGE_REMINDER_EVENT,
  AGENT_USAGE_REMINDER_ID,
  DELEGATION_TOOL_NAMES,
  MAX_REMINDERS,
  REMINDER_MESSAGE,
  REMINDER_MESSAGE_MARKER,
  TARGET_TOOLS,
  UPSTREAM_DELEGATION_TOOL_NAMES,
  UPSTREAM_REMINDER_MESSAGE,
  UPSTREAM_TARGET_TOOLS,
  buildDelegationCapabilityReader,
  createAgentUsageReminder,
  readExecutionAgent,
  readExecutionSession,
  readToolName,
  registerAgentUsageReminder,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/agent-usage-reminder.ts'
import { readRenderedText } from '../../patches/omo-dsh/omo-hooks/src/hooks/tool-output-truncator.ts'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'

/** A session fixture (the state is keyed by this OBJECT). */
function sessionFixture(id = 'session-1'): object {
  return { id, header: { cwd: '/work' } }
}

/** The `tools/post-execute` execution fixture. */
function execFixture(session: unknown, name: string, agent: unknown = { session }): object {
  return { name, arguments: {}, agent }
}

function textResult(text: string): object {
  return { isError: false, content: [{ type: 'text', text }] }
}

/** A fake ctx that records every `ctx.on` registration. */
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

const MANIFEST_ROW = { event: AGENT_USAGE_REMINDER_EVENT } as never

/**
 * The REAL manifest row (P3-T15 review MINOR-2): the sibling T14 modules pin
 * their row's `e2eScenario` name so a rename can never drift away from the
 * scenario the driver really prints; this row gets the same guard.
 */
function agentUsageReminderManifestRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === AGENT_USAGE_REMINDER_ID)
  if (row === undefined) throw new Error('manifest is missing the agent-usage-reminder row')
  return row
}

describe('P3-T15 agent-usage-reminder — the trigger, the mark and the cap', () => {
  it('① appends the reminder VERBATIM to a target tool result (append, not replace)', () => {
    const session = sessionFixture()
    const reminder = createAgentUsageReminder()

    const decision = reminder.decide(execFixture(session, 'grep'), textResult('grep output'))

    expect(decision).toMatchObject({ kind: 'accept' })
    const text = readRenderedText(decision)
    expect(text).toBe(`grep output${REMINDER_MESSAGE}`)
    expect(text.startsWith('grep output')).toBe(true)
    expect(text.endsWith(REMINDER_MESSAGE)).toBe(true)
    expect(text).toContain(REMINDER_MESSAGE_MARKER)
    expect(reminder.stateOf(session)).toEqual({ agentUsed: false, reminderCount: 1 })
  })

  it('② fires for EVERY DSH target tool and for NO other tool', () => {
    expect(TARGET_TOOLS).toEqual(['grep', 'glob', 'web_fetch', 'web_search'])
    for (const tool of TARGET_TOOLS) {
      const session = sessionFixture(`session-${tool}`)
      const reminder = createAgentUsageReminder()
      expect(reminder.decide(execFixture(session, tool), textResult('x'))).toBeDefined()
      expect(reminder.decide(execFixture(session, 'read'), textResult('x'))).toBeUndefined()
      expect(reminder.decide(execFixture(session, 'bash'), textResult('x'))).toBeUndefined()
      expect(reminder.decide(execFixture(session, 'job_output'), textResult('x'))).toBeUndefined()
    }
  })

  it('③ the tool match is lowercase-normalized (upstream `tool.toLowerCase()`)', () => {
    const session = sessionFixture()
    const reminder = createAgentUsageReminder()
    expect(reminder.decide(execFixture(session, 'GREP'), textResult('x'))).toBeDefined()
    expect(reminder.decide(execFixture(session, 'Web_Search'), textResult('x'))).toBeDefined()
  })

  it('④ a delegation call marks the session USED and appends nothing (upstream `markAgentUsed`)', () => {
    const session = sessionFixture()
    const reminder = createAgentUsageReminder()

    for (const tool of DELEGATION_TOOL_NAMES) {
      const sessionForTool = sessionFixture(`session-${tool}`)
      expect(reminder.decide(execFixture(sessionForTool, tool), textResult('delegated'))).toBeUndefined()
      expect(reminder.stateOf(sessionForTool)).toEqual({ agentUsed: true, reminderCount: 0 })
    }

    // The mark is PERMANENT for the session: a later target tool stays untouched.
    reminder.decide(execFixture(session, 'explore'), textResult('delegated'))
    expect(reminder.decide(execFixture(session, 'grep'), textResult('grep output'))).toBeUndefined()
    expect(reminder.stateOf(session)).toEqual({ agentUsed: true, reminderCount: 0 })
  })

  it('⑤ caps the reminder at MAX_REMINDERS = 3 and never re-arms', () => {
    const session = sessionFixture()
    const reminder = createAgentUsageReminder()

    const first = reminder.decide(execFixture(session, 'grep'), textResult('1'))
    const second = reminder.decide(execFixture(session, 'grep'), textResult('2'))
    const third = reminder.decide(execFixture(session, 'grep'), textResult('3'))
    const fourth = reminder.decide(execFixture(session, 'grep'), textResult('4'))

    expect([first, second, third].every((decision) => decision !== undefined)).toBe(true)
    expect(fourth).toBeUndefined()
    expect(MAX_REMINDERS).toBe(3)
    expect(reminder.stateOf(session)).toEqual({ agentUsed: false, reminderCount: 3 })

    // The upstream pair are the audit trail for the live pair.
    expect(UPSTREAM_TARGET_TOOLS).toHaveLength(10)
    expect(UPSTREAM_DELEGATION_TOOL_NAMES).toEqual(['task', 'call_omo_agent', 'task'])
  })

  it('⑥ keeps the state PER SESSION OBJECT and re-arms only on `session/disposed`', () => {
    const first = sessionFixture('session-a')
    const second = sessionFixture('session-b')
    const reminder = createAgentUsageReminder()

    reminder.decide(execFixture(first, 'grep'), textResult('1'))
    reminder.decide(execFixture(first, 'grep'), textResult('2'))
    reminder.decide(execFixture(first, 'grep'), textResult('3'))
    expect(reminder.decide(execFixture(first, 'grep'), textResult('4'))).toBeUndefined()

    // A DIFFERENT session has its own counter.
    expect(reminder.decide(execFixture(second, 'grep'), textResult('1'))).toBeDefined()

    // Upstream's `resetState` (session.deleted) — the DSH analog.
    reminder.onSessionDisposed(first)
    expect(reminder.stateOf(first)).toBeUndefined()
    expect(reminder.decide(execFixture(first, 'grep'), textResult('1'))).toBeDefined()
    expect(reminder.stateOf(first)).toEqual({ agentUsed: false, reminderCount: 1 })

    // Hostile payloads are inert.
    expect(() => reminder.onSessionDisposed(undefined)).not.toThrow()
    expect(() => reminder.onSessionDisposed('not-a-session')).not.toThrow()
  })

  it('⑦ does NOT re-arm on a compaction (upstream test: "does not re-arm after session.compacted")', () => {
    const session = sessionFixture()
    const reminder = createAgentUsageReminder()
    reminder.decide(execFixture(session, 'grep'), textResult('1'))
    reminder.decide(execFixture(session, 'grep'), textResult('2'))
    reminder.decide(execFixture(session, 'grep'), textResult('3'))

    // There is NO compaction listener to call: the ONLY auxiliary surface this
    // module registers is `session/disposed` (asserted structurally in ⑫). The
    // state therefore cannot be reset by a compaction at all.
    const { ctx, listeners } = fakeContext()
    registerAgentUsageReminder(ctx, MANIFEST_ROW)
    expect([...listeners.keys()]).toEqual([AGENT_USAGE_REMINDER_EVENT, AGENT_USAGE_REMINDER_DISPOSED_EVENT])
    expect(reminder.decide(execFixture(session, 'grep'), textResult('4'))).toBeUndefined()
    expect(reminder.stateOf(session)).toEqual({ agentUsed: false, reminderCount: 3 })
  })

  it('⑧ a non-text-only result is left alone AND does not consume the cap', () => {
    const session = sessionFixture()
    const reminder = createAgentUsageReminder()
    const withImage = {
      isError: false,
      content: [{ type: 'text', text: 'x' }, { type: 'image', data: 'y' }],
    }
    expect(reminder.decide(execFixture(session, 'grep'), withImage)).toBeUndefined()
    expect(reminder.stateOf(session)).toEqual({ agentUsed: false, reminderCount: 0 })
    expect(reminder.decide(execFixture(session, 'grep'), textResult('x'))).toBeDefined()
  })
})

describe('P3-T15 agent-usage-reminder — the orchestrator gate (header 前置①)', () => {
  it('⑨ a session that CANNOT delegate gets nothing and marks nothing', () => {
    const session = sessionFixture()
    const canDelegate = vi.fn(() => false)
    const reminder = createAgentUsageReminder({ canDelegate })

    expect(reminder.decide(execFixture(session, 'grep'), textResult('x'))).toBeUndefined()
    // Upstream's gate sat BEFORE `markAgentUsed`, so a delegation target that
    // somehow calls a delegation tool must not flip its own state either.
    expect(reminder.decide(execFixture(session, 'explore'), textResult('x'))).toBeUndefined()
    expect(reminder.stateOf(session)).toBeUndefined()
    expect(canDelegate).toHaveBeenCalledTimes(2)
  })

  it('⑩ an UNKNOWN capability proceeds, exactly like upstream\'s unknown agent name', () => {
    const session = sessionFixture()
    const reminder = createAgentUsageReminder({ canDelegate: () => undefined })
    expect(reminder.decide(execFixture(session, 'grep'), textResult('x'))).toBeDefined()
  })

  it('⑪ `buildDelegationCapabilityReader` reads the tools registry in the EXECUTION\'s agent scope', () => {
    const agent = { session: sessionFixture() }
    const exec = { name: 'grep', arguments: {}, agent }
    const seen: Array<{ name: string; scope: unknown }> = []
    const tools = {
      get(name: string, scope: unknown) {
        seen.push({ name, scope })
        return name === 'explore' ? { name } : undefined
      },
    }
    const reader = buildDelegationCapabilityReader({
      on: () => () => {},
      get: (service: string) => (service === 'tools' ? tools : undefined),
    })
    expect(reader(exec)).toBe(true)
    expect(seen[0]).toEqual({ name: DELEGATION_TOOL_NAMES[0], scope: agent })

    // No delegation tool in scope ⇒ false (the delegation TARGET case).
    const childReader = buildDelegationCapabilityReader({
      on: () => () => {},
      get: () => ({ get: () => undefined }),
    })
    expect(childReader(exec)).toBe(false)

    // Every degraded shape is "unknown", never "cannot".
    expect(buildDelegationCapabilityReader({ on: () => () => {} })(exec)).toBeUndefined()
    expect(buildDelegationCapabilityReader({ on: () => () => {}, get: () => undefined })(exec)).toBeUndefined()
    expect(buildDelegationCapabilityReader({ on: () => () => {}, get: () => ({}) })(exec)).toBeUndefined()
    expect(buildDelegationCapabilityReader({ on: () => () => {}, get: () => tools })({ name: 'grep' })).toBeUndefined()
    expect(buildDelegationCapabilityReader({
      on: () => () => {},
      get: () => ({
        get: () => {
          throw new Error('registry exploded')
        },
      }),
    })(exec)).toBeUndefined()
  })

  it('⑫ the registered listener uses the capability gate end-to-end', () => {
    const { ctx, listeners } = fakeContext()
    const childCtx: HooksRegistrationContext = {
      on: ctx.on,
      get: (service: string) => (service === 'tools'
        ? { get: () => undefined }
        : undefined),
    }
    registerAgentUsageReminder(childCtx, MANIFEST_ROW)
    const listener = listeners.get(AGENT_USAGE_REMINDER_EVENT) as (
      exec: unknown, result: unknown, next: () => Promise<unknown>,
    ) => Promise<unknown>
    const next = vi.fn(async () => 'delegated')
    // The child scope sees no delegation tool ⇒ the listener delegates untouched.
    return expect(listener(execFixture(sessionFixture(), 'grep'), textResult('x'), next))
      .resolves.toBe('delegated')
      .then(() => {
        expect(next).toHaveBeenCalledTimes(1)
      })
  })
})

describe('P3-T15 agent-usage-reminder — the DSH text rewrite (header 前置③)', () => {
  it('⑬ the live text carries NO OMO tool signature, and the upstream text does', () => {
    expect(REMINDER_MESSAGE).not.toContain('task(')
    expect(REMINDER_MESSAGE).not.toContain('subagent_type')
    expect(REMINDER_MESSAGE).not.toContain('load_skills')
    expect(REMINDER_MESSAGE).not.toContain('task calls')
    // The DSH call shape and the DSH sentence replace them.
    expect(REMINDER_MESSAGE).toContain('explore(description="Find all files matching pattern X", prompt="Find all files matching pattern X")')
    expect(REMINDER_MESSAGE).toContain('explore(description="Search for implementation of Y", prompt="Search for implementation of Y")')
    expect(REMINDER_MESSAGE).toContain('librarian(description="Lookup documentation for Z", prompt="Lookup documentation for Z")')
    expect(REMINDER_MESSAGE).toContain('Use the explore/librarian delegation tools for better results:')
    expect(REMINDER_MESSAGE).toContain('ALWAYS prefer: Multiple parallel delegation calls > Direct tool calls')

    // The audit trail is upstream's bytes, exactly.
    expect(UPSTREAM_REMINDER_MESSAGE).toContain('task(subagent_type="explore", load_skills=[], prompt="Find all files matching pattern X")')
    expect(UPSTREAM_REMINDER_MESSAGE).toContain('ALWAYS prefer: Multiple parallel task calls > Direct tool calls')
  })

  it('⑭ the rewrite touches EXACTLY the five documented spans (everything else is verbatim)', () => {
    const upstream = UPSTREAM_REMINDER_MESSAGE
    const live = REMINDER_MESSAGE
    // Same line count: no line was added or removed.
    expect(live.split('\n')).toHaveLength(upstream.split('\n').length)
    // The untouched prose (leading blank line + heading + body + WHY list) is
    // byte-identical line for line.
    for (const line of [
      '',
      '[Agent Usage Reminder]',
      '',
      'You called a search/fetch tool directly without leveraging specialized agents.',
      '',
      '```',
      '// Parallel exploration - fire multiple agents simultaneously',
      '',
      '// Then continue your work while they run in background',
      '// System will notify you when each completes',
      '```',
      '',
      'WHY:',
      '- Agents can perform deeper, more thorough searches',
      '- Background tasks run in parallel, saving time',
      '- Specialized agents have domain expertise',
      '- Reduces context window usage in main session',
      '',
    ]) {
      expect(upstream).toContain(line)
      expect(live).toContain(line)
    }
    // And the five rewritten lines are exactly the differences.
    const diff = upstream.split('\n')
      .map((line, index) => (line === live.split('\n')[index] ? undefined : index))
      .filter((index) => index !== undefined)
    expect(diff).toEqual([5, 9, 10, 11, 23])
  })
})

describe('P3-T15 agent-usage-reminder — registration + fail-open listener', () => {
  it('⑮ registers the primary event plus `session/disposed` via ctx.on', () => {
    const { ctx, listeners } = fakeContext()
    expect(registerAgentUsageReminder(ctx, MANIFEST_ROW)).toBeUndefined()
    expect([...listeners.keys()]).toEqual([
      AGENT_USAGE_REMINDER_EVENT,
      AGENT_USAGE_REMINDER_DISPOSED_EVENT,
    ])
    expect(AGENT_USAGE_REMINDER_ID).toBe('agent-usage-reminder')
  })

  it('⑮b the manifest row pins the real e2eScenario name (T13 MINOR-2 guard)', () => {
    expect(agentUsageReminderManifestRow().e2eScenario).toBe('agent-usage-reminder-appended')
  })

  it('⑯ the listener delegates when not ours and fails OPEN when our own logic throws', async () => {
    const { ctx, listeners } = fakeContext()
    registerAgentUsageReminder(ctx, MANIFEST_ROW)
    const listener = listeners.get(AGENT_USAGE_REMINDER_EVENT) as (
      exec: unknown, result: unknown, next: () => Promise<unknown>,
    ) => Promise<unknown>

    const next = vi.fn(async () => 'delegated')
    // Not ours (an unrelated tool).
    await expect(listener(execFixture(sessionFixture(), 'read'), textResult('x'), next)).resolves.toBe('delegated')

    // Ours, but the execution is hostile: our gate throws, the listener still
    // delegates instead of turning a successful tool result into an isError.
    const poisoned = new Proxy({}, {
      get() {
        throw new Error('poisoned execution')
      },
    })
    await expect(listener(poisoned, textResult('x'), next)).resolves.toBe('delegated')
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('⑰ leaf readers are total on hostile payloads', () => {
    expect(readToolName({ name: 'Grep' })).toBe('grep')
    expect(readToolName({ name: 7 })).toBeUndefined()
    expect(readToolName(undefined)).toBeUndefined()
    expect(readExecutionAgent({ agent: {} })).toBeDefined()
    expect(readExecutionAgent({})).toBeUndefined()
    expect(readExecutionAgent('agent')).toBeUndefined()
    expect(readExecutionSession({ agent: {} })).toBeUndefined()
    expect(readExecutionSession(undefined)).toBeUndefined()
  })
})
