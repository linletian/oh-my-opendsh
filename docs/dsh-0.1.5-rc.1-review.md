# dsh 0.1.5-rc.1 Review — MVP sync verification

> **Nature**: a verification record with an evidence trail, not an action commitment. It does not bump the DSH pin, does not edit the preset, and does not touch `.omo/compat.yaml`.
>
> - Verification date: 2026-09-10
> - Verification target: the deepseek-harness checkout at `/home/linletian/GithubRepo/deepseek-harness/` (read-only), version `0.1.5-rc.1`, tag `dsh-v0.1.5-rc.1`, HEAD commit `aa8262ec09`; the **published** `@deepseek-ai/dsh@0.1.5-rc.1` npm package, installed into a throwaway prefix
> - Comparison baseline: dsh `0.1.0-rc.6` — the version this project's CI pins (decision D7) and the runtime the MVP was verified on (`.omo/compat.yaml` `tested` rows)
> - **Companion**: [`dsh-0.1.5-rc.1-upgrade.md`](./dsh-0.1.5-rc.1-upgrade.md) — the implementation + verification record (what was changed, the before/after gate table)
> - Method: (1) enumerate every DSH surface the MVP touches; (2) `git diff 15148dbd9a..dsh-v0.1.5-rc.1` per package; (3) **run the MVP's own gates against 0.1.5-rc.1** — `doctor-lite`, `verify-concerto-static`, `check-docs-consistency`, `vitest run`, `tests/e2e/drive.mjs`, `prove-explore-*.mjs`; (4) drive a real `dsh web` boot + `session/create` RPC against the installer-materialized preset
> - **Time anchor** (noted at MVP closeout, 2026-09-11): repo-state statements and repo-relative citations describe the **pre-upgrade** tree as of the verification date; the companion upgrade record holds the after-state, and sections whose findings have since landed say so inline (§4, §7, §9, §10). Upstream citations (`packages/…`, tag-scoped `file:line`) are intentionally left as written.

---
> **中文版**: [`dsh-0.1.5-rc.1-review_zh-CN.md`](./dsh-0.1.5-rc.1-review_zh-CN.md)（2026-09-11 交付；此前刻意 EN-only，以便记录随它所描述的变更一同落地——原 follow-up 见 PRD §12，已关闭）。

## 1. Verdict

**Yes — one hard break blocks the MVP on 0.1.5-rc.1, plus one observation-path break that blocks the e2e gate.**

The plugin half of the MVP is intact: on 0.1.5-rc.1 `@oh-my-opendsh/omo-agents` boots, registers its `agent/pre-step` listener, resolves both model routes, assembles both personas, materializes the preset into `$DSH_HOME/.agent-presets/concerto/`, and reads the roster — all six boot markers present, roster `standard:system,ptc:system,minimal:system,cordis:system,concerto:user`.

The **preset half is broken**: the `persona` row's config key was renamed (`text` → `prefix`, now required), so the composition fails to mount and *every* session naming `concerto` is refused. Nothing else in the preset breaks — the explore delegation binding (`provider` / `toolName` / `backgroundMode` / `persona` / `agentOptions` / `toolFilter` / `maxDepth`) validates and keeps enforcing on 0.1.5-rc.1.

| Severity | Finding | Blocks |
|---|---|---|
| **P0 — hard break** | `@deepseek-ai/dsh-persona` config `text:` → `prefix:` (required) + new `suffix` | Concerto mode is unselectable; all four e2e scenarios |
| **P1 — gate break** | session log filename `session.jsonl` → `session.v3.jsonl` (format v3) | The e2e driver's entire on-disk observation channel |
| **P1 — gate break** | `subagent/descriptor` `version` 2 → 3 | The driver's fabricated-fixture QA path |
| **P1 — gate break** | `dsh-tool-subagent` now injects `sessionProjections` | `prove-explore-maxdepth.mjs` (T13 proof) |
| **P1 — blind spot** | No gate validates the `persona` row against the installed schema | Would have caught P0; it passed 4/4 + 10/10 + 104/104 |
| **P2 — parity** | `present` row (`@deepseek-ai/dsh-tool-present`), `tool-web` `fetch`, persona `suffix` | Nothing; derivation discipline only |

