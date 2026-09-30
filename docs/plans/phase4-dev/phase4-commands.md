# Phase 4 命令与 skill 清单与覆盖基线

> **上游依据**：[开发计划书](./phase4-plan.md) §3/§4 · [ROADMAP Phase 4](../../roadmap_zh-CN.md) · [可行性报告 §2.2／§5.2／§16](../../feasibility-report_zh-CN.md)
>
> **用法**：本文件是 **ROADMAP Phase 4 退出标准的载体**——v4.19.4 命令面（`features/builtin-commands/`）、shared-skills 内容（`packages/shared-skills/skills/`）、关键词模式与停止续行接盘项（`hooks/keyword-detector/`、`hooks/stop-continuation-guard/`）的权威清单，逐行记录"已移植 / 跳过（含理由）/ deferred / 排除"。
>
> **状态**：📋 **计划期草案**（2026-09-29）。清单行已经计划期 `git ls-tree` 粗核（命令 7 条目 / shared-skills 17 目录 286 文件 / senpi 指令 skill 2 条目 / keyword-detector 24 文件 / stop-continuation-guard 3 文件），"语义摘要"与"处置"列为草案——**P4-T1 逐文件复核后转实测**，§4 待核清单全部闭环才算立项完成。
>
> **命名锚点**：`start-work` 一律按 v5 名 **`ulw-execute`** 读取（命令、skill 目录、模板、文档）；署名与 NOTICES 注明 v4.19.4 源路径。

## 1. 移植组（计划期草案 8 命令面 + 2 hook 接盘；按 WP 序）

### 1.1 命令面（omo-commands 插件；来源 `packages/omo-opencode/src/features/builtin-commands/` 除另注外）

| # | 命令（v5 名） | 上游源（v4.19.4 路径） | 处置 | 语义摘要（草案，P4-T1 复核） | 状态 |
|---|---|---|---|---|---|
| C-01 | `/goal` | `templates/goal.ts` + `commands.ts` goal 条目 | **跳过（DSH 原生）** | `dsh-goal` + `dsh-goal-round-driver` + `dsh-tool-goal` + `dsh-command-goal` 原生覆盖（ROADMAP 明示、可行性报告 §2.2）；原生面 = set/view/pause/resume/clear，OMO 模板的会话内目标语义等价 | ⏭️ 跳过成文（原生面引用待 P4-T1 逐字核对） |
| C-02 | `/ulw-execute` | `templates/start-work.ts` + `commands.ts` start-work 条目（`agent: atlas` 绑定） | **移植** | 编排者激活命令：模板 marker（`<session-context>` + `You are starting an Atlas work session.`）对接 omo-hooks H-32 激活检测（R-10 闭环）；`$ARGUMENTS`/`$SESSION_ID`/`$TIMESTAMP` 渲染；flags `[plan-name] [--worktree <path>] [--make-pr] [--ship]`；boulder-state/ledger 引用段按 Phase 3 H-32 收窄口径记差异 | 📋 待移植（P4-T10/T11） |
| C-03 | `/ulw-plan` | shared-skill `ulw-plan/`（6 文件，见 §2 S4-15）；**非内建命令**——OMO 经 user-invocable skill 面暴露 | **移植**（skill-as-command） | prometheus 访谈式规划人格的入口；DSH 形态 = user-invocable 桥接（若 pinned 版本存在，Q-3）或 omo-commands 显式 handler（加载 skill 正文 + steer 注入）；访谈对象 = 指挥（Phase 2 适配已就位） | 📋 待移植（P4-T15） |
| C-04 | `/hyperplan` | `templates/hyperplan.ts` + senpi skill `hyperplan/SKILL.md`（§3 S5-02） | **移植（降级形态）** | 对抗式多 agent 规划；模板要求 `team_create`（Phase 5 缺席）→ 落地 = 模板 + hyperplan skill 加载 + 上游自带降级路径（team 工具缺席指引文案）；完整评审环 deferred → Phase 5 | 📋 待移植（P4-T14） |
| C-05 | `/stop-continuation` | `templates/stop-continuation.ts` + `hooks/stop-continuation-guard/`（H-41 接盘） | **移植** | 停止本会话全部续行机制：todo 续行（H-03 enforcer 查标记）、goal 轮驱动（pause 面，Q-5）、ralph（原生停止面，Q-5）、后台任务级联取消（ctx.jobs）；guard 服务经 cordis 服务跨插件共享 | 📋 待移植（P4-T8/T9） |
| C-06 | `/handoff` | `templates/handoff.ts` | **移植** | 会话交接摘要：模板引用 `session_read`（OMO 工具）——DSH 等价面（session-query 等）P4-T1 核实，无等价面则收窄记差异；`$SESSION_ID`/`$TIMESTAMP` 渲染；`[goal]` 参数 | 📋 待移植（P4-T6/T7） |
| C-07 | `/remove-ai-slops` | `templates/remove-ai-slops.ts` + shared-skill `remove-ai-slops/`（§2 S4-11） | **移植** | 清除 AI 生成代码异味 + 批判性自评审；模板 + skill 双载体；`REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM` 段不移植（Phase 5） | 📋 待移植（P4-T6/T7） |
| C-08 | ultrawork 关键词模式 | `hooks/keyword-detector/`（24 文件，H-40 接盘）+ senpi skill `ultrawork/SKILL.md`（§3 S5-01） | **移植（收窄）** | prompt 命中 `\b(ultrawork|ulw)\b` / `\b(hpp|hyperplan)\b`（剥 code block/slash 前导）→ pre-step 注入对应指令（模式 A）；`hyperplan-ultrawork` 组合 banner；**收窄**：team 关键词 deferred → Phase 5；模型变体文案（gpt/glm/gemini/planner）按 DSH 名册收窄；notepad/`mktemp` 载体引用记差异 | 📋 待移植（P4-T12/T13） |

