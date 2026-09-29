// tool-output-truncator.ts — P3-T14 listener (task book WP-6 批 A; plan §4.2
// pattern D): OMO's context-adaptive tool-output truncator, reborn as ONE DSH
// `tools/post-execute` waterfall listener.
//
// Upstream: packages/omo-opencode/src/hooks/tool-output-truncator.ts @ v4.19.4
//   (frozen baseline tag, commit
//   b072d279110bdda2c6ac2525d0d24dc54d16148a; 67 lines) plus its THREE real
//   value dependencies in `packages/omo-opencode/src/shared/` — the accounting
//   correction P3-T2 established (the coverage list's "1 + 4 shared 支撑文件"
//   counts the 191-line context-window-usage RPC layer, which does NOT exist on
//   DSH):
//     shared/dynamic-truncator.ts        (84 lines)  → the ADAPTIVE threshold
//     shared/dynamic-truncator-types.ts  (21 lines)  → {@link TruncationResult}
//     shared/token-limit-truncator.ts    (75 lines)  → the line/token algorithm
//     shared/context-window-usage.ts     (191+ lines)→ REPLACED, not ported
//   Test seeds: hooks/tool-output-truncator.test.ts (7 `it`),
//   shared/dynamic-truncator.test.ts (11), shared/dynamic-truncator-behavior.test.ts
//   (5) — the 23 cases the task book's "7+16" names. The 16 shared-layer cases
//   are overwhelmingly about `getContextWindowUsage`'s opencode RPC (timeout,
//   caching, invalidation, provider/model keying, env-flag 1M-context
//   resolution); that whole layer has no DSH counterpart and is therefore not
//   ported (see 前置 below). Its BEHAVIOURAL half — "the adaptive budget is
//   min(remaining × 0.5, tool threshold)", "no usage ⇒ conservative fixed
//   threshold", "exhausted ⇒ suppressed" — is ported and unit-tested against the
//   DSH usage source.
//
// UPSTREAM EFFECT (verbatim, :44-61):
//
//   if (!truncateAll && !TRUNCATABLE_TOOLS.includes(input.tool)) return
//   if (typeof output.output !== 'string') return
//   try {
//     const targetMaxTokens = TOOL_SPECIFIC_MAX_TOKENS[input.tool] ?? DEFAULT_MAX_TOKENS
//     const { result, truncated } = await truncator.truncate(input.sessionID, output.output, { targetMaxTokens })
//     if (truncated) { output.output = result }
//   } catch (error) { if (!(error instanceof Error)) { throw error } }
//
// and, in shared/dynamic-truncator.ts:38-58:
//
//   const usage = await getContextWindowUsage(ctx, sessionID, modelCacheState)
//   if (!usage) return truncateToTokenLimit(output, targetMaxTokens, preserveHeaderLines)
//   const maxOutputTokens = Math.min(usage.remainingTokens * 0.5, targetMaxTokens)
//   if (maxOutputTokens <= 0) return { result: "[Output suppressed - context window exhausted]", truncated: true }
//   return truncateToTokenLimit(output, maxOutputTokens, preserveHeaderLines)
//
// ═══════════ 前置③ — DSH'S REMAINING-TOKEN SURFACE, VERIFIED (POSITIVE) ═══════════
// (plan §4.2 DoD-d; the task book's "DSH 剩余 token/上下文用量暴露面核实".
// Upstream's input came from `ctx.client.session.messages()` — an opencode SDK
// RPC with a 5 s timeout and a per-client cache (context-window-usage.ts:18,70-87).
// DSH has NO such RPC, but it DOES expose the two numbers synchronously, through
// the token-meter plugin that the pinned base composition mounts
// (dsh-base/cordis.patch.yml:317-318 `token-meter`):)
//
//   * `contextPressure`'s CLIENT WIRE VIEW — the only face that carries
//     `projectedTokens`:
//     `ctx.sessionProjections.snapshot(session, ['contextPressure'])`
//     (dsh-session-projection/lib/types/index.d.ts:185 `snapshot`; impl
//     lib/index.js:142-156 returns `{ asOfSeq, values }` and passes each value
//     through its unit's `viewSchema` before it leaves), then
//     `values.contextPressure`, whose shape
//     dsh-token-meter/lib/types/projection.d.ts:28-46 declares as
//     `{ pressureTokens?, projectedTokens?, contextWindow? }`: "provider-reported
//     prompt size of the most recent request", "what the NEXT request's prompt
//     would cost" and "newest recorded route capacity". So
//     REMAINING = contextWindow − (projectedTokens ?? pressureTokens).
//
//     ⚠️ `stateOf` IS THE WRONG FACE HERE (P3-T14 review MAJOR-1, fixed in this
//     revision). `ctx.sessionProjections.stateOf(session, 'contextPressure')`
//     (dsh-session-projection/lib/types/index.d.ts:175) returns
//     `cellFor(registration, session).state` — the unit's HOST STATE
//     (lib/index.js:127-132) — whose schema is token-meter's
//     `contextPressureStateSchema` (dsh-token-meter/lib/index.js:397-407):
//     `{ contextWindow?, pressureTokens?, surfaceTokens, sampledSurfaceTokens?,
//     claim? }`, with **no `projectedTokens` ever**. `projectedTokens` is a pure
//     product of the wire view's `view` (dsh-token-meter/lib/index.js:509-516),
//     `projectedTokens: Math.max(0, pressureTokens + surfaceTokens −
//     sampledSurfaceTokens)` (line 514), and only when `pressureTokens` and
//     `sampledSurfaceTokens` are BOTH present. Reading `stateOf` therefore made
//     the `projectedTokens` branch production-unreachable and silently degraded
//     every adaptive budget to `pressureTokens` — a systematic UNDER-estimate of
//     occupancy (the wire view's whole point is the surface movement since the
//     sample, which is how a compaction becomes visible at all). This reader now
//     takes the wire view only and NEVER falls back to `stateOf`: a registry
//     without `snapshot` degrades to upstream's own fixed threshold, and the
//     unit suite pins that structural fact.
//   * the session itself is reachable without any service: `exec.agent.session`
//     (dsh-tools/lib/types/index.d.ts:207-208 — "The agent on whose behalf the
//     call runs (set by the agent loop)"), and the read goes through the SAME
//     projection REGISTRY the E-mode todo hooks already read: the `todos` key is
//     registered at dsh-tool-todo/lib/index.js:81, and the sibling read face
//     `ctx.sessionProjections.stateOf(agent.session, 'todos')` is documented at
//     todo-continuation-enforcer.ts:133. That key has NO wire view, which is
//     exactly why IT uses `stateOf`; `contextPressure` has one, so this hook
//     must not.
//
// CONSEQUENCE: the task book's conditional is decided POSITIVELY — the adaptive
// `min(remaining × 0.5, tool threshold)` semantics IS ported. The task book's
// alternative ("无暴露面 → 退化固定阈值") is NOT taken, so the H-16 row's
// "退化路径" annotation does NOT apply to the happy path; it applies only to the
// DEGRADED runtime case below, which is exactly upstream's own `if (!usage)`
// fallback.
//
// ═══════════ THE ONE SEMANTIC RESTRICTION, AND WHY IT IS NOT A DEGRADATION ═══════
// The wire view is provider-anchored: `pressureTokens`/`projectedTokens` stay
// ABSENT (the view omits both) until the provider reports usage — its own doc
// says so, and `contextWindow` is "absent when no adapter advertised one". In
// that state the reader returns `undefined` and the port applies upstream's OWN
// fallback — `truncateToTokenLimit(text, targetMaxTokens)` — i.e. a fixed tool
// threshold (50 000 tokens default, 10 000 for `web_fetch`). This is upstream's
// documented behaviour for unavailable usage, not a degraded substitute for it; the only
// DSH-specific difference is that the unavailable state is normal on the FIRST
// tool result of a session rather than an RPC failure. The H-16 e2e runs this
// branch for real: the mock route advertises no capacity, so the wire view
// carries neither `contextWindow` nor `pressureTokens`.
//
// ═══════════ THE TOOL WHITELIST: 12 UPSTREAM NAMES → DSH TOOL NAMESPACE ═══════
// Upstream matched with `Array.includes` — EXACT, CASE-SENSITIVE — which is why
// its list spells `grep`/`Grep` and `webfetch`/`WebFetch` twice. DSH's registry
// names its tools canonical lowercase ids, so every case variant collapses and
// the names with no DSH mount drop out. Name by name:
//
//   grep              → `grep`       dsh-tool-fs-search/lib/index.js:1090
//   Grep              → dropped      case variant of the SAME DSH tool
//   safe_grep         → dropped      MCP plugin tool; no DSH mount
//   glob              → `glob`       dsh-tool-fs-search:782
//   Glob              → dropped      case variant
//   safe_glob         → dropped      MCP plugin tool; no DSH mount
//   lsp_diagnostics   → dropped      no DSH tool
//   interactive_bash  → dropped      OMO's persistent shell; the pinned base
//                                    composition mounts dsh-tool-bash and
//                                    dsh-tool-pwsh only
//                                    (dsh-base/cordis.patch.yml:247,251), not
//                                    the persistent variant
//   Interactive_bash  → dropped      case variant
//   skill_mcp         → dropped      no DSH tool (DSH's `skill` covers MCP)
//   webfetch          → `web_fetch`  DSH spells it with an underscore
//                                    (dsh-tool-web/lib/index.js:737)
//   WebFetch          → dropped      case variant
//
// Net: 3 DSH names (grep / glob / web_fetch). The narrowing is real and recorded:
// upstream's whitelist was mostly MCP-plugin surface that does not exist here.
// The DSH tools whose output can also be huge (bash, read, job_output) are
// deliberately NOT added — upstream judged only its own whitelist, and bash
// already truncates natively (dsh-tool-bash/lib/index.js:38-41 spills to a file
// and appends its own notice), while `read` is paginated by its own
// offset/limit contract. Extending the whitelist is an arbitration decision, not
// a silent port convenience.
//
// ═══════════ THE EXPERIMENTAL `truncate_all_tool_outputs` SWITCH ═══════════
// Upstream read it from its own config schema at hook construction
// (`options?.experimental?.truncate_all_tool_outputs ?? false`). The DSH
// registrar receives only the manifest row — `HooksRegistrationContext` has no
// config channel and `apply()` is the one-argument cordis entry point (index.ts)
// — so the switch is carried as {@link TOOL_OUTPUT_TRUNCATOR_TRUNCATE_ALL}, a
// module constant defaulting to upstream's `false`, and the DECISION takes it as
// an option so the semantics stay tested. Wiring it to a cordis row config is a
// follow-up recorded in the report; nothing about the default behaviour differs
// from upstream.
//
// ═══════════ MEASURED OVERLAP: dsh-spill-policy BOUNDS RESULTS TOO ═══════════
// The pinned base composition mounts `dsh-spill-policy` with
// `maxInlineBytes: 50000` (dsh-base/cordis.patch.yml:383-386), and its
// `tools/post-execute` listener is PREPENDED — it wraps the chain, calls
// `next()` and then bounds whatever content the chain below produced
// (dsh-spill-policy/lib/index.js:155-173). Measured in the P3-T14 e2e
// (`tool-output-truncated`, a 360 200-byte grep result): this listener DID run
// and replace the result — its own tail note `[90 more lines truncated due to
// context window limit]` is durably inside the tool result — and spill-policy
// then bounded the REPLACEMENT to 50 000 bytes, appending its own
// `(Omitted 149392 bytes. Full formatted result stored at: …)` notice after it.
//
// CONSEQUENCE (recorded, not hidden): for any text over 50 000 BYTES the FINAL
// bound is spill-policy's. This hook still contributes (a) the token-budget
// aware cap, which is the binding one whenever the adaptive budget is below that
// byte cap, and (b) the shared, model-facing truncation notice. Whether H-16
// should therefore be recorded as partially DSH-natively covered, or narrowed,
// is an ARBITRATION question — the T14 report raises it; no silent narrowing is
// performed here.
//
// ═══════════ SWALLOWED ERRORS: THE ONE DELIBERATE DISCIPLINE CHANGE ═══════════
// Upstream's catch rethrew a NON-`Error` rejection (`if (!(error instanceof
// Error)) throw error`) — a detail that would violate the D-mode discipline ② on
// DSH, where a listener throw replaces a SUCCESSFUL result with an isError.
// This port fails OPEN unconditionally (`return next()`), and the algorithm
// itself is total (see {@link truncateToTokenLimit}), so the catch is a net.
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2): ② fail-open try/catch with `next()`
// outside the try; ③ no disk reads on the event path — the threshold table and
// the two upstream constants are built at import time and the usage read is an
// in-memory `snapshot` wire-view lookup (the service is looked up per event
// through `ctx.get`, because cordis's strict read can be empty during the loader
// batch — the P3-T13 lesson — while at event time it is always populated); ⑤ no
// cross-event state — no cache, unlike upstream's per-client usage cache, because
// the projection IS the cache.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar, HooksRegistrationContext } from '../index.ts'

