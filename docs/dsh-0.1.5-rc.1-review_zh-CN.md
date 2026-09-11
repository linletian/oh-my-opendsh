# dsh 0.1.5-rc.1 复核 —— MVP 同步验证

> 中文译本；主文档（英文）见 [dsh 0.1.5-rc.1 Review (English)](./dsh-0.1.5-rc.1-review.md)。

> **性质**：一份带证据链的验证记录，不是行动承诺。它不 bump DSH pin，不编辑 preset，不触碰 `.omo/compat.yaml`。
>
> - 验证日期：2026-09-10
> - 验证目标：`/home/linletian/GithubRepo/deepseek-harness/` 的 deepseek-harness 检出（只读），版本 `0.1.5-rc.1`，tag `dsh-v0.1.5-rc.1`，HEAD commit `aa8262ec09`；以及**已发布**的 `@deepseek-ai/dsh@0.1.5-rc.1` npm 包，安装进一次性 prefix
> - 对照基线：dsh `0.1.0-rc.6` —— 本项目 CI pin 的版本（决策 D7），也是 MVP 验证时所用的运行时（`.omo/compat.yaml` 的 `tested` 行）
> - **配套件**：[`dsh-0.1.5-rc.1-upgrade_zh-CN.md`](./dsh-0.1.5-rc.1-upgrade_zh-CN.md) —— 实施 + 验证记录（改了什么、门禁前后对照表）
> - 方法：(1) 枚举 MVP 触碰的每一个 DSH 表面；(2) 按包 `git diff 15148dbd9a..dsh-v0.1.5-rc.1`；(3) **让 MVP 自己的门禁在 0.1.5-rc.1 上跑** —— `doctor-lite`、`verify-concerto-static`、`check-docs-consistency`、`vitest run`、`tests/e2e/drive.mjs`、`prove-explore-*.mjs`；(4) 对安装器落盘的 preset 驱动一次真实的 `dsh web` 启动 + `session/create` RPC

---

## 1. 判定

**是 —— 一个硬断点阻断 0.1.5-rc.1 上的 MVP，外加一个观察通道断点阻断 e2e 门禁。**

MVP 的插件半完好：在 0.1.5-rc.1 上 `@oh-my-opendsh/omo-agents` 能启动、注册它的 `agent/pre-step` listener、解析两条模型路由、组装两份 persona、把 preset 落盘到 `$DSH_HOME/.agent-presets/concerto/`、并读取 roster —— 六个启动标记全部在场，roster 为 `standard:system,ptc:system,minimal:system,cordis:system,concerto:user`。

**preset 半断裂**：`persona` 行的配置键被改名（`text` → `prefix`，现为必填），于是 composition 挂载失败，*每个*指名 `concerto` 的会话都被拒绝。preset 里没有别的东西断裂 —— explore 委派绑定（`provider` / `toolName` / `backgroundMode` / `persona` / `agentOptions` / `toolFilter` / `maxDepth`）在 0.1.5-rc.1 上照常通过校验并继续强制。

| 严重级 | 发现 | 阻断 |
|---|---|---|
| **P0 —— 硬断点** | `@deepseek-ai/dsh-persona` 配置 `text:` → `prefix:`（必填）+ 新增 `suffix` | 协奏模式不可选；全部四个 e2e scenario |
| **P1 —— 门禁断点** | 会话日志文件名 `session.jsonl` → `session.v3.jsonl`（format v3） | e2e driver 的整条落盘观察通道 |
| **P1 —— 门禁断点** | `subagent/descriptor` `version` 2 → 3 | driver 的构造 fixture QA 路径 |
| **P1 —— 门禁断点** | `dsh-tool-subagent` 现在注入 `sessionProjections` | `prove-explore-maxdepth.mjs`（T13 证明） |
| **P1 —— 盲区** | 没有任何门禁拿 `persona` 行对照已安装 schema 校验 | 本该抓住 P0；实际却 4/4 + 10/10 + 104/104 通过 |
| **P2 —— 对齐** | `present` 行（`@deepseek-ai/dsh-tool-present`）、`tool-web` `fetch`、persona `suffix` | 无；仅派生纪律 |

---

## 2. P0 —— persona 配置改名

### 2.1 变更内容

