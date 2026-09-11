# DSH 0.1.5-rc.1 pin 升级 —— 验证记录

> 中文译本；主文档（英文）见 [DSH 0.1.5-rc.1 pin upgrade (English)](./dsh-0.1.5-rc.1-upgrade.md)。

> **手写验证记录，因此放在 `docs/`** —— 按 `docs/` 与 `.omo/` 的布局规则
> （`docs/release-process_zh-CN.md` §3、`.omo/README.md`）：人读的报告归这里；`.omo/`
> 只放机器产物。机器校验的配套件是逐行证据文件
> `.omo/evidence/concerto-verify-dsh-0.1.5-rc.1.md`，由 `check-l2-evidence`
> 经兼容矩阵读取。

> 日期：2026-09-10 · 运行时：`@deepseek-ai/dsh@0.1.5-rc.1`（安装构建，与 CI 现在
> pin 的版本相同）· 调研依据：[`dsh-0.1.5-rc.1-review_zh-CN.md`](./dsh-0.1.5-rc.1-review_zh-CN.md)
> · 踩坑记录：[`mvp-pitfalls_zh-CN.md`](./mvp-pitfalls_zh-CN.md) §7（P-20）

## 坏了什么，门禁分数现在是多少

面对 0.1.5-rc.1，未改一行的仓库得分为 **104/104 单测、4/4 doctor-lite、10/10
concerto-static、7/7 docs-consistency —— 而 e2e 是 0/4**（persona 的 `text:` →
`prefix:` 改名，见复核报告 §2）。升级之后：

| 门禁 | 之前 | 之后 |
|---|---|---|
| `pnpm vitest run` | 104/104 | **104/104** |
| `node scripts/doctor-lite.mjs` | 4 pass / 0 fail（1 行经 schema 校验） | **4 pass / 0 fail（16 行经 schema 校验）** |
| `node scripts/verify-concerto-static.mjs` | 10/10 | **10/10** |
| `node scripts/check-docs-consistency.mjs` | 7/7 | **7/7** |
| `node tests/e2e/drive.mjs` | 0/4 scenario | **4/4 scenario，总评 PASS** |
| `scripts/run-proofs.sh`（新增） | — | **3/3 PASS**（T12 toolFilter · T13 maxDepth · T15 双路由日志） |
| `scripts/ci-local.sh` | 7 道门禁 | **8 道门禁，全绿** |

## e2e 判定（决定性的 L1 记录）

`{"result":"PASS","scenarios":[hello, concerto-delegation-demo, explore-write-denied,
explore-nested-delegation-denied],"realDshUntouched":true}` —— 原始判定文件存于
`.omo/evidence/dsh-0.1.5-rc.1-e2e-verdict.json`。

来自 `concerto-delegation-demo` 的深层断言（14/14）：

- mock 上的时间线 `sisyphus → explore → explore → sisyphus`，恰好 2 次指挥请求 + 2
  次子代理请求；
- **路由对不同**：父 `deepseek-official/deepseek-v4-pro`，子
  `deepseek/deepseek-v4-flash`；
- `hardBlocksInjectionObserved: true`（FR-6 —— `agent/pre-step` + `agent.inject()`
  仍然落地）；
- 子代理的 descriptor 按新的 `version: 3` 读取；
- 子代理的可见工具表排除 `write`/`edit`/委派工具（AC-6b 物理强制），而 `present`
  —— 新增的上游对齐行 —— 在场。

## 那道本该拦住它的门禁

`doctor-lite` 的 schema 检查从 **1 行**泛化到渲染后 composition 的**每个带 config
的行**，并对照已安装插件自己的 `Config` 运行。回归测试方式：仅回滚 persona 键，
新门禁即以
`persona (@deepseek-ai/dsh-persona): ValidationError: $.prefix missing required value`
失败 —— 这正是旧套件一路绿灯放过的那条报错。

## 两个脚本在本次升级触碰任何东西之前就已经腐烂

全量扫描发现了早于本次工作的损坏：`scripts/concerto-mode-probe.sh` 在 2026-09-04
的 F1 加固（`6203432`）把 deny 列表改成 `[write, edit, explore]` 之后，仍断言
`deny: [write, edit]` 长达六天；`scripts/prove-route-logging.mjs` 携带三处独立的
0.1.5-rc.1 断裂（未挂载 `sessionProjections`、`agentLoop.create` 变为 `async`、带代际的
日志文件名）。两者都不可能被察觉，因为**没有任何链跑这两个脚本** —— 探针虽在 PRD 的
bump 链里被点名，却不在任何自动门禁中。两者均已修复，且 `scripts/run-proofs.sh` 现在
把三个证明作为 `ci-local.sh` 和 `.github/workflows/ci.yml` 的**第 8 道门禁**运行，于是
*证明*的下一次腐烂会红掉 CI，而不是等到有人来问。已修复的 `concerto-mode-probe.sh`
本身仍是纯手工（它要启动真实 harness —— 不是零成本门禁）；它的下一次腐烂仍只会在
有人运行它时浮现。完整记录：[`mvp-pitfalls_zh-CN.md`](./mvp-pitfalls_zh-CN.md) §7 P-20.7。

## 本行的状态

**L1 与 L2 在 0.1.5-rc.1 上全绿**，矩阵行以 `tested` 发货，L2 记录写在其 note 中。
其 `our:` 字段刻意**不带版本号**：发布之前不选定任何版本号，而已发布的版本号绝不
允许认领它不包含的工作 —— 已发布的 `0.1.1` 不满足本行，因为它带着 persona 断裂。
`release-bump.mjs` 在发布时**原地升级该行**（改写 `our:` 与身份字段），而不是插入
第二行，于是矩阵对每个 `(our, dsh)` 恰好保持一行；见 `docs/release-process_zh-CN.md` §2a。

---

**English version**: [`dsh-0.1.5-rc.1-upgrade.md`](./dsh-0.1.5-rc.1-upgrade.md)
