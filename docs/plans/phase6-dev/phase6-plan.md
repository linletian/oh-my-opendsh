# Phase 6 开发计划：MCP 与编辑

> **本目录**：[`docs/plans/phase6-dev/`](./) —— ROADMAP **Phase 6**（MCPs & editing）的实施计划。
>
> **上游依据**：[ROADMAP（中文）](../../roadmap_zh-CN.md) §4 Phase 6 · [决策 D14](../../decisions_zh-CN.md)（基线冻结）· [决策 D17](../../decisions_zh-CN.md)（0.2.x 单运行时）· [决策 D9](../../decisions_zh-CN.md)（Windows 排除）· [可行性报告 §2.3／§2.6／§16.2](../../feasibility-report_zh-CN.md) · [Phase 1 vendoring playbook](../phase1-dev/vendoring-playbook.md) · [Phase 3 覆盖基线](../phase3-dev/phase3-hooks.md)（S-14/S-15/S-16 deferred 登记处）· [dsh 0.2.0-rc.2 复核报告](../../dsh-0.2.0-rc.2-review_zh-CN.md)（运行时面权威——**注意：该报告全文无 LSP/MCP/web 面**（全文 grep 零命中），本阶段原生面事实由 T1 钉测自建）
>
> **配套文档**：[任务清单](./phase6-tasks.md) · [MCP/编辑面清单与覆盖基线](./phase6-mcp-editing.md)（计划期草案，T1 转实测）
>
> **状态**：🚧 立项（2026-10-12，基线 = Phase 5 结项后的 `feature/phase6-dev`，分支基点 `1bc9fbd`）。逐任务证据与退出标准核对见[任务清单](./phase6-tasks.md)。
>
> **修订记录**：
>
> - **2026-10-12 立项稿**——计划期实测（本机实装 `dsh@0.2.0-rc.2` 树 + 上游 `v4.19.4` tag 只读核查，下文以 `$DSH` = `/home/linletian/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` 为引用基址）确立五条头条事实（§1.1），其中两条推翻 ROADMAP 行文前提：**钉住运行时不存在任何 `dsh-lsp*` 包**（「LSP（走 dsh-lsp）」无对象）与**冻结基线 v4.19.4 内 ast-grep 无 MCP 包**（`ast-grep-mcp` 是 v5 时代的重建）。本阶段不是绿色田野——设计主轴是三个证据驱动的 fork 裁定（§4.1），不是照单建设。

---

## 1. 目标

**LSP、ast-grep、web 搜索/抓取、编辑模型——OMO 能力面的最后一组大件——在 DSH 上逐一定裁：每项能力经「DSH 原生优先」检查后，要么采用原生面并给出脚本化在场证明，要么按冻结基线/vendor 纪律落地 OMO 语义，要么成文记差异；编辑模型在 hashline（Phase 1 已 vendor）与 DSH `str-replace-editor` 之间以 A/B 证据笔记裁定。**

ROADMAP §4 Phase 6 原文：

- **目标**：LSP（走 `dsh-lsp`）、ast-grep（上游的活方向）、web 搜索/抓取（DSH 内建），以及编辑模型决策：hashline（`hashline-core`，Phase 1 已 vendor）vs DSH `str-replace-editor`——按原则一以 A/B 证据记录裁定。
- **明确排除**：codegraph（上游已删，§16.2）。
- **退出标准**：每项被选定能力在脚本化场景中被 agent  demonstrably 使用。

本阶段的成功标志不是"装了几个工具"，而是：**四条腿（编辑/LSP/ast-grep/web）各有经得起反向金丝雀检验的定裁**——「被选定」= 脚本化场景中 agent 真实调用且断言能区分「真用了」与「静默缺席」；「未被选定」= 成文的记差异/deferred 理由，不是无声缺席。**ROADMAP 的「走 dsh-lsp」与「ast-grep 的活方向」两句行文前提在计划期已被实测部分推翻（§1.1），最终以 T1 fork 裁定为准。**

### 1.1 计划期头条发现（全部实测，证据逐条在册）

