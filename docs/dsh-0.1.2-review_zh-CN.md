# dsh 0.1.2-alpha.1 复核调研报告

> 中文译本；主文档（英文）见 [dsh 0.1.2 Review (English)](./dsh-0.1.2-review.md)。
>
> **性质**：纯调研记录，不含任何行动承诺；不更新决策、PRD、可行性报告，不 bump 版本。
>
> - 调研日期：2026-08-29
> - 调研对象：deepseek-harness 仓库（本地路径 `/home/linletian/GithubRepo/deepseek-harness/`，全程只读），tag `dsh-v0.1.2-alpha.1`，HEAD commit `6c705be1ce`
> - 对照基线：本项目 CI pin 的 dsh `0.1.0-rc.6`（决策 D7）；MVP 已结项（FR-1~FR-8 实现、V1~V4 验证通过，见 [mvp-pitfalls](./mvp-pitfalls_zh-CN.md)）
> - 调研方法：静态源码阅读 + git 历史核实（两个 explore 子代理并行调研，关键结论由主代理抽查原文复核）

---

## 1. Codex 作为 sub-agent：实现机制（本次重点）

### 1.1 架构：命名的 SubagentProvider + 进程外 JSON-RPC 桥

Codex 支持落在 `packages/subagent/subagent-codex/`（`@deepseek-ai/dsh-subagent-codex`）。它**不是一个新工具**，而是注册在 `ctx.subagents` 服务上的一个命名 provider；模型侧仍然只面对通用的 `dsh-tool-subagent` 委派工具，由该工具按 config 中的 `provider` 名分发：

```
model 调用 subagent_codex({description, prompt})
  → dsh-tool-subagent（config.provider = 'codex'）
  → ctx.subagents.start('codex', request)
  → CodexProvider.start()
  → spawn `codex app-server --stdio`（Node 启动内嵌的 @openai/codex@0.149.1 包内 wrapper，不解析宿主 PATH）
  → JSON-RPC：initialize → thread/start（ephemeral: true，带 cwd / 可选 model / 权限参数）→ turn/start（纯文本任务）
  → 监听 item/completed（agentMessage, phase=final_answer）→ 终结于 turn/completed
  → SubagentResult { output, structured?, diagnostic?, stopReason }
```

关键证据：

| 内容 | 位置 |
|---|---|
| `SubagentProvider` 公开契约（`name` / `capabilities` / `inheritsParentContext` / `start()` / `prepareContinuable?`） | `packages/subagent/subagent/src/types.ts:300` 起 |
| `SubagentCapabilities` 五旗标（`agentOptions` / `outputSchema` / `depthLimit` / `toolFilter` / `persona`） | `packages/subagent/subagent/src/types.ts:86-92` |
| `SubagentResult` 终结语义 | `packages/subagent/subagent/src/types.ts:227` 起 |
| 进程外后端共享助手：`NO_START_CAPABILITIES` / `settleRunResult` / `subprocessRunHandle` | `packages/subagent/subagent/src/out-of-process.ts:57`、`:192`、`:245` |
| Codex provider 入口（Config schema + 注册） | `packages/subagent/subagent-codex/src/index.ts:36` 起 |
| 进程启动（包内 bin 解析 + argv） | `packages/subagent/subagent-codex/src/run.ts:43-52`、`:134` |
| Codex app-server 最小 JSON-RPC wire | `packages/subagent/subagent-codex/src/wire.ts` |
| standard preset 中 disabled 的 `tool-subagent-codex` 行 | `packages/preset/agent-presets/presets/standard/agent.cordis.yml:209-216` |

provider 实例 config 表面（`subagent-codex/src/index.ts:36-50`）：

```ts
interface Config {
  providerName?: string   // ctx.subagents 上的注册名，默认 'codex'
  model?: string          // 该实例固定的原生 Codex 模型；缺省继承 Codex 自身设置
  env?: Record<string,string> // 显式环境覆盖（父环境先经凭据擦除）
  permissionMode?: 'never' | 'approve-for-me' | 'dangerously-bypass-approvals-and-sandbox'
  disposeGraceMs?: number // 进程树终止宽限，默认 3000
}
```

standard preset 自带的工具行（默认 `disabled: true`，官方注释指引：安装 Bundle 后复制 preset 并移除 `disabled`）：

```yaml
- id: tool-subagent-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  disabled: true
  config:
    provider: codex
    toolName: subagent_codex
    backgroundMode: one-shot
    maxDepth: provider-managed
```

### 1.2 安装形态：Profile Bundle

