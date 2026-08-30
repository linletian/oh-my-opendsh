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
//       Completion is observed on the SESSION JSONL on disk (turn/end with
//       reason.kind "completed") — the same artifact the assertions read, so
//       observation and assertion share one channel.
//
// ── TRANSPORT-ADAPTIVE RPC (T9; rc.6 stays the committed pin) ──
// The driver speaks BOTH web-RPC transports, chosen by the readiness line:
//   rc.6  — `dsh web: http://127.0.0.1:<port>` (no query). FLAT endpoints
//           (/api/session.create, /api/session.prompt, /api/llm.providers)
//           with the envelope above and NO auth token: the /api trust fence
//           is a loopback Host-header check only, "not an auth layer"
//           (dsh-client-connection/lib/index.js:106-215).
//   0.1.2 — `dsh web: http://127.0.0.1:<port>/?token=<launch-token>`
//           (browser-auth.ts TOKEN_QUERY). Every /api call needs the
//           authority-bound dsh-auth-* cookie minted by
//           GET /?token=<launch-token> → 303 + Set-Cookie
//           (browser-auth.ts:240-282; a query token on /api itself → 401).
//           The flat endpoints are GONE (404 even authenticated); the client
//           now rides the Typert Remote projection over the SAME envelope:
//           POST /api/<namespace>/<method> with payload {args:{…}}
//           (docs/api-gateway.md:121; api/gateway/src/index.ts:945-960).
//           Mapping (assertion strength unchanged):
//             llm.providers  → llm/listProviders + llm/listConfigurableProviders,
//               joined by the Web UI's own rule (joinProviderDirectory,
//               ui-settings-models/src/client/store.ts:49-73): active ⟺ the
//               provider id is a registered route — the exact join rc.6's
//               llm.providers performed server-side.
//             session.create → session/create, args {request:{cwd,agentPreset}}
//             session.prompt → session/prompt, args {request:{requestId,…}}
//
// ── MOCKROLE DELIVERY (T17's role marker must reach a SYSTEM message)
// Workspace instruction files (AGENTS.md) are injected as USER-role
// <system-reminder> messages (dsh-agent-instructions/README.md:17,47) —
// invisible to the mock server's system-message scan. Instead the driver
// appends `MOCKROLE=<role>` to the PERSONA block scalar of the MATERIALIZED
// preset ($DSH_HOME/.agent-presets/concerto/agent.cordis.yml) AFTER boot sync
// and BEFORE session.create: dsh-agent-presets reads the composition file at
// mount time (readComposition → readFile(preset.path), lib/index.js:334) and
// ensureStanding re-stamps the file on every use (:1130-1160), so the edit is
// honored. The persona IS the system prompt (T8), so the marker rides the
// real prompt-assembly path. The mock's recorded requests[] prove delivery.
// T19 generalizes the delivery to BOTH persona scalars of the same file
// (MOCKROLE_BLOCK_SCALARS): the conductor persona row (`text: |-`, content
// indent 6 — src/system-prompt.ts renderPersonaIntoComposition) and the T11
// explore tool-subagent row (`persona: |-`, content indent 10 —
// src/concerto-preset.ts renderExplorePersonaIntoComposition). The explore
// marker is what lets the mock select the explore sub-script when the CHILD
// loop's requests arrive (the child inherits the persona from its tool
// config, so the marker rides the spawn provider's persona shadowing).
//
// ── T19 DEMO SCENARIO (FR-7, AC-4; plan task 19): "concerto-delegation-demo"
// The scripted dummy demo (PRD §2.2 — an ORCHESTRATED task, no real
// engineering problem): user asks "这个仓库的 README 讲了什么" and the FULL
// delegation chain is scripted through the two mock roles:
//   sisyphus step 1 → tool_call `explore` {description, prompt,
//     run_in_background:false} (the T11 binding's real parameter schema,
//     dsh-tool-subagent/lib/index.js:142-158) — foreground so the result
//     returns inside the same parent turn;
//   explore step 1  → tool_call `read` {file_path: <sandbox README>} (the
//     dsh-tool-fs read tool the explore child inherits from the parent roster
//     minus the T12 deny [write,edit]);
//   explore step 2  → text EXPLORE_FINDINGS (child turn settles);
//   sisyphus step 2 → text SISYPHUS_SUMMARY (parent turn/end).
// The driver seeds a fixture README into the sandbox project and asserts the
// four-event chain IN ORDER (report §14.4.4 — BUSINESS outcomes, not "the
// LLM called tool X"): (1) the explore tool_call in the parent JSONL, (2) the
// child session ran on the explore route AND the README bytes reached the
// explore model (the read tool result is verbatim in the next mock request),
// (3) the findings returned to sisyphus (parent tool/result AND they are
// verbatim in the parent's next mock request), (4) the summary text. The T16
// hard-blocks injection is reported as a BONUS observation (T20 owns AC-6).
//
// ── T20 ASSERTION-LAYER CLOSURE (AC-5/AC-6/AC-7; plan task 20) ──
// AC-5 lives in analyzeDemo as three named checks read off the LATEST
// request/header of BOTH session logs (T15 contract; a foreground one-shot
// child's descriptor omits the route — T19 note): the parent's route IS the
// sisyphus route, the child's IS the explore route, and the two DIFFER.
// AC-6 closes the T12/T13 e2e negatives as two DEDICATED scenarios (the demo
// scenario's semantics stay clean):
//   explore-write-denied (AC-6a): the mock scripts the explore child
//     hallucinating a `write` tool_call — write is NOT advertised (the T12
//     toolFilter deny is asserted on the child's request/header tools array)
//     — and the REAL tool runtime's errored tool result is asserted verbatim:
//     'Error: unknown tool "write"' (dsh-tools ToolNotFoundError :2428 +
//     toolErrorResult :3472-3482 of the installed rc.6), plus the business
//     outcome that the target file never appears on disk.
//   explore-nested-delegation-denied (AC-6b): the mock scripts the explore
//     child (depth 1) calling `explore` again; the per-start depth gate
//     rejects BEFORE any grandchild exists — asserted verbatim:
//     'Error: subagent depth 2 exceeds maxDepth 1' (dsh-subagent
//     SubagentDepthError :470 + the same toolErrorResult wrap), the
//     delegation tool's visibility at the cap is asserted as OBSERVED
//     (T13 contract: "the tool stays visible at the cap"), and no session
//     with parentSession = the child id may exist.
// AC-7: every scenario verdict carries `assertions` (the check names, in
// order) alongside `checks`/`failed`, and the overall verdict stays
// CI-parseable {result:"PASS"|"FAIL", scenarios:[...]} on stdout.
// Mutation QA (plan T20 failure half) is hermetic in runAnalysisSelfTest:
// swapped routes input / collapsed equal routes (the model-route input
// mutation), a fabricated log without the unknown-tool error, and one
// without the depth error each FAIL on their own named check.
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
//   node tests/e2e/drive.mjs               run ALL scenarios (hello + demo +
//                                          the two AC-6 negatives), print verdict JSON
//   node tests/e2e/drive.mjs --self-test   run the analysis logic against
//                                          fabricated logs only (no spawn)
// Env:
//   DSH_E2E_DIGEST_TARGET  digest this dir instead of ~/.dsh (negative demo)
//   DSH_E2E_KEEP_SANDBOX=1 keep the sandbox for postmortem inspection
//   DSH_E2E_*_TIMEOUT_MS   boot / scenario / install budgets
//   DSH_E2E_DEMO_SKIP_EXPLORE=1  T19 failure QA: drop the explore role from
//                                the demo script — the delegation chain MUST
//                                break and the verdict MUST name link 2
// Exit: 0 on PASS, 1 on FAIL (and 1 if --self-test finds the analysis lying).

