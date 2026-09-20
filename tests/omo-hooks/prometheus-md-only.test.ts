// P3-T16 — prometheus-md-only listener (plan §4.2 pattern B + D; task book
// WP-6 批 C). The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/prometheus-md-only/ @ v4.19.4:
//
//   upstream  `tool.execute.before` → identity gate → `throw` on a disallowed
//             path → `output.message += PROMETHEUS_WORKFLOW_REMINDER` on an
//             allowed `.omo/plans/` write
//   this port `tools/pre-execute`   → `{ kind: 'deny', reason }` (same message,
//             no throw) and `tools/post-execute` → append the reminder to the
//             allowed write's result
//
// The PATH-POLICY cases below are transcribed by hand from upstream's
// index.test.ts / path-policy.ts, and the denial text is the upstream string;
// a test that derived them from the module under test would agree with any
// drift, which is exactly what this suite exists to catch.
//
// THE IDENTITY CASES are the part with no upstream analog: upstream resolved
// the agent through its own session map / boulder state / message files, none
// of which exists on DSH. This port reads the child's own durable
// `subagent/descriptor.persona` (see the module header) — and case ⑥ below
// drift-guards the `omo-prometheus` anchor against the REAL persona file set,
// because that anchor IS the identity contract.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_PATH_PREFIX,
  BLOCKED_TOOLS,
  HOOK_NAME,
  PROMETHEUS_MD_ONLY_EVENT,
  PROMETHEUS_MD_ONLY_ID,
  PROMETHEUS_MD_ONLY_SECONDARY_EVENT,
  PROMETHEUS_PERSONA_ANCHOR,
  PROMETHEUS_PERSONA_FILE,
  PROMETHEUS_WORKFLOW_REMINDER,
  UPSTREAM_BLOCKED_TOOLS,
  buildPrometheusDenyReason,
  decidePrometheusMdOnlyDeny,
  decidePrometheusWorkflowReminder,
  handlePrometheusMdOnlyPostExecute,
  handlePrometheusMdOnlyPreExecute,
  isAllowedFile,
  isPlansPath,
  isPrometheusAgentName,
  isPrometheusSession,
  isWriteClassExecution,
  readChildPersona,
  readSessionCwd,
  readWriteTargetPath,
  registerPrometheusMdOnly,
  type CachedPersona,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/prometheus-md-only.ts'

/** One recorded `ctx.on` call — the registration observable. */
interface OnCall {
  readonly event: string
  readonly listener: (...args: readonly unknown[]) => unknown
}

/** The decision shapes this listener may return, widened for inspection. */
interface PreDecision {
  kind: string
  reason?: string
}

interface PostDecision {
  kind: string
  content?: Array<{ type: string; text: string }>
}

/** A fake cordis context that records registrations. */
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

/** The real manifest row — the registrar must read its primary event from the row. */
function prometheusRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === PROMETHEUS_MD_ONLY_ID)
  if (row === undefined) throw new Error('manifest is missing the prometheus-md-only row')
  return row
}

/** Registers the real registrar and returns the captured listeners by event. */
function registerAndCapture(): { onCalls: OnCall[]; listenerFor: (event: string) => OnCall } {
  const { ctx, onCalls } = fakeContext()
  registerPrometheusMdOnly(ctx, prometheusRow())
  return {
    onCalls,
    listenerFor: (event: string) => {
      const call = onCalls.find((candidate) => candidate.event === event)
      if (call === undefined) throw new Error(`registrar did not wire ${event}`)
      return call
    },
  }
}

/**
 * A fake live session: `ownEvents()` returns the descriptor log the real
 * `Session` would, `header.cwd` is the workspace root. `persona === null` means
 * "a descriptor exists but carries no persona"; `persona === undefined` means
 * "no descriptor at all" (a top-level conductor session).
 */
function fakeSession(options: {
  cwd?: string
  persona?: string | null
  extraEvents?: readonly unknown[]
} = {}): Record<string, unknown> {
  const events: unknown[] = [...(options.extraEvents ?? [])]
  if (options.persona !== undefined) {
    events.unshift({
      type: 'subagent/descriptor',
      data: {
        version: 3,
        mode: 'continuable',
        provider: 'spawn',
        label: 'plan the work',
        ...(options.persona === null ? {} : { persona: options.persona }),
      },
    })
  }
  events.push({ type: 'turn/start', data: {} })
  return {
    header: { cwd: options.cwd ?? '/workspace', id: 'ses_child' },
    ownEvents: () => events,
  }
}

