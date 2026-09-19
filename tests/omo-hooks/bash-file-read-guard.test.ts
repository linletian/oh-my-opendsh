// P3-T5 — bash-file-read-guard listener (plan §4.2 pattern C pilot; task book
// WP-2). The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/bash-file-read-guard.ts @ v4.19.4:
//
//   upstream  `tool.execute.before` → `output.message = WARNING_MESSAGE`
//             (non-blocking advisory shown with the result)
//   this port `tools/post-execute`  → `{ kind: 'accept',
//             additionalContexts: [advisory user message] }`
//             (command still runs; advisory rides the NEXT request)
//
// The regex fidelity cases below are transcribed from upstream's
// FILE_READ_PATTERNS by hand — a test that derived them from the module under
// test would agree with any drift, which is the exact failure mode this suite
// exists to catch.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it, vi } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  BASH_FILE_READ_GUARD_EVENT,
  BASH_FILE_READ_GUARD_ID,
  BASH_FILE_READ_GUARD_PLUGIN,
  FILE_READ_PATTERNS,
  WARNING_MESSAGE,
  buildAdvisoryMessage,
  isSimpleFileReadCommand,
  registerBashFileReadGuard,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/bash-file-read-guard.ts'

/** The upstream message, transcribed by hand from the v4.19.4 file. */
const EXPECTED_ADVISORY_TEXT =
  'Prefer the read tool over cat/head/tail for reading file contents. '
  + 'The read tool provides line numbers for precise editing.'

/** One recorded `ctx.on` call — the registration observable. */
interface OnCall {
  readonly event: string
  readonly listener: (...args: readonly unknown[]) => unknown
}

/** The decision shape this listener may return, widened for inspection. */
interface Decision {
  kind: string
  additionalContexts?: Array<{
    id: string
    role: string
    content: Array<{ type: string; text: string }>
    source: { kind: string; plugin: string; form: string }
  }>
}

/** A fake cordis context that records registrations (same shape as T3's fake). */
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
function bashRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === BASH_FILE_READ_GUARD_ID)
  if (row === undefined) throw new Error('manifest is missing the bash-file-read-guard row')
  return row
}

/**
 * Registers the real registrar against the REAL manifest row and returns the
 * captured listener. Going through registerBashFileReadGuard (not a hand-built
 * listener) is what proves the registration channel and the event wiring.
 */
function registerAndCapture(): { listener: (...args: readonly unknown[]) => unknown; onCalls: OnCall[] } {
  const { ctx, onCalls } = fakeContext()
  registerBashFileReadGuard(ctx, bashRow())
  expect(onCalls).toHaveLength(1)
  return { listener: onCalls[0]!.listener, onCalls }
}

/** A bash execution payload shaped like the dsh `ToolExecution` leaf fields. */
function bashExec(command: unknown): { name: string; arguments: unknown } {
  return { name: 'bash', arguments: { command } }
}

/** The value `next()` resolves to — a sentinel so "delegated verbatim" is checkable. */
const NEXT_RESULT = Object.freeze({ kind: 'accept' })

/** A `next` double that records calls and resolves to the sentinel. */
function nextDouble(): { next: () => Promise<unknown>; calls: () => number } {
  const next = vi.fn(async () => NEXT_RESULT)
  return { next, calls: () => next.mock.calls.length }
}

/** Runs the captured listener and returns its decision cast for inspection. */
async function run(
  listener: (...args: readonly unknown[]) => unknown,
  exec: unknown,
  next: () => Promise<unknown>,
): Promise<unknown> {
  return await listener(exec, { isError: false, content: [] }, next)
}

describe('P3-T5 bash-file-read-guard — FILE_READ_PATTERNS fidelity (upstream v4.19.4)', () => {
  it('① declares exactly the three upstream patterns, in upstream order', () => {
    // Byte-for-byte transcription check: the source strings ARE the contract.
    expect(FILE_READ_PATTERNS.map((pattern) => pattern.source)).toEqual([
      '^\\s*cat\\s+(?!-)[^\\s|&;]+\\s*$',
      '^\\s*head\\s+(-n\\s+\\d+\\s+)?(?!-)[^\\s|&;]+\\s*$',
      '^\\s*tail\\s+(-n\\s+\\d+\\s+)?(?!-)[^\\s|&;]+\\s*$',
    ])
  })

  it('① matches each simple read form, including the `-n N` head/tail variants', () => {
    const matches = [
      'cat file.txt',
      'cat   file.txt',
      '  cat file.txt  ',
      'cat ./nested/file.txt',
      'head file.txt',
      'head -n 3 file.txt',
      'head  -n  10  file.txt',
      'tail file.txt',
      'tail -n 3 file.txt',
      'tail  -n  10  file.txt',
    ]
    for (const command of matches) {
      expect(isSimpleFileReadCommand(command), command).toBe(true)
    }
  })

  // Negative cases, one per class the upstream patterns must refuse:
  //   pipelines (1: `|`), options other than `-n N` (3: cat -n / head -3 /
  //   tail -f), redirection (2: `>`), shell chaining (2: `&&` / `;`), a bare
  //   operand-less `cat` (1), and multi-operand reads (1: `cat a.txt b.txt`).
  // The last two are upstream's `[^\s|&;]+` single-operand class plus the
  // `\s*$` anchor: a bare command has no operand to match and a second file is
  // a second token.
  it('① rejects pipelines, options other than -n N, redirection, shell chaining, a bare operand-less cat and multi-operand reads', () => {
    const nonMatches = [
      'cat file.txt | grep x',
      'cat -n file.txt',
      'head -3 file.txt',
      'tail -f file.txt',
      'cat > file.txt',
      'cat file.txt && echo done',
      'echo hi; cat file.txt',
      'cat',
      'cat a.txt b.txt',
      'cat file.txt > out.txt',
    ]
    for (const command of nonMatches) {
      expect(isSimpleFileReadCommand(command), command).toBe(false)
    }
  })
})

