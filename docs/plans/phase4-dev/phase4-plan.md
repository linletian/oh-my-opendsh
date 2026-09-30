# Phase 4 开发计划：slash 命令与 skills

> **本目录**：[`docs/plans/phase4-dev/`](./) —— ROADMAP **Phase 4**（slash 命令与 skills）的实施计划。
>
> **上游依据**：[ROADMAP（中文）](../../roadmap_zh-CN.md) §4 Phase 4 · [决策 D14](../../decisions_zh-CN.md)（基线冻结）· [可行性报告 §2.2／§5.2／§16](../../feasibility-report_zh-CN.md) · [v5 架构调查](../../omo-v4.19.4-vs-v5.0.0-beta.53-architecture-investigation.md)（命令/skills 改名面）· [Phase 3 计划书](../phase3-dev/phase3-plan.md) §4.5/§9（ulw-execute 的 Phase 3/4 边界、deferred 项）
>
> **配套文档**：[任务清单](./phase4-tasks.md) · [命令与 skill 清单与覆盖基线](./phase4-commands.md)
>
> **状态**：📋 **计划已立项，待实施**。实施期实测对本文的回填、逐任务证据与退出标准核对见[任务清单](./phase4-tasks.md)。
>
> **修订记录**：
>
> - **2026-09-30 计划期评审修复**（评审：`phase4-review-temp.md`，全部 3 缺口 + 4 一致性问题经逐条源码/实树核验**成立**）——① §4.1 新增 omo-hooks manifest 五处硬耦合同步网（`EXPECTED_HOOK_COUNT` apply-throw / manifest.test.ts 三处 / `EXPECTED_SUMMARY_LINE` / c13 文件集合 / **c14 基线须扩为两文档并集 + ported 过滤**，首个 manifest 触碰任务同 commit 落地）；② §4.2 命令驱动机制改引同上下文先例 `invocation.agent.followup`（dsh-command-goal:98-105），steer 降为 turn-stopping 上下文对照；R-1 高→低-中，Q-1 收窄（throw settle 子项闭环）；③ §4.8/T7 对照组更正（未知命令 = 零事件零报错、落回普通 prompt，dsh-commands lib:293-299 明文）；④ §3 skill-badge 更正（默认 `disabled: true`，非挂载先例）；⑤ 接盘项编号 H-33/H-34 显式声明（延续 Phase 3 H 序列，映射 S-06/S-37）；⑥ §6 新增 R-11（计数断言/基线路径耦合类风险——初号 R-10，复评发现与 Phase 3 marker 同步 R-10 撞号后改号）；⑦ 覆盖基线 §6 统计口径更正（命令 6 + 关键词模式 1）；⑧ tasks T1 测试文件计数更正（keyword-detector 7 个 + feature 根 2 个纳入对账）。
> - **2026-09-30 复评修复（第 2 轮）**（评审 §6.3 两项新引入问题，核验成立）——A：新增风险 R-10 → **R-11**（本文 9 处 "R-10" 均指 Phase 3 的 marker 同步风险，本机编号 R-10 永缺以消除歧义；tasks T8/T12 同步改号）；B：§4.4 C-05/C-08 行与 §4.5/§4.6 标题 4 处 S-06/S-37 → 「H-33/H-34（原 Phase 3 S-06/S-37）」（§3/§9 的 S-06/S-37 为溯源标注，按评审 §6.4 保留）。**补**：§4.9 自指语境（清点 `phase4-commands.md` 自身行）同改 H-33/H-34 为主、溯源为辅——与 §3/§9 的纯溯源用法区分（用户指出，核验成立）。

---

## 1. 目标

**把 OMO 的命令面落到 DSH `ctx.commands` 与 `ctx.skills`：ultrawork 关键词模式、`/ulw-execute`、`/ulw-plan`、`/goal`（已由 `dsh-goal` 原生覆盖）、`/hyperplan`、stop-continuation、handoff、remove-ai-slops；连同 17 个 shared-skills 的内容（裸名，无 `shared/` 前缀，按 §16）——每条命令在脚本化场景中驱动预期 agent 行为，skill 加载原样复用 `dsh-skill`。**

ROADMAP §4 Phase 4 原文：

- **目标**：OMO 命令面落到 DSH `ctx.commands`：ultrawork 关键词模式、`/ulw-execute`、`/ulw-plan`、`/goal`（已由 `dsh-goal` 原生覆盖）、`/hyperplan`、stop-continuation、handoff、remove-ai-slops。
- **范围**：命令注册 + shared-skills 内容（17 个 skill，裸名——无 `shared/` 前缀，按 §16）。
- **退出标准**：每条命令在脚本化场景中驱动预期 agent 行为；skill 加载原样复用 `dsh-skill`。

本阶段的成功标志不是"多几个 `/` 命令"，而是：**OMO 的"人 → 编排"入口在 DSH 上闭环——用户敲 `/ulw-plan` 得到 Prometheus 访谈式规划、敲 `/ulw-execute` 激活 atlas 编排、敲 `/stop-continuation` 真实停掉全部续行机制、prompt 里写 `ulw` 关键词真实触发 ultrawork 绑定指令——每条路径都有 e2e 证明命令真实驱动了预期 agent 行为，且 17 个 skill 的内容经 `dsh-skill` 原生目录/加载面可被发现与调用。**

## 2. 上游依据与不可协商约束

本阶段受 ROADMAP §2（上游版本政策）与 §3（不可协商约束）同等约束。落到操作层面：

