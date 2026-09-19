# Phase 3 任务清单

> **上游依据**：[开发计划书](./phase3-plan.md) · [hook 清单与覆盖基线](./phase3-hooks.md) · [ROADMAP Phase 3](../../roadmap_zh-CN.md) · [决策 D14](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 3 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，覆盖基线给出"每模块的处置"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：📋 **8/21 完成**（PRE-1…PRE-5 ✅ 2026-09-19；P3-T1 ✅ 2026-09-19 调研回填与仲裁闭环；WP-4 整组取消、P3-T8/T18 取消——P3-T1 仲裁修正，见各任务行）。`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）· ~~删除线~~ = 仲裁取消。
>
> **修订记录**：2026-09-19 P3-T1 仲裁——移植组 32→15（WP-4 取消、P3-T8 取消、WP-6 缩为 T14…T17 四批 + ulw-execute），全部更正有 `.omo/evidence/p3t1-*` 证据；计划书 §4/§6/§7 与覆盖基线同步回填。2026-09-19 WP-2 开工仲裁——H-01 改判跳过（DSH 原生超集，S-46），P3-T4 取消，移植组 15→14，B 模式打样移至 T16。
>
> **编号**：`P3-T<n>`（Phase 3 - Task n）。工作包归属见计划书 §7。

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1 | 上游 OMO v4.19.4 可取到源码 | `git -C <omo> rev-parse v4.19.4^{commit}` 返回 `b072d279110bdda2c6ac2525d0d24dc54d16148a` | ✅ 2026-09-19 实测：返回值与锚点逐字一致 |
| PRE-2 | v5.0.0 正式版**未**发布 → tag 选择闭合为 v4.19.4（D14 规则 3） | `npm view oh-my-openagent dist-tags --json` 的 `latest` 仍为 `4.19.4` | ✅ 2026-09-19 实测：`latest=4.19.4`（`beta=5.0.0-beta.78`，非正式版） |
| PRE-3 | 基线绿：`scripts/ci-local.sh` 8 门全绿 | 退出 0；记录基线（门 2 测试数、门 3 场景数、门 5 `checked`、门 6 断言数） | ✅ 2026-09-19 实测：8/8 门 PASS 退出 0；门 2 = **433 单测**；门 3 = **7 场景**；门 5 `checked=52`；门 6 = 19/19；门 8 = 3/3 proofs |
| PRE-4 | installed dsh = pin 的 0.1.5-rc.1 | `dsh --version`；doctor-lite 基线 PASS | ✅ 2026-09-19 实测：`0.1.5-rc.1`；基线 8 门绿含门 4 doctor-lite |
| PRE-5 | 本地 OMO 检出只读可用 | `git -C ~/GithubRepo/oh-my-openagent ls-tree v4.19.4 packages/omo-opencode/src/hooks/` 非空；全程只用 `git show/ls-tree`，工作树不动 | ✅ 2026-09-19 实测：ls-tree 返回完整 hooks/ 树（101 条目）；调研全程只读（R2 报告注记：检出的 2 个 ` M` 文件系 2026-08-17 既存 CRLF 漂移，非本次所为） |

---

## WP-0 调研核对（计划书 §3/§4.3/§4.4/§4.6，覆盖基线 §4）

### [x] P3-T1 — 全量 hook 清单 + DSH 事件面逐件复核

- **产出**：回填后的 [hook 清单与覆盖基线](./phase3-hooks.md)（§4 待核清单 A/B/C 三组全部 🔍 转 ✅ 或更正）。
- **做法**：
  1. **清单完整性**（A 组）：`git ls-tree -r v4.19.4 packages/omo-opencode/src/hooks/` 为唯一权威，逐条核对基线三节无漏列；§1.2 未列而树中实有的模块逐一定性（补登记或更正分组，DoD-d）。
  2. **DSH 机制**（B 组，计划书 Q-1/2/3/5）：读 installed dsh lib 逐字引用核实——① `tools/pre-execute` / `tools/post-execute` 的决策词汇表（deny/block/replace/add-context 各 kind 与字段）与 listener throw 的 fail-open/closed 语义（R-2/R-9）；② `agent/turn-stopping` 投票协议与多 listener 合成（Q-2）；③ `ctx.compaction` 可挂事件（Q-3）；④ `dsh-agent-instructions` 是否原生覆盖 AGENTS.md 注入、`comment-checker-core` 等 core 包 brain 的 vendor 例外判定（Q-5）。
  3. **逐模块语义**（C 组）：移植组 32 模块逐个 `git show v4.19.4:<path>` 读实现，复核基线的"语义摘要/模式"列；上游有测试文件的登记其用例数（R-3 单测种子）；start-work 20 文件按"hook 语义 / 命令面胶水"逐文件划分（计划书 §4.5）。
  4. **warn-only 降级判定**：若 ① 证实 deny 决策形态不存在，P0 护栏降级 C 模式（warning）——**显式记入基线与踩坑**（R-2 的语义降级纪律）。
- **判定**：✅ 基线 §4 A/B/C 三组全部闭环；移植组模块数从草案转实测（估算按此修正，计划书 §7 回填）；证据进 `.omo/evidence/`。
- **证据**：2026-09-19 完成（5 个并行调研 sub-agent：deepseek-flash；R1/R3 首轮攒写丢失后按"骨架先行 + 增量回填"纪律重试成功——此教训记入委托 prompt 纪律）。① **A 组**：全树对账 = 101 条目/745 文件，清单漏列 3 目录/118 文件（`runtime-fallback` 59 / `rules-injector` 41 / `read-image-resizer` 18）已补登 S-28/29/30，8 处计数更正、S-05 理由更正；证据 `p3t1-tree-reconciliation.md`（裁定：修好后清单完整）。② **B 组**：Q-1 pre = allow/deny/ask（**无 advisory 形态**、参数 deepFreeze 禁改写）/ post = accept×2/block + additionalContexts / throw 全 fail-closed（限该次调用/该回合）；Q-2 turn-stopping = `agent.steer()` 副作用非投票（dsh-hooks-claude-code:292-307 先例）；Q-3 compaction 无 cordis 事件 + todo/write 非表面事件；Q-4 事件名映射（无 session.idle/error）；Q-5/Q-6 AGENTS.md 注入 DSH 原生覆盖、comment-checker core vendor 拿不到能力；证据 `p3t1-dsh-mechanisms.md`（含自检复核记录），仲裁抽核 6 处承重引用全部属实（PreToolDecision 联合 :419-427、deny 物化 :3127、turn-stopping :967、steer :792-794、todo/write :28、PostToolDecision :432-443）。③ **C 组**：移植组全部模块逐文件复核，模式更正 11 处；start-work 划分 = **20:0 全 Phase 3 侧**（命令面在 hooks/ 之外）；跳过组抽核 7 项（S-26/27 改判 DSH 原生等）；证据 `p3t1-upstream-p0-p3.md`（15 处草案更正 + 8 不确定项）/ `p3t1-upstream-p4ab.md` / `p3t1-upstream-p4cd.md`（17 处更正）/ `p3t1-startwork-split.md` / `p3t1-skip-verification.md`。④ **warn-only 降级判定**：deny 形态存在，**不触发降级**；但模式 C 机制前提被推翻（pre-execute 无 advisory）→ C 改落 post-execute `accept+additionalContexts`，已写进计划书 §4.2（DoD-d）。⑤ **仲裁修正回填**：移植组 32→15、WP-4 取消、P3-T8/T18 取消、WP-6 重排为 T14…T17；计划书/覆盖基线/本任务书同步更正。
- **依赖**：PRE-1…PRE-5。**量级**：1 天。

---

## WP-1 插件骨架（计划书 §4.1）

### [x] P3-T2 — `omo-hooks` 包骨架 + `manifest.ts` 单一事实源

- **产出**：`patches/omo-dsh/omo-hooks/`（`package.json` `@oh-my-opendsh/omo-hooks` / `tsconfig.host.json` / `src/index.ts` 空 apply / `src/manifest.ts`）。
- **做法**：布局镜像 omo-agents（host-only、Node 24 type-stripping、`.ts` 扩展 load-bearing 注释）；`manifest.ts` 按计划书 §4.1 声明条目形状（`id` / 上游源路径逐文件 / 目标事件 / 模式 A–F / 效果摘要 / e2e 场景名 / 状态），先放 P0 两条目占位；派生函数（按事件分组、按状态过滤）供 boot marker 与一致性测试消费。
- **判定**：✅ `pnpm typecheck` 绿；manifest 条目形状单测（空字段 throw、模式枚举合法、事件名在六模式集合内）。
- **证据**：2026-09-19 完成（编码 sub-agent deepseek-flash：1 首轮 + 2 修复轮）。产出：package.json 11 行 / tsconfig.host.json 30 行 / src/index.ts 71 行 / src/manifest.ts 648 行（15 条目——P3-T1 实测后扩自"P0 两条目占位"，覆盖基线 §1 全部移植模块 + validateManifest 9 检查 + hooksByEvent/hooksByStatus 派生）/ tests/omo-hooks/manifest.test.ts 25 用例 / 根 package.json 增 typecheck:hooks 并接入 typecheck:libs 链。**双评审**：Kimi 轮1 REJECT（1 MAJOR：H-16 upstreamTestFiles 漏登 tool-output-truncator.test.ts 且注释误称"无测试"——仲裁属实）+ mcode 轮1 APPROVE → 修复轮1（M-1 + 2 处注释失真）→ Kimi 轮2 APPROVE（4 项非阻塞 NIT——仲裁全部采纳）+ mcode 轮2 APPROVE → 修复轮2 → **Kimi 轮3 APPROVE + mcode 轮3 APPROVE**（"无 P0/P1/P2 级别实质缺陷"）。门：typecheck 0、typecheck:hooks 0、vitest tests/omo-hooks 25/25（首轮 MAJOR 位点已入变异敏感网）、全量 vitest 458。**编码 agent 对任务书的质疑（仲裁记录）**：① H-16 的 shared/ 支撑文件记账口径 → 留 T14 裁定（import 闭包 7 实现文件已注记）；② e2e 场景名体例 → 采纳统一派生，改名时按单向同步纪律先改覆盖清单；③ status 词汇表中英映射 → 留 T20 一致性门定义。
- **依赖**：P3-T1。**量级**：3 小时。

### [x] P3-T3 — 挂载 + boot marker 接线

- **产出**：根 `cordis.yml` 第二个 `- insert:` 行（`id: omo-hooks`）；`src/index.ts` 的 apply 注册循环 + boot marker（`[omo-hooks] hook <id> registered on <event>` 逐行 + 汇总行）；cold-start / doctor-lite / probe 的 omo-hooks 接线。
- **做法**：P-8 schema 纪律（insert 形态、`name` 从 profile 解析、`dsh plugin --profile add`）；loud-but-non-fatal（单 hook 注册失败不拖垮其余，P2-T16 先例）；marker 格式稳定（probe 断言锚点）；doctor-lite 增双 insert 行断言；probe 增 boot marker 断言（~~占位期 = P0 两条目~~ **仲裁修正（2026-09-19）**：占位期口径过时——P3-T1 后 manifest 已满 15 条目，改为"实现注册表 HOOK_REGISTRARS 为空 + 汇总行计数从 manifest 派生"，T4+ 逐 hook 填入注册表）。
- **判定**：✅ `scripts/cold-start.sh` 绿且日志含 omo-hooks marker；门 4/8 绿；`--dump-config` 含 omo-hooks 行。
- **证据**：2026-09-19 完成（deepseek-flash，1 首轮 + 1 修复轮）。产出：cordis.yml 双 insert 行（头部注释更新为双包挂载纪律）+ src/boot-markers.ts（纯函数：汇总行/registered/FAILED/manifest-validation-FAILED 四形态，计数派生自 manifest 1/3/8/1/2/0）+ index.ts apply（validateManifest → 汇总行 → HOOK_REGISTRARS 循环 per-hook try/catch）+ registration.test.ts 20 用例 + cordis-inserts.test.ts + cold-start.sh 双安装双断言 + doctor-lite 新增 check 2b（恰好 2 insert 行且 id 集合 == {omo-agents, omo-hooks}）+ drive.mjs 双插件安装 + probe/smoke-real 同步。**双评审**：Kimi 轮1 **REJECT（1 MAJOR：ctx.effect 转发 disposer 语义反转——\`ctx.effect(() => { disposer() })\` 注册时立即拆除且返回 undefined 致 Fiber stop 无 disposal）** + mcode 轮1 APPROVE（漏掉该潜伏缺陷——HOOK_REGISTRARS 为空故运行时不触发，双评审互补价值兑现）→ 仲裁核实 cordis _execute :1134-1142（execute **返回值**被 collect 为 disposal），Kimi finding 成立 → 修复轮（\`ctx.effect(() => disposer)\` + fake ctx 改建模真实 cordis + 断言更正 + 变异验证：回退错误形态新用例如期 FAIL）→ **Kimi 轮2 APPROVE + mcode 轮2 APPROVE**。门：仲裁独立复跑 ci-local **8/8 绿**、vitest tests/omo-hooks 45/45、cold-start 双 loaded marker。**编码 agent 注记**：事件计数 15=1/3/8/1/2/0 的变异敏感网——T4–T17 调整条目 event 须同 commit 更新 EXPECTED_SUMMARY_LINE。
- **依赖**：P3-T2。**量级**：3 小时。

---

## WP-2 P0 文件护栏（计划书 §4.3；C 模式打样——B 打样移至 T16）

### ~~P3-T4~~ — 取消（2026-09-19 WP-2 开工仲裁：H-01 改判跳过 DSH 原生覆盖且为超集）

- **取消理由**：`dsh-fs-observation-policy` 已在 base composition 挂载（dsh-base/cordis.patch.yml:257-258）并被 dsh-tool-fs 经 `fs/write-intent`/`fs/edit-intent` 消费（lib:650/:801）——原生实现"覆写未读文件拒绝"（`createIfAbsent` no-clobber）+ 版本 CAS 过期检测 `FS_STALE_VERSION`（OMO 无等价，严格更强）+ 缺失读取授权 guarded-create + session keyed WeakMap。OMO 残余语义均无移植价值：一次性票据（弱于 CAS）、`.omo/**` 豁免（OMO 专属路径）、`overwrite` 参数剥离（OMO write 工具参数，DSH 无）。证据：dsh-fs-observation-policy/README.md + lib/index.js:50-68。ROADMAP 关键约束（DSH 原生覆盖 → 不翻译）与 P0 防护目标（"防止覆写未读事故"）同时满足——目标已由原生交付。覆盖基线 H-01 → S-46。

### [ ] P3-T5 — 移植 `bash-file-read-guard`（C 模式打样）+ manifest 剔除 H-01

### [x] P3-T5 — 移植 `bash-file-read-guard`（C 模式打样）+ manifest 剔除 H-01

- **产出**：`src/hooks/bash-file-read-guard.ts`（署名头：上游 `bash-file-read-guard.ts` 逐字标注 + "语义移植"声明）+ 单测；`src/manifest.ts` 剔除 H-01 条目（14 条目）并同步全部变异敏感网。
- **做法**：① 上游语义 = 劝导非阻断；DSH 落点 = `tools/post-execute` 返回 `{kind:'accept', additionalContexts:[劝导 UserMessage]}`（P3-T1 模式 C 更正：pre-execute 无 advisory 形态）；正则三模式（cat/head/tail 简单读取）逐字复核上游后移植（`git show v4.19.4:packages/omo-opencode/src/hooks/bash-file-read-guard.ts`）；管道/重定向/带选项变体的边界用例与上游对齐；注册函数填入 HOOK_REGISTRARS（T3 扩展点）；listener 体自包 try/catch、异常时 `return next()`（纪律②——post-execute throw 会吃掉整次成功结果，R-9）。② manifest 剔除 H-01（write-existing-file-guard 改判 S-46，DSH 原生覆盖）——同步：条目数 15→14、manifest.test.ts 硬编码 id 集合与计数、registration.test.ts 的 EXPECTED_SUMMARY_LINE 事件计数（pre-execute 3→2）、其他引用 H-01 的断言/注释。
- **判定**：✅ 单测覆盖上游全部模式 + 负例（`cat file | grep` 不触发、`cat -n` 不触发——以上游正则逐字复核为准）+ additionalContexts 内容契约 + 非 bash 工具不受影响 + listener 异常吞没且结果不变；`pnpm typecheck` 与 `pnpm vitest run` 全绿。
- **证据**：2026-09-19 完成（deepseek-flash，1 首轮 + 1 修复轮）。产出：src/hooks/bash-file-read-guard.ts（首个真实 listener——三条 FILE_READ_PATTERNS 与判定函数**逐字移植**上游，劝导文案语义移植：删 hash anchors 半句并注记理由（DSH read 无 hashline 锚、Phase 6 决策）；C 模式落 tools/post-execute `{kind:'accept', additionalContexts:[UserMessage]}`，UserMessage 形态镜像 hard-blocks 先例；负例含裸 cat/多操作数/管道/重定向/带选项）+ 13 新单测（omo-hooks 计 58）+ HOOK_REGISTRARS 首项填入 + manifest 14 条目（H-01 剔除，残留仅合理注记）+ 变异敏感网同步（EXPECTED_HOOK_COUNT 15→14、EXPECTED_SUMMARY_LINE pre-execute 3→2、注册项 0→1 现实）。bash 工具名实测：`dsh-tool-bash/lib/index.js:260` 与 `dsh-tool-bash-persistent/lib/index.js:330` 均 `name: "bash"`。**双评审**：Kimi 轮1 **APPROVE**（3 MINOR 注释级）+ mcode 轮1 **1 项 P2**（probe 只断摘要行未断 registered 行——HOOK_REGISTRARS 漂回空对象时 probe 不红的锚点缺口，仲裁采纳）→ 修复轮（probe 追加 registered 行硬断言、期望串从 boot-markers.ts 同源派生 + 负例注释对齐；反跑验证新断言非真空）→ **Kimi 轮2 APPROVE + mcode 轮2 APPROVE**。门：仲裁独立复跑 ci-local **8/8 绿**、typecheck 0、vitest 58/58、probe 实跑 exit 0。**仲裁记录**：① 编码 agent 顺手同步 3 处脚本注释 15→14 → 接受（与剔除一致的注释级）；② Kimi 问"C 模式短路效应"（触发时不调 next()，后续 post-execute listener 对该次调用被跳过）→ 登记设计注记：T7+ D 模式 hook 均不作用于成功 cat 结果，碰撞面为零，无需链式合并；③ H-02 的 manifest status 待 T6 e2e 后翻转（纪律保持）。
- **依赖**：P3-T3。**量级**：3 小时。

### [x] P3-T6 — e2e：文件护栏场景（C 模式 e2e 打样）

- **产出**：`tests/e2e/` 新增 `bash-read-guard-warned` 场景（C 模式 e2e 打样，后续批次复用其夹具；~~write-guard-denied~~ 随 H-01 取消，B 模式 e2e 打样移至 T16）。
- **做法**：mock 剧本（tool_calls 通道，P2-T18）让 agent 发 `cat <file>` bash → 断言：命令真实执行（结果在场）+ session log 下一请求含劝导 additionalContexts 注入（劝导语义）；对照组：`cat file | grep x` 不触发、`read` 工具调用不触发。
- **判定**：✅ 门 3 绿；verdict JSON 含场景断言明细（含对照组）。
- **证据**：2026-09-19 完成（deepseek-flash，1 首轮 + 1 修复轮）。产出：drive.mjs +534/-4——bash-read-guard-warned 场景（三连发 tool_calls batch：cat 触发 + cat|grep 对照 + read 对照）+ analyzeBashReadGuardWarned（**11 断言**：触发执行 isError 非 true 且 fixture 字节在场、劝导注入恰好 1 次、双对照无注入、bonus seq 叙事）+ 变异 QA 3 条目（no-advisory-injection / advisory-injected-twice / trigger-result-isError 各具名 FAIL）。**观测载体实测定锚**：劝导注入经 `agent/inbox/spliced` 事件可见（seq 17 splice、seq 25 user/message——分析器按事件类型+文本+source 三元组匹配，不硬编码 seq，版本漂移告警有意保留）。**双评审**：Kimi 轮1 **APPROVE**（2 MINOR；独立真跑逐字复现 seq 叙事）+ mcode 轮1 **1 项 P2**（变异 QA 的 isError 突变谓词过度匹配——sentinel 误命中 read 结果且硬编码 callId 覆盖 → 对照连带失败；Kimi 复核证实机理）→ 修复轮（按触发器 callId 定位 + 保留原 toolCallId；实证变异后**恰仅** bashTriggerExecutedWithFixtureBytes 具名失败）→ **Kimi 轮2 APPROVE + mcode 轮2 APPROVE**（轮2 Kimi 误执行 git checkout 回滚但凭字节级副本还原——仲裁独立复核：12 处场景引用在场、self-test 全绿，完整性无损）。门：仲裁独立复跑 ci-local **8/8 绿**、self-test OK（8 场景 fabricated good logs + 全部 defect 各具名 FAIL）、pnpm test:e2e 8/8 场景 PASS（新场景 11/11 断言、realDshUntouched=true）。**夹具注记**：shell 词必须单 token（grep 词含空格曾致 exit 2）；三连发 batch 形态供 T14+ D 模式批次复用（适用性逐批确认）。**仲裁决定**：manifest 的 H-02 status 翻转（'pending'→'ported'）并入 T7 范围随评审落地（T20 将定义词汇表一致性门）。
- **依赖**：P3-T5。**量级**：3 小时。

---

## WP-3 P1 todo/goal 执行器（计划书 §4.3；E/D 模式打样）

### [x] P3-T7 — 移植 `todo-continuation-enforcer` + `empty-task-response-detector`

- **产出**：`src/hooks/todo-continuation-enforcer.ts`（E 模式打样）+ `src/hooks/empty-task-response-detector.ts`（D 模式）+ 单测。
- **做法**：E 模式按 P3-T1 实测实现——"todo 未清"判定后 `agent.steer(createUserMessage(...))` 写入 inbox（`dsh-hooks-claude-code/lib/index.js:292-307` 先例；**返回值无效，必须 steer**）；todo 状态数据源 = `ctx.todo`（DSH 原生，关键约束——其读 API 形状实施时先核，U-4）；**R-8 检查**：与 dsh-goal-round-driver 续行语义的关系逐字记录（重叠处以 DSH 原生为主、本 hook 收窄为补充）；`empty-task-response-detector` 移植**前置**：核实 dsh-tool-subagent 是否已有空结果等价提示（U-7），若有则按 DoD-d 改判跳过并记录。
- **判定**：✅ 单测覆盖：todo 未清 steer 续行 / 已清不 steer / 不 steer 时回合自然关闭（对照）/ 空响应结果纠正；vitest 绿。
- **证据**：2026-09-19 完成（deepseek-flash，1 首轮 + 1 修复轮）。**U-4 闭环（DoD-d 更正）**：DSH **无 `ctx.todo` 服务**——todo 读面 = session todos 投影（dsh-tool-todo `stateOf`，index.d.ts:26-31 逐字、`TodoItem.status` 三态 types.d.ts:24；ROADMAP 的 `ctx.todo` 即指该原生投影，任务书/覆盖基线已同步更正）。**U-7 闭环**：dsh-subagent(:286-296 stopReasonError、:484-487 render) 与 dsh-tool-subagent 无空结果等价纠正 → 前置通过，hook 移植成立。**R-8 闭环**：goal-round-driver 续行触发面（:123-124 谓词逐字 + 四触发面）与本 hook 互补（goal 轮驱动 vs todo 提醒），goals 活跃时经 ctx.get 可选通道跳过 steer、缺席安全。**E 模式实现**：turn-stopping listener 只 steer 不返回；过滤条件（status 非 completed 且非 cancelled）与上游 constants.ts 逐字；续行文案语义移植（constants.ts:7-14）；不移植清单 10 项逐条注记（toast/abort-detection/marker/compaction-guard/pending-question 等——对照 p3t1-upstream-p0-p3 §3）。**D 模式实现**：空结果判定与上游逐字对照；委派工具名集合 = roster.ts DELEGATION_TOOL_NAMES；决策形态 content 替换（注释理由）。**仲裁裁定（Q2）**：熔断器改**进展复员**（原"连续 5 次 steer 永久静默"会误杀长 todo 列表——改为未完成数减少即计数归零，连续 5 次无进展才静默，回归上游 MAX_CONSECUTIVE_FAILURES 的"连续失败"本义；单测 4 类：进展归零/无进展静默/静默后新进展恢复/不回归）。**仲裁记录（Q1）**：上游 skipAgents 按身份排除——本移植有意放宽为"全员可 steer + 熔断 5 兜底"（DSH 无 per-agent hook 配置面，只读子代理留 todo 噪音有界，L4 后再议收窄），已注记。**双评审**：Kimi 轮1 APPROVE（F1-F6 均 MINOR/NIT——F5 变体名属实已修、F6 经复核不成立）+ mcode 轮1 APPROVE → 修复轮（进展复员 + F5 + TODO 锚点 + F1-F3 注释）→ **Kimi 轮2 APPROVE** + mcode 轮2 遇 MiniMax Token Plan 5h 窗口限额（2067）→ **按半小时周期重试（规则④）第 1 次即恢复**：**mcode 轮2 APPROVE（"未发现需要报告的问题"）**。门：仲裁独立复跑 ci-local **8/8 绿**、typecheck 0、vitest 111/111（todo 36 + empty 17 + 既有 58；全量 541）。**修复轮发现并已回填的 DoD-d 冲突**：任务书 P3-T7 行与覆盖基线 H-03 残留的"todo 状态源 = ctx.todo"与 U-4 实测矛盾 → 已更正（本条即证据）。**编码 agent 注记**：熔断 log 行（cap 5）未入 probe 断言——T19 可加。
- **依赖**：P3-T3。**量级**：4 小时。

### ~~P3-T8~~ — 取消（P3-T1 仲裁）

- **取消理由**：原三模块全部移出移植组——`todo-description-override` 实测为 opencode `tool.definition` hook（DSH 无该事件，S-31）；`session-todo-status` 实测为 helper（语义并入 H-10 session-notification，N-04）；`task-reminder` 上游 dead code 且依赖 OMO `task_*` 工具族（S-32）。证据：`.omo/evidence/p3t1-upstream-p0-p3.md` C-7/C-8/C-9。

### [x] P3-T9 — e2e：todo 执行器场景

- **产出**：`tests/e2e/` 新增 `todo-continuation-enforced` 场景（E 模式 e2e 打样）。
- **做法**：剧本构造"todo 未清但回合将停"→ 断言续行发生、todo 被推进至清、回合随后真实停止；对照组：todo 已清时无续行票。
- **判定**：✅ 门 3 绿；verdict JSON 含续行链断言。
- **证据**：2026-09-19 完成（deepseek-flash，1 轮过）。产出：drive.mjs +815/-22——四步剧本（建 todo（1 completed + 1 in_progress）→ 收尾文本 → steer 后推进至全 completed → 总结）+ analyzeTodoContinuationEnforced（steer 注入文案逐字 + 事件序：收尾处无 turn/end → todo 推进 → 才有 turn/end completed + todo/write 内容差 + 对照段"无 steer"活断言四元组：输入非空+全 completed+零注入+零额外步）+ 变异 QA（无 steer / steer 后无推进仍 turn/end 各具名 FAIL）+ requestMessagesContain helper（按 message content 取文本——规避行文本 includes 的 JSON 转义 \n 风险；T6 未顺手改，最小改动纪律）。**双评审**：Kimi 轮1 **APPROVE**（3 NIT：OK 行补列 double-steer、收窄用例 2 变异分支、controlSnapshot 限定 controlEvents——仲裁决定并入 T13 同文件落地）+ mcode 轮1 **APPROVE**（"未发现需要处理的问题"）。门：仲裁独立复跑 ci-local **8/8 绿**、self-test OK（9 场景 fabricated good logs + 全部 defect 各具名 FAIL）、test:e2e 9/9。**仲裁决定（范围缺口）**：H-07（empty-task-response-detector）的 e2e 不在本任务产出内（任务书原文只列 todo-continuation 场景）——其 listener 单测已绿，**e2e 并入 T14**（同 D 模式批，退出标准 a 的覆盖缺口在该任务补齐）。**编码 agent 注记**：① 进展复员熔断 cap 5 的 e2e 成本高（6 个连续无进展边界），保持单测覆盖；② R-8 goals 让位无 e2e（需 armed goal），单测覆盖；③ skipAgents 放宽注记与 T7 一致。
- **依赖**：P3-T7（~~P3-T8~~ 已取消）。**量级**：3 小时。

---

## ~~WP-4 P2 compaction 辅助~~ —— 整组取消（P3-T1 仲裁）

> **取消理由**：`compaction-context-injector`（DSH 语义不适用：无 per-session 配置漂移、无注入接缝）与 `compaction-todo-preserver`（DSH 原生覆盖：`todo/write` 为非表面 log-only 事件，压缩不 shadow）均判跳过（DSH 原生）。证据：`.omo/evidence/p3t1-dsh-mechanisms.md` Q-3.3/Q-3.4、覆盖基线 §1 P2 组。

### ~~P3-T10 / P3-T11~~ — 取消（理由同上）

---

## WP-5 P3 会话通知（计划书 §4.3；R-4 平台收窄）

### [x] P3-T12 — 移植 `session-notification` + `background-notification`

- **产出**：`src/hooks/session-notification.ts`（调度器 + 平台抽象 + **Linux 后端 notify-send（CI 可验载体）**；macOS 后端代码移植、L4 手工验证；Windows 后端不移植 = D9）+ `src/hooks/background-notification.ts` + 单测。
- **做法**：事件源 = P3-T1 实测（完成/错误 = `session/event` 的 `turn/end` + `reason.kind`，注意 `max-tokens` reason 的精度陷阱；idle = `agent/status(status==='idle')`）；调度语义（去抖/完成判定/错误通知）按上游逐文件复核（21 文件 = 16 实现 + 5 测试）；**H-05 helper 语义（`hasIncompleteTodos`/`hasPendingSessionWork` 谓词）并入本模块**（N-04）；`background-notification` 前置：`ctx.jobs` 事件面核实；平台抽象层声明后端接口，Linux 后端 CI 可验，macOS 后端仅 L4（R-4）；跨事件状态以 `ctx.effect` 承载（纪律⑤）。
- **判定**：✅ 单测覆盖调度逻辑 + 两谓词 + Linux 后端命令构造；平台后端抽象注入可替换；vitest 绿。
- **证据**：2026-09-19 完成（deepseek-flash，1 轮过）。产出：session-notification.ts（调度状态机：grace period / version bump / executing 三道闸门 + turn/end reason.kind 完成/错误判定 + max-tokens 精度陷阱处理 + H-05 两谓词并入（上游 session-todo-status.ts:17 的 2-status 谓词语义，数据源 todos 投影 stateOf）+ NotifierBackend 抽象 + **Linux notify-send / macOS osascript 命令构造逐字对照上游 -linux.ts/-macos.ts** + 稳定 log 锚点行）+ background-notification.ts（**ctx.jobs 事件面前置闭环**：push 事件面 + pull 降级查询双路径，standby 与去重；降级路径"list() 无 caller 只见 unowned"覆盖收窄诚实注记）+ 74 新单测（omo-hooks 计 185）。**有意收窄（逐项注记）**：声音四后端不移植（上游默认 playSound:false）；detectExternalNotificationPlugin 不移植（DSH 无 opencode 插件目录）；session 标题/末条消息正文收窄为静态文案 + todo 计数（Session 不暴露标题、回读消息 = 事件路径读盘违纪律④——判定经评审确认成立）。**双评审**：Kimi 轮1 **APPROVE**（3 NIT + 3 质疑）+ mcode 轮1 **APPROVE**（"未发现可报告的缺陷"，逐行复核调度状态机/谓词差异/AppleScript 转义/平台分流/push-pull 双路径）。**仲裁（Kimi 质疑）**：① macOS **osascript 单层即满足 L4 口径**（cmux/terminal-notifier 非系统内置 + `__CFBundleIdentifier` 为 opencode.app 专属，移植反失真）；② question/permission 提示通知**不立项补移植**（DSH 原生审批/ask_user_question UI 已覆盖该语义，原则一）；③ 每顶层会话都通知 = **有意适配**（DSH 多会话模型，去抖按 session）。NIT×3 与 T9 的 NIT×3 一并并入 T13。门：仲裁独立复跑 ci-local **8/8 绿**、typecheck 0、vitest 185/185。**编码 agent 注记**：probe 已自动覆盖 5 行 registered marker；T19 纳入静态门 c 组。
- **依赖**：P3-T3。**量级**：5 小时。

### [ ] P3-T13 — e2e：通知场景

- **产出**：`tests/e2e/` 新增 `session-notification-log` 场景。
- **做法**：剧本跑完一轮含完成/错误的会话 → 断言 log 后端产出通知记录（标题/正文语义与上游契约对齐）；后台通知场景复用 drive 的后台任务机制（如无则记降级）。
- **判定**：✅ 门 3 绿。
- **证据**：（待填）
- **依赖**：P3-T12。**量级**：3 小时。

---

## WP-6 P4/P5 其余模块 + ulw-execute（计划书 §4.3/§4.5；P3-T1 实测重排：9 模块 = 8 P4 + H-32）

### [ ] P3-T14 — 批 A：D 模式 error-recovery + truncator（3 模块 + H-07 e2e 并入）

- **产出**：`src/hooks/`：`edit-error-recovery.ts`、`json-error-recovery.ts`、`tool-output-truncator.ts` + 单测 + e2e。
- **做法**：按 R3 批内排序（edit-error-recovery 58 行零状态 → json-error-recovery → truncator）；**前置**：① DSH `edit`/`write` 工具错误文案逐字核实（错误串表与 19 项排除表能否命中——实施期项）；② truncator 的"剩余 token"输入面核实（dsh-compaction-basic token meter 的暴露面；无暴露面则退化为固定阈值并记差异）；三模块共享 T6 打样的 post-execute 夹具；上游测试用例移植为单测种子（R-3：edit 9 / json 12 / truncator 7+16）。
- **判定**：✅ 每模块单测 + e2e 各 ≥1 场景（触发 + 对照不触发）；门 2/3 绿。
- **证据**：（待填）
- **依赖**：P3-T6（模式夹具）。**量级**：5 小时。

### [ ] P3-T15 — 批 B：D 模式注入/提醒类（3 模块）

- **产出**：`src/hooks/`：`directory-readme-injector.ts`、`agent-usage-reminder.ts`、`task-resume-info.ts` + 单测 + e2e。
- **做法**：`directory-readme-injector`（8 文件）注意与 dsh-agent-instructions 的边界（其候选名 = AGENTS.md/CLAUDE.md，不含 README，无重叠——覆盖基线 H-21）；`task-resume-info` **前置**：复核是否依赖 OMO task 工具族语义，若是则按 DoD-d 改判跳过并记录（覆盖基线 H-23）；注入文本类静态内容 apply 时一次构建（纪律④）。
- **判定**：✅ 每模块单测 + e2e；门 2/3 绿。
- **证据**：（待填）
- **依赖**：P3-T6。**量级**：4 小时。

### [ ] P3-T16 — 批 C：B/D 门类（2 模块）

- **产出**：`src/hooks/`：`webfetch-redirect-guard.ts`（B + D）+ `prometheus-md-only.ts`（B + D）+ 单测 + e2e。
- **做法**：**B 模式在本批打样**（原 T4 打样随 H-01 改判取消）；`webfetch-redirect-guard` 的 deny reason 携带最终 URL 指引（覆盖基线 H-24）；`prometheus-md-only` 的 B 段（非 .md 写 deny，上游 hook.ts:40-62 可 1:1）+ D 段劝导（注入警告段无附言缝 → post-execute 附加，H-26）；pre/post 状态配对用 `exec.callId`/`exec.token` 原生关联（纪律⑤）。
- **判定**：✅ 每模块单测 + e2e（deny 生效 + 对照放行）；门 2/3 绿。
- **证据**：（待填）
- **依赖**：P3-T6（模式夹具）。**量级**：4 小时。

### [ ] P3-T17 — ulw-execute（start-work hook 语义，H-32）

- **产出**：`src/hooks/ulw-execute.ts`（+ 必要的 `ulw-execute/` 子模块）+ 单测 + e2e。
- **做法**：按 P3-T1 的 20:0 划分移植（命令面在 hooks/ 之外，天然 Phase 4）；命名锚点全用 `ulw-execute`；激活目标 = atlas（Phase 2 已就位）；**激活信号以 DSH 原生形态定义**（指挥显式委派/工作计划意图 pre-step 检测）——上游命令模板 marker（`<session-context>` + "You are starting an Atlas work session."）随 Phase 4 模板交付，届时对接（R-10，常量出处 `features/builtin-commands/templates/start-work.ts`）；依赖 boulder-state 的部分（session-plan-affinity 等）记跳过段；脚手架/notepad 存储面用 `ctx.jobs`；`/ulw-execute` 命令引用一律不写（Phase 4）。
- **判定**：✅ 单测覆盖激活检测 + 上下文构建核心路径；e2e 场景展示"工作计划意图 → atlas 激活语义"；门 2/3 绿。
- **证据**：（待填）
- **依赖**：P3-T14…T16（模式全打样后）+ P3-T1（划分）。**量级**：6 小时。

### ~~P3-T18~~ — 取消（P3-T1 仲裁：WP-6 批次由 5 缩为 4，本任务被 T14…T17 吸收）

---

## WP-7 门扩展（计划书 §4.7）

### [ ] P3-T19 — 静态门 / doctor-lite / probe / proofs 全量扩展

- **产出**：`scripts/verify-concerto-static.mjs` c 组扩展（omo-hooks 断言组，延续 c 编号）+ doctor-lite 双行断言 + `concerto-mode-probe.sh` 全量 boot marker + proofs 护栏证明。
- **做法**：c 组新断言：cordis.yml 恰好 2 个 insert 行、omo-hooks 每 `src/hooks/*.ts` 含署名头（上游源标注）、manifest ↔ hooks 文件集合一致、c01–c10 零改动；probe 断言全量 `[omo-hooks] hook … registered` 行 + 汇总行；prove 脚本对 write-guard 做"deny 决策真实生效 + listener 抛错工具不死"的 session 级证明（R-9，prove-explore-toolfilter.mjs 先例）。
- **判定**：✅ 门 4/6/8 绿；新断言逐条列出对比（只加严）。
- **证据**：（待填）
- **依赖**：P3-T17（全 hook 就位）。**量级**：4 小时。

---

## WP-8 收口（计划书 §4.8/§4.9/§5）

### [ ] P3-T20 — 署名与文档 + 覆盖清单终态

- **产出**：`THIRD_PARTY_NOTICES.md` 新增 "Phase 3 hook semantic ports" 小节 + `README*.md` 注记 + `CHANGELOG.md` 条目 + 踩坑登记（如有）+ [覆盖基线](./phase3-hooks.md) §5 统计终态。
- **做法**：NOTICES 逐文件列出移植 listener ↔ 上游源（D15 精神沿用到派生代码）；README 写明"hook 护栏层 ≠ `/ulw-*` 命令面（Phase 4）≠ Team Mode（Phase 5）"（R-7）；manifest ↔ 覆盖清单一致性测试随门 2 常绿；实施期真实踩坑按 P-xx 模板登记。
- **判定**：✅ 门 7 绿；NOTICES 纯插入（git diff 0 删除行）；清单每行终态 + 理由（退出标准 b）。
- **证据**：（待填）
- **依赖**：P3-T19。**量级**：3 小时。

### [ ] P3-T21 — 退出标准核对 + 全门链复跑 + L4

- **产出**：本文件的"退出标准核对表"逐条填证据；L4 手工冒烟记录（`.omo/evidence/`，gitignored，结论回填本行）。
- **做法**：① **先提交**：`git add` + commit 全部 Phase 3 产出（含本计划目录——Phase 2 教训：untracked 快照上的退出证据无可复现对应物）；② 按计划书 §5 的 a/b/c/d/e 逐条取证；`scripts/ci-local.sh` 全 8 门复跑；`verify-licenses --json` 的 `checked` 与基线（52）比对（vendor 例外则核对对应条目）；③ L4：真 key 手工 run，真实触发 2–3 个护栏（如故意覆写未读文件）+ macOS 通知后端（若机器可用）。
- **判定**：✅ 下方核对表全绿。
- **证据**：（待填）
- **依赖**：P3-T20。**量级**：3 小时。

---

## 退出标准核对表（P3-T21 填写）

| # | 标准（计划书 §5） | 证据 | 结论 |
|---|---|---|---|
| a | 每个移植的 hook 有 mock-LLM e2e 展示 DSH 事件 → OMO 语义效果 | （待填：覆盖清单每行"已移植"状态带场景名 + 门 3 全绿 + 对照断言明细） | ☐ |
| b | hook 覆盖清单文档跟踪"已移植/跳过（含理由）" | （待填：phase3-hooks.md 全模块终态 + manifest↔清单一致性测试绿 + 全树无漏列） | ☐ |
| c | 全 8 门绿、门扩展只加严 | （待填：ci-local.sh 复跑 + c 组新断言清单对比） | ☐ |
| d | 文档与实测无冲突 | （待填：P3-T1 回填 + 实施期 DoD-d 更正逐条记录） | ☐ |
| e | 署名只增不改、`checked` 计数不变（52）或有对应 vendor 条目 | （待填：NOTICES git diff + verify-licenses --json 比对） | ☐ |
