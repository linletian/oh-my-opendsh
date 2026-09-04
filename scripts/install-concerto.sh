#!/bin/sh
# install-concerto.sh — one-shot installer for the oh-my-opendsh Concerto Mode
# (协奏模式) persistent preset. Idempotent; sources pinned to the v0.1 tag by
# default. The same install can be done with a single curl one-liner — see
# docs/install-concerto.md.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.1/scripts/install-concerto.sh | sh
#   (or run from a checkout: sh scripts/install-concerto.sh)
#
# Options (env):
#   CONCERTO_TAG=v0.1        tag/branch to fetch the preset from
#   DSH_HOME=/path           DSH home (defaults to $HOME/.dsh)
#   NO_PIAI=1                skip the llm-pi-ai settings section (point
#                            agentOptions at your own second route instead)
#   EXPLORE_PROVIDER / EXPLORE_MODEL
#                            override the explore route inside agentOptions
set -eu

TAG="${CONCERTO_TAG:-v0.1}"
BASE="https://raw.githubusercontent.com/linletian/oh-my-opendsh/${TAG}"
D="${DSH_HOME:-${HOME}/.dsh}"
DEST="${D}/.agent-presets/concerto"
SET="${D}/settings.yaml"

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: missing $1" >&2; exit 1; }; }
need curl

echo "==> installing concerto preset (tag ${TAG}) into ${DEST}"
mkdir -p "${DEST}"
curl -fsSL "${BASE}/patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml" -o "${DEST}/agent.cordis.yml"
curl -fsSL "${BASE}/patches/omo-dsh/omo-agents-current/preset/preset.yml" -o "${DEST}/preset.yml"

if [ -n "${EXPLORE_PROVIDER:-}${EXPLORE_MODEL:-}" ]; then
  need python3
  EXPLORE_PROVIDER="${EXPLORE_PROVIDER:-}" EXPLORE_MODEL="${EXPLORE_MODEL:-}" python3 - "${DEST}/agent.cordis.yml" <<'PY'
import os, sys
path = sys.argv[1]
lines = open(path).read().split('\n')
p = os.environ.get('EXPLORE_PROVIDER') or ''
m = os.environ.get('EXPLORE_MODEL') or ''
in_agent_options = False
for i, l in enumerate(lines):
    if l.strip() == 'agentOptions:':
        in_agent_options = True
        continue
    if in_agent_options:
        if l.strip().startswith('provider:') and p:
            lines[i] = l.split(':')[0] + ': ' + p
        if l.strip().startswith('model:') and m:
            lines[i] = l.split(':')[0] + ': ' + m
        if l.strip() and not l.startswith(' '):
            in_agent_options = False
open(path, 'w').write('\n'.join(lines))
PY
  echo "==> explore route overridden (provider=${EXPLORE_PROVIDER:-<unchanged>} model=${EXPLORE_MODEL:-<unchanged>})"
fi

if [ -n "${NO_PIAI:-}" ]; then
  echo "==> NO_PIAI=1 — skipping pi-ai settings; point agentOptions at your own second route"
else
  if grep -q '^llm-pi-ai:' "${SET}" 2>/dev/null; then
    echo "==> llm-pi-ai section already present in ${SET} — left untouched"
  else
    echo "==> adding llm-pi-ai section to ${SET}"
    printf 'llm-pi-ai:\n  providers:\n    deepseek:\n      apiKeyEnv: DEEPSEEK_API_KEY\n' >> "${SET}"
  fi
fi

echo "==> checking credential DEEPSEEK_API_KEY (key name only, value never printed)"
if grep -q '^DEEPSEEK_API_KEY' "${D}/.credentials.yaml" 2>/dev/null; then
  echo "    credential found"
else
  echo "    WARNING: DEEPSEEK_API_KEY not found in ${D}/.credentials.yaml — configure it before delegating"
fi

echo
echo "done. Restart the harness, open a NEW session, and pick 协奏模式 (Concerto Mode)."
echo "30s check: ask 'what is your role?' -> conductor; 'which delegation tools?' -> only call_omo_explore."
echo "uninstall: rm -rf ${DEST}   (optionally remove the llm-pi-ai section from ${SET})"
