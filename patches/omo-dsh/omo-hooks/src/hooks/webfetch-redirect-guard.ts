// webfetch-redirect-guard.ts — P3-T16 listener (task book WP-6 批 C; plan §4.2
// pattern B + D): OMO's WebFetch redirect guard, reborn as a
// `tools/pre-execute` DENY gate plus a `tools/post-execute` result rewrite.
// This is the B-mode PILOT for Phase 3 (the plan revision moved the pilot here
// after P3-T5 / the WP-2 arbitration removed H-01) — the shape the other
// 权威拒绝型 hooks copy.
//
// Upstream: packages/omo-opencode/src/hooks/webfetch-redirect-guard/ @ v4.19.4
//   (frozen baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a).
//   FIVE files, ALL of them audited for this port — 4 implementation +
//   1 test:
//     * .../webfetch-redirect-guard/constants.ts        (MAX_WEBFETCH_REDIRECTS,
//         the 301/302/303/307/308 status set, the two redirect-error patterns,
//         the 15-minute stale sweep, the 30s/120s timeout bounds)
//     * .../webfetch-redirect-guard/hook.ts             (the two listeners:
//         `tool.execute.before` pre-resolution + `tool.execute.after` rewrite)
//     * .../webfetch-redirect-guard/index.ts            (barrel export)
//     * .../webfetch-redirect-guard/redirect-resolution.ts (the manual-redirect
//         loop: `fetch(..., { redirect: "manual" })`, Location resolution,
//         `>= MAX` → exceeded)
//     * .../webfetch-redirect-guard/index.test.ts       (6 `it` — the R-3 unit
//         seed; its three real cases are: one-hop redirect → final URL,
//         RELATIVE Location resolution, chain-over-limit → clear message, plus
//         the three negatives: "raw loop error without tracked state",
//         "successful content mentioning redirect loops stays unchanged" and the
//         non-webfetch pass-through that leaves the args untouched)
//   语义移植（非逐字复制）: the REDIRECT-COUNTING SEMANTICS (status set, hop cap,
//   relative-Location resolution, exceeded outcome) and the ERROR-PATTERN
//   table are transcribed; the LANDING (deny + reason, result rewrite) is
//   DSH's. No upstream code is vendored; this is a new listener.
//
// ═══════════ 形态降级 (B, explicit — plan §6 R-2 / P3-T1 §8 草案更正) ═══════════
// Upstream's before-half does TWO things: (1) it really PRE-RESOLVES the chain
// with a manual-redirect `fetch`, and (2) `replaceToolArgs(output, { url })`
// REWRITES the tool arguments to the final URL so the tool skips the chain.
// DSH has NO argument-rewrite seam: `tools/pre-execute` is documented as
// "Input rewriting is excluded because arguments are already logged and
// presented" (dsh-tools/lib/types/index.d.ts:416), and the parsed arguments
// are deep-frozen. The port therefore DEGRADES "rewrite to the final URL" into
// "DENY and hand the model the final URL" — the P3-T1 §8 recommendation,
// recorded in phase3-hooks.md H-24 as B（降级：deny 携带最终 URL）:
//
//   upstream  replaceToolArgs → tool fetches the FINAL URL automatically
//   DSH       { kind: 'deny', reason: '…retry web_fetch with "<final url>"…' }
//
// The semantic cost is ONE extra model round trip for a redirecting URL; the
// conserved property is the same one upstream's rewrite produced — the fetch
// ends up against the final URL, and the model is told which URL that is. The
// DENY reason is therefore not cosmetic: it is the only carrier of the final
// URL, and it is the one thing DSH's own provider does NOT report when it
// refuses a cross-origin redirect (`cross-origin redirect to <origin> is not
// followed automatically; retry against that URL directly` names the ORIGIN,
// never the full target — dsh-web-fetch-http/lib/index.js:479).
//
// WHAT THE B HALF DOES **NOT** DO (recorded, not hidden):
//   * It does not deny a URL that really is a redirect loop by itself — it
//     pre-resolves and denies on the OUTCOME (a chain that stays inside the
//     hop cap resolves to a final URL; one that leaves it is `exceeded`).
//   * It does not rewrite, reorder or annotate the arguments (no seam).
//   * It does not read the response body: only `status` and the `Location`
//     header are leaves of the pre-resolution, and the body is cancelled
//     best-effort after each hop.
//
// ═══════════ THE PREREQUISITE CHECK (R-8 native-first) — MEASURED ═══════════
// Does DSH cover the guard natively? PARTIALLY, and the split is what the port
// is scoped to (measured at the pinned install 0.1.5-rc.1):
//   * `dsh-web-fetch-http` ALREADY follows SAME-ORIGIN redirects up to
//     `maxRedirects` (config default 5) and returns the final URL in its
//     `value.url` (lib/index.js:458 `followAndRead`, `:648` the Config’s `maxRedirects` default).
//     So upstream's *convenience* goal (do not bounce through the chain) is
//     natively served for the same-origin case.
//   * It REFUSES a cross-origin redirect with `WEB_REDIRECT_BLOCKED`
//     (`:479`) and refuses a chain past the cap with `exceeded the maximum of
//     ${maxRedirects} redirects` (`:468`) — but neither message names the final
//     URL, which is exactly the residual this port supplies.
//   * The residual the port does NOT need to invent: the error TEXT is already
//     clear and structured, so the D half does not paraphrase a vague error —
//     it NORMALIZES the block into one actionable message (upstream's job) and
//     keeps the measured cap in the text.
//
// ═══════════ THE D HALF (post-execute) — upstream :115-130 ═══════════
// Upstream's after-half has TWO rules, in order:
//   (1) a tracked pending failure (the before-half's `exceeded` path) rewrites
//       the result with `buildRedirectLimitMessage(originalUrl)`;
//   (2) ELSE, an error result whose text matches a redirect-loop pattern is
//       normalized with `buildRedirectLimitMessage()` (no URL).
// On DSH rule (1) is realized by the PAIRING (below): a call WE denied never
// dispatched, and its result is already our reason, so the D half must leave it
// alone. Rule (2) is the live half: a `web_fetch` that reached the provider and
// came back `WEB_REDIRECT_BLOCKED` gets its content replaced by the normalized
// message. DELIBERATE IMPROVEMENT on rule (2): upstream had no URL to name there
// (it only kept the original URL for its rule-1 pending map) and printed the
// bare message; this port reads the requested URL straight off the SAME `exec`
// object and always names it. The patterns are the upstream two PLUS the two
// measured DSH-native shapes (the H-14/H-15 precedent: the upstream strings are
// kept as an audit table, and the DSH table is rebuilt from the strings DSH
// really produces).
//
// ═══════════ PRE/POST PAIRING — NATIVE, NO BARE MAP (discipline ⑤) ═══════════
// Upstream keyed `pendingFailures` by the STRING `${sessionID}:${callID}` in a
// module-level Map and swept it every 15 minutes
// (`WEBFETCH_REDIRECT_GUARD_STALE_TIMEOUT_MS`) because a string-keyed map leaks
// every call that never gets an after-event. DSH hands BOTH waterfall stages the
// SAME live `ToolExecution` object (dsh-tools/lib/index.js `prepareExecution`
// passes `exec` to the pre-execute waterfall at `:3116`, then forwards that same
// object through `post-result` → `finalizeScheduledExecution(exec, …)` →
// `postExecute(exec, result)` at `:3377`), and that object carries
// `callId` and the registry-assigned `token`. The pairing is therefore a
// WeakMap KEYED BY THE EXEC OBJECT — `exec.callId`/`exec.token` are the native
// identity fields this port records inside the entry, never a re-derived string
// key — and no stale sweep is needed: the entry dies with the execution.
//
// ═══════════ SECURITY DEVIATION — REGISTERED (report 质疑①) ═══════════
// The B half POINTS THE HOST'S `fetch` AT A MODEL-CHOSEN URL, BEFORE the DSH
// provider's public-address policy runs (`resolvePublicAddresses` refuses
// non-public destinations, dsh-web-fetch-http/lib/index.js:55-79). Upstream had
// the same shape (its pre-resolution is a plain `fetch`), so this is parity, not
// an invention — but on DSH the native tool WOULD have refused an internal
// destination and the guard's pre-resolution does not. It is a GET with a
// browser UA, `redirect: "manual"`, no credentials and no body read: a
// reachability probe of the model-chosen host, not a data channel. Recorded as
// a deviation for arbitration (options: mirror the address policy / drop the
// pre-resolution and keep only the D half / accept upstream parity). The
// pre-resolution is also BOUNDED (30s default, 120s max, upstream's
// `normalizeTimeoutMs`) and composed with the call's own `exec.signal`, so a
// cancelled tool call cancels its probe.
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2, all modes):
//   ② the listener bodies wrap their OWN logic in try/catch and fail OPEN
//      (`return next()`). In pre-execute a THROW is fail-CLOSED and bypasses
//      post-execute entirely (`prepareExecution`'s catch returns
//      `{kind:'final-result'}` — dsh-tools/lib/index.js:3150-3153), which is
//      exactly why the refusal here is an explicit `{kind:'deny', reason}`
//      decision and NEVER a throw; in post-execute a throw replaces the whole
//      result with an isError (`finalizeScheduledExecution`'s catch, `:3245-3247`,
//      i.e. the whole method `:3241-3248`).
//      Both `next()` calls sit OUTSIDE the try so a downstream rejection is
//      neither swallowed nor retried.
//   ③ no disk reads on the event path — the constants and both message
//      builders are module-level; the ONLY I/O is the pre-resolution request
//      described (and registered) above.
//   ⑤ the cross-stage state is a per-registration WeakMap keyed by the live
//      execution object (see the pairing section) — never a module-level bare
//      Map, and nothing to dispose beyond the fiber that owns the listener.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar } from '../index.ts'

