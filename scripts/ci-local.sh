#!/usr/bin/env bash
# scripts/ci-local.sh — local twin of .github/workflows/ci.yml (plan T22).
# Runs the exact same green-set gate chain, in the same order, and exits
# non-zero at the FIRST failing stage. No `|| true`, no skipped stages —
# every gate is honest.
#
# The workflow installs deps (`pnpm install --frozen-lockfile`) and the dsh
# binary (exact-pinned per D7) as setup steps before the chain; locally your
# node_modules and dsh install are assumed ready, so this script starts at
# gate 1. Keep the chain below byte-equivalent to the workflow's gate steps.
#
# Usage: scripts/ci-local.sh
# Exit:  0 = all gates green; N = the failing gate's own exit code.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

STAGE=0

run_gate() {
  local name="$1"
  shift
  STAGE=$((STAGE + 1))
  echo ""
  echo "=============================================================="
  echo "ci-local: gate ${STAGE}/5 — ${name}"
  echo "ci-local: \$ $*"
  echo "=============================================================="
  "$@"
  local rc=$?
  if [[ "$rc" != "0" ]]; then
    echo ""
    echo "ci-local: FAIL at gate ${STAGE}/5 (${name}) — exit ${rc}" >&2
    exit "$rc"
  fi
  echo "ci-local: gate ${STAGE}/5 (${name}) — PASS"
}

run_gate "typecheck"          pnpm typecheck
run_gate "unit tests"         pnpm vitest run
run_gate "mock-LLM e2e"       pnpm test:e2e
run_gate "doctor-lite"        node scripts/doctor-lite.mjs --json
run_gate "license compliance" scripts/verify-licenses.sh

echo ""
echo "ci-local: PASS — all 5 gates green (same chain as .github/workflows/ci.yml)"
exit 0
