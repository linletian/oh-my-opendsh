// P3-T14 — tool-output-truncator listener (plan §4.2 pattern D; task book WP-6 批 A).
// The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/tool-output-truncator.ts @ v4.19.4 plus the
// behavioural half of its shared/ support layer:
//
//   upstream  `tool.execute.after` → a whitelisted tool (or `truncate_all`) →
//             `getContextWindowUsage()` RPC → budget =
//             min(remaining × 0.5, tool threshold) → the line/token truncation
//             → `output.output = result` ONLY when `truncated`
//   this port `tools/post-execute` → the same whitelist/threshold/budget logic,
//             with the usage input read from the `contextPressure` SESSION
//             PROJECTION'S CLIENT WIRE VIEW — `snapshot(session,
//             ['contextPressure']).values.contextPressure` — instead of the
//             opencode SDK RPC (which does not exist on DSH — module header
//             前置③), delivered as
//             `{kind:'accept', content:[{type:'text', text: truncated}]}`
//
// The read FACE is load-bearing (P3-T14 review MAJOR-1): `stateOf` returns the
// unit's host state, whose schema has no `projectedTokens`; only the wire view
// computes it. The fake registry below models `snapshot`, and case ② of the
// reader suite pins that `stateOf` is never consulted.
//
// The upstream seeds are hooks/tool-output-truncator.test.ts (7 `it`) and the
// 16 shared-layer cases (dynamic-truncator.test.ts 11 +
// dynamic-truncator-behavior.test.ts 5). The 16 are overwhelmingly about the
// opencode `getContextWindowUsage` RPC (5 s timeout, cache keying,
// invalidation, env-flag 1M-context resolution) — a layer with no DSH
// counterpart, deliberately not ported. What IS ported from them is their
// behavioural contract: "no usage ⇒ conservative fixed threshold", "remaining ×
// 0.5 capped by the tool threshold", "exhausted ⇒ suppressed", and the
// algorithm's own line/header/tail-note details. Those are the cases below.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it, vi } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  CHARS_PER_TOKEN_ESTIMATE,
  CONTEXT_EXHAUSTED_RESULT,
  CONTEXT_PRESSURE_PROJECTION,
  DEFAULT_MAX_TOKENS,
  PRESERVE_HEADER_LINES,
  TOOL_OUTPUT_TRUNCATOR_EVENT,
  TOOL_OUTPUT_TRUNCATOR_ID,
  TOOL_OUTPUT_TRUNCATOR_TRUNCATE_ALL,
  TOOL_SPECIFIC_MAX_TOKENS,
  TRUNCATION_MESSAGE_TOKENS,
  TRUNCATABLE_TOOLS,
  UPSTREAM_TRUNCATABLE_TOOLS,
  WEBFETCH_MAX_TOKENS,
  buildRemainingTokenReader,
  decideToolOutputTruncation,
  estimateTokens,
  isTextOnlyResultContent,
  readRemainingTokensFromProjection,
  readRenderedText,
  registerToolOutputTruncator,
  truncateToTokenLimit,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/tool-output-truncator.ts'

/** The upstream 12-name whitelist, transcribed by hand (:8-21) — the audit trail. */
const UPSTREAM_WHITELIST_TRANSCRIBED: readonly string[] = [
  'grep',
  'Grep',
  'safe_grep',
  'glob',
  'Glob',
  'safe_glob',
  'lsp_diagnostics',
  'interactive_bash',
  'Interactive_bash',
  'skill_mcp',
  'webfetch',
  'WebFetch',
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

/**
 * A fake cordis context: registration recording plus the optional `get` used by
 * the remaining-token reader. `get` is omitted when `services` is undefined, so
 * the "no service channel" deployment stays testable.
 */
function fakeContext(services?: Record<string, unknown>): {
  ctx: HooksRegistrationContext
  onCalls: OnCall[]
  getCalls: string[]
} {
  const onCalls: OnCall[] = []
  const getCalls: string[] = []
  const ctx: HooksRegistrationContext = {
    on(event, listener) {
      onCalls.push({ event, listener })
      return () => {}
    },
  }
  if (services !== undefined) {
    ctx.get = (name: string) => {
      getCalls.push(name)
      return services[name]
    }
  }
  return { ctx, onCalls, getCalls }
}

/** The real manifest row — the registrar must read its event from the row. */
function truncatorRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === TOOL_OUTPUT_TRUNCATOR_ID)
  if (row === undefined) throw new Error('manifest is missing the tool-output-truncator row')
  return row
}

