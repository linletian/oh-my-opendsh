# Phase 6 开发计划：MCP 与编辑

> **本目录**：[`docs/plans/phase6-dev/`](./) —— ROADMAP **Phase 6**（MCPs & editing）的实施计划。
>
> **上游依据**：[ROADMAP（中文）](../../roadmap_zh-CN.md) §4 Phase 6 · [决策 D14](../../decisions_zh-CN.md)（基线冻结）· [决策 D17](../../decisions_zh-CN.md)（0.2.x 单运行时）· [决策 D9](../../decisions_zh-CN.md)（Windows 排除）· [可行性报告 §2.3／§2.6／§16.2](../../feasibility-report_zh-CN.md) · [Phase 1 vendoring playbook](../phase1-dev/vendoring-playbook.md) · [Phase 3 覆盖基线](../phase3-dev/phase3-hooks.md)（S-14/S-15/S-16/S-30 deferred 登记处）· [dsh 0.2.0-rc.2 复核报告](../../dsh-0.2.0-rc.2-review_zh-CN.md)（运行时面权威——**注意：该报告对 LSP/MCP 面零命中；「web」有 5 处命中但均为 Web 传输/CLI 别名面（如 :127），不涉 `dsh-tool-web` 模型工具面**（评审 8h 措辞收窄 2026-10-13）——本阶段原生面事实由 T1 钉测自建）
>
> **配套文档**：[任务清单](./phase6-tasks.md) · [MCP/编辑面清单与覆盖基线](./phase6-mcp-editing.md)（计划期草案，T1 转实测）
>
> **状态**：🚧 立项（2026-10-12，基线 = Phase 5 结项后的 `feature/phase6-dev`，分支基点 `1bc9fbd`）。逐任务证据与退出标准核对见[任务清单](./phase6-tasks.md)。
>
> **修订记录**：
>
> - **2026-10-13 P6-T1 实测更正（DoD-d，随 T1 执行）**——T1 钉测/对账推翻或收窄计划期事实处，正文行内以【T1 实测更正 2026-10-13】留痕，全档 = `.omo/evidence/p6t1/FORKS.md`（gitignored 证据档）：① **「tools-mcp 25/30 = lsp-core 引擎拷贝」叙事推翻**——29/30 同名件全部 = 1 行 re-export shim（blob 29/29 同名不同文），引擎零重复；窄化 (L-B) 闭包 = lsp-core 65 非测试 .ts + mcp-stdio-core 6 + cli 薄面 ≈ **72 件**（R-1/WP-2/T4 的 113 件口径随之更新，>40 阈值与 1.5 天量级结论不变）；② **hashline 门控字段位置更正**——被消费门 = 顶层 `oh-my-opencode-config.ts:60`（R2-10 的 `experimental.ts:18-19` 位置注记作废，字段名/默认值结论不变；`tool-registry-gated-tools.ts:32` 以 `edit` 名注册）；③ **hashline-edit-diff-enhancer = 上游孤儿件**（1 文件零接线）——S-14 处置主推记差异（DSH 原生 diff-card 等价面在册）；④ atlas 谓词实际路径 = `src/hooks/atlas/`；⑤ str_replace_editor「原生编辑面」表述收窄 = 在树未挂载的可选加装件，A/B 臂 (A) = 已挂载 `dsh-tool-fs` edit（不入臂裁定 `FORKS.md` §0-3）；⑥ (G) fork「两向一」重构——(G-B) 以 sg provisioning 为前提（`sg-runner.ts` spawn sg + v5-only `resolveSgBinarySync`），真实裁定 = (G-A) 自足 vs (G-A)+(G-B) 叠加；平台矩阵语义所在 = `utils/ast-grep/sg-manifest.ts`（两件 CLI 安装器均委托壳）；⑦ 许可姿态：SUL-1.0（v4/v5 LICENSE.md blob 同文），名称门新案收窄为归属措辞案；⑧ c14 并集不扩 + H-35/36/37 预分（`FORKS.md` §0-1/§0-2）。mcp-client 行为钉测（S1–S6）回填中，随 T4/T6 裁定前闭环。
>
> - **2026-10-12 立项稿**——计划期实测（本机实装 `dsh@0.2.0-rc.2` 树 + 上游 `v4.19.4` tag 只读核查，下文以 `$DSH` = `/home/linletian/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` 为引用基址）确立五条头条事实（§1.1），其中两条推翻 ROADMAP 行文前提：**钉住运行时不存在任何 `dsh-lsp*` 包**（「LSP（走 dsh-lsp）」无对象）与**冻结基线 v4.19.4 内 ast-grep 无 MCP 包**（`ast-grep-mcp` 是 v5 时代的重建）。本阶段不是绿色田野——设计主轴是三个证据驱动的 fork 裁定（§4.1），不是照单建设。
>
> - **2026-10-13 计划期评审修复（第 3 轮，用户评审第三轮仲裁，verdict APPROVE 后的批处理）**——评审件 = `phase6-docs-review.tmp.md` 第 3 轮（R3-1…R3-5，第 2 轮修复复核 12/12 通过后仅剩 1 MINOR + 4 NIT）；逐条裁决 = `phase6-review-3-response.md`（仲裁台账，存 `.omo/evidence/p6-plan-review/`——gitignored 证据档，不入库）（**全部采纳，0 驳回**）。① R3-1：(E-B) 移植单元计数终值 = **5 实现 .ts + AGENTS.md + 3 测试**（`formatter-trigger-cache.ts` 实现件 `git cat-file -e` 实证不存在——cache 是 `formatter-trigger.ts` 内导出；同一清单第 3 次数漂（29→26→24→6→5）终局，24 件 ground truth 随评审 §4 落档、仲裁逐名复核相符）；② R3-2：`typecheck:lsp` 命名更正（包名后缀惯例亲验）；③ R3-3：WP-1 (E-B) 括注理由句更新；④ R3-4：「配置行」措辞残留两处扫零；⑤ R3-5：G-2b 按列声明口径改 `utils/src/ast-grep/`（R2-2「补全路径」适用范围 = 无声明口径的正文，两处纪律不矛盾）。
>
> - **2026-10-13 计划期评审修复（第 2 轮，用户评审第二轮仲裁）**——评审件 = `phase6-docs-review.tmp.md` 第 2 轮（R2-1…R2-12）；逐条裁决 = `phase6-review-2-response.md`（同上，存 `.omo/evidence/p6-plan-review/`）（**12 条全部采纳/吸收，0 驳回**）。**头条 = 对第 1 轮仲裁的自我订正**：R2-1 钉死「内联副本/不 import core」叙事**实测为假**（`package.json:22` workspace 依赖逐字 + 15/24 件逐字 import core——上游 = core 包 + 15 薄 shim + 9 工具自留件），第 1 轮误采纳 opencode 的该增补并标「亲验成立」——订正留痕于第 1 轮回复文档 §2.1；(E-B) 移植单元随之定为 **5 个工具自留实现件 + 配置门**（R3-1 订正：9 自留件 = 5 实现 .ts + AGENTS.md + 3 测试；`formatter-trigger-cache.ts` 实现件不存在——cache 是 `formatter-trigger.ts` 内导出）（shim 语义随 vendored core 免费在场，「语义源」虚设裁定项删除）。其余实质更正：② ast-grep utils 层路径 7 处补 `packages/` 前缀（R2-2）；③ 估算三连更正（R2-3）——(L-B) 闭包非测试 .ts = **113 件**（60 无推导作废）、删「79 件全树更大」反算术句、T4 (L-B) 提至 1.5 天与量化判据自洽、矩阵两端 = **8.25/11.0**（逐笔对齐）；④ R2-4 修复未同步组 11 处一次扫掉（门链行/§8/§9/PRE-5/T5/E-1/N-5/L-1/基线头注等）；⑤ T9 依赖补 T4（R2-5）；⑥ mcp-client 挂载形态统一为「每 server 一条 insert 行」+ 同名双插行实例化钉测点（R2-6）；⑦ (L-A) 新包接线三点位 + (E-B) 落点静态门家 + 工具注册先例改引 omo-team（R2-7）；⑧ (L-B) vendor 测试携带决策行（R2-8）；⑨ `hashline_edit` 字段名计划期落地（R2-10，`experimental.ts:18-19` 逐字）。
>
> - **2026-10-13 计划期评审修复（第 1 轮，双评审 + 用户评审三路仲裁）**——评审件 = `phase6-docs-review.tmp.md`（用户评审，F-1…F-12）+ 双评审输出（`.omo/evidence/p6-plan-review/review-{A-opencode,B-mcode}.out`）；仲裁记录与逐条裁决 = `phase6-review-1-response.md`（同上，存 `.omo/evidence/p6-plan-review/`）。**采纳的实质更正**：① 编辑面清单补 `tools/hashline-edit/` 工具面（24 件亲验——锚点校验/diff 生成逻辑所在层），(E-B) 重定义为「薄工具面 + enhancer 双钩」（原「双钩即 (E-B)」作废——产不出 stale-anchor 拒绝证据且双臂不对等）；② ast-grep 面补 `packages/utils/src/ast-grep/` provisioning 层（10 件——钩子仅是薄壳），(G-A) 移植单元 = 钩子壳 + utils 层；③ LSP 三包计数更正（口径 = src 递归：core 87/非测试 65、daemon 18、tools-mcp 30——原稿 14/7 为非递归顶层误数）+ `src/lsp/` 62 件主体层补描述 + R-1 量化判据；④ S-30（read-image-resizer）补接盘：裁定**转 Phase 7**（视觉面不在 Phase 6 四腿，重议触发条件成文）；⑤ c14 并集扩展改**条件式**（含 H-号段已移植行才入，否则不扩展 + 活体针——c14 只读 §1、每份 ≥1 H 行否则红）+ H-34 fork (ii) 先例登记；⑥ §7 估算改分支矩阵（合计 (E-A)+(L-B)+(G-A) ≈ 8.25 至 (E-B)+(L-A)+(G-B) ≈ 11.5 人日）；⑦ 引用订正组（§2 具名行替规则编号 / 可行性报告 §2.10 / Q-4④ / ROADMAP 退出标准逐字引 / exa 订正两处 / 复核报告 grep 措辞收窄 / 名册行双机读面）；⑧ 任务书：T3/T6 门号补全（门 1 不可漏）+ 同步网五点位列点 + T9/T10 依赖 (L-C) 降级路径 + T2 臂 B 载体形态纪律 + 台架存档复跑要求。计数对账差异（评审 29/26 vs 亲验 24、评审 32 vs 亲验 30、评审 66 vs 亲验 65）全部以亲验为准成文。

