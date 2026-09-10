#!/bin/sh
# install-concerto.sh — one-shot installer for the oh-my-opendsh Concerto Mode
# (协奏模式) persistent preset. Idempotent; sources pinned to the v0.2 tag by
# default. The same install can be done with a single curl one-liner — see
# docs/install-concerto.md.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.2/scripts/install-concerto.sh | sh
#   (or run from a checkout: sh scripts/install-concerto.sh)
#
# Options (env):
#   CONCERTO_TAG=<tag>       tag/branch to fetch the preset from; defaults to
#                            the alias line below (see docs/release-process §2)
#   DSH_HOME=/path           DSH home (defaults to $HOME/.dsh)
#   NO_PIAI=1                skip the llm-pi-ai settings section (point
#                            agentOptions at your own second route instead)
#   EXPLORE_PROVIDER / EXPLORE_MODEL
#                            override the explore route inside agentOptions
set -eu

TAG="${CONCERTO_TAG:-v0.2}"
BASE="https://raw.githubusercontent.com/linletian/oh-my-opendsh/${TAG}"
D="${DSH_HOME:-${HOME}/.dsh}"
DEST="${D}/.agent-presets/concerto"
SET="${D}/settings.yaml"

# F3 (PR #1 review): route overrides are written into agentOptions verbatim —
# reject anything that is not a YAML-safe identifier loudly, instead of
# emitting a broken composition.
for v in "${EXPLORE_PROVIDER:-}" "${EXPLORE_MODEL:-}"; do
  if [ -n "$v" ] && ! printf '%s' "$v" | grep -qE '^[a-zA-Z0-9._-]+$'; then
    echo "error: EXPLORE_PROVIDER / EXPLORE_MODEL must match ^[a-zA-Z0-9._-]+\$ (got '$v')" >&2
    exit 1
  fi
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: missing $1" >&2; exit 1; }; }
need curl

echo "==> installing concerto preset (tag ${TAG}) into ${DEST}"
mkdir -p "${DEST}"
curl -fsSL "${BASE}/patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml" -o "${DEST}/agent.cordis.yml"
curl -fsSL "${BASE}/patches/omo-dsh/omo-agents-current/preset/preset.yml" -o "${DEST}/preset.yml"

if [ -n "${EXPLORE_PROVIDER:-}${EXPLORE_MODEL:-}" ]; then
  need python3
  EXPLORE_PROVIDER="${EXPLORE_PROVIDER:-}" EXPLORE_MODEL="${EXPLORE_MODEL:-}" python3 - "${DEST}/agent.cordis.yml" <<'PY'
import os, sys, json
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
            # F3: json.dumps emits a YAML-valid double-quoted scalar even for
            # hostile characters (defense-in-depth on top of the shell-side
            # identifier validation above).
            lines[i] = l.split(':')[0] + ': ' + json.dumps(p)
        if l.strip().startswith('model:') and m:
            lines[i] = l.split(':')[0] + ': ' + json.dumps(m)
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
    # F4 (PR #1 review): the file may not end with a newline — a missing
    # leading one would glue the block onto the previous entry.
    last="$(tail -c 1 "${SET}" 2>/dev/null || true)"
    if [ -n "$last" ] && [ "$last" != "$(printf '\n')" ]; then
      printf '\n' >> "${SET}"
    fi
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
echo "30s check: ask 'which delegation tools do you see?' -> the CONDUCTOR sees only call_omo_explore; explore children see none."
echo "uninstall: rm -rf ${DEST}   (optionally remove the llm-pi-ai section from ${SET})"
