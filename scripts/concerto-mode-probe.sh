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
#                 roster line listing `concerto:broken=absent` (P4.5-T6: the
#                 row vocabulary is the registry's own `broken` field, printed
#                 by the shipped formatConcertoRosterLine; the pre-T6
#                 `concerto:user` form is DEAD — 0.2.x has no `trust` key on a
#                 roster row, so it printed `concerto:?`, a placeholder that
#                 asserted nothing), and no FAILED line.
#   P3-T3 hooks — the SECOND cordis.yml insert row's mount observable:
#                 `[omo-hooks] loaded: manifest N entries (…)`, plus one
#                 `hook <id> registered on <event>` line for EVERY implemented
#                 hook — the full $EXPECTED_HOOK_COUNT-line set. N is never
#                 written here: P4-T16 再审 ③, this block said "manifest 14
#                 entries", "the full 14-line set" and "The roster is 14 (not 15)
#                 since P3-T5 removed H-01" — all three were true once and are
#                 false now (the roster is 15; H-01's removal stopped being the
#                 reason anything). A header comment cannot be derived at runtime,
#                 so it names the DERIVED VARIABLE instead of the number, and the
#                 number is printed by the PASS line. BOTH expectations are DERIVED
#                 below from the plugin's own modules (manifest.ts +
#                 boot-markers.ts + the src/hooks/<id>.ts file set), never
#                 retyped literals, so the probe asserts the booted plugin used
#                 the same roster, formatter and registry as this source tree —
#                 a drift in any of them fails here. The id set comes from the
#                 hook FILES, not from HOOK_REGISTRARS: a registry
#                 import-drifting back to `{}` would otherwise shrink the
#                 expectation instead of failing. P3-T19 tightened the derivation
#                 from "at least one implementation file" to "the src/hooks file
#                 set EQUALS the manifest id set", and the boot block below
#                 asserts each registered line plus the ABSENCE of any
#                 `hook … FAILED` / `manifest validation FAILED` line.
#   P4-T3 commands — the THIRD cordis.yml insert row's mount observable:
#                 the summary line is $EXPECTED_COMMANDS_SUMMARY, DERIVED below
#                 from the plugin's own manifest.ts + boot-markers.ts + index.ts.
#                 P4-T16 再审 ③: this block still quoted the P4-T3-era value
#                 "manifest 6 entries (pending=6, ported=0) — 0/6 commands
#                 registered" — 6 was right, the status split has not been since
#                 T6 (5 ported, 1 pending), and a header comment cannot be derived
#                 at runtime. It names the variable; the PASS line prints it.
#                 like the hooks half (registered lines = ported ids ∩
#                 COMMAND_REGISTRARS keys; a ported row with no registrar fails
#                 the derivation, so an emptied registry cannot shrink the
#                 expectation to zero and leave the probe green). At P4-T3 every
#                 row was 'pending' and the registered set was empty. P4-T16:
#                 this comment still said "all six rows are 'pending'" and "zero
#                 registered lines" — true at P4-T3, false from T6 on, and wrong
#                 about the *then-present* (as of P4-T16: 5 of 6 were ported, so 5
#                 registered lines). The derivation never broke; the PROSE went
#                 stale, which is the failure c21 now guards for the notices
#                 counts. The live numbers are derived below and printed in the
#                 PASS line. Both FAILED forms
#                 (`command … FAILED`, `manifest validation FAILED`) are
#                 asserted ABSENT.
#   P4-T5 skills — the skill DELIVERY mechanism's summary marker
#                 `[omo-commands] skills: 19/19 registered (runtime, vendor
#                 path)`, derived by running the plugin's own scan over the live
#                 vendor tree, plus `skill <name> FAILED` asserted ABSENT.
#   P5-T3 team  — the FOURTH cordis.yml insert row's mount observable: the
#                 summary line is $EXPECTED_TEAM_SUMMARY, DERIVED below from the
#                 plugin's own manifest.ts + boot-markers.ts + index.ts (same
#                 three-module derivation as the commands half; the summary's
#                 manifest half comes from manifest.ts's own
#                 formatLoadedSummaryLine, the registration half from
#                 boot-markers.ts). No census number is written in this header —
#                 the same P4-T16 再审 ③ rule the hooks and commands blocks above
#                 learned it by: the header names the DERIVED VARIABLE and the
#                 PASS line prints the value. At P5-T3 the registry is the
#                 deliberate empty-table skeleton, so the registered set is empty
#                 and the derivation is vacuously correct (proven by
#                 tests/omo-team/boot-markers.test.ts); T5+ fills it without a
#                 probe edit. Both FAILED forms (`team surface … FAILED`,
#                 `manifest validation FAILED`) are asserted ABSENT.
#   P5-T10 team — the team face TWO-WAY, asserted by ONE shared script
#                 (scripts/assert-team-probe-face.mjs — assert-concerto-read-
#                 face.mjs precedent: live boots and defect legs run the SAME
#                 code; its --self-test, 17 named legs, runs BEFORE any spawn,
#                 drive.mjs runAnalysisSelfTest precedent). PRESENCE (both
#                 normal boots): the canonical trio registered lines BY NAME
#                 (team_create / team_send_message / team_status — the named
#                 half ON TOP of the derived loop above) + the state machine's
#                 OWN boot answer line `[omo-team] boot resume: …` — shape
#                 DERIVED from the plugin's shipped formatTeamBootResumeLine,
#                 logged exactly once and only after rebuildIndexes()+resume()
#                 resolved (the honest probe anchor: no model key in this
#                 sandbox, so NO faked session/team_status RPC — the machine's
#                 own durable answer is the evidence) + both loud forms
#                 (`boot resume FAILED`, per-row FAILED) ABSENT. ABSENCE (the
#                 `noteam` boot: a profile with only the other THREE plugins):
#                 the host's NAMED degradation pair — `dsh: warning: 1 entry did
#                 not activate` + `omo-team (@oh-my-opendsh/omo-team): failed
#                 to import`, measured verbatim on the pinned dsh 0.2.0-rc.2 —
#                 present, and ZERO `[omo-team]` markers of any shape (loaded /
#                 registered / boot resume): canary discipline, an absent plugin
#                 is loud and names itself, never a silent half-mount.
#   P6-T5 lsp   — the FIFTH cordis.yml insert row's mount observable. omo-lsp
#                 mounts the dsh-BUNDLED @deepseek-ai/dsh-mcp-client (no install
#                 step, see the Stage 0 note below), and that row is
#                 `failOnStartupError: false` — a dead LSP child therefore CANNOT
#                 fail the boot, so no plugin-side marker and no exit code can
#                 prove it mounted. The one loud signal on that channel is the
#                 stdio child's own stderr announcement, which the client
#                 inherits into $boot_log (@modelcontextprotocol/client/dist/
#                 stdio.mjs:76 `stderr ?? "inherit"`). The expectation here is
#                 $EXPECTED_LSP_STARTING_MARKER, DERIVED below with awk straight
#                 out of the vendored entry that writes it
#                 (patches/omo-dsh/vendor/lsp-core/src/cli.ts) — the same four
#                 steps tests/e2e/fixtures/lsp-double-constants.mjs's
#                 deriveLspMcpStartingMarker performs, run by an independent
#                 reader over one shipped literal, and printed by the PASS line
#                 so the cross-check is auditable rather than asserted. A
#                 reworded announcement moves this expectation with it; a deleted
#                 one makes the DERIVATION fail the probe before any boot,
#                 instead of grepping for an empty string and calling that green.
#                 scripts/cold-start.sh:215-223 greps the same line from a
#                 hand-copied PREFIX — this probe is the full-value half of that
#                 pair, which is what makes the constants module's claim of two
#                 independent readers actually true.
#                 SCOPE HONESTY: this asserts the row MOUNTED and the child
#                 SPOKE, not any LSP round-trip — the protocol legs (initialize /
#                 definition / diagnostics / -32601 / -32700 / die-exit-7) live
#                 in tests/omo-lsp/lsp-double-protocol.test.ts against the
#                 hermetic double, and the engine-level round-trip in
#                 tests/e2e/drive.mjs's two lsp-* scenarios.
#                 The PRESENCE leg runs in-probe against ALL THREE boots —
#                 boot_once 'fresh', boot_once 'again', and boot_absent_once
#                 'noteam' (ARBITRATION-r1 B-MINOR-3: it used to cover two, and
#                 the third boot is the one that proves the bundled fifth row
#                 does not ride on a repo-published sibling). Its LOUD ABSENCE
#                 form is the `fail` text at each site, naming the fifth row,
#                 the package and the derived marker; the mutation self-proof that
#                 the grep is not vacuous is an OUT-OF-BAND archive,
#                 .omo/evidence/p6t5/probe-grep-mutation.log — a marker edited
#                 out of a COPY of cli.ts makes the awk derivation exit 3 before
#                 any boot. What is NOT in this task's scope, stated plainly: a
#                 boot where the LSP child is genuinely absent cannot be produced
#                 in-probe without modifying the vendored entry or the bundle, so
#                 this probe has no in-probe NEGATIVE anchor for the lsp row —
#                 the canary shape lives in the drive.mjs lsp-missing-server
#                 scenario, on a different channel by necessity.
#   P6-T9 FOUR  — the four editing/lookup faces this phase ports, and which
#   LEGS      — assertion owns which face. Stated per leg because three of the
#                 four are covered by DERIVED rosters and two had NO assertion at
#                 all before this task; a leg nobody can point at is a leg nobody
#                 can say is green.
#                 E — the EDIT face, fork (E-A): the natively-adopted
#                 `dsh-tool-fs` row (.omo/evidence/p6t1/FORKS.md §1.7, stamped on
#                 measured A/B data — silent-wrong-write 0/0 on both arms, the
#                 native face covering all six decidable failure classes). It has
#                 NO boot marker: dsh-tool-fs prints nothing when it mounts, so no
#                 boot log can prove it is there. Covered by the COMPOSITION-FACE
#                 block below (`--dump-config`, the same two patches the boot uses),
#                 scoped to `preset-standard`'s live plugin list.
#                 L — the LSP face, P6-T5: `omo-lsp`, the FIFTH cordis.yml insert
#                 row, proven at boot in ALL THREE boots by the awk-derived
#                 $EXPECTED_LSP_STARTING_MARKER read out of the vendored stdio
#                 entry. See the P6-T5 entry above for its scope-honesty note.
#                 G — the ast-grep face, P6-T6/T9: THREE sub-faces, THREE owners,
#                 and one of them is NOT this probe.
#                   (G1) hook REGISTRATION — covered here, by derivation:
#                     $EXPECTED_HOOK_REGISTERED_LINES is built from HOOK_MANIFEST ×
#                     formatHookRegisteredLine, and the manifest carries
#                     `ast-grep-sg-provision` (event `session/created`, status
#                     ported), so its registered line is one of the
#                     $EXPECTED_HOOK_COUNT lines grepped on every boot. Two loss
#                     shapes, two different outcomes, stated separately because the
#                     first version of this note claimed only the first: (i) the
#                     manifest row is dropped while `src/hooks/<id>.ts` is still
#                     there — the derivation fails, since it asserts the file set
#                     EQUALS the manifest id set; (ii) the row AND the implementation
#                     file are dropped together — the set equality still holds
#                     (15↔15 would stay green) and the probe stays green, because
#                     nothing in it names the hook; the red lives in c29's named
#                     arm, which pins the manifest row by id.
#                   (G2) the ast-grep SKILL — COUNT-level on the probe side, and
#                     that is all it can be: $EXPECTED_SKILLS_SUMMARY comes from
#                     scanVendorSkills over the vendored tree (measured 19 entries,
#                     zero reader failures) and boot-markers emits only the summary
#                     plus per-skill FAILED lines — there is NO per-skill
#                     "registered" line to grep a name out of. So `ast-grep` is
#                     inside the 19 counted, not named here. The NAME-level owner
#                     is c19 (manifest skill list == vendor directory == 19, with
#                     ast-grep in the list). Copying the skill list into this probe
#                     to manufacture a name would be a second transcription — the
#                     drift c21 exists to catch.
#                   (G3) the PROVISION path (fetching/placing the `sg` binary) is
#                     NOT asserted here and must never be written as if it were:
#                     the listener fires on `session/created`. Scope stated the way
#                     the evidence reads, not looser than it is — the session
#                     CREATE CALL SITES, meaning `session\.create` / `session/create`
#                     with the EVENT NAME `session/created` excluded, are exactly
#                     two: the `session/create` rpc helper in tests/e2e/drive.mjs
#                     and the same-named helper in scripts/smoke-real.mjs (each is
#                     the `return rpc(boot, 'session/create', { args: { request } })`
#                     line behind its transport-adaptive wrapper; cited by construct
#                     because a line number here rots on the next edit to a 30k-line
#                     file, and has). (The bare string
#                     `session/created` matches far more — event names in the
#                     manifest, gate 6's own c29 assertion, docs and comments — so
#                     "only two hits repo-wide" was never a true statement about
#                     the raw pattern; it is true about the call sites.)
#                     scripts/prove-route-logging.mjs builds a session in-process
#                     through agentLoop.create but does not mount omo-hooks, so it
#                     does not touch this seam either (registered in an earlier
#                     round). Neither this probe nor cold-start.sh creates a
#                     session, so provision cannot fire here; asserting it from a
#                     probe that cannot trigger it would be a false claim of
#                     coverage. Its real owners are the supply-layer unit suites
#                     and the P6-T7 canary e2e, where a provision failure is loud.
#                 W — the WEB face, fork W: `dsh-tool-web` plus the `web` row's
#                 `searchProvider`/`fetchProvider` selection. Like E it has no boot
#                 marker, so the same composition-face block covers it, every
#                 expected value derived from the installed base bundle.
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
#                 concerto alongside the official four (rc.6
#                 standard/code/minimal/cordis; 0.1.2+
#                 standard/ptc/minimal/cordis), with the name from OUR
#                 preset.yml (协奏 / Concerto). On the 0.2.x leg the row's
#                 level field is `isDefault:false` — the roster RPC answers with
#                 an ENVELOPE {presets:[…]} from remoteExportList(), and
#                 `trust` is not a key of a 0.2.x row at all; the 0.1.5 leg
#                 keeps its genuine trust:"user" assertion. The shape actually
#                 seen is PRINTED by the probe, so this claim is auditable and
#                 not just asserted.
#   T14 routes   — the `[omo-agents] model routes: sisyphus=… explore=…` boot
#                 marker (resolved by the plugin from src/model-routes.ts, the
#                 single config source of truth), and the provider directory
#                 (rc.6 POST /api/llm.providers; 0.1.2 llm/listProviders joined
#                 with llm/listConfigurableProviders by the Web UI's own rule)
#                 showing BOTH route providers `active:true` — the sisyphus
#                 seat's from the llm-deepseek adapter (entry config), the
#                 explore seat's from the llm-pi-ai adapter seeded through the
#                 probe's SECOND --patch overlay (present at compose/apply()
#                 time; NOT settings.yaml — 0.2.x removed that surface and
#                 its late importer loses the settled-provider check;
#                 registration is keyless — no API keys exist in the sandbox,
#                 and none are needed for this gate).
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
#                 e.g. the pi-ai seed row (the probe's second --patch overlay;
#                 the settings section on pre-0.2.x runtimes) fails here at
#                 boot instead of at that child's first delegation. The per-row materialized
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

