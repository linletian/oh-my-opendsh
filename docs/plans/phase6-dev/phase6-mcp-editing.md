# Phase 6 覆盖基线：MCP/编辑面清单

> **上游依据**：[开发计划书](./phase6-plan.md) · [任务清单](./phase6-tasks.md) · [ROADMAP Phase 6](../../roadmap_zh-CN.md) · [可行性报告 §1.2/§2.3/§2.6/§16.2](../../feasibility-report_zh-CN.md)
>
> **状态**：🚧 **计划期草案**（2026-10-12）——本表每行的「处置」列在 P6-T1 钉测后转实测终态（`git show/ls-tree` 逐字 + 原生钉测证据）；草案期的依据列写明计划期已核实的事实与待核项。逐行终态纪律沿用 Phase 3/5：**每行都要有成文裁定，不许默认滑过**。
>
> **修订记录**：**2026-10-13 评审修复（第 1+2+3 轮）**——E-7 新增（hashline 工具面）并重述为「15 shim + 9 自留件（5 实现 + AGENTS.md + 3 测试，R3-1 终值）」、G-2b 新增（utils provisioning 层）、L-1/L-4/L-5 计数与主体层更正、E-6 原生臂改已挂载 edit 面、W-1/W-2/W-7 引用更正、§6 补 S-30 转 Phase 7 + (L-C) 替代验收行、§7 待核清单扩 N-2b/N-3b。逐条裁决见 phase6-review-{1,2,3}-response.md（仲裁台账，存 `.omo/evidence/p6-plan-review/`——gitignored 证据档，不入库）。**路径口径声明**：§1/§3 表的「上游源」列 = `packages/` 相对（R2-2/R3-5）。
>
> **处置枚举**（沿用 Phase 5 四值 + 本阶段增补）：`native-adopt`（原生采用——给在场证明）/ `ported`（语义移植）/ `content-vendor`（内容/代码 vendor，playbook 全套）/ `recorded-difference`（记差异——理由成文）/ `excluded`（排除——ROADMAP 或决策明文）/ `deferred`（挂起——硬理由 + 重议触发条件）。

---

## 1. 编辑面清单