---

## 1. 目标

**LSP、ast-grep、web 搜索/抓取、编辑模型——OMO 能力面的最后一组大件——在 DSH 上逐一定裁：每项能力经「DSH 原生优先」检查后，要么采用原生面并给出脚本化在场证明，要么按冻结基线/vendor 纪律落地 OMO 语义，要么成文记差异；编辑模型在 hashline（Phase 1 已 vendor）与 DSH `str-replace-editor` 之间以 A/B 证据笔记裁定。**

ROADMAP §4 Phase 6 原文：

- **目标**：LSP（走 `dsh-lsp`）、ast-grep（上游的活方向）、web 搜索/抓取（DSH 内建），以及编辑模型决策：hashline（`hashline-core`，Phase 1 已 vendor）vs DSH `str-replace-editor`——按原则一以 A/B 证据记录裁定。
- **明确排除**：codegraph（上游已删，§16.2）。
- **退出标准**：每个入选能力在脚本化场景中被 agent 真实使用。

本阶段的成功标志不是"装了几个工具"，而是：**四条腿（编辑/LSP/ast-grep/web）各有经得起反向金丝雀检验的定裁**——「被选定」= 脚本化场景中 agent 真实调用且断言能区分「真用了」与「静默缺席」；「未被选定」= 成文的记差异/deferred 理由，不是无声缺席。**ROADMAP 的「走 dsh-lsp」与「ast-grep 的活方向」两句行文前提在计划期已被实测部分推翻（§1.1），最终以 T1 fork 裁定为准。**

### 1.1 计划期头条发现（全部实测，证据逐条在册）

| # | 发现 | 证据（计划期实测） |
|---|---|---|
| **F-1** | **钉住运行时没有任何 LSP 包**：`$DSH`（`@deepseek-ai` 作用域，288 包）按名 grep `lsp` **零命中**；全树 `find -iname "*lsp*"` 无路径。可行性报告 §1.1 的映射行「`dsh-lsp` + `dsh-lsp-stdio` + `dsh-tool-lsp`」写的是 DSH **源码 monorepo** 的 200+ 包全名录，这些包**未随 0.2.0-rc.2 发行物安装**。ROADMAP「LSP（走 `dsh-lsp`）」的前提面在钉住运行时缺席 | `ls $DSH \| grep -ci lsp` = 0；`find $D -iname "*lsp*"` 空 |
| **F-2** | **冻结基线 v4.19.4 内 ast-grep 无 MCP 包**：`packages/` 下无 `ast-grep-mcp`；v4.19.4 的 ast-grep 面 = **四类**（评审更正 2026-10-13：原稿「三类」漏 utils 层）：① 安装器 `omo-opencode/src/cli/install-ast-grep-sg.ts`（+ omo-codex 同族）② provision 钩子 `omo-opencode/src/hooks/ast-grep-sg-provision/`（**薄壳**——hook.ts 逐字 import `provisionSgBinary`/`findSgBinarySync` 自 `@oh-my-opencode/utils`，Phase 3 已登记 deferred = **S-16**）③ **utils provisioning 层 `packages/utils/src/ast-grep/` 10 件**（sg-provisioner/sg-resolver/sg-manifest/install-script/types/index 6 实现 + 4 测试——provision/resolve/平台矩阵的实际语义所在）④ 技能 `shared-skills/skills/ast-grep/`（**已随 Phase 4 vendor 在本仓**）。`@oh-my-opencode/ast-grep-mcp` 是 2026-08-03（**晚于 v4.19.4 冻线 2026-08-01**）的 v5 时代重建（可行性报告 §16.2）——ROADMAP 说的「上游的活方向」若指 MCP 形态，属 ROADMAP §2「定向搬运」行的 **selective lift**，不是冻结基线内容 | `git ls-tree v4.19.4 packages/ \| grep ast` 空；`git ls-tree -r v4.19.4 \| grep ast-grep` = 34 条四类命中（含 `packages/utils/src/ast-grep/` 10 件）；hook.ts import 逐字 |
| **F-3** | **web 搜索/抓取已是组合内原生实况**：`dsh-base/cordis.patch.yml` 挂载 web 面五行（**`:471-476` = `web` 服务行 + provider 声明（`searchProvider: deepseek-official`/`fetchProvider: http`）**、`:478-481` = `web-search-deepseek`（`apiKeyEnv: DEEPSEEK_API_KEY`）、`:483-484` = `web-fetch-http`、`:486-490` = `tool-web`（`fetch: true`/`searchTimeoutMs: 60000`）——评审 MINOR-2 行号更正：原稿「478-487」区间偏移且漏 provider 声明行）；`dsh-tool-web` 向模型提供 `web_search`/`web_fetch`（README 逐字：provider 缺席时工具保持可见并返回**结构化错误**）；本仓根 `cordis.yml` 与 concerto 组合对 web 面**零改动零覆盖**。即 web 腿的本阶段工作 = **验证在场 + 脚本化证明 + 名册席位整合**，不是移植建设 | dsh-base patch 文件 :471-490 逐行亲验；`dsh-tool-web/README.md` Summary 段；本仓 grep 零命中 |
| **F-4** | **ast-grep 与 lsp-setup 技能已在服务面**：omo-commands 的 vendor 技能目录（19 件，`EXPECTED_VENDOR_SKILL_COUNT = 19`）含 `ast-grep`（frontmatter 逐字教 `sg` CLI 的结构搜索/改写用法，自带 `scripts/ast_grep_helper.py` 与 `install.sh`/`install.ps1`——后者 Windows 件随 D9 记差异，评审更正补列）与 `lsp-setup`，经 SKILL_GESTURE 机制由 `ctx.skills` 服务。**技能文本层已交付**；缺的是 `sg` 二进制的 provisioning（S-16 钩子壳 + utils 层，均见 F-2）与 LSP 工具面本身 | `omo-commands/src/skills.ts:96`；`patches/omo-dsh/vendor/shared-skills/skills/{ast-grep,lsp-setup}/`（评审 MINOR-4：证据列路径补全仓根前缀） |
| **F-5** | **编辑面两端都在仓内**：`hashline-core` 已 vendor（`patches/omo-dsh/vendor/hashline-core/`，playbook 全套 29 件、78 测试绿，**vendored 未消费**——Phase 1 纪律）；OMO v4.19.4 的 hashline 集成 = **四层**（评审更正 2026-10-13：原稿漏工具面）：① **编辑工具面 `omo-opencode/src/tools/hashline-edit/`（24 件全树 / 21 非测试）**——`createHashlineEditTool`、`parseLineRef`/`validateLineRef`（LINE#ID 锚点实现处）、`hashline-edit-executor`、`edit-operations` 等，hashline-core 的 AGENTS.md 自述消费方即此（"Consumed by: the ~15 thin re-export shims under `omo-opencode/src/tools/hashline-edit/`"）；② 两个 enhancer 钩子（`hashline-read-enhancer/`、`hashline-edit-diff-enhancer/`——Phase 3 登记 deferred = **S-14/S-15**）；③ atlas `write-edit-tool-policy.ts`；④ `config/schema/experimental.ts` 配置门。core 层（已 vendor）与工具实现层（未盘点）是**两个包**，锚点校验逻辑在后者【T1 实测更正 2026-10-13：③ 实际路径 = `src/hooks/atlas/write-edit-tool-policy.ts`（5 行名谓词，`src/atlas/` 不存在）；④ 被消费的门 = **顶层** `hashline_edit`（`oh-my-opencode-config.ts:60`，default false；`tool-registry-gated-tools.ts:32` 以 `edit` 之名注册 hashline 面）——`experimental.ts:19` 同名字段是另一格；另：**hashline-edit-diff-enhancer 为上游孤儿件**（1 文件零接线，barrel/enum/composer 零命中，`hooks/AGENTS.md:9` 自证 orphan），S-14 处置随 T3 裁，证据 `.omo/evidence/p6t1/FORKS.md` §1.3】。DSH 原生编辑面 = `dsh-tool-str-replace-editor`（view/create/str_replace/insert 四命令 + read-before-edit 策略 + sandbox 围栏）【T1 钉测更正：**在树未挂载**——顶层 dsh package.json:87 带入安装树、dsh-base 零挂载、组合树 dump 零命中、安装树零反向依赖；dsh-base README:56-57 将其文档化为可选加装件。**挂载中的原生编辑面 = `dsh-tool-fs` edit**（A/B 臂 (A) 组成裁定见 `FORKS.md` §0-3）】+ `dsh-tool-fs` 的 read/write/edit 套件（S-46 已实证原生覆写守卫 + `FS_STALE_VERSION` CAS 是 OMO write-guard 的**严格超集**） | `git ls-tree -r v4.19.4 -- packages/omo-opencode/src/tools/hashline-edit/`（24 件亲验）；`hashline-core/AGENTS.md` "Consumed by" 逐字；phase3-hooks.md:78-80（S-14/15/16）、:110（S-46）；`dsh-tool-str-replace-editor/README.md` |