# Stage 0: fresh profile + install the FOUR @oh-my-opendsh plugins into it (one
# per @oh-my-opendsh cordis.yml
# insert row — P3-T3 mounted omo-hooks as the second row, P4-T3 mounts
# omo-commands as the third, P5-T3 mounts omo-team as the fourth, so a profile
# carrying fewer could not compose the overlay; the P6-T4 fifth row omo-lsp
# mounts the dsh-bundled @deepseek-ai/dsh-mcp-client and needs no install).
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
echo "concerto-probe: installing @oh-my-opendsh/omo-team into sandbox profile '$PROFILE'"
timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile "$PROFILE" add \
  "$REPO_ROOT/patches/omo-dsh/omo-team" >>"$ADD_LOG" 2>&1 \
  || fail "dsh plugin add (omo-team) failed (see $ADD_LOG)"

# T14 (FR-5, P-2; AC-5 config half): resolve the two route pairs from the
# plugin's own config module — the single source of truth (Node 24
# type-stripping runs the .ts directly, P-8.6) — then pre-seed the sandbox
# with the llm-pi-ai provider profile that registers the explore seat's
# route. On 0.2.x that seed is a SECOND --patch overlay composed into the
# entry list before mount (see the seeding block below); settings.yaml is no
# longer a config surface there, and writing only settings.yaml is the exact
# regression this block guards. Adapter REGISTRATION is the gate (no API keys
# exist in the sandbox): credentials resolve per request, so a route registers
# keylessly and a missing key would only fail a REQUEST with MISSING_CREDENTIAL.
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
      // TWO independent emissions, not if/else-if: a row that carries BOTH a
      // deny and an allow list used to report only its deny, and the consumer
      // below then read the missing allow as 'the roster declares none' and
      // asserted its ABSENCE on a row that legitimately has one (review A
      // MINOR-C). Today's roster happens to have no such row, which is exactly
      // the kind of luck a gate must not depend on.
      if (deny !== undefined) console.log('DELEGATION_DENY=' + entry.id + '=' + JSON.stringify(deny))
      if (allow !== undefined) console.log('DELEGATION_ALLOW_PLAIN=' + entry.id + '=' + allow.join(', '))
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

# P4.5-T6: the SAME roster-derived expectations, serialized once as JSON so the
# `agentPresets/read` face can compare PARSED VALUES element by element instead
# of grepping a rendered line. The values come from the very same $DELEGATION_*
# lists the materialized-face greps use — one source, two faces — so a roster
# edit moves both assertions together and neither can go stale alone.
ROSTER_EXPECTATIONS_JSON="$SANDBOX/roster-expectations.json"
node -e '
  const fs = require("node:fs")
  const [outFile, idsBlob, denyBlob, allowBlob, depthBlob, uniform] = process.argv.slice(1)
  const lines = (blob) => String(blob).split("\n").filter((l) => l.length > 0)
  const byId = (blob) => {
    const map = new Map()
    for (const line of lines(blob)) {
      const eq = line.indexOf("=")
      if (eq < 0) continue
      map.set(line.slice(0, eq), line.slice(eq + 1))
    }
    return map
  }
  const denies = byId(denyBlob)
  const allows = byId(allowBlob)
  const depths = byId(depthBlob)
  const rows = lines(idsBlob).map((id) => ({
    id,
    deny: denies.has(id) ? JSON.parse(denies.get(id)) : null,
    allow: allows.has(id) ? allows.get(id).split(", ").filter((n) => n.length > 0) : null,
    maxDepth: Number(depths.get(id)),
  }))
  if (rows.length === 0) { console.error("empty roster expectation set — the read-face comparison would be vacuous"); process.exit(1) }
  // `sandboxEdits` is REQUIRED by the validator contract (WP2 MAJOR-1). This
  // probe declares [] because it edits NOTHING on the composition face it
  // asserts: it reads $materialized with grep/awk/node and never writes it —
  // scripts/verify-concerto-static.mjs c24 asserts exactly that, so this empty
  // list is a checked fact here, not a claim of convenience.
  fs.writeFileSync(outFile, JSON.stringify({ rows, uniformMaxDepth: Number(uniform), sandboxEdits: [] }, null, 2))
' "$ROSTER_EXPECTATIONS_JSON" "$DELEGATION_IDS" "$DELEGATION_DENIES" "$DELEGATION_ALLOWS" "$DELEGATION_MAXDEPTHS" "$UNIFORM_MAXDEPTH" \
  || fail "could not serialize the roster-derived expectations for the read face"
[[ -s "$ROSTER_EXPECTATIONS_JSON" ]] \
  || fail "the roster expectation file is empty: $ROSTER_EXPECTATIONS_JSON"

# OUR preset.yml display name, read from the template directory the plugin
# registers from — the single source behind every `协奏 / Concerto` assertion.
# Read once, then compared against the roster RPC AND the read-document `name`,
# so neither face can silently disagree with the file we authored.
PRESET_YML_NAME="$(sed -n 's/^name: //p' "$REPO_ROOT/patches/omo-dsh/omo-agents/concerto/preset.yml" | head -1)"
[[ -n "$PRESET_YML_NAME" ]] \
  || fail "could not read OUR display name from patches/omo-dsh/omo-agents/concerto/preset.yml"
echo "concerto-probe: preset.yml display name: $PRESET_YML_NAME"

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
# group is COMPLETE, so this derivation yields one registered marker per manifest
# row, and P3-T19 tightened it from "at least one file" to "the src/hooks file set
# EQUALS the manifest id set": a dropped or renamed implementation file is now a
# probe FAILURE instead of a silently smaller expectation.
#
# P4-T16: this comment said "the full 14 registered markers" and "no hand-maintained
# list of 14 lines" — the roster is 15 rows now (keyword-detector landed at T12), so
# the literal was wrong twice: wrong about today's count, and it bragged about a
# list that did not exist in the first place. The count is never written here; it
# is derived below and printed in the PASS line.
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

# P4-T16: the PASS line used to print the literal "14" here. The count is
# derived from the marker list itself, so the prose cannot say 14 while the
# roster is 15 rows.
EXPECTED_HOOK_COUNT="$(printf '%s\n' "$EXPECTED_HOOK_REGISTERED_LINES" | grep -c . || true)"

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

# P5-T3: the omo-team mount marker's expected text, derived from the plugin's
# OWN manifest.ts + boot-markers.ts + index.ts (Node 24 type-stripping, the same
# three-module derivation as the commands half above). The node step prints the
# ONE summary line first and then every expected `registered` line, so a drift in
# any of those three modules — or a booted plugin whose registry disagrees with
# this tree — fails the greps in the boot block below.
#
# WHY THE REGISTRY IS PART OF THE DERIVATION (and not the circular version): a
# manifest row registers only when it is 'ported' AND has a registrar, so the
# expectation is "ported ids ∩ TEAM_REGISTRARS keys". Deriving from the registry
# alone would shrink to zero lines the moment TEAM_REGISTRARS lost an entry and
# leave the probe green — the gap both earlier halves document. So the node step
# FAILS LOUDLY when a ported row has no registrar, and the shell then
# cross-checks the number of derived `registered` lines against the ported count
# printed in the summary line itself (both derived, neither hard-coded).
# At P5-T3 the registry is the deliberate empty-table skeleton AND no row is
# 'ported' yet, so the derivation yields the summary line and ZERO registered
# lines — vacuously correct, and the derivation is already proven by
# tests/omo-team/boot-markers.test.ts. T5+ fills it without a probe edit.
EXPECTED_TEAM_MARKERS="$(node --input-type=module -e "
  Promise.all([
    import('./patches/omo-dsh/omo-team/src/manifest.ts'),
    import('./patches/omo-dsh/omo-team/src/boot-markers.ts'),
    import('./patches/omo-dsh/omo-team/src/index.ts'),
  ]).then(([manifest, markers, plugin]) => {
    const ported = manifest.TEAM_MANIFEST.filter((entry) => entry.status === 'ported')
    const missing = ported.filter((entry) => !(entry.id in plugin.TEAM_REGISTRARS))
    if (missing.length > 0) {
      throw new Error('a ported manifest row has no registrar (TEAM_REGISTRARS lost this entry — import drift?): '
        + missing.map((entry) => entry.id).join(', '))
    }
    const registeredRows = ported.filter((entry) => entry.id in plugin.TEAM_REGISTRARS)
    console.log(markers.formatLoadedSummaryLine(manifest.TEAM_MANIFEST, registeredRows))
    for (const entry of registeredRows) {
      console.log(markers.formatTeamSurfaceRegisteredLine(entry.id))
    }
  })
")" || fail "omo-team manifest/boot-markers/index module resolution failed: $EXPECTED_TEAM_MARKERS"
EXPECTED_TEAM_SUMMARY="$(printf '%s\n' "$EXPECTED_TEAM_MARKERS" | head -n 1)"
EXPECTED_TEAM_REGISTERED_LINES="$(printf '%s\n' "$EXPECTED_TEAM_MARKERS" | tail -n +2)"
[[ -n "$EXPECTED_TEAM_SUMMARY" ]] \
  || fail "could not derive the omo-team summary marker from manifest.ts + boot-markers.ts"
# Cross-check (the commands half's pair, same shape): the derived `registered`
# line count must equal the ported count the summary line reports — the two
# derivations of "which rows are ported" must not disagree. At P5-T3 it reads
# 0 == 0. (The sed anchor drops the commands block's trailing `)`: in the team
# line `ported=` is followed by `, recorded=`, not by the closing paren.)
EXPECTED_TEAM_PORTED="$(printf '%s' "$EXPECTED_TEAM_SUMMARY" | sed -n 's/.*ported=\([0-9]\+\).*/\1/p')"
EXPECTED_TEAM_REGISTERED_COUNT="$(printf '%s\n' "$EXPECTED_TEAM_REGISTERED_LINES" | grep -c . || true)"
[[ "$EXPECTED_TEAM_PORTED" == "$EXPECTED_TEAM_REGISTERED_COUNT" ]] \
  || fail "omo-team derivation is inconsistent: summary says ported=$EXPECTED_TEAM_PORTED but $EXPECTED_TEAM_REGISTERED_COUNT registered lines were derived"
echo "concerto-probe: P5-T3 team marker: $EXPECTED_TEAM_SUMMARY"
if [[ "$EXPECTED_TEAM_REGISTERED_COUNT" != "0" ]]; then
  echo "concerto-probe: P5-T3 team registered markers ($EXPECTED_TEAM_REGISTERED_COUNT):"
  printf '%s\n' "$EXPECTED_TEAM_REGISTERED_LINES" | sed 's/^/concerto-probe:   /'
fi

# P6-T5: the omo-lsp row's mount observable — the stdio LSP child's OWN boot
# announcement — derived with awk straight out of the vendored entry that writes
# it (patches/omo-dsh/vendor/lsp-core/src/cli.ts, `stderr.write(\`[lsp-mcp]
# stdio server starting pid=${…}\n\`)`).
#
# WHY A SECOND READER, AND WHY IN AWK. tests/e2e/fixtures/lsp-double-constants.
# mjs's deriveLspMcpStartingMarker is the JS reader the double and
# tests/e2e/drive.mjs share. Re-running the same expression here in a different
# language over the same shipped source is the cross-check: a reader that quietly
# matched nothing, or matched the wrong stderr.write of the three cli.ts writes,
# would have to fail in BOTH languages to go unnoticed. The PASS line prints the
# derived value, so the claim is auditable and not just asserted.
# scripts/cold-start.sh:215-223 is the third reader, from a hand-copied PREFIX;
# this is the full-value half of that pair.
#
# WHY THIS FAILS LOUDLY AND NEVER GREPS AN EMPTY STRING. The omo-lsp row is
# `failOnStartupError: false`, so a dead LSP child cannot fail the boot and
# cannot fail a marker grep it never ran: the derivation is the only gate that
# can tell "the announcement moved" from "the announcement is gone". No selector
# match (awk exit 3) or an empty derived value (awk exit 4, the mirror of the JS
# reader's `marker.length === 0` throw — defensive, the selector anchors on the
# `[lsp-mcp]` prefix so today it cannot be empty) fails the probe BEFORE any boot
# is attempted, which is also why the value is derived up here and not inline in
# the boot block.
EXPECTED_LSP_CLI_TS="$REPO_ROOT/patches/omo-dsh/vendor/lsp-core/src/cli.ts"
[[ -f "$EXPECTED_LSP_CLI_TS" ]] \
  || fail "the vendored lsp-core stdio entry is gone ($EXPECTED_LSP_CLI_TS) — nothing writes the [lsp-mcp] announcement the omo-lsp row is asserted on"