| # | 面 | 上游源（v4.19.4，`packages/` 相对） | 原生面对应 | 处置（草案） | 依据 / 待核 |
|---|---|---|---|---|---|
| E-1 | `hashline-core`（LINE#ID 内容哈希锚定） | `hashline-core/`（**已 vendor** 于 `patches/omo-dsh/vendor/hashline-core/`，78 测试绿，**零 import 消费**——R2-4h/MINOR-3 口径） | `dsh-tool-fs` edit（**已挂载**）；`dsh-tool-str-replace-editor`（**未挂载**，见 E-6——R2-4h 同步） | **fork E 裁定对象**（T3） | ROADMAP 明文 A/B 证据裁定；S-46 已实证原生覆写守卫+CAS 是 OMO write-guard 超集 |
| E-2 | `hashline-read-enhancer/` 钩子 | `omo-opencode/src/hooks/hashline-read-enhancer/` | 读取结果锚点增强（`tools/post-execute` 族） | **fork E 裁定对象**（= S-15） | Phase 3 deferred 登记（phase3-hooks.md:79）；T1 Q-1 逐文件语义 |
| E-3 | `hashline-edit-diff-enhancer/` 钩子 | `omo-opencode/src/hooks/hashline-edit-diff-enhancer/` | 编辑 diff 增强（`tools/post-execute` 族） | **fork E 裁定对象**（= S-14） | Phase 3 deferred 登记（phase3-hooks.md:78）；同上 |
| E-4 | atlas `write-edit-tool-policy.ts` | `omo-opencode/src/hooks/atlas/write-edit-tool-policy.ts` | atlas 席位的写/编辑工具策略 | 草案：**recorded-difference**（atlas 席位的 team/编排语义收窄已在 Phase 5 裁定；本件的守卫对象待 T1 Q-1 核实） | 待核：该文件是否仅服务 hashline 工具面（是则随 fork E 联动） |
| E-5 | experimental 配置门（hashline 开关） | `omo-opencode/src/config/schema/experimental.ts` | 本仓 omo 侧 Config 行 | 随 fork E：(E-B) 时移植开关语义；(E-A) 时记差异 | **字段名计划期已结**（R2-10：`:18-19` 逐字 `hashline_edit: z.boolean().optional()` + 文档注释 "Enable hashline_edit tool for improved file editing with hash-based line anchors"）；T1 只剩默认值与 schema 定位核验 |
| E-6 | DSH 原生编辑面语义（对照基线） | —（DSH 侧） | **组合内已挂载 = `dsh-tool-fs` 的 read/write/edit**（dsh-base `cordis.patch.yml:281-282`）+ read-before-edit + sandbox 围栏 + `FS_STALE_VERSION` CAS；**`dsh-tool-str-replace-editor` 在安装树但未挂载**（评审 MAJOR-1 更正 2026-10-13 亲验：非 dsh-base 依赖、零挂载、零反向依赖） | **native-adopt**（A/B 原生臂 = 已挂载 edit 面；str-replace-editor 是否挂载入臂 = T1 Q-2 裁定 + T2 成文；不挂载则本行记差异注明 ROADMAP 点名对象与组合实况的落差） | T1 Q-2 全枚举（错误文案/唯一性约束/重试可判性）+ 在场性钉测 |
| E-7 | **hashline 编辑工具面**（工具注册/描述/执行器本体——评审 F-1/B-3 增补行 2026-10-13，R2-1 再更正） | `omo-opencode/src/tools/hashline-edit/`（**24 件全树 / 21 非测试**，亲验）——**结构 = 15 薄 re-export shim（逐字 import `@oh-my-opencode/hashline-core`，语义已在 vendored core 内）+ 9 自留件（5 非测试实现：`tools.ts`/`tool-description.ts`/`hashline-edit-executor.ts`/`formatter-trigger.ts`（cache 为其内导出，无独立实现文件——R3-1 订正）/`index.ts` + AGENTS.md + 3 测试）**；`package.json:22` workspace 依赖逐字；gating = `packages/omo-opencode/src/plugin/tool-registry-gated-tools.ts:32`（R2-9 全路径更正）`hashline_edit ? { edit: createHashlineEditTool(ctx) }` | `dsh-tool-fs` edit 写入路径（可行性报告 §2.6 定位 = 替换；`str_replace_editor` 未挂载见 E-6） | **fork E 裁定对象**（随 T3）：(E-B) 的移植单元 = **5 个自留实现件 + 配置门（E-5）**（R3-1 订正；shim 层语义随 vendored core 免费在场——**消费 vendored core 即上游忠实路径，无「语义源」裁定项**，R2-1）；(E-A) 时记差异，且须正面回答为何不搬工具面（ROADMAP §3 约束 5「不取自适配层」的适用性——本目录在 `omo-opencode/src/tools/` 属适配层） | 计数对账：tmp 29 / mcode 26 均未复现，以亲验 24 为准；第 1 轮「内联副本」叙事**实测为假已作废**（R2-1） |

## 2. LSP 面清单