## 2. 不可协商约束

本阶段受 ROADMAP §2/§3 同等约束，另加本阶段特有的六条，全部同等效力：

| 约束 | 来源 | 本阶段的具体含义 |
|---|---|---|
| **冻结基线 = OMO v4.19.4** | ROADMAP §2「冻结基线」行 / D14 | 语义内容的唯一来源 = v4.19.4 tag（commit `b072d279…`，只读 `git show/ls-tree`）。**ast-grep 的 MCP 形态不在冻结基线内**（F-2）——若 T1 裁 (G-B) 定向搬运，必须按 ROADMAP §2「定向搬运」行的 selective lift 纪律：逐文件、带署名、记决策，**只搬目标包不追 v5 线**（评审更正：§2 为具名行表格、无编号，引行名不引序号） |
| **DSH 原生优先（本阶段头号纪律）** | README 原则一 / ROADMAP Phase 6 | 编辑模型决策的 A/B 证据笔记是本约束的**执行形态**（ROADMAP 原文要求）；web 面已原生在场（F-3），禁止重造；LSP/ast-grep 的原生面缺席（F-1/F-2 已实证）不是「原生优先」的例外，而是把采用对象换成「vendor harness-neutral 核心（ROADMAP §3 约束 5：lsp-core 在 19 包名单内）或经 `dsh-mcp-client` 桥接」的裁定输入 |
| **SUL-1.0 合规与署名** | ROADMAP §3 约束 1 / D10 / D15 / D16 | 两类产物两种形态（Phase 2–5 先例）：语义移植 = 署名头 + NOTICES 逐文件；内容/代码 vendor = playbook 全套（per-file NOTICES、`VENDOR-MANIFEST.json` sha256、包级 `NOTICE.md`、`license` 字段、deviations[]）。**T8b 先例适用于本阶段一切 vendor**：宿主 = 裸 Node 24 原生 type-stripping，vendored 树内无扩展名 specifier 须补全 + 机械证明（零语义变更），strip-only 不支持参数属性须改写登记 |
| **门只加严不放松** | Phase 1–5 惯例 | 8 门链全绿维持；扩展既有门（门 1/2/3/4/5/6/7/8 按任务触及面，§4.9），**不加新门、不绕过旧门**；**任何新插行都触发 COUNT COUPLING NET**（评审 BLOCKER-1 更正：(L-A) 新包行与 (L-B)/(G-B) 的 mcp-client 行同为插行，4→5→6 逐条同 commit 全点位同步） |
| **静默失效类必配金丝雀** | Phase 4.5/5 惯例 | 本阶段的失效模式几乎全是静默的：`sg` 二进制缺席（技能照教、调用照败）、LSP 服务器未起（工具返回「无服务器」软文案）、web provider 无 key（工具在场但只回结构化错误）、hashline enhancer 未生效（编辑照样进行只是无锚点）。每个验收断言必须能区分「能力真被用了」与「静默降级」；缺席/降级路径必须**响亮**（具名错误/marker/负断言） |
| **外部内容信任边界** | dsh-tool-web 原生语义 / 安全惯例 | web_search/web_fetch 结果是 provider 控制的**外部不可信文本**（原生已标注），本阶段任何消费 web 结果的指引/技能段不得削弱该标注；H-24 webfetch-redirect-guard（Phase 3 已移植）的 SSRF 护栏语义不许因本阶段任何改动回退 |
| **双语同步 / 非商业 / 不提 PR** | docs 惯例 / D8 / D5 | 交付文档（README/CHANGELOG/decisions/ROADMAP 回馈）en + zh 同 commit；本目录为纯中文工作文档 |

## 3. 现状盘点（Phase 5 结项基线）

