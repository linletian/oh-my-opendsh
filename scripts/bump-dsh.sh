#!/usr/bin/env bash
# scripts/bump-dsh.sh — the D7 deliberate pin bump, implemented per D13.
# Flips DSH_VERSION (.github/workflows/ci.yml) and the compat-probe workflow's
# parser-provider install to <new-dsh-version>, then runs the full zero-cost
# gate chain locally against the dsh binary on PATH (which must already report
# <new-dsh-version> — probe it first with scripts/compat-probe.sh and get the
# matrix row to `tested`).
#
# Usage: scripts/bump-dsh.sh <new-dsh-version> [--dry-run]
# Gates: matrix row tested → local dsh version matches → ci-local.sh green.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NEW="${1:-}"
if [[ -z "$NEW" ]]; then
  echo "usage: scripts/bump-dsh.sh <new-dsh-version> [--dry-run]" >&2
  exit 64
fi
DRY=0
[[ "${2:-}" == "--dry-run" ]] && DRY=1

# Gate 1: the matrix row for NEW must be `tested` (never bump onto 🔬).
if ! sed -n '/^tested:/,/^untested:/p' .omo/compat.yaml | grep -q "dsh: \"$NEW\""; then
  echo "bump-dsh: FAIL — no tested matrix row for dsh $NEW (.omo/compat.yaml)." >&2
  echo "  Probe it first: scripts/compat-probe.sh $NEW, run concerto_verify," >&2
  echo "  move the row to tested, commit — then re-run this bump." >&2
  exit 1
fi

# Gate 2: the LOCAL dsh on PATH is exactly NEW (the chain below tests it).
LOCAL="$(dsh --version 2>/dev/null || true)"
if [[ "$LOCAL" != "$NEW" ]]; then
  echo "bump-dsh: FAIL — dsh on PATH reports ${LOCAL:-<none>}, want $NEW." >&2
  echo "  npm install --global @deepseek-ai/dsh@$NEW (or reuse the probe sandbox prefix)." >&2
  exit 2
fi

OLD="$(sed -n 's/^  DSH_VERSION: //p' .github/workflows/ci.yml | head -1)"
echo "bump-dsh: dsh pin $OLD -> $NEW"
if [[ "$DRY" == "1" ]]; then
  echo "bump-dsh: DRY RUN — no files changed"
  exit 0
fi

sed -i "s/^  DSH_VERSION: .*/  DSH_VERSION: $NEW/" .github/workflows/ci.yml
sed -i "s|\"@deepseek-ai/dsh@$OLD\"|\"@deepseek-ai/dsh@$NEW\"|" .github/workflows/compat-probe.yml

# D7: the bump enters via an explicit full typecheck + test gate run.
scripts/ci-local.sh

echo ""
echo "bump-dsh: DONE — ci.yml + compat-probe.yml now pin dsh $NEW; all 7 gates green."
echo "  Commit: git commit -am 'chore: bump dsh pin to $NEW (D7, matrix row tested)'"
