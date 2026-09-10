# MVP PRD：协奏骨架（Concerto Skeleton）

> 中文翻译；主文档（英文）见 [MVP PRD (English)](./mvp-prd.md)。
>
> 本文档定义 oh-my-opendsh 的**最小可行产品（MVP）**范围。调研依据见 [可行性报告](./feasibility-report_zh-CN.md)；项目决策见 [决策记录](./decisions_zh-CN.md)。本 PRD 已于 2026-08-19 获采纳并登记为决策文档 **D11**（开放维度 O8「能力面：MVP vs. follow-up 拆分」随之关闭）。

---

## 1. 文档定位

**本文档是什么**
- MVP 的**产品需求文档（PRD）**：定义最小骨架的范围、验收标准、测试策略与踩坑计划
- 对开放维度 O8（调研报告 §10.8）的**具体提案**：从 §8 的 12 项能力面中划出 MVP 子集

**本文档不是什么**
- 不是实施计划 / 排期承诺（§11 的工作量数字是 spike 估算，不是 commit）
- 不是完整移植的范围定义（完整移植见调研报告 §2.10，~16 周）
- 不解决任何真实工程问题——MVP 的唯一目的是**验证可行性、提前踩坑**

### 1.1 与调研报告 §8 十二项能力面的对应（O8 提案）

调研报告 §10.8 指出：§8 的 12 项能力如何拆分 MVP / follow-up 是开放决策，决策权在用户。本 PRD 即该拆分的提案：

| §8 能力面 | 本 MVP | 说明 |
|---|---|---|
| #1 冷启动 | ✅ 纳入 | AC-1 |
| #2 Agent presets | ✅ 纳入（1+1，非 11 个） | FR-3 / FR-4 |
| #3 Hook listeners | ✅ 纳入（恰好 1 个，非 30+） | FR-6 |
| #4 Slash 命令 | ❌ follow-up | |
| #5 MCP servers | ❌ follow-up | |
| #6 Team Mode | ❌ follow-up | |
| #7 Hashline edit | ❌ follow-up | |
| #8 端到端冒烟 | ✅ 纳入（mock e2e + dummy 场景的最小形态） | AC-4 / AC-7 |
| #9 Bump 脚本 | ❌ follow-up | MVP 默认无 OMO import，无可 bump；随紧随 MVP 之后的 import 验证 follow-up（Q-2 已决 → D11）一并引入 |
| #10 License hygiene | ✅ 纳入 | FR-1 / AC-8 |
| #11 文档 | ✅ 部分纳入（ pitfalls 记录 + 本 PRD；8 篇完整文档为 follow-up） | AC-9 |
| #12 CI | ✅ 纳入（最小 green 集） | 本文 §8 |

与 §10.8 研究阶段草稿的两处有意差异：① #9 从"must"移出（无 import 则无可 bump）；② #8 的最小形态从"follow-up"提前纳入（验证本就是本 MVP 的目的）。

---

## 2. 背景与目标

调研报告（Summary 结论 1）判断本项目"可行性：高"，但其中若干关键假设**从未经过运行时验证**——调研证据全部来自读源码与 test fixture（§12.7、§13.10、§14.10 均自述此局限）。MVP 的使命是在投入 16 周之前，用最便宜的骨架把这些假设钉死。

### 2.1 三个目标（优先级等同）

| # | 目标 | 说明 |
|---|---|---|
| G1 | **验证核心可行性假设** | 见 §3 的 V1–V4。任一假设证伪，16 周估算与架构方向需重审 |
| G2 | **提前踩坑** | 主动撞击 DSH 的不稳定面，把坑记录在 `docs/mvp-pitfalls.md`（这是**正式交付物**，不是副产品）。首发于 0.1.0-rc.5，继 0.1.2-alpha.1 之后又在 0.1.5-rc.1 上重跑——坑表记录的是整条**演进线**，不是某一个 rc |
| G3 | **确立可持续的工程骨架** | 仓库结构、license hygiene、测试金字塔底座（mock-LLM e2e + doctor-lite）一次搭对，后续 16 周在此之上生长 |

### 2.2 明确的非目标

