# Phase 3 hook 清单与覆盖基线

> **上游依据**：[开发计划书](./phase3-plan.md) §3/§4 · [ROADMAP Phase 3](../../roadmap_zh-CN.md) · [可行性报告 §1.2](../../feasibility-report_zh-CN.md)
>
> **用法**：本文件是 **ROADMAP Phase 3 退出标准 b 的载体**——v4.19.4 `packages/omo-opencode/src/hooks/` 全部模块的权威清单，逐行记录"已移植 / 跳过（含理由）/ deferred / 排除 / 非 hook"。计划期为**草案**（来源：§1.2 映射表 + 2026-09 对 v4.19.4 tag 的 `git ls-tree` 初核）；P3-T1 逐模块复核后转**实测**（全部 🔍 转 ✅ 或更正）；此后每移植一个 hook 翻一次状态。
>
> **状态图例**：🔍 = 待 P3-T1 复核 · 待移植 = 复核通过、等待实施 · **已移植** = listener + 单测 + e2e 全落地（状态列注明场景名）· 跳过 = 有终态理由 · deferred = 属后续阶段。
>
> **模式列**：A–F 见计划书 §4.2 分类法。

## 1. 移植组（草案 32 模块，按 ROADMAP 优先级）

### P0 文件护栏（WP-2）

| # | 模块（hooks/ 下路径） | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-01 | `write-existing-file-guard/`（5 文件） | 目录 | B | 覆写已存在文件前须先读过（session 级读过集合 + 权威拒绝） | 🔍 |
| H-02 | `bash-file-read-guard.ts` | 单文件 | C | 简单 `cat/head/tail` 读文件 → 劝导改用 Read 工具（不阻断，附加 message） | 🔍 |

### P1 todo/goal 执行器（WP-3；`goal/` 本体按关键约束跳过，见 §2）

| # | 模块 | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-03 | `todo-continuation-enforcer/` | 目录 | E | todo 未清时回合将停 → 投票续行 | 🔍 |
| H-04 | `todo-description-override/`（4 文件） | 目录 | D | 改写 todo 工具输出/描述为 OMO 语义 | 🔍 |
| H-05 | `session-todo-status.ts` | 单文件 | F | 会话 todo 状态追踪（通知/状态面数据源） | 🔍 |
| H-06 | `task-reminder/` | 目录 | A | 任务提醒注入 | 🔍 |
| H-07 | `empty-task-response-detector.ts` | 单文件 | A | 空任务响应检测 → 注入纠正 | 🔍 |

### P2 compaction 辅助（WP-4；`preemptive-compaction*` 本体跳过，见 §2）

| # | 模块 | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-08 | `compaction-context-injector/` | 目录 | A/F | 压缩前后注入保全上下文 | 🔍（挂点 = Q-3） |
| H-09 | `compaction-todo-preserver/` | 目录 | A/F | 压缩时保全 todo 状态 | 🔍（挂点 = Q-3） |

### P3 会话通知（WP-5）

| # | 模块 | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-10 | `session-notification-*`（约 14 文件） | 文件族 | F | 会话完成/错误的用户通知（调度器 + 平台后端；**Windows 后端不移植 = D9**，macOS 后端 L4 手工验证，CI 走 log 后端） | 🔍 |
| H-11 | `background-notification/` | 目录 | F | 后台任务完成通知 | 🔍 |

### P4 其余在范围模块（WP-6，按模式聚批，批内先小后大）