---

## 2. P0 — the persona config rename

### 2.1 The change

```diff
-export const Config: z<Config> = z.object({
-  text: z.string().required(),
-  complete: z.boolean().default(false),
-  includeRuntimeContext: z.boolean().default(true),
-})
+export const Config: z<Config> = z.object({
+  prefix: z.string().required(),
+  suffix: z.string().default(''),
+  complete: z.boolean().default(false),
+  includeRuntimeContext: z.boolean().default(true),
+})
```

`packages/preset/persona/src/index.ts:49-54`. The single `deployment:persona` section is split into `deployment:persona-prefix` + `deployment:persona-suffix`; `apply()` registers **both**, the suffix with `text: config.suffix ?? ''` (`:53-58`) — so a preset persona row that omits `suffix` shadows the deployment suffix away, exactly as it already shadowed the deployment persona on rc.6.

**Version boundary (git-verified):** absent at `dsh-v0.1.3-alpha.1`, present at `dsh-v0.1.3-alpha.2`; unchanged through `dsh-v0.1.5-rc.1`. The 0.1.2-rc.1 row already registered in `.omo/compat.yaml` as `untested` is unaffected by this change.

schemastery still **preserves** an undeclared key in the validated object, but `dsh-persona` reads only `prefix` — so the old `text:` survives validation **and has no effect**: nothing warns, the persona text is simply never used, and the mount fails on the missing required `prefix`.

### 2.2 Proof — the real product path

`scripts/install-concerto.sh` materializes the shipped preset into a throwaway `$DSH_HOME`, then a real `dsh --profile web` boot is asked (over the Typert Remote web RPC, the same transport the Web UI uses) to create a session on it. Verbatim server answer:

```
POST /api/agentPresets/list
  → 200 … {"presets":[…,{"id":"concerto","trust":"user","isDefault":false,
      "name":"协奏模式 (Concerto Mode)","description":"编排优先…"}],"authorable":true}

POST /api/session/create  {request:{cwd, agentPreset:"concerto"}}
  → 200 {"result":{"ok":false,"error":{"code":"agent-preset/invalid",
      "message":"agent-presets: preset \"concerto\" failed to mount:
        failed to apply loader entry persona (@deepseek-ai/dsh-persona):
        invalid config:\n  - $.prefix missing required value (at prefix)
        (/…/.dsh/.agent-presets/concerto/agent.cordis.yml)"}}}
```

Two things worth recording: the preset is **listed with its real display name and no `broken` flag** — discovery's health check only proves each row's *module resolves* (`agent-presets/src/discovery.ts:250-262`), never that its config validates — so the failure is invisible until a session is created. And the failure is total: `agent-preset/invalid` is a hard refusal, not a degraded mode.

The plugin path fails identically, at `session/create`, in all four e2e scenarios:

```
{"result":"FAIL","scenarios":[{"name":"hello","result":"FAIL",
  "failed":["driver error: rpc session/create failed: {"ok":false,"error":
   {"code":"agent-preset/invalid","message":"agent-presets: preset \"concerto\"
    failed to mount: failed to apply loader entry persona (@deepseek-ai/dsh-persona):
    invalid config:\n  - $.prefix missing required value (at prefix)"}}]} …]}
```

### 2.3 What works once `prefix:` is set

Re-running the unchanged driver with only the three `text:`→`prefix:` sites patched (plugin source, template, e2e needle) moves the failure entirely past the mount:

- sessions create and run; the mock LLM sees the full chain — `mockRequestRoles: ["sisyphus","explore","explore","sisyphus"]`, exactly 2 conductor + 2 child requests
- the child's `request/header` shows the explore route (`provider: deepseek`, `model: deepseek-v4-flash`) while the parent runs `deepseek-official/deepseek-v4-pro` — the AC-5 route pair holds
- the child's advertised tools are `ask_user_question, bash, create_goal, get_goal, glob, grep, interrupt_agent, job_kill, job_list, job_output, list_agents, read, read_image, send_message, skill, todo_write, update_goal, web_fetch, web_search` — **`write`, `edit` and the delegation tool are all absent**, so the T12/F1/AC-6b hardening is physically enforced on 0.1.5-rc.1
- the child's log carries the FR-6 injection (`user/message` whose `source.plugin` is `omo-agents`), so `agent/pre-step` + `agent.inject()` still land on 0.1.5-rc.1
- the child's **system prompt is the explore persona**, not the deployment one — `# Explore: Read-Only Retrieval Agent` is present while `# Orchestrator Role` and `You are a coding agent powered by` are both absent. The shadow section was renamed in the same range (`deployment:persona` → `deployment:persona-prefix`, `subagent/src/child-agent.ts:209-214`), but the writer (`dsh-persona`'s preset row) and this shadow target moved together, so the T11 binding is unaffected.

