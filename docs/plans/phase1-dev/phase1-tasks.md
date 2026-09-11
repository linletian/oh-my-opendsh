# Phase 1 任务清单

> **上游依据**：[开发计划书](./phase1-plan.md) · [ROADMAP Phase 1](../../roadmap_zh-CN.md) · [决策 D14](../../decisions_zh-CN.md) · [决策 **D15**（vendor 合规细则）](../../decisions_zh-CN.md) · [决策 **D16**（verify-licenses 名称门扩展）](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 1 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：⬜ **2/14 完成**（P1-T13 D15、P1-T14 D16 决策登记已提前完成；vendor 实施尚未开工）。`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）。
>
> **编号**：`P1-T<n>`（Phase 1 - Task n）。工作包归属见计划书 §7。

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1 | 上游 OMO v4.19.4 可取到源码 | `git -C <omo> rev-parse v4.19.4^{commit}` 返回 40 位 SHA | ⬜ 实测候选 `b072d279110bdda2c6ac2525d0d24dc54d16148a`（2026-09-11 调研，**实施时复核**） |
| PRE-2 | v5.0.0 正式版**未**发布 → tag 选择已闭合为 v4.19.4 | `npm view oh-my-openagent dist-tags --json` 的 `latest` 仍为 `4.19.4` | ⬜ 2026-09-11 实测 `latest`=4.19.4 / `beta`=5.0.0-beta.53。**实施时重跑**；若 `latest` 已变成 `5.x`，按 ROADMAP §2 规则 3 改用 v5.0.0 并**先更新计划书 §2** |
| PRE-3 | 本地 `pnpm install` 与 CI 一致（现状绿） | `scripts/ci-local.sh` 8 门全绿 | ⬜ **基线**：开工前必须记录一次全绿（否则后续红/绿无法归因） |
| PRE-4 | 上游依赖 `diff@^9.0.0` 可解析 | `npm view diff@^9.0.0 version license` | ⬜ 2026-09-11 实测 `9.0.0` / `BSD-3-Clause` |

---

## WP-1 引进（计划书 §3–§4.3）

### [ ] P1-T1 — 复核上游来源与 tag 身份

- **产出**：`VENDOR-MANIFEST.json` 的 `upstream` 段。
- **做法**：
  1. `git -C <omo> rev-parse v4.19.4^{commit}` → 记录 40 位 SHA。
  2. 确认目标文件集：`git -C <omo> ls-tree -r --name-only v4.19.4 -- packages/hashline-core`，预期 **26 个文件**（`AGENTS.md`、`package.json`、`tsconfig.json`、`src/` 下 23 个：17 源码 + 6 测试）。
  3. **只从 tag 取内容**（`git show v4.19.4:<path>` 或 `git archive`），**绝不**从工作树复制——本地检出 HEAD 不在该 tag 上且带有未提交改动（计划书 R-2）。
- **判定**：SHA 与文件清单写入 manifest，文件数与上表一致。
- **依赖**：PRE-1、PRE-2。**量级**：15 分钟。

### [ ] P1-T2 — 导入 vendor 文件树（逐字节）

- **产出**：`patches/omo-dsh/vendor/hashline-core/` 下的全部文件。
- **做法**：推荐用 `git archive` 一次导出，避免逐文件 `git show` 的手工误差：
  ```bash
  # 在 OMO 检出内，导出到临时目录后复制（保留目录形状）
  git -C <omo> archive v4.19.4 packages/hashline-core | tar -x -C /tmp/p1-vendor
  mkdir -p patches/omo-dsh/vendor
  cp -r /tmp/p1-vendor/packages/hashline-core patches/omo-dsh/vendor/
  ```
- **判定**：导入后**立即**逐文件 sha256 与 tag 内容比对，**0 处差异**（除 P1-T3/P1-T4 即将改动的文件外）：
  ```bash
  for f in $(cd patches/omo-dsh/vendor/hashline-core && find . -type f | sed 's|^\./||'); do
    a=$(git -C <omo> show "v4.19.4:packages/hashline-core/$f" | sha256sum | cut -d' ' -f1)
    b=$(sha256sum "patches/omo-dsh/vendor/hashline-core/$f" | cut -d' ' -f1)
    [ "$a" = "$b" ] || echo "DIFF $f"
  done
  ```
- **注意**：**不要**顺手格式化/改 import 风格/"现代化"代码。逐字节一致是后续定位问题与定向搬运（ROADMAP §2 规则 4）的前提。
- **依赖**：P1-T1。**量级**：20 分钟。

### [ ] P1-T3 — shim S-2：包外测试辅助函数

- **产出**：`src/test-support/unsafe-test-value.ts`（新增）+ `src/normalize-edits.test.ts` 的 1 行 import 改写。
- **做法**：
  1. `git -C <omo> show v4.19.4:test-support/unsafe-test-value.ts` → 落到 `patches/omo-dsh/vendor/hashline-core/src/test-support/unsafe-test-value.ts`（该文件仅 4 行，含 2 个重载签名 + 1 个实现）。
  2. 把 `src/normalize-edits.test.ts` 的 `from "../../../test-support/unsafe-test-value"` 改为 `from "./test-support/unsafe-test-value"`。
  3. 两处改动**逐条**写入 `VENDOR-MANIFEST.json` 的 `deviations`。
- **为什么不改上游更多**：改写范围越小，后续 `git diff` 上游时噪声越小；这 1 行是本阶段唯一允许的语义源码偏离。
- **判定**：`grep -rn "test-support" patches/omo-dsh/vendor/hashline-core/src` 只命中上述两处；无任何 `../../../` 形式的跨包 import。
- **依赖**：P1-T2。**量级**：15 分钟。

### [ ] P1-T4 — 包根新增文件 + `package.json` / `tsconfig.json` vendor 化

- **产出**：改后的 `package.json`、`tsconfig.json`，新增 `NOTICE.md` 与 `VENDOR-MANIFEST.json`。
- **做法**（严格按计划书 §4.4 / §4.5 / §4.6，不即兴发挥）：
  - `package.json`：**新增** `"license": "SUL-1.0"`（← `verify-licenses` 的必要条件，**D15 第 1 条**）；**新增** `test:vitest` script；**其余字段不动**（`name` 保持 `@oh-my-opencode/hashline-core`）。
  - `tsconfig.json`：改为 `extends` 仓库根配置 + `lib: ["ES2022"]` + `types: ["node"]` + `include: ["src"]` + `exclude: ["src/**/*.test.ts"]`。
  - `NOTICE.md`（包根）：按计划书 §4.6.1 写四行语义——来源（repo+tag+commit）、**本副本已被修改**、修改清单指向 `VENDOR-MANIFEST.json`、版权属原作者（这是 **D15 第 3 条**要求的醒目声明主落点）。
  - `VENDOR-MANIFEST.json`：按计划书 §4.6.2 的结构填充，`files[]` 覆盖**全部** vendor 文件并标注 `origin`（`verbatim` **23** / `modified` **3** / `copied-in` **1** / `project-new` **2**）。
- **判定**：`files[]` 共 **29** 条且与[署名清单](./phase1-license-attribution.md) §3.2.1 的 29 行**逐一对齐**；每个 `origin: "verbatim"` 条目的 sha256 与 tag 内容一致；`deviations[]` 共 **6** 条（`class: "modification"` **3** / `class: "copied-in"` **1** / `class: "addition"` **2**）。
- **依赖**：P1-T3。**量级**：40 分钟。

---

## WP-2 接入（计划书 §4.2、§4.3）

### [ ] P1-T5 — vitest 接入 + `bun:test` alias（shim S-1）+ 根 tsconfig 排除 vendor 测试

- **产出**：`vitest.config.ts` 改动 + `package.json` 的 `test:vendor` script + 根 `tsconfig.json` 的 exclude。
- **做法**：
  1. `vitest.config.ts`：显式 `include` 覆盖 `patches/omo-dsh/vendor/**/*.test.ts`，并保留既有 `tests/` 的收集（**不要**用新 include 覆盖掉既有测试！）。
  2. 加 `resolve.alias: { 'bun:test': 'vitest' }`。
  3. `package.json` 加 `"test:vendor": "vitest run patches/omo-dsh/vendor"`。
  4. **根 `tsconfig.json`** 加 `exclude: ["patches/omo-dsh/vendor/**/*.test.ts"]`——门 1 用**根**配置编译 `patches/**`，vendor 包自身 tsconfig 的 exclude 对门 1 **无效**（评审实测根编译会把 6 个 `bun:test` 测试文件报 `TS2307`）。
- **判定**：`pnpm test:vendor` 输出中收集到的测试文件数 = **6**，且全部 PASS（计划书退出标准 a 证据②）；`pnpm typecheck` 保持绿。
- **若失败**：见计划书 Q-1/Q-2/Q-3。逐项判定是"测试框架差异"（继续 shim）还是"vendor 引入的真实缺陷"（停止，升级为风险并回报）。
- **依赖**：P1-T4。**量级**：1–3 小时（**本阶段最大不确定项**）。

### [ ] P1-T6 — pnpm workspace 接入（R-1 的关键路径）

- **产出**：`pnpm-workspace.yaml` + 更新的 `pnpm-lock.yaml`。
- **做法**：
  1. `pnpm-workspace.yaml` 的 `packages` **追加** `patches/omo-dsh/vendor/*`（既有 `patches/omo-dsh/*` **保留**——它不递归，两者是并列关系，不是替代）。
  2. `pnpm install` 让 `diff@9.0.0` 进入 lockfile。
  3. **提交 `pnpm-lock.yaml`**：CI 用 `pnpm install --frozen-lockfile`，本地不提交 = CI 必红。
- **判定**：
  ```bash
  pnpm install --frozen-lockfile   # 必须退出 0（这是 CI 的原命令）
  ```
  若因 `minimumReleaseAge` 拒绝 `diff`：按 `pnpm-workspace.yaml` 既有 `minimumReleaseAgeExclude` 惯例单独登记该包，并在本文档"实施记录"留痕。
- **依赖**：P1-T5。**量级**：20 分钟。

### [ ] P1-T7 — 门链同步（CI + 本地双份）

- **产出**：`.github/workflows/ci.yml` 与 `scripts/ci-local.sh` 的**同步**改动。
- **背景**：该仓库有硬约束——两处门链必须 **byte-equivalent**（见两文件头部注释）。只改一处 = 审查必然打回。
- **做法**：把 vendor 测试纳入既有门 2（`pnpm vitest run`）**或**新增一门 `test:vendor`；两者取其一并**在两处同步**。推荐**纳入门 2**（最少改动，且 `test:vendor` 仍可单独复跑）：此时需确认 vitest 默认收集范围已覆盖 vendor 目录（P1-T5 的 `include` 即为此）。
- **判定**：`diff <(sed -n '/gate 1/,/gate 8/p' scripts/ci-local.sh) <(sed -n '/gate 1/,/gate 8/p' .github/workflows/ci.yml)` 的**门序列**一致（无需逐字节相同，但门的数量、顺序、命令必须一一对应；以仓库既有注释的要求为准）。
- **依赖**：P1-T6。**量级**：30 分钟。

---

## WP-3 署名与合规（[署名清单](./phase1-license-attribution.md)）

### [ ] P1-T8 — `THIRD_PARTY_NOTICES.md` 逐文件署名（D15 第 2 条）

- **产出**：`THIRD_PARTY_NOTICES.md` 中 OMO 段的新增 vendor 小节。
- **做法**：按[署名清单](./phase1-license-attribution.md) §3.2.1 的 **29 行覆盖表**逐文件落地。每行含：文件名 + 处置（`verbatim` / `已修改` / `包外复制` / `本项目新增`）；小节头部含来源（repo + tag + commit + License 指向 + 本仓库落点）。同时补**醒目"已修改"声明**（N-3，指向包根 `NOTICE.md` 与 `VENDOR-MANIFEST.json`）。
- **判定**：
  - 29 行**全部**出现（`grep -c` 或人工点检），标 `已修改` 的行数 = **3**、标 `包外复制` 的行数 = **1**、标 `本项目新增` 的行数 = **2**；
  - 与 `VENDOR-MANIFEST.json` 的文件清单**逐一对齐**（K-5 / K-7）；
  - 清单 §4 的核对表全绿；**既有条目零改动**（`git diff THIRD_PARTY_NOTICES.md` 只显示新增行）。
- **超出范围**：不写自动校验脚本（计划书 §4.6.2 末段）。
- **依赖**：P1-T4。**量级**：45 分钟（逐文件列表比目录级条目长）。

### [ ] P1-T9 — License 合规校验（`verify-licenses` + LICENSE 原文比对）

- **产出**：`verify-licenses` 绿；`LICENSES/oh-my-openagent.LICENSE.md` 与上游 v4.19.4 `LICENSE.md` 的比对结论。
- **做法**：
  1. **先落地 D16（一次性）**：把 `scripts/verify-licenses.mjs` 的 `SUL_ALLOWED_NAME` 增加 `oh-my-opencode` 分支（D16 决策授权的白名单类变更，**非绕过**），在脚本头注释留痕；并在 `tests/omo-agents/verify-licenses.test.ts` 补 `@oh-my-opencode/*` 放行用例。不做这一步，补了 `license` 字段也会被判 violation（评审实测）。
  2. `scripts/verify-licenses.sh --json` → 断言 `pass: true`，且 `checked` 计数较接入前 **+1**（`checked` 是计数不是名单；repo 内包不进 lockfile `packages:` 段，不会出现在 `skippedNames`——计数差证明 vendor 包**被检查而非漏检**）。
  3. **LICENSE 原文校验（R-6）**：`git -C <omo> show v4.19.4:LICENSE.md | sha256sum` vs `sha256sum LICENSES/oh-my-openagent.LICENSE.md`。
- **判定**：三条都通过。若 LICENSE 不一致 → **补齐并记录**；若名称门扩展后 `verify-licenses` 仍因上游许可 fail → **停止，不得进一步放宽白名单**（ROADMAP §3 约束 4），升级为决策。
- **依赖**：P1-T6。**量级**：30 分钟。

### [ ] P1-T10 — README / CHANGELOG 说明

- **产出**：`README.md`、`README_zh-CN.md`（如涉及）、`CHANGELOG.md` 的必要说明。
- **做法**：措辞必须写明"**已 vendor、未消费**"（R-7），并指向本计划目录。**不要**写成"hashline 已接入 concerto"。
- **判定**：`node scripts/check-docs-consistency.mjs` 绿（**必须**——门 7 会检查 README 状态段与版本 token；改 README 有踩雷风险）。
- **注意**：`docs/roadmap_zh-CN.md` 的 Phase 1 在结项时才从"计划"改"已交付"——**本任务不改 roadmap**（留给 P1-T12）。
- **依赖**：P1-T9。**量级**：30 分钟。

---

## WP-4 收口（[playbook](./vendoring-playbook.md)）

### [ ] P1-T11 — playbook 实测回填

- **产出**：`docs/plans/phase1-dev/vendoring-playbook.md` 从"计划稿"变为"实录稿"。
- **做法**：逐条核对 playbook 的每个步骤是否与实际执行一致；把 S-1/S-2 的**真实报错与真实修法**写进去（而不是计划里的预判）；补上"下一个包会不同的地方"一览。
- **判定**：playbook 中**不存在**未经验证的断言（凡"预计/应该"字样，要么改为实测结论，要么显式标为未验证）。
- **依赖**：P1-T7、P1-T9。**量级**：1 小时。

### [ ] P1-T12 — 退出标准逐条核对 + 计划目录与实测对齐

- **产出**：本文件"退出标准核对表"填满；计划书与实测冲突处**改文档**。
- **做法**：按计划书 §5 的 a–g 逐条填证据（命令 + 输出关键行）。凡实测推翻计划假设（例如 Q-1 结论与预期不同），**修计划书**并在本文档留痕，不得为了"计划好看"而隐瞒。
- **判定**：a–g 全部有可复核证据；`scripts/ci-local.sh` **全 8 门绿**（退出标准 e）。
- **依赖**：P1-T11。**量级**：1 小时。

### [x] P1-T13 — 决策登记（R-4 固化）✅ **已完成（2026-09-11，先于 vendor 实施）**

- **产出**：`docs/decisions.md` + `docs/decisions_zh-CN.md` 的 **D15**（第七批）。
- **实际做法**：把计划阶段发现的**两个同源合规问题**一并固化为 **D15「vendor 合规细则（D14 第 3 条的落地解释）」**，而不是只记 R-4：
  1. **第 1 条**——上游 core 包无 `license` 字段（19/19）→ vendor 副本必须显式补 `"SUL-1.0"`（记录实际适用许可，非自我授权）；不得改白名单绕过。
  2. **第 2 条**——D14 第 3 条的"按 vendor 文件逐一署名"**按字面执行**：NOTICES 逐文件列出，manifest 的逐文件 sha256 仅为机器可读补充层，不替代署名。
  3. **第 3 条**——采纳 SUL-1.0 "Notices" 的"已修改"声明，落点在**包级文件**（包根 `NOTICE.md` + NOTICES 条目 + manifest `deviations[]`），**不在**每个源码文件头插注记。
  4. **第 4 条**——适用面 = **每一次** OMO core 包 vendor（不止 hashline-core）。
- **为什么提前到实施之前**：这三条对后续 18 个包会**逐一同现**；在实施前固化，后续包直接照做，不重走判定。同时它也**闭合了计划阶段发现的一处口径分歧**（本文档/署名清单早期主张"目录级署名 + manifest 承载 verbatim"，与 D14 原文冲突 → 经确认按 D14 字面执行）。
- **判定**：✅ 双语决策文档均有 D15 条目且措辞对应；编号约定已同步为 D1–D15；决策历史已登记，并注明"Phase 1 实施尚未开工"。
- **依赖**：无（不依赖 P1-T9）。**量级**：已完成。
- **豁免说明**：本任务原本允许"结项后立即补"；实际**提前完成**，因此不再需要豁免标注。

### [x] P1-T14 — 决策登记（D16：verify-licenses 名称门扩展）✅ **已完成（2026-09-11，评审修复轮）**

- **产出**：`docs/decisions.md` + `docs/decisions_zh-CN.md` 的 **D16**（第八批）。
- **背景**：计划评审实证发现 `SUL_ALLOWED_NAME`（整词 `omo` 或 `oh-my-openagent`）**不匹配** `@oh-my-opencode/*`——按计划拟定的 manifest 模拟运行 `verify-licenses` 得 `violations: ["@oh-my-opencode/hashline-core@0.1.0: SUL-1.0"]`。只补 `license` 字段（D15 第 1 条）必要而不充分；计划原 §4.4"恰好匹配"的主张为假。
- **决策要点**：① vendor core 包**保持上游包名**（否决改名：包名是漂移检测与定向搬运的溯源锚点）；② `SUL_ALLOWED_NAME` 增加 `oh-my-opencode` 分支——**经决策授权**的白名单类变更（ROADMAP §3 约束 4，D12 先例），非临时绕过；③ 脚本改动（正则 + 头注释 + 测试用例）随 **P1-T9** 落地；④ 适用全部 19 个 core 包。
- **同轮修复（评审发现的其余三项）**：① 计数体系统一为 **23 verbatim / 3 已修改 / 1 包外复制 / 2 本项目新增**（`files[]` 29 条、`deviations[]` 6 条、NOTICES 29 行），双语决策 D15 的依据列同步修正；② 根 `tsconfig.json` 排除 vendor 测试补为**第四接入点**（计划书 §4.2 / §4.5，P1-T5）；③ K-2 / 退出标准 b2 的证据改为 `checked` **计数差**（`--json` 的 `checked` 是计数不是名单）。
- **判定**：✅ 双语决策文档均有 D16 条目且措辞对应；编号约定已同步为 D1–D16；决策历史已登记。
- **依赖**：无。**量级**：已完成。

---

## 退出标准核对表（ROADMAP §4 Phase 1 + 计划书 §5 DoD）

> 结项时逐行填满。**不允许空行**（空 = 未结项）。

| # | 标准 | 判定命令 / 证据 | 结果 |
|---|---|---|---|
| **a1** | 构建/依赖可复现 | `pnpm install --frozen-lockfile` | ⬜ |
| **a2** | vendor 测试在本项目 CI 跑通 | `pnpm test:vendor`（收集 6 文件，全 PASS） | ⬜ |
| **a3** | 门链同步 | 门序列比对（P1-T7） | ⬜ |
| **b1** | `verify-licenses` 绿 | `scripts/verify-licenses.sh --json` → `pass: true`（D16 名称门扩展已落地，P1-T9） | ⬜ |
| **b2** | vendor 包**被检查**（非漏检） | 同上输出的 `checked` 计数较接入前 **+1**（计数差为证据；`checked` 是计数不是名单） | ⬜ |
| **c1** | NOTICES 含来源条目 | `THIRD_PARTY_NOTICES.md` 含 repo + tag + commit + License + 落点 | ⬜ |
| **c2** | NOTICES **逐文件**列出（D15 第 2 条） | 29 行齐备；标 `已修改` = 3、`包外复制` = 1、`本项目新增` = 2；与 manifest `files[]`（29 条）、`deviations[]`（6 条）一一对齐 | ⬜ |
| **c3** | 醒目"已修改"声明齐备 | 包根 `NOTICE.md` + NOTICES 条目 + manifest `deviations[]` | ⬜ |
| **d** | playbook 完成且经实测 | [`vendoring-playbook.md`](./vendoring-playbook.md) 无未验证断言 | ⬜ |
| **e** | 全 8 门绿 | `scripts/ci-local.sh` | ⬜ |
| **f** | 计划文档与实测无冲突 | P1-T12 | ⬜ |
| **g** | 既有署名零改动 | `git diff THIRD_PARTY_NOTICES.md` 仅新增 | ⬜ |

---

## 实施记录（边做边填）

> 记录计划外的发现、返工与判定。**这是 playbook（P1-T11）的原料**——不要等到结项再回忆。

| 日期 | 任务 | 发现 / 偏离计划 | 处置 |
|---|---|---|---|
| 2026-09-11 | 计划阶段（未开工） | 上游 19 个 core 包 `package.json` **均无 `license` 字段** → `verify-licenses` 会 FAIL，退出标准 (b) 不可达 | 已固化为 **D15 第 1 条**（vendor 副本补 `"license": "SUL-1.0"`）；P1-T13 提前完成 |
| 2026-09-11 | 计划阶段（未开工） | `pnpm-workspace.yaml` 的 `patches/omo-dsh/*` **不递归**匹配 `vendor/*` → CI `--frozen-lockfile` 必红 | 计划书 R-1：并列追加 `patches/omo-dsh/vendor/*` 并提交 lockfile（P1-T6） |
| 2026-09-11 | 计划阶段（未开工） | 本仓库 `LICENSES/oh-my-openagent.LICENSE.md` 与上游 v4.19.4 `LICENSE.md` **逐字节相同** | R-6 **关闭**；P1-T9 结项时重跑一次即可 |
| 2026-09-11 | 计划阶段（未开工） | 署名粒度出现口径分歧：计划文档早期主张"目录级 + manifest 承载 verbatim"，与 D14 第 3 条"按 vendor 文件逐一署名"**冲突** | 经确认**按 D14 字面执行**，并写入 **D15 第 2 条**；署名清单改为逐文件表（评审轮统一计数后定稿 29 行） |
| 2026-09-11 | 计划阶段（未开工） | SUL-1.0 的 "Notices" 第二句要求修改副本携带醒目声明，而补 license 字段即构成"修改" | 固化为 **D15 第 3 条**：声明落在**包级文件**（`NOTICE.md` + NOTICES + manifest），不入源码文件头 |
| 2026-09-11 | 计划阶段（未开工） | 该 SUL-1.0 文本是 GitHub 的 "**Sustainable** Use License" 模板（**非** Functional Source License 模板） | 已按此核对条款；未改变处置结论（两版模板该条措辞相同） |
| 2026-09-11 | 计划评审（未开工） | 计划 §4.4 声称 `SUL_ALLOWED_NAME` "恰好匹配 `@oh-my-opencode/…`"——**实证为假**（整词 `omo` 与 `oh-my-openagent` 均不匹配该 scope），模拟运行 `verify-licenses` 判 violation：`["@oh-my-opencode/hashline-core@0.1.0: SUL-1.0"]` | 固化为 **D16**（名称门扩展经决策授权，非绕过）；P1-T14 完成；P1-T9 增加脚本改动步骤（正则 + 头注释 + 测试用例） |
| 2026-09-11 | 计划评审（未开工） | 门 1 用**根** `tsconfig.json` 编译 `patches/**`，vendor 包自身 `exclude` 对门 1 **无效** → 6 个 `bun:test` 测试文件必报 `TS2307`（实测复现） | 根 tsconfig 排除补为**第四接入点**（计划书 §4.2 / §4.5，P1-T5） |
| 2026-09-11 | 计划评审（未开工） | 计数体系矛盾：verbatim 22（实为 **23**，未改动测试是 5 个不是 4 个）、NOTICES 行数 27/28/29 三个版本、"已修改=4 / 新增=3" 与覆盖表（3/2）冲突、包外复制件被双重计数 | 全文统一为 **23/3/1/2**（`files[]` 29 条、`deviations[]` 6 条、NOTICES 29 行）；双语决策 D15 依据列同步修正 |
| 2026-09-11 | 计划评审（未开工） | K-2 / b2 证据不可实施：`--json` 的 `checked` 是**计数**不是名单，repo 内包也不会出现在 `skippedNames` | 证据改为 **`checked` 计数差（+1）**（K-2、b2、P1-T9） |
