// P3-T16 — webfetch-redirect-guard listener (plan §4.2 pattern B pilot + D;
// task book WP-6 批 C). The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/webfetch-redirect-guard/ @ v4.19.4:
//
//   upstream  `tool.execute.before` → manual-redirect PRE-RESOLUTION +
//             `replaceToolArgs(url = final)` (rewrite), and
//             `tool.execute.after`  → rewrite a redirect-loop error output
//   this port `tools/pre-execute`   → `{ kind: 'deny', reason }` whose reason
//             NAMES the final URL (DSH has no argument-rewrite seam), and
//             `tools/post-execute`  → normalize the blocked-redirect result
//
// The redirect-counting cases below are transcribed by hand from upstream's
// index.test.ts (6 `it`) and from redirect-resolution.ts's loop; the DSH-native
// error strings are the measured ones (see the module header). A test that
// derived them from the module under test would agree with any drift, which is
// exactly what this suite exists to catch.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  DSH_WEBFETCH_REDIRECT_ERROR_PATTERNS,
  DSH_WEB_FETCH_TOOL_NAME,
  MAX_WEBFETCH_REDIRECTS,
  NON_PUBLIC_IPV4_RANGES,
  NON_PUBLIC_IPV6_RANGES,
  UPSTREAM_WEBFETCH_REDIRECT_ERROR_PATTERNS,
  WEBFETCH_REDIRECT_GUARD_EVENT,
  WEBFETCH_REDIRECT_GUARD_ID,
  WEBFETCH_REDIRECT_GUARD_MARKER,
  WEBFETCH_REDIRECT_GUARD_SECONDARY_EVENT,
  WEBFETCH_REDIRECT_STATUSES,
  WebFetchRedirectPolicyError,
  buildNativePolicyPassthrough,
  buildRedirectDenyReason,
  buildRedirectLimitMessage,
  decideWebFetchRedirectDeny,
  decideWebFetchRedirectResultRewrite,
  handleWebFetchPostExecute,
  handleWebFetchPreExecute,
  isPublicIpAddress,
  isSameOriginUrl,
  isWebFetchExecution,
  normalizeTimeoutMs,
  readWebFetchUrl,
  registerWebfetchRedirectGuard,
  resolvePublicAddresses,
  resolveRedirectLocation,
  resolveWebFetchRedirects,
  validateRedirectUrl,
  type PendingDenial,
  type RedirectFetchLike,
  type RedirectLookupLike,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/webfetch-redirect-guard.ts'

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
function webfetchRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === WEBFETCH_REDIRECT_GUARD_ID)
  if (row === undefined) throw new Error('manifest is missing the webfetch-redirect-guard row')
  return row
}

/** Registers the real registrar and returns BOTH captured listeners. */
function registerAndCapture(): {
  pre: (...args: readonly unknown[]) => unknown
  post: (...args: readonly unknown[]) => unknown
  onCalls: OnCall[]
} {
  const { ctx, onCalls } = fakeContext()
  registerWebfetchRedirectGuard(ctx, webfetchRow())
  expect(onCalls).toHaveLength(2)
  const pre = onCalls.find((call) => call.event === WEBFETCH_REDIRECT_GUARD_EVENT)
  const post = onCalls.find((call) => call.event === WEBFETCH_REDIRECT_GUARD_SECONDARY_EVENT)
  if (pre === undefined || post === undefined) throw new Error('registrar did not wire both surfaces')
  return { pre: pre.listener, post: post.listener, onCalls }
}

/** A `web_fetch` execution payload shaped like the dsh `ToolExecution` leaves. */
function webFetchExec(
  url: unknown,
  identity: { callId?: unknown; token?: unknown; signal?: unknown } = {},
): Record<string, unknown> {
  return {
    name: DSH_WEB_FETCH_TOOL_NAME,
    arguments: url === undefined ? {} : { url },
    callId: identity.callId,
    token: identity.token,
    ...(identity.signal === undefined ? {} : { signal: identity.signal }),
  }
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

/** One recorded pre-resolution request. */
interface FetchCall {
  readonly url: string
  readonly status: number
  readonly headers: Record<string, string>
  readonly redirect: string
}

/**
 * A hermetic fetch double: `handler` decides the response for call `index`
 * (0-based), so a chain can be scripted hop by hop. Records the request.
 */
function fetchDouble(
  handler: (index: number, url: string) => { status: number; location?: string },
): { fetchImpl: RedirectFetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetchImpl: RedirectFetchLike = async (url, init) => {
    calls.push({
      url,
      status: 0,
      headers: init.headers,
      redirect: init.redirect,
    })
    const outcome = handler(calls.length - 1, url)
    calls[calls.length - 1] = { ...calls[calls.length - 1]!, status: outcome.status }
    return {
      status: outcome.status,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'location' ? outcome.location ?? null : null),
      },
      body: { cancel: async () => {} },
    }
  }
  return { fetchImpl, calls }
}

/**
 * The hermetic DNS answer set every pre-resolution in this suite uses: a real
 * public address (`example.com`'s). The public-destination gate resolves once
 * per hop, so a suite that passed the default `node:dns` lookup would both hit
 * the network and depend on it — the same reason the plugin's transport seam
 * exists.
 */
const PUBLIC_DNS_ANSWER = [{ address: '93.184.216.34', family: 4 }] as const

/** A resolver that answers `PUBLIC_DNS_ANSWER` for every hostname. */
function publicResolver(): RedirectLookupLike {
  return async () => PUBLIC_DNS_ANSWER
}

/**
 * A resolver that answers a scripted set: `handler` sees the (0-based) lookup
 * index and the hostname, so a chain can flip from public to private mid-flight.
 */
