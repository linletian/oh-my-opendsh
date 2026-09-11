# OMO core 包 vendoring playbook

> **上游依据**：[ROADMAP §4 Phase 1 退出标准 (d)](../../roadmap_zh-CN.md) · [决策 D14](../../decisions_zh-CN.md) · [决策 **D15**（vendor 合规细则）](../../decisions_zh-CN.md) · [决策 **D16**（verify-licenses 名称门扩展）](../../decisions_zh-CN.md) · [决策 D10](../../decisions_zh-CN.md)
>
> **配套**：[开发计划书](./phase1-plan.md) · [任务清单](./phase1-tasks.md) · [License 与署名清单](./phase1-license-attribution.md)
>
> **状态**：📝 **计划稿**。本文的步骤**尚未全部经过 Phase 1 自身的实测**（唯一例外是 §1 的上游事实基线，已在 2026-09-11 实测）。
> 按任务清单 **P1-T11**，Phase 1 收尾时必须回填为**实录稿**：凡"预计/应该/若…则"字样，要么改为实测结论，要么显式标为未验证。**未回填的 playbook 不满足退出标准 (d)。**
>

---

## 0. 这份 playbook 是什么

ROADMAP 把 vendor 验证定位为"为后续每个阶段去风险"的一步。它的产出物里，**最长期有用的不是 hashline-core 本身，而是这份操作手册**：Phase 2–6 每个需要 OMO core 源码的阶段，都应该能照抄这里的步骤，把第二个、第三个包搬进来，且不产生新的决策成本。

因此本文的写作标准是：**一个没参与过 Phase 1 的人（或一次新的会话），只看本文就能独立完成下一个包的 vendor。**

### 适用范围

| 适用 | 不适用 |
|---|---|
| OMO 的 **harness-neutral core 层**包（ROADMAP §3 约束 5 列出的 19 个：`hashline-core` / `team-core` / `delegate-core` / `rules-engine` / `prompts-core` / …） | OMO 的 **opencode / senpi 适配层**（`omo-opencode` / `omo-senpi` / `omo-codex`）——ROADMAP 明示语义应取自 core 层，不取自适配层 |
| 纯 TS、无 harness 依赖的包 | 需要 OMO 自己的构建管线（tsdown / bun 打包）才能产出的包——本文假定"源码可直接被 Node 24 类型剥离加载" |
| 一个包 = 一次操作 | 一次搬一棵依赖树（如 `utils`）——需先扩大范围评估，见 §7 |

### 三条不变量

1. **只从 tag 取内容**，绝不用工作树。tag 是唯一可复现的来源。
2. **verbatim 优先**：能不改就不改。每多一处偏离，后续定向搬运（ROADMAP §2 规则 4）与漂移检测的成本就多一分。
3. **偏离必须登记**：任何偏离都写进 `VENDOR-MANIFEST.json` 与 `THIRD_PARTY_NOTICES.md`，两处互相印证。

---

## 1. 前置事实（Phase 1 已实测，可直接引用）

| 项 | 值 | 来源 |
|---|---|---|
| 上游仓库 | `https://github.com/code-yeongyu/oh-my-openagent` | — |
| 冻结基线 tag | **`v4.19.4`** | D14 / ROADMAP §2 |
| tag commit | `b072d279110bdda2c6ac2525d0d24dc54d16148a` | 2026-09-11 实测 |
| v5.0.0 正式版状态 | **未发布**（npm `latest`=4.19.4、`beta`=5.0.0-beta.53） | 2026-09-11 实测 |
| 上游许可 | 仓库根 `LICENSE.md` = SUL-1.0，sha256 `b61ac928…ddc32` | 本仓库副本**已逐字节校验一致** |
| **core 包的 `license` 字段** | ⚠️ **19 个包全部缺失** | 见 §4 步骤 5 与[署名清单 §5](./phase1-license-attribution.md) |
| OMO 构建工具 | Bun（测试 `bun test`；typecheck `tsgo`）；包为 `private: true` workspace 成员 | 包 `package.json` |
| 本项目工具链 | Node 24.19 / pnpm 11.9 / vitest 4 / tsc 7；pnpm-lockfile v9 | 实测 |

