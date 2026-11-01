/**
 * P6-T8 — the hermetic backend for `web_search`.
 *
 * WHAT THIS IS
 * ────────────
 * A canned Anthropic Messages endpoint. The DeepSeek search provider POSTs
 * `<baseURL>/messages` (`@deepseek-ai/dsh-web-search-deepseek/lib/index.js:105`,
 * `:132-144`) and maps the reply through `mapAnthropicResponse` (`:59-81`). This
 * fixture answers that contract with bytes from `web-search-fixture-constants.mjs`,
 * so a scenario can prove that the chain
 *
 *     agent → web_search tool → ctx.web.search → deepseek provider → THIS server
 *       → mapped sources → tool result → session log
 *
 * really carries bytes end to end, without touching a network or an API key. It is
 * the same philosophy as `lsp-double-server.mjs` and `ast-grep-fake-sg.mjs`: a
 * canned answer proves the WIRING, and says plainly that it proves nothing else.
 *
 * WHAT IT DELIBERATELY DOES NOT PROVE
 * ─────────────────────────────────────
 * It is not a search engine. It returns the same bytes for any query, so it cannot
 * show that any provider answers a question correctly, ranks anything, or is honest
 * about what it found. A scenario that asserted "the search succeeded" would be
 * asserting that this file talked to itself; the task book's "不许断言搜索成功" is
 * the same boundary stated from the other side.
 *
 * WHY IT CAN BE REACHED AT ALL
 * ──────────────────────────────
 * The provider's own fetch is bare `fetch(endpoint, …)` with no dispatcher and no
 * address pin (`:132`), so loopback is reachable — unlike `web_fetch`, which pins
 * addresses and refuses non-public ones. That asymmetry is the whole reason a
 * hermetic search backend is possible while a hermetic successful fetch is not.
 *
 * Note on the proxy: this process's global dispatcher MAY be a proxy — dsh installs
 * one from the environment during boot (`profile-boot-*.js:6`, called at `:225`),
 * and this host has one live. The scenario that reaches this server therefore pins
 * `no_proxy`/`NO_PROXY` to cover loopback explicitly, following the precedent at
 * `drive.mjs` `ast-grep-sg-absent-named-failure`'s env block, rather than relying
 * on a host that happens to exempt loopback already.
 *
 * @module fixtures/web-search-double
 */

import { createServer } from 'node:http'

import {
  WEB_FIXTURE_ANSWER_TEXT,
  WEB_FIXTURE_CITATIONS,
  WEB_FIXTURE_SEARCH_PATH,
  WEB_FIXTURE_SENTINEL_TOKEN,
  WEB_FIXTURE_SOURCES,
} from './web-search-fixture-constants.mjs'

/** The path this double answers. Anything else is a named 404 — a silent 404 would
 *  let a mistyped baseURL look like a working backend that returned nothing. */
// FIX-T8-R4-8. Plain, not exported. `grep -r WEB_SEARCH_DOUBLE_PATH` across the
// repo returns hits ONLY inside this file (its own definition and the 404 branch
// below); the driver addresses the fixture through `startWebSearchDouble().searchUrl`
// and `WEB_FIXTURE_SEARCH_PATH` from the constants module, never this alias. The
// alias therefore had no consumer outside the file that defines it, and an export
// with no importer is a surface, not a convenience.
const WEB_SEARCH_DOUBLE_PATH = WEB_FIXTURE_SEARCH_PATH

/**
 * The canned Messages reply, assembled from the fixture sources.
 *
 * `page_age` is spelled the way the WIRE spells it and `publishedAt` the way the
 * MAPPED result spells it (`:74`); the two are deliberately not the same name, and
 * deriving one from the other here is what keeps a rename from drifting the fixture
 * away from the assertions without anyone noticing.
 *
 * The dangling citation is passed through on purpose. `citationSnippets` keys it by
 * url and `mapAnthropicResponse` only ever looks a url up for a source it actually
 * got, so the dangling entry must vanish from the output — which is only observable
 * if something dangles.
 */
/**
 * The body of the named-404 branch, hoisted so the hermetic self-test leg can assert
 * the EXACT sentence rather than merely "some 404 came back". A 404 with a generic
 * body would still satisfy `status === 404` while telling a caller nothing about
 * which path the fixture serves, and the whole point of the branch is that a request
 * aimed at the wrong path is refused BY NAME instead of being answered with canned
 * search bytes — which would silently turn a mispathed test into a passing one.
 *
 * @param path - the pathname that was asked for.
 * @returns the refusal sentence carried in the 404 body.
 */
