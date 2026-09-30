#!/usr/bin/env bash
# scripts/cold-start.sh — sandboxed dsh cold-start smoke for the omo-agents
# plugin (AC-1), the omo-hooks plugin (P3-T3) and the omo-commands plugin
# (P4-T3). Creates a throwaway sandbox with HOME / XDG_CONFIG_HOME / DSH_HOME /
# DSH_AGENTS_HOME redirected into it (the developer's real ~/.dsh and ~/.config
# are never touched), installs ALL THREE packages into a fresh web profile (the
# root cordis.yml inserts one row per package — see its header), boots
# `dsh --profile web --patch ./cordis.yml`, waits for the readiness line,
# terminates with SIGTERM, and greps the captured log for the three load markers
# (`[omo-agents] loaded` / `[omo-hooks] loaded` / `[omo-commands] loaded`) and for
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

# Stage 0: fresh profile + install ALL THREE plugins into it (forwards to pnpm
# in the sandbox profile dir; writes stay inside the sandbox). Three `plugin
# add` calls (two since P3-T3, the third added by P4-T3): the cordis.yml overlay
# carries one insert row per package, so a profile missing any one of them cannot
# compose the overlay at all — the boot fails naming THAT package's row.
echo "cold-start: installing @oh-my-opendsh/omo-agents into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-agents" >"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add (omo-agents) failed (see $ADD_LOG)"
echo "cold-start: installing @oh-my-opendsh/omo-hooks into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-hooks" >>"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add (omo-hooks) failed (see $ADD_LOG)"
echo "cold-start: installing @oh-my-opendsh/omo-commands into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-commands" >>"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add (omo-commands) failed (see $ADD_LOG)"

# Stage A: composition check (no boot). --dump-config prints the composed
# tree and surfaces unmatched-patch warnings on stderr.
echo "cold-start: composing profile with --dump-config"
dsh --profile "$PROFILE" --dump-config --patch ./cordis.yml >"$DUMP_OUT" 2>"$DUMP_ERR" \
  || fail "--dump-config failed: $(cat "$DUMP_ERR")"
grep -q "name: '@oh-my-opendsh/omo-agents'" "$DUMP_OUT" \
  || fail "composed tree does not contain the omo-agents row (patch silently skipped?)"
# P3-T3: the second insert row must compose too — the hooks plugin's listeners
# are only mounted when this row resolves from the profile directory.
grep -q "name: '@oh-my-opendsh/omo-hooks'" "$DUMP_OUT" \
  || fail "composed tree does not contain the omo-hooks row (patch silently skipped?)"
# P4-T3: and so must the third — the command surface only mounts when its row
# resolves (the composition-level half; the boot-marker grep below is the other).
grep -q "name: '@oh-my-opendsh/omo-commands'" "$DUMP_OUT" \
  || fail "composed tree does not contain the omo-commands row (patch silently skipped?)"
# T14: both built-in LLM adapters our dual routing depends on (Q-3) must be
# part of the composed tree — the composition-level half of the adapter gate
# (the runtime-registration half lives in scripts/concerto-mode-probe.sh).
grep -q "name: '@deepseek-ai/dsh-llm-deepseek'" "$DUMP_OUT" \
  || fail "composed tree missing the dsh-llm-deepseek adapter row (sisyphus route)"
grep -q "name: '@deepseek-ai/dsh-llm-pi-ai'" "$DUMP_OUT" \
  || fail "composed tree missing the dsh-llm-pi-ai adapter row (explore route)"
if grep -qE "not found|mismatch|failed" "$DUMP_ERR"; then
  fail "patch warnings on stderr: $(cat "$DUMP_ERR")"
fi

# Stage B: real boot, bounded. Readiness = the `dsh web: <url>` line on
# stdout; SIGTERM shuts dsh down with exit 0.
#
# `--no-open` is FEATURE-PROBED, not assumed. From dsh 0.1.2 the web app hands
# off to the default browser unless suppressed, but the flag did not exist
# before then and the app's commander errors on an unknown option (P-8.2's
# class: root flags and app flags live in different parsers). A hardcoded
# `--no-open` would therefore make every pre-0.1.2 run — including
# scripts/compat-probe.sh's deliberate old-version probes — die with
# `error: unknown option`, which reads as a harness bug rather than a version
# fact. Ask the app itself instead (docs/dsh-0.1.5-rc.1-review.md §7.6).
NO_OPEN=""
if dsh --profile "$PROFILE" --help 2>&1 | grep -q -- '--no-open'; then
  NO_OPEN="--no-open"
  echo "cold-start: web app advertises --no-open (browser handoff suppressed)"
else
  echo "cold-start: web app has no --no-open (pre-0.1.2 runtime; no handoff to suppress)"
fi
echo "cold-start: booting dsh --profile $PROFILE --patch ./cordis.yml --port 0 $NO_OPEN"
# shellcheck disable=SC2086 # NO_OPEN is either empty or exactly one flag
dsh --profile "$PROFILE" --patch ./cordis.yml --port 0 $NO_OPEN >"$BOOT_LOG" 2>&1 &
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

# Positive signal: our plugins actually loaded (T6 dropped the "(no-op)"
# suffix — the plugin now performs concerto preset registration). P3-T3 adds the
# hooks half: `[omo-hooks] loaded: manifest 14 entries (…)` is the summary boot
# marker emitted after validateManifest accepted the roster (14 since P3-T5
# removed H-01; P3-T5 also made it emit one `registered` line). P4-T3 adds the
# command half: `[omo-commands] loaded: manifest 6 entries (pending=6, ported=0)
# — 0/6 commands registered`. The grep is on the PREFIX only (counts evolve per
# task; scripts/concerto-mode-probe.sh is the place that pins the full line,
# re-derived from the plugin's own manifest.ts + boot-markers.ts).
grep -q "\[omo-agents\] loaded" "$BOOT_LOG" \
  || fail "plugin load marker missing from boot log (plugin never mounted?)"
grep -q "\[omo-hooks\] loaded" "$BOOT_LOG" \
  || fail "omo-hooks load marker missing from boot log (hooks plugin never mounted?)"
grep -q "\[omo-commands\] loaded" "$BOOT_LOG" \
  || fail "omo-commands load marker missing from boot log (command plugin never mounted?)"

# Negative signal: no plugin load errors anywhere in the log.
# NB: the generic words error/fatal/failed are scoped to plugin context
# (plugin.*word | word.*plugin). The bare \berror\b|\bfatal\b|\bfailed\b
# alternatives were dropped because harmless INFO lines (e.g. "0 errors",
# "request failed → retried") tripped them as false positives; the specific
# load-failure markers above remain the authoritative signal.
if grep -inE "failed to (import|load|apply)|plugin tree failed to load|plugin\(s\) failed to load|fatal load failure|did not activate|unknown option|patch: entry .* not found|name mismatch|plugin.*(error|failed|fatal)|(error|failed|fatal).*plugin" "$BOOT_LOG"; then
  fail "plugin load error patterns found in boot log (see matches above)"
fi

echo "----- boot log (full) -----"
cat "$BOOT_LOG"
echo "---------------------------"
echo "cold-start: PASS (dsh $(dsh --version), profile=$PROFILE, ready within ${READY_TIMEOUT_S}s, SIGTERM exit $boot_exit, log clean)"
exit 0
