#!/usr/bin/env bash
# scripts/smoke-real.sh — T23 真模型手动冒烟 (PRD §8 L4; AC-4/AC-5 人工核对).
# THE ONLY manual gate in the plan: the USER runs this with real DeepSeek
# credentials; the agent prepared and verified everything that needs no key.
# Thin wrapper — all logic lives in scripts/smoke-real.mjs (node, ESM).
#
# ───────────────────────── USER RUN GUIDE ─────────────────────────
#
# WHAT THIS DOES (one real-model run, NOT CI, expected cost well under $1):
#   Boots a real dsh (web profile + the omo-agents scratch plugin) inside a
#   throwaway sandbox, seeds settings.yaml that wires BOTH model routes at
#   their PRODUCTION endpoints (no mock server, no baseURL overrides, no
#   MOCKROLE markers), creates a concerto session, asks sisyphus a dummy
#   retrieval question that NUDGES (never scripts) delegation to explore,
#   then extracts the evidence you must eyeball:
#     .omo/evidence/smoke-real-<timestamp>/
#       transcript.md    — human checklist (AC-4 four chain events, AC-5 two
#                          distinct routes) + per-session transcript summary
#                          + cost/time note. THIS is the file you review.
#       verdict.json     — the same checks, machine-readable.
#       routes.json      — every request/header line of parent + child logs.
#       session-parent.jsonl / session-child.jsonl — raw session logs.
#       boot.log, llm.providers.json — wiring evidence.
#
# CREDENTIALS — ONE DeepSeek key covers BOTH routes:
#   - sisyphus seat: provider route deepseek-official (model deepseek-v4-pro)
#     via the llm-deepseek adapter — apiKeyEnv DEFAULTS to DEEPSEEK_API_KEY
#     (dsh-llm-deepseek DEFAULT_API_KEY_ENV); production endpoint
#     https://api.deepseek.com is the adapter default when no baseURL is set.
#   - explore seat: provider route deepseek (model deepseek-v4-flash) via the
#     llm-pi-ai adapter — the smoke's sandbox settings.yaml seeds
#     llm-pi-ai.providers.deepseek.apiKeyEnv=DEEPSEEK_API_KEY (same seed as
#     scripts/concerto-mode-probe.sh); the pi-ai catalog's deepseek baseUrl is
#     https://api.deepseek.com, used when the profile sets no baseURL.
#   Provide the key in ONE of two ways:
#     A) export DEEPSEEK_API_KEY=sk-...      # in the shell you run this from
#        (the inherited environment wins in dsh's credential layering and is
#        passed only into the sandboxed dsh child processes)
#     B) store it through dsh's web Models page → it lands in
#        ${DSH_HOME:-~/.dsh}/.credentials.yaml; this script reads that file
#        READ-ONLY and injects the value into the sandboxed child's env.
#   If neither is present the script prints the exact setup instruction and
#   exits non-zero IMMEDIATELY (never hangs, never prompts).
#
# SAFETY:
#   - Your real dsh home (${DSH_HOME:-~/.dsh}) is never written: HOME,
#     XDG_CONFIG_HOME, DSH_HOME, DSH_AGENTS_HOME are all redirected into a
#     mkdtemp sandbox; a sha256 digest of the real dsh home before/after the
#     run must be identical (volatile sessions/ + storages/ excluded) or the
#     run FAILs.
#   - The key is never printed, never written into the sandbox, and never
#     logged — only its presence/length/source is reported.
#   - DEEPSEEK_BASE_URL, if exported in your shell, is STRIPPED from the
#     sandboxed child's environment so both routes provably hit the
#     production endpoints (a note is printed when this happens). Set
#     DSH_SMOKE_RESPECT_BASE_URL=1 to keep it instead (e.g. a deliberate
#     gateway for the sisyphus route).
#
# HOW TO RUN:
#   export DEEPSEEK_API_KEY=sk-...        # or have it in ~/.dsh/.credentials.yaml
#   scripts/smoke-real.sh
#   # then open the printed evidence dir and review transcript.md; tick the
#   # AC-4/AC-5 checklist. The script's exit code is advisory — YOU are the gate.
#
# OTHER MODES (no key needed):
#   scripts/smoke-real.sh --self-test      # hermetic QA of the analysis logic
#                                          # against fabricated real-flavored logs
#   scripts/smoke-real.sh --precheck-only  # verify your credential setup resolves
#                                          # (reports source+length only) and stop
#                                          # before the run — zero cost
#   scripts/smoke-real.sh --help           # same text as this header
#
# ENV KNOBS:
#   DSH_SMOKE_SCENARIO_TIMEOUT_MS  (default 300000 — real models are slow)
#   DSH_SMOKE_BOOT_TIMEOUT_MS      (default 90000)
#   DSH_SMOKE_INSTALL_TIMEOUT_MS   (default 300000)
#   DSH_SMOKE_KEEP_SANDBOX=1       keep the mkdtemp sandbox for postmortem
#   DSH_SMOKE_RESPECT_BASE_URL=1   do not strip DEEPSEEK_BASE_URL (see above)
#
# EXIT: 0 = all auto-checks passed (still review the checklist);
#       1 = run completed but some checks failed (evidence dir has details);
#       2 = precheck failed (missing key, missing dsh) — nothing was run.
# ────────────────────────────────────────────────────────────────────

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,75p' "${BASH_SOURCE[0]}"
  exit 0
fi

command -v node >/dev/null 2>&1 || {
  echo "smoke-real: FAIL: node not found on PATH (need Node 24+ for type-stripping)" >&2
  exit 2
}

exec node "$REPO_ROOT/scripts/smoke-real.mjs" "$@"
