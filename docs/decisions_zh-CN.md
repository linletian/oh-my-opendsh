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

- **D#**（D1–D13）：已确认决策
- **R#**（R1–R6）：风险处置决策（接受现状 / 暂不处理）
- **O#**（O1–O8）：开放维度（其中 O2 / O4 / O6 / O7 / O8 已转为决策）
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
| D6 | 升级方式：方案 B（dual license + 直接 import OMO 源码） | §7.3 / §7.4 |

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
采纳 [MVP PRD](./mvp-prd_zh-CN.md) 定义的 MVP 范围，关闭开放维度 O8（调研报告 §10.8）：最小骨架 = 新运行模式「协奏模式（Concerto Mode，标识 `concerto`）」+ 1 主 agent（omo-sisyphus）+ 1 subagent（omo-explore）+ 1 hook listener + 双模型路由（deepseek + pi-ai）；目标是验证假设 V1–V4（scratch plugin 冷启动 / per-subagent LLM 路由 / listener 翻译层 / subagent 限制链）并提前踩坑，不解决真实工程问题。OMO core 包 npm import 不并入 MVP（Q-2 选 B），为紧随其后的第一个 follow-up。完整范围、验收标准（AC-1～AC-9）与踩坑计划（P-1～P-9）以 MVP PRD 为准。

**D12 — License 白名单扩展：接受 MPL-2.0**
`scripts/verify-licenses` 白名单在调研报告 §4.7 草拟的 MIT / Apache-2.0 / BSD / ISC / SUL-1.0（仅 OMO）基础上增加 MPL-2.0。依据：MVP 实施 T3 实证 vite@8.2.1（vitest 4 硬依赖）传递依赖 lightningcss@1.33.0 为 MPL-2.0；MPL-2.0 是文件级弱 copyleft，业界普遍允许；lightningcss 仅为开发链构建工具（devDependencies 传递），本项目不分发。若未来 MPL-2.0 政策收紧，撤除脚本中对应单行并改 pin vite 版本。

## 风险处置（2026-08-19）

以下风险经用户确认按"接受现状 / 暂不处理"处置；风险本身的分析见调研报告"依据"列：

| # | 风险 | 处置 | 依据 |
|---|---|---|---|
| R1 | LLM adapter 工作量可能被低估 | 接受现状；维持分期策略（先 DeepSeek + OpenAI-compatible，其余按需补） | §5.1 |
| R2 | DSH 无 fallback chain | 接受现状；薄 retry wrapper（30–80 行 / plugin 实例）保留为可选缓解，未 commit | §12.5 |
| R3 | 16 周工作量估算无 buffer | 接受现状；按研究阶段估算使用，不作承诺（其依赖的 DSH pin 前提已确认为 D7） | §2.10 |
| R4 | "1 小时 rebase"依赖 listener 薄层假设 | 暂不处理；待项目启动后首轮 OMO bump 实证 | §4.5 |
| R5 | `args.prompt` 信任边界缺口 | 接受现状；与 OMO 同一假设——父 agent 为受信内部 LLM，不引入不可信输入源 | §13.7.1 |
| R6 | `<plan>` 信封非安全边界 | 接受现状 | §13.7.2 |

## 开放维度（待决策）

| # | 维度 | 状态 | 选项分析（调研报告） |
|---|---|---|---|
| O1 | OMO 19 core 包 pin 策略 | 开放（上游参照版本追踪已按 D13 落地——npm 仓库） | §10.1 |
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

---

**English version**: [`decisions.md`](./decisions.md)
