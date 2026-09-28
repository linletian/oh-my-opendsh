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
# P3-T19 added TWO proofs (stages 4 and 5) for the Phase 3 behaviour-guardrail
# layer — the plan §4.7 门 8 extension:
#   * prove-guardrail-deny-path.mjs — the B-mode DENY decision is effective at
#     session level (the prometheus row's own toolFilter through the real
#     applyChildComposition → tools.restrict child path, then the listener's
#     denial through the real pre-execute waterfall + deny materialization),
#     plus R-9: a throwing listener fails THAT call (pre-execute → isError
#     final-result, post-execute bypassed; post-execute → lossy isError) while
#     later calls keep succeeding, and the real guard fails OPEN on its own
#     identity-read throw;
#   * prove-guardrail-modes.mjs — the two remaining listener patterns: C mode
#     (`tools/post-execute` advisory ferried as additionalContexts, with a
#     non-trigger control) and E mode (`agent/turn-stopping` → the real
#     agentEvents dispatch → `agent.steer` continuation, with all-complete /
#     absent-projection / active-armed-goal controls).
#
# Zero LLM cost, no network, no boot: each proof builds its own cordis stack
# (or drives one real child-composition path) in-process and asserts on it.
# Total budget well under a minute.
#
# N6 (PR #9 round 2) added a SIXTH stage: `scripts/bump-dsh.sh --self-test` —
# the hermetic contract of the D7 TWO-token pin (safe-point cutoff math, the
# compute-before-write atomicity of the bump, the lockfile family assertion, the
# millisecond fallback). It was reachable only by hand, which is how a contract
# rots; it needs no dsh and no network. The script's `--online` half (a REAL
# `npm install --package-lock-only` verification) stays a manual opt-in — the
# ci-local chain is hermetic by design.
#
# Usage: scripts/run-proofs.sh
# Exit:  0 = all proofs PASS; non-zero = the first failing proof's exit code.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# The proof registry. The count is DERIVED from these parallel arrays
# (`${#PROOF_NAMES[@]}`), never hand-written: the stage banner, the failure line
# and the closing summary all read the same length, so adding a proof cannot
# leave the "/3" of a previous era behind, and forgetting to bump a literal
# cannot print "6/5" (the P3-T19 Kimi round-1 NIT-1). PROOF_COMMANDS is filled in
# below, once $NM and $RENDERED exist (bash expands the words at assignment
# time); two parallel arrays rather than one "name<TAB>command" array because
# each command is a multi-word argv.
PROOF_NAMES=(
  "T12 toolFilter enforced"
  "T13 maxDepth cap enforced"
  "T15 dual-route logging"
  "P3-T19 guardrail deny path + R-9 throw semantics"
  "P3-T19 guardrail C/E mode mechanisms"
  "bump-dsh --self-test (D7 two-token pin: safe-point cutoff + write atomicity)"
)

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

# One argv per entry, in PROOF_NAMES order. Unquoted on purpose when expanded
# below: the entries are AUTHORED here (never user input) and must word-split
# into argv, which is exactly what a quoted "$cmd" would prevent. No `eval` —
# that would turn this registry into a shell-injection surface.
PROOF_COMMANDS=(
  "node scripts/prove-explore-toolfilter.mjs $NM $RENDERED/agent.cordis.yml --expect denied"
  "node scripts/prove-explore-maxdepth.mjs $NM $RENDERED/agent.cordis.yml --expect capped"
  "node scripts/prove-route-logging.mjs $NM"
  "node scripts/prove-guardrail-deny-path.mjs $NM $RENDERED/agent.cordis.yml"
  "node scripts/prove-guardrail-modes.mjs $NM"
  "bash scripts/bump-dsh.sh --self-test"
)
TOTAL_PROOFS=${#PROOF_NAMES[@]}
if [[ "$TOTAL_PROOFS" != "${#PROOF_COMMANDS[@]}" ]]; then
  echo "run-proofs: FAIL — PROOF_NAMES (${#PROOF_NAMES[@]}) and PROOF_COMMANDS (${#PROOF_COMMANDS[@]}) disagree" >&2
  exit 2
fi

STAGE=0
# Each proof's own exit code governs the gate; the banner is cosmetic.
run_proof() {
  local name="$1"; shift
  STAGE=$((STAGE + 1))
  echo ""
  echo "--------------------------------------------------------------"
  echo "run-proofs: ${STAGE}/${TOTAL_PROOFS} — ${name}"
  echo "--------------------------------------------------------------"
  "$@"
  local rc=$?
  if [[ "$rc" != "0" ]]; then
    echo ""
    echo "run-proofs: FAIL at ${STAGE}/${TOTAL_PROOFS} (${name}) — exit ${rc}" >&2
    exit "$rc"
  fi
}

# The proof bodies, in registry order. The WHY of each proof lives here:
#   * T12 + F1: the child-composition path (applyChildComposition →
#     tools.restrict) must exclude write/edit/the delegation tool from the child's
#     model-facing list.
#   * T13: the real delegation start path must ADMIT a depth-1 parent's call (the
#     corrected atlas(1) → worker(2) path under target-row maxDepth 2,
#     D-2026-09-13-01) and reject a depth-2 parent's further attempt on BOTH the
#     foreground and continuable starts, with the tool still visible at the cap.
#   * T15 / AC-5: the session JSONL must record BOTH agents' resolved routes.
#   * P3-T19 / R-9: the Phase 3 B-mode guardrail's DENY is effective at session
#     level (row toolFilter via the real child-composition path, then the
#     listener's denial through the real pre-execute waterfall), and a throwing
#     listener fails only THAT call while the pipeline keeps working.
#   * P3-T19: the C-mode advisory (additionalContexts) and E-mode steer surfaces of
#     the guardrail layer, each with its non-trigger controls.
run_proof "${PROOF_NAMES[0]}" ${PROOF_COMMANDS[0]}
run_proof "${PROOF_NAMES[1]}" ${PROOF_COMMANDS[1]}
run_proof "${PROOF_NAMES[2]}" ${PROOF_COMMANDS[2]}
run_proof "${PROOF_NAMES[3]}" ${PROOF_COMMANDS[3]}
run_proof "${PROOF_NAMES[4]}" ${PROOF_COMMANDS[4]}
# N6 (PR #9 round 2): the D7 two-token pin's own contract had no gate — the
# bumped script's --self-test was reachable only by hand, which is exactly how
# the proof set above rotted before. It is hermetic (no network, no repo writes)
# and fast, so it belongs in this zero-cost chain. `--online` (the real
# resolution smoke) is NOT run here: ci-local gates stay hermetic.
run_proof "${PROOF_NAMES[5]}" ${PROOF_COMMANDS[5]}

if [[ "$STAGE" != "$TOTAL_PROOFS" ]]; then
  echo "run-proofs: FAIL — ran ${STAGE} proofs but the registry declares ${TOTAL_PROOFS}" >&2
  exit 2
fi

echo ""
# The roster is derived from PROOF_NAMES too, so this line cannot list a proof the
# registry does not have (or miss one it does) — the same anti-drift rule as the count.
PROOF_ROSTER="$(printf '%s · ' "${PROOF_NAMES[@]}")"
echo "run-proofs: PASS — ${TOTAL_PROOFS}/${TOTAL_PROOFS} (${PROOF_ROSTER% · }) on dsh $(dsh --version)"
