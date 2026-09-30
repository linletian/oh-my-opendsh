# Phase 4 命令与 skill 清单与覆盖基线

> **上游依据**：[开发计划书](./phase4-plan.md) §3/§4 · [ROADMAP Phase 4](../../roadmap_zh-CN.md) · [可行性报告 §2.2／§5.2／§16](../../feasibility-report_zh-CN.md)
>
> **用法**：本文件是 **ROADMAP Phase 4 退出标准的载体**——v4.19.4 命令面（`features/builtin-commands/`）、shared-skills 内容（`packages/shared-skills/skills/`）、关键词模式与停止续行接盘项（`hooks/keyword-detector/`、`hooks/stop-continuation-guard/`）的权威清单，逐行记录"已移植 / 跳过（含理由）/ deferred / 排除"。
>
> **状态**：✅ **P4-T1 实测已回填**（2026-09-30 立项；2026-09-30 评审修复：接盘项编号定案 H-33/H-34〈映射 S-06/S-37，Phase 4 拥有的新 H 号段〉+ §1.2 增 c14 解析契约声明 + §6 统计口径更正〈命令 6 + 关键词模式 1〉+ 头部 §4→§5 引用更正；**P4-T1 实测**：三组证据 `.omo/evidence/p4t1/{A,B,C}-*.md`——① keyword-detector 文件数 **24→25**（草案少计 1，测试 7 个正确）；② Q-3 桥接**存在但形态为手势注入**（dsh-tool-skill `agent/pre-step` SKILL_GESTURE，非命令注册桥）→ C-03 零代码落地；③ Q-4 裁定**候选 b**（`ctx.skills.register` 嵌入注册 + vendor 路径）；④ Q-2：invocation 仅 5 字段，`$SESSION_ID`=`invocation.agent.id`、`$TIMESTAMP`=`Date.now()` 派生；⑤ 7 命令/17 目录 286 文件/senpi 2×1/guard 3 文件/frontmatter 全含 name+description 全部证实）。
>
> **命名锚点**：`start-work` 一律按 v5 名 **`ulw-execute`** 读取（命令、skill 目录、模板、文档）；署名与 NOTICES 注明 v4.19.4 源路径。

## 1. 移植组（计划期草案 8 命令面 + 2 hook 接盘；按 WP 序）

### 1.1 命令面（omo-commands 插件；来源 `packages/omo-opencode/src/features/builtin-commands/` 除另注外）