describe('P3-T5 bash-file-read-guard — registration + decision shape', () => {
  it('② registers ONE listener on the manifest row event tools/post-execute', () => {
    const { onCalls } = registerAndCapture()
    expect(onCalls[0]!.event).toBe(BASH_FILE_READ_GUARD_EVENT)
    expect(onCalls[0]!.event).toBe(bashRow().event)
    expect(onCalls[0]!.event).toBe('tools/post-execute')
  })

  it('③ a simple bash read returns accept with EXACTLY one advisory context', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    const decision = (await run(listener, bashExec('cat file.txt'), next)) as Decision
    expect(decision.kind).toBe('accept')
    expect(decision.additionalContexts).toHaveLength(1)
    // The command still runs: the advisory rides alongside the result, and the
    // waterfall is NOT delegated for this call (mode C short-circuit).
    expect(calls()).toBe(0)
  })

  it('③ the advisory message honors the role / content / source contract', async () => {
    const { listener } = registerAndCapture()
    const { next } = nextDouble()
    const decision = (await run(listener, bashExec('head -n 3 file.txt'), next)) as Decision
    const message = decision.additionalContexts![0]!
    expect(message.role).toBe('user')
    expect(message.content).toEqual([{ type: 'text', text: EXPECTED_ADVISORY_TEXT }])
    expect(message.source).toEqual({
      kind: 'plugin',
      plugin: BASH_FILE_READ_GUARD_PLUGIN,
      form: 'notice',
    })
    expect(message.source).toEqual({ kind: 'plugin', plugin: 'omo-hooks', form: 'notice' })
  })

  it('③ the advisory text is upstream’s minus the hashline clause, verbatim', () => {
    // The one intentional wording change (DSH read has no hashline anchors —
    // Phase 6): pinned as a literal so a "helpful" reword cannot slip in.
    expect(WARNING_MESSAGE).toBe(EXPECTED_ADVISORY_TEXT)
    expect(WARNING_MESSAGE).not.toContain('hash anchors')
    // The upstream first sentence is preserved word-for-word.
    expect(WARNING_MESSAGE.startsWith(
      'Prefer the read tool over cat/head/tail for reading file contents.',
    )).toBe(true)
  })

  it('⑥ mints a fresh message id on every invocation', async () => {
    const { listener } = registerAndCapture()
    const first = (await run(listener, bashExec('cat a.txt'), nextDouble().next)) as Decision
    const second = (await run(listener, bashExec('cat b.txt'), nextDouble().next)) as Decision
    const idA = first.additionalContexts![0]!.id
    const idB = second.additionalContexts![0]!.id
    expect(idA).not.toBe(idB)
    expect(idA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(buildAdvisoryMessage().id).not.toBe(idA)
  })
})

describe('P3-T5 bash-file-read-guard — non-triggering calls delegate verbatim', () => {
  const delegated: readonly (readonly [string, unknown])[] = [
    ['pipeline: cat file | grep x', bashExec('cat file.txt | grep x')],
    ['option: cat -n file', bashExec('cat -n file.txt')],
    ['redirect: cat > file', bashExec('cat > file.txt')],
    ['non-string command', bashExec(42)],
    ['missing command field', { name: 'bash', arguments: { description: 'ls' } }],
    ['non-object arguments', { name: 'bash', arguments: 'cat file.txt' }],
    ['non-bash tool: read', { name: 'read', arguments: { command: 'cat file.txt' } }],
    ['non-bash tool: write', { name: 'write', arguments: { command: 'cat file.txt' } }],
  ]

  it('④ delegates with the SAME value next() resolved, exactly once', async () => {
    const { listener } = registerAndCapture()
    for (const [label, exec] of delegated) {
      const { next, calls } = nextDouble()
      const result = await run(listener, exec, next)
      expect(result, label).toBe(NEXT_RESULT)
      expect(calls(), label).toBe(1)
    }
  })
})

describe('P3-T5 bash-file-read-guard — fail-open discipline ② (post-execute R-9)', () => {
  it('⑤ swallows a throwing payload accessor and delegates instead of erroring', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    // Reading `exec.arguments` throws — exactly the class of fault that, if it
    // escaped a post-execute listener, would replace a SUCCESSFUL bash result
    // with an isError (discipline ②).
    const exploding = {
      name: 'bash',
      get arguments(): unknown {
        throw new Error('payload accessor exploded')
      },
    }
    const result = await run(listener, exploding, next)
    expect(result).toBe(NEXT_RESULT)
    expect(calls()).toBe(1)
  })

  it('⑤ swallows a throwing `command` getter the same way', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    const exploding = {
      name: 'bash',
      arguments: {
        get command(): unknown {
          throw new TypeError('command getter exploded')
        },
      },
    }
    const result = await run(listener, exploding, next)
    expect(result).toBe(NEXT_RESULT)
    expect(calls()).toBe(1)
  })

  it('⑤ does not re-invoke next() when a downstream delegation rejects', async () => {
    const { listener } = registerAndCapture()
    // A truthful failure from downstream must propagate ONCE, not be caught as
    // "our own fault" and retried (the reason next() sits outside the try).
    const next = vi.fn(async () => {
      throw new Error('downstream failed')
    })
    await expect(run(listener, bashExec('cat file.txt | grep x'), next))
      .rejects.toThrow('downstream failed')
    expect(next).toHaveBeenCalledTimes(1)
  })
})
