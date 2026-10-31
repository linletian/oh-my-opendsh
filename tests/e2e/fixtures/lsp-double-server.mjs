#!/usr/bin/env node
// tests/e2e/fixtures/lsp-double-server.mjs — P6-T5 the HERMETIC LSP DOUBLE.
//
// Zero-dependency Node script speaking LSP 3.17 JSON-RPC over stdio with
// `Content-Length` framing — the exact framing the vendored engine's own
// client parses (patches/omo-dsh/vendor/lsp-core/src/lsp/json-rpc-connection.ts
// :65-86 drainInputBuffer + :336-346 parseContentLength, header name matched
// case-insensitively, `\r\n\r\n` separator). It is PRODUCT-TEST code committed
// under tests/ (not a one-off rig like the T1 probe's
// .omo/evidence/p6t1/mcp-client-probe/fixture/mcp-fixture-server.mjs, whose
// log/env style it copies), so every behaviour below is documented and every
// answer it gives is CANNED — this file never computes anything about the code
// it is asked about, which is precisely what makes its bytes proof: nothing in
// the engine, the MCP bridge or the model can produce them by accident.
//
// ── WHY A DOUBLE AT ALL ───────────────────────────────────────────────────────
// No real language server exists on this machine or in CI (P6-T1 measured:
// typescript-language-server and every other BUILTIN_SERVERS command is
// ABSENT), and the real install path belongs to L2 / P6-T11. Task book P6-T5:
// 「CI 用预置/替身」 — the double IS the CI path.
//
// ── HOW IT GETs SPAWNED (the server-resolution seam) ─────────────────────────
// The vendored engine resolves a server per file extension in
// patches/omo-dsh/vendor/lsp-core/src/lsp/server-resolution.ts:7-11
// (first entry of `getMergedServers()` whose `extensions` match AND whose
// command `isServerInstalled` passes). `getMergedServers()`
// (lsp/config-loader.ts:71-123) merges, in order:
//   project  ← `lspRequestContext().projectConfigPaths`
//   user     ← `lspRequestContext().userConfigPath`
//   builtin  ← BUILTIN_SERVERS (priority -100, sorted LAST,
//              config-loader.ts:100-122)
// and sorts `project < user < builtin` (config-loader.ts:112-120). ONLY the
// USER source accepts a custom id with a custom `command`
// (config-loader.ts:142-152); the PROJECT source refuses any id that is not a
// builtin and pins `builtin.command` (config-loader.ts:126-140), so a project
// config CANNOT point at a double. The user-config PATH itself is the env seam:
// request-context.ts:81 `translateHomeConfigEnv(env["LSP_TOOLS_MCP_USER_CONFIG"],
// home, ".codex/lsp-client.json")`, read from `process.env` ONCE at stdio
// server startup (mcp.ts:155 → request-context.ts:77), inside the child the
// dsh-bundled MCP client spawns with the scrubbed parent env
// (@deepseek-ai/dsh-mcp-client/lib/index.js:26-31,43 + @deepseek-ai/
// dsh-subprocess/lib/index.js:32,50-52 — the scrub drops only
// /KEY|PASSWORD|SECRET|TOKEN/i and `DSH_*`, so this name survives).
// tests/e2e/drive.mjs writes that file in the scenario's `seed` and pins the
// path through `LSP_TOOLS_MCP_USER_CONFIG`, so the engine spawns THIS double
// instead of the absent typescript-language-server.
//
// ── WIRE SURFACE ──────────────────────────────────────────────────────────────
// initialize                     → capabilities: textDocumentSync (full),
//                                  definitionProvider, diagnosticProvider. The last
//                                  one is load-bearing: the engine enables the
//                                  PULL diagnostics path only when the initialize
//                                  result carries the key (lsp/connection.ts:9-12,73
//                                  `Object.hasOwn(capabilities, "diagnosticProvider")`
//                                  → lsp/client.ts:193 `pushFallbackOnly`), so an
//                                  honest advertisement is what makes the
//                                  `textDocument/diagnostic` leg below real.
// initialized                    → logged (notification).
// workspace/didChangeConfiguration / $/cancelRequest / any other notification
//                                → logged, ignored (spec: unknown notifications are
//                                  dropped without a response).
// textDocument/didOpen           → logged, then PUBLISHES the canned diagnostic
//                                  (`textDocument/publishDiagnostics`, version-
//                                  stamped) — the push path, kept working so a
//                                  server that only pushes is still answered.
// textDocument/definition        → the CANNED LocationLink: `src/
//                                  fixture-double-marker.ts` at the line holding
//                                  LSP_DOUBLE_MARKER_SENTINEL, resolved against
//                                  THIS process's cwd (= the LSP workspace root the
//                                  engine spawned it with, lsp/transport.ts:98-101
//                                  + lsp/client-wrapper.ts:33-53 findWorkspaceRoot).
//                                  The line is DERIVED by reading that committed
//                                  file, never hand-typed; if the file is absent the
//                                  double answers -32603 rather than inventing a
//                                  location it cannot see.
// textDocument/diagnostic        → the CANNED pull report (kind "full") carrying
//                                  LSP_DOUBLE_DIAGNOSTIC_MESSAGE.
// shutdown / exit                → null result / exit 0.
//                                  THE exit BRANCH IS A DELIBERATE FIXTURE
//                                  SIMPLIFICATION (A-NIT-T5-2): the LSP spec says a
//                                  server that receives `exit` WITHOUT a preceding
//                                  successful `shutdown` must exit with code 1, and
//                                  this double exits 0 unconditionally
//                                  (:306-308, no shutdown-seen flag at all). It is
//                                  not an oversight of the spec — it is a branch this
//                                  fixture is never asked to distinguish: neither the
//                                  e2e scenarios nor
//                                  tests/omo-lsp/lsp-double-protocol.test.ts reads
//                                  the exit code of a `shutdown`-less exit (the e2e
//                                  reads the double's LOG and the tool results; the
//                                  protocol suite asserts the exit code of the `die`
//                                  mode, which is 7 by design). A fixture that
//                                  tracked shutdown state would add a mutable field
//                                  and a second exit path to assert nothing.
// every other REQUEST          → -32601 Method not found (loud, spec-correct:
//                                  an unimplemented method must never look like an
//                                  empty answer).
//
// ── ENV ────────────────────────────────────────────────────────────────────────
// LSP_DOUBLE_LOG=<path>     append EVERY received method as
//                           `<ISO> <method> pid=<pid>[ uri=…][ line=…][
//                            character=…][ version=…]`, plus `sent …` lines for
//                           every frame this double ORIGINATES. This file is the
//                           server-side evidence that the chain really spoke
//                           LSP: the e2e asserts the method sequence in it, and
//                           asserts its ABSENCE in the canary (a double that was
//                           never spawned leaves no log).
// LSP_DOUBLE_MODE=<mode>    `serve` (default) | `die`.
//                           `die` announces on stderr and exits 7 immediately —
//                           the "server cannot start" shape. NOT used by the
//                           e2e scenarios, and that is measured rather than
//                           assumed: the engine's JsonRpcConnection does not
//                           reject pending requests when the child's stdout
//                           closes (json-rpc-connection.ts:174-178 handleClose only
//                           runs the close handlers), so a startup death hangs the
//                           `initialize` request until INIT_TIMEOUT_MS
//                           (lsp/constants.ts:7 = 60_000) — a minute of hang per
//                           attempt in the gate. The shape is covered where it IS
//                           deterministic: tests/omo-lsp/lsp-double-protocol.test.ts
//                           drives the same mode through a client with a short
//                           initialize timeout.
//
// stdout discipline: ONLY JSON-RPC frames. Diagnostics go to stderr, which the
// MCP stdio transport inherits into the dsh boot log
// (@modelcontextprotocol/client/dist/stdio.mjs:76 `stderr ?? "inherit"` — the
// same channel cold-start.sh greps for `[lsp-mcp] stdio server starting`).
import process from 'node:process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Every literal this double answers with lives in lsp-double-constants.mjs —
// the SINGLE SOURCE tests/e2e/drive.mjs imports as well, so a scenario can
// never assert a marker the double no longer emits (and vice versa).
import {
  LSP_DOUBLE_DIAGNOSTIC_CODE,
  LSP_DOUBLE_DIAGNOSTIC_MESSAGE,
  LSP_DOUBLE_DIAGNOSTIC_SOURCE,
  LSP_DOUBLE_MARKER_CHARACTER,
  LSP_DOUBLE_MARKER_RELATIVE,
  LSP_DOUBLE_MARKER_SENTINEL,
  LSP_DOUBLE_SERVER_NAME,
} from './lsp-double-constants.mjs'