| # | 发现 | 证据（计划期实测） |
|---|---|---|
| **F-1** | **钉住运行时没有任何 LSP 包**：`$DSH`（`@deepseek-ai` 作用域，288 包）按名 grep `lsp` **零命中**；全树 `find -iname "*lsp*"` 无路径。可行性报告 §1.1 的映射行「`dsh-lsp` + `dsh-lsp-stdio` + `dsh-tool-lsp`」写的是 DSH **源码 monorepo** 的 200+ 包全名录，这些包**未随 0.2.0-rc.2 发行物安装**。ROADMAP「LSP（走 `dsh-lsp`）」的前提面在钉住运行时缺席 | `ls $DSH \| grep -ci lsp` = 0；`find $D -iname "*lsp*"` 空 |
| **F-2** | **冻结基线 v4.19.4 内 ast-grep 无 MCP 包**：`packages/` 下无 `ast-grep-mcp`；v4.19.4 的 ast-grep 面 = ① 安装器 `omo-opencode/src/cli/install-ast-grep-sg.ts`（+ omo-codex 同族）② provision 钩子 `omo-opencode/src/hooks/ast-grep-sg-provision/`（Phase 3 已登记 deferred = **S-16**）③ 技能 `shared-skills/skills/ast-grep/`（**已随 Phase 4 vendor 在本仓**）。`@oh-my-opencode/ast-grep-mcp` 是 2026-08-03（**晚于 v4.19.4 冻线 2026-08-01**）的 v5 时代重建（可行性报告 §16.2）——ROADMAP 说的「上游的活方向」若指 MCP 形态，属 ROADMAP §2 规则 4 的**定向搬运**，不是冻结基线内容 | `git ls-tree v4.19.4 packages/ \| grep ast` 空；`git ls-tree -r v4.19.4 \| grep ast-grep` = 安装器+钩子+技能三类命中 |
| **F-3** | **web 搜索/抓取已是组合内原生实况**：`dsh-base/cordis.patch.yml:478-487` 挂载 `web-search-deepseek` + `web-fetch-http` + `tool-web` 三行；`dsh-tool-web` 向模型提供 `web_search`/`web_fetch`（README 逐字：provider 缺席时工具保持可见并返回**结构化错误**）；本仓根 `cordis.yml` 与 concerto 组合对 web 面**零改动零覆盖**。即 web 腿的本阶段工作 = **验证在场 + 脚本化证明 + 名册席位整合**，不是移植建设 | dsh-base patch 文件行号；`dsh-tool-web/README.md` Summary 段；本仓 grep 零命中 |
| **F-4** | **ast-grep 与 lsp-setup 技能已在服务面**：omo-commands 的 vendor 技能目录（19 件，`EXPECTED_VENDOR_SKILL_COUNT = 19`）含 `ast-grep`（frontmatter 逐字教 `sg` CLI 的结构搜索/改写用法，自带 `scripts/ast_grep_helper.py` 与 `install.sh`）与 `lsp-setup`，经 SKILL_GESTURE 机制由 `ctx.skills` 服务。**技能文本层已交付**；缺的是 `sg` 二进制的 provisioning（S-16 对应的钩子未移植）与 LSP 工具面本身 | `omo-commands/src/skills.ts:96`；`vendor/shared-skills/skills/{ast-grep,lsp-setup}/` |
| **F-5** | **编辑面两端都在仓内**：`hashline-core` 已 vendor（`patches/omo-dsh/vendor/hashline-core/`，playbook 全套，**vendored 未消费**——Phase 1 纪律）；OMO v4.19.4 的 hashline 集成 = 两个 enhancer 钩子（`hashline-read-enhancer/`、`hashline-edit-diff-enhancer/`——Phase 3 登记 deferred = **S-14/S-15**）+ atlas `write-edit-tool-policy.ts` + `config/schema/experimental.ts` 配置门。DSH 原生编辑面 = `dsh-tool-str-replace-editor`（view/create/str_replace/insert 四命令 + read-before-edit 策略 + sandbox 围栏）+ `dsh-tool-fs` 的 read/write/edit 套件（S-46 已实证原生覆写守卫 + `FS_STALE_VERSION` CAS 是 OMO write-guard 的**严格超集**） | `git grep -l hashline v4.19.4 -- packages/omo-opencode/src`；phase3-hooks.md:78-80（S-14/15/16）、:110（S-46）；`dsh-tool-str-replace-editor/README.md` |

## 2. 不可协商约束

本阶段受 ROADMAP §2/§3 同等约束，另加本阶段特有的六条，全部同等效力：