/** The manifest id this registrar implements (manifest.ts row H-24). */
export const WEBFETCH_REDIRECT_GUARD_ID = 'webfetch-redirect-guard'

/** The PRIMARY surface: the B-mode deny gate (the manifest row's `event`). */
export const WEBFETCH_REDIRECT_GUARD_EVENT = 'tools/pre-execute'

/**
 * The SECONDARY surface: the D-mode result rewrite. A B+D row owns its full
 * surface set inside its registrar (index.ts discipline ④); the boot marker
 * keeps printing the PRIMARY event only.
 */
export const WEBFETCH_REDIRECT_GUARD_SECONDARY_EVENT = 'tools/post-execute'

/**
 * The VERIFIED DSH web-fetch tool registration name. Measured at the pinned
 * install: `defineTool({ name: "web_fetch", parameters: { url: … } })`
 * (dsh-tool-web/lib/index.js:737-742), mounted by the `tool-web` row
 * (`fetch: true`, the shipped concerto preset's model-facing rows). Upstream
 * compared `toolName.toLowerCase() === "webfetch"`.
 */
export const DSH_WEB_FETCH_TOOL_NAME = 'web_fetch'

/**
 * Upstream's own tool name, kept so a deployment that registers the opencode
 * spelling still hits the gate — the comparison is a plain set membership over
 * canonical lowercase ids, never a `toLowerCase()` (DSH's registry already
 * names tools canonically; bash-file-read-guard.ts makes the same choice).
 */
