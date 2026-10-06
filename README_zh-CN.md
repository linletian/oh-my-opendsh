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

把 [oh-my-openagent (OMO)](https://github.com/code-yeongyu/oh-my-openagent) 的 harness 能力体系（11 agent、54+ hook、LSP/AST-grep MCP、`/goal`、`/ultrawork`、Team Mode、hashline edit、Rules Injection 等）以 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 官方 scratch plugin 形式（`dsh --patch` overlay）接到 DSH 框架上。这是**一次性语义移植，不是持续依赖**：OMO 基线冻结在 **v4.19.4**（决策 D14），全量移植时的代码引进按 SUL-1.0 以 git vendor 方式进行，上游认知通过在本项目自己的 release 节点读 OMO changelog 维持——不追 beta、不设常驻 rebase 节奏。开发方向由 [ROADMAP](./docs/roadmap_zh-CN.md) 指导。

## 设计原则

本项目所有决策都遵循以下两条原则，二者同等优先、缺一不可。

### 1. 充分利用 DSH 框架的灵活优势做事
- 优先用 DSH 原生能力解决 OMO 需求，**不重复造轮子**（例：`ctx.goals` / `ctx.compaction` / `ctx.todo` / `ctx.skill` / `ctx.jobs` / `ctx.subagent` 等已覆盖 OMO 60% 能力）
- 优先走 DSH 官方扩展路径（cookbook 的 4 种 plugin 形态 + scratch plugin `--patch` 模式）
- 优先用 DSH 客户端能力做可视化（web ChatNode via `ConversationNodeDefinition`），不外挂 tmux
- 优先用 DSH 自身的 CI 工具链（vitest / verify-licenses / cordis-catalog 检查）

### 2. 完整引入 OMO 的 harness 设计哲学，尊重 OMO 开源 License
- 完整保留 OMO 能力体系（11 agent + 30+ hook + 5 MCP + Team Mode + hashline + 所有 slash command **全量移植**）
- 需要时按 SUL-1.0 vendor OMO core 包源码（决策 D14：19 个 core 包全是 `private: true`、从未发布 npm，引进 = git vendor + LICENSE 原文 + 完整署名——不是 npm 依赖流）
- 完整尊重 OMO 的 SUL-1.0 开源 License（框架 dual license：**MIT OR SUL-1.0**）
- 不向 OMO 提 PR（避免其"反过度抽象"的维护哲学冲突）
- 不做销售（满足 SUL-1.0 的"非商业"要求）

## 安装方式

协奏模式以持久化 agent preset（核心）+ 可选动态插件的形式安装。
preset 携带 **11-agent 名册**：指挥 **sisyphus** + **10 个委派目标**，各自持有独立的可覆盖路由绑定。

| 委派目标 | 类 | 席位（默认 provider / model） |
|---|---|---|
| `explore` | 只读 | 快座 — `deepseek` / `deepseek-flash` |
| `hephaestus` | worker | 强座 — `deepseek-official` / `deepseek-v4-pro` |
| `oracle` | 只读 | 强座 — `deepseek-official` / `deepseek-v4-pro` |
| `librarian` | 只读 | 快座 — `deepseek` / `deepseek-flash` |
| `plan-consultant` | 只读 | 强座 — `deepseek-official` / `deepseek-v4-pro` |
| `plan-reviewer` | 只读 | 强座 — `deepseek-official` / `deepseek-v4-pro` |
| `atlas` | orchestrator | 强座 — `deepseek-official` / `deepseek-v4-pro` |
| `multimodal-looker` | allowlist（`read`、`read_image`） | 视觉座 — `deepseek-official` / `deepseek-flash` |
| `sisyphus-junior` | worker | 快座 — `deepseek` / `deepseek-flash` |
| `prometheus` | 只读 | 强座 — `deepseek-official` / `deepseek-v4-pro` |

> ⚠️ **名册完整 ≠ 完整的 OMO 编排面**（风险 R-8，见 docs/plans/phase2-dev/phase2-plan.md §6）。那句话点名了另外两件事，其中一件已经关闭
> ——`/ulw-*` 命令面（Phase 4）**已在本仓库落地**（R-7；见下方「Phase 4 命令面已落地」）。另一件仍然成立：Team Mode 的成员语义（Phase 5）
> ——**本仓库今日不作此宣称**。

- **一行命令**（推荐）：

  ```bash
  curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh
  ```

  （备用直链：`https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.2/scripts/install-concerto.sh`）

- **让 DSH 自己装**——把 [docs/install-concerto_zh-CN.md](./docs/install-concerto_zh-CN.md) 里的
  复制即用 prompt 发给任意 DSH 会话即可。

完整指南（选项、适配、卸载——含"选项到底改了啥"的白话说明）：[中文](./docs/install-concerto_zh-CN.md) / [English](./docs/install-concerto.md)。

> 📌 **installer 通道**：上面的安装途径仍下发 **1+1 preset**（v0.2 冻结归档
> [`patches/omo-dsh/omo-agents-current/`](./patches/omo-dsh/omo-agents-current/)），**不是** 11-agent
> 名册。完整名册随**未来 release** 提供；是否/何时经该通道下发，属 Phase 7 的发布节奏决策（计划书 §4.8）。

### 名册路由与 env 覆盖表

**单一事实源**：[`patches/omo-dsh/omo-agents/src/roster.ts`](./patches/omo-dsh/omo-agents/src/roster.ts)
（下表逐行复制自其 `ROSTER`）——数据表镜像见
[`docs/plans/phase2-dev/phase2-roster.md`](./docs/plans/phase2-dev/phase2-roster.md) §1。每个默认值都可用
env 对逐 agent 覆盖，因此模型链留在配置里，而不在代码里。

| # | Agent | 类 | `maxDepth` | 席位 | 默认 `provider` / `model` | env 覆盖对 |
|---|---|---|---|---|---|---|
| 1 | `sisyphus`（指挥——只持路由，不是委派工具） | — | — | 强座 | `deepseek-official` / `deepseek-v4-pro` | `OMO_SISYPHUS_PROVIDER` / `OMO_SISYPHUS_MODEL` |
| 2 | `explore` | 只读 | 2 | 快座 | `deepseek` / `deepseek-flash` | `OMO_EXPLORE_PROVIDER` / `OMO_EXPLORE_MODEL` |
| 3 | `hephaestus` | worker | 2 | 强座 | `deepseek-official` / `deepseek-v4-pro` | `OMO_HEPHAESTUS_PROVIDER` / `OMO_HEPHAESTUS_MODEL` |
| 4 | `oracle` | 只读 | 2 | 强座 | `deepseek-official` / `deepseek-v4-pro` | `OMO_ORACLE_PROVIDER` / `OMO_ORACLE_MODEL` |
| 5 | `librarian` | 只读 | 2 | 快座 | `deepseek` / `deepseek-flash` | `OMO_LIBRARIAN_PROVIDER` / `OMO_LIBRARIAN_MODEL` |
| 6 | `plan-consultant` | 只读 | 2 | 强座 | `deepseek-official` / `deepseek-v4-pro` | `OMO_PLAN_CONSULTANT_PROVIDER` / `OMO_PLAN_CONSULTANT_MODEL` |
| 7 | `plan-reviewer` | 只读 | 2 | 强座 | `deepseek-official` / `deepseek-v4-pro` | `OMO_PLAN_REVIEWER_PROVIDER` / `OMO_PLAN_REVIEWER_MODEL` |
| 8 | `atlas` | orchestrator | 2 | 强座 | `deepseek-official` / `deepseek-v4-pro` | `OMO_ATLAS_PROVIDER` / `OMO_ATLAS_MODEL` |
| 9 | `multimodal-looker` | allowlist | 2 | 视觉座 | `deepseek-official` / `deepseek-flash` | `OMO_MULTIMODAL_LOOKER_PROVIDER` / `OMO_MULTIMODAL_LOOKER_MODEL` |
| 10 | `sisyphus-junior` | worker | 2 | 快座 | `deepseek` / `deepseek-flash` | `OMO_SISYPHUS_JUNIOR_PROVIDER` / `OMO_SISYPHUS_JUNIOR_MODEL` |
| 11 | `prometheus` | 只读 | 2 | 强座 | `deepseek-official` / `deepseek-v4-pro` | `OMO_PROMETHEUS_PROVIDER` / `OMO_PROMETHEUS_MODEL` |

- **硬预检（AC-5）**：指挥路由与 `explore` 路由必须**不同**。两者相同会在 apply 时**响亮致命报错**，
  不是警告——"不赌单一模型"只有在指挥与它的检索子级分处两条路由时才算兑现。
- **两条非阻断席位警告**（仅 boot 日志；每条都在说"查这个部署的配置"，从不是"启动失败"）：
  ① 11 行解析到**同一条**路由；② **全部 10 个委派目标**落在**同一席位**（单席位集中提示）。
- **provider 注册警告（非阻断）**：路由的 provider 未注册时（典型是没有 `llm-pi-ai` settings 段的部署，
  快座因此未注册）boot 打印 `route provider not registered: <provider> (agents: …)`。该检查是
  **settled** 的，不是同步读——settings 驱动的 adapter 在一个插件 `apply()` **之后**才注册，裸的
  apply 时刻直读会误报。刻意的后果：缺 provider 在 **boot** 可见，而不是等到快座子级被委派时才首次发现。
- **每个委派行 `maxDepth: 2`** 是**被调用行**的上限（dsh 读 `config.maxDepth` → `request.maxDepth` →
  `resolveChildDepth`），因此委派链最深 2 层（指挥 0 → `atlas` 1 → worker 2）、depth-3 结构性不可能；
  逐类 deny 名单仍是嵌套委派的主防。

## 当前状态

🟢 **MVP v0.2 线；dsh 0.2.0-rc.2 已 pin（D17 切换——放弃 0.1.x 兼容）**

- ✅ 调研报告完成（[`docs/feasibility-report_zh-CN.md`](./docs/feasibility-report_zh-CN.md)，16 节：2026-08-16 主体 + 2026-08-19 追加调研 + 2026-08-29 follow-up note + 2026-09-11 OMO v5.0 勘误）
- ✅ 14 项决策已确认 + 6 项风险处置已登记（详见[项目决策记录](./docs/decisions_zh-CN.md)）
- ✅ **OMO v5.0 已调研；基线冻结在 v4.19.4**（2026-09-11，决策 D14）——全量移植开发遵循 [ROADMAP](./docs/roadmap_zh-CN.md)；v5 发现沉淀于两份调查报告（[架构](./docs/omo-v4.19.4-vs-v5.0.0-beta.53-architecture-investigation.md)、[agent 团队](./docs/omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md)）与可行性报告 §16
- ✅ **`@oh-my-opencode/hashline-core` 已 vendor——但尚未被消费**（2026-09-11，Phase 1）——OMO v4.19.4 的该包已 vendor 到 [`patches/omo-dsh/vendor/hashline-core`](./patches/omo-dsh/vendor/hashline-core)，作为 pnpm workspace 包、其测试已纳入 `pnpm vitest run`；**目前没有任何消费方**：没有 preset、也没有协奏模式代码 import 它，因此这**不是**"hashline 已接入"——来源、逐文件署名与"已修改"声明见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)，计划与合规核对表见 [`docs/plans/phase1-dev/`](./docs/plans/phase1-dev/)
- ✅ MVP PRD 已采纳（[`docs/mvp-prd_zh-CN.md`](./docs/mvp-prd_zh-CN.md)：协奏模式 + 1 Agent + 1 Subagent 最小骨架，决策 D11）
- ✅ MVP 已结项——FR-1~FR-8 已实现、V1~V4 已验证（见 [mvp-pitfalls](./docs/mvp-pitfalls_zh-CN.md)）
- ✅ **dsh 0.2.0-rc.2 切换已落地（D17，P4.5-T12b）**——CI pin 与席位 id 在**同一次变更**中翻转：pin 从 `0.1.5-rc.1` 改钉 `0.2.0-rc.2`，快座改钉 `deepseek/deepseek-flash`、视觉座改钉 `deepseek-official/deepseek-flash`（即已安装的 pi-ai@0.87.1 / dsh-llm-deepseek@0.2.x 目录真实列出的 id；`deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` 是 0.1.x 时代的 id）。0.1.x 兼容性**已放弃**——CI 不再跑 0.1.5。历史记录：0.1.2-alpha.1 的复核（[English](./docs/archived/dsh-0.1.2-review.md) / [中文](./docs/archived/dsh-0.1.2-review_zh-CN.md)）在它被 pin 之前就已被取代（那个 tag 从未发布）；更早升级到 0.1.5-rc.1 时已通过 L1+L2 验证——见[复核报告](./docs/dsh-0.1.5-rc.1-review.md) / [升级记录](./docs/dsh-0.1.5-rc.1-upgrade.md)与 PRD §12
- ✅ **当前 DSH 运行时重跑**（2026-09-04）：协奏模式 MVP 已在当前 DSH 环境重新实现并验证
  （`concerto_verify` 22/22 PASS；双 provider 路由 deepseek-official + pi-ai；持久化
  `concerto` 用户 preset + P-19 加固；踩坑 P-13~P-19）——报告见
  [`docs/concerto-current-dsh_zh-CN.md`](./docs/concerto-current-dsh_zh-CN.md)，源码归档
  [`patches/omo-dsh/omo-agents-current/`](./patches/omo-dsh/omo-agents-current/)；
  快速安装见 [`docs/install-concerto_zh-CN.md`](./docs/install-concerto_zh-CN.md)
