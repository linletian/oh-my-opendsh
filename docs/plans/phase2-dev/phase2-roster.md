# Phase 2 名册基准表

> **上游依据**：[开发计划书](./phase2-plan.md) §4 · [ROADMAP Phase 2](../../roadmap_zh-CN.md) · [agent 团队调查报告](../../omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md) §1
>
> **用法**：这是 11 个 agent 的**数据骨干**——每 agent 的上游事实（v4.19.4 源文件、限制表、元数据、模型链）与 DSH 绑定形状（toolName、persona 文件、路由默认、toolFilter、maxDepth）。WP-2/WP-3 实施时逐行消费。
>
> **核实状态**：标 ✅ 的单元格已在 v4.19.4 tag（commit `b072d279…`）或 installed dsh 上直接核实；标 🔍 的是 grep 初核/转引，**以 P2-T1 逐文件复核为准**（不符处按 DoD-d 改本文，不改结论）。

---

## 1. 总表

| # | Agent（DSH toolName） | v4 名 | 类 | 写权限 | 委派权 | maxDepth | 默认路由（席位） | env 覆盖对 |
|---|---|---|---|---|---|---|---|---|
| 1 | `sisyphus`（指挥，主会话 persona） | 同 | — | ✅ | — | — | `deepseek-official` / `deepseek-v4-pro`（强座，既有） | `OMO_SISYPHUS_PROVIDER/MODEL`（既有） |
| 2 | `explore`（既有） | 同 | 只读 | ❌ | ❌ | 1 | `deepseek` / `deepseek-v4-flash`（快座，既有） | `OMO_EXPLORE_PROVIDER/MODEL`（既有） |
| 3 | `hephaestus` | 同 | worker | ✅ | ❌ | 1 | `deepseek-official` / `deepseek-v4-pro`（强座） | `OMO_HEPHAESTUS_PROVIDER/MODEL` |
| 4 | `oracle` | 同 | 只读 | ❌ | ❌ | 1 | `deepseek-official` / `deepseek-v4-pro`（强座） | `OMO_ORACLE_PROVIDER/MODEL` |
| 5 | `librarian` | 同 | 只读 | ❌ | ❌ | 1 | `deepseek` / `deepseek-v4-flash`（快座） | `OMO_LIBRARIAN_PROVIDER/MODEL` |
| 6 | `plan-consultant` | metis | 只读 | ❌ | ❌ | 1 | `deepseek-official` / `deepseek-v4-pro`（强座） | `OMO_PLAN_CONSULTANT_PROVIDER/MODEL` |
| 7 | `plan-reviewer` | momus | 只读 | ❌ | ❌ | 1 | `deepseek-official` / `deepseek-v4-pro`（强座） | `OMO_PLAN_REVIEWER_PROVIDER/MODEL` |
| 8 | `atlas` | 同 | orchestrator | ✅ | ✅ | **2** | `deepseek-official` / `deepseek-v4-pro`（强座） | `OMO_ATLAS_PROVIDER/MODEL` |
| 9 | `multimodal-looker` | 同 | allowlist | ❌（仅 `read` + `read_image`） | ❌ | 1 | `deepseek-official` / `deepseek-v4-flash-vision-exp`（视觉座） | `OMO_MULTIMODAL_LOOKER_PROVIDER/MODEL` |
| 10 | `sisyphus-junior` | 同 | worker | ✅ | ❌ | 1 | `deepseek` / `deepseek-v4-flash`（快座） | `OMO_SISYPHUS_JUNIOR_PROVIDER/MODEL` |
| 11 | `prometheus` | 同 | 只读 | ❌ | ❌ | 1 | `deepseek-official` / `deepseek-v4-pro`（强座） | `OMO_PROMETHEUS_PROVIDER/MODEL` |

**全部委派行共有配置**：`provider: spawn` · `backgroundMode: continuable` · persona 哨兵 + agentOptions 哨兵（apply 时渲染）。

> **为何全员 `continuable` 而非 per-class `one-shot`**（决策记录，评审意见沉淀）：① OMO v5 把 `run_in_background=true` 定为 "the standard spawn"；② oracle 上游 prompt 明确支持 session continuation 追问，one-shot 会砍掉该能力；③ 全员统一省去 per-class 心智分叉。**代价明示**：librarian / multimodal-looker / plan-reviewer 类无状态任务常驻槽位——压力记入 Q-4，实测咬人时 per-class `one-shot`（改 YAML 单字段）是现成 fallback，届时按 DoD-d 回填本表。