| 约束 | 来源 | 本阶段的具体含义 |
|---|---|---|
| **冻结基线 = OMO v4.19.4** | ROADMAP §2 规则 1 / D14 | 语义内容的唯一来源 = v4.19.4 tag（commit `b072d279…`，只读 `git show/ls-tree`）。**ast-grep 的 MCP 形态不在冻结基线内**（F-2）——若 T1 裁 (G-B) 定向搬运，必须按 ROADMAP §2 规则 4 的 selective lift 纪律：逐文件、带署名、记决策，**只搬目标包不追 v5 线** |
| **DSH 原生优先（本阶段头号纪律）** | README 原则一 / ROADMAP Phase 6 | 编辑模型决策的 A/B 证据笔记是本约束的**执行形态**（ROADMAP 原文要求）；web 面已原生在场（F-3），禁止重造；LSP/ast-grep 的原生面缺席（F-1/F-2 已实证）不是「原生优先」的例外，而是把采用对象换成「vendor harness-neutral 核心（ROADMAP §3 约束 5：lsp-core 在 19 包名单内）或经 `dsh-mcp-client` 桥接」的裁定输入 |
| **SUL-1.0 合规与署名** | ROADMAP §3 约束 1 / D10 / D15 / D16 | 两类产物两种形态（Phase 2–5 先例）：语义移植 = 署名头 + NOTICES 逐文件；内容/代码 vendor = playbook 全套（per-file NOTICES、`VENDOR-MANIFEST.json` sha256、包级 `NOTICE.md`、`license` 字段、deviations[]）。**T8b 先例适用于本阶段一切 vendor**：宿主 = 裸 Node 24 原生 type-stripping，vendored 树内无扩展名 specifier 须补全 + 机械证明（零语义变更），strip-only 不支持参数属性须改写登记 |
| **门只加严不放松** | Phase 1–5 惯例 | 8 门链全绿维持；扩展既有门（门 2/3/4/6/8），**不加新门、不绕过旧门**；若 LSP fork 落 (L-A) 触发第五插行，COUNT COUPLING NET 4→5 同 commit 全点位同步（cordis.yml 头注、doctor-lite `EXPECTED_INSERT_ROW_IDS`、cordis-inserts.test、cold-start、drive.mjs、probe、smoke-real） |
| **静默失效类必配金丝雀** | Phase 4.5/5 惯例 | 本阶段的失效模式几乎全是静默的：`sg` 二进制缺席（技能照教、调用照败）、LSP 服务器未起（工具返回「无服务器」软文案）、web provider 无 key（工具在场但只回结构化错误）、hashline enhancer 未生效（编辑照样进行只是无锚点）。每个验收断言必须能区分「能力真被用了」与「静默降级」；缺席/降级路径必须**响亮**（具名错误/marker/负断言） |
| **外部内容信任边界** | dsh-tool-web 原生语义 / 安全惯例 | web_search/web_fetch 结果是 provider 控制的**外部不可信文本**（原生已标注），本阶段任何消费 web 结果的指引/技能段不得削弱该标注；H-24 webfetch-redirect-guard（Phase 3 已移植）的 SSRF 护栏语义不许因本阶段任何改动回退 |
| **双语同步 / 非商业 / 不提 PR** | docs 惯例 / D8 / D5 | 交付文档（README/CHANGELOG/decisions/ROADMAP 回馈）en + zh 同 commit；本目录为纯中文工作文档 |

## 3. 现状盘点（Phase 5 结项基线）