| # | 面 | 上游源（v4.19.4） | 原生面对应 | 处置（草案） | 依据 / 待核 |
|---|---|---|---|---|---|
| L-1 | `lsp-core` 工具族 + **主体实现层**（评审 F-7/B-1 补层 2026-10-13） | `lsp-core/src/tools/` + `tools.ts`（全名单 T1 Q-1 枚举）+ **`src/lsp/` 62 件**（client/manager/connection/server-definitions/server-installation/process 等；含 3 个 fixture 文件——R2-11 口径注）；包 src 递归 = **87 件 / 非测试 .ts 65 件**（亲验口径） | **无**（F-1：`dsh-lsp*` 不存在） | **fork L 裁定对象**（T4） | harness-neutral 依据 = **可行性报告 §1.2 的 19 包名单**（含 lsp-core，引上游 ROADMAP.md:42-48——R2-4j/MINOR-9 更正：本仓 ROADMAP §3 约束 5 无 19 枚举）+ lsp-core package.json 自述逐字；闭包量级 = hashline-core（29 件）的 3 倍，R-1 量化判据随附 |
| L-2 | `lsp-core` `post-edit/`（编辑后诊断） | `lsp-core/src/post-edit/` | `tools/post-execute` 事件族 | (L-A) 时随 vendor 接线；(L-B) 时 **recorded-difference**（MCP 边界外不可达） | T1 Q-4 |
| L-3 | `lsp-core` MCP 协议 pin / request-context / missing-dependency-result | `lsp-core/src/mcp.ts`、`mcp-protocol-pin.test.ts`、`request-context.ts`、`missing-dependency-result.ts` | `dsh-mcp-client` 协议面（2026-07-28 优先） | 随 fork L | 协议 pin 与 mcp-client 策略对账（T1 Q-4②）；缺席具名错误 = 响亮降级纪律的落地件 |
| L-4 | `lsp-daemon` 生命周期 | `lsp-daemon/src/`（**18 件递归全非测试**——评审更正：原稿「14 件」为非递归顶层误数：daemon-server/client、socket-jsonrpc、lock、ownership、version-reap 等） | 无（本仓单进程沙箱纪律） | **daemon 必要性裁定**（T1 Q-4③）：`lsp-core/src/lsp/` 自带 client/manager——in-process client 可行则不 vendor daemon | daemon 的存在理由（多进程共享/预热）在本仓形态下是否成立 |
| L-5 | `lsp-tools-mcp`（MCP server CLI 适配——**实为自含引擎**：src 30 件中 25 件 = lsp-core `src/lsp/` 的重复拷贝（评审 MAJOR-3 亲验文件名交集 25/25）；**且为第三方 MIT 包 `@code-yeongyu/lsp-tools-mcp`，非 `@oh-my-opencode` SUL 件**（评审 MAJOR-4：D16 名称门不覆盖该 scope = 决策候选）） | `lsp-tools-mcp/src/`（**30 件递归全非测试**——评审更正：原稿「7 件」误；tmp 评审的 32 未复现，以亲验 30 为准） | `dsh-mcp-client` stdio 挂载（**= 新插行，触发同步网**——评审 BLOCKER-1） | (L-B) 形态的消费件；ROADMAP §3 约束 5 注记：适配层不作语义源，(L-B) 下语义源仍是 lsp-core；**是否只摘 `mcp.ts`+`tools.ts`+适配层丢弃重复引擎 = Q-4 裁定项** | T1 Q-4 闭包钉测 + 合规前置（MIT 署名 + 名称门新案） |
| L-6 | `lsp-setup` 技能（已 vendor） | `shared-skills/skills/lsp-setup/`（本仓 `patches/omo-dsh/vendor/shared-skills/skills/lsp-setup/`——评审 MINOR-4：前缀补全） | `ctx.skills`（SKILL_GESTURE 在服务） | **native-adopt + 消费侧注记**（技能前提与 LSP 工具面的一致性；空头指令纪律） | F-4；技能文本的载体句核验（T1 Q-1） |

## 3. ast-grep 面清单

| # | 面 | 上游源（v4.19.4） | 原生面对应 | 处置（草案） | 依据 / 待核 |
|---|---|---|---|---|---|
| G-1 | `ast-grep-sg-provision/` 钩子（**薄壳**——hook.ts 逐字 import `provisionSgBinary`/`findSgBinarySync` 自 `@oh-my-opencode/utils`，评审 B-2 实证） | `omo-opencode/src/hooks/ast-grep-sg-provision/`（hook.ts/index.ts + 测试） | 无原生对应（二进制保障语义） | **fork G 裁定对象**（= S-16，T6）；**移植单元 = 本壳 + G-2b 的 utils 层，不可分割** | Phase 3 deferred 登记（phase3-hooks.md:80） |
| G-2 | `install-ast-grep-sg.ts` 安装器 | `omo-opencode/src/cli/install-ast-grep-sg.ts`（+ `omo-codex/src/install/` 同族） | 无 | 随 (G-A) 移植其平台矩阵（**减 Windows 段，D9**） | T1 Q-5① 二进制来源与平台矩阵 |
| G-2b | **utils provisioning 层**（评审 B-2 增补行 2026-10-13：provision/resolve/manifest/平台矩阵的实际语义所在） | `utils/src/ast-grep/`（**10 件**亲验：index/install-script/sg-manifest/sg-provisioner/sg-resolver/types 6 实现 + 4 测试——R2-2 的「补全路径」适用于无声明口径的 plan/tasks 正文；本表上游源列已声明 `packages/` 相对，行内按列口径写（R3-5）） | 无 | 随 (G-A) 语义移植（hooks 条目消费其语义）或按需 vendor 子集；(G-B) 时记差异 | 原草案「三类命中」漏本层——`git ls-tree -r v4.19.4 \| grep ast-grep` 实测 34 条（计划期 `head -10` 截断致漏，教训在册） |
| G-3 | `ast-grep` 技能（已 vendor） | `shared-skills/skills/ast-grep/`（本仓在册：SKILL.md + `scripts/ast_grep_helper.py` + `install.sh`/`install.ps1`） | `ctx.skills`（在服务） | **native-adopt + provisioning 衔接**（技能自带 `install.sh` 与 S-16 钩子的双来源裁定，T1 Q-5②）；`install.ps1` = Windows 件记差异（D9） | F-4；空头指令纪律（技能教 `sg` 而二进制无保障 = 红） |
| G-4 | `@oh-my-opencode/ast-grep-mcp`（**v5 时代件，不在冻结基线**） | v5 tag 待定（T1 重跑 tag 判定——playbook 步骤 1） | `dsh-mcp-client` stdio 挂载 | **fork G 的 (G-B) 臂**：selective lift（ROADMAP §2「定向搬运」行——评审 8f 更正：§2 具名行无编号）+ 决策登记 | F-2；「上游的活方向」行文依据在册（ROADMAP Phase 6）；基线纪律（D14）反向论据同样在册 |

