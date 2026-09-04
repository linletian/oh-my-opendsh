# Installing Concerto Mode

> How to install the oh-my-opendsh Concerto Mode (协奏模式) MVP on your own DeepSeek Harness.
> Verified against the current DSH runtime on 2026-09-04 (`concerto_verify` 22/22 PASS,
> `standingKeyFor` mounted OK). Full implementation & verification report:
> [docs/concerto-current-dsh_zh-CN.md](./concerto-current-dsh_zh-CN.md) (Chinese).

## The two pieces

| Piece | Files | Lifetime | Purpose |
|---|---|---|---|
| **Persistent preset (core)** | `${DSH_HOME:-$HOME/.dsh}/.agent-presets/concerto/` — `agent.cordis.yml` + `preset.yml` | On disk, survives restarts | Day-to-day use: Concerto Mode appears in the preset picker |
| Dynamic plugin (optional) | `patches/omo-dsh/omo-agents-current/concerto-plugin.host.js` | Process-local, gone on restart | Verification / observability / demo (`concerto_verify`, `concerto_demo`, route enforcement, Hard Blocks injection) |

The base experience needs only the preset: the conductor persona and the explore binding
(persona + `toolFilter` + `maxDepth:1` + dual route) are all baked into the two YAML files.

## Prerequisites

- A DeepSeek Harness with the agent-preset system (the shipped `standard` preset's package set).
- Credential `DEEPSEEK_API_KEY` configured in DSH credentials (used by both routes).
- The pi-ai catalog model `deepseek-v4-flash` (adjust `agentOptions` otherwise — see "Adapting").

## Quick install

**Option A (fastest) — one line** (script pinned to the v0.1 tag; pi-ai route enabled by default):

```bash
curl -fsSL https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.1/scripts/install-concerto.sh | sh
```

Optional env vars (prefix the pipe): `NO_PIAI=1` (skip the pi-ai settings section),
`EXPLORE_PROVIDER`/`EXPLORE_MODEL` (override the explore second route):

```bash
curl -fsSL https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.1/scripts/install-concerto.sh | NO_PIAI=1 EXPLORE_MODEL=my-model sh
```

Then restart the harness, make sure the `DEEPSEEK_API_KEY` credential is configured, and pick
Concerto Mode in a new session. (Manual equivalent steps for no-network machines are in the
details at the bottom.)

**Option B (most native) — send this prompt to any DSH session and let DSH install itself**:

```
Install the oh-my-opendsh Concerto Mode on this machine (pinned to tag v0.1):
1) Using the shell, create ${DSH_HOME:-~/.dsh}/.agent-presets/concerto/ and download
   https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.1/patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml
   and .../preset.yml there with `curl -fsSL`. If any download fails, stop and report the error — do not invent content.
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

<details><summary>Manual 3-step (equivalent reference)</summary>

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

The full 9-step manual verification is in
[docs/concerto-current-dsh_zh-CN.md §10](./concerto-current-dsh_zh-CN.md).

## Adapting to your environment

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

- Delete `${DSH_HOME:-$HOME/.dsh}/.agent-presets/concerto/` — the preset leaves the roster.
- Optionally remove the `llm-pi-ai` section from `settings.yaml`.
- The dynamic plugin disappears with its session (or `cordis_stop` / `cordis_undefine`).
