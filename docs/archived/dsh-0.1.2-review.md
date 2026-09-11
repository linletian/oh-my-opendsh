# dsh 0.1.2-alpha.1 Review Research Report

> **ARCHIVED (2026-09-11).** This review's bump path was superseded before the tag was ever pinned: the project went rc.6 → 0.1.5-rc.1 directly (see [PRD §12](../mvp-prd.md) and the [0.1.5-rc.1 review](../dsh-0.1.5-rc.1-review.md) §9, which also lists where this document's conclusions still hold). Content below is unchanged from the research date.
>
> **Primary document (English).** 中文翻译见 [评审报告](./dsh-0.1.2-review_zh-CN.md).
>
> **Nature**: a pure research record with no action commitments; it does not update decisions, the PRD, or the feasibility report, and it does not bump any version.
>
> - Research date: 2026-08-29
> - Research target: the deepseek-harness repository (local path `/home/linletian/GithubRepo/deepseek-harness/`, read-only throughout), tag `dsh-v0.1.2-alpha.1`, HEAD commit `6c705be1ce`; note: tag `dsh-v0.1.2-alpha.1` now points at merge commit `cd5ef81481`, whose tree is identical to the research-time HEAD `6c705be1ce` (`git diff` is empty), so the content conclusions are unaffected
> - Comparison baseline: the dsh `0.1.0-rc.6` pinned by this project's CI (decision D7); the MVP is closed (FR-1~FR-8 implemented, V1~V4 validated, see [mvp-pitfalls](../mvp-pitfalls_zh-CN.md))
> - Method: static source reading + git history verification (two explore subagents researched in parallel; key conclusions were spot-checked against the original source by the main agent)

---

## 1. Codex as a sub-agent: implementation mechanism (focus of this round)

### 1.1 Architecture: a named SubagentProvider + an out-of-process JSON-RPC bridge

Codex support lives in `packages/subagent/subagent-codex/` (`@deepseek-ai/dsh-subagent-codex`). It is **not a new tool** but a named provider registered on the `ctx.subagents` service; the model still only faces the generic `dsh-tool-subagent` delegation tool, which dispatches by the `provider` name in its config:

```
model calls subagent_codex({description, prompt})
  → dsh-tool-subagent (config.provider = 'codex')
  → ctx.subagents.start('codex', request)
  → CodexProvider.start()
  → spawn `codex app-server --stdio` (Node launches the wrapper inside the bundled @openai/codex@0.149.1 package; the host PATH is not resolved)
  → JSON-RPC: initialize → thread/start (ephemeral: true, with cwd / optional model / permission params) → turn/start (plain-text task)
  → listens for item/completed (agentMessage, phase=final_answer) → terminates at turn/completed
  → SubagentResult { output, structured?, diagnostic?, stopReason }
```

Key evidence:

| Item | Location |
|---|---|
| `SubagentProvider` public contract (`name` / `capabilities` / `inheritsParentContext` / `start()` / `prepareContinuable?`) | `packages/subagent/subagent/src/types.ts:300` onward |
| `SubagentCapabilities` five flags (`agentOptions` / `outputSchema` / `depthLimit` / `toolFilter` / `persona`) | `packages/subagent/subagent/src/types.ts:86-92` |
| `SubagentResult` termination semantics | `packages/subagent/subagent/src/types.ts:227` onward |
| Shared helpers for out-of-process backends: `NO_START_CAPABILITIES` / `settleRunResult` / `subprocessRunHandle` | `packages/subagent/subagent/src/out-of-process.ts:51-63` (comment text at :51-56, const body at :57-63), `:192`, `:245` |
| Codex provider entry (Config schema + registration) | `packages/subagent/subagent-codex/src/index.ts:36` onward |
| Process spawn (in-package bin resolution + argv) | `packages/subagent/subagent-codex/src/run.ts:43-52`, `:134` |
| Codex app-server minimal JSON-RPC wire | `packages/subagent/subagent-codex/src/wire.ts` |
| Disabled `tool-subagent-codex` line in the standard preset | `packages/preset/agent-presets/presets/standard/agent.cordis.yml:209-216` |

