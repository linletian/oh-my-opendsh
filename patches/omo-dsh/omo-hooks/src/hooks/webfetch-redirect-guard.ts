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
// came back `WEB_REDIRECT_BLOCKED` gets its content replaced. DELIBERATE
// IMPROVEMENT on rule (2): upstream had no URL to name there (it only kept the
// original URL for its rule-1 pending map) and printed the bare message; this
// port reads the requested URL straight off the SAME `exec` object and always
// names it. The patterns are the upstream two PLUS the two measured DSH-native
// shapes (the H-14/H-15 precedent: the upstream strings are kept as an audit
// table, and the DSH table is rebuilt from the strings DSH really produces).
//
// APPEND-ONLY ON A NATIVE REFUSAL (review round 2, MAJOR-2). The two measured
// DSH shapes ARE the provider's own refusal, and that refusal is the ONLY
// carrier of the cross-origin target's ORIGIN (`:479`) and of the runtime's real
// hop cap (`:468`). The D half therefore reproduces the native sentence VERBATIM
// and appends its context below it (`buildNativePolicyPassthrough`); the earlier
// revision paraphrased the cross-origin text into "the redirect was blocked as
// cross-origin", which told the model to retry "with the final URL" while
// deleting the only place that URL was named — strictly less actionable than
// native alone, and a contradiction of the fail-open rationale above ("a message
// this port has no business paraphrasing"). Upstream's own wording keeps
// upstream's own sentence: it carries no native detail to preserve.
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
// ═══════════ THE PUBLIC-DESTINATION GATE (SSRF fix, review F1) ═══════════
// The B half POINTS THE HOST'S `fetch` AT A MODEL-CHOSEN URL. Upstream's
// pre-resolution had exactly the same shape (a plain `fetch` loop) and the
// first revision of this port registered that as "upstream parity"; an
// independent review overturned that registration: upstream parity is NOT a
// licence to widen the host's network reach, because on DSH the native tool
// WOULD have refused an internal destination and the guard's pre-resolution did
// not. The defect was reproduced by the review with a local 127.0.0.1 server:
// `decideWebFetchRedirectDeny` really sent `/start` and `/final` before the
// native policy ever ran.
//
// The gate below is the fix, and it is a SELF-CONTAINED MIRROR of
// `dsh-web-fetch-http`'s pre-connection policy — never an import, because this
// package deliberately has no `@deepseek-ai/dsh-*` dependency:
//
//   native (dsh-web-fetch-http/lib/index.js)
//     validateFetchUrl       `:292-295`  ≤2048 chars, http(s) only, no credentials
//     resolvePublicAddresses `:55-79`    one DNS answer set; reject the WHOLE set
//                                        if any address is not globally reachable
//                                        unicast (`isPublicIpAddress` `:35-45`)
//     isSameOrigin           `:305-307`  scheme + hostname + port, per HOP
//     requestOnce            `:495-509`  resolution happens BEFORE the connection
//   this port
//     validateRedirectUrl            (mirrored; see its doc comment)
//     resolvePublicAddresses         (mirrored; its doc comment records the one
//                                     deliberate omission — NAT64 discovery)
//     isSameOriginUrl                (mirrored; compared per hop)
//
// EVERY hop is gated, INCLUDING the first: a redirect chain is followed only
// while each target is same-origin AND every address its hostname resolves to is
// globally reachable. A non-public destination or a cross-origin target
// TERMINATES the chain BEFORE the request carrying it is issued, i.e. the
// model-chosen private endpoint is never contacted by this listener (the
// regression suite pins "zero fetch calls" for loopback / RFC1918 / link-local).
//
// The refusal is deliberately NOT rendered as a deny. DSH's own provider is the
// authority that refuses such a URL (`WEB_BLOCKED_URL`, `WEB_REDIRECT_BLOCKED`)
// with a message this port has no business paraphrasing; the B half therefore
// fails OPEN on a policy refusal and lets that authority speak. The security
// property is not "the model is told no" — native already does that — it is
// "this listener never reaches the destination first".
//
// RESIDUALS, recorded rather than hidden:
//   * DNS re-resolution (TOCTOU). This mirror resolves the hostname and then
//     hands the URL to the host `fetch`, which resolves it AGAIN. The native
//     provider closes that window by PINNING the validated answer set into the
//     connection's `lookup` (`createPinnedLookup`, `:217-235`); a plain `fetch`
//     gives this port no such seam, so a hostile resolver could answer public
//     for the check and private for the connection. The window is bounded and
//     one-sided: the guard's probe is a GET with `redirect: "manual"`, no
//     credentials and no body read. The residual itself is ACCEPTED EXPLICITLY
//     (review F1 arbitration, PR #9 round 2): inside a DNS-poisoning window this
//     listener's own probe can still reach a private destination, because a
//     plain `fetch` gives it no lookup to pin — its probe surface is therefore
//     NOT proven equal to native's. What it cannot do is change the model's
//     fate: the ACTUAL tool fetch still runs behind the native pinned lookup, so
//     this guard's probe is advisory depth only and the native provider's
//     decision is unchanged. That — not an equality claim — is the registered
//     reading of "only what this listener itself probes".
//   * NAT64 (`discoverNat64Prefixes`, `:81-105`) is not mirrored: rather than
//     discover the local DNS64 prefix, the classifier blocks every transition/
//     translation prefix outright (`64:ff9b::/96`, `64:ff9b:1::/48`,
//     `::ffff:0:0:0/96`, `2002::/16`, `2001::/23`), which is STRICTER than the
//     native check and therefore fails in the safe direction.
//   * The classifier is a hand-written range table, not `ipaddr.js` (no
//     dependency). It was RECONCILED (review round 2, MAJOR-1) against the
//     installed `ipaddr.js` 2.5.0 — the parser the native `isPublicIpAddress`
//     calls — and now enumerates EVERY non-unicast bucket of that version's
//     `IPv4.SpecialRanges` / `IPv6.SpecialRanges`. A `range() !== 'unicast'`
//     address belongs to one of those buckets and therefore to
//     `NON_PUBLIC_IPV4_RANGES` / `NON_PUBLIC_IPV6_RANGES`: no address native
//     refuses is probed here. The reconciliation holds in the other direction
//     too — the only remaining mismatches are deliberate OVER-blocking (`::/96`
//     and the transition prefixes native calls unicast), which merely costs the
//     guard its probe and hands the decision to the provider. The residual is
//     therefore VERSION SENSITIVITY, and it is registered: this mirror is pinned
//     to ipaddr.js 2.5.0, so a bucket a later ipaddr.js adds must be added here
//     by hand (the regression suite pins every 2.5.0 bucket by CIDR, so a silent
//     ipaddr.js upgrade turns it red instead of silently widening this gate).
//
// The pre-resolution remains BOUNDED (30s default, 120s max, upstream's
// `normalizeTimeoutMs`) and composed with the call's own `exec.signal`, so a
// cancelled tool call cancels both its DNS wait and its probe.
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
//      builders are module-level; the ONLY I/O is the pre-resolution's per-hop
//      DNS resolution and request (the public-destination gate above).
//   ⑤ the cross-stage state is a per-registration WeakMap keyed by the live
//      execution object (see the pairing section) — never a module-level bare
//      Map, and nothing to dispose beyond the fiber that owns the listener.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
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
 * The D half treats BOTH as a NATIVE POLICY REFUSAL and reproduces the provider
 * sentence verbatim, appending its own context below it
 * ({@link buildNativePolicyPassthrough}): the cap in the first shape and the
 * ORIGIN in the second are the provider's own actionable details, so neither is
 * transcribed or dropped. The patterns stay separate because they are the audit
 * record of the two measured shapes — the cap capture included, so a test can
 * still read the runtime's cap out of the native text.
 */
