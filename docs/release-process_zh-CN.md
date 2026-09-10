# 发布流程与版本管理

> 决策 **D13**（2026-09-05）。两条指导原则：**优先自动化**、**本地优先省成本**——开发机能验证的全部留在本地；云端只跑零成本门禁和免费的每周哨兵。
> English: [Release Process](./release-process.md)。

## 1. 三方

| 参与方 | 是什么 | 兼容性质 | 版本来源 |
|---|---|---|---|
| **our** — `oh-my-opendsh` | 我们发什么 | — | git tag |
| **dsh** — `@deepseek-ai/dsh` | 我们的 preset + 插件跑在其上的 harness | **运行时兼容** | npm 仓库 / git tag `dsh-v*` |
| **omo** — `oh-my-openagent` | 语义蓝本（指挥/explore 设计） | **参照**（无运行时耦合） | npm 仓库 |

## 2. 版本与 tag 约定

- `package.json` 承载完整 semver `X.Y.Z`。
- 每次发布打**两个 tag**：不可变的注释 tag `vX.Y.Z`，加上**移动别名** `vX.Y`（force 移到本线最新 patch）。安装器锁定别名（`TAG="${CONCERTO_TAG:-v0.1}"`），所以 `curl -fsSL https://linletian.github.io/oh-my-opendsh/install | sh` 永远装到最新稳定 patch；要精确锁版本就用 raw `vX.Y.Z` 直链。
- 语义：**major** = 矩阵不兼容变更 / 弃用旧 dsh 区间；**minor** = 新能力或新 ✅ 验证的上下游组合；**patch** = 修复 / 文档 / 仅安装器。
- GitHub Pages 服务稳定线的分支根（`main`），所以 `/install` 永远镜像最新发布提交。

### D7 的 pin 锁住了什么、没锁住什么

CI 安装 `@deepseek-ai/dsh@<精确 rc>`，但 **dsh 自身的依赖对预发布版用的是 caret 范围**
（`^0.1.5-rc.1`），而 semver 会把它**向上**解析到最新的匹配预发布版。因此精确 pin 只固定了
顶层包；实际解析出的传递依赖集会在 `<major>.<minor>.<patch>-rc.*` 内浮动。

两个后果，均在 2026-09-10 实际观察到：

1. **CI 可能因与本仓库完全无关的原因变红。** 上游分步发布进行到一半时，
   `npm install --global @deepseek-ai/dsh@0.1.5-rc.1` 报
   `ETARGET … No matching version found for @deepseek-ai/dsh-*@^0.1.5-rc.2`
   ——caret 范围已经移到 `rc.2`，而部分 `rc.2` 包尚未发布。任务死在 **`install dsh` 这一步，
   本仓库的任何门禁都还没跑**，因此那里的红灯不是关于我们代码的证据。这个窗口还会移动：
   几分钟后报的是另一个缺失的包。
2. **发布所验证的运行时不是逐位冻结的。** 兼容矩阵的一行记的是顶层 pin，而不是解析出的依赖集，
   所以"在 dsh 0.1.5-rc.1 上验证过"的含义是"该日期下解析器眼中的 rc.1"。

**记录解析集**（安装时取 `npm ls -g --all`，附进发布证据）是显而易见的硬化方向，**此处登记为
后续项，尚未实施**——它改变的是矩阵行所"作证"的内容，属于决策而非补丁。在那之前，
`install dsh` 步骤报红请先当作上游状况：**重跑一次**，再考虑排查本仓库。

### 支持窗口，以及"逐版本探测"实际测的是什么

**2026-09-10 实测**，用 `scripts/compat-probe.sh <版本>`（每版本约 2 分钟，零 LLM 成本）。
记录在此是为了不必重新推导这些数字，**而不是**承诺支持它们——见下方的范围决定。

**探测的粒度是"元组"，不是单个版本。** `@deepseek-ai/dsh@V` 把兄弟包声明为 `^V`，而 semver
的预发布规则决定了这种范围**只匹配 V 自身 `major.minor.patch` 元组的预发布版**。所以安装某个
版本，从来测的都不是那个确切的构建：

| pin | 兄弟包声明 | 实际解析到的 `dsh-persona` |
|---|---|---|
| `0.1.0-rc.6` | `^0.1.0-rc.6` | `0.1.0-rc.8` ← 留在 **0.1.0** 元组内 |
| `0.1.3-alpha.2` | `^0.1.3-alpha.2` | `0.1.3-alpha.2` |
| `0.1.5-alpha.1` | `^0.1.5-alpha.1` | `0.1.5-rc.2` ← 留在 **0.1.5** 元组内 |
| `0.1.5-rc.1` | `^0.1.5-rc.1` | `0.1.5-rc.2` |

