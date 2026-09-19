#!/usr/bin/env node
// tests/e2e/drive.mjs — T18 (MVP PRD §8 L2 driver; report §14.4.4-14.4.5,
// §14.5): the scenario driver. Boots a REAL dsh (web profile, real
// composition, real adapters — `dsh --profile web --patch ./cordis.yml`) in a
// hermetic mkdtemp sandbox with the T17 mock-LLM server answering both model
// routes, runs ONE scenario end-to-end over the web profile's own HTTP RPC
// surface, asserts on the session JSONL + the mock's recorded requests, and
// prints a machine-parseable verdict JSON on stdout:
//   {result:"PASS"|"FAIL", scenarios:[...]}
// (report §14.4.5 — CI parses stdout; all diagnostics go to stderr).
//
// P3-T3: the root cordis.yml now inserts TWO plugin rows (omo-agents +
// omo-hooks), so stage 0 installs BOTH packages into the sandbox profile
// (PLUGIN_DIRS) and `pluginLoaded` asserts BOTH load markers. The seven
// scenarios themselves are unchanged — the hooks plugin registers no listener
// yet (empty implementation registry), so it only adds its summary boot marker.
// (P3-T6 amended that last clause: omo-hooks now registers its FIRST listener
// and the chain carries EIGHT scenarios — see the C-mode pilot section below.)
//
// SEMANTIC SOURCE (read-only reference; fresh implementation, no code copied):
//   oh-my-openagent/packages/omo-senpi/scripts/qa/drive.mjs:66-89 — mkdtemp
//     sandbox {project, agent, xdg, home} + env override pattern.
//   oh-my-openagent/packages/omo-senpi/scripts/qa/plan-gated-agents-e2e.mjs
//     :21,43-67 — credential digest before/after with a HOST_VOLATILE_*-style
//     allowlist for legit host churn; any byte change → overall FAIL.
// Deliberate dsh deltas: the credential surface is ~/.dsh (not ~/.senpi/agent)
// and the volatile allowlist is PATH-based (sessions/, storages/ — the host's
// own dsh writes live session JSONL + caches there continuously) because dsh's
// settings.yaml has no proven per-key churn today.
//
// ── HEADLESS-SESSION CRUX DECISION (plan T18, documented per the task brief)
// Two candidate drive paths were investigated against the installed rc.6
// (read-only) and rc.7 source:
//   (a) `dsh --profile headless "task"` — REJECTED: the headless runner
//       (dsh-headless/lib/index.js:63-99) creates an Agent directly through
//       the core registry on the agent-default-model route and NEVER consults
//       the preset roster ("This bundle composes no preset roster" —
//       deepseek-harness rc.7 packages/bundle/headless/src/index.ts:107, same
//       behavior in rc.6). There is no preset/mode CLI flag. Concerto mode is
//       unreachable headlessly.
//   (b) CHOSEN: web profile RPC — POST /api/session.create with
//       payload {cwd, agentPreset:"concerto"} (schema: dsh-host-apiproxy
//       lib/types/api/sessions.d.ts:259-267; zod sessions.schema.d.ts:55-61),
//       then POST /api/session.prompt {sessionId, mode:"queue", content:
//       [{type:"text", text}]} (sessions.d.ts:365-376; impl index.js:2822-2872
//       queue → agent.followup). Envelope {type:"client-request", rpcId,
//       method, payload} (rpc.d.ts:227-231); response {type:"server-response",
//       rpcId, result:{ok:true,value}|{ok:false,error}} (rpc.d.ts:197-201).
//       Completion is observed on the SESSION JSONL on disk (turn/end with
//       reason.kind "completed") — the same artifact the assertions read, so
//       observation and assertion share one channel.
//
// ── TRANSPORT-ADAPTIVE RPC (T9; rc.6 stays the committed pin) ──
// The driver speaks BOTH web-RPC transports, chosen by the readiness line:
//   rc.6  — `dsh web: http://127.0.0.1:<port>` (no query). FLAT endpoints
//           (/api/session.create, /api/session.prompt, /api/llm.providers)
//           with the envelope above and NO auth token: the /api trust fence
//           is a loopback Host-header check only, "not an auth layer"
//           (dsh-client-connection/lib/index.js:106-215).
//   0.1.2 — `dsh web: http://127.0.0.1:<port>/?token=<launch-token>`
//           (browser-auth.ts TOKEN_QUERY). Every /api call needs the
//           authority-bound dsh-auth-* cookie minted by
//           GET /?token=<launch-token> → 303 + Set-Cookie
//           (browser-auth.ts:240-282; a query token on /api itself → 401).
//           The flat endpoints are GONE (404 even authenticated); the client
//           now rides the Typert Remote projection over the SAME envelope:
//           POST /api/<namespace>/<method> with payload {args:{…}}
//           (docs/api-gateway.md:121; api/gateway/src/index.ts:945-960).
//           Mapping (assertion strength unchanged):
//             llm.providers  → llm/listProviders + llm/listConfigurableProviders,
//               joined by the Web UI's own rule (joinProviderDirectory,
//               ui-settings-models/src/client/store.ts:49-73): active ⟺ the
//               provider id is a registered route — the exact join rc.6's
//               llm.providers performed server-side.
//             session.create → session/create, args {request:{cwd,agentPreset}}
//             session.prompt → session/prompt, args {request:{requestId,…}}
//
// ── MOCKROLE DELIVERY (T17's role marker must reach a SYSTEM message)
// Workspace instruction files (AGENTS.md) are injected as USER-role
// <system-reminder> messages (dsh-agent-instructions/README.md:17,47) —
// invisible to the mock server's system-message scan. Instead the driver
// appends `MOCKROLE=<role>` to the PERSONA block scalar of the MATERIALIZED
// preset ($DSH_HOME/.agent-presets/concerto/agent.cordis.yml) AFTER boot sync
// and BEFORE session.create: dsh-agent-presets reads the composition file at
// mount time (readComposition → readFile(preset.path), lib/index.js:334) and
// ensureStanding re-stamps the file on every use (:1130-1160), so the edit is
// honored. The persona IS the system prompt (T8), so the marker rides the
// real prompt-assembly path. The mock's recorded requests[] prove delivery.
// T19 generalized the delivery to BOTH persona scalars of the same file
// (MOCKROLE_BLOCK_SCALARS): the conductor persona row (`prefix: |-`, content
// indent 6 — src/system-prompt.ts renderPersonaIntoComposition) and the T11
// explore tool-subagent row (`persona: |-`, content indent 10 —
// src/concerto-preset.ts renderExplorePersonaIntoComposition). The marker is
// what lets the mock select that role's sub-script when the CHILD loop's
// requests arrive (the child inherits the persona from its tool config, so the
// marker rides the spawn provider's persona shadowing). P2-T18 turns that
// two-entry registry into the roster-wide one described in the T18 section
// below.
//
// ── T19 DEMO SCENARIO (FR-7, AC-4; plan task 19): "concerto-delegation-demo"
// The scripted dummy demo (PRD §2.2 — an ORCHESTRATED task, no real
// engineering problem): user asks "这个仓库的 README 讲了什么" and the FULL
// delegation chain is scripted through the two mock roles:
//   sisyphus step 1 → tool_call `explore` {description, prompt,
//     run_in_background:false} (the T11 binding's real parameter schema,
//     dsh-tool-subagent/lib/index.js:142-158) — foreground so the result
//     returns inside the same parent turn;
//   explore step 1  → tool_call `read` {file_path: <sandbox README>} (the
//     dsh-tool-fs read tool the explore child inherits from the parent roster
//     minus the T12 deny [write,edit]);
//   explore step 2  → text EXPLORE_FINDINGS (child turn settles);
//   sisyphus step 2 → text SISYPHUS_SUMMARY (parent turn/end).
// The driver seeds a fixture README into the sandbox project and asserts the
// four-event chain IN ORDER (report §14.4.4 — BUSINESS outcomes, not "the
// LLM called tool X"): (1) the explore tool_call in the parent JSONL, (2) the
// child session ran on the explore route AND the README bytes reached the
// explore model (the read tool result is verbatim in the next mock request),
// (3) the findings returned to sisyphus (parent tool/result AND they are
// verbatim in the parent's next mock request), (4) the summary text. The T16
// hard-blocks injection is reported as a BONUS observation (T20 owns AC-6).
//
// ── T20 ASSERTION-LAYER CLOSURE (AC-5/AC-6/AC-7; plan task 20) ──
// AC-5 lives in analyzeDemo as three named checks read off the LATEST
// request/header of BOTH session logs (T15 contract; a foreground one-shot
// child's descriptor omits the route — T19 note): the parent's route IS the
// sisyphus route, the child's IS the explore route, and the two DIFFER.
// AC-6 closes the T12/T13 e2e negatives as two DEDICATED scenarios (the demo
// scenario's semantics stay clean):
//   explore-write-denied (AC-6a): the mock scripts the explore child
//     hallucinating a `write` tool_call — write is NOT advertised (the T12
//     toolFilter deny is asserted on the child's request/header tools array)
//     — and the REAL tool runtime's errored tool result is asserted verbatim:
//     'Error: unknown tool "write"' (dsh-tools ToolNotFoundError :2428 +
//     toolErrorResult :3472-3482 of the installed rc.6), plus the business
//     outcome that the target file never appears on disk.
//   explore-nested-delegation-denied (AC-6b): the mock scripts the explore
//     child (depth 1) calling `explore` again; since the F1 hardening
//     (2026-09-04) the deny list includes the delegation tool itself, so the
//     child is NEVER offered `explore` and the call is rejected as an unknown
//     tool — asserted verbatim: 'Error: unknown tool "explore"' (dsh-tools
//     ToolNotFoundError + toolErrorResult wrap), the tool's ABSENCE from the
//     child's advertised list is asserted (the stronger AC-6b property:
//     physically cannot delegate, not merely depth-capped), and no session
//     with parentSession = the child id may exist. The T13 depth cap
//     (maxDepth 2 on every delegation row since D-2026-09-13-01) stays as
//     defense-in-depth; its enforcement semantics are
//     source-proven by scripts/prove-explore-maxdepth.mjs.
// AC-7: every scenario verdict carries `assertions` (the check names, in
// order) alongside `checks`/`failed`, and the overall verdict stays
// CI-parseable {result:"PASS"|"FAIL", scenarios:[...]} on stdout.
// Mutation QA (plan T20 failure half) is hermetic in runAnalysisSelfTest:
// swapped routes input / collapsed equal routes (the model-route input
// mutation), a fabricated log without the unknown-tool error, and one
// with the delegation tool still present each FAIL on their own named check.
//
// ── P2-T18: MOCKROLE GENERALIZATION + THE ROSTER PARADE (plan §4.7, R-6) ──
// Phase 2 grew the preset from 1 delegation row to 10, and the pre-P2 mock-role
// registry could not express that: MOCKROLE_BLOCK_SCALARS hardcoded TWO block
// scalars and used `persona: |-` as explore's needle. After P2-T15 the
// materialized composition carries TEN `persona: |-` headers (one per
// delegation row), so that needle stopped being unique and String.replace's
// first hit could stamp the marker into the WRONG row — a silent e2e lie
// (plan §6 R-6). The registry is now ROSTER-DRIVEN: ids come from roster.ts
// (the same type-stripping import model-routes.ts already uses) and each
// role's needle is its ROW-ID ANCHOR (`- id: tool-subagent-<id>`, unique in
// the materialized file). The marker is inserted as the FIRST content line
// under that row's block scalar — `persona: |-` at 10-space content indent for
// delegation rows, `prefix: |-` at 6 for the conductor — which keeps
// mock-llm-server.mjs `detectRole`'s "first system message carrying
// MOCKROLE= wins" contract intact: the child's persona IS its first system
// message. Unknown roles still throw, and the injection stays idempotent
// (line-anchored match, so `MOCKROLE=sisyphus` can never satisfy
// `MOCKROLE=sisyphus-junior`).
//
// THE roster-parade scenario then answers the Phase 2 exit criterion (a) for
// the WHOLE roster in one run. The sandbox env distributes the 10 delegation
// agents over the 7 REAL catalog route pairs (plan §4.7): dsh-llm-deepseek's
// DEFAULT_MODELS ids (deepseek-flash / deepseek-v4-flash / deepseek-v4-pro /
// deepseek-v4-flash-vision-exp) and pi-ai's builtin deepseek ids
// (deepseek-v4-pro / deepseek-v4-flash / deepseek-v4-flash-vision-exp).
// NO fake ids: a session-controller `model-unavailable` is the only thing a
// fake id would trip, and the deepseek adapter does not validate model ids at
// request time under a mock baseURL — so a fake id is mechanically feasible,
// which is exactly why it would hollow out the assertion: "route observable"
// would stop meaning "route really servable" (plan §4.7, H-5). The mock scripts are keyed by ROLE
// (MOCKROLE=<agent>), not by model: the conductor emits all 10 delegation
// tool calls inside ONE assistant message (the mock's `tool_calls` step), each
// child answers its own script, and the conductor summarizes. Asserted: (a)
// ten child session logs, one per role; (b) every child's session-log
// request/header route equals its env-configured seat (the AC-5 pattern
// generalized per child — the per-child details ride the verdict JSON); (c)
// the T16 hard-blocks injection observed in a NEW agent's child; (d) Q-4 — 10
// parallel foreground delegations all dispatched. Q-4's resident-continuable
// concern is recorded honestly in the verdict (`paradeObservation`): the
// installed dsh-subagent has no numeric resident cap (only the depth gate),
// the agent loop's `maxParallelToolCalls` default is 10, and the parade uses
// `run_in_background: false`, so the children are foreground one-shot children
// and the resident-continuable path is deliberately not exercised; the parade
// ran as ONE batch (no batching fallback needed).
//
// ── P2-T19: READ-ONLY REPRESENTATIVE + THE POSITIVE NESTED CHAIN (plan §4.7) ──
// Two scenarios extend the AC-6 family to the Phase 2 roster:
//
// plan-reviewer-write-denied (AC-6a generalized to a NEW read-only row). The
// mock scripts the plan-reviewer child HALLUCINATING a `write` tool_call, and
// the scenario asserts the WHOLE read-only class contract on that child: write
// AND edit are physically absent (the mutation half of denyToolNamesFor), ALL
// TEN delegation toolNames are physically absent too (the F1 half — a read-only
// child must not even see another agent's delegation tool), the hallucinated
// call is rejected by the REAL runtime verbatim ('Error: unknown tool "write"',
// the same ToolNotFoundError → toolErrorResult contract explore-write-denied
// pins), the target file never lands on disk, and the child ran on its OWN
// env-pinned seat (OMO_PLAN_REVIEWER_{PROVIDER,MODEL}, a real catalog pair,
// distinct from the conductor's seat — so "configured seat" is not satisfied by
// coincidence). plan-reviewer is the roster's designated read-only exemplar
// (ROADMAP via phase2-roster.md §2.6).
//
// atlas-nested-delegation (the POSITIVE chain, plan §4.5 point 3): conductor →
// atlas (depth 1) → explore (depth 2), with atlas — the ONE row that keeps the
// delegation tools (no toolFilter; maxDepth 2) — calling the `explore` tool,
// which is advertised to it (unlike every read-only/worker child). The chain
// asserts: the depth-1 atlas child ran on its own env-pinned seat; atlas
// advertises ALL TEN delegation toolNames; the depth-2 grandchild session
// really exists under atlas with delegationDepth 2, on the explore seat, having
// answered its own script; the four-leg chain is observed in order in BOTH
// channels (session-log seq + mock arrival order); and the read-only grandchild
// PHYSICALLY LACKS write/edit and all ten delegation tools.
//
// ⚠️ 对照语义注意 (plan §4.7): the F1 hardening (2026-09-04) made the OLD
// explore-nested-denied scenario assert the delegation tool's PHYSICAL ABSENCE
// ('Error: unknown tool "explore"'), NOT the T13 maxDepth error text — the
// depth gate no longer fires there. The positive chain is the mirror image of
// that same semantics: it asserts a SUCCESSFUL depth-2 dispatch (a real
// grandchild, findings flowing back up), and the read-only absence claim is
// re-asserted on the GRANDCHILD rather than any depth error. No assertion in
// this file copies the retired maxDepth rejection shape.
//
// ✅ P2-T19 RESOLVED (2026-09-13, arbiter D-2026-09-13-01; was the WITHHELD
// blocker): the positive chain initially COULD NOT succeed on the then-committed
// composition. dsh's depth gate is resolveChildDepth(parent, request.maxDepth)
// where request.maxDepth is the INVOKED row's `config.maxDepth` (tool-subagent
// folds its own config at execute: installed 0.1.5-rc.1 lib/index.js:508-519;
// subagent gate: lib/index.js:432-438 — the same path
// scripts/prove-explore-maxdepth.mjs pins). With the old per-class caps
// (explore/worker/allowlist = 1, atlas = 2), a depth-1 atlas calling the
// `explore` row was rejected verbatim with 'Error: subagent depth 2 exceeds
// maxDepth 1' BEFORE any child existed, and no depth-2 session log was written.
// The runtime evidence drove the correction: all TEN delegation rows now carry
// maxDepth 2, so the chain cap is 2 levels (conductor 0 → atlas 1 → worker 2),
// depth 3 is structurally impossible, and atlas→worker is admitted exactly as
// plan §4.4/§4.5 intended. The scenario is therefore ENABLED in the default
// SCENARIOS chain (previously it was withheld and reachable only through
// DSH_E2E_ONLY); the F1 deny lists remain the primary nested-delegation guard
// and the depth gate is defense-in-depth behind them.
//
// ── P3-T6: bash-read-guard-warned — THE C-MODE PILOT (plan §4.2 模式 C) ──
// P3-T5 landed omo-hooks' FIRST listener (H-02): OMO's bash file-read advisory
// as ONE `tools/post-execute` waterfall listener returning
// `{kind:'accept', additionalContexts:[<user message>]}`. The upstream hook was
// an ADVISORY, not a block (`output.message = WARNING_MESSAGE`; the command
// still ran) and DSH's pre-execute has no advisory channel, so the semantic
// landing is post-execute + additionalContexts. This scenario is the e2e
// template every later 劝导演出型 hook copies, and it asserts the whole chain
// against RUNTIME-OBSERVED carriers (no "理论应在" field):
//
//   语义. One assistant message carries THREE tool calls (the mock's
//   `tool_calls` primitive), so the batch is a single step:
//     (1) bash `cat <fixture>`               → the trigger;
//     (2) bash `cat <fixture> | grep <词>`    → 对照① (a pipeline is NOT a
//         "simple file read": the transcribed `[^\s|&;]+` class refuses it);
//     (3) read {file_path: <fixture>}         → 对照② (a different tool).
//   The conductor then sends ONE summary text (request #2). Fixture =
//   <sandbox>/project/notes.txt with two distinct content markers, so each
//   call's result is separately provable: `cat` returns both lines, the
//   pipeline returns ONLY its grep-target line (byte-level proof the pipeline
//   really ran), `read` returns the line-numbered text.
//
//   ⚠️ 劝导注入的实际观测载体 (measured, one kept sandbox; seq = real layout).
//   The advisory is durable on TWO event types, both carrying the SAME message
//   id — this is why the "exactly once" count is scoped PER EVENT TYPE, never
//   a raw text count over the file:
//     * seq 17 `agent/inbox/spliced` data.target "next-step",
//       data.inserted[0] = {id:<uuid>, role:"user", content:[{type:"text",
//       text:<WARNING_MESSAGE>}], source:{kind:"plugin", plugin:"omo-hooks",
//       form:"notice"}} — the ACCEPT itself (dsh-agent-loop/lib/index.js:578
//       acceptContext → inbox.splice → append :206). It lands BETWEEN the
//       trigger's tool/result and the batch's remaining tool/calls, because
//       runGroup commits results in model order.
//     * seq 25 `user/message` with the identical id/role/content/source — the
//       same message CLAIMED at the next step boundary and appended to history
//       (:1028), i.e. the carrier the next request is built from. seq 23 is the
//       follow-up `agent/inbox/spliced` (target next-step, inserted []) that
//       removes the claimed entry.
//   The message reaches the model: sisyphus request #2's recorded body
//   contains the advisory text verbatim.
//
//   断言面 (analyzeBashReadGuardWarned, all in verdict.assertions per AC-7):
//     (a) bashTriggerExecutedWithFixtureBytes — the trigger's tool/result is
//         present, isError !== true, and carries the fixture bytes (劝导非阻断);
//     (b) advisoryInjectedIntoSessionLog — a `user/message` whose content text
//         contains the advisory VERBATIM and whose source is the
//         {kind:'plugin', plugin:'omo-hooks', form:'notice'} triple (the text
//         and plugin name are imported from the shipped listener module, never
//         re-typed here);
//     (c) pipedCatRanWithoutAdvisory — 对照①;
//     (d) readToolRanWithoutAdvisory     — 对照②;
//     (e) advisoryInjectedExactlyOnce    — exactly ONE carrier of each type;
//         plus advisoryReachedNextModelRequest, mockSawBothSteps, turnCompleted,
//         and the usual plugin/provider/session-log givens.
//   (c)/(d) each combine "the call really ran, non-error, with its OWN bytes"
//   with the shared count === 1, so a second injection fails them too — the
//   negative is never a vacuous "nothing happened".
//
//   变异 QA (hermetic, runAnalysisSelfTest; the real runtime layout is the
//   fabricated GOOD fixture): a log with NO advisory injection FAILs on
//   advisoryInjectedIntoSessionLog; a DUPLICATED injection FAILs on
//   advisoryInjectedExactlyOnce; an isError trigger result FAILs on
//   bashTriggerExecutedWithFixtureBytes.