import { createHash, randomUUID } from 'node:crypto'
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

// ── DEMO scenario constants (T19, FR-7/AC-4 — see the header's T19 section) ──
// The user's question (PRD §2.2's orchestrated dummy task, verbatim).
const DEMO_PROMPT = '这个仓库的 README 讲了什么'
// The fixture README the driver seeds into the sandbox project. The sentinel
// fragment is what link 2 asserts INSIDE the explore model's request bytes.
const DEMO_README_CONTENT = 'This is the omo-dsh concerto MVP fixture project\n'
const DEMO_README_SENTINEL = 'concerto MVP fixture project'
// What the explore child reports back (link 3 asserts it lands in the
// parent's tool/result AND in the parent's next request to the mock).
const EXPLORE_FINDINGS = `MOCK-EXPLORE-FINDINGS-9c2e4b: README.md says — ${DEMO_README_SENTINEL}`
// The conductor's final summary (link 4).
const SISYPHUS_SUMMARY = 'MOCK-SISYPHUS-SUMMARY-5a1d8c: the README says this is the omo-dsh concerto MVP fixture project'

/**
 * The two-role demo script (MockStep sequences; one step consumed per request
 * per role — the T17 cursor semantics). Built AFTER the sandbox exists so the
 * read step carries the fixture's absolute path.
 * DSH_E2E_DEMO_SKIP_EXPLORE=1 deletes the explore role: the child's request
 * then reaches the mock as an UNKNOWN role (HTTP 400), the chain breaks, and
 * the analysis MUST FAIL naming link 2 (the failure-QA half of T19).
 */
function demoScript(sandbox) {
  const readmePath = join(sandbox.project, 'README.md')
  const script = {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: 'Read project README',
          prompt: `Read the file README.md in the current project directory (absolute path: ${readmePath}) and report what it says.`,
          // foreground: the conductor's next step needs the findings.
          run_in_background: false,
        },
      },
      { type: 'text', text: SISYPHUS_SUMMARY },
    ],
    explore: [
      { type: 'tool_call', name: 'read', arguments: { file_path: readmePath } },
      { type: 'text', text: EXPLORE_FINDINGS },
    ],
  }
  if (process.env.DSH_E2E_DEMO_SKIP_EXPLORE === '1') delete script.explore
  return script
}

// ── T20 AC-6 NEGATIVE scenario constants (see the header's T20 section) ─────
// The verbatim rejection contracts (installed rc.6, grep-verified):
//   unknown tool:  dsh-tools ToolNotFoundError `unknown tool "${name}"`
//                  (lib/index.js:2428) → toolErrorResult `Error: ${message}`
//                  (:3472-3482) → 'Error: unknown tool "write"'.
//   depth cap:     dsh-subagent SubagentDepthError `subagent depth
//                  ${attempted} exceeds maxDepth ${max}` (lib/index.js:470)
//                  → same wrap → 'Error: subagent depth 2 exceeds maxDepth 1'.
const UNKNOWN_TOOL_WRITE_RESULT = 'Error: unknown tool "write"'
const DEPTH_CAP_RESULT = 'Error: subagent depth 2 exceeds maxDepth 1'

// AC-6a: the explore child hallucinates a `write` call (the mock may script a
// tool the child was never offered — that IS the hallucination-resistance
// test). Sentinels let the parent-closure check read business outcomes.
const WRITE_DENY_PROMPT = 'e2e write-deny: ask explore to create a file and report what happened'
const WRITE_TARGET_NAME = 'MOCK-WRITE-DENIED-TARGET.txt'
const EXPLORE_WRITE_NOTE = 'MOCK-EXPLORE-WRITE-DENIED-3f7b1e: the write call was rejected (unknown tool)'
const SISYPHUS_WRITE_SUMMARY = 'MOCK-SISYPHUS-WRITE-SUMMARY-8d2c6a: explore could not write — the read-only restriction held'

// AC-6b: the explore child (delegationDepth 1) attempts a nested delegation.
const NESTED_DENY_PROMPT = 'e2e depth-cap: ask explore to delegate a sub-task and report what happened'
const EXPLORE_NESTED_NOTE = 'MOCK-EXPLORE-NESTED-DENIED-6b4f2d: the nested delegation was rejected (depth cap)'
const SISYPHUS_NESTED_SUMMARY = 'MOCK-SISYPHUS-NESTED-SUMMARY-1e9a5b: explore could not delegate — the depth cap held'

/** AC-6a script: sisyphus delegates; the child calls `write`, then reports. */
function writeDeniedScript(sandbox) {
  const targetPath = join(sandbox.project, WRITE_TARGET_NAME)
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: 'Attempt a project write',
          prompt: `Use the write tool to create the file ${targetPath} with any content, then report exactly what happened.`,
          run_in_background: false,
        },
      },
      { type: 'text', text: SISYPHUS_WRITE_SUMMARY },
    ],
    explore: [
      {
        type: 'tool_call',
        name: 'write',
        arguments: { file_path: targetPath, content: 'this file must never exist\n' },
      },
      { type: 'text', text: EXPLORE_WRITE_NOTE },
    ],
  }
}

/** AC-6b script: sisyphus delegates; the child calls `explore` (nested). */
function nestedDelegationScript() {
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: 'Attempt a nested delegation',
          prompt: 'Use the explore tool to delegate a further sub-task, then report exactly what happened.',
          run_in_background: false,
        },
      },
      { type: 'text', text: SISYPHUS_NESTED_SUMMARY },
    ],
    explore: [
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: 'nested probe',
          prompt: 'this delegation must be rejected by the depth cap',
          run_in_background: false,
        },
      },
      { type: 'text', text: EXPLORE_NESTED_NOTE },
    ],
  }
}

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
// Transport-adaptive (T9): `boot.transport` is 'rc6-flat' (readiness line
// without ?token=) or 'web-remote' (0.1.2: token→cookie handshake completed
// at boot; Typert Remote endpoints). The rc6-flat wire below is byte-identical
// to the pre-T9 driver (same URL, same envelope, no auth headers).

let rpcCounter = 0
let warnedGetSetCookieFallback = false

const RPC_TIMEOUT_MS = Number(process.env.DSH_E2E_RPC_TIMEOUT_MS ?? 30_000)

