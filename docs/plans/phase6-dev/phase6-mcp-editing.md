# Phase 6 覆盖基线：MCP/编辑面清单

> **上游依据**：[开发计划书](./phase6-plan.md) · [任务清单](./phase6-tasks.md) · [ROADMAP Phase 6](../../roadmap_zh-CN.md) · [可行性报告 §1.2/§2.3/§2.6/§16.2](../../feasibility-report_zh-CN.md)
>
> **状态**：🚧 **T1 实测回填（2026-10-13）**——§1–§7 全部转实测终态：每行「处置」列以 `git show/ls-tree` 逐字 + 原生钉测证据落定；fork 敏感行（E/L/G）保持「fork 裁定对象」定位，终裁随 T3/T4/T6 以 `FORKS.md` 证据书执行。逐行终态纪律沿用 Phase 3/5：**每行都要有成文裁定，不许默认滑过**。
>
> **修订记录**：
> - **2026-10-13 评审修复（第 1+2+3 轮）**——E-7 新增（hashline 工具面）并重述为「15 shim + 9 自留件（5 实现 + AGENTS.md + 3 测试，R3-1 终值）」、G-2b 新增（utils provisioning 层）、L-1/L-4/L-5 计数与主体层更正、E-6 原生臂改已挂载 edit 面、W-1/W-2/W-7 引用更正、§6 补 S-30 转 Phase 7 + (L-C) 替代验收行、§7 待核清单扩 N-2b/N-3b。逐条裁决见 phase6-review-{1,2,3}-response.md（仲裁台账，存 `.omo/evidence/p6-plan-review/`——gitignored 证据档，不入库）。**路径口径声明**：§1/§3 表的「上游源」列 = `packages/` 相对（R2-2/R3-5）。
> - **2026-10-13 P6-T1 实测回填**——PRE-1…5 全 ✅（基线日志 `.omo/evidence/p6t1/pre2-baseline.log`）；Q-1…Q-8 逐 Q 闭环（Q-2 mcp-client 行为钉测 S1–S6 随钉测档回填，见 N-3）；三 fork 证据书与 T1 即裁项 = `.omo/evidence/p6t1/FORKS.md`（gitignored 证据档，不入库——c14 并集不扩裁定 §0-1、H 编号预分 §0-2、臂 (A) 组成 §0-3、「重复引擎」叙事推翻 §0-4、S-30 转 Phase 7 确认 §0-5、许可姿态 §0-6）。仲裁员实测全档 = `.omo/evidence/p6t1/notes-arbiter.md`。
>
> **处置枚举**（沿用 Phase 5 四值 + 本阶段增补）：`native-adopt`（原生采用——给在场证明）/ `ported`（语义移植）/ `content-vendor`（内容/代码 vendor，playbook 全套）/ `recorded-difference`（记差异——理由成文）/ `excluded`（排除——ROADMAP 或决策明文）/ `deferred`（挂起——硬理由 + 重议触发条件）。

---

## 1. 编辑面清单

