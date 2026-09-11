# oh-my-opendsh 项目决策记录

> 中文翻译；主文档（英文）见 [Decision Record (English)](./decisions.md)。
>
> 本文档是本项目**唯一的项目级决策记录处**。可行性调研文档（[英文](./feasibility-report.md) / [中文](./feasibility-report_zh-CN.md)）是决策的**调研依据**；本文各项决策以编号引用其章节。

## 文档分工

| 文档 | 角色 |
|---|---|
| `docs/feasibility-report.md`（及中文版） | **调研与依据**：可行性分析、证据（`file:line` 引用）、开放维度的选项分析（§10） |
| 本文档（及中文版） | **决策记录**：已确认决策（D#）、风险处置（R#）、开放维度状态跟踪（O#） |

- 决策变更（新决策 / 推翻旧决策）→ 在此登记，注明日期与依据
- 决策背后的调研细节 → 查可行性报告对应章节，本文不重复

## 编号约定

- **D#**（D1–D16）：已确认决策
- **R#**（R1–R6）：风险处置决策（接受现状 / 暂不处理）
- **O#**（O1–O8）：开放维度（其中 O1 / O2 / O4 / O6 / O7 / O8 已转为决策）
- 引用格式：`决策文档 D7` / `decisions.md D7`

## 已确认决策

### 2026-08-16（第一批，6 项）

| # | 决策 | 依据（调研报告章节） |
|---|---|---|
| D1 | 物理形态：独立 `oh-my-opendsh/` 仓库 | §4.3 |
| D2 | OMO 引入方式：DSH 官方 scratch plugin 模式（`dsh --patch` overlay） | Summary 结论 2；§4.3 |
| D3 | LLM 范围：全做 + 分期 + 优先社区复用 | §2.4 |
| D4 | 可视化：方案 B（web ChatNode via `ConversationNodeDefinition`） | §2.5 |
| D5 | OMO PR：不给外部 PR；遵守 License 规范 + 致谢 | §11.5 |
| D6 | 升级方式：方案 B（dual license + 直接 import OMO 源码）——*import 机制由 D14 修正：npm import → git vendor；基线冻结 v4.19.4* | §7.3 / §7.4 |

### 2026-08-19（第二批，4 项）

| # | 决策 | 依据 |
|---|---|---|
| D7 | DSH pin 策略：pin minor（`0.1.x`） | §10.2；§12.7 |
| D8 | 商业边界：不做销售，也不做商业服务 / SaaS | §7.2 |
| D9 | Windows / WSL：不纳入当前范围 | §10.4 |
| D10 | 第三方署名：尊重原作者、完整署名 | §11.6 |

### 2026-08-19（第三批，1 项）

| # | 决策 | 依据 |
|---|---|---|
| D11 | MVP 范围：采纳《MVP PRD：协奏骨架》（[中文](./mvp-prd_zh-CN.md) / [English](./mvp-prd.md)），含「协奏模式（Concerto Mode）」命名与 Q-1～Q-4 全部决议 | §10.8；§12.7；§14 |

### 2026-08-19（第四批，1 项）

| # | 决策 | 依据 |
|---|---|---|
| D12 | License 白名单扩展：接受 MPL-2.0（弱 copyleft）进入 verify-licenses 白名单 | 调研报告 §4.7；MVP 实施 T3 实证（vite@8.2.1 → lightningcss@1.33.0 为 MPL-2.0 硬依赖） |

### 2026-09-05（第五批，1 项）

| # | 决策 | 依据 |
|---|---|---|
| D13 | 版本管理与发布流程：采纳《发布流程》（[English](./release-process.md) / [中文](./release-process_zh-CN.md)）——三方兼容矩阵（`.omo/compat.yaml` 单一事实来源，机器渲染为矩阵文档）、tag 约定（不可变 `vX.Y.Z` + 移动别名 `vX.Y`）、本地优先测试分层（L0 静态 / L1 零成本 e2e / L2 真模型仅本地）、`scripts/release.sh` 六步发行 + docs 一致性检查器、D7 命名的 `scripts/bump-dsh.sh` pin 翻转、每周 `compat-probe` 哨兵。原则：优先自动化、本地优先省成本 | 本次讨论拍板（O6/O7 就此关闭） |