| # | 命令（v5 名） | 上游源（v4.19.4 路径） | 处置 | 语义摘要（草案，P4-T1 复核） | 状态 |
|---|---|---|---|---|---|
| C-01 | `/goal` | `templates/goal.ts` + `commands.ts` goal 条目 | **跳过（DSH 原生）** | `dsh-goal` + `dsh-goal-round-driver` + `dsh-tool-goal` + `dsh-command-goal` 原生覆盖（ROADMAP 明示、可行性报告 §2.2）；原生面 = set/view/pause/resume/clear，OMO 模板的会话内目标语义等价 | ⏭️ 跳过成文（原生面引用待 P4-T1 逐字核对） |
| C-02 | `/ulw-execute` | `templates/start-work.ts` + `commands.ts` start-work 条目（`agent: atlas` 绑定） | **移植** | 编排者激活命令：模板 marker（`<session-context>` + `You are starting an Atlas work session.`）对接 omo-hooks H-32 激活检测（R-10 闭环）；`$ARGUMENTS`/`$SESSION_ID`/`$TIMESTAMP` 渲染；flags `[plan-name] [--worktree <path>] [--make-pr] [--ship]`；boulder-state/ledger 引用段按 Phase 3 H-32 收窄口径记差异 | 📋 待移植（P4-T10/T11） |
| C-03 | `/ulw-plan` | shared-skill `ulw-plan/`（6 文件，见 §2 S4-15）；**非内建命令**——OMO 经 user-invocable skill 面暴露 | **移植**（skill-as-command，**DSH 原生手势桥**） | prometheus 访谈式规划人格的入口；**Q-3 实测形态**：0.1.5-rc.1 无 user-invocable→命令注册桥，但 dsh-tool-skill 的 `agent/pre-step` 钩子以 SKILL_GESTURE 正则扫描 `/name` 手势、对 user-invocable skill 注入 `<skill_content>`（用户原文随行）——语义等价 OMO 的 skill-as-command，**零代码落地**（前提是 S4-15 经 T4/T5 进入 catalog 且 user-invocable）；e2e 断言注入而非命令事件对；访谈对象 = 指挥（Phase 2 适配已就位） | 📋 待移植（P4-T15） |
| C-04 | `/hyperplan` | `templates/hyperplan.ts` + senpi skill `hyperplan/SKILL.md`（§3 S5-02） | **移植（降级形态）** | 对抗式多 agent 规划；模板要求 `team_create`（Phase 5 缺席）→ 落地 = 模板 + hyperplan skill 加载 + 上游自带降级路径（team 工具缺席指引文案）；完整评审环 deferred → Phase 5 | 📋 待移植（P4-T14） |
| C-05 | `/stop-continuation` | `templates/stop-continuation.ts` + `hooks/stop-continuation-guard/`（H-34 接盘） | **移植** | 停止本会话全部续行机制：todo 续行（H-03 enforcer 查标记）、goal 轮驱动（pause 面，Q-5）、ralph（原生停止面，Q-5）、后台任务级联取消（ctx.jobs）；guard 服务经 cordis 服务跨插件共享 | 📋 待移植（P4-T8/T9） |
| C-06 | `/handoff` | `templates/handoff.ts` | **移植** | 会话交接摘要：`session_read` 收窄为指引文案（DSH 无现成模型工具，载体注记登记）；PHASE 1/3 工具拼写按能力散文改写、PHASE 4 补 DSH 会话面（三处登记）；`$SESSION_ID`/`$TIMESTAMP` 渲染 + formatCommandTemplate 外框；`[goal]` 参数 | ✅ 已移植（P4-T6，commit `261c5ba`；e2e 随 P4-T7） |
| C-07 | `/remove-ai-slops` | `templates/remove-ai-slops.ts` + shared-skill `remove-ai-slops/`（§2 S4-11） | **移植** | 清除 AI 生成代码异味 + 批判性自评审；模板与上游逐字节相同（双评审实证）；skill 引用段载体注记（dsh-tool-skill 已注册）；`REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM` 段不移植（Phase 5） | ✅ 已移植（P4-T6，commit `261c5ba`；e2e 随 P4-T7） |
| C-08 | ultrawork 关键词模式 | `hooks/keyword-detector/`（**24 文件** + 1 目录外配置文件 `config/schema/keyword-detector.ts` = 25 条 upstreamFiles，T12 复核实测，H-33 接盘）+ senpi skill `ultrawork/SKILL.md`（§3 S5-01） | **移植（收窄）** | prompt 命中 `\b(ultrawork|ulw)\b` / `\b(hpp|hyperplan)\b`（剥 code block/slash 前导）→ pre-step 注入对应指令（模式 A）；`hyperplan-ultrawork` 组合 banner；**收窄**：team 关键词 deferred → Phase 5；模型变体文案（gpt/glm/gemini/planner）按 DSH 名册收窄；notepad/`mktemp` 载体引用记差异 | ✅ 已移植（P4-T12，commit `988a547`；e2e 随 P4-T13） |

### 1.2 hook 接盘项（Phase 3 deferred → 本阶段消化为终态；omo-hooks 插件）

> **编号声明**：H-33/H-34 是 **Phase 4 拥有的新 H 号**，延续 Phase 3 的 H-01…H-32 序列（`phase3-hooks.md` 无这两行；omo-hooks manifest 用 slug id，H 号仅用于清单/门解析面）。映射：**H-33 ↔ Phase 3 S-06**（keyword-detector）、**H-34 ↔ Phase 3 S-37**（stop-continuation-guard）。
>
> **c14 解析契约**（`verify-concerto-static.mjs` 解析器，门 6）：本节表格须保持「`| H-xx |` 行 + 状态列为第 5 数据格」格式；c14 的基线来源随首个 manifest 新增同 commit 扩为 `[phase3-hooks.md, phase4-commands.md]` 两文档并集 + manifest 侧 `status === 'ported'` 过滤（T8/T12 任务书承载）。

