// tests/omo-lsp/lsp-double-protocol.test.ts — P6-T5 the protocol-level pin of
// the HERMETIC LSP double (tests/e2e/fixtures/lsp-double-server.mjs).
//
// WHY THIS FILE EXISTS. Two claims in this repo pointed here and nothing was
// behind them. lsp-double-server.mjs:102-105 says the `die` mode 「is covered
// where it IS deterministic: tests/omo-lsp/lsp-double-protocol.test.ts drives the
// same mode through a client with a short initialize timeout」 — and that file did
// not exist, so the one mode the e2e deliberately refuses to run was covered by
// nothing at all. This file is that coverage, and it is the only place the
// double's own wire contract is pinned: gate 3's two lsp-* scenarios exercise the
// double THROUGH the vendored engine, which answers only what it needs to answer,
// so -32601, -32700, the -32603 no-marker branch and the exit-7 startup death are
// all invisible there — the engine either never sends them or swallows them.
//
// WHY THE `die` MODE IS HERE AND NOT IN THE e2e (the discipline, restated from
// lsp-double-server.mjs:108-121 so the reason travels with the test): the engine's
// JsonRpcConnection does NOT reject pending requests when the child's stdout
// closes (patches/omo-dsh/vendor/lsp-core/src/lsp/json-rpc-connection.ts:174-178
// handleClose runs the close handlers only), so a child that dies at startup hangs
// the `initialize` request until INIT_TIMEOUT_MS (lsp/constants.ts:7 = 60_000) —
// a minute of dead gate per attempt. Against THIS client, whose frame timeout is
// FRAME_TIMEOUT_MS below, the same mode is deterministic and costs milliseconds.
//
// WHY A HAND-WRITTEN FRAME CLIENT. The double speaks the framing the vendored
// client parses (json-rpc-connection.ts:184-199 drainInputBuffer + :336-346
// parseContentLength, header matched case-insensitively, `\r\n\r\n` separator).
// Importing the vendored client here would route every leg through engine code
// under test — the double would be graded by a defendant. A ~60-line reader of
// Content-Length frames has nothing to disagree about.
//
// NO HAND-COPIED LITERALS. Every expectation comes from
// tests/e2e/fixtures/lsp-double-constants.mjs (the single source the double
// itself imports), and the canned definition LINE is derived by reading the
// committed marker file for its sentinel — the third reader of that file, after
// the double's cannedDefinition and tests/e2e/drive.mjs. A number typed here
// would move with nobody and make a broken double look green.
//
// TIMEOUTS. FRAME_TIMEOUT_MS (5s) is the tight one: a double that stops answering
// fails in five seconds, not at vitest's default. The per-test ceiling is looser
// ONLY to absorb spawn jitter on a loaded box — it cannot mask a hang, because the
// frame timeout fires first and rejects with the method it was waiting on.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import {
  LSP_DOUBLE_DIAGNOSTIC_CODE,
  LSP_DOUBLE_DIAGNOSTIC_MESSAGE,
  LSP_DOUBLE_DIAGNOSTIC_SOURCE,
  LSP_DOUBLE_MARKER_CHARACTER,
  LSP_DOUBLE_MARKER_RELATIVE,
  LSP_DOUBLE_MARKER_SENTINEL,
  LSP_DOUBLE_SERVER_NAME,
} from '../e2e/fixtures/lsp-double-constants.mjs'

/** Anchored to this file, never to process.cwd() — vitest runs from the repo
 *  root today, and a suite that only passes from one directory is a suite that
 *  stops passing the day the runner changes it. */
const REPO_ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SERVER_PATH = join(REPO_ROOT_DIR, 'tests', 'e2e', 'fixtures', 'lsp-double-server.mjs')
const FIXTURE_PROJECT_DIR = join(REPO_ROOT_DIR, 'tests', 'e2e', 'fixtures', 'lsp-double-project')
const APP_PATH = join(FIXTURE_PROJECT_DIR, 'src', 'app.ts')
const MARKER_PATH = resolve(FIXTURE_PROJECT_DIR, LSP_DOUBLE_MARKER_RELATIVE)
/** Input URIs go through the SAME builder the double uses for its answer
 *  (pathToFileURL, lsp-double-server.mjs:199), so no hand-concatenated
 *  `file://` prefix can drift on a path with a character that needs escaping. */