export const UPSTREAM_WEB_FETCH_TOOL_NAME = 'webfetch'

/** The tool names this gate covers, in match order (see the two constants). */
export const WEB_FETCH_TOOL_NAMES: readonly string[] = [
  DSH_WEB_FETCH_TOOL_NAME,
  UPSTREAM_WEB_FETCH_TOOL_NAME,
]

// --- upstream constants.ts, transcribed -------------------------------------
// Kept verbatim (and exported) so a diff against
// hooks/webfetch-redirect-guard/constants.ts stays a line-by-line read.

/** Upstream constants.ts:3 — the manual-redirect hop cap. */
export const MAX_WEBFETCH_REDIRECTS = 10

/** Upstream constants.ts:1 — the default pre-resolution timeout. */
export const DEFAULT_WEBFETCH_TIMEOUT_MS = 30_000

/** Upstream constants.ts:2 — the pre-resolution timeout ceiling. */
export const MAX_WEBFETCH_TIMEOUT_MS = 120_000

/**
 * Upstream constants.ts:4 — the stale-sweep window of its string-keyed
 * `pendingFailures` Map. NOT USED by this port: the pairing is a WeakMap keyed
 * by the live execution object, so an abandoned call's entry is collected with
 * the execution instead of surviving for 15 minutes. The constant is kept and
 * exported as the audit record of the mechanism that was replaced (the
 * discipline⑤ note in the header).
 */
export const WEBFETCH_REDIRECT_GUARD_STALE_TIMEOUT_MS = 15 * 60 * 1000

/**
 * Upstream constants.ts:6-9 — the two redirect-loop error patterns, kept as the
 * AUDIT table. They are matched as well (a provider that reports the opencode
 * wording still gets normalized), but on this runtime the DSH-native table
 * below is what really fires.
 */
export const UPSTREAM_WEBFETCH_REDIRECT_ERROR_PATTERNS: readonly RegExp[] = [
  /redirected too many times/i,
  /too many redirects/i,
]