**deny 列表与逐行哨兵**（计划书 §4.4）：每个只读/worker 行写 `deny: __OMO_<ID>_DENY__`（sentinel 名带行 id，恰好一次护栏适用），渲染器按类替换为 flow sequence——
- 只读类（explore / oracle / librarian / plan-consultant / plan-reviewer / prometheus，**6 行**）→ `[write, edit, explore, librarian, oracle, plan-consultant, plan-reviewer, hephaestus, sisyphus-junior, atlas, multimodal-looker, prometheus]`（write/edit + 全部 10 个委派 toolName，由 roster.ts 计算，名字 JSON-quote）
- worker 类（hephaestus / sisyphus-junior，**2 行**）→ 同上但**不含** write/edit
- atlas（orchestrator）**无 toolFilter 键**；multimodal-looker 静态 `allow: [read, read_image]`（评审实测闭环，§2.8；`read_image` 条件注册的漂移风险见 §3 与计划书 R-9；Q-3 决定是否需补 deny 委派名）

## 2. 逐 agent 事实卡

> "OMO 限制"列是 v4.19.4 的 permission 语义（opencode 工具名空间）；"镜像映射"列是它在 DSH 工具名空间下的对应。opencode 的 `apply_patch` 在 DSH 不存在（拒绝泛化为 write/edit）；`task`/`call_omo_agent` 对应"全部委派工具名缺席"。

### 2.1 `explore`（既有，基准行）

- **上游源**：`packages/omo-opencode/src/agents/explore.ts` ✅
- **OMO 限制**：deny `[write, edit, apply_patch, task, call_omo_agent]` ✅
- **现状**：已交付（persona 46 行 + deny `[write, edit, explore]` + maxDepth 1）。Phase 2 唯一改动：deny 列表从自名单点扩展为按类渲染的 `__OMO_EXPLORE_DENY__` 哨兵（F1 加固的推广，见 §1「deny 列表与逐行哨兵」块）。

### 2.2 `hephaestus`

- **上游源**：`packages/omo-opencode/src/agents/hephaestus/{agent,index,gpt,gpt-5-4,gpt-5-5,gpt-5-6}.ts` + `builtin-agents/hephaestus-agent.ts` ✅（文件集）
- **角色**：GPT 原生自主 deep worker——"give it a goal, not a recipe"；目标驱动、工作到完成
- **OMO 限制**：🔍 子目录动态 config，P2-T1 复核完整 permission 构造（预期无写禁——它是实现主力；委派权限待核）
- **OMO 链首**（`AGENT_MODEL_REQUIREMENTS`）：仅 `gpt-5.6-sol medium`，`requiresProvider: openai/copilot/opencode`（v5 加 `openai-codex`）✅（转引自调查报告 §1.1）
- **镜像映射**：worker 类（deny 全部委派名，不 deny write/edit）；maxDepth 1
- **适配注记**：① prompt 是 GPT 调优文本，DeepSeek 座上的保真度风险记入 R-3——移植保留"目标驱动/自主完成"语义内核，删 GPT 特定引用；② OMO 的 requiresProvider 门不移植（R1：DeepSeek 系优先，配置层 env 可改路由）。

### 2.3 `oracle`

- **上游源**：`packages/omo-opencode/src/agents/oracle.ts`（`ORACLE_PROMPT_METADATA` + `ORACLE_DEFAULT_PROMPT` 等）✅
- **角色**：只读高智商架构/调试顾问（advisor，cost EXPENSIVE）；结构化输出（Bottom line ≤3 句 / Action plan ≤7 步 / Effort 标签）
- **OMO 限制**：deny 写类 + 委派类 🔍（文件已核实引入 `createAgentToolRestrictions`，完整列表 P2-T1 核）
- **OMO 链首**：gpt-5.6-sol xhigh → gemini-3.1-pro high → claude-opus-5 max → glm-5.2 ✅（转引）
- **镜像映射**：只读类；maxDepth 1
- **适配注记**：输出契约（verbosity spec / 三段响应结构）是其核心价值，浓缩时**完整保留**；"follow-up questions via session continuation"一句保留（continuable 对应）。

### 2.4 `librarian`