| # | 面 | 上游源（v4.19.4，`packages/` 相对） | 原生面对应 | 处置（T1 实测） | 依据 |
|---|---|---|---|---|---|
| E-1 | `hashline-core`（LINE#ID 内容哈希锚定） | `hashline-core/`（**已 vendor** 于 `patches/omo-dsh/vendor/hashline-core/`，78 测试绿，**零 import 消费**——R2-4h/MINOR-3 口径） | `dsh-tool-fs` edit（**已挂载**）；`dsh-tool-str-replace-editor`（**未挂载**，见 E-6） | **fork E 裁定对象**（T3） | ROADMAP 明文 A/B 证据裁定；S-46 已实证原生覆写守卫+CAS 是 OMO write-guard 超集；T1 证据书 `FORKS.md` §1 |
| E-2 | `hashline-read-enhancer/` 钩子 | `omo-opencode/src/hooks/hashline-read-enhancer/`（3 件：hook.ts 216 行 + index.ts 1 行 barrel + index.test.ts 300 行） | 读取结果锚点增强（`tools/post-execute` 族） | **fork E 裁定对象**（= S-15）；**H-35 预分**（`FORKS.md` §0-2） | T1 实测：已接线（`create-tool-guard-hooks.ts:124-125`）、门 `config.hashline_edit?.enabled ?? false`（hook.ts:27-28）、`tool.execute.after` 事件、变换 `N: text` → `N#HASH\|text`（hook.ts:64-65，hash 经 shim 到 vendored core）；**DSH 格式兼容亲验**：DSH read 信封 = `<path>/<type>/<content>` + `N: text` 行（dsh-tool-fs lib:100-112 `formatReadOutput`）——上游 `<content>` 块识别与 COLON 行模式逐点对上，无格式墙 |
| E-3 | `hashline-edit-diff-enhancer/` 钩子 | `omo-opencode/src/hooks/hashline-edit-diff-enhancer/`（**1 件**：hook.ts 113 行，无 index 无测试） | 编辑 diff 增强（`tools/post-execute` 族） | **fork E 裁定对象**（= S-14）；**H-36 预分·占位不烧号**（`FORKS.md` §0-2）；T3 残余裁定主推 = **recorded-difference** | T1 实测：**上游孤儿件**——barrel/enum/composer 三处零接线（亲验 grep），`hooks/AGENTS.md:9` 自证 "NOT registered…orphaned"；语义 = write 前后内容捕获 + unified diff/filediff metadata 注入（hook.ts:98/:108）；**DSH 原生已交付等价面**：write/edit「derive replayable diff-card metadata for UI presentation」（dsh-tool-fs README:51）——孤儿 + 原生等价双依据 |
| E-4 | atlas `write-edit-tool-policy.ts` | `omo-opencode/src/hooks/atlas/write-edit-tool-policy.ts`（5 行名谓词——**实际路径**，计划稿 `src/atlas/` 已更正） | atlas 席位的写/编辑工具策略 | **recorded-difference**（T1 实测终态） | T1 实测：纯名谓词 `["Write","Edit","write","edit","hashline_edit"]`（全 5 行逐字），唯一消费方 = `hooks/atlas/tool-execute-before.ts:14`（orchestrator direct-work 警告钩——该钩子系统未移植，与本阶段四腿零依赖）；差异条目标注：上游名清单含 `hashline_edit`，(E-B) 落地时若复 port 该谓词须带此名 |
| E-5 | hashline 配置门（开关） | `omo-opencode/src/config/schema/oh-my-opencode-config.ts:60`（**顶层** `hashline_edit: z.boolean().optional()`，注释 "(default: false)"）；另格 = `experimental.ts:19` 同名字段（不被门控消费） | 本仓 omo 侧 Config 行 | 随 fork E：(E-B) 时移植开关语义；(E-A) 时记差异 | T1 实测更正字段位置（原计划稿引 `experimental.ts:18-19`——R2-10 结论的位置注记作废，字段名与默认值结论不变）；消费面 = `tool-registry-gated-tools.ts:32`（`hashline_edit ? { edit: createHashlineEditTool(ctx) } : {}`）+ 双钩侧 `?? false` 镜像 |
| E-6 | DSH 原生编辑面语义（对照基线） | —（DSH 侧） | **组合内已挂载 = `dsh-tool-fs` 的 read/write/edit**（dsh-base `cordis.patch.yml:281-282`）+ read-before-edit + sandbox 围栏 + `FS_STALE_VERSION` CAS；**`dsh-tool-str-replace-editor` 在安装树但未挂载** | **native-adopt**；**A/B 臂 (A) 组成 T1 已裁 = 已挂载 edit 面，str_replace_editor 不入臂**（`FORKS.md` §0-3——实验决策问题 = 现状 vs hashline，第三变量摧毁决策价值；其为 dsh-base README:56-57 文档化的可选加装件，记差异注明 ROADMAP 点名对象与组合实况的落差） | T1 Q-2 全枚举逐字：唯一匹配约束（`old_string must appear exactly once.` lib:695）、`non-empty`/`must differ`、FS_NOT_OBSERVED（`cannot modify … file has not been read — read the file, then retry`）、FS_STALE_VERSION（`— re-read the file, then retry`）、重读后缺席 FS_NOT_FOUND；在场性四证（顶层 dep :87 带入/零挂载/组合树零命中/零反向依赖）；read-before-edit 观察亦可由 str_replace_editor `command: view` 建立（README:136，文档事实登记） |
| E-7 | **hashline 编辑工具面**（工具注册/描述/执行器本体） | `omo-opencode/src/tools/hashline-edit/`（**24 件 = 15 薄 re-export shim + 9 自留件**（5 实现：`tools.ts`/`tool-description.ts`/`hashline-edit-executor.ts`/`formatter-trigger.ts`（cache 为其内导出）/`index.ts` + AGENTS.md + 3 测试），R3-1 终值亲验复核）；`package.json:22` workspace 依赖逐字；gating = `tool-registry-gated-tools.ts:32`（**以 `edit` 之名注册**，默认关） | `dsh-tool-fs` edit 写入路径（可行性报告 §2.6 定位 = 替换） | **fork E 裁定对象**（随 T3）：(E-B) 的移植单元 = **5 个自留实现件 + 配置门（E-5）**；(E-A) 时记差异，且须正面回答为何不搬工具面（ROADMAP §3 约束 5「不取自适配层」的适用性——本目录在 `omo-opencode/src/tools/` 属适配层） | 实现件语义 T1 逐件在册（executor = normalize→validate→order/dedupe→apply(core)→write→formatter→diff metadata 管线；formatter-trigger = 逐目录 formatter 配置解析/缓存/spawn；tool-description = `LINE#ID` 格式教学串）；上游 A/B 开关先例 = gating 表达式本身（`FORKS.md` §1.1） |

