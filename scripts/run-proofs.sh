#!/usr/bin/env bash
# scripts/run-proofs.sh — run every session-free PROOF against the INSTALLED
# dsh, as one command, so they stop rotting.
#
# WHY THIS EXISTS (2026-09-10): the three prove-*.mjs scripts and
# concerto-mode-probe.sh were manual-only — named in the PRD's rc-bump chain,
# run by no chain — so nothing failed when they went stale. Two had already
# rotted silently: concerto-mode-probe.sh asserted `deny: [write, edit]` for
# six days after the F1 hardening changed the deny list to
# `[write, edit, explore]` (2026-09-04, 6203432), and prove-route-logging.mjs had three
# separate 0.1.5-rc.1 breaks. docs/mvp-pitfalls.md §7 P-20.7.
#
# Zero LLM cost, no network, no boot: each proof builds its own cordis stack
# (or drives one real child-composition path) in-process and asserts on it.
# Total budget well under a minute.
#
# Usage: scripts/run-proofs.sh
# Exit:  0 = all proofs PASS; non-zero = the first failing proof's exit code.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v dsh >/dev/null 2>&1; then
  echo "run-proofs: FAIL — dsh not on PATH (the proofs mount the INSTALLED dsh's own plugins)" >&2
  exit 2
fi

# The installed dsh's node_modules: every proof imports the RUNTIME's real
# plugins from here rather than a bundled copy, so the proof tests the dsh this
# repo is pinned to. doctor-lite owns that resolution (it already needed it for
# its own schema check) — reuse it instead of restating the walk.
NM="$(node --input-type=module -e "
  import('./scripts/doctor-lite.mjs').then((m) => m.resolveDshNodeModules()).then((nm) => process.stdout.write(nm ?? ''))
" 2>/dev/null)"
if [[ -z "$NM" ]]; then
  echo "run-proofs: FAIL — cannot resolve the installed dsh's node_modules from the dsh binary" >&2
  exit 2
fi
echo "run-proofs: dsh $(dsh --version) · node_modules $NM"

# The two row-level proofs read the RENDERED composition (the T11 sentinels
# resolved), not the raw template — the sentinel scalars are not the config a
# mount validates. Render with the plugin's OWN syncConcertoPreset so this
# shares the single source of truth the plugin uses at apply() time.
RENDERED="$(mktemp -d /tmp/omo-run-proofs.XXXXXX)"
trap 'rm -rf "$RENDERED"' EXIT
node --experimental-strip-types -e "
  import('./patches/omo-dsh/omo-agents/src/concerto-preset.ts')
    .then((m) => { m.syncConcertoPreset(process.argv[1]) })
" "$RENDERED" || { echo "run-proofs: FAIL — could not render the concerto template" >&2; exit 2; }

STAGE=0
run_proof() {
  local name="$1"; shift
  STAGE=$((STAGE + 1))
  echo ""
  echo "--------------------------------------------------------------"
  echo "run-proofs: ${STAGE}/3 — ${name}"
  echo "--------------------------------------------------------------"
  "$@"
  local rc=$?
  if [[ "$rc" != "0" ]]; then
    echo ""
    echo "run-proofs: FAIL at ${STAGE}/3 (${name}) — exit ${rc}" >&2
    exit "$rc"
  fi
}

# T12 + F1: the child-composition path (applyChildComposition → tools.restrict)
# must exclude write/edit/the delegation tool from the child's model-facing list.
run_proof "T12 toolFilter enforced" \
  node scripts/prove-explore-toolfilter.mjs "$NM" "$RENDERED/agent.cordis.yml" --expect denied

# T13: the real delegation start path must reject a depth-2 attempt on BOTH the
# foreground and continuable starts, with the tool still visible at the cap.
run_proof "T13 maxDepth cap enforced" \
  node scripts/prove-explore-maxdepth.mjs "$NM" "$RENDERED/agent.cordis.yml" --expect capped

# T15 / AC-5: the session JSONL must record BOTH agents' resolved routes.
run_proof "T15 dual-route logging" \
  node scripts/prove-route-logging.mjs "$NM"

echo ""
echo "run-proofs: PASS — 3/3 (T12 toolFilter · T13 maxDepth · T15 dual-route logging) on dsh $(dsh --version)"