The remaining failures in that run are all `sessionLogFound: false` — finding 3 below, not a dsh regression.

### 2.4 Edit sites

| File | Site |
|---|---|
| `patches/omo-dsh/omo-agents/src/system-prompt.ts` | `:71` `sentinelValue`, `:76` error text, `:83` replacement (`text: |-` → `prefix: |-`) |
| `patches/omo-dsh/omo-agents/concerto/agent.cordis.yml` | `:118` `text: __OMO_SISYPHUS_SYSTEM_PROMPT__` |
| `patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml` | `:39` `text: \|-` |
| `tests/omo-agents/system-prompt.test.ts` | `:38`, `:39`, `:116`, `:125`, `:130`, `:141`, `:147`, `:152` |
| `tests/omo-agents/concerto-preset.test.ts` | `:151` |
| `tests/e2e/drive.mjs` | `:82` (comment), `:807` `MOCKROLE_BLOCK_SCALARS.sisyphus.needle` |
| `scripts/concerto-mode-probe.sh` | `:561` `grep -q "prefix: \|-"` |

`scripts/verify-concerto-static.mjs` needs no assertion change (c09 checks persona *content*), but c01/c10 would not catch the regression either way.

---

## 3. P1 — the session log generation rename

`dsh-session-persistence-jsonl` gained a format-generation layer (`format.ts:50-75`, `generation.ts`, `lease.ts`, `storage.ts`; +9,771/−1,568 lines in the package). The canonical filename now carries the format version:

> Version zero retains the original suffix-only name; every later generation carries a lowercase numeric `vN` component. — `packages/session/session-persistence-jsonl/src/format.ts:50-54`

Observed on disk after a real 0.1.5-rc.1 run:

```
$DSH_HOME/sessions/--tmp-…-project--/<sessionId>/session.v3.jsonl
$DSH_HOME/storages/session_projcache/…            ← new projection cache
```

rc.6 wrote `session.jsonl` (`.npm-global/…/dsh-session-persistence-jsonl/lib/index.js:892`). The v3 format itself landed at or before `dsh-v0.1.5-alpha.1` (the `session-format-v2-to-v3` migration package first appears there; `session-format-v0-to-v1` … `v2-to-v3` are all present at HEAD).

The e2e driver's `findSessionLogs` (`tests/e2e/drive.mjs`) filtered `entry.name === 'session.jsonl'` at review time, so it returns nothing on 0.1.5-rc.1, `awaitTurnEnd` never sees a `turn/end`, and every log-derived assertion fails at once — 5 failures in `hello`, 10 in `concerto-delegation-demo`, 6 in `explore-write-denied`, 6 in `explore-nested-delegation-denied`. The mock-side assertions (`mockSawExpectedRequestCounts`, `mockRequestOnSisyphusModel`) still pass, which is the tell that the harness works and only observation is stale. (Fixed by the upgrade: `findSessionLogs` now matches the generation filename, per the fix note below.)

Fix: match the generation filename (`session.vN.jsonl`) instead of a fixed name — the format-version-aware reader the persistence package itself uses is the honest shape, since a hardcoded `session.v3.jsonl` re-breaks on v4.

---

## 4. P1 — `subagent/descriptor` v2 → v3

`SUBAGENT_DESCRIPTOR_VERSION` is `2` at `dsh-v0.1.0-rc.8` and `3` from `dsh-v0.1.2-rc.1` on (`packages/subagent/subagent/src/descriptor.ts:48`). A non-matching version is not an error — `foldSubagentDescriptor` returns `undefined` (`:210`), so an old fixture reads as "no descriptor".