/** Registers the real registrar against the REAL manifest row and captures it. */
function registerAndCapture(services?: Record<string, unknown>): {
  listener: (...args: readonly unknown[]) => unknown
  onCalls: OnCall[]
  getCalls: string[]
} {
  const { ctx, onCalls, getCalls } = fakeContext(services)
  registerToolOutputTruncator(ctx, truncatorRow())
  expect(onCalls).toHaveLength(1)
  return { listener: onCalls[0]!.listener, onCalls, getCalls }
}

/** An execution payload shaped like the dsh `ToolExecution` leaf fields. */
function toolExec(name: string, session?: unknown): { name: string; agent?: { session: unknown } } {
  return session === undefined ? { name } : { name, agent: { session } }
}

/** A result whose rendered content is one text block (the dsh result shape). */
function textResult(text: string): {
  isError: boolean
  content: Array<{ type: string; text: string }>
} {
  return { isError: false, content: [{ type: 'text', text }] }
}

/** `count` lines of exactly `chars` characters, each prefixed by its index. */
function linesOf(count: number, chars: number, prefix = 'L'): string[] {
  return Array.from({ length: count }, (_value, index) => {
    const head = `${prefix}${index}-`
    return head + 'x'.repeat(Math.max(0, chars - head.length))
  })
}

/** One recorded `snapshot` call — the wire-view read observable. */
interface SnapshotCall {
  readonly session: unknown
  readonly keys: readonly string[] | undefined
}

/**
 * A `contextPressure` registry stub modelling the REAL read face: `snapshot`
 * (dsh-session-projection/lib/types/index.d.ts:185; impl lib/index.js:142-156),
 * which returns `{ asOfSeq, values }` with each value already passing its unit's
 * `viewSchema`. `view` is therefore a WIRE view in token-meter's declared shape
 * `{ pressureTokens?, projectedTokens?, contextWindow? }` — never the host state
 * `stateOf` returns. Calls are recorded so the suite pins the selected key.
 */
function projectionRegistryOf(view: unknown): {
  snapshot: (session: unknown, keys?: readonly string[]) => unknown
  calls: SnapshotCall[]
} {
  const calls: SnapshotCall[] = []
  return {
    calls,
    snapshot(session: unknown, keys?: readonly string[]) {
      calls.push({ session, keys })
      return { asOfSeq: 0, values: { [CONTEXT_PRESSURE_PROJECTION]: view } }
    },
  }
}

/** The value `next()` resolves to — a sentinel so "delegated verbatim" is checkable. */
const NEXT_RESULT = Object.freeze({ kind: 'accept' })

/** A `next` double that records calls and resolves to the sentinel. */
function nextDouble(): { next: () => Promise<unknown>; calls: () => number } {
  const next = vi.fn(async () => NEXT_RESULT)
  return { next, calls: () => next.mock.calls.length }
}