export function webSearchDoubleNotFoundMessage(path) {
  return `web-search-double: only ${WEB_SEARCH_DOUBLE_PATH} is served; asked for ${path}`
}

// FIX-T8-R4-8. Plain, not exported — same evidence as the alias above: zero hits
// outside this file. The canned bytes reach the scenario over HTTP, which is the
// point of a double; nothing imports them, and the round-trip assertions compare the
// TRANSCRIPT against the constants module, never against this function directly.
function cannedMessagesResponse() {
  return {
    id: `msg_${WEB_FIXTURE_SENTINEL_TOKEN}`,
    type: 'message',
    role: 'assistant',
    model: 'deepseek-v4-pro',
    content: [
      {
        type: 'web_search_tool_result',
        tool_use_id: 'srv_web_search_0',
        content: WEB_FIXTURE_SOURCES.map((source) => ({
          type: 'web_search_result',
          url: source.url,
          ...source.title === undefined ? {} : { title: source.title },
          ...source.publishedAt === undefined ? {} : { page_age: source.publishedAt },
        })),
      },
      {
        type: 'text',
        text: WEB_FIXTURE_ANSWER_TEXT,
        citations: WEB_FIXTURE_CITATIONS.map((citation) => ({
          type: 'web_search_result_location',
          url: citation.url,
          cited_text: citation.cited_text,
        })),
      },
    ],
    stop_reason: 'end_turn',
  }
}

/**
 * Start the double on an ephemeral loopback port.
 *
 * `requests` records one entry per request, carrying the fields the scenario asserts
 * on — `method` and `path`, `toolTypes` (the tool descriptors the provider sent),
 * `maxUses`, and `userText` with the `query` extracted from it. It records the FIELDS rather than the raw
 * body so an assertion names what it means ("the body carried
 * `web_search_20250305`") instead of grepping a blob for a substring that could
 * appear by accident somewhere else in the document.
 *
 * @returns {Promise<{port: number, baseUrl: string, searchUrl: string,
 *   requests: Array<object>, close: () => Promise<void>}>}
 */
export async function startWebSearchDouble() {
  const requests = []
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let parsed = null
      try {
        parsed = JSON.parse(raw)
      } catch {
        // Left null: the recorder stores what it could not parse as text rather
        // than throwing, because a malformed body is evidence the scenario wants to
        // see, not a reason the fixture should die.
      }
      const userText = (parsed?.messages ?? [])
        .filter((message) => message?.role === 'user')
        .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
      requests.push({
        method: request.method ?? '',
        path,
        toolTypes: (parsed?.tools ?? []).map((tool) => tool?.type ?? ''),
        // FIX-T8-R4-3. `toolNames`, `model` and `byteLength` used to be recorded
        // here and read by nobody — the same shape of dead weight as the vacuous
        // `.filter(() => true)` this file already shed: a field that LOOKS like
        // coverage while asserting nothing. `toolNames` in particular duplicated a
        // name the driver already reads off the mock LLM's own request bodies, so
        // it was unread twice over. Every field that remains has a named reader:
        // method/path -> doubleSawTheSearchPost + searchNeverReachedTheFetchFixture
        // Directly, toolTypes -> doubleRequestCarriesSearchToolDescriptor, maxUses ->
        // maxUsesCarriesTheDocumentedDefault, userText -> the query derivation below,
        // query -> doubleRequestCarriesQueryVerbatim.
        // `maxUses` is recorded because it IS asserted (`maxUsesCarriesTheDocumented
        // Default` in the round-trip analysis): the provider sends `max_uses` off a
        // config default of 5 (`dsh-web-search-deepseek/lib/index.js:283` → `:121`),
        // and a drift in that default changes what the model may spend per search, so
        // it is worth pinning. (history: `maxUses` WAS recorded with no reader until
        // the round-trip analysis pinned it — the same dead-weight shape the three
        // fields above had, and the reason this file now lists a reader beside every
        // field it keeps.)
        maxUses: (parsed?.tools ?? [])[0]?.max_uses ?? null,
        userText,
        query: userText.startsWith('Perform a web search for the query: ')
          ? userText.slice('Perform a web search for the query: '.length)
          : null,
      })

      if (path !== WEB_SEARCH_DOUBLE_PATH) {
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: webSearchDoubleNotFoundMessage(path) }))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(cannedMessagesResponse()))
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`
  return {
    port,
    baseUrl,
    searchUrl: `${baseUrl}${WEB_SEARCH_DOUBLE_PATH}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