async function rpc(boot, method, payload) {
  const rpcId = `e2e-${method}-${++rpcCounter}`
  const response = await fetch(`http://127.0.0.1:${boot.port}/api/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(boot.cookie === undefined ? {} : { cookie: boot.cookie }),
    },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
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

/**
 * 0.1.2 browser-session handshake (browser-auth.ts:240-282): the launch token
 * from the readiness line is accepted ONLY on the index request — a valid
 * root query token mints the authority-bound dsh-auth-* cookie (303 +
 * Set-Cookie); /api then verifies that cookie (:289-302, called from
 * rpc-host.ts:96-99). Returns the `name=value` pair to send as the cookie
 * header on every subsequent /api call.
 */
async function mintBrowserSessionCookie(port, token) {
  const response = await fetch(`http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  })
  const text = await response.text()
  if (response.status !== 303) {
    throw new Error(`browser-session handshake: expected 303, got HTTP ${response.status}: ${text.slice(0, 200)}`)
  }
  let setCookies
  if (typeof response.headers.getSetCookie === 'function') {
    setCookies = response.headers.getSetCookie()
  } else {
    if (!warnedGetSetCookieFallback) {
      warnedGetSetCookieFallback = true
      console.warn('drive: Node without getSetCookie (multi-cookie fallback unreliable)')
    }
    setCookies = [response.headers.get('set-cookie') ?? '']
  }
  const pair = setCookies
    .map((value) => value.split(';', 1)[0])
    .find((value) => value.startsWith('dsh-auth-'))
  if (pair === undefined) {
    throw new Error('browser-session handshake: no dsh-auth-* cookie minted')
  }
  return pair
}

/**
 * The llm.providers contract on either transport. rc.6: one flat call whose
 * value already joins registered routes with the configurable directory
 * server-side. 0.1.2: the client's own two Remote calls, joined by the same
 * rule the Web UI's Models page uses (joinProviderDirectory,
 * ui-settings-models/src/client/store.ts:49-73) — a directory entry is
 * active ⟺ its provider id is a registered route, and registered routes with
 * no directory entry append as active rows. The joined value keeps the rc.6
 * shape {providers:[{provider,displayName,settingsNs,settingsPath,active,
 * declared?}]}, so every downstream assertion stays transport-agnostic.
 */
async function listProvidersJoined(boot) {
  if (boot.transport === 'rc6-flat') return rpc(boot, 'llm.providers', {})
  const [registered, directory] = await Promise.all([
    rpc(boot, 'llm/listProviders', { args: {} }),
    rpc(boot, 'llm/listConfigurableProviders', { args: {} }),
  ])
  const active = new Set(registered.map((provider) => provider.id))
  const declared = new Set(directory.map((entry) => entry.provider))
  const providers = directory.map((entry) => ({
    provider: entry.provider,
    displayName: entry.displayName,
    settingsNs: entry.settingsNs,
    settingsPath: [...entry.settingsPath],
    active: active.has(entry.provider),
    ...(entry.declared === undefined ? {} : { declared: entry.declared }),
  }))
  for (const provider of registered) {
    if (declared.has(provider.id)) continue
    providers.push({
      provider: provider.id,
      displayName: provider.name,
      settingsNs: '',
      settingsPath: [],
      active: true,
      ...(provider.declared === undefined ? {} : { declared: provider.declared }),
    })
  }
  return { providers }
}

/** session.create → (0.1.2) session/create {args:{request}}. Same value. */
async function sessionCreate(boot, request) {
  if (boot.transport === 'rc6-flat') return rpc(boot, 'session.create', request)
  return rpc(boot, 'session/create', { args: { request } })
}