## 2. LSP 面清单

| # | 面 | 上游源（v4.19.4） | 原生面对应 | 处置（T1 实测） | 依据 |
|---|---|---|---|---|---|
| L-1 | `lsp-core` 工具族 + **主体实现层** | `lsp-core/src/tools/`（13 .ts = 12 实现 + 测试）+ `src/lsp/`（62 件 = 45 非测试 .ts + 16 测试 .ts + 1 .mjs fixture）+ post-edit/mcp/request-context 等；包 src 全账 = **86 .ts + 1 .mjs = 87 件，其中非测试 .ts 65**（T1 精确对账，三口径调和） | **无**（F-1：`dsh-lsp*` 不存在） | **fork L 裁定对象**（T4） | harness-neutral 依据 = 可行性报告 §1.2 的 19 包名单 + package.json 自述逐字；T1 实测：零外部 npm deps（仅 `@oh-my-opencode/mcp-stdio-core` workspace——package.json 逐字）；`index.ts` 全 re-export 公共面；测试 = **bun:test**（21 件，3 件抽查头部逐字）→ 测试携带默认排除随 T4 登记；证据书 `FORKS.md` §2 |
| L-2 | `lsp-core` `post-edit/`（编辑后诊断） | `lsp-core/src/post-edit/`（index.ts 1 行 barrel + orchestration.ts） | `tools/post-execute` 事件族 | (L-A) 时随 vendor 接线；(L-B) 时 **recorded-difference**（MCP 边界外不可达） | T1 实测语义 = 编辑后诊断收集编排（逐文件并发上限 4、clean/not_configured 三态 outcome、notConfigured 扩展名缓存——orchestration.ts 头部逐段）；MCP 面只暴露 tools，事件钩面不可达 |
| L-3 | `lsp-core` MCP 协议 pin / request-context / missing-dependency-result | `lsp-core/src/mcp.ts`（116 行手写 JSON-RPC server，基于 `@oh-my-opencode/mcp-stdio-core`）、`mcp-protocol-pin.test.ts`、`request-context.ts`、`missing-dependency-result.ts` | `dsh-mcp-client` 协议面 | 随 fork L | T1 实测：**无硬 pin**——initialize **回显**客户端所请 protocolVersion（缺省 `"2024-11-05"`，mcp.ts `requestedProtocolVersion` 逐字）；dsh-mcp-client README 称优先 2026-07-28（lib 常量静态未定位）→ 无冲突，wire 真值随 N-3 钉测 S1 回填；pin 测试 = bun:test |
| L-4 | `lsp-daemon` 生命周期 | `lsp-daemon/src/`（18 件递归全非测试）+ `test/`（22 件，vitest——vitest.config.ts 在册） | 无（本仓单进程沙箱纪律） | **daemon 必要性 T1 证据闭环 → 记差异候选**（T4 终裁确认） | T1 实测：`lsp-core/src/lsp/manager.ts` = 完整**进程内** ClientManager（refCount/idle reaper/init 串行化/clientFactory 注入点逐字）；LspClient 经 `process.ts` 直接 spawn 语言服务器——in-process 自洽、**不依赖 daemon**；daemon = 跨进程常驻产品（ipc-protocol/lock/ownership/proxy/version-reap——omo-lsp CLI 生命周期），DSH = 长驻 harness 进程，其存在理由在本仓形态不成立 |
| L-5 | `lsp-tools-mcp`（MCP server CLI 面——**T1 推翻「自含引擎」定性**：src 30 件中 29 件 = **1 行 re-export shim**（`export * from "@oh-my-opencode/lsp-core/..."` 逐字），仅 `cli.ts`（~30 行入口）独有；blob hash 29/29 同名不同文，零件逐字节相同——「25/30 引擎拷贝」叙事作废，三证在 `FORKS.md` §0-4；**且为第三方 MIT 包 `@code-yeongyu/lsp-tools-mcp`**） | `lsp-tools-mcp/src/`（30 件递归全非测试） | `dsh-mcp-client` stdio 挂载（**= 新插行，触发同步网**） | 窄化 (L-B) 下 **不 vendor 该包**；cli.ts 级薄面语义参照（若逐字参照则 NOTICES 记 MIT 归属条目——名称门新案收窄为归属措辞案，`FORKS.md` §0-6） | T1 实测：无运行时 dependencies（devDeps 含 `@oh-my-opencode/lsp-core` file:../lsp-core）；build = bun build 打包 cli/mcp/tools/request-context/manager 五入口；真实移植单元 = lsp-core 65 + mcp-stdio-core 6 + cli 薄面 ≈ **72 件**（仍 >40 阈值，T4 (L-B) 1.5 天量级纪律不变） |
| L-6 | `lsp-setup` 技能（已 vendor） | `shared-skills/skills/lsp-setup/`（本仓 `patches/omo-dsh/vendor/shared-skills/skills/lsp-setup/`） | `ctx.skills`（SKILL_GESTURE 在服务） | **native-adopt + 消费侧注记**（技能前提与 LSP 工具面的一致性随 T4 落地形态核验；空头指令纪律） | F-4；T1 现状：LSP 工具面缺席 → 技能当前为「文本层已交付」态（F-4 口径），T5 e2e 闭环时核验载体句 |

