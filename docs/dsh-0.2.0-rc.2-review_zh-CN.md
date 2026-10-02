# dsh 0.2.0-rc.2 复核 —— v0.2.x 适配分析

> **性质**：带证据链的静态复核，不是行动承诺，也不是运行时验证。本报告不翻动 DSH pin（D7）、不改 preset 与插件、不触碰 `.omo/compat.yaml` 的 `tested` 行。它唯一的登记动作是随报告一并归档的 0.2.0-rc.2 `untested` 行——这是项目"上游发布新版本"的既有机制（`docs/release-process_zh-CN.md`）。
>
> - 复核日期：2026-10-02
> - 复核对象：本地镜像 `/home/linletian/GithubRepo/deepseek-harness/`（只读），tag `dsh-v0.2.0-rc.2`，HEAD commit `639ed01539`；本机**已安装**的 `@deepseek-ai/dsh@0.2.0-rc.2`（`dsh --version` 实测）
> - 对照基线：dsh `0.1.5-rc.1`——本项目 CI pin（决策 D7）、所有 `tested` 矩阵行的验证运行时
> - **ROADMAP 配套**：[`roadmap_zh-CN.md`](./roadmap_zh-CN.md) §4 的 Phase 4.5——本报告为其划定范围的适配阶段（插在 Team Mode 之前；本报告不落地任何代码）
> - 方法：① **普查本项目触到的全部上游面**——三个插件源码的 cordis `ctx.*` 调用普查、15 个订阅事件名、脚本依赖的 CLI/RPC/会话日志面；② 按包 `git diff dsh-v0.1.5-rc.1..dsh-v0.2.0-rc.2`——4102 个提交、9272 个文件；③ 三条并行核对线（cordis Context API / 事件钩子 + 注入机制 / CLI + Web 传输 + 会话持久化）；④ **未跑任何运行时门**——还没有任何东西在 0.2.0 上 boot 本 overlay，因此这里每条结论都是源码实证，而非 boot 实证。这是与 0.1.5-rc.1 复核（跑了全部门）的诚实差别
> - **时间锚点**：仓库相对引用（`patches/…`、`scripts/…`）描述复核日的树；上游引用按 tag 限定（`… @ dsh-v0.2.0-rc.2`），刻意写成能在适配之后继续成立的形式

---

> **English**: [`dsh-0.2.0-rc.2-review.md`](./dsh-0.2.0-rc.2-review.md)

## 1. 结论

**三个 P0 面在 0.2.0-rc.2 上断裂——且三者全部静默失效——外加一个打垮测试基础设施的 P1 面。** 插件所基于的 cordis 核心（`ctx.on` / `inject` / `effect` / `provide` / `plugin`）逐字节稳定：vendored cordis 两 tag 间**零 diff**。15 个订阅事件全部存在。协奏组合点名的 20 个上游包无一删除。损伤集中在上游 0.1.6-alpha.2 到 0.2.0-rc.2 之间交付的三次重写，每一次都正中本项目的一根承重梁。

| 严重度 | 发现 | 阻断 |
|---|---|---|
| **P0——静默断裂** | Agent preset 重架构：文件发现式 `dsh-agent-presets`（扫描 `$DSH_HOME/.agent-presets/`）**被删**，换成声明式 `dsh-agent-preset-registry` + `dsh-agent-preset`；roster 的 `trust` 字段消失 | 协奏模式根本不注册——`syncConcertoPreset` 物化的 preset 文件没有任何读取方（§2） |
| **P0——静默断裂** | `ctx.jobs` 重写：`caller: Agent → SessionId`、`JobSnapshot.ownerSession → JobView.owner`、`onJobDone` **删除**（替代为 `jobs.events.subscribe`）、`JobSpec` 改形 | 三个触点（§3）：`background-notification.ts`、`stop-continuation-guard.ts`、`ulw-execute/live-state.ts`——每一处都无报错降级 |
| **P0——静默断裂** | （并入上两条——这里的 P0 全是*安静地*失败） | 上游没有任何抛出；第一个可见症状是 roster 缺席 / job 未取消 / 通知未达 |
| **P1——门断裂** | 会话日志格式 v3 → **v4**（`SESSION_FORMAT_VERSION`），`tool/result` 消息重构（`role:'user'` + `tool-result` 块 → `role:'tool'` + 顶层 `toolCallId`/`isError`） | e2e 驱动伪造的 v3 形夹具（十余处）与全部 v3 词汇日志断言（§4） |
| **P2——对齐** | `MessageSourceMap` 删除兜底 `plugin` kind；`agent/session-start` 移除（本项目未用）；`PreToolDecision` 增 `cancel`；`tool-subagent` 的 `maxDepth` 删 `.default(3)`（本项目全部行显式赋值） | 今日无阻断；`kind:'plugin'` 惯用法在上游已废弃（§5） |
| **P2——记录** | zstd 会话日志压缩**不是新变**（0.1.5-rc.1 起即默认；本项目沙箱 profile 早已强制 `compression: none`） | 无；登记在此以封死一个幻影工作项（§4.3） |