/** session.prompt → (0.1.2) session/prompt {args:{request}} (+requestId). */
async function sessionPrompt(boot, request) {
  if (boot.transport === 'rc6-flat') return rpc(boot, 'session.prompt', request)
  return rpc(boot, 'session/prompt', { args: { request: { requestId: randomUUID(), ...request } } })
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

/**
 * Boot dsh; resolve with {child, port, transport, cookie?, log()} once the
 * readiness line lands — and, on the 0.1.2 transport (the line carries
 * ?token=<launch-token>), once the token→cookie handshake has completed.
 */
function bootDsh(sandbox, patchPath) {
  return new Promise((resolveBoot, rejectBoot) => {
    const child = spawn(
      'dsh',
      ['--profile', PROFILE, '--patch', './cordis.yml', '--patch', patchPath, '--port', '0'],
      { cwd: REPO_ROOT, env: scenarioEnv(sandbox) },
    )
    let log = ''
    let readinessHandled = false
    const bootLogPath = join(sandbox.root, 'boot.log')
    const onData = (chunk) => {
      log += chunk.toString('utf8')
      writeFileSync(bootLogPath, log)
      if (readinessHandled) return
      const match = /dsh web: http:\/\/127\.0\.0\.1:(\d+)(?:\/\?token=([A-Za-z0-9_-]+))?/.exec(log)
      if (match === null) return
      readinessHandled = true
      const port = Number(match[1])
      const token = match[2]
      if (token === undefined) {
        // rc.6 transport: flat endpoints, no auth beyond the loopback fence.
        resolveBoot({ child, port, transport: 'rc6-flat', log: () => log })
        return
      }
      // 0.1.2 transport: mint the browser-session cookie before any /api call.
      mintBrowserSessionCookie(port, token).then(
        (cookie) => resolveBoot({ child, port, transport: 'web-remote', cookie, log: () => log }),
        rejectBoot,
      )
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

/**
 * Where each role's marker goes inside the SAME materialized composition file
 * ($DSH_HOME/.agent-presets/concerto/agent.cordis.yml). `needle` is the block
 * scalar header of that role's persona; `indent` is the content indent the
 * renderer used (system-prompt.ts: 6 spaces under the persona row's `text:`;
 * concerto-preset.ts: 10 spaces under the explore row's nested `persona:`).
 * Both needles are unique in the materialized file (verified against the
 * template: only the persona row carries `text:`, only the T11 explore row
 * carries `persona:`).
 */
const MOCKROLE_BLOCK_SCALARS = {
  sisyphus: { needle: 'text: |-', indent: '      ' },
  explore: { needle: 'persona: |-', indent: '          ' },
}

function appendMockRoleMarker(sandbox, role) {
  const spec = MOCKROLE_BLOCK_SCALARS[role]
  if (spec === undefined) {
    throw new Error(`no MOCKROLE block-scalar mapping for role '${role}'`)
  }
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
  if (!text.includes(spec.needle)) {
    throw new Error(`materialized concerto preset has no \`${spec.needle}\` block scalar for role '${role}'`)
  }
  const markerLine = `${spec.indent}MOCKROLE=${role}\n`
  if (text.includes(`MOCKROLE=${role}`)) return // idempotent
  writeFileSync(compositionPath, text.replace(spec.needle, `${spec.needle}\n${markerLine}`))
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
 * Tool names advertised to the model in a session's LATEST request/header
 * (dsh-agent-loop appends header.tools only when non-empty —
 * lib/index.js:706,733). Returns undefined when the log carries no
 * request/header at all (a missing channel must FAIL, not vacuously pass).
 */
export function advertisedToolNames(events) {
  let names
  for (const event of events) {
    if (event.type !== 'request/header') continue
    const tools = event.data?.header?.tools
    names = Array.isArray(tools)
      ? tools
          .map((tool) => tool?.function?.name ?? tool?.name)
          .filter((name) => typeof name === 'string')
      : []
  }
  return names
}

/**
 * Flatten a session's tool/result events into {callId, isError, text} parts
 * (the nested shape: data.message.content[] entries of type 'tool-result'
 * whose own content[] carries the text parts — see the T19 verbatim sample).
 */
export function toolResultParts(events) {
  const parts = []
  for (const event of events) {
    if (event.type !== 'tool/result') continue
    const content = event.data?.message?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type !== 'tool-result') continue
      const inner = Array.isArray(part.content) ? part.content : []
      const text = inner
        .filter((piece) => piece?.type === 'text' && typeof piece.text === 'string')
        .map((piece) => piece.text)
        .join('\n')
      parts.push({ callId: part.toolCallId, isError: part.isError === true, text })
    }
  }
  return parts
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

/**
 * The DEMO scenario assertions (T19, FR-7/AC-4). The four chain links are
 * asserted as BUSINESS outcomes (report §14.4.4): bytes and events that only
 * exist when the delegation actually happened, in order — never merely "the
 * LLM emitted a tool_call".
 * `log` = the PARENT (sisyphus) session log; `childLog` = the explore child's
 * own session.jsonl (header.origin 'subagent', header.parentSession = parent
 * id — dsh-subagent childSessionMeta); `requests` = the mock's recorded
 * request channel (roles + raw bodies, in arrival order).
 */
export function analyzeDemo({ log, childLog, requests, providersJson, bootLog }, routes) {
  const events = log?.events ?? []
  const childEvents = childLog?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const exploreRequests = requests.filter((request) => request.role === 'explore')

  // AC-5 evidence: the LATEST request/header of BOTH logs (T15 contract).
  const parentRoute = requestHeaderRoute(events)

  // Link 1 evidence: the parent's explore tool/call with contract args.
  const exploreCall = events.find((event) => event.type === 'tool/call' && event.data?.name === 'explore')
  let exploreCallArgs = {}
  try {
    exploreCallArgs = JSON.parse(exploreCall?.data?.arguments ?? '{}')
  } catch {
    // unparseable model output fails link 1 below
  }

  // Link 2 evidence: the child ran on the explore route and read the README.
  const childRoute = requestHeaderRoute(childEvents)
  const childReadCall = childEvents.find(
    (event) => event.type === 'tool/call' && event.data?.name === 'read',
  )
  const lastExploreBody = exploreRequests.length > 0
    ? JSON.stringify(exploreRequests[exploreRequests.length - 1].body)
    : ''

  // Link 3 evidence: the findings came back to the parent (log + wire).
  const exploreResult = events.find(
    (event) => event.type === 'tool/result' && eventText(event).includes(EXPLORE_FINDINGS),
  )
  const secondSisyphusBody = sisyphusRequests.length >= 2
    ? JSON.stringify(sisyphusRequests[1].body)
    : ''

  // Link 4 evidence: the summary, and an orderly turn end.
  const summaryMessage = events.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(SISYPHUS_SUMMARY),
  )
  const turnCompleted = events.some(
    (event) =>
      event.type === 'turn/end'
      && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
  )

  const checks = {
    pluginLoaded: bootLog.includes('[omo-agents] loaded'),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    exploreProviderActive: new RegExp(
      `"provider":"${routes.explore.provider}"[^}]*"active":true`,
    ).test(providersJson),
    parentSessionLogFound: log !== undefined,
    userQuestionRecorded: events.some(
      (event) => event.type === 'user/message' && eventText(event).includes(DEMO_PROMPT),
    ),
    // LINK 1: sisyphus decided and called the delegation tool with a
    // well-formed contract (description + prompt naming the README), on the
    // sisyphus route.
    link1SisyphusCalledExploreTool:
      exploreCall !== undefined
      && typeof exploreCallArgs.description === 'string'
      && typeof exploreCallArgs.prompt === 'string'
      && exploreCallArgs.prompt.includes('README.md')
      && sisyphusRequests.length >= 1
      && sisyphusRequests[0].body?.model === routes.sisyphus.model,
    // LINK 2: the explore child RAN — its own session exists under the
    // parent, on the explore route; it issued a `read` for the README; and
    // the README's bytes provably reached the explore model (the read tool
    // result is verbatim in the child's next request to the mock).
    link2ExploreRanAndReadReadme:
      childLog !== undefined
      && childLog.header?.origin === 'subagent'
      && String(childLog.header?.parentSession) === String(log?.header?.id)
      && childRoute !== undefined
      && childRoute.provider === routes.explore.provider
      && childRoute.model === routes.explore.model
      && childReadCall !== undefined
      && String(childReadCall.data?.arguments ?? '').includes('README.md')
      && exploreRequests.length >= 2
      && lastExploreBody.includes(DEMO_README_SENTINEL),
    // LINK 3: the child's findings returned to sisyphus — settled tool/result
    // in the parent log AND the findings verbatim in the parent's next
    // request (the result genuinely entered the conductor's model context).
    link3ExploreResultReturnedToSisyphus:
      exploreResult !== undefined
      && secondSisyphusBody.includes(EXPLORE_FINDINGS),
    // LINK 4: sisyphus closed the loop with the summary, turn completed.
    link4SisyphusSummarizedFindings: summaryMessage !== undefined && turnCompleted,
    // ORDER (AC-4): the links are ordered in BOTH observation channels — the
    // parent JSONL seqs (call < result < summary) and the mock arrival order
    // (sisyphus#1 < explore#… < sisyphus-last).
    chainObservedInOrder:
      exploreCall !== undefined
      && exploreResult !== undefined
      && summaryMessage !== undefined
      && exploreCall.seq < exploreResult.seq
      && exploreResult.seq < summaryMessage.seq
      && sisyphusRequests.length >= 2
      && exploreRequests.length >= 1
      && requests.indexOf(sisyphusRequests[0]) < requests.indexOf(exploreRequests[0])
      && requests.indexOf(exploreRequests[exploreRequests.length - 1])
        < requests.indexOf(sisyphusRequests[sisyphusRequests.length - 1]),
    // Exact request accounting: 2 conductor + 2 child calls, nothing else
    // (a stray title/side request carrying a marker would consume a scripted
    // step and corrupt the chain — better to fail loud).
    mockSawExpectedRequestCounts:
      sisyphusRequests.length === 2 && exploreRequests.length === 2,
    // ── AC-5 (T20): the route pair is observable AND distinct. Read off the
    // LATEST request/header of BOTH session logs — the foreground one-shot
    // child's subagent/descriptor omits the route (T19 note), so the
    // executed route is the request/header, never the descriptor.
    routePairParentRequestHeaderIsSisyphus:
      parentRoute !== undefined
      && parentRoute.provider === routes.sisyphus.provider
      && parentRoute.model === routes.sisyphus.model,
    routePairChildRequestHeaderIsExplore:
      childRoute !== undefined
      && childRoute.provider === routes.explore.provider
      && childRoute.model === routes.explore.model,
    routePairDistinct:
      parentRoute !== undefined
      && childRoute !== undefined
      && (parentRoute.provider !== childRoute.provider
        || parentRoute.model !== childRoute.model),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  // Non-gating observations (T20 owns the AC-5/AC-6 assertion halves).
  // NOTE: a FOREGROUND (run_in_background:false) spawn produces a ONE-SHOT
  // child whose descriptor carries no agentProvider/agentModel (only
  // continuable descriptors persist the declared route — dsh-subagent
  // descriptor.d.ts OneShotSubagentDescriptorData vs Continuable). The
  // executed child route is gated in link 2 via request/header instead.
  const descriptor = childEvents.find((event) => event.type === 'subagent/descriptor')
  const bonus = {
    // T16's injection, observed in the child log (user/message sourced from
    // the omo-agents plugin — agent.inject() landing at a step boundary).
    hardBlocksInjectionObserved: childEvents.some(
      (event) =>
        event.type === 'user/message'
        && eventText(event).includes('"plugin":"omo-agents"'),
    ),
    // AC-5's raw pair (the assertion inputs, surfaced for the evidence log).
    routePair: { parent: parentRoute ?? null, child: childRoute ?? null },
    childDescriptor: descriptor?.data ?? null,
    mockRequestRoles: requests.map((request) => request.role),
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

/**
 * Shared preamble for the two AC-6 negative analyzers: the common givens
 * (plugin, providers, both session logs with proven lineage) plus the parent
 * closure (the child's note returned as the explore tool/result, the
 * conductor's summary, an orderly turn/end) and the request accounting.
 * Returns {events, childEvents, sisyphusRequests, exploreRequests, givens}.
 */
function negativeScenarioGivens({ log, childLog, requests, providersJson, bootLog }, routes, childNote, parentSummary) {
  const events = log?.events ?? []
  const childEvents = childLog?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const exploreRequests = requests.filter((request) => request.role === 'explore')
  const childResult = events.find(
    (event) => event.type === 'tool/result' && eventText(event).includes(childNote),
  )
  const summaryMessage = events.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(parentSummary),
  )
  const turnCompleted = events.some(
    (event) =>
      event.type === 'turn/end'
      && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
  )
  const givens = {
    pluginLoaded: bootLog.includes('[omo-agents] loaded'),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    exploreProviderActive: new RegExp(
      `"provider":"${routes.explore.provider}"[^}]*"active":true`,
    ).test(providersJson),
    parentSessionLogFound: log !== undefined,
    childSessionLogFound:
      childLog !== undefined
      && childLog.header?.origin === 'subagent'
      && String(childLog.header?.parentSession) === String(log?.header?.id),
    childOutcomeReturnedAndParentClosed:
      childResult !== undefined && summaryMessage !== undefined && turnCompleted,
    mockSawExpectedRequestCounts:
      sisyphusRequests.length === 2 && exploreRequests.length === 2,
  }
  return { events, childEvents, sisyphusRequests, exploreRequests, givens }
}

/**
 * AC-6a e2e negative (T12's toolFilter, closed at e2e). The mock scripts the
 * explore child HALLUCINATING a `write` tool_call — write is not advertised
 * to the child (the deny is asserted on the child's request/header tools
 * array) — and the REAL tool runtime's rejection is asserted verbatim:
 * 'Error: unknown tool "write"' as an isError tool result. The business
 * outcome (report §14.4.4) is that the target file never appears on disk.
 * `writeTargetPath` is the sandbox path the script aimed the write at.
 */
export function analyzeExploreWriteDenied(
  { log, childLog, requests, providersJson, bootLog, writeTargetPath },
  routes,
) {
  const { events, childEvents, givens } = negativeScenarioGivens(
    { log, childLog, requests, providersJson, bootLog },
    routes,
    EXPLORE_WRITE_NOTE,
    SISYPHUS_WRITE_SUMMARY,
  )
  const toolNames = advertisedToolNames(childEvents)
  const results = toolResultParts(childEvents)
  const writeCall = childEvents.find(
    (event) => event.type === 'tool/call' && event.data?.name === 'write',
  )
  const checks = {
    ...givens,
    // The deny is wire-visible BEFORE the attempt: the child's advertised
    // schema contains zero write/edit entries (T12's contract half).
    childAdvertisedToolsExcludeWriteEdit:
      toolNames !== undefined
      && toolNames.length > 0
      && !toolNames.includes('write')
      && !toolNames.includes('edit'),
    // THE negative: the hallucinated write is dispatched and the runtime
    // rejects it with the verbatim unknown-tool contract (T12's other half).
    writeAttemptRejectedWithUnknownTool:
      writeCall !== undefined
      && results.some(
        (part) => part.isError && part.text === UNKNOWN_TOOL_WRITE_RESULT,
      ),
    // Business outcome: no bytes on disk (the sandbox path the mock aimed at).
    writeTargetAbsentOnDisk:
      typeof writeTargetPath === 'string' && !existsSync(writeTargetPath),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    childAdvertisedToolNames: toolNames ?? null,
    childToolResults: results,
    writeTargetPath: writeTargetPath ?? null,
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

/**
 * AC-6b e2e negative (T13's depth cap, closed at e2e). The mock scripts the
 * explore child (delegationDepth 1) calling `explore` again. T13's contract:
 * the delegation tool STAYS VISIBLE at the cap (asserted as observed), and
 * the per-start depth gate rejects BEFORE any grandchild exists with the
 * verbatim 'Error: subagent depth 2 exceeds maxDepth 1'. `allLogs` is every
 * session log in the sandbox — no header.parentSession may equal the child
 * id.
 */
export function analyzeExploreNestedDelegationDenied(
  { log, childLog, allLogs, requests, providersJson, bootLog },
  routes,
) {
  const { events, childEvents, givens } = negativeScenarioGivens(
    { log, childLog, requests, providersJson, bootLog },
    routes,
    EXPLORE_NESTED_NOTE,
    SISYPHUS_NESTED_SUMMARY,
  )
  const toolNames = advertisedToolNames(childEvents)
  const results = toolResultParts(childEvents)
  const nestedCall = childEvents.find(
    (event) => event.type === 'tool/call' && event.data?.name === 'explore',
  )
  const checks = {
    ...givens,
    // Documented observed behavior (T13 README contract): `explore` remains
    // model-visible at depth 1 — rejection is per attempted start, not by
    // hiding the tool.
    delegationToolVisibleAtDepthCap:
      toolNames !== undefined && toolNames.includes('explore'),
    // THE negative: the nested attempt's errored tool result, verbatim.
    nestedDelegationRejectedWithDepthError:
      nestedCall !== undefined
      && results.some((part) => part.isError && part.text === DEPTH_CAP_RESULT),
    // The gate fires BEFORE any child exists: no grandchild session log.
    noGrandchildSessionCreated:
      childLog !== undefined
      && Array.isArray(allLogs)
      && !allLogs.some(
        (candidate) =>
          String(candidate.header?.parentSession) === String(childLog.header?.id),
      ),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    childAdvertisedToolNames: toolNames ?? null,
    childToolResults: results,
    grandchildLogs: Array.isArray(allLogs)
      ? allLogs
          .filter(
            (candidate) =>
              childLog !== undefined
              && String(candidate.header?.parentSession) === String(childLog.header?.id),
          )
          .map((candidate) => candidate.path)
      : null,
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
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

// ── fabricated DEMO logs (the demo analysis must earn its PASS the same way)

const FABRICATED_PARENT_ID = 'session-fabricated-parent'
const FABRICATED_CHILD_ID = 'session-fabricated-child'

function fabricatedDemoRequests(routes) {
  return [
    { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 10 },
    { role: 'explore', body: { model: routes.explore.model, messages: [{ role: 'system', content: 'MOCKROLE=explore' }] }, receivedAt: 20 },
    {
      role: 'explore',
      body: {
        model: routes.explore.model,
        messages: [
          { role: 'system', content: 'MOCKROLE=explore' },
          { role: 'user', content: `read result: This is the omo-dsh ${DEMO_README_SENTINEL}` },
        ],
      },
      receivedAt: 30,
    },
    {
      role: 'sisyphus',
      body: {
        model: routes.sisyphus.model,
        messages: [
          { role: 'system', content: 'MOCKROLE=sisyphus' },
          { role: 'user', content: `tool result: ${EXPLORE_FINDINGS}` },
        ],
      },
      receivedAt: 40,
    },
  ]
}

function fabricatedGoodDemoParentLog(routes) {
  return {
    path: '/fabricated/parent/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: DEMO_PROMPT }] } },
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
          callId: 'mock-llm-tool-1',
          name: 'explore',
          arguments: JSON.stringify({ description: 'Read project README', prompt: 'Read README.md and report', run_in_background: false }),
        },
      },
      {
        seq: 4,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: EXPLORE_FINDINGS }], isError: false }] } },
      },
      { seq: 5, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: SISYPHUS_SUMMARY }] } } },
      { seq: 6, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedGoodDemoChildLog(routes) {
  return {
    path: '/fabricated/child/session.jsonl',
    header: {
      type: 'session',
      id: FABRICATED_CHILD_ID,
      origin: 'subagent',
      parentSession: FABRICATED_PARENT_ID,
      delegationDepth: 1,
    },
    events: [
      {
        seq: 0,
        type: 'subagent/descriptor',
        data: { version: 2, mode: 'continuable', provider: 'spawn', label: 'Read project README', agentProvider: routes.explore.provider, agentModel: routes.explore.model },
      },
      {
        seq: 1,
        type: 'request/header',
        data: { header: { config: { provider: routes.explore.provider, model: routes.explore.model } }, reason: 'initial' },
      },
      {
        seq: 2,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1', name: 'read', arguments: JSON.stringify({ file_path: '/fabricated/project/README.md' }) },
      },
      { seq: 3, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: EXPLORE_FINDINGS }] } } },
      { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedGoodDemoInput(routes) {
  return {
    log: fabricatedGoodDemoParentLog(routes),
    childLog: fabricatedGoodDemoChildLog(routes),
    requests: fabricatedDemoRequests(routes),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: '[omo-agents] loaded',
  }
}

// ── fabricated AC-6 NEGATIVE logs (both negative analyses must earn PASS) ──

function fabricatedNegativeParentLog(routes, prompt, childNote, parentSummary) {
  return {
    path: '/fabricated/negative-parent/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: prompt }] } },
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
          callId: 'mock-llm-tool-1',
          name: 'explore',
          arguments: JSON.stringify({ description: 'd', prompt: 'p', run_in_background: false }),
        },
      },
      {
        seq: 4,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: childNote }], isError: false }] } },
      },
      { seq: 5, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: parentSummary }] } } },
      { seq: 6, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedNegativeChildLog(routes, attemptName, attemptArgs, rejectionText, childNote) {
  return {
    path: '/fabricated/negative-child/session.jsonl',
    header: {
      type: 'session',
      id: FABRICATED_CHILD_ID,
      origin: 'subagent',
      parentSession: FABRICATED_PARENT_ID,
      delegationDepth: 1,
    },
    events: [
      {
        seq: 1,
        type: 'request/header',
        data: {
          header: {
            config: { provider: routes.explore.provider, model: routes.explore.model },
            tools: [
              { type: 'function', function: { name: 'read' } },
              { type: 'function', function: { name: 'grep' } },
              { type: 'function', function: { name: 'explore' } },
            ],
          },
          reason: 'initial',
        },
      },
      {
        seq: 2,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1', name: attemptName, arguments: JSON.stringify(attemptArgs) },
      },
      {
        seq: 3,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: rejectionText }], isError: true }] } },
      },
      { seq: 4, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: childNote }] } } },
      { seq: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

const FABRICATED_WRITE_TARGET = '/fabricated/project/MOCK-WRITE-DENIED-TARGET.txt'

function fabricatedGoodWriteInput(routes) {
  return {
    log: fabricatedNegativeParentLog(routes, WRITE_DENY_PROMPT, EXPLORE_WRITE_NOTE, SISYPHUS_WRITE_SUMMARY),
    childLog: fabricatedNegativeChildLog(
      routes,
      'write',
      { file_path: FABRICATED_WRITE_TARGET, content: 'x' },
      UNKNOWN_TOOL_WRITE_RESULT,
      EXPLORE_WRITE_NOTE,
    ),
    requests: fabricatedDemoRequests(routes),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: '[omo-agents] loaded',
    writeTargetPath: FABRICATED_WRITE_TARGET,
  }
}

function fabricatedGoodNestedInput(routes) {
  const childLog = fabricatedNegativeChildLog(
    routes,
    'explore',
    { description: 'nested probe', prompt: 'nested', run_in_background: false },
    DEPTH_CAP_RESULT,
    EXPLORE_NESTED_NOTE,
  )
  const log = fabricatedNegativeParentLog(routes, NESTED_DENY_PROMPT, EXPLORE_NESTED_NOTE, SISYPHUS_NESTED_SUMMARY)
  return {
    log,
    childLog,
    allLogs: [log, childLog],
    requests: fabricatedDemoRequests(routes),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: '[omo-agents] loaded',
  }
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

  // ── demo analysis: fabricated good log must PASS; each fabricated chain
  // break must FAIL naming its own link (T19's failure QA, hermetic half).
  const goodDemo = analyzeDemo(fabricatedGoodDemoInput(routes), routes)
  if (goodDemo.result !== 'PASS') {
    problems.push(`fabricated GOOD demo must PASS, got FAIL on: ${goodDemo.failed.join(', ')}`)
  }
  const demoDefectCases = [
    // THE T19 failure case: the explore step removed — the child never ran,
    // so the assertion must name link 2 (and only chain-derived checks may
    // join it).
    ['explore step removed (no child, no explore requests)', (input) => {
      input.childLog = undefined
      input.requests = input.requests.filter((request) => request.role !== 'explore')
      // without the findings the parent cannot produce them: the tool result
      // and the second sisyphus request lose the findings bytes too.
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          ? { ...event, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'text', text: 'Error: mock role unknown' }] } } }
          : event)
      input.requests = input.requests.map((request) =>
        request.role === 'sisyphus' && request.receivedAt === 40
          ? { ...request, body: { model: request.body.model, messages: [{ role: 'user', content: 'tool result: error' }] } }
          : request)
    }, 'link2ExploreRanAndReadReadme'],
    ['no explore tool_call in the parent log', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/call')
    }, 'link1SisyphusCalledExploreTool'],
    ['findings never returned to the parent', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
      input.requests = input.requests.map((request) =>
        request.role === 'sisyphus' && request.receivedAt === 40
          ? { ...request, body: { model: request.body.model, messages: [] } }
          : request)
    }, 'link3ExploreResultReturnedToSisyphus'],
    ['no final summary', (input) => {
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'assistant/message' && eventText(event).includes(SISYPHUS_SUMMARY)),
      )
    }, 'link4SisyphusSummarizedFindings'],
    ['out-of-order parent events', (input) => {
      const call = input.log.events.find((event) => event.type === 'tool/call')
      call.seq = 99 // the call landing AFTER the result/summary breaks the order
    }, 'chainObservedInOrder'],
    ['child on the wrong route', (input) => {
      input.childLog = fabricatedGoodDemoChildLog(routes)
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { config: { provider: 'wrong', model: 'wrong' } }, reason: 'initial' } }
          : event)
    }, 'link2ExploreRanAndReadReadme'],
  ]
  for (const [label, mutate, expectedCheck] of demoDefectCases) {
    const input = fabricatedGoodDemoInput(routes)
    mutate(input)
    const verdict = analyzeDemo(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated demo defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── AC-5 mutation QA (plan T20 failure (a)): mutate the MODEL-ROUTE INPUT
  // — resolveModelRoutes()' output is exactly what the settings.yaml
  // model-route rows feed — and the route-pair checks must fail.
  // (a1) swapped routes: both membership checks must fail.
  const swappedRoutes = { sisyphus: routes.explore, explore: routes.sisyphus }
  const swappedVerdict = analyzeDemo(fabricatedGoodDemoInput(routes), swappedRoutes)
  if (
    swappedVerdict.result !== 'FAIL'
    || !swappedVerdict.failed.includes('routePairParentRequestHeaderIsSisyphus')
    || !swappedVerdict.failed.includes('routePairChildRequestHeaderIsExplore')
  ) {
    problems.push(`AC-5 mutation "routes swapped" must FAIL with both route-pair membership checks, got ${swappedVerdict.result} (${swappedVerdict.failed.join(', ')})`)
  }
  // (a2) collapsed routes (both agents resolve to the SAME route) with both
  // logs observing that same route: ONLY routePairDistinct may fail — the
  // isolation proves the distinctness check is the one that lies.
  const collapsedRoutes = { sisyphus: routes.sisyphus, explore: routes.sisyphus }
  const collapsedInput = fabricatedGoodDemoInput(routes)
  collapsedInput.childLog.events = collapsedInput.childLog.events.map((event) =>
    event.type === 'request/header'
      ? { ...event, data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' } }
      : event)
  const collapsedVerdict = analyzeDemo(collapsedInput, collapsedRoutes)
  if (
    collapsedVerdict.result !== 'FAIL'
    || !collapsedVerdict.failed.includes('routePairDistinct')
    || collapsedVerdict.failed.includes('routePairParentRequestHeaderIsSisyphus')
    || collapsedVerdict.failed.includes('routePairChildRequestHeaderIsExplore')
  ) {
    problems.push(`AC-5 mutation "routes collapsed to equal" must FAIL with ONLY routePairDistinct among the pair checks, got ${collapsedVerdict.result} (${collapsedVerdict.failed.join(', ')})`)
  }

  // ── AC-6a self-test (plan T20 failure (b)): the fabricated good input must
  // PASS; a fabricated log WITHOUT the unknown-tool error must FAIL on
  // writeAttemptRejectedWithUnknownTool; likewise for the other two checks.
  const goodWrite = analyzeExploreWriteDenied(fabricatedGoodWriteInput(routes), routes)
  if (goodWrite.result !== 'PASS') {
    problems.push(`fabricated GOOD write-denied must PASS, got FAIL on: ${goodWrite.failed.join(', ')}`)
  }
  const writeDefectCases = [
    ['write attempt not rejected (success instead of unknown-tool error)', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          ? { ...event, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: 'file written' }], isError: false }] } } }
          : event)
    }, 'writeAttemptRejectedWithUnknownTool'],
    ['write advertised in the child tool schema', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { ...event.data.header, tools: [...event.data.header.tools, { type: 'function', function: { name: 'write' } }] } } }
          : event)
    }, 'childAdvertisedToolsExcludeWriteEdit'],
    ['write target landed on disk', (input) => {
      input.writeTargetPath = fileURLToPath(import.meta.url) // this very file exists
    }, 'writeTargetAbsentOnDisk'],
    ['child note never returned to the parent', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
    }, 'childOutcomeReturnedAndParentClosed'],
  ]
  for (const [label, mutate, expectedCheck] of writeDefectCases) {
    const input = fabricatedGoodWriteInput(routes)
    mutate(input)
    const verdict = analyzeExploreWriteDenied(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated write-denied defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── AC-6b self-test (plan T20 failure (c)): good input PASSes; a
  // fabricated log WITHOUT the depth error FAILs on
  // nestedDelegationRejectedWithDepthError; a grandchild session FAILs on
  // noGrandchildSessionCreated; a hidden delegation tool FAILs on
  // delegationToolVisibleAtDepthCap.
  const goodNested = analyzeExploreNestedDelegationDenied(fabricatedGoodNestedInput(routes), routes)
  if (goodNested.result !== 'PASS') {
    problems.push(`fabricated GOOD nested-delegation-denied must PASS, got FAIL on: ${goodNested.failed.join(', ')}`)
  }
  const nestedDefectCases = [
    ['nested delegation not rejected (no depth error)', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          ? { ...event, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: 'nested run completed' }], isError: false }] } } }
          : event)
    }, 'nestedDelegationRejectedWithDepthError'],
    ['grandchild session exists', (input) => {
      input.allLogs = [
        ...input.allLogs,
        {
          path: '/fabricated/grandchild/session.jsonl',
          header: { type: 'session', id: 'session-fabricated-grandchild', origin: 'subagent', parentSession: FABRICATED_CHILD_ID, delegationDepth: 2 },
          events: [],
        },
      ]
    }, 'noGrandchildSessionCreated'],
    ['delegation tool hidden at the cap', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { ...event.data.header, tools: event.data.header.tools.filter((tool) => tool.function.name !== 'explore') } } }
          : event)
    }, 'delegationToolVisibleAtDepthCap'],
    ['child note never returned to the parent', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
    }, 'childOutcomeReturnedAndParentClosed'],
  ]
  for (const [label, mutate, expectedCheck] of nestedDefectCases) {
    const input = fabricatedGoodNestedInput(routes)
    mutate(input)
    const verdict = analyzeExploreNestedDelegationDenied(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated nested-delegation defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }
  return problems
}

