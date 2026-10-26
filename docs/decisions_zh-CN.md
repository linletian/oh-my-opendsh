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

- **D#**（D1–D21）：已确认决策（上方索引表止于 D17；D18–D21 为底部登记条目，判某条缺席前请先查文件底部）
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

| D17 | **放弃 DSH 0.1.x 兼容，目标运行时收敛为 0.2.x+**：业主裁定（逐字）「v0.1.5 不用兼容可以放弃掉，现在只需要适配 v0.2.x 以上」。**这是对 D7 的执行面修正，不是对 D7 的推翻**——D7 说的是「pin minor」，D17 说的是**当前这个 minor 是哪个**：(a) pin 仍走 minor 级、仍只经 `scripts/bump-dsh.sh` 显式翻转，机制不变；(b) **0.1.x 不再是受支持运行时**，其可执行分支在 pin 翻转后删除；(c) **但删除不与翻转同 commit**——翻转 commit 必须小到能二分，CI 一旦红要能立刻分清是 pin 本身还是删除造成的；(d) 翻转前 CI 仍钉 `0.1.5-rc.1`，那段过渡期的绿是**防回归信号**，不是能力承诺；(e) 「0.1.5 不再验收」的时刻 = **pin 翻转 commit**，不是本决策的生效时刻 | Phase 4.5 WP-4 开工前的仲裁者一手探针：门 3 在本机 0.2.x 上跑得动但红 9 条断言，根因是 0.2.x **删掉 `settings.yaml` 配置面**（`dsh-settings/lib/index.js:343-362` 的补导入由 `:339-341` 的 `loader.await().then()` 触发，晚于 `omo-agents` 的 `apply()`）；`.omo/evidence/p45t8/ARBITRATION-feasibility-probe.md`；阶段计划 `docs/plans/phase4.5-dev/phase4.5-tasks.md` 2026-10-06 修订记录 |

### 决策详情（完整措辞以此为准）

**D7 — DSH pin 策略：pin minor（`0.1.x`）**
0.x 阶段破坏性变更发生在 minor 升级（0.1→0.2）；pin minor 下破坏性升级只能经 `scripts/bump-dsh.sh` 显式进入（过全量 typecheck + test gate），patch 级修复自动吸收。不选 pin patch（rc 阶段 bugfix 频繁，锁死无益）、不跟 dev head（破坏性变更失控）。对应调研报告 §10.2 选项 A。

