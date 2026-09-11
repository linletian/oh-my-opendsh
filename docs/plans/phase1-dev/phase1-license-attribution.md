# Phase 1 License 与署名覆盖清单

> **上游依据**：[ROADMAP §3 不可协商约束](../../roadmap_zh-CN.md) · [决策 D10 / D14 / **D15** / **D16**](../../decisions_zh-CN.md) · [可行性报告 §11.6](../../feasibility-report_zh-CN.md)
>
> **配套**：[开发计划书](./phase1-plan.md) · [任务清单](./phase1-tasks.md)（P1-T8 / P1-T9）
>
> **用途**：本文件是 Phase 1 的**合规覆盖清单**——回答"vendor 进来的每一个文件，署名与许可都落到位了吗"。它是退出标准 (b)(c)(g) 的判定依据。
>

---

## 1. 事实基线（2026-09-11 在 v4.19.4 tag 上实测）

| 项 | 实测值 |
|---|---|
| 上游仓库 | `https://github.com/code-yeongyu/oh-my-openagent` |
| 作者 | code-yeongyu |
| 冻结基线 tag | `v4.19.4` |
| tag commit（2026-09-11 复核一致） | `b072d279110bdda2c6ac2525d0d24dc54d16148a` |
| 上游许可文件 | 仓库根 `LICENSE.md` = **Sustainable Use License 1.0（SUL-1.0）** |
| 上游许可文件 sha256 | `b61ac928f152d13517328263e6bee9175b928f9ab696a2d2ca2b6cfd961ddc32` |
| 本仓库许可副本 | `LICENSES/oh-my-openagent.LICENSE.md` |
| 本仓库副本 sha256 | `b61ac928f152d13517328263e6bee9175b928f9ab696a2d2ca2b6cfd961ddc32` |
| 比对结论 | ✅ **逐字节相同**（计划书风险 **R-6 就此关闭**，无需补正） |
| 目标包 | `packages/hashline-core` → `@oh-my-opencode/hashline-core@0.1.0` |
| 包的 `license` 字段 | ⚠️ **缺失**（OMO 19 个 core 包一致；许可由仓库根 `LICENSE.md` 承载） |

> 复现命令（结项时重跑一次，把输出贴进任务清单 P1-T9）：
> ```bash
> git -C <omo> show v4.19.4:LICENSE.md | sha256sum
> sha256sum LICENSES/oh-my-openagent.LICENSE.md
> ```

## 2. SUL-1.0 对我们的三项强制义务

SUL-1.0 的约束以原文为准，此处只抽出**对本阶段有操作含义**的三条：

| # | 条款 | 原文要点 | 本项目的落地动作 |
|---|---|---|---|
| L-1 | **Limitations** | "You may use or modify the software only for your own internal business purposes or for **non-commercial** or personal use. You may distribute the software … only if you do so **free of charge for non-commercial purposes**." | 已由 **D8** 覆盖（不销售、不做商业服务/SaaS）；本阶段无新增动作，但**署名文案不得暗示商用授权**（计划书 §2 约束 2） |
| L-2 | **Notices（第一句）** | "You must ensure that anyone who gets a copy of any part of the software from you also gets a copy of these terms." | 分发本项目即分发 vendor 代码 → `LICENSES/oh-my-openagent.LICENSE.md` **必须随包**（现状已满足：文件在仓库内且 README 徽章指向它）。**保持逐字节原文**，不翻译、不改名 |
| L-3 | **Notices（第二句）** | "If you modify the software, you must include in any modified copies of the software a **prominent notice** stating that you have modified the software." | ⚠️ **本阶段唯一的实质合规动作**：我们是**修改过的副本**（§3.2.1 列出全部偏离），因此必须携带醒目的"已修改"声明。落点见 §3.3（**D15 第 3 条**定下"包级文件、不入文件头"） |

## 3. 覆盖清单

### 3.1 许可原文

| # | 要求 | 落点 | 状态 |
|---|---|---|---|
| A-1 | SUL-1.0 原文随包分发 | `LICENSES/oh-my-openagent.LICENSE.md`（已存在，sha256 与上游一致） | ✅ 已满足（本次校验确认） |
| A-2 | 许可原文**不失真** | 保持上游英文原文，不改名、不翻译、不加注释 | ✅ 已满足 |
| A-3 | 框架自身保持双许可 | 仓库根 `package.json` 的 `"license": "MIT OR SUL-1.0"`；vendor 包 `"license": "SUL-1.0"` | ✅ 已满足（P1-T4 落地；`pnpm exec tsc`/`verify-licenses` 均见该字段） |

