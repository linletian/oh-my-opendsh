# Phase 2 开发计划：agent 花名册扩展（1+1 → 完整团队）

> **本目录**：[`docs/plans/phase2-dev/`](./) —— ROADMAP **Phase 2**（agent 花名册扩展）的实施计划。
>
> **上游依据**：[ROADMAP（中文）](../../roadmap_zh-CN.md) §4 Phase 2 · [决策 D14](../../decisions_zh-CN.md)（基线冻结）· [可行性报告 §12／§13／§16](../../feasibility-report_zh-CN.md) · [agent 团队调查报告](../../omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md) §1 · [MVP PRD](../../mvp-prd_zh-CN.md)（AC-5/AC-6 模式）
>
> **配套文档**：[任务清单](./phase2-tasks.md) · [名册基准表](./phase2-roster.md)
>
> **状态**：📋 **计划已立项，待实施**。实施期实测对本文的回填、逐任务证据与退出标准核对见[任务清单](./phase2-tasks.md)。
>
> **修订记录**：2026-09-11 评审修订（H-1～H-6 + 10 小项）——multimodal-looker allowlist 修正为 `[read, read_image]`（H-1，§4.4 实证段）；MOCKROLE 泛化立为 P2-T18 显式子任务（H-2）；live/归档路径称谓统一（H-3，§3）；R-4 回退改落 `deepseek-official`（H-4）；e2e 路由分布理由改写为双 catalog 实测（H-5，§4.7/基准表 §3）；README 增"名册路由与 env 覆盖表"产出（H-6）；另补 R-9、DoD-c 基线清单、快照命名双约定、continuable 决策记录、P2-T1 输入/问题分组、T22 提交步骤。第二轮（M-1～M-4，均低 severity）：§4.6 前提句改为"两个 adapter 的三条席位路由"；boot 自检从配置层推到运行时层（T16 增 `route provider not registered` 非阻断警告——第三条，probe 增 11 provider active 断言）；§5 显式清单补"默认席位 ≠ 11 条互异路由"；T16 补 11/10 口径注（哨兵位 vs 子级 marker 行）。

---

## 1. 目标

**把协奏从 sisyphus+explore 的 1+1 最小编制扩展到 OMO 完整名册：11 个 agent 全部落在 DSH agent preset（concerto）上，每个 agent 持有独立的 `{provider, model}` 路由。**

ROADMAP §4 Phase 2 原文：

- **范围**：hephaestus、oracle、librarian、**plan-consultant**（metis）、**plan-reviewer**（momus）、atlas、multimodal-looker、sisyphus-junior、prometheus（加上既有的 sisyphus、explore 共 11 个）；persona 文本取自冻结基线的 prompt（按 §16 用 v5 角色名）；工具限制镜像 OMO 语义（如 plan-reviewer 只读）；agent 间的委派绑定。
- **关键约束**：模型链留在配置而非硬编码；DeepSeek 系路由优先（R1 分期策略）。
- **退出标准**：每个 agent 可经指挥调用、其路由在会话日志可观测（AC-5 模式推广）；名册快照测试常绿。

本阶段的成功标志不是"多几个工具"，而是：**指挥（omo-sisyphus）面对任务时，能在 10 个具名委派目标中选出合适的那个，每个目标以自己的模型路由运行，且这一切在配置、快照与会话日志三个层面都可审计。**

## 2. 上游依据与不可协商约束

本阶段受 ROADMAP §2（上游版本政策）与 §3（不可协商约束）同等约束。落到操作层面：

| 约束 | 来源 | 本阶段的具体含义 |
|---|---|---|
| **冻结基线 = OMO v4.19.4** | ROADMAP §2 规则 1 / D14 | persona 语义来源 = v4.19.4 tag（commit `b072d279110bdda2c6ac2525d0d24dc54d16148a`，与 Phase 1 同一锚点）的 agent prompt；**只从 tag 取内容**（`git show v4.19.4:<path>`），不从工作树复制（本地 OMO 检出 HEAD 不在该 tag 上） |
| **命名锚点用 v5 角色名** | ROADMAP §2 规则 6 / 可行性报告 §16.2 | metis → **`plan-consultant`**、momus → **`plan-reviewer`**（新旧映射见上游 `packages/utils/src/migration/agent-names.ts`）；其余 9 个名字两版一致。v5 新增的 ulw-loop reviewer 三人组与 Kibitzer **不在**本阶段范围（senpi 独占，且 reviewer  trio 写报告工件、非只读集） |
| **不追 beta** | ROADMAP §2 规则 2 | 不取 v5.0.0-beta.* 的 persona 内容（如 plan-consultant.ts 的新版 prompt）；文本取自 v4.19.4 的 metis.ts/momus.ts，仅**名字**用 v5 |
| **SUL-1.0 合规与署名** | ROADMAP §3 约束 1 / D10 | persona 是**语义移植**（markdown），不是 code vendor——但每个派生文件保留 HTML 注释署名头（explore-persona.md 既有范式），`THIRD_PARTY_NOTICES.md` 新增本阶段小节逐文件列出 9 个 persona 文件 + 委派表段落的来源文件（D15 逐文件精神的沿用，见 §4.9） |
| **移植语义取自 harness-neutral core 层** | ROADMAP §3 约束 5 | ⚠️ **agent 定义恰恰在 opencode 适配层**（`packages/omo-opencode/src/agents/`），其 `.ts` 直接依赖 `@opencode-ai/sdk`——**不可 vendor、也不应 vendor**。可移植的语义是 prompt 文本、工具限制表、委派元数据，形态 = markdown + 配置。这是"语义移植而非 vendor"的约束级理由，不只是惯例 |
| **非商业** | ROADMAP §3 约束 2 / D8 | 无新增动作；署名文案不暗示商用授权 |
| **不给 OMO 提 PR；永不移除署名** | ROADMAP §3 约束 3 / D5 | 不向上游提交任何内容；既有署名条目只增不改 |
| **`verify-licenses` 常绿** | ROADMAP §3 约束 4 | 本阶段不新增 npm 依赖、不 vendor 新包，`checked` 计数应**不变**；若变化须查明 |
| **DSH 原生优先** | README 原则一 | 委派机制直接用 `dsh-tool-subagent`（绑定形态 A，可行性报告 §12.4），不自写 wrapper；`/goal` 等已由 `dsh-goal` 覆盖的能力不重复造 |

