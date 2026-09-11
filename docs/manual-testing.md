# Manual Testing Guide — Concerto MVP (dsh 0.1.5-rc.1)

> **Primary document (English).** 中文翻译见 [手工测试验证指南](./manual-testing_zh-CN.md).

This guide is for a developer who wants to run the MVP by hand **today**. Every command below was verified against the scripts in this repo. Do not invent flags or paths.

## Current state

- MVP closed: FR-1~FR-8 implemented, V1~V4 verified.
- All automated gates green on **dsh 0.1.5-rc.1** (the CI pin, decision D7; L1 + L2 both green — see [the upgrade record](./dsh-0.1.5-rc.1-upgrade.md)).
- The intermediate 0.1.2-alpha.1 verification line was superseded by the 0.1.5-rc.1 bump (2026-09-10, PRD §12).
- Manual testing adds the **real-model layer** (PRD §8 L4): delegation compliance, answer quality, and the AC-4/AC-5 eyeball checks that mock-LLM e2e cannot prove.

## What the MVP is

A 5th run mode, 协奏模式 / **Concerto Mode** (preset id `concerto`, trust user):

- Conductor `omo-sisyphus` + read-only subagent `omo-explore` (tool name `explore`, toolFilter deny `[write, edit, explore]` — post-F1 the delegation tool itself is also denied, so the child physically cannot delegate; maxDepth 1 stays as defense-in-depth).
- Hard-blocks injection + dual model routes.
- Defaults: sisyphus on `deepseek-official/deepseek-v4-pro` (env `OMO_SISYPHUS_PROVIDER` / `OMO_SISYPHUS_MODEL`); explore on `deepseek/deepseek-v4-flash` via llm-pi-ai (env `OMO_EXPLORE_PROVIDER` / `OMO_EXPLORE_MODEL`).

## Prerequisites

1. Node 24 and pnpm.
2. dsh 0.1.5-rc.1 on PATH:

   ```bash
   dsh --version
   ```

   Install exactly the pinned version, the way CI does: `npm i -g @deepseek-ai/dsh@0.1.5-rc.1`.

3. Repo deps installed (`node_modules` present).
4. ONE DeepSeek API key covering BOTH routes, available either as:

   ```bash
   export DEEPSEEK_API_KEY=sk-...
   ```

   or already stored in `~/.dsh/.credentials.yaml` (present on this machine — smoke-real reads it READ-ONLY and injects it into its sandbox).

> **CAUTION:** install the pinned version exactly (`@0.1.5-rc.1`); never substitute another rc. rc-era lesson (P-11.5): a naive `npm i -g @deepseek-ai/dsh@0.1.0-rc.6` pulled rc.8 deps and broke the stack — see P-11.5 for the validated-tree restore recipe.

## L0 — Zero-cost automated smoke

No key needed. Re-run any time. These touch neither the real `~/.dsh` nor real keys (sandboxed HOME/XDG/DSH_HOME).

```bash
scripts/ci-local.sh
```

Expected: `PASS — all 8 gates green` (typecheck, 104 unit tests, mock-LLM e2e 4 scenarios, doctor-lite, licenses, concerto static, docs consistency, session-free proofs).

```bash
scripts/cold-start.sh
```

Sandboxed cold boot: installs the plugin into a sandbox profile, boots `dsh --profile web --patch ./cordis.yml --port 0`, checks `[omo-agents] loaded` + no plugin errors. Expected: `cold-start: PASS`.

```bash
scripts/concerto-mode-probe.sh
```

Roster/persona/routes/T11/T12/T13/T15 real-path proofs. Expected: `concerto-probe: PASS`.

## L1 — Real-model smoke (recommended first real run)

The MVP's designed manual gate:

```bash
scripts/smoke-real.sh
```

