# oh-my-opendsh ROADMAP

> 中文翻译；主文档（英文）见 [Roadmap (English)](./roadmap.md)。
>
> 2026-09-11 与决策 **D14**（OMO 基线冻结）同时采纳。本 ROADMAP 指导**冻结 OMO v4.19.4 基线下**的开发方向；它把 D14 落到操作层面，凡与 MVP PRD §6 的 follow-up 拆分冲突处，以本文为准。

## 1. 使命（不变）

把 OMO 的 harness 能力体系接到 DSH 框架上，让**"不赌单一模型"成为 DSH 上的默认工作方式**——编排优先（协奏姿态），合适的模型做合适的事。

本使命是向 DSH 的**一次性语义移植**，不是对 OMO 发布流的持续依赖。这正是 D14 形式化、本 ROADMAP 执行的前提。

## 2. 上游版本政策（D14 操作化）

| 规则 | 内容 |
|---|---|
| 冻结基线 | OMO 语义与代码基线 = **v4.19.4**（v4 线最后一个 release，2026-08-01）。所有已验证知识（persona、hook 映射、协奏设计）保持锚定 |
| 不追 beta | v5.0 beta 线（33 天 53 个 tag）**不予跟踪**。不为 OMO 增设每周哨兵（现有 `compat-probe` 哨兵**只盯 DSH**，不变） |
| 代码引进 = git vendor | 19 个 core 包全是 `private: true`，从未上 npm（可行性报告 §16.2）。任何阶段需要 OMO 源码时，**从 git tag vendor**：届时若 v5.0.0 正式版已发布则用它，否则用 v4.19.4——目标核心包在两版间几乎相同，选择低赌注 |
| 定向搬运 | 凡有具体需求的上游修复/能力，可随时从新 tag 按文件 cherry-pick（带署名）——是定点搬运，不是版本升级 |
| 认知惯例 | 在本项目每个 release 节点（`scripts/release.sh` 运行时）读一次上游 CHANGELOG；凡推翻 §16 勘误假设者记入 `docs/decisions.md` |
| 命名锚点 | 用 v5 名字：`plan-consultant` / `plan-reviewer`、`/ulw-execute`；**codegraph 排除**（上游已删）；memory / DAG / model-profiles = "DSH 原生优先"的候选能力域 |

## 3. 不可协商约束

每个阶段都受 README 两条原则（DSH 原生优先；尊重 OMO 设计与 License）外加以下 License 护栏约束，三者同等效力：

1. **每个 vendor 文件的 SUL-1.0 合规**：`LICENSES/oh-my-openagent.LICENSE.md` 原文随包；每个 vendor 文件/目录在 `THIRD_PARTY_NOTICES.md` 逐一署名；框架保持 MIT OR SUL-1.0 双许可。
2. **非商业**（D8）：不销售、不做商业服务/SaaS。
3. **不给 OMO 提 PR**（D5）；永不移除署名。
4. `scripts/verify-licenses.sh` 必须常绿；上游 License 变更触发 fail 时**不得绕过**（README 原则边界）。
5. 移植语义优先取自 OMO 的 **harness-neutral core 层**（team-core / delegate-core / hashline-core / rules-engine / …），而非其 opencode 适配层（v5 勘误，可行性报告 §16.2）。

## 4. 阶段

### Phase 0 —— 协奏 MVP 骨架 ✅（2026-09-10 结项，v0.2 线）

已交付：`concerto` 运行模式（持久 preset）、omo-sisyphus 指挥人格 + omo-explore 子代理绑定、双模型路由（deepseek-official + pi-ai）、Hard-Blocks 注入 listener、doctor-lite + mock e2e、发布流程（D13）。踩坑 P-1～P-21 记录于 `docs/mvp-pitfalls.md`。

### Phase 1 —— core 源码 vendor 验证（修正后的 O1）✅（2026-09-11 结项）

已交付：`hashline-core`（`@oh-my-opencode/hashline-core` @ v4.19.4，commit `b072d279…`）vendor 进 `patches/omo-dsh/vendor/`，并接入 pnpm workspace 与 vitest（6 文件 78 测试绿）；`THIRD_PARTY_NOTICES.md` **逐文件**署名 29 行（D15）；`verify-licenses` 常绿（D15 补 `license` 字段 + D16 名称门扩展，`checked` 51→52）；`docs/plans/phase1-dev/vendoring-playbook.md` 实录稿。**已 vendor、未消费**（preset 尚未接线）。

- **目标**：在最小有用面上端到端打通 git-vendor 引进路径。
- **范围**：选一个 core 包（候选：`hashline-core`——自包含、无 harness 依赖），从选定 tag vendor 进 `patches/omo-dsh/vendor/`；在本项目工具链下构建 + 单测全绿；署名与 License 条目落地。
- **退出标准**：(a) vendor 包能构建、其测试在本项目 CI 里跑通；(b) `verify-licenses` 绿；(c) `THIRD_PARTY_NOTICES.md` 列出该 vendor 包；(d) 一份简短的 "vendoring playbook" 记录操作要点（怎么复制、需要什么 shim），让后续阶段低成本重复。
- **不在范围**：preset 尚未消费 vendor 代码（由需要它的阶段接入）。