## 3. ast-grep 面清单

| # | 面 | 上游源（v4.19.4） | 原生面对应 | 处置（T1 实测） | 依据 |
|---|---|---|---|---|---|
| G-1 | `ast-grep-sg-provision/` 钩子（**薄壳**） | `omo-opencode/src/hooks/ast-grep-sg-provision/`（3 件：hook.ts 74 行 + index.ts 5 行 + 测试 74 行） | 无原生对应（二进制保障语义） | **fork G 裁定对象**（= S-16，T6）；**H-37 预分**（`FORKS.md` §0-2）；**移植单元 = 本壳 + G-2b 的 utils 层，不可分割** | T1 实测：`session.created` 单事件门（hook.ts:63 亲验）、targetDir = `~/.omo/runtime/ast-grep/<slug>`（hook.ts:58）、provision-once + `findSgBinary` 短路 + 调度异步 provision（hook.ts:64-67 逐字）；无平台分支无 URL（语义全在 utils 层）；接线点 = `create-session-hooks.ts:151` |
| G-2 | `install-ast-grep-sg.ts` 安装器（**两件**） | `omo-opencode/src/cli/install-ast-grep-sg.ts`（36 行）+ `omo-codex/src/install/install-ast-grep-sg.ts`（42 行） | 无 | **recorded-difference**（T1 实测终态）：两件均 = 委托壳（逐字 import `runAstGrepSkillInstall` 调技能脚本），自身**无平台矩阵**；CLI 安装入口语义不属于本阶段四腿消费面 | T1 实测：omo-opencode 件经 `cli-installer.ts:128`/`tui-installer.ts:110` 调用、omo-codex 件经 `install-codex.ts:110` 调用；矩阵语义全在 G-2b `sg-manifest.ts`（计划稿「install-ast-grep-sg.ts 平台矩阵」措辞已更正） |
| G-2b | **utils provisioning 层** | `utils/src/ast-grep/`（**10 件 = 6 实现 491 行 + 4 测试 535 行**：index(5)/types(31)/sg-manifest(48)/sg-resolver(78)/sg-provisioner(173)/install-script(156)） | 无 | 随 (G-A) 语义移植（H-37 钩条目消费其语义）；(G-B) 叠加时以 v5 版 8 实现件重估（见 G-4） | T1 实测：`SG_PINNED_VERSION = "0.43.0"` + 六 slug manifest（sha256 + 逐字 GitHub release URL 各 6，亲验）；resolver 顺序 `OMO_AST_GREP_SG_PATH` env → runtimeDir → PATH（`ast-grep`/`sg`，`--version` 探针要求输出含 "ast-grep"）；provisioner = fetch 60s + **sha256 校验**（sg-provisioner.ts:160-163 逐字）+ 手写 zip 读取（无 zip64）+ chmod 755 + 原子 rename；install-script = spawn 技能 install.sh/install.ps1（`OMO_AST_GREP_BIN_DIR` 注入，30s 超时，pwsh→powershell.exe 回退） |
| G-3 | `ast-grep` 技能（已 vendor） | `shared-skills/skills/ast-grep/`（17 件；SOURCE = `code-yeongyu/ast-grep-skill @ 3148c69`；本仓 `patches/omo-dsh/vendor/shared-skills/skills/ast-grep/` 在册） | `ctx.skills`（在服务） | **native-adopt + provisioning 衔接（双来源 T1 已裁）**：钩层 provision（sha256 校验）= **权威来源**；技能自带 `install.sh`（包管理器级联 + GitHub zip 回退、**无校验和**——逐行 grep 实证）= 保留的技能文档/回退路径，零额外成本；`install.ps1` = Windows 件记差异（D9） | T1 实测：install.sh 286 行（brew/npm/cargo/pip/nix/mise 级联，windows 段仅 npm/cargo/pip/mise 且无 zip triple）、install.ps1 235 行；两者均 honor `OMO_AST_GREP_BIN_DIR`（与 TS 层同一 env key——install-script.ts:135 注入）；空头指令纪律不变（技能在场而二进制无保障 = 红） |
| G-4 | `@oh-my-opencode/ast-grep-mcp`（**v5 时代件，不在冻结基线**） | **v5.0.0 stable = `eb5c55c67877ef58e58a174b4c26d0c3e941eca0`**（T1 重跑 tag 判定：本地 tag 在场 + `packages/ast-grep-mcp` 在树亲验；远端 v5 线最新 v5.1.32，零 ast-grep 名单独 tag）；包件 = 9 实现（cli/index/mcp/normalize/pattern-hints/sg-runner + tools/{search,scan,rewrite}）+ 10 测试（bun:test） | `dsh-mcp-client` stdio 挂载 | **fork G 的 (G-B) 臂**：selective lift + 决策登记；**(G-B) 以 sg 二进制在位为前提**（`sg-runner.ts` spawn sg、`mcp.ts:25` import v5-only `resolveSgBinarySync`——v4 零命中）→ 与 (G-A) 非互斥，真实裁定 = 自足 vs 叠加（`FORKS.md` §3.2） | T1 实测闭包 = ast-grep-mcp 9 + mcp-stdio-core 6 + **v5 utils/ast-grep 8 实现**（v4→v5 由 6 增 8：新增 sg-candidates/sg-install-hints——版本偏斜登记）≈ 23 件 + mcp-client 插行；v5.0.0 LICENSE.md 与 v4 blob 同文（SUL-1.0——`FORKS.md` §0-6） |

