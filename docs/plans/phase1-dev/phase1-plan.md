# Phase 1 开发计划：core 源码 vendor 验证

> **本目录**：[`docs/plans/phase1-dev/`](./) —— ROADMAP **Phase 1**（core 源码 vendor 验证，修正后的 O1）的实施计划。
>
> **上游依据**：[ROADMAP（中文）](../../roadmap_zh-CN.md) §4 Phase 1 · [决策 D14](../../decisions_zh-CN.md) · [决策 **D15**（vendor 合规细则）](../../decisions_zh-CN.md) · [决策 **D16**（verify-licenses 名称门扩展）](../../decisions_zh-CN.md) · [可行性报告 §16.2](../../feasibility-report_zh-CN.md)
>
> **配套文档**：[任务清单](./phase1-tasks.md) · [License 与署名清单](./phase1-license-attribution.md) · [vendoring playbook](./vendoring-playbook.md)
>
> **状态**：✅ **已实施并结项（2026-09-11）**。范围 = 计划内容；逐任务证据与退出标准核对见[任务清单](./phase1-tasks.md)（14/14 完成）。实施期实测对本文的回填见 §3.1 与 §4.3（辅助文件实为 5 行）、§4.6.2（manifest 模板与落地一致）、§5（a–g 实测）、§6（Q-1/Q-2/Q-3 结论）。

---

## 1. 目标

**在最小有用面上端到端打通 git-vendor 引进路径。**

Phase 1 不解决工程问题，也不消费 vendor 代码——它要证明的是**引进机制本身**可行、可复现、可署名、可过 CI。ROADMAP §7 对此的定性：vendor 验证是"新增但很小的一步，为后续每个阶段去风险"。

因此本阶段的成功标志不是"hashline 能用"，而是：**下一个阶段（Phase 2 起，任何需要 OMO core 源码的阶段）可以照抄一次操作，把第二个 core 包搬进来，且不产生新的决策成本。**

## 2. 上游依据与不可协商约束

本阶段受 ROADMAP §2（上游版本政策）与 §3（不可协商约束）同等约束。落到操作层面：

| 约束 | 来源 | 本阶段的具体含义 |
|---|---|---|
| **冻结基线 = OMO v4.19.4** | ROADMAP §2 规则 3 / D14 | tag 选择已定：**v4.19.4**。v5.0.0 正式版**未发布**（2026-09-11 实测 npm `latest`=4.19.4、`beta`=5.0.0-beta.53），故不适用"v5.0.0 正式版已发布则用它"分支。选择已闭合，实施时只需**复核**（§6 风险 R-2）——2026-09-11 复核：`latest` 仍为 `4.19.4`，tag 保持 v4.19.4 |
| **不追 beta** | ROADMAP §2 规则 2 | 不 vendor `5.0.0-beta.*` 的任何内容；`compat-probe` 哨兵仍只盯 DSH |
| **每个 vendor 文件的 SUL-1.0 合规** | ROADMAP §3 约束 1 + **D15** | ① `LICENSES/oh-my-openagent.LICENSE.md` 与上游 v4.19.4 的 `LICENSE.md` **已实测逐字节一致**（sha256 `b61ac928…ddc32`，2026-09-11——原本的 R-6 风险就此关闭）；② **署名按 D14 第 3 条字面执行 → 逐文件列出**（D15 第 2 条），见[署名清单](./phase1-license-attribution.md) §3.2.1 的 29 行覆盖表；③ 必须携带 SUL-1.0 要求的**醒目"已修改"声明**，落点在包级文件（D15 第 3 条），见署名清单 §3.3 |
| **非商业** | ROADMAP §3 约束 2 / D8 | 无新增动作，但署名文案不得暗示商用授权 |
| **不给 OMO 提 PR；永不移除署名** | ROADMAP §3 约束 3 / D5 | 本阶段不向上游提交任何内容；`THIRD_PARTY_NOTICES.md` 既有条目只增不改 |
| **`verify-licenses` 必须常绿，不得绕过** | ROADMAP §3 约束 4 + **D15 第 1 条** + **D16** | 若上游 License 导致 fail，**停在计划外并升级为决策**，不得改白名单绕过。"补 `license` 字段"是被 D15 明确允许的**记录实际许可**，不是绕过。名称门（`SUL_ALLOWED_NAME`）不匹配 `@oh-my-opencode/*` 的问题已由 **D16** 决策授权扩展（评审发现的白名单类变更，按 D12 先例走决策，非绕过） |
| **移植语义取自 harness-neutral core 层** | ROADMAP §3 约束 5 | 选型理由：`hashline-core` 是 core 层且自包含（§3.2） |

