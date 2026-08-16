# oh-my-opendsh

> OMO-style harness engineering capabilities, running on the DSH framework

[![License: MIT OR SUL-1.0](https://img.shields.io/badge/license-MIT%20OR%20SUL--1.0-blue.svg)](./LICENSES/oh-my-openagent.LICENSE.md)
[![Framework: DSH MIT](https://img.shields.io/badge/framework-DSH%20MIT-green)](https://github.com/deepseek-ai/deepseek-harness)
[![Upstream OMO: SUL-1.0](https://img.shields.io/badge/upstream%20OMO-SUL--1.0-orange)](https://github.com/code-yeongyu/oh-my-openagent)

[中文版](./README.md) | [Feasibility Report English](./docs/feasibility-report.en.md) | [调研报告 中文](./docs/feasibility-report.md)

## Project Goal

Bring the harness capability system of [oh-my-openagent (OMO)](https://github.com/code-yeongyu/oh-my-openagent) (11 agents, 54+ hooks, LSP/AST-grep/codegraph MCP, `/goal`, `/ultrawork`, Team Mode, hashline edit, Rules Injection, etc.) onto the [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) framework as a DSH-official scratch plugin (loaded via `dsh --patch` overlay), and build a sustainable patch framework that lets us rebase against OMO upstream in **under 1 hour** per OMO bump.

## Design Principles

Every decision in this project is governed by these two principles, which have equal priority and neither can be dropped.

### 1. Fully leverage DSH's flexible advantages
- **Prefer DSH-native capabilities** to satisfy OMO requirements — don't reinvent the wheel (e.g. `ctx.goals` / `ctx.compaction` / `ctx.todo` / `ctx.skill` / `ctx.jobs` / `ctx.subagent` already cover ~60% of OMO's surface)
- **Prefer DSH-official extension paths** (the cookbook's 4 plugin shapes + the official scratch plugin `--patch` mode)
- **Prefer DSH client capabilities** for visualization (web ChatNode via `ConversationNodeDefinition`) — don't tack on tmux externally
- **Prefer DSH's own CI toolchain** (vitest / verify-licenses / cordis-catalog checks)

### 2. Fully honor OMO's harness design philosophy and open-source License
- **Preserve OMO's capability system in full** (11 agents + 30+ hooks + 5 MCPs + Team Mode + hashline + every slash command — ported **completely, no capability cuts**)
- **Directly import OMO's 19 core packages** (lowest upgrade cost: 5-minute script + 0–1 hour listener fix)
- **Fully respect OMO's SUL-1.0 open-source License** (framework dual license: **MIT OR SUL-1.0**)
- **No PRs to OMO** (avoids their "anti-over-abstraction" maintenance philosophy)
- **No commercial distribution** (satisfies SUL-1.0's "non-commercial" requirement)

## Current Status

🟡 **Pre-research complete**

- ✅ Feasibility report complete ([`docs/feasibility-report.en.md`](./docs/feasibility-report.en.md) — English version; [`docs/feasibility-report.md`](./docs/feasibility-report.md) — original Chinese, 11 sections, 2026-08-16)
- ✅ 6 key strategic decisions confirmed (independent repo / scratch plugin / phased LLM coverage / web ChatNode / no OMO PR / dual license + direct OMO import)
- ⏳ 8 detail decisions pending (OMO/DSH pin strategy, npm package naming, Windows support scope, telemetry, release notifications, upgrade cadence, acceptance criteria layering, etc.)
- ⏳ Workload rough estimate: ~16 weeks (one person lead)

## Feasibility Report

| Language | Link |
|---|---|
| 🇬🇧 English (translation) | [`docs/feasibility-report.en.md`](./docs/feasibility-report.en.md) |
| 🇨🇳 Chinese (original) | [`docs/feasibility-report.md`](./docs/feasibility-report.md) |

## Key Facts

| Item | Value |
|---|---|
| **DSH version** | v0.1.0-rc.5 (MIT) |
| **OMO upstream** | 19 core packages + 4 small adapters (harness-agnostic) (SUL-1.0) |
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
- OMO source (via npm dependency) is under OMO's own SUL-1.0
- OMO LICENSE original text: [`LICENSES/oh-my-openagent.LICENSE.md`](./LICENSES/oh-my-openagent.LICENSE.md)
- This project conducts no commercial distribution

---

**中文版**：[`README.md`](./README.md)