## 4. web 面清单

| # | 面 | 上游源（v4.19.4） | 原生面对应 | 处置（T1 实测） | 依据 |
|---|---|---|---|---|---|
| W-1 | web 搜索（模型面工具） | OMO 三 provider 之一后端 | **`dsh-tool-web` 的 `web_search`**（组合树 dump 五条目在册：`:329` dsh-web / `:334` web-search-deepseek / `:338` web-fetch-http / `:339-340` tool-web / `:344-345` mcp-resources——`.omo/evidence/p6t1/dump-config-p6t1.yml`） | **native-adopt**（三层断言：配置✅T1 / 工具面 / 行为——后两层 T8） | T1 Q-2：dump-config 组合后树五行在位（沙箱 profile 物化 + dump，非仅 base patch 文件）；诚实性断言（无 key 时结构化错误具名）随 T8 |
| W-2 | web 抓取（模型面工具） | 同上 | **`dsh-tool-web` 的 `web_fetch`**（同 W-1 dump 证据） | **native-adopt**（同 W-1） | F-3 + T1 dump；H-24 护栏联动复核（SSRF 守卫不回退，约束 6） |
| W-3 | `exa` MCP（web 搜索 provider） | `omo-opencode/src/mcp/websearch.ts`（40 行：默认 provider = exa，`https://mcp.exa.ai/mcp?tools=web_search_exa`，`EXA_API_KEY` 可选 Bearer；tavily 分支需 `TAVILY_API_KEY` 否则返回 undefined 跳过） | `dsh-web-search-exa` 在可行性报告名单但**实装缺席** | **recorded-difference**（T1 实测终态） | T1 实测语义（上）；内建 deepseek 后端覆盖搜索需求；缺席成文 |
| W-4 | `context7` MCP（文档查询） | `omo-opencode/src/mcp/context7.ts`（31 行：`https://mcp.context7.com/mcp`，`CONTEXT7_API_KEY` 可选且占位符容忍归 null；无 key 仍 enabled） | 无直接对应；最近邻 = web_fetch + 技能指引 | **recorded-difference**（T1 实测终态）+ **覆盖缺口具名**：「库文档解析」语义（resolve-library-id/query-docs 工具族——OMO librarian 提示词逐字引用）非通用 web 搜索严格子集，功能替代 = 内建 web 搜索/抓取，语义差成文 | T1 实测：全局注册（`mcp/index.ts:46-48`）、`disabled_mcps` 门、librarian 提示词引用（librarian.ts:122 区域）；Q-6 差集：本仓 librarian 席保留原生 web 可达 |
| W-5 | `grep_app` MCP（代码搜索 provider） | `omo-opencode/src/mcp/grep-app.ts`（**全 6 行**逐字：`https://mcp.grep.app`，enabled，无 key 无 env） | 无对应；最近邻 = 本地检索 + web_search | **recorded-difference**（T1 实测终态）+ **覆盖缺口具名**：GitHub 代码搜索语义（`searchGitHub` 工具——OMO librarian 提示词逐字引用）无逐一同名等价 | 同 W-4 |
| W-6 | webfetch 护栏族 | `omo-opencode/src/hooks/webfetch-redirect-guard/` 等 | **已移植**（Phase 3 H-24，B+D 形态，SSRF 护栏） | **native-adopt（已落地）+ 联动复核**（本阶段任何 web 改动不得回退其语义） | phase3-hooks.md:52；约束 6 |
| W-7 | 名册席位 web 可达性 | librarian = web 搜索/context7（可行性报告 §2.1）；explore = ast-grep | 席位 toolFilter（doctor-lite roster 契约 + 静态门 c10.1–c10.10 双机读面） | **差集 T1 实测成文**（不改席位路由本身——名册 = Phase 2 产物） | T1 Q-6 实测（roster.ts:373-390 逐函数）：read-only 六席 deny = [write, edit, ...delegation] → **web_search/web_fetch 保留**；worker 两席 deny = delegation only → 编辑面 + web 全保留；atlas 无 filter；multimodal-looker = allowlist [read, read_image] → web/MCP 结构性不可达；team 成员席 deny = delegation（roster-seats.ts:257/:263 + team-create.ts:281）→ 直接消费编辑面；未来 `mcp__*` 工具默认对全部非 allowlist 席可达——是否 deny = T8/T10 名册决策项 |