| 构件 | 现状 | 本阶段的影响面 |
|---|---|---|
| **编辑面（DSH 原生）** | `dsh-tool-str-replace-editor`（view/create/str_replace/insert；read-before-edit + sandbox 围栏）与 `dsh-tool-fs`（read/write/edit）均在 dsh-base 依赖内；S-46 已实证原生覆写守卫 + CAS 是 OMO write-guard 超集 | A/B 证据笔记的原生臂基料；hashline 若移植，enhancer 钩子的消费对象 = 这两个工具面的事件 |
| **hashline-core（已 vendor）** | `patches/omo-dsh/vendor/hashline-core/` 完整（playbook 全套、78 测试绿），**零消费点**（仓内唯一 `hashline` 命中 = bash-file-read-guard 注释串） | fork E 的 (E-B) 臂 = 两个 enhancer 钩子移植 + 消费 vendored core；(E-A) 臂 = 维持 vendored-unconsumed + 记差异 |
| **LSP（DSH 原生）** | **缺席**（F-1）。无任何 `dsh-lsp*` 包、`ctx` 无 LSP 服务面 | fork L 的三向裁定（§4.4）——无原生可 adopt，「DSH 原生优先」在此 = 优先 harness-neutral vendor / mcp-client 桥接 |
| **LSP（OMO 上游）** | 三包分层：`lsp-core`（harness-neutral：`tools/` 工具族 + `post-edit/` + `mcp.ts` + `request-context.ts` + `missing-dependency-result.ts`，含 `mcp-protocol-pin.test.ts`）、`lsp-daemon`（14 件：daemon-server/client、socket-jsonrpc、lock/ownership、version-reap）、`lsp-tools-mcp`（7 件 MCP server CLI 适配） | vendor 闭包与桥接契约的钉测对象（T1 Q-4）；lsp-core 在 ROADMAP §3 约束 5 的 19 包名单内 = 首选语义源 |
| **ast-grep（OMO 上游）** | v4.19.4 = 安装器 + provision 钩子（S-16）+ 技能；**无 MCP 包**（F-2）。v5 时代有 `@oh-my-opencode/ast-grep-mcp`（2026-08-03 重建） | fork G 的两向裁定（§4.5） |
| **ast-grep/lsp-setup 技能（已 vendor）** | 19 技能目录在服务（F-4），`ctx.skills` 经 SKILL_GESTURE 可达 | 技能文本与工具面的一致性核验（技能教 `sg`，工具面须提供或可 provisioning `sg`；缺 provisioning 时技能是空头指令——与 T12 N1 同族的「空头指令不许原样进模型可见面」纪律） |
| **web 面（DSH 原生）** | `web_search`/`web_fetch` 在 dsh-base 挂载（F-3）；provider = deepseek 搜索后端 + http 抓取后端；provider 缺席时结构化错误（工具保持可见） | web 腿 = 验证/证明/席位整合；结构化错误形态是 e2e 的诚实性断言面（无 key 环境不许断言「搜索成功」） |
| **web 面（OMO 残余）** | H-24 webfetch-redirect-guard 已移植（Phase 3）；OMO 的 web 类 MCP = exa / context7 / grep_app 三 provider；`dsh-web-search-exa` 在可行性报告名单但**实装缺席** | 三 provider 处置 = 记差异（DSH 内建覆盖搜索/抓取需求）；exa 缺席成文；librarian 席位的 web 工具可达性（名册整合） |
| **MCP 桥接面（DSH 原生）** | `dsh-mcp-client` 在场：外部 MCP server 工具注册为 `mcp__<server>__<tool>`；stdio / streamable-http 双传输；协议 2026-07-28 优先 + legacy 回退；stdio 先起临时探测进程；空 caller scope 不加工具；server instructions 进系统提示词 | fork L (L-B) 与 fork G (G-B) 的共同承载面；配置行形状与失败语义钉测（T1 Q-2） |
| **OMO MCP 七件** | LSP（lsp-tools-mcp）/ ast-grep（v4.19.4 无包）/ **codegraph（已删，排除）** / grep_app / context7 / exa / **git-bash-mcp（Windows，D9 排除）** | 处置总表进覆盖基线 §5——七件逐件「移植/桥接/记差异/排除」成文 |
| **名册与席位** | 11 席 + 10 委派行（per-seat 路由/拒绝面全在册，doctor-lite 26 行校验）；explore 席 deny write/edit；librarian 席 read-only | 席位工具面整合（T1 Q-6）：上游 explore 配 ast-grep、librarian 配 web 搜索/context7——DSH 侧席位 toolFilter 的差集裁定 |
| **team 面（Phase 5 产物）** | omo-team 第四插行、12 工具、双账持久化、team 成员 = continuable 子女 | team 成员（hephaestus/sisyphus-junior 席）的编辑能力面 = 本阶段编辑决策的直接消费者；LSP/ast-grep 工具是否在成员面在场 = 覆盖基线行 |
| **门链与同步网** | 8 门全绿（基线：门 2 = **90 文件/2056 测试**；门 3 = **41/41 场景**；门 5 = **checked=61**；门 6 = **37/37**；门 8 = **8/8 proofs**）；根 `cordis.yml` 4 insert 行 + COUNT COUPLING NET | 本阶段增量全部走既有门扩展；第五插行仅在 fork L=(L-A) 时触发（4→5 同步网） |
| **e2e/观测基础设施** | drive.mjs v4 夹具（41 场景族）+ probe 插件先例（team_probe_* 真面断言）+ sandbox-vanished SKIP 纪律 + mock-llm-server 占位符族 | 四腿场景直接复用；LSP/sg 的「外部进程」性质需要新的夹具族（hermetic fixture，T1 Q-7 设计） |

## 4. 方案设计

### 4.1 总体策略与三个 fork（全部 T1 证据裁定，不得默认滑入）

本阶段没有单一中心 fork，而是**三个独立 fork**，各自在 T1 钉测后以证据裁定（Phase 5 FORK.md 先例）：

| fork | 问题 | 选项 | 计划期倾向（非裁定） |
|---|---|---|---|
| **E（编辑模型）** | hashline 语义移植还是原生记差异？ | **(E-A)** DSH 原生编辑面记差异（hashline-core 维持 vendored-unconsumed）／**(E-B)** 移植两个 enhancer 钩子（S-14/S-15）消费 vendored hashline-core | **真开放**——ROADMAP 明文要求 A/B 证据笔记裁定（原则一）；A/B 台架（§4.3）是两种结局共同的交付物 |
| **L（LSP）** | 原生缺席（F-1）下 LSP 怎么落？ | **(L-A)** vendor `lsp-core` + 新包 `omo-lsp` 薄工具面（第五插行）／**(L-B)** `lsp-tools-mcp` 经 `dsh-mcp-client` 桥接（vendor 闭包 = lsp-tools-mcp + lsp-core + lsp-daemon）／**(L-C)** 记差异 deferred（须成文硬理由——LSP 在 ROADMAP 目标句具名，defer 是重裁定） | (L-A) 优先评估（ROADMAP §3 约束 5：lsp-core 是 harness-neutral 核心层；MCP 适配层（lsp-tools-mcp）恰是约束 5 说的「不取自适配层」对象——但 (L-B) 省自写工具面，钉测定夺） |
| **G（ast-grep）** | 冻结基线形态还是活方向形态？ | **(G-A)** v4.19.4 形态：S-16 provision 钩子移植（`sg` 二进制保障）+ 已 vendor 技能接线核验／**(G-B)** selective lift `@oh-my-opencode/ast-grep-mcp`（v5 tag）+ mcp-client 桥接 | (G-A) 优先（D14：语义取自冻结基线；技能已在场教 `sg` CLI 用法，(G-A) 与在场技能同构；(G-B) 的「活方向」论据 ROADMAP 行文在册，T1 证据裁定） |