```diff
-export const Config: z<Config> = z.object({
-  text: z.string().required(),
-  complete: z.boolean().default(false),
-  includeRuntimeContext: z.boolean().default(true),
-})
+export const Config: z<Config> = z.object({
+  prefix: z.string().required(),
+  suffix: z.string().default(''),
+  complete: z.boolean().default(false),
+  includeRuntimeContext: z.boolean().default(true),
+})
```

`packages/preset/persona/src/index.ts:49-54`。单一的 `deployment:persona` 分节被拆成 `deployment:persona-prefix` + `deployment:persona-suffix`；`apply()` **两个都注册**，suffix 以 `text: config.suffix ?? ''` 注册（`:53-58`）—— 于是省略 `suffix` 的 preset persona 行会把部署级 suffix 一并影子掉，正如它在 rc.6 上影子掉整个部署级 persona 一样。

**版本边界（git 实证）：** `dsh-v0.1.3-alpha.1` 时缺席，`dsh-v0.1.3-alpha.2` 时在场；此后至 `dsh-v0.1.5-rc.1` 未变。已在 `.omo/compat.yaml` 登记为 `untested` 的 0.1.2-rc.1 行不受此变更影响。

schemastery 仍**保留**未声明键在校验后的对象里，但 `dsh-persona` 只读 `prefix` —— 于是旧的 `text:` 能过校验**却毫无效果**：没有任何警告，persona 文本永远不会被用到，挂载在缺失必填 `prefix` 上失败。

### 2.2 证明 —— 真实产品路径

`scripts/install-concerto.sh` 把发布的 preset 落盘进一个一次性 `$DSH_HOME`，然后让一次真实的 `dsh --profile web` 启动（经 Typert Remote web RPC，即 Web UI 自用的同一传输）在其上创建会话。服务器逐字应答：

```
POST /api/agentPresets/list
  → 200 … {"presets":[…,{"id":"concerto","trust":"user","isDefault":false,
      "name":"协奏模式 (Concerto Mode)","description":"编排优先…"}],"authorable":true}

POST /api/session/create  {request:{cwd, agentPreset:"concerto"}}
  → 200 {"result":{"ok":false,"error":{"code":"agent-preset/invalid",
      "message":"agent-presets: preset \"concerto\" failed to mount:
        failed to apply loader entry persona (@deepseek-ai/dsh-persona):
        invalid config:\n  - $.prefix missing required value (at prefix)
        (/…/.dsh/.agent-presets/concerto/agent.cordis.yml)"}}}
```

两件事值得记录：preset **带着真实显示名、且无 `broken` 标记**被列出 —— 发现阶段的健康检查只证明每行的*模块可解析*（`agent-presets/src/discovery.ts:250-262`），从不证明其 config 可校验 —— 于是失败在创建会话之前完全不可见。而且失败是彻底的：`agent-preset/invalid` 是硬拒绝，不是降级模式。

插件路径以同样方式失败，在 `session/create` 处，四个 e2e scenario 全是：

```
{"result":"FAIL","scenarios":[{"name":"hello","result":"FAIL",
  "failed":["driver error: rpc session/create failed: {"ok":false,"error":
   {"code":"agent-preset/invalid","message":"agent-presets: preset \"concerto\"
    failed to mount: failed to apply loader entry persona (@deepseek-ai/dsh-persona):
    invalid config:\n  - $.prefix missing required value (at prefix)"}}]} …]}
```

### 2.3 设好 `prefix:` 之后什么能工作

只给三处 `text:`→`prefix:` 打补丁（插件源码、模板、e2e needle）后重跑未改动的 driver，失败被整体推过挂载点：

- 会话能创建能跑；mock LLM 看到完整链路 —— `mockRequestRoles: ["sisyphus","explore","explore","sisyphus"]`，恰好 2 次指挥请求 + 2 次子代理请求
- 子代理的 `request/header` 显示 explore 路由（`provider: deepseek`，`model: deepseek-v4-flash`），而父代理跑 `deepseek-official/deepseek-v4-pro` —— AC-5 路由对成立
- 子代理的可见工具为 `ask_user_question, bash, create_goal, get_goal, glob, grep, interrupt_agent, job_kill, job_list, job_output, list_agents, read, read_image, send_message, skill, todo_write, update_goal, web_fetch, web_search` —— **`write`、`edit` 与委派工具全部缺席**，即 T12/F1/AC-6b 加固在 0.1.5-rc.1 上是物理强制的
- 子代理日志携带 FR-6 注入（`source.plugin` 为 `omo-agents` 的 `user/message`），即 `agent/pre-step` + `agent.inject()` 在 0.1.5-rc.1 上仍然落地
- 子代理的 **system prompt 是 explore persona**，而非部署级 persona —— `# Explore: Read-Only Retrieval Agent` 在场，而 `# Orchestrator Role` 与 `You are a coding agent powered by` 双双缺席。影子分节在同一区间被改名（`deployment:persona` → `deployment:persona-prefix`，`subagent/src/child-agent.ts:209-214`），但写入方（`dsh-persona` 的 preset 行）与该影子目标是一起移动的，所以 T11 绑定不受影响。

