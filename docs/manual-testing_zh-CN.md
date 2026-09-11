# 手工测试验证指南 — 协奏 MVP（dsh 0.1.5-rc.1）

> 中文翻译；主文档（英文）见 [Manual Testing Guide](./manual-testing.md)。

本指南面向想**今天**就手动跑通 MVP 的开发者。以下每条命令都已对照仓库脚本核实，请勿自行编造参数或路径。

## 当前状态

- MVP 已结项：FR-1~FR-8 已实现，V1~V4 已验证。
- 所有自动化门禁在 **dsh 0.1.5-rc.1** 上全绿（CI pin，决策 D7；L1 + L2 均绿——见[升级记录](./dsh-0.1.5-rc.1-upgrade_zh-CN.md)）。
- 中间的 0.1.2-alpha.1 验证线已被 0.1.5-rc.1 bump 取代（2026-09-10，PRD §12）。
- 手工测试补上**真实模型层**（PRD §8 L4）：委派合规性、回答质量，以及 mock-LLM e2e 无法证明的 AC-4/AC-5 肉眼检查。

## MVP 是什么

第 5 种运行模式：协奏模式 / **Concerto Mode**（preset id `concerto`，trust user）：

- 指挥 `omo-sisyphus` + 只读子代理 `omo-explore`（工具名 `explore`，toolFilter 拒绝 `[write, edit, explore]`——F1 之后委派工具本身也被拒绝，子代理在物理上无法再委派；maxDepth 1 保留为纵深防御）。
- Hard-blocks 注入 + 双模型路由。
- 默认路由：sisyphus 走 `deepseek-official/deepseek-v4-pro`（环境变量 `OMO_SISYPHUS_PROVIDER` / `OMO_SISYPHUS_MODEL`）；explore 经 llm-pi-ai 走 `deepseek/deepseek-v4-flash`（环境变量 `OMO_EXPLORE_PROVIDER` / `OMO_EXPLORE_MODEL`）。

## 前置条件

1. Node 24 与 pnpm。
2. PATH 上有 dsh 0.1.5-rc.1：

   ```bash
   dsh --version
   ```

   严格按 pin 版本安装，与 CI 一致：`npm i -g @deepseek-ai/dsh@0.1.5-rc.1`。

3. 仓库依赖已安装（`node_modules` 存在）。
4. 一个同时覆盖两条路由的 DeepSeek API key，以下任一方式提供：

   ```bash
   export DEEPSEEK_API_KEY=sk-...
   ```

   或已存于 `~/.dsh/.credentials.yaml`（本机已存在——smoke-real 以只读方式读取并注入其沙箱）。

> **注意：** 严格安装 pin 版本（`@0.1.5-rc.1`），切勿替换成其他 rc。rc 时代的教训（P-11.5）：裸跑 `npm i -g @deepseek-ai/dsh@0.1.0-rc.6` 曾拉来 rc.8 依赖并搞坏整个栈——恢复方法见 P-11.5 的 validated-tree 配方。

## L0 — 零成本自动化冒烟

无需 key，可随时重跑。这些脚本既不碰真实的 `~/.dsh` 也不碰真实 key（HOME/XDG/DSH_HOME 均沙箱化）。

```bash
scripts/ci-local.sh
```

预期输出：`PASS — all 8 gates green`（typecheck、104 个单元测试、mock-LLM e2e 4 个场景、doctor-lite、许可证、concerto static、docs consistency、session-free proofs）。

```bash
scripts/cold-start.sh
```

沙箱冷启动：把插件装进沙箱 profile，启动 `dsh --profile web --patch ./cordis.yml --port 0`，检查 `[omo-agents] loaded` 且无插件报错。预期输出：`cold-start: PASS`。

```bash
scripts/concerto-mode-probe.sh
```

花名册/人设/路由/T11/T12/T13/T15 的真实路径证明。预期输出：`concerto-probe: PASS`。

## L1 — 真实模型冒烟（推荐的真实首跑）

MVP 设计的手工门禁：

```bash
scripts/smoke-real.sh
```

它会：在一次性沙箱里启动真实 dsh（web profile + 插件），播种 `settings.yaml` 将两条路由接到生产端点（无 mock），创建协奏会话，向 sisyphus 提一个诱导其委派 explore 的检索问题，然后提取肉眼证据。