**三 fork 的公共纪律**：裁定书进 `.omo/evidence/p6t1/FORKS.md`；每个 fork 的被否选项连同证据成文（覆盖基线）；「记差异」是合法结局但必须有硬理由，不许作为偷懒默认值。

### 4.2 插件拓扑（默认不新建包）

- **默认形态**：本阶段无新插件包。钩子形条目（S-14/S-15/S-16 若移植）进 omo-hooks manifest（H-33 模块内演进先例，`EXPECTED_HOOK_COUNT` 与同步网随条目数变化）；vendor 件进 `patches/omo-dsh/vendor/`；MCP server 配置行进根 `cordis.yml`（非 insert 插件行，mcp-client 的消费面）。
- **条件形态（fork L=(L-A) 才触发）**：新包 `patches/omo-dsh/omo-lsp/`（host-only）+ 根 `cordis.yml` 第五 insert 行 + COUNT COUPLING NET **4→5** 同 commit 全点位（doctor-lite、cordis-inserts.test、cold-start、drive.mjs、probe、smoke-real、头注）+ `verify-licenses` 计数对应。职责单一口径：LSP 工具面与语言服务器生命周期——不吸收编辑语义（omo-hooks enhancer）、不吸收 provisioning（S-16 归 omo-hooks）。
- **manifest 纪律**：若新包成立，`src/manifest.ts` 单一事实源（omo-team 先例：id / 上游源路径 / 原生面对应 / 处置 / e2e 场景名 / 状态）；翻动规则沿用 T5 refined 版（`pending→ported` = 行自身语义落地 + 其 e2e 覆盖转绿，同 commit）。

### 4.3 编辑模型决策：A/B 证据台架（fork E 的执行面）

ROADMAP 原文要求「按原则一以 A/B 证据记录裁定」。台架设计（T2 落地，T3 裁定）：

- **失败模式清单**（A/B 的判别对象，T1 Q-3 钉测补全）：① stale 锚点（读取后文件被外部改动，编辑基于过期内容）；② 歧义匹配（`str_replace` 的 old_string 不唯一）；③ 位移行（行号引用在插入/删除后漂移）；④ 大文件部分读取后的上下文错位。
- **双臂同任务族**：同一组脚本化编辑任务（mock-LLM 驱动，任务脚本固定）分别走 (A) 原生 `str_replace_editor`/`edit` 面与 (B) hashline 增强面（LINE#ID 锚点 + diff 增强）；度量 = 每任务的**失败可判性**（错误是否具名可重试）、**重试轮数**、**静默错写率**（编辑成功但落点错误——反向金丝雀：断言文件最终字节）。
- **裁定规则（原则一的操作化）**：原生面在失败模式清单上全部有可判错误且静默错写率 = 0 → (E-A)（原生覆盖，hashline 记差异，S-14/S-15 以「原生覆盖/无守卫对象」闭环）；hashline 锚点实证防住至少一类原生面**静默**失效 → (E-B)（移植 enhancer 双钩）。
- **诚实性纪律**：A/B 台架的断言必须双臂各配变异自证（故意位移/篡改夹具 → 对应断言红）；「hashline 更好」不许凭印象落笔——无差异也是合法结论（那正是 (E-A) 的证据）。

### 4.4 LSP 语义映射（fork L 裁定后回填细节）

| OMO 语义（v4.19.4） | (L-A) vendor 形态 | (L-B) 桥接形态 |
|---|---|---|
| `lsp-core` 工具族（`tools/`：定义/引用/悬停/诊断等——全名单 T1 Q-1 枚举） | vendor `lsp-core`（playbook 全套）+ omo-lsp 薄工具面（模型面工具逐一对账） | 不直接消费（经 MCP） |
| `post-edit/` 编辑后诊断 | 随 vendor 件接线（tools/post-execute 事件消费） | 不可达（MCP 边界外）——记差异 |
| `lsp-daemon` 生命周期（socket-jsonrpc、lock/ownership、version-reap） | vendor 或简化（T1 Q-4：daemon 必要性裁定——单进程沙箱内可直接 in-process client？） | 随 lsp-tools-mcp 进程生命周期（mcp-client stdio 管理） |
| 语言服务器发现/安装（`missing-dependency-result`） | 语义移植：缺席时具名结构化错误（响亮降级） | 同左（MCP 工具的 error 结果） |
| `lsp-setup` 技能（已 vendor） | 消费侧适配注记（技能文本的 opencode 载体句若存在——T12 N1 先例） | 同左 |

**公共断言面**（两形态都要）：脚本化场景中 agent 对一座真实语言服务器（fixture 项目 + 本机可得的 language server，如 typescript-language-server——T1 Q-7 选型）完成一次定义/诊断查询；**反向金丝雀** = 语言服务器缺席时必须具名响亮，不许静默空结果。