function scriptedResolver(
  handler: (index: number, hostname: string) => readonly { address: string; family: number }[],
): RedirectLookupLike {
  let calls = 0
  return async (hostname) => {
    const answer = handler(calls, hostname)
    calls += 1
    return answer
  }
}

/** A resolver that must never be called (a literal IP needs no resolution). */
const NEVER_RESOLVE: RedirectLookupLike = async (hostname) => {
  throw new Error(`the resolver must not be consulted for the literal address ${hostname}`)
}

/** The shared public answer set (the resolver is stateless, so one instance does). */
const PUBLIC_DNS = publicResolver()

/** A fresh pairing map, the way the registrar owns one per registration. */
function pendingMap(): WeakMap<object, PendingDenial> {
  return new WeakMap<object, PendingDenial>()
}

describe('P3-T16 webfetch-redirect-guard — upstream constant fidelity (v4.19.4)', () => {
  it('① declares the upstream hop cap and redirect-status set verbatim', () => {
    expect(MAX_WEBFETCH_REDIRECTS).toBe(10)
    expect([...WEBFETCH_REDIRECT_STATUSES].sort((a, b) => a - b)).toEqual([301, 302, 303, 307, 308])
  })

  it('① keeps upstream’s two error patterns byte-for-byte and adds the two measured DSH shapes', () => {
    expect(UPSTREAM_WEBFETCH_REDIRECT_ERROR_PATTERNS.map((pattern) => pattern.source)).toEqual([
      'redirected too many times',
      'too many redirects',
    ])
    expect(DSH_WEBFETCH_REDIRECT_ERROR_PATTERNS.map((pattern) => pattern.source)).toEqual([
      'exceeded the maximum of (\\d+) redirects',
      'cross-origin redirect to \\S+ is not followed automatically',
    ])
  })

  it('① clamps the timeout exactly like upstream (default 30s, ceiling 120s)', () => {
    expect(normalizeTimeoutMs(undefined)).toBe(30_000)
    expect(normalizeTimeoutMs(0)).toBe(30_000)
    expect(normalizeTimeoutMs(Number.NaN)).toBe(30_000)
    expect(normalizeTimeoutMs(5)).toBe(5_000)
    expect(normalizeTimeoutMs(10_000)).toBe(120_000)
  })

  it('① resolves a relative Location against the CURRENT hop (upstream case 2)', () => {
    expect(resolveRedirectLocation('https://example.com/docs/start', '/docs/final'))
      .toBe('https://example.com/docs/final')
  })
})

describe('P3-T16 webfetch-redirect-guard — the manual-redirect loop', () => {
  it('② follows one hop and reports the final URL plus the hop count', async () => {
    const { fetchImpl, calls } = fetchDouble((index) =>
      index === 0
        ? { status: 302, location: 'https://example.com/final' }
        : { status: 200 })
    const resolution = await resolveWebFetchRedirects(
      { url: 'https://example.com/start' },
      fetchImpl,
      undefined,
      PUBLIC_DNS,
    )
    expect(resolution).toEqual({
      type: 'resolved',
      url: 'https://example.com/final',
      redirectCount: 1,
    })
    expect(calls).toHaveLength(2)
    expect(calls[0]!.redirect).toBe('manual')
    expect(calls[0]!.headers.Accept).toContain('text/markdown')
    expect(calls[0]!.headers['User-Agent']).toContain('Mozilla/5.0')
    expect(calls[0]!.headers['Accept-Language']).toBe('en-US,en;q=0.9')
  })

  it('② resolves a relative Location hop by hop', async () => {
    const { fetchImpl } = fetchDouble((index) =>
      index === 0
        ? { status: 301, location: '/docs/final' }
        : { status: 200 })
    const resolution = await resolveWebFetchRedirects(
      { url: 'https://example.com/docs/start' },
      fetchImpl,
      undefined,
      PUBLIC_DNS,
    )
    expect(resolution).toEqual({
      type: 'resolved',
      url: 'https://example.com/docs/final',
      redirectCount: 1,
    })
  })

  it('② reports `exceeded` once the chain leaves the cap', async () => {
    const { fetchImpl, calls } = fetchDouble(() => ({ status: 302, location: '/loop' }))
    const resolution = await resolveWebFetchRedirects(
      { url: 'https://example.com/loop' },
      fetchImpl,
      undefined,
      PUBLIC_DNS,
    )
    expect(resolution).toEqual({
      type: 'exceeded',
      url: 'https://example.com/loop',
      maxRedirects: MAX_WEBFETCH_REDIRECTS,
    })
    // MAX hops followed + the hop that discovered the overflow (upstream's
    // `redirectCount >= MAX` check runs AFTER the fetch).
    expect(calls).toHaveLength(MAX_WEBFETCH_REDIRECTS + 1)
  })

  it('② treats a redirect status WITHOUT a Location header as resolved (upstream verbatim)', async () => {
    const { fetchImpl, calls } = fetchDouble(() => ({ status: 302 }))
    const resolution = await resolveWebFetchRedirects(
      { url: 'https://example.com/x' },
      fetchImpl,
      undefined,
      PUBLIC_DNS,
    )
    expect(resolution).toEqual({
      type: 'resolved',
      url: 'https://example.com/x',
      redirectCount: 0,
    })
    expect(calls).toHaveLength(1)
  })

  it('② reports the REQUESTED string verbatim for a non-redirecting hop (no URL normalization)', async () => {
    // `new URL('https://example.com').toString()` is `https://example.com/`; the
    // B half compares the resolution to the model's own argument, so a canonical
    // rewrite here would deny a call that never redirected.
    const { fetchImpl, calls } = fetchDouble(() => ({ status: 200 }))
    const resolution = await resolveWebFetchRedirects(
      { url: 'https://example.com' },
      fetchImpl,
      undefined,
      PUBLIC_DNS,
    )
    expect(resolution).toEqual({ type: 'resolved', url: 'https://example.com', redirectCount: 0 })
    expect(calls[0]!.url).toBe('https://example.com')
  })
})