The rc-era review already recorded this for 0.1.2 (its 2026-08-29 addendum, item 3), but the driver's fabricated descriptor fixture still stamped `version: 2` at review time (the `fabricatedGoodLog` fixture in `tests/e2e/drive.mjs`; the neighbouring `fabricatedNegativeChildLog` builds its events without a descriptor and needs no version change). **Landed:** the upgrade moved the fixture to `version: 3`. A real 0.1.5-rc.1 child log now reads:

```json
{"version": 3, "mode": "one-shot", "provider": "spawn", "label": "Attempt a project write"}
```

Route fields still appear only on continuable descriptors, and the driver already reads the executed route from `request/header` (`:1001-1007`) — so only the fixture version constant needs moving.

---

## 5. P1 — `dsh-tool-subagent` now injects `sessionProjections`

```ts
export const inject = ['tools', 'subagents', 'systemPrompt', 'sessionProjections']
…
ctx.sessionProjections.register(subagentModelSelectionProjectionDefinition)
```

`packages/subagent/tool-subagent/src/index.ts:45` and `:326` — `sessionProjections` is new, and the register call is unconditional, not gated behind `modelSelectionSettings`.

`@deepseek-ai/dsh-agent-loop` gained the same dependency in the same range — `static inject` went from `['agents','sessions','llm','tools','systemPrompt']` (rc.6, `packages/core/agent-loop/src/index.ts:297`) to the same list **plus `sessionProjections`** (installed `dsh-agent-loop/lib/index.js:1481-1488`), and the loop *reads* it during a turn (`sessionProjections.stateOf(session, 'turnBoundary')?.lastTurn ?? 0`, `:765`). So it is not only a presence requirement: a no-op stub changes behaviour, and a fixture must mount the real registry (`@deepseek-ai/dsh-session-projection`).

Any harness that mounts either row must now provide that service, otherwise the plugin parks in `waiting` — `tool-subagent` registers no tool, `agent-loop` leaves `ctx.agentLoop` undefined. `scripts/prove-explore-maxdepth.mjs` mounts the real stack and stubbed `agents` + `sessionPersistence` but not `sessionProjections`, so the T13 proof failed at "explore tool not visible to the depth-1 parent" — a fixture gap, not a cap regression. `scripts/prove-route-logging.mjs` had the `agent-loop` form of the same gap plus two unrelated breaks (`agentLoop.create` is now `async`; the log filename is generation-bearing); both scripts are repaired and are now covered by gate 8 (§8 P-20.7). `scripts/prove-explore-toolfilter.mjs` never needed it, because it exercises `applyChildComposition` rather than mounting the plugin row.

The `Config` schema itself is unchanged apart from two additive, optional keys (`modelSelectionSettings`, `agentOptions.reasoningEffort`), and unknown keys are still preserved — which is why the whole explore binding validates cleanly.

---

## 6. P1 — the gate suite is blind to P0

Against 0.1.5-rc.1, with the unmodified repo:

| Gate | Result |
|---|---|
| `pnpm vitest run` | 9 files, **104/104 PASS** |
| `node scripts/doctor-lite.mjs` | **4 pass, 0 fail** — `dsh 0.1.5-rc.1 (pinned 0.1.x, decision D7)` |
| `node scripts/verify-concerto-static.mjs` | **10/10 PASS** |
| `node scripts/check-docs-consistency.mjs` | **7/7 PASS** |
| `pnpm test:e2e` | 0/4 scenarios, `agent-preset/invalid` |

`doctor-lite`'s `subagent-config` check eagerly runs the installed schema — but at review time **only on the `tool-subagent-explore` row** (the `checkSubagentConfig` function in `scripts/doctor-lite.mjs`). The `persona` row was never validated, and `verify-concerto-static` c01 only proves the YAML parses. So the one schema the MVP actually broke was the one row with no schema gate.

`doctor-lite` already has everything the fix needs — it resolves the installed dsh's `node_modules` (`resolveDshNodeModules`, `:83`) and imports a plugin's `Config` from there. Generalising check 4 to "every config-bearing row of the rendered concerto template, against that row's installed `Config`" catches this class of break for every future rename, at zero extra cost:

```
schema-drift: 13 row(s) checked against <dsh install>, 1 FAIL
FAIL  persona (@deepseek-ai/dsh-persona): ValidationError: $.prefix missing required value
PASS  tool-subagent-explore (@deepseek-ai/dsh-tool-subagent)
PASS  tool-web / tool-todo / tool-fs-search / skill-filesystem / agent-instructions / …
```

(Compositions also carry rows whose packages export no `Config` at all. The shipped gate reports the exact set it skipped — on this composition `command-goal`, `command-compact`, `tool-subagent-control`, `tool-subagent-control/list-agents` and `tool-ask-user` — as *unchecked*, never as pass. **Count caveat:** the prototype below reads only the named `Config` export and so counts 13 rows, while the shipped check also accepts a class plugin's `default.Config` and counts 16. Both denominators are correct for their own rule; compare like with like.)

---

## 7. P2 — parity and derivation items (no break)

> **Status update (MVP closeout, 2026-09-11):** items 1, 2, 3 and 5 below **landed in the 0.1.5-rc.1 upgrade commit `3f84485`** (same day as this review; recorded in the companion upgrade doc and PRD §12) — both presets now carry the `present` row and `suffix: Your working directory is {{cwd}}.`, `tool-web` is `fetch: true` in both artifacts, and the five stale comments now name `deployment:persona-prefix`. Item 6 was fixed in the same upgrade (feature-probed `--no-open`); items 4 and 7 are upstream facts that needed no change. Read the entries below as the as-found record.

1. **`present` row** — `@deepseek-ai/dsh-tool-present` is new (first present at `dsh-v0.1.5-alpha.2`) and every shipped preset now ends with `- id: present` (`packages/preset/agent-presets/presets/standard/agent.cordis.yml:253-254`). Adding it is the derivation-discipline default, but the package does not exist on rc.6, so it is coupled to moving the floor — not to this fix.
2. **`tool-web` `fetch`** — `patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml:293` still says `fetch: false` while the legacy template already follows upstream at `fetch: true` (`concerto/agent.cordis.yml:307`). Cross-artifact drift inside this repo, independent of dsh.
3. **`persona.suffix`** — upstream's standard preset now sets `suffix: Your working directory is {{cwd}}.` because the row shadows the deployment suffix. Concerto shadows it to empty, exactly as it shadowed the whole deployment persona on rc.6, so this is a parity opportunity rather than a regression — and the assembled omo-sisyphus prompt is still correctly rejected for `{{` sequences (the `suffix` is separate config, so it may carry `{{cwd}}` safely if adopted).
4. **`includeShippedRoot`** — `dsh-agent-presets` now prepends its own bundled shipped root (`discovery.ts:60`, config `:110-111`) instead of `composeProfile` force-patching the row's `roots` (`apps/cli/src/profile-boot.ts:164` at rc.6; **removed** at 0.1.5-rc.1 — `roots` no longer appears anywhere in `apps/cli/src`). This retires pitfall **P-1.3**: a config-override adding a repo directory to the agent-presets row's `roots` is no longer dead, so a future install mechanism can register a preset root declaratively instead of writing files into `$DSH_HOME/.agent-presets/`.

   One caveat to record before anyone relies on it — the new root order is **shipped → configured → user** (`agent-presets/src/index.ts:178-182`), and resolution is first-root-wins per id. At rc.6 configured roots came first, so a configured root could shadow a shipped id; now the shipped set wins. Harmless for `concerto` (a unique id, and the whole point of a 5th mode), but it means a future install that ships its own `standard`-like id under a configured root would be silently outranked, not merged.

5. **Stale symbol names in our own comments** (cosmetic, but this repo treats citations as load-bearing) — five doc comments still name the pre-rename shadow section `deployment:persona`, which is `deployment:persona-prefix` from 0.1.3-alpha.2 on: `patches/omo-dsh/omo-agents/src/system-prompt.ts:19`, `patches/omo-dsh/omo-agents/src/explore-prompt.ts:13,25,38`, `tests/omo-agents/explore-prompt.test.ts:8,12`. The code is correct in every one of them (§2.3 proves the shadow still lands); only the cited identifier moved.

6. **`dsh web` now opens a browser by default — FIXED by feature-probing the flag, not by assuming it.** The handoff is new: `openBrowser: z.boolean().default(true)` (`packages/bundle/web-app/src/index.ts:61`), emitted as a second log line (`index.ts:274`), observed live as `dsh web: opening the default browser; pass --no-open to disable`. Every script here boots without `--no-open` — `cold-start.sh`, `concerto-mode-probe.sh` (three boots), `tests/e2e/drive.mjs`, `scripts/smoke-real.mjs` — so each would launch a browser on the developer's desktop, and **no gate can fail on it** (the handoff neither blocks nor changes the readiness line), which is exactly why it was easy to miss.

   The fix is deliberately **not** an unconditional `--no-open`: the flag and the handoff both start at 0.1.2, and before that the web app's commander rejects an unknown option outright (P-8.2's class — root flags and app flags are different parsers). Hardcoding it would turn every pre-0.1.2 run, including `scripts/compat-probe.sh`'s deliberate old-version probes, into `error: unknown option`, which reads as a harness bug rather than a version fact. All four boot sites now ask the app itself (`dsh --profile web --help | grep -- --no-open`) and pass the flag only when it is advertised. Observed: `cold-start: web app advertises --no-open (browser handoff suppressed)`.

   The related readiness-line change needed no fix: the URL now carries `?token=`, and every parser already tolerated it — `concerto-mode-probe.sh`'s web-RPC helper captures the token explicitly (the token→cookie handshake), `tests/e2e/drive.mjs` matches the optional token group in its readiness-line transport detection, and `scripts/smoke-real.mjs` stops at the port.