- ✅ 版本管理与发布流程已落地（决策 D13：三方兼容矩阵 + `scripts/release.sh` 六步发行 + 每周上游探测哨兵；「release 通知」「升级节奏」两个开放维度就此关闭）——见 [`docs/release-process_zh-CN.md`](./docs/release-process_zh-CN.md)
- ✅ **Phase 3 hook listener 移植已落地**（2026-09-21，分支 `feature/phase3-dev`）——`omo-hooks` 插件把 OMO 的行为护栏 hook 移植到 DSH 事件：14 个模块已移植（文件读取劝导、todo 续行、会话/后台通知、错误恢复、输出截断、README 注入、使用提醒、webfetch/prometheus 门、ulw-execute 工作激活），每模块带 mock-LLM e2e；另有 47 个模块带成文的跳过/deferred 判定（含 DSH 原生覆盖——`fs-observation-policy`/`dsh-goal`/`dsh-compaction`——与 Phase 4/5/6/7 归属）。逐模块权威 = 覆盖基线 [`docs/plans/phase3-dev/`](./docs/plans/phase3-dev/)。⚠️ **护栏层 ≠ 命令面**（R-7）：hook 层完整 **≠** `/ulw-*` 命令（Phase 4）**≠** Team Mode（Phase 5）
- ✅ **Phase 4 命令面已落地**（2026-10，分支 `feature/phase4-dev`）——`omo-commands` 插件注册 **5 条内建命令**，均为 OMO 内建命令的语义移植（`/ulw-execute`、`/handoff`、`/remove-ai-slops`、`/stop-continuation`、`/hyperplan`），每条带逐文件上游出处与一条 mock-LLM e2e 场景；**其中 `/ulw-execute` 另带接入 Phase 3 `ulw-execute` 监听器的 R-10 marker 闭环**（其余四条无 `$SESSION_ID`、无 `<session-context>` 外框，R-10 对它们不适用）；`/ulw-plan` 以**零代码手势桥**落地（DSH 自有 skill 手势），且**刻意不注册**同名命令。另 vendor 19 个 OMO 指令 skill（**属 vendored 内容，非移植**），`keyword-detector`（H-33）监听器在 `agent/pre-step` 上落地。逐行权威是覆盖基线 [`docs/plans/phase4-dev/`](./docs/plans/phase4-dev/)，署名见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。⚠️ **命令面 ≠ OMO 编排全流程可用**（R-7，本次落地不改变该判断）：命令面已落地 **≠** Team Mode（`team_create`、对抗评审环、`team` 关键词——属 Phase 5）**≠** 编辑面（`/refactor`、LSP/ast-grep——属 Phase 6）；`/hyperplan` 是**降级形态**（以名册委派替代 `team_*`），且必须在回复中声明该降级；`ralph` 在本运行时**无可编程停止 API**（如实登记为差异，不承诺可取消）；`session_read` 收窄为指引文案。
- 🔬 **dsh 0.2.x 已复核；适配计划立为 Phase 4.5**（2026-10-02，分支 `feature/dsh-0.2-adaptation-docs`）——上游 0.2.0-rc 线重构了本项目所站立的三个面，且**全部静默失效**。其中两个打断**运行时**：`syncConcertoPreset` 所物化的 agent-preset 文件发现**被删**（协奏在 0.2.x 上根本不注册——已发布的 curl 安装器写的静态 preset 也落在同一条被删路径上），`ctx.jobs` 重写让三个 jobs 触点无一抛出地失效；第三个打断**测试基础设施**：会话日志格式 v4 重构了 e2e 驱动使用的 `tool/result` 信封。cordis 核心（`vendor/cordis/src/{context,registry,service}.ts` 零 diff）、全部 15 个订阅事件、协奏组合的 20 个上游包均稳定。完整分析见[复核报告](./docs/dsh-0.2.0-rc.2-review_zh-CN.md) / [English](./docs/dsh-0.2.0-rc.2-review.md)；计划见 [ROADMAP](./docs/roadmap_zh-CN.md) Phase 4.5。**CI pin 已不再保持 `0.1.5-rc.1`——随 D17 切换（P4.5-T12b）翻到 `0.2.0-rc.2`，0.1.x 兼容性放弃。** 矩阵的 0.2.x 行已在收口步骤（T13）从 `untested` 跨段迁移到 `tested`（证据：CI run 37476903377，切换提交 `2323658`；0.1.5 两行保留为历史记录）。
- ⏳ 2 个开放维度待决策（npm 命名、telemetry；详见决策记录"开放维度"——OMO core 包引进策略已由 D14 关闭）
- ⏳ 工作量粗估：~16 周（一人主力）