describe('P3-T16 webfetch-redirect-guard — the public-destination gate (review F1 SSRF)', () => {
  /**
   * The destinations the review named — loopback, RFC1918, link-local, CGNAT,
   * multicast, unspecified, plus the IPv6 spellings of the same. Each must cost
   * ZERO requests; a single one of these reaching `fetchImpl` is the defect the
   * review reproduced with a local 127.0.0.1 server.
   */
  const NON_PUBLIC_TARGETS: readonly string[] = [
    'http://127.0.0.1/start', // loopback
    'http://127.9.9.9/start', // the whole 127/8 block
    'http://10.1.2.3/start', // RFC1918
    'http://172.20.5.5/start', // RFC1918
    'http://192.168.0.9/start', // RFC1918
    'http://169.254.169.254/latest/meta-data', // link-local (the cloud metadata service)
    'http://100.64.0.1/start', // CGNAT
    'http://224.0.0.1/start', // multicast
    'http://0.0.0.0/start', // unspecified / this-network
    'http://[::1]/start', // IPv6 loopback
    'http://[fe80::1]/start', // IPv6 link-local
    'http://[fd00::1]/start', // IPv6 unique-local
    'http://[::ffff:127.0.0.1]/start', // IPv4-mapped loopback
    'http://[::ffff:7f00:1]/start', // the WHATWG-normalized spelling of the same
    // ── the buckets PR #9 review round 2 (MAJOR-1) found missing, one literal
    //    per PREVIOUSLY-UNBLOCKED prefix: each must now cost ZERO fetch calls ──
    'http://192.31.196.1/start', // as112 (AS112-v4 direct delegation)
    'http://192.52.193.1/start', // amt (RFC7450)
    'http://192.175.48.1/start', // as112 (RFC7534)
    'http://[fec0::1]/start', // deprecated site-local (RFC3879)
    'http://[100::1]/start', // discard-only (RFC6666)
    'http://[::ffff:0:0:1]/start', // IPv4-translated rfc6145 (WHATWG-normalized spelling)
    'http://[2001:3::1]/start', // amt v6
    'http://[2001:4:112::1]/start', // as112v6 (RFC7535)
    'http://[2620:4f:8000::1]/start', // as112v6 (RFC7534)
    'http://[2001:30::1]/start', // Drone Remote ID (RFC9374)
    'http://[5f00::1]/start', // SRv6 SIDs (RFC9602)
    'http://[2001:100::1]/start', // the reserved 2001::/23 superset
  ]

  it('① a non-public LITERAL destination costs ZERO fetch calls and ZERO DNS lookups', async () => {
    for (const url of NON_PUBLIC_TARGETS) {
      const { fetchImpl, calls } = fetchDouble(() => ({ status: 200 }))
      // NEVER_RESOLVE throws if consulted: a literal needs no lookup, and a
      // lookup here would itself be a (tiny) network touch.
      const decision = await decideWebFetchRedirectDeny(webFetchExec(url), fetchImpl, NEVER_RESOLVE)
      expect(decision, url).toBeUndefined()
      expect(calls, url).toHaveLength(0)
    }
  })

  it('① a hostname that RESOLVES to a private address costs ZERO fetch calls', async () => {
    const answers: ReadonlyArray<readonly { address: string; family: number }[]> = [
      [{ address: '10.0.0.5', family: 4 }],
      [{ address: '192.168.1.10', family: 4 }],
      [{ address: '169.254.169.254', family: 4 }],
      // Native rejects the WHOLE answer set when ANY element is non-public.
      [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }],
    ]
    for (const answer of answers) {
      const { fetchImpl, calls } = fetchDouble(() => ({ status: 200 }))
      const decision = await decideWebFetchRedirectDeny(
        webFetchExec('http://internal.example/start'),
        fetchImpl,
        scriptedResolver(() => answer),
      )
      expect(decision).toBeUndefined()
      expect(calls).toHaveLength(0)
    }
  })

  it('① the classifier mirrors native `unicast` for the ranges the review named', () => {
    for (const address of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
      expect(isPublicIpAddress(address), address).toBe(true)
    }
    for (const address of [
      '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1',
      '224.0.0.1', '0.0.0.0', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'ff02::1',
      '::ffff:127.0.0.1', '64:ff9b::1.2.3.4', '2002::1', '2001::1', 'not-an-ip',
    ]) {
      expect(isPublicIpAddress(address), address).toBe(false)
    }
  })

  /**
   * The INDEPENDENT transcription of `ipaddr.js` 2.5.0's non-unicast
   * `SpecialRanges` — read from the installed package the native
   * `isPublicIpAddress` calls (`node_modules/ipaddr.js/lib/ipaddr.js:185-219`
   * IPv4 and `:563-613` IPv6). It is deliberately NOT derived from the module
   * under test: this list is the reconciliation yardstick review round 2
   * (MAJOR-1) demanded, so a table edit that drops a bucket turns this red.
   */
  interface NativeNonUnicastBucket {
    readonly family: 4 | 6
    readonly key: string
    readonly cidr: string
    readonly base: readonly number[]
    readonly prefix: number
  }

  const NATIVE_NON_UNICAST_BUCKETS: readonly NativeNonUnicastBucket[] = [
    // IPv4.SpecialRanges, ipaddr.js 2.5.0
    { family: 4, key: 'unspecified', cidr: '0.0.0.0/8', base: [0, 0, 0, 0], prefix: 8 },
    { family: 4, key: 'broadcast', cidr: '255.255.255.255/32', base: [255, 255, 255, 255], prefix: 32 },
    { family: 4, key: 'multicast', cidr: '224.0.0.0/4', base: [224, 0, 0, 0], prefix: 4 },
    { family: 4, key: 'linkLocal', cidr: '169.254.0.0/16', base: [169, 254, 0, 0], prefix: 16 },
    { family: 4, key: 'loopback', cidr: '127.0.0.0/8', base: [127, 0, 0, 0], prefix: 8 },
    { family: 4, key: 'carrierGradeNat', cidr: '100.64.0.0/10', base: [100, 64, 0, 0], prefix: 10 },
    { family: 4, key: 'private', cidr: '10.0.0.0/8', base: [10, 0, 0, 0], prefix: 8 },
    { family: 4, key: 'private', cidr: '172.16.0.0/12', base: [172, 16, 0, 0], prefix: 12 },
    { family: 4, key: 'private', cidr: '192.168.0.0/16', base: [192, 168, 0, 0], prefix: 16 },
    { family: 4, key: 'reserved', cidr: '192.0.0.0/24', base: [192, 0, 0, 0], prefix: 24 },
    { family: 4, key: 'reserved', cidr: '192.0.2.0/24', base: [192, 0, 2, 0], prefix: 24 },
    { family: 4, key: 'reserved', cidr: '192.88.99.0/24', base: [192, 88, 99, 0], prefix: 24 },
    { family: 4, key: 'reserved', cidr: '198.18.0.0/15', base: [198, 18, 0, 0], prefix: 15 },
    { family: 4, key: 'reserved', cidr: '198.51.100.0/24', base: [198, 51, 100, 0], prefix: 24 },
    { family: 4, key: 'reserved', cidr: '203.0.113.0/24', base: [203, 0, 113, 0], prefix: 24 },
    { family: 4, key: 'reserved', cidr: '240.0.0.0/4', base: [240, 0, 0, 0], prefix: 4 },
    { family: 4, key: 'as112', cidr: '192.175.48.0/24', base: [192, 175, 48, 0], prefix: 24 },
    { family: 4, key: 'as112', cidr: '192.31.196.0/24', base: [192, 31, 196, 0], prefix: 24 },
    { family: 4, key: 'amt', cidr: '192.52.193.0/24', base: [192, 52, 193, 0], prefix: 24 },
    // IPv6.SpecialRanges, ipaddr.js 2.5.0 (the source's own key order)
    { family: 6, key: 'unspecified', cidr: '::/128', base: [0, 0, 0, 0, 0, 0, 0, 0], prefix: 128 },
    { family: 6, key: 'linkLocal', cidr: 'fe80::/10', base: [0xfe80, 0, 0, 0, 0, 0, 0, 0], prefix: 10 },
    { family: 6, key: 'multicast', cidr: 'ff00::/8', base: [0xff00, 0, 0, 0, 0, 0, 0, 0], prefix: 8 },
    { family: 6, key: 'loopback', cidr: '::1/128', base: [0, 0, 0, 0, 0, 0, 0, 1], prefix: 128 },
    { family: 6, key: 'uniqueLocal', cidr: 'fc00::/7', base: [0xfc00, 0, 0, 0, 0, 0, 0, 0], prefix: 7 },
    { family: 6, key: 'ipv4Mapped', cidr: '::ffff:0:0/96', base: [0, 0, 0, 0, 0, 0xffff, 0, 0], prefix: 96 },
    {
      family: 6,
      key: 'deprecatedSiteLocal',
      cidr: 'fec0::/10',
      base: [0xfec0, 0, 0, 0, 0, 0, 0, 0],
      prefix: 10,
    },
    { family: 6, key: 'discard', cidr: '100::/64', base: [0x100, 0, 0, 0, 0, 0, 0, 0], prefix: 64 },
    { family: 6, key: 'rfc6145', cidr: '::ffff:0:0:0/96', base: [0, 0, 0, 0, 0xffff, 0, 0, 0], prefix: 96 },
    { family: 6, key: 'rfc6052', cidr: '64:ff9b::/96', base: [0x64, 0xff9b, 0, 0, 0, 0, 0, 0], prefix: 96 },
    { family: 6, key: 'rfc6052', cidr: '64:ff9b:1::/48', base: [0x64, 0xff9b, 1, 0, 0, 0, 0, 0], prefix: 48 },
    { family: 6, key: '6to4', cidr: '2002::/16', base: [0x2002, 0, 0, 0, 0, 0, 0, 0], prefix: 16 },
    { family: 6, key: 'teredo', cidr: '2001::/32', base: [0x2001, 0, 0, 0, 0, 0, 0, 0], prefix: 32 },
    { family: 6, key: 'benchmarking', cidr: '2001:2::/48', base: [0x2001, 2, 0, 0, 0, 0, 0, 0], prefix: 48 },
    { family: 6, key: 'amt', cidr: '2001:3::/32', base: [0x2001, 3, 0, 0, 0, 0, 0, 0], prefix: 32 },
    { family: 6, key: 'as112v6', cidr: '2001:4:112::/48', base: [0x2001, 4, 0x112, 0, 0, 0, 0, 0], prefix: 48 },
    {
      family: 6,
      key: 'as112v6',
      cidr: '2620:4f:8000::/48',
      base: [0x2620, 0x4f, 0x8000, 0, 0, 0, 0, 0],
      prefix: 48,
    },
    { family: 6, key: 'deprecatedOrchid', cidr: '2001:10::/28', base: [0x2001, 0x10, 0, 0, 0, 0, 0, 0], prefix: 28 },
    { family: 6, key: 'orchid2', cidr: '2001:20::/28', base: [0x2001, 0x20, 0, 0, 0, 0, 0, 0], prefix: 28 },
    {
      family: 6,
      key: 'droneRemoteIdProtocolEntityTags',
      cidr: '2001:30::/28',
      base: [0x2001, 0x30, 0, 0, 0, 0, 0, 0],
      prefix: 28,
    },
    { family: 6, key: 'segmentRouting', cidr: '5f00::/16', base: [0x5f00, 0, 0, 0, 0, 0, 0, 0], prefix: 16 },
    { family: 6, key: 'reserved', cidr: '2001::/23', base: [0x2001, 0, 0, 0, 0, 0, 0, 0], prefix: 23 },
    { family: 6, key: 'reserved', cidr: '2001:db8::/32', base: [0x2001, 0xdb8, 0, 0, 0, 0, 0, 0], prefix: 32 },
    { family: 6, key: 'reserved', cidr: '3fff::/20', base: [0x3fff, 0, 0, 0, 0, 0, 0, 0], prefix: 20 },
  ]

  /** A bucket's base (`end: false`) or last (`end: true`) address, derived HERE, not by the module. */
  function bucketAddress(bucket: NativeNonUnicastBucket, end: boolean): string {
    const width = bucket.family === 4 ? 8 : 16
    const full = bucket.family === 4 ? 0xff : 0xffff
    const out: number[] = []
    let remaining = bucket.prefix
    for (let index = 0; index < bucket.base.length; index += 1) {
      const take = Math.max(0, Math.min(width, remaining))
      const hostBits = width - take
      const keep = (full << hostBits) & full
      const host = end ? (1 << hostBits) - 1 : 0
      out.push(((bucket.base[index] ?? 0) & keep) | host)
      remaining -= take
    }
    return bucket.family === 4 ? out.join('.') : out.map((group) => group.toString(16)).join(':')
  }

  it('① RECONCILIATION: every ipaddr.js 2.5.0 non-unicast bucket is refused at BOTH ends', () => {
    for (const bucket of NATIVE_NON_UNICAST_BUCKETS) {
      expect(isPublicIpAddress(bucketAddress(bucket, false)), `${bucket.cidr} start`).toBe(false)
      expect(isPublicIpAddress(bucketAddress(bucket, true)), `${bucket.cidr} end`).toBe(false)
    }
  })

  it('① RECONCILIATION: the audit tables carry exactly the native bucket keys plus the stricter one', () => {
    const nativeV4Keys = new Set(
      NATIVE_NON_UNICAST_BUCKETS.filter((bucket) => bucket.family === 4).map((bucket) => bucket.key),
    )
    // `broadcast` (255.255.255.255/32) is inside the `reserved` 240/4 entry, so
    // the table is a NORMALIZED cover rather than a literal bucket copy.
    nativeV4Keys.delete('broadcast')
    expect(new Set(NON_PUBLIC_IPV4_RANGES.map((range) => range.nativeRange))).toEqual(nativeV4Keys)
    expect(isPublicIpAddress('255.255.255.255')).toBe(false)

    const nativeV6Keys = new Set(
      NATIVE_NON_UNICAST_BUCKETS.filter((bucket) => bucket.family === 6).map((bucket) => bucket.key),
    )
    expect(new Set(NON_PUBLIC_IPV6_RANGES.map((range) => range.nativeRange))).toEqual(
      new Set([...nativeV6Keys, 'stricter']),
    )
    // The ONE over-block is registered as such, and it really is an over-block:
    // ipaddr.js calls `::2` unicast, this port refuses it on purpose.
    expect(NON_PUBLIC_IPV6_RANGES.filter((range) => range.nativeRange === 'stricter').map((r) => r.cidr))
      .toEqual(['::/96'])
    expect(isPublicIpAddress('::2')).toBe(false)
  })

  it('① validateRedirectUrl mirrors the native pre-network policy', () => {
    expect(validateRedirectUrl('https://example.com/x').hostname).toBe('example.com')
    expect(() => validateRedirectUrl('ftp://example.com/x')).toThrow(WebFetchRedirectPolicyError)
    expect(() => validateRedirectUrl('https://user:pass@example.com/x'))
      .toThrow(WebFetchRedirectPolicyError)
    expect(() => validateRedirectUrl(`https://example.com/${'a'.repeat(2048)}`))
      .toThrow(WebFetchRedirectPolicyError)
  })

  it('① resolvePublicAddresses rejects an empty answer set and returns the validated one', async () => {
    const signal = AbortSignal.timeout(1000)
    await expect(resolvePublicAddresses('example.com', signal, scriptedResolver(() => [])))
      .rejects.toBeInstanceOf(WebFetchRedirectPolicyError)
    await expect(resolvePublicAddresses('example.com', signal, PUBLIC_DNS))
      .resolves.toEqual([{ address: '93.184.216.34', family: 4 }])
  })

  it('② the gate REJECTS with the native code instead of dialling, and the B half fails open', async () => {
    const { fetchImpl, calls } = fetchDouble(() => ({ status: 200 }))
    const thrown = await resolveWebFetchRedirects(
      { url: 'http://169.254.169.254/latest/meta-data' },
      fetchImpl,
      undefined,
      NEVER_RESOLVE,
    ).catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(WebFetchRedirectPolicyError)
    expect((thrown as WebFetchRedirectPolicyError).code).toBe('WEB_BLOCKED_URL')
    expect(calls).toHaveLength(0)
    // The denial the model may see stays the NATIVE provider's; the guard only
    // refuses to probe first.
    expect(await decideWebFetchRedirectDeny(
      webFetchExec('http://169.254.169.254/latest/meta-data'),
      fetchImpl,
      NEVER_RESOLVE,
    )).toBeUndefined()
  })

  it('② a public first hop whose Location goes private does NOT request the second hop', async () => {
    const { fetchImpl, calls } = fetchDouble((index) =>
      index === 0 ? { status: 302, location: 'http://127.0.0.1/final' } : { status: 200 })
    const decision = await decideWebFetchRedirectDeny(
      webFetchExec('https://example.com/start'),
      fetchImpl,
      PUBLIC_DNS,
    )
    expect(decision).toBeUndefined()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://example.com/start')
  })

  it('② a SAME-ORIGIN hop that resolves private on its own lookup is never requested', async () => {
    const resolver = scriptedResolver((index) =>
      index === 0 ? PUBLIC_DNS_ANSWER : [{ address: '10.0.0.7', family: 4 }])
    const { fetchImpl, calls } = fetchDouble((index) =>
      index === 0 ? { status: 302, location: '/final' } : { status: 200 })
    const decision = await decideWebFetchRedirectDeny(
      webFetchExec('https://example.com/start'),
      fetchImpl,
      resolver,
    )
    expect(decision).toBeUndefined()
    expect(calls).toHaveLength(1)
  })

  it('② a cross-origin Location is never followed, even when it is public', async () => {
    const { fetchImpl, calls } = fetchDouble((index) =>
      index === 0 ? { status: 302, location: 'https://other.example/final' } : { status: 200 })
    const thrown = await resolveWebFetchRedirects(
      { url: 'https://example.com/start' },
      fetchImpl,
      undefined,
      PUBLIC_DNS,
    ).catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(WebFetchRedirectPolicyError)
    expect((thrown as WebFetchRedirectPolicyError).code).toBe('WEB_REDIRECT_BLOCKED')
    expect(calls).toHaveLength(1)
    expect(isSameOriginUrl(new URL('https://example.com/a'), new URL('https://other.example/a')))
      .toBe(false)
  })

  it('③ a public same-origin chain still resolves, with one lookup per hop', async () => {
    const lookups: string[] = []
    const resolver = scriptedResolver((_index, hostname) => {
      lookups.push(hostname)
      return PUBLIC_DNS_ANSWER
    })
    const { fetchImpl, calls } = fetchDouble((index) =>
      index === 0 ? { status: 302, location: '/final' } : { status: 200 })
    const resolution = await resolveWebFetchRedirects(
      { url: 'https://example.com/start' },
      fetchImpl,
      undefined,
      resolver,
    )
    expect(resolution).toEqual({
      type: 'resolved',
      url: 'https://example.com/final',
      redirectCount: 1,
    })
    expect(calls).toHaveLength(2)
    expect(lookups).toEqual(['example.com', 'example.com'])
  })
})