该轮运行里剩余的失败全是 `sessionLogFound: false` —— 即下方发现 3，而非 dsh 回归。

### 2.4 改动点

| 文件 | 位置 |
|---|---|
| `patches/omo-dsh/omo-agents/src/system-prompt.ts` | `:71` `sentinelValue`、`:76` 报错文本、`:83` 替换（`text: |-` → `prefix: |-`） |
| `patches/omo-dsh/omo-agents/concerto/agent.cordis.yml` | `:118` `text: __OMO_SISYPHUS_SYSTEM_PROMPT__` |
| `patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml` | `:39` `text: \|-` |
| `tests/omo-agents/system-prompt.test.ts` | `:38`、`:39`、`:116`、`:125`、`:130`、`:141`、`:147`、`:152` |
| `tests/omo-agents/concerto-preset.test.ts` | `:151` |
| `tests/e2e/drive.mjs` | `:82`（注释）、`:807` `MOCKROLE_BLOCK_SCALARS.sisyphus.needle` |
| `scripts/concerto-mode-probe.sh` | `:561` `grep -q "prefix: \|-"` |

`scripts/verify-concerto-static.mjs` 无需改断言（c09 查的是 persona *内容*），但 c01/c10 无论哪种情况也都抓不住这个回归。

---

## 3. P1 —— 会话日志代际改名

`dsh-session-persistence-jsonl` 新增了 format 代际层（`format.ts:50-75`、`generation.ts`、`lease.ts`、`storage.ts`；该包 +9,771/−1,568 行）。规范文件名现在携带 format 版本：

> Version zero retains the original suffix-only name; every later generation carries a lowercase numeric `vN` component. —— `packages/session/session-persistence-jsonl/src/format.ts:50-54`

一次真实 0.1.5-rc.1 运行后盘上的实测：

```
$DSH_HOME/sessions/--tmp-…-project--/<sessionId>/session.v3.jsonl
$DSH_HOME/storages/session_projcache/…            ← 新的 projection 缓存
```

rc.6 写的是 `session.jsonl`（`.npm-global/…/dsh-session-persistence-jsonl/lib/index.js:892`）。v3 format 本身在 `dsh-v0.1.5-alpha.1` 或更早落地（`session-format-v2-to-v3` 迁移包首次出现于该版本；`session-format-v0-to-v1` … `v2-to-v3` 在 HEAD 全部在场）。

`tests/e2e/drive.mjs:687` 按 `entry.name === 'session.jsonl'` 过滤，于是 `findSessionLogs` 什么都找不到，`awaitTurnEnd` 永远等不到 `turn/end`，每个从日志派生的断言同时失败 —— `hello` 5 个、`concerto-delegation-demo` 10 个、`explore-write-denied` 6 个、`explore-nested-delegation-denied` 6 个。mock 侧断言（`mockSawExpectedRequestCounts`、`mockRequestOnSisyphusModel`）仍然通过 —— 这正是"harness 本身是好的、只有观察通道过期"的指纹。

修复：匹配代际文件名（`session.vN.jsonl`）而非固定名 —— 持久化包自用的那个 format-version 感知读取器才是诚实的形态，因为硬编码 `session.v3.jsonl` 会在 v4 上再次断裂。

---

## 4. P1 —— `subagent/descriptor` v2 → v3

`SUBAGENT_DESCRIPTOR_VERSION` 在 `dsh-v0.1.0-rc.8` 为 `2`，自 `dsh-v0.1.2-rc.1` 起为 `3`（`packages/subagent/subagent/src/descriptor.ts:48`）。版本不匹配不是错误 —— `foldSubagentDescriptor` 返回 `undefined`（`:210`），于是旧 fixture 读作"没有 descriptor"。

