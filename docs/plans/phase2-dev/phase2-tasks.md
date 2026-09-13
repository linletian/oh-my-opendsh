# Phase 2 任务清单

> **上游依据**：[开发计划书](./phase2-plan.md) · [名册基准表](./phase2-roster.md) · [ROADMAP Phase 2](../../roadmap_zh-CN.md) · [决策 D14](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 2 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，基准表给出"每 agent 的数据"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：🚧 **1/22 完成**（PRE-1…PRE-5 ✅；P2-T1 ✅ 2026-09-12；WP-1 进行中）。`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）。
>
> **编号**：`P2-T<n>`（Phase 2 - Task n）。工作包归属见计划书 §7。

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1 | 上游 OMO v4.19.4 可取到源码 | `git -C <omo> rev-parse v4.19.4^{commit}` 返回 `b072d279110bdda2c6ac2525d0d24dc54d16148a` | ✅ 2026-09-12 实测：返回值与锚点逐字一致 |
| PRE-2 | v5.0.0 正式版**未**发布 → tag 选择闭合为 v4.19.4（D14 规则 3） | `npm view oh-my-openagent dist-tags --json` 的 `latest` 仍为 `4.19.4` | ✅ 2026-09-12 实测：`latest=4.19.4`（`beta=5.0.0-beta.62`，非正式版） |
| PRE-3 | 基线绿：`scripts/ci-local.sh` 8 门全绿 | 退出 0；记录基线（含门 2 测试数、门 3 场景数） | ✅ 2026-09-12 实测：8/8 门 PASS 退出 0；门 2 = **187 单测 / 15 文件**；门 3 = **4 场景**（hello / concerto-delegation-demo / explore-write-denied / explore-nested-delegation-denied）；门 5 `checked=52`；门 6 = 10/10；门 7 = 8/8 |
| PRE-4 | installed dsh = pin 的 0.1.5-rc.1 | `dsh --version`；doctor-lite 基线 PASS | ✅ 2026-09-12 实测：`0.1.5-rc.1`；doctor-lite 基线 PASS（门 4） |
| PRE-5 | 本地 OMO 检出只读可用 | `git -C ~/GithubRepo/oh-my-openagent ls-tree v4.19.4 packages/omo-opencode/src/agents/` 非空；全程只用 `git show/ls-tree`，工作树不动 | ✅ 2026-09-12 实测：ls-tree 返回完整 agents/ 清单（hephaestus/、atlas/、sisyphus-junior/、prometheus/ 子目录与各单文件均在） |

---

## WP-0 调研核对（计划书 §4.1/§4.4/§4.6，基准表 §4）

### [x] P2-T1 — 上游名册事实与 DSH 机制逐件复核

- **产出**：回填后的 [名册基准表](./phase2-roster.md)（全部 🔍 转 ✅ 或更正）。
- **做法**：
  1. **上游 permission 复核**（基准表 §4 待核清单 1–2）：对 hephaestus / atlas / sisyphus-junior / prometheus / oracle / metis，逐个 `git show v4.19.4:<path>` 读完整 permission 构造（注意 hephaestus/atlas 的动态 config 分支与 `builtin-agents/*-agent.ts` 的注册路径），记录实际 deny/allow 语义。
  2. **元数据全量值**（待核清单 3）：从各 `*_PROMPT_METADATA` 与 `agents/types.ts` 摘出 useWhen/avoidWhen/triggers/cost/keyTrigger 全量值，作为 P2-T14 委派表的数据源（可先记在基准表附录或草稿文件）。
  3. **Q-1**（读媒体工具名）✅ **评审已实测闭环**（`read` 纯文本 + `read_image` 独立条件注册 → allowlist `[read, read_image]`，基准表 §2.8/§3）：本步仅在 pinned dsh 上复核行号引用一致性，并用 probe 沙箱枚举一次子会话工具名单确认 `read_image` 在场。
  4. **Q-3**（`toolFilter.allow` 与 `deny` 同给行为）：读 installed `dsh-tool-subagent/lib/index.js` 与子级 `restrict()` 实现，结论写入基准表 §3。
  5. **视觉座与连字符名**（待核清单 A.4）：确认 pinned dsh（0.1.5-rc.1）的 `dsh-llm-deepseek` catalog 含 `deepseek-v4-flash-vision-exp`；确认 OpenAI 兼容 tool name 模式接受连字符（adapter lib 或 probe 冷启动注册日志）。
  6. **pi-ai `deepseek` 路由可用 model id 清单**（P2-T18 路由分布的依赖，评审已实测 = 3 id：基准表 §3）：复核 pinned dsh 安装的 `@earendil-works/pi-ai` 版本该清单未漂移。
- **判定**：✅ 基准表 §4 **A 组（输入核实）4 项**全部闭环（✅ 或更正值 + 更正理由）；B 组 Q-3 结论写进基准表 §3（Q-1 复核引用即可）。
- **证据**：2026-09-12 复核完成，基准表 §4 六项全闭环：① 上游 permission 逐文件复核（hephaestus/atlas/sisyphus-junior/prometheus/oracle/metis + 辅助函数 + L2 层）——更正 1 处预期（prometheus 实为 hook 限 `.md` 写而非 permission 只读）、3 处"有意收窄"注记（hephaestus 的 task、sisyphus-junior 的 call_omo_agent、metis 的 call_omo_agent 委派权不镜像，理由记录）；证据 `.omo/evidence/p2t1-upstream-permissions.md`。② `*_PROMPT_METADATA` + `AGENT_MODEL_REQUIREMENTS` 全量逐字提取（上桌 6 / 未上桌 2 / 无常量 2）；证据 `.omo/evidence/p2t1-upstream-metadata.md`；T14 数据源就绪。③ Q-1：行号引用复核一致（:332/:1257/:1270-1271/:1040；批次3 评审 NIT 复核后于 2026-09-12 更正两处行号）+ 子会话枚举实证（门 3 `explore-write-denied` verdict bonus `childAdvertisedToolNames` 含 `read_image`，基线复跑于 pinned dsh）。④ Q-3 = **allow ∧ ¬deny**，multimodal-looker 无需补 deny 委派名（结论入基准表 §3，`admits()` :2545-2547）。⑤ 视觉座 catalog 直核未漂移（DEFAULT_MODELS :1864 + deepseek.json 3 id）；连字符名 lib 层结构性安全（dsh-tools 无字符集限制 + adapter 逐字转发 :231），boot 断言留 P2-T15。⑥ pi-ai `deepseek.json` = 3 id 未漂移。
- **依赖**：PRE-1…PRE-5。**量级**：0.5 天。

---

## WP-1 名册事实源（计划书 §4.2/§4.6）

### [x] P2-T2 — `src/roster.ts`：名册唯一事实源

- **产出**：`patches/omo-dsh/omo-agents/src/roster.ts`（新增）。
- **做法**：按计划书 §4.2 的 `RosterEntry` 形状声明 11 个条目（sisyphus 只持路由、不进委派工具部分——用字段或分立常量表达，实施时择一并注释理由）；每条的 `defaultRoute` 带注释写明 OMO 链首参照与选座理由（基准表 §1）；委派 toolName 列表的计算函数（供逐行 deny 哨兵与断言消费）。
- **判定**：✅ `pnpm typecheck` 绿；11 条目的字段与基准表 §1 总表逐格一致（id / class / maxDepth / 默认路由 / env 名）。
- **证据**：2026-09-12 编码完成（编码 sub-agent：deepseek-official/deepseek-flash）。roster.ts 371 行：`delegation: false` 字段表达指挥 route-only（择一理由注释于文件头）；每条 defaultRoute 带 OMO 链首 + 选座注释；`DELEGATION_TOOL_NAMES`（10 名，名册序）+ `denyToolNamesFor`/`allowToolNamesFor` 按类计算（read-only = [write,edit]+10 名 / worker = 10 名 / orchestrator·allowlist = undefined；委派行缺 class 则 throw）。`pnpm typecheck` exit 0。双评审：**Kimi K3(max) APPROVE**（2 NIT，非缺陷——ENV_VARS 形状扩展系 T3 授权；deny 序以 roster 行为准已写回基准表）+ **mcode review APPROVE**（"未发现需要处理的问题"）；CI 全 8 门绿。
- **依赖**：P2-T1。**量级**：2 小时。

### [x] P2-T3 — `model-routes.ts` 名册化 + 校验规则

- **产出**：改后的 `model-routes.ts` + 单测更新。
- **做法**：`resolveModelRoutes()` 返回名册路由映射（11 条）；保留：env 覆盖、空值 loud throw、**sisyphus≠explore 硬预检**（AC-5 语义内核）；新增两条**非阻断**警告标记（boot log 用）：① 全员（11 条）同一路由；② **全部委派 agent（10 条）同座**（强座单点集中提示——计划书 §4.6 校验规则）；`MODEL_ROUTE_ENV_VARS` 扩为 11 组（既有 4 个变量名**不改**——向后兼容）。
- **判定**：✅ 单测覆盖：默认值全景（11 条 = 基准表）、每组 env 覆盖、空值 throw、AC-5 预检仍 fire、两条警告各自 fire/不 fire 的边界；既有 explore/sisyphus 用例不回归。
- **证据**：2026-09-12 编码完成（deepseek-flash）。`resolveModelRoutes()` 返回 `Record<AgentId, ModelRoute>`（属性访问向后兼容，index.ts/concerto-preset.ts/scripts/e2e 全部消费点零改动实证）；警告经 `evaluateModelRouteWarnings` 纯函数 + `resolveModelRoutesWithWarnings` 返回（非阻断纪律保持）；文件头诚实注记 warning① 经 resolver 不可达（AC-5 先 throw）——评审确认 sane。单测 202/202 PASS（16 文件，新增 roster.test.ts 11 用例 + model-routes.test.ts 12 用例；硬编码期望表非推导，变异敏感性经评审实测：路由翻转→2 文件红、env 名错字→2 红、类翻转→4 红）。双评审 APPROVE（同 P2-T2）；CI 全 8 门绿（门 2 = 202 测试、门 3 = 4 场景无回归）。
- **依赖**：P2-T2。**量级**：3 小时。

---

## WP-2 Persona 移植（计划书 §4.3/§4.5）

### [ ] P2-T4 — persona builder 泛化 + 移植配方

- **产出**：`src/persona-prompts.ts`（`buildAgentPersona(id)` 泛化 builder，`explore-prompt.ts` 迁移或包装到其上）；本任务同时**成文化移植配方**供 T5–T13 逐字执行：① 只从 tag 取上游 prompt（`git show v4.19.4:<path>`）；② 语义浓缩保留"角色身份 / 约束性声明 / 输出契约"三要素；③ 改写 harness 特定引用（`apply_patch`→写类拒绝泛化、`task`/`call_omo_agent`→委派缺席、opencode 概念→删除/改写）；④ HTML 注释署名头（列全部上游源文件 + "语义移植"声明）；⑤ `{{` 禁令（builder reject 保持）；⑥ **命名双约定**（沿用仓库既有，不发明第三种）：persona 源文件 = `system-sections/<id>-persona.md`（沿用 `explore-persona.md`），签入快照 = `tests/omo-agents/__snapshots__/<id>-system-prompt.md`（沿用 `explore-system-prompt.md` / `sisyphus-system-prompt.md`）。
- **判定**：✅ explore persona 经泛化 builder 重建后与既有快照**逐字节一致**（重构零漂移证明）；`{{` reject 用例保留。
- **证据**：（待填）
- **依赖**：P2-T2。**量级**：2 小时。

### [x] P2-T5 — persona：`hephaestus`

- **产出**：`system-sections/hephaestus-persona.md` + 快照 `tests/omo-agents/__snapshots__/hephaestus-system-prompt.md`（命名约定见 T4-⑥）。
- **做法**：按 T4 配方；上游主源 `agents/hephaestus/`（模型变体文件取通用层，GPT 特定引用按 R-3 注记改写）；保留"目标驱动、自主工作到完成"语义内核。
- **判定**：✅ 快照签入且非空；署名头列出实际上游源文件；对照上游逐节核对三要素无缺失。
- **证据**：2026-09-12 批次1（deepseek-flash 一轮过）。hephaestus-persona.md 68 行 + 快照 68 行（builder 实出生成）；评审逐节对照上游核实：goal-not-recipe 内核保留、GPT 特定调优剥离（lsp_diagnostics→typecheck、无 background-ID 契约）、Manual-QA 本质以 "exercise the result directly" 改写、3 次失败协议保留、write/edit 授予明示且无 read-only 标记、委派缺席改写正确、假设入报告。双评审 APPROVE（Kimi 3 NIT 装饰性归属措辞——仲裁不修复并记录；mcode 无问题）；CI 8/8 绿（门2=240）。
- **依赖**：P2-T4。**量级**：2 小时。

### [x] P2-T6 — persona：`oracle`

- **产出**：`system-sections/oracle-persona.md` + 快照。
- **做法**：按 T4 配方；**输出契约完整保留**（verbosity spec / Bottom line / Action plan / Effort 标签 / 三段响应结构——基准表 2.3 注记）；保留 session continuation 追问句。
- **判定**：同 P2-T5。
- **证据**：批次1。oracle-persona.md 108 行 + 快照；评审逐条对照上游核实输出契约**零缺失**（5 项数值上限、三层结构含 Escalation triggers/Alternative sketch、Effort 四档精确、追问句、2x-effort ask、不捏造、max-2 optional considerations、高风险自检 4 项）；header 行号引用 :8-38 核验精确。双评审 APPROVE；CI 绿。
- **依赖**：P2-T4。**量级**：2 小时。

### [x] P2-T7 — persona：`librarian`

- **产出**：`system-sections/librarian-persona.md` + 快照。
- **做法**：按 T4 配方；工具面引用写 `web_search`/`web_fetch`（composition 继承），context7/MCP 类引用删除（Phase 6）。
- **判定**：同 P2-T5。
- **证据**：批次1。librarian-persona.md 86 行 + 快照；评审核实：TYPE A-D 分类与触发路由保留、文档发现流完整（官方优先/版本确认/sitemap 三回退/定向抓取/跳过条件）、引用契约绑定要素齐全、失败恢复全覆盖（context7/grep_app/gh 项正确删除或泛化）、正文无 context7/MCP 残留（剥离归属注释后断言）；header :7-22 核验精确。双评审 APPROVE；CI 绿。
- **依赖**：P2-T4。**量级**：1.5 小时。

### [x] P2-T8 — persona：`plan-consultant`（v4 metis）

- **产出**：`system-sections/plan-consultant-persona.md` + 快照。
- **做法**：按 T4 配方；上游主源 `agents/metis.ts`（K2.7 变体不取）；保留 gap 分析框架（隐藏意图/歧义/失败点）；署名头注明改名映射（metis → plan-consultant，ROADMAP 命名锚点）。
- **判定**：同 P2-T5。
- **证据**：2026-09-12 批次2（deepseek-flash，1 修复轮）。plan-consultant-persona.md 176 行 + 快照；6 类 intent 分类 + 逐类 gap 分析 + 输出契约（含 agent 可执行 QA MANDATORY 块）保留；call_omo_agent 改写为委派缺席；Anti-Duplication 正确排除；改名映射真实（agent-names.ts:28 有 plan-consultant→metis 条目）。评审轮1 Kimi REJECT 含本文件 2 项（2x 量化词系 oracle 跨 agent 污染——属实已删；oracle 措辞改指 caller/planner），修复后双 APPROVE；CI 8/8 绿（门2=271）。
- **依赖**：P2-T4。**量级**：2 小时。

### [x] P2-T9 — persona：`plan-reviewer`（v4 momus）

- **产出**：`system-sections/plan-reviewer-persona.md` + 快照。
- **做法**：按 T4 配方；上游主源 `agents/momus.ts`（GPT-5.6 变体不取）；保留 clarity/verification/context 三轴评审框架。
- **判定**：同 P2-T5。
- **证据**：2026-09-12 批次2。plan-reviewer-persona.md 165 行（修复轮后；轮1 时 153 行）+ 快照；立场经评审确认 faithful——上游实为 APPROVAL BIAS/OKAY 默认/max-3/BLOCKER-finder（非"找出一切毛病"，基准表 §2.6 措辞按 DoD-d 以此为准）；三轴检查零阈值损失；输入契约泛化（YAML 拒绝被吞并并已记录）。评审轮1 Kimi REJECT（MAJOR：归属头伪造 agent-names.ts 映射——仲裁复核属实，上游无 momus 改名条目），修复轮改为"project-anchored 非 upstream-mapped"诚实措辞 + 测试双向钉死；复审双 APPROVE；CI 绿。
- **依赖**：P2-T4。**量级**：2 小时。

### [x] P2-T10 — persona：`atlas`

- **产出**：`system-sections/atlas-persona.md` + 快照。
- **做法**：按 T4 配方；保留"纯编排、绝不亲手实现（NEVER THE IMPLEMENTER）"内核与独立验证纪律；写明其可再委派 worker（maxDepth 2 的 persona 表达）；`/ulw-execute` 命令面引用改为"由指挥激活"（Phase 4 前不引用未移植命令）。
- **判定**：同 P2-T5。
- **证据**：2026-09-12 批次2。atlas-persona.md 183 行 + 快照；NEVER-THE-IMPLEMENTER 绝对规则 + 写权限限定为编排簿记、可委派声明（唯一保留委派工具的子级）、6 段 dispatch 契约、默认并行、独立验证纪律、durable-id 续作、指挥激活（无 /ulw-* 命令面）；上游 prompt 真身在 prompts-core/prompts/atlas/default.md（源集拓宽经评审核实）；category/load_skills/notepads/Codex 表/start-work 各 drop 逐项经评审验证。双 APPROVE；CI 绿。
- **依赖**：P2-T4。**量级**：2 小时。

### [x] P2-T11 — persona：`multimodal-looker`

- **产出**：`system-sections/multimodal-looker-persona.md` + 快照。
- **做法**：按 T4 配方；工具面声明按基准表 §2.8 的评审实测结论写（allow 精确值 `[read, read_image]`；`read_image` 条件注册 caveat 写入 persona 注释或正文注记）；保留"提取信息而非返回原文"的输出纪律。
- **判定**：同 P2-T5。
- **证据**：2026-09-12 批次3（deepseek-flash 一轮过）。multimodal-looker-persona.md 90 行 + 快照；工具面声明 = 恰好 [read, read_image] 双工具 + read_image 条件注册 caveat 入正文；look_at 调用模型反转（无附件机制，caller 给路径）已在署名头披露；提取而非转储/诚实报告纪律保留；when-to-use 清单作为 caller 侧路由指引删除（归 T14 委派表）。双评审 APPROVE（Kimi 4 NIT 仲裁接受；mcode P3 抓仲裁者文档错误已更正）；CI 8/8 绿（门2=306）。
- **依赖**：P2-T4 + P2-T1（复核 §2.8 行号引用）。**量级**：1.5 小时。

### [x] P2-T12 — persona：`sisyphus-junior`

- **产出**：`system-sections/sisyphus-junior-persona.md` + 快照。
- **做法**：按 T4 配方；上游主源 `sisyphus-junior/default.ts`；保留"无委派权的专注执行器"内核；category 中介语义**不移植**（基准表 2.9 注记）。
- **判定**：同 P2-T5。
- **证据**：2026-09-12 批次3。sisyphus-junior-persona.md 91 行 + 快照；worker 形态正确（可写、不可委派——上游 call_omo_agent 强制 allow 有意不镜像）；todo 纪律/验证门/终止纪律（首次成功验证后停止）保留；category 路由中介语义未移植（Phase 5，正文无 categor* 残留，署名头有 NOT-ported 注记）；default.ts 唯一移植源（8 变体排除经评审对照 agent.ts:28-35 核实）。双 APPROVE；CI 绿。
- **依赖**：P2-T4。**量级**：1.5 小时。

### [x] P2-T13 — persona：`prometheus`

- **产出**：`system-sections/prometheus-persona.md` + 快照。
- **做法**：按 T4 配方；保留访谈式规划框架（explore-first / CLEAR-UNCLEAR intent 路由）；访谈对象改写为指挥（问题写回报告，不经 `ask_user`——基准表 2.10 注记）。
- **判定**：同 P2-T5。
- **证据**：2026-09-12 批次3。prometheus-persona.md 174 行 + 快照；访谈式规划框架完整（intent 路由 CLEAR/UNCLEAR/explicit-ask/on-the-fence + 两过滤器 + owner-decision 例外、topology lock、clearance check、decision-complete 北极星含 full-scope/Must-NOT-Have/column-zero 任务行/agent 执行 QA）；访谈对象改为指挥（问题入报告含选项/分叉/推荐默认，不 ask_user、不停摆、跨 continuation 续谈）；只读收窄记录（上游 hook 限 .md 写不移植）；/ulw-plan 及评审环未作为可用引用。双 APPROVE；CI 绿。
- **依赖**：P2-T4。**量级**：2 小时。

### [x] P2-T14 — sisyphus 第 5 段：名册委派表

- **产出**：`system-sections/delegation-roster.md` + `SISYPHUS_SECTION_ORDER` 更新 + sisyphus 快照更新。
- **做法**：数据取自 P2-T1 摘出的上游元数据全量值；每 agent 一行：域 / 何时派 / 何时不派 / 成本档（FREE/CHEAP/EXPENSIVE）；署名头标注元数据来源；插入顺序 `delegationDiscipline` 之后；`{{` 检查通过。
- **判定**：✅ sisyphus 快照更新签入（5 段）；表中 10 个委派目标与 roster.ts 的 toolName 集合**逐一对应**（单测断言，防文档与名册漂移）。
- **证据**：2026-09-12（deepseek-flash，1 修复轮）。delegation-roster.md 79 行：10 行委派表（域/何时派/何时不派/成本档），6 行转录自上游 *_PROMPT_METADATA、4 行+2 格+1 行内联为推导并逐条披露；OMO 引用泛化（改名对、无 .omo/plans、无缺席工具名）；SISYPHUS_SECTION_ORDER = [role, delegationDiscipline, delegationRoster, hardBlocks, antiPatterns]（必填键）；sisyphus 快照更新（唯一变动的快照）；delegation-roster.test.ts 10 用例 anti-drift（集合+顺序 ↔ roster.ts DELEGATION_TOOL_NAMES、成本档硬编码、解析对畸形行 throw、删除/改名/交换/成本漂移反向证明）；probe 最小修复 4→5 sections（gate 8 不断，全量名册化留 T20）。评审轮1 Kimi APPROVE 3 NIT + mcode 4 P3 → 仲裁合并 6 项有效修复 → 复审双 APPROVE；CI 8/8 绿（门2=318）。
- **依赖**：P2-T2 + P2-T1（元数据）。**量级**：2 小时。

---

## WP-3 Composition 扩展（计划书 §4.4/§4.5）

### [x] P2-T15 — 模板 9 个新委派行 + 逐行 deny 哨兵渲染器

- **产出**：`concerto/agent.cordis.yml` 的 delegation 组扩为 12 行 + `concerto-preset.ts` 的名册驱动渲染（`renderAgentSentinels`：persona / agentOptions / 逐行 `__OMO_<ID>_DENY__` 三类哨兵统一从 roster 渲染）。
- **做法**：每行：`id: tool-subagent-<id>`、`provider: spawn`、`toolName: <id>`、`backgroundMode: continuable`、`persona: __OMO_<ID>_PERSONA__`、`agentOptions: __OMO_<ID>_AGENT_OPTIONS__`、toolFilter 按类（只读 6 行 / worker 2 行写 `deny: __OMO_<ID>_DENY__` 逐行唯一哨兵；atlas 无 filter 键；multimodal-looker 静态 `allow`，基准表 §1）、maxDepth 按类；渲染器从 roster.ts 按类计算委派名集合渲染各 deny 哨兵（JSON-quote 名字）；`replaceSentinelOnce` 恰好一次护栏原样适用（sentinel 名带行 id）；哨兵位合计 11 persona + 10 agentOptions + 8 deny = **29 个**；台账注释（KEEP/DROP/DEV 体例）补记本次扩展。
- **判定**：✅ 渲染后 composition：哨兵零残留（grep `__OMO_` 无命中）；每行 filter/maxDepth 与基准表一致；`loadYamlDialect` 解析通过；explore 行形状除 deny 哨兵外无回归；**两次冷启动 / 12 行并存**时无 "prompt section already registered" 类报错（每个实例注册 `tool:<toolName>` 段——toolName 唯一则段名结构性不撞，此处取冷启动日志实证兜底，基准表 §3）。
- **证据**：2026-09-12/13（deepseek-flash，1 修复轮=探针断钉）。模板 delegation 组 12 行（control+list-agents+10 roster 行 roster 序；逐行 persona/agentOptions 哨兵；只读 6+worker 2 行逐行唯一 deny 哨兵；atlas 无 toolFilter 键 maxDepth 2；looker 静态 allow [read, read_image]；台账注释更新、散文不写 __OMO_ 字面量）。renderAgentSentinels 名册驱动渲染（29 哨兵逐行恰好一次、空 deny 拒绝、SENTINEL_PATTERN 残留检查）；sync 签名 {personas?, routes?} 局部回退注入；index.ts 零改动兼容。门最小修复全部 roster 派生（doctor-lite explore 契约 + doctor-lite.d.mts、c10 名册完整性、prove-toolfilter 反真空断言、probe 两处 deny 钉从 roster.ts 计算）；双 boot 冷启动实证 12 行并存无 already-registered 类报错、零残留。评审 Kimi APPROVE（2 NIT 留 T20）+ mcode APPROVE；CI 8/8 绿（门2=327，e2e 4 场景零改动）。
- **依赖**：P2-T2 + P2-T5…T13（persona 文件齐备，渲染才有内容）。**量级**：4 小时。

### [x] P2-T16 — apply 接线与 boot marker

- **产出**：`index.ts` 名册化 boot marker（子级 10 行 `persona assembled` + 路由汇总行 + **三条**非阻断警告行——全员同值 / 委派同座（T3）/ **route provider not registered**（本条，M-2））；`syncConcertoPreset` 签名/默认值名册化；`concerto-preset.test.ts` 更新。
- **做法**：保持 loud-but-non-fatal 纪律（每 agent 独立 try/catch，一个 persona 坏不拖垮其余）；marker 文案保持 probe 可断言的稳定格式。**provider 注册检查**：apply() 时经 `ctx.inject` 读 llm 服务的 provider 列表（确切服务名/方法以实施时源码核实为准——probe 的 POST /api/llm.providers 是外部等价物），11 条路由中 provider 未注册者打一**非阻断**警告行（注册是 keyless 且可热加载，故只警告不阻断——与 T3 两条警告同纪律）；没有该检查，缺 pi-ai 段的部署会让快座子级到被委派时才 `model-unavailable`（会话级失败而非 boot 可见）。
- **判定**：✅ 单测绿；probe 沙箱冷启动日志含 10 个 persona assembled 行 + 路由汇总行（11 条）+ 三条警告行的 fire/不 fire 与种子一致。**口径注**（与 §3 的 29 哨兵位并读）：**11** = persona 哨兵位（含指挥——指挥 marker 走既有 `omo-sisyphus system prompt assembled`，index.ts:124）；**10** = 子级 `persona assembled` 行。
- **证据**：2026-09-13（deepseek-flash 一轮过）。boot-markers.ts（317 行纯函数模块：10 子级 persona 行/11 路由汇总行/座位警告行/provider 检查行格式与求值）+ index.ts 改薄（DELEGATION_ENTRIES 循环逐 agent try/catch、resolveModelRoutesWithWarnings 消费、ctx.inject(['llm']) 接线）；boot-markers.test.ts 32 用例（格式钉、假定时器 settle 覆盖、分组、纪律、apply 接线）。provider 检查为 SETTLED 设计（增长+50ms / 静默 8s / run-once）——编码实测 pi-ai 异步注册致 t0 直读误报；评审负向 boot 实证缺省部署真的打出 missing 行。探针零改动通过（两锚点字节兼容）。评审 Kimi APPROVE（3 NIT 论证非缺陷）+ mcode APPROVE（首轮遇 MiniMax Token Plan 5h 窗口限额，按半小时周期重试成功）；CI 8/8 绿（门2=359）。
- **依赖**：P2-T15。**量级**：2 小时。

---

## WP-4 门与 e2e（计划书 §4.7）

### [x] P2-T17 — 名册快照测试 + roster 一致性单测

- **产出**：`tests/omo-agents/roster.test.ts`（或并入既有 suite）+ 签入快照 `tests/omo-agents/__snapshots__/roster.md`。
- **做法**：① 渲染后 composition ↔ roster.ts 一致性：每 roster 委派条目恰好一行、toolName 相等、deny/allow 与类匹配、maxDepth 正确、路由 == resolveModelRoutes() 对应座；② 名册结构快照（roster.md：每 agent 的 id/类/路由/filter/maxDepth 清单，结构化、人读可评审）；③ Q-3 行为钉住（allow+deny 同给时渲染结果与断言）；④ 快照非空断言（R-5 假绿教训）。
- **判定**：✅ 门 2 绿且 roster.md 签入；故意改一个 roster 条目 → 测试红（反向证明）。
- **证据**：2026-09-13（deepseek-flash；首个全量委托遇工作流中止，紧凑型补全轮完成——此后委托 prompt 全面收紧）。roster-composition.test.ts 56 用例（每 roster 委派条目 ↔ 恰好一渲染行：toolName/类 filter/maxDepth/agentOptions==resolveModelRoutes()[id]/persona 字节一致；12 行普查；指挥/通用/产品行缺席）；roster-snapshot.ts 生成器 + __snapshots__/roster.md 32 行结构化快照（退出标准 b：字节断言内嵌反假绿、无重写路径、再生命令文档化且复核字节一致）；roster-toolfilter-mechanism.test.ts 4 用例（Q-3 机制层：真实 applyChildComposition→restrict 证明 allow∧¬deny 两键同给；looker 真实 filter 无 deny 键隐藏全部 10 委派工具；非空控制+父隔离）。反向证明：翻 explore maxDepth 1→2 恰 4 具名失败（评审独立复现并字节恢复）。双评审 APPROVE（Kimi 2 NIT 接受）；CI 8/8 绿（门2=419）。
- **依赖**：P2-T16。**量级**：3 小时。

### [x] P2-T18 — e2e：MOCKROLE 泛化 + roster-parade 场景

- **产出**：`tests/e2e/drive.mjs` 的 MOCKROLE 机制泛化 + 新增 `roster-parade` scenario。
- **做法**：
  1. **MOCKROLE 泛化（前置子任务，评审实测驱动）**：`MOCKROLE_BLOCK_SCALARS` 从硬编码 2 条泛化为 **roster 驱动**——每委派 role 一条映射；needle 改为**行 id 锚点**（`id: tool-subagent-<id>` 在渲染后文件中唯一）而非 `persona: |-`（10 行 persona 都渲染为该标头后旧 needle 失唯一性，`appendMockRoleMarker` 的 `String.replace` 首个命中会打错行）；缩进按行在 delegation 组内的实际嵌套层（模板注释口径复核）；与 `mock-llm-server.mjs` `detectRole` 的"首个含 MOCKROLE= 的 system message 胜出"顺序相容（marker 须落在该子级**首个** system message 内——persona 标头下第一行，与 explore 现状同款）；settings 种子保持单 baseURL（同一 adapter 的多个 model 路由共用其一），pi-ai 侧 `providers` map 按需加键。
  2. **parade 场景**：沙箱 env 把 10 个 agent 分布到**真实可服务的可区分路由对**（deepseek-official 默认 catalog 4 id + pi-ai `deepseek` 3 id = 7 个真实对，基准表 §3；**不用假 id** 的诚实理由见计划书 §4.7——假 id 在 mock 下机械可行但断言将失去"真实可服务"意义），逐 agent 断言"已解析路由 == env 配置座"；mock 剧本（**每委派 lane 独立 MOCKROLE=<agent>**，剧本以 role 为键——不是按 model 分流）：指挥一条消息内并行发起 10 个委派调用 → 每子级剧本回答 → 指挥总结；断言：10 个子级全部真实运行、session log 中每子级 `{provider, model}` 与配置一致（AC-5 模式推广）、hard-blocks 注入在一个新 agent 子级可见（T16 listener 覆盖面抽查）；Q-4 实测（10 个 continuable 子级的 resident 上限——若受限则分批并记录，fallback 口径见基准表 §1 continuable 决策块）。
- **判定**：✅ 门 3 绿；scenario verdict JSON 含每子级路由断言明细；`appendMockRoleMarker` 对 10 个新 role 各自落点正确（marker 出现在对应行的 persona 标头下，grep 行号比对）。
- **证据**：2026-09-13（deepseek-flash 一轮过）。MOCKROLE 泛化：roster 驱动 Map + 行 id 锚点（恰好一次否则 throw、同行有界扫描防跨行绑定、首内容行插入、行锚幂等 sisyphus vs sisyphus-junior 安全、未知 role loud throw、verifyMockRoleMarkerLanding 不抛）；hermetic --self-test 用真实模板+真实渲染器 11/11 落点 + 变异 QA 复现旧首个命中 bug。mock-llm-server 加 tool_calls 并行批次（单数路径字节不变，6 既有 mock 测试过）。roster-parade：10 agent 分布 7 真实 catalog 对（无假 id，librarian 置 vision 对为机制性分布有注记；sisyphus≠explore；looker 在 vision 座）；单消息 10 并行委派；verdict JSON 含每子级 configured/resolved/observed 座明细（全匹配）+ 11/11 marker 落点行号 + hard-blocks 10 子级可见。Q-4：maxParallelToolCalls=10=批次恰好、无数字 resident 上限、foreground one-shot caveat 记录（resident-continuable 压力留 T22/L4，Kimi MINOR 跟踪）。门 3 绿（5 场景，parade 19/19 断言）；双评审 APPROVE；CI 8/8 绿（门2=419）。
- **依赖**：P2-T17。**量级**：5 小时（MOCKROLE 泛化 +2h 自评审）。

### [x] P2-T19 — e2e：只读负向 + atlas 正向嵌套

- **产出**：`tests/e2e/drive.mjs` 新增 `plan-reviewer-write-denied` 与 `atlas-nested-delegation` 两个 scenario。
- **做法**：① 负向（AC-6a 模式推广）：mock 剧本让 plan-reviewer 子级幻觉 `write` 调用 → 断言该工具对其**物理缺席**（未知工具拒绝）；② 正向：指挥 → atlas（depth 1）→ explore（depth 2）链路跑通——**对照语义注意**：F1 之后既有 explore 嵌套场景断的是"未知工具**物理缺席**"（depth 门不再触发），本正向链对照的是物理缺席语义，**不是** maxDepth 报错文案（不得照搬旧断言，计划书 §4.7）。
- **判定**：✅ 门 3 绿；两个 scenario 的断言明细进 verdict JSON。
- **证据**：2026-09-13/14（deepseek-flash，2 轮）。轮1 发现运行时语义：深度门读被调用行 maxDepth（dsh-tool-subagent:508-519 / dsh-subagent:432-438）——atlas 再委派物理不通；仲裁决定 D-2026-09-13-01：10 委派行 maxDepth 统一 2（链最深 2 层、depth-3 结构性不可能、deny 名单仍主防），计划书/基准表按 DoD-d 由仲裁更正。轮2 落地：roster.ts/模板值+注记、全部 pin 重钉（roster.test.ts/roster.md 再生成/concerto-preset/c10/doctor-lite/probe roster 派生）、prove-explore-maxdepth 重钉（depth-1 通过=atlas→worker 修正路径、depth-2 双路径拒绝 "depth 3 exceeds maxDepth 2"、retired1 非空控制、default3 不变）。plan-reviewer-write-denied PASS（13/13：write/edit+全 10 委派工具物理缺席 roster 派生、unknown tool 逐字、目标未落盘、env 钉独立座位）；atlas-nested-delegation PASS（19/19：指挥→atlas→explore depth-2 链完成、grandchild 真实 explore 座/persona、atlas 广告全 10 工具而只读 grandchild 全缺席、对照物理缺席语义未照搬退役报错文案）。评审 Kimi APPROVE（独立执行 prove 三模式）+ mcode APPROVE（30 分钟限额重试）；CI 8/8 绿（门2=419、e2e 7/7、探针 exit 0）。
- **依赖**：P2-T18。**量级**：3 小时。

### [ ] P2-T20 — 静态门 / doctor-lite / probe 扩展

- **产出**：`scripts/verify-concerto-static.mjs`（c10 泛化）+ `scripts/doctor-lite-core.ts`（subagent 行**逐行契约断言**）+ `scripts/concerto-mode-probe.sh` 与 `scripts/prove-route-logging.mjs`（名册 marker）。
- **做法**：c10 泛化为名册类断言——目标清单按计划书 §5 DoD-c（12 行名单 + 四类 filter/maxDepth 形状 + 无通用/产品行；断言数 ≥ 现状 4 类基线）；c01–c09 **不动**（归档路径冻结）；doctor-lite 现状已对每行跑 Config schema（`validateCompositionRows`）——本任务把它从"逐行 schema 合法"扩展为"**逐行契约断言**"（每行 toolName/filter/maxDepth/哨兵渲染结果符合名册类；0.1.5-rc.1 复核 P1 教训的语义门补白）；probe 断言 10 个 persona marker + 路由汇总 + 三条警告行 + **11 条路由的 provider 均 active**（POST /api/llm.providers——把"可审计"从配置层推到运行时层，退出标准 a 的补强，计划书 §4.7）；proofs 扩展名册路由断言。
- **判定**：✅ 门 4/6/8 绿；c10 断言清单变长（逐条列出对比）。
- **证据**：（待填）
- **依赖**：P2-T16。**量级**：3 小时。

---

## WP-5 收口（计划书 §4.8/§4.9/§5）

### [ ] P2-T21 — 署名与文档

- **产出**：`THIRD_PARTY_NOTICES.md` 新增 "Phase 2 persona semantic ports" 小节 + `README*.md` / `docs/install-concerto*.md` 注记 + **`README*.md` 协奏节"名册路由与 env 覆盖表"** + `CHANGELOG.md` 条目 + 踩坑登记（如有）。
- **做法**：NOTICES 逐文件列出 9 个 persona + `delegation-roster.md`（含既有 4 个 OMO 派生文件补登，计划书 §4.9）；README 的协奏描述更新为 11-agent 名册并写明"名册完整 ≠ `/ulw-*` ≠ Team Mode"（R-8）；**README 协奏节新增"名册路由与 env 覆盖表"**（11 agent × 席位 × `OMO_*` env 对——部署前可查"模型链留在配置"的操作面，ROADMAP 关键约束的落地证据，数据从 roster.ts/基准表 §1 复制并标注单一事实源）；install-concerto 文档注记 installer 仍为 1+1（§4.8）；实施期真实踩坑按 P-xx 模板登记 `docs/mvp-pitfalls*.md`。
- **判定**：✅ 门 7（docs consistency）绿；NOTICES 新小节行数 == 派生文件清单数；既有条目零改动（git diff 核对）。
- **证据**：（待填）
- **依赖**：P2-T17…T20 完成后统一措辞。**量级**：2 小时。

### [ ] P2-T22 — 退出标准核对 + 全门链复跑

- **产出**：本文件的"退出标准核对表"逐条填证据；L4 手工冒烟记录（`.omo/evidence/`，gitignored，结论回填本行）。
- **做法**：① **先提交**：`git add` + commit 全部 Phase 2 产出（含本计划目录——评审实测其初稿长期 untracked，若不复跑于已提交快照上，退出标准 b/c 的证据将没有可复现对应物）；② 按计划书 §5 的 a/b/c/d/e 逐条取证；`scripts/ci-local.sh` 全 8 门复跑；`verify-licenses --json` 的 `checked` 与基线（52）比对；③ L4：真 key 手工 run，指挥真实调用 2–3 个新 agent（含 multimodal-looker 若视觉 key 可用）。
- **判定**：✅ 下方核对表全绿。
- **证据**：（待填）
- **依赖**：P2-T21。**量级**：2 小时。

---

## 退出标准核对表（P2-T22 填写）

| # | 标准（计划书 §5） | 证据 | 结论 |
|---|---|---|---|
| a | 每 agent 可经指挥调用、路由在会话日志可观测 | roster-parade verdict + probe 路由行 + L4 记录 | ⬜ |
| b | 名册快照测试常绿 | roster.md + 9 persona 快照签入、门 2 绿、非空断言 | ⬜ |
| c | 全 8 门绿、门扩展只加严 | ci-local 输出 + c10 断言对比 | ⬜ |
| d | 文档与实测无冲突 | P2-T1 基准表回填记录 + 实施期改文档记录 | ⬜ |
| e | 署名只增不改、`checked` 计数不变（52） | NOTICES diff + `verify-licenses --json` | ⬜ |
