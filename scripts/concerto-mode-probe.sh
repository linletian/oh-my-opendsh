#!/usr/bin/env bash
# scripts/concerto-mode-probe.sh — T6 probe (FR-2, AC-2): the omo-agents
# scratch plugin registers the REAL 协奏 / Concerto Mode preset (id `concerto`,
# display name from OUR repo-shipped concerto/preset.yml) at the same roster
# level as the official 4 modes.
#
# Replaces the T5 P-1 spike probe (kept as a thin wrapper: p1-preset-probe.sh).
# Same sandboxing discipline as scripts/cold-start.sh (HOME / XDG_CONFIG_HOME /
# DSH_HOME / DSH_AGENTS_HOME redirected into a throwaway dir; real ~/.dsh never
# touched; registration lands only inside the sandbox's $DSH_HOME).
#
# Assertions per boot:
#   plugin side — `[omo-agents] loaded`, `concerto preset <outcome>`, the
#                 roster line listing `concerto:user`, and no FAILED line.
#   P3-T3 hooks — the SECOND cordis.yml insert row's mount observable:
#                 `[omo-hooks] loaded: manifest 14 entries (…)`, plus one
#                 `hook <id> registered on <event>` line for EVERY implemented
#                 hook — after P3-T17 that is the full 14-line set (P3-T5 landed
#                 the first, bash-file-read-guard). BOTH expectations are DERIVED
#                 below from the plugin's own modules (manifest.ts +
#                 boot-markers.ts + the src/hooks/<id>.ts file set), never
#                 retyped literals, so the probe asserts the booted plugin used
#                 the same roster, formatter and registry as this source tree —
#                 a drift in any of them fails here. The id set comes from the
#                 hook FILES, not from HOOK_REGISTRARS: a registry
#                 import-drifting back to `{}` would otherwise shrink the
#                 expectation instead of failing. The roster is 14 (not 15)
#                 since P3-T5 removed H-01. P3-T19 tightened the derivation from
#                 "at least one implementation file" to "the src/hooks file set
#                 EQUALS the manifest id set", and the boot block below asserts
#                 each of the 14 lines plus the ABSENCE of any `hook … FAILED` /
#                 `manifest validation FAILED` line.
#   P4-T3 commands — the THIRD cordis.yml insert row's mount observable:
#                 `[omo-commands] loaded: manifest 6 entries (pending=6,
#                 ported=0) — 0/6 commands registered`, DERIVED below from the
#                 plugin's own manifest.ts + boot-markers.ts + index.ts exactly
#                 like the hooks half (registered lines = ported ids ∩
#                 COMMAND_REGISTRARS keys; a ported row with no registrar fails
#                 the derivation, so an emptied registry cannot shrink the
#                 expectation to zero and leave the probe green). At P4-T3 all
#                 six rows are 'pending', so the derivation yields the summary
#                 line and zero registered lines — vacuously correct today and
#                 non-vacuous from T6 on without a probe edit. Both FAILED forms
#                 (`command … FAILED`, `manifest validation FAILED`) are
#                 asserted ABSENT.
#   P4-T5 skills — the skill DELIVERY mechanism's summary marker
#                 `[omo-commands] skills: 19/19 registered (runtime, vendor
#                 path)`, derived by running the plugin's own scan over the live
#                 vendor tree, plus `skill <name> FAILED` asserted ABSENT.
#   T8 persona  — the `omo-sisyphus system prompt assembled` boot marker, and
#                 the MATERIALIZED $DSH_HOME preset's agent.cordis.yml: the
#                 sentinel is gone and the persona block scalar carries the
#                 three AC-3 section markers (Orchestrator Role / Delegation
#                 Discipline / Hard Blocks) — proof the booted concerto mode's
#                 main-agent brain is the assembled omo-sisyphus prompt.
#   T16 marker  — the `hard-blocks injection listener registered on
#                 agent/pre-step` boot line: the FR-6 listener's registration
#                 is observable at boot (unit-level inject assertions live in
#                 tests/omo-agents/hard-blocks-injection.test.ts; live
#                 sub-agent prompt proof is T20's e2e snapshot).
#   T10 marker  — the `omo-explore persona assembled` boot line: the FR-4
#                 read-only subagent persona (system-sections/
#                 explore-persona.md) assembles cleanly under the dsh boot
#                 environment. The persona is a SUBAGENT artifact, not a run
#                 mode — no roster entry is expected; T11 binds the text as a
#                 dsh-tool-subagent instance's `persona` config (contract in
#                 src/explore-prompt.ts).
#   external    — the Web UI picker's own roster RPC (transport-adaptive, T9:
#                 rc.6 POST /api/agentPreset.list, no auth; 0.1.2 POST
#                 /api/agentPresets/list through the Typert Remote gateway,
#                 after the launch-token → dsh-auth-* cookie handshake) lists
#                 concerto at trust "user" alongside the official four at
#                 trust "system" (rc.6 standard/code/minimal/cordis; 0.1.2
#                 standard/ptc/minimal/cordis), with the name from OUR
#                 preset.yml (协奏 / Concerto).
#   T14 routes   — the `[omo-agents] model routes: sisyphus=… explore=…` boot
#                 marker (resolved by the plugin from src/model-routes.ts, the
#                 single config source of truth), and the provider directory
#                 (rc.6 POST /api/llm.providers; 0.1.2 llm/listProviders joined
#                 with llm/listConfigurableProviders by the Web UI's own rule)
#                 showing BOTH route providers `active:true` — the sisyphus
#                 seat's from the llm-deepseek adapter (entry config), the
#                 explore seat's from the llm-pi-ai adapter (sandbox-seeded
#                 settings profile; registration is keyless — no API keys
#                 exist in the sandbox, and none are needed for this gate).
#   T11 binding  — the omo-explore dsh-tool-subagent instance (form A static
#                 config) in the MATERIALIZED composition: the row exists with
#                 toolName `explore`, both T11 sentinels are rendered away,
#                 the persona block scalar carries the real explore persona,
#                 agentOptions carries the env-resolved explore route, and the
#                 pre-declared T12/T13 fields (toolFilter deny, maxDepth) are
#                 present. THEN a real schema gate: the row's config is parsed
#                 and validated by the INSTALLED dsh's own js-yaml +
#                 dsh-tool-subagent Config (schemastery) — the exact code cordis
#                 runs at mount. HONEST TIMING NOTE: dsh validates preset rows
#                 LAZILY, at session composition (agent-presets mountPreset),
#                 not at boot — this probe runs the same schema eagerly so a
#                 broken row fails here instead of at first session creation.
#                 A live tool-list observable needs a session and closes in
#                 T19/T20.
#   T12 proof    — scripts/prove-explore-toolfilter.mjs executes the INSTALLED
#                 dsh's real child-composition path (dsh-subagent
#                 applyChildComposition → tools.restrict → ToolRuntime view)
#                 against the materialized row and asserts the child scope's
#                 model-facing tool list excludes write/edit (execution
#                 surfaces UNKNOWN_TOOL), read/grep/glob + the platform shell
#                 survive, and the parent scope is untouched. Session-free;
#                 the live-model half closes in T20.
#   T13 proof    — scripts/prove-explore-maxdepth.mjs mounts the row's own
#                 dsh-tool-subagent instance on the REAL stack (cordis +
#                 ToolRuntime + SubagentRuntime + the spawn provider) and
#                 drives the real delegation start path under the corrected
#                 target-row semantics (maxDepth 2; D-2026-09-13-01): a
#                 depth-1 parent's call PASSES the gate (the atlas(1) →
#                 worker(2) re-delegation path), while a depth-2 parent's
#                 further attempt is rejected on BOTH the foreground
#                 (ctx.subagents.start) and continuable (startContinuable)
#                 starts with the exact errored tool result "Error: subagent
#                 depth 3 exceeds maxDepth 2"; the tool stays model-visible at
#                 the cap, and a depth-0 parent passes the same gate (control).
#                 Session-free; T20 closes the live-model half.
#   T15 proof    — scripts/prove-route-logging.mjs boots the FULL real stack
#                 (testkit five + JsonlSessionPersistence + AgentLoop +
#                 SubagentRuntime + spawn provider) with scripted adapters on
#                 the two REAL route names, runs one parent turn + one real
#                 continuable start, then asserts on the real JSONL artifacts:
#                 child `subagent/descriptor`.agentProvider/agentModel = the
#                 resolved explore route, both agents' `request/header`.config
#                 = their executed routes, the two routes differ (P-7 verdict:
#                 logged — no listener code). --expect unlogged QA-proves the
#                 verdict logic falls back to 'self-listener-needed' on
#                 route-less logs. T20 closes the live-model half.
#   P2-T20 roster — the P2-T16 boot-marker contract, asserted per boot and all
#                 derived from src/roster.ts / src/model-routes.ts at probe
#                 start (never restated): (a) exactly ONE
#                 `omo-<id> persona assembled: 1 section, ` line per
#                 DELEGATION_ENTRIES row, with no `persona FAILED` line; (b)
#                 exactly ONE route summary line carrying ALL 11 roster
#                 `id=provider/model` fields in roster order; (c) the three
#                 non-blocking warning forms (`route warning [<code>]`,
#                 `route provider not registered`, `route provider check
#                 FAILED`) are ABSENT — the seeded sandbox registers both
#                 providers and the default three-seat distribution trips
#                 neither route-value warning — with the summary line as the
#                 non-vacuity guard; (d) every DISTINCT provider the 11 routes
#                 use is `active:true` in the provider directory (the
#                 transport-adaptive RPC join above), so a deployment missing
#                 e.g. the pi-ai settings section fails here at boot instead of
#                 at that child's first delegation. The per-row materialized
#                 greps (toolName / roster-computed deny / roster allow /
#                 uniform roster maxDepth) generalize the P2-T15 explore pins
#                 to every roster row.
# Idempotence   — boot 2 reuses boot 1's sandbox DSH_HOME: the sync must be a
#                 no-op (`concerto preset unchanged`) and the roster identical.
#
# Learned flags (P-8): root flags (--profile/--patch) precede app flags.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROFILE="web"
READY_TIMEOUT_S="${CONCERTO_READY_TIMEOUT_S:-90}"
INSTALL_TIMEOUT_S="${CONCERTO_INSTALL_TIMEOUT_S:-300}"