// ── scenario definitions ─────────────────────────────────────────────────────
// Each scenario runs fully isolated: its own sandbox, its own mock server
// (per-role cursors stay scenario-scoped), its own dsh boot. `roles` lists
// the MOCKROLE markers to deliver into the materialized preset; `seed` runs
// before the mock starts (fixtures the script points at); `script(sandbox)`
// builds the mock script (absolute fixture paths need the sandbox).

const SCENARIOS = [
  {
    name: 'hello',
    prompt: HELLO_PROMPT,
    roles: ['sisyphus'],
    script: () => HELLO_SCRIPT,
    analyze: analyzeHello,
  },
  {
    name: 'concerto-delegation-demo',
    prompt: DEMO_PROMPT,
    roles: ['sisyphus', 'explore'],
    seed: (sandbox) => {
      writeFileSync(join(sandbox.project, 'README.md'), DEMO_README_CONTENT)
    },
    script: demoScript,
    analyze: analyzeDemo,
  },
  {
    // AC-6a (T20): the explore child hallucinates a write; the T12 deny
    // rejects it verbatim and no bytes land on disk.
    name: 'explore-write-denied',
    prompt: WRITE_DENY_PROMPT,
    roles: ['sisyphus', 'explore'],
    script: writeDeniedScript,
    analysisInput: (sandbox) => ({
      writeTargetPath: join(sandbox.project, WRITE_TARGET_NAME),
    }),
    analyze: analyzeExploreWriteDenied,
  },
  {
    // AC-6b (T20): the explore child (depth 1) attempts a nested delegation;
    // the T13 cap rejects it verbatim before any grandchild exists.
    name: 'explore-nested-delegation-denied',
    prompt: NESTED_DENY_PROMPT,
    roles: ['sisyphus', 'explore'],
    script: nestedDelegationScript,
    analyze: analyzeExploreNestedDelegationDenied,
  },
]