| 约束 | 来源 | 本阶段的具体含义 |
|---|---|---|
| **冻结基线 = OMO v4.19.4** | ROADMAP §2 规则 1 / D14 | 命令模板与 skill 内容来源 = v4.19.4 tag（commit `b072d279110bdda2c6ac2525d0d24dc54d16148a`，与 Phase 1/2/3 同一锚点）的 `packages/omo-opencode/src/features/builtin-commands/`、`packages/shared-skills/skills/`、`packages/omo-senpi/skills/{ultrawork,hyperplan}/`、`packages/omo-opencode/src/hooks/keyword-detector/`、`packages/omo-opencode/src/hooks/stop-continuation-guard/`；**只从 tag 取内容**（`git show v4.19.4:<path>`），不从工作树复制 |
| **命名锚点：start-work 按 v5 名 ulw-execute 读取** | ROADMAP §2 规则 6 / §4 Phase 4 | 命令名、skill 目录名、模板/persona/注入文案、文档一律用 **`ulw-execute`**；署名头与 NOTICES 注明 v4.19.4 源路径（`templates/start-work.ts`、`skills/start-work/`）。v4.19.4 的 shared-skills 已无 `shared/` 前缀（§16 勘误：前缀移除在 v4.19.4 已落地），裸名纪律只需维持 |
| **SUL-1.0 合规与署名** | ROADMAP §3 约束 1 / D10 / D15 | 本阶段有**两类产物，两种署名形态**：① 命令模板/handler/关键词检测 = **语义移植**（新写 DSH 代码，署名头 + NOTICES 逐文件列出，沿用 Phase 2/3 先例）；② 17 个 shared-skills + ultrawork/hyperplan 指令内容 = **内容 vendor**（SKILL.md 正文是上游版权内容，逐字搬运）——按 Phase 1 vendoring playbook 全套落地（per-file NOTICES、`VENDOR-MANIFEST.json` sha256、包级 `NOTICE.md`、license 字段），改名处记入 `deviations[]`（D15-c） |
| **不追 beta** | ROADMAP §2 规则 2 | 命令/skill 语义取自 v4.19.4；不取 v5.0.0-beta.* 的重构（如 v5 新增 senpi 原生 ulw-plan skill、mass-ulw 等）；v5 仅作为命名锚点来源 |
| **移植语义取自 harness-neutral core 层** | ROADMAP §3 约束 5 | 命令面恰恰在 opencode 适配层（`features/builtin-commands/` 依赖 opencode 的 `CommandDefinition` 形态）——**不可 vendor、也不应 vendor**；可移植的语义是模板文本、参数语法、agent 绑定与效果契约，形态 = 新写 DSH 命令 handler。skill 内容例外：shared-skills 包本身 harness-neutral（纯 markdown + 引用文件），按 vendor 处理 |
| **`verify-licenses` 常绿** | ROADMAP §3 约束 4 | vendor skills 会使 `checked` 计数变化——每个新 vendor 条目须有对应 NOTICES/manifest/license 字段（Phase 1 纪律）；纯命令代码不新增 npm 依赖 |
| **DSH 原生优先** | README 原则一 / ROADMAP §4 Phase 4 | `/goal` **不移植**——`dsh-goal` + `dsh-goal-round-driver` + `dsh-tool-goal` + `dsh-command-goal` 原生覆盖（可行性报告 §2.2）；skill 加载**不改写 `dsh-skill`**——内容投递走既有发现面（filesystem provider 根目录或 `ctx.skills.register`），退出标准 b 明示"原样复用"；凡 DSH 已有等价命令面的（如 `/compact` 之于 handoff 的压缩语义），逐命令判定并记录 |
| **非商业 / 不提 PR / 不移除署名** | ROADMAP §3 约束 2/3 / D8 / D5 | 无新增动作；既有署名条目只增不改 |

## 3. 现状盘点（Phase 3 结项基线）

Phase 0–3 交付的、本阶段直接复用的资产：

| 构件 | 现状 | Phase 4 的影响面 |
|---|---|---|
| **DSH 命令面（pinned 0.1.5-rc.1 实有）** | `ctx.commands.register({name, description, input:{hint,attachments}, handler})` → `CommandResult = {kind:success/error, text?, sourceEventSeq?}`；`command/run` + `command/done` 会话事件对（log-only，按 `commandId` 配对）；注册返回 disposer；原生先例 `dsh-command-goal`（lib:174 注册；**lib:98-105 `invocation.agent.followup(createUserMessage(...))` = 命令 handler 上下文驱动 agent 的同上下文先例**——`submitObjectiveAttachments` 把附件作为 user message 直接排队）与 `dsh-command-compact`（含 `ctx.effect` 生命周期 + 进行中操作收尾纪律）；**未知命令/语法不命中 = 返回 `undefined`，零事件零报错**（dsh-commands lib:293-299 注释明文 + :319-321 实现），行落回普通 prompt 路径 | **本阶段全部命令注册的形态**；`parseCommand` 的 name/rawInput 切分由 DSH 完成；handler 驱动 agent 行为 = `followup`（同上下文先例已实证），Q-1 收窄为时序/排队细节钉测 |
| **DSH skill 面（注册表/发现/模型面三行已挂载，零改动复用）** | `dsh-skill`（注册表：`ctx.skills.register` 嵌入注册 / `registerProvider` 提供者注册 / 按名 load）+ `dsh-skill-filesystem`（项目根 `.dsh/skills`、`.agents/skills` + `customSkillDirs` + 用户根；frontmatter `name`/`description`/`whenToUse`/`disable-model-invocation`/`user-invocable`；监听变更）+ `dsh-tool-skill`（模型面 `skill` 工具）——三行挂载于 dsh-base composition（cordis.patch.yml:273-284 区间）；同区间另有 `dsh-skill-badge` 行但**默认 `disabled: true`**（:279-281，可选 bundled provider，非挂载先例——其代码形态仅作嵌入注册的参考） | 退出标准 b 的载体；**user-invocable skill 是否已桥接为 slash 命令面（pinned 版本实测）= P4-T1 的 Q-3**；skill 内容投递机制选型 = Q-4 |
| **Phase 3 ulw-execute hook 语义（H-32）** | `omo-hooks` 已移植激活检测（DSH 原生形态：指挥委派 atlas + 工作计划意图 pre-step 检测）、计划发现、上下文构建、脚手架；激活 marker 常量三处与上游逐字对齐并登记为 R-10 对接点 | **`/ulw-execute` 命令模板落地时，模板 marker（`<session-context>` + `You are starting an Atlas work session.`）必须与 H-32 的激活检测对接**——R-10 的本阶段侧；常量漂移会造成双轨 |
| **Phase 3 deferred 项（本阶段接盘）** | S-06 `keyword-detector/`（**25 文件**，P4-T1 实测——计划期 24 少计 1；ultrawork/hyperplan/team 关键词模式）；S-37 `stop-continuation-guard/`（3 文件，服务形态 stop/isStopped/clear + 级联取消，消费面 = 本阶段命令） | 两者进入本阶段移植组（本阶段编号 **H-33/H-34**，映射见覆盖基线 §1.2）；team 关键词子模式随 Team Mode 再 deferred（Phase 5） |
| **todo-continuation-enforcer（H-03）** | omo-hooks 已移植（E 模式 steer 续行 + 进展复员熔断 cap 5） | `/stop-continuation` 的"停掉 todo 续行"语义需要 H-03 检查停止标记——**跨插件状态面的设计项**（§4.6） |
| **名册与编排面（Phase 2）** | 11 agent 名册 + maxDepth 2 委派（atlas 可再委派 worker）；prometheus 访谈对象已适配为指挥；plan-consultant/plan-reviewer 只读顾问就位 | `/ulw-execute` 的 atlas 绑定、`/ulw-plan` 的 prometheus 人格、ultrawork 指令引用的 reviewer 闸门——agent 目标全部已就位，命令面只做"激活与路由" |
| **e2e 基础设施** | `tests/e2e/drive.mjs` + mock-LLM：22 场景、tool_calls 批次、MOCKROLE 名册注入、session JSONL 断言通道、变异 QA 体例、self-test fabricated-log 门 | 命令场景的新通道：**drive 需要能"敲 slash 命令"**（`command/run` 事件断言）；skill 场景需断言 `skill` 工具调用或目录可见性 |
| **门链** | `scripts/ci-local.sh` 8 门全绿（门 2 = 976 单测、门 3 = 22 场景、门 5 `checked=54`、门 6 = 23 断言 c01–c14、门 8 = 6 proofs） | 全部保持绿；omo-commands / skills vendor 的静态断言与 probe marker **扩展既有门**，不加新门、不绕过旧门 |
| **挂载机制** | 根 `cordis.yml` 已有两个 `- insert:` 行（omo-agents + omo-hooks），doctor-lite check 2b 钉死 id 集合 | 第三个 insert 行（omo-commands）→ doctor-lite / 静态门 / probe 相应扩展（计数 2→3 是变异敏感点） |
| **Phase 1 vendoring 基建** | `patches/omo-dsh/vendor/` 布局 + `VENDOR-MANIFEST.json` + 包级 `NOTICE.md` + per-file NOTICES + `verify-licenses` SUL 名称门（D15/D16）+ vendoring-playbook 实录 | skills 内容 vendor 复用同一 playbook；`shared-skills` 为第二个 vendor 对象（第一个 = hashline-core） |
| **上游 OMO 检出** | `~/GithubRepo/oh-my-openagent`，v4.19.4 = `b072d279…` 只读可用 | P4-T1 逐模块复核的唯一来源 |