## 3. 选型：为什么是 `hashline-core`

ROADMAP 给出的候选即 `hashline-core`（"自包含、无 harness 依赖"）。本次调研在 v4.19.4 tag 上逐项验证了这个判断：

### 3.1 事实基线（均在本地 OMO 仓库 `v4.19.4` tag 上实测）

| 项 | 实测结果 |
|---|---|
| tag 提交 | `v4.19.4` → `b072d279110bdda2c6ac2525d0d24dc54d16148a`（2026-09-11 实施时复核**一致**，R-2 关闭） |
| 包名 / 版本 | `@oh-my-opencode/hashline-core` @ `0.1.0`，`private: true`（印证 D14：从未上 npm） |
| 源码规模 | 包内共 **26 个文件**（`AGENTS.md`、`package.json`、`tsconfig.json` + `src/` 下 **23** 个：**17** 源码 `.ts` + **6** 测试 `.test.ts`），约 2.5k 行 |
| 运行时外部依赖 | **1 个**：`diff@^9.0.0`——仅 `diff-utils.ts` 的 `createTwoFilesPatch` 使用。其余全部自包含 |
| harness 依赖 | **0 个**。无 opencode / cordis / DSH 引用，无 `@oh-my-opencode/*` 跨包 import |
| 测试框架 | `bun test`（**6** 个 `*.test.ts`，全部位于 `src/`，`bun:test` import） |
| 运行时假设 | `xxhash32.ts` 在**调用时**经 `globalThis` 探测 `Bun.hash.xxHash32`，缺失则回退纯 JS 实现——**Node 24 下不需要 bun 运行时**（这是它"harness-neutral"的实证，不是推断） |
| 跨包测试耦合 | **1 处**：`src/normalize-edits.test.ts` import `../../../test-support/unsafe-test-value`（OMO 仓库根下的 5 行类型辅助函数，**不在包内**；计划稿曾写"4 行"，P1-T11 实测更正） |
| 上游 License 声明 | ⚠️ **该包 `package.json` 无 `license` 字段**（OMO 19 个 core 包一致）；许可来自仓库根 `LICENSE.md`（SUL-1.0）。**这是本阶段最重要的发现**，处置见 §4.4 与 R-4 |
| v5 beta 对比 | `git diff v4.19.4 v5.0.0-beta.53 -- packages/hashline-core` = **空**（两版逐字节相同，印证 D14 的"低赌注"判断） |

### 3.2 对比其余候选

| 候选 | 否决理由 |
|---|---|
| `rules-engine` / `prompts-core` | 面向 prompt/hook 语义，Phase 3–4 才需要；且体量与耦合面更大 |
| `utils` / `model-core` | 被大量包依赖，vendor 单包等于 vendor 一棵树——不适合"最小有用面" |
| `team-core` / `delegate-core` | Phase 5 目标，且强依赖 OMO 运行时形状，此刻 vendor 无法独立验证 |
| `hashline-core` | ✅ 唯一同时满足：自包含、单一外部依赖、无 harness 依赖、被后续 Phase 6 明确需要（编辑模型 A/B 判定的候选方） |

**结论**：选 `hashline-core`。它在 Phase 6 有明确的下游用途（`hashline` vs DSH `str-replace-editor` 的 A/B 裁定），因此不是纯练习——但 Phase 1 **只做引进，不接线**（ROADMAP：preset 尚未消费 vendor 代码）。

## 4. 方案设计

### 4.1 目标目录形态

vendor 落在 ROADMAP 指定的 `patches/omo-dsh/vendor/`，作为 **pnpm workspace 包**（而非散装文件），原因：只有成为 workspace 包，才能被 `pnpm install` 解析、被 vitest 发现、被 `verify-licenses` 的 `walkRepoPackageFiles` 扫到 license 字段（这是退出标准 b 的直接依赖）。

```
patches/omo-dsh/vendor/
└── hashline-core/
    ├── AGENTS.md             # 原样
    ├── NOTICE.md             # 本项目新增：SUL-1.0 要求的醒目"已修改"声明（见 4.6.1 / D15.3）
    ├── package.json          # vendor 化改动（见 4.4）
    ├── tsconfig.json         # vendor 化改动（见 4.5）
    ├── VENDOR-MANIFEST.json  # 本项目新增：来源 tag/commit + 逐文件 sha256 + 偏离记录
    └── src/                  # 23 个 .ts：17 源码 + 6 测试（测试留在 src/ 以保持逐字节一致）
        ├── …                 # 除下列两处外全部原样
        ├── normalize-edits.test.ts   # 唯一例外：1 行 import 改写（见 S-2）
        └── test-support/
            └── unsafe-test-value.ts  # 从上游包外路径复制进来（见 S-2）
```