两点值得分清：

- 有效 pin 是**"所 pin 元组内最新的预发布版"**，因此一次探测的结果是关于**元组**的陈述，而不是
  关于某一个已发布版本的。这也给先前的担忧划了界：解析**不会**在整个 `0.1.x` 内浮动，只在单个
  `x.y.z` 内。
- 唯一真正不稳定的时刻是**上游分步发布**：新元组成员正在铺开时，它的兄弟包可能无法满足，CI 会在
  `install dsh` 这一步失败，**本仓库的任何门禁都还没跑**。这是暂时性的——**重跑**，不必排查。

**当前 concerto 层的实测窗口：**

| dsh 元组 | 结果 | 失败原因 |
|---|---|---|
| `0.1.5-*`（alpha.1 → rc.2） | ✅ PASS（16 行 + e2e 4/4） | — |
| `0.1.3-*` | ❌ FAIL | `present` 行：`@deepseek-ai/dsh-tool-present` 尚不存在 |
| `0.1.0-*`（rc.6 → rc.8） | ❌ FAIL | 那里的 `persona` 要求 `text:`（改名前的 schema）；`present` 同样缺席 |

也就是说，本层在 **0.1.5 线**上可用，在更早的线上不可用——因为它派生自 0.1.5 线的官方 preset
（上游的 `present` 行与 `prefix:` 改名都晚于 0.1.3）。

**范围决定（2026-09-10）。** 现在**不要**构建多版本 CI 矩阵或正式的支持区间设施。dsh 迭代很快，
本项目仍是 MVP，方向尚未确定——今天测出的支持窗口在变得有用之前就会过时。保留这套廉价机制
（`compat-probe.sh`，每版本约 2 分钟），等出现具体需求时（有用户在别的版本上，或需要 bump pin）
再测。必须保持常备的是**做法**：pin 到某条线之前先探它，并记录结果。

## 2a. 分支模型——`develop` 集成,`main` 发布

三个长期引用,单向流动:

```
feature/*, fix/*  --PR-->  develop  --release-->  main  (+ tags vX.Y.Z / vX.Y)
                          (集成分支)             (已发布线，Pages 根)
```

- **`develop` 是集成分支。** 每个 `feature/*` / `fix/*` 分支只向它提 PR。CI 对每个分支都跑(`on: push` / `on: pull_request` 无过滤),因此 `develop` 与 `main` 受同等门禁约束——不存在"只有发布分支才跑 CI"这种需要记的不对称。
- **`main` 只承载已发布的提交。** GitHub Pages 服务 `main` 的分支根,所以 `/install` 天然镜像最新发布。除发布外,任何东西都不进 `main`。
- **版本号在发布时决定,而非之前。** develop 上的工作让 `package.json` 保持上一个已发布版本;`release.sh <patch|minor|major>` 在第 2 步算出下一个。流程中更早的环节都不需要它,而四个 token 持有者(`package.json`、`compat.our.latest`、安装器 `TAG`、CHANGELOG 标题)在同一个发布提交里一起移动。
- **develop 线的验证行刻意不带版本号。** 在飞工作的矩阵行写作 `our: "unreleased"`——已发布的版本号绝不能宣称该版本并不包含的工作(已发布的 `0.1.1` **不**满足一行针对更晚 dsh 验证的记录)。发布时 `release-bump.mjs` 会**原地升级该行**,而不是再插一行,因此矩阵对每个 `(our, dsh)` 恰好保留一行,且不会有陈旧占位行穿过发布存活下来。
- **发布动线。** 把 `develop` 合入 `main`,然后**在 `main` 上**跑 `release.sh`——其 preflight 要求工作区干净且处于 `RELEASE_BRANCH`(默认 `main`,可用 `RELEASE_BRANCH=<branch>` 覆盖)。随后把发布提交回合 `develop`,避免两条线漂移。

## 3. 兼容矩阵

单一事实来源：[`.omo/compat.yaml`](../.omo/compat.yaml) → 由 `scripts/render-compat-matrix.mjs` 渲染为
[`docs/compat-matrix.md`](./compat-matrix.md) / [`中文`](./compat-matrix_zh-CN.md)。
docs 一致性门每次 CI 都会重渲染并比对两个文件——手改立刻被抓。