/** A prometheus child session whose persona text carries the anchor. */
function prometheusSession(cwd = '/workspace'): Record<string, unknown> {
  return fakeSession({
    cwd,
    persona: `# Prometheus: Interview-Style Strategic Planner\nYou are **${PROMETHEUS_PERSONA_ANCHOR}**, a planning consultant.\n`,
  })
}

/** A non-prometheus delegation child (a sibling roster row's persona). */
function siblingSession(cwd = '/workspace'): Record<string, unknown> {
  return fakeSession({ cwd, persona: 'You are **omo-explore**, a fast codebase search agent.\n' })
}

/** A write-class execution payload shaped like the dsh `ToolExecution` leaves. */
function writeExec(
  name: string,
  args: Record<string, unknown>,
  session: unknown,
): Record<string, unknown> {
  return { name, arguments: args, callId: 'call-1', token: 'tok-1', agent: { session } }
}

/** The value `next()` resolves to — a sentinel so "delegated verbatim" is checkable. */
const NEXT_RESULT = Object.freeze({ kind: 'accept' })

/** A `next` double that records calls and resolves to the sentinel. */
function nextDouble(): { next: () => Promise<unknown>; calls: () => number } {
  const calls: number[] = []
  return {
    next: async () => {
      calls.push(1)
      return NEXT_RESULT
    },
    calls: () => calls.length,
  }
}

/** A fresh identity cache, the way the registrar owns one per registration. */
function cache(): WeakMap<object, CachedPersona> {
  return new WeakMap<object, CachedPersona>()
}

describe('P3-T16 prometheus-md-only — upstream constant fidelity (v4.19.4)', () => {
  it('① keeps the upstream hook name, extension and workspace subtree', () => {
    expect(HOOK_NAME).toBe('prometheus-md-only')
    expect(ALLOWED_EXTENSIONS).toEqual(['.md'])
    expect(ALLOWED_PATH_PREFIX).toBe('.omo')
  })

  it('① maps upstream’s four-name tool list onto DSH’s two canonical ids', () => {
    // Upstream enumerated both casings because opencode registers both; DSH's
    // registry is canonically lowercase (dsh-tool-fs:597/:742).
    expect(UPSTREAM_BLOCKED_TOOLS).toEqual(['Write', 'Edit', 'write', 'edit'])
    expect(BLOCKED_TOOLS).toEqual(['write', 'edit'])
    expect(isWriteClassExecution({ name: 'write' })).toBe(true)
    expect(isWriteClassExecution({ name: 'edit' })).toBe(true)
    expect(isWriteClassExecution({ name: 'Write' })).toBe(false)
    expect(isWriteClassExecution({ name: 'read' })).toBe(false)
    expect(isWriteClassExecution(null)).toBe(false)
  })

  it('① keeps upstream’s substring matcher only as an audit function', () => {
    expect(isPrometheusAgentName('Prometheus - Plan Builder')).toBe(true)
    expect(isPrometheusAgentName('PROMETHEUS')).toBe(true)
    expect(isPrometheusAgentName('prometheus-junior')).toBe(true) // the false-positive upstream had
    expect(isPrometheusAgentName('sisyphus')).toBe(false)
    expect(isPrometheusAgentName(undefined)).toBe(false)
  })

  it('① reads the DSH argument name first, then upstream’s three', () => {
    expect(readWriteTargetPath({ file_path: 'a.md' })).toBe('a.md')
    expect(readWriteTargetPath({ filePath: 'b.md' })).toBe('b.md')
    expect(readWriteTargetPath({ path: 'c.md' })).toBe('c.md')
    expect(readWriteTargetPath({ file: 'd.md' })).toBe('d.md')
    // DSH's name wins when both are present.
    expect(readWriteTargetPath({ file_path: 'dsh.md', filePath: 'upstream.md' })).toBe('dsh.md')
    expect(readWriteTargetPath({})).toBeUndefined()
    expect(readWriteTargetPath({ file_path: '' })).toBeUndefined()
    expect(readWriteTargetPath(null)).toBeUndefined()
  })
})

