#!/usr/bin/env bash
# scripts/cold-start.sh — sandboxed dsh cold-start smoke for the omo-agents
# plugin (AC-1). Creates a throwaway sandbox with HOME / XDG_CONFIG_HOME /
# DSH_HOME / DSH_AGENTS_HOME redirected into it (the developer's real ~/.dsh
# and ~/.config are never touched), installs the plugin into a fresh web
# profile, boots `dsh --profile web --patch ./cordis.yml`, waits for the
# readiness line, terminates with SIGTERM, and greps the captured log for
# plugin load errors. Exits 0 only if every check is clean.
#
# Learned flags (P-8): `--profile <name>` is required; `--patch` is a ROOT
# flag and must precede app flags (e.g. `--port`) — once the app's own flags
# begin, everything after them is forwarded to the app and `--patch` errors
# with "unknown option '--patch'".

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROFILE="web"
READY_TIMEOUT_S="${COLD_START_READY_TIMEOUT_S:-90}"
INSTALL_TIMEOUT_S="${COLD_START_INSTALL_TIMEOUT_S:-300}"

SANDBOX="$(mktemp -d /tmp/omo-dsh-cold-start.XXXXXX)"
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
DUMP_OUT="$SANDBOX/dump.out"
DUMP_ERR="$SANDBOX/dump.err"
BOOT_LOG="$SANDBOX/boot.log"

fail() {
  echo "cold-start: FAIL: $*" >&2
  echo "----- boot log ($BOOT_LOG) -----" >&2
  cat "$BOOT_LOG" 2>/dev/null >&2 || true
  exit 1
}

echo "cold-start: sandbox: $SANDBOX"
echo "cold-start: dsh binary: $(command -v dsh)"
dsh --version || fail "dsh --version failed"

# Stage 0: fresh profile + install the plugin into it (forwards to pnpm in
# the sandbox profile dir; writes stay inside the sandbox).
echo "cold-start: installing @oh-my-opendsh/omo-agents into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-agents" >"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add failed (see $ADD_LOG)"

# Stage A: composition check (no boot). --dump-config prints the composed
# tree and surfaces unmatched-patch warnings on stderr.
echo "cold-start: composing profile with --dump-config"
dsh --profile "$PROFILE" --dump-config --patch ./cordis.yml >"$DUMP_OUT" 2>"$DUMP_ERR" \
  || fail "--dump-config failed: $(cat "$DUMP_ERR")"
grep -q "name: '@oh-my-opendsh/omo-agents'" "$DUMP_OUT" \
  || fail "composed tree does not contain the omo-agents row (patch silently skipped?)"
if grep -qE "not found|mismatch|failed" "$DUMP_ERR"; then
  fail "patch warnings on stderr: $(cat "$DUMP_ERR")"
fi

# Stage B: real boot, bounded. Readiness = the `dsh web: <url>` line on
# stdout; SIGTERM shuts dsh down with exit 0.
echo "cold-start: booting dsh --profile $PROFILE --patch ./cordis.yml --port 0"
dsh --profile "$PROFILE" --patch ./cordis.yml --port 0 >"$BOOT_LOG" 2>&1 &
DSH_PID=$!

ready=0
for ((i = 0; i < READY_TIMEOUT_S; i++)); do
  if grep -q "dsh web:" "$BOOT_LOG" 2>/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$DSH_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ "$ready" != "1" ]]; then
  kill -TERM "$DSH_PID" 2>/dev/null || true
  wait "$DSH_PID" 2>/dev/null
  fail "no readiness line within ${READY_TIMEOUT_S}s (or dsh exited early)"
fi

# Give the loader a moment to settle, then terminate.
sleep 2
kill -TERM "$DSH_PID" 2>/dev/null || true
wait "$DSH_PID"
boot_exit=$?
[[ "$boot_exit" == "0" ]] || fail "dsh exited $boot_exit after SIGTERM (expected 0)"

# Positive signal: our plugin actually loaded.
grep -q "\[omo-agents\] loaded (no-op)" "$BOOT_LOG" \
  || fail "plugin load marker missing from boot log (plugin never mounted?)"

# Negative signal: no plugin load errors anywhere in the log.
if grep -inE "failed to (import|load|apply)|plugin tree failed to load|plugin\(s\) failed to load|fatal load failure|did not activate|unknown option|patch: entry .* not found|name mismatch|\berror\b|\bfatal\b|\bfailed\b" "$BOOT_LOG"; then
  fail "plugin load error patterns found in boot log (see matches above)"
fi

echo "----- boot log (full) -----"
cat "$BOOT_LOG"
echo "---------------------------"
echo "cold-start: PASS (dsh $(dsh --version), profile=$PROFILE, ready within ${READY_TIMEOUT_S}s, SIGTERM exit $boot_exit, log clean)"
exit 0