# `--no-open`: dsh 0.1.2 introduced the default browser handoff, and the flag
# that suppresses it; before that the web app's commander rejects an unknown
# option outright (P-8.2's class — root flags and app flags are different
# parsers). Hardcoding it would break every pre-0.1.2 run, so feature-probe the
# app's own help instead of assuming (docs/dsh-0.1.5-rc.1-review.md §7.6).
# Probed lazily on first boot below, once the profile exists.
NO_OPEN=""

SANDBOX="$(mktemp -d /tmp/omo-dsh-concerto-probe.XXXXXX)"
cleanup() {
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

export HOME="$SANDBOX/home"
export XDG_CONFIG_HOME="$SANDBOX/xdg"
export DSH_HOME="$SANDBOX/dsh"
export DSH_AGENTS_HOME="$SANDBOX/agents"
mkdir -p "$HOME" "$XDG_CONFIG_HOME"

ADD_LOG="$SANDBOX/plugin-add.log"

fail() {
  echo "concerto-probe: FAIL: $*" >&2
  exit 1
}

command -v node >/dev/null || fail "node not found (probe needs it for the adaptive web-RPC helper)"

echo "concerto-probe: sandbox: $SANDBOX"
echo "concerto-probe: dsh binary: $(command -v dsh)"
dsh --version || fail "dsh --version failed"

# Stage 0: fresh profile + install ALL THREE plugins into it (one per cordis.yml
# insert row — P3-T3 mounted omo-hooks as the second row, P4-T3 mounts
# omo-commands as the third, so a profile carrying fewer could not compose the
# overlay).
echo "concerto-probe: installing @oh-my-opendsh/omo-agents into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-agents" >"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add (omo-agents) failed (see $ADD_LOG)"
echo "concerto-probe: installing @oh-my-opendsh/omo-hooks into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-hooks" >>"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add (omo-hooks) failed (see $ADD_LOG)"
echo "concerto-probe: installing @oh-my-opendsh/omo-commands into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-commands" >>"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add (omo-commands) failed (see $ADD_LOG)"

# T14 (FR-5, P-2; AC-5 config half): resolve the two route pairs from the
# plugin's own config module — the single source of truth (Node 24
# type-stripping runs the .ts directly, P-8.6) — then pre-seed the sandbox
# settings.yaml with the llm-pi-ai profile that registers the explore seat's
# provider route. Adapter REGISTRATION is the gate (no API keys exist in the
# sandbox): credentials resolve per request, so a route registers keylessly
# and a missing key would only fail a REQUEST with MISSING_CREDENTIAL.
# The same resolution reaches into src/roster.ts for the explore row's deny
# list (P2-T15 shape), so both deny assertions below share one computed
# expectation instead of an inline literal.
# P2-T20 generalizes that resolution to the FULL roster — every `KEY=value`
# line below is derived, never restated:
#   ROUTE_FIELD=<id>=<provider>/<model>   all 11 routes, roster order (b)
#   ROUTE_PROVIDER=<provider>             the DISTINCT route providers (d)
#   DELEGATION_ID=<id>                    the 10 persona-marker ids (a)
#   DELEGATION_MAXDEPTH=<id>=<n>          per-row depth cap (④-shaped grep)
#   DELEGATION_DENY=<id>=<json>           per-row roster deny list (③ grep)
#   DELEGATION_ALLOW_PLAIN=<id>=<list>    per-row roster allow list (③ grep)
#   ROSTER_SIZE / DELEGATION_COUNT / DISTINCT_PROVIDER_COUNT  census guards
ROUTES_ENV="$(node --input-type=module -e "
  Promise.all([
    import('./patches/omo-dsh/omo-agents/src/model-routes.ts'),
    import('./patches/omo-dsh/omo-agents/src/roster.ts'),
  ]).then(([routesModule, roster]) => {
    const r = routesModule.resolveModelRoutes()
    console.log('SISYPHUS_PROVIDER=' + r.sisyphus.provider)
    console.log('SISYPHUS_MODEL=' + r.sisyphus.model)
    console.log('EXPLORE_PROVIDER=' + r.explore.provider)
    console.log('EXPLORE_MODEL=' + r.explore.model)
    const explore = roster.ROSTER.find((e) => e.id === 'explore')
    console.log('EXPLORE_DENY_JSON=' + JSON.stringify(roster.denyToolNamesFor(explore)))
    console.log('EXPLORE_MAXDEPTH=' + String(explore.maxDepth))
    console.log('ROSTER_SIZE=' + String(roster.ALL_AGENT_IDS.length))
    console.log('DELEGATION_COUNT=' + String(roster.DELEGATION_ENTRIES.length))
    for (const id of roster.ALL_AGENT_IDS) {
      console.log('ROUTE_FIELD=' + id + '=' + r[id].provider + '/' + r[id].model)
    }
    const seenProviders = new Set()
    for (const id of roster.ALL_AGENT_IDS) {
      if (seenProviders.has(r[id].provider)) continue
      seenProviders.add(r[id].provider)
      console.log('ROUTE_PROVIDER=' + r[id].provider)
    }
    console.log('DISTINCT_PROVIDER_COUNT=' + String(seenProviders.size))
    for (const entry of roster.DELEGATION_ENTRIES) {
      console.log('DELEGATION_ID=' + entry.id)
      console.log('DELEGATION_MAXDEPTH=' + entry.id + '=' + String(entry.maxDepth))
      const deny = roster.denyToolNamesFor(entry)
      const allow = roster.allowToolNamesFor(entry)
      if (deny !== undefined) console.log('DELEGATION_DENY=' + entry.id + '=' + JSON.stringify(deny))
      else if (allow !== undefined) console.log('DELEGATION_ALLOW_PLAIN=' + entry.id + '=' + allow.join(', '))
    }
  })
")" || fail "model-routes/roster module resolution failed: $ROUTES_ENV"
# `env_lines <KEY>`: every value of a repeated KEY= line, in emission order.
env_lines() { printf '%s\n' "$ROUTES_ENV" | grep "^$1=" | cut -d= -f2- || true; }
SISYPHUS_PROVIDER="$(printf '%s\n' "$ROUTES_ENV" | grep '^SISYPHUS_PROVIDER=' | cut -d= -f2-)"
SISYPHUS_MODEL="$(printf '%s\n' "$ROUTES_ENV" | grep '^SISYPHUS_MODEL=' | cut -d= -f2-)"
EXPLORE_PROVIDER="$(printf '%s\n' "$ROUTES_ENV" | grep '^EXPLORE_PROVIDER=' | cut -d= -f2-)"
EXPLORE_MODEL="$(printf '%s\n' "$ROUTES_ENV" | grep '^EXPLORE_MODEL=' | cut -d= -f2-)"
EXPLORE_DENY_JSON="$(printf '%s\n' "$ROUTES_ENV" | grep '^EXPLORE_DENY_JSON=' | cut -d= -f2-)"
EXPLORE_MAXDEPTH="$(printf '%s\n' "$ROUTES_ENV" | grep '^EXPLORE_MAXDEPTH=' | cut -d= -f2-)"
[[ -n "$SISYPHUS_PROVIDER" && -n "$SISYPHUS_MODEL" && -n "$EXPLORE_PROVIDER" && -n "$EXPLORE_MODEL" ]] \
  || fail "could not parse model-routes output: $ROUTES_ENV"
[[ -n "$EXPLORE_DENY_JSON" ]] \
  || fail "could not parse the roster-computed explore deny list from: $ROUTES_ENV"
[[ -n "$EXPLORE_MAXDEPTH" ]] \
  || fail "could not parse the roster-computed explore maxDepth from: $ROUTES_ENV"
[[ "$SISYPHUS_PROVIDER/$SISYPHUS_MODEL" != "$EXPLORE_PROVIDER/$EXPLORE_MODEL" ]] \
  || fail "AC-5 precheck: both agents resolve to the SAME route ($SISYPHUS_PROVIDER/$SISYPHUS_MODEL)"
echo "concerto-probe: T14 routes: sisyphus=$SISYPHUS_PROVIDER/$SISYPHUS_MODEL explore=$EXPLORE_PROVIDER/$EXPLORE_MODEL"

# P2-T20 roster-derived expectation sets (see the ROUTES_ENV block above for the
# emission contract). Every count below is a single-source value the probe then
# compares against, so a roster edit cannot leave a stale literal behind.
ROSTER_SIZE="$(env_lines ROSTER_SIZE)"
DELEGATION_COUNT="$(env_lines DELEGATION_COUNT)"
DISTINCT_PROVIDER_COUNT="$(env_lines DISTINCT_PROVIDER_COUNT)"
ROUTE_FIELDS="$(env_lines ROUTE_FIELD)"
ROUTE_PROVIDERS="$(env_lines ROUTE_PROVIDER)"
DELEGATION_IDS="$(env_lines DELEGATION_ID)"
DELEGATION_MAXDEPTHS="$(env_lines DELEGATION_MAXDEPTH)"
DELEGATION_DENIES="$(env_lines DELEGATION_DENY)"
DELEGATION_ALLOWS="$(env_lines DELEGATION_ALLOW_PLAIN)"
count_lines() { printf '%s\n' "$1" | grep -c . || true; }
for probe_count in "$ROSTER_SIZE" "$DELEGATION_COUNT" "$DISTINCT_PROVIDER_COUNT"; do
  [[ "$probe_count" =~ ^[0-9]+$ && "$probe_count" -gt 0 ]] \
    || fail "roster-derived census missing from the resolution output: $ROUTES_ENV"
done
[[ "$(count_lines "$ROUTE_FIELDS")" == "$ROSTER_SIZE" ]] \
  || fail "expected $ROSTER_SIZE route fields, got $(count_lines "$ROUTE_FIELDS"): $ROUTE_FIELDS"
[[ "$(count_lines "$ROUTE_PROVIDERS")" == "$DISTINCT_PROVIDER_COUNT" ]] \
  || fail "expected $DISTINCT_PROVIDER_COUNT distinct route providers, got $(count_lines "$ROUTE_PROVIDERS"): $ROUTE_PROVIDERS"
[[ "$(count_lines "$DELEGATION_IDS")" == "$DELEGATION_COUNT" ]] \
  || fail "expected $DELEGATION_COUNT delegation ids, got $(count_lines "$DELEGATION_IDS"): $DELEGATION_IDS"
[[ "$(count_lines "$DELEGATION_MAXDEPTHS")" == "$DELEGATION_COUNT" ]] \
  || fail "expected $DELEGATION_COUNT delegation maxDepth pins, got $(count_lines "$DELEGATION_MAXDEPTHS")"
# The ONE 11-route summary line the plugin logs carries exactly these fields,
# in roster order (P2-T20(b)).
EXPECTED_ROUTE_SUMMARY="[omo-agents] model routes: $(printf '%s' "$ROUTE_FIELDS" | paste -sd' ' -)"
# The rendered toolFilter lines the materialized composition must carry
# (P2-T20: the P2-T15 explore pins generalized to every roster row).
UNIFORM_MAXDEPTH="$(printf '%s\n' "$DELEGATION_MAXDEPTHS" | cut -d= -f2- | sort -u)"
[[ "$(count_lines "$UNIFORM_MAXDEPTH")" == "1" ]] \
  || fail "roster maxDepth is NOT uniform across the delegation rows: $UNIFORM_MAXDEPTH"
echo "concerto-probe: P2-T20 roster: $ROSTER_SIZE routes, $DELEGATION_COUNT delegation rows, $DISTINCT_PROVIDER_COUNT distinct providers ($(printf '%s' "$ROUTE_PROVIDERS" | paste -sd' ' -)), uniform maxDepth=$UNIFORM_MAXDEPTH"

# P3-T3: the omo-hooks mount marker's expected text, derived from the plugin's
# OWN manifest.ts + boot-markers.ts (Node 24 type-stripping, the same
# single-source discipline as the route resolution above). The probe therefore
# never restates the manifest counts: a drift in either module — or a booted
# plugin whose roster disagrees with this tree — fails the grep below.
EXPECTED_HOOKS_SUMMARY="$(node --input-type=module -e "
  Promise.all([
    import('./patches/omo-dsh/omo-hooks/src/manifest.ts'),
    import('./patches/omo-dsh/omo-hooks/src/boot-markers.ts'),
  ]).then(([manifest, markers]) => {
    console.log(markers.formatLoadedSummaryLine(manifest.HOOK_MANIFEST))
  })
")" || fail "omo-hooks manifest/boot-markers module resolution failed: $EXPECTED_HOOKS_SUMMARY"
[[ -n "$EXPECTED_HOOKS_SUMMARY" ]] \
  || fail "could not derive the omo-hooks summary marker from manifest.ts + boot-markers.ts"
echo "concerto-probe: P3-T3 hooks marker: $EXPECTED_HOOKS_SUMMARY"

# P3-T5 (review finding mcode P2) + P3-T19: the per-hook `registered` markers the
# boot MUST carry. The summary above proves the manifest loaded; it does NOT prove
# HOOK_REGISTRARS kept its entries — a registry that drifts back to `{}` (a
# renamed import, a dropped key) still logs the summary and registers nothing.
# So each expected line is rendered by the plugin's OWN
# formatHookRegisteredLine, with the id coming from the plugin's OWN
# `src/hooks/<id>.ts` file set (the manifest.ts "id == basename" anchor) paired
# with that row's manifest event — the loop logs exactly the PRIMARY event
# (index.ts discipline ④). Deriving the ids from HOOK_REGISTRARS instead would
# be circular: the registry emptying would shrink the expectation to zero lines
# and leave the probe green, which is the exact gap this closes. Every ported
# hook that lands a file is covered without a probe edit — after P3-T17 the port
# group is COMPLETE, so this derivation now yields the full 14 registered markers
# (one per manifest row), and P3-T19 tightened it from "at least one file" to
# "the src/hooks file set EQUALS the manifest id set": a dropped or renamed
# implementation file is now a probe FAILURE instead of a silently smaller
# expectation. There is no hand-maintained list of 14 lines anywhere in this
# script.
EXPECTED_HOOK_REGISTERED_LINES="$(node --input-type=module -e "
  Promise.all([
    import('./patches/omo-dsh/omo-hooks/src/manifest.ts'),
    import('./patches/omo-dsh/omo-hooks/src/boot-markers.ts'),
    import('node:fs'),
  ]).then(([manifest, markers, fsModule]) => {
    const fs = fsModule.default ?? fsModule
    const manifestIds = manifest.HOOK_MANIFEST.map((entry) => entry.id)
    const implementedIds = fs.readdirSync('./patches/omo-dsh/omo-hooks/src/hooks')
      .filter((fileName) => fileName.endsWith('.ts'))
      .map((fileName) => fileName.slice(0, -'.ts'.length))
    const implemented = new Set(implementedIds)
    const missing = manifestIds.filter((id) => !implemented.has(id))
    const extra = implementedIds.filter((id) => !manifestIds.includes(id))
    if (missing.length > 0 || extra.length > 0) {
      throw new Error('src/hooks file set != manifest id set (missing implementation: '
        + (missing.join(', ') || 'none') + '; file without manifest row: ' + (extra.join(', ') || 'none') + ')')
    }
    if (manifestIds.length === 0) {
      throw new Error('empty manifest — the registered-line assertion would be vacuous')
    }
    for (const entry of manifest.HOOK_MANIFEST) {
      console.log(markers.formatHookRegisteredLine(entry.id, entry.event))
    }
  })
")" || fail "omo-hooks registered-marker derivation failed: $EXPECTED_HOOK_REGISTERED_LINES"
[[ -n "$EXPECTED_HOOK_REGISTERED_LINES" ]] \
  || fail "could not derive any omo-hooks registered marker from the src/hooks file set + manifest.ts + boot-markers.ts"
echo "concerto-probe: P3-T5 hooks registered markers ($(printf '%s\n' "$EXPECTED_HOOK_REGISTERED_LINES" | grep -c .)):"
printf '%s\n' "$EXPECTED_HOOK_REGISTERED_LINES" | sed 's/^/concerto-probe:   /'

# P4-T3: the omo-commands mount marker's expected text, derived from the
# plugin's OWN manifest.ts + boot-markers.ts + index.ts (Node 24 type-stripping,
# the same single-source discipline as the hooks half above). The node step
# prints the ONE summary line first and then every expected `registered` line, so
# a drift in any of those three modules — or a booted plugin whose registry
# disagrees with this tree — fails the greps below.
#
# WHY THE REGISTRY IS PART OF THE DERIVATION (and not the circular version): a
# manifest row registers only when it is 'ported' AND has a registrar, so the
# expectation is "ported ids ∩ registry keys". Deriving from the registry alone
# would shrink to zero lines the moment COMMAND_REGISTRARS lost an entry and
# leave the probe green — the exact gap the hooks half documents. So the node
# step instead FAILS LOUDLY when a ported row has no registrar, and the shell
# then cross-checks the number of derived `registered` lines against the ported
# count printed in the summary line itself (both derived, neither hard-coded).
#
# At P4-T3 every row is 'pending', so the derivation yields the summary line and
# ZERO registered lines — vacuously correct, and the derivation is already
# proven by tests/omo-commands/registration.test.ts. T6+ fills it without a probe
# edit.
EXPECTED_COMMANDS_MARKERS="$(node --input-type=module -e "
  Promise.all([
    import('./patches/omo-dsh/omo-commands/src/manifest.ts'),
    import('./patches/omo-dsh/omo-commands/src/boot-markers.ts'),
    import('./patches/omo-dsh/omo-commands/src/index.ts'),
  ]).then(([manifest, markers, plugin]) => {
    const ported = manifest.COMMAND_MANIFEST.filter((entry) => entry.status === 'ported')
    const missing = ported.filter((entry) => !(entry.id in plugin.COMMAND_REGISTRARS))
    if (missing.length > 0) {
      throw new Error('a ported manifest row has no registrar (COMMAND_REGISTRARS lost this entry — import drift?): '
        + missing.map((entry) => entry.id).join(', '))
    }
    const registeredRows = ported.filter((entry) => entry.id in plugin.COMMAND_REGISTRARS)
    console.log(markers.formatLoadedSummaryLine(manifest.COMMAND_MANIFEST, registeredRows))
    for (const entry of registeredRows) {
      console.log(markers.formatCommandRegisteredLine(entry.id))
    }
  })
")" || fail "omo-commands manifest/boot-markers/index module resolution failed: $EXPECTED_COMMANDS_MARKERS"
EXPECTED_COMMANDS_SUMMARY="$(printf '%s\n' "$EXPECTED_COMMANDS_MARKERS" | head -n 1)"
EXPECTED_COMMANDS_REGISTERED_LINES="$(printf '%s\n' "$EXPECTED_COMMANDS_MARKERS" | tail -n +2)"
[[ -n "$EXPECTED_COMMANDS_SUMMARY" ]] \
  || fail "could not derive the omo-commands summary marker from manifest.ts + boot-markers.ts"
# Cross-check: the derived `registered` line count must equal the ported count
# the summary line reports. This is NOT the "a derivation lost a line" guard —
# the node step above already fails first for that (a ported row with no
# registrar throws before printing anything). What this catches is the OTHER
# half: a drift between the formatter's ported tally and the registry-derived
# line set, i.e. the two derivations of "which rows are ported" disagreeing. At
# P4-T3 it reads 0 == 0.
EXPECTED_COMMANDS_PORTED="$(printf '%s' "$EXPECTED_COMMANDS_SUMMARY" | sed -n 's/.*ported=\([0-9]\+\)).*/\1/p')"
EXPECTED_COMMANDS_REGISTERED_COUNT="$(printf '%s\n' "$EXPECTED_COMMANDS_REGISTERED_LINES" | grep -c . || true)"
[[ "$EXPECTED_COMMANDS_PORTED" == "$EXPECTED_COMMANDS_REGISTERED_COUNT" ]] \
  || fail "omo-commands derivation is inconsistent: summary says ported=$EXPECTED_COMMANDS_PORTED but $EXPECTED_COMMANDS_REGISTERED_COUNT registered lines were derived"
echo "concerto-probe: P4-T3 commands marker: $EXPECTED_COMMANDS_SUMMARY"

# P4-T5: the skill-delivery summary, derived from the plugin's own skills.ts +
# boot-markers.ts by RUNNING the same scan apply() runs (the count is the live
# vendor tree, not a restatement). Two facts are cross-checked, because the
# summary line alone cannot carry them: the number of SKILL DIRECTORIES the
# reader finds, and the number of documents it can actually register. A file the
# hand-rolled frontmatter reader rejects would show up as a smaller registered
# count than directory count — i.e. a partially delivered catalog, which the
# e2e would then report as a missing skill.
EXPECTED_SKILLS_MARKERS="$(node --input-type=module -e "
  Promise.all([
    import('./patches/omo-dsh/omo-commands/src/skills.ts'),
    import('./patches/omo-dsh/omo-commands/src/boot-markers.ts'),
  ]).then(([skills, markers]) => {
    const scan = skills.scanVendorSkills(skills.VENDOR_SKILLS_DIR)
    const total = scan.entries.length + scan.failures.length
    if (scan.failures.length > 0) {
      throw new Error('vendored skill file(s) the plugin reader rejects: '
        + scan.failures.map((failure) => failure.directoryName).join(', '))
    }
    // line 1: the summary the boot must log; line 2: the counts to cross-check.
    console.log(markers.formatSkillsSummaryLine({ registered: scan.entries.length, total, failed: scan.failures.length }))
    console.log('dirs=' + skills.listVendorSkillDirectories(skills.VENDOR_SKILLS_DIR).length + ' parsed=' + scan.entries.length)
  })
")" 2>&1 || fail "omo-commands skills module resolution failed (node stderr is merged in so the real reason shows): $EXPECTED_SKILLS_MARKERS"
EXPECTED_SKILLS_SUMMARY="$(printf '%s\n' "$EXPECTED_SKILLS_MARKERS" | head -n 1)"
EXPECTED_SKILLS_COUNTS="$(printf '%s\n' "$EXPECTED_SKILLS_MARKERS" | tail -n 1)"
[[ -n "$EXPECTED_SKILLS_SUMMARY" ]] \
  || fail "could not derive the omo-commands skills summary marker from skills.ts + boot-markers.ts"
# `2>&1` (NIT 11) makes the failure message carry node's real stderr, at the cost
# of letting a stderr line into the captured value — so the marker shape is
# asserted, not merely its presence. A polluted first line fails HERE, loudly,
# with the pollution visible, instead of silently derailing the grep below.
[[ "$EXPECTED_SKILLS_SUMMARY" == \[omo-commands\]*" registered (runtime, vendor path)"* ]] \
  || fail "the derived omo-commands skills marker is not the marker shape (stderr pollution?): $EXPECTED_SKILLS_SUMMARY"
# Every discovered skill must be registrable: a file the hand-rolled reader
# rejects would make the delivered catalog SHORTER than the tree, which the e2e
# would report only as a missing skill name. Caught here instead, with counts.
EXPECTED_SKILLS_DIRS="$(printf '%s' "$EXPECTED_SKILLS_COUNTS" | sed -n 's/^dirs=\([0-9]\+\).*/\1/p')"
EXPECTED_SKILLS_PARSED="$(printf '%s' "$EXPECTED_SKILLS_COUNTS" | sed -n 's/.*parsed=\([0-9]\+\)$/\1/p')"
[[ -n "$EXPECTED_SKILLS_DIRS" && "$EXPECTED_SKILLS_DIRS" == "$EXPECTED_SKILLS_PARSED" ]] \
  || fail "omo-commands skills derivation is inconsistent: $EXPECTED_SKILLS_DIRS skill directories but $EXPECTED_SKILLS_PARSED parsed documents"
echo "concerto-probe: P4-T5 skills marker: $EXPECTED_SKILLS_SUMMARY"
if [[ "$EXPECTED_COMMANDS_REGISTERED_COUNT" != "0" ]]; then
  echo "concerto-probe: P4-T3 commands registered markers ($EXPECTED_COMMANDS_REGISTERED_COUNT):"
  printf '%s\n' "$EXPECTED_COMMANDS_REGISTERED_LINES" | sed 's/^/concerto-probe:   /'
fi

# P2-T15 (plan §4.4 deny-sentinel rendering): the explore row's deny is no
# longer the inline F1 triple. It is the ROSTER-COMPUTED list — write/edit plus
# all 10 delegation toolNames, in roster order — emitted above from
# src/roster.ts's denyToolNamesFor(). Both assertions below (the schema gate on
# the parsed row, and the materialized-composition grep) derive their
# expectation from that same JSON instead of restating the 12 names, so a
# roster change cannot leave a stale pin behind. P2-T20 generalizes this probe
# from the explore row to every roster row.
EXPLORE_DENY_SEQUENCE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).map((n) => JSON.stringify(n)).join(", "))' "$EXPLORE_DENY_JSON")" \
  || fail "could not build the rendered explore deny sequence from $EXPLORE_DENY_JSON"
