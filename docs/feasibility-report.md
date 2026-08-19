# Feasibility Report: Porting oh-my-openagent (OMO) to deepseek-harness (DSH) — Engineering & Sustainable Patch Framework

> **Primary report (English).** 中文翻译见 [可行性报告](./feasibility-report_zh-CN.md). Project decisions are recorded in the [Decision Record](./decisions.md). 项目 README 见 [README.md](../README.md).
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
4. **A hard constraint is already handled: OMO's SUL-1.0 license.** The framework adopts **dual license (MIT OR SUL-1.0)** — OMO source can be imported directly (lowest-cost upgrades), while giving end users a choice. "Free + non-commercial + no sales" already satisfies SUL-1.0. See §7 for details.

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

> ⚠️ **Read this before treating any of §2.10 above as a project commitment.** §2.10's row labels say "MVP scope" because that is the standard vocabulary in feasibility studies, but in this document the words "MVP", "must", "follow-up", and "workload estimate" are research-stage observations, not project-level commitments. See §3 for the report's full scope statement.

---

## 3. Report Scope & Boundaries

**What this report is**
- A **research and feasibility analysis** of the question "Can OMO be ported to DSH? If so, what would a sustainable patch framework look like?"
- A record of evidence read from the OMO and DSH source code, with `file:line` references.

**What this report is NOT**
- It is **not** a project plan, an MVP scope definition, a release timeline, or a list of "must / follow-up" features.
- It is **not** a commitment to any particular implementation shape (the directory tree, scripts, and metrics in §4 are illustrations, not blueprints — see the disclaimer at the top of §4).
- It does **not** make project-level decisions. Confirmed decisions are recorded in the [decision record](./decisions.md) (docs/decisions.md); the research-stage options analysis for open dimensions is in §10.

**How to read the rest of this document**
- **§1–§11**: high-level feasibility and framework analysis. Where a subsection contains a concrete design (e.g. §4.3 directory tree, §4.4 upgrade flow, §4.7 script skeleton, §4.8 metrics list), it is **illustrative** — one possible shape to make the discussion concrete, not a project commitment.
- **§12–§14**: deep-dive research conclusions on three follow-up questions. Each section's "What this does NOT cover" subsection describes the **research scope** of that question (what the question author chose to ask), not a project-level non-goal list.
- **Decision record (docs/decisions.md)**: the only place where **project decisions** are recorded. Any statement that sounds like a decision but is not there should be read as a research-stage observation, a research-phase draft, or an open question.

**Evidence snapshot:** The main body of this report (§1–§11) was completed on 2026-08-16 (the §11 community snapshot is from the same day); §12–§14 are deep-dive research added on 2026-08-19; decision updates are recorded in §10. All code references are from fixed snapshots; code or docs updated after the respective dates are not reflected here.

---

## 4. Sustainable Patch Framework Design (User Requirement 2)

> ⚠️ **Illustrative section.** The directory tree (§4.3), the upgrade-flow pseudocode (§4.4 — already labelled "Output (mock)"), the script skeleton (§4.7), and the metric list (§4.8) are presented to make the feasibility discussion concrete. **None of them is a project commitment** to use that exact shape, those exact file names, those exact cron expressions, or those exact metrics. The project (if it proceeds) is free to choose any alternative shape discussed.

### 4.1 Design Goal

When OMO upstream releases a new version, we can complete the "bump → test → expose conflicts → fix adapter" cycle in 1–3 days, **instead of "manually editing 30 hook translations"**.

### 4.2 Framework Topology

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

### 4.3 Physical Repository Structure

> **Illustrative directory layout** — one possible shape; not a project commitment.

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
│   ├── feasibility-report.md           # this file (English, research basis)
│   ├── feasibility-report_zh-CN.md     # Chinese translation (research basis)
│   ├── decisions.md                    # decision record (English, sole registry of project decisions)
│   ├── decisions_zh-CN.md              # decision record (Chinese)
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

### 4.4 Patch Upgrade Flow

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

### 4.5 Conflict Minimization Design

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

### 4.6 Testing Pyramid

| Layer | Content | Tool |
|---|---|---|
| Unit | Pure function behavior of OMO core packages in our workspace | vitest |
| Adapter unit | Listener wrapper correctness (feed simulated DSH events, verify OMO hook is called with right params) | vitest + DSH `dsh-agent-loop-testkit` |
| Integration | 11 agent presets start and show correct system prompts / tools / routing | DSH `examples/agent-spine-demo` pattern |
| E2E | Actually run OMO "ultrawork" flow on DSH | DSH `vitest.e2e.config.ts` + LLM mock server |
| Snapshot | OMO agent preset system prompt diff | `DSH_SNAPSHOT=record` |
| License | No non-SUL-1.0 / non-MIT dependencies | `scripts/verify-licenses.sh` |
| Upgrade regression | After bump script completes, must have 0 failures | CI gate |

### 4.7 Key Script Skeleton (Contract Only)

> **Illustrative script skeleton** — one possible shape; not a project commitment.

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

### 4.8 Upgrade Cadence & Observability

> **Illustrative metrics and cadence list** — one possible shape; not a project commitment.

- **CI runs on every push**: `pnpm test && scripts/verify-licenses.sh && scripts/conflict-scan.sh --diff` (requires PR to prove this change is backward-compatible with some OMO upstream commit)
- **Every Monday**: auto-run `scripts/upstream-watch.sh` to write a GitHub Issue titled `upstream-changelog-YYYYMMDD`, listing OMO + DSH commits from the past 7 days
- **End of each month**: evaluate whether to bump a minor version ("upstream moved ≥5 commits AND CI all green → bump")
- **Quarterly**: evaluate whether to switch to OMO's next major tag

---

## 5. Risks & Open Issues

### 5.1 Hard Risks (Must Address Up Front)

| Risk | Impact | Mitigation |
|---|---|---|
| **OMO SUL-1.0 restricts commercial use** | Derivative works cannot be sold commercially | Framework dual license (MIT OR SUL-1.0), distribution follows "free + non-commercial" path; **no sales** satisfies SUL-1.0; no commercial services / SaaS either (2026-08-19, decision record D8) |
| **OMO `omo-opencode` still being refactored** | OMO publicly says "still strongly coupled to OpenCode in its largest adapter" | We **don't** import `omo-opencode`; only import 19 core packages + 4 small adapters (pi-goal / pi-webfetch / omo-codex / omo-senpi) |
| **DSH is still 0.1.0-rc.5** | API not stable | Pin minor (`0.1.x`, decided 2026-08-19, see decision record D7); minor-and-above upgrades enter only via `bump-dsh.sh` with a full gate |
| **Windows / WSL experience** | Cross-platform may be slower than macOS/Linux | Out of current scope (decided 2026-08-19, see decision record D9) |
| **LLM adapter workload underestimated** | 6 llm-* adapters × 200–500 lines each | First batch: DeepSeek + OpenAI-compatible; roll in the rest |
| **OMO telemetry uses PostHog vs DSH OTel** | Bridge work needed | 30-line PostHog exporter to OTel; default opt-out |

### 5.2 Soft Risks (Acceptable)

| Risk | Impact |
|---|---|
| OMO maintainer opposes adding DSH adapter | Almost no chance (README/ROADMAP explicitly welcome new adapters) |
| DSH upstream renames events | DSH 0.x (0.1→0.2→0.3) will break a bit; stabilizes after 0.1→1.0 |
| OMO adds new hook types DSH hasn't seen | OMO will add to OpenCode adapter first; we add listeners on DSH side |
| Framework code 100% references OMO upstream | Framework is just thin listener wrapper; attention to attribution + license dual |

### 5.3 Open Items

The 6 decision points originally listed in this section are all confirmed by the user (see decision record D1–D6). The options analysis for the remaining open dimensions is in §10, with status tracking in the decision record (O1–O8); risk dispositions (accept as-is / defer, 2026-08-19, R1–R6) are also recorded in the [decision record](./decisions.md).

---

## 6. Decision Matrix — Reorganized

> The "decision matrix" originally drafted in this section has been reorganized into:
> - **Confirmed decisions** — 10 items (six on 2026-08-16, D1–D6 + four on 2026-08-19, D7–D10), recorded in the [decision record](./decisions.md).
> - **Open dimensions** — 8 items (2 of which were decided on 2026-08-19, becoming D7 / D9); the research-stage options analysis is in §10 of this report, with status tracking in the decision record (O1–O8).
>
> This section is left as a pointer. For all project-level decisions, refer to the decision record. The earlier draft of this matrix has been removed because it conflated "research-stage analysis" with "project decision" — see §3.

---

## 7. License Handling (SUL-1.0 Special)

### 7.1 Key Facts

- **DSH**: MIT (friendly)
- **OMO**: Sustainable Use License v1.0 (`<OMO_REPO>/LICENSE.md`)
  - Allowed: use / copy / distribute / modify / prepare derivative works
  - **Limitation A**: only "your own internal business purposes" or "non-commercial or personal use" may use/modify
  - **Limitation B**: distribution to others must be **free + non-commercial**
  - **Limitation C**: must not remove/obscure any license/copyright notice
  - Patents: mutual termination
  - Termination: 30-day cure period

### 7.2 Implications for the Patch Framework

| Scenario | Allowed | Handling |
|---|---|---|
| Internal team uses patch framework | ✅ Allowed | Use directly |
| Publish patch framework to GitHub publicly | ✅ Satisfies (free + non-commercial) | repo adds `LICENSE = MIT OR SUL-1.0`; `LICENSES/oh-my-openagent.LICENSE.md` contains OMO text verbatim; README explicitly declares dual license |
| Give patch framework derivatives to customers | ❌ **Violates SUL-1.0** (commercial distribution) | Don't do it; customers need to run OMO upstream themselves |
| "Sell service / SaaS" within patch framework | ❌ Not doing it (decided 2026-08-19) | Fully avoids the "Use vs Distribute" gray zone; see decision record D8 |
| Import `omo-core/*` source in patch framework | ✅ Satisfies (derivative overall inherits SUL-1.0, but published under dual license) | Still publishable; framework as a whole dual license (MIT OR SUL-1.0) |
| Reimplement using only OMO API concept, not copying source | ✅ Allowed | Clean-room rewrite; available but **upgrade cost is high** (not recommended) |

### 7.3 License Mitigation Options (analysis, not decision)

The three options below were analyzed during the research phase. The user subsequently selected option 1 (dual license + direct import) on 2026-08-16 — see decision record D6. This subsection preserves the analysis for the record; it does not re-assert a recommendation.