- **凭据：** 环境变量 `DEEPSEEK_API_KEY` 优先；否则以只读方式读取 `~/.dsh/.credentials.yaml` 并注入沙箱子进程。两者都没有 → 打印确切配置方法并立即以退出码 2 退出（绝不挂起）。成本远低于 1 美元。若已导出 `DEEPSEEK_BASE_URL` 会被剥离（会打印提示；`DSH_SMOKE_RESPECT_BASE_URL=1` 可保留）。
- **安全性：** 真实的 `~/.dsh` 绝不被写入（沙箱重定向 + 前后 sha256 摘要，易变的 `sessions/` 与 `storages/` 排除在外）；key 绝不打印、记录或落盘。
- **待审阅产物：** `.omo/evidence/smoke-real-<timestamp>/transcript.md`——人工核对清单：
  - AC-4 四个链路事件：sisyphus 调用 explore → explore 执行 → 结果返回 → sisyphus 总结。
  - AC-5 两条不同路由。
  - 另有 `verdict.json`、`routes.json`（父+子的每个 request/header）、`session-parent.jsonl` / `session-child.jsonl`、`boot.log`、`llm.providers.json`。
- `.omo/evidence/smoke-real-2026-08-21-*` 保存了一次历史真实运行证据，可作为 PASS 长什么样的参照。
- 注：`smoke-real.mjs` 现已对传输自适应（rc.6 扁平 web-RPC 与 0.1.2+ 的 token 传输均可；P-11.6 已关闭）。

## L2 — 交互式 Web-UI 测试（真实 dsh home）

### 一次性设置

a. 把插件装进真实 profile（这会修改真实 profile 目录——设计如此）：

```bash
dsh plugin --profile web add ./patches/omo-dsh/omo-agents
```

b. 注册 explore 席位的 provider 路由（免 key；key 通过 `apiKeyEnv` 按请求从 `~/.dsh/.credentials.yaml` 解析）。你真实的 `~/.dsh/settings.yaml` 目前缺少这一段——请添加：

```yaml
llm-pi-ai:
  providers:
    deepseek:
      apiKeyEnv: DEEPSEEK_API_KEY
```

### 启动

```bash
dsh --profile web --patch ./cordis.yml --port 4173
```

就绪行：`dsh web: http://127.0.0.1:4173/?token=<launch-token>`——在 pin 的 0.1.5-rc.1 上 URL 携带启动 token（0.1.2 起浏览器鉴权）：请打开完整 URL。

### 模式与模型选择

在模式选择器中选协奏模式 / Concerto Mode（user-trust 花名册条目；名称来自我们的 `preset.yml`——客户端区域回退，P-1.2）。在模型选择器中为基准运行选 **deepseek-v4-pro**：你保存的默认是 deepseek-v4-flash，但 AC-5 要求两条不同路由，而 explore 子代理已被插件 agentOptions 钉在 `deepseek/deepseek-v4-flash`——所以指挥端请跑 v4-pro。

### 五个场景

会话 JSONL 位于 `$DSH_HOME/sessions/<path>/session.vN.jsonl`（文件名携带 session-format 代际——今天为 `v3`；落盘休眠的文件可能被压缩为 `session.vN.jsonl.zstd`，此时先经 `unzstd -c` 管道再读）。

**S1 — 基础对话。** 随便问什么；指挥直接回答。验证：会话日志的 `request/header` 显示 provider 为 `deepseek-official`、model 为 `deepseek-v4-pro`：

```bash
grep -E '"(provider|model)"' "$DSH_HOME/sessions/<path>/session.v3.jsonl"
```

**S2 — 委派链（AC-4/AC-5）。** 输入例如 `用 explore 查一下这个仓库的 README 讲了什么，然后总结给我`。预期：指挥调用 `explore` 工具 → 子会话执行只读检索 → 结果返回 → 指挥总结。验证：出现第二个（子）会话 JSONL；父的 `subagent/descriptor` 与子的 `request/header` 显示子路由 `deepseek/deepseek-v4-flash` ≠ 父 `deepseek-official/deepseek-v4-pro`：