[[ -n "$EXPLORE_DENY_SEQUENCE" ]] \
  || fail "empty rendered explore deny sequence from $EXPLORE_DENY_JSON"
echo "concerto-probe: T15 explore deny (roster-computed): $EXPLORE_DENY_JSON"

# The explore seat rides the llm-pi-ai adapter, which the shipped composition
# mounts DORMANT (zero routes); a settings profile registers the route at
# boot. If an override points the explore seat at a route another adapter
# already owns, llm-pi-ai logs the DUPLICATE_ADAPTER refusal and keeps
# serving — the runtime assertions below then judge the result honestly.
mkdir -p "$DSH_HOME"
cat > "$DSH_HOME/settings.yaml" <<EOF
# T14 probe seed: register the explore seat's pi-ai provider route.
llm-pi-ai:
  providers:
    $EXPLORE_PROVIDER:
      apiKeyEnv: DEEPSEEK_API_KEY
EOF

# T11 schema gate: resolve the INSTALLED dsh's node_modules from the dsh
# binary itself (read-only — never modified), so the row is validated by the
# exact js-yaml dialect (JSON_SCHEMA + !!js) and schemastery Config that
# cordis runs at session-composition mount time.
DSH_BIN="$(readlink -f "$(command -v dsh)")" || fail "cannot resolve dsh binary"
DSH_NM="$(cd "$(dirname "$DSH_BIN")/../node_modules" && pwd)" || fail "cannot resolve dsh node_modules"
# T9: npm rc.6 ships every runtime package flat under the dsh package's own
# node_modules; the 0.1.2 pnpm source install links only apps/cli's DIRECT
# deps there (transitive workspace packages the proofs import by path — e.g.
# dsh-scope, dsh-agent-loop — live in the workspace hoist store). Build a
# union overlay of symlinks so the same nm-path imports resolve under either
# install shape. On npm rc.6 no hoist store exists and the overlay is a pure
# mirror of DSH_NM (symlink realpaths converge on the very same files).
# Precedence: DSH_NM wins on conflict (first-come, not overwritten): today the
# install under test is the ONLY source; if a future npm 0.1.2 package lands,
# revisit the loop order or the precedence breaks silently.
DSH_NM_UNION="$SANDBOX/dsh-nm"
mkdir -p "$DSH_NM_UNION/@deepseek-ai"
for entry in "$DSH_NM"/*; do
  name="$(basename "$entry")"
  [[ "$name" == "@deepseek-ai" || "$name" == ".bin" ]] && continue
  [[ -e "$DSH_NM_UNION/$name" ]] || ln -s "$entry" "$DSH_NM_UNION/$name"
done
for entry in "$DSH_NM/@deepseek-ai"/*; do
  name="$(basename "$entry")"
  [[ -e "$DSH_NM_UNION/@deepseek-ai/$name" ]] || ln -s "$entry" "$DSH_NM_UNION/@deepseek-ai/$name"
done
WORKSPACE_ROOT="$(cd "$DSH_NM/../../.." && pwd)"
HOIST_NM="$WORKSPACE_ROOT/node_modules/.pnpm/node_modules"
if [[ -d "$HOIST_NM/@deepseek-ai" ]]; then
  for entry in "$HOIST_NM/@deepseek-ai"/*; do
    name="$(basename "$entry")"
    [[ -e "$DSH_NM_UNION/@deepseek-ai/$name" ]] || ln -s "$entry" "$DSH_NM_UNION/@deepseek-ai/$name"
  done
fi
[[ -f "$DSH_NM_UNION/@deepseek-ai/dsh-tool-subagent/lib/index.js" && -f "$DSH_NM_UNION/js-yaml/dist/js-yaml.mjs" ]] \
  || fail "installed dsh is missing dsh-tool-subagent or js-yaml under $DSH_NM_UNION"
VALIDATE_EXPLORE_MJS="$SANDBOX/validate-explore-row.mjs"
cat > "$VALIDATE_EXPLORE_MJS" <<'EOF'
// T11: validate the materialized explore row against the installed dsh's schema.
// argv: <dsh node_modules dir> <materialized agent.cordis.yml> <provider> <model> <expected explore deny JSON> <expected explore maxDepth>
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const [nm, compositionPath, expectedProvider, expectedModel, expectedDenyJson, expectedMaxDepthRaw] = process.argv.slice(2)
const yaml = (await import(pathToFileURL(nm + '/js-yaml/dist/js-yaml.mjs').href)).default
const { Config } = await import(pathToFileURL(nm + '/@deepseek-ai/dsh-tool-subagent/lib/index.js').href)
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (d) => typeof d === 'string',
  construct: (d) => ({ __jsExpr: d }),
})
const rows = yaml.load(readFileSync(compositionPath, 'utf8'), { schema: yaml.JSON_SCHEMA.extend(JsExpr) })
const found = []
const walk = (list) => {
  for (const row of list) {
    if (row && typeof row === 'object') {
      if (row.id === 'tool-subagent-explore') found.push(row)
      if (Array.isArray(row.config)) walk(row.config)
    }
  }
}
walk(rows)
if (found.length !== 1) {
  console.error(`T11-VALIDATE FAIL: expected exactly 1 tool-subagent-explore row, found ${found.length}`)
  process.exit(1)
}
const row = found[0]
if (row.name !== '@deepseek-ai/dsh-tool-subagent') {
  console.error(`T11-VALIDATE FAIL: row name is ${row.name}`)
  process.exit(1)
}
let validated
try {
  validated = Config(row.config)
} catch (err) {
  console.error(`T11-VALIDATE FAIL: dsh-tool-subagent Config rejected the row: ${err.name}: ${err.message}`)
  process.exit(1)
}
const problems = []
if (validated.provider !== 'spawn') problems.push(`provider=${validated.provider}`)
if (validated.toolName !== 'explore') problems.push(`toolName=${validated.toolName}`)
if (validated.backgroundMode !== 'continuable') problems.push(`backgroundMode=${validated.backgroundMode}`)
// Roster-derived (probe hands in the value it resolved from src/roster.ts, the
// same single source the deny list uses). Corrected semantics 2026-09-13
// (D-2026-09-13-01): dsh caps the INVOKED row, so the explore row is 2 and the
// chain cap is 2 levels — never restate the literal here.
const expectedMaxDepth = Number(expectedMaxDepthRaw)
if (!Number.isInteger(expectedMaxDepth)) problems.push(`probe did not supply an integer explore maxDepth (got ${JSON.stringify(expectedMaxDepthRaw)})`)
else if (validated.maxDepth !== expectedMaxDepth) problems.push(`maxDepth=${JSON.stringify(validated.maxDepth)} expected ${expectedMaxDepth} (roster value)`)
// P2-T15 shape: the deny list is the ROSTER-COMPUTED 12-name list (write/edit
// plus the 10 delegation toolNames, roster order) handed in as JSON by the
// probe, which resolved it from src/roster.ts's denyToolNamesFor(). Never
// restate the names here. Order-sensitive JSON comparison is correct: the
// sentinel renderer emits roster order. P2-T20 generalizes this gate (and the
// materialized-composition grep below) to every roster row.
if (typeof expectedDenyJson !== 'string' || expectedDenyJson.length === 0) {
  console.error('T11-VALIDATE FAIL: probe did not supply the roster-computed explore deny list')
  process.exit(1)
}
const expectedDeny = JSON.parse(expectedDenyJson)
if (JSON.stringify(validated.toolFilter) !== JSON.stringify({ deny: expectedDeny })) {
  problems.push(`toolFilter=${JSON.stringify(validated.toolFilter)} expected ${JSON.stringify({ deny: expectedDeny })}`)
}
if (validated.agentOptions?.provider !== expectedProvider || validated.agentOptions?.model !== expectedModel) {
  problems.push(`agentOptions=${JSON.stringify(validated.agentOptions)} expected ${expectedProvider}/${expectedModel}`)
}
if (typeof validated.persona !== 'string' || !validated.persona.includes('# Explore: Read-Only Retrieval Agent')) {
  problems.push('persona missing the explore persona heading')
}
if (problems.length > 0) {
  console.error(`T11-VALIDATE FAIL: ${problems.join('; ')}`)
  process.exit(1)
}
console.log(`T11-VALIDATE PASS: tool-subagent-explore row validates against the installed dsh-tool-subagent Config `
  + `(toolName=explore provider=spawn route=${expectedProvider}/${expectedModel} maxDepth=${expectedMaxDepth} deny=[${validated.toolFilter.deny.join(',')}] persona=${validated.persona.length} chars)`)
EOF

# Adaptive web-RPC helper (T9). The readiness line decides the transport:
# rc.6 serves flat /api/<method> endpoints with no auth beyond the loopback
# Host-header fence; 0.1.2 mints a dsh-auth-* cookie via GET /?token=<launch>
# (303 + Set-Cookie; query tokens on /api itself get 401) and replaces the
# flat endpoints with Typert Remote endpoints /api/<namespace>/<method>
# (payload {args:{…}}, docs/api-gateway.md:121). 'providers' re-asserts the
# rc.6 llm.providers contract on 0.1.2 by joining the client's own two Remote
# calls with the Web UI Models page's own rule (joinProviderDirectory,
# ui-settings-models/src/client/store.ts:49-73): a directory entry is active
# ⟺ its provider id is a registered route — the exact join rc.6 performed
# server-side — so the grep assertions below stay transport-agnostic.
WEB_RPC_MJS="$SANDBOX/web-rpc.mjs"
cat > "$WEB_RPC_MJS" <<'EOF'
// argv: <roster|providers> <port> [launch-token]
const [kind, portArg, token] = process.argv.slice(2)
const port = Number(portArg)
if (!Number.isInteger(port) || port <= 0) {
  console.error(`web-rpc: bad port ${JSON.stringify(portArg)}`)
  process.exit(1)
}
const base = `http://127.0.0.1:${port}`
const remote = typeof token === 'string' && token.length > 0
let cookie
if (remote) {
  const handshake = await fetch(`${base}/?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  const handshakeText = await handshake.text()
  if (handshake.status !== 303) {
    console.error(`web-rpc: token→cookie handshake: expected 303, got HTTP ${handshake.status}: ${handshakeText.slice(0, 200)}`)
    process.exit(1)
  }
  let setCookies
  if (typeof handshake.headers.getSetCookie === 'function') {
    setCookies = handshake.headers.getSetCookie()
  } else {
    console.warn('web-rpc: Node without getSetCookie (multi-cookie fallback unreliable)')
    setCookies = [handshake.headers.get('set-cookie') ?? '']
  }
  cookie = setCookies
    .map((value) => value.split(';', 1)[0])
    .find((value) => value.startsWith('dsh-auth-'))
  if (cookie === undefined) {
    console.error('web-rpc: handshake minted no dsh-auth-* cookie')
    process.exit(1)
  }
}
let counter = 0
async function rpc(endpoint, payload) {
  const rpcId = `concerto-probe-${kind}-${++counter}`
  const response = await fetch(`${base}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie === undefined ? {} : { cookie }) },
    body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload }),
    signal: AbortSignal.timeout(10_000),
  })
  const text = await response.text()
  if (response.status !== 200) {
    console.error(`web-rpc: ${endpoint}: HTTP ${response.status}: ${text.slice(0, 200)}`)
    process.exit(1)
  }
  let body
  try {
    body = JSON.parse(text)
  } catch {
    console.error(`web-rpc: ${endpoint}: non-JSON body: ${text.slice(0, 200)}`)
    process.exit(1)
  }
  if (body?.result?.ok !== true) {
    console.error(`web-rpc: ${endpoint} failed: ${text.slice(0, 200)}`)
    process.exit(1)
  }
  return body.result.value
}
if (kind === 'roster') {
  const value = remote ? await rpc('agentPresets/list', { args: {} }) : await rpc('agentPreset.list', {})
  console.log(JSON.stringify({ type: 'server-response', rpcId: 'concerto-probe-roster', result: { ok: true, value } }))
} else if (kind === 'providers') {
  let value
  if (remote) {
    const [registered, directory] = await Promise.all([
      rpc('llm/listProviders', { args: {} }),
      rpc('llm/listConfigurableProviders', { args: {} }),
    ])
    const active = new Set(registered.map((provider) => provider.id))
    const declared = new Set(directory.map((entry) => entry.provider))
    const providers = directory.map((entry) => ({
      provider: entry.provider,
      displayName: entry.displayName,
      settingsNs: entry.settingsNs,
      settingsPath: [...entry.settingsPath],
      active: active.has(entry.provider),
      ...(entry.declared === undefined ? {} : { declared: entry.declared }),
    }))
    for (const provider of registered) {
      if (declared.has(provider.id)) continue
      providers.push({
        provider: provider.id,
        displayName: provider.name,
        settingsNs: '',
        settingsPath: [],
        active: true,
        ...(provider.declared === undefined ? {} : { declared: provider.declared }),
      })
    }
    value = { providers }
  } else {
    value = await rpc('llm.providers', {})
  }
  console.log(JSON.stringify({ type: 'server-response', rpcId: 'concerto-probe-providers', result: { ok: true, value } }))
} else {
  console.error(`web-rpc: unknown kind ${JSON.stringify(kind)}`)
  process.exit(1)
}
EOF

# boot_once <label> <expected-sync-outcome>: real boot, bounded; asserts the
# plugin-side markers and the external roster, then SIGTERMs (exit 0).
boot_once() {
  local label="$1" expected_outcome="$2"
  local boot_log="$SANDBOX/boot-$label.log"
  local api_resp="$SANDBOX/agentPreset.list-$label.json"

  # One-time feature probe (the profile now exists, so `--help` resolves).
  if [[ -z "${NO_OPEN_PROBED:-}" ]]; then
    NO_OPEN_PROBED=1
    if dsh --profile "$PROFILE" --help 2>&1 | grep -q -- '--no-open'; then
      NO_OPEN="--no-open"
      echo "concerto-probe: web app advertises --no-open (browser handoff suppressed)"
    else
      echo "concerto-probe: web app has no --no-open (pre-0.1.2 runtime; no handoff to suppress)"
    fi
  fi

  echo "concerto-probe: [$label] booting dsh --profile $PROFILE --patch ./cordis.yml --port 0 $NO_OPEN"
  # NO_OPEN is either empty or exactly one flag; unquoted on purpose so the
  # empty case adds no argument at all. shellcheck disable=SC2086
  dsh --profile "$PROFILE" --patch ./cordis.yml --port 0 $NO_OPEN >"$boot_log" 2>&1 &
  local dsh_pid=$!

  local port=""
  local ready_url=""
  for ((i = 0; i < READY_TIMEOUT_S; i++)); do
    ready_url="$(grep -oE 'http://127\.0\.0\.1:[0-9]+(/\?token=[A-Za-z0-9_-]+)?' "$boot_log" 2>/dev/null | head -1 || true)"
    port="$(printf '%s\n' "$ready_url" | grep -oE '^http://127\.0\.0\.1:[0-9]+' | grep -oE '[0-9]+$' || true)"
    if [[ -n "$port" ]]; then
      break
    fi
    if ! kill -0 "$dsh_pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  if [[ -z "$port" ]]; then
    kill -TERM "$dsh_pid" 2>/dev/null || true
    wait "$dsh_pid" 2>/dev/null
    cat "$boot_log" >&2 || true
    fail "[$label] no readiness line within ${READY_TIMEOUT_S}s (or dsh exited early)"
  fi

  # Transport detection (T9): a launch token in the readiness line means the
  # 0.1.2 web-RPC transport (dsh-auth-* cookie + Typert Remote endpoints); its
  # absence means the rc.6 flat transport. The official roster ids follow the
  # transport: 0.1.2 renamed the system preset code → ptc.
  local token=""
  case "$ready_url" in
    *\?token=*) token="${ready_url#*\?token=}" ;;
  esac
  local official_ids="standard code minimal cordis"
  if [[ -n "$token" ]]; then
    official_ids="standard ptc minimal cordis"
  fi
  echo "concerto-probe: [$label] web ready on 127.0.0.1:$port (transport: $([[ -n "$token" ]] && echo '0.1.2-remote (token+cookie)' || echo 'rc.6-flat'))"

  # T14: runtime adapter registration surface. rc.6: POST /api/llm.providers
  # joins ctx.llm.listProviders() (registered routes) with the configurable-
  # provider directory server-side. 0.1.2: the helper performs the client's
  # own two Remote calls and applies the same join (see WEB_RPC_MJS above).
  # Settings-driven routes register during plugin load, before the readiness
  # line, so one call suffices.
  local llm_resp="$SANDBOX/llm.providers-$label.json"
  local rpc_err="$SANDBOX/web-rpc-$label.err"
  if ! node "$WEB_RPC_MJS" providers "$port" "$token" >"$llm_resp" 2>"$rpc_err"; then
    cat "$rpc_err" >&2
    fail "[$label] provider-directory RPC failed (see error above)"
  fi

  # Poll the roster RPC until the preset lands (or the budget runs out).
  # Envelope shape: {type:'client-request', rpcId, method, payload:{args}} —
  # the exact surface packages/client/ui-agent-preset uses (0.1.2: through
  # the Typert Remote projection; rc.6: the flat agentPreset.list).
  local found=0
  for ((i = 0; i < 30; i++)); do
    if node "$WEB_RPC_MJS" roster "$port" "$token" >"$api_resp" 2>"$rpc_err"; then
      if grep -q '"id":"concerto"' "$api_resp" 2>/dev/null; then
        found=1
        break
      fi
    fi
    sleep 1
  done

  kill -TERM "$dsh_pid" 2>/dev/null || true
  wait "$dsh_pid"
  local boot_exit=$?
  [[ "$boot_exit" == "0" ]] || fail "[$label] dsh exited $boot_exit after SIGTERM (expected 0)"

  echo "----- [$label] boot log (full) -----"
  cat "$boot_log"
  echo "----- [$label] roster RPC response (verbatim; rc.6 /api/agentPreset.list | 0.1.2 /api/agentPresets/list) -----"
  cat "$api_resp"
  echo
  echo "----- [$label] provider directory response (verbatim; rc.6 /api/llm.providers | 0.1.2 joined llm Remote) -----"
  cat "$llm_resp"
  echo
  if [[ -s "$rpc_err" ]]; then
    echo "----- [$label] web-rpc last error (verbatim) -----"
    cat "$rpc_err"
    echo
  fi
  echo "----------------------------------------------------------"

  # Plugin-side assertions.
  grep -q "\[omo-agents\] loaded" "$boot_log" \
    || fail "[$label] plugin load marker missing (plugin never mounted?)"
  # P3-T3/P3-T5 + P3-T19: the second cordis.yml insert row mounted, its ONE
  # summary marker matches the source-derived text exactly (-F: the marker
  # carries regex metacharacters), and EVERY implemented hook logged its
  # `registered` line — the full 14-line set after P3-T17, with the id set in the
  # expectation provably equal to the manifest id set (see the derivation above).
  # An empty or renamed HOOK_REGISTRARS fails HERE even though the summary line
  # still matches. A FAILED line is a real registration/validation failure and
  # must never ride along silently, so both FAILED forms are explicitly asserted
  # ABSENT: the per-hook form and the manifest-validation form.
  grep -qF "$EXPECTED_HOOKS_SUMMARY" "$boot_log" \
    || fail "[$label] omo-hooks summary marker missing or drifted (want: $EXPECTED_HOOKS_SUMMARY)"
  local expected_registered_line
  while IFS= read -r expected_registered_line; do
    grep -qF "$expected_registered_line" "$boot_log" \
      || fail "[$label] omo-hooks registered marker missing or drifted (want: $expected_registered_line) — HOOK_REGISTRARS lost this entry (import drift?) or the loop stopped logging it"
  done <<<"$EXPECTED_HOOK_REGISTERED_LINES"
  if grep -q '\[omo-hooks\] manifest validation FAILED' "$boot_log"; then
    fail "[$label] omo-hooks rejected its own manifest at boot — see FAILED line above"
  fi
  if grep -q '\[omo-hooks\] hook .* FAILED' "$boot_log"; then
    fail "[$label] an omo-hooks registration FAILED at boot — see FAILED line above"
  fi
  # P4-T3: the third cordis.yml insert row mounted, its ONE summary marker matches
  # the source-derived text exactly (-F: the marker carries an em dash and regex
  # metacharacters), and every PORTED command logged its `registered` line. A
  # FAILED line is a real registration/validation failure and must never ride
  # along silently, so both FAILED forms are explicitly asserted ABSENT.
  grep -qF "$EXPECTED_COMMANDS_SUMMARY" "$boot_log" \
    || fail "[$label] omo-commands summary marker missing or drifted (want: $EXPECTED_COMMANDS_SUMMARY)"
  local expected_command_line
  while IFS= read -r expected_command_line; do
    [[ -n "$expected_command_line" ]] || continue
    grep -qF "$expected_command_line" "$boot_log" \
      || fail "[$label] omo-commands registered marker missing or drifted (want: $expected_command_line) — COMMAND_REGISTRARS lost this entry (import drift?) or the loop stopped logging it"
  done <<<"$EXPECTED_COMMANDS_REGISTERED_LINES"
  if grep -q '\[omo-commands\] manifest validation FAILED' "$boot_log"; then
    fail "[$label] omo-commands rejected its own manifest at boot — see FAILED line above"
  fi
  if grep -q '\[omo-commands\] command .* FAILED' "$boot_log"; then
    fail "[$label] an omo-commands registration FAILED at boot — see FAILED line above"
  fi
  # P4-T5: the skill delivery sweep ran and reported its honest ratio. The two
  # FAILED forms (a per-skill read/parse/register failure, and a mismatch between
  # the derived ratio and the derived directory count) are asserted ABSENT.
  grep -qF "$EXPECTED_SKILLS_SUMMARY" "$boot_log" \
    || fail "[$label] omo-commands skills marker missing or drifted (want: $EXPECTED_SKILLS_SUMMARY)"
  if grep -q '\[omo-commands\] skill .* FAILED' "$boot_log"; then
    fail "[$label] an omo-commands skill FAILED at boot — see FAILED line above"
  fi
  if grep -q "\[omo-agents\] concerto .* FAILED" "$boot_log"; then
    fail "[$label] registration threw — see FAILED line above"
  fi
  grep -q "\[omo-agents\] concerto preset $expected_outcome at " "$boot_log" \
    || fail "[$label] expected sync outcome '$expected_outcome' not logged"
  grep -q "\[omo-agents\] concerto roster: " "$boot_log" \
    || fail "[$label] roster line missing (inject callback never ran?)"
  grep -q "concerto:user" "$boot_log" \
    || fail "[$label] plugin-side roster does not list concerto as a user preset"

  # External assertions: the RPC roster lists all 5 presets — the official 4 at
  # system trust plus concerto at user trust, i.e. the SAME roster level — and
  # the concerto entry carries OUR preset.yml display name (协奏 / Concerto).
  # $official_ids is transport-adaptive (0.1.2 renamed code → ptc, see above).
  for id in $official_ids; do
    grep -q "\"id\":\"$id\"" "$api_resp" \
      || fail "[$label] official preset '$id' missing from the roster RPC response"
  done
  [[ "$found" == "1" ]] \
    || fail "[$label] concerto NOT in the roster RPC after 30s — registration broken"
  grep -q '"trust":"user"[^}]*"id":"concerto"\|"id":"concerto"[^}]*"trust":"user"' "$api_resp" \
    || fail "[$label] concerto entry does not carry trust:\"user\""
  grep -q '协奏' "$api_resp" \
    || fail "[$label] concerto entry missing OUR preset.yml name (协奏) — not the real preset?"
  grep -q 'Concerto' "$api_resp" \
    || fail "[$label] concerto entry missing OUR preset.yml name (Concerto) — not the real preset?"

  # Sandbox hygiene: the authored preset must live ONLY inside the sandbox.
  [[ -f "$DSH_HOME/.agent-presets/concerto/preset.yml" ]] \
    || fail "[$label] preset missing from the sandbox user root (sync wrote elsewhere?)"

  # T8 (FR-3, AC-3): the persona the concerto mode boots with is the assembled
  # omo-sisyphus system prompt. Plugin-side marker + the materialized
  # composition carries the rendered block scalar (sentinel gone).
  # The assembly is five sections (role, delegationDiscipline,
  # delegationRoster, hardBlocks, antiPatterns); this probe asserts three of
  # their markers below. The conductor is deliberately NOT part of the P2-T20
  # 10-line delegation-marker block further down (boot-markers.ts 口径注: the
  # conductor's marker is this `omo-sisyphus system prompt assembled` line).
  grep -q "\[omo-agents\] omo-sisyphus system prompt assembled: 5 sections, " "$boot_log" \
    || fail "[$label] omo-sisyphus prompt assembly marker missing from boot log"
  local materialized="$DSH_HOME/.agent-presets/concerto/agent.cordis.yml"
  [[ -f "$materialized" ]] \
    || fail "[$label] materialized agent.cordis.yml missing from the sandbox user root"
  if grep -q "__OMO_SISYPHUS_SYSTEM_PROMPT__" "$materialized"; then
    fail "[$label] materialized composition still carries the persona sentinel (rendering skipped?)"
  fi
  grep -q "prefix: |-" "$materialized" \
    || fail "[$label] materialized persona is not a `prefix: |-` block scalar"
  grep -q "      # Orchestrator Role" "$materialized" \
    || fail "[$label] materialized persona missing the Orchestrator Role section"
  grep -q "      # Delegation Discipline" "$materialized" \
    || fail "[$label] materialized persona missing the Delegation Discipline section"
  grep -q "      ## Hard Blocks" "$materialized" \
    || fail "[$label] materialized persona missing the injected Hard Blocks section"

  # T11 (FR-4/FR-5 binding, form A): the explore tool-subagent instance is part
  # of the mounted composition. Content assertions on the materialized file,
  # then the real schema gate (the installed dsh's own Config) below.
  grep -q "^    - id: tool-subagent-explore$" "$materialized" \
    || fail "[$label] explore tool-subagent row missing from the materialized composition"
  grep -q "^        toolName: explore$" "$materialized" \
    || fail "[$label] explore row missing toolName: explore"
  grep -q "^        provider: spawn$" "$materialized" \
    || fail "[$label] explore row missing provider: spawn"
  if grep -q "__OMO_EXPLORE_PERSONA__\|__OMO_EXPLORE_AGENT_OPTIONS__" "$materialized"; then
    fail "[$label] materialized composition still carries a T11 sentinel (rendering skipped?)"
  fi
  grep -q "^        persona: |-$" "$materialized" \
    || fail "[$label] explore persona is not a |- block scalar"
  grep -q "          # Explore: Read-Only Retrieval Agent" "$materialized" \
    || fail "[$label] explore persona missing the T10 persona heading"
  grep -q "^          provider: \"$EXPLORE_PROVIDER\"$" "$materialized" \
    || fail "[$label] explore agentOptions provider mismatch (want $EXPLORE_PROVIDER)"
  grep -q "^          model: \"$EXPLORE_MODEL\"$" "$materialized" \
    || fail "[$label] explore agentOptions model mismatch (want $EXPLORE_MODEL)"
  # P2-T15 shape: the rendered deny is the roster-computed list (write/edit +
  # the 10 delegation toolNames, roster order) emitted by the P2-T15 sentinel
  # renderer as a JSON-quoted YAML flow sequence at the row's 10-space content
  # indent. The expected line is assembled from the same $EXPLORE_DENY_JSON the
  # schema gate above compared against, so this pin cannot go stale on its own;
  # P2-T20 generalizes it to every roster row.
  grep -qxF -- "          deny: [$EXPLORE_DENY_SEQUENCE]" "$materialized" \
    || fail "[$label] explore toolFilter deny list missing or not the roster-computed sequence (T12 + F1, P2-T15 shape: want deny: [$EXPLORE_DENY_SEQUENCE])"
  # maxDepth pin is ROSTER-DERIVED for the same reason as the deny pin above:
  # $EXPLORE_MAXDEPTH was resolved from src/roster.ts at probe start, so a
  # roster edit (like the 2026-09-13 target-row correction, D-2026-09-13-01)
  # cannot leave a stale literal here.
  grep -q "^        maxDepth: $EXPLORE_MAXDEPTH$" "$materialized" \
    || fail "[$label] explore maxDepth: $EXPLORE_MAXDEPTH missing (T13 roster-derived value)"

  # P2-T20: the P2-T15 explore pins above, generalized to EVERY roster
  # delegation row. Everything asserted here is derived at probe start from
  # src/roster.ts (toolName ids, per-row deny/allow lists, maxDepth) — no
  # literal roster list is restated in this script. The explore row is checked
  # twice (here and by the explicit T11 greps above) by design: the named
  # explore assertions stay as the pinned T11 evidence.
  local delegation_id row_maxdepth row_deny_json row_allow_plain row_deny_sequence
  while IFS= read -r delegation_id; do
    [[ -n "$delegation_id" ]] || continue
    grep -q "^    - id: tool-subagent-$delegation_id$" "$materialized" \
      || fail "[$label] materialized composition has no '- id: tool-subagent-$delegation_id' row"
    grep -q "^        toolName: $delegation_id$" "$materialized" \
      || fail "[$label] materialized row tool-subagent-$delegation_id has no 'toolName: $delegation_id'"
    row_maxdepth="$(printf '%s\n' "$DELEGATION_MAXDEPTHS" | grep "^$delegation_id=" | cut -d= -f2- || true)"
    [[ -n "$row_maxdepth" ]] || fail "[$label] no roster maxDepth expectation for delegation row '$delegation_id'"
    grep -q "^        maxDepth: $row_maxdepth$" "$materialized" \
      || fail "[$label] materialized row '$delegation_id' maxDepth != roster value $row_maxdepth"
    row_deny_json="$(printf '%s\n' "$DELEGATION_DENIES" | grep "^$delegation_id=" | cut -d= -f2- || true)"
    if [[ -n "$row_deny_json" ]]; then
      row_deny_sequence="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).map((n) => JSON.stringify(n)).join(", "))' "$row_deny_json")" \
        || fail "[$label] could not build the rendered deny sequence for '$delegation_id' from $row_deny_json"
      grep -qxF -- "          deny: [$row_deny_sequence]" "$materialized" \
        || fail "[$label] materialized row '$delegation_id' deny list missing or not the roster-computed sequence (want deny: [$row_deny_sequence])"
    fi
    row_allow_plain="$(printf '%s\n' "$DELEGATION_ALLOWS" | grep "^$delegation_id=" | cut -d= -f2- || true)"
    if [[ -n "$row_allow_plain" ]]; then
      grep -qxF -- "          allow: [$row_allow_plain]" "$materialized" \
        || fail "[$label] materialized row '$delegation_id' allow list missing or not the roster-derived list (want allow: [$row_allow_plain])"
    fi
  done <<< "$DELEGATION_IDS"
  # Uniform maxDepth: exactly one maxDepth line per delegation row, all equal to
  # the roster's uniform value (the spec's ④ shape, roster-derived).
  local materialized_depth_lines
  materialized_depth_lines="$(grep -c "^        maxDepth: $UNIFORM_MAXDEPTH$" "$materialized" || true)"
  [[ "$materialized_depth_lines" == "$DELEGATION_COUNT" ]] \
    || fail "[$label] expected $DELEGATION_COUNT maxDepth lines at the roster-uniform value $UNIFORM_MAXDEPTH, found $materialized_depth_lines"
  local materialized_toolnames
  materialized_toolnames="$(grep -c '^        toolName: ' "$materialized" || true)"
  [[ "$materialized_toolnames" == "$DELEGATION_COUNT" ]] \
    || fail "[$label] expected $DELEGATION_COUNT delegation toolName lines, found $materialized_toolnames"

  node "$VALIDATE_EXPLORE_MJS" "$DSH_NM_UNION" "$materialized" "$EXPLORE_PROVIDER" "$EXPLORE_MODEL" "$EXPLORE_DENY_JSON" "$EXPLORE_MAXDEPTH" \
    || fail "[$label] explore row failed validation against the installed dsh-tool-subagent Config"

  # T12 (P-4, AC-6 negative-a): the deny list is not just valid config — it is
  # ENFORCED. scripts/prove-explore-toolfilter.mjs runs the installed dsh's
  # REAL child-composition path (dsh-subagent applyChildComposition →
  # tools.restrict → ToolRuntime view) against THIS materialized row and
  # asserts write/edit never reach the child scope's model-facing tool list
  # (schemas/get/execute all deny), while read/grep/glob and the platform
  # shell survive. A live model session closes the loop in T20.
  node "$REPO_ROOT/scripts/prove-explore-toolfilter.mjs" "$DSH_NM_UNION" "$materialized" \
    || fail "[$label] explore toolFilter denial proof failed (T12 real-path enforcement)"

  # T13 (P-5, AC-6 negative-b): the depth cap is not just valid config — it is
  # ENFORCED. scripts/prove-explore-maxdepth.mjs mounts the row's own
  # dsh-tool-subagent instance on the REAL delegation stack (cordis +
  # ToolRuntime + SubagentRuntime + the spawn provider) and drives the real
  # start path under the corrected target-row semantics (D-2026-09-13-01,
  # roster maxDepth: $EXPLORE_MAXDEPTH): a depth-1 parent's call PASSES the gate
  # (the atlas(1) → worker(2) re-delegation path), while a depth-2 parent's
  # further attempt is rejected on BOTH the foreground (ctx.subagents.start →
  # spawn → startInProcessRun) and continuable (ctx.subagents.startContinuable)
  # starts with the exact errored tool result "Error: subagent depth 3 exceeds
  # maxDepth 2"; the tool stays model-visible at the cap; a depth-0 parent
  # passes the same gate (control). A live model session closes the loop in T20.
  node "$REPO_ROOT/scripts/prove-explore-maxdepth.mjs" "$DSH_NM_UNION" "$materialized" \
    || fail "[$label] explore maxDepth=$EXPLORE_MAXDEPTH depth-cap proof failed (T13 real-path enforcement)"

  # T15 (P-7, AC-5 observation half): the session JSONL is the route
  # observation channel — no listener code needed. prove-route-logging.mjs
  # boots the FULL real stack from the installed rc.6 (the five testkit
  # services + JsonlSessionPersistence plaintext + AgentLoop +
  # SubagentRuntime + the spawn provider), registers scripted mock adapters
  # on OUR two real route names (from src/model-routes.ts), runs one parent
  # turn and one real continuable explore-style start, then reads the real
  # artifacts off disk: the child's `subagent/descriptor` must carry the
  # resolved explore route (data.agentProvider/agentModel), both agents'
  # `request/header` must carry their executed routes (data.header.config),
  # the two routes must differ, and each dispatch must reach its adapter.
  # The --expect unlogged mode proves the verdict logic honestly falls back
  # to 'self-listener-needed' when route fields are absent. A live model
  # session closes the loop in T20.
  node "$REPO_ROOT/scripts/prove-route-logging.mjs" "$DSH_NM_UNION" \
    || fail "[$label] route-logging proof failed (T15 real-path observation)"
  node "$REPO_ROOT/scripts/prove-route-logging.mjs" "$DSH_NM_UNION" --expect unlogged \
    || fail "[$label] route-logging verdict logic failed its fabricated-log QA (T15)"

  # T16 (FR-6, P-3): the Hard Blocks injection listener's registration is
  # observable at boot. Wording pinned to the plugin's marker; it must stay
  # free of error/fatal/failed vocabulary so cold-start's negative greps
  # remain clean on the happy path.
  grep -q "\[omo-agents\] hard-blocks injection listener registered on agent/pre-step" "$boot_log" \
    || fail "[$label] hard-blocks injection registration marker missing from boot log"
  if grep -q "\[omo-agents\] hard-blocks injection FAILED" "$boot_log"; then
    fail "[$label] hard-blocks injection registration threw — see FAILED line above"
  fi

  # T10 (FR-4) → P2-T16(A) → P2-T20(a): every roster delegation persona
  # assembles at apply() time under the real boot environment (the P-9
  # resolution proof for the new markdown files). The explore line stays a
  # byte-identical pinned assertion (the pre-P2-T16 T10 marker); the P2-T20
  # block below generalizes it to the full roster: exactly ONE
  # `omo-<id> persona assembled: 1 section, ` line per DELEGATION_ENTRIES row,
  # with the id list resolved from src/roster.ts at probe start (never
  # restated), and no `persona FAILED` line for any of them.
  grep -q "\[omo-agents\] omo-explore persona assembled: 1 section, " "$boot_log" \
    || fail "[$label] omo-explore persona assembly marker missing from boot log"
  if grep -q "\[omo-agents\] omo-explore persona FAILED" "$boot_log"; then
    fail "[$label] omo-explore persona assembly threw at boot — see FAILED line above"
  fi
  local persona_marker_lines
  persona_marker_lines="$(grep -c '\[omo-agents\] omo-.* persona assembled: 1 section, ' "$boot_log" || true)"
  [[ "$persona_marker_lines" == "$DELEGATION_COUNT" ]] \
    || fail "[$label] expected $DELEGATION_COUNT 'persona assembled' lines (one per roster delegation row), found $persona_marker_lines"
  local persona_id
  while IFS= read -r persona_id; do
    [[ -n "$persona_id" ]] || continue
    grep -q "\[omo-agents\] omo-$persona_id persona assembled: 1 section, " "$boot_log" \
      || fail "[$label] 'persona assembled' marker missing for roster delegation row '$persona_id'"
    if grep -q "\[omo-agents\] omo-$persona_id persona FAILED" "$boot_log"; then
      fail "[$label] persona assembly threw for roster delegation row '$persona_id' — see FAILED line above"
    fi
  done <<< "$DELEGATION_IDS"

  # T14 (FR-5, P-2; AC-5 config half) → P2-T16(B) → P2-T20(b): the plugin
  # resolved and validated ALL 11 roster routes at apply() time and logged
  # exactly ONE summary line carrying every `id=provider/model` field in roster
  # order. The `sisyphus=… explore=…` prefix assertion stays (the T14 anchor);
  # the P2-T20 assertion below additionally requires the WHOLE line — all
  # $ROSTER_SIZE fields, joined from the roster-derived $ROUTE_FIELDS in
  # emission (roster) order — and exactly ONE such line (no duplicate marker).
  grep -q "\[omo-agents\] model routes: sisyphus=$SISYPHUS_PROVIDER/$SISYPHUS_MODEL explore=$EXPLORE_PROVIDER/$EXPLORE_MODEL" "$boot_log" \
    || fail "[$label] model-routes marker missing or mismatched (plugin resolved different routes than the probe?)"
  if grep -q "\[omo-agents\] model routes FAILED" "$boot_log"; then
    fail "[$label] model-routes resolution threw at boot — see FAILED line above"
  fi
  local route_summary_lines route_summary_line
  route_summary_lines="$(grep -c '\[omo-agents\] model routes: ' "$boot_log" || true)"
  [[ "$route_summary_lines" == "1" ]] \
    || fail "[$label] expected exactly ONE route summary line, found $route_summary_lines"
  route_summary_line="$(grep -m1 '\[omo-agents\] model routes: ' "$boot_log")"
  if [[ "$route_summary_line" == "$EXPECTED_ROUTE_SUMMARY" ]]; then
    echo "concerto-probe: [$label] P2-T20(b) 11-route summary line: $route_summary_line"
  else
    fail "[$label] route summary line does not carry all $ROSTER_SIZE roster fields in order (want: $EXPECTED_ROUTE_SUMMARY; got: $route_summary_line)"
  fi

  # P2-T16(C) → P2-T20(c): the three non-blocking warning lines must NOT fire
  # in this sandbox. Rules 1/2 (`route warning [<code>]`) are silent because the
  # default three-seat distribution is neither all-identical nor
  # all-delegation-same-seat; rule 3 (`route provider not registered`) is silent
  # because every distinct route provider registers here — the two default seats
  # come from the llm-deepseek entry config + the llm-pi-ai settings seed above,
  # while any further provider a roster/env change adds would have to be seeded
  # too (the activity check below is the positive counterpart and names the
  # provider set it verified). The ONE summary line asserted just above is the
  # non-vacuity guard: the same `routes !== undefined` path schedules both the
  # summary and the provider check, so these absences cannot come from a boot
  # that never evaluated the routes. `route provider check FAILED` is the
  # unexpected-error form and must also be absent.
  if grep -q '\[omo-agents\] route warning \[' "$boot_log"; then
    fail "[$label] a non-blocking route warning fired: $(grep -m1 '\[omo-agents\] route warning \[' "$boot_log") — the default three-seat distribution must be silent"
  fi
  if grep -q '\[omo-agents\] route provider not registered: ' "$boot_log"; then
    fail "[$label] 'route provider not registered' fired although all $DISTINCT_PROVIDER_COUNT route providers are registered in this sandbox: $(grep -m1 '\[omo-agents\] route provider not registered: ' "$boot_log")"
  fi
  if grep -q '\[omo-agents\] route provider check FAILED' "$boot_log"; then
    fail "[$label] route provider check FAILED — see line above"
  fi

  # T14 runtime half → P2-T20(d): EVERY distinct provider the 11 roster routes
  # use holds a REGISTERED route at runtime — the sisyphus seat's provider from
  # the llm-deepseek adapter's entry config, the explore seat's provider from
  # the llm-pi-ai adapter via the settings profile seeded above. The provider
  # set is resolved from src/model-routes.ts ($ROUTE_PROVIDERS, roster order),
  # so a future third seat is covered automatically. Registration is the gate;
  # no live model call is made (no API keys in the sandbox). The explicit
  # sisyphus/explore greps below stay as the named T14 evidence.
  grep -q "\"provider\":\"$SISYPHUS_PROVIDER\"[^}]*\"active\":true" "$llm_resp" \
    || fail "[$label] sisyphus provider '$SISYPHUS_PROVIDER' not ACTIVE in the provider directory (llm-deepseek adapter registration broken?)"
  grep -q "\"provider\":\"$EXPLORE_PROVIDER\"[^}]*\"active\":true" "$llm_resp" \
    || fail "[$label] explore provider '$EXPLORE_PROVIDER' not ACTIVE in the provider directory (llm-pi-ai settings-profile registration broken?)"
  local route_provider
  while IFS= read -r route_provider; do
    [[ -n "$route_provider" ]] || continue
    grep -q "\"provider\":\"$route_provider\"[^}]*\"active\":true" "$llm_resp" \
      || fail "[$label] route provider '$route_provider' (used by the $ROSTER_SIZE roster routes) is NOT active in the provider directory"
    echo "concerto-probe: [$label] P2-T20(d) route provider active: $route_provider"
  done <<< "$ROUTE_PROVIDERS"
}

# Boot 1: fresh sandbox — the preset is materialized.
boot_once fresh materialized
# Boot 2: SAME sandbox $DSH_HOME — re-registration must be a content-identical
# no-op and the roster must stay correct (idempotence proof).
boot_once again unchanged

echo "concerto-probe: PASS (dsh $(dsh --version)): 协奏模式 / Concerto Mode registered at roster level (trust:user, name from our preset.yml) via apply-time authoring; observable over the web roster RPC (transport-adaptive T9: /api/agentPreset.list on rc.6, /api/agentPresets/list through the token-authenticated Typert Remote gateway on 0.1.2); persona = assembled omo-sisyphus system prompt (sentinel rendered, 3 section markers in the materialized composition); omo-hooks mounted as the second insert row with the FULL 14-hook port roster registered at boot (source-derived summary marker + one registered marker per manifest row, 14 lines, with the src/hooks file set proven equal to the manifest id set, and NO hook FAILED / manifest-validation-FAILED line — both boots); omo-commands mounted as the third insert row with its source-derived summary marker ($EXPECTED_COMMANDS_SUMMARY, $EXPECTED_COMMANDS_REGISTERED_COUNT registered command lines at P4-T3 = 0 since all six rows are pending) and NO command FAILED / manifest-validation-FAILED line (both boots); omo-commands skills mounted as the third insert row's second mechanism with its source-derived summary marker ($EXPECTED_SKILLS_SUMMARY) and NO `skill … FAILED` line (both boots); hard-blocks injection listener registration observable at boot (agent/pre-step marker, both boots); omo-explore persona assembled at boot (1 section marker, both boots; subagent artifact — T11 binds it as the tool-subagent persona config); T14 dual routes resolved (sisyphus=$SISYPHUS_PROVIDER/$SISYPHUS_MODEL explore=$EXPLORE_PROVIDER/$EXPLORE_MODEL) with BOTH providers active in the provider directory (transport-adaptive T9: /api/llm.providers on rc.6, llm/listProviders joined with llm/listConfigurableProviders on 0.1.2); T11 explore delegation tool bound (toolName=explore, sentinels rendered, persona+route in the materialized row, pre-declared toolFilter/maxDepth) and the row VALIDATED against the installed dsh-tool-subagent Config (eager run of the schema dsh applies lazily at session composition); T12+F1 toolFilter deny=roster-computed 12-name list (write/edit + all 10 delegation toolNames, roster order; the schema gate and the materialized-composition grep both derive it from src/roster.ts, P2-T15 shape) PROVEN enforced via the real child-composition path (applyChildComposition → tools.restrict → child scope view excludes write/edit and every delegation tool, execution UNKNOWN_TOOL, read/grep/glob/shell retained, parent untouched); T13 maxDepth=$EXPLORE_MAXDEPTH (roster-derived; target-row semantics D-2026-09-13-01) PROVEN enforced via the real delegation start path (depth-1 parent's call PASSES the gate — the atlas(1) → worker(2) re-delegation path; depth-2 parent rejected on BOTH foreground and continuable starts with errored tool result "Error: subagent depth 3 exceeds maxDepth 2", tool stays visible at the cap, depth-0 control passes); P2-T20 roster boot contract (all $DELEGATION_COUNT 'persona assembled' lines from src/roster.ts; the ONE $ROSTER_SIZE-field route summary line in roster order; the three non-blocking warning forms ABSENT in the seeded sandbox with the summary line as non-vacuity guard; all $DISTINCT_PROVIDER_COUNT distinct route providers active:true over the transport-adaptive provider RPC; per-row materialized toolName/deny/allow/maxDepth greps generalized from the P2-T15 explore pins, uniform roster maxDepth=$UNIFORM_MAXDEPTH); idempotent re-boot confirmed; omo-hooks plugin mounted (second cordis.yml insert row) with its manifest summary boot marker AND its per-hook registered markers matching the plugin's own manifest.ts + boot-markers.ts + src/hooks file set (P3-T3/P3-T5); omo-commands plugin mounted (third cordis.yml insert row, P4-T3) with its summary boot marker and per-command registered markers matching the plugin's own manifest.ts + boot-markers.ts + COMMAND_REGISTRARS"
exit 0