### 2026-09-11（第六批，1 项）

| # | 决策 | 依据 |
|---|---|---|
| D14 | OMO 上游策略：**冻结 v4.19.4 基线**——不跟踪 v5.0 beta 线、不设常驻 rebase 节奏；全量移植引进代码时**从 git tag vendor 源码**（届时若 v5.0.0 正式版已发布则用它，否则用 v4.19.4），按 SUL-1.0 保留 LICENSE 原文 + 完整署名；允许随时定向搬运上游修复（按文件 cherry-pick，非版本升级）；在本项目自己的 release 节点各读一次上游 CHANGELOG（认知，非跟踪）；命名/能力取舍遵循 v5.0 勘误（可行性报告 §16）。**关闭 O1 并修正其提法**："npm import 19 个 core 包"方案由 git vendor 取代，因为这些 core 包全是 `private: true`，从未发布到 npm | v5.0.0-beta 调查：[架构调查](./omo-v4.19.4-vs-v5.0.0-beta.53-architecture-investigation.md) + [agent 团队调查](./omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md)；可行性报告 §16 |

### 2026-09-11（第七批，1 项）

> 本批在 Phase 1（core 源码 vendor 验证）的计划阶段产生：调研上游 v4.19.4 tag 时发现两个**每个 core 包 vendor 都会反复遇到**的合规问题，在此固化，避免后续 18 个包逐次重新判定。依据：[Phase 1 开发计划](./plans/phase1-dev/phase1-plan.md)。

| # | 决策 | 依据 |
|---|---|---|
| D15 | **vendor 合规细则**（D14 第 3 条的落地解释）：(a) 上游 core 包的 `package.json` **均无 `license` 字段**（19/19，许可仅由 OMO 仓库根 `LICENSE.md` 承载），故 vendor 副本**必须显式补 `"license": "SUL-1.0"`**——该值记录的是文件实际适用的许可，不是自我授权；这是 `verify-licenses` 通过的必要条件（非充分条件，见 D16）。(b) D14 第 3 条的"按 vendor 文件逐一署名"**按字面执行**：`THIRD_PARTY_NOTICES.md` 列出 vendor 包内**每一个文件**并标注处置（verbatim / 已修改 / 包外复制 / 本项目新增）；`VENDOR-MANIFEST.json` 作为机器可读层承担逐文件 sha256 以支撑漂移检测，**不替代** NOTICES 的署名。(c) 采纳 SUL-1.0 的"**已修改**"版权声明：声明放**包级文件**（vendor 包根 `NOTICE.md` + NOTICES + manifest 的 `deviations[]`），**不在每个源码文件头插入修改注记**——那会让全部 verbatim 文件偏离上游，摧毁 D14 第 4 条定向搬运与漂移检测的可操作性 | Phase 1 计划阶段对 v4.19.4 tag 的实测：`packages/hashline-core/package.json` 无 license 字段、包内 26 个上游文件（23 verbatim + 3 已修改）、1 处包外 `test-support` import、6 个 `bun:test` 测试文件；SUL-1.0 "Notices" 第二句；[署名清单](./plans/phase1-dev/phase1-license-attribution.md) |

### 2026-09-11（第八批，1 项）

> 本批由 Phase 1 计划文档的评审产生：评审对计划的工具链主张对照本仓库与上游 tag 做了实证核查，发现一个门级误判（`verify-licenses` 名称门），必须在开工前以决策固化。依据：[Phase 1 开发计划](./plans/phase1-dev/phase1-plan.md)。

