# Installing Concerto Mode

> How to install the oh-my-opendsh Concerto Mode (协奏模式) MVP on your own DeepSeek Harness.
> Verified against the current DSH runtime on 2026-09-04 (`concerto_verify` 22/22 PASS,
> `standingKeyFor` mounted OK). Full implementation & verification report:
> [docs/concerto-current-dsh_zh-CN.md](./concerto-current-dsh_zh-CN.md) (Chinese).

## The two pieces

| Piece | Files | Lifetime | Purpose |
|---|---|---|---|
| **Persistent preset (core) — dsh ≥ 0.2 (declaration)** | the one declared row `preset-concerto` inside `${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml` (the web profile — the installer pins `web`) | On disk, survives restarts | Day-to-day use: 0.2 does not read `.agent-presets/` — a preset exists only once declared |
| Dynamic plugin (optional) | `patches/omo-dsh/omo-agents-current/concerto-plugin.host.js` | Process-local, gone on restart | Verification / observability / demo (`concerto_verify`, `concerto_demo`, route enforcement, Hard Blocks injection) |

The base experience needs only the preset: the conductor persona and the explore binding
(persona + `toolFilter` + `maxDepth:1` + dual route) are all baked into the two YAML files.

> 🚫 **dsh < 0.2 is not supported (ruling D17, 2026-10-06, commit `2323658`).** The installer's
> former **0.1.x filediscovery face** — writing `agent.cordis.yml` + `preset.yml` into
> `${DSH_HOME:-$HOME/.dsh}/.agent-presets/concerto/` — was **deleted in P4.5-T13**: the version gate
> now **refuses dsh < 0.2 by name** (`error: unsupported dsh version '<ver>' — dsh < 0.2 is NOT
> supported: 0.1.x compatibility was dropped by ruling D17 …`), **before any write**, exit 1. The
> declaration face is the installer's only face: on 0.2.x the two YAML files are fetched to a temp
> dir and their content is inlined (re-indented by 8 spaces) into the declared row — nothing is left
> behind in `.agent-presets/`. Manual 0.1.x steps survive below only as labelled legacy reference.