## 4. web 面清单

| # | 面 | 上游源（v4.19.4） | 原生面对应 | 处置（草案） | 依据 / 待核 |
|---|---|---|---|---|---|
| W-1 | web 搜索（模型面工具） | OMO 三 provider 之一后端 | **`dsh-tool-web` 的 `web_search`**（dsh-base：`:471-476` web 服务行 + provider 声明（`searchProvider: deepseek-official`）+ `:478-481` `web-search-deepseek`（`apiKeyEnv: DEEPSEEK_API_KEY`）+ `:486-490` `tool-web`——评审 MINOR-2 行号更正） | **native-adopt**（三层断言：配置/工具面/行为，T8） | F-3；诚实性断言（无 key 时结构化错误具名，不许断言成功） |
| W-2 | web 抓取（模型面工具） | 同上 | **`dsh-tool-web` 的 `web_fetch`**（dsh-base：`:471-476` provider 声明（`fetchProvider: http`）+ `:483-484` `web-fetch-http` + `:486-490` `tool-web`（`fetch: true`）） | **native-adopt**（同 W-1） | F-3；H-24 护栏联动复核（SSRF 守卫不回退） |
| W-3 | `exa` MCP（web 搜索 provider） | OMO 内建 MCP 配置 | `dsh-web-search-exa` 在可行性报告名单但**实装缺席** | 草案：**recorded-difference**（内建 deepseek 后端覆盖；真需要走 mcp-client 或原生 provider 行，本阶段不建设） | 待核：OMO 侧 exa 的语义残余（是否仅 provider 多样性问题）——T1 Q-1⑦ |
| W-4 | `context7` MCP（文档查询） | OMO 内建 MCP 配置（librarian 席位消费） | 无直接对应；最近邻 = web_fetch + 技能指引 | 草案：**recorded-difference**；librarian 席位差集成文（Q-6） | 同上 |
| W-5 | `grep_app` MCP（代码搜索 provider） | OMO 内建 MCP 配置 | 无对应；最近邻 = 本地检索 + web_search | 草案：**recorded-difference** | 同上 |
| W-6 | webfetch 护栏族 | `omo-opencode/src/hooks/webfetch-redirect-guard/` 等 | **已移植**（Phase 3 H-24，B+D 形态，SSRF 护栏） | **native-adopt（已落地）+ 联动复核**（本阶段任何 web 改动不得回退其语义） | phase3-hooks.md:52；约束 6 |
| W-7 | 名册席位 web 可达性 | librarian = web 搜索/context7（可行性报告 §2.1）；explore = ast-grep | 席位 toolFilter（双机读面在册：doctor-lite roster 契约（10 委派行逐席 deny/深度/路由校验）+ 静态门 c10.1–c10.10 live roster 断言——评审 8e/B-5 更正引用） | 差集裁定成文（**不改席位路由本身**——名册 = Phase 2 产物） | T1 Q-6 |

## 5. OMO MCP 七件处置总表