rc 时代的复核已为 0.1.2 记录过此事（其 2026-08-29 附录第 3 条），但 driver 的构造 descriptor fixture 仍盖着 `version: 2`（`tests/e2e/drive.mjs:1316`，位于 `fabricatedChildLog`；相邻的 `fabricatedNegativeChildLog` 在 `:1379`，其事件构造不带 descriptor，无需改版本）。一条真实的 0.1.5-rc.1 子代理日志现在是：

```json
{"version": 3, "mode": "one-shot", "provider": "spawn", "label": "Attempt a project write"}
```

路由字段仍只出现在 continuable descriptor 上，而 driver 早已从 `request/header` 读取实际执行的路由（`:1001-1007`）—— 所以只需移动 fixture 的版本常量。

---

## 5. P1 —— `dsh-tool-subagent` 现在注入 `sessionProjections`

```ts
export const inject = ['tools', 'subagents', 'systemPrompt', 'sessionProjections']
…
ctx.sessionProjections.register(subagentModelSelectionProjectionDefinition)
```

`packages/subagent/tool-subagent/src/index.ts:45` 与 `:326` —— `sessionProjections` 是新增的，且 register 调用是无条件的，并未门控在 `modelSelectionSettings` 之后。

`@deepseek-ai/dsh-agent-loop` 在同一区间获得了同样的依赖 —— `static inject` 从 `['agents','sessions','llm','tools','systemPrompt']`（rc.6，`packages/core/agent-loop/src/index.ts:297`）变成同一列表**外加 `sessionProjections`**（已安装的 `dsh-agent-loop/lib/index.js:1481-1488`），且 loop 在一个 turn 中*读取*它（`sessionProjections.stateOf(session, 'turnBoundary')?.lastTurn ?? 0`，`:765`）。所以它不只是"在场"要求：一个 no-op stub 会改变行为，fixture 必须挂载真实的 registry（`@deepseek-ai/dsh-session-projection`）。

任何挂载这两行之一的 harness 现在都必须提供该服务，否则插件停在 `waiting` —— `tool-subagent` 不注册任何工具，`agent-loop` 让 `ctx.agentLoop` 保持 undefined。`scripts/prove-explore-maxdepth.mjs` 挂载的是真实栈加 stub 的 `agents` + `sessionPersistence`，但没有 `sessionProjections`，于是 T13 证明失败于"depth-1 父代理看不到 explore 工具" —— 这是 fixture 缺口，不是 cap 回归。`scripts/prove-route-logging.mjs` 带有同一缺口的 `agent-loop` 形态，外加两处不相干的断裂（`agentLoop.create` 现为 `async`；日志文件名带代际）；两个脚本均已修复，且现由第 8 道门禁覆盖（§8 P-20.7）。`scripts/prove-explore-toolfilter.mjs` 从不曾需要它，因为它走的是 `applyChildComposition`，而不是挂载插件行。

`Config` schema 本身除两个新增的、可选的键（`modelSelectionSettings`、`agentOptions.reasoningEffort`）之外未变，未知名键仍被保留 —— 这正是整条 explore 绑定能干净通过校验的原因。

---

## 6. P1 —— 门禁套件对 P0 完全失明

面对 0.1.5-rc.1，未改动的仓库：

| 门禁 | 结果 |
|---|---|
| `pnpm vitest run` | 9 个文件，**104/104 PASS** |
| `node scripts/doctor-lite.mjs` | **4 pass，0 fail** —— `dsh 0.1.5-rc.1 (pinned 0.1.x, decision D7)` |
| `node scripts/verify-concerto-static.mjs` | **10/10 PASS** |
| `node scripts/check-docs-consistency.mjs` | **7/7 PASS** |
| `pnpm test:e2e` | 0/4 scenario，`agent-preset/invalid` |

`doctor-lite` 的 `subagent-config` 检查确实急切地运行了已安装的 schema —— 但**只对 `tool-subagent-explore` 那一行**（`scripts/doctor-lite.mjs:377-470`）。`persona` 行从未被校验，而 `verify-concerto-static` 的 c01 只证明 YAML 可解析。于是 MVP 实际弄断的那个 schema，恰好是没有任何 schema 门禁的那一行。

`doctor-lite` 已具备修复所需的一切 —— 它能解析出已安装 dsh 的 `node_modules`（`resolveDshNodeModules`，`:83`），并从那里导入插件的 `Config`。把检查 4 泛化为"渲染后协奏模板的每个带 config 的行，对照该行已安装的 `Config`"，即可以零额外成本为未来的每一次改名拦住这类断裂：