/** The DSH over-cap shape — its capture is the cap the native text names. */
export const DSH_WEBFETCH_REDIRECT_CAP_PATTERN = /exceeded the maximum of (\d+) redirects/i

/** The DSH cross-origin shape — it names the target ORIGIN, and nothing else does. */
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

// --- the public-destination policy (self-contained mirror, see the header) ---

/**
 * `dsh-web-fetch-http` policy.js:264 — the provider's URL length ceiling,
 * mirrored so a target the native tool would reject is never probed.
 */
export const WEB_FETCH_MAX_URL_LENGTH = 2048

/**
 * The DNS lookup face {@link resolvePublicAddresses} consumes. Native declares
 * the same seam — `resolvePublicAddresses(hostname, signal, resolver = lookup)`
 * (network.js:55) — so its transport tests can replace resolution without a
 * network; this port takes the identical shape for the identical reason (the
 * registrar never passes it, so production always uses `node:dns`).
 */
export type RedirectLookupLike = (
  hostname: string,
  options: { readonly all: true; readonly order: 'verbatim' },
) => Promise<readonly { readonly address: string; readonly family: number }[]>

/** One validated public address (native's `resolvePublicAddresses` result element). */
export interface PublicRedirectAddress {
  readonly address: string
  readonly family: number
}

/**
 * A pre-resolution POLICY refusal, as opposed to a transport failure: the URL is
 * invalid, its hostname resolves to a non-public address, or a redirect leaves
 * the origin. `code` reuses the native `WebError` vocabulary
 * (dsh-web-fetch-http/lib/index.js) so the correspondence stays greppable.
 *
 * The B half catches this exactly like any other pre-resolution failure and
 * fails open (see the header): the native provider remains the single authority
 * that renders the refusal, and the guard's only job is to never reach the
 * destination first.
 */
export class WebFetchRedirectPolicyError extends Error {
  readonly code: WebFetchRedirectPolicyErrorCode