上游 26 个文件里：**23 个 verbatim**（`AGENTS.md` + 17 个源码 `.ts` + **5** 个未改动的测试文件）＝ `files[].origin === "verbatim"`；**3 个被改动**（`package.json`、`tsconfig.json`、`src/normalize-edits.test.ts`）＝ `origin === "modified"`；**1 个自包外复制进来**（`src/test-support/unsafe-test-value.ts`）＝ `origin === "copied-in"`，它在上游的同名文件位于包外，故不计入 26。包根另有 **2 个本项目新增文件**（`NOTICE.md`、`VENDOR-MANIFEST.json`）。vendor 目录合计 **29 个文件**。

**"偏离"的准确含义（本文档全篇统一此定义）**：`deviations[]` = 与上游包内容不同的全部位置，按 `class` 分三类，与 NOTICES 的非 verbatim 处置**一一对应**：`class: "modification"` = **3**（被改动的上游文件）＝ NOTICES 标"已修改"的行；`class: "copied-in"` = **1**（包外复制件）＝ NOTICES 标"包外复制"的行；`class: "addition"` = **2**（包根新增文件）＝ NOTICES 标"本项目新增"的行。**合计 6 条**。逐文件清单见[署名清单](./phase1-license-attribution.md) §3.2.1（29 行）。

**为什么把测试留在 `src/`**：上游就是 `src/*.test.ts`。把它们移到 `tests/` 会让 26 个文件中的 6 个偏离上游，直接削弱"这个包是什么、改了什么"的可审计性，也让后续定向搬运（ROADMAP §2 规则 4）需要 diff 两次。保持原位 + 在 `vitest.config.ts` 里做 `include`/`alias`，代价更小。

### 4.2 工具链接入（四个必须改动的接入点）

| 接入点 | 现状 | 为什么必须改 |
|---|---|---|
| `pnpm-workspace.yaml` | `packages: [patches/omo-dsh/*]` | 该 glob 匹配 `patches/omo-dsh/vendor` 这个**目录本身**，**不**递归匹配其中的包。必须追加 `patches/omo-dsh/vendor/*`，否则 CI 的 `pnpm install --frozen-lockfile` 与本地不一致 → 退出标准 a 直接失败 |
| `vitest.config.ts` | `{ environment: 'node' }` | 需要 `include` 覆盖 `patches/omo-dsh/vendor/**/*.test.ts`，并加 `bun:test` → `vitest` 的 alias。默认 include 其实已覆盖该路径，但**显式声明**是让"vendor 测试真的在跑"可被审查的前提（否则删掉测试也无人察觉） |
| `package.json` | 无相关 script | 加一个 vendor 专项 script（建议 `test:vendor`），让本阶段的门可**单独复跑**，不必每次跑全套 8 门 |
| 根 `tsconfig.json` | `include: ["patches", …]`，**无 exclude** | ⚠️ **评审发现的遗漏接入点**：门 1（`pnpm typecheck`）用**根**配置编译 `patches/**`，vendor 包自身 tsconfig 的 `exclude` 对门 1 **无效**——6 个 `bun:test` 测试文件会报 `TS2307`（已实测复现）。必须在根配置加 `exclude: ["patches/omo-dsh/vendor/**/*.test.ts"]`，否则退出标准 e 直接失败 |

### 4.3 需要 shim 的两处（本阶段唯一的"技术活"）

| # | 问题 | 方案 | 偏离性质 |
|---|---|---|---|
| S-1 | 6 个测试文件 `import { describe, it, expect } from "bun:test"` | `vitest.config.ts` 加 `resolve.alias: { 'bun:test': 'vitest' }`（vitest 导出同名 API）。**不改测试源码** | 环境适配，零源码改动 |
| S-2 | `normalize-edits.test.ts` import 包外的 `../../../test-support/unsafe-test-value` | 把该 5 行辅助函数随包 vendor 到 `src/test-support/unsafe-test-value.ts`，并把 import 改一行 | **1 行源码偏离**，必须记入 `VENDOR-MANIFEST.json` 与[署名清单](./phase1-license-attribution.md) |

> S-2 曾考虑用 vitest alias 指向仓库外的 OMO 检出——**否决**：那会让 CI 依赖 `~/GithubRepo/oh-my-openagent` 存在，CI 必然失败，且违反"vendor 的意义是自包含"。

### 4.4 `package.json` 的 vendor 化改动（含 License 字段发现）

