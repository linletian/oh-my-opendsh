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
#   external    — POST /api/agentPreset.list (the Web UI picker's own RPC
#                 surface) lists concerto at trust "user" alongside
#                 standard/code/minimal/cordis at trust "system", with the
#                 name from OUR preset.yml (协奏 / Concerto).
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

command -v curl >/dev/null || fail "curl not found (probe needs it for POST /api/agentPreset.list)"

echo "concerto-probe: sandbox: $SANDBOX"
echo "concerto-probe: dsh binary: $(command -v dsh)"
dsh --version || fail "dsh --version failed"

# Stage 0: fresh profile + install the plugin into it.
echo "concerto-probe: installing @oh-my-opendsh/omo-agents into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-agents" >"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add failed (see $ADD_LOG)"

# boot_once <label> <expected-sync-outcome>: real boot, bounded; asserts the
# plugin-side markers and the external roster, then SIGTERMs (exit 0).
boot_once() {
  local label="$1" expected_outcome="$2"
  local boot_log="$SANDBOX/boot-$label.log"
  local api_resp="$SANDBOX/agentPreset.list-$label.json"

  echo "concerto-probe: [$label] booting dsh --profile $PROFILE --patch ./cordis.yml --port 0"
  dsh --profile "$PROFILE" --patch ./cordis.yml --port 0 >"$boot_log" 2>&1 &
  local dsh_pid=$!

  local port=""
  for ((i = 0; i < READY_TIMEOUT_S; i++)); do
    port="$(grep -oE 'http://127\.0\.0\.1:[0-9]+' "$boot_log" 2>/dev/null | head -1 | grep -oE '[0-9]+$' || true)"
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
  echo "concerto-probe: [$label] web ready on 127.0.0.1:$port"

  # Poll the roster RPC until the preset lands (or the budget runs out).
  # Envelope shape: {type:'client-request', rpcId, method, payload} — the exact
  # surface packages/client/ui-agent-preset uses.
  local found=0
  for ((i = 0; i < 30; i++)); do
    curl -sS -m 5 -X POST "http://127.0.0.1:$port/api/agentPreset.list" \
      -H 'content-type: application/json' \
      -d "{\"type\":\"client-request\",\"rpcId\":\"concerto-probe-$label\",\"method\":\"agentPreset.list\",\"payload\":{}}" \
      >"$api_resp" 2>/dev/null || true
    if grep -q '"id":"concerto"' "$api_resp" 2>/dev/null; then
      found=1
      break
    fi
    sleep 1
  done

  kill -TERM "$dsh_pid" 2>/dev/null || true
  wait "$dsh_pid"
  local boot_exit=$?
  [[ "$boot_exit" == "0" ]] || fail "[$label] dsh exited $boot_exit after SIGTERM (expected 0)"

  echo "----- [$label] boot log (full) -----"
  cat "$boot_log"
  echo "----- [$label] POST /api/agentPreset.list response (verbatim) -----"
  cat "$api_resp"
  echo
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
  for id in standard code minimal cordis; do
    grep -q "\"id\":\"$id\"" "$api_resp" \
      || fail "[$label] official preset '$id' missing from /api/agentPreset.list"
  done
  [[ "$found" == "1" ]] \
    || fail "[$label] concerto NOT in /api/agentPreset.list after 30s — registration broken"
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
  grep -q "text: |-" "$materialized" \
    || fail "[$label] materialized persona is not a |- block scalar"
  grep -q "      # Orchestrator Role" "$materialized" \
    || fail "[$label] materialized persona missing the Orchestrator Role section"
  grep -q "      # Delegation Discipline" "$materialized" \
    || fail "[$label] materialized persona missing the Delegation Discipline section"
  grep -q "      ## Hard Blocks" "$materialized" \
    || fail "[$label] materialized persona missing the injected Hard Blocks section"

  # T16 (FR-6, P-3): the Hard Blocks injection listener's registration is
  # observable at boot. Wording pinned to the plugin's marker; it must stay
  # free of error/fatal/failed vocabulary so cold-start's negative greps
  # remain clean on the happy path.
  grep -q "\[omo-agents\] hard-blocks injection listener registered on agent/pre-step" "$boot_log" \
    || fail "[$label] hard-blocks injection registration marker missing from boot log"
  if grep -q "\[omo-agents\] hard-blocks injection FAILED" "$boot_log"; then
    fail "[$label] hard-blocks injection registration threw — see FAILED line above"
  fi
}

# Boot 1: fresh sandbox — the preset is materialized.
boot_once fresh materialized
# Boot 2: SAME sandbox $DSH_HOME — re-registration must be a content-identical
# no-op and the roster must stay correct (idempotence proof).
boot_once again unchanged

echo "concerto-probe: PASS (dsh $(dsh --version)): 协奏模式 / Concerto Mode registered at roster level (trust:user, name from our preset.yml) via apply-time authoring; observable over POST /api/agentPreset.list; persona = assembled omo-sisyphus system prompt (sentinel rendered, 3 section markers in the materialized composition); hard-blocks injection listener registration observable at boot (agent/pre-step marker, both boots); idempotent re-boot confirmed"
exit 0
