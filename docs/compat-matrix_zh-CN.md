# 兼容矩阵

> 机器渲染自 [`.omo/compat.yaml`](../.omo/compat.yaml)——单一事实来源。请勿手改本文件：改 YAML 后运行 `node scripts/render-compat-matrix.mjs`；docs 一致性门与 `scripts/release.sh`会自动重渲染。

## 三方

| 参与方 | 角色 | 版本来源 | 探测方式 |
|---|---|---|---|
| **our** — `oh-my-opendsh` | 我们发什么 | git tag：不可变的 `vX.Y.Z` + 移动别名 `vX.Y` （安装器锁定的就是它） | 每次发布 = 新增一行 ✅ |
| **dsh** — `@deepseek-ai/dsh` | 我们跑在哪 | npm 仓库 / git tag `dsh-v*` | 本地 `scripts/compat-probe.sh`＋每周 `compat-probe` 工作流自动开 issue |
| **omo** — `oh-my-openagent` | 架构蓝本（指挥/explore 语义） | npm 仓库 | 仅感知：每周工作流标记新版本待复核（无运行时耦合） |

状态图例： ✅ 已测试 · 🔬 未测试 · ❌ 不兼容 · 🪦 已弃用。
**发布门：发布所依据的行必须是 ✅。**

## 已测试组合

| 我们 | dsh | omo | 日期 | 证据（本地文件） |
|---|---|---|---|---|
| unreleased | 0.1.5-rc.1 | 4.19.4 (architecture reference) | 2026-09-10 | `.omo/evidence/concerto-verify-dsh-0.1.5-rc.1.md` |
| 0.1.1 | 0.1.0-rc.6 | 4.19.4 | 2026-09-04 | `.omo/evidence/concerto-current-dsh-verify.md` |
| 0.1.0 | 0.1.0-rc.6 | 4.19.4 (architecture reference) | 2026-09-04 | `.omo/evidence/concerto-current-dsh-verify.md` |

> unreleased — L2 真机手工验证（自原始会话日志逐条复核 17/17）+ L1 全绿（104 单测 / doctor-lite 4-4 且 16 行经 schema 校验 / static 10-10 / docs 7-7 / e2e 4-4）——2026-09-10 升级。在已发布的安装器路径上验证（静态 preset 落在 $DSH_HOME/.agent-presets，无插件）。注：toolFilter/maxDepth 是工具层护栏而非能力边界——S3/S4 经 explore 子 agent 自带的 bash 绕过，按 R5 威胁模型接受（mvp-pitfalls §8 P-21）
> 0.1.1 — 发布 v0.1（release.sh 自动登记）
> 0.1.0 — 当前 DSH 运行时重验证：concerto_verify 22/22 PASS

## 未测试（已登记，待探测）

| dsh | omo | 登记于 | 说明 |
|---|---|---|---|
| 0.1.2-rc.1 | 4.19.4 | 2026-09-05 | 静态复核已完成（docs/dsh-0.1.2-review_zh-CN）；运行时探测待 scripts/compat-probe.sh；D7 的 CI pin 翻转以此行为门（PRD §12）——已被 0.1.5-rc.1 取代，保留为历史记录 |

## 如何更新

1. 编辑 `.omo/compat.yaml`（探测通过 → 加 `tested` 行；上游发新版本 → 加 `untested` 行；每周工作流会提醒你）。
2. 运行 `node scripts/render-compat-matrix.mjs`。
3. 完整流程： [发布流程](./release-process_zh-CN.md) / [release process](./release-process.md)