| # | 决策 | 依据 |
|---|---|---|
| D16 | **`verify-licenses` 的 SUL 名称门扩展至 `@oh-my-opencode` scope**：D15 第 1 条要求补的 `"license": "SUL-1.0"` 是必要条件但**不充分**——`SUL_ALLOWED_NAME`（整词 `omo` 或 `oh-my-openagent`）**不匹配** `@oh-my-opencode/*`，包名不变时即使补了字段也会被判 violation。(a) vendor core 包**保持上游包名**——否决改名：包名是漂移检测与定向搬运（D14 第 4 条）的溯源锚点。(b) `SUL_ALLOWED_NAME` 增加 `oh-my-opencode` 分支——白名单类变更**经本决策授权**（ROADMAP §3 约束 4，D12 先例），不是 D15 第 1 条禁止的临时绕过。(c) 脚本改动（正则 + 头注释 + 测试用例）随 Phase 1 落地（P1-T9）。适用全部 19 个 core 包（同 D15 第 4 条） | Phase 1 计划评审实测：按计划拟定的 manifest 模拟运行 `verify-licenses` → `violations: ["@oh-my-opencode/hashline-core@0.1.0: SUL-1.0"]`；`scripts/verify-licenses.mjs`（`SUL_ALLOWED_NAME` 第 75 行、名称门分支第 164 行）；仓库现有包仅靠 `omo-agents` 的整词 `omo` 与 `MIT OR SUL-1.0` 的 MIT 分支通过 |

### 决策详情（完整措辞以此为准）

**D7 — DSH pin 策略：pin minor（`0.1.x`）**
0.x 阶段破坏性变更发生在 minor 升级（0.1→0.2）；pin minor 下破坏性升级只能经 `scripts/bump-dsh.sh` 显式进入（过全量 typecheck + test gate），patch 级修复自动吸收。不选 pin patch（rc 阶段 bugfix 频繁，锁死无益）、不跟 dev head（破坏性变更失控）。对应调研报告 §10.2 选项 A。

**D8 — 商业边界**
不做销售，也不做商业服务 / SaaS——彻底退出 SUL-1.0 的 "Use vs Distribute" 灰色地带（调研报告 §7.2）。

**D9 — Windows / WSL**
不纳入当前范围——不写跨平台 e2e；Windows 用户被阻塞到后续范围扩展。对应调研报告 §10.4 选项 B。

**D10 — 第三方署名**
尊重原作者、完整署名——hashline（概念源自 `oh-my-pi`）等在 `THIRD_PARTY_NOTICES.md` / README 致谢中完整标注（调研报告 §11.6）；具体措辞在实施时定。

**D11 — MVP 范围：采纳《MVP PRD：协奏骨架》**
采纳 [MVP PRD](./mvp-prd_zh-CN.md) 定义的 MVP 范围，关闭开放维度 O8（调研报告 §10.8）：最小骨架 = 新运行模式「协奏模式（Concerto Mode，标识 `concerto`）」+ 1 主 agent（omo-sisyphus）+ 1 subagent（omo-explore）+ 1 hook listener + 双模型路由（deepseek + pi-ai）；目标是验证假设 V1–V4（scratch plugin 冷启动 / per-subagent LLM 路由 / listener 翻译层 / subagent 限制链）并提前踩坑，不解决真实工程问题。OMO core 包 npm import 不并入 MVP（Q-2 选 B），为紧随其后的第一个 follow-up*（该 follow-up 现由 D14 定义为 git vendor——core 包从未上 npm；见 [ROADMAP](./roadmap_zh-CN.md) Phase 1）*。完整范围、验收标准（AC-1～AC-9）与踩坑计划（P-1～P-9）以 MVP PRD 为准。

