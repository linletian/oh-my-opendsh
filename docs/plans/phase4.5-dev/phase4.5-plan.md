# Phase 4.5 开发计划：DSH 0.2.x 运行时适配

> **本目录**：[`docs/plans/phase4.5-dev/`](./) —— ROADMAP **Phase 4.5**（DSH 0.2.x 运行时适配）的实施计划。
>
> **上游依据**：[ROADMAP（中文）](../../roadmap_zh-CN.md) §4 Phase 4.5 · [dsh 0.2.0-rc.2 复核报告](../../dsh-0.2.0-rc.2-review_zh-CN.md)（**面权威**——每个适配点的证据与行号以它为准，本文不复制其论证）· [决策 D7](../../decisions_zh-CN.md)（pin 刻意升级机制）· [决策记录 2026-10-02 条目](../../decisions_zh-CN.md) · [mvp-prd §12](../../mvp-prd_zh-CN.md)（pin bump 跟踪项）
>
> **配套文档**：[任务清单](./phase4.5-tasks.md)
>
> **状态**：🚧 立项（2026-10-02，分支 `feature/phase4.5-dev`，基线 `develop` = 98d5e10）。逐任务证据与退出标准核对见[任务清单](./phase4.5-tasks.md)。
>
> **修订记录**：
>
> - **2026-10-04 仲裁修订（T1 Q-2/Q-3/Q-4 实测落地，WP-2 开工前成文）**——本条**改前提不改目标**：把三处已被实测推翻的表述换成实测结论，全部依据在 `.omo/evidence/p45t1/Q2-yaml-parsing.md` 与 `Q3Q4-register-contract.md`。① **§4.3「引入 `yaml` 依赖」前提作废** → 改为**零新增依赖**，复用 `scripts/doctor-lite.mjs` 已有的「定位已安装 dsh 的 node_modules → 动态 import `js-yaml`」路径（`JSON_SCHEMA` + `tag:yaml.org,2002:js` 真 tag = loader 方言本身）；连带 **§4.9**（白名单零新增、`checked` 恒 56、pnpm-lock 无变更）、**§5 DoD-e**、**§8 交付物清单**三处同步。作废依据三条：包未安装不可解析（`ERR_MODULE_NOT_FOUND`，lockfile 仅 `vite@8.2.1` 的 optional peer 声明无解析条目）/ license 实为 **ISC** 而非原文「MIT」/ 依赖安装链**未端到端验证**。② **「register 时机」降级为「调用点约束」**（§4.3）：实测真相是**能不能拿到句柄的二值问题**，apply() 同步段 100% 拿不到、`ctx.inject(['agentPresets'])` 回调 100% 拿得到，register 本体 4–9ms；**不得设计等待/重试逻辑**。③ **验收口径最大的一条改动**：「注册成功」的唯一证据是**回读 roster 断言 `broken` 缺席**，不是「register 不抛」——mount 失败（模块名拼错/`disabled` 承载写错）**绝不 reject**，只写 `broken`，且 host 的 `logger.warn` 在捕获到的输出流里**没有出现**；omo-agents 必须自己打 `broken` 的 boot marker。④ **Service.init + yield 候选：不采用**（§4.3 明文裁定）——`ctx.inject` 回调与 `async* [Service.init]` 在可用性上等价且已实测，改 Service class 形态要付出 `boot-markers.test.ts` 的 `apply()` harness 全量改造成本。⑤ 三条断言纪律随附：`!!js` 载体断言（`typeof row.disabled === 'string'` 即 fail，`entryListProblem` 不是安全网）/ roster 首读可能为空（probe 不得只 grep 前缀）/ `isDefault` 只在 `remoteExportList()` 上（走 `list()` 断言会永远失败）。
>
> - **2026-10-04 实施期修订（T2 实测，双评审裁决后成文）**——本条只订正引用与实施期新出现的约束，**不改任何结论**（DoD-d）。① **§4.2 引用订正**：background-notification 那条的 `types.ts:194-217` → **`types.ts:206-218`**（评审 A 判 MAJOR：实际 settled 分支是 206-218，字段在 :217；原文的 194-217 起止双双越界——既盖不住 `:217` 的字段，又跨进了它上方的其它声明）。**这条错误在实施期被复现过一次**：编码方把同一块引用写成 `228-236`，而同一文件另一处把 `228-237` 判给 `JobEventFilter`——两者数值重叠、指向两个不同声明，构成可秒证的自相矛盾（原 MAJOR 即此）。② **§4.1 探针表的落点约束（本阶段新增，非计划期设想）**：共享的 `dshRuntimeShape()` 落在 `patches/omo-dsh/omo-hooks/src/` **根**（不落 `src/hooks/`）——实测 c13 会把 `src/hooks/` 下无 manifest id 的 `.ts` 判 orphan（`verify-concerto-static.mjs:828-831`）、c21 由同一目录推导 NOTICES 计数；而 `src/` 根不受这两者枚举，**代价**是新增 `src/` 根文件必须登记进 `tests/omo-hooks/strip-only.test.ts` 的双向等值 roster，否则门 2 红。③ **ADR-2 的实施口径**：Q5 实测 host-plane 上 `'scope'` ≡ `'all'`（各 30 行/10 job），但 0.1.5↔0.2.0 的**直接投递集合比对未测成**（Q5 §4.1：本机无 0.1.5 二进制 + 0.2.0 `src/` 里 `onJobDone` 已不存在）⇒ 取计划书自带的兜底 `{owners:'all'}`，代码注释须标注「源码等价性论证，非实测等式」。④ **ADR-3 的语义差**：0.1.5 的 `reported` 覆盖「kill/read/wait/teardown 已收走」，0.2.x 的 `awaited` 只覆盖「结算释放了活 `wait()`」——0.2.x 上「仅仅被读过」的 job **会**弹通知（字段已删，属被迫放宽，必须成文而非隐藏）。
> - **2026-10-02 环境现实修订（工程师反馈，实测成立）**：本机二进制 = dsh 0.2.0-rc.2，而 `scripts/ci-local.sh` 的门 3（e2e）/门 4（doctor-lite）/门 8（proofs）**消费环境 dsh 二进制**（drive.mjs 沙箱 boot / `dsh --version` 对 D7 / prove-*.mjs boot），「0.1.5-rc.1 pin 下退出 0 的基线快照」在本机不成立——原 PRE-1 拆分重写：PRE-1a = 0.1.5 侧基线取 **develop 最近 CI 绿记录**（CI pin 本来在 0.1.5-rc.1，权威侧）；PRE-1b = 本机 0.2.x 跑 ci-local，判定改为**红的位置与形态成文记录**（门 3/4/8 的红即 P0 的 before 证据，与 PRE-5 互为表里）；PRE-1c（可选）= throwaway-prefix 装 0.1.5-rc.1 + `PATH=<prefix>/bin:$PATH`（dsh-0.1.5-rc.1-review 先例），作为 T11 的本地 0.1.5 腿机制。§3 双运行时行与 §4.1 同步补「环境现实」注记；T11 补机制注记（0.1.5 侧 = CI 或 prefix 腿，证据文件注明实际通道与二进制来源）。
>
> - **2026-10-02 计划期评审修复（第 3 轮）**（评审：[`phase4.5-review-3.md`](./phase4.5-review-3.md)——复审确认第 2 轮 5 项落实正确、引用行号实质精确、门禁全绿；新发现 3 项全部采纳，无阻塞）——R3-I1：Q-4 裁定维度补**形态转换成本的具体载体**（`boot-markers.test.ts` 的 `apply()` 接线 harness——604 行 / 32 个 `it`，`:52` import、`:441` `Parameters<typeof apply>[0]` 推导、`:487` P2-T16 describe 逐行断言；非单行 import 变更）；R3-N1：§3 ③ 标「R2-B1 裁定：保留不动」，重心序列三处（§3/§4.6 表头/§7 WP-6）统一为「门 3 > 门 8 > 门 2（**门 2 仅增量**）」；R3-N2：§4.6 门 2 行增量清单补「`omo-agents` 不在被注册组合行集内」结构断言（与 R-9/T5 同一断言成对）；`registry.ts:299-301` → `:300-301`（299 为 JSDoc 尾行，§4.3 与 R-9 两处规范引用修正，修订记录中的历史引用不动）。
>
> - **2026-10-02 计划期评审修复（第 2 轮）**（评审：[`phase4.5-review-2.md`](./phase4.5-review-2.md)——复审确认第 1 轮 14 项采纳落实正确、2 项驳回成立（评审方认错）；修复引入的新问题 **5 项全部采纳**）——R2-B1：T6/§4.6 门 2 的「单测改写为 read 文档断言」**不可执行**（`tests/omo-agents/*.test.ts` 纯 vitest 无 RPC 能力，实测 grep 零命中）且会删掉 B4 写盘契约的唯一自动化保护——改「单测**保持不动 + 仅新增** `renderConcertoComposition()` 纯函数用例」，「read 文档锚点」断言归位运行时面（probe/drive.mjs）；R2-I1：§4.3 时机约束的**理由更正**——`ctx.inject` = cordis `plugin()`（`registry.ts:299-301`，创建自己的 fiber），「异步触发/不在 activation 路径」两半均不成立，安全性依据改为**结构性不变量**（`omo-agents` 不在被注册组合行集内，挂仓根 `cordis.yml:36-38` 独立 insert 行），R-9 处置列与 Q-3⑥ 判据同步改写，Q-4 补 **Service.init + yield 候选**（上游 `dsh-agent-preset` 同形态，T1 实测裁定）；R2-N1：§8 三行同步（证据行「跨段迁移」/ 断言门迁移行删 doctor-lite、静态门改「随模板面变化」/ 协奏注册行补 `renderConcertoComposition()` 与两个单测文件）；R2-N2：「双模更正」措辞随 R2-B1 删除；R2-N3：评审方确认门 7 不校验 markdown 相对链接，删除评审文件不破门（review-1 §8.4 判断成立，无需改动）。**附带正面依据（评审 R2 §2.3 实证，已写入 §4.4）**：安装器 (A) 的三个关键前提全部有上游先例（registry 行 `dsh-web-app/cordis.patch.yml:561-566` 自带、profile patch last-write-wins-per-id 见 `standard.patch.yml` 头注释、`!!js` 见纪律④），且官方 `preset-standard` 行的整体形状与 (A) 产物几乎逐字相同——(A) 是**镜像上游写法**，为 fork 裁定「不默认滑入 (B)」的最强正面依据。
>
> - **2026-10-02 计划期评审修复（第 1 轮）**（评审：[`phase4.5-review-1.md`](./phase4.5-review-1.md)，16 项中 **14 项采纳 / 2 项经证据驳回**）——B1：`agentPresets/read` 经实证**双运行时均在场**（0.1.5 `agent-presets/src/index.ts:512` 带 `trust`；0.2.0 `agent-preset-registry/src/index.ts:193` 不带），§4.3 改「单一断言面无需双模」并禁止落回物化的兜底（违反金丝雀纪律），`trust` 消亡更正为**两处同删**（list 行 + read 文档）；B2：物化断言生态改可数清单（probe 60 行 / drive 5 调用点 / 单测 12 处），§4.6 门迁移重心重排为**门 3 > 门 8 > 门 2**（门 6 读仓内模板低风险）；B3：D7 权威落点更正为 `doctor-lite-core.ts:15-17,44`（bump-dsh.sh `apply_bump` 不覆盖，:67-68），交付物与 T12 同步补测试夹具 `doctor-lite.test.ts:39-50`；B4：§4.3 删「不再写盘」选项（与门 4 的 `syncConcertoPreset(temp)` 写盘契约互斥，doctor-lite.mjs:602），改抽 `renderConcertoComposition(): string` 纯函数 + 保留写盘；I1：矩阵行处理改「跨段迁移 + `{our, date, evidence}` 字段集 + release gate 前置」（§4.7/§5(b)）；I3：R-2 收窄（isolate 为标准机制排除、嵌套 group 设计内支持），新增 R-9「register 调用时机/激活死锁」（registry :126-127）与 Q-3 第 ⑥ 问；I4：§4.1 探针表收敛为共享 `dshRuntimeShape()` 身份标记（注释写明非能力探针）+ §4.2 一致性断言；I7：证据纪律改「适配任务 = 受影响门 + 场景级 0.2.x 记录，全链双运行时由 T10/T11 承载」（任务书头部）；I8：新增 R-10「T1 钉测超期或受阻」+ Q 改逐 Q 独立交付；I9：§7 加 ROADMAP §7 对账句（WP-6/WP-7 为 pin 纪律新增的证据链成本）+ 任务级小时数对齐（合计 ≈8 人日）；N1：`RosterEntry.trust` 处置交 T1 Q-3 附项 b 裁定；N2：PASS banner 重写不得削弱否定断言句（§4.6 门 8 行）；N3：`commandExecute` 传输硬绑定确认挂 Q-8 附项。**驳回 2 项**：I2「`!!js` 在 patch `config:` 大概率不可行」——官方 `presets/standard.patch.yml:22,25` 在 `config.plugins` 内即写 `disabled: !!js process.platform …` 且 `dsh-agent-preset` 以 `EntryGroup.key` 保留子表达式，形态上游自证可行（评审的布尔字面量方案记为实施期可选优化）；I5「T7 缺席 T11 依赖」——原文「P4.5-T2 … P4.5-T8」区间含 T7，系误读，T11 依赖仍按建议精神改为显式枚举消除歧义。

