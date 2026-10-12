# Phase 6 覆盖基线：MCP/编辑面清单

> **上游依据**：[开发计划书](./phase6-plan.md) · [任务清单](./phase6-tasks.md) · [ROADMAP Phase 6](../../roadmap_zh-CN.md) · [可行性报告 §1.2/§2.3/§2.6/§16.2](../../feasibility-report_zh-CN.md)
>
> **状态**：🚧 **计划期草案**（2026-10-12）——本表每行的「处置」列在 P6-T1 钉测后转实测终态（`git show/ls-tree` 逐字 + 原生钉测证据）；草案期的依据列写明计划期已核实的事实与待核项。逐行终态纪律沿用 Phase 3/5：**每行都要有成文裁定，不许默认滑过**。
>
> **处置枚举**（沿用 Phase 5 四值 + 本阶段增补）：`native-adopt`（原生采用——给在场证明）/ `ported`（语义移植）/ `content-vendor`（内容/代码 vendor，playbook 全套）/ `recorded-difference`（记差异——理由成文）/ `excluded`（排除——ROADMAP 或决策明文）/ `deferred`（挂起——硬理由 + 重议触发条件）。

---

## 1. 编辑面清单

| # | 面 | 上游源（v4.19.4，`packages/` 相对） | 原生面对应 | 处置（草案） | 依据 / 待核 |
|---|---|---|---|---|---|
| E-1 | `hashline-core`（LINE#ID 内容哈希锚定） | `hashline-core/`（**已 vendor** 于 `patches/omo-dsh/vendor/hashline-core/`，78 测试绿，零消费） | `dsh-tool-str-replace-editor` / `dsh-tool-fs` edit | **fork E 裁定对象**（T3） | ROADMAP 明文 A/B 证据裁定；S-46 已实证原生覆写守卫+CAS 是 OMO write-guard 超集 |
| E-2 | `hashline-read-enhancer/` 钩子 | `omo-opencode/src/hooks/hashline-read-enhancer/` | 读取结果锚点增强（`tools/post-execute` 族） | **fork E 裁定对象**（= S-15） | Phase 3 deferred 登记（phase3-hooks.md:79）；T1 Q-1 逐文件语义 |
| E-3 | `hashline-edit-diff-enhancer/` 钩子 | `omo-opencode/src/hooks/hashline-edit-diff-enhancer/` | 编辑 diff 增强（`tools/post-execute` 族） | **fork E 裁定对象**（= S-14） | Phase 3 deferred 登记（phase3-hooks.md:78）；同上 |
| E-4 | atlas `write-edit-tool-policy.ts` | `omo-opencode/src/hooks/atlas/write-edit-tool-policy.ts` | atlas 席位的写/编辑工具策略 | 草案：**recorded-difference**（atlas 席位的 team/编排语义收窄已在 Phase 5 裁定；本件的守卫对象待 T1 Q-1 核实） | 待核：该文件是否仅服务 hashline 工具面（是则随 fork E 联动） |
| E-5 | experimental 配置门（hashline 开关） | `omo-opencode/src/config/schema/experimental.ts` | 本仓 omo 侧 Config 行 | 随 fork E：(E-B) 时移植开关语义；(E-A) 时记差异 | T1 Q-1 核实字段名与默认值 |
| E-6 | DSH 原生编辑面语义（对照基线） | —（DSH 侧） | `str_replace_editor` 四命令（view/create/str_replace/insert）+ read-before-edit + sandbox 围栏 + `FS_STALE_VERSION` CAS | **native-adopt**（A/B 原生臂） | T1 Q-2 全枚举（错误文案/唯一性约束/重试可判性） |

## 2. LSP 面清单