包内 `package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，patch 为 host 面 insert 行；用户以 `dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex` 安装即自动叠加（`apps/cli/reference/README.md:51`）。认证沿用 Codex 原生语义（`CODEX_HOME` / `HOME` / cwd 继承；API key 类变量经 `env` config 显式注入）。Claude Code 有同构的 provider（`subagent-claude-code`），两者共用同一设计记录 `.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.md`。

### 1.3 版本沿革（git 核实）

- 初始特性 commit：`1daa35b6e3 feat(subagent): add Codex product provider`
- **首个包含 Codex provider 的 tag：`dsh-v0.1.0-rc.7`**（`99f6f02fec`）。注意：`0.1.0-rc.5` / `rc.6` 只有 release commit 而无 tag；但 rc.6 的 standard preset 已携带 disabled 的 codex/claude-code 工具行（本项目 MVP 在 concerto preset 中是有意 DROP 它们的，见 `patches/omo-dsh/omo-agents/concerto/agent.cordis.yml:54-59`）
- rc.8：provider 可作为 Bundle 直接安装、命名 provider 实例、非交互权限模式
- 0.1.1：one-shot 后台任务接线、DSH SDK 模型路由准备
- 0.1.2：`fe8a961348 feat(subagent): configure Codex provider models`（实例级 `model` 覆盖）、`aefc083be7 feat(subagent): authorize selectable child models`（子模型选择白名单）

### 1.4 对本项目的两点启示

1. **`SubagentProvider` 是公开扩展点，不是官方特权。** 任意第三方 scratch plugin 可以实现该接口、借助 `out-of-process.ts` 的共享助手（生命周期 / 取消 / 诊断 / 幂等处置已由官方处理），把**任意外部 CLI agent** 包成 dsh subagent，再用一行 `dsh-tool-subagent` 实例暴露给模型。这正是可行性报告中多 harness 适配（`omo-codex` 等）设想对应的官方路径，且自研成本比预想的"自建桥接"低一个量级。
2. **进程外 provider 能力为零。** `NO_START_CAPABILITIES`（`out-of-process.ts:57-63`，注释原文："A child in another process cannot honor parent-enforced start features… so the service rejects a request needing any of them before `start` runs — never accepted-then-ignored"）。即：协奏模式的"每 agent 独立 `{provider, model}` 路由 + `toolFilter` 只读过滤 + `maxDepth` 深度帽"纪律**只对 in-process provider（spawn / fork）成立**；codex 类 subagent 的模型只能固定在 provider 实例 config 的 `model` 字段（0.1.2 起支持），深度帽只能写 `provider-managed`，无法在委派时由工具 config 施加过滤或路由覆盖。这是编排设计上的真实约束。

---

## 2. rc.6 → 0.1.2-alpha.1 版本 delta（与本项目相关项，逐条 git 核实）

> 说明：本地 dsh 仓库无 `0.1.0-rc.5`/`rc.6` tag，最早可用 tag 为 `dsh-v0.1.0-rc.7`；rc.6 时代的事实以 release commit `15148dbd9a release(dsh): 0.1.0-rc.6` 的 tree 为准核实。

### 2.1 官方 preset：id 重命名 + 位置搬迁，显示名不变

- rc.6：preset 位于 `apps/cli/config/agent-presets/{standard,code,minimal,cordis}/`（含 `preset.yml` + `agent.cordis.yml`）
- 0.1.2：preset 搬迁并 bundle 进 `packages/preset/agent-presets/presets/{standard,ptc,minimal,cordis}/`（`f94495e527 refactor(preset): bundle the shipped presets inside dsh-agent-presets`）
- **id `code` → `ptc`**（`3ca9c7d489 rename code-mode to ptc`），PTC 模式描述中 "Code Mode SDK" 同步改为 "PTC 模式 SDK"
- **4 个模式的显示名与排序完全未变**（rc.6 与 HEAD 的 `preset.yml` 原文逐字一致）：`standard`=标准模式（order 1）、`code`/`ptc`=PTC 模式（order 2）、`minimal`=极简模式（order 3）、`cordis`=**创造模式**（order 4，描述为"用于创建自定义 Agent preset"）

对本项目的影响：PRD §4.2 的"标准 / PTC / 极简 / 创造"四模式表**在显示名层面依然准确**（"创造"即 `cordis` preset，并未消失）；但 `patches/omo-dsh/omo-agents/concerto/agent.cordis.yml:9-10` 的 derivation ledger 引用的对照路径（`dsh 0.1.0-rc.6 config/agent-presets/standard/agent.cordis.yml`）在新版中已失效——未来 bump 时需按新位置重新 diff 派生。

### 2.2 subagent 子系统：既有机制不变，新增三项能力

既有（MVP 已验证）机制全部保留：`agentOptions.{provider,model}`、`toolFilter.{allow,deny}`、扁平 `maxDepth`（默认 3、`0` 禁止委派、`'provider-managed'` 不下发帽；数值帽要求 provider 有 `depthLimit` 能力，否则挂载即报错）——`packages/subagent/tool-subagent/src/index.ts:77-103` 及 schema `:130`。

新增：

| 能力 | 说明 | 代表 commit |
|---|---|---|
| `modelSelectionSettings` | 工具行可采样 Host `subagent-model-selection` 用户设置并向子会话继承；配合白名单授权模型可选子路由 | `aefc083be7`、`822d735356 feat(session): persist model selection and share its catalog` |
| 命名 provider 实例 | 同一 provider 包可挂多个命名实例（如多个不同 `model` 的 codex） | rc.8 窗口 |
| one-shot / continuable 后台模式 | `backgroundMode` 区分默认前台一次性与后台可续子代理 | rc.8~0.1.1 窗口 |

### 2.3 session 事件：读取 fail-closed

`42dc2a46c2 refactor(session): require known event types on read`——读取时拒绝未知事件类型。本项目的影响面：prove 脚本（`prove-route-logging.mjs` 等）是**外部解析** session JSONL，不经 dsh 读取路径，不受影响；但若未来向 session 追加自定义事件，需先确认事件类型注册，否则 dsh 自身读取会话会报错。

### 2.4 其余头线条目（仅列与本项目相邻的）

- LLM：`dsh-llm-deepseek`（路由名 `deepseek-official`）与 `dsh-llm-pi-ai` 双 adapter 格局不变；图像请求管线统一、DeepSeek reasoning content 修复
- boot/插件：profile bundle 体系稳定化，`dsh plugin --profile add/remove` 管理树外 bundle
- 构建：Host/Client 双面正式化（`docs/development.md:46-76`），client 构建产物与 profile 绑定校验

---

## 3. 既有规划假设复核结论

MVP 的 V1~V4 及其依赖机制在 0.1.2 中**全部仍然存在**，方向无需重审：

| 规划依赖 | 0.1.2 现状 | 证据 |
|---|---|---|
| V1：scratch plugin 经 `dsh --patch ./cordis.yml` 加载 | 保留；层级为 bundle patches → profile patch → home patch → `--patch`（后者赢） | `apps/cli/src/args.ts:25,52,132`；`packages/boot/app-boot/src/index.ts:300-352`；`apps/cli/reference/README.md:9-11` |
| 协奏模式第 5 preset 可注册 | preset 名册开放（`ctx.agentPresets`；roots 配置 + 用户根 `<dshHome>/.agent-presets` + `copy()`） | `packages/preset/agent-presets/src/index.ts:149,159-167,535` |
| V2：`agentOptions.{provider,model}` 覆盖 | 保留（仅 in-process provider 支持） | `tool-subagent/src/index.ts:77-78,113-123` |
| V3：`agent/pre-step` waterfall + `agent.inject()` | 保留 | `packages/core/agent/src/runtime-types.ts:238`（`@mode waterfall`）、`:142-149` |
| V4：`toolFilter` + `maxDepth` | 保留（扁平 `maxDepth`，无 `policy` wrapper，与 P-5/P-10 记录一致） | `tool-subagent/src/index.ts:88-103,130` |
| session JSONL 记录子代理已解析路由 | 保留（`request/header` / `request/context` / `subagent/descriptor`；子会话头含 `origin: 'subagent'`、`parentSession`、`delegationDepth`、`agentPreset`） | `packages/core/session/src/types.ts:85-98,184-203`；`packages/subagent/subagent/src/descriptor.ts:51-86` |
| deepseek + pi-ai 双内置 adapter | 保留 | `packages/llm/llm-deepseek/src/index.ts:83-89`；`packages/llm/llm-pi-ai/src/index.ts:234,287` |

新增约束（§1.4-2）：上述 V2/V4 纪律不适用于进程外 provider——这在 MVP 范围（仅用 spawn）内无影响，但属于多 harness follow-up 的既定前提。

---

## 4. 潜在后续方向（仅记录，非承诺）

按价值/成本排序，留待决策：

1. **文档事实同步**（低成本）：把 §2 的 delta 与 §1.4 的扩展点结论以注记/新决策形式沉淀到 decisions / PRD / feasibility-report。
2. **DSH pin bump 验证**（中成本）：CI pin `0.1.0-rc.6` → `0.1.2-alpha.1`，按新 preset 位置重派生 concerto preset 对照，全量重跑 `ci-local.sh` 与四个会话外探针，复验 P-1.2/P-1.3 fallback 在重构后的 preset 子系统下是否仍需；即 PRD 中留作 follow-up 的 #9 bump 事项。
3. **codex subagent 集成 spike**（中高成本，需 codex 凭据）：在协奏 preset 中启用 `tool-subagent-codex`（`permissionMode: 'never'` 贴合无人值守编排），验证"指挥者跨 harness 委派"，产出未来外部 CLI agent 适配器模板。

---

**English version**: [`dsh-0.1.2-review.md`](./dsh-0.1.2-review.md)