## 3. 现状盘点（1+1 基线）

> **本计划全篇统一称谓**：**live 路径** = `patches/omo-dsh/omo-agents/`（构建 / e2e / cold-start / probe 的加载目标，本阶段的改动对象）；**归档路径** = `patches/omo-dsh/omo-agents-current/`（installer 通道的 v0.2 冻结归档，本阶段不动）。静态门分工与之一致：c01–c09 断归档路径，c10 断 live 路径。

Phase 0 交付、Phase 1 未触碰的 live 路径当前是 **1+1 编制**：

| 构件 | 现状 | Phase 2 的影响面 |
|---|---|---|
| `src/concerto-preset.ts` | apply() 时把 `concerto/` 模板同步进 `$DSH_HOME/.agent-presets/concerto/`；3 个哨兵（sisyphus persona / explore persona / explore agentOptions） | 哨兵机制从 3 个推广到 **29** 个（11 persona + 10 agentOptions + 8 逐行 deny，§4.4）；渲染器需名册驱动化 |
| `src/model-routes.ts` | 2 条路由（sisyphus / explore），env 可覆盖，AC-5 预检"两对必须不同" | 推广为 11 条路由的名册映射（§4.6） |
| `src/system-prompt.ts` + `system-sections/` | sisyphus 4 段（role / delegation-discipline / hard-blocks / anti-patterns）；explore 1 段 persona | 新增 9 个 persona 文件 + sisyphus 增"名册委派表"第 5 段（§4.3/§4.5） |
| `src/hard-blocks-injection.ts` | 1 个 `agent/pre-step` listener 向**每个** subagent 注入 Hard Blocks + Anti-Patterns | ✅ **零改动自动覆盖** 9 个新 agent（注入门是 `origin === 'subagent'`）；e2e 对一个新 agent 断言即可 |
| `concerto/agent.cordis.yml` | delegation 组 3 行（control / list-agents / tool-subagent-explore）；通用 subagent 行已 DROP（F1 加固） | delegation 组扩为 **12 行**（+9 个 `dsh-tool-subagent` 实例）；每行的 toolFilter/maxDepth 按名册类（§4.4） |
| 测试 | 187 单测（门 2 现状，含 2 个 persona 快照与 vendor 78）；e2e 4 场景（hello / demo / write-denied / nested-denied）；静态门 c01–c10 | 名册快照测试（退出标准）；e2e 增名册场景（§4.7）；静态门 **c10**（live 路径加固断言）需泛化，c01–c09 断在**归档路径**不受影响 |
| `patches/omo-dsh/omo-agents-current/` | **冻结归档**（动态插件 conc-1 的 verbatim 存档 + installer 源） | **不动**。installer 继续装 1+1 preset，分歧记入文档，发布决策留给 Phase 7（§4.8） |
| 门链 | `scripts/ci-local.sh` 8 门（typecheck / vitest / e2e / doctor-lite / licenses / concerto-static / docs / proofs） | 全部保持绿；涉及门按 §4.7 扩展而非绕过 |

## 4. 方案设计

### 4.1 名册总表

11 个 agent 的最终编制（v5 命名；DSH 工具名为裸名——理由与风险见 R-1）：

| # | Agent（DSH 工具名） | OMO v4.19.4 源 | 角色 | 读写类 | 委派权 |
|---|---|---|---|---|---|
| 1 | `sisyphus`（指挥，既有） | `agents/sisyphus*.ts` | 主编排者 | 读写 | —（主会话） |
| 2 | `explore`（既有） | `agents/explore.ts` | 只读代码检索 | 只读 | 无 |
| 3 | `hephaestus` | `agents/hephaestus/` | 自主 deep worker（"给目标，不给步骤"） | 读写 | 无 |
| 4 | `oracle` | `agents/oracle.ts` | 只读高智商架构/调试顾问 | 只读 | 无 |
| 5 | `librarian` | `agents/librarian.ts` | 文档与 OSS 代码搜索 | 只读 | 无 |
| 6 | `plan-consultant`（= metis） | `agents/metis.ts` | 计划前 gap 分析 | 只读 | 无 |
| 7 | `plan-reviewer`（= momus） | `agents/momus.ts` | 计划评审 | 只读 | 无 |
| 8 | `atlas` | `agents/atlas/` | todo 执行编排（分发+独立验证） | 读写 | **有**（maxDepth 2） |
| 9 | `multimodal-looker` | `agents/multimodal-looker.ts` | 视觉/媒体文件分析 | **allowlist [read, read_image]**（§4.4 实证） | 无 |
| 10 | `sisyphus-junior` | `agents/sisyphus-junior/` | 无委派权的专注执行器 | 读写 | 无 |
| 11 | `prometheus` | `agents/prometheus/` | 访谈式战略规划 | 只读 | 无 |

逐 agent 的上游事实（prompt 源文件、限制表、元数据、模型链、本阶段绑定形状）全部落在[名册基准表](./phase2-roster.md)；实施时以 P2-T1 的逐文件复核为准。

**两个"半功能"说明（诚实边界）**：

