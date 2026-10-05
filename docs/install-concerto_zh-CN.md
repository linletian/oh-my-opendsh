# 安装协奏模式

> 如何在你自己的 DeepSeek Harness 上安装 oh-my-opendsh 协奏模式（Concerto Mode）MVP。
> 已在当前 DSH 运行时验证（2026-09-04，`concerto_verify` 22/22 PASS、`standingKeyFor` mounted OK）。
> 完整实现与验证报告：[docs/concerto-current-dsh_zh-CN.md](./concerto-current-dsh_zh-CN.md)。
> English: [docs/install-concerto.md](./install-concerto.md)。

## 两种形态

| 形态 | 文件 | 生命周期 | 用途 |
|---|---|---|---|
| **持久化 preset（核心）— dsh 0.1.x（filediscovery）** | `${DSH_HOME:-$HOME/.dsh}/.agent-presets/concerto/` 下 `agent.cordis.yml` + `preset.yml` | 磁盘持久，重启无损 | 日常使用：协奏模式进入 preset 选择器 |
| **持久化 preset（核心）— dsh ≥ 0.2（declaration）** | `${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml`（web profile，安装器锁定 `web`）里声明的 `preset-concerto` 那一行 | 磁盘持久，重启无损 | 日常使用：0.2 起不再读 `.agent-presets/`，preset 声明了才存在 |
| 动态插件（可选） | `patches/omo-dsh/omo-agents-current/concerto-plugin.host.js` | 进程级，重启即失 | 验证/观测/演示（`concerto_verify`、`concerto_demo`、路由强制与观测、Hard Blocks 注入） |

基础体验只需 preset：指挥 persona 与 explore 绑定（persona + `toolFilter` + `maxDepth:1` +
双路由）全部烘焙在两个 YAML 文件里，自包含、无仓库依赖。

> 📌 **本通道的范围（2026-09-14）。** 本文下面装的全部是 **1+1 preset**——指挥 + 唯一的 `explore`
> 委派绑定——来自冻结归档 [`patches/omo-dsh/omo-agents-current/`](../patches/omo-dsh/omo-agents-current/)
> （v0.2 动态插件的逐字存档）。**完整 11-agent 名册**（指挥 `sisyphus` + 10 个委派目标，见
> [README](../README_zh-CN.md) 的"名册路由与 env 覆盖表"）只存在于开发树，随**未来 release** 提供；
> 是否/何时经本 installer 通道下发属 **Phase 7** 的发布节奏决策，不是本文的承诺。在那之前，本文的
> 安装途径与开发树的名册**预期就是不一致的**——这个分歧被如实记录，而不是粉饰过去。

## 前置条件

- DeepSeek Harness（含 agent preset 体系；依赖与 shipped `standard` preset 同套包）。
- DSH 凭证里已配置 `DEEPSEEK_API_KEY`（两条路由共用；pi-ai 走 api.deepseek.com 兼容端点）。
- pi-ai 目录里的 `deepseek-v4-flash` 模型（没有则改 `agentOptions`，见"适配"）。
- **仅 dsh ≥ 0.2**：PATH 上要有 `python3`，**且带 PyYAML 模块**（`pip install pyyaml`）。declaration
  形态下安装器用 python3 + PyYAML 渲染那条声明行，并在创建任何东西之前先检查；缺模块就停下，打印
  `error: PyYAML required for the dsh >= 0.2 install path (pip install pyyaml)` 并以非 0 退出码结束。
  dsh 0.1.x 形态两者都不需要——除非你设了 `EXPLORE_PROVIDER` / `EXPLORE_MODEL`，那本来就是需要
  `python3` 的场景。macOS 自带的 python3 **不带** PyYAML。（与安装器 Usage 头部的 `Requirements:`
  一段一致。）

## 快速安装

三种方式跑的是同一个 `scripts/install-concerto.sh`，它在动手前先跑 `dsh --version` 分流：**dsh ≥ 0.2**
把 preset 渲染成**一条声明行**写进 `${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml`；**dsh 0.1.x**
才按老样子把两个 YAML 落到 `.agent-presets/concerto/`。版本探测不到（dsh 不在 PATH、或输出里解析不出
MAJOR.MINOR）就响亮报错停下、提示先装 dsh——绝不瞎猜。0.2 形态下脚本也**不会**创建
`profiles/web/package.json`（dsh 首次启动时自己补）。