| 字段 | 上游 | vendor 后 | 理由 |
|---|---|---|---|
| `name` | `@oh-my-opencode/hashline-core` | **不改** | 包名是漂移检测与定向搬运（D14 第 4 条）的溯源锚点，改名会破坏与上游的对照可读性。⚠️ 注意：`verify-licenses` 的 `SUL_ALLOWED_NAME`（整词 `omo` 或 `oh-my-openagent`）**并不匹配** `@oh-my-opencode/*`——评审实测 `tokenAllowed('SUL-1.0', '@oh-my-opencode/hashline-core') === false`。名称门扩展已由 **D16** 决策授权，随 P1-T9 落地 |
| `license` | **缺失** | **`"SUL-1.0"`** | ⚠️ **关键**：`scripts/verify-licenses.mjs` 对缺失 license 的包判 `MISSING` → **FAIL**。所以不补这一行，退出标准 b 不可能达成。补它同时也是**诚实**的：该代码的许可确实来自 OMO 根 `LICENSE.md`（SUL-1.0）。注意这是**必要但不充分**条件——还需 D16 的名称门扩展（见 `name` 行） |
| `private` | `true` | 保持 `true` | 非发布包；也与本项目"不做商业分发"一致 |
| `exports` / `types` | `./src/index.ts`、`./index.d.ts` | **不改** | `index.d.ts` 在上游就不存在（exports 只是给 bundler 看的形状）。本地 bundle 测试用的是显式路径 `./src/index.ts`，不走 exports 解析，故无害 |
| `scripts.test` | `bun test src/*.test.ts` | 加 `test:vitest`（保留原 `test`） | 不删除上游脚本，避免"vendor 后看不出原貌" |
| `dependencies.diff` | `^9.0.0` | **不改** | `diff@9.0.0` 实测存在、license = **BSD-3-Clause**（在 `UNIVERSAL_WHITELIST` 内） |

### 4.5 `tsconfig.json` 与 typecheck 门

上游 `tsconfig.json` 是 `lib: ["ESNext"]` + `types: ["bun-types"]`（OMO 根 devDependency 提供）。本仓库无 `bun-types`，且 `tsc` 无法解析 `bun:test`。

**推荐方案（A）**——本阶段采纳：

- vendor 包的 `tsconfig.json` 改为继承本仓库根配置：`lib: ["ES2022"]`、`types: ["node"]`、`include: ["src"]`、`exclude: ["src/**/*.test.ts"]`。
- ⚠️ **根 `tsconfig.json` 必须同步排除**（评审发现的遗漏接入点）：门 1 用根配置（`include: ["patches", …]`）编译，vendor 包自身的 `exclude` 对它**无效**——根编译会把 6 个 `bun:test` 测试文件报 `TS2307`（已实测复现）。根配置需加 `exclude: ["patches/omo-dsh/vendor/**/*.test.ts"]`。
- 该 tsconfig **只作文档/可复现性锚点**：root `tsconfig.json` 也已 `include: ["patches", …]`，vendor 的**非测试**源码会被 `pnpm typecheck`（门 1）连带检查。
- 测试文件**排除在 typecheck 之外**（根配置与包配置两层都排除），只在 vitest 下运行。

**为什么不让测试进 typecheck**：为 `.test.ts` 通过 `tsc`，必须引入 `bun-types` 依赖——为"验证 vendor"引入一个新的类型依赖，收益（类型检查上游测试）远低于代价（新依赖 + 新 license 面 + 潜在 DOM lib 污染），且 ROADMAP 的退出标准只要求"其测试在本项目 CI 里跑通"。

**被否决方案**：
- (B) 引入 `bun-types` devDependency，完整 typecheck 上游测试 → 代价见上，留作后续可选硬化。
- (C) vendor 树整体排除 typecheck → 更弱，且与本仓库"typecheck 是门 1"的既有力度不符。

> ⚠️ **诚实的代价**：方案 A 使 `pnpm typecheck:host` 对本改动**保持 vacuous PASS**（vendor 目录下无 `src/client`）。这不是新增的漏洞（该门对本仓库现状本来就是这样），但**不能把 typecheck 绿当作 vendor 正确的证据**——vendor 的正确性证据是 `test:vendor` 的门。

### 4.6 包根两个新增文件：`VENDOR-MANIFEST.json` 与 `NOTICE.md`

ROADMAP 退出标准 d 要求 playbook 记录"怎么复制、需要什么 shim"。仅靠散文无法复核，因此本阶段把可机器判定的那部分固化成清单文件；同时 D15 第 3 条要求 SUL-1.0 的"已修改"声明落在**包级文件**，故包根新增 `NOTICE.md`。两者都是纯声明/记录文件，不含上游代码。

