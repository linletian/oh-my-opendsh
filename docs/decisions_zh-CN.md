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

- **D#**（D1–D10）：已确认决策
- **R#**（R1–R6）：风险处置决策（接受现状 / 暂不处理）
- **O#**（O1–O8）：开放维度（其中 O2 / O4 已转为决策）
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

### 决策详情（完整措辞以此为准）

**D7 — DSH pin 策略：pin minor（`0.1.x`）**
0.x 阶段破坏性变更发生在 minor 升级（0.1→0.2）；pin minor 下破坏性升级只能经 `scripts/bump-dsh.sh` 显式进入（过全量 typecheck + test gate），patch 级修复自动吸收。不选 pin patch（rc 阶段 bugfix 频繁，锁死无益）、不跟 dev head（破坏性变更失控）。对应调研报告 §10.2 选项 A。

**D8 — 商业边界**
不做销售，也不做商业服务 / SaaS——彻底退出 SUL-1.0 的 "Use vs Distribute" 灰色地带（调研报告 §7.2）。

**D9 — Windows / WSL**
不纳入当前范围——不写跨平台 e2e；Windows 用户被阻塞到后续范围扩展。对应调研报告 §10.4 选项 B。

**D10 — 第三方署名**
尊重原作者、完整署名——hashline（概念源自 `oh-my-pi`）等在 `THIRD_PARTY_NOTICES.md` / README 致谢中完整标注（调研报告 §11.6）；具体措辞在实施时定。

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
| O1 | OMO 19 core 包 pin 策略 | 开放 | §10.1 |
| O2 | DSH 自身 pin 策略 | ✅ 已决 → D7 | §10.2 |
| O3 | npm 包命名 | 开放 | §10.3 |
| O4 | Windows 是否在范围 | ✅ 已决 → D9 | §10.4 |
| O5 | Telemetry 默认状态 | 开放 | §10.5 |
| O6 | OMO 上游 release 通知 | 开放 | §10.6 |
| O7 | 升级节奏 | 开放 | §10.7 |
| O8 | 能力面：MVP vs. follow-up 拆分 | 开放 | §10.8 |

## 决策历史

- **2026-08-16**：D1–D6 确认。
- **2026-08-19**：D7–D10、R1–R6 确认；全部决策记录从可行性报告（原 §10.1 / §5.4）迁入本文档，可行性报告自此定位为纯调研依据（其 §10 仅保留开放维度的选项分析）。

---

**English version**: [`decisions.md`](./decisions.md)
