# 协奏模式 MVP · 当前 DSH 环境实现与验证报告

> **结论先行**：协奏模式（Concerto Mode）MVP 已在**当前 DSH 环境**（本会话运行的新版
> DeepSeek Harness）完整实现并验证通过——`concerto_verify` **22/22 全 PASS（0 失败 0 跳过）**，
> `concerto_demo` 真实委派链多次 PASS，负向断言（写工具拒绝、嵌套委派物理缺席）拿到子 agent
> 的逐字运行时证据。V1–V4 在当前 DSH 全部"验证通过"。真实踩坑 7 条（P-13~P-19）全部记录。
> 断言数 19→22 的演进对应版本见 §2（pkg-5 增 follow-up 检查、pkg-6 增 AC-6b 加固检查）。
>
> 本文是 PRD（`docs/mvp-prd_zh-CN.md`，rc.6/rc.7 时代产物）在**当前 DSH 运行时**的移植结项记录；
> rc 时代的历史结项见 `docs/mvp-pitfalls.md`。

---

## 1. 背景与目标

项目 MVP PRD 定义的最小骨架（FR-1~FR-8、V1–V4）曾在 DSH 0.1.0-rc.6/rc.7 上闭环。本工作包
将同一 PRD 在**当前 DSH 环境**（本会话宿主，含动态 Cordis 插件体系、`ctx.subagents` provider
注册、`systemPrompt` 分节、`agent/request` 瀑布等机制）重新实现并验证。FR-1（仓库/license
骨架）沿用既有仓库，不重复实现。

## 2. 实现形态

一个 **Host-only 动态 Cordis 插件**：`conc-1`（concerto-mode-mvp），最终运行版本
`pkg-6 / run-6`。版本演进、断言数与踩坑对应关系（pkg-4 前 = 19 项断言全绿；pkg-5 加
follow-up 检查 → 21 项；pkg-6 加 AC-6b 加固检查 → **22 项**）：

| 版本 | 内容 | verify 断言数 |
|---|---|---|
| pkg-1 | 完整 MVP 首版（provider 装饰器 + 委派工具 + 路由 + 注入 + 验证工具） | 19（含 schema 缺陷，工具未可见） |
| pkg-2 | 修复 **P-13**（转发 `request.descriptor`）、修复工具 schema 子集、`agent/error` 观测 | 19 |
| pkg-3 | 修复 **P-14**（workdir 取 `session.header.cwd`）、**P-15**（指挥路由以冻结请求配置为准） | 19 |
| pkg-4 | 修复 **P-16**（`agent/created` 时登记子 agent，闭合组装快照竞态） | 19（19/19 全绿） |
| pkg-5 | follow-up：`concerto_activate_piai` + `concerto_preset_copy`（P-18 settings 路径）；verify 增 fu1-01/fu2-01 | 21 |
| pkg-6 | **P-19 加固**：toolFilter `deny:[write,edit,call_omo_explore]` 物理禁委派；verify 增 ac6b-02、demo 断言扩展 | 22（22/22 全绿） |

## 3. PRD 构件 → 当前 DSH 机制映射