/** The manifest id this registrar implements (manifest.ts row H-16). */
export const TOOL_OUTPUT_TRUNCATOR_ID = 'tool-output-truncator'

/** The one and only DSH event this listener registers on (pattern D). */
export const TOOL_OUTPUT_TRUNCATOR_EVENT = 'tools/post-execute'

/** Upstream :5 — `const DEFAULT_MAX_TOKENS = 50_000 // ~200k chars`. */
export const DEFAULT_MAX_TOKENS = 50_000

/** Upstream :6 — `const WEBFETCH_MAX_TOKENS = 10_000 // ~40k chars`. */
export const WEBFETCH_MAX_TOKENS = 10_000

/** Upstream :8-21, transcribed verbatim as the audit-trail reference. */
export const UPSTREAM_TRUNCATABLE_TOOLS: readonly string[] = [
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

/**
 * The live whitelist in DSH's tool-name namespace (the mapping table with its
 * per-name citations is in the header). Matched EXACTLY, as upstream did — DSH
 * ids are canonical lowercase, so no case variants are needed.
 */
export const TRUNCATABLE_TOOLS: readonly string[] = ['grep', 'glob', 'web_fetch']

/**
 * Upstream :23-26 — the per-tool threshold table, in DSH names (the only
 * tool-specific override upstream had was the webfetch pair, which collapses to
 * the one DSH `web_fetch`). Built ONCE at import time (discipline ③).
 */
export const TOOL_SPECIFIC_MAX_TOKENS: Readonly<Record<string, number>> = {
  web_fetch: WEBFETCH_MAX_TOKENS,
}

/** Upstream dynamic-truncator.ts:39 — `preserveHeaderLines = 3`. */
export const PRESERVE_HEADER_LINES = 3

/** Upstream dynamic-truncator.ts:55 — the exhausted-context replacement. */
export const CONTEXT_EXHAUSTED_RESULT = '[Output suppressed - context window exhausted]'

/** Upstream token-limit-truncator.ts:3 — `CHARS_PER_TOKEN_ESTIMATE = 4`. */
export const CHARS_PER_TOKEN_ESTIMATE = 4

/** Upstream token-limit-truncator.ts:41 — `truncationMessageTokens = 50`. */
export const TRUNCATION_MESSAGE_TOKENS = 50

/**
 * The upstream experimental switch, carried as a constant because the DSH
 * registrar has no config channel (see the header). Default = upstream's own
 * default: OFF.
 */
export const TOOL_OUTPUT_TRUNCATOR_TRUNCATE_ALL = false

/**
 * The session-projection key this hook reads (前置③), through the registry's
 * `snapshot` WIRE-view face — never `stateOf`, which returns host state without
 * `projectedTokens`. Exported so the unit suite pins the exact string the
 * projection registry declares.
 */
export const CONTEXT_PRESSURE_PROJECTION = 'contextPressure'

// --- Minimal structural typings of the DSH surface this file touches --------

/** One `text` block of a tool result's rendered content (dsh-llm ContentBlock). */
export interface ResultTextBlock {
  readonly type: 'text'
  readonly text: string
}

/** The `accept` decision replacing the result's content (mode D). */
export interface TruncatorAcceptDecision {
  readonly kind: 'accept'
  readonly content: readonly ResultTextBlock[]
}

/** The `tools/post-execute` delegator handed to the listener by the waterfall. */
export type PostExecuteNextLike = () => Promise<unknown>

/** Upstream shared/dynamic-truncator-types.ts — the algorithm's outcome. */
export interface TruncationResult {
  readonly result: string
  readonly truncated: boolean
  readonly removedCount?: number
}

/**
 * The remaining-context reader (upstream's `getContextWindowUsage` slot):
 * `undefined` means "usage unavailable ⇒ conservative fixed threshold".
 */
export type RemainingTokenReader = (exec: unknown) => number | undefined

/** The decision's injectable seams (tests own both). */
export interface TruncatorOptions {
  /** Upstream's `truncate_all_tool_outputs`; defaults to the module constant. */
  readonly truncateAll?: boolean
  /** The remaining-token source; absent ⇒ upstream's fixed-threshold fallback. */
  readonly readRemainingTokens?: RemainingTokenReader
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * Upstream's `estimateTokens` (token-limit-truncator.ts:5-7), verbatim:
 * `Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)` — a deliberate
 * CHARACTER-count approximation, not a tokenizer (P3-T1 §5.8.3 records that it
 * misprices CJK/code; replacing it would be an improvement, not a port, and is
 * NOT done here).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)
}