---

## 1. 目标

**让 overlay——协奏 preset、hooks、commands——在已发布的 dsh 0.2.x 线上（复核基线 `0.2.0-rc.2`）完整可用、全门转绿，然后翻 D7 pin。本阶段结项前，CI pin 保持 `0.1.5-rc.1`；0.2.x 是矩阵里已登记的 `untested` 行，不是受支持的运行时。**

ROADMAP §4 Phase 4.5 原文的退出标准（逐条落到 §5 的证据映射）：

- (a) L1 全链在 pin 的 0.2.x 运行时上转绿——单测、doctor-lite（含名册语义闸）、`verify-concerto-static`、`check-docs-consistency`、e2e 驱动、`run-proofs.sh`；
- (b) L2 真机验证在 0.2.x 重跑并产新证据文件，0.2.x 矩阵行以 `tested` 登记；
- (c) roster 重新出现 `concerto`，且一次脚本化委派往返真实落在它上面；
- (d) `/stop-continuation` 级联 e2e 证明 job 确实被取消（静默跳过的金丝雀）；
- (e) 安装器线的 0.2.x 状态有了结——全新安装能注册出 `concerto`，或该线被重定范围并记录理由；
- (f) D7 pin 的翻转与绿色证据同一次变更交付。

本阶段的成功标志不是"能 boot"，而是：**两个 P0 静默断裂面各自有了会叫的金丝雀——协奏在 0.2.x 的 roster 里真实出现且可委派、`/stop-continuation` 真实取消 job——全套既有门在新运行时上原样转绿，且 pin 翻转与证据同 commit 交付。**

## 2. 不可协商约束

本阶段受 ROADMAP §2/§3 同等约束，另加本阶段特有的五条，全部同等效力：

| 约束 | 来源 | 本阶段的具体含义 |
|---|---|---|
| **不移植新 OMO 能力** | ROADMAP Phase 4.5「明确不在范围」 | 本阶段只动**适配**——凡是"顺便把某 OMO 能力补上"的冲动一律记 deferred 转 Phase 5+；`team` 关键词、Team Mode、编辑面的既有归属不动 |
| **不采用超出适配所需的 0.2.x 特性** | 同上 | 0.2.x 的新能力（ declarative preset 之外的 API 新面、`developer/message` 等）只有在适配点**必须**时才消费；每个候选日后单独过"DSH 原生优先"检查 |
| **OMO 侧零变动** | D14 | 本阶段与 OMO 基线无关——vendored 内容、署名、NOTICES 一律不碰；`verify-licenses` 的 `checked` 计数预期**不变**（唯一例外：§4.3 的 YAML 解析依赖若引入新 npm 包，走 D12 先例过 license 白名单） |
| **pin 纪律（D7）** | 决策 D7 / PRD §12 | `ci.yml` 的 `DSH_VERSION` 与 `--before` 截止在本阶段**最后**一个任务翻；中途任何 commit 不得动它；pin 翻转与绿色证据同 commit（退出标准 f） |
| **静默失效类必配金丝雀** | 复核 §7 | 每个适配点的验收断言必须能**区分**「修好了」与「静默降级了」——不接受 boot 绿作为证据；优先复用既有的具名降级 marker（`degraded: true`、`alreadyFinishedJobIds` 等）做反向断言 |
| **研究/实施分离** | 两轮评审确立的惯例 | 复核报告是面权威（研究），本目录是实施计划；T1 复核任务只**再验证**复核的引用（对执行时的 0.2.x rc），不重开分析 |
| **门只加严不放松** | Phase 1–4 惯例 | 8 门链全绿维持；适配如需改门，只能是断言随面迁移（如 roster 断言从 `trust:user` 改指 registry），不得降低强度；**不加新门、不绕过旧门** |
| **双语同步** | docs 惯例 | 交付文档（README/CHANGELOG/decisions/review 订正）en + zh 同 commit；本目录为纯中文工作文档（plans 惯例） |

## 3. 现状盘点（立项基线）