/**
 * The MEASURED DSH-native redirect-block error shapes (dsh-web-fetch-http/
 * lib/index.js):
 *   * `:468` `exceeded the maximum of ${maxRedirects} redirects`
 *     (`WEB_REDIRECT_BLOCKED`; `maxRedirects` config default 5)
 *   * `:479` `cross-origin redirect to ${origin} is not followed automatically;
 *     retry against that URL directly` (`WEB_REDIRECT_BLOCKED`)
 * The leading `exceeded the maximum of N redirects` capture is what lets the D
 * half report the RUNTIME's cap instead of upstream's 10 (see
 * {@link buildRedirectLimitMessage}); a cross-origin block has no cap to report
 * and gets its own honest wording ({@link buildCrossOriginRedirectMessage}).
 */
/** The DSH over-cap shape — its capture is the cap the D half reports. */
export const DSH_WEBFETCH_REDIRECT_CAP_PATTERN = /exceeded the maximum of (\d+) redirects/i

/** The DSH cross-origin shape — no cap exists, so the D half uses its own wording. */
export const DSH_WEBFETCH_REDIRECT_CROSS_ORIGIN_PATTERN =
  /cross-origin redirect to \S+ is not followed automatically/i

/** The two measured DSH shapes, in a fixed order (see the two constants above). */
export const DSH_WEBFETCH_REDIRECT_ERROR_PATTERNS: readonly RegExp[] = [
  DSH_WEBFETCH_REDIRECT_CAP_PATTERN,
  DSH_WEBFETCH_REDIRECT_CROSS_ORIGIN_PATTERN,
]

/** The full live table: upstream's two patterns then the DSH-native two. */
export const WEBFETCH_REDIRECT_ERROR_PATTERNS: readonly RegExp[] = [
  ...UPSTREAM_WEBFETCH_REDIRECT_ERROR_PATTERNS,
  ...DSH_WEBFETCH_REDIRECT_ERROR_PATTERNS,
]

/**
 * Upstream constants.ts:11 — the redirect status codes carrying a `Location`
 * that the manual loop keeps following. Transcribed verbatim.
 */
export const WEBFETCH_REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])

/**
 * The marker every message this port writes carries. It is what makes the deny
 * reason greppable in a session log AND what makes the D half idempotent (a
 * result that already carries it is left alone).
 */
export const WEBFETCH_REDIRECT_GUARD_MARKER = 'WebFetch redirect guard'

/** The format vocabulary of upstream's `getWebFetchFormat` (redirect-resolution.ts:8). */
export type WebFetchFormat = 'markdown' | 'text' | 'html'

/** Parameters of the manual-redirect pre-resolution (upstream's own shape). */
export interface RedirectResolutionParams {
  readonly url: string
  readonly timeoutSeconds?: number
}

/**
 * The pre-resolution outcome. `redirectCount` is a PORT ADDITION to upstream's
 * `{type:'resolved', url}`: the deny reason reports how many hops were
 * followed, and upstream's rewrite did not need to say.
 */
export type RedirectResolutionResult =
  | { readonly type: 'resolved'; readonly url: string; readonly redirectCount: number }
  | { readonly type: 'exceeded'; readonly url: string; readonly maxRedirects: number }

/** The `fetch` subset the pre-resolution uses — injectable so tests are hermetic. */
export type RedirectFetchLike = (
  url: string,
  init: {
    readonly headers: Record<string, string>
    readonly redirect: 'manual'
    readonly signal: AbortSignal
  },
) => Promise<{
  readonly status: number
  readonly headers: { get(name: string): string | null }
  readonly body?: { cancel(): Promise<void> } | null
}>

/** Upstream redirect-resolution.ts:20-29 — the per-format Accept header. */
function buildAcceptHeader(format: WebFetchFormat): string {
  switch (format) {
    case 'markdown':
      return 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1'
    case 'text':
      return 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1'
    case 'html':
      return 'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1'
  }
}

/**
 * Upstream redirect-resolution.ts:31-38, transcribed INCLUDING the hardcoded
 * Chrome user agent. P3-T1 §8 flagged the UA as a port decision: it is KEPT
 * (parity) so the pre-resolution sees the same redirect behaviour a browser
 * fetch would; the alternative — DSH's own `DEFAULT_USER_AGENT` — would make
 * the probe disagree with upstream on UA-sensitive sites. Registered as an
 * arbitration item in this task's report.
 */
export function buildWebFetchHeaders(format: WebFetchFormat): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    Accept: buildAcceptHeader(format),
    'Accept-Language': 'en-US,en;q=0.9',
  }
}

/**
 * Upstream redirect-resolution.ts:40-46, verbatim in behaviour: a missing,
 * non-finite or non-positive timeout falls back to the 30s default, and a valid
 * one is clamped to the 120s ceiling.
 */