**命令面清单与 v4.19.4 实际树的对应（计划期草案，P4-T1 实测复核）**：ROADMAP 列了 8 个命令面目标；v4.19.4 的 `features/builtin-commands/` 实有 **7 个内建命令**（goal / refactor / start-work / stop-continuation / remove-ai-slops / handoff / hyperplan，types.ts 的封闭联合）；**`/ulw-plan` 不在内建命令里**——它是 shared-skill `ulw-plan`（OMO 经 claude-code 兼容面把 user-invocable skill 暴露为命令）；ultrawork 关键词模式不在 commands 里——它是 `hooks/keyword-detector/`。三处来源的事实已与 v4.19.4 树核对（计划期 `git ls-tree` 粗核），逐文件语义由 P4-T1 复核转实测。

## 4. 方案设计

### 4.1 插件拓扑：`omo-commands`（新）+ `omo-hooks`（扩容）

命令面与 skill 内容若散进既有插件会破坏各自的单一职责（omo-agents = 名册，omo-hooks = 行为护栏）。设计：

- **新包** `patches/omo-dsh/omo-commands/`（`@oh-my-opendsh/omo-commands`），host-only cordis 插件，布局镜像 omo-agents/omo-hooks（`package.json` / `tsconfig.host.json` / `src/index.ts` + 每命令一个 `src/commands/<name>.ts` + `src/templates/<name>.ts`）。
- **单一事实源 `src/manifest.ts`**（omo-hooks manifest 先例）：每个移植命令一条声明——`id`（v5 命名锚点适用处用 v5 名）、上游源路径（tag 相对路径，逐文件）、参数语法（argumentHint 语义）、agent 绑定、效果摘要、e2e 场景名、状态。覆盖清单文档由 manifest **派生核对**（一致性单测防漂移）。
- **挂载**：根 `cordis.yml` 第三个 `- insert:` 行（`id: omo-commands`）；cold-start / probe / doctor-lite / 静态门相应扩展（计数 2→3 是变异敏感网，须同 commit 同步）。
- **boot marker**：`[omo-commands] command <id> registered` 逐命令一行 + 汇总行（probe 断言锚点）；loud-but-non-fatal 纪律（单命令注册失败不拖垮其余）。
- **omo-hooks 扩容**：keyword-detector（模式 A pre-step 注入）与 stop-continuation-guard（状态服务）住 omo-hooks——Phase 3 计划 §9 已明示"keyword-detector 与本阶段移植的 pre-step 注入面共享注册处"。两插件无相互 import；跨插件状态（停止标记）经 **cordis 服务**共享（§4.6）。两模块的 Phase 4 编号为 **H-33（keyword-detector，原 Phase 3 S-06）/ H-34（stop-continuation-guard，原 S-37）**——延续 Phase 3 H-01…H-32 序列的新 H 号段，归 Phase 4 拥有，映射与解析契约见[覆盖基线](./phase4-commands.md) §1.2。
- ⚠️ **omo-hooks manifest 的既有硬耦合（计划期实测定案，违者破门/破启动）**：`EXPECTED_HOOK_COUNT = 14`（manifest.ts:172）被 `validateManifest()` 在 **apply 时**强制（index.ts:501，不等 `entries.length` 即 throw）——新增条目不同步 bump = **boot 红，不是测试红**。同步网全清单（新增/删除 manifest 条目时必须同 commit 落地）：① `EXPECTED_HOOK_COUNT`；② `tests/omo-hooks/manifest.test.ts` 三处硬编码（:115 注释 / :126 `toBe(14)` / :370 错误文案）；③ `tests/omo-hooks/registration.test.ts` 的 `EXPECTED_SUMMARY_LINE`（按事件计数派生，新条目的事件归属改变计数）；④ 门 6 **c13**（`src/hooks/` 文件集合 ↔ manifest 双向一致 + 孤儿 .ts 规则——**非 manifest 条目的服务模块文件不得放 `src/hooks/` 下**）；⑤ 门 6 **c14**（基线文档硬编码 `COVERAGE_BASELINE_MD = phase3-hooks.md`，:75；解析器只吃 `## 1.`–`## 2.` 之间 `| H-\d+ |` 行、状态列含「已移植」，:673；且比对对象是**全部** manifest id，不按状态过滤——新增 pending 条目即报 `manifest ids absent from the phase3-hooks.md §1 port group`）。**c14 必须随首个 manifest 新增同 commit 演进**：基线来源扩为 `[phase3-hooks.md, phase4-commands.md]` 两文档并集 + manifest 侧改按 `status === 'ported'` 过滤（稳态断言强度不变——Phase 3 结项时 14 条目全 ported；pending 期条目不破门，翻转 commit 仍须文档/manifest 同改）。理由注释写入 gate 源码。H-34（服务形态）是否适格为 manifest 条目（无目标事件/模式字段）属实施期裁定——**若否，其文件放 `src/hooks/` 之外**（c13 安全）且其覆盖行不进 c14 解析面，计数网相应缩为 +1（P4-T8 任务书承载完整 fork）。
- **skill 内容**不进任何插件包——vendor 进 `patches/omo-dsh/vendor/shared-skills/`（Phase 1 布局），运行时投递机制见 §4.3。