// ── LLM WIRING (sandbox $DSH_HOME/settings.yaml only; nothing touches the
// host). Both adapters are pointed at the mock with a dummy key:
//   llm-deepseek: {apiKeyEnv: DEEPSEEK_API_KEY, baseURL: <mock>/v1}
//     — settings namespace "llm-deepseek" maps 1:1 to the adapter Config
//       (dsh-llm-deepseek/lib/index.js:629,648-664; baseURL field :651;
//       effective baseURL = config.baseURL ?? $DEEPSEEK_BASE_URL ?? default,
//       :707 — the settings value wins).
//   llm-pi-ai: providers: <exploreRoute>: {apiKeyEnv, baseURL: <mock>/v1}
//     — namespace "llm-pi-ai" (dsh-llm-pi-ai/lib/index.js:1726), per-provider
//       profile field baseURL (:1367) → pi-ai Model.baseUrl (:1262-1266,1287).
//   agent-default-model: {provider, model} — pins the concerto main agent's
//     seat to the T14 sisyphus route (the preset deliberately leaves the model
//     route to the host; settings namespace agent-default-model,
//     dsh-agent-default-model/lib/index.js:12).
//   DEEPSEEK_API_KEY=mock-e2e is set in the SPAWNED env only (credential store
//   reads inherited environment first — dsh-base/cordis.patch.yml:82-86);
//   DEEPSEEK_BASE_URL is stripped from the spawned env so a host value can
//   never silently reroute around the settings override.
//
// ── SESSION JSONL (T15 layout): $DSH_HOME/sessions/<projectKey(cwd)>/
// <encodedSessionId>/session[.vN].jsonl — rc.6 wrote the bare name, session
// format v3 adds the generation (isSessionLogName matches both) —
// (dsh-session-persistence-jsonl logPath,
// lib/index.js:95-157; root wired by dsh-base/cordis.patch.yml:98-101
// `!!js dshHomePath('sessions')`). PRODUCTION DEFAULT IS ZSTD
// (DEFAULT_COMPRESSION, :733) — per T15's risk note the driver disables it via
// a second --patch overlay (the flag is repeatable, dsh/lib/bin.js:77) that
// REPLACES the persistence row config (replacement, not merge — dsh-base
// README Known Limitations) with the identical root expr + compression: none +
// packChunks: false (the T15 plaintext/unpacked layout, one event per line).
//
// ── CREDENTIAL ISOLATION (§14.5): sha256 digest of the REAL dsh home
// (~/.dsh, or $DSH_E2E_DIGEST_TARGET for the negative demo) BEFORE and AFTER
// the run; any byte change outside the volatile allowlist → overall FAIL even
// if the scenario PASSes. VOLATILE_PREFIXES = sessions/, storages/ — the
// host's own dsh writes live session JSONL and caches there on its own
// lifecycle, which cannot identify QA pollution (the OMO
// HOST_VOLATILE_SETTINGS_KEYS idea at path granularity).
//
// Usage:
//   node tests/e2e/drive.mjs               run ALL 8 scenarios (hello + demo +
//                                          the two AC-6 negatives + the P2-T18
//                                          roster parade + the P2-T19 read-only
//                                          representative + the P2-T19
//                                          positive nested chain, ENABLED
//                                          2026-09-13 by D-2026-09-13-01 +
//                                          the P3-T6 bash-read advisory pilot),
//                                          print verdict JSON
//   node tests/e2e/drive.mjs --self-test   run the analysis logic against
//                                          fabricated logs only (no spawn)
// Env:
//   DSH_E2E_DIGEST_TARGET  digest this dir instead of ~/.dsh (negative demo)
//   DSH_E2E_ONLY           comma-separated scenario names: run a subset (dev
//                          iteration knob; CI leaves it unset and runs ALL
//                          scenarios).
//   DSH_E2E_KEEP_SANDBOX=1 keep the sandbox for postmortem inspection
//   DSH_E2E_*_TIMEOUT_MS   boot / scenario / install budgets
//   DSH_E2E_DEMO_SKIP_EXPLORE=1  T19 failure QA: drop the explore role from
//                                the demo script — the delegation chain MUST
//                                break and the verdict MUST name link 2
// Exit: 0 on PASS, 1 on FAIL (and 1 if --self-test finds the analysis lying).

import { createHash, randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { startMockLlmServer } from './mock-llm-server.mjs'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
// The concerto/roster package — also the source of the template this driver
// renders for its own composition checks below.
const PLUGIN_DIR = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents')
// P3-T3: the root cordis.yml inserts one row per package, so a sandbox profile
// must carry BOTH before it can boot the overlay at all.
const HOOKS_PLUGIN_DIR = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-hooks')
const PLUGIN_DIRS = [PLUGIN_DIR, HOOKS_PLUGIN_DIR]
const PROFILE = 'web'
const CONCERTO_PRESET_ID = 'concerto'

/**
 * The load markers BOTH mounted plugins log at boot (P3-T3): omo-agents' plain
 * `loaded` line and omo-hooks' summary marker (`[omo-hooks] loaded: manifest 14
 * entries (…)` — the prefix is what boot_log.includes matches). A boot missing
 * either one means the corresponding cordis.yml insert row did not mount.
 */
const LOADED_MARKERS = ['[omo-agents] loaded', '[omo-hooks] loaded']

/** `pluginLoaded` for every analysis: both plugin rows really mounted. */
function pluginsLoaded(bootLog) {
  return LOADED_MARKERS.every((marker) => bootLog.includes(marker))
}

/**
 * The boot-log text the `--self-test` fixtures feed the analyses that assert
 * `pluginLoaded` (a real boot carries both markers).
 */
const FABRICATED_BOOT_LOG = LOADED_MARKERS.join('\n')

// The T14 routes are the single source of truth (P-8.6 type-stripping, the
// same import scripts/prove-route-logging.mjs uses).
const { resolveModelRoutes } = await import(
  new URL('../../patches/omo-dsh/omo-agents/src/model-routes.ts', import.meta.url).href
)
// P2-T18: the delegation role ids (and their row anchors) come from the
// roster — the SAME single source the template renderer walks — so the
// MOCKROLE registry can never drift from the rows it must address.
// P2-T19 additionally consumes DELEGATION_TOOL_NAMES: the read-only child's
// "all ten delegation tools are physically absent" claim and atlas's "keeps
// all ten" claim both have to be the roster's own list, never a restatement.
const { CONDUCTOR_ID, DELEGATION_ENTRIES, DELEGATION_TOOL_NAMES } = await import(
  new URL('../../patches/omo-dsh/omo-agents/src/roster.ts', import.meta.url).href
)
// P3-T6: the bash-read advisory under test, read from the SHIPPED listener
// module — the same type-stripping single-source discipline as
// model-routes.ts/roster.ts above. The e2e must assert the text the listener
// really emits, never a second hand-copied literal that could drift from it
// (the H-02 unit test pins that literal against upstream; this scenario pins
// that the literal really reaches the model).
const { WARNING_MESSAGE: BASH_GUARD_ADVISORY_TEXT, BASH_FILE_READ_GUARD_PLUGIN } = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/bash-file-read-guard.ts', import.meta.url).href
)

const INSTALL_TIMEOUT_MS = Number(process.env.DSH_E2E_INSTALL_TIMEOUT_MS ?? 300_000)
const BOOT_TIMEOUT_MS = Number(process.env.DSH_E2E_BOOT_TIMEOUT_MS ?? 90_000)
const SCENARIO_TIMEOUT_MS = Number(process.env.DSH_E2E_SCENARIO_TIMEOUT_MS ?? 120_000)

// ── HELLO scenario constants (T18's bar: a single-step sisyphus text reply) ──
const HELLO_PROMPT = 'e2e hello: reply with the exact sentinel and nothing else'
const HELLO_REPLY = 'MOCK-HELLO-FROM-SISYPHUS-7f3d9a'
const MOCK_KEY = 'mock-e2e'
const HELLO_SCRIPT = { sisyphus: [{ type: 'text', text: HELLO_REPLY }] }

// ── DEMO scenario constants (T19, FR-7/AC-4 — see the header's T19 section) ──
// The user's question (PRD §2.2's orchestrated dummy task, verbatim).
const DEMO_PROMPT = '这个仓库的 README 讲了什么'
// The fixture README the driver seeds into the sandbox project. The sentinel
// fragment is what link 2 asserts INSIDE the explore model's request bytes.
const DEMO_README_CONTENT = 'This is the omo-dsh concerto MVP fixture project\n'
const DEMO_README_SENTINEL = 'concerto MVP fixture project'
// What the explore child reports back (link 3 asserts it lands in the
// parent's tool/result AND in the parent's next request to the mock).
const EXPLORE_FINDINGS = `MOCK-EXPLORE-FINDINGS-9c2e4b: README.md says — ${DEMO_README_SENTINEL}`
// The conductor's final summary (link 4).
const SISYPHUS_SUMMARY = 'MOCK-SISYPHUS-SUMMARY-5a1d8c: the README says this is the omo-dsh concerto MVP fixture project'

/**
 * The two-role demo script (MockStep sequences; one step consumed per request
 * per role — the T17 cursor semantics). Built AFTER the sandbox exists so the
 * read step carries the fixture's absolute path.
 * DSH_E2E_DEMO_SKIP_EXPLORE=1 deletes the explore role: the child's request
 * then reaches the mock as an UNKNOWN role (HTTP 400), the chain breaks, and
 * the analysis MUST FAIL naming link 2 (the failure-QA half of T19).
 */
function demoScript(sandbox) {
  const readmePath = join(sandbox.project, 'README.md')
  const script = {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: 'Read project README',
          prompt: `Read the file README.md in the current project directory (absolute path: ${readmePath}) and report what it says.`,
          // foreground: the conductor's next step needs the findings.
          run_in_background: false,
        },
      },
      { type: 'text', text: SISYPHUS_SUMMARY },
    ],
    explore: [
      { type: 'tool_call', name: 'read', arguments: { file_path: readmePath } },
      { type: 'text', text: EXPLORE_FINDINGS },
    ],
  }
  if (process.env.DSH_E2E_DEMO_SKIP_EXPLORE === '1') delete script.explore
  return script
}

// ── T20 AC-6 NEGATIVE scenario constants (see the header's T20 section) ─────
// The verbatim rejection contracts (installed rc.6, grep-verified):
//   unknown tool:  dsh-tools ToolNotFoundError `unknown tool "${name}"`
//                  (lib/index.js:2428) → toolErrorResult `Error: ${message}`
//                  (:3472-3482) → 'Error: unknown tool "write"'.
//   depth cap:     dsh-subagent SubagentDepthError `subagent depth
//                  ${attempted} exceeds maxDepth ${max}` (lib/index.js:470)
//                  → same wrap → 'Error: subagent depth <n> exceeds maxDepth <m>'
//                  (no scenario here asserts this shape any more; its live
//                  enforcement is pinned by scripts/prove-explore-maxdepth.mjs,
//                  whose committed cap is 2 → 'Error: subagent depth 3 exceeds
//                  maxDepth 2').
const UNKNOWN_TOOL_WRITE_RESULT = 'Error: unknown tool "write"'
// F1 hardening (2026-09-04): with `explore` in the child's deny list, the
// nested attempt is rejected as an unknown tool — the depth gate (which
// stays as defense-in-depth) no longer fires in this scenario.
const UNKNOWN_TOOL_EXPLORE_RESULT = 'Error: unknown tool "explore"'

// AC-6a: the explore child hallucinates a `write` call (the mock may script a
// tool the child was never offered — that IS the hallucination-resistance
// test). Sentinels let the parent-closure check read business outcomes.
const WRITE_DENY_PROMPT = 'e2e write-deny: ask explore to create a file and report what happened'
const WRITE_TARGET_NAME = 'MOCK-WRITE-DENIED-TARGET.txt'
const EXPLORE_WRITE_NOTE = 'MOCK-EXPLORE-WRITE-DENIED-3f7b1e: the write call was rejected (unknown tool)'
const SISYPHUS_WRITE_SUMMARY = 'MOCK-SISYPHUS-WRITE-SUMMARY-8d2c6a: explore could not write — the read-only restriction held'

// AC-6b: the explore child (delegationDepth 1) attempts a nested delegation;
// the tool is physically absent from the child's list (F1 deny hardening).
const NESTED_DENY_PROMPT = 'e2e nested-deny: ask explore to delegate a sub-task and report what happened'
const EXPLORE_NESTED_NOTE = 'MOCK-EXPLORE-NESTED-DENIED-6b4f2d: the nested delegation was rejected (unknown tool — delegation tool absent)'
const SISYPHUS_NESTED_SUMMARY = 'MOCK-SISYPHUS-NESTED-SUMMARY-1e9a5b: explore could not delegate — the delegation tool is absent from the child'

/** AC-6a script: sisyphus delegates; the child calls `write`, then reports. */
function writeDeniedScript(sandbox) {
  const targetPath = join(sandbox.project, WRITE_TARGET_NAME)
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: 'Attempt a project write',
          prompt: `Use the write tool to create the file ${targetPath} with any content, then report exactly what happened.`,
          run_in_background: false,
        },
      },
      { type: 'text', text: SISYPHUS_WRITE_SUMMARY },
    ],
    explore: [
      {
        type: 'tool_call',
        name: 'write',
        arguments: { file_path: targetPath, content: 'this file must never exist\n' },
      },
      { type: 'text', text: EXPLORE_WRITE_NOTE },
    ],
  }
}

/** AC-6b script: sisyphus delegates; the child calls `explore` (nested) — but
 * the F1 deny hardening keeps `explore` out of the child's tool list, so the
 * call is rejected as an unknown tool. */
function nestedDelegationScript() {
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: 'Attempt a nested delegation',
          prompt: 'Use the explore tool to delegate a further sub-task, then report exactly what happened.',
          run_in_background: false,
        },
      },
      { type: 'text', text: SISYPHUS_NESTED_SUMMARY },
    ],
    explore: [
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: 'nested probe',
          prompt: 'this delegation must be rejected — the delegation tool is absent from this child',
          run_in_background: false,
        },
      },
      { type: 'text', text: EXPLORE_NESTED_NOTE },
    ],
  }
}

// ── P2-T18 ROSTER-PARADE scenario constants (plan §4.7; see the header) ─────

/** The 10 delegation targets, in roster order (single source: roster.ts). */
const PARADE_AGENTS = DELEGATION_ENTRIES.map((entry) => entry.id)

const PARADE_PROMPT = 'e2e roster-parade: send every roster delegation in one parallel batch, then summarize what came back'
const PARADE_SUMMARY = 'MOCK-PARADE-SUMMARY-2c9f41: all ten roster children reported back'

/** Unique per-child script sentinel (proves WHICH script answered). */
function paradeChildNote(agent) {
  return `MOCK-PARADE-CHILD-${agent.toUpperCase().replaceAll('-', '_')}-4b7e`
}

/** Durable child-session label: the ONLY link from a child log to its role. */
function paradeLabel(agent) {
  return `parade-${agent}`
}

// THE SEAT DISTRIBUTION (plan §4.7). 10 delegation agents over the 7 REAL
// catalog pairs, every id verified against the pinned install:
//   * dsh-llm-deepseek DEFAULT_MODELS (lib/index.js:1841; ids :1843
//     deepseek-flash, :1852 deepseek-v4-flash, :1858 deepseek-v4-pro, :1864
//     deepseek-v4-flash-vision-exp) — provider route `deepseek-official`.
//   * @earendil-works/pi-ai dist/providers/data/deepseek.json (builtin
//     `deepseek` provider: deepseek-v4-flash, deepseek-v4-pro,
//     deepseek-v4-flash-vision-exp) — provider route `deepseek`.
// NO fake ids: under the mock baseURL a fake id would be mechanically
// accepted, which is exactly why it would hollow out the assertion (plan §4.7
// H-5 — "route observable" must keep meaning "route really servable").
// multimodal-looker sits on a vision id (its natural seat). `librarian` is the
// one TEXT agent deliberately parked on the second vision pair: with 10 agents
// and 2 vision pairs, covering all 7 real pairs requires exactly one non-looker
// on a vision seat, and the vision models are text+image supersets. This is a
// routing-mechanics distribution, not a claim about semantic seat fitness.
const PARADE_SEATS = new Map([
  ['explore', { provider: 'deepseek', model: 'deepseek-v4-flash' }],
  ['hephaestus', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }],
  ['oracle', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }],
  ['librarian', { provider: 'deepseek', model: 'deepseek-v4-flash-vision-exp' }],
  ['plan-consultant', { provider: 'deepseek-official', model: 'deepseek-flash' }],
  ['plan-reviewer', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }],
  ['atlas', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }],
  ['multimodal-looker', { provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp' }],
  ['sisyphus-junior', { provider: 'deepseek-official', model: 'deepseek-v4-flash' }],
  ['prometheus', { provider: 'deepseek', model: 'deepseek-v4-pro' }],
])

/**
 * The 7 pairs the distribution must cover, derived from PARADE_SEATS (never
 * restated) — the scenario asserts all of them were actually exercised.
 */
const PARADE_SEAT_PAIRS = [...new Set(
  [...PARADE_SEATS.values()].map((seat) => `${seat.provider}/${seat.model}`),
)]

/** The scenario's OMO_<AGENT>_{PROVIDER,MODEL} env overlay, from the roster rows. */
function paradeEnv() {
  const env = {}
  for (const entry of DELEGATION_ENTRIES) {
    const seat = PARADE_SEATS.get(entry.id)
    if (seat === undefined) {
      throw new Error(`parade: roster delegation row '${entry.id}' has no seat in PARADE_SEATS`)
    }
    env[entry.routeEnvVars.provider] = seat.provider
    env[entry.routeEnvVars.model] = seat.model
  }
  return env
}

/**
 * The parade mock script, keyed per ROLE (MOCKROLE=<agent>) — not per model:
 * the conductor's step 1 is the ONE assistant message carrying all 10
 * delegation tool calls (the mock's `tool_calls` parallel-batch primitive,
 * ids auto-assigned per batch index), each child's own script does a real
 * `read` of the sandbox README and then reports its sentinel. The child needs
 * TWO steps: the T16 hard-blocks injection lands at the NEXT pre-step boundary
 * (hard-blocks-injection.ts P-3), so a one-step child would never surface it.
 * The conductor's step 2 (all ten results in context) closes with the summary.
 */
function paradeScript(sandbox) {
  const readmePath = join(sandbox.project, 'README.md')
  const script = {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: PARADE_AGENTS.map((agent) => ({
          name: agent,
          arguments: {
            description: paradeLabel(agent),
            prompt: `Read the file ${readmePath} with the read tool, then reply with exactly: ${paradeChildNote(agent)}`,
            // foreground: the conductor's summary step needs all ten replies.
            run_in_background: false,
          },
        })),
      },
      { type: 'text', text: PARADE_SUMMARY },
    ],
  }
  for (const agent of PARADE_AGENTS) {
    script[agent] = [
      { type: 'tool_call', name: 'read', arguments: { file_path: readmePath } },
      { type: 'text', text: paradeChildNote(agent) },
    ]
  }
  return script
}

// ── P2-T19 constants (see the header's P2-T19 section) ──────────────────────
//
// Both scenarios pin the ONE child they exercise onto its OWN
// OMO_<AGENT>_{PROVIDER,MODEL} override, resolved through the SAME
// resolveModelRoutes the spawned dsh runs. Every seat below is a REAL catalog
// pair (plan §4.7 / base table §3 — no fake ids, for the same honesty reason as
// the parade) chosen to be DISTINCT from the conductor's default seat
// (deepseek-official/deepseek-v4-pro), so "the child ran on its configured
// seat" is a discriminating assertion rather than a coincidence.

/** plan-reviewer's P2-T19 seat: pi-ai `deepseek` / deepseek-v4-pro (real id). */
const PLAN_REVIEWER_SEAT = { provider: 'deepseek', model: 'deepseek-v4-pro' }
/** atlas's P2-T19 seat: pi-ai `deepseek` / deepseek-v4-pro (real id). */
const ATLAS_SEAT = { provider: 'deepseek', model: 'deepseek-v4-pro' }

/**
 * The OMO_<AGENT>_{PROVIDER,MODEL} env overlay for ONE roster delegation row,
 * derived from the row's OWN env-name pair (never restated). Throws for a
 * non-roster id so a typo cannot silently seed nothing.
 */
function delegationSeatEnv(agentId, seat) {
  const entry = DELEGATION_ENTRIES.find((candidate) => candidate.id === agentId)
  if (entry === undefined) {
    throw new Error(
      `e2e: '${agentId}' is not a roster delegation id `
      + `(${DELEGATION_ENTRIES.map((candidate) => candidate.id).join(', ')})`,
    )
  }
  return { [entry.routeEnvVars.provider]: seat.provider, [entry.routeEnvVars.model]: seat.model }
}

// plan-reviewer-write-denied (AC-6a generalized to a new read-only row).
const PLAN_REVIEWER_DENY_PROMPT =
  'e2e plan-reviewer-write-denied: ask plan-reviewer to write a file and report what happened'
const PLAN_REVIEWER_WRITE_TARGET_NAME = 'MOCK-PLAN-REVIEWER-WRITE-DENIED.txt'
const PLAN_REVIEWER_WRITE_NOTE =
  'MOCK-PLAN-REVIEWER-WRITE-DENIED-7a4c2e: the write call was rejected (unknown tool — read-only class)'
const SISYPHUS_PLAN_REVIEWER_SUMMARY =
  'MOCK-SISYPHUS-PLAN-REVIEWER-SUMMARY-4e8b1d: plan-reviewer could not write — the read-only class filter held'

/** plan-reviewer-write-denied script: the child hallucinates a `write`. */
function planReviewerWriteDeniedScript(sandbox) {
  const targetPath = join(sandbox.project, PLAN_REVIEWER_WRITE_TARGET_NAME)
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'plan-reviewer',
        arguments: {
          description: 'Attempt a project write during plan review',
          prompt: `Use the write tool to create the file ${targetPath} with any content, then report exactly what happened.`,
          run_in_background: false,
        },
      },
      { type: 'text', text: SISYPHUS_PLAN_REVIEWER_SUMMARY },
    ],
    'plan-reviewer': [
      {
        type: 'tool_call',
        name: 'write',
        arguments: { file_path: targetPath, content: 'this file must never exist\n' },
      },
      { type: 'text', text: PLAN_REVIEWER_WRITE_NOTE },
    ],
  }
}

// atlas-nested-delegation (the positive chain: conductor → atlas → explore).
const ATLAS_NESTED_PROMPT =
  'e2e atlas-nested-delegation: have atlas delegate a README read to explore, then summarize the chain'
// The grandchild's own report (asserted in the atlas log AND in the conductor's
// mock context, proving the bytes climbed both legs).
const ATLAS_GRANDCHILD_NOTE =
  'MOCK-ATLAS-NESTED-EXPLORE-NOTE-2f6c9a: the grandchild explore read the README'
// atlas's report back to the conductor.
const ATLAS_NESTED_NOTE =
  'MOCK-ATLAS-NESTED-REPORT-8b3d7e: atlas received the explore findings and reports the chain complete'
const SISYPHUS_ATLAS_SUMMARY =
  'MOCK-SISYPHUS-ATLAS-SUMMARY-5c1f4a: the conductor → atlas → explore chain completed'

/**
 * atlas-nested-delegation script. Three roles:
 *   sisyphus → tool_call `atlas` (foreground: the summary needs atlas's report);
 *   atlas    → tool_call `explore` (the delegation tool atlas KEEPS) and, once
 *              the grandchild's findings return, its own report; the grandchild
 *              does a real `read` of the sandbox README first, so the chain is
 *              proven by BYTES (report §14.4.4), not by "a tool was called".
 */
function atlasNestedDelegationScript(sandbox) {
  const readmePath = join(sandbox.project, 'README.md')
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'atlas',
        arguments: {
          description: 'Delegate the README read through atlas',
          prompt: `Use the explore tool to have a sub-agent read ${readmePath}, then report its findings and confirm the chain.`,
          run_in_background: false,
        },
      },
      { type: 'text', text: SISYPHUS_ATLAS_SUMMARY },
    ],
    atlas: [
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: 'atlas→explore README read',
          // The prompt must NOT carry ATLAS_GRANDCHILD_NOTE: the findings
          // sentinel has to enter atlas's context through the grandchild's
          // RESULT, otherwise "the findings reached atlas" could pass on the
          // prompt bytes alone.
          prompt: `Read the file ${readmePath} with the read tool, then report what it says.`,
          run_in_background: false,
        },
      },
      { type: 'text', text: ATLAS_NESTED_NOTE },
    ],
    explore: [
      { type: 'tool_call', name: 'read', arguments: { file_path: readmePath } },
      { type: 'text', text: ATLAS_GRANDCHILD_NOTE },
    ],
  }
}