**D12 — License 白名单扩展：接受 MPL-2.0**
`scripts/verify-licenses` 白名单在调研报告 §4.7 草拟的 MIT / Apache-2.0 / BSD / ISC / SUL-1.0（仅 OMO）基础上增加 MPL-2.0。依据：MVP 实施 T3 实证 vite@8.2.1（vitest 4 硬依赖）传递依赖 lightningcss@1.33.0 为 MPL-2.0；MPL-2.0 是文件级弱 copyleft，业界普遍允许；lightningcss 仅为开发链构建工具（devDependencies 传递），本项目不分发。若未来 MPL-2.0 政策收紧，撤除脚本中对应单行并改 pin vite 版本。

**D14 — OMO 上游策略：冻结 v4.19.4 基线**
在 2026-09-11 的 v5.0.0-beta 调查之后采纳（证据：[架构调查](./omo-v4.19.4-vs-v5.0.0-beta.53-architecture-investigation.md)与 [agent 团队调查](./omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md)；勘误已吸收进可行性报告 §16）。权威措辞：

1. **冻结基线。** OMO 语义与代码基线冻结在 **v4.19.4**（v4 线最后一个 release，2026-08-01）。本项目已对 OMO 验证过的一切——persona、hook 映射、协奏设计——保持锚定该版本。
2. **不追 beta、不设常驻 rebase 节奏。** v5.0 beta 线（33 天 53 个 tag）不予跟踪。R4 的"首轮 OMO bump 实证 1 小时 rebase"前提作为**目标**退役：不存在可 rebase 的依赖流——19 个 core 包全是 `private: true` workspace 包，从未发布到 npm（2026-09-11 实测 registry 全部 404；发布的 `oh-my-opencode` 包只导出打包后的 `dist/index.js`）。
3. **引进 = git vendor。** 全量移植需要 OMO 源码时（原 O1 方案），按 SUL-1.0 从 git tag vendor：`LICENSES/oh-my-openagent.LICENSE.md` 保留原文，`THIRD_PARTY_NOTICES.md` 按 vendor 文件逐一署名，保持非商业（D8）。引进时的 tag 选择：**届时若 v5.0.0 正式版已发布则用它**（同样的功夫、无 codegraph 死代码、角色名为新版），**否则用 v4.19.4**——我们目标的核心包（team-core / delegate-core / hashline-core / rules-engine / …）在两版间几乎逐字相同，该选择无论哪边都低赌注。
4. **定向搬运。** 任何上游修复或能力，凡我们有具体需求者（例如 team-mode 的 fallback-wake 修复），可随时从新 tag 按文件搬运——是带署名的定点 cherry-pick，不是版本升级。
5. **认知而非跟踪。** 在本项目自己的 release 节点（`scripts/release.sh` 运行时）读一次上游 CHANGELOG，记录任何推翻 §16 勘误假设的事项；不为 OMO 增设每周哨兵（现有哨兵只盯 DSH，不变）。
6. **命名与能力取舍遵循 §16**（v5 角色名 `plan-consultant` / `plan-reviewer`、`/ulw-execute`、codegraph 移出移植清单、memory/DAG/model-profiles 登记为"DSH 原生优先"的候选能力域）。
7. **O1 由本决策关闭并修正提法**："npm import 的 pin 策略"预设了一个不存在的发布产物流；上述 vendor 政策取而代之。

**D15 — vendor 合规细则（D14 第 3 条的落地解释）**
在 Phase 1（core 源码 vendor 验证）的计划阶段采纳：调研上游 v4.19.4 tag 时发现两个每个 core 包 vendor 都会反复遇到的合规问题，在此固化，后续 18 个包不再逐次重新判定（证据与操作细节见 [Phase 1 计划](./plans/phase1-dev/phase1-plan.md) 与 [署名清单](./plans/phase1-dev/phase1-license-attribution.md)）。权威措辞：