/**
 * Upstream `truncateToTokenLimit` (shared/token-limit-truncator.ts), ported
 * branch for branch, including the `typeof output !== 'string'` guard (which the
 * typed DSH caller can never trip — kept so the port stays a line-by-line read),
 * the header-preserving split, the `TRUNCATION_MESSAGE_TOKENS` reservation, and
 * the three exact trailing notices.
 */
export function truncateToTokenLimit(
  output: string,
  maxTokens: number,
  preserveHeaderLines = PRESERVE_HEADER_LINES,
): TruncationResult {
  if (typeof output !== 'string') {
    return { result: String(output ?? ''), truncated: false }
  }

  const currentTokens = estimateTokens(output)
  if (currentTokens <= maxTokens) {
    return { result: output, truncated: false }
  }

  const lines = output.split('\n')

  if (lines.length <= preserveHeaderLines) {
    const maxChars = maxTokens * CHARS_PER_TOKEN_ESTIMATE
    return {
      result:
        output.slice(0, maxChars)
        + '\n\n[Output truncated due to context window limit]',
      truncated: true,
    }
  }

  const headerLines = lines.slice(0, preserveHeaderLines)
  const contentLines = lines.slice(preserveHeaderLines)

  const headerText = headerLines.join('\n')
  const headerTokens = estimateTokens(headerText)
  const availableTokens = maxTokens - headerTokens - TRUNCATION_MESSAGE_TOKENS

  if (availableTokens <= 0) {
    return {
      result: headerText + '\n\n[Content truncated due to context window limit]',
      truncated: true,
      removedCount: contentLines.length,
    }
  }

  const resultLines: string[] = []
  let currentTokenCount = 0

  for (const line of contentLines) {
    const lineTokens = estimateTokens(line + '\n')
    if (currentTokenCount + lineTokens > availableTokens) {
      break
    }
    resultLines.push(line)
    currentTokenCount += lineTokens
  }

  const truncatedContent = [...headerLines, ...resultLines].join('\n')
  const removedCount = contentLines.length - resultLines.length

  return {
    result:
      truncatedContent
      + `\n\n[${removedCount} more lines truncated due to context window limit]`,
    truncated: true,
    removedCount,
  }
}

