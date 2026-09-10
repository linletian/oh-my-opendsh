#!/usr/bin/env bash
# scripts/concerto-mode-probe.sh — T6 probe (FR-2, AC-2): the omo-agents
# scratch plugin registers the REAL 协奏 / Concerto Mode preset (id `concerto`,
# display name from OUR repo-shipped concerto/preset.yml) at the same roster
# level as the official 4 modes.
#
# Replaces the T5 P-1 spike probe (kept as a thin wrapper: p1-preset-probe.sh).
# Same sandboxing discipline as scripts/cold-start.sh (HOME / XDG_CONFIG_HOME /
# DSH_HOME / DSH_AGENTS_HOME redirected into a throwaway dir; real ~/.dsh never
# touched; registration lands only inside the sandbox's $DSH_HOME).
#
# Assertions per boot:
#   plugin side — `[omo-agents] loaded`, `concerto preset <outcome>`, the
#                 roster line listing `concerto:user`, and no FAILED line.
#   T8 persona  — the `omo-sisyphus system prompt assembled` boot marker, and
#                 the MATERIALIZED $DSH_HOME preset's agent.cordis.yml: the
#                 sentinel is gone and the persona block scalar carries the
#                 three AC-3 section markers (Orchestrator Role / Delegation
#                 Discipline / Hard Blocks) — proof the booted concerto mode's
#                 main-agent brain is the assembled omo-sisyphus prompt.
#   T16 marker  — the `hard-blocks injection listener registered on
#                 agent/pre-step` boot line: the FR-6 listener's registration
#                 is observable at boot (unit-level inject assertions live in
#                 tests/omo-agents/hard-blocks-injection.test.ts; live
#                 sub-agent prompt proof is T20's e2e snapshot).
#   T10 marker  — the `omo-explore persona assembled` boot line: the FR-4
#                 read-only subagent persona (system-sections/
#                 explore-persona.md) assembles cleanly under the dsh boot
#                 environment. The persona is a SUBAGENT artifact, not a run
#                 mode — no roster entry is expected; T11 binds the text as a
#                 dsh-tool-subagent instance's `persona` config (contract in
#                 src/explore-prompt.ts).
#   external    — the Web UI picker's own roster RPC (transport-adaptive, T9:
#                 rc.6 POST /api/agentPreset.list, no auth; 0.1.2 POST
#                 /api/agentPresets/list through the Typert Remote gateway,
#                 after the launch-token → dsh-auth-* cookie handshake) lists
#                 concerto at trust "user" alongside the official four at
#                 trust "system" (rc.6 standard/code/minimal/cordis; 0.1.2
#                 standard/ptc/minimal/cordis), with the name from OUR
#                 preset.yml (协奏 / Concerto).
#   T14 routes   — the `[omo-agents] model routes: sisyphus=… explore=…` boot
#                 marker (resolved by the plugin from src/model-routes.ts, the
#                 single config source of truth), and the provider directory
#                 (rc.6 POST /api/llm.providers; 0.1.2 llm/listProviders joined
#                 with llm/listConfigurableProviders by the Web UI's own rule)
#                 showing BOTH route providers `active:true` — the sisyphus
#                 seat's from the llm-deepseek adapter (entry config), the
#                 explore seat's from the llm-pi-ai adapter (sandbox-seeded
#                 settings profile; registration is keyless — no API keys
#                 exist in the sandbox, and none are needed for this gate).
#   T11 binding  — the omo-explore dsh-tool-subagent instance (form A static
#                 config) in the MATERIALIZED composition: the row exists with
#                 toolName `explore`, both T11 sentinels are rendered away,
#                 the persona block scalar carries the real explore persona,
#                 agentOptions carries the env-resolved explore route, and the
#                 pre-declared T12/T13 fields (toolFilter deny, maxDepth) are
#                 present. THEN a real schema gate: the row's config is parsed
#                 and validated by the INSTALLED dsh's own js-yaml +
#                 dsh-tool-subagent Config (schemastery) — the exact code cordis
#                 runs at mount. HONEST TIMING NOTE: dsh validates preset rows
#                 LAZILY, at session composition (agent-presets mountPreset),
#                 not at boot — this probe runs the same schema eagerly so a
#                 broken row fails here instead of at first session creation.
#                 A live tool-list observable needs a session and closes in
#                 T19/T20.
#   T12 proof    — scripts/prove-explore-toolfilter.mjs executes the INSTALLED
#                 dsh's real child-composition path (dsh-subagent
#                 applyChildComposition → tools.restrict → ToolRuntime view)
#                 against the materialized row and asserts the child scope's
#                 model-facing tool list excludes write/edit (execution
#                 surfaces UNKNOWN_TOOL), read/grep/glob + the platform shell
#                 survive, and the parent scope is untouched. Session-free;
#                 the live-model half closes in T20.
#   T13 proof    — scripts/prove-explore-maxdepth.mjs mounts the row's own
#                 dsh-tool-subagent instance on the REAL stack (cordis +
#                 ToolRuntime + SubagentRuntime + the spawn provider) and
#                 drives the real delegation start path: a depth-1 parent's
#                 attempted nested delegation is rejected on BOTH the
#                 foreground (ctx.subagents.start) and continuable
#                 (startContinuable) starts with the exact errored tool
#                 result "Error: subagent depth 2 exceeds maxDepth 1", the
#                 tool stays model-visible at the cap, and a depth-0 parent
#                 passes the same gate (control). Session-free; T20 closes
#                 the live-model half.
#   T15 proof    — scripts/prove-route-logging.mjs boots the FULL real stack
#                 (testkit five + JsonlSessionPersistence + AgentLoop +
#                 SubagentRuntime + spawn provider) with scripted adapters on
#                 the two REAL route names, runs one parent turn + one real
#                 continuable start, then asserts on the real JSONL artifacts:
#                 child `subagent/descriptor`.agentProvider/agentModel = the
#                 resolved explore route, both agents' `request/header`.config
#                 = their executed routes, the two routes differ (P-7 verdict:
#                 logged — no listener code). --expect unlogged QA-proves the
#                 verdict logic falls back to 'self-listener-needed' on
#                 route-less logs. T20 closes the live-model half.
# Idempotence   — boot 2 reuses boot 1's sandbox DSH_HOME: the sync must be a
#                 no-op (`concerto preset unchanged`) and the roster identical.
#
# Learned flags (P-8): root flags (--profile/--patch) precede app flags.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROFILE="web"
READY_TIMEOUT_S="${CONCERTO_READY_TIMEOUT_S:-90}"
INSTALL_TIMEOUT_S="${CONCERTO_INSTALL_TIMEOUT_S:-300}"