```
schema-drift: 13 row(s) checked against <dsh install>, 1 FAIL
FAIL  persona (@deepseek-ai/dsh-persona): ValidationError: $.prefix missing required value
PASS  tool-subagent-explore (@deepseek-ai/dsh-tool-subagent)
PASS  tool-web / tool-todo / tool-fs-search / skill-filesystem / agent-instructions / …
```

（composition 里也有其包根本不导出 `Config` 的行。发货的门禁把它跳过的确切集合 —— 在本 composition 上是 `command-goal`、`command-compact`、`tool-subagent-control`、`tool-subagent-control/list-agents`、`tool-ask-user` —— 报告为 *unchecked*，绝不算 pass。**计数口径提醒：** 下方的原型只读具名 `Config` 导出，故数出 13 行；发货的检查还接受类插件的 `default.Config`，数出 16 行。两个分母在各自规则下都正确；同类与同类比。）

---

## 7. P2 —— 对齐与派生事项（无断裂）

1. **`present` 行** —— `@deepseek-ai/dsh-tool-present` 是新增的（首现于 `dsh-v0.1.5-alpha.2`），且每个 shipped preset 现在都以 `- id: present` 收尾（`packages/preset/agent-presets/presets/standard/agent.cordis.yml:253-254`）。添加它是派生纪律的默认动作，但该包在 rc.6 上不存在，所以它与地板抬升耦合 —— 而不是与本次修复耦合。
2. **`tool-web` `fetch`** —— `patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml:293` 仍写 `fetch: false`，而旧模板早已跟随上游为 `fetch: true`（`concerto/agent.cordis.yml:307`）。本仓库内部的跨交付件漂移，与 dsh 无关。
3. **`persona.suffix`** —— 上游 standard preset 现在设置 `suffix: Your working directory is {{cwd}}.`，因为该行会影子掉部署级 suffix。协奏把它影子为空，恰如它在 rc.6 上影子掉整个部署级 persona，所以这是对齐机会而非回归 —— 且组装出的 omo-sisyphus prompt 仍正确地拒绝 `{{` 序列（`suffix` 是独立 config，若采纳可安全携带 `{{cwd}}`）。
4. **`includeShippedRoot`** —— `dsh-agent-presets` 现在前置它自己捆绑的 shipped root（`discovery.ts:60`，config `:110-111`），取代 `composeProfile` 对该行 `roots` 的强制改写（rc.6 的 `apps/cli/src/profile-boot.ts:164`；在 0.1.5-rc.1 上**已移除** —— `roots` 不再出现在 `apps/cli/src` 的任何地方）。这使踩坑 **P-1.3** 失效：给 agent-presets 行的 `roots` 添加仓库目录的 config 覆盖不再是死路，于是未来的安装机制可以声明式注册一个 preset root，而不必往 `$DSH_HOME/.agent-presets/` 写文件。

   在任何人依赖它之前要记录一条保留 —— 新的 root 顺序是 **shipped → configured → user**（`agent-presets/src/index.ts:178-182`），且解析按 id 先到先得。rc.6 上 configured root 在前，于是 configured root 能影子掉 shipped id；现在是 shipped 集合赢。对 `concerto` 无害（唯一 id，且这正是第 5 模式的意义），但它意味着：未来若某个安装在 configured root 下携带自己的类 `standard` id，会被静默压过，而不是合并。

5. **我们自己注释里的过期符号名**（外观问题，但本仓库视引证为承重件）—— 五处文档注释仍写着改名前的影子分节 `deployment:persona`，而自 0.1.3-alpha.2 起它是 `deployment:persona-prefix`：`patches/omo-dsh/omo-agents/src/system-prompt.ts:19`、`patches/omo-dsh/omo-agents/src/explore-prompt.ts:13,25,38`、`tests/omo-agents/explore-prompt.test.ts:8,12`。每一处代码都是对的（§2.3 证明影子仍然落地）；只是被引证的标识符搬了家。

