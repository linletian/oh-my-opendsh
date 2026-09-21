# MVP Pitfall Records

> **Formal deliverable** (PRD AC-9, goal G2 "step on landmines early"). This document is the
> closed-out pitfall knowledge base for the MVP: every unstable-surface assumption in the PRD's
> pitfall-hunting plan (§P-1…P-9) has its outcome recorded here, whether the assumption held or
> failed, plus the pitfalls discovered during implementation that the original list did not
> anticipate (P-10.x).
>
> **Recording convention**: one row per *distinct* pitfall. When one probe (P-#) uncovers several
> distinct pitfalls, each gets its own sub-numbered row (e.g. P-8.1, P-8.2 …). The `Evidence` column
> links to the raw record under `.omo/evidence/` (verbatim logs, never paraphrased-only). `Status`
> values: `open` (assumption untested), `resolved-proven` (verdict established by real execution),
> `resolved-fallback` (the fallback/design-around is the shipped answer), `wontfix` (documented
> behavior we design around).
>
> Chinese mirror: [`mvp-pitfalls_zh-CN.md`](./mvp-pitfalls_zh-CN.md), row-for-row identical.

## 1. Pitfall rows (P-1 … P-10)

| # | 现象 Phenomenon | 证据 Evidence | 根因 Root cause | fallback | 状态 Status |
|---|---|---|---|---|---|
| P-1.1 | **Assumption HELD (probe, not a failure).** Question: can a scratch plugin register a 5th run-mode preset at the same level as the official 4? Empirically YES on rc.6: the spike's `ctx.agentPresets.copy('standard', 'concerto', …)` from the `--patch` plugin lands in `$DSH_HOME/.agent-presets/concerto/` and `POST /api/agentPreset.list` (the Web UI picker's own surface) lists `concerto` (`trust:"user"`) in the same roster array as standard/code/minimal/cordis (`trust:"system"`). | [.omo/evidence/task-5-mvp-implementation.md](../.omo/evidence/task-5-mvp-implementation.md) §1 citations 1-7 (verbatim boot log + RPC response); `scripts/p1-preset-probe.sh` PASS | The mode registry is OPEN: filesystem-root discovery (unmemoized `list()`, `includeUserRoot: true` default appends `$DSH_HOME/.agent-presets`) + the official authoring write `ctx.agentPresets.copy()`; the client roster is data-driven, not a hardcoded enum. | Not needed. Verdict: register-branch. The PRD §4.4 fallback (omo profile + launcher script) is NOT executed; T6 registers a real 5th mode. | resolved-proven (register-branch) |
| P-1.2 | The official 4 modes' localized display names are **client-side hardcoded** for `system` presets only (`BUILT_IN_PRESET_KEYS` covers exactly standard/code/minimal/cordis). A plugin-registered preset cannot get a slot in that locale table; it renders from its own `preset.yml` `name`/`description` (probe-verified: `concerto` displayed as `演奏模式 (Concerto P-1 spike)`). | [task-5 evidence](../.omo/evidence/task-5-mvp-implementation.md) §1 citation 4 + verbatim RPC response; `ui-agent-preset/src/client/locales.ts:169-174,186-191` | `presetDisplayText()` looks up localized copy only when `trust === 'system'` AND the id is one of the 4 built-ins; everything else falls back to `preset.name ?? preset.id` by design. | Ship display name/description in the preset's own `preset.yml` (the `copy(from, id, name?)` authoring call writes it). Presentation degrades gracefully, capability is unaffected. | resolved-fallback (fallback is the design) |
| P-1.3 | A config-override adding our repo's preset dir to the `agent-presets` row's `roots` is **dead on rc.6** (mechanism (a) of the two registration candidates): (i) the boot force-appends an overlay AFTER all user overlays that rewrites `roots` to exactly the shipped system root, so the extra root is clobbered (a live boot with an extra root carrying a dummy preset listed only the official 4 in `POST /api/agentPreset.list`); (ii) `config` on an id-targeted row replaces the row's config **wholesale** (no deep merge), so an override setting only `roots` crashed the boot with `$.default missing required value`. Bonus blocker even if (i) merged: `roots` entries need absolute paths, and a committed absolute path is machine-specific. | [task-6 evidence](../.omo/evidence/task-6-mvp-implementation.log) §2 (verbatim boot error + no-patch/extra-root roster responses); installed `lib/profile-boot-*.js` `composeProfile` (force-patches `roots` when the row exists) | Shipped-root ownership is an assembly fact: `apps/cli` patches the installed app's `config/agent-presets/` in as the sole `system` root at boot, deliberately outranking overlay config; row config merges are replace-semantics, not deep-merge. | Route around, don't fight it: apply-time authoring into the auto-appended user root (`$DSH_HOME/.agent-presets/`, `includeUserRoot: true`), implemented in `patches/omo-dsh/omo-agents/src/concerto-preset.ts`, probed by `scripts/concerto-mode-probe.sh` (mechanism (b), shipped). | resolved-fallback (mechanism (b) shipped) |
| P-2 | **Assumption HELD.** Does `dsh-tool-subagent` instance config `agentOptions.{provider,model}` really override parent inheritance at runtime? YES. Source: `resolveChildAgentOptions` spreads the parent route first and `...requested` last (subagent/src/child-agent.ts:68-83), consumed on both in-process child paths. DSH's own suite runtime-covers it (continuation.spec.ts:2258 "reapplies the descriptor model route on cold resume"). Under OUR composition: T15 recorded the child descriptor (`agentProvider/agentModel`) and both agents' `request/header` routes on the real stack; T20 asserted `routePairDistinct` in the mock e2e; T23's real-model smoke executed parent `deepseek-official/deepseek-v4-pro` vs child `deepseek/deepseek-v4-flash`, distinct, with the delegation chain completed. | [task-14 log](../.omo/evidence/task-14-mvp-implementation.log) §P-2 evidence (source chain + spec citations); [task-15 log](../.omo/evidence/task-15-mvp-implementation.log) (descriptor + request/header verbatim JSONL); [task-20 log](../.omo/evidence/task-20-mvp-implementation.log) (routePairDistinct); [smoke-real verdict](../.omo/evidence/smoke-real-2026-08-21T02-19-07-489Z/verdict.json) (ac5 checks all true) | Merge order in `resolveChildAgentOptions` makes the explicit request win; the descriptor snapshot is taken from the same resolved values, so the durable log and the executed route agree by construction. | None needed (assumption held). Remaining honest limit: verified under mock + scripted adapters + ONE real-model smoke; no fallback chain exists (§12.5), an unknown model id fails the request loudly with `UNKNOWN_MODEL`. | resolved-proven |
| P-3 | **Assumption HELD.** `agent/pre-step` waterfall listener semantics (registration order / waterfall wrap / authoritative reject-or-enter) match the docs exactly, all three known in-repo users use the same delegate-then-fold shape. One documented nuance worth recording: `agent.inject()` inside a pre-step listener queues for the NEXT step boundary ("may miss a request whose pre-step already claimed its batch"), so the injected sections are model-facing from a sub-agent's SECOND step onward; a one-shot single-step sub-agent reply never carries them. This is documented behavior, not a doc-vs-reality mismatch, and it shaped T20's assertion design (scripted sub-agent runs ≥2 steps). | [task-16 log](../.omo/evidence/task-16-mvp-implementation.log) §1 (file:line API surface), §5 (three-way MATCH verdict), §5 design note; injection observed live in [task-19 log](../.omo/evidence/task-19-mvp-implementation.log) (`hardBlocksInjectionObserved:true`) and in the T23 real smoke child session | Dispatch is an around-middleware waterfall; the innermost `next` IS the built-in enter behavior; `inject` splices into the inbox at the next-step boundary with no wake. | None needed (MATCH). For one-shot subagents, accept the second-step boundary or pair with `agent/session-start` + inject (the official hooks-claude-code:206-212 shape) if first-step coverage is ever required. | resolved-proven (with documented next-step nuance) |
| P-4 | **Assumption HELD, with one cross-platform landmine.** `toolFilter` is a FLAT field `{allow, deny}` (no wrapper); deny semantics = removal from the child's model-facing surface AND dispatch-level `UNKNOWN_TOOL`, child-scoped, re-applied per start. The landmine: unknown tool names in a deny list throw INSIDE `applyChildComposition` at child startup (`tools.restrict() names unknown global tool "pwsh"`), and `bash`/`pwsh` are platform-gated rows, so a static deny naming the wrong shell breaks delegation on one platform. Verdict: keep `deny: [write, edit]` (OMO-faithful, platform-safe); a bash deny would also remove shell READ, a capability cut vs OMO. | [task-12 log](../.omo/evidence/task-12-mvp-implementation.log) §1 enforcement chain, §2 verdict (a), §4 QA-1…QA-4 verbatim (happy / stripped-control / bogus-name / pwsh-on-linux) | `tools.restrict()` validates names against the GLOBAL registry at child startup; tool-bash/tool-pwsh rows are conditionally `disabled` per platform, so the registry itself is platform-dependent. | deny only platform-stable names (`write`, `edit`); delegation-scope hardening is already backed by `approvalPolicy: 'never'` for in-process children plus the persona's binding Read-Only Declarations and T16 hard-blocks injection. | resolved-proven |
| P-5 | **Assumption HELD.** The depth cap is the FLAT field `maxDepth` (union `natural | "provider-managed"`, default 3); there is NO `policy` wrapper (the PRD's `policy.maxDepth` phrasing was corrected by T11's schema finding). Proven by execution: cap 1 rejects a depth-1 parent on BOTH the foreground and continuable start paths with the verbatim errored tool result `Error: subagent depth 2 exceeds maxDepth 1` (isError=true), the tool stays model-visible at the cap, a depth-0 control passes, absent-maxDepth defaults to 3, and `provider-managed` sends no cap. The cap is deployment-fixed (no model-facing depth argument exists), depth itself is system-stamped (`subagentDepth`/`delegationDepth`, monotone). | [task-13 log](../.omo/evidence/task-13-mvp-implementation.log) §1 chain, §3 QA-1…QA-5 verbatim, §4 P-5 verdict | `resolveChildDepth` runs BEFORE any child exists on both start paths; the tool runtime converts the thrown `SubagentDepthError` into an errored tool result (README:28 contract). | None needed (matches expectations). For out-of-process providers use `maxDepth: 'provider-managed'`; a numeric cap on a provider without the `depthLimit` capability fails loud AT MOUNT. | resolved-proven |
| P-6 | **Assumption REFRAMED (concern moot, no failure).** The `build:lib:host` + `build:lib:client` dual-target convention is a per-package property for split (host+browser) packages; a pure-host plugin has no client face at all (webserver exemplar). Our plugin loads via Node 24 type-stripping with no build step (P-8.6 note in T4 evidence), so a dual-target emit build would be cargo-culting. The durable value kept: two noEmit typecheck faces under the same script names, where the host face EXCLUDES DOM. Failure-probed: `window.innerWidth` in host code fails `pnpm build` (TS2304) while the repo-root `pnpm typecheck` facade (default DOM lib on) stays green, so the host face is the stricter gate. | [task-9 log](../.omo/evidence/task-9-mvp-implementation.log) §0-§6 (convention reading, verdict, happy + failure probes verbatim) | DSH splits per-face tsconfig aggregates; the workspace facade keeps TS's default DOM lib, hiding browser-global leakage; browser globals are `undefined` at the dsh host runtime. | Keep `pnpm build` (host typecheck + vacuous client face) as the CI boundary gate; do NOT remove the `-d src/client` guard without adding a real client entry. | resolved-fallback (per-face typecheck gates shipped) |
| P-7 | **Assumption HELD.** The session JSONL already records both agents' resolved routes: the continuable child gets a durable `subagent/descriptor` event (`agentProvider`/`agentModel`) stamped pre-turn, and every agent loop appends `request/header` on its first request. Nuance: the ONE-SHOT descriptor schema OMITS the route fields; a one-shot child's route is still recorded by its own `request/header`. Our row is continuable, so AC-5's observation half needs no self-built listener. | [task-15 log](../.omo/evidence/task-15-mvp-implementation.log) (verdict `logged`, verbatim child descriptor + request/header JSONL, failure QA with fabricated unlogged logs) | `childSessionMeta`/`seedDescriptorTurn` persist the resolved route into the creation seed; the descriptor snapshot and the executed route come from the same resolved values (continuation.ts:413-414). | None needed. If a future row uses `backgroundMode: 'one-shot'`, read the route from the child's `request/header` instead of the descriptor. | resolved-proven |
| P-8.1 | A plain `- id:/name:` row in a `--patch` overlay is **silently skipped**: `--dump-config` exits 0, the row is absent from the composed tree, and the only warning (`patch: entry "omo-agents" not found`) goes to the buffered in-memory logger during a real boot, invisible on the terminal. The plugin simply never mounts. | [.omo/evidence/task-4-mvp-implementation.log](../.omo/evidence/task-4-mvp-implementation.log) §4-F1, §5 P-8.1 | `--patch` takes a **patch list**, not an entry list: against the always-empty profile root, a plain row is an id-targeted override that matches nothing. Mounting REQUIRES the `- insert:` form. The primer (docs/cordis-primer.md) never documents this distinction. | Always use `- insert:` for new rows; `scripts/cold-start.sh` stage A asserts the row is present in the `--dump-config` output before any real boot. | resolved-proven |
| P-8.2 | Flag ORDER matters: `dsh --profile web --port 0 --patch ./cordis.yml` fails with `error: unknown option '--patch'` (exit 1). | [task-4 log](../.omo/evidence/task-4-mvp-implementation.log) §5 P-8.2 | Once the app's own flags begin, everything after is forwarded to the app, and the web app has no `--patch`. Root flags (`--profile`, `--patch`, `--dump-config`) must come FIRST. | Fixed flag order `--profile <name> --patch <file> … <app flags>` baked into scripts/cold-start.sh. | resolved-proven |
| P-8.3 | `--profile <name>` is REQUIRED: bare `dsh --patch ./cordis.yml` errors `error: --profile <name> is required` (exit 1); there is no default profile. `headless` is unusable for a credential-free smoke (needs LLM credentials). | [task-4 log](../.omo/evidence/task-4-mvp-implementation.log) §5 P-8.3 | By design: dsh has no default profile; `web` is an alias for `--profile web`. | Always pass `--profile web`; `web --port 0` (OS-picked port) + readiness line `dsh web: http://127.0.0.1:<port>` + SIGTERM (exit 0) is the clean bounded cold start. | resolved-proven |
| P-8.4 | Plugin `name` resolves from the **PROFILE directory** (`$DSH_HOME/profiles/<name>/`), never cwd, never the overlay's directory. Relative paths anchor on the profile dir (useless from a repo-root overlay); the `workspace:` protocol is NOT a valid specifier. An unresolvable name crashes the boot with a raw Node uncaught rejection (`ERR_MODULE_NOT_FOUND … imported from /tmp/…/dsh/profiles/web/`), exit 1. | [task-4 log](../.omo/evidence/task-4-mvp-implementation.log) §4-F3 (verbatim error), §5 P-8.4 | Bare specifiers walk `node_modules` upward from the profile directory; module resolvability is only checked at boot, NOT by `--dump-config`. | Install the plugin into the profile first: `dsh plugin --profile <name> add <dir>` (pnpm forwarder; local dirs become `link:` deps; works offline for zero-dep packages). cold-start.sh always does a real boot (stage B), never trusts stage A alone. | resolved-proven |
| P-8.5 | The patch schema is **LENIENT**: an unknown key (`bogusField: 123`) on an insert row is silently accepted and echoed verbatim into the composed dump; boot succeeds. A typo in a KNOWN key therefore silently changes semantics instead of erroring. Hard failures are only: unreadable file, YAML parse failure, non-array top level, duplicate ids (and a missing `id` is auto-generated). | [task-4 log](../.omo/evidence/task-4-mvp-implementation.log) §4-F2, §5 P-8.5 | Hand-rolled lenient parse; `PatchOptions` has an index signature; there is NO schema validation of unknown keys anywhere in the overlay path. | `--dump-config` + its stderr is the only shipped inspection surface; treat overlay edits as code review items; cold-start.sh stage-A assertions pin the exact expected row text. | wontfix |
| P-9 | **Assumption HELD (no path-resolution pitfall found).** Local markdown section loading resolves via `import.meta.url` under Node's real module system (asserted absolute + equality in unit tests); the `dsh plugin add` link:-dependency shape means no copy/snapshot step exists that could drop the `system-sections/` dir; the cold-start boot log is free of ENOENT/path errors (grep-verified). The omo-senpi class of bug (调研 §11.4 issue #6794) does not reproduce under this load path. | [task-7 log](../.omo/evidence/task-7-mvp-implementation.log) §5 P-9 observations 1-5 (TDD red/green, cold-start PASS, zero-match ENOENT grep) | Type-stripping loads plugin sources in-place where the md dir physically sits next to `src/`; resolution is anchored to the module URL, not cwd. | None needed. Keep the unit-test path assertions; they fail the suite if the dir layout ever moves. | resolved-proven |
| P-10.1 | **T11 schema deltas (three distinct deltas, one row: they share one root cause and one mitigation).** Reading the INSTALLED rc.6 dsh-tool-subagent Config against the plan's expectations found: (a) NO `policy` wrapper exists, the depth cap is the FLAT field `maxDepth`; (b) NO `description` field exists, the model-facing tool description is GENERATED from `provider.inheritsParentContext + backgroundMode`, so an OMO task-tool-style contract description is NOT expressible in form-A static config (adding `description:` would be silently-preserved dead config); (c) unknown config keys are silently PRESERVED by schemastery (verified: `agentOption:` typo returned in the validated value), so a field-name typo silently changes behavior (the delegation would run with inherited parent model options). | [task-11 log](../.omo/evidence/task-11-mvp-implementation.log) §SCHEMA FINDINGS (rc.6 installed ≡ rc.7 source, field-by-field), failure-mode probe CASE2/CASE3 verbatim | schemastery object fields are optional unless `.required()`, unknown keys are preserved by design, and the tool description is a provider-derived computed string rather than a config field. | The probe pins exact field names with grep + validated-value assertions so a typo fails the probe even though dsh stays silent; contract-style parent guidance lives in the omo-sisyphus system prompt (Delegation Discipline section, T8); a real custom description needs an upstream dsh-tool-subagent feature or a wrapper plugin (flagged for follow-up). | resolved-fallback (probe gate + prompt-level guidance) |
| P-10.2 | **Preset-row validation is LAZY.** cordis `resolveConfig` runs a row's Config schema when the row's fiber loads, which for preset rows is `mountPreset` at agent/session composition, NOT at boot (agent-presets/src/mount.ts:332). A broken row (e.g. `maxDepth: -1`, `persona: 123`, `toolFilter: {}`) boots clean and only throws at first session use; a bogus provider name never throws at all (the tool just never registers, only a wait line is logged). Boot-level gates alone would certify a broken composition. | [task-11 log](../.omo/evidence/task-11-mvp-implementation.log) §SCHEMA FINDINGS item 4 + failure-mode probe CASE1/CASE4/CASE5/CASE6 verbatim; [task-12 log](../.omo/evidence/task-12-mvp-implementation.log) (unknown-name throw surfaces at child startup, consistent with lazy validation) | Validation timing follows fiber load order; preset rows have no boot-time fiber, so the schema never runs at boot. | We built an EAGER schema gate: the probe validates the materialized row against the installed dsh's own dsh-tool-subagent Config (same js-yaml dialect, same schemastery schema, executed read-only from the dsh binary's node_modules) at probe time (`T11-VALIDATE PASS` per boot), closing the boot-to-session gap for our row. | resolved-fallback (eager probe gate shipped) |
| P-10.3 | **Self-inflicted, real: the real-smoke driver's first run crashed on an ordering bug in OUR OWN code.** `scripts/smoke-real.mjs` wrote the README fixture into `sandbox.project` BEFORE `seedSandbox()` created the sandbox directories, so the first user run died before any model call. This code path had never been executed by the agent (T23-prep deliberately ran no real-key run), so self-test + no-key precheck gates all passed while the happy path had a dead write. Fix: one-line reorder (commit 7473bcb); the re-run passed all AC-4/AC-5 checks against the real model. | [.omo/evidence/task-23-mvp-implementation.md](../.omo/evidence/task-23-mvp-implementation.md) (首轮崩溃记录); [.omo/evidence/smoke-real-2026-08-21T02-16-44-873Z/](../.omo/evidence/smoke-real-2026-08-21T02-16-44-873Z/) (crashed run's evidence dir, empty); [.omo/evidence/smoke-real-2026-08-21T02-19-07-489Z/verdict.json](../.omo/evidence/smoke-real-2026-08-21T02-19-07-489Z/verdict.json) (PASS re-run); commit 7473bcb (`writeFileSync` moved after `seedSandbox`) | A fixture write was sequenced before the directory-creating setup it depends on; the untested-with-real-key driver had a blind spot exactly where its gates could not reach (everything before the first network call was exercised only via self-test, which fabricates the analysis half, not the sandbox half). | Fixed in 7473bcb. Lesson recorded: a driver that has never executed its own happy path is unverified no matter how many precheck/self-test gates pass; the first real execution of any harness is itself a test of the harness. | resolved-proven (self-inflicted; fixed at 7473bcb) |
| P-10.4 | **`DSH_SNAPSHOT` on rc.6 supports ONLY `replay` mode.** The env var hits exactly one code path (`resolveConfigPath`: if snapshotMode === 'replay', swap `cordis.yml` → `cordis.snapshot.yml`); it is a boot-config replay switch, not the prompt-capture facility the PRD's AC-3 wording (`DSH_SNAPSHOT=record`) assumed. There is no record mode to drive. | [task-8 log](../.omo/evidence/task-8-mvp-implementation.log) §DSH_SNAPSHOT investigation (grep over the install, single hit, `dsh_snapshot_usable = false`) | The rc.6 surface is narrower than the research-stage reading suggested; only replay made the rc.6 cut. | Substitution (allowed by the plan): the AC-3 snapshot artifact is produced with vitest's own file-snapshot mechanism (`toMatchFileSnapshot('__snapshots__/sisyphus-system-prompt.md')`), checked in, with explicit marker assertions; failure-probed in T8. | resolved-fallback (vitest file snapshot shipped) |