### 4.2 命令注册机制：模板 → user message 的 DSH 形态

OMO 命令 = 模板文本（`<command-instruction>…</command-instruction>` 包裹）+ 可选 agent 绑定 + `$ARGUMENTS`/`$SESSION_ID`/`$TIMESTAMP` 占位符，opencode 把渲染后的模板当用户消息跑一轮。DSH 的 `ctx.commands` handler 只返回人看的 `CommandResult`——**"驱动 agent 行为"需要 handler 主动注入消息**。机制已有**同上下文原生先例**（计划期实测，R-1 据此降级）：

- **机制（P4-T1 Q-1 钉测闭环，形态定案 = 草案 a）**：handler 内 `invocation.agent.followup(createUserMessage(渲染后模板))`——同上下文先例 `dsh-command-goal/lib/index.js:98-105`。钉测结论（dsh-commands/lib/index.js）：`command/run`(:325) 先于 handler(:379) 追加、`command/done` 在 settle(:385) 后追加——followup 消息排在 `command/done` 之后、作为下一回合 user message 生效；agent 非 idle 时 followup 无条件 splice 进 next-turn inbox（**排队不丢弃**，dsh-agent-loop:783-791，仅 disposed 取消 park）；signal = withAbort(:124-140) 只停止等待不中断 handler，abort 经 settleThrown(:388-398) 记 `command/done` error 并原样抛。**降级（b）封存不用**。
- **对照（非先例）**：`agent.steer(createUserMessage(...))` 是 **`agent/turn-stopping` listener 上下文**的机制（Phase 3 E 模式，`dsh-hooks-claude-code/lib/index.js:292-307`）——写 inbox 供 driver 重读决定是否续行，与命令 handler 上下文时序语义不同，**不作为命令面先例引用**。
- **占位符渲染（P4-T1 Q-2 闭环）**：`$ARGUMENTS` = `invocation.rawInput`；invocation 仅 5 字段（`commandId/agent/rawInput/attachments/signal`，types.d.ts:18-34）——`$SESSION_ID` = `invocation.agent.id`（Agent.id 即 SessionId）、`$TIMESTAMP` = `Date.now()` 由 handler 派生；渲染 = 纯函数，单测钉死。OMO 侧替换器语义参考 = `hooks/auto-slash-command/executor.ts:20,89-99`。
- **agent 绑定**（start-work → atlas）：DSH 命令 API 无 per-command agent 字段（计划期实测 `CommandDefinition` 联合）——翻译 = 模板文本明确"你是 atlas / 指挥委派 atlas"，由 Phase 2 名册的既有委派链执行；`/ulw-execute` 模板 marker 与 H-32 激活检测的对接见 §4.7。
- **纪律**：handler 自包 try/catch；模板常量 apply 时一次构建（不在命令路径读盘——vendor 的 skill 内容例外，经 `ctx.skills.get` 原生面加载）；注册返回 disposer 归当前 Fiber；命令 handler 抛错 settle 为 `kind:'error'` 已是明文语义（`dsh-commands` types：thrown/aborted handler settles as `kind: 'error'`——Q-1 的该子项已闭环），单测钉死即可。

### 4.3 skills 内容 vendor 与投递

**Vendor（内容侧）**——17 个 shared-skills（`packages/shared-skills/skills/`，计划期统计 286 文件）+ 2 个 senpi 指令 skill（`omo-senpi/skills/ultrawork/`、`omo-senpi/skills/hyperplan/`，各 1 文件，供关键词模式与 `/hyperplan` 消费）：

- 按 Phase 1 playbook 从 v4.19.4 tag vendor 进 `patches/omo-dsh/vendor/shared-skills/`；`VENDOR-MANIFEST.json` 逐文件 sha256；包级 `NOTICE.md` + `THIRD_PARTY_NOTICES.md` per-file 署名；`license: "SUL-1.0"` 补字段（D15）；包名沿用上游 scope 纪律（D16 名称门）。
- **改名 = deviation**：`start-work/` → `ulw-execute/`（目录名 + SKILL.md 内 `name:` frontmatter + 正文引用），逐处记入 manifest `deviations[]`；`shared/` 前缀在 v4.19.4 已不存在（§16 勘误），无额外剥离动作。
- **frontmatter 适配**：DSH filesystem provider 要求 `name` + `description`（必需）+ 可选 `whenToUse`/`disable-model-invocation`/`user-invocable`；上游 SKILL.md 的 frontmatter 键集合由 P4-T1 逐文件核对，不适配处以 deviation 记录（不改语义，只补/改 frontmatter 键）。

**投递（运行时侧，P4-T1 Q-4 裁定 = 候选 b 修订形态）**——退出标准 b 要求"原样复用 `dsh-skill`"。裁定结果：

- **选定（b′）`ctx.skills.register` 嵌入注册 + vendor 路径**：apply 时从 vendor 目录读各 SKILL.md 正文，`ctx.skills.register({..., content, path: <vendor SKILL.md 绝对路径>})`——`path` 使 skill 的引用文件（如 ultimate-browsing 48 文件）保持磁盘可读；零 FS 副作用、cordis effect 自动注销、与 cwd/.git 无关（e2e 沙箱友好）、漂移检测经 vendor manifest + sha256 完整保留。注册归 omo-commands（或独立投递模块）的 Fiber。
- **否决（a）filesystem 物化**：findProjectRoot 靠 `.git` 向上探测（dsh-skill-filesystem:799-806），e2e 沙箱非 git 根时回退 cwd 自身——发现语义在 CI 沙箱不可控；`customSkillDirs` 虽可经 patch overlay 配置，但 patch 对 config 是**整键替换非深合并**且相对路径按进程 cwd resolve。
- **user-invocable 命令面（Q-3 实测，R-2 闭环）**：pinned 0.1.5-rc.1 **无** user-invocable→命令注册桥，但 **dsh-tool-skill 的 `agent/pre-step` 钩子存在手势桥**：SKILL_GESTURE 正则扫描普通 user 文本的 `/name` 手势，对 `isUserInvocable` 的 skill 注入 `<skill_content>`（source `kind:"skill-invocation"`，用户原文骑行普通 user message）；前提 = 无同名命令抢先（commands admission miss 落回普通 prompt）。**`/ulw-plan` 零代码落地 = 手势桥**（语义等价 OMO skill-as-command：skill 正文进上下文 + 用户请求跑一轮）；e2e 断言 `<skill_content>` 注入而非命令事件对——**omo-commands 不得注册同名 `ulw-plan` 命令**（会屏蔽手势）。

