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
// TRANSPORT ADAPTATION (fixed with the Phase-2 agent knobs — the T9 contract
// the mock driver already carried; without it the pinned runtime answered the
// first RPC with 401 and no L4 run was possible):
//   rc.6      — `dsh web: http://127.0.0.1:<port>`; FLAT endpoints
//               (/api/llm.providers, /api/session.create, /api/session.prompt)
//               with no auth beyond the loopback fence. This branch is
//               byte-identical to the MVP wire.
//   0.1.2+    — the readiness line carries `/?token=<launch-token>`; every
//               /api call needs the authority-bound dsh-auth-* cookie minted
//               by GET /?token=… → 303 + Set-Cookie, and the flat endpoints
//               are GONE (404 even authenticated) in favour of the Typert
//               Remote projection:
//                 llm.providers  → llm/listProviders + llm/listConfigurableProviders
//                                  joined by the Web UI's own rule
//                 session.create → session/create, args {request:{cwd,agentPreset}}
//                 session.prompt → session/prompt, args {request:{requestId,…}}
//   The session-log READER is generation-agnostic for the same reason: rc.6
//   wrote `session.jsonl`, format v3 (0.1.5-rc.1) writes `session.v3.jsonl`.
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
// PHASE 2 (P2-T22 L4): the delegation target is a KNOB. `--agent <id>` takes any
// roster DELEGATION id (the 10 dsh-tool-subagent rows — librarian, oracle,
// multimodal-looker, …; default `explore` = the MVP scenario, unchanged) and
// `--question <text>` replaces the built-in nudge question. The AC-4 chain and
// the AC-5 route assertions are the SAME assertions id-generalized: the
// delegation tool/call must be named `<id>`, the child's session lineage
// (origin=subagent, parentSession=conductor) must hold, the child must really
// have consumed SOMETHING real (one of three channels, chosen by fixture/tool
// KIND and never by agent id: the on-disk-only README sentinel for a text
// fixture; for a BINARY fixture such as the seeded PNG, a settled non-error
// call naming it — image bytes carry no text part in the session log; for a
// WEB-shaped question, a settled non-error `web_search`/`web_fetch` call the
// child inherited from the composition), and the child's executed
// request/header route must equal `resolveModelRoutes()[<id>]` (the roster
// seat, whose per-agent `OMO_<AGENT>_*` env overrides the arbiter may pin in
// the smoke environment — they are resolved here, in this process, from the
// same env the spawned dsh inherits). The script still scripts NOTHING: the
// question nudges, the model decides, the checks observe.
//
// THE SEEDED PROJECT (sandbox `<sandbox>/project`, the session cwd):
//   README.md           — carries the text sentinel that proves the child
//                         consumed real sandbox bytes (AC-4 link 2)
//   smoke-fixture.png   — a minimal valid 16x16 PNG; reference it BY NAME in a
//                         multimodal-looker question (the child's cwd is the
//                         project dir, so the relative path resolves)
//
// Usage:
//   node scripts/smoke-real.mjs              precheck, then the real run
//   node scripts/smoke-real.mjs --self-test  hermetic QA of the analysis +
//                                            credential-parse logic (no spawn)
//
// CLI SPELLINGS OF THE TWO KNOBS (P2-T22; both guard their knob boundary the
// same way):
//   --agent <id> / --agent=<id>
//   --question <text> / --question=<text>
// A SEPARATED value that is missing or starts with `--` is a loud exit-2
// missing-value error for BOTH knobs (so `--question --agent librarian` can
// never silently parse as question='--agent' with a stray `librarian` flag).
// A question whose text genuinely starts with a dash MUST therefore use the
// `--question=<text>` spelling — that is the escape hatch, because the `=` form
// takes the rest of the token verbatim:
//   node scripts/smoke-real.mjs --question="--为什么这样写？请委派 explore 读 README。"
//
// NEW-ROSTER-AGENT EXAMPLES (Phase 2 L4; --question is free text — it NUDGES,
// it never scripts, and it must name the agent whose seat you want exercised):
//   # 1) librarian — external docs / OSS source search (fast seat, llm-pi-ai):
//   node scripts/smoke-real.mjs --agent librarian \
//     --question "请委派 librarian 查一下 dsh 的 plugin profile 机制在官方文档里怎么描述，然后总结。"
//   # 2) oracle — read-only architecture review (strong seat, llm-deepseek):
//   node scripts/smoke-real.mjs --agent oracle \
//     --question "请委派 oracle 读这个项目并给出架构层面的风险清单，然后总结。"
//   # 3) multimodal-looker — VISION seat: the question must name the seeded PNG
//   #    (smoke-fixture.png, in the sandboxed project = the session cwd) and the
//   #    deepseek-official/deepseek-v4-flash-vision-exp route must be live; ask
//   #    it to relate the image to README.md so link 2 also sees the sentinel:
//   node scripts/smoke-real.mjs --agent multimodal-looker \
//     --question "请委派 multimodal-looker 看 smoke-fixture.png，并结合 README.md 说明这个项目，然后总结。"
// Any roster DELEGATION id works (explore hephaestus oracle librarian
// plan-consultant plan-reviewer atlas multimodal-looker sisyphus-junior
// prometheus); `sisyphus` is the conductor and is rejected.
//
// Exit: 0 pass / 1 run-or-analysis failure / 2 precheck failure (no key, no dsh)
//       or a rejected CLI argument (unknown/non-delegation --agent, empty
//       --question, or a separated knob value missing / starting with `--` —
//       use the --question=<text> escape hatch for a dash-leading question) —
//       a loud, pre-boot exit; nothing is started.

