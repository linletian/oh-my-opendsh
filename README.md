# oh-my-opendsh

> OMO 风格的 harness 工程能力，跑在 DSH 框架之上

[![License: MIT OR SUL-1.0](https://img.shields.io/badge/license-MIT%20OR%20SUL--1.0-blue.svg)](./LICENSES/oh-my-openagent.LICENSE.md)
[![Framework: DSH MIT](https://img.shields.io/badge/framework-DSH%20MIT-green)](https://github.com/deepseek-ai/deepseek-harness)
[![Upstream OMO: SUL-1.0](https://img.shields.io/badge/upstream%20OMO-SUL--1.0-orange)](https://github.com/code-yeongyu/oh-my-openagent)

> 中文翻译；主入口（英文）见 [README.en.md](./README.en.md)。调研报告（中文）见 [可行性报告](./docs/feasibility-report.md)。

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

## 当前状态

🟡 **预研完成**

- ✅ 调研报告完成（[`docs/feasibility-report.md`](./docs/feasibility-report.md)，11 节，2026-08-16）
- ✅ 6 个关键方向决策已确认（独立仓库 / scratch plugin / 全 LLM 分期 / web ChatNode / 不给 OMO PR / dual license + 直接 import OMO）
- ⏳ 8 个细节决策待定（OMO/DSH pin 策略、npm 命名、Windows 支持范围、telemetry、release 通知、升级节奏、验收分层等）
- ⏳ 工作量粗估：~16 周（一人主力）

## 调研报告

| 语言 | 链接 |
|---|---|
| 🇨🇳 中文（主要） | [`docs/feasibility-report.md`](./docs/feasibility-report.md) |
| 🇬🇧 英文（翻译） | [`docs/feasibility-report.en.md`](./docs/feasibility-report.en.md) |

## 关键事实

| 项 | 值 |
|---|---|
| **DSH 版本** | v0.1.0-rc.5（MIT） |
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

**English version**：[`README.en.md`](./README.en.md)