### 4.4 命令清单与处置（计划期草案；权威逐行版随 P4-T1 转实测）

| # | 命令面（ROADMAP 序） | v4.19.4 来源 | 处置草案 | 语义要点 |
|---|---|---|---|---|
| C-01 | `/goal` | `templates/goal.ts` + `commands.ts` goal 条目 | **跳过（DSH 原生）** | `dsh-command-goal` 原生覆盖（ROADMAP 明示）；覆盖清单记原生等价面 |
| C-02 | `/ulw-execute` | `templates/start-work.ts` + `commands.ts` start-work 条目（agent: atlas 绑定） | **移植** | v5 名；模板 marker 对接 H-32（§4.7）；`$SESSION_ID`/`$TIMESTAMP`/`$ARGUMENTS` 渲染；atlas 绑定经模板 + 名册委派链 |
| C-03 | `/ulw-plan` | shared-skill `ulw-plan/`（6 文件） | **移植**（skill-as-command，**手势桥零代码**，Q-3 实测） | prometheus 访谈人格 skill 已 vendor；命令面 = dsh-tool-skill pre-step 手势注入（§4.3）；omo-commands 不注册同名命令 |
| C-04 | `/hyperplan` | `templates/hyperplan.ts` + senpi skill `hyperplan/` | **移植（降级形态）** | 模板要求 `team_create`（Phase 5 缺席）——上游模板自带降级路径（team 工具缺席时的指引文案）；本阶段落地 = 模板 + skill 加载 + 降级语义；完整对抗评审环属 Phase 5 |
| C-05 | `/stop-continuation` | `templates/stop-continuation.ts` + `hooks/stop-continuation-guard/`（H-34，原 Phase 3 S-37） | **移植** | 命令 = guard 服务的消费面；停 ralph/todo 续行/boulder 的 DSH 映射（§4.6） |
| C-06 | `/handoff` | `templates/handoff.ts` | **移植** | 模板引用 `session_read`（OMO 工具）——DSH 等价面（session-query / 会话导出）由 P4-T1 核实，无等价面则模板语义收窄并记差异 |
| C-07 | `/remove-ai-slops` | `templates/remove-ai-slops.ts` + shared-skill `remove-ai-slops/` | **移植** | 模板 + skill 双载体；team-mode addendum 段不移植（Phase 5） |
| C-08 | ultrawork 关键词模式 | `hooks/keyword-detector/`（25 文件，P4-T1 实测，H-33，原 Phase 3 S-06）+ senpi skill `ultrawork/` | **移植（收窄）** | ultrawork + hyperplan 关键词 → pre-step 注入（模式 A）；**team 关键词子模式 deferred → Phase 5**；模型变体文案（gpt/glm/gemini/planner）按 DSH 名册现实收窄 |
| — | `/refactor` | `templates/refactor.ts`（+ refactor-sections/）+ shared-skill `refactor/` | **deferred → Phase 6（草案）** | 模板自述依赖 LSP/AST-grep/codemap（Phase 6 面）；skill 本体照常 vendor（内容属 17 skill 范围），命令面随编辑模型决策落地 |

### 4.5 keyword-detector 移植设计（H-33 接盘，原 Phase 3 S-06）

- **形态**：omo-hooks 的模式 A pre-step 注入——检测用户输入文本（剥 code block / inline code / slash 命令前导，上游 `detector.ts` 语义）命中 `ultrawork|ulw` / `hpp|hyperplan` 模式 → `agent.inject()` 注入对应指令文案；已注入幂等（上游"指令已在上下文则不重复"语义）。
- **收窄清单（P4-T1 实测扩充）**：① team 关键词（`TEAM_PATTERN`/`TEAM_MESSAGE`）deferred → Phase 5；② 模型/身份变体（5+1 个 md：default/gpt/gemini/glm/planner/codex）按 DSH 名册现实收窄为单一文案 + 名册可查的 reviewer 引用（Phase 2 plan-consultant/plan-reviewer 名）；③ `hyperplan-ultrawork` 组合模式保留（严格相邻双词序，constants.ts:14-15；交集禁用 = 基词任一禁则禁 combo，detector.ts:53-56）；④ **六级输入过滤全套移植**：synthetic/internal、system directive、non-OMO agent（builder/plan）、planner、background session、非主 session（只留 ultrawork/combo）；⑤ **双幂等**：消息级 `!text.includes(keyword.message)`（hook.ts:31-36）+ session 级一次性 Set；⑥ hyperplan 正则含 `.hpp` 负向后查（`(?<![\w.])hpp\b`，上游 issue #4215）。
- **指令内容**：ultrawork 指令正文 = senpi `ultrawork/SKILL.md`（vendor 内容，§4.3）——注入面引用 vendor 文本常量，不在 listener 里重写指令；notepad/`mktemp` 等 OMO 载体引用逐处收窄（DSH 等价物或记差异）。
- **配置面**：上游 `disabled_keywords`/`enabled_expansions` 两字段 optional 无默认（缺席 = 全启用无 allowlist，P4-T1 实测）——DSH 侧以插件 Config 落（cordis Config schema 先例），默认全开（与上游默认对齐）。

### 4.6 stop-continuation 的 DSH 语义映射（H-34 接盘，原 Phase 3 S-37）

上游语义：`/stop-continuation` → guard 服务置停止标记（stop/isStopped/clear）→ 各续行机制（ralph loop / todo continuation / boulder）检查标记而停摆 + 级联取消后台后代任务。DSH 侧的续行机制盘点（P4-T1 逐一核实停止面）：

| 续行机制 | DSH 载体 | 停止面（P4-T1 Q-5 实测定案） |
|---|---|---|
| todo 续行 | omo-hooks H-03（E 模式 steer） | enforcer steer 前查停止标记——**跨插件状态**：guard 服务以 cordis 服务落（提供方 `ctx.provide`/Service 子类，消费方**延迟 ctx.get**——先例 dsh-commands:349 execute 内取服务，绝不在 apply 期缓存），omo-hooks 消费、omo-commands 写入；两插件经服务契约耦合，无代码 import |
| goal 轮驱动 | `dsh-goal-round-driver`（原生） | `/stop-continuation` ≠ `/goal clear`——Q-5 实测 `ctx.goals` 词汇全（get/disarm/create/edit/**pause**/resume/complete/block/clear，revision CAS）——停止面 = **pause 当前 active goal**（语义 = 停止续行非清除目标，成立） |
| ralph loop | DSH 原生 ralph | Q-5 实测：**无可编程 stop API**（ralph 仅 model tool；停止 = 脚本自终止或自持 `ctx.workflowEngine.start()` 句柄 cancel）——omo 侧 ralph 由命令模板引导启动、非本插件持有的句柄 → **记差异**（模板文案指引用户层面停止，不承诺程序化取消） |
| 后台任务级联取消 | `ctx.jobs` | Q-5 实测 `ctx.jobs.kill(id, caller?, reason?) → 'requested'|'already-finished'` + `list/onJobDone`（types.d.ts:55-134）——上游 `getAllDescendantTasks`+`cancelTask` 的 DSH 映射 = list 过滤 running/pending + 逐个 kill（H-11 的 ctx.inject 延迟获取先例复用） |