- ❌ 解决真实工程问题（演示场景是编排好的 dummy 任务）
- ❌ 移植其余 10 个 agent / Team Mode / MCP / hashline / slash command
- ❌ 性能调优、生产可用性、Windows 支持（决策文档 D9）
- ❌ 对 DSH 或 OMO 上游提任何 PR（决策文档 D5）

---

## 3. 待验证的核心假设（MVP 的"考题"）

| # | 假设 | 调研依据 | 若证伪 |
|---|---|---|---|
| V1 | **scratch plugin 路径可用**：`dsh --patch ./cordis.yml` 能零修改 DSH 地加载我们的 plugin 并冷启动到 idle | Summary 结论 2；§4.3 | 整个物理形态（D1/D2）重审 |
| V2 | **per-subagent LLM 路由可用**：两个 agent 以不同 `{provider, model}` 运行且可从 session log 观测 | §12（§12.7 自述"未实际跑过 runtime 测试，建议 MVP sign-off 前冒烟"） | OMO"合适的模型做合适的事"核心价值在 DSH 上需新增基础设施，工作量重估 |
| V3 | **listener 翻译层模式可用**：一个 DSH 事件 listener 能完成"拦截/注入"语义（未来 85% 的 hook 移植依赖此模式） | §2.2；§13.8 | hook 移植成本模型（"1 小时 rebase"，R4）失效，需新方案 |
| V4 | **subagent 限制链可用**：toolFilter（只读）+ depth cap（禁嵌套委派）按预期生效 | §13.5.1 / §13.6.1；§12.5 | 多 agent 安全边界需自建，Team Mode 移植（3 周）成本上调 |

---

## 4. 运行模式设计：协奏模式（Concerto Mode）

### 4.1 定位

DSH 官方现有 4 个运行模式：**标准 / PTC / 极简 / 创造**。四者（从命名与官方定位看）都是"**单 agent 直答**"姿态的变体——差异在能力集与采样风格，而不在"谁来干活"。

**协奏模式**是第 5 个模式，也是首个"**编排优先**"姿态的模式：

> 主 agent 不是干活的，是指挥。接到任务先判断"谁最适合做"，默认委派给携带独立模型路由的 subagent；合适的模型做合适的事——不是运气，是默认。

这正是项目初衷（README"项目初衷"节："不押注单一模型"）在运行模式上的直接表达。

### 4.2 与官方 4 模式的对比

| 模式 | 姿态 | 主 agent | 模型路由 | 委派 |
|---|---|---|---|---|
| 标准 | 单 agent 全能直答 | 默认 agent | 单一路由 | 不默认 |
| PTC | 单 agent 流程化直答 | 默认 agent | 单一路由 | 不默认 |
| 极简 | 单 agent 裸能力直答 | 裁剪 agent | 单一路由 | 无 |
| 创造 | 单 agent 高发散直答 | 默认 agent（采样调高） | 单一路由 | 不默认 |
| **协奏（本 MVP）** | **编排优先** | **omo-sisyphus（指挥）** | **每 agent 独立 `{provider, model}`** | **默认委派给 omo-explore** |

注：官方 4 模式的精确内部语义以 DSH 固定线为准（最初按 v0.1.0-rc.5 阅读；0.1.5-rc.1 复核，官方集合为 标准 / PTC / 极简 / 创造——`ptc` 已取代 rc 时代的 `code`）。本表只承诺"协奏与它们的差异点"，不承诺对 4 模式内部行为的描述精确。实施时核实并修订本表（属踩坑项 P-1 的关联工作）。

### 4.3 命名

- **中文**：协奏模式；**英文**：Concerto Mode；**模式标识（proposal）**：`concerto`
- 寓意：协奏曲 = 独奏者（主 agent）+ 乐团（subagent 群）。MVP 的 1+1 是最小编制，概念可无损扩展到完整 11-agent 乐团
- 备选（未采纳，记录备查）：`Sisyphus 模式`（致敬 OMO 但语义不自明）、`编排模式`（准确但平淡）、`团队模式`（与 OMO Team Mode 这一具体后续特性撞名）

### 4.4 模式激活与技术构成

**激活方式（需求，非实现细节）**：用户能以"与官方 4 模式同等的入口"选择协奏模式（命令行标志 / 交互选择器，以 DSH 实际开放的模式注册机制为准）。