- **上游源**：`packages/omo-opencode/src/agents/librarian.ts`（`LIBRARIAN_PROMPT_METADATA`）✅
- **角色**：文档与 OSS 代码搜索（exploration，cost CHEAP；keyTrigger："External library/source mentioned → fire librarian background"）
- **OMO 限制**：deny `[write, edit, apply_patch, task, call_omo_agent]` ✅
- **OMO 链首**：gpt-5.6-luna-fast low → deepseek-v4-flash → qwen3.7-plus → … ✅（转引；链上本有 deepseek-v4-flash，快座默认与上游同向）
- **镜像映射**：只读类；maxDepth 1。子会话经 composition 继承 `web_search`/`web_fetch`（tool-web 行在 concerto preset 中），满足其"文档搜索"工具需求
- **适配注记**：OMO 的 context7 MCP 属 Phase 6（MCP），本阶段 persona 引用 web 工具即可。

### 2.5 `plan-consultant`（v4 名 metis）

- **上游源**：`packages/omo-opencode/src/agents/metis.ts`（`metisPromptMetadata` + `METIS_SYSTEM_PROMPT` / `METIS_K2_7_SYSTEM_PROMPT`）✅
- **角色**：计划前 gap 分析——抓隐藏意图、歧义、AI 失败点（advisor；命名取自希腊智慧女神）
- **OMO 限制**：deny `[write, edit, apply_patch]` 🔍（grep 初核 3 项；是否另禁委派，P2-T1 核）
- **OMO 链首**：claude-opus-5 high → kimi-k3 low ✅（转引）
- **镜像映射**：只读类；maxDepth 1
- **适配注记**：① v5 改名 `plan-consultant`（ROADMAP 命名锚点；上游映射 `packages/utils/src/migration/agent-names.ts`）；② K2.7 变体 prompt 不移植（模型特定分支，DSH 侧无对应路由语义）；③ OMO 中它是 plan-gated（/ulw-plan 激活）——门控流属 Phase 4，本阶段它是普通可调用只读顾问。

### 2.6 `plan-reviewer`（v4 名 momus）

- **上游源**：`packages/omo-opencode/src/agents/momus.ts` + `momus-gpt-5-6.ts`（`momusPromptMetadata`）✅
- **角色**：计划评审（clarity/verification/context 三轴；找出一切毛病——希腊嘲弄之神）
- **OMO 限制**：deny `[write, edit, apply_patch]` ✅
- **OMO 链首**（v4）：gpt-5.6-terra high → gpt-5.6-sol xhigh → …（v5 改 gpt-6-astra，不取）✅（转引）
- **镜像映射**：只读类；maxDepth 1
- **适配注记**：同 plan-consultant 的 ②③；ROADMAP 点名"plan-reviewer 只读"作工具限制镜像的示例——e2e 负向场景（write-denied）用它（计划书 §4.7）。

### 2.7 `atlas`

- **上游源**：`packages/omo-opencode/src/agents/atlas/{agent,prompt-section-builder,index}.ts`（`atlasPromptMetadata`）✅（文件集）
- **角色**：todo 执行编排——`/start-work`（v5 `/ulw-execute`）激活，分发子代理、独立验证；"YOU ARE AN ORCHESTRATOR — NEVER THE IMPLEMENTER"
- **OMO 限制**：🔍 子目录动态 config（需 OrchestratorContext），P2-T1 复核
- **OMO 链首**：claude-sonnet-5 → kimi-k3 → gpt-5.6-sol medium → minimax-m3 → … ✅（转引）
- **镜像映射**：**orchestrator 类——唯一保留委派工具的子 agent**，maxDepth 2（指挥 0 → atlas 1 → worker 2）；不 deny write/edit（它更新 todo/状态）
- **适配注记**：① `/ulw-execute` 命令面属 Phase 4——本阶段 atlas 是"可被指挥调用、且能再委派 worker 的执行编排者"，e2e 正向链证明 depth-2 合法；② 其 persona 保留"纯编排、绝不亲手实现"内核。

### 2.8 `multimodal-looker`