| # | 模块（hooks/ 下路径） | 原编号 | 处置 | 语义摘要 | 状态 |
|---|---|---|---|---|---|
| H-33 | `keyword-detector/`（**24 文件** + 1 目录外配置文件 = 25 条 upstreamFiles，T12 复核实测——P4-T1 的 25 把目录外 `config/schema/keyword-detector.ts` 计入目录，测试 7 个不变） | Phase 3 S-06 | **移植（收窄，见 C-08）** | 检测逻辑（detector.ts）+ 关键词注册表（constants.ts）+ ultrawork/hyperplan 文案 + 7 个测试文件（89 its 移植为单测种子）；移植形态 = omo-hooks 模式 A pre-step 注入；**实测补充收窄面**：synthetic/internal、system directive、non-OMO agent、planner、background session、非主 session 六级过滤 + 双幂等（消息级 includes + session 级 Set） | 📋 代码已落地（P4-T12，commit `988a547`）；ported 翻转随 P4-T13 e2e 与 manifest status 同 commit 双侧同步（c14 契约） |
| H-34 | `stop-continuation-guard/`（3 文件） | Phase 3 S-37 | **移植** | 服务形态（stop/isStopped/clear + 级联取消 backgroundManager 后代）；DSH 落点 = cordis 服务（omo-commands 写 / omo-hooks 读）+ ctx.jobs 级联取消（caller 传递 + ownerSession 围栏）；消费面 = C-05 命令。**fork 终态 = (ii) 纯服务模块** `src/services/stop-continuation-guard.ts`（不进 manifest——event/mode 字段无诚实取值、状态字段两难、c13 只扫 src/hooks、本行预授权出口） | ✅ 已落地（P4-T8，commit `ff136b7`；**fork ii 纯服务模块，c14 解析面豁免——本行状态格永不翻 ported**，e2e 随 P4-T9） |

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

## 5. P4-T1 待核清单（✅ 已闭环——证据 `.omo/evidence/p4t1/{A,B,C}-*.md`）

**A 组（清单完整性）✅**：① `features/builtin-commands/` 实测 **20 文件**（types.ts 封闭联合恰 7 成员；feature 根 commands.test.ts 17 its + init-deep-migration.test.ts 1 it；templates/ **14 文件** = 9 直接 + refactor-sections/ 5——**P4-T2 评审期复跑更正**，原 A 组记录的 11 为计数错误，6+14=20 闭合）；agent 绑定仅 start-work（动态 resolveStartWorkAgent：atlas 已注册→atlas，否则 sisyphus）；argumentHint 有 = goal/refactor/start-work/handoff/hyperplan，无 = stop-continuation/remove-ai-slops。② shared-skills 恰 **17 目录 286 文件**（逐目录计数与 §2 行全符）；17/17 SKILL.md 全含 `name`+`description`（仅 ulw-plan 多 `metadata.short-description`）——**frontmatter 适配面近零**。③ senpi `ultrawork`/`hyperplan` 各恰 1 文件；同名 ulw-research **非复制**（shared 版 394 行带 Codex 工具翻译表；senpi 版 402 行绑定 team_create/task_send，diff ~495 行，核心编排结构一致）——S4-16 取 shared 版、senpi 版排除（D-05 维持）。④ keyword-detector 实测 **24 文件** + 目录外 1 配置文件（**T12 复跑更正**：P4-T1 记录的 25 实为 24 hook 文件 + `config/schema/keyword-detector.ts`；测试 7 个不变）+ guard 恰 3 文件（1 测试 12 its）。

**B 组（DSH 机制，Q-1…Q-5）✅**：① **Q-1 闭环**：followup 可用——`command/run` 先于 handler 追加、`command/done` 在 settle 后追加（dsh-commands/lib/index.js:325/379/385），handler 内 followup 消息排在 command/done 之后、下一回合生效；agent 非 idle 时无条件 splice 进 next-turn inbox（排队不丢弃，dsh-agent-loop:783-791）；signal = withAbort 只停止等待不中断 handler，abort 经 settleThrown 记 `command/done` error。**命令驱动形态定案 = 草案（a）followup，无降级**。② **Q-2**：invocation 仅 `commandId/agent/rawInput/attachments/signal` 五字段（types.d.ts:18-34）——`$SESSION_ID` = `invocation.agent.id`（Agent.id 即 SessionId）、`$TIMESTAMP` = `Date.now()` 由 handler 派生。③ **Q-3**：无 user-invocable→命令注册桥（dsh-commands 零命中）；**实际桥 = dsh-tool-skill `agent/pre-step` 手势注入**（SKILL_GESTURE 正则 + `isUserInvocable` 过滤 + `<skill_content>` 注入，用户原文骑行普通 user message；前提 = 无同名命令抢先，因 commands admission miss 落回普通 prompt）。④ **Q-4 裁定 = 候选 b**：`ctx.skills.register` 嵌入注册（content 从 vendor 文件读取 + `path` 指向 vendor SKILL.md 使引用文件磁盘可读）——零 FS 副作用、effect 自动注销、与 cwd/.git 无关（e2e 沙箱友好）、漂移检测经 vendor manifest 保留；候选 a（物化）否决理由：.git 探测回退 cwd 的 e2e 语义风险 + patch overlay 整键替换非深合并。⑤ **Q-5**：`ctx.goals` 词汇全（get/disarm/create/edit/pause/resume/complete/block/clear，revision CAS）——`/stop-continuation` 对 goal 走 **pause**；ralph **无可编程 stop API**（仅脚本自终止或自持 workflowEngine 句柄 cancel）——记差异；`ctx.jobs.kill(id, caller?, reason?)→'requested'|'already-finished'` 满足级联取消面；跨插件共享 = 提供方 `ctx.provide`/Service 子类，消费方**延迟 ctx.get**（先例 dsh-commands:349 execute 内取服务）——绝不在 apply 期缓存。

