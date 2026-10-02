# Phase 4.5 任务清单

> **上游依据**：[开发计划书](./phase4.5-plan.md) · [dsh 0.2.0-rc.2 复核报告](../../dsh-0.2.0-rc.2-review_zh-CN.md)（面权威）· [ROADMAP Phase 4.5](../../roadmap_zh-CN.md) · [决策 D7](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 4.5 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，复核报告给出"每个面断在哪"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：🚧 **0/13**（`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）· ~~删除线~~ = 仲裁取消；T9 为 deferrable 项，defer 不算未完成）
>
> **修订记录**：（空——计划期评审后启用）
>
> **编号**：`P4.5-T<n>`（Phase 4.5 - Task n）。工作包归属见计划书 §7。**每个适配任务的证据栏必须同时含 0.1.5-rc.1（CI）与 0.2.x（本地）两侧记录**（R-1 双模漂移护栏）。

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1 | `develop` 基线绿：`scripts/ci-local.sh` 8 门全绿（0.1.5-rc.1 pin 下） | 退出 0；记录基线快照（门 2 测试数、门 3 场景数、门 6 断言数、门 7 检查数、门 8 proofs 数） | ⬜ 待跑 |
| PRE-2 | 本机 dsh = 0.2.x（0.2.0-rc.2 或 T1 Q-1 选定的 rc）；本地镜像两 tag 只读可用 | `dsh --version`；`git -C ~/GithubRepo/deepseek-harness tag -l 'dsh-v0.1.5-rc.1' 'dsh-v0.2.0-*'` 非空 | ⬜ 待跑（立项时实测 = `0.2.0-rc.2`，两 tag 在列） |
| PRE-3 | 复核报告与 ROADMAP Phase 4.5 已在 develop（PR #11 合并态，含 `1803790` 的 13 处分解更正） | `git log --oneline develop -3` 含 `98d5e10`；`develop:docs/dsh-0.2.0-rc.2-review_zh-CN.md` 可读 | ✅ 立项已核 |
| PRE-4 | CI pin 未动：`ci.yml` `DSH_VERSION: 0.1.5-rc.1` 且 `--before` 截止与 compat-probe.yml 一致 | d09 门绿 | ⬜ 待跑（随 PRE-1） |
| PRE-5 | 沙箱可用：`scripts/cold-start.sh` 在本机 0.2.x 安装下能完成 boot（**预期暴露 P0-1 现状**——此结果是基线证据不是失败） | 冷启动日志记录；roster RPC 响应记录（预期：无 `concerto`） | ⬜ 待跑（作为 P0-1 断裂的「before」实证，T1 引用） |

---

## WP-0 调研核对（计划书 §6 Q-1…Q-8）

### [ ] P4.5-T1 — 0.2.x 机制逐件钉测 + 复核引用再验证

- **产出**：Q-1…Q-8 全部闭环的实测记录（`.omo/evidence/p45t1/`）；本任务清单与计划书按实测修正（DoD-d，修订记录成文）；**（A）/(B) 安装器 fork 裁定**；复核报告引用对选定 rc 的再验证结论。
- **做法**：
  1. **Q-1 选定 pin 目标**：`npm view @deepseek-ai/dsh time --json` 按时间序取最新 0.2.x rc（bump-dsh.sh safe_point 逻辑）；复核报告的 tag 级引用（行号/路径）对该 rc 的镜像 tag 逐条再验证——不符处订正复核报告（双语）并记修订。
  2. **Q-2 YAML 解析路径**：实测 profile 插件的依赖解析——候选 `yaml` 包（查版本、license、verify-licenses 白名单现状）；验证 `dsh plugin add` 安装后插件内 `import 'yaml'` 可解析；否决自造解析器（组合含 `!!js`/嵌套 group/块标量）的结论成文。
  3. **Q-3 register() 契约**（真实 boot，非文档）：沙箱 profile 装 omo-agents 后，stub 注册一个最小 `PresetDefinition`——实证 ① `entryListProblem` 校验接受 `disabled: !!js`、`cordis:group`、`isolate` 形状；② roster RPC 出现该 preset；③ 同 id 重复注册的语义（替换/报错/并列）；④ `broken` 字段在校验失败时的行为；⑤ `session/create {agentPreset}` 组合成功且 persona 生效。
  4. **Q-4 disposer/effect 接线**：plain `apply()` 插件持有 disposer 的接线先例（上游 agent-preset 用 `Service.init` yield——本仓插件是 apply() 形态，找 effect/dispose 的可行挂点）；实证重载（profile 配置重放）后 roster 无重复/泄漏。
  5. **Q-5 jobs.events.subscribe 三态**：沙箱起真实 job（subagent 委派），分别以 `{owner: sessionId}` / `{owners:'scope'}` / `{owners:'all'}` 订阅，记录 host-plane 订阅者各自听到的集合；与 0.1.5 `onJobDone` 在同场景下的投递集合比对；`settled.awaited` 的取值语义逐字引用；subscribe disposer 行为。
  6. **Q-6 jobs caller/view 实跑**：`list(sessionId)` 的返回集合（owned+unowned）、`kill(id, sessionId, reason)` 的判定、`JobView.owner` 在场性、owner preflight（非在册 SessionId 是否拒绝——0.1.5 的「活实例」语义在 0.2.x 的对应行为）。
  7. **Q-7 安装器声明式路径**：沙箱 `$DSH_HOME` 手写一行 `- insert: [{id: preset-concerto, name: '@deepseek-ai/dsh-agent-preset', config: {…omo-agents-current 组合…}}]` 进 `profiles/web/cordis.patch.yml` → 真实 boot 实证 mount + roster + 组合；registry 行在 web profile 的在场性断言；幂等重写（同 id 二次写入）行为；裁定 (A)/(B) fork。
  8. **Q-8 v4 信封抓取**：沙箱（persistence overlay `compression: none`）跑一次含工具调用的真实会话，抓 `session.v4.jsonl` 的 `tool/result` 事件全文（header、role、toolCallId、isError、content 形状）；drive.mjs 9+ 处伪造点分类（运行时消费 vs 解析器消费）清单。
- **判定**：✅ Q-1…Q-8 各有逐字引用的结论与证据文件；(A)/(B) fork 有成文裁定；计划书/任务书修订记录成文；复核报告订正（若有）双语同 commit。
- **证据**：⬜ 待填（`.omo/evidence/p45t1/Q1-pin-target.md` … `Q8-v4-envelope.md`）
- **依赖**：PRE-1…PRE-5。**量级**：1 天。

---

## WP-1 `ctx.jobs` 适配（计划书 §4.2；复核 §3 为权威）

### [ ] P4.5-T2 — background-notification：events.subscribe 三级探测改造

- **产出**：`background-notification.ts` 双模改造（`jobs.events?.subscribe` 优先 → `onJobDone` 回退 → 既有 pull 降级）；`settled.awaited` 替代 `reported` 去重；双形状参数化单测。
- **做法**：filter 按 T1 Q-5 结论选定（等价性理由写入代码注释）；subscribe disposer 按 Q-4 接线纪律持有；结构类型声明 0.2.0 形状（`events`/`JobView`）与 0.1.5 形状并存为可选；boot marker 的三态可区分（`push path live (events)` / `push path live (onJobDone)` / `degraded pull path`）——marker 措辞变更进测试与 probe 同步网。
- **判定**：✅ 单测双形状各一轮（订阅建立、事件去重、降级切换）；0.2.x 本地场景中后台 job 完成通知真实到达（非降级路径）；0.1.5 CI 绿。
- **证据**：⬜ 待填
- **依赖**：P4.5-T1。**量级**：3 小时。

### [ ] P4.5-T3 — stop-continuation-guard：SessionId caller + owner 围栏双模

- **产出**：`stop-continuation-guard.ts` caller 构造（:264）按 `jobs.events !== undefined` 探针分叉；`owner ?? ownerSession` 双读；`StopContinuationJobsLike` 结构类型双形状；单测。
- **做法**：0.2.x 分支 caller = `sessionId` 字符串（`SessionId` 品牌类型的结构等价）；0.1.5 分支保持 `{id: sessionId}`；围栏语义（无主 job 跳过、`already-finished` 判定、`STOP_CANCELLATION_REASON` 逐字）两分支一致；**金丝雀单测** = 0.2.0 形状 mock 下 `cancelledJobIds` 含目标 id（不是空转）。
- **判定**：✅ 单测双形状（级联命中/级联空转可区分）；0.2.x 实跑 `kill` 返回 `'requested'`；0.1.5 CI 绿。
- **证据**：⬜ 待填
- **依赖**：P4.5-T1。**量级**：3 小时。

### [ ] P4.5-T4 — ulw-execute/live-state：JobSpec 双模 + 降级可区分

- **产出**：`live-state.ts` `start()` spec 按探针分叉（0.2.x：`{kind, label, owner: sessionId, run(job)}`，outcome 读 `result ?? output`）；preflight 拒绝与真实启动失败的日志区分；单测。
- **做法**：0.2.x 分支的 `owner` 传**当前会话 SessionId**（Q-6 实证的 preflight 语义——非在册拒绝仍走既有 catch 降级）；`run` 的签名按 `JobHandle` 形状；「`degraded: true` 且日志含原因」为可观测纪律（复核 §3.2-3 的「日志依旧干净」病灶的正面修复）；H-32 激活语义零变动（本任务只动 job 承载）。
- **判定**：✅ 单测双形状（启动成功/preflight 降级/服务缺席三态可区分）；0.2.x 实跑 `jobId` 非空；0.1.5 CI 绿。
- **证据**：⬜ 待填
- **依赖**：P4.5-T1。**量级**：3 小时。

---

## WP-2 协奏 preset 注册迁移（计划书 §4.3；复核 §2 为权威）

### [ ] P4.5-T5 — syncConcertoPreset 双模出口 + disposer 持有

- **产出**：`concerto-preset.ts` 出口探针（`typeof agentPresets.register === 'function'`）；0.2.x 分支 = 渲染 YAML → 对象解析（T1 Q-2 路径）→ `register()` + disposer 持有（Q-4 接线）；0.1.5 分支 = 既有物化不变；`package.json` 依赖变更（若 Q-2 定案引入 `yaml`）；单测。
- **做法**：sentinel 渲染管线与防残留闸**零改动**；解析失败的 loud-but-non-fatal 纪律（`concerto preset register FAILED: <reason>` marker 进 probe 同步网）；disposer 存模块级槽位 + effect/dispose 释放；0.2.x 分支是否保留物化快照（诊断用）按任务书裁定成文；`yaml` 依赖引入时 `verify-licenses` 与 pnpm-lock 同 commit。
- **判定**：✅ 单测（register 在场/缺席双形状；解析产物含全部渲染锚点；双注册的 disposer 语义）；0.2.x 实 boot roster 含 `concerto`；0.1.5 CI 绿（物化路径不回归）。
- **证据**：⬜ 待填
- **依赖**：P4.5-T1。**量级**：5 小时。

### [ ] P4.5-T6 — roster 词汇与断言生态迁移（probe / drive.mjs / boot 打印）

- **产出**：`omo-agents/src/index.ts` roster 打印行去 `trust`（改 registry 字段）；`concerto-mode-probe.sh` 的 `trust:user` 断言改指 registry roster；drive.mjs 物化文件锚点断言（:2463/:2510/:2546）迁移为 registry 文档断言（0.2.x 分支，`agentPresets/read`）+ 保留物化断言（0.1.5 分支）；`RosterEntry` 结构类型更正。
- **做法**：probe 断言 = `id: concerto` 在列 + `name`/`description` 与 preset.yml 单源一致 + `isDefault: false`（**`trust` 字样从 probe 全文清除**，含注释中的 T9 传输说明）；drive.mjs 双模断言按 §4.1 探针归位；`agentPresets/read` 在 0.1.5 缺席的探测（远程面缺失时落回物化断言）；汇总 marker 行（probe 的 PASS 文案）同步重写。
- **判定**：✅ probe 在 0.2.x 全绿（含 roster 段）；drive.mjs 双运行时各绿；0.1.5 CI 绿。
- **证据**：⬜ 待填
- **依赖**：P4.5-T5。**量级**：4 小时。

---

## WP-3 安装器交付线（计划书 §4.4；复核 §2.4 为权威）

### [ ] P4.5-T7 — 安装器声明式迁移（或重定范围）+ 安装验证

- **产出**：按 T1 Q-7 fork 裁定落地——（A）：`install-concerto.sh` 改写为 profile patch 行注入（幂等行替换 + 时间戳备份 + registry 前提断言 + 响亮报错指引）+ 沙箱全新安装验证；（B）：安装器在 0.2.x 探测到文件发现缺席时响亮拒绝 + 指引插件线 + 理由成文。两形态均含 `docs/install-concerto{,_zh-CN}.md` 双语更新。
- **做法**：（A）形态——`PresetDefinition` 的 config 由 omo-agents-current 组合 + env 覆盖渲染生成（与今日两文件语义等价的核对单测）；profile patch 写入器只 touch `preset-concerto` 行（对照测试：预置用户行的 patch 文件安装后用户行逐字保留，R-4）；安装验证 = 真实 boot + roster RPC 含 `concerto`（复用 probe 传输自适应通道）。（B）形态——探测逻辑（registry 缺席/文件发现缺席）+ 拒绝文案 + 指引。
- **判定**：✅（A）：沙箱全新安装后 roster 含 `concerto` 且 session/create 组合成功；二次安装幂等（无重复行、用户行无损）；0.1.5 安装路径不回归（双模或探针分流）。（B）：拒绝行为与指引文案的实证记录。**退出标准 (e) 的承载任务**。
- **证据**：⬜ 待填
- **依赖**：P4.5-T1（fork 裁定）、P4.5-T5（渲染产物复用）。**量级**：1 天。

---

## WP-4 会话日志 v4 观测通道（计划书 §4.5；复核 §4 为权威）

### [ ] P4.5-T8 — drive.mjs 双形状夹具 + 信封读取点核对

- **产出**：drive.mjs 的运行时形状探针（会话日志 header format 版本）+ v4 形状伪造/解析（T1 Q-8 抓取的逐字形状，形状常量单源）；9+ 处伪造点按分类清单迁移；prove 脚本与 smoke 的信封读取点核对结果（双形状或现状确认）。
- **做法**：「运行时消费」类伪造必须过 v4 准入语义（形状与 Q-8 抓取逐字一致）；「解析器消费」类保持解析器双语义；形状常量集中定义（v3/v4 两组，禁止散落字面量）；对照断言 = 0.1.5 沙箱仍产 v3 形状且全链绿。
- **判定**：✅ drive.mjs 33 场景在 0.2.x 全绿（含 v4 形状断言）；0.1.5 CI 绿；prove/smoke 双运行时核对记录。
- **证据**：⬜ 待填
- **依赖**：P4.5-T1（Q-8）。**量级**：1 天。

---

## WP-5 延后对齐（deferrable；计划书 §4.8）

### [ ] P4.5-T9 — 专属 source kind 迁移（仅当证据拉入）

- **产出**（仅当 T1–T8 期间发现 0.2.x 消费者对未知 kind 有实际误行为时）：10 处代码点迁为专属 kind（`omo-hard-blocks` / `omo-todo-continuation` 等逐点定名）+ 3 处注释同步 + 结构类型更正；否则本任务记 `deferred` 出阶段并写明理由。
- **判定**：✅ 拉入时：迁移点单测（kind 字符串单源）、注入链路 e2e 不回归；defer 时：任务书裁定成文（证据 = 无消费者误行为的观察记录）。
- **证据**：⬜ 待填（或 defer 裁定）
- **依赖**：P4.5-T1。**量级**：0.5 天（可 defer）。

---

## WP-6 门与双运行时复跑（计划书 §4.6）

### [ ] P4.5-T10 — 门断言随面迁移（静态门 / doctor-lite / probe）

- **产出**：verify-concerto-static c 组随 T5/T6 的锚点迁移（双模断言；0.1.5 死路径不断言）；doctor-lite 输入面核对（渲染产物单一事实源未变的确认记录，或同 commit 同步）；probe marker 同步网（T2/T5 的 marker 措辞变更处）全绿。
- **做法**：每处门改动与引发它的代码改动同 commit（门随代码走纪律）；断言强度比对记录（迁移前后断言数量与覆盖面不降）；c 组编号不新增（在既有编号内迁移语义）。
- **判定**：✅ 门 4/6/8 在双运行时各绿；断言强度比对成文。
- **证据**：⬜ 待填
- **依赖**：P4.5-T2 … P4.5-T6。**量级**：3 小时。

### [ ] P4.5-T11 — 双运行时全链复跑 + 级联金丝雀 + roster 往返

- **产出**：0.1.5-rc.1 与 0.2.x 两侧的 `scripts/ci-local.sh` 8 门完整记录；`/stop-continuation` 级联金丝雀场景在 0.2.x 的 verdict（退出标准 d 承载）；roster 含 `concerto` + explore 委派往返场景在 0.2.x 的 verdict（退出标准 c 承载）。
- **做法**：金丝雀场景可复用/扩展现有 `stop-continuation-halts-todo`（断言 `cancelledJobIds` 非空 + 目标 job 消失 + 未触达降级 marker 的反向断言）；roster 往返复用现有委派场景；两侧记录进 `.omo/evidence/`；发现的残余断裂回本任务清单插新任务（不改结论改计划，DoD-d）。
- **判定**：✅ 双运行时 8 门绿；退出标准 (c)(d) 的 verdict 文件落盘。
- **证据**：⬜ 待填
- **依赖**：P4.5-T2 … P4.5-T8、P4.5-T10。**量级**：4 小时。

---

## WP-7 pin 与收口（计划书 §4.7）

### [ ] P4.5-T12 — pin 机器：bump-dsh + D7 断言 + 0.1.x 假设清理

- **产出**：`scripts/bump-dsh.sh <选定 rc>` 执行结果（`ci.yml` + `compat-probe.yml` 原子改，d09 复验绿）；`doctor-lite.mjs:211` 的 D7 semver 断言文案（0.1.x → 0.2.x 口径）；bump-dsh.sh / release.sh / probe 注释中**会误导下一次执行**的 0.1.x 假设更正（历史记录不动）；0.1.5 死路径删除（§4.1 去留裁定逐点：0.2.x 上结构性不可达的分支——如物化出口——随本 commit 删除并记 CHANGELOG；可保留的探针双模保留）。
- **做法**：bump-dsh.sh 既定流程（safe_point 时间序、`apply_bump`、`family_verdict`）；本 commit 前 T11 的 0.2.x 绿记录必须已落盘（退出标准 f：pin 翻转与绿色证据同一次变更交付——若 L2（T13）排期在后，则本任务与 T13 合并为同一收口 commit/PR，任务书裁定成文）。
- **判定**：✅ CI 在新 pin 下 8 门绿；d09 绿；死路径删除清单成文。
- **证据**：⬜ 待填
- **依赖**：P4.5-T11。**量级**：3 小时。

### [ ] P4.5-T13 — L2 重验证 + 矩阵行翻转 + 文档收口

- **产出**：`.omo/evidence/concerto-verify-dsh-<rc>.md`（沿用 0.1.5-rc.1 证据文件的核对骨架在 0.2.x 重推导）；`.omo/compat.yaml` 的 0.2.x 行 `untested` → `tested`（`our:` 按 release-process §2a 纪律）+ 矩阵双语重渲染；README 状态行翻转（🔬 → ✅ 适配完成口径，含 (A)/(B) 终态与"≠ 0.2.x 特性消费"的 R-8 措辞）；CHANGELOG；decisions.md 带日期行（pin 翻转登记，沿用"无新增决策 + PRD §12 跟踪"体例）；PRD §12 该项翻 [x]；复核报告「实施期订正」节（若有实质出入）。
- **判定**：✅ 退出标准 (a)–(f) 逐条有证据指针（核对表回填到本文末尾）；门 7/4 绿；文档双语同 commit。
- **证据**：⬜ 待填
- **依赖**：P4.5-T12。**量级**：1 天。

---

## 退出标准核对表（T13 回填）

| # | 标准 | 证据指针 | 状态 |
|---|---|---|---|
| a | L1 全链在 0.2.x pin 下转绿 | ⬜ | ⬜ |
| b | L2 重验证 + 矩阵行 `tested` | ⬜ | ⬜ |
| c | roster 含 `concerto` + 委派往返 | ⬜ | ⬜ |
| d | `/stop-continuation` 级联真实取消 | ⬜ | ⬜ |
| e | 安装器线 0.2.x 状态有了结 | ⬜ | ⬜ |
| f | pin 翻转与绿色证据同一次变更交付 | ⬜ | ⬜ |