describe('P3-T14 truncation algorithm — the token-limit-truncator port', () => {
  it('① estimateTokens is upstream`s character approximation (len / 4, ceiling)', () => {
    expect(CHARS_PER_TOKEN_ESTIMATE).toBe(4)
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })

  it('② a text within budget is returned untouched', () => {
    const text = linesOf(5, 20).join('\n')
    const outcome = truncateToTokenLimit(text, estimateTokens(text))
    expect(outcome).toEqual({ result: text, truncated: false })
    // The boundary is inclusive (`currentTokens <= maxTokens`).
    expect(truncateToTokenLimit(text, estimateTokens(text) - 1).truncated).toBe(true)
  })

  it('③ at most `preserveHeaderLines` lines ⇒ a character slice plus the short notice', () => {
    // Upstream token-limit-truncator.ts:26-33 — reachable only when the text has
    // no more lines than the header budget.
    const text = 'a'.repeat(100) + '\n' + 'b'.repeat(100)
    expect(text.split('\n').length).toBeLessThanOrEqual(PRESERVE_HEADER_LINES)
    const outcome = truncateToTokenLimit(text, 10)
    expect(outcome).toEqual({
      result: text.slice(0, 10 * CHARS_PER_TOKEN_ESTIMATE)
        + '\n\n[Output truncated due to context window limit]',
      truncated: true,
    })
  })

  it('④ headers alone over budget ⇒ the content-truncated notice + removedCount', () => {
    // token-limit-truncator.ts:44-50 — `availableTokens <= 0`.
    const lines = linesOf(4, 100)
    const headerText = lines.slice(0, PRESERVE_HEADER_LINES).join('\n')
    const outcome = truncateToTokenLimit(lines.join('\n'), 100)
    expect(outcome).toEqual({
      result: headerText + '\n\n[Content truncated due to context window limit]',
      truncated: true,
      removedCount: 1,
    })
  })

  it('⑤ the normal path keeps the headers, fills the budget, and counts the removal', () => {
    // Line cost = ceil((8 + 1) / 4) = 3 tokens; 100 lines cost 899 chars = 225
    // tokens; header = 3 lines joined = 26 chars = 7 tokens; available =
    // 100 − 7 − 50 (the reserved truncation message) = 43 ⇒ 14 content lines fit
    // (42), so 83 of the 97 are removed.
    const lines = linesOf(100, 8)
    const outcome = truncateToTokenLimit(lines.join('\n'), 100)
    const expectedKept = [
      ...lines.slice(0, PRESERVE_HEADER_LINES),
      ...lines.slice(PRESERVE_HEADER_LINES, PRESERVE_HEADER_LINES + 14),
    ]
    expect(outcome).toEqual({
      result: expectedKept.join('\n')
        + '\n\n[83 more lines truncated due to context window limit]',
      truncated: true,
      removedCount: 83,
    })
  })

  it('⑥ the truncation-message reservation really shifts the retained count', () => {
    // The same input at 160 tokens: header 7 + 50 reserved ⇒ available 103 ⇒ 34
    // content lines (102 exactly), i.e. 63 of the 97 removed. Two different
    // budgets on ONE input is what pins the reservation's 50 tokens (without it
    // the 160 budget would keep 34 + 50/3 ≈ 50 lines).
    const lines = linesOf(100, 8)
    const atHundred = truncateToTokenLimit(lines.join('\n'), 100)
    const atHundredSixty = truncateToTokenLimit(lines.join('\n'), 160)
    expect(TRUNCATION_MESSAGE_TOKENS).toBe(50)
    expect(atHundred.removedCount).toBe(97 - 14)
    expect(atHundredSixty.removedCount).toBe(97 - 34)
  })

  it('⑦ the non-string guard is kept from upstream (unreachable from the typed caller)', () => {
    // token-limit-truncator.ts:12-14.
    expect(truncateToTokenLimit(undefined as unknown as string, 10))
      .toEqual({ result: '', truncated: false })
    expect(truncateToTokenLimit(42 as unknown as string, 10))
      .toEqual({ result: '42', truncated: false })
  })

  it('⑧ the three trailing notices are the upstream strings verbatim', () => {
    const shortLines = 'a'.repeat(40)
    expect(truncateToTokenLimit(shortLines, 2).result)
      .toContain('[Output truncated due to context window limit]')
    const headerHeavy = linesOf(4, 100).join('\n')
    expect(truncateToTokenLimit(headerHeavy, 100).result)
      .toContain('[Content truncated due to context window limit]')
    const many = linesOf(100, 8).join('\n')
    expect(truncateToTokenLimit(many, 100).result)
      .toMatch(/\n\n\[\d+ more lines truncated due to context window limit\]$/)
  })
})