> ⚠️ **这是 MVP 第一个要撞的坑（P-1）**：DSH 是否允许 scratch plugin 注册新运行模式，调研未覆盖（0.1.0-rc.5 首次阅读时悬置；已在固定线上裁定为 register-branch，见 `docs/mvp-pitfalls.md` P-1）。若官方模式注册表是内置封闭的，fallback 为：`omo` profile + `dsh --patch ./cordis.yml` 启动脚本，并在 `docs/mvp-pitfalls.md` 记录"模式注册不开放"的完整证据。该 fallback 不影响 V1–V4 的验证。

**协奏模式 = 以下五件的装配**：

| # | 构件 | 内容 |
|---|---|---|
| 1 | `omo-sisyphus` agent preset | 极简编排者 persona（本地 markdown system sections：角色 + 委派纪律 + Hard Blocks） |
| 2 | `omo-explore` subagent preset | 只读检索者 persona（OMO `call_omo_agent` 白名单同款选型：explore 是 OMO 自己认定的最安全 subagent，§13.3.2） |
| 3 | 委派工具 | 一个 `dsh-tool-subagent` 实例绑定 explore，挂到 sisyphus 的工具集（§12.4 绑定形态 A：静态 plugin config） |
| 4 | 双模型路由 | sisyphus 与 explore 各持一对不同的 `{provider, model}`，使用 DSH 内置 adapter（`dsh-llm-deepseek` + `dsh-llm-pi-ai`），具体模型 id 走 config 不硬编码 |
| 5 | 1 个 hook listener | `agent/pre-step` + `agent.inject()`：把 Hard Blocks / Anti-Patterns 段落注入子 agent system prompt（验证 V3；内容来自本地 markdown，OMO attribution 记入 `THIRD_PARTY_NOTICES.md`） |

---

## 5. 功能需求

| # | 需求 | 验收关联 |
|---|---|---|
| FR-1 | **仓库与 license 骨架**：独立 `oh-my-opendsh/` scratch plugin 仓库；`package.json` 声明 `"license": "MIT OR SUL-1.0"`；`LICENSES/oh-my-openagent.LICENSE.md` 原样收录；`THIRD_PARTY_NOTICES.md` 完整 attribution（决策 D6/D10）；`cordis.yml` 入口 | AC-1, AC-8 |
| FR-2 | **协奏模式可激活**：新模式入口存在且与官方 4 模式同级（或执行 §4.4 fallback 并记坑） | AC-2 |
| FR-3 | **omo-sisyphus preset 注册**：system prompt 由本地 markdown sections 组装（角色 / 委派纪律 / Hard Blocks），快照可断言 | AC-3 |
| FR-4 | **omo-explore subagent 注册**：只读 toolFilter（禁写类工具）；禁止嵌套委派（depth cap=1，验证透传 DSH `policy.maxDepth`） | AC-4, AC-6 |
| FR-5 | **双模型路由**：两个 agent 以不同 `{provider, model}` 运行，且 session log 可观测到各自路由 | AC-5 |
| FR-6 | **Hard Blocks 注入 hook**：1 个 `agent/pre-step` listener 完成注入；子 agent system prompt 快照中可见注入段落 | AC-3, AC-6 |
| FR-7 | **演示场景脚本**：编排好的 dummy 检索任务（例："这个仓库的 README 讲了什么"）驱动 sisyphus → explore → 回答 的完整链路；不解决真实工程问题 | AC-4 |
| FR-8 | **验证工具链**：mock-LLM e2e（复刻调研 §14 L2 pattern）+ doctor-lite（3–5 个 check）+ `docs/mvp-pitfalls.md` 踩坑记录模板 | AC-7, AC-9 |

---

## 6. 范围外（明确不做）

| 项 | 去向 |
|---|---|
| 其余 10 个 agent（hephaestus / oracle / librarian / metis / momus / atlas / multimodal-looker / sisyphus-junior / prometheus / 完整 sisyphus） | follow-up |
| Team Mode（lead + N member + web 可视化） | follow-up（调研 §2.5，3 周） |
| MCP（LSP / ast-grep / codegraph / git-bash / web） | follow-up |
| hashline edit | follow-up |
| slash commands（ultrawork / ulw / team / hyperplan / search） | follow-up |
| OMO 19 core 包 npm import | **不并入 MVP**（Q-2 已决 → D11）：MVP 默认用本地 markdown + attribution；import 链路验证为紧随 MVP 之后的第一个 follow-up |
| 真实工程任务驱动 | 永不属于本 MVP |
| Windows / WSL | 决策文档 D9 已定 |
| 性能 / token 成本优化 | follow-up |