#### 4.6.1 `NOTICE.md`（醒目"已修改"声明）

内容只需四行语义：① 本副本 vendored 自 OMO（repo + tag + commit）；② **本副本已被修改**；③ 修改清单见同目录 `VENDOR-MANIFEST.json`；④ 版权属原作者，本项目仅声明"已修改"，不重新署名。**不放**任何上游代码或本项目的许可声明（本仓库自身许可是 `MIT OR SUL-1.0`，见仓库根 `package.json`）。

#### 4.6.2 `VENDOR-MANIFEST.json`

```jsonc
{
  "upstream": {
    "repo": "https://github.com/code-yeongyu/oh-my-openagent",
    "tag": "v4.19.4",
    "commit": "b072d279110bdda2c6ac2525d0d24dc54d16148a",
    "path": "packages/hashline-core",
    "license": "SUL-1.0 (repository root LICENSE.md; the package manifest carries no license field)"
  },
  "vendoredAt": "2026-09-11",
  "files": [ { "path": "src/hash-computation.ts", "sha256": "…", "origin": "verbatim" }, … ],
  // files[] 共 29 条，origin 取值：verbatim(23) / modified(3) / copied-in(1，位于 src/test-support/) / project-new(2，包根 NOTICE.md 与本文件)
  // deviations = 与上游包内容不同的全部位置，共 6 条；class 与 NOTICES 的非 verbatim 处置一一对应：
  //   class "modification" = 3（被改动的上游文件）   = NOTICES 标 "已修改" 的行
  //   class "copied-in"    = 1（包外复制件）         = NOTICES 标 "包外复制" 的行
  //   class "addition"     = 2（包根新增文件）       = NOTICES 标 "本项目新增" 的行
  "deviations": [
    { "class": "modification", "path": "package.json", "kind": "fields-added", "field": "license", "value": "SUL-1.0", "decision": "D15.1", "additionalField": "scripts.test:vitest", "additionalValue": "pnpm -w exec vitest run patches/omo-dsh/vendor/hashline-core", "why": "two additions in one entry: license=SUL-1.0 because verify-licenses scores a missing field as MISSING/FAIL (upstream permission comes from the repository-root LICENSE.md, D15.1), and a test:vitest script so the vendored tests run under this repo's toolchain while the upstream bun `test` script is retained" },
    { "class": "modification", "path": "tsconfig.json", "kind": "rewritten", "why": "no bun-types in this repo; upstream lib/types replaced with the repo-root ES2022 + node shape, test files excluded" },
    { "class": "modification", "path": "src/normalize-edits.test.ts", "kind": "one-line-import-rewrite", "why": "upstream imports ../../../test-support/unsafe-test-value from outside the package; the helper is vendored into src/test-support/ instead" },
    { "class": "copied-in", "path": "src/test-support/unsafe-test-value.ts", "kind": "copied-from-outside-package", "upstreamPath": "test-support/unsafe-test-value.ts", "why": "the 5-line type helper the modified test above now imports; content is verbatim, but it is not one of the package's 26 upstream files, so it is tracked as its own class rather than as a vendored file" },
    { "class": "addition", "path": "NOTICE.md", "kind": "project-notice", "decision": "D15.3", "why": "SUL-1.0 'Notices' requires a prominent notice in modified copies; this is the package-level notice" },
    { "class": "addition", "path": "VENDOR-MANIFEST.json", "kind": "project-record", "why": "this file: provenance + per-file sha256 + the deviation list" }
  ]
}
```

**三个用途**：
1. **漂移检测**（Phase 7 / 后续定向搬运）：对 `files[].origin === "verbatim"` 的条目重算 sha256，任何不一致都说明有人手改了 vendor 源码。
2. **playbook 的可执行化**：playbook 的步骤 = 生成/复核这个文件的步骤；下一个 core 包照抄。
3. **SUL-1.0 修改声明**（D15 第 3 条）：`deviations[]` 是"本副本已被修改"的**机器可读**声明，与包根 `NOTICE.md`、`THIRD_PARTY_NOTICES.md` 条目互相印证。

> ⚠️ **manifest 不替代 NOTICES 的署名**（D15 第 2 条）：`THIRD_PARTY_NOTICES.md` 仍须**逐文件**列出（见[署名清单](./phase1-license-attribution.md) §3.2.1）。**计数一致性（必须对得上）**：NOTICES **29 行** = `files[]` **29 条** = 23 verbatim + 3 已修改 + 1 包外复制 + 2 本项目新增；`deviations[]` **6 条** = modification 3 + copied-in 1 + addition 2，与 NOTICES 的非 verbatim 行一一对应。