1. **`license` 字段必须补，且值有意义。** 上游 19 个 core 包的 `package.json` 全部没有 `license` 字段，许可仅由 OMO 仓库根 `LICENSE.md`（SUL-1.0，本项目已逐字节校验一致）承载。后果有二：(a) `scripts/verify-licenses.mjs` 对缺失 license 的包判 `MISSING` 并计入 `violations`，故不补则 Phase 1 退出标准 (b) 不可能达成；(b) 补写的 `"SUL-1.0"` 不是"自我授权"，而是**记录该文件实际适用的许可**。**不得**改 `verify-licenses` 的白名单来绕过（ROADMAP §3 约束 4）。本项目唯一确实需要的白名单类变更——把检查器的 SUL **名称门**扩展到 `@oh-my-opencode/*`（否则即使正确补了字段仍被判 violation）——已**经决策**落为 D16，而非临时绕过。
2. **署名按 D14 第 3 条字面执行——逐文件。** `THIRD_PARTY_NOTICES.md` 列出 vendor 包内每一个文件并标注处置（`verbatim` / `已修改` / `包外复制` / `本项目新增`），使该文件的"署名"含义与 D14 原文一致。`VENDOR-MANIFEST.json` 的逐文件 sha256 是**机器可读的补充层**，用于漂移检测与定向搬运，**不替代** NOTICES 的逐文件署名。若某包的逐文件列表使 NOTICES 难以阅读，(3) 的包级 `NOTICE.md` 是分流渠道，但**不得**因此省略 NOTICES 的逐文件条目。
3. **采纳 SUL-1.0 的"已修改"版权声明，落点在包级文件而非文件头。** OMO 的 `LICENSE.md` 是 GitHub 的"Sustainable Use License"模板（**不是** Functional Source License 模板），其中的 "Notices" 第二句要求修改过的副本携带醒目声明。本项目是修改过的副本（因为必须补 license 字段、必须适配测试框架、必须处理包外 import），故每份 vendor 副本必须带醒目声明。声明落在三处包级文件：vendor 包根 `NOTICE.md`、`THIRD_PARTY_NOTICES.md` 对应条目、`VENDOR-MANIFEST.json` 的 `deviations[]`。**明确不在每个源码文件头插入"modified by …"注记**——那会让全部 verbatim 文件偏离上游，直接摧毁 D14 第 4 条定向搬运与漂移检测的可操作性。同理，修正后的副本**不重新署名给本项目**：版权仍属原作者，本项目只声明"已修改"。
4. **适用面。** 本决策适用于**每一次**从 OMO vendor core 包（Phase 1 及其后各阶段），不限于 hashline-core。

**D16 — `verify-licenses` 的 SUL 名称门扩展至 `@oh-my-opencode` scope**
在 Phase 1 计划文档的评审轮采纳（2026-09-11）：评审对计划的 `verify-licenses` 主张做了实证重跑，发现一个门级误判，必须在开工前固化。权威措辞：

1. **名称门真实存在，计划此前判错了。** `tokenAllowed('SUL-1.0', '@oh-my-opencode/hashline-core')` 求值为 `false`：`SUL_ALLOWED_NAME` 要求整词 `omo` 或字面 `oh-my-openagent`，上游 scope 两者皆不含。计划原 §4.4"正则恰好匹配 `@oh-my-opencode/…`"的主张为假（评审发现，计划已修正）。按计划拟定的 manifest 模拟运行产出 `violations: ["@oh-my-opencode/hashline-core@0.1.0: SUL-1.0"]`——故 D15 第 1 条的补字段是必要条件但**不充分**。
2. **保持上游包名。** 否决为满足名称门而改名：包名是漂移检测与定向搬运（D14 第 4 条）的溯源锚点；Phase 1 虽无消费方会因改名而 import 失效，但后续消费方（Phase 6）受益于与上游一致的命名。
3. **名称门经决策扩展，而非绕过。** `SUL_ALLOWED_NAME` 增加 `oh-my-opencode` 分支（覆盖上游 core 包整个 scope）。这是白名单类变更，故按 ROADMAP §3 约束 4 与 D12 先例在此显式授权——它不是 D15 第 1 条禁止的临时放宽，因为它记录的是上游的真实许可状况（仓库根 `LICENSE.md` = SUL-1.0，已逐字节校验），而非规避检查。
4. **实施。** 随 Phase 1 落地（任务 P1-T9）：正则改动、`scripts/verify-licenses.mjs` 头注释留痕、`tests/omo-agents/verify-licenses.test.ts` 补 `@oh-my-opencode/*` 放行用例。
5. **适用面。** 全部 19 个上游 core 包（同 D15 第 4 条）——扩展按 scope 生效，后续包无重复工作。