| 构件 | 现状 | 本阶段的影响面 |
|---|---|---|
| **dsh 双运行时** | 本机已安装 `@deepseek-ai/dsh@0.2.0-rc.2`（`dsh --version` 实测）；CI pin `0.1.5-rc.1`（`ci.yml:102` + `--before` 截止，d09 门钉死）；本地镜像 `~/GithubRepo/deepseek-harness`（两 tag 只读可用）；**环境现实（工程师反馈实测）**：`scripts/ci-local.sh` 的**门 3（e2e）/门 4（doctor-lite）/门 8（proofs）消费环境 dsh 二进制**（drive.mjs 沙箱 boot / `dsh --version` 对 D7 / prove-*.mjs boot），门 1/2/5/6/7 不碰——本机二进制 = 0.2.x 单腿 | 开发期 = **双运行时并行**：本机沙箱跑 0.2.0-rc.2，CI 跑 0.1.5-rc.1——§4.1 的双模策略由此强制；0.1.5 侧证据 = **CI（权威）** + 可选 throwaway-prefix 本机腿（`npm i -g --prefix <dir> @deepseek-ai/dsh@0.1.5-rc.1 --before=<D7 截止>`，`PATH=<dir>/bin:$PATH`——dsh-0.1.5-rc.1-review 先例，任务书 PRE-1c） |
| **复核报告（面权威）** | `docs/dsh-0.2.0-rc.2-review{,_zh-CN}.md` 已合并（PR #11）：两个 P0（preset 重架构、jobs 重写）+ 一个 P1（日志 v4）+ P2 登记项 + §8 范围草估；13 处 `kind:'plugin'` 分解已更正为 **10 代码 + 3 注释、无运行时过滤器**（commit `1803790`） | 全部适配点的枚举与证据；T1 的再验证清单 = 其 tag 级引用 |
| **三个插件** | `omo-agents`（名册 + 协奏 preset 物化 `syncConcertoPreset` → `$DSH_HOME/.agent-presets/concerto/`）、`omo-hooks`（15 hook 条目 + stop-continuation-guard 服务 + ulw-execute/live-state）、`omo-commands`（6 manifest 行：5 ported + 1 pending） | P0-1 触 omo-agents；P0-2 触 omo-hooks 三文件；omo-commands 本身无 jobs/preset 直接触点（其 `/stop-continuation` 经跨插件服务间接受益于 guard 修复） |
| **jobs 三触点（P0-2）** | `background-notification.ts`（`onJobDone` 探测 + 预留 pull 降级路径 + `reported` 读取）、`stop-continuation-guard.ts`（caller `{id}` 构造 :264 + `ownerSession` 围栏）、`ulw-execute/live-state.ts:293`（`start({owner: agent, run: () => ...})` + try/catch 吞降级） | 全部要改；**每一个都有既有的静默失效形态**，适配必须保持降级 marker 可区分（§2 金丝雀约束） |
| **两条交付线（P0-1）** | 插件线（`syncConcertoPreset` 物化 + 运行时探测）与安装器线（`scripts/install-concerto.sh:24,42-43` curl 静态 preset 落 `$DSH_HOME/.agent-presets/concerto/`，omo-agents-current 系 1+1 preset）；`compat.yaml` tested 注记与 PRD §12 登记两线 | 插件线迁 `agentPresets.register()`（§4.3）；安装器线迁声明式 `PresetDefinition`（§4.4）或重定范围 |
| **e2e/观测基础设施** | `tests/e2e/drive.mjs`（33 默认场景；v3 信封伪造 9+ 处；sandbox persistence overlay `compression: none` :2015）、`scripts/smoke-real.mjs`（文件名正则已版本自适应 :785；`compression: none` :524）、`scripts/prove-*.mjs`（日志内容断言）、`scripts/concerto-mode-probe.sh`（`trust:user` 词汇） | P1（v4 信封）与 P0-1 的断言迁移面。**物化断言生态（可数清单，评审 R1-B2 实测）**：① probe **71 行**引用 `$materialized`/`.agent-presets`（sentinel 残留反断言、`prefix: \| -`、persona 章节 marker、explore 行 id/toolName、toolFilter grep、喂 dsh schema 校验器 :583-584、`trust` grep :976-977）；② drive.mjs `materializedCompositionPath` **6 个调用点**（:1396/:2673/:2697/:6933/:9985/:14763，定义 :2591；T6 新增第 6 个 = read 面的写面期望值派生点）；③ 单测 `concerto-preset.test.ts` **12 处** `.agent-presets`（含路径契约 :171-173）+ `roster-composition.test.ts:81` **与 T5 新增的 :300**（R2-B1 裁定：**保留不动**——写盘契约的唯一自动化保护，仅新增纯函数用例）。**门 6 低风险**：c01–c09 读仓内模板 `omo-agents-current/preset/agent.cordis.yml`（`verify-concerto-static.mjs:106-108`），不读物化产物——迁移重心在门 3 > 门 8 > 门 2（**门 2 仅增量**，R3-N1） |
| **门链** | `scripts/ci-local.sh` 8 门（基线快照：门 2 = 1366 测试、门 6 = 31 断言 c01–c22、门 7 d01–d09、门 8 = proofs）；doctor-lite 名册语义闸读**渲染后**组合 | 全绿维持；门不新增，断言随面迁移（§4.6） |
| **pin 机器** | `scripts/bump-dsh.sh`（safe_point 时间序、`apply_bump` 双 workflow 原子改、`family_verdict` 锁文件族判定）、`doctor-lite.mjs:211` 的 D7 semver 断言（"pinned 0.1.x" 字样）、`release.sh`/probe 的 0.1.x 假设注释 | §4.7：bump-dsh.sh 是既定工具，本阶段只在其 0.1.x 假设处做最小适配 |
| **0.2.x 已核实的稳定面** | cordis 三文件零 diff；15 事件全在；`agent.inject()`/`goals.pause`/`sessionProjections`/`commands`/`skills`/`subagents.start` 签名不变；`tool-subagent` Config 全字段保留；Web 传输与 RPC 形态不变；`--patch`/`insert:` 语义保持（applyEntryPatches 重构但 P-8 warn 点已核） | 这些面**不得**出现在适配 diff 里——出现即说明范围蔓延 |

## 4. 方案设计

### 4.1 总体策略：双运行时自适应期 → pin 翻转收口

**核心决策**：本阶段全程保持**同一代码在 0.1.5-rc.1 与 0.2.x 上都可工作**（双模），pin 翻转是最后一个任务（退出标准 f）。理由：

- CI pin 在阶段中途不动（§2 D7 约束）——若适配代码只能在 0.2.x 工作，特性分支的 CI（0.1.5-rc.1）自第一个适配 commit 起全程红，违背「门链全绿维持」；
- 本仓既有传统就是**能力探测而非版本判断**：`--no-open` 的 feature-probe（cold-start:103-116）、`isSessionLogName` 的版本自适应正则、concerto-probe 的 transport-adaptive T9、`background-notification` 的 `typeof jobs.onJobDone === 'function'` 三态探测——双模是既有模式的推广，不是新发明；
- 双模的探针本身构成「0.1.5 上没有静默退化」的证据：0.1.5 走旧路径（行为不变），0.2.x 走新路径（修复生效），两条路径各自有断言。

**环境现实（工程师反馈，2026-10-02 实测成文）**：双模策略的证据通道受本机安装约束——`scripts/ci-local.sh` 的**门 3（e2e）/门 4（doctor-lite）/门 8（proofs）消费环境 dsh 二进制**（drive.mjs 沙箱 boot / `dsh --version` 对 D7 / prove-*.mjs boot），门 1/2/5/6/7 不碰。本机安装 = 0.2.x 单腿，故：① 0.1.5 侧证据 = **CI（权威，pin 本来在 0.1.5-rc.1）** + 可选 throwaway-prefix 本机腿（PRE-1c）；② 适配完成前本机跑 ci-local 的红（门 3/4/8）**不是异常**——是 P0 断裂的「before」证据（PRE-1b/PRE-5 承载）；③ 任何双侧门链记录必须注明 0.1.5 侧实际走的通道与二进制来源（T11 机制注记）。

**每个适配点的探针形态**（评审 R1-I4 收敛）：jobs 三触点共用一个 **`dshRuntimeShape(): 'v1' | 'v2'`** 判定函数（`jobs.events !== undefined` → `'v2'`）——它是**运行时身份标记（runtime-identity marker）而非能力探针**：jobs 面的 0.1.5/0.2.0 重写是整包的（caller/view/events/start 同代切换），不存在「有 events 无新 caller」的中间态，故三处共用同一信号、同一切换点；注释必须写明其身份标记性质，防止日后被误当能力探针扩散。非 jobs 面各点用各自的能力探针：

| 适配点 | 探针 | 0.1.5 路径（保持） | 0.2.x 路径（新增） |
|---|---|---|---|
| background-notification | `dshRuntimeShape()`（v2 优先 `events.subscribe`，v1 `onJobDone`，再回退既有 pull 降级） | `onJobDone` 推送 + pull 降级 | `events.subscribe` + `settled.awaited` 去重 |
| stop-continuation-guard | `dshRuntimeShape()`（判定 caller/字段形状） | caller `{id: sessionId}` + `ownerSession` 围栏 | caller `sessionId` 字符串 + `owner` 围栏 |
| live-state | `dshRuntimeShape()`（判定 `start()` spec 形状——分叉点虽在 start，但与整包重写同代，共用身份标记而非另立信号） | `JobStart{owner: agent, run: () => JobHooks}` | `JobSpec{owner: sessionId, run(job: JobHandle)}`，outcome 读 `result ?? output` |
| 协奏 preset | `typeof agentPresets.register === 'function'`（`ctx.inject(['agentPresets'])` 回调内判定） | `syncConcertoPreset` 物化文件 | 内存渲染 + `register()` + 持有 disposer |
| drive.mjs 伪造夹具 | 按沙箱实际 boot 的运行时（会话日志 header 的 format 版本）选择信封形状 | v3 信封（现状） | v4 信封（`role:'tool'` + 顶层 `toolCallId`/`isError`） |

**pin 翻转后双模路径的去留**：默认**保留探针与双路径**（探测成本近零，且是本仓的可观测性传统），除非某路径在 0.2.x 上结构性不可达（如文件发现已删除，0.2.x 的物化文件路径成为死代码）——死路径在 pin 翻转 commit 一并删除并记 CHANGELOG。逐点裁定记任务清单。