- **atlas** 的完整 `/ulw-execute`（原 `/start-work`）激活流是 Phase 4 范围；本阶段交付的是"可被指挥调用、且能再委派 worker 的 atlas"（maxDepth 2 是其编排者身份的结构表达）。
- **prometheus** 在 OMO 是 Tab 主 agent（访谈用户）；作为委派目标移植时，其访谈对象改为**指挥**（把问题写回报告，而非问用户）——适配注记写入其 persona。完整 `/ulw-plan` 流同样是 Phase 4。
- **sisyphus-junior** 的 "category 路由中介" 功能不移植：v5 senpi 已去掉该中介（category 直连 worker），且 category 体系属于 Phase 5（Team Mode）邻域；本阶段它是"专注执行器"。

### 4.2 单一事实源：`roster.ts`

现状的痛点：`model-routes.ts` 硬编码 {sisyphus, explore} 两条；`concerto-preset.ts` 有 explore 专属渲染函数；模板 YAML 有 explore 专属哨兵。名册扩到 11 后，任何 per-agent 硬编码都会繁殖 10 份。

**设计**：新增 `src/roster.ts` 作为名册**唯一**事实源，每个条目声明：

```ts
interface RosterEntry {
  readonly id: string             // 'oracle' —— 同时是 toolName 与 persona 文件基名
  readonly personaFile: string    // 'oracle-persona.md'（system-sections/ 下）
  readonly routeEnvVars: { provider: string; model: string }  // 'OMO_ORACLE_PROVIDER' / 'OMO_ORACLE_MODEL'
  readonly defaultRoute: ModelRoute                            // §4.6 的席位默认
  readonly class: 'read-only' | 'worker' | 'orchestrator' | 'allowlist'
  readonly maxDepth: 1 | 2       // orchestrator(atlas) = 2，其余 = 1
  readonly allowTools?: readonly string[]  // 仅 multimodal-looker: ['read', 'read_image']（§4.4 评审实证）
  readonly writeCapable: boolean // worker + atlas(orchestrator) = true；read-only / allowlist = false
}
```

- `model-routes.ts` 改为名册驱动：`resolveModelRoutes()` 返回 `Record<AgentId, ModelRoute>`；保留 sisyphus≠explore 的 AC-5 硬预检（§4.6）；每字段空值 loud throw（既有纪律不变）。
- `concerto-preset.ts` 的渲染器名册驱动化：3 个手写哨兵函数 → 通用 `renderAgentSentinels`（persona / agentOptions / deny 三类哨兵统一从 roster 渲染）；`replaceSentinelOnce` 的"恰好一次"护栏保留到每个哨兵。
- `index.ts` 的 boot marker 名册化：子级 10 行 `persona assembled`（指挥由既有 `omo-sisyphus system prompt assembled` marker 覆盖，index.ts:124）+ 一行汇总路由表（11 条，probe 断言锚点，§4.7）。

**sisyphus 不进 roster 的委派工具部分**：指挥是主会话 persona（preset persona 行），不是 `dsh-tool-subagent` 实例；但它的**路由**仍在名册里（单一事实源含 11 条路由，委派工具行只消费其中 10 条）。

### 4.3 Persona 移植纪律

每个新 agent 一个 `system-sections/<id>-persona.md`，纪律 = explore-persona.md 既有范式的成文化：

1. **语义移植，非逐字复制**：保留上游 prompt 的角色设定、规则结构、输出契约；**改写** harness 特定引用（`apply_patch` → 无此工具，写类拒绝泛化为 write/edit；`task`/`call_omo_agent` → 委派工具缺席语义；opencode UI/Tab 概念 → 删除或改写）。explore 先例："Semantic translation only — markdown semantics, no TypeScript code copied"。
2. **每文件署名头**：HTML 注释标明上游来源文件（精确到 tag 路径）+ "语义移植"声明；多源文件逐一列出（explore 先例列了 3 个源）。
3. **`{{` 禁令**：persona 文本不得含 `{{`（dsh renderPrompt 会对未知变量 throw）；builder 在 assemble 时 reject（system-prompt.ts 既有护栏，推广到所有 persona builder）。
4. **build 函数**：`explore-prompt.ts` 的单 agent builder 泛化为 `persona-prompts.ts` 的 `buildAgentPersona(id)`（从 roster 取文件名、load、trim、`{{` 检查）；每 agent 一个签入快照 `tests/omo-agents/__snapshots__/<id>-system-prompt.md`（P-10.4 快照纪律；**命名双约定沿用仓库既有**：persona 源文件 `<id>-persona.md` 沿用 `explore-persona.md`，快照 `<id>-system-prompt.md` 沿用 `explore-system-prompt.md` / `sisyphus-system-prompt.md`——不发明第三种）。
5. **长度自律**：上游 prompt 有 100–300 行者（oracle/metis 等），移植目标是**语义完整的浓缩**（explore 先例：上游 ~80 行 → 移植 46 行），不是全文搬运——长 persona × 10 个工具描述会显著抬高每步 prompt 成本。浓缩不得删去：角色身份、约束性声明（"binding, not preferences"式）、输出格式契约。

### 4.4 工具限制镜像：四类 + 逐行 deny 哨兵渲染

OMO 的限制是 `permission` 表（deny 列表 / allowlist）；DSH 的等价物是 `dsh-tool-subagent` 实例的 `toolFilter`（已核实支持 `allow` 与 `deny` 两键——installed dsh `dsh-tool-subagent/lib/index.js` Config schema 第 265–268 行；空 filter 会 throw，第 370 行）。镜像规则：

| 类 | Agent | toolFilter | maxDepth |
|---|---|---|---|
| 只读 | explore（既有）/ oracle / librarian / plan-consultant / plan-reviewer / prometheus | `deny: [write, edit]` + **全部委派工具名** | 1 |
| Worker | hephaestus / sisyphus-junior | `deny:` **全部委派工具名** | 1 |
| Orchestrator | atlas | **不 deny 委派工具** | **2** |
| Allowlist | multimodal-looker | `allow: [read, read_image]`（OMO `allowlist [read]` 的 DSH 工具名空间映射，实证见下） | 1 |