7. **`dsh.profile.patchReload` is a new manifest key, and it can silently freeze patch watching.** `web` is `'live'`, but the other four shipped templates are `'startup'` (`packages/boot/app-boot/src/profile.ts:113-129`), and `normalizeShippedProfile` rewrites an *existing* rc.6 `headless` profile in place to `'startup'` (`profile.ts:694-716`). No impact here — every MVP script uses profile `web` — and `--patch` overlays were never watched even on rc.6, so the composer semantics this project depends on are unchanged. Recorded because the failure mode is silent and would surface as a confusing "my patch file edits stopped taking effect".

---

## 8. Unchanged / verified-still-true

| MVP dependency | Status on 0.1.5-rc.1 | Evidence |
|---|---|---|
| `dsh --patch <file>` = top-level array, `insert:` form, `id:` override warns-and-skips | Unchanged — the patch engine is byte-identical (only a `1.0.6`→`1.0.7` version bump) | `apps/cli/src/args.ts:147`; `vendor/include/src/index.ts` (identical) |
| `dsh plugin --profile <p> add <dir>` | Unchanged pass-through to pnpm; no new first-class preset-install command, so this + `--patch` remains the install surface | `apps/cli/src/args.ts:190-198`, `plugin.ts` |
| Profile name `desktop` | Newly rejected (case-insensitively) on boot, dump-config and `plugin` | `apps/cli/src/args.ts:68-72,159,198` — no MVP script uses it |
| Bare package `name:` in an inserted row | Unchanged. **New:** path-like names (`./x.mjs`, absolute) inside `insert:` are now rewritten to file URLs anchored **beside the patch file** (rc.6 resolved them against the profile dir); only `insert` entries are walked, not override-by-id rows | `packages/boot/app-boot/src/index.ts:326-336,367` — the MVP's `cordis.yml` uses a bare package specifier, so it is untouched |
| `dsh --dump-config`, `dsh plugin --profile <p> add` | Unchanged | `dsh --help` on 0.1.5-rc.1 |
| `dsh --version` format | Unchanged (`0.1.5-rc.1`) | executed |
| `ctx.agentPresets.list()` / `resolve()` / `copy()` / `standingKeyFor()` / `read()`, `AgentPreset.path` | Unchanged; the five rc-era error classes became `RemoteError` codes | `agent-presets/src/index.ts:248,343,540,741,501`; `preset.ts:24-45` |
| User root `$DSH_HOME/.agent-presets` auto-appended | Unchanged (`includeUserRoot` default `true`) | `agent-presets/src/index.ts:110-111,181`; `discovery.ts:51` |
| `preset.yml` (`name` / `description` / `order`) | Byte-identical module | `agent-presets/src/metadata.ts` (no diff) |
| Preset mount/isolate realm rules | Byte-identical invariant | `agent-presets/src/mount.ts`, `invariant.ts` (unchanged hunks) |
| `agent/pre-step` waterfall + `agent.inject(message)` + `session.header.origin === 'subagent'` | Retained | `core/agent/src/runtime-types.ts:234-238,330`; observed live |
| `tool-subagent` `toolName` / `backgroundMode` / `persona` / `agentOptions` / `toolFilter` / `maxDepth` semantics | Retained; `maxDepth` enforcement and unknown-deny-name handling unchanged | `tool-subagent/src/index.ts` (diff); T12 proof PASS |
| `@deepseek-ai/dsh-llm-deepseek` + `dsh-llm-pi-ai` rows | Retained and composed | `doctor-lite` check 3 PASS |
| Web RPC transport from 0.1.2 (token → `dsh-auth-*` cookie, `/api/<ns>/<method>`) | Unchanged; readiness line now also prints `dsh web: opening the default browser; pass --no-open to disable` | live boot log |

