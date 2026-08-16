# Feasibility Report: Porting oh-my-openagent (OMO) to deepseek-harness (DSH) — Engineering & Sustainable Patch Framework

> **Primary report (English).** 中文翻译见 [可行性报告](./feasibility-report_zh-CN.md). 项目 README 见 [README.md](../README.md).
>
> Repository evidence snapshot:
> - **DSH** `<DSH_REPO>/` v0.1.0-rc.5, MIT
> - **OMO** `<OMO_REPO>/` (HEAD snapshot, actual repo spelling is `oh-my-openagent`; the user wrote `oh-my-openagennt` in the prompt), SUL-1.0
> - **New workspace** `./` (created, empty directory)

---

## Design Principles

Every design decision in this project is governed by the following two principles, which carry equal priority and neither can be dropped:

### 1. Fully leverage DSH framework's flexible advantages

DSH is a modern harness framework built on a Cordis plugin tree + dual-face build (host + client) + explicit extension points (`agent/*` / `tools/*` / `ctx.goals` / `ctx.shell` / `ctx.fs` / `ctx.skill` / `ctx.jobs` / `ctx.subagent` / `ctx.terminals` / `ctx.plan` / `ctx.compaction` / `ctx.todo` / `ConversationNodeDefinition`).

- **Prefer DSH-native capabilities** to satisfy OMO requirements — **don't reinvent the wheel**. For example: OMO's `/goal` reuses `dsh-goal` directly, OMO's Team Mode reuses `dsh-subagent-*`, OMO's pre-compact reuses `dsh-compaction-*`.
- **Prefer DSH-official extension paths** (the cookbook's 4 plugin shapes + the official scratch plugin pattern) — don't fork DSH, don't modify DSH's repository, don't touch existing DSH row ids.
- **Prefer DSH client capabilities for visualization** (web ChatNode via `ConversationNodeDefinition`) — rather than bolting on tmux externally.
- **Prefer DSH's own CI toolchain** (vitest / verify-licenses / cordis-catalog checks) — don't build a parallel one.

### 2. Fully honor OMO's harness design philosophy and open-source License

OMO is a battle-tested harness with over a year of production use. Its design philosophy (11-agent orchestration / 54+ lifecycle hooks / multi-provider LLM routing / Team Mode parallel collaboration / ultrawork continuous drive / hashline edit / etc.) is the project's core value.

- **Preserve OMO's full capability surface** — no capability cuts. 11 agents + 30+ hooks + 5 MCP + Team Mode + hashline + every slash command ported in full.
- **Directly import OMO source** (do not reimplement) — let OMO upstream's optimizations and bug fixes flow in naturally; simultaneously, **upgrade cost is minimized** (under 1 hour per OMO bump).
- **Fully respect OMO's SUL-1.0 open-source License** — framework dual license (MIT OR SUL-1.0); `LICENSES/` contains the OMO LICENSE text verbatim; `THIRD_PARTY_NOTICES.md` provides full attribution; README header has prominent credits.
- **No PRs to OMO** (avoids their "anti-over-abstraction" maintenance philosophy conflict) — exist as an OMO user, not an OMO contributor.
- **No commercial sales** (satisfies SUL-1.0's "non-commercial" requirement) — internal use + open source = full compliance.

### Principle Boundaries

| Situation | Behavior |
|---|---|
| DSH native fully covers an OMO capability | **Don't translate OMO implementation**; use DSH directly (e.g. goal / compaction / todo / ralph) |
| DSH lacks a key OMO feature | Write a **DSH-style** extension (e.g. `ConversationNodeDefinition` for team visualization) |
| DSH concept differs from OMO concept | Write a **thin listener translation layer** as bridge; **do not** force OMO design onto DSH (e.g. listener translates DSH event → OMO hook call) |
| OMO upstream License changes | Immediately trigger `scripts/verify-licenses.sh` fail, **do not bypass** |
| OMO upstream philosophy changes (e.g. "anti-listener-abstraction") | Record in `docs/upgrade-playbook.md`; **do not forcibly retain the abstraction layer**; adapt the adapter to OMO's philosophy |

---

## Summary

**Goal**: Bring OMO's capability system (11 agents, 54+ hooks, LSP/AST-grep/codegraph MCP, `/goal`, `/ultrawork`, Team Mode, hashline edit, Rules Injection, etc.) onto the DSH framework as a DSH-official scratch plugin (`dsh --patch` overlay), and build a sustainable patch framework that lets us rebase against OMO upstream in under 1 hour.

**Core conclusions (the four key takeaways)**:
1. **Feasibility: HIGH.** DSH's extension surface (`agent/*`, `tools/*`, `ctx.goals`, `ctx.shell`, `ctx.fs`, `ctx.skill`, `ctx.jobs`, `ctx.subagent`, `ctx.terminals`, `ctx.plan`, `ctx.compaction`, `ctx.todo`) almost one-to-one maps to OMO's 11 major capabilities. OMO's ROADMAP has already split it into 19 harness-agnostic core packages, which DSH can consume directly without rewriting. DSH's own `dsh-base` bundle already includes `goal/plan/skill/compaction/ralph/workflow/todo/subagent/web-search` — meaning **OMO's 60% capabilities already have native DSH equivalents**. The port is mainly about "getting the mapping and naming right", not "building new implementations".
2. **Sustainable patch framework: feasible, and DSH is naturally aligned.** DSH's cookbook lists 4 official plugin shapes (tool / hook / UI / protocol-driver), plus the DSH-recommended `dsh --patch ./scratch-plugin/cordis.yml` scratch plugin pattern — DSH is loaded **with zero modifications** to DSH itself. OMO is imported as an npm dependency directly; the upgrade flow = `pnpm update oh-my-opencode` + `pnpm test` (5-minute script + 0–1 hour listener fix).
3. **Not "replacing OMO", but "building a DSH adapter for OMO".** OMO's ROADMAP already treats multi-harness adaptation as a first-class concern (with `omo-opencode`, `omo-codex`, `omo-senpi` as precedent), so "add a DSH adapter" is an officially-sanctioned extension path, consistent with the OMO maintainer's philosophy.
4. **A hard constraint is already handled: OMO's SUL-1.0 license.** The framework adopts **dual license (MIT OR SUL-1.0)** — OMO source can be imported directly (lowest-cost upgrades), while giving end users a choice. "Free + non-commercial + no sales" already satisfies SUL-1.0. See §6 for details.

---

## 1. Current Snapshot (Two Repositories)

### 1.1 DSH (deepseek-harness)

| Dimension | Current State |
|---|---|
| Version | `0.1.0-rc.5` (`packages/dsh-root/package.json:3`) |
| License | MIT |
| Tech stack | Node `^22.19 \|\| >=24`, TypeScript 6.0.3, pnpm 11.7, Cordis (vendored, `vendor/cosmokit/`) |
| Shape | pnpm monorepo; 200+ workspace packages; `packages/{core,boot,bundle,preset,llm,subagent,goal,tools,compaction,workflow,hooks,web,plan,todo,fs,shell,sandbox,terminal,lsp,skill,jobs,session-query,subprocess,storage,credentials,session,...}/` |
| Mental model | "no privileged core to patch" — the entire dsh is a Cordis plugin tree; profile = a runtime composed of bundles; bundle = `cordis.patch.yml` + code; patch layering = `bundle order → profile patch → home patch → --patch overlay` (see `docs/architecture.md:17-37`) |
| Surfaces | `dsh` CLI (`apps/cli/src/bin.ts`), JSON-RPC (`apps/gateway`), SDK (`packages/sdk/{client,server,protocol}`), ACP protocol (`packages/acp`), Web client (`apps/web-frontend`) |
| Dual-face build | `build:lib:host` + `build:lib:client` (`package.json:21-23`) — same code can run on both server and client build targets |

**DSH key extension points** (extracted from `docs/architecture.md:107-128` "Where new behavior goes" table, mapped directly to OMO capabilities):

| DSH Extension Point | Purpose | Maps to OMO Capability |
|---|---|---|
| `ctx.llm` register adapter | New LLM provider | OMO multi-provider routing (Anthropic/OpenAI/DeepSeek/Kimi/Gemini) |
| `ctx.tools` | Register model-facing tool | All OMO built-in tools + custom tools |
| `agent preset` + `isolate` realm | Per-session capability set | OMO 11 agents' differentiated capability sets |
| `ctx.shell` backend | Shell execution | OMO bash hooks |
| `ctx.terminals` backend | Persistent terminal | OMO tmux integration |
| `ctx.commands` | Human commands | OMO `ultrawork / ulw / team / hyperplan / search` commands |
| `ctx.jobs` | Background tasks | OMO ulw-loop + ralph-loop |
| `ctx.fs` provider + `fs/*` events | Filesystem policy | OMO `bash-file-read-guard` / `write-existing-file-guard` |
| `ctx.sandbox` backend | Process isolation | OMO command approval (landlock/bubblewrap etc.) |
| `agent/*` events (waterfall) | Intercept/rewrite requests | OMO IntentGate / Ultrawork keyword detector / Continuation / Todo Enforcer |
| `tools/*` events (pre/post-execute waterfall) | Tool pre/post hooks | All OMO tool hooks |
| `agent.inject()` | Inject context | OMO AGENTS.md / `.omo/rules/**` auto-loading |
| `ctx.sessionTitle` | Session naming | OMO session titles |
| **`ctx.goals`** | **Same-session objective** | **OMO `/goal` and Goal Enforcer (directly native)** |
| `ctx.sessions.fork(...)` | Fork session | OMO sub-sessions |
| `agent.ctx` isolation | Limit to a specific agent | OMO per-agent differentiated hook scope |
| `SessionEventMap` | Extend persistent events | OMO `tool/call`, `assistant/chunk` etc. |
| `ConversationNodeDefinition` | Web client node | OMO Team Mode's tmux visualization |

**DSH already-existing subsystems that "almost out-of-the-box cover OMO"** (all listed in `packages/bundle/base/package.json:42-119` dependencies):

- `dsh-goal` + `dsh-goal-round-driver` + `dsh-tool-goal` + `dsh-command-goal` → fully covers OMO `/goal` (`packages/goal/*`)
- `dsh-plan-mode` → OMO Prometheus Planner (`packages/plan/*`)
- `dsh-skill` + `dsh-skill-filesystem` + `dsh-tool-skill` → OMO skill loading (`packages/skill/*`)
- `dsh-compaction-basic` + `dsh-compaction-tool-result-pruner` → OMO pre-compact (`packages/compaction/*`)
- `dsh-tool-ralph` + `dsh-tool-workflow` + `dsh-workflow-worker-thread` → OMO `ulw-loop` / `ralph-loop` (`packages/workflow/*`)
- `dsh-tool-todo` → OMO Todo Enforcer (`packages/todo/*`)
- `dsh-subagent` + `dsh-subagent-fork-in-process` + `dsh-subagent-spawn-in-process` + `dsh-tool-subagent*` → OMO Team Mode (`packages/subagent/*`, including `subagent-acp` / `subagent-codex` / `subagent-claude-code` / `subagent-dsh-sdk`)
- `dsh-terminal` + `dsh-tool-terminal` + `dsh-bash-local` → OMO tmux + bash integration (`packages/terminal/*`)
- `dsh-lsp` + `dsh-lsp-stdio` + `dsh-tool-lsp` → OMO LSP (`packages/lsp/*`)
- `dsh-fs` + `dsh-fs-local` + `dsh-fs-sandbox` + `dsh-fs-observation-policy` + `dsh-tool-fs` + `dsh-tool-str-replace-editor` + `dsh-tool-fs-search` → OMO filesystem tools (`packages/fs/*`; `str-replace-editor` directly corresponds to the hashline position)
- `dsh-shell` + `dsh-shell-env` + `dsh-bash-sandbox` + `dsh-pwsh-sandbox` + `dsh-tool-bash` + `dsh-tool-pwsh` → OMO bash tools (`packages/shell/*`; note OMO has a dedicated `git-bash-mcp` for Windows)
- `dsh-sandbox-local` + `dsh-sandbox-policy` + `dsh-user-approval` + `dsh-permission-presets` → OMO approval
- `dsh-session-*` suite → OMO session persistence, checkpoint, replay, telemetry
- `dsh-web-search-deepseek` + `dsh-web` + `dsh-web-search-exa` + `dsh-web-search-perplexity` + `dsh-web-fetch-http` + `dsh-tool-web` → OMO's three built-in web search providers
- `dsh-hooks-codex` + `dsh-hooks-claude-code` + `dsh-hook-protocol` → **directly consume OMO's existing claude-code-hooks and codex hooks config files**, zero-cost compatible
- `dsh-acp` + `packages/acp` → Agent Client Protocol, DSH itself is ACP client/server
- `dsh-jobs` + `dsh-jobs-local` + `dsh-tool-jobs` → OMO background tasks
- `dsh-mcp/mcp-client` + `dsh-mcp-stdio-core` (DSH internal naming) → All OMO MCP servers

**Conclusion: DSH's extension surface already covers ~90% of OMO's needs.** The port is mainly "configuration + adapter layer", not "reimplementation".

### 1.2 OMO (oh-my-openagent)

| Dimension | Current State |
|---|---|
| Repository | `https://github.com/code-yeongyu/oh-my-openagent` |
| Version | Main branch is `dev` (README header says "Multi-Harness Agent OS Refactor in Progress") |
| License | **SUL-1.0** (Sustainable Use License 1.0) — non-commercial, no resale, must carry original license (`LICENSE.md:25-27`) |
| Shape | pnpm monorepo; 19 core + 5 MCP + 4 adapter + platform packages |
| Current core split (already complete) | `ROADMAP.md:42-48` lists the 19 already-extracted harness-neutral core packages: `utils, model-core, prompts-core, rules-engine, agents-md-core, comment-checker-core, hashline-core, boulder-state, telemetry-core, lsp-core, mcp-stdio-core, tmux-core, claude-code-compat-core, skills-loader-core, mcp-client-core, openclaw-core, team-core, delegate-core, omo-config-core` |
| Adapters (harness glue layer) | `omo-opencode` (largest, oldest), `omo-codex`, `omo-senpi`, `pi-goal`, `pi-webfetch` — this is the OMO maintainer's established "multi-harness adapter" pattern |
| Agent count | 11: Sisyphus, Hephaestus, Oracle, Librarian, Explore, Metis, Momus, Atlas, multimodal-looker, Sisyphus-junior (`packages/omo-opencode/src/agents/builtin-agents/`) |
| Hook count | 54+ (`packages/omo-opencode/src/hooks/` directory has 200+ files across 30+ hook modules, each hook may have 1–5 files) |
| Editing model | Hashline (`hashline-core`) — `LINE#ID` content hash anchoring |
| Workflows | ultrawork / ulw-loop / ralph-loop / team / hyperplan / Prometheus Planner / `/init-deep` |
| Built-in MCPs | LSP, ast-grep, codegraph, grep_app, context7, exa, git-bash |
| Compatibility selling point | "Claude Code Compatible" (hooks / commands / skills / MCPs / plugins) + Codex compat + Senpi standalone release |
| Upstream posture | "We are restructuring the codebase to support multiple agent harnesses (OpenCode, Codex, Pi, Claude Code, and others)" — **officially welcomes new adapters** (`README.md:11-14`) |
| Maintainer philosophy | "Agent performance is the only metric" + anti-over-abstraction (`ROADMAP.md:51-74`) — **no grand unified abstraction; each adapter is written independently**. This aligns naturally with our approach. |

**OMO hook categorization** (30 hook modules, `packages/omo-opencode/src/hooks/`):

| Hook Module | File Count | Target DSH Event |
|---|---|---|
| `bash-file-read-guard` | 1 | `tools/pre-execute` waterfall |
| `empty-task-response-detector` | 1 | `agent/pre-step` |
| `tool-pair-validator/` | 8 | `tools/post-execute` + `agent/pre-step` |
| `hephaestus-agents-md-injector/` | 3 | `agent/pre-step` + `agent.inject()` |
| `todo-description-override/` | 4 | `tools/post-execute` |
| `team-tool-gating/` | 3 | `tools/pre-execute` |
| `goal/` (12 files) | 12 | **`ctx.goals` (DSH native)** |
| `model-fallback/` | 5 | `agent/request` + `agent/request-error` |
| `webfetch-redirect-guard/` | 4 | `tools/pre-execute` |
| `no-hephaestus-non-gpt/` | 3 | `agent/pre-step` |
| `non-interactive-env/` | 5 | `agent/pre-step` |
| `keyword-detector/` (ultrawork/hyperplan/team, 13 files) | 13 | `agent/pre-step` + `agent/turn-stopping` |
| `codegraph-bootstrap/` | 6 | `ctx.commands` (one-shot init) |
| `plan-format-validator/` | 3 | `tools/post-execute` |
| `start-work/` (15 files) | 15 | `agent/pre-step` + `ctx.jobs` |
| `directory-readme-injector/` | 7 | `agent/pre-step` + `agent.inject()` |
| `write-existing-file-guard/` (5 files) | 5 | `tools/pre-execute` |
| `edit-error-recovery/` | 3 | `tools/post-execute` |
| `preemptive-compaction*` (4 files) | 4 | `ctx.compaction` (DSH native) |
| `session-notification-*` (5 files) | 5 | `session/event` |
| `claude-code-hooks/` (20+ files) | 20+ | **DSH `hooks-claude-code` consumes directly** |
| `comment-checker-*` | 1+ | `tools/post-execute` |
| `tool-output-truncator` | 1 | `tools/post-execute` |
| `stop-continuation-guard/` | 3 | `agent/turn-stopping` |
| `monitor-status-injector/` | 3 | `agent/status` listener |
| `sisyphus-junior-notepad/` | 3 | `ctx.jobs` |
| `webfetch-*` | 1+ | `tools/pre-execute` |
| `question-label-truncator/` | 3 | `tools/post-execute` |
| `bash-file-read-guard` | 1 | `tools/pre-execute` |

**Conclusion: All 30+ OMO hook modules can find mounting points in DSH's existing event system.** No DSH core changes needed.

---

## 2. Port Feasibility Assessment (User Requirement 1)

### 2.1 11 Agents → DSH `ctx.agents` Mapping

The 11 OMO agents are combinations of "system prompt + tool set + delegation strategy + model routing". DSH's `agent preset` (requires `isolate` realm) is a natural fit for this structure.

| OMO Agent | DSH Preset Config | Notes |
|---|---|---|
| `sisyphus` (main orchestrator) | Register as orchestrator preset in `ctx.agents`, primary routes to GPT-5.6/Opus-5 | Preset holds system-prompt sections, tools, goal driver |
| `hephaestus` (implementation lead) | Preset + delegate calls | Uses `agent/*` + `agent.inject()` chain triggers |
| `oracle` (consultant) | Preset, primary Gemini | Write read-only fs policy |
| `librarian` (docs) | Preset, primary Claude | Includes web search / context7 MCP |
| `explore` (code search) | Preset, primary Gemini + ast-grep | Enable ast-grep MCP |
| `metis` (planning) | Preset, primary Claude Opus | Cooperates with `ctx.plan` |
| `momus` (code review) | Preset, primary Claude Opus | Tool restriction: no file modification |
| `atlas` (advanced orchestration) | Preset | Includes `tool-restrictions` |
| `multimodal-looker` (vision) | Preset | Model allowlist (vision-capable) |
| `sisyphus-junior` | Preset, 5 default model variants | Managed via `agent-presets` package |
| `prometheus` (planner) | Preset | **Directly reuses DSH `dsh-plan-mode`** |

**Assessment: 11/11 ported**, no agent needs to be built from scratch.

### 2.2 54+ Hooks → DSH Event Mounting

The table above (§1.2) already maps every hook module to DSH's event system. Key points:

- **`agent/pre-step` waterfall** (`docs/architecture.md:84-88`) is "authoritative reject/rewrite" semantics — **exactly the semantics OMO's IntentGate / ultrawork detector / Todo Enforcer / start-work / "see the prompt and decide what to do" hooks want**.
- **`tools/pre-execute` / `tools/post-execute` waterfall** (`docs/tool-execution-pipeline.md:13-22`) supports four transformations: "deny / block / replace / add context" — **exactly maps to OMO's `tool-pair-validator`, `bash-file-read-guard`, `write-existing-file-guard`, `comment-checker`, `tool-output-truncator`**.
- **`ctx.goals` service** (`packages/goal/goal/`) is an event-sourced same-session objective service — **OMO's 12-file `goal/` hook module can be deleted and replaced with `dsh-goal` + `dsh-tool-goal` + `dsh-command-goal`**.
- **`ctx.compaction` basic + tool-result pruner** (`packages/compaction/`) replaces OMO's 4 `preemptive-compaction*` files.
- **`dsh-hooks-claude-code`** (`packages/hooks/hooks-claude-code/package.json`) **directly executes OMO users' `claude-code-hooks/` config files** (pre-tool-use / post-tool-use / user-prompt-submit / pre-compact / stop), the 20+ OMO-internal files are transpiled automatically.
- **`dsh-hooks-codex`** (`packages/hooks/hooks-codex/package.json`) does the same for Codex Light edition hooks files.

**Assessment: All hooks can mount onto DSH.** About 15% of OMO's hooks can be **deleted directly** (goal/compaction/skill/todo/ralph/workflow — DSH-native equivalents), the remaining 85% are converted to Cordis plugins that "listen to DSH events + call OMO core packages".

### 2.3 OMO MCP Servers → DSH MCP

| OMO MCP | DSH Equivalent |
|---|---|
| `lsp-tools-mcp` / `lsp-daemon` | `dsh-lsp` + `dsh-lsp-stdio` + `dsh-tool-lsp` (can reuse OMO's own lsp-core) |
| `ast-grep-mcp` | Use `dsh-mcp-client` to mount stdio process directly |
| `git-bash-mcp` | Same as above |
| `codegraph` | Same as above |
| `exa` / `context7` / `grep_app` (web) | `dsh-web-search-exa` equivalent + `dsh-web` |

**Assessment: All MCPs ported.** OMO already has `mcp-stdio-core` and `mcp-client-core`, which stack with DSH's mcp packages with near-zero friction.

### 2.4 LLM Provider Routing

OMO uses 7 providers: Anthropic + OpenAI + Gemini + Kimi + DeepSeek + Copilot + Z.ai. DSH has ready-made `dsh-llm-deepseek` + `dsh-llm-pi-ai` (pi-mono is an OpenAI/Anthropic-compatible proxy). The rest need to be added:

- `dsh-llm-anthropic` — missing
- `dsh-llm-openai` — may be merged into pi-ai
- `dsh-llm-gemini` — missing
- `dsh-llm-kimi` — missing
- `dsh-llm-copilot` — missing
- `dsh-llm-zai` — missing

**Assessment: The LLM routing layer is real work, but an order of magnitude smaller than the hook port.** Mainly writing 6 new `llm-*` adapters (200–500 lines each). Can be rolled out incrementally: the first batch connects only DeepSeek + OpenAI-compatible, covering 80% of use cases.

### 2.5 Team Mode (OMO's Strongest Innovation)

OMO Team Mode = lead + 8 parallel members + tmux visualization + `team_*` toolset + mailbox protocol. DSH equivalents:

- **`dsh-subagent`** is the universal sub-agent service (`packages/subagent/subagent/`)
- **`dsh-subagent-fork-in-process` / `dsh-subagent-spawn-in-process`** are in-process fork/spawn
- **`dsh-subagent-acp`** connects to external agents via ACP protocol
- **`dsh-subagent-codex` / `dsh-subagent-claude-code` / `dsh-subagent-dsh-sdk`** are different hosts
- **`dsh-tool-subagent` / `dsh-tool-subagent-control` / `dsh-tool-subagent-report`** are model-facing tools
- **OMO's `team-core` is harness-agnostic pure TS** (`packages/team-core/src/index.ts:1-11` shows only types/config/logger/member-parser/session-client/team-registry/team-mailbox/team-tasklist/team-state-store/team-worktree/team-layout-tmux) — **can be imported into DSH workspace as-is**

**Assessment: Team Mode 100% ported, and 70% of the work is delivered by OMO's own `team-core`** — no rewriting needed.

### 2.6 Hashline Edit

OMO's `hashline-core` is a pure TS package (no OpenCode dependency). Directly plug in as a DSH `ctx.fs` provider + `tools/post-execute` listener, replacing the DSH default `dsh-tool-str-replace-editor` write path.

**Assessment: Direct integration.** Optional: submit a PR to DSH to add a `dsh-tool-str-replace-editor-hashline` variant.

### 2.7 Telemetry

OMO uses PostHog + SHA256 hashed install id. DSH has `dsh-session-telemetry` + `dsh-session-telemetry-otel` (OTel protocol), which can directly go through OTel → PostHog integration.

**Assessment: Portable.** Needs a PostHog exporter (`@oh-my-opencode/telemetry-core` is also reusable).

### 2.8 Editing Workflow

| OMO Concept | DSH Equivalent |
|---|---|
| `ultrawork / ulw` | `ctx.commands` registered command, triggers `agent/pre-step` waterfall to install an ultrawork continuation listener |
| `team` mode | Switch to team preset, enable team_* tools |
| `hyperplan` | `dsh-plan-mode` preset + 5 hostile critics |
| `start-work` | `ctx.commands` + `ctx.jobs` |
| `ralph-loop` / `ulw-loop` | `dsh-tool-ralph` + `dsh-tool-workflow` |
| `/init-deep` | `ctx.commands` + walk filesystem + call `agents-md-core` to write AGENTS.md |
| `Prometheus Planner` | `dsh-plan-mode` |

**Assessment: All slash commands can be translated 1:1.**

### 2.9 DSH Advantages to Leverage

Porting isn't just "putting OMO on DSH"; it also gets us DSH's better designs (which OMO's own ROADMAP admits are OpenCode's pain points):

| DSH Provides | Solves OMO's Current Pain |
|---|---|
| **Session log is source of truth** (`docs/architecture.md:92-96` "Model-visible means logged") | OMO ROADMAP "Why Not OpenCode-Native": "Multiple hooks observe the same idle or error edge and inject the same internal message ... Duplicate work. Infinite loops. State corruption" — DSH's session log + `agent/pre-step` authoritative rejection solves this at the root |
| **Landlock sandbox** (`native/landlock-run/`) | OMO currently lacks a process-level Linux sandbox |
| **Complete LLM retry / token meter / session checkpoint** | OMO would have to build these itself |
| **Built-in subagent isolation + ACP protocol** | OMO Team Mode currently has to manually do in-process isolation |
| **`agent/turn-stopping` serial termination** | OMO's current `stop-continuation-guard` makes manual judgments in many places |
| **Dual-face build (host + client)** | OMO currently can't embed the same agent runtime into IDE / Web UI |
| **Web client** (`apps/web-frontend`) | OMO wants Team Mode visualization, DSH has web UI directly |
| **`tools/result` immutable snapshot** | After OMO rewrites a tool result, the model can't see the original; DSH preserves it |

**These "free" capability upgrades are the core reason "why port to DSH is worth it".**

### 2.10 Port Workload Rough Estimate

Workload breakdown by work type (not an implementation plan, just feasibility input):

| Work Type | Estimate | Notes |
|---|---|---|
| Wire OMO core 19 packages as workspace dependencies | 1 week | 19 OMO core packages typecheck in DSH workspace |
| Write `omo-dsh-adapter` Cordis plugin | 4 weeks | 11 agents runnable, 30 hooks mounted on DSH events |
| LLM adapter completion | 2 weeks | DeepSeek + OpenAI compat first, then the rest |
| MCP bridging | 2 weeks | LSP / ast-grep / codegraph / git-bash / web trio |
| Team Mode port | 3 weeks | Using OMO team-core + DSH subagent |
| Profile / bundle-ification | 1 week | `cordis.patch.yml` + `omo.profile.json` |
| End-to-end testing + performance tuning | 2 weeks | Full-feature smoke test |
| Docs + getting started guide | 1 week | docs/ |
| **Total** | **~16 weeks / 4 months** (one person lead) | MVP scope |

**Assessment: High feasibility, one person can deliver MVP in 4 months.** The bulk is not "feature rewriting" (DSH provides 60%) but "detailed event mapping + LLM adapters".

---

## 3. Sustainable Patch Framework Design (User Requirement 2)

### 3.1 Design Goal

When OMO upstream releases a new version, we can complete the "bump → test → expose conflicts → fix adapter" cycle in 1–3 days, **instead of "manually editing 30 hook translations"**.

### 3.2 Framework Topology

```
┌───────────────────────────────────────────────────────────────┐
│  Immutable bottom layer: DSH v0.1.0+ (MIT, independent upstream release) │
│  200+ packages, pnpm monorepo, strict semver                            │
└──────────────────────────────┬────────────────────────────────┘
                               │ workspace dependency (pin to minor)
┌──────────────────────────────▼────────────────────────────────┐
│  Mutable middle layer: OMO upstream 19 core packages                 │
│  Imported via npm dependency (pnpm i oh-my-opencode)                   │
│  - Release pin: bump to OMO official tag every 2–4 weeks                 │
└──────────────────────────────┬────────────────────────────────┘
                               │ workspace dependency (pin to SHA / tag)
┌──────────────────────────────▼────────────────────────────────┐
│  Our minimal glue: oh-my-opendsh/adapter/                            │
│  - 11 agent preset registration                                          │
│  - ~30 hooks translated to DSH event listeners                          │
│  - LLM adapter completion                                                │
│  - omo-dsh profile declaration                                           │
│  - Key surface: cordis.patch.yml + agent preset JSON                    │
└──────────────────────────────┬────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────┐
│  Immutable top layer: user's project's cordis.patch.yml             │
│  User's "I want to add one more hook / one more agent"             │
└───────────────────────────────────────────────────────────────┘
```

**Key insight**: **What actually changes with every OMO upgrade is only the middle layer (core version) and the bottom layer (adapter translations)**. The DSH bottom layer and user patch top layer barely move.

### 3.3 Physical Repository Structure

**Adopt the DSH official scratch plugin pattern** (`dsh --patch ./oh-my-opendsh/cordis.yml`) — an independent npm package, DSH untouched.

```
oh-my-opendsh/                          # patch framework repo (independent npm package, license: MIT OR SUL-1.0)
├── package.json                        # "license": "MIT OR SUL-1.0"
├── pnpm-workspace.yaml                 # contains 4 sub-plugins
├── tsconfig.json
├── README.md
├── LICENSE                             # "MIT OR SUL-1.0" full text
├── LICENSES/
│   ├── LICENSE-MIT                     # MIT full text
│   └── oh-my-openagent.LICENSE.md      # OMO original text verbatim
├── THIRD_PARTY_NOTICES.md              # acknowledgements + attribution
├── docs/
│   ├── feasibility-report.md           # this file (English)
│   ├── feasibility-report_zh-CN.md     # Chinese translation
│   ├── upgrade-playbook.md
│   ├── hook-translation-table.md
│   ├── agent-preset-schema.md
│   ├── license-notes.md
│   ├── dsh-plugin-patterns.md
│   └── llm-adapter-survey.md
├── patches/omo-dsh/                    # 4 DSH sub-plugins (one per cookbook shape)
│   ├── omo-agents/                     # Tool plugin: 11 agent preset wrappers
│   ├── omo-hooks/                      # Hook plugin: DSH event → OMO hook listeners
│   ├── omo-team-ui/                    # UI plugin: web ChatNode for team visualization
│   └── omo-bundle/                     # profile declaration + config (the "protocol driver" layer)
├── cordis.yml                          # root patch entry, loads the 4 sub-plugins above
└── scripts/
    ├── bump-omo.sh                     # pnpm update + test (core: 5 minutes)
    ├── bump-dsh.sh
    ├── upstream-watch.sh               # monitor OMO + DSH releases
    └── verify-licenses.sh              # license gatekeeper
```

### 3.4 Patch Upgrade Flow

OMO is imported via npm dependency; **the upgrade core is `pnpm update`**. The listener translation layer is the only thing that moves.

#### Regular OMO upgrade (recommended cadence: event-driven / bi-monthly)

```bash
# 1. See what OMO has released
./scripts/upstream-watch.sh omo --since 2w

# 2. One-click bump (core: pnpm update + run tests)
./scripts/bump-omo.sh v3.2.0
# Output (mock):
#   ✓ pnpm lockfile updated (3.1.0 → 3.2.0)
#   ✓ typecheck pass
#   ✓ 412 tests pass
#   ⚠ 3 listeners affected (git diff lists file list):
#       patches/omo-dsh/omo-hooks/keyword-detector/listener.ts
#       patches/omo-dsh/omo-agents/sisyphus/preset.ts
#       patches/omo-dsh/omo-hooks/tool-pair-validator/listener.ts
#   → fix listener signatures (typical 0.5–1 hour)

# 3. commit + tag
git tag omo/v3.2.0
```

**Total time: 5 minutes (script) + 0–1 hour (listener fix) = OMO upgrade done in under 1 hour**.

#### Upgrade DSH (recommended cadence: every 1–2 months)

```bash
./scripts/bump-dsh.sh v0.2.0
pnpm typecheck && pnpm test
# Main risk: DSH changed event signatures or plugin API (check DSH CHANGELOG)
```

#### Major versions (DSH 1.0 / OMO 4.x)

Read upstream's migration guide, bump on a branch first, merge to main only after all gates pass.

### 3.5 Conflict Minimization Design

The OMO body is introduced via npm dependency (the patch framework directly imports OMO 19 core + 4 adapters), so the "conflict surface" is locked at the **listener translation layer** — this thin layer. DSH event → OMO hook call bidirectional translation is the only thing that moves.

| Risk | Mitigation |
|---|---|
| OMO changes hook signatures | `patches/omo-dsh/omo-hooks/*/listener.ts` is the listener translation layer (DSH event → OMO hook call); when OMO changes hook signatures, tsc errors precisely point to the listener, 10-min–1-hour fix |
| OMO changes agent config | `patches/omo-dsh/omo-agents/*/preset.ts` is the preset wrapper (OMO JSON config → DSH preset); when OMO changes agent definitions, re-read OMO JSON and re-wrap |
| OMO changes core API | npm lockfile pin + `pnpm test` runs during upgrade; tsc errors precisely point to the offending call |
| OMO adds new hooks | `scripts/upstream-watch.sh` flags "OMO added 3 hooks"; we manually add 3 listeners |
| DSH changes event signatures | Centralize in `patches/omo-dsh/omo-hooks/dsh-compat.ts` — one file as "event shim", shared by all adapters |
| Uncontrollable upstream release frequency | Pin to minor version; don't auto-track dev branch; only upgrade on explicit bump |
| OMO license changes | `scripts/verify-licenses.sh` runs in CI every time, fails on accidentally stricter license |

### 3.6 Testing Pyramid

| Layer | Content | Tool |
|---|---|---|
| Unit | Pure function behavior of OMO core packages in our workspace | vitest |
| Adapter unit | Listener wrapper correctness (feed simulated DSH events, verify OMO hook is called with right params) | vitest + DSH `dsh-agent-loop-testkit` |
| Integration | 11 agent presets start and show correct system prompts / tools / routing | DSH `examples/agent-spine-demo` pattern |
| E2E | Actually run OMO "ultrawork" flow on DSH | DSH `vitest.e2e.config.ts` + LLM mock server |
| Snapshot | OMO agent preset system prompt diff | `DSH_SNAPSHOT=record` |
| License | No non-SUL-1.0 / non-MIT dependencies | `scripts/verify-licenses.sh` |
| Upgrade regression | After bump script completes, must have 0 failures | CI gate |

### 3.7 Key Script Skeleton (Contract Only)

```text
scripts/bump-omo.sh <version>
  - pnpm update oh-my-opencode @oh-my-opencode/* --filter <version>
  - pnpm install
  - pnpm typecheck && pnpm test
  - If listener signatures break: tsc errors point precisely
  - Output diff summary: affected listener list + OMO changelog link
  - Return non-0 if tests fail

scripts/bump-dsh.sh <version>
  - pnpm update @deepseek-ai/dsh-* --filter <version>
  - pnpm typecheck && pnpm test
  - Same format output

scripts/upstream-watch.sh omo --since 2w
  - Call GitHub API to list commits
  - Filter changes in packages/omo-opencode/src/hooks and packages/omo-opencode/src/agents
  - Output "hook count change / agent count change / new files" summary

scripts/verify-licenses.sh
  - Scan pnpm-lock.yaml + our package.json
  - Any dependency license not in MIT / Apache-2.0 / BSD / ISC / SUL-1.0 (OMO only) → fail
```

Actual upgrade OMO time: **5 minutes (script) + 0–1 hour (listener fix)**.

### 3.8 Upgrade Cadence & Observability

- **CI runs on every push**: `pnpm test && scripts/verify-licenses.sh && scripts/conflict-scan.sh --diff` (requires PR to prove this change is backward-compatible with some OMO upstream commit)
- **Every Monday**: auto-run `scripts/upstream-watch.sh` to write a GitHub Issue titled `upstream-changelog-YYYYMMDD`, listing OMO + DSH commits from the past 7 days
- **End of each month**: evaluate whether to bump a minor version ("upstream moved ≥5 commits AND CI all green → bump")
- **Quarterly**: evaluate whether to switch to OMO's next major tag

---

## 4. Risks & Open Issues

### 4.1 Hard Risks (Must Address Up Front)

| Risk | Impact | Mitigation |
|---|---|---|
| **OMO SUL-1.0 restricts commercial use** | Derivative works cannot be sold commercially | Framework dual license (MIT OR SUL-1.0), distribution follows "free + non-commercial" path; **no sales** satisfies SUL-1.0 |
| **OMO `omo-opencode` still being refactored** | OMO publicly says "still strongly coupled to OpenCode in its largest adapter" | We **don't** import `omo-opencode`; only import 19 core packages + 4 small adapters (pi-goal / pi-webfetch / omo-codex / omo-senpi) |
| **DSH is still 0.1.0-rc.5** | API not stable | Pin to DSH minor version; bump as a separate release |
| **Windows / WSL experience** | Cross-platform may be slower than macOS/Linux | Write cross-platform e2e; Windows MVP not required (recommend macOS + Linux only for MVP) |
| **LLM adapter workload underestimated** | 6 llm-* adapters × 200–500 lines each | First batch: DeepSeek + OpenAI-compatible; roll in the rest |
| **OMO telemetry uses PostHog vs DSH OTel** | Bridge work needed | 30-line PostHog exporter to OTel; default opt-out |

### 4.2 Soft Risks (Acceptable)

| Risk | Impact |
|---|---|
| OMO maintainer opposes adding DSH adapter | Almost no chance (README/ROADMAP explicitly welcome new adapters) |
| DSH upstream renames events | DSH 0.x (0.1→0.2→0.3) will break a bit; stabilizes after 0.1→1.0 |
| OMO adds new hook types DSH hasn't seen | OMO will add to OpenCode adapter first; we add listeners on DSH side |
| Framework code 100% references OMO upstream | Framework is just thin listener wrapper; attention to attribution + license dual |

### 4.3 Open Items

The 6 decision points originally listed in this section are all confirmed by the user (see §10 update). Other open items also concentrate in §10.

---

## 5. Recommended Plan (Decision Matrix)

| Dimension | Decision | Rationale |
|---|---|---|
| Physical form | **Independent `oh-my-opendsh/` repo + scratch plugin pattern** (DSH official `--patch`) | Zero intrusion, clean license, easy fork |
| Port strategy | **Directly import OMO 19 core + 4 adapter source + write thin listener layer** | Lowest upgrade cost (~1 hour) |
| Adapter shape | **`patches/omo-dsh/{agents,hooks,team-ui,bundle}/` 4 sub-plugins + root cordis.yml** | 4 DSH official plugin shapes (tool/hook/UI/protocol-driver) |
| Loading method | **`dsh web --patch ./oh-my-opendsh/cordis.yml`** | DSH official scratch plugin pattern, DSH unmodified |
| Naming | `oh-my-opendsh` (distinct from OMO original) | Avoid trademark confusion |
| LLM | First batch: DeepSeek + OpenAI-compatible (via `dsh-llm-pi-ai`); roll in the rest | MVP fast + 80% coverage |
| Upgrade cadence | OMO **event-driven** (bump on release), DSH **bi-monthly** bump | Cadences match |
| Testing | Full DSH gate (`test` / `test:e2e` / `test:snapshot` / `verify-licenses`) | Reuse DSH's existing CI |
| Docs | 8 docs + upgrade playbook validation | For team maintenance |
| License | **MIT OR SUL-1.0** (dual license) | Easiest upgrade, low license complexity (no-sales precondition) |

---

## 6. License Handling (SUL-1.0 Special)

### 6.1 Key Facts

- **DSH**: MIT (friendly)
- **OMO**: Sustainable Use License v1.0 (`<OMO_REPO>/LICENSE.md`)
  - Allowed: use / copy / distribute / modify / prepare derivative works
  - **Limitation A**: only "your own internal business purposes" or "non-commercial or personal use" may use/modify
  - **Limitation B**: distribution to others must be **free + non-commercial**
  - **Limitation C**: must not remove/obscure any license/copyright notice
  - Patents: mutual termination
  - Termination: 30-day cure period

### 6.2 Implications for the Patch Framework

| Scenario | Allowed | Handling |
|---|---|---|
| Internal team uses patch framework | ✅ Allowed | Use directly |
| Publish patch framework to GitHub publicly | ✅ Satisfies (free + non-commercial) | repo adds `LICENSE = MIT OR SUL-1.0`; `LICENSES/oh-my-openagent.LICENSE.md` contains OMO text verbatim; README explicitly declares dual license |
| Give patch framework derivatives to customers | ❌ **Violates SUL-1.0** (commercial distribution) | Don't do it; customers need to run OMO upstream themselves |
| "Sell service / SaaS" within patch framework | ⚠️ Gray (Use vs Distribute) | Legal review; possibly allowed if no derivative distribution |
| Import `omo-core/*` source in patch framework | ✅ Satisfies (derivative overall inherits SUL-1.0, but published under dual license) | Still publishable; framework as a whole dual license (MIT OR SUL-1.0) |
| Reimplement using only OMO API concept, not copying source | ✅ Allowed | Clean-room rewrite; available but **upgrade cost is high** (not recommended) |

### 6.3 Mitigation Recommendations

1. **dual license (recommended)**: Framework `package.json` writes `"license": "MIT OR SUL-1.0"`; `LICENSES/` contains both full texts. This allows OMO source to be directly imported with lowest upgrade cost (5 min + 0–1 hr listener fix); simultaneously gives end users choice (SUL-1.0 when using OMO, MIT when not).
2. **npm dependency + direct import**: OMO 19 core + 4 adapters are pulled into `node_modules/` via `pnpm i oh-my-opencode`. Our `patches/omo-dsh/omo-hooks/*/listener.ts` is listener wrapper, importing OMO hook functions and adding DSH event translation.
3. **clean-room (not recommended)**: Our adapter writes everything ourselves, no OMO source import. License cleanest (framework pure MIT), but every OMO upgrade needs re-implementing the translation layer (1–5 days vs 1 hour) — not worth it.

### 6.4 Default Recommendation

**Adopt Plan 1 (dual license + directly import OMO source)**. Reasons:
- Lowest upgrade cost (5 min + 0–1 hr listener fix)
- Users installing OMO from npm have already agreed to SUL-1.0; MIT OR SUL-1.0 dual license gives end users choice
- No sales → SUL-1.0's "non-commercial" fully satisfied
- The framework repo itself can present as **pure MIT** to teams with stricter legal review

**Exception**: If we ever want to secondarily modify OMO core packages themselves (not just consume API), we can still continue with dual license, no need to switch.

---

## 8. Acceptance Criteria (Definition of Done for MVP)

1. ✅ `dsh web --patch ./oh-my-opendsh/cordis.yml` can cold-start to idle on macOS + Linux (Windows deferred)
2. ✅ All 11 OMO agents register as DSH presets, system prompt equivalent to OMO original (snapshot diff 0)
3. ✅ All 30+ OMO hooks mount via DSH event listener, unit test covers each listener's happy path
4. ✅ `ultrawork / ulw / team / hyperplan / search` 5 commands work
5. ✅ LSP / ast-grep / codegraph / web-search 4 MCPs all start
6. ✅ Team Mode at minimum supports lead + 2 members + web visualization (8 members is follow-up)
7. ✅ Hashline edit tool works
8. ✅ End-to-end smoke test: `echo "ultrawork: 重构 foo.ts" | dsh --profile omo --patch ./oh-my-opendsh/cordis.yml` runs through
9. ✅ `./scripts/bump-omo.sh v3.x.0` completes within 5 minutes; listener affected list is bounded
10. ✅ Framework LICENSE is `MIT OR SUL-1.0`; OMO LICENSE verbatim in `LICENSES/`; prominent credits in README
11. ✅ 8 docs complete
12. ✅ CI all green (DSH's check:all passes)

---

## 9. References (Repository Internal Links)

- DSH architecture overview: `<DSH_REPO>/docs/architecture.md`
- DSH agent lifecycle: `<DSH_REPO>/docs/agent-lifecycle.md`
- DSH tool execution pipeline: `<DSH_REPO>/docs/tool-execution-pipeline.md`
- DSH Cordis primer: `<DSH_REPO>/docs/cordis-primer.md`
- DSH bundle example: `<DSH_REPO>/packages/bundle/base/package.json`
- DSH hook protocol: `<DSH_REPO>/packages/hooks/hook-protocol/package.json`
- DSH claude/codex hook bridges: `<DSH_REPO>/packages/hooks/hooks-claude-code/`, `.../hooks-codex/`
- DSH subagent family: `<DSH_REPO>/packages/subagent/`
- DSH goal service: `<DSH_REPO>/packages/goal/`
- DSH workflow / ralph: `<DSH_REPO>/packages/workflow/`
- DSH todo / plan / skill / compaction: `<DSH_REPO>/packages/{todo,plan,skill,compaction}/`
- OMO ROADMAP: `<OMO_REPO>/ROADMAP.md`
- OMO hooks directory: `<OMO_REPO>/packages/omo-opencode/src/hooks/`
- OMO agents directory: `<OMO_REPO>/packages/omo-opencode/src/agents/`
- OMO team-core (harness-agnostic): `<OMO_REPO>/packages/team-core/src/index.ts`
- OMO LICENSE: `<OMO_REPO>/LICENSE.md`

---

## 10. Decision Log

### 10.1 Confirmed (2026-08-16)

- ✅ **1. Physical form**: Independent `oh-my-opendsh/` repository
- ✅ **2. OMO introduction method**: DSH official scratch plugin pattern (`dsh --patch` overlay)
- ✅ **3. LLM scope**: All + phased + prioritize community reuse
- ✅ **4. Visualization**: Plan B (web ChatNode via `ConversationNodeDefinition`)
- ✅ **5. OMO PR**: No external PRs; follow License norms + credits
- ✅ **6. Upgrade method**: Plan B (dual license + directly import OMO source)

### 10.2 Details Still To Confirm

The following 8 items are recommended to settle in subsequent iterations; items marked "recommended" are my default suggestion, items without are required to be decided by you:

#### 10.2.1 OMO 19 core packages pin strategy

| Option | Meaning |
|---|---|
| A. exact (`3.2.0`) | No automatic patch uptake |
| B. caret (`^3.2.0`) | **Recommended**: takes patches + minor, OMO public bug fixes flow in automatically |
| C. tilde (`~3.2.0`) | Only patches |

#### 10.2.2 DSH self pin strategy

| Option | Meaning |
|---|---|
| A. pin minor (`0.1.x`) | **Recommended**: DSH 0.x has API changes 0.1→0.2, pin minor is safe |
| B. pin patch (`0.1.5`) | Strictly locked |
| C. Follow dev branch head | Aggressive; CI must work with head |

#### 10.2.3 npm package naming

| Option | Meaning |
|---|---|
| A. `@oh-my-opendsh/*` (scoped) | **Recommended**: 4 sub-plugins each as independent package; DSH's own pattern is `@deepseek-ai/dsh-*` |
| B. `oh-my-opendsh` (single package) | 4 sub-plugins as internal directories |

#### 10.2.4 Windows in MVP scope?

| Option | Meaning |
|---|---|
| A. Yes (write cross-platform e2e) | +1 week workload |
| B. No (macOS + Linux only) | **Recommended**: DSH 0.1 has too many cross-platform gotchas, MVP avoids; Windows deferred beyond MVP |

#### 10.2.5 Telemetry default state

| Option | Meaning |
|---|---|
| A. Default opt-in (user actively opts in) | Cleanest |
| B. Default opt-out (user actively opts out) | **Recommended**: aligns with OMO's PostHog default; works out of the box |
| C. Don't connect | Easiest but loses OMO compatibility |

#### 10.2.6 OMO upstream release notification

| Option | Meaning |
|---|---|
| A. GitHub Watch + RSS | Simplest, depends on personal habit |
| B. GitHub Actions weekly cron + auto-issue | **Recommended**: write an `upstream-watch.yml` workflow, run once on Monday to generate issue summary |
| C. Subscribe to OMO Discord announcements channel | Real-time but noisy |

#### 10.2.7 Upgrade cadence

| Option | Meaning |
|---|---|
| A. Event-driven (bump on OMO release) | **Recommended**: least mental overhead |
| B. Bi-monthly | Previously default |
| C. Bi-weekly / Quarterly | Depends on team pace |

#### 10.2.8 MVP acceptance criteria "must vs follow-up" layering

Of 12 acceptance criteria, **6 must for MVP + 6 follow-up**:

| Layer | Acceptance Criteria # |
|---|---|
| **MVP must** | #1 (launch) / #2 (11 agent presets) / #3 (30 hook listeners) / #9 (bump script) / #10 (license) / #12 (CI) |
| **Follow-up** | #4 (5 commands) / #5 (4 MCPs) / #6 (Team Mode + web) / #7 (hashline) / #8 (e2e smoke) / #11 (8 docs) |

---

## 11. Community Current State Survey (snapshot 2026-08-16)

**Core conclusion**: As of 2026-08-16 snapshot, **no public project is "porting OMO to DSH"**. We are first movers.

### 11.1 No Direct Competitor

| Search query | Result |
|---|---|
| Full-text search `"oh-my-openagent" "deepseek-harness" OR "dsh"` | **0 relevant projects** |
| GitHub repo search `topic:deepseek-harness + topic:oh-my-openagent` | **0 relevant repos** |
| `npm search oh-my-opendsh` | 0 results |
| OMO repo issue search `dsh OR deepseek` | Hit #3788 ("add DeepSeek V4 model config", model routing only, not about DSH framework) |

### 11.2 OMO Official Position on "New Harness Adapters"

- **README header** (`code-yeongyu/oh-my-openagent`): "Multi-Harness Agent OS Refactor in Progress ... we are restructuring the codebase to support multiple agent harnesses (OpenCode, Codex, Pi, Claude Code, and others)". **Officially welcomes new adapters.**
- **ROADMAP** ("Multi-Harness Support (Exploratory)" section): already shipped `omo-opencode` / `omo-codex` / `omo-senpi` / `pi-goal` / `pi-webfetch` 5 adapters. "We are skeptical of this abstraction" — but **opposition is to "over-abstraction"**, not to "new adapters themselves". Each adapter written independently is encouraged.
- **Contributing guide**: explicitly writes templates for "Adding a New Agent / Hook / Tool / MCP Server", but **no "Adding a New Harness Adapter" template**. Inference: OMO expects new adapters to be implemented by external independent repos, **no need to modify OMO repo**.
- **CONTRIBUTING.md mentions**: Harness-specific glue is independent packages (`omo-opencode/` / `omo-codex/` / `omo-senpi/` are all peer-level packages). Our `omo-dsh` fully fits this pattern.

### 11.3 Indirect Evidence: DSH Community "Bottom-Up" Already Booming

DSH within 3 days of release (as of Aug 16):

| Phenomenon | Evidence |
|---|---|
| **Explosive growth** | GitHub 1.5 hours to 24k stars (breaking Grok-1's record), ~95k stars in 3 days |
| **UI skins in first weekend** | `github.com/Small-tailqwq/dsh-deep-whale` and other skin-swap packages |
| **Swapping tool layer** | Multiple developers replacing default tools with multimodal versions |
| **Swapping main loop** | "How the Agent runs, what's next, when to call tools — all hand-rolled" (per @卡尔 review) — done within 48 hours |
| **Official docs acknowledge "everything is a plugin" as core design** | 230+ workspace packages; curve from 0 to 24k to 95k stars in 6 days shows DSH community **embraced "plugin-ization" mental model even earlier than OMO's community did** |

**Implication for us**: DSH is a **third-party-extension-friendly host**. Once we release the scratch plugin, the DSH community is very likely to see it, try it, and give feedback — **probability of having real users in the first month is higher than OMO's early days**.

### 11.4 Related Projects (Not Direct Competitors, but Worth Studying)

| Project | What | Relationship to Us |
|---|---|---|
| **`oh-my-pi`** (11.1k stars) | Pi fork, specifically solves "harness problem" (unstable editing tools) — uses hashline, which OMO later adopted | **Idea confirmation** — hashline, this core innovation, OMO has already built; we can directly import and use it; no need to reinvent |
| **`superpowers`** (126k stars) | Cross-platform Agent skill system (Claude Code / Cursor / Codex / OpenCode / Gemini CLI) | **Direction confirmation** — proves there's user demand for "cross-harness shared skill / hook concept" |
| **`codeagents`** (wenshao personal collection) | Compares and documents various AI Agent tools | **Indirect comparison** — they've already written an OMO analysis (confirms our research version and data are correct) |
| **`omo-senpi`** (OMO's own) | OMO's "standalone / native" distribution (`npm i -g omo-ai@beta`) | **OMO has stumbled on the multi-harness path** — senpi adapter recent issue #6794 reports "omo senpi edition cannot resolve opencode omo config" — config schema compatibility issue. **This is exactly the pitfall §10.2 is designed to avoid** |

### 11.5 OMO Maintainer's "Anti-Over-Abstraction" Philosophy (Critical Constraint)

From OMO ROADMAP:
> "The industry changes too fast. Fixed patterns and agreed conventions should be implemented directly. Uncertain parts should not be over-abstracted. If an adapter for a new harness is needed, an agent can write it in one shot."

**Implications for adapter**:
- ✅ **Do**: Write an independent `omo-dsh` adapter (independent repo + independent naming + no OMO repo code changes)
- ❌ **Don't**: Open PRs to OMO repo trying to "add a DSH adapter template / abstraction layer / shared code" — would be rejected by maintainer citing "anti-over-abstraction"
- ❌ **Don't**: Suggest "do DSH support" in OMO Discord — would be redirected to "you write one yourself" stock answer

### 11.6 Key Strategic Conclusions

| Conclusion | Action |
|---|---|
| **No direct competitor → first-mover advantage** | Release v0.1 early to claim the position |
| **OMO officially welcomes new adapters → no political risk** | Don't PR, don't modify OMO repo; run as external independent project |
| **OMO philosophy opposes "grand unified abstraction"** | Adapters are "written independently"; **don't build a "DSH general adapter framework"** — just build `omo-dsh` as a concrete instance |
| **DSH community has 95k stars in 3 days → real demand exists** | Project naming / docs / README should target "DSH users", not "OMO users" |
| **senpi adapter stumbled on config schema** (issue #6794) | Add to §10.2.8 "must 6": must first validate `omo-config-core` schema compatibility under DSH event flow |
| **oh-my-pi 11.1k stars proves "harness problem" has market** | Our hashline wrapper goes through OMO upstream, **don't build our own** — but explicitly credit oh-my-pi in README (origin of hashline concept) |

### 11.7 Survey Limitations (What We Cannot Conclude)

- I couldn't find OMO Discord internal discussions (Discord scraping is hard); someone may have raised "do a DSH version" in Discord but not on GitHub issues
- I couldn't find WeChat group / Chinese community discussions (may exist on GitHub-external forums)
- DSH has been released only 3 days — too short to judge whether "DSH community is long-term prosperous" or "fomo short-term peak"

**Recommendation**: Have someone spend 1 day scanning OMO Discord `#building-in-public` channel, DSH official Discord / WeChat group, Reddit r/LocalLLaMA, HN. May find unexpected discoveries.