EXPECTED_LSP_STARTING_MARKER="$(awk '
{
  if (match($0, /stderr\.write\(`\[lsp-mcp\][^`]*`\)/)) {
    found = 1
    s = substr($0, RSTART, RLENGTH)
    sub(/^stderr\.write\(`/, "", s)
    sub(/`\)$/, "", s)
    sub(/\\n$/, "", s)
    p = index(s, "${")
    if (p > 0) s = substr(s, 1, p - 1)
    gsub(/^[ \t]+/, "", s)
    gsub(/[ \t]+$/, "", s)
    if (s != "") { printed = 1; print s; exit }
  }
}
END { if (printed) exit 0; if (found) exit 4; exit 3 }
' "$EXPECTED_LSP_CLI_TS")" \
  || fail "could not derive the omo-lsp stdio boot marker from $EXPECTED_LSP_CLI_TS (exit $?): no \`stderr.write(\`[lsp-mcp]…\`)\` announcement there (or it derives to empty) — the omo-lsp boot grep below would silently be grepping nothing"
[[ -n "$EXPECTED_LSP_STARTING_MARKER" ]] \
  || fail "the derived omo-lsp stdio boot marker is empty (awk printed nothing for $EXPECTED_LSP_CLI_TS) — refusing to grep the boot log for an empty string"
echo "concerto-probe: P6-T5 lsp child announcement marker (awk-derived from vendor/lsp-core/src/cli.ts): [$EXPECTED_LSP_STARTING_MARKER]"

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
# mounts DORMANT (zero routes): dsh-base/cordis.patch.yml:127-128 @ 0.2.0-rc.2
# is `- id: llm-pi-ai` + `name: '@deepseek-ai/dsh-llm-pi-ai'` with NO config.
# Pre-0.2.x the seed for its one live route was an `llm-pi-ai:` section in
# $DSH_HOME/settings.yaml. 0.2.x REMOVED settings.yaml as a config surface; its
# legacy importer moves the section only AFTER the Loader has settled every
# entry (dsh-settings/lib/index.js:339 `ctx.root.loader.await().then(() =>
# this.importLegacyDocument())`; :348 joins profile.home/settings.yaml; :351
# renames it to settings.yaml.imported; :356 per-section `await this.update(ns,
# values)`), while omo-agents' settled route-provider check reads the provider
# registry earlier. Measured on this very probe (dsh 0.2.0-rc.2, the settings-
# yaml baseline .omo/evidence/p45t8/t10a/probe-baseline.log): boot 1 logs
# `[omo-agents] route provider not registered: deepseek` (line 83) and the
# LATER /api/llm.providers RPC in the SAME boot already answers that route
# `active:true` (line 89) — the import won, just after the check settled. A
# probe that boots each label once has no second boot to recover on.
# So the seed is a SECOND --patch overlay: `--patch` is a repeatable collector
# (dsh/lib/bin.js:27-28 "Repeatable single-value collector: `--patch a.yml
# --patch b.yml`" + the `.option("--patch <path>", …, collect)` at :105), and
# overlays apply after the profile layer in argv order (dsh-app-boot
# readProfilePatches, lib/index.js:1023-1030). A patch row is composed into
# the entry list BEFORE the entry mounts — applyEntryPatches (dsh-app-boot
# lib/index.js:61-110): `- id:` matches the mounted row (:96-99), `name:` is
# an OPTIONAL mismatch guard that skips the row on drift (:100-103), and
# `config:` REPLACES the row's config key (:104-107 `target[key] = value`) —
# safe here precisely because the dormant row carries no config to clobber.
# This row shape (id + name + config, config replaced-not-merged) is the one
# the legacy importer itself writes (`- id: llm-deepseek` + `name:
# "@deepseek-ai/dsh-llm-deepseek-api-key"`), and it is proven live on
# 0.1.5-rc.1 by scripts/smoke-real.mjs's session-persistence override row
# (:520-521) — the patch engine is byte-identical across the pin
# (docs/dsh-0.1.5-rc.1-review.md:222, §P-20). If an override points the
# explore seat at a route another adapter already owns, llm-pi-ai logs the
# DUPLICATE_ADAPTER refusal and keeps serving — the runtime assertions below
# then judge the result honestly.
LLM_SEED_PATCH="$SANDBOX/llm-seed.patch.yml"
cat > "$LLM_SEED_PATCH" <<EOF
# T14 probe seed: register the explore seat's pi-ai provider route at COMPOSE
# time, so the config is present at apply() time on a 0.2.x first boot.
# Override-by-id row against the dormant llm-pi-ai entry the base bundle
# mounts; config is REPLACED, not merged (dsh-app-boot applyEntryPatches).
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
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

# P4.5-T6 `agentPresets/read` content-face validator.
#
# WHY THIS EXISTS INSTEAD OF THE LINE GREPS: `content` is NOT the file we
# wrote. readDocument() dumps the PARSED entry list
# (agent-preset-registry/src/index.ts:194-206 @ dsh-v0.2.0-rc.2 = 639ed0153972:
# readDocument() opens at :194 and the dump is the single statement at :202,
# `dump(plugins, { schema: entryListSchema, noRefs: true, lineWidth: -1 })`).
# An earlier draft of this comment cited src/index.ts:620-631 and
# "lib/index.js:627"; BOTH are wrong — that src file is 366 lines long and this
# package ships no lib/index.js at all. A range that does not exist is not a
# citation, and a filename nobody can open is worse than no filename.
# and a yaml.dump of parsed data differs from our rendered text in exactly TWO
# measured ways (both re-verified on a real 0.2.0-rc.2 boot against this
# preset, see .omo/evidence/p45t6/):
#   ① flow sequences expand to block sequences — `deny: ["write", "edit", …]`
#      comes back as `deny:` followed by one `- write` per line, so a
#      `grep -qxF "          deny: […]"` cannot match, on any spacing;
#   ② unnecessary quotes drop — `provider: "spawn"` comes back `provider: spawn`.
# An earlier note claimed a third difference, `!!js` → a two-line `__jsExpr`
# map. That was a FLAWED SIMULATION (it dumped with a JsExpr type that has no
# `represent`, while the upstream type declares one at
# vendor/include/src/index.ts:9-15). Measured against the real face, `content`
# carries `disabled: !!js process.platform === 'win32'` on ONE line, so no
# compatibility handling belongs here — and none was written.
#
# So the sequence assertions compare PARSED VALUES, element by element, against
# the roster-derived expectations the probe serialized from src/roster.ts. That
# is STRONGER than the line grep it replaces: a grep is sensitive to quoting and
# whitespace and blind to meaning, while an element-wise comparison is sensitive
# to the meaning (every name, in order, count included) and blind to nothing
# that matters. Row/indent anchors and block scalars still hold, so they stay.
# The read-face validator is a REPO SCRIPT, not a sandbox heredoc, because two
# consumers must run the SAME assertions: this probe (FACE B) and
# tests/e2e/drive.mjs (the gate-3 scenario). A heredoc copy in each would let
# the two faces drift apart — the exact failure mode this whole task is about.
ASSERT_READ_FACE_MJS="$REPO_ROOT/scripts/assert-concerto-read-face.mjs"
[[ -f "$ASSERT_READ_FACE_MJS" ]] \
  || fail "the read-face validator script is missing: $ASSERT_READ_FACE_MJS"
# P5-T10: the team-face validator — the TWO team faces (present on the normal
# boots, absent on the deliberate `noteam` boot) live in ONE script so the
# live boots and the hermetic defect legs run the SAME assertions
# (assert-concerto-read-face.mjs precedent). Its --self-test runs BEFORE any
# spawn (drive.mjs runAnalysisSelfTest precedent).
ASSERT_TEAM_PROBE_FACE_MJS="$REPO_ROOT/scripts/assert-team-probe-face.mjs"
[[ -f "$ASSERT_TEAM_PROBE_FACE_MJS" ]] \
  || fail "the team-face validator script is missing: $ASSERT_TEAM_PROBE_FACE_MJS"

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
// argv: <roster|read|providers> <port> [launch-token] [preset-id]
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
} else if (kind === 'read') {
  // P4.5-T6 single content-assertion face: `agentPresets/read` → the
  // AgentPresetDocument {agentPreset, content, name?, description?}. Both
  // runtimes serve it (0.1.5 from file discovery, 0.2.x from the registered
  // definition), so the SAME face carries the composition on either side.
  // `content` is a yaml.dump() of the PARSED entry list, not our file —
  // see the READ_* assertion blocks below for the two shapes that differ.
  // process.argv[2]=kind [3]=port [4]=token [5]=preset id — the id is the
  // FIFTH slot, not the fourth; reading argv[4] here would send the launch
  // token as the preset name and every assertion downstream would then be
  // looking at a preset that does not exist.
  const agentPreset = process.argv[5]
  if (typeof agentPreset !== 'string' || agentPreset.length === 0) {
    console.error('web-rpc: read kind requires the preset id as argv[5]')
    process.exit(1)
  }
  const value = remote
    ? await rpc('agentPresets/read', { args: { agentPreset } })
    : await rpc('agentPreset.read', { agentPreset })
  console.log(JSON.stringify({ type: 'server-response', rpcId: 'concerto-probe-read', result: { ok: true, value } }))
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

# ── P6-T9: the COMPOSITION FACE of the edit (E) and web (W) legs ──────────────
# WHY THIS BLOCK EXISTS, AND WHY IT DOES NOT BOOT. Three of the four probe legs
# prove themselves at boot: the edit face and the web face have NO boot marker at
# all — nothing in `dsh-tool-fs` or `dsh-tool-web` prints "I mounted" — so a boot
# log cannot say whether either face is in the tree the model receives. They were
# therefore ZERO-ASSERTION legs before this task: the composition either worked
# silently or degraded silently, and the probe could not tell you which. The
# composition is observable without a boot, so it is checked here the way
# scripts/cold-start.sh:89-98 checks it (Stage A: `--dump-config`, no spawn), on
# the SAME two patches the boot uses (`./cordis.yml` + $LLM_SEED_PATCH) so the
# tree inspected is the tree that would have mounted.
#
# WHAT IS DERIVED AND WHAT IS NOT. Every expected value is read out of the
# INSTALLED base bundle (`$DSH_NM/@deepseek-ai/dsh-base/cordis.patch.yml`) at run
# time: the row name behind `- id: tool-fs` (the edit face, fork E's (E-A)
# adoption — .omo/evidence/p6t1/FORKS.md §1.7 stamped it on measured A/B evidence,
# "silence-wrong-write 0/0", the native face covering all six decidable failure
# classes) and behind `- id: tool-web`, plus `searchProvider`/`fetchProvider` from
# `- id: web` (fork W). Nothing is retyped, so a provider rename in the bundle moves
# the expectation with it instead of leaving a stale literal green.
#
# THE TRAP THIS ADDRESSES, MEASURED. `grep -q dsh-tool-web` over this dump passes
# on the TOP-LEVEL `- id: tool-web` row, which reads `disabled: true` — and the
# rows a session actually gets live under a preset's `config.plugins` list. No line
# numbers are quoted for the composed tree because the dump is a throwaway file: by
# the time a reader wants to check, the bytes are gone. What was measured is the
# structure, and the structure is what is stated here.
# FIX-T9-R2-5. No positional anchor: "two lines below" was true when it was written and
# stopped being true the moment the block grew, which is the same rot as a line number
# wearing a different disguise. Reproducible by re-running the `--dump-config` further
# down in this block and reading the same row shapes. Attribution matters, so it is measured rather than
# assumed: the base SOURCE row for tool-web (`dsh-base/cordis.patch.yml:486-487`)
# carries NO `disabled:` key at all, and neither does the source `web` row
# (:472); rows that do carry it upstream include tool-ralph (:447) and skill-badge
# (:300). So the `disabled: true` on the composed top-level tool-web row is ADDED
# BY COMPOSITION — it disables the base top-level row, it is not a property of the
# fork. That is exactly why the checks below must reject a `disabled:` key
# explicitly instead of trusting presence, and why "it came from the base bundle"
# is not an excuse for a row being off.
#
# THE SECOND, SHARPER TRAP, FIXED IN FIX-T9-1. The web PROVIDER selection is NOT
# in the preset at all: measured on the composed dump, `- id: web` occurs exactly
# ONCE, at column zero, with searchProvider/fetchProvider in its own config
# block and NO `disabled:` key, and preset-standard's live list contains no `web`
# row at any indent. The first version of those two checks scanned the whole tree,
# so they were neither scoped nor disabled-aware; they now read the host's own
# top-level row. Scope is proven, not asserted: moving both values onto a preset
# row leaves a whole-tree grep finding them while the checker goes red by name.
#
# FIX-T9-R4-2. That absence is now ASSERTED, not narrated: `web-face-absent-from-preset`
# (FIX-T9-R3-1) counts `- id: web` rows at ANY indent inside preset-standard's live
# plugin list and fails BY NAME when the count is non-zero.
#
# COVERAGE BOUNDARY, recorded so this is not re-raised (FIX-T9-R3 B-MINOR-2 rejected;
# rewritten in FIX-T9-R4-1 because the first version of this note asserted something
# FALSE — see the deny-proof paragraph). The target here is `preset-standard` and that
# stands: the roster RPC answers `{"id":"standard","order":1,"isDefault":true}`, so the
# default composition a session actually gets IS this one (measured:
# .omo/evidence/p6t9/probe-run-t9r3.log:151; the same log at :159 records
# `concerto{isDefault:false,trust:ABSENT,broken:ABSENT}`).
#
# What `concerto` IS covered by, stated at the level the evidence supports:
#   - gate 6 c01-c29 (FIX-T9-R4-3; measured id set: c01-c09, c11-c29, plus
#     c10.1-c10.10 — c29 is the arm that holds ast-grep BY NAME) as the
#     static record, and this probe's own T11/T12/T13 roster sections.
#   - the T12/F1 deny-transitivity proof checks a HAND-WRITTEN STUB roster, not the
#     composition. `prove-explore-toolfilter.mjs:177-188` is a literal array of tool
#     names whose own comments say which row each came from; the script parses the
#     materialized composition but its walk() collects ONLY the
#     `tool-subagent-explore` row (:122) and validates that row's toolFilter. Deleting
#     the `- id: tool-fs` / `- id: tool-web` rows from the materialized concerto
#     composition leaves its output byte-identical and still PASS. So it is evidence
#     about deny plumbing, and it is NOT evidence that those two rows are present.
#     The first version of this note claimed exactly that, and it was wrong.
#   - E face inside concerto: witnessed INDIRECTLY and only on its READ half, by CI
#     gate 3's mock-LLM e2e, which runs under `CONCERTO_PRESET_ID = 'concerto'`
#     (tests/e2e/drive.mjs:683) and has an explore child session perform read steps.
#   - W face inside concerto: SPLIT, because its two halves have different owners, and
#     saying "no owner" about both was an overstatement (FIX-T9-R5-4). The PROVIDER
#     half HAS an owner here: the host's column-zero `web` row carries
#     searchProvider/fetchProvider, is preset-independent, and is asserted by
#     web-face-host-row-live / web-face-searchProvider / web-face-fetchProvider no
#     matter which preset this block targets. What has NO named owner is the `tool-web`
#     ROW's presence inside the concerto preset's live plugin list — `grep -c tool-web`
#     over verify-concerto-static.mjs, assert-concerto-read-face.mjs and
#     doctor-lite-core.ts returns 0/0/0 (measured). The row is there (real profile dump
#     :2546, tool-fs at :2351), so this is an unasserted fact, not a missing feature.
#
# The boundary, stated with the precondition it depends on (FIX-T9-R5-1: three earlier
# versions of this paragraph were wrong, and the last one was wrong twice over — it
# named the wrong install surface AND drew the wrong conclusion from it).
# THIS probe's dump is composed from the base bundle + the repo's ./cordis.yml + the
# seed patch, against an ISOLATED DSH_HOME (`export DSH_HOME="$SANDBOX/dsh"`), and
# it is taken BEFORE any boot. Both are cited by construct, not by number, because the
# numbers are the ones this very note keeps invalidating: the `--dump-config` of this
# block sits between the ISOLATED `export DSH_HOME` above and the first `boot_once
# materialized` call near the end of the file, and every edit to this comment shifts
# both. So it carries preset-standard / preset-ptc / preset-minimal / preset-cordis
# and nothing else, measured at 4 rows. That is a property of THIS probe's recipe.
# In a profile where the concerto preset is actually INSTALLED it DOES reach the dump as
# a `- id: preset-concerto` row: scripts/install-concerto.sh installs by writing into
# the web profile's patch file, and there the row is present as `- insert:` /
# `- id: preset-concerto` (~/.dsh/profiles/web/cordis.patch.yml:1035-1036). The
# .agent-presets/ DIRECTORY is not the install surface on 0.2.x at all —
# install-concerto.sh:26-27 and :35-39 say so outright, "0.2.x never reads
# $DSH_HOME/.agent-presets/ off disk"; a directory omo-agents writes there exists on
# disk without being what the loader mounts, which is precisely the distinction the
# earlier version of this note collapsed. Measured, not reasoned: against the real
# profile's dump (2552 lines, 5 preset rows, concerto at :2230) this block pointed at
# `concerto` passes 10/10 exit 0 — vacuity guard green, edit-face-row-live and
# web-face-row-live both satisfied by tool-fs :2351 and tool-web :2546 inside its live
# list. So pointing this block at concerto would EXTEND coverage, including onto the
# unowned `tool-web` row named above; the boundary recorded here is about this probe's
# dump composition and timing, not about dumps in general, and it is not a claim that
# such a run would fail.
echo "concerto-probe: P6-T9 composition-face check (no boot) — edit (E-A) + web faces"
COMPOSE_FACE_MJS="$SANDBOX/assert-composition-faces.mjs"
cat > "$COMPOSE_FACE_MJS" <<'PROBE_FACE_EOF'
// FIX-T9-R4-6 records where FIX-T9-R3-2 lived: the ledger numbers on the comments
// in this block were
// corrected to the arbitration ledger (the disabled-value note R2-6 -> R2-7, the
// uniqueness note R2-5 -> R2-6) and three fixes that had shipped unlabelled were
// labelled — the escaped PASS line R2-1, the vacuity comment R2-4, the positional-
// anchor removal R2-5. Renumber lowest-first: two notes answering to one number is the
// same defect as two checks answering to one name.
//
// P6-T9 composition-face assertions. Written by concerto-mode-probe.sh into its
// sandbox and run there; it reads nothing but the two paths handed in through the
// environment, so the same file can be (and was, at authoring time) run standalone
// against a saved dump and against mangled copies of one, to prove each check fires.
import fs from 'node:fs'

const dumpPath = process.env.DUMP_PATH
const basePath = process.env.BASE_PATCH
const presetId = process.env.PRESET_ID ?? 'preset-standard'
const dump = fs.readFileSync(dumpPath, 'utf8').split('\n')
const base = fs.readFileSync(basePath, 'utf8')

const strip = (value) => value.replace(/^['"]|['"]$/g, '')
const indent = (line) => line.search(/\S/)

// One `- id: <id>` row: its name, its flat config scalars, whether it is
// disabled. Depth is read off the matched line, not assumed, because the base
// bundle declares rows at indent 4 under `plugins:` while the composed dump
// declares presets at column zero — one reader, both shapes.
function readRow(src, id, atIndent) {
  const lines = Array.isArray(src) ? src : src.split('\n')
  const index = lines.findIndex((line) => line.trim() === `- id: ${id}`
    && (atIndent === undefined || indent(line) === atIndent))
  if (index < 0) return null
  const ind = indent(lines[index])
  const row = { name: null, config: {}, disabled: false, disabledRaw: null }
  for (let j = index + 1; j < lines.length; j++) {
    const line = lines[j]
    if (line.trim() === '') continue
    const ci = indent(line)
    if (/^-\s+id:\s/.test(line.trim()) && ci <= ind) break
    if (line.trim() === 'config:' && ci === ind + 2) {
      // FIX-T9-R2-2. DIRECT children only, at ind + 4. The earlier form accepted
      // any deeper line, so a nested `providers:` / `searchProvider:` block read
      // back as the row's own provider selection and stayed green while dsh sees
      // a row with NO provider choice at all. Deeper keys are dropped on purpose:
      // this reader answers "what does THIS row set", not "what appears below it".
      for (let k = j + 1; k < lines.length; k++) {
        const c = lines[k]
        if (c.trim() === '') continue
        if (indent(c) <= ind + 2) break
        if (indent(c) !== ind + 4) continue
        const m = c.match(/^(\s*)([A-Za-z0-9_]+):\s*(.+?)\s*$/)
        if (m) row.config[m[2]] = strip(m[3])
      }
    }
    const n = line.match(/^\s*name:\s*(.+?)\s*$/)
    if (n && row.name === null && indent(line) === ind + 2) row.name = strip(n[1])
    if (/^disabled:/.test(line.trim()) && indent(line) === ind + 2) {
      row.disabled = true
      // FIX-T9-R2-7. Keep the row's own text: the test is key-presence, so the
      // message must not claim a value the row never stated.
      row.disabledRaw = line.trim().replace(/^disabled:\s*/, '') || '(empty)'
    }
  }
  return row
}

// A preset's LIVE plugin list: the slice of the dump from its column-zero row to
// the next column-zero row. Scoped so a top-level disabled placeholder can never
// satisfy a presence check.
//
// FIX-T9-R4-5. Returns { start, lines }, not just the slice. A second caller used to
// findIndex the same row again to turn a slice offset into a dump line number; two
// independent searches for one row can disagree, and when they do the line numbers in
// a failure message drift silently — and a line number is most of what that message is
// worth. One location, offsets derived from it.
function presetBlock(lines, id) {
  const start = lines.findIndex((line) => line.trim() === `- id: ${id}` && indent(line) === 0)
  if (start < 0) return null
  let end = lines.length
  for (let j = start + 1; j < lines.length; j++) {
    if (indent(lines[j]) === 0 && /^-\s+id:\s/.test(lines[j].trim())) { end = j; break }
  }
  return { start, lines: lines.slice(start, end) }
}

const results = []
const check = (name, ok, detail) => results.push(ok ? `ok ${name}` : `FAIL: ${name} — ${detail}`)

const live = presetBlock(dump, presetId)
// FIX-T9-R2-4. The vacuity guard runs FIRST and names itself. Measured, not assumed:
// an absent preset collapses the two legs into two `-face-live-row` absences (the
// provider checks read the HOST row and stay green, so they are not part of the
// count), and those absences read as faces missing rather than as the one renamed
// preset they really are.
check('preset-live-region-found', live !== null,
  `the composed tree has no column-zero \`- id: ${presetId}\` row, so the live plugin list the model receives could not be located — measured: a renamed preset reddens exactly 3 checks (this one plus the two \`*-face-live-row\` absences; each leg's name and live checks collapse into the same early-exit branch), and without this guard those 3 would read as faces missing rather than as one preset renamed`)
const region = live ? live.lines : []
// FIX-T9-R4-5 marker: derived from the single presetBlock location above.
const presetStart = live ? live.start : -1

// FIX-T9-R3-1. The premise the provider block rests on, asserted rather than narrated.
// `web-face-row-unique` counts column-zero rows only, so a `- id: web` declared DEEPER
// — inside this preset's own live plugin list — passed every check here while changing
// which row the runtime actually uses, and the mechanism is measured in the LOADER (see
// FIX-T9-R4-4), not guessed:
// cordis-plugin-loader/lib/index.js:60 `this.tree.store[id] ??= new Entry(...)`
// reuses the entry for a repeated id, :62 calls `entry.update(options, true, true)`, and
// :367 inside `update(options, create, force)` reads `if (create) this.options = options`
// — the whole option set is REPLACED, so the last creator wins and the preset's row
// becomes the operative `web` row while the host row whose searchProvider/fetchProvider
// this block asserts stops being the one in effect. cordis-plugin-include/lib/index.js:62
// (`entryMap.set(entry.id, entry)`) is the same last-write-wins shape one layer up, at
// the patch/config index; the loader is what actually runs. Measured before this check existed: inserting
// such a row at the preset's tool-web position left 9/9 green.
const presetWebHits = region
  .map((line, k) => ({ at: presetStart + k + 1, text: line.trim() }))
  .filter((e) => e.text === `- id: web`)
check('web-face-absent-from-preset', presetWebHits.length === 0,
  `${presetId}'s live plugin list declares ${presetWebHits.length} \`- id: web\` row(s) at dump line(s) ${presetWebHits.map((e) => e.at).join(", ") || "none"} — the host's column-zero web row is SHADOWED there, so the provider values asserted below belong to a row the runtime no longer uses (the id index is Map.set, last write wins)`)

for (const [leg, id, fork] of [['edit', 'tool-fs', 'E (E-A)'], ['web', 'tool-web', 'W']]) {
  const want = readRow(base, id)
  if (!want || !want.name) {
    check(`${leg}-face-expectation-derived`, false,
      `could not derive the expected row for \`- id: ${id}\` from the installed base bundle ${basePath} — the ${leg} leg would assert nothing`)
    continue
  }
  const at = region.findIndex((line) => line.trim() === `- id: ${id}`)
  if (at < 0) {
    check(`${leg}-face-live-row`, false,
      `\`- id: ${id}\` (${want.name}) is absent from ${presetId}'s live plugin list — fork ${fork} silently degraded: the row the model receives no longer carries this face`)
    continue
  }
  let stop = region.length
  for (let j = at + 1; j < region.length; j++) {
    if (/^-\s+id:\s/.test(region[j].trim()) && indent(region[j]) === indent(region[at])) { stop = j; break }
  }
  const block = region.slice(at, stop)
  // FIX-T9-6a. Indent-qualified, first match at row-indent + 2 — the same reading
  // rule readRow uses. An unqualified find would take a `name:` key that appears
  // deeper, say inside this row's own config, and report it as the row's package
  // name: a green that reads the wrong thing.
  const rowIndent = indent(region[at])
  const nameLine = block.find((line) => indent(line) === rowIndent + 2 && /^name:\s*/.test(line.trim()))
  const got = nameLine ? strip(nameLine.trim().match(/^name:\s*(.+?)\s*$/)[1]) : null
  check(`${leg}-face-row-name`, got === want.name,
    `${presetId}'s live list names \`- id: ${id}\` as ${JSON.stringify(got)} but the installed base bundle says ${JSON.stringify(want.name)}`)
  // FIX-T9-R3-3. Indent-qualified, the same reading rule the `name:` lookup two lines
  // above already uses: a `disabled:` nested inside this row's own config is NOT this
  // row declaring itself off. Matching it would false-red the leg AND report a value
  // the row never stated.
  const off = block.find((line) => indent(line) === rowIndent + 2 && /^disabled:/.test(line.trim()))
  check(`${leg}-face-row-live`, !off,
    `\`- id: ${id}\` is in ${presetId}'s live plugin list but carries ${JSON.stringify((off ?? '').trim())} — present-but-inert is not the ${leg} face being claimed`)
}

// FIX-T9-1. The web PROVIDER selection is a fact about the HOST'S TOP-LEVEL
// `- id: web` row, measured on the composed dump: that row appears exactly ONCE,
// at column zero, and `preset-standard`'s live plugin list contains NO `web` row
// at any indent (its web presence is `tool-web` alone). The earlier form of these
// two checks scanned the WHOLE dump with `dump.some(...)`, which is neither scoped
// nor disabled-aware: a `disabled: true` added to the top-level `web` row stayed
// green, and the banner claimed the values were found under preset-standard, which
// was never true. So the row is located at column zero, its OWN config block is
// read, and the row's own `disabled:` key fails it — present-but-inert is not
// presence for this row either.
const expectedWeb = readRow(base, 'web')
const hostWebRow = readRow(dump, 'web', 0)
if (!expectedWeb || !expectedWeb.config.searchProvider || !expectedWeb.config.fetchProvider) {
  check('web-provider-expectation-derived', false,
    `could not derive searchProvider/fetchProvider for \`- id: web\` from ${basePath}`)
} else if (!hostWebRow) {
  check('web-face-row-top-level', false,
    `the composed tree has no column-zero \`- id: web\` row — the host row that carries the web provider selection is gone, so both provider checks below have no subject`)
} else {
  // FIX-T9-R2-6. The uniqueness this block's reasoning rests on was a comment, not
  // a check: readRow takes the FIRST match, so a second `- id: web` row at column
  // zero made the sentence above false while every check below still passed. Counting
  // it turns the premise into a guarded fact — and it runs before the value checks,
  // because with two subject rows a value read from "the" row names no subject.
  const webRowHits = dump.filter((line) => line.trim() === `- id: web` && indent(line) === 0).length
  check('web-face-row-unique', webRowHits === 1,
    `the composed tree has ${webRowHits} column-zero \`- id: web\` rows, not exactly 1 — readRow would silently read the first and the provider checks below would report on a row chosen by accident`)
  // Named apart from the preset leg's `web-face-row-live`: two checks answering to
  // one name would make a failure of either indistinguishable in the log, which is
  // the same defect this repo's distinctness guard rejects for guard messages.
  check('web-face-host-row-live', !hostWebRow.disabled,
    `the host's top-level \`- id: web\` row carries \`disabled: ${hostWebRow.disabledRaw}\` — the web face is present-but-inert whatever value it states, which is NOT the provider selection being claimed (this is the exact shape a whole-tree grep let through)`)
  for (const key of ['searchProvider', 'fetchProvider']) {
    const want = expectedWeb.config[key]
    const got = hostWebRow.config[key]
    check(`web-face-${key}`, got === want,
      `the host's top-level \`- id: web\` row states ${key}=${JSON.stringify(got ?? null)} but the installed base bundle declares ${JSON.stringify(want)} — the web ${key} selection was dropped or rewritten in composition (fork W silently degraded)`)
  }
}

for (const line of results) console.log(line)
process.exit(results.some((line) => line.startsWith('FAIL:')) ? 1 : 0)
PROBE_FACE_EOF
node --check "$COMPOSE_FACE_MJS" \
  || fail "P6-T9: the composition-face checker this probe just wrote does not parse (heredoc truncated?)"

COMPOSE_DUMP_OUT="$SANDBOX/compose-dump.yml"
COMPOSE_DUMP_ERR="$SANDBOX/compose-dump.err"
COMPOSE_BASE_PATCH="$DSH_NM/@deepseek-ai/dsh-base/cordis.patch.yml"
[[ -f "$COMPOSE_BASE_PATCH" ]] \
  || fail "P6-T9: the installed base bundle that supplies every expectation is missing ($COMPOSE_BASE_PATCH) — the edit/web legs have no source of truth to check against"
dsh --profile "$PROFILE" --dump-config --patch ./cordis.yml --patch "$LLM_SEED_PATCH" \
  >"$COMPOSE_DUMP_OUT" 2>"$COMPOSE_DUMP_ERR" \
  || fail "P6-T9 --dump-config (the composition face of the edit/web legs) failed: $(cat "$COMPOSE_DUMP_ERR")"
# FIX-T9-8. The stderr this command writes was captured and then never read, which
# loses the one channel that names a silently-skipped patch row (`patch: entry
# "<id>" not found`). The check cold-start.sh:125-127 runs is run here on the same
# file for the same reason: an unmatched patch is loud or it is nothing. An empty
# stderr is the normal state and passes.
if grep -qE "not found|mismatch|failed" "$COMPOSE_DUMP_ERR"; then
  fail "P6-T9 --dump-config wrote patch warnings on stderr: $(cat "$COMPOSE_DUMP_ERR")"
fi
[[ -s "$COMPOSE_DUMP_OUT" ]] \
  || fail "P6-T9 --dump-config produced an empty tree — there is nothing to assert on, and an empty file must never read as composition success"

COMPOSE_FACE_RESULTS="$(DUMP_PATH="$COMPOSE_DUMP_OUT" BASE_PATCH="$COMPOSE_BASE_PATCH" node "$COMPOSE_FACE_MJS")"
COMPOSE_FACE_RC=$?
printf '%s\n' "$COMPOSE_FACE_RESULTS" | sed 's/^/concerto-probe:   /'
while IFS= read -r face_line; do
  [[ "$face_line" == FAIL:* ]] || continue
  fail "P6-T9 composition face ${face_line#FAIL: }"
done <<<"$COMPOSE_FACE_RESULTS"
[[ $COMPOSE_FACE_RC -eq 0 ]] \
  || fail "P6-T9 composition-face checker exited $COMPOSE_FACE_RC with no FAIL line — it failed without naming what it found, which is the unlocalised red this shape exists to avoid"
# FIX-T9-R4-2. This line and the final PASS banner both name the asserted absence, so a
# reader of the log alone can tell an asserted fact from a narrated one.
#
# FIX-T9-R2-1. The backticks in this line are escaped on purpose. Inside these
# double quotes an unescaped backtick is a COMMAND SUBSTITUTION: the first version of
# this line ran `- id: web` and `web` as commands, deleted both identifiers from the
# text it printed, and threw "command not found" on stderr every single run — and had a
# command named `web` existed on PATH, this line would have executed it. Same convention
# as the main PASS banner near the end of this file.
echo "concerto-probe: P6-T9 composition-face PASS — edit (E-A) dsh-tool-fs and fork W dsh-tool-web rows LIVE under ${PRESET_ID:-preset-standard}'s plugin list, and the web provider selection LIVE on the host's own column-zero \`- id: web\` row (that row occurs exactly once, at column zero; the preset's live list holds no \`web\` row) — expectations derived from $COMPOSE_BASE_PATCH; the preset's lack of a \`web\` row is ASSERTED by web-face-absent-from-preset, not narrated"

# boot_once <label> <expected-sync-outcome>: real boot, bounded; asserts the
# plugin-side markers and the external roster, then SIGTERMs (exit 0).
# Top-level, NOT local: the PASS banner at the bottom of this script names the
# assertion face that was actually used, and it runs OUTSIDE boot_once(). With
# `set -u` (see the top of this file) a `local composition_source` inside
# boot_once() leaves the banner referencing an UNBOUND variable, so the script
# died at its own PASS line with exit 1 and `exit 0` was unreachable
# (MAJOR-2 — a gate that cannot print its own PASS is not a gate). boot_once()
# writes the last boot's face here; the banner reads it.
LAST_COMPOSITION_SOURCE=""

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

  echo "concerto-probe: [$label] booting dsh --profile $PROFILE --patch ./cordis.yml --patch $LLM_SEED_PATCH --port 0 $NO_OPEN"
  # NO_OPEN is either empty or exactly one flag; unquoted on purpose so the
  # empty case adds no argument at all. shellcheck disable=SC2086
  # The second --patch is the llm-pi-ai route seed (see the seeding block
  # above): composed into the entry list before mount, so the explore seat's
  # provider is registered at apply() time on a 0.2.x FIRST boot — the race
  # the removed settings.yaml surface lost.
  dsh --profile "$PROFILE" --patch ./cordis.yml --patch "$LLM_SEED_PATCH" --port 0 $NO_OPEN >"$boot_log" 2>&1 &
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
  # The seeded pi-ai route registers during plugin load — its config rides the
  # second --patch overlay composed into the entry list before mount, so it is
  # registered before the readiness line and one call suffices.
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

  # P4.5-T6 FACE B: the agentPresets/read FETCH happens HERE, inside the live
  # window, while the server is still up. The first draft issued it down in the
  # FACE B assertion block (~line 1250), which runs AFTER the SIGTERM below — so
  # it connected to a dead port and died with ECONNREFUSED. Gate 8 running for
  # real caught it (gate8-probe-attempt3.log). Only the FETCH is live-bound; the
  # assertions on the bytes keep running below against the saved file, exactly
  # like the roster/provider RPCs whose responses are already saved here.
  local read_json="$SANDBOX/agentPresets.read-$label.json"
  if ! node "$WEB_RPC_MJS" read "$port" "$token" concerto >"$read_json" 2>"$rpc_err"; then
    cat "$rpc_err" >&2
    fail "[$label] FACE B: agentPresets/read RPC failed on the live window — NO fallback to the materialized file is permitted"
  fi
  [[ -s "$read_json" ]] \
    || fail "[$label] FACE B: the agentPresets/read RPC saved no bytes to $read_json"
  echo "concerto-probe: [$label] FACE B fetched $(wc -c <"$read_json") bytes of agentPresets/read RPC response while the server was still live"

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
  # `registered` line — the full $EXPECTED_HOOK_COUNT-line set, with the id set in
  # the expectation provably equal to the manifest id set (see the derivation
  # above). P4-T16 再审 ③: this said "the full 14-line set"; the count is derived
  # and printed, never written here.
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
  # P5-T3: the fourth cordis.yml insert row mounted, its ONE summary marker
  # matches the source-derived text exactly (-F: the marker carries an em dash
  # and regex metacharacters), and every PORTED team surface with a registrar
  # logged its `registered` line — at P5-T3 the derived set is EMPTY (empty
  # registry skeleton, no row 'ported' yet), so this loop asserts nothing until
  # T5 lands the first registrar; the summary -F grep carries the mount proof
  # meanwhile. A FAILED line is a real registration/validation failure and must
  # never ride along silently, so both FAILED forms are explicitly asserted
  # ABSENT.
  grep -qF "$EXPECTED_TEAM_SUMMARY" "$boot_log" \
    || fail "[$label] omo-team summary marker missing or drifted (want: $EXPECTED_TEAM_SUMMARY)"
  local expected_team_line
  while IFS= read -r expected_team_line; do
    [[ -n "$expected_team_line" ]] || continue
    grep -qF "$expected_team_line" "$boot_log" \
      || fail "[$label] omo-team registered marker missing or drifted (want: $expected_team_line) — TEAM_REGISTRARS lost this entry (import drift?) or the loop stopped logging it"
  done <<<"$EXPECTED_TEAM_REGISTERED_LINES"
  if grep -q '\[omo-team\] manifest validation FAILED' "$boot_log"; then
    fail "[$label] omo-team rejected its own manifest at boot — see FAILED line above"
  fi
  if grep -q '\[omo-team\] team surface .* FAILED' "$boot_log"; then
    fail "[$label] an omo-team registration FAILED at boot — see FAILED line above"
  fi
  # P6-T5: the FIFTH cordis.yml insert row (omo-lsp) mounted, and its stdio LSP
  # child SPOKE. Every row above has a plugin-side summary marker to grep; this
  # one cannot, because the row is `failOnStartupError: false` — a dead LSP child
  # is deliberately allowed to boot green, so the ONLY loud-absence signal for
  # "the LSP row degraded silently" is the child's own stderr announcement,
  # inherited into this boot log (@modelcontextprotocol/client/dist/stdio.mjs:76
  # `stderr ?? "inherit"`). -F because the derived value carries `[` `]` regex
  # metacharacters. The expectation is $EXPECTED_LSP_STARTING_MARKER, derived at
  # probe start by awk out of vendor/lsp-core/src/cli.ts — NOT retyped here, so
  # a reworded announcement moves this grep with it and a deleted one fails the
  # derivation before this boot ever runs. scripts/cold-start.sh:215-223 greps
  # the same line from a hand-copied prefix: the two readers agreeing on one
  # shipped literal is the cross-check the constants module claims.
  # Per-label, so it covers BOTH the normal boot and the idempotent re-boot.
  grep -qF "$EXPECTED_LSP_STARTING_MARKER" "$boot_log" \
    || fail "[$label] the omo-lsp stdio child (the FIFTH cordis.yml insert row, @deepseek-ai/dsh-mcp-client) never announced itself — the row degraded silently (failOnStartupError:false keeps the boot green); want the awk-derived announcement [$EXPECTED_LSP_STARTING_MARKER] from vendor/lsp-core/src/cli.ts in $boot_log"
  # P5-T10: the team PRESENCE face, run by the shared validator so this live
  # boot and the hermetic defect legs cannot drift apart. It pins (a) the
  # canonical trio BY NAME (team_create / team_send_message / team_status —
  # named, human-readable evidence on top of the derived loop above, which
  # keeps covering the FULL registered set), and (b) the state machine's OWN
  # boot answer — `[omo-team] boot resume: resumed=…, failed=…, orphaned=…,
  # cleaned=…, errors=…`, its shape derived from the plugin's shipped
  # formatTeamBootResumeLine — which index.ts logs exactly once and ONLY after
  # rebuildIndexes() + the vendored resumeAllTeams() resolved: a state machine
  # that never initialized cannot print it (the probe has no model key, so it
  # does NOT fake a session/team_status RPC — it reads the machine's own
  # durable answer instead), and the loud failure forms
  # (`boot resume FAILED` / per-row `FAILED`) are asserted ABSENT here and
  # proven catchable by the fabricated loud log in --self-test.
  node "$ASSERT_TEAM_PROBE_FACE_MJS" present "$boot_log" \
    || fail "[$label] P5-T10 team PRESENCE face failed (validator output above)"
  if grep -q "\[omo-agents\] concerto .* FAILED" "$boot_log"; then
    fail "[$label] registration threw — see FAILED line above"
  fi
  grep -q "\[omo-agents\] concerto preset $expected_outcome at " "$boot_log" \
    || fail "[$label] expected sync outcome '$expected_outcome' not logged"
  # P4.5-T6 roster-line assertions. The pre-T6 pair here was a prefix-only
  # grep plus `grep -q "concerto:user"`, and BOTH were weak: the prefix
  # matched an EMPTY roster (T1 Q-3 §1.4 measured that a first list() can
  # return [] at the inject instant), and `concerto:user` asserted a `trust`
  # level that 0.2.x never produces — its roster row has no trust key at all
  # (agent-preset-registry/src/index.ts:156-162 @ dsh-v0.2.0-rc.2), so the
  # plugin printed `concerto:?` and this grep was RED on every 0.2.x boot.
  # Now: the whole line is derived from the shipped formatter (never restated
  # here), it must carry at least one row, it must name concerto, and the
  # dead `trust` vocabulary plus its `?` placeholder are asserted ABSENT.
  # The prefix and the concerto row TOKEN are derived separately, both from the
  # shipped formatter. The first draft derived
  # formatConcertoRosterLine([{id:'concerto'}]) and grepped that WHOLE string
  # as a contiguous substring — which is FALSE on a real boot, because the live
  # roster carries the other rows first:
  #   [omo-agents] concerto roster: standard:broken=absent,ptc:broken=absent,
  #       minimal:broken=absent,cordis:broken=absent,concerto:broken=absent
  # Gate 8 running for real caught it (archived as gate8-probe-attempt.log:
  # "roster line missing or drifted"). A derived expectation that does not match
  # reality is still a wrong expectation, even when the code under test is right.
  local expected_roster_prefix expected_roster_token expected_roster_empty
  expected_roster_prefix="$(cd "$REPO_ROOT" && node --input-type=module -e "
    import('./patches/omo-dsh/omo-agents/src/concerto-preset.ts')
      .then((m) => process.stdout.write(
        m.formatConcertoRosterLine([]).replace(m.CONCERTO_ROSTER_EMPTY, '')))
  ")" || fail "[$label] could not derive the roster prefix from the shipped formatter"
  expected_roster_token="$(cd "$REPO_ROOT" && node --input-type=module -e "
    import('./patches/omo-dsh/omo-agents/src/concerto-preset.ts')
      .then((m) => process.stdout.write(
        m.formatConcertoRosterLine([{ id: 'concerto' }])
          .slice(m.formatConcertoRosterLine([]).replace(m.CONCERTO_ROSTER_EMPTY, '').length)))
  ")" || fail "[$label] could not derive the concerto roster token"
  # The empty roster prints `${prefix}${CONCERTO_ROSTER_EMPTY}` — the token is
  # NOT a `id:broken=` row, so a guard grepping 'concerto:broken=EMPTY' can
  # never fire (PR #12 review: dead guard). Derive the empty line itself.
  expected_roster_empty="$(cd "$REPO_ROOT" && node --input-type=module -e "
    import('./patches/omo-dsh/omo-agents/src/concerto-preset.ts')
      .then((m) => process.stdout.write(m.formatConcertoRosterLine([])))
  ")" || fail "[$label] could not derive the empty-roster line from the shipped formatter"
  [[ -n "$expected_roster_prefix" && -n "$expected_roster_token" && -n "$expected_roster_empty" ]] \
    || fail "[$label] the derived roster prefix/token/empty line came back empty"
  echo "concerto-probe: [$label] derived roster assertion: prefix=\"$expected_roster_prefix\" token=$expected_roster_token empty=\"$expected_roster_empty\""
  grep -qF "$expected_roster_prefix" "$boot_log" \
    || fail "[$label] roster line missing or drifted (want the shipped prefix: $expected_roster_prefix)"
  grep -F "$expected_roster_prefix" "$boot_log" | grep -qF "$expected_roster_token" \
    || fail "[$label] the booted roster line does not list concerto as an UNBROKEN row — a bare prefix or the EMPTY token is not evidence of a roster (T1 Q-3 §1.4: a first list() may be empty)"
  if grep -qF "$expected_roster_empty" "$boot_log"; then
    fail "[$label] the roster read came back EMPTY — registration never landed in the roster the plugin read"
  fi
  if grep -F "$expected_roster_prefix" "$boot_log" | grep -qE ':[?]|\buser\b|\bsystem\b'; then
    fail "[$label] the dead 0.1.5 trust vocabulary is back on the roster line (:? / :user / :system) — P4.5-T6 removed it from the shipped print"
  fi
  # P4.5-T5: the registration outlet must be observable in EXACTLY ONE of its
  # two shapes — the 0.2.x readback-proven success (whole-line -F grep: the
  # marker carries the id AND the verdict, so an empty roster or a prefix-only
  # match cannot satisfy it — arbitration 边界B), or the 0.1.5 face-absent
  # fallback where the materialized path owns the registration. A silent third
  # outcome — the inject callback never reaching the outlet — fails here. The
  # register FAILED form is already asserted ABSENT by the `concerto .* FAILED`
  # grep above; the two positive forms are mutually exclusive below (both in
  # one boot would mean the capability probe and the outcome disagree).
  if grep -qF "[omo-agents] concerto preset registered: id=concerto broken=absent" "$boot_log"; then
    if grep -qF "[omo-agents] concerto preset register face absent, materialized path only" "$boot_log"; then
      fail "[$label] BOTH registration shapes logged — face probe and outcome disagree"
    fi
  else
    grep -qF "[omo-agents] concerto preset register face absent, materialized path only" "$boot_log" \
      || fail "[$label] T5 registration outlet not observable (neither success nor face-absent marker)"
  fi

  # External assertions: the RPC roster lists all 5 presets — the official 4
  # plus concerto — and the concerto entry carries OUR preset.yml display name
  # (协奏 / Concerto). $official_ids is transport-adaptive (0.1.2 renamed code
  # → ptc, see above).
  for id in $official_ids; do
    grep -q "\"id\":\"$id\"" "$api_resp" \
      || fail "[$label] official preset '$id' missing from the roster RPC response"
  done
  [[ "$found" == "1" ]] \
    || fail "[$label] concerto NOT in the roster RPC after 30s — registration broken"
  # P4.5-T6: the roster-row vocabulary assertion splits by RUNTIME FACE, and
  # the discriminator is the plugin's OWN outlet marker (asserted mutually
  # exclusive above), not a version string parsed here.
  #   * 0.1.5 — the row really does carry trust:"user"; that assertion stays,
  #     because deleting it would make the 0.1.5 leg WEAKER, which is not
  #     what a vocabulary migration is for.
  #   * 0.2.x — `trust` is not a key of the row at all (the row is built by
  #     one literal at agent-preset-registry/src/index.ts:156-162 @
  #     dsh-v0.2.0-rc.2: id/name/description/order/broken). The registry's
  #     own level field is `isDefault`, and it is added ONLY by
  #     remoteExportList() (:171-174) — which returns an ENVELOPE
  #     {presets:[…]}, NOT an array. Consuming it as an array throws
  #     TypeError inside cordis and is swallowed into the logger, i.e. the
  #     failure is SILENT, so the shape is resolved explicitly here and the
  #     shape actually seen is PRINTED for the audit.
  if grep -qF "[omo-agents] concerto preset registered: id=concerto broken=absent" "$boot_log"; then
    node -e '
      const fs = require("node:fs")
      const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
      const value = body?.result?.value
      let rows
      let shape
      if (Array.isArray(value)) { rows = value; shape = "array" }
      else if (value && Array.isArray(value.presets)) { rows = value.presets; shape = "envelope{presets}" }
      else { console.error("roster RPC value is neither an array nor an {presets:[…]} envelope: " + JSON.stringify(value).slice(0, 200)); process.exit(1) }
      const row = rows.find((r) => r && r.id === "concerto")
      if (row === undefined) { console.error("no concerto row in the roster RPC (" + rows.length + " rows)"); process.exit(1) }
      if (row.isDefault !== false) { console.error("concerto.isDefault is " + JSON.stringify(row.isDefault) + ", want false"); process.exit(1) }
      if ("trust" in row) { console.error("concerto row still carries a trust key: " + JSON.stringify(row.trust)); process.exit(1) }
      if ("broken" in row) { console.error("concerto row is BROKEN: " + JSON.stringify(row.broken)); process.exit(1) }
      process.stderr.write("roster RPC shape=" + shape + " rows=" + rows.length + " concerto{isDefault:false,trust:ABSENT,broken:ABSENT}\n")
    ' "$api_resp" \
      || fail "[$label] the 0.2.x roster RPC row for concerto is not isDefault:false with trust/broken ABSENT (see the shape line above)"
  else
    # T13 ADJUDICATION (Review A MINOR): capability-selected fork, KEPT. The
    # selection above branches on the plugin's OWN boot marker
    # (`registered: id=concerto broken=absent`), not on a version string —
    # this else-leg fires exactly when the boot log instead says `register face
    # absent`, i.e. it is the mutual-exclusion counterpart asserted at
    # :1195-1201. On the pinned 0.2.x it never fires; it stays (a) to keep
    # that mutual-exclusion honest — deleting it would leave the face-absent
    # shape unasserted, so an outlet that flipped back to file-only mode would
    # pass this probe by falling off its own grep map, and (b) to keep
    # pre-cutover logs probeable. Not dead weight: the negative half of the
    # canary.
    grep -q '"trust":"user"[^}]*"id":"concerto"\|"id":"concerto"[^}]*"trust":"user"' "$api_resp" \
      || fail "[$label] 0.1.5 leg: concerto entry does not carry trust:\"user\""
  fi
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

  # ── P4.5-T6: TWO content assertion faces, written separately, NO fallback ──
  #
  # Which face proves the composition depends on WHO supplies the composition
  # to the running host, and that is decided by the plugin's OWN capability
  # marker in this very boot log — not by a version string, and NEVER by
  # "try the remote face and fall back to the file if it is missing":
  #
  #   FACE A — 0.1.5 (`register face absent`): the host composes from the
  #     MATERIALIZED FILE (file discovery owns `agentPresets/read` there), so
  #     the file is the honest input and the verbatim line anchors below hold.
  #     T13 ADJUDICATION (Review A MINOR): KEPT — capability-selected by the
  #     plugin's own boot marker, never by a version string; post-D17 it is
  #     the probe's face-absent half (mutual exclusion at :1195-1201) and the
  #     only way to honestly probe pre-cutover logs. Dead-weight test applied
  #     and failed: deleting it would leave the face-absent outcome unasserted,
  #     so an outlet regressing to file-only mode would pass by vanishing from
  #     this probe's grep map — the exact silent shape the canary guards.
  #
  #   FACE B — 0.2.x (`registered: id=concerto broken=absent`): the host
  #     composes from the REGISTERED DEFINITION, and `agentPresets/read` is
  #     the face that definition is readable through. The materialized file
  #     still exists — the write contract stays, gate 4 depends on it — but
  #     NOTHING READS IT on this runtime, so a passing grep against it proves
  #     only that we wrote bytes, not that the concerto mode boots with them.
  #     Falling back to FACE A here would keep the probe green through exactly
  #     the regression this canary exists to catch (a preset that never
  #     registers, or registers and then vanishes, while yesterday's file sits
  #     on disk looking fine) — so if the read RPC fails, this probe FAILS.
  #
  # The two faces are NOT merged into one grep list: FACE A keeps the
  # rendered-text anchors it is entitled to (flow sequences, quoted scalars),
  # FACE B asserts PARSED VALUES element by element, because `content` is a
  # yaml.dump() of the parsed entry list and flow sequences/quotes do not
  # survive it. See ASSERT_READ_FACE_MJS above for the measured shape.
  local composition_source=""
  local read_content=""
  local composition_for_proofs=""
  if grep -qF "[omo-agents] concerto preset registered: id=concerto broken=absent" "$boot_log"; then
    composition_source="FACE B / 0.2.x agentPresets/read content (materialized file has no reader here)"
    read_content="$SANDBOX/agentPresets.read-$label.yml"
    # NO RPC is issued here. The response was fetched in the live window above
    # (`read_json` is bound there) because this block runs after the server was
    # SIGTERM'd; re-issuing it connected to a dead port and died ECONNREFUSED.
    # The guard below is what keeps that from ever degrading into a silent skip.
    [[ -f "$read_json" ]] \
      || fail "[$label] FACE B: no saved agentPresets/read response to assert on — the live-window fetch did not run"
    # The expected name comes from OUR preset.yml (the same single source the
    # plugin registers from), re-read here rather than restated as a literal.
    node -e '
      const fs = require("node:fs")
      const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
      const value = body?.result?.value
      if (!value || typeof value.content !== "string" || value.content.length === 0) {
        console.error("READ FAIL: the agentPresets/read document carries no content: " + JSON.stringify(body).slice(0, 200))
        process.exit(1)
      }
      if (value.agentPreset !== "concerto") {
        console.error("READ FAIL: the document is for " + JSON.stringify(value.agentPreset) + ", not concerto")
        process.exit(1)
      }
      // With `node -e <script> A B`, process.argv is [nodePath, A, B] — so
      // the read JSON is argv[1] and the expected name is argv[2], NOT
      // argv[3]. (An earlier draft read argv[3] here, which is undefined, so
      // this comparison was `name !== undefined` and the face could never go
      // green. Same index class of bug as the web-rpc preset-id argv[4].)
      if (value.name !== process.argv[2]) {
        console.error("READ FAIL: document name " + JSON.stringify(value.name) + " is not OUR preset.yml name " + JSON.stringify(process.argv[2]))
        process.exit(1)
      }
      process.stdout.write(value.content)
     ' "$read_json" "$PRESET_YML_NAME" > "$read_content" \
      || fail "[$label] FACE B: could not extract the concerto composition from the read RPC document"
    # The redirection on the line above is the ONLY thing that puts these bytes
    # on disk, and the guard has to be explicit: without `set -e`, a failed
    # `wc -c <"$read_content"` inside a command substitution just prints an error
    # and carries on — so a missing file would surface three lines later as a
    # misleading "does not match the roster-derived expectations" RED. A
    # missing/empty extraction is its OWN failure and must say so.
    # (MAJOR-1: the first draft had NO redirection at all — ~98 KB went to the
    # probe's OWN stdout while every consumer below read a path that never
    # existed. t6-scenario.sh:194 HAD the redirect: the two consumers forked and
    # the fork was the bug. Recorded in the T6 report §修复轮登记.)
    [[ -s "$read_content" ]] \
      || fail "[$label] FACE B: read content extraction produced no bytes: $read_content"
    echo "concerto-probe: [$label] FACE B read $(wc -c <"$read_content") bytes of agentPresets/read content for concerto"
    # Expected `!!js` gate count, taken from the WRITE face (the materialized
    # file both faces are rendered from) and handed to the validator as an
    # EXTERNAL expectation. Self-counting the read face cannot catch a tag that
    # silently became a string — dropping it lowers both sides of the reader's
    # own tally at once (MINOR-2, measured). The file is not used as the
    # assertion INPUT here; it is used only to state how many gates must exist,
    # which is a property of OUR render, not of the bytes under assertion.
    local expected_js_count
    expected_js_count="$(grep -c '!!js ' "$materialized" || true)"
    [[ "$expected_js_count" =~ ^[0-9]+$ ]] \
      || fail "[$label] FACE B: could not count the \`!!js\` gates in $materialized"
    [[ "$expected_js_count" -gt 0 ]] \
      || fail "[$label] FACE B: the materialized face declares ZERO \`!!js\` gates — the render changed, re-derive the expectation"
    echo "concerto-probe: [$label] FACE B expected \`!!js\` gates from the write face: $expected_js_count"
    node "$ASSERT_READ_FACE_MJS" "$DSH_NM_UNION" "$read_content" "$ROSTER_EXPECTATIONS_JSON" "$EXPLORE_PROVIDER" "$EXPLORE_MODEL" "$expected_js_count" \
      || fail "[$label] FACE B: the read-face content does not match the roster-derived expectations element-wise"
    # The installed dsh's own schema gate runs against the bytes the host can
    # actually read — on this leg that is the read content, not the file.
    node "$VALIDATE_EXPLORE_MJS" "$DSH_NM_UNION" "$read_content" "$EXPLORE_PROVIDER" "$EXPLORE_MODEL" "$EXPLORE_DENY_JSON" "$EXPLORE_MAXDEPTH" \
      || fail "[$label] FACE B: the explore row in the read content failed validation against the installed dsh-tool-subagent Config"
    composition_for_proofs="$read_content"
  else
    # T13 ADJUDICATION (Review A MINOR): KEPT — this FACE A branch is reached
    # only when the FACE B marker was absent from THIS boot log (capability
    # selection, see the FACE A/B block above and :1195-1201); on the pinned
    # 0.2.x the probe selects FACE B and this leg never runs.
    composition_source="FACE A / 0.1.5 materialized file (file discovery owns the composition)"
    echo "concerto-probe: [$label] $composition_source"
    grep -q "prefix: |-" "$materialized" \
      || fail "[$label] materialized persona is not a \`prefix: |-\` block scalar"
    grep -q "      # Orchestrator Role" "$materialized" \
      || fail "[$label] materialized persona missing the Orchestrator Role section"
    grep -q "      # Delegation Discipline" "$materialized" \
      || fail "[$label] materialized persona missing the Delegation Discipline section"
    grep -q "      ## Hard Blocks" "$materialized" \
      || fail "[$label] materialized persona missing the injected Hard Blocks section"

    # T11 (FR-4/FR-5 binding, form A): the explore tool-subagent instance is
    # part of the mounted composition. FACE A keeps the rendered-text anchors:
    # a flow sequence and a quoted scalar are exactly what WE render, so on
    # this face a whole-line grep is the strictest honest form.
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
    # P2-T15 shape (FACE A only): the rendered deny is the roster-computed list
    # (write/edit + the 10 delegation toolNames, roster order) emitted by the
    # P2-T15 sentinel renderer as a JSON-quoted YAML FLOW sequence at the row's
    # 10-space content indent. This is the assertion that cannot survive the read
    # face — flow expands to block there — so it lives here, on the face whose
    # bytes really are flow, and never on FACE B.
    grep -qxF -- "          deny: [$EXPLORE_DENY_SEQUENCE]" "$materialized" \
      || fail "[$label] explore toolFilter deny list missing or not the roster-computed sequence (T12 + F1, P2-T15 shape: want deny: [$EXPLORE_DENY_SEQUENCE])"
    # maxDepth pin is ROSTER-DERIVED for the same reason as the deny pin above:
    # $EXPLORE_MAXDEPTH was resolved from src/roster.ts at probe start, so a
    # roster edit (like the 2026-09-13 target-row correction, D-2026-09-13-01)
    # cannot leave a stale literal here.
    grep -q "^        maxDepth: $EXPLORE_MAXDEPTH$" "$materialized" \
      || fail "[$label] explore maxDepth: $EXPLORE_MAXDEPTH missing (T13 roster-derived value)"

    # P2-T20 (FACE A): the P2-T15 explore pins above, generalized to EVERY
    # roster delegation row. Everything asserted here is derived at probe start
    # from src/roster.ts (toolName ids, per-row deny/allow lists, maxDepth) —
    # no literal roster list is restated in this script. The explore row is
    # checked twice (here and by the explicit T11 greps above) by design: the
    # named explore assertions stay as the pinned T11 evidence.
    local delegation_id row_maxdepth row_deny_json row_allow_plain row_deny_sequence row_block
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
      # WP2 MINOR-1 + review A MINOR-C/NIT-3, same round as the validator's
      # else branches. Two defects lived here: the greps only fired when the
      # roster DECLARED a list, so for the orchestrator (`atlas`) and the
      # allowlist class (`multimodal-looker`) they asserted nothing at all; and
      # the absence net matched only the flow-sequence shape (`deny: [`), while
      # its span was the WHOLE row — so a persona line at the same 10-space
      # indent that merely begins `deny: [read]` was reported as an injected
      # filter (measured: review A FA7), and an injected block-style
      # `deny:` + `- read` was invisible.
      # Now: the span is the row's `toolFilter` SUB-block (the 8-space key's
      # children, nothing else), both shapes are recognised, and the positive
      # greps are row-scoped too — a deny list on some OTHER row used to
      # satisfy them.
      row_block="$(awk -v id="    - id: tool-subagent-$delegation_id" \
        'index($0,id)==1{f=1;next} f&&/^    - id: /{exit} f{print}' "$materialized")"
      [[ -n "$row_block" ]] \
        || fail "[$label] FACE A: the materialized span of row '$delegation_id' is empty — every absence assertion below would be vacuous"
      filter_block="$(printf '%s\n' "$row_block" | awk '/^        toolFilter:/{f=1;next} f&&/^        [^ ]/{exit} f{print}')"
      row_has_deny="$(printf '%s\n' "$filter_block" | grep -c '^          deny:' || true)"
      row_has_allow="$(printf '%s\n' "$filter_block" | grep -c '^          allow:' || true)"
      row_deny_json="$(printf '%s\n' "$DELEGATION_DENIES" | grep "^$delegation_id=" | cut -d= -f2- || true)"
      if [[ -n "$row_deny_json" ]]; then
        [[ -n "$filter_block" ]] \
          || fail "[$label] FACE A: row '$delegation_id' renders NO toolFilter sub-block at all, but the roster declares a deny list for it"
        row_deny_sequence="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).map((n) => JSON.stringify(n)).join(", "))' "$row_deny_json")" \
          || fail "[$label] could not build the rendered deny sequence for '$delegation_id' from $row_deny_json"
        printf '%s\n' "$filter_block" | grep -qxF -- "          deny: [$row_deny_sequence]" \
          || fail "[$label] materialized row '$delegation_id' deny list missing or not the roster-computed sequence (want deny: [$row_deny_sequence] inside this row's toolFilter block)"
      elif [[ "$row_has_deny" != "0" ]]; then
        fail "[$label] FACE A: row '$delegation_id' carries a deny list (flow or block) the roster does not declare — the roster gives this class NO toolFilter.deny, so the key must be ABSENT from this row's toolFilter block"
      fi
      row_allow_plain="$(printf '%s\n' "$DELEGATION_ALLOWS" | grep "^$delegation_id=" | cut -d= -f2- || true)"
      if [[ -n "$row_allow_plain" ]]; then
        [[ -n "$filter_block" ]] \
          || fail "[$label] FACE A: row '$delegation_id' renders NO toolFilter sub-block at all, but the roster declares an allow list for it"
        printf '%s\n' "$filter_block" | grep -qxF -- "          allow: [$row_allow_plain]" \
          || fail "[$label] materialized row '$delegation_id' allow list missing or not the roster-derived list (want allow: [$row_allow_plain] inside this row's toolFilter block)"
      elif [[ "$row_has_allow" != "0" ]]; then
        fail "[$label] FACE A: row '$delegation_id' carries an allow list (flow or block) the roster does not declare — only the allowlist class renders toolFilter.allow"
      fi
      if [[ -z "$row_deny_json" && -z "$row_allow_plain" ]] \
        && printf '%s\n' "$row_block" | grep -q '^        toolFilter:'; then
        fail "[$label] FACE A: row '$delegation_id' renders a toolFilter block the roster declares none of (orchestrator rows carry no filter key at all)"
      fi
    done <<< "$DELEGATION_IDS"
    # Uniform maxDepth: exactly one maxDepth line per delegation row, all equal
    # to the roster's uniform value (the spec's ④ shape, roster-derived).
    local materialized_depth_lines
    materialized_depth_lines="$(grep -c "^        maxDepth: $UNIFORM_MAXDEPTH$" "$materialized" || true)"
    [[ "$materialized_depth_lines" == "$DELEGATION_COUNT" ]] \
      || fail "[$label] expected $DELEGATION_COUNT maxDepth lines at the roster-uniform value $UNIFORM_MAXDEPTH, found $materialized_depth_lines"
    local materialized_toolnames
    materialized_toolnames="$(grep -c '^        toolName: ' "$materialized" || true)"
    [[ "$materialized_toolnames" == "$DELEGATION_COUNT" ]] \
      || fail "[$label] expected $DELEGATION_COUNT delegation toolName lines, found $materialized_toolnames"

    node "$VALIDATE_EXPLORE_MJS" "$DSH_NM_UNION" "$materialized" "$EXPLORE_PROVIDER" "$EXPLORE_MODEL" "$EXPLORE_DENY_JSON" "$EXPLORE_MAXDEPTH" \
      || fail "[$label] FACE A: explore row failed validation against the installed dsh-tool-subagent Config"
    composition_for_proofs="$materialized"
  fi
  echo "concerto-probe: [$label] content assertion face: $composition_source"

  # T12 (P-4, AC-6 negative-a): the deny list is not just valid config — it is
  # ENFORCED. scripts/prove-explore-toolfilter.mjs runs the installed dsh's
  # REAL child-composition path (dsh-subagent applyChildComposition →
  # tools.restrict → ToolRuntime view) against THIS materialized row and
  # asserts write/edit never reach the child scope's model-facing tool list
  # (schemas/get/execute all deny), while read/grep/glob and the platform
  # shell survive. A live model session closes the loop in T20.
  # P4.5-T6: the row it enforces is read from $composition_for_proofs — the
  # materialized file on FACE A (0.1.5) and the agentPresets/read content on
  # FACE B (0.2.x), i.e. the bytes the running host can actually see on the
  # runtime under test. Never hardcoded to the file: on 0.2.x that file has no
  # reader, so enforcing against it would prove nothing about the live mode.
  node "$REPO_ROOT/scripts/prove-explore-toolfilter.mjs" "$DSH_NM_UNION" "$composition_for_proofs" \
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
  # P4.5-T6: same face-derived input as the T12 proof above.
  node "$REPO_ROOT/scripts/prove-explore-maxdepth.mjs" "$DSH_NM_UNION" "$composition_for_proofs" \
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
  # come from the llm-deepseek entry config + the llm-pi-ai second --patch
  # overlay seed above,
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
    # T10a review MINOR 1: the old wording ("…although all $DISTINCT_PROVIDER_COUNT
    # route providers ARE registered in this sandbox") was honest only while the
    # seed was the racing settings.yaml import — "registered, just late" was then
    # the truth. After T10a the seed is structural (a --patch overlay composed
    # into the row BEFORE mount), so if this marker fires the providers are NOT
    # all registered and the clause would lie to whoever reads the failure. The
    # message now reports only what this boot actually establishes, and keeps the
    # two states distinguishable with observed evidence: the provider directory
    # ($llm_resp, fetched while the server was live) lists the named provider
    # active:true ⟺ the route registered LATE (after the settled check — the
    # pre-T10a shape); absent/inactive ⟺ genuinely not registered. Nothing else
    # would tell the operator either way: a patch row skipped by id/name drift is
    # SILENT at boot — the skip-warn sink is renderConfigDump
    # (dsh-app-boot/lib/index.js:3604), which emits only under --dump-config
    # (:3639, verified @ 0.2.0-rc.2).
    local missing_provider dir_state
    missing_provider="$(grep -m1 '\[omo-agents\] route provider not registered: ' "$boot_log" | sed -n 's/.*route provider not registered: \([^ ]*\).*/\1/p')"
    if grep -q "\"provider\":\"$missing_provider\"[^}]*\"active\":true" "$llm_resp"; then
      dir_state="'$missing_provider' IS listed active:true in the provider directory (fetched while the server was live) — the route registered, but AFTER the settled provider check: the seed regressed to a late-registration path"
    else
      dir_state="'$missing_provider' is NOT listed active in that directory — the route is genuinely not registered; check the seed row id/name in $LLM_SEED_PATCH against the base bundle row (a skipped patch row never warns at boot — only --dump-config shows it)"
    fi
    fail "[$label] 'route provider not registered' fired for '$missing_provider' — $dir_state"
  fi
  if grep -q '\[omo-agents\] route provider check FAILED' "$boot_log"; then
    fail "[$label] route provider check FAILED — see line above"
  fi

  # T14 runtime half → P2-T20(d): EVERY distinct provider the 11 roster routes
  # use holds a REGISTERED route at runtime — the sisyphus seat's provider from
  # the llm-deepseek adapter's entry config, the explore seat's provider from
  # the llm-pi-ai adapter via the second --patch overlay seeded above. The provider
  # set is resolved from src/model-routes.ts ($ROUTE_PROVIDERS, roster order),
  # so a future third seat is covered automatically. Registration is the gate;
  # no live model call is made (no API keys in the sandbox). The explicit
  # sisyphus/explore greps below stay as the named T14 evidence.
  grep -q "\"provider\":\"$SISYPHUS_PROVIDER\"[^}]*\"active\":true" "$llm_resp" \
    || fail "[$label] sisyphus provider '$SISYPHUS_PROVIDER' not ACTIVE in the provider directory (llm-deepseek adapter registration broken?)"
  grep -q "\"provider\":\"$EXPLORE_PROVIDER\"[^}]*\"active\":true" "$llm_resp" \
    || fail "[$label] explore provider '$EXPLORE_PROVIDER' not ACTIVE in the provider directory (llm-pi-ai patch-overlay seed registration broken?)"
  local route_provider
  while IFS= read -r route_provider; do
    [[ -n "$route_provider" ]] || continue
    grep -q "\"provider\":\"$route_provider\"[^}]*\"active\":true" "$llm_resp" \
      || fail "[$label] route provider '$route_provider' (used by the $ROSTER_SIZE roster routes) is NOT active in the provider directory"
    echo "concerto-probe: [$label] P2-T20(d) route provider active: $route_provider"
  done <<< "$ROUTE_PROVIDERS"
  # Publish the face this boot asserted on, for the top-level PASS banner.
  LAST_COMPOSITION_SOURCE="$composition_source"
}

# P5-T10 — the ABSENCE leg (canary discipline, the negative anchor of the
# team face): a profile that installs only the THREE non-team plugins cannot
# mount the fourth cordis.yml insert row — and the host must say so LOUDLY
# and BY NAME. Measured verbatim on the pinned dsh 0.2.0-rc.2 (this is the
# host-owned degradation pair the validator asserts present):
#   dsh: warning: 1 entry did not activate
#   omo-team (@oh-my-opendsh/omo-team): failed to import
# and the readiness line NEVER appeared in the measurement boot (the failed
# row never serves — reported below, not asserted: loudness is the discipline,
# availability is the host's). The SAME validator script whose `present` face
# runs inside boot_once runs `absent` here — the bidirectionality is by
# construction, and its --self-test (below, before any spawn) proves every
# negative check fires on a fabricated leak.
boot_absent_once() {
  local label="noteam"
  local boot_log="$SANDBOX/boot-$label.log"
  echo "concerto-probe: [$label] installing ONLY the three non-team plugins into profile 'noteam' (the fourth row must fail LOUD)"
  local plugin
  for plugin in omo-agents omo-hooks omo-commands; do
    timeout "$INSTALL_TIMEOUT_S" dsh plugin --profile noteam add \
      "$REPO_ROOT/patches/omo-dsh/$plugin" >>"$ADD_LOG" 2>&1 \
      || fail "[$label] dsh plugin add (noteam/$plugin) failed (see $ADD_LOG)"
  done
  echo "concerto-probe: [$label] booting dsh --profile noteam --patch ./cordis.yml --port 0 $NO_OPEN (omo-team deliberately absent)"
  # shellcheck disable=SC2086
  dsh --profile noteam --patch ./cordis.yml --port 0 $NO_OPEN >"$boot_log" 2>&1 &
  local dsh_pid=$!
  # Bounded park on the NAMED degradation line (not on readiness — this boot
  # is expected never to serve). If the host exits early instead, that is
  # also a loud form; the validator reads whatever the log holds.
  local seen=0
  for ((i = 0; i < READY_TIMEOUT_S; i++)); do
    if grep -qF 'failed to import' "$boot_log" 2>/dev/null; then seen=1; break; fi
    if ! kill -0 "$dsh_pid" 2>/dev/null; then break; fi
    sleep 1
  done
  if [[ "$seen" != "1" ]] && kill -0 "$dsh_pid" 2>/dev/null; then
    echo "concerto-probe: [$label] named degradation line not seen within ${READY_TIMEOUT_S}s — reporting the log head before teardown" >&2
    head -40 "$boot_log" >&2 || true
  fi
  kill -TERM "$dsh_pid" 2>/dev/null || true
  wait "$dsh_pid" 2>/dev/null
  local rc=$?
  echo "concerto-probe: [$label] dsh exited rc=$rc after TERM (host's own exit code, reported not asserted)"
  if grep -qE 'http://127\.0\.0\.1:[0-9]+' "$boot_log"; then
    echo "concerto-probe: [$label] NOTE: this boot DID reach readiness without omo-team (host half-mounts; loudness still asserted below, availability is not this leg's discipline)"
  else
    echo "concerto-probe: [$label] never reached readiness (the measured rc.2 shape: the failed row never serves)"
  fi
  node "$ASSERT_TEAM_PROBE_FACE_MJS" absent "$boot_log" \
    || fail "[$label] P5-T10 team ABSENCE face failed — an absent omo-team must be LOUD and NAMED (validator output above)"
  echo "concerto-probe: [$label] P5-T10 absence face PASS — host named the inactive row, zero [omo-team] markers"
  # P6-T5 PRESENCE leg on the THIRD boot too (ARBITRATION-r1 B-MINOR-3). The
  # noteam profile installs only three plugins, and that is exactly why this leg
  # belongs here: omo-lsp is the FIFTH cordis.yml insert row and is
  # **dsh-bundled** (@deepseek-ai/dsh-mcp-client ships inside the installed dsh —
  # there is NO `dsh plugin add` step for it to skip, unlike omo-team above). So
  # removing plugins from the profile is not, by itself, a reason for the lsp row
  # to go quiet: it must still mount and still announce over the same awk-derived
  # marker. If this fails it is not a flake to be silenced — it would mean the
  # bundled fifth row's mount depends on a sibling repo-published row being
  # installed, a real composition fact nobody has measured, and the first place it
  # would surface is this line.
  grep -qF "$EXPECTED_LSP_STARTING_MARKER" "$boot_log" \
    || fail "[$label] the omo-lsp stdio child went silent under the noteam profile — the FIFTH cordis.yml insert row is dsh-bundled (@deepseek-ai/dsh-mcp-client), needs NO install step, and should still mount and announce here even with omo-team deliberately absent; want the awk-derived announcement [$EXPECTED_LSP_STARTING_MARKER] from vendor/lsp-core/src/cli.ts in $boot_log"
  echo "concerto-probe: [$label] P6-T5 omo-lsp PRESENCE leg PASS — the bundled fifth row announced with no install step of its own"
}

# P5-T10: hermetic defect legs BEFORE any spawn (drive.mjs runAnalysisSelfTest
# precedent) — the fabricated GOOD log of each team face must PASS and every
# fabricated defect must FAIL on its OWN named check, so the two live faces
# below (and the noteam absence boot) cannot go green on assertions that lie.
echo "concerto-probe: P5-T10 team-face self-test (hermetic, no spawn)"
node "$ASSERT_TEAM_PROBE_FACE_MJS" --self-test \
  || fail "P5-T10 team-face self-test failed — the probe's own team assertions are lying"

# Boot 1: fresh sandbox — the preset is materialized.
boot_once fresh materialized
# Boot 2: SAME sandbox $DSH_HOME — re-registration must be a content-identical
# no-op and the roster must stay correct (idempotence proof).
boot_once again unchanged
# P5-T10 Boot 3 (negative anchor): profile 'noteam' WITHOUT omo-team — the
# fourth row fails LOUD and BY NAME, zero [omo-team] markers (canary).
boot_absent_once

echo "concerto-probe: PASS (dsh $(dsh --version)): 协奏模式 / Concerto Mode registered at roster level (P4.5-T6 row vocabulary: the 0.2.x roster row is isDefault:false with trust/broken ABSENT over the {presets:[…]} roster RPC envelope, the 0.1.5 leg keeps its genuine trust:"user"; name from our preset.yml; the boot roster line prints concerto:broken=absent and NEVER the pre-T6 concerto:? placeholder, with an explicit EMPTY token if the roster read came back empty) via apply-time authoring; observable over the web roster RPC (transport-adaptive T9: /api/agentPreset.list on rc.6, /api/agentPresets/list through the token-authenticated Typert Remote gateway on 0.1.2); persona = assembled omo-sisyphus system prompt (sentinel rendered, 3 section markers in the composition ON THE ASSERTION FACE UNDER TEST — $LAST_COMPOSITION_SOURCE — and no __OMO_ residue on that face); omo-hooks mounted as the second insert row with the FULL $EXPECTED_HOOK_COUNT-hook port roster registered at boot (source-derived summary marker + one registered marker per manifest row, $EXPECTED_HOOK_COUNT lines, with the src/hooks file set proven equal to the manifest id set, and NO hook FAILED / manifest-validation-FAILED line — both boots); omo-commands mounted as the third insert row with its source-derived summary marker ($EXPECTED_COMMANDS_SUMMARY, $EXPECTED_COMMANDS_REGISTERED_COUNT registered command lines, derived from the manifest's own ported rows — P4-T16 replaced the stale "at P4-T3 = 0 since all six rows are pending", which has been false since T6) and NO command FAILED / manifest-validation-FAILED line (both boots); omo-commands skills mounted as the third insert row's second mechanism with its source-derived summary marker ($EXPECTED_SKILLS_SUMMARY) and NO \`skill … FAILED\` line (both boots); hard-blocks injection listener registration observable at boot (agent/pre-step marker, both boots); omo-explore persona assembled at boot (1 section marker, both boots; subagent artifact — T11 binds it as the tool-subagent persona config); T14 dual routes resolved (sisyphus=$SISYPHUS_PROVIDER/$SISYPHUS_MODEL explore=$EXPLORE_PROVIDER/$EXPLORE_MODEL) with BOTH providers active in the provider directory (transport-adaptive T9: /api/llm.providers on rc.6, llm/listProviders joined with llm/listConfigurableProviders on 0.1.2); T11 explore delegation tool bound (toolName=explore, sentinels rendered, persona+route in the row on the assertion face under test, pre-declared toolFilter/maxDepth) and the row VALIDATED against the installed dsh-tool-subagent Config (eager run of the schema dsh applies lazily at session composition); T12+F1 toolFilter deny=roster-computed 12-name list (write/edit + all 10 delegation toolNames, roster order; the schema gate and BOTH content faces derive it from src/roster.ts, P2-T15 shape) PROVEN enforced via the real child-composition path (applyChildComposition → tools.restrict → child scope view excludes write/edit and every delegation tool, execution UNKNOWN_TOOL, read/grep/glob/shell retained, parent untouched); T13 maxDepth=$EXPLORE_MAXDEPTH (roster-derived; target-row semantics D-2026-09-13-01) PROVEN enforced via the real delegation start path (depth-1 parent's call PASSES the gate — the atlas(1) → worker(2) re-delegation path; depth-2 parent rejected on BOTH foreground and continuable starts with errored tool result "Error: subagent depth 3 exceeds maxDepth 2", tool stays visible at the cap, depth-0 control passes); P2-T20 roster boot contract (all $DELEGATION_COUNT 'persona assembled' lines from src/roster.ts; the ONE $ROSTER_SIZE-field route summary line in roster order; the three non-blocking warning forms ABSENT in the seeded sandbox with the summary line as non-vacuity guard; all $DISTINCT_PROVIDER_COUNT distinct route providers active:true over the transport-adaptive provider RPC; per-row toolName/deny/allow/maxDepth checks generalized from the P2-T15 explore pins, uniform roster maxDepth=$UNIFORM_MAXDEPTH — TWO faces written separately with NO fallback between them: FACE A (0.1.5) verbatim line greps of the materialized file including its flow-sequence deny/allow pins, FACE B (0.2.x) the agentPresets/read document PARSED and compared ELEMENT-WISE against src/roster.ts, because content is a yaml.dump() of the parsed entry list where flow sequences expand to block sequences and redundant quotes drop); idempotent re-boot confirmed; omo-hooks plugin mounted (second cordis.yml insert row) with its manifest summary boot marker AND its per-hook registered markers matching the plugin's own manifest.ts + boot-markers.ts + src/hooks file set (P3-T3/P3-T5); omo-commands plugin mounted (third cordis.yml insert row, P4-T3) with its summary boot marker and per-command registered markers matching the plugin's own manifest.ts + boot-markers.ts + COMMAND_REGISTRARS; omo-team mounted as the fourth insert row with its source-derived summary marker ($EXPECTED_TEAM_SUMMARY, $EXPECTED_TEAM_REGISTERED_COUNT registered team-surface lines) and NO FAILED / manifest-validation-FAILED line (both boots); omo-lsp mounted as the FIFTH cordis.yml insert row (the dsh-bundled @deepseek-ai/dsh-mcp-client, no install step, \`failOnStartupError:false\` so a dead LSP child cannot fail this boot) — its mount proof is therefore the stdio child's OWN stderr announcement, grepped as the awk-derived full value $EXPECTED_LSP_STARTING_MARKER read straight out of patches/omo-dsh/vendor/lsp-core/src/cli.ts (P6-T5: the same four steps tests/e2e/fixtures/lsp-double-constants.mjs's deriveLspMcpStartingMarker performs in JS, run here by an INDEPENDENT awk reader over one shipped literal, both values printed above so the cross-check is auditable; scripts/cold-start.sh:215-223 is the third reader, hand-copied prefix), present in ALL THREE boots (normal + re-boot + noteam — the third is the one that proves the dsh-bundled fifth row needs no installed sibling); P5-T10 team face TWO-WAY via scripts/assert-team-probe-face.mjs (defect-self-tested with 17 named legs BEFORE any spawn): PRESENCE on both normal boots — team_create/team_send_message/team_status registered lines BY NAME + the state machine's own boot answer line, its shape DERIVED from the shipped formatTeamBootResumeLine (five counters, exactly once, errors=0, no loud form); ABSENCE on the deliberate noteam boot — the host names the inactive fourth row LOUD (dsh: warning: 1 entry did not activate + omo-team (@oh-my-opendsh/omo-team): failed to import, the rc.2 measurement) with ZERO [omo-team] markers of any shape; P6-T9 COMPOSITION FACE (no spawn, the same two patches the boot uses) — the EDIT face fork (E-A) \`dsh-tool-fs\` and the WEB face fork W \`dsh-tool-web\` rows are each present AND LIVE under preset-standard’s plugin list — not a top-level \`disabled: true\` placeholder, which composition adds to those top-level rows and which bare presence would have waved through — and the web provider selection (searchProvider/fetchProvider) is asserted on the HOST'S OWN column-zero \`- id: web\` row, because that row occurs exactly once at column zero and preset-standard’s live plugin list holds no \`web\` row at any indent, measured on the composed dump; every expectation derived at run time from $COMPOSE_BASE_PATCH and every check printed; and the ast-grep face (G) recorded as three sub-faces with three owners: G1 registration via the derived $EXPECTED_HOOK_COUNT hook roster, G2 the ast-grep skill via $EXPECTED_SKILLS_SUMMARY, G3 the provision path EXPLICITLY NOT asserted here because neither this probe nor cold-start.sh creates a session; and the EDIT/WEB legs are read off the composed tree with their load-bearing absences ASSERTED by name — web-face-absent-from-preset counts \`- id: web\` at any indent inside preset-standard's live plugin list, and every live-row check rejects a row carrying its own \`disabled:\` key"
exit 0