Ruled out by inspection — each is a real API change in the range that this MVP does **not** touch:

| Change | Why it does not bite here |
|---|---|
| Shipped preset id `code` renamed to `ptc` (`3ca9c7d489`, first recorded for 0.1.2) | No MVP artifact references the id `code`; the only copy source is `agentPresets.copy('standard', 'concerto', …)` |
| `UnknownPresetError` / `PresetMountError` / `PresetExistsError` / `PresetNotWritableError` / `InvalidPresetIdError` **deleted**, replaced by `RemoteError` codes (`agent-preset/{not-found,invalid,read-only,locked}`) | No MVP file imports or `instanceof`-tests any of the five; `concerto-plugin.host.js` catches generically (`catch (e) { /* not present yet */ }`) |
| `writableRoot(roots)` → `writableRoot(roots, presetId)` | Not called by the MVP |
| `settingsNamespace()` removed; `settings.register()` now takes a plain namespace string | Not used by the MVP (`dsh-home-paths` `resolveDshHome` is the only settings-plane helper reimplemented, and its `$DSH_HOME`/`~/.dsh` rule is unchanged) |
| Roster now hard-requires `ctx.baseUrl` and injects `sessionProjections` (`agent-presets/src/index.ts:101,166-176,201`) | Satisfied by the real host composition on 0.1.5-rc.1 — the plugin booted and printed the roster, so both are present in production; this matters only to hand-built fixtures (§5 is the `tool-subagent` twin of the same fact) |
| Discovery health now resolves every row's module and marks unresolvable presets `broken` (`discovery.ts:194-257`) | Every row of the concerto composition resolves on a normal install, so the roster stays clean — confirmed live: the row appeared with its real name and **no** `broken` flag (§2.2) |
| `dsh-system-prompt` config `persona` → `personaPrefix` (+ `personaSuffix`) — **silently ignored** when stale, because unknown keys are preserved | A host-plane row upstream owns; the MVP mounts no `dsh-system-prompt` row and sets no `persona:` key anywhere |
| The explore row's `agentOptions` now forces an `llm` route preflight **per delegation** (`tool-subagent/src/index.ts:497-512`, `model-selection.ts:160-195`) instead of passing the route straight into the start request | The route does resolve: the live child ran on `deepseek/deepseek-v4-flash` and its `request/header` proves it. The project already models this — `prove-explore-maxdepth.mjs` mounts a real `LlmRuntime` with a scripted adapter *"so the preflight resolves genuinely"* |
| `agentOptions` now requires the provider to advertise an `agentOptions` capability (`tool-subagent/src/index.ts:335-339`); `spawn`/`fork` do, out-of-process backends (`acp`) do not | The explore row uses `provider: spawn` (`subagent-spawn-in-process/src/index.ts:43`) |
| `agentOptions.reasoningEffort` is now schema-validated (`.min(1)`) instead of silently preserved | Not set anywhere in the concerto composition |
| Mount-time `isolate`-realm invariant and row-activation audit | Byte-identical between the two commits; the concerto composition's group layout is unchanged |

---

## 9. Bookkeeping that trails the verification