export function normalizeTimeoutMs(timeoutSeconds?: number): number {
  if (typeof timeoutSeconds !== 'number' || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    return DEFAULT_WEBFETCH_TIMEOUT_MS
  }
  return Math.min(timeoutSeconds * 1000, MAX_WEBFETCH_TIMEOUT_MS)
}

/**
 * Upstream redirect-resolution.ts:48-50 (`new URL(location, currentUrl)`), i.e.
 * RFC 3986 relative resolution against the CURRENT hop.
 *
 * @throws {TypeError} when `location` cannot be resolved (a malformed Location
 *   header); the caller treats that as "pre-resolution unavailable" and fails
 *   open, exactly like upstream's outer catch.
 */
export function resolveRedirectLocation(currentUrl: string, location: string): string {
  return new URL(location, currentUrl).toString()
}

/**
 * The manual-redirect loop — upstream redirect-resolution.ts:52-88 transcribed
 * case for case, with `exec.signal` fused into the timeout signal (a cancelled
 * tool call must not keep probing) and the response body cancelled after each
 * hop — including the TERMINAL hop, whose page body is the one most worth
 * releasing:
 *
 *   * `fetch(currentUrl, { headers, redirect: 'manual', signal })`
 *   * body cancelled best-effort (never read)
 *   * not a redirect status          → `{type:'resolved', url: currentUrl}`
 *   * redirect status without Location → `{type:'resolved', url: currentUrl}`
 *   * `redirectCount >= MAX`          → `{type:'exceeded', …}`
 *   * else Location is resolved against the current URL and the loop continues
 *
 * @param params - the URL, plus upstream's `timeoutSeconds` knob when a caller
 *   sets it. `RedirectResolutionParams` has NO `format` knob (the format was
 *   trimmed at the rewrite seam and the Accept header is fixed to markdown),
 *   and `timeoutSeconds` is really honored through
 *   {@link normalizeTimeoutMs} — it is merely never SET by the deny path,
 *   which always passes `{ url }`.
 * @param fetchImpl - the fetch to use; defaults to the host global.
 * @param callerSignal - the tool call's own cancellation signal, when present.
 */
export async function resolveWebFetchRedirects(
  params: RedirectResolutionParams,
  fetchImpl: RedirectFetchLike = fetch as unknown as RedirectFetchLike,
  callerSignal?: AbortSignal,
): Promise<RedirectResolutionResult> {
  const timeoutMs = normalizeTimeoutMs(params.timeoutSeconds)
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal =
    callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal])
  const headers = buildWebFetchHeaders('markdown')

  let currentUrl = params.url
  let redirectCount = 0

  for (;;) {
    const response = await fetchImpl(currentUrl, { headers, redirect: 'manual', signal })

    // Best-effort body release BEFORE every early return below — the terminal
    // hop (a real page, possibly large) included. The pre-resolution never reads
    // a body, so cancelling first costs nothing; an unconsumed stream would
    // otherwise pin the socket.
    await cancelBody(response)

    if (!WEBFETCH_REDIRECT_STATUSES.has(response.status)) {
      return { type: 'resolved', url: currentUrl, redirectCount }
    }

    const location = response.headers.get('location')

    if (!location) {
      return { type: 'resolved', url: currentUrl, redirectCount }
    }

    if (redirectCount >= MAX_WEBFETCH_REDIRECTS) {
      return { type: 'exceeded', url: params.url, maxRedirects: MAX_WEBFETCH_REDIRECTS }
    }

    currentUrl = resolveRedirectLocation(currentUrl, location)
    redirectCount += 1
  }
}

/** Release a response body without reading it; a hostile server must not throw here. */
async function cancelBody(response: { readonly body?: { cancel(): Promise<void> } | null }): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // Best-effort only: the hop is already classified by status + Location.
  }
}

// --- minimal structural typings of the DSH surface this file touches ---------
// Same discipline as bash-file-read-guard.ts: this workspace has no dsh
// dependency, so only the shapes actually read are declared.

/** The B-mode decision (dsh-tools PreToolDecision's `deny` arm). */
export interface PreToolDenyDecision {
  readonly kind: 'deny'
  readonly reason: string
}

/** The D-mode decision: replace the rendered content of a failed result. */
export interface PostExecuteContentDecision {
  readonly kind: 'accept'
  readonly content: readonly { readonly type: 'text'; readonly text: string }[]
}

/** The `tools/pre-execute` delegator handed to the listener by the waterfall. */
export type PreExecuteNextLike = () => Promise<unknown>

/** The `tools/post-execute` delegator (three-argument waterfall). */
export type PostExecuteNextLike = () => Promise<unknown>