// ── P3-T6 bash-read-guard-warned scenario (模式 C e2e 打样; see header) ────────
// H-02's listener is an ADVISORY, not a block: `cat <file>` executes UNCHANGED
// and the warning rides `additionalContexts` into the model's NEXT request
// (dsh-agent-loop/lib/index.js:578 acceptContext → next-step inbox). This is
// the C-mode pilot every later 劝导演出型 hook copies, so the script drives the
// FULL delivery chain AND both negative boundaries the transcribed upstream
// regexes exist for, in ONE assistant message (the mock's `tool_calls`
// primitive — exactly what "the model fired three calls in one step" looks
// like on the wire):
//   1. bash `cat <fixture>`            → MUST warn (the trigger);
//   2. bash `cat <fixture> | grep <词>` → control ①: a pipeline is NOT a
//      "simple file read" (`[^\s|&;]+` refuses it), so NO second advisory;
//   3. read {file_path: <fixture>}      → control ②: a different tool, NO advisory.
// Requests: (step 1) the batch → (step 2) the final summary text.
const BASH_GUARD_PROMPT =
  'e2e bash-read-guard-warned: read the notes fixture with cat, then also try the piped cat and the read tool, and summarize'
const BASH_GUARD_FIXTURE_NAME = 'notes.txt'
// Two distinct content markers so each call's result is separately provable:
// the trigger's `cat` returns BOTH lines; the pipeline's grep must return ONLY
// the grep-target line (which is what makes "the pipeline really ran" a
// byte-level claim rather than "a call was attempted").
const BASH_GUARD_FIXTURE_FIRST_LINE = 'omo-dsh bash-file-read-guard fixture line one 4c1e9a'
const BASH_GUARD_FIXTURE_GREP_LINE = 'guard grep target line 8f2b7d'
const BASH_GUARD_FIXTURE_CONTENT =
  `${BASH_GUARD_FIXTURE_FIRST_LINE}\n${BASH_GUARD_FIXTURE_GREP_LINE}\n`
const BASH_GUARD_FIXTURE_SENTINEL = '4c1e9a'
// ONE whitespace-free token: the control must be a REAL pipeline (`grep` over
// cat's stdout), and `grep two words` would be read as pattern+filename.
const BASH_GUARD_GREP_WORD = '8f2b7d'
// The conductor's final step (proves the turn really closed after the batch).
const BASH_GUARD_SUMMARY =
  'MOCK-BASH-GUARD-SUMMARY-6d2e8f: the cat result came back and the advisory arrived'

/**
 * bash-read-guard-warned script. ONE assistant message carries all three tool
 * calls — the trigger plus BOTH controls in the SAME step, so "exactly one
 * advisory" is a statement about a single batch in which three calls really
 * executed (the tightest form of the negative: the pipeline and the read call
 * cannot have been skipped, and still produced no injection).
 * `description` is part of the real bash parameter schema (dsh-tool-bash
 * lib/index.js:268 `required: true`), so the script supplies it like any model
 * would. Absolute fixture path: the transcribed regex demands a
 * whitespace/pipe/semicolon-free argument, and mkdtemp sandbox paths have none.
 */
function bashReadGuardScript(sandbox) {
  const fixturePath = join(sandbox.project, BASH_GUARD_FIXTURE_NAME)
  return {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: [
          {
            name: 'bash',
            arguments: { command: `cat ${fixturePath}`, description: 'Read the notes fixture with cat' },
          },
          {
            name: 'bash',
            arguments: {
              command: `cat ${fixturePath} | grep ${BASH_GUARD_GREP_WORD}`,
              description: 'Read the notes fixture through a pipeline',
            },
          },
          { name: 'read', arguments: { file_path: fixturePath } },
        ],
      },
      { type: 'text', text: BASH_GUARD_SUMMARY },
    ],
  }
}

// §14.5: path-based volatile allowlist (see header). Symlinks are skipped by
// the walk (Dirent.isFile() is false for them).
const VOLATILE_PREFIXES = ['sessions/', 'storages/']

/** OMO-pattern sandbox: project / dsh home / agents home / xdg / home. */
function createSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'omo-dsh-e2e-'))
  return {
    root,
    project: join(root, 'project'),
    dshHome: join(root, 'dsh'),
    agentsHome: join(root, 'agents'),
    xdg: join(root, 'xdg'),
    home: join(root, 'home'),
  }
}

/** Spawned-process environment: every dsh/home pointer redirected into the sandbox.
 * `overrides` are the scenario's own env additions (P2-T18's OMO_<AGENT>_* seat
 * distribution). They are merged FIRST so the sandbox pointers and the
 * DEEPSEEK_BASE_URL strip below always win: a scenario can pin a route but can
 * never re-route around the mock or escape the sandbox. */
function scenarioEnv(sandbox, overrides = {}) {
  const env = { ...process.env, ...overrides }
  // A host DEEPSEEK_BASE_URL could mask a broken settings override (the
  // adapter falls back to it); strip it so wiring bugs fail LOUD (the request
  // would go to api.deepseek.com with the dummy key and 401).
  delete env.DEEPSEEK_BASE_URL
  env.HOME = sandbox.home
  env.USERPROFILE = sandbox.home
  env.XDG_CONFIG_HOME = sandbox.xdg
  env.DSH_HOME = sandbox.dshHome
  env.DSH_AGENTS_HOME = sandbox.agentsHome
  env.DEEPSEEK_API_KEY = MOCK_KEY
  return env
}

/**
 * The provider id registered by the dsh-llm-deepseek adapter's shipped route
 * (plan §4.6 STRONG/VISION seat); every OTHER route provider in a scenario is
 * a pi-ai catalog route and therefore needs a settings profile key.
 */
const DEEPSEEK_ADAPTER_PROVIDER = 'deepseek-official'

/**
 * Seed the sandbox: settings.yaml wiring BOTH adapters to the mock, and the
 * persistence patch overlay (compression:none, packChunks:false — T15 layout).
 * `routes` is the scenario's EFFECTIVE resolved route map (env overrides
 * included), so the seeded seats are exactly what the spawned dsh resolves.
 * ONE baseURL per adapter (P2-T18): the deepseek adapter gets one baseURL, and
 * the pi-ai providers map gets one key per distinct non-deepseek-adapter route
 * provider — the same mock `/v1` for all of them (the mock keys its script by
 * MOCKROLE role, never by model, so a shared baseURL is the correct wiring).
 * Returns the patch overlay path (passed as a second --patch).
 */
function seedSandbox(sandbox, routes, mockBaseUrl) {
  for (const dir of [sandbox.project, sandbox.dshHome, sandbox.agentsHome, sandbox.xdg, sandbox.home]) {
    mkdirSync(dir, { recursive: true })
  }
  const piAiProviders = [...new Set(
    Object.values(routes)
      .map((route) => route.provider)
      .filter((provider) => provider !== DEEPSEEK_ADAPTER_PROVIDER),
  )]
  const settingsLines = [
    '# T18 e2e seed: both LLM adapters route to the mock server (dummy key).',
    '# ONE baseURL per adapter (P2-T18): "deepseek-official" is registered by the',
    '# base composition, so only its baseURL is set here; every other route',
    '# provider is a pi-ai catalog route and needs a profile key (same mock /v1).',
    'agent-default-model:',
    `  provider: ${routes.sisyphus.provider}`,
    `  model: ${routes.sisyphus.model}`,
    'llm-deepseek:',
    '  apiKeyEnv: DEEPSEEK_API_KEY',
    `  baseURL: ${mockBaseUrl}/v1`,
    'llm-pi-ai:',
    '  providers:',
  ]
  for (const provider of piAiProviders) {
    settingsLines.push(
      `    ${provider}:`,
      '      apiKeyEnv: DEEPSEEK_API_KEY',
      `      baseURL: ${mockBaseUrl}/v1`,
    )
  }
  settingsLines.push('')
  writeFileSync(join(sandbox.dshHome, 'settings.yaml'), settingsLines.join('\n'))
  const patchPath = join(sandbox.root, 'e2e.patch.yml')
  writeFileSync(
    patchPath,
    [
      '# T18 e2e overlay: plaintext, unpacked session JSONL (T15 layout). Row',
      '# config is REPLACED, not merged, so root must be restated verbatim.',
      '- id: session-persistence-jsonl',
      "  name: '@deepseek-ai/dsh-session-persistence-jsonl'",
      '  config:',
      "    root: !!js dshHomePath('sessions')",
      '    compression: none',
      '    packChunks: false',
      '',
    ].join('\n'),
  )
  return patchPath
}

// ── Credential digest (§14.5) ────────────────────────────────────────────────

function collectFiles(root, rel, out) {
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const entryRel = rel.length > 0 ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      collectFiles(root, entryRel, out)
    } else if (entry.isFile()) {
      out.push(entryRel)
    }
  }
}

/**
 * sha256 over the real dsh config home, excluding the volatile subtrees.
 * Returns 'absent' when the dir does not exist (before === after === 'absent'
 * reads as untouched).
 */
export function digestConfigDir(root) {
  if (!existsSync(root)) return 'absent'
  const files = []
  collectFiles(root, '', files)
  const hash = createHash('sha256')
  for (const rel of files.sort()) {
    const normalized = rel.split(sep).join('/')
    if (VOLATILE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) continue
    hash.update(normalized)
    hash.update('\0')
    hash.update(createHash('sha256').update(readFileSync(join(root, rel))).digest('hex'))
    hash.update('\0')
  }
  return hash.digest('hex')
}

// ── Web RPC surface (crux decision (b), see header) ─────────────────────────
// Transport-adaptive (T9): `boot.transport` is 'rc6-flat' (readiness line
// without ?token=) or 'web-remote' (0.1.2: token→cookie handshake completed
// at boot; Typert Remote endpoints). The rc6-flat wire below is byte-identical
// to the pre-T9 driver (same URL, same envelope, no auth headers).

let rpcCounter = 0
let warnedGetSetCookieFallback = false

const RPC_TIMEOUT_MS = Number(process.env.DSH_E2E_RPC_TIMEOUT_MS ?? 30_000)

async function rpc(boot, method, payload) {
  const rpcId = `e2e-${method}-${++rpcCounter}`
  const response = await fetch(`http://127.0.0.1:${boot.port}/api/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(boot.cookie === undefined ? {} : { cookie: boot.cookie }),
    },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`rpc ${method}: HTTP ${response.status}, non-JSON body: ${text.slice(0, 400)}`)
  }
  if (response.status !== 200) {
    throw new Error(`rpc ${method}: HTTP ${response.status}: ${text.slice(0, 400)}`)
  }
  const result = body.result
  if (result === undefined || result.ok !== true) {
    throw new Error(`rpc ${method} failed: ${JSON.stringify(result ?? body).slice(0, 400)}`)
  }
  return result.value
}

/**
 * 0.1.2 browser-session handshake (browser-auth.ts:240-282): the launch token
 * from the readiness line is accepted ONLY on the index request — a valid
 * root query token mints the authority-bound dsh-auth-* cookie (303 +
 * Set-Cookie); /api then verifies that cookie (:289-302, called from
 * rpc-host.ts:96-99). Returns the `name=value` pair to send as the cookie
 * header on every subsequent /api call.
 */
async function mintBrowserSessionCookie(port, token) {
  const response = await fetch(`http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  })
  const text = await response.text()
  if (response.status !== 303) {
    throw new Error(`browser-session handshake: expected 303, got HTTP ${response.status}: ${text.slice(0, 200)}`)
  }
  let setCookies
  if (typeof response.headers.getSetCookie === 'function') {
    setCookies = response.headers.getSetCookie()
  } else {
    if (!warnedGetSetCookieFallback) {
      warnedGetSetCookieFallback = true
      console.warn('drive: Node without getSetCookie (multi-cookie fallback unreliable)')
    }
    setCookies = [response.headers.get('set-cookie') ?? '']
  }
  const pair = setCookies
    .map((value) => value.split(';', 1)[0])
    .find((value) => value.startsWith('dsh-auth-'))
  if (pair === undefined) {
    throw new Error('browser-session handshake: no dsh-auth-* cookie minted')
  }
  return pair
}

/**
 * The llm.providers contract on either transport. rc.6: one flat call whose
 * value already joins registered routes with the configurable directory
 * server-side. 0.1.2: the client's own two Remote calls, joined by the same
 * rule the Web UI's Models page uses (joinProviderDirectory,
 * ui-settings-models/src/client/store.ts:49-73) — a directory entry is
 * active ⟺ its provider id is a registered route, and registered routes with
 * no directory entry append as active rows. The joined value keeps the rc.6
 * shape {providers:[{provider,displayName,settingsNs,settingsPath,active,
 * declared?}]}, so every downstream assertion stays transport-agnostic.
 */
async function listProvidersJoined(boot) {
  if (boot.transport === 'rc6-flat') return rpc(boot, 'llm.providers', {})
  const [registered, directory] = await Promise.all([
    rpc(boot, 'llm/listProviders', { args: {} }),
    rpc(boot, 'llm/listConfigurableProviders', { args: {} }),
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
  return { providers }
}

/** session.create → (0.1.2) session/create {args:{request}}. Same value. */
async function sessionCreate(boot, request) {
  if (boot.transport === 'rc6-flat') return rpc(boot, 'session.create', request)
  return rpc(boot, 'session/create', { args: { request } })
}

/** session.prompt → (0.1.2) session/prompt {args:{request}} (+requestId). */
async function sessionPrompt(boot, request) {
  if (boot.transport === 'rc6-flat') return rpc(boot, 'session.prompt', request)
  return rpc(boot, 'session/prompt', { args: { request: { requestId: randomUUID(), ...request } } })
}

// ── dsh process management (cold-start.sh discipline) ───────────────────────

function installPlugin(sandbox, env) {
  // P3-T3: one `plugin add` per cordis.yml insert row — a profile that carries
  // only omo-agents would fail to resolve the omo-hooks row at boot.
  let addLog = ''
  for (const pluginDir of PLUGIN_DIRS) {
    const add = spawnSync('dsh', ['plugin', '--profile', PROFILE, 'add', pluginDir], {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      timeout: INSTALL_TIMEOUT_MS,
    })
    addLog += `$ dsh plugin --profile ${PROFILE} add ${pluginDir}\n${add.stdout ?? ''}\n${add.stderr ?? ''}\n`
    if (add.status !== 0) {
      writeFileSync(join(sandbox.root, 'plugin-add.log'), addLog)
      throw new Error(
        `dsh plugin add ${pluginDir} exited ${add.status} (see plugin-add.log in the sandbox)`,
      )
    }
  }
  writeFileSync(join(sandbox.root, 'plugin-add.log'), addLog)
}

/**
 * Whether this runtime's web app advertises `--no-open`.
 *
 * dsh 0.1.2 introduced the default browser handoff together with the flag that
 * suppresses it. Before that the app's commander rejects an unknown option, so
 * a hardcoded `--no-open` turns every pre-0.1.2 run — including a deliberate
 * old-version probe — into `error: unknown option`, which reads as a harness
 * bug rather than a version fact (P-8.2's class: root flags and app flags are
 * different parsers). Feature-probe the app's own help rather than assume
 * (docs/dsh-0.1.5-rc.1-review.md §7.6). Cached: one probe per process.
 */
let noOpenSupport
function supportsNoOpen() {
  if (noOpenSupport === undefined) {
    // The probe must NOT inherit this process's environment. `dsh --profile web
    // --help` does not merely print help: it BOOTS the profile, creating
    // $DSH_HOME (.anonymous-user-id, profiles/) as a side effect. Run with the
    // ambient env and a script that promises "your real ~/.dsh is never
    // touched" silently creates or boots it — invisible on a developer machine
    // where the directory already exists, and loudly visible in CI on a fresh
    // HOME (the credential digest flips to `realDshUntouched: false`).
    // A throwaway home keeps the probe as isolated as the scenarios themselves.
    const probeHome = mkdtempSync(join(tmpdir(), 'omo-noopen-probe-'))
    try {
      const probe = spawnSync('dsh', ['--profile', PROFILE, '--help'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: probeHome,
          XDG_CONFIG_HOME: join(probeHome, '.config'),
          DSH_HOME: join(probeHome, '.dsh'),
          DSH_AGENTS_HOME: join(probeHome, '.agents'),
        },
      })
      noOpenSupport = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.includes('--no-open')
    } finally {
      rmSync(probeHome, { recursive: true, force: true })
    }
  }
  return noOpenSupport
}

/**
 * Boot dsh; resolve with {child, port, transport, cookie?, log()} once the
 * readiness line lands — and, on the 0.1.2 transport (the line carries
 * ?token=<launch-token>), once the token→cookie handshake has completed.
 */
function bootDsh(sandbox, patchPath, env) {
  return new Promise((resolveBoot, rejectBoot) => {
    const child = spawn(
      'dsh',
      [
        '--profile', PROFILE, '--patch', './cordis.yml', '--patch', patchPath, '--port', '0',
        ...supportsNoOpen() ? ['--no-open'] : [],
      ],
      { cwd: REPO_ROOT, env },
    )
    let log = ''
    let readinessHandled = false
    const bootLogPath = join(sandbox.root, 'boot.log')
    const onData = (chunk) => {
      log += chunk.toString('utf8')
      writeFileSync(bootLogPath, log)
      if (readinessHandled) return
      const match = /dsh web: http:\/\/127\.0\.0\.1:(\d+)(?:\/\?token=([A-Za-z0-9_-]+))?/.exec(log)
      if (match === null) return
      readinessHandled = true
      const port = Number(match[1])
      const token = match[2]
      if (token === undefined) {
        // rc.6 transport: flat endpoints, no auth beyond the loopback fence.
        resolveBoot({ child, port, transport: 'rc6-flat', log: () => log })
        return
      }
      // 0.1.2 transport: mint the browser-session cookie before any /api call.
      mintBrowserSessionCookie(port, token).then(
        (cookie) => resolveBoot({ child, port, transport: 'web-remote', cookie, log: () => log }),
        rejectBoot,
      )
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('error', rejectBoot)
    child.once('exit', (code) => {
      rejectBoot(new Error(`dsh exited ${code} before readiness (boot.log in the sandbox)`))
    })
    setTimeout(() => rejectBoot(new Error(`no readiness line within ${BOOT_TIMEOUT_MS}ms`)), BOOT_TIMEOUT_MS)
  })
}

function stopDsh(child) {
  return new Promise((resolveStop) => {
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 15_000)
    child.once('exit', () => {
      clearTimeout(killTimer)
      resolveStop()
    })
    child.kill('SIGTERM')
  })
}

// ── Session JSONL observation (T15 layout) ──────────────────────────────────

/**
 * Whether `filename` is a Session log artifact, whichever format generation
 * wrote it.
 *
 * rc.6 hardcoded the bare `session.jsonl`; from session format v3 the
 * canonical name carries the generation — `session.v3.jsonl` — because "every
 * later generation carries a lowercase numeric `vN` component"
 * (dsh-session-persistence-jsonl/src/format.ts:50-54). Matching a fixed name
 * silently loses the whole observation channel on a newer runtime (the log is
 * there, the driver just never sees it), so match the GENERATION PATTERN
 * rather than either literal: a hardcoded `session.v3.jsonl` would re-break at
 * v4 exactly the way `session.jsonl` broke at v3.
 */
function isSessionLogName(filename) {
  return /^session(?:\.v\d+)?\.jsonl$/.test(filename)
}

function findSessionLogs(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      findSessionLogs(path, out)
    } else if (isSessionLogName(entry.name)) {
      const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0)
      if (lines.length === 0) continue
      let header
      try {
        header = JSON.parse(lines[0])
      } catch {
        continue
      }
      const events = []
      for (const line of lines.slice(1)) {
        try {
          events.push(JSON.parse(line))
        } catch {
          // a torn tail line mid-flush is observation, not corruption
        }
      }
      out.push({ path, header, events })
    }
  }
  return out
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

/** Poll the sandbox sessions dir until the session's log shows a turn/end. */
async function awaitTurnEnd(sandbox, sessionId) {
  const deadline = Date.now() + SCENARIO_TIMEOUT_MS
  let found
  while (Date.now() < deadline) {
    const logs = findSessionLogs(join(sandbox.dshHome, 'sessions'))
    found = logs.find((log) => String(log.header.id) === String(sessionId))
    if (found !== undefined) {
      const ended = found.events.some((event) => event.type === 'turn/end')
      if (ended) return found
    }
    await sleep(250)
  }
  return found // may be undefined — the analysis reports the gap honestly
}

// ── MOCKROLE delivery (see header): extend the materialized persona scalar ──

/** The materialized preset every scenario edits after boot (T6 apply-time sync). */
function materializedCompositionPath(sandbox) {
  return join(sandbox.dshHome, '.agent-presets', CONCERTO_PRESET_ID, 'agent.cordis.yml')
}

// Roster-driven block-scalar registry (P2-T18; see the header's T18 section).
// Each spec names the role's ROW-ID ANCHOR (exact line, indentation included:
// delegation rows sit at 4 spaces inside the delegation group, the conductor
// persona row at column 0), the block-scalar HEADER line that follows it, and
// the content indent the renderer used for that row's content lines.
//   * delegation rows → `    - id: tool-subagent-<id>` + `        persona: |-`
//     (content indent 10 = concerto-preset.ts AGENT_ROW_CONTENT_INDENT)
//   * conductor      → `- id: persona` + `    prefix: |-`
//     (content indent 6 = system-prompt.ts renderPersonaIntoComposition)
// The row anchors are unique in the materialized file — the property the old
// `persona: |-` needle lost when the template grew to 10 delegation rows.
const DELEGATION_ROW_CONTENT_INDENT = '          '
const CONDUCTOR_ROW_CONTENT_INDENT = '      '
const MOCKROLE_BLOCK_SCALARS = new Map([
  [CONDUCTOR_ID, {
    rowAnchor: '- id: persona',
    header: '    prefix: |-',
    indent: CONDUCTOR_ROW_CONTENT_INDENT,
  }],
  ...DELEGATION_ENTRIES.map((entry) => [entry.id, {
    rowAnchor: `    - id: tool-subagent-${entry.id}`,
    header: '        persona: |-',
    indent: DELEGATION_ROW_CONTENT_INDENT,
  }]),
])

/** Escape a literal string for a RegExp body. */
function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Locate one role's block scalar in the materialized composition: the exact
 * anchor line and the header line belonging to THAT row (the scan stops at the
 * next row, so a missing header can never silently bind to the following row's
 * persona scalar). `lines` = the file split on '\n'; returns 0-based indices.
 */
function locateRoleBlockScalar(lines, spec, role) {
  const anchors = []
  for (const [index, line] of lines.entries()) {
    if (line === spec.rowAnchor) anchors.push(index)
  }
  if (anchors.length !== 1) {
    throw new Error(
      `materialized concerto preset must carry the row anchor \`${spec.rowAnchor}\` `
      + `for role '${role}' exactly once; found ${anchors.length}`,
    )
  }
  const rowIndex = anchors[0]
  const rowIndent = spec.rowAnchor.length - spec.rowAnchor.trimStart().length
  for (let index = rowIndex + 1; index < lines.length; index++) {
    const line = lines[index]
    // A sibling/next row ends this row's body (any row at the same or a
    // shallower indent — delegation rows nest at 4, top-level rows at 0).
    if (/^\s*- id: /.test(line) && line.length - line.trimStart().length <= rowIndent) break
    if (line === spec.header) return { rowIndex, headerIndex: index }
  }
  throw new Error(
    `materialized concerto preset row '${role}' carries no \`${spec.header}\` block scalar`,
  )
}

/**
 * P2-T18 MOCKROLE injection: idempotently stamp `MOCKROLE=<role>` as the FIRST
 * content line of that role's persona block scalar in the materialized
 * composition. Throws loudly on an unknown role, a missing/duplicated row
 * anchor, a missing block scalar, or a missing materialized file (sync did not
 * run). Idempotence is LINE-ANCHORED: `MOCKROLE=sisyphus` is not satisfied by
 * the `MOCKROLE=sisyphus-junior` line.
 */