### 3.2 逐文件署名覆盖（`THIRD_PARTY_NOTICES.md`）

**署名粒度：逐文件** —— D14 第 3 条的原文是"`THIRD_PARTY_NOTICES.md` **按 vendor 文件逐一署名**"，**D15 第 2 条**把它固定为**字面执行**：NOTICES 列出 vendor 包内**每一个文件**并标注处置，`VENDOR-MANIFEST.json` 的逐文件 sha256 只是**机器可读补充层**（供漂移检测与定向搬运用），**不替代** NOTICES 的署名。

> 这一点在计划阶段发生过一次口径分歧并已由 **D15** 裁定：本文档早期版本主张"目录级条目 + manifest 承载 verbatim 文件"，与 D14 原文冲突；**D15 维持 D14 的字面要求**，本文档按下表逐文件列出。

#### 3.2.1 覆盖表（26 个上游文件 + 1 个包外复制件 + 2 个项目新增 = 29 行）

> 下表已由 P1-T8 落进 `THIRD_PARTY_NOTICES.md`（2026-09-11，逐文件 29 行）；`处置` 列取值 = `verbatim` / `已修改` / `包外复制` / `本项目新增`。
> `sha256` 列在 NOTICES 中**是否逐行保留**：建议保留（它是"这个文件确实是那个 tag 的那份"的唯一机器可验证据）。若复查认为 NOTICES 过于冗长，可只保留**处置**列并指向 manifest——但**文件名必须逐行在 NOTICES 中出现**（这是 D15 的硬要求，不是可选项）。

| # | 文件（相对 `packages/hashline-core`） | 处置 | 说明 |
|---|---|---|---|
| 1 | `AGENTS.md` | `verbatim` | 上游包说明（含公开 API 表与消费者信息） |
| 2 | `package.json` | `已修改` | 新增 `license: "SUL-1.0"`（D15 第 1 条）+ `test:vitest` script；余字段原样 |
| 3 | `tsconfig.json` | `已修改` | 重写为 `ES2022` + `node` 形状并排除测试文件（上游用 `bun-types`；见 M-2） |
| 4 | `src/autocorrect-replacement-lines.ts` | `verbatim` | — |
| 5 | `src/constants.ts` | `verbatim` | — |
| 6 | `src/diff-utils.test.ts` | `verbatim` | `bun:test` → vitest 由配置 alias 处理，源码未改（S-1） |
| 7 | `src/diff-utils.ts` | `verbatim` | 唯一使用外部依赖 `diff` 的文件 |
| 8 | `src/edit-deduplication.ts` | `verbatim` | — |
| 9 | `src/edit-operation-primitives.ts` | `verbatim` | — |
| 10 | `src/edit-operations.test.ts` | `verbatim` | — |
| 11 | `src/edit-operations.ts` | `verbatim` | — |
| 12 | `src/edit-ordering.ts` | `verbatim` | — |
| 13 | `src/edit-text-normalization.ts` | `verbatim` | — |
| 14 | `src/file-text-canonicalization.ts` | `verbatim` | — |
| 15 | `src/hash-computation.test.ts` | `verbatim` | — |
| 16 | `src/hash-computation.ts` | `verbatim` | — |
| 17 | `src/hashline-chunk-formatter.ts` | `verbatim` | — |
| 18 | `src/hashline-edit-diff.ts` | `verbatim` | — |
| 19 | `src/index.ts` | `verbatim` | 包公开 API 出口（59 行） |
| 20 | `src/normalize-edits.test.ts` | `已修改` | **1 行 import 改写**（包外 `test-support` → 包内；见 S-2） |
| 21 | `src/normalize-edits.ts` | `verbatim` | — |
| 22 | `src/smoke-untested-modules.test.ts` | `verbatim` | — |
| 23 | `src/types.ts` | `verbatim` | — |
| 24 | `src/validation.test.ts` | `verbatim` | — |
| 25 | `src/validation.ts` | `verbatim` | — |
| 26 | `src/xxhash32.ts` | `verbatim` | `globalThis` 探测 Bun 绑定 + 纯 JS 回退 |
| 27 | `src/test-support/unsafe-test-value.ts` | `包外复制` | 内容 verbatim，但自上游**包外**路径 `test-support/unsafe-test-value.ts` 复制进来（**5 行**类型辅助；计划稿写"4 行"系笔误，P1-T11 实测更正）——不属包内 26 个上游文件 |
| 28 | `NOTICE.md`（包根） | `本项目新增` | **非上游内容**：SUL-1.0 要求的醒目"已修改"声明（D15 第 3 条，见 §3.3 N-1） |
| 29 | `VENDOR-MANIFEST.json`（包根） | `本项目新增` | **非上游内容**：来源 tag/commit + 逐文件 sha256 + `deviations[]` |

