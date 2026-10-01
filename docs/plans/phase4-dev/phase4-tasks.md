# Phase 4 任务清单

> **上游依据**：[开发计划书](./phase4-plan.md) · [命令与 skill 清单与覆盖基线](./phase4-commands.md) · [ROADMAP Phase 4](../../roadmap_zh-CN.md) · [决策 D14](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 4 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，覆盖基线给出"每命令/skill 的处置"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：✅ **18/18 全部完成**（含 S-12 修复批次——L4 捕获的命令模板自触发关键词模式缺陷，commit `307e983`；退出标准核对表 a–e 全 ✅，见本文末尾）。`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）· ~~删除线~~ = 仲裁取消。
>
> **修订记录**：
>
> - **2026-09-30 计划期评审修复**（评审：`phase4-review-temp.md`，3 缺口 + 4 一致性问题全部核验成立）——① T1：测试文件计数更正（keyword-detector 6→**7**；A 组对账纳入 feature 根 `commands.test.ts`/`init-deep-migration.test.ts`）；B 组① 改 followup 时序钉测（同上下文先例 dsh-command-goal:98-105 已实证，throw settle 子项闭环）；② T7：对照组更正（未知命令 = 零事件零报错、落回普通 prompt——DSH admission miss 语义）；③ T8 新增 **manifest 同步网 + 条目 fork + c14 两文档并集演进**（首个 manifest 触碰任务同 commit 落地，R-11）；④ T12 同步网纪律与 c14 演进兜底；⑤ T16 增 c14 复验三变异；⑥ WP-4/WP-6 标题编号 H-41/H-40 → **H-34/H-33**（延续 Phase 3 H-01…H-32 序列，映射 S-37/S-06）；⑦ T6/T15 steer → followup 措辞。
> - **2026-09-30 复评修复（第 2 轮）**：T8/T12 的同步网引用 R-10 → **R-11**（与 plan §6 风险行同步改号——Phase 3 的 marker 同步 R-10 在 WP-5/T10 处保持不变）。
> - **实施期仲裁记录（第 1 号）**：PRE-2 条件翻转（npm `latest=5.1.5`，v5 正式版已发布）——经用户批准裁决**保持 v4.19.4 vendor 基线**（ROADMAP §2 规则 1 上位 + Phase 1–3 同源锚点 + R-10 逐字对齐依赖；v5 改进走 D14 规则 4 定向搬运）。另：实施期授权记录——编码 sub-agent 模型经用户批准使用 `opencode-go-free/space-bunny-free`（原指定 `studio2207/Qwen3.8-Flash-Next-oQ4e-mtp` 因会话白名单固化不可路由）。
> - **P4-T1 实测回填**：① 覆盖基线 §5 三组闭环转 ✅（证据 `.omo/evidence/p4t1/`）；② keyword-detector 24→25 文件（三处同步；**后经 T12 复跑再更正为 24 hook 文件 + 1 目录外配置文件**，见后续修订记录）；③ Q-1 闭环 followup 形态定案（§4.2 改写，降级 b 封存）；④ Q-3 手势桥实测 → C-03 零代码落地（T15 任务书改写：无命令事件对、断言 `<skill_content>` 注入）；⑤ Q-4 裁定候选 b′ 嵌入注册 + vendor path（T5 任务书改写，否决物化）；⑥ Q-5 定案（goal=pause / ralph 无 stop API 记差异 / jobs.kill 级联 / 延迟 ctx.get）；⑦ Q-6 收窄清单扩充（六级过滤 + 双幂等 + `.hpp` 负向后查，T12 任务书改写）；**【PR #10 修订：双幂等中的 session 级 Set 经评审复核删除（claim 破坏性证伪其必要性），见『PR #10 评审仲裁与修复』节】**；⑧ marker 定位修正（`<session-context>` 在 commands.ts:67-70 wrapper，plan §4.7）；⑨ 测试种子实测 111 its。
>
> **编号**：`P4-T<n>`（Phase 4 - Task n）。工作包归属见计划书 §7。

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1 | 上游 OMO v4.19.4 可取到源码 | `git -C <omo> rev-parse v4.19.4^{commit}` 返回 `b072d279110bdda2c6ac2525d0d24dc54d16148a` | ✅ 实测返回 `b072d279110bdda2c6ac2525d0d24dc54d16148a` |
| PRE-2 | v5.0.0 正式版**未**发布 → tag 选择闭合为 v4.19.4（D14 规则 3） | `npm view oh-my-openagent dist-tags --json` 的 `latest` 仍为 `4.19.4` | ⚠️ 条件翻转后仲裁维持：实测 `latest=5.1.5`（v5 正式版已发布，PRE 字面失败）——**仲裁裁决：保持 v4.19.4**（用户批准）。理由：ROADMAP §2 规则 1（冻结基线）为上位规则；Phase 1 已闭合 tag 选择且 Phase 1–3 署名锚点同源；规则 3「低赌注」论证仅覆盖核心包，不适用于 286+ 文件内容面；R-10 对接依赖 H-32 与 v4.19.4 逐字对齐；v5 具体改进走 D14 规则 4 定向搬运 |
| PRE-3 | 基线绿：`scripts/ci-local.sh` 8 门全绿 | 退出 0；记录基线（门 2 测试数、门 3 场景数、门 5 `checked`、门 6 断言数、门 8 proofs 数） | ✅ 8/8 PASS（日志 `.omo/evidence/pre3-baseline.log`）：门 2 = **976 测试（42 文件）**、门 3 = **22 场景**、门 5 = **checked=54**、门 6 = **23 断言（c01–c14）**、门 8 = **6 proofs** |
| PRE-4 | installed dsh = pin 的 0.1.5-rc.1 | `dsh --version`；doctor-lite 基线 PASS | ✅ `dsh --version` = 0.1.5-rc.1；doctor-lite 随门 4 绿（PRE-3 同跑） |
| PRE-5 | 本地 OMO 检出只读可用 | `git -C ~/GithubRepo/oh-my-openagent ls-tree v4.19.4 packages/omo-opencode/src/features/builtin-commands/` 与 `packages/shared-skills/skills/` 非空；全程只用 `git show/ls-tree`，工作树不动 | ✅ 两树非空（builtin-commands 20 文件 / shared-skills 17 目录）；P4-T1 全程 `git show/ls-tree` 只读 |

---

## WP-0 调研核对（计划书 §3/§4.4/§4.5/§4.6，覆盖基线 §5）

### [x] P4-T1 — 命令/skill 全树对账 + DSH 机制逐件复核

- **产出**：回填后的 [命令与 skill 清单与覆盖基线](./phase4-commands.md)（§5 待核清单 A/B/C 三组全部转 ✅ 或更正）；计划书 §4 的机制草案（命令驱动形态、skill 投递选型、停止面映射）按实测更正（DoD-d）；证据进 `.omo/evidence/`。
- **做法**：
  1. **清单完整性**（A 组）：`git ls-tree -r v4.19.4` 对四个来源树逐条对账——`features/builtin-commands/`（含 `templates/refactor-sections/` 子目录与 **feature 根的 `commands.test.ts` / `init-deep-migration.test.ts`**——测试文件计数对账须含这两个，不只 `templates/` 下的 2 个）、`packages/shared-skills/skills/`（17 目录，计划期粗核 286 文件）、`packages/omo-senpi/skills/{ultrawork,hyperplan}/`、`hooks/keyword-detector/`（24 文件）+ `hooks/stop-continuation-guard/`（3 文件）；senpi 与 shared-skills 同名 skill（ulw-research）的内容关系核实。
  2. **DSH 机制**（B 组，计划书 Q-1…Q-5）：读 installed dsh lib 逐字引用核实——① `ctx.commands.register` handler 的 `invocation.agent.followup` 注入时序（排队 vs `command/done` 先后、agent 运行中行为、`signal` 中止语义；**同上下文先例已存在**：dsh-command-goal/lib/index.js:98-105；handler throw settle 为 `kind:'error'` 已明文闭环）；② `$SESSION_ID`/`$TIMESTAMP` 的 handler 内暴露面；③ pinned 0.1.5-rc.1 是否存在 user-invocable skill → slash 命令桥接（计划期 grep 未见消费者）；④ skill 投递选型（filesystem 物化 vs `ctx.skills.register` 嵌入）+ `customSkillDirs` 能否经 patch overlay 配置；⑤ 续行机制盘点——`ctx.goals` 的 pause/disarm 词汇表（计划期已见 `dsh-command-goal` hint 含 `pause|resume`，复核语义细节）、DSH ralph 的停止面、`ctx.jobs` 的列表/取消 API、跨插件共享状态的 cordis 服务形态。
  3. **逐模块语义**（C 组）：7 命令模板逐字复核（占位符、agent 绑定、team addendum 边界）；keyword-detector 收窄清单（模型变体文案、disabled_keywords 默认值、幂等语义）；stop-continuation-guard 的 backgroundManager 依赖等价面；每模板引用的 OMO 载体（`session_read`/boulder/notepad/`mktemp`）的 DSH 等价面判定；上游测试文件（keyword-detector **7 个**、templates 2 个、feature 根 2 个）用例数登记为单测种子。
  4. **降级判定**：若 Q-1 钉测发现 `followup` 在命令路径有未预见的状态/时序限制，按计划书 §4.2 降级（b）（steer/inbox 写入）逐命令定形态并**显式记入计划书与踩坑**；`/refactor` 的 deferred 裁定按模板实际引用面终态化。
- **判定**：✅ 覆盖基线 §5 A/B/C 三组全部闭环；移植组/跳过组从草案转实测（估算按此修正，计划书 §7 回填）；Q-1…Q-7 各有逐字引用的结论。
- **证据**：`.omo/evidence/p4t1/A-tree-reconciliation.md` / `B-dsh-mechanisms.md` / `C-module-semantics.md`（三组调研员全程只读 `git show/ls-tree` 与 installed dsh lib 逐字引用）。实测更正：keyword-detector **24 文件** + 1 目录外配置文件（T12 复跑终定）；Q-1 闭环 followup 形态定案无降级；Q-3 桥接 = 手势注入（dsh-tool-skill pre-step SKILL_GESTURE）→ C-03 零代码；Q-4 裁定候选 b′（嵌入注册 + vendor path，否决物化）；测试种子 111 its。覆盖基线 §5/§6、计划书 §4.2/§4.3/§4.5/§4.6/§4.7/§6 已按实测回填（DoD-d）。
- **依赖**：PRE-1…PRE-5。**量级**：1 天（实耗：3 并行调研约 0.5 天）。

---

## WP-1 插件骨架（计划书 §4.1）

### [x] P4-T2 — `omo-commands` 包骨架 + `manifest.ts` 单一事实源

- **产出**：`patches/omo-dsh/omo-commands/`（`package.json` `@oh-my-opendsh/omo-commands` / `tsconfig.host.json` / `src/index.ts` 空 apply / `src/manifest.ts`）。
- **做法**：布局镜像 omo-hooks（host-only、Node 24 type-stripping、`.ts` 扩展 load-bearing 注释）；`manifest.ts` 按计划书 §4.1 声明条目形状（`id`（v5 名）/ 上游源路径逐文件 / 参数语法 / agent 绑定 / 效果摘要 / e2e 场景名 / 状态），条目集合 = P4-T1 实测后的移植组；派生函数（按状态过滤等）供 boot marker 与一致性测试消费。
- **判定**：✅ `pnpm typecheck` 绿；manifest 条目形状单测（空字段 throw、id 唯一、状态枚举合法）；`typecheck` 链扩展（根 package.json 先例）。
- **证据**：commit `92279ee`。`pnpm vitest run tests/omo-commands/` = **41 passed**（形状 + 负向 + 守卫顺序）；`pnpm typecheck` / `typecheck:libs` 四 face 全绿；门 6/7 不回归。**双评审 APPROVE**（sub-agent 两轮 + mcode 两轮；14+5 条成立 findings 修复后针对性再审通过）。编码方五条质疑经仲裁全部批准（逐字 hint/封闭二值 status/整树记账/计数校验/C-03 否决点）；评审发现 templates/ 计数错（11→14）已两处同步更正（commit `8ef02e1`）。
- **依赖**：P4-T1。**量级**：3 小时（实耗相符）。

### [x] P4-T3 — 挂载 + boot marker 接线

- **产出**：根 `cordis.yml` 第三个 `- insert:` 行（`id: omo-commands`）；`src/index.ts` 的 apply 注册循环 + boot marker（`[omo-commands] command <id> registered` 逐行 + 汇总行）；cold-start / doctor-lite / probe 的 omo-commands 接线。
- **做法**：P-8 schema 纪律（insert 形态、`dsh plugin --profile add`）；loud-but-non-fatal（单命令注册失败不拖垮其余）；doctor-lite check 2b 扩展为**恰好 3 个 insert 行**（id 集合 {omo-agents, omo-hooks, omo-commands}——计数 2→3 的变异敏感网同 commit 同步：cold-start 双安装→三安装、drive.mjs、probe、smoke-real、c14 类断言）；注册表占位形态 = 空注册表 + 汇总行计数从 manifest 派生（P3-T3 先例），T6+ 逐命令填入。
- **判定**：✅ `scripts/cold-start.sh` 绿且日志含 omo-commands marker；门 4/8 绿；`--dump-config` 含 omo-commands 行。
- **证据**：commit `b3233cd`。cold-start PASS 且日志逐字含 `[omo-commands] loaded: manifest 6 entries (pending=6, ported=0) — 0/6 commands registered`；`--dump-config` 第 546 行含第三行；门 2 = **1065 测试**（+25）；门 4 doctor-lite `exactly the 3 plugin rows`；门 6 c11 断言名改计数派生（评审实证删行/加行双 FAIL）。**双评审 APPROVE**（sub-agent 两轮 + mcode 两轮；11 条 findings 修复，含 9 变异捕获实证）。仲裁裁定：ulw-plan 永不注册禁令归 COMMAND_REGISTRARS 处 + 逐 id 守卫单测（非 T16 静态门）；NOTICES 逐命令语义移植表随 T6 建立。
- **依赖**：P4-T2。**量级**：3 小时（实耗约 4 小时）。

---

## WP-2 skills vendor 与投递（计划书 §4.3）

### [x] P4-T4 — vendor 17 shared-skills + 2 senpi 指令 skill

- **产出**：`patches/omo-dsh/vendor/shared-skills/`（17+2 skill 目录 + `VENDOR-MANIFEST.json` 逐文件 sha256 + 包级 `NOTICE.md` + `package.json` 补 `license: "SUL-1.0"`）；`THIRD_PARTY_NOTICES.md` Phase 4 小节；`start-work` → `ulw-execute` 改名逐处入 `deviations[]`（目录名 + frontmatter `name:` + 正文引用，改名前原文 sha256 双向锚，R-8）。
- **做法**：Phase 1 vendoring playbook 全流程（`git show v4.19.4:<path>` 取内容，不碰工作树；manifest 生成脚本化复用/扩展）；frontmatter 适配（DSH 必需键 `name`/`description`，P4-T1 C 组核对的差异键逐处 deviation）；**只 vendor 不改写正文语义**（载体收窄注记进覆盖清单差异段，不进 skill 正文——内容保真优先，适配由消费侧命令/persona 承担）；`verify-licenses` 计数变化逐条对应。
- **判定**：✅ manifest 漂移检测脚本绿（Phase 1 工具复用）；`verify-licenses` 绿且 `checked` 计数 = 54 + 新增条目数；NOTICES 行数与 manifest 文件集合一致（一致性单测）；改名 skill 在 catalog 语义下以 `ulw-execute` 裸名出现（单测模拟 frontmatter 解析）。
- **证据**：commit `92279ee`。三方计数 disk/manifest/NOTICES = **291**（288 skill + 3 包根；277 verbatim + 12 已修改 + 2 新增；deviations 14 条 1:1）；`verify-licenses` PASS **checked=56**（+shared-skills +omo-commands）；漂移 `checked=320 violations=0`；`tests/vendor/` **23 passed**（含 12 组变异反跑实证）；「只从 tag 取内容」评审实证（56 个 tag↔HEAD 分歧文件全部源自 tag）；改名 sed 反向还原机器证明。**双评审 APPROVE**（sub-agent + mcode 各一轮 + existsSync 守护修复后复验）。三项构建配置改动（tsconfig exclude / vitest 排除 Bun payload 测试 / walker 修正）与载体路径白名单保留经仲裁批准。
- **依赖**：P4-T1。**量级**：1 天（实耗约 0.7 天）。

### [x] P4-T5 — skill 投递机制落地 + catalog e2e

- **产出**：按 P4-T1 Q-4 裁定落地投递——**已定案 = 候选 b′**：apply 时从 vendor 目录读各 SKILL.md 正文，`ctx.skills.register({name, description, whenToUse?, content, path: <vendor SKILL.md 绝对路径>})`（path 使引用文件磁盘可读；19 个 skill 全部注册，归当前 Fiber effect）；`tests/e2e/` 新增 `skills-catalog-visible` 场景。
- **做法**：从模块 `import.meta.url` 解析 vendor 目录、apply 时一次读盘注册（命令路径不读盘纪律保留——skill 正文经 `ctx.skills.get` 原生面加载）；`$DSH_HOME` 解析不需要（无物化）；e2e 场景 = catalog 断言（19 裸名集合恰可见、无 `shared/` 前缀、start-work 以 `ulw-execute` 名出现）+ mock 发 `skill` 工具调用加载一个 skill → 断言正文经 `ctx.skills.get` 原生面返回 + 对照（未 vendor 名返回未找到）+ 引用文件经 path 可读性抽查（ultimate-browsing 一个引用文件）。
- **判定**：✅ 门 3 绿；**对 `dsh-skill*` 包零 patch**（静态断言进 T16）；场景 verdict JSON 含 catalog 明细断言。
- **证据**：commit `42baa49`。`skills-catalog-visible` **13/13 断言**（catalog 19 裸名恰可见、无 `shared/` 前缀、`ulw-execute` 在 `start-work` 不在、skill 工具正文与 vendor 逐字全文比对、未 vendor 名拒、ultimate-browsing 引用文件经 path 可读）；门 2 = **1162 测试**（tests/omo-commands 128）；9 条 fabricated 缺陷自证；strip-only 守卫含反事实实证。**双评审 APPROVE**（sub-agent 三轮 + mcode 三轮；23 条 findings 修复：重名计数诚实化/invocation 键 throw/per-tree non-fatal/全文比对/YAML 注释语义三类）。dsh 契约承重面（评审实测行号）：`source` 必填（dsh-skill lib:486）、duplicate first-wins（:197-200）、`super(ctx,"skills")`（:132）。
- **依赖**：P4-T4。**量级**：0.5 天（实耗约 0.7 天）。

---

## WP-3 模板命令批 A（计划书 §4.2；命令 e2e 通道打样）

### [x] P4-T6 — 移植 `/handoff` + `/remove-ai-slops`

- **产出**：`src/commands/handoff.ts` + `src/commands/remove-ai-slops.ts` + `src/templates/` 对应模板常量（署名头：上游 `templates/handoff.ts` / `templates/remove-ai-slops.ts` 逐字标注 + "语义移植"声明）+ 单测；manifest 两条目填入。
- **做法**：模板渲染纯函数（`$ARGUMENTS`/`$SESSION_ID`/`$TIMESTAMP` 占位符；P4-T1 Q-2 暴露面）；命令 handler 按 Q-1 裁定形态驱动 agent（首选 `followup`，降级 = steer/inbox）；`remove-ai-slops` 模板引用 skill 的段落与 S4-11 vendor 内容对齐（`skill(name="remove-ai-slops")` 的 DSH 等价 = dsh-tool-skill 工具名，P4-T1 核实）；`handoff` 的 `session_read` 引用按 Q-1/C 组等价面裁定（无等价面则收窄记差异）；team-mode addendum 段不移植（D-03）；handler try/catch + throw settle 形态钉测。
- **判定**：✅ 单测覆盖：占位符渲染全集、空参数/非法参数、模板文本含上游关键强制段（逐字锚点）、handler 异常 settle 为 `kind:'error'`；vitest 绿。
- **证据**：commit `261c5ba`。tests/omo-commands **207 测试**（全量 1247）；remove-ai-slops 模板与上游**逐字节相同**（双评审 import 求值 diff 实证）；handoff 三处收窄登记（session_read 指引化/PHASE 1·3 散文/PHASE 4 DSH 会话面）；`formatCommandTemplate` 外框移植后与上游模拟**逐字节相同**（评审复刻实证）；followup 消息 = deepFreeze(structuredClone) 复刻 dsh-llm 三性质；NOTICES 语义移植表（2 命令/8 文件，只增不改）。**双评审**：sub-agent REJECT→修复→APPROVE（MAJOR：散文改写与登记说反话、PHASE 4 零登记）+ mcode 两轮 APPROVE（FINDINGS none）；共 12 条 findings 修复。仲裁新裁定：`$TIMESTAMP`=ISO（上游 executor.ts:95 实测）；外框移植；`resolveFileReferencesInText`/`resolveCommandsInText` 不移植记差异。覆盖基线 C-06/C-07 行已翻 ✅（e2e 随 T7）。
- **依赖**：P4-T3、P4-T5（remove-ai-slops 的 skill 引用）。**量级**：4 小时（实耗约 5 小时）。

### [x] P4-T7 — e2e：命令通道打样场景

- **产出**：`tests/e2e/` 新增命令通道原语（drive.mjs 剧本发 `/name args` 行的能力）+ `handoff-summary-driven` 与 `remove-ai-slops-driven` 两场景（通道打样，后续命令场景复用）。
- **做法**：mock 剧本 = 用户行敲命令 → 断言 `command/run`（name/args 结构化负载）+ `command/done`（kind success）事件对 + followup 注入的模板文本出现在下一模型请求（session JSONL 断言通道）+ 模型按模板行事的剧本回应；对照组：**未知命令行 = 无 `command/run`、无 `command/done`、无 error 结果，该行落回普通 prompt 路径**（DSH admission miss 零事件语义，dsh-commands lib:293-299/:319-321——**不是**"原生报错"）；无参数变体；变异 QA 体例沿用（各具名 FAIL）。
- **判定**：✅ 门 3 绿；两场景 verdict JSON 含事件对 + 注入文本 + 对照断言。
- **证据**：commit（随 T10 后一提交）。**通道形态实测**：命令经专用 RPC `commands/execute(agentId, line, submittedAttachments)`（typert.host:44-89，不经 session/prompt；rc6-flat 大声抛错）；两场景各 **18 断言**（事件对 commandId 配对 + 注入载体 command/done 后下一回合——实测 run 3→done 7→carrier 10 + 外框/模板锚点 + done 文本字符数自洽 + boot 注册行防蒙混 + 未知行零事件回落对照）；**17 缺陷 × 2 spec** 各命中具名断言 + 覆盖口径登记（18 checks 17 cases，pluginLoaded 唯一豁免）。rawInput 前导空格直通（上游 executor 同不 trim——仲裁裁决照实记录）。**双评审**：sub-agent 两轮 APPROVE + mcode（首轮 BLOCKER wire 名说经仲裁亲核 typert.host.js:71-72 为事实错误驳回→次轮 FINDINGS none）；15 条 findings 修复。
- **依赖**：P4-T6。**量级**：3 小时（实耗约 4 小时）。

---

## WP-4 stop-continuation（计划书 §4.6；H-34 接盘，原 Phase 3 S-37）

### [x] P4-T8 — 移植 stop-continuation-guard 服务 + `/stop-continuation` 命令

- **产出**：guard 状态服务（cordis 服务形态，P4-T1 Q-5 裁定——**omo-hooks 提供**（H-34 住 omo-hooks，§4.1 拓扑），**omo-commands 作为写入方消费**（stop()/clear()），**omo-hooks H-03 作为读取方消费**（isStopped()）；stop/isStopped/clear 词汇表与上游对齐）+ `src/commands/stop-continuation.ts` + omo-hooks 侧 H-03 enforcer 的停止标记检查（同 commit 跨插件改动）+ 单测。
- **做法**：停止面接线按 Q-5 盘点逐机制落地——① todo 续行：H-03 steer 前查 isStopped（omo-hooks 改动 + 回归用例）；② goal 轮驱动：pause 面或差异记录；③ ralph：原生停止面或差异记录；④ 后台任务级联取消：`ctx.jobs` 取消 API（H-11 的 ctx.inject 延迟获取先例）；上游 `index.test.ts` 用例移植为单测种子；服务跨插件可见性单测（双插件共存模拟，R-5）。
- **⚠️ omo-hooks manifest 同步网（R-11，计划书 §4.1 已成文——违者 boot 红/门红）**：guard 落地先裁定 **manifest 条目 fork**——(i) 若作为 manifest 条目（需裁定服务形态的"目标事件/模式"字段语义）：同 commit 同步 `EXPECTED_HOOK_COUNT` +1、`tests/omo-hooks/manifest.test.ts` 三处硬编码（:115/:126/:370）、`tests/omo-hooks/registration.test.ts` 的 `EXPECTED_SUMMARY_LINE`（事件计数随新条目归属变化）；(ii) 若以纯服务模块落地（无 manifest 条目）：**文件放 `src/hooks/` 之外**（c13 双向集合 + 孤儿 .ts 规则会拒绝 `src/hooks/` 下的无条目文件），且其覆盖行不得进 c14 解析面（见下）。**c14 演进（若本任务为首个 manifest 新增，否则 T12 承担）**：`COVERAGE_BASELINE_MD` 单文档 → `[phase3-hooks.md, phase4-commands.md]` 两文档并集（解析契约：`## 1.`–`## 2.` 之间、`| H-\d+ |` 行、第 5 数据格为状态列——phase4-commands.md §1.2 表格已按此契约排版）+ manifest 侧改按 `status === 'ported'` 过滤（理由：Phase 3 结项时全条目 ported，过滤不降既有断言强度；pending 期条目不破门；翻转 commit 仍须文档/manifest 同改），理由注释写入 gate 源码。
- **判定**：✅ 单测覆盖：stop 后 isStopped 真 / clear 复位 / H-03 在 stopped 会话不再 steer / 级联取消调用面 / 服务缺席时 loud-but-non-fatal；vitest 绿；**fork 两分支各自的门 2/6 不红（含同 commit 的同步网改动）**。
- **证据**：commit `ff136b7`。**fork 裁定 = (ii) 纯服务模块** `src/services/stop-continuation-guard.ts`（四理由：event/mode 字段无诚实取值、状态字段两难、c13 只扫 src/hooks 实测、H-34 行预授权出口；c14 演进已由 T12 承担故本任务无 c14 改动）。四机制：① H-03 `stopped-by-command` 首门（breaker 三阶段可判别测试）；② goal pause（CAS revision，非 active 不写，异常降级）；③ ralph 记差异（不承诺程序化取消）；④ 级联 `list({id:sessionId})` + `kill` + `ownerSession === sessionId` 围栏。跨插件：ctx.provide / 延迟 ctx.get / 服务名跨包相等断言 / R-5 真实注册链路测试。**双评审**：sub-agent REJECT→修复→APPROVE（MAJOR **级联空 caller 静默空转**——仲裁亲核 dsh-jobs-local:178-180/313-315 成立修复；NOTICES pending 列表）+ mcode 两轮 APPROVE（FINDINGS none）；12 条 findings 修复。门 2 = 1289、门 6 = 23/23。覆盖基线 H-34 行翻 ✅ 已落地（c14 豁免措辞，门 6 复验绿）。
- **依赖**：P4-T3。**量级**：4 小时（实耗约 5 小时）。

### [x] P4-T9 — e2e：stop-continuation 场景

- **产出**：`tests/e2e/` 新增 `stop-continuation-halts-todo` 场景。
- **做法**：剧本 = 建 todo（未完）→ 回合收尾触发 H-03 steer 续行（对照，续行发生）→ 敲 `/stop-continuation` → 再造"todo 未完回合将停"→ 断言**不再 steer**（停止标记真实生效）+ `command/done` success；级联取消面有可沙箱化的路径则一并断言，无则记降级。
- **判定**：✅ 门 3 绿；场景含"stop 前续行 / stop 后停续"双向断言。
- **证据**：commit `772ad2e`。`stop-continuation-halts-todo` **30 断言**（stop 前两边界 steer 文本相异防复读 / stop 后零 steer + 排除法四理由读日志：all-complete、goal-owns-continuation（noGoalAtPostStopBoundary）、circuit-breaker（formatCircuitBreakerLine 派生前缀）、projection-absent）；级联/goal 面沙箱化（后台 job `cancelled 1` / create_goal 后 `paused the active goal` + 0 新轮）；**幂等载体 = 守卫 stop 行**（`cancelled N` 降级为本次请求数——评审 MAJOR 竞态修正：stopping 非终态，再 kill 返回 `requested`）；`actions` 交织驱动路径（29 旧场景零变化，评审独立全量复跑实证）；**38 缺陷**各命中 + 两声明豁免（pluginLoaded、secondStopIsIdempotent——注释声明）。**双评审**：sub-agent REJECT→修复→APPROVE + mcode 两轮（次轮建议接受）；14 条 findings。证据件 `.omo/evidence/p4t9/stop-continuation.txt`（fresh run 重生成）。
- **依赖**：P4-T8。**量级**：3 小时（实耗约 4 小时）。

---

## WP-5 `/ulw-execute` 命令（计划书 §4.7；R-10 闭环）

### [x] P4-T10 — 移植 `/ulw-execute` 模板 + R-10 marker 对接

- **产出**：`src/commands/ulw-execute.ts` + `src/templates/ulw-execute.ts`（模板 marker `<session-context>` + `You are starting an Atlas work session.` 与上游逐字）+ omo-hooks H-32 激活检测的 **marker 识别增强**（同 commit 跨插件改动）+ 单测。
- **做法**：模板主体语义移植（编排者纪律、闸门验证、flags 语法）；boulder-state/ledger 引用段按 Phase 3 H-32 已登记收窄口径处理（复用其差异清单）；H-32 增强 = 激活检测新增"命令模板 marker 命中"路径，与既有 DSH 原生路径（委派 + 意图检测）双轨合一、共享幂等键（already-injected 语义不回归）；R-10 常量同步钉测（omo-commands 模板常量 ↔ omo-hooks 检测常量的跨包一致性单测——同源派生或逐字对照断言）；atlas 绑定 = 模板身份明示 + 名册委派链（Phase 2 就位）。
- **判定**：✅ 单测覆盖：模板渲染、marker 常量跨包一致、H-32 marker 命中路径激活 + 幂等、委派路径不回归；vitest 绿。
- **证据**：commit `df6e08c`。双层 marker 逐字携带（`<session-context>` wrapper `commands.ts:63-74` + 本体首行）；R-10 跨包一致性断言**打在渲染产物上**（常量漂移/模板停产/判定改写/`||`退化四变异各红）；H-32 双轨：marker 轨判定面 = **atlas 子会话委派任务文本**（评审 BLOCKER「轨 B 在编排者会话不可达」经仲裁裁定为**语义更正非开门**——H-32 注入面本就只属于 atlas lane，评审探针 CASE 3 实证 atlas 子会话 injected=1）；listener 集成测试（真实模板产物 → inject 一次/二次幂等/编排者形态零注入 by-design/无 marker 零注入）；110 既有 H-32 测试零改动。**双评审**：sub-agent REJECT→修复→APPROVE + mcode 两轮 APPROVE（10 条 findings：resume 分支原文入注记/CRITICAL 五条/hint 单源/wrapper 行号/条件式→断言式表述）。
- **依赖**：P4-T3。**量级**：4 小时（实耗约 5 小时）。

### [x] P4-T11 — e2e：ulw-execute 命令场景

- **产出**：`tests/e2e/` 新增 `ulw-execute-command-activates-atlas` 场景。
- **做法**：剧本 = 敲 `/ulw-execute <plan>` → 断言命令事件对 + 模板注入 + 指挥委派 atlas（MOCKROLE 名册驱动）+ H-32 激活注入在 atlas 子会话可见（marker 路径，与 P3-T17 的意图路径场景互补）+ 幂等（二次激活不重复注入）；对照 = 无命令时纯讨论工作计划不触发 marker 路径。
- **判定**：✅ 门 3 绿；R-10 对接在 e2e 层可观测（marker 路径与意图路径各自具名断言）。
- **证据**：commit `5209ebc`。`ulw-execute-command-activates-atlas` **25 断言**：① 命令面（boot 注册行/两次真调用独立 commandId/事件对）；② 模板注入指挥会话（双 marker 逐字 + session-context 本会话 id/ISO + 第 0 次请求）；③ **marker 路径**（atlas 子会话委派任务文本 11877 字符 = 模板逐字转交 → H-32 注入含磁盘计划名 + notepad scaffold + notepadFooterRewrittenByTheActivation）；④ 幂等对照（二次注入总数=1、conductorNotInjected by-design、无 marker 无意图对照零注入）。**settle 签名修复**（观测窗口守卫曾哑火——评审插桩实证）；驱动 `commandOpensTurn` 回合记账 + `lastTurnEndedOnItsOwnTerms`（窗口关闭从运气变断言）。marker vs 意图：e2e 证契约面各自具名，归因归单测（模板命中 5 条意图词）。**33 缺陷**各命中。**双评审**：sub-agent REJECT（BLOCKER 插桩实证成立）→修复→APPROVE + mcode 两轮 APPROVE；16 条 findings。证据件 `.omo/evidence/p4t11/`。
- **依赖**：P4-T10。**量级**：3 小时（实耗约 4.5 小时）。

---

## WP-6 关键词模式（计划书 §4.5；H-33 接盘，原 Phase 3 S-06）

### [x] P4-T12 — 移植 keyword-detector（ultrawork/hyperplan；team deferred）

- **产出**：`patches/omo-dsh/omo-hooks/src/hooks/keyword-detector.ts`（+ 必要子模块：检测逻辑 / 文案常量 / 配置）+ ultrawork 指令内容接线（vendor S5-01 正文为注入文本源）+ 单测；omo-hooks manifest 新增条目。
- **做法**：检测逻辑语义移植（剥 code block/inline code/slash 前导——`detector.ts` 逐字对照；`\b(ultrawork|ulw)\b` / `\bhyperplan\b|(?<![\w.])hpp\b`（`.hpp` 负向后查，上游 issue #4215）/ 组合模式严格相邻双词序与交集禁用规则（基词任一禁则禁 combo，detector.ts:53-56）——`constants.ts` 逐字对照）；注入形态 = 模式 A pre-step（`agent.inject()`，恒 `return next()`）；**双幂等**（消息级 `!text.includes(keyword.message)` + session 级一次性 Set）**【PR #10 仲裁修订：session 级闸的必要性理由（同一条消息每步可见）被 inbox claim 破坏性证伪、上游关键词路径本无此闸——已删闸对齐上游，本要求撤销，见『PR #10 评审仲裁与修复』节】**；**六级输入过滤全套移植**（synthetic/internal、system directive、non-OMO agent、planner、background session、非主 session 只留 ultrawork/combo）；**收窄落地**：team 关键词跳过（枚举位预留）、模型变体文案（5+1 个 md）收窄为单一名册感知文案（reviewer 引用 = plan-consultant/plan-reviewer，Phase 2 名册名）、notepad/`mktemp` 载体引用记差异；配置面 = 插件 Config（disabled_keywords/enabled_expansions 等价物，上游两字段 optional 无默认 = 缺席全启用，DSH 默认对齐）；上游 7 个测试文件（89 its）用例移植为单测种子。**⚠️ manifest 同步网（R-11）**：本任务必然新增 manifest 条目——同 commit 同步 `EXPECTED_HOOK_COUNT`、manifest.test.ts 三处、`EXPECTED_SUMMARY_LINE`（pre-step 计数 +1）；**若 T8 未落地 c14 两文档并集演进（T8 走了纯服务 fork），本任务承担该演进**（契约见 T8 任务书 ⚠️ 段）。
- **判定**：✅ 单测覆盖：命中/剥离/幂等/组合 banner/禁用配置/收窄注记；manifest ↔ 清单一致性不回归；vitest 绿。
- **证据**：commit `988a547`。39 keyword 单测（全量 **1168**）；EXPECTED_HOOK_COUNT=15 boot 绿；c13「15 top-level listener files ↔ 15 manifest ids 双向」；c14 两文档并集 + ported 过滤落地（`phase3 14/16 + phase4 0/2 → 14 == 14/15`），单侧/双侧翻转三变异实证。**双评审**：sub-agent 首轮 **REJECT**（BLOCKER `agent.inject` 裸字符串——仲裁亲核 dsh-agent types:209 与 inbox pending-id 校验成立，修为 InjectedUserMessage 全字段形态；MAJOR c14 误报分支删除、notepad/mktemp 注记补齐）→ 修复后 APPROVE；mcode 两轮 APPROVE（FINDINGS none）。共 13 条 findings 修复（含 WeakMap descriptor 缓存、`.trim()` 对齐、mktemp `-t` 表述更正为 GNU-deprecated 真话）。S-11 登记：inject 晚一个 step 边界抵达（T13 e2e 断言口径）。
- **依赖**：P4-T3、P4-T4（S5-01 内容）。**量级**：1 天（实耗约 0.8 天）。

### [x] P4-T13 — e2e：关键词模式场景

- **产出**：`tests/e2e/` 新增 `ultrawork-keyword-injected` 场景（+ 对照）。
- **做法**：剧本 = 用户消息含 `ulw` → 断言 ultrawork 指令注入下一请求（banner 首行 `ULTRAWORK MODE ENABLED!` 逐字锚点）；对照组 = ① 消息不含关键词不注入；② 关键词仅在 code block 中出现不注入；③ slash 命令行不注入；④ 二次消息幂等；hyperplan 关键词面同场景或姊妹场景断言。
- **判定**：✅ 门 3 绿；对照四组各具名断言。
- **证据**：commit `bfd5f56`。**四场景 77 具名断言**（ultrawork-keyword-injected 21 / keyword-negative-controls 15 / hyperplan-keyword-injected 17 / combo-keyword-injected 24——S-6 会话一次性使"注入/再注入"互斥故拆分）**【PR #10 修订：S-6 会话闸已删（理由见『PR #10 评审仲裁与修复』节），control ④ 已反转为「同会话二次武装」实证——「互斥」不再成立】**+ **26 fabricated 缺陷**（横幅从用例自渲染 + 非空守卫）；S-11 口径落地（bannerRequestIndex=1 + 首请求缺席断言 + 缺陷钉死）；双投影断言（splice↔claim id 相等 + 只改 claim 缺陷）。**e2e 抓出真实崩溃**：`ctx.config` 在 cordis Proxy 上 throw 致 keyword-detector 从未注册（39 单测绿灯掩盖——单测喂普通对象非 Proxy ctx），修为 `ctx.get('config')` + readOptionalService，并新增注册面可证伪断言（负对照不再对死 hook 全绿）。六级过滤 e2e 覆盖 2/6 面（slash/code block），其余由单测承担（评审记录）。**双评审**：sub-agent REJECT→修复→APPROVE + mcode REJECT→修复→APPROVE（17 条 findings：前向承诺豁免/假前提注释/双投影/注册面/派生重述等）。manifest status=ported + H-33 行**双侧同步翻转**（c14 契约，23/23 复验）。
- **依赖**：P4-T12。**量级**：3 小时（实耗约 5 小时）。

---

## WP-7 hyperplan + ulw-plan（计划书 §4.4 C-03/C-04）

### [x] P4-T14 — 移植 `/hyperplan`（降级形态）

- **产出**：`src/commands/hyperplan.ts` + 模板常量 + 单测；hyperplan skill（S5-02）的加载指引段落地。
- **做法**：模板语义移植（7 阶段工作流指引 + roster 契约段按 Phase 2 名册现实改写：`team_create`/category 成员引用 → DSH 名册与委派面的映射，缺席面明示）；**降级语义**：上游自带的"team-mode 不可用"指引段按 DSH 现实重写（无 `~/.omo/omo.jsonc`——指引文案改为 Phase 5 预告 + 当前可用的降级路径）；完整对抗评审环不移植（Phase 5）。
- **判定**：✅ 单测覆盖：模板渲染、降级指引段在场、team 引用零硬编码死链；vitest 绿。
- **证据**：commit `97faf6f`。hyperplan.test **23 测试**（全量 1345）；降级指引段落地（team-mode 缺席明示 + Phase 5 预告 + 名册委派降级路径：plan-consultant/plan-reviewer 交叉质询、prometheus 接 Phase 6、回复明说 DEGRADED）；**零死链守卫按句切分**（提及 team_create/task_send/缺席角色须在否定句）+ 变异 falsify + 残余风险钉死（同句巧句可过——启发式非证明，注释声明）；description 双串（上游原文署名锚点 + 注册串降级后缀，常量+渲染产物双断言，NOTICES/manifest/注记三处登记）；7-phase 逐字恢复 + 7-vs-8 登记（SKILL 实为 Phase 0-7 八段）；Phases 2-4 `task_send` 替换明示（评审实测 Phases 5/6 零 task_send）；Provenance 块按席位计数非上游成员名；roster 映射 `ALL_AGENT_IDS` 派生 + 反检。vendor frontmatter 张力记录于 carrier note 第 8 条（skill 正文保真不改写，降级由命令指引承担，Phase 5 对接）。**双评审**：双 REJECT→修复→双 APPROVE（19 条 findings）。
- **依赖**：P4-T3、P4-T4（S5-02）。**量级**：3 小时（实耗约 4.5 小时）。

### [x] P4-T15 — `/ulw-plan` 命令面 + e2e

- **产出**：按 P4-T1 Q-3 裁定——**手势桥存在 = 零代码落地**（omo-commands **不得注册同名 `ulw-plan` 命令**，否则屏蔽手势）；唯一落地件 = 确认 S4-15 经 T5 注册进 catalog 且 user-invocable（默认 true 即可）+ 覆盖清单 C-03 行记形态；`tests/e2e/` 新增 `ulw-plan-loads-prometheus-skill` 场景；hyperplan 场景（`hyperplan-degraded-noted`）一并落地。
- **做法**：e2e 断言 = 用户行敲 `/ulw-plan <请求>` → **无 `command/run`/`command/done` 事件**（手势非命令，对照断言具名）+ ulw-plan skill 正文以 `<skill_content>`（source `kind:"skill-invocation"`）注入下一请求 + 用户原文骑行 + 指挥按 prometheus 人格行事的剧本回应（访谈问题写回，Phase 2 适配语义）；hyperplan 场景断言降级指引真实出现（降级文案按 T14 重写形态锚定，非上游 `~/.omo/omo.jsonc` 字面）；对照 = 无参数变体行为。
- **判定**：✅ 门 3 绿；Q-3 裁定结论与落地形态一致（DoD-d——手势桥零代码，无显式 handler）。
- **证据**：commit（随 T11 后一提交）。`ulw-plan-loads-prometheus-skill` **17 断言**（零 `command/run`/`command/done` + `matched:false` ×2 + 回落 prompt + `<skill_content>`（`kind:skill-invocation`）注入 ×2 + 整段 `includes(ulwPlanBody)` + `You are **Prometheus**` 锚 + body-not-frontmatter 哨兵 + 访谈语气针 `Which request did you mean`）；`hyperplan-degraded-noted` **28 断言**（T14 shipped 常量锚定降级指引/名册映射/description 降级后缀在外框且原句在前/7-phase/无参数变体省略 `**User Arguments**`/`deadLinkFree(body)=[]` + `deadLinkRuleIsDiscriminating` 跨句洗白探针）；**对照语义**（同一 admission 机制、相反注册事实——任一单独无法抓同名命令屏蔽手势）；**31 distinct 缺陷**（17+14）各命中。修复含第五 bug（删帧晋升 slot 0 假绿 → carrier 按内容定位）。**双评审**：sub-agent REJECT→修复→APPROVE + mcode 两轮 APPROVE；17 条 findings。
- **依赖**：P4-T14、P4-T5。**量级**：4 小时（实耗约 4 小时）。

---

## WP-8 门扩展（计划书 §4.8）

### [x] P4-T16 — 静态门 c 组 / doctor-lite / probe / proofs 扩展

- **产出**：`scripts/verify-concerto-static.mjs` 新增断言组（延续 c 编号）：三 insert 行、omo-commands 署名头覆盖（每实现文件含上游源标注 + 语义移植声明）、omo-commands manifest ↔ commands/templates 文件集合一致、omo-commands manifest ↔ 覆盖清单一致（一致性测试）、**vendor skills 的 NOTICES/manifest/license 条目存在性 + `dsh-skill*` 零 patch 断言**（退出标准 b 的静态锚）、改名一致性（ulw-execute 裸名，无 start-work/shared/ 残留——署名标注除外）；probe 全量 registered marker 断言（omo-commands 各行 + 汇总，同源派生）；prove 脚本：命令注册表在真实 composition 可见（stub 先例）+ 命令 handler throw 的 settle 形态钉死（P4-T1 Q-1 已闭环结论的 prove 化）。**c14 复验**（其两文档并集 + ported 过滤演进已随 T8/T12 首个 manifest 新增前置落地）：反跑变异验证断言强度不回退——① phase4-commands.md §1.2 已移植行删行即红；② manifest ported 条目缺基线行即红；③ pending 条目不破门（有意语义）。
- **做法**：门扩展只加严不放松（DoD-c）；全部新断言配变异自证（反跑验证非真空）；ci.yml/ci-local.sh 注释计数同步。
- **判定**：✅ 门 6/8 绿且断言数增加；三处变异反跑各具名 FAIL。
- **证据**：commit `d676aeb`。门 6 **23→30**（c15 insert 行包解析 / c16 署名头两群体——ported 三联 + 6 native 声明 + manifest upstreamSources 交叉核对双向 / c17 manifest↔commands+templates / c18 manifest↔覆盖清单（ulw-plan 具名豁免，滥用即红） / c19 vendor skills NOTICES⇔manifest⇔disk⇔count 四面 + license 面（package.json 字段⇔NOTICES 声明 + 单点声明）+ dsh-skill* 零 patch 三腿 / c20 改名一致机器可读面 / c21 NOTICES 计数派生化）；门 8 **6→7**（prove-command-registry：真实 cordis Context + 真实 CommandRuntime 注册可见 + handler throw settle 双钉——kind:'error' 且原样 re-throw 身份保持 + 下一条仍成功）；omo-hooks strip-only 普查（tests/strip-only/guard.ts 共享，参数属性规则收窄 + 反事实钉死）；P3-T17 断言名清扫；probe/run-proofs 派生化（第三手抄名册消除）；**c14 三变异复验**（删已移植行红/ported 缺基线红/pending 不破门——H-34 豁免被门反钉：翻「已移植」即红）。**双评审**：sub-agent REJECT（3 MAJOR：越界变量吞诊断/交叉核对不存在/c20 无记录——25 变异实证）→修复→APPROVE + mcode 两轮 APPROVE（FINDINGS none）；16 条 findings。
- **依赖**：P4-T7、P4-T9、P4-T11、P4-T13、P4-T15（全部 e2e 落地后统一扩展）。**量级**：0.5 天（实耗约 0.7 天）。

---

## WP-9 收口

### [x] P4-T17 — 署名与文档收口

- **产出**：`THIRD_PARTY_NOTICES.md` Phase 4 小节终态（语义移植逐文件 + vendor 逐文件双层）；`README*.md` Phase 4 状态行（R-7 措辞：命令面 ≠ Team Mode ≠ 编辑面）；`CHANGELOG.md` Unreleased Phase 4 块；`docs/mvp-pitfalls*.md` 新坑（如有）；覆盖清单全部条目翻终态。**【PR #10 评审更正（2026-10-01）**：「全部条目翻终态」实际只落了 §1.1 命令行与 §1.2 H-33/H-34 行，§2/§3 的 19 行 skill 状态列漏翻（两评审交叉命中：A-3 / B-MAJOR-2），且无任何门覆盖该列——本轮已补齐翻转并新增 c22 门防复发，见『PR #10 评审仲裁与修复』节。】
- **做法**：署名既有条目只增不改（DoD-e）；覆盖清单 §6 统计口径与 §1–§4 行数自洽（Phase 3 T20 的 46/47 教训——三处计数同源派生）；一致性测试的 withoutScenario 终态 []。
- **判定**：✅ 门 7（docs 一致性）绿；NOTICES 行数 ↔ manifest ↔ 清单三方一致。
- **证据**：commit `a97187a` + `d676aeb`（keyword-detector 补行随 T16 提交——评审逐文件核实准确）。门 7 **9/9**；三方一致：NOTICES hooks 表 **15 行** ↔ manifest 15 ported id（keyword-detector 补行——T12 交付的署名缺口，T17 发现并修复）、commands 表 **5 行** ↔ 5 ported（ulw-plan 正确不在表内）；21 个 e2eScenario 全部在 SCENARIOS（33）有真实声明；既有条目只增不改（评审 diff 核实）。README 中英 R-7 状态行（R-10 只属 /ulw-execute 拆句——评审更正）；CHANGELOG Phase 4 块（census 23→30/33 scenarios 复算无误）；pitfalls §13 **P-31~P-35**（cordis ctx Proxy throw/inject 完整 UserMessage 且 SDK 无 @throws——实现抛错在 dsh-agent-loop:194/:43 并集检查/jobs.list 空 caller 空转/settle 签名错位/负对照先证存活——全条目带版本锚+行号）。**双评审**：sub-agent REJECT→修复→APPROVE + mcode APPROVE；6 条 findings。**仲裁记录（虚构举证事件）**：编码方曾以 npx 缓存旧版 rc.6 的文件行号反驳评审 MAJOR-1——仲裁逐一直核 installed 0.1.5-rc.1 源码，评审三条全成立、编码方引用全假（inbox.d.ts 不存在），终裁更正并在 §13 全条目加版本锚；编码方认错并自查 P-31/P-33 行号一并修正。withoutScenario 终态 []（无残留豁免）。覆盖清单 §6 H-33 件数口径已对齐（25=24+1 目录外）。
- **依赖**：P4-T16。**量级**：0.5 天（实耗约 0.6 天）。

### [x] P4-T18 — 退出标准核对 + L4 真模型冒烟

- **产出**：退出标准 a/b + DoD c/d/e 逐条取证表（本文件末尾核对表全 ✅）；L4 手工冒烟证据（`.omo/evidence/`，gitignored）与结论回填。
- **做法**：① 全部产出随 T2…T17 逐任务提交后，在已提交快照上复跑 `scripts/ci-local.sh` 全 8 门；② L4 真 key 手工 run（`scripts/smoke-real.mjs` 体例）：真实敲 `/handoff`、`/ulw-execute`、prompt 带 `ulw` 关键词——断言命令事件链、模板注入、atlas 激活（marker 路径）、ultrawork banner 在真实模型链路出现；③ 核对表逐条 ✅/❌ + 证据指针。
- **判定**：✅ 8/8 门绿；L4 三场景各达到"真实链路可达"判定（机制正确性已由 mock e2e 钉死，L4 证明可达性——Phase 3 T21 注记口径）；核对表全 ✅。
- **证据**：① 已提交快照（`a97187a` + S-12 批次 `307e983`）复跑 **8/8 PASS**（日志 `.omo/evidence/p4t18-final-gates{,-v2}.log`：门 2 = **1355 测试**、门 3 = **33 场景 0 FAIL**、门 5 = checked=56、门 6 = **30 断言**、门 8 = **7 proofs**、realDshUntouched=true）。② **L4 三腿全达"真实链路可达"**（`.omo/evidence/p4t18/l4-real-model.md` + `l4-session.jsonl` + `l4-boot.log` + 准入应答两件）：`/handoff`（准入 success + 真实模型 6524 字符 HANDOFF CONTEXT 格式遵循 + completed）；`/ulw-execute alpha`（双层 marker 抵达 + 模型启动 Atlas work session + goal 注册 + 委派面沙箱 seed 差异如实上报后按名册规则兜底完成，completed）；`ulw` prompt（**ULTRAWORK MODE ENABLED! 横幅真实出现** + `<ultrawork-mode>` 标签 + completed）。**L4 捕获真实缺陷**：命令模板（v5 改名后帧头含 `ulw` token）自触发 keyword-detector——上游检测面（原始输入行 slash 剥离）永不自触发；已修为 S-12（commit `307e983`，双评审 APPROVE），并派生 T11/T13 双层 e2e 对照。③ 核对表 a–e 全 ✅（下表）。
- **依赖**：P4-T17。**量级**：0.5 天（实耗约 1 天，含 S-12 三轮修复）。

---

## PR #10 评审仲裁与修复（2026-10-01，18 任务清单之外的追加轮）

**触发**：PR #10 推送后收到两条独立评审——评审 A（第二评审员：3 阻塞 + 5 建议，Request changes）与评审 B（文档漂移专项：4 MAJOR + 11 MINOR）。仲裁者对全部 19 条主张逐条亲核本机 DSH 0.1.5-rc.1 源码与本仓代码，**裁定全部成立（无一误报）**。裁决书全文：`.omo/evidence/pr10-review-arbitration.md`。

**关键行为变化（经双评审后落地）**：
1. **keyword-detector 身份面重构（A-1/A-2）**：⑥b 子会话判定从 `subagent/descriptor` 事件改读 `session.header.origin === 'subagent'`（创建期写入、无时序窗、不可变）；descriptor 只在子会话上读且缓存只存 `found:true`（消除「首步 descriptor 未落盘 + found:false 被永久记忆」的缓存毒化）；`origin=subagent` 且（descriptor 缺席或 mode==='one-shot'）→ 具名 reason `subagent-identity-undecidable` **保守整跳**。**收窄登记**：上游「前台（one-shot）子会话放行 ultrawork/combo」的 lane 在 DSH 关闭（one-shot 的 persona 结构性不可持久化，descriptor.js:37/150-157；planner 席位不被污染是更上位意图）；主部署形态不受影响（concerto 委派默认 continuable 本就被 ⑥a 整跳；atlas 的 ultrawork 武装走 H-32 自有注入面）。
2. **删 session-one-shot 会话闸（A-5）**：T12 任务书「session 级一次性 Set」要求的必要性理由（「同一条 ulw 消息触发本会话每个 pre-step」）被 inbox `claim` 破坏性语义证伪（一条消息只在一批可见，dsh-agent-loop:104-111/889-900）；上游会话闸只在 default-mode 分支（hook.ts:120-121），关键词路径无闸。**删闸对齐上游**，同会话二次武装恢复；e2e control ④ 随之反转为「同会话二次武装」实证（真机：`splice₂ 29 · prompt₂ 31 · claim₂ 38`，新增具名检查 `reArmSplicePrecedesItsOwnPrompt` 固化该时序）。消息级幂等逐字保留。
3. **批次逐条判定（A-7）**：`payload.messages` = claim 当批（可含多条 user 消息），逐条判定、②/③ 不连坐、hits 按 type 去重合并 + 跨条组合抑制——修复「ulw 做 X + 顺便做 Y 同批时只判末条」的漏武装。
4. **组合模式补挂 ultrawork 载体注记（A-4）**：`buildHyperplanUltraworkMessage` 在 banner 与 vendor 正文之间前置 `ULTRAWORK_CARRIER_NOTE`（同一常量，两侧一致性纪律入注释）；新建 `tests/omo-hooks/combo-carrier-note.test.ts`（4 例）。
5. **诊断行 label 剥控制字符（A-8）**：`sanitizeDiagnosticLabel`（C0/DEL 剥离 + U+009B 可见化）。
6. **c22 新门（A-3/B-MAJOR-2 的机制修补）**：覆盖基线 §1.1/§1.2/§2/§3 状态列终态性**负向**检查（10 个前瞻标记，29 格），门 6 总数 30→31；变异自证正反跑齐全。范围自洽性（Phase 3 基线已结项不在本门、c14 双向覆盖已兜住翻转回退）经普查后在注释登记。
7. **文档漂移清零**：覆盖基线 §2/§3 19 行状态列翻终态（A-3/B-MAJOR-2——T17「全部条目翻终态」声明的执行缺口，本行 T17 产出栏已更正）；README 双语免责块收窄到只覆盖 Team Mode（B-MAJOR-1）；7 处启动普查注释改「不变量 + 派生点指针」句式（B-MAJOR-3 + 编码方普查发现的 3 处同源，含两处已是错值的 `manifest 14 entries`）；plan.md:76 同步网区块全数值/行号更新（B-MAJOR-4，**且在 c22 插入推移 +59 行后二次修正**——评审 B MAJOR-1）；m1-m11 单行漂移全修。

**双评审记录**：评审 A（sub-agent）**APPROVE**（0 BLOCKER/0 MAJOR/5 MINOR——S-5 位序登记写反、7 处末节指针、Q-6 行双幂等残留、宿主引用错文件/错标签、drive.mjs 死变量；全部亲核成立并修复）；评审 B（mcode）**REQUEST CHANGES**（1 MAJOR：plan.md:76 行号锚点被 c22 插入推移 +59 行未同步——仲裁者自身失误，已修；2 MINOR：c22 范围自洽注释已补、`index.ts:564` 消歧已修）→ 修复后针对性再审确认。评审 B 独立复现了 c22 变异自证与四条宿主硬事实。

**遗留登记**：① H-32（ulw-execute）对 one-shot atlas 委派同样受 descriptor 时序窗影响（identity.ts 已登记边界的时序加重）——本轮不改行为（修判定面属 Phase 3 已评审设计）；② c20 扫描面未覆盖 templates/omo-hooks 运行时字符串（两处保留字面量有意且有测试钉住）；③ c22 变异自证的影子文件方案（给门加可选 baseline 路径参数，消除对 docs/ 的临时写竞态）——编码方建议，本轮不实施（行为变更），Phase 5/6 候选；④ `sanitizeDiagnosticLabel` 不处理 C1 区其余字符（U+0080–U+009A/U+009C–U+009F）——注释已如实登记范围，接受现状。

---

## 退出标准核对表（T18 填写）

| # | 标准 | 证据 | 状态 |
|---|---|---|---|
| a | 每条命令在脚本化场景中驱动预期 agent 行为 | 门 3 = **33/33 PASS**（已提交快照复跑，`realDshUntouched: true`）。逐命令场景：`handoff-summary-driven`（18 断言）· `remove-ai-slops-driven`（18）· `stop-continuation-halts-todo`（30）· `ulw-execute-command-activates-atlas`（25）· `hyperplan-degraded-noted`（28）· `ulw-plan-loads-prometheus-skill`（17，手势桥零命令事件对照）· `skills-catalog-visible`（13）· 关键词四场景（21/15/17/24）；每场景含对照断言（未知命令零事件回落 / stop 前续行 stop 后停续 / 二次注入幂等〈307e983 快照口径；PR #10 修复轮已反转为「同会话二次武装」实证，见『PR #10 评审仲裁与修复』节〉 / 无 marker 无意图不激活 / 手势 vs 命令反向注册事实）+ 缺陷各命中具名检查。L4：`/handoff`、`/ulw-execute`、`ulw` 三腿真实模型链路可达（`.omo/evidence/p4t18/l4-real-model.md`） | ✅ |
| b | skill 加载原样复用 `dsh-skill` | `skills-catalog-visible` 场景 13 断言：19 裸名 catalog 恰可见（无 `shared/` 前缀、`ulw-execute` 在 `start-work` 不在）+ `skill` 工具经 `ctx.skills.get` 原生面返回正文（与 vendor 文件**逐字全文比对**）+ 未 vendor 名拒 + 引用文件经 `path` 可读；**对 `dsh-skill*` 包零 patch**（门 6 c19 静态锚三腿：文件名/目录名/包名匹配）+ c16 署名头覆盖 + c17/c18 manifest 一致性；手势桥经 dsh-tool-skill 原生面（`/ulw-plan` 场景注入 source `kind:"skill-invocation"`） | ✅ |
| c | 8 门全绿（只加严不放松） | 已提交快照（`307e983`）复跑 `scripts/ci-local.sh` **8/8 PASS**（`.omo/evidence/p4t18-final-gates-v2.log`）：门 1 typecheck · 门 2 **1355 单测**（基线 976→1355，增量全部具名）· 门 3 **33 e2e**（22→33）· 门 4 doctor-lite（3 insert 行）· 门 5 `checked=56`（54→56，两条新增均有条目）· 门 6 **30 静态断言**（23→30，c15–c21 新增）· 门 7 docs 9/9 · 门 8 **7 proofs**（6→7）；全链变异自证（各任务 findings 反跑记录） | ✅ |
| d | 文档与实测无冲突 | P4-T1 回填（Q-1…Q-7 逐字引用闭环，`6bb115e`）+ 实施期更正全部落文档：templates/ 计数 11→14（`8ef02e1`）、keyword-detector 24+1 件数（`84559d5`）、PRE-2 仲裁记录（v4.19.4 基线维持）、T5/T8/T12/T15 任务书按 Q-3/Q-4/Q-5 裁定改写、C-01…C-08/H-33/H-34 终态逐行翻转（c14 双侧同步）、§6 统计自洽（H-33 25=24+1 对齐）、S-12 注记（帧头 token 成因） | ✅ |
| e | 署名完整、verify-licenses 计数有对应 | `THIRD_PARTY_NOTICES.md` 只增不改（评审 diff 核实）：Phase 4 skills vendoring 小节（291 行逐文件 = manifest files[] = 磁盘）+ omo-commands 语义移植表（5 ported 命令/14 派生文件）+ omo-hooks 表 15 行（keyword-detector 补行，T12 缺口 T17 修复）+ guard 行（fork ii 登记）；`verify-licenses` **checked=56 violations=0**（54→56 = shared-skills + omo-commands，各有 license 字段条目）；`VENDOR-MANIFEST.json` 291 条目（290 条 sha256 + 1 条自引用 `sha256: null`——文件不能哈希自身，manifest 已注明）+ deviations 14（改名 40 处 token 双向锚）+ 漂移检测 `checked=320 violations=0`；c16 署名头两群体门（ported 三联 + native 声明 + upstreamSources 交叉核对） | ✅ |
