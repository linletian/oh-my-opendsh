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
- **证据**：2026-09-12 复核完成，基准表 §4 六项全闭环：① 上游 permission 逐文件复核（hephaestus/atlas/sisyphus-junior/prometheus/oracle/metis + 辅助函数 + L2 层）——更正 1 处预期（prometheus 实为 hook 限 `.md` 写而非 permission 只读）、3 处"有意收窄"注记（hephaestus 的 task、sisyphus-junior 的 call_omo_agent、metis 的 call_omo_agent 委派权不镜像，理由记录）；证据 `.omo/evidence/p2t1-upstream-permissions.md`。② `*_PROMPT_METADATA` + `AGENT_MODEL_REQUIREMENTS` 全量逐字提取（上桌 6 / 未上桌 2 / 无常量 2）；证据 `.omo/evidence/p2t1-upstream-metadata.md`；T14 数据源就绪。③ Q-1：行号引用复核一致（:332-333/:1257/:1267-1269/:1040）+ 子会话枚举实证（门 3 `explore-write-denied` verdict bonus `childAdvertisedToolNames` 含 `read_image`，基线复跑于 pinned dsh）。④ Q-3 = **allow ∧ ¬deny**，multimodal-looker 无需补 deny 委派名（结论入基准表 §3，`admits()` :2545-2547）。⑤ 视觉座 catalog 直核未漂移（DEFAULT_MODELS :1864 + deepseek.json 3 id）；连字符名 lib 层结构性安全（dsh-tools 无字符集限制 + adapter 逐字转发 :231），boot 断言留 P2-T15。⑥ pi-ai `deepseek.json` = 3 id 未漂移。
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

### [ ] P2-T5 — persona：`hephaestus`

- **产出**：`system-sections/hephaestus-persona.md` + 快照 `tests/omo-agents/__snapshots__/hephaestus-system-prompt.md`（命名约定见 T4-⑥）。
- **做法**：按 T4 配方；上游主源 `agents/hephaestus/`（模型变体文件取通用层，GPT 特定引用按 R-3 注记改写）；保留"目标驱动、自主工作到完成"语义内核。
- **判定**：✅ 快照签入且非空；署名头列出实际上游源文件；对照上游逐节核对三要素无缺失。
- **证据**：（待填）
- **依赖**：P2-T4。**量级**：2 小时。

### [ ] P2-T6 — persona：`oracle`

- **产出**：`system-sections/oracle-persona.md` + 快照。
- **做法**：按 T4 配方；**输出契约完整保留**（verbosity spec / Bottom line / Action plan / Effort 标签 / 三段响应结构——基准表 2.3 注记）；保留 session continuation 追问句。
- **判定**：同 P2-T5。
- **证据**：（待填）
- **依赖**：P2-T4。**量级**：2 小时。

### [ ] P2-T7 — persona：`librarian`

- **产出**：`system-sections/librarian-persona.md` + 快照。
- **做法**：按 T4 配方；工具面引用写 `web_search`/`web_fetch`（composition 继承），context7/MCP 类引用删除（Phase 6）。
- **判定**：同 P2-T5。
- **证据**：（待填）
- **依赖**：P2-T4。**量级**：1.5 小时。

### [ ] P2-T8 — persona：`plan-consultant`（v4 metis）

- **产出**：`system-sections/plan-consultant-persona.md` + 快照。
- **做法**：按 T4 配方；上游主源 `agents/metis.ts`（K2.7 变体不取）；保留 gap 分析框架（隐藏意图/歧义/失败点）；署名头注明改名映射（metis → plan-consultant，ROADMAP 命名锚点）。
- **判定**：同 P2-T5。
- **证据**：（待填）
- **依赖**：P2-T4。**量级**：2 小时。

### [ ] P2-T9 — persona：`plan-reviewer`（v4 momus）

- **产出**：`system-sections/plan-reviewer-persona.md` + 快照。
- **做法**：按 T4 配方；上游主源 `agents/momus.ts`（GPT-5.6 变体不取）；保留 clarity/verification/context 三轴评审框架。
- **判定**：同 P2-T5。
- **证据**：（待填）
- **依赖**：P2-T4。**量级**：2 小时。

### [ ] P2-T10 — persona：`atlas`

- **产出**：`system-sections/atlas-persona.md` + 快照。
- **做法**：按 T4 配方；保留"纯编排、绝不亲手实现（NEVER THE IMPLEMENTER）"内核与独立验证纪律；写明其可再委派 worker（maxDepth 2 的 persona 表达）；`/ulw-execute` 命令面引用改为"由指挥激活"（Phase 4 前不引用未移植命令）。
- **判定**：同 P2-T5。
- **证据**：（待填）
- **依赖**：P2-T4。**量级**：2 小时。

### [ ] P2-T11 — persona：`multimodal-looker`

- **产出**：`system-sections/multimodal-looker-persona.md` + 快照。
- **做法**：按 T4 配方；工具面声明按基准表 §2.8 的评审实测结论写（allow 精确值 `[read, read_image]`；`read_image` 条件注册 caveat 写入 persona 注释或正文注记）；保留"提取信息而非返回原文"的输出纪律。
- **判定**：同 P2-T5。
- **证据**：（待填）
- **依赖**：P2-T4 + P2-T1（复核 §2.8 行号引用）。**量级**：1.5 小时。

