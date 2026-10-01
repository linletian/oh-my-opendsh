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
// P3-T3: the root cordis.yml now inserts THREE plugin rows (omo-agents +
// omo-hooks, plus omo-commands since P4-T3), so stage 0 installs all three
// packages into the sandbox profile (PLUGIN_DIRS) and `pluginLoaded` asserts all
// three load markers. The scenarios themselves are unchanged: omo-hooks'
// implementation registry and omo-commands' are both empty, so neither plugin
// adds behaviour — only its summary boot marker (`[omo-commands] loaded: …
// 0/6 commands registered` at P4-T3, every manifest row still pending).
// (P3-T6 amended that last clause: omo-hooks now registers its FIRST listener
// and the chain carries ELEVEN scenarios — see the C-mode pilot section below.)
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
//
// ── P3-T9: todo-continuation-enforced — THE E-MODE PILOT (plan §4.2 模式 E) ──
// P3-T7 landed omo-hooks' E-mode listener (H-03): OMO's todo continuation
// discipline as ONE `agent/turn-stopping` serial listener whose ONLY effect is
// the side effect `agent.steer(<continuation user message>)` — a listener's
// return value on that event is DISCARDED by the driver
// (dsh-agent-loop/lib/index.js:966-976: `turnEnds && inbox.nextStep.length === 0`
// → `dispatch.serial("agent/turn-stopping", …)` → re-check → `break` only when
// the inbox is STILL empty). This scenario is the template every later
// executor-group hook copies, and it asserts the chain against
// RUNTIME-OBSERVED carriers only:
//
//   剧本 (MOCKROLE=sisyphus, ONE session, TWO prompts = TWO turns):
//     turn 1 — 续行链 (must steer):
//       mock #1  tool_call `todo_write` {1 completed + 1 in_progress}  → todo/write
//       mock #2  text 收尾 (no tool calls → stepEnd completed → 回合将停)
//                ⇒ the listener MUST `agent.steer(...)`; the steered message is
//                  spliced into `next-step`, claimed at the next boundary, and
//                  the SAME turn runs one more step (no turn/end yet);
//       mock #3  tool_call `todo_write` {both completed} — the steer request's
//                body carries the continuation text verbatim;
//       mock #4  text final summary → 回合真实结束 (turn/end completed).
//     turn 2 — 对照 (must NOT steer): a SECOND `session.prompt` on the same
//       session. step 1 writes an all-completed list (non-vacuous: the todos
//       projection is NOT empty, so the skip is 'all-complete', never
//       'projection-absent'), step 2 is the control wrap-up text, and the
//       boundary must stay silent: no steer carrier, no extra step, turn/end
//       immediately after the wrap-up.
//
//   ⚠️ 续行注入的实际观测载体 (measured; seq = real layout of one kept sandbox,
//   session-34d8c546…/session.v3.jsonl). `agent.steer(msg)` is
//   `send(msg, 'next-step', true)` → `inbox.splice('next-step', Infinity, 0,
//   [msg])` (dsh-agent-loop/lib/index.js:792-794, :196-208), i.e. the *same*
//   two durable carriers the T6 advisory used, with the E-mode producer triple
//   instead of the advisory's, and — unlike the advisory — at the TURN
//   BOUNDARY (nothing step-shaped between them):
//     * seq 22 `agent/inbox/spliced` data.target "next-step", start 0,
//       data.inserted[0] = {id:<uuid>, role:"user", content:[{type:"text",
//       text:<CONTINUATION>}], source:{kind:"plugin", plugin:"omo-hooks",
//       form:"instructions"}} — the ACCEPT itself;
//     * seq 23 `agent/inbox/spliced` target "next-step", removedCount 1,
//       inserted [] — the same message CLAIMED (removal recorded);
//     * seq 25 `user/message` with the identical id/role/content/source — the
//       message appended to history, i.e. the carrier request #3 is built from.
//   The measured turn shape around it: todo/write seq 16 (1 incomplete) →
//   step/end 21 → steer splice 22 → step/start 24 → user/message 25 →
//   todo/write 28 (0 incomplete) → turn/end 34 (turn 1, completed). The 对照
//   turn is turn/start 36 … todo/write 42 (0 incomplete) → turn/end 48 (turn 2)
//   with NO continuation carrier anywhere after seq 34.
//   `form: 'instructions'` (not the advisory's 'notice') is the listener's own
//   declaration and is asserted verbatim — it is what distinguishes "context
//   that instructs the model" from "here is what happened".
//
//   断言面 (analyzeTodoContinuationEnforced, all in verdict.assertions per AC-7):
//     (a) continuationSteerCarrierSourceIsOmoHooks — BOTH durable carriers
//         exist and every one carries source {kind:'plugin', plugin:'omo-hooks',
//         form:'instructions'};
//     (b) continuationSteerTextIsVerbatimListenerText — each carrier's text
//         equals `buildContinuationText(<the first todo/write snapshot>)`,
//         assembled by the SHIPPED listener module (imported, never re-typed);
//     (b2) continuationSteerInjectedExactlyOnce — one steer per carrier, the
//         claimed message carrying the ACCEPTED message's own id (the
//         double-steer / idempotence-drift guard);
//     (c) continuationSteerReachedNextModelRequest — the mock's THIRD recorded
//         request body carries that exact text AND the wrap-up text, so the
//         continuation was consumed by the step immediately after the boundary;
//     (d) continuationSteerOpenedAnotherStepBeforeTurnEnd — the 事件序 chain:
//         wrap-up < steer splice < claimed user/message < second todo/write <
//         first turn/end, with NO turn/end before the todo advance and the
//         closing turn/end reason.kind === 'completed' (the 回合未结束 claim);
//     (e) todoProgressObservedInSecondWrite — the two todo/write snapshots
//         differ exactly by the incomplete→completed promotion (same content
//         set, no regression, first has ≥1 incomplete, second has 0);
//     (f) 对照: controlTurnRanAfterContinuationTurn +
//         controlTodoWasWrittenAllCompleted (a SECOND turn really ran and its
//         todo snapshot was non-empty and all-completed) +
//         controlNoSteerWhenAllCompleted (zero continuation carriers after the
//         first turn/end, and no step-shaping event between the control wrap-up
//         and the second turn/end — 「若 steer 出现则 FAIL」的活断言);
//         plus mockSawExpectedRequestCounts (exactly 6 sisyphus requests).
//
//   变异 QA (hermetic, runAnalysisSelfTest; the real runtime layout is the
//   fabricated GOOD fixture): a log with NO steer injection FAILs on
//   continuationSteerCarrierSourceIsOmoHooks; a steer whose carrier text is not
//   the listener's assembled text FAILs on
//   continuationSteerTextIsVerbatimListenerText; a DUPLICATED steer FAILs on
//   continuationSteerInjectedExactlyOnce; a log where the steer is spliced but
//   the turn ends anyway WITHOUT the todo advance FAILs on the event-order
//   check continuationSteerOpenedAnotherStepBeforeTurnEnd; a control turn that
//   DOES steer FAILs on controlNoSteerWhenAllCompleted; and a control turn that
//   never ran (or ran with an empty list) FAILs on
//   controlTurnRanAfterContinuationTurn / controlTodoWasWrittenAllCompleted.

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
//   node tests/e2e/drive.mjs               run ALL 18 scenarios (hello + demo +
//                                          the two AC-6 negatives + the P2-T18
//                                          roster parade + the P2-T19 read-only
//                                          representative + the P2-T19
//                                          positive nested chain, ENABLED
//                                          2026-09-13 by D-2026-09-13-01 +
//                                          the P3-T6 bash-read advisory pilot +
//                                          the P3-T9 todo-continuation pilot +
//                                          the P3-T12/T13 notification pair +
//                                          the P3-T14 D-mode set: H-07's
//                                          empty-task correction and 批 A's
//                                          three error/truncation listeners +
//                                          the P3-T15 批 B injection/reminder
//                                          trio: H-21's directory README
//                                          injector, H-22's agent-usage
//                                          reminder and H-23's task-resume tip),
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
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { startMockLlmServer } from './mock-llm-server.mjs'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
// The concerto/roster package — also the source of the template this driver
// renders for its own composition checks below.
const PLUGIN_DIR = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents')
// P3-T3/P4-T3: the root cordis.yml inserts one row per package, so a sandbox
// profile must carry ALL THREE before it can boot the overlay at all.
const HOOKS_PLUGIN_DIR = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-hooks')
const COMMANDS_PLUGIN_DIR = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-commands')
const PLUGIN_DIRS = [PLUGIN_DIR, HOOKS_PLUGIN_DIR, COMMANDS_PLUGIN_DIR]
const PROFILE = 'web'
const CONCERTO_PRESET_ID = 'concerto'

/**
 * The load markers ALL THREE mounted plugins log at boot (P3-T3; third row by
 * P4-T3): omo-agents' plain `loaded` line, omo-hooks' summary marker
 * (`[omo-hooks] loaded: manifest 14 entries (…)`) and omo-commands' summary
 * marker (`[omo-commands] loaded: manifest 6 entries (…)` — the prefix is what
 * boot_log.includes matches). A boot missing one means the corresponding
 * cordis.yml insert row did not mount.
 */
const LOADED_MARKERS = [
  '[omo-agents] loaded',
  '[omo-hooks] loaded',
  '[omo-commands] loaded',
]

/** `pluginLoaded` for every analysis: all three plugin rows really mounted. */
function pluginsLoaded(bootLog) {
  return LOADED_MARKERS.every((marker) => bootLog.includes(marker))
}

/**
 * The boot-log text the `--self-test` fixtures feed the analyses that assert
 * `pluginLoaded` (a real boot carries all three markers).
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
// P3-T9: the E-mode continuation directive under test, read from the SHIPPED
// listener module — the SAME single-source discipline as the T6 advisory above.
// `buildContinuationText` is imported rather than re-assembled by hand because
// the injected text is not a static constant: it appends the per-boundary
// `[Status: …]` line and the remaining-task list from the LIVE todo snapshot,
// and only the module that mints it can say what "verbatim" means. The unit
// suite pins the literal against upstream; this scenario pins that the literal
// really reaches the model.
// P4-T9: the stop command's own result formatter, imported for the SAME
// single-source reason as the needles below — the fabricated fixture must
// produce the text the command really produces, or the self-test would be
// testing a paraphrase of it. The assertions still carry hand-transcribed
// needles, so a drift between the two surfaces as a RED self-test.
const { formatStopContinuationResult } = await import(
  new URL('../../patches/omo-dsh/omo-commands/src/commands/stop-continuation.ts', import.meta.url).href
)
const {
  CONTINUATION_DIRECTIVE: TODO_CONTINUATION_DIRECTIVE,
  TODO_CONTINUATION_ENFORCER_PLUGIN,
  TODO_CONTINUATION_ENFORCER_ID,
  formatCircuitBreakerLine: todoContinuationCircuitBreakerLine,
  buildContinuationText: buildTodoContinuationText,
  getIncompleteCount: getTodoIncompleteCount,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/todo-continuation-enforcer.ts', import.meta.url).href
)
// P3-T12: the notification anchor under test, read from the SHIPPED listener
// module — the SAME single-source discipline as the T6 advisory and the T9
// directive above. The anchor line's prefix and the notification title are
// module constants (`NOTIFICATION_LOG_PREFIX` + the default config's
// `baseTitle`), so "verbatim" means "the listener's own strings", never a copy
// pasted into the driver. The unit suite pins them against upstream; this
// scenario pins that a real turn really produces the line.
const {
  NOTIFICATION_LOG_PREFIX: SESSION_NOTIFICATION_LOG_PREFIX,
  NOTIFICATION_FAILURE_PREFIX: SESSION_NOTIFICATION_FAILURE_PREFIX,
  DEFAULT_SESSION_NOTIFICATION_CONFIG: SESSION_NOTIFICATION_DEFAULT_CONFIG,
  NOTIFY_SEND_COMMAND,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/session-notification.ts', import.meta.url).href
)
const SESSION_NOTIFICATION_BASE_TITLE = SESSION_NOTIFICATION_DEFAULT_CONFIG.baseTitle
// P3-T12 sibling: the background-notification anchor, same single-source rule.
// That module's anchor is `[omo-hooks] background-notification: <status> <label>`
// and `DEFAULT_SESSION_NOTIFICATION_CONFIG` is the shared title source it
// imports for its content. P3-T13 adds the module's own terminal-status list and
// its deferred-acquisition NOTE predicate, so the positive anchor assertions and
// the plugin cannot disagree about what "terminal" or "a note" means.
const {
  BACKGROUND_LOG_PREFIX: BACKGROUND_NOTIFICATION_LOG_PREFIX,
  BACKGROUND_FAILURE_PREFIX: BACKGROUND_NOTIFICATION_FAILURE_PREFIX,
  BACKGROUND_NOTE_PREFIX: BACKGROUND_NOTIFICATION_NOTE_PREFIX,
  TERMINAL_JOB_STATUSES: BACKGROUND_NOTIFICATION_TERMINAL_STATUSES,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/background-notification.ts', import.meta.url).href
)
// P3-T14: the three D-mode listener texts and the H-07 corrective text, read
// from the SHIPPED modules — the SAME single-source discipline as the T6/T9/T12
// literals above. Each scenario asserts the bytes the listener itself declares
// (never a second hand-copied literal), and `matchesJsonErrorTable` is imported
// so the JSON scenario can prove the OBSERVED DSH error text is the very text
// the live table matches.
const {
  EDIT_ERROR_REMINDER,
  EDIT_ERROR_REMINDER_MARKER,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/edit-error-recovery.ts', import.meta.url).href
)
const {
  JSON_ERROR_REMINDER,
  JSON_ERROR_REMINDER_MARKER,
  matchesJsonErrorTable,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/json-error-recovery.ts', import.meta.url).href
)
const {
  TRUNCATABLE_TOOLS: TOOL_OUTPUT_TRUNCATABLE_TOOLS,
  TOOL_SPECIFIC_MAX_TOKENS: TOOL_OUTPUT_SPECIFIC_MAX_TOKENS,
  DEFAULT_MAX_TOKENS: TOOL_OUTPUT_DEFAULT_MAX_TOKENS,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/tool-output-truncator.ts', import.meta.url).href
)
const {
  EMPTY_RESPONSE_WARNING,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/empty-task-response-detector.ts', import.meta.url).href
)

// P3-T15: the 批 B listener texts and lists, read from the SHIPPED modules — the
// same single-source discipline as the T14 block above. `TARGET_TOOLS` is read so
// the read control below is proven a NON-target by lookup rather than by hand,
// and `buildTaskResumeHint` so the task-resume assertion compares against the
// shipped formatter instead of a second hand-copied literal.
const {
  REMINDER_MESSAGE,
  REMINDER_MESSAGE_MARKER,
  MAX_REMINDERS: AGENT_USAGE_MAX_REMINDERS,
  TARGET_TOOLS: AGENT_USAGE_TARGET_TOOLS,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/agent-usage-reminder.ts', import.meta.url).href
)
const {
  README_INJECTION_MARKER,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/directory-readme-injector.ts', import.meta.url).href
)
const {
  DSH_CONTINUABLE_TEXT_PREFIX,
  TASK_RESUME_CONTINUATION_MARKER,
  buildTaskResumeHint,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/task-resume-info.ts', import.meta.url).href
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

// ── P3-T9 todo-continuation-enforced scenario (模式 E e2e 打样; see header) ───
// H-03's listener steers a turn that is about to stop while the `todos`
// projection still has incomplete work. The script drives the FULL chain plus
// the live 对照 in ONE session / TWO turns (see the header's T9 section):
//   turn 1 (续行): todo_write {1 completed + 1 in_progress} → 收尾文本 (回合将停)
//     ⇒ steer → todo_write {both completed} → 最终总结 → turn/end;
//   turn 2 (对照): todo_write {all completed} → 控制收尾文本 → 无 steer → turn/end.
// The status vocabulary is dsh-tool-todo's OWN three-member union
// (`'pending' | 'in_progress' | 'completed'`, lib/types/types.d.ts:24) and the
// tool name is the registered `todo_write` (lib/index.js:96) — never guessed.
const TODO_CONTINUATION_PROMPT =
  'e2e todo-continuation-enforced: track the two launch tasks in the todo list and report when they are done'
// The two fixture tasks. Both strings are load-bearing: the injected
// continuation text renders the incomplete one as `- [<status>] <content>`, so
// renaming a task changes the verbatim text the analysis expects.
const TODO_TASK_SETTLED = 'e2e launch task: settle the release checklist 0x51a7'
const TODO_TASK_OPEN = 'e2e launch task: write the release summary 0xc0de'
// Turn 1's 收尾 step: a text-only assistant message, i.e. the exact shape that
// makes the loop classify the step `completed` and reach the turn boundary.
const SISYPHUS_TODO_WRAPUP =
  'MOCK-TODO-WRAPUP-3b7d1e: the checklist is done, wrapping up here'
// Turn 1's final summary (after the steered todo_write advanced the list).
const SISYPHUS_TODO_SUMMARY =
  'MOCK-TODO-SUMMARY-9f4a2c: the tracked tasks are all complete now'
// Turn 2's (对照) own prompt + wrap-up: the boundary must stay silent.
const TODO_CONTROL_PROMPT =
  'e2e todo-continuation-enforced (control): report the already-finished checklist'
const SISYPHUS_TODO_CONTROL_WRAPUP =
  'MOCK-TODO-CONTROL-WRAPUP-7e2c58: the checklist was already complete, nothing left to continue'

/**
 * todo-continuation-enforced script. SIX steps on the ONE role the scenario
 * drives (MOCKROLE=sisyphus): the first four are turn 1 (the continuation
 * chain), the last two turn 2 (the 对照). Every `todo_write` sends the COMPLETE
 * list (the tool's contract: "The COMPLETE task list, replacing any previous
 * list"), which is why the second write repeats the settled task.
 */
function todoContinuationScript() {
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'todo_write',
        arguments: {
          todos: [
            { content: TODO_TASK_SETTLED, status: 'completed' },
            { content: TODO_TASK_OPEN, status: 'in_progress' },
          ],
        },
      },
      { type: 'text', text: SISYPHUS_TODO_WRAPUP },
      {
        type: 'tool_call',
        name: 'todo_write',
        arguments: {
          todos: [
            { content: TODO_TASK_SETTLED, status: 'completed' },
            { content: TODO_TASK_OPEN, status: 'completed' },
          ],
        },
      },
      { type: 'text', text: SISYPHUS_TODO_SUMMARY },
      {
        // 对照 turn: a NON-EMPTY todo list whose every item is already
        // completed — so the boundary's skip is 'all-complete', not the weaker
        // (and vacuous) 'no-todos'/projection-absent path.
        type: 'tool_call',
        name: 'todo_write',
        arguments: {
          todos: [{ content: TODO_TASK_SETTLED, status: 'completed' }],
        },
      },
      { type: 'text', text: SISYPHUS_TODO_CONTROL_WRAPUP },
    ],
  }
}

// ── P3-T12 session-notification-log scenario (模式 F；见下方 header) ──────────
// H-10's listener observes `session/event` turn/end + `agent/status`: a turn
// that really produced work `completed` ⇒ ONE completion notification (the
// anchor line), whose OS command is dispatched through the platform backend.
// The script drives TWO steps on sisyphus: a REAL `bash` call that writes a
// fixture file (an on-disk artifact — the "实际工作产出" the completion gate
// reads as `step/end`) and a closing summary step. The prompt is deliberately
// outcome-shaped rather than command-shaped: the model must still choose the
// tool, so the tool/result the gate sees is a real execution.
const SESSION_NOTIFICATION_PROMPT =
  'e2e session-notification-log: create a file named session-notification-proof.txt containing the text ok, then summarize what you did'
const NOTIFICATION_FIXTURE_NAME = 'session-notification-proof.txt'
const NOTIFICATION_FIXTURE_TEXT = 'session-notification-e2e-ok-7c4a1d'
const SESSION_NOTIFICATION_SUMMARY =
  'MOCK-SESSION-NOTIFICATION-SUMMARY-4b8e12: the proof file was written and the turn completed'
// The completion notification's own payload, transcribed from the SHIPPED
// default config above (never a hand-typed copy): the anchor's `<kind>` is the
// completion kind and its `<title>` is the configured base title.
const SESSION_NOTIFICATION_COMPLETION_KIND = 'idle'
const SESSION_NOTIFICATION_EXPECTED_ANCHOR =
  `${SESSION_NOTIFICATION_LOG_PREFIX}${SESSION_NOTIFICATION_COMPLETION_KIND} ${SESSION_NOTIFICATION_BASE_TITLE}`

/**
 * session-notification-log script. Step 1 is ONE `bash` call whose command
 * both writes the fixture (proving real work) and echoes the sentinel (giving
 * the tool result a byte-level marker); step 2 is the text-only summary that
 * closes the turn. `description` is part of the real bash parameter schema
 * (dsh-tool-bash lib/index.js:268 `required: true`).
 */
function sessionNotificationScript(sandbox) {
  const fixturePath = join(sandbox.project, NOTIFICATION_FIXTURE_NAME)
  const command = `printf '%s\\n' ${NOTIFICATION_FIXTURE_TEXT} > ${fixturePath} && cat ${fixturePath}`
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'bash',
        arguments: {
          command,
          description: 'Write the session-notification proof file and print it back',
        },
      },
      { type: 'text', text: SESSION_NOTIFICATION_SUMMARY },
    ],
  }
}

/**
 * The T12 scenario's settle hook: the completion notification is armed by
 * `turn/end` and fires after the listener's idle-confirmation delay
 * (`idleConfirmationDelay`, 1500ms upstream default), while `awaitTurnEnd`
 * returns as soon as the turn/end event is durable. Waiting here — BEFORE the
 * boot log is frozen by `stopDsh` — makes the anchor assertion deterministic
 * instead of a race against the timer. The absence is NOT fatal: on timeout the
 * analysis runs anyway and reports `notificationAnchorLoggedOnce: false`, which
 * is exactly the honest FAIL a missing notification deserves.
 */
async function awaitNotificationAnchor(boot, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (boot.log().includes(SESSION_NOTIFICATION_EXPECTED_ANCHOR)) return true
    await sleep(250)
  }
  return boot.log().includes(SESSION_NOTIFICATION_EXPECTED_ANCHOR)
}

// ── P3-T13 background-notification-log scenario (模式 F) ──────────────────────
// H-11's listener observes the NATIVE background-job surface, `ctx.jobs`. Two
// measured facts decide how this driver must construct that observation — the
// first is the runtime defect P3-T13 fixes, the second is why the construction
// is what it is.
//
// 1. THE DEFECT (fixed here, pinned positively below). The first registrar read
//    `ctx.get('jobs')` ONCE, synchronously, at apply() time and got `undefined`
//    on a real boot (`bonus.observedDefect` of the P3-T12 scenario). Root cause,
//    recorded verbatim in the module header's WHY section:
//      * `ctx.get(name)` is a STRICT read — it hides any implementation whose
//        providing fiber is not ACTIVE yet (`cordis/lib/index.js:754-771`,
//        `if (strict && impl.fiber.state !== 2) return;`);
//      * the loader creates EVERY row of one compose step concurrently
//        (`cordis-plugin-loader/lib/index.js:97` `await Promise.allSettled(
//        config.map((options) => this.create(options)))`, fed by
//        `dsh-app-boot/lib/index.js:144-145`), so the `jobs` row and this
//        plugin's overlay row race, and apply() usually loses.
//    The subscription was therefore never made and H-11 emitted nothing. The
//    fix is `ctx.inject(['jobs'], cb)` (the deferred form; the shipped
//    session controller uses it for the same service,
//    `dsh-api-session-controller/lib/index.js:1017-1018`), NOT a plugin-level
//    `inject: ['jobs']` hard wait.
//
// 2. WHAT A `ctx.jobs` SETTLEMENT ACTUALLY IS. The concerto delegation rows are
//    `backgroundMode: continuable`, and a continuable child has NO background
//    job at all — verbatim `dsh-subagent/lib/types/run-settlement.js`: "Only
//    the one-shot background path uses Jobs; continuable children have no Task,
//    no per-message result, and no Task cancellation." So a continuable
//    delegation can never drive `onJobDone`, however the listener is wired:
//    the P3-T12 reading of this scenario ("a background delegation exists, so
//    the port should have notified") was wrong twice over. The ONE construction
//    that really creates a JobRegistry entry is the ONE-SHOT background
//    delegation (`dsh-tool-subagent/lib/index.js:537-545`:
//    `jobs.start({kind: "subagent", label: args.description, owner: parent, …})`).
//    This scenario therefore flips ITS OWN SANDBOX COPY of the materialized
//    preset's `explore` row to `backgroundMode: one-shot`
//    (`enableOneShotBackgroundExplore` below, run before the session is
//    created): the repo template and every other scenario keep `continuable`.
//    The job label is the delegation's own `description`, which the script pins
//    to `explore`, so the anchor contract under test is exactly
//    `[omo-hooks] background-notification: <terminal status> explore`.
//
// The scenario drives the read-only `explore` seat: one text step for the child
// (its role is a separate MOCKROLE lane, so the parent's cursor is unaffected),
// then the parent's closing summary. The prompt names the background explicitly
// because the model — not the driver — decides the tool arguments.
const BACKGROUND_NOTIFICATION_PROMPT =
  'e2e background-notification-log: start the explore subagent in the background to inspect the workspace, then summarize that you launched it'
const BACKGROUND_NOTIFICATION_TASK =
  'e2e background task: report the workspace layout'
const BACKGROUND_CHILD_REPLY =
  'MOCK-BACKGROUND-CHILD-5e1d3a: the workspace layout was inspected in the background'
const BACKGROUND_NOTIFICATION_SUMMARY =
  'MOCK-BACKGROUND-SUMMARY-8a6f24: the background explore job was launched and the turn completed'
// The delegated subagent's own label (`dsh-tool-subagent` names the job after
// the delegation) — the `GET /agent/<id>` persona row id the roster renders.
const BACKGROUND_NOTIFICATION_EXPECTED_LABEL = 'explore'
// The POSITIVE-form contract this scenario asserts: the port's own anchor,
// `<status>` from the listener's three-member terminal list
// (completed|killed|failed) and the job's label (the delegation `description`).
const BACKGROUND_NOTIFICATION_EXPECTED_ANCHOR =
  `${BACKGROUND_NOTIFICATION_LOG_PREFIX}completed ${BACKGROUND_NOTIFICATION_EXPECTED_LABEL}`

/**
 * The native reporter's own settlement notice for THIS job (dsh-tool-jobs
 * `fitCompletionNotice`, `lib/index.js:116-124`):
 *   `background job <id> (<kind>: <label>) finished [status: <status>]. Read its
 *    output with job_output.`
 * It is the non-vacuity guard for the positive scenario: the port can only have
 * observed a settlement that really happened, and DSH's own reporter is an
 * independent witness of the same one.
 */
const BACKGROUND_NATIVE_JOB_NOTICE_RE = new RegExp(
  `background job \\S+ \\(subagent: ${BACKGROUND_NOTIFICATION_EXPECTED_LABEL}\\) `
  + 'finished \\[status: (?:completed|killed|failed)\\]',
)

/** Whether any durable parent event carries the native settlement notice. */
function nativeJobsNoticeDelivered(events) {
  return (events ?? []).some(
    (event) => event.type === 'user/message'
      && BACKGROUND_NATIVE_JOB_NOTICE_RE.test(messageContentText(event.data)),
  )
}

/** The parent session's own log, or undefined while it does not exist yet. */
function parentSessionLog(sandbox, sessionId) {
  return findSessionLogs(join(sandbox.dshHome, 'sessions'))
    .find((candidate) => String(candidate.header.id) === String(sessionId))
}

/**
 * Flip THIS scenario's sandbox copy of the materialized preset's `explore`
 * delegation row from `backgroundMode: continuable` to `one-shot`.
 *
 * WHY A FIXTURE EDIT IS REQUIRED (see fact 2 in the section comment): only the
 * one-shot background path registers a `ctx.jobs` entry, and every shipped
 * concerto row is `continuable`. The edit is SCENARIO-LOCAL — it rewrites the
 * materialized composition in the sandbox's own DSH_HOME (the same file
 * `appendMockRoleMarker` already edits, and the same file the session composes
 * from), never the repo template, so no other scenario and no shipped artifact
 * changes. Loud on drift: a template change that moves the row or its
 * `backgroundMode` line throws here instead of silently turning the scenario
 * vacuous.
 */
function enableOneShotBackgroundExplore(sandbox) {
  const compositionPath = materializedCompositionPath(sandbox)
  const text = readFileSync(compositionPath, 'utf8')
  const lines = text.split('\n')
  const rowAnchor = `    - id: tool-subagent-${BACKGROUND_NOTIFICATION_EXPECTED_LABEL}`
  const anchors = lines
    .map((line, index) => (line === rowAnchor ? index : -1))
    .filter((index) => index >= 0)
  if (anchors.length !== 1) {
    throw new Error(
      `background-notification scenario: materialized preset must carry `
      + `\`${rowAnchor}\` exactly once; found ${anchors.length}`,
    )
  }
  const rowIndex = anchors[0]
  const rowIndent = rowAnchor.length - rowAnchor.trimStart().length
  let modeIndex = -1
  for (let index = rowIndex + 1; index < lines.length; index++) {
    const line = lines[index]
    if (/^\s*- id: /.test(line) && line.length - line.trimStart().length <= rowIndent) break
    if (line === '        backgroundMode: continuable') {
      modeIndex = index
      break
    }
  }
  if (modeIndex < 0) {
    throw new Error(
      `background-notification scenario: the materialized `
      + `'${BACKGROUND_NOTIFICATION_EXPECTED_LABEL}' row carries no `
      + '`        backgroundMode: continuable` line to flip to one-shot',
    )
  }
  lines[modeIndex] = '        backgroundMode: one-shot'
  writeFileSync(compositionPath, lines.join('\n'))
}

/**
 * background-notification-log script: the parent's step 1 fires ONE delegation
 * with `run_in_background: true`, step 2 closes the turn with a summary text.
 * The child role (`explore`) gets its own single text step. The `description`
 * IS the background job's label (`dsh-tool-subagent` passes `args.description`
 * to `jobs.start`), so it is pinned to the expected label rather than to prose.
 */
function backgroundNotificationScript() {
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: BACKGROUND_NOTIFICATION_EXPECTED_LABEL,
          prompt: BACKGROUND_NOTIFICATION_TASK,
          run_in_background: true,
        },
      },
      { type: 'text', text: BACKGROUND_NOTIFICATION_SUMMARY },
    ],
    explore: [{ type: 'text', text: BACKGROUND_CHILD_REPLY }],
  }
}

/**
 * The background scenario's settle hook: wait for BOTH observations the
 * assertions need, INSIDE the observation window and BEFORE `stopDsh` freezes
 * the boot log / the session JSONL:
 *   * the port's anchor line (the listener's own delivery), and
 *   * the native reporter's settlement notice in the parent's durable log
 *     (proving the job really settled — the notice lands as its own event, so
 *     the anchor can legitimately precede it by a beat).
 * The return value is informational only: a timeout lets the analysis run and
 * report the honest FAIL (a missing anchor or a missing settlement), never a
 * driver crash.
 */
async function awaitBackgroundNotificationSettlement(boot, sandbox, sessionId, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let anchorReady = false
  let noticeReady = false
  while (Date.now() < deadline) {
    anchorReady = notificationLinesOf(boot.log(), BACKGROUND_NOTIFICATION_LOG_PREFIX).length > 0
    noticeReady = nativeJobsNoticeDelivered(parentSessionLog(sandbox, sessionId)?.events)
    if (anchorReady && noticeReady) return true
    await sleep(250)
  }
  return anchorReady && noticeReady
}

// ── P3-T14: THE D-MODE SET + H-07 (plan §4.2 模式 D; task book WP-6 批 A) ─────
// Four scenarios, each with a TRIGGER and a live 对照 in ONE batch (the T6
// three-calls-in-one-assistant-message shape), asserted against RUNTIME-OBSERVED
// carriers only:
//
//   1. `edit-error-recovery-reminder` (H-14). Step 1 reads the fixture (the
//      fs-observation policy requires an observation before an edit); step 2 is
//      ONE assistant message carrying TWO real `edit` calls on that file:
//        (a) `old_string` = a string that does not exist  → the REAL tool fails
//            with `Error: old_string was not found in "<path>"`
//            (dsh-fs-local:685) and the listener must append the reminder;
//        (b) `old_string` = the fixture's first line        → the REAL tool
//            succeeds (`The file … has been updated successfully.`) and the
//            result must stay UNCHANGED.
//      Step 3 is the summary text. The trigger's own truth is that the CALL ran
//      on the real filesystem: (b) proves the file bytes were what the model
//      claimed, so "the reminder fired" cannot be an artifact of a synthetic
//      error string.
//
//   2. `json-error-recovery-reminder` (H-15). Step 1 carries TWO calls whose
//      ARGUMENTS ARE NOT AN OBJECT — the mock serializes the raw value, the
//      agent loop preserves a non-object argument (dsh-agent-loop:541-547) and
//      the tool registry rejects it, so BOTH calls produce the IDENTICAL real
//      error text `Error: invalid arguments: "arguments" must be an object`:
//        (a) `write` — NOT on the blacklist → the listener must append;
//        (b) `read`  — ON the blacklist     → the same text, NO reminder.
//      The 对照 is therefore byte-identical on the trigger side: the ONLY
//      difference between the two results is the tool's blacklist membership.
//
//   3. `tool-output-truncated` (H-16). Step 1 carries two real `grep` calls:
//        (a) a pattern hitting 200 × 1800-char lines (≈360 KB of matches, under
//            the 250-match inline cap so nothing is spilled) → over BOTH the
//            fixed 50 000-token default and any adaptive
//            min(remaining × 0.5, 50 000) budget → the listener must replace the
//            result with the truncated text (header lines kept, tail note);
//        (b) a pattern hitting two short lines → the control: untouched.
//      MEASURED two-layer fact (pinned against a kept sandbox): the mock-served
//      route advertises NO context capacity, so the projection is unusable and
//      upstream's OWN fixed-threshold fallback is what ran (the adaptive branch
//      is unit-tested instead); and `dsh-spill-policy` (maxInlineBytes: 50000,
//      PREPENDED — it calls `next()` and then bounds the chain's output) bounded
//      the listener's ~200 KB replacement to 50 000 bytes with its own
//      `(Omitted 149392 bytes. Full formatted result stored at: …)` notice. The
//      listener's own note `[90 more lines truncated due to context window
//      limit]` IS durably inside the tool result, which is what makes this
//      scenario non-vacuous; the final byte bound is spill-policy's, and that
//      overlap is raised for arbitration in the T14 report, not papered over.
//
//   4. `empty-task-response-corrected` (H-07; the arbitration-moved e2e). Step 1
//      carries TWO foreground delegations on DIFFERENT roster rows so each
//      child's mock script is deterministic (a same-role pair would race for one
//      step cursor):
//        (a) `explore` answers WHITESPACE ONLY — a real, non-error child run
//            whose rendered output is blank, which is exactly upstream's
//            `output.output?.trim() ?? ""` empty case;
//        (b) `oracle` answers a real note — the 对照: the result must NOT be
//            rewritten.
//      The correction is asserted VERBATIM against the shipped listener's
//      `EMPTY_RESPONSE_WARNING`, and the child log proves the pre-rewrite value
//      (its assistant text trims to nothing).
//
// 变异 QA (hermetic, runAnalysisSelfTest): each scenario's fabricated GOOD input
// mirrors the real layout and PASSes; each named defect below FAILs on its own
// check (no-reminder, reminder-on-the-control, un-truncated, truncating-the-
// control, uncorrected-empty-result, corrective-text-on-the-control).
const EDIT_RECOVERY_PROMPT =
  'e2e edit-error-recovery-reminder: read the fixture, try an edit with a line that is not there, then edit the first line correctly and summarize'
const EDIT_RECOVERY_FIXTURE_NAME = 'edit-recovery-fixture.txt'
const EDIT_RECOVERY_FIXTURE_LINE = 'omo-dsh edit-recovery fixture line 2f7b41'
const EDIT_RECOVERY_FIXTURE_SENTINEL = '2f7b41'
const EDIT_RECOVERY_FIXTURE_CONTENT =
  `${EDIT_RECOVERY_FIXTURE_LINE}\nsecond line, never the edit target 91c0de\n`
// The absent `old_string`: the trigger of the REAL `FS_EDIT_NOT_FOUND` failure.
const EDIT_RECOVERY_ABSENT_MARKER = 'omo-dsh-line-that-never-exists-6b24e8'
const EDIT_RECOVERY_REPLACED_LINE = 'omo-dsh edit-recovery replacement line 5d3a92'
const EDIT_RECOVERY_SUMMARY =
  'MOCK-EDIT-RECOVERY-SUMMARY-3e9f17: the failing edit came back with the reminder and the correct edit landed'

/**
 * edit-error-recovery-reminder script: read → the two-edit batch → summary.
 * Both `edit` calls address the SAME fixture path, so the analysis can tell them
 * apart only by their `old_string` (the absent marker vs the real first line) —
 * which is exactly what it does.
 */
function editErrorRecoveryScript(sandbox) {
  const fixturePath = join(sandbox.project, EDIT_RECOVERY_FIXTURE_NAME)
  return {
    sisyphus: [
      { type: 'tool_call', name: 'read', arguments: { file_path: fixturePath } },
      {
        type: 'tool_calls',
        calls: [
          {
            name: 'edit',
            arguments: {
              file_path: fixturePath,
              old_string: EDIT_RECOVERY_ABSENT_MARKER,
              new_string: 'this replacement must never be written',
            },
          },
          {
            name: 'edit',
            arguments: {
              file_path: fixturePath,
              old_string: EDIT_RECOVERY_FIXTURE_LINE,
              new_string: EDIT_RECOVERY_REPLACED_LINE,
            },
          },
        ],
      },
      { type: 'text', text: EDIT_RECOVERY_SUMMARY },
    ],
  }
}

const JSON_RECOVERY_PROMPT =
  'e2e json-error-recovery-reminder: call write and read with malformed arguments, then summarize what came back'
// The raw argument value the mock serializes. It is a JSON STRING, i.e. valid
// JSON with a non-object root — the shape that reaches the tool registry and
// fails its schema walk (see the section header's fact 2).
const JSON_RECOVERY_MALFORMED_ARGUMENTS = 'not-an-object'
// The REAL error both calls produce, transcribed from the pinned install
// (dsh-tools `ToolArgsError` :812-818 + `toolErrorResult` :3490-3502 through the
// `"arguments" must be an object` violation at :449/:348-350). The analysis
// additionally feeds it to the shipped table's `matchesJsonErrorTable`, so a
// drift in either direction is loud.
const JSON_RECOVERY_EXPECTED_ERROR = 'Error: invalid arguments: "arguments" must be an object'
const JSON_RECOVERY_SUMMARY =
  'MOCK-JSON-RECOVERY-SUMMARY-7d1b64: both malformed calls failed and only the non-blacklisted one got the reminder'

/**
 * json-error-recovery-reminder script: ONE batch with the blacklisted/non-
 * blacklisted pair, then the summary. `write` is NOT on the port's DSH blacklist
 * and `read` IS (module header mapping table) — that single difference is the
 * whole 对照.
 */
function jsonErrorRecoveryScript() {
  return {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: [
          { name: 'write', arguments: JSON_RECOVERY_MALFORMED_ARGUMENTS },
          { name: 'read', arguments: JSON_RECOVERY_MALFORMED_ARGUMENTS },
        ],
      },
      { type: 'text', text: JSON_RECOVERY_SUMMARY },
    ],
  }
}

const TRUNCATOR_PROMPT =
  'e2e tool-output-truncated: grep the big fixture and the small fixture, then summarize what came back'
const TRUNCATOR_BIG_FIXTURE_NAME = 'truncator-big-fixture.txt'
const TRUNCATOR_SMALL_FIXTURE_NAME = 'truncator-small-fixture.txt'
// The big fixture: 200 matching lines of exactly 1800 characters each
// (≈360 KB, ≈90 000 estimated tokens) — deliberately under the grep tool's
// 250-match inline cap (dsh-tool-fs-search GREP_MAX_MATCHES), so the result is
// NOT spilled and the truncator is what shrinks it. Each line carries its index,
// which is how the analysis proves the TAIL was dropped while the head survived.
const TRUNCATOR_BIG_LINE_COUNT = 200
const TRUNCATOR_BIG_LINE_CHARS = 1800
const TRUNCATOR_BIG_PATTERN = 'TRUNC-BIG-8f2b7d'
const TRUNCATOR_BIG_FIRST_MARKER = `${TRUNCATOR_BIG_PATTERN}-000`
const TRUNCATOR_BIG_LAST_MARKER = `${TRUNCATOR_BIG_PATTERN}-199`
const TRUNCATOR_SMALL_PATTERN = 'TRUNC-SMALL-4a1c9e'
const TRUNCATOR_SMALL_LINES = [
  `${TRUNCATOR_SMALL_PATTERN} control line one`,
  `${TRUNCATOR_SMALL_PATTERN} control line two`,
]
const TRUNCATOR_SUMMARY =
  'MOCK-TRUNCATOR-SUMMARY-2c8e5a: the big grep result was cut and the small one came back whole'

/** One 1800-character fixture line, index-tagged so the tail is provable. */
function truncatorBigLine(index) {
  const head = `${TRUNCATOR_BIG_PATTERN}-${String(index).padStart(3, '0')}-`
  return head + 'x'.repeat(TRUNCATOR_BIG_LINE_CHARS - head.length)
}

/** The big-fixture bytes (200 lines, each exactly TRUNCATOR_BIG_LINE_CHARS). */
function truncatorBigFixtureText() {
  return Array.from({ length: TRUNCATOR_BIG_LINE_COUNT }, (_v, index) => truncatorBigLine(index))
    .join('\n') + '\n'
}

/**
 * tool-output-truncated script: the two greps in ONE batch, then the summary.
 * The paths are absolute sandbox paths (the fixture is seeded per run).
 */
function toolOutputTruncatedScript(sandbox) {
  return {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: [
          {
            name: 'grep',
            arguments: {
              pattern: TRUNCATOR_BIG_PATTERN,
              path: join(sandbox.project, TRUNCATOR_BIG_FIXTURE_NAME),
            },
          },
          {
            name: 'grep',
            arguments: {
              pattern: TRUNCATOR_SMALL_PATTERN,
              path: join(sandbox.project, TRUNCATOR_SMALL_FIXTURE_NAME),
            },
          },
        ],
      },
      { type: 'text', text: TRUNCATOR_SUMMARY },
    ],
  }
}

const EMPTY_TASK_PROMPT =
  'e2e empty-task-response-corrected: delegate twice — once to explore and once to oracle — then report what each returned'
// The control child's answer (the oracle row). Asserted verbatim in the parent's
// tool/result: a non-empty delegation result must NOT be rewritten.
const EMPTY_TASK_ORACLE_NOTE =
  'MOCK-ORACLE-NOTE-9b3f52: the oracle row answered this delegation with real content'
// The empty child's answer: WHITESPACE ONLY. It is a real, non-error completion
// (the adapter opens a text block for any non-empty delta, and the loop's stop
// reason stays `completed`), yet the rendered result trims to nothing — exactly
// upstream's `output.output?.trim() ?? ""` empty case.
const EMPTY_TASK_BLANK_CHILD_TEXT = '   \n\t '
const EMPTY_TASK_SUMMARY =
  'MOCK-EMPTY-TASK-SUMMARY-5a7c31: the blank delegation result came back corrected and the real one did not'

/**
 * empty-task-response-corrected script. TWO roles, so each child consumes its
 * OWN step cursor (the T17 per-role cursor semantics) and the blank answer can
 * never be handed to the control child by a race.
 */
function emptyTaskResponseCorrectedScript() {
  return {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: [
          {
            name: 'explore',
            arguments: {
              description: 'Inspect the workspace and report findings',
              prompt: 'Inspect the workspace and report your findings.',
              run_in_background: false,
            },
          },
          {
            name: 'oracle',
            arguments: {
              description: 'Answer the design question',
              prompt: 'Answer the design question in one sentence.',
              run_in_background: false,
            },
          },
        ],
      },
      { type: 'text', text: EMPTY_TASK_SUMMARY },
    ],
    // The blank child: a whitespace-only text step (see the constant's comment).
    explore: [{ type: 'text', text: EMPTY_TASK_BLANK_CHILD_TEXT }],
    oracle: [{ type: 'text', text: EMPTY_TASK_ORACLE_NOTE }],
  }
}

// ── P3-T15: THE 批 B INJECTION/REMINDER SET (plan §4.2 模式 D; task book WP-6 批 B) ─
// Three scenarios, each with a TRIGGER and a live 对照 (the T6/T14 shape),
// asserted against RUNTIME-OBSERVED carriers only:
//
//   1. `directory-readme-injected` (H-21). Step 1 carries TWO real `read` calls:
//        (a) a file under `<project>/readme-injector/nested/` — its directory
//            chain holds `<project>/readme-injector/README.md`, so the README's
//            bytes must be APPENDED to the result (behind the tool's own
//            `<path>/<type>/<content>` render);
//        (b) a file under `<project>/plain/` whose chain holds NO README → the
//            对照: byte-identical to the tool's own render.
//      Step 2 reads a SECOND file under the same directory → that directory is
//      already cached, so the result must stay untouched (upstream's
//      DIRECTORY-keyed de-duplication, which only a real run can prove). Step 3
//      is the summary text. The walk root is the session's cwd
//      (`sandbox.project`) — the DSH analog of upstream's `ctx.directory`.
//
//   2. `agent-usage-reminder-appended` (H-22). SEVEN sequential steps, because
//      upstream's semantics ARE a counter: step 1 is a batch of one target tool
//      (`grep`) plus one NON-target tool (`read` — the same-batch 对照); steps
//      2-4 are three more greps (reminders #2 and #3, then the cap); step 5 is a
//      FOREGROUND `explore` delegation (it marks the session used and is itself
//      untouched); step 6 is a fifth grep, suppressed by `agentUsed`; step 7 is
//      the summary. The `explore` child runs its OWN grep step, so the
//      orchestrator gate is exercised on a REAL restricted child scope: a session
//      that cannot see any delegation tool must not be told to delegate.
//
//   3. `task-resume-info-appended` (H-23). Step 1 carries TWO delegations on
//      DIFFERENT roles, so each child consumes its own mock step cursor:
//        (a) `explore` with `run_in_background: true` — a CONTINUABLE child, whose
//            render is `started subagent <id>`; the listener must append the DSH
//            continuation tip naming THAT id through `send_message(agent_id=…)`;
//        (b) `oracle` with `run_in_background: false` — a FOREGROUND child whose
//            render is the child's own answer and carries no id → the 对照: it
//            must come through byte-identical.
//      Step 2 is the summary text. Both children answer in ONE text step, so the
//      continuable child settles while the parent's step 2 is in flight.
//      DEGRADATION (recorded): the `background`/one-shot JOB kind is NOT reachable
//      on the shipped composition — every concerto row is `continuable`, P3-T13's
//      fact 2 — so that kind is covered by the unit suite only.
const README_INJECTOR_PROMPT =
  'e2e directory-readme-injected: read both fixture files, then read a second file under the nested directory, then summarize what came back'
const README_INJECTOR_DIR = 'readme-injector'
const README_INJECTOR_NESTED = 'nested'
const README_INJECTOR_TARGET_NAME = 'target.ts'
const README_INJECTOR_DEDUP_NAME = 'second.ts'
const README_INJECTOR_PLAIN_DIR = 'plain'
const README_INJECTOR_PLAIN_NAME = 'control.ts'
const README_INJECTOR_README_SENTINEL = 'MOCK-README-CONTEXT-c41f8a'
const README_INJECTOR_README_CONTENT = `# readme-injector fixture\n${README_INJECTOR_README_SENTINEL}\n`
const README_INJECTOR_TARGET_SENTINEL = 'export const targetSentinel = "b27e10"'
const README_INJECTOR_TARGET_CONTENT = `${README_INJECTOR_TARGET_SENTINEL}\nexport const neighbour = 2\n`
const README_INJECTOR_DEDUP_SENTINEL = 'export const secondFileSentinel = "9d4a3c"'
const README_INJECTOR_DEDUP_CONTENT = `${README_INJECTOR_DEDUP_SENTINEL}\n`
const README_INJECTOR_PLAIN_SENTINEL = 'export const plainSentinel = "5f0b12"'
const README_INJECTOR_PLAIN_CONTENT = `${README_INJECTOR_PLAIN_SENTINEL}\nexport const control = true\n`
const README_INJECTOR_TRUNCATION_NOTE_PREFIX = '[Note: Content was truncated'
const README_INJECTOR_SUMMARY =
  'MOCK-README-INJECTOR-SUMMARY-6b1d47: the nested read got the project README and the plain read did not'

/**
 * directory-readme-injected script: the two-read batch (trigger + 对照), then the
 * de-duplication read, then the summary.
 */
function directoryReadmeInjectedScript(sandbox) {
  const nestedDir = join(sandbox.project, README_INJECTOR_DIR, README_INJECTOR_NESTED)
  const plainDir = join(sandbox.project, README_INJECTOR_PLAIN_DIR)
  return {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: [
          { name: 'read', arguments: { file_path: join(nestedDir, README_INJECTOR_TARGET_NAME) } },
          { name: 'read', arguments: { file_path: join(plainDir, README_INJECTOR_PLAIN_NAME) } },
        ],
      },
      {
        type: 'tool_call',
        name: 'read',
        arguments: { file_path: join(nestedDir, README_INJECTOR_DEDUP_NAME) },
      },
      { type: 'text', text: README_INJECTOR_SUMMARY },
    ],
  }
}

const AGENT_USAGE_PROMPT =
  'e2e agent-usage-reminder-appended: grep the fixture four times with one read alongside the first, delegate to explore, grep once more, then summarize'
const AGENT_USAGE_FIXTURE_NAME = 'agent-usage-fixture.txt'
const AGENT_USAGE_PATTERN = 'AGENT-USAGE-3c9d2f'
const AGENT_USAGE_FIXTURE_CONTENT =
  `${AGENT_USAGE_PATTERN} line one\n${AGENT_USAGE_PATTERN} line two\n`
const AGENT_USAGE_CHILD_NOTE =
  'MOCK-EXPLORE-AGENT-USAGE-NOTE-8a51c3: the explore child grepped once and answered'
const AGENT_USAGE_SUMMARY =
  'MOCK-AGENT-USAGE-SUMMARY-4e7b90: three reminders landed on the greps, then the cap and the delegation silenced them'

/**
 * agent-usage-reminder-appended script. SEVEN sequential conductor steps (the
 * counter semantics need order, not a batch), plus the child's own grep step.
 */
function agentUsageReminderScript(sandbox) {
  const fixturePath = join(sandbox.project, AGENT_USAGE_FIXTURE_NAME)
  const grepStep = () => ({
    type: 'tool_call',
    name: 'grep',
    arguments: { pattern: AGENT_USAGE_PATTERN, path: fixturePath },
  })
  return {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: [
          { name: 'grep', arguments: { pattern: AGENT_USAGE_PATTERN, path: fixturePath } },
          { name: 'read', arguments: { file_path: fixturePath } },
        ],
      },
      grepStep(),
      grepStep(),
      grepStep(),
      {
        type: 'tool_call',
        name: 'explore',
        arguments: {
          description: 'Grep the fixture and report',
          prompt: `Grep ${fixturePath} for ${AGENT_USAGE_PATTERN}, then reply with exactly: ${AGENT_USAGE_CHILD_NOTE}`,
          run_in_background: false,
        },
      },
      grepStep(),
      { type: 'text', text: AGENT_USAGE_SUMMARY },
    ],
    explore: [
      { type: 'tool_call', name: 'grep', arguments: { pattern: AGENT_USAGE_PATTERN, path: fixturePath } },
      { type: 'text', text: AGENT_USAGE_CHILD_NOTE },
    ],
  }
}

const TASK_RESUME_PROMPT =
  'e2e task-resume-info-appended: delegate to explore in the background and to oracle in the foreground, then summarize what each returned'
const TASK_RESUME_EXPLORE_CHILD_NOTE = 'MOCK-EXPLORE-TASK-RESUME-NOTE-1f6d84'
const TASK_RESUME_ORACLE_NOTE =
  'MOCK-ORACLE-TASK-RESUME-NOTE-7c2e15: the foreground delegation answered with real content'
const TASK_RESUME_SUMMARY =
  'MOCK-TASK-RESUME-SUMMARY-9a3b62: the background delegation came back with a continuation tip and the foreground one did not'

/**
 * task-resume-info-appended script. ONE batch with the continuable trigger and
 * the foreground 对照 on two DIFFERENT roles (per-role cursors), then the summary.
 */
function taskResumeInfoScript() {
  return {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: [
          {
            name: 'explore',
            arguments: {
              description: 'Background exploration of the workspace',
              prompt: 'Inspect the workspace and report what you find.',
              run_in_background: true,
            },
          },
          {
            name: 'oracle',
            arguments: {
              description: 'Foreground design question',
              prompt: 'Answer the design question in one sentence.',
              run_in_background: false,
            },
          },
        ],
      },
      { type: 'text', text: TASK_RESUME_SUMMARY },
    ],
    explore: [{ type: 'text', text: TASK_RESUME_EXPLORE_CHILD_NOTE }],
    oracle: [{ type: 'text', text: TASK_RESUME_ORACLE_NOTE }],
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

/**
 * P4-T7: submit ONE slash-command line through the commands registry's own
 * executor — the same entry the Web UI's composer uses
 * (dsh-client-ui-commands/lib/client.js:796).
 *
 * `session/prompt` is NOT a substitute and must never be used as one: a slash
 * line sent as a prompt is an ordinary user message, so it would exercise no
 * admission, no `command/run` / `command/done` pair, and no handler.
 *
 * Wire names are the projection's own (`agentId` / `line` /
 * `submittedAttachments` — dsh-commands/lib/typert.host.js:44-89); the registry
 * resolves the agent from the session id, so this call needs no agent handle.
 *
 * Returns the settled execution `{commandId, result:{kind,text?}}`, or
 * `undefined` when admission missed (syntax or unknown name) — a miss appends
 * nothing at all (dsh-commands/lib/index.js:296-299,319-321), which is the
 * 对照's measured semantics, not an error to be raised here.
 *
 * rc6-flat: there is NO measured flat counterpart (the flat surface predates the
 * commands executor's remote projection), so that transport fails LOUDLY rather
 * than guessing an endpoint name. The installed pin is 0.1.5-rc.1 = web-remote.
 */
async function commandExecute(boot, { sessionId, line }) {
  if (boot.transport === 'rc6-flat') {
    throw new Error(
      `commands/execute: no measured rc6-flat endpoint for the command executor; `
      + 'this driver speaks the web-remote projection only (installed dsh 0.1.5-rc.1)',
    )
  }
  return rpc(boot, 'commands/execute', {
    args: { agentId: sessionId, line, submittedAttachments: [] },
  })
}

// ── dsh process management (cold-start.sh discipline) ───────────────────────

function installPlugin(sandbox, env) {
  // One `plugin add` per cordis.yml insert row (three rows since P4-T3): a
  // profile missing ANY one of them aborts the whole boot naming that row
  // (`plugin tree failed to load … ERR_MODULE_NOT_FOUND`) — not just a hooks
  // profile.
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

/**
 * Poll the sandbox sessions dir until the session's log shows `expectedTurns`
 * turn/end events (P3-T9 generalized the original single-turn wait: its 对照
 * turn is a SECOND prompt on the SAME session, so the driver must wait for turn
 * 2's boundary rather than return at turn 1's).
 */
/**
 * Waits for the turn a followup-queuing command opened, and returns the NEW
 * `turnsSeen` (the count of turn/end events actually on disk). It sets the
 * counter from the LOG rather than `+= 1`, because a command that queues a
 * followup opens exactly one turn but the count is the only thing the next
 * `awaitTurnEnd` can be trusted against. On timeout it leaves the counter where
 * it was and lets the caller continue: a missing turn is then a scenario FAIL
 * with a named check, which is the honest failure mode — never a crash.
 */
async function awaitFollowupTurn(sandbox, sessionId, turnsSeen, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const observed = countCompletedTurns(sandbox, sessionId)
    if (observed > turnsSeen) {
      console.error(`drive: command queued a followup → turn ${observed} observed (turnsSeen ${turnsSeen} → ${observed})`)
      return observed
    }
    await sleep(200)
  }
  console.error(`drive: command claimed a followup but no new turn/end appeared within ${timeoutMs}ms`)
  return turnsSeen
}

/**
 * How many `turn/end` events the session's own JSONL holds — counted for ANY
 * reason, `canceled` included.
 *
 * REGISTERED RISK, not changed: a `canceled` turn would still advance the count,
 * so in principle a canceled turn could satisfy an `awaitTurnEnd` and shift the
 * numbering the next await targets. The兜底 is `lastTurnEndedOnItsOwnTerms`, which
 * asserts the FINAL turn's reason is `completed`, so a teardown that canceled the
 * last turn is red regardless of what the counter believed. Counting any reason is
 * kept because a canceled turn is still a turn that happened.
 */
function countCompletedTurns(sandbox, sessionId) {
  const log = findSessionLogs(join(sandbox.dshHome, 'sessions'))
    .find((candidate) => String(candidate.header?.id) === String(sessionId))
  return (log?.events ?? []).filter((event) => event.type === 'turn/end').length
}

async function awaitTurnEnd(sandbox, sessionId, expectedTurns = 1) {
  const deadline = Date.now() + SCENARIO_TIMEOUT_MS
  let found
  while (Date.now() < deadline) {
    const logs = findSessionLogs(join(sandbox.dshHome, 'sessions'))
    found = logs.find((log) => String(log.header.id) === String(sessionId))
    if (found !== undefined) {
      const ended = found.events.filter((event) => event.type === 'turn/end').length
      if (ended >= expectedTurns) return found
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

/**
 * `eventText(event)` with its escaped newlines restored.
 *
 * ⚠️ Load-bearing, not cosmetic: `eventText` is `JSON.stringify(event.data)`, so
 * every `\n` inside a message body arrives as the two characters `\\` + `n`. A
 * multi-line anchor (the vendored bodies all are) therefore NEVER matches against
 * the raw string, and the check built on it is silently vacuous — it can only
 * ever report "absent". This is the same trap the P4-T5 catalog assertion
 * documents; it is repeated here because these checks are new, and a vacuous
 * negative is the one failure mode a negative-only scenario cannot afford.
 */
function eventTextFlat(event) {
  return eventText(event).replace(/\\n/g, '\n')
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
 * Every durable carrier of ONE plugin-injected message text in a session log,
 * by event type — the two the DSH loop really produces for an
 * `additionalContexts` entry AND for an `agent.steer` (both go through
 * `inbox.splice('next-step', …)`):
 *   * `agent/inbox/spliced` with target `next-step`: the ACCEPT itself
 *     (dsh-agent-loop/lib/index.js:578 acceptContext / :792-794 steer →
 *     inbox.splice → session.append("agent/inbox/spliced"), lib/index.js:206);
 *   * `user/message`: the same message CLAIMED at the next step boundary and
 *     appended to the history (lib/index.js:1028), i.e. the carrier the model's
 *     next request is actually built from.
 * Both are collected so the "exactly once" check is not blind to a double
 * ACCEPT that only one of the two projections would show.
 *
 * Shared by the P3-T6 advisory and the P3-T9 continuation directive (the two
 * differ only in the injected text and the producer's `source.form`).
 */
function pluginInjectedMessageCarriers(events, injectedText) {
  const userMessages = []
  const nextStepInsertions = []
  for (const event of events) {
    if (event.type === 'user/message' && messageContentText(event.data).includes(injectedText)) {
      userMessages.push(event)
    }
    if (event.type === 'agent/inbox/spliced' && event.data?.target === 'next-step') {
      for (const message of event.data?.inserted ?? []) {
        if (messageContentText(message).includes(injectedText)) {
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
 * True when a message carries the todo continuation's producer triple verbatim:
 * {kind:'plugin', plugin:'omo-hooks', form:'instructions'}. Both halves are
 * imported/measured — the plugin name from the shipped listener module, the
 * form from its own `buildContinuationMessage` declaration (the C-mode advisory
 * uses 'notice'; conflating the two would make the E-mode pilot unable to tell
 * a continuation directive from an advisory).
 */
function isTodoContinuationSource(message) {
  return message?.source?.kind === 'plugin'
    && message.source.plugin === TODO_CONTINUATION_ENFORCER_PLUGIN
    && message.source.form === 'instructions'
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
  const carriers = pluginInjectedMessageCarriers(events, BASH_GUARD_ADVISORY_TEXT)
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

// ── P3-T9 todo-continuation-enforced analysis (模式 E e2e 打样) ───────────────

/**
 * Whether a recorded mock request carried `text` in one of its message bodies.
 *
 * Deliberately NOT `JSON.stringify(body).includes(text)`: the continuation
 * directive is MULTI-LINE, and a JSON-serialized body escapes every newline to
 * `\n`, so a raw multi-line needle can never match its own serialized form
 * (an all-newline difference that would report "the model never saw it" while
 * looking straight at it). The message text is therefore extracted with the
 * same shape rules as `messageContentText` before the comparison.
 */
function requestMessagesContain(request, text) {
  const messages = request?.body?.messages
  if (!Array.isArray(messages)) return false
  return messages.some((message) => messageContentText(message).includes(text))
}

/**
 * Every `todo/write` whole-list snapshot in a session log, in log order.
 */
function todoWriteSnapshots(events) {
  return events.filter((event) => event.type === 'todo/write')
}

/** One `todo/write` event's todos array — the complete replacement list, or []. */
function todoSnapshotOf(event) {
  const todos = event?.data?.todos
  return Array.isArray(todos) ? todos : []
}

/**
 * The incomplete subset of a snapshot, using the SHIPPED listener's predicate
 * (`NON_INCOMPLETE_STATUSES` semantics) rather than a re-typed status compare:
 * on DSH's three-member union a `status !== 'completed'` filter is equivalent,
 * but importing the module keeps the analysis and the listener from drifting
 * when either side changes.
 */
function incompleteTodoCount(todos) {
  return getTodoIncompleteCount(todos)
}

/** `turn/end`'s reason, both shapes the installed runtime has used. */
function turnEndReasonKind(event) {
  return event?.data?.reason?.kind ?? event?.data?.reason
}

/**
 * The todo-continuation-enforced assertions (plan §4.2 mode E pilot; see the
 * header's T9 section). ONE session, TWO turns:
 *   turn 1 — the continuation chain: the boundary after the 收尾 step MUST
 *     steer, the steered message MUST be claimed by the next step of the SAME
 *     turn, the todo list MUST be advanced to all-completed in that step, and
 *     only THEN may turn/end (reason completed) appear;
 *   turn 2 — the 对照: a non-empty, all-completed todo list at a stopping
 *     boundary MUST NOT steer, and turn/end MUST follow the wrap-up directly.
 *
 * Every text the assertions compare against is derived at analysis time: the
 * continuation text is `buildContinuationText(<observed first snapshot>)` from
 * the shipped listener module, so "verbatim" means "the listener's own text for
 * the list the boundary actually saw" rather than a copy pasted into the test.
 * `requests` is the mock's recorded request channel (arrival order).
 */
export function analyzeTodoContinuationEnforced({ log, requests, providersJson, bootLog }, routes) {
  const events = log?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const requestBodyHas = (request, text) => requestMessagesContain(request, text)

  // The two todo snapshots of turn 1 and the 对照 turn's own snapshot.
  const snapshots = todoWriteSnapshots(events)
  const firstSnapshot = snapshots[0]
  const secondSnapshot = snapshots[1]
  const firstTodos = todoSnapshotOf(firstSnapshot)
  const secondTodos = todoSnapshotOf(secondSnapshot)

  // The text the listener must have minted at the turn-1 boundary: assembled by
  // the listener module from the list the boundary saw (the first write; the
  // second write only happens INSIDE the continuation step).
  const expectedContinuationText = buildTodoContinuationText(firstTodos)

  const carriers = pluginInjectedMessageCarriers(events, TODO_CONTINUATION_DIRECTIVE)
  const steerSplices = carriers.nextStepInsertions
  const steerClaims = carriers.userMessages
  const steerSplice = steerSplices[0]?.event
  const steerClaim = steerClaims[0]

  // The 收尾 step's text-only assistant message (the step that stops the turn).
  const wrapup = events.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(SISYPHUS_TODO_WRAPUP),
  )
  const turnEnds = events.filter((event) => event.type === 'turn/end')
  const firstTurnEnd = turnEnds[0]
  const secondTurnEnd = turnEnds[1]
  const continuationSummary = events.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(SISYPHUS_TODO_SUMMARY),
  )

  // (c) The steer's consumption point on the WIRE: it must ride the request of
  // the step right after the 收尾 step (index 2 of the sisyphus channel: #0 the
  // todo_write step, #1 the 收尾 step, #2 the continuation step).
  const steerRequestIndex = sisyphusRequests.findIndex((request) =>
    requestBodyHas(request, expectedContinuationText))
  const continuationStepRequest = steerRequestIndex < 0 ? undefined : sisyphusRequests[steerRequestIndex]

  // (d) The 事件序 claim: the turn did NOT end at the 收尾 boundary. The steer
  // splice came after it, the claim after that, the todo advance after that,
  // and no turn/end exists before the advance.
  const noTurnEndBeforeAdvance = secondSnapshot !== undefined
    && !events.some((event) => event.type === 'turn/end' && event.seq < secondSnapshot.seq)
  const continuationSteerOpenedAnotherStepBeforeTurnEnd =
    wrapup !== undefined
    && steerSplice !== undefined
    && steerClaim !== undefined
    && secondSnapshot !== undefined
    && firstTurnEnd !== undefined
    && noTurnEndBeforeAdvance
    && wrapup.seq < steerSplice.seq
    && steerSplice.seq < steerClaim.seq
    && steerClaim.seq < secondSnapshot.seq
    && secondSnapshot.seq < firstTurnEnd.seq
    && continuationSummary !== undefined
    && turnEndReasonKind(firstTurnEnd) === 'completed'

  // (e) The per-item diff between the two turn-1 snapshots: the SAME tasks, no
  // regression, the incomplete one promoted to completed.
  const diff = firstTodos.map((todo) => {
    const after = secondTodos.find((candidate) => candidate?.content === todo?.content)
    return {
      content: todo?.content ?? null,
      before: todo?.status ?? null,
      after: after?.status ?? null,
    }
  })
  const sameContentSet =
    firstTodos.length > 0
    && firstTodos.length === secondTodos.length
    && secondTodos.every((todo) => firstTodos.some((candidate) => candidate?.content === todo?.content))
  const progressedByPromotion =
    incompleteTodoCount(firstTodos) > 0
    && incompleteTodoCount(secondTodos) === 0
    // A previously settled task must not be un-settled by the continuation step.
    && diff.every((entry) => entry.before !== 'completed' || entry.after === 'completed')

  // (f) 对照 scoping: everything after turn 1's turn/end is the control turn.
  const controlEvents = firstTurnEnd === undefined
    ? []
    : events.filter((event) => event.seq > firstTurnEnd.seq)
  // The control snapshot is DERIVED from controlEvents, never from a third
  // positional `snapshots[2]`: a log with an extra `todo/write` inside turn 1
  // (a mutation fixture, or a runtime that writes an intermediate list) would
  // otherwise shift the index and silently compare the WRONG list — the
  // scoping that makes `controlTodoWasWrittenAllCompleted` a statement about
  // the control turn. Same source of truth as the carrier search below.
  const controlSnapshot = todoWriteSnapshots(controlEvents)[0]
  const controlTodos = todoSnapshotOf(controlSnapshot)
  const controlWrapup = controlEvents.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(SISYPHUS_TODO_CONTROL_WRAPUP),
  )
  const controlCarriers = pluginInjectedMessageCarriers(controlEvents, TODO_CONTINUATION_DIRECTIVE)
  const controlInjectionCount = controlCarriers.userMessages.length
    + controlCarriers.nextStepInsertions.length
  // "turn/end 紧随": nothing step-shaping may sit between the 对照 wrap-up and
  // turn 2's turn/end — no injected message, no extra model step, no todo write.
  const STEP_SHAPING_EVENTS = new Set([
    'user/message',
    'assistant/message',
    'tool/call',
    'tool/result',
    'todo/write',
    'request/header',
    'agent/inbox/spliced',
  ])
  const controlTail = controlWrapup === undefined || secondTurnEnd === undefined
    ? []
    : controlEvents.filter(
        (event) => event.seq > controlWrapup.seq && event.seq < secondTurnEnd.seq,
      )
  const controlTurnEndedWithoutExtraStep = controlWrapup !== undefined
    && secondTurnEnd !== undefined
    && controlTail.every((event) => !STEP_SHAPING_EVENTS.has(event.type))

  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    sessionLogFound: log !== undefined,
    // (a) BOTH durable carriers exist and carry the E-mode producer triple.
    continuationSteerCarrierSourceIsOmoHooks:
      steerClaims.length >= 1
      && steerSplices.length >= 1
      && steerClaims.every((event) => isTodoContinuationSource(event.data))
      && steerSplices.every(({ message }) => isTodoContinuationSource(message)),
    // (b) ... with the listener's OWN assembled text, byte for byte, including
    // the `[Status: …]` tail and the remaining-task list.
    continuationSteerTextIsVerbatimListenerText:
      steerClaims.length >= 1
      && steerSplices.length >= 1
      && steerClaims.every((event) => messageContentText(event.data) === expectedContinuationText)
      && steerSplices.every(({ message }) => messageContentText(message) === expectedContinuationText),
    // (c) the continuation reached the model, in the step right after the 收尾
    // step (the channel index is exact: 2), and that request still carried the
    // 收尾 text — so it is provably the step that followed the boundary.
    continuationSteerReachedNextModelRequest:
      steerRequestIndex === 2
      && continuationStepRequest !== undefined
      && requestBodyHas(continuationStepRequest, SISYPHUS_TODO_WRAPUP),
    // Exactly ONE steer on EACH durable carrier (the double-steer /
    // idempotence-drift guard, the E-mode mirror of the C-mode pilot's
    // advisoryInjectedExactlyOnce).
    continuationSteerInjectedExactlyOnce:
      steerClaims.length === 1
      && steerSplices.length === 1
      && steerClaim?.data?.id !== undefined
      && steerClaim.data.id === steerSplices[0]?.message?.id,
    // (d) the 事件序 chain (the 回合未结束 claim).
    continuationSteerOpenedAnotherStepBeforeTurnEnd,
    // (e) the todo list really moved, in exactly the expected direction.
    todoProgressObservedInSecondWrite: sameContentSet && progressedByPromotion,
    // (f) 对照: a second turn ran on the same session and really closed.
    controlTurnRanAfterContinuationTurn:
      firstTurnEnd !== undefined
      && secondTurnEnd !== undefined
      && turnEndReasonKind(secondTurnEnd) === 'completed'
      && controlWrapup !== undefined,
    // ... with a NON-empty, all-completed snapshot at its boundary (so the skip
    // under test is 'all-complete', not the vacuous 'projection-absent').
    controlTodoWasWrittenAllCompleted:
      controlSnapshot !== undefined
      && controlTodos.length > 0
      && incompleteTodoCount(controlTodos) === 0,
    // ... and NO steer: zero continuation carriers after turn 1 ended, and no
    // step-shaping event between the 对照 wrap-up and turn 2's turn/end.
    controlNoSteerWhenAllCompleted:
      controlInjectionCount === 0 && controlTurnEndedWithoutExtraStep,
    // Exact request accounting: 4 steps in turn 1 + 2 steps in turn 2.
    mockSawExpectedRequestCounts: sisyphusRequests.length === 6,
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    // The observed carriers, verbatim (the evidence the assertions read).
    continuationDirective: TODO_CONTINUATION_DIRECTIVE,
    expectedContinuationText,
    continuationSteerUserMessageCarriers: steerClaims.map((event) => ({
      seq: event.seq,
      source: event.data?.source ?? null,
      text: messageContentText(event.data),
    })),
    continuationSteerNextStepInsertions: steerSplices.map(({ event, message }) => ({
      seq: event.seq,
      target: event.data?.target ?? null,
      insertedId: message?.id ?? null,
      source: message?.source ?? null,
    })),
    // The todo diffs (turn 1 pair + the control snapshot).
    todoWriteSnapshots: snapshots.map((event) => ({
      seq: event.seq,
      todos: todoSnapshotOf(event),
      incomplete: incompleteTodoCount(todoSnapshotOf(event)),
    })),
    todoDiff: diff,
    continuationStepRequestIndex: steerRequestIndex,
    turnEndReasons: turnEnds.map((event) => ({ seq: event.seq, turn: event.data?.turn ?? null, kind: turnEndReasonKind(event) ?? null })),
    controlTailEventTypes: controlTail.map((event) => event.type),
    controlContinuationInjectionCount: controlInjectionCount,
    mockRequestCount: sisyphusRequests.length,
    mockRequestModels: [...new Set(sisyphusRequests.map((request) => request.body?.model))],
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

// ── P3-T14 D-mode analysis (模式 D；见场景段头的四场景说明) ───────────────────
//
// The four listeners of this task share ONE assertion shape: a REAL tool call
// whose result text the listener rewrites (trigger) plus a REAL sibling call in
// the same batch that must stay byte-identical (对照). Everything is read off
// the durable session JSONL (`tool/result` parts by callId) — never off a
// theoretical field.

/** The three givens every P3-T14 verdict reports (shared, so no scenario can
 *  quietly stop asserting the mount while still listing assertions). */
function dModeGivens({ log, providersJson, bootLog }, routes) {
  return {
    pluginLoaded: pluginsLoaded(bootLog),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    sessionLogFound: log !== undefined,
  }
}

/**
 * The first `tool/call` whose tool name matches and whose parsed arguments
 * satisfy `matches` (absent ⇒ any arguments). Unparseable arguments are simply
 * not a match — the case the malformed-arguments scenario relies on is handled
 * by its own name-only lookup.
 */
function findToolCall(events, name, matches = () => true) {
  return events.find((event) => {
    if (event.type !== 'tool/call') return false
    if (event.data?.name !== name) return false
    const args = toolCallArguments(event)
    if (args === undefined) return false
    return matches(args)
  })
}

/** The `tool/result` part for one `tool/call` event, matched by callId. */
function toolResultForCall(results, call) {
  if (call === undefined) return undefined
  return results.find((part) => part.callId === call.data?.callId)
}

/** True when the log carries a completed turn boundary (the closure given). */
function turnCompleted(events) {
  return events.some(
    (event) =>
      event.type === 'turn/end'
      && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
  )
}

/**
 * The truncation tail note in EITHER of upstream's two normal-path wordings
 * (`[N more lines truncated …]` / `[Content truncated …]`); the character-slice
 * path's `[Output truncated …]` is deliberately NOT accepted here, because the
 * fixture is multi-line and would only reach it if the header logic regressed.
 */
const TRUNCATION_TAIL_NOTE_RE = /(more lines truncated|Content truncated) due to context window limit/

/**
 * The `edit-error-recovery-reminder` assertions (H-14). The trigger's own truth
 * is the two-edit pair on ONE real file: the second call SUCCEEDS, which proves
 * the first one's `old_string` really was absent (a synthetic error string could
 * not coexist with a successful sibling edit in the same batch).
 */
export function analyzeEditErrorRecoveryReminder(
  { log, requests, providersJson, bootLog, fixturePath },
  routes,
) {
  const events = log?.events ?? []
  const results = toolResultParts(events)
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const readCall = findToolCall(events, 'read', (args) => args.file_path === fixturePath)
  const failedEditCall = findToolCall(
    events,
    'edit',
    (args) => args.old_string === EDIT_RECOVERY_ABSENT_MARKER,
  )
  const successfulEditCall = findToolCall(
    events,
    'edit',
    (args) => args.old_string === EDIT_RECOVERY_FIXTURE_LINE,
  )
  const readResult = toolResultForCall(results, readCall)
  const failedEditResult = toolResultForCall(results, failedEditCall)
  const successfulEditResult = toolResultForCall(results, successfulEditCall)
  const reminderResults = results.filter((part) => part.text.includes(EDIT_ERROR_REMINDER))
  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    // The observation the edit needed really happened (the policy's precondition).
    readToolRanWithFixtureBytes:
      readResult !== undefined
      && readResult.isError !== true
      && readResult.text.includes(EDIT_RECOVERY_FIXTURE_SENTINEL),
    // (a) TRIGGER: the real DSH failure, with the reminder appended VERBATIM at
    // the tail (`endsWith` is the `+=` contract) and the failure still an error.
    failedEditResultCarriesReminder:
      failedEditResult !== undefined
      && failedEditResult.isError === true
      && failedEditResult.text.startsWith('Error: old_string was not found')
      && failedEditResult.text.includes(fixturePath ?? '')
      && failedEditResult.text.endsWith(EDIT_ERROR_REMINDER),
    // (b) 对照: the sibling edit SUCCEEDED and its result carries no reminder.
    successfulEditResultUnchanged:
      successfulEditResult !== undefined
      && successfulEditResult.isError !== true
      && successfulEditResult.text.includes('has been updated successfully')
      && !successfulEditResult.text.includes(EDIT_ERROR_REMINDER_MARKER),
    reminderInjectedExactlyOnce: reminderResults.length === 1,
    mockSawThreeSteps: sisyphusRequests.length === 3,
    turnCompleted: turnCompleted(events),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      fixturePath: fixturePath ?? null,
      reminderText: EDIT_ERROR_REMINDER,
      toolResults: results.map((part) => ({
        callId: part.callId,
        isError: part.isError,
        textLength: part.text.length,
        text: part.text.slice(0, 400),
      })),
      mockRequestCount: sisyphusRequests.length,
    },
  }
}

/**
 * The `json-error-recovery-reminder` assertions (H-15). The 对照 is the
 * strongest available form: BOTH calls fail with the SAME malformed-arguments
 * error, and the ONLY difference is the tool name's blacklist membership, so the
 * excluded result must be byte-identical to the trigger's pre-reminder text.
 */
export function analyzeJsonErrorRecoveryReminder(
  { log, requests, providersJson, bootLog },
  routes,
) {
  const events = log?.events ?? []
  const results = toolResultParts(events)
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const writeCall = findToolCall(events, 'write')
  const readCall = findToolCall(events, 'read')
  const writeResult = toolResultForCall(results, writeCall)
  const readResult = toolResultForCall(results, readCall)
  const observedErrorTexts = [writeResult?.text, readResult?.text].filter(
    (text) => typeof text === 'string',
  )
  // The trigger's PRE-reminder text, recovered by undoing the listener's own
  // append (`${text}\n${REMINDER}`) — the 对照 must be byte-identical to it.
  const triggerOriginalText = typeof writeResult?.text === 'string'
    && writeResult.text.endsWith(`\n${JSON_ERROR_REMINDER}`)
    ? writeResult.text.slice(0, -(JSON_ERROR_REMINDER.length + 1))
    : writeResult?.text
  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    // Both REAL calls failed on the malformed-arguments path (non-vacuous: the
    // model's arguments really were not an object).
    malformedArgumentsFailedBothCalls:
      writeResult !== undefined
      && readResult !== undefined
      && writeResult.isError === true
      && readResult.isError === true
      && observedErrorTexts.every((text) => text.startsWith(JSON_RECOVERY_EXPECTED_ERROR)),
    // The observed text is the very text the shipped table matches — if DSH's
    // wording or the port's table drifts, one of the two fails loudly.
    observedErrorTextMatchesLiveTable:
      observedErrorTexts.length === 2
      && observedErrorTexts.every((text) => matchesJsonErrorTable(text)),
    // (a) TRIGGER: `write` is not blacklisted ⇒ reminder appended verbatim.
    nonExcludedToolGotReminder:
      writeResult !== undefined
      && writeResult.text.endsWith(JSON_ERROR_REMINDER),
    // (b) 对照: `read` IS blacklisted ⇒ the untouched error text, no reminder.
    excludedToolResultUnchanged:
      readResult !== undefined
      && readResult.text === JSON_RECOVERY_EXPECTED_ERROR
      && !readResult.text.includes(JSON_ERROR_REMINDER_MARKER),
    // …and the two results differ ONLY by the reminder: the excluded one is
    // byte-identical to the trigger's pre-reminder text (the strongest 对照 form
    // this pair of calls can have).
    controlResultIsByteIdenticalToTriggerOriginal:
      readResult !== undefined
      && typeof triggerOriginalText === 'string'
      && readResult.text === triggerOriginalText,
    reminderInjectedExactlyOnce:
      results.filter((part) => part.text.includes(JSON_ERROR_REMINDER_MARKER)).length === 1,
    mockSawTwoSteps: sisyphusRequests.length === 2,
    turnCompleted: turnCompleted(events),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      expectedErrorText: JSON_RECOVERY_EXPECTED_ERROR,
      reminderText: JSON_ERROR_REMINDER,
      toolResults: results.map((part) => ({
        callId: part.callId,
        isError: part.isError,
        textLength: part.text.length,
      })),
      mockRequestCount: sisyphusRequests.length,
    },
  }
}

/**
 * The `tool-output-truncated` assertions (H-16). Both greps run in ONE batch,
 * so "exactly one truncation" is a statement about a batch in which the control
 * really returned its own bytes.
 */
export function analyzeToolOutputTruncated(
  { log, requests, providersJson, bootLog, bigFixtureChars },
  routes,
) {
  const events = log?.events ?? []
  const results = toolResultParts(events)
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const bigGrepCall = findToolCall(events, 'grep', (args) => args.pattern === TRUNCATOR_BIG_PATTERN)
  const smallGrepCall = findToolCall(
    events,
    'grep',
    (args) => args.pattern === TRUNCATOR_SMALL_PATTERN,
  )
  const bigResult = toolResultForCall(results, bigGrepCall)
  const smallResult = toolResultForCall(results, smallGrepCall)
  const truncatedResults = results.filter((part) => TRUNCATION_TAIL_NOTE_RE.test(part.text))
  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    // (a) TRIGGER: the big grep really ran and its HEAD survived (the listener
    // preserves the first three lines).
    bigGrepRanWithHeadBytes:
      bigResult !== undefined
      && bigResult.isError !== true
      && bigResult.text.includes(`Found ${TRUNCATOR_BIG_LINE_COUNT} matches`)
      && bigResult.text.includes(TRUNCATOR_BIG_FIRST_MARKER),
    // …and the TAIL was dropped, the result shrank, and the tail note is there.
    bigGrepOutputTruncated:
      bigResult !== undefined
      && TRUNCATION_TAIL_NOTE_RE.test(bigResult.text)
      && !bigResult.text.includes(TRUNCATOR_BIG_LAST_MARKER)
      && typeof bigFixtureChars === 'number'
      && bigResult.text.length < bigFixtureChars,
    // (b) 对照: the small grep returned BOTH its lines and no note.
    smallGrepControlUnchanged:
      smallResult !== undefined
      && smallResult.isError !== true
      && TRUNCATOR_SMALL_LINES.every((line) => smallResult.text.includes(line))
      && !TRUNCATION_TAIL_NOTE_RE.test(smallResult.text),
    truncatedExactlyOnce: truncatedResults.length === 1,
    mockSawTwoSteps: sisyphusRequests.length === 2,
    turnCompleted: turnCompleted(events),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      bigFixtureChars: bigFixtureChars ?? null,
      bigResultLength: bigResult?.text.length ?? null,
      smallResultLength: smallResult?.text.length ?? null,
      truncatableTools: [...TOOL_OUTPUT_TRUNCATABLE_TOOLS],
      toolMaxTokens: { ...TOOL_OUTPUT_SPECIFIC_MAX_TOKENS },
      defaultMaxTokens: TOOL_OUTPUT_DEFAULT_MAX_TOKENS,
      mockRequestCount: sisyphusRequests.length,
    },
  }
}

/**
 * The `empty-task-response-corrected` assertions (H-07). The trigger's own truth
 * is the CHILD LOG: the blank child really completed with a whitespace-only
 * assistant message, so the parent's result was legitimately empty BEFORE the
 * listener replaced it.
 */
export function analyzeEmptyTaskResponseCorrected(
  { log, allLogs, requests, providersJson, bootLog },
  routes,
) {
  const events = log?.events ?? []
  const results = toolResultParts(events)
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const exploreCall = findToolCall(events, 'explore')
  const oracleCall = findToolCall(events, 'oracle')
  const exploreResult = toolResultForCall(results, exploreCall)
  const oracleResult = toolResultForCall(results, oracleCall)
  const children = (allLogs ?? []).filter(
    (candidate) =>
      candidate.header?.origin === 'subagent'
      && String(candidate.header?.parentSession) === String(log?.header?.id),
  )
  const childTexts = children.map((candidate) => {
    const lastAssistant = [...candidate.events]
      .reverse()
      .find((event) => event.type === 'assistant/message')
    return messageContentText(lastAssistant?.data?.message)
  })
  const warningResults = results.filter((part) => part.text.includes(EMPTY_RESPONSE_WARNING))
  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    // Both delegations really produced a child session (non-vacuous 对照).
    twoChildrenRan: children.length === 2,
    // The trigger's precondition, proven on the CHILD side: a whitespace-only
    // completion (upstream's `.trim() === ""` empty case).
    blankChildProducedNoVisibleText: childTexts.some((text) => text.trim() === ''),
    // …and the control child really answered with its own note.
    controlChildProducedItsNote: childTexts.some((text) => text.includes(EMPTY_TASK_ORACLE_NOTE)),
    // (a) TRIGGER: the empty delegation result IS the corrective text, verbatim,
    // and the call stayed a SUCCESS (never turned into an isError).
    emptyDelegationResultReplacedWithWarning:
      exploreResult !== undefined
      && exploreResult.isError !== true
      && exploreResult.text === EMPTY_RESPONSE_WARNING,
    // (b) 对照: the non-empty delegation result is byte-identical to the child's
    // own answer.
    nonEmptyDelegationResultUntouched:
      oracleResult !== undefined
      && oracleResult.isError !== true
      && oracleResult.text === EMPTY_TASK_ORACLE_NOTE,
    warningInjectedExactlyOnce: warningResults.length === 1,
    mockSawTwoSteps: sisyphusRequests.length === 2,
    turnCompleted: turnCompleted(events),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      warningText: EMPTY_RESPONSE_WARNING,
      childCount: children.length,
      childAssistantTexts: childTexts,
      toolResults: results.map((part) => ({
        callId: part.callId,
        isError: part.isError,
        text: part.text,
      })),
      mockRequestCount: sisyphusRequests.length,
    },
  }
}

// ── P3-T15 批 B analysis (模式 D；見场景段头的三场景说明) ───────────────────────
//
// The three listeners share ONE assertion shape with the T14 set: a REAL call
// whose result the listener rewrites (trigger) plus a REAL sibling in the same
// batch that must stay byte-identical (对照). Everything is read off the durable
// session JSONL (`tool/result` parts by callId) — never off a theoretical field.

/**
 * The `directory-readme-injected` assertions (H-21). The non-vacuity argument is
 * the CONTROL read in the SAME batch: its chain has no README, so "the injection
 * fired" cannot be an artifact of the listener rewriting every read.
 */
export function analyzeDirectoryReadmeInjected(
  { log, requests, providersJson, bootLog, readmePath, targetPath, plainPath, dedupPath },
  routes,
) {
  const events = log?.events ?? []
  const results = toolResultParts(events)
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const targetCall = findToolCall(events, 'read', (args) => args.file_path === targetPath)
  const plainCall = findToolCall(events, 'read', (args) => args.file_path === plainPath)
  const dedupCall = findToolCall(events, 'read', (args) => args.file_path === dedupPath)
  const targetResult = toolResultForCall(results, targetCall)
  const plainResult = toolResultForCall(results, plainCall)
  const dedupResult = toolResultForCall(results, dedupCall)
  const injectedResults = results.filter((part) => part.text.includes(README_INJECTION_MARKER))
  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    // (a) TRIGGER: the README block names the seeded file's own directory README,
    // and the README's bytes really landed in the tool result.
    targetReadCarriesReadme:
      targetResult !== undefined
      && targetResult.isError !== true
      && targetResult.text.includes(`${README_INJECTION_MARKER} ${readmePath}]`)
      && targetResult.text.includes(README_INJECTOR_README_SENTINEL),
    // APPEND, not replace: the tool's own render (the file's bytes) survived.
    targetReadKeptItsOwnBytes:
      targetResult !== undefined && targetResult.text.includes(README_INJECTOR_TARGET_SENTINEL),
    // A tiny README is under every budget, so no truncation notice may appear —
    // this is also the loud signal if the runtime's token budget ever regresses.
    targetReadUntruncated:
      targetResult !== undefined
      && !targetResult.text.includes(README_INJECTOR_TRUNCATION_NOTE_PREFIX),
    // (b) 对照: the README-less chain leaves the result byte-identical.
    controlReadUnchanged:
      plainResult !== undefined
      && plainResult.isError !== true
      && plainResult.text.includes(README_INJECTOR_PLAIN_SENTINEL)
      && !plainResult.text.includes(README_INJECTION_MARKER),
    // The DIRECTORY-keyed de-duplication, on the real runtime.
    dedupReadNotInjected:
      dedupResult !== undefined
      && dedupResult.text.includes(README_INJECTOR_DEDUP_SENTINEL)
      && !dedupResult.text.includes(README_INJECTION_MARKER),
    readmeInjectedExactlyOnce: injectedResults.length === 1,
    mockSawThreeSteps: sisyphusRequests.length === 3,
    turnCompleted: turnCompleted(events),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      readmePath: readmePath ?? null,
      targetPath: targetPath ?? null,
      injectedResultCount: injectedResults.length,
      toolResults: results.map((part) => ({
        callId: part.callId,
        isError: part.isError,
        textLength: part.text.length,
        text: part.text.slice(0, 600),
      })),
      mockRequestCount: sisyphusRequests.length,
    },
  }
}

/**
 * The `agent-usage-reminder-appended` assertions (H-22). The counter semantics are
 * asserted ACROSS the five greps (three reminders, then the cap, then silence
 * after the delegation), and the orchestrator gate is asserted on the CHILD's own
 * grep result — a session the preset's toolFilter stripped of every delegation
 * tool.
 */
export function analyzeAgentUsageReminderAppended(
  { log, allLogs, requests, providersJson, bootLog },
  routes,
) {
  const events = log?.events ?? []
  const results = toolResultParts(events)
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const grepCalls = events.filter(
    (event) => event.type === 'tool/call' && event.data?.name === 'grep',
  )
  const readCall = findToolCall(events, 'read')
  const delegationCall = findToolCall(events, 'explore')
  const grepResults = grepCalls.map((call) => toolResultForCall(results, call))
  const readResult = toolResultForCall(results, readCall)
  const delegationResult = toolResultForCall(results, delegationCall)
  const reminderResults = results.filter((part) => part.text.includes(REMINDER_MESSAGE_MARKER))
  const children = (allLogs ?? []).filter(
    (candidate) =>
      candidate.header?.origin === 'subagent'
      && String(candidate.header?.parentSession) === String(log?.header?.id),
  )
  const childGrepResults = children
    .flatMap((candidate) => toolResultParts(candidate.events))
    .filter((part) => part.text.includes(AGENT_USAGE_PATTERN))
  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    // The read control really is a NON-target by the shipped list (never by hand).
    readControlIsNotATargetTool: !AGENT_USAGE_TARGET_TOOLS.includes('read'),
    // (a) TRIGGER: the FIRST target-tool result ends with the reminder VERBATIM.
    firstTargetResultCarriesReminder:
      grepResults.length === 5
      && grepResults[0] !== undefined
      && grepResults[0].isError !== true
      && grepResults[0].text.endsWith(REMINDER_MESSAGE),
    // The cap: EXACTLY MAX_REMINDERS reminders in the whole parent log…
    reminderInjectedExactlyMaxRemindersTimes:
      reminderResults.length === AGENT_USAGE_MAX_REMINDERS,
    // …and the FOURTH grep (the one past the cap) stayed untouched.
    capSuppressedTheFourthTargetResult:
      grepResults[3] !== undefined && !grepResults[3].text.includes(REMINDER_MESSAGE_MARKER),
    // (b) same-batch 对照: the non-target result is byte-identical.
    nonTargetControlUnchanged:
      readResult !== undefined
      && readResult.isError !== true
      && readResult.text.includes(AGENT_USAGE_PATTERN)
      && !readResult.text.includes(REMINDER_MESSAGE_MARKER),
    // The delegation was untouched (it is not a target tool)…
    delegationResultUnchanged:
      delegationResult !== undefined
      && delegationResult.isError !== true
      && delegationResult.text.includes(AGENT_USAGE_CHILD_NOTE),
    // …and it marked the session: the FIFTH grep (after the delegation) is silent.
    postDelegationTargetResultSuppressed:
      grepResults[4] !== undefined && !grepResults[4].text.includes(REMINDER_MESSAGE_MARKER),
    // The orchestrator gate, on the REAL restricted child scope: the child ran the
    // SAME grep and must NOT have been told to delegate.
    childTargetResultRan: childGrepResults.length === 1,
    childTargetResultNotReminded:
      childGrepResults.length === 1
      && childGrepResults.every((part) => !part.text.includes(REMINDER_MESSAGE_MARKER)),
    mockSawSevenSteps: sisyphusRequests.length === 7,
    turnCompleted: turnCompleted(events),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      reminderText: REMINDER_MESSAGE,
      childSessionCount: children.length,
      childGrepResults: childGrepResults.map((part) => part.text.slice(0, 300)),
      toolResults: results.map((part) => ({
        callId: part.callId,
        isError: part.isError,
        textLength: part.text.length,
        text: part.text.slice(0, 400),
      })),
      mockRequestCount: sisyphusRequests.length,
    },
  }
}

/**
 * The `task-resume-info-appended` assertions (H-23). The trigger's own truth is
 * the rendered `started subagent <id>` prefix: the asserted id is the one the
 * runtime really put there, so "the tip names the right child" cannot be a
 * synthetic artifact.
 */
export function analyzeTaskResumeInfoAppended(
  { log, requests, providersJson, bootLog },
  routes,
) {
  const events = log?.events ?? []
  const results = toolResultParts(events)
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const exploreCall = findToolCall(events, 'explore')
  const oracleCall = findToolCall(events, 'oracle')
  const exploreResult = toolResultForCall(results, exploreCall)
  const oracleResult = toolResultForCall(results, oracleCall)
  const exploreText = exploreResult?.text ?? ''
  const continuedId = exploreText.startsWith(DSH_CONTINUABLE_TEXT_PREFIX)
    ? exploreText.slice(DSH_CONTINUABLE_TEXT_PREFIX.length).split('\n')[0].trim()
    : undefined
  const hintResults = results.filter((part) => part.text.includes(TASK_RESUME_CONTINUATION_MARKER))
  // The ONE batch must really be one assistant message carrying BOTH delegations
  // (the mock's `tool_calls` primitive), so "the 对照 rode the same step" is
  // provable rather than assumed.
  const delegationsRanInOneBatch = events.some((event) => {
    if (event.type !== 'assistant/message') return false
    const blocks = (event.data?.message?.content ?? []).filter((block) => block?.type === 'tool-call')
    const names = blocks.map((block) => block.name)
    return blocks.length === 2 && names.includes('explore') && names.includes('oracle')
  })
  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    // The trigger's own precondition: the runtime really rendered a CONTINUABLE
    // delegation (the id below is read OUT of those bytes).
    continuableRenderObserved:
      exploreResult !== undefined
      && exploreResult.isError !== true
      && continuedId !== undefined
      && continuedId.length > 0,
    // (a) TRIGGER: the tip is the TAIL and names THAT id through the DSH call.
    continuableResultCarriesResumeHint:
      exploreResult !== undefined
      && continuedId !== undefined
      && exploreText.endsWith(buildTaskResumeHint(continuedId)),
    // No OMO signature survives in the durable bytes.
    hintCarriesNoOmoSignature:
      exploreText.includes('send_message(agent_id="')
      && !exploreText.includes('task_id=')
      && !exploreText.includes('load_skills')
      && !exploreText.includes('task('),
    // (b) 对照: the FOREGROUND sibling's result is the child's own answer, verbatim.
    foregroundControlUnchanged:
      oracleResult !== undefined
      && oracleResult.isError !== true
      && oracleResult.text === TASK_RESUME_ORACLE_NOTE,
    delegationsRanInOneBatch,
    hintAppendedExactlyOnce: hintResults.length === 1,
    // MEASURED (kept sandbox): the conductor's request count here is a RUNTIME
    // SCHEDULING RACE, not a fixed number. The P3-T15 evidence pass recorded THREE
    // — steps 1-2 are the delegation batch and the summary; the third is the extra
    // step the runtime opens when the CONTINUABLE child settles and its notice
    // reaches the parent (dsh-tool-subagent's "the runtime sends the parent a
    // notice containing its outcome"), all inside the SAME `completed` turn —
    // while the review's independent pass measured TWO. The earlier wording read as
    // a fixed measured value ("THREE, not two") that the review could not
    // reproduce; it is corrected to the race here. The assertion therefore stays a
    // FLOOR over the batch+summary pair: an exact count would pin the race, not
    // this hook. The lost-step shape a floor cannot see is covered by the mutation
    // QA rather than by a number — see the 'the conductor ran only the batch'
    // defect in the self-test below, which drives this very name red.
    mockSawTheDelegationAndTheSummary: sisyphusRequests.length >= 2,
    turnCompleted: turnCompleted(events),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      continuedId: continuedId ?? null,
      exploreText,
      oracleText: oracleResult?.text ?? null,
      hintCount: hintResults.length,
      mockRequestCount: sisyphusRequests.length,
    },
  }
}

// ── P3-T12 notification-delivery analysis (模式 F) ────────────────────────────
//
// The SHARED assertion core for the two P3-T12 notification listeners. Both
// ports have the same delivery shape — a trigger fact observed by the listener,
// ONE stable anchor line logged immediately BEFORE the OS command is
// dispatched — so the carrier rule, the exactly-once count and the swallowed
// failure probe are asserted by ONE code path, parameterized by the anchor the
// scenario under test owns.
//
// THE LOG ANCHOR CARRIER (measured, then pinned): both registrars log through
// `console.log` (see the two `register*` functions), i.e. to the dsh process's
// stdout/stderr — NOT to the session JSONL (the listeners forbid disk reads on
// the event path, discipline ③, so they cannot append a session event). The
// driver's `bootDsh` accumulates every stdout and stderr chunk into the boot
// log, so in THIS harness each anchor's carrier is the boot log. The session
// JSONL is still asserted for the BUSINESS facts (work really happened, the
// turn really completed); no anchor is asserted there, on purpose.
//
// The assertions:
//   (a) the trigger really happened — a real `bash` call whose non-error result
//       carries the fixture bytes with the file it wrote really on disk (the
//       session scenario), or a subagent delegation that really started a
//       background job (the background scenario);
//   (b) the parent turn carried `reason.kind === 'completed'` (the state the
//       session scheduler's completion gate reads);
//   (c) EXACTLY ONE anchor line, byte-for-byte, with the listener's own
//       `<kind>`/`<status>` and title/label. Exactly one is the "同一会话同一
//       turn/end 不产生重复通知" state-machine claim: the completion arms ONE
//       timer, and the auxiliary `agent/status` idle that follows is absorbed
//       by the pending/notified guards (session); the job registry delivers a
//       settlement once and the notified-id set absorbs a repeat (background);
//   (d) the backend command was really CONSTRUCTED AND DISPATCHED: the anchor
//       is logged by the listener immediately BEFORE `backend.notify(...)`, and
//       the production backend is `execFile(NOTIFY_SEND_COMMAND, [title,
//       body])`; the OS command itself is unobservable, so the swallowed
//       `… FAILED: …` line is the probe that the spawn was attempted on a box
//       where notify-send cannot run. Both shapes (silent success / swallowed
//       failure) pass; the assertion that must NOT regress is "the failure
//       never escapes the listener".
const SESSION_NOTIFICATION_ANCHOR_RE =
  /\[omo-hooks\] session-notification: (idle|error) (.+)/g
/** The swallowed-failure probe: exact prefix, any `<what>` / `<error>` text. */
const SESSION_NOTIFICATION_SWALLOW_RE =
  /\[omo-hooks\] session-notification FAILED: /g
const BACKGROUND_NOTIFICATION_ANCHOR_RE =
  /\[omo-hooks\] background-notification: (\S+) (.+)/g
/** The sibling module's swallowed-failure probe. */
const BACKGROUND_NOTIFICATION_SWALLOW_RE =
  /\[omo-hooks\] background-notification FAILED: /g

function countMatches(text, re) {
  return [...text.matchAll(new RegExp(re.source, re.flags))].length
}

/** Every line of a log that starts with one anchor prefix, trimmed. */
function notificationLinesOf(text, prefix) {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))
}

/** The scenario-owned half of the shared assertion core. */
/**
 * The shared half of both notification analyses. `topLevelSession` is false
 * only for the background scenario's own fixture, whose subject is a delegated
 * job rather than the top-level session.
 */
function notificationDeliveryExpectations(spec) {
  return {
    pluginLoaded: pluginsLoaded(spec.bootLog),
    sisyphusProviderActive: new RegExp(
      `"provider":"${spec.routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(spec.providersJson),
    sessionLogFound: spec.log !== undefined,
    // (b) the turn closed the way the completion gate requires.
    turnCompleted: (spec.log?.events ?? []).some(
      (event) => event.type === 'turn/end' && turnEndReasonKind(event) === 'completed',
    ),
    // The batch closed normally. The background scenario cannot pin the EXACT
    // count: DSH's native reporter may already have opened the parent's wake-up
    // turn by the time this analysis runs (the settlement lands inside the
    // settle window), so the parent's step count is 2 or 3 depending on that
    // race — the honest assertion is "at least the two scripted steps".
    ...(spec.topLevelSession === false
      ? { mockSawAtLeastTwoSteps: spec.sisyphusRequests.length >= 2 }
      : { mockSawBothSteps: spec.sisyphusRequests.length === 2 }),
    ...(spec.topLevelSession === false
      ? {}
      : {
          // The session-under-test really is the TOP-LEVEL one (so no anchor
          // can be a delegated child's), and the subagent filter left no extra
          // line: a child session's completion would add a second anchor. The
          // depth field is the producer-written header fact (`delegationDepth:
          // 0` for a top-level session — dsh-subagent writes `parent + 1` for
          // children), so `<= 0` is the correct top-level test, not
          // `=== undefined`.
          onlyTheTopLevelSessionNotified:
            spec.log?.header?.origin !== 'subagent'
            && (spec.log?.header?.delegationDepth ?? 0) <= 0
            && spec.sessionAnchorCount === 1,
        }),
  }
}

/**
 * The `session-notification-log` assertions.
 * `fixturePath`/`fixtureText` are the sandbox artifacts the script wrote.
 */
export function analyzeSessionNotificationLog(
  { log, requests, providersJson, bootLog, fixturePath, fixtureText, expectedAnchor },
  routes,
) {
  const events = log?.events ?? []
  const results = toolResultParts(events)
  const bashCall = events.find((event) => event.data?.name === 'bash')
  const bashResult = bashCall === undefined
    ? undefined
    : results.find((part) => part.callId === bashCall.data?.callId)

  const anchor = expectedAnchor ?? SESSION_NOTIFICATION_EXPECTED_ANCHOR
  const anchorCount = countMatches(bootLog ?? '', SESSION_NOTIFICATION_ANCHOR_RE)
  const anchorLineCount = (bootLog ?? '')
    .split('\n')
    .filter((line) => line.trim() === anchor).length
  const swallowedFailureCount = countMatches(bootLog ?? '', SESSION_NOTIFICATION_SWALLOW_RE)

  const checks = {
    ...notificationDeliveryExpectations({
      log,
      routes,
      providersJson,
      bootLog,
      sisyphusRequests: requests.filter((request) => request.role === 'sisyphus'),
      sessionAnchorCount: anchorCount,
    }),
    // (a) the work the completion gate must have seen: a real bash call, a
    // non-error result carrying the fixture bytes, and the file on disk.
    bashCallRanAndProducedFixtureBytes:
      bashCall !== undefined
      && bashResult !== undefined
      && bashResult.isError !== true
      && bashResult.text.includes(fixtureText),
    proofFileLandedOnDisk:
      typeof fixturePath === 'string' && existsSync(fixturePath),
    // (c) EXACTLY ONE anchor, on the measured carrier (the boot log), and it is
    // the listener's OWN line for this completion.
    notificationAnchorLoggedOnce: anchorCount === 1,
    notificationAnchorIsTheShippedLine:
      anchorLineCount === 1
      && anchor.startsWith(SESSION_NOTIFICATION_LOG_PREFIX),
    // (d) the dispatch surface was live (a backend exists on this platform) and
    // the command attempt was observable: success ⇒ no failure line; failure ⇒
    // a swallowed `FAILED:` line, never an exception (discipline ②). The
    // `<= 1` bound is the exactly-once claim extended to the failure channel:
    // a second failure line would mean the dispatch ran twice.
    notificationBackendDispatchObserved:
      anchorCount === 1 && swallowedFailureCount <= 1,
    notificationFailureSwallowedNotThrown: swallowedFailureCount <= 1,
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    // The observed carrier, verbatim (the evidence the anchor assertions read).
    anchorCarrier: 'boot-log (dsh process stdout/stderr via console.log in the registrar)',
    expectedAnchorLine: anchor,
    notificationLines: notificationLinesOf(bootLog, SESSION_NOTIFICATION_LOG_PREFIX),
    notificationAnchorCount: anchorCount,
    notificationFailureLineCount: swallowedFailureCount,
    notificationFailureLines: notificationLinesOf(bootLog, SESSION_NOTIFICATION_FAILURE_PREFIX),
    notifySendCommand: NOTIFY_SEND_COMMAND,
    fixturePath: fixturePath ?? null,
    bashCallId: bashCall?.data?.callId ?? null,
    bashResultText: bashResult?.text ?? null,
    turnEndReasons: (log?.events ?? [])
      .filter((event) => event.type === 'turn/end')
      .map((event) => ({ seq: event.seq, kind: turnEndReasonKind(event) ?? null })),
    mockRequestCount: requests.filter((request) => request.role === 'sisyphus').length,
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

/**
 * The `background-notification-log` assertions — the POSITIVE form (P3-T13
 * flipped this from the P3-T12 OBSERVED-DEFECT form after the deferred
 * `ctx.inject(['jobs'])` subscription fix).
 *
 * THE CONSTRUCTION IS REAL, and (P3-T13) it is now the ONE that creates a real
 * `ctx.jobs` entry: the scenario flips its sandbox copy of the `explore` row to
 * `backgroundMode: one-shot` before the session composes, so ONE conductor step
 * that calls `explore` with `run_in_background: true` goes through
 * `dsh-tool-subagent`'s one-shot background path
 * (`jobs.start({kind:'subagent', label: args.description, owner: parent, …})`,
 * `lib/index.js:537-545`). The call returns immediately, the parent turn closes
 * `completed`, the child session really runs and settles, and the listener's
 * `onJobDone` subscription turns that settlement into the anchor line. DSH's OWN
 * reporter (`dsh-tool-jobs`, `lib/index.js:206-224`) independently delivers the
 * same settlement as a model-visible notice — that is the non-vacuity witness
 * this analysis asserts as `nativeSettlementNoticeDelivered`.
 *
 * WHY `continuable` COULD NOT BE USED (the P3-T12 scenario's construction): a
 * continuable child has no background job at all — verbatim
 * `dsh-subagent/lib/types/run-settlement.js`: "Only the one-shot background path
 * uses Jobs; continuable children have no Task, no per-message result, and no
 * Task cancellation." Every shipped concerto row is `continuable`, so the
 * delegation this scenario drives had to be re-pointed at the one-shot path
 * (`enableOneShotBackgroundExplore`; see the scenario section's fact 2).
 *
 * THE ASSERTIONS (the POSITIVE form this scenario was flipped to in P3-T13; the
 * fix is `ctx.inject(['jobs'])` in the registrar — see the module header's WHY
 * section for the root cause):
 *   (a) a background job really was started — a `tool/call` whose parsed
 *       arguments asked for the background, with a real callId;
 *   (b) the delegated child really ran (its own session log with the
 *       producer-written subagent header);
 *   (c) DSH's native reporter delivered the settlement notice for THAT job, so
 *       the anchor below cannot describe a job that never settled;
 *   (d) the port's anchor line appeared EXACTLY ONCE, byte-for-byte, with a
 *       TERMINAL status (the listener's own three-member list) and THIS job's
 *       label. Exactly once is the "同一 settlement 不产生重复通知" claim: the
 *       registry delivers a settlement once and the listener's notified-id set
 *       absorbs a repeat;
 *   (e) no false positive: exactly one NON-FAILURE line on the notification
 *       channel, and it is the well-formed anchor (a second anchor OR any stray
 *       non-anchor line the listener logged fails this). The swallowed
 *       `… FAILED: …` line is NOT part of this surface: it is the HOST's
 *       delivery verdict (`notify-send` exists on a developer desktop and not on
 *       the CI image — run 36347748836, gate 3, `spawn notify-send ENOENT`), and
 *       the scenario's contract object is the anchor line, not OS delivery;
 *   (e2) the backend dispatch was attempted and its failure never escaped the
 *       listener — the SAME `<= 1` claim the sibling 'session-notification-log'
 *       scenario makes as `notificationFailureSwallowedNotThrown`, with the
 *       `notify-send`-absent host explicitly tolerated (see the check's own
 *       comment);
 *   (f) the sibling session-notification listener did not double-announce (the
 *       top-level turn's completion is its only anchor).
 *
 * The three canonical ways this can break — no anchor at all (the P3-T13
 * defect), an anchor emitted twice, and an anchor whose status/label drifted —
 * are MUTATION-TESTED in the self-test, each failing on its own named check.
 */
export function analyzeBackgroundNotificationLog(
  { log, childLog, allLogs, requests, providersJson, bootLog },
  routes,
) {
  const events = log?.events ?? []
  const childEvents = childLog?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const delegatingCall = events.find((event) => {
    if (event.type !== 'tool/call') return false
    const args = toolCallArguments(event)
    return args?.run_in_background === true
  })
  const delegatingArgs = delegatingCall === undefined ? undefined : toolCallArguments(delegatingCall)

  // The anchor facts, each read from a fresh regex (the module-level one carries
  // /g and is shared): the PARSED status/label pairs, and the byte-for-byte
  // count of the expected line.
  const anchorMatches = [
    ...(bootLog ?? '').matchAll(new RegExp(BACKGROUND_NOTIFICATION_ANCHOR_RE.source, 'g')),
  ]
  const anchorStatuses = anchorMatches.map((match) => match[1])
  const anchorLabels = anchorMatches.map((match) => match[2].trim())
  const anchorCount = anchorMatches.length
  const anchorLineCount = (bootLog ?? '')
    .split('\n')
    .filter((line) => line.trim() === BACKGROUND_NOTIFICATION_EXPECTED_ANCHOR).length
  const anchorLines = notificationLinesOf(bootLog, BACKGROUND_NOTIFICATION_LOG_PREFIX)
  // The swallowed-failure channel: the backend's own report that
  // `execFile(NOTIFY_SEND_COMMAND, …)` could not be run at all. `countMatches`
  // keeps the regex-count form the sibling scenario uses; `failureLines` is the
  // same fact as lines, for the bonus and the environment classification below.
  const failureLines = notificationLinesOf(bootLog, BACKGROUND_NOTIFICATION_FAILURE_PREFIX)
  const swallowedFailureCount = countMatches(bootLog ?? '', BACKGROUND_NOTIFICATION_SWALLOW_RE)
  // THE FALSE-POSITIVE SURFACE: the listener's NON-FAILURE notification lines
  // only. A swallowed `… FAILED: …` line is the HOST's delivery verdict, never a
  // false announcement — `notify-send` exists on a developer desktop and does not
  // exist on the CI image (run 36347748836, gate 3:
  // `[omo-hooks] background-notification FAILED: notification dispatch failed:
  // Error: spawn notify-send ENOENT`), and this scenario's contract object is the
  // ANCHOR LINE, not OS delivery. `BACKGROUND_NOTIFICATION_LOG_PREFIX` already
  // excludes the failure prefix by construction (the anchor needs `': '` where the
  // failure line carries `' FAILED: '`); the explicit filter keeps the claim true
  // even if the two prefixes ever converge.
  const nonFailureNotificationLines = [...anchorLines, ...failureLines].filter(
    (line) => !line.startsWith(BACKGROUND_NOTIFICATION_FAILURE_PREFIX),
  )
  const nonFailureNotificationLineCount = nonFailureNotificationLines.length
  // The platform axis, recorded (never asserted): which delivery verdict this
  // host produced. Both shapes PASS — see `notificationFailureSwallowedNotThrown`.
  const notifySendAbsenceLines = failureLines.filter((line) => /\bENOENT\b/.test(line))
  const deliveryVerdict = failureLines.length === 0
    ? `delivered (no failure line: ${NOTIFY_SEND_COMMAND} ran on this host, or succeeded silently)`
    : notifySendAbsenceLines.length > 0
      ? `${NOTIFY_SEND_COMMAND} absent on this host (${notifySendAbsenceLines.length}x ENOENT) — tolerated`
      : `${failureLines.length}x swallowed backend failure (no ENOENT) — tolerated`
  const sessionAnchorCount = countMatches(bootLog ?? '', SESSION_NOTIFICATION_ANCHOR_RE)
  // The settlement really DID happen (the child ran and closed, and DSH's own
  // reporter delivered its notice for this job), so a missing anchor below is
  // "the port stayed silent", never "no job was involved".
  const nativeSettlementNoticeDelivered = nativeJobsNoticeDelivered(events)

  const checks = {
    ...notificationDeliveryExpectations({
      log,
      routes,
      providersJson,
      bootLog,
      sisyphusRequests,
      topLevelSession: false,
    }),
    // (a) a background job really was started: a `tool/call` whose parsed
    // arguments asked for the background, with a real callId.
    backgroundJobDelegationObserved:
      delegatingCall !== undefined
      && delegatingArgs?.run_in_background === true
      && typeof delegatingCall.data?.callId === 'string',
    // ... and the delegated child really ran (its own session log with the
    // producer-written subagent header), so a settlement was a real event.
    delegatedChildSessionRan:
      childLog !== undefined
      && childLog.header?.origin === 'subagent'
      && childEvents.length > 0,
    // ... and DSH's native reporter delivered the settlement to the parent, so
    // the listener had a real settlement to observe.
    nativeSettlementNoticeDelivered,
    // (d) the anchor line appeared EXACTLY ONCE, byte-for-byte. This is the
    // primary positive claim of the fix (P3-T13): the deferred
    // `ctx.inject(['jobs'])` subscription really reaches `onJobDone`.
    backgroundNotificationAnchorLoggedOnce: anchorLineCount === 1,
    // ... with a TERMINAL status, from the listener's OWN list (the task book's
    // completed|killed|failed: a killed or failed job still notifies).
    backgroundNotificationAnchorTerminalStatus:
      anchorCount === 1
      && BACKGROUND_NOTIFICATION_TERMINAL_STATUSES.includes(anchorStatuses[0]),
    // ... and with THIS job's label (the delegation's `description`, which the
    // one-shot background path passes to `jobs.start` verbatim).
    backgroundNotificationAnchorLabelExpected:
      anchorCount === 1 && anchorLabels[0] === BACKGROUND_NOTIFICATION_EXPECTED_LABEL,
    // (e) no false positive: exactly ONE NON-FAILURE line on the notification
    // channel, and it is the well-formed anchor the listener really owns (the
    // regex-parsed count is 1). A second anchor (the double-notification failure
    // mode) and any stray non-anchor line logged on the notification surface both
    // fail this check. The swallowed backend `FAILED:` line is deliberately NOT
    // part of this count — a host without `notify-send` reds it for no reason
    // (the P3-T13 CI defect: run 36347748836, gate 3); it is asserted on its own
    // axis by `notificationFailureSwallowedNotThrown` directly below.
    noBackgroundNotificationFalsePositive:
      anchorCount === 1 && nonFailureNotificationLineCount === 1,
    // (e2) THE BACKEND-DISPATCH AXIS, deliberately the SAME claim the sibling
    // 'session-notification-log' scenario makes (`notificationFailureSwallowedNotThrown`,
    // the same `<= 1` bound): the dispatch was really attempted, and its failure
    // never escaped the listener (discipline ②). A host WITHOUT `notify-send` is
    // EXPLICITLY TOLERATED: the CI image has no `notify-send`, `execFile` reports
    // `Error: spawn notify-send ENOENT`, and that single swallowed line is the
    // environment's verdict — not this port's defect. A developer desktop with
    // `notify-send` reports no failure line at all; a host whose `notify-send`
    // exists but fails (no DISPLAY / D-Bus) passes on the same bound. BOTH shapes
    // PASS, and which one ran is recorded in the bonus as `deliveryVerdict`. What
    // must NOT regress is the swallow: two `FAILED:` lines mean the dispatch ran
    // twice, which the `<= 1` bound still reds.
    notificationFailureSwallowedNotThrown: swallowedFailureCount <= 1,
    // (f) The session-notification listener must not DOUBLE-announce. The claim
    // is deliberately `<= 1`, not `=== 1`: this scenario's parent is woken by
    // the job's own settlement notice (`dsh-tool-jobs` `owner.followup`), which
    // makes the agent busy and CANCELS the sibling listener's pending idle
    // confirmation — measured (`sessionNotificationAnchorCount: 0`, the wake-up
    // `turn/start` lands ~immediately after turn 1's `turn/end`). Zero is
    // therefore a legitimate shape here; two is the double-announce failure mode
    // this check exists for (and the mutation QA drives exactly that). The
    // `=== 1` claim belongs to the scenario that owns that listener,
    // 'session-notification-log'.
    sessionNotificationDidNotDoubleAnnounce: sessionAnchorCount <= 1,
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    anchorCarrier: 'boot-log (dsh process stdout/stderr via console.log in the registrar)',
    expectedAnchorLine: BACKGROUND_NOTIFICATION_EXPECTED_ANCHOR,
    notificationLines: anchorLines,
    notificationAnchorCount: anchorCount,
    notificationAnchorLineCount: anchorLineCount,
    notificationAnchorStatuses: anchorStatuses,
    notificationAnchorLabels: anchorLabels,
    // The false-positive surface, verbatim: the listener's NON-FAILURE lines (the
    // anchor(s) only). The `FAILED:` lines are reported separately below, because
    // they are the host's delivery verdict and not this claim's subject.
    notificationNonFailureLines: nonFailureNotificationLines,
    notificationNonFailureLineCount: nonFailureNotificationLineCount,
    notificationFailureLineCount: swallowedFailureCount,
    notificationFailureLines: notificationLinesOf(bootLog, BACKGROUND_NOTIFICATION_FAILURE_PREFIX),
    // The platform axis this scenario explicitly tolerates (`notify-send` present
    // on a developer desktop, absent on the CI image). Informative only; both
    // shapes PASS, on the sibling scenario's identical `<= 1` swallow bound.
    notifySendCommand: NOTIFY_SEND_COMMAND,
    notifySendAbsentOnHost: notifySendAbsenceLines.length > 0,
    deliveryVerdict,
    // The deferred-acquisition evidence: which NOTE lines a real boot carries is
    // informative (the strict `ctx.get` usually loses the loader race, so the
    // deferred path is the one exercised), but it is NOT asserted — both
    // acquisition paths are correct and which one runs is a race outcome.
    notificationNoteLines: notificationLinesOf(bootLog, BACKGROUND_NOTIFICATION_NOTE_PREFIX),
    sessionNotificationAnchorCount: sessionAnchorCount,
    delegatingToolName: delegatingCall?.data?.name ?? null,
    delegatingArguments: delegatingArgs ?? null,
    // P3-T13: recorded so a reader can tell WHY this scenario edits its own
    // sandbox preset (the shipped row is continuable; only the one-shot
    // background path registers a ctx.jobs entry).
    delegationBackgroundMode: 'one-shot (scenario-local preset edit)',
    jobLabelSource: "the delegation `description` (dsh-tool-subagent jobs.start label)",
    delegatedChildSessions: (allLogs ?? [])
      .filter((candidate) => candidate.header?.origin === 'subagent')
      .map((candidate) => candidate.path),
    turnEndReasons: events
      .filter((event) => event.type === 'turn/end')
      .map((event) => ({ seq: event.seq, kind: turnEndReasonKind(event) ?? null })),
    mockRequestCount: sisyphusRequests.length,
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

// ── fabricated P3-T14 D-mode inputs (模式 D，must earn their PASS) ─────────────
// One GOOD fixture per scenario, mirroring the real runtime layout the scenario
// produces (tool/call → tool/result, in model order, one turn/end), plus the
// named defect mutations the self-test applies. Each GOOD input must PASS and
// each mutation must FAIL on its own named check — otherwise the assertion would
// be vacuous.

/** One `tool/result` event carrying a single tool-result part. */
function fabricatedToolResultEvent(seq, callId, text, isError = false) {
  return {
    seq,
    type: 'tool/result',
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'user',
        content: [{
          type: 'tool-result',
          toolCallId: callId,
          content: [{ type: 'text', text }],
          isError,
        }],
      },
    },
  }
}

/** One `tool/call` event with serialized arguments. */
function fabricatedToolCallEvent(seq, callId, name, args) {
  return {
    seq,
    type: 'tool/call',
    data: { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) },
  }
}

/** The one-request `sisyphus` header the D-mode fixtures share. */
function fabricatedSisyphusRequests(routes) {
  return [{
    role: 'sisyphus',
    body: { model: routes.sisyphus.model },
    receivedAt: 10,
  }]
}

// — H-14: edit-error-recovery-reminder ————————————————————————————————————————

const FABRICATED_EDIT_RECOVERY_FIXTURE_PATH = '/fabricated/project/edit-recovery-fixture.txt'

function fabricatedEditErrorRecoveryInput(routes) {
  const errorText = `Error: old_string was not found in "${FABRICATED_EDIT_RECOVERY_FIXTURE_PATH}"`
  return {
    log: {
      path: '/fabricated/edit-recovery/session.jsonl',
      header: { type: 'session', id: FABRICATED_PARENT_ID },
      events: [
        { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: EDIT_RECOVERY_PROMPT }] } },
        fabricatedToolCallEvent(2, 'mock-llm-tool-1', 'read', { file_path: FABRICATED_EDIT_RECOVERY_FIXTURE_PATH }),
        fabricatedToolResultEvent(3, 'mock-llm-tool-1', `1→${EDIT_RECOVERY_FIXTURE_LINE}\n2→second line, never the edit target 91c0de\n`),
        fabricatedToolCallEvent(4, 'mock-llm-tool-2-0', 'edit', {
          file_path: FABRICATED_EDIT_RECOVERY_FIXTURE_PATH,
          old_string: EDIT_RECOVERY_ABSENT_MARKER,
          new_string: 'this replacement must never be written',
        }),
        fabricatedToolCallEvent(5, 'mock-llm-tool-2-1', 'edit', {
          file_path: FABRICATED_EDIT_RECOVERY_FIXTURE_PATH,
          old_string: EDIT_RECOVERY_FIXTURE_LINE,
          new_string: EDIT_RECOVERY_REPLACED_LINE,
        }),
        fabricatedToolResultEvent(6, 'mock-llm-tool-2-0', `${errorText}\n${EDIT_ERROR_REMINDER}`, true),
        fabricatedToolResultEvent(
          7,
          'mock-llm-tool-2-1',
          `The file ${FABRICATED_EDIT_RECOVERY_FIXTURE_PATH} has been updated successfully.`,
        ),
        { seq: 8, type: 'assistant/message', data: { turn: 1, step: 3, message: { content: [{ type: 'text', text: EDIT_RECOVERY_SUMMARY }] } } },
        { seq: 9, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      ],
    },
    requests: fabricatedSisyphusRequests(routes).concat([
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 20 },
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 30 },
    ]),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
    fixturePath: FABRICATED_EDIT_RECOVERY_FIXTURE_PATH,
  }
}

// — H-15: json-error-recovery-reminder ———————————————————————————————————————

function fabricatedJsonErrorRecoveryInput(routes) {
  return {
    log: {
      path: '/fabricated/json-recovery/session.jsonl',
      header: { type: 'session', id: FABRICATED_PARENT_ID },
      events: [
        { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: JSON_RECOVERY_PROMPT }] } },
        // The REAL wire shape for a non-object argument: the raw string is
        // preserved and serialized back as a JSON string by the mock.
        {
          seq: 2,
          type: 'tool/call',
          data: {
            turn: 1,
            step: 1,
            callId: 'mock-llm-tool-1-0',
            name: 'write',
            arguments: JSON.stringify(JSON_RECOVERY_MALFORMED_ARGUMENTS),
          },
        },
        {
          seq: 3,
          type: 'tool/call',
          data: {
            turn: 1,
            step: 1,
            callId: 'mock-llm-tool-1-1',
            name: 'read',
            arguments: JSON.stringify(JSON_RECOVERY_MALFORMED_ARGUMENTS),
          },
        },
        fabricatedToolResultEvent(4, 'mock-llm-tool-1-0', `${JSON_RECOVERY_EXPECTED_ERROR}\n${JSON_ERROR_REMINDER}`, true),
        fabricatedToolResultEvent(5, 'mock-llm-tool-1-1', JSON_RECOVERY_EXPECTED_ERROR, true),
        { seq: 6, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: JSON_RECOVERY_SUMMARY }] } } },
        { seq: 7, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      ],
    },
    requests: fabricatedSisyphusRequests(routes).concat([
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 20 },
    ]),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
  }
}

// — H-16: tool-output-truncated ——————————————————————————————————————————————

const FABRICATED_TRUNCATOR_BIG_PATH = '/fabricated/project/truncator-big-fixture.txt'
const FABRICATED_TRUNCATOR_SMALL_PATH = '/fabricated/project/truncator-small-fixture.txt'

/**
 * The fabricated big-grep result: 3 header lines + 110 content lines + the tail
 * note — the shape the fallback (fixed 50k) path really produces, i.e. the head
 * lines kept and the tail dropped with the count note. `line0` rides the THIRD
 * header line (the fixture's own layout), so the removed count is the 199
 * content lines minus the 110 kept ones.
 */
function fabricatedTruncatedGrepText() {
  const kept = Array.from(
    { length: 110 },
    (_value, index) => truncatorBigLine(index + 1),
  )
  const removed = (TRUNCATOR_BIG_LINE_COUNT - 1) - kept.length
  return [
    `Found ${TRUNCATOR_BIG_LINE_COUNT} matches`,
    '',
    truncatorBigLine(0),
    ...kept,
  ].join('\n') + `\n\n[${removed} more lines truncated due to context window limit]`
}

function fabricatedToolOutputTruncatedInput(routes) {
  return {
    log: {
      path: '/fabricated/truncator/session.jsonl',
      header: { type: 'session', id: FABRICATED_PARENT_ID },
      events: [
        { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: TRUNCATOR_PROMPT }] } },
        fabricatedToolCallEvent(2, 'mock-llm-tool-1-0', 'grep', {
          pattern: TRUNCATOR_BIG_PATTERN,
          path: FABRICATED_TRUNCATOR_BIG_PATH,
        }),
        fabricatedToolCallEvent(3, 'mock-llm-tool-1-1', 'grep', {
          pattern: TRUNCATOR_SMALL_PATTERN,
          path: FABRICATED_TRUNCATOR_SMALL_PATH,
        }),
        fabricatedToolResultEvent(4, 'mock-llm-tool-1-0', fabricatedTruncatedGrepText()),
        fabricatedToolResultEvent(
          5,
          'mock-llm-tool-1-1',
          `Found 2 matches\n\n${TRUNCATOR_SMALL_LINES.join('\n')}`,
        ),
        { seq: 6, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: TRUNCATOR_SUMMARY }] } } },
        { seq: 7, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      ],
    },
    requests: fabricatedSisyphusRequests(routes).concat([
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 20 },
    ]),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
    bigFixtureChars: truncatorBigFixtureText().length,
  }
}

// — H-07: empty-task-response-corrected ——————————————————————————————————————

const FABRICATED_EMPTY_TASK_EXPLORE_ID = 'session-fabricated-empty-child'
const FABRICATED_EMPTY_TASK_ORACLE_ID = 'session-fabricated-oracle-child'

/** One fabricated subagent child log with a single assistant message. */
function fabricatedChildLog(id, text) {
  return {
    path: `/fabricated/${id}/session.jsonl`,
    header: { type: 'session', id, origin: 'subagent', parentSession: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text }] } } },
      { seq: 2, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedEmptyTaskResponseInput(routes) {
  const exploreLog = fabricatedChildLog(FABRICATED_EMPTY_TASK_EXPLORE_ID, EMPTY_TASK_BLANK_CHILD_TEXT)
  const oracleLog = fabricatedChildLog(FABRICATED_EMPTY_TASK_ORACLE_ID, EMPTY_TASK_ORACLE_NOTE)
  const parentLog = {
    path: '/fabricated/empty-task/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: EMPTY_TASK_PROMPT }] } },
      fabricatedToolCallEvent(2, 'mock-llm-tool-1-0', 'explore', {
        description: 'Inspect the workspace and report findings',
        prompt: 'Inspect the workspace and report your findings.',
        run_in_background: false,
      }),
      fabricatedToolCallEvent(3, 'mock-llm-tool-1-1', 'oracle', {
        description: 'Answer the design question',
        prompt: 'Answer the design question in one sentence.',
        run_in_background: false,
      }),
      fabricatedToolResultEvent(4, 'mock-llm-tool-1-0', EMPTY_RESPONSE_WARNING),
      fabricatedToolResultEvent(5, 'mock-llm-tool-1-1', EMPTY_TASK_ORACLE_NOTE),
      { seq: 6, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: EMPTY_TASK_SUMMARY }] } } },
      { seq: 7, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
  return {
    log: parentLog,
    childLog: exploreLog,
    allLogs: [parentLog, exploreLog, oracleLog],
    requests: fabricatedSisyphusRequests(routes).concat([
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 20 },
    ]),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
  }
}

// ── fabricated P3-T15 批 B inputs (模式 D，must earn their PASS) ──────────────
// One GOOD fixture per scenario, mirroring the real runtime layout the scenario
// produces (tool/call → tool/result by callId, in model order, one turn/end),
// plus the named defect mutations the self-test applies.

/** The fabricated sandbox paths the README fixture's assertions name. */
const FABRICATED_README_DIR = '/fabricated/project/readme-injector'
const FABRICATED_README_README_PATH = `${FABRICATED_README_DIR}/README.md`
const FABRICATED_README_TARGET_PATH = `${FABRICATED_README_DIR}/nested/${README_INJECTOR_TARGET_NAME}`
const FABRICATED_README_DEDUP_PATH = `${FABRICATED_README_DIR}/nested/${README_INJECTOR_DEDUP_NAME}`
const FABRICATED_README_PLAIN_PATH = `/fabricated/project/${README_INJECTOR_PLAIN_DIR}/${README_INJECTOR_PLAIN_NAME}`

/** The tool's own render, as `formatReadOutput` builds it (one text block). */
function fabricatedReadRender(path, lines) {
  return `<path>${path}</path>\n<type>file</type>\n<content>\n`
    + `${lines.map((line, index) => `${index + 1}: ${line}`).join('\n')}\n\n`
    + `(End of file - total ${lines.length} lines)\n</content>`
}

/** The README block the listener appends (`\n\n[Project README: <path>]\n<bytes>`). */
function fabricatedReadmeBlock(readmePath, content) {
  return `\n\n${README_INJECTION_MARKER} ${readmePath}]\n${content}`
}

function fabricatedDirectoryReadmeInput(routes) {
  const parentLog = {
    path: '/fabricated/directory-readme/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: README_INJECTOR_PROMPT }] } },
      fabricatedToolCallEvent(2, 'mock-llm-tool-1-0', 'read', { file_path: FABRICATED_README_TARGET_PATH }),
      fabricatedToolCallEvent(3, 'mock-llm-tool-1-1', 'read', { file_path: FABRICATED_README_PLAIN_PATH }),
      fabricatedToolResultEvent(
        4,
        'mock-llm-tool-1-0',
        fabricatedReadRender(FABRICATED_README_TARGET_PATH, [
          README_INJECTOR_TARGET_SENTINEL,
          'export const neighbour = 2',
        ]) + fabricatedReadmeBlock(FABRICATED_README_README_PATH, README_INJECTOR_README_CONTENT),
      ),
      fabricatedToolResultEvent(
        5,
        'mock-llm-tool-1-1',
        fabricatedReadRender(FABRICATED_README_PLAIN_PATH, [
          README_INJECTOR_PLAIN_SENTINEL,
          'export const control = true',
        ]),
      ),
      fabricatedToolCallEvent(6, 'mock-llm-tool-2', 'read', { file_path: FABRICATED_README_DEDUP_PATH }),
      fabricatedToolResultEvent(
        7,
        'mock-llm-tool-2',
        fabricatedReadRender(FABRICATED_README_DEDUP_PATH, [README_INJECTOR_DEDUP_SENTINEL]),
      ),
      { seq: 8, type: 'assistant/message', data: { turn: 1, step: 3, message: { content: [{ type: 'text', text: README_INJECTOR_SUMMARY }] } } },
      { seq: 9, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
  return {
    log: parentLog,
    allLogs: [parentLog],
    requests: fabricatedSisyphusRequests(routes).concat([
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 20 },
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 30 },
    ]),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
    readmePath: FABRICATED_README_README_PATH,
    targetPath: FABRICATED_README_TARGET_PATH,
    dedupPath: FABRICATED_README_DEDUP_PATH,
    plainPath: FABRICATED_README_PLAIN_PATH,
  }
}

/** The fabricated child session log: ONE grep call + its result, then the note. */
function fabricatedAgentUsageChildLog(childId) {
  return {
    path: `/fabricated/${childId}/session.jsonl`,
    header: { type: 'session', id: childId, origin: 'subagent', parentSession: FABRICATED_PARENT_ID },
    events: [
      fabricatedToolCallEvent(1, 'mock-llm-child-tool-1', 'grep', { pattern: AGENT_USAGE_PATTERN }),
      fabricatedToolResultEvent(2, 'mock-llm-child-tool-1', `Found 2 matches\n\n${AGENT_USAGE_FIXTURE_CONTENT}`),
      { seq: 3, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: AGENT_USAGE_CHILD_NOTE }] } } },
      { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

const FABRICATED_AGENT_USAGE_FIXTURE_PATH = `/fabricated/project/${AGENT_USAGE_FIXTURE_NAME}`
const FABRICATED_AGENT_USAGE_CHILD_ID = 'session-fabricated-agent-usage-child'

function fabricatedAgentUsageReminderInput(routes) {
  const grepText = `Found 2 matches\n\n${AGENT_USAGE_FIXTURE_CONTENT}`
  const readText = fabricatedReadRender(FABRICATED_AGENT_USAGE_FIXTURE_PATH, [
    `${AGENT_USAGE_PATTERN} line one`,
    `${AGENT_USAGE_PATTERN} line two`,
  ])
  const childLog = fabricatedAgentUsageChildLog(FABRICATED_AGENT_USAGE_CHILD_ID)
  const parentLog = {
    path: '/fabricated/agent-usage/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: AGENT_USAGE_PROMPT }] } },
      fabricatedToolCallEvent(2, 'mock-llm-tool-1-0', 'grep', { pattern: AGENT_USAGE_PATTERN }),
      fabricatedToolCallEvent(3, 'mock-llm-tool-1-1', 'read', { file_path: FABRICATED_AGENT_USAGE_FIXTURE_PATH }),
      fabricatedToolResultEvent(4, 'mock-llm-tool-1-0', `${grepText}${REMINDER_MESSAGE}`),
      fabricatedToolResultEvent(5, 'mock-llm-tool-1-1', readText),
      fabricatedToolCallEvent(6, 'mock-llm-tool-2', 'grep', { pattern: AGENT_USAGE_PATTERN }),
      fabricatedToolResultEvent(7, 'mock-llm-tool-2', `${grepText}${REMINDER_MESSAGE}`),
      fabricatedToolCallEvent(8, 'mock-llm-tool-3', 'grep', { pattern: AGENT_USAGE_PATTERN }),
      fabricatedToolResultEvent(9, 'mock-llm-tool-3', `${grepText}${REMINDER_MESSAGE}`),
      fabricatedToolCallEvent(10, 'mock-llm-tool-4', 'grep', { pattern: AGENT_USAGE_PATTERN }),
      fabricatedToolResultEvent(11, 'mock-llm-tool-4', grepText),
      fabricatedToolCallEvent(12, 'mock-llm-tool-5', 'explore', { description: 'Grep the fixture and report' }),
      fabricatedToolResultEvent(13, 'mock-llm-tool-5', AGENT_USAGE_CHILD_NOTE),
      fabricatedToolCallEvent(14, 'mock-llm-tool-6', 'grep', { pattern: AGENT_USAGE_PATTERN }),
      fabricatedToolResultEvent(15, 'mock-llm-tool-6', grepText),
      { seq: 16, type: 'assistant/message', data: { turn: 1, step: 8, message: { content: [{ type: 'text', text: AGENT_USAGE_SUMMARY }] } } },
      { seq: 17, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
  return {
    log: parentLog,
    allLogs: [parentLog, childLog],
    requests: fabricatedSisyphusRequests(routes).concat(
      Array.from({ length: 6 }, (_value, index) => ({
        role: 'sisyphus',
        body: { model: routes.sisyphus.model },
        receivedAt: 20 + index * 10,
      })),
    ),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
  }
}

const FABRICATED_TASK_RESUME_CHILD_ID = 'subagent-fabricated-task-resume'

function fabricatedTaskResumeInfoInput(routes) {
  const exploreText = `${DSH_CONTINUABLE_TEXT_PREFIX}${FABRICATED_TASK_RESUME_CHILD_ID}`
  const parentLog = {
    path: '/fabricated/task-resume/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: TASK_RESUME_PROMPT }] } },
      // The ONE assistant message carrying both delegation calls (the real log's
      // batch shape), which `delegationsRanInOneBatch` reads.
      {
        seq: 2,
        type: 'assistant/message',
        data: {
          turn: 1,
          step: 1,
          message: {
            content: [
              { type: 'tool-call', id: 'mock-llm-tool-1-0', name: 'explore', arguments: '{}' },
              { type: 'tool-call', id: 'mock-llm-tool-1-1', name: 'oracle', arguments: '{}' },
            ],
          },
        },
      },
      fabricatedToolCallEvent(3, 'mock-llm-tool-1-0', 'explore', {
        description: 'Background exploration of the workspace',
        run_in_background: true,
      }),
      fabricatedToolCallEvent(4, 'mock-llm-tool-1-1', 'oracle', {
        description: 'Foreground design question',
        run_in_background: false,
      }),
      fabricatedToolResultEvent(
        5,
        'mock-llm-tool-1-0',
        `${exploreText}${buildTaskResumeHint(FABRICATED_TASK_RESUME_CHILD_ID)}`,
      ),
      fabricatedToolResultEvent(6, 'mock-llm-tool-1-1', TASK_RESUME_ORACLE_NOTE),
      { seq: 7, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: TASK_RESUME_SUMMARY }] } } },
      { seq: 8, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
  return {
    log: parentLog,
    allLogs: [parentLog],
    requests: fabricatedSisyphusRequests(routes).concat([
      // The runtime's conductor count is a SCHEDULING RACE (the kept-sandbox pass
      // measured three requests — the settled continuable child's notice opens one
      // more step — the review's independent pass measured two); the GOOD fixture
      // records the reproducible TWO that satisfy the "≥ 2" floor, and the extra
      // step stays a runtime detail (the analysis comment above).
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 20 },
      // The two children are separate mock ROLES, recorded so the timeline stays
      // complete without inflating the sisyphus count.
      { role: 'explore', body: { model: routes.sisyphus.model }, receivedAt: 25 },
      { role: 'oracle', body: { model: routes.sisyphus.model }, receivedAt: 26 },
    ]),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
  }
}

// ── fabricated P3-T9 todo-continuation-enforced input (模式 E，must earn its PASS) ─
// The fabricated log mirrors the REAL runtime layout the scenario was pinned
// against (observed in a kept sandbox; see the header's T9 section): per step
// the order is assistant/message → tool/call → todo/write → tool/result →
// step/end (the tool's session event lands while the call is in flight), the
// steer is durable on TWO `agent/inbox/spliced` events plus the claimed
// `user/message` (all three with the SAME message id and the E-mode producer
// triple), the boundary after the 收尾 step produces no turn/end, and the 对照
// turn is a second turn/start on the same session whose boundary stays silent.
// Seq numbers are COMPACT (the real log pads them with session/title, runtime
// context and system/message events); the ORDER is the real one.

/** The turn-1 snapshots the mock scripts (verbatim from todoContinuationScript). */
const FABRICATED_TODO_FIRST_SNAPSHOT = [
  { content: TODO_TASK_SETTLED, status: 'completed' },
  { content: TODO_TASK_OPEN, status: 'in_progress' },
]
const FABRICATED_TODO_SECOND_SNAPSHOT = [
  { content: TODO_TASK_SETTLED, status: 'completed' },
  { content: TODO_TASK_OPEN, status: 'completed' },
]
const FABRICATED_TODO_CONTROL_SNAPSHOT = [{ content: TODO_TASK_SETTLED, status: 'completed' }]
/** The listener's own text for the FIRST snapshot — assembled, never re-typed. */
const FABRICATED_TODO_STEER_TEXT = buildTodoContinuationText(FABRICATED_TODO_FIRST_SNAPSHOT)

/** The steered message exactly as the listener mints it (source triple + form). */
function fabricatedTodoSteerMessage(id, text = FABRICATED_TODO_STEER_TEXT) {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: TODO_CONTINUATION_ENFORCER_PLUGIN, form: 'instructions' },
  }
}

/** One plain `user/message` event (the queued prompt / the claimed steer). */
function fabricatedUserMessage(seq, message) {
  return { seq, type: 'user/message', data: message }
}

/**
 * The fabricated todo-continuation log: turn 1 (steer chain) + turn 2 (对照).
 * `turn`/`step` fields ride the step-shaped events exactly like the real log;
 * `todo/write` events carry ONLY `{todos}` (dsh-tool-todo appends no turn/step).
 */
function fabricatedTodoContinuationLog(routes) {
  const todoCall = (seq, callId) => ({
    seq,
    type: 'tool/call',
    data: {
      turn: 1,
      step: 1,
      callId,
      name: 'todo_write',
      arguments: JSON.stringify({ todos: FABRICATED_TODO_FIRST_SNAPSHOT }),
    },
  })
  const todoResult = (seq, callId) => ({
    seq,
    type: 'tool/result',
    data: {
      turn: 1,
      step: 1,
      message: {
        source: { kind: 'tool', callId },
        content: [{
          type: 'tool-result',
          toolCallId: callId,
          content: [{ type: 'text', text: 'Updated todo list: 0 pending, 1 in progress, 1 completed.' }],
          isError: false,
        }],
      },
    },
  })
  const assistant = (seq, turn, step, content) => ({
    seq,
    type: 'assistant/message',
    data: { turn, step, message: { role: 'assistant', content } },
  })
  const todoCall1 = { type: 'tool-call', id: 'mock-llm-tool-1', name: 'todo_write', arguments: JSON.stringify({ todos: FABRICATED_TODO_FIRST_SNAPSHOT }) }
  const todoCall3 = { type: 'tool-call', id: 'mock-llm-tool-3', name: 'todo_write', arguments: JSON.stringify({ todos: FABRICATED_TODO_SECOND_SNAPSHOT }) }
  const todoCall5 = { type: 'tool-call', id: 'mock-llm-tool-5', name: 'todo_write', arguments: JSON.stringify({ todos: FABRICATED_TODO_CONTROL_SNAPSHOT }) }
  const steerMessage = fabricatedTodoSteerMessage('fabricated-todo-steer-1')
  return {
    path: '/fabricated/todo-continuation/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      fabricatedUserMessage(1, { role: 'user', content: [{ type: 'text', text: TODO_CONTINUATION_PROMPT }] }),
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
      },
      // ── turn 1, step 1: write the two-task list. The event order per step is
      // the REAL one (kept sandbox): assistant/message → tool/call →
      // todo/write → tool/result → step/end — the tool appends its session
      // event while the call is still in flight, i.e. BEFORE the result is
      // committed. ──
      assistant(3, 1, 1, [todoCall1]),
      todoCall(4, 'mock-llm-tool-1'),
      { seq: 5, type: 'todo/write', data: { todos: FABRICATED_TODO_FIRST_SNAPSHOT } },
      todoResult(6, 'mock-llm-tool-1'),
      { seq: 7, type: 'step/end', data: { turn: 1, step: 1 } },
      // ── turn 1, step 2: the 收尾 text (the step that stops the turn) ──
      { seq: 8, type: 'step/start', data: { turn: 1, step: 2 } },
      assistant(9, 1, 2, [{ type: 'text', text: SISYPHUS_TODO_WRAPUP }]),
      { seq: 10, type: 'step/end', data: { turn: 1, step: 2 } },
      // ── the boundary: the listener's steer (accept carrier), then the
      // claim's own removal splice (`inserted: []`) — the real pair ──
      { seq: 11, type: 'agent/inbox/spliced', data: { target: 'next-step', start: 0, inserted: [steerMessage] } },
      { seq: 12, type: 'agent/inbox/spliced', data: { target: 'next-step', start: 0, removedCount: 1, inserted: [] } },
      // ── turn 1, step 3: the continuation step (claim + todo advance) ──
      { seq: 13, type: 'step/start', data: { turn: 1, step: 3 } },
      fabricatedUserMessage(14, steerMessage),
      assistant(15, 1, 3, [todoCall3]),
      { seq: 16, type: 'tool/call', data: { turn: 1, step: 3, callId: 'mock-llm-tool-3', name: 'todo_write', arguments: JSON.stringify({ todos: FABRICATED_TODO_SECOND_SNAPSHOT }) } },
      { seq: 17, type: 'todo/write', data: { todos: FABRICATED_TODO_SECOND_SNAPSHOT } },
      { seq: 18, type: 'tool/result', data: { turn: 1, step: 3, message: { source: { kind: 'tool', callId: 'mock-llm-tool-3' }, content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-3', content: [{ type: 'text', text: 'Updated todo list: 0 pending, 0 in progress, 2 completed.' }], isError: false }] } } },
      { seq: 19, type: 'step/end', data: { turn: 1, step: 3 } },
      // ── turn 1, step 4: the final summary, then the REAL turn/end ──
      { seq: 20, type: 'step/start', data: { turn: 1, step: 4 } },
      assistant(21, 1, 4, [{ type: 'text', text: SISYPHUS_TODO_SUMMARY }]),
      { seq: 22, type: 'step/end', data: { turn: 1, step: 4 } },
      { seq: 23, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      // ── turn 2 (对照): a second prompt, an all-completed list, NO steer ──
      {
        seq: 24,
        type: 'agent/inbox/spliced',
        data: {
          target: 'next-turn',
          start: 0,
          inserted: [{ id: 'fabricated-control-prompt', role: 'user', content: [{ type: 'text', text: TODO_CONTROL_PROMPT }], source: { kind: 'user', rpcId: 'fabricated-rpc' } }],
        },
      },
      { seq: 25, type: 'turn/start', data: { turn: 2 } },
      { seq: 26, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } },
      fabricatedUserMessage(27, { role: 'user', content: [{ type: 'text', text: TODO_CONTROL_PROMPT }] }),
      { seq: 28, type: 'step/start', data: { turn: 2, step: 1 } },
      assistant(29, 2, 1, [todoCall5]),
      { seq: 30, type: 'tool/call', data: { turn: 2, step: 1, callId: 'mock-llm-tool-5', name: 'todo_write', arguments: JSON.stringify({ todos: FABRICATED_TODO_CONTROL_SNAPSHOT }) } },
      { seq: 31, type: 'todo/write', data: { todos: FABRICATED_TODO_CONTROL_SNAPSHOT } },
      { seq: 32, type: 'tool/result', data: { turn: 2, step: 1, message: { source: { kind: 'tool', callId: 'mock-llm-tool-5' }, content: [{ type: 'tool-result', toolCallId: 'mock-llm-tool-5', content: [{ type: 'text', text: 'Updated todo list: 0 pending, 0 in progress, 1 completed.' }], isError: false }] } } },
      { seq: 33, type: 'step/end', data: { turn: 2, step: 1 } },
      { seq: 34, type: 'step/start', data: { turn: 2, step: 2 } },
      assistant(35, 2, 2, [{ type: 'text', text: SISYPHUS_TODO_CONTROL_WRAPUP }]),
      { seq: 36, type: 'step/end', data: { turn: 2, step: 2 } },
      { seq: 37, type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedTodoContinuationInput(routes) {
  // Read the model id off `routes` here (NOT closed over from the caller) — a
  // module-level factory cannot see the self-test's local `routes`.
  const model = routes.sisyphus.model
  const messages = (text) => [
    { role: 'system', content: 'MOCKROLE=sisyphus' },
    { role: 'user', content: text },
  ]
  return {
    log: fabricatedTodoContinuationLog(routes),
    requests: [
      { role: 'sisyphus', body: { model, messages: messages(TODO_CONTINUATION_PROMPT) }, receivedAt: 10 },
      { role: 'sisyphus', body: { model, messages: messages(SISYPHUS_TODO_WRAPUP) }, receivedAt: 20 },
      { role: 'sisyphus', body: { model, messages: messages(`${SISYPHUS_TODO_WRAPUP}\n${FABRICATED_TODO_STEER_TEXT}`) }, receivedAt: 30 },
      { role: 'sisyphus', body: { model, messages: messages(SISYPHUS_TODO_SUMMARY) }, receivedAt: 40 },
      { role: 'sisyphus', body: { model, messages: messages(TODO_CONTROL_PROMPT) }, receivedAt: 50 },
      { role: 'sisyphus', body: { model, messages: messages(SISYPHUS_TODO_CONTROL_WRAPUP) }, receivedAt: 60 },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
  }
}

/**
 * The fabricated session-notification-log input (the REAL runtime layout,
 * compact seqs): one `bash` call that writes the proof fixture, its non-error
 * result carrying the fixture bytes, the closing summary step, and a completed
 * turn/end. The anchor line rides the BOOT LOG (the measured carrier), and the
 * fixture path is a file that really exists (this very driver — the hermetic
 * stand-in for the on-disk artifact the real scenario writes into its sandbox).
 * The fixture text is the mock server's own filename, so the fabricated
 * tool/result "carries the fixture bytes" without inventing a second fixture.
 */
const FABRICATED_NOTIFICATION_FIXTURE_TEXT = 'mock-llm-server.mjs'
const FABRICATED_NOTIFICATION_FIXTURE_PATH = fileURLToPath(import.meta.url)
const FABRICATED_NOTIFICATION_ANCHOR = SESSION_NOTIFICATION_EXPECTED_ANCHOR
const FABRICATED_NOTIFICATION_COMMAND =
  `printf '%s\\n' ${FABRICATED_NOTIFICATION_FIXTURE_TEXT} > ${FABRICATED_NOTIFICATION_FIXTURE_PATH} && cat ${FABRICATED_NOTIFICATION_FIXTURE_PATH}`

function fabricatedSessionNotificationBootLog(anchorLines = 1) {
  return [
    FABRICATED_BOOT_LOG,
    '[omo-hooks] hook session-notification registered on session/event',
    ...Array.from({ length: anchorLines }, () => FABRICATED_NOTIFICATION_ANCHOR),
  ].join('\n')
}

function fabricatedSessionNotificationLog(routes) {
  const callId = 'mock-llm-tool-1'
  const argumentsText = JSON.stringify({ command: FABRICATED_NOTIFICATION_COMMAND, description: 'Write the proof file' })
  return {
    path: '/fabricated/session-notification/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      fabricatedUserMessage(1, { role: 'user', content: [{ type: 'text', text: SESSION_NOTIFICATION_PROMPT }] }),
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
      },
      {
        seq: 3,
        type: 'assistant/message',
        data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'tool-call', id: callId, name: 'bash', arguments: argumentsText }] } },
      },
      { seq: 4, type: 'tool/call', data: { turn: 1, step: 1, callId, name: 'bash', arguments: argumentsText } },
      {
        seq: 5,
        type: 'tool/result',
        data: {
          turn: 1,
          step: 1,
          message: {
            source: { kind: 'tool', callId },
            content: [{
              type: 'tool-result',
              toolCallId: callId,
              content: [{ type: 'text', text: `${FABRICATED_NOTIFICATION_FIXTURE_TEXT}\n` }],
              isError: false,
            }],
          },
        },
      },
      { seq: 6, type: 'step/end', data: { turn: 1, step: 1 } },
      { seq: 7, type: 'step/start', data: { turn: 1, step: 2 } },
      { seq: 8, type: 'assistant/message', data: { turn: 1, step: 2, message: { role: 'assistant', content: [{ type: 'text', text: SESSION_NOTIFICATION_SUMMARY }] } } },
      { seq: 9, type: 'step/end', data: { turn: 1, step: 2 } },
      { seq: 10, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedSessionNotificationInput(routes, anchorLines = 1) {
  const model = routes.sisyphus.model
  const message = (text) => [
    { role: 'system', content: 'MOCKROLE=sisyphus' },
    { role: 'user', content: text },
  ]
  return {
    log: fabricatedSessionNotificationLog(routes),
    requests: [
      { role: 'sisyphus', body: { model, messages: message(SESSION_NOTIFICATION_PROMPT) }, receivedAt: 10 },
      { role: 'sisyphus', body: { model, messages: message(SESSION_NOTIFICATION_SUMMARY) }, receivedAt: 20 },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: fabricatedSessionNotificationBootLog(anchorLines),
    fixturePath: FABRICATED_NOTIFICATION_FIXTURE_PATH,
    fixtureText: FABRICATED_NOTIFICATION_FIXTURE_TEXT,
    expectedAnchor: FABRICATED_NOTIFICATION_ANCHOR,
  }
}

/**
 * The fabricated background-notification-log input (P3-T13, the POSITIVE form):
 * ONE delegating step with `run_in_background: true` (the observable one-shot
 * job construction), the parent's summary step, the child session log that
 * really ran, DSH's native job notice for that settlement, and the port's OWN
 * anchor on the boot-log carrier. The self-test mutates each of those facts to
 * pin the assertion that must catch it.
 */
function fabricatedBackgroundNotificationLog(routes) {
  const callId = 'mock-llm-tool-1'
  const argumentsText = JSON.stringify({
    description: BACKGROUND_NOTIFICATION_EXPECTED_LABEL,
    prompt: BACKGROUND_NOTIFICATION_TASK,
    run_in_background: true,
  })
  return {
    path: '/fabricated/background-notification/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID, delegationDepth: 0 },
    events: [
      fabricatedUserMessage(1, { role: 'user', content: [{ type: 'text', text: BACKGROUND_NOTIFICATION_PROMPT }] }),
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.sisyphus.provider, model: routes.sisyphus.model } }, reason: 'initial' },
      },
      {
        seq: 3,
        type: 'assistant/message',
        data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'tool-call', id: callId, name: 'explore', arguments: argumentsText }] } },
      },
      { seq: 4, type: 'tool/call', data: { turn: 1, step: 1, callId, name: 'explore', arguments: argumentsText } },
      {
        seq: 5,
        type: 'tool/result',
        data: {
          turn: 1,
          step: 1,
          message: {
            source: { kind: 'tool', callId },
            content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: 'started background subagent job subagent-1' }], isError: false }],
          },
        },
      },
      { seq: 6, type: 'step/end', data: { turn: 1, step: 1 } },
      { seq: 7, type: 'step/start', data: { turn: 1, step: 2 } },
      { seq: 8, type: 'assistant/message', data: { turn: 1, step: 2, message: { role: 'assistant', content: [{ type: 'text', text: BACKGROUND_NOTIFICATION_SUMMARY }] } } },
      { seq: 9, type: 'step/end', data: { turn: 1, step: 2 } },
      { seq: 10, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      // DSH's OWN reporter delivers the settlement notice into the parent once
      // the background job settles — the independent witness that the port's
      // anchor describes a real settlement (this is the one-shot background
      // path's wording, `dsh-tool-jobs/lib/index.js:116-132`).
      fabricatedUserMessage(11, {
        role: 'user',
        content: [{
          type: 'text',
          text: `background job subagent-1 (subagent: ${BACKGROUND_NOTIFICATION_EXPECTED_LABEL}) finished [status: completed]. Read its output with job_output.`,
        }],
      }),
      { seq: 12, type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedBackgroundNotificationChildLog(routes) {
  return {
    path: '/fabricated/background-notification/explore/session.jsonl',
    header: {
      type: 'session',
      id: FABRICATED_CHILD_ID,
      origin: 'subagent',
      parentSession: FABRICATED_PARENT_ID,
      delegationDepth: 1,
    },
    events: [
      {
        seq: 2,
        type: 'request/header',
        data: { header: { config: { provider: routes.explore.provider, model: routes.explore.model } }, reason: 'initial' },
      },
      { seq: 3, type: 'assistant/message', data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: BACKGROUND_CHILD_REPLY }] } } },
      { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedBackgroundNotificationInput(routes) {
  const model = routes.sisyphus.model
  const message = (text) => [
    { role: 'system', content: 'MOCKROLE=sisyphus' },
    { role: 'user', content: text },
  ]
  const parentLog = fabricatedBackgroundNotificationLog(routes)
  const childLog = fabricatedBackgroundNotificationChildLog(routes)
  return {
    log: parentLog,
    childLog,
    allLogs: [parentLog, childLog],
    requests: [
      { role: 'sisyphus', body: { model, messages: message(BACKGROUND_NOTIFICATION_PROMPT) }, receivedAt: 10 },
      { role: 'sisyphus', body: { model, messages: message(BACKGROUND_NOTIFICATION_SUMMARY) }, receivedAt: 20 },
      { role: 'explore', body: { model: routes.explore.model, messages: [{ role: 'user', content: BACKGROUND_NOTIFICATION_TASK }] }, receivedAt: 30 },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: [
      FABRICATED_BOOT_LOG,
      '[omo-hooks] hook background-notification registered on session/event',
      // The deferred-acquisition NOTE a real boot carries (the loader race
      // usually loses the strict read) — present here so the fixture exercises
      // the same log shape, and counted by nothing.
      `${BACKGROUND_NOTIFICATION_NOTE_PREFIX}jobs service not active at apply; ctx.inject(["jobs"]) armed (degraded pull path active until it appears)`,
      `${BACKGROUND_NOTIFICATION_NOTE_PREFIX}jobs service observed; ctx.jobs.onJobDone subscribed (push path live)`,
      BACKGROUND_NOTIFICATION_EXPECTED_ANCHOR,
      // NOTE: NO session-notification anchor here. The measured shape of this
      // scenario is zero on that channel: the parent is woken by the job's own
      // settlement notice before the sibling listener's idle confirmation can
      // fire (see the analysis's check (f)). The double-announce mutation below
      // adds the two that must fail it.
    ].join('\n'),
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

  // ── P3-T9 todo-continuation-enforced self-test: the fabricated good input
  // (the REAL runtime layout: steer splice + claim + todo advance + turn/end,
  // then a silent 对照 turn) must PASS; every fabricated defect must fail on its
  // OWN named check — including the two the E-mode pilot exists to catch: a log
  // with NO steer, and a log where the boundary steered but the turn ended
  // anyway without the todo advance (the 事件序 break).
  const goodTodoContinuation = analyzeTodoContinuationEnforced(
    fabricatedTodoContinuationInput(routes),
    routes,
  )
  if (goodTodoContinuation.result !== 'PASS') {
    problems.push(`fabricated GOOD todo-continuation-enforced must PASS, got FAIL on: ${goodTodoContinuation.failed.join(', ')}`)
  }
  const todoContinuationDefectCases = [
    ['no continuation steer in the session log', (input) => {
      input.log.events = input.log.events.filter(
        (event) => event.type !== 'user/message'
          || !messageContentText(event.data).includes(TODO_CONTINUATION_DIRECTIVE),
      ).filter(
        (event) => event.type !== 'agent/inbox/spliced'
          || !(event.data?.inserted ?? []).some(
            (message) => messageContentText(message).includes(TODO_CONTINUATION_DIRECTIVE),
          ),
      )
      input.requests = input.requests.map((request) =>
        request.receivedAt === 30
          ? { ...request, body: { model: request.body.model, messages: [{ role: 'user', content: 'no continuation' }] } }
          : request)
    }, 'continuationSteerCarrierSourceIsOmoHooks'],
    ['the injected text is not the listener assembled text (stale/drifted directive)', (input) => {
      // `TodoLike` shape intact, wording changed: the carrier is still a
      // plugin-sourced continuation message, but no longer VERBATIM — the
      // check that must catch it is the text-equality one, not the source one.
      input.log.events = input.log.events.map((event) => {
        if (event.type === 'agent/inbox/spliced' && Array.isArray(event.data?.inserted) && event.data.inserted.length > 0) {
          return { ...event, data: { ...event.data, inserted: [fabricatedTodoSteerMessage('fabricated-todo-steer-1', TODO_CONTINUATION_DIRECTIVE)] } }
        }
        if (event.type === 'user/message' && messageContentText(event.data).includes(TODO_CONTINUATION_DIRECTIVE)) {
          return { ...event, data: fabricatedTodoSteerMessage('fabricated-todo-steer-1', TODO_CONTINUATION_DIRECTIVE) }
        }
        return event
      })
      input.requests = input.requests.map((request) =>
        request.receivedAt === 30
          ? { ...request, body: { model: request.body.model, messages: [{ role: 'user', content: TODO_CONTINUATION_DIRECTIVE }] } }
          : request)
    }, 'continuationSteerTextIsVerbatimListenerText'],
    // THE event-order defect (the task book's second required mutation): the
    // boundary steered, but the turn ended right after the 收尾 step and the
    // todo list was never advanced — exactly what a driver that ignores the
    // steer (or a listener whose steer lands after the boundary commits) would
    // produce. Both the order check and the progress check name it.
    ['steer spliced but the turn ended without the todo advance', (input) => {
      input.log.events = input.log.events.map((event) => {
        if (event.type === 'turn/end' && event.data?.turn === 1) {
          return { ...event, seq: 10.5 } // the turn really ended at the boundary
        }
        if (event.type === 'todo/write' && event.seq === 17) {
          return {
            ...event,
            data: {
              todos: [
                { content: TODO_TASK_SETTLED, status: 'completed' },
                { content: TODO_TASK_OPEN, status: 'in_progress' }, // never advanced
              ],
            },
          }
        }
        return event
      })
    }, 'continuationSteerOpenedAnotherStepBeforeTurnEnd'],
    // The 对照 is a LIVE negative assertion: if a control turn whose todo list
    // is already all-completed nevertheless steers, the scenario must FAIL.
    ['the control turn steered although its todos were all completed', (input) => {
      const controlWrapup = input.log.events.find(
        (event) => event.type === 'assistant/message'
          && eventText(event).includes(SISYPHUS_TODO_CONTROL_WRAPUP),
      )
      input.log.events.push({
        seq: controlWrapup.seq + 0.5,
        type: 'agent/inbox/spliced',
        data: {
          target: 'next-step',
          start: 0,
          inserted: [fabricatedTodoSteerMessage('fabricated-todo-steer-2')],
        },
      })
    }, 'controlNoSteerWhenAllCompleted'],
    ['the steer was injected twice (double trigger / idempotence drift)', (input) => {
      const events = input.log.events
      const messageIndex = events.findIndex(
        (event) => event.type === 'user/message'
          && messageContentText(event.data).includes(TODO_CONTINUATION_DIRECTIVE),
      )
      events.splice(messageIndex + 1, 0, fabricatedUserMessage(
        14.5,
        fabricatedTodoSteerMessage('fabricated-todo-steer-2'),
      ))
    }, 'continuationSteerInjectedExactlyOnce'],
    // The IDEMPOTENCE HALF of the exactly-once guard, named by its own mutation:
    // the ACCEPT splice itself is duplicated (a second `next-step` insertion of
    // the SAME message id, which is exactly what a listener that re-fires the
    // steer without the idempotence guard would append). The claim carrier is
    // untouched, so `continuationSteerInjectedExactlyOnce` is the only check
    // that can see it — this is the half the 收尾 sequence's `inserted: []`
    // removal splice keeps invisible to a claim-only count.
    ['the steer splice was inserted twice (idempotence drift, claim untouched)', (input) => {
      const events = input.log.events
      const spliceIndex = events.findIndex(
        (event) => event.type === 'agent/inbox/spliced'
          && (event.data?.inserted ?? []).some(
            (message) => messageContentText(message).includes(TODO_CONTINUATION_DIRECTIVE),
          ),
      )
      events.splice(spliceIndex + 1, 0, {
        ...events[spliceIndex],
        seq: events[spliceIndex].seq + 0.1,
      })
    }, 'continuationSteerInjectedExactlyOnce'],
    // The CLAIM/ACCEPT IDENTITY HALF: the claimed `user/message` and the
    // accepted splice carry DIFFERENT message ids (the same drift class as the
    // double splice, but a listener that mints a fresh id per dispatch while
    // the inbox keeps the first insert produces exactly this). Text, source
    // and counts all still match, so only the id-equality conjunct of
    // `continuationSteerInjectedExactlyOnce` can catch it.
    ['the claimed steer carries a different message id than the splice (claim/accept link broken)', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'user/message'
          && messageContentText(event.data).includes(TODO_CONTINUATION_DIRECTIVE)
          ? { ...event, data: { ...event.data, id: 'fabricated-todo-steer-claimed' } }
          : event)
    }, 'continuationSteerInjectedExactlyOnce'],
    ['the control turn never ran (no second prompt turn)', (input) => {
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'turn/end' && event.data?.turn === 2),
      )
      input.requests = input.requests.slice(0, 4)
    }, 'controlTurnRanAfterContinuationTurn'],
    ['the control list was empty, so the boundary skip was vacuous', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'todo/write' && event.seq === 31
          ? { ...event, data: { todos: [] } }
          : event)
    }, 'controlTodoWasWrittenAllCompleted'],
  ]
  for (const [label, mutate, expectedCheck] of todoContinuationDefectCases) {
    const input = fabricatedTodoContinuationInput(routes)
    mutate(input)
    const verdict = analyzeTodoContinuationEnforced(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated todo-continuation-enforced defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P3-T12 session-notification-log self-test: the fabricated good input
  // (the REAL runtime layout + the anchor on the measured carrier) must PASS;
  // each fabricated defect must fail on its OWN named check — including the two
  // the F-mode pilot exists to catch: a log with NO notification anchor, and a
  // log with the anchor DUPLICATED (the double-notification count).
  const goodSessionNotification = analyzeSessionNotificationLog(
    fabricatedSessionNotificationInput(routes),
    routes,
  )
  if (goodSessionNotification.result !== 'PASS') {
    problems.push(`fabricated GOOD session-notification-log must PASS, got FAIL on: ${goodSessionNotification.failed.join(', ')}`)
  }
  const sessionNotificationDefectCases = [
    ['no notification anchor on the carrier (the completion never notified)', (input) => {
      input.bootLog = fabricatedSessionNotificationBootLog(0)
    }, 'notificationAnchorLoggedOnce'],
    ['the notification anchor was emitted twice (double notification)', (input) => {
      input.bootLog = fabricatedSessionNotificationBootLog(2)
    }, 'notificationAnchorLoggedOnce'],
    // The business half: without the real work, the "turn produced work" claim
    // and the completion claim must each name themselves (the scheduler's own
    // gates read exactly these two facts).
    ['the bash call never produced a tool result carrying the fixture bytes', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
    }, 'bashCallRanAndProducedFixtureBytes'],
    ['the proof file never landed on disk', (input) => {
      input.fixturePath = '/fabricated/no/such/session-notification-proof.txt'
    }, 'proofFileLandedOnDisk'],
    ['the turn never reached a completed turn/end', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'turn/end'
          ? { ...event, data: { turn: 1, reason: { kind: 'max-tokens' } } }
          : event)
    }, 'turnCompleted'],
    // The anchor was emitted for a line that is NOT the listener's own shipped
    // form (a drifted prefix/title must not satisfy the check).
    ['the anchor line drifted from the shipped prefix/title', (input) => {
      input.bootLog = input.bootLog.replace(SESSION_NOTIFICATION_LOG_PREFIX, '[omo-hooks] session-notify: ')
    }, 'notificationAnchorLoggedOnce'],
    // The subagent filter: a log whose header marks it a delegated child must
    // not be counted as the notified top-level session.
    ['the session under test is a delegated child', (input) => {
      input.log.header = { ...input.log.header, origin: 'subagent', delegationDepth: 1 }
    }, 'onlyTheTopLevelSessionNotified'],
    ['the mock saw an unexpected number of steps', (input) => {
      input.requests = input.requests.slice(0, 1)
    }, 'mockSawBothSteps'],
  ]
  for (const [label, mutate, expectedCheck] of sessionNotificationDefectCases) {
    const input = fabricatedSessionNotificationInput(routes)
    mutate(input)
    const verdict = analyzeSessionNotificationLog(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated session-notification-log defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P3-T13 background-notification-log self-test: the fabricated good input
  // (the real one-shot job construction + the port's own anchor + DSH's native
  // settlement notice) must PASS; every fabricated defect must fail on its OWN
  // named check — including the three this scenario exists for: the P3-T13
  // defect (no anchor at all), a double notification for one settlement, and an
  // anchor whose status/label drifted.
  const goodBackgroundNotification = analyzeBackgroundNotificationLog(
    fabricatedBackgroundNotificationInput(routes),
    routes,
  )
  if (goodBackgroundNotification.result !== 'PASS') {
    problems.push(`fabricated GOOD background-notification-log must PASS, got FAIL on: ${goodBackgroundNotification.failed.join(', ')}`)
  }
  // THE CI REGRESSION CONTROL (run 36347748836, gate 3): the SAME good input on a
  // host with NO `notify-send` — exactly what the CI image is — must still PASS.
  // The backend really fails to spawn the command, the listener swallows it as a
  // single `FAILED:` line (the sibling scenario's `<= 1` bound), and the
  // false-positive claim reads only the NON-FAILURE surface, so the anchor claim
  // is untouched by the host's delivery verdict.
  const ciAbsentNotifySendInput = fabricatedBackgroundNotificationInput(routes)
  ciAbsentNotifySendInput.bootLog += `\n${BACKGROUND_NOTIFICATION_FAILURE_PREFIX}notification dispatch failed: Error: spawn ${NOTIFY_SEND_COMMAND} ENOENT`
  const ciAbsentNotifySendVerdict = analyzeBackgroundNotificationLog(ciAbsentNotifySendInput, routes)
  if (ciAbsentNotifySendVerdict.result !== 'PASS') {
    problems.push(
      `fabricated GOOD background-notification-log on a host without ${NOTIFY_SEND_COMMAND} `
      + `(the CI shape, one swallowed ENOENT) must PASS, got FAIL on: ${ciAbsentNotifySendVerdict.failed.join(', ')}`,
    )
  }
  const backgroundNotificationDefectCases = [
    // THE P3-T13 DEFECT ITSELF: the runtime produced no anchor (the strict
    // `ctx.get('jobs')` at apply time meant the subscription never happened).
    ['the background anchor never appeared (the P3-T13 subscription defect)', (input) => {
      input.bootLog = input.bootLog.split('\n')
        .filter((line) => line.trim() !== BACKGROUND_NOTIFICATION_EXPECTED_ANCHOR)
        .join('\n')
    }, 'backgroundNotificationAnchorLoggedOnce'],
    // The double-notification failure mode: two anchors for ONE settlement.
    ['the background anchor was emitted twice (double notification for one settlement)', (input) => {
      input.bootLog += `\n${BACKGROUND_NOTIFICATION_EXPECTED_ANCHOR}`
    }, 'backgroundNotificationAnchorLoggedOnce'],
    // A non-terminal status must not satisfy the positive claim (a `running`
    // job has not settled; only completed|killed|failed may notify).
    ['the anchor reports a non-terminal status', (input) => {
      input.bootLog = input.bootLog.replace(
        BACKGROUND_NOTIFICATION_EXPECTED_ANCHOR,
        `${BACKGROUND_NOTIFICATION_LOG_PREFIX}running ${BACKGROUND_NOTIFICATION_EXPECTED_LABEL}`,
      )
    }, 'backgroundNotificationAnchorTerminalStatus'],
    // ... and neither may another job's label.
    ['the anchor reports another job\'s label', (input) => {
      input.bootLog = input.bootLog.replace(
        BACKGROUND_NOTIFICATION_EXPECTED_ANCHOR,
        `${BACKGROUND_NOTIFICATION_LOG_PREFIX}completed librarian`,
      )
    }, 'backgroundNotificationAnchorLabelExpected'],
    // A drifted anchor line (a renamed prefix) must not count as the port's own
    // shipped contract.
    ['the anchor line drifted from the shipped prefix', (input) => {
      input.bootLog = input.bootLog.replace(
        BACKGROUND_NOTIFICATION_EXPECTED_ANCHOR,
        `[omo-hooks] background-notify: completed ${BACKGROUND_NOTIFICATION_EXPECTED_LABEL}`,
      )
    }, 'backgroundNotificationAnchorLoggedOnce'],
    ['the delegation did not run in the background', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/call'
          ? { ...event, data: { ...event.data, arguments: JSON.stringify({ description: BACKGROUND_NOTIFICATION_EXPECTED_LABEL, prompt: BACKGROUND_NOTIFICATION_TASK }) } }
          : event)
    }, 'backgroundJobDelegationObserved'],
    ['the delegated child session never ran', (input) => {
      input.childLog = undefined
      input.allLogs = [input.log]
    }, 'delegatedChildSessionRan'],
    ['DSH never delivered the settlement notice to the parent', (input) => {
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'user/message'
          && messageContentText(event.data).includes('finished [status:')),
      )
    }, 'nativeSettlementNoticeDelivered'],
    // The exactly-once claim on the SESSION channel: a DOUBLE announcement there
    // (the sibling listener's own failure mode) must FAIL even though this
    // scenario's measured count is zero — the check is "never more than one",
    // and two anchors is exactly what a double announce looks like.
    ['the session-notification listener announced the top-level turn twice', (input) => {
      input.bootLog += `\n${SESSION_NOTIFICATION_EXPECTED_ANCHOR}\n${SESSION_NOTIFICATION_EXPECTED_ANCHOR}`
    }, 'sessionNotificationDidNotDoubleAnnounce'],
    // A swallowed `FAILED:` line must NOT be counted as a false positive (the
    // P3-T13 CI defect, run 36347748836 gate 3: the CI image has no
    // `notify-send`, so the backend legitimately reports `spawn notify-send
    // ENOENT` and the sibling session scenario tolerates the identical line).
    // The negative controls below are what keep that tolerance from becoming
    // vacuous: a REAL second NON-FAILURE notification line must still red the
    // false-positive claim, in BOTH of its shapes — one the anchor regex parses
    // (a genuine second anchor) and one it does NOT (a stray single-token line the
    // listener logged under the anchor prefix, so `anchorCount` stays 1 and ONLY
    // the non-failure surface count can catch it), so the check cannot pass merely
    // by being the anchor-count check renamed.
    ['a second non-failure anchor line appeared (a double notification)', (input) => {
      input.bootLog += `\n${BACKGROUND_NOTIFICATION_LOG_PREFIX}completed ${BACKGROUND_NOTIFICATION_EXPECTED_LABEL}`
    }, 'noBackgroundNotificationFalsePositive'],
    ['a stray line appeared under the anchor prefix (the anchor regex does not parse it)', (input) => {
      input.bootLog += `\n${BACKGROUND_NOTIFICATION_LOG_PREFIX}settled`
    }, 'noBackgroundNotificationFalsePositive'],
    // ... and the swallowed-failure AXIS itself is still guarded, on the sibling
    // scenario's own `<= 1` bound: the dispatch running TWICE is a defect, so two
    // `FAILED:` lines must red it.
    ['the background listener swallowed the dispatch failure twice (dispatch ran twice)', (input) => {
      input.bootLog += `\n${BACKGROUND_NOTIFICATION_FAILURE_PREFIX}notification dispatch failed: Error: spawn ${NOTIFY_SEND_COMMAND} ENOENT`
        + `\n${BACKGROUND_NOTIFICATION_FAILURE_PREFIX}notification dispatch failed: Error: spawn ${NOTIFY_SEND_COMMAND} ENOENT`
    }, 'notificationFailureSwallowedNotThrown'],
  ]
  for (const [label, mutate, expectedCheck] of backgroundNotificationDefectCases) {
    const input = fabricatedBackgroundNotificationInput(routes)
    mutate(input)
    const verdict = analyzeBackgroundNotificationLog(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated background-notification-log defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P3-T14 D-mode self-test: ONE fabricated GOOD input per scenario (the real
  // runtime layout) must PASS, and every named defect must FAIL on its OWN check
  // — the mutation QA the C/E-mode pilots established, applied to the three
  // listeners of 批 A plus H-07's correction.
  const goodEditRecovery = analyzeEditErrorRecoveryReminder(fabricatedEditErrorRecoveryInput(routes), routes)
  if (goodEditRecovery.result !== 'PASS') {
    problems.push(`fabricated GOOD edit-error-recovery-reminder must PASS, got FAIL on: ${goodEditRecovery.failed.join(', ')}`)
  }
  const editRecoveryDefectCases = [
    ['the failed edit result carries no reminder', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-2-0')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-2-0',
            `Error: old_string was not found in "${FABRICATED_EDIT_RECOVERY_FIXTURE_PATH}"`,
            true,
          )
          : event)
    }, 'failedEditResultCarriesReminder'],
    ['the reminder was also appended to the SUCCESSFUL sibling edit', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-2-1')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-2-1',
            `The file ${FABRICATED_EDIT_RECOVERY_FIXTURE_PATH} has been updated successfully.\n${EDIT_ERROR_REMINDER}`,
          )
          : event)
    }, 'successfulEditResultUnchanged'],
  ]
  for (const [label, mutate, expectedCheck] of editRecoveryDefectCases) {
    const input = fabricatedEditErrorRecoveryInput(routes)
    mutate(input)
    const verdict = analyzeEditErrorRecoveryReminder(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated edit-error-recovery-reminder defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  const goodJsonRecovery = analyzeJsonErrorRecoveryReminder(fabricatedJsonErrorRecoveryInput(routes), routes)
  if (goodJsonRecovery.result !== 'PASS') {
    problems.push(`fabricated GOOD json-error-recovery-reminder must PASS, got FAIL on: ${goodJsonRecovery.failed.join(', ')}`)
  }
  const jsonRecoveryDefectCases = [
    ['the non-blacklisted tool got no reminder', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-0')
          ? fabricatedToolResultEvent(event.seq, 'mock-llm-tool-1-0', JSON_RECOVERY_EXPECTED_ERROR, true)
          : event)
    }, 'nonExcludedToolGotReminder'],
    ['the BLACKLISTED tool was rewritten too', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-1')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-1',
            `${JSON_RECOVERY_EXPECTED_ERROR}\n${JSON_ERROR_REMINDER}`,
            true,
          )
          : event)
    }, 'excludedToolResultUnchanged'],
  ]
  for (const [label, mutate, expectedCheck] of jsonRecoveryDefectCases) {
    const input = fabricatedJsonErrorRecoveryInput(routes)
    mutate(input)
    const verdict = analyzeJsonErrorRecoveryReminder(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated json-error-recovery-reminder defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  const goodTruncator = analyzeToolOutputTruncated(fabricatedToolOutputTruncatedInput(routes), routes)
  if (goodTruncator.result !== 'PASS') {
    problems.push(`fabricated GOOD tool-output-truncated must PASS, got FAIL on: ${goodTruncator.failed.join(', ')}`)
  }
  const truncatorDefectCases = [
    ['the oversized grep result came back whole (no truncation)', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-0')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-0',
            `Found ${TRUNCATOR_BIG_LINE_COUNT} matches\n\n${Array.from({ length: TRUNCATOR_BIG_LINE_COUNT }, (_v, index) => truncatorBigLine(index)).join('\n')}`,
          )
          : event)
    }, 'bigGrepOutputTruncated'],
    ['the SMALL grep result was truncated as well', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-1')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-1',
            `Found 2 matches\n\n${TRUNCATOR_SMALL_LINES[0]}\n\n[1 more lines truncated due to context window limit]`,
          )
          : event)
    }, 'smallGrepControlUnchanged'],
  ]
  for (const [label, mutate, expectedCheck] of truncatorDefectCases) {
    const input = fabricatedToolOutputTruncatedInput(routes)
    mutate(input)
    const verdict = analyzeToolOutputTruncated(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated tool-output-truncated defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  const goodEmptyTask = analyzeEmptyTaskResponseCorrected(fabricatedEmptyTaskResponseInput(routes), routes)
  if (goodEmptyTask.result !== 'PASS') {
    problems.push(`fabricated GOOD empty-task-response-corrected must PASS, got FAIL on: ${goodEmptyTask.failed.join(', ')}`)
  }
  const emptyTaskDefectCases = [
    ['the empty delegation result was left uncorrected', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-0')
          ? fabricatedToolResultEvent(event.seq, 'mock-llm-tool-1-0', EMPTY_TASK_BLANK_CHILD_TEXT)
          : event)
    }, 'emptyDelegationResultReplacedWithWarning'],
    ['the correction was applied to the NON-empty delegation result too', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-1')
          ? fabricatedToolResultEvent(event.seq, 'mock-llm-tool-1-1', EMPTY_RESPONSE_WARNING)
          : event)
    }, 'nonEmptyDelegationResultUntouched'],
  ]
  for (const [label, mutate, expectedCheck] of emptyTaskDefectCases) {
    const input = fabricatedEmptyTaskResponseInput(routes)
    mutate(input)
    const verdict = analyzeEmptyTaskResponseCorrected(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated empty-task-response-corrected defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P3-T15 批 B self-test: ONE fabricated GOOD input per scenario must PASS,
  // and every named defect must FAIL on its OWN check (the T14 mutation QA,
  // applied to the 批 B trio).
  const goodDirectoryReadme = analyzeDirectoryReadmeInjected(fabricatedDirectoryReadmeInput(routes), routes)
  if (goodDirectoryReadme.result !== 'PASS') {
    problems.push(`fabricated GOOD directory-readme-injected must PASS, got FAIL on: ${goodDirectoryReadme.failed.join(', ')}`)
  }
  const directoryReadmeDefectCases = [
    ['the trigger read got no README', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-0')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-0',
            fabricatedReadRender(FABRICATED_README_TARGET_PATH, [
              README_INJECTOR_TARGET_SENTINEL,
              'export const neighbour = 2',
            ]),
          )
          : event)
    }, 'targetReadCarriesReadme'],
    ['the README was injected into the README-less control too', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-1')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-1',
            fabricatedReadRender(FABRICATED_README_PLAIN_PATH, [
              README_INJECTOR_PLAIN_SENTINEL,
              'export const control = true',
            ]) + fabricatedReadmeBlock(FABRICATED_README_README_PATH, README_INJECTOR_README_CONTENT),
          )
          : event)
    }, 'controlReadUnchanged'],
    ['the de-duplicated second read was rewritten as well', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-2')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-2',
            fabricatedReadRender(FABRICATED_README_DEDUP_PATH, [README_INJECTOR_DEDUP_SENTINEL])
              + fabricatedReadmeBlock(FABRICATED_README_README_PATH, README_INJECTOR_README_CONTENT),
          )
          : event)
    }, 'readmeInjectedExactlyOnce'],
  ]
  for (const [label, mutate, expectedCheck] of directoryReadmeDefectCases) {
    const input = fabricatedDirectoryReadmeInput(routes)
    mutate(input)
    const verdict = analyzeDirectoryReadmeInjected(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated directory-readme-injected defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  const goodAgentUsage = analyzeAgentUsageReminderAppended(fabricatedAgentUsageReminderInput(routes), routes)
  if (goodAgentUsage.result !== 'PASS') {
    problems.push(`fabricated GOOD agent-usage-reminder-appended must PASS, got FAIL on: ${goodAgentUsage.failed.join(', ')}`)
  }
  const agentUsageDefectCases = [
    ['the first target result got no reminder', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-0')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-0',
            `Found 2 matches\n\n${AGENT_USAGE_FIXTURE_CONTENT}`,
          )
          : event)
    }, 'firstTargetResultCarriesReminder'],
    ['the reminder was appended to the NON-target read control too', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-1')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-1',
            fabricatedReadRender(FABRICATED_AGENT_USAGE_FIXTURE_PATH, [
              `${AGENT_USAGE_PATTERN} line one`,
              `${AGENT_USAGE_PATTERN} line two`,
            ]) + REMINDER_MESSAGE,
          )
          : event)
    }, 'nonTargetControlUnchanged'],
    ['the cap was ignored: a fourth reminder landed past MAX_REMINDERS', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-4')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-4',
            `Found 2 matches\n\n${AGENT_USAGE_FIXTURE_CONTENT}${REMINDER_MESSAGE}`,
          )
          : event)
    }, 'reminderInjectedExactlyMaxRemindersTimes'],
    ['the child session — a delegation TARGET — was reminded too', (input) => {
      const childLog = input.allLogs.find(
        (candidate) => String(candidate.header?.id) === FABRICATED_AGENT_USAGE_CHILD_ID,
      )
      childLog.events = childLog.events.map((event) =>
        event.type === 'tool/result'
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-child-tool-1',
            `Found 2 matches\n\n${AGENT_USAGE_FIXTURE_CONTENT}${REMINDER_MESSAGE}`,
          )
          : event)
    }, 'childTargetResultNotReminded'],
  ]
  for (const [label, mutate, expectedCheck] of agentUsageDefectCases) {
    const input = fabricatedAgentUsageReminderInput(routes)
    mutate(input)
    const verdict = analyzeAgentUsageReminderAppended(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated agent-usage-reminder-appended defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  const goodTaskResume = analyzeTaskResumeInfoAppended(fabricatedTaskResumeInfoInput(routes), routes)
  if (goodTaskResume.result !== 'PASS') {
    problems.push(`fabricated GOOD task-resume-info-appended must PASS, got FAIL on: ${goodTaskResume.failed.join(', ')}`)
  }
  const taskResumeDefectCases = [
    ['the continuable result got no continuation tip', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-0')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-0',
            `${DSH_CONTINUABLE_TEXT_PREFIX}${FABRICATED_TASK_RESUME_CHILD_ID}`,
          )
          : event)
    }, 'continuableResultCarriesResumeHint'],
    ['the tip names a DIFFERENT child id than the render', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-0')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-0',
            `${DSH_CONTINUABLE_TEXT_PREFIX}${FABRICATED_TASK_RESUME_CHILD_ID}`
              + buildTaskResumeHint('subagent-somewhere-else'),
          )
          : event)
    }, 'continuableResultCarriesResumeHint'],
    ['the tip was appended to the FOREGROUND control too', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-1')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-1',
            `${TASK_RESUME_ORACLE_NOTE}${buildTaskResumeHint('subagent-somewhere-else')}`,
          )
          : event)
    }, 'foregroundControlUnchanged'],
    ['the conductor ran only the batch — the summary step vanished below the floor', (input) => {
      // P3-T15 review MINOR-1/2 (assertion precision): `>= 2` is a deliberate
      // floor over a racing runtime count, so the mutation QA must prove the
      // floor is LIVE — dropping back to the single batch step has to go red on
      // this name instead of hiding under a count nobody exercises.
      let kept = 0
      input.requests = input.requests.filter((request) => {
        if (request.role !== 'sisyphus') return true
        kept += 1
        return kept <= 1
      })
    }, 'mockSawTheDelegationAndTheSummary'],
  ]
  for (const [label, mutate, expectedCheck] of taskResumeDefectCases) {
    const input = fabricatedTaskResumeInfoInput(routes)
    mutate(input)
    const verdict = analyzeTaskResumeInfoAppended(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated task-resume-info-appended defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P3-T16 批 C self-test (the review-F1 re-scope): ONE fabricated GOOD input
  // per scenario must PASS, and every named defect must FAIL on its OWN check.
  // The webfetch scenario no longer observes a guard deny — hermetically it
  // cannot, see the P3-T16 section header — it observes that a private fixture is
  // never probed and that the native provider owns the refusal.
  const goodWebfetch = analyzeWebfetchPrivateTargetUnprobed(
    fabricatedWebfetchPrivateTargetInput(routes),
    routes,
  )
  if (goodWebfetch.result !== 'PASS') {
    problems.push(`fabricated GOOD webfetch-private-target-unprobed must PASS, got FAIL on: ${goodWebfetch.failed.join(', ')}`)
  }
  const webfetchDefectCases = [
    ['the guard probed the private fixture', (input) => {
      input.fixtureHits = ['/redirect-me', '/final']
    }, 'privateFixtureNeverProbed'],
    ['the trigger never reached the native address policy', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-0')
          ? fabricatedToolResultEvent(event.seq, 'mock-llm-tool-1-0', 'Error: connection refused', true)
          : event)
    }, 'triggerReachedTheNativeAddressPolicy'],
    ['the guard marker leaked onto the trigger result', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-0')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-0',
            `Error: ${WEBFETCH_REDIRECT_GUARD_MARKER}: refused`,
            true,
          )
          : event)
    }, 'triggerCarriesNoGuardMarker'],
    ['the control never reached the native address policy', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-1')
          ? fabricatedToolResultEvent(event.seq, 'mock-llm-tool-1-1', 'Error: connection refused', true)
          : event)
    }, 'controlReachedTheNativeAddressPolicy'],
    ['the guard marker leaked onto the control result', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-1-1')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-1-1',
            `Error: ${WEBFETCH_REDIRECT_GUARD_MARKER}: refused`,
            true,
          )
          : event)
    }, 'controlCarriesNoGuardMarker'],
    ['the guard spoke somewhere else in the batch', (input) => {
      input.log.events = input.log.events.concat([
        fabricatedToolResultEvent(
          8,
          'mock-llm-tool-1-9',
          `Error: ${WEBFETCH_REDIRECT_GUARD_MARKER}: stray`,
          true,
        ),
      ])
    }, 'guardNeverSpoke'],
    ['the batch was the conductor\'s only step (summary vanished below the floor)', (input) => {
      let kept = 0
      input.requests = input.requests.filter((request) => {
        if (request.role !== 'sisyphus') return true
        kept += 1
        return kept <= 1
      })
    }, 'mockSawTheBatchAndTheSummary'],
  ]
  for (const [label, mutate, expectedCheck] of webfetchDefectCases) {
    const input = fabricatedWebfetchPrivateTargetInput(routes)
    mutate(input)
    const verdict = analyzeWebfetchPrivateTargetUnprobed(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated webfetch-private-target-unprobed defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  const goodPrometheus = analyzePrometheusMdOnlyDenied(fabricatedPrometheusMdOnlyInput(routes), routes)
  if (goodPrometheus.result !== 'PASS') {
    problems.push(`fabricated GOOD prometheus-md-only-denied must PASS, got FAIL on: ${goodPrometheus.failed.join(', ')}`)
  }
  const prometheusDefectCases = [
    ['the non-.md write was allowed through', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-child-tool-1')
          ? fabricatedToolResultEvent(event.seq, 'mock-llm-child-tool-1', `wrote ${input.denyTargetPath}`)
          : event)
    }, 'nonMdWriteDeniedByTheGate'],
    ['the refused file landed on disk anyway', (input) => {
      input.denyTargetAbsent = false
    }, 'deniedTargetNeverLanded'],
    ['the plan write got no workflow reminder', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-child-tool-2-0')
          ? fabricatedToolResultEvent(event.seq, 'mock-llm-child-tool-2-0', `wrote ${input.plansPath}`)
          : event)
    }, 'workflowReminderAppended'],
    ['the reminder landed on the non-plans .omo write too', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-child-tool-2-1')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-child-tool-2-1',
            `wrote ${input.draftsPath}${PROMETHEUS_WORKFLOW_REMINDER}`,
          )
          : event)
    }, 'draftsWriteAllowedWithoutReminder'],
    ['the conductor\'s own write was gated too', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result'
          && event.data?.message?.content?.some((part) => part.toolCallId === 'mock-llm-tool-2')
          ? fabricatedToolResultEvent(
            event.seq,
            'mock-llm-tool-2',
            `Error: [${PROMETHEUS_MD_ONLY_HOOK_NAME}] Prometheus is a planning agent.`,
            true,
          )
          : event)
    }, 'conductorWriteNotAffected'],
    ['the child descriptor carried no prometheus persona (the identity surface)', (input) => {
      input.childLog.events = input.childLog.events.map((event) =>
        event.type === 'subagent/descriptor'
          ? { ...event, data: { ...event.data, persona: 'You are **omo-explore**, a search agent.' } }
          : event)
    }, 'prometheusPersonaObservable'],
    ['the plan bytes never landed on disk', (input) => {
      input.plansLandedOnDisk = false
    }, 'plansWriteAllowed'],
    ['the gate spoke twice (a duplicated deny carrier)', (input) => {
      input.childLog.events = input.childLog.events.concat([
        fabricatedToolResultEvent(
          9,
          'mock-llm-child-tool-1',
          `Error: [${PROMETHEUS_MD_ONLY_HOOK_NAME}] duplicated`,
          true,
        ),
      ])
    }, 'gateSpokeExactlyOnce'],
  ]
  for (const [label, mutate, expectedCheck] of prometheusDefectCases) {
    const input = fabricatedPrometheusMdOnlyInput(routes)
    mutate(input)
    const verdict = analyzePrometheusMdOnlyDenied(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated prometheus-md-only-denied defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P3-T17 ulw-execute-activated self-test (the T15/T16 mutation QA applied
  // to the A-mode row): the fabricated GOOD input must PASS, and every named
  // defect must FAIL on its OWN check.
  const goodUlw = analyzeUlwExecuteActivated(fabricatedUlwExecuteInput(routes), routes)
  if (goodUlw.result !== 'PASS') {
    problems.push(`fabricated GOOD ulw-execute-activated must PASS, got FAIL on: ${goodUlw.failed.join(', ')}`)
  }
  const goodUlwNoIntent = analyzeUlwExecuteNoIntent(fabricatedUlwExecuteNoIntentInput(routes), routes)
  if (goodUlwNoIntent.result !== 'PASS') {
    problems.push(`fabricated GOOD ulw-execute-no-intent must PASS, got FAIL on: ${goodUlwNoIntent.failed.join(', ')}`)
  }
  const ulwNoIntentDefectCases = [
    ['the no-intent child was injected', (input) => {
      const child = input.allLogs[1]
      child.events.splice(1, 0, {
        seq: 1,
        type: 'user/message',
        data: {
          content: [{ type: 'text', text: FABRICATED_ULW_INJECTED_TEXT }],
          source: { kind: 'plugin', plugin: E2E_ULW_PLUGIN, form: 'instructions' },
        },
      })
    }, 'noInjectionWithoutWorkIntent'],
    ['the injection reached the wire even though the log was clean', (input) => {
      input.requests = input.requests.concat([
        { role: 'atlas', body: { model: routes.atlas.model, messages: [{ role: 'user', content: FABRICATED_ULW_INJECTED_TEXT }] }, receivedAt: 40 },
      ])
    }, 'noInjectionWithoutWorkIntent'],
    ['the plan selection registered a work session anyway', (input) => {
      input.bootLog = `${FABRICATED_BOOT_LOG}\n${ULW_EXECUTE_ID_LOG_PREFIX}work session ulw-execute-9 plan=alpha`
    }, 'noWorkSessionRegistered'],
    ['the child turn never completed', (input) => {
      const child = input.allLogs[1]
      child.events = child.events.filter((event) => event.type !== 'turn/end')
    }, 'childTurnCompleted'],
    ['the plan selection ran anyway (a notepad appeared)', (input) => {
      input.notepadAbsent = false
    }, 'noPlanSelectionSideEffect'],
    ['the identity conjunct did not hold (a non-atlas child)', (input) => {
      const child = input.allLogs[1]
      child.events = child.events.map((event) =>
        event.type === 'subagent/descriptor'
          ? { ...event, data: { ...event.data, persona: 'You are **omo-explore**, a search agent.' } }
          : event)
    }, 'atlasPersonaObservable'],
    ['the recorded task was not the no-intent one', (input) => {
      const child = input.allLogs[1]
      child.events = child.events.map((event) =>
        event.type === 'user/message'
          ? { ...event, data: { ...event.data, content: [{ type: 'text', text: 'something else' }] } }
          : event)
    }, 'workIntentTaskRecorded'],
  ]
  for (const [label, mutate, expectedCheck] of ulwNoIntentDefectCases) {
    const input = fabricatedUlwExecuteNoIntentInput(routes)
    mutate(input)
    const verdict = analyzeUlwExecuteNoIntent(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated ulw-execute-no-intent defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  const ulwDefectCases = [
    ['the injection never reached the atlas child', (input) => {
      const trigger = input.allLogs[1]
      trigger.events = trigger.events.filter((event) => event.type !== 'user/message')
    }, 'injectedContextReachedTheChild'],
    ['the trigger child lost its atlas persona (the identity surface)', (input) => {
      const trigger = input.allLogs[1]
      trigger.events = trigger.events.map((event) =>
        event.type === 'subagent/descriptor'
          ? { ...event, data: { ...event.data, persona: 'You are **omo-explore**, a search agent.' } }
          : event)
    }, 'atlasPersonaObservable'],
    ['the injected context was NOT delivered with the plugin source contract', (input) => {
      const trigger = input.allLogs[1]
      trigger.events = trigger.events.map((event) =>
        event.type === 'user/message'
          ? { ...event, data: { ...event.data, source: { kind: 'plugin', plugin: 'someone-else', form: 'notice' } } }
          : event)
    }, 'injectionSourceContract'],
    ['the injected context never reached the atlas model request', (input) => {
      input.requests = input.requests.filter(
        (request) => !JSON.stringify(request.body ?? {}).includes(E2E_ULW_CONTEXT_MARKER))
    }, 'injectionReachedTheModel'],
    ['the sibling explore child was injected (identity gate broken)', (input) => {
      const sibling = input.allLogs[2]
      sibling.events.splice(1, 0, {
        seq: 1,
        type: 'user/message',
        data: {
          content: [{ type: 'text', text: FABRICATED_ULW_INJECTED_TEXT }],
          source: { kind: 'plugin', plugin: E2E_ULW_PLUGIN, form: 'instructions' },
        },
      })
    }, 'noInjectionForSiblingIdentity'],
    ['the notepad scaffold never landed', (input) => {
      input.notepadPresent = []
    }, 'notepadScaffoldLanded'],
    ['the notepad footer still points at the removed /start-work command', (input) => {
      input.notepadLearnings = '# Learnings \u2014 alpha\n\n_Auto-scaffolded by /start-work. Append new entries below - never overwrite._\n'
    }, 'notepadFooterRewritten'],
    ['the conductor itself was injected', (input) => {
      input.log.events = input.log.events.concat([{
        seq: 7,
        type: 'user/message',
        data: {
          content: [{ type: 'text', text: FABRICATED_ULW_INJECTED_TEXT }],
          source: { kind: 'plugin', plugin: E2E_ULW_PLUGIN, form: 'instructions' },
        },
      }])
    }, 'conductorNotInjected'],
    ['the delegation batch never dispatched (no lane traffic)', (input) => {
      input.requests = input.requests.filter((req) => req.role === 'sisyphus').slice(0, 1)
    }, 'delegationBatchDispatched'],
  ]
  for (const [label, mutate, expectedCheck] of ulwDefectCases) {
    const input = fabricatedUlwExecuteInput(routes)
    mutate(input)
    const verdict = analyzeUlwExecuteActivated(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated ulw-execute-activated defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P4-T5 skills-catalog-visible self-test: the fabricated good input must
  // PASS, and each fabricated defect must fail on its OWN named check — so the
  // catalog/load/对照 assertions are proven sensitive rather than vacuous.
  const goodSkills = analyzeSkillsCatalogVisible(fabricatedSkillsCatalogInput(routes), routes)
  if (goodSkills.result !== 'PASS') {
    problems.push(`fabricated GOOD skills-catalog-visible must PASS, got FAIL on: ${goodSkills.failed.join(', ')}`)
  }
  const skillsDefectCases = [
    ['the catalog dropped one vendored skill', (input) => {
      const names = vendoredSkillNames()
      const dropped = names[names.length - 1]
      input.requests[0].body.messages[0].content = input.requests[0].body.messages[0].content
        .split('\n')
        .filter((line) => !line.startsWith(`- \`${dropped}\``))
        .join('\n')
    }, 'catalogCoversEveryVendoredSkill'],
    // SPLIT on purpose (dual review): bundling both defects into one case let a
    // future parser that ignored the `start-work` name entirely pass the case via
    // the prefix half. Each defect now fails on its own.
    ['the catalog exposed a shared/-prefixed form', (input) => {
      input.requests[0].body.messages[0].content += '\n<available_skills>\n- `shared/git-master`: prefixed\n</available_skills>'
    }, 'catalogHasNoPrefixedForm'],
    ['the catalog exposed the pre-v5 start-work name', (input) => {
      input.requests[0].body.messages[0].content += '\n<available_skills>\n- `start-work`: the pre-v5 row name\n</available_skills>'
    }, 'catalogHasNoPrefixedForm'],
    // The bad block is in the SECOND request, not the first: pins the all-blocks
    // scan. dsh republishes the catalog on digest change, so a regression
    // introduced in a LATER republish must still be caught — a parser that only
    // read `requests[0]`'s first block would pass this case silently.
    ['a LATER request carried a malformed catalog block', (input) => {
      input.requests[1].body.messages[0].content += '\n<available_skills>\n- `shared/ultrawork`: prefixed in a republish\n</available_skills>'
    }, 'catalogHasNoPrefixedForm'],
    ['the skills boot marker never landed', (input) => {
      input.bootLog = FABRICATED_BOOT_LOG
    }, 'skillsMarkerPresent'],
    ['the skill tool returned an error instead of the body', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result' && event.data?.message?.content?.[0]?.toolCallId === 'mock-llm-tool-1-0'
          ? {
            ...event,
            data: {
              ...event.data,
              message: {
                ...event.data.message,
                content: [{ ...event.data.message.content[0], isError: true, content: [{ type: 'text', text: 'Error: skill "git-master" is unknown or no longer available' }] }],
              },
            },
          }
          : event)
    }, 'skillToolReturnedBody'],
    ['the skill tool returned a placeholder body (not the vendored one)', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result' && event.data?.message?.content?.[0]?.toolCallId === 'mock-llm-tool-1-0'
          ? {
            ...event,
            data: {
              ...event.data,
              message: {
                ...event.data.message,
                content: [{ ...event.data.message.content[0], content: [{ type: 'text', text: '<skill_content name="git-master">a plausible but wrong body</skill_content>' }] }],
              },
            },
          }
          : event)
    }, 'skillToolBodyMatchesVendoredFile'],
    ['the unvendored name was NOT refused (the rubber-stamp case)', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'tool/result' && event.data?.message?.content?.[0]?.toolCallId === 'mock-llm-tool-2-0'
          ? {
            ...event,
            data: {
              ...event.data,
              message: {
                ...event.data.message,
                content: [{ ...event.data.message.content[0], isError: false, content: [{ type: 'text', text: 'here is a body for any name you like' }] }],
              },
            },
          }
          : event)
    }, 'unknownSkillNameRefused'],
    // NOTE the label: this defect trips `turnCompleted`, NOT the request-count
    // check `mockSawBothSkillSteps`. Dropping the closing event leaves all three
    // requests in place, which is the point — it shows the count check and the
    // turn-closure check are independent, and a PASS here would have hidden a
    // driver that counted requests without ever seeing a completed turn.
    ['the turn never ended', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'turn/end')
    }, 'turnCompleted'],
  ]
  for (const [label, mutate, expectedCheck] of skillsDefectCases) {
    const input = fabricatedSkillsCatalogInput(routes)
    mutate(input)
    const verdict = analyzeSkillsCatalogVisible(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated skills-catalog-visible defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }


  // ── P4-T13 keyword-mode self-test: the GOOD inputs must PASS, and each
  // fabricated defect must fail on its OWN named check. Without this the
  // negative-controls scenario would pass on a dead hook, which is the whole
  // failure mode a keyword hook has.
  const goodUltrawork = analyzeUltraworkKeywordInjected(fabricatedKeywordGoodInput(routes), routes)
  if (goodUltrawork.result !== 'PASS') {
    problems.push(`fabricated GOOD ultrawork-keyword-injected must PASS, got FAIL on: ${goodUltrawork.failed.join(', ')}`)
  }
  const keywordDefectCases = [
    // ① the carrier is a BARE STRING — the BLOCKER-1 failure mode.
    //    Expected check is `singleInboxSplice`, not the shape check, and the
    //    distinction is the point: `messageContentText(<string>)` is `''`, so a
    //    raw string is invisible to the needle matcher and the splice simply
    //    DISAPPEARS. A bare string therefore cannot degrade into "some text
    //    arrived" — it removes the carrier outright, which is what the check
    //    reports. (Asserting the shape check here would be asserting something
    //    this defect cannot reach.)
    ['the injected carrier is a bare string instead of a UserMessage', (input) => {
      input.log.events[3].data.inserted = [buildExpectedInjectedText('ultrawork')]
    }, 'singleInboxSplice'],
    // ② the source triple names the hook id instead of the package (the
    //    regression I hit while fixing BLOCKER-1).
    ['the injection source names the hook id instead of the package', (input) => {
      input.log.events[3].data.inserted[0].source = { kind: 'plugin', plugin: keywordDetectorModule.KEYWORD_DETECTOR_ID, form: 'instructions' }
    }, 'injectionIsFullUserMessage'],
    // ③ a missing / non-uuid id: the inbox pending-uniqueness check reads it.
    ['the injection id was stripped', (input) => {
      delete input.log.events[3].data.inserted[0].id
    }, 'injectionIdIsUuid'],
    // ④ the body was truncated — a "prefix arrived" defect the text-equality
    //    check must catch (a prefix check would pass this).
    ['the injected body was truncated to a prefix', (input) => {
      input.log.events[3].data.inserted[0].content[0].text = input.log.events[3].data.inserted[0].content[0].text.slice(0, 400)
    }, 'injectionTextMatchesPluginBuild'],
    // ④′ the SAME defect applied to the OTHER projection. The P3-T9 double-steer
    //     cases (this file, ~line 3908) established that a mutation touching only
    //     one projection is the standard way a real regression hides: the
    //     untouched copy keeps matching the needle, the check reads it, and the
    //     run passes. Here the history claim is corrupted while the inbox splice
    //     stays perfect — and the model reads the CLAIM, so this is the
    //     projection that actually matters for S-11's arrival claim.
    ['the history-claim projection was truncated while the splice stayed correct', (input) => {
      input.log.events[4].data.content[0].text = input.log.events[4].data.content[0].text.slice(0, 400)
    }, 'injectionTextMatchesPluginBuild'],
    // ④″ …and the id case, on the claim projection only. Two valid-looking
    //     uuids differing between projections is invisible to a per-projection
    //     shape check, which is what `bothProjectionsShareOneId` exists for.
    ['the two projections carried different injection ids', (input) => {
      input.log.events[4].data.id = '11111111-2222-4333-8444-555555555555'
    }, 'bothProjectionsShareOneId'],
    // ⑤ S-11's own claim: the banner must arrive on a LATER request. Putting it
    //    on request #0 is the opencode timing this deployment does not have.
    ['the banner arrived on the FIRST request (S-11 timing regression)', (input) => {
      input.requests[0].body.messages.push(fabricatedKeywordInjection(buildExpectedInjectedText('ultrawork')))
    }, 'bannerArrivesAfterTheInjectingStep'],
    // ⑥ …and the mirror: if the banner never reaches the wire at all, the
    //    on-wire check must fail (otherwise ⑤ is satisfied by an empty run).
    ['the banner never reached the model on the wire', (input) => {
      for (const request of input.requests) {
        request.body.messages = request.body.messages.filter((message) => {
          const text = messageContentText(message)
          return !text.includes(keywordDetectorConstants.ULTRAWORK_BANNER_LINE)
        })
      }
    }, 'bannerReachesModelOnWire'],
    // ⑦ control ④ broken: a SECOND injection in the follow-up turn.
    ['the second keyword turn injected again (S-6 one-shot gone)', (input) => {
      const injected = fabricatedKeywordInjection(buildExpectedInjectedText('ultrawork'))
      input.log.events.splice(8, 0,
        { seq: 80, type: 'agent/inbox/spliced', data: { target: 'next-step', inserted: [injected] } },
        { ...fabricatedKeywordInjectedEvent(buildExpectedInjectedText('ultrawork'), injected.source, injected.id), seq: 81 })
    }, 'exactlyOneInjectionAcrossBothTurns'],
    // ⑧ the second turn never ran — so "no second injection" would be vacuous.
    ['the second keyword turn produced no assistant message', (input) => {
      input.log.events = input.log.events.filter((event) => !eventText(event).includes(ULTRAWORK_KEYWORD_FOLLOWUP_SUMMARY))
    }, 'secondKeywordTurnRan'],
    // ⑨ the bash step did not execute — the premise behind "a later request
    //    existed".
    ['the step tool call never ran', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'tool/result')
    }, 'stepToolCallExecuted'],
  ]
  for (const [label, mutate, expectedCheck] of keywordDefectCases) {
    KEYWORD_SELF_TEST_ATTESTATION.push(['ultrawork-keyword-injected', label])
    const input = fabricatedKeywordGoodInput(routes)
    mutate(input)
    const verdict = analyzeUltraworkKeywordInjected(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated ultrawork-keyword-injected defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // The negative-controls analysis has the opposite vacuity risk, so its
  // defects are the ones that would make a DEAD hook look correct.
  const goodNegatives = analyzeKeywordNegativeControls(fabricatedKeywordNegativeGoodInput(routes), routes)
  if (goodNegatives.result !== 'PASS') {
    problems.push(`fabricated GOOD keyword-negative-controls must PASS, got FAIL on: ${goodNegatives.failed.join(', ')}`)
  }
  const keywordNegativeDefectCases = [
    // A stray injection in ANY of the three turns must fail the negative — this
    // is the case that proves the scenario is not a rubber stamp.
    ['a mode was injected during a control turn', (input) => {
      const injected = fabricatedKeywordInjection(buildExpectedInjectedText('ultrawork'))
      input.log.events.splice(2, 0, { ...fabricatedKeywordInjectedEvent(buildExpectedInjectedText('ultrawork'), injected.source, injected.id), seq: 15 })
    }, 'noKeywordInjectedUserMessage'],
    // …and a keyword body arriving through SOME OTHER plugin's channel, which the
    // carrier-count check above would miss (it only knows our own triple).
    ['a foreign plugin carried the keyword body', (input) => {
      const event = { ...fabricatedKeywordInjectedEvent(`prefix ${KEYWORD_TEXTS.ultrawork.slice(0, 120)} suffix`, { kind: 'plugin', plugin: 'some-other-plugin', form: 'snapshot' }, 'foreign-1'), seq: 16 }
      input.log.events.splice(2, 0, event)
    }, 'noForeignPluginCarriedKeywordText'],
    // …and on the wire, separately: a banner that reached the model without a
    // user/message carrier (a different delivery path) must also fail.
    ['a mode banner reached the wire without a user-message carrier', (input) => {
      input.requests[0].body.messages.push({
        role: 'user',
        content: [{ type: 'text', text: `**MANDATORY**: Say "${keywordDetectorConstants.ULTRAWORK_BANNER_LINE}" exactly once` }],
      })
    }, 'noKeywordBannerOnTheWire'],
    // The premise: if a control prompt was never delivered, the control proves
    // nothing. Strip one and the scenario must fail rather than pass quietly.
    ['a control prompt never reached the session', (input) => {
      input.log.events = input.log.events.filter((event) => !eventText(event).includes('control two'))
    }, 'allThreeControlPromptsDelivered'],
    // …and if control ②'s keyword stopped being inside the fence, the control
    // would be testing nothing (it would have become control ①).
    ['control two\'s keyword stopped being fence-only', (input) => {
      input.log.events.find((event) => eventText(event).includes('control two')).data.content[0].text
        = 'e2e keyword control two: run ulw now, first echo the step marker then summarize'
    }, 'controlTwoKeywordIsInsideTheFence'],
    // …and if control ③ stopped being slash-led, the slash gate is untested.
    ['control three stopped being a slash command', (input) => {
      input.log.events.find((event) => eventText(event).includes('control three')).data.content[0].text
        = 'e2e keyword control three: please run ulw, first echo the step marker then summarize'
    }, 'controlThreePromptIsSlashLed'],
    // A control ① that quietly acquired a keyword is no longer control ①.
    ['control one\'s prompt acquired a keyword', (input) => {
      input.log.events.find((event) => eventText(event).includes('control one')).data.content[0].text
        = 'e2e keyword control one: run ulw, first echo the step marker then summarize'
    }, 'controlOnePromptHasNoKeyword'],
  ]
  // The hyperplan scenario was self-test-invisible until P4-T13 review: no GOOD
  // input, no defect cases, so `analyzeHyperplanKeywordInjected` was never run
  // outside a real e2e. Both directions are now covered, and the two defect
  // cases are the two failure shapes that differ from ultrawork's — a bare
  // string (the BLOCKER-1 mode) and the S-11 timing claim.
  const goodHyperplan = analyzeHyperplanKeywordInjected(fabricatedHyperplanGoodInput(routes), routes)
  if (goodHyperplan.result !== 'PASS') {
    problems.push(`fabricated GOOD hyperplan-keyword-injected must PASS, got FAIL on: ${goodHyperplan.failed.join(', ')}`)
  }
  for (const [label, mutate, expectedCheck] of [
    ['the hyperplan injection was a bare string', (input) => {
      input.log.events[3].data.inserted = [buildExpectedInjectedText('hyperplan')]
    }, 'singleInboxSplice'],
    ['the hyperplan banner arrived on the FIRST request', (input) => {
      input.requests[0].body.messages.push(fabricatedKeywordInjection(buildExpectedInjectedText('hyperplan')))
    }, 'bannerArrivesAfterTheInjectingStep'],
  ]) {
    KEYWORD_SELF_TEST_ATTESTATION.push(['hyperplan-keyword-injected', label])
    const input = fabricatedHyperplanGoodInput(routes)
    mutate(input)
    const verdict = analyzeHyperplanKeywordInjected(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated hyperplan-keyword-injected defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ⚠️ THE two cases that make this scenario mean anything. Its four other checks
  // are negatives, and a hook that is not running satisfies all of them — which
  // is how a real registration crash (the `ctx.config` proxy throw) passed this
  // scenario outright. These two restore the falsifiability.
  keywordNegativeDefectCases.unshift(
    ['the hook never registered on agent/pre-step', (input) => {
      input.bootLog = FABRICATED_BOOT_LOG
    }, 'keywordDetectorRegisteredOnPreStep'],
    ['the hook registration FAILED at boot', (input) => {
      input.bootLog = [
        input.bootLog,
        omoHooksMarkers.formatHookFailedLine(
          keywordDetectorModule.KEYWORD_DETECTOR_ID,
          new Error('cannot get property "config" without inject'),
        ),
      ].join('\n')
    }, 'keywordDetectorRegistrationDidNotFail'],
  )
  for (const [label, mutate, expectedCheck] of keywordNegativeDefectCases) {
    KEYWORD_SELF_TEST_ATTESTATION.push(['keyword-negative-controls', label])
    const input = fabricatedKeywordNegativeGoodInput(routes)
    mutate(input)
    const verdict = analyzeKeywordNegativeControls(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated keyword-negative-controls defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // The combo's suppression claim gets its own sensitivity cases: a combo that
  // ALSO carried the standalone bodies would satisfy every other check.
  const goodCombo = analyzeComboKeywordInjected(fabricatedComboGoodInput(routes), routes)
  if (goodCombo.result !== 'PASS') {
    problems.push(`fabricated GOOD combo-keyword-injected must PASS, got FAIL on: ${goodCombo.failed.join(', ')}`)
  }
  // A real run's two projections (inbox splice + history claim) carry the SAME
  // text, so a defect must be applied to BOTH: mutating only the splice lets the
  // untouched claim keep matching the needle, and the suppression check then
  // reads the untouched copy and passes. (That is exactly how the first attempt
  // at the wrapper defect escaped — the check was reading a carrier the defect
  // had not reached.)
  const mutateComboCarrierText = (input, rewrite) => {
    for (const message of [...(input.log.events[3].data.inserted ?? []), input.log.events[4].data]) {
      if (message?.content?.[0]?.text !== undefined) {
        message.content[0].text = rewrite(message.content[0].text)
      }
    }
  }
  for (const [label, mutate, expectedCheck] of [
    ['the combo also carried the standalone hyperplan body', (input) => {
      mutateComboCarrierText(input, (text) => `${text}\n\n<hyperplan-mode>\n\n${KEYWORD_TEXTS.hyperplan}`)
    }, 'comboCarriesNoHyperplanStandaloneBody'],
    // The instruction-form variant: the BODY is absent but the MANDATORY line
    // rode along. A body-only check would pass this one.
    ['the combo carried the standalone hyperplan MANDATORY line without its body', (input) => {
      mutateComboCarrierText(input, (text) => `**MANDATORY**: ${SUPPRESSION_INSTRUCTION_ANCHOR} exactly once.\n\n${text}`)
    }, 'comboCarriesNoHyperplanStandaloneInstruction'],
    ['the combo body was wrapped in a second ultrawork tag pair', (input) => {
      mutateComboCarrierText(input, (text) => text.replace(ULTRAWORK_TAG_ANCHOR, `${ULTRAWORK_TAG_ANCHOR}\n\n${ULTRAWORK_TAG_ANCHOR}`))
    }, 'comboCarriesOneUltraworkTagPair'],
    ['the combo wrapper was not the verbatim upstream banner', (input) => {
      // Rewritten through the derived banner, not a literal, so the defect is
      // still "the wrapper is not the shipped one" after any upstream reword.
      mutateComboCarrierText(input, (text) => text.replace(
        keywordDetectorConstants.COMBO_BANNER_LINE,
        keywordDetectorConstants.ULTRAWORK_BANNER_LINE,
      ))
    }, 'comboCarriesTheVerbatimWrapper'],
  ]) {
    KEYWORD_SELF_TEST_ATTESTATION.push(['combo-keyword-injected', label])
    const input = fabricatedComboGoodInput(routes)
    mutate(input)
    const verdict = analyzeComboKeywordInjected(input, routes)
    if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
      problems.push(`fabricated combo-keyword-injected defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
    }
  }

  // ── P4-T9 stop-continuation self-test: the good input must PASS, then every
  // named defect must FAIL on its own named check.
  {
    const goodStop = analyzeStopContinuationHaltsTodo(fabricatedStopContinuationInput(routes), routes)
    if (goodStop.result !== 'PASS') {
      problems.push(`fabricated GOOD stop-continuation-halts-todo must PASS, got FAIL on: ${goodStop.failed.join(', ')}`)
    }
    const stopCases = stopContinuationDefectCases()
    if (stopCases.length === 0) {
      problems.push('fabricated stop-continuation-halts-todo: the defect list is EMPTY — the banner would attest to nothing')
    }
    for (const [label, mutate, expectedCheck] of stopCases) {
      const input = fabricatedStopContinuationInput(routes)
      mutate(input)
      const verdict = analyzeStopContinuationHaltsTodo(input, routes)
      if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
        problems.push(`fabricated stop-continuation-halts-todo defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
      }
    }
    STOP_SELF_TEST_ATTESTATION.push(...stopCases.map(([label]) => ['stop-continuation-halts-todo', label]))
  }

  // ── P4-T11 ulw-execute-command self-test: the good input must PASS, then every
  // named defect must FAIL on its own named check.
  {
    const goodCommand = analyzeUlwExecuteCommandActivatesAtlas(fabricatedUlwCommandInput(routes), routes)
    if (goodCommand.result !== 'PASS') {
      problems.push(`fabricated GOOD ulw-execute-command-activates-atlas must PASS, got FAIL on: ${goodCommand.failed.join(', ')}`)
    }
    const commandCases = ulwExecuteCommandDefectCases(routes)
    if (commandCases.length === 0) {
      problems.push('fabricated ulw-execute-command-activates-atlas: the defect list is EMPTY — the banner would attest to nothing')
    }
    for (const [label, mutate, expectedCheck] of commandCases) {
      const input = fabricatedUlwCommandInput(routes)
      mutate(input)
      const verdict = analyzeUlwExecuteCommandActivatesAtlas(input, routes)
      if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
        problems.push(`fabricated ulw-execute-command-activates-atlas defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
      }
    }
    ULW_COMMAND_SELF_TEST_ATTESTATION.push(...commandCases.map(([label]) => ['ulw-execute-command-activates-atlas', label]))
  }

  // ── P4-T15 hyperplan-degraded-noted self-test: the good input must PASS, then
  // every named defect must FAIL on its own named check.
  //
  // Defect counts, so a reader does not have to count: 17 for
  // hyperplan-degraded-noted, 14 for ulw-plan-loads-prometheus-skill, 31 in total.
  // The empty-list guard below is the real check on these numbers — if a case is
  // deleted, the banner is generated from the live list, so the SELF-TEST OK line
  // would silently shrink rather than fail. That is why the guard exists per
  // scenario and not once for the pair.
  {
    const goodHyperplan = analyzeHyperplanDegradedNoted(fabricatedHyperplanInput(routes), routes)
    if (goodHyperplan.result !== 'PASS') {
      problems.push(`fabricated GOOD hyperplan-degraded-noted must PASS, got FAIL on: ${goodHyperplan.failed.join(', ')}`)
    }
    const hyperplanCases = hyperplanDegradedDefectCases()
    if (hyperplanCases.length === 0) {
      problems.push('fabricated hyperplan-degraded-noted: the defect list is EMPTY — the banner would attest to nothing')
    }
    for (const [label, mutate, expectedCheck] of hyperplanCases) {
      const input = fabricatedHyperplanInput(routes)
      mutate(input)
      const verdict = analyzeHyperplanDegradedNoted(input, routes)
      if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
        problems.push(`fabricated hyperplan-degraded-noted defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
      }
    }
    HYPERPLAN_SELF_TEST_ATTESTATION.push(...hyperplanCases.map(([label]) => ['hyperplan-degraded-noted', label]))
  }

  // ── P4-T15 ulw-plan-loads-prometheus-skill self-test. The good input must PASS,
  // then every named defect must FAIL on its own named check.
  {
    const goodGesture = analyzeUlwPlanLoadsPrometheusSkill(fabricatedUlwPlanInput(routes), routes)
    if (goodGesture.result !== 'PASS') {
      problems.push(`fabricated GOOD ulw-plan-loads-prometheus-skill must PASS, got FAIL on: ${goodGesture.failed.join(', ')}`)
    }
    const gestureCases = ulwPlanGestureDefectCases()
    if (gestureCases.length === 0) {
      problems.push('fabricated ulw-plan-loads-prometheus-skill: the defect list is EMPTY — the banner would attest to nothing')
    }
    for (const [label, mutate, expectedCheck] of gestureCases) {
      const input = fabricatedUlwPlanInput(routes)
      mutate(input)
      const verdict = analyzeUlwPlanLoadsPrometheusSkill(input, routes)
      if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
        problems.push(`fabricated ulw-plan-loads-prometheus-skill defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
      }
    }
    ULW_PLAN_SELF_TEST_ATTESTATION.push(...gestureCases.map(([label]) => ['ulw-plan-loads-prometheus-skill', label]))
  }

  // ── P4-T7 command-channel pilot self-test. Both specs run the SAME defect
  // list against their own fabricated good input: the channel properties under
  // test (admission, the lifecycle pair, the own-turn wiring, the admission-miss
  // zero-event semantics) are identical for an argument-bearing and a
  // no-argument command, so the cases are stated once and applied twice.
  for (const [scenarioName, spec] of Object.entries(COMMAND_CHANNEL_SPECS)) {
    const analyze = (input) => analyzeCommandChannelDriven(input, spec, routes)
    const good = analyze(fabricatedCommandChannelInput(spec, routes))
    if (good.result !== 'PASS') {
      problems.push(`fabricated GOOD ${scenarioName}-driven must PASS, got FAIL on: ${good.failed.join(', ')}`)
    }
    // NB the explicit call: an earlier scenario's `defectCases` is in the SAME
    // function scope, so relying on the name would silently run hello's cases.
    const defectCases = commandChannelDefectCases(spec)
    for (const [label, mutate, expectedCheck] of defectCases) {
      const input = fabricatedCommandChannelInput(spec, routes)
      mutate(input)
      const verdict = analyze(input)
      if (verdict.result !== 'FAIL' || !verdict.failed.includes(expectedCheck)) {
        problems.push(`fabricated ${scenarioName}-driven defect "${label}" must FAIL with ${expectedCheck}, got ${verdict.result} (${verdict.failed.join(', ')})`)
      }
    }
  }

  // ── P2-T18 MOCKROLE landing (hermetic, real template + real renderers).
  problems.push(...await runMockRoleLandingSelfTest())
  return problems
}


/**
 * The P4-T13 portion of the self-test banner, BUILT FROM WHAT ACTUALLY RAN.
 *
 * The banner used to be a hand-maintained string listing every scenario and
 * every fabricated defect. That is a second copy of the case list, and it drifted
 * immediately: a defect case was added whose label never reached the banner, so
 * the suite printed a self-test attestation that was quietly incomplete — the
 * worst possible failure mode for the line whose entire job is to say what was
 * proven. Every keyword case now pushes its (scenario, label) here as it runs,
 * and the banner renders from this list, so the two cannot disagree.
 */
const KEYWORD_SELF_TEST_ATTESTATION = []
// P4-T9's own attestation, same shape: filled by the self-test loop, read by the banner.
const STOP_SELF_TEST_ATTESTATION = []
// P4-T11's, same shape: the banner is rendered FROM what ran, never hand-typed.
const ULW_COMMAND_SELF_TEST_ATTESTATION = []
const HYPERPLAN_SELF_TEST_ATTESTATION = []
const ULW_PLAN_SELF_TEST_ATTESTATION = []

// ══ P3-T17 ulw-execute: the A-mode activation scenarios (TWO) ════════════════
//
// The activation signal is a CONJUNCTION (identity AND work-plan intent), so it
// is proven by two scenarios whose ONLY difference is which conjunct fails —
// each with its OWN mock server, hence its own per-role cursor:
//
//   1. `ulw-execute-activated` — ONE turn, ONE batch, TWO continuable
//      delegations, BOTH carrying work-plan intent:
//        (a) TRIGGER `atlas` → identity ✓ + intent ✓ → the listener reads the
//            child's own `omo-atlas` descriptor persona, builds the
//            plan-discovery/work-context document from the sandbox's
//            `.omo/plans/alpha.md`, and `agent.inject()`s it;
//        (b) 对照 `explore` → identity ✗ (intent ✓) → NOTHING is injected.
//   2. `ulw-execute-no-intent` — ONE turn, ONE continuable `atlas` delegation
//      with a NON-plan task: identity ✓ + intent ✗ → NOTHING is injected, and
//      the plan selection (hence the notepad scaffold) never runs.
//
// WHY TWO SCENARIOS AND NOT TWO ATLAS CHILDREN IN ONE: the mock server's cursor
// is PER ROLE (`mock-llm-server.mjs` header: "two concurrent agent loops sharing
// the same role on one server interleave on the same cursor"). A second atlas
// child inside the same server would consume the trigger lane's later steps, so
// "same lane, same script, intent removed" could not be isolated. A separate
// scenario gets a fresh cursor, which makes scenario 2 exactly that control.
// (An earlier one-scenario draft with both atlas children passed ONCE and then
// failed on `noInjectionWithoutWorkIntent` for precisely this reason.)
//
// ⚠️ MEASURED CONSTRAINT (the H-26 boundary, reused here): the atlas identity is
// the child's own durable `subagent/descriptor.persona`, which is persisted ONLY
// for `mode: 'continuable'` children — hence `run_in_background: true` on every
// delegation. A foreground atlas delegation carries no persona and the gate
// stays silent (recorded as a coverage boundary in the listener header).
//
// The injected context lands one pre-step AFTER the child's first (the documented
// `agent.inject()` semantics: "may miss a request whose pre-step already claimed
// its batch"), which is why the trigger's atlas lane sees TWO mock requests while
// explore sees ONE — that step count is itself a runtime-observed carrier of the
// injection (assertion `injectedContextReachedTheChild`).

/** The atlas-lane work-plan intent (must hit WORK_INTENT_MARKERS). */
const ULW_EXECUTE_ATLAS_TASK =
  'start work on the plan in .omo/plans: read it and begin execution'
/**
 * Scenario 2's task: an ATLAS delegation with NO work-plan intent (the intent
 * conjunct alone is false; the identity conjunct is true).
 */
const ULW_EXECUTE_NO_INTENT_TASK = 'summarize the repository layout in three sentences'
/** The 对照 explore task: plan-ish words but a NON-atlas identity. */
const ULW_EXECUTE_EXPLORE_TASK = 'start work on the plan and report what you would do'
const ULW_EXECUTE_PROMPT =
  'e2e ulw-execute-activated: delegate the work session to atlas, then summarize'
const ULW_EXECUTE_NO_INTENT_PROMPT =
  'e2e ulw-execute-no-intent: delegate a plain summary to atlas'
const ULW_EXECUTE_CONDUCTOR_SUMMARY =
  'MOCK-ULW-EXECUTE-SUMMARY-5c31f7: delegated the work session and the control'
const ULW_EXECUTE_NO_INTENT_CONDUCTOR_SUMMARY =
  'MOCK-ULW-EXECUTE-NO-INTENT-SUMMARY-6a21d8: delegated the plain summary'
const ULW_EXECUTE_ATLAS_CHILD_NOTE =
  'MOCK-ULW-EXECUTE-ATLAS-NOTE-1d90ae: executing the plan'
/** The trigger child's SECOND step (opened by the injected context). */
const ULW_EXECUTE_ATLAS_CHILD_SECOND_NOTE =
  'MOCK-ULW-EXECUTE-ATLAS-NOTE-2-7f4b19: continuing with the injected plan context'
const ULW_EXECUTE_NO_INTENT_NOTE =
  'MOCK-ULW-EXECUTE-NO-INTENT-NOTE-8b72c4: summarized the layout'
const ULW_EXECUTE_EXPLORE_NOTE =
  'MOCK-ULW-EXECUTE-EXPLORE-NOTE-2f6e05: would read the plan'
/** The plan the sandbox seeds (ONE incomplete plan → the auto-select branch). */
const ULW_EXECUTE_PLAN_NAME = 'alpha'
const ULW_EXECUTE_PLAN_REL = `.omo/plans/${ULW_EXECUTE_PLAN_NAME}.md`
const ULW_EXECUTE_PLAN_CONTENT =
  '# Alpha plan\n\n## TODOs\n- [ ] 1. First task\n- [ ] 2. Second task\n'
/** The injected context's own sentinel (from the REAL renderer, not hand-built). */
const { AUTO_SELECTED_PLAN_HEADING } = await (async () => {
  const { buildAutoSelectedPlanContextInfoOnly, planProgressFromMarkdown } = await import(
    new URL('../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/plan-discovery.ts', import.meta.url).href
  )
  const text = buildAutoSelectedPlanContextInfoOnly({
    planPath: `/e2e/${ULW_EXECUTE_PLAN_REL}`,
    planProgress: planProgressFromMarkdown(ULW_EXECUTE_PLAN_CONTENT),
    sessionId: 'ses_sentinel',
    timestamp: 'T',
    worktreeBlock: '',
  })
  // P3-T17 round-2 review NIT-b: this IIFE used to ALSO return
  // `PLAN_DISCOVERY_NO_PLANS_HEADING: '## No Plans Found'` — a dead binding no
  // analyzer read. Removed rather than asserted: this driver proves the
  // AUTO-SELECTED branch (the sandbox seeds exactly ONE incomplete plan), so there
  // is no no-plans render here to compare against, and the `## No Plans Found`
  // heading already has a documented audit anchor in the module under test
  // (`buildStaticTextBlocks().noPlansBlock`, ulw-execute/context-builder.ts:81/:98).
  return { AUTO_SELECTED_PLAN_HEADING: text.trim().split('\n')[0] }
})()
// P4-T11 adds the TEMPLATE side of the same R-10 contract, imported from the
// SHIPPED omo-hooks module and the SHIPPED omo-commands template — so "the
// marker" is one value read by both packages, and the driver never holds a
// paraphrase of it. The cross-package equality the single suites pin is what
// makes this legitimate; the scenario then observes the RUNTIME producing it.
const {
  ULW_EXECUTE_CONTEXT_MARKER: E2E_ULW_CONTEXT_MARKER,
  ULW_EXECUTE_PLUGIN: E2E_ULW_PLUGIN,
  ULW_EXECUTE_ID,
  TEMPLATE_HEADER_MARKER: E2E_TEMPLATE_HEADER_MARKER,
  NOTEPAD_FOOTER: E2E_ULW_NOTEPAD_FOOTER,
  UPSTREAM_NOTEPAD_FOOTER: E2E_ULW_UPSTREAM_NOTEPAD_FOOTER,
  TEMPLATE_SESSION_CONTEXT_OPEN: E2E_SESSION_CONTEXT_OPEN,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/constants.ts', import.meta.url).href
)
// P4-T11's fabricated context also comes from the REAL renderer, for the same
// reason the P3-T17 sentinel did: the defect cases must mutate a line the
// runtime produces, not a hand-written paraphrase of it.
const { buildAutoSelectedPlanContextInfoOnly, planProgressFromMarkdown } = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/plan-discovery.ts', import.meta.url).href
)
// H-32's own gate, so the scenario asserts the shipped function's verdict rather
// than re-implementing the two-marker conjunction.
const { hasCommandTemplateMarker } = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute.ts', import.meta.url).href
)
const {
  ULW_EXECUTE_DESCRIPTION,
  renderUlwExecuteInstruction: renderUlwExecuteInstructionFn,
} = await import(
  new URL('../../patches/omo-dsh/omo-commands/src/commands/ulw-execute.ts', import.meta.url).href
)
// The template and the hint live in the templates module; the command module
// only CONSUMES them (it does not re-export), so the driver reads them where they
// are defined rather than from a wrapper.
const {
  ULW_EXECUTE_COMMAND_TEMPLATE,
  ULW_EXECUTE_ARGUMENT_HINT,
} = await import(
  new URL('../../patches/omo-dsh/omo-commands/src/templates/ulw-execute.ts', import.meta.url).href
)
const { renderCommandTemplate } = await import(
  new URL('../../patches/omo-dsh/omo-commands/src/templates/render.ts', import.meta.url).href
)
// P4-T11: the command name the assertions spell out. Read from the SHIPPED naming
// anchor rather than typed: `ULW_EXECUTE_ID` is the v5 name that R-10's whole
// naming rests on (and H-32's hook id is an alias of it), so a rename upstream
// would turn every assertion here red instead of silently testing a name nothing
// registers. The omo-commands registry row carries the same string; there is no
// exported constant for that row, so this anchor is the closest single source
// that both packages already agree on.
const ULW_EXECUTE_COMMAND_NAME = ULW_EXECUTE_ID
// The marker task text the CONDUCTOR hands to atlas is built with THIS session
// id and timestamp, so the fixture's own markers are substituted (a raw
// `$SESSION_ID` would not be a template product).
const ULW_EXECUTE_MARKER_SESSION_ID = 'session-fabricated-ulw-command-marker'
const ULW_EXECUTE_MARKER_TIMESTAMP = '2026-10-01T09:15:00.000Z'

/**
 * Scenario 1's script: ONE batch with the atlas TRIGGER and the explore 对照
 * (each lane has exactly ONE consumer, so no cursor sharing), then the summary
 * that closes the conductor's turn.
 */
function ulwExecuteActivatedScript(_sandbox) {
  return {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: [
          {
            name: 'atlas',
            arguments: {
              description: 'Run the work session',
              prompt: ULW_EXECUTE_ATLAS_TASK,
              run_in_background: true,
            },
          },
          {
            name: 'explore',
            arguments: {
              description: 'Plan-adjacent control',
              prompt: ULW_EXECUTE_EXPLORE_TASK,
              run_in_background: true,
            },
          },
        ],
      },
      { type: 'text', text: ULW_EXECUTE_CONDUCTOR_SUMMARY },
    ],
    atlas: [
      // Step 1 (the delegation prompt) and step 2 (the INJECTED context claimed
      // at the next pre-step) — the child needs both lanes' steps, because the
      // injection opens a second step.
      { type: 'text', text: ULW_EXECUTE_ATLAS_CHILD_NOTE },
      { type: 'text', text: ULW_EXECUTE_ATLAS_CHILD_SECOND_NOTE },
    ],
    explore: [
      { type: 'text', text: ULW_EXECUTE_EXPLORE_NOTE },
    ],
  }
}

/**
 * Scenario 2's script: ONE batch with a single `atlas` delegation whose task
 * carries NO work-plan intent. Its lane has exactly one consumer, so the single
 * scripted step is the whole child turn — and because the listener stays silent
 * there is no second step to serve.
 */
function ulwExecuteNoIntentScript(_sandbox) {
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'atlas',
        arguments: {
          description: 'No-intent atlas delegation',
          prompt: ULW_EXECUTE_NO_INTENT_TASK,
          run_in_background: true,
        },
      },
      { type: 'text', text: ULW_EXECUTE_NO_INTENT_CONDUCTOR_SUMMARY },
    ],
    atlas: [
      { type: 'text', text: ULW_EXECUTE_NO_INTENT_NOTE },
    ],
  }
}

/** The real sandbox disk facts this scenario asserts. */
function ulwExecuteDiskFacts(sandbox) {
  const notepadDir = join(sandbox.project, '.omo', 'notepads', ULW_EXECUTE_PLAN_NAME)
  const notepadFiles = ['learnings.md', 'decisions.md', 'issues.md', 'problems.md']
  const present = notepadFiles.filter((name) => existsSync(join(notepadDir, name)))
  const learningsPath = join(notepadDir, 'learnings.md')
  return {
    planPath: join(sandbox.project, ULW_EXECUTE_PLAN_REL),
    notepadDir,
    notepadPresent: present,
    notepadLearnings: existsSync(learningsPath) ? readFileSync(learningsPath, 'utf8') : undefined,
  }
}

/**
 * Waits until BOTH background children have really run their turns and the
 * notepad scaffold has landed (the injection's side effect). Returns false on
 * timeout so the analysis reports the honest FAIL.
 *
 * The scenario delegates exactly TWO continuable children — the atlas TRIGGER
 * (`Run the work session`) and the explore 对照 (`Plan-adjacent control`), see
 * `ulwExecuteActivatedScript`/`analyzeUlwExecuteActivated`, which already keys on
 * those same two labels. This helper therefore keys on the children's own durable
 * `subagent/descriptor.label` rather than on a child COUNT: the previous
 * `children.length >= 3 && completed.length >= 3` was never reachable (the durable
 * logs hold exactly these two, re-measured for the P3-T17 review 质疑③: max 2
 * subagent sessions observed over a full run, final state 2), so it only burned
 * the whole timeout; and a bare count would also let an unrelated or duplicated
 * session satisfy the wait for the wrong reason. Each named child must have
 * completed its turn, and the notepad scaffold must exist.
 */
async function awaitUlwExecuteChildren(boot, sandbox, sessionId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  const notepadLearnings = join(
    sandbox.project,
    '.omo',
    'notepads',
    ULW_EXECUTE_PLAN_NAME,
    'learnings.md',
  )
  const completedChildWithLabel = (children, label) =>
    children.some((child) => {
      const events = child.events ?? []
      const descriptor = events.find((event) => event.type === 'subagent/descriptor')
      if (descriptor?.data?.label !== label) return false
      return events.some(
        (event) => event.type === 'turn/end' && event.data?.reason?.kind === 'completed',
      )
    })
  while (Date.now() < deadline) {
    const logs = findSessionLogs(join(sandbox.dshHome, 'sessions'))
    const children = logs.filter(
      (candidate) =>
        candidate.header.origin === 'subagent'
        && String(candidate.header.parentSession) === String(sessionId),
    )
    if (
      completedChildWithLabel(children, 'Run the work session')
      && completedChildWithLabel(children, 'Plan-adjacent control')
      && existsSync(notepadLearnings)
    ) {
      return true
    }
    await sleep(250)
  }
  return false
}

/**
 * Scenario 2's settle hook: wait until the single atlas child has finished its
 * turn. There is no scaffold to wait for (that is the point of the scenario).
 */
async function awaitUlwExecuteNoIntentChild(boot, sandbox, sessionId, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const logs = findSessionLogs(join(sandbox.dshHome, 'sessions'))
    const child = logs.find(
      (candidate) =>
        candidate.header.origin === 'subagent'
        && String(candidate.header.parentSession) === String(sessionId),
    )
    const childDone = (child?.events ?? []).some(
      (event) => event.type === 'turn/end' && event.data?.reason?.kind === 'completed',
    )
    if (child !== undefined && childDone) return true
    await sleep(250)
  }
  return false
}

/**
 * The `ulw-execute-activated` assertions (H-32). Every identity fact is read
 * back OUT of the children's own durable descriptors — the same surface the
 * listener reads — so "the hook fired for atlas" cannot be a synthetic claim:
 * without that persona AND the intent text the gate would have stayed silent
 * and the injection assertions would fail.
 */
export function analyzeUlwExecuteActivated(
  {
    log,
    allLogs,
    requests,
    providersJson,
    bootLog,
    planPath,
    notepadPresent,
    notepadLearnings,
  },
  routes,
) {
  const events = log?.events ?? []
  const parentId = log?.header?.id
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const atlasRequests = requests.filter((request) => request.role === 'atlas')
  const exploreRequests = requests.filter((request) => request.role === 'explore')

  // The two children, linked to their delegation by the descriptor label.
  const childLogs = Array.isArray(allLogs)
    ? allLogs.filter(
        (candidate) =>
          candidate.header?.origin === 'subagent'
          && String(candidate.header?.parentSession) === String(parentId),
      )
    : []
  const childByLabel = new Map()
  for (const child of childLogs) {
    const descriptor = (child.events ?? []).find((event) => event.type === 'subagent/descriptor')
    const label = descriptor?.data?.label
    if (typeof label === 'string') childByLabel.set(label, child)
  }
  const triggerChild = childByLabel.get('Run the work session')
  const exploreControlChild = childByLabel.get('Plan-adjacent control')

  const childPersona = (child) => {
    const descriptor = (child?.events ?? []).find((event) => event.type === 'subagent/descriptor')
    const persona = descriptor?.data?.persona
    return typeof persona === 'string' ? persona : undefined
  }
  const injectedInto = (child) =>
    (child?.events ?? []).filter(
      (event) =>
        event.type === 'user/message'
        && (event.data?.content ?? []).some(
          (block) =>
            typeof block?.text === 'string' && block.text.includes(E2E_ULW_CONTEXT_MARKER),
        ),
    )
  const triggerInjected = injectedInto(triggerChild)
  const exploreControlInjected = injectedInto(exploreControlChild)
  const triggerText = triggerInjected
    .flatMap((event) => (event.data?.content ?? []).map((block) => block?.text ?? ''))
    .join('\n')
  const triggerSource = triggerInjected[0]?.data?.source
  const triggerRequestHasInjection = atlasRequests.some((request) =>
    JSON.stringify(request.body ?? {}).includes(E2E_ULW_CONTEXT_MARKER))

  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    // The ONE batch really held both delegations, and each lane really ran.
    delegationBatchDispatched:
      sisyphusRequests.length >= 2 && atlasRequests.length >= 2 && exploreRequests.length >= 1,
    twoChildrenObserved: childLogs.length >= 2,
    // IDENTITY: the trigger child is the atlas row (its own durable persona),
    // and the 对照 child is NOT.
    atlasPersonaObservable:
      typeof childPersona(triggerChild) === 'string'
      && childPersona(triggerChild).includes('omo-atlas'),
    exploreControlHasNoAtlasPersona:
      childPersona(exploreControlChild) !== undefined
      && !childPersona(exploreControlChild).includes('omo-atlas'),
    // TRIGGER: the injected context landed in the atlas child's own durable log,
    // carries the marker + the plugin source contract, names the sandbox plan,
    // and reached that child's model request.
    injectedContextReachedTheChild:
      triggerInjected.length === 1
      && triggerText.includes(`${AUTO_SELECTED_PLAN_HEADING}`)
      && triggerText.includes(`**Path**: ${planPath}`)
      && triggerText.includes('**Plan**: alpha'),
    injectionSourceContract:
      triggerSource?.kind === 'plugin'
      && triggerSource?.plugin === E2E_ULW_PLUGIN
      && triggerSource?.form === 'instructions',
    injectionReachedTheModel: triggerRequestHasInjection,
    // The atlas LANE issued more than one request — the injection's step boundary.
    //
    // P4-T16 renamed this. It read `atlasLaneTookASecondStep`, which claims a
    // per-child step; the mock's request cursor advances by ROLE, so both children
    // draw from the same `atlas` lane and nothing here can attribute a request to
    // one child. The name now says what is actually measured, and matches T11's
    // identically-shaped assertion. (T11's side carried a comment pointing at this
    // sweep; that comment is updated below.)
    atlasLaneMadeMoreThanOneRequest: atlasRequests.length >= 2,
    // 对照: a NON-atlas identity with plan-ish words → nothing injected.
    noInjectionForSiblingIdentity: exploreControlInjected.length === 0,
    // The scaffold side effect of the plan selection landed in the sandbox.
    notepadScaffoldLanded: notepadPresent.length === 4,
    notepadFooterRewritten:
      typeof notepadLearnings === 'string'
      && notepadLearnings.includes('Auto-scaffolded by ulw-execute')
      && !notepadLearnings.includes('/start-work'),
    // The conductor's own pre-steps carry NO injection (not a delegation).
    conductorNotInjected:
      !events.some(
        (event) =>
          event.type === 'user/message'
          && (event.data?.content ?? []).some(
            (block) =>
              typeof block?.text === 'string' && block.text.includes(E2E_ULW_CONTEXT_MARKER),
          ),
      ),
    turnCompleted: turnCompleted(events),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      childCount: childLogs.length,
      triggerInjectionCount: triggerInjected.length,
      exploreControlInjectionCount: exploreControlInjected.length,
      atlasRequestCount: atlasRequests.length,
      exploreRequestCount: exploreRequests.length,
      notepadPresent,
      triggerInjectionTail: triggerText.slice(-240),
    },
  }
}

/** The listener's own log-line prefix (its skip/registration diagnostics). */
const ULW_EXECUTE_ID_LOG_PREFIX = '[omo-hooks] ulw-execute: '

/**
 * Scenario 2's assertions (`ulw-execute-no-intent`): the identity conjunct is
 * TRUE (an atlas child, asserted from its own descriptor) and the intent
 * conjunct is FALSE, so the listener must stay silent — no injected message in
 * the child, no second step, and no plan selection (hence no notepad).
 */
export function analyzeUlwExecuteNoIntent(
  { log, allLogs, requests, providersJson, bootLog, planFilePath, notepadAbsent, planFileExists },
  routes,
) {
  const events = log?.events ?? []
  const parentId = log?.header?.id
  const atlasRequests = requests.filter((request) => request.role === 'atlas')
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const childLogs = Array.isArray(allLogs)
    ? allLogs.filter(
        (candidate) =>
          candidate.header?.origin === 'subagent'
          && String(candidate.header?.parentSession) === String(parentId),
      )
    : []
  const child = childLogs[0]
  const descriptor = (child?.events ?? []).find((event) => event.type === 'subagent/descriptor')
  const persona = typeof descriptor?.data?.persona === 'string' ? descriptor.data.persona : undefined
  const markerCarriers = (child?.events ?? []).filter(
    (event) =>
      event.type === 'user/message'
      && (event.data?.content ?? []).some(
        (block) => typeof block?.text === 'string' && block.text.includes(E2E_ULW_CONTEXT_MARKER),
      ),
  )
  const injectedReached = atlasRequests.some((request) =>
    JSON.stringify(request.body ?? {}).includes(E2E_ULW_CONTEXT_MARKER))
  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    oneChildObserved: childLogs.length >= 1,
    // The identity conjunct really held — otherwise this control would be
    // vacuous (a silent listener for an unknown session proves nothing).
    atlasPersonaObservable: persona !== undefined && persona.includes('omo-atlas'),
    // The delegation's own task text really is the NO-INTENT one (the control
    // would be vacuous if the recorded task happened to be the trigger's).
    workIntentTaskRecorded: (child?.events ?? [])
      .filter((event) => event.type === 'user/message')
      .flatMap((event) => (event.data?.content ?? []).map((block) => block?.text ?? ''))
      .join('\n')
      .includes(ULW_EXECUTE_NO_INTENT_TASK),
    // THE ASSERTION: no injection, in the log or on the wire.
    noInjectionWithoutWorkIntent: markerCarriers.length === 0 && !injectedReached,
    // No work-session job was registered for this session (the scaffold/job
    // half of the plan selection never ran). The listener's own diagnostic line
    // is absent AND the boot log carries no `work session` registration.
    // NOTE: the raw atlas LANE request count is NOT usable as a "one step" proof
    // — the harness issues a separate title call, and the child legitimately
    // takes a second step when `omo-agents`' hard-blocks injection is delivered.
    // The injection carrier assertions above are the load-bearing ones.
    noWorkSessionRegistered:
      !String(bootLog ?? '').includes(`${ULW_EXECUTE_ID_LOG_PREFIX}work session`)
      && String(bootLog ?? '').includes(`${ULW_EXECUTE_ID_LOG_PREFIX}skipped: no-work-intent`),
    childTurnCompleted:
      (child?.events ?? []).some(
        (event) => event.type === 'turn/end' && event.data?.reason?.kind === 'completed',
      ),
    noPlanSelectionSideEffect: notepadAbsent === true,
    planFileUntouched: planFileExists === true,
    mockSawTheDelegation: sisyphusRequests.length >= 2,
    turnCompleted: turnCompleted(events),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      childCount: childLogs.length,
      markerCarrierCount: markerCarriers.length,
      atlasRequestCount: atlasRequests.length,
      childNoteRecorded: (child?.events ?? []).some(
        (event) =>
          event.type === 'assistant/message'
          && JSON.stringify(event.data ?? {}).includes(ULW_EXECUTE_NO_INTENT_NOTE),
      ),
    },
  }
}

/** The real sandbox disk facts scenario 2 asserts. */
function ulwExecuteNoIntentDiskFacts(sandbox) {
  const planFilePath = join(sandbox.project, ULW_EXECUTE_PLAN_REL)
  return {
    planFilePath,
    planFileExists: existsSync(planFilePath),
    notepadAbsent: !existsSync(join(sandbox.project, '.omo', 'notepads', ULW_EXECUTE_PLAN_NAME)),
  }
}

/** One fabricated GOOD `ulw-execute-activated` input (mutation QA target). */
const FABRICATED_ULW_PROJECT = '/fabricated/project'
const FABRICATED_ULW_PLAN_PATH = `${FABRICATED_ULW_PROJECT}/.omo/plans/alpha.md`
const FABRICATED_ULW_TRIGGER_ID = 'session-fabricated-ulw-trigger'
const FABRICATED_ULW_EXPLORE_CONTROL_ID = 'session-fabricated-ulw-explore-control'
const FABRICATED_ULW_NO_INTENT_ID = 'session-fabricated-ulw-no-intent'
const FABRICATED_ULW_INJECTED_TEXT = `\n\n---\n${E2E_ULW_CONTEXT_MARKER}\n${AUTO_SELECTED_PLAN_HEADING}
**Plan**: alpha
**Path**: ${FABRICATED_ULW_PLAN_PATH}
**Progress**: 0/2 tasks
**Session ID**: ${FABRICATED_ULW_TRIGGER_ID}
**Started**: 2026-05-11T00:00:00.000Z

boulder.json has been created. Read the plan and begin execution.`

function fabricatedUlwChildLog(id, label, persona, note, taskText, injectedText) {
  const events = [
    {
      seq: 0,
      type: 'subagent/descriptor',
      data: { version: 3, mode: 'continuable', provider: 'spawn', label, persona },
    },
    // The child's OWN initial task message (the delegation prompt), exactly the
    // carrier the listener reads for its work-intent gate.
    {
      seq: 1,
      type: 'user/message',
      data: { content: [{ type: 'text', text: taskText }], source: { kind: 'user' } },
    },
  ]
  if (injectedText !== undefined) {
    // The injection carrier: the `source` triple is what `injectionSourceContract`
    // reads; the real runtime records it on the user message.
    events.push({
      seq: 2,
      type: 'user/message',
      data: {
        content: [{ type: 'text', text: injectedText }],
        source: { kind: 'plugin', plugin: E2E_ULW_PLUGIN, form: 'instructions' },
      },
    })
  }
  events.push(
    { seq: 3, type: 'step/start', data: { turn: 1, step: 1 } },
    {
      seq: 4,
      type: 'assistant/message',
      data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: note }] } },
    },
    { seq: 5, type: 'step/end', data: { turn: 1, step: 1 } },
    { seq: 6, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  )
  return {
    path: `/fabricated/${id}/session.jsonl`,
    header: {
      type: 'session',
      id,
      origin: 'subagent',
      parentSession: FABRICATED_PARENT_ID,
      delegationDepth: 1,
    },
    events,
  }
}

function fabricatedUlwExecuteInput(routes) {
  const triggerChild = fabricatedUlwChildLog(
    FABRICATED_ULW_TRIGGER_ID,
    'Run the work session',
    'You are **omo-atlas**, the master orchestrator.',
    ULW_EXECUTE_ATLAS_CHILD_NOTE,
    ULW_EXECUTE_ATLAS_TASK,
    FABRICATED_ULW_INJECTED_TEXT,
  )
  const exploreControlChild = fabricatedUlwChildLog(
    FABRICATED_ULW_EXPLORE_CONTROL_ID,
    'Plan-adjacent control',
    'You are **omo-explore**, a search agent.',
    ULW_EXECUTE_EXPLORE_NOTE,
    ULW_EXECUTE_EXPLORE_TASK,
    undefined,
  )
  const log = {
    path: '/fabricated/ulw-execute/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: ULW_EXECUTE_PROMPT }] } },
      fabricatedToolResultEvent(2, 'mock-llm-tool-1-0', `started subagent ${FABRICATED_ULW_TRIGGER_ID}`),
      fabricatedToolResultEvent(3, 'mock-llm-tool-1-1', `started subagent ${FABRICATED_ULW_EXPLORE_CONTROL_ID}`),
      { seq: 4, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: ULW_EXECUTE_CONDUCTOR_SUMMARY }] } } },
      { seq: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
  const request = (role, model, messages, receivedAt) => ({ role, body: { model, messages }, receivedAt })
  return {
    log,
    allLogs: [log, triggerChild, exploreControlChild],
    requests: [
      request('sisyphus', routes.sisyphus.model, [{ role: 'system', content: 'MOCKROLE=sisyphus' }], 10),
      request('atlas', routes.atlas.model, [{ role: 'system', content: 'MOCKROLE=atlas' }], 20),
      request('explore', routes.explore.model, [{ role: 'system', content: 'MOCKROLE=explore' }], 30),
      request('atlas', routes.atlas.model, [
        { role: 'system', content: 'MOCKROLE=atlas' },
        { role: 'user', content: FABRICATED_ULW_INJECTED_TEXT },
      ], 40),
      request('sisyphus', routes.sisyphus.model, [
        { role: 'system', content: 'MOCKROLE=sisyphus' },
        { role: 'user', content: `tool result: ${ULW_EXECUTE_ATLAS_CHILD_NOTE}` },
      ], 50),
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
    planPath: FABRICATED_ULW_PLAN_PATH,
    notepadPresent: ['learnings.md', 'decisions.md', 'issues.md', 'problems.md'],
    notepadLearnings: '# Learnings \u2014 alpha\n\n_Auto-scaffolded by ulw-execute. Append new entries below - never overwrite._\n\n---\n',
  }
}

/**
 * One fabricated GOOD `ulw-execute-no-intent` input. The identity surface is a
 * real atlas persona; the ONLY thing missing is the work-plan intent, so every
 * "no injection" assertion is earned by the intent gate alone.
 */
function fabricatedUlwExecuteNoIntentInput(routes) {
  const child = fabricatedUlwChildLog(
    FABRICATED_ULW_NO_INTENT_ID,
    'No-intent atlas delegation',
    'You are **omo-atlas**, the master orchestrator.',
    ULW_EXECUTE_NO_INTENT_NOTE,
    ULW_EXECUTE_NO_INTENT_TASK,
    undefined,
  )
  const log = {
    path: '/fabricated/ulw-execute-no-intent/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: ULW_EXECUTE_NO_INTENT_PROMPT }] } },
      fabricatedToolResultEvent(2, 'mock-llm-tool-1', `started subagent ${FABRICATED_ULW_NO_INTENT_ID}`),
      { seq: 3, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: ULW_EXECUTE_NO_INTENT_CONDUCTOR_SUMMARY }] } } },
      { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
  return {
    log,
    allLogs: [log, child],
    requests: [
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 10 },
      { role: 'atlas', body: { model: routes.atlas.model }, receivedAt: 20 },
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 30 },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: `${FABRICATED_BOOT_LOG}\n${ULW_EXECUTE_ID_LOG_PREFIX}skipped: no-work-intent`,
    planFilePath: FABRICATED_ULW_PLAN_PATH,
    planFileExists: true,
    notepadAbsent: true,
  }
}

// ── scenario definitions ─────────────────────────────────────────────────────
// Each scenario runs fully isolated: its own sandbox, its own mock server
// (per-role cursors stay scenario-scoped), its own dsh boot. `roles` lists
// the MOCKROLE markers to deliver into the materialized preset; `env` is the
// scenario's OMO_<AGENT>_* seat overlay (P2-T18; resolved through the SAME
// resolveModelRoutes the spawned dsh runs, so settings/agentOptions and the
// assertions share one source); `seed` runs before the mock starts (fixtures
// the script points at); `script(sandbox)` builds the mock script (absolute
// fixture paths need the sandbox); `augmentMaterialized(sandbox)` (P3-T13) runs
// AFTER boot and BEFORE the session is created, for a scenario that must adjust
// the sandbox-owned materialized preset the session composes from
// ('background-notification-log' flips one delegation row to the one-shot
// background mode); `settle(boot, sandbox, sessionId)` runs after the last
// turn/end and before `stopDsh` freezes the observations.
//
// ── P3-T16: THE 批 C B-MODE PAIR (plan §4.2 模式 B pilot + D) ─────────────────
// Two scenarios, each with a TRIGGER and a live 对照, asserted against
// RUNTIME-OBSERVED carriers only.
//
//   1. `webfetch-private-target-unprobed` (H-24; the PR #9 review F1 re-scope).
//      The B-mode pilot's ORIGINAL trigger was a loopback 302 chain that the
//      guard's own pre-resolution followed and denied. Review F1 showed that
//      pre-resolution was an SSRF: it pointed the host `fetch` at a model-chosen
//      URL BEFORE DSH's public-address policy ran, and the reviewer reproduced it
//      against a local 127.0.0.1 server. The guard now validates every hop (the
//      `resolvePublicAddresses` mirror + the native same-origin rule) BEFORE it
//      requests it, so a non-public destination is never probed and the B half
//      fails open. The scenario therefore asserts the NEW, stronger property,
//      with the same fixture and the same single-batch shape:
//        (a) the TRIGGER points at the loopback 302 fixture; the guard refuses to
//            probe it, the native provider refuses the literal address before
//            connecting, and the model sees the NATIVE error with NO guard marker;
//        (b) the CONTROL points at the same fixture's `/plain` route (200, no
//            Location) and behaves IDENTICALLY — the probe is gone for every hop,
//            redirecting or not;
//        (c) THE SSRF ASSERTION: the fixture observes ZERO HTTP requests. On the
//            pre-fix code it answered `/redirect-me` + `/final` (the guard's
//            manual loop) and `/plain` (the control's single probe).
//      MEASURED CONSTRAINT, recorded not hidden: the guard's live DENY path now
//      requires a same-origin PUBLIC redirect chain, which a hermetic mock-LLM
//      run cannot serve (no outbound internet, and loopback is non-public by
//      design). That path stays pinned by the unit suite
//      (tests/omo-hooks/webfetch-redirect-guard.test.ts) and is registered as a
//      residual on the H-24 row.
//
//   2. `prometheus-md-only-denied` (H-26). The identity/deny scenario:
//      the conductor delegates to the `prometheus` roster row (the child is a
//      real delegation with a real `subagent/descriptor`), the child issues
//      FOUR writes across two batches, and the conductor writes one file
//      itself:
//        (a) CHILD, non-`.md` outside `.omo`  → B deny (the trigger);
//        (b) CHILD, `.omo/plans/plan.md`       → allowed, and the post-execute
//            D half appends the workflow reminder (the second trigger);
//        (c) CHILD, `.omo/drafts/note.md`      → allowed, NO reminder (`.omo`
//            but not `plans/`);
//        (d) CONDUCTOR, a non-`.md` file       → allowed: the 对照 proving the
//            identity gate is prometheus-only (the conductor is not a
//            delegation child and has no descriptor).
//      REACHABILITY (the P3-T13 precedent, recorded in the scenario comment):
//      the shipped prometheus row is `class: 'read-only'`, so its
//      `toolFilter.deny` hides `write`/`edit` from the child entirely
//      (roster.ts denyToolNamesFor) and the gate would be structurally
//      unreachable. This scenario therefore lifts ONLY that row's `toolFilter`
//      in ITS OWN SANDBOX COPY of the materialized preset
//      (`enablePrometheusWriteTools` below) — the repo template and every other
//      scenario keep the shipped filter. The child's own `persona` (the
//      identity surface the listener reads) is untouched.
//
// THE DISK FACTS are computed in `analysisInput` (the `bigFixtureChars`
// precedent) rather than inside `analyze`, so the hermetic self-test can supply
// them as plain booleans while the real run reads the real sandbox.
const {
  WEBFETCH_REDIRECT_GUARD_MARKER,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/webfetch-redirect-guard.ts', import.meta.url).href
)
const {
  HOOK_NAME: PROMETHEUS_MD_ONLY_HOOK_NAME,
  PROMETHEUS_WORKFLOW_REMINDER,
  buildPrometheusDenyReason,
} = await import(
  new URL('../../patches/omo-dsh/omo-hooks/src/hooks/prometheus-md-only.ts', import.meta.url).href
)

const WEBFETCH_GUARD_REDIRECT_PATH = '/redirect-me'
const WEBFETCH_GUARD_FINAL_PATH = '/final'
const WEBFETCH_GUARD_PLAIN_PATH = '/plain'
const WEBFETCH_GUARD_PLAIN_BODY = 'MOCK-WEBFETCH-PLAIN-BODY-1f4a7c'
const WEBFETCH_GUARD_PROMPT =
  'e2e webfetch-private-target-unprobed: fetch both URLs in one batch, then summarize what came back'
const WEBFETCH_GUARD_SUMMARY =
  'MOCK-WEBFETCH-GUARD-SUMMARY-2c8e31: both fetches were refused by the provider without the guard speaking'

/**
 * The loopback redirect fixture. Three routes:
 *   `/redirect-me` → 302 to `/final`   (the TRIGGER — private, redirecting)
 *   `/final`       → 200 plain text    (the redirect target; must NEVER be hit)
 *   `/plain`       → 200 plain text    (the CONTROL — private, not redirecting)
 * Ephemeral port (listen 0), closed by runScenario's `finally`.
 *
 * `hits` records EVERY request the fixture answered. It is the scenario's SSRF
 * carrier: after review F1 the guard must not probe any of these routes, and the
 * native provider refuses the literal address before connecting, so the expected
 * value is the empty array.
 */
async function startWebfetchRedirectFixture() {
  const hits = []
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    hits.push(path)
    if (path === WEBFETCH_GUARD_REDIRECT_PATH) {
      response.writeHead(302, {
        location: WEBFETCH_GUARD_FINAL_PATH,
        'content-type': 'text/plain',
      })
      response.end()
      return
    }
    if (path === WEBFETCH_GUARD_FINAL_PATH || path === WEBFETCH_GUARD_PLAIN_PATH) {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end(WEBFETCH_GUARD_PLAIN_BODY)
      return
    }
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('not found')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  return {
    port,
    hits,
    redirectUrl: `http://127.0.0.1:${port}${WEBFETCH_GUARD_REDIRECT_PATH}`,
    finalUrl: `http://127.0.0.1:${port}${WEBFETCH_GUARD_FINAL_PATH}`,
    plainUrl: `http://127.0.0.1:${port}${WEBFETCH_GUARD_PLAIN_PATH}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/** The webfetch scenario's ONE batch: the trigger and the control. */
function webfetchRedirectScript(_sandbox, redirect) {
  return {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: [
          { name: 'web_fetch', arguments: { url: redirect.redirectUrl } },
          { name: 'web_fetch', arguments: { url: redirect.plainUrl } },
        ],
      },
      { type: 'text', text: WEBFETCH_GUARD_SUMMARY },
    ],
  }
}

/**
 * The `webfetch-private-target-unprobed` assertions (H-24; PR #9 review F1).
 * The scenario's own truth is the FIXTURE's request log plus the two real
 * `web_fetch` results the model received: the fixture is a real loopback server,
 * and the refusal text is the one dsh's native provider really produced.
 */
export function analyzeWebfetchPrivateTargetUnprobed(
  { log, requests, providersJson, bootLog, redirectUrl, plainUrl, fixtureHits },
  routes,
) {
  const events = log?.events ?? []
  const results = toolResultParts(events)
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const triggerCall = findToolCall(events, 'web_fetch', (args) => args.url === redirectUrl)
  const controlCall = findToolCall(events, 'web_fetch', (args) => args.url === plainUrl)
  const triggerResult = toolResultForCall(results, triggerCall)
  const controlResult = toolResultForCall(results, controlCall)
  const triggerText = triggerResult?.text ?? ''
  const controlText = controlResult?.text ?? ''
  const guardCarriers = results.filter((part) => part.text.includes(WEBFETCH_REDIRECT_GUARD_MARKER))
  const hits = Array.isArray(fixtureHits) ? fixtureHits : []
  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    // Both calls really ran in the model's own batch (the trigger is not a
    // synthetic construction: its arguments name the fixture URL).
    webFetchBatchDispatched: triggerCall !== undefined && controlCall !== undefined,
    // (c) THE SSRF ASSERTION (F1): the loopback fixture answered NOTHING. The
    // pre-fix guard's manual loop answered `/redirect-me` + `/final` for the
    // trigger and `/plain` for the control; today the guard refuses to probe a
    // non-public destination at all and the native provider refuses the literal
    // address before connecting.
    privateFixtureNeverProbed: hits.length === 0,
    // (a) TRIGGER: the guard did not speak and the refusal the model sees is the
    // NATIVE provider's address policy (the guard failed open by design).
    triggerReachedTheNativeAddressPolicy:
      triggerResult?.isError === true && triggerText.includes('non-public IP address'),
    triggerCarriesNoGuardMarker: !triggerText.includes(WEBFETCH_REDIRECT_GUARD_MARKER),
    // (b) CONTROL: the non-redirecting private URL behaves IDENTICALLY — the
    // probe is gone for every hop, redirecting or not.
    controlReachedTheNativeAddressPolicy:
      controlResult?.isError === true && controlText.includes('non-public IP address'),
    controlCarriesNoGuardMarker: !controlText.includes(WEBFETCH_REDIRECT_GUARD_MARKER),
    // The guard produced NO carrier at all: a marker here would mean the B half
    // denied a destination it must never even probe.
    guardNeverSpoke: guardCarriers.length === 0,
    mockSawTheBatchAndTheSummary: sisyphusRequests.length >= 2,
    turnCompleted: turnCompleted(events),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      redirectUrl: redirectUrl ?? null,
      plainUrl: plainUrl ?? null,
      fixtureHits: hits,
      triggerText,
      controlText,
      guardCarrierCount: guardCarriers.length,
      mockRequestCount: sisyphusRequests.length,
    },
  }
}

const PROMETHEUS_MD_ONLY_PROMPT =
  'e2e prometheus-md-only-denied: delegate the plan to prometheus, then write your own notes file, then summarize'
const PROMETHEUS_MD_ONLY_TASK = 'Write the plan file and the drafts note, and try the workspace file.'
const PROMETHEUS_MD_ONLY_CHILD_SUMMARY =
  'MOCK-PROMETHEUS-CHILD-SUMMARY-77c1a0: attempted the three writes and reported'
const PROMETHEUS_MD_ONLY_SUMMARY =
  'MOCK-PROMETHEUS-MD-ONLY-SUMMARY-4b9f2e: the child was refused the workspace file and allowed the plan'
// The four paths, relative to the sandbox project (the child's cwd is the
// parent's project directory — childSessionMeta copies the parent header).
const PROMETHEUS_DENY_TARGET_REL = 'workspace-open.txt'
const PROMETHEUS_PLANS_DIR = '.omo/plans'
const PROMETHEUS_PLANS_REL = '.omo/plans/plan.md'
const PROMETHEUS_DRAFTS_DIR = '.omo/drafts'
const PROMETHEUS_DRAFTS_REL = '.omo/drafts/note.md'
const PROMETHEUS_CONDUCTOR_REL = 'conductor-notes.txt'
const PROMETHEUS_PLANS_CONTENT = '# plan\nMOCK-PROMETHEUS-PLAN-BODY-3e7d51\n'
const PROMETHEUS_DRAFTS_CONTENT = '# note\nMOCK-PROMETHEUS-DRAFT-BODY-9a02bf\n'
const PROMETHEUS_CONDUCTOR_CONTENT = 'MOCK-CONDUCTOR-NOTES-BODY-6d1c48\n'

/**
 * Lift THIS scenario's sandbox copy of the materialized preset's prometheus
 * row's `toolFilter`. WHY A FIXTURE EDIT IS REQUIRED: the row is
 * `class: 'read-only'`, whose rendered `deny` list hides `write`/`edit` from
 * the child, so the listener under test would never see a write call. The edit
 * is SCENARIO-LOCAL (the sandbox's own DSH_HOME, the same file
 * `appendMockRoleMarker` edits) and touches NOTHING else: the persona, the
 * route and `maxDepth` stay as shipped, which is what keeps the identity gate
 * meaningful. Loud on drift: a template change that moves the row or its
 * `toolFilter`/`deny` lines throws here instead of silently turning the
 * scenario vacuous.
 */
function enablePrometheusWriteTools(sandbox) {
  const compositionPath = materializedCompositionPath(sandbox)
  const lines = readFileSync(compositionPath, 'utf8').split('\n')
  const rowAnchor = '    - id: tool-subagent-prometheus'
  const anchors = lines
    .map((line, index) => (line === rowAnchor ? index : -1))
    .filter((index) => index >= 0)
  if (anchors.length !== 1) {
    throw new Error(
      `prometheus-md-only scenario: materialized preset must carry `
      + `\`${rowAnchor}\` exactly once; found ${anchors.length}`,
    )
  }
  const rowIndex = anchors[0]
  const rowIndent = rowAnchor.length - rowAnchor.trimStart().length
  let filterIndex = -1
  for (let index = rowIndex + 1; index < lines.length; index++) {
    const line = lines[index]
    if (/^\s*- id: /.test(line) && line.length - line.trimStart().length <= rowIndent) break
    if (line === '        toolFilter:') {
      filterIndex = index
      break
    }
  }
  if (filterIndex < 0 || !lines[filterIndex + 1]?.startsWith('          deny: ')) {
    throw new Error(
      'prometheus-md-only scenario: the materialized prometheus row carries no '
      + '`        toolFilter:` + `          deny: […]` pair to lift',
    )
  }
  lines.splice(filterIndex, 2)
  writeFileSync(compositionPath, lines.join('\n'))
}

/**
 * The prometheus scenario's script. The conductor delegates to `prometheus`
 * BACKGROUND (`continuable`, so the child's per-child persona is durably recorded
 * in its descriptor — the gate's identity input — and the child's work is durable
 * before the conductor's own write step), then writes its OWN non-`.md` file,
 * then summarizes. The child runs TWO batches: the denied workspace write alone,
 * then the two allowed `.omo` writes (so the deny and the reminder are observed
 * on separate steps).
 */
function prometheusMdOnlyScript(sandbox) {
  const project = sandbox.project
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'prometheus',
        arguments: {
          description: 'Draft the plan',
          prompt: PROMETHEUS_MD_ONLY_TASK,
          // BACKGROUND (`continuable`) ON PURPOSE — see the section header's
          // identity-surface fact: only the continuable descriptor persists the
          // per-child persona, which IS the gate's identity input.
          run_in_background: true,
        },
      },
      {
        type: 'tool_calls',
        calls: [
          {
            name: 'write',
            arguments: {
              file_path: join(project, PROMETHEUS_CONDUCTOR_REL),
              content: PROMETHEUS_CONDUCTOR_CONTENT,
            },
          },
        ],
      },
      { type: 'text', text: PROMETHEUS_MD_ONLY_SUMMARY },
    ],
    prometheus: [
      {
        type: 'tool_call',
        name: 'write',
        arguments: {
          file_path: join(project, PROMETHEUS_DENY_TARGET_REL),
          content: 'this must never land\n',
        },
      },
      {
        type: 'tool_calls',
        calls: [
          {
            name: 'write',
            arguments: {
              file_path: join(project, PROMETHEUS_PLANS_REL),
              content: PROMETHEUS_PLANS_CONTENT,
            },
          },
          {
            name: 'write',
            arguments: {
              file_path: join(project, PROMETHEUS_DRAFTS_REL),
              content: PROMETHEUS_DRAFTS_CONTENT,
            },
          },
        ],
      },
      { type: 'text', text: PROMETHEUS_MD_ONLY_CHILD_SUMMARY },
    ],
  }
}

/**
 * The prometheus scenario's settle hook: the delegation is BACKGROUND, so the
 * parent's turn can close long before the child's is durable. Wait (inside the
 * observation window, before `stopDsh`) until the child session really carries
 * its three write results, BOTH allowed files are on disk, AND the child's own
 * `turn/end` with `completed` has landed. The turn/end clause is load-bearing:
 * the write results are durable while the child is still producing its closing
 * message, and `stopDsh` freezes it there — the first frozen-tree run tripped
 * exactly that race and reported `bothTurnsCompleted` false. A timeout returns
 * false and lets the analysis report the honest FAIL (never a crash).
 */
async function awaitPrometheusChildCompletion(boot, sandbox, sessionId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const logs = findSessionLogs(join(sandbox.dshHome, 'sessions'))
    const child = logs.find(
      (candidate) =>
        candidate.header.origin === 'subagent'
        && String(candidate.header.parentSession) === String(sessionId),
    )
    const childEvents = child?.events ?? []
    const written = toolResultParts(childEvents).length >= 3
    const childTurnCompleted = childEvents.some(
      (event) => event.type === 'turn/end' && event.data?.reason?.kind === 'completed',
    )
    const plansLand = existsSync(join(sandbox.project, PROMETHEUS_PLANS_REL))
    const draftsLand = existsSync(join(sandbox.project, PROMETHEUS_DRAFTS_REL))
    if (written && childTurnCompleted && plansLand && draftsLand) return true
    await sleep(250)
  }
  return false
}

/** The real sandbox disk facts the prometheus assertions consume. */
function prometheusDiskFacts(sandbox) {
  const readIfPresent = (relative) => {
    const path = join(sandbox.project, relative)
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined
  }
  const plansText = readIfPresent(PROMETHEUS_PLANS_REL)
  const draftsText = readIfPresent(PROMETHEUS_DRAFTS_REL)
  const conductorText = readIfPresent(PROMETHEUS_CONDUCTOR_REL)
  return {
    denyTargetPath: join(sandbox.project, PROMETHEUS_DENY_TARGET_REL),
    plansPath: join(sandbox.project, PROMETHEUS_PLANS_REL),
    draftsPath: join(sandbox.project, PROMETHEUS_DRAFTS_REL),
    conductorTargetPath: join(sandbox.project, PROMETHEUS_CONDUCTOR_REL),
    denyTargetAbsent: !existsSync(join(sandbox.project, PROMETHEUS_DENY_TARGET_REL)),
    plansLandedOnDisk: plansText !== undefined && plansText.includes('MOCK-PROMETHEUS-PLAN-BODY-3e7d51'),
    draftsLandedOnDisk: draftsText !== undefined && draftsText.includes('MOCK-PROMETHEUS-DRAFT-BODY-9a02bf'),
    conductorLandedOnDisk:
      conductorText !== undefined && conductorText.includes('MOCK-CONDUCTOR-NOTES-BODY-6d1c48'),
  }
}

/** Whether a child log carries the durable descriptor persona the gate reads. */
function childDescriptorPersona(childLog) {
  const descriptor = (childLog?.events ?? []).find((event) => event.type === 'subagent/descriptor')
  const persona = descriptor?.data?.persona
  return typeof persona === 'string' ? persona : undefined
}

/**
 * The `prometheus-md-only-denied` assertions (H-26). The identity fact is read
 * back OUT of the child's own durable descriptor — the same surface the
 * listener reads — so "the hook fired for prometheus" cannot be a synthetic
 * claim: without that persona the gate would have stayed silent and the deny
 * assertion would fail.
 */
export function analyzePrometheusMdOnlyDenied(
  {
    log,
    childLog,
    requests,
    providersJson,
    bootLog,
    denyTargetPath,
    plansPath,
    draftsPath,
    conductorTargetPath,
    denyTargetAbsent,
    plansLandedOnDisk,
    draftsLandedOnDisk,
    conductorLandedOnDisk,
  },
  routes,
) {
  const events = log?.events ?? []
  const childEvents = childLog?.events ?? []
  const results = toolResultParts(events)
  const childResults = toolResultParts(childEvents)
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const prometheusRequests = requests.filter((request) => request.role === 'prometheus')
  const persona = childDescriptorPersona(childLog)
  const denyCall = findToolCall(childEvents, 'write', (args) => args.file_path === denyTargetPath)
  const plansCall = findToolCall(childEvents, 'write', (args) => args.file_path === plansPath)
  const draftsCall = findToolCall(childEvents, 'write', (args) => args.file_path === draftsPath)
  const conductorCall = findToolCall(events, 'write', (args) => args.file_path === conductorTargetPath)
  const denyResult = toolResultForCall(childResults, denyCall)
  const plansResult = toolResultForCall(childResults, plansCall)
  const draftsResult = toolResultForCall(childResults, draftsCall)
  const conductorResult = toolResultForCall(results, conductorCall)
  const denyText = denyResult?.text ?? ''
  const plansText = plansResult?.text ?? ''
  const draftsText = draftsResult?.text ?? ''
  const conductorText = conductorResult?.text ?? ''
  const markerResults = childResults.filter((part) => part.text.includes(PROMETHEUS_MD_ONLY_HOOK_NAME))
  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    // The child really is a delegation session, and its descriptor really
    // carries the prometheus persona the gate keyed on.
    childSessionObserved: childLog !== undefined && prometheusRequests.length >= 1,
    prometheusPersonaObservable:
      typeof persona === 'string' && persona.includes('omo-prometheus'),
    // (a) TRIGGER: the non-.md workspace write was refused with the upstream
    // reason, and no byte landed.
    nonMdWriteDeniedByTheGate:
      denyResult?.isError === true
      && denyText.startsWith('Error: ')
      && denyText.includes(`[${PROMETHEUS_MD_ONLY_HOOK_NAME}]`)
      && denyText.includes('File operations restricted to .omo/*.md plan files only')
      && denyText.includes(`Attempted to modify: ${denyTargetPath}`),
    deniedTargetNeverLanded: denyTargetAbsent,
    gateSpokeExactlyOnce: markerResults.length === 1,
    // (b) TRIGGER: the allowed `.omo/plans/*.md` write succeeded AND the D half
    // appended the workflow reminder to its result; the bytes are on disk.
    plansWriteAllowed: plansResult !== undefined && plansResult.isError !== true && plansLandedOnDisk,
    workflowReminderAppended: plansText.includes(PROMETHEUS_WORKFLOW_REMINDER.trimStart()),
    // (c) 对照: `.omo` but NOT `plans/` → allowed and reminder-free.
    draftsWriteAllowedWithoutReminder:
      draftsResult !== undefined
      && draftsResult.isError !== true
      && draftsLandedOnDisk
      && !draftsText.includes('PROMETHEUS MANDATORY WORKFLOW REMINDER'),
    // (d) 对照: the CONDUCTOR's own non-.md write is untouched by the gate.
    conductorWriteNotAffected:
      conductorResult !== undefined
      && conductorResult.isError !== true
      && conductorLandedOnDisk
      && !conductorText.includes(PROMETHEUS_MD_ONLY_HOOK_NAME),
    mockSawBothLanes: sisyphusRequests.length >= 2 && prometheusRequests.length >= 2,
    bothTurnsCompleted:
      turnCompleted(events)
      && childEvents.some(
        (event) => event.type === 'turn/end' && event.data?.reason?.kind === 'completed',
      ),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      personaCarriesPrometheusAnchor: typeof persona === 'string' && persona.includes('omo-prometheus'),
      denyText,
      plansTextTail: plansText.slice(-200),
      draftsTextTail: draftsText.slice(-200),
      conductorText,
      promptChildRequestCount: prometheusRequests.length,
      mockRequestCount: sisyphusRequests.length,
    },
  }
}

// ── fabricated P4-T5 skills-catalog-visible inputs (must earn their PASS) ──────
//
// The `--self-test` QA exists because an analysis can PASS vacuously: checks
// written so that nothing real can fail them. This factory proves the opposite
// for the P4-T5 analysis — the fabricated GOOD input must PASS, and each
// fabricated defect must fail on its OWN named check.
//
// NOT FABRICABLE, SAID OUT LOUD: `referencedFileReadableViaPath` reads the real
// vendor tree, so no in-memory defect can make it fail (deleting a vendored file
// to prove it would be a worse idea than the gap). Its sensitivity is covered by
// the real e2e run instead — if the plugin's resolution anchor moved, the GOOD
// input here would fail the same check.
function fabricatedSkillsCatalogInput(routes) {
  const names = vendoredSkillNames()
  const catalog = [
    '<system-reminder>',
    'A skill is a reusable set of task-specific instructions. The following skills are available in this session:',
    '',
    '<available_skills>',
    ...names.map((name) => `- \`${name}\`: fabricated description for ${name}`),
    '</available_skills>',
    '</system-reminder>',
  ].join('\n')
  const gitMaster = vendoredSkillEntries().get('git-master')
  const body = gitMaster === undefined ? 'fabricated body' : gitMaster.document.content
  const loadResultText = [
    '<skill_content name="git-master" provider="runtime">',
    body,
    '</skill_content>',
  ].join('\n')
  return {
    log: {
      header: { id: 'fabricated-skills-session' },
      events: [
        { seq: 1, type: 'turn/start', data: { turn: 1 } },
        { seq: 2, type: 'step/start', data: { turn: 1, step: 1 } },
        { seq: 3, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'tool-call', id: 'mock-llm-tool-1-0', name: 'skill', arguments: JSON.stringify({ name: 'git-master' }) }] } } },
        { seq: 4, type: 'tool/call', data: { turn: 1, step: 1, callId: 'mock-llm-tool-1-0', name: 'skill', arguments: JSON.stringify({ name: 'git-master' }) } },
        fabricatedToolResultEvent(5, 'mock-llm-tool-1-0', loadResultText),
        { seq: 6, type: 'step/end', data: { turn: 1, step: 1 } },
        { seq: 7, type: 'step/start', data: { turn: 1, step: 2 } },
        { seq: 8, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'tool-call', id: 'mock-llm-tool-2-0', name: 'skill', arguments: JSON.stringify({ name: SKILL_UNKNOWN_NAME }) }] } } },
        { seq: 9, type: 'tool/call', data: { turn: 1, step: 2, callId: 'mock-llm-tool-2-0', name: 'skill', arguments: JSON.stringify({ name: SKILL_UNKNOWN_NAME }) } },
        {
          seq: 10,
          type: 'tool/result',
          data: {
            turn: 1,
            step: 2,
            message: {
              source: { kind: 'tool', callId: 'mock-llm-tool-2-0' },
              content: [{
                type: 'tool-result',
                toolCallId: 'mock-llm-tool-2-0',
                content: [{ type: 'text', text: `Error: skill "${SKILL_UNKNOWN_NAME}" is unknown or no longer available` }],
                isError: true,
              }],
            },
          },
        },
        { seq: 11, type: 'step/end', data: { turn: 1, step: 2 } },
        { seq: 12, type: 'step/start', data: { turn: 1, step: 3 } },
        { seq: 13, type: 'assistant/message', data: { turn: 1, step: 3, message: { content: [{ type: 'text', text: SKILL_CATALOG_SUMMARY }] } } },
        { seq: 14, type: 'step/end', data: { turn: 1, step: 3 } },
        { seq: 15, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      ],
    },
    // The wire bodies carry the catalog text with ESCAPED newlines — the shape
    // the analyzer's `\\n` normalisation exists for.
    requests: [
      { role: 'sisyphus', body: { model: routes.sisyphus.model, messages: [{ role: 'user', content: catalog }] }, receivedAt: 10 },
      { role: 'sisyphus', body: { model: routes.sisyphus.model, messages: [{ role: 'user', content: 'step 2' }] }, receivedAt: 20 },
      { role: 'sisyphus', body: { model: routes.sisyphus.model, messages: [{ role: 'user', content: 'step 3' }] }, receivedAt: 30 },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: `${FABRICATED_BOOT_LOG}\n${omoCommandsMarkers.formatSkillsSummaryLine({ registered: omoCommandsSkills.EXPECTED_VENDOR_SKILL_COUNT, total: omoCommandsSkills.EXPECTED_VENDOR_SKILL_COUNT, failed: 0 })}\n`,
  }
}

// ── fabricated P3-T16 批 C inputs (must earn their PASS) ─────────────────────
// One GOOD fixture per scenario, mirroring the real runtime layout the scenario
// produces, plus the named defect mutations the self-test applies. The disk
// facts the prometheus scenario asserts are computed in `analysisInput` for the
// real run, so here they are plain booleans the mutations can flip.

const FABRICATED_WEBFETCH_REDIRECT_URL = 'http://127.0.0.1:9/redirect-me'
const FABRICATED_WEBFETCH_PLAIN_URL = 'http://127.0.0.1:9/plain'
/**
 * The refusal BOTH calls receive: the native provider's own address policy. The
 * guard never speaks on a private destination (review F1) — it refuses to probe
 * it and fails open.
 */
const FABRICATED_WEBFETCH_NATIVE_REFUSAL =
  'Error: URL hostname "127.0.0.1" resolves to a non-public IP address'

function fabricatedWebfetchPrivateTargetInput(routes) {
  const redirectCallId = 'mock-llm-tool-1-0'
  const plainCallId = 'mock-llm-tool-1-1'
  const log = {
    path: '/fabricated/webfetch-private-target/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: WEBFETCH_GUARD_PROMPT }] } },
      fabricatedToolCallEvent(2, redirectCallId, 'web_fetch', { url: FABRICATED_WEBFETCH_REDIRECT_URL }),
      fabricatedToolCallEvent(3, plainCallId, 'web_fetch', { url: FABRICATED_WEBFETCH_PLAIN_URL }),
      fabricatedToolResultEvent(4, redirectCallId, FABRICATED_WEBFETCH_NATIVE_REFUSAL, true),
      fabricatedToolResultEvent(5, plainCallId, FABRICATED_WEBFETCH_NATIVE_REFUSAL, true),
      { seq: 6, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: WEBFETCH_GUARD_SUMMARY }] } } },
      { seq: 7, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
  return {
    log,
    allLogs: [log],
    requests: fabricatedSisyphusRequests(routes).concat([
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 20 },
    ]),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
    redirectUrl: FABRICATED_WEBFETCH_REDIRECT_URL,
    plainUrl: FABRICATED_WEBFETCH_PLAIN_URL,
    // The fixture answered nothing — the GOOD shape.
    fixtureHits: [],
  }
}

const FABRICATED_PROMETHEUS_PROJECT = '/fabricated/project'
const FABRICATED_PROMETHEUS_DENY_TARGET = `${FABRICATED_PROMETHEUS_PROJECT}/${PROMETHEUS_DENY_TARGET_REL}`
const FABRICATED_PROMETHEUS_PLANS_PATH = `${FABRICATED_PROMETHEUS_PROJECT}/${PROMETHEUS_PLANS_REL}`
const FABRICATED_PROMETHEUS_DRAFTS_PATH = `${FABRICATED_PROMETHEUS_PROJECT}/${PROMETHEUS_DRAFTS_REL}`
const FABRICATED_PROMETHEUS_CONDUCTOR_PATH = `${FABRICATED_PROMETHEUS_PROJECT}/${PROMETHEUS_CONDUCTOR_REL}`
const FABRICATED_PROMETHEUS_CHILD_ID = 'session-fabricated-prometheus-child'

function fabricatedPrometheusMdOnlyChildLog() {
  return {
    path: `/fabricated/${FABRICATED_PROMETHEUS_CHILD_ID}/session.jsonl`,
    header: {
      type: 'session',
      id: FABRICATED_PROMETHEUS_CHILD_ID,
      origin: 'subagent',
      parentSession: FABRICATED_PARENT_ID,
      delegationDepth: 1,
    },
    events: [
      {
        seq: 0,
        type: 'subagent/descriptor',
        data: {
          version: 3,
          mode: 'continuable',
          provider: 'spawn',
          label: 'Draft the plan',
          persona: 'You are **omo-prometheus**, a planning consultant.',
        },
      },
      fabricatedToolCallEvent(1, 'mock-llm-child-tool-1', 'write', {
        file_path: FABRICATED_PROMETHEUS_DENY_TARGET,
        content: 'this must never land\n',
      }),
      fabricatedToolResultEvent(
        2,
        'mock-llm-child-tool-1',
        `Error: ${buildPrometheusDenyReason(FABRICATED_PROMETHEUS_DENY_TARGET)}`,
        true,
      ),
      fabricatedToolCallEvent(3, 'mock-llm-child-tool-2-0', 'write', {
        file_path: FABRICATED_PROMETHEUS_PLANS_PATH,
        content: PROMETHEUS_PLANS_CONTENT,
      }),
      fabricatedToolCallEvent(4, 'mock-llm-child-tool-2-1', 'write', {
        file_path: FABRICATED_PROMETHEUS_DRAFTS_PATH,
        content: PROMETHEUS_DRAFTS_CONTENT,
      }),
      fabricatedToolResultEvent(
        5,
        'mock-llm-child-tool-2-0',
        `wrote ${FABRICATED_PROMETHEUS_PLANS_PATH}${PROMETHEUS_WORKFLOW_REMINDER}`,
      ),
      fabricatedToolResultEvent(6, 'mock-llm-child-tool-2-1', `wrote ${FABRICATED_PROMETHEUS_DRAFTS_PATH}`),
      { seq: 7, type: 'assistant/message', data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: PROMETHEUS_MD_ONLY_CHILD_SUMMARY }] } } },
      { seq: 8, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedPrometheusMdOnlyInput(routes) {
  const childLog = fabricatedPrometheusMdOnlyChildLog()
  const log = {
    path: '/fabricated/prometheus/session.jsonl',
    header: { type: 'session', id: FABRICATED_PARENT_ID },
    events: [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: PROMETHEUS_MD_ONLY_PROMPT }] } },
      fabricatedToolCallEvent(2, 'mock-llm-tool-1', 'prometheus', {
        description: 'Draft the plan',
        prompt: PROMETHEUS_MD_ONLY_TASK,
        // BACKGROUND (`continuable`) — mirrors the real script AND the child log
        // below, whose descriptor is `mode: 'continuable'`: the persona only
        // exists on the continuable descriptor, so a fabricated FOREGROUND call
        // would describe a delegation this scenario could never identify.
        run_in_background: true,
      }),
      fabricatedToolResultEvent(
        3,
        'mock-llm-tool-1',
        `started subagent ${FABRICATED_PROMETHEUS_CHILD_ID}\n\n${PROMETHEUS_MD_ONLY_CHILD_SUMMARY}`,
      ),
      fabricatedToolCallEvent(4, 'mock-llm-tool-2', 'write', {
        file_path: FABRICATED_PROMETHEUS_CONDUCTOR_PATH,
        content: PROMETHEUS_CONDUCTOR_CONTENT,
      }),
      fabricatedToolResultEvent(5, 'mock-llm-tool-2', `wrote ${FABRICATED_PROMETHEUS_CONDUCTOR_PATH}`),
      { seq: 6, type: 'assistant/message', data: { turn: 1, step: 3, message: { content: [{ type: 'text', text: PROMETHEUS_MD_ONLY_SUMMARY }] } } },
      { seq: 7, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
  return {
    log,
    childLog,
    allLogs: [log, childLog],
    requests: fabricatedSisyphusRequests(routes).concat([
      { role: 'sisyphus', body: { model: routes.sisyphus.model }, receivedAt: 20 },
      { role: 'prometheus', body: { model: routes.sisyphus.model }, receivedAt: 30 },
      { role: 'prometheus', body: { model: routes.sisyphus.model }, receivedAt: 40 },
    ]),
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
    denyTargetPath: FABRICATED_PROMETHEUS_DENY_TARGET,
    plansPath: FABRICATED_PROMETHEUS_PLANS_PATH,
    draftsPath: FABRICATED_PROMETHEUS_DRAFTS_PATH,
    conductorTargetPath: FABRICATED_PROMETHEUS_CONDUCTOR_PATH,
    denyTargetAbsent: true,
    plansLandedOnDisk: true,
    draftsLandedOnDisk: true,
    conductorLandedOnDisk: true,
  }
}

// ── P4-T5 skills-catalog-visible scenario (skill 投递机制) ─────────────────────
//
// WHAT THIS SCENARIO PROVES, and nothing more. P4-T5's mechanism is a DELIVERY
// claim: the 19 vendored skills must become visible to a real agent through
// dsh's own native skill surface. Four links, each observable only from outside
// the process:
//
//   1. CATALOG — the model-facing `<available_skills>` block that
//      `@deepseek-ai/dsh-tool-skill` injects on `agent/pre-step` must carry all
//      19 vendored skills as BARE kebab-case names. The negative half matters as
//      much: no `shared/`-prefixed form, and no `start-work` (upstream's pre-v5
//      name for the row this repo calls `ulw-execute`).
//   2. LOAD — one `skill` tool call for `git-master` must return the body through
//      `ctx.skills.get`, and the returned text must be the vendored body
//      (compared against the file the plugin read), not a placeholder.
//   3. 对照 — a valid-but-unvendored name must come back as "unknown or no longer
//      available", so link 2 cannot be passing because the tool answers for any
//      name at all.
//   4. PATH — the registered `path` must make the skill's own RELATIVE reference
//      resolvable on disk: `ultimate-browsing`'s body names
//      `references/insane-search/README.md`, and that file must be readable at
//      `dirname(path) + "/references/insane-search/README.md"`.
//
// HONEST SCOPE. `path` is not echoed by the `skill` tool (its output schema is
// `{name, provider, resourceBase?, content}` — measured on 0.1.5-rc.1), so link 4
// resolves the reference against the SAME constant the plugin registers from
// (imported below, never restated): the chain proven is "this directory is where
// the delivered body came from and where its references live". A change to the
// plugin's resolution anchor would break the boot-marker assertion in the same
// scenario instead. The catalog assertion allows dsh's own bundled `dsh-badge`
// alongside our runtime entries (measured ranks: runtime 250, bundled 600 — they
// coexist rather than replacing one another).
const SKILL_CATALOG_PROMPT =
  'e2e skills-catalog-visible: load the git-master skill and report the first mode it offers'
const SKILL_CATALOG_SUMMARY =
  'MOCK-SKILL-CATALOG-2a6f1b: the git-master skill was loaded and its Mode Gate starts with COMMIT'
// The 对照 name: valid kebab-case (so it clears dsh's own `isSkillName` guard and
// reaches the catalog lookup) but not vendored — a malformed name would be
// rejected by the name grammar instead, proving nothing about the catalog.
const SKILL_UNKNOWN_NAME = 'not-a-vendored-skill'
// A sentinel from git-master's BODY (not its frontmatter), so link 2 cannot be
// satisfied by a description-only match.
const SKILL_GIT_MASTER_BODY_SENTINEL = '## Mode Gate'
// The relative reference ultimate-browsing's body points at (its SKILL.md:35) and
// a sentinel inside that file.
const SKILL_REFERENCE_RELATIVE = 'references/insane-search/README.md'
const SKILL_REFERENCE_SENTINEL = 'R1'

/**
 * The plugin's own modules, imported (never restated) so this scenario's
 * expectations move with the source. Node 24 type-strips the .ts directly; the
 * `.ts` specifiers are load-bearing for the same reason they are inside the
 * plugin (no bundler rewrites them — P-8.6).
 */
const omoCommandsSkills = await import('../../patches/omo-dsh/omo-commands/src/skills.ts')
const omoCommandsMarkers = await import('../../patches/omo-dsh/omo-commands/src/boot-markers.ts')

/** The vendored skill directory names, from the plugin's own discovery. */
function vendoredSkillNames() {
  return omoCommandsSkills.listVendorSkillDirectories(omoCommandsSkills.VENDOR_SKILLS_DIR)
}

/**
 * The documents the plugin hands the registry, keyed by skill name — read
 * through the plugin's own reader, so "the tool returned what the plugin
 * registered" compares the two ends of one delivery path.
 */
function vendoredSkillEntries() {
  return new Map(
    omoCommandsSkills.scanVendorSkills(omoCommandsSkills.VENDOR_SKILLS_DIR).entries
      .map((entry) => [entry.document.name, entry]),
  )
}

/** skills-catalog-visible script: one load, one 对照, one wrap-up. */
function skillsCatalogVisibleScript() {
  return {
    sisyphus: [
      {
        type: 'tool_calls',
        calls: [{ name: 'skill', arguments: { name: 'git-master' } }],
      },
      {
        type: 'tool_calls',
        calls: [{ name: 'skill', arguments: { name: SKILL_UNKNOWN_NAME } }],
      },
      { type: 'text', text: SKILL_CATALOG_SUMMARY },
    ],
  }
}

/**
 * The skill names inside the model-facing `<available_skills>` catalog block,
 * read off the WIRE body the mock recorded.
 *
 * The `\\n` normalisation is load-bearing, not cosmetic: `JSON.stringify` escapes
 * every newline in the recorded body, so a naive `split('\n')` sees ONE line of
 * literal `\n` sequences and every line-anchored match silently fails. The first
 * run of this scenario failed exactly that way — the catalog was in the request
 * all along, and the assertion reported an empty catalog.
 */
function catalogSkillNames(requests) {
  const names = new Set()
  for (const request of requests) {
    const body = JSON.stringify(request.body ?? '')
    // EVERY block, not just the first: dsh republishes the catalog
    // (`renderCatalogUpdate`) whenever its digest changes, so a later request can
    // carry a second `<available_skills>` block — and a regression introduced in
    // that republish must still be caught.
    for (const block of body.matchAll(/<available_skills>([\s\S]*?)<\/available_skills>/g)) {
      for (const line of block[1].replace(/\\n/g, '\n').split('\n')) {
        // The captured name is DELIBERATELY broad (anything between the
        // backticks). A kebab-case-only pattern here would silently SKIP a
        // malformed entry such as `shared/git-master` — which is precisely the
        // defect the prefix check exists to catch, so the pattern would make the
        // check vacuous. The self-test's defect case pins that.
        const match = line.match(/^-\s+`([^`]+)`:/)
        if (match !== null) names.add(match[1])
      }
    }
  }
  return [...names].sort()
}

export function analyzeSkillsCatalogVisible(
  { log, requests, providersJson, bootLog },
  routes,
) {
  const events = log?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const calls = events.filter((event) => event.type === 'tool/call')
  const results = toolResultParts(events)
  const findCall = (name, expectedArguments) => calls.find((event) => {
    if (event.data?.name !== name) return false
    const args = toolCallArguments(event)
    if (args === undefined) return false
    return Object.entries(expectedArguments).every(([key, value]) => args[key] === value)
  })
  const resultFor = (call) => (call === undefined
    ? undefined
    : results.find((part) => part.callId === call.data?.callId))
  const loadResult = resultFor(findCall('skill', { name: 'git-master' }))
  const unknownResult = resultFor(findCall('skill', { name: SKILL_UNKNOWN_NAME }))

  const vendored = vendoredSkillNames()
  const catalog = catalogSkillNames(sisyphusRequests)
  const entries = vendoredSkillEntries()
  const gitMaster = entries.get('git-master')
  const ultimateBrowsing = entries.get('ultimate-browsing')
  // The reference ultimate-browsing's BODY names, resolved against the
  // directory the plugin registers as `path` (the SKILL.md's own directory).
  const referencePath = ultimateBrowsing === undefined
    ? undefined
    : join(dirname(ultimateBrowsing.path), SKILL_REFERENCE_RELATIVE)
  const skillsMarker = omoCommandsMarkers.formatSkillsSummaryLine({
    registered: omoCommandsSkills.EXPECTED_VENDOR_SKILL_COUNT,
    total: omoCommandsSkills.EXPECTED_VENDOR_SKILL_COUNT,
    failed: 0,
  })
  // dsh's own bundled skill may share the catalog; ours do not displace it.
  const allowedNames = new Set([...vendored, 'dsh-badge'])
  const catalogExtras = catalog.filter((name) => !allowedNames.has(name))

  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    skillsMarkerPresent: (bootLog ?? '').includes(skillsMarker),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    sessionLogFound: log !== undefined,
    // 1. catalog: every vendored skill is addressable by its BARE name.
    catalogCoversEveryVendoredSkill:
      vendored.length === omoCommandsSkills.EXPECTED_VENDOR_SKILL_COUNT
      && vendored.every((name) => catalog.includes(name)),
    // 1b. every catalog name is a bare kebab-case dsh can actually address (a
    // `shared/`-prefixed entry would reach the model and then be rejected by
    // `isSkillName` at the tool boundary), and the v5 rename is intact.
    catalogHasNoPrefixedForm:
      catalog.every((name) => omoCommandsSkills.SKILL_NAME_PATTERN.test(name))
      && !catalog.includes('start-work')
      && catalog.includes('ulw-execute'),
    // 2. load: the tool returned the vendored body through ctx.skills.get.
    skillToolReturnedBody:
      loadResult !== undefined
      && loadResult.isError !== true
      && loadResult.text.includes(SKILL_GIT_MASTER_BODY_SENTINEL),
    // FULL body, not a prefix: `renderSkillContent` embeds the registered
    // content verbatim, so an exact substring test is both possible and strictly
    // stronger — a prefix check would still pass if the tool returned the body
    // with a different TAIL (a truncated or summary-rewritten one).
    skillToolBodyMatchesVendoredFile:
      loadResult !== undefined
      && gitMaster !== undefined
      && loadResult.text.includes(gitMaster.document.content),
    // 3. 对照: an unvendored name is refused, so link 2 is not a rubber stamp.
    unknownSkillNameRefused:
      unknownResult !== undefined
      && unknownResult.isError === true
      && unknownResult.text.includes('is unknown or no longer available'),
    // 4. path: the skill's own relative reference resolves on disk.
    referencedFileReadableViaPath:
      referencePath !== undefined
      && existsSync(referencePath)
      && readFileSync(referencePath, 'utf8').includes(SKILL_REFERENCE_SENTINEL),
    // Closure: both tool steps and the wrap-up reached the mock; the turn ended.
    mockSawBothSkillSteps: sisyphusRequests.length === 3,
    assistantSummaryRecorded: events.some(
      (event) => event.type === 'assistant/message' && eventText(event).includes(SKILL_CATALOG_SUMMARY),
    ),
    turnCompleted: events.some(
      (event) =>
        event.type === 'turn/end'
        && (event.data?.reason?.kind ?? event.data?.reason) === 'completed',
    ),
  }
  const failed = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    detail: {
      vendoredSkillCount: vendored.length,
      catalogSkillNames: catalog,
      catalogExtras,
      skillsMarker,
      referencePath,
    },
  }
}

// P3-T16 adds `setup(sandbox)`: an async hook that runs BEFORE the mock server
// starts and whose return value rides into `script(sandbox, setup)` and
// `analysisInput(sandbox, setup)` (and is closed in runScenario's `finally`).
// The webfetch scenario needs it because its redirect fixture lives on an
// ephemeral loopback port that only exists once the server is listening, while
// the mock script's tool arguments must name that exact URL.

// ── P4-T13 keyword-mode scenarios (H-33 keyword-detector; see the S-11 note) ──
//
// WHAT THESE SCENARIOS PROVE, and nothing more. H-33 is an INJECTION hook: a
// user message naming a keyword must make the mode's protocol text reach the
// model, and a message that does not must leave the session untouched. Four
// scenarios, because four things have to be observable and one session can only
// observe one of them (S-6's session-level one-shot means a second keyword turn
// in the same session is *supposed* to inject nothing — see control ④):
//
//   1. `ultrawork-keyword-injected`   — the main link + control ④ (idempotency)
//   2. `keyword-negative-controls`    — controls ①②③ in three turns of one session
//   3. `hyperplan-keyword-injected`   — the second keyword type's own text
//   4. `combo-keyword-injected`       — strict adjacency + standalone suppression
//
// ⚠️ THE ASSERTION SHAPE IS S-11, NOT UPSTREAM'S. dsh-agent-loop claims the
// inbox batch BEFORE the waterfall runs (lib:888-899), so `agent.inject()`'s
// content is claimed at the NEXT step boundary and the model reads it from the
// request after that. These scenarios therefore assert:
//     ① the injected message is a full `InjectedUserMessage` in the session log
//        (role / source triple / content block / a uuid id);
//     ② a request **after** the injecting step carries the banner + the vendor
//        body anchor on the wire;
//     ③ the second keyword turn injects NOTHING.
// They deliberately do NOT assert "the first request already carries the banner"
// — that would be upstream's opencode timing, and asserting it here would be
// asserting a property this deployment does not have. `bannerAbsentFromFirstRequest`
// is kept as its OWN named check so the timing is pinned as data rather than
// assumed: if a future DSH changed the claim order, exactly that check flips and
// the report says so.
//
// IDEMPOTENCY vs TIMING ARE SEPARATE CLAIMS. The one-shot guard is keyed on the
// session object, so control ④'s second `ulw` turn is blocked by S-6 — NOT by
// S-11's one-step delay. Mixing them would make control ④ pass for the wrong
// reason, so control ④ runs in its own session where the timing question does
// not arise.

const keywordDetectorConstants = await import(
  '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/constants.ts'
)
const keywordDetectorMessages = await import(
  '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector/messages.ts'
)
const omoHooksMarkers = await import('../../patches/omo-dsh/omo-hooks/src/boot-markers.ts')
const keywordDetectorModule = await import(
  '../../patches/omo-dsh/omo-hooks/src/hooks/keyword-detector.ts'
)

/** The real vendored bodies, read through the plugin's own loader. */
const KEYWORD_TEXTS = (() => {
  const loaded = keywordDetectorMessages.loadInstructionTexts()
  if (!loaded.ok) {
    throw new Error(`P4-T13 setup: vendored keyword instruction texts unavailable: ${JSON.stringify(loaded.failures)}`)
  }
  return loaded.texts
})()

// A 2-step turn needs one tool call, and it must not be one of the fixtures'
// triggers. `bash echo` is chosen deliberately: none of H-02's three
// FILE_READ_PATTERNS (`^\s*cat|head|tail\s+…`) can match a bare `echo`, so the
// bash-file-read-guard advisory cannot appear and muddy the request count. The
// echo marker proves the call really executed rather than being skipped.
const KEYWORD_STEP_MARKER = 'keyword-mode-step-marker-4d7a2b'
const KEYWORD_STEP_COMMAND = `echo ${KEYWORD_STEP_MARKER}`

/** The three keyword scenarios' wrap-up texts (each ends its turn). */
const ULTRAWORK_KEYWORD_SUMMARY =
  'MOCK-ULW-KEYWORD-8f3c1d: ultrawork mode banner and body reached me'
const ULTRAWORK_KEYWORD_FOLLOWUP_SUMMARY =
  'MOCK-ULW-KEYWORD-FOLLOWUP-2a6e5b: second keyword turn, no second injection'
const KEYWORD_CONTROL_SUMMARY = 'MOCK-KEYWORD-CONTROL-71c4d9: three negative turns ran'
const HYPERPLAN_KEYWORD_SUMMARY =
  'MOCK-HYPERPLAN-KEYWORD-5b8e3f: hyperplan mode banner and body reached me'
const COMBO_KEYWORD_SUMMARY =
  'MOCK-COMBO-KEYWORD-9e2a7c: combo banner only, no standalone banner'

// ── the prompts ──────────────────────────────────────────────────────────────
//
// Each carries a distinctive prefix so the session log can attribute the turn,
// and the keyword is a real bare token in running prose (not in a fence, not
// behind a slash) so the trigger is the keyword itself.
const ULTRAWORK_KEYWORD_PROMPT =
  'e2e ultrawork-keyword-injected: run ulw on the following, first echo the step marker then summarize'
const ULTRAWORK_KEYWORD_FOLLOWUP_PROMPT =
  'e2e ultrawork-keyword-injected: ulw again, and just confirm in one line'
const HYPERPLAN_KEYWORD_PROMPT =
  'e2e hyperplan-keyword-injected: plan this with hyperplan, first echo the step marker then summarize'
const COMBO_KEYWORD_PROMPT =
  'e2e combo-keyword-injected: use hyperplan ulw together, first echo the step marker then summarize'

// ── control ①: no keyword anywhere in the message ─────────────────────────────
const KEYWORD_CONTROL_NONE_PROMPT =
  'e2e keyword control one: no mode keyword in this message at all, first echo the step marker then summarize'
// ── control ②: the keyword appears ONLY inside a fenced code block ────────────
// The fence is real markdown in the user text; the detector strips fenced
// blocks before matching, so a turn whose ONLY keyword is in a fence must not
// arm. (Inline-code form is covered by the unit suite's shell-strip case.)
const KEYWORD_CONTROL_CODE_BLOCK_PROMPT = [
  'e2e keyword control two: this message mentions a keyword only inside a code block,',
  'first echo the step marker then summarize',
  '',
  '```text',
  'ulw ultrawork hyperplan hpp',
  '```',
].join('\n')
// ── control ③: a slash-command lead line ─────────────────────────────────────
// A leading `/word` is a command, not free text, so the keyword it names must
// not arm the mode. The command is kept syntactically plausible.
const KEYWORD_CONTROL_SLASH_PROMPT =
  '/ulw-execute e2e keyword control three: a slash command naming a keyword, first echo the step marker then summarize'

/** Two-step turn: one bash echo, then the wrap-up text that ends the turn. */
function keywordTwoStepScript(summary) {
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'bash',
        arguments: {
          command: KEYWORD_STEP_COMMAND,
          description: 'Echo the scenario step marker so the turn takes a second step',
        },
      },
      { type: 'text', text: summary },
    ],
  }
}

/** One-step turn: the wrap-up text alone. */
function keywordOneStepScript(summary) {
  return { sisyphus: [{ type: 'text', text: summary }] }
}

/** ultrawork-keyword-injected script: turn 1 two-step, turn 2 one-step (control ④). */
function ultraworkKeywordScript() {
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'bash',
        arguments: {
          command: KEYWORD_STEP_COMMAND,
          description: 'Echo the scenario step marker so the turn takes a second step',
        },
      },
      { type: 'text', text: ULTRAWORK_KEYWORD_SUMMARY },
      { type: 'text', text: ULTRAWORK_KEYWORD_FOLLOWUP_SUMMARY },
    ],
  }
}

/** keyword-negative-controls script: one wrap-up per control turn. */
function keywordNegativeControlsScript() {
  return {
    sisyphus: [
      { type: 'text', text: KEYWORD_CONTROL_SUMMARY },
      { type: 'text', text: KEYWORD_CONTROL_SUMMARY },
      { type: 'text', text: KEYWORD_CONTROL_SUMMARY },
    ],
  }
}

/**
 * The plugin-injected messages of one scenario, with their full `source` triple
 * and the ids dsh actually stored — the BLOCKER-1 shape, read off the JSONL.
 *
 * `pluginInjectedMessageCarriers` is the shared carrier reader (it matches on a
 * text needle); this wraps it so the assertions can name the needle from the
 * plugin's own built text rather than a restated copy.
 */
function keywordInjectedCarriers(events, needle) {
  const carriers = pluginInjectedMessageCarriers(events, needle)
  return [
    ...carriers.nextStepInsertions.map((entry) => ({ message: entry.message, seq: entry.event.seq, projection: 'inbox-splice' })),
    ...carriers.userMessages.map((event) => ({ message: event.data, seq: event.seq, projection: 'history-claim' })),
  ]
}

/** True when a stored message carries the keyword hook's producer triple. */
function isKeywordInjectionSource(message) {
  return message?.source?.kind === 'plugin'
    && message.source.plugin === keywordDetectorModule.KEYWORD_DETECTOR_PLUGIN
    && message.source.form === 'instructions'
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The two strings whose ABSENCE from a combo is the suppression claim.
 *
 * Module scope because the self-test needs the same two anchors, and a defect
 * case that re-derived them would be testing a different claim than the check
 * does. See the long note in `analyzeComboKeywordInjected` for why neither
 * standalone BANNER string can serve: both are substrings of the verbatim
 * upstream combo wrapper.
 */
const SUPPRESSION_BODY_ANCHOR = KEYWORD_TEXTS.hyperplan.slice(0, 120)

/**
 * The shared kernel of the three positive scenarios. `type` selects the keyword
 * and the banner the model must be shown; the structural assertions (one
 * injection, full message shape, a LATER request carrying it, first request not
 * carrying it) are identical, so they are written once.
 */
function analyzeKeywordInjection(
  { log, requests, providersJson, bootLog },
  routes,
  { keywordType, banner, summary, stepCount },
) {
  const events = log?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const expectedText = buildExpectedInjectedText(keywordType)
  const carriers = keywordInjectedCarriers(events, expectedText.slice(0, 240))
  const splices = carriers.filter((entry) => entry.projection === 'inbox-splice')
  const claims = carriers.filter((entry) => entry.projection === 'history-claim')
  const injected = carriers[0]?.message

  // Which request FIRST carries the banner on the wire, and which FIRST carries
  // the vendor body anchor. Both are indexed, not booleaned, so the detail block
  // reports the timing instead of the report having to guess it.
  const bannerRequestIndex = sisyphusRequests.findIndex((request) =>
    requestMessagesContain(request, banner))
  const bodyAnchor = bodyAnchorFor(keywordType)
  const bodyRequestIndex = sisyphusRequests.findIndex((request) =>
    requestMessagesContain(request, bodyAnchor))

  const summaryEvent = events.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(summary),
  )
  const turnEnds = events.filter((event) => event.type === 'turn/end')
  const stepToolCall = events.find((event) =>
    event.type === 'tool/call' && event.data?.name === 'bash')
  const stepToolResult = stepToolCall === undefined
    ? undefined
    : (() => {
      const results = toolResultParts(events)
      return results.find((part) => part.callId === stepToolCall.data?.callId)
    })()

  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    sessionLogFound: log !== undefined,
    // ①a. exactly ONE durable carrier per projection — a double inject would
    // show as two, and the session one-shot (S-6) is what should prevent that.
    singleInboxSplice: splices.length === 1,
    singleHistoryClaim: claims.length === 1,
    // ①b. the carrier is a full InjectedUserMessage, not a bare string
    // (BLOCKER-1) and not a partial object.
    //
    // ⚠️ Asserted over EVERY carrier, not `carriers[0]`. The inbox splice and the
    // history claim are two SEPARATE projections of one injection, and the model
    // reads whichever the agent loop claims at the next step boundary — so a
    // defect that corrupts only the claim is invisible to a first-carrier check
    // while still reaching the model. The first version of these three checks
    // read `carriers[0]`, which was the splice; a claim-only defect therefore
    // slipped past all of them (that is the defect case below).
    injectionIsFullUserMessage: carriers.length > 0
      && carriers.every(({ message }) => message !== undefined
        && message.role === 'user'
        && isKeywordInjectionSource(message)
        && Array.isArray(message.content)
        && message.content.length === 1
        && message.content[0]?.type === 'text'
        && typeof message.content[0]?.text === 'string'),
    // ①c. a fresh uuid id on EVERY projection: the inbox's pending-uniqueness
    // check reads it, so a missing/duplicated id is the BLOCKER-1 failure mode.
    injectionIdIsUuid: carriers.length > 0
      && carriers.every(({ message }) => typeof message?.id === 'string'
        && UUID_PATTERN.test(message.id)),
    // ①c′. the two projections are the SAME message, so they must carry the same
    // id. Two different uuids means the injection was built twice (or one
    // projection was synthesised), which the per-projection id check alone
    // cannot see: both ids would be valid uuids.
    bothProjectionsShareOneId: new Set(carriers.map(({ message }) => message?.id)).size === 1,
    // ①d. the body is the plugin's own built text (carrier note + vendor body +
    // the `---` tail), compared against the module — not a restated copy.
    injectionTextMatchesPluginBuild: carriers.length > 0
      && carriers.every(({ message }) => message?.content?.[0]?.text === expectedText),
    // ②. S-11: the banner reaches the model on a LATER request, not the first.
    bannerReachesModelOnWire: bannerRequestIndex >= 0,
    bannerArrivesAfterTheInjectingStep: bannerRequestIndex > 0,
    vendorBodyReachesModelOnWire: bodyRequestIndex >= 0,
    bannerAbsentFromFirstRequest: bannerRequestIndex !== 0,
    // the two-step premise: the bash echo really ran, so "a later request
    // existed" is not vacuously true.
    stepToolCallExecuted: stepToolResult !== undefined
      && stepToolResult.isError !== true
      && stepToolResult.text.includes(KEYWORD_STEP_MARKER),
    mockSawTheExpectedSteps: sisyphusRequests.length === stepCount,
    assistantSummaryRecorded: summaryEvent !== undefined,
    turnCompleted: turnEnds.length > 0
      && turnEnds.every((end) => turnEndReasonKind(end) === 'completed'),
  }
  const failed = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    detail: {
      keywordType,
      banner,
      bannerRequestIndex,
      bodyRequestIndex,
      sisyphusRequestCount: sisyphusRequests.length,
      spliceCount: splices.length,
      claimCount: claims.length,
      injectionId: injected?.id,
      injectionSource: injected?.source,
      injectedTextLength: injected?.content?.[0]?.text?.length,
      expectedTextLength: expectedText.length,
    },
  }
}

/** The plugin's own built injection text for one keyword type. */
function buildExpectedInjectedText(keywordType) {
  const deps = { texts: KEYWORD_TEXTS, agentName: 'sisyphus' }
  const message = keywordDetectorMessages.KEYWORD_DETECTORS
    .find((detector) => detector.type === keywordType)?.buildMessage(deps)
  if (message === undefined) throw new Error(`P4-T13: no wired detector for ${keywordType}`)
  return `${message}\n\n${keywordDetectorModule.INJECTION_SEPARATOR}\n`
}

// ⚠️ DERIVED, not restated: the hyperplan body's own MANDATORY instruction line,
// read out of the message the plugin ACTUALLY builds. Hard-coding
// `Say "HYPERPLAN MODE ENABLED!"` would be a second, silent copy of a string the
// plugin owns — one that could drift while every assertion kept passing, and
// would then test a claim about a phrase the plugin never emits.
const SUPPRESSION_INSTRUCTION_ANCHOR = buildExpectedInjectedText('hyperplan').split('\n')[2]
// Same discipline for the combo wrapper and the tag pair: both are read off the
// built message, so an upstream reword shows up as a FAIL rather than a check
// that has quietly stopped describing the shipped text.
const COMBO_WRAPPER_ANCHOR = buildExpectedInjectedText('hyperplan-ultrawork').split('\n\n')[0]
const ULTRAWORK_TAG_ANCHOR = KEYWORD_TEXTS.ultrawork.split('\n')[0]

/** A body anchor that can only be present if the VENDORED text was injected. */
function bodyAnchorFor(keywordType) {
  if (keywordType === 'ultrawork') return KEYWORD_TEXTS.ultrawork.slice(0, 120)
  if (keywordType === 'hyperplan') return KEYWORD_TEXTS.hyperplan.slice(0, 120)
  // The combo's body IS the ultrawork body, so the combo case's body anchor is
  // the ultrawork one — deliberately the same string, because the interesting
  // claim about the combo is which body it carries and which it suppresses.
  return KEYWORD_TEXTS.ultrawork.slice(0, 120)
}

export function analyzeUltraworkKeywordInjected(input, routes) {
  const base = analyzeKeywordInjection(input, routes, {
    keywordType: 'ultrawork',
    banner: keywordDetectorConstants.ULTRAWORK_BANNER_LINE,
    summary: ULTRAWORK_KEYWORD_SUMMARY,
    stepCount: 3,
  })
  // Control ④ rides along as its OWN block of named checks rather than being
  // folded into the injection link: the driver produces one verdict per
  // scenario, and S-6 (one-shot) must not be indistinguishable from S-11
  // (timing) in the failure output.
  const idempotency = keywordIdempotencyChecks(input.log?.events ?? [])
  const checks = { ...base.checks, ...idempotency.checks }
  const failed = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    detail: { ...base.detail, ...idempotency.detail },
  }
}

export function analyzeHyperplanKeywordInjected(input, routes) {
  return analyzeKeywordInjection(input, routes, {
    keywordType: 'hyperplan',
    banner: keywordDetectorConstants.HYPERPLAN_BANNER_LINE,
    summary: HYPERPLAN_KEYWORD_SUMMARY,
    stepCount: 2,
  })
}

export function analyzeComboKeywordInjected(input, routes) {
  const base = analyzeKeywordInjection(input, routes, {
    keywordType: 'hyperplan-ultrawork',
    banner: keywordDetectorConstants.COMBO_BANNER_LINE,
    summary: COMBO_KEYWORD_SUMMARY,
    stepCount: 2,
  })
  const events = input.log?.events ?? []
  const sisyphusRequests = input.requests.filter((request) => request.role === 'sisyphus')
  const bodiesWith = (text) => sisyphusRequests.some((request) => requestMessagesContain(request, text))
  // The text these suppression checks read is the one the run ACTUALLY delivered
  // (the stored carrier), not the plugin's own build: reading the build would
  // make every check below a statement about the module rather than the run, and
  // no defect in the run could falsify them. `injectionTextMatchesPluginBuild`
  // is the separate check that ties the two together.
  const observed = keywordInjectedCarriers(events, buildExpectedInjectedText('hyperplan-ultrawork').slice(0, 240))
  const injectedText = observed[0]?.message?.content?.[0]?.text ?? ''
  // Suppression: the combo banner says "do NOT say the standalone banners", so
  // the delivered text must NOT carry the hyperplan body or its MANDATORY line.
  //
  // ⚠️ **Why no check greps for a bare banner string.** BOTH standalone banner
  // strings are SUBSTRINGS of the verbatim upstream combo wrapper, so a
  // substring-absence test for either is unsatisfiable on a correct delivery:
  //   * the ULTRAWORK banner is a substring of the COMBO banner
  //     (`COMBO_BANNER_LINE`), and the HYPERPLAN banner occurs verbatim in the
  //     wrapper's own clause — both named here through the constants rather than
  //     as literals, for the same reason;
  //   * `'HYPERPLAN MODE ENABLED!'` occurs in the wrapper's own clause
  //     `Do NOT say the standalone "ULTRAWORK MODE ENABLED!" or
  //     "HYPERPLAN MODE ENABLED!" banners.`
  // Either test would fail the scenario on a correct run (which is exactly what
  // happened on the first attempt) — so the suppression claim is made with two
  // strings that are genuinely ABSENT from a correct combo: the hyperplan BODY,
  // and the hyperplan body's own MANDATORY instruction form
  // (`Say "HYPERPLAN MODE ENABLED!"`), which the wrapper never spells that way.
  const suppressionChecks = {
    comboCarriesTheVerbatimWrapper: injectedText.startsWith(COMBO_WRAPPER_ANCHOR),
    comboCarriesNoHyperplanStandaloneBody: !injectedText.includes(SUPPRESSION_BODY_ANCHOR),
    comboCarriesNoHyperplanStandaloneInstruction: !injectedText.includes(SUPPRESSION_INSTRUCTION_ANCHOR),
    // …and the ultrawork body it DOES carry is the single, un-wrapped one.
    comboCarriesOneUltraworkTagPair:
      (injectedText.split(ULTRAWORK_TAG_ANCHOR).length - 1) === 1
      && (injectedText.match(/<\/ultrawork-mode>/g) ?? []).length === 1,
    // The same two discriminators, on the WIRE — the claim is about what the
    // model is actually handed, not about what was stored.
    noStandaloneHyperplanBodyOnTheWire: !bodiesWith(SUPPRESSION_BODY_ANCHOR),
    noStandaloneHyperplanInstructionOnTheWire: !bodiesWith(SUPPRESSION_INSTRUCTION_ANCHOR),
    exactlyOneComboCarrier: observed.length === 2, // one splice + one claim
  }
  const checks = { ...base.checks, ...suppressionChecks }
  const failed = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    detail: {
      ...base.detail,
      comboWrapperFirstLine: COMBO_WRAPPER_ANCHOR,
      ultraworkTagPairCount: injectedText.split(ULTRAWORK_TAG_ANCHOR).length - 1,
    },
  }
}

/**
 * Controls ①②③ in three turns of ONE session.
 *
 * Why one session: all three are "the mode must NOT arm", so none of them ever
 * sets the session one-shot, and sharing a session makes the claim stronger — a
 * single stray injection anywhere in the three turns fails every control's
 * "no keyword instruction reached the model" check at once.
 *
 * The negative needs its own rigor: "no injection happened" is the easiest
 * assertion in the file to pass vacuously (a dead hook passes it). So the
 * controls assert the POSITIVE side too — each turn really ran, reached the
 * mock, and the real keyword text IS present in the user prompt (controls ② and
 * ③) or genuinely absent (control ①). Without that, this scenario would pass
 * even if the driver never delivered the prompts at all.
 */
export function analyzeKeywordNegativeControls(input, routes) {
  const events = input.log?.events ?? []
  const sisyphusRequests = input.requests.filter((request) => request.role === 'sisyphus')
  const turnEnds = events.filter((event) => event.type === 'turn/end')
  const userMessages = events.filter((event) => event.type === 'user/message')
  // The prompts are searched as stored text (`messageContentText` joins the real
  // content blocks, so newlines are REAL here) — but the control-② prompt spans
  // several lines and the defect cases rewrite one line at a time, so the flat
  // form is what the substring checks below see.
  const userTexts = userMessages.map((event) => messageContentText(event.data))

  // ⚠️ Scoped to the KEYWORD hook's own producer triple, not to "any plugin".
  // A real run's log carries at least one OTHER plugin-sourced user message —
  // dsh's own `dsh-system-prompt` snapshot (`form: 'snapshot'`) and the
  // `skill-catalog` block are both `user/message` events with
  // `source.kind === 'plugin'`. The first version of this check counted those
  // and failed the scenario on a perfectly correct run; "some plugin injected
  // something" is true of every session and therefore not a claim.
  const keywordCarriers = userMessages.filter((event) => isKeywordInjectionSource(event.data))
  // …and, separately: no OTHER plugin's message may carry a keyword body. That is
  // the real leak risk (a mode's text arriving through some other channel), and
  // `noKeywordBodyInTheLog` below is the log-wide form of it.
  const foreignCarriersWithKeywordText = userMessages.filter((event) =>
    event.data?.source?.kind === 'plugin'
    && !isKeywordInjectionSource(event.data)
    && (eventTextFlat(event).includes(KEYWORD_TEXTS.ultrawork.slice(0, 120))
      || eventTextFlat(event).includes(KEYWORD_TEXTS.hyperplan.slice(0, 120))))

  // The keyword's own banner, on the wire and in the log.
  const bannerOnWire = sisyphusRequests.some((request) =>
    requestMessagesContain(request, keywordDetectorConstants.ULTRAWORK_BANNER_LINE)
    || requestMessagesContain(request, keywordDetectorConstants.HYPERPLAN_BANNER_LINE)
    || requestMessagesContain(request, keywordDetectorConstants.COMBO_BANNER_LINE))
  const bannerInLog = events.some((event) => eventTextFlat(event).includes(keywordDetectorConstants.ULTRAWORK_BANNER_LINE))
  // The body of either mode must not be in the log either (a banner-less
  // injection would be a worse bug than a banner'd one).
  const bodyInLog = events.some((event) =>
    eventTextFlat(event).includes(KEYWORD_TEXTS.ultrawork.slice(0, 120))
    || eventTextFlat(event).includes(KEYWORD_TEXTS.hyperplan.slice(0, 120)))

  // ⚠️ **The premise this scenario rests on, and the one it was blind to.**
  //
  // Every check below is a NEGATIVE: "no mode was injected". All of them pass
  // trivially — indeed vacuously — when the hook is not running at all. That is
  // not hypothetical: P4-T13 found the hook failing to register outright
  // (`hook keyword-detector FAILED: Error: cannot get property "config" without
  // inject`), and this scenario reported a clean PASS for it, because a hook
  // that never registered also never injects. A negative-only scenario MUST
  // therefore establish that its subject is alive before its negatives mean
  // anything — so the registration line is checked here, against the registrar's
  // own formatter rather than a restated string.
  //
  // The FAILURE line is asserted absent too, because "registered" and "failed"
  // are the same registrar's two outcomes: a hook can print the failure and still
  // be absent, and a boot log carrying both is a real ambiguity worth pinning.
  const registeredLine = omoHooksMarkers.formatHookRegisteredLine(
    keywordDetectorModule.KEYWORD_DETECTOR_ID, 'agent/pre-step',
  )
  // The failure line is a PREFIX, not a whole line: the registrar interpolates
  // the thrown error's own message after the colon, so the tail differs per
  // failure. The prefix is cut out of a real formatter call with a sentinel
  // error, so it stays derived from the registrar rather than restated — and it
  // stays prefix-shaped so ANY failure message is caught, not just the sentinel.
  const failureSentinel = 'e2e-sentinel-7f1c'
  const failureLine = omoHooksMarkers.formatHookFailedLine(
    keywordDetectorModule.KEYWORD_DETECTOR_ID,
    new Error(failureSentinel),
  ).split(failureSentinel)[0]

  const checks = {
    pluginLoaded: pluginsLoaded(input.bootLog),
    // THE premise: the hook under test is actually wired to the event. Without
    // this, all four negative checks below are unfalsifiable.
    keywordDetectorRegisteredOnPreStep: (input.bootLog ?? '').includes(registeredLine),
    keywordDetectorRegistrationDidNotFail: !(input.bootLog ?? '').includes(failureLine),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(input.providersJson),
    sessionLogFound: input.log !== undefined,
    // The PREMISE: all three prompts really reached the session as user turns.
    // Without this the whole scenario would pass on an empty log.
    allThreeControlPromptsDelivered:
      userTexts.some((text) => text.includes('control one'))
      && userTexts.some((text) => text.includes('control two'))
      && userTexts.some((text) => text.includes('control three')),
    // …and the mock answered each of the three turns.
    mockSawThreeControlTurns: sisyphusRequests.length === 3
      && events.filter((event) =>
        event.type === 'assistant/message' && eventText(event).includes(KEYWORD_CONTROL_SUMMARY)).length === 3,
    threeTurnsCompleted: turnEnds.length === 3
      && turnEnds.every((end) => turnEndReasonKind(end) === 'completed'),
    // CONTROL ① — no keyword in the message at all.
    controlOnePromptHasNoKeyword: (() => {
      const text = userTexts.find((candidate) => candidate.includes('control one'))
      return text !== undefined
        && !/\b(ultrawork|ulw|hyperplan|hpp)\b/i.test(text)
    })(),
    // CONTROL ② — the keyword IS there, but only inside the fence. Asserted
    // positively so the control cannot pass by the prompt being keyword-free.
    controlTwoKeywordIsInsideTheFence: (() => {
      const text = userTexts.find((candidate) => candidate.includes('control two'))
      if (text === undefined) return false
      const fenced = text.match(/```[\s\S]*?```/g) ?? []
      const outside = text.replace(/```[\s\S]*?```/g, '')
      return /\b(ultrawork|ulw|hyperplan|hpp)\b/i.test(fenced.join('\n'))
        && !/\b(ultrawork|ulw|hyperplan|hpp)\b/i.test(outside)
    })(),
    // CONTROL ③ — a slash-command lead, keyword present in the body of the line.
    controlThreePromptIsSlashLed: (() => {
      const text = userTexts.find((candidate) => candidate.includes('control three'))
      return text !== undefined
        && /^\s*\/[a-zA-Z][\w-]*(?:\s|$)/.test(text)
        && /\bulw-execute\b/.test(text)
    })(),
    // THE NEGATIVE CLAIM, once, for all three turns.
    noKeywordInjectedUserMessage: keywordCarriers.length === 0,
    noForeignPluginCarriedKeywordText: foreignCarriersWithKeywordText.length === 0,
    noKeywordBannerOnTheWire: !bannerOnWire,
    noKeywordBodyInTheLog: !bodyInLog && !bannerInLog,
  }
  const failed = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    detail: {
      turnCount: turnEnds.length,
      sisyphusRequestCount: sisyphusRequests.length,
      userMessageCount: userMessages.length,
      pluginSourceCount: userMessages.filter((event) => event.data?.source?.kind === 'plugin').length,
      keywordCarrierCount: keywordCarriers.length,
      foreignCarriersWithKeywordText: foreignCarriersWithKeywordText.length,
    },
  }
}

/**
 * Control ④ — the second keyword turn of the MAIN scenario, analysed here so
 * its assertion is named separately from the injection link (S-6 vs S-11 must
 * not be one check).
 */
function keywordIdempotencyChecks(events) {
  const turnEnds = events.filter((event) => event.type === 'turn/end')
  const expectedText = buildExpectedInjectedText('ultrawork')
  const carriers = keywordInjectedCarriers(events, expectedText.slice(0, 240))
  // Where the single injection sat in the event sequence, and where the second
  // keyword turn's own messages did. One injection BEFORE that is the whole
  // claim: the second turn added nothing.
  const injectSeq = carriers[0]?.seq
  const followupSummary = events.find(
    (event) => event.type === 'assistant/message'
      && eventText(event).includes(ULTRAWORK_KEYWORD_FOLLOWUP_SUMMARY),
  )
  const followupTurnEnd = turnEnds[1]
  const checks = {
    exactlyOneInjectionAcrossBothTurns: carriers.length === 2, // one splice + one claim
    // The injection happened during TURN 1 — before the second keyword turn's
    // own events. If it landed after them, the one-shot is not what stopped it.
    injectionPredatesTheSecondTurn: injectSeq !== undefined
      && followupSummary !== undefined
      && injectSeq < followupSummary.seq,
    // …and the second turn really ran to completion (so "no second injection"
    // is not "the second turn never happened").
    secondKeywordTurnRan: followupSummary !== undefined
      && followupTurnEnd !== undefined
      && followupSummary.seq < followupTurnEnd.seq
      && turnEndReasonKind(followupTurnEnd) === 'completed',
    bothTurnsCompleted: turnEnds.length === 2
      && turnEnds.every((end) => turnEndReasonKind(end) === 'completed'),
  }
  return {
    checks,
    detail: {
      turnCount: turnEnds.length,
      carrierCount: carriers.length,
      injectionSeq: injectSeq,
      followupSummarySeq: followupSummary?.seq,
    },
  }
}

// ── fabricated P4-T13 keyword-mode inputs (must earn their PASS) ──────────────
//
// A keyword-injection analysis can pass VACUOUSLY in a way the injection
// scenarios cannot: the negative controls pass when the hook is dead. So the
// self-test proves each analysis is sensitive by feeding it a fabricated GOOD
// input (must PASS) and then one defect at a time (each must FAIL on its OWN
// named check).
//
// The GOOD inputs are built from the REAL session-log event shapes the driver
// observed (a `user/message` claim carrying an `InjectedUserMessage`, a
// `turn/end`, an `assistant/message`) and the REAL request bodies, so a defect
// case is "the run went wrong like this", not "the fixture was shaped wrong".
const KEYWORD_FABRICATED_SESSION_ID = 'fabricated-keyword-session'
const KEYWORD_FABRICATED_SUMMARY_EVENT = { type: 'assistant/message', data: { text: ULTRAWORK_KEYWORD_SUMMARY } }

/** A `user/message` event carrying one plugin-injected message, verbatim shape. */
function fabricatedKeywordInjectedEvent(text, source, id) {
  return {
    type: 'user/message',
    data: {
      id,
      role: 'user',
      content: [{ type: 'text', text }],
      source,
    },
  }
}

/** The `InjectedUserMessage` the real hook builds, from the real module. */
function fabricatedKeywordInjection(text) {
  return keywordDetectorModule.buildInjectionMessage(text)
}

/**
 * The fabricated GOOD log for the main ultrawork scenario: turn 1 injects (splice
 * at seq 5, claim at seq 6), the model summarises, turn 1 ends; turn 2 (the
 * idempotency control) answers and ends with NO new carrier.
 */
function fabricatedKeywordGoodInput(routes) {
  const expectedText = buildExpectedInjectedText('ultrawork')
  const injected = fabricatedKeywordInjection(expectedText)
  const source = injected.source
  return {
    log: {
      header: { id: KEYWORD_FABRICATED_SESSION_ID },
      events: [
        { seq: 1, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: ULTRAWORK_KEYWORD_PROMPT }], source: { kind: 'user' } } },
        { seq: 2, type: 'tool/call', data: { name: 'bash', arguments: JSON.stringify({ command: KEYWORD_STEP_COMMAND }) } },
        { seq: 3, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', callId: 'call-1', content: [{ type: 'text', text: KEYWORD_STEP_MARKER }] }] } } },
        {
          seq: 4,
          type: 'agent/inbox/spliced',
          data: { target: 'next-step', inserted: [injected] },
        },
        { ...fabricatedKeywordInjectedEvent(expectedText, source, injected.id), seq: 5 },
        { ...KEYWORD_FABRICATED_SUMMARY_EVENT, seq: 6 },
        { seq: 7, type: 'turn/end', data: { reason: { kind: 'completed' } } },
        { seq: 8, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: ULTRAWORK_KEYWORD_FOLLOWUP_PROMPT }], source: { kind: 'user' } } },
        { seq: 9, type: 'assistant/message', data: { text: ULTRAWORK_KEYWORD_FOLLOWUP_SUMMARY } },
        { seq: 10, type: 'turn/end', data: { reason: { kind: 'completed' } } },
      ],
    },
    // The S-11 shape: request #0 predates the claim, #1 carries it.
    requests: [
      { role: 'sisyphus', body: { messages: [{ role: 'user', content: [{ type: 'text', text: ULTRAWORK_KEYWORD_PROMPT }] }] } },
      {
        role: 'sisyphus',
        body: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: ULTRAWORK_KEYWORD_PROMPT }] },
            { role: 'assistant', content: [{ type: 'text', text: 'ack' }] },
            fabricatedKeywordInjection(expectedText),
          ],
        },
      },
      {
        role: 'sisyphus',
        body: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: ULTRAWORK_KEYWORD_PROMPT }] },
            fabricatedKeywordInjection(expectedText),
            { role: 'user', content: [{ type: 'text', text: ULTRAWORK_KEYWORD_FOLLOWUP_PROMPT }] },
          ],
        },
      },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
  }
}

/**
 * The hyperplan scenario's GOOD input.
 *
 * It exists because the hyperplan scenario was otherwise self-test-INVISIBLE: it
 * had no fabricated good input and no defect cases, so nothing in `--self-test`
 * exercised `analyzeHyperplanKeywordInjected` at all. An analyzer that could only
 * ever return FAIL (a typo in a check name, a wrong prompt constant) would have
 * shown up as a green suite until a real run failed — which is the same
 * blind-spot shape MAJOR-4 found on the boot-log side, one layer in.
 *
 * Single turn, two steps — the hyperplan scenario has no followup prompt, unlike
 * the ultrawork one, so the idempotency checks are not part of its kernel.
 */
function fabricatedHyperplanGoodInput(routes) {
  const expectedText = buildExpectedInjectedText('hyperplan')
  const injected = fabricatedKeywordInjection(expectedText)
  return {
    log: {
      header: { id: KEYWORD_FABRICATED_SESSION_ID },
      events: [
        { seq: 1, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: HYPERPLAN_KEYWORD_PROMPT }], source: { kind: 'user' } } },
        { seq: 2, type: 'tool/call', data: { name: 'bash', arguments: JSON.stringify({ command: KEYWORD_STEP_COMMAND }) } },
        { seq: 3, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', callId: 'call-1', content: [{ type: 'text', text: KEYWORD_STEP_MARKER }] }] } } },
        { seq: 4, type: 'agent/inbox/spliced', data: { target: 'next-step', inserted: [injected] } },
        { ...fabricatedKeywordInjectedEvent(expectedText, injected.source, injected.id), seq: 5 },
        { seq: 6, type: 'assistant/message', data: { text: HYPERPLAN_KEYWORD_SUMMARY } },
        { seq: 7, type: 'turn/end', data: { reason: { kind: 'completed' } } },
      ],
    },
    // Same S-11 shape as the ultrawork fixture: request #0 predates the claim.
    requests: [
      { role: 'sisyphus', body: { messages: [{ role: 'user', content: [{ type: 'text', text: HYPERPLAN_KEYWORD_PROMPT }] }] } },
      {
        role: 'sisyphus',
        body: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: HYPERPLAN_KEYWORD_PROMPT }] },
            { role: 'assistant', content: [{ type: 'text', text: 'ack' }] },
            fabricatedKeywordInjection(expectedText),
          ],
        },
      },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
  }
}

/** The fabricated GOOD input for the three negative controls. */
function fabricatedKeywordNegativeGoodInput(routes) {
  const controlTwoText = KEYWORD_CONTROL_CODE_BLOCK_PROMPT
  const controlThreeText = KEYWORD_CONTROL_SLASH_PROMPT
  return {
    // The generic FABRICATED_BOOT_LOG carries only the three LOADED_MARKERS, but
    // this scenario's whole premise is that the hook is ALIVE — so the fixture
    // also carries the hook's own registration line, built through the
    // registrar's formatter (never a restated string, so a reword cannot leave
    // the fixture asserting a phrase the registrar no longer prints).
    //
    // ⚠️ This key used to appear TWICE in this one object literal, the second
    // (plain, without the registration line) winning and silently undoing the
    // first. The symptom was a GOOD input failing its own premise check, which
    // is the only thing that made the shadowing visible.
    bootLog: [
      FABRICATED_BOOT_LOG,
      omoHooksMarkers.formatHookRegisteredLine(
        keywordDetectorModule.KEYWORD_DETECTOR_ID, 'agent/pre-step',
      ),
    ].join('\n'),
    log: {
      header: { id: 'fabricated-keyword-negatives' },
      events: [
        { seq: 1, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: KEYWORD_CONTROL_NONE_PROMPT }], source: { kind: 'user' } } },
        { seq: 2, type: 'assistant/message', data: { text: KEYWORD_CONTROL_SUMMARY } },
        { seq: 3, type: 'turn/end', data: { reason: { kind: 'completed' } } },
        { seq: 4, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: controlTwoText }], source: { kind: 'user' } } },
        { seq: 5, type: 'assistant/message', data: { text: KEYWORD_CONTROL_SUMMARY } },
        { seq: 6, type: 'turn/end', data: { reason: { kind: 'completed' } } },
        { seq: 7, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: controlThreeText }], source: { kind: 'user' } } },
        { seq: 8, type: 'assistant/message', data: { text: KEYWORD_CONTROL_SUMMARY } },
        { seq: 9, type: 'turn/end', data: { reason: { kind: 'completed' } } },
      ],
    },
    requests: [
      { role: 'sisyphus', body: { messages: [{ role: 'user', content: [{ type: 'text', text: KEYWORD_CONTROL_NONE_PROMPT }] }] } },
      { role: 'sisyphus', body: { messages: [{ role: 'user', content: [{ type: 'text', text: controlTwoText }] }] } },
      { role: 'sisyphus', body: { messages: [{ role: 'user', content: [{ type: 'text', text: controlThreeText }] }] } },
    ],
    providersJson: fabricatedProvidersJson(routes),
  }
}

/**
 * The fabricated GOOD input for the combo scenario: one turn, two steps, the
 * combo message carried once (splice + claim) and carried on request #1.
 */
function fabricatedComboGoodInput(routes) {
  const expectedText = buildExpectedInjectedText('hyperplan-ultrawork')
  const injected = fabricatedKeywordInjection(expectedText)
  return {
    log: {
      header: { id: 'fabricated-combo-session' },
      events: [
        { seq: 1, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: COMBO_KEYWORD_PROMPT }], source: { kind: 'user' } } },
        { seq: 2, type: 'tool/call', data: { name: 'bash', arguments: JSON.stringify({ command: KEYWORD_STEP_COMMAND }) } },
        { seq: 3, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', callId: 'call-1', content: [{ type: 'text', text: KEYWORD_STEP_MARKER }] }] } } },
        { seq: 4, type: 'agent/inbox/spliced', data: { target: 'next-step', inserted: [injected] } },
        { ...fabricatedKeywordInjectedEvent(expectedText, injected.source, injected.id), seq: 5 },
        { seq: 6, type: 'assistant/message', data: { text: COMBO_KEYWORD_SUMMARY } },
        { seq: 7, type: 'turn/end', data: { reason: { kind: 'completed' } } },
      ],
    },
    requests: [
      { role: 'sisyphus', body: { messages: [{ role: 'user', content: [{ type: 'text', text: COMBO_KEYWORD_PROMPT }] }] } },
      {
        role: 'sisyphus',
        body: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: COMBO_KEYWORD_PROMPT }] },
            fabricatedKeywordInjection(expectedText),
          ],
        },
      },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// P4-T7 — the COMMAND CHANNEL pilot scenarios (`handoff-summary-driven`,
// `remove-ai-slops-driven`). This is the channel 打样 every later command
// scenario copies, so the transport facts are recorded here once.
//
// ── HOW A COMMAND REACHES THE HOST (measured; NOT the prompt path) ──────────
// A slash line is admitted by the commands registry's own executor, reached
// over a DEDICATED rpc — never by `session/prompt`:
//
//   commands/execute(agentId, line, submittedAttachments)
//     → dsh-commands/lib/typert.host.js:44-89 (service/namespace `commands`,
//       method `execute`, wire names `agentId` / `line` /
//       `submittedAttachments`, cancellation on `signal`)
//     → dsh-commands/lib/index.js:316-345: `parseCommand` + registry lookup,
//       then a `command/run` append, the handler, and a `command/done` append.
//
// The Web UI calls exactly this and only falls back to prompting when the
// admission returned nothing (dsh-client-ui-commands/lib/client.js:796), which
// is why the driver reproduces that fallback instead of inventing one.
//
// ── ADMISSION MISS IS ZERO EVENTS, NOT AN ERROR (the 对照's whole claim) ────
// `execute` returns `undefined` for a syntax or unknown-name miss and appends
// NOTHING: "Admission misses (syntax or unknown name) log nothing — they never
// entered a handler" (dsh-commands/lib/index.js:296-299), and the paired miss
// path is the same non-throwing early return (:319-321). So the control asserts
// the ABSENCE of both lifecycle events plus the plain-prompt fallback — a
// scenario that expected a native error would be asserting the opposite of the
// measured behaviour.
//
// ── A HANDLED COMMAND OWNS ITS OWN TURN (why no kick prompt is needed) ─────
// The ported handlers inject through `agent.followup(message)`, whose contract
// is "Queue an ordinary follow-up turn and wake the driver. The item becomes the
// sole ordinary message of its own turn"
// (dsh-agent/lib/types/runtime-types.d.ts:186-192). So the injected instruction
// opens a turn BY ITSELF: the driver's first model request already carries it,
// and nothing has to nudge the loop. The scenario asserts exactly that ordering
// (request index 0, not 1) so a future "wait for a prompt" wiring would fail
// rather than silently pass.
//
// ── THE HEAD-HOLE THIS PILOT CLOSES ───────────────────────────────────────
// If the command were never registered, the line would fall through to the
// prompt path and the model would still "respond" — a scenario that only looked
// for model prose would pass on a build with NO command support at all. Every
// scenario therefore also pins the boot-log registration line
// (`[omo-commands] command handoff registered`, formatter-derived from
// patches/omo-dsh/omo-commands/src/boot-markers.ts), the way P3-T13 pins the
// keyword detector's registration.
const COMMAND_CHANNEL_UNKNOWN_LINE = '/definitely-not-a-command 用一句话说明这个仓库'
const COMMAND_CHANNEL_CONTROL_REPLY =
  'MOCK-COMMAND-CONTROL-7d31ab: 这一行不是已注册的命令，所以我按普通提问回答'
// The ISO stamp the injected `<session-context>` carries. Asserted for SHAPE
// only (`2026-…T…`) — never for a value: the runtime clock is not ours.
const COMMAND_CHANNEL_TIMESTAMP_SHAPE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

// MEASURED, and the leading space is the load-bearing part: `parseCommand` returns
// `rawInput: line.slice(match[0].length)` with match[0] === '/handoff' and its own
// JSDoc saying "Parse an exact slash command **without normalizing its trailing
// input**" (dsh-commands/lib/types/index.js:67-82). So the separator space is part
// of the args the registry logs and the handler renders. Transcribing it here is
// the point: an expectation written without it would fail against the real host
// (it did — that is how the shape was measured, not guessed).
// LOCAL CONVENTION, NOT AN UPSTREAM ASSET (registered here so nobody cites it as
// a port): upstream omo-opencode has NO command handler for these entries — its
// slash commands are expanded into the model prompt by its auto-slash-command
// executor, so upstream never produces a `command/done` payload at all. The
// `kind` + `text` wording the port's handlers return ("<Name> instruction queued
// (N chars…); it takes effect in the next turn.") was WRITTEN FOR THIS PORT
// (patches/omo-dsh/omo-commands/src/commands/{handoff,remove-ai-slops}.ts) as a
// local reporting convention, and the char count is checked here against the real
// injected payload so the convention cannot drift into a fabricated number.
const HANDOFF_COMMAND_ARGS = ' 完成 P4-T7 命令通道的 e2e 打样'
// The goal as a human reads it — used only in the mock's summary prose, where the
// model echoes the request rather than the wire string.
const HANDOFF_COMMAND_GOAL = '完成 P4-T7 命令通道的 e2e 打样'
const HANDOFF_COMMAND_LINE = `/handoff${HANDOFF_COMMAND_ARGS}`
const HANDOFF_DESCRIPTION =
  '(builtin) Create a detailed context summary for continuing work in a new session'
// The template's OWN output-format block (patches/omo-dsh/omo-commands/src/
// templates/handoff.ts:151-205, "Generate a handoff summary using this exact
// format"). The mock obeys it, and the analyzer reads these section headers out
// of the assistant message: the model acted on the injected template, it did not
// just acknowledge it.
const HANDOFF_OUTPUT_SECTION_HEADERS = [
  'HANDOFF CONTEXT',
  'USER REQUESTS (AS-IS)',
  'GOAL',
  'WORK COMPLETED',
  'CURRENT STATE',
  'PENDING TASKS',
  'KEY FILES',
  'IMPORTANT DECISIONS',
  'EXPLICIT CONSTRAINTS',
  'CONTEXT FOR CONTINUATION',
]
const HANDOFF_SUMMARY_TEXT = [
  'MOCK-HANDOFF-SUMMARY-2f8a61: 按注入模板的格式输出交接摘要',
  '',
  'HANDOFF CONTEXT',
  '===============',
  '',
  'USER REQUESTS (AS-IS)',
  '---------------------',
  `- ${HANDOFF_COMMAND_GOAL}`,
  '',
  'GOAL',
  '----',
  '打通命令通道并留下可判定的证据',
  '',
  'WORK COMPLETED',
  '--------------',
  '- 驱动发出 /handoff 命令行',
  '- 模型收到 <command-instruction> 正文并按格式产出摘要',
  '',
  'CURRENT STATE',
  '-------------',
  '- 命令注册面可见，生命周期事件成对出现',
  '',
  'PENDING TASKS',
  '-------------',
  '- 其余命令场景复用同一条通道',
  '',
  'KEY FILES',
  '---------',
  '- tests/e2e/drive.mjs - 场景驱动',
  '',
  'IMPORTANT DECISIONS',
  '-------------------',
  '- 走 commands/execute 专用 rpc，而不是把命令行当 prompt 发',
  '',
  'EXPLICIT CONSTRAINTS',
  '--------------------',
  '- None',
  '',
  'CONTEXT FOR CONTINUATION',
  '------------------------',
  '- 通道已打通，下一条命令只需要换模板与断言锚点',
].join('\n')

const SLOPS_DESCRIPTION =
  '(builtin) Remove AI-generated code smells from branch changes and critically review the results'
// The template's OWN Output Format block (templates/remove-ai-slops.ts:137-155).
const SLOPS_OUTPUT_ANCHORS = [
  '## AI Slop Removal Summary',
  '### Files Processed',
  '### Critical Review Results',
  '- Safety:',
  '- Behavior:',
  '- Quality:',
  '### Issues Found & Fixed',
  '### Final Status',
]
const SLOPS_SUMMARY_TEXT = [
  'MOCK-REMOVE-AI-SLOPS-REPORT-c41d07: 按注入模板的 Output Format 输出',
  '',
  '## AI Slop Removal Summary',
  '',
  '### Files Processed',
  '- src/example.py: 2 changes',
  '',
  '### Critical Review Results',
  '- Safety: PASS',
  '- Behavior: PASS',
  '- Quality: PASS',
  '',
  '### Issues Found & Fixed',
  '1. 冗余注释包裹代码 -> 删除注释',
  '',
  '### Final Status',
  'CLEAN',
].join('\n')

/**
 * One scenario's command-channel shape. `frameLines` is the 外框 transcribed as
 * exact lines (render.ts `formatCommandTemplate`, ported from upstream
 * `executor.ts:113-152`): each section carries a trailing `\n` and the sections
 * are joined with `\n`, so every adjacent pair is separated by ONE blank line.
 * Transcribed, never derived from the plugin, so the assertion cannot follow a
 * regression in the thing under test.
 */
const COMMAND_CHANNEL_SPECS = {
  handoff: {
    commandId: 'handoff',
    bootRegistrationLine: '[omo-commands] command handoff registered',
    line: HANDOFF_COMMAND_LINE,
    args: HANDOFF_COMMAND_ARGS,
    description: HANDOFF_DESCRIPTION,
    frameLines: [
      '# /handoff Command',
      `**Description**: ${HANDOFF_DESCRIPTION}`,
      `**User Arguments**: ${HANDOFF_COMMAND_ARGS}`,
      '**Scope**: builtin',
      '---',
      '## Command Instructions',
    ],
    // The instruction BODY's own landmarks (carrier note → template heading →
    // the format phase the model is supposed to obey → the close of the
    // `<command-instruction>` wrapper → the session-context/user-request tail).
    bodyNeedles: [
      '<command-instruction>',
      '[oh-my-opendsh] Handoff carrier note',
      '# Handoff Command',
      '## Purpose',
      '# PHASE 3: FORMAT OUTPUT',
      '</command-instruction>',
      '<session-context>',
      '</session-context>',
      '<user-request>',
      '</user-request>',
    ],
    sessionContextExpected: true,
    outputAnchors: HANDOFF_OUTPUT_SECTION_HEADERS,
    summaryText: HANDOFF_SUMMARY_TEXT,
    doneTextPattern: /^Handoff instruction queued \((\d+) chars, session ([^)]+)\); it takes effect in the next turn\.$/,
  },
  'remove-ai-slops': {
    commandId: 'remove-ai-slops',
    bootRegistrationLine: '[omo-commands] command remove-ai-slops registered',
    // The NO-ARGUMENT variant: this row carries no argumentHint upstream
    // (commands.ts:85-92), so its frame omits the `**User Arguments**` line
    // entirely (upstream:117 `if (args)`).
    line: '/remove-ai-slops',
    args: '',
    description: SLOPS_DESCRIPTION,
    frameLines: [
      '# /remove-ai-slops Command',
      `**Description**: ${SLOPS_DESCRIPTION}`,
      '**Scope**: builtin',
      '---',
      '## Command Instructions',
    ],
    bodyNeedles: [
      '<command-instruction>',
      '[oh-my-opendsh] Remove AI slops carrier note',
      '# Remove AI Slops Command',
      '## Output Format',
      '</command-instruction>',
      '<user-request>',
      '</user-request>',
    ],
    // No `<session-context>` in this template (templates/remove-ai-slops.ts:188-191:
    // only `$ARGUMENTS` is used upstream), so its render never needed a session id.
    sessionContextExpected: false,
    outputAnchors: SLOPS_OUTPUT_ANCHORS,
    summaryText: SLOPS_SUMMARY_TEXT,
    doneTextPattern: /^Remove-AI-slops instruction queued \((\d+) chars\); it takes effect in the next turn\.$/,
  },
}

/** The mock script: turn 1 is the command's own follow-up turn, turn 2 the 对照. */
function commandChannelScript(spec) {
  return {
    sisyphus: [
      { type: 'text', text: spec.summaryText },
      { type: 'text', text: COMMAND_CHANNEL_CONTROL_REPLY },
    ],
  }
}

/**
 * The command-channel assertions. `commandResults` is what the driver observed
 * on the wire for each line it submitted (the admission value or `undefined`),
 * which is the one thing the session log cannot tell us.
 */
export function analyzeCommandChannelDriven({ log, requests, bootLog, commandResults }, spec, routes) {
  const events = log?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const sessionId = String(log?.header?.id ?? '')
  const admission = (commandResults ?? []).find((entry) => entry.line === spec.line)
  const controlAdmission = (commandResults ?? []).find((entry) => entry.line === COMMAND_CHANNEL_UNKNOWN_LINE)

  const runs = events.filter((event) => event.type === 'command/run')
  const dones = events.filter((event) => event.type === 'command/done')
  const run = runs.find((event) => event.data?.name === spec.commandId)
  const done = dones.find((event) => event.data?.commandId === run?.data?.commandId)

  // The injected instruction as a DURABLE carrier (the follow-up turn's own
  // ordinary message), located by the frame header the ported render writes.
  const injectedCarrier = events
    .filter((event) => event.type === 'user/message')
    .map((event) => ({ event, text: messageContentText(event.data) }))
    .find((candidate) => candidate.text.includes(`# /${spec.commandId} Command`))
  const injectedText = injectedCarrier?.text ?? ''

  const frameLinePresent = spec.frameLines.every((line) => injectedText.includes(line))
  const frameInOrder = spec.frameLines.every((line, index) =>
    index === 0 || injectedText.indexOf(spec.frameLines[index - 1]) < injectedText.indexOf(line))
  const noUserArgumentsLineWhenNoArgs = spec.args === ''
    ? !injectedText.includes('**User Arguments**')
    : injectedText.includes(`**User Arguments**: ${spec.args}`)
  // Placeholders must be GONE (upstream substitutes them; leaving one would hand
  // the model a literal `$ARGUMENTS`), and the substituted session id must be
  // THIS session's — cross-checked against the log header, not against the
  // command payload.
  const noPlaceholderSurvived =
    !/\$\{?user_message\}?|\$ARGUMENTS|\$TIMESTAMP|\$SESSION_ID/.test(injectedText)
  // Symmetric on purpose: a spec whose template has NO <session-context> must not
  // grow one. The old `? true` branch made that silent (a stray block would pass),
  // and this scenario family owns both shapes — so both directions are checked.
  const sessionContextSubstituted = spec.sessionContextExpected
    ? new RegExp(`Session ID: ${sessionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(injectedText)
      && COMMAND_CHANNEL_TIMESTAMP_SHAPE.test(injectedText)
    : !injectedText.includes('<session-context>')

  // (d) the wire: the instruction rode the FIRST model request of the session —
  // proof it opened its own turn instead of riding a later prompt.
  const instructionRequestIndex = sisyphusRequests.findIndex((request) =>
    requestMessagesContain(request, `# /${spec.commandId} Command`))
  const controlRequestIndex = sisyphusRequests.findIndex((request) =>
    requestMessagesContain(request, COMMAND_CHANNEL_UNKNOWN_LINE))

  const summary = events.find(
    (event) => event.type === 'assistant/message'
      && messageContentText(event.data?.message ?? event.data).includes(spec.outputAnchors[0]),
  )
  const summaryText = summary === undefined ? '' : messageContentText(summary.data?.message ?? summary.data)
  const controlReply = events.find(
    (event) => event.type === 'assistant/message'
      && messageContentText(event.data?.message ?? event.data).includes('MOCK-COMMAND-CONTROL-'),
  )
  const turnEnds = events.filter((event) => event.type === 'turn/end')

  // The done text's char count must describe the payload that were really
  // injected — the number is cross-checked against the carrier, not trusted.
  const doneText = done?.data?.text ?? ''
  const doneMatch = spec.doneTextPattern.exec(doneText)
  // TWO booleans instead of one with a vacuous branch: the old `doneNamesThisSession`
  // degraded to `true` whenever the no-argument spec matched, because a regex with
  // one capture group makes `doneMatch.length === 2` constant. For that spec the
  // real claim is the NEGATIVE one — its done text must NOT name a session at all,
  // because that handler never received one in its text.
  const doneMentionsThisSession = spec.sessionContextExpected
    ? doneMatch !== null && doneMatch[2] === sessionId
    : true
  const doneOmitsSessionClause = spec.sessionContextExpected
    ? true
    : doneMatch !== null && !doneText.includes('session ')

  // 对照: the unknown line produced NO lifecycle pair at all. Exactly one run and
  // one done exist in the whole log, and both belong to this scenario's command.
  const controlProducedNoEvents = runs.length === 1 && dones.length === 1
    && runs[0]?.data?.name === spec.commandId
  const controlWasNotAdmitted = controlAdmission !== undefined
    && controlAdmission.matched === false
    && controlAdmission.admission === undefined
  const controlFellBackToPrompt = events.some(
    (event) => event.type === 'user/message'
      && messageContentText(event.data).includes(COMMAND_CHANNEL_UNKNOWN_LINE),
  )

  // Two of the checks below (`deadLinkRuleIsDiscriminating`,
  // `commandBodyRejectsInvertedFrameTags`) do not assert anything about the RUN — they
  // assert that this driver's own copies of two rules still bite. They are kept inside
  // `checks` rather than moved out so the SELF-TEST OK line counts them and a future
  // weakening of either shows up in this scenario's assertion list instead of hiding
  // in a helper nobody reads. The cost is that "27 assertions" mixes the two kinds;
  // the bonus block labels them (`driverSelfChecks`).
  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    // The head-hole guard: without this line the whole scenario could pass on a
    // build where the command was never registered at all.
    commandRegisteredInBootLog: bootLog.includes(spec.bootRegistrationLine),
    commandAdmissionMatched: admission !== undefined
      && admission.matched === true
      && admission.admission?.result?.kind === 'success',
    commandRunRecordedWithArgsAndUserSource: run !== undefined
      && run.data.name === spec.commandId
      && run.data.args === spec.args
      && run.data.source?.kind === 'user'
      && typeof run.data.commandId === 'string'
      && run.data.commandId.length > 0,
    commandDonePairedAndSucceeded: done !== undefined
      && done.data.kind === 'success'
      && done.data.commandId === run?.data?.commandId
      && run !== undefined
      && run.seq < done.seq,
    // Q-1's timing, MEASURED on this host (both commands, identical):
    //   command/run seq 3 → command/done seq 7 → the injected carrier seq 10.
    // The handler queues the follow-up INSIDE its own execution, yet that message
    // is claimed only at the next-turn inbox boundary — strictly AFTER the
    // `command/done` append the host writes as the handler settles. Asserting the
    // measured pair-then-carrier order (rather than the order the code suggests)
    // is what makes "the injection takes effect in the NEXT turn" a checked
    // property instead of a comment.
    injectedCarrierClaimedAfterCommandDone: injectedCarrier !== undefined
      && done !== undefined
      && done.seq < injectedCarrier.event.seq,
    // The done text names the real payload size and the real session.
    doneTextDescribesInjectedPayload: doneMatch !== null
      && Number(doneMatch[1]) === injectedText.length,
    doneSessionClauseMatchesTheCarrier: doneMentionsThisSession && doneOmitsSessionClause,
    injectedInstructionCarriedAsUserMessage: injectedCarrier !== undefined
      && injectedCarrier.event.data?.role === 'user'
      && injectedCarrier.event.data?.source?.kind === 'user'
      && typeof injectedCarrier.event.data?.id === 'string',
    injectedInstructionFrameIsUpstreamShape: injectedText.length > 0
      && frameLinePresent
      && frameInOrder
      && noUserArgumentsLineWhenNoArgs,
    injectedInstructionBodyIsTheTemplateBody: spec.bodyNeedles.every((needle) => injectedText.includes(needle))
      && noPlaceholderSurvived
      && sessionContextSubstituted,
    // The own-turn claim: request #0 of this session already carried it.
    injectedInstructionReachedFirstModelRequest: instructionRequestIndex === 0,
    modelFollowedTemplateOutputFormat: spec.outputAnchors.every((anchor) => summaryText.includes(anchor)),
    commandTurnCompleted: turnEnds.length >= 1 && turnEndReasonKind(turnEnds[0]) === 'completed',
    // 对照 (admission miss): zero events, no error, plain-prompt fallback.
    controlUnknownLineAdmittedNothing: controlProducedNoEvents && controlWasNotAdmitted,
    controlUnknownLineFellBackToPrompt: controlFellBackToPrompt && controlRequestIndex === 1,
    controlTurnCompleted: turnEnds.length === 2 && turnEndReasonKind(turnEnds[1]) === 'completed'
      && controlReply !== undefined,
    mockSawExpectedRequestCount: sisyphusRequests.length === 2,
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    commandLine: spec.line,
    commandArgs: spec.args,
    admission: admission?.admission ?? null,
    controlAdmission: controlAdmission ?? null,
    commandRun: run === undefined ? null : { seq: run.seq, data: run.data },
    commandDone: done === undefined ? null : { seq: done.seq, data: done.data },
    injectedInstructionChars: injectedText.length,
    injectedInstructionSource: injectedCarrier?.event?.data?.source ?? null,
    injectedInstructionHead: injectedText.split('\n').slice(0, 8),
    instructionRequestIndex,
    controlRequestIndex,
    // The Q-1 timing claim, MEASURED rather than assumed, and ASSERTED by
    // `injectedCarrierClaimedAfterCommandDone` above: the lifecycle pair is
    // appended around the handler, but the follow-up the handler queued is
    // claimed only at the next-turn inbox boundary — so the real order is
    // pair-then-carrier (run → done → carrier), NOT the code order a reader
    // would guess. Key order matches that sequence.
    eventOrder: {
      commandRun: run?.seq ?? null,
      commandDone: done?.seq ?? null,
      injectedCarrier: injectedCarrier?.event?.seq ?? null,
    },
    outputAnchorsMissing: spec.outputAnchors.filter((anchor) => !summaryText.includes(anchor)),
    turnEndReasons: turnEnds.map((event) => ({ seq: event.seq, turn: event.data?.turn ?? null, kind: turnEndReasonKind(event) ?? null })),
    commandRunCount: runs.length,
    commandDoneCount: dones.length,
    mockRequestCount: sisyphusRequests.length,
    mockRequestModels: [...new Set(sisyphusRequests.map((request) => request.body?.model))],
    sisyphusRoute: `${routes.sisyphus.provider}/${routes.sisyphus.model}`,
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}
/** The request `/hyperplan` is asked to plan. A vague, interview-shaped ask. */
const HYPERPLAN_REQUEST = '把用户登录改造成支持单点登录'

// ── Shared helpers for the two P4-T15 scenarios ───────────────────────────────

/**
 * The MODEL-FACING body of a command frame: everything from the opening
 * `<command-instruction>` to its own closing tag.
 *
 * The slice is open→close, and a MISSING tag THROWS. Both halves are load-bearing
 * and both are inherited from T14's inverted-slice defect: slicing from the closing
 * tag onward covers only the tail (so a guard built on it looked strict and was
 * empty), and an `indexOf` of -1 would silently produce a `slice(0, -1)` — almost
 * the whole string — turning a missing frame into a PASS. A fabricated fixture that
 * drops the frame must blow up, not go green.
 */
function commandBody(text) {
  const open = text.indexOf('<command-instruction>')
  const close = text.indexOf('</command-instruction>')
  if (open === -1 || close === -1) {
    throw new Error(`frame not found: open=${open} close=${close}`)
  }
  // `close <= open` is its OWN check, not part of the -1 test above: a frame whose
  // closing tag PRECEDES its opening tag yields `slice(open, close + len)` over a
  // negative span, which JavaScript clamps to the empty string — so every
  // `body.includes(...)` and `deadLinkFree('')` downstream would pass vacuously.
  // This is the same failure class T14 already paid for in hyperplan.test.ts:184.
  if (close <= open) {
    throw new Error(`frame tags inverted: open=${open} close=${close}`)
  }
  return text.slice(open, close + '</command-instruction>'.length)
}

/**
 * The full text of the assistant message carrying `marker`, or '' if none did.
 *
 * The '' fallback is deliberate and is NOT a silent pass: every caller turns a ''
 * into a named check failing on content, so "the reply never arrived" reads as
 * `modelDeclaredDegradedModeOutLoud: false` rather than a crash or a vacuous true.
 */
function findAssistantText(events, marker) {
  const hit = events.find(
    (event) => event.type === 'assistant/message'
      && messageContentText(event.data?.message ?? event.data).includes(marker),
  )
  return hit === undefined ? '' : messageContentText(hit.data?.message ?? hit.data)
}

/** The request the ulw-plan gesture carries. Vague on purpose — that is the input
 *  the skill's interview phase is built to handle, so a persona that skips straight
 *  to a plan would be a real behavioural failure, not a formatting nit. */
const ULW_PLAN_REQUEST = '给我们的报表系统做个改造方案'
/** A sentinel from ulw-plan's BODY (not its frontmatter), so the "the injected body
 *  really is this skill" check cannot be satisfied by a description-only match. */
const ULW_PLAN_BODY_SENTINEL = '## INTENT ROUTING - pick ONE intent reference'

// ── P4-T15: hyperplan-degraded-noted — the DEGRADED GUIDANCE really reaches the model
// ONE session, TWO turns, ONE command. The transport is the P4-T7 command channel
// (admission → `command/run` → `command/done` → the injected frame as a follow-up
// user message), and this scenario adds the claims T14's rewrite exists for:
//
//   1. REGISTRATION — `/hyperplan` is a REAL command here, so the lifecycle pair
//      exists at all. That is the same fact the `ulw-plan` scenario below pins from
//      the OTHER side (no command → no lifecycle pair), and the pair of scenarios is
//      what makes "a gesture is not a command" a checked contrast rather than a
//      claim about one deployment's registry.
//   2. THE DEGRADED GUIDANCE IS WHAT THE MODEL RECEIVES — asserted against the
//      SHIPPED constants (`HYPERPLAN_DEGRADED_GUIDANCE`, `HYPERPLAN_ROSTER_CONTRACT`),
//      imported below, never restated. A restated copy would let the e2e pass on a
//      template that no longer says any of it.
//   3. ZERO EXECUTABLE DEAD LINKS — T14's guard, spot-checked at the e2e layer: the
//      model-facing body carries no filesystem path of any shape, and every mention of
//      an absent team tool sits in a DENYING sentence. Reuse of the T14 rule, not a
//      weaker second opinion: `deadLinkFree()` below is the same sentence-splitting
//      predicate, so a T14 fix and this e2e cannot drift apart silently.
//   4. THE DEGRADED SUFFIX IS IN THE FRAME'S DESCRIPTION LINE — the MAJOR-1
//      commitment, checked where the model actually reads it.
//   5. 对照 — the same command with NO argument. Upstream gives hyperplan an
//      `argumentHint` (`[planning-request]`), so the argument-bearing turn's frame
//      MUST carry a `**User Arguments**` line and the bare turn's frame MUST NOT.
//      That asymmetry is the frame's own shape, asserted per turn rather than once.
const omoCommandsHyperplan = await import('../../patches/omo-dsh/omo-commands/src/templates/hyperplan.ts')
const omoCommandsHyperplanCommand = await import('../../patches/omo-dsh/omo-commands/src/commands/hyperplan.ts')
// P4-T15: the render PAIR the fabricated frame is built with — the same two
// functions the hyperplan handler itself calls, so a fixture frame is a real
// product of the shipped renderer rather than a transcription of one.
const omoCommandsRender = await import('../../patches/omo-dsh/omo-commands/src/templates/render.ts')

const HYPERPLAN_COMMAND_LINE = `/hyperplan ${HYPERPLAN_REQUEST}`
// MEASURED (0.1.5-rc.1, this scenario's own real run): the host's admission strips
// the `/hyperplan` token but NOT the space after it, so `args` arrives as
// `' 把用户登录…'` — leading space included — and the frame's `**User Arguments**`
// line and `<user-request>` body carry that same leading space. Asserted as a
// measurement, not absorbed: if the host ever trims, these checks go red and
// someone investigates, which is the opposite of a test written to whatever the
// runtime happened to emit.
const HYPERPLAN_MEASURED_ARGS = ` ${HYPERPLAN_REQUEST}`
// The bare variant: the SAME command with no argument, which is the 对照 for the
// frame's `**User Arguments**` line. Not `/hyperplan` on its own — the driver
// submits the line verbatim, and a bare `/hyperplan` is a legal admission.
const HYPERPLAN_BARE_COMMAND_LINE = '/hyperplan'
const HYPERPLAN_BOOT_REGISTRATION_LINE = '[omo-commands] command hyperplan registered'
// The model's reply to the degraded instruction. It must SAY the mode out loud,
// which is the one thing the guidance asks the model to do unconditionally
// (item 6: "Say plainly, in your reply, that this ran in DEGRADED mode").
const HYPERPLAN_DEGRADED_SUMMARY =
  'MOCK-HYPERPLAN-DEGRADED-8e51c3: DEGRADED mode — no team-mode surface, so the adversarial roles ran as roster delegations.'
const HYPERPLAN_BARE_SUMMARY =
  'MOCK-HYPERPLAN-BARE-3d70a9: DEGRADED mode — no team-mode surface, so the adversarial roles ran as roster delegations.'

/**
 * T14's dead-link rule, in its e2e form. The unit suite keeps the identical rule as
 * a `describe`-LOCAL function (tests/omo-commands/hyperplan.test.ts) — it is NOT
 * exported, and this copy is not derived from it at runtime. That is the point: the
 * e2e layer is an independent witness, so the two can disagree and the disagreement
 * is visible. If they ever need to be unified, do it by moving the unit's rule into a
 * shared module — NOT by importing it, which would leave one verdict behind both.
 *
 * Returns every violation found.
 */
function deadLinkFree(body) {
  const found = []
  for (const dead of ['team_create', 'task_send', 'team_delete']) {
    for (const sentence of body.split(/(?<=[.;])|\n/).filter((part) => part.includes(dead))) {
      if (!/\b(no|not|never|without|skip|absent|does not|do not|don'?t|cannot)\b/i.test(sentence)) {
        found.push(`${dead} sits in a non-denying sentence: ${JSON.stringify(sentence.trim())}`)
      }
    }
  }
  const pathish = /omo\.jsonc|oh-my-opencode|~[/.]/.exec(body)
  if (pathish !== null) found.push(`a filesystem path reached the model: ${pathish[0]}`)
  for (const category of ['unspecified-low', 'unspecified-high', 'ultrabrain', 'artistry', 'deep']) {
    if (body.includes(category)) found.push(`upstream category ${category} reached the model`)
  }
  return found
}

/**
 * MINOR-7: the e2e copy of T14's rule is DISCRIMINATING, checked on this side too.
 * T14's unit suite already falsifies its own copy against a cross-sentence
 * laundering ("…no team_create exists. Then call team_create…"); a second,
 * independent implementation of the same rule can easily be the laxer one, and the
 * e2e is where a real regression would land. So the same attack is run here — if
 * this copy would wave it through, the e2e layer is the weaker witness and the
 * check below says so.
 */
/**
 * `commandBody` REJECTS a frame whose closing tag precedes its opening tag.
 *
 * This exists because the `close <= open` guard was, on its own, not falsifiable:
 * removing it changed nothing, because no case fed `commandBody` an inverted frame,
 * and a fixture that did would THROW through the analyzer and abort the whole
 * self-test rather than report one failed check. Exercised directly instead — the
 * same shape as `e2eRuleCatchesCrossSentenceLaundering` — a regression here is a
 * clean named failure instead of a crash.
 */
function commandBodyRejectsInvertedFrameTags() {
  try {
    commandBody('</command-instruction>\nbody\n<command-instruction>')
    return false
  } catch (error) {
    // NARROW, not a bare `catch {}`. This must swallow EXACTLY the guard's own
    // complaint about inverted tags — if `commandBody` threw for any other reason
    // (a TypeError from a malformed argument, say), a bare catch would report that
    // as "the guard works", which is the failure mode this whole check exists to
    // catch. Anything else is re-thrown.
    if (error instanceof Error && error.message.startsWith('frame tags inverted')) return true
    throw error
  }
}

function e2eRuleCatchesCrossSentenceLaundering() {
  return deadLinkFree(
    'There is no team_create here. Then call team_create with the roster members.',
  ).some((finding) => finding.includes('non-denying sentence'))
}

/** hyperplan-degraded-noted script: the command turn, then the bare 对照 turn. */
function hyperplanDegradedScript() {
  return {
    sisyphus: [
      { type: 'text', text: HYPERPLAN_DEGRADED_SUMMARY },
      { type: 'text', text: HYPERPLAN_BARE_SUMMARY },
    ],
  }
}

/**
 * The two injected frames, located the way the command channel locates them: by the
 * frame header the ported render writes, so each is matched to its own turn rather
 * than "whichever came first" — the two turns carry the same `# /hyperplan Command`
 * header, and a `find` would read turn 1's body for turn 2's assertions.
 */
export function analyzeHyperplanDegradedNoted({ log, requests, bootLog, commandResults }, routes) {
  const events = log?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const sessionId = String(log?.header?.id ?? '')

  const runs = events.filter((event) => event.type === 'command/run')
  const dones = events.filter((event) => event.type === 'command/done')
  const hyperplanRuns = runs.filter((event) => event.data?.name === 'hyperplan')

  const carriers = events
    .filter((event) => event.type === 'user/message')
    .map((event) => ({ event, text: messageContentText(event.data) }))
    .filter((candidate) => candidate.text.startsWith('# /hyperplan Command'))
  // The two carriers are told apart BY THEIR OWN CONTENT, not by array position.
  // Index-based `carriers[0]` / `carriers[1]` was wrong: if the first frame never
  // arrived, the SECOND frame silently became `carriers[0]` and every first-frame
  // check was answered by the bare frame's contents — `firstFrameCarrierArrived`
  // stayed true and the miss was invisible. The argument-bearing frame is the one
  // that carries a `**User Arguments**` line, which is the very asymmetry the 对照
  // exists to test, so the locator and the claim are the same fact.
  // The two carriers are told apart POSITIONALLY (`first` / everything else), NOT by
  // whether their text carries a `**User Arguments**` line. The content-based version
  // made `bareFrameOmitsUserArgumentsLine` a tautology: the locator selected the
  // carrier that lacked the line, so the check was guaranteed true by the selection
  // itself, and when it did fail the report stated a falsehood ("this frame has a
  // `**User Arguments**` line" about the frame chosen for lacking one). The content
  // test now lives ONLY in the assertions, which is where it can be wrong.
  const first = carriers[0]
  const second = carriers.find((candidate) => candidate !== first)
  // LAZY, and separately named. The first version called `commandBody(first?.text
  // ?? '')` unconditionally, so a MISSING carrier made `commandBody` throw on its
  // own guard; runScenario's catch then collapsed the whole verdict into an opaque
  // crash string and all 23 named checks were lost. A missing carrier is a normal
  // FAIL, not a crash — it now shows up as `firstFrameCarrierArrived` / 
  // `bareFrameCarrierArrived` being false, with every other check readable.
  const firstBody = first === undefined ? '' : commandBody(first.text)

  const admissions = new Map((commandResults ?? []).map((entry) => [entry.line, entry]))
  const admission = admissions.get(HYPERPLAN_COMMAND_LINE)
  const bareAdmission = admissions.get(HYPERPLAN_BARE_COMMAND_LINE)

  // The model must have SURRENDERED the request verbatim: the guidance's own item 6
  // is a statement about what the reply must contain, so the reply is the evidence.
  const firstSummary = findAssistantText(events, HYPERPLAN_DEGRADED_SUMMARY)
  const secondSummary = findAssistantText(events, HYPERPLAN_BARE_SUMMARY)
  const turnEnds = events.filter((event) => event.type === 'turn/end')
  // Which model request each turn's frame rode in, located by the request's OWN
  // content — the FULL frame text, not a prefix. A prefix is not distinguishing
  // here: both frames open with the same 200 characters (the header and the
  // Description line) and differ only further down, at the `**User Arguments**`
  // line, so a prefix matched BOTH requests and the second index collapsed onto the
  // first. Two linear scans over a handful of requests — O(N²) in principle,
  // MEASURED at 3 requests here; not worth an index map, and the comment is here so
  // nobody "optimises" it into a shared helper that changes which request matches.
  const firstFrameRequestIndex = sisyphusRequests.findIndex(
    (request) => first !== undefined && requestMessagesContain(request, first.text))
  const secondFrameRequestIndex = sisyphusRequests.findIndex(
    (request) => second !== undefined && requestMessagesContain(request, second.text))

  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    // The head-hole guard: without this the whole scenario could pass on a build
    // where `/hyperplan` was never registered at all.
    commandRegisteredInBootLog: bootLog.includes(HYPERPLAN_BOOT_REGISTRATION_LINE),
    // BOTH lines admitted, as real commands, each with its own lifecycle pair.
    bothLinesAdmittedAsCommands: admission?.matched === true
      && admission?.admission?.result?.kind === 'success'
      && bareAdmission?.matched === true
      && bareAdmission?.admission?.result?.kind === 'success',
    // Paired BY commandId, not by count. Counting two runs and two dones proves
    // only that two of each exist; the host mints a FRESH commandId per execute
    // (measured: `cmd-7ae2db59-1` / `cmd-7ae2db59-2`), so the real claim is that
    // each run has its OWN success done after it. The `seq` ordering that used to
    // close this check was tautological — the two runs are filtered out of a
    // seq-ordered event list, so `runs[0].seq < runs[1].seq` cannot fail.
    //
    // `dones.length === 2` is a WHOLE-LOG count, deliberately: on dsh a
    // command's only lifecycle events are `command/run` and `command/done` (the
    // scan of lib/index.js finds no third), so "two runs, two dones" is the
    // complete-pair claim and a stray third event would have to be one of these two
    // types. If a third command event type ever appears this count is the check
    // that notices.
    lifecyclePairPerLine: hyperplanRuns.length === 2
      && dones.length === 2
      && hyperplanRuns.every((run) => dones.some((done) =>
        done.data?.commandId === run.data?.commandId
        && done.data?.kind === 'success'
        && run.seq < done.seq)),
    // The carriers' EXISTENCE, named separately from their contents. Without these
    // two, a run that produced no carrier at all would report every content check
    // false with no statement that the carrier itself was missing.
    // Two frames, no more and no fewer. A THIRD frame (a re-injection, a duplicated
    // carrier) would silently pass a positional `carriers[0]` / `[1]` pair, so the
    // count is a claim of its own.
    exactlyTwoFramesArrived: carriers.length === 2,
    firstFrameCarrierArrived: first !== undefined,
    bareFrameCarrierArrived: second !== undefined,
    // The FIRST line's args are what the user typed, the SECOND's are empty — the
    // pair of admissions differs, so reading the wrong one is detectable.
    firstLineCarriedTheRequestAsArgs: hyperplanRuns[0]?.data?.args === HYPERPLAN_MEASURED_ARGS,
    secondLineCarriedNoArgs: hyperplanRuns[1]?.data?.args === '',
    // ── the DEGRADED claims ──────────────────────────────────────────────────
    degradedGuidanceReachedTheModel: first !== undefined
      && first.text.includes(omoCommandsHyperplan.HYPERPLAN_DEGRADED_GUIDANCE),
    rosterContractReachedTheModel: first !== undefined
      && first.text.includes(omoCommandsHyperplan.HYPERPLAN_ROSTER_CONTRACT),
    // The roster mapping T14 promised, read off the SHIPPED contract's own seats.
    rosterSeatsNamedInTheModelText: ['plan-consultant', 'plan-reviewer', 'prometheus']
      .every((seat) => first?.text.includes(seat) ?? false),
    // The T14 fix, checked where it matters: the model may not be handed a path it
    // could act on. The carrier note may quote the upstream paths (it must — the
    // two-source inconsistency is required), so the scan is on the BODY only.
    modelFacingBodyIsDeadLinkFree: first !== undefined && deadLinkFree(firstBody).length === 0,
    // …and the copy of the rule doing that work is itself discriminating (MINOR-7).
    deadLinkRuleIsDiscriminating: e2eRuleCatchesCrossSentenceLaundering(),
    commandBodyRejectsInvertedFrameTags: commandBodyRejectsInvertedFrameTags(),
    degradedModeAnnouncedInTheFrame: first !== undefined
      && first.text.includes('DEGRADED MODE — this deployment has no team-mode surface'),
    // MAJOR-1: the degraded suffix rides the frame's Description line, which is the
    // text the model reads about the command it is executing.
    degradedSuffixOnTheFrameDescriptionLine: first !== undefined
      && first.text.includes(`**Description**: ${omoCommandsHyperplanCommand.HYPERPLAN_DESCRIPTION}`),
    upstreamSentenceKeptVerbatimAheadOfTheSuffix: first !== undefined
      && first.text.includes(`**Description**: ${omoCommandsHyperplanCommand.UPSTREAM_HYPERPLAN_DESCRIPTION} `),
    // The skill is loaded BY NAME with the DSH call form — the rewritten link, and
    // OMO's own `skill(name=…)` syntax must NOT reach the model.
    skillLoadedByNameWithDshCallForm: first !== undefined
      && first.text.includes(omoCommandsHyperplan.DSH_SKILL_CALL_FORM)
      && !first.text.includes(omoCommandsHyperplan.UPSTREAM_SKILL_CALL_FORM),
    // Upstream's 7-phase wording is kept verbatim (MAJOR-2), so this pins the
    // attribution surface rather than a corrected count.
    sevenPhaseWordingPreserved: first !== undefined
      && first.text.includes('follow its 7-phase workflow EXACTLY using this user request'),
    // The user request rode the frame verbatim, inside `<user-request>`.
    userRequestRodeTheFrameVerbatim: first !== undefined
      && first.text.includes(`<user-request>\n${HYPERPLAN_MEASURED_ARGS}\n</user-request>`),
    // ── 对照: the bare line's frame omits the arguments line ─────────────────
    bareFrameOmitsUserArgumentsLine: second !== undefined
      && !second.text.includes('**User Arguments**'),
    firstFrameCarriesUserArgumentsLine: first !== undefined
      && first.text.includes(`**User Arguments**: ${HYPERPLAN_MEASURED_ARGS}`),
    // The bare turn still gets the FULL degraded guidance — degradation is a
    // property of the command, not of whether the user supplied an argument.
    bareTurnAlsoCarriesTheDegradedGuidance: second !== undefined
      && second.text.includes(omoCommandsHyperplan.HYPERPLAN_DEGRADED_GUIDANCE),
    // ── the model obeyed ────────────────────────────────────────────────────
    modelDeclaredDegradedModeOutLoud: firstSummary.includes('DEGRADED'),
    controlTurnAlsoDeclaredDegradedMode: secondSummary.includes('DEGRADED'),
    bothTurnsCompleted: turnEnds.length === 2
      && turnEndReasonKind(turnEnds[0]) === 'completed'
      && turnEndReasonKind(turnEnds[1]) === 'completed',
    // NOT a request-count check. The measured run issues THREE model requests, not
    // two: turn 1 takes two steps (the injected frame's step, then the step the
    // follow-up opens) and turn 2 takes one. Hardcoding 2 would have been a
    // transcription of a guess; the claim that actually matters is that each turn's
    // frame reached the model, in two DIFFERENT requests.
    eachFrameReachedAModelRequest: firstFrameRequestIndex >= 0
      && secondFrameRequestIndex > firstFrameRequestIndex,
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    // Named separately, because these two are about the DRIVER, not the run.
    driverSelfChecks: ['deadLinkRuleIsDiscriminating', 'commandBodyRejectsInvertedFrameTags'],
    commandLine: HYPERPLAN_COMMAND_LINE,
    bootRegistrationPresent: bootLog.includes(HYPERPLAN_BOOT_REGISTRATION_LINE),
    admissions: commandResults ?? [],
    commandRunCount: runs.length,
    commandRunData: hyperplanRuns.map((event) => ({ seq: event.seq, data: event.data })),
    commandDoneCount: dones.length,
    carriersFound: carriers.length,
    frameHead: (first?.text ?? '').split('\n').slice(0, 6),
    deadLinkFindings: first === undefined ? ['no carrier'] : deadLinkFree(firstBody),
    turnEndReasons: turnEnds.map((event) => ({ seq: event.seq, turn: event.data?.turn ?? null, kind: turnEndReasonKind(event) ?? null })),
    // ONE count, not two: `mockRequestCount` and the old `mockSawTwoRequests`
    // restated each other. The request-count claim now lives entirely in
    // `eachFrameReachedAModelRequest`, which is about the frames, not a number.
    mockRequestCount: sisyphusRequests.length,
    frameRequestIndices: { first: firstFrameRequestIndex, second: secondFrameRequestIndex },
    sisyphusRoute: `${routes.sisyphus.provider}/${routes.sisyphus.model}`,
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}

// ── P4-T15: ulw-plan-loads-prometheus-skill — the GESTURE BRIDGE (no command at all)
//
// This is the Q-3 ruling turned into a measured run. `/ulw-plan` is the ONE manifest
// row that stays `pending` FOREVER, because registering it as a command would shadow
// the gesture bridge; the bridge works precisely because NO command of that name
// exists. So the claim under test is a NEGATIVE one that is very easy to state and
// easy to get wrong: the line must produce ZERO `command/run` and ZERO
// `command/done`, and the skill must still reach the model.
//
// Four links, each observable only from outside the process:
//
//   1. GESTURE, NOT COMMAND — the line is submitted through the SAME admission path
//      a command uses, misses (no same-name command), and falls back to a plain
//      prompt. Asserted by name on the wire (`matched === false`) AND in the
//      session log (zero lifecycle events), because either alone is weak: a
//      `matched: false` with events present would mean something else admitted it.
//   2. `<skill_content>` INJECTION — dsh-tool-skill's `agent/pre-step` hook scans
//      the user text for `/name` gestures and, for a user-invocable skill, appends a
//      user message whose `source.kind` is `skill-invocation`. The injection is
//      exactly this (dsh-tool-skill/lib/index.js:165-196, 373-392; the `<skill_content
//      name=…>` frame from dsh-skill/lib/index.js:57-69).
//   3. THE USER'S OWN TEXT RIDES ALONG — the gesture scans the ORIGINAL user message,
//      so the request must still be there verbatim beside the injected body. A
//      bridge that swallowed the text would look identical on link 2 alone.
//   4. THE PERSONA IS PROMETHEUS — ulw-plan's own body opens "You are **Prometheus**,
//      a planning consultant", and its Phase 2 is an interview. The mock answers in
//      that voice (interview questions written back), so the persona claim is
//      behavioural rather than a string match on the injected body alone.
//
// 对照: the same skill invoked WITH an argument and the bare `/ulw-plan` gesture. The
// bare form must still inject the body (the bridge keys on the name, not the args),
// and its request text is the bare gesture itself.
const ULW_PLAN_GESTURE_LINE = `/ulw-plan ${ULW_PLAN_REQUEST}`
const ULW_PLAN_BARE_GESTURE_LINE = '/ulw-plan'
// The mock answers as PROMETHEUS, in the interview voice ulw-plan's body prescribes
// (Phase 2: turn the vague request into questions before planning). The markers make
// the persona claim checkable: a generic "sure, here is a plan" reply fails both.
const ULW_PLAN_PROMETHEUS_REPLY =
  'MOCK-ULW-PLAN-PROMETHEUS-5c81f7: Before I plan, two questions. 1) Which users hit the slow path, and how do they notice? 2) What is the rollback if this is wrong?'
const ULW_PLAN_BARE_PROMETHEUS_REPLY =
  'MOCK-ULW-PLAN-BARE-PROMETHEUS-2a94bd: Which request did you mean? I have no target yet — name the one you want planned.'

/** ulw-plan-loads-prometheus-skill script: the gesture turn, then the bare 对照 turn. */
function ulwPlanGestureScript() {
  return {
    sisyphus: [
      { type: 'text', text: ULW_PLAN_PROMETHEUS_REPLY },
      { type: 'text', text: ULW_PLAN_BARE_PROMETHEUS_REPLY },
    ],
  }
}

export function analyzeUlwPlanLoadsPrometheusSkill({ log, requests, bootLog, commandResults }, routes) {
  const events = log?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')

  const runs = events.filter((event) => event.type === 'command/run')
  const dones = events.filter((event) => event.type === 'command/done')

  // The injected bodies, located by EXCLUSION: every `user/message` on the session
  // that is not one of the two lines the driver submitted. Two earlier attempts
  // each made a defect unlocatable — filtering on the `<skill_content …>` prefix
  // meant a body that lost its frame stopped matching, and filtering on
  // `source.kind === 'skill-invocation'` meant a body relabelled as a plain user
  // message stopped matching. In both cases the defect the case was written to
  // prove could not be the check that failed; it surfaced as some other check
  // instead. Exclusion depends on neither, so every source/shape defect stays
  // reachable and each check is independently falsifiable.
  // The two OTHER injections a DSH session always carries — the runtime-context
  // snapshot (`kind: 'plugin'`) and the skill-catalog `<system-reminder>`
  // (`kind: 'skill-catalog'`). They are excluded by source KIND for a reason: the
  // first real run located the runtime snapshot instead of the bridge's injection,
  // because the locator took the first non-submitted message. Excluding by kind
  // (rather than SELECTING `skill-invocation`) keeps a relabelled bridge injection
  // locatable, so the source-contract check stays reachable.
  const OTHER_INJECTION_KINDS = ['plugin', 'skill-catalog']
  const submittedLines = [ULW_PLAN_GESTURE_LINE, ULW_PLAN_BARE_GESTURE_LINE]
  const injectedCandidates = events
    .filter((event) => event.type === 'user/message')
    .map((event) => ({ event, text: messageContentText(event.data) }))
    .filter((candidate) => !submittedLines.includes(candidate.text))
    .filter((candidate) => !OTHER_INJECTION_KINDS.includes(candidate.event.data?.source?.kind))
  const firstInjection = injectedCandidates[0]
  const secondInjection = injectedCandidates[1]
  const firstText = firstInjection?.text ?? ''
  const carriesUlwPlanFrame = (candidate) =>
    candidate?.text.startsWith('<skill_content name="ulw-plan">')
    && candidate.text.includes('<skill_instructions>')
    && candidate.text.trimEnd().endsWith('</skill_content>')

  // The user's own messages, i.e. the ones the driver submitted as prompts.
  const userLines = events
    .filter((event) => event.type === 'user/message')
    .map((event) => messageContentText(event.data))
    .filter((text) => text === ULW_PLAN_GESTURE_LINE || text === ULW_PLAN_BARE_GESTURE_LINE)

  const admissions = new Map((commandResults ?? []).map((entry) => [entry.line, entry]))
  const gestureAdmission = admissions.get(ULW_PLAN_GESTURE_LINE)
  const bareAdmission = admissions.get(ULW_PLAN_BARE_GESTURE_LINE)

  // The skill's OWN body, read through the plugin's own reader — so "the injected
  // body is the ulw-plan body" compares one delivery path against its source, the
  // same comparison skills-catalog-visible already makes.
  const ulwPlanEntry = vendoredSkillEntries().get('ulw-plan')
  const ulwPlanBody = ulwPlanEntry?.document?.content ?? ''  // `content`, measured — `body` is undefined

  const turnEnds = events.filter((event) => event.type === 'turn/end')
  const firstReply = findAssistantText(events, 'MOCK-ULW-PLAN-PROMETHEUS-')
  const secondReply = findAssistantText(events, 'MOCK-ULW-PLAN-BARE-PROMETHEUS-')

  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    // ── link 1: a gesture is not a command ────────────────────────────────
    // Named on the wire first. `ulw-plan` is the manifest row that must stay
    // `pending` forever (registering it would shadow this very bridge), so an
    // admission here would be the regression this scenario exists to catch.
    ulwPlanWasNotAdmittedAsACommand: gestureAdmission?.matched === false
      && gestureAdmission?.admission === undefined
      && bareAdmission?.matched === false
      && bareAdmission?.admission === undefined,
    // …and named in the LOG, which is the half the wire cannot see: zero
    // lifecycle events of any kind, not merely zero successful ones.
    noCommandLifecycleEventsAtAll: runs.length === 0 && dones.length === 0,
    bothGestureLinesFellBackToPrompts: userLines.length === 2
      && userLines.includes(ULW_PLAN_GESTURE_LINE)
      && userLines.includes(ULW_PLAN_BARE_GESTURE_LINE),
    // ── link 2: the bridge injected the body ──────────────────────────────
    // Two messages rode in that the driver never submitted — the bridge's own two
    // injections. Counted as "everything else that arrived", so a relabelled or
    // reframed body still shows up here and the shape check below stays reachable.
    twoInjectedMessagesArrived: injectedCandidates.length === 2
      && firstInjection !== undefined
      && secondInjection !== undefined,
    skillContentInjectedForBothLines: carriesUlwPlanFrame(firstInjection)
      && carriesUlwPlanFrame(secondInjection),
    injectionSourceIsSkillInvocation: firstInjection?.event?.data?.source?.kind === 'skill-invocation'
      && firstInjection?.event?.data?.source?.name === 'ulw-plan'
      && firstInjection?.event?.data?.source?.form === 'instructions',
    injectionCarriedAsAnIdentifiedUserMessage: firstInjection !== undefined
      && firstInjection.event.data?.role === 'user'
      && typeof firstInjection.event.data?.id === 'string'
      && firstInjection.event.data.id.length > 0,
    // The full shipped frame, not a body-only substring: the `<skill_resources>`
    // hint and the closing tags are part of what the model receives.
    injectionCarriesTheFullSkillFrame: firstText.startsWith('<skill_content name="ulw-plan">')
      && firstText.includes('<skill_resources>')
      && firstText.includes('<skill_instructions>')
      && firstText.trimEnd().endsWith('</skill_content>'),
    // The body really is ulw-plan's — a sentinel from the SKILL's own text, not
    // from its frontmatter, so a description-only match cannot pass.
    // Zero-drift: the WHOLE vendored body, read through the plugin's own reader, must
    // be present. The old form compared two hand-picked lines, which says the injected
    // text contains those two strings and nothing about the rest of the body. The
    // body-not-frontmatter sentinel is kept as a separate check below so its purpose
    // (a description-only match cannot pass) stays visible rather than being folded in.
    injectedBodyIsTheUlwPlanBody: ulwPlanBody.length > 0 && firstText.includes(ulwPlanBody),
    injectedBodySentinelComesFromTheBodyNotTheFrontmatter: firstText.includes('You are **Prometheus**, a planning consultant')
      && firstText.includes(ULW_PLAN_BODY_SENTINEL),
    // ── link 3: the user's own text rides along ───────────────────────────
    // Scanned from the MODEL REQUEST, not the log: the bridge injects into the
    // step's messages, so this is where "the request was not swallowed" is visible.
    userRequestRodeTheFirstStep: sisyphusRequests.length > 0
      && requestMessagesContain(sisyphusRequests[0], ULW_PLAN_GESTURE_LINE),
    userRequestAndInjectionCoexistInOneStep: sisyphusRequests.length > 0
      && requestMessagesContain(sisyphusRequests[0], ULW_PLAN_GESTURE_LINE)
      && requestMessagesContain(sisyphusRequests[0], '<skill_content name="ulw-plan">'),
    // ── link 4: the persona is prometheus, behaviourally ───────────────────
    modelAnsweredAsPrometheusWithInterviewQuestions: firstReply.includes('questions')
      && firstReply.includes('rollback'),
    bareGestureAlsoInjectedTheBody: carriesUlwPlanFrame(secondInjection),
    // MAJOR-1. The first version was `includes('Prometheus') || length > 0`, and BOTH
    // halves were dead: the mock's marker reply is all-caps (`MOCK-ULW-PLAN-BARE-
    // PROMETHEUS-…`), so the case-sensitive `Prometheus` never matched, and the
    // `length > 0` fallback reduced the whole check to "some message is non-empty" —
    // a review confirmed a reply with no interview content in it stayed green. The
    // claim is now pinned on a CONTENT needle from the mock's own bare-gesture
    // answer, with no fallback branch at all.
    bareGestureAnsweredAsPrometheusToo: secondReply.includes('Which request did you mean'),
    bothTurnsCompleted: turnEnds.length === 2
      && turnEndReasonKind(turnEnds[0]) === 'completed'
      && turnEndReasonKind(turnEnds[1]) === 'completed',
    // NO request-count check here, deliberately. `twoInjectedMessagesArrived`,
    // `bothGestureLinesFellBackToPrompts` and `bothTurnsCompleted` already imply it
    // (each asserts its own pair, and two completed turns admit two requests), so a
    // fourth statement of the same number could only restate them. The count is still
    // reported in the bonus block; the MEASURED value is 2 — the gesture turn and the
    // bare turn, one step each.
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    gestureLine: ULW_PLAN_GESTURE_LINE,
    admissions: commandResults ?? [],
    commandRunCount: runs.length,
    commandDoneCount: dones.length,
    injectionsFound: injectedCandidates.length,
    injectionSource: firstInjection?.event?.data?.source ?? null,
    injectionHead: firstText.split('\n').slice(0, 6),
    ulwPlanBodyChars: ulwPlanBody.length,
    ulwPlanRegistered: ulwPlanEntry !== undefined,
    turnEndReasons: turnEnds.map((event) => ({ seq: event.seq, turn: event.data?.turn ?? null, kind: turnEndReasonKind(event) ?? null })),
    mockRequestCount: sisyphusRequests.length,
    sisyphusRoute: `${routes.sisyphus.provider}/${routes.sisyphus.model}`,
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', failed, checks, bonus }
}
// ── P4-T9: stop-continuation-halts-todo — the /stop-continuation e2e ─────────
// ONE session, FOUR prompts and THREE command calls, in this exact order (hence
// the interleaved `actions` path — `commands` always run first, and this
// scenario must stop continuation BETWEEN two turns):
//
//   prompt 1 (正向对照): todo_write {1 completed + 1 in_progress} → 收尾 ⇒ H-03
//     STEERS (the continuation really happens) ⇒ the steered step completes the
//     list ⇒ summary ⇒ turn/end completed.
//   prompt 2 (正向对照 + arm the cascade): background `bash sleep` +
//     todo_write {1 completed + 1 DIFFERENT in_progress} → 收尾 ⇒ H-03 STEERS
//     AGAIN, on a different list. A SECOND positive is what makes the post-stop
//     silence meaningful: it shows the enforcer was still steering for this
//     session immediately before the command, on the same mechanism.
//   `/stop-continuation` ×2 → each settles `command/done` success; the first
//     also cancels the background job (the cascade face) and reports that there
//     is no goal yet. The idempotence claim is carried by TWO checks, because
//     the job count alone cannot carry it: `secondStopIsIdempotent` on the text
//     (whose job count is undetermined between the two legitimate shapes) and
//     `stopIdempotenceLeavesExactlyOneStopPerCall` on the guard's durable lines
//     (exactly one stop per call, no clear line).
//   prompt 3 (the claim under test): todo_write {1 completed + 1 in_progress} →
//     收尾 ⇒ NO steer. Non-vacuous by construction: the list at that boundary is
//     non-empty AND incomplete, no goal exists yet, and the breaker never armed
//     (both steers PROGRESSED, which resets it). `stopped` is the FIRST gate in
//     `decideTodoContinuation`, so silence under exactly those conditions can
//     only be `stopped-by-command` — by elimination, because the listener does
//     not log its skip reason (a difference registered in the report).
//   prompt 4 (the goal face): create_goal (ACTIVE) → 收尾. The goal driver then
//     opens rounds of its OWN — measured, not assumed — so this phase's turn
//     count is deliberately NOT pinned; what IS pinned is the third
//     `/stop-continuation`: it must report `paused the active goal (kept,
//     resumable)` and NO further goal round may open afterwards. Whether a round
//     was IN FLIGHT when the pause landed is a measured RACE (one run aborted
//     such a round, another had none in flight), so it is reported, not asserted.
//     Keeping the goal in the LAST phase is what contains that nondeterminism:
//     nothing above can be disturbed by it.
//
// Measured facts the assertions are derived from (never guessed):
//   * the command's name/description and the registration line come from the
//     shipped `omo-commands` package and its `boot-markers.ts`;
//   * the done text is `formatStopContinuationResult(effects)` in
//     omo-commands/src/commands/stop-continuation.ts; its head/tail are stable
//     and the two middle clauses vary with the measured effects;
//   * the guard's boot line and the job counts are the guard module's own;
//   * the steer carriers / text are read through the SHIPPED listener's
//     `buildContinuationText`, exactly as the P3-T9 pilot does.
const STOP_CONTINUATION_COMMAND_LINE = '/stop-continuation'
const STOP_CONTINUATION_TASK_SETTLED = 'e2e stop-continuation task: record the audit trail 0x51a7'
const STOP_CONTINUATION_TASK_OPEN_1 = 'e2e stop-continuation task: summarize the guard state 0xc0de'
const STOP_CONTINUATION_TASK_OPEN_2 = 'e2e stop-continuation task: fold the cascade report 0xf00d'
const STOP_CONTINUATION_TASK_OPEN_3 = 'e2e stop-continuation task: confirm the silence is real 0xbeef'
const STOP_CONTINUATION_PROMPT_1 =
  'e2e stop-continuation-halts-todo: track the two audit tasks in the todo list and report when they are done'
const STOP_CONTINUATION_PROMPT_2 =
  'e2e stop-continuation-halts-todo (second control): start a background sleep, then track the next audit task'
const STOP_CONTINUATION_PROMPT_3 =
  'e2e stop-continuation-halts-todo (after the stop): track the follow-up audit task and wrap up'
const STOP_CONTINUATION_PROMPT_4 =
  'e2e stop-continuation-halts-todo (goal face): open a goal for the guard state and wrap up'
const STOP_CONTINUATION_WRAPUP_1 =
  'MOCK-STOP-WRAPUP-1-4b7d1e: the audit tasks are logged, wrapping up here'
const STOP_CONTINUATION_SUMMARY_1 =
  'MOCK-STOP-SUMMARY-1-9f4a2c: the tracked tasks are all complete now'
const STOP_CONTINUATION_WRAPUP_2 =
  'MOCK-STOP-ARM-WRAPUP-2-3c9a17: background job started, wrapping up'
const STOP_CONTINUATION_SUMMARY_2 =
  'MOCK-STOP-SUMMARY-2-5a7e63: the cascade task is complete now'
const STOP_CONTINUATION_WRAPUP_3 =
  'MOCK-STOP-AFTER-WRAPUP-3-6e2b84: follow-up task tracked, nothing more to continue'
const STOP_CONTINUATION_GOAL_WRAPUP =
  'MOCK-STOP-GOAL-WRAPUP-4-1d3f77: goal opened for the guard state'
// The background job the guard must cancel. `sleep` (not a mock delay) is what
// keeps the job in `running` when the command lands: a job that had already
// finished would exercise the `already finished` clause instead, which is a
// different claim.
const STOP_CONTINUATION_BACKGROUND_COMMAND = 'sleep 45'
const STOP_CONTINUATION_BACKGROUND_LABEL = 'e2e stop-continuation background sleeper'
const STOP_CONTINUATION_GOAL_OBJECTIVE =
  'e2e stop-continuation: keep the guard state observable until the session ends'
// The guard's own boot line (stable prefix + id from the shipped module).
const STOP_CONTINUATION_GUARD_LOG_PREFIX = '[omo-hooks] stop-continuation-guard: continuation stopped for session '
// The guard's CLEAR line (same module, `clear()`'s own log). Only ever asserted
// ABSENT — see stopIdempotenceLeavesExactlyOneStopPerCall.
const STOP_CONTINUATION_GUARD_CLEARED_PREFIX = '[omo-hooks] stop-continuation-guard: guard cleared for session '
// The done text's stable head/tail, from `formatStopContinuationResult`:
//   'Continuation stopped for session <id>; <jobs clause>; <goal clause>; todo
//    continuation is stopped for this session until it is cleared or the session
//    ends.' — only the two middle clauses vary with the measured effects.
const STOP_CONTINUATION_DONE_PREFIX = 'Continuation stopped for session '
const STOP_CONTINUATION_DONE_TAIL =
  'todo continuation is stopped for this session until it is cleared or the session ends.'
const STOP_CONTINUATION_JOBS_CLAUSE = 'running/stopping job(s)'
const STOP_CONTINUATION_GOAL_PAUSED_CLAUSE = 'paused the active goal (kept, resumable)'
const STOP_CONTINUATION_NO_GOAL_CLAUSE = 'no goal on this session'
// The circuit-breaker line. It must NOT be in the boot log: an armed breaker
// would give the post-stop silence an innocent cause and collapse the
// scenario's whole claim. The line is BUILT from the shipped listener
// (`formatCircuitBreakerLine`) at each use site rather than pinned as a literal
// here — a NEGATIVE assertion is the most rot-prone kind (a renamed line would
// make it pass forever), so it reads the module's own formatter and its own cap.

// The goal driver's own message shape, used to count rounds (not to assert a
// fixed number of them — that is deliberately open).
const GOAL_ROUND_SOURCE_KIND = 'goal'

/**
 * stop-continuation-halts-todo script. THIRTEEN steps on the ONE role the
 * scenario drives (MOCKROLE=sisyphus): 4 for prompt 1, 5 for prompt 2 (one of
 * them only reachable as the STEERED step), 2 for prompt 3, 2 for prompt 4.
 * Every `todo_write` sends the COMPLETE list (the tool's contract: "The COMPLETE
 * task list, replacing any previous list").
 *
 * `create_goal` is a REAL tool call, not a config: the goal face is one of the
 * three mechanisms `/stop-continuation` stops, and the only honest way to reach
 * it is a goal that exists before the command. `max_goal_rounds` is left unset
 * on purpose — a bounded goal would run out of rounds and stop being `active`,
 * and the command would then honestly report `not-active` instead of pausing
 * anything, which is a different claim than the one under test.
 */
function stopContinuationScript() {
  return {
    sisyphus: [
      // ── prompt 1: the continuation chain
      {
        type: 'tool_call',
        name: 'todo_write',
        arguments: {
          todos: [
            { content: STOP_CONTINUATION_TASK_SETTLED, status: 'completed' },
            { content: STOP_CONTINUATION_TASK_OPEN_1, status: 'in_progress' },
          ],
        },
      },
      { type: 'text', text: STOP_CONTINUATION_WRAPUP_1 },
      // only reachable if the boundary steered:
      {
        type: 'tool_call',
        name: 'todo_write',
        arguments: {
          todos: [
            { content: STOP_CONTINUATION_TASK_SETTLED, status: 'completed' },
            { content: STOP_CONTINUATION_TASK_OPEN_1, status: 'completed' },
          ],
        },
      },
      { type: 'text', text: STOP_CONTINUATION_SUMMARY_1 },
      // ── prompt 2: arm the cascade, then reach a boundary with a DIFFERENT
      // incomplete task (so the second steer's text cannot be the first's).
      {
        type: 'tool_call',
        name: 'bash',
        arguments: {
          command: STOP_CONTINUATION_BACKGROUND_COMMAND,
          description: STOP_CONTINUATION_BACKGROUND_LABEL,
          run_in_background: true,
        },
      },
      {
        type: 'tool_call',
        name: 'todo_write',
        arguments: {
          todos: [
            { content: STOP_CONTINUATION_TASK_SETTLED, status: 'completed' },
            { content: STOP_CONTINUATION_TASK_OPEN_2, status: 'in_progress' },
          ],
        },
      },
      { type: 'text', text: STOP_CONTINUATION_WRAPUP_2 },
      {
        type: 'tool_call',
        name: 'todo_write',
        arguments: {
          todos: [
            { content: STOP_CONTINUATION_TASK_SETTLED, status: 'completed' },
            { content: STOP_CONTINUATION_TASK_OPEN_2, status: 'completed' },
          ],
        },
      },
      { type: 'text', text: STOP_CONTINUATION_SUMMARY_2 },
      // ── prompt 3: the post-stop boundary. Nothing else — if the guard had not
      // stopped continuation, this wrap-up would be followed by a steer + a step.
      {
        type: 'tool_call',
        name: 'todo_write',
        arguments: {
          todos: [
            { content: STOP_CONTINUATION_TASK_SETTLED, status: 'completed' },
            { content: STOP_CONTINUATION_TASK_OPEN_3, status: 'in_progress' },
          ],
        },
      },
      { type: 'text', text: STOP_CONTINUATION_WRAPUP_3 },
      // ── prompt 4: the goal face (the third stop pauses it).
      {
        type: 'tool_call',
        name: 'create_goal',
        arguments: { objective: STOP_CONTINUATION_GOAL_OBJECTIVE },
      },
      { type: 'text', text: STOP_CONTINUATION_GOAL_WRAPUP },
    ],
  }
}

/**
 * The scenario's settle hook: after the third stop paused the goal, the goal
 * driver must go quiet. This waits a bounded window for that silence and
 * records whether a round still opened — the observation is REPORTED here and
 * asserted in the analyzer (`noGoalRoundOpenedAfterThePause`), rather than being
 * smuggled in as a sleep. A timeout is not fatal to the driver: the analysis
 * still runs and reports the honest FAIL.
 */
// The driver calls every settle hook positionally as `settle(boot, sandbox,
// sessionId)`, so the first parameter cannot simply be dropped. It is bound to
// `_boot` BY NAME: this hook reads only the durable session JSONL (re-read on
// every poll, because that file is written behind) and the boot log is frozen
// later by `stopDsh`. An unused parameter named `boot` would read as "used".
async function awaitGoalSilenceAfterStop(_boot, sandbox, sessionId, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  // The window is run IN FULL unless a round actually appears. An early exit on
  // "the goal went quiet" would be a claim about a log that may not have been
  // flushed yet: the session JSONL is written behind, so at the first poll the
  // three `command/done` events this scenario waits on may not all be on disk,
  // and a "silence" measured against a not-yet-present boundary is vacuous.
  let roundsAfterPause = -1
  while (Date.now() < deadline) {
    roundsAfterPause = countGoalRoundsAfterLastStop(sandbox, sessionId)
    if (roundsAfterPause > 0) return roundsAfterPause
    await sleep(250)
  }
  return countGoalRoundsAfterLastStop(sandbox, sessionId)
}

/**
 * Goal rounds (`source.kind === 'goal'`) that landed after the last
 * `command/done`, or `-1` while the log does not yet contain ALL THREE stops —
 * the "not ready" signal the wait loop above treats as "keep waiting", so a
 * half-flushed log can never be read as silence.
 */
function countGoalRoundsAfterLastStop(sandbox, sessionId) {
  const logs = findSessionLogs(join(sandbox.dshHome, 'sessions'))
  const log = logs.find((candidate) => String(candidate.header.id) === String(sessionId))
  const events = log?.events ?? []
  const dones = events.filter((event) => event.type === 'command/done')
  if (dones.length < 3) return -1
  const lastDoneSeq = dones[dones.length - 1].seq
  return events.filter(
    (event) => event.seq > lastDoneSeq
      && event.type === 'user/message'
      && event.data?.source?.kind === GOAL_ROUND_SOURCE_KIND,
  ).length
}

/**
 * The stop-continuation-halts-todo assertions (P4-T9). ONE session, FOUR
 * prompts and THREE `/stop-continuation` calls; the claim is BIDIRECTIONAL and
 * both halves are asserted from durable evidence:
 *
 *   before the stop — H-03 really steers, TWICE, on two different lists: both
 *     durable carriers exist per boundary, carry the producer triple
 *     {kind:'plugin', plugin:'omo-hooks', form:'instructions'} and the listener's
 *     OWN text for the list that boundary saw, and each steer rides the request
 *     right after its 收尾 step (the turn did not end).
 *   the command — admitted every time, `command/run`/`command/done` paired per
 *     call, `done.kind` success, each done naming THIS session and ending with
 *     the "stopped … until it is cleared or the session ends" tail. The first
 *     reports the cancelled background job; the third reports the paused goal.
 *   after the stop — no steer, and NOT vacuously so: the list at that boundary
 *     is non-empty and incomplete, no goal exists yet, and the breaker never
 *     armed. `stopped` is the first gate in `decideTodoContinuation`, so silence
 *     under exactly those conditions can only be `stopped-by-command`.
 *
 * `routes` carries the shared provider + route checks; `bootLog` carries the
 * registration line, the guard's own lines and the breaker line.
 */
export function analyzeStopContinuationHaltsTodo(
  { log, requests, providersJson, bootLog, commandResults },
  routes,
) {
  const events = log?.events ?? []
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const sessionId = log?.header?.id

  // ── the three command calls, in log order ───────────────────────────────
  const commandRunEvents = events.filter((event) => event.type === 'command/run')
  const commandDoneEvents = events.filter((event) => event.type === 'command/done')
  const doneTexts = commandDoneEvents.map((event) => event.data?.text ?? '')
  const firstDoneText = doneTexts[0] ?? ''
  const secondDoneText = doneTexts[1] ?? ''
  const thirdDoneText = doneTexts[2] ?? ''
  // Every run/done pair is matched by commandId, not by position.
  const doneFor = (run) => run === undefined
    ? undefined
    : commandDoneEvents.find((event) => event.data?.commandId === run.data?.commandId)

  // ── scoping: everything before the FIRST command/done is pre-stop ───────
  const firstDone = commandDoneEvents[0]
  const stopBoundarySeq = firstDone?.seq ?? Number.POSITIVE_INFINITY
  const preStopEvents = events.filter((event) => event.seq < stopBoundarySeq)
  const postStopEvents = events.filter((event) => event.seq > stopBoundarySeq)

  // ── the two pre-stop continuations (正向对照) ────────────────────────────
  const preSteerCarriers = pluginInjectedMessageCarriers(preStopEvents, TODO_CONTINUATION_DIRECTIVE)
  const preSteerClaims = preSteerCarriers.userMessages
  const preSteerSplices = preSteerCarriers.nextStepInsertions
  // The text each boundary must have minted: the listener's own assembly for the
  // list in force at THAT boundary (the most recent todo/write before the
  // carrier), so the two boundaries are checked against their own lists instead
  // of against one snapshot.
  const expectedTextBefore = (event) => {
    const priorSnapshots = todoWriteSnapshots(
      preStopEvents.filter((candidate) => candidate.seq < event.seq),
    )
    return buildTodoContinuationText(todoSnapshotOf(priorSnapshots[priorSnapshots.length - 1]))
  }
  const preSteerWrapups = [STOP_CONTINUATION_WRAPUP_1, STOP_CONTINUATION_WRAPUP_2].map((text) =>
    preStopEvents.find((event) => event.type === 'assistant/message' && eventText(event).includes(text)))
  // The steer rides the request immediately after its boundary's 收尾 step. The
  // expected index is DERIVED from the event order — count the model steps
  // between the turn's start and the steer's splice — rather than typed as 2 and
  // 7, so editing the script's step list cannot leave a stale expectation behind
  // that only a re-run would expose.
  const preSteerRequestIndices = preSteerClaims.map((claim) =>
    sisyphusRequests.findIndex((request) => requestMessagesContain(request, messageContentText(claim.data))))
  const expectedSteerRequestIndex = (splice) => {
    // One model request per model STEP, and every step begins with an assistant
    // message — so the request index a splice rides is exactly the number of
    // assistant messages that precede it, counted across the WHOLE log (the
    // index is absolute: turn 2's steered step is request #7, not step #3 of its
    // turn). Deriving it from the event stream is what keeps it from going stale
    // when the script's step list changes.
    return preStopEvents.filter(
      (event) => event.type === 'assistant/message' && event.seq < splice.seq,
    ).length
  }
  const expectedSteerRequestIndices = preSteerSplices.map(({ event }) => expectedSteerRequestIndex(event))

  // ── the post-stop boundary (the claim under test) ───────────────────────
  // The boundary's list is the LAST `todo/write` BEFORE the wrap-up — the one
  // the stopping boundary actually reads. Taking the FIRST after the stop was a
  // weaker claim than it looked: any later write would have satisfied it while
  // describing a list the boundary never saw. The single-write guard below keeps
  // that honest, so a runtime that wrote a second list here cannot pass by
  // having the LAST one happen to be incomplete.
  const wrapup3Anchor = postStopEvents.find(
    (event) => event.type === 'assistant/message' && eventText(event).includes(STOP_CONTINUATION_WRAPUP_3),
  )
  const postStopWritesBeforeWrapup = todoWriteSnapshots(
    wrapup3Anchor === undefined
      ? postStopEvents
      : postStopEvents.filter((event) => event.seq < wrapup3Anchor.seq),
  )
  const postStopBoundarySnapshot = postStopWritesBeforeWrapup[postStopWritesBeforeWrapup.length - 1]
  const postStopTodos = todoSnapshotOf(postStopBoundarySnapshot)
  const postSteerCarriers = pluginInjectedMessageCarriers(postStopEvents, TODO_CONTINUATION_DIRECTIVE)
  const postSteerCount = postSteerCarriers.userMessages.length
    + postSteerCarriers.nextStepInsertions.length
  const wrapup3 = wrapup3Anchor
  // The turn that wrap-up closes: the FIRST turn/end after it (not the last — the
  // goal rounds open turns of their own later in the log).
  const postStopTurnEnd = wrapup3 === undefined
    ? undefined
    : events.find((event) => event.type === 'turn/end' && event.seq > wrapup3.seq)
  // Nothing step-shaping may sit between wrap-up 3 and that turn/end: an
  // injected message, an extra model step, a todo write, a request header.
  const STEP_SHAPING_EVENTS = new Set([
    'user/message',
    'assistant/message',
    'tool/call',
    'tool/result',
    'todo/write',
    'request/header',
    'agent/inbox/spliced',
  ])
  const postStopTail = wrapup3 === undefined || postStopTurnEnd === undefined
    ? []
    : postStopEvents.filter((event) => event.seq > wrapup3.seq && event.seq < postStopTurnEnd.seq)

  // ── the goal face (the third stop) ──────────────────────────────────────
  const toolCalls = events.filter((event) => event.type === 'tool/call')
  const createGoalCall = toolCalls.find((event) => event.data?.name === 'create_goal')
  const backgroundCall = toolCalls.find((event) => {
    if (event.data?.name !== 'bash') return false
    const args = toolCallArguments(event)
    return args?.command === STOP_CONTINUATION_BACKGROUND_COMMAND
  })
  const thirdDone = commandDoneEvents[2]
  // Goal rounds: the driver's own messages. Counted, not pinned — the pause is
  // what must stop them.
  const goalRoundMessages = events.filter(
    (event) => event.type === 'user/message' && event.data?.source?.kind === GOAL_ROUND_SOURCE_KIND,
  )
  const goalRoundsAfterThirdDone = thirdDone === undefined
    ? 0
    : goalRoundMessages.filter((event) => event.seq > thirdDone.seq).length
  // Whether a round happened to be IN FLIGHT when the pause landed. MEASURED as
  // a race, not a contract: one run aborted such a round (turn/end `aborted`,
  // reason `user`), another had none in flight and the pause was silent. So this
  // is REPORTED in the bonus and never asserted — asserting it would make the
  // scenario fail on timing, which is exactly the kind of flake a scenario that
  // claims a mechanism must not have.
  const abortedTurnsAfterGoal = createGoalCall === undefined
    ? []
    : events.filter((event) => event.type === 'turn/end'
      && event.seq > createGoalCall.seq
      && turnEndReasonKind(event) === 'aborted')
      .map((event) => ({
        seq: event.seq,
        turn: event.data?.turn,
        kind: turnEndReasonKind(event),
        // The abort carries its own NESTED reason on this runtime; report it as
        // data instead of describing it in prose, so a reader can tell 'aborted
        // by a user prompt' from 'aborted by the pause' without trusting a
        // comment.
        cause: event.data?.reason?.reason?.kind ?? null,
      }))

  // The guard's own lines, read from the boot log with the session id bound in.
  const guardStopLines = bootLog
    .split('\n')
    .filter((line) => line.startsWith(STOP_CONTINUATION_GUARD_LOG_PREFIX) && line.includes(String(sessionId)))

  const doneIsWellFormed = (text) =>
    text.startsWith(STOP_CONTINUATION_DONE_PREFIX)
    && text.includes(String(sessionId))
    && text.endsWith(STOP_CONTINUATION_DONE_TAIL)

  const checks = {
    pluginLoaded: pluginsLoaded(bootLog),
    sisyphusProviderActive: new RegExp(
      `"provider":"${routes.sisyphus.provider}"[^}]*"active":true`,
    ).test(providersJson),
    sessionLogFound: log !== undefined,
    // Without this line the command would fall back to the prompt path and the
    // scenario would "pass" on a build that ships no command at all (the T7
    // head-hole, for this command).
    stopContinuationRegisteredInBootLog:
      bootLog.includes('[omo-commands] command stop-continuation registered'),
    routeHeaderMatchesSisyphus: sisyphusRequests.length > 0
      && sisyphusRequests.every((request) => request.body?.model === routes.sisyphus.model),
    // ── BEFORE the stop: the continuation really happens, on both boundaries.
    preStopContinuationHappenedTwice:
      preSteerClaims.length === 2 && preSteerSplices.length === 2,
    preStopContinuationCarrierSourceIsOmoHooks:
      preSteerClaims.length === 2
      && preSteerClaims.every((event) => isTodoContinuationSource(event.data))
      && preSteerSplices.every(({ message }) => isTodoContinuationSource(message)),
    preStopContinuationTextIsVerbatimListenerText:
      preSteerClaims.length === 2
      && preSteerClaims.every((event) => messageContentText(event.data) === expectedTextBefore(event))
      && preSteerSplices.every(({ message, event }) =>
        messageContentText(message) === expectedTextBefore(event)),
    // One carrier pair per boundary, and the two boundaries' texts DIFFER (the
    // second steered a different list — a check that would pass on a runtime
    // that replayed one steer forever).
    preStopContinuationInjectedExactlyOncePerBoundary:
      preSteerClaims.length === 2
      && preSteerSplices.length === 2
      && preSteerClaims.every((event, index) => event.data?.id === preSteerSplices[index]?.message?.id)
      && messageContentText(preSteerClaims[0]?.data) !== messageContentText(preSteerClaims[1]?.data),
    preStopContinuationReachedNextModelRequest:
      preSteerRequestIndices.length === 2
      && expectedSteerRequestIndices.length === 2
      && preSteerRequestIndices.every((index, position) =>
        index === expectedSteerRequestIndices[position] && index > 0)
      && preSteerWrapups.every((event) => event !== undefined)
      && preSteerSplices.every(({ event }, index) =>
        preSteerWrapups[index] !== undefined && preSteerWrapups[index].seq < event.seq),
    // ── the command: admitted, logged as pairs, settled success.
    stopCommandAdmittedThreeTimes: commandResults.length === 3
      && commandResults.every((entry) => entry.matched === true
        && entry.admission?.result?.kind === 'success'),
    stopCommandRunsRecordedWithArgsAndUserSource:
      commandRunEvents.length === 3
      && commandRunEvents.every((event) => event.data?.name === 'stop-continuation'
        // The line carries NO trailing text, so `parseCommand`'s unnormalized
        // `rawInput` is the EMPTY string — a non-empty value would mean the
        // driver sent arguments the user never typed.
        && event.data.args === ''
        && event.data.source?.kind === 'user')
      && new Set(commandRunEvents.map((event) => event.data?.commandId)).size === 3,
    stopCommandDonesPairedAndSucceeded:
      commandRunEvents.every((run) => {
        const done = doneFor(run)
        return done?.data?.kind === 'success' && run.seq < done.seq
      })
      && commandDoneEvents.length === 3,
    stopCommandDoneNamesThisSession: doneTexts.length === 3 && doneTexts.every(doneIsWellFormed),
    // 幂等 in EFFECT, not byte-for-byte: the two first stops report the same
    // head, the same session and the same tail, and both succeed — while the
    // job counts legitimately differ (the second stop cancels nothing because
    // the first already did). Pinning equality of the whole string would pin a
    // lie.
    // 幂等 in the DONE TEXT: the second call must still report this session as
    // stopped, in one of the two job shapes a correct runtime can produce —
    // `cancelled 0` (the first call already cancelled it) or `cancelled 1`
    // (re-requested on a job still in `stopping`). The job COUNT is deliberately
    // not pinned: `stopping` is NOT terminal here (the jobs service's terminal
    // set is completed|killed|failed), so a kill issued while the first
    // cancellation is still settling returns `requested` again and is counted
    // afresh. Two back-to-back RPCs leave the job no time to settle, so both
    // shapes are real — pinning one would be a flaky assertion about a race.
    // The substantive idempotence claim is
    // `stopIdempotenceLeavesExactlyOneStopPerCall`, on the guard's durable side,
    // which has no such timing.
    secondStopIsIdempotent: (secondDoneText.includes('cancelled 0 ')
      || secondDoneText.includes('cancelled 1 '))
      && doneIsWellFormed(secondDoneText),
    // ── the guard's own durable lines (the writer side really ran, per call).
    stopGuardLoggedForThisSession: guardStopLines.length === 3
      && guardStopLines.every((line) => line.includes('jobs service present')),
    // 幂等 ON THE GUARD SIDE — the carrier that has no `stopping` race: one stop
    // line per call (three calls, three lines), and NO `guard cleared` line
    // anywhere. "Naming THIS session" is not re-checked here: that binding
    // already happened in the `guardStopLines` filter above, so a line for
    // another session is not in the array at all and would fail the length.
    // The absence of a clear is the substantive part: a stop that un-stopped
    // itself (or cleared the session as a side effect) would leave exactly that
    // line, and the post-stop silence would then be a fluke rather than the
    // guard holding.
    stopIdempotenceLeavesExactlyOneStopPerCall: guardStopLines.length === 3
      && !bootLog.includes(STOP_CONTINUATION_GUARD_CLEARED_PREFIX),
    // ── the cascade face: the background job really started (its call is in the
    // log) and the first stop reports cancelling it.
    backgroundJobReallyStarted: backgroundCall !== undefined,
    firstStopCancelledTheBackgroundJob:
      /^cancelled [1-9]\d* /.test(firstDoneText.split('; ')[1] ?? ''),
    firstStopReportedNoGoalYet: firstDoneText.includes(STOP_CONTINUATION_NO_GOAL_CLAUSE),
    // ── AFTER the stop: no steer, and NOT vacuously so.
    postStopTodoBoundaryIsIncomplete: postStopBoundarySnapshot !== undefined
      && postStopWritesBeforeWrapup.length === 1
      && postStopTodos.length > 0
      && incompleteTodoCount(postStopTodos) > 0,
    // The `goal-owns-continuation` gate is ruled out by ORDER, read from the log
    // rather than assumed: the goal is created in prompt 4, strictly AFTER the
    // wrap-up of the boundary under test. Without this the post-stop silence
    // could be that gate firing — the scenario would go green on a runtime whose
    // stop flag was never read.
    noGoalAtPostStopBoundary: createGoalCall !== undefined
      && wrapup3 !== undefined
      && createGoalCall.seq > wrapup3.seq,
    postStopNoContinuationCarrier: postSteerCount === 0,
    postStopTurnEndedWithoutExtraStep: wrapup3 !== undefined
      && postStopTurnEnd !== undefined
      && postStopTail.every((event) => !STEP_SHAPING_EVENTS.has(event.type)),
    postStopTurnCompleted: postStopTurnEnd !== undefined
      && turnEndReasonKind(postStopTurnEnd) === 'completed',
    // ── the goal face: created for real, paused for real, and quiet afterwards.
    goalReallyCreatedBeforeTheThirdStop: createGoalCall !== undefined
      && thirdDone !== undefined
      && createGoalCall.seq < thirdDone.seq,
    thirdStopPausedTheActiveGoal: thirdDoneText.includes(STOP_CONTINUATION_GOAL_PAUSED_CLAUSE)
      && doneIsWellFormed(thirdDoneText),
    // The pause disarms the round driver: NO goal round may open after it. Every
    // round that exists landed BEFORE the third stop — that is the claim, and it
    // is the part that is stable across runs (the in-flight-round abort above is
    // reported, not asserted).
    noGoalRoundOpenedAfterThePause: goalRoundsAfterThirdDone === 0
      && goalRoundMessages.length > 0,
    // ── the breaker never armed, so the post-stop silence has no innocent cause.
    circuitBreakerNeverArmed: !bootLog.includes(todoContinuationCircuitBreakerLine(5)),
    // ── request accounting: COUNT and SEAT only. The name says so, because the
    // check deliberately does not pin the exact total — prompt 4's active goal
    // opens rounds of its own (measured: 4 per run), and how many open before
    // the third stop lands is timing, not a contract. What IS pinned is that the
    // thirteen scripted steps all happened (>= 13) and every one of them was
    // served by this seat; the per-step ordering is asserted by the steer-index
    // derivation instead, which reads the event stream.
    mockSawThirteenScriptedStepsOnThisSeat: sisyphusRequests.length >= 13
      && sisyphusRequests.every((request) => request.body?.model === routes.sisyphus.model),
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  const bonus = {
    sessionId: sessionId === undefined ? null : sessionId,
    commandLine: STOP_CONTINUATION_COMMAND_LINE,
    admissions: commandResults.map((entry) => ({
      line: entry.line,
      matched: entry.matched,
      result: entry.admission?.result ?? null,
    })),
    commandRuns: commandRunEvents.map((event) => ({ seq: event.seq, data: event.data })),
    commandDones: commandDoneEvents.map((event) => ({ seq: event.seq, data: event.data })),
    stopBoundarySeq: firstDone?.seq ?? null,
    preStopSteerCarriers: preSteerClaims.map((event) => ({
      seq: event.seq,
      source: event.data?.source ?? null,
      text: messageContentText(event.data),
    })),
    preSteerRequestIndices,
    postStopSteerCount: postSteerCount,
    postStopBoundaryTodos: postStopTodos,
    postStopTailEventTypes: postStopTail.map((event) => event.type),
    guardStopLines,
    guardClearedLines: bootLog
      .split('\n')
      .filter((line) => line.startsWith(STOP_CONTINUATION_GUARD_CLEARED_PREFIX)),
    circuitBreakerLineSeen: bootLog.includes(todoContinuationCircuitBreakerLine(5)),
    goalRoundCount: goalRoundMessages.length,
    goalRoundsAfterThirdDone,
    abortedTurnsAfterGoal: abortedTurnsAfterGoal,
    mockRequestCount: sisyphusRequests.length,
    mockRequestModels: sisyphusRequests.map((request) => request.body?.model),
    backgroundJobStarted: backgroundCall !== undefined,
    goalCreated: createGoalCall !== undefined,
    turnEndReasons: events
      .filter((event) => event.type === 'turn/end')
      .map((event) => ({
        seq: event.seq,
        turn: event.data?.turn,
        kind: turnEndReasonKind(event),
      })),
  }
  return { result: failed.length === 0 ? 'PASS' : 'FAIL', checks, failed, bonus }
}

// ── P4-T11: ulw-execute-command-activates-atlas — the COMMAND (marker) path ────
// ONE session, THREE prompts and TWO `/ulw-execute` calls, in exactly this order,
// interleaved through the P4-T9 `actions` path (the command must land BETWEEN the
// conductor's turns):
//
//   ① `/ulw-execute alpha` #1 → the template rides a followup into the CONDUCTOR
//     session, and the conductor then delegates atlas with a task text that
//     CARRIES the template (R-10's real link: the marker reaches H-32 through the
//     delegation, not through the command line). The atlas child activates:
//     H-32's injected context lands in the CHILD's own durable log.
//   ② prompt 1: that trigger turn — delegate the work session to atlas, then
//     summarize.
//   ③ prompt 2 (对照 / control): a delegation whose task text carries NO marker
//     and NO work-plan intent → H-32 stays silent. This is the negative control
//     for the MARKER conjunct specifically.
//   ④ `/ulw-execute alpha` #2 (幂等): the SAME command again, whose own followup
//     opens the turn that ⑤ then uses. The atlas child has already been injected,
//     so H-32's `already-injected` gate must hold — no second injection anywhere,
//     and the conductor's own session still never receives one (the conductor is
//     not an injection surface BY DESIGN).
//   ⑤ prompt 2: that turn, which deliberately delegates nothing (a second work
//     session would be the very thing the idempotence gate prevents).
//
// The action order in the scenario definition is the one above; it is written out
// here rather than described because a header that drifts from the code is worse
// than no header.
//
// WHY THE MARKER PATH IS A SEPARATE SCENARIO from P3-T17's two: P3-T17 proves
// the INTENT path (a narrowed word list + word boundaries) and its negative
// control. This one observes the MARKER CONTRACT end to end: the template the
// command produced carries both R-10 markers, the delegation task text atlas
// actually received carries them too, and both are decided by the SHIPPED
// `hasCommandTemplateMarker` rather than by a re-implemented conjunction — so a
// marker regression anywhere (template rendering, the hand-off, either constant)
// turns a NAMED assertion red.
//
// WHAT THIS SCENARIO DOES NOT CLAIM (measured, not assumed): the delegation text
// also trips FIVE entries of WORK_INTENT_MARKERS, so on a correct runtime BOTH
// intent tracks are satisfied and this run cannot attribute the activation to
// the marker gate alone. Attributing the gate needs a text that trips one and
// not the other — and `hasCommandTemplateMarker` requires the full three-layer
// template, which necessarily contains the intent words. That isolation belongs
// to the unit suite (it can call either gate on a synthetic string); here the
// contract surface is what is named and observed.
//
// Measured facts the assertions are derived from (never guessed):
//   * the command name / description / argument hint and the template's three
//     layers come from the shipped `omo-commands` package;
//   * the two R-10 markers are `constants.ts`'s OWN exports, imported below, so
//     "the template marker" means the module's value and not a copy;
//   * the injection's source contract and context sentinel come from the same
//     `constants.ts` the P3-T17 scenarios already read;
//   * the registration line comes from `boot-markers.ts`.
const ULW_EXECUTE_COMMAND_LINE = '/ulw-execute alpha'
const ULW_EXECUTE_CONTROL_DELEGATION_TASK =
  'summarize the repository layout in three sentences and report nothing else'
const ULW_EXECUTE_COMMAND_PROMPT_1 =
  'e2e ulw-execute-command: the instruction is above — delegate the work session to atlas with it, then summarize'
const ULW_EXECUTE_CONTROL_PROMPT =
  'e2e ulw-execute-command (control): delegate a plain summary to atlas, no marker and no work-plan intent'
const ULW_EXECUTE_COMMAND_PROMPT_2 =
  'e2e ulw-execute-command (idempotence): the instruction was queued again — do not start a second work session'
const ULW_EXECUTE_COMMAND_CONDUCTOR_SUMMARY =
  'MOCK-ULW-CMD-SUMMARY-4c81d2: handed the work session to atlas with the instruction text'
const ULW_EXECUTE_CONTROL_CONDUCTOR_SUMMARY =
  'MOCK-ULW-CMD-CONTROL-SUMMARY-7e30a5: delegated the plain summary'
const ULW_EXECUTE_COMMAND_ATLAS_NOTE =
  'MOCK-ULW-CMD-ATLAS-NOTE-1-5b90f2: executing the handed-over instruction'
const ULW_EXECUTE_COMMAND_ATLAS_SECOND_NOTE =
  'MOCK-ULW-CMD-ATLAS-NOTE-2-3d61a8: continuing with the injected plan context'
const ULW_EXECUTE_CONTROL_ATLAS_NOTE =
  'MOCK-ULW-CMD-CONTROL-ATLAS-NOTE-9a47c1: summarized the layout'
const ULW_EXECUTE_TRIGGER_LABEL = 'Hand over the command work session'
const ULW_EXECUTE_CONTROL_LABEL = 'Plain summary control'
// The atlas delegation's task text for the trigger: the CONDUCTOR hands the
// command's rendered instruction to atlas verbatim. The exact template bytes are
// BUILT by the shipped renderer below rather than pasted, so what the child
// receives is what the command really produced; the child's own copy is what the
// assertions then read back out of its log.
const ULW_EXECUTE_ATLAS_TRIGGER_TASK = renderCommandTemplate(ULW_EXECUTE_COMMAND_TEMPLATE, {
  arguments: ULW_EXECUTE_PLAN_NAME,
  sessionId: ULW_EXECUTE_MARKER_SESSION_ID,
  now: () => ULW_EXECUTE_MARKER_TIMESTAMP,
})

/**
 * ulw-execute-command-activates-atlas script. Two roles, two lanes:
 *   sisyphus: the TRIGGER delegation (task = the command's rendered instruction)
 *     → summary; then the 对照 delegation (task = a plain summary) → summary;
 *     then the idempotence turn, which delegates NOTHING (a second work session
 *     would be the very thing the idempotence gate prevents).
 *   atlas: the trigger child takes TWO steps (the delegation prompt, then the
 *     step opened by the injected context); the control child takes one (no
 *     injection → no second step).
 */
function ulwExecuteCommandScript() {
  return {
    sisyphus: [
      {
        type: 'tool_call',
        name: 'atlas',
        arguments: {
          description: ULW_EXECUTE_TRIGGER_LABEL,
          prompt: ULW_EXECUTE_ATLAS_TRIGGER_TASK,
          run_in_background: true,
        },
      },
      { type: 'text', text: ULW_EXECUTE_COMMAND_CONDUCTOR_SUMMARY },
      {
        type: 'tool_call',
        name: 'atlas',
        arguments: {
          description: ULW_EXECUTE_CONTROL_LABEL,
          prompt: ULW_EXECUTE_CONTROL_DELEGATION_TASK,
          run_in_background: true,
        },
      },
      { type: 'text', text: ULW_EXECUTE_CONTROL_CONDUCTOR_SUMMARY },
      { type: 'text', text: ULW_EXECUTE_COMMAND_PROMPT_2 },
    ],
    atlas: [
      { type: 'text', text: ULW_EXECUTE_COMMAND_ATLAS_NOTE },
      { type: 'text', text: ULW_EXECUTE_COMMAND_ATLAS_SECOND_NOTE },
      { type: 'text', text: ULW_EXECUTE_CONTROL_ATLAS_NOTE },
    ],
  }
}

/** The reason kind of the session's LAST `turn/end` (`undefined` if none). */
function lastTurnReasonKind(events) {
  const last = (events ?? []).filter((event) => event.type === 'turn/end').pop()
  return last === undefined ? undefined : turnEndReasonKind(last)
}

/**
 * The stop condition: BOTH children have run their turns and the notepad
 * scaffold (the injection's side effect) has landed. A timeout returns false so
 * the analysis reports the honest FAIL rather than the driver crashing.
 */
async function awaitUlwExecuteCommandChildren(sandbox, sessionId, timeoutMs = 30_000) {
  // On timeout this DOES NOT throw: the analysis then reports the honest FAIL.
  // `commandTurnTimeout` below records that the window ran out, so a scenario that
  // went red because the observation window closed can never be misread as an
  // assertion defect — the flag travels into the scenario's own result.
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // ONE read per poll, reused by both conditions. The original read the logs
    // twice per poll — once for the child and again for the scaffold branch — so
    // the two conditions could be answering about DIFFERENT moments in time.
    const child = findSessionLogs(join(sandbox.dshHome, 'sessions'))
      .find((candidate) => String(candidate.header?.parentSession) === String(sessionId))
    if (child !== undefined && turnCompleted(child.events ?? [])) return true
    // The scaffold can land before the child's turn closes, so it is a SECOND
    // reason to keep waiting, never a substitute for the turn having ended.
    if (existsSync(join(sandbox.project, '.omo', 'notepads', ULW_EXECUTE_PLAN_NAME, 'learnings.md'))) {
      const reread = findSessionLogs(join(sandbox.dshHome, 'sessions'))
        .find((candidate) => String(candidate.header?.parentSession) === String(sessionId))
      if (reread !== undefined && turnCompleted(reread.events ?? [])) return true
    }
    await sleep(250)
  }
  return false
}

/** The real sandbox disk facts, same shape the P3-T17 scenarios read. */
function ulwExecuteCommandDiskFacts(sandbox) {
  const notepadDir = join(sandbox.project, '.omo', 'notepads', ULW_EXECUTE_PLAN_NAME)
  const notepadFiles = ['learnings.md', 'decisions.md', 'issues.md', 'problems.md']
  const present = notepadFiles.filter((name) => existsSync(join(notepadDir, name)))
  const learningsPath = join(notepadDir, 'learnings.md')
  return {
    planPath: join(sandbox.project, ULW_EXECUTE_PLAN_REL),
    notepadDir,
    notepadPresent: present,
    notepadLearnings: existsSync(learningsPath) ? readFileSync(learningsPath, 'utf8') : undefined,
  }
}

/**
 * The ulw-execute-command-activates-atlas assertions (P4-T11). The claim is
 * R-10's marker path, in FOUR separately named parts so a regression in one gate
 * is distinguishable from a regression in another:
 *   ① the COMMAND surface — admitted, `command/run`/`command/done` paired,
 *     `done.kind` success, and the done text quotes the instruction's own char
 *     count, this session, and the argument hint.
 *   ② the TEMPLATE injection — the command's rendered instruction rides a
 *     followup into the conductor's own durable log as a user message, carrying
 *     the frame, the three template layers, both R-10 markers, and this
 *     session's id + an ISO timestamp with NO unsubstituted placeholder.
 *   ③ the MARKER path — the conductor delegated atlas with a task text carrying
 *     BOTH markers, the child is the atlas row by its own durable persona, the
 *     injected context landed in the CHILD's log with the producer triple, and
 *     it reached that child's model request.
 *   ④ 幂等 + the negative controls — the second command injected nothing new
 *     anywhere, the marker-less control delegation injected nothing, and the
 *     conductor itself never receives an injection (by design, not a bug).
 */
export function analyzeUlwExecuteCommandActivatesAtlas(
  {
    log,
    allLogs,
    requests,
    providersJson,
    bootLog,
    planPath,
    notepadPresent,
    notepadLearnings,
    settleReached,
  },
  routes,
) {
  const events = log?.events ?? []
  const parentId = log?.header?.id
  const sisyphusRequests = requests.filter((request) => request.role === 'sisyphus')
  const atlasRequests = requests.filter((request) => request.role === 'atlas')

  // ── the two children, linked to their delegation by the descriptor label ──
  const childLogs = Array.isArray(allLogs)
    ? allLogs.filter(
        (candidate) =>
          candidate.header?.origin === 'subagent'
          && String(candidate.header?.parentSession) === String(parentId),
      )
    : []
  const childByLabel = new Map()
  for (const child of childLogs) {
    const descriptor = (child.events ?? []).find((event) => event.type === 'subagent/descriptor')
    const label = descriptor?.data?.label
    if (typeof label === 'string') childByLabel.set(label, child)
  }
  const triggerChild = childByLabel.get(ULW_EXECUTE_TRIGGER_LABEL)
  const controlChild = childByLabel.get(ULW_EXECUTE_CONTROL_LABEL)

  const childPersona = (child) => {
    const descriptor = (child?.events ?? []).find((event) => event.type === 'subagent/descriptor')
    const persona = descriptor?.data?.persona
    return typeof persona === 'string' ? persona : undefined
  }
  // The child's own durable record of the delegation task text it received.
  const childFirstUserText = (child) => {
    const first = (child?.events ?? []).find(
      (event) => event.type === 'user/message' && event.data?.source?.kind !== 'plugin',
    )
    return first === undefined ? undefined : messageContentText(first.data)
  }
  const injectedInto = (child) => (child?.events ?? []).filter(
    (event) => event.type === 'user/message'
      && (event.data?.content ?? []).some(
        (block) => typeof block?.text === 'string' && block.text.includes(E2E_ULW_CONTEXT_MARKER),
      ),
  )
  const triggerInjected = injectedInto(triggerChild)
  const controlInjected = injectedInto(controlChild)
  const triggerInjectionText = triggerInjected
    .flatMap((event) => (event.data?.content ?? []).map((block) => block?.text ?? ''))
    .join('\n')
  const triggerInjectionSource = triggerInjected[0]?.data?.source

  // ── ① the command surface ────────────────────────────────────────────────
  const commandRuns = events.filter((event) => event.type === 'command/run')
  const commandDones = events.filter((event) => event.type === 'command/done')
  const doneFor = (run) => run === undefined
    ? undefined
    : commandDones.find((event) => event.data?.commandId === run.data?.commandId)
  const firstDone = commandDones[0]
  const firstDoneText = firstDone?.data?.text ?? ''

  // ── ② the template injection into the CONDUCTOR's log ────────────────────
  // The instruction is the conductor's own user message whose text carries the
  // COMMAND FRAME — found by content rather than by position, because a followup
  // claim lands at a turn boundary whose seq this analysis does not hard-code.
  //
  // Deliberately keyed on the frame head (`# /ulw-execute Command`) and NOT on
  // the R-10 header marker. The benefit is ATTRIBUTION, not vacuity: a template
  // that lost the marker would still be FOUND as a carrier, so its defect lands
  // on `instructionCarriesBothR10Markers` — the gate that is actually broken —
  // instead of reddening the carrier-count and the model-request checks and
  // leaving the reader to guess which gate failed. (Keying on the marker would
  // not make the marker check pass vacuously: the `typeof` guards would go red.
  // It would just make the failure point a misleading one.)
  const instructionCarriers = events.filter(
    (event) => event.type === 'user/message'
      && messageContentText(event.data).startsWith(`# /${ULW_EXECUTE_COMMAND_NAME} Command`),
  )
  const instructionText = instructionCarriers[0] === undefined
    ? undefined
    : messageContentText(instructionCarriers[0].data)
  const instructionRequestIndex = instructionText === undefined
    ? -1
    : sisyphusRequests.findIndex((request) => requestMessagesContain(request, instructionText))

  const checks = {
    ...dModeGivens({ log, providersJson, bootLog }, routes),
    ulwExecuteRegisteredInBootLog:
      bootLog.includes('[omo-commands] command ulw-execute registered'),
    // ① the command event pair, twice (idempotence is a second real call).
    commandAdmittedTwice: commandRuns.length === 2 && commandDones.length === 2
      && commandRuns.every((run) => doneFor(run) !== undefined)
      && commandDones.every((event) => event.data?.kind === 'success'),
    commandRunsRecordedWithArgsAndUserSource: commandRuns.length === 2
      && commandRuns.every((event) => event.data?.name === 'ulw-execute'
        && event.data?.source?.kind === 'user'
        // The argument is the plan name, WITH `parseCommand`'s unnormalized
        // separator space in front of it (dsh-commands/lib/types/index.js:82).
        && event.data.args === ` ${ULW_EXECUTE_PLAN_NAME}`)
      && new Set(commandRuns.map((event) => event.data?.commandId)).size === 2,
    // The done text quotes the instruction's own char count, this session, and
    // the argument hint — three values the command could only know by rendering.
    commandDoneNamesThisSessionAndThePayload:
      firstDoneText.startsWith('Ulw-execute instruction queued (')
      && firstDoneText.includes(`session ${parentId}`)
      && firstDoneText.includes(ULW_EXECUTE_ARGUMENT_HINT)
      && /^Ulw-execute instruction queued \(\d+ chars/.test(firstDoneText),
    // ② the template injection into the conductor session.
    // ONE carrier per admitted call (measured: two for the two `/ulw-execute`
    // calls) — so this also pins that each call queued its OWN instruction
    // instead of the second one being swallowed.
    instructionCarriedIntoTheConductorSession: instructionCarriers.length === 2
      && instructionCarriers.every((event) => event.data?.role === 'user')
      && instructionCarriers.every((event) => event.data?.source?.kind === 'user'),
    instructionFrameAndThreeLayersAreIntact:
      typeof instructionText === 'string'
      && instructionText.startsWith(`# /${ULW_EXECUTE_COMMAND_NAME} Command`)
      && instructionText.includes(`**Description**: ${ULW_EXECUTE_DESCRIPTION}`)
      // TWO spaces, measured: `parseCommand`'s `rawInput` keeps the separator
      // space (`dsh-commands/lib/types/index.js:82`), and the frame adds its
      // own — the same port difference the T7 scenario records verbatim.
      && instructionText.includes(`**User Arguments**:  ${ULW_EXECUTE_PLAN_NAME}`)
      && instructionText.includes('**Scope**: builtin')
      && instructionText.includes('<command-instruction>')
      && instructionText.includes('</command-instruction>')
      && instructionText.includes(E2E_SESSION_CONTEXT_OPEN)
      && instructionText.includes('</session-context>')
      && instructionText.includes('<user-request>')
      && instructionText.includes('</user-request>'),
    // BOTH R-10 markers, verbatim from constants.ts — the cross-package contract
    // this scenario exists to observe. A one-sided template would silently
    // deactivate H-32 without any error anywhere.
    instructionCarriesBothR10Markers:
      typeof instructionText === 'string'
      && hasCommandTemplateMarker(instructionText),
    // `<session-context>` substituted with THIS session and an ISO timestamp; no
    // placeholder survived the render.
    sessionContextSubstitutedInTheInstruction:
      typeof instructionText === 'string'
      && instructionText.includes(`Session ID: ${parentId}`)
      && /Timestamp: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(instructionText)
      && !instructionText.includes('$SESSION_ID')
      && !instructionText.includes('$TIMESTAMP')
      && !instructionText.includes('$ARGUMENTS'),
    // ... and it reached the conductor's model request (the followup opened its
    // own turn, so it rides the FIRST request of that turn).
    instructionReachedTheConductorModelRequest: instructionRequestIndex === 0,
    // ③ the MARKER path.
    // The conductor really delegated atlas with a task text carrying the
    // template — the link R-10 names. Read from the CHILD's own log, so the
    // assertion is about what atlas actually received.
    atlasDelegationTaskCarriesTheTemplateMarker:
      typeof childFirstUserText(triggerChild) === 'string'
      && hasCommandTemplateMarker(childFirstUserText(triggerChild)),
    triggerChildIsTheAtlasRow:
      typeof childPersona(triggerChild) === 'string'
      && childPersona(triggerChild).includes('omo-atlas'),
    // The injection landed in the CHILD's own durable log, names the sandbox
    // plan, and carries the producer triple.
    injectedContextReachedTheAtlasChild:
      triggerInjected.length === 1
      && triggerInjectionText.includes(AUTO_SELECTED_PLAN_HEADING)
      && triggerInjectionText.includes(`**Path**: ${planPath}`)
      && triggerInjectionText.includes(`**Plan**: ${ULW_EXECUTE_PLAN_NAME}`),
    injectionSourceContract:
      triggerInjectionSource?.kind === 'plugin'
      && triggerInjectionSource?.plugin === E2E_ULW_PLUGIN
      && triggerInjectionSource?.form === 'instructions',
    injectionReachedTheAtlasModelRequest: atlasRequests.some(
      (request) => JSON.stringify(request.body ?? {}).includes(E2E_ULW_CONTEXT_MARKER),
    ),
    // The atlas lane really made MORE THAN ONE request. Named for what it can
    // actually see: the mock cursor is per ROLE, so a request count cannot be
    // attributed to ONE child — both children draw from the same `atlas` lane
    // (measured: 4 in the real run; the fixture pins 3, and `>= 2` still pins
    // the claim). What the injection adds is a step to whichever child it
    // opened; the lane count is the only aggregate witness the parent side can
    // see.
    // (P4-T16: the T16 consistency sweep is DONE — P3-T17's side was renamed from
    // `atlasLaneTookASecondStep` to this same name, and carries the same
    // per-child caveat in its own comment. The two no longer disagree.)
    atlasLaneMadeMoreThanOneRequest: atlasRequests.length >= 2,
    // The scaffold side effect of the plan selection landed in the sandbox.
    notepadScaffoldLanded: notepadPresent.length === 4,
    // The scaffold's own footer is rewritten by the H-32 activation (the upstream
    // `/start-work` reference is replaced). Presence alone would pass on an EMPTY
    // scaffold, so the bytes are read off the real disk and pinned — the same shape
    // as the P3-T17 assertion, which reads `notepadLearnings` the same way.
    // The whole SHIPPED footer, not a hand-typed prefix of it. A prefix needle
    // (`'Auto-scaffolded by ulw-execute'`) would also pass on a file whose footer
    // was truncated halfway, so the surface this pins is narrowed to exactly what
    // the activation is supposed to write.
    notepadFooterRewrittenByTheActivation:
      typeof notepadLearnings === 'string'
      && notepadLearnings.includes(E2E_ULW_NOTEPAD_FOOTER)
      && !notepadLearnings.includes('/start-work'),
    // ④ 幂等: the second command added NO injection ANYWHERE — not in the
    // already-injected child, not in the control child, not in any third child.
    // Counted across every child log rather than as a request/step count: the
    // mock's cursor is PER ROLE, so both children share one lane and the step
    // count is a property of the fixture, not of H-32 (measured: 4 atlas
    // requests for two children that should take 2 and 1 steps).
    secondCommandInjectedNothingNew: triggerInjected.length === 1
      && controlInjected.length === 0
      && childLogs.reduce((total, child) => total + injectedInto(child).length, 0) === 1,
    // 对照: a marker-less, intent-less delegation on the same atlas identity → silence.
    markerlessControlInjectedNothing:
      controlChild !== undefined
      && typeof childPersona(controlChild) === 'string'
      && controlInjected.length === 0,
    // The CONDUCTOR is not an injection surface — by design (it has no atlas
    // descriptor, so H-32 returns before the decision). Pinned so a future
    // "fix" that widens the identity gate turns red here.
    conductorNotInjected: !events.some(
      (event) => event.type === 'user/message'
        && (event.data?.content ?? []).some(
          (block) => typeof block?.text === 'string' && block.text.includes(E2E_ULW_CONTEXT_MARKER),
        ),
    ),
    turnCompleted: turnCompleted(events),
    // The LAST turn really finished, on its own terms. `turnCompleted` above only
    // asks whether a completed turn exists SOMEWHERE; this asks about the final
    // one, because a driver that tore the session down early used to cancel it
    // (`canceled`) while the scenario still passed on the earlier turns. With two
    // commands that each queue a followup, the turn accounting has to be right for
    // this to hold — the assertion is what proves it, not luck.
    lastTurnEndedOnItsOwnTerms: lastTurnReasonKind(events) === 'completed',
  }
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return {
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    failed,
    checks,
    bonus: {
      parentId,
      lastTurnReasonKind: lastTurnReasonKind(events),
      // The settle hook's own verdict: `true` = the children ran and the scaffold
      // landed; `false` = the observation window expired. Surfaced so a red run
      // distinguishes "a claim is false" from "we stopped looking".
      commandTurnTimeout: settleReached === false,
      commandLine: ULW_EXECUTE_COMMAND_LINE,
      commandRuns: commandRuns.map((event) => ({ seq: event.seq, data: event.data })),
      commandDones: commandDones.map((event) => ({ seq: event.seq, data: event.data })),
      instructionRequestIndex,
      instructionTextChars: instructionText?.length ?? null,
      triggerChildTaskChars: childFirstUserText(triggerChild)?.length ?? null,
      childCount: childLogs.length,
      triggerInjectionCount: triggerInjected.length,
      controlInjectionCount: controlInjected.length,
      atlasRequestCount: atlasRequests.length,
      sisyphusRequestCount: sisyphusRequests.length,
      notepadPresent,
      triggerInjectionTail: triggerInjectionText.slice(-240),
    },
  }
}

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
    // P3-T9 (plan §4.2 mode E pilot; task book WP-3): the FIRST executor-type
    // omo-hooks listener proves its whole chain in one real run — a turn that
    // is about to stop with todos still open MUST be steered into another step
    // of the SAME turn, that step MUST advance the list to all-completed, and
    // only then may the turn end. The 对照 is a SECOND turn on the same session
    // whose todo list is already all-completed: the boundary must stay silent.
    // Every later executor-group hook copies this scenario's shape.
    name: 'todo-continuation-enforced',
    prompt: TODO_CONTINUATION_PROMPT,
    followupPrompts: [TODO_CONTROL_PROMPT],
    roles: ['sisyphus'],
    script: todoContinuationScript,
    analyze: analyzeTodoContinuationEnforced,
  },
  {
    // P3-T12 (plan §4.2 pattern F; task book WP-5): the session-notification
    // listener proves its delivery chain in one real run — a turn that really
    // produced work (a bash call that wrote a file) closes `completed`, the
    // scheduler arms the idle-confirmation timer, and exactly ONE anchor line
    // `[omo-hooks] session-notification: idle <baseTitle>` lands on the
    // measured carrier (the dsh process log — see the analysis header) with the
    // OS command attempted through the platform backend.
    //
    // HONEST SCOPE (three recorded limits, none of them silent):
    //   1. NO live no-work CONTROL. The listener is registered by the PLUGIN at
    //      process start, so there is no per-scenario switch to turn it off for
    //      a second session; a "second, work-less turn produces no new anchor"
    //      assertion cannot be isolated when both turns share one process.
    //      Asserting "the anchor count is 1 while turn 1 produced work and turn
    //      2 did not" would in fact be a claim about scheduling ORDER, not
    //      about the gate. The gate (`hasWorked`) is therefore covered where it
    //      is deterministic: session-notification.test.ts cases ② and ③ (a
    //      completed turn with no step/end, and a bare idle status, both arm
    //      NOTHING). 记降级.
    //   2. The ERROR notification is not driven here either: `turn/end`
    //      reason.kind === 'error' needs a failing loop, which the mock LLM
    //      cannot produce deterministically (a mock transport error surfaces as
    //      a driver error, not a `turn/end error`). Unit case ④ covers it.
    //   3. background-notification got its OWN scenario in P3-T13, asserting the
    //      POSITIVE delivery chain there (see 'background-notification-log' below)
    //      instead of being covered only by
    //      tests/omo-hooks/background-notification.test.ts.
    name: 'session-notification-log',
    prompt: SESSION_NOTIFICATION_PROMPT,
    roles: ['sisyphus'],
    script: sessionNotificationScript,
    settle: (boot) => awaitNotificationAnchor(boot),
    analysisInput: (sandbox) => ({
      fixturePath: join(sandbox.project, NOTIFICATION_FIXTURE_NAME),
      fixtureText: NOTIFICATION_FIXTURE_TEXT,
      expectedAnchor: SESSION_NOTIFICATION_EXPECTED_ANCHOR,
    }),
    analyze: analyzeSessionNotificationLog,
  },
  {
    // P3-T13 (plan §4.2 pattern F; task book WP-5): the background-notification
    // listener's chain, driven through the ONE observable `ctx.jobs`
    // construction this harness has — a `run_in_background: true` delegation
    // from the conductor, on a ONE-SHOT background row (the shipped concerto
    // rows are `continuable`, and a continuable child has no background job at
    // all; see the scenario section's fact 2 and
    // `enableOneShotBackgroundExplore`). The parent turn closes immediately, the
    // child settles later, and the port's deferred `ctx.inject(['jobs'])`
    // subscription turns that settlement into the anchor line
    // `[omo-hooks] background-notification: <terminal status> explore` —
    // EXACTLY ONCE. The job is deliberately never read or waited for: a read
    // marks `reported` and the port would correctly stay silent, which is a
    // DIFFERENT path (the sibling suite covers the reported gate in unit tests).
    name: 'background-notification-log',
    prompt: BACKGROUND_NOTIFICATION_PROMPT,
    roles: ['sisyphus', BACKGROUND_NOTIFICATION_EXPECTED_LABEL],
    script: backgroundNotificationScript,
    // The scenario-local preset edit that makes a real JobRegistry entry
    // possible (runs after boot, before the session composes its tools).
    augmentMaterialized: enableOneShotBackgroundExplore,
    settle: (boot, sandbox, sessionId) => awaitBackgroundNotificationSettlement(boot, sandbox, sessionId),
    analyze: analyzeBackgroundNotificationLog,
  },
  {
    // P3-T14 (plan §4.2 模式 D; task book WP-6 批 A): H-14's listener proves the
    // whole chain in ONE real batch — a failed `edit` (real FS_EDIT_NOT_FOUND)
    // comes back with the reminder appended VERBATIM, and the sibling `edit` in
    // the SAME batch really succeeded and stayed untouched. See the P3-T14
    // section header for the two-call design and the 对照 semantics.
    name: 'edit-error-recovery-reminder',
    prompt: EDIT_RECOVERY_PROMPT,
    roles: ['sisyphus'],
    seed: (sandbox) => {
      writeFileSync(join(sandbox.project, EDIT_RECOVERY_FIXTURE_NAME), EDIT_RECOVERY_FIXTURE_CONTENT)
    },
    script: editErrorRecoveryScript,
    analysisInput: (sandbox) => ({
      fixturePath: join(sandbox.project, EDIT_RECOVERY_FIXTURE_NAME),
    }),
    analyze: analyzeEditErrorRecoveryReminder,
  },
  {
    // P3-T14: H-15's listener on ONE real batch whose two calls fail with the
    // IDENTICAL DSH malformed-arguments error — the only difference is the tool
    // name's blacklist membership (`write` in, `read` out).
    name: 'json-error-recovery-reminder',
    prompt: JSON_RECOVERY_PROMPT,
    roles: ['sisyphus'],
    script: jsonErrorRecoveryScript,
    analyze: analyzeJsonErrorRecoveryReminder,
  },
  {
    // P3-T14: H-16's listener on ONE real batch of two greps — the big one over
    // the fixed/adaptive budget (truncated, head kept, tail noted) and the small
    // one as the untouched control.
    name: 'tool-output-truncated',
    prompt: TRUNCATOR_PROMPT,
    roles: ['sisyphus'],
    seed: (sandbox) => {
      writeFileSync(join(sandbox.project, TRUNCATOR_BIG_FIXTURE_NAME), truncatorBigFixtureText())
      writeFileSync(join(sandbox.project, TRUNCATOR_SMALL_FIXTURE_NAME), `${TRUNCATOR_SMALL_LINES.join('\n')}\n`)
    },
    script: toolOutputTruncatedScript,
    analysisInput: () => ({ bigFixtureChars: truncatorBigFixtureText().length }),
    analyze: analyzeToolOutputTruncated,
  },
  {
    // P3-T14 (H-07; the e2e the P3-T9 arbitration moved into this task): two
    // foreground delegations on DIFFERENT roles, so the blank child and the
    // control child each consume their own mock step cursor. The blank child's
    // whitespace-only completion is upstream's `.trim() === ""` empty case, and
    // the parent's result must BE the corrective text verbatim; the oracle
    // child's real answer must come through untouched.
    name: 'empty-task-response-corrected',
    prompt: EMPTY_TASK_PROMPT,
    roles: ['sisyphus', 'explore', 'oracle'],
    script: emptyTaskResponseCorrectedScript,
    analyze: analyzeEmptyTaskResponseCorrected,
  },
  {
    // P3-T15 (H-21; plan §4.2 模式 D): the directory README of the file you just
    // read is project context. ONE batch holds the trigger (a README-bearing
    // chain) and the 对照 (a README-less chain); step 2 re-reads the trigger's
    // directory to exercise the DIRECTORY-keyed de-duplication on the real
    // runtime. See the P3-T15 section header.
    name: 'directory-readme-injected',
    prompt: README_INJECTOR_PROMPT,
    roles: ['sisyphus'],
    seed: (sandbox) => {
      const injectorDir = join(sandbox.project, README_INJECTOR_DIR)
      const nestedDir = join(injectorDir, README_INJECTOR_NESTED)
      const plainDir = join(sandbox.project, README_INJECTOR_PLAIN_DIR)
      mkdirSync(nestedDir, { recursive: true })
      mkdirSync(plainDir, { recursive: true })
      writeFileSync(join(injectorDir, 'README.md'), README_INJECTOR_README_CONTENT)
      writeFileSync(join(nestedDir, README_INJECTOR_TARGET_NAME), README_INJECTOR_TARGET_CONTENT)
      writeFileSync(join(nestedDir, README_INJECTOR_DEDUP_NAME), README_INJECTOR_DEDUP_CONTENT)
      writeFileSync(join(plainDir, README_INJECTOR_PLAIN_NAME), README_INJECTOR_PLAIN_CONTENT)
    },
    script: directoryReadmeInjectedScript,
    analysisInput: (sandbox) => ({
      readmePath: join(sandbox.project, README_INJECTOR_DIR, 'README.md'),
      targetPath: join(sandbox.project, README_INJECTOR_DIR, README_INJECTOR_NESTED, README_INJECTOR_TARGET_NAME),
      dedupPath: join(sandbox.project, README_INJECTOR_DIR, README_INJECTOR_NESTED, README_INJECTOR_DEDUP_NAME),
      plainPath: join(sandbox.project, README_INJECTOR_PLAIN_DIR, README_INJECTOR_PLAIN_NAME),
    }),
    analyze: analyzeDirectoryReadmeInjected,
  },
  {
    // P3-T15 (H-22; plan §4.2 模式 D): the delegation reminder, with the counter
    // semantics (MAX_REMINDERS, then `agentUsed`) asserted across SEVEN ordered
    // steps, and the orchestrator gate asserted on the child's own grep result.
    name: 'agent-usage-reminder-appended',
    prompt: AGENT_USAGE_PROMPT,
    roles: ['sisyphus', 'explore'],
    seed: (sandbox) => {
      writeFileSync(join(sandbox.project, AGENT_USAGE_FIXTURE_NAME), AGENT_USAGE_FIXTURE_CONTENT)
    },
    script: agentUsageReminderScript,
    analyze: analyzeAgentUsageReminderAppended,
  },
  {
    // P3-T15 (H-23; plan §4.2 模式 D): the continuation tip. The 对照 is the
    // FOREGROUND sibling in the SAME batch — same tool family, no id in its
    // render, so the result must come through byte-identical.
    name: 'task-resume-info-appended',
    prompt: TASK_RESUME_PROMPT,
    roles: ['sisyphus', 'explore', 'oracle'],
    script: taskResumeInfoScript,
    analyze: analyzeTaskResumeInfoAppended,
  },
  {
    // P3-T16 (H-24; plan §4.2 模式 B pilot + D; RE-SCOPED by PR #9 review F1):
    // the SSRF boundary. ONE batch holds the TRIGGER (a loopback 302 →
    // `/final`) and the 对照 (a 200 `/plain`); the guard must probe NEITHER, both
    // calls must reach the native provider's address policy, and the fixture must
    // observe ZERO requests. See the P3-T16 section header for why the live deny
    // path can no longer be exercised hermetically.
    name: 'webfetch-private-target-unprobed',
    prompt: WEBFETCH_GUARD_PROMPT,
    roles: ['sisyphus'],
    setup: () => startWebfetchRedirectFixture(),
    script: webfetchRedirectScript,
    analysisInput: (sandbox, redirect) => ({
      redirectUrl: redirect.redirectUrl,
      plainUrl: redirect.plainUrl,
      fixtureHits: redirect.hits,
    }),
    analyze: analyzeWebfetchPrivateTargetUnprobed,
  },
  {
    // P3-T16 (H-26; plan §4.2 模式 B + D): the prometheus identity gate. The
    // child is a REAL delegation (its descriptor persona is the identity
    // surface), it is given `write` back by a SANDBOX-ONLY preset edit (the
    // shipped row is read-only), and the scenario asserts the deny, the
    // `.omo/plans/` reminder and the two 对照 (a non-plans `.omo` write, and the
    // conductor's own write). See the P3-T16 section header.
    name: 'prometheus-md-only-denied',
    prompt: PROMETHEUS_MD_ONLY_PROMPT,
    roles: ['sisyphus', 'prometheus'],
    seed: (sandbox) => {
      mkdirSync(join(sandbox.project, PROMETHEUS_PLANS_DIR), { recursive: true })
      mkdirSync(join(sandbox.project, PROMETHEUS_DRAFTS_DIR), { recursive: true })
    },
    augmentMaterialized: enablePrometheusWriteTools,
    script: prometheusMdOnlyScript,
    settle: (boot, sandbox, sessionId) => awaitPrometheusChildCompletion(boot, sandbox, sessionId),
    analysisInput: (sandbox) => prometheusDiskFacts(sandbox),
    analyze: analyzePrometheusMdOnlyDenied,
  },
  {
    // P3-T17 (H-32; plan §4.2 模式 A + §4.5): the ulw-execute activation. The
    // conductor delegates TWO continuable children: `atlas` WITH work-plan intent
    // (the trigger) and `explore` WITH plan-ish words (the different-identity
    // 对照). The same-identity / no-intent 对照 is scenario 2
    // (`ulw-execute-no-intent`), not a third child here — an earlier one-scenario
    // draft tried both atlas children in one batch and failed on the mock's
    // per-role cursor (see the P3-T17 section header). Both are continuable
    // because the identity surface (`descriptor.persona`) only exists on
    // continuable children (the H-26 measured boundary).
    name: 'ulw-execute-activated',
    prompt: ULW_EXECUTE_PROMPT,
    roles: ['sisyphus', 'atlas', 'explore'],
    seed: (sandbox) => {
      mkdirSync(join(sandbox.project, '.omo', 'plans'), { recursive: true })
      writeFileSync(join(sandbox.project, ULW_EXECUTE_PLAN_REL), ULW_EXECUTE_PLAN_CONTENT)
    },
    script: ulwExecuteActivatedScript,
    settle: (boot, sandbox, sessionId) => awaitUlwExecuteChildren(boot, sandbox, sessionId),
    analysisInput: (sandbox) => ulwExecuteDiskFacts(sandbox),
    analyze: analyzeUlwExecuteActivated,
  },
  {
    // P3-T17 (H-32): the INTENT conjunct's negative control. Same identity
    // (atlas), no work-plan intent → silence. A separate scenario because the
    // mock cursor is per role (see the P3-T17 section header).
    name: 'ulw-execute-no-intent',
    prompt: ULW_EXECUTE_NO_INTENT_PROMPT,
    roles: ['sisyphus', 'atlas'],
    seed: (sandbox) => {
      mkdirSync(join(sandbox.project, '.omo', 'plans'), { recursive: true })
      writeFileSync(join(sandbox.project, ULW_EXECUTE_PLAN_REL), ULW_EXECUTE_PLAN_CONTENT)
    },
    script: ulwExecuteNoIntentScript,
    settle: (boot, sandbox, sessionId) => awaitUlwExecuteNoIntentChild(boot, sandbox, sessionId),
    analysisInput: (sandbox) => ulwExecuteNoIntentDiskFacts(sandbox),
    analyze: analyzeUlwExecuteNoIntent,
  },
  {
    // P4-T11 (H-32 + R-10): the COMMAND (marker) path, complementary to the two
    // P3-T17 scenarios that own the INTENT path. The command line lands the
    // template in the CONDUCTOR session; the conductor hands it to atlas as the
    // delegation task text; H-32 activates in the atlas CHILD. Interleaved
    // through `actions` because the command must arrive BETWEEN the turns.
    name: 'ulw-execute-command-activates-atlas',
    roles: ['sisyphus', 'atlas'],
    actions: [
      // `commandOpensTurn`: this command QUEUES a followup (its done text says
      // "it takes effect in the next turn"), so the driver must wait for that
      // turn and count it — see the actions branch.
      { kind: 'command', line: ULW_EXECUTE_COMMAND_LINE, commandOpensTurn: true },
      { kind: 'prompt', text: ULW_EXECUTE_COMMAND_PROMPT_1 },
      { kind: 'prompt', text: ULW_EXECUTE_CONTROL_PROMPT },
      // 幂等: the same command again — the child is already injected, so nothing
      // may be injected a second time.
      { kind: 'command', line: ULW_EXECUTE_COMMAND_LINE, commandOpensTurn: true },
      { kind: 'prompt', text: ULW_EXECUTE_COMMAND_PROMPT_2 },
    ],
    seed: (sandbox) => {
      mkdirSync(join(sandbox.project, '.omo', 'plans'), { recursive: true })
      writeFileSync(join(sandbox.project, ULW_EXECUTE_PLAN_REL), ULW_EXECUTE_PLAN_CONTENT)
    },
    script: ulwExecuteCommandScript,
    settle: (_boot, sandbox, sessionId) => awaitUlwExecuteCommandChildren(sandbox, sessionId),
    analysisInput: (sandbox) => ulwExecuteCommandDiskFacts(sandbox),
    analyze: analyzeUlwExecuteCommandActivatesAtlas,
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
  {
    // P4-T5: the skill DELIVERY mechanism end to end. The 19 vendored skills
    // must be visible to a real agent by bare name in the model-facing catalog,
    // loadable through the native `skill` tool, refused when unvendored, and
    // their relative references resolvable from the registered path. The
    // scenario's own expectations are DERIVED from the plugin's modules (see the
    // section header), so a roster change moves the assertions instead of
    // silently passing them.
    name: 'skills-catalog-visible',
    prompt: SKILL_CATALOG_PROMPT,
    roles: ['sisyphus'],
    script: skillsCatalogVisibleScript,
    analyze: analyzeSkillsCatalogVisible,
  },
  // ── P4-T13: the keyword-mode injection chain (H-33) ────────────────────────
  //
  // FOUR scenarios, because the session one-shot (S-6) makes "inject once" and
  // "inject again" mutually exclusive within one session. The main scenario
  // carries its own idempotency control as turn 2; the other three need their
  // own sessions.
  {
    name: 'ultrawork-keyword-injected',
    prompt: ULTRAWORK_KEYWORD_PROMPT,
    // Control ④: a SECOND `ulw` message in the same session. The one-shot guard
    // (S-6) must make it a no-op — this is the e2e face of the session-level
    // idempotency, and it is why this scenario is 2 turns rather than 1.
    followupPrompts: [ULTRAWORK_KEYWORD_FOLLOWUP_PROMPT],
    roles: ['sisyphus'],
    script: ultraworkKeywordScript,
    analyze: analyzeUltraworkKeywordInjected,
  },
  {
    name: 'keyword-negative-controls',
    // Controls ①②③ in three turns of one session. All three are negatives, so
    // none of them ever arms the one-shot — sharing the session is safe here and
    // makes the claim stronger (one stray injection fails all three).
    prompt: KEYWORD_CONTROL_NONE_PROMPT,
    followupPrompts: [KEYWORD_CONTROL_CODE_BLOCK_PROMPT, KEYWORD_CONTROL_SLASH_PROMPT],
    roles: ['sisyphus'],
    script: keywordNegativeControlsScript,
    analyze: analyzeKeywordNegativeControls,
  },
  {
    name: 'hyperplan-keyword-injected',
    prompt: HYPERPLAN_KEYWORD_PROMPT,
    roles: ['sisyphus'],
    // The driver CALLS `def.script(...)`, so the factory result is wrapped —
    // passing the object directly is the `def.script is not a function` crash.
    script: () => keywordTwoStepScript(HYPERPLAN_KEYWORD_SUMMARY),
    analyze: analyzeHyperplanKeywordInjected,
  },
  {
    name: 'combo-keyword-injected',
    prompt: COMBO_KEYWORD_PROMPT,
    roles: ['sisyphus'],
    script: () => keywordTwoStepScript(COMBO_KEYWORD_SUMMARY),
    analyze: analyzeComboKeywordInjected,
  },
  {
    // P4-T7 — the COMMAND CHANNEL pilot (see the command-channel block above
    // for the transport facts). `/handoff <args>`: the argument-bearing variant.
    // Two turns on one session:
    //   turn 1 — the command's own follow-up turn: admission → command/run →
    //     command/done(success) → the injected instruction (the frame + the
    //     template body + `<session-context>` with THIS session's id) → the
    //     model's handoff summary in the template's own format.
    //   turn 2 — 对照: an UNKNOWN command line, which must append no lifecycle
    //     events at all and fall back to the prompt path.
    name: 'handoff-summary-driven',
    roles: ['sisyphus'],
    commands: [
      { line: HANDOFF_COMMAND_LINE },
      { line: COMMAND_CHANNEL_UNKNOWN_LINE, submitAsPromptOnMiss: true },
    ],
    // `def.script` is CALLED by the driver (`startMockLlmServer({script: def.script(...)})`),
    // so a spec-parameterised factory has to be wrapped — passing it directly is
    // the `def.script is not a function` crash the hyperplan row already notes.
    script: () => commandChannelScript(COMMAND_CHANNEL_SPECS.handoff),
    analyze: (input, routes) => analyzeCommandChannelDriven(input, COMMAND_CHANNEL_SPECS.handoff, routes),
  },
  {
    // P4-T7 — the same channel, the NO-ARGUMENT variant: `/remove-ai-slops`
    // carries no argumentHint, so its frame omits `**User Arguments**` and its
    // rendered `$ARGUMENTS` is empty. Same two-turn shape (command turn +
    // unknown-line 对照).
    name: 'remove-ai-slops-driven',
    roles: ['sisyphus'],
    commands: [
      { line: COMMAND_CHANNEL_SPECS['remove-ai-slops'].line },
      { line: COMMAND_CHANNEL_UNKNOWN_LINE, submitAsPromptOnMiss: true },
    ],
    script: () => commandChannelScript(COMMAND_CHANNEL_SPECS['remove-ai-slops']),
    analyze: (input, routes) => analyzeCommandChannelDriven(input, COMMAND_CHANNEL_SPECS['remove-ai-slops'], routes),
  },
  {
    // P4-T9 — the /stop-continuation e2e. The ONLY scenario that drives the
    // interleaved `actions` path: it must stop continuation BETWEEN two turns,
    // which `commands`-then-`prompt` cannot express.
    name: 'stop-continuation-halts-todo',
    roles: ['sisyphus'],
    actions: [
      { kind: 'prompt', text: STOP_CONTINUATION_PROMPT_1 },
      { kind: 'prompt', text: STOP_CONTINUATION_PROMPT_2 },
      { kind: 'command', line: STOP_CONTINUATION_COMMAND_LINE },
      // 幂等: the second call must settle success again and change nothing. The
      // job-count clause legitimately differs between the two texts (the second
      // cancels nothing because the first already did) — see secondStopIsIdempotent.
      { kind: 'command', line: STOP_CONTINUATION_COMMAND_LINE },
      { kind: 'prompt', text: STOP_CONTINUATION_PROMPT_3 },
      // The goal face LAST: an active goal opens rounds of its own, and keeping
      // that nondeterminism after every other claim keeps it from disturbing them.
      { kind: 'prompt', text: STOP_CONTINUATION_PROMPT_4 },
      { kind: 'command', line: STOP_CONTINUATION_COMMAND_LINE },
    ],
    script: stopContinuationScript,
    // The goal driver must go quiet once the third stop paused it; the window
    // runs BEFORE `stopDsh` freezes the logs.
    settle: awaitGoalSilenceAfterStop,
    analyze: analyzeStopContinuationHaltsTodo,
  },
  {
    // P4-T15 — `/hyperplan` over the P4-T7 command channel, asserting the DEGRADED
    // rewrite the model actually receives (the guidance段, the roster mapping, the
    // Description-line suffix, and zero executable dead links).
    name: 'hyperplan-degraded-noted',
    roles: ['sisyphus'],
    commands: [
      { line: HYPERPLAN_COMMAND_LINE },
      // 对照: the SAME command with no argument. hyperplan carries an
      // `argumentHint` upstream, so the bare turn's frame must OMIT the
      // `**User Arguments**` line while the argument-bearing turn's must not.
      { line: HYPERPLAN_BARE_COMMAND_LINE },
    ],
    script: hyperplanDegradedScript,
    analyze: analyzeHyperplanDegradedNoted,
  },
  {
    // P4-T15 — `/ulw-plan` as a GESTURE, which is the opposite end of the same
    // mechanism: `ulw-plan` is the one manifest row that stays `pending` forever
    // precisely so no command shadows the bridge, so the run must show ZERO
    // `command/run`/`command/done` and still deliver `<skill_content>`.
    // Both lines use `submitAsPromptOnMiss`, which is the bridge's own
    // precondition: the admission miss IS what hands the text to the prompt path
    // where dsh-tool-skill's pre-step hook can scan it for the `/name` gesture.
    name: 'ulw-plan-loads-prometheus-skill',
    roles: ['sisyphus'],
    commands: [
      { line: ULW_PLAN_GESTURE_LINE, submitAsPromptOnMiss: true },
      { line: ULW_PLAN_BARE_GESTURE_LINE, submitAsPromptOnMiss: true },
    ],
    script: ulwPlanGestureScript,
    analyze: analyzeUlwPlanLoadsPrometheusSkill,
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
  // P3-T16 (the webfetch-private-target-unprobed scenario): a scenario may need a
  // PROCESS-LOCAL HTTP fixture whose ephemeral PORT exists only after it is
  // listening, and the mock script's tool arguments must name that URL. `setup`
  // therefore runs BEFORE the mock server starts and its return value is handed
  // to `script`/`analysisInput` and closed in the `finally` below. Scenarios
  // without `setup` are unchanged (the parameter is undefined).
  const setup = def.setup === undefined ? undefined : await def.setup(sandbox)
  const server = await startMockLlmServer({ script: def.script(sandbox, setup) })
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
    // P3-T13: a scenario may additionally edit the SANDBOX-OWNED materialized
    // preset before the session composes its tools (the MOCKROLE markers above
    // already prove the file is read at session composition, not at boot). Used
    // by the background scenario to reach the one-shot background job path the
    // shipped `continuable` rows cannot produce; loud on drift (it throws).
    def.augmentMaterialized?.(sandbox)

    // Wiring proof for BOTH adapters (transport-adaptive; same contract).
    const providers = await listProvidersJoined(boot)
    const providersJson = JSON.stringify(providers)

    const created = await sessionCreate(boot, {
      cwd: sandbox.project,
      agentPreset: CONCERTO_PRESET_ID,
    })
    console.error(`drive: [${def.name}] session created ${created.sessionId} (preset ${created.agentPreset ?? '?'})`)
    // P3-T9: a scenario may drive MORE than one turn on the same session (its
    // 对照 turn is a second prompt) — each prompt is awaited on its OWN
    // turn/end, so a later turn's arrival can never satisfy an earlier wait.
    // P4-T7: the scenario's COMMAND lines run first, on the registry's own
    // executor. A command whose handler injects opens its OWN turn
    // (Agent#followup, dsh-agent/lib/types/runtime-types.d.ts:186-192), so each
    // matched line is awaited here; an unmatched line is submitted as an ordinary
    // prompt instead — the Web UI's own fallback
    // (dsh-client-ui-commands/lib/client.js:796) — which becomes the 对照 turn.
    const commandResults = []
    let turnsSeen = 0
    let log

    // P4-T9: `actions` drives prompt/command steps IN ORDER, which `commands` +
    // `prompt` + `followupPrompts` cannot express (those run every command
    // first). A scenario that must stop continuation BETWEEN two turns needs the
    // ordering, so the interleaved form is its own path; the pre-existing two
    // fields keep their exact behaviour for the 29 scenarios that already pass.
    if (Array.isArray(def.actions)) {
      let actionOrdinal = 0
      for (const action of def.actions) {
        actionOrdinal += 1
        if (action.kind === 'prompt') {
          await sessionPrompt(boot, {
            sessionId: created.sessionId,
            mode: 'queue',
            content: [{ type: 'text', text: action.text }],
          })
          console.error(
            `drive: [${def.name}] action ${actionOrdinal}/${def.actions.length} prompt accepted; `
            + 'awaiting its turn/end on the session JSONL',
          )
          turnsSeen += 1
          log = await awaitTurnEnd(sandbox, created.sessionId, turnsSeen)
          continue
        }
        if (action.kind === 'command') {
          const admission = await commandExecute(boot, {
            sessionId: created.sessionId,
            line: action.line,
          })
          const matched = admission !== undefined && admission !== null
          commandResults.push({ line: action.line, matched, admission })
          console.error(
            `drive: [${def.name}] action ${actionOrdinal}/${def.actions.length} command ${action.line} → `
            + (matched ? `matched (${admission.result?.kind})` : 'NOT admitted'),
          )
          // Whether a matched command opens a turn is a property of the COMMAND,
          // not of the driver: /stop-continuation deliberately injects nothing
          // (P4-T8) and so opens none, while /ulw-execute queues a followup that
          // opens one. So the action DECLARES it (`commandOpensTurn`) and this
          // branch acts on the declaration. Left undeclared, the assumption here
          // silently mis-counted every later turn and the LAST one was still
          // running when the driver tore the session down (measured: that turn's
          // turn/end came back `canceled`) — "the window closed" was luck, not
          // proof.
          if (matched && action.commandOpensTurn === true) {
            turnsSeen = await awaitFollowupTurn(sandbox, created.sessionId, turnsSeen)
          }
          // Otherwise the command/log-only writes are already in the JSONL by the
          // time the NEXT action awaits its turn/end, which is when the analysis
          // reads them.
          continue
        }
        throw new Error(`drive: [${def.name}] unknown action kind ${JSON.stringify(action.kind)}`)
      }
      // No `return`: the settle → stopDsh → analyze tail below is shared by both
      // paths, so there is exactly ONE place where a scenario's observation
      // window closes and its log is frozen.
    } else {

      // ── the pre-P4-T9 shape: every `commands` line first, then `prompt` +
      // `followupPrompts` (an admission miss with `submitAsPromptOnMiss` joins the
      // prompt queue, AHEAD of them, because the miss is only known at runtime).
      const prompts = []
      for (const action of def.commands ?? []) {
        const admission = await commandExecute(boot, { sessionId: created.sessionId, line: action.line })
        const matched = admission !== undefined && admission !== null
        commandResults.push({ line: action.line, matched, admission })
        console.error(
          `drive: [${def.name}] command ${action.line} → ${matched ? `matched (${admission.result?.kind})` : 'NOT admitted'}`,
        )
        // Boundary (easy to break in a refactor, so it is stated here): `turnsSeen`
        // counts turns ALREADY OBSERVED. It is incremented in exactly TWO places:
        // the `if (matched)` increment right below (a command whose injection opened
        // its own turn — that branch also `continue`s, so it is the only increment
        // inside the command loop), and the single increment in the prompt `for`
        // loop further down, after its own `awaitTurnEnd`. "Both prompt branches"
        // was wrong: there is ONE prompt loop; its two increments are the two
        // increments just listed. An admission miss contributes nothing here
        // because it produced no turn; its line becomes a prompt, counted there.
        if (matched) {
          turnsSeen += 1
          log = await awaitTurnEnd(sandbox, created.sessionId, turnsSeen)
          continue
        }
        // unreachable when matched — the continue above guarantees it
        if (action.submitAsPromptOnMiss === true) prompts.push(action.line)
    }
    // 回落到 prompt 的命令行排在场景自己的 prompt 之前（它们在命令循环里先被收集），
    // 所以这里只需把 undefined 的 `def.prompt`（纯命令场景没有）滤掉。
    const scenarioPrompts = [...prompts, def.prompt, ...(def.followupPrompts ?? [])]
      .filter((line) => line !== undefined)
    for (const [index, prompt] of scenarioPrompts.entries()) {
      await sessionPrompt(boot, {
        sessionId: created.sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: prompt }],
      })
      console.error(
        `drive: [${def.name}] prompt ${index + 1}/${scenarioPrompts.length} accepted; `
        + 'awaiting its turn/end on the session JSONL',
      )
      turnsSeen += 1
      log = await awaitTurnEnd(sandbox, created.sessionId, turnsSeen)
    }
    }
    console.error(`drive: [${def.name}] ${turnsSeen} turn(s) observed`)
    const logPath = log?.path

    // P3-T12: a scenario may need to observe work that happens AFTER its last
    // turn/end (the notification's idle-confirmation delay, a timer-armed
    // side effect, or a background job settling). `settle` runs BEFORE
    // `stopDsh` freezes the boot log, so the observation window is a
    // scenario-owned decision rather than a race; it receives the sandbox and
    // the session id so it can watch the durable session JSONL too (P3-T13).
    // The settle hook's verdict is KEPT, not just awaited: a hook that returns
    // `false` has run out of observation window rather than found its condition,
    // and the analysis needs to be able to say so (P4-T11 `commandTurnTimeout`).
    // `undefined` means the scenario has no settle hook at all.
    const settleReached = await def.settle?.(boot, sandbox, created.sessionId)

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
        commandResults,
        settleReached,
        ...(def.analysisInput?.(sandbox, setup) ?? {}),
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
    if (typeof setup?.close === 'function') await setup.close()
  }
  return { scenario, sandboxRoot: sandbox.root }
}

// ── main ─────────────────────────────────────────────────────────────────────


// ── P4-T7 command-channel defect cases (one list, TWO specs) ───────────────
// Hoisted to module level so the self-test loop and the SELF-TEST OK banner read
// the SAME list: a banner can therefore never name fewer defects than were run.
//
// COVERAGE POLICY (what a defect list owes the check list): 18 checks, 17 defect
// cases, each check owning exactly one case; `pluginLoaded` is the single
// declared exception and owns none (every scenario in this driver shares it, so no
// single scenario can be the one to break it).
//
// SAME LABELS, SPEC-DEPENDENT MUTATORS: the labels below are identical for both
// specs — they name a CHANNEL property, not a row — but three mutators close over
// `spec`, and TWO of them flip direction by spec on purpose:
//   · `command/run disagrees with the args the user typed` — blanks the args of
//     the argument-bearing row, INVENTS them on the no-argument row;
//   · `the done text names the wrong session …` — rewrites the session clause on
//     the row that has one, APPENDS one to the row that must have none;
//   · (third, single-direction) `a $ARGUMENTS placeholder survived the render` —
//     rewrites the `<user-request>` block by REGEX because the two rows carry
//     different text there, and the defect ("the placeholder reached the model
//     unrendered") is independent of the arguments.
// The first two inversions are the same defect class read from the other side
// (a field disagreeing with what the user typed / must not claim). A reader must
// not "simplify" that symmetry away.
function commandChannelDefectCases(spec) {
  return [
    ['the command never registered (no boot-log registration line)', (input) => {
      input.bootLog = input.bootLog.split('\n').filter((line) => line !== spec.bootRegistrationLine).join('\n')
    }, 'commandRegisteredInBootLog'],
    ['admission returned nothing for a known command', (input) => {
      input.commandResults[0].matched = false
      input.commandResults[0].admission = undefined
    }, 'commandAdmissionMatched'],
    // 参数侧缺陷按行取反义：有实参的行**丢了**实参，无实参的行**凭空多出**实参 ——
    // 后者对 no-argument 变体才是同一类缺陷（`command/run` 谎报了用户没敲的东西）。
    ['command/run disagrees with the args the user typed', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'command/run'
          ? { ...event, data: { ...event.data, args: spec.args === '' ? 'fabricated-args' : '' } }
          : event)
    }, 'commandRunRecordedWithArgsAndUserSource'],
    ['command/done paired with a different commandId', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'command/done' ? { ...event, data: { ...event.data, commandId: 'cmd-fabricated-other' } } : event)
    }, 'commandDonePairedAndSucceeded'],
    ['the done text claims a payload size the carrier does not have', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'command/done'
          ? { ...event, data: { ...event.data, text: event.data.text.replace(/\(\d+ chars/, '(99999 chars') } }
          : event)
    }, 'doneTextDescribesInjectedPayload'],
      ['the injected carrier was not an identified user message', (input) => {
      // Covers `injectedInstructionCarriedAsUserMessage` — the carrier identity
      // (role / source.kind / id). Dropping the id is the defect the handler's own
      // fresh-uuid contract exists to prevent.
      input.log.events = input.log.events.map((event) =>
        event.type === 'user/message' && typeof event.data?.id === 'string' && event.data.id.startsWith('fabricated-injected')
          ? { ...event, data: { ...event.data, id: undefined } }
          : event)
    }, 'injectedInstructionCarriedAsUserMessage'],
  ['the frame lost its **Scope**: builtin line', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'user/message' && typeof event.data?.id === 'string' && event.data.id.startsWith('fabricated-injected')
          ? { ...event, data: { ...event.data, content: [{ type: 'text', text: messageContentText(event.data).replace('**Scope**: builtin', 'Scope: builtin') }] } }
          : event)
    }, 'injectedInstructionFrameIsUpstreamShape'],
    ['a $ARGUMENTS placeholder survived the render', (input) => {
      // 正则而非字面串：handoff 的 <user-request> 带实参、slops 的是空段，两者的
      // 字面形态不同，而"占位符原样送到模型"这条缺陷与实参无关。
      input.log.events = input.log.events.map((event) =>
        event.type === 'user/message' && typeof event.data?.id === 'string' && event.data.id.startsWith('fabricated-injected')
          ? {
            ...event,
            data: {
              ...event.data,
              content: [{
                type: 'text',
                text: messageContentText(event.data).replace(
                  /<user-request>\n[\s\S]*?<\/user-request>/,
                  '<user-request>\n$ARGUMENTS\n</user-request>',
                ),
              }],
            },
          }
          : event)
    }, 'injectedInstructionBodyIsTheTemplateBody'],
    ['the injected carrier was claimed BEFORE command/done settled (an order the host never produces)', (input) => {
    const runEvent = input.log.events.find((event) => event.type === 'command/run')
    const carrier = input.log.events.find((event) => event.type === 'user/message'
      && typeof event.data?.id === 'string' && event.data.id.startsWith('fabricated-injected'))
    input.log.events = [runEvent, carrier, ...input.log.events.filter((event) => event !== runEvent && event !== carrier)]
      .map((event, index) => ({ ...event, seq: index + 1 }))
  }, 'injectedCarrierClaimedAfterCommandDone'],
  ['the injected turn ended with an error', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'turn/end' && event.data?.turn === 1
          ? { ...event, data: { ...event.data, reason: { kind: 'error' } } }
          : event)
    }, 'commandTurnCompleted'],
    // Swapping the two requests is the "the command needed a prompt to wake
    // it" defect: BOTH index checks must react, and the self-test only
    // requires the intended one to be among the failures.
    ['the instruction rode the SECOND request (something had to kick the turn)', (input) => {
      input.requests = [input.requests[1], input.requests[0]]
    }, 'injectedInstructionReachedFirstModelRequest'],
    ['the model ignored the template output format', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'assistant/message' && messageContentText(event.data?.message ?? event.data).includes('MOCK-')
          && event.data?.turn === 1
          ? { ...event, data: { ...event.data, message: { role: 'assistant', content: [{ type: 'text', text: 'sure, done' }] } } }
          : event)
    }, 'modelFollowedTemplateOutputFormat'],
  // Spec-dependent by necessity: the session clause EXISTS in the argument-bearing
  // row's done text and MUST NOT exist in the no-argument row's, so "wrong" is the
  // opposite edit in each.
  //
  // What this case proves, stated per row rather than lumped: on the
  // ARGUMENT-BEARING row only the session-clause check can react, because the
  // char count is untouched. On the NO-ARGUMENT row the anchoring regex already
  // forbids a session clause (its `doneTextPattern` has no such group, and
  // `doneMatch.length === 2` is the constant the review caught), so the
  // session-clause check there is a RESTATEMENT of that regex rather than an
  // independent probe — a review that breaks the row's anchoring three ways finds
  // both checks flip together, which is exactly why the anchor is spelled as two
  // booleans instead of one with a vacuous branch.
  ['the done text names the wrong session (or a session at all where there is none)', (input) => {
    input.log.events = input.log.events.map((event) =>
      event.type === 'command/done'
        ? {
          ...event,
          data: {
            ...event.data,
            text: spec.sessionContextExpected
              ? event.data.text.replace(/session [^)]+\)/, 'session session-fabricated-somebody-else)')
              : event.data.text.replace(/\.$/, ', session session-fabricated-somebody-else.'),
          },
        }
        : event)
  }, 'doneSessionClauseMatchesTheCarrier'],
  ['the control turn ended with an error instead of completing', (input) => {
    input.log.events = input.log.events.map((event) =>
      event.type === 'turn/end' && event.data?.turn === 2
        ? { ...event, data: { ...event.data, reason: { kind: 'error' } } }
        : event)
  }, 'controlTurnCompleted'],
  ['the unknown line produced lifecycle events (an error instead of zero events)', (input) => {
      input.log.events = [
        ...input.log.events,
        { seq: 20, type: 'command/run', data: { commandId: 'cmd-fabricated-2', name: 'definitely-not-a-command', args: '', source: { kind: 'user' } } },
        { seq: 21, type: 'command/done', data: { commandId: 'cmd-fabricated-2', kind: 'error', text: 'unknown command' } },
      ]
    }, 'controlUnknownLineAdmittedNothing'],
    ['the unknown line never fell back to the prompt path', (input) => {
      // 去掉回落到 prompt 的那条用户消息：命令未命中后 UI 把该行当普通提问提交，
      // 这一环消失 = 用户输入凭空丢了（另一类缺陷"未命中却进了 handler"由上一条
      // 的零事件断言覆盖）。
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'user/message'
          && messageContentText(event.data).includes(COMMAND_CHANNEL_UNKNOWN_LINE)),
      )
    }, 'controlUnknownLineFellBackToPrompt'],
    ['a third model request appeared', (input) => {
      // 模型名取自已记录的请求，而不是闭包里的 `routes` —— 本函数是模块级的，
      // 拿不到自检函数的参数（第一版就栽在这里，运行时报 ReferenceError）。
      input.requests = [...input.requests, { role: 'sisyphus', body: { model: input.requests[0].body.model, messages: [] }, receivedAt: 30 }]
    }, 'mockSawExpectedRequestCount'],
  ]
}

// ── P4-T11 ulw-execute-command fabricated inputs + defect cases (self-test) ─────
// A fabricated GOOD input MUST PASS every named check, and each defect MUST fail
// exactly its own. Two shape rules, both learned the hard way:
//   ① a module-level factory CANNOT close over the fixture's `routes` — read the
//      model id back off the fixture itself (`input.providers[0]`), or the self-
//      test dies with a ReferenceError instead of a red check;
//   ② a module-level name is a SINGLE binding for the whole file (the last
//      declaration wins), so every factory, analyzer and defect-case function of
//      this scenario carries `ulwCommand` or `ulw-execute-command` in its name.
//      A name shared with P3-T17 did not fail — it silently handed this scenario
//      the OTHER scenario's fixture, and the defect cases then mutated data the
//      analyzer never read.
//
// COVERAGE POLICY (the T7 shape, counted the same way): 21 checks, 33 defect
// cases. Every check owns at least one case; `pluginLoaded` and
// `sisyphusProviderActive` are the two shared givens this scenario inherits from
// the driver's common block — the latter still owns a case here because the seat
// is what this scenario's own requests carry. Eleven defects redden MORE than one
// check, and that is honest coupling, not sloppy fixtures: a lost template marker
// really does break the marker gate AND the hand-off AND the child activation at
// once. Isolating them would require fixtures that cannot occur.
const FABRICATED_ULW_COMMAND_SESSION_ID = 'session-fabricated-ulw-command'
const FABRICATED_ULW_COMMAND_CHILD_TRIGGER = 'session-fabricated-ulw-child-trigger'
const FABRICATED_ULW_COMMAND_CHILD_CONTROL = 'session-fabricated-ulw-child-control'
const FABRICATED_ULW_COMMAND_TRIGGER_TASK = renderCommandTemplate(ULW_EXECUTE_COMMAND_TEMPLATE, {
  arguments: ULW_EXECUTE_PLAN_NAME,
  sessionId: FABRICATED_ULW_COMMAND_SESSION_ID,
  now: () => ULW_EXECUTE_MARKER_TIMESTAMP,
})
// The conductor's instruction, rendered by the SHIPPED command renderer. The
// first version hand-wrote the frame and had already drifted from the runtime by
// two characters (an extra blank line after `<command-instruction>`), which is
// the whole failure mode this file exists to catch — so the fixture now renders
// exactly what `/ulw-execute` renders.
const FABRICATED_ULW_COMMAND_INSTRUCTION = renderUlwExecuteInstructionFn({
  rawInput: ` ${ULW_EXECUTE_PLAN_NAME}`,
  agent: { id: FABRICATED_ULW_COMMAND_SESSION_ID },
  scope: 'builtin',
  name: ULW_EXECUTE_COMMAND_NAME,
  description: ULW_EXECUTE_DESCRIPTION,
}, () => ULW_EXECUTE_MARKER_TIMESTAMP)
/** The context the REAL renderer mints, with this fixture's own plan. */
const FABRICATED_ULW_CONTEXT = (() => {
  const body = buildAutoSelectedPlanContextInfoOnly({
    planPath: `/fabricated/${ULW_EXECUTE_PLAN_REL}`,
    planProgress: planProgressFromMarkdown(ULW_EXECUTE_PLAN_CONTENT),
    sessionId: FABRICATED_ULW_COMMAND_CHILD_TRIGGER,
    timestamp: ULW_EXECUTE_MARKER_TIMESTAMP,
    worktreeBlock: '',
  })
  return `${body}\n${E2E_ULW_CONTEXT_MARKER}\n`
})()

/** One child's durable log: descriptor, delegation task, optional injection. */
function fabricatedUlwCommandChild(id, label, persona, taskText, injected) {
  const events = [
    { seq: 1, type: 'subagent/descriptor', data: { label, persona, parentId: FABRICATED_ULW_COMMAND_SESSION_ID } },
    { seq: 2, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: taskText }], source: { kind: 'user' } } },
    { seq: 3, type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'MOCK-FABRICATED-ULW-CHILD-STEP' }] } },
  ]
  if (injected === true) {
    events.push({
      seq: 4,
      type: 'user/message',
      data: {
        role: 'user',
        content: [{ type: 'text', text: FABRICATED_ULW_CONTEXT }],
        source: { kind: 'plugin', plugin: E2E_ULW_PLUGIN, form: 'instructions' },
      },
    })
    events.push({ seq: 5, type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'MOCK-FABRICATED-ULW-CHILD-STEP-2' }] } })
  }
  events.push({ seq: 6, type: 'turn/end', data: { reason: { kind: 'completed' } } })
  return { header: { id, parentSession: FABRICATED_ULW_COMMAND_SESSION_ID, origin: 'subagent' }, events }
}

/** The fabricated GOOD session log: the command pair, the instruction, two children. */
function fabricatedUlwCommandLog() {
  const events = [
    {
      seq: 1,
      type: 'user/message',
      data: { role: 'user', content: [{ type: 'text', text: FABRICATED_ULW_COMMAND_INSTRUCTION }], source: { kind: 'user' } },
    },
    {
      seq: 2,
      type: 'command/run',
      data: { commandId: 'cmd-fab-ulw-1', name: ULW_EXECUTE_COMMAND_NAME, args: ` ${ULW_EXECUTE_PLAN_NAME}`, source: { kind: 'user' } },
    },
    {
      seq: 3,
      type: 'command/done',
      data: {
        commandId: 'cmd-fab-ulw-1',
        kind: 'success',
        text: `Ulw-execute instruction queued (${FABRICATED_ULW_COMMAND_INSTRUCTION.length} chars, session ${FABRICATED_ULW_COMMAND_SESSION_ID}); it takes effect in the next turn. The plan flags are ${ULW_EXECUTE_ARGUMENT_HINT}.`,
      },
    },
    { seq: 4, type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'MOCK-FABRICATED-ULW-CONDUCTOR-1' }] } },
    { seq: 5, type: 'turn/end', data: { reason: { kind: 'completed' } } },
    {
      seq: 6,
      type: 'user/message',
      data: { role: 'user', content: [{ type: 'text', text: ULW_EXECUTE_CONTROL_DELEGATION_TASK }], source: { kind: 'user' } },
    },
    { seq: 7, type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'MOCK-FABRICATED-ULW-CONDUCTOR-2' }] } },
    { seq: 8, type: 'turn/end', data: { reason: { kind: 'completed' } } },
    {
      seq: 9,
      type: 'command/run',
      data: { commandId: 'cmd-fab-ulw-2', name: ULW_EXECUTE_COMMAND_NAME, args: ` ${ULW_EXECUTE_PLAN_NAME}`, source: { kind: 'user' } },
    },
    {
      seq: 10,
      type: 'command/done',
      data: {
        commandId: 'cmd-fab-ulw-2',
        kind: 'success',
        text: `Ulw-execute instruction queued (${FABRICATED_ULW_COMMAND_INSTRUCTION.length} chars, session ${FABRICATED_ULW_COMMAND_SESSION_ID}); it takes effect in the next turn. The plan flags are ${ULW_EXECUTE_ARGUMENT_HINT}.`,
      },
    },
    { seq: 11, type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'MOCK-FABRICATED-ULW-CONDUCTOR-3' }] } },
    { seq: 12, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: FABRICATED_ULW_COMMAND_INSTRUCTION }], source: { kind: 'user' } } },
    { seq: 13, type: 'turn/end', data: { reason: { kind: 'completed' } } },
  ]
  return { header: { id: FABRICATED_ULW_COMMAND_SESSION_ID }, events }
}

function fabricatedUlwCommandInput(routes) {
  const triggerChild = fabricatedUlwCommandChild(
    FABRICATED_ULW_COMMAND_CHILD_TRIGGER,
    ULW_EXECUTE_TRIGGER_LABEL,
    'omo-atlas',
    FABRICATED_ULW_COMMAND_TRIGGER_TASK,
    true,
  )
  const controlChild = fabricatedUlwCommandChild(
    FABRICATED_ULW_COMMAND_CHILD_CONTROL,
    ULW_EXECUTE_CONTROL_LABEL,
    'omo-atlas',
    ULW_EXECUTE_CONTROL_DELEGATION_TASK,
    false,
  )
  const requests = [
    { role: 'sisyphus', body: { model: routes.sisyphus.model, messages: [{ content: FABRICATED_ULW_COMMAND_INSTRUCTION }] } },
    { role: 'sisyphus', body: { model: routes.sisyphus.model, messages: [{ content: ULW_EXECUTE_COMMAND_PROMPT_1 }] } },
    { role: 'atlas', body: { model: routes.atlas.model, messages: [{ content: FABRICATED_ULW_CONTEXT }] } },
    { role: 'atlas', body: { model: routes.atlas.model, messages: [{ content: ULW_EXECUTE_COMMAND_ATLAS_NOTE }] } },
    { role: 'sisyphus', body: { model: routes.sisyphus.model, messages: [{ content: ULW_EXECUTE_CONTROL_PROMPT }] } },
    { role: 'atlas', body: { model: routes.atlas.model, messages: [{ content: ULW_EXECUTE_CONTROL_ATLAS_NOTE }] } },
    { role: 'sisyphus', body: { model: routes.sisyphus.model, messages: [{ content: ULW_EXECUTE_COMMAND_PROMPT_2 }] } },
    { role: 'sisyphus', body: { model: routes.sisyphus.model, messages: [{ content: FABRICATED_ULW_COMMAND_INSTRUCTION }] } },
  ]
  return {
    log: fabricatedUlwCommandLog(),
    allLogs: [triggerChild, controlChild],
    requests,
    // The SHARED helpers, not hand-written stubs: `fabricatedProvidersJson` is the
    // same string every other scenario's fixture uses, and `FABRICATED_BOOT_LOG`
    // is the driver's own loaded-plugin marker set — a hand-typed one would miss
    // the `pluginLoaded` given this analyzer shares with all 30 other scenarios.
    providersJson: fabricatedProvidersJson(routes),
    bootLog: [FABRICATED_BOOT_LOG, '[omo-commands] command ulw-execute registered'].join('\n'),
    planPath: `/fabricated/${ULW_EXECUTE_PLAN_REL}`,
    notepadPresent: ['learnings.md', 'decisions.md', 'issues.md', 'problems.md'],
    notepadLearnings: `# Learnings\n\n${E2E_ULW_NOTEPAD_FOOTER}`,
    // The fixture is a post-hoc snapshot, so its settle verdict is "reached" by
    // construction — without it the timeout flag would be undefined, which the
    // `=== false` comparison correctly treats as "no timeout reported".
    settleReached: true,
    routes,
    defectCases: ulwExecuteCommandDefectCases(routes),
  }
}

/**
 * The fabricated defect cases. Each one must turn EXACTLY its own check red —
 * that is the only evidence that a named check is load-bearing rather than
 * decorative.
 */
function ulwExecuteCommandDefectCases(routes) {
  // The mutation helper: rewrite every event that matches `predicate`, across the
  // conductor log AND every child log (this scenario's analyzer reads both, so a
  // helper that only touched one would silently leave the other untouched).
  const mapEvent = (input, predicate, rewrite) => {
    input.log.events = input.log.events.map((event) => (predicate(event) ? rewrite(event) : event))
    for (const child of input.allLogs) {
      child.events = child.events.map((event) => (predicate(event) ? rewrite(event) : event))
    }
  }
  // `scope` says WHOSE copy of the text is a template regression: the conductor's
  // own instruction (a `/ulw-execute` render fault) or every copy at once (a
  // fault in the template source both surfaces share). Scoping matters because a
  // defect that rewrites the child task as well reddens the marker-path checks
  // too, and a defect list is only useful if each entry isolates one gate.
  const replaceText = (input, eventType, from, to, scope = 'conductor') => {
    const matches = (event) => event.type === eventType
      && String(messageContentText(event.data) ?? '').includes(from)
    const rewrite = (event) => ({
      ...event,
      data: { ...event.data, content: [{ type: 'text', text: String(messageContentText(event.data)).replace(from, to) }] },
    })
    if (scope === 'all') {
      mapEvent(input, matches, rewrite)
      return
    }
    input.log.events = input.log.events.map((event) => (matches(event) ? rewrite(event) : event))
  }
  return [
    // ── the boot registration line ──
    ['the boot log never announced the command', (input) => {
      input.bootLog = input.bootLog
        .split('\n')
        .filter((line) => !line.includes('[omo-commands] command ulw-execute registered'))
        .join('\n')
    }, 'ulwExecuteRegisteredInBootLog'],
    // ── the command event pair ──
    ['the second /ulw-execute never reached the registry', (input) => {
      mapEvent(input, (event) => event.type === 'command/run' && event.data?.commandId === 'cmd-fab-ulw-2', (event) => ({ ...event, data: { ...event.data, commandId: 'cmd-fab-ulw-other' } }))
    }, 'commandAdmittedTwice'],
    ['the second command settled as an error', (input) => {
      mapEvent(input, (event) => event.type === 'command/done' && event.data?.commandId === 'cmd-fab-ulw-2', (event) => ({ ...event, data: { ...event.data, kind: 'error' } }))
    }, 'commandAdmittedTwice'],
    ['the command run carried no plan argument', (input) => {
      mapEvent(input, (event) => event.type === 'command/run' && event.data?.commandId === 'cmd-fab-ulw-1', (event) => ({ ...event, data: { ...event.data, args: '' } }))
    }, 'commandRunsRecordedWithArgsAndUserSource'],
    ['the command run was not a user-sourced invocation', (input) => {
      mapEvent(input, (event) => event.type === 'command/run' && event.data?.commandId === 'cmd-fab-ulw-1', (event) => ({ ...event, data: { ...event.data, source: { kind: 'agent' } } }))
    }, 'commandRunsRecordedWithArgsAndUserSource'],
    ['the done text quoted another session', (input) => {
      mapEvent(input, (event) => event.type === 'command/done' && event.data?.commandId === 'cmd-fab-ulw-1', (event) => ({ ...event, data: { ...event.data, text: event.data.text.replace(FABRICATED_ULW_COMMAND_SESSION_ID, 'session-somebody-else') } }))
    }, 'commandDoneNamesThisSessionAndThePayload'],
    ['the done text lost the argument hint', (input) => {
      mapEvent(input, (event) => event.type === 'command/done' && event.data?.commandId === 'cmd-fab-ulw-1', (event) => ({ ...event, data: { ...event.data, text: event.data.text.replace(ULW_EXECUTE_ARGUMENT_HINT, '') } }))
    }, 'commandDoneNamesThisSessionAndThePayload'],
    // ── the template injection into the conductor ──
    ['the command never queued its instruction into the session', (input) => {
      mapEvent(input, (event) => event.type === 'user/message' && String(messageContentText(event.data) ?? '').includes('# /ulw-execute Command'), (event) => ({ ...event, data: { ...event.data, source: { kind: 'plugin', plugin: 'other', form: 'instructions' } } }))
    }, 'instructionCarriedIntoTheConductorSession'],
    ['the second command queued no instruction of its own', (input) => {
      // Located by ORDER (the carrier after the second command/run), never by a
      // hard-coded `seq`: the fixture's numbering is an artifact of its own
      // construction and would move the day anything above it changed.
      const secondRunIndex = input.log.events.findIndex(
        (event) => event.type === 'command/run' && event.data?.commandId === 'cmd-fab-ulw-2',
      )
      const carriersAfterIt = input.log.events
        .map((event, index) => ({ event, index }))
        .filter(({ event, index }) => index > secondRunIndex
          && event.type === 'user/message'
          && String(messageContentText(event.data) ?? '').startsWith('# /ulw-execute Command'))
      const target = carriersAfterIt[0]
      if (target === undefined) return
      // The carrier is RETYPED rather than deleted, so the defect is "this second
      // instruction never arrived as a user message" — a rename would have been a
      // different claim (the event could still be in the log in another shape).
      input.log.events[target.index] = { ...target.event, type: 'assistant/message' }
    }, 'instructionCarriedIntoTheConductorSession'],
    ['the instruction lost its command frame', (input) => {
      replaceText(input, 'user/message', '# /ulw-execute Command', '# something else')
    }, 'instructionFrameAndThreeLayersAreIntact'],
    ['the instruction lost its session-context layer', (input) => {
      replaceText(input, 'user/message', '<session-context>', '<session-contextual>')
    }, 'instructionFrameAndThreeLayersAreIntact'],
    ['the instruction lost its user-request layer', (input) => {
      replaceText(input, 'user/message', '</user-request>', '')
    }, 'instructionFrameAndThreeLayersAreIntact'],
    ['the template dropped the R-10 header marker', (input) => {
      replaceText(input, 'user/message', E2E_TEMPLATE_HEADER_MARKER, 'You may start an Atlas session.', 'all')
    }, 'instructionCarriesBothR10Markers'],
    ['the template dropped the R-10 session-context marker', (input) => {
      replaceText(input, 'user/message', E2E_SESSION_CONTEXT_OPEN, '<ctx>', 'all')
    }, 'instructionCarriesBothR10Markers'],
    ['the rendered session-context kept its placeholder', (input) => {
      replaceText(input, 'user/message', `Session ID: ${FABRICATED_ULW_COMMAND_SESSION_ID}`, 'Session ID: $SESSION_ID')
    }, 'sessionContextSubstitutedInTheInstruction'],
    ['the rendered timestamp was not ISO-shaped', (input) => {
      replaceText(input, 'user/message', `Timestamp: ${ULW_EXECUTE_MARKER_TIMESTAMP}`, 'Timestamp: yesterday')
    }, 'sessionContextSubstitutedInTheInstruction'],
    ['the instruction never reached the model', (input) => {
      input.requests = input.requests.map((request) => ({
        ...request,
        body: { ...request.body, messages: [{ content: ULW_EXECUTE_COMMAND_PROMPT_1 }] },
      }))
    }, 'instructionReachedTheConductorModelRequest'],
    // ── the MARKER path ──
    ['the conductor never delegated atlas with the marker', (input) => {
      const trigger = input.allLogs.find((child) => child.header.id === FABRICATED_ULW_COMMAND_CHILD_TRIGGER)
      trigger.events[1] = { ...trigger.events[1], data: { ...trigger.events[1].data, content: [{ type: 'text', text: ULW_EXECUTE_CONTROL_DELEGATION_TASK }] } }
    }, 'atlasDelegationTaskCarriesTheTemplateMarker'],
    ['the delegated child was not the atlas persona', (input) => {
      const trigger = input.allLogs.find((child) => child.header.id === FABRICATED_ULW_COMMAND_CHILD_TRIGGER)
      trigger.events[0] = { ...trigger.events[0], data: { ...trigger.events[0].data, persona: 'omo-explore' } }
    }, 'triggerChildIsTheAtlasRow'],
    ['the injected context never reached the atlas child', (input) => {
      const trigger = input.allLogs.find((child) => child.header.id === FABRICATED_ULW_COMMAND_CHILD_TRIGGER)
      trigger.events = trigger.events.filter((event) => event.data?.source?.kind !== 'plugin')
    }, 'injectedContextReachedTheAtlasChild'],
    ['the injected context named another plan', (input) => {
      mapEvent(input, (event) => event.seq === 4 && event.type === 'user/message' && String(messageContentText(event.data) ?? '').includes(E2E_ULW_CONTEXT_MARKER), (event) => ({ ...event, data: { ...event.data, content: [{ type: 'text', text: FABRICATED_ULW_CONTEXT.replace(`**Plan**: ${ULW_EXECUTE_PLAN_NAME}`, '**Plan**: beta') }] } }))
    }, 'injectedContextReachedTheAtlasChild'],
    ['the injection carried the wrong producer', (input) => {
      mapEvent(input, (event) => event.seq === 4 && event.type === 'user/message' && String(messageContentText(event.data) ?? '').includes(E2E_ULW_CONTEXT_MARKER), (event) => ({ ...event, data: { ...event.data, source: { kind: 'plugin', plugin: 'omo-commands', form: 'instructions' } } }))
    }, 'injectionSourceContract'],
    ['the injection never reached the atlas model request', (input) => {
      input.requests = input.requests.map((request) => (request.role === 'atlas'
        ? { ...request, body: { ...request.body, messages: [{ content: ULW_EXECUTE_COMMAND_ATLAS_NOTE }] } }
        : request))
    }, 'injectionReachedTheAtlasModelRequest'],
    ['the atlas lane made only one request', (input) => {
      input.requests = input.requests.filter((request) => request.role !== 'atlas')
    }, 'atlasLaneMadeMoreThanOneRequest'],
    ['the notepad scaffold never landed', (input) => {
      input.notepadPresent = ['learnings.md']
    }, 'notepadScaffoldLanded'],
    // ── 幂等 + the controls ──
    ['the trigger child received a second injection', (input) => {
      const trigger = input.allLogs.find((child) => child.header.id === FABRICATED_ULW_COMMAND_CHILD_TRIGGER)
      trigger.events.push({ seq: 7, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: FABRICATED_ULW_CONTEXT }], source: { kind: 'plugin', plugin: E2E_ULW_PLUGIN, form: 'instructions' } } })
    }, 'secondCommandInjectedNothingNew'],
    ['the marker-less control delegation was injected anyway', (input) => {
      const control = input.allLogs.find((child) => child.header.id === FABRICATED_ULW_COMMAND_CHILD_CONTROL)
      control.events.push({ seq: 7, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: FABRICATED_ULW_CONTEXT }], source: { kind: 'plugin', plugin: E2E_ULW_PLUGIN, form: 'instructions' } } })
    }, 'markerlessControlInjectedNothing'],
    ['the control child never existed', (input) => {
      input.allLogs = input.allLogs.filter((child) => child.header.id !== FABRICATED_ULW_COMMAND_CHILD_CONTROL)
    }, 'markerlessControlInjectedNothing'],
    ['the conductor session itself was injected', (input) => {
      input.log.events.push({
        seq: 14,
        type: 'user/message',
        data: { role: 'user', content: [{ type: 'text', text: FABRICATED_ULW_CONTEXT }], source: { kind: 'plugin', plugin: E2E_ULW_PLUGIN, form: 'instructions' } },
      })
    }, 'conductorNotInjected'],
    ['the scaffold kept the upstream /start-work footer', (input) => {
      // The scaffold landed, but with the upstream footer the activation is
      // supposed to replace — presence-only evidence would pass on this.
      input.notepadLearnings = `# Learnings\n\n${E2E_ULW_UPSTREAM_NOTEPAD_FOOTER}`
    }, 'notepadFooterRewrittenByTheActivation'],
    ['the conductor turn never completed', (input) => {
      input.log.events = input.log.events.filter((event) => event.type !== 'turn/end')
    }, 'turnCompleted'],
    // The driver tore the session down while the LAST turn was still running —
    // the exact shape measured before the turn accounting was fixed, and the one
    // `turnCompleted` (which only asks about SOME completed turn) cannot see.
    ['the last turn was cancelled instead of completing', (input) => {
      const last = input.log.events.filter((event) => event.type === 'turn/end').pop()
      input.log.events = input.log.events.filter((event) => event !== last)
      input.log.events.push({ ...last, data: { reason: { kind: 'canceled' } } })
    }, 'lastTurnEndedOnItsOwnTerms'],
    // ── the shared givens ──
    ['the sisyphus seat was not active', (input) => {
      const parsed = JSON.parse(input.providersJson)
      parsed.result.value.providers[0].active = false
      input.providersJson = JSON.stringify(parsed)
    }, 'sisyphusProviderActive'],
  ]
}

// ── P4-T9 stop-continuation fabricated inputs + defect cases (self-test) ───────
const FABRICATED_STOP_SESSION_ID = 'session-fabricated-stop-continuation'
const FABRICATED_STOP_GOAL_ID = 'goal-fabricated-stop-continuation'
const FABRICATED_STOP_CALL_ID = 'mock-llm-tool-stop-1'

/**
 * The fabricated stop-continuation log (the REAL runtime layout, compact seqs):
 * TWO pre-stop continuations (one per boundary, on two different lists), THREE
 * `/stop-continuation` calls, the post-stop boundary that must stay silent, the
 * goal face, and the aborted goal round the pause disarmed. The steer texts are
 * BUILT with the shipped `buildContinuationText` from the lists the fixture
 * writes — the same discipline as the P3-T9 pilot: "verbatim" means the
 * listener's own text for the list the boundary saw, not a copy pasted here.
 */
function fabricatedStopContinuationLog() {
  const todosAt = (open) => [
    { content: STOP_CONTINUATION_TASK_SETTLED, status: 'completed' },
    { content: open, status: 'in_progress' },
  ]
  const todosDone = (open) => [
    { content: STOP_CONTINUATION_TASK_SETTLED, status: 'completed' },
    { content: open, status: 'completed' },
  ]
  const events = []
  let seq = 0
  const push = (event) => {
    seq += 1
    events.push({ ...event, seq })
    return seq
  }
  // One model STEP = one assistant message + whatever that step did (tool call,
  // text). The runtime emits both halves for a tool-call step, and the request
  // index a steer rides is derived from the assistant messages — so a fixture
  // that omitted them would model a runtime that never happened.
  const step = (turn, stepNo, content) => {
    push({ type: 'step/start', data: { turn, step: stepNo } })
    push({ type: 'assistant/message', data: { turn, step: stepNo, message: { role: 'assistant', content } } })
  }
  const textStep = (turn, stepNo, text) => step(turn, stepNo, [{ type: 'text', text }])
  const toolStep = (turn, stepNo, name, args) => {
    step(turn, stepNo, [{ type: 'tool-call', id: FABRICATED_STOP_CALL_ID, name, arguments: JSON.stringify(args) }])
    push({ type: 'tool/call', data: { turn, step: stepNo, callId: FABRICATED_STOP_CALL_ID, name, arguments: JSON.stringify(args) } })
  }
  const prompt = (text) => fabricatedUserMessage(seq + 1, { role: 'user', content: [{ type: 'text', text }], source: { kind: 'user', rpcId: 'fabricated-rpc' } })
  const steerPair = (todos, turn) => {
    const text = buildTodoContinuationText(todos)
    const message = {
      id: `fabricated-steer-${turn}`,
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: TODO_CONTINUATION_ENFORCER_PLUGIN, form: 'instructions' },
    }
    push({ type: 'agent/inbox/spliced', data: { target: 'next-step', inserted: [message] } })
    push({ type: 'user/message', data: message })
    return text
  }
  const goalRound = (round) => push({
    type: 'user/message',
    data: {
      id: `fabricated-goal-round-${round}`,
      role: 'user',
      content: [{ type: 'text', text: `<goal_round>\nObjective: "${STOP_CONTINUATION_GOAL_OBJECTIVE}" round ${round}` }],
      source: { kind: GOAL_ROUND_SOURCE_KIND, goalId: FABRICATED_STOP_GOAL_ID, revision: 1, round },
    },
  })

  // ── prompt 1: the first continuation chain
  push(prompt(STOP_CONTINUATION_PROMPT_1))
  push({ type: 'turn/start', data: { turn: 1 } })
  toolStep(1, 1, 'todo_write', { todos: todosAt(STOP_CONTINUATION_TASK_OPEN_1) })
  push({ type: 'todo/write', data: { todos: todosAt(STOP_CONTINUATION_TASK_OPEN_1) } })
  textStep(1, 2, STOP_CONTINUATION_WRAPUP_1)
  steerPair(todosAt(STOP_CONTINUATION_TASK_OPEN_1), 1)
  toolStep(1, 3, 'todo_write', { todos: todosDone(STOP_CONTINUATION_TASK_OPEN_1) })
  push({ type: 'todo/write', data: { todos: todosDone(STOP_CONTINUATION_TASK_OPEN_1) } })
  textStep(1, 4, STOP_CONTINUATION_SUMMARY_1)
  push({ type: 'step/end', data: { turn: 1, step: 4 } })
  push({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })

  // ── prompt 2: the cascade face + the second continuation
  push(prompt(STOP_CONTINUATION_PROMPT_2))
  push({ type: 'turn/start', data: { turn: 2 } })
  toolStep(2, 1, 'bash', {
    command: STOP_CONTINUATION_BACKGROUND_COMMAND,
    description: STOP_CONTINUATION_BACKGROUND_LABEL,
    run_in_background: true,
  })
  toolStep(2, 2, 'todo_write', { todos: todosAt(STOP_CONTINUATION_TASK_OPEN_2) })
  push({ type: 'todo/write', data: { todos: todosAt(STOP_CONTINUATION_TASK_OPEN_2) } })
  textStep(2, 3, STOP_CONTINUATION_WRAPUP_2)
  steerPair(todosAt(STOP_CONTINUATION_TASK_OPEN_2), 2)
  toolStep(2, 4, 'todo_write', { todos: todosDone(STOP_CONTINUATION_TASK_OPEN_2) })
  push({ type: 'todo/write', data: { todos: todosDone(STOP_CONTINUATION_TASK_OPEN_2) } })
  textStep(2, 5, STOP_CONTINUATION_SUMMARY_2)
  push({ type: 'step/end', data: { turn: 2, step: 5 } })
  push({ type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } })

  // ── two stops: the first cancels the background job, the second is the
  // idempotence probe (it cancels nothing because the first already did).
  // Built by the SHIPPED command module's own formatter, not re-assembled here.
  // The ASSERTION side keeps its hand-transcribed needles (the T7 precedent:
  // expectations are written by hand, and the fixture is built by the code under
  // test — so if the two ever disagree, the self-test is what turns red).
  const doneText = (cancelled, goal) => formatStopContinuationResult({
    guardAvailable: true,
    sessionId: FABRICATED_STOP_SESSION_ID,
    cancelledJobIds: Array.from({ length: cancelled }, (_, index) => `job-fabricated-${index}`),
    alreadyFinishedJobIds: [],
    jobsServicePresent: true,
    goal,
  })
  push({ type: 'command/run', data: { commandId: 'cmd-fabricated-stop-1', name: 'stop-continuation', args: '', source: { kind: 'user' } } })
  push({ type: 'command/done', data: { commandId: 'cmd-fabricated-stop-1', kind: 'success', text: doneText(1, 'absent') } })
  push({ type: 'command/run', data: { commandId: 'cmd-fabricated-stop-2', name: 'stop-continuation', args: '', source: { kind: 'user' } } })
  push({ type: 'command/done', data: { commandId: 'cmd-fabricated-stop-2', kind: 'success', text: doneText(0, 'absent') } })

  // ── prompt 3: the post-stop boundary, which must stay silent
  push(prompt(STOP_CONTINUATION_PROMPT_3))
  push({ type: 'turn/start', data: { turn: 3 } })
  toolStep(3, 1, 'todo_write', { todos: todosAt(STOP_CONTINUATION_TASK_OPEN_3) })
  push({ type: 'todo/write', data: { todos: todosAt(STOP_CONTINUATION_TASK_OPEN_3) } })
  textStep(3, 2, STOP_CONTINUATION_WRAPUP_3)
  push({ type: 'step/end', data: { turn: 3, step: 2 } })
  push({ type: 'turn/end', data: { turn: 3, reason: { kind: 'completed' } } })

  // ── prompt 4: the goal face
  push(prompt(STOP_CONTINUATION_PROMPT_4))
  push({ type: 'turn/start', data: { turn: 4 } })
  toolStep(4, 1, 'create_goal', { objective: STOP_CONTINUATION_GOAL_OBJECTIVE })
  textStep(4, 2, STOP_CONTINUATION_GOAL_WRAPUP)
  push({ type: 'step/end', data: { turn: 4, step: 2 } })
  push({ type: 'turn/end', data: { turn: 4, reason: { kind: 'completed' } } })
  // A goal round is a whole turn of its own: the driver opens it, the session
  // runs one step, it closes.
  goalRound(1)
  push({ type: 'turn/start', data: { turn: 5 } })
  textStep(5, 1, STOP_CONTINUATION_GOAL_WRAPUP)
  push({ type: 'step/end', data: { turn: 5, step: 1 } })
  push({ type: 'turn/end', data: { turn: 5, reason: { kind: 'completed' } } })
  goalRound(2)
  push({ type: 'turn/start', data: { turn: 6 } })
  textStep(6, 1, STOP_CONTINUATION_GOAL_WRAPUP)
  push({ type: 'step/end', data: { turn: 6, step: 1 } })
  push({ type: 'turn/end', data: { turn: 6, reason: { kind: 'completed' } } })

  // ── the third stop: it pauses the goal and disarms the round driver, which
  // aborts whatever round was in flight.
  push({ type: 'command/run', data: { commandId: 'cmd-fabricated-stop-3', name: 'stop-continuation', args: '', source: { kind: 'user' } } })
  push({ type: 'command/done', data: { commandId: 'cmd-fabricated-stop-3', kind: 'success', text: doneText(0, 'paused') } })
  // An abort whose NESTED reason is `user`: the pause disarmed this round rather
  // than a prompt cancelling it. The analyzer reports that nested kind as data.
  push({ type: 'turn/end', data: { turn: 7, reason: { kind: 'aborted', reason: { kind: 'user' } } } })

  return {
    path: '/fabricated/stop-continuation/session.jsonl',
    header: { type: 'session', id: FABRICATED_STOP_SESSION_ID },
    events,
  }
}

function fabricatedStopContinuationBootLog() {
  const guard = (cancelled) => `${STOP_CONTINUATION_GUARD_LOG_PREFIX}${FABRICATED_STOP_SESSION_ID}`
    + ` (cancelled ${cancelled}, already finished 0, jobs service present)`
  return [
    FABRICATED_BOOT_LOG,
    '[omo-commands] command stop-continuation registered',
    guard(1),
    guard(0),
    guard(0),
  ].join('\n')
}

function fabricatedStopContinuationInput(routes) {
  const model = routes.sisyphus.model
  const message = (...texts) => [
    { role: 'system', content: 'MOCKROLE=sisyphus' },
    ...texts.map((text) => ({ role: 'user', content: text })),
  ]
  const steer1 = buildTodoContinuationText([
    { content: STOP_CONTINUATION_TASK_SETTLED, status: 'completed' },
    { content: STOP_CONTINUATION_TASK_OPEN_1, status: 'in_progress' },
  ])
  const steer2 = buildTodoContinuationText([
    { content: STOP_CONTINUATION_TASK_SETTLED, status: 'completed' },
    { content: STOP_CONTINUATION_TASK_OPEN_2, status: 'in_progress' },
  ])
  // The MEASURED request shape: 13 scripted steps + the 4 goal rounds the driver
  // opened (real run: 17). The two steers sit at indices 2 and 7 because each
  // prompt's steps are: prompt 1 → todo_write, wrap-up, STEERED step, summary;
  // prompt 2 → bash, todo_write, wrap-up, STEERED step, summary. The total is
  // deliberately NOT pinned by the analyzer (the goal rounds are timing), and the
  // fixture keeps the same choice — only the steer indices are contract.
  const request = (index, text) => ({
    role: 'sisyphus',
    body: { model, messages: message(text) },
    receivedAt: 10 * (index + 1),
  })
  return {
    log: fabricatedStopContinuationLog(),
    requests: [
      request(0, STOP_CONTINUATION_PROMPT_1),
      request(1, STOP_CONTINUATION_WRAPUP_1),
      request(2, steer1),
      request(3, STOP_CONTINUATION_SUMMARY_1),
      request(4, STOP_CONTINUATION_BACKGROUND_COMMAND),
      request(5, STOP_CONTINUATION_PROMPT_2),
      request(6, STOP_CONTINUATION_WRAPUP_2),
      request(7, steer2),
      request(8, STOP_CONTINUATION_SUMMARY_2),
      request(9, STOP_CONTINUATION_PROMPT_3),
      request(10, STOP_CONTINUATION_WRAPUP_3),
      request(11, STOP_CONTINUATION_PROMPT_4),
      request(12, STOP_CONTINUATION_GOAL_WRAPUP),
      request(13, '<goal_round> 1'),
      request(14, '<goal_round> 1'),
      request(15, '<goal_round> 2'),
      request(16, '<goal_round> 2'),
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: fabricatedStopContinuationBootLog(),
    commandResults: [
      { line: STOP_CONTINUATION_COMMAND_LINE, matched: true, admission: { result: { kind: 'success' } } },
      { line: STOP_CONTINUATION_COMMAND_LINE, matched: true, admission: { result: { kind: 'success' } } },
      { line: STOP_CONTINUATION_COMMAND_LINE, matched: true, admission: { result: { kind: 'success' } } },
    ],
  }
}

/**
 * P4-T9 defect cases — one per named check.
 *
 * COVERAGE POLICY (inherited from T7, and counted the same way): 30 checks, 38
 * defect cases, 28 distinct targets. `pluginLoaded` is the single declared
 * exception and owns none (every scenario in this driver shares it, so no single
 * scenario can be the one to break it); `secondStopIsIdempotent` is the second
 * one, for a substantive reason rather than convenience: it accepts BOTH job
 * clauses a correct runtime can produce (`cancelled 0` / `cancelled 1` on a
 * still-`stopping` job), so no single-input mutation can pin it — the defects
 * for the idempotence claim live on the guard side instead, where the evidence
 * is race-free. Several checks own two cases on purpose: a gate with two
 * independent ways to fail deserves a defect for each way.
 */
function stopContinuationDefectCases() {
  const mapEvent = (input, predicate, mutate) => {
    input.log.events = input.log.events.map((event) => (predicate(event) ? mutate(event) : event))
  }
  const dropAfter = (input, seq) => {
    input.log.events = input.log.events.filter((event) => event.seq <= seq)
  }
  return [
    ['the command never registered (no boot-log registration line)', (input) => {
      input.bootLog = input.bootLog
        .split('\n')
        .filter((line) => line !== '[omo-commands] command stop-continuation registered')
        .join('\n')
    }, 'stopContinuationRegisteredInBootLog'],
    ['the session log was never written', (input) => {
      input.log = undefined
    }, 'sessionLogFound'],
    ['the sisyphus seat was inactive', (input) => {
      // The provider id comes from the FIXTURE's own first entry, never from a
      // closure over `routes`: this factory is module-level, so `routes` is not
      // in scope (the T7 factory hit exactly this and blew up at run time).
      // Parsed, not regexed over: key order is not what this check is about.
      const parsed = JSON.parse(input.providersJson)
      parsed.result.value.providers[0].active = false
      input.providersJson = JSON.stringify(parsed)
    }, 'sisyphusProviderActive'],
    ['a model request left the sisyphus seat', (input) => {
      input.requests[0] = { ...input.requests[0], body: { ...input.requests[0].body, model: 'some-other-seat-model' } }
    }, 'routeHeaderMatchesSisyphus'],
    ['the enforcer never steered before the stop', (input) => {
      dropAfter(input, input.log.events.find((event) => event.type === 'todo/write' && event.data?.todos?.[1]?.status === 'in_progress').seq)
      input.log.events.push(
        { seq: 900, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      )
    }, 'preStopContinuationHappenedTwice'],
    ['only ONE of the two pre-stop boundaries steered', (input) => {
      // Drop the SECOND steer pair (the one whose text carries task #2).
      const second = input.log.events.filter(
        (event) => event.type === 'user/message'
          && messageContentText(event.data).includes(STOP_CONTINUATION_TASK_OPEN_2),
      )
      dropAfter(input, second[0].seq - 2)
    }, 'preStopContinuationHappenedTwice'],
    ['a steer carrier lost the omo-hooks producer triple', (input) => {
      mapEvent(input, (event) => event.type === 'user/message'
        && event.data?.source?.plugin === TODO_CONTINUATION_ENFORCER_PLUGIN,
      (event) => ({ ...event, data: { ...event.data, source: { ...event.data.source, form: 'notice' } } }))
    }, 'preStopContinuationCarrierSourceIsOmoHooks'],
    ['a steer carrier carried text the listener never assembled', (input) => {
      mapEvent(input, (event) => event.type === 'user/message'
        && event.data?.source?.plugin === TODO_CONTINUATION_ENFORCER_PLUGIN,
      (event) => ({ ...event, data: { ...event.data, content: [{ type: 'text', text: `${messageContentText(event.data)}\n- [pending] a task that was never in the list` }] } }))
    }, 'preStopContinuationTextIsVerbatimListenerText'],
    ['one boundary was steered TWICE (double-splice / duplicate claim)', (input) => {
      const claim = input.log.events.find((event) => event.type === 'user/message'
        && event.data?.source?.plugin === TODO_CONTINUATION_ENFORCER_PLUGIN)
      input.log.events.splice(input.log.events.indexOf(claim) + 1, 0, { ...claim, seq: claim.seq + 0.5 })
    }, 'preStopContinuationInjectedExactlyOncePerBoundary'],
    ['both boundaries replayed the SAME steer text', (input) => {
      const claims = input.log.events.filter((event) => event.type === 'user/message'
        && event.data?.source?.plugin === TODO_CONTINUATION_ENFORCER_PLUGIN)
      const first = messageContentText(claims[0].data)
      mapEvent(input, (event) => event.type === 'user/message'
        && event.data?.id === claims[1].data.id,
      (event) => ({ ...event, data: { ...event.data, content: [{ type: 'text', text: first }] } }))
    }, 'preStopContinuationInjectedExactlyOncePerBoundary'],
    ['a steer rode a LATER model request than the step after its wrap-up', (input) => {
      const steer = buildTodoContinuationText([
        { content: STOP_CONTINUATION_TASK_SETTLED, status: 'completed' },
        { content: STOP_CONTINUATION_TASK_OPEN_1, status: 'in_progress' },
      ])
      input.requests = input.requests.map((request, index) =>
        index === 0 ? { ...request, body: { ...request.body, messages: [...request.body.messages, { role: 'user', content: steer }] } } : request)
    }, 'preStopContinuationReachedNextModelRequest'],
    ['one of the three command calls was not admitted', (input) => {
      input.commandResults[1] = { line: STOP_CONTINUATION_COMMAND_LINE, matched: false, admission: undefined }
    }, 'stopCommandAdmittedThreeTimes'],
    ['a command/run disagreed with the line the user typed', (input) => {
      mapEvent(input, (event) => event.type === 'command/run',
        (event) => ({ ...event, data: { ...event.data, args: ' fabricated-args' } }))
    }, 'stopCommandRunsRecordedWithArgsAndUserSource'],
    ['two command/run events claimed the same commandId', (input) => {
      const runs = input.log.events.filter((event) => event.type === 'command/run')
      mapEvent(input, (event) => event.type === 'command/run',
        (event) => (event.seq === runs[2].seq ? { ...event, data: { ...event.data, commandId: runs[0].data.commandId } } : event))
    }, 'stopCommandRunsRecordedWithArgsAndUserSource'],
    ['a command/done settled as an error', (input) => {
      mapEvent(input, (event) => event.type === 'command/done',
        (event) => ({ ...event, data: { ...event.data, kind: 'error' } }))
    }, 'stopCommandDonesPairedAndSucceeded'],
    ['a command/done was paired with no command/run', (input) => {
      input.log.events = input.log.events.filter((event) => !(event.type === 'command/done' && event.data.commandId === 'cmd-fabricated-stop-2'))
    }, 'stopCommandDonesPairedAndSucceeded'],
    ['a done text named another session', (input) => {
      mapEvent(input, (event) => event.type === 'command/done',
        (event) => ({ ...event, data: { ...event.data, text: event.data.text.replace(FABRICATED_STOP_SESSION_ID, 'session-somebody-else') } }))
    }, 'stopCommandDoneNamesThisSession'],
    ['a done text dropped the "stopped until cleared" tail', (input) => {
      mapEvent(input, (event) => event.type === 'command/done',
        (event) => ({ ...event, data: { ...event.data, text: event.data.text.replace(`; ${STOP_CONTINUATION_DONE_TAIL}`, '') } }))
    }, 'stopCommandDoneNamesThisSession'],
    ['the second stop cleared the session (the marker did not stick)', (input) => {
      input.bootLog += `\n${STOP_CONTINUATION_GUARD_CLEARED_PREFIX}${FABRICATED_STOP_SESSION_ID}`
    }, 'stopIdempotenceLeavesExactlyOneStopPerCall'],
    ['the idempotence probe logged no second stop line', (input) => {
      // Three calls, two lines: the guard's own tally is what the claim rests on.
      input.bootLog = input.bootLog
        .split('\n')
        .filter((line) => !line.startsWith(STOP_CONTINUATION_GUARD_LOG_PREFIX))
        .concat(STOP_CONTINUATION_GUARD_LOG_PREFIX + FABRICATED_STOP_SESSION_ID)
        .join('\n')
    }, 'stopIdempotenceLeavesExactlyOneStopPerCall'],
    ['the guard logged its stop for another session only', (input) => {
      input.bootLog = input.bootLog.replaceAll(FABRICATED_STOP_SESSION_ID, 'session-somebody-else')
    }, 'stopGuardLoggedForThisSession'],
    ['the guard logged no jobs service', (input) => {
      input.bootLog = input.bootLog.replaceAll('jobs service present', 'jobs service absent — nothing cancelled')
    }, 'stopGuardLoggedForThisSession'],
    ['the background job never started', (input) => {
      input.log.events = input.log.events.filter((event) => !(event.type === 'tool/call' && event.data?.name === 'bash'))
    }, 'backgroundJobReallyStarted'],
    ['the first stop cancelled nothing', (input) => {
      mapEvent(input, (event) => event.type === 'command/done',
        (event) => (event.data.commandId === 'cmd-fabricated-stop-1'
          ? { ...event, data: { ...event.data, text: event.data.text.replace('cancelled 1', 'cancelled 0') } }
          : event))
    }, 'firstStopCancelledTheBackgroundJob'],
    ['the first stop claimed a goal that did not exist', (input) => {
      mapEvent(input, (event) => event.type === 'command/done',
        (event) => (event.data.commandId === 'cmd-fabricated-stop-1'
          ? { ...event, data: { ...event.data, text: event.data.text.replace(STOP_CONTINUATION_NO_GOAL_CLAUSE, STOP_CONTINUATION_GOAL_PAUSED_CLAUSE) } }
          : event))
    }, 'firstStopReportedNoGoalYet'],
    ['the post-stop boundary had nothing left to continue (all-complete)', (input) => {
      mapEvent(input, (event) => event.type === 'todo/write'
        && event.data?.todos?.some((todo) => todo.content === STOP_CONTINUATION_TASK_OPEN_3),
      (event) => ({ ...event, data: { ...event.data, todos: event.data.todos.map((todo) => ({ ...todo, status: 'completed' })) } }))
    }, 'postStopTodoBoundaryIsIncomplete'],
    ['the boundary had no todo list at all', (input) => {
      input.log.events = input.log.events.filter((event) => !(event.type === 'todo/write'
        && event.data?.todos?.some((todo) => todo.content === STOP_CONTINUATION_TASK_OPEN_3)))
    }, 'postStopTodoBoundaryIsIncomplete'],
    ['the goal existed AT the post-stop boundary (goal-owns-continuation could explain the silence)', (input) => {
      // Move the goal creation to BEFORE prompt 3's wrap-up: the silence would
      // then be the goal gate firing, and the scenario must go red rather than
      // pass on the wrong mechanism.
      const wrapup = input.log.events.find((event) => event.type === 'assistant/message'
        && eventText(event).includes(STOP_CONTINUATION_WRAPUP_3))
      const goal = input.log.events.find((event) => event.type === 'tool/call' && event.data?.name === 'create_goal')
      input.log.events = input.log.events.map((event) =>
        event === goal ? { ...event, seq: wrapup.seq - 0.5 } : event)
    }, 'noGoalAtPostStopBoundary'],
    ['a SECOND todo list was written before the post-stop wrap-up', (input) => {
      const wrapup = input.log.events.find((event) => event.type === 'assistant/message'
        && eventText(event).includes(STOP_CONTINUATION_WRAPUP_3))
      input.log.events.push({
        seq: wrapup.seq - 0.25,
        type: 'todo/write',
        data: { todos: [{ content: 'fabricated later list', status: 'in_progress' }] },
      })
    }, 'postStopTodoBoundaryIsIncomplete'],
    ['continuation was steered AFTER the stop (the guard did not hold)', (input) => {
      const boundary = input.log.events.find((event) => event.type === 'todo/write'
        && event.data?.todos?.some((todo) => todo.content === STOP_CONTINUATION_TASK_OPEN_3))
      const todos = boundary.data.todos
      const message = {
        id: 'fabricated-steer-after-stop',
        role: 'user',
        content: [{ type: 'text', text: buildTodoContinuationText(todos) }],
        source: { kind: 'plugin', plugin: TODO_CONTINUATION_ENFORCER_PLUGIN, form: 'instructions' },
      }
      const at = boundary.seq + 1
      input.log.events.push(
        { seq: at, type: 'agent/inbox/spliced', data: { target: 'next-step', inserted: [message] } },
        { seq: at + 1, type: 'user/message', data: message },
      )
    }, 'postStopNoContinuationCarrier'],
    ['the post-stop turn ran another step after its wrap-up', (input) => {
      const wrapup = input.log.events.find((event) => event.type === 'assistant/message'
        && eventText(event).includes(STOP_CONTINUATION_WRAPUP_3))
      input.log.events.push({
        seq: wrapup.seq + 0.5,
        type: 'todo/write',
        data: { todos: [{ content: 'fabricated extra work', status: 'in_progress' }] },
      })
    }, 'postStopTurnEndedWithoutExtraStep'],
    ['the post-stop turn ended with an error', (input) => {
      mapEvent(input, (event) => event.type === 'turn/end' && event.data?.turn === 3,
        (event) => ({ ...event, data: { ...event.data, reason: { kind: 'error' } } }))
    }, 'postStopTurnCompleted'],
    ['the goal was created AFTER the third stop', (input) => {
      const thirdDone = input.log.events.find((event) => event.type === 'command/done' && event.data.commandId === 'cmd-fabricated-stop-3')
      mapEvent(input, (event) => event.type === 'tool/call' && event.data?.name === 'create_goal',
        (event) => ({ ...event, seq: thirdDone.seq + 1 }))
    }, 'goalReallyCreatedBeforeTheThirdStop'],
    ['the third stop left the goal alone', (input) => {
      mapEvent(input, (event) => event.type === 'command/done',
        (event) => (event.data.commandId === 'cmd-fabricated-stop-3'
          ? { ...event, data: { ...event.data, text: event.data.text.replace(STOP_CONTINUATION_GOAL_PAUSED_CLAUSE, 'the session goal is not active, nothing to pause') } }
          : event))
    }, 'thirdStopPausedTheActiveGoal'],
    ['the goal round driver kept opening rounds after the pause', (input) => {
      const thirdDone = input.log.events.find((event) => event.type === 'command/done' && event.data.commandId === 'cmd-fabricated-stop-3')
      input.log.events.push({
        seq: thirdDone.seq + 1,
        type: 'user/message',
        data: {
          id: 'fabricated-goal-round-after-pause',
          role: 'user',
          content: [{ type: 'text', text: '<goal_round>\nObjective: still running' }],
          source: { kind: GOAL_ROUND_SOURCE_KIND, goalId: FABRICATED_STOP_GOAL_ID, revision: 1, round: 3 },
        },
      })
    }, 'noGoalRoundOpenedAfterThePause'],
    ['the goal driver never opened a round at all (the goal face was vacuous)', (input) => {
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'user/message' && event.data?.source?.kind === GOAL_ROUND_SOURCE_KIND),
      )
    }, 'noGoalRoundOpenedAfterThePause'],
    ['the circuit breaker armed during the scenario', (input) => {
      // Built by the shipped formatter, with the module's OWN cap — a fixture
      // that hand-typed "(cap 3)" would test a line the runtime never emits.
      input.bootLog += `\n${todoContinuationCircuitBreakerLine(5)}`
    }, 'circuitBreakerNeverArmed'],
    ['the scripted steps never all ran (requests truncated)', (input) => {
      input.requests = input.requests.slice(0, 9)
    }, 'mockSawThirteenScriptedStepsOnThisSeat'],
  ]
}

// ── P4-T7 command-channel fabricated inputs + defect cases (self-test) ───────
// The GOOD input mirrors the REAL runtime layout: the command's own follow-up
// turn (the injected instruction as its sole ordinary user message → one model
// step → turn/end completed), the lifecycle pair, then the 对照 turn (the unknown
// line submitted as a prompt, because admission missed).
//
// The injected instruction is BUILT here rather than pasted whole: the real body
// is 196 / 216 lines of template text, and a fabricated fixture that pasted it
// all would be a second copy of the thing under test. What the fixture carries
// is every NEEDLE the analyzer looks for (frame lines, body landmarks, the
// substituted session id and an ISO timestamp, the empty-or-filled
// `<user-request>`) in the real ORDER, and — critically — the `command/done`
// char count is computed FROM that text, so the self-consistency check is real
// here too.
const FABRICATED_COMMAND_SESSION_ID = 'session-fabricated-command-channel'
const FABRICATED_COMMAND_TIMESTAMP = '2026-10-01T09:15:00.000Z'
const FABRICATED_COMMAND_ID = 'cmd-fabricated-1'
// MAJOR-4: a SECOND id for the same fixture's second command execution. The host
// mints a FRESH commandId per execute (measured on this host: `cmd-7ae2db59-1` and
// `cmd-7ae2db59-2` for two `/hyperplan` lines), and the first fixture reused one id
// for both — which made the run↔done pairing unverifiable, since a single id
// "matches" both dones and the check could not fail.
const FABRICATED_COMMAND_ID_2 = 'cmd-fabricated-2'

function fabricatedCommandInstruction(spec, sessionId) {
  const argsLine = spec.args === '' ? null : `**User Arguments**: ${spec.args}`
  const frame = [
    `# /${spec.commandId} Command`,
    '',
    `**Description**: ${spec.description}`,
    ...(argsLine === null ? [] : ['', argsLine]),
    '',
    '**Scope**: builtin',
    '',
    '---',
    '',
    '## Command Instructions',
    '',
  ].join('\n')
  const sessionContext = spec.sessionContextExpected
    ? ['', '<session-context>', `Session ID: ${sessionId}`, `Timestamp: ${FABRICATED_COMMAND_TIMESTAMP}`, '</session-context>']
    : []
  const body = [
    '<command-instruction>',
    spec.bodyNeedles[1],
    '',
    '---',
    '',
    spec.bodyNeedles[2],
    '',
    '(…fabricated stand-in for the template body: it carries every NEEDLE the',
    ' analyzer checks, in the real order — the real body is 196 / 216 lines…)',
    ...spec.bodyNeedles.filter((needle) => needle.startsWith('#') || needle.startsWith('##')),
    '</command-instruction>',
    ...sessionContext,
    '',
    '<user-request>',
    spec.args,
    '</user-request>',
  ].join('\n')
  return `${frame}${body}`
}

function fabricatedCommandDoneText(spec, chars) {
  return spec.sessionContextExpected
    ? `Handoff instruction queued (${chars} chars, session ${FABRICATED_COMMAND_SESSION_ID}); it takes effect in the next turn.`
    : `Remove-AI-slops instruction queued (${chars} chars); it takes effect in the next turn.`
}

// Only the load markers plus THIS scenario's registration line. A hand-typed
// summary line ("manifest 6 entries (pending=4, ported=2)") was here first and is
// deliberately gone: the real roster grows with every ported command, so the copy
// would rot into a stale expectation that nobody notices — and nothing asserts it.
// The registration line is the one fact this analyzer reads from the boot log.
function fabricatedCommandBootLog(spec) {
  return [FABRICATED_BOOT_LOG, spec.bootRegistrationLine].join('\n')
}

function fabricatedCommandChannelLog(spec) {
  const instruction = fabricatedCommandInstruction(spec, FABRICATED_COMMAND_SESSION_ID)
  const chars = instruction.length
  const assistant = (seq, turn, step, text) => ({
    seq,
    type: 'assistant/message',
    data: { turn, step, message: { role: 'assistant', content: [{ type: 'text', text }] } },
  })
  return {
    path: `/fabricated/${spec.commandId}/session.jsonl`,
    header: { type: 'session', id: FABRICATED_COMMAND_SESSION_ID },
    events: [
      // The MEASURED order (real run: run seq 3 → done seq 7 → carrier seq 10):
      // the lifecycle pair is appended around the handler, and the follow-up the
      // handler queued is claimed only at the next-turn inbox boundary — AFTER
      // `command/done`. A fixture written the other way round would have taught
      // the analyzer an order the host never produces.
      { seq: 1, type: 'command/run', data: { commandId: FABRICATED_COMMAND_ID, name: spec.commandId, args: spec.args, source: { kind: 'user' } } },
      { seq: 2, type: 'command/done', data: { commandId: FABRICATED_COMMAND_ID, kind: 'success', text: fabricatedCommandDoneText(spec, chars) } },
      // turn 1 — the follow-up turn the injection opened BY ITSELF
      { seq: 3, type: 'turn/start', data: { turn: 1 } },
      fabricatedUserMessage(4, { id: 'fabricated-injected-1', role: 'user', content: [{ type: 'text', text: instruction }], source: { kind: 'user' } }),
      { seq: 5, type: 'step/start', data: { turn: 1, step: 1 } },
      assistant(6, 1, 1, spec.summaryText),
      { seq: 7, type: 'step/end', data: { turn: 1, step: 1 } },
      { seq: 8, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      // turn 2 — 对照: the unknown line, admitted nowhere, submitted as a prompt
      fabricatedUserMessage(9, { id: 'fabricated-control-1', role: 'user', content: [{ type: 'text', text: COMMAND_CHANNEL_UNKNOWN_LINE }], source: { kind: 'user', rpcId: 'fabricated-rpc' } }),
      { seq: 10, type: 'turn/start', data: { turn: 2 } },
      assistant(11, 2, 1, COMMAND_CHANNEL_CONTROL_REPLY),
      { seq: 12, type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedCommandChannelInput(spec, routes) {
  const model = routes.sisyphus.model
  const instruction = fabricatedCommandInstruction(spec, FABRICATED_COMMAND_SESSION_ID)
  const messages = (...texts) => [
    { role: 'system', content: 'MOCKROLE=sisyphus' },
    ...texts.map((text) => ({ role: 'user', content: text })),
  ]
  return {
    log: fabricatedCommandChannelLog(spec),
    requests: [
      { role: 'sisyphus', body: { model, messages: messages(instruction) }, receivedAt: 10 },
      { role: 'sisyphus', body: { model, messages: messages(COMMAND_CHANNEL_UNKNOWN_LINE) }, receivedAt: 20 },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: fabricatedCommandBootLog(spec),
    commandResults: [
      { line: spec.line, matched: true, admission: { commandId: FABRICATED_COMMAND_ID, result: { kind: 'success', text: 'queued' } } },
      { line: COMMAND_CHANNEL_UNKNOWN_LINE, matched: false, admission: undefined },
    ],
  }
}

// ── P4-T15 fabricated inputs (must earn their PASS) ───────────────────────────
//
// Both fixtures are built from the SHIPPED modules, not from a transcription.
// That is a deliberate departure from the P4-T7 command-channel fixture (which
// transcribes needles so the analyzer cannot follow a regression in the template):
// here the scenarios' whole claim is "the DEGRADED rewrite the model receives is
// the rewrite T14 shipped". A transcription would make the GOOD fabricated input
// pass while the real template said something else entirely — the self-test would
// attest to a template the deployment does not ship. Consequence, stated so the
// departure is not mistaken for sloppiness: a regression in T14's guidance text
// now FAILS the self-test loudly, which is the behaviour this fixture family wants.

function fabricatedHyperplanInstruction(args) {
  // The SAME two shipped functions the command's own handler uses, in the same
  // order: `renderCommandTemplate` substitutes the placeholders and produces the
  // instruction body, `formatCommandTemplate` wraps it in the 外框. `sessionId` is
  // `undefined` on purpose — hyperplan's template has no `$SESSION_ID` (T14), so
  // passing one here would have the fixture render a frame the deployment never
  // produces.
  return omoCommandsRender.formatCommandTemplate({
    name: 'hyperplan',
    description: omoCommandsHyperplanCommand.HYPERPLAN_DESCRIPTION,
    scope: 'builtin',
    arguments: args,
    template: omoCommandsHyperplan.HYPERPLAN_COMMAND_TEMPLATE,
    content: renderCommandTemplate(omoCommandsHyperplan.HYPERPLAN_COMMAND_TEMPLATE, {
      arguments: args,
      sessionId: undefined,
      now: () => FABRICATED_COMMAND_TIMESTAMP,
    }),
  })
}

function fabricatedHyperplanLog() {
  const first = fabricatedHyperplanInstruction(HYPERPLAN_MEASURED_ARGS)
  const second = fabricatedHyperplanInstruction('')
  const assistant = (seq, turn, step, text) => ({
    seq,
    type: 'assistant/message',
    data: { turn, step, message: { role: 'assistant', content: [{ type: 'text', text }] } },
  })
  return {
    path: '/fabricated/hyperplan/session.jsonl',
    header: { type: 'session', id: FABRICATED_COMMAND_SESSION_ID },
    events: [
      { seq: 1, type: 'command/run', data: { commandId: FABRICATED_COMMAND_ID, name: 'hyperplan', args: HYPERPLAN_MEASURED_ARGS, source: { kind: 'user' } } },
      { seq: 2, type: 'command/done', data: { commandId: FABRICATED_COMMAND_ID, kind: 'success', text: 'queued' } },
      fabricatedUserMessage(3, { id: 'fabricated-hyperplan-1', role: 'user', content: [{ type: 'text', text: first }], source: { kind: 'user' } }),
      { seq: 4, type: 'turn/start', data: { turn: 1 } },
      { seq: 5, type: 'step/start', data: { turn: 1, step: 1 } },
      assistant(6, 1, 1, HYPERPLAN_DEGRADED_SUMMARY),
      { seq: 7, type: 'step/end', data: { turn: 1, step: 1 } },
      { seq: 8, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      // (turn 1 is modelled as ONE step here; the real run opens a SECOND step,
      // which is why it issues three model requests — see `eachFrameReached…`.
      // The fixture does not need that second step: nothing this analyzer reads
      // depends on it, and adding one would have invented an event the checks
      // never mention.)
      // 对照: the bare line, admitted as its own command with NO args.
      { seq: 9, type: 'command/run', data: { commandId: FABRICATED_COMMAND_ID_2, name: 'hyperplan', args: '', source: { kind: 'user' } } },
      { seq: 10, type: 'command/done', data: { commandId: FABRICATED_COMMAND_ID_2, kind: 'success', text: 'queued' } },
      fabricatedUserMessage(11, { id: 'fabricated-hyperplan-2', role: 'user', content: [{ type: 'text', text: second }], source: { kind: 'user' } }),
      { seq: 12, type: 'turn/start', data: { turn: 2 } },
      // step/start was missing for turn 2 in the first fixture — the real host emits
      // it for every step, and a fixture that skips it teaches the analyzer a shape
      // the host never produces.
      { seq: 13, type: 'step/start', data: { turn: 2, step: 1 } },
      assistant(14, 2, 1, HYPERPLAN_BARE_SUMMARY),
      { seq: 15, type: 'step/end', data: { turn: 2, step: 1 } },
      { seq: 16, type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedHyperplanInput(routes) {
  const model = routes.sisyphus.model
  const messages = (...texts) => [
    { role: 'system', content: 'MOCKROLE=sisyphus' },
    ...texts.map((text) => ({ role: 'user', content: text })),
  ]
  const first = fabricatedHyperplanInstruction(HYPERPLAN_MEASURED_ARGS)
  const second = fabricatedHyperplanInstruction('')
  return {
    log: fabricatedHyperplanLog(),
    requests: [
      { role: 'sisyphus', body: { model, messages: messages(first) }, receivedAt: 10 },
      { role: 'sisyphus', body: { model, messages: messages(second) }, receivedAt: 20 },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: [FABRICATED_BOOT_LOG, HYPERPLAN_BOOT_REGISTRATION_LINE].join('\n'),
    commandResults: [
      { line: HYPERPLAN_COMMAND_LINE, matched: true, admission: { commandId: FABRICATED_COMMAND_ID, result: { kind: 'success', text: 'queued' } } },
      { line: HYPERPLAN_BARE_COMMAND_LINE, matched: true, admission: { commandId: FABRICATED_COMMAND_ID, result: { kind: 'success', text: 'queued' } } },
    ],
  }
}

/** Rewrite the FIRST hyperplan carrier's text, in place. */
function mutateHyperplanCarrierText(input, rewrite) {
  const carrier = input.log.events.find(
    (event) => event.type === 'user/message' && event.data?.id === 'fabricated-hyperplan-1',
  )
  carrier.data.content = [{ type: 'text', text: rewrite(messageContentText(carrier.data)) }]
}

function hyperplanDegradedDefectCases() {
  return [
    ['the command never registered (no boot-log registration line)', (input) => {
      input.bootLog = input.bootLog.split('\n').filter((line) => line !== HYPERPLAN_BOOT_REGISTRATION_LINE).join('\n')
    }, 'commandRegisteredInBootLog'],
    ['the line was NOT admitted as a command', (input) => {
      input.commandResults[0].matched = false
      input.commandResults[0].admission = undefined
    }, 'bothLinesAdmittedAsCommands'],
    ['the second line was admitted but carried the first line\'s args', (input) => {
      // The 对照's claim: the bare frame omits **User Arguments**. If the second
      // run lied about its args, the frame and the payload disagree.
      input.log.events = input.log.events.map((event) =>
        event.type === 'command/run' && event.data?.args === ''
          ? { ...event, data: { ...event.data, args: HYPERPLAN_MEASURED_ARGS } }
          : event)
    }, 'secondLineCarriedNoArgs'],
    ['the second line\'s command/done carried the FIRST line\'s commandId', (input) => {
      // MAJOR-4's own defect. With one shared id in the fixture, run↔done pairing was
      // unverifiable: a single id "matched" both dones, so a mispaired done could not
      // fail anything. The fixture now mints two ids, and this case re-points the
      // second done at the first run's id.
      input.log.events = input.log.events.map((event) =>
        event.type === 'command/done' && event.data?.commandId === FABRICATED_COMMAND_ID_2
          ? { ...event, data: { ...event.data, commandId: FABRICATED_COMMAND_ID } }
          : event)
    }, 'lifecyclePairPerLine'],
    ['only one of the two frames arrived', (input) => {
      // MAJOR-3's own defect case, and the only one that exercises the lazy body
      // extraction: called unconditionally, a MISSING carrier makes the guard throw,
      // the driver's catch collapses the verdict into an opaque crash string, and
      // every named check is lost instead of one failing.
      //
      // Renamed from "the first turn never received a frame": with the POSITIONAL
      // locator (②) a single remaining carrier becomes `carriers[0]`, so the verdict
      // cannot say WHICH frame was lost — only that one is missing. Claiming a
      // specific one would overstate what the check knows.
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'user/message' && event.data?.id === 'fabricated-hyperplan-1'))
    }, 'exactlyTwoFramesArrived'],
    ['the DEGRADED guidance was replaced by upstream\'s team-mode instruction', (input) => {
      // The T14 regression this scenario exists for: the body goes back to telling
      // the model to enable team-mode in a config file.
      mutateHyperplanCarrierText(input, (text) => text.replace(
        omoCommandsHyperplan.HYPERPLAN_DEGRADED_GUIDANCE,
        'If team-mode is unavailable, instruct the user to set team_mode.enabled: true in ~/.omo/omo.jsonc and restart opencode.',
      ))
    }, 'modelFacingBodyIsDeadLinkFree'],
    ['the DEGRADED guidance was dropped from the model-facing body', (input) => {
      mutateHyperplanCarrierText(input, (text) => text.replace(
        omoCommandsHyperplan.HYPERPLAN_DEGRADED_GUIDANCE, ''))
    }, 'degradedGuidanceReachedTheModel'],
    ['the roster contract was dropped', (input) => {
      mutateHyperplanCarrierText(input, (text) => text.replace(
        omoCommandsHyperplan.HYPERPLAN_ROSTER_CONTRACT, ''))
    }, 'rosterContractReachedTheModel'],
    ['a roster seat was renamed to something the deployment does not have', (input) => {
      mutateHyperplanCarrierText(input, (text) => text.replaceAll('plan-reviewer', 'skeptic'))
    }, 'rosterSeatsNamedInTheModelText'],
    ['the description line lost the degraded suffix', (input) => {
      mutateHyperplanCarrierText(input, (text) => text.replace(
        omoCommandsHyperplanCommand.HYPERPLAN_DESCRIPTION,
        omoCommandsHyperplanCommand.UPSTREAM_HYPERPLAN_DESCRIPTION,
      ))
    }, 'degradedSuffixOnTheFrameDescriptionLine'],
    ['the upstream 7-phase wording was silently "corrected" to 8', (input) => {
      // MAJOR-2's rule is attribution-first: the wording is kept verbatim and the
      // discrepancy is recorded. A silent correction is the regression.
      mutateHyperplanCarrierText(input, (text) => text.replace(
        'follow its 7-phase workflow EXACTLY', 'follow its 8-phase workflow EXACTLY'))
    }, 'sevenPhaseWordingPreserved'],
    ['OMO\'s own skill(name=…) syntax reached the model', (input) => {
      mutateHyperplanCarrierText(input, (text) => text.replace(
        omoCommandsHyperplan.DSH_SKILL_CALL_FORM, omoCommandsHyperplan.UPSTREAM_SKILL_CALL_FORM))
    }, 'skillLoadedByNameWithDshCallForm'],
    ['the user request was not rendered into the frame', (input) => {
      mutateHyperplanCarrierText(input, (text) => text.replace(
        `<user-request>\n${HYPERPLAN_MEASURED_ARGS}\n</user-request>`, '<user-request>\n$ARGUMENTS\n</user-request>'))
    }, 'userRequestRodeTheFrameVerbatim'],
    ['the bare turn grew a **User Arguments** line it must not have', (input) => {
      const carrier = input.log.events.find(
        (event) => event.type === 'user/message' && event.data?.id === 'fabricated-hyperplan-2')
      carrier.data.content = [{
        type: 'text',
        text: messageContentText(carrier.data).replace('**Scope**: builtin', '**User Arguments**: invented\n\n**Scope**: builtin'),
      }]
    }, 'bareFrameOmitsUserArgumentsLine'],
    ['the bare turn lost the degraded guidance too', (input) => {
      const carrier = input.log.events.find(
        (event) => event.type === 'user/message' && event.data?.id === 'fabricated-hyperplan-2')
      carrier.data.content = [{
        type: 'text',
        text: messageContentText(carrier.data).replace(omoCommandsHyperplan.HYPERPLAN_DEGRADED_GUIDANCE, ''),
      }]
    }, 'bareTurnAlsoCarriesTheDegradedGuidance'],
    ['the model did not say the run was DEGRADED', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'assistant/message' && event.data?.turn === 1
          ? { ...event, data: { ...event.data, message: { role: 'assistant', content: [{ type: 'text', text: 'Here is the plan you asked for.' }] } } }
          : event)
    }, 'modelDeclaredDegradedModeOutLoud'],
    ['a turn ended with an error', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'turn/end' && event.data?.turn === 1
          ? { ...event, data: { ...event.data, reason: { kind: 'error' } } }
          : event)
    }, 'bothTurnsCompleted'],
  ]
}

function fabricatedUlwPlanInstruction() {
  const entry = vendoredSkillEntries().get('ulw-plan')
  return [
    `<skill_content name="ulw-plan">`,
    '<skill_resources>',
    // The MEASURED branch (real run, 0.1.5-rc.1), not the `directory` one this
    // fixture transcribed first. `renderResourceHint` has three shapes (dsh-skill/
    // lib/index.js:71-76) and selects between them on `skill.resourceBase`; a skill
    // registered by dsh-tool-skill with no resourceBase falls to the plain
    // provider wording. Transcribing the wrong branch would have made the
    // `injectionCarriesTheFullSkillFrame` check pass on a frame the deployment
    // never emits — the check's own comment claims the resources hint is part of
    // what the model receives, so the hint has to be the real one.
    'Resources for this skill are managed by provider "runtime".',
    'Load referenced resources only as needed.',
    '</skill_resources>',
    '',
    '<skill_instructions>',
    entry?.document?.content ?? '',
    '</skill_instructions>',
    '</skill_content>',
  ].join('\n')
}

function fabricatedUlwPlanLog() {
  const injected = fabricatedUlwPlanInstruction()
  const assistant = (seq, turn, step, text) => ({
    seq,
    type: 'assistant/message',
    data: { turn, step, message: { role: 'assistant', content: [{ type: 'text', text }] } },
  })
  return {
    path: '/fabricated/ulw-plan/session.jsonl',
    header: { type: 'session', id: FABRICATED_COMMAND_SESSION_ID },
    events: [
      fabricatedUserMessage(1, { id: 'fabricated-gesture-1', role: 'user', content: [{ type: 'text', text: ULW_PLAN_GESTURE_LINE }], source: { kind: 'user', rpcId: 'fabricated-rpc' } }),
      { seq: 2, type: 'turn/start', data: { turn: 1 } },
      { seq: 3, type: 'step/start', data: { turn: 1, step: 1 } },
      // The injection: a user message whose source is the skill invocation, claimed
      // INSIDE the step (pre-step appends to the step's own messages) and therefore
      // also durable in the log. No `command/run` anywhere — that absence is the
      // scenario's central claim and the fixture must model it honestly.
      fabricatedUserMessage(4, { id: 'fabricated-injected-ulw-plan-1', role: 'user', content: [{ type: 'text', text: injected }], source: { kind: 'skill-invocation', name: 'ulw-plan', form: 'instructions' } }),
      assistant(5, 1, 1, ULW_PLAN_PROMETHEUS_REPLY),
      { seq: 6, type: 'step/end', data: { turn: 1, step: 1 } },
      { seq: 7, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      // 对照: the bare gesture, same shape.
      fabricatedUserMessage(8, { id: 'fabricated-gesture-2', role: 'user', content: [{ type: 'text', text: ULW_PLAN_BARE_GESTURE_LINE }], source: { kind: 'user', rpcId: 'fabricated-rpc' } }),
      { seq: 9, type: 'turn/start', data: { turn: 2 } },
      { seq: 10, type: 'step/start', data: { turn: 2, step: 1 } },
      fabricatedUserMessage(11, { id: 'fabricated-injected-ulw-plan-2', role: 'user', content: [{ type: 'text', text: injected }], source: { kind: 'skill-invocation', name: 'ulw-plan', form: 'instructions' } }),
      assistant(12, 2, 1, ULW_PLAN_BARE_PROMETHEUS_REPLY),
      { seq: 13, type: 'step/end', data: { turn: 2, step: 1 } },
      { seq: 14, type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } },
    ],
  }
}

function fabricatedUlwPlanInput(routes) {
  const model = routes.sisyphus.model
  const messages = (...texts) => [
    { role: 'system', content: 'MOCKROLE=sisyphus' },
    ...texts.map((text) => ({ role: 'user', content: text })),
  ]
  return {
    log: fabricatedUlwPlanLog(),
    requests: [
      { role: 'sisyphus', body: { model, messages: messages(ULW_PLAN_GESTURE_LINE, fabricatedUlwPlanInstruction()) }, receivedAt: 10 },
      { role: 'sisyphus', body: { model, messages: messages(ULW_PLAN_BARE_GESTURE_LINE, fabricatedUlwPlanInstruction()) }, receivedAt: 20 },
    ],
    providersJson: fabricatedProvidersJson(routes),
    bootLog: FABRICATED_BOOT_LOG,
    commandResults: [
      { line: ULW_PLAN_GESTURE_LINE, matched: false, admission: undefined },
      { line: ULW_PLAN_BARE_GESTURE_LINE, matched: false, admission: undefined },
    ],
  }
}

/** Append or strip the lifecycle pair, the way a same-name command would. */
function addCommandLifecycle(input) {
  input.log.events = [
    // Integer seqs, and PREPENDED at 0 and 1 with the rest of the log renumbered
    // above them. The fractional `0.5` was a lazy way to slot a pair ahead of
    // events that already start at 1; the host's seqs are integers, and a fixture
    // that emits anything else teaches the analyzer an ordering rule the host never
    // applies.
    { seq: 0, type: 'command/run', data: { commandId: 'cmd-fabricated-ulw', name: 'ulw-plan', args: ULW_PLAN_REQUEST, source: { kind: 'user' } } },
    { seq: 1, type: 'command/done', data: { commandId: 'cmd-fabricated-ulw', kind: 'success', text: 'queued' } },
    ...input.log.events.map((event, index) => ({ ...event, seq: index + 2 })),
  ]
}

function ulwPlanGestureDefectCases() {
  return [
    ['the gesture was ADMITTED as a command (the shadowing regression)', (input) => {
      input.commandResults[0].matched = true
      input.commandResults[0].admission = { commandId: 'cmd-fabricated-ulw', result: { kind: 'success', text: 'queued' } }
    }, 'ulwPlanWasNotAdmittedAsACommand'],
    ['the log carries a command/run + command/done pair for the gesture', (input) => {
      addCommandLifecycle(input)
    }, 'noCommandLifecycleEventsAtAll'],
    ['the gesture never fell back to the prompt path', (input) => {
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'user/message' && event.data?.id === 'fabricated-gesture-1'))
    }, 'bothGestureLinesFellBackToPrompts'],
    ['the skill body was never injected', (input) => {
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'user/message' && event.data?.id === 'fabricated-injected-ulw-plan-1'))
    }, 'skillContentInjectedForBothLines'],
    ['the injection was labelled as an ordinary user message', (input) => {
      // The source contract is what distinguishes "the bridge ran" from "something
      // echoed the skill into the transcript" — a plain user message proves nothing.
      const injected = input.log.events.find(
        (event) => event.type === 'user/message' && event.data?.id === 'fabricated-injected-ulw-plan-1')
      injected.data.source = { kind: 'user' }
    }, 'injectionSourceIsSkillInvocation'],
    ['the injection lost its message id', (input) => {
      const injected = input.log.events.find(
        (event) => event.type === 'user/message' && event.data?.id === 'fabricated-injected-ulw-plan-1')
      injected.data.id = undefined
    }, 'injectionCarriedAsAnIdentifiedUserMessage'],
    ['the injection carried the body but not the shipped frame', (input) => {
      const injected = input.log.events.find(
        (event) => event.type === 'user/message' && event.data?.id === 'fabricated-injected-ulw-plan-1')
      injected.data.content = [{ type: 'text', text: ulwPlanBodyText() }]
    }, 'injectionCarriesTheFullSkillFrame'],
    ['the injected body was some other skill\'s', (input) => {
      const injected = input.log.events.find(
        (event) => event.type === 'user/message' && event.data?.id === 'fabricated-injected-ulw-plan-1')
      injected.data.content = [{
        type: 'text',
        text: injected.data.content[0].text.replace('You are **Prometheus**, a planning consultant', 'You are a general purpose assistant.'),
      }]
    }, 'injectedBodyIsTheUlwPlanBody'],
    ['the bridge swallowed the user\'s own request', (input) => {
      input.requests[0].body.messages = input.requests[0].body.messages.filter(
        (message) => message.content !== ULW_PLAN_GESTURE_LINE)
    }, 'userRequestRodeTheFirstStep'],
    ['the injection and the request did not coexist in one step', (input) => {
      input.requests[0].body.messages = input.requests[0].body.messages.filter(
        (message) => !String(message.content).includes('<skill_content name="ulw-plan">'))
    }, 'userRequestAndInjectionCoexistInOneStep'],
    ['the model ignored the interview persona and answered with a plan', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'assistant/message' && event.data?.turn === 1
          ? { ...event, data: { ...event.data, message: { role: 'assistant', content: [{ type: 'text', text: 'Step 1: add the module. Step 2: wire it up.' }] } } }
          : event)
    }, 'modelAnsweredAsPrometheusWithInterviewQuestions'],
    ['the bare gesture did not inject the body', (input) => {
      input.log.events = input.log.events.filter(
        (event) => !(event.type === 'user/message' && event.data?.id === 'fabricated-injected-ulw-plan-2'))
    }, 'bareGestureAlsoInjectedTheBody'],
    ['the bare turn answered without the interview voice', (input) => {
      // MAJOR-1's own defect. The previous check was `includes('Prometheus') ||
      // length > 0` — the first term could never match the all-caps mock marker and
      // the second accepted ANY non-empty reply, so a plain "done" answer stayed
      // green. This case proves the tightened check bites.
      input.log.events = input.log.events.map((event) =>
        event.type === 'assistant/message' && messageContentText(event.data?.message ?? event.data).includes('MOCK-ULW-PLAN-BARE-PROMETHEUS-')
          ? { ...event, data: { ...event.data, message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } } }
          : event)
    }, 'bareGestureAnsweredAsPrometheusToo'],
    ['a turn ended with an error', (input) => {
      input.log.events = input.log.events.map((event) =>
        event.type === 'turn/end' && event.data?.turn === 1
          ? { ...event, data: { ...event.data, reason: { kind: 'error' } } }
          : event)
    }, 'bothTurnsCompleted'],
  ]
}

/** ulw-plan's body on its own, without the shipped frame — the "body but not frame" defect. */
function ulwPlanBodyText() {
  return vendoredSkillEntries().get('ulw-plan')?.document?.content ?? ''
}

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
    // ⚠️ Anti-vacuity for the generated banner itself. Every keyword case pushes
    // its label as it runs, so an EMPTY accumulator means no case ran — the
    // loops were skipped, renamed, or the push was lost in an edit. Without this
    // the banner would render as nothing and the self-test would print a
    // perfectly clean, completely unearned attestation. A banner that cannot
    // prove it ran something is exactly the defect the hand-typed list had.
    if (KEYWORD_SELF_TEST_ATTESTATION.length === 0) {
      problems.push('the self-test banner is EMPTY: no P4-T13 keyword case pushed a label, so the attestation below would claim nothing')
    }
    if (problems.length > 0) {
      console.error(`SELF-TEST FAIL: ${problems.join('; ')}`)
      process.exit(1)
    }
    // Built from the labels the cases actually pushed (see the accumulator's
    // doc comment): scenario-major, order-preserving, one clause per scenario.
    // This replaces a hand-typed list that had already drifted out of date.
    const KEYWORD_SELF_TEST_BANNER = [...KEYWORD_SELF_TEST_ATTESTATION
      .reduce((byScenario, [scenario, label]) => {
        // The labels are plain text; a `'` needs no escaping inside the template
        // literal this is rendered into, and stripping it would mangle the two
        // labels that legitimately contain an apostrophe.
        byScenario.set(scenario, [...(byScenario.get(scenario) ?? []), label])
        return byScenario
      }, new Map())]
      .map(([scenario, labels]) => `P4-T13 ${scenario}: ${labels.join(', ')}`)
      .join('; ')
    // P4-T7's own banner, built from the SAME defect-case list that ran — so the
    // summary can never name fewer defects than were actually asserted.
    // Labels are the same for both specs (see the factory header), so the banner
    // reads them off ONE call rather than concatenating two copies. The non-empty
    // guard is the T13 shape: an emptied list must FAIL the self-test, never
    // print an empty "everything checked" banner.
    const STOP_SELF_TEST_BANNER = [...STOP_SELF_TEST_ATTESTATION
      .reduce((byScenario, [scenario, label]) => {
        byScenario.set(scenario, [...(byScenario.get(scenario) ?? []), label])
        return byScenario
      }, new Map())]
      .map(([scenario, labels]) => `P4-T9 ${scenario}: ${labels.join(', ')}`)
      .join('; ')
    if (ULW_COMMAND_SELF_TEST_ATTESTATION.length === 0) {
      problems.push('P4-T11: the ulw-execute-command self-test banner is EMPTY — it would attest to nothing')
    }
    const ULW_COMMAND_SELF_TEST_BANNER = [...ULW_COMMAND_SELF_TEST_ATTESTATION
      .reduce((byScenario, [scenario, label]) => {
        byScenario.set(scenario, [...(byScenario.get(scenario) ?? []), label])
        return byScenario
      }, new Map())]
      .map(([scenario, labels]) => `P4-T11 ${scenario}: ${labels.join(', ')}`)
      .join('; ')
    const commandChannelCases = commandChannelDefectCases(COMMAND_CHANNEL_SPECS.handoff)
    if (commandChannelCases.length === 0) {
      problems.push('fabricated handoff-driven: the command-channel defect list is EMPTY — the banner would attest to nothing')
    }
    const COMMAND_CHANNEL_SELF_TEST_BANNER = commandChannelCases
      .map(([label]) => label)
      .join(', ')
    if (HYPERPLAN_SELF_TEST_ATTESTATION.length === 0) {
      problems.push('P4-T15: the hyperplan-degraded-noted self-test banner is EMPTY — it would attest to nothing')
    }
    const HYPERPLAN_SELF_TEST_BANNER = [...HYPERPLAN_SELF_TEST_ATTESTATION
      .reduce((byScenario, [scenario, label]) => {
        byScenario.set(scenario, [...(byScenario.get(scenario) ?? []), label])
        return byScenario
      }, new Map())]
      .map(([scenario, labels]) => `P4-T15 ${scenario}: ${labels.join(', ')}`)
      .join('; ')
    if (ULW_PLAN_SELF_TEST_ATTESTATION.length === 0) {
      problems.push('P4-T15: the ulw-plan-loads-prometheus-skill self-test banner is EMPTY — it would attest to nothing')
    }
    const ULW_PLAN_SELF_TEST_BANNER = [...ULW_PLAN_SELF_TEST_ATTESTATION
      .reduce((byScenario, [scenario, label]) => {
        byScenario.set(scenario, [...(byScenario.get(scenario) ?? []), label])
        return byScenario
      }, new Map())]
      .map(([scenario, labels]) => `P4-T15 ${scenario}: ${labels.join(', ')}`)
      .join('; ')
    console.log(`SELF-TEST OK: hello + demo + write-denied + nested-delegation + roster-parade + plan-reviewer-write-denied + atlas-nested-delegation + bash-read-guard-warned + todo-continuation-enforced + session-notification-log + background-notification-log + edit-error-recovery-reminder + json-error-recovery-reminder + tool-output-truncated + empty-task-response-corrected + directory-readme-injected + agent-usage-reminder-appended + task-resume-info-appended + webfetch-private-target-unprobed + prometheus-md-only-denied + ulw-execute-activated + ulw-execute-no-intent + skills-catalog-visible + ultrawork-keyword-injected + keyword-negative-controls + hyperplan-keyword-injected + combo-keyword-injected + handoff-summary-driven + remove-ai-slops-driven + stop-continuation-halts-todo + ulw-execute-command-activates-atlas + hyperplan-degraded-noted + ulw-plan-loads-prometheus-skill fabricated good logs PASS; every fabricated defect (hello: missing turn/end, wrong route, mock-never-called, no session log; demo: explore-step-removed, no tool_call, no result return, no summary, out-of-order, wrong child route; AC-5: routes swapped, routes collapsed-to-equal; AC-6a: write-not-rejected, write-advertised, target-on-disk, no parent return; AC-6b: depth-not-rejected, grandchild-exists, delegation-tool-hidden, no parent return; P2-T18 parade: marker-landed-in-wrong-row, child-never-ran, child-wrong-route, batch-split-across-messages, note-never-returned, provider-inactive; P2-T19 plan-reviewer: write-not-rejected, write-advertised, delegation-tool-advertised, target-on-disk, child-wrong-seat, no parent return; P2-T19 atlas: depth-rejected-no-grandchild, grandchild-wrong-route, atlas-wrong-seat, atlas-lost-delegation-tools, read-only-grandchild-advertised-delegation-tools, findings-never-reached-atlas, report-never-returned, out-of-order; P3-T6 bash-read-guard: no-advisory-injection, advisory-injected-twice, trigger-result-isError; P3-T9 todo-continuation: no-steer, non-verbatim-steer-text, steer-without-todo-advance-order-break, control-turn-steered, control-turn-never-ran, control-list-empty, double-steer-claim-drift (double splice, claim untouched), double-steer-id-mismatch (claim id not the splice id); P3-T12 session-notification: no-anchor, anchor-emitted-twice, no-tool-result-bytes, proof-file-absent, no-completed-turn-end, anchor-line-drifted, session-is-a-delegated-child, unexpected-step-count; P3-T12 background-notification: no-anchor (the P3-T13 defect), anchor-emitted-twice, non-terminal-anchor-status, wrong-anchor-label, anchor-line-drifted, delegation-not-background, child-session-never-ran, no-native-settlement-notice, session-listener-double-announced, second-non-failure-anchor-line (the false-positive count), stray-unparsed-anchor-prefix-line (the same count, invisible to the anchor count), dispatch-failure-swallowed-twice; and the GOOD input plus the CI shape (one swallowed notify-send ENOENT) both PASS; P3-T14 edit-recovery: no-reminder-on-the-failed-edit, reminder-on-the-successful-sibling; P3-T14 json-recovery: no-reminder-on-the-non-blacklisted-tool, reminder-on-the-blacklisted-tool; P3-T14 truncator: oversized-result-untruncated, control-result-truncated; P3-T14 empty-task: uncorrected-empty-result, corrective-text-on-the-non-empty-result; P3-T15 directory-readme: no-readme-on-the-trigger, readme-on-the-readme-less-control, readme-on-the-deduplicated-read; P3-T15 agent-usage: no-reminder-on-the-first-target, reminder-on-the-non-target-control, fourth-reminder-past-the-cap, reminder-on-the-delegation-target-child; P3-T15 task-resume: no-tip-on-the-continuable-result, tip-with-a-wrong-child-id, tip-on-the-foreground-control, conductor-ran-only-the-batch; P3-T16 webfetch-guard: guard-probed-the-private-fixture, trigger-never-reached-the-native-policy, guard-marker-on-the-trigger, control-never-reached-the-native-policy, guard-marker-on-the-control, guard-spoke-elsewhere, conductor-ran-only-the-batch; P3-T16 prometheus-md-only: allowed-non-md-write, refused-file-landed-on-disk, no-workflow-reminder-on-the-plan-write, reminder-on-the-non-plans-write, conductor-write-gated-too, child-descriptor-without-the-prometheus-persona, plan-bytes-never-landed, gate-spoke-twice; P3-T17 ulw-execute: no-injection-reached-the-atlas-child, atlas-persona-not-observable, injection-source-contract-broken, injection-never-reached-the-model, atlas-control-injected, sibling-injected, notepad-not-scaffolded, notepad-footer-not-rewritten, conductor-injected, batch-never-dispatched; P4-T5 skills-catalog-visible: catalog-dropped-one-vendored-skill, catalog-exposed-a-shared-prefix, catalog-exposed-start-work, malformed-catalog-in-a-later-request, skills-marker-never-landed, skill-tool-errored-instead-of-body, skill-tool-returned-a-placeholder-body, unvendored-name-not-refused, turn-never-ended; ${KEYWORD_SELF_TEST_BANNER}; P4-T7 command channel (run against BOTH the argument-bearing and the no-argument spec): ${COMMAND_CHANNEL_SELF_TEST_BANNER}; ${STOP_SELF_TEST_BANNER}; ${ULW_COMMAND_SELF_TEST_BANNER}; ${HYPERPLAN_SELF_TEST_BANNER}; ${ULW_PLAN_SELF_TEST_BANNER}) FAILs on its own named check; plus the hermetic MOCKROLE landing check (real template + real renderers, 11/11 markers under their own rows, idempotent, unknown role throws)`)
  } else {
    main().catch((error) => {
      console.log(JSON.stringify({ result: 'FAIL', reason: `driver crash: ${error.message}`, scenarios: [] }))
      process.exit(1)
    })
  }
}
