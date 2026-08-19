#!/usr/bin/env node
// tests/e2e/drive.mjs — T18 (MVP PRD §8 L2 driver; report §14.4.4-14.4.5,
// §14.5): the scenario driver. Boots a REAL dsh (web profile, real
// composition, real adapters — `dsh --profile web --patch ./cordis.yml`) in a
// hermetic mkdtemp sandbox with the T17 mock-LLM server answering both model
// routes, runs ONE scenario end-to-end over the web profile's own HTTP RPC
// surface, asserts on the session JSONL + the mock's recorded requests, and
// prints a machine-parseable verdict JSON on stdout:
//   {result:"PASS"|"FAIL", scenarios:[...]}
// (report §14.4.5 — CI parses stdout; all diagnostics go to stderr).
//
// SEMANTIC SOURCE (read-only reference; fresh implementation, no code copied):
//   oh-my-openagent/packages/omo-senpi/scripts/qa/drive.mjs:66-89 — mkdtemp
//     sandbox {project, agent, xdg, home} + env override pattern.
//   oh-my-openagent/packages/omo-senpi/scripts/qa/plan-gated-agents-e2e.mjs
//     :21,43-67 — credential digest before/after with a HOST_VOLATILE_*-style
//     allowlist for legit host churn; any byte change → overall FAIL.
// Deliberate dsh deltas: the credential surface is ~/.dsh (not ~/.senpi/agent)
// and the volatile allowlist is PATH-based (sessions/, storages/ — the host's
// own dsh writes live session JSONL + caches there continuously) because dsh's
// settings.yaml has no proven per-key churn today.
//
// ── HEADLESS-SESSION CRUX DECISION (plan T18, documented per the task brief)
// Two candidate drive paths were investigated against the installed rc.6
// (read-only) and rc.7 source:
//   (a) `dsh --profile headless "task"` — REJECTED: the headless runner
//       (dsh-headless/lib/index.js:63-99) creates an Agent directly through
//       the core registry on the agent-default-model route and NEVER consults
//       the preset roster ("This bundle composes no preset roster" —
//       deepseek-harness rc.7 packages/bundle/headless/src/index.ts:107, same
//       behavior in rc.6). There is no preset/mode CLI flag. Concerto mode is
//       unreachable headlessly.
//   (b) CHOSEN: web profile RPC — POST /api/session.create with
//       payload {cwd, agentPreset:"concerto"} (schema: dsh-host-apiproxy
//       lib/types/api/sessions.d.ts:259-267; zod sessions.schema.d.ts:55-61),
//       then POST /api/session.prompt {sessionId, mode:"queue", content:
//       [{type:"text", text}]} (sessions.d.ts:365-376; impl index.js:2822-2872
//       queue → agent.followup). Envelope {type:"client-request", rpcId,
//       method, payload} (rpc.d.ts:227-231); response {type:"server-response",
//       rpcId, result:{ok:true,value}|{ok:false,error}} (rpc.d.ts:197-201).
//       No auth token: the /api trust fence is a loopback Host-header check
//       only, "not an auth layer" (dsh-client-connection/lib/index.js:106-215).
//       Completion is observed on the SESSION JSONL on disk (turn/end with
//       reason.kind "completed") — the same artifact the assertions read, so
//       observation and assertion share one channel.
//
// ── MOCKROLE DELIVERY (T17's role marker must reach a SYSTEM message)
// Workspace instruction files (AGENTS.md) are injected as USER-role
// <system-reminder> messages (dsh-agent-instructions/README.md:17,47) —
// invisible to the mock server's system-message scan. Instead the driver
// appends `MOCKROLE=sisyphus` to the PERSONA block scalar of the MATERIALIZED
// preset ($DSH_HOME/.agent-presets/concerto/agent.cordis.yml) AFTER boot sync
// and BEFORE session.create: dsh-agent-presets reads the composition file at
// mount time (readComposition → readFile(preset.path), lib/index.js:334) and
// ensureStanding re-stamps the file on every use (:1130-1160), so the edit is
// honored. The persona IS the system prompt (T8), so the marker rides the
// real prompt-assembly path. The mock's recorded requests[] prove delivery.
//
// ── LLM WIRING (sandbox $DSH_HOME/settings.yaml only; nothing touches the
// host). Both adapters are pointed at the mock with a dummy key:
//   llm-deepseek: {apiKeyEnv: DEEPSEEK_API_KEY, baseURL: <mock>/v1}
//     — settings namespace "llm-deepseek" maps 1:1 to the adapter Config
//       (dsh-llm-deepseek/lib/index.js:629,648-664; baseURL field :651;
//       effective baseURL = config.baseURL ?? $DEEPSEEK_BASE_URL ?? default,
//       :707 — the settings value wins).
//   llm-pi-ai: providers: <exploreRoute>: {apiKeyEnv, baseURL: <mock>/v1}
//     — namespace "llm-pi-ai" (dsh-llm-pi-ai/lib/index.js:1726), per-provider
//       profile field baseURL (:1367) → pi-ai Model.baseUrl (:1262-1266,1287).
//   agent-default-model: {provider, model} — pins the concerto main agent's
//     seat to the T14 sisyphus route (the preset deliberately leaves the model
//     route to the host; settings namespace agent-default-model,
//     dsh-agent-default-model/lib/index.js:12).
//   DEEPSEEK_API_KEY=mock-e2e is set in the SPAWNED env only (credential store
//   reads inherited environment first — dsh-base/cordis.patch.yml:82-86);
//   DEEPSEEK_BASE_URL is stripped from the spawned env so a host value can
//   never silently reroute around the settings override.
//
// ── SESSION JSONL (T15 layout): $DSH_HOME/sessions/<projectKey(cwd)>/
// <encodedSessionId>/session.jsonl (dsh-session-persistence-jsonl logPath,
// lib/index.js:95-157; root wired by dsh-base/cordis.patch.yml:98-101
// `!!js dshHomePath('sessions')`). PRODUCTION DEFAULT IS ZSTD
// (DEFAULT_COMPRESSION, :733) — per T15's risk note the driver disables it via
// a second --patch overlay (the flag is repeatable, dsh/lib/bin.js:77) that
// REPLACES the persistence row config (replacement, not merge — dsh-base
// README Known Limitations) with the identical root expr + compression: none +
// packChunks: false (the T15 plaintext/unpacked layout, one event per line).
//
// ── CREDENTIAL ISOLATION (§14.5): sha256 digest of the REAL dsh home
// (~/.dsh, or $DSH_E2E_DIGEST_TARGET for the negative demo) BEFORE and AFTER
// the run; any byte change outside the volatile allowlist → overall FAIL even
// if the scenario PASSes. VOLATILE_PREFIXES = sessions/, storages/ — the
// host's own dsh writes live session JSONL and caches there on its own
// lifecycle, which cannot identify QA pollution (the OMO
// HOST_VOLATILE_SETTINGS_KEYS idea at path granularity).
//
// Usage:
//   node tests/e2e/drive.mjs               run the HELLO scenario, print verdict JSON
//   node tests/e2e/drive.mjs --self-test   run the analysis logic against
//                                          fabricated logs only (no spawn)
// Env:
//   DSH_E2E_DIGEST_TARGET  digest this dir instead of ~/.dsh (negative demo)
//   DSH_E2E_KEEP_SANDBOX=1 keep the sandbox for postmortem inspection
//   DSH_E2E_*_TIMEOUT_MS   boot / scenario / install budgets
// Exit: 0 on PASS, 1 on FAIL (and 1 if --self-test finds the analysis lying).