describe('P3-T16 webfetch-redirect-guard — the B deny decision', () => {
  it('③ denies a redirecting URL with the final URL in the reason (the degraded B mode)', async () => {
    const { fetchImpl } = fetchDouble((index) =>
      index === 0
        ? { status: 302, location: 'https://example.com/final' }
        : { status: 200 })
    const exec = webFetchExec('https://example.com/start', { callId: 'call-1', token: 'tok-1' })
    const decision = (await decideWebFetchRedirectDeny(exec, fetchImpl, PUBLIC_DNS)) as
      | PreDecision
      | undefined
    expect(decision?.kind).toBe('deny')
    expect(decision?.reason).toContain('https://example.com/final')
    expect(decision?.reason).toContain('1 redirect')
    expect(decision?.reason).toContain(WEBFETCH_REDIRECT_GUARD_MARKER)
    // DSH materializes `Error: ${reason}`; the reason must not pre-empt that.
    expect(decision?.reason?.startsWith('Error: ')).toBe(false)
  })

  it('③ denies an over-the-cap chain with upstream’s normalized limit message', async () => {
    const { fetchImpl } = fetchDouble(() => ({ status: 302, location: '/loop' }))
    const exec = webFetchExec('https://example.com/loop')
    const decision = (await decideWebFetchRedirectDeny(exec, fetchImpl, PUBLIC_DNS)) as
      | PreDecision
      | undefined
    expect(decision?.kind).toBe('deny')
    // `errorPrefix: false`: DSH materializes `Error: ${reason}`
    // (dsh-tools/lib/index.js:3134), so this path must not pre-empt it either —
    // the e2e only covers the one-hop path.
    expect(decision?.reason).toBe(
      buildRedirectLimitMessage('https://example.com/loop', MAX_WEBFETCH_REDIRECTS, {
        errorPrefix: false,
      }),
    )
    expect(decision?.reason?.startsWith('Error: ')).toBe(false)
  })

  it('③ passes a URL that does not redirect', async () => {
    const { fetchImpl } = fetchDouble(() => ({ status: 200 }))
    const exec = webFetchExec('https://example.com/plain')
    expect(await decideWebFetchRedirectDeny(exec, fetchImpl, PUBLIC_DNS)).toBeUndefined()
  })

  it('③ passes a non-redirecting URL whose canonical form differs (no false deny)', async () => {
    // Regression guard for the F1 change: the gate must not turn a WHATWG
    // canonicalization into a "redirect" deny. The model asked for
    // `https://example.com`; there is nothing to retry.
    const { fetchImpl, calls } = fetchDouble(() => ({ status: 200 }))
    const exec = webFetchExec('https://example.com')
    expect(await decideWebFetchRedirectDeny(exec, fetchImpl, PUBLIC_DNS)).toBeUndefined()
    expect(calls).toHaveLength(1)
  })

  it('③ passes a non-web-fetch tool without any request at all', async () => {
    const { fetchImpl, calls } = fetchDouble(() => ({ status: 302, location: '/x' }))
    expect(await decideWebFetchRedirectDeny({ name: 'grep', arguments: { url: 'https://e/x' } }, fetchImpl))
      .toBeUndefined()
    expect(calls).toHaveLength(0)
    expect(isWebFetchExecution({ name: 'grep' })).toBe(false)
    expect(isWebFetchExecution({ name: DSH_WEB_FETCH_TOOL_NAME })).toBe(true)
    expect(isWebFetchExecution({ name: 'webfetch' })).toBe(true)
    expect(isWebFetchExecution(null)).toBe(false)
  })

  it('③ passes a web-fetch call without a usable URL', async () => {
    const { fetchImpl, calls } = fetchDouble(() => ({ status: 302, location: '/x' }))
    expect(await decideWebFetchRedirectDeny(webFetchExec(undefined), fetchImpl)).toBeUndefined()
    expect(await decideWebFetchRedirectDeny(webFetchExec(''), fetchImpl)).toBeUndefined()
    expect(await decideWebFetchRedirectDeny({ name: DSH_WEB_FETCH_TOOL_NAME }, fetchImpl)).toBeUndefined()
    expect(calls).toHaveLength(0)
    expect(readWebFetchUrl({ url: 'https://e/x' })).toBe('https://e/x')
    expect(readWebFetchUrl({ url: 7 })).toBeUndefined()
  })

  it('③ FAILS OPEN when the pre-resolution itself fails (upstream’s catch arm)', async () => {
    const fetchImpl: RedirectFetchLike = async () => {
      throw new Error('ENOTFOUND')
    }
    expect(await decideWebFetchRedirectDeny(webFetchExec('https://e/x'), fetchImpl, PUBLIC_DNS))
      .toBeUndefined()
  })

  it('③ FAILS OPEN when the Location header cannot be resolved', async () => {
    const { fetchImpl } = fetchDouble(() => ({ status: 302, location: 'http://[' }))
    expect(await decideWebFetchRedirectDeny(webFetchExec('https://e/x'), fetchImpl, PUBLIC_DNS))
      .toBeUndefined()
  })

  it('③ the reason text lists N redirects for a multi-hop chain', async () => {
    const { fetchImpl } = fetchDouble((index) =>
      index < 2 ? { status: 307, location: `/hop-${index}` } : { status: 200 })
    const decision = (await decideWebFetchRedirectDeny(
      webFetchExec('https://e/start'),
      fetchImpl,
      PUBLIC_DNS,
    )) as PreDecision | undefined
    expect(decision?.reason).toContain('2 redirects')
    expect(decision?.reason).toContain('https://e/hop-1')
  })

  it('④ buildRedirectDenyReason is stable and carries the marker', () => {
    expect(buildRedirectDenyReason({
      requestedUrl: 'https://a',
      finalUrl: 'https://b',
      redirectCount: 1,
    })).toBe(
      `${WEBFETCH_REDIRECT_GUARD_MARKER}: "https://a" follows 1 redirect to "https://b". `
      + 'This harness cannot rewrite tool arguments, so re-issue web_fetch with the final URL '
      + '"https://b" directly.',
    )
  })
})