- **上游源**：`packages/omo-opencode/src/agents/multimodal-looker.ts`（`MULTIMODAL_LOOKER_PROMPT_METADATA`）✅
- **角色**：视觉/媒体文件分析（utility，cost CHEAP；PDF/图片/图表的信息提取与描述）
- **OMO 限制**：**allowlist `[read]`** ✅（`createAgentToolAllowlist`）
- **OMO 链首**：gpt-5.6-sol low → kimi-k3 → glm-4.6v → gpt-5-nano ✅（转引）
- **镜像映射**：`toolFilter.allow: [read, read_image]`（**评审实测闭环，2026-09-11**：OMO 的单 `read` 在 DSH 拆成 `read`（纯文本，`dsh-tool-fs/lib/index.js`:332）+ `read_image`（独立工具，`ctx.inject(["attachments"])` 条件注册，1256/1267 行；attachments 在 host 层 `dsh-base/cordis.patch.yml`:118，子会话继承）。`admits()` 的 allow 是白名单过滤继承面（`dsh-tools/lib/index.js`:2545-2546）——只写 `[read]` 会挡掉 `read_image`、关闭视觉入口；`restrict()` 对未注册名 throw（2801-2803），故条件注册名写入名单的漂移风险入计划书 R-9）；maxDepth 1
- **适配注记**：① 视觉座默认 `deepseek-official / deepseek-v4-flash-vision-exp`——该 id **同在两个 catalog**（dsh-llm-deepseek DEFAULT_MODELS:1864 ✅ + pi-ai builtin `deepseek` 路由，deepseek.json 实测 3 id ✅）；默认提供方选 `deepseek-official`（base composition 已注册、无 settings 依赖），回退同理优先已注册侧（R-4 修正，计划书 §6）；② 真实视觉验证属 L4 手工，e2e 用 mock 文本回。

### 2.9 `sisyphus-junior`

- **上游源**：`packages/omo-opencode/src/agents/sisyphus-junior/{agent,default,index,...}.ts`（多模型变体文件）✅（文件集）
- **角色**：无委派权的专注执行器；v4 兼 category 路由中介
- **OMO 限制**：🔍 P2-T1 复核（预期禁委派、保留写）
- **OMO 链首**：同 atlas 链 + big-pickle 兜底 ✅（转引）
- **镜像映射**：worker 类；maxDepth 1
- **适配注记**：① "category 路由中介"功能**不移植**（v5 senpi 已去中介、category 直连 worker；category 体系属 Phase 5 邻域，计划书 §4.1）；② 多模型变体文件取 `default.ts` 为移植主源，其余变体不取（模型特定分支）。

### 2.10 `prometheus`

- **上游源**：`packages/omo-opencode/src/agents/prometheus/{index,system-prompt}.ts` + `plugin-handlers/prometheus-agent-config-builder.ts`（注册路径）✅（文件集）
- **角色**：访谈式战略规划（v4 Tab 主 agent；`/ulw-plan` 人格；explore-first 规划顾问，CLEAR/UNCLEAR intent 路由）
- **OMO 限制**：🔍 P2-T1 复核（预期只读——它产出计划不实现）
- **OMO 链首**（v4）：claude-fable-5 xhigh → kimi-k3 max ✅（转引）
- **镜像映射**：只读类；maxDepth 1
- **适配注记**：① OMO 中它**访谈用户**；作为委派目标移植时访谈对象改为**指挥**——把问题与分支写回报告（适配语句入 persona），不经 `ask_user`；② `/ulw-plan` 完整流（含 plan-reviewer 评审环）属 Phase 4。

### 2.11 `sisyphus`（指挥，既有）

- **上游源**：`packages/omo-opencode/src/agents/{sisyphus.ts,sisyphus-*.ts}` + `agents/types.ts`（`AgentPromptMetadata` 体系）✅（文件集）
- **Phase 2 改动**：persona 增第 5 段 `delegation-roster.md`（名册委派表：每 agent 的域/何时派/何时不派/成本档——内容源自上游各 `*_PROMPT_METADATA` 的 useWhen/avoidWhen/triggers/cost/keyTrigger ✅ 转引，逐值 P2-T14 核对）；`SISYPHUS_SECTION_ORDER` 与快照同步。

## 3. DSH 机制事实（installed dsh 已核实 ✅）

**`dsh-tool-subagent`（`lib/index.js`）**：