> Row-count note: P-10.1 records T11's three schema deltas as ONE row (they share one root cause,
> schemastery's lenient/optional-by-default semantics, and one mitigation, the probe's eager
> field-name gate); splitting them into three rows would triple-count a single finding.

## 2. V1–V4 conclusions (sign-off section, PRD §7 AC-9 + Sign-off 条件)

**V1 (scratch plugin loads cold; concerto mode registers; e2e boots for real): 验证通过.**
Evidence chain: cold-start PASS with clean log since T4 ([task-4 log](../.omo/evidence/task-4-mvp-implementation.log));
concerto registered at roster level via apply-time authoring, observable over `POST
/api/agentPreset.list` on every probe boot ([task-5](../.omo/evidence/task-5-mvp-implementation.md),
[task-6](../.omo/evidence/task-6-mvp-implementation.log), concerto-mode-probe two-boot PASS in
[task-16 log](../.omo/evidence/task-16-mvp-implementation.log) §4); mock e2e `{"result":"PASS"}`
with all 4 scenarios ([task-20 log](../.omo/evidence/task-20-mvp-implementation.log)); real-model
boot + full delegation chain in the T23 smoke
([verdict.json](../.omo/evidence/smoke-real-2026-08-21T02-19-07-489Z/verdict.json): pluginLoaded,
both providers active, AC-4 chain in order). No falsification signal at any layer.

