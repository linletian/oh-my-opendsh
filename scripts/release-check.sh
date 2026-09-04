#!/usr/bin/env bash
# scripts/release-check.sh — the LOCAL release gate (see docs/release-process
# §5/§6). By design, the cloud CI mirrors only the zero-cost L0/L1 gates; the
# real-model L2 acceptance (concerto_verify, 22 checks) runs on THIS machine,
# so this script is the only place the full chain and the L2 evidence
# freshness are enforced together. Local-first: no secrets, no cloud LLM.
#
# Gate chain (first failure exits non-zero, same style as ci-local.sh):
#   1-5. scripts/ci-local.sh        L0+L1 — typecheck / unit / mock-LLM e2e /
#                                     doctor-lite / license (zero LLM cost)
#   6.   node scripts/verify-concerto-static.mjs
#   7.   node scripts/check-docs-consistency.mjs
#   8.   L2 evidence (per matrix row)  EVERY tested row in .omo/compat.yaml
#                                     has a fresh record with the canonical
#                                     `**PASS — N passed, 0 failed` marker
#                                     (scripts/check-l2-evidence.mjs; window
#                                     via VERIFY_FRESH_DAYS, default 7 days)
#
# Usage: scripts/release-check.sh
# Exit: 0 = all gates green; N = the failing gate's own exit code.

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
  echo "release-check: gate ${STAGE}/8 — ${name}"
  echo "release-check: \$ $*"
  echo "=============================================================="
  "$@"
  local rc=$?
  if [[ "$rc" != "0" ]]; then
    echo ""
    echo "release-check: FAIL at gate ${STAGE}/8 (${name}) — exit ${rc}" >&2
    exit "$rc"
  fi
  echo "release-check: gate ${STAGE}/8 (${name}) — PASS"
}

# Preflight: repo deps + dsh (the chain below assumes both are ready).
if [[ ! -x node_modules/.bin/tsc ]]; then
  echo "release-check: installing frozen deps (pnpm install --frozen-lockfile)"
  pnpm install --frozen-lockfile || { echo "release-check: FAIL — pnpm install" >&2; exit 2; }
fi
if ! command -v dsh >/dev/null 2>&1; then
  echo "release-check: FAIL — dsh not on PATH (the doctor-lite gate needs the installed dsh)" >&2
  exit 2
fi

run_gate "ci-local chain (L0+L1)" scripts/ci-local.sh
run_gate "concerto static"           node scripts/verify-concerto-static.mjs
run_gate "docs consistency"          node scripts/check-docs-consistency.mjs
# Gate 8 — L2 evidence, PER MATRIX ROW (PR #1 review F6): every tested row in
# .omo/compat.yaml must have its own fresh record carrying the canonical
# `**PASS — N passed, 0 failed` summary marker — one good record can no
# longer cover a full-matrix release. Freshness window: VERIFY_FRESH_DAYS.
run_gate "L2 evidence (per matrix row)" node scripts/check-l2-evidence.mjs

echo ""
echo "release-check: PASS — all 8 gates green"
exit 0