/**
 * Run one scenario end-to-end. Returns the scenario verdict object; the
 * sandbox root is handed back for the caller's cleanup/digest accounting.
 */
async function runScenario(def, routes) {
  const sandbox = createSandbox()
  console.error(`drive: [${def.name}] sandbox ${sandbox.root}`)
  const server = await startMockLlmServer({ script: def.script(sandbox) })
  let child
  let scenario = { name: def.name, result: 'FAIL', failed: ['driver did not complete'] }
  try {
    const patchPath = seedSandbox(sandbox, routes, server.baseUrl)
    def.seed?.(sandbox) // fixtures land after seedSandbox mkdirs the project dir
    console.error(`drive: [${def.name}] stage 0 — dsh plugin add into the sandbox profile`)
    installPlugin(sandbox)

    console.error(`drive: [${def.name}] booting dsh --profile web --patch ./cordis.yml --patch <e2e> --port 0`)
    const boot = await bootDsh(sandbox, patchPath)
    child = boot.child
    console.error(`drive: [${def.name}] web ready on 127.0.0.1:${boot.port} (transport ${boot.transport})`)

    // The plugin sync materializes the concerto preset at boot; then the
    // MOCKROLE markers ride both personas into the system prompts (header).
    for (const role of def.roles) appendMockRoleMarker(sandbox, role)

    // Wiring proof for BOTH adapters (transport-adaptive; same contract).
    const providers = await listProvidersJoined(boot)
    const providersJson = JSON.stringify(providers)

    const created = await sessionCreate(boot, {
      cwd: sandbox.project,
      agentPreset: CONCERTO_PRESET_ID,
    })
    console.error(`drive: [${def.name}] session created ${created.sessionId} (preset ${created.agentPreset ?? '?'})`)
    await sessionPrompt(boot, {
      sessionId: created.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: def.prompt }],
    })
    console.error(`drive: [${def.name}] prompt accepted; awaiting turn/end on the session JSONL`)
    const log = await awaitTurnEnd(sandbox, created.sessionId)
    const logPath = log?.path

    await stopDsh(child)
    child = undefined
    // SIGTERM flushes the write-behind batcher; re-read the final bytes of
    // EVERY session log (the demo's child log settles with the parent).
    const allLogs = findSessionLogs(join(sandbox.dshHome, 'sessions'))
    const finalLog = allLogs.find(
      (candidate) => String(candidate.header.id) === String(created.sessionId),
    )
    const childLog = allLogs.find(
      (candidate) =>
        candidate.header.origin === 'subagent'
        && String(candidate.header.parentSession) === String(created.sessionId),
    )

    const analysis = def.analyze(
      {
        log: finalLog ?? log,
        childLog,
        allLogs,
        requests: server.requests,
        providersJson,
        bootLog: boot.log(),
        ...(def.analysisInput?.(sandbox) ?? {}),
      },
      routes,
    )
    // Timing notes: mock arrival offsets relative to the first request.
    const t0 = server.requests[0]?.receivedAt ?? 0
    const timeline = server.requests.map((request) => ({
      role: request.role,
      model: request.body?.model,
      atMs: request.receivedAt - t0,
    }))
    scenario = {
      name: def.name,
      sessionId: created.sessionId,
      logPath,
      childLogPath: childLog?.path,
      timeline,
      // AC-7: every assertion BY NAME, in check order — CI can list what ran
      // without parsing the checks object.
      assertions: Object.keys(analysis.checks ?? {}),
      ...analysis,
    }
  } catch (error) {
    scenario = { name: def.name, result: 'FAIL', failed: [`driver error: ${error.message}`] }
  } finally {
    if (child !== undefined) await stopDsh(child)
    await server.close()
  }
  return { scenario, sandboxRoot: sandbox.root }
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

  const scenarios = []
  const sandboxRoots = []
  for (const def of SCENARIOS) {
    const { scenario, sandboxRoot } = await runScenario(def, routes)
    scenarios.push(scenario)
    sandboxRoots.push(sandboxRoot)
  }

  const afterDigest = digestConfigDir(digestTarget)
  const realDshUntouched = beforeDigest === afterDigest
  const scenariosPass = scenarios.every((scenario) => scenario.result === 'PASS')
  const result = scenariosPass && realDshUntouched ? 'PASS' : 'FAIL'

  if (process.env.DSH_E2E_KEEP_SANDBOX !== '1' && result === 'PASS') {
    for (const root of sandboxRoots) {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true })
    }
  } else {
    for (const root of sandboxRoots) {
      if (existsSync(root)) console.error(`drive: sandbox kept at ${root}`)
    }
  }

  console.log(
    JSON.stringify({
      result,
      scenarios,
      realDshUntouched,
      digestTarget,
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
    console.log('SELF-TEST OK: hello + demo + write-denied + nested-delegation fabricated good logs PASS; every fabricated defect (hello: missing turn/end, wrong route, mock-never-called, no session log; demo: explore-step-removed, no tool_call, no result return, no summary, out-of-order, wrong child route; AC-5: routes swapped, routes collapsed-to-equal; AC-6a: write-not-rejected, write-advertised, target-on-disk, no parent return; AC-6b: depth-not-rejected, grandchild-exists, delegation-tool-hidden, no parent return) FAILs on its own named check')
  } else {
    main().catch((error) => {
      console.log(JSON.stringify({ result: 'FAIL', reason: `driver crash: ${error.message}`, scenarios: [] }))
      process.exit(1)
    })
  }
}