### 4.7 `/ulw-execute` 与 H-32 的对接（R-10 闭环）

Phase 3 的 H-32 移植了 start-work **hook 语义**（激活检测 = DSH 原生形态：指挥委派 atlas + 工作计划意图 pre-step 检测），并登记 R-10：上游激活检测实为**命令模板 marker**（`<session-context>` + `You are starting an Atlas work session.`）。**P4-T1 实测定位修正**：`<session-context>` 段在 **commands.ts:67-70 的 wrapper**（`Session ID: $SESSION_ID` / `Timestamp: $TIMESTAMP` 两行 + 闭合标签），`You are starting an Atlas work session.` 在 start-work.ts:1——模板移植 = **wrapper 段 + 模板本体**双层携带，缺一不可。本阶段落地：

- `/ulw-execute` handler 渲染的模板**携带上游 marker 常量**（逐字），H-32 的激活检测**扩展识别该 marker**（omo-hooks 侧增强，同 commit 双插件改动）；DSH 原生激活信号（委派 + 意图检测）保留为无命令入口时的并行路径——双轨合一：marker 命中 = 命令路径，意图命中 = 自然委派路径，幂等键共享（already-injected 语义）。
- 模板其余部分（编排者纪律、闸门验证、flags `[plan-name] [--worktree <path>] [--make-pr] [--ship]`）语义移植；依赖 OMO boulder-state / `.omo/boulder.json` / ledger 的部分按 Phase 3 收窄口径记差异（H-32 已登记的跳过段复用）。
- atlas 绑定：`commands.ts` 的 `agent: atlas` 字段在 DSH 无命令级等价 → 模板文本明示 atlas 身份 + H-32 注入的上下文构建已以 atlas 为目标（Phase 3 已交付）；指挥收到命令消息后经名册委派 atlas（maxDepth 2 就位）。

### 4.8 门与 e2e 扩展

退出标准 a（每命令在脚本化场景驱动预期行为）与 b（skill 加载复用 dsh-skill）落到既有 8 门链的扩展，**不加新门、不绕过旧门**：

| 层 | 扩展内容 |
|---|---|
| **L1 单测（门 2）** | ① 每命令的模板渲染纯函数单测（占位符、参数语法、team-mode addendum 缺席）；② keyword 检测逻辑单测（上游测试用例移植为种子——keyword-detector 有 7 个测试文件）；③ manifest ↔ 覆盖清单一致性；④ boot marker 纯函数；⑤ vendor manifest 漂移检测（Phase 1 先例） |
| **e2e（门 3）** | 每命令 ≥ 1 场景：**drive 需新增"敲命令"通道**（scripted 步骤发 `/name args` 行 → 断言 `command/run`/`command/done` 事件 + followup 注入的模板文本进入模型请求 + 预期行为链）；skill 场景 = 断言目录可见（catalog 含 17 裸名）+ `skill` 工具加载正文（mock 发 tool_calls）；对照组（无关键词不注入；**未知命令行 = 无 `command/run`/`command/done` 事件、无 error 结果、该行落回普通 prompt 路径**——DSH admission miss 不记任何事件，dsh-commands lib:293-299 明文） |
| **doctor-lite（门 4）** | omo-commands 行 Config schema 校验 + cordis.yml 三 insert 行断言（check 2b 扩展，计数 2→3） |
| **concerto-static（门 6）** | c 组延续编号（c15+）：三 insert 行、omo-commands 署名头覆盖、manifest ↔ 文件集合一致、**vendor skills 的 NOTICES/manifest 行存在性**、改名（ulw-execute）一致性 |
| **probe（门 8）** | 冷启动日志断言 `[omo-commands] command <id> registered` 逐行 + 汇总行；prove 脚本断言命令注册表在真实 composition 中可见（真实注册表 + stub 先例） |
| **L4 真模型手动冒烟（非 CI）** | 一次手工 run 真实敲 2–3 条命令（如 `/handoff`、prompt 带 `ulw`）；证据进 `.omo/evidence/`（gitignored），结论回填任务清单 |

### 4.9 覆盖清单文档（退出标准承载）

[命令与 skill 清单与覆盖基线](./phase4-commands.md) 从计划期即建立，核心列：**命令/skill（v4.19.4 路径）· 处置（已移植/DSH 原生跳过/deferred/排除）· 理由与证据（e2e 场景名/跳过依据）**。命令面 8 行 + skill 面 19 条目（17 shared + 2 senpi）+ 相关 hook 接盘 2 行（**H-33/H-34** 终态，原 Phase 3 S-06/S-37），全部模块有终态才算闭环；manifest ↔ 清单一致性由门 2 钉死。

### 4.10 署名与合规

- 命令 handler/模板/listener 文件头部署名注释（上游源文件 tag 相对路径 + "语义移植"声明），沿用 Phase 3 先例。
- skills vendor：`THIRD_PARTY_NOTICES.md` 新增 "Phase 4 skills vendoring" 小节（per-file，286+2 文件量级——按 Phase 1 的目录级分组 + 逐文件 manifest 双层纪律落地，D15 的字面要求与可操作性平衡按 playbook 既有裁定执行）；`VENDOR-MANIFEST.json` 逐文件 sha256；改名处 `deviations[]`。
- `verify-licenses` 的 `checked` 预期变化（54 → 54+新增 vendor 条目），每处变化有对应条目；纯命令代码零新增 npm 依赖。

## 5. 退出标准与证据

ROADMAP §4 Phase 4 给出 2 条退出标准，逐条落到可执行证据：

| # | ROADMAP 原文 | 证据（本计划的关键判定） |
|---|---|---|
| **a** | 每条命令在脚本化场景中驱动预期 agent 行为 | 覆盖清单每行"已移植"状态带 e2e 场景名；门 3 全绿；每场景含**对照断言**（无关键词不注入；未知命令零事件零报错、落回普通 prompt）；`command/run`/`command/done` 事件与模板注入文本在 session log 可观测 |
| **b** | skill 加载原样复用 `dsh-skill` | 17 裸名 skill 在 catalog 可见（场景断言）；`skill` 工具经 `ctx.skills.get` 原生面加载正文（e2e 断言）；**对 `dsh-skill*` 包零 patch、零 fork**（静态门断言 vendor 目录外无 dsh-skill 改动） |