**V2 (`agentOptions.{provider,model}` overrides parent inheritance at runtime, and the routes are
observable): 验证通过.** Evidence chain: source-level merge order in `resolveChildAgentOptions`
(child-agent.ts:68-83, request wins over parent); DSH's own runtime test
continuation.spec.ts:2258 (cold-resume runs on the declared route); T15's real-stack
descriptor/request-header recording ([task-15 log](../.omo/evidence/task-15-mvp-implementation.log));
T20's e2e `routePairDistinct` assertion ([task-20 log](../.omo/evidence/task-20-mvp-implementation.log));
and the T23 real-model smoke executing parent `deepseek-official/deepseek-v4-pro` vs child
`deepseek/deepseek-v4-flash`, distinct, with both providers active
([verdict.json](../.omo/evidence/smoke-real-2026-08-21T02-19-07-489Z/verdict.json): ac5* all true).
Honest limit: verified under mock + scripted adapters + ONE real-model smoke; per-model behavior
beyond the deepseek pair is unexercised, and there is no fallback chain (§12.5), so an unknown
model id fails loudly at call time.

**V3 (`agent/pre-step` waterfall listeners behave as documented and can inject into sub-agent
context): 验证通过.** Evidence chain: T16's three-way MATCH verdict on registration order /
waterfall / authoritative semantics against docs + all three known in-repo users ([task-16
log](../.omo/evidence/task-16-mvp-implementation.log) §5); injection observed in real child logs
(`hardBlocksInjectionObserved:true`, [task-19 log](../.omo/evidence/task-19-mvp-implementation.log))
and in the T23 real smoke's child session. Honest nuance: `agent.inject()` lands at the NEXT step
boundary, so one-shot single-step sub-agent replies never carry the injected sections (documented
behavior, P-3 row); MVP assertions were designed around it (scripted sub-agent runs ≥2 steps).

**V4 (toolFilter read-only restriction and the depth cap are real enforcement, not prompt hints):
验证通过.** Evidence chain: T12's real-execution negative proof (child view excludes write/edit,
execution surfaces `unknown tool`, parent scope untouched, stripped-control proves sensitivity;
[task-12 log](../.omo/evidence/task-12-mvp-implementation.log) QA-1/QA-2); T13's verbatim depth
rejection `Error: subagent depth 2 exceeds maxDepth 1` on BOTH start paths with passing controls
([task-13 log](../.omo/evidence/task-13-mvp-implementation.log) QA-1…QA-5); T20's e2e
hallucination-resistance scenarios (model attempts a denied `write` and receives the verbatim
unknown-tool error; child attempts nested delegation and receives the verbatim depth error;
[task-20 log](../.omo/evidence/task-20-mvp-implementation.log) §4).

**None of V1–V4 was falsified.** Per PRD §7's sign-off condition, AC-1…AC-9 are green and each V
carries a "验证通过" verdict with its evidence chain above.

## 3. rc drift declaration (mandatory)

The **MVP closeout** verification ran against **DSH 0.1.0-rc.6** (the installed runtime,
`/home/linletian/.npm-global/lib/node_modules/@deepseek-ai/dsh/`, inspected and executed read-only),
with **rc.7 source-checkout reading** for citation completeness (`/home/linletian/GithubRepo/deepseek-harness`,
read-only; every cited path was checked to match the installed rc.6 line-for-line on the surfaces we
depend on, e.g. [task-12 log](../.omo/evidence/task-12-mvp-implementation.log) §1 and [task-13
log](../.omo/evidence/task-13-mvp-implementation.log) §1 record rc.6 ≡ rc.7 on the enforcement
paths). This drift is sanctioned by decision **D7** (pin-minor `0.1.x`: any `0.1.x` release
satisfies the pin) and is recorded here per the plan. PRD §12 now names **0.1.5-rc.1** as the
target pin, and the PRD's stale `rc.5` text has been corrected (2026-09-10 entry below).

The line has moved three times since closeout: **0.1.2-alpha.1** (§5 P-11), the **2026-09-04
current-DSH runtime port** (§6 P-13–P-19, which re-implemented Concerto on a then-current
runtime), and **0.1.5-rc.1** (§7 P-20 below, the pin this project now targets). §7 is authoritative
for the 0.1.5-rc.1 surface; where it and an older section disagree about a dsh symbol, §7 wins. If a
further `0.1.x` ships, re-run the gate chain
(`pnpm typecheck:libs && pnpm typecheck && pnpm vitest run && pnpm test:e2e && scripts/cold-start.sh &&
scripts/concerto-mode-probe.sh`) before adopting it.

## 4. Follow-up guidance (PRD §12)

V1–V4 all passed, so the path forward per PRD §12 and D11/Q-2 is the full-port track, in this
order:

1. **FIRST follow-up (Q-2, option B): import one minimal OMO core package via npm** and verify the
   import + dual-license + typecheck chain end to end. This is the cheapest unverified premise left
   and gates everything after it. *(Revised 2026-09-11 by D14: the core packages were never published
   to npm — this follow-up is now a git-vendoring spike, [Roadmap](./roadmap.md) Phase 1.)*
2. Remaining agents (the other 10 OMO agents) onto the proven concerto preset shape.
3. Hooks batch translation onto the P-3-proven `agent/pre-step` waterfall (and sibling events).
4. Team Mode, then the rest of the capability surface per the feasibility report.

MVP artifacts all persist and grow: repo skeleton → full patch framework; mock e2e → the full L2
layer; doctor-lite → full doctor; this file → the cumulative pitfall knowledge base.

> Note for the user (NOT registered, per task constraints): no new decision (D13+) appears
> necessary from this closeout. If the rc.6→rc.7+ upgrade or the upstream `description`-field
> feature request (P-10.1(b)) is pursued, those are candidates worth registering; registration is
> the user's call.

## 5. P-11 (2026-08-29, dsh 0.1.2-alpha.1 bump verification — executed via source build, npm lags)