**OMO `read` → DSH 双工具的映射实证**（2026-09-11 评审实测，installed dsh）：OMO 的 `read` 在 DSH 拆成两个工具——`read` 只读 UTF-8 文本（`dsh-tool-fs/lib/index.js`:332 描述 "Read a UTF-8 text file"）；`read_image` 是**独立**工具，由 dsh-tool-fs 在 `ctx.inject(["attachments"], …)` 内**条件注册**（同文件 :1257 注释 "plus `read_image` while `attachments` is mounted"、:1270-1271 注册点）。`attachments` 服务在 host 层（`dsh-base/cordis.patch.yml`:118 `attachment-local`），concerto 子会话经继承获得，故 `read_image` 存在。而 `tools.restrict()` 的 `allow` 是**白名单过滤继承面**（`dsh-tools/lib/index.js` `admits()` 2545-2546：不在 allow 集合即不可见）——**`allow: [read]` 会把 `read_image` 一并挡掉**，multimodal-looker 拿到图片路径也读不出像素，恰好命中 R-4 想防的"视觉不可用"（工具白名单一侧，R-4 原本只覆盖 model/catalog 一侧）。只写 `[read]` 是把 OMO 的单一 read 语义照搬、未做工具名空间映射——与本表对 `apply_patch`→write/edit 的映射纪律不一致，故映射为 `[read, read_image]`。⚠️ 配套约束：`restrict()` 对**未注册名**会 throw（`dsh-tools/lib/index.js`:2801-2803，"names unknown global tool"）——`read_image` 是条件注册，若某部署未挂 `attachments`，写进 allow 的名字会让子级启动直接抛错（见 R-9）。

**"deny 全部委派工具名"的机理**（F1 加固的推广）：子会话继承父 composition 的全部工具，toolFilter 在子级 `restrict()` 时生效。10 个委派工具都在指挥的 composition 里，若只 deny 自身，oracle 子级仍会**看到** `librarian`、`explore` 等工具（浪费 token + 邀请被拒的调用）。F1 教训（PR #1 review，2026-09-04）：**物理缺席强于拒绝时拦截**——deny 掉工具本身，maxDepth 只作深度防御。

**deny 列表的哨兵渲染**（关键设计决策）：10 个委派工具名 × 多行静态书写 = 加第 11 个 agent 时要逐行改 YAML，脆弱且噪声大；但**同一个**哨兵串又不能出现在多行（`replaceSentinelOnce` 的"恰好一次"护栏会拒绝）。采用**逐行唯一哨兵、按类渲染**：

- 模板里每个只读行与 worker 行写 `deny: __OMO_<ID>_DENY__`（sentinel 名带行 id，恰好一次护栏原样适用）；
- 渲染器按 roster.ts 的条目类计算内容——只读类 = `[write, edit]` + 全部委派 toolName，worker 类 = 全部委派 toolName——替换为 YAML flow sequence（名字 JSON-quote 防注入，既有 agentOptions 渲染同款纪律）；
- atlas（orchestrator）**不写 toolFilter 键**（缺省合法；配置存在但两键皆空才 throw——基准表 §3）；multimodal-looker 的 `allow: [read, read_image]` 是静态 YAML（名单短；`read_image` 条件注册的漂移风险入 R-9，Q-3 决定是否需补 deny 委派名）；
- 被否决的替代：静态 YAML 全列表（加 agent 改 N 行的维护地雷）、单一共享哨兵串（与恰好一次护栏冲突）、YAML anchor（loader 的 JSON_SCHEMA 方言不支持合并键，且锚点同样难逃全量书写）。

**委派工具名的字符集**：`plan-consultant` / `plan-reviewer` 含连字符。OpenAI 兼容 tool name 模式 `^[a-zA-Z0-9_-]{1,64}$` 允许连字符；P2-T1 在 installed dsh 与 probe 冷启动中双重核实（R-1）。

### 4.5 委派绑定：指挥看得到什么、atlas 例外

"agent 间的委派绑定"在本项目的 DSH 形态下分解为三件事：

1. **指挥 → 10 个委派目标**：delegation 组的 10 个 `dsh-tool-subagent` 实例行本身即绑定（形态 A，可行性报告 §12.4）。`backgroundMode: continuable` **全员**沿用 explore 先例——决策记录（为何不 per-class 取 one-shot）：① OMO v5 把 `run_in_background=true` 升格为 "the standard spawn"（调查报告 §4.3），continuable 是其 DSH 对应物；② oracle 上游 prompt 明确支持 "follow-up questions via session continuation"，one-shot 会砍掉这类追问能力；③ 全员统一省去 per-class 心智分叉。**代价明示**：librarian / multimodal-looker / plan-reviewer 类无状态一次性任务常驻槽位，压力记入 Q-4——若 Q-4 实测咬人，per-class `one-shot` 是现成 fallback（改 YAML 单字段即可），届时按 DoD-d 回填。
2. **指挥的"名册委派表"**：OMO 的 sisyphus prompt 有从 `agentMetadata`（useWhen/avoidWhen/triggers/cost/keyTrigger）动态生成的 Delegation Table / Tool Selection / Key Triggers 段落。移植为 `system-sections/delegation-roster.md`——一张静态 markdown 表：每 agent 的域、何时派、何时不派、成本档（FREE/CHEAP/EXPENSIVE 取自上游元数据）。插入 `SISYPHUS_SECTION_ORDER` 的 `delegationDiscipline` 之后（第 5 段），快照同步更新。内容源自上游 `agents/types.ts` 的 `AgentPromptMetadata` 与各 agent 文件的 `*_PROMPT_METADATA`（署名头标注）。
3. **atlas 的再委派**：atlas 行不 deny 委派工具 + `maxDepth: 2`（指挥 depth 0 → atlas depth 1 → worker depth 2）。e2e 正向场景证明此链路（§4.7）。其余 agent `maxDepth: 1` + 全量 deny，嵌套委派**物理不可能**（AC-6b 模式的推广）。