### 1.2 hook 接盘项（Phase 3 deferred → 本阶段消化为终态；omo-hooks 插件）

| # | 模块（hooks/ 下路径） | 原编号 | 处置 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-40 | `keyword-detector/`（**24 文件**） | Phase 3 S-06 | **移植（收窄，见 C-08）** | 检测逻辑（detector.ts）+ 关键词注册表（constants.ts）+ ultrawork/hyperplan 文案 + 7 个测试文件（用例移植为单测种子）；移植形态 = omo-hooks 模式 A pre-step 注入 | 📋 待移植（P4-T12） |
| H-41 | `stop-continuation-guard/`（3 文件） | Phase 3 S-37 | **移植** | 服务形态（stop/isStopped/clear + 级联取消 backgroundManager 后代）；DSH 落点 = cordis 服务（omo-commands 写 / omo-hooks 读）+ ctx.jobs 级联取消；消费面 = C-05 命令 | 📋 待移植（P4-T8） |

## 2. shared-skills 内容 vendor 组（17 条目 = ROADMAP §16 裸名集合；来源 `packages/shared-skills/skills/`）

> **处置一律为 vendor**（内容搬运 + frontmatter 适配 + 改名 deviation），投递机制（filesystem 物化 / 嵌入注册）由 P4-T1 Q-4 统一裁定。文件计数为计划期 `git ls-tree -r v4.19.4` 粗核。