> Appended 2026-08-29, after the MVP closeout, from the dsh-012-review-sync plan's pin-bump
> execution (T6-T9). `dsh-v0.1.2-alpha.1` exists only as a git tag (the npm registry tops at
> `0.1.1-rc.2`), so the bump was verified against a **source build of the tag** (`pnpm install` +
> `pnpm run build` + `npm link`) on BOTH the 0.1.2-alpha.1 build and the rc.6 pin; the CI flip is
> blocked pending npm publish (PRD §12). Evidence: `.omo/evidence/task-{7,8,9}-dsh-012-review-sync.log`.

- **P-11.1 shipped preset relocation + `code`→`ptc`** — rc.6 `apps/cli/config/agent-presets/` → 0.1.2 `packages/preset/agent-presets/presets/`; locale keys `ui-agent-preset/src/client/locales.ts:171-176` renamed in step, still `trust==='system'`-only → P-1.2 fallback design stands.
- **P-11.2 the 5 re-derivation deltas adopted** (KEEP command-goal; `modelSelectionSettings: true` on the generic spawn row only — silently-preserved dead config on rc.6, effective on 0.1.2; refreshed product-provider DROP wording; `tool-web fetch: false→true` tracking upstream; derivation-ledger path updated, rc.6 note kept); 18/18 diff hunks ledger-explained (42e1f84).
- **P-11.3 e2e verbatim rejection contracts: NO string drift on 0.1.2** (`unknown tool "write"`, `subagent depth N exceeds maxDepth M`; the depth-error class moved rc.6 child-agent.ts:48-56 → 0.1.2 :34); the real drift was the web-RPC transport (token→cookie auth; flat endpoints → Typert Remote) + `CallId`→`ToolCallId` + descriptor v2→v3 — harness adapted transport-adaptively (105aa84, 3d949f1), green on BOTH runtimes.
- **P-11.4 npm publish gap** — tag-only release; CI flip blocked; verification ran against a source build of the tag (doctor-lite accepted it via D7 pin-minor).
- **P-11.5 rc.8-dependency landmine** — a fresh `npm i -g @deepseek-ai/dsh@0.1.0-rc.6` today resolves rc.8 DEPENDENCIES (`^` ranges; rc.8 published 2026-08-19) which break the T13 stack (`ctx.agents.get`); the validated tree = rc.6 umbrella + rc.7-scheme deps, restorable only via the explicit ~197-pin `--no-save` recipe recorded in `.omo/evidence/task-9-dsh-012-review-sync.log` (P3.5b-e/P5.11). Follow-up: lock/shrinkwrap the harness's dsh dependency tree.
- **P-11.6 not adapted** — `scripts/smoke-real.mjs` still rides the rc.6 flat RPC (unrunnable without real keys); adapt together with the CI flip.

## 6. P-13~P-19 (2026-09-04, current-DSH runtime port)

> Hit while re-implementing the same PRD (FR-1~FR-8, V1–V4) on the **current DSH environment**
> (dynamic Cordis plugin system) and verifying it. Full implementation, verification (final
> `concerto_verify` 22/22 PASS) and the Q-3 route drift: `docs/concerto-current-dsh_zh-CN.md`.
> Runtime form = dynamic plugin `conc-1` (source archived at
> `patches/omo-dsh/omo-agents-current/concerto-plugin.host.js`) + persistent user preset
> `~/.dsh/.agent-presets/concerto/` (mirrored at `patches/omo-dsh/omo-agents-current/preset/`).

| # | Symptom | Root cause | Fallback / fix | Status |
|---|---|---|---|---|
| P-13 | Child first turn dies: `session event "subagent/descriptor" carries non-JSON-serializable data` | The decorator subagent provider dropped the service-resolved `request.descriptor`; `attachDescriptorAppend` then appended `undefined` as the session event | Forward `descriptor` verbatim; child session log confirms | Fixed+verified |
| P-14 | All 5 system-sections fail to load (`FsError: not found`) | `sandboxPolicy.workspaceRoot` points at a DIFFERENT worktree than the session cwd | Resolve paths against the conductor's durable `session.header.cwd` | Fixed+verified |
| P-15 | Conductor route resolved as the explore route (v4-flash) | This session's `Agent.options.model` diverges from the frozen request config (v4-pro); `options` is not the route truth source | Track the conductor route from the real `agent/request` frozen config + `captures` audit | Fixed+verified |
| P-16 | First child assembly snapshot lost (verify SKIP) | `exploreChildren` registration (after `await start`) races the child's first assembly | Register deterministically at `agent/created` (publication time) by lineage+route | Fixed+verified |
| P-17 | Plugin-side evidence writes fail / land in the wrong place | The sandbox backend's `sandboxPolicy.workspaceRoot` differs from the real workspace, so plugin fs writes are rejected by the sandbox checker | Session log (tool results) is the durable authority; the conductor session materializes files | Recorded (environment fact) |
| P-18 | `settings.update` fails: `must be a plain object` | Dynamic-plugin Host code evaluates in a `node:vm` realm; vm object literals fail the host-realm `Object.getPrototypeOf===Object.prototype` check (the sandbox patches only `instanceof`) | Edit `settings.yaml` on disk + `dsh-settings-file` chokidar hot-reload (the supported path) | Worked around+verified (pi-ai activated) |
| P-19 | Manual-test steps 6/7 "succeed": write and nested delegation unrestricted | Restrictions bind to the DELEGATION TOOL, not the session/persona — children spawned via the generic `subagent` tool are unrestricted full agents | Preset hardening: DROP the generic subagent/subagent_fork rows (only delegation path = call_omo_explore); toolFilter upgraded to `deny:[write,edit,call_omo_explore]` so the child physically cannot write or delegate | Fixed+verified (22/22) |

### Current-DSH V1–V4 verdicts

| # | Verdict | Basis |
|---|---|---|
| V1 | Verified (register-branch) | Dynamic plugin define/run/update with zero DSH changes; provider/tool/prompt-section extension surfaces are all public |
| V2 | Verified (register-branch) | Source: `resolveChildAgentOptions` spreads `requested` LAST; runtime: explore rides pi-ai `deepseek`/v4-flash, conductor rides `deepseek-official`/v4-pro, four observation channels agree |
| V3 | Verified | Persona capability (order-0 shadow) + `system-prompt/assemble` waterfall snapshot: `{persona:true, hardBlocks:true}` |
| V4 | Verified | Child assembly snapshot: `write`/`edit`/`call_omo_explore` all absent + verbatim depth-2 rejection (`subagent depth 2 exceeds maxDepth 1`) |

> Probe-scoping lesson (from P-19): **negative probes must land on the object under test** — "is
> write available" targets the explore CHILD, not the conductor (the conductor is a full agent;
> its write tool is by design). Put the probe inside the delegated task text and confirm the
> delegation went through `call_omo_explore` (child descriptor mode=one-shot).

- **P-20 (candidate, not hit)**: the plugin/verifier detects injected content via literal markers
  such as `indexOf('## Hard Blocks')` — tweaking the markdown sources (heading rename/translation)
  would silently disable the checks. License-wise this is fine (the plugin embeds no OMO text;
  attribution stays in the `system-sections/*.md` sources); engineering-wise it is a fragile
  coupling — if the sections ever change, prefer structured/section-name-based detection.

## PR #1 review disposition (2026-09-04)

> Review baseline: `feature/dsh-omo-mvp` vs `main` (95 files / 16,058 lines / 52 commits). Every
> point was fact-checked against the tree before acting: 1 blocking (F1 — confirmed, fixed),
> 8 accurate suggestions fixed (F2–F6, F10, F11), 1 partially accurate (F9 — the decision was
> already registered as D12; added the pointer), 2 rejected (F7 — already mitigated; F8 — the
> claim is factually wrong).

| Item | Review claim | Verdict | Disposition |
|---|---|---|---|
| **F1 (blocking)** | Two preset paths with divergent security semantics: the legacy path (`omo-agents/`, still the load target of build/e2e/cold-start/manual) kept the generic `subagent` rows and denied only `[write, edit]` | **Confirmed** — legacy template rows 208–221 had the generic rows; drive.mjs `PLUGIN_DIR` points at the legacy path; the static checker covered only the new path | Hardened per option (a): legacy template DROPs the generic rows, deny → `[write, edit, explore]` (physical no-delegation); the e2e AC-6b scenario now asserts tool ABSENCE + unknown-tool rejection (self-test defect cases inverted accordingly); concerto-preset tests flipped to negative probes; static checker gains c10 covering the legacy path |
| F2 | `install` endpoint two-hop chain has no integrity check / can drift from the repo | **Confirmed** (two curl hops, nothing ties them) | Wrapper URL now joins the bump (release-bump updates it with the alias) + consistency check d07; cryptographic signing recorded as accepted residual risk |
| F3 | Installer Python YAML rewrite does not handle quoting/escaping | **Confirmed** | `EXPLORE_PROVIDER`/`EXPLORE_MODEL` validated against `^[a-zA-Z0-9._-]+$` (fail loud) + `json.dumps` in Python as defense-in-depth |
| F4 | Appending the settings block without a leading newline can corrupt a file that does not end with `\n` | **Confirmed** | Newline guard before the append |
| F5 | release.sh seds CHANGELOG/matrix sections (format-sensitive) | **Confirmed** | Notes generated in release-bump.mjs right after the render (`.omo/release-notes-<v>.md`); sed demoted to fallback |
| F6 | L2 freshness checks only ONE evidence file — a full-matrix release could pass with a missing combo | **Confirmed** | New `scripts/check-l2-evidence.mjs`: every tested row's `evidence` must exist, be fresh, and carry the `**PASS — N passed, 0 failed` marker |
| F7 | `READ_ONLY_FILTER` defined outside the context — deny entries could drop | **Partially true** — restrict() throws on unknown names (fail loud, not silent), and live evidence (verify AC-6b + demo negative probes + e2e) shows the child physically lacks the tools | Accepted as mitigated; registered here; a harness-level child-tools assertion can be added if desired |
| F8 | The "30s check" wording is wrong ("call_omo_explore does not appear in the conductor's own tool list") | **Rejected** — call_omo_explore IS the conductor's only delegation tool by design (FR-4); the original wording meant the right thing | Wording clarified (conductor sees only it; explore children see none) |
| F9 | The MPL-2.0 whitelist decision is buried in a code comment | **Partially true** — the decision was already registered as D12 (docs/decisions.md) | Comment now points at D12 |
| F10 | The schema's four states are only half used | **Confirmed** | release-process §3 notes `broken`/`dropped` are currently empty, reserved for §8 emergencies |
| F11 | `build:*` scripts are noEmit typechecks under a build name | **Confirmed** | Renamed to `typecheck:host` / `typecheck:client` / `typecheck:libs`; instruction chains updated |