**D17 — 放弃 DSH 0.1.x 兼容，目标运行时收敛为 0.2.x+**
业主裁定逐字：「v0.1.5 不用兼容可以放弃掉，现在只需要适配 v0.2.x 以上」。**本决策修正 D7 的执行面，不推翻 D7 本身**——D7 定的是「pin minor」这条机制，D17 定的是**当前这个 minor 是哪个**。五条执行口径：(a) pin 仍走 minor 级、仍只经 `scripts/bump-dsh.sh` 显式翻转，机制不变；(b) **0.1.x 不再是受支持运行时**，其可执行分支在 pin 翻转后删除；(c) **删除不与翻转同 commit**——翻转 commit 必须小到能二分，CI 一旦红要能立刻分清是「pin 本身」还是「顺手删的一大片」；(d) 翻转之前 CI 仍钉 `0.1.5-rc.1`，那段过渡期的绿是**防回归信号**而非能力承诺；(e) **「0.1.5 不再验收」的时刻 = pin 翻转 commit**，不是本决策的生效时刻。
**为什么值得单列一条决策而不是当作实现细节**：计划书 §4.1 当初选「全程双模」的三条理由里，第 3 条（「双模探针本身构成『0.1.5 上没有静默退化』的证据」）在本决策之后**失去价值**——不再需要证明 0.1.5 上没有静默退化。⇒ **净收益只有「范围收窄」一条；净损失是翻转前的双模维护成本 + 翻转后的删除成本**。这是取舍，不是免费午餐，故按决策登记以便日后追责。

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
- **2026-10-02**：已登记 DSH 0.2.0-rc.2 复核报告（[`dsh-0.2.0-rc.2-review_zh-CN.md`](./dsh-0.2.0-rc.2-review_zh-CN.md)）；**无新增决策**——0.1.5-rc.1 → 0.2.x 的 pin 升级按 D7 的刻意升级机制执行，划为 ROADMAP **Phase 4.5** 并在 PRD §12 登记跟踪。与前两次复核登记不同，这次随附一个阶段，因为结论是两个 P0 **运行时**断裂——全部静默：agent-preset 重架构删除了**两条**交付线共同指向的 `$DSH_HOME/.agent-presets/` 文件发现（插件的 `syncConcertoPreset`*与*已发布安装器的静态 preset），`ctx.jobs` 重写让三个 jobs 触点无一抛出地失效——外加一个打断**测试基础设施**的 P1（会话日志格式 v4）。pin 翻转是 Phase 4.5 刻意排在最后的一步，以完整 L1+L2 证据链在 0.2.x 重跑为门；此前 CI 保持 `0.1.5-rc.1`，0.2.0-rc.2 是矩阵里已登记的 `untested` 行。针对该报告的两轮评审已在同一次变更中裁定：P0 计数措辞更正（2 P0 + 1 P1，非 3 P0）；安装器交付线补入 Phase 4.5 范围；四处过强的「零 diff / 逐行一致」断言收窄（vendor 树变动 33 个文件；`applyEntryPatches` 重构 +55/−89 但 P-8 语义保持；`dsh-persona` 是 `src/` 零 diff 而非整包）；§2.1 远程面基线补全（`read`/`select` 早于 0.2.0）；引用精度修正多处——另有两条意见**经证据驳回**（「R-8」引用并非悬空：定义在 `docs/plans/phase2-dev/phase2-plan.md` §6 且 README 引用了它；`kind:'plugin'` 在插件源码内恰好 13 处，已逐行列出）。
- **2026-10-06**：**D17 确认**（放弃 DSH 0.1.x 兼容，目标运行时收敛为 0.2.x+）。业主裁定逐字：「v0.1.5 不用兼容可以放弃掉，现在只需要适配 v0.2.x 以上」。触发源：Phase 4.5 WP-4 开工前的仲裁者一手可行性探针——门 3（`tests/e2e/drive.mjs`）在本机 0.2.0-rc.2 上**跑得动**（沙箱真 boot、read-face 校验器 `READ-FACE PASS`、session 建出且日志头自报 `"version":4`），**但红 9 条断言且全部属于「explore 席没起来」的链**，会话日志里 `tool/call` / `tool/result` **零条**；根因一手钉死于 0.2.x **删掉 `settings.yaml` 这个配置面**——`dsh-settings/lib/index.js:343-362` 的补导入由 `:339-341` 的 `ctx.root.loader.await().then(...)` 触发，**晚于** `omo-agents` 在自己 `apply()` 期的 route provider 判定；首启后 `settings.yaml` 被 `rename` 成 `settings.yaml.imported`（`:350-351`）且导入**确实成功**（三行配置出现在 `profiles/web/cordis.patch.yml`），只是**晚了**。反证决定性：同一沙箱**再启一次**，该 marker 整行消失。⇒ 该断裂与 D7「pin minor」机制无关，是 0.2.x 单侧的运行时事实，但它使「双模护栏」的成本被重新估价，于是业主直接收窄了支持面。**对阶段计划的连带修订**（仲裁者同批完成，见 `docs/plans/phase4.5-dev/`）：新增切片 **P4.5-T8a**（把 LLM 接线种进 profile patch overlay，Q-8 的硬前置）；T10 重心加权重排（门 3 / 门 8 从「迁移重心」升为「翻转前置」）；T11 改写为 **T11′**（0.2.x 单运行时全链，0.1.5 侧降级为防回归信号）；**T12 与 T13 拆成同一 PR 下的两个 commit**——翻转 commit 承载退出标准 (f)，死路径删除随 T13 交付。**D7 本身未被推翻**：pin 仍走 minor 级、仍只经 `scripts/bump-dsh.sh` 显式翻转。**登记的代价（不美化）**：计划书 §4.1 选双模的三条理由中第 3 条（「双模探针构成『0.1.5 上没有静默退化』的证据」）在本决策后**失去价值**；净收益只有范围收窄，净成本是翻转前的双模维护 + 翻转后的删除规模。原始件 `.omo/evidence/p45t8/ARBITRATION-feasibility-probe.md`。