describe('P3-T14 whitelist + thresholds — the tool-name mapping', () => {
  it('① the upstream 12 are the audit trail; the live list is the DSH mapping', () => {
    expect([...UPSTREAM_TRUNCATABLE_TOOLS]).toEqual([...UPSTREAM_WHITELIST_TRANSCRIBED])
    expect([...TRUNCATABLE_TOOLS]).toEqual(['grep', 'glob', 'web_fetch'])
    // Every dropped name has no DSH mount (module header table): the case
    // variants collapse, the MCP/persistent-shell names are absent.
    for (const dropped of ['Grep', 'safe_grep', 'Glob', 'safe_glob', 'lsp_diagnostics', 'interactive_bash', 'Interactive_bash', 'skill_mcp', 'webfetch', 'WebFetch']) {
      expect(TRUNCATABLE_TOOLS, dropped).not.toContain(dropped)
    }
    // The upstream webfetch pair collapses onto the ONE DSH `web_fetch`, which
    // keeps the aggressive threshold.
    expect(TOOL_SPECIFIC_MAX_TOKENS).toEqual({ web_fetch: WEBFETCH_MAX_TOKENS })
    expect(DEFAULT_MAX_TOKENS).toBe(50_000)
    expect(WEBFETCH_MAX_TOKENS).toBe(10_000)
    expect(PRESERVE_HEADER_LINES).toBe(3)
    expect(TOOL_OUTPUT_TRUNCATOR_TRUNCATE_ALL).toBe(false)
  })

  it('② grep/glob use the 50k default; a 10k-token text is left alone (seed 4)', () => {
    // 40 004 chars = 10 001 tokens: over web_fetch`s 10k, far under grep`s 50k.
    const text = 'y'.repeat(40_004)
    expect(estimateTokens(text)).toBe(10_001)
    for (const name of ['grep', 'glob']) {
      expect(decideToolOutputTruncation(toolExec(name), textResult(text)), name).toBeUndefined()
    }
  })

  it('③ web_fetch uses the aggressive 10k threshold (seeds 1/2, collapsed)', () => {
    const text = 'y'.repeat(40_004)
    const decision = decideToolOutputTruncation(toolExec('web_fetch'), textResult(text)) as Decision
    expect(decision.kind).toBe('accept')
    // One line ⇒ the at-most-header-lines path: a char slice to 10k tokens.
    expect(decision.content?.[0]?.text).toBe(
      text.slice(0, WEBFETCH_MAX_TOKENS * CHARS_PER_TOKEN_ESTIMATE)
        + '\n\n[Output truncated due to context window limit]',
    )
  })

  it('④ grep truncates a text over its 50k default (seed 4, positive half)', () => {
    const text = 'z'.repeat(200_004) // 50 001 tokens
    expect(estimateTokens(text)).toBe(50_001)
    expect(decideToolOutputTruncation(toolExec('grep'), textResult(text))).toBeDefined()
    // …and exactly at the threshold nothing happens (inclusive comparison).
    const boundary = 'z'.repeat(200_000)
    expect(estimateTokens(boundary)).toBe(50_000)
    expect(decideToolOutputTruncation(toolExec('grep'), textResult(boundary))).toBeUndefined()
  })

  it('⑤ a non-whitelisted tool never calls the truncator (upstream seed 6)', () => {
    const text = 'z'.repeat(400_004)
    for (const name of ['read', 'write', 'edit', 'bash', 'job_output', 'skill']) {
      expect(decideToolOutputTruncation(toolExec(name), textResult(text)), name).toBeUndefined()
    }
  })

  it('⑥ `truncateAll` truncates a non-whitelisted tool too (upstream seed 7)', () => {
    const text = 'z'.repeat(400_004)
    expect(decideToolOutputTruncation(toolExec('read'), textResult(text), { truncateAll: true }))
      .toBeDefined()
    // …and the option defaults to the module constant (upstream`s own default).
    expect(decideToolOutputTruncation(toolExec('read'), textResult(text), { truncateAll: false }))
      .toBeUndefined()
    expect(decideToolOutputTruncation(toolExec('read'), textResult(text))).toBeUndefined()
  })

  it('⑦ `truncated: false` delegates — the result is never rewritten (upstream seed 5)', () => {
    // A whitelisted tool with a SHORT result: the control of the whole module.
    expect(decideToolOutputTruncation(toolExec('grep'), textResult('Found 2 matches\n\na.ts:1:x')))
      .toBeUndefined()
  })

  it('⑧ malformed exec/result payloads are not our call', () => {
    const text = 'z'.repeat(400_004)
    for (const payload of [undefined, null, 42, 'grep', {}, { name: 7 }]) {
      expect(decideToolOutputTruncation(payload, textResult(text)), String(payload)).toBeUndefined()
    }
    for (const result of [undefined, null, 42, 'text', { isError: false }]) {
      expect(decideToolOutputTruncation(toolExec('grep'), result)).toBeUndefined()
    }
  })

  it('⑨ a non-text block anywhere makes the rewrite refuse (no block can be dropped)', () => {
    const mixed = {
      isError: false,
      content: [
        { type: 'text', text: 'z'.repeat(400_004) },
        { type: 'image', data: 'x' },
      ],
    }
    expect(isTextOnlyResultContent(mixed)).toBe(false)
    expect(decideToolOutputTruncation(toolExec('grep'), mixed)).toBeUndefined()
    expect(readRenderedText(mixed)).toBe('z'.repeat(400_004))
  })
})