describe('P3-T16 webfetch-redirect-guard — the D result rewrite', () => {
  /** The exact upstream raw loop error (its index.test.ts case 3). */
  const UPSTREAM_RAW_LOOP_ERROR =
    'Error: The response redirected too many times. For more information, pass `verbose: true` '
    + 'in the second argument to fetch()'

  function errorResult(text: string): { isError: true; content: Array<{ type: string; text: string }> } {
    return { isError: true, content: [{ type: 'text', text }] }
  }

  it('⑤ normalizes a raw redirect-loop error that carries no tracked state (upstream case 4)', () => {
    const exec = webFetchExec('https://example.com/loop')
    const decision = decideWebFetchRedirectResultRewrite(
      exec,
      errorResult(UPSTREAM_RAW_LOOP_ERROR),
      pendingMap(),
    ) as PostDecision | undefined
    expect(decision?.kind).toBe('accept')
    // Upstream's second rule runs without the tracked original URL and prints
    // `buildRedirectLimitMessage()` bare. This port CAN name the requested URL
    // (the SAME `exec` object is in hand, so no tracked state is needed) — a
    // deliberate improvement, recorded in the module header.
    expect(decision?.content?.[0]?.text).toBe(
      buildRedirectLimitMessage('https://example.com/loop'),
    )
  })

  it('⑤ keeps successful content that merely MENTIONS redirect loops (upstream case 5)', () => {
    const exec = webFetchExec('https://example.com/article')
    const result = {
      isError: false,
      content: [{ type: 'text', text: 'This page explains why browsers hit too many redirects.' }],
    }
    expect(decideWebFetchRedirectResultRewrite(exec, result, pendingMap())).toBeUndefined()
  })

  it('⑤ passes the MEASURED DSH over-cap error through VERBATIM and only appends our context', () => {
    const exec = webFetchExec('https://example.com/loop')
    const nativeText = 'Error: exceeded the maximum of 5 redirects'
    const decision = decideWebFetchRedirectResultRewrite(
      exec,
      errorResult(nativeText),
      pendingMap(),
    ) as PostDecision | undefined
    const output = decision?.content?.[0]?.text ?? ''
    // Review round 2 MAJOR-2: the native sentence — and the RUNTIME cap it names
    // — must survive byte for byte; the guard appends BELOW it, never rewrites.
    expect(output.startsWith(nativeText)).toBe(true)
    // The cap is the provider's own phrasing (`of 5 redirects`), not this port's
    // old `(5)` transcription of it, and not upstream's fabricated `(10)`.
    expect(output).toContain('exceeded the maximum of 5 redirects')
    expect(output).not.toContain('(5)')
    expect(output).not.toContain('(10)')
    expect(output).toContain(WEBFETCH_REDIRECT_GUARD_MARKER)
    expect(output).toContain('https://example.com/loop')
    expect(output).toBe(buildNativePolicyPassthrough(nativeText, 'https://example.com/loop'))
  })

  it('⑤ passes the MEASURED DSH cross-origin error through VERBATIM (the ORIGIN survives)', () => {
    const exec = webFetchExec('https://example.com/a')
    const nativeText =
      'Error: cross-origin redirect to https://cdn.other.example is not followed automatically; '
      + 'retry against that URL directly'
    const decision = decideWebFetchRedirectResultRewrite(
      exec,
      errorResult(nativeText),
      pendingMap(),
    ) as PostDecision | undefined
    const output = decision?.content?.[0]?.text ?? ''
    expect(output.startsWith(nativeText)).toBe(true)
    // The origin native named is the actionable datum the earlier revision
    // paraphrased away; it must be present, and no fabricated cap may appear.
    expect(output).toContain('https://cdn.other.example')
    expect(output).toContain(WEBFETCH_REDIRECT_GUARD_MARKER)
    expect(output).toContain('https://example.com/a')
    expect(output).not.toContain('(10)')
  })

  it('⑤ leaves a non-fetch, a non-error and an already-normalized result alone', () => {
    const pending = pendingMap()
    expect(decideWebFetchRedirectResultRewrite(
      { name: 'grep', arguments: {} },
      errorResult('Error: too many redirects'),
      pending,
    )).toBeUndefined()
    expect(decideWebFetchRedirectResultRewrite(
      webFetchExec('https://e/x'),
      { isError: false, content: [{ type: 'text', text: 'Error: too many redirects' }] },
      pending,
    )).toBeUndefined()
    // A structural fake WITHOUT the flag falls back to upstream's text sniff.
    expect(decideWebFetchRedirectResultRewrite(
      webFetchExec('https://e/x'),
      { content: [{ type: 'text', text: 'Error: too many redirects' }] },
      pending,
    )).toBeDefined()
    expect(decideWebFetchRedirectResultRewrite(
      webFetchExec('https://e/x'),
      errorResult(buildRedirectLimitMessage()),
      pending,
    )).toBeUndefined()
  })

  it('⑥ skips the result of a call this listener itself denied (the native pairing)', async () => {
    const { fetchImpl } = fetchDouble((index) =>
      index === 0 ? { status: 302, location: '/final' } : { status: 200 })
    const pending = pendingMap()
    const exec = webFetchExec('https://e/start', { callId: 'call-9', token: 'tok-9' })
    const next = nextDouble()
    const deny = await handleWebFetchPreExecute(exec, next.next, pending, fetchImpl, PUBLIC_DNS)
    expect((deny as PreDecision).kind).toBe('deny')
    expect(next.calls()).toBe(0)
    // The pairing records the NATIVE identity fields, keyed by the live
    // execution object (never a re-derived string key).
    expect(pending.get(exec)).toEqual({
      callId: 'call-9',
      token: 'tok-9',
      reason: (deny as PreDecision).reason,
    })
    // The D half must leave OUR OWN deny result alone and consume the entry.
    const post = await handleWebFetchPostExecute(
      exec,
      errorResult(String((deny as PreDecision).reason)),
      next.next,
      pending,
    )
    expect(post).toBe(NEXT_RESULT)
    expect(next.calls()).toBe(1)
    expect(pending.has(exec)).toBe(false)
  })
})