**tag 选择规则（D14）**：v5.0.0 正式版**已发布**则用 v5.0.0，否则用 **v4.19.4**。第 1 步必须重跑判定，不得沿用本文的结论。

---

## 2. 操作步骤（8 步）

> 下文用占位符：`<OMO>` = 上游检出路径；`<PKG>` = 包目录名（如 `hashline-core`）；`<PKGNAME>` = 包名（如 `@oh-my-opencode/hashline-core`）；`<TAG>` = 选定的 tag。

### 步骤 1 — 复核 tag 选择（**每次都做，不沿用旧结论**）

```bash
# 1a. v5.0.0 正式版是否已发布？
npm view oh-my-openagent dist-tags --json
#   latest 以 5. 开头 → <TAG>=v5.0.0（并在本文件与计划书留痕）
#   否则            → <TAG>=v4.19.4

# 1b. 取 tag 的 40 位 commit（记录进 manifest，不要只记 tag 名）
git -C <OMO> rev-parse "<TAG>^{commit}"
```

**为什么**：D14 的 tag 选择是**条件式**的，条件（v5 是否发布）会随时间变化。tag 名可以被移动，commit 不能——manifest 记 commit 才能保证"半年后还能取出同一份代码"。

### 步骤 2 — 评估目标包（先评估，再动手）

```bash
git -C <OMO> ls-tree -r --name-only "<TAG>" -- packages/<PKG>
git -C <OMO> show "<TAG>:packages/<PKG>/package.json"
```

逐项判定，**任一为"是"就先停下来评估范围**：

| 检查项 | 为什么重要 |
|---|---|
| 有 `dependencies` 吗？各是什么？ | 每个新依赖都要过 `verify-licenses`，并进 `pnpm install`（可能触发 R-3 那类发布年龄策略） |
| 有 `@oh-my-opencode/*` 跨包 import 吗？ | 有 = 你在 vendor 一棵树，不是单个包（§7） |
| 有 harness 依赖（opencode / cordis / DSH）吗？ | ROADMAP §3 约束 5 要求只取 core 层 |
| 测试用什么框架？测试文件在哪？ | 决定 shim 数量（§3） |
| 有跨包测试辅助（`../../../`、`test-support/`）吗？ | Phase 1 的 S-2 就是这一类；逐个都要处置 |
| 有 `license` 字段吗？ | **预计没有**（19/19）——见步骤 5 |
| 源码有非 Node 运行时的全局假设吗？ | Phase 1 实证：`globalThis.Bun?.hash` 这种**调用时探测 + 纯 JS 回退**是安全的；硬依赖 `Bun.*` 则需要 shim |
| `tsconfig.json` 的 `lib` / `types`？ | `types: ["bun-types"]` 在本仓库不存在（§3 M-2） |

### 步骤 3 — 逐字节导入

```bash
rm -rf /tmp/vendor-stage && mkdir -p /tmp/vendor-stage
git -C <OMO> archive "<TAG>" "packages/<PKG>" | tar -x -C /tmp/vendor-stage
mkdir -p patches/omo-dsh/vendor
cp -r "/tmp/vendor-stage/packages/<PKG>" "patches/omo-dsh/vendor/"
```

**用 `git archive` 而不是 `cp -r <OMO>/packages/<PKG>`**：本地检出的工作树可能不在目标 tag 上、且可能带未提交改动（Phase 1 实测：本地 `~/GithubRepo/oh-my-openagent` 的 HEAD **不在** v4.19.4 上）。从工作树复制 = 引入不可复现的内容。

导入后**立即**做一次全量比对，确认导入本身零误差（这一步的差异必须为 0，否则问题在导入而不在 shim）：

```bash
cd patches/omo-dsh/vendor/<PKG>
for f in $(find . -type f | sed 's|^\./||'); do
  a=$(git -C <OMO> show "<TAG>:packages/<PKG>/$f" | sha256sum | cut -d' ' -f1)
  b=$(sha256sum "$f" | cut -d' ' -f1)
  [ "$a" = "$b" ] || echo "DIFF $f"
done
```

### 步骤 4 — 处理 shim（全部偏离都发生在这里）

按类处置。Phase 1 遇到的两类记在 §3；新增类别时**回填本节**。

### 步骤 5 — `package.json` vendor 化