describe('P3-T14 adaptive budget — the dynamic-truncator behaviour (前置③)', () => {
  // 100 lines × 1200 chars ≈ 30 000 tokens: under grep`s 50k default, so the
  // fixed path leaves it alone and ONLY a smaller adaptive budget touches it.
  const thirtyKTokenText = linesOf(100, 1200).join('\n')

  it('① the projection gives the budget min(remaining × 0.5, tool threshold)', () => {
    expect(estimateTokens(thirtyKTokenText)).toBeGreaterThan(20_000)
    expect(estimateTokens(thirtyKTokenText)).toBeLessThanOrEqual(DEFAULT_MAX_TOKENS)
    // No usage ⇒ upstream`s conservative fixed threshold ⇒ untouched.
    expect(decideToolOutputTruncation(toolExec('grep'), textResult(thirtyKTokenText)))
      .toBeUndefined()
    // remaining 40 000 ⇒ budget 20 000 ⇒ truncated.
    const adaptive = decideToolOutputTruncation(
      toolExec('grep'),
      textResult(thirtyKTokenText),
      { readRemainingTokens: () => 40_000 },
    ) as Decision
    expect(adaptive.kind).toBe('accept')
    expect(adaptive.content?.[0]?.text).toContain('more lines truncated due to context window limit')
    // remaining 1 000 000 ⇒ min(500 000, 50 000) = the tool threshold ⇒ untouched.
    expect(decideToolOutputTruncation(
      toolExec('grep'),
      textResult(thirtyKTokenText),
      { readRemainingTokens: () => 1_000_000 },
    )).toBeUndefined()
  })

  it('② the adaptive budget also caps web_fetch without exceeding its 10k', () => {
    const text = 'y'.repeat(40_004) // 10 001 tokens
    expect(decideToolOutputTruncation(
      toolExec('web_fetch'),
      textResult(text),
      { readRemainingTokens: () => 1_000_000 },
    )?.content?.[0]?.text).toBe(
      text.slice(0, WEBFETCH_MAX_TOKENS * CHARS_PER_TOKEN_ESTIMATE)
        + '\n\n[Output truncated due to context window limit]',
    )
  })

  it('③ remaining ≤ 0 ⇒ the whole output is suppressed (upstream `maxOutputTokens <= 0`)', () => {
    for (const remaining of [0, -1, -100_000]) {
      const decision = decideToolOutputTruncation(
        toolExec('grep'),
        textResult(thirtyKTokenText),
        { readRemainingTokens: () => remaining },
      ) as Decision
      expect(decision.content?.[0]?.text, String(remaining)).toBe(CONTEXT_EXHAUSTED_RESULT)
      expect(CONTEXT_EXHAUSTED_RESULT).toBe('[Output suppressed - context window exhausted]')
    }
  })

  it('④ an unavailable/absent/non-finite usage falls back to the fixed threshold', () => {
    // Upstream`s `if (!usage)` branch, plus this port`s defensive guard: a
    // non-finite remaining must not reach the arithmetic (NaN would defeat the
    // budget comparisons and produce a bogus `[0 more lines truncated]`).
    for (const reader of [() => undefined, () => Number.NaN, () => Number.POSITIVE_INFINITY]) {
      const decision = decideToolOutputTruncation(
        toolExec('grep'),
        textResult(thirtyKTokenText),
        { readRemainingTokens: reader },
      )
      expect(decision, String(reader)).toBeUndefined()
    }
    // The same fallback with a text over the fixed threshold really truncates —
    // the fallback is a budget, not a no-op.
    const huge = 'z'.repeat(200_004)
    expect(decideToolOutputTruncation(
      toolExec('grep'),
      textResult(huge),
      { readRemainingTokens: () => undefined },
    )).toBeDefined()
  })

  it('⑤ a reader returning 30 000 yields exactly 15 000 tokens of budget', () => {
    // Header = 3 lines × 1200 chars + 2 newlines = 3602 chars = 901 tokens;
    // available = 15 000 − 901 − 50 = 14 049; each content line costs
    // ceil(1201 / 4) = 301 ⇒ 46 lines fit (13 846), so 51 of the 97 content
    // lines are removed.
    const decision = decideToolOutputTruncation(
      toolExec('grep'),
      textResult(thirtyKTokenText),
      { readRemainingTokens: () => 30_000 },
    ) as Decision
    const rewritten = decision.content?.[0]?.text ?? ''
    expect(rewritten).toContain('[51 more lines truncated due to context window limit]')
  })
})