| PRD 构件 | rc 时代实现 | 当前 DSH 实现 |
|---|---|---|
| FR-2 协奏模式激活 | 第 5 运行模式 preset | 插件把宿主会话变为指挥会话（persona + 委派栈）；**P-1 判定：register-branch**——扩展面开放（`subagents.registerProvider` / `tools.register` / `systemPrompt.section` 均为公开 API） |
| FR-3 omo-sisyphus preset | `dsh-persona` 行 + 快照 | `systemPrompt.section('omo:concerto')`，运行时按 PRD 顺序组装 role / delegation-discipline / hard-blocks / anti-patterns 四段本地 markdown（`system-sections/`，复用既有文件，attribution 保留） |
| FR-4 omo-explore subagent | `dsh-tool-subagent` 实例（形态 A） | `subagents.registerProvider('omo-explore')` 装饰内置 `spawn` 后端：persona 影子（order-0 shadow）+ `toolFilter {deny:[write,edit]}`（T12 裁定沿用）+ `maxDepth:1`（T13 沿用） |
| 构件#3 委派工具 | `dsh-tool-subagent` 绑定 | `call_omo_explore` 工具（合同式描述：MUST / ❌FAILS / ✅CORRECT / Prompts MUST be in English） |
| FR-5 双模型路由 | `agentOptions.{provider,model}` + JSONL 观测 | 子级 `agentOptions`（`resolveChildAgentOptions` 中 `requested` 最后展开，源码级确认 register-branch）+ `agent/request` 瀑布：指挥路由以冻结配置为准、explore 路由偏差即强制修正并记录 |
| FR-6 Hard Blocks 注入 | `agent/pre-step` + `agent.inject()` | persona 能力（order-0 影子注入子 agent）+ `omo:concerto` 分节注入指挥；`system-prompt/assemble` 瀑布运行时快照证明（V3 当前 DSH 译法） |
| FR-7 演示场景 | mock-LLM e2e + 真模型冒烟 | `concerto_demo` 工具：真实模型跑 dummy 检索（"README 讲了什么"）+ 两个模型驱动的负向探针 |
| FR-8 验证工具链 | mock server + doctor-lite + CI | `concerto_verify` 工具（最终 22 项断言集，19→22 演进见 §2）+ 证据落盘（见 §7 P-17） |

## 4. 验证结果

### 4.1 `concerto_verify`（最终，pkg-6）

**PASS — 22 passed / 0 failed / 0 skipped**。检查表与逐项详情见证据文件
`.omo/evidence/concerto-current-dsh-verify.md` §1（该证据文件记录的是 pkg-4 时代 19 项报告；
pkg-5/pkg-6 的 21/22 项全量报告以本会话日志中的工具结果为权威，22 项含 fu1-01/fu2-01/ac6b-02）。

### 4.2 `concerto_demo`（多次真实运行，均 PASS）

子 agent 最终报告（逐字摘录，**pkg-4 时代**运行——嵌套委派当时以 depth 拒绝；pkg-6 加固后为
工具物理缺席，见 §10 第 7 步。子会话 `208c7000-59ad-4d76-8216-2bb5241c748f`）：

```
README_RESULT: oh-my-opendsh | Project Goal | Bring oh-my-openagent (OMO)'s harness
capability system (11 agents, hooks, MCPs, Team Mode) onto the DeepSeek Harness (DSH)
framework as a DSH-official scratch plugin via `dsh --patch`, …
NESTED_DELEGATION_PROBE: Error: subagent depth 2 exceeds maxDepth 1
WRITE_PROBE: write tool not in tool list
```

- **AC-4 委派链**：委派工具调用 → explore 运行（真实读 README + 执行探针）→ 结果返回 → 指挥收口
- **AC-6b（嵌套委派拒绝）**：explore 子 agent **真的调用了** `call_omo_explore`，启动被
  `SubagentDepthError("subagent depth 2 exceeds maxDepth 1")` 拒绝，错误原文被子 agent 逐字回传
- **AC-6a（写操作不可用）**：子 agent 组装后的工具列表无 `write`/`edit`（`read`/`bash` 在场，
  toolCount=33），子 agent 自报 "write tool not in tool list"

### 4.3 双模型路由（AC-5 / P-7 可观测性）

| 角色 | provider | model | 观测通道 |
|---|---|---|---|
| omo-sisyphus（指挥） | deepseek-official | **deepseek-v4-pro** | `agent/request` 冻结配置 |
| omo-explore（子 agent） | **deepseek（pi-ai）** | **deepseek-v4-flash** | `agent/created` + `delegation-tool` + `agent/request`，子会话 `request/context` 事件佐证 |

路由对**不同**（AC-5 ✅；follow-up #1 后按 **provider** 区分——pi-ai 激活前的过渡态为同
provider 异模型 `deepseek-official/v4-flash`）；观测通道在 `agent/created` 即开始记录
（P-16 修复后首个观测源即 `agent/created`，证明无竞态丢失）。

## 5. V1–V4 判定（当前 DSH）