**合计**：上游 26 文件 = **23 verbatim + 3 已修改**；包外复制 **1**（第 27 行）；本项目新增 **2**（第 28、29 行）。NOTICES 共 **29 行**，与 manifest `files[]` 的 29 条一一对齐。

> ⚠️ **实施判定点（已结项）**：若实施中发现真实偏离多于上表，**必须回到本表补行**并把新行同步进 NOTICES。**实测结果**：未出现预料之外的偏离——上表 29 行与落地后的 `THIRD_PARTY_NOTICES.md`、`VENDOR-MANIFEST.json` `files[]`（29 条）**逐一对齐**（P1-T8/P1-T12 实测；`grep -c` 处置列 = 23/3/1/2）。

#### 3.2.2 与 manifest 的分工（避免两处重复维护出错）

| 载体 | 负责 | 不负责 |
|---|---|---|
| `THIRD_PARTY_NOTICES.md` | **署名声明**：逐个文件名 + 处置 + 来源（repo/tag/commit/License） | 哈希值（可选保留）、机器解析 |
| `VENDOR-MANIFEST.json` | **机器可读层**：逐文件 `sha256` + `origin` + `deviations[]` 的完整理由 | 替代 NOTICES 的署名 |

两处的**文件清单必须一致**；`deviations[]` 的条目与 NOTICES 的非 verbatim 行**一一对应**：`class: "modification"` = 标"已修改"行数（=**3**），`class: "copied-in"` = 标"包外复制"行数（=**1**），`class: "addition"` = 标"本项目新增"行数（=**2**），合计 **6** 条。

### 3.3 L-3"已修改"声明（醒目声明）

**D15 第 3 条**为 SUL-1.0 的 "Notices" 条款定下落地方式：声明落在**包级文件**，**不在**每个源码文件头插注记。本项目在 D15 的三处落点上再加一处包内文件，共四处：

| # | 落点 | 内容要求 | 依据 | 状态 |
|---|---|---|---|---|
| N-1 | vendor 包根 `NOTICE.md`（**主声明**） | 醒目写明：本副本 **vendored from OMO v4.19.4**（含 commit）、**已被修改**、修改清单指向同目录 `VENDOR-MANIFEST.json`；版权仍属原作者，本项目只声明"已修改" | D15 第 3 条 | ✅ 已落地（P1-T4；文件含 "**This copy has been MODIFIED.**"） |
| N-2 | `patches/omo-dsh/vendor/hashline-core/VENDOR-MANIFEST.json` | **机器可读的修改声明**（`deviations[]`：**6 条**，含类型/位置/理由），与 N-1、N-3 互相印证 | D15 第 3 条 | ✅ 已落地（P1-T4；`deviations[]` = modification 3 + copied-in 1 + addition 2） |
| N-3 | 仓库根 `THIRD_PARTY_NOTICES.md` | 条目内写明：本项目**修改了**该 vendored 副本，指向 `NOTICE.md` 与 `VENDOR-MANIFEST.json` | D15 第 3 条 | ✅ 已落地（P1-T8；"MODIFIED COPY" 醒目块，指向两文件） |
| N-4 | `LICENSES/oh-my-openagent.LICENSE.md` | SUL-1.0 原文随包（**不改动该文件**）——L-2 义务 | SUL-1.0 Notices 第一句 | ✅ 已满足（§1 校验） |

> **不做的事**：不在每个 `.ts` 文件头插入"modified by …"注释——那会让 23 个 verbatim 文件全部偏离上游，**直接摧毁**后续定向搬运（ROADMAP §2 规则 4）与漂移检测的可操作性。（D15 第 3 条明确否决了该做法。）
>
> **为什么包级声明足够**：SUL-1.0 的模板措辞是 "include in any modified copies of the software a prominent notice"，"the software" 按定义涵盖"any portion of it"，因此**一份随副本分发、指向完整修改清单的醒目声明**即满足该条款；把声明复制到 23 个未改动文件里，既不增加合规强度，又制造了 23 份假偏离。