  constructor(
    code: WebFetchRedirectPolicyErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options)
    this.name = 'WebFetchRedirectPolicyError'
    this.code = code
  }
}

/** The native `WebError` codes this mirror can raise. */
export type WebFetchRedirectPolicyErrorCode =
  | 'WEB_INVALID_URL'
  | 'WEB_BLOCKED_URL'
  | 'WEB_REDIRECT_BLOCKED'
  | 'WEB_PROVIDER_ERROR'
  | 'WEB_ABORTED'

/**
 * A full IPv4 prefix that is NOT globally reachable unicast — the IPv4 half of
 * native `isPublicIpAddress` (`range() === 'unicast'`, network.js:35-45).
 *
 * AUDIT TABLE, reconciled line by line (review round 2, MAJOR-1) against the
 * installed `ipaddr.js` 2.5.0 `IPv4.SpecialRanges`: every bucket whose
 * `range()` is not `'unicast'` is present here, so an address native refuses is
 * refused by {@link isPublicIpAddress} too. `nativeRange` is that bucket's key,
 * which keeps the correspondence a direct read; the table is a NORMALIZED cover
 * (ipaddr.js's `broadcast` bucket, `255.255.255.255/32`, is inside the
 * `reserved` `240.0.0.0/4` entry below and is not repeated).
 */
export const NON_PUBLIC_IPV4_RANGES: readonly {
  readonly base: readonly [number, number, number, number]
  readonly prefix: number
  readonly nativeRange: string
  readonly label: string
}[] = [
  { base: [0, 0, 0, 0], prefix: 8, nativeRange: 'unspecified', label: 'unspecified / this-network (0.0.0.0/8)' },
  { base: [10, 0, 0, 0], prefix: 8, nativeRange: 'private', label: 'RFC1918 private (10/8)' },
  { base: [100, 64, 0, 0], prefix: 10, nativeRange: 'carrierGradeNat', label: 'CGNAT (100.64/10)' },
  { base: [127, 0, 0, 0], prefix: 8, nativeRange: 'loopback', label: 'loopback (127/8)' },
  { base: [169, 254, 0, 0], prefix: 16, nativeRange: 'linkLocal', label: 'link-local (169.254/16)' },
  { base: [172, 16, 0, 0], prefix: 12, nativeRange: 'private', label: 'RFC1918 private (172.16/12)' },
  { base: [192, 0, 0, 0], prefix: 24, nativeRange: 'reserved', label: 'IETF protocol assignments (192.0.0/24)' },
  { base: [192, 0, 2, 0], prefix: 24, nativeRange: 'reserved', label: 'TEST-NET-1 (192.0.2/24)' },
  { base: [192, 31, 196, 0], prefix: 24, nativeRange: 'as112', label: 'AS112-v4 direct delegation (192.31.196/24)' },
  { base: [192, 52, 193, 0], prefix: 24, nativeRange: 'amt', label: 'AMT (192.52.193/24)' },
  { base: [192, 88, 99, 0], prefix: 24, nativeRange: 'reserved', label: '6to4 relay anycast (192.88.99/24)' },
  { base: [192, 168, 0, 0], prefix: 16, nativeRange: 'private', label: 'RFC1918 private (192.168/16)' },
  { base: [192, 175, 48, 0], prefix: 24, nativeRange: 'as112', label: 'AS112 (192.175.48/24)' },
  { base: [198, 18, 0, 0], prefix: 15, nativeRange: 'reserved', label: 'benchmarking (198.18/15)' },
  { base: [198, 51, 100, 0], prefix: 24, nativeRange: 'reserved', label: 'TEST-NET-2 (198.51.100/24)' },
  { base: [203, 0, 113, 0], prefix: 24, nativeRange: 'reserved', label: 'TEST-NET-3 (203.0.113/24)' },
  { base: [224, 0, 0, 0], prefix: 4, nativeRange: 'multicast', label: 'multicast (224/4)' },
  { base: [240, 0, 0, 0], prefix: 4, nativeRange: 'reserved', label: 'reserved / broadcast (240/4, incl. 255.255.255.255/32)' },
]

/** WHATWG URL retains brackets around IPv6 hostnames; IP parsers do not. */
function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

/** Parse a strict dotted quad; `undefined` for anything `isIP` would not call IPv4. */
function parseIpv4Octets(address: string): readonly number[] | undefined {
  const parts = address.split('.')
  if (parts.length !== 4) return undefined
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined
    const value = Number(part)
    if (value > 255) return undefined
    octets.push(value)
  }
  return octets
}

/** True when `octets` falls inside `base/prefix`. */
function matchesIpv4Prefix(
  octets: readonly number[],
  base: readonly [number, number, number, number],
  prefix: number,
): boolean {
  let remaining = prefix
  for (let index = 0; index < 4 && remaining > 0; index += 1) {
    const bits = Math.min(8, remaining)
    const mask = bits === 8 ? 0xff : (0xff << (8 - bits)) & 0xff
    if (((octets[index] ?? 0) & mask) !== (base[index] & mask)) return false
    remaining -= bits
  }
  return true
}