/**
 * The per-registration pairing state: the executions THIS listener denied,
 * keyed by the live execution object (see the header's pairing section). The
 * stored value records the native identity fields for diagnostics, so a test
 * can prove the pairing really used `callId`/`token` rather than a re-derived
 * key.
 */
export type PendingDenial = {
  readonly callId: unknown
  readonly token: unknown
  readonly reason: string
}

/** The built reason text of the deny decision (also the D half's skip signal). */
export interface RedirectDenyReasonParts {
  readonly requestedUrl: string
  readonly finalUrl: string
  readonly redirectCount: number
}

/** True when `exec.name` is one of the covered web-fetch tool names. */
export function isWebFetchExecution(exec: unknown): boolean {
  if (typeof exec !== 'object' || exec === null) return false
  const name = (exec as { readonly name?: unknown }).name
  return typeof name === 'string' && WEB_FETCH_TOOL_NAMES.includes(name)
}

/**
 * Reads `exec.arguments.url` defensively: a missing/non-object arguments bag, a
 * non-string URL or an empty one is "not our call" — upstream's
 * `getWebFetchUrl` (`typeof args.url === 'string' && args.url.length > 0`).
 */
export function readWebFetchUrl(argumentsBag: unknown): string | undefined {
  if (typeof argumentsBag !== 'object' || argumentsBag === null) return undefined
  const url = (argumentsBag as { readonly url?: unknown }).url
  return typeof url === 'string' && url.length > 0 ? url : undefined
}

/**
 * The B half's reason text. It MUST carry the final URL: that string is the
 * whole point of the degraded B mode (the model cannot be handed a rewritten
 * argument, so it has to be told what to call next).
 *
 * The text does NOT start with `Error: ` — DSH materializes a deny as
 * ``Error: ${reason}`` (dsh-tools/lib/index.js:3134), so a prefix here
 * would double it. It DOES carry {@link WEBFETCH_REDIRECT_GUARD_MARKER} so both
 * the D half and the e2e can recognize it.
 */
export function buildRedirectDenyReason(parts: RedirectDenyReasonParts): string {
  const hops = parts.redirectCount === 1 ? '1 redirect' : `${parts.redirectCount} redirects`
  return `${WEBFETCH_REDIRECT_GUARD_MARKER}: "${parts.requestedUrl}" follows ${hops} to `
    + `"${parts.finalUrl}". This harness cannot rewrite tool arguments, so re-issue `
    + `web_fetch with the final URL "${parts.finalUrl}" directly.`
}

/**
 * The `exceeded` reason (upstream's `buildRedirectLimitMessage` shape, reused by
 * the B half so a chain over the cap is denied with the same normalized text the
 * D half would write). `cap` defaults to upstream's constant and is overridden
 * by the MEASURED runtime cap when the D half recognized one.
 *
 * `errorPrefix` reproduces upstream's own `Error: ` lead-in, which belongs to
 * the D half only: its decision REPLACES the whole rendered content, so the
 * prefix is part of the message there. The B half passes `errorPrefix: false`,
 * because DSH materializes a deny as ``Error: ${reason}`` (dsh-tools/lib/
 * index.js:3134) — a prefix inside the reason would double it, which is the
 * same discipline {@link buildRedirectDenyReason} documents.
 */
export function buildRedirectLimitMessage(
  url?: string,
  cap: number = MAX_WEBFETCH_REDIRECTS,
  options: { readonly errorPrefix?: boolean } = {},
): string {
  const suffix = url ? ` for ${url}` : ''
  const message = `WebFetch failed: exceeded maximum redirects (${cap})${suffix}`
  return options.errorPrefix === false ? message : `Error: ${message}`
}

/**
 * The cross-origin variant: the DSH provider refuses a redirect that leaves the
 * origin (`cross-origin redirect to <origin> is not followed automatically`), and
 * in that case there is NO hop cap to report — upstream's `(10)` would be a
 * fabricated cause. The message therefore names the real cause and keeps the
 * actionable half (retry against the final URL directly).
 */
export function buildCrossOriginRedirectMessage(url?: string): string {
  const suffix = url ? ` for ${url}` : ''
  return `Error: WebFetch failed: the redirect was blocked as cross-origin${suffix}. `
    + 'This harness follows only same-origin redirects; retry web_fetch with the final URL directly.'
}