风险的形状与 0.1.5-rc.1 persona 断裂同源、且翻倍：**三个 P0 没有一个是抛错的**。文件发现的删除、藏在结构式比较背后的 caller 类型变化、被移除的 listener 注册——全部表现为"功能只是不在了"。这正是本项目门体系存在要拦的失效类，也正是为什么适配阶段（Phase 4.5）必须重跑完整 L1+L2 链、而不是信任一次 boot。

## 2. P0-1 —— Agent preset 重架构

### 2.1 变化内容

| | 0.1.5-rc.1 | 0.2.0-rc.2 |
|---|---|---|
| 实现包 | `packages/preset/agent-presets`（`dsh-agent-presets`） | **已删**；替换为 `dsh-agent-preset-registry` + `dsh-agent-preset`（`packages/preset/agent-preset-registry`、`…/agent-preset`） |
| 注册机制 | `discovery.ts` 扫描 `$DSH_HOME/.agent-presets/<id>/` 下的 `preset.yml` + `agent.cordis.yml` | **文件发现已删**——`.agent-presets` 字样仅残存于一份 skill 文档；preset 在 bundle/profile YAML 中声明（`@deepseek-ai/dsh-agent-preset` 行），或运行时经 `agentPresets.register(definition)` 注册 |
| roster 条目 | `{id, trust, name, …}`（`trust: system \| user`） | `{id, isDefault, name, description, broken}`——**无 `trust` 字段**（`agent-preset-registry/src/preset.ts`、`…/types.ts`） |
| 远程面 | `list` / `copy` / `deletePreset` | 仅剩 `list` / `read` / `select`（`copy`、`deletePreset` 移除；preset 管理改走 plugin-manager remotes） |
| 定义形状 | `preset.yml`（身份）+ `agent.cordis.yml`（组合） | `PresetDefinition {id, name?, description?, order?, plugins: EntryOptions[]}`（`agent-preset-registry/src/definition.ts:5-11`）——单个对象；plugins 列表*就是*渲染后的组合 |

上游落点：`d1e22a7e24` "feat(preset): declare Agent compositions in profile YAML (#4569)"（0.1.6-alpha.2 时期），并经 0.2.0 bundle 重构完善（`packages/bundle/web-app/presets/<id>.patch.yml`——四个官方 preset 变为扁平 patch 文件；wire 上的 id `standard` / `ptc` / `minimal` / `cordis` 不变）。

### 2.2 这里断什么

1. **协奏模式根本不注册。** `omo-agents` 在 `apply()` 时把 `$DSH_HOME/.agent-presets/concerto/{preset.yml, agent.cordis.yml}` 物化到磁盘（`patches/omo-dsh/omo-agents/src/concerto-preset.ts`），依赖的是那台被删的扫描器。0.2.0 上没有任何人读这两个文件：roster 无条目、无报错，`session/create {agentPreset:"concerto"}` 以 `agent-preset/not-found` 失败。
2. **roster 断言失去词汇。** `concerto-mode-probe.sh` 与 e2e 驱动钉的是 `trust:user` 和物化文件路径（`tests/e2e/drive.mjs` 断言 `$DSH_HOME/.agent-presets/concerto/agent.cordis.yml` 内的锚点，如 :2463/:2510/:2546）。两个指称对象都没了——断言必须搬到 registry roster（`agentPresets/list`）与已组合的 agent 树上。
3. 插件自己的 boot 读（`ctx.inject(['agentPresets'])` → `agentPresets.list()`，`omo-agents/src/index.ts:234`）仍会触发——服务名与 `list()` 存活（`AgentPresetRegistry extends TypertRemoteService`，`super(ctx, 'agentPresets')` @ `agent-preset-registry/src/index.ts:51,64`）——但它读的 `RosterEntry.trust` 现在每行都是 `undefined`。

### 2.3 什么存活，及其隐含的迁移路径