6. **`dsh web` 现在默认打开浏览器 —— 已通过特性探测该 flag 修复，而非假设它。** 该交接是新增的：`openBrowser: z.boolean().default(true)`（`packages/bundle/web-app/src/index.ts:61`），以第二行日志输出（`index.ts:274`），实测观察到 `dsh web: opening the default browser; pass --no-open to disable`。本仓库每个脚本启动时都不带 `--no-open` —— `cold-start.sh`、`concerto-mode-probe.sh`（三次启动）、`tests/e2e/drive.mjs`、`scripts/smoke-real.mjs` —— 于是每一个都会在开发者桌面上弹浏览器，而且**没有任何门禁能因它失败**（该交接既不阻塞也不改变 readiness 行），这正是它容易被漏掉的原因。

   修复刻意**不是**无条件的 `--no-open`：该 flag 与该交接都自 0.1.2 起存在，而更早版本的 web app 的 commander 会直接拒绝未知名选项（P-8.2 那一类 —— 根 flag 与 app flag 是两个解析器）。硬编码它会把每次 0.1.2 之前的运行 —— 包括 `scripts/compat-probe.sh` 刻意的旧版本探测 —— 变成 `error: unknown option`，读起来像 harness bug 而非版本事实。全部四个启动点现在改为询问 app 本身（`dsh --profile web --help | grep -- --no-open`），仅在被宣告时才传该 flag。实测输出：`cold-start: web app advertises --no-open (browser handoff suppressed)`。

   相关的 readiness 行变化无需修复：URL 现在携带 `?token=`，而每个解析器本就容忍它 —— `concerto-mode-probe.sh:412` 显式捕获 token，`tests/e2e/drive.mjs:642` 匹配可选的 token 组，`scripts/smoke-real.mjs:289` 在端口处即止。

7. **`dsh.profile.patchReload` 是新的 manifest 键，且它能让 patch 监听静默冻结。** `web` 是 `'live'`，但其余四个 shipped 模板是 `'startup'`（`packages/boot/app-boot/src/profile.ts:113-129`），且 `normalizeShippedProfile` 会把*已存在*的 rc.6 `headless` profile 原地改写为 `'startup'`（`profile.ts:694-716`）。此处无影响 —— 每个 MVP 脚本都用 profile `web` —— 且 `--patch` overlay 即便在 rc.6 上也从未被监听，所以本项目依赖的 composer 语义未变。记录在案是因为其失败模式是静默的，且会表现为令人困惑的"我的 patch 文件改动不生效了"。

---

## 8. 未变 / 复验仍为真

| MVP 依赖 | 在 0.1.5-rc.1 上的状态 | 证据 |
|---|---|---|
| `dsh --patch <file>` = 顶层数组、`insert:` 形态、`id:` 覆盖警告并跳过 | 未变 —— patch 引擎逐字节相同（仅 `1.0.6`→`1.0.7` 版本号 bump） | `apps/cli/src/args.ts:147`；`vendor/include/src/index.ts`（相同） |
| `dsh plugin --profile <p> add <dir>` | 未变的 pnpm 透传；没有新的一等 preset 安装命令，所以它 + `--patch` 仍是安装面 | `apps/cli/src/args.ts:190-198`、`plugin.ts` |
| profile 名 `desktop` | 启动、dump-config 与 `plugin` 上新拒绝（不区分大小写） | `apps/cli/src/args.ts:68-72,159,198` —— 无 MVP 脚本使用它 |
| inserted 行里的裸包 `name:` | 未变。**新增：** `insert:` 内的类路径名（`./x.mjs`、绝对路径）现在被重写为锚定**在 patch 文件旁**的 file URL（rc.6 是相对 profile 目录解析）；只有 `insert` 条目被遍历，override-by-id 行不在其列 | `packages/boot/app-boot/src/index.ts:326-336,367` —— MVP 的 `cordis.yml` 用裸包 specifier，不受影响 |
| `dsh --dump-config`、`dsh plugin --profile <p> add` | 未变 | 0.1.5-rc.1 上的 `dsh --help` |
| `dsh --version` 格式 | 未变（`0.1.5-rc.1`） | 已执行 |
| `ctx.agentPresets.list()` / `resolve()` / `copy()` / `standingKeyFor()` / `read()`、`AgentPreset.path` | 未变；rc 时代的五个错误类变为 `RemoteError` 代码 | `agent-presets/src/index.ts:248,343,540,741,501`；`preset.ts:24-45` |
| 用户根 `$DSH_HOME/.agent-presets` 自动追加 | 未变（`includeUserRoot` 默认 `true`） | `agent-presets/src/index.ts:110-111,181`；`discovery.ts:51` |
| `preset.yml`（`name` / `description` / `order`） | 模块逐字节相同 | `agent-presets/src/metadata.ts`（无 diff） |
| preset 挂载 / isolate realm 规则 | 不变量逐字节相同 | `agent-presets/src/mount.ts`、`invariant.ts`（未变 hunk） |
| `agent/pre-step` waterfall + `agent.inject(message)` + `session.header.origin === 'subagent'` | 保留 | `core/agent/src/runtime-types.ts:234-238,330`；实测观察到 |
| `tool-subagent` 的 `toolName` / `backgroundMode` / `persona` / `agentOptions` / `toolFilter` / `maxDepth` 语义 | 保留；`maxDepth` 强制与未知 deny 名处理不变 | `tool-subagent/src/index.ts`（diff）；T12 证明 PASS |
| `@deepseek-ai/dsh-llm-deepseek` + `dsh-llm-pi-ai` 行 | 保留且被组入 | `doctor-lite` 检查 3 PASS |
| 自 0.1.2 的 Web RPC 传输（token → `dsh-auth-*` cookie，`/api/<ns>/<method>`） | 未变；readiness 行现在还打印 `dsh web: opening the default browser; pass --no-open to disable` | 实测启动日志 |

