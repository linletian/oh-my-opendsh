# Phase 4.5 任务清单

> **上游依据**：[开发计划书](./phase4.5-plan.md) · [dsh 0.2.0-rc.2 复核报告](../../dsh-0.2.0-rc.2-review_zh-CN.md)（面权威）· [ROADMAP Phase 4.5](../../roadmap_zh-CN.md) · [决策 D7](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 4.5 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，复核报告给出"每个面断在哪"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：🚧 **0/13**（`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）· ~~删除线~~ = 仲裁取消；T9 为 deferrable 项，defer 不算未完成）
>
> **修订记录**：
>
> - **2026-10-02 计划期评审修复（第 3 轮）**（评审：[`phase4.5-review-3.md`](./phase4.5-review-3.md)，新发现 3 项全部采纳，无阻塞——复审确认第 2 轮 5 项落实正确）——T1 的 Q-4 补裁定输入指针（`boot-markers.test.ts` 的 `apply()` harness 重写成本，R3-I1）；其余落计划书（重心序列「门 2 仅增量」、§4.6 增量清单补结构断言、`registry.ts:300-301` 行号）。
>
> - **2026-10-02 计划期评审修复（第 2 轮）**（评审：[`phase4.5-review-2.md`](./phase4.5-review-2.md)，新发现 5 项全部采纳——复审确认第 1 轮 14 项落实正确、2 项驳回成立）——R2-B1：T6 单测侧改「**保持不动 + 仅新增** `renderConcertoComposition()` 纯函数用例」（原「路径契约测试改写为 read 文档断言」不可执行——单测无 RPC 能力，且会删掉 B4 写盘契约的唯一自动化保护；read 文档锚点断言归位 probe/drive.mjs 运行时面）；R2-I1：T5 做法段的时机结构断言改写为「`omo-agents` **不在被注册组合的行集内**」（结构性不变量，替代被证伪的「inject 异步」说法）+ Q-4 的 Service.init + yield 候选若经 T1 裁定采用由 T5 一并落地；R2-N1/N2 随计划书同步（§8 三行与「双模更正」措辞）。**评审方附带正面确认**：安装器 (A) 三前提全部有上游先例（见计划书 §4.4 修订记录）。
>
> - **2026-10-02 计划期评审修复（第 1 轮）**（评审：[`phase4.5-review-1.md`](./phase4.5-review-1.md)，16 项中 14 采纳 / 2 驳回——裁定细节与证据见[计划书修订记录](./phase4.5-plan.md)）——头部证据纪律对齐（适配任务 = 受影响门 + 场景级 0.2.x 记录，全链双运行时由 T10/T11 承载，I7）；T1 改逐 Q 独立交付（R-10）+ Q-3 增 ⑥ 时机问与附项 a（两侧 `content` 锚点齐全性）/b（`RosterEntry.trust` 裁定）+ Q-8 挂传输硬绑定确认（N3）；T5 产出改 `renderConcertoComposition()` 纯函数 + 保留写盘契约（B4）+ register 时机结构断言（R-9）；T6 断言生态改单一 `agentPresets/read` 断言面（B1）+ 可数清单全覆盖（B2）+ 禁止落回物化兜底 + banner 否定断言保护（N2）；T10 补门 6 低风险与迁移重心次序注记；T11 依赖改显式枚举（含 T7，I5 驳回后按建议精神消歧）；T12 交付物补 `doctor-lite-core.ts:15-17,44` + `doctor-lite.test.ts:39-50`（B3）、T12/T13 同 commit 改硬规则、判定去自指（I6）；T13 补跨段迁移字段集 + `our:` 取值裁定 + release gate 前置（I1）。
>
> **编号**：`P4.5-T<n>`（Phase 4.5 - Task n）。工作包归属见计划书 §7。**证据纪律（评审 R1-I7 对齐后口径）**：适配任务（T2–T8）的证据栏要求**受影响门 + 场景级**的 0.2.x 记录（如 T3 = 0.2.x 实跑 `kill` 返回 `'requested'` + 门 2 双形状单测），不要求每任务跑完整 8 门双运行时全链——**全链双运行时复跑由 T10/T11 统一承载**；0.1.5 侧以 CI 绿为准。

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

- **产出**：Q-1…Q-8 全部闭环的实测记录（`.omo/evidence/p45t1/`）；本任务清单与计划书按实测修正（DoD-d，修订记录成文）；**（A）/(B) 安装器 fork 裁定**；复核报告引用对选定 rc 的再验证结论。**交付节奏（R-10 护栏）**：**逐 Q 独立交付**——哪个 Q 先闭环先落证据文件并回填对应判据，不绑在一个 1 天块里；某 Q 受阻时，其下游任务单独重排期并在修订记录成文，其余 Q 与其下游照常推进。
- **做法**：
  1. **Q-1 选定 pin 目标**：`npm view @deepseek-ai/dsh time --json` 按时间序取最新 0.2.x rc（bump-dsh.sh safe_point 逻辑）；复核报告的 tag 级引用（行号/路径）对该 rc 的镜像 tag 逐条再验证——不符处订正复核报告（双语）并记修订。
  2. **Q-2 YAML 解析路径**：实测 profile 插件的依赖解析——候选 `yaml` 包（查版本、license、verify-licenses 白名单现状）；验证 `dsh plugin add` 安装后插件内 `import 'yaml'` 可解析；否决自造解析器（组合含 `!!js`/嵌套 group/块标量）的结论成文。
  3. **Q-3 register() 契约**（真实 boot，非文档）：沙箱 profile 装 omo-agents 后，stub 注册一个最小 `PresetDefinition`——实证 ① `entryListProblem` 校验接受 `disabled: !!js` 与嵌套 `cordis:group` 形状（isolate 已排除出风险面——标准 loader 机制，计划书 R-2 收窄）；② roster RPC 出现该 preset；③ 同 id 重复注册的语义（替换/报错/并列）；④ `broken` 字段在校验失败时的行为；⑤ `session/create {agentPreset}` 组合成功且 persona 生效；⑥ **register 调用时机**——不得在组合自身激活路径内（registry `index.ts:126-127` 的警告实证：`ctx.inject` 回调的异步语义是否即为正解，R-9）。附项 a：**两侧 `content` 锚点齐全性**——`agentPresets/read`（0.1.5 = `agent-presets/src/index.ts:512` `@Remote('read')`，由文件发现供给；0.2.0 = `agent-preset-registry/src/index.ts:193`，由注册定义供给）返回的 `content` 中，全部渲染锚点在**两侧**均齐全（单一断言面迁移的唯一实证面，评审 R1-B1）；附项 b：**`RosterEntry.trust` 处置裁定**（去字段 vs 保留可选读取不消费——建议后者：向后兼容零成本，评审 R1-N1）。
  4. **Q-4 disposer/effect 接线**：plain `apply()` 插件持有 disposer 的接线先例（上游 agent-preset 用 `Service.init` yield——本仓插件是 apply() 形态，找 effect/dispose 的可行挂点）；实证重载（profile 配置重放）后 roster 无重复/泄漏。**Service.init 候选的裁定输入**（评审 R3-I1）：形态转换成本的具体载体 = `tests/omo-agents/boot-markers.test.ts` 的 `apply()` 接线 harness（604 行 / 32 个 `it`，`:52`/`:441`/`:487`——非单行 import 变更，见计划书 Q-4 裁定维度），裁定须基于完整信息而非仅「成本 vs 纪律」的方向。
  5. **Q-5 jobs.events.subscribe 三态**：沙箱起真实 job（subagent 委派），分别以 `{owner: sessionId}` / `{owners:'scope'}` / `{owners:'all'}` 订阅，记录 host-plane 订阅者各自听到的集合；与 0.1.5 `onJobDone` 在同场景下的投递集合比对；`settled.awaited` 的取值语义逐字引用；subscribe disposer 行为。
  6. **Q-6 jobs caller/view 实跑**：`list(sessionId)` 的返回集合（owned+unowned）、`kill(id, sessionId, reason)` 的判定、`JobView.owner` 在场性、owner preflight（非在册 SessionId 是否拒绝——0.1.5 的「活实例」语义在 0.2.x 的对应行为）。
  7. **Q-7 安装器声明式路径**：沙箱 `$DSH_HOME` 手写一行 `- insert: [{id: preset-concerto, name: '@deepseek-ai/dsh-agent-preset', config: {…omo-agents-current 组合…}}]` 进 `profiles/web/cordis.patch.yml` → 真实 boot 实证 mount + roster + 组合；registry 行在 web profile 的在场性断言；幂等重写（同 id 二次写入）行为；裁定 (A)/(B) fork。
  8. **Q-8 v4 信封抓取**：沙箱（persistence overlay `compression: none`）跑一次含工具调用的真实会话，抓 `session.v4.jsonl` 的 `tool/result` 事件全文（header、role、toolCallId、isError、content 形状）；drive.mjs 9+ 处伪造点分类（运行时消费 vs 解析器消费）清单。**附项（评审 R1-N3）**：`commandExecute` 的传输硬绑定确认（drive.mjs:2205-2213 的「installed dsh 0.1.5-rc.1 = web-remote」注释假设在 0.2.x 上仍成立——一行确认记录，挂在 Q-8 证据文件里，不另立 Q）。
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

- **产出**：抽出纯函数 **`renderConcertoComposition(): string`**（渲染后的 YAML 文本）；`syncConcertoPreset` **保留写盘契约**（doctor-lite.mjs:602 主动调它并读产物——评审 R1-B4 实证，「不再写盘」与门 4 互斥，予以删除）；`concerto-preset.ts` 出口探针（`typeof agentPresets.register === 'function'`）；0.2.x 分支 = **同一个字符串** → 对象解析（T1 Q-2 路径）→ `register()` + disposer 持有（Q-4 接线）+ **调用时机约束**（`ctx.inject` 回调内触发，不在自身激活同步路径——registry :126-127，R-9）；0.1.5 分支 = 既有物化不变；`package.json` 依赖变更（若 Q-2 定案引入 `yaml`）；单测。
- **做法**：sentinel 渲染管线与防残留闸**零改动**；解析失败的 loud-but-non-fatal 纪律（`concerto preset register FAILED: <reason>` marker 进 probe 同步网）；disposer 存模块级槽位 + effect/dispose 释放；单测含「`omo-agents` **不在被注册组合的行集内**」的结构断言（R-9 的结构性不变量——组合行集无 `omo-agents`，它挂仓根 `cordis.yml:36-38` 独立 insert 行；结构变更时立刻报警）+ `renderConcertoComposition()` 纯函数用例（不落盘，断言 YAML 文本含全部渲染锚点）；Q-4 的 **Service.init + yield 候选**（把导出改 Service class 形态）若经 T1 裁定采用，本任务一并落地形态转换，裁定结论记任务书；`yaml` 依赖引入时 `verify-licenses` 与 pnpm-lock 同 commit。
- **判定**：✅ 单测（register 在场/缺席双形状；解析产物含全部渲染锚点；双注册的 disposer 语义；时机结构断言）；门 4 绿（写盘契约未破）；0.2.x 实 boot roster 含 `concerto`；0.1.5 CI 绿（物化路径不回归）。
- **证据**：⬜ 待填
- **依赖**：P4.5-T1。**量级**：5 小时。

### [ ] P4.5-T6 — roster 词汇与断言生态迁移（probe / drive.mjs / boot 打印）

- **产出**：`omo-agents/src/index.ts` roster 打印行去 `trust`（改 registry 字段 `isDefault`/`broken`——**`trust` 两处同删**：list 行与 read 文档，评审 R1-B1）；**断言生态统一迁到 `agentPresets/read` 单一断言面**（0.1.5/0.2.x 均在场，无需双模——评审 R1-B1 更正），覆盖运行时面可数清单（评审 R1-B2）：① probe **60 行**物化引用面（sentinel 残留反断言、`prefix: \| -`、persona 章节 marker、explore 行 id/toolName、toolFilter grep、喂 dsh schema 校验器 :583-584、`trust` grep :959-960）；② drive.mjs `materializedCompositionPath` **5 个调用点**（:1385/:2544/:2568/:6795/:9847，定义 :2462）；`RosterEntry` 结构类型按 T1 Q-3 附项 b 裁定落地。**单测侧（评审 R2-B1 更正——「保持不动 + 仅新增」）**：`concerto-preset.test.ts` **11 处** `.agent-presets`（含路径契约 :171-173）与 `roster-composition.test.ts:81` **保留不动**——它们是纯 vitest 单测、无 RPC 能力，测的是渲染器与写盘契约（B4 承重面，门 4 依赖的唯一自动化保护）；仅随 T5 **新增** `renderConcertoComposition()` 纯函数用例（不落盘，直接断言 YAML 文本含全部渲染锚点）。「read 文档锚点」断言归属运行时面（probe 与 drive.mjs，已有 RPC 通道），不在单测射程内。
- **做法**：probe 断言 = `id: concerto` 在列 + `name`/`description` 与 preset.yml 单源一致 + `isDefault: false`；**禁止「远程面缺失则落回物化断言」的兜底**（真实回归时静默降级，违反金丝雀纪律——评审 R1-B1-3）；**PASS banner（probe :1228）重写不得削弱其中的否定断言句**（`NO … FAILED` / `ABSENT` / no-vacuity-guard——评审 R1-N2，门 8/`run-proofs.sh` 消费该文案）。
- **判定**：✅ probe 在 0.2.x 全绿（含 roster 段与 banner）；drive.mjs 双运行时各绿（0.1.5 侧 read 同样在场，断言面统一）；门 2 绿（两个单测文件**保留** + 新增纯函数用例）；0.1.5 CI 绿。
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

- **产出**：verify-concerto-static c 组随 T5/T6 的锚点迁移（**门 6 低风险**：c01–c09 读仓内模板 `omo-agents-current/preset/agent.cordis.yml`，`verify-concerto-static.mjs:106-108`——迁移只随模板/署名面变化，0.1.5 死路径不断言）；doctor-lite **零改动成立的确认记录**（写盘契约保留后，闸继续调 `syncConcertoPreset(temp)` 读渲染产物——评审 R1-B4 后提，若有残余变化则同 commit 同步）；probe marker 同步网（T2/T5 的 marker 措辞变更处）全绿。
- **做法**：每处门改动与引发它的代码改动同 commit（门随代码走纪律）；断言强度比对记录（迁移前后断言数量与覆盖面不降）；c 组编号不新增（在既有编号内迁移语义）。迁移重心次序：**门 3 > 门 8 > 门 2**（评审 R1-B2 实测分布）。
- **判定**：✅ 门 4/6/8 在双运行时各绿；断言强度比对成文。
- **证据**：⬜ 待填
- **依赖**：P4.5-T2 … P4.5-T6。**量级**：3 小时。

### [ ] P4.5-T11 — 双运行时全链复跑 + 级联金丝雀 + roster 往返

- **产出**：0.1.5-rc.1 与 0.2.x 两侧的 `scripts/ci-local.sh` 8 门完整记录；`/stop-continuation` 级联金丝雀场景在 0.2.x 的 verdict（退出标准 d 承载）；roster 含 `concerto` + explore 委派往返场景在 0.2.x 的 verdict（退出标准 c 承载）。
- **做法**：金丝雀场景可复用/扩展现有 `stop-continuation-halts-todo`（断言 `cancelledJobIds` 非空 + 目标 job 消失 + 未触达降级 marker 的反向断言）；roster 往返复用现有委派场景；两侧记录进 `.omo/evidence/`；发现的残余断裂回本任务清单插新任务（不改结论改计划，DoD-d）。
- **判定**：✅ 双运行时 8 门绿；退出标准 (c)(d) 的 verdict 文件落盘。
- **证据**：⬜ 待填
- **依赖**：P4.5-T2、T3、T4、T5、T6、**T7（安装器线——退出标准 e 不得被 pin 翻转越过，评审 R1-I5 显式枚举）**、T8、P4.5-T10。**量级**：4 小时。

---

## WP-7 pin 与收口（计划书 §4.7）

### [ ] P4.5-T12 — pin 机器：bump-dsh + D7 常量 + 0.1.x 假设清理

- **产出**：`scripts/bump-dsh.sh <选定 rc>` 执行结果（`ci.yml` + `compat-probe.yml` 原子改，d09 复验绿）；**D7 断言权威面同 commit 手工改**（bump-dsh.sh `apply_bump` 不覆盖——评审 R1-B3）：`scripts/doctor-lite-core.ts:15-17`（`PINNED_MAJOR = 0` / `PINNED_MINOR = 1` 常量 + `Decision D7 pin: minor 0.1.x` 注释）与 `:44`（`isPinnedDshVersion` 注释文案）、`scripts/doctor-lite.mjs:211`（"pinned 0.1.x" 提示文案）、`tests/omo-agents/doctor-lite.test.ts:39-50`（夹具：`0.2.0` 从 rejects 组移入 accepts 组 + describe 标题 "decision D7: 0.1.x" 改口径）；bump-dsh.sh / release.sh / probe 注释中**会误导下一次执行**的 0.1.x 假设更正（历史记录不动）；0.1.5 死路径删除（§4.1 去留裁定逐点：0.2.x 上结构性不可达的分支随本 commit 删除并记 CHANGELOG；可保留的探针双模保留）。
- **做法**：bump-dsh.sh 既定流程（safe_point 时间序、`apply_bump`、`family_verdict`）。**硬规则（评审 R1-I6，非回退方案）：T12 与 T13 不可能分开交付——两者合并为同一收口 commit/PR 是前提**（退出标准 f + `.omo/compat.yaml:72` 的「the D7 pin flip is its last step, gated on L1+L2 evidence」）；开工 T12 即默认 T13 同批。
- **判定**：✅ **本机 0.2.x 全链绿（pre-pin 记录，T11 已落盘）** + **该收口 commit 上 CI 在新 pin 下 8 门绿**（评审 R1-I6 去自指：不要求在翻转前拿到翻转后的 CI 记录）；d09 绿；门 4/门 2 在新 pin 下绿（D7 常量与夹具同步的实证）；死路径删除清单成文。
- **证据**：⬜ 待填
- **依赖**：P4.5-T11。**量级**：3 小时。

### [ ] P4.5-T13 — L2 重验证 + 矩阵跨段迁移 + 文档收口

- **产出**：`.omo/evidence/concerto-verify-dsh-<rc>.md`（沿用 0.1.5-rc.1 证据文件的核对骨架在 0.2.x 重推导）；`.omo/compat.yaml` 的 0.2.x 行**跨段迁移**（`untested:` → `tested:`——补 **`{our, date, evidence}`** 字段集；**`our:` 取值裁定**（release-process §2a：`latest` 现为 `0.2.1`；裁定结果成文）+ **release gate 前置**：0.2.x 行在任何基于翻转后 pin 的发布**之前**已 `tested`——评审 R1-I1）+ 矩阵双语重渲染；README 状态行翻转（🔬 → ✅ 适配完成口径，含 (A)/(B) 终态与"≠ 0.2.x 特性消费"的 R-8 措辞）；CHANGELOG；decisions.md 带日期行（pin 翻转登记，沿用"无新增决策 + PRD §12 跟踪"体例）；PRD §12 该项翻 [x]；复核报告「实施期订正」节（若有实质出入）。
- **判定**：✅ 退出标准 (a)–(f) 逐条有证据指针（核对表回填到本文末尾）；门 7/4 绿；文档双语同 commit。
- **证据**：⬜ 待填
- **依赖**：P4.5-T12（同一收口 commit/PR，T12 硬规则）。**量级**：1 天。

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