### 3.4 运行时依赖

vendor 包引入的**唯一**外部依赖，同样需要许可覆盖：

| # | 包 | 版本 | License | 覆盖方式 | 状态 |
|---|---|---|---|---|---|
| D-1 | `diff` | `^9.0.0`（实测 `9.0.0`） | **BSD-3-Clause** | ① 在 `UNIVERSAL_WHITELIST` 内 → `verify-licenses` 自动通过；② 已由 `THIRD_PARTY_NOTICES.md` 的既有第三方段落覆盖（无需新增署名——本项目**不 vendor** 该包，只是声明 npm 依赖） | ✅ 已验证（P1-T9：`violations` 为空；`npm view diff@^9.0.0 license` = BSD-3-Clause） |

## 4. 结项核对表

> 退出标准 (b)(c)(g) 的判定表。**不允许空行**。

| # | 核对项 | 判定命令 / 证据 | 结果 |
|---|---|---|---|
| K-1 | `verify-licenses` 退出 0 | `scripts/verify-licenses.sh` | ✅ 退出 0（`PASS: checked=52 · violations=0 · skipped(lockfile-only, not installed)=43`；2026-09-11） |
| K-2 | vendor 包**被检查**（非漏检） | `scripts/verify-licenses.sh --json` 的 `checked` 计数较接入前 **+1**（`checked` 是计数不是名单；repo 内包不进 lockfile `packages:` 段，故不会出现在 `skippedNames`——计数差是可复核证据） | ✅ 实测 **51 → 52（+1）**。接入前 = 在 `89c0ef7` 建临时 `git worktree` + 软链本仓库 `node_modules`，`node .../verify-licenses.mjs --json --root <worktree>` → `checked:51`；接入后本树 → `checked:52`（两侧 `pass:true`） |
| K-3 | `diff@9.0.0` 被判 BSD-3-Clause 通过 | 同上；`violations` 为空 | ✅ `violations: []`；`npm view diff@^9.0.0 version license` → `9.0.0` / `BSD-3-Clause`（在 `UNIVERSAL_WHITELIST` 内） |
| K-4 | NOTICES 含**来源**条目 | `THIRD_PARTY_NOTICES.md` 含 `hashline-core` + repo + tag + commit + License + 落点 | ✅ `THIRD_PARTY_NOTICES.md` L18–L29：小节标题含 `@oh-my-opencode/hashline-core`（OMO v4.19.4）、`Source repository`、`Tag: v4.19.4`、`Commit: b072d279…`、`Upstream path`、`License: SUL-1.0`、`Vendored into … patches/omo-dsh/vendor/hashline-core` |
| K-5 | NOTICES **逐文件**列出（D15 第 2 条） | §3.2.1 的 **29 行**全部出现在 NOTICES，每行含文件名 + 处置 | ✅ 29 行齐备：`grep -c` 处置列 = `verbatim` **23** / `已修改` **3** / `包外复制` **1** / `本项目新增` **2**；NOTICES 声明 "**29 files** total"，与 `files[]` 29 条对齐 |
| K-6 | "已修改"声明四处齐备 | N-1（`NOTICE.md`）+ N-2（manifest `deviations[]`）+ N-3（NOTICES）+ N-4（许可原文未改） | ✅ 四处齐备：`NOTICE.md` 含 "**This copy has been MODIFIED.**"；manifest `deviations[]` 6 条；NOTICES L31–L40 "MODIFIED COPY" 醒目块；`LICENSES/oh-my-openagent.LICENSE.md` 未改（sha256 见 K-9） |
| K-7 | 偏离数与 manifest 一致 | NOTICES 标 `已修改` = `class: "modification"` = **3**；标 `包外复制` = `class: "copied-in"` = **1**；标 `本项目新增` = `class: "addition"` = **2** | ✅ `files[]` = 29 条（`verbatim:23 / modified:3 / copied-in:1 / project-new:2`）；`deviations[]` = **6** 条（`modification:3 / copied-in:1 / addition:2`）——与 NOTICES 非 verbatim 行一一对应 |
| K-8 | 既有署名**零改动**（只增不改） | `git diff THIRD_PARTY_NOTICES.md` 无删除行、无修改行 | ✅ `git diff --numstat 89c0ef7 HEAD -- THIRD_PARTY_NOTICES.md` → `66  0`（66 插入 / **0 删除**）；diff 中无 `-` 行 |
| K-9 | 许可原文字节一致 | §1 两条 sha256 相等 | ✅ **已通过**（2026-09-11 复跑：上游 `git show v4.19.4:LICENSE.md \| sha256sum` 与本仓库副本同为 `b61ac928f152d13517328263e6bee9175b928f9ab696a2d2ca2b6cfd961ddc32`） |
| K-10 | 非商业边界未被突破 | 新增文案无"可商用/授权商用/SaaS"含义（D8） | ✅ 新增文案只有否定式表述：`NOTICE.md` "makes no implication of any commercial license or commercial-use right"；NOTICES L16 "no commercial distribution is authorized"、L39–L40 "No commercial use or distribution is authorized" |
| K-11 | 未向 OMO 提交任何内容（D5） | 无 fork/PR/branch push | ✅ `git remote -v` 只有本项目 `origin`（`linletian/oh-my-opendsh`），无 OMO remote/fork；Phase 1 全部提交只落在本仓库 `feature/phase1-dev` |

