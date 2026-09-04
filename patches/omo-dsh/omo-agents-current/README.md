# omo-agents-current — Concerto Mode MVP for the CURRENT DSH runtime

> 当前 DSH 环境（新版 DeepSeek Harness，动态 Cordis 插件体系）上的协奏模式 MVP 归档。
> 运行时形态是**动态插件 `conc-1`**（进程级、会话专属，重启即失）+ **持久化用户 preset
> `~/.dsh/.agent-presets/concerto/`**（本目录 `preset/` 的镜像）。完整实现与验证报告见
> `docs/concerto-current-dsh_zh-CN.md`；踩坑 P-13~P-19 见 `docs/mvp-pitfalls*`。

## 目录内容

| 文件 | 说明 |
|---|---|
| `concerto-plugin.host.js` | 动态插件 `conc-1` pkg-6 的 Host 半（verbatim 归档；pkg-1~pkg-5 为演进史，见报告 §2 与踩坑表）。重启 harness 后按下方步骤重新激活。 |
| `preset/agent.cordis.yml` | 持久化 `concerto` 用户 preset 的 composition（从 shipped `standard` 按 rc 台账派生 + P-19 加固）。挂载校验 `standingKeyFor` 通过。 |
| `preset/preset.yml` | preset 显示元数据（名称/描述）。 |

## 重新激活（harness 重启后）

1. 用 `cordis_define`（plugin.kind:"new"，idPrefix:"conc"）提交本文件 `concerto-plugin.host.js` 的
   函数体（去掉文件头的归档注释，保留 `function textOfBlocks...` 到 `return {...}` 的完整 body），
   再 `cordis_run`。
2. 持久化 preset 不需要插件：把 `preset/` 放到 `~/.dsh/.agent-presets/concerto/` 即可
   （或先用 `ctx.agentPresets.copy('standard','concerto')` 再覆盖这两个文件），
   `standingKeyFor('concerto')` 应为 "mounted OK"。
3. pi-ai 路由：`~/.dsh/settings.yaml` 需含 `llm-pi-ai: providers.deepseek.apiKeyEnv: DEEPSEEK_API_KEY`
   （P-18：进程内 settings.update 被 vm-realm isPlainObject 检查拒绝，磁盘写 + chokidar 热加载是官方路径）。

## 验证工具（插件注册）

- `concerto_verify` — 22 项断言集（FR-2~FR-6 / AC-3/4/5/6 / follow-up 1&2），最终 22/22 PASS
- `concerto_demo` — 真实 sisyphus→omo-explore→回答链 + 两个负向探针（write 缺席、委派物理缺席）
- `call_omo_explore` — 合同式委派工具（preset 里为内置 dsh-tool-subagent 形态，语义等价）
- `concerto_activate_piai` / `concerto_preset_copy` — follow-up 工具

## 关键设计映射（PRD → 当前 DSH）

FR-3 `systemPrompt.section('omo:concerto')` 组装 4 段 markdown；FR-4 `subagents.registerProvider`
装饰内置 spawn 后端（persona 影子 + toolFilter + maxDepth=1）；FR-5 子级 `agentOptions`
（resolveChildAgentOptions 中 `requested` 最后展开）+ `agent/request` 瀑布执行/观测；FR-6
persona 能力注入 + `system-prompt/assemble` 快照证明；FR-2 会话级激活（P-1 register-branch）。