**DoD 补充**（沿用 Phase 1/2/3 的 c/d/e）：

- **c**：`scripts/ci-local.sh` 全 8 门绿（门扩展只加严不放松）。
- **d**：本计划目录文档与实测无冲突——凡 P4-T1 复核推翻计划假设处（如 Q-3 的 user-invocable 桥接存在性、Q-1 的命令驱动机制），改文档而不是改结论。
- **e**：未移除任何既有署名；`verify-licenses` 计数变化全部有对应 NOTICES/manifest 条目；`THIRD_PARTY_NOTICES.md` 既有条目只增不改。

**明确不属于退出标准**（避免范围蔓延）：

- ❌ Team Mode（`team_create`、team 关键词模式、hyperplan 完整对抗评审环、refactor/remove-ai-slops 的 team-mode addendum）——Phase 5
- ❌ `/refactor` 命令面、LSP/ast-grep/codemap 能力——Phase 6（refactor **skill 内容**照常 vendor）
- ❌ ulw-loop / mass-ulw / memory / model-profiles 等 v5 或 senpi 专属面——ROADMAP §6 观察项，非本阶段
- ❌ boulder-state / notepad / OMO task 工具族的移植——命令模板中引用这些载体的段落按收窄记差异
- ❌ OMO 命令的 opencode UI 副作用（参数补全 widget、TUI 渲染）的像素级复刻——DSH 命令面的 hint/description 语义等价落地
- ❌ `/init-deep`（可行性报告 §5.2 候选但 ROADMAP Phase 4 未列；agents-md-core 写 AGENTS.md 的面随 Phase 6 MCP/编辑面重议——init-deep **skill 内容**照常 vendor）

## 6. 风险与开放问题

| # | 风险 / 问题 | 影响 | 处置 |
|---|---|---|---|
| **R-1** | ~~**命令驱动机制不成立**~~ → ~~**命令注入的时序细节**~~ → **已闭环（P4-T1 Q-1）**：followup 排队语义钉死——消息排在 `command/done` 之后下一回合生效、非 idle 无条件排队不丢弃、signal 只停止等待不中断 handler（dsh-commands:325/379/385，dsh-agent-loop:783-791，withAbort:124-140/settleThrown:388-398）。**形态定案 = followup，无降级** | ~~低-中~~ 无 | 闭环，无需动作 |
| **R-2** | ~~**user-invocable 桥接缺席**~~ → **已闭环（P4-T1 Q-3）**：命令注册桥确认不存在，但 **dsh-tool-skill `agent/pre-step` 手势桥存在**（SKILL_GESTURE + isUserInvocable + `<skill_content>` 注入）——`/ulw-plan` 零代码落地；约束 = omo-commands 不注册同名命令 | ~~中~~ 低 | T15 按手势桥形态落地 e2e（断言注入而非命令事件）；不为桥接改写 dsh-skill（退出标准 b 禁令维持） |
| **R-3** | **skill 内容体量**：286+2 文件的 vendor 是 Phase 1（26 文件）的 11 倍；per-file 署名与 manifest 维护成本 | 中 | Phase 1 playbook 的目录分组纪律复用；manifest 生成脚本化（vendor  playbook 已有工具）；前端类 skill（ultimate-browsing 48 文件、programming 75 文件）的引用文件完整性由 sha256 钉死 |
| **R-4** | **关键词误注入**：ultrawork 关键词检测在 DSH 指挥链上误触发（如用户引用"ulw"字样讨论）会注入强约束指令，扭曲会话 | 中 | 上游防护语义全套移植（code block 剥离、slash 前导排除、幂等检测）；对照场景 e2e（讨论关键词不触发）；配置面可禁用 |
| **R-5** | **跨插件停止标记的一致性**：omo-commands 写、omo-hooks 读，cordis 服务的可见性/时序（scope 问题在 Phase 3 H-11 已踩过一次：apply 时 ctx.get undefined） | 中 | 服务契约 + ctx.inject 延迟获取先例（T13 修复形态）；单测模拟双插件共存；e2e 断言"stop 后 todo 未清也不再 steer" |
| **R-6** | **模板引用的 OMO 载体缺席**：handoff 的 `session_read`、ulw-execute 的 boulder/notepad、ultrawork 指令的 `mktemp` notepad——DSH 无等价物的段落若照字面移植会产出死指令 | 中 | P4-T1 逐模板核对引用载体；收窄/替换处记入覆盖清单差异段；persona 层的收窄先例（Phase 2）沿用 |
| **R-7** | **范围误读**：产出被理解为"OMO 编排全流程已可用"（实际 Team Mode/计划载体仍缺席，hyperplan 是降级形态） | 低（沟通） | README/CHANGELOG 写明：命令面 ≠ Team Mode（Phase 5）≠ 编辑面（Phase 6）；hyperplan 降级语义成文 |
| **R-8** | **vendor 漂移检测误报**：skills 内容改名（start-work→ulw-execute）使 sha256 与上游偏离，后续定向搬运（D14 规则 4）比对成本上升 | 低 | deviations[] 逐处登记（D15-c 既定纪律）；改名前原文的 sha256 同时登记（双向锚） |
| **R-9** | **e2e 命令通道缺口**：drive.mjs 现无"敲 slash 命令"的剧本原语，通道建设可能牵出 session 输入面假设 | 中 | P4-T1 顺带核实 mock-LLM 沙箱的命令注入点；打样场景（第一条命令）承担通道建设，后续场景复用 |
| **R-11** | **新增 manifest 条目触碰既有计数断言/基线路径**：omo-hooks manifest 扩容触发 `EXPECTED_HOOK_COUNT`（apply 时 throw = boot 红）、单测硬编码、`EXPECTED_SUMMARY_LINE`、c13 文件集合、c14 基线文档五处硬耦合——计划期曾全部漏列（评审缺口 1）。同类坑已有先例：P3-T5 剔除 H-01 时同步过 15→14 网 | 高（破门/破启动） | §4.1 的同步网全清单成文；**首个 manifest 触碰任务（T8 或 T12）同 commit 落地 c14 两文档并集演进**；T8/T12 任务书各带同步网清单；T16 复验 |

### 开放问题（✅ P4-T1 全部闭环——逐字引用结论见[覆盖基线 §5](./phase4-commands.md) 与 `.omo/evidence/p4t1/`）