### 4.2 `ctx.jobs` 适配（P0-2，复核 §3 为权威）

- **background-notification.ts**：订阅面改为三级探测（§4.1 表）；`settled` 事件的 `awaited` 布尔替代被删的 `reported` 去重语义（0.2.0 `types.ts:206-218`——整个 settled 分支；字段本身在 `:217`，其文档块 `:210-216`）；`{owners:'scope'}` 的投递范围必须与 0.1.5 `onJobDone` 的实际投递集合一致（**T1 Q-5 钉测**——host-plane 插件的 'scope' 听到哪些 owner；若不等价，用 `{owners:'all'}` 并记录理由）；subscribe 返回的 disposer 按 cordis effect 纪律持有。
- **stop-continuation-guard.ts**：caller 构造（:264）按探针分叉；`owner`/`ownerSession` 双读（`view.owner ?? view.ownerSession`，结构类型同时声明两键为可选）；`kill` 的 `already-finished` 判定不变；`StopContinuationCallerLike` 接口保留为 0.1.5 分支的形状，0.2.x 分支直接用 `SessionId` 字符串；级联的会话围栏语义不变（无主 job 跳过）。
- **live-state.ts**：`start()` 的 spec 按探针分叉；0.2.x 的 `owner` 要求是**当前注册在册的活 Agent 的 SessionId**（`JobSpec.owner` 文档，与 0.1.5 的 preflight 同源）——既有 try/catch 降级纪律保留，但 0.2.x 分支必须把「preflight 拒绝」与「真实启动失败」在日志上区分开（复核 §3.2-3 的「日志依旧干净」正是病灶）；outcome 读 `result ?? output`。
- **单测**：三文件各自的结构式 mock 按双形状参数化（0.1.5 形状 / 0.2.0 形状各一轮）；**一致性断言**（评审 R1-I4）：三个触点在同一 mock 下取到同一 `dshRuntimeShape()` 值；金丝雀断言 = 「0.2.0 形状下，目标行为真实发生（通知推送/级联取消/job 启动），而非静默降级」。

### 4.3 协奏 preset 注册迁移（P0-1 插件线，复核 §2 为权威）

- **出口改造（`concerto-preset.ts`）**：sentinel 渲染管线原样保留（29 个 sentinel census 与防残留闸不动）。抽出纯函数 **`renderConcertoComposition(): string`**（渲染后的 YAML 文本）；**`syncConcertoPreset` 的写盘契约保留**——doctor-lite.mjs:602 主动调 `syncConcertoPreset(temp)` 并读它写出的 `agent.cordis.yml`（门 4 的输入面与运行时无关，评审 R1-B4 实证），故「不再写盘」不是可选项（写盘成本近零，且门 4 会 ENOENT）。探针命中 0.2.x 时，把**同一个字符串**解析为对象再 `register()`。**解析路径（T1 Q-2 定案，2026-10-04 仲裁修订——原「引入 `yaml` 依赖」前提作废）**：**零新增 npm 依赖**——复用本仓既有的「定位已安装 dsh 的 `node_modules` → 动态 import 其 `js-yaml`」路径（`scripts/doctor-lite.mjs` 的 `resolveDshNodeModules` + `imp` + `makeJsExprType` 三件套，方言 = `JSON_SCHEMA.extend(Tag('tag:yaml.org,2002:js'))`，即 loader 方言本身）；证据 = `.omo/evidence/p45t1/Q2-yaml-parsing.md` §2/§4（往返实测：`!!js` 真 tag → `{__jsExpr}`，嵌套 group 完好）。**`yaml` 候选作废的三条实测依据**：① 该包在本仓**未安装、不可解析**（根目录 `import('yaml')` → `ERR_MODULE_NOT_FOUND`；lockfile 里仅 `vite@8.2.1` 的 optional peer 声明，**无解析条目**）；② 它的 license 是 **ISC** 而非原文所写的「MIT 预期直接过」；③ 引入它需要一条**未端到端验证**的机制链（`dsh plugin add` → `runProfilePnpm` → `createRequire` 解析）。**否决「自造迷你解析器」维持**（组合含 `!!js` 真 tag、嵌套 group、块标量）；**否决自造解析器的新证据**：不注册全限定 tag `tag:yaml.org,2002:js` 的解析器**连官方 preset 都跑不了**（短写 `!js` 是硬失败 `unknown tag`，裸字符串 `"!!js x"` 则静默停留为字符串并在下游被判成禁用行）。**代价登记**：从别人的 `node_modules` 动态 import 是**脆弱耦合**（绑死 dsh 内部打包布局）——如实登记为已知风险，不在本阶段消除。**`!!js` 表达式在 `PresetDefinition.plugins` 中按 loader 惯例保留为表达式**（`dsh-agent-preset` 以 `EntryGroup.key` 保留子表达式至子插件激活；官方 `presets/standard.patch.yml:22,25` 在 `config.plugins` 内就写 `disabled: !!js process.platform …`——此形态上游自证可行，评审 R1-I2 的「大概率不可行」经此证伪）。
- **YAML 模板文件保留为单一事实源**：不把组合改写为 TS 结构——既有锚点生态（drive.mjs 5 调用点、doctor-lite 渲染组合校验、verify-concerto-static 读仓内模板）全部读这份 YAML/其渲染产物，改写会把适配阶段拖成生态重写；渲染 → 解析的双路径由「渲染产物与模板锚点逐字一致」的既有测试继续钉死。
- **register() 调用点约束（评审 R1-I3 实证，registry `index.ts:126-127` 文档串明写；R2-I1 更正理由；2026-10-04 仲裁按 T1 Q-3/Q-4 实测降级为「调用点」而非「时机」）**：audit 诊断会等 Loader 树 settle 才报告——**调用方不得在 Host 行自身的激活路径内调 `register()`**。安全性依据是一条**结构性不变量**，不是同步性假设：**`omo-agents` 不是它所注册的 `concerto` preset 的行**——组合 `concerto/agent.cordis.yml` 的行集里没有 `omo-agents`（它挂在仓根 `cordis.yml:36-38` 的独立 insert 行），故 diagnostic audit 等待的「Host Loader 树 settle」不会等到调用方自己头上。防误读注（评审 R2-I1 实证 `cordis/src/registry.ts:300-301`）：`ctx.inject(deps, cb)` **就是** `plugin()`——它创建自己的 fiber（一次新的插件激活），同步调用、不保证回调延后；因此「inject 回调异步、不在 activation 路径上」的说法**不成立**，安全性与同步性无关。该不变量可从组合结构直接核对，且结构变化（如日后为自包含把 `omo-agents` 塞进组合）会立刻失效报警——T5 的做法段与单测必须显式约束此点（「激活死锁」见 R-9）。**Q-4 实测把「时机」降级为「调用点」（`.omo/evidence/p45t1/Q3Q4-register-contract.md` §3.1/§3.1b/§3.2/§5.1，仲裁采纳）**：真相是**能不能拿到 `agentPresets` 句柄的二值问题，不是时序窗口问题**——apply() 同步段取句柄 100% 拿不到（行内 `inject: [...]` 声明已被源码排除），`ctx.inject(['agentPresets'], cb)` 回调内 100% 拿得到，register 本体 4–9ms；`ctx.get(name, false)` 与 apply 之后异步取句柄两条路径**未测**，既不作为许可也不作为禁止。**不得为此设计等待/重试逻辑**——那会引入现在并不存在的复杂度。
- **「注册成功」的唯一证据是回读，不是「不抛」（Q-3 §2.4/§5.2，仲裁采纳——这是本条对验收口径的最大改动）**：`register()` **只**对空 `id` 与重复 `id` reject；mount 失败（模块名拼错、`disabled` 承载写错、group 形状不合法）**绝不 reject**，只写进 roster 的 `broken` 字段，而 host 的 `logger.warn` 在本次捕获的 stdout/stderr 流里**没有出现**（证据边界：本实验未读 logger level 配置、未定位落盘 sink，故只能说「不在这条流里」，不可推广为「dsh 就是 silent-on-console」）。因此：① `try { await register(...) } catch {}` **不能**当验收证据；② T5 单测与真机证据**必须**在注册后回读 roster，断言目标 id 的 `broken` **缺席**；③ **omo-agents 必须自己**把 `broken` 打成 boot marker（不能指望宿主替它喊）；④ 计划原本设想的「mount 失败静默」整类风险在此显式登记为验收项（若模块名拼错，整个 concerto mode 会静默消失）。
- **`!!js` 的载体形态（Q-3 §4.3，仲裁采纳为断言纪律）**：`!!js` 是**反序列化产物**而非字符串前缀语法——YAML 真 tag 解析出 `{ __jsExpr: string }`；裸字符串 `"!!js …"` 会原样停留为字符串，下游 `isJsExpr` 判 false 后落到 `Boolean(...)`，该行**永久禁用且零告警**（且 `entryListProblem` 不是安全网：它只校验 `name` 非空与 group 的 `config` 是数组，对 `disabled`/`inject`/`isolate`/`intercept`/`config` 内容一概不看）。本仓走 YAML 模板 + 真 tag 路径，天然规避；但**仍要求**加断言：解析产物中凡 `typeof row.disabled === 'string'` 即 fail。
- **roster 首读可能为空（Q-3 §1.4，仲裁采纳）**：inject 触发瞬间 `list()` 可能返回 `[]`，下一 microtask 才有条目（两次 boot 一致）⇒ **任何「读 roster 再决策」的逻辑必须 settle 后重读**，probe 的 roster marker 断言**不得只 grep 前缀**（空串也会命中前缀）——归 T6 落地。
- **disposer 持有**：`register()` 返回 `Promise<() => Promise<void>>`（registry :80）；在 cordis effect/dispose 路径释放（**T1 Q-4 钉测接线先例**——plain `apply()` 插件的 effect 挂法；HMR/重载泄漏是本项的验收点）。**2026-10-04 仲裁修订（持有方式）**：原写「插件在**模块级槽位**持有」——**字面作废**。经一手源码核实（`dsh@rc.2`：`registry.ts:300-302` 的 `ctx.inject(deps, cb)` 即 `plugin()` → `fiber.ts:259` 回调返回值成为 `effect` → `:373-374` async 分支 `effect.then(safeCollect)` → `:361` `runner.collect` → `:231` `this._disposables.push` → `:265-297` 随子 fiber dispose 释放），**由回调 `return` disposer 让 cordis 自动收集**是更稳的形态（自动 vs 人眼负担），T5 即按此实现。**代价如实登记**：`inject` 官方签名是 `Plugin.Function<void>`（`registry.ts:300`），返回 disposer 是**运行期可行、类型层越界**的用法，依赖的是「function plugin 返回值按 effect 处理」这一**实现约定**（`fiber.ts:366-374` 明写）——**不是 API 契约**。**Q-4 §3.4/§5.6 补充**：disposer **幂等、arity=0、名为 `unregister`**，可直接交给 cordis 的 dispose 通道，**不需要额外 once 守卫**（重复 dispose 实测 0ms）。
- **Service.init + yield 候选的裁定（T1 Q-4，仲裁 2026-10-04 裁定：不采用）**：任务书原写「Q-4 的 Service.init + yield 候选若经 T1 裁定采用，本任务一并落地形态转换」。Q-4 实证结论 = `ctx.inject(['agentPresets'], cb)` 回调与 `async* [Service.init]` **在可用性上等价且已实测**，而改成 Service class 形态要付出 `tests/omo-agents/boot-markers.test.ts` 的 `apply()` 接线 harness 全量改造成本。**故裁定：不采用，不做形态转换**——保留 `apply()` 形态 + `ctx.inject` 回调，理由即上述实测。
- **`isDefault` 的可取面（Q-3 §1 末/§5.7，仲裁采纳）**：`isDefault` **只在 `remoteExportList()` 上**；进程内 `list()` 结构上不返回它 ⇒ 任何断言 `isDefault: false` 的代码必须走 roster RPC（`remoteExportList()`），走 `list()` 会永远失败。
- **roster 词汇迁移**：`trust` 的消亡是**两处**同删——`agentPresets/list` 行与 `agentPresets/read` 文档（0.1.5 的 `AgentPresetDocument` 也带 `trust`，types.ts:52；评审 R1-B1 实证）。`RosterEntry` 结构类型的处置（去字段 vs 保留可选读取不消费）交 T1 裁定（Q-3 附项，建议「保留可选读取 + 断言不消费」——向后兼容零成本）；boot roster 打印行改 registry 实际字段（`isDefault`/`broken`）。
- **registry 文档断言面（评审 R1-B1 更正——单一断言面，无需双模）**：`agentPresets/read`（线上方法名 `@Remote('read')`，服务侧 `readDocument`）**在 0.1.5 与 0.2.x 上均在场**，返回 `AgentPresetDocument.content`（entry-list YAML）——0.1.5 由文件发现供给、0.2.0 由注册定义供给。probe 与 drive.mjs 的锚点断言**统一迁到这一个远程面**，不做双模拆分；「远程面缺失则落回物化断言」的兜底**禁止**（它会在真实回归发生时静默降级成文件断言——正好违反 §2 金丝雀纪律）。**⚠️ 2026-10-04 仲裁实测订正：「锚点齐全」这个前提不成立**——`content` **不是**我们写出的那份 YAML 文本，而是对**已解析对象**的 `yaml.dump()`（`dsh@rc.2 packages/preset/agent-preset-registry/src/index.ts:200-205`：`content = dump(plugins, { schema: entryListSchema, noRefs: true, lineWidth: -1 })`）。仲裁者亲跑实测（`.omo/evidence/p45t5/ARBITRATION-primary-source-verification.md` §6，含可复现探针）：**行/缩进/块标量类锚点照旧命中**，但 **flow 序列被展开成 block 序列**（`deny: ["a", "b"]` → `deny:` + 逐行 `- a`）、**不必要的引号被去掉**（`provider: "spawn"` → `provider: spawn`）、**`!!js` 保持单行 tag 形态**（**仲裁者初稿判它「变两行」是错的**——上游 `vendor/include/src/index.ts:9-15` 的 `JsExpr` 带 `represent`，而仲裁者的模拟漏了这个成员；`:14` `represent: (data) => data['__jsExpr']` 正是 dump 路径的钩子，见证据 §6.2a），⇒ **任何 grep `!!js` 的断言在 `content` 上照旧命中，不需要兼容处理**；全文 1861 行 → 1617 行。**故 T6 的断言重写范围只有两类：flow 序列 + 引号。**故 **T6 的做法是「按 `content` 的实际形态重写断言」，不是「原样搬运锚点」**——后者是一次必然红的搬运。**推荐写法**：把 `deny`/`allow` 的逐字 grep（含 probe 的 `grep -qxF` 整行相等）改成「**解析 `content` 后的数组与 `roster.ts` 推导值逐元素相等**」——这比逐字 grep **更强**（逐字 grep 对空白/引号敏感却对语义不敏感）。原句「迁移后唯一需要实证的是：全部渲染锚点在两侧 `content` 中都齐全（T1 Q-3 附项钉测）」**作废**：Q-3/Q-4 证据里 `content`/`readDocument` **零命中**，该钉测**从未做过**——纪律 ⑨ 第 6 次命中，且错在**任务书自身的前提**上。
- **兼容死代码**：0.2.x 上 `$DSH_HOME/.agent-presets/` 无读取方——写盘契约保留（见上，门 4 与 0.1.5 分支消费），0.2.x 分支的诊断价值由任务书裁定成文；pin 翻转 commit 删除纯 0.1.5 的物化消费面（§4.1 去留裁定）。

