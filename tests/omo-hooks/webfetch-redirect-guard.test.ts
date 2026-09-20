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
  UPSTREAM_WEBFETCH_REDIRECT_ERROR_PATTERNS,
  WEBFETCH_REDIRECT_GUARD_EVENT,
  WEBFETCH_REDIRECT_GUARD_ID,
  WEBFETCH_REDIRECT_GUARD_MARKER,
  WEBFETCH_REDIRECT_GUARD_SECONDARY_EVENT,
  WEBFETCH_REDIRECT_STATUSES,
  buildCrossOriginRedirectMessage,
  buildRedirectDenyReason,
  buildRedirectLimitMessage,
  decideWebFetchRedirectDeny,
  decideWebFetchRedirectResultRewrite,
  handleWebFetchPostExecute,
  handleWebFetchPreExecute,
  isWebFetchExecution,
  normalizeTimeoutMs,
  readWebFetchUrl,
  registerWebfetchRedirectGuard,
  resolveRedirectLocation,
  resolveWebFetchRedirects,
  type PendingDenial,
  type RedirectFetchLike,
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
    const resolution = await resolveWebFetchRedirects({ url: 'https://example.com/start' }, fetchImpl)
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
    const resolution = await resolveWebFetchRedirects({ url: 'https://example.com/x' }, fetchImpl)
    expect(resolution).toEqual({
      type: 'resolved',
      url: 'https://example.com/x',
      redirectCount: 0,
    })
    expect(calls).toHaveLength(1)
  })
})

describe('P3-T16 webfetch-redirect-guard — the B deny decision', () => {
  it('③ denies a redirecting URL with the final URL in the reason (the degraded B mode)', async () => {
    const { fetchImpl } = fetchDouble((index) =>
      index === 0
        ? { status: 302, location: 'https://example.com/final' }
        : { status: 200 })
    const exec = webFetchExec('https://example.com/start', { callId: 'call-1', token: 'tok-1' })
    const decision = (await decideWebFetchRedirectDeny(exec, fetchImpl)) as PreDecision | undefined
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
    const decision = (await decideWebFetchRedirectDeny(exec, fetchImpl)) as PreDecision | undefined
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
    expect(await decideWebFetchRedirectDeny(exec, fetchImpl)).toBeUndefined()
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
    expect(await decideWebFetchRedirectDeny(webFetchExec('https://e/x'), fetchImpl)).toBeUndefined()
  })

  it('③ FAILS OPEN when the Location header cannot be resolved', async () => {
    const { fetchImpl } = fetchDouble(() => ({ status: 302, location: 'http://[' }))
    expect(await decideWebFetchRedirectDeny(webFetchExec('https://e/x'), fetchImpl)).toBeUndefined()
  })

  it('③ the reason text lists N redirects for a multi-hop chain', async () => {
    const { fetchImpl } = fetchDouble((index) =>
      index < 2 ? { status: 307, location: `/hop-${index}` } : { status: 200 })
    const decision = (await decideWebFetchRedirectDeny(
      webFetchExec('https://e/start'),
      fetchImpl,
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

  it('⑤ normalizes the MEASURED DSH over-cap error and reports the runtime cap', () => {
    const exec = webFetchExec('https://example.com/loop')
    const decision = decideWebFetchRedirectResultRewrite(
      exec,
      errorResult('Error: exceeded the maximum of 5 redirects'),
      pendingMap(),
    ) as PostDecision | undefined
    expect(decision?.content?.[0]?.text).toBe(
      buildRedirectLimitMessage('https://example.com/loop', 5),
    )
  })

  it('⑤ normalizes the MEASURED DSH cross-origin error with the honest wording (no fabricated cap)', () => {
    const exec = webFetchExec('https://example.com/a')
    const decision = decideWebFetchRedirectResultRewrite(
      exec,
      errorResult(
        'Error: cross-origin redirect to https://other.example is not followed automatically; '
        + 'retry against that URL directly',
      ),
      pendingMap(),
    ) as PostDecision | undefined
    expect(decision?.content?.[0]?.text).toBe(
      buildCrossOriginRedirectMessage('https://example.com/a'),
    )
    expect(decision?.content?.[0]?.text).not.toContain('(10)')
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
    const deny = await handleWebFetchPreExecute(exec, next.next, pending, fetchImpl)
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
    expect(webfetchRow().e2eScenario).toBe('webfetch-redirect-denied')
    expect(webfetchRow().status).toBe('ported')
  })
})