Provider instance config surface (`subagent-codex/src/index.ts:36-50`):

```ts
interface Config {
  providerName?: string   // registration name on ctx.subagents, default 'codex'
  model?: string          // the native Codex model pinned for this instance; falls back to Codex's own setting when omitted
  env?: Record<string,string> // explicit environment overrides (the parent environment is credential-scrubbed first)
  permissionMode?: 'never' | 'approve-for-me' | 'dangerously-bypass-approvals-and-sandbox'
  disposeGraceMs?: number // grace period for process-tree termination, default 3000
}
```

The tool line shipped in the standard preset (`disabled: true` by default; the official comment instructs: install the Bundle, then copy the preset and remove `disabled`):

```yaml
- id: tool-subagent-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  disabled: true
  config:
    provider: codex
    toolName: subagent_codex
    backgroundMode: one-shot
    maxDepth: provider-managed
```

### 1.2 Install form: Profile Bundle

The in-package `package.json` declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, and the patch is a host-side insert line; installing with `dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex` applies it automatically (`apps/cli/reference/README.md:51`). Authentication follows Codex's native semantics (`CODEX_HOME` / `HOME` / cwd inheritance; API-key-style variables are injected explicitly via the `env` config). Claude Code has an isomorphic provider (`subagent-claude-code`); both share the same design record `.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.md`.

### 1.3 Version history (git-verified)

- Initial feature commit: `1daa35b6e3 feat(subagent): add Codex product provider`
- **First tag containing the Codex provider: `dsh-v0.1.0-rc.7`** (`99f6f02fec`). Note: `0.1.0-rc.5` / `rc.6` have release commits but no tags; however rc.6's standard preset already carried the disabled codex/claude-code tool lines (this project's MVP deliberately DROPs them in the concerto preset, see `patches/omo-dsh/omo-agents/concerto/agent.cordis.yml:54-59`)
- rc.8: provider installable directly as a Bundle, named provider instances, non-interactive permission mode
- 0.1.1: one-shot background task wiring, DSH SDK model routing preparation
- 0.1.2: `fe8a961348 feat(subagent): configure Codex provider models` (instance-level `model` override), `aefc083be7 feat(subagent): authorize selectable child models` (child-model selection whitelist)

### 1.4 Two implications for this project

1. **`SubagentProvider` is a public extension point, not an official privilege.** Any third-party scratch plugin can implement the interface and, with the shared helpers in `out-of-process.ts` (lifecycle / cancellation / diagnostics / idempotent disposal already handled officially), wrap **any external CLI agent** into a dsh subagent, then expose it to the model with one `dsh-tool-subagent` instance line. This is exactly the official path corresponding to the multi-harness adaptation idea in the feasibility report (`omo-codex` etc.), and the self-build cost is an order of magnitude lower than the assumed "build your own bridge".
2. **Out-of-process providers have zero start capabilities.** `NO_START_CAPABILITIES` (`out-of-process.ts:57-63`, comment text: "A child in another process cannot honor parent-enforced start features… so the service rejects a request needing any of them before `start` runs — never accepted-then-ignored"). In other words: the concerto mode discipline of "per-agent independent `{provider, model}` routing + `toolFilter` read-only filtering + `maxDepth` depth cap" **only holds for in-process providers (spawn / fork)**; a codex-class subagent's model can only be pinned in the provider instance config's `model` field (supported since 0.1.2), and the depth cap can only be written as `provider-managed`. Tool-config filtering or routing overrides cannot be applied at delegation time. This is a real orchestration design constraint.

---

## 2. rc.6 → 0.1.2-alpha.1 version delta (items relevant to this project, each git-verified)

> Note: the local dsh repo has no `0.1.0-rc.5`/`rc.6` tags; the earliest available tag is `dsh-v0.1.0-rc.7`. rc.6-era facts were verified against the tree of release commit `15148dbd9a release(dsh): 0.1.0-rc.6`.

### 2.1 Official presets: id rename + location move, display names unchanged