| 构件 | 现状 | 本阶段的影响面 |
|---|---|---|
| **编辑面（DSH 原生）** | **`dsh-tool-fs`（read/write/edit）在 dsh-base 挂载在场（`cordis.patch.yml:281-282`），edit = 字面替换唯一匹配语义；`dsh-tool-str-replace-editor`（view/create/str_replace/insert；read-before-edit + sandbox 围栏）在安装树内但未挂载**（评审 MAJOR-1 更正 2026-10-13 亲验：非 dsh-base 依赖（grep 0）、无组合文件挂载、全树无反向依赖）——**组合内实况的编辑面 = dsh-tool-fs 的 edit**；S-46 已实证原生覆写守卫 + CAS 是 OMO write-guard 超集 | A/B 原生臂 = **已挂载的 edit 面**（str-replace-editor 是否为 A/B 挂载 = T1 Q-2 钉测点 + T2 成文——ROADMAP 点名的比对对象未挂载是计划期更正事实）；hashline 若移植，enhancer 钩子的消费对象 = 在场工具面的事件 |
| **hashline 面（上游 + 已 vendor core）** | `patches/omo-dsh/vendor/hashline-core/` 完整（playbook 全套 29 件、78 测试绿），**零 import 消费**（评审 MINOR-3 更正：「仓内唯一命中 = 注释串」为假——命中另有测试断言（`tests/vendor/shared-skills-manifest.test.ts:117-119` files=29）、许可门测试、vitest.config、pnpm-lock、其他 vendor manifest 与 bash-file-read-guard 注释；措辞收窄为「零 import 消费」）；上游工具实现层 `tools/hashline-edit/`（24 件）未盘点（F-5）——**其结构 = 15 薄 re-export shim + 9 工具自留件**（评审 R2-1 更正 2026-10-13，亲验：`omo-opencode/package.json:22` 逐字 `"@oh-my-opencode/hashline-core": "workspace:*"`，24 件中 15 件逐字 import core 包——与 vendored core AGENTS.md 自述 "the ~15 thin re-export shims" 吻合；**第 1 轮采纳的「不 import core/内联副本」叙事实测为假，作废**）；上游 gating 逐字 = `packages/omo-opencode/src/plugin/tool-registry-gated-tools.ts:32`（R2-9 全路径更正）`config.hashline_edit ? { edit: createHashlineEditTool(ctx) }`——hashline 在上游是**以 `edit` 之名替换原生编辑器的工具**，双钩只是装饰 | fork E 的 (E-B) 臂 = **薄工具面（移植单元 = 24 件中 9 个工具自留件里的 5 个非测试实现件（`tools.ts`/`tool-description.ts`/`hashline-edit-executor.ts`/`formatter-trigger.ts`/`index.ts`——R3-1 订正：9 自留件 = 5 实现 + AGENTS.md + 3 测试；cache 是 `formatter-trigger.ts` 内导出，无独立实现文件）——消费 vendored core = 上游忠实路径，无需「语义源」裁定）+ 两个 enhancer 钩子移植**（评审更正 2026-10-13：锚点校验/diff 生成逻辑经 shim 即在 vendored core 内，只搬双钩产不出 stale-anchor 拒绝证据——原「双钩即 (E-B)」定义作废）；(E-A) 臂 = 维持 vendored-unconsumed + 记差异 + **人工复核记录**（漂移检测纯人工无 CI 门守，playbook §6 在册——(E-A) 退出证据须含一条人工复核） |
| **LSP（DSH 原生）** | **缺席**（F-1）。无任何 `dsh-lsp*` 包、`ctx` 无 LSP 服务面 | fork L 的三向裁定（§4.4）——无原生可 adopt，「DSH 原生优先」在此 = 优先 harness-neutral vendor / mcp-client 桥接 |
| **LSP（OMO 上游）** | 三包分层（计数口径 = `packages/<pkg>/src` 递归，2026-10-13 评审更正后亲验）：`lsp-core`（harness-neutral，**src 87 件 / 非测试 .ts 65 件**，含主体实现层 **`src/lsp/` 62 件**（client/manager/connection/server-definitions/server-installation/process 等——Q-4③ daemon 必要性裁定的直接证据面）+ `tools/` + `post-edit/` + `mcp.ts`，含 `mcp-protocol-pin.test.ts`；**`package.json` 亲验：private、零外部 npm 依赖（仅 `mcp-stdio-core` workspace）**——R-1 悲观设定的对账面）、`lsp-daemon`（**src 18 件全非测试**：daemon-server/client、socket-jsonrpc、lock/ownership、version-reap）、`lsp-tools-mcp`（**src 30 件全非测试**——**其中 25 件 = lsp-core `src/lsp/` 引擎的重复拷贝**（评审 MAJOR-3 亲验：文件名交集 25/25），自含 LSP 引擎而非薄适配层；**且它是第三方 MIT 包 `@code-yeongyu/lsp-tools-mcp`（独立 homepage），非 `@oh-my-opencode` SUL 件**——评审 MAJOR-4，§4.10 合规面随之分立）【评审计数对账：tmp 评审的 tools-mcp 32 与 mcode 的 daemon 全包 20/全树 54 均未按本口径复现，以本行亲验数为准】 | vendor 闭包与桥接契约的钉测对象（T1 Q-4）；harness-neutral 依据 = **可行性报告 §1.2 的 19 包名单**（含 lsp-core，引上游 ROADMAP.md:42-48；评审 MINOR-9 更正：本仓 ROADMAP §3 约束 5 只给「team-core/delegate-core/hashline-core/rules-engine/…」举例无 19 枚举，引文改可行性报告）+ lsp-core package.json 自述逐字（"Harness-neutral Language Server Protocol engine and tool definitions for oh-my-opencode."——R2-9 补全句尾）；**闭包量级 = Phase 1 hashline-core（29 件）的 3 倍**（(L-B) 全量口径 135 件 = 4.6 倍），R-1 估算参照；【口径注（R2-11）：`src/lsp/` 62 件含 3 个 fixture 文件】 |
| **ast-grep（OMO 上游）** | v4.19.4 = 安装器 + provision 钩子（S-16）+ 技能；**无 MCP 包**（F-2）。v5 时代有 `@oh-my-opencode/ast-grep-mcp`（2026-08-03 重建） | fork G 的两向裁定（§4.5） |
| **ast-grep/lsp-setup 技能（已 vendor）** | 19 技能目录在服务（F-4），`ctx.skills` 经 SKILL_GESTURE 可达 | 技能文本与工具面的一致性核验（技能教 `sg`，工具面须提供或可 provisioning `sg`；缺 provisioning 时技能是空头指令——与 T12 N1 同族的「空头指令不许原样进模型可见面」纪律） |
| **web 面（DSH 原生）** | `web_search`/`web_fetch` 在 dsh-base 挂载（F-3）；provider = deepseek 搜索后端 + http 抓取后端；provider 缺席时结构化错误（工具保持可见） | web 腿 = 验证/证明/席位整合；结构化错误形态是 e2e 的诚实性断言面（无 key 环境不许断言「搜索成功」） |
| **web 面（OMO 残余）** | H-24 webfetch-redirect-guard 已移植（Phase 3）；OMO 的 web 类 MCP = exa / context7 / grep_app 三 provider；`dsh-web-search-exa` 在可行性报告名单但**实装缺席** | 三 provider 处置 = 记差异（DSH 内建覆盖搜索/抓取需求）；exa 缺席成文；librarian 席位的 web 工具可达性（名册整合） |
| **MCP 桥接面（DSH 原生）** | `dsh-mcp-client` 在场：外部 MCP server 工具注册为 `mcp__<server>__<tool>`；stdio / streamable-http 双传输；协议 2026-07-28 优先 + legacy 回退；stdio 先起临时探测进程；空 caller scope 不加工具；server instructions 进系统提示词 | fork L (L-B) 与 fork G (G-B) 的共同承载面；**插行形状 + per-server 配置与失败语义钉测（T1 Q-2）**（R3-4 措辞更正） |
| **OMO MCP 七件** | LSP（lsp-tools-mcp）/ ast-grep（v4.19.4 无包）/ **codegraph（已删，排除）** / grep_app / context7 / exa / **git-bash-mcp（Windows，D9 排除）** | 处置总表进覆盖基线 §5——七件逐件「移植/桥接/记差异/排除」成文 |
| **名册与席位** | 11 席 + 10 委派行（per-seat 路由/拒绝面在册——双机读面：doctor-lite 26 行 Config schema 校验 + 10 委派行 roster 契约（deny 列表/深度/路由逐席校验，结项输出逐字）；静态门 c10.1–c10.10 live roster 断言 + `scripts/prove-explore-toolfilter.mjs`）；explore 席 deny write/edit；librarian 席 read-only【评审更正 2026-10-13：原稿「doctor-lite 26 行校验」引用不精确——26 行是 Config schema 校验计数，席位 toolFilter 的机读断言面是 roster 契约 + c10.x 族】 | 席位工具面整合（T1 Q-6）：上游 explore 配 ast-grep、librarian 配 web 搜索/context7——DSH 侧席位 toolFilter 的差集裁定 |
| **team 面（Phase 5 产物）** | omo-team 第四插行、12 工具、双账持久化、team 成员 = continuable 子女 | team 成员（hephaestus/sisyphus-junior 席）的编辑能力面 = 本阶段编辑决策的直接消费者；LSP/ast-grep 工具是否在成员面在场 = 覆盖基线行 |
| **门链与同步网** | 8 门全绿（基线：门 2 = **90 文件/2056 测试**；门 3 = **41/41 场景**；门 5 = **checked=61**；门 6 = **37/37**；门 8 = **8/8 proofs**）；根 `cordis.yml` 4 insert 行 + COUNT COUPLING NET | 本阶段增量全部走既有门扩展；**任何新插行都触发同步网**（(L-A) 新包行 / (L-B)/(G-B) 的 mcp-client 行，4→5→6——评审 BLOCKER-1 更正，R2-4a 同步） |
| **e2e/观测基础设施** | drive.mjs v4 夹具（41 场景族）+ probe 插件先例（team_probe_* 真面断言）+ sandbox-vanished SKIP 纪律 + mock-llm-server 占位符族 | 四腿场景直接复用；LSP/sg 的「外部进程」性质需要新的夹具族（hermetic fixture，T1 Q-7 设计） |

## 4. 方案设计

### 4.1 总体策略与三个 fork（全部 T1 证据裁定，不得默认滑入）

本阶段没有单一中心 fork，而是**三个独立 fork**，各自在 T1 钉测后以证据裁定（Phase 5 FORK.md 先例）：

| fork | 问题 | 选项 | 计划期倾向（非裁定） |
|---|---|---|---|
| **E（编辑模型）** | hashline 语义移植还是原生记差异？ | **(E-A)** DSH 原生编辑面记差异（hashline-core 维持 vendored-unconsumed）／**(E-B)** 薄工具面（形态对账上游 `tools/hashline-edit/` 24 件，消费 vendored core——锚点校验/diff 生成在工具层，评审更正 2026-10-13）+ 两个 enhancer 钩子（S-14/S-15）移植 | **真开放**——ROADMAP 明文要求 A/B 证据笔记裁定（原则一）；A/B 台架（§4.3）是两种结局共同的交付物 |
| **L（LSP）** | 原生缺席（F-1）下 LSP 怎么落？ | **(L-A)** vendor `lsp-core` + 新包 `omo-lsp` 薄工具面（第五插行）／**(L-B)** `lsp-tools-mcp` 经 `dsh-mcp-client` 桥接（vendor 闭包 = lsp-tools-mcp + lsp-core + lsp-daemon）／**(L-C)** 记差异 deferred（须成文硬理由——LSP 在 ROADMAP 目标句具名，defer 是重裁定） | (L-A) 优先评估（ROADMAP §3 约束 5：lsp-core 是 harness-neutral 核心层；MCP 适配层（lsp-tools-mcp）恰是约束 5 说的「不取自适配层」对象——但 (L-B) 省自写工具面，钉测定夺） |
| **G（ast-grep）** | 冻结基线形态还是活方向形态？ | **(G-A)** v4.19.4 形态：S-16 provision 钩子移植（`sg` 二进制保障）+ 已 vendor 技能接线核验／**(G-B)** selective lift `@oh-my-opencode/ast-grep-mcp`（v5 tag）+ mcp-client 桥接 | (G-A) 优先（D14：语义取自冻结基线；技能已在场教 `sg` CLI 用法，(G-A) 与在场技能同构；(G-B) 的「活方向」论据 ROADMAP 行文在册，T1 证据裁定） |

**三 fork 的公共纪律**：裁定书进 `.omo/evidence/p6t1/FORKS.md`；每个 fork 的被否选项连同证据成文（覆盖基线）；「记差异」是合法结局但必须有硬理由，不许作为偷懒默认值。

### 4.2 插件拓扑（默认不新建包；MCP 挂载 = 插行——评审 BLOCKER 更正）