describe('P3-T16 prometheus-md-only — the path policy (upstream path-policy.ts)', () => {
  const root = '/workspace'

  it('② allows `.md` inside a `.omo` segment, relative or absolute', () => {
    expect(isAllowedFile('.omo/plans/plan.md', root)).toBe(true)
    expect(isAllowedFile('/workspace/.omo/plans/plan.md', root)).toBe(true)
    expect(isAllowedFile('.omo/drafts/note.md', root)).toBe(true)
  })

  it('② allows Windows separators, mixed separators and an upper-case extension', () => {
    expect(isAllowedFile('.omo\\plans\\plan.md', root)).toBe(true)
    expect(isAllowedFile('.omo\\plans/plan.md', root)).toBe(true)
    expect(isAllowedFile('.omo/plans/PLAN.MD', root)).toBe(true)
  })

  it('② rejects a non-`.md` file inside `.omo`', () => {
    expect(isAllowedFile('.omo/plans/plan.txt', root)).toBe(false)
    expect(isAllowedFile('.omo/plans/plan', root)).toBe(false)
    expect(isAllowedFile('.omo/plans/plan.md.bak', root)).toBe(false)
  })

  it('② rejects an `.md` file outside `.omo`', () => {
    expect(isAllowedFile('notes.md', root)).toBe(false)
    expect(isAllowedFile('/workspace/README.md', root)).toBe(false)
  })

  it('② rejects a path that escapes the workspace root', () => {
    expect(isAllowedFile('../.omo/plan.md', root)).toBe(false)
    expect(isAllowedFile('/tmp/.omo/plan.md', root)).toBe(false)
  })

  it('② requires a real `.omo` SEGMENT, not a substring', () => {
    expect(isAllowedFile('.omo-backup/plan.md', root)).toBe(false)
    expect(isAllowedFile('x.omo/plan.md', root)).toBe(false)
    expect(isAllowedFile('nested/.omo.md', root)).toBe(false)
  })
})