> **不做的事**：本阶段**不**写自动校验脚本（那会在 CI 里加一个只为 1 个包服务的门）。清单先作为人工复核的锚点；当 vendor 包数量 ≥ 3 时再决定是否脚本化——此判断记录于[任务清单](./phase1-tasks.md) P1-T8 的"超出范围"备注。

## 5. 退出标准与证据

ROADMAP §4 Phase 1 给出 4 条退出标准。逐条落到**可执行的证据**：

| # | ROADMAP 原文 | 证据（本计划的关键判定） |
|---|---|---|
| **a** | vendor 包能构建、其测试在本项目 CI 里跑通 | ① `pnpm install`（含新 workspace 行与 `diff@9`）后 lockfile 与 CI `--frozen-lockfile` 一致；② `vitest` 下 `hashline-core` 的 **6 个测试文件全绿**，**且测试数量非零**（防"测试没被收集"的假绿）；③ `.github/workflows/ci.yml` 与 `scripts/ci-local.sh` 的**门链同步**（两处 byte-equivalent 是该仓库既有硬约束） |
| **b** | `verify-licenses` 绿 | `scripts/verify-licenses.sh` 退出 0，且 `--json` 的 `checked` 计数较接入前 **+1**（`checked` 是计数不是名单；repo 内包不进 lockfile `packages:` 段，故也不会出现在 `skippedNames`——计数差是"被检查而非漏检"的可复核证据）。这依赖 §4.4 补上 `license` 字段 **且 D16 的名称门扩展已落地**（P1-T9） |
| **c** | `THIRD_PARTY_NOTICES.md` 列出该 vendor 包 | 该文件出现 `hashline-core` 条目，含 tag、commit、路径、License 指向、偏离摘要；[署名清单](./phase1-license-attribution.md) 的核对表全绿 |
| **d** | 一份简短 "vendoring playbook" 记录操作要点 | [`vendoring-playbook.md`](./vendoring-playbook.md) 完成，且其步骤**已被 Phase 1 自身走过一遍**（不是凭想象写的），含 S-1/S-2 两个 shim 的实录 |

**DoD（Definition of Done）补充**——本阶段额外要求（ROADMAP 未明说但由仓库规则推出）：

- **e**：`scripts/ci-local.sh` 全 8 门绿（本阶段不得让任何既有门变红）。
- **f**：本计划目录的 4 份文档与实测结果**无冲突**——凡实测推翻计划假设处，改文档而不是改结论。
- **g**：未修改 `THIRD_PARTY_NOTICES.md` 既有任何条目，未移除任何署名。

> ✅ **结项实测（2026-09-11，P1-T12）**：a–g 全部有可复核证据，逐条命令与输出见[任务清单](./phase1-tasks.md) 的"退出标准核对表"。关键值：`pnpm install --frozen-lockfile` 退出 0；`pnpm test:vendor` 6 文件 **78 tests** 全绿；门 2 `pnpm vitest run` 15 文件 **187 tests** 全绿且 `.github/workflows/ci.yml` / `scripts/ci-local.sh` **零改动**（门序列仍 byte-equivalent）；`scripts/verify-licenses.sh --json` → `{"pass":true,"violations":[],"checked":52}`（接入前相同方法测得 `checked:51`）；NOTICES **29 行**（23 verbatim / 3 已修改 / 1 包外复制 / 2 本项目新增）与 manifest `files[]`/`deviations[]` 对齐；`scripts/ci-local.sh` **8/8 绿**；`node scripts/check-docs-consistency.mjs` **8/8 PASS**。

**明确不属于退出标准**（避免范围蔓延）：

- ❌ hashline 被 preset / concerto 消费或注册为工具（ROADMAP 明示"不在范围"）
- ❌ 编辑模型 A/B 裁定（Phase 6）
- ❌ vendor 树纳入 `doctor-lite` / `verify-concerto-static` / `run-proofs` 的检查面
- ❌ 自动化的漂移校验脚本（见 §4.6.2）

## 6. 风险与开放问题