### 4.6 路由默认：DeepSeek 系优先的三席位

R1 分期策略（DeepSeek 系路由优先）+ OMO 模型链的角色语义（强/快/视觉），映射到当前部署已注册的**两个 adapter 上的三条席位路由**（强座与视觉座同属 `deepseek-official`，快座走 pi-ai `deepseek`）：

| 席位 | 路由默认 | 承担 agent | OMO 链首参照（v4.19.4） |
|---|---|---|---|
| **强座** | `deepseek-official / deepseek-v4-pro` | sisyphus（既有）、hephaestus、oracle、plan-consultant、plan-reviewer、atlas、prometheus | claude-opus-5 / gpt-5.6-sol 系 |
| **快座** | `deepseek / deepseek-v4-flash`（pi-ai） | explore（既有）、librarian、sisyphus-junior | gpt-5.6-luna-fast / deepseek-v4-flash 系 |
| **视觉座** | `deepseek-official / deepseek-v4-flash-vision-exp` | multimodal-looker | gpt-5.6-sol low / glm-4.6v 系 |

- 视觉座的依据：`deepseek-v4-flash-vision-exp` **同时在两个 catalog 实有**（2026-09-11 评审实测）：`dsh-llm-deepseek` 的 DEFAULT_MODELS（4 个 id 之一，`inputModalities: ["text","image"]`，lib/index.js:1864 附近）与 pi-ai builtin `deepseek` 路由（`@earendil-works/pi-ai` deepseek.json，共 3 个 id）——DeepSeek 系内可满足视觉需求，R1 不破例；且**默认提供方选 `deepseek-official`**：该 adapter 由 base composition 在每个 shipped profile 注册（无 settings 依赖），pi-ai 路由则需 `$DSH_HOME/settings.yaml` 的 `llm-pi-ai.providers.deepseek` 段——R-4 的回退同理优先落在已注册侧（见 §6）。
- **"模型链留在配置而非硬编码"的落法**：OMO 的 fallback 链机制不移植（DSH 无 fallback，`model-unavailable` 即 error——可行性报告 §12.5 已裁定）；链知识以两处配置形态留存：① 名册基准表的"OMO 链首参照"列（认知）；② 每 agent 的 env 覆盖对 `OMO_<AGENT>_PROVIDER/MODEL`（行动）。retry/fallback wrapper 明确**不在**本阶段（Phase 7 硬化候选）。
- **校验规则**：每字段空值 throw（既有）；保留 sisyphus≠explore 硬预检（AC-5 的语义内核="协奏必须真是双模型"，席位制下依然成立）。两条**非阻断**路由值警告（名册化后硬门仅一条偏弱，warn 补位但不越权升级为 throw）：① 全员（11 条）同一路由——配置异味；② **全部委派 agent（10 条）同座**——强座 7 个 agent 之类的单点集中，席位制下合法但值得提示。第三条警告在**运行时层**（`resolveModelRoutes` 之外的 boot 检查）：apply() 时查 llm 服务，11 条路由中 provider 未注册者打 `route provider not registered` 非阻断行——注册 keyless 且可热加载故不阻断（T16/§4.7 probe 行；缺 pi-ai 段的部署否则到委派时才 `model-unavailable`，会话级失败而非 boot 可见）。
- **默认即文档**：`DEFAULT_MODEL_ROUTES` 每条的注释写明 OMO 链首与选座理由（model-routes.ts 既有"documented defaults"纪律）。

### 4.7 门与 e2e 扩展

退出标准 a（每 agent 可经指挥调用 + 路由可观测）与 b（名册快照常绿）落到既有 8 门链的扩展，**不加新门、不绕过旧门**：

