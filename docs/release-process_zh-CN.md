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
- GitHub Pages 服务分支根（稳定线），所以 `/install` 永远镜像最新发布提交。

## 3. 兼容矩阵

单一事实来源：[`.omo/compat.yaml`](../.omo/compat.yaml) → 由 `scripts/render-compat-matrix.mjs` 渲染为
[`docs/compat-matrix.md`](./compat-matrix.md) / [`中文`](./compat-matrix_zh-CN.md)。
docs 一致性门每次 CI 都会重渲染并比对两个文件——手改立刻被抓。

行状态：✅ 已测试 · 🔬 未测试 · ❌ 不兼容 · 🪦 已弃用。
**发布只能基于 ✅ 行进行。** 每条 dsh 线最新的 ✅ 行即 LKG（上一已知良好）回滚锚点。

## 4. 测试分层与 TDD

| 层 | 内容 | 成本 | 在哪里跑 |
|---|---|---|---|
| **L0 静态** | typecheck · 单测 · doctor-lite · license · **concerto 静态检查**（c01–c09：交付的 preset + 插件保持 AC-6/P-19 加固）· **docs 一致性**（d01–d06） | 零 | 每次 push 的 CI + 本地 `scripts/ci-local.sh`（7 门） |
| **L1 零模型 e2e** | mock-LLM e2e——用 mock 服务器启动**真实 dsh 二进制**，断言会话 JSONL | 零 | CI + 本地 |
| **L2 真模型** | `concerto_verify` 22 项（AC-1…AC-9：双路由、AC-6a/6b 反向断言等） | 真 key | **仅本地**——`scripts/release-check.sh` 第 8 门（证据新鲜度 ≤ `VERIFY_FRESH_DAYS`，默认 7 天） |

TDD 形态：新能力或新适配先写 AC 检查——对着当前 dsh 跑红 → 实现 → 跑绿。每个正向断言必须配**反向探针**（断言"坏东西不存在"，而不只是"好东西存在"——AC-6a/6b；P-19 的教训）。

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

1. **preflight**——工作区干净、在发布分支上、`scripts/release-check.sh`（8 门，含新鲜 L2 证据）。
2. **bump**——`scripts/release-bump.mjs`：package.json、安装器 TAG pin、README 状态 token、compat.yaml（our 块 + 新 ✅ 行，含当前 `dsh --version`、omo 版本、证据路径）、CHANGELOG 顶部条目、矩阵重渲染。
3. **复检**——编辑后跑 docs 一致性 + concerto 静态检查。
4. **commit**——`release: vX.Y.Z`。
5. **tag**——`vX.Y.Z` 注释 tag（不可变）+ `vX.Y` 别名 force 移动。
6. **push**——分支 + 别名 + 完整 tag。
7. **验证**——从新 tag 的 raw URL 做沙箱安装（硬门）；Pages `/install` 轮询（尽力而为，`--wait-pages`）。
8. **gh release**——notes = CHANGELOG 顶部小节 + 矩阵快照（无 gh 登录则打印手动命令）。

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
