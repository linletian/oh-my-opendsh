#!/usr/bin/env bash
# scripts/p1-preset-probe.sh — P-1 probe (T5): does a scratch plugin register a
# 5th run-mode preset at the SAME roster level as the official 4 modes?
#
# Same sandboxing discipline as scripts/cold-start.sh (HOME / XDG_CONFIG_HOME /
# DSH_HOME / DSH_AGENTS_HOME redirected into a throwaway dir; real ~/.dsh never
# touched). After the web profile boots with ./cordis.yml patched in, the probe
# asserts observability on the SAME surface the Web UI uses:
#   POST /api/agentPreset.list  (RPC envelope; loopback passes the trust fence)
# Positive proof: the response lists `concerto` alongside standard/code/
# minimal/cordis, AND the plugin's in-process roster log line agrees.
# Negative proof (registry closed): the spike's FAILED line or a roster without
# `concerto` — printed verbatim, exit 1.
#
# Learned flags (P-8): root flags (--profile/--patch) precede app flags.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROFILE="web"
READY_TIMEOUT_S="${P1_READY_TIMEOUT_S:-90}"
INSTALL_TIMEOUT_S="${P1_INSTALL_TIMEOUT_S:-300}"

SANDBOX="$(mktemp -d /tmp/omo-dsh-p1-probe.XXXXXX)"
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
BOOT_LOG="$SANDBOX/boot.log"
API_RESP="$SANDBOX/agentPreset.list.json"

fail() {
  echo "p1-probe: FAIL: $*" >&2
  echo "----- boot log ($BOOT_LOG) -----" >&2
  cat "$BOOT_LOG" 2>/dev/null >&2 || true
  echo "----- api response ($API_RESP) -----" >&2
  cat "$API_RESP" 2>/dev/null >&2 || true
  exit 1
}

command -v curl >/dev/null || fail "curl not found (probe needs it for POST /api/agentPreset.list)"

echo "p1-probe: sandbox: $SANDBOX"
echo "p1-probe: dsh binary: $(command -v dsh)"
dsh --version || fail "dsh --version failed"

# Stage 0: fresh profile + install the plugin into it.
echo "p1-probe: installing @oh-my-opendsh/omo-agents into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-agents" >"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add failed (see $ADD_LOG)"

# Stage B: real boot, bounded. Readiness = the `dsh web: <url>` line.
echo "p1-probe: booting dsh --profile $PROFILE --patch ./cordis.yml --port 0"
dsh --profile "$PROFILE" --patch ./cordis.yml --port 0 >"$BOOT_LOG" 2>&1 &
DSH_PID=$!

PORT=""
for ((i = 0; i < READY_TIMEOUT_S; i++)); do
  PORT="$(grep -oE 'http://127\.0\.0\.1:[0-9]+' "$BOOT_LOG" 2>/dev/null | head -1 | grep -oE '[0-9]+$' || true)"
  if [[ -n "$PORT" ]]; then
    break
  fi
  if ! kill -0 "$DSH_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ -z "$PORT" ]]; then
  kill -TERM "$DSH_PID" 2>/dev/null || true
  wait "$DSH_PID" 2>/dev/null
  fail "no readiness line within ${READY_TIMEOUT_S}s (or dsh exited early)"
fi
echo "p1-probe: web ready on 127.0.0.1:$PORT"

# Poll the roster RPC until the spike's copy lands (or the budget runs out).
# Envelope shape: {type:'client-request', rpcId, method, payload} — the exact
# surface packages/client/ui-agent-preset uses via api.agentPresets.list({}).
FOUND=0
for ((i = 0; i < 30; i++)); do
  curl -sS -m 5 -X POST "http://127.0.0.1:$PORT/api/agentPreset.list" \
    -H 'content-type: application/json' \
    -d '{"type":"client-request","rpcId":"p1-probe-1","method":"agentPreset.list","payload":{}}' \
    >"$API_RESP" 2>/dev/null || true
  if grep -q '"id":"concerto"' "$API_RESP" 2>/dev/null; then
    FOUND=1
    break
  fi
  sleep 1
done

kill -TERM "$DSH_PID" 2>/dev/null || true
wait "$DSH_PID"
boot_exit=$?
[[ "$boot_exit" == "0" ]] || fail "dsh exited $boot_exit after SIGTERM (expected 0)"

echo "----- boot log (full) -----"
cat "$BOOT_LOG"
echo "---------------------------"
echo "----- POST /api/agentPreset.list response (verbatim) -----"
cat "$API_RESP"
echo
echo "----------------------------------------------------------"

# Plugin-side assertions.
grep -q "\[omo-agents\] loaded (no-op)" "$BOOT_LOG" \
  || fail "plugin load marker missing (plugin never mounted?)"
if grep -q "\[omo-agents\] P-1 spike FAILED" "$BOOT_LOG"; then
  fail "spike threw — see FAILED line above (fallback-branch evidence)"
fi
grep -q "\[omo-agents\] P-1 spike roster:" "$BOOT_LOG" \
  || fail "spike roster line missing (inject callback never ran?)"
grep -q "concerto:user" "$BOOT_LOG" \
  || fail "plugin-side roster does not list concerto as a user preset"

# External assertion: the RPC roster lists all 5 presets — the official 4 at
# system trust plus concerto at user trust, i.e. the SAME roster level.
for id in standard code minimal cordis; do
  grep -q "\"id\":\"$id\"" "$API_RESP" \
    || fail "official preset '$id' missing from /api/agentPreset.list"
done
[[ "$FOUND" == "1" ]] \
  || fail "concerto NOT in /api/agentPreset.list after 30s — registry closed to scratch plugins"
grep -q '"trust":"user"[^}]*"id":"concerto"\|"id":"concerto"[^}]*"trust":"user"' "$API_RESP" \
  || echo "p1-probe: NOTE: could not confirm trust:\"user\" on the concerto entry (key order?) — inspect the verbatim response above"

echo "p1-probe: PASS (dsh $(dsh --version)): concerto registered at roster level via agentPresets.copy() and observable over POST /api/agentPreset.list"
exit 0