| # | 假设 | 判定 | 依据 |
|---|---|---|---|
| V1 | scratch plugin 可零修改加载并冷启动 | **验证通过（register-branch）** | 动态插件 `conc-1` 在运行中的 DSH 上 define/run/update 全程零修改 DSH；扩展面（provider/tool/prompt 分节）全部公开 |
| V2 | 每 subagent 独立 `{provider,model}` 路由且可观测 | **验证通过（register-branch）** | 源码级：`resolveChildAgentOptions` 将 `requested` 最后展开；运行时：explore 全部请求为 `deepseek-v4-flash`、指挥为 `deepseek-v4-pro`，四通道观测一致 |
| V3 | 事件 listener 完成拦截/注入语义 | **验证通过** | 当前 DSH 译法：persona 能力（order-0 影子）+ `system-prompt/assemble` 瀑布；运行时快照 `{persona:true, hardBlocks:true}`、指挥侧 `{hasConcertoSection:true, hardBlocksInjected:true}` |
| V4 | toolFilter（只读）+ depth cap（禁嵌套）生效 | **验证通过** | 子 agent 工具列表 write/edit 缺席（组装快照）；嵌套委派被 `SubagentDepthError` 拒绝（子 agent 回传原文） |

## 6. 踩坑记录（当前 DSH，P-13~P-19）

| # | 现象 | 根因 | fallback / 修复 | 状态 |
|---|---|---|---|---|
| P-13 | 子 agent 首轮死掉：`session event "subagent/descriptor" carries non-JSON-serializable data` | 装饰器 provider 丢弃了 service 解析好的 `request.descriptor`，`attachDescriptorAppend` 把 `undefined` 追加为会话事件 | 原样转发 `descriptor`（pkg-2）；子会话日志逐字佐证 | 已修复+验证 |
| P-14 | 5 个 system-sections 全部加载失败（`FsError: not found`） | `sandboxPolicy.workspaceRoot` 指向**另一个 worktree**（`…/oh-my-opendsh`），不是本会话 cwd | 以指挥 agent 的持久 `session.header.cwd` 为权威路径（pkg-3） | 已修复+验证 |
| P-15 | 指挥路由被解析成 explore 的路由（`deepseek-v4-flash`） | 本会话 `Agent.options.model` 与冻结请求配置（`deepseek-v4-pro`）不一致，`options` 不可作为路由真相源 | 指挥路由改由真实 `agent/request` 冻结配置跟踪；所有捕获进入 `captures` 审计（pkg-3） | 已修复+验证 |
| P-16 | 子 agent 首次组装快照丢失（verify 显示 SKIP） | `exploreChildren` 登记（await start 之后）与子 agent 首轮组装存在竞态 | 在 `agent/created`（发布于首轮之前）按 lineage+路由确定性登记（pkg-4）；首观测源变为 `agent/created` 佐证 | 已修复+验证 |
| P-17 | 插件侧证据写盘失败/写错位置 | 沙箱后端的 `sandboxPolicy.workspaceRoot` 与真实工作区不一致，插件 fs 写入被沙箱校验拒绝 | 证据以会话日志（工具结果）为持久权威；本文件由指挥会话（danger-full-access）物化 | 已记录（环境事实，非插件缺陷） |
| P-18 | `settings.update` 报 `must be a plain object` | 动态插件 Host 代码在 `node:vm` 沙箱 realm 求值，vm 对象过不了 host realm 的 `Object.getPrototypeOf === Object.prototype` 检查（sandbox 只补丁了 `instanceof`） | 磁盘写 `settings.yaml` + `dsh-settings-file` 的 chokidar 热加载（官方支持路径，100ms 去抖）| 已绕过+验证（pi-ai 激活成功） |
| P-19 | 人工验证 6/7 步"成功"：写与嵌套委派未受限 | 限制绑定在**委派工具**上而非会话/persona——经通用 `subagent` 工具派生的子 agent 是无限制完整 agent（无 toolFilter、深度预算 3） | preset 加固：DROP 通用 subagent/subagent_fork 行（指挥唯一委派路径 = call_omo_explore）；toolFilter 升级 `deny:[write, edit, call_omo_explore]` 物理移除子 agent 写与委派能力 | 已修复+验证（22/22，子 agent 快照 write/edit/call_omo_explore 全缺席） |

