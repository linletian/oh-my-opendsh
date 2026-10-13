# Phase 6 任务清单

> **上游依据**：[开发计划书](./phase6-plan.md) · [MCP/编辑面清单与覆盖基线](./phase6-mcp-editing.md) · [ROADMAP Phase 6](../../roadmap_zh-CN.md) · [决策 D9／D14／D17](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 6 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，覆盖基线给出"每条 MCP/编辑面的处置"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：🚧 立项（2026-10-12，基线 = Phase 5 结项后的 `feature/phase6-dev`）。`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）· ~~删除线~~ = 仲裁取消。
>
> **编号**：`P6-T<n>`（Phase 6 - Task n）。工作包归属见计划书 §7。
>
> **任务书头部规则**（沿用 Phase 4.5/5 纪律）：每个适配/移植任务的证据栏 = **受影响门 + 场景级记录**；fork 敏感任务（标 ⚖️）必须先把 fork 依据写进证据再动手；typecheck 验证必须**显式退出码**（P5-T7 教训——仲裁台账 `.omo/evidence/p5t1/ARBITRATION.md` 在册：`| tail -1` 扫尾放过 45 错回归；永远 `echo TYPECHECK_EXIT=$?`）。【评审更正 2026-10-13：原稿写「T7 教训」无出处歧义（docs/ 无命中——教训本体在 gitignored 仲裁台账），归属收窄为 P5-T7】

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1 | installed dsh = pin 的 0.2.0-rc.2 | `dsh --version`；doctor-lite 基线 PASS | ✅ 2026-10-13：`dsh --version` = `0.2.0-rc.2`；门 4 随 PRE-2 全绿 |
| PRE-2 | 基线绿：`scripts/ci-local.sh` 8 门全绿 | 退出 0；记录基线（门 2 测试数、门 3 场景数、门 5 `checked`、门 6 断言数、门 8 proofs 数） | ✅ 2026-10-13 重采（日志 `.omo/evidence/p6t1/pre2-baseline.log`，`CI_LOCAL_EXIT=0`）：门 2 = 90 文件/2056 测试；门 3 = 41 PASS/0 RED；门 5 = checked=61·violations=0；门 6 = 37/37；门 8 = 8/8——与 Phase 5 结项快照逐值一致 |
| PRE-3 | 本地 OMO 检出只读可用 | `git -C ~/GithubRepo/oh-my-openagent rev-parse v4.19.4^{commit}` = `b072d279110bdda2c6ac2525d0d24dc54d16148a`；全程只用 `git show/ls-tree`，工作树不动 | ✅ 2026-10-13：rev-parse 输出逐字一致 |
| PRE-4 | hashline-core vendor 完整 + 19 技能目录在服务 | vendor 漂移门绿（hashline-core 条目）；`omo-commands/src/skills.ts` `EXPECTED_VENDOR_SKILL_COUNT = 19` 与目录实测一致；`ast-grep`/`lsp-setup` 两件在册 | ✅ 2026-10-13：磁盘 19 目录（含 `ast-grep`/`lsp-setup`）= 常量 19（`patches/omo-dsh/omo-commands/src/skills.ts:96`）；`patches/omo-dsh/vendor/hashline-core/` 在册；漂移门随 PRE-2 门 5/6 绿 |
| PRE-5 | Phase 3 deferred **四行**与 H-24 现状可定位（R2-4f 同步：S-30 在册） | `phase3-hooks.md` 的 S-14/S-15/S-16/S-30 行与 H-24 行（:52/:78-80/:94）；omo-hooks manifest 的 webfetch-redirect-guard 条目在位 | ✅ 2026-10-13：四行与 H-24 行逐一定位（行号与任务书一致）；manifest 条目在 `patches/omo-dsh/omo-hooks/src/manifest.ts:663` |

---

## WP-0 调研钉测（计划书 §4.1/§6，Q-1…Q-8）

### [x] P6-T1 — 四面全对账 + 原生钉测 + 三 fork 裁定 ⚖️

- **产出**：回填后的 [覆盖基线](./phase6-mcp-editing.md)（§1–§7 全部转实测）；**三 fork 裁定书**（E/L/G 各自选项 + 依据，进 `.omo/evidence/p6t1/FORKS.md`——**含 c14 并集扩展的显式仲裁**（评审 MAJOR-5：与 P5-T14 裁决并列记载，(a) 重排基线 §1 入并集 / (b) 不扩 + c22 式作用域或独立检查 + 活体针措辞同步，默认 (b) 条件式）与 **H 编号预分**（评审 F-12））；计划书 §4 按实测更正（DoD-d）；fork 触发决策登记时起草本阶段 D 条目与 ROADMAP Phase 6 措辞修订（随首个落地 commit 同发，T3/T4 先例 = Phase 5 D18）。
- **做法**（逐 Q 独立交付，哪个先闭环先写证据；Q-2/Q-4 为阻断项）：
  1. **Q-1 上游对账**（全程 `git show/ls-tree` 只读）：`hashline-core` API 面 + **`omo-opencode/src/tools/hashline-edit/` 工具面 24 件逐文件**（评审 F-1/B-3 增补——锚点校验 `parseLineRef`/`validateLineRef`、diff 生成、edit-operations 所在层）+ `hashline-read-enhancer/`、`hashline-edit-diff-enhancer/` 逐文件语义 + `atlas/write-edit-tool-policy.ts`【T1 实测更正：实际路径 = `src/hooks/atlas/write-edit-tool-policy.ts`（5 行名谓词），`src/atlas/` 不存在】+ `config/schema/experimental.ts` 配置门【T1 实测更正：被消费的门 = **顶层** `hashline_edit`（`oh-my-opencode-config.ts:60`，default false；`tool-registry-gated-tools.ts:32` 以 `edit` 之名注册 hashline 面）；`experimental.ts:19` 同名字段是另一格】；`lsp-core` 工具全名单（`tools/`）+ **`src/lsp/` 62 件主体实现层**（client/manager/connection/server-definitions——daemon 必要性裁定的直接证据面）+ `post-edit/` + daemon 生命周期（`lsp-daemon` src 18 件）；`ast-grep-sg-provision/` 逐行 + **`packages/utils/src/ast-grep/` provisioning 层 10 件逐文件**（评审 B-2 增补——provision/resolve/平台矩阵实际语义所在）+ `install-ast-grep-sg.ts` 平台矩阵；OMO web 三 provider（exa/context7/grep_app）语义；**S-30 `read-image-resizer/` 过一遍**（评审 F-3 增补——确认无被四腿依赖的语义残余，支撑 §4.8 的转 Phase 7 裁定）。
  2. **Q-2 原生面钉测**：web 三层（`--dump-config` 含 web 面五行（**:471-476 provider 声明行在内**——评审 MINOR-2）/ 真实组合 boot 工具面含 `web_search`/`web_fetch` / mock 场景调用可达）；**`dsh-tool-fs` edit 语义全枚举**（唯一性约束/错误文案/重试可判性/read-before-edit 接缝——`.d.ts` 逐字 + 行为探针）+ **`str_replace_editor` 在场性钉测**（评审 MAJOR-1 增补：安装树在场 ≠ 组合挂载——实测非 dsh-base 依赖、零挂载、零反向依赖；A/B 臂 (A) 是否挂载它入臂 = 本 Q 裁定 + T2 成文）；**`dsh-mcp-client` 契约钉测**（评审 BLOCKER-1 + R2-6 形态更正：mcp-client 自身未被 dsh-base 挂载；规范形态 = **每 server 一条 `insert:` 行**（行包 = `dsh-mcp-client`，config 携该 server——模板 = `dsh-agent-preset/skills/cordis-plugin-development/templates/mcp/cordis.patch.yml` 逐字）：① 一个 fixture stdio MCP server（最小自制）单插行端到端 → `mcp__*` 工具在场、调用往返、server 崩溃/慢启动失败形态、空 scope 零工具；② **同名包双插行实例化行为钉测**（两条 mcp-client 行各带一 server 是否都成立——决定 (L-B)+(G-B) 同落的同步网代价是 4→5 还是 4→6）。
  3. **Q-3 编辑 A/B 设计**：失败模式清单终态（计划书 §4.3 四类 + 钉测新增类）；双臂任务族脚本草案；度量（失败可判性/重试轮数/静默错写率）的操作性核验（每个度量都有机读取数点）。
  4. **Q-4 LSP fork 证据**：(L-A) `lsp-core` vendor 闭包（依赖树/外部 npm 依赖/harness 耦合点逐件——playbook §7 的依赖树评估；**利好实测：lsp-core 零外部 npm 依赖（仅 `mcp-stdio-core` workspace）**，评审 MINOR-9 校准）；(L-B) 三包闭包（基数实测：src 递归 = core 87 / daemon 18 / tools-mcp 30——评审 B-1 更正）+ **重复引擎裁定项**（评审 MAJOR-3 增补：tools-mcp/src 的 25/30 = lsp-core `src/lsp/` 引擎拷贝——是否只摘 `mcp.ts`+`tools.ts`+适配层而丢弃重复引擎，与 daemon 必要性合并裁定）【**T1 实测推翻 2026-10-13**：29/30 同名件全部 = 1 行 re-export shim（`export * from "@oh-my-opencode/lsp-core/..."`），blob hash 29/29 同名不同文、零件逐字节相同，仅 `cli.ts` 独有——引擎零重复，「拷贝/丢弃」叙事作废；真实闭包 = lsp-core 65 非测试 .ts + mcp-stdio-core 6 + cli 薄面 ≈ 72 件，证据 `.omo/evidence/p6t1/FORKS.md` §0-4】+ Q-2 的 mcp-client 钉测结果对 `lsp-tools-mcp` 的适用性（`mcp-protocol-pin.test.ts` 的协议 pin 与 mcp-client 的 2026-07-28 优先策略对账）；daemon 必要性裁定（`lsp-core/src/lsp/` 自带 client/manager 层——单进程沙箱内 in-process client 可行性钉测）；fixture 语言服务器选型（本机可得性优先，typescript-language-server 候选）。**量化判据（评审 B-1 增补，R2-3 计数更正）**：(L-B) 闭包 src 非测试 .ts 实测 = **113 件**（65+18+30；按文件名去重 = 88——tools-mcp 的 25 件与 core 引擎重名）> 40 阈值 → (L-B) 不得按 1 天量级估算（T4 (L-B) 已提至 1.5 天）；闭包再超一个量级（>120 件）时 (L-C) 候选资格自动激活评审。**合规前置**：`lsp-tools-mcp` = 第三方 MIT 包（`@code-yeongyu/*`，评审 MAJOR-4）——(L-B) 的可行性评估须含名称门新案（D16 不覆盖）的成本。
  5. **Q-5 ast-grep fork 证据**：(G-A) S-16 移植形态（**移植单元 = 钩子壳 + `packages/utils/src/ast-grep/` 层**——`sg` 二进制来源/平台矩阵减 Windows（D9）/技能自带 `install.sh` 与 provision 的双来源裁定）；(G-B) v5 `ast-grep-mcp` 的 tag 选定（ROADMAP §2「代码引进 = git vendoring」行：v5.0.0 stable 若已发布则取之——**先重跑 tag 判定**，playbook 步骤 1；评审更正：引行名不引规则序号）+ 包闭包 + mcp-client 挂载可行性。
  6. **Q-6 名册席位整合面**：librarian/explore 席的 web/ast-grep 工具可达性现状（toolFilter 差集）；team 成员席的编辑面消费形态；差集成文。
  7. **Q-7 e2e 断言面与 hermetic fixture 族**：四腿场景的 mock-LLM 可断言形态；外部进程类（语言服务器/`sg`）的 CI fixture 设计（预置二进制/替身 server）；缺席响亮的负断言锚点。
  8. **Q-8 source kind 与署名清单**：本阶段全部注入点的 kind 命名表（v4 准入只拒 `kind:'plugin'` 已证——P5 Q-8）；vendor 候选清单与 licenses 计数预测（基线 checked=61）；**新钩子 H 编号预分**（评审 F-12 增补：现最高 H-34，(E-B)+(G-A) 全落地上限 = H-35/H-36/H-37——FORKS.md 预分，免 T3/T6 现场抢号；manifest 用语义 id，H 编号只活在基线文档）。
- **判定**：✅ Q-1…Q-8 各有逐字引用结论；三 fork 裁定书含双向证据；覆盖基线全条目终态；计划书修订记录成文。
- **证据**：✅ 2026-10-13 收口。PRE-1…5 全 ✅（门 2 = 90f/2056t、门 3 = 41/41、门 5 checked=61、门 6 = 37/37、门 8 = 8/8，日志 `.omo/evidence/p6t1/pre2-baseline.log`，`CI_LOCAL_EXIT=0`）。逐 Q 终态：Q-1 四面全对账（hashline 24 件 15+9 复核 / LSP 三包精确账 87=65+21+1·mjs + **tools-mcp 29/30 = 1 行 re-export shim「引擎拷贝」叙事推翻** / ast-grep 钩壳+utils 层 6 实现 491 行逐件 / web 三 provider 逐字 / S-30 双向零残余 + anthropic-only）；Q-2 原生钉测（web dump 五条目 `.omo/evidence/p6t1/dump-config-p6t1.yml`、dsh-tool-fs edit 错误文案逐字枚举、str_replace_editor 在场性四证、**mcp-client 行为钉测 9 场景全 PASS** `.omo/evidence/p6t1/mcp-client-probe/`——N server = N 插行共存 / 同名冲突逐字 / 退避契约逐字 / SDK modern 时代 + 静默降级 legacy 实证，仲裁员抽核原始日志 + 台架诚实性核查通过）；Q-3 失败模式六类终态 + 度量三机读点核验（`FORKS.md` §1.5）；Q-4 闭包窄化 ≈72 件 + daemon 记差异候选 + bun:test 排除方向 + 本机语言服务器全缺席（hermetic 替身路线）；Q-5 v5.0.0 stable 在场亲验（`eb5c55c6`）+ (G-B) 以 provisioning 为前提的叠加关系重构 + 双来源裁定；Q-6 席位差集逐类成文（read-only 六席/worker 两席/atlas/allowlist 席/team 成员席）；Q-7 fixture 族设计（MCP fixture 已在档可复用 / LSP 替身优先 / sg 假二进制 + 反向金丝雀）；Q-8 kind 表 + licenses 计数预测（`FORKS.md` §5.2）。三 fork 裁定书 = `.omo/evidence/p6t1/FORKS.md`（含 c14 不扩裁定 §0-1、H-35/36/37 预分 §0-2、臂 (A) 组成 §0-3、SUL-1.0 许可姿态 §0-6）；覆盖基线 §1–§7 全转实测（N-1…N-10 逐条闭环）；计划书修订记录 T1 条目成文。仲裁员实测全档 = `.omo/evidence/p6t1/notes-arbiter.md`。门 6（37/37）/ 门 7（10/10）改后复验绿。
- **依赖**：PRE-1…PRE-5。**量级**：1.5 天。

---

## WP-1 编辑模型（计划书 §4.3）

### [x] P6-T2 — A/B 证据台架 + 脚本化编辑任务族

- **产出**：A/B 台架（双臂驱动：同一任务族分别走**臂 (A) = 组合内已挂载的 `dsh-tool-fs` edit 面**（评审 MAJOR-1 更正：`str_replace_editor` 未挂载——T1 Q-2 已裁不入臂，`FORKS.md` §0-3 成文）与 hashline 工具面形态的**实验性接线**——台架件可一次性，但断言纪律与门 3 同级）；失败模式清单的逐类数据档（`.omo/evidence/p6t2/`，**台架脚本同档存档并附复跑命令**——评审 F-11 增补：一次性台架的证据不可复核 = 不收，P5 L2 l2-drive.mjs 先例）。
- **做法**：mock-LLM 驱动固定任务脚本；每臂每失败模式类至少一例；度量三件套（失败可判性/重试轮数/静默错写率——静默错写的断言面 = 文件最终字节比对）；双臂变异自证（故意位移/篡改夹具 → 对应断言红）。**臂 B 载体形态本任务定死**（评审 F-11）：三候选 = ① 临时薄工具插件（最接近最终 (E-B) 落地形态，首选评估）② fs provider 包装 ③ 独立进程直调 core API（**禁止单独使用**——与臂 (A) 的真实 DSH 工具面不对等，正中 R-3）；选定后声明与最终落地形态的差距折扣，成文进数据档。
- **判定**：✅ 台架双臂跑绿且变异自证红证俱全；数据档含每类失败模式的原始记录；「无差异」若成立则以数据成文（合法结局）。
- **证据**：✅ 2026-10-13 收口（编码 sub-agent 一次成功；档 `.omo/evidence/p6t2/`——DATA.md + rig/ + runs/20261013-174311/；复跑 = `bash .omo/evidence/p6t2/rig/run.sh`）。**臂 B 载体 = 候选 ① 临时薄工具插件**（hashline-face 插件注册 `hashline_edit` + read 输出锚点增强钩，经 vendored core shadow 副本——中立性 diff 仅 .ts 扩展名，`shadow-diff.txt`/`shadow-checks.txt` 双档）；差距折扣六项声明（独立命名/formatter 未移植/delete·rename 未移植/抛出 vs 返回/zod 手移植/脚本不"学"工具描述——DATA.md §1 逐项）。**驱动接缝偏差声明**：driver 插件固定脚本化政策经 `ctx.tools.execute` 全管道（mock-LLM 字面偏差——drive.mjs 为 tracked 文件，扩它 = 违一次性台架纪律；沙箱无 key 无活模型——DATA.md §1 成文）。**七类全执行零 UNTESTABLE**：F-a（A `FS_AMBIGUOUS_EDIT` 2 轮 / B 1 轮）、F-b（同 CAS 双 2 轮）、F-c（parity 实证同码同文案）、F-d（双终态）、**F-e（A 静默 1 轮字节正确 / B `HASH_MISMATCH` 具名 2 轮）+ F-e2（B 终态拒、文件不变——陈旧锚结构性不可静默错写）**、F-f（双校验类）、F-g（未分化如实记录）。**度量**：可判性 A 6/6、B 8/8；平均轮数 A 1.50 / B 1.67；**静默错写率双臂 0**。**突变自证 M1/M2/M3 全红按预期**（腐锚终拒/篡改预期件字节比对红/去重复行歧义断言落空——原始档逐条在案）。**仲裁员抽核**：F-e 双臂 wire 级 JSONL 逐行复核；hash 与 vendored core 一致性亲算（`inserted B/C` 真实碰撞 YV 复现、`TARGET` BH 跨行稳定）；M2 红行定点复核；shadow 中立性 diff 复核；git status 零 tracked 改动（该台架期）。
- **依赖**：P6-T1（Q-3 终态）。**量级**：1 天。

### [x] P6-T3 — 编辑模型决策落地 ⚖️（fork E 终裁 = **(E-A)**，2026-10-13）

- **产出**（双臂二选一，以 T1/T2 证据裁定）：
  - **(E-A)**：覆盖基线记差异条目（hashline-core 维持 vendored-unconsumed 的**理由** = A/B 数据）；S-14/S-15 以「原生覆盖」闭环（理由引用 A/B 数据，不许空手闭环）；决策登记候选草稿。
  - **(E-B)**：**薄工具面 + enhancer 双钩**（评审 F-1/B-3 重定义 + R2-1 再更正 2026-10-13：上游工具层 24 件 = **15 薄 re-export shim（语义已在 vendored core 内，直接 import 即上游忠实路径，`package.json:22` workspace 依赖逐字）+ 9 自留件（5 非测试实现 + AGENTS.md + 3 测试——R3-1 订正：`formatter-trigger-cache.ts` 实现件不存在，cache 是 `formatter-trigger.ts` 内导出）**——移植单元 = 5 实现件（`tools.ts` 注册/`tool-description.ts`/`hashline-edit-executor.ts`/`formatter-trigger.ts`/`index.ts`）+ 配置门（E-5）；锚点校验/diff 生成经 shim 即在 vendored core——只搬双钩产不出裁定标准要求的 stale-anchor 拒绝证据——原「双钩即 (E-B)」定义与「内联副本」叙事双双作废）——**落点拓扑随本任务裁定成文（评审 R2-7②③ 增补）**：① 落点候选 = omo-hooks 内非钩模块或独立包——注意 c13 只扫 `omo-hooks/src/hooks/`（工具模块落 `src/tools/` 则不受 c13 文件集断言覆盖），**须给落点指定静态门家**（c26 式 manifest↔文件集合断言或独立包四件套）；② 工具注册先例 = **omo-team**（`agent/created` listener 内 `agent.ctx.tools.register(...)`，`team-create.ts:423`/`team-delete.ts:318`——工具面先例），H-34 fork (ii) 是纯服务先例（不同族，勿误引）+ omo-hooks 两个 enhancer 条目移植（H 编号以 T1 预分为准；**`EXPECTED_HOOK_COUNT` 同步网五点位同 commit**（评审 F-5 列点）：① manifest.ts:184 计数常量 ② `tests/omo-hooks/registration.test.ts`（EXPECTED_SUMMARY_LINE + legalRows 族）③ `tests/omo-hooks/manifest-coverage-consistency.test.ts` ④ `scripts/verify-concerto-static.mjs`（c13/c14 + 计数守卫）⑤ `scripts/concerto-mode-probe.sh`（boot 注册行派生计数）——Phase 4 R-11 漏列教训）+ 单测 + e2e 编辑场景（锚点防住的失败模式类逐类断言）+ S-14/S-15 闭环为「已移植」。
- **判定**：✅ 裁定书进 `FORKS.md`（双臂证据齐全）；落地形态**门 1/2/3/6/8 绿**（评审 F-4 更正：移植钩子代码漏门 1 typecheck 是新文件进根编译程序的破门位，漏门 6 触发 c13/c14 + EXPECTED_HOOK_COUNT 守卫，漏门 8 probe marker——T4 的门列法为参照）；(E-B) 时 enhancer 的反向金丝雀（未生效 vs 生效可区分）在位。**两臂共通附带件（评审 NIT-2 登记）**：`bash-file-read-guard.ts:28-29` 注释把 hashline-edit 决策指向「plan §4.4」，实际裁定节 = 计划书 §4.3——随本任务 commit 订正该注释引用（编码件，交编码 Sub-agent）。
- **证据**：✅ 2026-10-13 收口。**fork E 终裁 = (E-A)**（裁定书 `FORKS.md` §1.7，七条证据对账 + 三复审触发条件成文）：① 七类零正确性差异（静默错写率双臂 0）；② 原生面六类可判失败全覆盖且 CAS parity；③ 唯一结构性差异（F-e 检测保证）未转化为正确性差异；④ 效率反向（A 1.50 < B 1.67）；⑤ 模型层优势未测量（台架声明缺口 vi——裁定纪律不认未测推测）；⑥ 成本面违反原生优先（5 实现件 + 门 + 钩 + 同步网 vs 上游默认 OFF 实验件）；⑦ 上游自身姿态（默认 OFF + diff-enhancer 孤儿）。落地件：覆盖基线 E-1…E-7 全转 recorded-difference/native-adopt 终态（E-6 = A/B 胜方）；**S-14 记差异**（孤儿 + 原生等价双依据）、**S-15 原生覆盖闭环**（A/B 数据引用非空手）；H-35/H-36 预分号回收；**D19 决策登记双语成文**（docs/decisions_zh-CN.md + docs/decisions.md，含复审触发条件与 str_replace_editor 落差注记）；NIT-2 附带注释订正（编码 sub-agent，`bash-file-read-guard.ts` §4.4→§4.3 + D19/(E-A) 终态注）。(E-A) 下无代码落地——门列无需新增断言，门 6/7 改后复验绿。
- **依赖**：P6-T2。**量级**：(E-A) 2 小时 / (E-B) **2 天**（评审 F-1 重定义后含薄工具面，与 §7 WP-1 分支矩阵对齐）。

---

## WP-2 LSP（计划书 §4.4）

### [~] P6-T4 — LSP fork 落地 ⚖️

- **产出**（三向一，以 T1 Q-4 证据裁定）：
  - **(L-A)**：vendor `lsp-core`（playbook 全套：manifest/NOTICE/deviations/扩展名补全机械证明——T8a/T8b 纪律）+ `patches/omo-dsh/omo-lsp/` 新包（薄工具面：lsp-core 工具族的模型面对账 + 语言服务器生命周期 + `post-edit` 接线）+ **第五插行 + COUNT COUPLING NET 4→5 同 commit 全点位** + **新包接线三点位（评审 R2-7① 增补，P5-T2 先例）**：根 `package.json`（**`typecheck:lsp`** 脚本 + 接入 `typecheck:libs` 链——R3-2 命名更正：与 `typecheck:team` 同构的包名后缀惯例（实测惯例 = host/client/hooks/commands/team），漏了则门 1 覆盖不到新包）、`pnpm-lock.yaml` workspace 机械登记、`tsconfig.host.json`（Node 24 strip-only 约束注）。
  - **(L-B)**：vendor 闭包（lsp-tools-mcp + lsp-core + lsp-daemon——**注意 25/30 重复引擎裁定项**（Q-4）：~~只摘适配层丢弃引擎拷贝则闭包大幅收窄，裁定成文~~【**T1 实测推翻 2026-10-13**：tools-mcp/src 29/30 = 1 行 re-export shim、引擎零重复（`FORKS.md` §0-4 三证）；窄化闭包 = **lsp-core 65 非测试 .ts + mcp-stdio-core 6 + cli.ts 级薄面 ≈ 72 件**（仍 >40，量级不变）；lsp-daemon 不进闭包（in-process manager 自洽，记差异候选）】；**测试携带决策行（评审 R2-8 增补，P5-T8a 先例）**：lsp-core src 含 21 个 `.test.ts`【T1 实测 = **bun:test**（3 件抽查 `from "bun:test"` 逐字）→ 默认不携带、登记排除理由】、lsp-daemon 另有 test/ 目录（实测 22 件，vitest——daemon 若记差异则随包不移植））+ 根 `cordis.yml` **mcp-client `insert:` 插行**（评审 BLOCKER-1 + R2-6 更正：每 server 一条插行、行包 = mcp-client——**触发同步网 4→5**）+ `mcp__*` 工具面核验；`post-edit` 不可达记差异；**合规前置**：`@code-yeongyu/lsp-tools-mcp` 为 MIT 第三方包——名称门新案决策候选随本任务同 commit 登记（评审 MAJOR-4，§4.10）【T1 收窄：窄化 (L-B) 不 vendor 该包，新案降为归属措辞案——cli 薄面若参照其 cli.ts 则 NOTICES 记 MIT 条目，`FORKS.md` §0-6】。
  - **(L-C)**：记差异文档（硬理由成文——LSP 在 ROADMAP 目标句具名，defer 是重裁定，理由须扛住评审）；**T5 随之取消（删除线 + 理由，不算未完成）**。
- **判定**：✅ 裁定书进 `FORKS.md`；落地形态门 1/2/4/5/6 绿；vendor 漂移检测绿；licenses 计数变化有对应；**任何新插行**（(L-A) 新包行或 (L-B) mcp-client 行）同步网零漏点。
- **证据**：⬜
- **依赖**：P6-T1（Q-4 终态）。**量级**：(L-A) 1.5 天 / (L-B) **1.5 天**（评审 R2-3：113 件非测试闭包【T1 窄化后 = 72 件，仍 >40 阈值，量级结论不变】 + 扩展名墙高概率复现 + 名称门新案【T1 收窄为归属措辞案】，1 天不可信——判据与量级自此一致） / (L-C) 2 小时。

### [ ] P6-T5 — LSP e2e 场景 + doctor-lite 检查

- **产出**：e2e `lsp-*` 场景（canonical 名 T1 定名）：fixture 项目 + 真实语言服务器（Q-4 选型）→ agent 完成一次定义/诊断查询，断言结果内容真实来自服务器（非编造——反向金丝雀：服务器缺席时具名响亮，静默空结果 = 红）；doctor-lite 的 LSP 面检查（(L-A) = omo-lsp 行 + 服务器探测；(L-B) = **mcp-client 插行 + per-server 配置校验**——R2-4g 同步）。
- **做法**：hermetic fixture 纪律（Q-7 设计）：CI 用预置/替身，真实安装路径归 L2；probe 的 LSP 探测 marker（在场形态/缺席具名双向）。
- **判定**：✅ 门 3/4/8 绿；反向金丝雀变异自证（掐服务器 → 具名断言红）。
- **证据**：⬜
- **依赖**：P6-T4（(L-C) 时本条取消成文）。**量级**：0.5–1 天。

---

## WP-3 ast-grep（计划书 §4.5）

### [ ] P6-T6 — ast-grep fork 落地 ⚖️

- **产出**（两向一，以 T1 Q-5 证据裁定）【**T1 实测重构 2026-10-13**：(G-B) 以 sg 二进制在位为前提（`sg-runner.ts` spawn sg、`mcp.ts:25` import v5-only `resolveSgBinarySync`）——非互斥二选一，真实问题 =「(G-A) 技能+bash 面自足」vs「(G-A)+(G-B) 叠加结构化 MCP 面」；v5.0.0 stable 在场性亲验（tag `eb5c55c6`），(G-B) 闭包 = ast-grep-mcp 9 实现 + mcp-stdio-core 6 + v5 utils/ast-grep 8 实现 ≈ 23 件，证据 `FORKS.md` §3.2】：
  - **(G-A)**：S-16 `ast-grep-sg-provision` 移植 = omo-hooks 新条目（模块内演进，**`EXPECTED_HOOK_COUNT` 同步网五点位同 commit**——点位清单见 T3 (E-B) 臂，评审 F-5 列点）：**移植单元 = 钩子壳 + `packages/utils/src/ast-grep/` provisioning 层 10 件**（评审 B-2 增补——`provisionSgBinary`/`findSgBinarySync`/manifest/平台矩阵的实际语义在 utils 层，只搬钩子壳 = 能力半残）——`sg` 二进制保障（平台矩阵减 Windows，D9【T1 逐件清单：types/sg-manifest/sg-provisioner/install-script 的 win32 分支 + install.ps1 + smoke.ps1 记差异】）+ 保障失败响亮（具名 marker + 结构化指引）+ 已 vendor `ast-grep` 技能前提核验（技能教的调用路径与 provision 保障的产物一致——空头指令纪律：技能在场而二进制无保障 = 红）【T1 双来源裁定：钩层 provision（sha256 校验，pin 0.43.0）= 权威来源；技能自带 install.sh（无校验和）= 保留的技能文档/回退路径，`FORKS.md` §3.2】。
  - **(G-B)**：selective lift `ast-grep-mcp`（v5 tag，playbook 全套 + 决策登记双语——**依据层级注记（评审 NIT-1）**：D14 表行原文授权「fixes」，capability 级授权锚在 decisions.md:118 条款 4 + ROADMAP「定向搬运」行，裁定书须显式引后者并记措辞差）+ **mcp-client `insert:` 行**（评审 BLOCKER-1 更正：非「配置行」，**触发同步网**——若与 (L-B) 同落则两臂各一条 4→5→6）+ 技能消费侧注记（技能教 `sg` CLI，MCP 形态的工具面差异注记——T12 N1 先例）。
- **判定**：✅ 裁定书进 `FORKS.md`；落地形态**门 1/2/4/5/6 绿**（评审 F-4 更正：补门 1 typecheck）；(G-B) 时 lift 清单逐项署名。
- **证据**：⬜
- **依赖**：P6-T1（Q-5 终态）。**量级**：(G-A) 0.5 天 / (G-B) 1 天。

### [ ] P6-T7 — ast-grep e2e 场景

- **产出**：e2e `ast-grep-*` 场景（canonical 名 T1 定名）：agent 在 fixture 仓执行结构搜索/改写（技能指导 → `sg` 或 MCP 工具真实产出匹配结果，断言匹配内容 = fixture 预期行）；反向金丝雀 = `sg`/server 缺席时响亮（静默降级 = 红）。
- **判定**：✅ 门 3 绿；缺席路径具名断言 + 变异自证。
- **证据**：⬜
- **依赖**：P6-T6。**量级**：0.5 天。

---

## WP-4 web（计划书 §4.6，无 fork——验证腿）

### [ ] P6-T8 — web 面三层验证 + e2e + 席位整合

- **产出**：e2e `web-search-fetch-*` 场景（canonical 名 T1 定名）：① 工具面在场断言（真实组合 boot 后 `web_search`/`web_fetch` 在模型工具面——probe 真面断言先例）；② 调用真实发生（mock 场景 agent 发起调用——注意 dsh-tool-web 的 provider 接线在 mock 环境的形态，T1 Q-2 钉测）；③ **诚实性断言**（无 key/无后端时结构化错误具名形状，**不许断言搜索成功**）；名册席位差集成文（librarian/explore 席 web 可达性，Q-6）；H-24 护栏联动复核（web_fetch SSRF 守卫不回退的断言）；OMO 三 provider 记差异条目（覆盖基线 §5）。
- **判定**：✅ 门 3/8 绿；三层断言各自独立可红；三 provider 处置成文。
- **证据**：⬜
- **依赖**：P6-T1（Q-2/Q-6）。**量级**：0.5 天。

---

## WP-5 门与 e2e 收口（计划书 §4.9）

### [ ] P6-T9 — 门扩展与 probe 面

- **产出**：门 6 静态门 c 组延续（新条目署名头覆盖 / manifest↔文件集合 / vendor 条目存在性 / **c14 基线文档并集 = T1 显式仲裁项**（评审 MAJOR-5 升级：与 P5-T14「不扩展 + 活体针」裁决并列记载，二选一并写清代价——(a) 扩并集 = 先交付 `phase6-mcp-editing.md` §1 重排为 c14 六列契约（`| H-xx |` 行 + 状态列下标 4）的重排件；(b) 不扩 = 扩展 c22 式作用域或新增独立检查 + 同步活体针措辞——**默认沿 (b) 条件式**：含 H-号段已移植行才入并集））；门 8 probe 四腿探测面（在场性具名 marker；缺席响亮）；门 4 doctor-lite 的 `sg`/LSP 检查（随 T5/T6 落地件）；**任何新插行触发时（(L-A) 新包行 / (L-B)/(G-B) 的 mcp-client 行，评审 BLOCKER-1 更正触发条件）**：同步网 4→5(→6) 全点位同 commit（doctor-lite `EXPECTED_INSERT_ROW_IDS`（doctor-lite-core.ts:48）、cordis-inserts.test、cold-start、drive.mjs、probe、smoke-real、cordis.yml 头注）+ **门 6 新包四件套**（评审 F-10 增补：(L-A) 时按 omo-team 先例 c25 全文件署名头 / c26 manifest↔文件集合双向钉 / c27 vendor 存在性 / c28 NOTICES mirror——注意 c13 只扫 `omo-hooks/src/hooks/`，新包 `src/` 在其射程外，须显式列新包断言）+ 门 6 断言数终值预测（37 → ?）。
- **判定**：✅ 全 8 门绿；静态门新断言各自变异自证；同步网零漏点（**grep 全点位复核 + 门 6 实跑**——评审 MAJOR-5 升级：只 grep 不足证）。
- **证据**：⬜
- **依赖**：P6-T3/**T4**/T6/T8 的落地件 + **T5 的落地件（(L-C) 裁定时以 T4 的记差异文档替代——评审 B-4 增补：(L-C) 下 T5 取消，本行不得悬空）**（可分批，同 commit 原则不变；R2-5 更正：补 T4 本体——(L-A)/(L-B) 下插行/新包由 T4 落地，本任务的同步网复核与新包四件套以 T4 为前置）。**量级**：0.5 天。

---

## WP-6 收口（计划书 §5/§9）

### [ ] P6-T10 — 合规复核 + 文档双语 + 覆盖基线终态

- **产出**：`THIRD_PARTY_NOTICES.md` Phase 6 小节（语义移植表先例格式 + vendor 表）；licenses 计数终态核对（基线 61 → 实测，每变化有对应；**MIT（`@code-yeongyu/*`）与 SUL（`@oh-my-opencode/*`）两条合规路径分列**——评审 MAJOR-4）；决策登记（fork 三裁定的 D 条目候选 + 名称门新案（若 (L-B)）+ NIT-1 措辞差注记，双语）；ROADMAP Phase 6 措辞修订（「走 dsh-lsp」F-1 更正 + 「活方向」F-2 更正，双语）；可行性报告「实施期订正」节（**两处**：§1.1 映射表行 + §2.3 web 映射行（`exa/context7/grep_app → dsh-web-search-exa` 等价句）——评审 8i 增补，双语）；README Phase 6 状态行（双语）；CHANGELOG；覆盖基线全条目终态（含 S-14/15/16 闭环、S-30 转期裁定、MCP 七件处置、席位差集）。
- **判定**：✅ 门 5/6/7 绿；**文档间一致性靠双评审核对**（评审 8d 更正：check-docs-consistency 实测只查 d01–d10 版本 token/矩阵/安装器 pin，**不查** plans 三文档间一致性——别挂门 7）；fork 被否臂全部成文。
- **证据**：⬜
- **依赖**：P6-T2…T9 全部落地件（评审 MINOR-7 更正：原稿「T3…T9」漏 T2——覆盖基线终态要吃 A/B 数据，T2 直列；**(L-C) 裁定时 T5 以 T4 记差异文档计**——评审 B-4 增补）。**量级**：0.5 天。

### [ ] P6-T11 — 退出标准核对 + L2 真机 + 结项

- **产出**：退出标准核对表（计划书 §5 的 a/b/c + DoD c/d/e 逐条 ✅/证据指针）；**L2 真机证据**（`.omo/evidence/p6-l2-*`）：真实模型真实任务——编辑对比（A/B 裁定的真实模型复核腿）+ LSP 查询 + `sg` 结构搜索 + 真实 web 搜索（真实 API key，redaction 纪律——T16 BLOCKER 教训：launch token/密钥先杀进程再涂改再全树 grep）；终态 `scripts/ci-local.sh` 全 8 门复跑归档；结项 commit。
- **判定**：✅ 核对表全 ✅；L2 证据档成文（每项被选定能力各有一次真实使用记录）；ci-local 8/8 绿归档。
- **证据**：⬜
- **依赖**：P6-T10。**量级**：0.5 天。