describe('P3-T16 prometheus-md-only — the identity surface', () => {
  it('③ reads the persona off the child’s own descriptor', () => {
    expect(readChildPersona(prometheusSession())).toContain(PROMETHEUS_PERSONA_ANCHOR)
    expect(readChildPersona(siblingSession())).toContain('omo-explore')
    expect(readChildPersona(fakeSession({ persona: null }))).toBeUndefined()
    expect(readChildPersona(fakeSession())).toBeUndefined()
    expect(readChildPersona(null)).toBeUndefined()
    // A session with no in-memory log at all is simply "not identifiable".
    expect(readChildPersona({ header: { cwd: '/w' } })).toBeUndefined()
  })

  it('③ identifies ONLY the prometheus persona, caching a found descriptor', () => {
    const identityCache = cache()
    const child = prometheusSession()
    expect(isPrometheusSession(child, identityCache)).toBe(true)
    expect(identityCache.has(child)).toBe(true)
    const sibling = siblingSession()
    expect(isPrometheusSession(sibling, identityCache)).toBe(false)
    expect(identityCache.has(sibling)).toBe(true)
    expect(isPrometheusSession(null, identityCache)).toBe(false)
  })

  it('③ stays SILENT for a one-shot child (the measured descriptor carries no persona)', () => {
    // dsh-subagent/lib/index.js:3150-3154 builds the foreground descriptor as
    // `snapshotSubagentDescriptor({mode:'one-shot', provider, label})` — the
    // one-shot schema has NO persona field, so a foreground prometheus
    // delegation cannot be identified. This is the measured coverage boundary
    // recorded in the module header, pinned here so it cannot be mistaken for
    // "identity always works".
    const oneShot = {
      header: { cwd: '/workspace', origin: 'subagent' },
      ownEvents: () => [
        {
          type: 'subagent/descriptor',
          data: { version: 3, mode: 'one-shot', provider: 'spawn', label: 'Draft the plan' },
        },
      ],
    }
    expect(readChildPersona(oneShot)).toBeUndefined()
    expect(isPrometheusSession(oneShot, cache())).toBe(false)
    expect(decidePrometheusMdOnlyDeny(
      writeExec('write', { file_path: 'src/index.ts' }, oneShot),
      cache(),
    )).toBeUndefined()
  })

  it('③ does NOT negative-cache a session without a descriptor (it may gain one)', () => {
    const identityCache = cache()
    const late: { header: { cwd: string }; events: unknown[]; ownEvents?: () => readonly unknown[] } = {
      header: { cwd: '/workspace' },
      events: [],
    }
    late.ownEvents = () => late.events
    expect(isPrometheusSession(late, identityCache)).toBe(false)
    expect(identityCache.has(late)).toBe(false)
    late.events.push({
      type: 'subagent/descriptor',
      data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'x', persona: PROMETHEUS_PERSONA_ANCHOR },
    })
    expect(isPrometheusSession(late, identityCache)).toBe(true)
  })

  it('③ reads the workspace root from the session header', () => {
    expect(readSessionCwd(prometheusSession('/w2'))).toBe('/w2')
    expect(readSessionCwd({ header: {} })).toBeUndefined()
    expect(readSessionCwd({})).toBeUndefined()
    expect(readSessionCwd(null)).toBeUndefined()
  })

  it('⑥ DRIFT GUARD: the anchor appears in exactly one shipped persona file', () => {
    const personaDir = join(
      process.cwd(),
      'patches/omo-dsh/omo-agents/system-sections',
    )
    const files = readdirSync(personaDir).filter((name) => name.endsWith('-persona.md'))
    expect(files.length).toBeGreaterThanOrEqual(10)
    const carriers = files.filter((name) =>
      readFileSync(join(personaDir, name), 'utf8').includes(PROMETHEUS_PERSONA_ANCHOR))
    expect(carriers).toEqual(['prometheus-persona.md'])
    // …and the constant really points at that file.
    expect(PROMETHEUS_PERSONA_FILE.endsWith('prometheus-persona.md')).toBe(true)
    expect(readFileSync(join(process.cwd(), PROMETHEUS_PERSONA_FILE), 'utf8'))
      .toContain(PROMETHEUS_PERSONA_ANCHOR)
  })
})

describe('P3-T16 prometheus-md-only — the B deny decision', () => {
  it('④ denies a non-.md write from the prometheus child with upstream’s message', () => {
    const session = prometheusSession()
    const exec = writeExec('write', { file_path: 'src/index.ts' }, session)
    const decision = decidePrometheusMdOnlyDeny(exec, cache()) as PreDecision | undefined
    expect(decision?.kind).toBe('deny')
    expect(decision?.reason).toBe(
      `[${HOOK_NAME}] Prometheus is a planning agent. File operations restricted to `
      + '.omo/*.md plan files only. '
      + 'Do NOT route this change through a subagent either - delegated implementation is still '
      + 'implementation. '
      + 'Record the intended change as a todo in the plan; implementation starts only in a '
      + 'separate execution session the caller opens. '
      + 'Attempted to modify: src/index.ts.',
    )
    // DSH materializes `Error: ${reason}`; the reason must not pre-empt that.
    expect(decision?.reason?.startsWith('Error: ')).toBe(false)
    expect(decision?.reason).toContain(`[${HOOK_NAME}]`)
  })

  it('④ denies an `edit` too, and an `.md` outside `.omo`', () => {
    expect(decidePrometheusMdOnlyDeny(
      writeExec('edit', { file_path: 'README.md' }, prometheusSession()),
      cache(),
    )?.kind).toBe('deny')
    expect(decidePrometheusMdOnlyDeny(
      writeExec('write', { path: 'notes.md' }, prometheusSession()),
      cache(),
    )?.kind).toBe('deny')
  })

  it('④ passes an allowed `.omo/*.md` write', () => {
    expect(decidePrometheusMdOnlyDeny(
      writeExec('write', { file_path: '.omo/plans/plan.md' }, prometheusSession()),
      cache(),
    )).toBeUndefined()
    expect(decidePrometheusMdOnlyDeny(
      writeExec('edit', { file_path: '.omo/plans/plan.md' }, prometheusSession('/workspace')),
      cache(),
    )).toBeUndefined()
  })

  it('④ passes every other agent: a sibling child, the conductor, a foreign session', () => {
    expect(decidePrometheusMdOnlyDeny(
      writeExec('write', { file_path: 'src/index.ts' }, siblingSession()),
      cache(),
    )).toBeUndefined()
    expect(decidePrometheusMdOnlyDeny(
      writeExec('write', { file_path: 'src/index.ts' }, fakeSession()),
      cache(),
    )).toBeUndefined()
    expect(decidePrometheusMdOnlyDeny(
      { name: 'write', arguments: { file_path: 'src/index.ts' } },
      cache(),
    )).toBeUndefined()
  })

  it('④ passes non-write tools and a missing path (upstream’s early returns)', () => {
    expect(decidePrometheusMdOnlyDeny(
      writeExec('read', { file_path: 'src/index.ts' }, prometheusSession()),
      cache(),
    )).toBeUndefined()
    expect(decidePrometheusMdOnlyDeny(
      writeExec('write', {}, prometheusSession()),
      cache(),
    )).toBeUndefined()
    // No cwd → the policy cannot be applied → delegate rather than guess.
    expect(decidePrometheusMdOnlyDeny(
      writeExec('write', { file_path: 'src/index.ts' }, fakeSession({ persona: PROMETHEUS_PERSONA_ANCHOR, cwd: '' })),
      cache(),
    )).toBeUndefined()
  })

  it('④ buildPrometheusDenyReason is stable', () => {
    expect(buildPrometheusDenyReason('a/b.ts')).toBe(buildPrometheusDenyReason('a/b.ts'))
    expect(buildPrometheusDenyReason('a/b.ts')).toContain('Attempted to modify: a/b.ts.')
  })
})

