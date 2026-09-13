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
#   throwaway sandbox, seeds settings.yaml that wires the CONDUCTOR's seat and
#   the CHOSEN agent's seat at their PRODUCTION endpoints (no mock server, no
#   baseURL overrides, no MOCKROLE markers), creates a concerto session, asks
#   sisyphus your question — which NUDGES (never scripts) delegation to the
#   chosen agent — then extracts the evidence you must eyeball:
#     .omo/evidence/smoke-real-<timestamp>/
#       transcript.md    — human checklist (AC-4 four chain events, AC-5 both
#                          executed routes) + per-session transcript summary
#                          + cost/time note. THIS is the file you review.
#       verdict.json     — the same checks, machine-readable.
#       routes.json      — every request/header line of parent + child logs.
#       session-parent.jsonl / session-child.jsonl — raw session logs.
#       boot.log, llm.providers.json — wiring evidence.
#   The sandboxed project (the session cwd) always holds two fixtures:
#     README.md          carries the text sentinel that proves the child really
#                        consumed sandbox bytes (AC-4 link 2)
#     smoke-fixture.png  a minimal valid 16x16 PNG for vision questions
#
# WHICH AGENT (P2-T22 knob):
#   --agent <id>      one of the 10 roster DELEGATION ids — explore (default,
#                     the MVP scenario), hephaestus, oracle, librarian,
#                     plan-consultant, plan-reviewer, atlas, multimodal-looker,
#                     sisyphus-junior, prometheus. `sisyphus` is the conductor
#                     and has no delegation tool: it is rejected loudly BEFORE
#                     anything boots (exit 2), as is any unknown id.
#   --question <text> your nudge question (default: the MVP README question).
#                     The script never scripts the model's steps; the question
#                     is what makes the conductor pick a given agent.
#                     A separated value that is missing or starts with `--` is
#                     rejected loudly BEFORE anything boots (exit 2) for BOTH
#                     knobs. For a question whose text genuinely starts with a
#                     dash, use the `--question=<text>` escape hatch:
#                       scripts/smoke-real.sh --question="--请解释这个仓库"
#   The child's executed route is asserted against the roster seat that
#   OMO_<AGENT>_PROVIDER / OMO_<AGENT>_MODEL resolve to in YOUR shell, so you
#   can pin an override (e.g. OMO_ORACLE_MODEL=...) and the smoke will check
#   exactly that.
#
#   EXAMPLES (run from the repo root, after exporting the key):
#     # librarian — external docs / OSS source search (fast seat, llm-pi-ai):
#     scripts/smoke-real.sh --agent librarian \
#       --question "请委派 librarian 查一下 dsh 的 plugin profile 机制在官方文档里怎么描述，然后总结。"
#     # oracle — read-only architecture review (strong seat, llm-deepseek):
#     scripts/smoke-real.sh --agent oracle \
#       --question "请委派 oracle 读这个项目并给出架构层面的风险清单，然后总结。"
#     # multimodal-looker — VISION seat. The question must name the seeded
#     # smoke-fixture.png (relative to the sandboxed project = the child's cwd)
#     # and the deepseek-official/deepseek-v4-flash-vision-exp route must be
#     # live for your key; ask it to relate the image to README.md so link 2
#     # also sees the README sentinel:
#     scripts/smoke-real.sh --agent multimodal-looker \
#       --question "请委派 multimodal-looker 看 smoke-fixture.png，并结合 README.md 说明这个项目，然后总结。"
#
# CREDENTIALS — ONE DeepSeek key covers both seats:
#   - sisyphus seat: provider route deepseek-official (model deepseek-v4-pro)
#     via the llm-deepseek adapter — apiKeyEnv DEFAULTS to DEEPSEEK_API_KEY
#     (dsh-llm-deepseek DEFAULT_API_KEY_ENV); production endpoint
#     https://api.deepseek.com is the adapter default when no baseURL is set.
#   - the chosen agent's seat. For agents on the llm-pi-ai catalog route
#     (explore/librarian/sisyphus-junior → deepseek/deepseek-v4-flash) the
#     sandbox settings.yaml seeds llm-pi-ai.providers.deepseek.apiKeyEnv=
#     DEEPSEEK_API_KEY (same seed as scripts/concerto-mode-probe.sh); the
#     pi-ai catalog's deepseek baseUrl is https://api.deepseek.com, used when
#     the profile sets no baseURL. Agents on the llm-deepseek route
#     (deepseek-official: oracle/hephaestus/plan-*/atlas/prometheus and the
#     multimodal-looker vision model) need no extra row — that route is
#     registered by the base composition in every profile.
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
#   scripts/smoke-real.sh                 # MVP scenario: delegate to explore
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
#       2 = precheck failed (missing key, missing dsh) OR a rejected CLI
#           argument (unknown/non-delegation --agent, empty --question, or a
#           separated knob value missing / starting with `--`) —
#           nothing was booted.
# ────────────────────────────────────────────────────────────────────

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  # Print the leading comment guide verbatim (skipping the shebang). Deriving
  # the range from the file instead of hardcoding line numbers keeps --help in
  # sync with this header as it grows (P2-T22) — no stale `sed -n` window.
  awk 'NR == 1 { next } /^#/ { print; next } { exit }' "${BASH_SOURCE[0]}"
  exit 0
fi

command -v node >/dev/null 2>&1 || {
  echo "smoke-real: FAIL: node not found on PATH (need Node 24+ for type-stripping)" >&2
  exit 2
}

exec node "$REPO_ROOT/scripts/smoke-real.mjs" "$@"