| # | skill（裸名） | 文件数 | 内容摘要（草案） | Phase 4 之后的消费面 | 状态 |
|---|---|---|---|---|---|
| S4-01 | `ast-grep` | 17 | ast-grep 结构化搜索/重写用法 | Phase 6（ast-grep provisioning） | 📋 待 vendor（P4-T4） |
| S4-02 | `coding-agent-sessions` | 33 | 跨会话编码代理协作模式 | 本阶段起可用 | 📋 待 vendor（P4-T4） |
| S4-03 | `data-scientist` | 9 | 数据科学工作流 | 本阶段起可用 | 📋 待 vendor（P4-T4） |
| S4-04 | `debugging` | 20 | 调试方法论 | 本阶段起可用 | 📋 待 vendor（P4-T4） |
| S4-05 | `frontend` | 26 | 前端开发指引 | 本阶段起可用 | 📋 待 vendor（P4-T4） |
| S4-06 | `git-master` | 2 | git 操作纪律 | 本阶段起可用 | 📋 待 vendor（P4-T4） |
| S4-07 | `init-deep` | 1 | 深度初始化（写 AGENTS.md） | Phase 6（agents-md-core 消费面裁定） | 📋 待 vendor（P4-T4） |
| S4-08 | `lsp-setup` | 25 | LSP 配置指引 | Phase 6（dsh-lsp） | 📋 待 vendor（P4-T4） |
| S4-09 | `programming` | 75 | 通用编程规范 | 本阶段起可用 | 📋 待 vendor（P4-T4） |
| S4-10 | `refactor` | 1 | 重构方法论 | Phase 6（`/refactor` 命令面） | 📋 待 vendor（P4-T4） |
| S4-11 | `remove-ai-slops` | 1 | AI 异味清除清单 | **本阶段**（C-07 命令消费） | 📋 待 vendor（P4-T4） |
| S4-12 | `review-work` | 1 | 工作评审清单 | 本阶段起可用 | 📋 待 vendor（P4-T4） |
| S4-13 | `start-work` → **`ulw-execute`** | 1 | 编排者执行契约 | **本阶段**（C-02 命令与 H-32 消费）；**改名 deviation**（目录名 + frontmatter `name:` + 正文引用，逐处入 `deviations[]`） | 📋 待 vendor（P4-T4） |
| S4-14 | `ultimate-browsing` | 48 | 浏览器自动化 | 本阶段起可用（DSH web 面适配注记如有） | 📋 待 vendor（P4-T4） |
| S4-15 | `ulw-plan` | 6 | prometheus 访谈式规划 | **本阶段**（C-03 命令面消费） | 📋 待 vendor（P4-T4） |
| S4-16 | `ulw-research` | 2 | 深度研究流程 | 本阶段起可用 | 📋 待 vendor（P4-T4） |
| S4-17 | `visual-qa` | 18 | 视觉 QA 流程 | Phase 6（视觉工具面，S-30 邻域） | 📋 待 vendor（P4-T4） |

## 3. senpi 指令 skill vendor 组（2 条目；来源 `packages/omo-senpi/skills/`——关键词模式与 /hyperplan 的内容依赖）

| # | skill | 文件数 | 处置 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| S5-01 | `ultrawork` | 1 | **vendor**（内容） | ultrawork 绑定指令正文（`<ultrawork-mode>`：banner 首行、CODE RED、LIGHT/HEAVY tier triage、证据纪律、PIN→RED→GREEN→SURFACE→CLEAN 环、reviewer 闸门）；C-08 注入面的内容源；**载体收窄**：notepad `mktemp` 等 OMO 引用记差异 | 📋 待 vendor（P4-T4） |
| S5-02 | `hyperplan` | 1 | **vendor**（内容） | hyperplan 7 阶段对抗评审工作流；C-04 命令的 skill 加载目标；team-mode 依赖段随 C-04 降级形态记差异 | 📋 待 vendor（P4-T4） |

## 4. deferred / 排除组