### 4.4 安装器交付线（P0-1 安装器线，复核 §2.4 为权威）

**默认方向（A）声明式迁移**，**降级方向（B）重定范围**——T7 任务书含 T1 Q-7 实证后的 fork 裁定：

- **（A）声明式迁移**：`install-concerto.sh` 不再写 `$DSH_HOME/.agent-presets/concerto/`，改为向目标 profile 的 **`$DSH_HOME/profiles/<name>/cordis.patch.yml`** 写入一行 `- insert: [{id: preset-concerto, name: '@deepseek-ai/dsh-agent-preset', config: {…PresetDefinition…}}]`——config 内嵌完整的渲染后组合（omo-agents-current 的 1+1 组合 + 可选 env 覆盖渲染，与今日两文件的语义等价）。**先例强度（评审 R2 §2.3 正面实证）**：(A) 的三个关键前提全部有上游先例——① registry 行 web profile 自带（`dsh-web-app/cordis.patch.yml:561-566`，`config.default: standard`）；② profile patch 的 last-write-wins-per-id 语义（`standard.patch.yml` 头注释逐字："Edits saved from the Web editor override this row's `config.plugins` **by id** from the profile patch"）；③ `!!js` 按表达式保留（纪律④）。且官方 `preset-standard` 行的**整体形状**与 (A) 的产物几乎逐字相同——(A) 不只是可行，而是**镜像上游写法**，这是 (A)/(B) fork 裁定时「不默认滑入 (B)」的最强正面依据。纪律：① **幂等行替换**——按行 id `preset-concerto` 整行重写（profile patch 的 last-write-wins-per-id 语义），绝不盲 append；② **用户文件零破坏**——profile patch 是用户自己的文件，installer 只 touch 自己的那一行，写入前备份（`.bak` + 时间戳）；③ **registry 前提**——目标 profile 必须已挂载 `agent-preset-registry` 行（web profile 经 dsh-web-app bundle 自带，T1 Q-7 实证断言缺席时响亮报错并指引）；④ `!!js` 与平台门（tool-bash/tool-pwsh）在 config 中**按表达式保留**（依据 = 官方 `presets/standard.patch.yml:22,25` 在 `config.plugins` 内写 `disabled: !!js process.platform …` 的同一形态 + `dsh-agent-preset` 的 `EntryGroup.key` 保留机制——评审 R1-I2 的「大概率不可行」经此证伪；评审的替代方案「安装期按 `uname` 解析为布尔字面量」记为**实施期可选优化**——plain-YAML 与幂等重写更安全的收益成立，但它把平台门烘焙到单机且需在 bash 侧复刻 `process.platform` 判定逻辑，默认不取）；⑤ 安装验证 = 真实 `dsh web` boot + roster RPC 断言 `concerto` 在列（复用 concerto-mode-probe 的传输自适应通道）。
- **（B）重定范围**：若 Q-7 实证（A）在 0.2.x 上有结构性障碍（如 profile patch 的 `config.plugins` 校验拒绝既有组合形状、registry 行不在安装目标 profile），按 ROADMAP 许可把安装器线**显式重定范围**——安装器在 0.2.x 上响亮拒绝安装并指引插件线，理由写入 `docs/install-concerto{,_zh-CN}.md` 与 CHANGELOG，退出标准 (e) 以此形态了 结。**（B）是裁定结果不是失败**——但必须由 T1 证据驱动，不得默认滑入。
- **两条线的 1+1/11-agent 关系不变**：安装器线仍是 1+1 preset（README 📌 通道说明的口径不变），本阶段不改变下发内容，只改变承载机制。