---

## 7. 验收标准

| # | 标准 | 验证方式 | 对应假设 |
|---|---|---|---|
| AC-1 | `dsh --patch ./cordis.yml`（或协奏模式入口）冷启动到 idle，日志无 plugin 加载错误 | 冷启动脚本 + 日志检查 | V1 |
| AC-2 | 协奏模式出现在模式选择入口（或 fallback 路径已文档化 + 坑已记录） | 手动验证 + pitfalls 记录 | V1 |
| AC-3 | sisyphus system prompt 快照含：编排者角色 + 委派纪律 + Hard Blocks 注入段落 | 快照测试（`DSH_SNAPSHOT=record` 模式，调研 §4.6） | V3 |
| AC-4 | dummy 演示场景跑通：session log 显示 sisyphus 调用委派工具 → explore 运行 → 结果返回 → sisyphus 总结 | mock-LLM e2e + 1 次真模型手动 run | V1 |
| AC-5 | session log 中 sisyphus 与 explore 的 `{provider, model}` 可观测且**不同** | e2e 断言 log 记录的路由对 | V2 |
| AC-6 | explore 写操作被拒（toolFilter 生效）；explore 尝试再委派被拒（depth cap 生效） | e2e 负向断言 | V4 |
| AC-7 | mock-LLM e2e 在 CI 跑出 `{"result":"PASS"}`，零 LLM 成本 | CI job | V1–V4 |
| AC-8 | `scripts/verify-licenses.sh` PASS；attribution 完整 | CI job | — |
| AC-9 | `docs/mvp-pitfalls.md` 至少记录 1 条真实踩坑，每条含：现象 / 证据 / 根因 / fallback | 文档评审 | G2 |

**Sign-off 条件**：AC-1～AC-9 全绿，且 V1–V4 逐条给出"验证通过 / 证伪 + 影响评估"结论，写入 MVP 结项记录（`docs/mvp-pitfalls.md` 末尾或独立结项节）。

---

## 8. 测试策略

复刻调研 §14 的四层金字塔的**最小子集**（§14.8"pattern 能复用；路径和 OMO 特定断言不能"）：

| 层 | MVP 做法 | 来源 |
|---|---|---|
| L2 mock-LLM e2e（核心） | ~200 LoC OpenAI 兼容 mock server（剧本化 MockStep：text / tool_call / hang）；1 个 scenario driver 覆盖 §7 的 AC-4/5/6；观察通道 = DSH session JSONL + 共享目录断言文件；沙箱化 HOME/XDG（复刻 `drive.mjs` pattern） | §14.4 / §14.5 / §14.8 |
| L3 doctor-lite | 3–5 个 check：`dsh --version` 存在且为 pin 的 0.1.x（D7）；cordis.yml 可被解析；两个 LLM adapter 已注册；subagent 实例 config 合法。`--json` 输出，fail 则 exit 1 | §14.6 |
| L4 真模型手动冒烟 | 1 次手动 run（非 CI gate）：真 provider key + dummy 场景，人工核对 AC-4/5；成本 <$1 | §14.7 |
| L1 单元 | 仅覆盖我们写的 glue 代码（system section 组装、config 解析） | §14.3.1 |
| License 检查 | `scripts/verify-licenses.sh` 进 CI | §4.7 |

明确不做：性能 benchmark、对抗/红队测试、Web UI 视觉回归（§14.9 同款范围外）。

---

## 9. 预期踩坑清单（验证计划）

每条在实施中撞击并记录到 `docs/mvp-pitfalls.md`；"若假设不成立"列即 fallback 预案。