import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { startMockLlmServer } from './mock-llm-server.mjs'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PLUGIN_DIR = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents')
const PROFILE = 'web'
const CONCERTO_PRESET_ID = 'concerto'

// The T14 routes are the single source of truth (P-8.6 type-stripping, the
// same import scripts/prove-route-logging.mjs uses).
const { resolveModelRoutes } = await import(
  new URL('../../patches/omo-dsh/omo-agents/src/model-routes.ts', import.meta.url).href
)

const INSTALL_TIMEOUT_MS = Number(process.env.DSH_E2E_INSTALL_TIMEOUT_MS ?? 300_000)
const BOOT_TIMEOUT_MS = Number(process.env.DSH_E2E_BOOT_TIMEOUT_MS ?? 90_000)
const SCENARIO_TIMEOUT_MS = Number(process.env.DSH_E2E_SCENARIO_TIMEOUT_MS ?? 120_000)

// ── HELLO scenario constants (T18's bar: a single-step sisyphus text reply) ──
const HELLO_PROMPT = 'e2e hello: reply with the exact sentinel and nothing else'
const HELLO_REPLY = 'MOCK-HELLO-FROM-SISYPHUS-7f3d9a'
const MOCK_KEY = 'mock-e2e'
const HELLO_SCRIPT = { sisyphus: [{ type: 'text', text: HELLO_REPLY }] }