## 5. OMO MCP 七件处置总表

| MCP | 处置（T1 实测） | 依据 |
|---|---|---|
| LSP（`lsp-tools-mcp`/`lsp-daemon`/`lsp-core`） | **fork L 裁定对象**（§2 L-1…L-5；daemon = 记差异候选、tools-mcp = 不 vendor 的 shim 面——T1 收窄） | ROADMAP Phase 6 目标句具名；`FORKS.md` §2 |
| ast-grep | **fork G 裁定对象**（§3 G-1…G-4；(G-B) 以 provisioning 为前提的叠加关系 T1 成文） | ROADMAP「活方向」+ D14 基线纪律双向在册；`FORKS.md` §3 |
| codegraph | **excluded**（上游已删——MCP server/bootstrap/config 全移除，§16.2） | ROADMAP Phase 6 明文排除 |
| grep_app / context7 / exa | **recorded-difference**（§4 W-3…W-5 T1 实测终态，覆盖缺口具名） | DSH 内建覆盖 web 需求 |
| git-bash-mcp | **excluded**（Windows 专用） | D9 |

## 6. Phase 3 deferred 接盘表

| 行 | 模块 | 接盘任务 | 终裁方向 |
|---|---|---|---|
| S-14 | `hashline-edit-diff-enhancer/` | P6-T3 | fork E：(E-B) 时裁定带接线移植 vs **recorded-difference**（T1 新证据：**上游孤儿件**——1 文件零接线、`hooks/AGENTS.md:9` 自证；DSH 原生 diff-card metadata 等价面在册——E-3 行双依据，主推记差异）/ (E-A) 以 A/B 证据「原生覆盖」闭环 |
| S-15 | `hashline-read-enhancer/` | P6-T3 | fork E：(E-B) 移植（T1 实测：已接线件、DSH read 信封格式逐点兼容——E-2 行）/ (E-A) 闭环 |
| S-16 | `ast-grep-sg-provision/` | P6-T6 | fork G：(G-A) 移植（钩子壳 + utils 层 = G-1 + G-2b 不可分割；双来源裁定、Windows 减项清单在册）/ (G-B) 以「provisioning 之上的 MCP 面叠加」重述（T1 重构——非互斥替代） |
| S-30 | `read-image-resizer/`（18 文件 = 14 实现 + 4 测试，phase3-hooks.md:94） | ~~P6-T1 过一遍~~ **T1 已过（2026-10-13）** | **转 Phase 7 确认**（`FORKS.md` §0-5）：双向零语义残余（四腿对 resizer grep 各 0 命中；反向 resizer 仅引 `shared*`/`look-at/mime-type-inference`，四腿亦不引）；**Anthropic-only**（`hook.ts:126` `providerID !== "anthropic"` 即返回——本仓路由无 anthropic provider，移植即死码）；阈值 1568px/5MB/质量梯 [80,60,40]/TOKEN_DIVISOR 750 在册；重议触发条件 = multimodal-looker 真实视觉链路立项时连同 DSH 请求侧图像预算（imagePixelBudget/imageMaxBytes）一并裁定 |