| # | 候选坑 | 假设 | 若假设不成立 |
|---|---|---|---|
| P-1 | **运行模式注册开放性**：DSH 是否允许 scratch plugin 注册第 5 个运行模式（0.1.0-rc.5 提出；0.1.5-rc.1 复核） | 模式表可经官方扩展点扩充 | 降级为 profile + `--patch` 启动脚本；记坑；协奏语义不受影响 |
| P-2 | **`agentOptions` 路由生效**：`dsh-tool-subagent` 实例 config 的 `agentOptions.{provider,model}` 在 runtime 真的覆盖父继承（§12.7 自述未 runtime 验证） | 生效且 log 可观测 | V2 证伪；上报为 DSH 侧 gap，评估自写 wrapper |
| P-3 | **`agent/pre-step` waterfall 语义**：listener 注册顺序、authoritative 拒绝/注入是否如文档 | 如 `docs/architecture.md` 所述 | V3 部分证伪；改用其他挂载点并重估 hook 移植成本 |
| P-4 | **toolFilter 字段语义**：字段名/语义与预期一致 | 一致 | 改用它提供的等价机制；记坑 |
| P-5 | **depth cap 默认值**：`policy.maxDepth` 默认与透传行为 | 可配置且生效 | 显式声明；若无效则 V4 证伪 |
| P-6 | **双面构建**：我们的 plugin 在 `build:lib:host` + `build:lib:client` 双 target 下构建/加载无误 | 无误 | 调整 tsconfig/构建边界；记坑 |
| P-7 | **可观测性**：session log 是否记录子 agent 的已解析路由（验收 AC-5 依赖） | 记录 | 加自有 log listener；记坑（同时是 §2.9"model-visible means logged"的实证） |
| P-8 | **cordis.yml schema**：scratch plugin 配置 schema 校验细节 | 文档与实现一致 | 按实际报错修正；记坑 |
| P-9 | **config schema 兼容性**（omo-senpi 同类坑，调研 §11.4 issue #6794）：本地 markdown/config 加载在 DSH 事件流下的路径解析 | 无路径/解析坑 | 修正加载方式；记坑 |

---

## 10. 里程碑与工作量（spike 估算，非承诺）

| 里程碑 | 内容 | 估算 |
|---|---|---|
| M1 骨架 | FR-1（仓库 / license / cordis.yml 冷启动）+ P-1/P-8 撞击 | ~2 天 |
| M2 模式与主 agent | FR-2 / FR-3（协奏模式 + sisyphus preset）+ P-6 | ~2 天 |
| M3 委派链 | FR-4 / FR-5 / FR-6（explore + 双路由 + hook）+ P-2/P-3/P-4/P-5/P-7 | ~4 天 |
| M4 验证与结项 | FR-7 / FR-8（mock e2e + doctor-lite + 真模型冒烟 + pitfalls 文档 + V1–V4 结论） | ~2 天 |
| **合计** | | **~2 周（一人）** |

---

## 11. 开放问题（✅ 2026-08-19 全部决议）

| # | 问题 | 选项 | 决议（2026-08-19） |
|---|---|---|---|
| Q-1 | 模式名「协奏 / Concerto」是否采纳 | A. 协奏 / B. Sisyphus / C. 编排 / D. 其他 | ✅ **采纳 A**：定名「协奏模式 / Concerto Mode」，模式标识 `concerto` |
| Q-2 | 是否把"import 1 个最小 OMO core 包（验证 npm import + dual license + typecheck 链路）"并入 MVP | A. 并入（+1~2 天）/ B. 留作紧随的 follow-up | ✅ **采纳 B**：不并入；MVP 保持最小，import 链路验证为紧随其后的第一个 follow-up |
| Q-3 | 真模型冒烟用的两个 provider | A. deepseek + pi-ai（DSH 内置）/ B. 其他组合 | ✅ **采纳 A**：deepseek + pi-ai，零新增 LLM adapter 工作 |
| Q-4 | PRD 采纳后是否登记决策 D11 关闭 O8 | A. 是 / B. 再议 | ✅ **采纳 A**：本 PRD 获采纳，登记为决策文档 D11，开放维度 O8 关闭 |

以上四项决议已同步登记至[决策记录](./decisions_zh-CN.md)（D11）。

---

## 12. MVP 之后（与全量移植的衔接）

MVP 结项时，V1–V4 的结论直接决定 follow-up 排序：