/** The DSH analog of the result's rendered text (sibling H-14/H-15 helper). */
export function readRenderedText(result: unknown): string {
  if (!isObject(result)) return ''
  const content = (result as { readonly content?: unknown }).content
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (!isObject(block)) continue
    const type = (block as { readonly type?: unknown }).type
    const value = (block as { readonly text?: unknown }).text
    if (type === 'text' && typeof value === 'string') text += value
  }
  return text
}

/** True when EVERY content block is a `text` block (see the siblings). */
export function isTextOnlyResultContent(result: unknown): boolean {
  if (!isObject(result)) return false
  const content = (result as { readonly content?: unknown }).content
  if (!Array.isArray(content)) return false
  return content.every((block) => isObject(block)
    && (block as { readonly type?: unknown }).type === 'text')
}

/** The tool name, or `undefined` for a missing/non-string one. */
function readToolName(exec: unknown): string | undefined {
  if (!isObject(exec)) return undefined
  const name = (exec as { readonly name?: unknown }).name
  return typeof name === 'string' ? name : undefined
}

/**
 * `exec.agent.session` — the session the projection is read for
 * (dsh-tools/lib/types/index.d.ts:207-208). `undefined` when the call had no
 * owning agent (a nested PTC dispatch), which degrades to the fixed threshold.
 */