| 层 | 扩展内容 |
|---|---|
| **L1 单测（门 2）** | ① roster.ts 与渲染后 composition 的一致性：每个 roster 条目 ↔ 恰好一行 `dsh-tool-subagent` 实例（toolName 相等、哨兵全部渲染、deny/allow 与类匹配、maxDepth 正确）——**名册快照测试**，签入 `tests/omo-agents/__snapshots__/roster.md`（结构化清单，非整份 composition）；② 9 个 persona 快照（§4.3）；③ resolveModelRoutes 的名册解析（默认值/空值 throw/env 覆盖/AC-5 预检）；④ 逐行 deny 哨兵渲染（恰好一次护栏、JSON-quote、按类内容）。 |
| **e2e（门 3）** | 新增 3 个 scenario，复用既有 mock-LLM 与沙箱：① **roster-parade**：mock 剧本让指挥**并行**调用全部 10 个委派工具，每子级回答后指挥总结；断言 10 个子级各自运行、session log 中每子级的 `{provider, model}` 等于其配置座（AC-5 模式推广——e2e 沙箱用 env 覆盖把 10 个 agent 分布到**真实可服务的可区分路由对**：`deepseek-official` 默认 catalog 固定 4 个 id——`deepseek-flash` / `deepseek-v4-flash` / `deepseek-v4-pro` / `deepseek-v4-flash-vision-exp`（`dsh-llm-deepseek/lib/index.js` DEFAULT_MODELS:1841；config `models:` 可覆盖但 e2e 不依赖），pi-ai builtin `deepseek` 路由另有 3 个 id（`@earendil-works/pi-ai` deepseek.json：`deepseek-v4-pro` / `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp`，评审实测）——两侧合计 **7 个真实对**可分配；**不用假 id** 的诚实理由：`session/model-unavailable` 只由 session-controller 的选模型路径抛出（lib 628/743），deepseek adapter 请求期**不**校验 model，mock baseURL 下假 id 机械可行——但那样"路由可观测"断言将失去"路由真实可服务"的意义）。② **plan-reviewer-write-denied**（只读类代表，AC-6a 模式推广）；③ **atlas-nested-delegation**：指挥 → atlas → explore 的正向链（depth 2 合法）——**对照语义注意**：F1 之后既有 explore 嵌套场景断的是"未知工具**物理缺席**"（depth 门不再触发），正向链对照的是这个物理缺席语义，**不是** maxDepth 报错文案，实施者不得照搬旧断言。⚠️ **MOCKROLE 机制必须先泛化**（前置子任务，详见 P2-T18）：`tests/e2e/drive.mjs` 的 `MOCKROLE_BLOCK_SCALARS` 硬编码 2 条且 `appendMockRoleMarker` 对未知 role throw、用 `String.replace` 打**首个** needle 命中——10 行 persona 都渲染为 `persona: |-` 后该 needle 失唯一性，现有注入会打错行；`mock-llm-server.mjs` 的 `detectRole` 是"首个含 MOCKROLE= 的 system message 胜出"、剧本以 role 为键。泛化 = 注册表 roster 驱动 + needle 改行 id 锚点（每行 `id: tool-subagent-<id>` 唯一）+ 与 detectRole 首匹配顺序相容。 |
| **doctor-lite（门 4）** | `validateCompositionRows` **已对每行跑 Config schema**（doctor-lite.mjs:407 起逐行循环）——现状不缺逐行 schema 校验，缺的是**逐行契约断言**（每行的 toolName/filter/maxDepth/哨兵渲染结果符合名册类）。本阶段把校验从"逐行 schema 合法"扩展为"逐行契约断言"，直接响应 0.1.5-rc.1 复核的 P1 教训（挂掉的那行没有任何 schema 门——语义门仍是空白）。 |
| **concerto-static（门 6）** | c01–c09 断在归档路径（1+1 冻结，不动）；**c10 泛化**：live 路径的加固断言从"无通用行 + deny [write, edit, explore] + maxDepth 1"泛化为名册类断言（每类的 deny/allow/maxDepth 形状 + delegation 组 = 12 行名单 + 无通用/产品行）。 |
| **probe（门 8 run-proofs）** | `concerto-mode-probe.sh` 的 boot marker 断言扩展到 10 个 persona assembled 行 + 路由汇总行 + 三条警告行（§4.6/T16），并新增**运行时层断言：11 条路由的 provider 在 POST /api/llm.providers 均 active**——现有 probe 只断言两个既有 provider，名册化后缺 pi-ai 段的部署会让快座子级到**被委派时**才 `model-unavailable`（会话级失败而非 boot 失败）；此断言把"可审计"从配置层推到运行时层，是退出标准 a 的补强。`prove-route-logging.mjs` 扩展到名册路由。 |

**L4 真模型手动冒烟**（非 CI）：一次手工 run 核对指挥真实选择 2–3 个新 agent（含 multimodal-looker 的图片输入若 key 可用）；证据进 `.omo/evidence/`（gitignored），结论回填任务清单。

### 4.8 归档路径与 installer 的处置（分歧记录）

`patches/omo-dsh/omo-agents-current/` 是 v0.2 时代的**冻结归档**（动态插件 conc-1 的 verbatim 存档），`scripts/install-concerto.sh` 从 release tag 取它的 `preset/` 装给用户。本阶段**不**再生成归档（那是手工 runtime 流程的产物），因此：

- installer 用户拿到的仍是 **1+1 preset**——README / install-concerto 文档加注："完整名册随未来 release 提供"（措辞任务 P2-T21）；
- 静态门 c01–c09 继续钉死归档的 1+1 形状（不变即绿）；
- 是否/何时把新名册下发到 installer 通道，由 Phase 7 发布节奏按 D13 决定（可能以新机制取代 conc-1 归档，不在本阶段预判）。

### 4.9 署名与合规

- `THIRD_PARTY_NOTICES.md` 新增 "Phase 2 persona semantic ports" 小节：**逐文件**列出 9 个 persona markdown + `delegation-roster.md`，每行标注上游来源文件（tag 路径）与"语义移植"处置（沿用 D15 逐文件精神到非 vendor 的派生内容；explore-persona.md 等既有 4 个文件一并补登，使 OMO 派生内容清单完整）。
- 每个新 persona 文件的 HTML 注释署名头（§4.3 纪律 2）。
- 本阶段不新增 npm 依赖、不动 vendor/：`verify-licenses` 的 `checked` 计数应**不变**（任务清单判定项）。

## 5. 退出标准与证据

ROADMAP §4 Phase 2 给出 2 条退出标准，逐条落到可执行证据：

| # | ROADMAP 原文 | 证据（本计划的关键判定） |
|---|---|---|
| **a** | 每个 agent 可经指挥调用、其路由在会话日志可观测（AC-5 模式推广） | e2e **roster-parade** 场景 PASS：10 个子级全部真实运行（非缺席）、session log 断言每子级 `{provider, model}` == 其 env 配置座；probe 的 boot 路由汇总行；L4 手工 run 记录 |
| **b** | 名册快照测试常绿 | 门 2 内：roster.md 结构快照 + 9 个 persona 快照全部签入且 PASS；快照非空（防"未收集"假绿，Phase 1 R-5 教训） |

**DoD 补充**（ROADMAP 未明说、由仓库规则推出，沿用 Phase 1 e/f/g）：

- **c**：`scripts/ci-local.sh` 全 8 门绿（任何既有门不得变红；门扩展只加严不放松——c10 泛化后断言数不得少于现状）。**c10 现状基线（可比对象）**：4 类断言——① 无通用委派行（`subagent`/`subagent_fork`）；② 恰好 1 个 explore 行；③ 其 deny ⊇ `{write, edit, explore}`；④ 其 maxDepth == 1。**泛化目标清单**：① 无通用/产品行（保留）；② delegation 组 == 12 行名单（control / list-agents / 10 个 `tool-subagent-<id>`）；③ 四类行的 filter 形状逐类断言（只读 6 行 deny 含 write/edit+全委派名，worker 2 行 deny 全委派名，atlas 无 filter 键，multimodal-looker allow == [read, read_image]）；④ maxDepth 逐类断言（atlas 2，其余 1）。
- **d**：本计划目录文档与实测无冲突——凡实测推翻计划假设处（如 P2-T1 核实的上游限制表与基准表不符），改文档而不是改结论。
- **e**：未移除任何既有署名；`verify-licenses` 的 `checked` 计数与基线一致（52）；`THIRD_PARTY_NOTICES.md` 既有条目只增不改。