const mode = process.env['LSP_DOUBLE_MODE'] ?? 'serve'
const logPath = process.env['LSP_DOUBLE_LOG'] ?? ''

function stderrLine(line) {
  process.stderr.write(`[lsp-double pid=${String(process.pid)}] ${line}\n`)
}

/** Server-side evidence sink. Synchronous append so a frame that is answered
 *  immediately is never logged after the frame that followed it, and so a
 *  hard exit cannot lose the tail (T1 fixture precedent,
 *  .omo/evidence/p6t1/mcp-client-probe/fixture/mcp-fixture-server.mjs:45-53).
 *  A sink failure is LOUD on stderr and never fatal: the double must still
 *  answer the wire. */
function log(kind, detail) {
  if (logPath === '') return
  const pairs = Object.entries(detail ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`)
  const line = `${new Date().toISOString()} ${kind} pid=${String(process.pid)}${pairs.length === 0 ? '' : ` ${pairs.join(' ')}`}`
  try {
    appendFileSync(logPath, `${line}\n`)
  } catch (error) {
    stderrLine(`log sink failed (${logPath}): ${String(error instanceof Error ? error.message : error)}`)
  }
}

function writeFrame(message) {
  const body = JSON.stringify(message)
  process.stdout.write(`Content-Length: ${String(Buffer.byteLength(body, 'utf8'))}\r\n\r\n${body}`)
}

function answer(id, result) {
  writeFrame({ jsonrpc: '2.0', id, result })
}

function answerError(id, code, message) {
  writeFrame({ jsonrpc: '2.0', id, error: { code, message } })
}

function notify(method, params) {
  writeFrame({ jsonrpc: '2.0', method, params })
}

/** The canned diagnostic, built once per call so the object identity of the
 *  push and pull answers cannot accidentally become the proof. */
function cannedDiagnostic() {
  return {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    severity: 1,
    code: LSP_DOUBLE_DIAGNOSTIC_CODE,
    source: LSP_DOUBLE_DIAGNOSTIC_SOURCE,
    message: LSP_DOUBLE_DIAGNOSTIC_MESSAGE,
  }
}

/** The canned definition target: the sentinel line INSIDE the committed marker
 *  file. Absent file → -32603, because a double that reports a location it has
 *  not read is fabricating, and fabrication is the one thing this fixture must
 *  never do.
 *
 *  THE RANGE'S `end` IS DERIVED FROM THE FILE, NOT INVENTED (A-NIT-T5-1). It
 *  used to be `start + 'export const'.length` — a length copied from a token that
 *  is not on this line at all: the sentinel line is a COMMENT
 *  (`// LSP-DOUBLE-DEFINITION-TARGET-…`), so that end described a span of
 *  nothing. Only `start` is ever asserted (the e2e renders
 *  `path:line:character` from the START alone, drive.mjs
 *  `lspDoubleExpectedDefinitionText`, and the protocol suite asserts
 *  `end.character > start.character`), so `end` is decorative — but a decorative
 *  value still has to be a TRUE fact about the file, so it is now the sentinel
 *  line's real length: the range spans the whole line the marker was found on.
 *  The guard below is what keeps it true — a line shorter than `start` would be
 *  an inverted range, and a double that emits one has lost the file it claims to
 *  have read. */
function cannedDefinition() {
  const markerPath = resolve(process.cwd(), LSP_DOUBLE_MARKER_RELATIVE)
  if (!existsSync(markerPath)) {
    return { error: `marker file absent at ${markerPath}` }
  }
  const lines = readFileSync(markerPath, 'utf8').split('\n')
  const index = lines.findIndex((line) => line.includes(LSP_DOUBLE_MARKER_SENTINEL))
  if (index === -1) {
    return { error: `sentinel ${LSP_DOUBLE_MARKER_SENTINEL} absent from ${markerPath}` }
  }
  const endCharacter = (lines[index] ?? '').length
  if (endCharacter <= LSP_DOUBLE_MARKER_CHARACTER) {
    return { error: `sentinel line at ${markerPath}:${String(index)} is ${String(endCharacter)} chars, shorter than the canned start character ${String(LSP_DOUBLE_MARKER_CHARACTER)} — the canned range cannot be true of this file` }
  }
  const uri = pathToFileURL(markerPath).href
  const range = {
    start: { line: index, character: LSP_DOUBLE_MARKER_CHARACTER },
    end: { line: index, character: endCharacter },
  }
  return {
    location: {
      targetUri: uri,
      targetRange: range,
      targetSelectionRange: range,
    },
  }
}

function textDocumentUri(params) {
  const uri = params?.textDocument?.uri
  return typeof uri === 'string' ? uri : ''
}

function handleRequest(id, method, params) {
  switch (method) {
    case 'initialize': {
      answer(id, {
        capabilities: {
          textDocumentSync: 1,
          definitionProvider: true,
          diagnosticProvider: {
            interFileDependencies: false,
            workspaceDiagnostics: false,
          },
        },
        serverInfo: { name: LSP_DOUBLE_SERVER_NAME, version: '0.0.0-e2e-double' },
      })
      return
    }
    case 'textDocument/definition': {
      const resolved = cannedDefinition()
      if (resolved.error !== undefined) {
        answerError(id, -32603, `lsp-double cannot answer: ${resolved.error}`)
        return
      }
      answer(id, [resolved.location])
      return
    }
    case 'textDocument/diagnostic': {
      answer(id, { kind: 'full', items: [cannedDiagnostic()] })
      return
    }
    case 'shutdown': {
      answer(id, null)
      return
    }
    default: {
      answerError(id, -32601, `Method not found: ${method}`)
    }
  }
}

function handleNotification(method, params) {
  if (method === 'textDocument/didOpen') {
    const uri = textDocumentUri(params)
    const version = params?.textDocument?.version
    // Publish on open: the push half of the diagnostics contract, so the
    // engine's push-first resolution (lsp/client.ts:190 resolvePushDiagnostics)
    // has something version-current to take. Same canned bytes as the pull.
    notify('textDocument/publishDiagnostics', {
      uri,
      version,
      diagnostics: [cannedDiagnostic()],
    })
    log('sent textDocument/publishDiagnostics', { uri, version })
    return
  }
  if (method === 'exit') {
    process.exit(0)
  }
  // $/cancelRequest, workspace/didChangeConfiguration, initialized, textDocument/
  // didChange/didSave/didClose, and anything else: consumed, no response (JSON-RPC
  // notifications never get one) — but still LOGGED, because "the double saw it"
  // is evidence the e2e reads.
}

function main() {
  if (mode === 'die') {
    stderrLine(`mode=die: refusing to start (canary), exiting 7`)
    log('exit-immediately mode=die', { exitCode: 7 })
    process.exit(7)
  }
  stderrLine(`serving LSP on stdio (mode=${mode}, log=${logPath === '' ? '<unset>' : logPath})`)
  let buffer = Buffer.alloc(0)
  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')])
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const headers = buffer.subarray(0, headerEnd).toString('ascii')
      const match = /^content-length:\s*(\d+)/im.exec(headers)
      if (match === null) {
        stderrLine(`frame without Content-Length; dropping ${String(buffer.length)} bytes`)
        buffer = Buffer.alloc(0)
        return
      }
      const length = Number.parseInt(match[1] ?? '0', 10)
      const bodyStart = headerEnd + 4
      if (buffer.length < bodyStart + length) return
      const body = buffer.subarray(bodyStart, bodyStart + length).toString('utf8')
      buffer = buffer.subarray(bodyStart + length)
      let message
      try {
        message = JSON.parse(body)
      } catch (error) {
        answerError(null, -32700, `parse error: ${String(error instanceof Error ? error.message : error)}`)
        continue
      }
      const method = typeof message.method === 'string' ? message.method : ''
      const params = message.params
      if (message.id !== undefined && message.id !== null) {
        log(method, {
          uri: textDocumentUri(params),
          line: params?.position?.line,
          character: params?.position?.character,
        })
        handleRequest(message.id, method, params)
        continue
      }
      log(method, {
        uri: textDocumentUri(params),
        version: params?.textDocument?.version,
      })
      handleNotification(method, params)
    }
  })
  process.stdin.on('end', () => {
    process.exit(0)
  })
}

main()