function readSession(exec: unknown): unknown {
  if (!isObject(exec)) return undefined
  const agent = (exec as { readonly agent?: unknown }).agent
  if (!isObject(agent)) return undefined
  return (agent as { readonly session?: unknown }).session
}

/**
 * Read REMAINING tokens from the `contextPressure` projection's CLIENT WIRE VIEW
 * (前置③, corrected by MAJOR-1):
 * `contextWindow − (projectedTokens ?? pressureTokens)`, where the record is
 * `snapshot(session, ['contextPressure']).values.contextPressure`.
 *
 * The wire view — not `stateOf` — is load-bearing. `stateOf` returns the unit's
 * HOST STATE (dsh-session-projection/lib/index.js:127-132), whose schema has
 * `surfaceTokens`/`sampledSurfaceTokens` and NO `projectedTokens`; that field is
 * computed only inside the wire view (dsh-token-meter/lib/index.js:509-516).
 * Reading `stateOf` made the `projectedTokens` branch unreachable and silently
 * under-estimated occupancy, so this reader deliberately has NO `stateOf`
 * fallback: a registry that cannot produce the view means "usage unavailable".
 *
 * Every absent, malformed, or non-finite input means "usage unavailable"
 * (`undefined`) — the caller then applies upstream's fixed-threshold fallback.
 * Leaf reads only: no live session object is copied or serialized, and the view
 * is already schema-validated by the registry before it leaves.
 */