| 字段 | 动作 |
|---|---|
| `license` | **新增 `"SUL-1.0"`**。⚠️ **必需**：`verify-licenses` 对缺失字段判 `MISSING` → FAIL；且它记录的是该文件实际适用的许可（OMO 仓库根 `LICENSE.md`）。**必要但不充分**：名称门 `SUL_ALLOWED_NAME` 不匹配 `@oh-my-opencode/*`——**首次** vendor 时须先按 **D16** 扩展该正则（一次性，后续包直接受益；见步骤 7） |
| `name` | **不改**。包名是漂移检测与定向搬运的溯源锚点，改名会破坏与上游的对照可读性。注意 `SUL_ALLOWED_NAME` **不放行** `@oh-my-opencode/*`（评审实证）——这不是改名的理由，而是 D16 扩展名称门的理由 |
| `private` | 保持 `true` |
| `dependencies` | **不改**（除非步骤 2 判定需要） |
| `scripts` | **只增不删**：保留上游 `test`（bun），新增 `test:vitest` |
| `exports` / `types` | 通常**不改**。注意上游 `exports` 常指向并不存在的 `./index.d.ts`（bundler 形状）；测试与消费方用**显式路径**（如 `./src/index.ts`）绕过 exports 解析 |
| `version` | 保持上游值（用于溯源），不随本项目版本走 |

### 步骤 6 — `tsconfig.json` vendor 化 + 接入构建/测试

- `tsconfig.json` 改为继承本仓库根配置，`types` 用 `["node"]`，**排除测试文件**（理由见 §3 M-2）。
- **根 `tsconfig.json`**：加 `exclude: ["patches/omo-dsh/vendor/**/*.test.ts"]`。⚠️ 门 1（`pnpm typecheck`）用**根**配置编译 `patches/**`，vendor 包自身 tsconfig 的 exclude 对门 1 **无效**——不排除则 6 个 `bun:test` 测试文件报 `TS2307`（评审实测）。
- `pnpm-workspace.yaml`：必须**追加** `patches/omo-dsh/vendor/*`。⚠️ 既有行 `patches/omo-dsh/*` **不递归**匹配子目录，不能替代它。
- `vitest.config.ts`：显式 `include` 覆盖 vendor 路径（**不要**覆盖掉既有 `tests/`），加 `bun:test` → `vitest` 的 alias。
- `pnpm install` 后**提交 `pnpm-lock.yaml`**（CI 是 `--frozen-lockfile`）。
- 门链：如新增门，`.github/workflows/ci.yml` 与 `scripts/ci-local.sh` **两处同步**（仓库硬约束）。

### 步骤 7 — 署名与许可（详见[署名清单](./phase1-license-attribution.md)；**细则见 D15**）

1. **包级"已修改"声明 `NOTICE.md`**（vendor 包根，**D15 第 3 条**）：写明来源（repo + tag + commit）、**本副本已被修改**、修改清单指向 `VENDOR-MANIFEST.json`、版权属原作者。这是 SUL-1.0 "Notices" 要求的醒目声明主落点。
2. `VENDOR-MANIFEST.json`（vendor 包根）：`upstream` 段 + 逐文件 `files[]`（sha256 + `origin`）+ `deviations[]`（`class: modification` / `addition`）。
3. `THIRD_PARTY_NOTICES.md`：**逐文件**列出（**D15 第 2 条**——D14 第 3 条按字面执行），每行 = 文件名 + 处置（`verbatim` / `已修改` / `包外复制` / `本项目新增`）；小节头含来源；并补指向 `NOTICE.md` / manifest 的"已修改"声明。
4. 校验 `LICENSES/oh-my-openagent.LICENSE.md` 仍与上游根 `LICENSE.md` 逐字节一致（**已通过**，但每次 vendor 都重跑——许可可能变）。
5. **首次 vendor 的一次性动作（D16）**：把 `scripts/verify-licenses.mjs` 的 `SUL_ALLOWED_NAME` 增加 `oh-my-opencode` 分支（决策授权，非绕过），脚本头注释留痕，并在 `tests/omo-agents/verify-licenses.test.ts` 补放行用例。然后跑 `scripts/verify-licenses.sh --json`，确认 `pass: true` 且 `checked` 计数较接入前 **+1**（`checked` 是计数不是名单；计数差证明新包**被检查而非漏检**）。