/**
 * Parse an IPv6 literal into its eight 16-bit groups. Handles `::` compression,
 * a trailing dotted quad (`::ffff:1.2.3.4`, which WHATWG URL normalizes to hex
 * groups before this ever sees it) and a zone id (`fe80::1%eth0`), which
 * `node:net`'s `isIP` accepts but `ipaddr.js` does not.
 */
function parseIpv6Groups(input: string): readonly number[] | undefined {
  const address = input.includes('%') ? input.slice(0, input.indexOf('%')) : input
  const halves = address.split('::')
  if (halves.length > 2) return undefined

  const parseHalf = (half: string): number[] | undefined => {
    if (half === '') return []
    const pieces = half.split(':')
    const groups: number[] = []
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index]!
      if (piece.includes('.')) {
        // A dotted quad may only be the final piece, and stands for two groups.
        if (index !== pieces.length - 1) return undefined
        const octets = parseIpv4Octets(piece)
        if (octets === undefined) return undefined
        groups.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!)
        continue
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return undefined
      groups.push(Number.parseInt(piece, 16))
    }
    return groups
  }

  const leading = parseHalf(halves[0]!)
  if (leading === undefined) return undefined
  if (halves.length === 1) return leading.length === 8 ? leading : undefined
  const trailing = parseHalf(halves[1]!)
  if (trailing === undefined) return undefined
  const missing = 8 - leading.length - trailing.length
  // `::` must stand for at least one group (RFC 4291 §2.2).
  if (missing < 1) return undefined
  return [...leading, ...new Array<number>(missing).fill(0), ...trailing]
}

/** One entry of the IPv6 audit table ({@link NON_PUBLIC_IPV6_RANGES}). */
export interface NonPublicIpv6Range {
  /** The range as CIDR text; it is parsed once, at module load. */
  readonly cidr: string
  /**
   * The `ipaddr.js` 2.5.0 `IPv6.SpecialRanges` bucket this entry transcribes,
   * or `'stricter'` for the one range this port blocks although native calls it
   * globally reachable unicast (the safe direction, recorded not hidden).
   */
  readonly nativeRange: string
  readonly label: string
  /**
   * `::ffff:0:0/96` is the ONE bucket native handles by CONVERSION rather than
   * by refusal: `isIPv4MappedAddress()` sends it through `toIPv4Address()` and
   * re-ranges the embedded IPv4 (network.js:43). This port must do the same, or
   * it would block `::ffff:8.8.8.8` that native fetches.
   */
  readonly classifyEmbeddedIpv4?: true
}

/**
 * The IPv6 half of native `isPublicIpAddress` (`range() === 'unicast'`,
 * network.js:35-45).
 *
 * AUDIT TABLE, reconciled line by line (review round 2, MAJOR-1) against the
 * installed `ipaddr.js` 2.5.0 `IPv6.SpecialRanges`: every bucket whose
 * `range()` is not `'unicast'` is present here, in the source's own key order,
 * with `nativeRange` recording that key. Addresses inside the broader
 * `reserved` `2001::/23` bucket are also reachable through the narrower keys
 * above it (Teredo, benchmarking, AMT, ORCHID, drone-id); both spellings are
 * kept so the bucket-by-bucket read of the upstream object stays possible —
 * every one of them refuses, so the order cannot change an outcome. The final
 * entry is the one deliberate OVER-block (`::/96`), marked `'stricter'`.
 */