## 7. P-20 (2026-09-10, dsh 0.1.5-rc.1 pin upgrade)

Research basis: [`dsh-0.1.5-rc.1-review.md`](./dsh-0.1.5-rc.1-review.md) (full evidence trail,
line-level citations, reproduction commands). Every entry below was reproduced by running **this
repo's own gates** against the real `@deepseek-ai/dsh@0.1.5-rc.1` npm artifact, installed into a
throwaway prefix — the developer's live install was never touched (`realDshUntouched: true` on
every e2e run).

### P-20.1 — the persona row's config key was renamed, and every gate scored green anyway (P0)

| Field | Record |
|---|---|
| **Symptom** | Every session naming `concerto` is refused: `agent-presets: preset "concerto" failed to mount: failed to apply loader entry persona (@deepseek-ai/dsh-persona): invalid config: - $.prefix missing required value (at prefix)`. The roster still lists the preset with its real display name and **no `broken` flag**. |
| **Evidence** | Live `dsh web` boot + `POST /api/session/create` against the installer-materialized preset (review §2.2, verbatim); `pnpm test:e2e` 0/4 scenarios with the same message; an eager per-row schema run reporting `FAIL persona: ValidationError: $.prefix missing required value` while every other row it covered passed (13 rows with the prototype's named-`Config` rule; the shipped gate covers 16 because it also accepts `default.Config` — review §6). |
| **Root cause** | At `dsh-v0.1.3-alpha.2`, `@deepseek-ai/dsh-persona` replaced `text: z.string().required()` with `prefix: z.string().required()` + `suffix: z.string().default('')`, splitting `deployment:persona` into `deployment:persona-prefix`/`-suffix`. schemastery **preserves** an undeclared key rather than rejecting it, so the stale `text:` passes validation and is then simply never read — nothing warns, the persona text is unused, and the failure lands on the *missing required* `prefix` at mount time. Discovery's health check only proves each row's module *resolves*, never that its config validates, so `broken` stays unset and the picker shows a healthy card. |
| **Fallback / fix** | One key rename across seven sites (renderer sentinel, both compositions, two unit-test files, the e2e MOCKROLE needle, the mode probe's grep). Verified: with only that rename, sessions mount and the whole delegation chain runs (review §2.3). |
| **Why the gates missed it** | `doctor-lite`'s eager schema check validates **exactly one row** (`tool-subagent-explore`) — the row that broke had none. That is the real defect; the rename is its symptom. |

### P-20.2 — the session log generation filename changed (P1, observation channel)

| Field | Record |
|---|---|
| **Symptom** | `sessionLogFound: false` on all four e2e scenarios, cascading into ~27 failed assertions — while the harness itself ran correctly (the mock recorded the full `sisyphus → explore → explore → sisyphus` chain). |
| **Evidence** | Real on-disk artifact: `$DSH_HOME/sessions/<encoded>/<id>/session.v3.jsonl`; the driver's `findSessionLogs` matches `entry.name === 'session.jsonl'` only. |
| **Root cause** | Session format v3; the canonical filename now carries the format generation — *"Version zero retains the original suffix-only name; every later generation carries a lowercase numeric `vN` component"* (`session-persistence-jsonl/src/format.ts:50-54`). rc.6 wrote a bare `session.jsonl`. |
| **Fallback / fix** | Make the reader generation-aware rather than pinning `session.v3.jsonl` (a hardcoded v3 name re-breaks at v4). |

### P-20.3 — `subagent/descriptor` version 2 → 3 (P1, fixture)

| Field | Record |
|---|---|
| **Symptom** | The driver's fabricated-fixture QA path silently degrades: a version-mismatched descriptor folds to `undefined`, i.e. it reads as "this log has no descriptor" rather than as an error. |
| **Evidence** | `SUBAGENT_DESCRIPTOR_VERSION` is `2` at `dsh-v0.1.0-rc.8` and `3` from `dsh-v0.1.2-rc.1` on (`packages/subagent/subagent/src/descriptor.ts:48`); the guard is `if (version !== SUBAGENT_DESCRIPTOR_VERSION) return undefined` (`:210`). A real 0.1.5-rc.1 child log now stamps `{"version": 3, …}`. |
| **Root cause** | Already recorded for 0.1.2 in the earlier review's addendum; the fixture constant was never moved because no gate reads it. |
| **Fallback / fix** | Move the fixture to `version: 3`. Route fields still appear only on continuable descriptors, and the executed route is read from `request/header` — that part of the design is unchanged. |

### P-20.4 — `dsh-tool-subagent` gained a required service in `inject` (P1, fixture)

| Field | Record |
|---|---|
| **Symptom** | `scripts/prove-explore-maxdepth.mjs` fails with "explore tool not visible to the depth-1 parent" — the tool never registers at all. |
| **Evidence** | `export const inject = ['tools','subagents','systemPrompt','sessionProjections']` (`tool-subagent/src/index.ts:45`) and an unconditional `ctx.sessionProjections.register(...)` at `:326`; the fixture stubs `agents` + `sessionPersistence` but not this one, so the fiber parks in `waiting` — no tool, no error. |
| **Root cause** | Same class as P-10.2 (lazy/hidden activation): a missing service produces silence, not a diagnostic. The shipped base composition provides the row, so production is unaffected — this is a hand-built-fixture problem only. |
| **Fallback / fix** | Add a `sessionProjections` stub beside the existing ones. `prove-explore-toolfilter.mjs` is unaffected because it drives `applyChildComposition` instead of mounting the plugin row. |

### P-20.5 — `dsh web` opens a browser by default and no MVP script suppressed it (P2, environment)

| Field | Record |
|---|---|
| **Symptom** | Every local boot (`cold-start.sh`, `concerto-mode-probe.sh` ×3, the e2e driver) launches a desktop browser. |
| **Evidence** | `openBrowser: z.boolean().default(true)` (`web-app/src/index.ts:61`); live log line `dsh web: opening the default browser; pass --no-open to disable`. |
| **Root cause** | New default in the range; the handoff neither blocks nor changes the readiness line, so **no gate can fail on it** — which is exactly why it would have shipped unnoticed. |
| **Fallback / fix** | Feature-probe the flag at the four boot sites (`dsh --profile web --help | grep -- --no-open`) and pass it only when advertised — hardcoding it breaks every pre-0.1.2 run, where the app commander rejects an unknown option (P-8.2 class). The related readiness-line change (URL now carries `?token=`) needed no fix: all three parsers already tolerate it. |
| **Trap found while fixing it (CI-only)** | `dsh --profile web --help` does **not** merely print help — it BOOTS the profile and creates `$DSH_HOME` (`.anonymous-user-id`, `profiles/`). A probe that inherits the ambient environment therefore silently creates or boots the **real** dsh home, inside a script whose whole contract is that the real `~/.dsh` is never touched. Invisible on a developer machine where the directory already exists; **loud in CI on a fresh `HOME`**, where the credential digest flipped to `realDshUntouched: false` and failed the e2e gate while all four scenarios passed. The two `*.mjs` drivers now give the probe a throwaway home (`mkdtempSync`) — the isolation the shell scripts already had right by exporting the sandbox first. Verified by running the driver under a fresh outer `HOME`: nothing is created. |

### P-20.6 — meta: the gate suite certified a build that could not start a session

| Field | Record |
|---|---|
| **Symptom** | Unmodified repo on 0.1.5-rc.1: **104/104** unit, **4/4** doctor-lite, **10/10** concerto-static, **7/7** docs-consistency — and **0/4** e2e. |
| **Evidence** | Review §6 table; the same suite is fully green on rc.6, where the product works, so the suite is not "too strict" — it is under-covering. |
| **Root cause** | Every gate validates *the artifact we ship* (YAML parses, markers present, one row's schema) but only one validates *the artifact against the runtime that will mount it*, and only for a single row. A rename in an unguarded row is invisible. |
| **Fallback / fix** | Generalize `doctor-lite` check 4 from one row to every config-bearing row of the rendered composition, run against the installed plugin's own `Config` — the same read-only import mechanism the check already uses. Cost is unchanged (seconds, zero network). Rows whose packages export no `Config` must report as *unchecked*, never as pass. |

### P-20 — verified-intact list (no action)

Recorded so a future reader does not re-derive it: `--patch` semantics and the patch engine
(byte-identical); `dsh plugin add`; the `agentPresets` service surface (`list`/`resolve`/`copy`/
`standingKeyFor`, `AgentPreset.path`, the `broken` field); the user root `$DSH_HOME/.agent-presets`;
`preset.yml` and `trust` (unchanged module); the mount-time isolate-realm invariant; `agent/pre-step`
+ `agent.inject()` + `session.header.origin === 'subagent'`; the entire `tool-subagent` config schema
and its `toolFilter`/`maxDepth` enforcement; the T11 explore-persona shadow (proven live: the child's
system prompt carries the explore persona and **not** the deployment one); the T12/F1 read-only
enforcement (the child's advertised tools exclude `write`/`edit`/the delegation tool); and the FR-6
hard-blocks injection (a `user/message` whose `source.plugin` is `omo-agents` lands in the child log).

### P-20.7 — the out-of-chain probes had rotted; nothing ran them (found 2026-09-10)

| Field | Record |
|---|---|
| **Symptom** | Two verification scripts were already broken before this upgrade touched anything, and one had been broken for six days. `scripts/concerto-mode-probe.sh` failed with `explore toolFilter deny list missing`; `scripts/prove-route-logging.mjs` died at `ctx.agentLoop` being undefined. |
| **Evidence** | The probe asserted `deny: [write, edit]` in two places (`:272` the eager schema check, `:588` the materialized-file grep) while the F1 hardening of **2026-09-04** (`6203432`) had changed the template to `deny: [write, edit, explore]`. `prove-route-logging.mjs` had three independent 0.1.5-rc.1 breaks: it did not mount `sessionProjections` (which `dsh-agent-loop` newly injects — and the loop *reads* it, so a no-op stub would have been a wrong fixture), it called the now-`async` `agentLoop.create()` without `await`, and it matched the bare `session.jsonl` filename. |
| **Root cause** | `scripts/ci-local.sh` runs seven gates and **none of them is the probe or any of the three `prove-*.mjs` scripts** — yet the PRD's own rc-drift declaration names `scripts/concerto-mode-probe.sh` as part of the mandatory bump chain. A check that no chain runs is a check that rots: both breakages were introduced by *other* commits (the F1 hardening, the 0.1.5-rc.1 upgrade) and neither commit had a way to notice. |
| **Why the earlier verification missed it** | The 0.1.5-rc.1 upgrade verification ran exactly the gates in `ci-local.sh` plus the e2e — i.e. it ran *the set that cannot detect this class*. The probe and the proofs were assumed to be covered because they exist. They were run for the first time only when the question "is there anything else in this repo that needs revising?" prompted an exhaustive sweep. |
| **Fix** | (1) Repaired both scripts (deny-list expectations; `sessionProjections` mounted as the REAL registry rather than a stub; `await` on `create`; generation-aware log filename). (2) **Structural:** added `scripts/run-proofs.sh` — one command, resolves the installed dsh's node_modules through `doctor-lite`'s existing helper, renders the template with the plugin's own `syncConcertoPreset`, and runs all three proofs — and wired it as **gate 8** in both `scripts/ci-local.sh` and `.github/workflows/ci.yml`. Zero LLM cost, no network, no boot, well under a minute. |
| **Transferable lesson** | The probe rotted because it was named in prose (the PRD) but not in code (the chain). Documentation that a check *should* run is not a mechanism that it *does*. This is P-20.6's lesson one level up: that was one unguarded ROW inside a checked file; this is an unguarded FILE inside a checked repo. |

## 8. P-21 (2026-09-10, manual-test finding on the delivered preset)

**The 0.1.5-rc.1 delivery was manually tested by the user in the real web UI, and two of the four
scenarios were bypassed.** This is exactly what G2 ("step on landmines early") exists to surface,
and it is the first finding in this project produced by a human driving the delivered artifact
rather than by a scripted harness. Sessions analyzed: parent
`session-61174f37` (`agent-preset/selected: concerto`; 23 tools including `call_omo_explore`, no
generic `subagent`/`subagent_fork`; route `deepseek-official/deepseek-v4-pro`; persona
`# Orchestrator Role`) with children `9dde0c40` (S3) and `7f04ee2c` (S4), plus grandchild
`session-21d9b567` (S4).

### P-21.1 — `toolFilter` denies the write TOOLS, but `bash` is an equivalent write path (AC-6a)

| Field | Record |
|---|---|
| **Symptom** | S3's child was asked to rename the project in `README.md`. It edited the file successfully. `README.md` line 1 became `# foo`. |
| **Evidence** | Child `9dde0c40`'s tool list is exactly 20 names with **no `write`, no `edit`, no `call_omo_explore`** — the filter held. The edit still happened, through `bash`: `cp README.md /tmp/README.md.bak && python3 - <<'EOF' … s.replace("# oh-my-opendsh\n", "# foo\n") …`. The child's own final answer reports "**File edited:** `/home/linletian/SoftwareWorkspace/oh-my-opendsh/README.md`" and describes the change. |
| **Root cause** | T12 verdict (a) deliberately keeps shell access for explore: `bash` is platform-gated, so a static deny would throw `unknown global tool` on win32, and OMO's own explore keeps shell access. The consequence was never measured until a human ran it: **a tool-layer deny of `write`/`edit` is not a capability-layer read-only guarantee** when a general-purpose shell is present. |
| **Why no gate caught it** | The e2e's `explore-write-denied` scenario scripts the mock child to CALL `write`, which correctly returns `unknown tool` — the assertion set (`childAdvertisedToolsExcludeWriteEdit`, `writeAttemptRejectedWithUnknownTool`, `writeTargetAbsentOnDisk`) is true and stays true while the bash path is wide open. The scenario tests the filter, not the guarantee. |
| **Fix** | Expressible in pure config: make the deny list platform-conditional — `deny: !!js "process.platform === 'win32' ? ['write','edit','call_omo_explore'] : ['write','edit','call_omo_explore','bash']"` (verified: the loader dialect evaluates it and the installed `dsh-tool-subagent` Config accepts the result). Explore retains `read`/`grep`/`glob`/`read_image`, which cover its retrieval mission. **Decision pending** — it contradicts T12 verdict (a) and weakens OMO parity, so it is the user's call, not a silent change. |

### P-21.2 — a child with `bash` can create an unrestricted agent process (AC-6b)

| Field | Record |
|---|---|
| **Symptom** | S4's child was told to delegate again. It had no delegation tool — and delegated anyway, by launching a separate `dsh` process. The depth cap, the single-delegation-path hardening, and the registry itself were all bypassed. |
| **Evidence** | Child `7f04ee2c`'s tool list also lacks `call_omo_explore`; its log shows `list_agents` → `(no subagents)`, then ~22 `bash` calls of which one is `timeout 600 dsh --profile headless "You are a research subagent. Do NOT spawn or delegate…"`, polled with `job_output`. That produced grandchild `session-21d9b567` — `origin: main`, **`delegationDepth: 0`, no `parentSession`**, 25 tools including `write`, `edit`, `subagent`, `subagent_fork`, `workflow`, `ralph`. The child's final answer states the caveat honestly: *"My toolset contains no task/delegate/explore subagent tool … Instead I spawned a genuinely independent DSH agent process."* |
| **Root cause** | `maxDepth: 1` is enforced by the subagent REGISTRY (`resolveChildDepth`), and `toolFilter` removes the delegation TOOL. Neither constrains what a `bash`-enabled child can execute. A separately launched `dsh` is not a child of anything the registry tracks, so no depth, filter, or persona applies to it. |
| **Why no gate caught it** | Same shape as P-21.1: the scenario asserts the delegation tool is ABSENT from the child and that calling it yields `unknown tool`. Both hold. The process-spawn path is outside what the assertion model describes. |
| **Fix** | Shares P-21.1's remedy — denying `bash`/`pwsh` for the explore child closes both, since the child then has no general-purpose exec surface. No configuration-only remedy exists for a child that legitimately needs a shell. |

### P-21.3 — the transferable lesson

Both scenarios failed the same way: **the hardening was specified at the tool layer and verified at
the tool layer, while the guarantee was claimed at the capability layer.** Every assertion was true
and the capability was absent. The e2e model — scripted mock child, exact tool-name assertions —
structurally cannot see a bypass that goes through a tool the child legitimately holds, which is
why a human-driven session found in minutes what four automated scenarios had certified as safe.
Recorded as a test-design constraint for the full port: **a restriction needs an adversarial
scenario that tries to reach the forbidden outcome by ANY available means, not one that confirms
the intended tool is missing.**

### P-21 disposition (2026-09-10) — ACCEPTED, recorded as a threat-model boundary

**Decision (user, 2026-09-10): keep the current design; do not deny `bash`.** The reasoning, so a
future reader does not re-litigate it:

1. **This is T12 verdict (a), not an oversight.** Shell access for explore was kept deliberately,
   with two stated reasons (platform-gating, and OMO keeping shell access for its own explore).
2. **It is OMO parity.** OMO's explore denies `write`/`edit`/`apply_patch`/`task`/`call_omo_agent`
   and keeps its shell. Changing this would *diverge* from upstream, against the project's
   "honour OMO's design philosophy / no capability cuts" principle.
3. **The threat model excludes it.** R5 registers "the parent agent is a trusted internal LLM, no
   untrusted input sources", and PRD §8 states outright: *"Explicitly not doing: … adversarial
   /red-team testing."* The manual test was adversarial by construction — it **instructed** the
   child to do the forbidden thing — so it exercised a case the scope deliberately excludes.
4. **AC-6 as written is met.** Its parenthetical *is* the mechanism definition: "explore's write
   attempts are denied (**toolFilter effective**); explore's attempt to delegate further is denied
   (**depth cap effective**)". Both hold.

**The precise claim this record now stands behind:** `toolFilter`/`maxDepth` are **guardrails
against drift and accident inside a trusted agent team**, not a **capability boundary against a
determined or instructed agent** that holds a general-purpose shell. The persona's Read-Only
Declarations are the layer that speaks to intent; the filter is the layer that makes an accidental
write fail loudly. Neither is a sandbox.

**Watch item for the full port (do not inherit silently).** The one crack in the "trusted LLM"
premise is that untrusted *content* can still enter the child: it holds `web_search` and
`web_fetch`, and the full port adds MCP servers and broader file reads. Content-mediated injection
into a `bash`-enabled child is a real path, and it does not require an adversarial *prompt*. When
the surface widens, revisit this disposition — options at that point are a narrowed exec tool,
sandbox-level isolation of children, or a write-capable-command guard on the child scope.
Reverting `tool-web`'s `fetch` to `false` was considered and rejected: `web_search` alone already
carries the same untrusted-content channel, so it would cost upstream parity without closing the
path.

**Test-design lesson kept (P-21.3 still stands).** The automated scenarios certified safety by
confirming the intended tool was missing. That is a real coverage limit regardless of this
disposition: a restriction needs a scenario that tries to reach the forbidden *outcome* by any
available means. Not urgent under the MVP's threat model; required before the full port claims any
restriction is enforced.

## 9. P-22 (2026-09-13, Phase 2 roster port — runtime depth-semantics discovery)

**Registered from the Phase 2 (11-agent roster) work; see [the Phase 2 plan](./plans/phase2-dev/phase2-plan.md)
§4.4/§4.5/§4.7 and task P2-T19.** This one is a *design-model* pitfall rather than a code defect:
the shipped design was self-consistent, every gate was green, and the mistake was in the mental
model of a harness field. It was found only when the phase's own positive nested-delegation
scenario was executed. Arbiter decision `D-2026-09-13-01`.

| Field | Record |
|---|---|
| **Symptom** | The roster's original design gave `atlas` `maxDepth: 2` and every other delegation row `maxDepth: 1`, meaning "atlas may delegate, the others may not." Under that design **atlas's re-delegation was physically impossible**: the very first `e2e` positive chain (conductor → atlas → explore) could not complete. |
| **Evidence** | The chain is in the pinned harness source, not an interpretation: `dsh-tool-subagent/lib/index.js:508-519` folds the **row's own** `config.maxDepth` into `request.maxDepth`, and `dsh-subagent/lib/index.js:432-438` (`resolveChildDepth`) computes `childDepth = parent.depth + 1` and throws `SubagentDepthError` once `childDepth > maxDepth`. So a row capped at 1 can only ever be invoked from depth 0 — atlas at depth 1 invoking any cap-1 row asks for depth 2 against that row's cap of 1. Reproduced by the new `atlas-nested-delegation` scenario (P2-T19, commit `2882fb4`), which had to fail before the correction. |
| **Root cause** | `maxDepth` was read as the **caller's subtree budget** ("how deep may *this* agent's descendants go") when it is the **invoked row's cap** ("the deepest child level at which *this* tool may be called"). The two readings agree for a conductor-adjacent row and diverge for every row that sits inside a chain. `roster.ts`'s original per-row comment and the plan's §4.4 mapping table had both been written from the wrong reading, so the error was replicated consistently rather than caught. |
| **Why no gate caught it** | Every gate was consistent *with the wrong model*. Static gates (c10, doctor-lite) asserted "each row's `maxDepth` equals the roster value" — true. The `prove-explore-maxdepth` proof asserted the depth-1 rejection verbatim — true, and it kept being true. The existing nested scenario asserted the child's delegation tool is **physically absent** (`unknown tool`), which the deny list already guarantees, so no scenario ever asked a *reachable* chain to complete at depth 2. This is P-21.3's lesson in a different layer: the assertions described the mechanism that was built, not the capability that was claimed ("atlas can orchestrate workers"). |
| **Fix** | **All 10 delegation rows are `maxDepth: 2`** (the conductor carries no cap — it is a main-session persona, not a row). Chains reach 2 levels (conductor 0 → atlas 1 → worker 2) and depth 3 is structurally impossible; atlas's own recursion caps at depth 2 by the same rule. The per-class deny lists (physical absence of the 10 delegation toolNames in every non-atlas child) remain the **primary** nested-delegation guard; the depth cap is defense-in-depth. Re-pinned in one pass: `roster.ts` + the YAML template values and comments, `roster.test.ts`, the regenerated `roster.md` snapshot, `concerto-preset.test.ts`, c10, doctor-lite, the roster-derived probe assertions, and `prove-explore-maxdepth.mjs` (depth-1 now PASSES — that is the atlas→worker path — depth-2 is rejected on both start paths with `depth 3 exceeds maxDepth 2`, and the retired asserted case keeps the non-vacuity control). Plan and roster documents were corrected rather than the conclusion (exit criterion **d**). |
| **Alternative considered** | Give atlas a separate, larger cap and keep the others at 1. Rejected: under the target-row semantics atlas's cap governs *atlas's own* invocability, not its children's, so it does not express "only atlas may delegate" at all — the deny lists are the only mechanism that can express that, and they already do. |
| **Status** | 🔧 **Corrected + verified** (2026-09-13/14, P2-T19; `atlas-nested-delegation` 19/19, `plan-reviewer-write-denied` 13/13, 8/8 local gates green). |
| **Transferable lesson** | **A depth/limit field's semantics must be pinned with a positive test, not only a negative one.** A rejection test proves the cap rejects; only an executable *deepest-legal* chain proves it admits what it should. And a design table that is uniformly derived from one semantic reading will be uniformly wrong and uniformly green — the reading itself needs a runtime probe before the table is treated as data. |

## 10. P-23 (2026-09-14, Phase 2 boot marker — settings-driven provider registration is asynchronous)

**Registered from the Phase 2 boot-marker work; task P2-T16(D).** The check was designed
non-blocking by decision, and the *timing* was a measured deviation from the first
implementation — recorded because the same shape applies to every future "read the harness
registry at boot" check in this repository.

| Field | Record |
|---|---|
| **Symptom** | The new `route provider not registered` boot marker is meant to warn (never to block) when one of the 11 routes names a provider this deployment has not registered. Implemented as a synchronous read at `apply()` time, it logged `route provider not registered: deepseek` **in a fully-registered probe sandbox** — a false positive on a healthy deployment, which would have made the warning useless (and would have trained its readers to ignore it). |
| **Evidence** | Real probe boots (`scripts/concerto-mode-probe.sh`, dsh 0.1.5-rc.1, 2026-09-12): at `t+0`, when our `apply()` runs, `llm.listProviders()` returns `[deepseek-official]`; at `t+16ms…` the registry *grows* to `[deepseek-official, deepseek]` via an `llm/adapters-updated` event; a worst case observed the same growth event at `t+5.8s`, and late session-scope churn kept bubbling events whose registry reads could transiently come back **empty**. Root cause in the dependency: `dsh-llm-pi-ai` registers its settings-driven route inside its **own** `ctx.inject(['settings'])` callback (`pi-ai/lib/index.js:2659-2681`), which runs *after* ours. So the fast-seat provider is genuinely absent at the moment a naive apply-time read fires. |
| **Root cause** | A boot-time *synchronous* read of a registry that is populated **asynchronously** by another plugin's inject callback is a race, and the loser is deterministic (our `apply()` always runs first). The false positive is worse than a missing warning here: `provider` is a static deployment fact, so an early read reports a deployment defect that does not exist. |
| **Why no gate caught it** | The boot-marker unit tests pinned line *formats* and both the fires-on-missing and does-not-fire-on-complete cases against a stubbed service, where registration order is not modelled at all. The probe's boot assertions were added later and, on their first real run, *did* catch it — the false positive appeared as a missing marker line in a healthy boot. Worth recording honestly: the design review had accepted "read the provider list in `apply()`" as obviously correct. |
| **Fix** | **The settled-check pattern**, implemented in [`patches/omo-dsh/omo-agents/src/boot-markers.ts`](../patches/omo-dsh/omo-agents/src/boot-markers.ts) as `registerRouteProviderCheck`: (1) the decision read happens when the registry has **grown** since the inject-time snapshot — that growth *is* the settings-driven registration — otherwise after a quiet window (`ROUTE_PROVIDER_CHECK_SETTLE_MS = 8000`) measured from the last topology change, so a deployment that registers *nothing* still gets reported; (2) a registry-growth event runs the check after a short grace period (`ROUTE_PROVIDER_CHECK_EVENT_GRACE_MS = 50`) so one settings load's registration burst is coalesced; (3) the **one reporting read happens in a timer callback**, not in an event handler, because a timer runs outside the dispatching fiber's scope while an event handler can resolve to an isolated session realm (the same boot showed transiently empty listings from late churn); (4) a `settled` flag makes exactly one check run, so late churn can neither duplicate nor retract the boot verdict; (5) a throwing listing or a throwing `ctx.on` still leaves exactly one honest outcome (one `FAILED` line, or the fallback left armed). 8s is deliberately generous: a missing provider is a static fact, and reporting early on a slow boot is the failure mode being avoided. Covered by `tests/omo-agents/boot-markers.test.ts` (32 cases at P2-T16, including fake-timer settle coverage), and the probe now asserts the *absence* of the missing-provider line on a healthy boot plus a forged-provider sensitivity check. |
| **Status** | 🔧 **Corrected + verified** (2026-09-13, P2-T16; probe boot markers green, 8/8 local gates green). |
| **Transferable lesson** | **A boot-time read of an asynchronously populated registry is a race — never a fact.** Either wait for the topology to settle (and say what "settled" means, in code, as a named constant), or move the check to a point where the answer is stable. And when the check exists to catch a *missing configuration*, prefer a late truthful warning over an early false one: a warning that cries wolf at every healthy boot is strictly worse than no warning. |

## 11. P-24 (2026-09-13, Phase 2 e2e harness — a first-match string anchor stops being unique at roster scale)

**Registered from the Phase 2 e2e work; task P2-T18.** Same family as P-23 (an assumption that
held at n=1 and broke at n=10) but a different layer: this one lives in the **test harness**
itself, and its failure mode was a silently wrong artifact rather than a red gate.

| Field | Record |
|---|---|
| **Symptom** | The `roster-parade` scenario must inject one `MOCKROLE=<agent>` marker per delegation lane so the mock LLM server can route each child to the right script. The existing injector (`appendMockRoleMarker`, `tests/e2e/drive.mjs`) located its insertion point with `String.replace(needle, …)`, where the needle was the literal block header `persona: |-`, and `MOCKROLE_BLOCK_SCALARS` was a hardcoded 2-entry table. Both assumptions came from a preset that had exactly **one** delegation row. At 12 rows, all 10 delegation rows render that same `persona: |-` header, so the first-match `replace` would have written the marker for a *later* agent into the *first* row — the parade would then have exercised the wrong agents while its assertions still ran. |
| **Evidence** | Found while generalizing the mechanism; `git log -1 c28d5a7` (P2-T15) is the change that made ten rows share the `persona: |-` shape, i.e. the moment the needle lost uniqueness. P2-T18's own hermetic `--self-test` then pinned it: it rendered the **real** template through the **real** renderer, asserted all 11 markers land under their own row's `id: tool-subagent-<id>` anchor (11/11), and reproduced the old first-hit bug as a mutation QA before fixing it (commit `a9484d3`). |
| **Root cause** | Two hardcoded n=1 assumptions composed: the injector's anchor was a **template shape shared by every row** rather than a **row identity**, and its lookup used *first match wins* with no assertion that the match was unique. A `String.replace` on an ambiguous anchor does not fail — it succeeds on the wrong target. |
| **Why no gate caught it** | No gate could: this is the harness that *produces* the evidence the gates read. Unit tests cover the renderer, not the injector; the e2e scenario would have gone green with markers in the wrong rows as long as each child still matched *some* script (and `detectRole`'s "first system message containing `MOCKROLE=` wins" would have made the mix-up look like a routing result). It was caught by reading the code during the generalization, which is precisely why the generalization shipped with a landing verifier instead of a comment. |
| **Fix** | The mechanism is now roster-driven, and the anchor is row identity: `MOCKROLE_BLOCK_SCALARS` is computed from the roster, the needle is the unique `id: tool-subagent-<id>` line, insertion happens on the row's **first content line** within a bounded scan of that row (so it cannot bind across rows), the row anchor is idempotent (`sisyphus` vs `sisyphus-junior` cannot collide), an **unknown role throws loudly**, and a hit count other than exactly one throws instead of replacing the first. `verifyMockRoleMarkerLanding` asserts the landing independently, and the `--self-test` runs it against the real template + real renderer for all 11 rows. |
| **Status** | 🔧 **Corrected + verified** (2026-09-13, P2-T18; `--self-test` 11/11 landings, `roster-parade` 19/19 assertions, 8/8 local gates green). |
| **Transferable lesson** | **A string injection whose anchor is a shape rather than an identity must assert its own hit count.** "First match wins" is not a lookup strategy, it is the absence of one: at n=1 it is indistinguishable from correct, and at n=10 it silently writes to the wrong object — producing a *green* test that asserted the wrong subject, which is worse than a red one (the P-21.3 and P-22 lesson again, now in the harness itself). |

## 12. P-25 ~ P-30 (2026-09-19 ~ 09-21, Phase 3 hook ports — six listener-lifecycle and observation-face pitfalls found in the dual-review loops)

> All six were found by the Phase 3 coding/review loops (evidence: per-task evidence blocks in docs/plans/phase3-dev/phase3-tasks.md); every fix landed in its task with mutation/anti-fake-green proof.

### P-25 — cordis `ctx.effect(execute)` collects the execute's RETURN VALUE, it does not run a disposal body

| Item | Content |
|---|---|
| **Symptom** | Forwarding a registrar's disposer as `ctx.effect(() => { disposer() })` **disposed the listener at registration time** (the execute body runs synchronously and invokes the disposer on the spot) and returned undefined, so nothing ran at fiber stop — the semantics were exactly inverted. Invisible to the runtime and all 8 gates because the registry was empty (latent defect). |
| **Evidence** | cordis/lib/index.js:1134-1142 `_execute`: `const effect = runner.execute.call(this); if (typeof effect === "function") return runner.collect(effect);` — only the RETURNED function (or Promise/generator yield) is collected as the disposal. Found as a review MAJOR (P3-T3) by the Kimi seat, verified against source by the arbitrator. |
| **Fix** | `ctx.effect(() => disposer)` (return, don't call); the fake ctx was re-modelled after the real cordis (collect the return value + expose a simulated fiber-stop), assertions corrected to "not called after apply, called exactly once after stop", plus mutation verification (the reverted buggy form fails the new case as expected). |
| **Transferable lesson** | **The register/dispose semantics of a lifecycle API must be pinned by runtime evidence** — the semantics a comment claims can be the opposite of reality; a defect hiding behind an empty registry is only caught by mutation verification and source-level review. |

### P-26 — `ctx.get('jobs')` at plugin apply can be undefined (loader concurrency) → acquire services lazily via `ctx.inject(names, cb)`

| Item | Content |
|---|---|
| **Symptom** | `background-notification`'s apply read `ctx.get('jobs')` → undefined → the `onJobDone` subscription never happened and the degraded pull path saw no owned jobs — **the hook produced nothing at runtime** while unit tests stayed green (the fake mirrored the wrong assumption); only the e2e's honest observed-defect assertion surfaced it. |
| **Evidence** | e2e instrumentation: `[omo-hooks] DIAG background-notification: jobsService=undefined`; contrast dsh-tool-jobs/lib/index.js:200/:206 (`ctx.jobs` direct, hard-dependency form) and the omo-agents T16 `ctx.inject(['llm'])` SETTLED precedent (same family as P-23: async registration timing). |
| **Fix** | Acquire lazily with `ctx.inject(['jobs'], cb)` (fires when the service appears, immediately if present); absence stays loud-but-non-fatal with the pull fallback alive; the scenario flipped from observed-defect to positive anchor assertions (DEFERRED→SUBSCRIBED order measured). Deliberately NOT `inject: ['jobs']` on the whole plugin (the other hooks must not be taken down with it). |
| **Transferable lesson** | **A direct apply-time read of an optional service is a race**: either subscribe lazily with `inject`, or design for absence — and one **runtime** assertion must prove the subscription actually happened (a unit-test fake mirrors your assumption). |

### P-27 — `sessionProjections.stateOf` returns the host state; wire-view computed fields must be recomputed from the wire.view formula

| Item | Content |
|---|---|
| **Symptom** | tool-output-truncator's adaptive budget preferred `record.projectedTokens`, but `stateOf` returns the host state (which lacks that field) → the preferred branch was **unreachable in production** and always degraded to `pressureTokens` (systematically under-pricing occupancy → under-truncating); the header comment, the manifest, and the unit-test fake all shared the same wrong assumption, so the existing gates were structurally blind. |
| **Evidence** | dsh-session-projection/lib/index.js:127-131 (`stateOf` returns `cell.state` = host state); dsh-token-meter/lib/index.js:511-514 (`projectedTokens` is computed in wire.view as `Math.max(0, pressureTokens + surfaceTokens - sampledSurfaceTokens)`). Found as a review MAJOR-1 (P3-T14) by the Kimi seat, verified verbatim by the arbitrator. |
| **Fix** | The read face now recomputes per the wire.view formula (degrading only when fields are absent) + a **formula-equivalence pin test** (the pin matches lib:511-514 verbatim, so an upstream formula change turns red) + the three same-wrong sites corrected + positive cases for both the preferred and the degraded path. |
| **Transferable lesson** | **"Same field name in two projection shapes" is a trap**: the read face must be chosen against the implementation (host state vs wire view), and the fake must model the **real** face — otherwise the unit test proves your own misunderstanding. |

### P-28 — A mutation-QA predicate must locate surgically by identity (callId); a sentinel text also matches sibling tool results in the same fixture

| Item | Content |
|---|---|
| **Symptom** | A fabricated defect located its target event via `eventText.includes(SENTINEL)` — the sentinel also appeared inside the read tool's line-numbered text, and the replacement body hardcoded a toolCallId that overwrote the original → the mutation took down the control assertion too (measured: parts 1-0/err, 1-1/ok, 1-0/err — the control vanished, the id duplicated). The self-test stayed green because it only asserted the named check was IN the failed list. |
| **Evidence** | mcode P2 (P3-T6) + Kimi's re-derivation of the mechanism; post-fix proof that the mutation fails exactly the one named check. |
| **Fix** | The predicate locates the trigger result by its callId, and the replacement preserves the original toolCallId; the surgical proof output lives in the evidence. |
| **Transferable lesson** | **A mutation must be surgical**: its purpose is to break exactly one property under test — collateral damage falsifies the attribution of "which assertion guards what" and misleads later triage with a counterfactual failed list. |

### P-29 — A template literal starting with a newline makes `split('\n')[0]` === `''`, and `includes('')` is always true = a structurally fake-green assertion

| Item | Content |
|---|---|
| **Symptom** | The prove script's D-half reminder presence assertion took the constant's first line via `split('\n')[0]` — the constant starts with a newline, so the needle was `''` and `text.includes('')` is true for any result: remove the D-half listener entirely and the proof stays green. |
| **Evidence** | mcode P1 (P3-T19); the fix round's anti-fake-green proof in three states (A fake-green / B red with the D-half disabled / C green again). |
| **Fix** | The assertion now takes the first **non-empty** line programmatically (`find(line => line.trim().length > 0)`, not a hand-copied literal, so copy drift turns red); the same pattern was swept across both prove scripts. |
| **Transferable lesson** | **A presence assertion whose needle is empty/vacuously-true proves nothing** — every assertion deserves one "actually remove what it guards" counter-run; fake green is worse than red (the P-21.3/P-24 family again, this time inside a prove script). |

### P-30 — A waterfall listener's `next()` must stay OUTSIDE the try (calling it inside try + again in catch = double invocation + swallowed downstream errors)

| Item | Content |
|---|---|
| **Symptom** | ulw-execute's pre-step listener had four `return await delegate()` sites inside the try and one more in the catch — when a DOWNSTREAM listener or the built-in behavior threw, the catch caught the downstream exception and called `next()` a second time (a double waterfall invocation) while swallowing the downstream error. The header comment claimed "next() is always outside the try" — the implementation contradicted it. |
| **Evidence** | Kimi MAJOR F-1 (P3-T17) + the arbitrator's verbatim verification (:700/:707/:731/:747 inside the try, :751 in the catch); the precedent directory-readme-injector.ts:529-546 (the try wraps only own logic). |
| **Fix** | Restructured per the precedent (the catch fail-opens with one call, the normal path calls once after the try) + the "next() throws" case gained a **call-count assertion** (exactly once) — the blind spot closed with mutation verification. |
| **Transferable lesson** | **A fail-open catch may only cover OWN-logic errors**: putting delegate/next inside the try folds downstream errors into your own failure domain — and a self-claimed discipline must be pinned by a test (a call-count assertion), or the claim and the implementation can drift together. |