**(L-C) 裁定时的替代验收行**（评审 B-4 增补）：fork L 若裁 (L-C)，T5 取消（删除线 + 理由成文，不算未完成），其验收由「T4 记差异文档 + ROADMAP 措辞修订到位」替代——T9/T10 的依赖行已同步加注。

## 7. 待核清单（T1 转实测项）——闭环状态

| # | 待核项 | 钉测 | 状态（2026-10-13） |
|---|---|---|---|
| N-1 | hashline-core API 面 + `tools/hashline-edit/` 24 件 + 两个 enhancer 钩子的逐文件语义 | T1 Q-1 | ✅ 闭环（24 = 15 shim + 9 自留复核；实现件语义逐件在册；diff-enhancer 孤儿新证据——E-3 行） |
| N-2 | `lsp-core` 工具全名单与外部依赖树 + `src/lsp/` 主体层 + 三包闭包 | T1 Q-1/Q-4 | ✅ 闭环（精确账：87 = 65 非测试 .ts + 21 测试 .ts + 1 .mjs；`src/lsp/` 62 件；shim 真相三证——L-1/L-5 行） |
| N-2b | `utils/src/ast-grep/` 10 件 provisioning 层逐文件 | T1 Q-1/Q-5 | ✅ 闭环（6 实现 491 行逐件语义 + 载荷行抽核——G-2b 行） |
| N-3 | `dsh-mcp-client` 插行形状 / `mcp__*` 命名 / stdio 探测与失败形态 / **同名包双插行实例化行为** | T1 Q-2（fixture server 端到端） | ⏳ 契约层 ✅（README 逐字 + lib 日志锚点 + 模板逐字 + 依赖 `@modelcontextprotocol/client` 2.0.0）；行为层**钉测实跑中**（S1–S6，档 `.omo/evidence/p6t1/mcp-client-probe/`——回填后转 ✅） |
| N-3b | `str_replace_editor` 未挂载的在场性钉测 + A/B 臂 (A) 组成裁定 | T1 Q-2 | ✅ 闭环（四证在场性 + 臂 (A) 组成裁定 `FORKS.md` §0-3——E-6 行） |
| N-4 | web 三层在场实测（dump-config / 工具面 / 行为层）与结构化错误形状 | T1 Q-2 | ① dump-config ✅（组合树五条目，`dump-config-p6t1.yml`）；②③ → T8 e2e 范围（接缝先例在册） |
| N-5 | **已挂载 edit 面（`dsh-tool-fs`）**的错误文案与重试可判性逐字 | T1 Q-2 | ✅ 闭环（E-6 行逐字枚举：唯一性/政策两码/空串/同文/FS_NOT_FOUND） |
| N-6 | 编辑失败模式清单终态（计划书 §4.3 四类 ± 新增） | T1 Q-3 | ✅ 素材闭环（原生面失败类逐字 = E-6 行 + hashline 面失败类（stale-anchor/hash 不匹配/编辑序冲突）列入 T2 台架逐类数据义务——`FORKS.md` §1.2/§1.4）；台架数据本身 = T2 产出 |
| N-7 | fixture 语言服务器选型与 CI hermetic 形态 | T1 Q-4④/Q-7 | ✅ 方向闭环（**本机六候选语言服务器全缺席**亲验 → hermetic 替身 LSP server 优先，真实服务器沙箱临装备选；反向金丝雀纪律成文——`FORKS.md` §5.1）；选型终裁随 T4 |
| N-8 | v5 tag 现状重判 | T1 Q-5③ | ✅ 闭环（**v5.0.0 stable 在场** = `eb5c55c6` + `packages/ast-grep-mcp` 在树亲验；远端最新 v5.1.32——G-4 行） |
| N-9 | 席位 toolFilter 差集（web/ast-grep/编辑面 × 11 席 + team 成员席） | T1 Q-6 | ✅ 闭环（W-7 行逐类成文） |
| N-10 | 本阶段注入点 kind 命名表与 vendor 候选 licenses 计数预测（基线 61） | T1 Q-8 | ✅ 闭环（`FORKS.md` §5.2：kind 表 + 计数预测随首个落地 commit 实测登记） |