export const NON_PUBLIC_IPV6_RANGES: readonly NonPublicIpv6Range[] = [
  { cidr: '::/128', nativeRange: 'unspecified', label: 'unspecified (::/128)' },
  { cidr: 'fe80::/10', nativeRange: 'linkLocal', label: 'link-local (fe80::/10)' },
  { cidr: 'ff00::/8', nativeRange: 'multicast', label: 'multicast (ff00::/8)' },
  { cidr: '::1/128', nativeRange: 'loopback', label: 'loopback (::1/128)' },
  { cidr: 'fc00::/7', nativeRange: 'uniqueLocal', label: 'unique-local (fc00::/7)' },
  {
    cidr: '::ffff:0:0/96',
    nativeRange: 'ipv4Mapped',
    label: 'IPv4-mapped — classified by its embedded IPv4, exactly like native',
    classifyEmbeddedIpv4: true,
  },
  { cidr: 'fec0::/10', nativeRange: 'deprecatedSiteLocal', label: 'deprecated site-local (fec0::/10, RFC3879)' },
  { cidr: '100::/64', nativeRange: 'discard', label: 'discard-only (100::/64, RFC6666)' },
  { cidr: '::ffff:0:0:0/96', nativeRange: 'rfc6145', label: 'IPv4-translated (::ffff:0:0:0/96, RFC6145)' },
  { cidr: '64:ff9b::/96', nativeRange: 'rfc6052', label: 'NAT64 well-known prefix (64:ff9b::/96)' },
  { cidr: '64:ff9b:1::/48', nativeRange: 'rfc6052', label: 'NAT64 local-use prefix (64:ff9b:1::/48)' },
  { cidr: '2002::/16', nativeRange: '6to4', label: '6to4 (2002::/16)' },
  { cidr: '2001::/32', nativeRange: 'teredo', label: 'Teredo (2001::/32)' },
  { cidr: '2001:2::/48', nativeRange: 'benchmarking', label: 'benchmarking (2001:2::/48)' },
  { cidr: '2001:3::/32', nativeRange: 'amt', label: 'AMT (2001:3::/32, RFC7450)' },
  { cidr: '2001:4:112::/48', nativeRange: 'as112v6', label: 'AS112-v6 (2001:4:112::/48, RFC7535)' },
  { cidr: '2620:4f:8000::/48', nativeRange: 'as112v6', label: 'AS112-v6 (2620:4f:8000::/48, RFC7534)' },
  { cidr: '2001:10::/28', nativeRange: 'deprecatedOrchid', label: 'deprecated ORCHID (2001:10::/28)' },
  { cidr: '2001:20::/28', nativeRange: 'orchid2', label: 'ORCHIDv2 (2001:20::/28)' },
  {
    cidr: '2001:30::/28',
    nativeRange: 'droneRemoteIdProtocolEntityTags',
    label: 'Drone Remote ID (2001:30::/28, RFC9374)',
  },
  { cidr: '5f00::/16', nativeRange: 'segmentRouting', label: 'SRv6 SIDs (5f00::/16, RFC9602)' },
  {
    cidr: '2001::/23',
    nativeRange: 'reserved',
    label: 'IETF protocol assignments (2001::/23, RFC3849) — the superset of the 2001:0-2001:1ff block',
  },
  { cidr: '2001:db8::/32', nativeRange: 'reserved', label: 'documentation (2001:db8::/32)' },
  { cidr: '3fff::/20', nativeRange: 'reserved', label: 'documentation (3fff::/20, RFC9637)' },
  {
    cidr: '::/96',
    nativeRange: 'stricter',
    label: 'IPv4-compatible / deprecated ::/96 — STRICTER than native, which calls it unicast',
  },
]

/** A {@link NON_PUBLIC_IPV6_RANGES} entry with its CIDR parsed once. */
interface ParsedIpv6Range {
  readonly base: readonly number[]
  readonly prefix: number
  readonly entry: NonPublicIpv6Range
}

/**
 * The parsed audit table. A malformed CIDR is a programming error in a static
 * table, so it fails LOUDLY at module load: the alternative — a silently
 * skipped entry — is exactly the under-blocking defect this table exists to
 * prevent. The regression suite re-derives every entry from its CIDR too.
 */
const PARSED_IPV6_RANGES: readonly ParsedIpv6Range[] = NON_PUBLIC_IPV6_RANGES.map((entry) => {
  const [address = '', prefixText = ''] = entry.cidr.split('/')
  const base = parseIpv6Groups(address)
  const prefix = Number(prefixText)
  if (base === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    throw new Error(`NON_PUBLIC_IPV6_RANGES entry is not a valid IPv6 prefix: ${entry.cidr}`)
  }
  return { base, prefix, entry }
})

/** True when the first `prefix` bits of `groups` equal those of `base`. */
function matchesIpv6Prefix(groups: readonly number[], base: readonly number[], prefix: number): boolean {
  let remaining = prefix
  for (let index = 0; index < 8 && remaining > 0; index += 1) {
    const bits = Math.min(16, remaining)
    const mask = bits === 16 ? 0xffff : (0xffff << (16 - bits)) & 0xffff
    if (((groups[index] ?? 0) & mask) !== ((base[index] ?? 0) & mask)) return false
    remaining -= bits
  }
  return true
}

/** The IPv6 half of the classifier; see {@link isPublicIpAddress}. */
function isNonPublicIpv6(groups: readonly number[]): boolean {
  for (const range of PARSED_IPV6_RANGES) {
    if (!matchesIpv6Prefix(groups, range.base, range.prefix)) continue
    if (range.entry.classifyEmbeddedIpv4 === true) {
      // ::ffff:0:0/96 IPv4-mapped: classify the embedded IPv4 (native converts
      // and re-ranges it, network.js:43). No other entry matches this block, so
      // the delegation cannot be shadowed by an earlier `return true`.
      return isNonPublicIpv4([
        ((groups[6] ?? 0) >> 8) & 0xff,
        (groups[6] ?? 0) & 0xff,
        ((groups[7] ?? 0) >> 8) & 0xff,
        (groups[7] ?? 0) & 0xff,
      ])
    }
    return true
  }
  return false
}