What it does: boots a real dsh (web profile + plugin) in a throwaway sandbox, seeds `settings.yaml` wiring BOTH routes at PRODUCTION endpoints (no mocks), creates a concerto session, asks sisyphus a retrieval question that nudges delegation to explore, then extracts eyeball evidence.

- **Credentials:** env `DEEPSEEK_API_KEY` wins; else `~/.dsh/.credentials.yaml` is read READ-ONLY and injected into the sandboxed child. Neither present → prints exact setup and exits 2 immediately (never hangs). Cost well under $1. `DEEPSEEK_BASE_URL`, if exported, is STRIPPED (note printed; `DSH_SMOKE_RESPECT_BASE_URL=1` to keep).
- **Safety:** real `~/.dsh` is never written (sandbox redirects + sha256 digest before/after, volatile `sessions/` and `storages/` excluded); the key is never printed, logged, or written.
- **Output to review:** `.omo/evidence/smoke-real-<timestamp>/transcript.md` — THE human checklist:
  - AC-4 four chain events: sisyphus calls explore → explore runs → result returns → sisyphus summarizes.
  - AC-5 two distinct routes.
  - Plus `verdict.json`, `routes.json` (every request/header of parent+child), `session-parent.jsonl` / `session-child.jsonl`, `boot.log`, `llm.providers.json`.
- A previous real run's evidence exists at `.omo/evidence/smoke-real-2026-08-21-*` as a reference of what a PASS looks like.
- Note: `smoke-real.mjs` is transport-adaptive (rc.6 flat web-RPC and the 0.1.2+ token transport; P-11.6 closed).

## L2 — Interactive web-UI testing (real dsh home)

### One-time setup

a. Install the plugin into the real profile (this MUTATES the real profile dir — designed usage):

```bash
dsh plugin --profile web add ./patches/omo-dsh/omo-agents
```

b. Register the explore-seat provider route (keyless; the key resolves per-request from `~/.dsh/.credentials.yaml` via `apiKeyEnv`). Your real `~/.dsh/settings.yaml` currently LACKS this — add:

```yaml
llm-pi-ai:
  providers:
    deepseek:
      apiKeyEnv: DEEPSEEK_API_KEY
```

### Boot

```bash
dsh --profile web --patch ./cordis.yml --port 4173
```

Readiness line: `dsh web: http://127.0.0.1:4173/?token=<launch-token>` — on the pinned 0.1.5-rc.1 the URL carries a launch token (browser auth since 0.1.2): open the FULL URL.

### Mode + model selection

Pick 协奏模式 / Concerto Mode in the mode selector (user-trust roster entry; its name comes from our `preset.yml` — client locale fallback, P-1.2). In the model selector pick **deepseek-v4-pro** for the canonical run: your saved default is deepseek-v4-flash, but AC-5 wants two DISTINCT routes, and the explore child is pinned to `deepseek/deepseek-v4-flash` via the plugin's agentOptions — so run the conductor on v4-pro.

### Five scenarios

Session JSONL lives at `$DSH_HOME/sessions/<path>/session.vN.jsonl` (the filename carries the session-format generation — `v3` today; an at-rest file may be compressed to `session.vN.jsonl.zstd`, in which case pipe through `unzstd -c` first).

**S1 — Basic chat.** Ask anything; the conductor answers directly. Verify: the session log's `request/header` shows provider `deepseek-official`, model `deepseek-v4-pro`:

```bash
grep -E '"(provider|model)"' "$DSH_HOME/sessions/<path>/session.v3.jsonl"
```

**S2 — Delegation chain (AC-4/AC-5).** Type e.g. `用 explore 查一下这个仓库的 README 讲了什么，然后总结给我`. Expected: conductor calls the `explore` tool → a CHILD session runs the read-only research → result returns → conductor summarizes. Verify: a second (child) session JSONL appears; the parent's `subagent/descriptor` + the child's `request/header` show the child route `deepseek/deepseek-v4-flash` ≠ parent `deepseek-official/deepseek-v4-pro`:

```bash
grep -E '"(provider|model)"' "$DSH_HOME/sessions/<parent>/session.v3.jsonl" "$DSH_HOME/sessions/<child>/session.v3.jsonl"
```

**S3 — Read-only denial (AC-6a).** Ask: `让 explore 把 README 里的项目名改成 foo`. Expected: the explore child's write/edit attempts are rejected with `Error: unknown tool "write"` (or `"edit"`); the file on disk is unchanged. Verify in the child JSONL tool results:

```bash
grep 'unknown tool' "$DSH_HOME/sessions/<child>/session.v3.jsonl"
```

Caveat (P-21, accepted threat-model boundary): the denial is **tool-layer**, not a capability boundary — the child keeps `bash`, so a determined or instructed child can still write via the shell, or even spawn an unrestricted `dsh` process (P-21.2). Do not read S3 as "writes are unreachable".

**S4 — No nested delegation (AC-6b).** Ask: `让 explore 自己再派一个子代理去查别的东西`. Expected (post-F1): the `explore` tool is **physically absent** from the child's roster, so the child either reports honestly that it has no delegation tool, or its attempt is rejected `Error: unknown tool "explore"` — both pass; the depth cap (`maxDepth: 1`) stays on as defense-in-depth but no longer fires. Verify in the child JSONL:

```bash
grep 'unknown tool' "$DSH_HOME/sessions/<child>/session.v3.jsonl"
```

**S5 — Hard-blocks persona (FR-6).** The explore child carries the injected Hard Blocks + Anti-Patterns sections; behaviorally it should cite read-only discipline when refusing writes (observable in its replies). The injection itself is boot-logged as `[omo-agents]` markers and proven structurally by the L0 probe.

### Shutdown

Ctrl-C (SIGTERM exits 0).

## Acceptance map

| Test | Covers |
|---|---|
| L0 | AC-1 / AC-7 / AC-8 + V1 |
| L1 | AC-4 / AC-5 (+ AC-6 partial if the model attempts writes/nesting) |
| S1 | AC-2 / AC-3 |
| S2 | AC-4 / AC-5 + V2 |
| S3 | AC-6a + V4 (toolFilter) |
| S4 | AC-6b + V4 (delegation-tool absence + maxDepth backstop) |
| S5 | FR-6 + V3 |

AC-9 (docs) already closed at MVP sign-off.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `patch: entry "omo-agents" not found` / patch silently skipped | Plugin not installed into the profile — run L2 step (a). (P-8: mounting needs the insert form in `cordis.yml`, already correct; the name resolves from the profile dir.) |
| Concerto missing from the mode roster | Plugin didn't load: check the boot log for `[omo-agents] loaded`; the preset is authored into `$DSH_HOME/.agent-presets/concerto/` at boot — check that dir exists. |
| `MISSING_CREDENTIAL` naming the explore route | The `settings.yaml` llm-pi-ai block (L2-b) is missing, or the key is absent from credentials.yaml/env. |
| `ctx.agents.get is not a function` anywhere | You have rc.8 deps (naive reinstall pulled them) — see P-11.5 for the validated-tree recipe. |
| Boot readiness line carries `?token=` | Normal on the pinned 0.1.5-rc.1 (browser auth since 0.1.2): open the FULL URL; our harness scripts already handle both transports. |
| Conductor can fetch URLs directly | tool-web `fetch: true` follows the shipped standard preset (derivation discipline; both concerto presets carry it since the 0.1.5-rc.1 parity pass) — intended behavior, see the preset's derivation ledger. |

## Current limits

- The DSH pin is 0.1.5-rc.1 (done 2026-09-10, PRD §12); the earlier "CI flip to 0.1.2" item is superseded, and `smoke-real.mjs`'s transport adaptation landed with it (P-11.6 closed).
- Shrinkwrap of the dsh dep tree is a registered follow-up (P-11.5).