export function appendMockRoleMarker(sandbox, role) {
  const spec = MOCKROLE_BLOCK_SCALARS.get(role)
  if (spec === undefined) {
    throw new Error(
      `no MOCKROLE block-scalar mapping for role '${role}' `
      + `(roster delegation ids: ${DELEGATION_ENTRIES.map((entry) => entry.id).join(', ')})`,
    )
  }
  const compositionPath = materializedCompositionPath(sandbox)
  if (!existsSync(compositionPath)) {
    throw new Error(`materialized concerto preset missing at ${compositionPath} (sync did not run?)`)
  }
  const text = readFileSync(compositionPath, 'utf8')
  const markerPattern = new RegExp(`^${spec.indent}MOCKROLE=${escapeRegExp(role)}$`, 'm')
  if (markerPattern.test(text)) return // idempotent
  const lines = text.split('\n')
  const { headerIndex } = locateRoleBlockScalar(lines, spec, role)
  lines.splice(headerIndex + 1, 0, `${spec.indent}MOCKROLE=${role}`)
  writeFileSync(compositionPath, lines.join('\n'))
}

/**
 * Verify where a role's marker actually LANDED (P2-T18 acceptance: the grep /
 * line-number check, automated). Returns the 1-based line numbers of the row
 * anchor, the persona header and the marker, plus whether the marker is the
 * FIRST content line under that row's header and appears exactly once.
 * Never throws: a layout failure is returned as `{ok:false, reason}` so the
 * verdict can report it instead of collapsing into a driver error.
 */
export function verifyMockRoleMarkerLanding(sandbox, role) {
  const spec = MOCKROLE_BLOCK_SCALARS.get(role)
  if (spec === undefined) return { role, ok: false, reason: `unknown role '${role}'` }
  const compositionPath = materializedCompositionPath(sandbox)
  let lines
  try {
    lines = readFileSync(compositionPath, 'utf8').split('\n')
  } catch (error) {
    return { role, ok: false, reason: `cannot read materialized preset: ${error.message}` }
  }
  let location
  try {
    location = locateRoleBlockScalar(lines, spec, role)
  } catch (error) {
    return { role, ok: false, reason: error.message }
  }
  const expected = `${spec.indent}MOCKROLE=${role}`
  const markerLineIndex = location.headerIndex + 1
  const markerCount = lines.filter((line) => line === expected).length
  const actual = lines[markerLineIndex]
  return {
    role,
    ok: actual === expected && markerCount === 1,
    rowAnchor: spec.rowAnchor,
    rowAnchorLine: location.rowIndex + 1,
    personaHeaderLine: location.headerIndex + 1,
    markerLine: markerLineIndex + 1,
    markerCount,
    expected,
    actual: actual ?? null,
  }
}

// ── Analysis (pure — the --self-test QA targets exactly this) ────────────────

function requestHeaderRoute(events) {
  let route
  for (const event of events) {
    if (event.type === 'request/header') {
      route = {
        provider: event.data?.header?.config?.provider,
        model: event.data?.header?.config?.model,
      }
    }
  }
  return route
}

function eventText(event) {
  try {
    return JSON.stringify(event.data ?? {})
  } catch {
    return ''
  }
}

/**
 * Tool names advertised to the model in a session's LATEST request/header
 * (dsh-agent-loop appends header.tools only when non-empty —
 * lib/index.js:706,733). Returns undefined when the log carries no
 * request/header at all (a missing channel must FAIL, not vacuously pass).
 */
export function advertisedToolNames(events) {
  let names
  for (const event of events) {
    if (event.type !== 'request/header') continue
    const tools = event.data?.header?.tools
    names = Array.isArray(tools)
      ? tools
          .map((tool) => tool?.function?.name ?? tool?.name)
          .filter((name) => typeof name === 'string')
      : []
  }
  return names
}

/**
 * Flatten a session's tool/result events into {callId, isError, text} parts
 * (the nested shape: data.message.content[] entries of type 'tool-result'
 * whose own content[] carries the text parts — see the T19 verbatim sample).
 */
export function toolResultParts(events) {
  const parts = []
  for (const event of events) {
    if (event.type !== 'tool/result') continue
    const content = event.data?.message?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type !== 'tool-result') continue
      const inner = Array.isArray(part.content) ? part.content : []
      const text = inner
        .filter((piece) => piece?.type === 'text' && typeof piece.text === 'string')
        .map((piece) => piece.text)
        .join('\n')
      parts.push({ callId: part.toolCallId, isError: part.isError === true, text })
    }
  }
  return parts
}

/**
 * The HELLO scenario assertions. `log` = {path, header, events} | undefined;
 * `requests` = the mock server's recorded request channel; `providersJson` =
 * the raw /api/llm.providers response text; `bootLog` = captured dsh stdout.
 */
export function analyzeHello({ log, requests, providersJson, bootLog }, routes) {
  const events = log?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const route = requestHeaderRoute(events)
  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    // The probe-proven pattern (scripts/concerto-mode-probe.sh): provider and
    // active:true inside the same JSON object.
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    exploreProviderActive: new RegExp(
      `"provider":"${routes.explore.provider}"[^}]*"active":true`,
    ).test(providersJson),
    sessionLogFound: log !== undefined,
    userMessageRecorded: events.some(
      (event) => event.type === 'user/message' && eventText(event).includes(HELLO_PROMPT),
    ),
    routeHeaderMatchesSisyphus:
      route !== undefined
      && route.provider === routes.sisyphus.provider
      && route.model === routes.sisyphus.model,
    assistantReplyRecorded: events.some(
      (event) => event.type === 'assistant/message' && eventText(event).includes(HELLO_REPLY),
    ),
    turnCompleted: events.some(
      (event) =>
        event.type === 'turn/end'
        && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
    ),
    mockSawExactlyOneSisyphusCall: sisyphusRequests.length === 1,
    mockRequestOnSisyphusModel:
      sisyphusRequests.length === 1 && sisyphusRequests[0].body?.model === routes.sisyphus.model,
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks }
}

/**
 * The DEMO scenario assertions (T19, FR-7/AC-4). The four chain links are
 * asserted as BUSINESS outcomes (report §14.4.4): bytes and events that only
 * exist when the delegation actually happened, in order — never merely "the
 * LLM emitted a tool_call".
 * `log` = the PARENT (sisyphus) session log; `childLog` = the explore child's
 * own session.jsonl (header.origin 'subagent', header.parentSession = parent
 * id — dsh-subagent childSessionMeta); `requests` = the mock's recorded
 * request channel (roles + raw bodies, in arrival order).
 */
export function analyzeDemo({ log, childLog, requests, providersJson, bootLog }, routes) {
  const events = log?.events ?? []
  const childEvents = childLog?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const exploreRequests = requests.filter((request) => request.role === 'explore')

  // AC-5 evidence: the LATEST request/header of BOTH logs (T15 contract).
  const parentRoute = requestHeaderRoute(events)

  // Link 1 evidence: the parent's explore tool/call with contract args.
  const exploreCall = events.find((event) => event.type === 'tool/call' && event.data?.name === 'explore')
  let exploreCallArgs = {}
  try {
    exploreCallArgs = JSON.parse(exploreCall?.data?.arguments ?? '{}')
  } catch {
    // unparseable model output fails link 1 below
  }

  // Link 2 evidence: the child ran on the explore route and read the README.
  const childRoute = requestHeaderRoute(childEvents)
  const childReadCall = childEvents.find(
    (event) => event.type === 'tool/call' && event.data?.name === 'read',
  )
  const lastExploreBody = exploreRequests.length > 0
    ? JSON.stringify(exploreRequests[exploreRequests.length - 1].body)
    : ''

  // Link 3 evidence: the findings came back to the parent (log + wire).
  const exploreResult = events.find(
    (event) => event.type === 'tool/result' && eventText(event).includes(EXPLORE_FINDINGS),
  )
  const secondSisyphusBody = sisyphusRequests.length >= 2
    ? JSON.stringify(sisyphusRequests[1].body)
    : ''

  // Link 4 evidence: the summary, and an orderly turn end.
  const summaryMessage = events.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(SISYPHUS_SUMMARY),
  )
  const turnCompleted = events.some(
    (event) =>
      event.type === 'turn/end'
      && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
  )

  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    exploreProviderActive: new RegExp(
      `"provider":"${routes.explore.provider}"[^}]*"active":true`,
    ).test(providersJson),
    parentSessionLogFound: log !== undefined,
    userQuestionRecorded: events.some(
      (event) => event.type === 'user/message' && eventText(event).includes(DEMO_PROMPT),
    ),
    // LINK 1: sisyphus decided and called the delegation tool with a
    // well-formed contract (description + prompt naming the README), on the
    // sisyphus route.
    link1SisyphusCalledExploreTool:
      exploreCall !== undefined
      && typeof exploreCallArgs.description === 'string'
      && typeof exploreCallArgs.prompt === 'string'
      && exploreCallArgs.prompt.includes('README.md')
      && sisyphusRequests.length >= 1
      && sisyphusRequests[0].body?.model === routes.sisyphus.model,
    // LINK 2: the explore child RAN — its own session exists under the
    // parent, on the explore route; it issued a `read` for the README; and
    // the README's bytes provably reached the explore model (the read tool
    // result is verbatim in the child's next request to the mock).
    link2ExploreRanAndReadReadme:
      childLog !== undefined
      && childLog.header?.origin === 'subagent'
      && String(childLog.header?.parentSession) === String(log?.header?.id)
      && childRoute !== undefined
      && childRoute.provider === routes.explore.provider
      && childRoute.model === routes.explore.model
      && childReadCall !== undefined
      && String(childReadCall.data?.arguments ?? '').includes('README.md')
      && exploreRequests.length >= 2
      && lastExploreBody.includes(DEMO_README_SENTINEL),
    // LINK 3: the child's findings returned to sisyphus — settled tool/result
    // in the parent log AND the findings verbatim in the parent's next
    // request (the result genuinely entered the conductor's model context).
    link3ExploreResultReturnedToSisyphus:
      exploreResult !== undefined
      && secondSisyphusBody.includes(EXPLORE_FINDINGS),
    // LINK 4: sisyphus closed the loop with the summary, turn completed.
    link4SisyphusSummarizedFindings: summaryMessage !== undefined && turnCompleted,
    // ORDER (AC-4): the links are ordered in BOTH observation channels — the
    // parent JSONL seqs (call < result < summary) and the mock arrival order
    // (sisyphus#1 < explore#… < sisyphus-last).
    chainObservedInOrder:
      exploreCall !== undefined
      && exploreResult !== undefined
      && summaryMessage !== undefined
      && exploreCall.seq < exploreResult.seq
      && exploreResult.seq < summaryMessage.seq
      && sisyphusRequests.length >= 2
      && exploreRequests.length >= 1
      && requests.indexOf(sisyphusRequests[0]) < requests.indexOf(exploreRequests[0])
      && requests.indexOf(exploreRequests[exploreRequests.length - 1])
        < requests.indexOf(sisyphusRequests[sisyphusRequests.length - 1]),
    // Exact request accounting: 2 conductor + 2 child calls, nothing else
    // (a stray title/side request carrying a marker would consume a scripted
    // step and corrupt the chain — better to fail loud).
    mockSawExpectedRequestCounts:
      sisyphusRequests.length === 2 && exploreRequests.length === 2,
    // ── AC-5 (T20): the route pair is observable AND distinct. Read off the
    // LATEST request/header of BOTH session logs — the foreground one-shot
    // child's subagent/descriptor omits the route (T19 note), so the
    // executed route is the request/header, never the descriptor.
    routePairParentRequestHeaderIsSisyphus:
      parentRoute !== undefined
      && parentRoute.provider === routes.sisyphus.provider
      && parentRoute.model === routes.sisyphus.model,
    routePairChildRequestHeaderIsExplore:
      childRoute !== undefined
      && childRoute.provider === routes.explore.provider
      && childRoute.model === routes.explore.model,
    routePairDistinct:
      parentRoute !== undefined
      && childRoute !== undefined
      && (parentRoute.provider !== childRoute.provider
        || parentRoute.model !== childRoute.model),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  // Non-gating observations (T20 owns the AC-5/AC-6 assertion halves).
  // NOTE: a FOREGROUND (run_in_background:false) spawn produces a ONE-SHOT
  // child whose descriptor carries no agentProvider/agentModel (only
  // continuable descriptors persist the declared route — dsh-subagent
  // descriptor.d.ts OneShotSubagentDescriptorData vs Continuable). The
  // executed child route is gated in link 2 via request/header instead.
  const descriptor = childEvents.find((event) => event.type === 'subagent/descriptor')
  const bonus = {
    // T16's injection, observed in the child log (user/message sourced from
    // the omo-agents plugin — agent.inject() landing at a step boundary).
    hardBlocksInjectionObserved: childEvents.some(
      (event) =>
        event.type === 'user/message'
        && eventText(event).includes('"plugin":"omo-agents"'),
    ),
    // AC-5's raw pair (the assertion inputs, surfaced for the evidence log).
    routePair: { parent: parentRoute ?? null, child: childRoute ?? null },
    childDescriptor: descriptor?.data ?? null,
    mockRequestRoles: requests.map((request) => request.role),
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

/**
 * Shared preamble for the two AC-6 negative analyzers: the common givens
 * (plugin, providers, both session logs with proven lineage) plus the parent
 * closure (the child's note returned as the explore tool/result, the
 * conductor's summary, an orderly turn/end) and the request accounting.
 * Returns {events, childEvents, sisyphusRequests, exploreRequests, givens}.
 */
function negativeScenarioGivens({ log, childLog, requests, providersJson, bootLog }, routes, childNote, parentSummary) {
  const events = log?.events ?? []
  const childEvents = childLog?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const exploreRequests = requests.filter((request) => request.role === 'explore')
  const childResult = events.find(
    (event) => event.type === 'tool/result' && eventText(event).includes(childNote),
  )
  const summaryMessage = events.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(parentSummary),
  )
  const turnCompleted = events.some(
    (event) =>
      event.type === 'turn/end'
      && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
  )
  const givens = {
    pluginLoaded: pluginsLoaded(bootLog),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    exploreProviderActive: new RegExp(
      `"provider":"${routes.explore.provider}"[^}]*"active":true`,
    ).test(providersJson),
    parentSessionLogFound: log !== undefined,
    childSessionLogFound:
      childLog !== undefined
      && childLog.header?.origin === 'subagent'
      && String(childLog.header?.parentSession) === String(log?.header?.id),
    childOutcomeReturnedAndParentClosed:
      childResult !== undefined && summaryMessage !== undefined && turnCompleted,
    mockSawExpectedRequestCounts:
      sisyphusRequests.length === 2 && exploreRequests.length === 2,
  }
  return { events, childEvents, sisyphusRequests, exploreRequests, givens }
}

/**
 * AC-6a e2e negative (T12's toolFilter, closed at e2e). The mock scripts the
 * explore child HALLUCINATING a `write` tool_call — write is not advertised
 * to the child (the deny is asserted on the child's request/header tools
 * array) — and the REAL tool runtime's rejection is asserted verbatim:
 * 'Error: unknown tool "write"' as an isError tool result. The business
 * outcome (report §14.4.4) is that the target file never appears on disk.
 * `writeTargetPath` is the sandbox path the script aimed the write at.
 */