- **2026-10-09**：**D18 确认**（Team Mode 实现面：**不采用 DSH experimental team 四包**，omo-team 自建于 `ctx.subagents.startContinuable` + 原生 inbox/sendMessage，team-core harness-neutral 子集按 D14/D15/D16 vendor）。触发源：Phase 5 P5-T1 的 Q-2/Q-3 阻断性钉测（dsh 0.2.0-rc.2 真实沙箱 boot，双正典 run）。**激活侧全绿**（Q-2 5/5 PASS：bundle 挂载、`ctx.agentTeams` 在场、`spawn_teammate` 组队、`team/message/queued→delivered` 事件对、jsonl 持久化前提）——不采用的原因**不在激活，在成员路由**：验收不变量「成员 descriptor 的 `agentProvider`/`agentModel`/`persona`/`toolFilter` = 名册路由值」（ROADMAP Phase 5「按 category 模型/技能」的字面要求）在 `spawnTeammate` 通道**结构性不可达**，三重封死链逐字在册——① 工具 schema 无 provider 参数（模型逐字传的 provider 被静默丢弃，`dsh-experimental-tool-agent-team/lib/index.js:245-266,:290`）；② `SpawnTeammateRequest` 无三件套字段、provider 仅字符串（`dsh-experimental-agent-team/lib/types/types.d.ts:139-146`、`:557`）；③ `spawnAdmitted` 硬编码 `startContinuable request:{prompt,parent}`（`agent-team/lib/index.js:573-582`）。替代接缝全灭：包装 provider 在 continuable 通道唯一参与点 `prepareContinuable({sessionId,parent,signal})→{seed?}` 非注入点；`agentTeams` 公开 API 无外部子女 admission 接口（spawnTeammate 唯一入场口）；修复面在上游包内（pin 领域，D7 不动）。**自建路基同批实证为绿**：raw `startContinuable` 携三件套 → descriptor 逐字承载名册值 + mock 实效（模型/persona/工具面三验）。**连带**：组合零改动（不挂 bundle → 无 scoped 遮蔽，concerto 模板 12 行序列/静态门/census 不动）；D18 不改变 D7（pin 不动、不追 rc 线）；experimental 面包仍以 pin 件在场，仅不被本仓组合挂载——若上游后续版本补上三件套透传（最小 3 点：types 增字段 / spawnAdmitted 透传 / 工具 schema 增参），本决策可按 D7 刻意升级机制重开。原始件 `.omo/evidence/p5t1/FORK.md`、`q3/Q3-provider-adapter.md`。