| # | 模块 | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-12 | `tool-pair-validator/`（8 文件） | 目录 | D/A | 工具调用配对校验（edit 前 read 等） | 🔍 |
| H-13 | `plan-format-validator/`（3 文件） | 目录 | D | 计划文件格式校验 | 🔍 |
| H-14 | `edit-error-recovery/`（3 文件） | 目录 | D | 编辑失败后的恢复引导 | 🔍 |
| H-15 | `json-error-recovery/` | 目录 | D | JSON 输出错误的恢复 | 🔍 |
| H-16 | `tool-output-truncator.ts` | 单文件 | D | 超长工具输出截断 | 🔍 |
| H-17 | `question-label-truncator/`（3 文件） | 目录 | D | 问题标签截断 | 🔍 |
| H-18 | `comment-checker/` | 目录 | D | 注释检查（brain 或在 `comment-checker-core`——Q-5 裁定 vendor 例外） | 🔍 |
| H-19 | `stop-continuation-guard/`（3 文件） | 目录 | E | 停止续行守卫（Phase 4 stop-continuation 命令的 listener 半） | 🔍 |
| H-20 | `monitor-status-injector/`（3 文件） | 目录 | A（经 `agent/status`） | 监控状态注入 | 🔍 |
| H-21 | `directory-readme-injector/`（7 文件） | 目录 | A | 目录 README 上下文注入 | 🔍 |
| H-22 | `agent-usage-reminder/` | 目录 | A | agent 使用提醒注入 | 🔍 |
| H-23 | `task-resume-info/` | 目录 | A | 任务恢复信息注入 | 🔍 |
| H-24 | `webfetch-redirect-guard/`（4 文件） | 目录 | B/C | webfetch 重定向护栏 | 🔍 |
| H-25 | `atlas/` | 目录 | 🔍 | atlas 配套 hook 语义（P3-T1 逐文件定性） | 🔍 |
| H-26 | `prometheus-md-only/` | 目录 | B | prometheus 仅可写 .md 的收窄（Phase 2 记录为"有意不镜像"，P3-T1 复议是否以 listener 补齐） | 🔍 |
| H-27 | `notepad-write-guard/` | 目录 | B/C | notepad 写入护栏 | 🔍 |
| H-28 | `sisyphus-junior-notepad/`（3 文件） | 目录 | A + `ctx.jobs` | sisyphus-junior notepad 语义 | 🔍 |
| H-29 | `tasks-todowrite-disabler/` | 目录 | B/C | 特定条件下禁用 todowrite | 🔍 |
| H-30 | `unstable-agent-babysitter/` | 目录 | F | 不稳定 agent 看护 | 🔍 |
| H-31 | `fsync-skip-warning/` | 目录 | F | fsync 跳过警告（P3-T1 复核是否平台耦合 → 若是移 §2） | 🔍 |

### P5 ulw-execute（= start-work hook 语义，WP-6 尾部）

| # | 模块 | 形态 | 模式 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-32 | `start-work/`（20 文件）→ **ulw-execute** | 目录 | A/E + `ctx.jobs` | 工作激活检测 + 计划发现/上下文构建/脚手架；**命名锚点用 v5 名 ulw-execute**；命令面 `/ulw-execute` 属 Phase 4（计划书 §4.5 边界，P3-T1 逐文件划分） | 🔍 |

## 2. 跳过 / deferred / 排除组（草案 27 模块）

| # | 模块 | 处置 | 理由 | 状态 |
|---|---|---|---|---|
| S-01 | `goal/`（12 文件） | 跳过（DSH 原生） | 关键约束：`dsh-goal` + `dsh-tool-goal` + `dsh-command-goal` 原生覆盖 | ✅ 终态（P3-T1 复核确认） |
| S-02 | `preemptive-compaction*`（4 实现文件） | 跳过（DSH 原生） | 关键约束：`dsh-compaction` 族原生覆盖 | ✅ 终态（P3-T1 复核确认） |
| S-03 | `claude-code-hooks/`（20+ 文件） | 跳过（DSH 原生） | §1.2："DSH `hooks-claude-code` 直接吃"用户配置 | ✅ 终态 |
| S-04 | `ralph-loop/` | 跳过（DSH 原生） | DSH 原生 ralph 能力 | ✅ 终态 |
| S-05 | `codegraph-bootstrap/` | 排除（上游已删） | ROADMAP 明示；codegraph 已死（§16.2） | ✅ 终态 |
| S-06 | `keyword-detector/`（13 文件） | deferred → Phase 4 | ultrawork/hyperplan/team 关键词模式 = 命令面 | ✅ 终态 |
| S-07 | `team-mailbox-injector/` | deferred → Phase 5 | Team Mode 邻域 | ✅ 终态 |
| S-08 | `team-mode-status-injector/` | deferred → Phase 5 | 同上 | ✅ 终态 |
| S-09 | `team-session-events/` | deferred → Phase 5 | 同上 | ✅ 终态 |
| S-10 | `team-tool-gating/` | deferred → Phase 5 | 同上 | ✅ 终态 |
| S-11 | `category-skill-reminder/` | deferred → Phase 5 | category 体系 = Team Mode 邻域 | ✅ 终态 |
| S-12 | `delegate-task-retry/` | deferred → Phase 5（🔍 P3-T1 复核是否实为通用重试） | delegate-core 任务重试与 team 委派生命周期耦合 | 🔍 |
| S-13 | `model-fallback/`（5 文件） | 跳过（DSH 无 fallback 语义） | §12.5：`model-unavailable` = error；Phase 7 硬化候选 | ✅ 终态 |
| S-14 | `hashline-edit-diff-enhancer/` | deferred → Phase 6 | 编辑模型决策未裁定 | ✅ 终态 |
| S-15 | `hashline-read-enhancer/` | deferred → Phase 6 | 同上 | ✅ 终态 |
| S-16 | `ast-grep-sg-provision/` | deferred → Phase 6 | ast-grep provisioning 随 MCP 面 | ✅ 终态 |
| S-17 | `no-hephaestus-non-gpt/` | 跳过（语义不适用） | OMO 模型链身份守卫；DSH 路由在配置，persona 已适配 | ✅ 终态 |
| S-18 | `no-sisyphus-gpt/` | 跳过（语义不适用） | 同上 | ✅ 终态 |
| S-19 | `auto-update-checker/` | 跳过（opencode 平台耦合） | 宿主平台适配，无 OMO 行为语义 | ✅ 终态 |
| S-20 | `legacy-plugin-toast/` | 跳过（opencode 平台耦合） | 同上 | ✅ 终态 |
| S-21 | `auto-slash-command/` | 跳过（opencode 平台耦合） | 同上 | ✅ 终态 |
| S-22 | `non-interactive-env/` | 跳过（平台耦合，🔍 复核） | CI/非交互环境 shim；P3-T1 确认 DSH 无对应需求 | 🔍 |
| S-23 | `anthropic-context-window-limit-recovery/` | 跳过（模型特定，🔍 复核） | Anthropic 窗口恢复；DSH compaction 覆盖通用语义 | 🔍 |
| S-24 | `think-mode/` | 跳过（🔍 复核） | 模型变体切换；DSH 路由在配置——若实为注入语义则移回移植组 | 🔍 |
| S-25 | `interactive-bash-session/` | 跳过（🔍 复核） | opencode bash 会话模型；DSH 终端模型不同 | 🔍 |
| S-26 | `hephaestus-agents-md-injector/` | 🔍 Q-5 裁定 | AGENTS.md 注入：`dsh-agent-instructions` 可能原生覆盖 → 跳过；否则移植组或 vendor `agents-md-core` | 🔍 |
| S-27 | `directory-agents-injector/` | 🔍 Q-5 裁定 | 同上 | 🔍 |