### 4.5 会话日志 v4 观测通道（P1，复核 §4 为权威）

- **夹具形状迁移（drive.mjs）**：9+ 处 v3 形伪造条目（:5201/:5278/:5328/:5680/:5728/:5859/:6501/:6525/:6686 等）按 §4.1 探针分叉——沙箱 boot 后从真实会话日志 header 读 format 版本（v3/v4），伪造与解析用同一形状；`tool/result` 的 v4 形 = `role:'tool'` + 顶层 `toolCallId`/`isError`（**T1 Q-8 从真实 0.2.0 沙箱会话抓取逐字形状**，禁止按文档想象）。
- **运行时读取面分类**：先分类每处伪造是「运行时消费」（v4 准入断言会拒绝错形状）还是「自有解析器消费」（只需解析器双语义）——分类清单进 T8 任务书；准入断言的定义面（`session-format-v3-to-v4/src/codec.ts:62`）只作证据引用，不消费。
- **prove 脚本与 smoke**：`prove-route-logging.mjs` 等读日志内容的脚本核对信封读取点（`role`/`content` 块词汇），同样双形状；文件名面（`session.v\d+.jsonl` 正则）与 `compression: none` 已是现状，零改动（复核 §4.3 封死的幻影工作项不得复活）。
- **零产物承诺**：本项只动测试基础设施——运行时插件代码若出现 v4 相关 diff，即为范围蔓延信号（复核 §4 的 P1 定性）。

### 4.6 门与断言迁移（不加新门）

> 迁移重心按评审 R1-B2 实测重排：**门 3 > 门 8 > 门 2（门 2 仅增量**，R3-N1：jobs 双形状用例 + register 结构式 mock + 新增纯函数用例三项**新增**，无存量迁移**）**；门 6 低风险（c01–c09 读仓内模板 `omo-agents-current/preset/agent.cordis.yml`，`verify-concerto-static.mjs:106-108`，不读物化产物）。

| 门 | 迁移内容 |
|---|---|
| **门 3 e2e（重心）** | drive.mjs 双形状夹具；`materializedCompositionPath` 的调用点统一迁到 `agentPresets/read` 单一断言面（§4.3）；**stop-continuation 级联金丝雀**——0.2.x 上 `/stop-continuation` 后 `cancelledJobIds` 非空且目标 job 消失（退出标准 d 的承载场景，可复用/扩展现有 `stop-continuation-halts-todo`） |
| **门 8 proofs（次重心）** | probe **71 行**物化引用面迁移（sentinel 残留反断言、`prefix` 块标量、persona 章节 marker、explore 行 id/toolName、toolFilter grep、喂 dsh schema 校验器 :583-584、`trust` grep :976-977）；`run-proofs.sh` 在双运行时各跑一轮（0.1.5 旧路径 + 0.2.x 新路径）；PASS banner（:1228）重写不得削弱其中的**否定断言句**（`NO … FAILED` / `ABSENT` / no-vacuity-guard——评审 R1-N2） |
| **门 2 单测** | jobs 三触点的双形状参数化用例；preset 注册的结构式 mock（`agentPresets.register` 在场/缺席）；`concerto-preset.test.ts` **11 处 `.agent-presets` 与 `roster-composition.test.ts:81` 保留不动**——它们是**纯 vitest 单测、无 RPC 能力**（评审 R2-B1 实证），测的是渲染器与**写盘契约**（B4 承重面，门 4 依赖），正是该契约的唯一自动化保护；**增量**（仅两项新增）：① `renderConcertoComposition()` 纯函数用例（不落盘，直接断言 YAML 文本含全部渲染锚点）；② 「`omo-agents` **不在被注册组合行集内**」结构断言（R-9 处置列要求的同一断言，R3-N2）；YAML 渲染↔模板锚点既有测试不动。「read 文档锚点」断言归属运行时面（probe 与 drive.mjs，已有 RPC 通道），不在单测射程内 |
| **门 4 doctor-lite** | **零改动成立**（评审 R1-B4 后提）——闸继续调 `syncConcertoPreset(temp)` 读渲染产物（doctor-lite.mjs:602 的写盘契约在 §4.3 保留），单一事实源与契约均未变 |
| **门 6 静态门** | 低风险：读仓内模板非物化产物（见表头注）；仅随 T5/T6 的模板/署名面变化迁移，c 组不断言 0.1.5 死路径。**2026-10-04 仲裁例外授权：T6 新增 `c23`**（validator argv 元数 ↔ 每个消费者实传个数的三方对账），门 6 由 **31/31 变 32/32**——见任务书 T10「做法」段的例外授权与规约⑭ |
| **门 7 docs-consistency** | 零改动预期（d01–d09 均与本阶段面无关）；pin 翻转时 d09 的 `--before` 截止由 bump-dsh.sh 原子更新 |

### 4.7 pin 机器（最后一个工作包）

`scripts/bump-dsh.sh <0.2.x-rc>` 既定流程执行：safe_point 时间序选定 `--before` 截止 → `apply_bump` 原子改 `ci.yml` + `compat-probe.yml`（d09 门复验）→ `family_verdict` 锁文件族判定。**D7 断言的权威落点是 `scripts/doctor-lite-core.ts`，`bump-dsh.sh` 不覆盖此面**（评审 R1-B3 实证：`apply_bump` 只 sed 两个 workflow 文件，:67-68）——同 commit 手工改：`doctor-lite-core.ts:15-17`（`PINNED_MAJOR = 0` / `PINNED_MINOR = 1` 常量 + `Decision D7 pin: minor 0.1.x` 注释）与 `:44`（`isPinnedDshVersion` 的 `0.1.x` 注释文案）、`scripts/doctor-lite.mjs:211`（"pinned 0.1.x, decision D7" 提示文案）、`tests/omo-agents/doctor-lite.test.ts:39-50`（夹具断言 `0.2.0` 从 rejects 组移入 accepts 组 + describe 标题 "decision D7: 0.1.x" 改口径）——漏改任何一处：门 4 在新 pin 下红（core 常量）、门 2 红（测试夹具）。bump-dsh.sh / release.sh / probe 注释中的 0.1.x 假设（只改会误导的下一次执行处，历史记录不动）同 commit。

`.omo/compat.yaml` 的 0.2.x 行处理 = **跨段迁移，不是状态翻转**（评审 R1-I1）：`untested:` 行（`{dsh, omo, since, note_*}`）移入 `tested:` 段必须补 **`{our, date, evidence}`** 三字段（`our:` 取值按 release-process §2a 裁定——`latest` 现为 `0.2.1`；release gate 前置纪律：0.2.x 行必须在任何基于翻转后 pin 的发布**之前**已 `tested`），再跑 `render-compat-matrix.mjs` 重渲染双语矩阵。

### 4.8 延后对齐项（可整体 defer 出本阶段）

`source:{kind:'plugin'}` → 专属 source kind：**插件源码内 13 处 = 10 代码 + 3 注释，无运行时过滤器**（`1803790` 终态口径）。形态 = 各生产方改用自己的 kind 字符串（如 `omo-hard-blocks`、`omo-todo-continuation`），结构类型同步；**不需要** `declare module '@deepseek-ai/dsh-llm'`（本仓无 dsh 类型依赖，上游的模块合并是类型层仪式，运行时 source 只是数据）。触发条件 = 仅当 T1 或实施期发现 0.2.x 的某消费者（UI 折叠、notice 归并）对未知 kind 有实际误行为；否则记 deferred 出阶段，任务书（T9）保持 `pending-deferrable`。

### 4.9 署名与合规

- 本阶段零 vendor、零 NOTICES 变动（OMO 侧零变动约束）；适配代码文件的署名头只在**新写文件**上需要（预期无——全部是既有文件改造）。
- **npm 依赖：零新增**（2026-10-04 仲裁修订——原「唯一可能的新 npm 依赖 = §4.3 的 `yaml`」作废，Q-2 定案为从已安装 dsh 动态 import `js-yaml`）。因此 `verify-licenses` **白名单零新增条目、`checked` 计数保持 56**、pnpm-lock **无变更**、CHANGELOG 无依赖变化条目。**已知风险登记**：从别人的 `node_modules` 动态 import 是脆弱耦合（绑死 dsh 内部打包布局），本阶段不消除、如实成文。

## 5. 退出标准与证据