- **2026-10-13**：**D19 确认**（编辑模型 fork E = **(E-A)：采用 DSH 原生编辑面**（`dsh-tool-fs` edit），被否臂 **(E-B)**（hashline 工具面）不移植，`hashline-core` 维持 vendored-unconsumed 并成文在册；上游 `hashline-read-enhancer`（S-15）以「原生覆盖」闭环，`hashline-edit-diff-enhancer`（S-14）以「上游孤儿件 + 原生等价」记差异）。触发源：ROADMAP Phase 6 明文要求的 **A/B 证据台架**（P6-T2，`.omo/evidence/p6t2/`）——双臂真实沙箱 boot、固定脚本化政策、七失败类逐类数据 + 三突变自证红 + 全程 read-back sha256 字节比对。**实测结论**：七类夹具双臂最终字节全部正确（**静默错写率 0/0**）；原生面六类可判失败全有逐字机判错误与内嵌恢复指引（`FS_AMBIGUOUS_EDIT`/`FS_STALE_VERSION`/`FS_NOT_OBSERVED`/`FS_EDIT_NOT_FOUND`/`must differ`），且原生版本 CAS 在写路径同守双臂（parity 实证）；平均恢复轮数 **A 1.50 < B 1.67**。唯一结构性差异 = F-e 类**检测保证**（hashline 面陈旧锚 `HASH_MISMATCH` 响亮终拒、文件不变 vs 原生面漂移无感）——但原生面的「无感」在内容唯一时不产生错字节（实证），其错写面 = 歧义（已被 `FS_AMBIGUOUS_EDIT` 覆盖），该差异是纵深防御属性、未在任何夹具转化为正确性差异。**未测量面（诚实登记）**：台架脚本政策机械构成完美 old_string，测不到 hashline 针对的模型级串复写错误类——此优势可能真实存在，但本阶段无证据，裁定纪律（只认证据）下不作移植理由。**成本面对账**：移植 = 5 实现件 + 配置门 + enhancer 钩 + 同步网，对上游自身默认 OFF 的实验件（`oh-my-opencode-config.ts:60` 注释逐字），为零实测正确性收益付此成本违反原生优先纪律。**复审触发条件**（任一成立即重审）：① live-model 真实会话中原生 edit 串复写/锚定失败类遥测；② 持 key 环境 model-in-loop 重跑台架测出构成层分化；③ DSH 原生 edit 面语义退化（pin 升级带走 CAS/唯一性约束）。台架可单行复跑（`bash .omo/evidence/p6t2/rig/run.sh`），重审成本一次复跑。**连带**：`str_replace_editor`（ROADMAP 点名比对对象）经 P6-T1 钉测为「在树未挂载的文档化可选加装件」，不入 A/B 臂（`FORKS.md` §0-3），本决策的比对基线 = 实际挂载的原生面；D19 不改变 D7/D14（pin 与 vendor 纪律不动，hashline-core vendor 件及其 NOTICES/manifest 原样保留）。原始件 `.omo/evidence/p6t1/FORKS.md` §1（终裁 §1.7）、`.omo/evidence/p6t2/DATA.md`。