- **组合本身有效**：协奏 `agent.cordis.yml` 点名的 20 个上游包在 0.2.0-rc.2 全部存在（`dsh-tool-present` 只搬了目录，`packages/fs/` → `packages/deliverables/`，包名不变）；Loader YAML 方言（`insert:`、`group: true`、`isolate:`、`!!js`）在 0.2.0 官方 preset patch 里以协奏使用的同形出现；`dsh-persona` 两 tag 间**零 diff**；`dsh-tool-subagent` 的 Config 保留 `provider` / `toolName` / `backgroundMode` / `persona` / `agentOptions` / `toolFilter` / `maxDepth`（仅 `maxDepth` 的 `.default(3)` 被删——协奏每行都显式写 `maxDepth: 2`）。
- `session/create {request:{cwd, agentPreset}}` 仍被支持（session projection 仍读 `header.agentPreset`，`agent-preset-registry/src/session.ts:35-44`），首回合前切换有 `agentPresets/select`。
- 自然的移植方向：**保留 sentinel 渲染管线，只换出口**——把同一份条目列表在内存渲染，`apply()` 时调 `ctx.agentPresets.register({id:'concerto', name, description, order: 5, plugins})`，不再写文件。`RosterEntry` 结构类型去掉 `trust`；探针改指 registry roster。

## 3. P0-2 —— `ctx.jobs` 重写

### 3.1 变化内容（`packages/jobs/jobs/src/index.ts`、`…/types.ts` @ dsh-v0.2.0-rc.2）

| 面 | 0.1.5-rc.1 | 0.2.0-rc.2 |
|---|---|---|
| `list` / `get` / `read` / `kill` / `wait` / `remove` 的 caller | `caller?: Agent` | **`caller?: SessionId`**——鉴权检查直接比 `job.owner.id !== caller`（`jobs-local/src/index.ts:407`）；`{id}` 对象不再满足它 |
| 快照类型 | `JobSnapshot`，含 `ownerSession?: SessionId`、`reported` | `JobView`，**`owner?: SessionId`**；**`reported` 删除**（去重语义由 settled 事件的 `awaited` 标志承载） |
| 完成通知 | `jobs.onJobDone(listener)`（+ `onJobsChanged`） | **双双删除**；`jobs.events.subscribe(filter, listener)`，filter 为 `{owner: SessionId}` / `{owners: 'all' \| 'scope'}`，事件词汇 registered / progress / stopping / settled / removed / output |
| `start(spec)` | `JobStart { owner?: Agent, run(): { done: Promise<JobOutcome{output}> } }` | `JobSpec { owner?: SessionId, run(job: JobHandle) }`，outcome 字段 `output` → `result` |
| `attachController` | 不变 | 不变 |

### 3.2 三个触点——全部安静地失败

1. **`patches/omo-dsh/omo-hooks/src/hooks/background-notification.ts`**——`typeof jobs.onJobDone === 'function'` 探测失败，hook 静默落入自己预留的 **pull 降级路径**（Phase 3 刻意保留的设计）；`reported` 去重读恒为 false。无抛出；后台完成通知只是不再经推送路径到达。
2. **`patches/omo-dsh/omo-hooks/src/services/stop-continuation-guard.ts`**——把 `{id: sessionId}` 当 caller 传（`StopContinuationCallerLike`，:154-168）。新检查下 `job.owner.id !== {id:…}` 恒真 → 有主 job 被 `list` 滤除、被 `kill` 拒绝；叠加 `snapshot.ownerSession` 读的是改名后的字段、围栏跳过一切。`/stop-continuation` 的级联**静默地什么都没取消**——正是该文件头部自己警告的 silent skip 类。
3. **`patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/live-state.ts:293`**——`jobs.start({kind, label, owner: agent, run: () => ({done: …output…})})` 双错（`owner` 类型 + `run` 签名）；preflight 抛出落进既有 `catch`，表现为 `degraded: true`。ulw-execute 工作 job 永远启动不了，日志依旧干净。

适配很小（caller 传 `SessionId` 字符串、读 `owner`、用 `{owners:'scope'}` 订阅 `events` 并以 `settled.awaited` 去重、`start` 的 spec 改形）——但**每一项都是必须的**，且只有全门链能逐项证明。

## 4. P1 —— 会话日志格式 v4

### 4.1 变化内容

- `SESSION_FORMAT_VERSION = 3 → 4`（`packages/core/session/src/types.ts:89`）；新会话写 `session.v4.jsonl`（随部署压缩形态）。V3 日志仍可读，官方提供一次性 V3→V4 语料迁移（`packages/session/session-format-v3-to-v4`，PR #4320）；写入/扫描路径执行 V4 准入断言（`assertV4RowAdmission`，`session-persistence-jsonl/src/format.ts`）。
- `tool/result` 消息重构：原为 `role:'user'` 携带 `content: [{type:'tool-result', toolCallId, content, isError}]`；现为 `role:'tool'` + **顶层** `toolCallId` / `isError`，`'tool-result'` 内容块类型删除（`llm/src/message.ts`、`core/session/src/types.ts` @ 0.2.0）。新增 `developer/message`、`image/offload`、`workspace/changes` 事件类型。