- **默认形态**：本阶段无新插件包。钩子形条目（S-14/S-15/S-16 若移植）进 omo-hooks manifest（H-33 模块内演进先例，`EXPECTED_HOOK_COUNT` 与同步网随条目数变化）；vendor 件进 `patches/omo-dsh/vendor/`。
- **MCP server 挂载形态（评审 BLOCKER-1 更正 2026-10-13，亲验）**：`dsh-mcp-client` **未被 dsh-base 挂载**（dsh-base 只挂 `mcp-resources`（:492-493）；`dsh-mcp-client` 不在其 dependencies（grep 0 命中）、全树无组合文件挂载）；规范挂载形态 = **每个 server 一条 `insert:` 行**（`dsh-agent-preset/skills/cordis-plugin-development/templates/mcp/cordis.patch.yml` 模板逐字：`insert:` + `name: '@deepseek-ai/dsh-mcp-client'` + `config:{serverName, transport, …}`）。**原稿「配置行（非 insert 插件行）」作废**——(L-B)/(G-B) 每臂触发一条新插行，两臂同落 = 两条。
- **条件形态（新包，仅 fork L=(L-A) 触发）**：`patches/omo-dsh/omo-lsp/`（host-only）+ 第五 insert 行。职责单一口径：LSP 工具面与语言服务器生命周期——不吸收编辑语义（omo-hooks enhancer）、不吸收 provisioning（S-16 归 omo-hooks）。
- **COUNT COUPLING NET 触发条件（更正后）**：**任何新插行都触发**——(L-A) 新包行 / (L-B) mcp-client 行 / (G-B) mcp-client 行 / 组合（4→5→6 逐条同 commit 全点位：cordis.yml 头注、doctor-lite `EXPECTED_INSERT_ROW_IDS`（`doctor-lite-core.ts:52` 现值五行）、cordis-inserts.test（手抄 pin）、cold-start、drive.mjs、probe、smoke-real）。破门机制实证在册：doctor-lite 钉死「exactly the 4 plugin rows in mount order」，多一条 insert 行 → 门 4 + 门 6 同红。
- **manifest 纪律**：若新包成立，`src/manifest.ts` 单一事实源（omo-team 先例：id / 上游源路径 / 原生面对应 / 处置 / e2e 场景名 / 状态）；翻动规则沿用 T5 refined 版（`pending→ported` = 行自身语义落地 + 其 e2e 覆盖转绿，同 commit）。

### 4.3 编辑模型决策：A/B 证据台架（fork E 的执行面）

ROADMAP 原文要求「按原则一以 A/B 证据记录裁定」。台架设计（T2 落地，T3 裁定）：

- **臂 (B) 的定义（评审更正 2026-10-13，双评审收敛 MAJOR + 第 2 轮 R2-1 再更正）**：(B) = **hashline 编辑工具面形态**——薄工具面（移植单元 = `tools/hashline-edit/` 24 件中 **9 个工具自留件里的 5 个非测试实现件**（`tools.ts` 注册 / `tool-description.ts` / `hashline-edit-executor.ts` / `formatter-trigger.ts`（cache 为其内导出，无独立实现文件——R3-1 订正） / `index.ts`）；9 自留件 = 5 实现 + AGENTS.md + 3 测试；锚点校验 `parseLineRef`/`validateLineRef` + diff 生成 + edit-operations 经 **15 个薄 re-export shim** 即在 vendored hashline-core 内——**消费 vendored core = 上游忠实路径**（`omo-opencode/package.json:22` workspace 依赖逐字），无「语义源」裁定项（第 1 轮虚设的裁定项随「内联副本」叙事一并作废））+ enhancer 双钩。**原稿「双钩即 (B) 臂」作废**：stale-anchor 的拒绝发生在写入路径（edit-operations 校验），只移植读/diff 增强的 post-hoc 钩子在结构上产不出该证据，且与臂 (A)（真实工具面）对比不对等。
- **臂 (B) 的台架载体形态（T2 定死，F-11 纪律）**：三候选 = ① 临时薄工具插件（最接近最终 (E-B) 落地形态，首选评估）② fs provider 包装 ③ 独立进程直调 core API（**禁止单独使用**——与臂 (A) 的真实 DSH 工具面不对等，正中 R-3）。T2 产出须声明所选形态与「最终 (E-B) 落地形态」的差距折扣；台架脚本与数据档存 `.omo/evidence/p6t2/` 并附复跑命令（P5 L2 l2-drive.mjs 先例），一次性台架的证据不可复核 = 不收。
- **失败模式清单**（A/B 的判别对象，T1 Q-3 钉测补全）：① stale 锚点（读取后文件被外部改动，编辑基于过期内容）；② 歧义匹配（`str_replace` 的 old_string 不唯一）；③ 位移行（行号引用在插入/删除后漂移）；④ 大文件部分读取后的上下文错位。
- **双臂同任务族**：同一组脚本化编辑任务（mock-LLM 驱动，任务脚本固定）分别走 (A) 原生面与 (B) hashline 工具面形态（LINE#ID 锚点 + diff 增强）——**臂 (A) 的定义（评审 MAJOR-1 更正）= 组合内已挂载的 `dsh-tool-fs` edit 面**（`str_replace_editor` 在安装树但未挂载，是否为本阶段挂载它入臂 = T1 Q-2 钉测 + T2 成文；ROADMAP 点名的比对对象与组合实况的落差在此成文）。度量 = 每任务的**失败可判性**（错误是否具名可重试）、**重试轮数**、**静默错写率**（编辑成功但落点错误——反向金丝雀：断言文件最终字节）。
- **裁定规则（原则一的操作化）**：原生面在失败模式清单上全部有可判错误且静默错写率 = 0 → (E-A)（原生覆盖，hashline 记差异，S-14/S-15 以「原生覆盖/无守卫对象」闭环）；hashline 锚点实证防住至少一类原生面**静默**失效 → (E-B)（薄工具面 + enhancer 双钩移植）。
- **诚实性纪律**：A/B 台架的断言必须双臂各配变异自证（故意位移/篡改夹具 → 对应断言红）；「hashline 更好」不许凭印象落笔——无差异也是合法结论（那正是 (E-A) 的证据）。

### 4.4 LSP 语义映射（fork L 裁定后回填细节）

| OMO 语义（v4.19.4） | (L-A) vendor 形态 | (L-B) 桥接形态 |
|---|---|---|
| `lsp-core` 工具族（`tools/`：定义/引用/悬停/诊断等——全名单 T1 Q-1 枚举）+ **主体实现层 `src/lsp/`（62 件：client/manager/connection/server-definitions/server-installation/process 等——评审更正补层 2026-10-13）** | vendor `lsp-core`（playbook 全套）+ omo-lsp 薄工具面（模型面工具逐一对账） | 不直接消费（经 MCP） |
| `post-edit/` 编辑后诊断 | 随 vendor 件接线（tools/post-execute 事件消费） | 不可达（MCP 边界外）——记差异 |
| `lsp-daemon` 生命周期（socket-jsonrpc、lock/ownership、version-reap；src 18 件） | vendor 或简化（T1 Q-4：daemon 必要性裁定——`lsp-core/src/lsp/` 自带 client/manager 层，单进程沙箱内 in-process client 的可行性是该层的直接钉测对象） | 随 lsp-tools-mcp 进程生命周期（mcp-client stdio 管理） |
| 语言服务器发现/安装（`missing-dependency-result`） | 语义移植：缺席时具名结构化错误（响亮降级） | 同左（MCP 工具的 error 结果） |
| `lsp-setup` 技能（已 vendor） | 消费侧适配注记（技能文本的 opencode 载体句若存在——T12 N1 先例） | 同左 |

**公共断言面**（两形态都要）：脚本化场景中 agent 对一座真实语言服务器（fixture 项目 + 本机可得的 language server，如 typescript-language-server——**T1 Q-4④ 选型**，评审更正：选型属 Q-4④ 非 Q-7）完成一次定义/诊断查询；**反向金丝雀** = 语言服务器缺席时必须具名响亮，不许静默空结果。

### 4.5 ast-grep 语义映射（fork G 裁定后回填细节）

- **(G-A) 形态**：S-16 `ast-grep-sg-provision` 移植 = omo-hooks 新条目（模块内演进）——**移植单元 = 钩子壳 + `packages/utils/src/ast-grep/` provisioning 层（10 件：sg-provisioner/sg-resolver/sg-manifest/install-script/types/index 6 实现 + 4 测试）**（评审更正 2026-10-13：钩子是薄壳，`provisionSgBinary`/`findSgBinarySync`/manifest/平台矩阵的实际语义在 utils 层，只搬钩子 = 名义落地能力半残）：会话/项目首次需要时保障 `sg` 二进制在场（平台矩阵语义在 `packages/utils/src/ast-grep/sg-manifest.ts`【T1 实测更正 2026-10-13：两件 CLI `install-ast-grep-sg.ts`（omo-opencode + omo-codex）均委托技能脚本 `runAstGrepSkillInstall`，自身无矩阵；矩阵 = pin 0.43.0 六 slug sha256+URL 表】——**Windows 段不移植（D9）**）；保障失败响亮（具名 marker + 结构化指引）；已 vendor `ast-grep` 技能的 helper 脚本（`scripts/ast_grep_helper.py`）与 provisioning 的衔接核验（技能自带的 `install.sh` 是技能内路径——双保险还是单一来源，T1 Q-5 裁定）。
- **(G-B) 形态**：selective lift（ROADMAP §2「定向搬运」行）——从 v5 线选定 tag 逐文件 vendor `ast-grep-mcp`（署名 + deviations + NOTICES），经 `dsh-mcp-client` stdio 挂载（**= 新插行，触发同步网**，§4.2 更正）；决策登记（D 系列新条目候选）。**依据层级注记（评审 NIT-1）**：D14 决策表行原文授权「selective targeted lifts of upstream **fixes**」，而「capability」级授权锚在 decisions.md:118 的条款 4 操作化文本（"an upstream fix **or capability** we concretely need…"）与 ROADMAP「定向搬运」行——(G-B) 裁定时须显式引后两者并记这处措辞差（登记入决策候选）。
- **公共断言面**：agent 在脚本化场景中对 fixture 仓执行一次结构搜索/改写（技能指导 → `sg` 或 MCP 工具真实产出匹配结果）；反向金丝雀 = `sg`/server 缺席时的响亮性。

### 4.6 web 搜索/抓取验证面（无 fork——原生已在场，验证腿）