export function readRemainingTokensFromProjection(
  projections: unknown,
  exec: unknown,
): number | undefined {
  const session = readSession(exec)
  if (session === undefined) return undefined
  if (!isObject(projections)) return undefined
  const snapshot = (projections as { readonly snapshot?: unknown }).snapshot
  if (typeof snapshot !== 'function') return undefined
  const cut = (snapshot as (s: unknown, keys?: readonly string[]) => unknown).call(
    projections,
    session,
    [CONTEXT_PRESSURE_PROJECTION],
  )
  if (!isObject(cut)) return undefined
  const values = (cut as { readonly values?: unknown }).values
  if (!isObject(values)) return undefined
  const view = (values as { readonly [key: string]: unknown })[CONTEXT_PRESSURE_PROJECTION]
  if (!isObject(view)) return undefined
  const record = view as {
    readonly contextWindow?: unknown
    readonly projectedTokens?: unknown
    readonly pressureTokens?: unknown
  }
  const contextWindow = record.contextWindow
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow)) return undefined
  const used = typeof record.projectedTokens === 'number' && Number.isFinite(record.projectedTokens)
    ? record.projectedTokens
    : typeof record.pressureTokens === 'number' && Number.isFinite(record.pressureTokens)
      ? record.pressureTokens
      : undefined
  if (used === undefined) return undefined
  return contextWindow - used
}

