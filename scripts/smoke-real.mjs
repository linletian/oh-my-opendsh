#!/usr/bin/env node
// scripts/smoke-real.mjs — T23 真模型手动冒烟 (PRD §8 L4; AC-4/AC-5 人工核对),
// the AGENT-PREPARABLE half: everything except the real key. The USER runs
// scripts/smoke-real.sh with real credentials; this module does precheck →
// sandboxed real-model run → evidence extraction. NOT CI (PRD §8 L4: one
// manual run, cost < $1). Never fakes a result: with no key it prints the
// exact setup and exits 2 without hanging; with a key it runs the REAL
// providers and reports what the session JSONL actually shows.
//
// HONEST-REUSE MAP (plan T23: "reuse the T18/T19 machinery as far as honestly
// reusable"): the sandbox/boot/RPC/JSONL-observation patterns follow
// tests/e2e/drive.mjs (fresh implementation of the same shapes — same spawn
// env redirects, same readiness line, same web RPC envelope, same T15
// plaintext persistence overlay, same turn/end polling); the real-~/.dsh
// digest guard is REUSED directly (digestConfigDir import) so the "host
// untouched" semantics stay byte-identical with the mock e2e. What is
// deliberately GONE versus the mock driver: the mock-LLM server, the MOCKROLE
// persona markers, and every scripted step — the model's own compliance is
// the thing under test. Settings.yaml seeds NO baseURL rows, so llm-deepseek
// falls back to its production default https://api.deepseek.com and the
// llm-pi-ai deepseek profile falls back to the pi-ai catalog baseUrl (also
// https://api.deepseek.com — dist/providers/data/deepseek.json).
//
// CREDENTIAL MECHANISM (verified against the installed rc.6 sources):
//   - llm-deepseek: Config.apiKeyEnv default DEEPSEEK_API_KEY
//     (dsh-llm-deepseek/lib/index.js DEFAULT_API_KEY_ENV); per request the
//     adapter resolves credentialRef(apiKeyEnv) through ctx.credentials, else
//     the ambient launch environment; missing → LlmError MISSING_CREDENTIAL.
//   - llm-pi-ai: the settings profile's providers.<route>.apiKeyEnv is a
//     credential-ref resolved the same way; missing → MISSING_CREDENTIAL
//     naming the ref (lib/index.js:1794-1799).
//   - dsh-credentials-local layering: inherited process env (wins) >
//     $DSH_HOME/.credentials.yaml > <cwd>/.env > $DSH_HOME/.env. The sandbox
//     redirects $DSH_HOME, so the user's REAL store at
//     ${DSH_HOME:-~/.dsh}/.credentials.yaml would otherwise be invisible —
//     this script reads it READ-ONLY (parse never printed) and injects the
//     value into the sandboxed child's environment, which then wins there by
//     the same layering rule.
//
// Usage:
//   node scripts/smoke-real.mjs              precheck, then the real run
//   node scripts/smoke-real.mjs --self-test  hermetic QA of the analysis +
//                                            credential-parse logic (no spawn)
// Exit: 0 pass / 1 run-or-analysis failure / 2 precheck failure (no key, no dsh).

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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Direct reuse: the digest guard (T18 §14.5 semantics, volatile allowlist
// included) and the tool/result flattener (the T19 nested shape). Importing
// drive.mjs is side-effect free (its spawn guard keys on argv[1]).
const { digestConfigDir, toolResultParts } = await import(
  new URL('../tests/e2e/drive.mjs', import.meta.url).href
)
// The T14 routes are the single source of truth (same import the probe and
// the mock driver use — Node 24 type-stripping runs the .ts directly).
const { resolveModelRoutes } = await import(
  new URL('../patches/omo-dsh/omo-agents/src/model-routes.ts', import.meta.url).href
)

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_DIR = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents')
const PROFILE = 'web'
const CONCERTO_PRESET_ID = 'concerto'

const INSTALL_TIMEOUT_MS = Number(process.env.DSH_SMOKE_INSTALL_TIMEOUT_MS ?? 300_000)
const BOOT_TIMEOUT_MS = Number(process.env.DSH_SMOKE_BOOT_TIMEOUT_MS ?? 90_000)
// Real models think; the mock e2e's 120s would be tight. PRD §8 L4 allows one
// manual run — bound it generously, overridable.
const SCENARIO_TIMEOUT_MS = Number(process.env.DSH_SMOKE_SCENARIO_TIMEOUT_MS ?? 300_000)

// ── Scenario constants (real-model variant of the T19 dummy demo) ──────────
// The prompt NUDGES delegation (and foreground execution, so the chain lands
// inside one bounded turn) but scripts nothing: no tool names' arguments, no
// MOCKROLE, no expected-text sentinels the model is told to emit. Whether
// sisyphus actually produces a well-formed explore call is the compliance
// test.
const SMOKE_PROMPT =
  '这个仓库的 README 讲了什么？请把读取工作委派给 explore 子代理去做'
  + '（前台委派，等它的结果返回），然后基于它的发现用一句话总结。'
const README_CONTENT =
  'This is the omo-dsh concerto MVP fixture project.\n'
  + 'Smoke sentinel: the real-model delegation chain reached this file.\n'
// The sentinel proves the README bytes genuinely entered the explore child's
// context: it exists ONLY in the sandbox fixture file, so a child tool/result
// containing it means the file was really read (not hallucinated).
const README_SENTINEL = 'real-model delegation chain reached this file'

// ── Precheck: credentials, binary, base-url hygiene ────────────────────────

/**
 * Parse one credential out of a dsh-credentials-local document. The store is
 * a strict mapping of POSIX-ident refs to non-empty strings (values may be
 * bare or single/double-quoted). Pure string work — no yaml dep (zero new
 * npm deps), and the strict store format makes a line parse honest. Returns
 * undefined when absent/empty. NEVER log the return value.
 */
export function parseCredentialEntry(yamlText, ref) {
  const match = new RegExp(`^${ref}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(yamlText)
  if (match === null) return undefined
  let value = match[1].trim()
  // Strip one pair of matching surrounding quotes, if any.
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1)
    }
  }
  return value.length > 0 ? value : undefined
}

/**
 * Resolve DEEPSEEK_API_KEY without ever exposing it.
 * @returns {{key: string, source: string} | {key: undefined, tried: string[]}}
 *   source is a printable, key-free description of where the key came from.
 */
function resolveApiKey(realDshHome) {
  const fromEnv = process.env.DEEPSEEK_API_KEY
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return { key: fromEnv, source: 'environment (inherited; wins per dsh credential layering)' }
  }
  const credentialsPath = join(realDshHome, '.credentials.yaml')
  const tried = ['$DEEPSEEK_API_KEY (unset or empty)']
  if (existsSync(credentialsPath)) {
    tried.push(`${credentialsPath} (present)`)
    let text
    try {
      text = readFileSync(credentialsPath, 'utf8')
    } catch (error) {
      tried.push(`${credentialsPath} unreadable: ${error.message}`)
      return { key: undefined, tried }
    }
    const fromStore = parseCredentialEntry(text, 'DEEPSEEK_API_KEY')
    if (fromStore !== undefined) {
      return { key: fromStore, source: `${credentialsPath} (read-only; injected into the sandboxed child env)` }
    }
    tried.push(`${credentialsPath} has no DEEPSEEK_API_KEY entry`)
  } else {
    tried.push(`${credentialsPath} (absent)`)
  }
  return { key: undefined, tried }
}

/** The exact, actionable setup text. Printed on precheck failure; exit 2. */
function printMissingKeyAndExit(routes, tried) {
  const lines = [
    'smoke-real: PRECHECK FAIL — no DeepSeek API key available for the real-model run.',
    '',
    'ONE key covers BOTH routes (both authenticate against https://api.deepseek.com):',
    `  - sisyphus seat: ${routes.sisyphus.provider}/${routes.sisyphus.model} via llm-deepseek`,
    '    (apiKeyEnv defaults to DEEPSEEK_API_KEY)',
    `  - explore seat:  ${routes.explore.provider}/${routes.explore.model} via llm-pi-ai`,
    '    (this smoke seeds llm-pi-ai.providers.deepseek.apiKeyEnv=DEEPSEEK_API_KEY',
    '     in the sandbox settings.yaml — the same seed as scripts/concerto-mode-probe.sh)',
    '',
    'Provide the key in ONE of these two ways, then re-run scripts/smoke-real.sh:',
    '  A) export DEEPSEEK_API_KEY=sk-...        # shell env, inherited by the sandboxed dsh only',
    '  B) store it via the dsh web Models page → ${DSH_HOME:-~/.dsh}/.credentials.yaml',
    '     (this script reads that file READ-ONLY and injects the value into the sandbox)',
    '',
    'Looked for the key in:',
    ...tried.map((entry) => `  - ${entry}`),
    '',
    'Nothing was started; no file was written. The key is never printed or logged by this script.',
  ]
  console.error(lines.join('\n'))
  process.exit(2)
}

// ── Sandbox + dsh process management (drive.mjs patterns, real providers) ──

function createSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'omo-dsh-smoke-real-'))
  return {
    root,
    project: join(root, 'project'),
    dshHome: join(root, 'dsh'),
    agentsHome: join(root, 'agents'),
    xdg: join(root, 'xdg'),
    home: join(root, 'home'),
  }
}

/**
 * Spawned-process environment: every dsh/home pointer redirected into the
 * sandbox; the resolved key injected (when it came from the credentials file
 * it is not otherwise visible to the child); DEEPSEEK_BASE_URL stripped unless
 * the user opted out — the smoke's contract is production endpoints.
 */
function scenarioEnv(sandbox, apiKey) {
  const env = { ...process.env }
  const baseUrlNote = { stripped: false }
  if (process.env.DSH_SMOKE_RESPECT_BASE_URL !== '1' && env.DEEPSEEK_BASE_URL !== undefined) {
    delete env.DEEPSEEK_BASE_URL
    baseUrlNote.stripped = true
  }
  env.HOME = sandbox.home
  env.USERPROFILE = sandbox.home
  env.XDG_CONFIG_HOME = sandbox.xdg
  env.DSH_HOME = sandbox.dshHome
  env.DSH_AGENTS_HOME = sandbox.agentsHome
  env.DEEPSEEK_API_KEY = apiKey
  return { env, baseUrlNote }
}

/**
 * Seed the sandbox: settings.yaml with REAL wiring (agent-default-model pins
 * the sisyphus seat; both adapters keyed via DEEPSEEK_API_KEY; NO baseURL rows
 * → production endpoints), plus the T15 plaintext persistence overlay.
 * Returns the overlay path (second --patch).
 */
function seedSandbox(sandbox, routes) {
  for (const dir of [sandbox.project, sandbox.dshHome, sandbox.agentsHome, sandbox.xdg, sandbox.home]) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(
    join(sandbox.dshHome, 'settings.yaml'),
    [
      '# smoke-real seed: REAL providers — no endpoint override rows, so llm-deepseek',
      '# uses its production default and the llm-pi-ai deepseek profile uses the pi-ai',
      '# catalog endpoint (both https://api.deepseek.com). One key covers both routes.',
      'agent-default-model:',
      `  provider: ${routes.sisyphus.provider}`,
      `  model: ${routes.sisyphus.model}`,
      'llm-deepseek:',
      '  apiKeyEnv: DEEPSEEK_API_KEY',
      'llm-pi-ai:',
      '  providers:',
      `    ${routes.explore.provider}:`,
      '      apiKeyEnv: DEEPSEEK_API_KEY',
      '',
    ].join('\n'),
  )
  const patchPath = join(sandbox.root, 'smoke.patch.yml')
  writeFileSync(
    patchPath,
    [
      '# smoke-real overlay: plaintext, unpacked session JSONL (T15 layout). Row',
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

function installPlugin(sandbox, childEnv) {
  const add = spawnSync('dsh', ['plugin', '--profile', PROFILE, 'add', PLUGIN_DIR], {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: 'utf8',
    timeout: INSTALL_TIMEOUT_MS,
  })
  writeFileSync(join(sandbox.root, 'plugin-add.log'), `${add.stdout ?? ''}\n${add.stderr ?? ''}`)
  if (add.status !== 0) {
    throw new Error(`dsh plugin add exited ${add.status} (see plugin-add.log in the sandbox)`)
  }
}

/**
 * Whether this runtime's web app advertises `--no-open` (dsh 0.1.2 introduced
 * the browser handoff and its suppressing flag together; before that the app's
 * commander rejects an unknown option, so hardcoding the flag would turn a
 * pre-0.1.2 run into `error: unknown option` — P-8.2's class).
 * docs/dsh-0.1.5-rc.1-review.md §7.6. Cached: one probe per process.
 */
let noOpenSupport
function supportsNoOpen() {
  if (noOpenSupport === undefined) {
    // The probe must NOT inherit this process's environment. `dsh --profile web
    // --help` does not merely print help: it BOOTS the profile, creating
    // $DSH_HOME (.anonymous-user-id, profiles/) as a side effect. Run with the
    // ambient env and a script that promises "your real ~/.dsh is never
    // touched" silently creates or boots it — invisible on a developer machine
    // where the directory already exists, and loudly visible in CI on a fresh
    // HOME (the credential digest flips to `realDshUntouched: false`).
    // A throwaway home keeps the probe as isolated as the scenarios themselves.
    const probeHome = mkdtempSync(join(tmpdir(), 'omo-noopen-probe-'))
    try {
      const probe = spawnSync('dsh', ['--profile', PROFILE, '--help'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: probeHome,
          XDG_CONFIG_HOME: join(probeHome, '.config'),
          DSH_HOME: join(probeHome, '.dsh'),
          DSH_AGENTS_HOME: join(probeHome, '.agents'),
        },
      })
      noOpenSupport = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.includes('--no-open')
    } finally {
      rmSync(probeHome, { recursive: true, force: true })
    }
  }
  return noOpenSupport
}