| # | ROADMAP 原文 | 证据（本计划的关键判定） |
|---|---|---|
| **a** | L1 全链在 pin 的 0.2.x 运行时上转绿 | `scripts/ci-local.sh` 8 门在 0.2.x pin 下全绿（pin 翻转 commit 的 CI 与本地复跑双记录）；**且**阶段中途每个 commit 在 0.1.5-rc.1 CI 保持绿（双模证据） |
| **b** | L2 真机验证在 0.2.x 重跑并产新证据文件，矩阵行 `tested` | `.omo/evidence/concerto-verify-dsh-<0.2.x-rc>.md`（沿用 0.1.5-rc.1 证据文件的 17 项核对骨架重推导）；`.omo/compat.yaml` **跨段迁移**（`untested` → `tested`，补 `{our, date, evidence}` 字段集，`our:` 取值裁定 + release gate 前置——§4.7）+ 矩阵重渲染 |
| **c** | roster 重新出现 `concerto`，脚本化委派往返落上 | concerto-mode-probe（传输自适应通道）断言 roster 含 `concerto` + drive.mjs 委派场景（explore 往返）在 0.2.x 绿 |
| **d** | `/stop-continuation` 级联 e2e 证明 job 确实被取消 | 级联金丝雀场景在 0.2.x 的 verdict：`cancelledJobIds` 非空 + 目标 job 消失 + 反向断言（未触达降级 marker）；0.1.5 同场景保持绿（双模） |
| **e** | 安装器线 0.2.x 状态有了结 | （A）形态：沙箱全新安装 → `dsh web` boot → roster RPC 含 `concerto`；（B）形态：重定范围文档 + 安装器响亮拒绝 + 理由成文。两形态都要有实证记录 |
| **f** | D7 pin 翻转与绿色证据同一次变更交付 | pin 翻转 commit 同时含：ci.yml/compat-probe.yml 新 pin + 0.2.x 全链绿记录 + 矩阵行 `tested` + CHANGELOG；PRD §12 该项翻 [x]，decisions.md 带日期行 |

**DoD 补充**（沿用 Phase 1–4 的 c/d/e）：

- **c**：`scripts/ci-local.sh` 全 8 门绿（中途 = 0.1.5 pin 下；收口 = 0.2.x pin 下），门扩展只加严不放松。
- **d**：本计划目录文档与实测无冲突——凡 T1 复核推翻计划假设处（如 Q-5 的 subscribe 投递范围、Q-7 的安装器路径可行性），改文档而不是改结论（修订记录成文）。
- **e**：未移除任何既有署名；`verify-licenses` 计数**零变化**（零新增依赖，Q-2 定案后 `checked` 恒为 56）。

**明确不属于退出标准**（范围蔓延护栏）：

- ❌ 新 OMO 能力移植（Phase 5–7 的事）；0.2.x 新特性的采用（各候选日后单独过检）；
- ❌ `kind:'plugin'` → 专属 kind 的迁移（§4.8，deferrable，除非证据拉入）；
- ❌ 安装器线下发内容的升级（1+1 → 11-agent 名册的下发决策属 Phase 7 发布节奏，README 📌 口径不动）；
- ❌ 0.1.5 死路径的提前删除（pin 翻转 commit 才删，§4.1 去留裁定）；
- ❌ 对 0.2.0-rc.2 之后更新的 0.2.x rc 的追新（T1 Q-1 一次选定执行目标，阶段中途不换靶）。

## 6. 风险与开放问题

| # | 风险 / 问题 | 影响 | 处置 |
|---|---|---|---|
| **R-1** | **双模漂移**：某适配点在 0.2.x 修复生效、在 0.1.5 静默退化（探针分叉写反、双读漏键），而 CI 只跑 0.1.5——0.2.x 侧失真直到 T11 才暴露 | 高 | 每个适配任务的证据栏含**受影响门 + 场景级** 0.2.x 记录（任务书头部规则，评审 R1-I7 对齐）；T11 双运行时全链复跑兜底；探针分叉点全部进单测（双形状参数化 + 三触点同一 mock 取同一 `dshRuntimeShape()` 值的一致性断言，§4.1/§4.2） |
| **R-2** | **`register()` 校验拒绝既有组合**（评审 R1-I3 收窄后）：`PresetDefinition.plugins` 校验（entryListProblem）拒绝 `disabled: !!js` 形状，或 mount 期 audit 拒绝嵌套 `cordis:group`。~~isolate realm~~ **已排除**——isolate 是标准 loader 机制（官方 `standard.patch.yml:45,66,83` 与协奏组合自身都在用；installer 线组合更是无 realm，`omo-agents-current/preset/agent.cordis.yml:9`）；entryListProblem 文档串明写「including nested groups」，嵌套 group 属设计内支持，残留风险仅在 audit 实跑结果 | 高（收窄后为中） | T1 Q-3 实证先行；若拒绝 = 收窄组合形状（偏离登记进覆盖文档）或退回物化诊断 + 上报差异，不得静默改写组合语义 |
| **R-3** | **disposer/HMR 泄漏**：register 后插件重载（hmr 在 base bundle，`root: []` 默认不看模块根，但 profile 配置重载会重放）导致重复注册 | 中 | T1 Q-4 钉测 effect 接线；泄漏检测 = boot 后 roster 无重复 id（registry 对同 id 的语义由 Q-3 一并钉测）；单测模拟双注册 |
| **R-4** | **安装器破坏用户 profile patch**：幂等行替换实现有误时会 clobber 用户自己的 `cordis.patch.yml` 行 | 中 | §4.4 纪律（按 id 整行重写 + 时间戳备份 + 只 touch 自有行）；e2e 对照 = 预置含用户行的 profile patch，安装后用户行逐字保留 |
| **R-5** | **v4 形状按文档想象**：伪造夹具凭复核描述写，与真实 0.2.0 运行时的准入断言不吻合 | 中 | T1 Q-8 强制真实沙箱抓取；伪造生成器与解析器共用同一形状常量（单源） |
| **R-6** | **0.2.x rc 线漂移**：阶段中途上游发新 rc，复核引用失锚 | 低 | T1 Q-1 一次选定执行目标并记录；阶段中途不换靶（§5 护栏）；复核的 tag 级引用对选定 rc 的再验证是 T1 第一项 |
| **R-7** | **jobs `events.subscribe` 投递范围不等价**：`{owners:'scope'}` 在 host-plane 插件上听到的集合 ≠ 0.1.5 `onJobDone` 的投递集合 → 后台通知漏/滥 | 中 | T1 Q-5 钉测三态（scope/all/owner 具体值）逐字记录；不等价时选等价的 filter 并记理由；e2e 通知场景双运行时复跑 |
| **R-8** | **范围误读**：产出被理解为"0.2.x 已全面支持"（实际仅适配点收口，0.2.x 新特性未消费、安装器线可能是 (B) 形态） | 低（沟通） | README/CHANGELOG 写明：pin 翻转 = 适配点全绿，≠ 0.2.x 特性消费，≠ 安装器线必然 (A) |
| **R-9** | **register 调用时机 / 激活死锁**（评审 R1-I3 实证 + R2-I1 理由更正）：registry 文档串明写 audit 等 Loader 树 settle 才报告——「Callers therefore must not run inside a Host row's own activation」（`agent-preset-registry/src/index.ts:126-127`）。**安全性依据 = 结构性不变量**：`omo-agents` 不在被注册组合的行集内（`concerto/agent.cordis.yml` 行集无它；它挂仓根 `cordis.yml:36-38` 独立 insert 行），audit 等的 settle 不会等到调用方自己头上。`ctx.inject` = cordis `plugin()`（`registry.ts:300-301`，创建自己的 fiber）——安全性与同步性无关 | 中 | §4.3 的不变量成文 + 防误读注；Q-3 第 ⑥ 问钉测（证明不在行集内 + 实跑无死锁）；T5 做法段与单测显式约束（含「`omo-agents` 不在被注册组合行集」的结构断言——结构变更时立刻报警） |
| **R-10** | **T1 钉测超期或受阻**：T1 = 8 个 Q / 1 天，其中 Q-3/Q-5/Q-7 各需真实沙箱 boot、Q-5 还需真实 subagent 委派起 job——它是全部 12 个后续任务的共同依赖，单点风险未被登记（评审 R1-I8） | 中 | Q 改**逐 Q 独立交付**——哪个先闭环先写证据，不绑在一个 1 天块里；某 Q 受阻时，其下游任务单独重排期而非全链停摆（T1 任务书成文） |

### 开放问题（T1 复核清单——全部以真实 0.2.x 运行时/源码钉测闭环；逐 Q 独立交付，R-10）

