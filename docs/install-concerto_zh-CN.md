# 安装协奏模式

> 如何在你自己的 DeepSeek Harness 上安装 oh-my-opendsh 协奏模式（Concerto Mode）MVP。
> 已在当前 DSH 运行时验证（2026-09-04，`concerto_verify` 22/22 PASS、`standingKeyFor` mounted OK）。
> 完整实现与验证报告：[docs/concerto-current-dsh_zh-CN.md](./concerto-current-dsh_zh-CN.md)。
> English: [docs/install-concerto.md](./install-concerto.md)。

## 两种形态

| 形态 | 文件 | 生命周期 | 用途 |
|---|---|---|---|
| **持久化 preset（核心）** | `${DSH_HOME:-$HOME/.dsh}/.agent-presets/concerto/` 下 `agent.cordis.yml` + `preset.yml` | 磁盘持久，重启无损 | 日常使用：协奏模式进入 preset 选择器 |
| 动态插件（可选） | `patches/omo-dsh/omo-agents-current/concerto-plugin.host.js` | 进程级，重启即失 | 验证/观测/演示（`concerto_verify`、`concerto_demo`、路由强制与观测、Hard Blocks 注入） |

基础体验只需 preset：指挥 persona 与 explore 绑定（persona + `toolFilter` + `maxDepth:1` +
双路由）全部烘焙在两个 YAML 文件里，自包含、无仓库依赖。

## 前置条件

- DeepSeek Harness（含 agent preset 体系；依赖与 shipped `standard` preset 同套包）。
- DSH 凭证里已配置 `DEEPSEEK_API_KEY`（两条路由共用；pi-ai 走 api.deepseek.com 兼容端点）。
- pi-ai 目录里的 `deepseek-v4-flash` 模型（没有则改 `agentOptions`，见"适配"）。

## 快速安装

**方式 A（最快）——一行命令**（脚本锁定 v0.1 标签；默认启用 pi-ai 路由）：

```bash
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh
```

（备用直链：`https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.1/scripts/install-concerto.sh`）

可选环境变量（管道前加前缀即可）：`NO_PIAI=1`（跳过 pi-ai 段）、
`EXPLORE_PROVIDER`/`EXPLORE_MODEL`（覆盖 explore 第二路由）：

```bash
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | NO_PIAI=1 EXPLORE_MODEL=my-model sh
```

然后重启 harness、确认 `DEEPSEEK_API_KEY` 凭证已配置，新会话选「协奏模式」即可。
（无 curl 网络时的手工等价步骤见文末 details。）

**方式 B（最原生）——把下面这段话发给任意 DSH 会话，让它自己装**：

```
请在本机 DSH 用户目录安装 oh-my-opendsh 协奏模式（锁定 tag v0.1）：
1) 用 shell 创建 ${DSH_HOME:-~/.dsh}/.agent-presets/concerto/，并用 curl -fsSL 下载
   https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.1/patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml
   与 …/preset.yml 到该目录；任一下载失败就报错停下，不要臆造内容。
2) 若 ${DSH_HOME:-~/.dsh}/settings.yaml 尚无 llm-pi-ai 段，追加
   providers.deepseek.apiKeyEnv=DEEPSEEK_API_KEY；不要改动文件其他部分。
3) 检查 DEEPSEEK_API_KEY 凭证是否已配置（只看键名，绝不输出值）；缺失则明确提醒我。
4) 完成后报告：重启后如何选模式、以及 30 秒自检步骤。不要修改任何其他文件。
```

**方式 C（可重复/可配置）——仓库脚本**（幂等；与方式 A 同一脚本，只是本地运行或自定义参数）：

```bash
git clone https://github.com/linletian/oh-my-opendsh.git
sh oh-my-opendsh/scripts/install-concerto.sh
NO_PIAI=1 EXPLORE_MODEL=my-model sh oh-my-opendsh/scripts/install-concerto.sh   # 自定义第二路由
```

### 这些选项到底改了啥？（白话版）

先记住三句话：

1. 协奏模式有两个人：**指挥**（用你会话的默认模型）+ 检索小弟 **explore**（自己单独一路模型）。
2. 默认安装已经给 explore 配好了一路模型：pi-ai 的 deepseek 路由 + `deepseek-v4-flash`（快、便宜）。
3. 所有选项改的都只是 explore 这一路"**换谁来干活**"。指挥、只读限制、禁嵌套委派，一概不动。