- [ ] **0.1.5-rc.1 两份记录的中文版。** [`dsh-0.1.5-rc.1-review.md`](./dsh-0.1.5-rc.1-review.md) 与 [`dsh-0.1.5-rc.1-upgrade.md`](./dsh-0.1.5-rc.1-upgrade.md) 目前仅有英文，以便记录随它所描述的变更一同落地；`docs/` 下的文档通常是 EN+zh 成对的（参见 `dsh-0.1.2-review.md` / `_zh-CN.md`）。两份文档的头部均指向本条。
- **V1–V4 全部验证通过** → 按调研 §2.10 进入全量移植（OMO core import → 剩余 agent → hook 批量翻译 → Team Mode → …）
- **任一 V 证伪** → 回到决策文档登记新风险（R7+），重估受影响的工作量块，再定方向
- MVP 产物全部保留并生长：仓库骨架 → 全量 patch 框架；mock e2e → 完整 L2 层；doctor-lite → 完整 doctor；`mvp-pitfalls.md` → 持续累加的踩坑知识库
- [x] **DSH pin bump 0.1.0-rc.6 → 0.1.5-rc.1 —— 2026-09-10 完成**（D7 机制下的刻意升级；取代下方过期的 rc.6 → 0.1.2-alpha.1 条目）。L1 全绿（104 单测 / doctor-lite 4-4 且 16 行经 schema 校验 / static 10-10 / docs 7-7 / e2e 4-4），**L2 亦绿**（真机手工会话，自原始日志逐条复核 17/17）——矩阵行 `our unreleased × dsh 0.1.5-rc.1` 为 `tested`（其 `our:` 刻意不带版本号——已发布的 0.1.1 并不满足它），证据 `.omo/evidence/concerto-verify-dsh-0.1.5-rc.1.md`。两件事是带下去而非关闭的：`toolFilter`/`maxDepth` 是工具层护栏而非能力边界（mvp-pitfalls §8 P-21，按 R5 接受）；e2e 的限制类场景认证的是工具缺席而非被禁结果不可达——登记自 dsh 0.1.5-rc.1 复核报告（[`dsh-0.1.5-rc.1-review.md`](./dsh-0.1.5-rc.1-review.md)），该报告是本条目的调研依据。复核结论：**1 个硬断点（P0）、3 个观察通道断点（P1）、1 个门禁盲区（P1）**，其余全部完好。

  - **P0 —— persona 配置键改名。** `@deepseek-ai/dsh-persona` 在 `dsh-v0.1.3-alpha.2` 用 `prefix:`（required）取代了 `text:`，并新增 `suffix`。由于 schemastery 会保留未声明键，过期的 `text:` 能通过校验**却永远不会被读取**，因此没有任何警告，composition 在缺失必填的 `prefix` 上挂载失败；任何命名 `concerto` 的会话都被以 `agent-preset/invalid` 拒绝。改动点：`patches/omo-dsh/omo-agents/src/system-prompt.ts`（渲染器哨兵）、两份协奏 composition（`concerto/agent.cordis.yml`、`omo-agents-current/preset/agent.cordis.yml`）、`tests/omo-agents/system-prompt.test.ts`、`tests/omo-agents/concerto-preset.test.ts`、`tests/e2e/drive.mjs`（MOCKROLE needle）、`scripts/concerto-mode-probe.sh`。
  - **P1 —— 会话日志代际改名。** `session.jsonl` → `session.v3.jsonl`（session format v3）。e2e driver 的 `findSessionLogs` 按固定文件名匹配，于是整条落盘观察通道失效——而 harness 本身是好的。
  - **P1 —— `subagent/descriptor` version 2 → 3**（`SUBAGENT_DESCRIPTOR_VERSION`；0.1.2 复核附录已记录过，但 driver 的构造 fixture 仍写 `version: 2`）。
  - **P1 —— `dsh-tool-subagent` 新增 `sessionProjections` 注入**并无条件注册，因此未提供该服务的 fixture 会停在 `waiting` 且不注册任何工具（`scripts/prove-explore-maxdepth.mjs`）。
  - **P1 —— 门禁对 P0 完全失明。** 未改一行的仓库在 0.1.5-rc.1 上得 104/104 单测、4/4 doctor-lite、10/10 concerto-static、7/7 docs-consistency——而 e2e 是 0/4。`doctor-lite` 的 schema 检查只校验**一行**，而挂掉的那行恰恰没有任何 schema 门。应泛化为"渲染后 composition 中每个带 config 的行"。
  - **P2 —— 派生纪律对齐。** 新增 `present` 行（`@deepseek-ai/dsh-tool-present`，`dsh-v0.1.5-alpha.2` 起随官方 preset 发布——rc.6 上不存在，故加它绑定在本次 bump 上）；`omo-agents-current` 的 `tool-web` `fetch: false` 与上游及旧模板的 `true` 不一致；可选的 `persona.suffix` 对齐；我们自己的注释里 5 处过期的 `deployment:persona` 符号。
  - **P2 —— CI/脚本卫生。** 四个 `dsh web` 启动点补 `--no-open`（`dsh web` 现已默认打开浏览器，而本仓库没有任何脚本抑制它）；`DSH_VERSION` 面：`.github/workflows/ci.yml`（+ 注释）、`.github/workflows/compat-probe.yml`、`scripts/doctor-lite.mjs`、`scripts/doctor-lite-core.ts`、`tests/omo-agents/doctor-lite.test.ts` fixtures、以及两个 README 的 "Key Facts" 行。
  - **0.1.5-rc.1 上已复验完好**（无需改动）：`--patch` 语义与 patch 引擎（逐字节相同）；`dsh plugin add`；`agentPresets` 服务面（`list`/`resolve`/`copy`/`standingKeyFor`、`AgentPreset.path`）；用户根 `$DSH_HOME/.agent-presets`；`preset.yml` 与 `trust`；挂载期的 isolate realm 不变量；`agent/pre-step` + `agent.inject()`；`tool-subagent` 全套配置 schema（`provider`/`toolName`/`backgroundMode`/`persona`/`agentOptions`/`toolFilter`/`maxDepth`）；T11 explore persona 影子；T12/F1 的 toolFilter 强制；以及 FR-6 hard-blocks 注入——全部经真实运行确认。
  - **本地交付的环境偏离。** Q-3 的 explore 席位走 `llm-pi-ai` 的 catalog 路由 `deepseek`，需要在 `$DSH_HOME/settings.yaml` 写入 `llm-pi-ai.providers` 段。若部署方拒绝该 settings 改动，则改用文档化的环境变量覆盖（`OMO_EXPLORE_PROVIDER=deepseek-official`）把 explore 席位钉到 `deepseek-official`。仓库默认值保持 Q-3（pi-ai）不变——这是按部署的偏离，不是决策变更。