### Phase 2 —— agent 花名册扩展（1+1 → 完整团队）

- **目标**：协奏从 sisyphus+explore 扩到 OMO 完整名册，落在 DSH agent preset 上、每 agent 独立 `{provider, model}` 路由。
- **范围**：hephaestus、oracle、librarian、**plan-consultant**（metis）、**plan-reviewer**（momus）、atlas、multimodal-looker、sisyphus-junior、prometheus；persona 文本取自冻结基线的 prompt（按 §16 用 v5 角色名）；工具限制镜像 OMO 语义（如 plan-reviewer 只读）；agent 间的委派绑定。
- **关键约束**：模型链留在配置而非硬编码；DeepSeek 系路由优先（R1 分期策略）。
- **退出标准**：每个 agent 可经指挥调用、其路由在会话日志可观测（AC-5 模式推广）；名册快照测试常绿。

### Phase 3 —— hook listener 移植

- **目标**：经 listener 翻译模式（MVP 已验证为 V3）把 OMO 的 hook 语义移植到 DSH 事件。
- **范围**：按 §1.2 映射表移植约 30 个 hook 模块，去掉 `codegraph-bootstrap`（已死），`start-work` 内容按其 v5 名 `ulw-execute` 读取；优先级：文件护栏（write-existing-file-guard、bash-file-read-guard）→ todo/goal 执行器 → compaction 辅助 → 会话通知 → 其余。
- **关键约束**：凡 DSH 原生覆盖的 hook（`ctx.goals`、`ctx.compaction`、`ctx.todo`），直接用 DSH——不翻译 OMO 实现（README 原则一）。
- **退出标准**：每个移植的 hook 有 mock-LLM e2e 展示 DSH 事件 → OMO 语义效果；一份 hook 覆盖清单文档跟踪"已移植/跳过（含理由）"。

### Phase 4 —— slash 命令与 skills

- **目标**：OMO 命令面落到 DSH `ctx.commands`：ultrawork 关键词模式、`/ulw-execute`、`/ulw-plan`、`/goal`（已由 `dsh-goal` 原生覆盖）、`/hyperplan`、stop-continuation、handoff、remove-ai-slops。
- **范围**：命令注册 + shared-skills 内容（17 个 skill，裸名——无 `shared/` 前缀，按 §16）。
- **退出标准**：每条命令在脚本化场景中驱动预期 agent 行为；skill 加载原样复用 `dsh-skill`。

### Phase 4.5 —— DSH 0.2.x 运行时适配

> 2026-10-02 插入，位于 Team Mode 之前。刻意编号 4.5：给 Phase 5–7 重排号会让每一处既有引用（README 状态、计划目录、R-8 注记）无谓翻动，语义收益为零。范围与证据见 [`dsh-0.2.0-rc.2-review_zh-CN.md`](./dsh-0.2.0-rc.2-review_zh-CN.md)（静态源码实证；尚未跑运行时门）。

- **目标**：让 overlay——协奏 preset、hooks、commands——在已发布的 dsh 0.2.x 线上（按 `0.2.0-rc.2` 复核）完整可用、全门转绿，然后翻 D7 pin。本阶段结项前，CI pin 保持 `0.1.5-rc.1`，0.2.x 是矩阵里已登记的 `untested` 行，不是受支持的运行时。
- **为何是现在**：上游交付的三次重写正中本项目的承重层，且**三者全部静默失效**——agent-preset 重架构删掉了 `syncConcertoPreset` 所物化的 `$DSH_HOME/.agent-presets/` 文件发现（协奏模式干脆不注册）；`ctx.jobs` 重写让三个 jobs 触点无一抛出地失效；会话日志格式 v4 重构了 e2e 驱动伪造与解析的 `tool/result` 信封。Team Mode（Phase 5）直接建在 `ctx.jobs` + `ctx.subagents` 之上，所以先适配不是可选的排序偏好，而是依赖关系。
- **范围**（按复核推导的强制顺序——先修功能所站立的面，再修功能，pin 最后）：
  1. **`ctx.jobs` 适配**（小、孤立）：`background-notification.ts` → `jobs.events.subscribe({owners:'scope'})` 并以 `settled.awaited` 去重；`stop-continuation-guard.ts` → `SessionId` caller + `JobView.owner`；`ulw-execute/live-state.ts` → 新 `JobSpec`（`owner: SessionId`、`run(job: JobHandle)`、`result`）。
  2. **协奏 preset 注册**（核心功能）：sentinel 渲染管线保留，写文件出口替换为 `ctx.agentPresets.register({id:'concerto', …, plugins})`；roster 词汇去掉 `trust`；探针与 e2e 断言改指 registry roster 与已组合 agent 树。
  3. **会话日志 v4 观测通道**：沙箱 profile 维持 `compression: none`（本即是设计）；驱动伪造条目与日志解析器迁到 v4 `tool/result` 形状（`role:'tool'` + 顶层 `toolCallId`/`isError`）。
  4. **延后对齐项**：`source:{kind:'plugin'}` → 声明式专属 source kind（13 处；已废弃惯用法，非活断裂）。
  5. **pin 机器，刻意最后**：ci.yml `DSH_VERSION` + `--before` 截止（走 `scripts/bump-dsh.sh`）、doctor-lite 的 D7 semver 断言、兼容矩阵行——仅在下面这条证据链于 0.2.x 全绿之后。