| # | 条目 | 处置 | 理由 |
|---|---|---|---|
| D-01 | `/refactor` 命令面（`templates/refactor.ts` + `refactor-sections/`） | **deferred → Phase 6（草案）** | 模板自述依赖 LSP / AST-grep / codemap / TDD 验证——全部为 Phase 6 能力面；skill 内容（S4-10）照常 vendor，命令面随编辑模型决策落地。P4-T1 复核模板实际引用面后终态化 |
| D-02 | team 关键词子模式（`TEAM_PATTERN`/`TEAM_MESSAGE`，keyword-detector 内） | **deferred → Phase 5** | team 模式语义随 Team Mode 定型；检测器骨架预留类型枚举位 |
| D-03 | `REFACTOR_TEAM_MODE_ADDENDUM` / `REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM` 模板段 | **deferred → Phase 5** | team-mode addendum 的消费前提 = Team Mode |
| D-04 | `/init-deep` 命令面（可行性报告 §5.2 候选） | **阶段外（ROADMAP 未列）** | ROADMAP Phase 4 目标清单不含 `/init-deep`；skill 内容（S4-07）照常 vendor，命令面随 Phase 6 agents-md-core 消费面裁定重议 |
| D-05 | senpi skills `give-me-tips` / `ulw-loop` / `ulw-research`（senpi 侧副本） | **排除** | give-me-tips = senpi 运营内容，无 OMO 行为语义；ulw-loop 属 ralph 邻域（DSH 原生 ralph 已覆盖 loop 语义，且 v5 mass-ulw 为 ROADMAP §6 观察项）；ulw-research 的 shared-skills 副本（S4-16）已 vendor，senpi 副本为 senpi 平台绑定版 |
| D-06 | `commands.ts` 的 `disabled_commands` 配置与 opencode 命令加载器胶水（`claude-code-command-loader/`） | **排除** | opencode 平台耦合；DSH 等价面 = 插件 Config（omo-commands 自身的禁用面，如需） |

## 5. P4-T1 待核清单（立项期开放问题 → 调研任务）

**A 组（清单完整性）**：① `features/builtin-commands/` 全树对账（含 `templates/refactor-sections/` 子目录与测试文件计数）；② `packages/shared-skills/skills/` 17 目录逐文件清单（286 计划期粗核数复核）；③ senpi `ultrawork`/`hyperplan` 两 skill 与 shared-skills 同名 skill 的关系（内容重叠/引用）；④ keyword-detector 24 文件与 stop-continuation-guard 3 文件的逐文件处置。

**B 组（DSH 机制，Q-1…Q-5）**：① `ctx.commands` handler 驱动 agent 行为机制（steer 状态/时序/signal；throw settle 形态）；② `$SESSION_ID`/`$TIMESTAMP` 暴露面；③ user-invocable skill → 命令面桥接存在性（pinned 0.1.5-rc.1 实测）；④ skill 投递选型 + `customSkillDirs` patch 可配置性；⑤ 续行机制盘点（`ctx.goals` pause 词汇表 / ralph 停止面 / `ctx.jobs` 取消 API）与跨插件 cordis 服务形态。

**C 组（逐模块语义）**：① 7 命令模板逐字复核（占位符集合、agent 绑定、team addendum 边界）；② keyword-detector 收窄清单（变体文案、配置面默认值、幂等语义）；③ stop-continuation-guard 的 backgroundManager 依赖的 DSH 等价面；④ 每模板引用的 OMO 载体（session_read/boulder/notepad/mktemp）的 DSH 等价面判定；⑤ 上游测试文件登记（keyword-detector 7 个、templates 2 个）用例数 → 单测种子。

## 6. 覆盖统计（随实施滚动更新）

| 状态 | 计数 | 口径 |
|---|---|---|
| 命令面移植组（§1.1） | **7**（C-02…C-08；C-01 原生跳过） | 计划期草案，P4-T1 转实测 |
| hook 接盘项（§1.2） | **2**（H-40/H-41） | Phase 3 S-06/S-37 终态化 |
| skills vendor（§2+§3） | **19**（17 shared + 2 senpi） | 计划期粗核 288 文件，P4-T1 复核 |
| deferred / 排除（§4） | **6** | 每行终态理由齐备 |
| 全树覆盖 | 命令面 + skill 面 + 接盘项全部条目 | 退出标准的完整性硬判定（P4-T1 对账后锁定分母） |