- **三层断言**（「已在场」的防误判纪律，R-5）：① **配置层**：`--dump-config` 含 web 面五行（含 `:471-476` 的 provider 声明行 `searchProvider`/`fetchProvider`——评审 MINOR-2 增补）且本仓 overlay 无遮蔽；② **工具面层**：真实组合 boot 后模型工具面含 `web_search`/`web_fetch`（probe 真面断言，team_probe_* 先例）；③ **行为层**：脚本化场景中 agent 真实发起 `web_search`/`web_fetch` 调用。
- **诚实性断言**：无 key/无网络环境（CI）下工具返回**结构化错误**（dsh-tool-web 自述语义）——e2e 断言错误形状具名可判，**不许断言「搜索成功」**；真实搜索成功证据 = L2 真机腿（真实 API key，T11）。
- **名册整合**：上游 librarian 席位含 web 搜索/context7（可行性报告 §2.1）——DSH 侧席位 toolFilter 核验（librarian/explore 席的 web 工具可达性），差集成文进覆盖基线；**不改席位路由本身**（名册 = Phase 2 产物，工具面整合 ≠ 席位语义变更）。
- **OMO 残余处置**：exa / context7 / grep_app 三 provider = 记差异（DSH 内建搜索/抓取覆盖需求；`dsh-web-search-exa` 实装缺席成文——若将来需要 exa 后端，走 mcp-client 或 DSH 原生 provider 行，本阶段不建设）；H-24 护栏联动复核（web_fetch 的 SSRF 守卫不回退）。

### 4.7 MCP 桥接面与 OMO 七件处置

`dsh-mcp-client` 是本阶段唯一的 MCP 承载面（F-1 的另一半：DSH 有 mcp-client 但无自带 server 群）。**但它自身未被 dsh-base 挂载**（§4.2 BLOCKER-1 更正）——任何 MCP server 的接入 = 先插一行 mcp-client（per-server 一条，`serverName` 逐 server）。契约钉测（T1 Q-2）：插行形状（模板逐字在册）、工具命名 `mcp__<server>__<tool>`、stdio 探测进程语义、server 崩溃/慢启动的失败形态、空 scope 零工具。

**合规注记（评审 MAJOR-4）**：`lsp-tools-mcp` = **第三方 MIT 包 `@code-yeongyu/lsp-tools-mcp`**（独立 homepage），不是 `@oh-my-opencode` SUL 件——(L-B) vendor 它时署名语义 = MIT，且 D16 的 `SUL_ALLOWED_NAME` 不覆盖 `@code-yeongyu/*`（名称门新案 = 决策候选，不在 D16 授权内）；对照 `lsp-core` = `@oh-my-opencode` private 无 license 字段（D15 条款 a 适用）。两条合规路径分开列（§4.10）。

OMO MCP 七件处置总表（覆盖基线 §5 的骨架，T1 转实测）：

| OMO MCP | 计划期处置 | 依据 |
|---|---|---|
| LSP（lsp-tools-mcp） | fork L 裁定对象 | §4.4 |
| ast-grep | v4.19.4 无包（F-2）；fork G 裁定对象 | §4.5 |
| codegraph | **排除**（上游已删，ROADMAP 明文） | §16.2 |
| grep_app / context7 / exa | **记差异**（web 需求 = DSH 内建覆盖） | §4.6 |
| git-bash-mcp | **排除**（Windows 专用，D9） | D9 |

### 4.8 Phase 3 deferred 接盘

| 行 | 模块 | 本阶段处置 |
|---|---|---|
| S-14 | `hashline-edit-diff-enhancer/` | fork E 裁定对象——(E-B) 移植 / (E-A) 以「原生覆盖」闭环（须 A/B 证据支撑，不许空手闭环） |
| S-15 | `hashline-read-enhancer/` | 同上（与 S-14 同 fork 同 commit） |
| S-16 | `ast-grep-sg-provision/` | fork G 裁定对象——(G-A) 移植（**移植单元 = 钩子壳 + `packages/utils/src/ast-grep/` provisioning 层**，§4.5）/ (G-B) 以「MCP 形态替代」闭环 |
| S-30 | `read-image-resizer/`（18 文件，phase3-hooks.md:94 登记 deferred → Phase 6：读图前缩放，与视觉工具面绑定） | **裁定：转 Phase 7**（2026-10-13 评审 F-3 补接盘）——理由：ROADMAP Phase 6 目标句 = LSP/ast-grep/web/编辑四腿，**无视觉面**；S-30 原注自带触发条件（「multimodal-looker 真实视觉链路……连同 DSH 请求侧图像预算（imagePixelBudget/imageMaxBytes）一并裁定」），该链路不在本阶段范围。重议触发条件成文：multimodal-looker 视觉链路立项时（Phase 7 硬化或独立提案）连同图像预算参数一并裁定。T1 Q-1 枚举时把 `read-image-resizer/` 过一遍（确认无被四腿依赖的语义残余） |

每条都要有成文裁定进覆盖基线 §6（Phase 5 接盘纪律：不许默认滑过）。**评审更正 2026-10-13**：指向 Phase 6 的 deferred 实为**四行**（S-14/15/16/30），原稿只接三行且未说明 S-30 去向——已补。

### 4.9 门与 e2e 扩展（不加新门）

| 层 | 扩展内容 |
|---|---|
| **门 2 单测** | A/B 台架双臂用例（变异自证）；fork 落地件的纯函数/结构式 mock（enhancer 钩子的事件改写、provision 的平台判定、**mcp-client 插行配置解析**——R3-4 措辞更正）；manifest 形状（若新包） |
| **门 3 e2e** | 四腿场景群（canonical 名 T1 定名，任务书占位：编辑 = `edit-model-ab-*` 族 + 落地场景的失败模式断言；LSP = `lsp-*`（真实 fixture 语言服务器）；ast-grep = `ast-grep-*`（fixture 仓结构搜索）；web = `web-search-fetch-*`（工具在场 + 结构化错误诚实性 + 调用真实发生））；全部复用 v4 夹具与 sandbox-vanished 纪律；外部进程类（语言服务器/`sg`）需要 hermetic fixture 族（T1 Q-7 设计） |
| **门 4 doctor-lite** | `sg` 二进制探测（(G-A) 形态）；LSP 面检查（fork L 形态对应：omo-lsp 行 / mcp-client 插行校验）；**任何新插行断言**（(L-A)/(L-B)/(G-B)——R2-4e 同步） |
| **门 5 licenses** | 计数变化逐条对应（基线 checked=61）；**MIT（`@code-yeongyu/*`）与 SUL（`@oh-my-opencode/*`）两条合规路径分列**（评审 MAJOR-4/MINOR-8 增补——门 5 在扩展面内，不是「无需扩展」） |
| **门 6 静态门** | c 组延续编号：新条目署名头覆盖、manifest↔文件集合、vendor 条目存在性（lsp-core/ast-grep-mcp 若 vendor）；**c14 基线文档并集扩展 = 条件式**（评审更正 2026-10-13，c14 契约实测 `verify-concerto-static.mjs:940-1010`：只读每份并集文档 **`## 1.` 段**的 `| H-xx |` 行、每份 ≥1 行否则直接红、已移植行派生 id 与 omo-hooks manifest ported 集合双向相等）——**`phase6-mcp-editing.md` 含 H-号段已移植行时入 `COVERAGE_BASELINE_MDS`，否则不扩展**（Phase 5 先例 = `phase5-plan.md` §4.9 同款条件式写法，其终局 = 不扩展 + 活体针；opencode MAJOR-5 增补：该裁定升为 T1 显式仲裁项，与 P5-T14 裁决并列记载，两臂 = (a) 扩并集须先交付基线 §1 重排为 c14 六列契约 / (b) 不扩则扩展 c22 式作用域或新增独立检查并同步活体针措辞）；本阶段移植的钩子条目行（若 (E-B)/(G-A) 落地）的落盘文档与章节 = **本基线文档 §1**（c14 只读 §1，H-33 先例）；`phase3-hooks.md` §2 的 S-14/15/16/30 行的终态翻转**c14 看不见**（不读 §2）——复核归属 = 评审 + T10 收口核对显式列出；**H-34 fork (ii) 先例登记**（`phase4-commands.md:37`：纯服务模块不进 manifest、c14 解析豁免）——若 (G-A) 的 provision 被裁定「二进制保障服务」而非事件 listener，适用该先例 |
| **门 7 docs consistency** | 本目录文档入扫描面（门 7 实测只查 d01–d10 token 面，plans 间一致性靠双评审——评审 8d/MINOR-8：门 7 列入扩展表以免误读为无需触及） |
| **门 8 proofs/probe** | probe 增四腿探测面（工具在场性具名 marker；缺席响亮）；冷启动日志断言（新包 marker 若触发） |
| **L2 真机** | 真实模型在真实任务中使用每项被选定能力（编辑对比 + LSP 查询 + sg 搜索 + 真实 web 搜索）；证据 `.omo/evidence/p6-l2-*` |

### 4.10 署名与合规