**目录分工规则（`docs/` vs `.omo/`）：** 给人读的过程文档放 `docs/`（手写、双语成对、可评审——本文档、安装指南、踩坑台账、验证报告都在此列）；`.omo/` 只放机器产物——矩阵数据源、逐行验证证据、探测日志、临时发布 notes，机器写、机器查、永不手改文档（见 [`.omo/README.md`](../.omo/README.md)）。

行状态：✅ 已测试 · 🔬 未测试 · ❌ 不兼容 · 🪦 已弃用。
**发布只能基于 ✅ 行进行。** 每条 dsh 线最新的 ✅ 行即 LKG（上一已知良好）回滚锚点。`broken` / `dropped` 两态当前未使用——本 PR 不携带此类行；它们在 schema 中为回滚/应急流程（§8）预留。

## 4. 测试分层与 TDD

| 层 | 内容 | 成本 | 在哪里跑 |
|---|---|---|---|
| **L0 静态** | typecheck · 单测 · doctor-lite · license · **concerto 静态检查**（c01–c09：交付的 preset + 插件保持 AC-6/P-19 加固）· **docs 一致性**（d01–d06） | 零 | 每次 push 的 CI + 本地 `scripts/ci-local.sh`（7 门） |
| **L1 零模型 e2e** | mock-LLM e2e——用 mock 服务器启动**真实 dsh 二进制**，断言会话 JSONL | 零 | CI + 本地 |
| **L2 真模型** | `concerto_verify` 22 项（AC-1…AC-9：双路由、AC-6a/6b 反向断言等） | 真 key | **仅本地**——`scripts/release-check.sh` 第 8 门（证据新鲜度 ≤ `VERIFY_FRESH_DAYS`，默认 7 天） |

TDD 形态：新能力或新适配先写 AC 检查——对着当前 dsh 跑红 → 实现 → 跑绿。每个正向断言必须配**反向探针**（断言"坏东西不存在"，而不只是"好东西存在"——AC-6a/6b；P-19 的教训）。

证据文件**按设计就是每台设备本地、永不互通**：它证明真模型验证跑在了**这台**机器上，新鲜度窗口意味着每台发布设备都必须自己跑 `concerto_verify` 之后才允许发布（新设备：clone → 零成本链 → 本机一次 `concerto_verify` → 发布）。需要跨设备的东西——矩阵行、文档、脚本——走 git，不走 `.omo/`。

## 5. 上游破坏性更新

| 类别 | 定义 | 对策 |
|---|---|---|
| **A — 纯新增** | 向后兼容 | 哨兵登记 🔬 → 下周期验证 → ✅ |
| **B — 硬破坏** | API 改名/移除——响亮报错 | 适配分支 → patch/minor → 新 ✅ 行 |
| **C — 静默变化** | 行为漂移但不报错 | 最危险的一类（P-19）。靠反向断言抓；按 B 处理且优先级更高 |

节奏：每周 `compat-probe` 工作流（免费、无 secrets）探测上游新版本，每个新版本开一个 issue；验证在本地跑——`scripts/compat-probe.sh`（临时 dsh 前缀 + 沙箱 DSH_HOME + doctor-lite + 对**新** dsh 的 mock e2e），然后一步手动真模型 `concerto_verify`。最后的 pin 翻转用 D7 命名的 `scripts/bump-dsh.sh <version>`——矩阵行不是 ✅ 或本地 `dsh --version` 不匹配就拒绝执行，然后跑完整零成本链。处理选项按优先级：**跟进**（新 ✅ 行）→ **桥接**（patch 层加垫片，行内注明）→ **滞后**（`/install` 停在 LKG；README 状态注明最高支持的 dsh）。

## 6. 发布流程——`scripts/release.sh`

```bash
scripts/release.sh <patch|minor|major|X.Y.Z> [--dry-run] [--no-push] [--no-gh] [--wait-pages <s>]
```

步骤（全部本地；第一步失败即在打 tag 前中止）：