/** The IPv4 half of the classifier; see {@link isPublicIpAddress}. */
function isNonPublicIpv4(octets: readonly number[]): boolean {
  return NON_PUBLIC_IPV4_RANGES.some((range) => matchesIpv4Prefix(octets, range.base, range.prefix))
}

/**
 * Whether an address is globally reachable unicast — this port's mirror of
 * native `isPublicIpAddress` (network.js:35-45). Anything unparseable is
 * non-public, the fail-safe direction (native's `ipaddr.parse` catch does the
 * same, `:38-40`).
 *
 * The mirror is RECONCILED, not asserted: {@link NON_PUBLIC_IPV4_RANGES} and
 * {@link NON_PUBLIC_IPV6_RANGES} enumerate every non-unicast bucket of
 * `ipaddr.js` 2.5.0's `SpecialRanges` (the parser native calls), so an address
 * native refuses is refused here. STRICTER THAN NATIVE on `::/96` and the
 * transition/translation prefixes (see the header's NAT64 residual):
 * over-blocking only costs the guard its probe and hands the decision to the
 * native provider, while under-blocking is the SSRF this exists to prevent.
 */
export function isPublicIpAddress(input: string): boolean {
  const unbracketed = stripIpv6Brackets(input)
  const family = isIP(unbracketed)
  if (family === 4) {
    const octets = parseIpv4Octets(unbracketed)
    return octets !== undefined && !isNonPublicIpv4(octets)
  }
  if (family !== 6) return false
  const groups = parseIpv6Groups(unbracketed)
  return groups !== undefined && !isNonPublicIpv6(groups)
}

/** Race a non-cancellable OS lookup without letting it delay tool cancellation. */
function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  const abortError = (): WebFetchRedirectPolicyError =>
    new WebFetchRedirectPolicyError('WEB_ABORTED', 'web fetch aborted during hostname resolution')
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      reject(abortError())
    }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort)
    })
  })
}

/**
 * The native pre-connection policy, mirrored (network.js:55-79): resolve the
 * hostname ONCE (a literal address needs no resolution) and reject the COMPLETE
 * answer set if any element is not globally reachable unicast. The returned
 * addresses are the ones the caller may probe.
 *
 * DELIBERATE OMISSION, recorded in the header: native's NAT64 arm
 * (`discoverNat64Prefixes`, `:81-105`) is not mirrored. The classifier blocks
 * the translation prefixes outright instead, which is stricter and needs no
 * second DNS lookup.
 */
export async function resolvePublicAddresses(
  hostname: string,
  signal: AbortSignal,
  resolver: RedirectLookupLike = lookup as unknown as RedirectLookupLike,
): Promise<readonly PublicRedirectAddress[]> {
  const unbracketed = stripIpv6Brackets(hostname)
  const literalFamily = isIP(unbracketed)
  const resolved = literalFamily === 0
    ? await raceWithSignal(resolver(unbracketed, { all: true, order: 'verbatim' }), signal)
    : [{ address: unbracketed, family: literalFamily }]

  if (resolved.length === 0) {
    throw new WebFetchRedirectPolicyError(
      'WEB_PROVIDER_ERROR',
      `hostname "${hostname}" resolved to no addresses`,
    )
  }

  const addresses: PublicRedirectAddress[] = []
  for (const entry of resolved) {
    if ((entry.family !== 4 && entry.family !== 6) || isIP(entry.address) !== entry.family) {
      throw new WebFetchRedirectPolicyError(
        'WEB_PROVIDER_ERROR',
        `hostname "${hostname}" resolved to an invalid IP address`,
      )
    }
    if (!isPublicIpAddress(entry.address)) {
      throw new WebFetchRedirectPolicyError(
        'WEB_BLOCKED_URL',
        `URL hostname "${hostname}" resolves to a non-public IP address`,
      )
    }
    addresses.push({ address: entry.address, family: entry.family })
  }
  return addresses
}

/**
 * Native `validateFetchUrl` (policy.js:264-295), mirrored: bounded length,
 * http(s) only, no embedded credentials. The provider applies this before
 * resolving a destination, so the mirror applies it before its own resolution.
 */
export function validateRedirectUrl(input: string): URL {
  if (input.length > WEB_FETCH_MAX_URL_LENGTH) {
    throw new WebFetchRedirectPolicyError(
      'WEB_INVALID_URL',
      `URL exceeds the maximum length of ${WEB_FETCH_MAX_URL_LENGTH}`,
    )
  }
  let url: URL
  try {
    url = new URL(input)
  } catch (error) {
    throw new WebFetchRedirectPolicyError('WEB_INVALID_URL', `invalid URL: ${input}`, { cause: error })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebFetchRedirectPolicyError(
      'WEB_INVALID_URL',
      `unsupported URL scheme "${url.protocol}" (only http and https are allowed)`,
    )
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new WebFetchRedirectPolicyError('WEB_BLOCKED_URL', 'credentials in URLs are not allowed')
  }
  return url
}