经排查排除 —— 以下每一项都是该区间里真实的 API 变更，但本 MVP **不**触碰：

| 变更 | 为何咬不到这里 |
|---|---|
| shipped preset id `code` 改名为 `ptc`（`3ca9c7d489`，0.1.2 复核已首次记录） | 无 MVP 产物引用 id `code`；唯一的复制源是 `agentPresets.copy('standard', 'concerto', …)` |
| `UnknownPresetError` / `PresetMountError` / `PresetExistsError` / `PresetNotWritableError` / `InvalidPresetIdError` **被删除**，由 `RemoteError` 代码取代（`agent-preset/{not-found,invalid,read-only,locked}`） | 无 MVP 文件 import 或 `instanceof` 检测这五个中的任何一个；`concerto-plugin.host.js` 泛型捕获（`catch (e) { /* not present yet */ }`） |
| `writableRoot(roots)` → `writableRoot(roots, presetId)` | MVP 未调用 |
| `settingsNamespace()` 移除；`settings.register()` 现接受普通命名空间字符串 | MVP 未使用（`dsh-home-paths` 的 `resolveDshHome` 是唯一被重实现的 settings 面辅助函数，其 `$DSH_HOME`/`~/.dsh` 规则未变） |
| roster 现在硬要求 `ctx.baseUrl` 并注入 `sessionProjections`（`agent-presets/src/index.ts:101,166-176,201`） | 由 0.1.5-rc.1 上的真实 host composition 满足 —— 插件启动了且打印了 roster，所以两者在生产都在场；这只对手工搭的 fixture 要紧（§5 是同一事实的 `tool-subagent` 孪生） |
| 发现阶段的健康检查现在解析每行模块，并把不可解析的 preset 标记为 `broken`（`discovery.ts:194-257`） | 协奏 composition 的每行在正常安装下都可解析，roster 保持干净 —— 实测确认：该行带真实名称出现且**无** `broken` 标记（§2.2） |
| `dsh-system-prompt` config `persona` → `personaPrefix`（+ `personaSuffix`）—— 过期时被**静默忽略**，因为未知名键被保留 | 由上游的 host 面行持有；MVP 不挂载任何 `dsh-system-prompt` 行，也不在任何地方设置 `persona:` 键 |
| explore 行的 `agentOptions` 现在对**每次委派**强制执行 `llm` 路由预检（`tool-subagent/src/index.ts:497-512`、`model-selection.ts:160-195`），而不是把路由直接送进 start 请求 | 路由确实可解析：实测子代理跑在 `deepseek/deepseek-v4-flash` 上，其 `request/header` 可证。本项目早已对此建模 —— `prove-explore-maxdepth.mjs` 挂载带剧本化 adapter 的真实 `LlmRuntime`，*"so the preflight resolves genuinely"* |
| `agentOptions` 现在要求 provider 宣告 `agentOptions` capability（`tool-subagent/src/index.ts:335-339`）；`spawn`/`fork` 有，进程外后端（`acp`）没有 | explore 行用 `provider: spawn`（`subagent-spawn-in-process/src/index.ts:43`） |
| `agentOptions.reasoningEffort` 现在经 schema 校验（`.min(1)`）而非静默保留 | 协奏 composition 中无任何处设置它 |
| 挂载期 `isolate` realm 不变量与行激活审计 | 两个 commit 之间逐字节相同；协奏 composition 的 group 布局未变 |