- **2026-10-13**：**D20 确认**（LSP 能力面 fork L = **(L-B) 窄化**：vendor OMO `lsp-core` + `mcp-stdio-core` 两包，薄 server 面为本项目新增 `src/cli.ts`，经 dsh 自带 `@deepseek-ai/dsh-mcp-client` 以 stdio 挂载（cordis.yml 第 5 插行 `omo-lsp`），并对 vendored `mcp.ts` 施加现代协议字段偏离）。触发源：ROADMAP Phase 6 的 LSP fork（`dsh-lsp` 经 P6-T1 实测在 dsh 0.2.0-rc.2 安装树**不存在**——原生优先检查留痕，vendored + 原生 MCP 客户端挂载是空集上的路径）。裁定书 = `.omo/evidence/p6t1/FORKS.md` §2.6（**(L-A)** 新包原生注册的落选点逐条在册：插行成本相同、桥接稳健性白得（重连退避/命名稳定/原子代际钉测实证）、新包四件套门成本、post-edit 记差异可接受、modern 字段增补无墙；而 **(L-C)** 的排除是**另一条论证、不是成本比较**——(L-C) 义为「纯记差异 / defer」（§2.1），此处 defer 无据：LSP 在 ROADMAP Phase 6 目标句具名、退出标准要求脚本化场景中被 agent 真实使用、钉测已证挂载路径全通（§2.4 第 1/2 条）——无硬墙，故 defer 无据）。**落地条款**：① vendor 两包 @ v4.19.4（lsp-core 65 非测试 .ts + 1 .mjs fixture；21 枚 bun:test 套件登记排除；mcp-stdio-core 6 src——`transport.test.ts` 携带跑绿 4/4、`server.test.ts` 以 jest fake-timers 实测理由排除）；② 扩展名墙全量改写 + 五面机械证明（`.omo/evidence/p6t4/vendor-import-wall/`，73/73 过 strip-only 解析、反向面逐字节还原上游）；③ 参数属性重写 14 构造子/9 文件（T5 NOTES-6 先例族，偏离登记）；④ **modern 时代字段偏离**——`server/discover` 应答（supportedVersions/capabilities/诚实缓存值）+ 按进程 era 跟踪（`_meta` 信封）+ resultType 三件套：不偏离的代价 = 永久静默 legacy 降级（P6-T1 钉测 §1 实测），`initialize` 回显语义保持上游逐字；⑤ 挂载行 = `command: !!js process.execPath` + 相对 args + `cwd: !!js process.cwd()`（仓根 boot 契约，四处 boot 站点逐一实证）+ `failOnStartupError:false`（S4/S4b 实测取舍，cold-start.sh 新增 `[lsp-mcp]` boot grep 作运行时缺席门）；⑥ 计数耦合网 4→5 全点位同 commit（cordis.yml 头注/`EXPECTED_INSERT_ROW_IDS`/`cordis-inserts.test.ts`/c11/c15/cold-start + 四处 boot 站注释；新增 `DSH_BUNDLED_INSERT_ROW_NAMES` 声明式例外——例外是数据不是放松的规则，双向断言在案）；⑦ doctor-lite 新增 dsh-bundled 行 zod Config 校验臂（正向 `validated=omo-lsp(serverName="lsp")`、反向非法 serverName/ghost key 均实测 FAIL）；⑧ mount-row pin 测试（`tests/omo-lsp/mount-row.test.ts`，变异实测会红）。**合规**：SUL-1.0 双包登记沿 hashline-core 先例（NOTICES 镜像 P6-1..71 / P6S-1..11 与 manifest 双向钉）；MIT `@code-yeongyu/lsp-tools-mcp` **不 vendor**，cli.ts 语义参照的署名条目在 THIRD_PARTY_NOTICES——名称门新案不成立。**实测**：face-probe 19 检查全绿（`.omo/evidence/p6t4/face-probe/`——8 个 `mcp__lsp__*` 在场、era=MODERN（sibling/session 双 pid 实证 `_meta` 跟踪）、execute 往返 `Configured LSP servers: 42`）；冷启动真 boot 含 `[lsp-mcp] stdio server starting pid=…`（三次独立复现）；门全绿（typecheck exit 0 / vitest **94f/2084t**（+4f/+28t 全来自本任务）/ doctor 5 行 / licenses checked 61→64 violations 0 / static 37/37 / docs 10/10 / vendor-manifest 454 无漂移 / cold-start PASS / e2e 41 场景与门 8 proofs 随提交前 ci-local 全链复核）。**双评审记录**：轮 1 双 APPROVE（opencode 1 MAJOR + 4 MINOR + 6 NIT；mcode 3 MINOR + 1 NIT）→ 仲裁台账 `.omo/evidence/p6t4/ARBITRATION-r1.md`（8 采纳全亲验）→ 修复轮 → 轮 2 **双 APPROVE 残留 ≤NIT**（mcode 的 FIX-3 负向腿 nit 由仲裁员亲测 `serverName:"lsp!"` → exit 1 闭环）。**连带**：post-edit 记差异（随引擎携带、内部消费、不接钩缝）；lsp-daemon 记差异（in-process manager 自洽，跨进程常驻产品在本仓形态无存在理由）；不改变 D7/D14/D15/D16/D18/D19。**重开条件**：① dsh 原生出现 LSP 宿主包且能力面覆盖（原生优先重裁）；② (L-B) 窄面实测缺口（如 21 枚测试确需携带）；③ 上游 lsp-core 现代字段原生实现落地（本偏离退役回 verbatim）。原始件 `.omo/evidence/p6t4/`（墙证明/face-probe/drafts/评审件/仲裁台账）。