**C 组（逐模块语义）✅**：① 7 模板复核完成（逐字段落见证据 C 文）；**关键修正**：`<session-context>` marker 段在 **commands.ts:67-70 wrapper**（`Session ID: $SESSION_ID` / `Timestamp: $TIMESTAMP`）而非模板本体，`You are starting an Atlas work session.` 在 start-work.ts:1——**/ulw-execute 模板移植必须含 wrapper 段**（R-10 对接面 = wrapper + 首行双常量）；hyperplan 降级指引逐字在 hyperplan.ts:17（指向 `~/.omo/omo.jsonc`，与 prompts/mode/hyperplan.md 末行路径不一致——移植时按 DSH 现实重写并记差异）；占位符替换器语义参考 = hooks/auto-slash-command/executor.ts:20,89-99。② keyword-detector 收窄清单实测扩充：六级过滤（synthetic/internal、system directive、non-OMO agent、planner、background session、非主 session）+ 双幂等（消息级 `!text.includes(message)` + session 级 Set）+ 组合模式严格相邻双词序 + 交集禁用（基词任一禁则禁 combo）；hyperplan 正则含 `.hpp` 负向后查（issue #4215）；配置两字段 optional 无默认（缺席 = 全启用）；变体文案 = 5+1 个 md（default/gpt/gemini/glm/planner/codex）按名册收窄为单一文案。③ guard：stoppedSessions Set；stop = add + marker；clear = delete + marker "idle"；**chat.message 故意 no-op**（stop 仅显式 clear/session.deleted 清除）；级联 = Pick\<BackgroundManager,"getAllDescendantTasks"|"cancelTask"\>，filter running|pending → allSettled cancelTask（DSH 映射 = ctx.jobs.list + kill）。④ 载体等价面判定：session_read → dsh-session-query 近等价 service 但**无现成模型工具**（handoff 模板该段收窄为指引经会话导出面，记差异）；boulder → Phase 3 已落 live-state.ts（ctx.jobs 承载，文件格式不兼容，复用 H-32 差异清单）；notepad/mktemp → 无专用等价（记差异）；team_create → **无等价面**（Phase 5）；goal 工具族 → dsh-goal 原生等价。⑤ 测试种子实测 **111 its**（keyword-detector 7 文件 89；templates 2 文件 4；commands.test 17；init-deep-migration 1；另有 guard 12 its 可参考）。

## 6. 覆盖统计（随实施滚动更新）

| 状态 | 计数 | 口径 |
|---|---|---|
| 命令移植组（§1.1） | **6 条命令**（C-02…C-07；C-01 原生跳过） | P4-T1 实测锁定；C-03 形态 = 手势桥零代码 |
| 关键词模式（§1.1 C-08） | **1**（非命令，单列） | ultrawork/hyperplan 关键词 → pre-step 注入 |
| hook 接盘项（§1.2） | **2**（H-33/H-34） | Phase 3 S-06/S-37 终态化；H-33 实测 24+1 文件 |
| skills vendor（§2+§3） | **19**（17 shared + 2 senpi） | P4-T1 实测 **288 文件**（286+2）锁定分母 |
| deferred / 排除（§4） | **6** | 每行终态理由齐备 |
| 全树覆盖 | 命令面 + skill 面 + 接盘项全部条目 | 退出标准的完整性硬判定（P4-T1 已锁定分母） |