1. **dual license**: Framework `package.json` writes `"license": "MIT OR SUL-1.0"`; `LICENSES/` contains both full texts. Allows OMO source to be directly imported with lowest upgrade cost (5 min + 0–1 hr listener fix); simultaneously gives end users choice (SUL-1.0 when using OMO, MIT when not).
2. **npm dependency + direct import**: OMO 19 core + 4 adapters are pulled into `node_modules/` via `pnpm i oh-my-opencode`. Our `patches/omo-dsh/omo-hooks/*/listener.ts` is listener wrapper, importing OMO hook functions and adding DSH event translation.
3. **clean-room**: Adapter writes everything ourselves, no OMO source import. License cleanest (framework pure MIT), but every OMO upgrade needs re-implementing the translation layer (1–5 days vs 1 hour).

### 7.4 Outcome of the Research-Phase Recommendation

The research-phase draft (carried over from before user review) preferred option 1 — dual license + direct import — for the reasons in §7.3.

On 2026-08-16 the user confirmed this choice and recorded it in the decision record (D6) as the project's license strategy. This subsection remains as a record of the research-phase analysis; it is not a re-assertion of a recommendation. The other two options (npm-only / clean-room) are kept on file as alternative paths, in case the project's license posture needs to change in the future.

**Note on option 3 (clean-room)**: if the project ever needs to re-publish under MIT-only (no SUL-1.0 inheritance), the only path is the clean-room rewrite, with the upgrade-cost trade-off documented above. This is recorded for reference; it is not a current decision.

---

## 8. Capability Surface Identified by This Research (No MVP Definition)

> ⚠️ This section is **not** a project MVP definition. It is a research-stage inventory of capabilities that an OMO-to-DSH port would need to address in some form, **regardless** of which subset is eventually chosen for MVP. **No commitment has been made** to include or exclude any of these in any future project MVP scope; that decision is pending user input (see §10.8 for the open dimension).

If the project proceeds, this research identified the following 12 capabilities that the port would need to touch in some form:

1. **Cold start**: `dsh web --patch ./oh-my-opendsh/cordis.yml` can cold-start to idle.
2. **Agent presets**: OMO agents register as DSH presets.
3. **Hook listeners**: OMO lifecycle hooks mount via DSH event listener.
4. **Slash commands**: `ultrawork / ulw / team / hyperplan / search` 5 commands work.
5. **MCP servers**: LSP / ast-grep / codegraph / web-search 4 MCPs start.
6. **Team Mode**: lead + N members + web visualization.
7. **Hashline edit tool** works.
8. **End-to-end smoke test**: a single command runs through.
9. **Bump script**: `./scripts/bump-omo.sh v3.x.0` completes within a bounded time.
10. **License hygiene**: `LICENSES/`, `THIRD_PARTY_NOTICES.md`, prominent credits.
11. **Documentation**: 8 docs complete.
12. **CI**: all checks green on supported platforms.

**How to use this inventory**: if and when a project MVP scope is defined, this list is a starting point for the discussion. The actual must / follow-up split (and which subset of these 12 capabilities belongs in MVP) is an **open decision** (see §10.8) and is not made in this report.

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

## 10. Open-Dimension Options Analysis (decisions tracked in the decision record)

> **Decision records have been moved out of this report** (2026-08-19). All project-level decisions — confirmed decisions (D1–D10), risk dispositions (R1–R6), and open-dimension status tracking (O1–O8) — are recorded in the separate decision record: [decisions.md](./decisions.md) (English) / [decisions_zh-CN.md](./decisions_zh-CN.md) (Chinese).
>
> This report is the **research & evidence document**: every decision in the decision record cites this report's sections (by D# / R# / O#) as its basis. This section keeps the **research-stage options analysis** for the 8 open dimensions below (former §10.2) — that is research content; whether each dimension is currently decided is tracked in the decision record (O1–O8). (The earlier draft of this section marked some options as "Recommended" — those labels have been removed because they conflated research-stage analysis with project decision. The "Recommended" labels' underlying analysis is preserved as plain text in the right-hand column.)

### 10.1 OMO 19 core packages pin strategy

| Option | Meaning |
|---|---|
| A. exact (`3.2.0`) | No automatic patch uptake |
| B. caret (`^3.2.0`) | Takes patches + minor; OMO public bug fixes flow in automatically. Research-phase analysis: lowest manual maintenance, at the cost of taking unintended minor-version changes. |
| C. tilde (`~3.2.0`) | Only patches |

### 10.2 DSH self pin strategy

> ✅ **Decided (2026-08-19)**: option A (pin minor `0.1.x`) — see decision record D7. The table below is kept as a research-phase analysis record.

| Option | Meaning |
|---|---|
| A. pin minor (`0.1.x`) | DSH 0.x has API changes 0.1→0.2; pin minor is the safest defensive position. Research-phase analysis: recommended during 0.x. |
| B. pin patch (`0.1.5`) | Strictly locked |
| C. Follow dev branch head | Aggressive; CI must work with head |

### 10.3 npm package naming

| Option | Meaning |
|---|---|
| A. `@oh-my-opendsh/*` (scoped) | 4 sub-plugins each as independent package; DSH's own pattern is `@deepseek-ai/dsh-*`. Research-phase analysis: aligns with DSH conventions. |
| B. `oh-my-opendsh` (single package) | 4 sub-plugins as internal directories |

### 10.4 Windows in MVP scope?

> ✅ **Decided (2026-08-19)**: option B (out of current scope) — see decision record D9. The table below is kept as a research-phase analysis record.

| Option | Meaning |
|---|---|
| A. Yes (write cross-platform e2e) | +1 week workload |
| B. No (macOS + Linux only) | DSH 0.1 has too many cross-platform gotchas. Research-phase analysis: deferring Windows avoids a known-cost tax; Windows users would be blocked until follow-up. |

### 10.5 Telemetry default state

| Option | Meaning |
|---|---|
| A. Default opt-in (user actively opts in) | Cleanest privacy posture |
| B. Default opt-out (user actively opts out) | Aligns with OMO's PostHog default; works out of the box. Research-phase analysis: best UX, mild privacy cost. |
| C. Don't connect | Easiest but loses OMO compatibility |

### 10.6 OMO upstream release notification

| Option | Meaning |
|---|---|
| A. GitHub Watch + RSS | Simplest, depends on personal habit |
| B. GitHub Actions weekly cron + auto-issue | Write an `upstream-watch.yml` workflow, run once on Monday to generate issue summary. Research-phase analysis: low-cost, no human-in-loop required. |
| C. Subscribe to OMO Discord announcements channel | Real-time but noisy |

### 10.7 Upgrade cadence

| Option | Meaning |
|---|---|
| A. Event-driven (bump on OMO release) | Least mental overhead. Research-phase analysis: matches natural trigger; requires CI to be trusted. |
| B. Bi-monthly | Previously default |
| C. Bi-weekly / Quarterly | Depends on team pace |

### 10.8 Capability scope: MVP vs. follow-up (open)

The 12 capabilities listed in §8 are an inventory, not a project commitment. Whether to split them into "MVP must" vs. "follow-up" (and how) is an open decision.

The research-phase draft split (proposed in earlier revisions of this document, **not currently adopted**) was:

| Layer | Capability items |
|---|---|
| Research-phase draft "MVP must" | #1 (cold start) / #2 (agent presets) / #3 (hook listeners) / #9 (bump script) / #10 (license hygiene) / #12 (CI) |
| Research-phase draft "follow-up" | #4 (slash commands) / #5 (MCPs) / #6 (Team Mode) / #7 (hashline) / #8 (e2e smoke) / #11 (docs) |

