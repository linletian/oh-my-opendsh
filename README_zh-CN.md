# oh-my-opendsh

> OMO 风格的 harness 工程能力，跑在 DSH 框架之上

[![License: MIT OR SUL-1.0](https://img.shields.io/badge/license-MIT%20OR%20SUL--1.0-blue.svg)](./LICENSES/oh-my-openagent.LICENSE.md)
[![Framework: DSH MIT](https://img.shields.io/badge/framework-DSH%20MIT-green)](https://github.com/deepseek-ai/deepseek-harness)
[![Upstream OMO: SUL-1.0](https://img.shields.io/badge/upstream%20OMO-SUL--1.0-orange)](https://github.com/code-yeongyu/oh-my-openagent)

> 中文翻译；主入口（英文）见 [README.md](./README.md)。调研报告（中文）见 [可行性报告](./docs/feasibility-report_zh-CN.md)。

## 项目初衷

我们不相信任何一个大模型的能力足以覆盖所有场景。真实工程问题对能力的需求是多样的——深度推理、快速检索、严谨实现、批判性审查——而每个模型都有所长、有所短。

OMO 的 Agent Team 模式正是对这一判断的回应：与其押注一个"全能"模型，不如让一群各司其职的 agent 协作，合适的模型做合适的事。本项目把这套经过一年多实战检验的多 agent 协作体系带到 DSH 框架上，正是为了让这种"不押注单一模型"的工作方式成为默认，而不是运气。

## 项目目标

把 [oh-my-openagent (OMO)](https://github.com/code-yeongyu/oh-my-openagent) 的 harness 能力体系（11 agent、54+ hook、LSP/AST-grep/codegraph MCP、`/goal`、`/ultrawork`、Team Mode、hashline edit、Rules Injection 等）以 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 官方 scratch plugin 形式（`dsh --patch` overlay）接到 DSH 框架上，并搭一个让 OMO 升级时 **1 小时内完成 rebase** 的可持续 patch 工程。

## 设计原则

本项目所有决策都遵循以下两条原则，二者同等优先、缺一不可。

### 1. 充分利用 DSH 框架的灵活优势做事
- 优先用 DSH 原生能力解决 OMO 需求，**不重复造轮子**（例：`ctx.goals` / `ctx.compaction` / `ctx.todo` / `ctx.skill` / `ctx.jobs` / `ctx.subagent` 等已覆盖 OMO 60% 能力）
- 优先走 DSH 官方扩展路径（cookbook 的 4 种 plugin 形态 + scratch plugin `--patch` 模式）
- 优先用 DSH 客户端能力做可视化（web ChatNode via `ConversationNodeDefinition`），不外挂 tmux
- 优先用 DSH 自身的 CI 工具链（vitest / verify-licenses / cordis-catalog 检查）

### 2. 完整引入 OMO 的 harness 设计哲学，尊重 OMO 开源 License
- 完整保留 OMO 能力体系（11 agent + 30+ hook + 5 MCP + Team Mode + hashline + 所有 slash command **全量移植**）
- 直接 import OMO 19 个核心包源码（升级成本最低，5 分钟脚本 + 0–1 小时修 listener）
- 完整尊重 OMO 的 SUL-1.0 开源 License（框架 dual license：**MIT OR SUL-1.0**）
- 不向 OMO 提 PR（避免其"反过度抽象"的维护哲学冲突）
- 不做销售（满足 SUL-1.0 的"非商业"要求）

## 安装方式

协奏模式以持久化 agent preset（核心）+ 可选动态插件的形式安装。

- **一行命令**（推荐）：

  ```bash
  curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh
  ```

  （备用直链：`https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.2/scripts/install-concerto.sh`）

- **让 DSH 自己装**——把 [docs/install-concerto_zh-CN.md](./docs/install-concerto_zh-CN.md) 里的
  复制即用 prompt 发给任意 DSH 会话即可。

完整指南（选项、适配、卸载——含"选项到底改了啥"的白话说明）：[中文](./docs/install-concerto_zh-CN.md) / [English](./docs/install-concerto.md)。

## 当前状态

🟢 **MVP v0.2 线；dsh 0.1.5-rc.1 已 pin 并通过 L1+L2 验证**

- ✅ 调研报告完成（[`docs/feasibility-report_zh-CN.md`](./docs/feasibility-report_zh-CN.md)，15 节：2026-08-16 主体 + 2026-08-19 追加调研 + 2026-08-29 follow-up note）
- ✅ 13 项决策已确认 + 6 项风险处置已登记（详见[项目决策记录](./docs/decisions_zh-CN.md)）
- ✅ MVP PRD 已采纳（[`docs/mvp-prd_zh-CN.md`](./docs/mvp-prd_zh-CN.md)：协奏模式 + 1 Agent + 1 Subagent 最小骨架，决策 D11）
- ✅ MVP 已结项——FR-1~FR-8 已实现、V1~V4 已验证（见 [mvp-pitfalls](./docs/mvp-pitfalls_zh-CN.md)）
- ✅ **dsh 0.1.5-rc.1 的 pin 已落地**——0.1.2-alpha.1 的复核（[English](./docs/archived/dsh-0.1.2-review.md) / [中文](./docs/archived/dsh-0.1.2-review_zh-CN.md)）在它被 pin 之前就已被取代（那个 tag 从未发布）；升级到 0.1.5-rc.1 已通过 L1+L2 验证——见[复核报告](./docs/dsh-0.1.5-rc.1-review.md) / [升级记录](./docs/dsh-0.1.5-rc.1-upgrade.md)与 PRD §12
- ✅ **当前 DSH 运行时重跑**（2026-09-04）：协奏模式 MVP 已在当前 DSH 环境重新实现并验证
  （`concerto_verify` 22/22 PASS；双 provider 路由 deepseek-official + pi-ai；持久化
  `concerto` 用户 preset + P-19 加固；踩坑 P-13~P-19）——报告见
  [`docs/concerto-current-dsh_zh-CN.md`](./docs/concerto-current-dsh_zh-CN.md)，源码归档
  [`patches/omo-dsh/omo-agents-current/`](./patches/omo-dsh/omo-agents-current/)；
  快速安装见 [`docs/install-concerto_zh-CN.md`](./docs/install-concerto_zh-CN.md)
- ✅ 版本管理与发布流程已落地（决策 D13：三方兼容矩阵 + `scripts/release.sh` 六步发行 + 每周上游探测哨兵；「release 通知」「升级节奏」两个开放维度就此关闭）——见 [`docs/release-process_zh-CN.md`](./docs/release-process_zh-CN.md)
- ⏳ 3 个开放维度待决策（OMO core 包 pin 策略、npm 命名、telemetry；详见决策记录"开放维度"）
- ⏳ 工作量粗估：~16 周（一人主力）

## 项目决策

项目决策记录见[决策记录](./docs/decisions_zh-CN.md)——已确认决策（D1–D13）、风险处置（R1–R6）、开放维度状态跟踪（O1–O8）。可行性报告是决策的调研依据。

## MVP PRD

MVP 产品需求文档（已采纳，决策 D11）见 [MVP PRD：协奏骨架](./docs/mvp-prd_zh-CN.md)。

## 调研报告

调研报告（中文）见 [可行性报告](./docs/feasibility-report_zh-CN.md)。

## 手工测试

手工测试验证指南 / Manual testing guide: [中文](./docs/manual-testing_zh-CN.md) / [English](./docs/manual-testing.md).

## 版本管理与发布

版本管理与发布流程（决策 D13，原则：优先自动化、本地优先省成本）见 [中文](./docs/release-process_zh-CN.md) / [English](./docs/release-process.md)；三方兼容矩阵见 [中文](./docs/compat-matrix_zh-CN.md) / [English](./docs/compat-matrix.md)（单一事实来源 `.omo/compat.yaml`，机器渲染）。

- 发布一行命令：`scripts/release.sh patch|minor|major`（8 门本地门禁 → bump → tag → push → 沙箱安装验证 → GitHub Release）
- 上游新版本：每周 `compat-probe` 工作流自动探测并开 issue；本地 `scripts/compat-probe.sh <版本>` 验证，`scripts/bump-dsh.sh <版本>` 翻 D7 pin

## 关键事实

| 项 | 值 |
|---|---|
| **DSH 版本** | **0.1.5-rc.1**（MIT；CI-pinned）——已在 2026-09-10 升级中端到端验证（[复核报告](./docs/dsh-0.1.5-rc.1-review.md)、[踩坑 P-20](./docs/mvp-pitfalls.md)）。历史 pin：0.1.0-rc.6（MVP 结项）；0.1.2-alpha.1 曾复核但从未 pin |
| **OMO 上游** | 19 个 core 包 + 4 个小 adapter（harness-agnostic）（SUL-1.0） |
| **本项目 license** | **MIT OR SUL-1.0**（dual license） |
| **OMO LICENSE 原文** | [`LICENSES/oh-my-openagent.LICENSE.md`](./LICENSES/oh-my-openagent.LICENSE.md) |
| **目标用户** | DSH 框架使用者 + 想用 OMO 风格 harness 的开发者 |

## 工作量粗估

按工作类型分块（不构成实施计划，仅供可行性参考）：

| 工作类型 | 估时 | 说明 |
|---|---|---|
| 接 OMO 19 core 为 workspace 依赖 | 1 周 | typecheck 过 |
| 写 adapter Cordis plugin | 4 周 | 11 agent + 30 hook 挂载 |
| LLM adapter 补齐 | 2 周 | 先 DeepSeek + OpenAI compat |
| MCP 桥接 | 2 周 | LSP / ast-grep / codegraph / git-bash / web |
| Team Mode 移植 | 3 周 | 用 OMO team-core + DSH subagent |
| Profile / bundle 化 | 1 周 | cordis.yml + omo.profile.json |
| 端到端测试 + 性能调优 | 2 周 | smoke test |
| 文档 + 上手指南 | 1 周 | docs/ |
| **合计** | **~16 周 / 4 个月** | 一人主力 |

详见调研报告 §2.10 移植工作量粗估 与 §8 验收标准。

## 致谢

- [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — OMO 上游，11 agent / 54 hook 的设计源头
- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) — DSH 框架，"一切皆插件" 的宿主
- [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) — hashline 概念源头
- [obra/superpowers](https://github.com/obra/superpowers) — 跨 harness skill 系统灵感

## License

本项目以 **MIT OR SUL-1.0** dual license 发布。

- 框架代码部分以 MIT 协议发布
- OMO 源码部分（通过 npm 依赖）以 OMO 自身 SUL-1.0 协议发布
- OMO LICENSE 原文见 [`LICENSES/oh-my-openagent.LICENSE.md`](./LICENSES/oh-my-openagent.LICENSE.md)
- 本项目不进行任何形式的商业分发

---

**English version**：[`README.md`](./README.md)