- rc.6: presets live at `apps/cli/config/agent-presets/{standard,code,minimal,cordis}/` (each containing `preset.yml` + `agent.cordis.yml`)
- 0.1.2: presets moved and bundled into `packages/preset/agent-presets/presets/{standard,ptc,minimal,cordis}/` (`f94495e527 refactor(preset): bundle the shipped presets inside dsh-agent-presets`)
- **id `code` → `ptc`** (`3ca9c7d489 rename code-mode to ptc`); in the PTC 模式 (PTC Mode) description, "Code Mode SDK" was changed to "PTC 模式 SDK" in step
- **The display names and ordering of the 4 modes are completely unchanged**: `standard` = 标准模式 (Standard Mode, order 1), `code`/`ptc` = PTC 模式 (PTC Mode, order 2), `minimal` = 极简模式 (Minimal Mode, order 3), `cordis` = **创造模式** (Create Mode, order 4, described as "for creating custom Agent presets"); of these, the `preset.yml` files of standard/minimal/cordis are byte-identical to rc.6, while ptc's description wording changed from "Code Mode SDK" to "PTC 模式 SDK" (display name and order unchanged)

Impact on this project: the four-mode table "标准 / PTC / 极简 / 创造" in PRD §4.2 **remains accurate at the display-name level** ("创造" is the `cordis` preset, which has not disappeared); but the comparison path referenced by the derivation ledger at `patches/omo-dsh/omo-agents/concerto/agent.cordis.yml:9-10` (`dsh 0.1.0-rc.6 config/agent-presets/standard/agent.cordis.yml`) is stale in the new version — a future bump must re-diff the derivation against the new location.

### 2.2 subagent subsystem: existing mechanisms unchanged, three new capabilities

All existing (MVP-validated) mechanisms are retained: `agentOptions.{provider,model}`, `toolFilter.{allow,deny}`, flat `maxDepth` (default 3, `0` forbids delegation, `'provider-managed'` passes no cap down; a numeric cap requires the provider to have the `depthLimit` capability, otherwise mounting errors out) — `packages/subagent/tool-subagent/src/index.ts:77-103` and schema `:130`.

New:

| Capability | Description | Representative commits |
|---|---|---|
| `modelSelectionSettings` | A tool line can sample the Host's `subagent-model-selection` user setting and inherit it into child sessions; together with the whitelist, authorized models become selectable child routes | `aefc083be7`, `822d735356 feat(session): persist model selection and share its catalog` |
| Named provider instances | The same provider package can mount multiple named instances (e.g. several codex instances with different `model`s) | rc.8 window |
| one-shot / continuable background modes | `backgroundMode` distinguishes the default foreground one-shot from background continuable subagents | rc.8~0.1.1 window |

### 2.3 session events: reading is fail-closed

`42dc2a46c2 refactor(session): require known event types on read` — unknown event types are rejected on read. Impact on this project: the prove scripts (`prove-route-logging.mjs` etc.) parse session JSONL **externally**, bypassing dsh's read path, so they are unaffected; but if custom events are ever appended to a session in the future, their event types must be registered first, otherwise dsh's own session reads will error.

### 2.4 Other headline items (only those adjacent to this project)

- LLM: the dual-adapter layout of `dsh-llm-deepseek` (route name `deepseek-official`) and `dsh-llm-pi-ai` is unchanged; the image request pipeline was unified and DeepSeek reasoning content was fixed
- boot/plugins: the profile bundle system stabilized, with `dsh plugin --profile add/remove` managing bundles outside the tree
- build: Host/Client duality formalized (`docs/development.md:46-76`)

---

## 3. Verdict on the existing planning assumptions

The MVP's V1~V4 and their dependent mechanisms **all still exist** in 0.1.2; no direction re-review is needed:

| Planning dependency | Status in 0.1.2 | Evidence |
|---|---|---|
| V1: scratch plugin loaded via `dsh --patch ./cordis.yml` | Retained; layering is bundle patches → profile patch → home patch → `--patch` (later wins) | `apps/cli/src/args.ts:25,52,132`; `apps/cli/src/profile-boot.ts:146-166` (`composeEntries([bundlePatches, profile.patches, homePatches, overlays])`, ordering conclusion unchanged); `apps/cli/reference/README.md:9` |
| 协奏 (Concerto) mode registrable as the 5th preset | Preset roster is open (`ctx.agentPresets`; roots config + user root `<dshHome>/.agent-presets` + `copy()`) | `packages/preset/agent-presets/src/index.ts:149,159-167,535` |
| V2: `agentOptions.{provider,model}` override | Retained (supported only for in-process providers) | `tool-subagent/src/index.ts:77-78,113-123` |
| V3: `agent/pre-step` waterfall + `agent.inject()` | Retained | `packages/core/agent/src/runtime-types.ts:238` (`@mode waterfall`), `:142-149` |
| V4: `toolFilter` + `maxDepth` | Retained (flat `maxDepth`, no `policy` wrapper, consistent with the P-5/P-10 records) | `tool-subagent/src/index.ts:88-103,130` |
| session JSONL records subagent resolved routes | Retained (`request/header` / `request/context` / `subagent/descriptor`; the child session header contains `origin: 'subagent'`, `parentSession`, `delegationDepth`, `agentPreset`) | `packages/core/session/src/types.ts:75-98` (`parentSession`:75, `origin`:85, `delegationDepth`:91, `agentPreset`:98), `'request/header'`:291, `'request/context'`:301; `packages/subagent/subagent/src/descriptor.ts:38` (data shape :51-86, snapshot build `snapshotSubagentDescriptor` :267-299) |
| deepseek + pi-ai dual built-in adapters | Retained | `packages/llm/llm-deepseek/src/index.ts:83-89`; `packages/llm/llm-pi-ai/src/index.ts:234,287` |

New constraint (§1.4-2): the V2/V4 discipline above does not apply to out-of-process providers — this has no impact within the MVP scope (spawn only), but it is an established premise for the multi-harness follow-up.

---

## 4. Potential follow-up directions (recorded only, no commitment)

Ordered by value/cost, left for decision:

1. **Document fact sync** (low cost): sediment the §2 delta and the §1.4 extension-point conclusions into decisions / PRD / feasibility-report as notes or a new decision.
2. **DSH pin bump verification** (medium cost): CI pin `0.1.0-rc.6` → `0.1.2-alpha.1`, re-derive the concerto preset against the new preset location, re-run the full `ci-local.sh` and the four out-of-session probes, and re-verify whether the P-1.2/P-1.3 fallbacks are still needed under the refactored preset subsystem. This bump is a deliberate upgrade under the D7 (pin-minor) mechanism; the #9 "Bump scripts" item in PRD §1.1 refers to post-OMO-import bump scripts and is unrelated to the DSH pin; this bump is registered as a PRD §12 follow-up (see the entry landed by T3 of the dsh-012-review-sync plan).
3. **codex subagent integration spike** (medium-high cost, requires codex credentials): enable `tool-subagent-codex` in the 协奏 (concerto) preset (`permissionMode: 'never'` fits unattended orchestration), verify "conductor delegating across harnesses", and produce a template for future external CLI agent adapters.

---

**2026-08-29 addendum (found during the pin-bump verification, not the original survey):** executing the bump against a source build of this tag surfaced three changes the survey did not cover: (1) the web-RPC transport was replaced — the readiness line now carries `?token=<launch-token>`; `GET /?token=` → 303 + an authority-bound `dsh-auth-*` cookie is required on every `/api` call (a query token on `/api` itself → 401); the flat endpoints `agentPreset.list` / `llm.providers` are removed (404 even authenticated) in favor of the Typert ClientRemote projection (`agentPresets/list`, `llm/listProviders` + `llm/listConfigurableProviders` joined client-side, `session/create` and `session/prompt` with `{args:{request}}` payloads); (2) the dsh-llm export `CallId` was renamed `ToolCallId` (`packages/llm/llm/lib/index.js:31,:1825`); (3) the `subagent/descriptor` schema version went 2 → 3 (`SUBAGENT_DESCRIPTOR_VERSION`; route fields unchanged). The e2e verbatim rejection contracts themselves are unchanged (`Error: unknown tool "write"`, `Error: subagent depth N exceeds maxDepth M`).

**中文版本**: [`dsh-0.1.2-review_zh-CN.md`](./dsh-0.1.2-review_zh-CN.md)