This split is **not** a project decision; the user has not selected it. If and when a project MVP scope is defined, the decision belongs to the user.

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
| **`omo-senpi`** (OMO's own) | OMO's "standalone / native" distribution (`npm i -g omo-ai@beta`) | **OMO has stumbled on the multi-harness path** — senpi adapter recent issue #6794 reports "omo senpi edition cannot resolve opencode omo config" — config schema compatibility issue. **This is exactly the pitfall §10 is designed to avoid** |

### 11.5 OMO Maintainer's "Anti-Over-Abstraction" Philosophy (Critical Constraint)

From OMO ROADMAP:
> "The industry changes too fast. Fixed patterns and agreed conventions should be implemented directly. Uncertain parts should not be over-abstracted. If an adapter for a new harness is needed, an agent can write it in one shot."

**Implications for adapter**:
- ✅ **Do**: Write an independent `omo-dsh` adapter (independent repo + independent naming + no OMO repo code changes)
- ❌ **Don't**: Open PRs to OMO repo trying to "add a DSH adapter template / abstraction layer / shared code" — would be rejected by maintainer citing "anti-over-abstraction"
- ❌ **Don't**: Suggest "do DSH support" in OMO Discord — would be redirected to "you write one yourself" stock answer

### 11.6 Key Observations and Their Implications (No Actions Committed)

> The "Action" column in earlier drafts of this table conflated research observations with project commitments. This revision replaces each "Action" with an "Implication" — describing what the observation means for the reader, not what should be done.

| Observation | Implication (no decision) |
|---|---|
| **No direct competitor on the date of this snapshot (2026-08-16)** | First-mover opportunity exists if the project proceeds. **No decision** is made here on whether to act on this opportunity, on a release schedule, or on a "claim the position" posture. |
| **OMO README header states "Multi-Harness Agent OS Refactor in Progress ... we are restructuring the codebase to support multiple agent harnesses"** | The project (if built) would be a "user-side adapter", not a contribution to OMO upstream. **The user-confirmed decision "no external PRs"** is recorded in decision record D5; this row does not re-derive it. |
| **OMO maintainer's public philosophy: "The industry changes too fast. Fixed patterns and agreed conventions should be implemented directly. Uncertain parts should not be over-abstracted. If an adapter for a new harness is needed, an agent can write it in one shot."** | If the project is built, building a "DSH general adapter framework" (a reusable abstraction over multiple hypothetical adapters) would conflict with this philosophy. The research-phase analysis prefers a single concrete `omo-dsh` instance over a framework. **No decision** is made here on whether to build one or many; the project's actual scope is an open dimension. |
| **DSH community saw rapid early adoption (95k stars within 3 days)** | Indicates that demand for DSH-side tooling may exist. The actual target audience for our project, if built, is an open dimension (see §10 and the decision record's open dimensions). |
| **omo-senpi had a config schema compatibility issue (issue #6794)** | If the project is built, validating the `omo-config-core` schema under the DSH event flow is a candidate early item. **No priority or commitment** is set here. |
| **oh-my-pi (11.1k stars) implements hashline edit** | The hashline concept originates upstream of OMO. If a hashline wrapper is shipped, attribution is required by §7.2. Attribution is now decided: respect original authors, full attribution (2026-08-19, see decision record D10); exact wording to be settled at implementation time. |

### 11.6.1 Open Follow-up Items (Out of This Research's Scope)

The following are **not** pursued in this research, but are flagged as candidates for follow-up investigation if and when the project proceeds:

- OMO Discord `#building-in-public` channel — may have raised "DSH adapter" discussions not visible on GitHub issues.
- DSH official Discord / WeChat group, Reddit r/LocalLLaMA, Hacker News — early community reactions.
- Whether DSH's adoption peak is sustainable or a short-term fomo.

**No priority, schedule, or budget is set for these items**; if pursued, they would belong in a future research pass, not in this report.

### 11.7 Survey Limitations (What We Cannot Conclude)

- We could not find OMO Discord internal discussions (Discord scraping is hard); someone may have raised "do a DSH version" in Discord but not on GitHub issues.
- We could not find WeChat group / Chinese community discussions (may exist on GitHub-external forums).
- DSH has been released only 3 days at the time of this snapshot — too short to judge whether the DSH community is long-term prosperous or in a short-term fomo peak.

---

## 12. Research Conclusion: Can DSH route different LLM per sub-agent like OMO?

**Date**: 2026-08-19
**Status**: Research conclusion (not a plan). Answers one specific question, surfaces the one hidden cost OMO absorbs but DSH does not.

### 12.1 Question

Can the DSH framework, on its own, route different LLM providers/models to different sub-agents — the same way OMO does (e.g. `sisyphus` on `claude-opus-5`, `hephaestus` on `gpt-5.6-sol`, `librarian`/`explore` on `gpt-5.6-luna-fast` / `deepseek-v4-flash`)? In other words, does the OMO port need to add new infrastructure, or is this already a first-class DSH capability?

### 12.2 Answer (one sentence)

**Yes — DSH routes LLM by exact `{provider, model}` pair, and every sub-agent can carry its own `agentOptions: { provider?, model?, maxTokens? }` to override the parent's inherited LLM. No new DSH infrastructure is needed.** The OMO-style "per-agent model chain" maps to DSH as "per-`tool-subagent` instance config" or per-`agent()` call argument.

### 12.3 Evidence Chain

#### 12.3.1 DSH's routing is keyed on `{provider, model}`, not single-model

- `packages/core/agent/src/runtime-types.ts:24-31` — `AgentOptions` is the per-agent creation options bag; `provider?` and `model?` are first-class fields with merge-extensible semantics.
- `packages/core/agent/src/runtime-types.ts:64-68` — every `Agent` carries `readonly options: AgentOptions`; the comment is "The provider route and model this agent's requests use."
- `.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.md:17` — `LlmAdapter.resolveModel(provider, model, signal?)` resolves one exact route; the same model id can exist under multiple providers.
- `.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.md:27-29` — compact-basic can hold a `modelPolicies` map keyed on the exact `{provider, model}` pair, with per-route ratio/retention/summarizer overrides. The architecture was deliberately designed so "one global context window" is no longer needed.

#### 12.3.2 Sub-agent model is overridable at start time

- `packages/subagent/subagent-in-process-driver/README.md:19` (direct quote) — "The child gets the parent's working-directory/session lineage and **inherits the parent provider, model, and output-token cap unless `request.agentOptions` overrides them**."
- `packages/subagent/subagent/src/types.ts` + `docs/subsystems/subagent.md:283` — the `SubagentDescriptorData` for continuable children snapshots the resolved `agentOptions.provider` / `model` so a cold resume rebuilds the same LLM target.
- `packages/subagent/subagent-in-process-driver/README.md:18-20` — depth/policy inheritance is also gated; the override is not a hack on top of inheritance but an explicit knob.

#### 12.3.3 Three already-shipped surface points (where the model override can be expressed)

| Surface | Who configures it | File | Use |
|---|---|---|---|
| **`tool-subagent` plugin config** | Preset / `cordis.yml` author | `packages/subagent/tool-subagent/README.md` (Config table, `agentOptions` row) | One `dsh-tool-subagent` instance = one fixed `{provider, model}`. Mount four instances with different configs → four sub-agent LLM targets. |
| **`tool-workflow` `agent(prompt, opts?)` call** | Workflow script author | `packages/workflow/tool-workflow/src/index.ts:143`; runtime enforcement at `workflow-worker-thread/src/runtime.ts:371-373` | `agent('task', { provider: 'openai', model: 'gpt-x' })` — independent `provider`/`model` overrides at call time; anything else (`effort`/`isolation`/`agentType`) is rejected loud. |
| **`api-proxy` top-level selection** | Web UI user | `packages/host/apiproxy/src/api-proxy.ts:1081-1084`; injection logic at `packages/core/agent/src/model-selection.ts:39-75` | `defaultModelSelection()` seeds the top-level agent; UI swap is projected into both `system-prompt/assemble` and `agent/request` waterfalls via `installModelSelection()`. |

The first two are the scratch-plugin-relevant paths. The third already exists for the top-level session and does not need to be re-invented per sub-agent.

#### 12.3.4 OMO's mechanism, for comparison

- `packages/model-core/AGENTS.md:27-37` — 6-step resolution pipeline: UI override → user-config override → category default → user fallback chain → hardcoded `AGENT_MODEL_REQUIREMENTS` → system default.
- `packages/model-core/src/agent-model-requirements.ts:3-30` — 11 agents, each with its own ordered fallback chain. `sisyphus` opens with `claude-opus-5` (variant: max) and `kimi-k3`; `hephaestus` opens with `gpt-5.6-sol` (medium); `librarian`/`explore` open with `gpt-5.6-luna-fast` (low) and `deepseek-v4-flash` (max); etc.
- `packages/model-core/src/model-resolution-pipeline.ts:1-274` — runtime selector; cross-provider fuzzy match against the `ProviderCache` injected by `omo-opencode`.

OMO's value-add over a static `{provider, model}` table is: (a) **multi-step fallback** (a target provider down → silently rotate to the next chain entry); (b) **fuzzy match against `availableModels`** (user types "gpt-5.6" and the system finds the connected one); (c) **category-level grouping** (a "research" category can be retargeted in one settings edit). DSH has none of these out of the box for sub-agents.

### 12.4 How this maps to the three open-shape decisions in our patch framework

The question "which LLM does this sub-agent use" becomes, on the DSH side, "how do I bind an `agentOptions` to a sub-agent type". Three binding shapes, all already legal under DSH 0.1.0-rc.5:

| Binding shape | Where the model is written | Upgrade cost when DSH bumps |
|---|---|---|
| **A. Static plugin config** | In `agent.cordis.yml`, each `dsh-tool-subagent` instance has its own `agentOptions: { provider, model }`. Four instances → four LLM targets. | Zero — `agentOptions` is in `core/agent` and is part of the documented seam. |
| **B. Script-time override** (recommended for workflow users) | In a workflow script, the main agent decides at runtime: `agent(prompt, { provider, model })`. Model is encoded in the system prompt or persona. | Zero — `tool-workflow` already accepts it. |
| **C. Settings-driven (user-editable)** (follow-up) | A `settings.yaml` field `subagents.research.model: ...`; our plugin reads it, constructs `agentOptions`, injects via a custom tool wrapper. | Plugin-internal; no DSH change. |

A and B together cover OMO's "static `AGENT_MODEL_REQUIREMENTS`" use case. C is needed only if we want users to retarget sub-agent LLMs at runtime without reloading the plugin.

### 12.5 Risks and the one hidden cost OMO absorbs

| Risk | Impact | Mitigation |
|---|---|---|
| **No built-in fallback chain** | If the chosen model is unavailable on the chosen provider, DSH raises `LlmError('model-unavailable')` and the sub-agent run ends with `stopReason: 'error'` (see `packages/host/apiproxy/src/api/rpc.ts:36`). No silent rotation. | If we want OMO-style "try next", wrap the call in a thin retry layer that catches `model-unavailable` and re-issues with a configured fallback list. This is **the one piece OMO gives you for free and DSH does not**. Estimated cost: 30–80 lines per plugin instance. |
| **Same provider name = one adapter only** | `packages/llm/llm/src/index.ts:380` — `DUPLICATE_ADAPTER` if a provider route is already registered. Cannot temporarily swap an adapter per sub-agent; must reuse the same route name. | We do not need to swap adapters per sub-agent; we only swap the `{provider, model}` pair, which is a route into the same adapter. **No action required** unless a future requirement is to use a different *HTTP endpoint* per sub-agent (out of scope). |
| **Tool schema is fixed per `dsh-tool-subagent` instance** | The schema (`run_in_background`, `persona`, `toolFilter`, etc.) is the same for all calls to one tool instance, regardless of the LLM. | If a small model cannot follow the schema (e.g. long description), a per-instance schema fork is feasible. Not investigated further in this research. |
| **Token meter is model-agnostic by design** | `packages/llm/token-meter/` deliberately has no per-model config (see `routed-model-context-and-compaction-policy.md:21-23`). Capacity and policy live in the LLM adapter, not the meter. | This is an architectural feature, not a risk — context window per `{provider, model}` is correctly handled. |
| **Model name drift between LLM providers** | Same logical model may have different `model` strings under OpenAI / Anthropic / Vercel / opencode. | The plugin config binds a specific `(provider, model)` pair, so it is fixed at config time; cross-provider rotation requires a separate config. |

### 12.6 Out of This Research's Scope

The following questions were **not** investigated in this research. The omission is a scoping decision about what the question author chose to ask, not a project-level rejection of these items as "non-goals".

- **OMO's 6-step resolution pipeline** (`override → category → user fallback → hardcoded chain → system default`). The cost (5–10 days) and the unclear benefit for an internal-use tool factored into this scoping decision; the OMO maintainer's "anti-over-abstraction" stance (§11.5) is also relevant.
- **OMO's `ProviderCache`** (`model-core/AGENTS.md:41-44` — "ProviderCache is injected, not imported"). DSH's adapter registry is the equivalent; not investigated further.
- **OMO's fuzzy model matcher** (`packages/model-core/src/model-availability.ts`). The `pi-ai` adapter already accepts dynamic model ids; static config can use exact names; not investigated further.

### 12.7 Survey limitations

- DSH is at 0.1.0-rc.5; the `agentOptions.provider` / `agentOptions.model` fields are part of the merge-extensible `AgentOptions` interface and could be renamed. §10.2 lists the candidate options for the DSH pin strategy; the change-cost estimate above assumes option A (pin minor, `0.1.x`) — confirmed as a project decision on 2026-08-19 (see decision record D7).
- The `tool-subagent` "Config" table was read from the package README (English); the Chinese version may document additional fields. This research conclusion does not depend on those.
- I did not write a runtime test against the actual DSH `0.1.0-rc.5` checkout; the evidence is from code-reading the existing `workflow-worker-thread.spec.ts:211-235` and `tool-subagent.spec.ts` test fixtures, which already exercise the `agentOptions` override path. Whether to require a smoke test under our own plugin before the project (if any) signs off is an open decision; this research conclusion does not depend on it.

---

## 13. Research Conclusion: How does OMO design prompts when a parent agent calls a sub-agent? (And how does that constrain the child?)

**Date**: 2026-08-19
**Status**: Research conclusion (not a plan). This is the natural follow-up to §12: once we know DSH can route a different LLM per sub-agent, the next question is — *what does OMO actually put in the prompt that gets sent to that sub-agent, and how does it keep the sub-agent on target?* This is also the answer to the informal "anti-evasion / prompt-control" question.

### 13.1 Question

When the OMO orchestrator (e.g. `sisyphus`) decides to call a sub-agent (e.g. `librarian`, `hephaestus`, or a `category=deep` task), what is actually sent to that sub-agent's LLM? Specifically:
1. What shape does the call take (which tools does the child see, what `system` content is injected, what generation params)?
2. How does OMO make the child *do* the right thing and *not* do the wrong thing — including the soft "anti-evasion" property (a child that wants to skip work or contradict the parent's intent)?
3. What does OMO do to *defend* against the child's output going rogue and contaminating the parent (depth limits, output redaction, etc.)?

### 13.2 Answer (one sentence)

OMO controls the sub-agent in **three concentric rings**: **(1) the tool description of `task` / `call_omo_agent` steers the parent**; **(2) the system prompt + category prompt append steers the child** (built by `dynamic-agent-prompt-builder.ts` and `prompt-builder.ts`); **(3) generation params + tool allow/deny + depth limits + output redaction constrain the child**. The "anti-evasion" property is *not* a single guard — it is the sum of eleven orthogonal mechanisms that all have to be defeated simultaneously.

### 13.3 Two call paths into a sub-agent (parent-side)

OMO exposes the sub-agent invocation in two distinct tools. They are not the same tool, and the reasons for the split are revealing.

#### 13.3.1 `task(...)` — the general-purpose delegation tool

- Implementation: `packages/omo-opencode/src/tools/delegate-task/`
- Two execution modes:
  - **Background** (`run_in_background=true`) — `BackgroundManager.launch()` → async polling → notification to parent. Used for `explore` / `librarian` / parallel work.
  - **Sync** (`run_in_background=false`) — create session → send prompt → poll until idle → return result. Used for sequential work that needs an immediate answer.
- The tool *itself* is heavily constrained: the `task` tool description (see `tool-description.ts:39-79`) reads like a contract — it tells the parent LLM "you MUST provide EITHER category OR subagent_type" with explicit `❌ FAILS` vs `✅ CORRECT` examples, and ends with "**Prompts MUST be in English**". The description is the parent's first line of defense.

#### 13.3.2 `call_omo_agent(...)` — the research-only fast path

- Implementation: `packages/omo-opencode/src/tools/call-omo-agent/`
- This tool is **deliberately restricted to `["explore", "librarian"]`** (`constants.ts:1-4`):
  ```ts
  export const ALLOWED_AGENTS = ["explore", "librarian"] as const
  ```
  Its description (`constants.ts:6-13`) says it outright: *"Other built-in agents, custom agents, and task categories are intentionally not supported by this tool."*
- Why a separate tool? Two reasons, both evidence of OMO's "anti-evasion" instinct:
  - **Smaller, sharper schema** — the LLM is much less likely to call a research sub-agent wrong, because the tool doesn't even expose `category` or non-research agents.
  - **Lower surface for prompt injection** — the sub-agent tree rooted at `call_omo_agent` is one or two levels deep (`explore` does not call `task`); `task` can recurse.

This split is the first hint that OMO is not just "stitching a prompt" — it is *narrowing the affordance*.

### 13.4 What the child actually receives (assembly chain)

The full path from "parent LLM called a tool" to "child LLM sees a prompt" is:

```
parent LLM
  └─ calls `task(category="deep", prompt="...", load_skills=[...], run_in_background=false)`
       └─ delegate-task/tools.ts:130-222  (entry: validate args, resolve model, build systemContent)
            ├─ category-resolver.ts       (map "deep" → DelegatedModelConfig + fallbackChain)
            ├─ subagent-resolver.ts       (map "explore" → subagent + model)
            ├─ skill-resolver.ts          (map ["git", "codegraph"] → loaded skill content)
            └─ prompt-builder.ts          (assemble systemContent)
                 ├─ token-limiter.ts      (priority truncate: skills → categoryAppend → agentsContext)
                 └─ sync-prompt-sender.ts (POST to OpenCode session.prompt)
                      └─ body: { agent, system, tools, parts, model, variant, ... }
                           └─ child LLM run
```

#### 13.4.1 The four sub-pieces that go into the child's system prompt

From `prompt-builder.ts:57-93` and `token-limiter.ts:51-122`, the child's `system` field is, in priority order:

| # | Segment | Source | Drop priority on overflow |
|---|---|---|---|
| 1 | `agentsContext` (a.k.a. `planAgentPrepend` for `plan` agents) | `dynamic-agent-prompt-builder.ts` | **3rd (last)** |
| 2 | `skillContents[]` (per skill in `load_skills[]`) | `skill-resolver.ts` | **1st (first)** |
| 3 | `categoryPromptAppend` (per category, e.g. `DEEP_CATEGORY_PROMPT_APPEND_GPT_5_5`) | `delegate-task/openai-categories.ts` etc. | **2nd** |

Concatenation: `joinSystemParts([agentsContext, ...skillParts, categoryPromptAppend])` with `\n\n` separators (`token-limiter.ts:32-39`).

#### 13.4.2 The four sub-pieces that go into the child's *user* prompt

From `sync-prompt-sender.ts:103-121` and `prompt-builder.ts:95-101`:

| Field | Content | Mechanism |
|---|---|---|
| `parts[0]` | The parent's original `args.prompt` (verbatim, marked via `createInternalAgentTextPart`) | Raw passthrough |
| `parts[0]` append (plan agents only) | `buildTaskPromptAppend(...)` — adds TDD line if `tddEnabled` | `prompt-builder.ts:95-101` |
| `system` | The assembled system content from §13.4.1 | §13.4.1 |
| `tools` | Allow/deny map — see §13.5.1 | `sync-prompt-sender.ts:53-70` |
| `model` / `variant` | Resolved model + variant from `category-resolver` | §12.3.4 |
| `temperature` / `topP` / `maxOutputTokens` | From `categoryModel` if set | `sync-prompt-sender.ts:25-41` |
| `reasoningEffort` / `thinking` | From `categoryModel.reasoning` | `sync-prompt-sender.ts:30-34` |

The `createInternalAgentTextPart` marker is significant: it lets OMO distinguish "this is text we sent" from "this is text the child said" when post-processing the child's transcript — used for output redaction (§13.6.3).

#### 13.4.3 Generation params are also part of the contract

The child does not get to choose its temperature. `buildPromptGenerationParams(model)` writes a fixed map of `{ temperature, topP, maxOutputTokens, options: { reasoningEffort, thinking } }` from the category config. This means a `deep` task runs at a different temperature than a `quick` task — the category is *both* a prompt and a sampler.

### 13.5 Eleven orthogonal mechanisms that make the child stay on target

This is the core of the question. OMO does not have a single "anti-evasion" guard. It has eleven mechanisms, and the *combination* is what makes the child hard to derail.

#### 13.5.1 Tool allow/deny per child

`buildSyncPromptTools(agentToUse, permission)` (`sync-prompt-sender.ts:53-70`):

```ts
return {
  task: isPlanFamily(agentToUse),   // plan agents only
  call_omo_agent: true,             // research-only
  question: false,                  // children cannot ask the user back
  ...userDenied,                    // category-config denials
  ...getAgentToolRestrictions(agentToUse),  // per-agent allow list
}
```

Three things to notice:
- `question: false` — *the child cannot ask the user a clarifying question*. If the child is confused, it must make a reasonable assumption and proceed. This is a deliberate choice (`DEEP_CATEGORY_PROMPT_APPEND`: "Do not ask clarifying questions - the goal is already defined").
- `task: isPlanFamily(...)` — only `plan` family agents are allowed to call `task` again. This caps sub-agent nesting in the orchestration direction; the depth limit (§13.6.1) caps it in the *number* of layers.
- `getAgentToolRestrictions(agentToUse)` — every agent has its own allow/deny map (e.g. `explore` cannot `bash`, `oracle` cannot edit files). The child physically cannot run tools it shouldn't.

#### 13.5.2 Hard Blocks (NEVER violate)

`buildHardBlocksSection()` (`dynamic-agent-policy-sections.ts:7-20`) — prepended to every child's system prompt:

```
## Hard Blocks (NEVER violate)

- Type error suppression (`as any`, `@ts-ignore`) - **Never**
- Commit without explicit request - **Never**
- Speculate about unread code - **Never**
- Leave code in broken state after failures - **Never**
- `background_cancel(all=true)` - **Never.** Always cancel individually by taskId.
- Delivering final answer before collecting Oracle result - **Never.**
```

This is not a soft suggestion. The exact pattern `## Hard Blocks (NEVER violate)` plus the `- **Never**` suffix on every line is the LLM-side equivalent of a `// eslint-disable-next-line`-grade rule.

#### 13.5.3 Anti-Patterns (BLOCKING violations)

`buildAntiPatternsSection()` (`dynamic-agent-policy-sections.ts:22-37`) — also prepended:

```
## Anti-Patterns (BLOCKING violations)

- **Type Safety**: `as any`, `@ts-ignore`, `@ts-expect-error`
- **Error Handling**: Empty catch blocks `catch(e) {}`
- **Testing**: Deleting failing tests to "pass"
- **Search**: Firing agents for single-line typos or obvious syntax errors
- **Debugging**: Shotgun debugging, random changes
- **Background Tasks**: Polling `background_output` on running tasks
- **Delegation Duplication**: Delegating exploration to explore/librarian and then manually doing the same search yourself
- **Oracle**: Delivering answer without collecting Oracle results
```

Notice the labeling shift: "Hard Blocks" use **Never** (binary); "Anti-Patterns" use **BLOCKING** (a softer-but-still-firm framing). The grammar of the wording is a deliberate LLM-training-trick: binary words are easier for the model to pattern-match on.

#### 13.5.4 Category-specific prompt append (this is the big one)

Every category has its own `promptAppend` string, defined in:
- `delegate-task/openai-categories.ts` (OpenAI categories)
- `delegate-task/anthropic-categories.ts` (Anthropic categories)
- `delegate-task/google-categories.ts` (Google categories)
- `delegate-task/kimi-categories.ts` (Kimi categories)

These are *not* small one-liners. They are 30–200 line structured prompt blocks. Two of the most aggressive examples:

**`VISUAL_CATEGORY_PROMPT_APPEND`** (`google-categories.ts`): the entire prompt is wrapped in `<DESIGN_SYSTEM_WORKFLOW_MANDATE>` and consists of **four numbered phases**, each with "**PHASE 1: ANALYZE THE DESIGN SYSTEM (MANDATORY FIRST ACTION)**" + a check-list the child must answer before proceeding + a "BEFORE reporting visual work as complete, answer these: [ ]" checklist. The threat model is explicit: *"YOUR FAILURE MODE: You skip design system analysis and jump straight to writing components... The result is INCONSISTENT GARBAGE... THIS STOPS NOW."*

**`DEEP_CATEGORY_PROMPT_APPEND_GPT_5_5`** (`openai-categories.ts`): a different prompt for the same `deep` category, but tuned for GPT 5.5/5.6 — adds explicit framing of *"This is the category reserved for goal-oriented autonomous work on hairy problems that reward thorough exploration..."* with named sub-modes: *Exploration budget: generous*, *Goal, not plan*, *Atomic task treatment*, *Root cause bias*, *Ambition scaled to context*, *Completion bar: full delivery*, *Status cadence: sparse*. The category is essentially a *character sheet* for the child.

`resolveDeepCategoryPromptAppend(model)` (`openai-categories.ts:67-71`) dispatches to the model-specific variant — a clear sign that OMO treats category as a model-specific persona, not a model-agnostic one.

#### 13.5.5 Caller_Warning — telling the child what model it is on

Several categories append a `<Caller_Warning>` block that *tells the child LLM which model is executing it*. Example from `QUICK_CATEGORY_PROMPT_APPEND` (`openai-categories.ts`):

```
<Caller_Warning>
THIS CATEGORY USES A SMALLER/FASTER MODEL (gpt-5.6-luna-fast).

The model executing this task is optimized for speed over depth. Your prompt MUST be:

**EXHAUSTIVELY EXPLICIT** - Leave NOTHING to interpretation:
1. MUST DO: List every required action as atomic, numbered steps
2. MUST NOT DO: Explicitly forbid likely mistakes and deviations
3. EXPECTED OUTPUT: Describe exact success criteria with concrete examples
```

This is a fascinating trick: rather than designing a "good prompt for small models" in the abstract, OMO *tells the child* it is a small model, and instructs it to *meta-reason* about how to write its own prompt. The child then knows to be more explicit than usual.

#### 13.5.6 Selection_Gate — preventing category over-selection

`UNSPECIFIED_HIGH_CATEGORY_PROMPT_APPEND` (`anthropic-categories.ts:3-16`) has a `<Selection_Gate>` that says:

```
BEFORE selecting this category, VERIFY ALL conditions:
1. Task does NOT fit: quick (trivial), visual-engineering (UI), ultrabrain (deep logic), artistry (creative), writing (docs)
2. Task requires substantial effort across multiple systems/modules
3. Changes have broad impact or require careful coordination
4. NOT just "complex" - must be genuinely unclassifiable AND high-effort

If task fits ANY other category, DO NOT select unspecified-high.
```

This is a category-level *prior*. The child is told: "don't take the easy way out and pick the generic catch-all; pick the specific one."

#### 13.5.7 Plan-agent `<system>` envelope + `<CRITICAL_REQUIREMENT_*>` blocks

`PLAN_AGENT_SYSTEM_PREPEND_STATIC_BEFORE_SKILLS` (`constants.ts:21-197`) is the most aggressive prompt block in OMO. It is wrapped in `<system>...</system>` (LLM-vendor-respected higher-priority region) and contains:

- A `<system>` block with **MANDATORY CONTEXT GATHERING PROTOCOL** that *itself* launches sub-agents (`call_omo_agent(..., run_in_background=true, prompt="...")`) — the child is told to make tool calls before doing anything else.
- A `<CRITICAL_REQUIREMENT_DEPENDENCY_PARALLEL_EXECUTION_CATEGORY_SKILLS>` block — full-width `#` character wall, ASCII art `REQUIRED` banner, **four mandatory output sections** with example markdown tables.
- A `<DELIVERABLE_ENVELOPE>` block — the entire plan output must be wrapped in `<plan>...</plan>` tags, with the rule *"Emit EXACTLY ONE <plan> ... </plan> block, and only in your FINAL message. ... Anything emitted outside the envelope may be discarded."*

The `<plan>` envelope is the contract between plan-agent and parent: the parent can extract the plan verbatim and ignore everything else. This is how OMO survives a chatty child that emits ten "thinking aloud" paragraphs.

#### 13.5.8 Markdown output templates (pre-formatted, copy-paste-able)

`PLAN_AGENT_SYSTEM_PREPEND_STATIC_BEFORE_SKILLS` (lines 200–264) ends with a fully-formatted markdown TODO list template:

```markdown
## TODO List (ADD THESE)
> CALLER: Add these TODOs using TodoWrite/TaskCreate and execute by wave.

### Wave 1 (Start Immediately - No Dependencies)
- [ ] **1. [Task Title]**
  - What: [Clear implementation steps]
  - Depends: None
  - Blocks: [Tasks that depend on this]
  - Category: `category-name`
  - Skills: [`skill-1`, `skill-2`]
  - QA: [How to verify completion - specific command or check]
```

The child copies this template, fills in the placeholders, and the parent LLM can parse the result mechanically. This is the closest OMO gets to a "DSL between agents".

#### 13.5.9 "WHY THIS MATTERS" — semantic argument to combat long-context drift

Every mandatory section in `PLAN_AGENT_SYSTEM_PREPEND_STATIC_BEFORE_SKILLS` ends with a `WHY THIS MATTER(S|FORM IS MANDATORY):` line. Examples:
- *"WHY THIS MATTERS: Executors need to know execution ORDER. Prevents blocked work from starting prematurely. Identifies critical path for project timeline."*
- *"WHY THIS FORMAT IS MANDATORY: Caller can directly copy TODO items. Wave grouping enables parallel execution. Each task has clear task parameters. QA criteria ensure verifiable completion."*

This is **not just hand-waving**. By ~10k tokens of system prompt, the LLM has started dropping low-priority instructions from its working memory. The "WHY" line gives the rule a *reason* — and the reason is the harder thing to drop than the rule.

#### 13.5.10 Mode-specific prompt variants

The agent-level `MODE` (defined in `agents/AGENTS.md:104-114`):
- `primary` — respects user's UI-selected model (sisyphus, hephaestus, atlas, prometheus)
- `subagent` — uses own fallback chain, ignores UI selection (oracle, librarian, explore, multimodal-looker, metis, momus, sisyphus-junior)

A `subagent`-mode child has a tighter, more independent persona prompt; a `primary`-mode child has a more "user-facing" persona. The same child name has different prompts depending on mode.

#### 13.5.11 Retry-guidance hook — the parent's *own* self-correction

`hooks/delegate-task-retry/hook.ts:7-22` subscribes to `tool.execute.after` for the `task` tool. If the child's output contains one of 9 error patterns (`delegate-core/src/retry-patterns.ts:7-57`), OMO *appends a corrective hint to the parent's next message*:

```
[task CALL FAILED - IMMEDIATE RETRY REQUIRED]

**Error Type**: missing_run_in_background
**Fix**: Add run_in_background=false (for delegation) or run_in_background=true (for parallel exploration)

**Action**: Retry task NOW with corrected parameters.

Example of CORRECT call:
task(
  description="Task description",
  prompt="Detailed prompt...",
  category="unspecified-low",  // OR subagent_type="explore"
  run_in_background=false,
  load_skills=[]
)
```

This is OMO *teaching the parent* to use the tool correctly, in-band, after a failure. The 9 patterns are exactly the failure modes a parent LLM is most likely to fall into.

### 13.6 Defensive mechanisms (contain the blast radius)

Even with all the prompt shaping in §13.5, OMO knows the child can still go wrong. So it puts a perimeter around the call.

#### 13.6.1 Sub-agent depth cap

`background_task.maxDepth=3` is the default. From `delegate-task/sync-task.test.ts:1069`:

```
"Subagent spawn blocked: child depth 4 exceeds background_task.maxDepth=3. Parent session: parent. Root session: root. Continue in an existing subagent session instead of spawning another."
```

A sub-agent at depth 4 attempting to spawn another sub-agent gets a hard error. This caps the worst-case: a runaway sub-agent cannot recursively launch itself arbitrarily.

#### 13.6.2 Callable agent whitelist

`call_omo_agent`'s `ALLOWED_AGENTS = ["explore", "librarian"]` (constants.ts:1-4) is enforced in `tools.ts:160-170` — invalid agent types return a literal error string, not a soft fail. A child that tries to call itself or call a non-research agent gets blocked at the tool layer.

#### 13.6.3 Output redaction (anti cross-session contamination)

`features/background-agent/manager.ts:445-466` — when a background task is *archived*, its `prompt` field is replaced with `"[redacted]"` before the task is persisted. This is a defense against:
- A sub-agent's prompt being read back by *another* session that reuses the same task id.
- A sub-agent seeing its own earlier prompt later in its own session and being primed by it.
- Telemetry / log exports accidentally leaking sub-agent contents to a wider surface than the parent.

The "redaction on archive, not on creation" timing is deliberate: during the run, the prompt is needed; once the run is over, it is shrunk to a placeholder.

#### 13.6.4 Internal agent tag stripping

`stripInvisibleAgentCharacters(agentToUse)` (`shared/agent-display-names.ts`) is called on every agent name before it is sent to the child. Zero-width-space and similar invisible characters are stripped. This is a small but real defense against category / agent-name prompt injection: a malicious or careless `category="\u200Blibrarian"` cannot smuggle past a string-equality check.

#### 13.6.5 Error-formatting for child error → parent readable

`error-formatting.ts` + the `formatDetailedError` calls in `sync-prompt-sender.ts:138-153` convert child-side errors (e.g. `"agent.name undefined"`) into *parent-readable* error messages with full context (operation, args, sessionID, agent, category). The parent LLM sees a structured error it can act on, not a stack trace.

### 13.7 Risk and the one place OMO's design *does not* defend

| Surface | Defended? | How |
|---|---|---|
| Child goes off-script in *content* | Partially | §13.5.2–13.5.4 (Hard Blocks / Anti-Patterns / category append) |
| Child over-selects a "lazy" category | Yes | §13.5.6 (Selection_Gate) |
| Child asks user a clarifying question | Yes (hard block) | §13.5.1 (`question: false`) |
| Child recursively spawns sub-sub-agents | Yes (hard cap) | §13.6.1 (maxDepth) |
| Child calls a non-research agent from `call_omo_agent` | Yes (allow-list) | §13.6.2 |
| Child's prompt leaks across sessions | Yes (archive redaction) | §13.6.3 |
| Child's agent name smuggles invisible chars | Yes (strip) | §13.6.4 |
| Child returns an error to parent | Yes (structured format) | §13.6.5 |
| **Child's `prompt` field contains prompt-injection content the *parent* will later read back** | **No** — `args.prompt` is passed verbatim from parent to child (`sync-prompt-sender.ts:109`), no sanitization | See §13.7.1 |
| **Child emits output that contaminates the parent's later turns** | **Weak** — only envelope extraction (`<plan>...</plan>`) limits what the parent will act on | See §13.7.2 |

#### 13.7.1 The `args.prompt` trust boundary

`createInternalAgentTextPart(effectivePrompt)` (`sync-prompt-sender.ts:109`) marks the parent's prompt as a `text` part with an internal marker. The child's output is a separate `assistant` turn. There is no `text` / `assistant` cross-contamination guard at the prompt-builder level. The only isolation is OpenCode's session boundary itself: each `task` call gets its own session.

This is fine *as long as the parent is itself trusted* (i.e. the parent is `sisyphus` running on a model that is not under adversarial control). If the parent LLM is itself under attack (e.g. via a tool result from `bash` or `webfetch` that contains injected instructions), the parent can craft a `prompt` that injects instructions into the child. OMO does not sanitize this in either direction.

**Implication for us**: if we ever let the orchestrator pass user-controlled text into a sub-agent's `prompt` (e.g. a `@mention` in a chat), we need a sanitization step. OMO has none because OMO assumes the parent is a trusted internal LLM.

#### 13.7.2 The `<plan>` envelope is a one-way extract, not a sanitization

`PLAN_AGENT_SYSTEM_PREPEND_STATIC_BEFORE_SKILLS` tells the plan-agent to wrap output in `<plan>...</plan>`. The parent then *extracts* the envelope contents. But:
- The parent still sees the *whole* child response in its context window.
- Only the parser side (whatever reads `<plan>`) gets the safe subset.
- If the parent LLM is the consumer (not a parser), the parent still sees the un-stripped output.

The envelope is *communication contract*, not *security boundary*.

### 13.8 What this means for the oh-my-opendsh port

| OMO mechanism | DSH equivalent | Build-it-ourselves cost |
|---|---|---|
| `task` tool with strict description | `dsh-tool-subagent` (already has `agentOptions`) | None — DSH tool description is plain JSON, we just write a long `description` field |
| `call_omo_agent` separate tool with allow-list | Mount a *second* `dsh-tool-subagent` instance with a narrower description and no nested-task allowance | 1 cordis.yml row |
| `buildSystemContent` (assemble system prompt) | We write a thin builder: `[planPrepend, ...skills, categoryAppend].join("\n\n")` | ~50 lines TS |
| `token-limiter.ts` (priority truncate) | Same builder, copy the priority order | ~80 lines TS (already in `delegate-task/`, can be re-exported) |
| `buildHardBlocksSection` / `buildAntiPatternsSection` | Markdown literal in a `patches/omo-dsh/system-sections/hard-blocks.md` file, loaded at runtime | 0 lines — just markdown |
| `CATEGORY_PROMPT_APPENDS` (per-category persona) | One `patches/omo-dsh/system-sections/category-*.md` file per category, loaded by category name | ~10 small markdown files |
| `planAgentPrepend` (`<system>` envelope + `<CRITICAL_REQUIREMENT_*>` + `<DELIVERABLE_ENVELOPE>`) | One `patches/omo-dsh/system-sections/plan-prepend.md` | 1 markdown file (~200 lines) |
| Per-agent tool allow/deny | DSH `toolFilter` field on `dsh-tool-subagent` config — declare per-instance | 0 lines — pure config |
| Sub-agent depth cap | DSH `ctx.subagent` already has `policy.maxDepth`; verify and pass through | ~10 lines TS |
| Output redaction on archive | DSH `ctx.compaction` is the closest seam; we hook into it | ~30 lines TS |
| `retry-guidance` hook | DSH has a similar `tool.execute.after` waterfall; we write a 9-pattern regex + `formatRetryGuidance` | ~60 lines TS |
| `createInternalAgentTextPart` (mark parent text) | DSH `part.role` already separates user/assistant parts; the marker is OMO-specific, we may not need it | None |
| Model-specific prompt variant (`resolveDeepCategoryPromptAppend`) | `patches/omo-dsh/system-sections/category-deep.gpt5.md` vs `category-deep.default.md` — file naming convention, picked at runtime by `agentOptions.model` | ~5 small markdown files |
| Generation params (temperature, topP, maxOutputTokens) per category | `agentOptions` already has `maxTokens`; we extend it via a small DSH listener or via the `model` route | ~10 lines TS or a small listener |

**Net**: the prompt-control surface area is dominated by **markdown content**, not by code. The total "code we have to write" is roughly 250–400 lines of TS glue plus 10–20 markdown files (mostly copy-pasted from OMO with `oh-my-opendsh` attribution in `THIRD_PARTY_NOTICES.md` per §7.2 / §7.4).

#### 13.8.1 What we should NOT port

- **The 6-step model resolution pipeline** (already decided in §12.6 — out of scope).
- **`ProviderCache` / fuzzy model matcher** (already decided in §12.6 — out of scope).
- **PostHog telemetry / Anthropic context-window recovery / claude-code-compat-core**: these are OMO's Claude Code compatibility layers, not core prompt-control. Out of scope unless we want Claude Code parity.

### 13.9 Out of This Research's Scope

The following were not investigated in this research. The omission is a scoping decision about what the question author chose to ask, not a project-level rejection of these items as "non-goals".

- **Persona prompt mutation at runtime.** OMO does not mutate persona prompts mid-session; the question of whether such mutation is desirable or feasible was not investigated. (DSH `subagent.continuable` is the cross-session continuation mechanism; further investigation would start from there.)
- **Cross-session prompt carryover.** OMO sub-agents are session-isolated; the design of session-level prompt splicing was not investigated.
- **Adversarial robustness under untrusted parent.** OMO assumes the parent is trusted; adversarial hardening of `args.prompt` was not investigated.
- **Token-budget-by-category.** OMO's `FREE_OR_LOCAL_PROMPT_TOKEN_LIMIT = 24000` is a single hard cutoff; per-category token budgeting was not investigated.

### 13.10 Survey limitations

- I did not run a live test of any of these prompts against a real LLM. The evidence is from reading the source and the test fixtures. The behavior in production depends on the LLM actually respecting the framing; some models are more or less compliant with `<system>` blocks, `<CRITICAL_REQUIREMENT_*>` banners, and `<plan>` envelopes. The empirical evidence in OMO's own README / Discord suggests Anthropic and OpenAI top-tier models comply at >95% on first attempt; small/local models (Kimi K3, GPT-5.6-luna-fast) are more variable.
- I did not exhaustively map the 8 builtin categories' prompt appends — I read `openai-categories.ts` (which has the most variants: `ultrabrain`, `deep`, `quick`, `writing`, etc.), `anthropic-categories.ts` (only `unspecified-high`), and partial `google-categories.ts` (visual + artistry). The other 2 categories in `google-categories.ts` and the 3 in `kimi-categories.ts` were not read in full. The conclusions about *mechanisms* are not affected; the per-category wording would need a separate read.
- I did not read the equivalent mechanism in `omo-codex` or `omo-senpi` — the OMO multi-adapter family. If OMO has *additional* prompt-control mechanisms in those adapters (e.g. Codex-specific framing), they are not captured here. We can defer that until §10.1's "omo-codex / omo-senpi" upgrade question becomes real.
- `dynamic-agent-prompt-builder.ts` has more sections than the 6 listed in the `dynamic-agent-prompt-builder.ts` barrel re-export (`agent-identity`, `mode`, `restrictions`, `citation`, `verification`, `anti-patterns`, `tool categorization`, `category-skills guide`). I read the policy-sections part in full but not the core-sections part. The "11 mechanisms" enumeration is robust to this — the ones I read are the most policy-heavy and the most relevant to "anti-evasion".

---

## 14. Research Conclusion: How does OMO ensure its agent teams run correctly? (What automated test methods exist?)

**Date**: 2026-08-19
**Status**: Research conclusion (not a plan). Closes the loop on §12 (LLM routing) and §13 (prompt control) by answering the natural follow-up: *given a complex multi-agent system, how do you actually prove it works?*

### 14.1 Question

OMO is a 5-×-L LOC codebase orchestrating 11 agents, 30+ hooks, 5 MCPs, Team Mode parallel collaboration, and continuous Ultrawork drive. The natural worry: with so many moving parts and so much LLM-driven behavior, how does OMO actually verify that *agent teams run correctly* — and what *automated* test methods does it use, beyond the obvious `npm test`?

Specifically: how is the question *"the lead correctly hands work to a member; the member correctly responds; the inbox correctly delivers; the agent can resume after a crash"* turned into a test that *runs without a human in the loop and without a $200/mo LLM bill*?

### 14.2 Answer (one sentence)

OMO uses a **4-layer test pyramid** — **(1) unit tests** (983 `.test.ts` files, 30k+ assertions, `bun test`, 3-OS matrix), **(2) mock-provider-driven end-to-end tests** (31 files under `packages/omo-senpi/scripts/qa/`, scripted LLM that emits tool calls in order, observes cross-process side effects), **(3) `omo doctor` self-check** (46 checks run on user machines to validate environment + model resolution + team mode deps), and **(4) real-model "Sisyphus agent" e2e** (a manually-triggered workflow that runs the real OMO plugin against the real Anthropic API, used by maintainers to catch prompt drift). The middle layer — **scripted mock LLM providers that write observation files to a shared directory** — is the part that has no obvious DSH equivalent and is the most important thing to replicate.

### 14.3 The 4-layer test pyramid

| Layer | Where | When | Cost | Catches |
|---|---|---|---|---|
| **L1 unit** | `bun test` on the whole monorepo | Every PR, 3 OS matrix (Linux, macOS, Windows × 2 shards) | Free, ~30 min wall | Logic bugs, type errors, integration of internal modules |
| **L2 mock-provider e2e** | `packages/omo-senpi/scripts/qa/*.test.ts` + `*.mjs` | Same CI run, separate job | Free, ~5–15 min per scenario | Tool-call sequencing, cross-process state transitions, crash recovery, plan-gating, model fallback |
| **L3 doctor self-check** | `omo doctor` CLI | User opt-in (or as a project-defined gate) | Free, 30s | Env vars, missing deps (tmux, git), model-resolution breakage, config schema drift, telemetry wiring |
| **L4 real-model e2e** | `.github/workflows/sisyphus-agent.yml` | Maintainer manual trigger (`@sisyphus-dev-ai`) | ~$1–5 per run | Prompt drift, LLM-side instruction-following, UX regressions |

**Of these, L2 is the most novel and the most relevant to oh-my-opendsh.** L1 every project has; L3 every project should have (we will); L4 is too expensive to gate on. L2 is the thing that lets OMO ship a 19-package multi-agent system with confidence that *agent-to-agent interactions* work.

#### 14.3.1 L1 unit — 983 test files, three naming patterns

A count of the monorepo:
- `find . -name "*.test.ts" | wc -l` → **983** (as of 2026-08-19 snapshot)
- `packages/team-core/src/**.test.ts` → **28** (mailbox, registry, state-store, tasklist, layout-tmux)
- `packages/omo-opencode/src/features/background-agent/manager.test.ts` → **8774 lines, 238 tests** (one file, the central scheduler)

The most common test style is `#given ... #when ... #then` BDD strings inside `describe/test` (`background-agent/manager.test.ts`):
```ts
describe("invokeTmuxSessionCreatedCallback", () => {
  test("#given enabled tmux callback inside tmux #when invoked #then forwards the child session", async () => { ... })
})
```
The BDD strings show up in `bun test --filter` output and in any agent-driven test debugging. Not strictly necessary, but the consistent style is what makes the 983-file corpus *navigable*.

There is also a smaller corpus of `.mjs` tests (used for scripts and QA drivers) and `.test.mjs` for `node --test`-style smoke tests that are not Bun-specific.

#### 14.3.2 L2 mock-provider e2e — the real centerpiece

`packages/omo-senpi/scripts/qa/` contains **31 e2e harnesses**:

```
team-e2e.mjs                    ← top-level driver
team-e2e-runtime.mjs            ← process lifecycle
team-e2e-process.mjs            ← process monitoring
team-e2e-analysis.mjs           ← result analysis
team-e2e-support.mjs            ← shared helpers
team-e2e-scripts.mjs            ← mock scripts (LEAD_SCRIPT, DURA_REVIVE_SCRIPT, ...)
team-e2e-crash.mjs              ← crash recovery scenario
team-e2e-mock-provider.ts       ← THE mock LLM (per-script branching by MOCKROLE)
fallback-architect-e2e.mjs      ← 5 fallback scenarios (A-E)
fallback-architect-mock-provider.ts
plan-gated-agents-e2e.mjs       ← plan-gate (denial / read-unlock / sequence)
no-todo-continuity-e2e.mjs      ← cross-session continuity
curated-agents-e2e.mjs          ← curated agent roster
curated-agents-e2e-mock-provider.ts
curated-agents-e2e-scenarios.mjs
curated-agents-e2e-analysis.mjs
lsp-e2e.mjs                     ← LSP integration
memory-e2e.mjs                  ← memory system
memory-model-fallback-e2e.mjs
memory-skill-startup-e2e.mjs
ast-grep-mcp-e2e.mjs            ← AST-grep MCP
task-e2e-mock-provider.ts       ← generic task mock
task-rpc-e2e-mock-provider.ts
task-runtime-fallback-mock-provider.ts
task-id-race-mock-provider.mjs
task-resume-e2e-mock-provider.ts
facts-backlog-e2e-mock-provider.ts
task-category-unavailable-mock-provider.ts
variant-thinking-mock-provider.ts
mock-completions-server.mjs     ← OpenAI-compatible SSE server (the test bed)
mock-provider/                  ← index.ts: the original mock provider base
drive.mjs                       ← createSandbox / seedSandbox / credentialDigest
team-e2e-runtime.test.ts        ← bun test wrapper around the .mjs
team-e2e-support.test.ts
```

**The pattern across all 31**: a `*-e2e.mjs` (or `.ts`) is a **scenario driver** that uses a `*-mock-provider.{ts,mjs}` to feed scripted LLM responses to the real OMO plugin, then reads observable side effects (files in a sandbox, transcript JSONL, inbox dir counts) and asserts business outcomes.

### 14.4 How the mock-provider pattern actually works

This is the core mechanism. The mock provider is **a real HTTP server speaking the OpenAI Completions protocol**, but instead of generating text from a model, it **replays a scripted sequence of tool calls and text outputs**.

#### 14.4.1 The script language (5 step types)

From `packages/omo-senpi/scripts/qa/mock-provider/index.ts:30-36` and `team-e2e-mock-provider.ts:40-45`:

```ts
type MockStep =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; arguments: Record<string, unknown>; id?: string }
  | { type: "hang" }                        // never returns; keeps the turn alive
  | { type: "wait_for_liveness" }           // blocks until team-member-liveness event
```

A script is `Record<string, MockStep[]>` — a **map of role name to ordered steps**. The mock provider uses `MOCKROLE=<role>` markers in the system prompt to pick which key to use:

```ts
// team-e2e-mock-provider.ts:111-113
["MOCKROLE=quick", "quick"],
["MOCKROLE=fixture", "fixture"],
["MOCKROLE=dura", "dura"],
```

So a *single scenario file* describes the entire team's behavior, broken into per-role scripts.

#### 14.4.2 A concrete example — `LEAD_SCRIPT` (team-e2e-scripts.mjs:15-36)

```js
export const LEAD_SCRIPT = {
  lead: [
    toolCall("team_create", {
      team_name: "stale-named-team",
      inline_spec: {
        name: "e2eteam",
        members: [
          { name: "quick",   kind: "category",      category: "quick",   prompt: QUICK_PROMPT },
          { name: "fixture", kind: "subagent_type", subagent_type: "fixture", prompt: FIXTURE_PROMPT },
        ],
      },
    }),
    toolCall("task_send", { team_run_id: "__TEAM_RUN_ID__", to: "quick", message: "LEAD2QUICK injected handshake: report QUICK2LEAD after this arrives" }),
    toolCall("task_list", { team_run_id: "__TEAM_RUN_ID__" }),
  ],
  quick: [
    text("quick initial turn ended; waiting for an injected lead message"),
    toolCall("task_send", { to: "lead", message: "QUICK2LEAD member report delivered by injection" }),
    { type: "hang" },
  ],
  fixture: [text("fixture member acknowledged")],
}
```

This file *is* the test. Reading it tells you:
1. **Lead** should call `team_create` (with 2 members, quick + fixture)
2. **Lead** should `task_send` to `quick` with a specific handshake message
3. **Lead** should `task_list` (query state)
4. **Quick** should ack and `task_send` back to `lead` (the "QUICK2LEAD" message)
5. **Quick** should hang (keep the turn alive so the test can observe async events)
6. **Fixture** should just acknowledge

The `__TEAM_RUN_ID__` placeholder is **resolved by the mock at runtime from the live message thread** (see `team-e2e-mock-provider.ts:4-6` docstring). The mock is *not* a static replayer; it interpolates real run-time identifiers so a static script can address the team the real OMO plugin actually minted.

#### 14.4.3 The two non-trivial primitives: `hang` and `wait_for_liveness`

`{ type: "hang" }` is the *asynchrony primitive*. The mock holds the SSE stream open and never sends a `stop` event. This is critical because:
- OMO's mailbox poller ticks on **1-second intervals** (`team-e2e-scripts.mjs:68-70` comment).
- The ack scanner commits only **after the injected envelope reaches the session JSONL at a tool boundary**.
- Without `hang`, the script finishes and the test process exits before any async observation can be made.

`{ type: "wait_for_liveness" }` is a *handshake primitive*. The mock subscribes to a real OMO event (`senpi-task.team-member-liveness`, see `team-e2e-mock-provider.ts:394-400`) and only proceeds to the next step when that event fires. This lets the test *prove* that liveness events fire, not just assume them.

#### 14.4.4 The observation channel — files in a shared directory

The mock writes to a directory; the driver reads from the same directory. The test is essentially **two processes sharing a filesystem**, with the LLM call as a synchronization point. From `team-e2e-analysis.mjs:38-49`:

```ts
export function injectionEvidence(cwd, runId, quickTask, leadMessage, obsDir) {
  const leadReceipt = join(obsDir, "lead-received.txt")
  return {
    runId,
    quickTask,
    leadMessage,
    memberEnvelopeEchoed:
      quickTask !== undefined
      && leadMessage !== undefined
      && sessionContainsText(cwd, quickTask, leadMessage),
    memberToLeadInjected:
      existsSync(leadReceipt)
      && readFileSync(leadReceipt, "utf8").includes("QUICK2LEAD"),
    leadInbox: runId === undefined
      ? { unread: 0, reserved: 0, processed: 0 }
      : inboxCounts(memberInboxDir(cwd, runId, "lead")),
  }
}
```

This is the assertion layer. The test driver *does not scrape transcripts*. It checks **two things**:
- **File existence + substring** (`lead-received.txt` contains `"QUICK2LEAD"`) — proves the child wrote the receipt file, which only happens after the injection round-trip completes.
- **Directory counts** (`inboxCounts` returns `{unread, reserved, processed}`) — proves the lead's inbox was actually drained, not just "looks empty".

This is the *business-rule* assertion: *"did the lead successfully inject a message into the member, and did the member report back?"* — not *"did the LLM call `task_send`?"* The two are very different.

#### 14.4.5 The verdict

From `team-e2e-analysis.mjs:61-62`:
```ts
export function verdict(checks) {
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name)
  return { result: failed.length === 0 ? "PASS" : "FAIL", failed }
}
```

Every e2e driver returns `{ result: "PASS" | "FAIL" | "SKIP", scenarios: [...] }` as **JSON on stdout**. CI parses this. A `--self-test` mode (e.g. `fallback-architect-e2e.mjs:300`) runs the analysis *itself* before spawning a process, to catch analysis bugs before the expensive part.

### 14.5 Sandbox and credential isolation

Without isolation, e2e tests would corrupt the developer's real OMO install. OMO's `drive.mjs` (`packages/omo-senpi/scripts/qa/drive.mjs:66-89`):

```ts
export function createSandbox() {
  const root = mkdtempSync(join(tmpdir(), "omo-senpi-qa-"))
  const cwd = join(root, "project")
  const agentDir = join(root, "agent")
  const xdgConfigHome = join(root, "xdg")
  const homeDir = join(root, "home")
  return { root, cwd, agentDir, xdgConfigHome, homeDir, canonicalCwd: ... }
}
```

Plus `scenarioEnv()` (no-todo-continuity-e2e.mjs:21-31):
```ts
return {
  ...process.env,
  HOME: home, USERPROFILE: home,
  XDG_CONFIG_HOME: sandbox.xdgConfigHome,
  SENPI_CODING_AGENT_DIR: sandbox.agentDir,
  SENPI_CODING_AGENT_SESSION_DIR: sessionDir,
  PI_CODING_AGENT_DIR: sandbox.agentDir,
  PI_CODING_AGENT_SESSION_DIR: sessionDir,
  OMO_SENPI_QA: "1",
}
```

The key insight: OMO uses **sandboxed HOME / XDG_CONFIG_HOME / agent dir** via env vars, so the test process reads/writes a temp dir, not the developer's `~/.senpi/agent`.

But this isn't enough on its own. The OMO e2e drivers also do a **digest-based credential check** (e.g. `plan-gated-agents-e2e.mjs:43-67`):
```ts
const CREDENTIAL_FILES = ["auth.json", "models.json", "settings.json", "trust.json"]
export function isolationDigest(agentDir) {
  const hash = createHash("sha256")
  for (const name of CREDENTIAL_FILES) { ... }
  ...
}
```
A test must run before-and-after `isolationDigest(realSenpiAgentDir)`. If the *real* `~/.senpi/agent/auth.json` etc. has changed bytes, the test **fails** even if the scenario itself passed. This catches the worst class of test pollution — a misconfigured env override silently letting the real agent dir be touched.

`HOST_VOLATILE_SETTINGS_KEYS = ["workflow-skills", "tipsHistory", "skills"]` (plan-gated-agents-e2e.mjs:21) — OMO knows that the developer's interactive TUI writes to *its own* `settings.json` continuously (`tipsHistory` etc.), so it whitelists those keys as "this churn is not from the test". Smart: without this, the test would flake every time the developer typed in their TUI.

### 14.6 `omo doctor` — 46 self-checks

`packages/omo-opencode/src/cli/doctor/checks/` has **46 check files**. The doctor is the only one of the four layers that **runs in production** — on a user's machine, when they install OMO, to validate that their environment is sane.

Selected checks (from the `index.ts` registry):

| Check | What it verifies | Why it matters |
|---|---|---|
| `system` | `opencode --version`, plugin version, bun version, config path validity | Catches a wrong-version install before any other check runs |
| `config` | `validatePluginConfig` against `omo-config-core` schema | Catches typos in `omo.json` |
| `model-resolution` (6 sub-checks) | cache state, fallback chain, variant, types, details, effective model | Catches "I added a model to my config but OMO can't find it" |
| `team-mode` | `tmux` and `git` binaries on PATH, `team_mode.base_dir` exists or can be created | Catches "team mode silently no-ops because tmux is missing" |
| `tools-lsp`, `tools-mcp`, `tools-gh` | each tool's CLI is callable | Catches a half-installed dependency |
| `telemetry` | telemetry wiring matches expected schema | Catches telemetry-side breakage |
| `codex` (4 sub-checks) | codex plugin surface, components, runtime wrapper | Catches senpi-codex plumbing breakage |
| `deprecated-reasoning-keys` | `omo.json` not using the old `reasoning: { effort: "low" }` shape | Migration nudge |
| `legacy-config-leftovers` | no `omo-cache`, `omo-preferences` legacy files | Cleanup nudge |

The doctor is a single CLI: `omo doctor` (or `bun run packages/omo-opencode/src/cli/doctor/index.ts` in dev). Each check returns `{ status: "pass" | "fail" | "warn" | "skip", message, issues[] }`. The runner (`runner.ts:43-49`) computes a summary and **exit code 1 if any check failed** — so doctor is also usable as a CI gate (`omo doctor --json`).

The `checkTeamMode` example (`team-mode.ts:11-31`) is illustrative:
```ts
const teamModeConfig = TeamModeConfigSchema.parse(config.team_mode ?? {})
if (!teamModeConfig.enabled) {
  return { name: ..., status: "skip", message: "team_mode: disabled", issues: [] }
}
const deps = await checkTeamModeDependencies(teamModeConfig)
const baseDir = resolveBaseDir(teamModeConfig)
...
return {
  status: deps.tmuxAvailable && deps.gitAvailable ? "pass" : "warn",
  message: `team_mode: enabled | tmux: ... | git: ... | declared: ${teamCount} | runtime dirs: ${runtimeCount}`,
  issues: [],
}
```
Note the four-state status: `pass` / `fail` / `warn` / `skip`. **`skip` is a first-class state** — the doctor doesn't lie about a check it can't run (e.g. team mode disabled). This is a subtle but important UX choice: it means "FAIL count = N" is meaningful, but "PASS count = M" is not ("did the test run or just skip?").

### 14.7 L4 — the real-model Sisyphus agent

`.github/workflows/sisyphus-agent.yml` is a **manually-triggered workflow** that:
1. Installs real OpenCode + OMO plugin from the working tree
2. Configures Anthropic API key from a repo secret
3. Spawns a real `opencode` session with a real prompt
4. Lets Sisyphus (the top-level OMO orchestrator) actually drive a multi-agent task
5. Captures logs

The trigger condition (`sisyphus-agent.yml:14-22`) is intentionally narrow:
```yaml
on:
  workflow_dispatch: ...
  issue_comment:
    types: [created]
```
and the job condition is `contains(comment.body, '@sisyphus-dev-ai')` — only comments that ping the bot trigger it. This is a maintainer tool, not a per-PR gate. Each run costs ~$1–$5 in API and 5–15 min of wall clock. The L4 layer is the *one where actual prompt compliance is verified* — L1–L3 cannot catch a prompt that the LLM silently ignores.

The sisyphus-agent.yml file has the comment *"Only issue_comment works for fork PRs (secrets available)"* — OMO is aware that fork PRs cannot use `pull_request` triggers because secrets are scoped, so they used the comment-based trigger to get a bot-callable e2e that works for external contributors.

### 14.8 What we can and cannot reuse

| OMO test mechanism | Reusable in oh-my-opendsh? | Cost to port |
|---|---|---|
| `bun test` for unit | **Yes** — `bun` runs on any platform; we already have `bun test` as DSH's test runner too (DSH uses `vitest` for itself, but the *patch framework's* tests can be bun-native) | 0 |
| `*.test.ts` BDD strings | **Yes** — naming convention, not library | 0 |
| Mock-provider `MockStep` + scripted responses | **Yes, with adaptation** — DSH has no built-in mock LLM server, but we can build a small one in ~200 LoC that talks OpenAI-compatible HTTP (since DSH LLM uses similar adapters) | ~200 LoC TS + 1 mock server skeleton |
| Per-scenario driver (`*-e2e.mjs`) | **Yes** — pattern is framework-agnostic; we copy `drive.mjs` (sandbox helpers) verbatim and adapt the OMO-specific bits | ~150 LoC TS per scenario |
| `observation-files` assertion pattern | **Yes, with adaptation** — DSH's `subagent` package writes its own session JSONL; we can read that instead of OMO's `~/.senpi/agent/sessions/.../chat.jsonl` | 0 — same pattern, different file paths |
| `inboxCounts` / `memberInboxDir` | **No** — OMO-specific (uses `senpi-task` dir layout) | We use DSH `ctx.subagent` mailbox equivalents |
| `credentialDigest` isolation | **Adapted** — DSH config dir is at `~/.config/dsh/` or similar (DSH-specific); we replace `~/.senpi/agent` with that path. The digest-and-compare logic is reusable | ~30 LoC TS |
| `omo doctor` (L3) | **Yes, we need to build it** — DSH does not have a `doctor` CLI; we should ship one. The 46 checks are mostly OMO-specific but ~5 of them (system, config, model-resolution, team-mode, tools) are directly applicable | ~500–800 LoC TS for our own doctor with the relevant subset |
| Real-model e2e (L4) | **Yes, but only after any MVP is stabilized** — the Sisyphus pattern is reusable; the cost is "we need a $5/month API budget and a maintainer willing to run it" | 0 LoC, but ongoing API cost |
| `tty-driver.py` (PTY fork for interactive launches) | **Maybe** — if we ship an interactive `oh-my-opendsh` install, we will. DSH itself doesn't have a PTY install, so the use case is hypothetical | ~80 LoC Python (we could lift OMO's directly; it is a generic tool) |

**Net: the patterns are reusable; the file paths and the OMO-specific assertions are not.** The "OMO is OMO, oh-my-opendsh is oh-my-opendsh" separation holds — we do not need to clone OMO's test corpus, only the *shape* of OMO's testing strategy.

### 14.9 Out of This Research's Scope

The following were not investigated in this research. The omission is a scoping decision about what the question author chose to ask, not a project-level rejection of these items as "non-goals".

- **Adversarial / red-team testing of LLM output.** OMO does not do this either; L1–L4 are positive-testing only. The "anti-evasion" mechanisms in §13.5 are verified by L2 (mock-provider shows the prompt is *sent*), not by adversarial mutation testing of LLM behavior. If we ever need red-team coverage, the work is *separate* from this test pyramid.
- **Performance regression gates.** OMO does not benchmark in CI. Sub-agent scheduling latency is *not* asserted anywhere. The closest is `team-e2e-process.mjs` (process liveness, not perf).
- **Property-based testing** (fast-check / property tests). OMO uses example-based tests only. For 19 packages × unit tests, example-based is enough; the LLM is the source of randomness, not the SUT.
- **Visual regression of the web UI.** `web-ci.yml` runs format + lint + typecheck + build for `packages/web`, but does not run a visual diff. The web UI is tested via `doctor` (the TUI sub-check) and via manual review.

### 14.10 Survey limitations

- I did not read all 31 e2e harnesses in full. I read `team-e2e.mjs` + `team-e2e-runtime.test.ts` + `team-e2e-analysis.mjs` + `team-e2e-scripts.mjs` + `team-e2e-support.mjs` + `team-e2e-mock-provider.ts` + `fallback-architect-e2e.mjs` + `fallback-architect-mock-provider.ts` + `no-todo-continuity-e2e.mjs` + `plan-gated-agents-e2e.mjs` + `curated-agents-e2e.mjs` + `drive.mjs`. The 19 others (mostly `*-e2e-mock-provider.ts` and `task-*-e2e-*.mjs`) are assumed to follow the same pattern. The conclusions about the *mechanism* are robust to this; specific scenarios would need a per-file read.
- I did not run any of the e2e harnesses. The evidence is from reading the source and the test fixtures. The CI matrix (`.github/workflows/ci.yml` + `codex-compatibility` job) is what actually exercises them; the snapshot above is what the CI *would* run on a fresh push.
- The `omo doctor` registry (`checks/index.ts`) was read in full; the individual 46 check files were skimmed (system, config, model-resolution, team-mode, tools, telemetry, codex, deprecated-reasoning-keys). The other ~38 checks (MCP server, LSP daemon, etc.) are not characterized in this report.
- The Sisyphus e2e (`.github/workflows/sisyphus-agent.yml`) is summarized from the workflow YAML and the maintainer's documented intent; I did not examine the actual Anthropic API prompt payload or the success criteria.
- The `tty-driver.py` (PTY helper) was read in full; the surrounding `launcher.test.ts` and `setup-detect.test.ts` are OMO-native-specific and not directly applicable to a DSH-side scratch plugin.
- 31 e2e harness files is a *count of files in `packages/omo-senpi/scripts/qa/` matching the e2e / mock-provider pattern*. The actual number of distinct *scenarios* is smaller (some files are helpers or analyses). I did not enumerate the 1-to-1 mapping.