| 选项 | 白话解释 |
|---|---|
| 什么都不加（默认） | explore 走 pi-ai 路由 + v4-flash。快、省；日志里能看到指挥和 explore 走两条不同的 provider（好看，也符合原始设计）。 |
| `EXPLORE_MODEL=xxx` | 换 explore 用的**模型**。这是真正影响答案的旋钮：换强模型（如 v4-pro）→ 检索结论更深、更慢、更贵；换小模型 → 更快、更省、可能更浅。 |
| `EXPLORE_PROVIDER=xxx` | 换 explore 走的**路由身份**。一般只在没有 pi-ai 时用；同模型换路由，回答内容基本不变，只是配置面少一段、日志里记的路由对不一样。 |
| `NO_PIAI=1` | 告诉安装器"**别动我的 settings.yaml**"。⚠️ 单独用会坏：explore 那行还指着 pi-ai 路由，路由没激活 → 每次委派直接报错。跳过 pi-ai 必须同时给 `EXPLORE_PROVIDER`（最好连 `EXPLORE_MODEL` 一起给）。 |

怎么确认换没换成？装完委派一次，解压子会话日志看 `request/context` 那一行：

```bash
unzstd -c ~/.dsh/sessions/<工作区目录>/<子会话id>/session.jsonl.zstd | grep request/context
# {"provider":"deepseek","model":"deepseek-v4-flash"}                ← 默认（pi-ai）
# {"provider":"deepseek-official","model":"deepseek-v4-flash"}       ← 同 provider 降级
```

三个常见组合（带白话注释）：

```bash
# 默认：pi-ai 路由 + v4-flash，最省事
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh

# 没有 pi-ai：换到官方 deepseek 路由 + 同一个模型，回答和默认几乎没差
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | NO_PIAI=1 EXPLORE_PROVIDER=deepseek-official EXPLORE_MODEL=deepseek-v4-flash sh

# 想更省/更快：给 explore 换个小模型
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | EXPLORE_MODEL=<更小更快的模型名> sh
```

<details><summary>手动 3 步（等价参考）</summary>
1. **复制 preset**（从 clone，或从任意已有该 preset 的机器拷这两个文件）：

   ```bash
   git clone https://github.com/linletian/oh-my-opendsh.git
   mkdir -p ~/.dsh/.agent-presets/concerto
   cp oh-my-opendsh/patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml ~/.dsh/.agent-presets/concerto/
   cp oh-my-opendsh/patches/omo-dsh/omo-agents-current/preset/preset.yml ~/.dsh/.agent-presets/concerto/
   ```

   （`~/.dsh` = `${DSH_HOME:-$HOME/.dsh}`；roster 会报告每个 preset 的真实路径。）

2. **激活 pi-ai 路由**（explore 的独立模型路由）——在 `~/.dsh/settings.yaml` 追加：

   ```yaml
   llm-pi-ai:
     providers:
       deepseek:
         apiKeyEnv: DEEPSEEK_API_KEY
   ```

   并确认 `DEEPSEEK_API_KEY` 已在 DSH 凭证中。

3. **重启 harness**，新开会话 → preset 选择器选「协奏模式 (Concerto Mode)」
   （与标准/极简/创造/代码同级出现）。

</details>

## 30 秒验证

- 问"你的角色定位？"→ 应自称指挥（orchestrator）。
- 问"你有哪些委派工具？"→ 应**只有** `call_omo_explore`（通用 `subagent`/`subagent_fork`
  行已在 P-19 加固中移除）。
- 给检索任务（"这个仓库的 README 讲了什么？"）→ 指挥调用 `call_omo_explore`，子 agent
  读完回传、指挥总结；子 agent 无 `write`/`edit`、不能再委派。

完整 9 步人工验证见 [docs/concerto-current-dsh_zh-CN.md §10](./concerto-current-dsh_zh-CN.md)。

## 适配你自己的环境

- **不想用 pi-ai**：把 preset 里 `tool-subagent-explore` 行的 `agentOptions` 改成你的第二路由，
  例如 `provider: deepseek-official`、`model: <你的小模型>`（AC-5 只要求两对路由不同）。
- **pi-ai 目录模型不同**：相应调整 `agentOptions.model`。
- **凭证变量名不同**：改 settings 段的 `apiKeyEnv`。

## 可选：动态插件

在**你自己的会话**里对归档的 `concerto-plugin.host.js` 执行 `cordis_define` + `cordis_run`
（步骤见 [其 README](../patches/omo-dsh/omo-agents-current/README.md)），即可获得
`concerto_verify`（22 项断言）、`concerto_demo`（真实委派链 + 负向探针）、路由强制与观测、
Hard Blocks 注入。插件是会话专属、进程级的——不影响其他会话，其他用户也无需安装。

## 卸载

- 删除 `${DSH_HOME:-$HOME/.dsh}/.agent-presets/concerto/` 目录即可（preset 从 roster 消失）。
- 可选：从 `settings.yaml` 删除 `llm-pi-ai` 段。
- 动态插件随会话消失（或 `cordis_stop` / `cordis_undefine`）。