| MCP | 处置（草案） | 依据 |
|---|---|---|
| LSP（`lsp-tools-mcp`/`lsp-daemon`/`lsp-core`） | **fork L 裁定对象**（§2 L-1…L-5） | ROADMAP Phase 6 目标句具名 |
| ast-grep | **fork G 裁定对象**（§3 G-1…G-4；v4.19.4 无 MCP 包 = F-2） | ROADMAP「活方向」+ D14 基线纪律双向在册 |
| codegraph | **excluded**（上游已删——MCP server/bootstrap/config 全移除，§16.2） | ROADMAP Phase 6 明文排除 |
| grep_app / context7 / exa | **recorded-difference**（草案，§4 W-3…W-5） | DSH 内建覆盖 web 需求 |
| git-bash-mcp | **excluded**（Windows 专用） | D9 |

## 6. Phase 3 deferred 接盘表

| 行 | 模块 | 接盘任务 | 终裁方向 |
|---|---|---|---|
| S-14 | `hashline-edit-diff-enhancer/` | P6-T3 | fork E：(E-B) 移植（薄工具面 + 双钩，E-7 行）/ (E-A) 以 A/B 证据「原生覆盖」闭环 |
| S-15 | `hashline-read-enhancer/` | P6-T3 | 同上（同 fork 同 commit） |
| S-16 | `ast-grep-sg-provision/` | P6-T6 | fork G：(G-A) 移植（钩子壳 + utils 层 = G-1 + G-2b 不可分割）/ (G-B) 以「MCP 形态替代」闭环 |
| S-30 | `read-image-resizer/`（18 文件，phase3-hooks.md:94） | P6-T1 过一遍（Q-1） | **转 Phase 7**（评审 F-3 补接盘 2026-10-13）：视觉面不在 Phase 6 四腿（ROADMAP 目标句无）；重议触发条件 = multimodal-looker 真实视觉链路立项时连同 DSH 请求侧图像预算（imagePixelBudget/imageMaxBytes）一并裁定——沿用 S-30 原注口径 |

**(L-C) 裁定时的替代验收行**（评审 B-4 增补）：fork L 若裁 (L-C)，T5 取消（删除线 + 理由成文，不算未完成），其验收由「T4 记差异文档 + ROADMAP 措辞修订到位」替代——T9/T10 的依赖行已同步加注。

## 7. 待核清单（T1 转实测项）

| # | 待核项 | 钉测 |
|---|---|---|
| N-1 | hashline-core API 面 + **`tools/hashline-edit/` 24 件**（评审增补）+ 两个 enhancer 钩子的**逐文件**语义 | T1 Q-1 |
| N-2 | `lsp-core` 工具全名单与外部依赖树 + `src/lsp/` 62 件主体层 + 三包闭包（src 递归实测 87/18/30） | T1 Q-1/Q-4 |
| N-2b | `utils/src/ast-grep/` 10 件 provisioning 层逐文件（评审增补） | T1 Q-1/Q-5 |
| N-3 | `dsh-mcp-client` 插行形状（**每 server 一条 `insert:` 行、行包 = mcp-client**——评审 BLOCKER-1 + R2-6 形态更正，模板逐字在册）/ `mcp__*` 命名 / stdio 探测与失败形态 / **同名包双插行实例化行为** | T1 Q-2（fixture server 端到端） |
| N-3b | `str_replace_editor` 未挂载的在场性钉测 + A/B 臂 (A) 组成裁定（评审 MAJOR-1） | T1 Q-2 |
| N-4 | web 三层在场实测（dump-config / 工具面 / 行为层）与结构化错误形状 | T1 Q-2 |
| N-5 | **已挂载 edit 面（`dsh-tool-fs`）**的错误文案与重试可判性逐字（主目标——R2-4i 更正）；`str_replace_editor` 仅在裁定入臂后枚举 | T1 Q-2 |
| N-6 | 编辑失败模式清单终态（计划书 §4.3 四类 ± 新增） | T1 Q-3 |
| N-7 | fixture 语言服务器选型与 CI hermetic 形态 | T1 Q-4④/Q-7 |
| N-8 | v5 tag 现状重判（v5.0.0 stable 是否已发布——playbook 步骤 1，不沿用旧结论） | T1 Q-5③ |
| N-9 | 席位 toolFilter 差集（web/ast-grep/编辑面 × 11 席 + team 成员席） | T1 Q-6 |
| N-10 | 本阶段注入点 kind 命名表与 vendor 候选 licenses 计数预测（基线 61） | T1 Q-8 |