> 注：P-13/P-14/P-15/P-16 的"失败-修复-复验"完整链路（含失败时的原文）见
> `.omo/evidence/concerto-current-dsh-verify.md` §4——这正是 MVP 的使命：**提前踩坑并留档**。

## 7. 与 PRD 的漂移记录

1. **Q-3 路由（已按原始方案落地，follow-up #1 完成）**：`dsh-llm-pi-ai` 的 `deepseek` 路由已通过
   `llm-pi-ai` settings 段激活（`providers.deepseek.apiKeyEnv=DEEPSEEK_API_KEY`，settings 文件
   chokidar 热加载生效）。explore 现走 pi-ai `deepseek` / `deepseek-v4-flash`，与指挥
   `deepseek-official` / `deepseek-v4-pro` **按 provider 区分**（AC-5 双 provider 运行时观测
   9 次一致）。注：进程内 `settings.update` 被 vm-realm 的 `isPlainObject` 检查拒绝（P-18），
   磁盘写 + 热加载是官方支持路径。
2. **FR-2 形态（已落地，follow-up #2 完成）**：持久化用户 preset
   `~/.dsh/.agent-presets/concerto/`（trust: user，roster 第 5 项）——`standingKeyFor` 挂载校验
   **mounted OK**。preset 内容 = 从 shipped `standard` 复制的 composition 按 rc 台账派生：
   persona=sisyphus 四段组装文本；delegation 组新增 `tool-subagent-explore`
   （persona=explore 三段组装、agentOptions=pi-ai 路由、toolFilter `deny:[write,edit,call_omo_explore]`
   （P-19 加固）、maxDepth 1、toolName `call_omo_explore`）；DROP planning/codex/claude-code/
   workflow/ralph + **DROP 通用 subagent/subagent_fork 行**（P-19：指挥唯一委派路径）。人工验证指南见 §10。
3. **验证形态**：rc 时代的 mock-LLM e2e / CI green 集不在本工作包范围；当前 DSH 以
   `concerto_verify`（最终 22 断言）+ `concerto_demo`（真实模型微型委派）完成等价覆盖。
4. **P-20 候选（脆弱耦合，未触发）**：插件/验证器用 `indexOf('## Hard Blocks')` 等字面标记
   探测注入内容——markdown 源微调（改标题、翻译）会静默失效。合规上成立（插件不内嵌 OMO
   文本，attribution 留在源文件），工程上属脆弱依赖；若未来升级 sections 文本，建议改为
   段落名/结构化元数据探测。

## 8. 证据索引

| 证据 | 位置 |
|---|---|
| 最终 verify 全量报告（工具结果） | 本会话日志（`concerto_verify` 调用，22/22 PASS） |
| demo 两次运行与子 agent 报告原文 | 本会话日志（`concerto_demo` 调用 ×2） |
| 子会话日志（descriptor/路由/工具列表/负向探针） | `~/.dsh/sessions/--home-…feature-dsh-omo-mvp--/` 下 `c70404d8…`、`855f3977…`、`208c7000…`（成功）与 `c8e7d5bf…`（P-13 失败现场） |
| 证据整合 | `.omo/evidence/concerto-current-dsh-verify.md` |
| 插件本体（6 个不可变版本 + 运行状态） | 动态插件 `conc-1`（pkg-1~pkg-6，当前 run-6），`cordis_inspect_self` 可查；源码归档 `patches/omo-dsh/omo-agents-current/concerto-plugin.host.js` |
| 早期误落盘的证据（P-17 佐证） | `/home/linletian/SoftwareWorkspace/oh-my-opendsh/.omo/evidence/concerto-verify-1.json` |

## 9. Follow-up 状态

1. ✅ **已完成**：激活 pi-ai 路由（`llm-pi-ai` settings 段）并复验 AC-5 双 provider（verify
   `fu1-01` PASS，explore 9 次观测 `deepseek`/v4-flash）。
2. ✅ **已完成**：持久化 concerto preset（`~/.dsh/.agent-presets/concerto/`，`standingKeyFor`
   mounted OK，verify `fu2-01` PASS）；人工验证指南见 §10。