> 🚫 **安装器唯一会响亮拒绝的一种形态（dsh ≥ 0.2）**：如果你的 `cordis.patch.yml` 里已经存在一行
> `- id: preset-concerto`，而且它**嵌在某个 group 行的 `config:` 列表里面**，安装器会直接打出一条
> `error: … nested INSIDE the config: list …` 并以非 0 退出码停下。"group 行"按 dsh 自己的定义算——
> `group: true`、`name: cordis:group`、`name: @deepseek-ai/cordis-plugin-group` **三者任一**，这正是 dsh
> 自己的 profile 预检所用的并集（dsh-app-boot/lib/index.js:2100），安装器只会比它更宽、绝不更窄。
> 其中两个 `name:` 写法自己就能把 `config:` 列表挂起来，所以哪怕整个文件里一个 `group:` 键都没有，
> 嵌在里面的 preset 行照样会生效。安装器没法在不改写你自己 group 结构的前提下替换它，而把它和
> 新生成的那条一起装进去，就会留下两条 `config.id: concerto`，下次启动 harness 直接抛
> `Duplicate agent preset: concerto`。
> 拒绝的时候一个字节都不写：patch 文件不动，连 `.bak` 都不会产生。**手工修**：把那一嵌套的行删掉，
> 再重跑安装器。（嵌套的 preset 行如果带 `disabled: true`，那**不算**问题，照常装——被禁用的行永远不会
> 注册，也就永远不会重复；**但除非那一行自己还带着真值 `group:`**：loader 的禁用判定在 `options.group`
> 上直接短路（cordis-plugin-loader/lib/index.js:335），**自称 group 的行会无视自己的 `disabled`** 照样
> 挂载，这种行和其它嵌套声明行一样会被拦下。插件行自己 `config:` 里的 `id: preset-concerto` 是那个
> 插件自己的配置 id，不是 preset 声明，同样不会被拦。）

**方式 A（最快）——一行命令**（脚本锁定 v0.2 标签；默认启用 pi-ai 路由）：

```bash
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh
```

（备用直链：`https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.2/scripts/install-concerto.sh`）

可选环境变量（管道前加前缀即可）：`NO_PIAI=1`（跳过 pi-ai 段）、
`EXPLORE_PROVIDER`/`EXPLORE_MODEL`（覆盖 explore 第二路由）——`CONCERTO_TAG`、`DSH_HOME`
在两个形态下语义都不变：

```bash
curl -fsSL https://linletian.github.io/oh-my-opendsh/install | NO_PIAI=1 EXPLORE_MODEL=my-model sh
```

然后重启 harness、确认 `DEEPSEEK_API_KEY` 凭证已配置，新会话选「协奏模式」即可。
（无 curl 网络时的手工等价步骤见文末 details。）

**方式 B（最原生）——把下面这段话发给任意 DSH 会话，让它自己装**：

```
请在本机 DSH 用户目录安装 oh-my-opendsh 协奏模式（锁定 tag v0.2）：
1) 先跑 `dsh --version`；输出里解析不出 MAJOR.MINOR 就报错停下，不要猜版本。
   - dsh 0.1.x：用 shell 创建 ${DSH_HOME:-~/.dsh}/.agent-presets/concerto/，并用 curl -fsSL 下载
     https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.2/patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml
     与 …/preset.yml 到该目录。
   - dsh ≥ 0.2：0.2 起已不读 .agent-presets/——把同样两个文件下载到临时目录，再往
     ${DSH_HOME:-~/.dsh}/profiles/web/cordis.patch.yml 追加**恰好一个** `- insert:` 块，声明
     `- id: preset-concerto`（name: '@deepseek-ai/dsh-agent-preset'；config 里 id 为 concerto，
     name/description 取自 preset.yml，plugins 内联 agent.cordis.yml 的内容并整体右移 8 个空格）。
     写之前先把该文件备份成 cordis.patch.yml.bak.<时间戳>；只新增/替换 preset-concerto 这一行，
     用户自己写的其它行一个都不许删改。
   任一下载失败就报错停下，不要臆造内容。
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

怎么确认换没换成？装完委派一次，解压子会话日志看 `request/context` 那一行（文件名带 session-format 代际——`session.vN.jsonl[.zstd]`，今天为 `v3`；更老的会话仍是裸名 `session.jsonl[.zstd]`）：

```bash
unzstd -c ~/.dsh/sessions/<工作区目录>/<子会话id>/session.v3.jsonl.zstd | grep request/context
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