| # | 风险 / 问题 | 影响 | 处置 |
|---|---|---|---|
| **R-1** | **CI 的 `pnpm install --frozen-lockfile` 因新增 workspace 包而失败** | 高（直接堵死退出标准 a） | 计划已识别唯一成因：`pnpm-workspace.yaml` 的 `patches/omo-dsh/*` **不递归**。实施时先补 `patches/omo-dsh/vendor/*` 再 `pnpm install`，并**必须**提交更新后的 `pnpm-lock.yaml`（CI 不会自己补）。✅ **实施结果（2026-09-11）**：按此处置，`pnpm install --frozen-lockfile` 退出 0（`Already up to date`）。 |
| **R-2** | 上游 v4.19.4 tag 被移动 / 本地检出与 tag 不一致 | 中（可复现性） | `VENDOR-MANIFEST.json` 记录 40 位 commit 而非仅 tag；实施时用 `git rev-parse v4.19.4^{commit}` 复核（本次实测为 `b072d279…`）。**注意**：本地检出 `~/GithubRepo/oh-my-openagent` 当前 HEAD 不在该 tag 上（有未提交的 `.omo/evidence` 改动），必须用 `git show v4.19.4:<path>` 取文件，**不得**从工作树复制。✅ **实施结果（2026-09-11）**：复核 commit 未变（`b072d279110bdda2c6ac2525d0d24dc54d16148a`），导入走 tag 内容。 |
| **R-3** | `diff@9.0.0` 引入失败（`minimumReleaseAge` 策略 / 网络） | 中 | 实测 registry 可达且 `diff@9.0.0` 存在、BSD-3-Clause。若 `pnpm` 因发布年龄策略拒绝，按 `pnpm-workspace.yaml` 既有 `minimumReleaseAgeExclude` 惯例，**单独登记该包**并在任务清单留痕。✅ **实施结果（2026-09-11）**：**未触发**——`diff@9.0.0` 未被拒，`minimumReleaseAgeExclude` 未新增条目。 |
| **R-4** | ⚠️ **上游 core 包无 `license` 字段** | **高（合规判定）** | ✅ **已升级为决策 D15 第 1 条**（2026-09-11，中英双语已落）。事实：19 个 core 包 `package.json` 均无 `license`；许可仅由 OMO 仓库根 `LICENSE.md`（SUL-1.0）承载。处置：vendor 副本**显式补 `"license": "SUL-1.0"`**——不是"我授予自己许可"，而是**记录该文件实际适用的许可**，且是 `verify-licenses` 通过的必要条件（§4.4）。D15 的另外两条同时解决了计划阶段发现的另两个同源问题：署名粒度（第 2 条 → 逐文件）与 SUL-1.0"已修改"声明（第 3 条 → 包级 `NOTICE.md`）。**后续 18 个包按 D15 直接处置，不再重判。** 评审又发现名称门问题（补字段必要但不充分：`SUL_ALLOWED_NAME` 不匹配 `@oh-my-opencode/*`）→ 已固化为 **D16**（2026-09-11 第八批，扩展经决策授权）。 |
| **R-5** | vendor 测试被静默地"不收集"（假绿） | 中 | 退出标准 a 的证据②要求**断言测试数量非零**。实施时以 vitest 输出的 collected 文件数对照上游 6 个 `*.test.ts`。✅ **实施结果（2026-09-11）**：收集 **6 文件 / 78 tests**（非零），无假绿。 |
| **R-6** | ~~`LICENSES/oh-my-openagent.LICENSE.md` 与本仓库不符~~ | ~~中~~ → **已关闭** | ✅ **已在计划阶段实测关闭**：`LICENSES/oh-my-openagent.LICENSE.md` 与上游 v4.19.4 `LICENSE.md` **逐字节相同**（两侧 sha256 均为 `b61ac928…ddc32`）。结项时（P1-T9）重跑一次即可——上游许可可能变，这一步在**每次** vendor 时都要做。✅ **结项重跑（2026-09-11）**：两侧仍为 `b61ac928f152d13517328263e6bee9175b928f9ab696a2d2ca2b6cfd961ddc32`，**一致**。 |
| **R-7** | 本阶段产出被误解为"hashline 已接入项目" | 低（沟通） | README / CHANGELOG 的措辞必须写明"已 vendor、未消费"；ROADMAP 已把"preset 尚未消费 vendor 代码"列为不在范围 |
| **R-8** | 方案 A 让 typecheck 门不覆盖 vendor 测试 | 低 | §4.5 已显式记录代价；不把门 1 绿当作 vendor 证据。后续如需硬化，方案 B 是现成路径。✅ **实施结果（2026-09-11）**：`tsc --listFiles` 实测 vendor **18 个非测试源码**在根编译程序内、**0 个测试**；vendor 正确性证据取自 `test:vendor`（78/78）。 |

### 开放问题（需在实施中回答，不阻塞启动）