> **一致性自检（数必须一一对得上）**：NOTICES 行数 = `files[]` 条目数；每种非 verbatim 处置与 `deviations[]` 的 `class` 一一对应——标"已修改"行数 = `class: "modification"` 条数；标"包外复制"行数 = `class: "copied-in"` 条数；标"本项目新增"行数 = `class: "addition"` 条数。**Phase 1 参照值**：29 行 = 23 verbatim + 3 已修改 + 1 包外复制 + 2 本项目新增；`deviations[]` 共 6 条。

> **不做的事**：不在每个源码文件头插入"modified by …"注记（**D15 第 3 条**明确否决）——那会让全部 verbatim 文件偏离上游，摧毁定向搬运与漂移检测。

### 步骤 8 — 验证与登记

```bash
pnpm test:vendor                  # 或 vitest 的对应路径过滤
pnpm install --frozen-lockfile    # CI 的原命令，必须退出 0
scripts/verify-licenses.sh
node scripts/check-docs-consistency.mjs
scripts/ci-local.sh               # 全门
```

**并断言测试真的被收集**：记录收集到的测试文件数，与上游 `*.test.ts` 数量对照。测试"没被收集"会表现为**完美的假绿**。

最后：把本次的新发现（新 shim 类别、新依赖、新坑）回填 §3 与 §5。

---

## 3. 已知 shim 与偏离（Phase 1 实测）

### S-1 · `bun:test` → `vitest`

- **现象**：上游测试 `import { describe, it, expect } from "bun:test"`。
- **修法**：`vitest.config.ts` 加 `resolve.alias: { 'bun:test': 'vitest' }`。**不改测试源码。**
- **未验证（P1-T5 回填）**：vitest 4 下 alias 是否足够，还是需要自定义 resolver plugin；两者在 `expect` 语义 / `test.each` / 快照上的行为差异是否导致失败。
- **判定标准**：若出现失败，逐个判定是**测试框架差异**（继续 shim）还是**真实缺陷**（停止并升级为风险）。

### S-2 · 包外测试辅助 import

- **现象**：`src/normalize-edits.test.ts` import `../../../test-support/unsafe-test-value`（OMO 仓库根下的 4 行类型辅助函数，**不在包内**）。
- **修法**：把该文件 vendor 到 `src/test-support/unsafe-test-value.ts`，import 改一行。
- **被否决的替代方案**：vitest alias 指向仓库外的 OMO 检出——那会让 CI 依赖 `~/GithubRepo/oh-my-openagent` 存在（CI 必红），且违反"vendor 的意义是自包含"。
- **通用化**：凡遇 `<PKG>` 之外的相对 import，一律**复制进包内**并登记偏离；不要引外部路径。

### M-1 · 无 `license` 字段（**每个 core 包都会遇到**）

- **现象**：`package.json` 无 `license`。
- **修法**：vendor 副本显式补 `"license": "SUL-1.0"`，并在 manifest 的 `deviations[]` 与 NOTICES 中说明"上游许可由仓库根 `LICENSE.md` 承载"。
- **合规定性**：不是自我授权，是**记录实际适用的许可**；是 `verify-licenses` 通过的必要条件。完整论证见[署名清单 §5](./phase1-license-attribution.md)。
- **名称门（必要但不充分）**：`SUL_ALLOWED_NAME` 不匹配 `@oh-my-opencode/*`，只补字段仍会被判 violation——首次 vendor 须按 **D16** 一并扩展该正则（决策授权的一次性动作，见步骤 7 第 5 项）。
- **已固化**：**D15 第 1 条** + **D16**（2026-09-11，中英双语）。后续包直接按 D15/D16 处置，不重判。

### M-2 · `tsconfig.json` 的 `bun-types`