| # | 问题 | 关闭判据 |
|---|---|---|
| Q-1 | 执行期 pin 目标 = 哪个 0.2.x rc | npm time-ordered（bump-dsh.sh safe_point 逻辑）选定并记录；复核引用对它再验证 ✅ |
| Q-2 | 渲染 YAML → 对象的解析路径 | `yaml` 依赖可行性（版本/license/安装路径）定案；否决自造解析器 |
| Q-3 | `agentPresets.register()` 的运行时契约 | 真实 boot 实证：① 校验接受既有组合形状（`disabled: !!js` + 嵌套 group——isolate 已排除出风险面，R-2）；② roster 出现；③ 同 id 重复注册语义；④ `broken` 字段行为；⑤ session/create 组合成功；⑥ **register 调用时机**——证明 `omo-agents` **不在被注册组合的行集内**（结构性不变量，R-9/R2-I1）+ 实跑无死锁。附项 a：**两侧 `content` 锚点齐全性**——0.1.5（文件发现供给）与 0.2.x（注册定义供给）的 `agentPresets/read` `content` 中全部渲染锚点均齐全（评审 R1-B1，单一断言面迁移的唯一实证面）；附项 b：**`RosterEntry.trust` 处置裁定**（去字段 vs 保留可选读取不消费——建议后者，评审 R1-N1） |
| Q-4 | plain `apply()` 插件的 disposer/effect 接线 | 接线先例定案；重载后无泄漏实证。**候选方案（T1 实测裁定，不预设——评审 R2-I1 附带发现）**：把 `omo-agents` 的导出从 plain `apply()` 改为 **Service class + `static inject` + `async *[Service.init]()`**——上游 `dsh-agent-preset` 正是此形态（`agent-preset/src/index.ts`：`Service.init` 生成器 `yield` disposer，fiber scope 自动托管），可顺带消掉 Q-4 的接线搜索与 R-9 的手工时机纪律；裁定维度 = 形态转换成本 vs 手工持有的既有纪律——**形态转换成本的具体载体**（评审 R3-I1）：`tests/omo-agents/boot-markers.test.ts` 的 `apply()` 接线 harness（604 行 / 32 个 `it`：`:52` import `apply`、`:441` `type ApplyContext = Parameters<typeof apply>[0]` 类型推导、`:487` `describe('P2-T16 apply() wiring')` 逐行断言 boot 输出）——走 Service class 即重写整个 harness，**非单行 import 变更** |
| Q-5 | `jobs.events.subscribe` 三态 filter 的投递集合 | `{owner}`/`{owners:'scope'}`/`{owners:'all'}` 各自听到什么（host-plane 订阅者视角），与 0.1.5 `onJobDone` 投递集合的等价比对；`settled.awaited` 语义逐字引用 |
| Q-6 | jobs caller/view 形状实跑 | `list(sessionId)` 返回 owned+unowned、`kill(id, sessionId)` 判 定、`JobView.owner` 在场性、owner preflight（活 Agent 在册要求）——全部实跑非文档 |
| Q-7 | 安装器声明式路径可行性 | profile patch 行真实 mount + 组合成功；registry 行在目标 profile 的在场性；幂等重写协议实证；（A）/(B) fork 裁定 |
| Q-8 | v4 信封逐字形状 | 真实 0.2.0 沙箱会话（compression:none）抓取的 `tool/result` 事件全文；drive.mjs 伪造点分类（运行时消费 vs 解析器消费）清单；**附项**：`commandExecute` 的传输硬绑定确认（drive.mjs:2205-2213 的「installed dsh 0.1.5-rc.1 = web-remote」注释假设在 0.2.x 上仍成立——复核 §6 判定传输形态不变，此为一行确认记录，评审 R1-N3） |

## 7. 工作包与估算

按 ROADMAP §7 的定性惯例（无 buffer、非承诺，R3），仅给工作量级：

| 工作包 | 内容 | 任务 | 量级 |
|---|---|---|---|
| **WP-0 调研核对** | 0.2.x 机制逐件钉测（Q-1…Q-8，逐 Q 独立交付）+ 复核引用再验证 → 任务书按实测修正（DoD-d） | P4.5-T1 | ~1 天 |
| **WP-1 ctx.jobs 适配** | background-notification / stop-continuation-guard / live-state 三触点双模改造 + 单测 | P4.5-T2 … P4.5-T4 | ~1 天（3×3h） |
| **WP-2 协奏 preset 注册** | 出口双模（register() + disposer + YAML 解析依赖）+ roster 词汇与断言生态迁移（probe 60 行 / drive 5 点 / 单测 12 处） | P4.5-T5 … P4.5-T6 | ~1.1 天（5h+4h） |
| **WP-3 安装器交付线** | 声明式迁移（或重定范围）+ 安装验证 + 安装文档双语 | P4.5-T7 | ~1 天 |
| **WP-4 v4 观测通道** | drive.mjs 双形状夹具 + prove/smoke 信封读取点核对 | P4.5-T8 | ~1 天 |
| **WP-5 延后对齐（deferrable）** | 专属 source kind（仅当证据拉入） | P4.5-T9 | ~0.5 天（可 defer） |
| **WP-6 门与双运行时复跑** | 门断言迁移（重心门 3 > 门 8 > 门 2——**门 2 仅增量**，R3-N1）+ 双运行时全链 + 级联金丝雀 + roster 往返 | P4.5-T10 … P4.5-T11 | ~0.9 天（3h+4h） |
| **WP-7 pin 与收口** | bump-dsh + doctor-lite-core D7 常量 + L2 重验证 + 矩阵跨段迁移 + 文档收口 | P4.5-T12 … P4.5-T13 | ~1.4 天（3h+8h） |

**合计 ≈ 8 人日**（T1 实测后按 DoD-d 修正；T9 defer 则 −0.5）。体量主体在 WP-2（注册迁移 + 断言生态）与 WP-7（证据链）。**与 ROADMAP §7 的对账**（评审 R1-I9）：ROADMAP 把 Phase 4.5 定性为「小到中」（其六项列举未含 WP-6 的双运行时复跑与 WP-7 的 pin/收口——两者是本计划为「pin 翻转与绿色证据同 commit」纪律新增的证据链成本）；且评审 R1-B2 实测的断言迁移面（probe 60 行 / drive 5 点 / 单测 12 处）约为初估的 2–3 倍，已摊入 WP-2/WP-6 的修订量级。8 人日 = 任务级小时数加总（64h），与「≈」口径一致。

## 8. 交付物清单

| 交付物 | 路径 | 类型 |
|---|---|---|
| jobs 三触点适配 | `patches/omo-dsh/omo-hooks/src/hooks/background-notification.ts` · `src/services/stop-continuation-guard.ts` · `src/hooks/ulw-execute/live-state.ts`（双模） | 代码 |
| 协奏 preset 注册 | `patches/omo-dsh/omo-agents/src/concerto-preset.ts`（双模出口 + disposer + **`renderConcertoComposition()` 纯函数抽出**）· `src/index.ts`（roster 词汇）·（**零 package.json 依赖变更**——Q-2 定案为动态 import 已装 dsh 的 `js-yaml`，§4.9）· **两个单测文件**（`tests/omo-agents/concerto-preset.test.ts` / `roster-composition.test.ts`——保留 + 新增纯函数用例，评审 R2-B1） | 代码 |
| 安装器线 | `scripts/install-concerto.sh`（声明式迁移或响亮拒绝）· `docs/install-concerto{,_zh-CN}.md` | 代码 + 文档 |
| v4 观测通道 | `tests/e2e/drive.mjs`（双形状夹具 + 断言迁移）· prove/smoke 信封读取点 | 测试 |
| 断言/门迁移 | concerto-mode-probe.sh（registry 词汇）· 静态门随模板面变化迁移（同 commit——门 4 零改动成立、门 6 低风险，§4.6） | 配置 |
| pin 机器 | `ci.yml` / `compat-probe.yml`（bump-dsh.sh 原子改）· `scripts/doctor-lite-core.ts:15-17,44`（D7 常量与注释——bump-dsh.sh 不覆盖，同 commit 手工改）· `scripts/doctor-lite.mjs:211` 文案 · `tests/omo-agents/doctor-lite.test.ts:39-50` 夹具 | 配置 |
| 证据 | `.omo/evidence/p45t1/`（Q 组）· `.omo/evidence/concerto-verify-dsh-<rc>.md`（L2）· 矩阵行**跨段迁移**（`untested` → `tested` + 字段集，§4.7） | 证据 |
| 文档收口 | README 状态行翻转 · CHANGELOG · decisions 带日期行 · PRD §12 [x] · 矩阵双语 | 文档 |
| **本计划目录** | `docs/plans/phase4.5-dev/phase4.5-plan.md`（本文）· [`phase4.5-tasks.md`](./phase4.5-tasks.md) | 文档 |

## 9. 与前后阶段的关系

- **对 Phase 0–4 的回馈**：两个 P0 面是 Phase 0–4 资产在新运行时上的存续问题，不是新功能；适配完成后，Phase 2 名册、Phase 3 hooks、Phase 4 命令面在 0.2.x 上恢复全部既有语义——本阶段的验收就是它们的既有 e2e 在新运行时上原样转绿。
- **Phase 5（Team Mode）**：其设计直接建在 `ctx.jobs` + `ctx.subagents` 之上——本阶段 jobs 适配的双模面（`events.subscribe`/`JobView.owner`）就是 Phase 5 将要消费的形状；Phase 5 启动时 pin 已在 0.2.x，jobs 双模的 0.1.5 分支届时按「pin 翻转后去留」裁定清理。
- **Phase 6/7**：pin 机器（bump-dsh.sh）的 0.2.x 假设更新后，后续版本的 bump 回到既定哨兵节奏；安装器线的 (A)/(B) 终态影响 Phase 7 的发布矩阵行。
- **对复核报告的回馈**：实施期凡实测与复核引用不符处（R-6 之外的实质性出入），订正回复核报告（双语），并在该报告补上「实施期订正」节——研究产物随实施证据更新，而不是留在原地失真。