<details><summary>手动 3 步（等价参考，仅 dsh 0.1.x）</summary>

> ⚠️ 这套手动步骤只对应 **0.1.x filediscovery** 形态。dsh ≥ 0.2 上 `.agent-presets/` 里的东西根本不会被读到——preset 必须**声明**才存在，请走方式 A/C（安装器会替你改 `profiles/web/cordis.patch.yml`：幂等、只动 `preset-concerto` 那一行、写前自动备份）。

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

两个形态指向同一个结果：dsh ≥ 0.2 下 preset 来自 `profiles/web/cordis.patch.yml` 里的声明行而不是
`.agent-presets/` 目录。0.2 这条形态已在真机上验证过一次——在 **dsh 0.2.x** 上跑过一次真实的沙箱
全新安装 + 真实 harness 启动验证：preset 出现在 roster 里（5 个 preset 之一），那一行没有 `broken`
标记，并且用这个 preset 成功建起了会话。那次验证**没有**跑上面这三条所描述的运行时行为，包括委派
那条——沙箱里没有真实凭据。这三条得你自己跑。

完整 9 步人工验证见 [docs/concerto-current-dsh_zh-CN.md §10](./concerto-current-dsh_zh-CN.md)。

## 适配你自己的环境

- **dsh ≥ 0.2**：preset 就住在 `profiles/web/cordis.patch.yml` 里——要换 explore 路由，改那份文件里
  `preset-concerto` 那条声明的 `agentOptions`；或者带 `EXPLORE_MODEL=…` 重跑安装器（幂等：只换那一行，
  写前自动备份）。
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

- **dsh 0.1.x（filediscovery）**：删除 `${DSH_HOME:-$HOME/.dsh}/.agent-presets/concerto/` 目录即可（preset 从 roster 消失）。
- **dsh ≥ 0.2（declaration）**：⚠️ **不要 `rm -rf` `${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml` 整个文件**——那里面还有你自己的行。要么手工编辑该文件，只删掉 `- id: preset-concerto` 所在的那个 `- insert:` 块；要么用**安装器**留下的最新备份还原：
  `cp "$(ls -t ${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml.bak.[0-9]* 2>/dev/null | head -n 1)" ${DSH_HOME:-$HOME/.dsh}/profiles/web/cordis.patch.yml`
  ——通配符**故意**写成带时间戳的形状（`.bak.` 后面紧跟一个数字）：裸的 `.bak.*` 也会匹配**你自己**命名的存档，
  比如 `cordis.patch.yml.bak.mine`，而 `ls -t` 会把那一份当成最新文件交给你，而不是安装器真正写下的备份
  （安装器的清理策略从来不吃这类文件，所以它们可以在目录里躺很多年，并且正好是目录里 mtime 最新的那个）。
  ——但**前提是确实有备份**：安装器只在 patch 文件当时已经存在的情况下才备份，所以之前装过一次才有
  备份，首次安装一个备份都不会产生。没有备份时通配符展开为空，这条命令就成了 `cp "" …`，只会报一条
  针对空路径的 stat 错误——它不损坏文件，但读起来像装坏了。首次安装请直接手工编辑该文件，删掉
  `- id: preset-concerto` 所在的那个 `- insert:` 块。
- 可选：从 `settings.yaml` 删除 `llm-pi-ai` 段。
- 动态插件随会话消失（或 `cordis_stop` / `cordis_undefine`）。
