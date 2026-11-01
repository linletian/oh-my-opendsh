/**
 * P6-T8 — the web round-trip fixture's authoritative declarations.
 *
 * WHY A SEPARATE FILE, AND WHAT IT IS NOT
 * ─────────────────────────────────────────
 * `web-search-double.mjs` (the canned backend) and `drive.mjs` (the assertions)
 * both import these bytes. That is deliberate and it is a DIFFERENT coupling from
 * the one the ast-grep fixture draws, so the distinction is stated rather than
 * assumed: the ast-grep seam keeps the double's MATCHER out of the driver so a
 * byte comparison is two readers. Here there is no reader to separate — the search
 * result is CANNED, invented by the fixture, and nothing in the harness computes
 * it. What the test proves is not "two implementations agree" but "the bytes the
 * fixture emitted are the bytes that came back through provider → tool → session
 * log". That is a transport claim, and it needs one authoritative declaration of
 * what went in; a hand-copied second list in the assertions would let the whole
 * round trip pass while silently disagreeing with the fixture. One file, two
 * importers, and the comparison carries the weight.
 *
 * WHAT THIS DOES NOT PROVE
 * ────────────────────────
 * No real search backend is contacted. These bytes prove the WIRING carries
 * bytes, not that any provider returns truthful results for a query. Same boundary
 * the LSP double and the ast-grep double state about themselves.
 *
 * @module fixtures/web-search-fixture-constants
 */

/** Token riding in every URL, title and snippet this fixture emits, so a stray
 *  byte from another scenario can never satisfy an equality check by accident. */
export const WEB_FIXTURE_SENTINEL_TOKEN = 'OMO-E2E-WEB-7c4d91'

/** The query the mock agent is told to search for. Named so the provider's own
 *  request body (`Perform a web search for the query: <X>`) can be asserted to
 *  carry exactly this text rather than a paraphrase. */
export const WEB_FIXTURE_QUERY = `${WEB_FIXTURE_SENTINEL_TOKEN} quantum error correction primer`

/**
 * The canned sources, in the shape `mapAnthropicResponse` produces
 * (`{url, title?, snippet?, publishedAt?}` — dsh-web-search-deepseek/lib/index.js:70-75).
 *
 * Four entries, not one, because the mapping has three distinct optional arms
 * (title, snippet, publishedAt) and a single fully-populated row would let a
 * mapping that dropped, say, `page_age` pass unnoticed. Row by row: the first is
 * fully populated; the second carries title + snippet; the THIRD carries ONLY `url`
 * — that is the arm-boundary row, and it fails if any optional field is fabricated
 * onto a source that never had one; the FOURTH carries ONLY `page_age` (no title,
 * no snippet), which is the arm the third row cannot reach: it fails if a
 * date-bearing source loses its date or gains a snippet it was never given. This
 * matches `WEB_FIXTURE_ANSWER_TEXT`, which already says "Two of the four results".
 */
export const WEB_FIXTURE_SOURCES = [
  {
    url: `https://${WEB_FIXTURE_SENTINEL_TOKEN}.example.com/quantum-ec`,
    title: 'Quantum error correction — an introduction',
    snippet: 'Cites the surface code threshold estimate.',
    publishedAt: '2024-11-02',
  },
  {
    url: `https://${WEB_FIXTURE_SENTINEL_TOKEN}.example.com/threshold-theorem`,
    title: 'The threshold theorem, stated carefully',
    snippet: 'Cites the 1996 threshold paper and its assumptions.',
  },
  {
    // The url-only arm: no title, no snippet, no date. The renderer must invent
    // none of them.
    url: `https://${WEB_FIXTURE_SENTINEL_TOKEN}.example.com/orphan`,
  },
  {
    // FIX-T8-4, the page_age-only arm: a date and NOTHING else. This row exists to
    // pin the renderer's metadata join, which is NOT "date appended when snippet is
    // absent" — `dsh-tool-web/lib/index.js:68-71` pushes whatever meta arms exist
    // into ONE array and emits ` — ${meta.join(" ")}`, so a date without a snippet
    // still carries the em-dash separator: ` — (2024-11-05)`. The driver's own
    // derivation had it as ` (2024-11-05)` and was wrong; this row is the arm that
    // makes the difference visible instead of merely documented.
    url: `https://${WEB_FIXTURE_SENTINEL_TOKEN}.example.com/page-age-only`,
    publishedAt: '2024-11-05',
  },
]

/**
 * The `citations` the canned `text` block carries. `mapAnthropicResponse` joins
 * these to sources by url (`citationSnippets`, :40-46), so every url here must
 * match a source url exactly — and the third source deliberately has NO citation,
 * which is what makes `snippet` an arm that can be absent rather than always
 * present. The unused extra citation below is not sloppiness: a citation whose url
 * matches no source must be dropped, and that is only testable if one exists.
 */