- 语义移植件（enhancer 钩子、provision、薄工具面）= 署名头（上游源文件 tag 相对路径）+ NOTICES Phase 6 小节。
- vendor 件（lsp-core 或 ast-grep-mcp 若裁定）= playbook 全套（Phase 1/T8a 先例，含 T8b 的扩展名补全 + 机械证明纪律）；`verify-licenses` 计数变化逐条对应（当前基线 checked=61）。
- **第三方 scope 处置（评审 MAJOR-4 增补）**：`lsp-tools-mcp`（`@code-yeongyu/*`，MIT）vendor 时 = ① 署名语义按 **MIT**（NOTICES 逐文件 + LICENSE 副本携带），D15 的「补 SUL-1.0 license 字段」**不适用**（字段已在且为 MIT——不改写他人 license 是更强的合规纪律）；② `SUL_ALLOWED_NAME` 不覆盖 `@code-yeongyu/*` = **名称门新案，决策候选**（不在 D16 授权内——D16 只扩了 `oh-my-opencode` 分支），随 T4 裁定同 commit 登记；③ playbook 的 M-1（license 字段缺失）对其不适用成文。
- selective lift（G-B 形态）= 决策登记（来源 tag、搬运清单、理由 + NIT-1 的 fixes/capability 措辞差注记）+ 双语。

## 5. 退出标准与证据

ROADMAP 原文：「每个入选能力在脚本化场景中被 agent 真实使用」（`roadmap_zh-CN.md:99` 逐字；英文版 "each chosen capability demonstrably used by an agent in a scripted scenario"——评审更正：原稿引文混排双语，按中文版逐字引）。本计划的操作化：

| # | 标准 | 证据 |
|---|---|---|
| **a** | **编辑模型决策闭环** | A/B 证据笔记成文（双臂台架 + 失败模式清单逐类数据 + 变异自证绿）；裁定（E-A 或 E-B）连同依据进决策记录候选；落地形态全门绿；(E-A) 时 S-14/S-15 以证据闭环、(E-B) 时 enhancer 双钩移植绿 |
| **b** | **每项被选定能力脚本化证明** | 编辑/LSP/ast-grep/web 四腿各有 e2e 场景绿，且每场景含反向金丝雀（能区分「真用了」与「静默缺席」）；「未被选定」的能力（fork 被否臂、三 web provider、codegraph、git-bash）逐件成文处置 |
| **c** | **缺席响亮** | `sg`/语言服务器/web provider 缺席路径各有具名错误/marker 断言（静默降级 = 红） |
| **DoD-c** | `scripts/ci-local.sh` 全 8 门绿，门扩展只加严不放松 | 收口任务复跑归档 |
| **DoD-d** | 本目录文档与实测无冲突——凡 T1 钉测推翻计划假设处，改文档不改结论（修订记录成文）；三个 fork 裁定连同依据回填本节与 ROADMAP Phase 6 措辞 | 修订记录 + ROADMAP 回馈 |
| **DoD-e** | 未移除任何既有署名；`verify-licenses` 计数变化全部有对应条目；`THIRD_PARTY_NOTICES.md` 既有条目只增不改 | 合规复核任务 |

**明确不属于退出标准**（范围蔓延护栏）：

- ❌ codegraph 任何形式的复活（上游已删）；
- ❌ git-bash-mcp / Windows 平台段（D9）；
- ❌ exa/context7/grep_app provider 建设（记差异即可；真需要走将来提案）；
- ❌ v5 线追新（(G-B) 也只搬目标包，不跟踪 beta 流）；
- ❌ 0.2.x rc 线追新（pin 钉死 `0.2.0-rc.2`，D7/D17）；
- ❌ OMO 侧任何改动（D14）；no PR upstream（D5）；
- ❌ team 面新能力建设（Phase 5 已收口；成员工具面整合仅限编辑/LSP/ast-grep 的既有产物消费）。

## 6. 风险与开放问题

| # | 风险 / 问题 | 影响 | 处置 |
|---|---|---|---|
| **R-1** | **LSP vendor 闭包大于预期**：lsp-core 的依赖树在钉测前未知（利好实测：零外部 npm 依赖，仅 `mcp-stdio-core` workspace——评审 MINOR-9 校准）；实测基数（评审更正 2026-10-13 两轮）：src 递归全量 = lsp-core **87** / lsp-daemon **18** / lsp-tools-mcp **30**（合计 **135**）；**非测试 .ts 口径 = 65/18/30（合计 113，按文件名去重 = 88——tools-mcp 的 25 件与 core `src/lsp/` 引擎重名）**【**T1 实测推翻重名=拷贝的推断 2026-10-13**：同名 29/30 件全部 = 1 行 re-export shim（blob 29/29 同名不同文），引擎零重复；窄化 (L-B) 闭包 = **65 + mcp-stdio-core 6 + cli 薄面 ≈ 72 件**（仍 >40，量级结论不变；daemon 记差异候选不进闭包）——`FORKS.md` §0-4/§2.3】——是 Phase 1 hashline-core（29 件）的 3.9 倍（全量口径 4.6 倍） | 高（量级翻转） | T1 Q-4 为阻断项：闭包清单 + 外部依赖逐一登记后才许裁定；**量化判据成文（评审增补，R2-3 计数更正）**：(L-B) 闭包 src 非测试 .ts 实测 = **113 件**（> 40 阈值）→ (L-B) 不得按 1 天量级估算（T4 (L-B) 已提至 1.5 天、WP-2 (L-B) 2.5 天）；(L-C) 的硬理由门槛成文 |
| **R-2** | **mcp-client 契约不合**：stdio 探测/协议版本/server 失败形态与 OMO server 的期望不匹配 | 中 | T1 Q-2 钉测（真实挂载一个 fixture stdio server 端到端）；不合则对应 fork 臂死亡，证据成文 |
| **R-3** | **A/B 台架沦为形式**：双臂断言不可区分、或「差异」来自夹具噪声而非工具面 | 中（决策诚信） | 双臂变异自证纪律（§4.3）；「无差异 → (E-A)」是合法且诚实的结局 |
| **R-4** | **外部二进制/进程在 CI 的可达性**：`sg` 安装、语言服务器安装需要网络/平台特定产物，CI 不可假设 | 高（门红） | hermetic fixture 族（T1 Q-7）：CI 用 fixture 替身/预置二进制；真实安装路径只在 L2 真机腿验证；缺席响亮断言与「安装成功」断言分离 |
| **R-5** | **「web 已在场」误判**：base 挂载 ≠ 组合内启用 ≠ 席位可达 ≠ 真实可用（无 key） | 中 | §4.6 三层断言 + 诚实性断言成文 |
| **R-6** | **同步网漏点位**（**任何新插行都触发**：(L-A) 新包行 / (L-B)/(G-B) 的 mcp-client 插行——评审 BLOCKER-1 更正，原稿只系于 (L-A)；c14 文档并集；licenses 计数） | 高（破门） | §4.2/§4.9 同步清单成文；首个触碰任务同 commit 落地全网；收口任务复验 |
| **R-7** | **v5 lift 范围蔓延**：(G-B) 触发时把 v5 的连带改动一起搬 | 中 | 定向搬运清单逐项登记（ROADMAP §2 规则 4），评审以清单为核对面 |

### 开放问题（T1 钉测清单——逐 Q 独立交付，阻断项标 ⚠️）

| # | 问题 | 关闭判据 |
|---|---|---|
| Q-1 | OMO v4.19.4 编辑/LSP/ast-grep/web 面全枚举 | hashline-core API 面 + **`tools/hashline-edit/` 24 件工具面**（评审增补——锚点校验/diff 生成所在层）+ 两个 enhancer 钩子逐文件语义 + atlas `write-edit-tool-policy`【实际 `src/hooks/atlas/`】+ experimental 配置门【消费面 = 顶层 `oh-my-opencode-config.ts:60`】；lsp-core 工具全名单 + **`src/lsp/` 62 件主体层** + post-edit 语义 + daemon 生命周期；`ast-grep-sg-provision` 逐行 + **`packages/utils/src/ast-grep/` 10 件 provisioning 层**（评审增补——薄壳下的实际语义）+ 安装器平台矩阵；OMO web 三 provider 语义；**S-30 read-image-resizer 过一遍**（评审增补）——覆盖基线 §1–§6 从草案转实测 |
| Q-2 ⚠️ | DSH 原生面实测 | web 三层（dump-config/工具面/行为层）实测；`dsh-tool-fs` edit 语义全枚举（唯一性约束/错误文案/重试可判性/read-before-edit 接缝——`.d.ts` 逐字 + 行为探针）+ **`str_replace_editor` 未挂载的在场性钉测**（评审 MAJOR-1：安装树在场 ≠ 组合在场——R-5 同族纪律，A/B 臂 (A) 组成裁定）；**`dsh-mcp-client` 契约钉测**（评审 BLOCKER-1 + R2-6 形态更正：mcp-client 未被 dsh-base 挂载；规范形态 = **每 server 一条 `insert:` 行**（行包 = `dsh-mcp-client`，config 携 `serverName`/`transport`/地址，模板逐字在册）——钉测点 = ① fixture stdio server 一条插行端到端（`mcp__*` 工具在场、调用往返、server 崩溃/慢启动失败形态、空 scope 零工具）② **同名包多行实例化行为**（双 server 双插行是否各自成立——决定 (L-B)+(G-B) 同落的同步网代价是 4→5 还是 4→6）） |
| Q-3 | 编辑 A/B 钉测设计 | 失败模式清单终态（§4.3 四类 + 钉测新增）；双臂任务族脚本；度量定义（失败可判性/重试轮数/静默错写率）可操作性核验 |
| Q-4 ⚠️ | LSP fork 证据 | (L-A) vendor 闭包（lsp-core 依赖树/外部依赖/harness 耦合点逐件）；(L-B) 闭包（三包）+ mcp-client 兼容性钉测；daemon 必要性裁定；语言服务器选型（fixture 用哪个 server）——三向证据齐备才许裁定 |
| Q-5 | ast-grep fork 证据 | (G-A) provision 的 DSH 形态（二进制来源/平台矩阵减 Windows/技能自带 install.sh 的双来源裁定）；(G-B) v5 `ast-grep-mcp` 的 tag 选定 + 包闭包 + mcp-client 挂载可行性 |
| Q-6 | 名册席位整合面 | librarian/explore 席的 web/ast-grep 工具可达性现状（toolFilter 差集）；team 成员席（hephaestus/sisyphus-junior）的编辑面消费形态；差集成文 |
| Q-7 | e2e 断言面与 hermetic fixture 族 | 四腿场景的 mock-LLM 可断言形态；外部进程类（语言服务器/sg）的 CI fixture 设计；缺席响亮的负断言锚点 |
| Q-8 | source kind 与署名清单 | 本阶段全部注入点（enhancer 钩子改写/provision 指引/技能注记）的 kind 命名表（v4 准入只拒 `kind:'plugin'` 已证——P5 Q-8）；vendor 候选清单与 licenses 计数预测 |