function bootDsh(sandbox, childEnv, patchPath) {
  return new Promise((resolveBoot, rejectBoot) => {
    const child = spawn(
      'dsh',
      [
        '--profile', PROFILE, '--patch', './cordis.yml', '--patch', patchPath, '--port', '0',
        ...supportsNoOpen() ? ['--no-open'] : [],
      ],
      { cwd: REPO_ROOT, env: childEnv },
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

// ── Web RPC surface (same envelope as the mock driver) ─────────────────────

let rpcCounter = 0

async function rpc(port, method, payload) {
  const rpcId = `smoke-real-${method}-${++rpcCounter}`
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

// ── Session JSONL observation (T15 layout) ─────────────────────────────────

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

// ── Analysis (pure; the --self-test QA targets exactly this) ───────────────
// With real providers there is no mock request channel: the session JSONL is
// the ONLY observation channel (T15 contract). The checks below are the AC-4
// four-event chain and the AC-5 route pair, as BUSINESS outcomes — a real
// explore tool/call with contract args, a real child session that really read
// the README (sentinel in a child tool/result), the findings really landing
// back in the parent, a real summary + orderly turn/end, and the executed
// request/header routes of BOTH logs matching the T14 routes and differing.

function requestHeaderRoute(events) {
  let route
  for (const event of events) {
    if (event.type === 'request/header') {
      route = {
        provider: event.data?.header?.config?.provider,
        model: event.data?.header?.config?.model,
        seq: event.seq,
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
 * The real-run verdict.
 * `log` = the parent (sisyphus) session log | undefined; `childLog` = the
 * explore child's own session.jsonl | undefined; `providersJson` = the raw
 * /api/llm.providers JSON; `bootLog` = captured dsh stdout.
 * Returns {result, failed, checks, evidence} — evidence carries the values
 * the human checklist cites (routes, seqs, arg snippets), never the key.
 */
export function analyzeRealRun({ log, childLog, providersJson, bootLog }, routes) {
  const events = log?.events ?? []
  const childEvents = childLog?.events ?? []

  const parentRoute = requestHeaderRoute(events)
  const childRoute = requestHeaderRoute(childEvents)

  // AC-4 link 1: sisyphus's own decision — a real explore tool/call with the
  // T11 contract args (description + prompt naming the README).
  const exploreCall = events.find((event) => event.type === 'tool/call' && event.data?.name === 'explore')
  let exploreCallArgs = {}
  try {
    exploreCallArgs = JSON.parse(exploreCall?.data?.arguments ?? '{}')
  } catch {
    // unparseable model output fails link 1 below
  }

  // AC-4 link 2: the explore child RAN and really read the README — its own
  // session exists under the parent, it issued at least one tool call, and a
  // child tool/result carries the on-disk-only sentinel.
  const childToolCalls = childEvents.filter((event) => event.type === 'tool/call')
  const childResults = toolResultParts(childEvents)
  const childSawReadme = childResults.some((part) => part.text.includes(README_SENTINEL))
  const childFindingsMessage = childEvents.find(
    (event) => event.type === 'assistant/message' && eventText(event).length > 2,
  )

  // AC-4 link 3: the findings returned to sisyphus — the explore call's own
  // tool/result in the parent log, settled and non-error, with real content
  // (free-form with a real model — presence + non-error is the honest bar).
  const parentResults = toolResultParts(events)
  const exploreCallId = exploreCall?.data?.callId
  const exploreResult = parentResults.find(
    (part) => part.callId === exploreCallId && part.isError !== true && part.text.trim().length > 0,
  )

  // AC-4 link 4: a real summary after the result, and an orderly turn end.
  const summaryMessage = events.find(
    (event) =>
      event.type === 'assistant/message'
      && exploreCall !== undefined
      && event.seq > exploreCall.seq
      && eventText(event).length > 2,
  )
  const turnCompleted = events.some(
    (event) =>
      event.type === 'turn/end'
      && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
  )

  const checks = {
    // Wiring observations (preflight — if these fail, the AC checks below are
    // read against a boot that never stood a chance).
    pluginLoaded: bootLog.includes('[omo-agents] loaded'),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    exploreProviderActive: new RegExp(
      `"provider":"${routes.explore.provider}"[^}]*"active":true`,
    ).test(providersJson),
    parentSessionLogFound: log !== undefined,
    userQuestionRecorded: events.some(
      (event) => event.type === 'user/message' && eventText(event).includes('README'),
    ),
    // ── AC-4: the four chain events, in order ──
    ac4Link1DelegationCall:
      exploreCall !== undefined
      && typeof exploreCallArgs.description === 'string'
      && typeof exploreCallArgs.prompt === 'string'
      && exploreCallArgs.prompt.includes('README'),
    ac4Link2ExploreRanAndReadReadme:
      childLog !== undefined
      && childLog.header?.origin === 'subagent'
      && String(childLog.header?.parentSession) === String(log?.header?.id)
      && childToolCalls.length >= 1
      && childSawReadme
      && childFindingsMessage !== undefined,
    ac4Link3ResultReturnedToSisyphus: exploreResult !== undefined,
    ac4Link4SisyphusSummarizedAndTurnCompleted:
      summaryMessage !== undefined && turnCompleted,
    ac4ChainObservedInOrder:
      exploreCall !== undefined
      && exploreResult !== undefined
      && summaryMessage !== undefined
      && exploreCall.seq < summaryMessage.seq,
    // ── AC-5: the executed route pair is observable AND distinct (latest
    // request/header of BOTH session logs — the T15/T20 contract).
    ac5ParentRequestHeaderIsSisyphusRoute:
      parentRoute !== undefined
      && parentRoute.provider === routes.sisyphus.provider
      && parentRoute.model === routes.sisyphus.model,
    ac5ChildRequestHeaderIsExploreRoute:
      childRoute !== undefined
      && childRoute.provider === routes.explore.provider
      && childRoute.model === routes.explore.model,
    ac5RoutesDistinct:
      parentRoute !== undefined
      && childRoute !== undefined
      && (parentRoute.provider !== childRoute.provider
        || parentRoute.model !== childRoute.model),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const evidence = {
    parentRoute: parentRoute ?? null,
    childRoute: childRoute ?? null,
    exploreCall: exploreCall === undefined
      ? null
      : {
          seq: exploreCall.seq,
          callId: exploreCallId ?? null,
          description: typeof exploreCallArgs.description === 'string' ? exploreCallArgs.description : null,
          promptSnippet: typeof exploreCallArgs.prompt === 'string' ? exploreCallArgs.prompt.slice(0, 200) : null,
          runInBackground: exploreCallArgs.run_in_background ?? null,
        },
    childToolCallNames: childToolCalls.map((call) => call.data?.name ?? '?'),
    childSawReadmeSentinel: childSawReadme,
    exploreResultSnippet: exploreResult === undefined ? null : exploreResult.text.slice(0, 300),
    summarySnippet: summaryMessage === undefined ? null : eventText(summaryMessage).slice(0, 300),
    parentSessionId: log?.header?.id ?? null,
    childSessionId: childLog?.header?.id ?? null,
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, evidence }
}

// ── Evidence rendering (transcript.md + machine verdict) ───────────────────

function truncate(text, max) {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`
}

/** One line per event — the human-scanable transcript of a session log. */
function transcriptLines(log) {
  const lines = []
  for (const event of log.events) {
    let detail = ''
    if (event.type === 'tool/call') {
      detail = `${event.data?.name} ${truncate(String(event.data?.arguments ?? ''), 140)}`
    } else if (event.type === 'tool/result') {
      const parts = toolResultParts([event])
      detail = truncate(parts.map((part) => `${part.isError ? 'ERROR ' : ''}${part.text}`).join(' | '), 160)
    } else if (event.type === 'request/header') {
      detail = `route=${event.data?.header?.config?.provider}/${event.data?.header?.config?.model} reason=${event.data?.reason ?? '?'}`
    } else if (event.type === 'user/message' || event.type === 'assistant/message') {
      detail = truncate(eventText(event), 160)
    } else if (event.type === 'turn/end') {
      detail = `reason=${truncate(JSON.stringify(event.data?.reason ?? {}), 80)}`
    } else if (event.type === 'subagent/descriptor') {
      detail = truncate(eventText(event), 160)
    }
    lines.push(`  - seq ${event.seq} ${event.type}${detail.length > 0 ? ` — ${detail}` : ''}`)
  }
  return lines
}

function checkMark(value) {
  return value === true ? '[x]' : '[ ]'
}

/**
 * The human checklist + transcript + cost/time note. `meta` carries wall
 * times, ids, and the digest outcome. Pure string building.
 */
export function renderTranscript({ analysis, log, childLog, routes, meta }) {
  const { checks, evidence } = analysis
  const lines = [
    `# smoke-real transcript — ${meta.timestamp}`,
    '',
    `- dsh: ${meta.dshVersion}`,
    `- routes (T14): sisyphus=${routes.sisyphus.provider}/${routes.sisyphus.model} · explore=${routes.explore.provider}/${routes.explore.model}`,
    `- credential: DEEPSEEK_API_KEY present — source: ${meta.keySource}`,
    `- sandbox: ${meta.sandboxRoot}${meta.sandboxKept ? ' (kept)' : ' (removed after evidence copy)'}`,
    `- evidence dir: ${meta.evidenceDir}`,
    `- real dsh home (${meta.realDshHome}) untouched: ${meta.realDshUntouched ? 'YES (digest identical)' : 'NO — INVESTIGATE'}`,
    `- base-url note: ${meta.baseUrlNote}`,
    '',
    '## Wiring observations (auto-checked)',
    '',
    `- ${checkMark(checks.pluginLoaded)} omo-agents plugin loaded in the booted dsh`,
    `- ${checkMark(checks.sisyphusProviderActive)} sisyphus provider active in /api/llm.providers (llm-deepseek)`,
    `- ${checkMark(checks.exploreProviderActive)} explore provider active in /api/llm.providers (llm-pi-ai settings profile)`,
    `- ${checkMark(checks.parentSessionLogFound)} parent session log found on disk`,
    `- ${checkMark(checks.userQuestionRecorded)} the user question is recorded in the parent log`,
    '',
    '## AC-4 delegation chain (人工核对 — confirm each against the transcripts below, then tick)',
    '',
    `- ${checkMark(checks.ac4Link1DelegationCall)} 1. sisyphus CALLED the explore delegation tool (seq ${evidence.exploreCall?.seq ?? '?'}; description: ${evidence.exploreCall?.description ?? '—'}; run_in_background: ${evidence.exploreCall?.runInBackground ?? '—'})`,
    `- ${checkMark(checks.ac4Link2ExploreRanAndReadReadme)} 2. the explore child RAN and really read the README (child session ${evidence.childSessionId ?? '—'}; tool calls: ${(evidence.childToolCallNames ?? []).join(', ') || '—'}; README sentinel reached the child: ${evidence.childSawReadmeSentinel ? 'yes' : 'no'})`,
    `- ${checkMark(checks.ac4Link3ResultReturnedToSisyphus)} 3. the child's findings RETURNED to sisyphus (settled non-error tool/result in the parent log)`,
    `- ${checkMark(checks.ac4Link4SisyphusSummarizedAndTurnCompleted)} 4. sisyphus SUMMARIZED and the turn completed`,
    `- ${checkMark(checks.ac4ChainObservedInOrder)} order: delegation call seq < summary seq in the parent log`,
    '',
    '## AC-5 dual routes (人工核对 — the two executed routes must be the T14 pair and DIFFER)',
    '',
    `- ${checkMark(checks.ac5ParentRequestHeaderIsSisyphusRoute)} parent (sisyphus) request/header route = ${evidence.parentRoute == null ? '—' : `${evidence.parentRoute.provider}/${evidence.parentRoute.model}`} (expected ${routes.sisyphus.provider}/${routes.sisyphus.model})`,
    `- ${checkMark(checks.ac5ChildRequestHeaderIsExploreRoute)} child (explore) request/header route = ${evidence.childRoute == null ? '—' : `${evidence.childRoute.provider}/${evidence.childRoute.model}`} (expected ${routes.explore.provider}/${routes.explore.model})`,
    `- ${checkMark(checks.ac5RoutesDistinct)} the two routes DIFFER`,
    '',
    '## Parent session transcript (one line per event)',
    '',
    ...(log === undefined ? ['  (no parent session log)'] : transcriptLines(log)),
    '',
    '## Child (explore) session transcript',
    '',
    ...(childLog === undefined ? ['  (no child session log — the delegation never produced a child)'] : transcriptLines(childLog)),
    '',
    '## Cost / time note',
    '',
    `- wall clock: boot ${meta.bootSeconds}s · scenario ${meta.scenarioSeconds}s · total ${meta.totalSeconds}s`,
    '- token usage is NOT metered by the harness JSONL — check the DeepSeek console for the exact figure.',
    '  Catalog prices (pi-ai deepseek.json, $/M tokens input/output): deepseek-v4-pro 0.435/0.87 · deepseek-v4-flash 0.14/0.28.',
    '  This scenario is one short delegation chain; expected cost is cents, far under the PRD §8 L4 $1 budget.',
    '',
    '---',
    'USER GATE: this script auto-evaluated the checks above from the session JSONL, but the',
    'AC-4/AC-5 sign-off is YOURS (PRD §8 L4). Review the transcripts, then tick the boxes.',
  ]
  return lines.join('\n')
}

// ── The real run ───────────────────────────────────────────────────────────

async function runSmoke(routes, apiKey, keySource) {
  const startedAt = Date.now()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const evidenceDir = join(REPO_ROOT, '.omo', 'evidence', `smoke-real-${timestamp}`)
  mkdirSync(evidenceDir, { recursive: true })

  const realDshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const beforeDigest = digestConfigDir(realDshHome)
  console.error(`smoke-real: evidence dir ${evidenceDir}`)
  console.error(`smoke-real: real dsh home digest target ${realDshHome} (before: ${beforeDigest.slice(0, 16)}…)`)
  console.error(`smoke-real: routes sisyphus=${routes.sisyphus.provider}/${routes.sisyphus.model} explore=${routes.explore.provider}/${routes.explore.model}`)

  const sandbox = createSandbox()
  const { env: childEnv, baseUrlNote } = scenarioEnv(sandbox, apiKey)
  if (baseUrlNote.stripped) {
    console.error('smoke-real: NOTE — DEEPSEEK_BASE_URL was set in your shell; stripped from the sandboxed dsh env so both routes hit https://api.deepseek.com (DSH_SMOKE_RESPECT_BASE_URL=1 keeps it)')
  }
  console.error(`smoke-real: sandbox ${sandbox.root}`)

  const patchPath = seedSandbox(sandbox, routes)
  writeFileSync(join(sandbox.project, 'README.md'), README_CONTENT)

  let child
  let analysis
  let finalLog
  let childLog
  let runError
  let bootSeconds = 'n/a'
  let scenarioSeconds = 'n/a'
  let dshVersion = 'unknown'
  let bootLogText = ''
  try {
    const version = spawnSync('dsh', ['--version'], { encoding: 'utf8' })
    dshVersion = (version.stdout ?? '').trim() || 'unknown'

    console.error('smoke-real: stage 0 — dsh plugin add into the sandbox profile')
    installPlugin(sandbox, childEnv)

    console.error('smoke-real: booting dsh --profile web --patch ./cordis.yml --patch <smoke> --port 0')
    const bootStarted = Date.now()
    const boot = await bootDsh(sandbox, childEnv, patchPath)
    child = boot.child
    bootSeconds = ((Date.now() - bootStarted) / 1000).toFixed(1)
    console.error(`smoke-real: web ready on 127.0.0.1:${boot.port} (${bootSeconds}s)`)

    const providers = await rpc(boot.port, 'llm.providers', {})
    const providersJson = JSON.stringify(providers)
    writeFileSync(join(evidenceDir, 'llm.providers.json'), `${JSON.stringify(providers, null, 2)}\n`)

    const created = await rpc(boot.port, 'session.create', {
      cwd: sandbox.project,
      agentPreset: CONCERTO_PRESET_ID,
    })
    console.error(`smoke-real: session created ${created.sessionId} (preset ${created.agentPreset ?? '?'})`)
    const scenarioStarted = Date.now()
    await rpc(boot.port, 'session.prompt', {
      sessionId: created.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: SMOKE_PROMPT }],
    })
    console.error('smoke-real: prompt accepted (real models — this can take minutes); awaiting turn/end on the session JSONL')
    const log = await awaitTurnEnd(sandbox, created.sessionId)
    scenarioSeconds = ((Date.now() - scenarioStarted) / 1000).toFixed(1)

    await stopDsh(child)
    child = undefined
    // SIGTERM flushes the write-behind batcher; re-read the final bytes of
    // EVERY session log (the child log settles with the parent).
    const allLogs = findSessionLogs(join(sandbox.dshHome, 'sessions'))
    finalLog = allLogs.find(
      (candidate) => String(candidate.header.id) === String(created.sessionId),
    ) ?? log
    childLog = allLogs.find(
      (candidate) =>
        candidate.header.origin === 'subagent'
        && String(candidate.header.parentSession) === String(created.sessionId),
    )

    bootLogText = boot.log()
    analysis = analyzeRealRun(
      { log: finalLog, childLog, providersJson, bootLog: bootLogText },
      routes,
    )
  } catch (error) {
    // The run itself failed (boot, RPC, …) — record honestly, keep going to
    // the evidence write (drive.mjs's driver-error discipline).
    runError = error
  } finally {
    if (child !== undefined) await stopDsh(child)
  }

  const afterDigest = digestConfigDir(realDshHome)
  const realDshUntouched = beforeDigest === afterDigest

  // Evidence copies (before any sandbox cleanup). The sandbox boot.log is the
  // incremental capture — copy it even on the driver-error path.
  const sandboxBootLog = join(sandbox.root, 'boot.log')
  if (existsSync(sandboxBootLog)) {
    writeFileSync(join(evidenceDir, 'boot.log'), readFileSync(sandboxBootLog, 'utf8'))
  } else if (bootLogText.length > 0) {
    writeFileSync(join(evidenceDir, 'boot.log'), bootLogText)
  }
  const sandboxAddLog = join(sandbox.root, 'plugin-add.log')
  if (existsSync(sandboxAddLog)) {
    writeFileSync(join(evidenceDir, 'plugin-add.log'), readFileSync(sandboxAddLog, 'utf8'))
  }
  if (finalLog !== undefined) {
    writeFileSync(join(evidenceDir, 'session-parent.jsonl'), readFileSync(finalLog.path, 'utf8'))
  }
  if (childLog !== undefined) {
    writeFileSync(join(evidenceDir, 'session-child.jsonl'), readFileSync(childLog.path, 'utf8'))
  }
  const routeLines = {
    note: 'every request/header event of both session logs (AC-5 raw evidence)',
    parent: (finalLog?.events ?? []).filter((event) => event.type === 'request/header'),
    child: (childLog?.events ?? []).filter((event) => event.type === 'request/header'),
  }
  writeFileSync(join(evidenceDir, 'routes.json'), `${JSON.stringify(routeLines, null, 2)}\n`)

  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)

  if (analysis === undefined) {
    // The run itself threw (boot failure, RPC failure, …) — record honestly.
    analysis = {
      result: 'FAIL',
      failed: [`driver error: ${runError?.message ?? 'unknown'}`],
      checks: {},
      evidence: {},
    }
  }
  const passed = analysis.result === 'PASS' && realDshUntouched
  // drive.mjs discipline: sandboxes are removed on PASS, kept for postmortem
  // on FAIL (or when explicitly requested).
  const keepSandbox = process.env.DSH_SMOKE_KEEP_SANDBOX === '1' || !passed

  const meta = {
    timestamp,
    dshVersion,
    keySource,
    sandboxRoot: sandbox.root,
    sandboxKept: keepSandbox,
    evidenceDir,
    realDshHome,
    realDshUntouched,
    baseUrlNote: baseUrlNote.stripped
      ? 'DEEPSEEK_BASE_URL was stripped from the sandboxed child env (production endpoints used)'
      : 'no baseURL overrides anywhere — production endpoints used',
    bootSeconds,
    scenarioSeconds,
    totalSeconds,
  }

  const transcript = renderTranscript({ analysis, log: finalLog, childLog, routes, meta })
  writeFileSync(join(evidenceDir, 'transcript.md'), `${transcript}\n`)
  const verdict = {
    result: passed ? 'PASS' : 'FAIL',
    analysis,
    realDshUntouched,
    meta,
  }
  writeFileSync(join(evidenceDir, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`)

  if (!keepSandbox && existsSync(sandbox.root)) {
    rmSync(sandbox.root, { recursive: true, force: true })
  } else if (keepSandbox) {
    console.error(`smoke-real: sandbox kept at ${sandbox.root}`)
  }

  console.error('')
  console.error(transcript)
  console.error('')
  if (verdict.result === 'PASS') {
    console.error(`smoke-real: AUTO-CHECKS PASS — review ${join(evidenceDir, 'transcript.md')} and tick the checklist (you are the gate)`)
  } else {
    console.error(`smoke-real: AUTO-CHECKS FAIL (${analysis.failed.join(', ') || 'digest drift'}) — evidence in ${evidenceDir}`)
  }
  return verdict.result === 'PASS' ? 0 : 1
}

// ── --self-test: the analysis must earn its PASS (hermetic, no spawn) ──────
// Fabricated logs carry the REAL run's shape (no MOCKROLE, free-form model
// text). Each fabricated defect must FAIL on its own named check — a checklist
// that passes everything is worthless (drive.mjs's own self-test discipline).

const SELF_PARENT_ID = 'session-selftest-parent'
const SELF_CHILD_ID = 'session-selftest-child'

function selfParentLog(routes) {
  return {
    path: '/fabricated/parent/session.jsonl',
    header: { type: 'session', id: SELF_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: SMOKE_PROMPT }] } },
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
      },
      {
        seq: 3,
        type: 'tool/call',
        data: {
          turn: 1,
          step: 1,
          callId: 'real-call-1',
          name: 'explore',
          arguments: JSON.stringify({
            description: '读取项目 README',
            prompt: '请读取当前项目目录下的 README.md 并汇报它的内容。',
            run_in_background: false,
          }),
        },
      },
      {
        seq: 4,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'real-call-1', content: [{ type: 'text', text: '子代理发现：README 说明这是 omo-dsh 协奏 MVP 的夹具项目。' }], isError: false }] } },
      },
      { seq: 5, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: '一句话总结：这个 README 介绍了 omo-dsh 协奏 MVP 夹具项目。' }] } } },
      { seq: 6, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function selfChildLog(routes) {
  return {
    path: '/fabricated/child/session.jsonl',
    header: {
      type: 'session',
      id: SELF_CHILD_ID,
      origin: 'subagent',
      parentSession: SELF_PARENT_ID,
      delegationDepth: 1,
    },
    events: [
      {
        seq: 1,
        type: 'request/header',
        data: { header: { config: { provider: routes.explore.provider, model: routes.explore.model } }, reason: 'initial' },
      },
      {
        seq: 2,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'real-child-call-1', name: 'read', arguments: JSON.stringify({ file_path: '/fabricated/project/README.md' }) },
      },
      {
        seq: 3,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'real-child-call-1', content: [{ type: 'text', text: `This is the omo-dsh concerto MVP fixture project. Smoke sentinel: the ${README_SENTINEL}` }], isError: false }] } },
      },
      { seq: 4, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: 'README 内容：这是 omo-dsh 协奏 MVP 夹具项目。' }] } } },
      { seq: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function selfProvidersJson(routes) {
  return JSON.stringify({
    providers: [
      { provider: routes.sisyphus.provider, active: true },
      { provider: routes.explore.provider, active: true },
    ],
  })
}

function selfInput(routes) {
  return {
    log: selfParentLog(routes),
    childLog: selfChildLog(routes),
    providersJson: selfProvidersJson(routes),
    bootLog: '[omo-agents] loaded',
  }
}

function runSelfTest(routes) {
  const problems = []

  // Credential parsing: the strict store shapes, including quoted values —
  // and never any key material in outputs (we only compare booleans/lengths).
  const fakeKey = 'sk-SELFTEST-FAKE-KEY'
  const parseCases = [
    [`DEEPSEEK_API_KEY: ${fakeKey}\n`, fakeKey, 'bare value'],
    [`DEEPSEEK_API_KEY: "${fakeKey}"\n`, fakeKey, 'double-quoted value'],
    [`DEEPSEEK_API_KEY: '${fakeKey}'\n`, fakeKey, 'single-quoted value'],
    ['OTHER_KEY: value\n', undefined, 'absent ref'],
    ['DEEPSEEK_API_KEY: \n', undefined, 'empty value'],
  ]
  for (const [text, expected, label] of parseCases) {
    const got = parseCredentialEntry(text, 'DEEPSEEK_API_KEY')
    if (got !== expected) {
      problems.push(`credential parse "${label}" must yield ${expected === undefined ? 'undefined' : 'the value'}, got ${got === undefined ? 'undefined' : 'a different value'}`)
    }
  }

  // The seeded settings.yaml must carry NO baseURL row and NO key material.
  const tmp = mkdtempSync(join(tmpdir(), 'smoke-real-selftest-'))
  try {
    const realSandbox = {
      root: tmp,
      project: join(tmp, 'project'),
      dshHome: join(tmp, 'dsh'),
      agentsHome: join(tmp, 'agents'),
      xdg: join(tmp, 'xdg'),
      home: join(tmp, 'home'),
    }
    seedSandbox(realSandbox, routes)
    const seeded = readFileSync(join(realSandbox.dshHome, 'settings.yaml'), 'utf8')
    if (/baseurl/i.test(seeded)) {
      problems.push('seeded settings.yaml must NOT pin a baseURL (production endpoints are the contract)')
    }
    if (seeded.includes(fakeKey) || !seeded.includes('apiKeyEnv: DEEPSEEK_API_KEY')) {
      problems.push('seeded settings.yaml must reference the credential ENV NAME only, never key material')
    }
    for (const needle of [
      `provider: ${routes.sisyphus.provider}`,
      `model: ${routes.sisyphus.model}`,
      `${routes.explore.provider}:`,
    ]) {
      if (!seeded.includes(needle)) problems.push(`seeded settings.yaml missing '${needle}'`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  // Good fabricated run → PASS.
  const good = analyzeRealRun(selfInput(routes), routes)
  if (good.result !== 'PASS') {
    problems.push(`fabricated GOOD real run must PASS, got FAIL on: ${good.failed.join(', ')}`)
  }

  // Each fabricated defect fails on its own named check.
  const defectCases = [
    ['no delegation call in the parent log', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/call')
    }, 'ac4Link1DelegationCall'],
    ['child never ran (no child log)', (input) => {
      input.childLog = undefined
    }, 'ac4Link2ExploreRanAndReadReadme'],
    ['child never saw the README bytes (sentinel absent)', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          ? { ...event, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'real-child-call-1', content: [{ type: 'text', text: 'unrelated content' }], isError: false }] } } }
          : event)
    }, 'ac4Link2ExploreRanAndReadReadme'],
    ['findings never returned to the parent', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
    }, 'ac4Link3ResultReturnedToSisyphus'],
    ['no summary / no turn end', (input) => {
      input.log.events = input.log.events.filter(
        (event) => event.type !== 'assistant/message' && event.type !== 'turn/end',
      )
    }, 'ac4Link4SisyphusSummarizedAndTurnCompleted'],
    ['child executed on the WRONG route', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { config: { provider: 'wrong', model: 'wrong' } }, reason: 'initial' } }
          : event)
    }, 'ac5ChildRequestHeaderIsExploreRoute'],
    ['routes collapsed to equal (AC-5 distinctness)', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' } }
          : event)
    }, 'ac5RoutesDistinct'],
    ['explore provider not active at boot', (input) => {
      input.providersJson = JSON.stringify({ providers: [{ provider: routes.sisyphus.provider, active: true }] })
    }, 'exploreProviderActive'],
  ]
  for (const [label, mutate, expectedCheck] of defectCases) {
    const input = selfInput(routes)
    mutate(input)
    const verdict = analyzeRealRun(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // Transcript renders with the checklist sections and never echoes a key.
  const transcript = renderTranscript({
    analysis: good,
    log: selfParentLog(routes),
    childLog: selfChildLog(routes),
    routes,
    meta: {
      timestamp: 'selftest',
      dshVersion: 'selftest',
      keySource: 'selftest',
      sandboxRoot: '/fabricated',
      sandboxKept: false,
      evidenceDir: '/fabricated',
      realDshHome: '/fabricated',
      realDshUntouched: true,
      baseUrlNote: 'selftest',
      bootSeconds: '0',
      scenarioSeconds: '0',
      totalSeconds: '0',
    },
  })
  for (const needle of ['AC-4', 'AC-5', 'Cost / time note', 'USER GATE']) {
    if (!transcript.includes(needle)) problems.push(`transcript missing section '${needle}'`)
  }
  if (transcript.includes(fakeKey)) problems.push('transcript must never contain key material')

  return problems
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const routes = resolveModelRoutes()

  if (process.argv.includes('--self-test')) {
    const problems = runSelfTest(routes)
    if (problems.length > 0) {
      console.error(`SELF-TEST FAIL: ${problems.join('; ')}`)
      process.exit(1)
    }
    console.log('SELF-TEST OK: credential parse (bare/quoted/absent/empty) correct; seeded settings.yaml carries no baseURL and no key material; fabricated GOOD real run PASSes; every fabricated defect (no delegation call, no child, README bytes unseen, no result return, no summary/turn-end, wrong child route, collapsed routes, inactive explore provider) FAILs on its own named check; transcript renders all sections without key material')
    process.exit(0)
  }

  // Precheck — fast, no network, exits 2 without hanging when anything is
  // missing (plan QA: 无 key 环境下明确报错退出（非挂起）).
  const dsh = spawnSync('dsh', ['--version'], { encoding: 'utf8' })
  if (dsh.status !== 0) {
    console.error('smoke-real: PRECHECK FAIL — `dsh --version` failed; install/activate the dsh CLI first.')
    process.exit(2)
  }
  const realDshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const resolved = resolveApiKey(realDshHome)
  if (resolved.key === undefined) {
    printMissingKeyAndExit(routes, resolved.tried)
  }
  console.error(`smoke-real: precheck OK — DEEPSEEK_API_KEY present (source: ${resolved.source}; length ${resolved.key.length}; value never printed)`)

  if (process.argv.includes('--precheck-only')) {
    // Setup verification without spending a cent: credential resolution and
    // the dsh binary checked, nothing booted.
    console.error('smoke-real: --precheck-only — stopping before the run; your setup is ready for scripts/smoke-real.sh')
    process.exit(0)
  }

  const code = await runSmoke(routes, resolved.key, resolved.source)
  process.exit(code)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`smoke-real: driver crash: ${error.message}`)
    process.exit(1)
  })
}