| 事实 | 证据 |
|---|---|
| `toolFilter` 支持 `allow` 与 `deny` 两键（字符串数组） | Config schema，第 265–268 行 |
| `toolFilter` 配置存在但两键皆空 → throw（"remove the key or fill the filter"） | 第 370 行 |
| `maxDepth` 扁平字段，`z.natural()` 或 `'provider-managed'`，默认 3 | 第 269 行 |
| provider 无 `depthLimit` capability 时给数值 maxDepth → throw | 第 377 行（spawn provider 具备该 capability——MVP P-5 已验证 maxDepth 1 生效） |
| `toolName` 自由字符串，默认 `"subagent"` | 第 254 行 |
| 工具未注册时静默等待 provider 出现（不阻断 boot） | 第 575 行 |
| 每个实例注册 `tool:<toolName>` prompt 段（toolName 唯一 → 段名不撞属结构性安全；P2-T15 冷启动断言兜底） | 第 577 行附近 |

**工具名空间与 restrict 语义（评审实测 2026-09-11，H-1）**：

| 事实 | 证据 |
|---|---|
| `read` 只读 UTF-8 文本（"Read a UTF-8 text file"），**不含**图片 | `dsh-tool-fs/lib/index.js`:332 |
| `read_image` 是**独立**工具，`ctx.inject(["attachments"], …)` 内**条件注册**（"exists only while a durable store is mounted"） | 同文件 1256 注释 / 1267-1269 注册点；`applyReadImageTool` ~1040 |
| `attachments` 服务在 host 层 → concerto 子会话继承 → `read_image` 存在 | `dsh-base/cordis.patch.yml`:118 `attachment-local` |
| `admits()`：allow 白名单过滤继承面（不在 allow 集合即不可见）；`allow: [read]` 会挡掉 `read_image` | `dsh-tools/lib/index.js`:2545-2546 |
| `restrict()` 对**未注册名** throw（"names unknown global tool"）——filter 名单必须与 composition 已注册名一致 | 同文件 2801-2803 |

**LLM catalog 与 `model-unavailable`（评审实测 2026-09-11，H-4/H-5）**：

| 事实 | 证据 |
|---|---|
| `dsh-llm-deepseek` DEFAULT_MODELS = 4 个 id（`deepseek-flash` / `deepseek-v4-flash` / `deepseek-v4-pro` / `deepseek-v4-flash-vision-exp`，后者 `inputModalities: ["text","image"]`） | lib/index.js:1841 起；vision 条目 :1864 附近 |
| 该 catalog 可被 adapter config `models:` 覆盖（schema 默认 DEFAULT_MODELS）——e2e 不依赖此覆盖，仅记录 | 同文件 :1896、:1917 |
| deepseek adapter **请求期无 model 校验**（grep `unknown model` 等零命中）——mock baseURL 下任意 id 机械可行 | 同文件全量 grep |
| `session/model-unavailable` 只由 session-controller 抛出（选模型/无 adapter 服务路径） | `dsh-api-session-controller/lib/index.js`:628、:743 |
| pi-ai builtin `deepseek` 路由 catalog = 3 个 id（`deepseek-v4-pro` / `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp`） | `@earendil-works/pi-ai` dist/providers/data/deepseek.json（openai-completions 下） |
| `deepseek-official` adapter 由 base composition 在每个 shipped profile 注册（无 settings 依赖）；pi-ai `deepseek` 路由需 settings 段 | `src/model-routes.ts` 头注释（MVP 实证） |

## 4. 待 P2-T1 复核清单（🔍 汇总）

**A. 输入核实**（决定回退与默认值的前置事实，T1 开工即查）：

1. hephaestus / atlas / sisyphus-junior / prometheus 在 v4.19.4 的完整 permission 构造（含动态 config 分支）。
2. oracle / plan-consultant（metis）的 deny 完整列表（是否含委派类工具名）。
3. 上游各 `*_PROMPT_METADATA` 全量值（委派表数据源）。
4. `deepseek-v4-flash-vision-exp` 在 pinned dsh（0.1.5-rc.1）catalog 可用（默认 catalog 已实测含该 id——§3；此处复核 pinned 版本一致性）；`plan-consultant` 连字符工具名在 boot 注册成功（R-1）。

**B. 实施中回答**（开放问题，产出写入本表 §3 或对应任务）：

5. Q-3：`toolFilter.allow` 与 `deny` 同给的行为（multimodal-looker 是否需显式 deny 委派名作深度防御）——T1 读 installed lib + P2-T17 单测钉住。
6. ~~Q-1：读媒体工具名集合~~ ✅ **评审实测闭环（2026-09-11）**：`read` 纯文本 + `read_image` 独立条件注册 → allowlist = `[read, read_image]`（§2.8/§3）。T1 仅复核行号引用。