export function analyzeExploreWriteDenied(
  { log, childLog, requests, providersJson, bootLog, writeTargetPath },
  routes,
) {
  const { events, childEvents, givens } = negativeScenarioGivens(
    { log, childLog, requests, providersJson, bootLog },
    routes,
    EXPLORE_WRITE_NOTE,
    SISYPHUS_WRITE_SUMMARY,
  )
  const toolNames = advertisedToolNames(childEvents)
  const results = toolResultParts(childEvents)
  const writeCall = childEvents.find(
    (event) => event.type === 'tool/call' && event.data?.name === 'write',
  )
  const checks = {
    ...givens,
    // The deny is wire-visible BEFORE the attempt: the child's advertised
    // schema contains zero write/edit entries (T12's contract half).
    childAdvertisedToolsExcludeWriteEdit:
      toolNames !== undefined
      && toolNames.length > 0
      && !toolNames.includes('write')
      && !toolNames.includes('edit'),
    // THE negative: the hallucinated write is dispatched and the runtime
    // rejects it with the verbatim unknown-tool contract (T12's other half).
    writeAttemptRejectedWithUnknownTool:
      writeCall !== undefined
      && results.some(
        (part) => part.isError && part.text === UNKNOWN_TOOL_WRITE_RESULT,
      ),
    // Business outcome: no bytes on disk (the sandbox path the mock aimed at).
    writeTargetAbsentOnDisk:
      typeof writeTargetPath === 'string' && !existsSync(writeTargetPath),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    childAdvertisedToolNames: toolNames ?? null,
    childToolResults: results,
    writeTargetPath: writeTargetPath ?? null,
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

/**
 * AC-6b e2e negative. The mock scripts the explore child (delegationDepth 1)
 * calling `explore` again. Since the F1 hardening (2026-09-04) the deny list
 * includes the delegation tool itself, so the child is never offered `explore`
 * and the attempt is rejected as an UNKNOWN TOOL — asserted verbatim. The T13
 * depth cap (2 on every delegation row since D-2026-09-13-01) stays as
 * defense-in-depth and is deliberately NOT what this scenario observes (its
 * live enforcement is pinned by scripts/prove-explore-maxdepth.mjs).
 * `allLogs` is every session log in the sandbox — no header.parentSession may
 * equal the child id.
 */
export function analyzeExploreNestedDelegationDenied(
  { log, childLog, allLogs, requests, providersJson, bootLog },
  routes,
) {
  const { events, childEvents, givens } = negativeScenarioGivens(
    { log, childLog, requests, providersJson, bootLog },
    routes,
    EXPLORE_NESTED_NOTE,
    SISYPHUS_NESTED_SUMMARY,
  )
  const toolNames = advertisedToolNames(childEvents)
  const results = toolResultParts(childEvents)
  const nestedCall = childEvents.find(
    (event) => event.type === 'tool/call' && event.data?.name === 'explore',
  )
  const checks = {
    ...givens,
    // F1 hardening (2026-09-04): `explore` is PHYSICALLY ABSENT from the
    // child's advertised tools — the deny list includes the delegation tool
    // itself (stronger than the T13 depth cap, which stays as
    // defense-in-depth).
    delegationToolAbsentFromChild:
      toolNames !== undefined && !toolNames.includes('explore'),
    // THE negative: the nested attempt's errored tool result, verbatim.
    nestedDelegationRejectedWithUnknownTool:
      nestedCall !== undefined
      && results.some((part) => part.isError && part.text === UNKNOWN_TOOL_EXPLORE_RESULT),
    // No child exists for a tool the child never had: no grandchild session log.
    noGrandchildSessionCreated:
      childLog !== undefined
      && Array.isArray(allLogs)
      && !allLogs.some(
        (candidate) =>
          String(candidate.header?.parentSession) === String(childLog.header?.id),
      ),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    childAdvertisedToolNames: toolNames ?? null,
    childToolResults: results,
    grandchildLogs: Array.isArray(allLogs)
      ? allLogs
          .filter(
            (candidate) =>
              childLog !== undefined
              && String(candidate.header?.parentSession) === String(childLog.header?.id),
          )
          .map((candidate) => candidate.path)
      : null,
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

// ── P2-T18 roster-parade analysis (Phase 2 exit criterion a, per child) ─────

/** The shipped dsh-agent-loop concurrency default (dsh-agent-loop/lib/index.js:1424). */
const DSH_AGENT_LOOP_MAX_PARALLEL_TOOL_CALLS = 10

/** Compare a {provider, model} route pair (undefined-safe). */
function sameSeat(route, seat) {
  return route !== undefined
    && seat !== undefined
    && route.provider === seat.provider
    && route.model === seat.model
}

/**
 * The roster-parade assertions (plan §4.7). Ten delegation agents, one
 * assistant message of ten parallel calls, ten child sessions — each asserted
 * on its OWN env-configured seat (the AC-5 pattern generalized per child).
 * `allLogs` is every session log in the sandbox (the child↔role link is the
 * child's durable `subagent/descriptor` label = the delegation `description`);
 * `markerLanding` is the driver's own grep/line-number verification of the
 * MOCKROLE injections (P2-T18's landing half).
 */
export function analyzeRosterParade(
  { log, allLogs, requests, providersJson, bootLog, markerLanding },
  routes,
) {
  const events = log?.events ?? []
  const parentRoute = requestHeaderRoute(events)
  const parentId = log?.header?.id

  // (1) The conductor's ONE assistant message with the ten delegation calls.
  const batchMessages = events.filter(
    (event) =>
      event.type === 'assistant/message'
      && (event.data?.message?.content ?? []).some((block) => block?.type === 'tool-call'),
  )
  const batchBlocks = batchMessages.length === 1
    ? (batchMessages[0].data.message.content ?? []).filter((block) => block?.type === 'tool-call')
    : []
  const batchNames = batchBlocks.map((block) => block.name)
  const parentToolCalls = events.filter((event) => event.type === 'tool/call')
  const parentCallSteps = new Set(
    parentToolCalls.map((event) => `${event.data?.turn}/${event.data?.step}`),
  )

  // (a) Child session logs, linked to their role by the descriptor label.
  const childLogs = Array.isArray(allLogs)
    ? allLogs.filter(
        (candidate) =>
          candidate.header?.origin === 'subagent'
          && String(candidate.header?.parentSession) === String(parentId),
      )
    : []
  const childByLabel = new Map()
  for (const child of childLogs) {
    const descriptor = child.events.find((event) => event.type === 'subagent/descriptor')
    const label = descriptor?.data?.label
    if (typeof label === 'string') childByLabel.set(label, child)
  }

  const childDetails = PARADE_AGENTS.map((agent) => {
    const configuredSeat = PARADE_SEATS.get(agent)
    const resolvedSeat = routes[agent]
    const child = childByLabel.get(paradeLabel(agent))
    const observedRoute = child === undefined ? undefined : requestHeaderRoute(child.events)
    const reportedOwnSentinel = child !== undefined
      && child.events.some(
        (event) => event.type === 'assistant/message' && eventText(event).includes(paradeChildNote(agent)),
      )
    const hardBlocksInjected = child !== undefined
      && child.events.some(
        (event) =>
          event.type === 'user/message' && eventText(event).includes('"plugin":"omo-agents"'),
      )
    const roleRequests = requests.filter((request) => request.role === agent)
    return {
      agent,
      configuredSeat: configuredSeat ?? null,
      resolvedSeat: resolvedSeat ?? null,
      sessionLogPath: child?.path ?? null,
      observedRoute: observedRoute ?? null,
      seatMatches: sameSeat(observedRoute, configuredSeat),
      configuredSeatResolved: sameSeat(resolvedSeat, configuredSeat),
      reportedOwnSentinel,
      hardBlocksInjected,
      mockRequestCount: roleRequests.length,
      mockRequestModels: [...new Set(roleRequests.map((request) => request.body?.model))],
    }
  })

  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const secondSisyphusBody = sisyphusRequests.length >= 2
    ? JSON.stringify(sisyphusRequests[1].body)
    : ''
  const summaryMessage = events.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(PARADE_SUMMARY),
  )
  const turnCompleted = events.some(
    (event) =>
      event.type === 'turn/end'
      && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
  )
  // The OBSERVED seats (session-log request/header), not the configured table:
  // this counts what actually ran.
  const observedPairCount = new Set(
    childDetails
      .filter((detail) => detail.observedRoute !== null)
      .map((detail) => `${detail.observedRoute.provider}/${detail.observedRoute.model}`),
  ).size
  const distinctRouteProviders = [
    ...new Set(Object.values(routes).map((route) => route.provider)),
  ]
  const hardBlocksChildren = childDetails
    .filter((detail) => detail.hardBlocksInjected)
    .map((detail) => detail.agent)

  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    // (b) Wiring proof for every distinct route provider this scenario seats.
    everyRouteProviderActive: distinctRouteProviders.every((provider) =>
      new RegExp(`"provider":"${provider}"[^}]*"active":true`).test(providersJson),
    ),
    parentSessionLogFound: log !== undefined,
    userQuestionRecorded: events.some(
      (event) => event.type === 'user/message' && eventText(event).includes(PARADE_PROMPT),
    ),
    // (1) THE PARALLEL BATCH: all 10 delegation calls in ONE assistant message.
    allTenDelegationsInOneMessage:
      batchBlocks.length === PARADE_AGENTS.length
      && new Set(batchNames).size === PARADE_AGENTS.length
      && PARADE_AGENTS.every((agent) => batchNames.includes(agent)),
    allTenDelegationCallsDispatchedInOneStep:
      parentToolCalls.length === PARADE_AGENTS.length && parentCallSteps.size === 1,
    // (a) Ten child sessions really ran — one per role — and each answered its
    // OWN script (the role-keyed sentinel, not merely "a child ran").
    allTenChildSessionsRan:
      childLogs.length === PARADE_AGENTS.length
      && childDetails.every((detail) => detail.sessionLogPath !== null),
    everyChildRanItsOwnScript: childDetails.every((detail) => detail.reportedOwnSentinel),
    // (b) AC-5 per child: the session-log request/header route equals the
    // env-configured seat, and that seat is what the resolver produced from
    // the same env the spawned dsh saw.
    everyChildRouteMatchedConfiguredSeat: childDetails.every((detail) => detail.seatMatches),
    everyConfiguredSeatResolvedFromEnv:
      childDetails.every((detail) => detail.configuredSeatResolved),
    // The distribution really covers all 7 real catalog pairs.
    allSevenRealSeatsExercised: observedPairCount === PARADE_SEAT_PAIRS.length,
    // Every role's wire requests carried the configured model (route
    // observability on the mock channel too, not just the session log).
    everyMockRequestOnConfiguredModel: childDetails.every(
      (detail) =>
        detail.mockRequestCount === 2
        && detail.mockRequestModels.length === 1
        && detail.mockRequestModels[0] === detail.configuredSeat?.model,
    ),
    mockSawExpectedRequestCounts:
      sisyphusRequests.length === 2
      && childDetails.every((detail) => detail.mockRequestCount === 2),
    // The children's replies returned to the conductor AND provably entered
    // its next model request.
    everyChildNoteReturnedToConductor: PARADE_AGENTS.every((agent) =>
      events.some(
        (event) => event.type === 'tool/result' && eventText(event).includes(paradeChildNote(agent)),
      ),
    ),
    allChildNotesEnteredConductorContext:
      sisyphusRequests.length >= 2
      && PARADE_AGENTS.every((agent) => secondSisyphusBody.includes(paradeChildNote(agent))),
    conductorSummarized: summaryMessage !== undefined && turnCompleted,
    // AC-5's kernel survives the override: the conductor's observed seat IS the
    // sisyphus seat and it is NOT the explore child's seat (the parade rewrites
    // nine seats, never this pair).
    routePairDistinct:
      parentRoute !== undefined
      && sameSeat(parentRoute, routes.sisyphus)
      && !sameSeat(parentRoute, routes.explore),
    // (c) T16's injection reaches a NEW roster child (spot-check: at least one
    // non-explore agent), which is the listener-coverage claim of plan §4.4.
    hardBlocksInjectionObservedInNewAgent:
      hardBlocksChildren.some((agent) => agent !== 'explore'),
    // The MOCKROLE markers landed under the correct rows (driver grep check).
    mockRoleMarkersLandedInCorrectRows:
      Array.isArray(markerLanding)
      && markerLanding.length === PARADE_AGENTS.length + 1
      && markerLanding.every((entry) => entry?.ok === true),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    // The per-child route assertion DETAILS required by the P2-T18 acceptance.
    childRouteDetails: childDetails,
    hardBlocksInjectionChildren: hardBlocksChildren,
    mockRoleMarkerLanding: Array.isArray(markerLanding) ? markerLanding : null,
    // Q-4 (plan §6): the resident-continuable-child question, answered honestly.
    paradeObservation: {
      batchCount: 1,
      parallelDelegationsRequested: PARADE_AGENTS.length,
      dispatchedInOneAssistantMessage: batchBlocks.length,
      childSessionsObserved: childLogs.length,
      distinctSeatsExercised: observedPairCount,
      agentLoopMaxParallelToolCalls: DSH_AGENT_LOOP_MAX_PARALLEL_TOOL_CALLS,
      residentContinuableChildren: {
        blockedTenWayParallelism: false,
        numericCapFound: null,
        exercised: false,
        note:
          'installed dsh-subagent exposes only the depth gate (SubagentDepthError); no numeric '
          + 'resident-continuable cap was found, and the parade runs run_in_background:false, so the '
          + 'children are foreground one-shot sessions and the resident-continuable path is NOT '
          + 'exercised. The batch fit the shipped agent-loop pool exactly '
          + `(maxParallelToolCalls default ${DSH_AGENT_LOOP_MAX_PARALLEL_TOOL_CALLS}), so no batching `
          + 'fallback was needed.',
      },
    },
    routePair: { parent: parentRoute ?? null },
    mockRequestRoles: requests.map((request) => request.role),
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

// ── P2-T19 analyses ─────────────────────────────────────────────────────────

/**
 * The common givens for a ONE-child scenario whose child is NOT necessarily
 * explore (P2-T19). `childRole` keys every child-specific observation, so the
 * helper never assumes explore the way negativeScenarioGivens does. Returns the
 * child's resolved seat alongside the events for the scenario's own checks.
 */
function oneDelegationChildGivens(
  { log, childLog, requests, providersJson, bootLog },
  routes,
  { childRole, childNote, parentSummary },
) {
  const events = log?.events ?? []
  const childEvents = childLog?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const childRequests = requests.filter((request) => request.role === childRole)
  const childSeat = routes[childRole]
  const childResult = events.find(
    (event) => event.type === 'tool/result' && eventText(event).includes(childNote),
  )
  const summaryMessage = events.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(parentSummary),
  )
  const turnCompleted = events.some(
    (event) =>
      event.type === 'turn/end'
      && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
  )
  const givens = {
    pluginLoaded: pluginsLoaded(bootLog),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    // The child's OWN seat provider is registered/active — the wiring proof for
    // the (env-pinned) route this scenario asserts below.
    childSeatProviderActive: new RegExp(
      `"provider":"${childSeat.provider}"[^}]*"active":true`,
    ).test(providersJson),
    parentSessionLogFound: log !== undefined,
    childSessionLogFound:
      childLog !== undefined
      && childLog.header?.origin === 'subagent'
      && String(childLog.header?.parentSession) === String(log?.header?.id),
    childOutcomeReturnedAndParentClosed:
      childResult !== undefined && summaryMessage !== undefined && turnCompleted,
    mockSawExpectedRequestCounts:
      sisyphusRequests.length === 2 && childRequests.length === 2,
  }
  return { events, childEvents, sisyphusRequests, childRequests, childSeat, givens }
}

/**
 * plan-reviewer-write-denied (P2-T19; AC-6a generalized to a new read-only
 * row). The mock scripts the plan-reviewer child HALLUCINATING a `write`; the
 * scenario asserts the read-only class contract end to end:
 *   * the child's advertised schema excludes write AND edit (the mutation half
 *     of denyToolNamesFor);
 *   * it excludes ALL TEN delegation toolNames (the F1 half: another agent's
 *     delegation tool is PHYSICALLY ABSENT, not merely refused);
 *   * the real runtime rejects the hallucinated call verbatim
 *     ('Error: unknown tool "write"', isError);
 *   * the business outcome: no bytes on disk at the target path;
 *   * the child ran on its own env-pinned seat, which differs from the
 *     conductor's — AC-5's per-child pattern applied to the read-only class.
 */
export function analyzePlanReviewerWriteDenied(
  { log, childLog, requests, providersJson, bootLog, writeTargetPath },
  routes,
) {
  const childRole = 'plan-reviewer'
  const { childEvents, childRequests, childSeat, givens } = oneDelegationChildGivens(
    { log, childLog, requests, providersJson, bootLog },
    routes,
    {
      childRole,
      childNote: PLAN_REVIEWER_WRITE_NOTE,
      parentSummary: SISYPHUS_PLAN_REVIEWER_SUMMARY,
    },
  )
  const toolNames = advertisedToolNames(childEvents)
  const results = toolResultParts(childEvents)
  const writeCall = childEvents.find(
    (event) => event.type === 'tool/call' && event.data?.name === 'write',
  )
  const childRoute = requestHeaderRoute(childEvents)
  const conductorRoute = requestHeaderRoute(log?.events ?? [])
  const checks = {
    ...givens,
    // T12's deny contract on a NEW read-only row: the two mutation tools are
    // never advertised (the child inherits tool-fs; the filter hides them).
    childAdvertisedToolsExcludeWriteEdit:
      toolNames !== undefined
      && toolNames.length > 0
      && !toolNames.includes('write')
      && !toolNames.includes('edit'),
    // F1 generalization: every delegation toolName is physically absent too —
    // the roster's own list, so the claim cannot drift from the rendered deny.
    childAdvertisedToolsExcludeAllDelegationTools:
      toolNames !== undefined
      && toolNames.length > 0
      && DELEGATION_TOOL_NAMES.every((name) => !toolNames.includes(name)),
    // THE negative: the hallucinated write is dispatched and the real runtime
    // rejects it with the verbatim unknown-tool contract.
    writeAttemptRejectedWithUnknownTool:
      writeCall !== undefined
      && results.some((part) => part.isError && part.text === UNKNOWN_TOOL_WRITE_RESULT),
    // Business outcome: no bytes on disk (the sandbox path the mock aimed at).
    writeTargetAbsentOnDisk:
      typeof writeTargetPath === 'string' && !existsSync(writeTargetPath),
    // The child ran on its CONFIGURED seat (env-pinned via
    // OMO_PLAN_REVIEWER_*, resolved by the same resolver the spawned dsh runs).
    childRanOnItsConfiguredSeat:
      sameSeat(childRoute, childSeat)
      && childRequests.length >= 1
      && childRequests.every((request) => request.body?.model === childSeat.model),
    // ... and that seat is observably DIFFERENT from the conductor's, so the
    // check cannot pass on a coincidental shared default.
    childSeatDiffersFromConductorSeat:
      childRoute !== undefined
      && conductorRoute !== undefined
      && (childRoute.provider !== conductorRoute.provider
        || childRoute.model !== conductorRoute.model),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    childAdvertisedToolNames: toolNames ?? null,
    childToolResults: results,
    writeTargetPath: writeTargetPath ?? null,
    routePair: { conductor: conductorRoute ?? null, child: childRoute ?? null },
    mockRequestRoles: requests.map((request) => request.role),
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

/**
 * atlas-nested-delegation (P2-T19; the POSITIVE depth-2 chain). The vocabulary
 * is deliberately the OPPOSITE of the retired depth-rejection shape (plan §4.7
 * 对照语义注意): success is a REAL grandchild session plus findings flowing back
 * up, and the delegation tools' absence is asserted on the read-only
 * GRANDCHILD (physical absence) rather than inferred from any depth error.
 * `allLogs` is every session log in the sandbox; the grandchild is the log
 * whose parentSession is the atlas child's id.
 */
export function analyzeAtlasNestedDelegation(
  { log, childLog, allLogs, requests, providersJson, bootLog },
  routes,
) {
  const GRANDCHILD_DEPTH = 2
  const events = log?.events ?? []
  const atlasEvents = childLog?.events ?? []
  const parentId = log?.header?.id
  const conductorSeat = routes.sisyphus
  const atlasSeat = routes.atlas
  const exploreSeat = routes.explore

  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const atlasRequests = requests.filter((request) => request.role === 'atlas')
  const exploreRequests = requests.filter((request) => request.role === 'explore')

  const conductorRoute = requestHeaderRoute(events)
  const atlasRoute = requestHeaderRoute(atlasEvents)

  // The depth-2 grandchild, found through PROVEN lineage (parentSession chain),
  // never through a name guess.
  const grandchildLog = Array.isArray(allLogs) && childLog !== undefined
    ? allLogs.find(
        (candidate) =>
          candidate.header?.origin === 'subagent'
          && String(candidate.header?.parentSession) === String(childLog.header?.id),
      )
    : undefined
  const grandchildEvents = grandchildLog?.events ?? []
  const grandchildRoute = requestHeaderRoute(grandchildEvents)
  const grandchildToolNames = advertisedToolNames(grandchildEvents)
  const atlasToolNames = advertisedToolNames(atlasEvents)

  // Conductor-leg evidence.
  const atlasCall = events.find(
    (event) => event.type === 'tool/call' && event.data?.name === 'atlas',
  )
  const atlasResult = events.find(
    (event) => event.type === 'tool/result' && eventText(event).includes(ATLAS_NESTED_NOTE),
  )
  const summaryMessage = events.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(SISYPHUS_ATLAS_SUMMARY),
  )
  const turnCompleted = events.some(
    (event) =>
      event.type === 'turn/end'
      && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
  )
  // atlas-leg evidence.
  const exploreCall = atlasEvents.find(
    (event) => event.type === 'tool/call' && event.data?.name === 'explore',
  )
  const exploreResult = atlasEvents.find(
    (event) => event.type === 'tool/result' && eventText(event).includes(ATLAS_GRANDCHILD_NOTE),
  )
  const atlasReport = atlasEvents.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(ATLAS_NESTED_NOTE),
  )

  const conductorSecondBody = sisyphusRequests.length >= 2
    ? JSON.stringify(sisyphusRequests[1].body)
    : ''
  const atlasSecondBody = atlasRequests.length >= 2
    ? JSON.stringify(atlasRequests[atlasRequests.length - 1].body)
    : ''
  const lastExploreBody = exploreRequests.length > 0
    ? JSON.stringify(exploreRequests[exploreRequests.length - 1].body)
    : ''
  const grandchildAnsweredOwnScript = grandchildEvents.some(
    (event) => event.type === 'assistant/message' && eventText(event).includes(ATLAS_GRANDCHILD_NOTE),
  )
  const routeProviders = [...new Set([
    conductorSeat.provider,
    atlasSeat.provider,
    exploreSeat.provider,
  ])]

  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    everyRouteProviderActive: routeProviders.every((provider) =>
      new RegExp(`"provider":"${provider}"[^}]*"active":true`).test(providersJson),
    ),
    parentSessionLogFound: log !== undefined,
    userQuestionRecorded: events.some(
      (event) => event.type === 'user/message' && eventText(event).includes(ATLAS_NESTED_PROMPT),
    ),
    // Leg 0→1: the conductor really called atlas, and a depth-1 atlas child
    // session exists under the conductor.
    conductorCalledAtlas: atlasCall !== undefined,
    atlasChildSessionLogFound:
      childLog !== undefined
      && childLog.header?.origin === 'subagent'
      && String(childLog.header?.parentSession) === String(parentId)
      && childLog.header?.delegationDepth === 1,
    // atlas ran on its OWN configured seat (env-pinned) — and that seat is not
    // the conductor's, so the pair is genuinely observable.
    atlasRanOnItsConfiguredSeat:
      sameSeat(atlasRoute, atlasSeat)
      && atlasRequests.length === 2
      && atlasRequests.every((request) => request.body?.model === atlasSeat.model),
    atlasSeatDistinctFromConductorSeat:
      atlasRoute !== undefined && !sameSeat(atlasRoute, conductorSeat),
    // atlas is the orchestrator row: it keeps the WHOLE delegation roster
    // (no toolFilter), which is exactly what lets leg 1→2 exist at all.
    atlasAdvertisesAllDelegationTools:
      atlasToolNames !== undefined
      && atlasToolNames.length > 0
      && DELEGATION_TOOL_NAMES.every((name) => atlasToolNames.includes(name)),
    // THE positive (mirror of the F1 negative): atlas's `explore` call is
    // DISPATCHED and returns the grandchild's findings — success semantics, not
    // a rejection of any kind.
    atlasExploreCallReturnedFindings:
      exploreCall !== undefined
      && typeof exploreCall.data?.arguments === 'string'
      && exploreResult !== undefined
      && atlasReport !== undefined,
    // ... because a REAL depth-2 grandchild session ran under atlas.
    grandchildSessionRan:
      grandchildLog !== undefined
      && grandchildLog.header?.origin === 'subagent'
      && String(grandchildLog.header?.parentSession) === String(childLog?.header?.id)
      && grandchildLog.header?.delegationDepth === GRANDCHILD_DEPTH,
    // The grandchild ran on the explore seat (route observability) and its
    // persona is what reached the mock (role='explore' is only detectable from
    // the MOCKROLE=explore marker riding the explore persona), with the README
    // bytes provably in its model context.
    grandchildRanOnExploreSeat: sameSeat(grandchildRoute, exploreSeat),
    grandchildPersonaAndScriptObserved:
      exploreRequests.length === 2
      && grandchildAnsweredOwnScript
      && lastExploreBody.includes(DEMO_README_SENTINEL),
    // 对照语义 (plan §4.7): the read-only grandchild PHYSICALLY lacks write/edit
    // and all ten delegation tools — the absence claim lives HERE, on the
    // grandchild, instead of being read off any depth error.
    readOnlyGrandchildLacksMutationAndDelegationTools:
      grandchildToolNames !== undefined
      && grandchildToolNames.length > 0
      && !grandchildToolNames.includes('write')
      && !grandchildToolNames.includes('edit')
      && DELEGATION_TOOL_NAMES.every((name) => !grandchildToolNames.includes(name)),
    // The findings climbed BOTH legs as bytes in the parent's model context.
    grandchildFindingsReachedAtlasModel: atlasSecondBody.includes(ATLAS_GRANDCHILD_NOTE),
    atlasReportReachedConductorModel:
      atlasResult !== undefined && conductorSecondBody.includes(ATLAS_NESTED_NOTE),
    conductorSummarized: summaryMessage !== undefined && turnCompleted,
    // ORDER in BOTH channels: conductor log seq, atlas log seq, and the mock
    // arrival order sisyphus#1 < atlas#1 < explore#1 < explore#2 < atlas#2 <
    // sisyphus#2 (the foreground chain is strictly sequential).
    chainObservedInOrder:
      atlasCall !== undefined
      && atlasResult !== undefined
      && summaryMessage !== undefined
      && atlasCall.seq < atlasResult.seq
      && atlasResult.seq < summaryMessage.seq
      && exploreCall !== undefined
      && exploreResult !== undefined
      && atlasReport !== undefined
      && exploreCall.seq < exploreResult.seq
      && exploreResult.seq < atlasReport.seq
      && sisyphusRequests.length >= 2
      && atlasRequests.length >= 2
      && exploreRequests.length >= 2
      && requests.indexOf(sisyphusRequests[0]) < requests.indexOf(atlasRequests[0])
      && requests.indexOf(atlasRequests[0]) < requests.indexOf(exploreRequests[0])
      && requests.indexOf(exploreRequests[0]) < requests.indexOf(exploreRequests[exploreRequests.length - 1])
      && requests.indexOf(exploreRequests[exploreRequests.length - 1])
        < requests.indexOf(atlasRequests[atlasRequests.length - 1])
      && requests.indexOf(atlasRequests[atlasRequests.length - 1])
        < requests.indexOf(sisyphusRequests[sisyphusRequests.length - 1]),
    // Exact request accounting: 2 conductor + 2 atlas + 2 grandchild.
    mockSawExpectedRequestCounts:
      sisyphusRequests.length === 2
      && atlasRequests.length === 2
      && exploreRequests.length === 2,
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    conductorRoute: conductorRoute ?? null,
    atlasRoute: atlasRoute ?? null,
    grandchildRoute: grandchildRoute ?? null,
    atlasAdvertisedToolNames: atlasToolNames ?? null,
    grandchildAdvertisedToolNames: grandchildToolNames ?? null,
    atlasChildLogPath: childLog?.path ?? null,
    grandchildLogPath: grandchildLog?.path ?? null,
    mockRequestRoles: requests.map((request) => request.role),
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

// ── P3-T6 bash-read-guard-warned analysis (模式 C e2e 打样) ───────────────────

/**
 * The text of a message's content: a plain string, or the joined `text` blocks
 * of the content array (the shape a `user/message` event's data carries — the
 * advisory message itself uses `[{type:'text', text}]`).
 */
function messageContentText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
}

/**
 * A `tool/call` event's parsed arguments. The persisted field is the wire
 * JSON string the adapter produced (fabricated fixtures use the same shape);
 * an already-parsed object is accepted so the helper stays usable either way.
 * Returns undefined when the field is absent or unparseable — the call then
 * simply cannot be matched, which is a FAIL for the check that needed it.
 */
function toolCallArguments(event) {
  const raw = event?.data?.arguments
  if (typeof raw === 'object' && raw !== null) return raw
  if (typeof raw !== 'string') return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/**
 * Every durable carrier of the advisory text in a session log, by event type —
 * the two the DSH loop really produces for an `additionalContexts` entry:
 *   * `agent/inbox/spliced` with target `next-step`: the ACCEPT itself
 *     (dsh-agent-loop/lib/index.js:578 acceptContext → inbox.splice →
 *     session.append("agent/inbox/spliced"), lib/index.js:206);
 *   * `user/message`: the same message CLAIMED at the next step boundary and
 *     appended to the history (lib/index.js:1028), i.e. the carrier the model's
 *     next request is actually built from.
 * Both are collected so the "exactly once" check is not blind to a double
 * ACCEPT that only one of the two projections would show.
 */
function bashGuardAdvisoryCarriers(events, advisoryText) {
  const userMessages = []
  const nextStepInsertions = []
  for (const event of events) {
    if (event.type === 'user/message' && messageContentText(event.data).includes(advisoryText)) {
      userMessages.push(event)
    }
    if (event.type === 'agent/inbox/spliced' && event.data?.target === 'next-step') {
      for (const message of event.data?.inserted ?? []) {
        if (messageContentText(message).includes(advisoryText)) {
          nextStepInsertions.push({ event, message })
        }
      }
    }
  }
  return { userMessages, nextStepInsertions }
}

/** True when a message carries the advisory's producer triple verbatim. */
function isBashGuardAdvisorySource(message) {
  return message?.source?.kind === 'plugin'
    && message.source.plugin === BASH_FILE_READ_GUARD_PLUGIN
    && message.source.form === 'notice'
}

/**
 * The bash-read-guard-warned assertions (plan §4.7 gate 3, C-mode pilot).
 * The listener is an ADVISORY: the `cat` result must be a NORMAL result (never
 * isError) and the warning must travel as an `additionalContexts` user message
 * to the NEXT request. Three calls run in ONE assistant message — the trigger
 * plus both negative boundaries — so "exactly one advisory" is a statement
 * about a batch in which all three really executed:
 *   (a) the trigger's result is present, non-error, and carries the fixture
 *       bytes (劝导非阻断: the command was NOT blocked or rewritten);
 *   (b) a `user/message` carrier with source {kind:'plugin',
 *       plugin:'omo-hooks', form:'notice'} is durably in the session log;
 *   (c) 对照① the piped `cat` ran (its grep-filtered output proves the
 *       pipeline) and added NO second advisory;
 *   (d) 对照② the `read` tool ran and added NO advisory;
 *   (e) the advisory was injected EXACTLY once on BOTH carriers (the
 *       double-trigger / idempotence-drift guard).
 * `fixturePath` is the absolute sandbox path the script pointed the calls at
 * (analysisInput) — the commands are matched by exactly-parsed arguments, so
 * the pipeline command can never be mistaken for the trigger.
 */
export function analyzeBashReadGuardWarned(
  { log, requests, providersJson, bootLog, fixturePath },
  routes,
) {
  const events = log?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const results = toolResultParts(events)
  const calls = events.filter((event) => event.type === 'tool/call')
  const findCall = (name, expectedArguments) => calls.find((event) => {
    if (event.data?.name !== name) return false
    const args = toolCallArguments(event)
    if (args === undefined) return false
    return Object.entries(expectedArguments).every(([key, value]) => args[key] === value)
  })
  const resultFor = (call) => (call === undefined
    ? undefined
    : results.find((part) => part.callId === call.data?.callId))
  const triggerCall = findCall('bash', { command: `cat ${fixturePath}` })
  const pipelineCall = findCall('bash', {
    command: `cat ${fixturePath} | grep ${BASH_GUARD_GREP_WORD}`,
  })
  const readCall = findCall('read', { file_path: fixturePath })
  const triggerResult = resultFor(triggerCall)
  const pipelineResult = resultFor(pipelineCall)
  const readResult = resultFor(readCall)
  const carriers = bashGuardAdvisoryCarriers(events, BASH_GUARD_ADVISORY_TEXT)
  const injectionCount = carriers.userMessages.length
  // The advisory's real consumption point: a LATER request to the model must
  // carry the text (the mock records the wire body).
  const advisoryReachedNextModelRequest = sisyphusRequests.some(
    (request, index) => index > 0
      && JSON.stringify(request.body ?? {}).includes(BASH_GUARD_ADVISORY_TEXT),
  )
  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    sessionLogFound: log !== undefined,
    // (a) the trigger executed for real, non-error, and returned the bytes.
    bashTriggerExecutedWithFixtureBytes:
      triggerCall !== undefined
      && triggerResult !== undefined
      && triggerResult.isError !== true
      && triggerResult.text.includes(BASH_GUARD_FIXTURE_SENTINEL),
    // (b) the advisory is durably in the log as a plugin-sourced user message.
    advisoryInjectedIntoSessionLog:
      carriers.userMessages.length > 0
      && carriers.userMessages.every((event) => isBashGuardAdvisorySource(event.data)),
    // The mechanism fact (P3-T1): additionalContexts enter the NEXT request.
    advisoryReachedNextModelRequest,
    // (c) 对照①: the pipeline RAN (grep-filtered output, first line absent)
    // and the batch still produced only the one advisory.
    pipedCatRanWithoutAdvisory:
      pipelineResult !== undefined
      && pipelineResult.isError !== true
      && pipelineResult.text.includes(BASH_GUARD_FIXTURE_GREP_LINE)
      && !pipelineResult.text.includes(BASH_GUARD_FIXTURE_FIRST_LINE)
      && injectionCount === 1,
    // (d) 对照②: the read tool RAN (both lines, line-numbered text) with no
    // advisory of its own.
    readToolRanWithoutAdvisory:
      readResult !== undefined
      && readResult.isError !== true
      && readResult.text.includes(BASH_GUARD_FIXTURE_FIRST_LINE)
      && readResult.text.includes(BASH_GUARD_FIXTURE_GREP_LINE)
      && injectionCount === 1,
    // (e) exactly ONE injection on BOTH durable carriers.
    advisoryInjectedExactlyOnce:
      injectionCount === 1 && carriers.nextStepInsertions.length === 1,
    // Closure + the "next request" premise: the batch step and the summary
    // step both reached the mock, and the turn ended normally.
    mockSawBothSteps: sisyphusRequests.length === 2,
    turnCompleted: events.some(
      (event) =>
        event.type === 'turn/end'
        && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
    ),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    fixturePath: fixturePath ?? null,
    advisoryText: BASH_GUARD_ADVISORY_TEXT,
    advisoryUserMessageCarriers: carriers.userMessages.map((event) => ({
      seq: event.seq,
      source: event.data?.source ?? null,
      text: messageContentText(event.data),
    })),
    advisoryNextStepInsertions: carriers.nextStepInsertions.map(({ event, message }) => ({
      seq: event.seq,
      target: event.data?.target ?? null,
      source: message?.source ?? null,
    })),
    toolResults: results.map((part) => ({
      callId: part.callId,
      isError: part.isError,
      text: part.text,
    })),
    mockRequestCount: sisyphusRequests.length,
    mockSecondRequestBodyHasAdvisory: advisoryReachedNextModelRequest,
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

// ── --self-test: the analysis must earn its PASS (report §14.4.5) ────────────

function fabricatedGoodLog(routes) {
  return {
    path: '/fabricated/session.jsonl',
    header: { type: 'session', id: 'session-fabricated' },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: HELLO_PROMPT }] } },
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
      },
      { seq: 3, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: HELLO_REPLY }] } } },
      { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedProvidersJson(routes) {
  return JSON.stringify({
    type: 'server-response',
    rpcId: 'x',
    result: {
      ok: true,
      value: {
        providers: [
          { provider: routes.sisyphus.provider, active: true },
          { provider: routes.explore.provider, active: true },
        ],
      },
    },
  })
}

// ── fabricated DEMO logs (the demo analysis must earn its PASS the same way)

const FABRICATED_PARENT_ID = 'session-fabricated-parent'
const FABRICATED_CHILD_ID = 'session-fabricated-child'

function fabricatedDemoRequests(routes) {
  return [
    { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 10 },
    { role: 'explore', body: { model: routes.explore.model, messages: [{ role: 'system', content: 'MOCKROLE=explore' }] }, receivedAt: 20 },
    {
      role: 'explore',
      body: {
        model: routes.explore.model,
        messages: [
          { role: 'system', content: 'MOCKROLE=explore' },
          { role: 'user', content: `read result: This is the omo-dsh ${DEMO_README_SENTINEL}` },
        ],
      },
      receivedAt: 30,
    },
    {
      role: 'sisyphus',
      body: {
        model: routes.sisyphus.model,
        messages: [
          { role: 'system', content: 'MOCKROLE=sisyphus' },
          { role: 'user', content: `tool result: ${EXPLORE_FINDINGS}` },
        ],
      },
      receivedAt: 40,
    },
  ]
}

function fabricatedGoodDemoParentLog(routes) {
  return {
    path: '/fabricated/parent/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: DEMO_PROMPT }] } },
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
      },
      {
        seq: 3,
        type: 'tool/call',
        data: {
          turn: 1,
          step: 1,
          callId: 'mock-llm-tool-1',
          name: 'explore',
          arguments: JSON.stringify({ description: 'Read project README', prompt: 'Read README.md and report', run_in_background: false }),
        },
      },
      {
        seq: 4,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: EXPLORE_FINDINGS }], isError: false }] } },
      },
      { seq: 5, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: SISYPHUS_SUMMARY }] } } },
      { seq: 6, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedGoodDemoChildLog(routes) {
  return {
    path: '/fabricated/child/session.jsonl',
    header: {
      type: 'session',
      id: FABRICATED_CHILD_ID,
      origin: 'subagent',
      parentSession: FABRICATED_PARENT_ID,
      delegationDepth: 1,
    },
    events: [
      {
        seq: 0,
        type: 'subagent/descriptor',
        data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'Read project README', agentProvider: routes.explore.provider, agentModel: routes.explore.model },
      },
      {
        seq: 1,
        type: 'request/header',
        data: { header: { config: { provider: routes.explore.provider, model: routes.explore.model } }, reason: 'initial' },
      },
      {
        seq: 2,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1', name: 'read', arguments: JSON.stringify({ file_path: '/fabricated/project/README.md' }) },
      },
      { seq: 3, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: EXPLORE_FINDINGS }] } } },
      { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedGoodDemoInput(routes) {
  return {
    log: fabricatedGoodDemoParentLog(routes),
    childLog: fabricatedGoodDemoChildLog(routes),
    requests: fabricatedDemoRequests(routes),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
  }
}

// ── fabricated AC-6 NEGATIVE logs (both negative analyses must earn PASS) ──

function fabricatedNegativeParentLog(routes, prompt, childNote, parentSummary, childRole = 'explore') {
  return {
    path: '/fabricated/negative-parent/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: prompt }] } },
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
      },
      {
        seq: 3,
        type: 'tool/call',
        data: {
          turn: 1,
          step: 1,
          callId: 'mock-llm-tool-1',
          name: childRole,
          arguments: JSON.stringify({ description: 'd', prompt: 'p', run_in_background: false }),
        },
      },
      {
        seq: 4,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: childNote }], isError: false }] } },
      },
      { seq: 5, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: parentSummary }] } } },
      { seq: 6, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedNegativeChildLog(
  routes,
  attemptName,
  attemptArgs,
  rejectionText,
  childNote,
  toolsList,
  childRole = 'explore',
) {
  return {
    path: '/fabricated/negative-child/session.jsonl',
    header: {
      type: 'session',
      id: FABRICATED_CHILD_ID,
      origin: 'subagent',
      parentSession: FABRICATED_PARENT_ID,
      delegationDepth: 1,
    },
    events: [
      {
        seq: 1,
        type: 'request/header',
        data: {
          header: {
            config: { provider: routes[childRole].provider, model: routes[childRole].model },
            tools: toolsList ?? [
              { type: 'function', function: { name: 'read' } },
              { type: 'function', function: { name: 'grep' } },
              { type: 'function', function: { name: 'explore' } },
            ],
          },
          reason: 'initial',
        },
      },
      {
        seq: 2,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1', name: attemptName, arguments: JSON.stringify(attemptArgs) },
      },
      {
        seq: 3,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: rejectionText }], isError: true }] } },
      },
      { seq: 4, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: childNote }] } } },
      { seq: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

const FABRICATED_WRITE_TARGET = '/fabricated/project/MOCK-WRITE-DENIED-TARGET.txt'

function fabricatedGoodWriteInput(routes) {
  return {
    log: fabricatedNegativeParentLog(routes, WRITE_DENY_PROMPT, EXPLORE_WRITE_NOTE, SISYPHUS_WRITE_SUMMARY),
    childLog: fabricatedNegativeChildLog(
      routes,
      'write',
      { file_path: FABRICATED_WRITE_TARGET, content: 'x' },
      UNKNOWN_TOOL_WRITE_RESULT,
      EXPLORE_WRITE_NOTE,
    ),
    requests: fabricatedDemoRequests(routes),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
    writeTargetPath: FABRICATED_WRITE_TARGET,
  }
}

function fabricatedGoodNestedInput(routes) {
  const childLog = fabricatedNegativeChildLog(
    routes,
    'explore',
    { description: 'nested probe', prompt: 'nested', run_in_background: false },
    UNKNOWN_TOOL_EXPLORE_RESULT,
    EXPLORE_NESTED_NOTE,
    // F1 hardening: the good input mirrors the REAL child — `explore` absent.
    [
      { type: 'function', function: { name: 'read' } },
      { type: 'function', function: { name: 'grep' } },
    ],
  )
  const log = fabricatedNegativeParentLog(routes, NESTED_DENY_PROMPT, EXPLORE_NESTED_NOTE, SISYPHUS_NESTED_SUMMARY)
  return {
    log,
    childLog,
    allLogs: [log, childLog],
    requests: fabricatedDemoRequests(routes),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
  }
}

// ── fabricated P2-T18 parade input (the parade analysis must earn its PASS) ──

/** The effective route map the parade scenario's env overlay resolves to. */
function fabricatedParadeRoutes(baseRoutes) {
  const routes = { ...baseRoutes }
  for (const [agent, seat] of PARADE_SEATS) routes[agent] = seat
  return routes
}

function fabricatedParadeProvidersJson(routes) {
  return JSON.stringify({
    type: 'server-response',
    rpcId: 'x',
    result: {
      ok: true,
      value: {
        providers: [...new Set(Object.values(routes).map((route) => route.provider))]
          .map((provider) => ({ provider, active: true })),
      },
    },
  })
}

function fabricatedParadeParentLog(routes) {
  const argumentsFor = (agent) => JSON.stringify({
    description: paradeLabel(agent),
    prompt: `read the README and report as ${agent}`,
    run_in_background: false,
  })
  const callBlocks = PARADE_AGENTS.map((agent, index) => ({
    type: 'tool-call',
    id: `mock-llm-tool-1-${index}`,
    name: agent,
    arguments: argumentsFor(agent),
  }))
  const events = [
    { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: PARADE_PROMPT }] } },
    {
      seq: 2,
      type: 'request/header',
      data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
    },
    { seq: 3, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: callBlocks } } },
  ]
  let seq = 4
  for (const [index, agent] of PARADE_AGENTS.entries()) {
    events.push({
      seq: seq++,
      type: 'tool/call',
      data: { turn: 1, step: 1, callId: `mock-llm-tool-1-${index}`, name: agent, arguments: argumentsFor(agent) },
    })
  }
  for (const [index, agent] of PARADE_AGENTS.entries()) {
    events.push({
      seq: seq++,
      type: 'tool/result',
      data: {
        turn: 1,
        step: 1,
        message: {
          role: 'user',
          content: [{
            type: 'tool-result',
            toolCallId: `mock-llm-tool-1-${index}`,
            content: [{ type: 'text', text: paradeChildNote(agent) }],
            isError: false,
          }],
        },
      },
    })
  }
  events.push({ seq: seq++, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: PARADE_SUMMARY }] } } })
  events.push({ seq: seq++, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  return {
    path: '/fabricated/parade/parent/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events,
  }
}

function fabricatedParadeChildLog(agent, seat) {
  return {
    path: `/fabricated/parade/${agent}/session.jsonl`,
    header: {
      type: 'session',
      id: `session-fabricated-parade-${agent}`,
      origin: 'subagent',
      parentSession: FABRICATED_PARENT_ID,
      delegationDepth: 1,
    },
    events: [
      {
        seq: 0,
        type: 'subagent/descriptor',
        data: { version: 3, mode: 'one-shot', provider: 'spawn', label: paradeLabel(agent) },
      },
      {
        seq: 1,
        type: 'request/header',
        data: { header: { config: { provider: seat.provider, model: seat.model } }, reason: 'initial' },
      },
      {
        seq: 2,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1', name: 'read', arguments: JSON.stringify({ file_path: '/fabricated/project/README.md' }) },
      },
      {
        seq: 3,
        type: 'user/message',
        data: {
          content: [{ type: 'text', text: 'hard blocks injection' }],
          source: { kind: 'plugin', plugin: 'omo-agents' },
        },
      },
      { seq: 4, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: paradeChildNote(agent) }] } } },
      { seq: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedParadeRequests(routes) {
  const requests = [
    {
      role: 'sisyphus',
      body: { model: routes.sisyphus.model, messages: [{ role: 'system', content: `MOCKROLE=${CONDUCTOR_ID}` }] },
      receivedAt: 10,
    },
  ]
  for (const agent of PARADE_AGENTS) {
    const seat = PARADE_SEATS.get(agent)
    requests.push({
      role: agent,
      body: { model: seat.model, messages: [{ role: 'system', content: `MOCKROLE=${agent}` }] },
      receivedAt: 20,
    })
    requests.push({
      role: agent,
      body: { model: seat.model, messages: [{ role: 'user', content: 'read result: fixture' }] },
      receivedAt: 30,
    })
  }
  requests.push({
    role: 'sisyphus',
    body: {
      model: routes.sisyphus.model,
      messages: [{ role: 'user', content: PARADE_AGENTS.map(paradeChildNote).join('\n') }],
    },
    receivedAt: 100,
  })
  return requests
}

function fabricatedParadeInput(baseRoutes) {
  const routes = fabricatedParadeRoutes(baseRoutes)
  const parentLog = fabricatedParadeParentLog(routes)
  return {
    input: {
      log: parentLog,
      allLogs: [
        parentLog,
        ...PARADE_AGENTS.map((agent) => fabricatedParadeChildLog(agent, PARADE_SEATS.get(agent))),
      ],
      requests: fabricatedParadeRequests(routes),
      providersJson: fabricatedParadeProvidersJson(routes),
      bootLog: FABRICATED_BOOT_LOG,
      markerLanding: [CONDUCTOR_ID, ...PARADE_AGENTS].map((role) => ({ role, ok: true })),
    },
    routes,
  }
}

// ── fabricated P2-T19 inputs (both new analyses must earn their PASS) ────────

/**
 * The read-only child tool set the REAL read-only rows leave visible (mutation
 * tools and all ten delegation names filtered out); fabricated good inputs
 * mirror it, so "the absence checks are sensitive" has a matching positive.
 */
const FABRICATED_READ_ONLY_TOOLS = [
  { type: 'function', function: { name: 'read' } },
  { type: 'function', function: { name: 'grep' } },
  { type: 'function', function: { name: 'glob' } },
  { type: 'function', function: { name: 'bash' } },
]

const FABRICATED_PLAN_REVIEWER_WRITE_TARGET =
  '/fabricated/project/MOCK-PLAN-REVIEWER-WRITE-DENIED.txt'
const FABRICATED_ATLAS_ID = 'session-fabricated-atlas-child'
const FABRICATED_GRANDCHILD_ID = 'session-fabricated-grandchild'

/** Provider directory carrying EVERY provider in the given resolved route map. */
function fabricatedAllProvidersJson(routes) {
  return JSON.stringify({
    type: 'server-response',
    rpcId: 'x',
    result: {
      ok: true,
      value: {
        providers: [...new Set(Object.values(routes).map((route) => route.provider))]
          .map((provider) => ({ provider, active: true })),
      },
    },
  })
}

/** The effective route map the plan-reviewer scenario's env overlay resolves to. */
function fabricatedPlanReviewerRoutes(baseRoutes) {
  return { ...baseRoutes, 'plan-reviewer': PLAN_REVIEWER_SEAT }
}

/** The effective route map the atlas scenario's env overlay resolves to. */
function fabricatedAtlasRoutes(baseRoutes) {
  return { ...baseRoutes, atlas: ATLAS_SEAT }
}

/** Requests for a ONE-child scenario whose child role is not explore. */
function fabricatedSingleChildRequests(routes, childRole, childNote) {
  return [
    {
      role: 'sisyphus',
      body: { model: routes.sisyphus.model, messages: [{ role: 'system', content: `MOCKROLE=${CONDUCTOR_ID}` }] },
      receivedAt: 10,
    },
    {
      role: childRole,
      body: { model: routes[childRole].model, messages: [{ role: 'system', content: `MOCKROLE=${childRole}` }] },
      receivedAt: 20,
    },
    {
      role: childRole,
      body: {
        model: routes[childRole].model,
        messages: [
          { role: 'system', content: `MOCKROLE=${childRole}` },
          { role: 'user', content: `tool result: ${UNKNOWN_TOOL_WRITE_RESULT}` },
        ],
      },
      receivedAt: 30,
    },
    {
      role: 'sisyphus',
      body: {
        model: routes.sisyphus.model,
        messages: [
          { role: 'system', content: `MOCKROLE=${CONDUCTOR_ID}` },
          { role: 'user', content: `tool result: ${childNote}` },
        ],
      },
      receivedAt: 40,
    },
  ]
}

function fabricatedPlanReviewerInput(baseRoutes) {
  const routes = fabricatedPlanReviewerRoutes(baseRoutes)
  return {
    input: {
      log: fabricatedNegativeParentLog(
        routes,
        PLAN_REVIEWER_DENY_PROMPT,
        PLAN_REVIEWER_WRITE_NOTE,
        SISYPHUS_PLAN_REVIEWER_SUMMARY,
        'plan-reviewer',
      ),
      childLog: fabricatedNegativeChildLog(
        routes,
        'write',
        { file_path: FABRICATED_PLAN_REVIEWER_WRITE_TARGET, content: 'x' },
        UNKNOWN_TOOL_WRITE_RESULT,
        PLAN_REVIEWER_WRITE_NOTE,
        FABRICATED_READ_ONLY_TOOLS,
        'plan-reviewer',
      ),
      requests: fabricatedSingleChildRequests(routes, 'plan-reviewer', PLAN_REVIEWER_WRITE_NOTE),
      providersJson: fabricatedAllProvidersJson(routes),
      bootLog: FABRICATED_BOOT_LOG,
      writeTargetPath: FABRICATED_PLAN_REVIEWER_WRITE_TARGET,
    },
    routes,
  }
}

function fabricatedAtlasParentLog(routes) {
  return {
    path: '/fabricated/atlas-nested/parent/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: ATLAS_NESTED_PROMPT }] } },
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
      },
      {
        seq: 3,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1', name: 'atlas', arguments: JSON.stringify({ description: 'atlas', prompt: 'delegate', run_in_background: false }) },
      },
      {
        seq: 4,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: ATLAS_NESTED_NOTE }], isError: false }] } },
      },
      { seq: 5, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: SISYPHUS_ATLAS_SUMMARY }] } } },
      { seq: 6, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedAtlasChildLog(routes) {
  return {
    path: '/fabricated/atlas-nested/atlas/session.jsonl',
    header: {
      type: 'session',
      id: FABRICATED_ATLAS_ID,
      origin: 'subagent',
      parentSession: FABRICATED_PARENT_ID,
      delegationDepth: 1,
    },
    events: [
      {
        seq: 0,
        type: 'subagent/descriptor',
        data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'atlas', agentProvider: routes.atlas.provider, agentModel: routes.atlas.model },
      },
      {
        seq: 1,
        type: 'request/header',
        data: {
          header: {
            config: { provider: routes.atlas.provider, model: routes.atlas.model },
            // atlas is the orchestrator row: it keeps the WHOLE delegation roster.
            tools: [
              { type: 'function', function: { name: 'read' } },
              { type: 'function', function: { name: 'grep' } },
              ...DELEGATION_TOOL_NAMES.map((name) => ({ type: 'function', function: { name } })),
            ],
          },
          reason: 'initial',
        },
      },
      {
        seq: 2,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1', name: 'explore', arguments: JSON.stringify({ description: 'atlas→explore', prompt: 'read the README', run_in_background: false }) },
      },
      {
        seq: 3,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: ATLAS_GRANDCHILD_NOTE }], isError: false }] } },
      },
      { seq: 4, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: ATLAS_NESTED_NOTE }] } } },
      { seq: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedGrandchildLog(routes) {
  return {
    path: '/fabricated/atlas-nested/grandchild/session.jsonl',
    header: {
      type: 'session',
      id: FABRICATED_GRANDCHILD_ID,
      origin: 'subagent',
      parentSession: FABRICATED_ATLAS_ID,
      delegationDepth: 2,
    },
    events: [
      {
        seq: 1,
        type: 'request/header',
        data: {
          header: {
            config: { provider: routes.explore.provider, model: routes.explore.model },
            tools: FABRICATED_READ_ONLY_TOOLS,
          },
          reason: 'initial',
        },
      },
      {
        seq: 2,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1', name: 'read', arguments: JSON.stringify({ file_path: '/fabricated/project/README.md' }) },
      },
      { seq: 3, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: ATLAS_GRANDCHILD_NOTE }] } } },
      { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedAtlasNestedRequests(routes) {
  return [
    { role: 'sisyphus', body: { model: routes.sisyphus.model, messages: [{ role: 'system', content: `MOCKROLE=${CONDUCTOR_ID}` }] }, receivedAt: 10 },
    { role: 'atlas', body: { model: routes.atlas.model, messages: [{ role: 'system', content: 'MOCKROLE=atlas' }] }, receivedAt: 20 },
    { role: 'explore', body: { model: routes.explore.model, messages: [{ role: 'system', content: 'MOCKROLE=explore' }] }, receivedAt: 30 },
    {
      role: 'explore',
      body: {
        model: routes.explore.model,
        messages: [
          { role: 'system', content: 'MOCKROLE=explore' },
          { role: 'user', content: `read result: This is the omo-dsh ${DEMO_README_SENTINEL}` },
        ],
      },
      receivedAt: 40,
    },
    {
      role: 'atlas',
      body: {
        model: routes.atlas.model,
        messages: [
          { role: 'system', content: 'MOCKROLE=atlas' },
          { role: 'user', content: `tool result: ${ATLAS_GRANDCHILD_NOTE}` },
        ],
      },
      receivedAt: 50,
    },
    {
      role: 'sisyphus',
      body: {
        model: routes.sisyphus.model,
        messages: [
          { role: 'system', content: `MOCKROLE=${CONDUCTOR_ID}` },
          { role: 'user', content: `tool result: ${ATLAS_NESTED_NOTE}` },
        ],
      },
      receivedAt: 60,
    },
  ]
}

function fabricatedAtlasNestedInput(baseRoutes) {
  const routes = fabricatedAtlasRoutes(baseRoutes)
  const parentLog = fabricatedAtlasParentLog(routes)
  const atlasLog = fabricatedAtlasChildLog(routes)
  const grandchildLog = fabricatedGrandchildLog(routes)
  return {
    input: {
      log: parentLog,
      childLog: atlasLog,
      allLogs: [parentLog, atlasLog, grandchildLog],
      requests: fabricatedAtlasNestedRequests(routes),
      providersJson: fabricatedAllProvidersJson(routes),
      bootLog: FABRICATED_BOOT_LOG,
    },
    routes,
  }
}

// ── fabricated P3-T6 bash-read-guard-warned input (模式 C，must earn its PASS) ──
// The fabricated log mirrors the REAL runtime layout the scenario was pinned
// against (observed in a kept sandbox; see the header's T6 section): the
// advisory appears TWICE on the durable surface — once as the accepted splice
// into the next-step inbox and once as the claimed `user/message` — which is
// why the "exactly once" count is scoped per EVENT TYPE, never a raw byte
// count over the whole file.

const FABRICATED_BASH_GUARD_FIXTURE_PATH = '/fabricated/project/notes.txt'

/** The advisory message exactly as the listener mints it (source triple). */
function fabricatedBashGuardAdvisoryMessage(id) {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text: BASH_GUARD_ADVISORY_TEXT }],
    source: { kind: 'plugin', plugin: BASH_FILE_READ_GUARD_PLUGIN, form: 'notice' },
  }
}