describe('P3-T16 prometheus-md-only — the D workflow reminder', () => {
  function result(text: string, isError = false): { isError: boolean; content: Array<{ type: string; text: string }> } {
    return { isError, content: [{ type: 'text', text }] }
  }

  it('⑤ appends the reminder after an allowed `.omo/plans/` write', () => {
    const exec = writeExec('write', { file_path: '.omo/plans/plan.md' }, prometheusSession())
    const decision = decidePrometheusWorkflowReminder(
      exec,
      result('wrote 12 bytes'),
      cache(),
    ) as PostDecision | undefined
    expect(decision?.kind).toBe('accept')
    expect(decision?.content?.[0]?.text).toBe(`wrote 12 bytes${PROMETHEUS_WORKFLOW_REMINDER}`)
    expect(PROMETHEUS_WORKFLOW_REMINDER).toContain('PROMETHEUS MANDATORY WORKFLOW REMINDER')
    // The Phase-4 command face and the delegation steps are NOT in the live text.
    expect(PROMETHEUS_WORKFLOW_REMINDER).not.toContain('/start-work')
    expect(PROMETHEUS_WORKFLOW_REMINDER).not.toContain('task(agent=')
  })

  it('⑤ appends it also to a FAILED allowed write (upstream attached pre-outcome)', () => {
    const exec = writeExec('write', { file_path: '.omo/plans/plan.md' }, prometheusSession())
    const decision = decidePrometheusWorkflowReminder(exec, result('Error: disk full', true), cache())
    expect(decision?.content?.[0]?.text).toContain('Error: disk full')
  })

  it('⑤ leaves a non-plans `.omo` write, another agent and a non-write tool alone', () => {
    expect(decidePrometheusWorkflowReminder(
      writeExec('write', { file_path: '.omo/drafts/note.md' }, prometheusSession()),
      result('ok'),
      cache(),
    )).toBeUndefined()
    // A path the B half DENIES (`.omo/plans/` but not `.md`) must not carry the
    // reminder either: upstream's policy check THREW before its reminder line, so
    // `isPlansPath` alone is not the gate. Without the path-policy re-check the D
    // half would append the reminder to its OWN deny text here.
    expect(isAllowedFile('.omo/plans/x.txt', '/workspace')).toBe(false)
    expect(decidePrometheusWorkflowReminder(
      writeExec('write', { file_path: '.omo/plans/x.txt' }, prometheusSession()),
      result(`Error: ${buildPrometheusDenyReason('.omo/plans/x.txt')}`, true),
      cache(),
    )).toBeUndefined()
    expect(decidePrometheusWorkflowReminder(
      writeExec('write', { file_path: '.omo/plans/plan.md' }, siblingSession()),
      result('ok'),
      cache(),
    )).toBeUndefined()
    expect(decidePrometheusWorkflowReminder(
      writeExec('read', { file_path: '.omo/plans/plan.md' }, prometheusSession()),
      result('ok'),
      cache(),
    )).toBeUndefined()
    expect(decidePrometheusWorkflowReminder(
      writeExec('write', { file_path: '.omo/plans/plan.md' }, prometheusSession()),
      { isError: false, content: [] },
      cache(),
    )).toBeUndefined()
  })

  it('⑤ is idempotent: an already-reminded result is left alone', () => {
    const exec = writeExec('write', { file_path: '.omo/plans/plan.md' }, prometheusSession())
    expect(decidePrometheusWorkflowReminder(
      exec,
      result(`ok${PROMETHEUS_WORKFLOW_REMINDER}`),
      cache(),
    )).toBeUndefined()
  })

  it('⑤ normalizes backslashes and case for the plans test (upstream verbatim)', () => {
    expect(isPlansPath('.omo/plans/x.md')).toBe(true)
    expect(isPlansPath('.OMO\\PLANS\\X.MD')).toBe(true)
    expect(isPlansPath('.omo/drafts/x.md')).toBe(false)
  })
})