/**
 * Native `isSameOrigin` (policy.js:296-307), mirrored: scheme, hostname and
 * port. A redirect that crosses origins is refused so each new origin requires a
 * fresh tool call and a fresh public-address validation.
 */
export function isSameOriginUrl(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port
}

/**
 * The manual-redirect loop — upstream redirect-resolution.ts:52-88 transcribed
 * case for case, with `exec.signal` fused into the timeout signal (a cancelled
 * tool call must not keep probing) and the response body cancelled after each
 * hop — including the TERMINAL hop, whose page body is the one most worth
 * releasing:
 *
 *   * per hop, FIRST: `validateRedirectUrl` + `resolvePublicAddresses` — the
 *     public-destination gate (header). This is the ONE place this port deviates
 *     from upstream's byte shape, and it deviates on purpose.
 *   * `fetch(currentUrl, { headers, redirect: 'manual', signal })`
 *   * body cancelled best-effort (never read)
 *   * not a redirect status          → `{type:'resolved', url: currentUrl}`
 *   * redirect status without Location → `{type:'resolved', url: currentUrl}`
 *   * `redirectCount >= MAX`          → `{type:'exceeded', …}`
 *   * else Location is resolved against the current URL, validated, required to
 *     be SAME-ORIGIN with the hop it came from (native's `isSameOrigin` rule),
 *     and the loop continues
 *
 * A policy refusal (non-public destination / cross-origin target / invalid URL)
 * REJECTS with {@link WebFetchRedirectPolicyError} BEFORE the offending request
 * is issued; the B half fails open on it (see the header), so the native
 * provider stays the authority that refuses the URL to the model.
 *
 * @param params - the URL, plus upstream's `timeoutSeconds` knob when a caller
 *   sets it. `RedirectResolutionParams` has NO `format` knob (the format was
 *   trimmed at the rewrite seam and the Accept header is fixed to markdown),
 *   and `timeoutSeconds` is really honored through
 *   {@link normalizeTimeoutMs} — it is merely never SET by the deny path,
 *   which always passes `{ url }`.
 * @param fetchImpl - the fetch to use; defaults to the host global.
 * @param callerSignal - the tool call's own cancellation signal, when present.
 * @param resolver - the DNS lookup the gate uses; defaults to `node:dns`.
 *   Injectable for the same reason {@link resolvePublicAddresses} takes one:
 *   the unit suite must not depend on real DNS.
 */
export async function resolveWebFetchRedirects(
  params: RedirectResolutionParams,
  fetchImpl: RedirectFetchLike = fetch as unknown as RedirectFetchLike,
  callerSignal?: AbortSignal,
  resolver: RedirectLookupLike = lookup as unknown as RedirectLookupLike,
): Promise<RedirectResolutionResult> {
  const timeoutMs = normalizeTimeoutMs(params.timeoutSeconds)
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal =
    callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal])
  const headers = buildWebFetchHeaders('markdown')

  // Two views of the current hop, deliberately: `currentUrlText` is the STRING
  // the hop is requested and reported by, so the FIRST hop stays byte-identical
  // to the model's own argument (WHATWG normalization of `https://example.com`
  // would otherwise make a non-redirecting call look like a redirect to the
  // B half, which compares the resolved URL to the requested one); `currentUrl`
  // is the parsed form the policy gate and the origin rule need.
  let currentUrlText = params.url
  let currentUrl = validateRedirectUrl(currentUrlText)
  let redirectCount = 0

  for (;;) {
    // ── the public-destination gate: nothing below this line may be reached
    //    for a URL whose hostname resolves to a non-public address ──────────
    await resolvePublicAddresses(currentUrl.hostname, signal, resolver)

    const response = await fetchImpl(currentUrlText, { headers, redirect: 'manual', signal })

    // Best-effort body release BEFORE every early return below — the terminal
    // hop (a real page, possibly large) included. The pre-resolution never reads
    // a body, so cancelling first costs nothing; an unconsumed stream would
    // otherwise pin the socket.
    await cancelBody(response)

    if (!WEBFETCH_REDIRECT_STATUSES.has(response.status)) {
      return { type: 'resolved', url: currentUrlText, redirectCount }
    }

    const location = response.headers.get('location')

    if (!location) {
      return { type: 'resolved', url: currentUrlText, redirectCount }
    }

    if (redirectCount >= MAX_WEBFETCH_REDIRECTS) {
      return { type: 'exceeded', url: params.url, maxRedirects: MAX_WEBFETCH_REDIRECTS }
    }

    // Native's redirect arm (index.js:465-487), mirrored: validate the target,
    // then require the SAME origin as the hop that produced it. Both checks run
    // BEFORE the next request, so a cross-origin or malformed Location is never
    // dialled. The next iteration's address gate covers the same-origin target.
    const target = validateRedirectUrl(resolveRedirectLocation(currentUrlText, location))
    if (!isSameOriginUrl(target, currentUrl)) {
      throw new WebFetchRedirectPolicyError(
        'WEB_REDIRECT_BLOCKED',
        `cross-origin redirect to ${target.origin} is not followed automatically; `
        + 'retry against that URL directly',
      )
    }

    currentUrlText = target.toString()
    currentUrl = target
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
 * The D half's APPEND-ONLY context block for a NATIVE policy refusal (review
 * round 2, MAJOR-2). The provider's own sentence is the ONLY carrier of the
 * cross-origin target's ORIGIN (`:479`) or of the runtime's real hop cap
 * (`:468`); paraphrasing it was strictly less actionable than letting the
 * provider speak, which is also what the header's fail-open rationale promises.
 * The guard therefore reproduces the native text VERBATIM and appends its own
 * context BELOW it — never a rewrite, never a reorder, never a dropped detail.
 * The marker makes the rewrite idempotent
 * ({@link decideWebFetchRedirectResultRewrite}).
 */