## 3. 非 hook 条目（不进移植计数，附注）

| # | 条目 | 说明 |
|---|---|---|
| N-01 | `shared/` | 上游 hook 共享辅助（log 等）；移植时按需吸收其语义，不逐文件对应 |
| N-02 | `zauc-mocks-bg/`、`zauc-mocks-cache/`、`zauc-mocks-hook/`、`zauc-mocks-ws/`、`zauc-sync-mocks/` | 上游测试设施，非 hook |
| N-03 | `index.ts`、`AGENTS.md` | 上游注册表与文档，非 hook |

## 4. P3-T1 待核清单（复核后本节目全部转 ✅ 或更正）

**A 组（清单完整性）**：

1. 🔍 以 `git ls-tree -r v4.19.4 packages/omo-opencode/src/hooks/` 为唯一权威，核对 §1/§2/§3 三节覆盖**全部**条目（59 目录 + 单文件模块），无一漏列。
2. 🔍 §1.2 映射表未列、树中实有的模块（`todo-continuation-enforcer`、`atlas/`、`think-mode/`、`task-reminder/`、`task-resume-info/`、`notepad-write-guard/`、`prometheus-md-only/`、`tasks-todowrite-disabler/`、`unstable-agent-babysitter/`、`fsync-skip-warning/`、`anthropic-context-window-limit-recovery/`、`category-skill-reminder/`、`agent-usage-reminder/`、`interactive-bash-session/`、`json-error-recovery/`、`no-sisyphus-gpt/`、`auto-*`、`legacy-plugin-toast`、`session-todo-status` 等）逐一定性，补登记或更正分组。

**B 组（DSH 机制，计划书 Q-1/2/3/5）**：

3. 🔍 `tools/pre-execute` / `tools/post-execute` 决策词汇表（deny/block/replace/add-context 的 kind 与字段）+ listener throw 的 fail-open/closed 语义（installed dsh lib 逐字引用）。
4. 🔍 `agent/turn-stopping` 投票协议与多 listener 合成规则。
5. 🔍 `ctx.compaction` 的可挂事件（Q-3）；`dsh-agent-instructions` 是否原生覆盖 AGENTS.md 注入（Q-5）；`comment-checker-core` 等 core 包 brain 的 vendor 例外判定。

**C 组（逐模块语义）**：

6. 🔍 移植组 32 模块逐个 `git show v4.19.4:<path>` 读实现，复核"语义摘要/模式"列；上游有测试文件的登记其用例数（R-3 的单测种子）。
7. 🔍 start-work 20 文件按"hook 语义 / 命令面胶水"逐文件划分（计划书 §4.5）；划不动的记理由。

## 5. 覆盖统计（随实施滚动更新）

| 状态 | 计数 | 口径 |
|---|---|---|
| 移植组（§1） | 32（草案） | P3-T1 后转实测 |
| 已移植（listener+单测+e2e） | 0 / 32 | 逐任务翻转 |
| 跳过 / deferred / 排除（§2） | 27（草案，9 行 🔍 待核） | 每行须有终态理由 |
| 非 hook（§3） | 7 条目 | 不计入 |