- [x] ~~**DSH pin bump 0.1.0-rc.6 → 0.1.2-alpha.1**~~ —— **已被上方 0.1.5-rc.1 条目取代，保留为历史记录。** 登记自 dsh 0.1.2 复核报告（[English](./dsh-0.1.2-review.md) / [中文](./dsh-0.1.2-review_zh-CN.md)）§4。**状态 2026-08-29：被 npm 发布阻塞**——`@deepseek-ai/dsh@0.1.2-alpha.1` 当时只以 git tag 存在（registry 最高到 `0.1.1-rc.2`）；协奏 preset 已重派生（42e1f84），全部门禁 + 探针链已针对该 tag 的源码构建版本及 rc.6 pin 在本地复验 GREEN（证据 `.omo/evidence/task-{7,8,9}-dsh-012-review-sync.log`）；harness 现已对两种运行时传输自适应（105aa84, 3d949f1）。该阻塞最终未以那种形式解除：npm 相继发布了 `0.1.2-rc.1`、`0.1.3-alpha.*` / `0.1.5-alpha.*` 阶梯，以及 `0.1.5-rc.1`——也就是本项目现在锁定的版本，于是中间那次 `0.1.2-alpha.1` 翻转已无意义。P-1.2/P-1.3 所依赖的 `roots` 强制改写前提在 0.1.5-rc.1 中已消失（见 0.1.5-rc.1 复核 §7.4），因此这些 fallback 不再约束本次 bump。patch 注释中的 rc.6 引用（`patches/omo-dsh/omo-agents/src/explore-prompt.ts:8`、`.../hard-blocks-injection.ts:7`）保留为 rc.6 时代的历史验证记录。

---

**English version**: [`mvp-prd.md`](./mvp-prd.md)
