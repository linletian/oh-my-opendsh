# dsh 0.2.0-rc.2 Review — v0.2.x adaptation analysis

> **Nature**: a static review with an evidence trail, not an action commitment and not a runtime verification. It does not bump the DSH pin (D7), does not edit the preset or the plugins, and does not touch the `tested` rows of `.omo/compat.yaml`. Its only registry act is the `untested` row for 0.2.0-rc.2 this review is filed alongside — the project's standing mechanism for "upstream published a new version" (`docs/release-process.md`).
>
> - Review date: 2026-10-02
> - Review target: the deepseek-harness mirror at `/home/linletian/GithubRepo/deepseek-harness/` (read-only), tag `dsh-v0.2.0-rc.2`, HEAD commit `639ed01539`; the **installed** `@deepseek-ai/dsh@0.2.0-rc.2` (`dsh --version` on this machine)
> - Comparison baseline: dsh `0.1.5-rc.1` — the version this project's CI pins (decision D7) and the runtime every `tested` matrix row was verified on
> - **Roadmap companion**: Phase 4.5 in [`roadmap.md`](./roadmap.md) §4 — the adaptation phase this review scopes (inserted ahead of Team Mode; nothing in this review lands code)
> - Method: (1) **census every upstream surface this project touches** — the cordis `ctx.*` call census over the three plugin sources, the 15 subscribed event names, the CLI/RPC/session-log surfaces the scripts depend on; (2) `git diff dsh-v0.1.5-rc.1..dsh-v0.2.0-rc.2` per package — 4102 commits, 9272 files; (3) three parallel review tracks (cordis Context API / event hooks + injection / CLI + web transport + session persistence); (4) **no runtime gates were run** — nothing boots the overlay on 0.2.0 yet, so every verdict here is source-verified, not boot-verified. That is the honest difference from the 0.1.5-rc.1 review, which ran the gates
> - **Time anchor**: repo-relative citations (`patches/…`, `scripts/…`) describe the tree at the review date; upstream citations are tag-scoped (`… @ dsh-v0.2.0-rc.2`) and meant to survive the adaptation

---

> **中文版**: [`dsh-0.2.0-rc.2-review_zh-CN.md`](./dsh-0.2.0-rc.2-review_zh-CN.md)

## 1. Verdict

**Three P0 surfaces break on 0.2.0-rc.2 — all three fail silently — plus one P1 surface that breaks the test infrastructure.** The cordis core the plugins are written against (`ctx.on` / `inject` / `effect` / `provide` / `plugin`) is byte-stable: vendored cordis shows **zero diff** between the tags. All 15 subscribed events still exist. Every one of the 20 upstream packages the concerto composition names still exists. The damage is concentrated in three rewrites upstream shipped between 0.1.6-alpha.2 and 0.2.0-rc.2, each landing exactly on a load-bearing layer of this project.