### [ ] P2-T12 — persona：`sisyphus-junior`

- **产出**：`system-sections/sisyphus-junior-persona.md` + 快照。
- **做法**：按 T4 配方；上游主源 `sisyphus-junior/default.ts`；保留"无委派权的专注执行器"内核；category 中介语义**不移植**（基准表 2.9 注记）。
- **判定**：同 P2-T5。
- **证据**：（待填）
- **依赖**：P2-T4。**量级**：1.5 小时。

### [ ] P2-T13 — persona：`prometheus`

- **产出**：`system-sections/prometheus-persona.md` + 快照。
- **做法**：按 T4 配方；保留访谈式规划框架（explore-first / CLEAR-UNCLEAR intent 路由）；访谈对象改写为指挥（问题写回报告，不经 `ask_user`——基准表 2.10 注记）。
- **判定**：同 P2-T5。
- **证据**：（待填）
- **依赖**：P2-T4。**量级**：2 小时。

### [ ] P2-T14 — sisyphus 第 5 段：名册委派表

- **产出**：`system-sections/delegation-roster.md` + `SISYPHUS_SECTION_ORDER` 更新 + sisyphus 快照更新。
- **做法**：数据取自 P2-T1 摘出的上游元数据全量值；每 agent 一行：域 / 何时派 / 何时不派 / 成本档（FREE/CHEAP/EXPENSIVE）；署名头标注元数据来源；插入顺序 `delegationDiscipline` 之后；`{{` 检查通过。
- **判定**：✅ sisyphus 快照更新签入（5 段）；表中 10 个委派目标与 roster.ts 的 toolName 集合**逐一对应**（单测断言，防文档与名册漂移）。
- **证据**：（待填）
- **依赖**：P2-T2 + P2-T1（元数据）。**量级**：2 小时。

---

## WP-3 Composition 扩展（计划书 §4.4/§4.5）

### [ ] P2-T15 — 模板 9 个新委派行 + 逐行 deny 哨兵渲染器

- **产出**：`concerto/agent.cordis.yml` 的 delegation 组扩为 12 行 + `concerto-preset.ts` 的名册驱动渲染（`renderAgentSentinels`：persona / agentOptions / 逐行 `__OMO_<ID>_DENY__` 三类哨兵统一从 roster 渲染）。
- **做法**：每行：`id: tool-subagent-<id>`、`provider: spawn`、`toolName: <id>`、`backgroundMode: continuable`、`persona: __OMO_<ID>_PERSONA__`、`agentOptions: __OMO_<ID>_AGENT_OPTIONS__`、toolFilter 按类（只读 6 行 / worker 2 行写 `deny: __OMO_<ID>_DENY__` 逐行唯一哨兵；atlas 无 filter 键；multimodal-looker 静态 `allow`，基准表 §1）、maxDepth 按类；渲染器从 roster.ts 按类计算委派名集合渲染各 deny 哨兵（JSON-quote 名字）；`replaceSentinelOnce` 恰好一次护栏原样适用（sentinel 名带行 id）；哨兵位合计 11 persona + 10 agentOptions + 8 deny = **29 个**；台账注释（KEEP/DROP/DEV 体例）补记本次扩展。
- **判定**：✅ 渲染后 composition：哨兵零残留（grep `__OMO_` 无命中）；每行 filter/maxDepth 与基准表一致；`loadYamlDialect` 解析通过；explore 行形状除 deny 哨兵外无回归；**两次冷启动 / 12 行并存**时无 "prompt section already registered" 类报错（每个实例注册 `tool:<toolName>` 段——toolName 唯一则段名结构性不撞，此处取冷启动日志实证兜底，基准表 §3）。
- **证据**：（待填）
- **依赖**：P2-T2 + P2-T5…T13（persona 文件齐备，渲染才有内容）。**量级**：4 小时。

### [ ] P2-T16 — apply 接线与 boot marker

- **产出**：`index.ts` 名册化 boot marker（子级 10 行 `persona assembled` + 路由汇总行 + **三条**非阻断警告行——全员同值 / 委派同座（T3）/ **route provider not registered**（本条，M-2））；`syncConcertoPreset` 签名/默认值名册化；`concerto-preset.test.ts` 更新。
- **做法**：保持 loud-but-non-fatal 纪律（每 agent 独立 try/catch，一个 persona 坏不拖垮其余）；marker 文案保持 probe 可断言的稳定格式。**provider 注册检查**：apply() 时经 `ctx.inject` 读 llm 服务的 provider 列表（确切服务名/方法以实施时源码核实为准——probe 的 POST /api/llm.providers 是外部等价物），11 条路由中 provider 未注册者打一**非阻断**警告行（注册是 keyless 且可热加载，故只警告不阻断——与 T3 两条警告同纪律）；没有该检查，缺 pi-ai 段的部署会让快座子级到被委派时才 `model-unavailable`（会话级失败而非 boot 可见）。
- **判定**：✅ 单测绿；probe 沙箱冷启动日志含 10 个 persona assembled 行 + 路由汇总行（11 条）+ 三条警告行的 fire/不 fire 与种子一致。**口径注**（与 §3 的 29 哨兵位并读）：**11** = persona 哨兵位（含指挥——指挥 marker 走既有 `omo-sisyphus system prompt assembled`，index.ts:124）；**10** = 子级 `persona assembled` 行。
- **证据**：（待填）
- **依赖**：P2-T15。**量级**：2 小时。