# `--no-open`: dsh 0.1.2 introduced the default browser handoff, and the flag
# that suppresses it; before that the web app's commander rejects an unknown
# option outright (P-8.2's class — root flags and app flags are different
# parsers). Hardcoding it would break every pre-0.1.2 run, so feature-probe the
# app's own help instead of assuming (docs/dsh-0.1.5-rc.1-review.md §7.6).
# Probed lazily on first boot below, once the profile exists.
NO_OPEN=""

SANDBOX="$(mktemp -d /tmp/omo-dsh-concerto-probe.XXXXXX)"
cleanup() {
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

export HOME="$SANDBOX/home"
export XDG_CONFIG_HOME="$SANDBOX/xdg"
export DSH_HOME="$SANDBOX/dsh"
export DSH_AGENTS_HOME="$SANDBOX/agents"
mkdir -p "$HOME" "$XDG_CONFIG_HOME"

ADD_LOG="$SANDBOX/plugin-add.log"

fail() {
  echo "concerto-probe: FAIL: $*" >&2
  exit 1
}

command -v node >/dev/null || fail "node not found (probe needs it for the adaptive web-RPC helper)"

echo "concerto-probe: sandbox: $SANDBOX"
echo "concerto-probe: dsh binary: $(command -v dsh)"
dsh --version || fail "dsh --version failed"

# Stage 0: fresh profile + install the plugin into it.
echo "concerto-probe: installing @oh-my-opendsh/omo-agents into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-agents" >"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add failed (see $ADD_LOG)"

# T14 (FR-5, P-2; AC-5 config half): resolve the two route pairs from the
# plugin's own config module — the single source of truth (Node 24
# type-stripping runs the .ts directly, P-8.6) — then pre-seed the sandbox
# settings.yaml with the llm-pi-ai profile that registers the explore seat's
# provider route. Adapter REGISTRATION is the gate (no API keys exist in the
# sandbox): credentials resolve per request, so a route registers keylessly
# and a missing key would only fail a REQUEST with MISSING_CREDENTIAL.
ROUTES_ENV="$(node --input-type=module -e "
  import('./patches/omo-dsh/omo-agents/src/model-routes.ts').then((m) => {
    const r = m.resolveModelRoutes()
    console.log('SISYPHUS_PROVIDER=' + r.sisyphus.provider)
    console.log('SISYPHUS_MODEL=' + r.sisyphus.model)
    console.log('EXPLORE_PROVIDER=' + r.explore.provider)
    console.log('EXPLORE_MODEL=' + r.explore.model)
  })
")" || fail "model-routes module resolution failed: $ROUTES_ENV"
SISYPHUS_PROVIDER="$(printf '%s\n' "$ROUTES_ENV" | grep '^SISYPHUS_PROVIDER=' | cut -d= -f2-)"
SISYPHUS_MODEL="$(printf '%s\n' "$ROUTES_ENV" | grep '^SISYPHUS_MODEL=' | cut -d= -f2-)"
EXPLORE_PROVIDER="$(printf '%s\n' "$ROUTES_ENV" | grep '^EXPLORE_PROVIDER=' | cut -d= -f2-)"
EXPLORE_MODEL="$(printf '%s\n' "$ROUTES_ENV" | grep '^EXPLORE_MODEL=' | cut -d= -f2-)"
[[ -n "$SISYPHUS_PROVIDER" && -n "$SISYPHUS_MODEL" && -n "$EXPLORE_PROVIDER" && -n "$EXPLORE_MODEL" ]] \
  || fail "could not parse model-routes output: $ROUTES_ENV"
[[ "$SISYPHUS_PROVIDER/$SISYPHUS_MODEL" != "$EXPLORE_PROVIDER/$EXPLORE_MODEL" ]] \
  || fail "AC-5 precheck: both agents resolve to the SAME route ($SISYPHUS_PROVIDER/$SISYPHUS_MODEL)"
echo "concerto-probe: T14 routes: sisyphus=$SISYPHUS_PROVIDER/$SISYPHUS_MODEL explore=$EXPLORE_PROVIDER/$EXPLORE_MODEL"

# The explore seat rides the llm-pi-ai adapter, which the shipped composition
# mounts DORMANT (zero routes); a settings profile registers the route at
# boot. If an override points the explore seat at a route another adapter
# already owns, llm-pi-ai logs the DUPLICATE_ADAPTER refusal and keeps
# serving — the runtime assertions below then judge the result honestly.
mkdir -p "$DSH_HOME"
cat > "$DSH_HOME/settings.yaml" <<EOF
# T14 probe seed: register the explore seat's pi-ai provider route.
llm-pi-ai:
  providers:
    $EXPLORE_PROVIDER:
      apiKeyEnv: DEEPSEEK_API_KEY
EOF

# T11 schema gate: resolve the INSTALLED dsh's node_modules from the dsh
# binary itself (read-only — never modified), so the row is validated by the
# exact js-yaml dialect (JSON_SCHEMA + !!js) and schemastery Config that
# cordis runs at session-composition mount time.
DSH_BIN="$(readlink -f "$(command -v dsh)")" || fail "cannot resolve dsh binary"
DSH_NM="$(cd "$(dirname "$DSH_BIN")/../node_modules" && pwd)" || fail "cannot resolve dsh node_modules"
# T9: npm rc.6 ships every runtime package flat under the dsh package's own
# node_modules; the 0.1.2 pnpm source install links only apps/cli's DIRECT
# deps there (transitive workspace packages the proofs import by path — e.g.
# dsh-scope, dsh-agent-loop — live in the workspace hoist store). Build a
# union overlay of symlinks so the same nm-path imports resolve under either
# install shape. On npm rc.6 no hoist store exists and the overlay is a pure
# mirror of DSH_NM (symlink realpaths converge on the very same files).
# Precedence: DSH_NM wins on conflict (first-come, not overwritten): today the
# install under test is the ONLY source; if a future npm 0.1.2 package lands,
# revisit the loop order or the precedence breaks silently.
DSH_NM_UNION="$SANDBOX/dsh-nm"
mkdir -p "$DSH_NM_UNION/@deepseek-ai"
for entry in "$DSH_NM"/*; do
  name="$(basename "$entry")"
  [[ "$name" == "@deepseek-ai" || "$name" == ".bin" ]] && continue
  [[ -e "$DSH_NM_UNION/$name" ]] || ln -s "$entry" "$DSH_NM_UNION/$name"
done
for entry in "$DSH_NM/@deepseek-ai"/*; do
  name="$(basename "$entry")"
  [[ -e "$DSH_NM_UNION/@deepseek-ai/$name" ]] || ln -s "$entry" "$DSH_NM_UNION/@deepseek-ai/$name"
done
WORKSPACE_ROOT="$(cd "$DSH_NM/../../.." && pwd)"
HOIST_NM="$WORKSPACE_ROOT/node_modules/.pnpm/node_modules"
if [[ -d "$HOIST_NM/@deepseek-ai" ]]; then
  for entry in "$HOIST_NM/@deepseek-ai"/*; do
    name="$(basename "$entry")"
    [[ -e "$DSH_NM_UNION/@deepseek-ai/$name" ]] || ln -s "$entry" "$DSH_NM_UNION/@deepseek-ai/$name"
  done
fi
[[ -f "$DSH_NM_UNION/@deepseek-ai/dsh-tool-subagent/lib/index.js" && -f "$DSH_NM_UNION/js-yaml/dist/js-yaml.mjs" ]] \
  || fail "installed dsh is missing dsh-tool-subagent or js-yaml under $DSH_NM_UNION"
VALIDATE_EXPLORE_MJS="$SANDBOX/validate-explore-row.mjs"
cat > "$VALIDATE_EXPLORE_MJS" <<'EOF'
// T11: validate the materialized explore row against the installed dsh's schema.
// argv: <dsh node_modules dir> <materialized agent.cordis.yml> <provider> <model>
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const [nm, compositionPath, expectedProvider, expectedModel] = process.argv.slice(2)
const yaml = (await import(pathToFileURL(nm + '/js-yaml/dist/js-yaml.mjs').href)).default
const { Config } = await import(pathToFileURL(nm + '/@deepseek-ai/dsh-tool-subagent/lib/index.js').href)
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (d) => typeof d === 'string',
  construct: (d) => ({ __jsExpr: d }),
})
const rows = yaml.load(readFileSync(compositionPath, 'utf8'), { schema: yaml.JSON_SCHEMA.extend(JsExpr) })
const found = []
const walk = (list) => {
  for (const row of list) {
    if (row && typeof row === 'object') {
      if (row.id === 'tool-subagent-explore') found.push(row)
      if (Array.isArray(row.config)) walk(row.config)
    }
  }
}
walk(rows)
if (found.length !== 1) {
  console.error(`T11-VALIDATE FAIL: expected exactly 1 tool-subagent-explore row, found ${found.length}`)
  process.exit(1)
}
const row = found[0]
if (row.name !== '@deepseek-ai/dsh-tool-subagent') {
  console.error(`T11-VALIDATE FAIL: row name is ${row.name}`)
  process.exit(1)
}
let validated
try {
  validated = Config(row.config)
} catch (err) {
  console.error(`T11-VALIDATE FAIL: dsh-tool-subagent Config rejected the row: ${err.name}: ${err.message}`)
  process.exit(1)
}
const problems = []
if (validated.provider !== 'spawn') problems.push(`provider=${validated.provider}`)
if (validated.toolName !== 'explore') problems.push(`toolName=${validated.toolName}`)
if (validated.backgroundMode !== 'continuable') problems.push(`backgroundMode=${validated.backgroundMode}`)
if (validated.maxDepth !== 1) problems.push(`maxDepth=${validated.maxDepth}`)
// F1 fix (2026-09-05): the deny list also names the delegation tool itself, so the
// child physically cannot delegate (AC-6b parity with the current-DSH path).
if (JSON.stringify(validated.toolFilter) !== JSON.stringify({ deny: ['write', 'edit', 'explore'] })) {
  problems.push(`toolFilter=${JSON.stringify(validated.toolFilter)}`)
}
if (validated.agentOptions?.provider !== expectedProvider || validated.agentOptions?.model !== expectedModel) {
  problems.push(`agentOptions=${JSON.stringify(validated.agentOptions)} expected ${expectedProvider}/${expectedModel}`)
}
if (typeof validated.persona !== 'string' || !validated.persona.includes('# Explore: Read-Only Retrieval Agent')) {
  problems.push('persona missing the explore persona heading')
}
if (problems.length > 0) {
  console.error(`T11-VALIDATE FAIL: ${problems.join('; ')}`)
  process.exit(1)
}
console.log(`T11-VALIDATE PASS: tool-subagent-explore row validates against the installed dsh-tool-subagent Config `
  + `(toolName=explore provider=spawn route=${expectedProvider}/${expectedModel} maxDepth=1 deny=[write,edit,explore] persona=${validated.persona.length} chars)`)
EOF

# Adaptive web-RPC helper (T9). The readiness line decides the transport:
# rc.6 serves flat /api/<method> endpoints with no auth beyond the loopback
# Host-header fence; 0.1.2 mints a dsh-auth-* cookie via GET /?token=<launch>
# (303 + Set-Cookie; query tokens on /api itself get 401) and replaces the
# flat endpoints with Typert Remote endpoints /api/<namespace>/<method>
# (payload {args:{…}}, docs/api-gateway.md:121). 'providers' re-asserts the
# rc.6 llm.providers contract on 0.1.2 by joining the client's own two Remote
# calls with the Web UI Models page's own rule (joinProviderDirectory,
# ui-settings-models/src/client/store.ts:49-73): a directory entry is active
# ⟺ its provider id is a registered route — the exact join rc.6 performed
# server-side — so the grep assertions below stay transport-agnostic.
WEB_RPC_MJS="$SANDBOX/web-rpc.mjs"
cat > "$WEB_RPC_MJS" <<'EOF'
// argv: <roster|providers> <port> [launch-token]
const [kind, portArg, token] = process.argv.slice(2)
const port = Number(portArg)
if (!Number.isInteger(port) || port <= 0) {
  console.error(`web-rpc: bad port ${JSON.stringify(portArg)}`)
  process.exit(1)
}
const base = `http://127.0.0.1:${port}`
const remote = typeof token === 'string' && token.length > 0
let cookie
if (remote) {
  const handshake = await fetch(`${base}/?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  const handshakeText = await handshake.text()
  if (handshake.status !== 303) {
    console.error(`web-rpc: token→cookie handshake: expected 303, got HTTP ${handshake.status}: ${handshakeText.slice(0, 200)}`)
    process.exit(1)
  }
  let setCookies
  if (typeof handshake.headers.getSetCookie === 'function') {
    setCookies = handshake.headers.getSetCookie()
  } else {
    console.warn('web-rpc: Node without getSetCookie (multi-cookie fallback unreliable)')
    setCookies = [handshake.headers.get('set-cookie') ?? '']
  }
  cookie = setCookies
    .map((value) => value.split(';', 1)[0])
    .find((value) => value.startsWith('dsh-auth-'))
  if (cookie === undefined) {
    console.error('web-rpc: handshake minted no dsh-auth-* cookie')
    process.exit(1)
  }
}
let counter = 0
async function rpc(endpoint, payload) {
  const rpcId = `concerto-probe-${kind}-${++counter}`
  const response = await fetch(`${base}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie === undefined ? {} : { cookie }) },
    body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload }),
    signal: AbortSignal.timeout(10_000),
  })
  const text = await response.text()
  if (response.status !== 200) {
    console.error(`web-rpc: ${endpoint}: HTTP ${response.status}: ${text.slice(0, 200)}`)
    process.exit(1)
  }
  let body
  try {
    body = JSON.parse(text)
  } catch {
    console.error(`web-rpc: ${endpoint}: non-JSON body: ${text.slice(0, 200)}`)
    process.exit(1)
  }
  if (body?.result?.ok !== true) {
    console.error(`web-rpc: ${endpoint} failed: ${text.slice(0, 200)}`)
    process.exit(1)
  }
  return body.result.value
}
if (kind === 'roster') {
  const value = remote ? await rpc('agentPresets/list', { args: {} }) : await rpc('agentPreset.list', {})
  console.log(JSON.stringify({ type: 'server-response', rpcId: 'concerto-probe-roster', result: { ok: true, value } }))
} else if (kind === 'providers') {
  let value
  if (remote) {
    const [registered, directory] = await Promise.all([
      rpc('llm/listProviders', { args: {} }),
      rpc('llm/listConfigurableProviders', { args: {} }),
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
    value = { providers }
  } else {
    value = await rpc('llm.providers', {})
  }
  console.log(JSON.stringify({ type: 'server-response', rpcId: 'concerto-probe-providers', result: { ok: true, value } }))
} else {
  console.error(`web-rpc: unknown kind ${JSON.stringify(kind)}`)
  process.exit(1)
}
EOF

# boot_once <label> <expected-sync-outcome>: real boot, bounded; asserts the
# plugin-side markers and the external roster, then SIGTERMs (exit 0).
boot_once() {
  local label="$1" expected_outcome="$2"
  local boot_log="$SANDBOX/boot-$label.log"
  local api_resp="$SANDBOX/agentPreset.list-$label.json"

  # One-time feature probe (the profile now exists, so `--help` resolves).
  if [[ -z "${NO_OPEN_PROBED:-}" ]]; then
    NO_OPEN_PROBED=1
    if dsh --profile "$PROFILE" --help 2>&1 | grep -q -- '--no-open'; then
      NO_OPEN="--no-open"
      echo "concerto-probe: web app advertises --no-open (browser handoff suppressed)"
    else
      echo "concerto-probe: web app has no --no-open (pre-0.1.2 runtime; no handoff to suppress)"
    fi
  fi

  echo "concerto-probe: [$label] booting dsh --profile $PROFILE --patch ./cordis.yml --port 0 $NO_OPEN"
  # NO_OPEN is either empty or exactly one flag; unquoted on purpose so the
  # empty case adds no argument at all. shellcheck disable=SC2086
  dsh --profile "$PROFILE" --patch ./cordis.yml --port 0 $NO_OPEN >"$boot_log" 2>&1 &
  local dsh_pid=$!

  local port=""
  local ready_url=""
  for ((i = 0; i < READY_TIMEOUT_S; i++)); do
    ready_url="$(grep -oE 'http://127\.0\.0\.1:[0-9]+(/\?token=[A-Za-z0-9_-]+)?' "$boot_log" 2>/dev/null | head -1 || true)"
    port="$(printf '%s\n' "$ready_url" | grep -oE '^http://127\.0\.0\.1:[0-9]+' | grep -oE '[0-9]+$' || true)"
    if [[ -n "$port" ]]; then
      break
    fi
    if ! kill -0 "$dsh_pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  if [[ -z "$port" ]]; then
    kill -TERM "$dsh_pid" 2>/dev/null || true
    wait "$dsh_pid" 2>/dev/null
    cat "$boot_log" >&2 || true
    fail "[$label] no readiness line within ${READY_TIMEOUT_S}s (or dsh exited early)"
  fi

  # Transport detection (T9): a launch token in the readiness line means the
  # 0.1.2 web-RPC transport (dsh-auth-* cookie + Typert Remote endpoints); its
  # absence means the rc.6 flat transport. The official roster ids follow the
  # transport: 0.1.2 renamed the system preset code → ptc.
  local token=""
  case "$ready_url" in
    *\?token=*) token="${ready_url#*\?token=}" ;;
  esac
  local official_ids="standard code minimal cordis"
  if [[ -n "$token" ]]; then
    official_ids="standard ptc minimal cordis"
  fi
  echo "concerto-probe: [$label] web ready on 127.0.0.1:$port (transport: $([[ -n "$token" ]] && echo '0.1.2-remote (token+cookie)' || echo 'rc.6-flat'))"

  # T14: runtime adapter registration surface. rc.6: POST /api/llm.providers
  # joins ctx.llm.listProviders() (registered routes) with the configurable-
  # provider directory server-side. 0.1.2: the helper performs the client's
  # own two Remote calls and applies the same join (see WEB_RPC_MJS above).
  # Settings-driven routes register during plugin load, before the readiness
  # line, so one call suffices.
  local llm_resp="$SANDBOX/llm.providers-$label.json"
  local rpc_err="$SANDBOX/web-rpc-$label.err"
  if ! node "$WEB_RPC_MJS" providers "$port" "$token" >"$llm_resp" 2>"$rpc_err"; then
    cat "$rpc_err" >&2
    fail "[$label] provider-directory RPC failed (see error above)"
  fi

  # Poll the roster RPC until the preset lands (or the budget runs out).
  # Envelope shape: {type:'client-request', rpcId, method, payload:{args}} —
  # the exact surface packages/client/ui-agent-preset uses (0.1.2: through
  # the Typert Remote projection; rc.6: the flat agentPreset.list).
  local found=0
  for ((i = 0; i < 30; i++)); do
    if node "$WEB_RPC_MJS" roster "$port" "$token" >"$api_resp" 2>"$rpc_err"; then
      if grep -q '"id":"concerto"' "$api_resp" 2>/dev/null; then
        found=1
        break
      fi
    fi
    sleep 1
  done

  kill -TERM "$dsh_pid" 2>/dev/null || true
  wait "$dsh_pid"
  local boot_exit=$?
  [[ "$boot_exit" == "0" ]] || fail "[$label] dsh exited $boot_exit after SIGTERM (expected 0)"

  echo "----- [$label] boot log (full) -----"
  cat "$boot_log"
  echo "----- [$label] roster RPC response (verbatim; rc.6 /api/agentPreset.list | 0.1.2 /api/agentPresets/list) -----"
  cat "$api_resp"
  echo
  echo "----- [$label] provider directory response (verbatim; rc.6 /api/llm.providers | 0.1.2 joined llm Remote) -----"
  cat "$llm_resp"
  echo
  if [[ -s "$rpc_err" ]]; then
    echo "----- [$label] web-rpc last error (verbatim) -----"
    cat "$rpc_err"
    echo
  fi
  echo "----------------------------------------------------------"

  # Plugin-side assertions.
  grep -q "\[omo-agents\] loaded" "$boot_log" \
    || fail "[$label] plugin load marker missing (plugin never mounted?)"
  if grep -q "\[omo-agents\] concerto .* FAILED" "$boot_log"; then
    fail "[$label] registration threw — see FAILED line above"
  fi
  grep -q "\[omo-agents\] concerto preset $expected_outcome at " "$boot_log" \
    || fail "[$label] expected sync outcome '$expected_outcome' not logged"
  grep -q "\[omo-agents\] concerto roster: " "$boot_log" \
    || fail "[$label] roster line missing (inject callback never ran?)"
  grep -q "concerto:user" "$boot_log" \
    || fail "[$label] plugin-side roster does not list concerto as a user preset"

  # External assertions: the RPC roster lists all 5 presets — the official 4 at
  # system trust plus concerto at user trust, i.e. the SAME roster level — and
  # the concerto entry carries OUR preset.yml display name (协奏 / Concerto).
  # $official_ids is transport-adaptive (0.1.2 renamed code → ptc, see above).
  for id in $official_ids; do
    grep -q "\"id\":\"$id\"" "$api_resp" \
      || fail "[$label] official preset '$id' missing from the roster RPC response"
  done
  [[ "$found" == "1" ]] \
    || fail "[$label] concerto NOT in the roster RPC after 30s — registration broken"
  grep -q '"trust":"user"[^}]*"id":"concerto"\|"id":"concerto"[^}]*"trust":"user"' "$api_resp" \
    || fail "[$label] concerto entry does not carry trust:\"user\""
  grep -q '协奏' "$api_resp" \
    || fail "[$label] concerto entry missing OUR preset.yml name (协奏) — not the real preset?"
  grep -q 'Concerto' "$api_resp" \
    || fail "[$label] concerto entry missing OUR preset.yml name (Concerto) — not the real preset?"

  # Sandbox hygiene: the authored preset must live ONLY inside the sandbox.
  [[ -f "$DSH_HOME/.agent-presets/concerto/preset.yml" ]] \
    || fail "[$label] preset missing from the sandbox user root (sync wrote elsewhere?)"

  # T8 (FR-3, AC-3): the persona the concerto mode boots with is the assembled
  # omo-sisyphus system prompt. Plugin-side marker + the materialized
  # composition carries the rendered block scalar (sentinel gone, three
  # section markers present inside it).
  grep -q "\[omo-agents\] omo-sisyphus system prompt assembled: 4 sections, " "$boot_log" \
    || fail "[$label] omo-sisyphus prompt assembly marker missing from boot log"
  local materialized="$DSH_HOME/.agent-presets/concerto/agent.cordis.yml"
  [[ -f "$materialized" ]] \
    || fail "[$label] materialized agent.cordis.yml missing from the sandbox user root"
  if grep -q "__OMO_SISYPHUS_SYSTEM_PROMPT__" "$materialized"; then
    fail "[$label] materialized composition still carries the persona sentinel (rendering skipped?)"
  fi
  grep -q "prefix: |-" "$materialized" \
    || fail "[$label] materialized persona is not a `prefix: |-` block scalar"
  grep -q "      # Orchestrator Role" "$materialized" \
    || fail "[$label] materialized persona missing the Orchestrator Role section"
  grep -q "      # Delegation Discipline" "$materialized" \
    || fail "[$label] materialized persona missing the Delegation Discipline section"
  grep -q "      ## Hard Blocks" "$materialized" \
    || fail "[$label] materialized persona missing the injected Hard Blocks section"

  # T11 (FR-4/FR-5 binding, form A): the explore tool-subagent instance is part
  # of the mounted composition. Content assertions on the materialized file,
  # then the real schema gate (the installed dsh's own Config) below.
  grep -q "^    - id: tool-subagent-explore$" "$materialized" \
    || fail "[$label] explore tool-subagent row missing from the materialized composition"
  grep -q "^        toolName: explore$" "$materialized" \
    || fail "[$label] explore row missing toolName: explore"
  grep -q "^        provider: spawn$" "$materialized" \
    || fail "[$label] explore row missing provider: spawn"
  if grep -q "__OMO_EXPLORE_PERSONA__\|__OMO_EXPLORE_AGENT_OPTIONS__" "$materialized"; then
    fail "[$label] materialized composition still carries a T11 sentinel (rendering skipped?)"
  fi
  grep -q "^        persona: |-$" "$materialized" \
    || fail "[$label] explore persona is not a |- block scalar"
  grep -q "          # Explore: Read-Only Retrieval Agent" "$materialized" \
    || fail "[$label] explore persona missing the T10 persona heading"
  grep -q "^          provider: \"$EXPLORE_PROVIDER\"$" "$materialized" \
    || fail "[$label] explore agentOptions provider mismatch (want $EXPLORE_PROVIDER)"
  grep -q "^          model: \"$EXPLORE_MODEL\"$" "$materialized" \
    || fail "[$label] explore agentOptions model mismatch (want $EXPLORE_MODEL)"
  grep -q "^          deny: \[write, edit, explore\]$" "$materialized" \
    || fail "[$label] explore toolFilter deny list missing (T12 + F1: want [write, edit, explore])"
  grep -q "^        maxDepth: 1$" "$materialized" \
    || fail "[$label] explore maxDepth: 1 missing (T13 pre-declared value)"
  node "$VALIDATE_EXPLORE_MJS" "$DSH_NM_UNION" "$materialized" "$EXPLORE_PROVIDER" "$EXPLORE_MODEL" \
    || fail "[$label] explore row failed validation against the installed dsh-tool-subagent Config"

  # T12 (P-4, AC-6 negative-a): the deny list is not just valid config — it is
  # ENFORCED. scripts/prove-explore-toolfilter.mjs runs the installed dsh's
  # REAL child-composition path (dsh-subagent applyChildComposition →
  # tools.restrict → ToolRuntime view) against THIS materialized row and
  # asserts write/edit never reach the child scope's model-facing tool list
  # (schemas/get/execute all deny), while read/grep/glob and the platform
  # shell survive. A live model session closes the loop in T20.
  node "$REPO_ROOT/scripts/prove-explore-toolfilter.mjs" "$DSH_NM_UNION" "$materialized" \
    || fail "[$label] explore toolFilter denial proof failed (T12 real-path enforcement)"

  # T13 (P-5, AC-6 negative-b): the depth cap is not just valid config — it is
  # ENFORCED. scripts/prove-explore-maxdepth.mjs mounts the row's own
  # dsh-tool-subagent instance on the REAL delegation stack (cordis +
  # ToolRuntime + SubagentRuntime + the spawn provider) and drives the real
  # start path: a depth-1 parent's nested-delegation attempt is rejected on
  # BOTH the foreground (ctx.subagents.start → spawn → startInProcessRun) and
  # continuable (ctx.subagents.startContinuable) starts with the exact errored
  # tool result "Error: subagent depth 2 exceeds maxDepth 1"; the tool stays
  # model-visible at the cap; a depth-0 parent passes the same gate (control).
  # A live model session closes the loop in T20.
  node "$REPO_ROOT/scripts/prove-explore-maxdepth.mjs" "$DSH_NM_UNION" "$materialized" \
    || fail "[$label] explore maxDepth=1 depth-cap proof failed (T13 real-path enforcement)"

  # T15 (P-7, AC-5 observation half): the session JSONL is the route
  # observation channel — no listener code needed. prove-route-logging.mjs
  # boots the FULL real stack from the installed rc.6 (the five testkit
  # services + JsonlSessionPersistence plaintext + AgentLoop +
  # SubagentRuntime + the spawn provider), registers scripted mock adapters
  # on OUR two real route names (from src/model-routes.ts), runs one parent
  # turn and one real continuable explore-style start, then reads the real
  # artifacts off disk: the child's `subagent/descriptor` must carry the
  # resolved explore route (data.agentProvider/agentModel), both agents'
  # `request/header` must carry their executed routes (data.header.config),
  # the two routes must differ, and each dispatch must reach its adapter.
  # The --expect unlogged mode proves the verdict logic honestly falls back
  # to 'self-listener-needed' when route fields are absent. A live model
  # session closes the loop in T20.
  node "$REPO_ROOT/scripts/prove-route-logging.mjs" "$DSH_NM_UNION" \
    || fail "[$label] route-logging proof failed (T15 real-path observation)"
  node "$REPO_ROOT/scripts/prove-route-logging.mjs" "$DSH_NM_UNION" --expect unlogged \
    || fail "[$label] route-logging verdict logic failed its fabricated-log QA (T15)"

  # T16 (FR-6, P-3): the Hard Blocks injection listener's registration is
  # observable at boot. Wording pinned to the plugin's marker; it must stay
  # free of error/fatal/failed vocabulary so cold-start's negative greps
  # remain clean on the happy path.
  grep -q "\[omo-agents\] hard-blocks injection listener registered on agent/pre-step" "$boot_log" \
    || fail "[$label] hard-blocks injection registration marker missing from boot log"
  if grep -q "\[omo-agents\] hard-blocks injection FAILED" "$boot_log"; then
    fail "[$label] hard-blocks injection registration threw — see FAILED line above"
  fi

  # T10 (FR-4): the omo-explore subagent persona assembles at apply() time
  # under the real boot environment (P-9 resolution proof for the new
  # markdown file). Marker wording pinned; same error-vocabulary discipline
  # as T16. No roster assertion: explore is a subagent persona, not a preset.
  grep -q "\[omo-agents\] omo-explore persona assembled: 1 section, " "$boot_log" \
    || fail "[$label] omo-explore persona assembly marker missing from boot log"
  if grep -q "\[omo-agents\] omo-explore persona FAILED" "$boot_log"; then
    fail "[$label] omo-explore persona assembly threw at boot — see FAILED line above"
  fi

  # T14 (FR-5, P-2; AC-5 config half): the plugin resolved and validated the
  # two distinct route pairs at apply() time (marker wording pinned), and
  # BOTH adapters our dual routing depends on (Q-3) hold REGISTERED routes at
  # runtime — the sisyphus seat's provider from the llm-deepseek adapter's
  # entry config, the explore seat's provider from the llm-pi-ai adapter via
  # the settings profile seeded above. Registration is the gate; no live
  # model call is made (no API keys in the sandbox).
  grep -q "\[omo-agents\] model routes: sisyphus=$SISYPHUS_PROVIDER/$SISYPHUS_MODEL explore=$EXPLORE_PROVIDER/$EXPLORE_MODEL" "$boot_log" \
    || fail "[$label] model-routes marker missing or mismatched (plugin resolved different routes than the probe?)"
  if grep -q "\[omo-agents\] model routes FAILED" "$boot_log"; then
    fail "[$label] model-routes resolution threw at boot — see FAILED line above"
  fi
  grep -q "\"provider\":\"$SISYPHUS_PROVIDER\"[^}]*\"active\":true" "$llm_resp" \
    || fail "[$label] sisyphus provider '$SISYPHUS_PROVIDER' not ACTIVE in the provider directory (llm-deepseek adapter registration broken?)"
  grep -q "\"provider\":\"$EXPLORE_PROVIDER\"[^}]*\"active\":true" "$llm_resp" \
    || fail "[$label] explore provider '$EXPLORE_PROVIDER' not ACTIVE in the provider directory (llm-pi-ai settings-profile registration broken?)"
}

# Boot 1: fresh sandbox — the preset is materialized.
boot_once fresh materialized
# Boot 2: SAME sandbox $DSH_HOME — re-registration must be a content-identical
# no-op and the roster must stay correct (idempotence proof).
boot_once again unchanged

echo "concerto-probe: PASS (dsh $(dsh --version)): 协奏模式 / Concerto Mode registered at roster level (trust:user, name from our preset.yml) via apply-time authoring; observable over the web roster RPC (transport-adaptive T9: /api/agentPreset.list on rc.6, /api/agentPresets/list through the token-authenticated Typert Remote gateway on 0.1.2); persona = assembled omo-sisyphus system prompt (sentinel rendered, 3 section markers in the materialized composition); hard-blocks injection listener registration observable at boot (agent/pre-step marker, both boots); omo-explore persona assembled at boot (1 section marker, both boots; subagent artifact — T11 binds it as the tool-subagent persona config); T14 dual routes resolved (sisyphus=$SISYPHUS_PROVIDER/$SISYPHUS_MODEL explore=$EXPLORE_PROVIDER/$EXPLORE_MODEL) with BOTH providers active in the provider directory (transport-adaptive T9: /api/llm.providers on rc.6, llm/listProviders joined with llm/listConfigurableProviders on 0.1.2); T11 explore delegation tool bound (toolName=explore, sentinels rendered, persona+route in the materialized row, pre-declared toolFilter/maxDepth) and the row VALIDATED against the installed dsh-tool-subagent Config (eager run of the schema dsh applies lazily at session composition); T12+F1 toolFilter deny=[write,edit,explore] PROVEN enforced via the real child-composition path (applyChildComposition → tools.restrict → child scope view excludes write/edit/the delegation tool, execution UNKNOWN_TOOL, read/grep/glob/shell retained, parent untouched); T13 maxDepth=1 depth cap PROVEN enforced via the real delegation start path (depth-1 parent rejected on BOTH foreground and continuable starts with errored tool result "Error: subagent depth 2 exceeds maxDepth 1", tool stays visible at the cap, depth-0 control passes); idempotent re-boot confirmed"
exit 0