describe('P3-T16 prometheus-md-only — listener bodies + registration', () => {
  it('⑥ the B listener returns an explicit deny (never a throw) and delegates otherwise', async () => {
    const identityCache = cache()
    const denied = nextDouble()
    const deny = await handlePrometheusMdOnlyPreExecute(
      writeExec('write', { file_path: 'src/index.ts' }, prometheusSession()),
      denied.next,
      identityCache,
    )
    expect((deny as PreDecision).kind).toBe('deny')
    expect(denied.calls()).toBe(0)

    const allowed = nextDouble()
    const pass = await handlePrometheusMdOnlyPreExecute(
      writeExec('write', { file_path: '.omo/plans/plan.md' }, prometheusSession()),
      allowed.next,
      identityCache,
    )
    expect(pass).toBe(NEXT_RESULT)
    expect(allowed.calls()).toBe(1)
  })

  it('⑥ FAILS OPEN on a throwing payload accessor instead of propagating (discipline ②)', async () => {
    const hostile = {
      get name(): string {
        throw new Error('boom')
      },
      arguments: {},
    }
    const pre = nextDouble()
    expect(await handlePrometheusMdOnlyPreExecute(hostile, pre.next, cache())).toBe(NEXT_RESULT)
    expect(pre.calls()).toBe(1)
    const post = nextDouble()
    expect(await handlePrometheusMdOnlyPostExecute(hostile, { isError: false, content: [] }, post.next, cache()))
      .toBe(NEXT_RESULT)
    expect(post.calls()).toBe(1)
  })

  it('⑥ wires BOTH decision surfaces plus the identity-cache reset', () => {
    const { onCalls } = registerAndCapture()
    expect(onCalls.map((call) => call.event)).toEqual([
      PROMETHEUS_MD_ONLY_EVENT,
      PROMETHEUS_MD_ONLY_SECONDARY_EVENT,
      'session/disposed',
    ])
    expect(prometheusRow().event).toBe(PROMETHEUS_MD_ONLY_EVENT)
    expect(prometheusRow().e2eScenario).toBe('prometheus-md-only-denied')
    expect(prometheusRow().status).toBe('ported')
  })

  it('⑥ the session/disposed listener resets the cache and swallows odd payloads', () => {
    const { listenerFor } = registerAndCapture()
    const dispose = listenerFor('session/disposed').listener
    const root = listenerFor(PROMETHEUS_MD_ONLY_EVENT).listener
    expect(typeof root).toBe('function')
    expect(() => dispose(null)).not.toThrow()
    expect(() => dispose('not-a-session')).not.toThrow()
    expect(() => dispose(prometheusSession())).not.toThrow()
  })
})