// §14.5: path-based volatile allowlist (see header). Symlinks are skipped by
// the walk (Dirent.isFile() is false for them).
const VOLATILE_PREFIXES = ['sessions/', 'storages/']

/** OMO-pattern sandbox: project / dsh home / agents home / xdg / home. */
function createSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'omo-dsh-e2e-'))
  return {
    root,
    project: join(root, 'project'),
    dshHome: join(root, 'dsh'),
    agentsHome: join(root, 'agents'),
    xdg: join(root, 'xdg'),
    home: join(root, 'home'),
  }
}

/** Spawned-process environment: every dsh/home pointer redirected into the sandbox. */
function scenarioEnv(sandbox) {
  const env = { ...process.env }
  // A host DEEPSEEK_BASE_URL could mask a broken settings override (the
  // adapter falls back to it); strip it so wiring bugs fail LOUD (the request
  // would go to api.deepseek.com with the dummy key and 401).
  delete env.DEEPSEEK_BASE_URL
  env.HOME = sandbox.home
  env.USERPROFILE = sandbox.home
  env.XDG_CONFIG_HOME = sandbox.xdg
  env.DSH_HOME = sandbox.dshHome
  env.DSH_AGENTS_HOME = sandbox.agentsHome
  env.DEEPSEEK_API_KEY = MOCK_KEY
  return env
}

/**
 * Seed the sandbox: settings.yaml wiring BOTH adapters to the mock, and the
 * persistence patch overlay (compression:none, packChunks:false — T15 layout).
 * Returns the patch overlay path (passed as a second --patch).
 */
function seedSandbox(sandbox, routes, mockBaseUrl) {
  for (const dir of [sandbox.project, sandbox.dshHome, sandbox.agentsHome, sandbox.xdg, sandbox.home]) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(
    join(sandbox.dshHome, 'settings.yaml'),
    [
      '# T18 e2e seed: both LLM adapters route to the mock server (dummy key).',
      'agent-default-model:',
      `  provider: ${routes.sisyphus.provider}`,
      `  model: ${routes.sisyphus.model}`,
      'llm-deepseek:',
      '  apiKeyEnv: DEEPSEEK_API_KEY',
      `  baseURL: ${mockBaseUrl}/v1`,
      'llm-pi-ai:',
      '  providers:',
      `    ${routes.explore.provider}:`,
      '      apiKeyEnv: DEEPSEEK_API_KEY',
      `      baseURL: ${mockBaseUrl}/v1`,
      '',
    ].join('\n'),
  )
  const patchPath = join(sandbox.root, 'e2e.patch.yml')
  writeFileSync(
    patchPath,
    [
      '# T18 e2e overlay: plaintext, unpacked session JSONL (T15 layout). Row',
      '# config is REPLACED, not merged, so root must be restated verbatim.',
      '- id: session-persistence-jsonl',
      "  name: '@deepseek-ai/dsh-session-persistence-jsonl'",
      '  config:',
      "    root: !!js dshHomePath('sessions')",
      '    compression: none',
      '    packChunks: false',
      '',
    ].join('\n'),
  )
  return patchPath
}