describe('P3-T16 webfetch-redirect-guard — listener bodies + registration', () => {
  it('⑥ the B listener delegates non-fetch calls without any network touch', async () => {
    const { pre } = registerAndCapture()
    const delegated = nextDouble()
    const passed = await pre({ name: 'grep', arguments: {} }, delegated.next)
    expect(passed).toBe(NEXT_RESULT)
    expect(delegated.calls()).toBe(1)
    // A web-fetch call with no URL never reaches the pre-resolution either, so
    // this suite stays hermetic (the redirecting paths inject their transport).
    const noUrl = nextDouble()
    expect(await pre(webFetchExec(undefined), noUrl.next)).toBe(NEXT_RESULT)
    expect(noUrl.calls()).toBe(1)
  })

  it('⑥ FAILS OPEN on a throwing payload accessor instead of propagating (discipline ②)', async () => {
    const hostile = {
      get name(): string {
        throw new Error('boom')
      },
      arguments: {},
    }
    const pending = pendingMap()
    const next = nextDouble()
    expect(await handleWebFetchPreExecute(hostile, next.next, pending)).toBe(NEXT_RESULT)
    expect(next.calls()).toBe(1)

    const postNext = nextDouble()
    expect(await handleWebFetchPostExecute(hostile, { isError: true, content: [] }, postNext.next, pending))
      .toBe(NEXT_RESULT)
    expect(postNext.calls()).toBe(1)
  })

  it('⑥ wires BOTH surfaces, the primary one from the manifest row', () => {
    const { onCalls } = registerAndCapture()
    expect(onCalls.map((call) => call.event)).toEqual([
      WEBFETCH_REDIRECT_GUARD_EVENT,
      WEBFETCH_REDIRECT_GUARD_SECONDARY_EVENT,
    ])
    expect(webfetchRow().event).toBe(WEBFETCH_REDIRECT_GUARD_EVENT)
    expect(webfetchRow().e2eScenario).toBe('webfetch-private-target-unprobed')
    expect(webfetchRow().status).toBe('ported')
  })
})