## 7. 工作包与估算

按 ROADMAP §7 的定性惯例（无 buffer、非承诺，R3），仅给工作量级：

| 工作包 | 内容 | 任务 | 量级（按 fork 分支标注——评审 F-6 更正 2026-10-13：分支口径替代单值+全局加减，消除重复计价） |
|---|---|---|---|
| **WP-0 调研钉测** | Q-1…Q-8 + 三 fork 裁定 + 覆盖基线转实测 | P6-T1 | ~1.5 天（全分支相同） |
| **WP-1 编辑模型** | A/B 台架 + 决策落地 | P6-T2 … P6-T3 | (E-A) ≈ 1.25 天（台架 1 + 记差异 0.25）/ **(E-B) ≈ 3 天**（台架 1 + 薄工具面+双钩 2——工具面对账 + 落点/静态门家裁定后重估，R3-3 措辞更新） |
| **WP-2 LSP** | fork 落地 + 工具面 + e2e | P6-T4 … P6-T5 | **(L-A) ≈ 2.5 天**（vendor 87 件闭包 1.5 + 新包/插行/e2e 1）/ **(L-B) ≈ 2.5 天**（评审 R2-3 更正：三包闭包 135 件全量/113 件非测试【T1 窄化 = 72 件：shim 零质量 + daemon 出闭包，仍 >40，量级不变】 + 高概率复现 T8b 类扩展名墙 + MIT 名称门新案【T1 收窄为归属措辞案】 → vendor 1.5 + 桥接/e2e 1；参照系：hashline-core 29 件 ≈1.5–2 人日、team-core 47 件 0.5 天 + 扩展名墙 1 天）/ (L-C) ≈ 0.25 天（记差异 + T5 取消） |
| **WP-3 ast-grep** | fork 落地 + provisioning/桥接 + e2e | P6-T6 … P6-T7 | (G-A) ≈ 1 天（钩子壳 + utils 层 10 件移植 + e2e）/ (G-B) ≈ 1.5 天（lift + 桥接 + e2e） |
| **WP-4 web** | 三层验证 + e2e + 席位整合 | P6-T8 | ~0.5 天（无分支） |
| **WP-5 门与 e2e** | 门扩展 + probe + （条件）第五插行同步网 | P6-T9 | ~0.5 天（(L-A) 时 +0.5 同步网） |
| **WP-6 收口** | 合规复核 + 文档双语 + 退出标准核对 + L2 真机 + ROADMAP 回馈 | P6-T10 … P6-T11 | ~1 天（全分支相同） |

**合计分支矩阵**（评审 F-6 更正后口径：WP 数直接求和，无全局加减项；R2-3 复核两端求和逐笔对齐）：**(E-A)+(L-B)+(G-A) ≈ 8.25 人日**（最轻组合 = 1.5+1.25+2.5+1+0.5+0.5+1）· **(E-B)+(L-A)+(G-B) ≈ 11.0 人日**（最重组合 = 1.5+3+2.5+1.5+0.5+1.0+1，WP-5 取 (L-A) 触发值）· 其余组合居间。与可行性报告 **§2.10**「MCP 桥接 2 周」的对账（评审 8a 更正：该估算在 §2.10 表内，非 §10；Phase 5 计划书同引 §2.10）：下调依据 = web 面原生已在场（F-3）+ codegraph/git-bash 排除 + MCP 桥接面原生现成（dsh-mcp-client）；**上调压力** = LSP 闭包实测为 hashline-core 的 3.9–4.6 倍（R-1）+ 编辑面 (E-B) 含工具面移植——净效应仍低于 2 周，但余量收窄，这正是 Q-4 标阻断的原因。

## 8. 交付物清单

| 交付物 | 路径 | 类型 |
|---|---|---|
| A/B 证据笔记与 fork 裁定书 | `.omo/evidence/p6t1/FORKS.md` + A/B 台架数据档 | 证据 |
| 编辑面落地 | (E-A)：覆盖基线记差异 + S-14/S-15 闭环；(E-B)：**薄工具面（5 个工具自留实现件，消费 vendored hashline-core——R3-1 订正）+ enhancer 双钩**（§4.3 新定义，R2-4b 同步） | 代码/文档 |
| LSP 面落地 | (L-A)：`patches/omo-dsh/omo-lsp/` + 第五插行 + vendor lsp-core；(L-B)：vendor 三包 + **mcp-client `insert:` 插行**（R2-4c 同步）；(L-C)：记差异文档 | 代码/配置/文档 |
| ast-grep 面落地 | (G-A)：omo-hooks S-16 条目 + provisioning；(G-B)：vendor ast-grep-mcp + **mcp-client `insert:` 插行**（R2-4c 同步） | 代码/配置 |
| web 面验证 | e2e 场景 + probe 断言 + 席位差集成文 | 测试/文档 |
| vendor 件（若裁定） | `patches/omo-dsh/vendor/{lsp-core,ast-grep-mcp}/`（playbook 全套） | 内容 |
| 测试 | `tests/omo-*/` 单测 + `tests/e2e/` 四腿场景 | 测试 |
| 门扩展 | doctor-lite / verify-concerto-static（c 组 + c14）/ probe / proofs | 配置 |
| 覆盖基线 | [`phase6-mcp-editing.md`](./phase6-mcp-editing.md)（全条目终态 + 理由） | 文档 |
| 合规 | `THIRD_PARTY_NOTICES.md` Phase 6 小节 + 逐文件署名头 | 合规 |
| 决策与回馈 | fork 三裁定登记（决策记录候选）+ ROADMAP Phase 6 措辞修订（「走 dsh-lsp」句的实测更正，双语）；CHANGELOG；README 状态行 | 文档 |
| **本计划目录** | `docs/plans/phase6-dev/phase6-plan.md`（本文）· [`phase6-tasks.md`](./phase6-tasks.md) · [`phase6-mcp-editing.md`](./phase6-mcp-editing.md) | 文档 |

## 9. 与前后阶段的关系

- **对 Phase 1 的回馈**：hashline-core 的「vendored, not consumed」状态在本阶段终裁——要么消费（E-B），要么以 A/B 证据维持不消费并成文（E-A）；playbook 在 lsp-core/ast-grep-mcp（若 vendor）上第二次、第三次走用，验证其「下一包零新决策」的设计目标。
- **对 Phase 3 的接盘**：S-14/S-15/S-16/S-30 **四条** deferred 逐条终裁进覆盖基线（S-30 = 转 Phase 7，§4.8；R2-4d 同步）；H-24 护栏联动复核。
- **对 Phase 4 的回馈**：已 vendor 的 ast-grep/lsp-setup 技能从「文本在场」转「能力可达」——空头指令风险（技能教 `sg` 而二进制无保障）由 S-16 移植或 (G-B) 闭环。
- **对 Phase 5 的回馈**：team 成员席（hephaestus/sisyphus-junior）的编辑面是 fork E 结果的直接消费者；成员的 LSP/ast-grep 工具可达性进覆盖基线（Q-6）。
- **对 ROADMAP 的回馈**：Phase 6 目标句的两处实测更正——「LSP（走 dsh-lsp）」（F-1：无此包）与「ast-grep（上游的活方向）」（F-2：冻结基线无 MCP 包，活方向 = selective lift 候选）——随首个落地 commit 同发（双语）。
- **对可行性报告的回馈**：§1.1 映射表的 `dsh-lsp*` 行与 `dsh-web-search-exa` 行写的是 DSH 源码 monorepo 全名录、非发行物实况——以「实施期订正」节补入（双语）；**订正位置两处**（评审 8i 更正）：§1.1 映射表行（:111 附近 zh 对应行）**与 §2.3 MCP 映射行（:219 附近，`exa/context7/grep_app → dsh-web-search-exa` 等价句）**——T10 双语同步时逐处核对。沿用 Phase 4.5/5 的研究产物随实施证据更新纪律。
- **Phase 7**：发布节奏（D13）的矩阵行含本阶段四面；O3/O5 开放维度不受本阶段影响。