/**
 * The B half's pure decision CORE: pre-resolve, then decide. `undefined` means
 * "not our call / no redirect / pre-resolution unavailable → let the waterfall
 * continue"; a decision means "refuse with a reason that names the final URL".
 *
 * The three outcomes mirror upstream's before-half exactly:
 *   * `resolved` to the SAME url (no redirect)  → upstream returned without
 *     touching the args; here that is `undefined` (pass through).
 *   * `resolved` to a DIFFERENT url             → upstream rewrote; here DENY.
 *   * `exceeded`                                → upstream stored a pending
 *     failure and let the call run, then rewrote the after-result; here DENY.
 *
 * A pre-resolution FAILURE (network error, invalid URL, aborted signal) is
 * upstream's `catch { log(...) }` arm: it must never block a legitimate fetch,
 * so it is reported as `undefined` (fail open).
 */
export async function decideWebFetchRedirectDeny(
  exec: unknown,
  fetchImpl?: RedirectFetchLike,
): Promise<PreToolDenyDecision | undefined> {
  if (!isWebFetchExecution(exec)) return undefined
  const e = exec as {
    readonly arguments?: unknown
    readonly signal?: unknown
  }
  const url = readWebFetchUrl(e.arguments)
  if (url === undefined) return undefined

  const signal = isAbortSignal(e.signal) ? e.signal : undefined
  let resolution: RedirectResolutionResult
  try {
    resolution = await resolveWebFetchRedirects({ url }, fetchImpl, signal)
  } catch {
    // Fail open: an unreachable/invalid URL is the tool's business, not ours.
    return undefined
  }

  if (resolution.type === 'exceeded') {
    // `errorPrefix: false` — DSH adds the `Error: ` lead-in when it
    // materializes this deny (dsh-tools/lib/index.js:3134).
    return {
      kind: 'deny',
      reason: buildRedirectLimitMessage(
        resolution.url,
        MAX_WEBFETCH_REDIRECTS,
        { errorPrefix: false },
      ),
    }
  }
  if (resolution.url === url) return undefined
  return {
    kind: 'deny',
    reason: buildRedirectDenyReason({
      requestedUrl: url,
      finalUrl: resolution.url,
      redirectCount: resolution.redirectCount,
    }),
  }
}

/** Narrow {@link unknown} to a real AbortSignal (structural, no dsh import). */
function isAbortSignal(value: unknown): value is AbortSignal {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as { readonly aborted?: unknown }).aborted === 'boolean'
    && typeof (value as { readonly addEventListener?: unknown }).addEventListener === 'function'
}

/** The execution identity fields the pairing records (leaves only). */
function executionIdentity(exec: unknown): { callId: unknown; token: unknown } {
  if (typeof exec !== 'object' || exec === null) return { callId: undefined, token: undefined }
  const e = exec as { readonly callId?: unknown; readonly token?: unknown }
  return { callId: e.callId, token: e.token }
}

