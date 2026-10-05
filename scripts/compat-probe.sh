#!/usr/bin/env bash
# scripts/compat-probe.sh — LOCAL probe of our released concerto layer against
# a NEW upstream dsh version (an `untested` row in .omo/compat.yaml).
# Zero LLM cost for the automatic part; exactly one manual real-model step
# remains at the end. Local-first by design — no cloud resources.
#
# Usage: scripts/compat-probe.sh <dsh-version> [--tag <our-tag>] [--keep]
# Steps (hermetic — your real ~/.dsh and the global npm install are never
# touched):
#   1. npm-install dsh@<version> into a temp prefix (PATH-prepended)
#   2. install the concerto preset from our tag into a temp DSH_HOME
#      (NO_PIAI=1 + EXPLORE_PROVIDER/EXPLORE_MODEL — the sandbox has no
#      credentials, so this probes the mechanism, not the pi-ai route)
#   3. zero-cost runtime gates against the NEW dsh:
#      a. doctor-lite --json — version pin + cordis dialect + adapter
#         composition + dsh-tool-subagent schema (schema drift caught here)
#      b. mock-LLM e2e drive — boots the REAL new dsh binary against a mock
#         LLM server (its assertions were written against the pinned rc, so a
#         FAIL here is a TRIAGE signal, not automatically a dsh bug)
#   4. prints the ONE manual step: real-model concerto_verify in a session
#      using this sandbox, then move the matrix row to `tested` and commit.
#
# Log: .omo/evidence/probes/probe-dsh-<version>-<ts>.log

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DSHV="${1:-}"
OUR_TAG="v0.1"
KEEP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) OUR_TAG="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    *) break ;;
  esac
done

if [[ -z "$DSHV" ]]; then
  echo "usage: scripts/compat-probe.sh <dsh-version> [--tag <our-tag>] [--keep]" >&2
  exit 64
fi

if [[ ! -x node_modules/.bin/vitest ]]; then
  echo "compat-probe: installing frozen deps (pnpm install --frozen-lockfile)"
  pnpm install --frozen-lockfile
fi

TMP="$(mktemp -d)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p .omo/evidence/probes
LOG=".omo/evidence/probes/probe-dsh-${DSHV}-${TS}.log"

{
  echo "compat-probe: dsh ${DSHV} against our tag ${OUR_TAG} — ${TS}"
  echo "sandbox: ${TMP}"

  echo "--- install dsh@${DSHV} (temp prefix) ---"
  npm install --global --prefix "$TMP/prefix" "@deepseek-ai/dsh@${DSHV}"
  export PATH="$TMP/prefix/bin:$PATH"
  VER="$(dsh --version)"
  echo "dsh --version: ${VER}"
  if [[ "$VER" != "$DSHV" ]]; then
    echo "compat-probe: FAIL — version mismatch (want ${DSHV})"
    exit 3
  fi

  echo "--- install concerto preset from ${OUR_TAG} (temp DSH_HOME) ---"
  mkdir -p "$TMP/dsh-home"
  DSH_HOME="$TMP/dsh-home" NO_PIAI=1 EXPLORE_PROVIDER=deepseek-official \
    EXPLORE_MODEL=deepseek-v4-flash sh scripts/install-concerto.sh

  echo "--- doctor-lite (against the NEW dsh) ---"
  if node scripts/doctor-lite.mjs --json; then
    echo "doctor-lite: PASS"
  else
    echo "doctor-lite: FAIL — triage needed (see .omo/evidence/probes/${LOG##*/})"
  fi

  echo "--- mock-LLM e2e (boots the REAL new dsh binary) ---"
  if pnpm test:e2e; then
    echo "e2e: PASS — strong signal"
  else
    echo "e2e: FAIL — triage needed (the drive asserts rc-era contracts; a FAIL may be assertion drift, not a dsh regression)"
  fi

  echo "--- automatic part done ---"
} 2>&1 | tee "$LOG"

echo ""
echo "compat-probe: automatic part finished. Log: ${LOG}"
echo "sandbox kept at: ${TMP}"
echo "  DSH_HOME=${TMP}/dsh-home   dsh binary=${TMP}/prefix/bin/dsh"
echo ""
echo "ONE manual step remains (real-model, local):"
echo "  1. start a dsh session with DSH_HOME=${TMP}/dsh-home and"
echo "     PATH=${TMP}/prefix/bin:\$PATH"
echo "  2. activate the plugin from patches/omo-dsh/omo-agents-current/concerto-plugin.host.js"
echo "     (cordis_define kind:new + cordis_run)"
echo "  3. run concerto_verify; keep its evidence under .omo/evidence/"
echo "  4. move the matrix row to \`tested\` in .omo/compat.yaml, re-render, commit"
if [[ "$KEEP" != "1" ]]; then
  echo "(pass --keep to keep the sandbox across reboots; otherwise it lives until cleanup)"
fi