| Severity | Finding | Blocks |
|---|---|---|
| **P0 — silent break** | Agent preset re-architecture: `dsh-agent-presets` (file discovery over `$DSH_HOME/.agent-presets/`) **deleted**, replaced by declarative `dsh-agent-preset-registry` + `dsh-agent-preset`; roster `trust` field gone | Concerto mode never registers — the preset files `syncConcertoPreset` materializes are read by nobody (§2) |
| **P0 — silent break** | `ctx.jobs` rewrite: `caller: Agent → SessionId`, `JobSnapshot.ownerSession → JobView.owner`, `onJobDone` **removed** in favor of `jobs.events.subscribe`, `JobSpec` reshaped | Three touch points (§3): `background-notification.ts`, `stop-continuation-guard.ts`, `ulw-execute/live-state.ts` — each degrades without an error |
| **P0 — silent break** | (folded into the two above — every P0 here fails *quietly*) | Nothing upstream throws; the first visible symptom is an absent roster entry / an uncancelled job / a missing notification |
| **P1 — gate break** | Session log format v3 → **v4** (`SESSION_FORMAT_VERSION`), `tool/result` message restructured (`role:'user'` + `tool-result` block → `role:'tool'` + top-level `toolCallId`/`isError`) | The e2e driver's fabricated v3 fixtures (10+ sites) and every v3-vocabulary log assertion (§4) |
| **P2 — parity** | `MessageSourceMap` drops the catch-all `plugin` kind; `agent/session-start` removed (unused here); `PreToolDecision` gains `cancel`; `tool-subagent` `maxDepth` loses `.default(3)` (all rows explicit here) | Nothing today; the `kind:'plugin'` idiom is deprecated upstream (§5) |
| **P2 — note** | zstd session-log compression is **not new** (default since 0.1.5-rc.1; this project's sandbox profiles already force `compression: none`) | Nothing; recorded to foreclose a phantom work item (§4.3) |

The shape of the risk is the same lesson as the 0.1.5-rc.1 persona break, squared: **none of the P0s throws**. A file-discovery deletion, a caller-type change behind a structural comparison, and a removed listener registration all present as "the feature is simply not there" — exactly the failure class this project's gates exist to catch, and exactly why the adaptation (Phase 4.5) must re-run the full L1+L2 chain rather than trust a boot.

## 2. P0-1 — the Agent preset re-architecture

### 2.1 The change

| | 0.1.5-rc.1 | 0.2.0-rc.2 |
|---|---|---|
| Implementation | `packages/preset/agent-presets` (`dsh-agent-presets`) | **deleted**; replaced by `dsh-agent-preset-registry` + `dsh-agent-preset` (`packages/preset/agent-preset-registry`, `…/agent-preset`) |
| Registration | `discovery.ts` scans `$DSH_HOME/.agent-presets/<id>/` for `preset.yml` + `agent.cordis.yml` | **file discovery deleted** — the string `.agent-presets` survives only in a skill document; presets are declared in bundle/profile YAML (`@deepseek-ai/dsh-agent-preset` rows) or registered at runtime via `agentPresets.register(definition)` |
| Roster entry | `{id, trust, name, …}` (`trust: system \| user`) | `{id, isDefault, name, description, broken}` — **no `trust` field** (`agent-preset-registry/src/preset.ts`, `…/types.ts`) |
| Remote surface | `list` / `copy` / `deletePreset` | `list` / `read` / `select` only (`copy` and `deletePreset` removed; preset management moved to plugin-manager remotes) |
| Definition shape | `preset.yml` (identity) + `agent.cordis.yml` (composition) | `PresetDefinition {id, name?, description?, order?, plugins: EntryOptions[]}` (`agent-preset-registry/src/definition.ts:5-11`) — one object; the plugins list *is* the rendered composition |

Landed upstream in `d1e22a7e24` "feat(preset): declare Agent compositions in profile YAML (#4569)" (0.1.6-alpha.2 era) and refined through the 0.2.0 bundle restructure (`packages/bundle/web-app/presets/<id>.patch.yml` — the four shipped presets are now flat patch files; the wire ids `standard` / `ptc` / `minimal` / `cordis` are unchanged).

### 2.2 What breaks here

1. **Concerto mode never registers.** `omo-agents` materializes `$DSH_HOME/.agent-presets/concerto/{preset.yml, agent.cordis.yml}` at `apply()` time (`patches/omo-dsh/omo-agents/src/concerto-preset.ts`) and relies on the deleted scanner. On 0.2.0 nobody reads those files: no roster entry, no error, and `session/create {agentPreset:"concerto"}` fails with `agent-preset/not-found`.
2. **The roster assertions lose their vocabulary.** `concerto-mode-probe.sh` and the e2e driver pin `trust:user` and the materialized file path (`tests/e2e/drive.mjs` asserts anchors inside `$DSH_HOME/.agent-presets/concerto/agent.cordis.yml`, e.g. :2463/:2510/:2546). Both referents are gone — the assertions must move to the registry roster (`agentPresets/list`) and the composed agent tree.
3. The plugin's own boot read (`ctx.inject(['agentPresets'])` → `agentPresets.list()`, `omo-agents/src/index.ts:234`) still fires — the service name and `list()` survive (`AgentPresetRegistry extends TypertRemoteService`, `super(ctx, 'agentPresets')` @ `agent-preset-registry/src/index.ts:51,64`) — but its `RosterEntry.trust` read now yields `undefined` for every row.

### 2.3 What survives, and the migration path this implies

- The **composition itself is valid**: all 20 upstream packages the concerto `agent.cordis.yml` names exist at 0.2.0-rc.2 (`dsh-tool-present` moved directories, `packages/fs/` → `packages/deliverables/`, package name unchanged); the Loader YAML dialect (`insert:`, `group: true`, `isolate:`, `!!js`) is exercised by the shipped 0.2.0 preset patches in the same shapes concerto uses; `dsh-persona` shows **zero diff** between the tags; `dsh-tool-subagent`'s Config keeps `provider` / `toolName` / `backgroundMode` / `persona` / `agentOptions` / `toolFilter` / `maxDepth` (only `maxDepth`'s `.default(3)` was dropped — every concerto row sets `maxDepth: 2` explicitly).
- `session/create {request:{cwd, agentPreset}}` is still honored (the session projection still reads `header.agentPreset`, `agent-preset-registry/src/session.ts:35-44`), and `agentPresets/select` exists for pre-first-turn switching.
- The natural port: **keep the sentinel-rendering pipeline, change its exit** — render the same entry list in memory and call `ctx.agentPresets.register({id:'concerto', name, description, order: 5, plugins})` at `apply()` time instead of writing files. The `RosterEntry` structural type loses `trust`; the probes re-point at the registry roster.