### 4.2 这里断什么

- `tests/e2e/drive.mjs` 在十余处伪造 v3 形 `tool/result` 条目（:5201、:5278、:5328、:5680、:5728、:5859、:6501、:6525、:6686……），并按 v3 块词汇断言；v4 运行时重读伪造日志会撞上 V4 准入断言，项目侧每一个按旧信封写的解析器看到的都是不认识的形状。
- 文件名半边**已被吸收**：脚本匹配 `/^session(?:\.v\d+)?\.jsonl$/`（`scripts/smoke-real.mjs` 的 `isSessionLogName`），v4 天然命中。

### 4.3 zstd 修正——封死一个幻影工作项

Zstandard 压缩**不是** 0.2.0 的变化：`DEFAULT_COMPRESSION = 'zstd'` 在 0.1.5-rc.1 即如此（`session-persistence-jsonl/src/index.ts:66` 两 tag 逐字相同），且本项目沙箱 profile 早已通过 persistence overlay 强制 `compression: none`（`scripts/smoke-real.mjs:524`、`tests/e2e/drive.mjs:2015`、`scripts/prove-route-logging.mjs:296`）。明文观测通道是既有设计决策，不是待办迁移；剩下的只有 v4 信封。

## 5. P2 —— 增量或本项目未用的变化（登记，不强制行动）

| 变化 | 证据 | 对本项目的意义 |
|---|---|---|
| `MessageSourceMap` 删除兜底 `plugin` kind；生产者经 `declare module '@deepseek-ai/dsh-llm'` 声明专属 kind（上游范例：`time-context`） | `llm/src/message.ts:104-113` | 13 处用 `source:{kind:'plugin'}`（hard-blocks 注入、todo 续行 steer、keyword-detector 自过滤）。运行时消费者对未知 kind fall-through，且本项目的生产方/过滤方自洽，注入仍会落地——但该惯用法在上游已废弃；Phase 4.5 应迁到专属 kind |
| `agent/session-start` 移除，并入 serial 化 `agent/created` | `core/agent/src/runtime-types.ts:261` | 本项目无任何订阅——无影响 |
| `tools/pre-execute` 决策增 `{kind:'cancel'}`、`deny.info`、`ask.displayReason`；`turn/end` 增 `forked` 变体 | `core/tools/src/index.ts:596-611`；`core/session/src/types.ts:228` | 纯增量；护栏的排除式分类不受影响 |
| `tool-subagent` 的 `maxDepth` 删 `.default(3)` | `subagent/tool-subagent/src/index.ts:130` | 十个委派行全部显式 `maxDepth: 2`——无影响 |
| `skills`：`path?` 上移到 `SkillSummary`；`commands`：增可选 `definitionId` | `skill/skill/src/index.ts:55-58`；`interaction/commands/src/index.ts:62` | 结构兼容 |
| `ctx.codeRuntime` 改名 `ctx.ptcRuntime`；`agentPresets/copy` + `deletePreset` RPC 移除 | `core/tools/src/index.ts`；§2.1 | 本项目均未使用 |
| CLI：`dsh <name>` 泛化原硬编码 `web` 别名；重复 `--profile` 现在报错；新增 `--dump-config-schema` 与 `dsh plugin allow-version / revoke-version`；认证握手 redirect Location 改为目录相对 `./` | `apps/cli/src/args.ts`；`apps/cli/src/plugin.ts`；`client/connection/src/browser-auth.ts` | 全部兼容——脚本只断言 303 状态码，从不断言 Location 值（`smoke-real.mjs:674-679`） |
| `dsh.bundle.patch` 接受 patch 文件**列表**；`$DSH_HOME/profiles/node_modules` 拦截层与 `.dsh-module-fallback` **保留** | `boot/app-boot/src/profile.ts` | 对 `--patch` 用户透明；本项目逐 profile `dsh plugin add` 安装不受影响 |
| cordis patch 语义（`insert:` 带/不带 id、目标缺失 warn 跳过） | `vendor/include/src/index.ts` `applyEntryPatches`——逐行一致 | `cordis.yml` 头部记载的 P-8 语义全部成立 |

## 6. 稳定面——干净回来的普查