**明确不属于退出标准**（避免范围蔓延）：

- ❌ atlas 的 `/ulw-execute` 激活流、prometheus 的 `/ulw-plan` 访谈流（Phase 4）
- ❌ 模型 fallback 链 / retry wrapper（Phase 7 硬化候选）
- ❌ category 体系与 sisyphus-junior 的路由中介功能（Phase 5 邻域）
- ❌ Team Mode 成员资格语义（只读 agent 禁入 team 等，Phase 5）
- ❌ **11 条互异路由的默认分布**——默认 = 三席位复用（强座 7 agent / 快座 3 / 视觉座 1），"每 agent 独立路由"指的是**独立的可覆盖绑定**（env 对），不是默认互异；"不赌单一模型"由指挥-子级双座（AC-5 预检）+ 可覆盖性兑现，不由默认值兑现
- ❌ installer 通道的名册下发（§4.8，Phase 7 决策）
- ❌ v5 ulw-loop reviewer 三人组 / Kibitzer（senpi 独占，ROADMAP 未列入）

## 6. 风险与开放问题

| # | 风险 / 问题 | 影响 | 处置 |
|---|---|---|---|
| **R-1** | **裸工具名冲突或字符集被拒**：10 个裸名（`oracle`、`plan-consultant`…）与未来 dsh 内建撞名；连字符名被某 adapter 拒绝 | 中 | P2-T1 双重核实（installed dsh schema + probe 冷启动注册成功）；名册快照 + c10 钉死全工具名单，撞名即红。若连字符被拒，fallback 为下划线名并记坑。裸名（vs `omo-` 前缀）的理由：OMO `task(subagent_type=…)` 与 v5 curated 名同款，委派表可读性；归档路径的 `call_omo_explore` 是另一机制的命名，不混用 |
| **R-2** | **上游限制表复核与基准表不符**（grep 初核可能漏看了子目录 agent 的完整 permission 构造，如 hephaestus/atlas 的动态 config） | 中（镜像失真） | P2-T1 逐文件核对 v4.19.4 的 permission 实际值，回填[名册基准表](./phase2-roster.md)；不符处改基准表（DoD-d） |
| **R-3** | **persona 浓缩失真**：9 篇移植砍掉 harness 特定内容后语义走样（如 hephaestus 的 GPT 原生设定在 DeepSeek 座上的保真度） | 中 | 每 persona 快照评审时对照上游 prompt 逐节核对；hephaestus 保真度风险显式记入基准表适配注记；L4 手工 run 观察真实行为 |
| **R-4** | **视觉座不可用**：`deepseek-v4-flash-vision-exp` 在 pinned dsh catalog 中缺失/不可用，或部署 key 不支持 | 中（概率下调：该 id **已实测**同在 deepseek-official DEFAULT_MODELS 与 pi-ai builtin catalog，§4.6；残余风险 = 部署 key/配额不服务该模型 + ~~工具白名单一侧~~——后者已由 H-1 修复闭环：`allow: [read, read_image]` 保住视觉入口） | P2-T1 在 pinned dsh 复核 catalog；不可用时默认路由**退回 `deepseek-official / deepseek-v4-flash`**（base composition 已注册的 adapter，**不**退回依赖 settings 的 pi-ai 快座——否则"视觉不可用"连坐成"整条路由不可用"）+ env 覆盖留口，记坑；e2e 不依赖真实视觉（mock 文本回） |
| **R-5** | **10 个委派工具描述 + 名册段显著抬高指挥每步 prompt 成本** | 低-中 | 工具描述由 dsh 自动生成（form A 不可自定义，P-4/P-5 已记录）；persona 浓缩纪律（§4.3-5）控制总量；接受成本为协奏姿态的固有代价，优化属 Phase 7 |
| **R-6** | **e2e mock 剧本复杂度 + MOCKROLE 机制放不下 10 个 persona**（评审实测：`MOCKROLE_BLOCK_SCALARS` 硬编码 2 条、未知 role throw、`String.replace` 打首个 needle——10 行 `persona: |-` 使 needle 失唯一性；`detectRole` 首匹配胜出、剧本以 role 为键） | 中 | MOCKROLE 泛化为 P2-T18 的**显式子任务**（注册表 roster 驱动 + needle 改行 id 锚点 + detectRole 首匹配相容，§4.7）；剧本按 role 分流（每委派 lane 独立 MOCKROLE=<agent>）；断言数据来自 session JSONL（既有通道） |
| **R-7** | **deny 哨兵渲染 bug**（漏渲染/双渲染导致 YAML 非法或 filter 为空→throw） | 低-中 | `replaceSentinelOnce` 恰好一次护栏推广；单测覆盖渲染结果；doctor-lite 每行 schema 校验兜底 |
| **R-8** | **本阶段产出被误解为"完整 OMO 编排已可用"** | 低（沟通） | README/CHANGELOG 措辞写明：名册完整 ≠ `/ulw-*` 命令面（Phase 4）≠ Team Mode（Phase 5） |
| **R-9** | **filter 名字集合与 composition 漂移**：`tools.restrict()` 对**未注册名** throw（`dsh-tools/lib/index.js`:2801-2803）——deny/allow 里的名字必须是当前 composition 已注册的工具名；`read_image` 是**条件注册**（attachments 未挂则不存在），委派 toolName 被改/被删同理 | 中 | 与 R-7 区分：R-7 是渲染 bug，本条是名字集合 ↔ composition 漂移。处置：deny/allow 名单由 roster.ts 计算（与行同源，§4.4）；`read_image` 一类条件注册名在基准表 §3 标注；doctor-lite 逐行契约断言（§4.7）+ 名册快照钉住名单；c10 泛化断言 allow == [read, read_image] |