export function buildNativePolicyPassthrough(nativeText: string, url?: string): string {
  const requested = url === undefined ? '' : ` The URL this call requested was "${url}".`
  return `${nativeText}\n\n${WEBFETCH_REDIRECT_GUARD_MARKER}: the refusal above is the `
    + `native web_fetch provider's own text, kept verbatim.${requested}`
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
 * A pre-resolution FAILURE (network error, invalid URL, aborted signal, or a
 * {@link WebFetchRedirectPolicyError}) is upstream's `catch { log(...) }` arm:
 * it must never block a legitimate fetch, so it is reported as `undefined`
 * (fail open). The policy refusal belongs in that arm on purpose — the guard
 * refuses to PROBE a non-public / cross-origin target, but the user-visible
 * refusal stays the native provider's (see the header).
 *
 * @param exec - the live execution object the waterfall handed over.
 * @param fetchImpl - the pre-resolution transport; defaults to the host global.
 * @param resolver - the DNS lookup the public-destination gate uses; defaults to
 *   `node:dns`. Injectable so the unit suite never touches real DNS.
 */
export async function decideWebFetchRedirectDeny(
  exec: unknown,
  fetchImpl?: RedirectFetchLike,
  resolver?: RedirectLookupLike,
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
    resolution = await resolveWebFetchRedirects({ url }, fetchImpl, signal, resolver)
  } catch {
    // Fail open: an unreachable/invalid/non-public URL is the tool's business,
    // not ours — and the guard has already NOT probed it.
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
 *
 * When it DOES decide, the replacement is APPEND-ONLY for a native refusal: the
 * provider's own sentence comes through byte for byte and this port's context is
 * added below it (review round 2, MAJOR-2 — see the header's D-half section).
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
  // Two-way wording, driven by WHICH pattern matched (never by a guess):
  //   * a MEASURED DSH-native shape is a NATIVE POLICY REFUSAL: the provider
  //     itself names the cross-origin target's origin, or the runtime's real hop
  //     cap, and that sentence is the one thing the model can act on. The D half
  //     is therefore APPEND-ONLY there — native text verbatim, our context below
  //     it (review round 2, MAJOR-2; the previous revision paraphrased the
  //     cross-origin text and dropped the origin, which was strictly less
  //     actionable than not installing this listener at all).
  //   * an upstream / other-provider loop error has no native refusal to
  //     preserve, so upstream's own rule-2 sentence is used, now naming the
  //     requested URL read off this same `exec` — upstream's bare form is the
  //     DELIBERATE IMPROVEMENT registered in the header (:90-93), so the text is
  //     the upstream SENTENCE, not upstream's exact output.
  if (DSH_WEBFETCH_REDIRECT_ERROR_PATTERNS.includes(matched)) {
    return {
      kind: 'accept',
      content: [{ type: 'text', text: buildNativePolicyPassthrough(text, url) }],
    }
  }
  return {
    kind: 'accept',
    content: [{ type: 'text', text: buildRedirectLimitMessage(url) }],
  }
}

/**
 * The B-half listener body: decide inside a fail-open try/catch, then either
 * delegate or return the deny decision. `next()` is OUTSIDE the try (header
 * discipline ②).
 *
 * `fetchImpl` / `resolver` are the same injectable pre-resolution seams
 * {@link decideWebFetchRedirectDeny} takes; the registrar never passes them, so
 * production always uses the host global and `node:dns`.
 */
export async function handleWebFetchPreExecute(
  exec: unknown,
  next: unknown,
  pending: WeakMap<object, PendingDenial>,
  fetchImpl?: RedirectFetchLike,
  resolver?: RedirectLookupLike,
): Promise<unknown> {
  const delegate = next as PreExecuteNextLike
  let decision: PreToolDenyDecision | undefined
  try {
    decision = await decideWebFetchRedirectDeny(exec, fetchImpl, resolver)
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