> As-found record: every item below was executed by the 0.1.5-rc.1 upgrade on the same day (the compat row is registered and `tested`, CI pins `0.1.5-rc.1`, the READMEs name it). Kept so the trail from "no row" to "row" stays legible.

- `.omo/compat.yaml` has no row for `0.1.5-rc.1`, nor for the `0.1.3-alpha.*` / `0.1.5-alpha.*` ladder; the newest registered `dsh` is `0.1.2-rc.1` (`untested`, since 2026-09-05). `scripts/compat-probe.sh 0.1.5-rc.1` is the mechanism that produces the row.
- `.github/workflows/ci.yml:43` pins `DSH_VERSION: 0.1.0-rc.6`; `.github/workflows/compat-probe.yml:41` installs the same rc as its YAML parser provider.
- `README.md` / `README_zh-CN.md` "Key Facts" still state dsh `0.1.0-rc.6`.
- `docs/archived/dsh-0.1.2-review.md` §2 and its §1.4 conclusions remain accurate for 0.1.5-rc.1 except where this document supersedes them (preset location, the `persona` schema, the `roots` force-patch, session format v3).
- Note the D7 pin is "major 0, minor 1", so `doctor-lite` check 1 accepts `0.1.5-rc.1` without any change — the pin is not what gates this upgrade.

---

## 10. Recommended sequence

> Steps 1–6 were executed by the 0.1.5-rc.1 upgrade on 2026-09-10 (see the companion record). Kept as the as-recommended sequence, not today's todo list.

1. **Fix P0** (§2.4) — the seven sites, one key rename. This alone makes Concerto selectable on 0.1.5-rc.1.
2. **Close the gate hole** (§6) — generalise `doctor-lite` check 4 from one row to every config-bearing row, so step 1 is proven rather than assumed.
3. **Repair the observation path** (§3, §4) — generation-aware log filename in `findSessionLogs`, `version: 3` in the driver's fixtures.
4. **Repair the T13 fixture** (§5) — provide a `sessionProjections` stub where `agents` / `sessionPersistence` are already stubbed.
5. **Close the chain, not just the findings** (§8 P-20.7) — the probe and the three proofs were named in prose but run by no chain, which is why two of them had already rotted. `scripts/run-proofs.sh` is now gate 8 of `ci-local.sh` and `.github/workflows/ci.yml`.
6. **Then, and only then, decide the floor** — bump the CI pin, register the compat row from a `compat-probe` run, and fold in the P2 parity items (§7) that require ≥ 0.1.5 (`present`, and optionally `suffix` / `fetch`).

Steps 1-4 are compatible with rc.6 and can land before any pin bump; step 5 is the deliberate D7 upgrade.

---

## 11. Reproduction

```bash
# 0. throwaway dsh 0.1.5-rc.1 (the real npm artifact; the user's install is untouched)
npm install --global --prefix /tmp/dshprobe/prefix @deepseek-ai/dsh@0.1.5-rc.1

# 1. P0 as the product path sees it: installer-materialized preset + real boot
#    + session/create over the web RPC          → agent-preset/invalid (§2.2)

# 2. the MVP's own gates, unchanged repo        → 104 unit + 4/4 + 10/10 + 7/7 PASS,
#                                                  e2e 0/4 (§6)
PATH=/tmp/dshprobe/prefix/bin:$PATH pnpm vitest run
PATH=/tmp/dshprobe/prefix/bin:$PATH node scripts/doctor-lite.mjs
PATH=/tmp/dshprobe/prefix/bin:$PATH node scripts/verify-concerto-static.mjs
PATH=/tmp/dshprobe/prefix/bin:$PATH node scripts/check-docs-consistency.mjs
PATH=/tmp/dshprobe/prefix/bin:$PATH node tests/e2e/drive.mjs

# 3. P0's exact schema, per row
#    render the template with the repo's own syncConcertoPreset, then parse
#    every config-bearing row through its installed plugin's Config (§6)
```

Sandboxes used for this verification lived under `/tmp/omoprobe/` (installer-path
probe + drift gate) and `/tmp/omofix/` (the minimal-`prefix:` scratch copy used
for §2.3); none of them touch the real `~/.dsh`, and the e2e driver's own
credential digest confirmed `realDshUntouched: true` on every run.