export const WEB_FIXTURE_CITATIONS = [
  {
    url: WEB_FIXTURE_SOURCES[0].url,
    cited_text: 'Cites the surface code threshold estimate.',
  },
  {
    url: WEB_FIXTURE_SOURCES[1].url,
    cited_text: 'Cites the 1996 threshold paper and its assumptions.',
  },
  {
    url: `https://${WEB_FIXTURE_SENTINEL_TOKEN}.example.com/dangling`,
    cited_text: 'A citation whose source was never returned; must not surface.',
  },
]

/** The text block's prose. Carried so the response is a well-formed Messages
 *  reply rather than a bare tool block. */
export const WEB_FIXTURE_ANSWER_TEXT =
  `Search complete for "${WEB_FIXTURE_QUERY}". Two of the four results carry a snippet, two do not.`

/** The path the provider POSTs to, and the path the scenario's fetch leg names.
 *  Split from the port so both sides derive the same string from one place. */
export const WEB_FIXTURE_SEARCH_PATH = '/v1/messages'
export const WEB_FIXTURE_PAGE_PATH = '/page'

/**
 * The refusal fragments the fixture asserts on, taken from the provider sources
 * rather than paraphrased. Each names the ARTIFACT it was read from, per the
 * house rule that a citation must say which artifact it cites.
 *
 *   WEB_BLOCKED_URL / "resolves to a non-public IP address"
 *     → @deepseek-ai/dsh-web-fetch-http/lib/index.js:70
 *   WEB_PROVIDER_CREDENTIAL_MISSING / "has no API key for"
 *     → @deepseek-ai/dsh-web-search-deepseek/lib/index.js:204
 *   WEB_PROVIDER_ERROR / "Search endpoint configuration is separate from chat"
 *     → @deepseek-ai/dsh-web-search-deepseek/lib/index.js:230
 *
 * They live here because the double and the driver both need the same strings and
 * a transcription drift would turn a real guard into a passing test.
 */
export const WEB_FIXTURE_REFUSAL = {
  // The machine-readable codes are DELIBERATELY ABSENT (FIX-T8-6a). A previous
  // revision declared `WEB_BLOCKED_URL` / `WEB_PROVIDER_CREDENTIAL_MISSING` /
  // `WEB_PROVIDER_ERROR` here and no assertion ever read them, because the tool
  // layer renders a refusal as `Error: <message>` and the code stays on the
  // `WebError` object for programmatic routing — it is not model-visible (measured:
  // the transcript of both honesty scenarios carries prose only). Dead constants that
  // LOOK like coverage are worse than no constants, so they are gone; the codes are
  // recorded in the citations above as provenance for the prose, which is what is
  // actually asserted.
  blockedUrlText: 'resolves to a non-public IP address',
  credentialText: 'has no API key for',
  endpointText: 'Search endpoint configuration is separate from chat',
  endpointEnvText: 'DEEPSEEK_SEARCH_BASE_URL',
  endpointOwnerText: 'Only the user should choose or change the endpoint.',
}

/** The env var name the credential-missing scenario points at a NON-EXISTENT
 *  variable. Its own absence is the mechanism, so it is declared once here. */
export const WEB_FIXTURE_MISSING_KEY_ENV = 'OMO_E2E_WEB_SEARCH_NO_SUCH_KEY'

/** The credential env the harness normally supplies. Named so the scenario that
 *  bypasses it can say which name it is stepping around. */
export const WEB_FIXTURE_DEFAULT_KEY_ENV = 'DEEPSEEK_API_KEY'

/** The tool names the model surface must carry. */
export const WEB_FIXTURE_TOOL_SEARCH = 'web_search'
export const WEB_FIXTURE_TOOL_FETCH = 'web_fetch'

/** The summary the mock agent returns once BOTH legs are done — the round-trip
 *  scenario only, the one where the search really did come back with sources. */
export const WEB_FIXTURE_SUMMARY =
  'MOCK-WEB-SEARCH-FETCH-9f2b64: web_search returned four canned sources from the fixture backend and web_fetch was refused as a non-public address'

/**
 * FIX-T8-3. The two honesty scenarios must NOT close with the sentence above.
 *
 * They previously reused `WEB_FIXTURE_SUMMARY`, so a transcript whose search had
 * just been REFUSED still landed the words "web_search returned four canned sources"
 * in the session log — success prose recorded byte-for-byte in a run where nothing
 * was found, next to an `isError: true` tool row that contradicts it. That is the
 * exact shape the "不许断言搜索成功" rule forbids, and it was invisible to every
 * check because no check asserted the summary at all. Each scenario now carries a
 * summary that states its own failure, and each analysis asserts that summary is
 * the one present — so the lie is both absent from the log and caught if reintroduced.
 */
export const WEB_FIXTURE_CREDENTIAL_SUMMARY =
  'MOCK-WEB-CREDENTIAL-4a17c8: web_search was refused — DeepSeek search has no API key for the configured credential reference; no sources were returned and nothing was found'
export const WEB_FIXTURE_ENDPOINT_SUMMARY =
  'MOCK-WEB-ENDPOINT-4a17c9: web_search failed — the search endpoint is unreachable; no sources were returned and nothing was found'