const uriOf = (path: string): string => pathToFileURL(path).href

const FRAME_TIMEOUT_MS = 5_000
/** The window granted to a child the suite has ALREADY seen exit (leg ⑨). */
const DEAD_CHILD_TIMEOUT_MS = 500
/** The vitest ceiling: looser than the frame timeout on purpose (see header). */
const TEST_TIMEOUT_MS = 20_000

type Frame = {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string }
}

/** Scratch home for every LSP_DOUBLE_LOG this suite produces, so the
 *  server-side evidence lands somewhere the suite owns and cleans up — never in
 *  the repo tree, and never in a path another test could write into. */
const SCRATCH_DIR = mkdtempSync(join(tmpdir(), 'omo-lsp-protocol-'))
const spawned: ChildProcessWithoutNullStreams[] = []

/** One spawned double, with a Content-Length-framed client in this process. */
function startDouble(options: { cwd?: string; mode?: string; label: string }): {
  child: ChildProcessWithoutNullStreams
  stderrText: () => string
  request: (method: string, params?: unknown, timeoutMs?: number) => Promise<Frame>
  notify: (method: string, params?: unknown) => void
  sendRaw: (text: string) => void
  nextFrame: () => Promise<Frame>
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
} {
  const logPath = join(SCRATCH_DIR, `${options.label}.log`)
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: options.cwd ?? FIXTURE_PROJECT_DIR,
    env: { ...process.env, LSP_DOUBLE_LOG: logPath, ...(options.mode ? { LSP_DOUBLE_MODE: options.mode } : {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  // A child that dies while we still hold its stdin must not turn an EPIPE into
  // an unhandled stream error — the assertion below wants the exit code, not a
  // crash report from the harness.
  child.stdin.on('error', () => undefined)
  let stderrText = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderrText += chunk
  })
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => {
    child.on('exit', (code, signal) => done({ code, signal }))
  })

  const pending = new Map<string, (frame: Frame) => void>()
  const unmatched: Frame[] = []
  const frameWaiters: ((frame: Frame) => void)[] = []
  let buffer = Buffer.alloc(0)

  child.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const headers = buffer.subarray(0, headerEnd).toString('ascii')
      const match = /^content-length:\s*(\d+)/im.exec(headers)
      if (match === null) {
        throw new Error(`the double sent a frame with no Content-Length header: ${headers}`)
      }
      const length = Number.parseInt(match[1] ?? '0', 10)
      const bodyStart = headerEnd + 4
      if (buffer.length < bodyStart + length) return
      const body = buffer.subarray(bodyStart, bodyStart + length).toString('utf8')
      buffer = buffer.subarray(bodyStart + length)
      const frame = JSON.parse(body) as Frame
      const key = frame.id === undefined || frame.id === null ? '' : String(frame.id)
      const resolveFrame = key === '' ? undefined : pending.get(key)
      if (resolveFrame !== undefined) {
        pending.delete(key)
        resolveFrame(frame)
        continue
      }
      // Notifications, and the -32700 whose id is null by spec: both are frames
      // nobody is waiting on BY id, so they queue for nextFrame().
      const wake = frameWaiters.shift()
      if (wake === undefined) unmatched.push(frame)
      else wake(frame)
    }
  })

  /** ONE encoder for every outgoing frame: the byte length and the body come
   *  from the same `JSON.stringify` call, so a re-stringify that produced
   *  different bytes (key order is stable today, and is not a promise) cannot
   *  desynchronise the framing this client is here to test. */
  const sendRaw = (text: string): void => {
    child.stdin.write(text)
  }
  const sendFrame = (message: Record<string, unknown>): void => {
    const body = JSON.stringify(message)
    sendRaw(`Content-Length: ${String(Buffer.byteLength(body, 'utf8'))}\r\n\r\n${body}`)
  }

  let nextId = 1
  const request = (method: string, params?: unknown, timeoutMs = FRAME_TIMEOUT_MS): Promise<Frame> => {
    const id = nextId
    nextId += 1
    return new Promise<Frame>((done, reject) => {
      const timer = setTimeout(() => {
        pending.delete(String(id))
        reject(new Error(`the double never answered ${method} within ${String(timeoutMs)}ms`))
      }, timeoutMs)
      pending.set(String(id), (frame) => {
        clearTimeout(timer)
        done(frame)
      })
      sendFrame({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })
    })
  }

  const notify = (method: string, params?: unknown): void => {
    sendFrame({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) })
  }

  const nextFrame = (): Promise<Frame> =>
    new Promise<Frame>((done, reject) => {
      const queued = unmatched.shift()
      if (queued !== undefined) {
        done(queued)
        return
      }
      const timer = setTimeout(() => {
        reject(new Error(`the double sent no further frame within ${String(FRAME_TIMEOUT_MS)}ms`))
      }, FRAME_TIMEOUT_MS)
      frameWaiters.push((frame) => {
        clearTimeout(timer)
        done(frame)
      })
    })

  spawned.push(child)
  return { child, stderrText: () => stderrText, request, notify, sendRaw, nextFrame, exited }
}