- **现象**：上游 `types: ["bun-types"]`、`lib: ["ESNext"]`；本仓库无 `bun-types`，且 `tsc` 无法解析 `bun:test`。
- **修法（Phase 1 采纳方案 A）**：vendor 的 `tsconfig.json` 用 `lib: ["ES2022"]` + `types: ["node"]` + `include: ["src"]` + `exclude: ["src/**/*.test.ts"]`；测试只在 vitest 下运行。**根 `tsconfig.json` 同步加 `exclude: ["patches/omo-dsh/vendor/**/*.test.ts"]`**——门 1 用根配置编译 `patches/**`，包自身 exclude 对门 1 无效（评审实测根编译对 `bun:test` 报 `TS2307`）。
- **代价（必须如实记录）**：vendor 的**测试文件不进 typecheck**。因此**不能把 typecheck 绿当作 vendor 正确的证据**——vendor 的正确性证据是测试门。同理，`pnpm typecheck:host` 对本改动保持 vacuous PASS（无 `src/client`）。
- **替代方案 B**（未采纳）：引入 `bun-types` devDependency 让上游测试也过 `tsc`——为"验证 vendor"引入新类型依赖，收益低于代价。留作后续可选硬化。

### M-3 · 上游 `exports` 指向不存在的文件

- **现象**：`"exports": { ".": { "types": "./index.d.ts", "import": "./src/index.ts" } }`，而包根**没有** `index.d.ts`。
- **处置**：**不改**。但要注意这是**两件事**，别混为一谈：
  1. **`types` 条件指向不存在的文件**：影响的是"以包名 import 时的类型解析"。本项目在 `pnpm typecheck` 与测试里都走**显式路径**（`./src/index.ts`），不触发该条件，故无影响。
  2. **包内对第三方依赖的解析仍然走包名**：`src/diff-utils.ts` 里的 `import { createTwoFilesPatch } from "diff"` 是裸包名，由 pnpm 以 `patches/omo-dsh/vendor/hashline-core/node_modules/` 解析。这不是 exports 问题，而是"工作区依赖是否装到位"——见 §4 排查表。若将来有消费方依赖包名解析，届时再单独决策。

---

## 4. 常见失败与排查

| 症状 | 成因 | 处置 |
|---|---|---|
| CI `pnpm install --frozen-lockfile` 失败 | ① 忘了在 `pnpm-workspace.yaml` 追加 `patches/omo-dsh/vendor/*`；② 本地 `pnpm install` 后没提交 `pnpm-lock.yaml` | 补 workspace 行 → 重跑 install → **提交 lockfile** |
| `verify-licenses` 报 `MISSING` | 忘了补 `license` 字段（步骤 5） | 补 `"license": "SUL-1.0"` + 登记偏离 |
| `verify-licenses` 报 `…: SUL-1.0` violation | 包名不匹配名称门（`SUL_ALLOWED_NAME` 不含上游 scope） | 确认 D16 的 `oh-my-opencode` 扩展已落地（首个包的一次性动作，步骤 7 第 5 项）；若是**新 scope** 的包，升级为决策，不得擅自放宽 |
| `verify-licenses` 报某个新依赖越界 | 该依赖的许可不在 `UNIVERSAL_WHITELIST` | **不要**改白名单绕过（ROADMAP §3 约束 4）。要么换依赖，要么走**决策**（D12 先例） |
| vendor 测试"全绿"但数量为 0 | vitest `include` 没覆盖 vendor 路径 | 显式声明 `include`，并**断言收集数** |
| `pnpm` 拒绝某个依赖（发布年龄策略） | `pnpm-workspace.yaml` 的 `minimumReleaseAge` | 按既有 `minimumReleaseAgeExclude` 惯例**单独登记该包**并留痕 |
| 测试报 `Cannot find package 'diff'`（或同类裸包名） | vendor 包没被 workspace 认到，依赖没装进包的 `node_modules` | 检查 `pnpm-workspace.yaml` 的追加行（步骤 6），重跑 `pnpm install`。对应 M-3 第 2 点 |
| `tsc` 报 `bun:test` 无法解析 | 测试文件没被排除在 typecheck 之外 | 检查**根** `tsconfig.json` 的 `exclude`——门 1 用根配置编译 `patches/**`，vendor 包自身 tsconfig 的 exclude 对门 1 无效 |
| `tsc` 报 `Bun` 未定义 | 上游源码**硬**依赖 Bun 全局（不是 `globalThis` 探测） | 这是真 shim 需求，不是配置问题：做最小改动并登记偏离；同时回填本节 |
| 测试失败但错误指向框架语义 | bun 与 vitest 的 `expect` / 生命周期差异 | 逐个判定"框架差异 vs 真实缺陷"（S-1 判定标准） |