## 3. P0-2 — the `ctx.jobs` rewrite

### 3.1 The change (`packages/jobs/jobs/src/index.ts`, `…/types.ts` @ dsh-v0.2.0-rc.2)

| Surface | 0.1.5-rc.1 | 0.2.0-rc.2 |
|---|---|---|
| `list` / `get` / `read` / `kill` / `wait` / `remove` caller | `caller?: Agent` | **`caller?: SessionId`** — the access check compares `job.owner.id !== caller` directly (`jobs-local/src/index.ts:407`); an `{id}` object no longer satisfies it |
| Snapshot type | `JobSnapshot` with `ownerSession?: SessionId`, `reported` | `JobView` with **`owner?: SessionId`**; **`reported` deleted** (the settled event's `awaited` flag carries that de-dup semantics) |
| Completion notification | `jobs.onJobDone(listener)` (+ `onJobsChanged`) | **both removed**; `jobs.events.subscribe(filter, listener)` with `{owner: SessionId}` / `{owners: 'all' \| 'scope'}` filters and a `registered / progress / stopping / settled / removed / output` event vocabulary |
| `start(spec)` | `JobStart { owner?: Agent, run(): { done: Promise<JobOutcome{output}> } }` | `JobSpec { owner?: SessionId, run(job: JobHandle) }`, outcome field `output` → `result` |
| `attachController` | unchanged | unchanged |

### 3.2 The three touch points — each fails quietly

1. **`patches/omo-dsh/omo-hooks/src/hooks/background-notification.ts`** — its `typeof jobs.onJobDone === 'function'` probe now fails, so the hook silently takes its own **degraded pull path** (a path the Phase 3 design deliberately kept); the `reported` de-dup read is constant-false. No throw; background completion notifications simply stop arriving on the push path.
2. **`patches/omo-dsh/omo-hooks/src/services/stop-continuation-guard.ts`** — passes `{id: sessionId}` as the caller (`StopContinuationCallerLike`, :154-168). Under the new check the comparison `job.owner.id !== {id:…}` is always true → owned jobs are filtered out of `list` and rejected by `kill`; layered on that, the `snapshot.ownerSession` fence reads a renamed field and skips everything. `/stop-continuation`'s cascade **silently cancels nothing** — the exact silent-skip class the file's own header warns about.
3. **`patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/live-state.ts:293`** — `jobs.start({kind, label, owner: agent, run: () => ({done: …output…})})` is wrong on both the `owner` type and the `run` signature; the preflight throw lands in the existing `catch` and surfaces as `degraded: true`. The ulw-execute work job never starts and the log stays clean.

The adaptations are small (pass the `SessionId` string, read `owner`, subscribe `events` with `{owners:'scope'}` and de-dup on `settled.awaited`, reshape the `start` spec) — but they are **mandatory**, and only the full gate chain proves each one.

## 4. P1 — session log format v4

### 4.1 The change

- `SESSION_FORMAT_VERSION = 3 → 4` (`packages/core/session/src/types.ts:89`); new sessions write `session.v4.jsonl` (with the deployment's compression). V3 logs stay readable and a one-time V3→V4 corpus migration ships (`packages/session/session-format-v3-to-v4`, PR #4320); the write/scan path asserts V4 admission (`assertV4RowAdmission`, `session-persistence-jsonl/src/format.ts`).
- The `tool/result` message is restructured: was `role:'user'` carrying `content: [{type:'tool-result', toolCallId, content, isError}]`; now `role:'tool'` with **top-level** `toolCallId` / `isError`, and the `'tool-result'` content-block type is deleted (`llm/src/message.ts`, `core/session/src/types.ts` @ 0.2.0). `developer/message`, `image/offload`, `workspace/changes` event types are new.

### 4.2 What breaks here

- `tests/e2e/drive.mjs` fabricates v3-shaped `tool/result` entries at ten-plus sites (:5201, :5278, :5328, :5680, :5728, :5859, :6501, :6525, :6686, …) and asserts against the v3 block vocabulary; any fabricated log a v4 runtime re-reads hits the V4 admission assert, and every project-side parser of the old envelope sees a shape it does not know.
- The filename half is **already absorbed**: the scripts match `/^session(?:\.v\d+)?\.jsonl$/` (`scripts/smoke-real.mjs` `isSessionLogName`), which v4 satisfies by construction.

### 4.3 The zstd correction — a phantom work item, foreclosed

Zstandard compression is **not** a 0.2.0 change: `DEFAULT_COMPRESSION = 'zstd'` is identical at 0.1.5-rc.1 (`session-persistence-jsonl/src/index.ts:66` on both tags), and this project's sandbox profiles already pin `compression: none` through their persistence overlays (`scripts/smoke-real.mjs:524`, `tests/e2e/drive.mjs:2015`, `scripts/prove-route-logging.mjs:296`). The plaintext observation channel is an existing design decision, not pending migration work; only the v4 envelope remains.

## 5. P2 — additive or unused-here changes (recorded, no action forced)

| Change | Evidence | Bearing here |
|---|---|---|
| `MessageSourceMap` drops the catch-all `plugin` kind; producers declare their own via `declare module '@deepseek-ai/dsh-llm'` (upstream exemplar: `time-context`) | `llm/src/message.ts:104-113` | 13 sites use `source:{kind:'plugin'}` (hard-blocks injection, todo-continuation steer, keyword-detector's own filter). Runtime consumers fall through unknown kinds and the project's producer/filter pair is self-consistent, so injections still land — but the idiom is deprecated upstream; Phase 4.5 should move to dedicated kinds |
| `agent/session-start` removed, folded into serial `agent/created` | `core/agent/src/runtime-types.ts:261` | Not subscribed anywhere in this project — no impact |
| `tools/pre-execute` decisions gain `{kind:'cancel'}`, `deny.info`, `ask.displayReason`; `turn/end` gains a `forked` reason variant | `core/tools/src/index.ts:596-611`; `core/session/src/types.ts:228` | Additive; the guards' exclusion-style classification is unaffected |
| `tool-subagent` `maxDepth` loses `.default(3)` | `subagent/tool-subagent/src/index.ts:130` | All ten delegation rows set `maxDepth: 2` explicitly — no impact |
| `skills`: `path?` hoisted to `SkillSummary`; `commands`: optional `definitionId` added | `skill/skill/src/index.ts:55-58`; `interaction/commands/src/index.ts:62` | Structurally compatible |
| `ctx.codeRuntime` renamed `ctx.ptcRuntime`; `agentPresets/copy` + `deletePreset` RPCs removed | `core/tools/src/index.ts`; §2.1 | Not used here |
| CLI: `dsh <name>` generalizes the old hardcoded `web` alias; duplicate `--profile` now errors; `--dump-config-schema` and `dsh plugin allow-version / revoke-version` added; auth-handshake redirect Location becomes directory-relative `./` | `apps/cli/src/args.ts`; `apps/cli/src/plugin.ts`; `client/connection/src/browser-auth.ts` | All compatible — the scripts assert the 303 status, never the Location value (`smoke-real.mjs:674-679`) |
| `dsh.bundle.patch` accepts a **list** of patch files; `$DSH_HOME/profiles/node_modules` interception layer and `.dsh-module-fallback` **remain** | `boot/app-boot/src/profile.ts` | Transparent to `--patch` users; the project's per-profile `dsh plugin add` installs are unaffected |
| cordis patch semantics (`insert:` with/without id, warn-and-skip on missing targets) | `vendor/include/src/index.ts` `applyEntryPatches` — line-identical | The P-8 semantics `cordis.yml`'s header records all hold |

## 6. Stable surfaces — the census that came back clean

| Surface | Evidence @ dsh-v0.2.0-rc.2 |
|---|---|
| `ctx.on` / `get` / `inject` / `effect` / `provide` / `plugin` | vendored cordis `context.ts` / `registry.ts` / `service.ts` — **zero diff** |
| All 15 subscribed events (`agent/pre-step`, `agent/status`, `agent/turn-stopping`, `assistant/message`, `compaction/end`, `session/disposed`, `session/event`, `step/end`, `subagent/descriptor`, `tool/result`, `tools/post-execute`, `tools/pre-execute`, `turn/end`, `turn/start`, `user/message`) | present; `agent/pre-step` waterfall payload `{agent, messages, turn, step, signal}` and `PreStepDecision` verbatim |
| `agent.inject(message)` | declaration and implementation verbatim (`core/agent/src/runtime-types.ts:241`) |
| `ctx.goals.pause(agent, ref)` | verbatim (`goal/goal/src/index.ts:351-353`) — `/stop-continuation`'s pause semantics hold |
| `ctx.sessionProjections.stateOf` / `snapshot` | `session/session-projection/src/index.ts:319,338` (3-line lint-comment diff only) |
| `ctx.commands.register` / `ctx.skills.register` / `get` | signatures unchanged (§5 additive notes) |
| `ctx.subagents.start` / `SUBAGENT_DESCRIPTOR_VERSION = 3` | `subagent/subagent/src/index.ts:559`, `…/descriptor.ts:48` |
| `tools/post-execute` `ToolExecutionResult` (`isError` / `content`) | verbatim — `empty-task-response-detector` is safe |
| base bundle still mounts `id: commands` and `id: jobs` | `bundle/base/cordis.patch.yml:307,88` — `omo-commands`' `inject:['commands']` premise holds |
| Web transport: readiness line `dsh web: …/?token=…`, `dsh-auth-*` cookie handshake, `POST /api/<ns>/<method>` with the exactly-one-`args` envelope, `agentPresets/list` · `llm/listProviders` · `session/create` · `session/prompt` | `bundle/web-app/src/index.ts:271`; `client/connection/src/browser-auth.ts`; `api/gateway/src/index.ts` |
| `--patch` top-level YAML array + `insert:` form; `--no-open`; `dsh plugin add`; `$DSH_HOME/profiles/<name>/` layout | `apps/cli/src/args.ts`; `bundle/web-app/src/startup.ts`; `boot/app-boot/src/profile.ts` |

## 7. What this means for the gates (the standing lesson, updated)

The 0.1.5-rc.1 upgrade taught: *the gate you don't have is the one that ships the break* — doctor-lite's schema pass exists because the persona rename passed 4/4 + 10/10 + 104/104. The 0.2.0 surfaces sharpen it: **every P0 here is a silence, not an error**, and each has a designated canary that dies first —

- the preset re-architecture kills the e2e driver's **materialized-file anchor assertions** and the probe's `trust:user` vocabulary before any user notices the missing roster entry;
- the jobs rewrite is caught by the `/stop-continuation` cascade e2e (the cancelled-set assertion) and the background-notification scenario — *if* they run; a green boot proves nothing;
- the v4 envelope is caught by the driver's own fixture parsers.

So the adaptation order is forced: fix the **jobs** surfaces first (small, isolated), then the **preset registration** (the core feature), then the **observation infrastructure** (v4 envelopes) — and only then flip the D7 pin and regenerate the L1+L2 evidence, because a release row must be `tested` on the runtime it claims.

## 8. Scope sketch (sized in roadmap Phase 4.5)

| Work item | Size | Notes |
|---|---|---|
| `ctx.jobs` adaptations (3 files) | small | caller → `SessionId`; `ownerSession` → `owner`; `onJobDone` → `events.subscribe({owners:'scope'})` + `settled.awaited`; `start` JobSpec reshape |
| Concerto preset → `agentPresets.register()` | medium | sentinel pipeline kept, file-materialization exit replaced; roster/probe assertions drop `trust`, re-point at the registry roster and the composed agent tree |
| Session-log v4 envelopes | medium | test profiles keep `compression: none`; driver's fabricated entries and parsers move to the v4 `tool/result` shape |
| `kind:'plugin'` → dedicated source kinds | small (deferrable) | 13 sites; deprecated idiom, not a live break |
| Pin machinery (ci.yml `DSH_VERSION`, `bump-dsh.sh` 0.1.x assumptions, doctor-lite's D7 semver assertion, compat matrix row) | small | deliberately **last** — after the evidence chain is green on 0.2.0 |