import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
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
const { DEFAULT_MODEL_ROUTES, MODEL_ROUTE_ENV_VARS, resolveModelRoutes } = await import(
  new URL('../patches/omo-dsh/omo-agents/src/model-routes.ts', import.meta.url).href
)
// P2-T22: the roster is the single source of truth for WHICH agents are legal
// delegation targets and which persona file each row owns. Same Node 24
// type-stripping import; roster.ts is a leaf (model-routes.ts already imports
// it), so this adds no cycle.
const { DELEGATION_TOOL_NAMES, ROSTER } = await import(
  new URL('../patches/omo-dsh/omo-agents/src/roster.ts', import.meta.url).href
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
// sisyphus actually produces a well-formed <agent> call is the compliance
// test.
//
// P2-T22: DEFAULT_QUESTION is the MVP question (byte-identical), used when
// --question is not given; DEFAULT_AGENT_ID is the MVP delegation target. Every
// other roster delegation id (librarian, oracle, multimodal-looker, …) is
// selected with --agent.
const DEFAULT_AGENT_ID = 'explore'
const DEFAULT_QUESTION =
  '这个仓库的 README 讲了什么？请把读取工作委派给 explore 子代理去做'
  + '（前台委派，等它的结果返回），然后基于它的发现用一句话总结。'
// The vision fixture (P2-T22). A 16x16 two-tone PNG, embedded as base64 so the
// script stays dependency-free and the bytes are deterministic. `read_image`
// commits the image itself as a session-log content part, and toolResultParts()
// extracts TEXT parts only — so for a BINARY fixture the honest observation is
// a settled, non-error tool/result for a call whose arguments name the file
// (see childBinaryFixtureEvidence). This is why the binary channel is a
// fixture-KIND rule, not an agent-id special case.
const FIXTURE_IMAGE_NAME = 'smoke-fixture.png'
const FIXTURE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHUlEQVR4nGO4o2FDEmIY1UATDXIad0hC'
  + 'oxpoogEAlBIxECJP1+0AAAAASUVORK5CYII='
const README_CONTENT =
  'This is the omo-dsh concerto MVP fixture project.\n'
  + 'Smoke sentinel: the real-model delegation chain reached this file.\n'
  + `Vision fixture: ${FIXTURE_IMAGE_NAME} is a minimal valid PNG in this same directory.\n`
// The sentinel proves the README bytes genuinely entered the child's context:
// it exists ONLY in the sandbox fixture file, so a child tool/result containing
// it means the file was really read (not hallucinated).
const README_SENTINEL = 'real-model delegation chain reached this file'
// The THIRD consumption channel (P2 review fix). `web_search` / `web_fetch` are
// the model-facing names the runtime's tool-web package registers
// (dsh-tool-web: registerWebSearchTool / registerWebFetchTool) and every
// delegated child inherits them from the composition. A librarian-class agent
// answers an external question by searching/fetching the WEB and has no reason
// to touch the seeded README, so a SETTLED, non-error web call in the child's
// own log is the honest proof that it really ran and really did work. Keyed on
// the tool names the composition exposes, never on the agent id: any agent that
// used the web tools gets the same credit (the fixture-KIND rule, extended).
const WEB_TOOL_NAMES = ['web_search', 'web_fetch']

// The provider llm-deepseek registers in EVERY profile with no settings
// dependency (model-routes.ts header: the STRONG seat's shipped route). The
// roster's DEFAULT_MODEL_ROUTES.sisyphus.provider IS that route, so the smoke
// derives it instead of hardcoding a second string. A chosen agent whose
// resolved provider differs is a llm-pi-ai catalog route and needs the
// settings.yaml profile row that registers it (keyless registration).
const LLM_DEEPSEEK_PROVIDER = DEFAULT_MODEL_ROUTES.sisyphus.provider

/** Whether the chosen agent's seat needs the seeded llm-pi-ai settings row. */
function needsPiAiProfileRow(provider) {
  return provider !== LLM_DEEPSEEK_PROVIDER
}

// ── CLI (P2-T22): --agent / --question ─────────────────────────────────────

/**
 * Parse the smoke's argv. Returns either `{agent, question, flags}` or
 * `{error}` (a printable, key-free usage message). `flags` keeps every other
 * token verbatim (`--self-test`, `--precheck-only`, …) so the mode switches are
 * unchanged. Anonymous positional arguments are collected as flags and ignored
 * exactly as before (the script has never rejected unknown tokens).
 * Pure — the self-test drives it directly.
 *
 * BOTH knobs are guarded symmetrically: a SEPARATED value that is missing or
 * starts with `--` is a loud missing-value error, so `--question --agent
 * librarian` can never silently parse as question='--agent' with a stray
 * `librarian` flag. The `--question=<text>` spelling is the documented escape
 * hatch for a question whose text genuinely starts with a dash (it consumes the
 * rest of the token verbatim, so no knob boundary has to be guessed).
 */
export function parseSmokeArgs(argv) {
  const parsed = { agent: DEFAULT_AGENT_ID, question: DEFAULT_QUESTION, flags: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const isAgent = arg === '--agent' || arg.startsWith('--agent=')
    const isQuestion = arg === '--question' || arg.startsWith('--question=')
    if (!isAgent && !isQuestion) {
      parsed.flags.push(arg)
      continue
    }
    const name = isAgent ? '--agent' : '--question'
    let value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[i + 1]
    if (!arg.includes('=')) {
      // A separated value must be present and must not swallow the NEXT knob.
      // The guard is symmetric across both knobs: `--agent`'s vocabulary is
      // `[a-z-]+` and a question must reach the `--question=<text>` escape hatch
      // when its text genuinely starts with a dash, so a leading `--` is a
      // missing value either way rather than free text.
      if (value === undefined || value.startsWith('--')) {
        return { error: `${name} requires a value (e.g. ${name} ${isAgent ? 'librarian' : '"<your question>"'})` }
      }
      i += 1
    }
    if (value.length === 0) return { error: `${name} must not be empty` }
    if (isAgent) parsed.agent = value
    else parsed.question = value
  }
  return parsed
}

/**
 * Validate a `--agent` value against the roster. Returns an error string (loud,
 * naming every legal id) or undefined. The conductor is a ROSTER id but not a
 * delegation target — `dsh-tool-subagent` has no sisyphus tool — so it is
 * rejected with that reason rather than as an unknown id.
 */
export function validateAgentId(agentId) {
  if (DELEGATION_TOOL_NAMES.includes(agentId)) return undefined
  const detail = agentId === 'sisyphus'
    ? " 'sisyphus' is the conductor (route-only; it owns no delegation tool), so it cannot be a delegation target."
    : ''
  return `smoke-real: unknown --agent '${agentId}'.${detail}`
    + ` Valid delegation ids: ${DELEGATION_TOOL_NAMES.join(', ')}.`
    + ` (Roster ids: ${ROSTER.map((entry) => entry.id).join(', ')}.)`
}

/**
 * The role tag used to build id-flavored check/evidence labels: 'explore' →
 * 'Explore', 'multimodal-looker' → 'MultimodalLooker'. Derived from the roster
 * id so a new row needs no table here.
 */
export function roleTag(agentId) {
  return agentId.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

// ── Precheck: credentials, binary, base-url hygiene ────────────────────────

/**
 * Parse one credential out of a dsh-credentials-local document. The store is
 * a strict mapping of POSIX-ident refs to non-empty strings (values may be
 * bare or single/double-quoted). The current dsh does NOT write those refs
 * flush-left: it nests them inside an indented YAML flow map, so every entry
 * is indented and every entry but the last carries a trailing comma:
 *
 *   refs:
 *     {
 *       DEEPSEEK_API_KEY: "sk-...",
 *       MINIMAX_CN_API_KEY: "sk-..."
 *     }
 *
 * The line parse therefore tolerates leading whitespace (`^[ \t]*<ref>:`) so
 * indented entries are found at all — a flush-left-only anchor silently
 * misses them and makes the L4 precheck fail with the key present — and drops
 * the flow-map entry comma so the captured value is the key itself. Pure
 * string work — no yaml dep (zero new npm deps), and the strict store format
 * makes a line parse honest. Returns undefined when absent/empty. NEVER log
 * the return value.
 */
export function parseCredentialEntry(yamlText, ref) {
  const match = new RegExp(`^[ \\t]*${ref}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(yamlText)
  if (match === null) return undefined
  let value = match[1].trim()
  // Drop the flow-map entry separator captured with the value.
  if (value.endsWith(',')) value = value.slice(0, -1).trim()
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

/**
 * The exact, actionable setup text. Printed on precheck failure; exit 2.
 * P2-T22: the second seat is the CHOSEN agent's, and the llm-pi-ai seeding
 * sentence appears only when that seat is a pi-ai catalog route (the
 * llm-deepseek-registered seat needs no settings row) — for the default
 * `explore` agent this text is byte-identical to the MVP's.
 */
function printMissingKeyAndExit(routes, tried, agentId) {
  const agentRoute = routes[agentId]
  const piAi = needsPiAiProfileRow(agentRoute.provider)
  const lines = [
    'smoke-real: PRECHECK FAIL — no DeepSeek API key available for the real-model run.',
    '',
    piAi
      ? 'ONE key covers BOTH routes (both authenticate against https://api.deepseek.com):'
      : 'ONE key covers the conductor AND the delegated agent (both authenticate against https://api.deepseek.com):',
    `  - ${'sisyphus seat:'.padEnd(14)} ${routes.sisyphus.provider}/${routes.sisyphus.model} via llm-deepseek`,
    '    (apiKeyEnv defaults to DEEPSEEK_API_KEY)',
    `  - ${`${agentId} seat:`.padEnd(14)} ${agentRoute.provider}/${agentRoute.model} via ${piAi ? 'llm-pi-ai' : 'llm-deepseek'}`,
    ...piAi
      ? [
          `    (this smoke seeds llm-pi-ai.providers.${agentRoute.provider}.apiKeyEnv=DEEPSEEK_API_KEY`,
          '     in the sandbox settings.yaml — the same seed as scripts/concerto-mode-probe.sh)',
        ]
      : [
          '    (that route is registered by the base composition in every profile —',
          '     no sandbox settings.yaml row is needed for it)',
        ],
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
 * the sisyphus seat; the adapters that carry the chosen agent's seat keyed via
 * DEEPSEEK_API_KEY; NO baseURL rows → production endpoints), plus the T15
 * plaintext persistence overlay. Returns the overlay path (second --patch).
 *
 * P2-T22: the llm-pi-ai profile row is written only when the chosen agent's
 * resolved provider is NOT the llm-deepseek-registered route — otherwise the
 * row would name a provider id the pi-ai catalog does not ship. For the default
 * `explore` agent the written file is byte-identical to the MVP's.
 */
function seedSandbox(sandbox, routes, agentId) {
  for (const dir of [sandbox.project, sandbox.dshHome, sandbox.agentsHome, sandbox.xdg, sandbox.home]) {
    mkdirSync(dir, { recursive: true })
  }
  const agentRoute = routes[agentId]
  const piAi = needsPiAiProfileRow(agentRoute.provider)
  writeFileSync(
    join(sandbox.dshHome, 'settings.yaml'),
    [
      ...piAi
        ? [
            '# smoke-real seed: REAL providers — no endpoint override rows, so llm-deepseek',
            `# uses its production default and the llm-pi-ai ${agentRoute.provider} profile uses the pi-ai`,
            '# catalog endpoint (both https://api.deepseek.com). One key covers both routes.',
          ]
        : [
            '# smoke-real seed: REAL providers — no endpoint override rows. The delegated',
            `# agent (${agentId}) rides '${agentRoute.provider}', the llm-deepseek route the base`,
            '# composition registers in every profile (production endpoint https://api.deepseek.com).',
          ],
      'agent-default-model:',
      `  provider: ${routes.sisyphus.provider}`,
      `  model: ${routes.sisyphus.model}`,
      'llm-deepseek:',
      '  apiKeyEnv: DEEPSEEK_API_KEY',
      ...piAi
        ? [
            'llm-pi-ai:',
            '  providers:',
            `    ${agentRoute.provider}:`,
            '      apiKeyEnv: DEEPSEEK_API_KEY',
          ]
        : [],
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

/**
 * Boot dsh; resolve with {child, port, transport, cookie?, log()} once the
 * readiness line lands — and, on the 0.1.2+ transport (the line carries
 * ?token=<launch-token>), once the token→cookie handshake has completed.
 *
 * TRANSPORT-ADAPTIVE (the drive.mjs contract, reused verbatim in shape). The
 * MVP-era smoke stopped at the port and spoke only the rc.6 flat endpoints,
 * which 0.1.5-rc.1 no longer serves: measured on the pinned runtime, an
 * unauthenticated POST /api/llm.providers is HTTP 401, and even WITH the
 * minted cookie /api/llm.providers, /api/session.create and
 * /api/session.prompt are HTTP 404 (the Typert Remote projection replaced
 * them). Leaving that unadapted made every real run die at the first RPC with
 * `driver error: rpc llm.providers: HTTP 401` — i.e. the L4 gate could not
 * run at all. The rc.6 branch below is byte-identical to the old wire.
 */
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
      // 0.1.2+ transport: mint the browser-session cookie before any /api call.
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

// ── Web RPC surface (same envelope + transport contract as the mock driver) ─

let rpcCounter = 0

const RPC_TIMEOUT_MS = Number(process.env.DSH_SMOKE_RPC_TIMEOUT_MS ?? 30_000)

/**
 * 0.1.2+ browser-session handshake (dsh browser-auth.ts:240-282): the launch
 * token from the readiness line is accepted ONLY on the index request — a valid
 * root query token mints the authority-bound dsh-auth-* cookie (303 +
 * Set-Cookie); /api then verifies that cookie. Returns the `name=value` pair to
 * send as the cookie header on every subsequent /api call.
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
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') ?? '']
  const pair = setCookies
    .map((value) => value.split(';', 1)[0])
    .find((value) => value.startsWith('dsh-auth-'))
  if (pair === undefined) {
    throw new Error('browser-session handshake: no dsh-auth-* cookie minted')
  }
  return pair
}

async function rpc(boot, method, payload) {
  const rpcId = `smoke-real-${method}-${++rpcCounter}`
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
 * The provider-listing contract on either transport, returned in the rc.6
 * shape {providers:[…]} so every downstream assertion stays
 * transport-agnostic. rc.6: the flat `llm.providers` call already joins
 * registered routes with the configurable directory server-side. 0.1.2+: that
 * endpoint is gone; the joined value is rebuilt from the client's own two
 * Remote calls with the Web UI's rule (joinProviderDirectory) — an entry is
 * active ⟺ its provider id is a registered route, and registered routes with
 * no directory entry append as active rows.
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

/** session.create → (0.1.2+) session/create {args:{request}}. Same value. */
async function sessionCreate(boot, request) {
  if (boot.transport === 'rc6-flat') return rpc(boot, 'session.create', request)
  return rpc(boot, 'session/create', { args: { request } })
}

/** session.prompt → (0.1.2+) session/prompt {args:{request}} (+requestId). */
async function sessionPrompt(boot, request) {
  if (boot.transport === 'rc6-flat') return rpc(boot, 'session.prompt', request)
  return rpc(boot, 'session/prompt', { args: { request: { requestId: randomUUID(), ...request } } })
}

// ── Session JSONL observation (T15 layout) ─────────────────────────────────

/**
 * Whether `filename` is a session log artifact, whichever format generation
 * wrote it: rc.6 hardcoded the bare `session.jsonl`; from session format v3 the
 * canonical name carries the generation (`session.v3.jsonl`), because every
 * later generation carries a lowercase numeric `vN` component. Matching a fixed
 * name silently loses the WHOLE observation channel on a newer runtime (the log
 * is there, the reader just never sees it) — the same read-adaptation drive.mjs
 * already carries (0.1.5-rc.1 writes v3).
 */
function isSessionLogName(filename) {
  return /^session(?:\.v\d+)?\.jsonl$/.test(filename)
}

function findSessionLogs(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      findSessionLogs(path, out)
    } else if (isSessionLogName(entry.name)) {
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
// `<agentId>` tool/call with contract args, a real child session that really
// consumed something real (one of three channels: the README sentinel in a
// child tool/result for a text fixture; for a binary fixture, a settled
// non-error call naming it; for a web-shaped question, a settled non-error
// `web_search`/`web_fetch` call), the findings really landing back in the
// parent, a real summary + orderly turn/end, and the executed request/header
// routes of BOTH logs matching the routes resolveModelRoutes() produced for the
// conductor and the chosen agent.
//
// P2-T22 GENERALIZATION: every assertion that named `explore` now names the
// chosen `agentId`. The check KEY is derived from the roster id via roleTag(),
// so the default agent reproduces the MVP's keys — except
// `ac4Link2ExploreRanAndReadReadme`, renamed `<roleTag>RanAndConsumedChannel`
// because consumption is not always the README: the fixture can be a PNG
// (vision) or the web itself (librarian-class questions), and the check now
// reports WHICH channel proved the child ran and worked.

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

/** Undefined-safe {provider, model} comparison (the AC-5 pair test). */
function sameRoute(a, b) {
  return a !== undefined && b !== undefined
    && a.provider === b.provider
    && a.model === b.model
}

/**
 * A slice of the user's question that must appear verbatim in the recorded
 * user/message. The event is JSON-encoded, so a slice containing `"`/`\` or a
 * newline could come back escaped; the LONGEST run of characters free of those
 * is the honest, escape-proof marker (pure; self-tested).
 */
export function questionMarker(question) {
  const segments = question
    .split(/["\\\r\n\t]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
  let longest = ''
  for (const segment of segments) if (segment.length > longest.length) longest = segment
  return (longest.length > 0 ? longest : question).slice(0, 32)
}

/**
 * The binary-fixture consumption channel: a SETTLED, non-error tool/result for
 * a child tool/call whose ARGUMENTS name a seeded binary fixture. Image bytes
 * are committed as an image content part, and toolResultParts() extracts text
 * parts only — so `text.includes(sentinel)` can never observe a `read_image`.
 * Keyed on the fixture KIND (binary vs text), never on the agent id: any agent
 * that settles a call naming a seeded binary fixture demonstrably consumed it,
 * and a text fixture additionally offers the stronger byte-level sentinel.
 * Returns {callId, tool, fixture} | undefined.
 */
function childBinaryFixtureEvidence(childToolCalls, childResults) {
  for (const call of childToolCalls) {
    const args = String(call.data?.arguments ?? '')
    const fixture = [FIXTURE_IMAGE_NAME].find((name) => args.includes(name))
    if (fixture === undefined) continue
    const result = childResults.find((part) => part.callId === call.data?.callId)
    if (result !== undefined && result.isError !== true) {
      return { callId: call.data?.callId ?? null, tool: call.data?.name ?? '?', fixture }
    }
  }
  return undefined
}

/**
 * The WEB consumption channel (P2 review fix): a SETTLED, non-error tool/result
 * for a child call named by the runtime's web tools (WEB_TOOL_NAMES). A
 * librarian-class agent answers an external question from the web — it never
 * touches the seeded README — so the README sentinel can never observe its
 * work; this channel observes the work the agent ACTUALLY did. Keyed on the
 * tool names the composition exposes (the child inherits them), never on the
 * agent id: the web shape is a property of the question + tools, not of a
 * librarian special case.
 * Returns {callId, tool} | undefined.
 */
function childWebToolEvidence(childToolCalls, childResults) {
  for (const call of childToolCalls) {
    if (!WEB_TOOL_NAMES.includes(call.data?.name)) continue
    const result = childResults.find((part) => part.callId === call.data?.callId)
    if (result !== undefined && result.isError !== true) {
      return { callId: call.data?.callId ?? null, tool: call.data?.name }
    }
  }
  return undefined
}

/**
 * Which channel proved the child really RAN and really WORKED. The three
 * channels are independent proofs of the same business fact — the child's own
 * log shows it consumed something real — and are selected by fixture/tool KIND,
 * never by agent id:
 *   'readme-sentinel' — the on-disk-only README bytes reached a child tool/result
 *   'binary-fixture'  — a settled non-error child call naming the seeded PNG
 *   'web-tool'        — a settled non-error child web_search/web_fetch call
 * Ordered strongest-first only so a child that did several things reports its
 * most direct local proof. Returns the channel name, or null for NO consumption
 * (an errored or never-settled call consumes nothing).
 */
function childConsumptionChannel({ childSawReadme, childBinaryFixture, childWebTool }) {
  if (childSawReadme) return 'readme-sentinel'
  if (childBinaryFixture !== undefined) return 'binary-fixture'
  if (childWebTool !== undefined) return 'web-tool'
  return null
}

/**
 * The real-run verdict.
 * `log` = the parent (sisyphus) session log | undefined; `childLog` = the
 * delegated child's own session.jsonl | undefined; `providersJson` = the raw
 * /api/llm.providers JSON; `bootLog` = captured dsh stdout.
 * `agentId` = the `--agent` delegation target (default explore — the MVP
 * scenario); `question` = the `--question` text (default the MVP question).
 * Returns {result, failed, checks, evidence} — evidence carries the values
 * the human checklist cites (routes, seqs, arg snippets, agent/question),
 * never the key.
 */
export function analyzeRealRun(
  { log, childLog, providersJson, bootLog },
  routes,
  agentId = DEFAULT_AGENT_ID,
  question = DEFAULT_QUESTION,
) {
  const events = log?.events ?? []
  const childEvents = childLog?.events ?? []
  const agentRoute = routes[agentId]
  const role = roleTag(agentId)

  const parentRoute = requestHeaderRoute(events)
  const childRoute = requestHeaderRoute(childEvents)

  // AC-4 link 1: sisyphus's own decision — a real <agentId> tool/call with the
  // T11 contract args (a description + a non-empty prompt). The MVP additionally
  // required the prompt to contain 'README'; with a user-supplied question that
  // substring is question-specific, so the generalized contract is the two
  // string args themselves (the recorded user question is checked separately).
  const delegationCall = events.find(
    (event) => event.type === 'tool/call' && event.data?.name === agentId,
  )
  let delegationArgs = {}
  try {
    delegationArgs = JSON.parse(delegationCall?.data?.arguments ?? '{}')
  } catch {
    // unparseable model output fails link 1 below
  }

  // AC-4 link 2: the delegated child RAN and really consumed its channel — its
  // own session exists under the parent, it issued at least one tool call, and
  // ONE of the three consumption channels holds: a child tool/result carries
  // the on-disk-only README sentinel (text fixture), or it settled a non-error
  // call naming the seeded PNG (binary fixture), or it settled a non-error
  // web_search/web_fetch call (the web-shaped question — a librarian-class
  // agent's real work) — and it produced its own findings message.
  const childToolCalls = childEvents.filter((event) => event.type === 'tool/call')
  const childResults = toolResultParts(childEvents)
  const childSawReadme = childResults.some((part) => part.text.includes(README_SENTINEL))
  const childBinaryFixture = childBinaryFixtureEvidence(childToolCalls, childResults)
  const childWebTool = childWebToolEvidence(childToolCalls, childResults)
  const childChannel = childConsumptionChannel({
    childSawReadme,
    childBinaryFixture,
    childWebTool,
  })
  const childFindingsMessage = childEvents.find(
    (event) => event.type === 'assistant/message' && eventText(event).length > 2,
  )

  // AC-4 link 3: the findings returned to sisyphus — the delegation call's own
  // tool/result in the parent log, settled and non-error, with real content
  // (free-form with a real model — presence + non-error is the honest bar).
  const parentResults = toolResultParts(events)
  const delegationCallId = delegationCall?.data?.callId
  const delegationResult = parentResults.find(
    (part) => part.callId === delegationCallId && part.isError !== true && part.text.trim().length > 0,
  )

  // AC-4 link 4: a real summary after the result, and an orderly turn end.
  const summaryMessage = events.find(
    (event) =>
      event.type === 'assistant/message'
      && delegationCall !== undefined
      && event.seq > delegationCall.seq
      && eventText(event).length > 2,
  )
  const turnCompleted = events.some(
    (event) =>
      event.type === 'turn/end'
      && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
  )

  // AC-5's kernel is the T14 pair being distinct (sisyphus vs explore). Phase 2
  // deliberately COALESCES seats: seven rows share the conductor's seat, so for
  // those agents "the child's route differs" is not a claim the config makes.
  // The honest generalization: when the RESOLVED seats already coincide, the
  // distinctness check is not applicable (reported with the pin-it note in the
  // transcript); when they differ — the default explore case, any env-pinned
  // OMO_<AGENT>_* seat — the EXECUTED routes must really differ, as before.
  const seatsCoalesce = sameRoute(routes.sisyphus, agentRoute)
  const routeEnvVars = MODEL_ROUTE_ENV_VARS[agentId]

  const checks = {
    // Wiring observations (preflight — if these fail, the AC checks below are
    // read against a boot that never stood a chance).
    pluginLoaded: bootLog.includes('[omo-agents] loaded'),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    [`${agentId}ProviderActive`]: new RegExp(
      `"provider":"${agentRoute.provider}"[^}]*"active":true`,
    ).test(providersJson),
    parentSessionLogFound: log !== undefined,
    userQuestionRecorded: events.some(
      (event) => event.type === 'user/message' && eventText(event).includes(questionMarker(question)),
    ),
    // ── AC-4: the four chain events, in order ──
    ac4Link1DelegationCall:
      delegationCall !== undefined
      && typeof delegationArgs.description === 'string'
      && typeof delegationArgs.prompt === 'string'
      && delegationArgs.prompt.trim().length > 0,
    [`ac4Link2${role}RanAndConsumedChannel`]:
      childLog !== undefined
      && childLog.header?.origin === 'subagent'
      && String(childLog.header?.parentSession) === String(log?.header?.id)
      && childToolCalls.length >= 1
      && childChannel !== null
      && childFindingsMessage !== undefined,
    ac4Link3ResultReturnedToSisyphus: delegationResult !== undefined,
    ac4Link4SisyphusSummarizedAndTurnCompleted:
      summaryMessage !== undefined && turnCompleted,
    ac4ChainObservedInOrder:
      delegationCall !== undefined
      && delegationResult !== undefined
      && summaryMessage !== undefined
      && delegationCall.seq < summaryMessage.seq,
    // ── AC-5: the executed route pair is observable AND distinct (latest
    // request/header of BOTH session logs — the T15/T20 contract).
    ac5ParentRequestHeaderIsSisyphusRoute:
      parentRoute !== undefined
      && parentRoute.provider === routes.sisyphus.provider
      && parentRoute.model === routes.sisyphus.model,
    [`ac5ChildRequestHeaderIs${role}Route`]:
      childRoute !== undefined
      && childRoute.provider === agentRoute.provider
      && childRoute.model === agentRoute.model,
    ac5RoutesDistinct:
      seatsCoalesce
      || (parentRoute !== undefined
        && childRoute !== undefined
        && (parentRoute.provider !== childRoute.provider
          || parentRoute.model !== childRoute.model)),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const evidence = {
    agentId,
    question,
    expectedChildRoute: agentRoute ?? null,
    routeEnvVars: routeEnvVars ?? null,
    seatsCoalesce,
    parentRoute: parentRoute ?? null,
    childRoute: childRoute ?? null,
    delegationCall: delegationCall === undefined
      ? null
      : {
          seq: delegationCall.seq,
          callId: delegationCallId ?? null,
          description: typeof delegationArgs.description === 'string' ? delegationArgs.description : null,
          promptSnippet: typeof delegationArgs.prompt === 'string' ? delegationArgs.prompt.slice(0, 200) : null,
          runInBackground: delegationArgs.run_in_background ?? null,
        },
    childToolCallNames: childToolCalls.map((call) => call.data?.name ?? '?'),
    childConsumptionChannel: childChannel,
    childSawReadmeSentinel: childSawReadme,
    childBinaryFixtureCall: childBinaryFixture ?? null,
    childWebToolCall: childWebTool ?? null,
    delegationResultSnippet: delegationResult === undefined ? null : delegationResult.text.slice(0, 300),
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
 * times, ids, the chosen agent + question, and the digest outcome. Pure string
 * building. P2-T22: every `explore` literal is the chosen agent id and every
 * README literal is the seeded-fixture noun, so one renderer serves all 10
 * delegation targets (for the default agent the text is the MVP's apart from
 * those two generalized nouns).
 */
export function renderTranscript({ analysis, log, childLog, routes, meta }) {
  const { checks, evidence } = analysis
  const agentId = meta.agentId ?? DEFAULT_AGENT_ID
  const role = roleTag(agentId)
  const agentRoute = routes[agentId] ?? { provider: '?', model: '?' }
  const piAi = needsPiAiProfileRow(agentRoute.provider)
  const coalesceNote = evidence.seatsCoalesce
    ? ` — N/A: ${agentId} resolves to the conductor's seat (${agentRoute.provider}/${agentRoute.model}); pin ${evidence.routeEnvVars?.provider ?? 'OMO_<AGENT>_PROVIDER'} / ${evidence.routeEnvVars?.model ?? 'OMO_<AGENT>_MODEL'} to exercise AC-5 distinctness`
    : ''
  const lines = [
    `# smoke-real transcript — ${meta.timestamp}`,
    '',
    `- dsh: ${meta.dshVersion}`,
    `- delegation target (--agent): ${agentId}`,
    `- question (--question): ${truncate(meta.question ?? DEFAULT_QUESTION, 200)}`,
    `- web RPC transport: ${meta.transport ?? 'unknown'}`,
    `- routes (T14): sisyphus=${routes.sisyphus.provider}/${routes.sisyphus.model} · ${agentId}=${agentRoute.provider}/${agentRoute.model}`,
    `- credential: DEEPSEEK_API_KEY present — source: ${meta.keySource}`,
    `- sandbox: ${meta.sandboxRoot}${meta.sandboxKept ? ' (kept)' : ' (removed after evidence copy)'}`,
    `- evidence dir: ${meta.evidenceDir}`,
    `- real dsh home (${meta.realDshHome}) untouched: ${meta.realDshUntouched ? 'YES (digest identical)' : 'NO — INVESTIGATE'}`,
    `- base-url note: ${meta.baseUrlNote}`,
    `- seeded project fixtures: README.md (text sentinel) · ${FIXTURE_IMAGE_NAME} (minimal PNG for vision questions)`,
    '',
    '## Wiring observations (auto-checked)',
    '',
    `- ${checkMark(checks.pluginLoaded)} omo-agents plugin loaded in the booted dsh`,
    `- ${checkMark(checks.sisyphusProviderActive)} sisyphus provider active in /api/llm.providers (llm-deepseek)`,
    `- ${checkMark(checks[`${agentId}ProviderActive`])} ${agentId} provider active in /api/llm.providers (${piAi ? 'llm-pi-ai settings profile' : 'llm-deepseek'})`,
    `- ${checkMark(checks.parentSessionLogFound)} parent session log found on disk`,
    `- ${checkMark(checks.userQuestionRecorded)} the user question is recorded in the parent log`,
    '',
    '## AC-4 delegation chain (人工核对 — confirm each against the transcripts below, then tick)',
    '',
    `- ${checkMark(checks.ac4Link1DelegationCall)} 1. sisyphus CALLED the ${agentId} delegation tool (seq ${evidence.delegationCall?.seq ?? '?'}; description: ${evidence.delegationCall?.description ?? '—'}; run_in_background: ${evidence.delegationCall?.runInBackground ?? '—'})`,
    `- ${checkMark(checks[`ac4Link2${role}RanAndConsumedChannel`])} 2. the ${agentId} child RAN and consumed its channel (child session ${evidence.childSessionId ?? '—'}; tool calls: ${(evidence.childToolCallNames ?? []).join(', ') || '—'}; consumption channel: ${evidence.childConsumptionChannel ?? 'NONE'}; README sentinel reached the child: ${evidence.childSawReadmeSentinel ? 'yes' : 'no'}; binary fixture call: ${evidence.childBinaryFixtureCall == null ? 'none' : `${evidence.childBinaryFixtureCall.tool} → ${evidence.childBinaryFixtureCall.fixture} (settled, non-error)`}; web tool call: ${evidence.childWebToolCall == null ? 'none' : `${evidence.childWebToolCall.tool} (settled, non-error)`})`,
    `- ${checkMark(checks.ac4Link3ResultReturnedToSisyphus)} 3. the child's findings RETURNED to sisyphus (settled non-error tool/result in the parent log)`,
    `- ${checkMark(checks.ac4Link4SisyphusSummarizedAndTurnCompleted)} 4. sisyphus SUMMARIZED and the turn completed`,
    `- ${checkMark(checks.ac4ChainObservedInOrder)} order: delegation call seq < summary seq in the parent log`,
    '',
    '## AC-5 dual routes (人工核对 — each executed route must equal its resolved roster seat)',
    '',
    `- ${checkMark(checks.ac5ParentRequestHeaderIsSisyphusRoute)} parent (sisyphus) request/header route = ${evidence.parentRoute == null ? '—' : `${evidence.parentRoute.provider}/${evidence.parentRoute.model}`} (expected ${routes.sisyphus.provider}/${routes.sisyphus.model})`,
    `- ${checkMark(checks[`ac5ChildRequestHeaderIs${role}Route`])} child (${agentId}) request/header route = ${evidence.childRoute == null ? '—' : `${evidence.childRoute.provider}/${evidence.childRoute.model}`} (expected ${agentRoute.provider}/${agentRoute.model})`,
    `- ${checkMark(checks.ac5RoutesDistinct)} the two routes DIFFER${coalesceNote}`,
    '',
    '## Parent session transcript (one line per event)',
    '',
    ...(log === undefined ? ['  (no parent session log)'] : transcriptLines(log)),
    '',
    `## Child (${agentId}) session transcript`,
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

async function runSmoke(routes, apiKey, keySource, agentId, question) {
  const startedAt = Date.now()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const evidenceDir = join(REPO_ROOT, '.omo', 'evidence', `smoke-real-${timestamp}`)
  mkdirSync(evidenceDir, { recursive: true })

  const agentRoute = routes[agentId]
  const realDshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const beforeDigest = digestConfigDir(realDshHome)
  console.error(`smoke-real: evidence dir ${evidenceDir}`)
  console.error(`smoke-real: real dsh home digest target ${realDshHome} (before: ${beforeDigest.slice(0, 16)}…)`)
  console.error(`smoke-real: delegation target ${agentId} — question: ${truncate(question, 160)}`)
  console.error(`smoke-real: routes sisyphus=${routes.sisyphus.provider}/${routes.sisyphus.model} ${agentId}=${agentRoute.provider}/${agentRoute.model}`)

  const sandbox = createSandbox()
  const { env: childEnv, baseUrlNote } = scenarioEnv(sandbox, apiKey)
  if (baseUrlNote.stripped) {
    console.error('smoke-real: NOTE — DEEPSEEK_BASE_URL was set in your shell; stripped from the sandboxed dsh env so both routes hit https://api.deepseek.com (DSH_SMOKE_RESPECT_BASE_URL=1 keeps it)')
  }
  console.error(`smoke-real: sandbox ${sandbox.root}`)

  const patchPath = seedSandbox(sandbox, routes, agentId)
  writeFileSync(join(sandbox.project, 'README.md'), README_CONTENT)
  writeFileSync(join(sandbox.project, FIXTURE_IMAGE_NAME), Buffer.from(FIXTURE_IMAGE_BASE64, 'base64'))

  let child
  let analysis
  let finalLog
  let childLog
  let runError
  let bootSeconds = 'n/a'
  let scenarioSeconds = 'n/a'
  let dshVersion = 'unknown'
  let bootLogText = ''
  let transport = 'n/a'
  try {
    const version = spawnSync('dsh', ['--version'], { encoding: 'utf8' })
    dshVersion = (version.stdout ?? '').trim() || 'unknown'

    console.error('smoke-real: stage 0 — dsh plugin add into the sandbox profile')
    installPlugin(sandbox, childEnv)

    console.error('smoke-real: booting dsh --profile web --patch ./cordis.yml --patch <smoke> --port 0')
    const bootStarted = Date.now()
    const boot = await bootDsh(sandbox, childEnv, patchPath)
    child = boot.child
    transport = boot.transport
    bootSeconds = ((Date.now() - bootStarted) / 1000).toFixed(1)
    console.error(`smoke-real: web ready on 127.0.0.1:${boot.port} (${bootSeconds}s, transport ${boot.transport})`)

    const providers = await listProvidersJoined(boot)
    const providersJson = JSON.stringify(providers)
    writeFileSync(join(evidenceDir, 'llm.providers.json'), `${JSON.stringify(providers, null, 2)}\n`)

    const created = await sessionCreate(boot, {
      cwd: sandbox.project,
      agentPreset: CONCERTO_PRESET_ID,
    })
    console.error(`smoke-real: session created ${created.sessionId} (preset ${created.agentPreset ?? '?'})`)
    const scenarioStarted = Date.now()
    await sessionPrompt(boot, {
      sessionId: created.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: question }],
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
      agentId,
      question,
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
    agentId,
    question,
    transport,
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

function selfParentLog(routes, agentId = DEFAULT_AGENT_ID, question = DEFAULT_QUESTION) {
  return {
    path: '/fabricated/parent/session.jsonl',
    header: { type: 'session', id: SELF_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: question }] } },
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
          name: agentId,
          arguments: JSON.stringify({
            description: `委派 ${agentId}`,
            prompt: `请处理：${question}`,
            run_in_background: false,
          }),
        },
      },
      {
        seq: 4,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'real-call-1', content: [{ type: 'text', text: `子代理发现：${agentId} 汇报了夹具项目的内容。` }], isError: false }] } },
      },
      { seq: 5, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: '一句话总结：这个 README 介绍了 omo-dsh 协奏 MVP 夹具项目。' }] } } },
      { seq: 6, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

/**
 * The fabricated child log. `child.call` / `child.resultText` / `child.isError`
 * model the SINGLE-call cases (the README read; the vision path's `read_image`
 * on the seeded PNG whose session-log result carries NO text part). `child.calls`
 * models the multi-call / web path instead: an array of
 * `{name, arguments, resultText, isError, callId, noResult}`, where
 * `noResult: true` emits the tool/call with NO settled tool/result (the
 * "un-settled" case) and each entry's `resultText` defaults to the README
 * sentinel text so the single-call defaults stay byte-compatible.
 */
function selfChildLog(routes, agentId = DEFAULT_AGENT_ID, child = {}) {
  const childRoute = routes[agentId]
  const defaultText =
    `This is the omo-dsh concerto MVP fixture project. Smoke sentinel: the ${README_SENTINEL}`
  const calls = child.calls ?? [
    {
      name: child.call?.name ?? 'read',
      arguments: child.call?.arguments ?? { file_path: '/fabricated/project/README.md' },
      resultText: child.resultText ?? defaultText,
      isError: child.isError,
    },
  ]
  const events = [
    {
      seq: 1,
      type: 'request/header',
      data: { header: { config: { provider: childRoute.provider, model: childRoute.model } }, reason: 'initial' },
    },
  ]
  for (const [index, entry] of calls.entries()) {
    const callId = entry.callId ?? `real-child-call-${index + 1}`
    const resultText = entry.resultText ?? defaultText
    events.push({
      seq: events.length + 1,
      type: 'tool/call',
      data: { turn: 1, step: 1, callId, name: entry.name, arguments: JSON.stringify(entry.arguments ?? {}) },
    })
    if (entry.noResult === true) continue
    events.push({
      seq: events.length + 1,
      type: 'tool/result',
      data: {
        turn: 1,
        step: 1,
        message: {
          role: 'user',
          content: [{
            type: 'tool-result',
            toolCallId: callId,
            content: resultText.length > 0 ? [{ type: 'text', text: resultText }] : [],
            isError: entry.isError === true,
          }],
        },
      },
    })
  }
  events.push({ seq: events.length + 1, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: 'README 内容：这是 omo-dsh 协奏 MVP 夹具项目。' }] } } })
  events.push({ seq: events.length + 1, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  return {
    path: '/fabricated/child/session.jsonl',
    header: {
      type: 'session',
      id: SELF_CHILD_ID,
      origin: 'subagent',
      parentSession: SELF_PARENT_ID,
      delegationDepth: 1,
    },
    events,
  }
}

function selfProvidersJson(routes, agentId = DEFAULT_AGENT_ID) {
  const providers = [{ provider: routes.sisyphus.provider, active: true }]
  const agentProvider = routes[agentId].provider
  if (agentProvider !== routes.sisyphus.provider) providers.push({ provider: agentProvider, active: true })
  return JSON.stringify({ providers })
}

function selfInput(routes, agentId = DEFAULT_AGENT_ID, question = DEFAULT_QUESTION, child = {}) {
  return {
    log: selfParentLog(routes, agentId, question),
    childLog: selfChildLog(routes, agentId, child),
    providersJson: selfProvidersJson(routes, agentId),
    bootLog: '[omo-agents] loaded',
  }
}

/** The meta block renderTranscript needs; one builder for every case. */
function selfMeta(agentId = DEFAULT_AGENT_ID, question = DEFAULT_QUESTION) {
  return {
    timestamp: 'selftest',
    dshVersion: 'selftest',
    keySource: 'selftest',
    agentId,
    question,
    transport: 'selftest',
    sandboxRoot: '/fabricated',
    sandboxKept: false,
    evidenceDir: '/fabricated',
    realDshHome: '/fabricated',
    realDshUntouched: true,
    baseUrlNote: 'selftest',
    bootSeconds: '0',
    scenarioSeconds: '0',
    totalSeconds: '0',
  }
}

function runSelfTest(routes) {
  const problems = []

  // Credential parsing: the strict store shapes, including quoted values and
  // the flow-map nesting the current dsh writes (refs indented inside
  // `refs: { ... }`) — and never any key material in outputs (we only compare
  // booleans/lengths).
  const fakeKey = 'sk-SELFTEST-FAKE-KEY'
  const parseCases = [
    [`DEEPSEEK_API_KEY: ${fakeKey}\n`, fakeKey, 'bare value'],
    [`DEEPSEEK_API_KEY: "${fakeKey}"\n`, fakeKey, 'double-quoted value'],
    [`DEEPSEEK_API_KEY: '${fakeKey}'\n`, fakeKey, 'single-quoted value'],
    ['OTHER_KEY: value\n', undefined, 'absent ref'],
    ['DEEPSEEK_API_KEY: \n', undefined, 'empty value'],
    // The real on-disk shape: refs nested inside an indented flow map.
    [
      `refs:\n  {\n    DEEPSEEK_API_KEY: "${fakeKey}",\n    OTHER_KEY: "x",\n  }\n`,
      fakeKey,
      'nested flow-map double-quoted value',
    ],
    [
      `refs:\n  {\n    DEEPSEEK_API_KEY: ${fakeKey},\n  }\n`,
      fakeKey,
      'nested flow-map bare value',
    ],
    [
      `refs:\n\t{\n\t\tDEEPSEEK_API_KEY: '${fakeKey}',\n\t}\n`,
      fakeKey,
      'tab-indented nested value',
    ],
    [
      `refs:\n  {\n    DEEPSEEK_API_KEY: "",\n  }\n`,
      undefined,
      'nested empty value',
    ],
    [
      `refs:\n  {\n    OTHER_KEY: "${fakeKey}",\n  }\n`,
      undefined,
      'nested absent ref',
    ],
    // The last ref in the real store has no trailing comma; a space before the
    // comma must not defeat the strip either.
    [
      `version: 1\nrefs:\n  {\n    OTHER_KEY: "x",\n    DEEPSEEK_API_KEY: "${fakeKey}"\n  }\nrecords:\n`,
      fakeKey,
      'nested last entry without a trailing comma',
    ],
    [
      `refs:\n  {\n    DEEPSEEK_API_KEY: "${fakeKey}" ,\n  }\n`,
      fakeKey,
      'nested quoted value with a space before the comma',
    ],
  ]
  for (const [text, expected, label] of parseCases) {
    const got = parseCredentialEntry(text, 'DEEPSEEK_API_KEY')
    if (got !== expected) {
      problems.push(`credential parse "${label}" must yield ${expected === undefined ? 'undefined' : 'the value'}, got ${got === undefined ? 'undefined' : 'a different value'}`)
    }
  }

  // P2-T22 CLI knobs: defaults, both spellings, and every rejection path must be
  // loud (an error string) rather than silently booting the wrong scenario.
  // The knob boundary is SYMMETRIC (P2 review fix): both `--agent` and
  // `--question` reject a separated value that starts with `--`, so the
  // asymmetric argv `['--question', '--agent', 'librarian']` cannot silently
  // parse as question='--agent' + a stray flag. The `--question=<text>` escape
  // hatch must keep accepting a genuinely dash-leading question.
  const cliCases = [
    [[], (parsed) => parsed.agent === DEFAULT_AGENT_ID && parsed.question === DEFAULT_QUESTION && parsed.error === undefined, 'no args → MVP defaults (explore + built-in question)'],
    [['--agent', 'librarian', '--question', '查一下文档'], (parsed) => parsed.agent === 'librarian' && parsed.question === '查一下文档', 'separated --agent/--question values'],
    [['--agent=multimodal-looker'], (parsed) => parsed.agent === 'multimodal-looker', '--agent=<id> spelling'],
    [['--question=a b c'], (parsed) => parsed.question === 'a b c', '--question=<text> spelling'],
    [['--self-test', '--agent', 'oracle'], (parsed) => parsed.agent === 'oracle' && parsed.flags.includes('--self-test'), 'mode flags survive alongside the knobs'],
    [['--agent'], (parsed) => typeof parsed.error === 'string', 'missing --agent value is an error'],
    [['--agent='], (parsed) => typeof parsed.error === 'string', 'empty --agent value is an error'],
    [['--question'], (parsed) => typeof parsed.error === 'string', 'missing --question value is an error'],
    [['--question', ''], (parsed) => typeof parsed.error === 'string', 'empty --question value is an error'],
    [['--agent', '--question', 'x'], (parsed) => typeof parsed.error === 'string', '--agent does not swallow the next knob'],
    [['--question', '--agent', 'librarian'], (parsed) => typeof parsed.error === 'string', '--question does not swallow the next knob (symmetric boundary)'],
    [['--question', '--foo'], (parsed) => typeof parsed.error === 'string', 'a separated --question value starting with -- is a missing value, not free text'],
    [['--question=--foo starts with a dash'], (parsed) => parsed.error === undefined && parsed.question === '--foo starts with a dash', '--question=<text> escape hatch still accepts a dash-leading question'],
  ]
  for (const [argv, predicate, label] of cliCases) {
    const parsed = parseSmokeArgs(argv)
    if (!predicate(parsed)) problems.push(`CLI parse "${label}" failed: ${JSON.stringify(parsed)}`)
  }

  // Agent-id validation: every roster DELEGATION id is legal; the conductor is
  // rejected with the reason; anything unknown is rejected naming the roster.
  for (const agentId of DELEGATION_TOOL_NAMES) {
    if (validateAgentId(agentId) !== undefined) {
      problems.push(`validateAgentId must accept the delegation id '${agentId}'`)
    }
  }
  if (validateAgentId('sisyphus') === undefined) {
    problems.push('validateAgentId must reject the conductor id sisyphus')
  } else if (!validateAgentId('sisyphus').includes('conductor')) {
    problems.push('validateAgentId must explain WHY sisyphus is not a delegation target')
  }
  const unknownError = validateAgentId('not-an-agent')
  if (unknownError === undefined || !DELEGATION_TOOL_NAMES.every((id) => unknownError.includes(id))) {
    problems.push('validateAgentId must reject an unknown id AND list every valid delegation id')
  }

  // The session-log matcher must see EVERY format generation: a fixed
  // 'session.jsonl' literal silently loses the whole observation channel on a
  // v3+ runtime (0.1.5-rc.1 writes session.v3.jsonl — measured).
  const logNameCases = [
    ['session.jsonl', true],
    ['session.v3.jsonl', true],
    ['session.v12.jsonl', true],
    ['session.v3.jsonl.gz', false],
    ['session.v3.jsonl.tmp', false],
    ['header.jsonl', false],
  ]
  for (const [name, expected] of logNameCases) {
    if (isSessionLogName(name) !== expected) {
      problems.push(`isSessionLogName(${JSON.stringify(name)}) must be ${expected}`)
    }
  }

  // The escape-proof question marker: it must be a literal slice of the
  // question AND survive JSON-encoding the recorded user/message (that encoding
  // is what `userQuestionRecorded` greps), for questions with quotes or
  // newlines too.
  const markerCases = [
    ['这个仓库的 README 讲了什么？ 请委派 explore 去做', 'README'],
    ['查一下 "dsh plugin" 的文档，然后汇报', 'dsh plugin'],
    ['第一行问题\n第二行是一个更长的问题描述', '第二行是一个更长的问题描述'],
  ]
  for (const [question, expectedFragment] of markerCases) {
    const marker = questionMarker(question)
    const encoded = JSON.stringify({ content: [{ type: 'text', text: question }] })
    if (marker.length === 0) problems.push(`questionMarker(${JSON.stringify(question)}) must not be empty`)
    if (!question.includes(marker)) {
      problems.push(`questionMarker(${JSON.stringify(question)}) must be a literal slice of the question, got ${JSON.stringify(marker)}`)
    }
    if (!encoded.includes(marker)) {
      problems.push(`questionMarker(${JSON.stringify(question)}) must survive JSON encoding of the recorded event, got ${JSON.stringify(marker)}`)
    }
    if (!marker.includes(expectedFragment)) {
      problems.push(`questionMarker(${JSON.stringify(question)}) should carry '${expectedFragment}', got ${JSON.stringify(marker)}`)
    }
  }

  // The seeded settings.yaml must carry NO baseURL row and NO key material, and
  // the llm-pi-ai profile row must exist exactly when the chosen seat needs it.
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
    // Env-independent synthetic seats for the seeding rule, so an arbiter who
    // exports OMO_* overrides cannot make the self-test assert the wrong thing.
    // Expectations below are LITERAL (not computed from needsPiAiProfileRow).
    const seedRoutes = {
      ...routes,
      sisyphus: { provider: 'selftest-conductor', model: 'selftest-conductor-model' },
      explore: { provider: 'selftest-piai-route', model: 'selftest-piai-model' },
      oracle: { provider: LLM_DEEPSEEK_PROVIDER, model: 'selftest-strong-model' },
      'multimodal-looker': { provider: LLM_DEEPSEEK_PROVIDER, model: 'selftest-vision-model' },
    }
    const seedCases = [
      ['explore', true],
      ['oracle', false],
      ['multimodal-looker', false],
    ]
    for (const [agentId, expectPiAi] of seedCases) {
      seedSandbox(realSandbox, seedRoutes, agentId)
      const seeded = readFileSync(join(realSandbox.dshHome, 'settings.yaml'), 'utf8')
      if (/baseurl/i.test(seeded)) {
        problems.push(`seeded settings.yaml for ${agentId} must NOT pin a baseURL (production endpoints are the contract)`)
      }
      if (seeded.includes(fakeKey) || !seeded.includes('apiKeyEnv: DEEPSEEK_API_KEY')) {
        problems.push(`seeded settings.yaml for ${agentId} must reference the credential ENV NAME only, never key material`)
      }
      for (const needle of [
        `provider: ${seedRoutes.sisyphus.provider}`,
        `model: ${seedRoutes.sisyphus.model}`,
      ]) {
        if (!seeded.includes(needle)) problems.push(`seeded settings.yaml for ${agentId} missing '${needle}'`)
      }
      const hasPiAi = seeded.includes('llm-pi-ai:')
      if (hasPiAi !== expectPiAi) {
        problems.push(`seeded settings.yaml for ${agentId} must ${expectPiAi ? '' : 'NOT '}carry the llm-pi-ai profile row`)
      }
      if (hasPiAi && !seeded.includes(`${seedRoutes[agentId].provider}:`)) {
        problems.push(`seeded settings.yaml for ${agentId} must key the llm-pi-ai row on its resolved provider '${seedRoutes[agentId].provider}'`)
      }
    }
    // …and the REAL resolved routes are what the default seed pins (a roster
    // default regression must show up here, not only in the synthetic cases).
    seedSandbox(realSandbox, routes, DEFAULT_AGENT_ID)
    const realSeeded = readFileSync(join(realSandbox.dshHome, 'settings.yaml'), 'utf8')
    for (const needle of [
      `provider: ${routes.sisyphus.provider}`,
      `model: ${routes.sisyphus.model}`,
    ]) {
      if (!realSeeded.includes(needle)) {
        problems.push(`the default seed must pin the RESOLVED conductor seat; missing '${needle}'`)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  // Good fabricated run for the DEFAULT agent → PASS (the MVP scenario).
  const good = analyzeRealRun(selfInput(routes), routes)
  if (good.result !== 'PASS') {
    problems.push(`fabricated GOOD real run must PASS, got FAIL on: ${good.failed.join(', ')}`)
  }
  if (good.evidence.childConsumptionChannel !== 'readme-sentinel') {
    problems.push(`the default README read must report channel 'readme-sentinel', got ${good.evidence.childConsumptionChannel}`)
  }

  // Each fabricated defect fails on its own named check. The AC-5 distinctness
  // case carries its OWN map with guaranteed-distinct seats, so an arbiter's
  // OMO_* override that coalesces sisyphus/explore cannot make this fabricated
  // defect unrepresentable.
  const distinctSeatRoutes = {
    ...routes,
    sisyphus: { provider: 'selftest-conductor', model: 'selftest-conductor-model' },
    explore: { provider: 'selftest-explore', model: 'selftest-explore-model' },
  }
  const defectCases = [
    ['no delegation call in the parent log', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/call')
    }, 'ac4Link1DelegationCall'],
    ['child never ran (no child log)', (input) => {
      input.childLog = undefined
    }, 'ac4Link2ExploreRanAndConsumedChannel'],
    ['child never saw the README bytes (sentinel absent)', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          ? { ...event, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'real-child-call-1', content: [{ type: 'text', text: 'unrelated content' }], isError: false }] } } }
          : event)
    }, 'ac4Link2ExploreRanAndConsumedChannel'],
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
          ? { ...event, data: { header: { config: { provider: distinctSeatRoutes.sisyphus.provider, model: distinctSeatRoutes.sisyphus.model } }, reason: 'initial' } }
          : event)
    }, 'ac5RoutesDistinct', distinctSeatRoutes],
    ['explore provider not active at boot', (input) => {
      input.providersJson = JSON.stringify({ providers: [{ provider: distinctSeatRoutes.sisyphus.provider, active: true }] })
    }, 'exploreProviderActive', distinctSeatRoutes],
  ]
  for (const [label, mutate, expectedCheck, routesOverride] of defectCases) {
    const map = routesOverride ?? routes
    const input = selfInput(map)
    mutate(input)
    const verdict = analyzeRealRun(input, map)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P2-T22: the SAME checks against a NEW roster agent (librarian, fast
  // seat ≠ the conductor's) must pass, and report under id-flavored keys.
  const librarianInput = selfInput(routes, 'librarian')
  const librarian = analyzeRealRun(librarianInput, routes, 'librarian')
  if (librarian.result !== 'PASS') {
    problems.push(`fabricated GOOD librarian run must PASS, got FAIL on: ${librarian.failed.join(', ')}`)
  }
  for (const key of [
    'librarianProviderActive',
    'ac4Link2LibrarianRanAndConsumedChannel',
    'ac5ChildRequestHeaderIsLibrarianRoute',
  ]) {
    if (librarian.checks[key] !== true) problems.push(`librarian run must report '${key}' === true`)
  }
  for (const key of ['exploreProviderActive', 'ac5ChildRequestHeaderIsExploreRoute']) {
    if (key in librarian.checks) problems.push(`librarian run must NOT carry the explore-hardcoded key '${key}'`)
  }

  // A delegation to the WRONG agent (the conductor called explore instead) must
  // fail link 1 for the chosen id — the tool name IS the chain link.
  const wrongAgent = selfInput(routes, 'explore')
  const wrongAgentVerdict = analyzeRealRun(wrongAgent, routes, 'librarian')
  if (wrongAgentVerdict.result !== 'FAIL' || !wrongAgentVerdict.failed.includes('ac4Link1DelegationCall')) {
    problems.push(`a delegation named explore must FAIL ac4Link1DelegationCall for --agent librarian, got ${wrongAgentVerdict.result} (${wrongAgentVerdict.failed.join(', ')})`)
  }

  // ── P2-T22: the vision channel. A child that never saw the README text but
  // SETTLED a non-error read_image on the seeded PNG consumed a seeded fixture.
  const visionChild = {
    call: { name: 'read_image', arguments: { file_path: '/fabricated/project/smoke-fixture.png' } },
    resultText: '',
  }
  const vision = analyzeRealRun(selfInput(routes, 'multimodal-looker', DEFAULT_QUESTION, visionChild), routes, 'multimodal-looker')
  if (vision.result !== 'PASS') {
    problems.push(`fabricated vision run (settled read_image on the seeded PNG) must PASS, got FAIL on: ${vision.failed.join(', ')}`)
  }
  if (vision.evidence.childSawReadmeSentinel !== false || vision.evidence.childBinaryFixtureCall?.fixture !== FIXTURE_IMAGE_NAME) {
    problems.push('vision evidence must report sentinel=false AND the binary-fixture call it used')
  }
  // The binary channel is keyed on the FIXTURE KIND, not on the agent: the same
  // settled-PNG log is a valid consumption proof for a text agent too (it still
  // proves the child touched real sandbox bytes), reported with sentinel=false.
  const binaryForTextAgent = analyzeRealRun(selfInput(routes, 'librarian', DEFAULT_QUESTION, visionChild), routes, 'librarian')
  if (binaryForTextAgent.result !== 'PASS' || binaryForTextAgent.evidence.childSawReadmeSentinel !== false) {
    problems.push(`the binary-fixture channel must be agent-independent (fixture-kind rule), got ${binaryForTextAgent.result} (${binaryForTextAgent.failed.join(', ')})`)
  }
  // An ERRORED image call is not consumption.
  const erroredVisionChild = { ...visionChild, isError: true }
  const erroredVision = analyzeRealRun(
    selfInput(routes, 'multimodal-looker', DEFAULT_QUESTION, erroredVisionChild),
    routes,
    'multimodal-looker',
  )
  if (erroredVision.result !== 'FAIL'
    || !erroredVision.failed.includes('ac4Link2MultimodalLookerRanAndConsumedChannel')) {
    problems.push(`an errored read_image must FAIL the vision link 2, got ${erroredVision.result} (${erroredVision.failed.join(', ')})`)
  }

  // ── P2 review fix: the WEB consumption channel. A librarian-class question is
  // EXTERNAL-shaped: the child searches/fetches the web and never touches the
  // seeded README, so the sentinel can never observe its work. A SETTLED,
  // non-error web tool call in the child's own log is the honest proof that the
  // child really ran — and it is a tool-KIND rule, not a librarian special case.
  const webChild = {
    calls: [
      {
        name: 'web_fetch',
        arguments: { url: 'https://api-docs.deepseek.com/quick_start/pricing' },
        resultText: 'Fetched https://api-docs.deepseek.com/quick_start/pricing/ (HTTP 200)\n\nModels & Pricing — deepseek-chat, deepseek-reasoner …',
      },
      {
        name: 'web_search',
        arguments: { queries: ['DeepSeek context length official docs'] },
        resultText: 'Sources: https://api-docs.deepseek.com/ — the context window is 128K.',
      },
    ],
  }
  const webInput = selfInput(routes, 'librarian', DEFAULT_QUESTION, webChild)
  const webLibrarian = analyzeRealRun(webInput, routes, 'librarian')
  if (webLibrarian.result !== 'PASS') {
    problems.push(`fabricated GOOD librarian web run (settled web tools, no README sentinel) must PASS, got FAIL on: ${webLibrarian.failed.join(', ')}`)
  }
  if (webLibrarian.evidence.childConsumptionChannel !== 'web-tool'
    || webLibrarian.evidence.childSawReadmeSentinel !== false
    || webLibrarian.evidence.childWebToolCall?.tool !== 'web_fetch') {
    problems.push(`the web run must report channel=web-tool, sentinel=false and the settled web call it used, got ${JSON.stringify({ channel: webLibrarian.evidence.childConsumptionChannel, sentinel: webLibrarian.evidence.childSawReadmeSentinel, call: webLibrarian.evidence.childWebToolCall })}`)
  }
  // The web channel is keyed on the TOOL kind, not the agent: the same settled
  // web log proves a non-librarian child really ran too.
  const webForExplore = analyzeRealRun(selfInput(routes, 'explore', DEFAULT_QUESTION, webChild), routes, 'explore')
  if (webForExplore.result !== 'PASS' || webForExplore.evidence.childSawReadmeSentinel !== false) {
    problems.push(`the web channel must be agent-independent (tool-kind rule), got ${webForExplore.result} (${webForExplore.failed.join(', ')})`)
  }
  // The transcript must state the channel truthfully — never claim a seeded
  // fixture was consumed when the child consumed the web.
  const webTranscript = renderTranscript({
    analysis: webLibrarian,
    log: webInput.log,
    childLog: webInput.childLog,
    routes,
    meta: selfMeta('librarian'),
  })
  for (const needle of [
    'consumed its channel',
    'consumption channel: web-tool',
    'README sentinel reached the child: no',
  ]) {
    if (!webTranscript.includes(needle)) problems.push(`the web-run transcript must state '${needle}'`)
  }
  if (webTranscript.includes('consumed a seeded fixture')) {
    problems.push('the web-run transcript must not claim a seeded fixture was consumed')
  }
  // An ERRORED web call is not consumption…
  const erroredWeb = analyzeRealRun(
    selfInput(routes, 'librarian', DEFAULT_QUESTION, {
      calls: [{
        name: 'web_fetch',
        arguments: { url: 'https://api-docs.deepseek.com/' },
        resultText: 'fetch failed',
        isError: true,
      }],
    }),
    routes,
    'librarian',
  )
  if (erroredWeb.result !== 'FAIL'
    || !erroredWeb.failed.includes('ac4Link2LibrarianRanAndConsumedChannel')) {
    problems.push(`an errored web call must FAIL the librarian link 2, got ${erroredWeb.result} (${erroredWeb.failed.join(', ')})`)
  }
  // …and neither is an UN-SETTLED one (the call with no tool/result): the
  // "settled" half of the channel is load-bearing.
  const pendingWeb = analyzeRealRun(
    selfInput(routes, 'librarian', DEFAULT_QUESTION, {
      calls: [{ name: 'web_search', arguments: { queries: ['DeepSeek docs'] }, noResult: true }],
    }),
    routes,
    'librarian',
  )
  if (pendingWeb.result !== 'FAIL'
    || !pendingWeb.failed.includes('ac4Link2LibrarianRanAndConsumedChannel')) {
    problems.push(`an un-settled web call must FAIL the librarian link 2, got ${pendingWeb.result} (${pendingWeb.failed.join(', ')})`)
  }
  // The reviewer's negative: a child that ran but consumed NO channel (an
  // unrelated local read, no web tools) must still FAIL link 2, with channel
  // null — the check is a proof, not a participation trophy.
  const noConsumption = analyzeRealRun(
    selfInput(routes, 'librarian', DEFAULT_QUESTION, {
      calls: [{
        name: 'read',
        arguments: { file_path: '/fabricated/elsewhere/notes.txt' },
        resultText: 'unrelated content — no sentinel, no fixture name, no web',
      }],
    }),
    routes,
    'librarian',
  )
  if (noConsumption.result !== 'FAIL'
    || !noConsumption.failed.includes('ac4Link2LibrarianRanAndConsumedChannel')
    || noConsumption.evidence.childConsumptionChannel !== null) {
    problems.push(`a librarian child with NO consumption of any channel must FAIL ac4Link2LibrarianRanAndConsumedChannel with channel=null, got ${noConsumption.result} (${noConsumption.failed.join(', ')}) channel=${noConsumption.evidence.childConsumptionChannel}`)
  }

  // ── P2-T22: COALESCED seats. Oracle's plan §4.6 seat IS the conductor's, so
  // the AC-5 "must differ" kernel is not a claim that config makes; the
  // id-generalized check reports it as satisfied-by-config and the transcript
  // prints the pin-it note. A child on a DIFFERENT route still fails the
  // per-agent route check.
  const coalescedRoutes = { ...routes, oracle: { ...routes.sisyphus } }
  const oracleInput = selfInput(coalescedRoutes, 'oracle')
  const oracle = analyzeRealRun(oracleInput, coalescedRoutes, 'oracle')
  if (oracle.result !== 'PASS') {
    problems.push(`fabricated GOOD oracle run (coalesced seat) must PASS, got FAIL on: ${oracle.failed.join(', ')}`)
  }
  if (oracle.evidence.seatsCoalesce !== true) {
    problems.push('the oracle run evidence must record seatsCoalesce=true')
  }
  const oracleTranscript = renderTranscript({
    analysis: oracle,
    log: oracleInput.log,
    childLog: oracleInput.childLog,
    routes: coalescedRoutes,
    meta: selfMeta('oracle'),
  })
  if (!oracleTranscript.includes('N/A: oracle resolves to the conductor')) {
    problems.push('the coalesced-seat transcript must print the N/A + pin-it note')
  }
  const oracleWrongRoute = analyzeRealRun(
    (() => {
      const input = selfInput(coalescedRoutes, 'oracle')
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { config: { provider: routes.explore.provider, model: routes.explore.model } }, reason: 'initial' } }
          : event)
      return input
    })(),
    coalescedRoutes,
    'oracle',
  )
  if (oracleWrongRoute.result !== 'FAIL'
    || !oracleWrongRoute.failed.includes('ac5ChildRequestHeaderIsOracleRoute')) {
    problems.push(`an oracle child on the explore route must FAIL ac5ChildRequestHeaderIsOracleRoute, got ${oracleWrongRoute.result} (${oracleWrongRoute.failed.join(', ')})`)
  }

  // A user-supplied question that never reached the parent log must fail the
  // recorded-question check (the marker is derived from the ACTUAL question).
  const customQuestion = '列出这个项目里所有的图片资源'
  const customInput = selfInput(routes, 'librarian', '完全不同的另一个问题')
  const custom = analyzeRealRun(customInput, routes, 'librarian', customQuestion)
  if (custom.result !== 'FAIL' || !custom.failed.includes('userQuestionRecorded')) {
    problems.push(`an unrecorded --question must FAIL userQuestionRecorded, got ${custom.result} (${custom.failed.join(', ')})`)
  }
  const customRecorded = analyzeRealRun(selfInput(routes, 'librarian', customQuestion), routes, 'librarian', customQuestion)
  if (customRecorded.result !== 'PASS') {
    problems.push(`a recorded --question must PASS, got FAIL on: ${customRecorded.failed.join(', ')}`)
  }

  // Transcript renders with the checklist sections and never echoes a key.
  const transcript = renderTranscript({
    analysis: good,
    log: selfParentLog(routes),
    childLog: selfChildLog(routes),
    routes,
    meta: selfMeta(),
  })
  for (const needle of [
    'AC-4', 'AC-5', 'Cost / time note', 'USER GATE',
    `- delegation target (--agent): ${DEFAULT_AGENT_ID}`,
    `- question (--question):`,
    FIXTURE_IMAGE_NAME,
    '## Child (explore) session transcript',
  ]) {
    if (!transcript.includes(needle)) problems.push(`transcript missing section '${needle}'`)
  }
  if (transcript.includes(fakeKey)) problems.push('transcript must never contain key material')

  return problems
}