/**
 * Builds the reader the registrar hands to the decision: it looks the
 * `sessionProjections` service up PER EVENT through the cordis context (see the
 * header's discipline ③ on why the lookup is not cached at apply time). A
 * context without `get`, a deployment without the token-meter plugin, or a
 * registry without the `snapshot` wire-view face makes every call return
 * `undefined` — the degraded-but-honest fixed-threshold path.
 */
export function buildRemainingTokenReader(ctx: HooksRegistrationContext): RemainingTokenReader {
  return (exec: unknown): number | undefined => {
    if (typeof ctx.get !== 'function') return undefined
    return readRemainingTokensFromProjection(ctx.get('sessionProjections'), exec)
  }
}

/**
 * The pure decision: `undefined` means "not our call, delegate"; a decision
 * means "replace the content with the truncated text". Faithful to upstream's
 * order: whitelist (or `truncateAll`) → usage (adaptive vs fixed) → exhausted
 * branch → algorithm → write ONLY when `truncated`.
 */
export function decideToolOutputTruncation(
  exec: unknown,
  result: unknown,
  options: TruncatorOptions = {},
): TruncatorAcceptDecision | undefined {
  const tool = readToolName(exec)
  if (tool === undefined) return undefined
  const truncateAll = options.truncateAll ?? TOOL_OUTPUT_TRUNCATOR_TRUNCATE_ALL
  if (!truncateAll && !TRUNCATABLE_TOOLS.includes(tool)) return undefined
  if (!isObject(result)) return undefined
  if (!isTextOnlyResultContent(result)) return undefined

  const text = readRenderedText(result)
  const targetMaxTokens = TOOL_SPECIFIC_MAX_TOKENS[tool] ?? DEFAULT_MAX_TOKENS
  const remaining = options.readRemainingTokens?.(exec)

  let outcome: TruncationResult
  if (remaining === undefined || !Number.isFinite(remaining)) {
    // Upstream's `if (!usage)` fallback: a conservative FIXED tool threshold.
    outcome = truncateToTokenLimit(text, targetMaxTokens, PRESERVE_HEADER_LINES)
  } else {
    const maxOutputTokens = Math.min(remaining * 0.5, targetMaxTokens)
    outcome = maxOutputTokens <= 0
      ? { result: CONTEXT_EXHAUSTED_RESULT, truncated: true }
      : truncateToTokenLimit(text, maxOutputTokens, PRESERVE_HEADER_LINES)
  }

  if (!outcome.truncated) return undefined
  return { kind: 'accept', content: [{ type: 'text', text: outcome.result }] }
}

/**
 * The listener body: decide from OUR logic inside a fail-open try/catch, then
 * delegate — or return the rewrite. The `next()` calls are deliberately OUTSIDE
 * the try (header discipline ②); upstream's "rethrow a non-Error rejection" is
 * deliberately NOT ported.
 */
async function handleToolOutputTruncation(
  exec: unknown,
  result: unknown,
  next: unknown,
  options: TruncatorOptions,
): Promise<unknown> {
  const delegate = next as PostExecuteNextLike
  let decision: TruncatorAcceptDecision | undefined
  try {
    decision = decideToolOutputTruncation(exec, result, options)
  } catch {
    // Fail open: a truncation defect must never turn a successful tool result
    // into an isError (the discipline change recorded in the header).
    return delegate()
  }
  if (decision === undefined) return delegate()
  return decision
}

/**
 * Registers the ONE listener through `ctx.on` (the preferred channel). The
 * per-event dependency list is fixed at apply time; the SERVICE LOOKUP itself
 * stays per event (header discipline ③). The event comes from the manifest row,
 * never a second literal.
 */
export const registerToolOutputTruncator: HookRegistrar = (
  ctx,
  entry: HookManifestEntry,
) => {
  const options: TruncatorOptions = {
    truncateAll: TOOL_OUTPUT_TRUNCATOR_TRUNCATE_ALL,
    readRemainingTokens: buildRemainingTokenReader(ctx),
  }
  ctx.on(entry.event, (exec, result, next) => handleToolOutputTruncation(exec, result, next, options))
}