function fabricatedBashGuardLog(routes) {
  const catCommand = `cat ${FABRICATED_BASH_GUARD_FIXTURE_PATH}`
  const pipelineCommand = `cat ${FABRICATED_BASH_GUARD_FIXTURE_PATH} | grep ${BASH_GUARD_GREP_WORD}`
  const resultEvent = (seq, callId, text) => ({
    seq,
    type: 'tool/result',
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'user',
        content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }], isError: false }],
      },
    },
  })
  return {
    path: '/fabricated/bash-guard/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: BASH_GUARD_PROMPT }] } },
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
      },
      {
        seq: 3,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1-0', name: 'bash', arguments: JSON.stringify({ command: catCommand, description: 'Read the notes fixture with cat' }) },
      },
      {
        seq: 4,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1-1', name: 'bash', arguments: JSON.stringify({ command: pipelineCommand, description: 'Read the notes fixture through a pipeline' }) },
      },
      {
        seq: 5,
        type: 'tool/call',
        data: { turn: 1, step: 1, callId: 'mock-llm-tool-1-2', name: 'read', arguments: JSON.stringify({ file_path: FABRICATED_BASH_GUARD_FIXTURE_PATH }) },
      },
      resultEvent(6, 'mock-llm-tool-1-0', BASH_GUARD_FIXTURE_CONTENT),
      resultEvent(7, 'mock-llm-tool-1-1', `${BASH_GUARD_FIXTURE_GREP_LINE}\n`),
      resultEvent(8, 'mock-llm-tool-1-2', `1→${BASH_GUARD_FIXTURE_FIRST_LINE}\n2→${BASH_GUARD_FIXTURE_GREP_LINE}\n`),
      {
        seq: 9,
        type: 'agent/inbox/spliced',
        data: { target: 'next-step', start: 0, inserted: [fabricatedBashGuardAdvisoryMessage('fabricated-advisory-1')] },
      },
      {
        seq: 10,
        type: 'user/message',
        data: fabricatedBashGuardAdvisoryMessage('fabricated-advisory-1'),
      },
      {
        seq: 11,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'continue' },
      },
      { seq: 12, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: BASH_GUARD_SUMMARY }] } } },
      { seq: 13, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedBashGuardInput(routes) {
  return {
    log: fabricatedBashGuardLog(routes),
    requests: [
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 10 },
      {
        role: 'sisyphus',
        body: {
          model: routes.sisyphus.model,
          messages: [
            { role: 'system', content: 'MOCKROLE=sisyphus' },
            { role: 'user', content: BASH_GUARD_ADVISORY_TEXT },
          ],
        },
        receivedAt: 20,
      },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
    fixturePath: FABRICATED_BASH_GUARD_FIXTURE_PATH,
  }
}

/**
 * P2-T18 MOCKROLE landing self-test (hermetic, no spawn). Renders the REAL
 * concerto template through the REAL renderers (concerto-preset.ts
 * renderAgentSentinels + system-prompt.ts renderPersonaIntoComposition),
 * materializes it into a throwaway sandbox, injects all 11 markers, and
 * verifies BY LINE NUMBER that each marker is the first content line under its
 * OWN row's block scalar — the exact failure R-6 predicted (a marker stamped
 * into a neighbouring persona row). Also pins idempotence and the loud
 * unknown-role throw. Async only because the plugin modules are imported
 * lazily (the driver's hot path does not need them).
 */
async function runMockRoleLandingSelfTest() {
  const problems = []
  const sandbox = createSandbox()
  try {
    const template = readFileSync(join(PLUGIN_DIR, 'concerto', 'agent.cordis.yml'), 'utf8')
    const preset = await import(
      new URL('../../patches/omo-dsh/omo-agents/src/concerto-preset.ts', import.meta.url).href
    )
    const systemPrompt = await import(
      new URL('../../patches/omo-dsh/omo-agents/src/system-prompt.ts', import.meta.url).href
    )
    const rendered = systemPrompt.renderPersonaIntoComposition(
      preset.renderAgentSentinels(template),
      systemPrompt.buildSisyphusSystemPrompt(),
    )
    const compositionPath = materializedCompositionPath(sandbox)
    mkdirSync(dirname(compositionPath), { recursive: true })
    writeFileSync(compositionPath, rendered)

    const roles = [CONDUCTOR_ID, ...PARADE_AGENTS]
    for (const role of roles) appendMockRoleMarker(sandbox, role)
    const once = readFileSync(compositionPath, 'utf8')
    for (const role of roles) appendMockRoleMarker(sandbox, role)
    if (readFileSync(compositionPath, 'utf8') !== once) {
      problems.push('appendMockRoleMarker is not idempotent (a second pass changed the file)')
    }
    for (const role of roles) {
      const landing = verifyMockRoleMarkerLanding(sandbox, role)
      if (landing.ok !== true) {
        problems.push(`MOCKROLE landing for '${role}' is wrong: ${JSON.stringify(landing)}`)
      }
    }
    const markerLines = once.split('\n').filter((line) => /^\s*MOCKROLE=/.test(line))
    if (markerLines.length !== roles.length) {
      problems.push(`expected ${roles.length} MOCKROLE lines, found ${markerLines.length}`)
    }
    // The idempotence guard must be line-anchored, not substring-based:
    // `MOCKROLE=sisyphus` must NOT be satisfied by `MOCKROLE=sisyphus-junior`
    // (still present in the file when the shorter role's own line is removed).
    for (const role of [CONDUCTOR_ID, 'explore']) {
      const markerLine = `${MOCKROLE_BLOCK_SCALARS.get(role).indent}MOCKROLE=${role}`
      const stripped = once.split('\n').filter((line) => line !== markerLine).join('\n')
      writeFileSync(compositionPath, stripped)
      appendMockRoleMarker(sandbox, role)
      const reLanding = verifyMockRoleMarkerLanding(sandbox, role)
      if (reLanding.ok !== true) {
        problems.push(`re-injection of '${role}' after removal landed wrong: ${JSON.stringify(reLanding)}`)
      }
      writeFileSync(compositionPath, once)
    }
    try {
      appendMockRoleMarker(sandbox, 'not-a-roster-agent')
      problems.push('appendMockRoleMarker must throw for an unknown role')
    } catch {
      // expected: loud unknown-role failure
    }

    // MUTATION QA for the R-6 failure mode itself: reproduce the OLD
    // implementation's `String.replace('persona: |-', …)` — since that header is
    // no longer unique (ten delegation rows), the marker lands under the FIRST
    // persona row (explore's), not the intended role's. The verifier MUST
    // report that as a failed landing, otherwise the landing check could not
    // catch the very bug it exists for.
    const naiveRole = 'oracle'
    writeFileSync(
      compositionPath,
      once.replace('persona: |-\n', `persona: |-\n          MOCKROLE=${naiveRole}\n`),
    )
    const naiveLanding = verifyMockRoleMarkerLanding(sandbox, naiveRole)
    if (naiveLanding.ok !== false) {
      problems.push(
        'the landing verifier missed the R-6 wrong-row injection (first-hit needle) '
        + `for '${naiveRole}': ${JSON.stringify(naiveLanding)}`,
      )
    }
    if (!verifyMockRoleMarkerLanding(sandbox, 'explore').actual?.includes(naiveRole)) {
      problems.push('the R-6 mutation fixture did not actually land oracle\'s marker in explore\'s row')
    }
  } catch (error) {
    problems.push(`MOCKROLE landing self-test crashed: ${error.message}`)
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true })
  }
  return problems
}