## 风险处置（2026-08-19）

以下风险经用户确认按"接受现状 / 暂不处理"处置；风险本身的分析见调研报告"依据"列：

| # | 风险 | 处置 | 依据 |
|---|---|---|---|
| R1 | LLM adapter 工作量可能被低估 | 接受现状；维持分期策略（先 DeepSeek + OpenAI-compatible，其余按需补） | §5.1 |
| R2 | DSH 无 fallback chain | 接受现状；薄 retry wrapper（30–80 行 / plugin 实例）保留为可选缓解，未 commit | §12.5 |
| R3 | 16 周工作量估算无 buffer | 接受现状；按研究阶段估算使用，不作承诺（其依赖的 DSH pin 前提已确认为 D7） | §2.10 |
| R4 | "1 小时 rebase"依赖 listener 薄层假设 | ✅ 已关闭（2026-09-11）→ D14 + MVP V3：常驻 rebase 节奏退役（无依赖流可 rebase）；薄 listener 假设本身已由 V3 实证 | §4.5 |
| R5 | `args.prompt` 信任边界缺口 | 接受现状；与 OMO 同一假设——父 agent 为受信内部 LLM，不引入不可信输入源 | §13.7.1 |
| R6 | `<plan>` 信封非安全边界 | 接受现状 | §13.7.2 |

## 开放维度（待决策）

| # | 维度 | 状态 | 选项分析（调研报告） |
|---|---|---|---|
| O1 | OMO 19 core 包 pin 策略 | ✅ 已决 → D14（提法修正：npm import → git vendor；基线冻结 v4.19.4） | §10.1 |
| O2 | DSH 自身 pin 策略 | ✅ 已决 → D7 | §10.2 |
| O3 | npm 包命名 | 开放 | §10.3 |
| O4 | Windows 是否在范围 | ✅ 已决 → D9 | §10.4 |
| O5 | Telemetry 默认状态 | 开放 | §10.5 |
| O6 | OMO 上游 release 通知 | ✅ 已决 → D13 | §10.6 |
| O7 | 升级节奏 | ✅ 已决 → D13 | §10.7 |
| O8 | 能力面：MVP vs. follow-up 拆分 | ✅ 已决 → D11 | §10.8 |

## 决策历史