describe('P3-T14 remaining-token reader — the DSH usage surface', () => {
  it('① remaining = contextWindow − (projectedTokens ?? pressureTokens) from the WIRE view', () => {
    const session = { header: { id: 's1' } }
    // Both present ⇒ the wire view's projectedTokens WINS over pressureTokens
    // (its own doc: "what the NEXT request's prompt would cost").
    expect(readRemainingTokensFromProjection(
      projectionRegistryOf({ contextWindow: 100_000, projectedTokens: 20_000, pressureTokens: 30_000 }),
      toolExec('grep', session),
    )).toBe(80_000)
    // Only pressureTokens ⇒ the documented fallback.
    expect(readRemainingTokensFromProjection(
      projectionRegistryOf({ contextWindow: 100_000, pressureTokens: 30_000 }),
      toolExec('grep', session),
    )).toBe(70_000)
  })

  it('② `stateOf` is NEVER the read face, and the wire formula is not re-derived (MAJOR-1 pin)', () => {
    const session = { header: { id: 's1' } }
    // A registry exposing ONLY `stateOf` — the pre-fix assumption. Its host state
    // carries `pressureTokens` (and `surfaceTokens`/`sampledSurfaceTokens`) but
    // NO `projectedTokens` (token-meter `contextPressureStateSchema`,
    // dsh-token-meter/lib/index.js:397-407), so consuming it would silently
    // under-estimate occupancy. The reader must degrade to undefined — i.e.
    // upstream`s fixed-threshold fallback — never read host state.
    const hostStateOnly = {
      stateOf: (_session: unknown, key: string) => (key === CONTEXT_PRESSURE_PROJECTION
        ? {
          contextWindow: 100_000,
          pressureTokens: 30_000,
          surfaceTokens: 50_000,
          sampledSurfaceTokens: 10_000,
        }
        : undefined),
    }
    expect(readRemainingTokensFromProjection(hostStateOnly, toolExec('grep', session)))
      .toBeUndefined()
    // Nor may the reader re-derive the wire formula locally: given a view that
    // (illegally) carries the host-state fields but no `projectedTokens`, it uses
    // the `pressureTokens` fallback ⇒ 100 000 − 30 000 = 70 000. Self-computing
    // `Math.max(0, pressureTokens + surfaceTokens − sampledSurfaceTokens)`
    // (dsh-token-meter/lib/index.js:514) would instead yield 30 000.
    expect(readRemainingTokensFromProjection(
      projectionRegistryOf({
        contextWindow: 100_000,
        pressureTokens: 30_000,
        surfaceTokens: 50_000,
        sampledSurfaceTokens: 10_000,
      }),
      toolExec('grep', session),
    )).toBe(70_000)
  })

  it('③ every incomplete shape means "usage unavailable" (undefined)', () => {
    const session = { header: { id: 's1' } }
    for (const projections of [
      undefined,
      null,
      42,
      {},
      { snapshot: 'not-a-function' },
      { snapshot: () => undefined },
      { snapshot: () => ({}) },
      { snapshot: () => ({ values: 7 }) },
      projectionRegistryOf(undefined),
      projectionRegistryOf({ projectedTokens: 5 }),
      projectionRegistryOf({ contextWindow: 100_000 }),
      projectionRegistryOf({ contextWindow: '100000', projectedTokens: 1 }),
      projectionRegistryOf({ contextWindow: Number.NaN, projectedTokens: 1 }),
      projectionRegistryOf({ contextWindow: 100_000, projectedTokens: Number.NaN }),
    ]) {
      expect(readRemainingTokensFromProjection(projections, toolExec('grep', session)))
        .toBeUndefined()
    }
    // No owning agent / no session ⇒ unavailable (the nested PTC dispatch case).
    for (const payload of [undefined, null, 42, {}, { agent: {} }, { agent: { session: undefined } }]) {
      expect(readRemainingTokensFromProjection(
        projectionRegistryOf({ contextWindow: 1, projectedTokens: 0 }),
        payload,
      ), String(payload)).toBeUndefined()
    }
  })

  it('④ the projection key is the token-meter`s declared `contextPressure`, read via `snapshot`', () => {
    const session = { header: { id: 's1' } }
    const registry = projectionRegistryOf({ contextWindow: 10, projectedTokens: 4 })
    expect(CONTEXT_PRESSURE_PROJECTION).toBe('contextPressure')
    expect(readRemainingTokensFromProjection(registry, toolExec('grep', session))).toBe(6)
    // Both the WIRE-view method and the exact selected key are pinned, and the
    // session handed to it is the exec's own (`exec.agent.session`).
    expect(registry.calls).toHaveLength(1)
    expect(registry.calls[0]!.keys).toEqual(['contextPressure'])
    expect(registry.calls[0]!.session).toBe(session)
  })

  it('⑤ buildRemainingTokenReader goes through ctx.get and degrades without it', () => {
    // The service is looked up PER EVENT, not cached at apply time: cordis`s
    // strict `get` can be empty during the loader batch (the P3-T13 lesson) while
    // it is always populated at event time.
    const registry = projectionRegistryOf({ contextWindow: 100_000, pressureTokens: 10_000 })
    const { ctx, getCalls } = fakeContext({ sessionProjections: registry })
    const reader = buildRemainingTokenReader(ctx)
    expect(reader(toolExec('grep', {}))).toBe(90_000)
    expect(reader(toolExec('grep', {}))).toBe(90_000)
    expect(getCalls).toEqual(['sessionProjections', 'sessionProjections'])
    expect(registry.calls).toHaveLength(2)
    // A deployment without the service channel (or without token-meter) returns
    // undefined — the fixed-threshold fallback, never a throw.
    const bare = fakeContext()
    expect(buildRemainingTokenReader(bare.ctx)(toolExec('grep', {}))).toBeUndefined()
  })

  it('⑥ a view that really carries projectedTokens (the production shape) reaches the budget', () => {
    // The wire view's projectedTokens is produced by token-meter ONLY, as
    // Math.max(0, pressureTokens + surfaceTokens − sampledSurfaceTokens)
    // (dsh-token-meter/lib/index.js:514). Here pressureTokens 60 000 with no
    // surface movement ⇒ projectedTokens 60 000 ⇒ 40 000 remain.
    const registry = projectionRegistryOf({
      pressureTokens: 60_000,
      projectedTokens: 60_000,
      contextWindow: 100_000,
    })
    expect(readRemainingTokensFromProjection(registry, toolExec('grep', {}))).toBe(40_000)
    // …and surface growth since the sample raises the projected cost, which is
    // exactly the signal `pressureTokens` alone could not express.
    const afterGrowth = projectionRegistryOf({
      pressureTokens: 60_000,
      projectedTokens: 75_000,
      contextWindow: 100_000,
    })
    expect(readRemainingTokensFromProjection(afterGrowth, toolExec('grep', {}))).toBe(25_000)
  })
})