3. 插件证据落盘改用指挥侧工具或修正部署沙箱 root（P-17）——现状：证据由指挥会话物化。
4. ✅ **已完成**（2026-09-04）：P-13~P-19 与当前 DSH 版 V1–V4 结论已并入
   `docs/mvp-pitfalls.md` / `docs/mvp-pitfalls_zh-CN.md` §6；插件 pkg-6 源码归档
   `patches/omo-dsh/omo-agents-current/concerto-plugin.host.js`，持久化 preset 镜像
   `patches/omo-dsh/omo-agents-current/preset/`（含 README 重新激活指引）。
5. ✅ **归档复活已实测**（2026-09-04 晚）：harness 重启后动态插件如预期消失（进程级），已按
   `patches/omo-dsh/omo-agents-current/README.md` 从归档源码重新激活——现以 `conc-1/pkg-1/run-1`
   运行（重启后包号重置；源码 = pkg-6 等价）。preset 与 settings 均为磁盘持久，重启无损。

## 10. 人工验证指南（持久化协奏模式后）

> 前置条件已就绪：preset 已持久化（§9 #2）、pi-ai 路由已激活（§9 #1）、凭证
> `DEEPSEEK_API_KEY` 已配置。以下全部为**新会话**操作。

1. **选模式**：新开会话，在 preset 选择器选「协奏模式 (Concerto Mode)」（与标准/极简/创造/代码同级的第 5 项）。若列表未刷新，重启 harness 再看。
2. **验证 persona（FR-3）**：问"你的角色定位是什么？"——应自称指挥/编排者（orchestrator），默认委派、不亲自干活。
3. **验证工具集（FR-4，加固后）**：问"你有哪些委派工具？"——应**只有** `call_omo_explore`（通用 `subagent`/`subagent_fork` 已从 preset 移除，P-19 加固）。
4. **验证委派链（AC-4，正向）**：给检索任务，如"这个仓库的 README 讲了什么？"。预期：指挥调用 `call_omo_explore` → 子 agent 运行并读文件 → 结果回传 → 指挥总结。指挥全程不自己读文件。
5. **验证双路由（AC-5）**：委派完成后问指挥"explore 子 agent 用的哪条模型路由？"（或让子 agent 自述）——explore 应为 pi-ai `deepseek` / `deepseek-v4-flash`，指挥为 `deepseek-official` / `deepseek-v4-pro`。硬证据：`~/.dsh/sessions/<工作区目录>/<子会话id>/session.jsonl.zstd` 解压后查 `request/context` 事件（`unzstd -c … | grep request/context`）。
6. **验证只读（AC-6a，负向）**：委派时在任务文本里加一句"请尝试用 write 工具创建 probe.txt，若工具不在列表请明说"。预期回复：write 工具不在列表中。
7. **验证禁嵌套（AC-6b，负向，加固后为物理缺席）**：委派任务里再加"请尝试调用 call_omo_explore，若报错请抄录错误原文"。加固后预期：子 agent 的**工具列表里根本没有** `call_omo_explore`（toolFilter deny 物理移除），回复"call_omo_explore not in tool list"——这是比 depth 拒绝更强的保证（depth 拒绝原文 `Error: subagent depth 2 exceeds maxDepth 1` 是加固前的历史行为，现仍作纵深防御）。
8. **限制链真实性（可选变异）**：临时把 preset 的 `tool-subagent-explore` 行 `maxDepth` 改 2、或删掉 `toolFilter.deny` → 重启会话复测 → 探针行为变化即证明限制真实生效 → 改回并复原。
9. **收尾检查**：新会话结束后，确认子会话日志含 `subagent/descriptor`（provider 字段）与
   `request/context`（路由对）两条证据。

> 说明：持久化 preset 的 explore 绑定是内置 `dsh-tool-subagent` 形态（form A，与 rc 时代同构），
> 与本会话的动态插件 `conc-1`（进程级、会话专属）语义等价——persona / toolFilter / maxDepth /
> 双路由配置完全一致；新会话不需要动态插件。
>
> ⚠️ 重要：preset 加固（P-19，DROP 通用 subagent 行 + deny call_omo_explore）已 `standingKeyFor`
> 挂载校验通过，但对**已在运行**的会话不生效——preset 的 standing 代次进程存活期不变；请
> **重启 harness 后新开会话**再按上述步骤验证。