/** The canned definition line, DERIVED from the committed marker file — the same
 *  read the double performs (lsp-double-server.mjs cannedDefinition) and the same
 *  read tests/e2e/drive.mjs performs, run a third time here so a reader that
 *  silently matched nothing fails this suite rather than the boot. */
function deriveSentinelLine(): number {
  const lines = readFileSync(MARKER_PATH, 'utf8').split('\n')
  const index = lines.findIndex((line) => line.includes(LSP_DOUBLE_MARKER_SENTINEL))
  expect(index, `sentinel ${LSP_DOUBLE_MARKER_SENTINEL} absent from ${MARKER_PATH}`).toBeGreaterThanOrEqual(0)
  return index
}

/** The canned diagnostic body, as the constants module names it. */
function expectCannedDiagnostic(item: Record<string, unknown>, where: string): void {
  expect(item['message'], where).toBe(LSP_DOUBLE_DIAGNOSTIC_MESSAGE)
  expect(item['source'], where).toBe(LSP_DOUBLE_DIAGNOSTIC_SOURCE)
  expect(item['code'], where).toBe(LSP_DOUBLE_DIAGNOSTIC_CODE)
}

afterEach(() => {
  for (const child of spawned) {
    child.kill('SIGKILL')
  }
  spawned.length = 0
})

afterAll(() => {
  rmSync(SCRATCH_DIR, { recursive: true, force: true })
})