1. **preflight**——工作区干净、在发布分支（`main`；见 §2a）上、`scripts/release-check.sh`（8 门，含新鲜 L2 证据）。
2. **bump**——`scripts/release-bump.mjs`：package.json、安装器 TAG pin、README 状态 token、compat.yaml（our 块 + 本次发布的 ✅ 行——存在 develop 线的 `unreleased` 行时**原地升级**它，否则插入新行——带上当前 `dsh --version`、omo 版本与证据路径）、CHANGELOG 顶部条目、矩阵重渲染。
3. **复检**——编辑后跑 docs 一致性 + concerto 静态检查。
4. **commit**——`release: vX.Y.Z`。
5. **tag**——`vX.Y.Z` 注释 tag（不可变）+ `vX.Y` 别名 force 移动。
6. **push**——分支 + 别名 + 完整 tag。
7. **验证**——从新 tag 的 raw URL 做沙箱安装（硬门）；Pages `/install` 轮询（尽力而为，`--wait-pages`）。
8. **gh release**——notes = CHANGELOG 顶部小节 + 矩阵快照（无 gh 登录则打印手动命令）。

### 提交步骤整树暂存，并断言确实做到了

第 4 步用 `git add -A`，而不是枚举文件清单，并在打 tag / 推送之前断言工作区干净。

"枚举"正是 v0.2.0 的缺陷。`release-bump.mjs` 每次别名移动都会重写 Pages 的 `install`
包装文件，而 add 清单漏了它——于是**第 3 步重新评审的是工作区（包装文件已经是对的），
第 4 步提交的却是一个仍然写着旧别名的子集**。门禁批准了一棵树，发布出去的却是另一棵；
只有全新 clone 才能看出差异（`check-docs-consistency` 会把包装文件与 compat 的 `tag_alias` 对比）。
结果：已发布的 one-liner 一直抓取上一线的安装器——也就是升级前的 preset。

在此之前它一直是潜伏的，因为别名从未移动过（`v0.1` → `v0.1`）；第一次 minor bump 才暴露它。
同一次审计还发现别名被引用于另外六处而 `release-bump` 不会重写它们（两个 README 的备用直链、
两份安装指南、安装器自己的用法头注释）。两类问题现在都有门禁：提交侧是 `git add -A` 加
干净工作区守卫，指针侧是 `d08`。

枚举从来就不必要——第 1 步要求工作区干净，因此 bump 之后唯一的改动就是 bump 自己造成的。

## 7. 文档更新规则（谁更新什么）

**`release.sh` 自动更新（事后由机器复查）：** package.json、安装器 pin、README 状态 *token*、compat.yaml + 矩阵文档、CHANGELOG。

**人负责（跑 release.sh 之前的普通提交）：** 状态 *正文*（如"dsh 0.1.2 复核已登记"）、新 AC/证据文字、踩坑文档等。一致性检查器只强制 token——正文是编辑性的。

## 8. 回滚与应急

- **发布坏了** → 再发一个 hotfix patch（别名向前移），或在分支上 revert 发布提交（Pages 跟分支走）。
- **上游坏了** → 该行标 ❌，LKG 行保持 ✅，`/install` 停在 LKG 直到跟进或桥接落地。
- `vX.Y.Z` 永不移；只有 `vX.Y` 别名会被故意 force 移动。

## 9. 自动化清单

| 资产 | 何时跑 | 成本 |
|---|---|---|
| `scripts/ci-local.sh`（7 门） | 本地 + 每次 push 的 CI `ci.yml` | 零 |
| `scripts/release-check.sh`（8 门） | 本地，发布 preflight | 零成本门禁 + 你已有的 L2 证据 |
| `scripts/release.sh` + `scripts/release-bump.mjs` | 本地，发布时 | 零 |
| `scripts/compat-probe.sh` | 本地，处理 🔬 行时 | 零（自动部分）+ 一次真模型 verify |
| `scripts/bump-dsh.sh` | 本地，D7 pin 翻转 | 零成本门禁；无 ✅ 行拒绝执行 |
| `.github/workflows/compat-probe.yml` | 每周 cron + 手动触发 | 零（GitHub Actions 免费层） |

## 10. 决策与首个实战对象

- **D13**（本流程）2026-09-05 按上述两条原则采纳；关闭开放维度 **O6**（上游 release 通知 → 每周哨兵）与 **O7**（升级节奏 → 探测 + 矩阵驱动的刻意升级）。**O1**（OMO core 包 pin 策略）保持开放——矩阵只追踪 omo 的*参照*版本。
- 首个实战对象：🔬 行 **dsh 0.1.2-rc.1**（静态复核已完成——[`docs/dsh-0.1.2-review_zh-CN.md`](./dsh-0.1.2-review_zh-CN.md)）。通过后即可用 `scripts/bump-dsh.sh 0.1.2-rc.1` 做 D7 的 CI pin 翻转（`.github/workflows/ci.yml` 的 `DSH_VERSION`）——PRD §12 跟踪中。