/** The rendered text of a tool result: its `text` content blocks joined. */
export function readResultText(result: unknown): string | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const content = (result as { readonly content?: unknown }).content
  if (!Array.isArray(content)) return undefined
  return content
    .filter((block): block is { readonly type: 'text'; readonly text: string } =>
      typeof block === 'object'
      && block !== null
      && (block as { readonly type?: unknown }).type === 'text'
      && typeof (block as { readonly text?: unknown }).text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/** True when the result is an error (the native flag; the text prefix is the structural-fake fallback). */
export function isErrorResult(result: unknown): boolean {
  if (typeof result === 'object' && result !== null) {
    const flag = (result as { readonly isError?: unknown }).isError
    // A real canonical result always carries the boolean; honor it strictly so
    // a successful result that merely mentions an error stays untouched. The
    // text sniff below is upstream's `isToolErrorOutput` and only runs for a
    // structural fake with no flag at all.
    if (typeof flag === 'boolean') return flag
  }
  const text = readResultText(result)
  return text !== undefined && text.trimStart().toLowerCase().startsWith('error:')
}

/**
 * The D half's decision. `undefined` means "leave the result alone" and covers:
 *   * not a web-fetch call, or no result;
 *   * THIS call was denied by our own B half (the pairing hit) — the result is
 *     already our reason, and rewriting it would be a no-op at best;
 *   * a result we already normalized (the marker check — idempotence);
 *   * a successful result, or a failure that mentions redirects only in prose
 *     (upstream's "successful content mentioning redirect loops" negative test).
 */
export function decideWebFetchRedirectResultRewrite(
  exec: unknown,
  result: unknown,
  pending: WeakMap<object, PendingDenial>,
): PostExecuteContentDecision | undefined {
  if (!isWebFetchExecution(exec)) return undefined
  if (typeof exec === 'object' && exec !== null && pending.has(exec)) {
    // Our own deny: its reason is already the final-URL guidance. Consume the
    // entry so a repeated post-execute for the same execution cannot loop.
    pending.delete(exec)
    return undefined
  }
  if (!isErrorResult(result)) return undefined
  const text = readResultText(result)
  if (text === undefined) return undefined
  if (text.includes(WEBFETCH_REDIRECT_GUARD_MARKER)) return undefined
  const matched = WEBFETCH_REDIRECT_ERROR_PATTERNS.find((pattern) => pattern.test(text))
  if (matched === undefined) return undefined

  const url = readWebFetchUrl((exec as { readonly arguments?: unknown }).arguments)
  const capMatch = DSH_WEBFETCH_REDIRECT_CAP_PATTERN.exec(text)
  // Three-way wording, driven by WHICH pattern matched (never by a guess):
  //   * the DSH over-cap message carries its own cap capture → report it;
  //   * an upstream / provider loop error without a cap → upstream's own
  //     `buildRedirectLimitMessage()` sentence (its default constant) PLUS the
  //     requested URL read off this same `exec` — upstream's bare form is the
  //     DELIBERATE IMPROVEMENT registered in the header (:90-93), so the text is
  //     the upstream SENTENCE, not upstream's exact output;
  //   * the DSH cross-origin block names no cap because there is none → the
  //     honest cross-origin wording instead of a fabricated `(10)`.
  const isCrossOrigin = matched === DSH_WEBFETCH_REDIRECT_CROSS_ORIGIN_PATTERN
  const normalized = isCrossOrigin
    ? buildCrossOriginRedirectMessage(url)
    : buildRedirectLimitMessage(
        url,
        capMatch === null ? MAX_WEBFETCH_REDIRECTS : Number(capMatch[1]),
      )
  return {
    kind: 'accept',
    content: [{ type: 'text', text: normalized }],
  }
}

/**
 * The B-half listener body: decide inside a fail-open try/catch, then either
 * delegate or return the deny decision. `next()` is OUTSIDE the try (header
 * discipline ②).
 *
 * `fetchImpl` is the same injectable pre-resolution transport
 * {@link decideWebFetchRedirectDeny} takes; the registrar never passes it, so
 * production always uses the host global.
 */
export async function handleWebFetchPreExecute(
  exec: unknown,
  next: unknown,
  pending: WeakMap<object, PendingDenial>,
  fetchImpl?: RedirectFetchLike,
): Promise<unknown> {
  const delegate = next as PreExecuteNextLike
  let decision: PreToolDenyDecision | undefined
  try {
    decision = await decideWebFetchRedirectDeny(exec, fetchImpl)
  } catch {
    // Fail open. A throw HERE would be fail-CLOSED and would bypass
    // post-execute entirely (dsh-tools prepareExecution's catch), which is the
    // unauditable shape the plan's discipline ② forbids.
    return delegate()
  }
  if (decision === undefined) return delegate()
  if (typeof exec === 'object' && exec !== null) {
    const identity = executionIdentity(exec)
    pending.set(exec, { callId: identity.callId, token: identity.token, reason: decision.reason })
  }
  return decision
}

/** The D-half listener body (fail open: any throw leaves the result untouched). */
export async function handleWebFetchPostExecute(
  exec: unknown,
  result: unknown,
  next: unknown,
  pending: WeakMap<object, PendingDenial>,
): Promise<unknown> {
  const delegate = next as PostExecuteNextLike
  let decision: PostExecuteContentDecision | undefined
  try {
    decision = decideWebFetchRedirectResultRewrite(exec, result, pending)
  } catch {
    return delegate()
  }
  if (decision === undefined) return delegate()
  return decision
}

/**
 * Registers BOTH surfaces through `ctx.on` — the primary `tools/pre-execute`
 * gate (the manifest row's own `event`, never a second literal) and the
 * secondary `tools/post-execute` rewrite. The pairing WeakMap is created HERE,
 * per registration, so it belongs to the registering Fiber's life (discipline
 * ⑤) and there is nothing extra to dispose.
 */
export const registerWebfetchRedirectGuard: HookRegistrar = (
  ctx,
  entry: HookManifestEntry,
) => {
  const pending = new WeakMap<object, PendingDenial>()
  ctx.on(entry.event, (exec, next) => handleWebFetchPreExecute(exec, next, pending))
  ctx.on(
    WEBFETCH_REDIRECT_GUARD_SECONDARY_EVENT,
    (exec, result, next) => handleWebFetchPostExecute(exec, result, next, pending),
  )
}
