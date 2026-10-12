# Phase 6 任务清单

> **上游依据**：[开发计划书](./phase6-plan.md) · [MCP/编辑面清单与覆盖基线](./phase6-mcp-editing.md) · [ROADMAP Phase 6](../../roadmap_zh-CN.md) · [决策 D9／D14／D17](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 6 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，覆盖基线给出"每条 MCP/编辑面的处置"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：🚧 立项（2026-10-12，基线 = Phase 5 结项后的 `feature/phase6-dev`）。`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）· ~~删除线~~ = 仲裁取消。
>
> **编号**：`P6-T<n>`（Phase 6 - Task n）。工作包归属见计划书 §7。
>
> **任务书头部规则**（沿用 Phase 4.5/5 纪律）：每个适配/移植任务的证据栏 = **受影响门 + 场景级记录**；fork 敏感任务（标 ⚖️）必须先把 fork 依据写进证据再动手；typecheck 验证必须**显式退出码**（T7 教训：永远 `echo TYPECHECK_EXIT=$?`，不许 `| tail -1` 扫尾）。

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1 | installed dsh = pin 的 0.2.0-rc.2 | `dsh --version`；doctor-lite 基线 PASS | ⬜ |
| PRE-2 | 基线绿：`scripts/ci-local.sh` 8 门全绿 | 退出 0；记录基线（门 2 测试数、门 3 场景数、门 5 `checked`、门 6 断言数、门 8 proofs 数） | ⬜（Phase 5 结项快照：门 2 = 90 文件/2056 测试；门 3 = 41/41；门 5 = checked=61；门 6 = 37/37；门 8 = 8/8——开工时重采） |
| PRE-3 | 本地 OMO 检出只读可用 | `git -C ~/GithubRepo/oh-my-openagent rev-parse v4.19.4^{commit}` = `b072d279110bdda2c6ac2525d0d24dc54d16148a`；全程只用 `git show/ls-tree`，工作树不动 | ⬜ |
| PRE-4 | hashline-core vendor 完整 + 19 技能目录在服务 | vendor 漂移门绿（hashline-core 条目）；`omo-commands/src/skills.ts` `EXPECTED_VENDOR_SKILL_COUNT = 19` 与目录实测一致；`ast-grep`/`lsp-setup` 两件在册 | ⬜ |
| PRE-5 | Phase 3 deferred 三行与 H-24 现状可定位 | `phase3-hooks.md` 的 S-14/S-15/S-16 行与 H-24 行（:52/:78-80）；omo-hooks manifest 的 webfetch-redirect-guard 条目在位 | ⬜ |

---

## WP-0 调研钉测（计划书 §4.1/§6，Q-1…Q-8）

### [ ] P6-T1 — 四面全对账 + 原生钉测 + 三 fork 裁定 ⚖️

- **产出**：回填后的 [覆盖基线](./phase6-mcp-editing.md)（§1–§7 全部转实测）；**三 fork 裁定书**（E/L/G 各自选项 + 依据，进 `.omo/evidence/p6t1/FORKS.md`）；计划书 §4 按实测更正（DoD-d）；fork 触发决策登记时起草本阶段 D 条目与 ROADMAP Phase 6 措辞修订（随首个落地 commit 同发，T3/T4 先例 = Phase 5 D18）。
- **做法**（逐 Q 独立交付，哪个先闭环先写证据；Q-2/Q-4 为阻断项）：
  1. **Q-1 上游对账**（全程 `git show/ls-tree` 只读）：`hashline-core` API 面 + `hashline-read-enhancer/`、`hashline-edit-diff-enhancer/` 逐文件语义 + `atlas/write-edit-tool-policy.ts` + `config/schema/experimental.ts` 配置门；`lsp-core` 工具全名单（`tools/`）+ `post-edit/` + daemon 生命周期（`lsp-daemon` 14 件）；`ast-grep-sg-provision/` 逐行 + `install-ast-grep-sg.ts` 平台矩阵；OMO web 三 provider（exa/context7/grep_app）语义。
  2. **Q-2 原生面钉测**：web 三层（`--dump-config` 含 web 三行 / 真实组合 boot 工具面含 `web_search`/`web_fetch` / mock 场景调用可达）；`str_replace_editor` 与 `dsh-tool-fs` edit 语义全枚举（唯一性约束/错误文案/重试可判性/read-before-edit 接缝——`.d.ts` 逐字 + 行为探针）；**`dsh-mcp-client` 契约钉测**：一个 fixture stdio MCP server（最小自制）端到端挂载 → `mcp__*` 工具在场、调用往返、server 崩溃/慢启动失败形态、空 scope 零工具。
  3. **Q-3 编辑 A/B 设计**：失败模式清单终态（计划书 §4.3 四类 + 钉测新增类）；双臂任务族脚本草案；度量（失败可判性/重试轮数/静默错写率）的操作性核验（每个度量都有机读取数点）。
  4. **Q-4 LSP fork 证据**：(L-A) `lsp-core` vendor 闭包（依赖树/外部 npm 依赖/harness 耦合点逐件——playbook §7 的依赖树评估）；(L-B) 三包闭包 + Q-2 的 mcp-client 钉测结果对 `lsp-tools-mcp` 的适用性（`mcp-protocol-pin.test.ts` 的协议 pin 与 mcp-client 的 2026-07-28 优先策略对账）；daemon 必要性裁定（单进程沙箱内 in-process client 可行性）；fixture 语言服务器选型（本机可得性优先，typescript-language-server 候选）。
  5. **Q-5 ast-grep fork 证据**：(G-A) S-16 移植形态（`sg` 二进制来源/平台矩阵减 Windows（D9）/技能自带 `install.sh` 与 provision 钩子的双来源裁定）；(G-B) v5 `ast-grep-mcp` 的 tag 选定（ROADMAP §2 规则 3：v5.0.0 stable 若已发布则取之——**先重跑 tag 判定**，playbook 步骤 1）+ 包闭包 + mcp-client 挂载可行性。
  6. **Q-6 名册席位整合面**：librarian/explore 席的 web/ast-grep 工具可达性现状（toolFilter 差集）；team 成员席的编辑面消费形态；差集成文。
  7. **Q-7 e2e 断言面与 hermetic fixture 族**：四腿场景的 mock-LLM 可断言形态；外部进程类（语言服务器/`sg`）的 CI fixture 设计（预置二进制/替身 server）；缺席响亮的负断言锚点。
  8. **Q-8 source kind 与署名清单**：本阶段全部注入点的 kind 命名表（v4 准入只拒 `kind:'plugin'` 已证——P5 Q-8）；vendor 候选清单与 licenses 计数预测（基线 checked=61）。
- **判定**：✅ Q-1…Q-8 各有逐字引用结论；三 fork 裁定书含双向证据；覆盖基线全条目终态；计划书修订记录成文。
- **证据**：⬜
- **依赖**：PRE-1…PRE-5。**量级**：1.5 天。

---

## WP-1 编辑模型（计划书 §4.3）

### [ ] P6-T2 — A/B 证据台架 + 脚本化编辑任务族

- **产出**：A/B 台架（双臂驱动：同一任务族分别走原生 `str_replace_editor`/`edit` 面与 hashline 增强面的**实验性接线**——台架件可一次性，但断言纪律与门 3 同级）；失败模式清单的逐类数据档（`.omo/evidence/p6t2/`）。
- **做法**：mock-LLM 驱动固定任务脚本；每臂每失败模式类至少一例；度量三件套（失败可判性/重试轮数/静默错写率——静默错写的断言面 = 文件最终字节比对）；双臂变异自证（故意位移/篡改夹具 → 对应断言红）。
- **判定**：✅ 台架双臂跑绿且变异自证红证俱全；数据档含每类失败模式的原始记录；「无差异」若成立则以数据成文（合法结局）。
- **证据**：⬜
- **依赖**：P6-T1（Q-3 终态）。**量级**：1 天。

### [ ] P6-T3 — 编辑模型决策落地 ⚖️

- **产出**（双臂二选一，以 T1/T2 证据裁定）：
  - **(E-A)**：覆盖基线记差异条目（hashline-core 维持 vendored-unconsumed 的**理由** = A/B 数据）；S-14/S-15 以「原生覆盖」闭环（理由引用 A/B 数据，不许空手闭环）；决策登记候选草稿。
  - **(E-B)**：omo-hooks 两个 enhancer 条目移植（消费 vendored hashline-core；H 编号接续；`EXPECTED_HOOK_COUNT` 与同步网同 commit）+ 单测 + e2e 编辑场景（锚点防住的失败模式类逐类断言）+ S-14/S-15 闭环为「已移植」。
- **判定**：✅ 裁定书进 `FORKS.md`（双臂证据齐全）；落地形态门 2/3 绿；(E-B) 时 enhancer 的反向金丝雀（未生效 vs 生效可区分）在位。
- **证据**：⬜
- **依赖**：P6-T2。**量级**：(E-A) 2 小时 / (E-B) 1 天。

---

## WP-2 LSP（计划书 §4.4）

### [ ] P6-T4 — LSP fork 落地 ⚖️

- **产出**（三向一，以 T1 Q-4 证据裁定）：
  - **(L-A)**：vendor `lsp-core`（playbook 全套：manifest/NOTICE/deviations/扩展名补全机械证明——T8a/T8b 纪律）+ `patches/omo-dsh/omo-lsp/` 新包（薄工具面：lsp-core 工具族的模型面对账 + 语言服务器生命周期 + `post-edit` 接线）+ **第五插行 + COUNT COUPLING NET 4→5 同 commit 全点位**。
  - **(L-B)**：vendor 闭包（lsp-tools-mcp + lsp-core + lsp-daemon，playbook 全套）+ 根 `cordis.yml` mcp-client 配置行 + `mcp__*` 工具面核验；`post-edit` 不可达记差异。
  - **(L-C)**：记差异文档（硬理由成文——LSP 在 ROADMAP 目标句具名，defer 是重裁定，理由须扛住评审）；**T5 随之取消（删除线 + 理由，不算未完成）**。
- **判定**：✅ 裁定书进 `FORKS.md`；落地形态门 1/2/4/5/6 绿；vendor 漂移检测绿；licenses 计数变化有对应；(L-A) 时第五插行同步网零漏点。
- **证据**：⬜
- **依赖**：P6-T1（Q-4 终态）。**量级**：(L-A) 1.5 天 / (L-B) 1 天 / (L-C) 2 小时。

### [ ] P6-T5 — LSP e2e 场景 + doctor-lite 检查

- **产出**：e2e `lsp-*` 场景（canonical 名 T1 定名）：fixture 项目 + 真实语言服务器（Q-4 选型）→ agent 完成一次定义/诊断查询，断言结果内容真实来自服务器（非编造——反向金丝雀：服务器缺席时具名响亮，静默空结果 = 红）；doctor-lite 的 LSP 面检查（(L-A) = omo-lsp 行 + 服务器探测；(L-B) = mcp 配置行校验）。
- **做法**：hermetic fixture 纪律（Q-7 设计）：CI 用预置/替身，真实安装路径归 L2；probe 的 LSP 探测 marker（在场形态/缺席具名双向）。
- **判定**：✅ 门 3/4/8 绿；反向金丝雀变异自证（掐服务器 → 具名断言红）。
- **证据**：⬜
- **依赖**：P6-T4（(L-C) 时本条取消成文）。**量级**：0.5–1 天。

---

## WP-3 ast-grep（计划书 §4.5）

### [ ] P6-T6 — ast-grep fork 落地 ⚖️

- **产出**（两向一，以 T1 Q-5 证据裁定）：
  - **(G-A)**：S-16 `ast-grep-sg-provision` 移植 = omo-hooks 新条目（模块内演进，`EXPECTED_HOOK_COUNT` 同步网）：`sg` 二进制保障（平台矩阵减 Windows，D9）+ 保障失败响亮（具名 marker + 结构化指引）+ 已 vendor `ast-grep` 技能前提核验（技能教的调用路径与 provision 保障的产物一致——空头指令纪律：技能在场而二进制无保障 = 红）。
  - **(G-B)**：selective lift `ast-grep-mcp`（v5 tag，playbook 全套 + 决策登记双语）+ mcp-client 配置行 + 技能消费侧注记（技能教 `sg` CLI，MCP 形态的工具面差异注记——T12 N1 先例）。
- **判定**：✅ 裁定书进 `FORKS.md`；落地形态门 2/4/5/6 绿；(G-B) 时 lift 清单逐项署名。
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

- **产出**：门 6 静态门 c 组延续（新条目署名头覆盖 / manifest↔文件集合 / vendor 条目存在性 / **c14 基线文档并集** = `COVERAGE_BASELINE_MDS` 增 `phase6-mcp-editing.md`）；门 8 probe 四腿探测面（在场性具名 marker；缺席响亮）；门 4 doctor-lite 的 `sg`/LSP 检查（随 T5/T6 落地件）；**(L-A) 触发时**：第五插行同步网 4→5 全点位同 commit（doctor-lite `EXPECTED_INSERT_ROW_IDS`、cordis-inserts.test、cold-start、drive.mjs、probe、smoke-real、cordis.yml 头注）。
- **判定**：✅ 全 8 门绿；静态门新断言各自变异自证；同步网零漏点（grep 全点位复核）。
- **证据**：⬜
- **依赖**：P6-T3/T5/T6/T8 的落地件（可分批，同 commit 原则不变）。**量级**：0.5 天。

---

## WP-6 收口（计划书 §5/§9）

### [ ] P6-T10 — 合规复核 + 文档双语 + 覆盖基线终态

- **产出**：`THIRD_PARTY_NOTICES.md` Phase 6 小节（语义移植表先例格式 + vendor 表）；licenses 计数终态核对（基线 61 → 实测，每变化有对应）；决策登记（fork 三裁定的 D 条目候选，双语）；ROADMAP Phase 6 措辞修订（「走 dsh-lsp」F-1 更正 + 「活方向」F-2 更正，双语）；可行性报告「实施期订正」节（`dsh-lsp*`/`dsh-web-search-exa` 映射行更正，双语）；README Phase 6 状态行（双语）；CHANGELOG；覆盖基线全条目终态（含 S-14/15/16 闭环、MCP 七件处置、席位差集）。
- **判定**：✅ 门 5/6/7 绿；文档间无矛盾（check-docs-consistency）；fork 被否臂全部成文。
- **证据**：⬜
- **依赖**：P6-T3…T9 全部落地件。**量级**：0.5 天。

### [ ] P6-T11 — 退出标准核对 + L2 真机 + 结项

- **产出**：退出标准核对表（计划书 §5 的 a/b/c + DoD c/d/e 逐条 ✅/证据指针）；**L2 真机证据**（`.omo/evidence/p6-l2-*`）：真实模型真实任务——编辑对比（A/B 裁定的真实模型复核腿）+ LSP 查询 + `sg` 结构搜索 + 真实 web 搜索（真实 API key，redaction 纪律——T16 BLOCKER 教训：launch token/密钥先杀进程再涂改再全树 grep）；终态 `scripts/ci-local.sh` 全 8 门复跑归档；结项 commit。
- **判定**：✅ 核对表全 ✅；L2 证据档成文（每项被选定能力各有一次真实使用记录）；ci-local 8/8 绿归档。
- **证据**：⬜
- **依赖**：P6-T10。**量级**：0.5 天。