- **2026-08-16**：D1–D6 确认。
- **2026-08-19**：D7–D10、R1–R6 确认；全部决策记录从可行性报告（原 §10.1 / §5.4）迁入本文档，可行性报告自此定位为纯调研依据（其 §10 仅保留开放维度的选项分析）。
- **2026-08-19**：D11 确认（采纳 [MVP PRD](./mvp-prd_zh-CN.md)，含 Q-1～Q-4 决议）；开放维度 O8 关闭。
- **2026-08-19**：D12 确认（License 白名单接受 MPL-2.0；MVP 实施 T3 实证触发）。
- **2026-08-29**：已登记 DSH 0.1.2-alpha.1 复核报告（[English](./archived/dsh-0.1.2-review.md) / [中文](./archived/dsh-0.1.2-review_zh-CN.md)）；无新增决策——rc.6 → 0.1.2-alpha.1 的 pin 升级按 D7 的刻意升级机制执行，并已在 PRD §12 登记跟踪；SubagentProvider 扩展路径事实以调研沉淀形式登记于可行性报告的 2026-08-29 follow-up note 中。
- **2026-09-05**：D13 确认（版本管理与发布流程——三方矩阵、tag 约定、本地优先测试分层、发行自动化、每周哨兵）；开放维度 O6/O7 关闭。
- **2026-09-10**：已登记 DSH 0.1.5-rc.1 复核报告（[`dsh-0.1.5-rc.1-review.md`](./dsh-0.1.5-rc.1-review.md)）；**无新增决策**——rc.6 → 0.1.5-rc.1 的 pin 升级按 D7 的刻意升级机制执行，并已在 PRD §12 登记跟踪（该节已按复核结论重写）。本次唯一的 P0（`@deepseek-ai/dsh-persona` 的 `text:` → `prefix:` 改名，落点 `dsh-v0.1.3-alpha.2`）是一个**破坏性**配置变更，而本仓库自己的门禁却对它给出全绿——这使 L3 门禁的覆盖面作为实施项被重新打开，而非作为决策项。两点值得在此登记的副作用：(1) **Q-3 的双 provider 配对现已成为"按部署可选"而非固定**——不写入 `llm-pi-ai.providers` 段的部署，通过文档化的 `OMO_EXPLORE_PROVIDER` 覆盖把 explore 席位钉到 `deepseek-official`，而仓库默认值仍为 pi-ai；AC-5 的要求（两对**互不相同**）在两种情况下都成立，因为"不同"是按 provider+model 合并判定的。(2) **P-1.3 的前提已退场**——`composeProfile` 不再强制改写 `agent-presets` 行的 `roots`（0.1.5-rc.1 中已移除），于是"用配置声明 preset root"重新成为可用机制；须留意的注意点是 shipped root 现在**排在**配置 roots **之前**，依赖它之前要先确认按 id 首个根胜出的规则。
- **2026-09-11**：D14 确认（OMO 上游策略——冻结 v4.19.4 基线、不追 beta、引进 = 按 SUL-1.0 git vendor、定向搬运修复、在本项目 release 节点以纯认知方式读上游 CHANGELOG）；开放维度 **O1 关闭并修正提法**（19 个 core 包全是 `private: true`、从未上 npm，"npm import" 由 vendor 取代）；v5.0.0-beta 完整调查沉淀为两份调查报告（[架构](./omo-v4.19.4-vs-v5.0.0-beta.53-architecture-investigation.md)、[agent 团队](./omo-v4.19.4-vs-v5.0.0-beta.53-agent-team-investigation.md)），并作为勘误吸收进可行性报告 §16；冻结基线下的开发方向由正式 [ROADMAP](./roadmap_zh-CN.md) 承载。
- **2026-09-11（同日稍后）**：D15 确认（vendor 合规细则——上游 core 包无 `license` 字段故 vendor 副本必须显式补 `SUL-1.0`；D14 第 3 条的"逐一署名"按**文件级**执行；按 SUL-1.0 的 "Notices" 条款采纳**包级**"已修改"声明，不在源码文件头插注记）。触发源：Phase 1 计划阶段对上游 v4.19.4 tag 的实测。**实施状态**：Phase 1（vendor 文件落地、接入 CI、退出标准 a–g）**尚未开工**，本次只落决策与计划文档。
- **2026-09-11（评审修复轮）**：D16 确认（`verify-licenses` 的 SUL 名称门扩展至 `@oh-my-opencode` scope——D15 第 1 条的补字段被实证为必要但**不充分**；保持上游包名；名称门扩展按 D12 先例经决策授权，非绕过）。同一轮评审还修正了计划文档：verbatim/偏离计数体系统一为 **23 verbatim / 3 已修改 / 1 包外复制 / 2 本项目新增**（vendor 目录 29 文件、NOTICES 29 行、manifest `deviations[]` 6 条），并补上**第四接入点**——根 `tsconfig.json` 必须排除 vendor 测试文件，否则门 1（`pnpm typecheck`）会编译 6 个 `bun:test` 文件而变红。**实施状态**：不变——Phase 1 尚未开工。

---

**English version**: [`decisions.md`](./decisions.md)
