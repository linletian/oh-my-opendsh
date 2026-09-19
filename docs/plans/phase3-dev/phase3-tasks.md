# Phase 3 任务清单

> **上游依据**：[开发计划书](./phase3-plan.md) · [hook 清单与覆盖基线](./phase3-hooks.md) · [ROADMAP Phase 3](../../roadmap_zh-CN.md) · [决策 D14](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 3 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，覆盖基线给出"每模块的处置"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：📋 **0/21 完成**（计划已立项，待实施）。`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）。
>
> **编号**：`P3-T<n>`（Phase 3 - Task n）。工作包归属见计划书 §7。

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1 | 上游 OMO v4.19.4 可取到源码 | `git -C <omo> rev-parse v4.19.4^{commit}` 返回 `b072d279110bdda2c6ac2525d0d24dc54d16148a` | ☐ |
| PRE-2 | v5.0.0 正式版**未**发布 → tag 选择闭合为 v4.19.4（D14 规则 3） | `npm view oh-my-openagent dist-tags --json` 的 `latest` 仍为 `4.19.4` | ☐ |
| PRE-3 | 基线绿：`scripts/ci-local.sh` 8 门全绿 | 退出 0；记录基线（门 2 测试数、门 3 场景数、门 5 `checked`、门 6 断言数） | ☐ |
| PRE-4 | installed dsh = pin 的 0.1.5-rc.1 | `dsh --version`；doctor-lite 基线 PASS | ☐ |
| PRE-5 | 本地 OMO 检出只读可用 | `git -C ~/GithubRepo/oh-my-openagent ls-tree v4.19.4 packages/omo-opencode/src/hooks/` 非空；全程只用 `git show/ls-tree`，工作树不动 | ☐ |

---

## WP-0 调研核对（计划书 §3/§4.3/§4.4/§4.6，覆盖基线 §4）

### [ ] P3-T1 — 全量 hook 清单 + DSH 事件面逐件复核

- **产出**：回填后的 [hook 清单与覆盖基线](./phase3-hooks.md)（§4 待核清单 A/B/C 三组全部 🔍 转 ✅ 或更正）。
- **做法**：
  1. **清单完整性**（A 组）：`git ls-tree -r v4.19.4 packages/omo-opencode/src/hooks/` 为唯一权威，逐条核对基线三节无漏列；§1.2 未列而树中实有的模块逐一定性（补登记或更正分组，DoD-d）。
  2. **DSH 机制**（B 组，计划书 Q-1/2/3/5）：读 installed dsh lib 逐字引用核实——① `tools/pre-execute` / `tools/post-execute` 的决策词汇表（deny/block/replace/add-context 各 kind 与字段）与 listener throw 的 fail-open/closed 语义（R-2/R-9）；② `agent/turn-stopping` 投票协议与多 listener 合成（Q-2）；③ `ctx.compaction` 可挂事件（Q-3）；④ `dsh-agent-instructions` 是否原生覆盖 AGENTS.md 注入、`comment-checker-core` 等 core 包 brain 的 vendor 例外判定（Q-5）。
  3. **逐模块语义**（C 组）：移植组 32 模块逐个 `git show v4.19.4:<path>` 读实现，复核基线的"语义摘要/模式"列；上游有测试文件的登记其用例数（R-3 单测种子）；start-work 20 文件按"hook 语义 / 命令面胶水"逐文件划分（计划书 §4.5）。
  4. **warn-only 降级判定**：若 ① 证实 deny 决策形态不存在，P0 护栏降级 C 模式（warning）——**显式记入基线与踩坑**（R-2 的语义降级纪律）。
- **判定**：✅ 基线 §4 A/B/C 三组全部闭环；移植组模块数从草案转实测（估算按此修正，计划书 §7 回填）；证据进 `.omo/evidence/`。
- **证据**：（待填）
- **依赖**：PRE-1…PRE-5。**量级**：1 天。

---

## WP-1 插件骨架（计划书 §4.1）

### [ ] P3-T2 — `omo-hooks` 包骨架 + `manifest.ts` 单一事实源

- **产出**：`patches/omo-dsh/omo-hooks/`（`package.json` `@oh-my-opendsh/omo-hooks` / `tsconfig.host.json` / `src/index.ts` 空 apply / `src/manifest.ts`）。
- **做法**：布局镜像 omo-agents（host-only、Node 24 type-stripping、`.ts` 扩展 load-bearing 注释）；`manifest.ts` 按计划书 §4.1 声明条目形状（`id` / 上游源路径逐文件 / 目标事件 / 模式 A–F / 效果摘要 / e2e 场景名 / 状态），先放 P0 两条目占位；派生函数（按事件分组、按状态过滤）供 boot marker 与一致性测试消费。
- **判定**：✅ `pnpm typecheck` 绿；manifest 条目形状单测（空字段 throw、模式枚举合法、事件名在六模式集合内）。
- **证据**：（待填）
- **依赖**：P3-T1。**量级**：3 小时。

### [ ] P3-T3 — 挂载 + boot marker 接线

- **产出**：根 `cordis.yml` 第二个 `- insert:` 行（`id: omo-hooks`）；`src/index.ts` 的 apply 注册循环 + boot marker（`[omo-hooks] hook <id> registered on <event>` 逐行 + 汇总行）；cold-start / doctor-lite / probe 的 omo-hooks 接线。
- **做法**：P-8 schema 纪律（insert 形态、`name` 从 profile 解析、`dsh plugin --profile add`）；loud-but-non-fatal（单 hook 注册失败不拖垮其余，P2-T16 先例）；marker 格式稳定（probe 断言锚点）；doctor-lite 增双 insert 行断言；probe 增 boot marker 断言（占位期 = P0 两条目）。
- **判定**：✅ `scripts/cold-start.sh` 绿且日志含 omo-hooks marker；门 4/8 绿；`--dump-config` 含 omo-hooks 行。
- **证据**：（待填）
- **依赖**：P3-T2。**量级**：3 小时。

---

## WP-2 P0 文件护栏（计划书 §4.3；B/C 模式打样）

### [ ] P3-T4 — 移植 `write-existing-file-guard`（B 模式打样）

- **产出**：`src/hooks/write-existing-file-guard.ts`（含署名头：上游 5 文件逐列）+ 单测。
- **做法**：按 P3-T1 核实的决策词汇表实现权威拒绝（覆写未读文件 → deny 决策）；session 级读过集合的状态形态按 T1 结论（`session/event` 观察 read 成功 / listener 闭包 WeakMap——择一并注释理由）；上游测试用例移植为单测种子（R-3）；listener 体 try/catch 自包 + throw 时 fail-open/closed 按 T1 语义显式选择（R-9）。
- **判定**：✅ 单测覆盖：未读拒写 / 读后可写 / 新文件可写 / 非 write 工具不受影响 / listener 异常不击穿管线；`pnpm vitest run` 绿。
- **证据**：（待填）
- **依赖**：P3-T3。**量级**：4 小时。

### [ ] P3-T5 — 移植 `bash-file-read-guard`（C 模式打样）

- **产出**：`src/hooks/bash-file-read-guard.ts`（署名头）+ 单测。
- **做法**：上游语义 = 劝导非阻断（`output.message` 附加 warning）；按 T1 核实的"放行但附加"决策形态实现；正则三模式（cat/head/tail 简单读取）逐字复核后移植；管道/重定向/带选项变体的边界用例与上游对齐。
- **判定**：✅ 单测覆盖上游全部模式 + 负例（`cat file | grep` 不触发、`cat -n` 不触发——以 T1 对上游正则的逐字复核为准）；vitest 绿。
- **证据**：（待填）
- **依赖**：P3-T3。**量级**：2 小时。

### [ ] P3-T6 — e2e：文件护栏双场景

- **产出**：`tests/e2e/` 新增 `write-guard-denied` 与 `bash-read-guard-warned` 场景（B/C 模式的 e2e 打样，后续批次复用其夹具）。
- **做法**：mock 剧本（tool_calls 通道，P2-T18）让 agent ① 对已存在但未读的文件发 write → 断言 deny 决策 + 文件未变 + session log 含护栏效果；对照组：读后 write 放行；② 发 `cat <file>` bash → 断言 warning 附加 + 命令仍执行（劝导语义）。
- **判定**：✅ 门 3 绿；verdict JSON 含双场景断言明细（含对照组）。
- **证据**：（待填）
- **依赖**：P3-T4 + P3-T5。**量级**：4 小时。

---

## WP-3 P1 todo/goal 执行器（计划书 §4.3；E/D 模式打样）

### [ ] P3-T7 — 移植 `todo-continuation-enforcer` + `empty-task-response-detector`

- **产出**：`src/hooks/todo-continuation-enforcer.ts`（E 模式打样）+ `src/hooks/empty-task-response-detector.ts`（A 模式）+ 单测。
- **做法**：E 模式按 T1 核实的 `agent/turn-stopping` 投票协议实现"todo 未清 → 续行票"；**R-8 检查**：与 dsh-goal-round-driver 续行语义的关系逐字记录（重叠处以 DSH 原生为主、本 hook 收窄为补充）；todo 状态数据源 = `ctx.todo`（DSH 原生，关键约束——不读 OMO 存储形态）。
- **判定**：✅ 单测覆盖：todo 未清投票续行 / 已清不投票 / 多 listener 合成（T1 协议）/ 空响应注入纠正；vitest 绿。
- **证据**：（待填）
- **依赖**：P3-T3。**量级**：4 小时。

### [ ] P3-T8 — 移植 `todo-description-override` + `session-todo-status` + `task-reminder`

- **产出**：三个 `src/hooks/*.ts`（D / F / A 模式）+ 单测。
- **做法**：`todo-description-override`（D）：改写 todo 工具输出的触发条件与新文本按上游 4 文件逐字复核；`session-todo-status`（F）：`session/event` 观察 + 状态聚合（H-10 通知调度的数据源，WP-5 复用）；`task-reminder`（A）：注入文本 apply 时一次构建（模式纪律）。
- **判定**：✅ 三模块单测各覆盖 T1 登记的上游用例；vitest 绿。
- **证据**：（待填）
- **依赖**：P3-T3。**量级**：4 小时。

### [ ] P3-T9 — e2e：todo 执行器场景

- **产出**：`tests/e2e/` 新增 `todo-continuation-enforced` 场景（E 模式 e2e 打样）。
- **做法**：剧本构造"todo 未清但回合将停"→ 断言续行发生、todo 被推进至清、回合随后真实停止；对照组：todo 已清时无续行票。
- **判定**：✅ 门 3 绿；verdict JSON 含续行链断言。
- **证据**：（待填）
- **依赖**：P3-T7 + P3-T8。**量级**：3 小时。

---

## WP-4 P2 compaction 辅助（计划书 §4.3）

### [ ] P3-T10 — 移植 `compaction-context-injector` + `compaction-todo-preserver`

- **产出**：两个 `src/hooks/*.ts` + 单测。
- **做法**：挂点 = T1 对 `ctx.compaction` 可挂事件的结论（Q-3）；与 DSH 原生压缩**协作**而非取代（不碰 dsh-compaction 的触发/摘要逻辑，只做 OMO 语义的上下文保全）；若无对应事件，收窄为 session/event 观察 + 注入并记录语义降级。
- **判定**：✅ 单测覆盖两模块核心路径 + 降级路径（如触发）；vitest 绿。
- **证据**：（待填）
- **依赖**：P3-T3。**量级**：3 小时。

### [ ] P3-T11 — e2e：compaction 辅助场景

- **产出**：`tests/e2e/` 新增 compaction 保全场景。
- **做法**：剧本构造长会话触发压缩（沙箱压缩阈值按 T1 结论构造）→ 断言保全内容在压缩后上下文在场；触发不可构造时降级为 listener 级证明并记理由（诚实降级，非跳过）。
- **判定**：✅ 门 3 绿（或降级证明 + 记录）。
- **证据**：（待填）
- **依赖**：P3-T10。**量级**：3 小时。

---

## WP-5 P3 会话通知（计划书 §4.3；R-4 平台收窄）

### [ ] P3-T12 — 移植 `session-notification` + `background-notification`

- **产出**：`src/hooks/session-notification.ts`（调度器 + 平台抽象 + **log 后端**；macOS 后端按 L4 计划，Windows 后端不移植 = D9）+ `src/hooks/background-notification.ts` + 单测。
- **做法**：事件源 = T1/Q-4 结论（`session/event` 类型清单）；调度语义（去抖/完成判定/错误通知）按上游逐文件复核；平台抽象层声明后端接口，log 后端 CI 可验，macOS 后端代码移植但仅 L4 手工验证（R-4）；数据源复用 H-05 状态聚合（如适用）。
- **判定**：✅ 单测覆盖调度逻辑与 log 后端；平台后端的抽象注入可替换；vitest 绿。
- **证据**：（待填）
- **依赖**：P3-T3 + P3-T8（H-05）。**量级**：5 小时。

### [ ] P3-T13 — e2e：通知场景

- **产出**：`tests/e2e/` 新增 `session-notification-log` 场景。
- **做法**：剧本跑完一轮含完成/错误的会话 → 断言 log 后端产出通知记录（标题/正文语义与上游契约对齐）；后台通知场景复用 drive 的后台任务机制（如无则记降级）。
- **判定**：✅ 门 3 绿。
- **证据**：（待填）
- **依赖**：P3-T12。**量级**：3 小时。

---

## WP-6 P4/P5 其余模块 + ulw-execute（计划书 §4.3/§4.5；按模式聚批）

### [ ] P3-T14 — 批 A：D 模式 validator/recovery（4 模块）

- **产出**：`src/hooks/`：`tool-pair-validator.ts`、`plan-format-validator.ts`、`edit-error-recovery.ts`、`json-error-recovery.ts` + 单测 + e2e。
- **做法**：四模块共享 D 模式脚手架（T6 打样的 post-execute 夹具）；`tool-pair-validator`（8 文件）的配对规则表逐字复核上游；上游测试用例移植为单测种子。
- **判定**：✅ 每模块单测 + e2e 各 ≥1 场景（违规触发 + 对照放行）；门 2/3 绿。
- **证据**：（待填）
- **依赖**：P3-T6（模式夹具）。**量级**：5 小时。

### [ ] P3-T15 — 批 B：D 模式 truncator/checker + E stop-guard（4 模块）

- **产出**：`src/hooks/`：`tool-output-truncator.ts`、`question-label-truncator.ts`、`comment-checker.ts`、`stop-continuation-guard.ts` + 单测 + e2e。
- **做法**：`comment-checker` 按 T1/Q-5 裁定（纯 listener / vendor `comment-checker-core` 例外——例外则 Phase 1 全套合规随行）；`stop-continuation-guard` 为 Phase 4 stop-continuation 命令的 listener 半（命令面引用不写）。
- **判定**：✅ 同 T14 口径；若 vendor 例外，`verify-licenses` 与 NOTICES 同步绿。
- **证据**：（待填）
- **依赖**：P3-T6。**量级**：5 小时。

### [ ] P3-T16 — 批 C：A 注入类 + F 观察类（7 模块）

- **产出**：`src/hooks/`：`monitor-status-injector.ts`、`directory-readme-injector.ts`、`agent-usage-reminder.ts`、`task-resume-info.ts`、`sisyphus-junior-notepad.ts`、`unstable-agent-babysitter.ts`、`fsync-skip-warning.ts`（T1 若判平台耦合则移跳过组，本批 -1）+ 单测 + e2e。
- **做法**：A 类注入文本 apply 时一次构建；`monitor-status-injector` 经 `agent/status` 观察 → 注入（模式内组合，注释说明）；`sisyphus-junior-notepad` 的存储面用 `ctx.jobs`（§1.2 映射，DSH 原生）。
- **判定**：✅ 每模块单测 + e2e；门 2/3 绿。
- **证据**：（待填）
- **依赖**：P3-T6。**量级**：6 小时。

### [ ] P3-T17 — 批 D：B/C 门类 + atlas（5 模块）

- **产出**：`src/hooks/`：`webfetch-redirect-guard.ts`、`prometheus-md-only.ts`（T1 复议结论若维持不镜像则移跳过组并记理由）、`notepad-write-guard.ts`、`tasks-todowrite-disabler.ts`、`atlas.ts` + 单测 + e2e。
- **做法**：B/C 决策形态复用 T4/T5 打样；`atlas` 的 hook 语义按 T1 逐文件定性（与 Phase 2 atlas persona/委派的边界：hook 层不重复 persona 职责）。
- **判定**：✅ 每模块单测 + e2e；门 2/3 绿。
- **证据**：（待填）
- **依赖**：P3-T6。**量级**：5 小时。

### [ ] P3-T18 — ulw-execute（start-work hook 语义，H-32）

- **产出**：`src/hooks/ulw-execute.ts`（+ 必要的 `ulw-execute/` 子模块）+ 单测 + e2e。
- **做法**：严格按 T1 的"hook 语义 / 命令面胶水"划分移植（计划书 §4.5）；命名锚点全用 `ulw-execute`；激活目标 = atlas（Phase 2 已就位）；脚手架/notepad 存储面用 `ctx.jobs`；`/ulw-execute` 命令引用一律不写（Phase 4）。
- **判定**：✅ 单测覆盖激活检测 + 上下文构建核心路径；e2e 场景展示"工作计划意图 → atlas 激活语义"；门 2/3 绿。
- **证据**：（待填）
- **依赖**：P3-T14…T17（模式全打样后）+ P3-T1（划分）。**量级**：6 小时。

---

## WP-7 门扩展（计划书 §4.7）

### [ ] P3-T19 — 静态门 / doctor-lite / probe / proofs 全量扩展

- **产出**：`scripts/verify-concerto-static.mjs` c 组扩展（omo-hooks 断言组，延续 c 编号）+ doctor-lite 双行断言 + `concerto-mode-probe.sh` 全量 boot marker + proofs 护栏证明。
- **做法**：c 组新断言：cordis.yml 恰好 2 个 insert 行、omo-hooks 每 `src/hooks/*.ts` 含署名头（上游源标注）、manifest ↔ hooks 文件集合一致、c01–c10 零改动；probe 断言全量 `[omo-hooks] hook … registered` 行 + 汇总行；prove 脚本对 write-guard 做"deny 决策真实生效 + listener 抛错工具不死"的 session 级证明（R-9，prove-explore-toolfilter.mjs 先例）。
- **判定**：✅ 门 4/6/8 绿；新断言逐条列出对比（只加严）。
- **证据**：（待填）
- **依赖**：P3-T18（全 hook 就位）。**量级**：4 小时。

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