| # | 面 | 上游源（v4.19.4） | 原生面对应 | 处置（草案） | 依据 / 待核 |
|---|---|---|---|---|---|
| L-1 | `lsp-core` 工具族 | `lsp-core/src/tools/` + `tools.ts`（全名单 T1 Q-1 枚举） | **无**（F-1：`dsh-lsp*` 不存在） | **fork L 裁定对象**（T4） | lsp-core 在 ROADMAP §3 约束 5 的 harness-neutral 19 包名单内 |
| L-2 | `lsp-core` `post-edit/`（编辑后诊断） | `lsp-core/src/post-edit/` | `tools/post-execute` 事件族 | (L-A) 时随 vendor 接线；(L-B) 时 **recorded-difference**（MCP 边界外不可达） | T1 Q-4 |
| L-3 | `lsp-core` MCP 协议 pin / request-context / missing-dependency-result | `lsp-core/src/mcp.ts`、`mcp-protocol-pin.test.ts`、`request-context.ts`、`missing-dependency-result.ts` | `dsh-mcp-client` 协议面（2026-07-28 优先） | 随 fork L | 协议 pin 与 mcp-client 策略对账（T1 Q-4②）；缺席具名错误 = 响亮降级纪律的落地件 |
| L-4 | `lsp-daemon` 生命周期 | `lsp-daemon/src/`（14 件：daemon-server/client、socket-jsonrpc、lock、ownership、version-reap 等） | 无（本仓单进程沙箱纪律） | **daemon 必要性裁定**（T1 Q-4③）：in-process client 可行则不 vendor daemon | daemon 的存在理由（多进程共享/预热）在本仓形态下是否成立 |
| L-5 | `lsp-tools-mcp`（MCP server CLI 适配） | `lsp-tools-mcp/src/`（7 件） | `dsh-mcp-client` stdio 挂载 | (L-B) 形态的消费件；ROADMAP §3 约束 5 注记：适配层不作语义源，(L-B) 下语义源仍是 lsp-core | T1 Q-4 闭包钉测 |
| L-6 | `lsp-setup` 技能（已 vendor） | `shared-skills/skills/lsp-setup/`（本仓 `vendor/shared-skills/skills/lsp-setup/`） | `ctx.skills`（SKILL_GESTURE 在服务） | **native-adopt + 消费侧注记**（技能前提与 LSP 工具面的一致性；空头指令纪律） | F-4；技能文本的载体句核验（T1 Q-1） |

## 3. ast-grep 面清单

| # | 面 | 上游源（v4.19.4） | 原生面对应 | 处置（草案） | 依据 / 待核 |
|---|---|---|---|---|---|
| G-1 | `ast-grep-sg-provision/` 钩子 | `omo-opencode/src/hooks/ast-grep-sg-provision/`（hook.ts/index.ts + 测试） | 无原生对应（二进制保障语义） | **fork G 裁定对象**（= S-16，T6） | Phase 3 deferred 登记（phase3-hooks.md:80） |
| G-2 | `install-ast-grep-sg.ts` 安装器 | `omo-opencode/src/cli/install-ast-grep-sg.ts`（+ `omo-codex/src/install/` 同族） | 无 | 随 (G-A) 移植其平台矩阵（**减 Windows 段，D9**） | T1 Q-5① 二进制来源与平台矩阵 |
| G-3 | `ast-grep` 技能（已 vendor） | `shared-skills/skills/ast-grep/`（本仓在册：SKILL.md + `scripts/ast_grep_helper.py` + `install.sh`/`install.ps1`） | `ctx.skills`（在服务） | **native-adopt + provisioning 衔接**（技能自带 `install.sh` 与 S-16 钩子的双来源裁定，T1 Q-5②）；`install.ps1` = Windows 件记差异（D9） | F-4；空头指令纪律（技能教 `sg` 而二进制无保障 = 红） |
| G-4 | `@oh-my-opencode/ast-grep-mcp`（**v5 时代件，不在冻结基线**） | v5 tag 待定（T1 重跑 tag 判定——playbook 步骤 1） | `dsh-mcp-client` stdio 挂载 | **fork G 的 (G-B) 臂**：selective lift（ROADMAP §2 规则 4）+ 决策登记 | F-2；「上游的活方向」行文依据在册（ROADMAP Phase 6）；基线纪律（D14）反向论据同样在册 |

## 4. web 面清单

