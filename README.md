# oh-my-opendsh

> OMO-style harness engineering capabilities, running on the DSH framework

[![License: MIT OR SUL-1.0](https://img.shields.io/badge/license-MIT%20OR%20SUL--1.0-blue.svg)](./LICENSES/oh-my-openagent.LICENSE.md)
[![Framework: DSH MIT](https://img.shields.io/badge/framework-DSH%20MIT-green)](https://github.com/deepseek-ai/deepseek-harness)
[![Upstream OMO: SUL-1.0](https://img.shields.io/badge/upstream%20OMO-SUL--1.0-orange)](https://github.com/code-yeongyu/oh-my-openagent)

> **Primary entry (English).** For the Chinese version, see [README_zh-CN.md](./README_zh-CN.md). For the full research report, see [Feasibility Report](./docs/feasibility-report.md).

## Why This Project

We don't believe any single LLM is capable enough to cover every scenario. Real engineering work demands a diverse mix of capabilities — deep reasoning, fast retrieval, disciplined implementation, critical review — and every model has strengths and blind spots.

OMO's Agent Team mode is the answer to that belief: instead of betting on one "do-everything" model, let a team of specialized agents collaborate, with the right model doing the right job. This project brings that battle-tested multi-agent collaboration system onto the DSH framework, precisely to make "don't bet on a single model" the default way of working — not a matter of luck.

## Project Goal

Bring the harness capability system of [oh-my-openagent (OMO)](https://github.com/code-yeongyu/oh-my-openagent) (11 agents, 54+ hooks, LSP/AST-grep MCP, `/goal`, `/ultrawork`, Team Mode, hashline edit, Rules Injection, etc.) onto the [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) framework as a DSH-official scratch plugin (loaded via `dsh --patch` overlay). This is a **one-time semantic transplant, not an ongoing dependency**: the OMO baseline is frozen at **v4.19.4** (decision D14), code intake happens by SUL-1.0-compliant git vendoring at full-port time, and upstream awareness is maintained by reading the OMO changelog at our own release nodes — no beta chasing, no standing rebase cadence. Development is guided by the [Roadmap](./docs/roadmap.md).

## Design Principles

Every decision in this project is governed by these two principles, which have equal priority and neither can be dropped.

### 1. Fully leverage DSH's flexible advantages
- **Prefer DSH-native capabilities** to satisfy OMO requirements — don't reinvent the wheel (e.g. `ctx.goals` / `ctx.compaction` / `ctx.todo` / `ctx.skill` / `ctx.jobs` / `ctx.subagent` already cover ~60% of OMO's surface)
- **Prefer DSH-official extension paths** (the cookbook's 4 plugin shapes + the official scratch plugin `--patch` mode)
- **Prefer DSH client capabilities** for visualization (web ChatNode via `ConversationNodeDefinition`) — don't tack on tmux externally
- **Prefer DSH's own CI toolchain** (vitest / verify-licenses / cordis-catalog checks)

### 2. Fully honor OMO's harness design philosophy and open-source License
- **Preserve OMO's capability system in full** (11 agents + 30+ hooks + 5 MCPs + Team Mode + hashline + every slash command — ported **completely, no capability cuts**)
- **Vendor OMO core-package source under SUL-1.0 when needed** (decision D14: the 19 core packages are `private: true` and never published to npm, so intake = git vendoring with verbatim LICENSE + full attribution — not an npm dependency stream)
- **Fully respect OMO's SUL-1.0 open-source License** (framework dual license: **MIT OR SUL-1.0**)
- **No PRs to OMO** (avoids their "anti-over-abstraction" maintenance philosophy)
- **No commercial distribution** (satisfies SUL-1.0's "non-commercial" requirement)

## Installation

Concerto Mode (协奏模式) installs as a persistent agent preset (core) plus an optional dynamic plugin.
The preset carries an **11-agent roster**: the conductor **sisyphus** plus **10 delegation
targets**, each on its own route binding.

| Delegation target | Class | Seat (default provider / model) |
|---|---|---|
| `explore` | read-only | fast — `deepseek` / `deepseek-v4-flash` |
| `hephaestus` | worker | strong — `deepseek-official` / `deepseek-v4-pro` |
| `oracle` | read-only | strong — `deepseek-official` / `deepseek-v4-pro` |
| `librarian` | read-only | fast — `deepseek` / `deepseek-v4-flash` |
| `plan-consultant` | read-only | strong — `deepseek-official` / `deepseek-v4-pro` |
| `plan-reviewer` | read-only | strong — `deepseek-official` / `deepseek-v4-pro` |
| `atlas` | orchestrator | strong — `deepseek-official` / `deepseek-v4-pro` |
| `multimodal-looker` | allowlist (`read`, `read_image`) | vision — `deepseek-official` / `deepseek-v4-flash-vision-exp` |
| `sisyphus-junior` | worker | fast — `deepseek` / `deepseek-v4-flash` |
| `prometheus` | read-only | strong — `deepseek-official` / `deepseek-v4-pro` |

> ⚠️ **A complete roster is not a complete OMO orchestration surface**
> (risk R-8, docs/plans/phase2-dev/phase2-plan.md §6). That sentence named two further
> senses; one of them has since closed — the `/ulw-*` command face (Phase 4) **has landed**
> here (R-7; see "Phase 4 command face landed" below). The other stands: Team Mode
> membership semantics (Phase 5) — **not claimed in this repository today**.

- **One line** (recommended):

  ```bash
  curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh
  ```

  (fallback direct link: `https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.2/scripts/install-concerto.sh`)

- **Let DSH install itself** — send any DSH session the copy-paste prompt from
  [docs/install-concerto.md](./docs/install-concerto.md) and it sets itself up.

Full guide (options, adaptation, uninstall — incl. a plain-language "what the options actually change" section): [English](./docs/install-concerto.md) / [中文](./docs/install-concerto_zh-CN.md).

> 📌 **Installer channel:** the install paths above still ship the **1+1 preset** (the frozen
> v0.2 archive, [`patches/omo-dsh/omo-agents-current/`](./patches/omo-dsh/omo-agents-current/)),
> not the 11-agent roster. The full roster ships with a **future release**; whether and when it
> is pushed down this channel is a Phase 7 release-cadence decision (plan §4.8).

### Roster routes & env override table / 名册路由与 env 覆盖表

**Single source of truth:** [`patches/omo-dsh/omo-agents/src/roster.ts`](./patches/omo-dsh/omo-agents/src/roster.ts)
(the `ROSTER` rows below are copied from it) — mirrored as the data table in
[`docs/plans/phase2-dev/phase2-roster.md`](./docs/plans/phase2-dev/phase2-roster.md) §1. Every
default is overridable per agent through the env pair, so the model chain stays in configuration
rather than in code.

| # | Agent | Class | `maxDepth` | Seat | Default `provider` / `model` | Env override pair |
|---|---|---|---|---|---|---|
| 1 | `sisyphus` (conductor — route only, not a delegation tool) | — | — | strong | `deepseek-official` / `deepseek-v4-pro` | `OMO_SISYPHUS_PROVIDER` / `OMO_SISYPHUS_MODEL` |
| 2 | `explore` | read-only | 2 | fast | `deepseek` / `deepseek-v4-flash` | `OMO_EXPLORE_PROVIDER` / `OMO_EXPLORE_MODEL` |
| 3 | `hephaestus` | worker | 2 | strong | `deepseek-official` / `deepseek-v4-pro` | `OMO_HEPHAESTUS_PROVIDER` / `OMO_HEPHAESTUS_MODEL` |
| 4 | `oracle` | read-only | 2 | strong | `deepseek-official` / `deepseek-v4-pro` | `OMO_ORACLE_PROVIDER` / `OMO_ORACLE_MODEL` |
| 5 | `librarian` | read-only | 2 | fast | `deepseek` / `deepseek-v4-flash` | `OMO_LIBRARIAN_PROVIDER` / `OMO_LIBRARIAN_MODEL` |
| 6 | `plan-consultant` | read-only | 2 | strong | `deepseek-official` / `deepseek-v4-pro` | `OMO_PLAN_CONSULTANT_PROVIDER` / `OMO_PLAN_CONSULTANT_MODEL` |
| 7 | `plan-reviewer` | read-only | 2 | strong | `deepseek-official` / `deepseek-v4-pro` | `OMO_PLAN_REVIEWER_PROVIDER` / `OMO_PLAN_REVIEWER_MODEL` |
| 8 | `atlas` | orchestrator | 2 | strong | `deepseek-official` / `deepseek-v4-pro` | `OMO_ATLAS_PROVIDER` / `OMO_ATLAS_MODEL` |
| 9 | `multimodal-looker` | allowlist | 2 | vision | `deepseek-official` / `deepseek-v4-flash-vision-exp` | `OMO_MULTIMODAL_LOOKER_PROVIDER` / `OMO_MULTIMODAL_LOOKER_MODEL` |
| 10 | `sisyphus-junior` | worker | 2 | fast | `deepseek` / `deepseek-v4-flash` | `OMO_SISYPHUS_JUNIOR_PROVIDER` / `OMO_SISYPHUS_JUNIOR_MODEL` |
| 11 | `prometheus` | read-only | 2 | strong | `deepseek-official` / `deepseek-v4-pro` | `OMO_PROMETHEUS_PROVIDER` / `OMO_PROMETHEUS_MODEL` |

- **Hard precheck (AC-5):** the conductor route and the `explore` route must **differ**. An
  equal pair is a loud, fatal error at apply time, not a warning — "don't bet on a single
  model" is only real if the conductor and its retrieval child sit on different routes.
- **Two non-blocking seat warnings** (boot log only; each says "check this deployment's
  config", never "the boot failed"): ① every one of the 11 rows resolves to the *same* route;
  ② **all 10 delegation targets** land on the *same* seat (a single-seat concentration hint).
- **Provider-registration warning (non-blocking):** a route whose provider is not registered
  (typically a deployment with no `llm-pi-ai` settings section, which leaves the fast seat
  unregistered) logs `route provider not registered: <provider> (agents: …)` at boot. The check
  is **settled**, not synchronous — settings-driven adapters register *after* a plugin's
  `apply()`, so a bare apply-time read false-positives. Deliberate consequence: the missing
  provider is visible at **boot**, not first discovered when a fast-seat child is delegated to.
- **`maxDepth: 2` on every delegation row** is the *invoked* row's cap (dsh reads
  `config.maxDepth` → `request.maxDepth` → `resolveChildDepth`), so chains reach 2 levels
  (conductor 0 → `atlas` 1 → worker 2) and depth 3 is structurally impossible; the per-class
  deny lists remain the primary nested-delegation guard.

## Current Status

🟢 **MVP v0.2 line; dsh 0.1.5-rc.1 pinned and verified (L1+L2)**

- ✅ Feasibility report complete ([`docs/feasibility-report.md`](./docs/feasibility-report.md), 16 sections: 2026-08-16 main body + 2026-08-19 follow-up research + 2026-08-29 follow-up note + 2026-09-11 OMO v5.0 errata)
- ✅ 14 decisions confirmed + 6 risk dispositions registered (see the [decision record](./docs/decisions.md))
- ✅ **OMO v5.0 surveyed; baseline frozen at v4.19.4** (2026-09-11, decision D14) — full-port development follows the [Roadmap](./docs/roadmap.md); the v5 findings live in two investigation reports ([architecture](./docs/omo-v4.19.4-vs-v5.0.0-beta.53-architecture-investigation.md), [agent teams](./docs/omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md)) and feasibility report §16
- ✅ **`@oh-my-opencode/hashline-core` vendored — but not yet consumed** (2026-09-11, Phase 1) — the OMO v4.19.4 package is vendored under [`patches/omo-dsh/vendor/hashline-core`](./patches/omo-dsh/vendor/hashline-core) as a pnpm workspace package whose tests run in `pnpm vitest run`; **nothing consumes it yet**: no preset and no Concerto code imports it, so this is *not* "hashline is integrated" — provenance, per-file attribution and the "modified copy" notice are in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md), and the plan plus compliance tables are in [`docs/plans/phase1-dev/`](./docs/plans/phase1-dev/)
- ✅ MVP PRD adopted ([`docs/mvp-prd.md`](./docs/mvp-prd.md): Concerto Mode + 1 Agent + 1 Subagent minimal skeleton, decision D11)
- ✅ MVP closed — FR-1~FR-8 implemented, V1~V4 verified (see [mvp-pitfalls](./docs/mvp-pitfalls.md))
- ✅ **dsh 0.1.5-rc.1 pin landed** — the 0.1.2-alpha.1 review ([English](./docs/archived/dsh-0.1.2-review.md) / [中文](./docs/archived/dsh-0.1.2-review_zh-CN.md)) was superseded before it was ever pinned (that tag was never published); the upgrade to 0.1.5-rc.1 is verified L1+L2 — see the [review](./docs/dsh-0.1.5-rc.1-review.md) / [upgrade record](./docs/dsh-0.1.5-rc.1-upgrade.md) and PRD §12
- ✅ **Current-DSH runtime re-run** (2026-09-04): the Concerto MVP was re-implemented and verified
  on the current DSH environment (`concerto_verify` 22/22 PASS; dual-provider routing
  deepseek-official + pi-ai; persistent `concerto` user preset with P-19 hardening; pitfalls
  P-13~P-19) — see the report [`docs/concerto-current-dsh_zh-CN.md`](./docs/concerto-current-dsh_zh-CN.md)
  (Chinese), source archive [`patches/omo-dsh/omo-agents-current/`](./patches/omo-dsh/omo-agents-current/),
  and the quick install guide [`docs/install-concerto.md`](./docs/install-concerto.md)
- ✅ Version management & release process landed (decision D13: three-party compat matrix + `scripts/release.sh` six-step release + weekly upstream sentinel; the "release notifications" and "upgrade cadence" open dimensions are closed) — see [`docs/release-process.md`](./docs/release-process.md)
- ✅ **Phase 3 hook listener port landed** (2026-09-21, branch `feature/phase3-dev`) — the `omo-hooks` plugin ports OMO's behaviour-guardrail hooks onto DSH events: 14 modules ported (file/read advisory, todo continuation, session/background notifications, error recoveries, output truncation, README injection, usage reminders, webfetch/prometheus guards, ulw-execute work activation) with mock-LLM e2e per module; 47 further modules carry documented skip/defer verdicts (DSH-native coverage incl. `fs-observation-policy` + `dsh-goal` + `dsh-compaction`, Phase 4/5/6/7 ownership). The per-module authority is the coverage baseline [`docs/plans/phase3-dev/`](./docs/plans/phase3-dev/). ⚠️ **A guardrail layer is not the command face** (R-7): hook layer complete **≠** the `/ulw-*` commands (Phase 4) **≠** Team Mode (Phase 5)
- ✅ **Phase 4 command face landed** (2026-10, branch `feature/phase4-dev`) — the `omo-commands` plugin registers **5 builtin commands** as semantic ports of OMO's builtin commands (`/ulw-execute`, `/handoff`, `/remove-ai-slops`, `/stop-continuation`, `/hyperplan`), each with per-file upstream provenance and a mock-LLM e2e scenario; **`/ulw-execute` additionally carries the R-10 marker closure into the Phase 3 `ulw-execute` listener** (the other four have no `$SESSION_ID` and no `<session-context>` frame, so R-10 does not apply to them); `/ulw-plan` lands as a **zero-code gesture bridge** (DSH's own skill gesture) and is deliberately never registered as a command. 19 OMO instruction skills are **vendored content** (not ported), and the `keyword-detector` listener (H-33) landed on `agent/pre-step`. The per-row authority is the coverage baseline [`docs/plans/phase4-dev/`](./docs/plans/phase4-dev/); attribution is in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md). ⚠️ **The command face is not OMO's whole orchestration surface** (R-7, unchanged by this landing): command face landed **≠** Team Mode (`team_create`, the adversarial review loop, `team` keywords — Phase 5) **≠** the editing face (`/refactor`, LSP/ast-grep — Phase 6); `/hyperplan` is a **degraded form** (roster delegation in place of `team_*`) and must declare that degradation in its reply; `ralph` has **no programmable stop API** on this runtime (registered as a difference, never promised as cancellable); `session_read` is narrowed to guidance prose.
- ⏳ 2 open dimensions pending decision (npm package naming, telemetry; see "Open dimensions" in the decision record — the OMO core-package intake strategy was closed as D14)
- ⏳ Workload rough estimate: ~16 weeks (one person lead)

## Project Decisions

The project decision record lives in [decisions.md](./docs/decisions.md) — confirmed decisions (D1–D14), risk dispositions (R1–R6), and open-dimension status tracking (O1–O8). The feasibility report is the research basis for those decisions.

## Roadmap

The development roadmap under the frozen OMO v4.19.4 baseline (adopted 2026-09-11 with decision D14) lives in [English](./docs/roadmap.md) / [中文](./docs/roadmap_zh-CN.md).

## MVP PRD

The MVP product requirements document (adopted, decision D11) is at [MVP PRD: Concerto Skeleton](./docs/mvp-prd.md).

## Feasibility Report

Feasibility Report is at [feasibility-report.md](./docs/feasibility-report.md).

## Manual Testing

Manual testing guide / 手工测试验证指南: [English](./docs/manual-testing.md) / [中文](./docs/manual-testing_zh-CN.md).

## Versioning & Releases

The version management & release process (decision D13; principles: automation first, local-first cost) lives in [English](./docs/release-process.md) / [中文](./docs/release-process_zh-CN.md); the three-party compatibility matrix is at [English](./docs/compat-matrix.md) / [中文](./docs/compat-matrix_zh-CN.md) (single source of truth `.omo/compat.yaml`, machine-rendered).

- Release in one line: `scripts/release.sh patch|minor|major` (8 local gates → bump → tag → push → sandboxed install verify → GitHub Release)
- New upstream versions: the weekly `compat-probe` workflow detects and opens an issue; verify locally with `scripts/compat-probe.sh <version>`, flip the D7 pin with `scripts/bump-dsh.sh <version>`

## Key Facts

| Item | Value |
|---|---|
| **DSH version** | **0.1.5-rc.1** (MIT; CI-pinned) — verified end-to-end in the 2026-09-10 upgrade ([review](./docs/dsh-0.1.5-rc.1-review.md), [pitfalls P-20](./docs/mvp-pitfalls.md)). Previous pins: 0.1.0-rc.6 (MVP closeout), with 0.1.2-alpha.1 reviewed but never pinned |
| **OMO upstream** | 19 core packages + 4 small adapters (harness-agnostic) (SUL-1.0); **baseline frozen at v4.19.4** (D14) — v5.0 surveyed 2026-09-11, tracked for awareness only |
| **This project's license** | **MIT OR SUL-1.0** (dual license) |
| **OMO LICENSE (original text)** | [`LICENSES/oh-my-openagent.LICENSE.md`](./LICENSES/oh-my-openagent.LICENSE.md) |
| **Target users** | DSH framework users + developers who want OMO-style harness capabilities |

## Workload Rough Estimate

Workload breakdown by work type (not an implementation plan, just feasibility input):

| Work Type | Estimate | Notes |
|---|---|---|
| Wire OMO 19 core as workspace dependencies | 1 week | typecheck pass |
| Write adapter Cordis plugin | 4 weeks | 11 agents + 30 hooks mounted |
| LLM adapter completion | 2 weeks | DeepSeek + OpenAI compat first |
| MCP bridging | 2 weeks | LSP / ast-grep / codegraph / git-bash / web |
| Team Mode port | 3 weeks | using OMO team-core + DSH subagent |
| Profile / bundle-ification | 1 week | cordis.yml + omo.profile.json |
| End-to-end testing + performance tuning | 2 weeks | smoke test |
| Docs + getting started guide | 1 week | docs/ |
| **Total** | **~16 weeks / 4 months** | one person lead |

See report §2.10 (Port Workload Rough Estimate) and §8 (Acceptance Criteria) for details.

## Acknowledgements

- [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — OMO upstream, design source of the 11 agents / 54 hooks
- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) — DSH framework, "everything is a plugin" host
- [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) — origin of the hashline concept
- [obra/superpowers](https://github.com/obra/superpowers) — inspiration for cross-harness skill system

## License

This project is released under the **MIT OR SUL-1.0** dual license.

- Framework code is released under MIT
- OMO source (vendored from the frozen v4.19.4 baseline when needed, decision D14) is under OMO's own SUL-1.0
- OMO LICENSE original text: [`LICENSES/oh-my-openagent.LICENSE.md`](./LICENSES/oh-my-openagent.LICENSE.md)
- This project conducts no commercial distribution

---

**中文版**：[`README_zh-CN.md`](./README_zh-CN.md)