- **退出标准**：(a) L1 全链在 pin 的 0.2.x 运行时上转绿——单测、doctor-lite（含名册语义闸）、`verify-concerto-static`、`check-docs-consistency`、e2e 驱动、`run-proofs.sh`；(b) L2 真机验证在 0.2.x 重跑并产新证据文件，0.2.x 矩阵行以 `tested` 登记；(c) roster 重新出现 `concerto`，且一次脚本化委派往返真实落在它上面；(d) `/stop-continuation` 级联 e2e 证明 job 确实被取消（静默跳过的金丝雀）；(e) D7 pin 的翻转与绿色证据同一次变更交付。
- **明确不在范围**：新的 OMO 能力移植（Phase 5–7 的事）；采用超出适配所需的 0.2.x *新特性*（每个候选日后单独过"DSH 原生优先"检查）；任何 OMO 侧变动（D14 不动）。
- **观察**：0.2.0 是 rc 线——适配以执行时当前的 0.2.x rc 为 pin，复核报告的 tag 级引用对它的再验证列为第一阶段任务。

### Phase 5 —— Team Mode（v5 模型，DSH 原生）

- **目标**：DSH 上的并行多 agent 协作——**当前会话即 lead**，成员 = category worker（按 category 模型/技能开新 subagent 会话）与用户自定义 agent；mailbox 式协调。
- **设计依据**：v5 team-mode 模型（可行性报告 §16.2）——**不是** v4 的声明式 lead 模型；v5 模型与 `ctx.subagent` + `ctx.jobs` 一一对应。v5 调查的定向搬运清单：成员复活 TTL、fallback-wake（#5317）、member-task 关联。
- **可视化**：D4——web ChatNode via `ConversationNodeDefinition`；**不用外部 tmux**。
- **退出标准**：一个 3 成员团队（lead + 2 个 category worker）在脚本化并行任务中完成协作，消息交换在 web UI 可见；嵌套 `team_create` 被拒；拆除后无孤儿会话。
- **观察**：上游 mass-ulw DAG 拓扑为 senpi 独占且与 `dsh-workflow` 重叠；只有当具体需求挺过"DSH 原生优先"检查时才重议。

### Phase 6 —— MCP 与编辑

- **目标**：LSP（走 `dsh-lsp`）、ast-grep（上游的活方向）、web 搜索/抓取（DSH 内建），以及编辑模型决策：hashline（`hashline-core`，Phase 1 已 vendor）vs DSH `str-replace-editor`——按原则一以 A/B 证据记录裁定。
- **明确排除**：codegraph（上游已删，§16.2）。
- **退出标准**：每个入选能力在脚本化场景中被 agent 真实使用。

### Phase 7 —— 硬化与节奏

- 按 D13 发布（矩阵行须为 `tested`）；每个 release 节点执行 §2 的认知惯例；1.0 之前决定开放维度 O3（npm 命名）与 O5（telemetry）；Windows 维持范围外（D9），直至显式重议。

## 5. 明确非目标（沿用，不变）

不给 OMO 或 DSH 上游提 PR（D5）；不做商业用途（D8）；不支持 Windows/WSL（D9）；不取代 OMO——本项目是 OMO 能力体系的 DSH adapter（可行性报告 Summary 3）。

## 6. 观察项（认知，非跟踪）

| 项 | 为何观察 | 行动触发条件 |
|---|---|---|
| v5.0.0 正式版发布 | vendor tag 选择（D14 规则 3） | Phase 1 启动时，或某条 §16 假设被打破时 |
| memory-core / mass-ulw DAG / model_profiles | 候选能力域 | 仅当具体需求未通过"DSH 原生优先"检查 |
| 上游 License 变更 | SUL-1.0 合规 | `verify-licenses` fail，或 release 节点读 changelog 发现 |
| v4 线存档分支 | 基线完整性 | 无——v4.19.4 是冻结知识，不是依赖 |

## 7. 估算

§10 的工量数字（含全量移植约 16 周的粗估，R3：无 buffer、非承诺）仍为参照。v5 调查带来两处修正：Team Mode（Phase 5）**下调**（v5 模型天然是 DSH 形状）；vendor 验证（Phase 1）是**新增但很小**的一步，为后续每个阶段去风险。0.2.x 复核（2026-10-02）带来第三处修正：Phase 4.5 体量**小到中**（两个小项、两个中项、一个可延后的对齐项——§4 Phase 4.5 范围）但**闸住其后一切**，因为它的面全部静默失效，只有完整证据链能证明修复。