## 5. `license` 字段缺失的处置（D15 第 1 条）

`@oh-my-opencode/hashline-core` 的 `package.json` **没有 `license` 字段**——这不是笔误，OMO 的 19 个 core 包**全部**如此。对本阶段有两个后果：

1. **`verify-licenses` 会 FAIL**：`scripts/verify-licenses.mjs` 对缺失 license 的包报 `MISSING` 并计入 `violations`。因此 vendor 副本**显式补 `"license": "SUL-1.0"`** 是退出标准 (b) 的**必要条件**，不是可选项。但它**不充分**：检查器的名称门（`SUL_ALLOWED_NAME`，整词 `omo` 或 `oh-my-openagent`）不匹配 `@oh-my-opencode/*`（评审实测 `tokenAllowed('SUL-1.0', '@oh-my-opencode/hashline-core') === false`），只补字段仍会被判 violation——名称门扩展已由 **D16**（2026-09-11 第八批）决策授权，随 P1-T9 落地。
2. **这不是"自我授权"**：补写的值不是凭空选择，而是**记录该文件实际适用的许可**——同一 OMO 提交内的仓库根 `LICENSE.md` 就是 SUL-1.0（§1 已逐字节校验）。这一处置已在计划书 R-4 中定性为"保守且诚实"。

> ✅ **已固化（本次）**：该问题对后续 **18 个 core 包**会**逐一同现**，故已当即写入决策记录 **D15 第 1 条**（中英双语），不再等到 Phase 1 收尾。后续包直接按 D15 处置，不重走"要不要补 license 字段"的判定。任务清单 **P1-T13** 相应标记为已完成。名称门扩展见 **D16** / 任务清单 **P1-T14**（同样已完成登记）。

## 6. 边界（明确不做）

| # | 不做 | 理由 |
|---|---|---|
| X-1 | 不改 `scripts/verify-licenses.mjs` 的允许清单来"让 vendor 通过" | ROADMAP §3 约束 4 + **D15 第 1 条**：上游 License 变更触发 fail 时**不得绕过**。若真需要扩白名单，那是**决策**（如 D12 的先例），不是本阶段的技术动作——名称门扩展已按此路径落为 **D16** |
| X-2 | 不翻译 / 不改写 `LICENSES/oh-my-openagent.LICENSE.md` | L-2 + ROADMAP §3 约束 1（"原文随包"） |
| X-3 | 不移除 / 不"优化" `THIRD_PARTY_NOTICES.md` 既有条目 | ROADMAP §3 约束 3（"永不移除署名"） |
| X-4 | 不为 vendor 包写自动署名校验脚本 | 计划书 §4.6.2：vendor 包数量 ≥ 3 时再决定是否脚本化 |
| X-5 | 不在 vendor 源码文件头插入修改注释 | §3.3 + **D15 第 3 条**：会摧毁 verbatim 一致性 |
| X-6 | 不因 NOTICES 逐文件列表变长而省略条目 | **D15 第 2 条**：逐文件是硬要求；篇幅问题由包级 `NOTICE.md` 分流，不由删条目解决 |