---

## 9. 滞后于验证的簿记

- `.omo/compat.yaml` 没有 `0.1.5-rc.1` 的行，也没有 `0.1.3-alpha.*` / `0.1.5-alpha.*` 阶梯的行；已登记的最新 `dsh` 是 `0.1.2-rc.1`（`untested`，自 2026-09-05）。`scripts/compat-probe.sh 0.1.5-rc.1` 是产出该行的机制。
- `.github/workflows/ci.yml:43` pin 着 `DSH_VERSION: 0.1.0-rc.6`；`.github/workflows/compat-probe.yml:41` 把同一个 rc 装为其 YAML 解析器 provider。
- `README.md` / `README_zh-CN.md` 的 "Key Facts" 仍写着 dsh `0.1.0-rc.6`。
- `docs/dsh-0.1.2-review_zh-CN.md` §2 及其 §1.4 结论对 0.1.5-rc.1 仍然准确，除本文档取代它们之处（preset 位置、`persona` schema、`roots` 强制改写、session format v3）。
- 注意 D7 pin 是"major 0，minor 1"，所以 `doctor-lite` 检查 1 无需任何改动即接受 `0.1.5-rc.1` —— pin 不是本次升级的门。

---

## 10. 建议顺序

1. **修 P0**（§2.4）—— 七个位置，一次键改名。仅此即可让协奏在 0.1.5-rc.1 上可选。
2. **堵门禁洞**（§6）—— 把 `doctor-lite` 检查 4 从一行泛化到每个带 config 的行，使第 1 步是被证明而非被假定。
3. **修观察通道**（§3、§4）—— `findSessionLogs` 改为代际感知的日志文件名，driver fixture 改为 `version: 3`。
4. **修 T13 fixture**（§5）—— 在已 stub `agents` / `sessionPersistence` 之处补上 `sessionProjections` stub。
5. **闭环的是链，不只是发现**（§8 P-20.7）—— 探针与三个证明只在散文里被点名、没有任何链在跑，这正是其中两个早已腐烂的原因。`scripts/run-proofs.sh` 现在是 `ci-local.sh` 与 `.github/workflows/ci.yml` 的第 8 道门禁。
6. **然后，且只有然后，决定地板** —— bump CI pin，从一次 `compat-probe` 运行登记兼容行，并把需要 ≥ 0.1.5 的 P2 对齐项（§7）一并收入（`present`，以及可选的 `suffix` / `fetch`）。

第 1-4 步与 rc.6 兼容，可先落地于任何 pin bump 之前；第 5 步是刻意的 D7 升级。

---

## 11. 复现

```bash
# 0. 一次性 dsh 0.1.5-rc.1（真实 npm 产物；用户自己的安装不受影响）
npm install --global --prefix /tmp/dshprobe/prefix @deepseek-ai/dsh@0.1.5-rc.1

# 1. 产品路径所见的 P0：安装器落盘的 preset + 真实启动
#    + 经 web RPC 的 session/create          → agent-preset/invalid（§2.2）

# 2. MVP 自己的门禁，未改动仓库               → 104 unit + 4/4 + 10/10 + 7/7 PASS，
#                                                e2e 0/4（§6）
PATH=/tmp/dshprobe/prefix/bin:$PATH pnpm vitest run
PATH=/tmp/dshprobe/prefix/bin:$PATH node scripts/doctor-lite.mjs
PATH=/tmp/dshprobe/prefix/bin:$PATH node scripts/verify-concerto-static.mjs
PATH=/tmp/dshprobe/prefix/bin:$PATH node scripts/check-docs-consistency.mjs
PATH=/tmp/dshprobe/prefix/bin:$PATH node tests/e2e/drive.mjs

# 3. P0 的逐行精确 schema
#    用仓库自己的 syncConcertoPreset 渲染模板，然后拿每个带 config 的行
#    对照其已安装插件的 Config 解析（§6）
```

本次验证所用的沙箱位于 `/tmp/omoprobe/`（安装器路径探测 + 漂移门禁）与
`/tmp/omofix/`（§2.3 所用的最小 `prefix:` 草稿副本）；它们都不触碰真实的
`~/.dsh`，且 e2e driver 自带的凭据摘要在每次运行都确认 `realDshUntouched: true`。

---

**English version**: [`dsh-0.1.5-rc.1-review.md`](./dsh-0.1.5-rc.1-review.md)