| # | 问题 | 结论 |
|---|---|---|
| Q-1 | followup 时序钉测 | ✅ 形态定案 = followup 无降级（command/done 后下一回合生效；非 idle 排队不丢弃；signal 只停止等待） |
| Q-2 | `$SESSION_ID`/`$TIMESTAMP` 暴露面 | ✅ invocation 仅 5 字段；`$SESSION_ID`=`invocation.agent.id`、`$TIMESTAMP`=`Date.now()` 派生 |
| Q-3 | user-invocable → 命令桥接存在性 | ✅ 注册桥不存在；手势桥（dsh-tool-skill pre-step SKILL_GESTURE）存在 → `/ulw-plan` 零代码 |
| Q-4 | skill 投递机制选型 | ✅ 候选 b′（嵌入注册 + vendor path）；否决物化（.git 探测 + patch 整键替换） |
| Q-5 | 续行机制盘点 + 跨插件服务形态 | ✅ goals pause 可用；ralph 无 stop API（记差异）；jobs.kill 满足级联；延迟 ctx.get 先例定案 |
| Q-6 | keyword-detector 收窄清单逐字复核 | ✅ 六级过滤 + 双幂等 + 组合相邻/交集禁用 + `.hpp` 负向后查 + 配置缺席全启用（§4.5） |
| Q-7 | 上游树逐文件对账 | ✅ 7 命令/20 文件、17 目录 286 文件、senpi 2×1、keyword-detector **25**（少计 1 修正）、guard 3；测试种子 111 its |

## 7. 工作包与估算

按 ROADMAP §7 的定性惯例（无 buffer、非承诺，R3），仅给工作量级：

| 工作包 | 内容 | 任务 | 量级 |
|---|---|---|---|
| **WP-0 调研核对** | 命令/skill 全树对账 + DSH 机制逐件核实（Q-1…Q-7）→ 覆盖基线转实测 | P4-T1 | ~1 天 |
| **WP-1 插件骨架** | omo-commands 包 + manifest.ts + 挂载（cordis.yml/cold-start/doctor-lite/probe marker） | P4-T2 … P4-T3 | ~1 天 |
| **WP-2 skills vendor** | 17+2 skill 内容 vendor（manifest/NOTICES/license/deviations）+ 投递机制落地 + catalog e2e | P4-T4 … P4-T5 | ~1.5 天 |
| **WP-3 模板命令批 A** | handoff + remove-ai-slops（无额外依赖的两条模板命令）+ 命令通道 e2e 打样 | P4-T6 … P4-T7 | ~1 天 |
| **WP-4 stop-continuation** | guard 服务 + 命令 + H-03/goal/jobs 停止面接线 + e2e | P4-T8 … P4-T9 | ~1 天 |
| **WP-5 ulw-execute 命令** | 模板 + R-10 marker 对接（omo-hooks 增强）+ e2e | P4-T10 … P4-T11 | ~1 天 |
| **WP-6 关键词模式** | keyword-detector 移植（ultrawork/hyperplan，team deferred）+ 指令内容接线 + e2e | P4-T12 … P4-T13 | ~1.5 天 |
| **WP-7 hyperplan + ulw-plan** | hyperplan 降级命令 + 两 skill 命令面 + e2e | P4-T14 … P4-T15 | ~1 天 |
| **WP-8 门扩展** | 静态门 c 组 / doctor-lite / probe / proofs 扩展 | P4-T16 | ~0.5 天 |
| **WP-9 收口** | 署名、README/docs、覆盖清单终态、退出标准核对 + L4 | P4-T17 … P4-T18 | ~1 天 |

**合计 ≈ 10.5 人日**（P4-T1 实测后按 DoD-d 修正）。体量主体在 WP-2（vendor 体量）与 WP-6（关键词模式的收窄与打样）。

## 8. 交付物清单

| 交付物 | 路径 | 类型 |
|---|---|---|
| omo-commands 插件 | `patches/omo-dsh/omo-commands/`（package.json / tsconfig / `src/index.ts` / `src/manifest.ts` / `src/commands/*.ts` / `src/templates/*.ts`） | 代码 |
| omo-hooks 扩容 | `src/hooks/keyword-detector.ts`（+子模块）· `src/hooks/stop-continuation-guard.ts`（或服务模块）· H-32 marker 识别增强 | 代码 |
| skills vendor | `patches/omo-dsh/vendor/shared-skills/`（17+2 skill 目录 + `VENDOR-MANIFEST.json` + `NOTICE.md`） | 内容 |
| 挂载 | 根 `cordis.yml` 第三个 `- insert:` 行 | 配置 |
| 测试 | `tests/omo-commands/`（单测 + manifest↔清单一致性）· `tests/e2e/` 新增命令/skill 场景 | 测试 |
| 门扩展 | `scripts/verify-concerto-static.mjs`（c 组扩展）· `doctor-lite*` · `concerto-mode-probe.sh` · proofs | 配置 |
| 覆盖清单 | [`docs/plans/phase4-dev/phase4-commands.md`](./phase4-commands.md)（全条目终态 + 理由） | 文档 |
| 署名 | `THIRD_PARTY_NOTICES.md` 新增 Phase 4 小节 + 每文件署名头 | 合规 |
| 说明 | `README*.md`（命令面 ≠ Team Mode ≠ 编辑面）· `CHANGELOG.md` · `docs/mvp-pitfalls*.md`（新坑，如有） | 文档 |
| **本计划目录** | `docs/plans/phase4-dev/phase4-plan.md`（本文）· [`phase4-tasks.md`](./phase4-tasks.md) · [`phase4-commands.md`](./phase4-commands.md) | 文档 |

## 9. 与后续阶段的关系

- **Phase 5（Team Mode）**：`/hyperplan` 的完整对抗评审环（team_create + category 成员）在 Team Mode 落地后从降级形态升级；team 关键词子模式（TEAM_PATTERN/TEAM_MESSAGE）随 Team Mode 移植；refactor/remove-ai-slops 模板的 team-mode addendum 段届时补上；stop-continuation 的 team 后代取消语义随成员模型扩展。
- **Phase 6（MCP 与编辑）**：`/refactor` 命令面随 LSP/ast-grep 落地；init-deep skill 的消费面（agents-md-core 写 AGENTS.md）届时裁定；ast-grep/lsp-setup 两 skill 的内容已在本阶段 vendor（内容先行，能力随后）。
- **Phase 7（硬化）**：命令面的错误分类与用户指引文案纳入发布矩阵；本阶段积累的命令 e2e 通道纳入回归。
- **对 Phase 3 的回馈**：R-10（ulw-execute marker 对接）在本阶段闭环；S-06/S-37 两个 deferred 项在本阶段消化为终态。