// ── main ───────────────────────────────────────────────────────────────────

/**
 * The pre-boot usage guard (P2-T22): an unknown/non-delegation --agent, an
 * empty --question, or a SEPARATED knob value that is missing / starts with
 * `--` is a loud exit 2 with NOTHING started — before the route resolution, the
 * dsh probe, or any sandbox write. Returns {agent, question, flags} on success.
 */
function resolveCliOrExit(argv) {
  const parsed = parseSmokeArgs(argv)
  if (parsed.error !== undefined) {
    console.error(`smoke-real: ${parsed.error}`)
    console.error(`smoke-real: valid delegation ids: ${DELEGATION_TOOL_NAMES.join(', ')} (default ${DEFAULT_AGENT_ID})`)
    process.exit(2)
  }
  const agentError = validateAgentId(parsed.agent)
  if (agentError !== undefined) {
    console.error(agentError)
    process.exit(2)
  }
  return parsed
}

async function main() {
  const cli = resolveCliOrExit(process.argv.slice(2))
  const routes = resolveModelRoutes()

  if (cli.flags.includes('--self-test')) {
    const problems = runSelfTest(routes)
    if (problems.length > 0) {
      console.error(`SELF-TEST FAIL: ${problems.join('; ')}`)
      process.exit(1)
    }
    console.log('SELF-TEST OK: credential parse (bare/quoted/absent/empty, plus the dsh flow-map nesting: indented entries with and without the trailing comma, tabs, and a space before the comma) correct; CLI parse (defaults, --agent/--question in both spellings, missing/empty values rejected, the separated-value knob boundary enforced symmetrically for both knobs with the --question=<text> escape hatch intact, mode flags preserved) and --agent validation (all 10 delegation ids accepted, sisyphus rejected as the conductor, unknown id rejected naming the roster) correct; the session-log matcher accepts every format generation (session.jsonl / session.vN.jsonl); seeded settings.yaml for explore/oracle/multimodal-looker carries no baseURL, no key material, and the llm-pi-ai profile row exactly when the seat needs it; fabricated GOOD runs PASS for explore (README sentinel channel), librarian (both the README channel and the settled-web-tool channel), oracle (coalesced seat) and multimodal-looker (settled read_image on the seeded PNG, binary channel); the three consumption channels are agent-independent tool/fixture-kind rules; every fabricated defect (no delegation call, wrong-agent delegation, no child, README bytes unseen — i.e. no channel consumed, errored or un-settled image/web call, no result return, no summary/turn-end, wrong child route, oracle child on another seat, collapsed routes, inactive agent provider, unrecorded custom question) FAILs on its own named check; transcript renders all sections (agent id, question, transport, seeded fixtures, per-channel consumption line, coalesced-seat N/A note) without key material')
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
    printMissingKeyAndExit(routes, resolved.tried, cli.agent)
  }
  const agentRoute = routes[cli.agent]
  console.error(`smoke-real: precheck OK — DEEPSEEK_API_KEY present (source: ${resolved.source}; length ${resolved.key.length}; value never printed)`)
  console.error(`smoke-real: delegation target ${cli.agent} → ${agentRoute.provider}/${agentRoute.model} (env overrides ${MODEL_ROUTE_ENV_VARS[cli.agent].provider} / ${MODEL_ROUTE_ENV_VARS[cli.agent].model})`)

  if (cli.flags.includes('--precheck-only')) {
    // Setup verification without spending a cent: credential resolution and
    // the dsh binary checked, nothing booted.
    console.error('smoke-real: --precheck-only — stopping before the run; your setup is ready for scripts/smoke-real.sh')
    process.exit(0)
  }

  const code = await runSmoke(routes, resolved.key, resolved.source, cli.agent, cli.question)
  process.exit(code)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`smoke-real: driver crash: ${error.message}`)
    process.exit(1)
  })
}