### 4.5 ast-grep 语义映射（fork G 裁定后回填细节）

- **(G-A) 形态**：S-16 `ast-grep-sg-provision` 移植 = omo-hooks 新条目（模块内演进）：会话/项目首次需要时保障 `sg` 二进制在场（安装器语义 `install-ast-grep-sg.ts` 的平台矩阵——**Windows 段不移植（D9）**）；保障失败响亮（具名 marker + 结构化指引）；已 vendor `ast-grep` 技能的 helper 脚本（`scripts/ast_grep_helper.py`）与 provisioning 的衔接核验（技能自带的 `install.sh` 是技能内路径——双保险还是单一来源，T1 Q-5 裁定）。
- **(G-B) 形态**：selective lift（ROADMAP §2 规则 4）——从 v5 线选定 tag 逐文件 vendor `ast-grep-mcp`（署名 + deviations + NOTICES），经 `dsh-mcp-client` stdio 挂载（`mcp__ast_grep__*` 工具面）；决策登记（D 系列新条目候选）。
- **公共断言面**：agent 在脚本化场景中对 fixture 仓执行一次结构搜索/改写（技能指导 → `sg` 或 MCP 工具真实产出匹配结果）；反向金丝雀 = `sg`/server 缺席时的响亮性。

### 4.6 web 搜索/抓取验证面（无 fork——原生已在场，验证腿）

- **三层断言**（「已在场」的防误判纪律，R-5）：① **配置层**：`--dump-config` 含 web 三行（dsh-base 继承链）且本仓 overlay 无遮蔽；② **工具面层**：真实组合 boot 后模型工具面含 `web_search`/`web_fetch`（probe 真面断言，team_probe_* 先例）；③ **行为层**：脚本化场景中 agent 真实发起 `web_search`/`web_fetch` 调用。
- **诚实性断言**：无 key/无网络环境（CI）下工具返回**结构化错误**（dsh-tool-web 自述语义）——e2e 断言错误形状具名可判，**不许断言「搜索成功」**；真实搜索成功证据 = L2 真机腿（真实 API key，T11）。
- **名册整合**：上游 librarian 席位含 web 搜索/context7（可行性报告 §2.1）——DSH 侧席位 toolFilter 核验（librarian/explore 席的 web 工具可达性），差集成文进覆盖基线；**不改席位路由本身**（名册 = Phase 2 产物，工具面整合 ≠ 席位语义变更）。
- **OMO 残余处置**：exa / context7 / grep_app 三 provider = 记差异（DSH 内建搜索/抓取覆盖需求；`dsh-web-search-exa` 实装缺席成文——若将来需要 exa 后端，走 mcp-client 或 DSH 原生 provider 行，本阶段不建设）；H-24 护栏联动复核（web_fetch 的 SSRF 守卫不回退）。

### 4.7 MCP 桥接面与 OMO 七件处置

`dsh-mcp-client` 是本阶段唯一的 MCP 承载面（F-1 的另一半：DSH 有 mcp-client 但无自带 server 群）。契约钉测（T1 Q-2）：配置行形状（server 名 + transport + 命令/URL）、工具命名 `mcp__<server>__<tool>`、stdio 探测进程语义、server 崩溃/慢启动的失败形态、空 scope 零工具。

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
| S-16 | `ast-grep-sg-provision/` | fork G 裁定对象——(G-A) 移植 / (G-B) 以「MCP 形态替代」闭环 |

每条都要有成文裁定进覆盖基线 §6（Phase 5 接盘纪律：不许默认滑过）。

### 4.9 门与 e2e 扩展（不加新门）

| 层 | 扩展内容 |
|---|---|
| **门 2 单测** | A/B 台架双臂用例（变异自证）；fork 落地件的纯函数/结构式 mock（enhancer 钩子的事件改写、provision 的平台判定、MCP 配置行解析）；manifest 形状（若新包） |
| **门 3 e2e** | 四腿场景群（canonical 名 T1 定名，任务书占位：编辑 = `edit-model-ab-*` 族 + 落地场景的失败模式断言；LSP = `lsp-*`（真实 fixture 语言服务器）；ast-grep = `ast-grep-*`（fixture 仓结构搜索）；web = `web-search-fetch-*`（工具在场 + 结构化错误诚实性 + 调用真实发生））；全部复用 v4 夹具与 sandbox-vanished 纪律；外部进程类（语言服务器/`sg`）需要 hermetic fixture 族（T1 Q-7 设计） |
| **门 4 doctor-lite** | `sg` 二进制探测（(G-A) 形态）；LSP 面检查（fork L 形态对应：omo-lsp 行 / mcp server 配置行）；第五插行断言（若触发） |
| **门 6 静态门** | c 组延续编号：新条目署名头覆盖、manifest↔文件集合、vendor 条目存在性（lsp-core/ast-grep-mcp 若 vendor）、c14 基线文档并集扩展（phase6-mcp-editing.md 入 `COVERAGE_BASELINE_MDS`） |
| **门 8 proofs/probe** | probe 增四腿探测面（工具在场性具名 marker；缺席响亮）；冷启动日志断言（新包 marker 若触发） |
| **L2 真机** | 真实模型在真实任务中使用每项被选定能力（编辑对比 + LSP 查询 + sg 搜索 + 真实 web 搜索）；证据 `.omo/evidence/p6-l2-*` |