| # | 问题 | 何时回答 | 实测结论（2026-09-11，实施期） |
|---|---|---|---|
| Q-1 | vitest `resolve.alias` 对 `bun:test` 是否够用，还是需要自定义 resolver plugin？（受 vitest 4 解析行为影响） | P1-T5 首次跑 `test:vendor` 时 | ✅ **alias 足够**。vitest **4.1.11** 下 `resolve.alias: { 'bun:test': 'vitest' }` 即可，**未**使用自定义 resolver plugin；6 个 `bun:test` 测试文件**零源码改动**全绿。 |
| Q-2 | 上游 6 个测试文件在 vitest 下是否有**行为差异**导致的失败（bun 与 vitest 在 `expect` 语义、快照、`test.each` 上的细节差异）？ | 同上。若出现，逐个判定是"测试框架差异"（可 shim）还是"vendor 引入的真实缺陷"（升级为风险） | ✅ **无差异导致的失败**：`pnpm test:vendor` **78/78 一次通过**（6 文件），未触发"框架差异 vs 真实缺陷"分流。该分流标准保留给下一个包。 |
| Q-3 | `diff@9.0.0` 的 `createTwoFilesPatch` 在 Node 24 + ESM 下的行为是否与 bun 下一致（影响 `diff-utils.test.ts`）？ | 同上 | ✅ **行为一致**：`src/diff-utils.test.ts` **9 tests 全绿**（Node 24.19 / ESM / `diff@9.0.0`），无 bun/Node 差异。 |

## 7. 工作包与估算

按 ROADMAP §7 的定性（"新增但很小的一步"），本阶段**不做 buffer、不做承诺**，仅给工作量级：

| 工作包 | 内容 | 任务 | 量级 |
|---|---|---|---|
| **WP-1 引进** | 取文件、shim、manifest | P1-T1 … P1-T4 | ~0.5 天 |
| **WP-2 接入** | workspace / vitest / 门链 | P1-T5 … P1-T7 | ~0.5 天 |
| **WP-3 署名与合规** | NOTICES、LICENSE 校验、README/CHANGELOG | P1-T8 … P1-T10 | ~0.5 天 |
| **WP-4 收口** | playbook 实测回填、退出标准核对、决策登记 | P1-T11 … P1-T13 | ~0.5 天 |

**合计 ≈ 2 人日**（不含不可预见的 Q-1/Q-2/Q-3 返工）。真正的价值不在工期，而在 WP-4 的[playbook](./vendoring-playbook.md)——它把本条路径的成本从"一次调研"降到"一次照抄"。

## 8. 交付物清单

| 交付物 | 路径 | 类型 |
|---|---|---|
| vendor 包 | `patches/omo-dsh/vendor/hashline-core/`（含 `NOTICE.md`、`VENDOR-MANIFEST.json`） | 代码 |
| 接入改动 | `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `vitest.config.ts` / `package.json` / **根 `tsconfig.json`**（排除 vendor 测试，§4.2）/ `.github/workflows/ci.yml` / `scripts/ci-local.sh` / **`scripts/verify-licenses.mjs`**（D16 授权的名称门扩展，P1-T9） | 配置 |
| 署名与合规 | `THIRD_PARTY_NOTICES.md`（29 行逐文件覆盖）+ `NOTICE.md`（包级修改声明）；`LICENSES/oh-my-openagent.LICENSE.md` 校验已通过 | 合规 |
| 决策 | `docs/decisions.md` + `docs/decisions_zh-CN.md` 的 **D15 与 D16**（均已落） | 决策 |
| 说明 | `README.md` / `README_zh-CN.md`（如涉及）· `CHANGELOG.md` | 文档 |
| **本计划目录** | `docs/plans/phase1-dev/phase1-plan.md`（本文）· [`phase1-tasks.md`](./phase1-tasks.md) · [`phase1-license-attribution.md`](./phase1-license-attribution.md) · [`vendoring-playbook.md`](./vendoring-playbook.md) | 文档 |

## 9. 与后续阶段的关系

- **Phase 6**：`hashline` vs DSH `str-replace-editor` 的编辑模型 A/B 判定**消费**本阶段的产物（ROADMAP §4 Phase 6 / 可行性报告 §8）。Phase 1 的 vendor 形态（workspace 包 + `./src/index.ts` 导出）应让 Phase 6 能直接 `import` 而无需二次搬运。
- **Phase 2–5**：各自需要 core 包时，**按 [playbook](./vendoring-playbook.md) 照抄**，不再重新决策 tag 策略、目录形态、manifest 形状、License 处置（R-4 已固化）。
- **Phase 7**：漂移检测进入发布节奏（ROADMAP §2 认知惯例：每个 release 节点读一次上游 CHANGELOG）；`VENDOR-MANIFEST.json` 是那时可脚本化的输入。