- **2026-10-26**：**D21 确认**（ast-grep 能力面 fork G = **(G-A) 单落地**：语义移植上游钩 + `packages/utils/src/ast-grep/` 供给层；MCP 形态叠加（G-B）记「未来考虑」差异条目，**不建**）。**触发源**：ROADMAP Phase 6 的 ast-grep fork，退出标准是「每个入选能力在脚本化场景中被 agent 真实使用」——而上游的「活方向」指的是 MCP 形态 selective lift 的**可选性**（F-2 在册：可选，从未是必须）。**裁定书**：`.omo/evidence/p6t1/FORKS.md` §2.7（2026-10-13 盖章；证据 = §3 实测 + §2.4 钉测第 1 条——该条钉住「N 个 server 需 N 条插行、双插行干净共存」，故 (L-B) 与 (G-B) 同落会把同步网定价推到 4→5→6）。**措辞差注记（评审 NIT-1，因授权链条必须可查故必写）**：D14 表行逐字授权的是「fixes」，而**能力级**授权锚在 `docs/decisions.md:118`（D14 条款 4「selective targeted lifts」）加 ROADMAP 的「定向搬运」行（`docs/roadmap_zh-CN.md:20`）；裁定书以带日期的补注承载该锚（2026-10-26，`FORKS.md` §2.7——写本条目时补入，此前裁定书既未具名「定向搬运」亦未具名条款 4），两者措辞之间的落差在此登记，不抹平。**落地条款**：① S-16 `ast-grep-sg-provision` = `manifest.ts` 第 16 条（`EXPECTED_HOOK_COUNT = 16`，实测；行数是**派生**的，不是抄的），H-37 预分号**在册但不作行标识符**——manifest 行无此标识符字段，字符串 H-37 仅存活于注释（四处：`manifest.ts` 两处 + 其测试两处——**前三处声明「预分号在册、不烧号」这条规则，第四处解释机读锚串所指**，并不声明该规则）；号本身活在 FORKS.md §0-2；② 钩壳 + **6 件**供给层 `src/ast-grep/`（`types.ts`、`sg-manifest.ts`、`sg-resolver.ts`、`sg-provisioner.ts`、`install-script.ts`、`index.ts`），逐件自带署名头；③ **sha256 pin 0.43.0，四 slug 逐字**——`SG_PINNED_VERSION` 与上游四组 hash/URL 逐字节相同——配手写 zip 解包、`chmod 755` 与原子 rename；④ **resolver 三闸依序**：`OMO_AST_GREP_SG_PATH` env → runtimeDir → PATH，`ast-grep` 优先于 `sg`，且 bare `sg` 只有当它自己的 `--version` 输出含 `ast-grep` 字样才接受（Linux 自带一个不相干的 `sg`）；provision 失败 = **响亮具名 marker** + 结构化指引，**永不**打断 session/boot；⑤ **D9 Windows 减项逐条**：win32 两 slug（上游 hash 仍具名于文件头，使删除可审计）、`sg.exe`、win32 normalize 分支、`install.ps1`、`pwsh`、`powershell.exe`——整族缺席；⑥ **bunWhich 减项**：`Bun.which` 快径删除、纯 PATH 扫描以 `whichOnPath` 内联，其 drive-letter 臂登记在案——DSH 跑 Node 24 type-stripping，运行时无 Bun；⑦ **双来源裁定**：钩层 provision 路径为权威（有 sha256 校验），vendored 技能自带 `install.sh`（无校验和）保留为技能的文档与回退路径，两者 `targetDir` 约定同源；⑧ **hermetic 封网**：e2e/CI 以 committed `tests/e2e/fixtures/fake-sg.sh` 在 resolver 第一闸短路，经 `drive.mjs` 的 `scenarioEnv` 作**全局 floor** 导出（可按场景覆盖，T7 确实覆盖），`scripts/smoke-real.mjs` 以 `??=` 同款 floor 承接——MAJOR-1 实测：封网前**每次** boot 都真从 GitHub 下载 8.1MB，`.partial`  artefact 两次复现（`.omo/evidence/p6t6/ARBITRATION-r1.md`）。**实测**：e2e 双场景。正腿 `ast-grep-sg-via-bash` 走技能指导 → bash 起 bare `sg` → 富 fake `sg` → 匹配字节骑链回会话日志，由**三读者**独立回读（一个 double 亲读自己的副本、driver 自写 scanner 亲读原件、pin 不读任何文件）。反向金丝雀 `ast-grep-sg-absent-named-failure` 在钩面断 PROVISION FAILED + 派生指引，在 agent 面中性化 PATH 使未命中在**任何宿主**都是 exit 127 的一致形态，并 hermetic 断零 `.partial`、零可执行位。门态：typecheck exit 0 · vitest **100 文件 / 2125 测试** · doctor 5 行 · licenses `checked=66` violations 0（61→66，每步在 THIRD_PARTY_NOTICES 有对应）· static **38/38** · docs 10/10 · 门 3 **48/48**（T7 时 45/45）· ci-local **8/8** · probe 组合面 **10/10**。**双评审记录——两流分开、共八轮**（两个落地件是被分开评审的，合并叙述会把「谁否了什么」写错）：**流一 T5+T6（钩 + 供给层 + LSP e2e）**——R1：A 双 APPROVE、B **T6 REJECT**（B-MAJOR-1：e2e 每次 boot 真触发 GitHub 下载 8.1MB，且 NOTICES 的「never in tests, never in CI」为假声明——此即 hermetic 封网的起源）；R2：A 双 APPROVE、B **T6 REJECT**（B-R2-MAJOR-1：c29 的 barrel 臂是纯文本正则，注释掉一行 export 即可绕过，绕过后钩子静默死掉而全仓无门可红）；R3：**双 APPROVE**（仅余 MINOR）；R4：**双 APPROVE**（B 结语明言「均为文案级，无需重开评审」），修复后残留归零。台账 `.omo/evidence/p6t5/` 与 `.omo/evidence/p6t6/`——**同一流的两处归档，逐轮 sha256 亲验逐字节相同**。**流二 T7（ast-grep e2e 双场景）**——R1：双 APPROVE（B 虽通过但携 10 MINOR + 5 NIT）；R2：A APPROVE、B **REJECT**（修复面 2 MINOR + 4 NIT：fake-sg double 的路径/位置轴裸栈、`--json` 形态收窄、杂散 `.fake-sg-calls.log` 污染证据腿）；R3：A **APPROVE 零发现**、B **REJECT**（B-MAJOR-1：可执行 sg 的具名抛落在 runScenario 的 try **之外**，整轮 e2e driver 崩溃、已累积裁决一并丢失——一条正腿的 PASS 从记录里消失）；R4：双 APPROVE。台账 `.omo/evidence/p6t7/`。**连带**：上游 `install-ast-grep-sg.ts` 两件 CLI 安装器 = **recorded-difference**——它们是委托技能脚本的委托壳，自身不含平台矩阵（矩阵活在 `packages/utils/src/ast-grep/sg-manifest.ts`），而 CLI 安装入口语义不属于本阶段四腿消费面；(G-B) 立为「未来考虑」差异条目，**举证责任在叠加面**——schema 化参数、错误码、超时与 MCP 命名面，对照 23 件闭包、多一条插行、以及 v5 版本偏斜（v5-only `resolveSgBinarySync` 与 v4 pin 的关系须先成文才可 lift）；`ast-grep` 技能 = native-adopt + provisioning 衔接（钩层权威、技能 `install.sh` 保留为回退）；`grep_app` / `context7` / `exa` = **覆盖缺口具名的 recorded-difference**：DSH 内建 web 搜索/抓取覆盖通例，但 context7 的「库文档解析」（`resolve-library-id` / `query-docs`）与 grep_app 的 GitHub 代码搜索**不是**通用 web 搜索的严格子集——故 OMO librarian 提示词引用的三个 MCP 工具名在 DSH 面无逐一同名等价，功能替代 = 内建 web 搜索/抓取 + librarian 席保留 web 可达（W-7 席位差集已证）。**D7 / D14 / D19 / D20 不变。**重开条件**：① dsh 原生出现覆盖能力面的 ast-grep MCP 宿主包（原生优先重裁）；② 实测出 bash/skill 面的真实使用摩擦——即 (G-B) 的复审触发器；③ 上游 v5 的 8 个实现件与 v4 pin 的关系成文后，lift 逐件带署名推进，循既有先例。

---

**English version**: [`decisions.md`](./decisions.md)