### 开放问题（实施中回答，不阻塞启动）

| # | 问题 | 何时回答 |
|---|---|---|
| Q-1 | concerto 子会话实际可用的读媒体工具名集合（`read` 是否可读图片？有无独立 `read_image`？）——决定 multimodal-looker 的 allowlist 精确值 | ✅ **评审实测闭环（2026-09-11）**：`read` 纯文本、`read_image` 独立且条件注册（§4.4 实证段）→ allowlist = `[read, read_image]`。P2-T1 仅在 pinned dsh 上复核行号引用 |
| Q-2 | 上游 hephaestus/atlas/sisyphus-junior/prometheus 在 v4.19.4 的完整 permission 构造（含动态 config 分支） | P2-T1 |
| Q-3 | `dsh-tool-subagent` 的 `toolFilter.allow` 与 `deny` 同时给出时的行为（multimodal-looker 是否需要显式 deny 委派名作为深度防御） | P2-T1（读 installed lib）+ P2-T17（单测钉住） |
| Q-4 | 10 个 `continuable` 子级的 resident-child 上限是否构成 parade 场景瓶颈 | P2-T18（e2e 实测；若受限，parade 分批断言） |

## 7. 工作包与估算

按 ROADMAP §7 的定性惯例（无 buffer、非承诺，R3），仅给工作量级：

| 工作包 | 内容 | 任务 | 量级 |
|---|---|---|---|
| **WP-0 调研核对** | 上游 v4.19.4 名册事实复核 + installed dsh 机制核实 | P2-T1 | ~0.5 天 |
| **WP-1 名册事实源** | roster.ts + model-routes 名册化 | P2-T2 … P2-T3 | ~0.5 天 |
| **WP-2 Persona 移植** | builder 泛化 + 9 篇 persona + 快照 + 名册委派表 | P2-T4 … P2-T14 | ~2.5 天 |
| **WP-3 Composition 扩展** | 模板 9 行 + 逐行 deny 哨兵 + apply 接线 | P2-T15 … P2-T16 | ~1 天 |
| **WP-4 门与 e2e** | 名册快照测试、静态门/doctor/probe 扩展、MOCKROLE 泛化 + 3 个 e2e 场景 | P2-T17 … P2-T20 | ~1.5 天 |
| **WP-5 收口** | 署名、README/docs、退出标准核对 | P2-T21 … P2-T22 | ~0.5 天 |

**合计 ≈ 6.5–7 人日**。体量主体在 WP-2（9 篇语义移植的核对成本）与 WP-4（MOCKROLE 泛化 + e2e 剧本，评审后 T18 +2h）。

## 8. 交付物清单

| 交付物 | 路径 | 类型 |
|---|---|---|
| 名册事实源 | `patches/omo-dsh/omo-agents/src/roster.ts`（新增）· `model-routes.ts`（名册化）· `persona-prompts.ts`（builder 泛化） | 代码 |
| 9 篇 persona + 名册委派表 | `patches/omo-dsh/omo-agents/system-sections/<id>-persona.md` × 9 + `delegation-roster.md` | 内容 |
| Composition | `patches/omo-dsh/omo-agents/concerto/agent.cordis.yml`（delegation 组 12 行 + 逐行 deny 哨兵）· `concerto-preset.ts`（名册驱动渲染）· `index.ts`（boot marker） | 配置/代码 |
| 测试 | `tests/omo-agents/__snapshots__/`（9 persona + roster.md）· 名册一致性测试 · e2e 3 个新 scenario（`tests/e2e/drive.mjs`） | 测试 |
| 门扩展 | `scripts/verify-concerto-static.mjs`（c10 泛化）· `doctor-lite-core.ts`（每行校验）· `concerto-mode-probe.sh` / `prove-route-logging.mjs`（名册 marker） | 配置 |
| 署名 | `THIRD_PARTY_NOTICES.md` 新增 Phase 2 小节 + 每文件署名头 | 合规 |
| 说明 | `README*.md` / `docs/install-concerto*.md`（installer 分歧注记）· **`README*.md` 协奏节新增"名册路由与 env 覆盖表"**（11 agent × 席位 × `OMO_*` env 对——部署前可查"模型链留在配置"的操作面，ROADMAP 关键约束的落地证据）· `CHANGELOG.md` · `docs/mvp-pitfalls*.md`（新坑，如有） | 文档 |
| **本计划目录** | `docs/plans/phase2-dev/phase2-plan.md`（本文）· [`phase2-tasks.md`](./phase2-tasks.md) · [`phase2-roster.md`](./phase2-roster.md) | 文档 |

## 9. 与后续阶段的关系

- **Phase 3（hook 移植）**：start-work hook 读 `ulw-execute` 语义时，其激活目标 atlas 已就位；todo/goal 执行器 hook 的注入面（`agent/pre-step` listener）已覆盖全名册。
- **Phase 4（slash 命令与 skills）**：`/ulw-plan` 的 Prometheus/plan-consultant/plan-reviewer 评审流、`/ulw-execute` 的 atlas 编排流，消费本阶段的 agent 与 maxDepth 2 绑定；命令注册不改变 agent 定义。
- **Phase 5（Team Mode）**：只读 agent 禁入 team 的成员资格语义（v5 member-validator）以本阶段名册的 `class` 字段为输入；category worker 概念与 sisyphus-junior 的定位届时重议。
- **Phase 6（MCP 与编辑）**：multimodal-looker 的真实视觉链路与 LSP/ast-grep 的工具面扩展在本阶段名册上叠加。
- **Phase 7（硬化）**：fallback wrapper、installer 名册下发、O3/O5 决策。