```bash
grep -E '"(provider|model)"' "$DSH_HOME/sessions/<parent>/session.v3.jsonl" "$DSH_HOME/sessions/<child>/session.v3.jsonl"
```

**S3 — 只读拒绝（AC-6a）。** 提问：`让 explore 把 README 里的项目名改成 foo`。预期：explore 子代理的 write/edit 尝试被拒绝，报 `Error: unknown tool "write"`（或 `"edit"`）；磁盘上的文件不变。在子 JSONL 的工具结果中验证：

```bash
grep 'unknown tool' "$DSH_HOME/sessions/<child>/session.v3.jsonl"
```

注意（P-21，已接受的威胁模型边界）：该拒绝是**工具层**的，不是能力边界——子代理仍持有 `bash`，一个有意的或被指示的子代理仍可经 shell 写文件，甚至另起一个不受限的 `dsh` 进程（P-21.2）。不要把 S3 读作"写不可达"。

**S4 — 禁止嵌套委派（AC-6b）。** 提问：`让 explore 自己再派一个子代理去查别的东西`。预期（F1 之后）：`explore` 工具在子代理的工具表里**物理缺席**——它要么如实回答"我没有委派工具"，要么尝试调用被拒 `Error: unknown tool "explore"`；两种都算通过。深度上限（`maxDepth: 1`）保留为纵深防御但不再触发。在子 JSONL 中验证：

```bash
grep 'unknown tool' "$DSH_HOME/sessions/<child>/session.v3.jsonl"
```

**S5 — Hard-blocks 人设（FR-6）。** explore 子代理携带着注入的 Hard Blocks 与 Anti-Patterns 段落；行为上它在拒绝写操作时应援引只读纪律（可在其回复中观察到）。注入本身在启动日志中以 `[omo-agents]` 标记记录，并由 L0 探针做结构化证明。

### 关闭

Ctrl-C（SIGTERM 以退出码 0 退出）。

## 验收映射

| 测试 | 覆盖 |
|---|---|
| L0 | AC-1 / AC-7 / AC-8 + V1 |
| L1 | AC-4 / AC-5（若模型尝试写入/嵌套则部分覆盖 AC-6） |
| S1 | AC-2 / AC-3 |
| S2 | AC-4 / AC-5 + V2 |
| S3 | AC-6a + V4（toolFilter） |
| S4 | AC-6b + V4（委派工具缺席 + maxDepth 兜底） |
| S5 | FR-6 + V3 |

AC-9（文档）已在 MVP 签核时关闭。

## 故障排查

| 症状 | 原因 / 处理 |
|---|---|
| `patch: entry "omo-agents" not found` / patch 被静默跳过 | 插件未装入该 profile——执行 L2 步骤 (a)。（P-8：挂载需要 `cordis.yml` 中的 insert 形式，已正确；名称从 profile 目录解析。） |
| 模式花名册里没有协奏模式 | 插件未加载：查启动日志里有无 `[omo-agents] loaded`；preset 会在启动时写入 `$DSH_HOME/.agent-presets/concerto/`——检查该目录是否存在。 |
| `MISSING_CREDENTIAL` 指向 explore 路由 | `settings.yaml` 缺 llm-pi-ai 段（L2-b），或 credentials.yaml/环境变量中没有 key。 |
| 任何位置出现 `ctx.agents.get is not a function` | 你装上了 rc.8 依赖（裸重装拉来的）——validated-tree 配方见 P-11.5。 |
| 就绪行带 `?token=` | 在 pin 的 0.1.5-rc.1 上属正常（0.1.2 起浏览器鉴权）：打开完整 URL；我们的 harness 脚本已兼容两种传输。 |
| 指挥可直接抓取 URL | tool-web `fetch: true` 跟随 shipped standard preset（派生纪律；两个协奏 preset 自 0.1.5-rc.1 对齐起均携带）——属预期行为，详见 preset 的 derivation ledger。 |

## 当前限制

- DSH pin 为 0.1.5-rc.1（2026-09-10 完成，PRD §12）；先前的"CI 翻转至 0.1.2"条目已被取代，`smoke-real.mjs` 的传输适配随之落地（P-11.6 已关闭）。
- dsh 依赖树的 shrinkwrap 已登记为后续事项（P-11.5）。