describe('P6-T5 the LSP double answers its own wire contract (hand-framed client)', () => {
  it('① initialize advertises the three load-bearing capabilities and its own name', async () => {
    const double = startDouble({ label: 'initialize' })
    const reply = await double.request('initialize', {
      processId: process.pid,
      capabilities: {},
      clientInfo: { name: 'omo-lsp-protocol-pin', version: '0' },
      workspaceFolders: [{ uri: uriOf(FIXTURE_PROJECT_DIR), name: 'fixture' }],
    })
    const capabilities = (reply.result as { capabilities: Record<string, unknown> }).capabilities
    // diagnosticProvider is the load-bearing one: the engine only enables the
    // pull path when the key is present (lsp/connection.ts:9-12,73
    // Object.hasOwn(capabilities, "diagnosticProvider")), so leg ④ below is a
    // real pull only because of this advertisement.
    expect(Object.hasOwn(capabilities, 'diagnosticProvider'), 'diagnosticProvider must be advertised').toBe(true)
    expect(capabilities['textDocumentSync']).toBe(1)
    expect(capabilities['definitionProvider']).toBe(true)
    expect((capabilities['diagnosticProvider'] as Record<string, unknown>)['workspaceDiagnostics']).toBe(false)
    expect((reply.result as { serverInfo: { name: string } }).serverInfo.name).toBe(LSP_DOUBLE_SERVER_NAME)
    double.notify('exit')
    expect((await double.exited).code).toBe(0)
  }, TEST_TIMEOUT_MS)

  it('② textDocument/definition answers the canned LocationLink at the DERIVED sentinel line', async () => {
    const double = startDouble({ label: 'definition' })
    await double.request('initialize', { capabilities: {}, clientInfo: { name: 'pin', version: '0' } })
    const reply = await double.request('textDocument/definition', {
      textDocument: { uri: uriOf(APP_PATH) },
      position: { line: 0, character: 0 },
    })
    type LocationLink = {
      targetUri: string
      targetRange: { start: { line: number; character: number }; end: { line: number; character: number } }
      targetSelectionRange: { start: { line: number; character: number }; end: { line: number; character: number } }
    }
    const links = reply.result as LocationLink[]
    expect(Array.isArray(links)).toBe(true)
    expect(links).toHaveLength(1)
    const link = links[0] as LocationLink
    // Same URIs the double builds (pathToFileURL, lsp-double-server.mjs:199),
    // not a hand-concatenated `file://` that would drift on an odd path.
    expect(link.targetUri).toBe(uriOf(MARKER_PATH))
    // The line is read out of the marker file, never typed: if the sentinel
    // moves, this assertion moves with it, and a double answering a stale line
    // fails HERE.
    expect(link.targetRange.start.line).toBe(deriveSentinelLine())
    expect(link.targetRange.start.character).toBe(LSP_DOUBLE_MARKER_CHARACTER)
    // The end is asserted as an ORDER, not as a copied number: the double derives
    // it from the sentinel line's REAL length in its own file (cannedDefinition —
    // it used to be `start + 'export const'.length`, a token that is not even on
    // that line), and restating any such expression here would couple the two
    // halves of one magic number instead of checking the contract the range has to
    // satisfy: same line, end strictly after start.
    expect(link.targetRange.end.line).toBe(link.targetRange.start.line)
    expect(link.targetRange.end.character).toBeGreaterThan(link.targetRange.start.character)
    double.notify('exit')
  }, TEST_TIMEOUT_MS)

  it('③ textDocument/didOpen PUSHES the canned diagnostic (publishDiagnostics)', async () => {
    const double = startDouble({ label: 'did-open' })
    await double.request('initialize', { capabilities: {}, clientInfo: { name: 'pin', version: '0' } })
    const uri = uriOf(APP_PATH)
    double.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'typescript', version: 1, text: '' } })
    const pushed = await double.nextFrame()
    expect(pushed.method).toBe('textDocument/publishDiagnostics')
    const params = pushed.params as { uri: string; version: number; diagnostics: Record<string, unknown>[] }
    expect(params.uri).toBe(uri)
    expect(params.version).toBe(1)
    expect(params.diagnostics).toHaveLength(1)
    expectCannedDiagnostic(params.diagnostics[0] as Record<string, unknown>, 'the pushed diagnostic')
    double.notify('exit')
  }, TEST_TIMEOUT_MS)

  it('④ textDocument/diagnostic PULLS a kind:"full" report carrying the same bytes', async () => {
    const double = startDouble({ label: 'pull' })
    await double.request('initialize', { capabilities: {}, clientInfo: { name: 'pin', version: '0' } })
    const reply = await double.request('textDocument/diagnostic', {
      textDocument: { uri: uriOf(APP_PATH) },
    })
    const report = reply.result as { kind: string; items: Record<string, unknown>[] }
    expect(report.kind).toBe('full')
    expect(report.items).toHaveLength(1)
    expectCannedDiagnostic(report.items[0] as Record<string, unknown>, 'the pulled diagnostic')
    double.notify('exit')
  }, TEST_TIMEOUT_MS)

  it('⑤ an unimplemented REQUEST answers -32601, never an empty result', async () => {
    const double = startDouble({ label: 'method-not-found' })
    const reply = await double.request('textDocument/completion', {
      textDocument: { uri: uriOf(APP_PATH) },
      position: { line: 0, character: 0 },
    })
    expect(reply.error?.code).toBe(-32601)
    expect(reply).not.toHaveProperty('result')
    double.notify('exit')
  }, TEST_TIMEOUT_MS)

  it('⑥ a garbage frame answers -32700 with id null (the parse error is loud)', async () => {
    const double = startDouble({ label: 'parse-error' })
    // Framed correctly, body NOT JSON: the only way to reach the double's
    // JSON.parse branch instead of its header branch.
    double.sendRaw('Content-Length: 12\r\n\r\n{not json!!!')
    const frame = await double.nextFrame()
    expect(frame.error?.code).toBe(-32700)
    expect(frame.id).toBeNull()
    double.notify('exit')
  }, TEST_TIMEOUT_MS)

  it('⑦ the server-side log names every method the client sent (the chain really spoke)', async () => {
    const double = startDouble({ label: 'evidence' })
    await double.request('initialize', { capabilities: {}, clientInfo: { name: 'pin', version: '0' } })
    double.notify('initialized')
    double.notify('textDocument/didOpen', { textDocument: { uri: uriOf(APP_PATH), languageId: 'typescript', version: 1, text: '' } })
    await double.nextFrame()
    await double.request('textDocument/definition', {
      textDocument: { uri: uriOf(APP_PATH) },
      position: { line: 0, character: 0 },
    })
    const log = readFileSync(join(SCRATCH_DIR, 'evidence.log'), 'utf8')
    for (const method of ['initialize', 'initialized', 'textDocument/didOpen', 'textDocument/definition']) {
      expect(log, `the double's own log never recorded ${method}`).toContain(`${method} pid=`)
    }
    double.notify('exit')
  }, TEST_TIMEOUT_MS)

  it('⑧ a workspace WITHOUT the marker file gets -32603, not a fabricated location', async () => {
    // cwd is the seam: cannedDefinition resolves the marker against process.cwd()
    // (lsp/transport.ts:98-101 + client-wrapper.ts:33-53 findWorkspaceRoot), so a
    // scratch cwd is exactly the "the double cannot see what it is being asked
    // about" shape. A fixture that invents a location is the one failure this
    // fixture must never allow.
    const emptyCwd = mkdtempSync(join(SCRATCH_DIR, 'no-marker-'))
    const double = startDouble({ label: 'no-marker', cwd: emptyCwd })
    await double.request('initialize', { capabilities: {}, clientInfo: { name: 'pin', version: '0' } })
    const reply = await double.request('textDocument/definition', {
      textDocument: { uri: uriOf(join(emptyCwd, 'anything.ts')) },
      position: { line: 0, character: 0 },
    })
    expect(reply.error?.code).toBe(-32603)
    expect(reply.error?.message).toContain(LSP_DOUBLE_MARKER_RELATIVE)
    expect(reply).not.toHaveProperty('result')
    double.notify('exit')
  }, TEST_TIMEOUT_MS)

  it('⑨ LSP_DOUBLE_MODE=die exits 7 and names itself on stderr — the leg the e2e cannot run', async () => {
    // See the header: through the real engine this hangs INIT_TIMEOUT_MS (60s)
    // because handleClose does not reject pending requests. Here it is a spawn,
    // an exit code and two stderr tokens, deterministically.
    const double = startDouble({ label: 'die', mode: 'die' })
    const exit = await double.exited
    expect(exit.code).toBe(7)
    // Named, not re-typed: `mode=die` is the mode token and the exit code is the
    // announcement's own number. The sentence around them belongs to the double.
    const stderr = double.stderrText()
    expect(stderr).toContain('mode=die')
    expect(stderr).toMatch(/exit(?:ing)? 7/)
    // And a child that died at startup answers nothing: the frame timeout is what
    // turns "silently dead" into a red test instead of a green empty pass. Short
    // on purpose — the child is already reaped by the `exited` await above, so
    // waiting the full FRAME_TIMEOUT_MS here would buy no extra proof and cost
    // five seconds of gate time every run.
    await expect(double.request('initialize', { capabilities: {} }, DEAD_CHILD_TIMEOUT_MS))
      .rejects.toThrow(/never answered initialize/)
  }, TEST_TIMEOUT_MS)
})