// ── Credential digest (§14.5) ────────────────────────────────────────────────

function collectFiles(root, rel, out) {
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const entryRel = rel.length > 0 ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      collectFiles(root, entryRel, out)
    } else if (entry.isFile()) {
      out.push(entryRel)
    }
  }
}

/**
 * sha256 over the real dsh config home, excluding the volatile subtrees.
 * Returns 'absent' when the dir does not exist (before === after === 'absent'
 * reads as untouched).
 */
export function digestConfigDir(root) {
  if (!existsSync(root)) return 'absent'
  const files = []
  collectFiles(root, '', files)
  const hash = createHash('sha256')
  for (const rel of files.sort()) {
    const normalized = rel.split(sep).join('/')
    if (VOLATILE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) continue
    hash.update(normalized)
    hash.update('\0')
    hash.update(createHash('sha256').update(readFileSync(join(root, rel))).digest('hex'))
    hash.update('\0')
  }
  return hash.digest('hex')
}

// ── Web RPC surface (crux decision (b), see header) ─────────────────────────

let rpcCounter = 0

async function rpc(port, method, payload) {
  const rpcId = `e2e-${method}-${++rpcCounter}`
  const response = await fetch(`http://127.0.0.1:${port}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`rpc ${method}: HTTP ${response.status}, non-JSON body: ${text.slice(0, 400)}`)
  }
  if (response.status !== 200) {
    throw new Error(`rpc ${method}: HTTP ${response.status}: ${text.slice(0, 400)}`)
  }
  const result = body.result
  if (result === undefined || result.ok !== true) {
    throw new Error(`rpc ${method} failed: ${JSON.stringify(result ?? body).slice(0, 400)}`)
  }
  return result.value
}

// ── dsh process management (cold-start.sh discipline) ───────────────────────

function installPlugin(sandbox) {
  const add = spawnSync('dsh', ['plugin', '--profile', PROFILE, 'add', PLUGIN_DIR], {
    cwd: REPO_ROOT,
    env: scenarioEnv(sandbox),
    encoding: 'utf8',
    timeout: INSTALL_TIMEOUT_MS,
  })
  writeFileSync(join(sandbox.root, 'plugin-add.log'), `${add.stdout ?? ''}\n${add.stderr ?? ''}`)
  if (add.status !== 0) {
    throw new Error(`dsh plugin add exited ${add.status} (see plugin-add.log in the sandbox)`)
  }
}

/** Boot dsh; resolve with {child, port, log()} once the readiness line lands. */
function bootDsh(sandbox, patchPath) {
  return new Promise((resolveBoot, rejectBoot) => {
    const child = spawn(
      'dsh',
      ['--profile', PROFILE, '--patch', './cordis.yml', '--patch', patchPath, '--port', '0'],
      { cwd: REPO_ROOT, env: scenarioEnv(sandbox) },
    )
    let log = ''
    const bootLogPath = join(sandbox.root, 'boot.log')
    const onData = (chunk) => {
      log += chunk.toString('utf8')
      writeFileSync(bootLogPath, log)
      const match = /dsh web: http:\/\/127\.0\.0\.1:(\d+)/.exec(log)
      if (match !== null) {
        resolveBoot({ child, port: Number(match[1]), log: () => log })
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('error', rejectBoot)
    child.once('exit', (code) => {
      rejectBoot(new Error(`dsh exited ${code} before readiness (boot.log in the sandbox)`))
    })
    setTimeout(() => rejectBoot(new Error(`no readiness line within ${BOOT_TIMEOUT_MS}ms`)), BOOT_TIMEOUT_MS)
  })
}

function stopDsh(child) {
  return new Promise((resolveStop) => {
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 15_000)
    child.once('exit', () => {
      clearTimeout(killTimer)
      resolveStop()
    })
    child.kill('SIGTERM')
  })
}

// ── Session JSONL observation (T15 layout) ──────────────────────────────────

function findSessionLogs(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      findSessionLogs(path, out)
    } else if (entry.name === 'session.jsonl') {
      const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0)
      if (lines.length === 0) continue
      let header
      try {
        header = JSON.parse(lines[0])
      } catch {
        continue
      }
      const events = []
      for (const line of lines.slice(1)) {
        try {
          events.push(JSON.parse(line))
        } catch {
          // a torn tail line mid-flush is observation, not corruption
        }
      }
      out.push({ path, header, events })
    }
  }
  return out
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

/** Poll the sandbox sessions dir until the session's log shows a turn/end. */
async function awaitTurnEnd(sandbox, sessionId) {
  const deadline = Date.now() + SCENARIO_TIMEOUT_MS
  let found
  while (Date.now() < deadline) {
    const logs = findSessionLogs(join(sandbox.dshHome, 'sessions'))
    found = logs.find((log) => String(log.header.id) === String(sessionId))
    if (found !== undefined) {
      const ended = found.events.some((event) => event.type === 'turn/end')
      if (ended) return found
    }
    await sleep(250)
  }
  return found // may be undefined — the analysis reports the gap honestly
}

// ── MOCKROLE delivery (see header): extend the materialized persona scalar ──

function appendMockRoleMarker(sandbox, role) {
  const compositionPath = join(
    sandbox.dshHome,
    '.agent-presets',
    CONCERTO_PRESET_ID,
    'agent.cordis.yml',
  )
  if (!existsSync(compositionPath)) {
    throw new Error(`materialized concerto preset missing at ${compositionPath} (sync did not run?)`)
  }
  const text = readFileSync(compositionPath, 'utf8')
  const needle = 'text: |-'
  if (!text.includes(needle)) {
    throw new Error('materialized concerto preset has no `text: |-` persona block scalar')
  }
  const markerLine = `      MOCKROLE=${role}\n`
  if (text.includes(`MOCKROLE=${role}`)) return // idempotent
  writeFileSync(compositionPath, text.replace(needle, `${needle}\n${markerLine}`))
}

// ── Analysis (pure — the --self-test QA targets exactly this) ────────────────

function requestHeaderRoute(events) {
  let route
  for (const event of events) {
    if (event.type === 'request/header') {
      route = {
        provider: event.data?.header?.config?.provider,
        model: event.data?.header?.config?.model,
      }
    }
  }
  return route
}

function eventText(event) {
  try {
    return JSON.stringify(event.data ?? {})
  } catch {
    return ''
  }
}

/**
 * The HELLO scenario assertions. `log` = {path, header, events} | undefined;
 * `requests` = the mock server's recorded request channel; `providersJson` =
 * the raw /api/llm.providers response text; `bootLog` = captured dsh stdout.
 */
export function analyzeHello({ log, requests, providersJson, bootLog }, routes) {
  const events = log?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const route = requestHeaderRoute(events)
  const checks = {
    pluginLoaded: bootLog.includes('[omo-agents] loaded'),
    // The probe-proven pattern (scripts/concerto-mode-probe.sh): provider and
    // active:true inside the same JSON object.
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    exploreProviderActive: new RegExp(
      `"provider":"${routes.explore.provider}"[^}]*"active":true`,
    ).test(providersJson),
    sessionLogFound: log !== undefined,
    userMessageRecorded: events.some(
      (event) => event.type === 'user/message' && eventText(event).includes(HELLO_PROMPT),
    ),
    routeHeaderMatchesSisyphus:
      route !== undefined
      && route.provider === routes.sisyphus.provider
      && route.model === routes.sisyphus.model,
    assistantReplyRecorded: events.some(
      (event) => event.type === 'assistant/message' && eventText(event).includes(HELLO_REPLY),
    ),
    turnCompleted: events.some(
      (event) =>
        event.type === 'turn/end'
        && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
    ),
    mockSawExactlyOneSisyphusCall: sisyphusRequests.length === 1,
    mockRequestOnSisyphusModel:
      sisyphusRequests.length === 1 && sisyphusRequests[0].body?.model === routes.sisyphus.model,
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks }
}

// ── --self-test: the analysis must earn its PASS (report §14.4.5) ────────────

function fabricatedGoodLog(routes) {
  return {
    path: '/fabricated/session.jsonl',
    header: { type: 'session', id: 'session-fabricated' },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: HELLO_PROMPT }] } },
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
      },
      { seq: 3, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: HELLO_REPLY }] } } },
      { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedProvidersJson(routes) {
  return JSON.stringify({
    type: 'server-response',
    rpcId: 'x',
    result: {
      ok: true,
      value: {
        providers: [
          { provider: routes.sisyphus.provider, active: true },
          { provider: routes.explore.provider, active: true },
        ],
      },
    },
  })
}

function runAnalysisSelfTest(routes) {
  const problems = []
  const good = analyzeHello(
    {
      log: fabricatedGoodLog(routes),
      requests: [{ role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 0 }],
      providersJson: fabricatedProvidersJson(routes),
      bootLog: '[omo-agents] loaded',
    },
    routes,
  )
  if (good.result !== 'PASS') {
    problems.push(`fabricated GOOD log must PASS, got FAIL on: ${good.failed.join(', ')}`)
  }
  // Each fabricated defect must be caught by its own check (no vacuous PASS).
  const defectCases = [
    ['missing turn/end', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'turn/end')
    }, 'turnCompleted'],
    ['wrong route in request/header', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { config: { provider: 'wrong', model: 'wrong' } }, reason: 'initial' } }
          : event)
    }, 'routeHeaderMatchesSisyphus'],
    ['mock never called', (input) => {
      input.requests = []
    }, 'mockSawExactlyOneSisyphusCall'],
    ['no session log', (input) => {
      input.log = undefined
    }, 'sessionLogFound'],
  ]
  for (const [label, mutate, expectedCheck] of defectCases) {
    const input = {
      log: fabricatedGoodLog(routes),
      requests: [{ role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 0 }],
      providersJson: fabricatedProvidersJson(routes),
      bootLog: '[omo-agents] loaded',
    }
    mutate(input)
    const verdict = analyzeHello(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }
  return problems
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const routes = resolveModelRoutes()
  // §14.4.5: analysis QA runs BEFORE the expensive spawn.
  const selfTestProblems = runAnalysisSelfTest(routes)
  if (selfTestProblems.length > 0) {
    console.log(JSON.stringify({ result: 'FAIL', reason: `analysis self-test: ${selfTestProblems.join('; ')}`, scenarios: [] }))
    process.exit(1)
  }

  const digestTarget = process.env.DSH_E2E_DIGEST_TARGET ?? join(homedir(), '.dsh')
  const beforeDigest = digestConfigDir(digestTarget)
  console.error(`drive: digest target ${digestTarget} (before: ${beforeDigest.slice(0, 16)}…)`)
  console.error(`drive: routes sisyphus=${routes.sisyphus.provider}/${routes.sisyphus.model} explore=${routes.explore.provider}/${routes.explore.model}`)

  const server = await startMockLlmServer({ script: HELLO_SCRIPT })
  const sandbox = createSandbox()
  let child
  let scenario = { name: 'hello', result: 'FAIL', failed: ['driver did not complete'] }
  let logPath
  try {
    const patchPath = seedSandbox(sandbox, routes, server.baseUrl)
    console.error(`drive: sandbox ${sandbox.root}`)
    console.error('drive: stage 0 — dsh plugin add into the sandbox profile')
    installPlugin(sandbox)

    console.error('drive: booting dsh --profile web --patch ./cordis.yml --patch <e2e> --port 0')
    const boot = await bootDsh(sandbox, patchPath)
    child = boot.child
    console.error(`drive: web ready on 127.0.0.1:${boot.port}`)

    // The plugin sync materializes the concerto preset at boot; then the
    // MOCKROLE marker rides the persona into the system prompt (see header).
    appendMockRoleMarker(sandbox, 'sisyphus')

    // Wiring proof for BOTH adapters (explore is registered but uncalled in HELLO).
    const providers = await rpc(boot.port, 'llm.providers', {})
    const providersJson = JSON.stringify(providers)

    const created = await rpc(boot.port, 'session.create', {
      cwd: sandbox.project,
      agentPreset: CONCERTO_PRESET_ID,
    })
    console.error(`drive: session created ${created.sessionId} (preset ${created.agentPreset ?? '?'})`)
    await rpc(boot.port, 'session.prompt', {
      sessionId: created.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: HELLO_PROMPT }],
    })
    console.error('drive: prompt accepted; awaiting turn/end on the session JSONL')
    const log = await awaitTurnEnd(sandbox, created.sessionId)
    logPath = log?.path

    await stopDsh(child)
    child = undefined
    // SIGTERM flushes the write-behind batcher; re-read the final bytes.
    const finalLog = findSessionLogs(join(sandbox.dshHome, 'sessions')).find(
      (candidate) => String(candidate.header.id) === String(created.sessionId),
    )

    const analysis = analyzeHello(
      {
        log: finalLog ?? log,
        requests: server.requests,
        providersJson,
        bootLog: boot.log(),
      },
      routes,
    )
    scenario = { name: 'hello', sessionId: created.sessionId, logPath, ...analysis }
  } catch (error) {
    scenario = { name: 'hello', result: 'FAIL', failed: [`driver error: ${error.message}`] }
  } finally {
    if (child !== undefined) await stopDsh(child)
    await server.close()
  }

  const afterDigest = digestConfigDir(digestTarget)
  const realDshUntouched = beforeDigest === afterDigest
  const scenarioPass = scenario.result === 'PASS'
  const result = scenarioPass && realDshUntouched ? 'PASS' : 'FAIL'

  if (existsSync(sandbox.root) && process.env.DSH_E2E_KEEP_SANDBOX !== '1' && result === 'PASS') {
    rmSync(sandbox.root, { recursive: true, force: true })
  } else {
    console.error(`drive: sandbox kept at ${sandbox.root}`)
  }

  console.log(
    JSON.stringify({
      result,
      scenarios: [scenario],
      realDshUntouched,
      digestTarget,
      mockRequests: server.requests.length,
    }),
  )
  process.exit(result === 'PASS' ? 0 : 1)
}

// Importing this module (for digestConfigDir/analyzeHello) must never spawn
// (OMO drive.mjs:241-248's guard).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--self-test')) {
    const routes = resolveModelRoutes()
    const problems = runAnalysisSelfTest(routes)
    if (problems.length > 0) {
      console.error(`SELF-TEST FAIL: ${problems.join('; ')}`)
      process.exit(1)
    }
    console.log('SELF-TEST OK: fabricated good log PASSes; fabricated defects (missing turn/end, wrong route, mock-never-called, no session log) each FAIL on their own check')
  } else {
    main().catch((error) => {
      console.log(JSON.stringify({ result: 'FAIL', reason: `driver crash: ${error.message}`, scenarios: [] }))
      process.exit(1)
    })
  }
}