---

## WP-4 门与 e2e（计划书 §4.7）

### [ ] P2-T17 — 名册快照测试 + roster 一致性单测

- **产出**：`tests/omo-agents/roster.test.ts`（或并入既有 suite）+ 签入快照 `tests/omo-agents/__snapshots__/roster.md`。
- **做法**：① 渲染后 composition ↔ roster.ts 一致性：每 roster 委派条目恰好一行、toolName 相等、deny/allow 与类匹配、maxDepth 正确、路由 == resolveModelRoutes() 对应座；② 名册结构快照（roster.md：每 agent 的 id/类/路由/filter/maxDepth 清单，结构化、人读可评审）；③ Q-3 行为钉住（allow+deny 同给时渲染结果与断言）；④ 快照非空断言（R-5 假绿教训）。
- **判定**：✅ 门 2 绿且 roster.md 签入；故意改一个 roster 条目 → 测试红（反向证明）。
- **证据**：（待填）
- **依赖**：P2-T16。**量级**：3 小时。

### [ ] P2-T18 — e2e：MOCKROLE 泛化 + roster-parade 场景

- **产出**：`tests/e2e/drive.mjs` 的 MOCKROLE 机制泛化 + 新增 `roster-parade` scenario。
- **做法**：
  1. **MOCKROLE 泛化（前置子任务，评审实测驱动）**：`MOCKROLE_BLOCK_SCALARS` 从硬编码 2 条泛化为 **roster 驱动**——每委派 role 一条映射；needle 改为**行 id 锚点**（`id: tool-subagent-<id>` 在渲染后文件中唯一）而非 `persona: |-`（10 行 persona 都渲染为该标头后旧 needle 失唯一性，`appendMockRoleMarker` 的 `String.replace` 首个命中会打错行）；缩进按行在 delegation 组内的实际嵌套层（模板注释口径复核）；与 `mock-llm-server.mjs` `detectRole` 的"首个含 MOCKROLE= 的 system message 胜出"顺序相容（marker 须落在该子级**首个** system message 内——persona 标头下第一行，与 explore 现状同款）；settings 种子保持单 baseURL（同一 adapter 的多个 model 路由共用其一），pi-ai 侧 `providers` map 按需加键。
  2. **parade 场景**：沙箱 env 把 10 个 agent 分布到**真实可服务的可区分路由对**（deepseek-official 默认 catalog 4 id + pi-ai `deepseek` 3 id = 7 个真实对，基准表 §3；**不用假 id** 的诚实理由见计划书 §4.7——假 id 在 mock 下机械可行但断言将失去"真实可服务"意义），逐 agent 断言"已解析路由 == env 配置座"；mock 剧本（**每委派 lane 独立 MOCKROLE=<agent>**，剧本以 role 为键——不是按 model 分流）：指挥一条消息内并行发起 10 个委派调用 → 每子级剧本回答 → 指挥总结；断言：10 个子级全部真实运行、session log 中每子级 `{provider, model}` 与配置一致（AC-5 模式推广）、hard-blocks 注入在一个新 agent 子级可见（T16 listener 覆盖面抽查）；Q-4 实测（10 个 continuable 子级的 resident 上限——若受限则分批并记录，fallback 口径见基准表 §1 continuable 决策块）。
- **判定**：✅ 门 3 绿；scenario verdict JSON 含每子级路由断言明细；`appendMockRoleMarker` 对 10 个新 role 各自落点正确（marker 出现在对应行的 persona 标头下，grep 行号比对）。
- **证据**：（待填）
- **依赖**：P2-T17。**量级**：5 小时（MOCKROLE 泛化 +2h 自评审）。

### [ ] P2-T19 — e2e：只读负向 + atlas 正向嵌套

- **产出**：`tests/e2e/drive.mjs` 新增 `plan-reviewer-write-denied` 与 `atlas-nested-delegation` 两个 scenario。
- **做法**：① 负向（AC-6a 模式推广）：mock 剧本让 plan-reviewer 子级幻觉 `write` 调用 → 断言该工具对其**物理缺席**（未知工具拒绝）；② 正向：指挥 → atlas（depth 1）→ explore（depth 2）链路跑通——**对照语义注意**：F1 之后既有 explore 嵌套场景断的是"未知工具**物理缺席**"（depth 门不再触发），本正向链对照的是物理缺席语义，**不是** maxDepth 报错文案（不得照搬旧断言，计划书 §4.7）。
- **判定**：✅ 门 3 绿；两个 scenario 的断言明细进 verdict JSON。
- **证据**：（待填）
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