| 面 | 证据 @ dsh-v0.2.0-rc.2 |
|---|---|
| `ctx.on` / `get` / `inject` / `effect` / `provide` / `plugin` | vendored cordis `context.ts` / `registry.ts` / `service.ts`——**零 diff** |
| 全部 15 个订阅事件（`agent/pre-step`、`agent/status`、`agent/turn-stopping`、`assistant/message`、`compaction/end`、`session/disposed`、`session/event`、`step/end`、`subagent/descriptor`、`tool/result`、`tools/post-execute`、`tools/pre-execute`、`turn/end`、`turn/start`、`user/message`） | 存在；`agent/pre-step` waterfall payload `{agent, messages, turn, step, signal}` 与 `PreStepDecision` 逐字相同 |
| `agent.inject(message)` | 声明与实现逐字相同（`core/agent/src/runtime-types.ts:241`） |
| `ctx.goals.pause(agent, ref)` | 逐字相同（`goal/goal/src/index.ts:351-353`）——`/stop-continuation` 的 pause 语义成立 |
| `ctx.sessionProjections.stateOf` / `snapshot` | `session/session-projection/src/index.ts:319,338`（仅 3 行 lint 注释 diff） |
| `ctx.commands.register` / `ctx.skills.register` / `get` | 签名不变（§5 增量注记） |
| `ctx.subagents.start` / `SUBAGENT_DESCRIPTOR_VERSION = 3` | `subagent/subagent/src/index.ts:559`、`…/descriptor.ts:48` |
| `tools/post-execute` 的 `ToolExecutionResult`（`isError` / `content`） | 逐字相同——`empty-task-response-detector` 安全 |
| base bundle 仍挂载 `id: commands` 与 `id: jobs` | `bundle/base/cordis.patch.yml:307,88`——`omo-commands` 的 `inject:['commands']` 前提成立 |
| Web 传输：readiness 行 `dsh web: …/?token=…`、`dsh-auth-*` cookie 握手、`POST /api/<ns>/<method>` 恰一个 `args` 信封、`agentPresets/list` · `llm/listProviders` · `session/create` · `session/prompt` | `bundle/web-app/src/index.ts:271`；`client/connection/src/browser-auth.ts`；`api/gateway/src/index.ts` |
| `--patch` 顶层 YAML 数组 + `insert:` 形式；`--no-open`；`dsh plugin add`；`$DSH_HOME/profiles/<name>/` 布局 | `apps/cli/src/args.ts`；`bundle/web-app/src/startup.ts`；`boot/app-boot/src/profile.ts` |

## 7. 这对门体系意味着什么（常设教训的更新版）

0.1.5-rc.1 升级的教训是：*你没有的那扇门，就是把断裂放行的那扇*——doctor-lite 的 schema pass 之所以存在，是因为 persona 改名曾穿过 4/4 + 10/10 + 104/104。0.2.0 的面把这个教训磨得更锋利：**这里的每个 P0 都是沉默而非报错**，且每一个都有先死的金丝雀——

- preset 重架构先杀 e2e 驱动的**物化文件锚点断言**和探针的 `trust:user` 词汇，然后才有用户注意到 roster 里少了条目；
- jobs 重写由 `/stop-continuation` 级联 e2e（取消集合断言）与后台通知场景捕获——*前提是它们被跑*；一次绿色 boot 证明不了任何事；
- v4 信封由驱动自己的夹具解析器捕获。

因此适配顺序是被强制的：先修 **jobs** 面（小、孤立），再修 **preset 注册**（核心功能），然后修 **观测基础设施**（v4 信封）——只有在那之后才翻 D7 pin 并重生成 L1+L2 证据，因为 release 行必须它所宣称的运行时上是 `tested`。

## 8. 范围草估（在 ROADMAP Phase 4.5 中定量）

| 工作项 | 规模 | 说明 |
|---|---|---|
| `ctx.jobs` 适配（3 个文件） | 小 | caller → `SessionId`；`ownerSession` → `owner`；`onJobDone` → `events.subscribe({owners:'scope'})` + `settled.awaited`；`start` 的 JobSpec 改形 |
| 协奏 preset 改走 `agentPresets.register()` | 中 | sentinel 管线保留，写文件出口替换；roster/探针断言去 `trust`、改指 registry roster 与已组合 agent 树 |
| 会话日志 v4 信封 | 中 | 测试 profile 维持 `compression: none`；驱动伪造条目与解析器迁到 v4 `tool/result` 形状 |
| `kind:'plugin'` → 专属 source kind | 小（可延后） | 13 处；已废弃惯用法，非活断裂 |
| pin 机器（ci.yml `DSH_VERSION`、`bump-dsh.sh` 的 0.1.x 假设、doctor-lite 的 D7 semver 断言、兼容矩阵行） | 小 | 刻意**最后**做——在 0.2.0 上证据链全绿之后 |