describe('P3-T14 listener — fail-open waterfall behaviour', () => {
  it('① returns the rewrite WITHOUT delegating on a trigger', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    const text = 'z'.repeat(400_004)
    const decision = await listener(toolExec('grep'), textResult(text), next)
    expect((decision as Decision).kind).toBe('accept')
    expect((decision as Decision).content?.[0]?.text.length).toBeLessThan(text.length)
    expect(calls()).toBe(0)
  })

  it('② delegates for the control (a short whitelisted result)', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    expect(await listener(toolExec('grep'), textResult('Found 1 match\n\na.ts:1:x'), next))
      .toBe(NEXT_RESULT)
    expect(calls()).toBe(1)
  })

  it('③ the registrar wires the LIVE projection reader (end-to-end through ctx.get)', async () => {
    // 30 000-token result + a wire view that says 40 000 remain ⇒ the adaptive
    // budget (20 000) fires, which the fixed 50k default would not have done.
    const { listener, getCalls } = registerAndCapture({
      sessionProjections: projectionRegistryOf({
        contextWindow: 100_000,
        pressureTokens: 60_000,
        projectedTokens: 60_000,
      }),
    })
    const { next, calls } = nextDouble()
    const decision = await listener(
      toolExec('grep', { header: { id: 's1' } }),
      textResult(linesOf(100, 1200).join('\n')),
      next,
    )
    expect((decision as Decision).kind).toBe('accept')
    expect(calls()).toBe(0)
    expect(getCalls).toEqual(['sessionProjections'])
  })

  it('④ a throw inside the decision delegates instead of turning the result into an isError', async () => {
    const { listener } = registerAndCapture()
    const { next, calls } = nextDouble()
    const hostile = {
      isError: false,
      get content(): Array<{ type: string; text: string }> {
        throw new Error('frozen payload exploded')
      },
    }
    expect(await listener(toolExec('grep'), hostile, next)).toBe(NEXT_RESULT)
    expect(calls()).toBe(1)
  })

  it('⑤ a downstream rejection propagates once and is never retried (same as T5/T7)', async () => {
    const { listener } = registerAndCapture()
    const next = vi.fn(async () => {
      throw new Error('downstream no')
    })
    await expect(listener(toolExec('read'), textResult('x'), next)).rejects.toThrowError('downstream no')
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('P3-T14 registrar — wiring to the manifest row', () => {
  it('① registers exactly one tools/post-execute listener and returns no disposer', () => {
    const row = truncatorRow()
    expect(row.event).toBe(TOOL_OUTPUT_TRUNCATOR_EVENT)
    expect(row.mode).toBe('D')
    // Flipped by P3-T14 with the POSITIVE prerequisite: the remaining-token
    // surface exists (the `contextPressure` projection), so the row records the
    // adaptive path rather than a degradation.
    expect(row.status).toBe('ported')
    expect(row.e2eScenario).toBe('tool-output-truncated')
    const { ctx, onCalls } = fakeContext()
    expect(registerToolOutputTruncator(ctx, row)).toBeUndefined()
    expect(onCalls).toHaveLength(1)
    expect(onCalls[0].event).toBe('tools/post-execute')
  })
})