### 4.10 署名与合规

- 语义移植件（enhancer 钩子、provision、薄工具面）= 署名头（上游源文件 tag 相对路径）+ NOTICES Phase 6 小节。
- vendor 件（lsp-core 或 ast-grep-mcp 若裁定）= playbook 全套（Phase 1/T8a 先例，含 T8b 的扩展名补全 + 机械证明纪律）；`verify-licenses` 计数变化逐条对应（当前基线 checked=61）。
- selective lift（G-B 形态）= 决策登记（来源 tag、搬运清单、理由）+ 双语。

## 5. 退出标准与证据

ROADMAP 原文：「每项被选定能力在脚本化场景中被 agent demonstrably 使用」。本计划的操作化：

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
| **R-1** | **LSP vendor 闭包大于预期**：lsp-core 的依赖树（lsp 协议库/外部 npm 依赖）在钉测前未知；(L-B) 的闭包 = 三包更大 | 高（量级翻转） | T1 Q-4 为阻断项：闭包清单 + 外部依赖逐一登记后才许裁定；(L-C) 的硬理由门槛成文 |
| **R-2** | **mcp-client 契约不合**：stdio 探测/协议版本/server 失败形态与 OMO server 的期望不匹配 | 中 | T1 Q-2 钉测（真实挂载一个 fixture stdio server 端到端）；不合则对应 fork 臂死亡，证据成文 |
| **R-3** | **A/B 台架沦为形式**：双臂断言不可区分、或「差异」来自夹具噪声而非工具面 | 中（决策诚信） | 双臂变异自证纪律（§4.3）；「无差异 → (E-A)」是合法且诚实的结局 |
| **R-4** | **外部二进制/进程在 CI 的可达性**：`sg` 安装、语言服务器安装需要网络/平台特定产物，CI 不可假设 | 高（门红） | hermetic fixture 族（T1 Q-7）：CI 用 fixture 替身/预置二进制；真实安装路径只在 L2 真机腿验证；缺席响亮断言与「安装成功」断言分离 |
| **R-5** | **「web 已在场」误判**：base 挂载 ≠ 组合内启用 ≠ 席位可达 ≠ 真实可用（无 key） | 中 | §4.6 三层断言 + 诚实性断言成文 |
| **R-6** | **同步网漏点位**（第五插行若触发；c14 文档并集；licenses 计数） | 高（破门） | §4.2/§4.9 同步清单成文；首个触碰任务同 commit 落地全网；收口任务复验 |
| **R-7** | **v5 lift 范围蔓延**：(G-B) 触发时把 v5 的连带改动一起搬 | 中 | 定向搬运清单逐项登记（ROADMAP §2 规则 4），评审以清单为核对面 |

### 开放问题（T1 钉测清单——逐 Q 独立交付，阻断项标 ⚠️）

| # | 问题 | 关闭判据 |
|---|---|---|
| Q-1 | OMO v4.19.4 编辑/LSP/ast-grep/web 面全枚举 | hashline-core API 面 + 两个 enhancer 钩子逐文件语义 + atlas `write-edit-tool-policy` + experimental 配置门；lsp-core 工具全名单 + post-edit 语义 + daemon 生命周期；`ast-grep-sg-provision` 逐行 + 安装器平台矩阵；OMO web 三 provider 语义——覆盖基线 §1–§5 从草案转实测 |
| Q-2 ⚠️ | DSH 原生面实测 | web 三层（dump-config/工具面/行为层）实测；str-replace-editor 与 dsh-tool-fs edit 语义全枚举（唯一性约束/错误文案/重试可判性/read-before-edit 接缝）；`dsh-mcp-client` 契约钉测（fixture stdio server 端到端：`mcp__*` 工具在场、调用往返、server 崩溃形态） |
| Q-3 | 编辑 A/B 钉测设计 | 失败模式清单终态（§4.3 四类 + 钉测新增）；双臂任务族脚本；度量定义（失败可判性/重试轮数/静默错写率）可操作性核验 |
| Q-4 ⚠️ | LSP fork 证据 | (L-A) vendor 闭包（lsp-core 依赖树/外部依赖/harness 耦合点逐件）；(L-B) 闭包（三包）+ mcp-client 兼容性钉测；daemon 必要性裁定；语言服务器选型（fixture 用哪个 server）——三向证据齐备才许裁定 |
| Q-5 | ast-grep fork 证据 | (G-A) provision 的 DSH 形态（二进制来源/平台矩阵减 Windows/技能自带 install.sh 的双来源裁定）；(G-B) v5 `ast-grep-mcp` 的 tag 选定 + 包闭包 + mcp-client 挂载可行性 |
| Q-6 | 名册席位整合面 | librarian/explore 席的 web/ast-grep 工具可达性现状（toolFilter 差集）；team 成员席（hephaestus/sisyphus-junior）的编辑面消费形态；差集成文 |
| Q-7 | e2e 断言面与 hermetic fixture 族 | 四腿场景的 mock-LLM 可断言形态；外部进程类（语言服务器/sg）的 CI fixture 设计；缺席响亮的负断言锚点 |
| Q-8 | source kind 与署名清单 | 本阶段全部注入点（enhancer 钩子改写/provision 指引/技能注记）的 kind 命名表（v4 准入只拒 `kind:'plugin'` 已证——P5 Q-8）；vendor 候选清单与 licenses 计数预测 |