| # | 面 | 上游源（v4.19.4） | 原生面对应 | 处置（草案） | 依据 / 待核 |
|---|---|---|---|---|---|
| W-1 | web 搜索（模型面工具） | OMO 三 provider 之一后端 | **`dsh-tool-web` 的 `web_search`**（dsh-base:478-482 挂载 `web-search-deepseek` 后端） | **native-adopt**（三层断言：配置/工具面/行为，T8） | F-3；诚实性断言（无 key 时结构化错误具名，不许断言成功） |
| W-2 | web 抓取（模型面工具） | 同上 | **`dsh-tool-web` 的 `web_fetch`**（dsh-base:483-485 挂载 `web-fetch-http` 后端） | **native-adopt**（同 W-1） | F-3；H-24 护栏联动复核（SSRF 守卫不回退） |
| W-3 | `exa` MCP（web 搜索 provider） | OMO 内建 MCP 配置 | `dsh-web-search-exa` 在可行性报告名单但**实装缺席** | 草案：**recorded-difference**（内建 deepseek 后端覆盖；真需要走 mcp-client 或原生 provider 行，本阶段不建设） | 待核：OMO 侧 exa 的语义残余（是否仅 provider 多样性问题）——T1 Q-1⑦ |
| W-4 | `context7` MCP（文档查询） | OMO 内建 MCP 配置（librarian 席位消费） | 无直接对应；最近邻 = web_fetch + 技能指引 | 草案：**recorded-difference**；librarian 席位差集成文（Q-6） | 同上 |
| W-5 | `grep_app` MCP（代码搜索 provider） | OMO 内建 MCP 配置 | 无对应；最近邻 = 本地检索 + web_search | 草案：**recorded-difference** | 同上 |
| W-6 | webfetch 护栏族 | `omo-opencode/src/hooks/webfetch-redirect-guard/` 等 | **已移植**（Phase 3 H-24，B+D 形态，SSRF 护栏） | **native-adopt（已落地）+ 联动复核**（本阶段任何 web 改动不得回退其语义） | phase3-hooks.md:52；约束 6 |
| W-7 | 名册席位 web 可达性 | librarian = web 搜索/context7（可行性报告 §2.1）；explore = ast-grep | 席位 toolFilter（doctor-lite 26 行校验在册） | 差集裁定成文（**不改席位路由本身**——名册 = Phase 2 产物） | T1 Q-6 |

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
| S-14 | `hashline-edit-diff-enhancer/` | P6-T3 | fork E：(E-B) 移植 / (E-A) 以 A/B 证据「原生覆盖」闭环 |
| S-15 | `hashline-read-enhancer/` | P6-T3 | 同上（同 fork 同 commit） |
| S-16 | `ast-grep-sg-provision/` | P6-T6 | fork G：(G-A) 移植 / (G-B) 以「MCP 形态替代」闭环 |

## 7. 待核清单（T1 转实测项）

| # | 待核项 | 钉测 |
|---|---|---|
| N-1 | hashline-core API 面与两个 enhancer 钩子的**逐文件**语义（草案期只有文件名级事实） | T1 Q-1 |
| N-2 | `lsp-core` 工具全名单与外部依赖树 | T1 Q-1/Q-4 |
| N-3 | `dsh-mcp-client` 配置行形状 / `mcp__*` 命名 / stdio 探测与失败形态 | T1 Q-2（fixture server 端到端） |
| N-4 | web 三层在场实测（dump-config / 工具面 / 行为层）与结构化错误形状 | T1 Q-2 |
| N-5 | `str_replace_editor` / `edit` 的错误文案与重试可判性逐字 | T1 Q-2 |
| N-6 | 编辑失败模式清单终态（计划书 §4.3 四类 ± 新增） | T1 Q-3 |
| N-7 | fixture 语言服务器选型与 CI hermetic 形态 | T1 Q-4④/Q-7 |
| N-8 | v5 tag 现状重判（v5.0.0 stable 是否已发布——playbook 步骤 1，不沿用旧结论） | T1 Q-5③ |
| N-9 | 席位 toolFilter 差集（web/ast-grep/编辑面 × 11 席 + team 成员席） | T1 Q-6 |
| N-10 | 本阶段注入点 kind 命名表与 vendor 候选 licenses 计数预测（基线 61） | T1 Q-8 |