async function runAnalysisSelfTest(routes) {
  const problems = []
  const good = analyzeHello(
    {
      log: fabricatedGoodLog(routes),
      requests: [{ role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 0 }],
      providersJson: fabricatedProvidersJson(routes),
      bootLog: FABRICATED_BOOT_LOG,
    },
    routes,
  )
  if (good.result !== 'PASS') {
    problems.push(`fabricated GOOD log must PASS, got FAIL on: ${good.failed.join(', ')}`)
  }
  // Each fabricated defect must be caught by its own check (no vacuous PASS).
  const defectCases = [
    ['missing turn/end', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'turn/end')
    }, 'turnCompleted'],
    ['wrong route in request/header', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { config: { provider: 'wrong', model: 'wrong' } }, reason: 'initial' } }
          : event)
    }, 'routeHeaderMatchesSisyphus'],
    ['mock never called', (input) => {
      input.requests = []
    }, 'mockSawExactlyOneSisyphusCall'],
    ['no session log', (input) => {
      input.log = undefined
    }, 'sessionLogFound'],
  ]
  for (const [label, mutate, expectedCheck] of defectCases) {
    const input = {
      log: fabricatedGoodLog(routes),
      requests: [{ role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 0 }],
      providersJson: fabricatedProvidersJson(routes),
      bootLog: FABRICATED_BOOT_LOG,
    }
    mutate(input)
    const verdict = analyzeHello(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── demo analysis: fabricated good log must PASS; each fabricated chain
  // break must FAIL naming its own link (T19's failure QA, hermetic half).
  const goodDemo = analyzeDemo(fabricatedGoodDemoInput(routes), routes)
  if (goodDemo.result !== 'PASS') {
    problems.push(`fabricated GOOD demo must PASS, got FAIL on: ${goodDemo.failed.join(', ')}`)
  }
  const demoDefectCases = [
    // THE T19 failure case: the explore step removed — the child never ran,
    // so the assertion must name link 2 (and only chain-derived checks may
    // join it).
    ['explore step removed (no child, no explore requests)', (input) => {
      input.childLog = undefined
      input.requests = input.requests.filter((request) => request.role !== 'explore')
      // without the findings the parent cannot produce them: the tool result
      // and the second sisyphus request lose the findings bytes too.
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          ? { ...event, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'text', text: 'Error: mock role unknown' }] } } }
          : event)
      input.requests = input.requests.map((request) =>
        request.role === 'sisyphus' && request.receivedAt === 40
          ? { ...request, body: { model: request.body.model, messages: [{ role: 'user', content: 'tool result: error' }] } }
          : request)
    }, 'link2ExploreRanAndReadReadme'],
    ['no explore tool_call in the parent log', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/call')
    }, 'link1SisyphusCalledExploreTool'],
    ['findings never returned to the parent', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
      input.requests = input.requests.map((request) =>
        request.role === 'sisyphus' && request.receivedAt === 40
          ? { ...request, body: { model: request.body.model, messages: [] } }
          : request)
    }, 'link3ExploreResultReturnedToSisyphus'],
    ['no final summary', (input) => {
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'assistant/message' && eventText(event).includes(SISYPHUS_SUMMARY)),
      )
    }, 'link4SisyphusSummarizedFindings'],
    ['out-of-order parent events', (input) => {
      const call = input.log.events.find((event) => event.type === 'tool/call')
      call.seq = 99 // the call landing AFTER the result/summary breaks the order
    }, 'chainObservedInOrder'],
    ['child on the wrong route', (input) => {
      input.childLog = fabricatedGoodDemoChildLog(routes)
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { config: { provider: 'wrong', model: 'wrong' } }, reason: 'initial' } }
          : event)
    }, 'link2ExploreRanAndReadReadme'],
  ]
  for (const [label, mutate, expectedCheck] of demoDefectCases) {
    const input = fabricatedGoodDemoInput(routes)
    mutate(input)
    const verdict = analyzeDemo(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated demo defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── AC-5 mutation QA (plan T20 failure (a)): mutate the MODEL-ROUTE INPUT
  // — resolveModelRoutes()' output is exactly what the settings.yaml
  // model-route rows feed — and the route-pair checks must fail.
  // (a1) swapped routes: both membership checks must fail.
  const swappedRoutes = { sisyphus: routes.explore, explore: routes.sisyphus }
  const swappedVerdict = analyzeDemo(fabricatedGoodDemoInput(routes), swappedRoutes)
  if (
    swappedVerdict.result !== 'FAIL'
    || !swappedVerdict.failed.includes('routePairParentRequestHeaderIsSisyphus')
    || !swappedVerdict.failed.includes('routePairChildRequestHeaderIsExplore')
  ) {
    problems.push(`AC-5 mutation "routes swapped" must FAIL with both route-pair membership checks, got ${swappedVerdict.result} (${swappedVerdict.failed.join(', ')})`)
  }
  // (a2) collapsed routes (both agents resolve to the SAME route) with both
  // logs observing that same route: ONLY routePairDistinct may fail — the
  // isolation proves the distinctness check is the one that lies.
  const collapsedRoutes = { sisyphus: routes.sisyphus, explore: routes.sisyphus }
  const collapsedInput = fabricatedGoodDemoInput(routes)
  collapsedInput.childLog.events = collapsedInput.childLog.events.map((event) =>
    event.type === 'request/header'
      ? { ...event, data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' } }
      : event)
  const collapsedVerdict = analyzeDemo(collapsedInput, collapsedRoutes)
  if (
    collapsedVerdict.result !== 'FAIL'
    || !collapsedVerdict.failed.includes('routePairDistinct')
    || collapsedVerdict.failed.includes('routePairParentRequestHeaderIsSisyphus')
    || collapsedVerdict.failed.includes('routePairChildRequestHeaderIsExplore')
  ) {
    problems.push(`AC-5 mutation "routes collapsed to equal" must FAIL with ONLY routePairDistinct among the pair checks, got ${collapsedVerdict.result} (${collapsedVerdict.failed.join(', ')})`)
  }

  // ── AC-6a self-test (plan T20 failure (b)): the fabricated good input must
  // PASS; a fabricated log WITHOUT the unknown-tool error must FAIL on
  // writeAttemptRejectedWithUnknownTool; likewise for the other two checks.
  const goodWrite = analyzeExploreWriteDenied(fabricatedGoodWriteInput(routes), routes)
  if (goodWrite.result !== 'PASS') {
    problems.push(`fabricated GOOD write-denied must PASS, got FAIL on: ${goodWrite.failed.join(', ')}`)
  }
  const writeDefectCases = [
    ['write attempt not rejected (success instead of unknown-tool error)', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          ? { ...event, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: 'file written' }], isError: false }] } } }
          : event)
    }, 'writeAttemptRejectedWithUnknownTool'],
    ['write advertised in the child tool schema', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { ...event.data.header, tools: [...event.data.header.tools, { type: 'function', function: { name: 'write' } }] } } }
          : event)
    }, 'childAdvertisedToolsExcludeWriteEdit'],
    ['write target landed on disk', (input) => {
      input.writeTargetPath = fileURLToPath(import.meta.url) // this very file exists
    }, 'writeTargetAbsentOnDisk'],
    ['child note never returned to the parent', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
    }, 'childOutcomeReturnedAndParentClosed'],
  ]
  for (const [label, mutate, expectedCheck] of writeDefectCases) {
    const input = fabricatedGoodWriteInput(routes)
    mutate(input)
    const verdict = analyzeExploreWriteDenied(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated write-denied defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── AC-6b self-test (plan T20 failure (c)): good input PASSes; a
  // fabricated log WITHOUT the unknown-tool rejection FAILs on
  // nestedDelegationRejectedWithUnknownTool; a grandchild session FAILs on
  // noGrandchildSessionCreated; a delegation tool STILL PRESENT in the child
  // FAILs on delegationToolAbsentFromChild.
  const goodNested = analyzeExploreNestedDelegationDenied(fabricatedGoodNestedInput(routes), routes)
  if (goodNested.result !== 'PASS') {
    problems.push(`fabricated GOOD nested-delegation-denied must PASS, got FAIL on: ${goodNested.failed.join(', ')}`)
  }
  const nestedDefectCases = [
    ['nested delegation not rejected (no unknown-tool error)', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          ? { ...event, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: 'nested run completed' }], isError: false }] } } }
          : event)
    }, 'nestedDelegationRejectedWithUnknownTool'],
    ['grandchild session exists', (input) => {
      input.allLogs = [
        ...input.allLogs,
        {
          path: '/fabricated/grandchild/session.jsonl',
          header: { type: 'session', id: 'session-fabricated-grandchild', origin: 'subagent', parentSession: FABRICATED_CHILD_ID, delegationDepth: 2 },
          events: [],
        },
      ]
    }, 'noGrandchildSessionCreated'],
    ['delegation tool still present in the child', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { ...event.data.header, tools: [...event.data.header.tools, { type: 'function', function: { name: 'explore' } }] } } }
          : event)
    }, 'delegationToolAbsentFromChild'],
    ['child note never returned to the parent', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
    }, 'childOutcomeReturnedAndParentClosed'],
  ]
  for (const [label, mutate, expectedCheck] of nestedDefectCases) {
    const input = fabricatedGoodNestedInput(routes)
    mutate(input)
    const verdict = analyzeExploreNestedDelegationDenied(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated nested-delegation defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P2-T18 roster-parade self-test: the fabricated good input must PASS and
  // every fabricated defect must fail on its OWN named check.
  const parade = fabricatedParadeInput(routes)
  const goodParade = analyzeRosterParade(parade.input, parade.routes)
  if (goodParade.result !== 'PASS') {
    problems.push(`fabricated GOOD roster-parade must PASS, got FAIL on: ${goodParade.failed.join(', ')}`)
  }
  const paradeDefectCases = [
    ['a MOCKROLE marker landed in the wrong row', (input) => {
      input.markerLanding[3] = { ...input.markerLanding[3], ok: false }
    }, 'mockRoleMarkersLandedInCorrectRows'],
    ['one child session never ran', (input) => {
      input.allLogs = input.allLogs.filter((candidate) => !candidate.path.includes('/oracle/'))
    }, 'allTenChildSessionsRan'],
    ['a child ran on the wrong route', (input) => {
      input.allLogs = input.allLogs.map((candidate) =>
        candidate.path.includes('/atlas/')
          ? {
              ...candidate,
              events: candidate.events.map((event) =>
                event.type === 'request/header'
                  ? { ...event, data: { header: { config: { provider: 'wrong', model: 'wrong' } }, reason: 'initial' } }
                  : event),
            }
          : candidate)
    }, 'everyChildRouteMatchedConfiguredSeat'],
    ['the conductor split the batch across two messages', (input) => {
      const batchIndex = input.log.events.findIndex(
        (event) => event.type === 'assistant/message'
          && (event.data?.message?.content ?? []).some((block) => block?.type === 'tool-call'),
      )
      const batch = input.log.events[batchIndex]
      const blocks = batch.data.message.content
      const half = Math.floor(blocks.length / 2)
      input.log.events.splice(
        batchIndex,
        1,
        { ...batch, data: { ...batch.data, message: { content: blocks.slice(0, half) } } },
        { ...batch, seq: batch.seq + 0.5, data: { ...batch.data, message: { content: blocks.slice(half) } } },
      )
    }, 'allTenDelegationsInOneMessage'],
    ['a child note never returned to the conductor', (input) => {
      const note = paradeChildNote(PARADE_AGENTS[0])
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'tool/result' && eventText(event).includes(note)),
      )
    }, 'everyChildNoteReturnedToConductor'],
    ['a route provider is not active', (input) => {
      input.providersJson = JSON.stringify({
        type: 'server-response',
        rpcId: 'x',
        result: { ok: true, value: { providers: [{ provider: 'deepseek', active: false }] } },
      })
    }, 'everyRouteProviderActive'],
  ]
  for (const [label, mutate, expectedCheck] of paradeDefectCases) {
    const mutated = fabricatedParadeInput(routes)
    mutate(mutated.input)
    const verdict = analyzeRosterParade(mutated.input, mutated.routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated roster-parade defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P2-T19 plan-reviewer-write-denied self-test: the fabricated good input
  // must PASS; each fabricated defect must fail on its OWN named check.
  const planReviewer = fabricatedPlanReviewerInput(routes)
  const goodPlanReviewer = analyzePlanReviewerWriteDenied(planReviewer.input, planReviewer.routes)
  if (goodPlanReviewer.result !== 'PASS') {
    problems.push(`fabricated GOOD plan-reviewer-write-denied must PASS, got FAIL on: ${goodPlanReviewer.failed.join(', ')}`)
  }
  const planReviewerDefectCases = [
    ['write attempt not rejected (success instead of unknown-tool error)', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          ? { ...event, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: 'file written' }], isError: false }] } } }
          : event)
    }, 'writeAttemptRejectedWithUnknownTool'],
    ['write advertised in the read-only child tool schema', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { ...event.data.header, tools: [...event.data.header.tools, { type: 'function', function: { name: 'write' } }] } } }
          : event)
    }, 'childAdvertisedToolsExcludeWriteEdit'],
    ['a delegation tool advertised in the read-only child schema', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { ...event.data.header, tools: [...event.data.header.tools, { type: 'function', function: { name: 'hephaestus' } }] } } }
          : event)
    }, 'childAdvertisedToolsExcludeAllDelegationTools'],
    ['write target landed on disk', (input) => {
      input.writeTargetPath = fileURLToPath(import.meta.url) // this very file exists
    }, 'writeTargetAbsentOnDisk'],
    ['the child ran on the wrong seat', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { config: { provider: 'wrong', model: 'wrong' } }, reason: 'initial' } }
          : event)
    }, 'childRanOnItsConfiguredSeat'],
    ['the child note never returned to the parent', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
    }, 'childOutcomeReturnedAndParentClosed'],
  ]
  for (const [label, mutate, expectedCheck] of planReviewerDefectCases) {
    const mutated = fabricatedPlanReviewerInput(routes)
    mutate(mutated.input)
    const verdict = analyzePlanReviewerWriteDenied(mutated.input, mutated.routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated plan-reviewer-write-denied defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P2-T19 atlas-nested-delegation self-test: the fabricated good input must
  // PASS; each fabricated defect must fail on its OWN named check — including
  // the depth-rejection mutation, which proves the positive chain's success
  // assertions are sensitive to a dispatch that never produced a grandchild.
  const atlas = fabricatedAtlasNestedInput(routes)
  const goodAtlas = analyzeAtlasNestedDelegation(atlas.input, atlas.routes)
  if (goodAtlas.result !== 'PASS') {
    problems.push(`fabricated GOOD atlas-nested-delegation must PASS, got FAIL on: ${goodAtlas.failed.join(', ')}`)
  }
  const atlasDefectCases = [
    ['the nested dispatch was rejected with the depth-cap error (no grandchild)', (input) => {
      input.allLogs = input.allLogs.filter((candidate) => candidate.header?.id !== FABRICATED_GRANDCHILD_ID)
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          ? { ...event, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-1', content: [{ type: 'text', text: 'Error: subagent depth 3 exceeds maxDepth 2' }], isError: true }] } } }
          : event)
    }, 'grandchildSessionRan'],
    ['the grandchild ran on the wrong route', (input) => {
      input.allLogs = input.allLogs.map((candidate) =>
        candidate.header?.id === FABRICATED_GRANDCHILD_ID
          ? {
              ...candidate,
              events: candidate.events.map((event) =>
                event.type === 'request/header'
                  ? { ...event, data: { header: { config: { provider: 'wrong', model: 'wrong' } }, reason: 'initial' } }
                  : event),
            }
          : candidate)
    }, 'grandchildRanOnExploreSeat'],
    ['atlas ran on the wrong seat', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { config: { provider: 'wrong', model: 'wrong' } }, reason: 'initial' } }
          : event)
    }, 'atlasRanOnItsConfiguredSeat'],
    ['atlas lost the delegation tools it needs to re-delegate', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'request/header'
          ? { ...event, data: { header: { ...event.data.header, tools: event.data.header.tools.filter((tool) => tool.function.name !== 'explore') } } }
          : event)
    }, 'atlasAdvertisesAllDelegationTools'],
    ['the read-only grandchild advertised the delegation tools', (input) => {
      input.allLogs = input.allLogs.map((candidate) =>
        candidate.header?.id === FABRICATED_GRANDCHILD_ID
          ? {
              ...candidate,
              events: candidate.events.map((event) =>
                event.type === 'request/header'
                  ? { ...event, data: { header: { ...event.data.header, tools: [...event.data.header.tools, { type: 'function', function: { name: 'explore' } }] } } }
                  : event),
            }
          : candidate)
    }, 'readOnlyGrandchildLacksMutationAndDelegationTools'],
    ['the grandchild findings never reached atlas', (input) => {
      input.requests = input.requests.map((request) =>
        request.role === 'atlas' && request.receivedAt === 50
          ? { ...request, body: { model: request.body.model, messages: [] } }
          : request)
    }, 'grandchildFindingsReachedAtlasModel'],
    ['atlas report never returned to the conductor', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
    }, 'atlasReportReachedConductorModel'],
    ['out-of-order atlas-leg events', (input) => {
      const call = input.childLog.events.find((event) => event.type === 'tool/call')
      call.seq = 99
    }, 'chainObservedInOrder'],
  ]
  for (const [label, mutate, expectedCheck] of atlasDefectCases) {
    const mutated = fabricatedAtlasNestedInput(routes)
    mutate(mutated.input)
    const verdict = analyzeAtlasNestedDelegation(mutated.input, mutated.routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated atlas-nested-delegation defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P3-T6 bash-read-guard-warned self-test: the fabricated good input (the
  // REAL runtime layout) must PASS; a log with NO advisory injection must FAIL
  // on the injection check, and a DUPLICATED injection must FAIL on the
  // exactly-once count — the two mutations the C-mode pilot exists to catch.
  const goodBashGuard = analyzeBashReadGuardWarned(fabricatedBashGuardInput(routes), routes)
  if (goodBashGuard.result !== 'PASS') {
    problems.push(`fabricated GOOD bash-read-guard-warned must PASS, got FAIL on: ${goodBashGuard.failed.join(', ')}`)
  }
  const bashGuardDefectCases = [
    ['no advisory injection in the session log', (input) => {
      input.log.events = input.log.events.filter(
        (event) => event.type !== 'user/message'
          || !messageContentText(event.data).includes(BASH_GUARD_ADVISORY_TEXT),
      ).filter(
        (event) => event.type !== 'agent/inbox/spliced'
          || event.data?.target !== 'next-step',
      )
      input.requests = input.requests.map((request) =>
        request.receivedAt === 20
          ? { ...request, body: { model: request.body.model, messages: [{ role: 'user', content: 'no advisory' }] } }
          : request)
    }, 'advisoryInjectedIntoSessionLog'],
    ['the advisory was injected twice (double trigger / idempotence drift)', (input) => {
      const events = input.log.events
      const spliceIndex = events.findIndex((event) => event.type === 'agent/inbox/spliced')
      const messageIndex = events.findIndex(
        (event) => event.type === 'user/message'
          && messageContentText(event.data).includes(BASH_GUARD_ADVISORY_TEXT),
      )
      events.splice(spliceIndex + 1, 0, {
        ...events[spliceIndex],
        seq: 9.1,
        data: {
          ...events[spliceIndex].data,
          inserted: [fabricatedBashGuardAdvisoryMessage('fabricated-advisory-2')],
        },
      })
      events.splice(messageIndex + 2, 0, {
        ...events[messageIndex],
        seq: 10.1,
        data: fabricatedBashGuardAdvisoryMessage('fabricated-advisory-2'),
      })
    }, 'advisoryInjectedExactlyOnce'],
    // The advisory must really be a NON-blocking outcome: the TRIGGER's own
    // tool/result carrying isError is the exact failure mode a "guard" that
    // BLOCKED the command would produce (the check requires `isError !== true`
    // AND the fixture bytes on the result of the `cat <fixture>` call).
    //
    // SURGICAL, by construction: the rewrite is addressed by the trigger call's
    // OWN toolCallId (resolved from the log's `bash cat <fixture>` tool/call —
    // the same identity the analyzer uses), so ONLY that one tool-result part
    // is touched. A predicate over result TEXT cannot be surgical here: the
    // fixture sentinel also occurs in the `read` result's line-numbered text,
    // and rewriting that part (or stamping the trigger's callId onto it) deletes
    // the read result and makes readToolRanWithoutAdvisory fail as collateral —
    // i.e. the "defect" would no longer be the single named failure it claims.
    ['the trigger result came back as an error (isError: true)', (input) => {
      const triggerCall = input.log.events.find(
        (event) => event.type === 'tool/call'
          && event.data?.name === 'bash'
          && toolCallArguments(event)?.command === `cat ${input.fixturePath}`,
      )
      const triggerCallId = triggerCall?.data?.callId
      if (triggerCallId === undefined) return
      input.log.events = input.log.events.map((event) => {
        if (event.type !== 'tool/result') return event
        const parts = event.data?.message?.content
        if (!Array.isArray(parts) || !parts.some((part) => part.toolCallId === triggerCallId)) {
          return event
        }
        return {
          ...event,
          data: {
            ...event.data,
            message: {
              ...event.data.message,
              content: parts.map((part) => (part.toolCallId === triggerCallId
                ? { ...part, isError: true }
                : part)),
            },
          },
        }
      })
    }, 'bashTriggerExecutedWithFixtureBytes'],
  ]
  for (const [label, mutate, expectedCheck] of bashGuardDefectCases) {
    const input = fabricatedBashGuardInput(routes)
    mutate(input)
    const verdict = analyzeBashReadGuardWarned(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated bash-read-guard-warned defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P2-T18 MOCKROLE landing (hermetic, real template + real renderers).
  problems.push(...await runMockRoleLandingSelfTest())
  return problems
}

// ── scenario definitions ─────────────────────────────────────────────────────
// Each scenario runs fully isolated: its own sandbox, its own mock server
// (per-role cursors stay scenario-scoped), its own dsh boot. `roles` lists
// the MOCKROLE markers to deliver into the materialized preset; `env` is the
// scenario's OMO_<AGENT>_* seat overlay (P2-T18; resolved through the SAME
// resolveModelRoutes the spawned dsh runs, so settings/agentOptions and the
// assertions share one source); `seed` runs before the mock starts (fixtures
// the script points at); `script(sandbox)` builds the mock script (absolute
// fixture paths need the sandbox).

const SCENARIOS = [
  {
    name: 'hello',
    prompt: HELLO_PROMPT,
    roles: ['sisyphus'],
    script: () => HELLO_SCRIPT,
    analyze: analyzeHello,
  },
  {
    name: 'concerto-delegation-demo',
    prompt: DEMO_PROMPT,
    roles: ['sisyphus', 'explore'],
    seed: (sandbox) => {
      writeFileSync(join(sandbox.project, 'README.md'), DEMO_README_CONTENT)
    },
    script: demoScript,
    analyze: analyzeDemo,
  },
  {
    // P3-T6 (plan §4.2 mode C pilot; task book WP-2): the FIRST omo-hooks
    // listener proves its whole delivery chain in one real run — `cat <file>`
    // executes unchanged, the advisory rides additionalContexts into the next
    // request, and the two negative boundaries (piped `cat`, `read` tool)
    // really run without a second injection. Every later 劝导演出型 hook copies
    // this scenario's shape.
    name: 'bash-read-guard-warned',
    prompt: BASH_GUARD_PROMPT,
    roles: ['sisyphus'],
    seed: (sandbox) => {
      writeFileSync(join(sandbox.project, BASH_GUARD_FIXTURE_NAME), BASH_GUARD_FIXTURE_CONTENT)
    },
    script: bashReadGuardScript,
    analysisInput: (sandbox) => ({
      fixturePath: join(sandbox.project, BASH_GUARD_FIXTURE_NAME),
    }),
    analyze: analyzeBashReadGuardWarned,
  },
  {
    // AC-6a (T20): the explore child hallucinates a write; the T12 deny
    // rejects it verbatim and no bytes land on disk.
    name: 'explore-write-denied',
    prompt: WRITE_DENY_PROMPT,
    roles: ['sisyphus', 'explore'],
    script: writeDeniedScript,
    analysisInput: (sandbox) => ({
      writeTargetPath: join(sandbox.project, WRITE_TARGET_NAME),
    }),
    analyze: analyzeExploreWriteDenied,
  },
  {
    // AC-6b (T20): the explore child (depth 1) attempts a nested delegation;
    // the T13 cap rejects it verbatim before any grandchild exists.
    name: 'explore-nested-delegation-denied',
    prompt: NESTED_DENY_PROMPT,
    roles: ['sisyphus', 'explore'],
    script: nestedDelegationScript,
    analyze: analyzeExploreNestedDelegationDenied,
  },
  {
    // P2-T18 (plan §4.7; Phase 2 exit criterion a): the conductor delegates to
    // ALL 10 roster agents in ONE message; every child runs on its own
    // env-configured REAL catalog seat. `env` distributes the 10 seats over
    // the 7 real pairs (PARADE_SEATS); the conductor keeps its default seat so
    // the AC-5 sisyphus≠explore pair stays meaningful.
    name: 'roster-parade',
    prompt: PARADE_PROMPT,
    roles: [CONDUCTOR_ID, ...PARADE_AGENTS],
    env: paradeEnv(),
    seed: (sandbox) => {
      writeFileSync(join(sandbox.project, 'README.md'), DEMO_README_CONTENT)
    },
    script: paradeScript,
    analyze: analyzeRosterParade,
  },
  {
    // P2-T19 (plan §4.7 scenario ②; AC-6a generalized to a new read-only row):
    // plan-reviewer hallucinates a `write`; the class filter rejects it as an
    // unknown tool and the target never lands on disk. The child's own seat is
    // env-pinned (OMO_PLAN_REVIEWER_*) to a real pair distinct from the
    // conductor's, so the route assertion is discriminating.
    name: 'plan-reviewer-write-denied',
    prompt: PLAN_REVIEWER_DENY_PROMPT,
    roles: [CONDUCTOR_ID, 'plan-reviewer'],
    env: delegationSeatEnv('plan-reviewer', PLAN_REVIEWER_SEAT),
    script: planReviewerWriteDeniedScript,
    analysisInput: (sandbox) => ({
      writeTargetPath: join(sandbox.project, PLAN_REVIEWER_WRITE_TARGET_NAME),
    }),
    analyze: analyzePlanReviewerWriteDenied,
  },
  {
    // P2-T19 (plan §4.7 scenario ③): the POSITIVE nested chain —
    // conductor → atlas (depth 1) → explore (depth 2). atlas keeps the
    // delegation roster, so its `explore` call is advertised and the depth-2
    // grandchild really runs; the read-only absence claim is re-asserted on the
    // GRANDCHILD (plan §4.7 对照语义注意), never as a depth error.
    //
    // ENABLED in the default chain 2026-09-13 (arbiter D-2026-09-13-01): it was
    // withheld while the composition carried the per-class caps
    // (explore/worker/allowlist = 1, atlas = 2), because dsh's depth gate reads
    // the INVOKED row's `config.maxDepth` — a depth-1 atlas calling the
    // maxDepth-1 explore row was rejected with 'Error: subagent depth 2 exceeds
    // maxDepth 1' before any child existed. All ten delegation rows now carry
    // maxDepth 2, so the depth-2 dispatch this scenario asserts is legal by
    // construction (chain cap 2: conductor 0 → atlas 1 → worker 2).
    name: 'atlas-nested-delegation',
    prompt: ATLAS_NESTED_PROMPT,
    roles: [CONDUCTOR_ID, 'atlas', 'explore'],
    env: delegationSeatEnv('atlas', ATLAS_SEAT),
    seed: (sandbox) => {
      writeFileSync(join(sandbox.project, 'README.md'), DEMO_README_CONTENT)
    },
    script: atlasNestedDelegationScript,
    analyze: analyzeAtlasNestedDelegation,
  },
]

/**
 * Run one scenario end-to-end. Returns the scenario verdict object; the
 * sandbox root is handed back for the caller's cleanup/digest accounting.
 */
async function runScenario(def, baseRoutes) {
  const sandbox = createSandbox()
  console.error(`drive: [${def.name}] sandbox ${sandbox.root}`)
  // P2-T18: the scenario's own env overlay is resolved through the SAME
  // resolver the spawned dsh runs, so agentOptions/settings and the assertions
  // can never disagree about a seat.
  const env = scenarioEnv(sandbox, def.env)
  const routes = def.env === undefined ? baseRoutes : resolveModelRoutes(env)
  const server = await startMockLlmServer({ script: def.script(sandbox) })
  let child
  let scenario = { name: def.name, result: 'FAIL', failed: ['driver did not complete'] }
  try {
    const patchPath = seedSandbox(sandbox, routes, server.baseUrl)
    def.seed?.(sandbox) // fixtures land after seedSandbox mkdirs the project dir
    console.error(`drive: [${def.name}] stage 0 — dsh plugin add into the sandbox profile`)
    installPlugin(sandbox, env)

    console.error(`drive: [${def.name}] booting dsh --profile web --patch ./cordis.yml --patch <e2e> --port 0`)
    const boot = await bootDsh(sandbox, patchPath, env)
    child = boot.child
    console.error(`drive: [${def.name}] web ready on 127.0.0.1:${boot.port} (transport ${boot.transport})`)

    // The plugin sync materializes the concerto preset at boot; then the
    // MOCKROLE markers ride each role's persona into its child system prompt.
    // P2-T18: verify where each marker LANDED (grep/line-number check) — the
    // parade gates on it, and every scenario carries the raw detail.
    for (const role of def.roles) appendMockRoleMarker(sandbox, role)
    const markerLanding = def.roles.map((role) => verifyMockRoleMarkerLanding(sandbox, role))

    // Wiring proof for BOTH adapters (transport-adaptive; same contract).
    const providers = await listProvidersJoined(boot)
    const providersJson = JSON.stringify(providers)

    const created = await sessionCreate(boot, {
      cwd: sandbox.project,
      agentPreset: CONCERTO_PRESET_ID,
    })
    console.error(`drive: [${def.name}] session created ${created.sessionId} (preset ${created.agentPreset ?? '?'})`)
    await sessionPrompt(boot, {
      sessionId: created.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: def.prompt }],
    })
    console.error(`drive: [${def.name}] prompt accepted; awaiting turn/end on the session JSONL`)
    const log = await awaitTurnEnd(sandbox, created.sessionId)
    const logPath = log?.path

    await stopDsh(child)
    child = undefined
    // SIGTERM flushes the write-behind batcher; re-read the final bytes of
    // EVERY session log (the demo's child log settles with the parent).
    const allLogs = findSessionLogs(join(sandbox.dshHome, 'sessions'))
    const finalLog = allLogs.find(
      (candidate) => String(candidate.header.id) === String(created.sessionId),
    )
    const childLog = allLogs.find(
      (candidate) =>
        candidate.header.origin === 'subagent'
        && String(candidate.header.parentSession) === String(created.sessionId),
    )

    const analysis = def.analyze(
      {
        log: finalLog ?? log,
        childLog,
        allLogs,
        requests: server.requests,
        providersJson,
        bootLog: boot.log(),
        markerLanding,
        ...(def.analysisInput?.(sandbox) ?? {}),
      },
      routes,
    )
    // Timing notes: mock arrival offsets relative to the first request.
    const t0 = server.requests[0]?.receivedAt ?? 0
    const timeline = server.requests.map((request) => ({
      role: request.role,
      model: request.body?.model,
      atMs: request.receivedAt - t0,
    }))
    scenario = {
      name: def.name,
      sessionId: created.sessionId,
      logPath,
      childLogPath: childLog?.path,
      timeline,
      // AC-7: every assertion BY NAME, in check order — CI can list what ran
      // without parsing the checks object.
      assertions: Object.keys(analysis.checks ?? {}),
      ...analysis,
    }
  } catch (error) {
    scenario = { name: def.name, result: 'FAIL', failed: [`driver error: ${error.message}`] }
  } finally {
    if (child !== undefined) await stopDsh(child)
    await server.close()
  }
  return { scenario, sandboxRoot: sandbox.root }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const routes = resolveModelRoutes()
  // §14.4.5: analysis QA runs BEFORE the expensive spawn.
  const selfTestProblems = await runAnalysisSelfTest(routes)
  if (selfTestProblems.length > 0) {
    console.log(JSON.stringify({ result: 'FAIL', reason: `analysis self-test: ${selfTestProblems.join('; ')}`, scenarios: [] }))
    process.exit(1)
  }

  const digestTarget = process.env.DSH_E2E_DIGEST_TARGET ?? join(homedir(), '.dsh')
  const beforeDigest = digestConfigDir(digestTarget)
  console.error(`drive: digest target ${digestTarget} (before: ${beforeDigest.slice(0, 16)}…)`)
  console.error(`drive: routes sisyphus=${routes.sisyphus.provider}/${routes.sisyphus.model} explore=${routes.explore.provider}/${routes.explore.model}`)

  const scenarios = []
  const sandboxRoots = []
  const only = (process.env.DSH_E2E_ONLY ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
  // Name-addressable = the default chain. atlas-nested-delegation is ENABLED in
  // SCENARIOS since 2026-09-13 (D-2026-09-13-01); DSH_E2E_ONLY can still run
  // any single scenario by name.
  const nameAddressable = SCENARIOS
  const unknown = only.filter((name) => !nameAddressable.some((def) => def.name === name))
  if (unknown.length > 0) {
    throw new Error(`DSH_E2E_ONLY names no such scenario: ${unknown.join(', ')}`)
  }
  // No DSH_E2E_ONLY ⇒ the full default chain.
  const selected = only.length === 0
    ? SCENARIOS
    : nameAddressable.filter((def) => only.includes(def.name))
  for (const def of selected) {
    const { scenario, sandboxRoot } = await runScenario(def, routes)
    scenarios.push(scenario)
    sandboxRoots.push(sandboxRoot)
  }

  const afterDigest = digestConfigDir(digestTarget)
  const realDshUntouched = beforeDigest === afterDigest
  const scenariosPass = scenarios.every((scenario) => scenario.result === 'PASS')
  const result = scenariosPass && realDshUntouched ? 'PASS' : 'FAIL'

  if (process.env.DSH_E2E_KEEP_SANDBOX !== '1' && result === 'PASS') {
    for (const root of sandboxRoots) {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true })
    }
  } else {
    for (const root of sandboxRoots) {
      if (existsSync(root)) console.error(`drive: sandbox kept at ${root}`)
    }
  }

  console.log(
    JSON.stringify({
      result,
      scenarios,
      realDshUntouched,
      digestTarget,
    }),
  )
  process.exit(result === 'PASS' ? 0 : 1)
}

// Importing this module (for digestConfigDir/analyzeHello) must never spawn
// (OMO drive.mjs:241-248's guard).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--self-test')) {
    const routes = resolveModelRoutes()
    const problems = await runAnalysisSelfTest(routes)
    if (problems.length > 0) {
      console.error(`SELF-TEST FAIL: ${problems.join('; ')}`)
      process.exit(1)
    }
    console.log('SELF-TEST OK: hello + demo + write-denied + nested-delegation + roster-parade + plan-reviewer-write-denied + atlas-nested-delegation + bash-read-guard-warned fabricated good logs PASS; every fabricated defect (hello: missing turn/end, wrong route, mock-never-called, no session log; demo: explore-step-removed, no tool_call, no result return, no summary, out-of-order, wrong child route; AC-5: routes swapped, routes collapsed-to-equal; AC-6a: write-not-rejected, write-advertised, target-on-disk, no parent return; AC-6b: depth-not-rejected, grandchild-exists, delegation-tool-hidden, no parent return; P2-T18 parade: marker-landed-in-wrong-row, child-never-ran, child-wrong-route, batch-split-across-messages, note-never-returned, provider-inactive; P2-T19 plan-reviewer: write-not-rejected, write-advertised, delegation-tool-advertised, target-on-disk, child-wrong-seat, no parent return; P2-T19 atlas: depth-rejected-no-grandchild, grandchild-wrong-route, atlas-wrong-seat, atlas-lost-delegation-tools, read-only-grandchild-advertised-delegation-tools, findings-never-reached-atlas, report-never-returned, out-of-order; P3-T6 bash-read-guard: no-advisory-injection, advisory-injected-twice, trigger-result-isError) FAILs on its own named check; plus the hermetic MOCKROLE landing check (real template + real renderers, 11/11 markers under their own rows, idempotent, unknown role throws)')
  } else {
    main().catch((error) => {
      console.log(JSON.stringify({ result: 'FAIL', reason: `driver crash: ${error.message}`, scenarios: [] }))
      process.exit(1)
    })
  }
}