## 7. 工作包与估算

按 ROADMAP §7 的定性惯例（无 buffer、非承诺，R3），仅给工作量级：

| 工作包 | 内容 | 任务 | 量级 |
|---|---|---|---|
| **WP-0 调研钉测** | Q-1…Q-8 + 三 fork 裁定 + 覆盖基线转实测 | P6-T1 | ~1.5 天 |
| **WP-1 编辑模型** | A/B 台架 + 决策落地（双臂） | P6-T2 … P6-T3 | ~1.5 天 |
| **WP-2 LSP** | fork 落地（vendor/桥接/记差异）+ 工具面 + e2e | P6-T4 … P6-T5 | ~2 天（最重——闭包未知，R-1） |
| **WP-3 ast-grep** | fork 落地 + provisioning/桥接 + e2e | P6-T6 … P6-T7 | ~1 天 |
| **WP-4 web** | 三层验证 + e2e + 席位整合 | P6-T8 | ~0.5 天 |
| **WP-5 门与 e2e** | 门扩展 + probe + （条件）第五插行同步网 | P6-T9 | ~0.5 天 |
| **WP-6 收口** | 合规复核 + 文档双语 + 退出标准核对 + L2 真机 + ROADMAP 回馈 | P6-T10 … P6-T11 | ~1 天 |

**合计 ≈ 8 人日**（fork 全部落定后按 DoD-d 修正；LSP (L-A) 形态 +1 天 vendor/新包成本，(L-C) 形态 −1.5 天）。与可行性报告 §10「MCP bridging 2 周」的对账：下调依据 = web 面原生已在场（F-3）+ ast-grep 形态收窄（F-2）+ codegraph/git-bash 排除 + MCP 桥接面原生现成（dsh-mcp-client）——余量全部押在 LSP 的闭包未知上，这正是 Q-4 标阻断的原因。

## 8. 交付物清单

| 交付物 | 路径 | 类型 |
|---|---|---|
| A/B 证据笔记与 fork 裁定书 | `.omo/evidence/p6t1/FORKS.md` + A/B 台架数据档 | 证据 |
| 编辑面落地 | (E-A)：覆盖基线记差异 + S-14/S-15 闭环；(E-B)：omo-hooks enhancer 双钩 + vendored hashline-core 消费 | 代码/文档 |
| LSP 面落地 | (L-A)：`patches/omo-dsh/omo-lsp/` + 第五插行 + vendor lsp-core；(L-B)：mcp-client 配置行 + vendor 三包；(L-C)：记差异文档 | 代码/配置/文档 |
| ast-grep 面落地 | (G-A)：omo-hooks S-16 条目 + provisioning；(G-B)：vendor ast-grep-mcp + mcp 配置行 | 代码/配置 |
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
- **对 Phase 3 的接盘**：S-14/S-15/S-16 三条 deferred 逐条终裁进覆盖基线；H-24 护栏联动复核。
- **对 Phase 4 的回馈**：已 vendor 的 ast-grep/lsp-setup 技能从「文本在场」转「能力可达」——空头指令风险（技能教 `sg` 而二进制无保障）由 S-16 移植或 (G-B) 闭环。
- **对 Phase 5 的回馈**：team 成员席（hephaestus/sisyphus-junior）的编辑面是 fork E 结果的直接消费者；成员的 LSP/ast-grep 工具可达性进覆盖基线（Q-6）。
- **对 ROADMAP 的回馈**：Phase 6 目标句的两处实测更正——「LSP（走 dsh-lsp）」（F-1：无此包）与「ast-grep（上游的活方向）」（F-2：冻结基线无 MCP 包，活方向 = selective lift 候选）——随首个落地 commit 同发（双语）。
- **对可行性报告的回馈**：§1.1 映射表的 `dsh-lsp*` 行与 `dsh-web-search-exa` 行写的是 DSH 源码 monorepo 全名录、非发行物实况——以「实施期订正」节补入（双语），沿用 Phase 4.5/5 的研究产物随实施证据更新纪律。
- **Phase 7**：发布节奏（D13）的矩阵行含本阶段四面；O3/O5 开放维度不受本阶段影响。