## 项目决策

项目决策记录见[决策记录](./docs/decisions_zh-CN.md)——已确认决策（D1–D14）、风险处置（R1–R6）、开放维度状态跟踪（O1–O8）。可行性报告是决策的调研依据。

## ROADMAP

冻结 OMO v4.19.4 基线下的开发路线图（2026-09-11 与决策 D14 同时采纳）：[中文](./docs/roadmap_zh-CN.md) / [English](./docs/roadmap.md)。

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
| **DSH 版本** | **0.2.0-rc.2**（MIT；自 D17 切换（P4.5-T12b）起 CI-pinned——0.1.x 兼容性放弃）——席位 id 已在同一次变更中重钉到 0.2.x 路由目录（[分析报告](./docs/dsh-0.2.0-rc.2-review_zh-CN.md)）。历史 pin：0.1.5-rc.1（2026-09-10 升级中端到端验证，[复核报告](./docs/dsh-0.1.5-rc.1-review.md)、[踩坑 P-20](./docs/mvp-pitfalls.md)）、0.1.0-rc.6（MVP 结项）；0.1.2-alpha.1 曾复核但从未 pin |
| **OMO 上游** | 19 个 core 包 + 4 个小 adapter（harness-agnostic）（SUL-1.0）；**基线冻结 v4.19.4**（D14）——v5.0 已于 2026-09-11 调研，仅作认知跟踪 |
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
- OMO 源码部分（需要时从冻结的 v4.19.4 基线 vendor，决策 D14）以 OMO 自身 SUL-1.0 协议发布
- OMO LICENSE 原文见 [`LICENSES/oh-my-openagent.LICENSE.md`](./LICENSES/oh-my-openagent.LICENSE.md)
- 本项目不进行任何形式的商业分发

---

**English version**：[`README.md`](./README.md)