> 📌 **Scope of this channel (2026-09-14).** Everything below installs the **1+1 preset** — the
> conductor plus the single `explore` delegation binding — served from the frozen
> [`patches/omo-dsh/omo-agents-current/`](../patches/omo-dsh/omo-agents-current/) archive
> (the verbatim v0.2 dynamic-plugin snapshot). The **full 11-agent roster**
> (conductor `sisyphus` + 10 delegation targets, see the roster route & env override table in
> the [README](../README.md#roster-routes--env-override-table--名册路由与-env-覆盖表)) lives in the
> development tree only and ships with a **future release**; whether and when it is pushed down
> this installer channel is a **Phase 7** release-cadence decision, not a promise of this
> document. Until then, the install paths here and the development tree's roster are expected to
> differ, and that difference is recorded rather than papered over.

## Prerequisites

- A DeepSeek Harness with the agent-preset system (the shipped `standard` preset's package set).
- Credential `DEEPSEEK_API_KEY` configured in DSH credentials (used by both routes).
- The pi-ai catalog model `deepseek-flash` (adjust `agentOptions` otherwise — see "Adapting").
- **dsh ≥ 0.2**: `python3` **with the PyYAML module** on PATH (`pip install pyyaml`). On the
  declaration face the installer renders the row with python3 + PyYAML, guards for it before it
  creates anything, and stops with `error: PyYAML required for the dsh >= 0.2 install path
  (pip install pyyaml)` when the module is missing.
  ~~The dsh 0.1.x face needs neither — unless you set `EXPLORE_PROVIDER` / `EXPLORE_MODEL`, which
  is the case that already needed `python3`.~~ *(P4.5-T13, ruling D17: there is no 0.1.x face
  anymore — the installer refuses dsh < 0.2 by name before it checks anything else.)*
   macOS' built-in python3 ships **without** PyYAML. (Mirrors the `Requirements:` block in the
  installer's own usage header.)

## Quick install

All three options run the same `scripts/install-concerto.sh`, and the script branches on your dsh
version (`dsh --version`) before it installs anything: **dsh ≥ 0.2** gets the preset rendered as a
single **declaration row** in `${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml`;
~~**dsh 0.1.x** installs the two YAML files into `.agent-presets/concerto/` the classic way.~~
**dsh < 0.2 is REFUSED by name** — `error: unsupported dsh version '<ver>' — dsh < 0.2 is NOT
supported: 0.1.x compatibility was dropped by ruling D17 …`, exit 1, nothing written
*(P4.5-T13; the classic 0.1.x face was deleted, it is not an install path anymore)*. If the version
cannot be detected (dsh not on PATH, or `dsh --version` output without a MAJOR.MINOR), the installer
stops with a loud error and tells you to install dsh first — it never guesses. On the 0.2 face it
also does **not** create `profiles/web/package.json` — dsh writes that itself on first boot.

> 🚫 **The one shape the installer refuses outright (dsh ≥ 0.2).** If your `cordis.patch.yml` already
> carries a `- id: preset-concerto` row **nested inside the `config:` list of a group row**, the installer
> stops with a loud `error: … nested INSIDE the config: list …` and exits non-zero. "Group row" means what
> dsh means by it — `group: true`, `name: cordis:group` **or** `name: @deepseek-ai/cordis-plugin-group`,
> the same union dsh's own profile preflight applies (dsh-app-boot/lib/index.js:2100), and the installer
> never asks for less than that. The two `name:` spellings are the ones that mount their `config:` list on
> their own, so a nested preset row goes live even with no `group:` key at all.
> The installer cannot replace that nested row without rewriting your own group structure, and installing
> beside it would leave two presets with `config.id: concerto` — which makes the harness throw
> `Duplicate agent preset: concerto` on the next boot. Nothing is written when it refuses: not one byte of
> the patch file, not even a `.bak`. **Fix it by hand**: delete that nested row, then re-run the installer.
> (A nested preset row that is `disabled: true` is *not* a problem and installs fine — a disabled row is
> never registered, so it can never duplicate — **unless that same row also carries a truthy `group:`**: the
> Loader's disabled test short-circuits on `options.group` (cordis-plugin-loader/lib/index.js:335), so a row
> that declares itself a group **ignores its own `disabled`** and still mounts, and that row is refused like
> any other nested declaration. A plugin row that merely has `id: preset-concerto` inside
> its own `config:` block is that plugin's own config id, not a preset declaration, and is left alone too.)

**Option A (fastest) — one line** (script pinned to the v0.2 tag; pi-ai route enabled by default):

```bash
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh
```

(fallback direct link: `https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.2/scripts/install-concerto.sh`)

Optional env vars (prefix the pipe): `NO_PIAI=1` (skip the pi-ai settings section),
`EXPLORE_PROVIDER`/`EXPLORE_MODEL` (override the explore second route). `CONCERTO_TAG` and
`DSH_HOME` keep the same meaning on the (single, declarative) install face:

```bash
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | NO_PIAI=1 EXPLORE_MODEL=my-model sh
```

Then restart the harness, make sure the `DEEPSEEK_API_KEY` credential is configured, and pick
Concerto Mode in a new session. (Manual equivalent steps for no-network machines are in the
details at the bottom.)

**Option B (most native) — send this prompt to any DSH session and let DSH install itself**:

```
Install the oh-my-opendsh Concerto Mode on this machine (pinned to tag v0.2):
1) Run `dsh --version` first. If its output carries no MAJOR.MINOR, stop and report — do not guess the version.
   - dsh < 0.2: STOP and report that dsh < 0.2 is not supported (ruling D17, dropped 2026-10-06) —
     do NOT create .agent-presets/concerto/ and do NOT download preset files there; that face was
     deleted and the official installer refuses these versions by name.
   - dsh >= 0.2: 0.2 does not read .agent-presets/ — download the same two files to a temp dir instead, then
     append exactly ONE `- insert:` block declaring `- id: preset-concerto` (name: '@deepseek-ai/dsh-agent-preset';
     config: id concerto, name/description from preset.yml, plugins: the agent.cordis.yml content re-indented by
     8 spaces) to ${DSH_HOME:-~/.dsh}/profiles/web/cordis.patch.yml. Back that file up first as
     cordis.patch.yml.bak.<timestamp>. Only add/replace the preset-concerto row — never delete or rewrite the
     other rows, they are the user's own.
   If any download fails, stop and report the error — do not invent content.
2) If ${DSH_HOME:-~/.dsh}/settings.yaml has no llm-pi-ai section yet, append
   providers.deepseek.apiKeyEnv=DEEPSEEK_API_KEY; do not touch the rest of the file.
3) Check whether the DEEPSEEK_API_KEY credential is configured (key name only — never print the value); warn me clearly if it is missing.
4) When done, report: how to select the mode after a restart, and the 30-second self-check steps. Do not modify any other file.
```

**Option C (repeatable / configurable) — the repo script** (idempotent; the same script as
Option A, run locally with custom parameters):

```bash
git clone https://github.com/linletian/oh-my-opendsh.git
sh oh-my-opendsh/scripts/install-concerto.sh
NO_PIAI=1 EXPLORE_MODEL=my-model sh oh-my-opendsh/scripts/install-concerto.sh   # custom second route
```

### What these options actually change (plain words)

Three facts first:

1. Concerto Mode has two players: the **conductor** (your session's default model) and the
   retrieval helper **explore** (its own separate model route).
2. The default install already gives explore its route: the pi-ai `deepseek` provider +
   `deepseek-flash` (fast, cheap).
3. Every option only changes "who does the work" on the explore side. The conductor, the
   read-only restrictions, and the no-nested-delegation cap are untouched.

| Option | Plain explanation |
|---|---|
| nothing (default) | explore rides the pi-ai route + v4-flash. Fast and cheap; the logs show conductor and explore on two different providers (matches the original design). |
| `EXPLORE_MODEL=xxx` | Swaps the **model** explore uses. This is the knob that really changes answers: a stronger model (e.g. v4-pro) → deeper, slower, pricier retrieval; a smaller one → faster, cheaper, possibly shallower. |
| `EXPLORE_PROVIDER=xxx` | Swaps explore's **route identity**. Mostly needed only without pi-ai; for the same model, answers barely change — only the config surface and the logged route pair differ. |
| `NO_PIAI=1` | Tells the installer "**don't touch my settings.yaml**". ⚠️ Broken on its own: the preset still points explore at the pi-ai route, which is not activated → every delegation errors out. Pair it with `EXPLORE_PROVIDER` (and ideally `EXPLORE_MODEL`). |

How to confirm what actually took effect? Delegate once, then read the child session log (the filename carries the session-format generation — `session.vN.jsonl[.zstd]`, `v3` today; older sessions keep the bare `session.jsonl[.zstd]`):

```bash
unzstd -c ~/.dsh/sessions/<workspace-dir>/<child-session-id>/session.v3.jsonl.zstd | grep request/context
# {"provider":"deepseek","model":"deepseek-flash"}                ← default (pi-ai)
# {"provider":"deepseek-official","model":"deepseek-flash"}       ← same-provider fallback
```

Three common combinations (plain-words annotations):

```bash
# Default: pi-ai route + v4-flash, least to think about
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh

# No pi-ai: official deepseek route + the same model — answers barely differ from the default
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | NO_PIAI=1 EXPLORE_PROVIDER=deepseek-official EXPLORE_MODEL=deepseek-flash sh

# Cheaper/faster: give explore a smaller model
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | EXPLORE_MODEL=<smaller-faster-model> sh
```

<details><summary>Manual 3-step (LEGACY reference — dsh 0.1.x, UNSUPPORTED since ruling D17, 2026-10-06)</summary>

> ⚠️ **This whole block is historical reference for machines still holding a pre-cutover 0.1.x
> install.** dsh 0.1.x is **not a supported target** (ruling D17): the installer refuses it by name
> and there is no supported way to install Concerto Mode on it. These steps mirror the **0.1.x
> filediscovery** face the installer used to have; on dsh ≥ 0.2 nothing inside `.agent-presets/` is
> ever read — a preset must be *declared*: run Option A/C instead, the installer
> edits `profiles/web/cordis.patch.yml` for you (idempotent, touches only the `preset-concerto` row,
> backs the file up first).

1. **Copy the preset** (from a clone, or copy the two files from any machine that has them):

   ```bash
   git clone https://github.com/linletian/oh-my-opendsh.git
   mkdir -p ~/.dsh/.agent-presets/concerto
   cp oh-my-opendsh/patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml ~/.dsh/.agent-presets/concerto/
   cp oh-my-opendsh/patches/omo-dsh/omo-agents-current/preset/preset.yml ~/.dsh/.agent-presets/concerto/
   ```

   (`~/.dsh` = `${DSH_HOME:-$HOME/.dsh}`; the roster reports each preset's real path.)

2. **Activate the pi-ai route** (explore's independent model route) — append to
   `~/.dsh/settings.yaml`:

   ```yaml
   llm-pi-ai:
     providers:
       deepseek:
         apiKeyEnv: DEEPSEEK_API_KEY
   ```

   and make sure `DEEPSEEK_API_KEY` is present in DSH credentials.

3. **Restart the harness**, open a new session, and pick **协奏模式 (Concerto Mode)** from the
   preset selector (it appears beside standard/minimal/code/cordis).

</details>

## 30-second verification

- Ask "what is your role?" → the agent should describe itself as a conductor (orchestrator).
- Ask "which delegation tools do you have?" → only `call_omo_explore` (the generic
  `subagent`/`subagent_fork` rows were removed in the P-19 hardening).
- Give it a retrieval task ("what does this repo's README say?") → the conductor calls
  `call_omo_explore`, the child reads and reports back, the conductor summarizes. The child
  has no `write`/`edit` and cannot delegate.

The install aims at one result on the one supported runtime: on dsh ≥ 0.2 the preset is a declared
row of `profiles/web/cordis.patch.yml` — there is no second install face (the 0.1.x filediscovery
face was deleted at P4.5-T13; dsh < 0.2 is refused by name, ruling D17). The 0.2 face has been
verified once on a real machine — a real fresh install in a sandbox plus a real harness start on
**dsh 0.2.x** — and there the preset came back in the roster (one of 5 entries), its row carried
no `broken` marker, and a session was created with that preset. That run did **not** exercise the
runtime behaviour the three checks above describe — including the delegation check: the sandbox had
no real credentials. Those checks are yours to run.

The full 9-step manual verification is in
[docs/concerto-current-dsh_zh-CN.md §10](./concerto-current-dsh_zh-CN.md).

## Adapting to your environment

- **dsh ≥ 0.2**: the live preset lives in `profiles/web/cordis.patch.yml` — change the explore route
  by editing the `agentOptions` of the `preset-concerto` row there, or just re-run the installer with
  `EXPLORE_MODEL=…` (idempotent: it replaces only that row and backs the file up first).
- **No pi-ai**: edit the `tool-subagent-explore` row's `agentOptions` in the preset to your
  second route, e.g. `provider: deepseek-official`, `model: <your smaller model>` (AC-5 only
  requires the two route pairs to differ).
- **Different pi-ai catalog**: adjust `agentOptions.model` accordingly.
- **Different credential variable**: change `apiKeyEnv` in the settings section.

## Optional: the dynamic plugin

In **your own session**, `cordis_define` + `cordis_run` the archived
`concerto-plugin.host.js` (see [its README](../patches/omo-dsh/omo-agents-current/README.md))
to get `concerto_verify` (22 assertions), `concerto_demo` (real delegation chain + negative
probes), route enforcement/observability and Hard Blocks injection. The plugin is
session-owned and process-local — other users need nothing from it.

## Uninstall

- **LEGACY dsh 0.1.x installs (pre-cutover; unsupported since ruling D17 — the installer no longer
  installs there, it refuses < 0.2 by name)**: delete `${DSH_HOME:-$HOME/.dsh}/.agent-presets/concerto/`
  to clean up what a pre-cutover installer left behind — the preset leaves the roster on that runtime.
- **dsh ≥ 0.2 (declaration)**: ⚠️ do **not** `rm -rf` `${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml`
  — that file carries your own rows too. Either hand-edit it and remove ONLY the `- insert:` block whose
  row is `- id: preset-concerto`, or restore the newest **installer** backup:
  `cp "$(ls -t ${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml.bak.[0-9]* 2>/dev/null | head -n 1)" ${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml`
  — the glob is timestamp-shaped (`.bak.` followed by a digit) **on purpose**: plain `.bak.*` would also
  match archives *you* named, like `cordis.patch.yml.bak.mine`, and `ls -t` would hand one of those
  back instead of the backup the installer actually wrote (the installer's own prune never eats those,
  so they can sit there for years and be the newest file in the directory).
  — but **only when a backup actually exists**: the installer backs the patch file up only if that
  file was already there, so a machine you installed on once has backups and a first-time install
  leaves none. With no backup the glob expands to nothing and the command becomes `cp "" …`, which
  prints a stat error about the empty path. It does not damage the file — it just reads like a
  broken install — so on a first install, hand-edit the file and delete the `- insert:` block that
  carries `- id: preset-concerto`.
- Optionally remove the `llm-pi-ai` section from `settings.yaml`.
- The dynamic plugin disappears with its session (or `cordis_stop` / `cordis_undefine`).