---

## 5. 下一个包会不同的地方（Phase 1 已知的变量）

| 变量 | 为什么可能不同 | 动手前要看什么 |
|---|---|---|
| tag 是否仍是 v4.19.4 | D14 的条件式选择 | 步骤 1a |
| shim 数量 | 取决于包外 import 与运行时假设 | 步骤 2 的两张检查表 |
| 是否引入新依赖 | `hashline-core` 只有 1 个（`diff`），别的包可能更多 | 步骤 2 + `verify-licenses` |
| 是否值得独立成 workspace 包 | 单包自包含 → 独立包；若被多个包共享 → 考虑合并落点 | §7 |
| 是否需要在 CI 增门 | 若测试量或运行时长显著增长 | 步骤 6 末段 |
| 是否需要 `minimumReleaseAgeExclude` 例外 | 新依赖的发布时间 | §4 |

---

## 6. 漂移检测（面向 Phase 7 与定向搬运）

`VENDOR-MANIFEST.json` 的 `files[]` 让"vendor 副本是否被手改过"成为**可判定**问题：

```bash
# 对 origin == "verbatim" 的条目重算 sha256，任何不一致 = 有人手改了 vendor 源码
node -e "…" # Phase 1 不写脚本；先用 node/jq 手工核对
```

两个正当的"不一致"来源，需与真漂移区分：
1. **定向搬运**（ROADMAP §2 规则 4）：按文件 cherry-pick 上游修复 → 应**主动更新** manifest 对应条目并在 NOTICES 留痕。
2. **本项目自己的 shim** → 已在 `deviations[]` 中登记，本就不属 `verbatim`。

**不做的事**（Phase 1 判定）：不为此写 CI 门。等 vendor 包数量 **≥ 3** 时再评估是否脚本化——那时收益才覆盖维护成本。

---

## 7. 何时**不**照抄本 playbook

| 情形 | 为什么 | 该做什么 |
|---|---|---|
| 目标包依赖多个兄弟 core 包 | vendor 一个 = vendor 一棵树；逐包照抄会产生重复副本与版本错配 | 先做**依赖面评估**，决定是"整树一次搬"还是"只搬叶子包"，并把结论写成一次**决策** |
| 目标包需要 OMO 的构建管线产出 dist | 本文假定源码可直接加载（Node 24 类型剥离） | 需先决策"是否把构建步骤也引进"——这会显著改变成本 |
| 只需要包内**一个函数** | 全量 vendor 的代价（署名、漂移、CI 面）高于收益 | 按 ROADMAP §2 规则 4 走**定向搬运**（文件级 cherry-pick + 署名），而不是整包 vendor |
| 目标在适配层（opencode / senpi） | ROADMAP §3 约束 5 | **不 vendor**；改为在 DSH 上重新实现语义 |

---

## 8. 快速卡（TL;DR）

```
1. npm view oh-my-openagent dist-tags  → 定 <TAG>（v5 正式版？）
2. git rev-parse "<TAG>^{commit}"       → 记 commit
3. git ls-tree / show package.json      → 评估依赖 / 跨包 import / 测试框架 / license
4. git archive | tar -x                 → 逐字节导入 → 全量 sha256 比对（必须 0 差异）
5. shim：bun:test→vitest；包外 import 复制进包内           [登记偏离]
6. 包根新增 NOTICE.md（已修改声明）与 VENDOR-MANIFEST.json
   package.json：补 license=SUL-1.0（必需，D15.1）          [登记偏离]
   tsconfig.json：node 形状 + 排除测试                      [登记偏离]
   根 tsconfig.json：exclude vendor 测试（门 1 用根配置）
7. pnpm-workspace.yaml 追加 patches/omo-dsh/vendor/*  → pnpm install → 提交 lockfile
   vitest include + alias；门链两处同步
8. 首个包先按 D16 扩展 SUL_ALLOWED_NAME（一次性）；
   NOTICES 逐文件列出（D15.2）+ 已修改声明；verify-licenses
9. 断言测试收集数 > 0 且全绿；ci-local 全门绿；回填本文件 §3/§5
```
