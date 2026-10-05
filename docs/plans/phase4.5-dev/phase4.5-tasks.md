# Phase 4.5 任务清单

> **上游依据**：[开发计划书](./phase4.5-plan.md) · [dsh 0.2.0-rc.2 复核报告](../../dsh-0.2.0-rc.2-review_zh-CN.md)（面权威）· [ROADMAP Phase 4.5](../../roadmap_zh-CN.md) · [决策 D7](../../decisions_zh-CN.md)
>
> **用法**：这是**唯一**记录 Phase 4.5 进度的地方。每完成一项，勾选并把"证据"栏填上实测输出（命令 + 关键行）。计划书描述"为什么这么做"，复核报告给出"每个面断在哪"，本文描述"做什么、怎么判定做完了"。
>
> **状态**：🚧 **5/13 + T8a + T8b**（T2–T7；WP-3 安装器交付线已落地并经四轮双评审收口，提交 `e588ea2`；**T8a / T8b 为 2026-10-06 新增切片**，见下方 D17 修订记录）（`[ ]` = 未开始 · `[~]` = 进行中 · `[x]` = 完成（证据已填）· ~~删除线~~ = 仲裁取消；T9 为 deferrable 项，defer 不算未完成）
>
> **修订记录**：
>
> - **2026-10-06 仲裁裁定 D17「放弃 0.1.5、只适配 0.2.x+」+ WP-4/5/6/7 重排序 + 新增 T8a**——业主裁定逐字：「**v0.1.5 不用兼容可以放弃掉，现在只需要适配 v0.2.x 以上**」。本条是本阶段**第二次**由业主直接改写计划前提（第一次是 2026-10-02 的工程师反馈修订 PRE-1），故与计划书 §4.1 的核心决策同批修订。
>
>   **一、D17 的内容**：0.1.x 的可执行分支**不再需要工作**。CI pin 仍停在 `0.1.5-rc.1` 直到 T12，但那是**过渡期的护栏**，不是要维持的能力承诺——**T12 翻转后 0.1.x 一律不再验收**。评审与派单中任何「0.1.x 腿绿不绿」的要求，在 T12 之后自动作废；在 T12 之前仍然有效（那是防回归的唯一真实信号）。
>
>   **二、D17 推翻的计划前提（唯一一条）**：计划书 §4.1 原写「本阶段全程保持同一代码在 0.1.5-rc.1 与 0.2.x 上都可工作（双模）」，理由是「若适配代码只能在 0.2.x 工作，特性分支的 CI 自第一个适配 commit 起全程红」。**该理由不再成立**——业主选择「快速收敛到单一目标运行时」，接受过渡期内 CI 仍绿这一护栏逐步退场。**但推论不是「立刻删双模」**：T12 之前 CI 仍跑 0.1.5-rc.1，**过早删除会让 CI 立刻全红且掩盖真正的 0.2.x 红点**。⇒ **双模保留到 T12，T12 之后删**（这条与计划书 §4.1 末尾「死路径在 pin 翻转 commit 一并删除」一致，只是删除被拆成两次）。
>
>   **三、重排序（新增 T8a / T8b，WP-4→WP-7）**：
>
>   | 序 | 任务 | 相对原计划 | 为什么 |
>   |---|---|---|---|
>   | 1 | **P4.5-T8a**（新增）drive.mjs 沙箱播种适配 0.2.x | 原不存在 | 见下「四、T8a 的由来」——**它是 Q-8 的硬阻塞** |
>   | 2 | T1 **Q-8**（v4 信封逐字形状） | 原挂在 T8 之前但从未做 | 被 T8a 阻塞；T8a 绿后可采 |
>   | 3 | **P4.5-T8** 双形状夹具 | 原位不变 | CI 仍钉 0.1.5 ⇒ 双形状在 T12 之前仍是必需的 |
>   | 4 | **P4.5-T9** defer 裁定 | 原位不变 | 判据改写见下「五」 |
>   | 5 | **P4.5-T10** 门断言迁移 | 原位不变 | 迁移重心顺序（门 3 > 门 8 > 门 2）**加权重排**：D17 之后 0.2.x 门绿才是唯一目标运行时 ⇒ **门 3 与门 8 从「次重心」升为主线** |
>   | 6 | **P4.5-T11′** 0.2.x 单运行时全链 + 金丝雀 | 原为「双运行时」 | D17 之后「双侧 8 门绿」不再是判定；**但 0.1.5 侧仍作为 pre-pin 记录跑一次**（CI 本来就在跑，零成本） |
>   | 7 | **P4.5-T12** pin 翻转 | 原为「最后一个工作包」 | **提前到 WP-6 之后**，因为 0.2.x 全链绿是它的前置；退出标准 (f) 由**此 commit 的 CI 在新 pin 下绿**承载 |
>   | 8 | **P4.5-T13** 死路径删除 + 矩阵迁移 + 文档收口 | 原含「0.1.5 死路径删除」，现独立成末段 | **拆分理由（对计划 §4.1 末尾的修订）**：翻转 commit 必须**小到能二分**——CI 一旦红，必须能立刻分清是「pin 本身」还是「顺手删的一大片」造成的。死路径删除随 T13 同 PR，不进翻转 commit |
>
>   **四、T8a 的由来（本次一手实测，非推算）**：仲裁者派 WP-4 前先探了门 3 的本机可跑性，**发现它在本机 0.2.x 上跑得动但红 9 条断言**，且红点唯一、根因已一手钉死 ⇒ **Q-8（v4 逐字形状采集）在修复它之前一条数据都采不到**。上游一手：本机 0.2.0-rc.2 的 `dsh-settings/lib/index.js:343-362` 逐字写着「Move the sections of the **removed** `settings.yaml` into the active profile **once the Loader has settled every entry**」，`:348-351` 是 `join(profile.home,"settings.yaml")` → `rename(path, \`${path}.imported\`)`，`:339-341` 该导入由 `ctx.root.loader.await().then(...)` 触发 ⇒ **0.2.x 删掉了 `settings.yaml` 这个配置面**，改为一轮「loader settle 之后」的补导入。实测：沙箱首启后 `settings.yaml` **消失**、原地留下 `settings.yaml.imported`；导入**确实成功**（`profiles/web/cordis.patch.yml` 里长出与种子逐字段相同的三行）——**但它落在 `loader.await()` 之后，而 `omo-agents` 的 route provider 判定在自己的 `apply()` 期** ⇒ 首启必然抢跑，boot marker 打 `[omo-agents] route provider not registered: deepseek`。**反证决定性**：同一沙箱**再启一次**（patch 文件此时已带那三行）该 marker **整行消失**。⇒ 修法是把 LLM 接线**种进 profile patch overlay**（drive 本来就在用 `--patch` 种 persistence overlay），使配置在 `apply()` 前在场。完整证据：`.omo/evidence/p45t8/ARBITRATION-feasibility-probe.md`（含沙箱原始件与二次启动对照）。
>
>   **五、T9 判据改写**：原判据是「仅当 T1–T8 期间发现 0.2.x 消费者对未知 kind 有实际误行为时拉入」。D17 不改变这条判据本身，但**改变了「期间」的跨度**——WP-4/5/6 全部只剩 0.2.x 一个运行时，因此「消费者」不再分两代。**defer 的门槛随之降低**：只需证明 0.2.x 上没有任何消费者对未知 `kind` 误行为即可 defer，**不需要** 0.1.5 侧的对照。
>
>   **五之二、T8a 双评审的两条裁定（2026-10-06，接在「四」之后）**：
>   - **裁定①「0.1.5 pin 与 D17 放弃 0.1.x 是否矛盾」——仲裁者原问前提不成立，撤回该问。** 双写对 0.1.5 是**零成本**的（0.1.5 的 npm bundle `dsh-llm-pi-ai/lib/index.js:2573` `let current = () => config`，组合配置本身就是 base 层；settings user layer 压在其上），**不存在取舍**。⇒ **真正的顺序纪律**（两路评审一致要求写进任务书，免得下轮重新吵）：**`settings.yaml` 那条腿在 T8 / T8b 期间保留**（它是 D17(d) 在 pin 翻转前保留的唯一非回归信号，删掉会让唯一的真实信号变红），**随 T13 的死路径删除一并删**。
>   - **裁定② T8a 的判据必须换掉，且换法已定。** 原判据「首启 boot log 无 marker」把一个 **8 秒窗口上的竞态**当成确定性证据（详见 T8a 段的「为什么改判据」）。换成 **A1′**：离线 `--dump-config` 断**组合结构**。**为什么必须是结构而不是退出码/stderr**：仲裁者实测——把 provider 键缩进改坏之后，`--dump-config` 仍 **exit 0**、stderr 仍 **`patch:` 零命中**，只有组合结果不同（`providers: null` + provider 键落成 `config` 的兄弟键）。**一个区分不出来的门等于没有门。**
>   - **顺带订正两路都抓到的一处措辞**：`name:` 只在 `llm-deepseek` 上省略（两代包名不同：`@deepseek-ai/dsh-llm-deepseek` vs `@deepseek-ai/dsh-llm-deepseek-api-key`）；`agent-default-model` 与 `llm-pi-ai` 两代包名**相同**，`name:` 是免费的、应当保留——**全省是过宽**。
>   - **归档的反空洞对照以评审 B 的隔离对照为准**（仲裁者已亲手复核其两个沙箱）：只删 `- id: llm-pi-ai` 一行、保留另两行 ⇒ marker 复现且 `patch:` 零告警；四行齐全 ⇒ marker 零命中。⇒ **承重的是那一行**，marker 追踪的是「那一行的 config 是否**可用**」而不是「写了几条行」。被评自己那对红/绿只说「三条行在/不在」，**区分不了「修好了」与「恰好别的坏了」**。
>   - **评审 A 顺带答了 T8b 的开放问题①**：`dsh-plugin-manager/lib/index.js:72-87` 对 pnpm 的本地目录依赖返回 `{kind:"path"}` 的**原始绝对路径**，即**本地目录依赖是被符号链接安装的**；而 `installPlugin()` 直接 `add` 仓内目录 ⇒ `import.meta.url` 会 realpath 回仓内。**这正是 `cp -r` 那一步承重的原因**，也是 A 推荐「装副本」而不是「改出货码注册出口」的依据。
>   **六、本次订正 T7 判定项③（DoD-d 回填，先前遗留）**：T7 证据段写「权威通道 = CI … **在 CI 跑绿之前不得声称 0.1.5 腿已验证**」——该句**当时是对的**（`compat-probe.yml` 因 `gh issue create` 哨兵 bug 挡在第一步，`main` 上两次定时 run 失败签名逐字相同，属先于本阶段存在的 CI 基础设施缺陷），**现按 PRE-1c 通道补齐**：本机 throwaway prefix 装真实 `dsh 0.1.5-rc.1`（`npm install --global --prefix … --before=2026-09-10T09:05:02.041Z`），空 `DSH_HOME` + `NO_PIAI=1 EXPLORE_PROVIDER/MODEL`（= `compat-probe.sh:70-73` 的同形）跑真实安装器 ⇒ `==> detected dsh 0.1.5-rc.1 — install face: filediscovery`，**退出码 0**，产物只有 `.agent-presets/concerto/{agent.cordis.yml,preset.yml}`、`profiles/` 未创建（正确）、与仓源差异**恰为 `:276-277` 两行**（env 覆盖）且 `:194 provider: spawn` 未被误伤、`preset.yml` 逐字节相同；**同一 0.1.5 二进制下完整 `scripts/ci-local.sh` 八门全绿**。原始件 `.omo/evidence/p45t7/T7-leg-0.1.5.md`。⇒ **判定项③ 由「未验证」转为「成立，通道 = PRE-1c 本机腿（非 CI）」**。D17 下这条证据的**前瞻价值归零**（0.1.5 不再是目标），但它仍是 T12 删除 0.1.x 分支前「那条路曾经是通的」的唯一存档。
>
>   **七、诚实登记：D17 没有消除任何已记录的返工成本**。计划 §4.1 当初选双模的三条理由里，第 3 条（「双模的探针本身构成『0.1.5 上没有静默退化』的证据」）在 D17 之后**失去价值**——因为不再需要证明 0.1.5 上没有静默退化。⇒ **净收益只有「范围收窄」一条；净损失是 T12 之前的双模维护成本 + T13 的删除成本**。这是业主的取舍，仲裁照办并把代价写在这里。
>
> - **2026-10-05 WP-3 / P4.5-T7 收口（提交 `e588ea2`）——安装器声明式迁移落地 + 四轮双评审 + 新增规约⑳⑲⑳b**
>
> **一、fork 裁定 = (A)**：依据四条互相独立的事实（F1 旧安装器在 0.2.x 上零读取方 / F2 (A) 的形状被四个 shipped preset 验证过四次 / F3 P0-1 反面对照 / F4 `dsh-agent-preset` 全文 29 行的承重链），(B) 被排除。**Q-7 从未做过，仲裁者先补了一手调研**（两个调研 agent 长时间零产出被中断，改用仓库归档的既有 boot 日志 + 一手源码完成裁定）。
> **二、真 boot 腿成立**：dsh 0.2.0-rc.2 沙箱 + **联网**安装器 + 真 `dsh web` → roster 5 条含 `concerto`（`broken` 键**全文件零命中**，是缺席不是空值）+ `session/create{agentPreset:"concerto"}` → `ok:true`。
> **三、四轮双评审**：轮 1 双 REJECT · 轮 2 A REJECT/B APPROVE · 轮 3 A REJECT/B APPROVE · 轮 4 A REJECT/B APPROVE ⇒ 轮 5 由仲裁者按两路共识收口（A 明确「只剩一个布尔项，不要开第 5 轮」），**最终零 BLOCKER/MAJOR**。六份 verdict 全部落盘 + sha256 清单。
> **四、规约⑳（本阶段最贵的一条）**：「**台账/报告说已闭合，但代码里不是那样**」本阶段发生**两次**——① 栽在「**缺断言**」（F2′：两路都以为代码里是 `json.dumps`，仲裁者自查发现**代码里根本没有**，且修复轮前的基线也已是裸拼接 ⇒ 是分段交付期间**并发改写**丢的；一份**完全合法**的 `preset.yml` 含 ASCII `": "` 就会让安装器 exit 1，仓内当时侥幸用全角 `：` 才没暴露）；② 栽在「**断言在但判定式错**」（`group is True` 严格窄于上游 `dsh-app-boot/lib/index.js:2100` 的三分支并集，`name: cordis:group` 那条**最规范**的写法照样溜过去 ⇒ 安装器 exit 0 + 产物两条活 preset row ⇒ 下次 boot `Duplicate agent preset: concerto`）。⇒ **闭合判据必须写成可执行形式**（形如「拒绝覆盖 `:2100` 的三个分支并各有一个用例」），**要能对着上游源码逐条对账，不能对着自己的实现自洽**。
> **五、并发写同一文件的代价（一次真实事故）**：分段交付期间两个 agent 同时改 `install-concerto.sh`，`json.dumps` 被覆盖丢失且**无人察觉**（两路评审的变异都是「改回裸拼接仍全绿」，因为它当时已经是裸的了）。⇒ **同一时刻只允许一个 agent 写同一个文件**；修复轮基线用 `git stash create` 打好以便逐行比对。
> **六、门禁闪烁与「观测值不是保证值」**：T7 的 58 个用例每个显式 60s（它们 fork 真实子进程，vitest 默认 5s 在负载机器上是抛硬币；「门禁若自己会闪烁，比没有门禁更坏」）。⚠️ 但**全量门 2 仍不是确定性绿的**——评审 A 测出 `tests/omo-hooks/background-notification.test.ts`（**不在 T7 diff 里**）吃默认 5s、负载下随机红 1 条 ⇒ 归 T2 线后续修缮，**不改 T7 结论**；本文件里所有「门 N 全绿」均应读作**观测值**。
> **七、本文件自身的三处订正**（DoD-d：改文档不改结论）：① 本文件 T7「做法」段原写「复用 concerto-mode-probe 的传输自适应通道」——**不适用**，probe 读的是 0.2.x 上零读取方的物化面；② 计划书 §4.4 `:561-566` → **`:561-565`**（实测 `wc -l` = 565，566 不存在）；③ 计划书 §4.4 (B) 的两个假想障碍**实测都不成立**、纪律⑤ 的路由与认证说明**跨代已变**（真名 `POST /api/agentPresets/list` 且**需要认证**，与 probe 注释记的 rc.6 免认证形态不同代）。
> - **2026-10-05 WP-2 收口复核：仲裁者补做 0.1.5 腿 ⇒ 抓出一条双评审都放过的 MAJOR，修完 CI 全绿（`de68919` / run `37220817614`）**——本条同时**订正本文件三处失真陈述**，并新增规约⑮–⑲。
>   **① 缺的那条腿**：T5/T6 的判定项都写着「0.1.5 CI 绿」，但 **WP-2 的五个提交从未推送** ⇒ CI 里根本没有它们的 run（`gh run list` 上 WP-1 的 T2/T3/T4 有绿 run，WP-2 一个都没有）。仲裁者 fast-forward 推送（`977f813..fdc7e47`）触发 CI ⇒ **run `37200076805` 门 3 红**，且**重跑后 attempt 2 仍红 ⇒ 确定性回归，不是 flake**。门 1/2 绿、门 4–8 skipped。
>   **② 定位方法（本阶段最可复用的一条）**：drive 的摘要是一行超长 JSON，被 GitHub 日志采集器在 ~65 KB 处截断 ⇒ **拿不到失败场景名**。改用**跨 run 的逐场景 stderr 差分**（绿基线 `37150775008` vs 候选 `37200076805`）：33 个场景**全部 +2 行**（新增的 read-face 两行），**唯独 `prometheus-md-only-denied` 是 −2**，且它停在 `read-face expected …: 2` 之后**再无输出** ⇒ 校验器在该场景抛异常、场景被中止。
>   **③ 根因 = T6 把「跨面同源」当成了不变量，而它只在一个运行时成立**：场景 `prometheus-md-only-denied` 用 `augmentMaterialized`（`enablePrometheusWriteTools`，`drive.mjs` `lines.splice(filterIndex, 2)`）删掉沙箱副本里 prometheus 行的 `toolFilter`，而 read 面期望仍取**未编辑**的 `src/roster.ts`。**0.2.x 的 read 由 `register()` 供给**（渲染自仓库模板 ⇒ 沙箱编辑不可见 ⇒ 绿）；**0.1.5 由文件发现供给**（就是那份被编辑的物化文件 ⇒ 编辑可见 ⇒ 红）。修法是结构化的：fixture **必须声明** `(row,key,after)`，校验器把被声明格的接受集变成 `{roster 值, 声明后值}` 二值集合（退化列表两边都不匹配 ⇒ 仍必红），**且只允许叶子级声明**（去掉容器键 `toolFilter`，否则一条声明同时免掉 deny 与 allow 两格，把残余边界的爆炸半径从 1 格放大到 2 格）。**不是场景特例、不是跳过。**
>   **④ 本文件三处失真陈述，就地订正**：
>   - T6 判定段写「PASS banner（probe :1228）重写不得削弱…（门 8/`run-proofs.sh` 消费该文案）」——**与代码不符**：`scripts/run-proofs.sh` 的 7 条 proof 里**没有** `concerto-mode-probe.sh`，该文案的真实消费者是人读的文档（`docs/manual-testing.md:65` / `_zh-CN.md:65`）⇒「不得削弱」目前是**文档纪律、非机器强制**（非 WP-2 引入，基线同构）。
>   - T6 证据段写「门 3 **NOT RUN**（需真 LLM 凭据，本机缺 `dsh-llm-deepseek` adapter）」——**结论对、机理错**：门 3 **跑得动**（`--self-test` 结构性不覆盖 read 面，因为它只在场景 runner 里被调用），本机实跑 33 场景、read 面断言**确实执行了 33 次**；红的原因是**ambient `route provider not registered`**（`mockRequestCount=0`），不是缺凭据。**这个差别有操作后果**：缺凭据会让 harness 卡在启动处、WP-2 那一格什么都验不到；ambient 红反而把 read 面断言**留在可观测范围内**。
>   - 证据栏的「双评审 APPROVE」此前**只有叙述、没有落盘的 verdict 文件**（T6 的 A 复评 APPROVE 全文字面零 `APPROVE`）。现补齐。
>   **⑤ 双评审为何都没抓到（写入台账防复发）**：评审 B 静态对账 + 抽函数实跑，**从未跑过 33 场景全链**；评审 A 跑了全链但只在 **0.2.x** 上（该场景在 0.2.x 恰好不触发），且本机 33 场景**全部**因 ambient 红，逐场景差异被**总红淹没**。
>   **⑥ 终态（仲裁者独立复跑 + CI 双证）**：门 1 `typecheck` 0；门 2 **58 files / 1492 tests**（T6 后 1473，**只增不减**）；门 3 **0.1.5 真机绿**（CI run `37220817614` 八门全绿，`read-face asserted` 出现 **33 次**、`prometheus-md-only-denied` 打出 CI 里原本缺失的那一行、drive 终判 `{"result":"PASS"}`、门 4 `dsh-version: pass (dsh 0.1.5-rc.1)`）；门 5 `checked=56 · violations=0`（零新增依赖）；门 6 **33/33**（c01–c24）；门 7 `9/9`；门 8 `run-proofs PASS 7/7`；本机 0.2.x 场景级 `bash scripts/concerto-mode-probe.sh` ⇒ `registered: id=concerto broken=absent` + `concerto:broken=absent` + FACE B + `READ-FACE PASS`（fetched 101226 B / read 98962 B，与 T6 记录逐字节相同）。
>   **⑦ 双评审四次出场，修复五轮**：轮 1 A=REJECT(2 MAJOR)/B=REJECT(2 MAJOR) ⇒ 修；轮 2 **双 APPROVE**（留下 3+3 条 MINOR）⇒ 修；轮 3 **双 APPROVE**（A 又证伪一条**被证伪过的注释**）⇒ 修；轮 4 **双 APPROVE**（收口）⇒ 修 2 条 nit。两路在最后一轮**独立裁决了同一个记账分歧（M-ROSTER-B 门 2 红例数）并一致判为 12**（B 明确撤回自己上一轮报的 11）⇒ 落盘 `.omo/evidence/wp2-fix1/review-{A,B}/verdict{,2,3,4}.txt`。
>   **仲裁者被推翻 2 次的台账**（本阶段）：一次是本文件把「门 3 跑不通」的机理写成缺凭据（实为 ambient provider）；一次是本文件称门 8 消费 banner（实为无人消费）。
>
> **修订记录**：
>
> - **2026-10-04 WP-2 收口（T5 + T6 双 APPROVE 已提交；⑬⑭ 两条规约补齐）**——**WP-2 两个任务全部落地**（T5 = `028f015`，T6 = `51e6ba0`，中间一笔纯 docs 的仲裁自我更正 = `acbe09a`）。**⑬ 同名不同形的引用不得用本仓近似物代替上游**：仲裁者曾断言 `read` 的 `content` 里 `!!js` 会「变两行」——**错**（上游 `vendor/include/src/index.ts:9-15` 的 `JsExpr` 带 `represent`，`:14`，那是 dump 路径的钩子）。⑭ **改一个被多个消费者共用的 API（签名/参数/契约）时，必须同轮改完所有消费者，并留下「消费者个数」的静态断言**——T6 的两条 MAJOR **同源于此**（probe 少传第 6 参 ⇒ 门 3 必红；drive 的 resolver 少解 symlink ⇒ 必抛）。**配套诚实要求：注释里的 `cannot drift` 不是证据，机器对账才是**——编码方曾在代码注释里写 `so the two consumers cannot drift`，下一轮即被证伪。**本阶段仲裁者被推翻 5 次的台账**见 `.omo/evidence/p45t5/ARBITRATION-primary-source-verification.md` §6d2（其中 2 次会直接影响出货正确性：MINOR-2 的修法若被执行则 read 面的 `!!js` 门**静默漏过真正的退化形状**；MINOR-1 的措辞若被执行则**8 条新增门禁被叙述成注释藏起来**）。**双评审四次出场**：A/B 首轮各 REJECT、修复后各 APPROVE，累计变异 30+ 次、每次还原经 sha256 逐字节验证。
>
> - **2026-10-04 T5 收口新增纪律（⑩–⑫，T6 起生效）**——**⑩ 引用落点**：引用必须落在**语句/声明的起始行**或**成对区间**，**不得落在多行语句的中间文本行**。T5 编码方自查（**两路评审都没抓到**）发现报告里「仍缺席 `:813` throw」的 `:813` 是 throw 的**消息文本行**，语句起始行实为 `:817`，差 1；同组其余锚点（`:806`/`:808`/`:817-818`/`:820`/`:821`/`:822-824`）逐条 grep 均精确，**唯独这条是平移推算出来的**——**靠推算的锚点就是会错的那个**。规约：凡行号是**推算**而非当场 grep 得到的，一律不得写进报告。**⑪ 计数漂移要当场登记**：T5 落地后 R1-B2 可数清单已漂（probe **60→63**、`concerto-preset.test.ts` 的 `.agent-presets` **11→12**、`roster-composition.test.ts` 的 `.agent-presets` **`:81` 保留 + 新增 `:300`**），全部由 T5 自身**授权**的新增造成、**零删除**；清单是**记账时点**的快照，任务推进后必须由**仲裁者**重锚（编码 agent 无权改 docs），否则下一任务开工即拿着过期数字施工。**⑬ 同名不同形的引用不得用本仓近似物代替上游**（2026-10-04 仲裁者自曝）：仲裁者曾断言 `read` 的 `content` 里 `!!js` 会「变两行 `__jsExpr`」——**错**，因为模拟时用了本仓的 `makeJsExprType`，而上游 `entryListSchema` 由**另一个 Type 实例**扩展，它多一个 `represent: (data) => data['__jsExpr']`（`vendor/include/src/index.ts:9-15`，`:14`）——**`represent` 是 dump 路径的钩子**，而 `content` 恰恰是 dump 出来的 ⇒ 真 `content` 里 `!!js` **仍是单行 tag、与物化文件同形**。**凡结论依赖某个 schema / Type / 常量的成员，必须回上游确认完整定义**——本仓 `makeJsExprType` 与上游 `JsExpr` 几乎同名、差一个成员。本阶段同类前车：`remoteExportList()` 是**信封**而 `list()` 是**数组**（§6c）。⑫ 审计记录里必须留得住「当时错的是什么」：为让一条**临时 grep** 归零而把被修的字形从证据文档里抹掉＝**用可审计性换一条不存在的门禁**（本仓门禁是 1–8，没那条）；**出货码与测试零命中是判据，证据文档直书原字形是纪律**——两者不冲突。
>
> - **2026-10-04 WP-2 开工前仲裁修订（T1 Q-2/Q-3/Q-4 实测落地；**T5 起全部生效**）**——三条硬约束进 T5/T6 的做法与判定段（成文依据 `.omo/evidence/p45t1/Q2-yaml-parsing.md` 与 `Q3Q4-register-contract.md`，计划书同批修订）：⑴ **零新增 npm 依赖**——T5 的「`package.json` 依赖变更（若 Q-2 定案引入 `yaml`）」分支**关闭**（该包未安装不可解析、license 实为 ISC、依赖链未端到端验证），改为复用 `scripts/doctor-lite.mjs` 已有的「定位已装 dsh 的 node_modules → 动态 import `js-yaml`」路径；连带 `verify-licenses` 白名单零新增、`checked` 恒 **56**、pnpm-lock 无变更。⑵ **「注册成功」的唯一证据是回读**——mount 失败**绝不 reject**、只写 roster 的 `broken`，且 host 的 `logger.warn` 在捕获流里没出现；故验收/单测**必须**回读 roster 断言 `broken` 缺席，omo-agents **自己**打 `broken` 的 boot marker（「register 不抛」当证据会放过模块名拼错与 `disabled` 承载写错两类真实故障）。⑶ **「时机」降级为「调用点」**——唯一实测可用调用点是 `ctx.inject(['agentPresets'])` 回调（apply() 同步段 100% 拿不到句柄，register 本体 4–9ms），**不得设计等待/重试**；**Service.init + yield 候选裁定不采用**（与 `ctx.inject` 回调等价已实测，改 Service class 形态要付 `boot-markers.test.ts` 的 `apply()` harness 全量改造成本）。附三条随附纪律：`!!js` 载体断言（`typeof row.disabled === 'string'` 即 fail，`entryListProblem` **不是**安全网）/ roster 首读可能为空（probe 不得只 grep 前缀，空串也命中）/ `isDefault` 只在 `remoteExportList()` 上（走 `list()` 断言永远失败）。
>
> - **2026-10-04 WP-1 收口（T2–T4 全部落地，双评审 APPROVE，仲裁成文）**——三个 jobs 触点的双模改造完成，`ctx.jobs` 在 0.2.x 上的三个断裂点（caller Agent→SessionId、`ownerSession`→owner、`reported` 删除 + `onJobDone`→`events.subscribe`）各自有了**会叫的金丝雀**：T2 真机沙箱 3 个真实 job 产出 2 条锚点、缺的恰是 `awaited:true` 的那个；T3 出货 guard 真取消 `t3probe-1`、裸 `kill` 返回 `'requested'`、外来 caller 抛 `belongs to another session`；T4 `jobId:"ulw-execute-1"` 且三态日志在真机上互不相同。**本阶段沉淀的规约（对 T5 起全部生效）**：⑴ **修复轮前先打可比对基线**（`git stash create`；干净树则记 HEAD）——否则「修复轮没碰可执行行」只能给无反证，两路评审都会明确回答「无法独立证实」。⑵ **引用回查必须覆盖测试文件**，且**总账要能被第三方按归档脚本重算**。⑶ **一次性环境里的行号读数必须归档原文**（安装日志只证明「装上了」，不证明「读到了哪几行」）。⑷ **引用声明写成成对区间**（文档行+声明行），不写单行。⑸ **仲裁者给出行号时必须标注「已核对」或「待核对」**——本阶段三次口误（T3 的 `view.ts`、T4 的 `jobs-local:240`、preflight 顺序）全部源自把未核对的行号当权威转述。⑹ **审计结论不得先于审计本身下判**（「N 处全对」「0 wrong」这类总账必须可重算）。⑺ **断言必须对变异敏感且真的验过**：T4 的自检第一次是**绿的**（暴露了断言真空），补断言后再变异才拿到红；**门禁若自己会闪烁，比没有门禁更坏**——两头都坏（多数时候给假信心，少数时候随机红灯），T4 因此新增「确定性契约」注释与基数守卫。⑻ **语义变宽必须扫下游文案**：T4 的 `degraded` 从「服务缺席」变宽到「含 preflight 拒绝」后，调用点那句 `result.degraded ? ' [jobs absent]' : ''` 立刻变成**说谎的日志**，必须连同调用点一起改。⑼ **计划/派单里的引用同样要回查**：本阶段共 4 次「文档或派单里的行号是错的」，其中 3 次出自仲裁者——引用纪律对**一切来源**同等适用，不因出自计划书或仲裁者而豁免。
>
> - **2026-10-04 实施期修订（T2 落地，双评审裁决后成文）**：T2 的实施期裁定已成文，**T3/T4 直接继承**（先读这段再开工）——① **共享探针已落**：`patches/omo-dsh/omo-hooks/src/dsh-runtime-shape.ts`（`src/` **根**，不在 `src/hooks/`——c13 会把无 manifest id 的 `.ts` 判 orphan、`verify-concerto-static.mjs:828-831`；c21 由同一目录推导 NOTICES 计数）。**新增 `src/` 根文件必须同时登记进 `tests/omo-hooks/strip-only.test.ts` 的双向等值 roster，否则门 2 红**（T2 已登记 `dsh-runtime-shape.ts`；T3/T4 若再加文件同样要登记）。② **T3/T4 必须 import 这一个 `dshRuntimeShape`，不得各自再写一份判定**（T2 内 `hasPushFace` 与 `adoptJobs` 各判一次同一谓词已是上限，评审 A 已记录为观察项）。③ **ADR-2 兜底已用**：0.2.x filter = `{ owners: 'all' }`，理由与「直接比对未测成（Q5 §4.1）」的限定写在 `background-notification.ts` 文件头——T3/T4 的注释引用同一份论证，不要各自重写。④ **ADR-5 的包装器**：`wrapDisposer`（先翻 push verdict → 最多调用一次服务 disposer）两代共用；它对 0.1.5 分支是**唯一的非措辞语义变化**（改造前重复调用会重复执行服务 disposer），已成文。⑤ **顺序**：Q-6 尚未闭环，故 T3/T4 不与 T2 并行开工（R-10 精神），按 T2 → T3 → T4 串行；**§4.2 的「三触点在同一 mock 下取同一 `dshRuntimeShape()` 值」一致性断言落在 T4**（需 T3/T5 的分支已存在才有意义）。⑥ 门 3/门 8 在本机 0.2.x 上因 P0-1 已知红，WP-1 三任务一律**不跑**这两门，证据里写明「未跑 + 原因」。⑦ **T2 双评审暴露的三条流程缺口，T3/T4 开工即生效**（两路评审独立指出，仲裁采纳）：⑴ **修复轮前必须打可比对基线**——T2 未提交、无 stash，`git diff` 只有「对 HEAD 的合并视图」，导致「修复轮未改任何可执行行」这一声明**两路评审都明确回答「无法独立证实」**（只能给无反证）；T3/T4 起，编码 agent 在**收到修复轮之前**先 `git stash create` 存一份悬空提交并在报告里给出 SHA，使修复 diff 可被逐行比对（`git stash create` 不动工作树/索引/HEAD）。⑵ **引用全量回查必须覆盖测试文件**——T2 的 F0 只扫了两个源文件，MAJOR 的第 4 处（测试文件里的同一处错误区间）是**碰巧**捞到的，不是系统性扫出来的。⑶ **一次性环境里的行号读数必须归档原文**——0.1.5 腿在 throwaway prefix 上核的约 22 条行号，因 prefix 已删而**永久不可复核**，而安装日志只证明「装上了」、不证明「读到了哪几行」；T3/T4 若再需要一次性环境核行号，必须把 `awk`/`sed` 的**输出原文**与安装日志一起归档（或不删 prefix）。⑷ **锚点写成规约（T3 评审 A 提出，仲裁采纳）**：引用**声明**时一律写成**成对区间**（文档行 + 声明行，如 `view.ts:76-77`），不写单行——T3 的 7 处 off-by-one 正是「只锚到文档行」造成的，且该错**源自仲裁者派单时的口误**，扩散后连「A 类 0 wrong」的审计结论都被带歪。**引用派单里给出的行号仍须逐条回查**，不得因为「任务书/派单这么写」就照抄。⑸ **审计结论不得先于审计本身下判**：分类计数与「N 处全对」这类总账必须能被第三方按 extract 重算（T3 两处记账偏差、mcode 抓到一条「归因命令跑不出该数字」的假 VERIFIED，都属此类）。
>
> - **2026-10-02 环境现实修订（工程师反馈，实测成立）**：PRE-1 拆分重写——本机二进制 = 0.2.x 而 ci-local 门 3/4/8 消费环境 dsh 二进制，原「0.1.5 pin 下退出 0」在本机不成立。PRE-1a = 0.1.5 侧基线取 develop 最近 CI 绿（权威侧）；PRE-1b = 本机 0.2.x 基线，判定改为**红的位置与形态成文记录**（P0 的 before 证据，与 PRE-5 互为表里）；PRE-1c（可选）= throwaway-prefix 0.1.5 本机腿（T11 机制通道之一）。T11 补机制注记（0.1.5 侧 = CI 或 prefix 腿，证据文件注明实际通道与二进制来源）。
>
> - **2026-10-02 计划期评审修复（第 3 轮）**（评审：[`phase4.5-review-3.md`](./phase4.5-review-3.md)，新发现 3 项全部采纳，无阻塞——复审确认第 2 轮 5 项落实正确）——T1 的 Q-4 补裁定输入指针（`boot-markers.test.ts` 的 `apply()` harness 重写成本，R3-I1）；其余落计划书（重心序列「门 2 仅增量」、§4.6 增量清单补结构断言、`registry.ts:300-301` 行号）。
>
> - **2026-10-02 计划期评审修复（第 2 轮）**（评审：[`phase4.5-review-2.md`](./phase4.5-review-2.md)，新发现 5 项全部采纳——复审确认第 1 轮 14 项落实正确、2 项驳回成立）——R2-B1：T6 单测侧改「**保持不动 + 仅新增** `renderConcertoComposition()` 纯函数用例」（原「路径契约测试改写为 read 文档断言」不可执行——单测无 RPC 能力，且会删掉 B4 写盘契约的唯一自动化保护；read 文档锚点断言归位 probe/drive.mjs 运行时面）；R2-I1：T5 做法段的时机结构断言改写为「`omo-agents` **不在被注册组合的行集内**」（结构性不变量，替代被证伪的「inject 异步」说法）+ Q-4 的 Service.init + yield 候选若经 T1 裁定采用由 T5 一并落地；R2-N1/N2 随计划书同步（§8 三行与「双模更正」措辞）。**评审方附带正面确认**：安装器 (A) 三前提全部有上游先例（见计划书 §4.4 修订记录）。
>
> - **2026-10-02 计划期评审修复（第 1 轮）**（评审：[`phase4.5-review-1.md`](./phase4.5-review-1.md)，16 项中 14 采纳 / 2 驳回——裁定细节与证据见[计划书修订记录](./phase4.5-plan.md)）——头部证据纪律对齐（适配任务 = 受影响门 + 场景级 0.2.x 记录，全链双运行时由 T10/T11 承载，I7）；T1 改逐 Q 独立交付（R-10）+ Q-3 增 ⑥ 时机问与附项 a（两侧 `content` 锚点齐全性）/b（`RosterEntry.trust` 裁定）+ Q-8 挂传输硬绑定确认（N3）；T5 产出改 `renderConcertoComposition()` 纯函数 + 保留写盘契约（B4）+ register 时机结构断言（R-9）；T6 断言生态改单一 `agentPresets/read` 断言面（B1）+ 可数清单全覆盖（B2）+ 禁止落回物化兜底 + banner 否定断言保护（N2）；T10 补门 6 低风险与迁移重心次序注记；T11 依赖改显式枚举（含 T7，I5 驳回后按建议精神消歧）；T12 交付物补 `doctor-lite-core.ts:15-17,44` + `doctor-lite.test.ts:39-50`（B3）、T12/T13 同 commit 改硬规则、判定去自指（I6）；T13 补跨段迁移字段集 + `our:` 取值裁定 + release gate 前置（I1）。
>
> **编号**：`P4.5-T<n>`（Phase 4.5 - Task n）。工作包归属见计划书 §7。**证据纪律（评审 R1-I7 对齐后口径）**：适配任务（T2–T8）的证据栏要求**受影响门 + 场景级**的 0.2.x 记录（如 T3 = 0.2.x 实跑 `kill` 返回 `'requested'` + 门 2 双形状单测），不要求每任务跑完整 8 门双运行时全链——**全链双运行时复跑由 T10/T11 统一承载**；0.1.5 侧以 CI 绿为准。
>
> **规约⑮–⑲（2026-10-05 WP-2 收口复核产出，T7 起生效）**——本阶段五条 MAJOR/MINOR 的**共同根因**是「**断言/结论与它所断言的对象同源**」，以及「**不可复核的断言被当成已核**」，故成文如下：
> - **⑮ 每个评审的最终 verdict 必须落盘为独立文件**（`<task>/review-<X>/verdict[-<n>].txt`），并在证据报告里给出该文件的 sha256。**「报告里写了 APPROVE」不构成可复核的双评审证据**——它与「报告里写了已修复」是同一种不可核验的断言。本阶段 T6 的 A 复评 APPROVE 就只有叙述，直到收口轮才补上落盘件。
> - **⑯ 评审「跨运行时双面」任务时，「本机跑通」不等于「另一运行时跑通」**；且当一条链路上**所有**场景同时红时，**逐场景差异会被总红淹没**——必须做**跨 run 的逐场景差分**（绿基线 vs 候选），而不是只看总退出码。本例中若没有 T4 的绿 run 做基线，这条 MAJOR 会被两路评审一致放过。
> - **⑰ 一条「另一条腿」没跑过时，不得在判定项里写它绿**。T5/T6 的判定项都写着「0.1.5 CI 绿」，而那两个提交从未推送 ⇒ 这条腿**从未存在**。**判定项的每个数字都必须能指向一次具体的、可复算的执行**。
> - **⑱ 跨面断言的独立性必须逐维声明，且要写明它**不覆盖**什么**。`agentPresets/read` 逐元素断言的独立性**只覆盖「读面字节不是期望来源」这一维**；它**不覆盖**「面与期望共用 `roster.ts` 单源」这一维——`concerto-preset.ts:319` 渲染面与 `drive.mjs:14866` 构造期望调用**同一个** `denyToolNamesFor`，改 `roster.ts` 会让两侧同时移动、校验器 exit 0（实测；防线在门 2 与 c10.5）。ALLOW 侧**不**共用（模板里 multimodal-looker 的 allow 是静态 YAML、无哨兵，`concerto-preset.ts:36-38`）⇒ 这个**不对称**是关于这个面的事实，不是防线。
> - **⑲ 不得写下自己无法证明的绝对断言**。本阶段实测被证伪两句：① banner 的「never from these bytes」——校验器**拿不到期望的来源**，无法自证；② 注释的「产品退化做不到」——见⑱。**判据不是措辞谨慎，而是这句话能不能被一行探针做成假的**；能，就写不成立的那一版并附上实测数字与它真正的防线在哪。

## 0. 前置条件（开工前必须成立）

| # | 条件 | 判定 | 复核结果 |
|---|---|---|---|
| PRE-1a | **0.1.5 侧基线（权威 = CI）**：`develop` 最近一次 CI 绿（CI pin 本来在 `0.1.5-rc.1`，`ci.yml:102`） | `gh run list --branch develop --workflow ci.yml --limit 1` 取最近绿 run（无 gh 时记 CI 页面快照）；记录快照数字（门 2 测试数、门 3 场景数、门 6 断言数、门 7 检查数、门 8 proofs 数） | ⬜ 待跑 |
| PRE-1b | **本机 0.2.x 基线 = P0 的 before 实证**（工程师反馈修订——`scripts/ci-local.sh` 的**门 3（e2e）/门 4（doctor-lite）/门 8（proofs）消费环境 dsh 二进制**（drive.mjs 沙箱 boot / `dsh --version` 对 D7 / prove-*.mjs boot），门 1/2/5/6/7 不碰；本机二进制 = 0.2.x，「0.1.5 pin 下退出 0」在本机不成立） | 本机跑 `scripts/ci-local.sh`；**判定 = 红的位置与形态成文记录**（预期：门 3 红于 P0-1 roster 缺席、门 4 红于 `dsh-version` 对 D7、门 8 红于物化 preset 依赖；门 1/2 应绿）——**不是退出 0**；与 PRE-5 的冷启动记录互为表里 | ⬜ 待跑 |
| PRE-1c（可选） | **本机 0.1.5 腿**（需要本地双腿验证时，含 T11 的 0.1.5 侧本机通道） | throwaway-prefix 安装：`npm install --global --prefix <dir> @deepseek-ai/dsh@0.1.5-rc.1 --before=2026-09-10T09:05:02.041Z`（dsh-0.1.5-rc.1-review 先例 + D7 截止，d09 同源）→ `PATH="<dir>/bin:$PATH" scripts/ci-local.sh` 8 门绿；采用与否记修订记录 | ⬜ 可选 |
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

### [x] P4.5-T2 — background-notification：events.subscribe 三级探测改造

- **产出**：`background-notification.ts` 双模改造（`jobs.events?.subscribe` 优先 → `onJobDone` 回退 → 既有 pull 降级）；`settled.awaited` 替代 `reported` 去重；双形状参数化单测。
- **做法**：filter 按 T1 Q-5 结论选定（等价性理由写入代码注释）；subscribe disposer 按 Q-4 接线纪律持有；结构类型声明 0.2.0 形状（`events`/`JobView`）与 0.1.5 形状并存为可选；boot marker 的三态可区分（`push path live (events)` / `push path live (onJobDone)` / `degraded pull path`）——marker 措辞变更进测试与 probe 同步网。
- **判定**：✅ 单测双形状各一轮（订阅建立、事件去重、降级切换）；0.2.x 本地场景中后台 job 完成通知真实到达（非降级路径）；0.1.5 CI 绿。
- **证据**：✅ `.omo/evidence/p45t2/T2-background-notification.md`（+ `logs/` 17 份；`.omo/` 被 gitignore，证据留本地不入库）——门 1/2/5/6/7 全绿：`typecheck` exit 0；`vitest` **56 files / 1392 tests**（基线 55/1366，**+1 文件 / +26 用例，只增不减**）；`verify-concerto-static` **31/31**；`check-docs-consistency` **9/9**；`verify-licenses` `checked=56 · violations=0`（零新依赖，计数未变）；门 4 `doctor-lite` exit 1 红点 = `{dsh-version, llm-adapters}`，与 PRE-1b **同形**（0.2.x 本机 vs D7 pin 0.1.x，非本任务引入）；门 3/8 **NOT RUN**（消费环境 dsh 二进制 + P0-1 已知红，非本任务面）。**场景级 0.2.x 证据**：真 `dsh 0.2.0-rc.2` throwaway 沙箱两条腿（immediate + 真实 `ctx.inject` 延迟腿），3 个真实 job → **2 条锚点、缺失的恰是 `awaited:true` 的那个**（ADR-3 金丝雀在真机可分辨，非 boot 绿）；断言边界诚实：判据是「无 FAILED 行」而非「观察到桌面通知」。**0.1.5 腿**：本机无 0.1.5 二进制故未跑，**权威侧 = CI（D7 pin 0.1.5-rc.1）**——裁定 = **run `37141522401`（commit `1a878be`）`success`：8 门全跑全绿**，门 2 `56 files passed`、门 4 `dsh-version: pass (dsh 0.1.5-rc.1, pinned 0.1.x, decision D7)` + `llm-adapters: pass`、门 5 `checked=56 · violations=0`、门 6 `31/31`、门 7 `9/9`、门 8 `run-proofs: PASS — 7/7 … on dsh 0.1.5-rc.1`；**门 3 的 `background-notification-log` 场景在 0.1.5-rc.1 沙箱真 boot 上跑通**（preset concerto 可用 → turn/end → 场景断言绿），即 v1 `onJobDone` 推送路径在真机仍产出锚点。双评审：第 1 轮 A=REJECT（1 MAJOR+3 MINOR+4 NIT）/ B=APPROVE；修复轮后**双 APPROVE**，原 MAJOR 闭合。
- **依赖**：P4.5-T1。**量级**：3 小时。

### [x] P4.5-T3 — stop-continuation-guard：SessionId caller + owner 围栏双模

- **产出**：`stop-continuation-guard.ts` caller 构造（:264）按 `jobs.events !== undefined` 探针分叉；`owner ?? ownerSession` 双读；`StopContinuationJobsLike` 结构类型双形状；单测。
- **做法**：0.2.x 分支 caller = `sessionId` 字符串（`SessionId` 品牌类型的结构等价）；0.1.5 分支保持 `{id: sessionId}`；围栏语义（无主 job 跳过、`already-finished` 判定、`STOP_CANCELLATION_REASON` 逐字）两分支一致；**金丝雀单测** = 0.2.0 形状 mock 下 `cancelledJobIds` 含目标 id（不是空转）。
- **判定**：✅ 单测双形状（级联命中/级联空转可区分）；0.2.x 实跑 `kill` 返回 `'requested'`；0.1.5 CI 绿。
- **证据**：✅ `.omo/evidence/p45t3/T3-stop-continuation-guard.md`（+ `logs/` 15 份）——门 1/2/5/6/7 全绿：`typecheck` exit 0；`vitest` **56 files / 1408 tests**（基线 T2 后 1392，**+16 只增不减**）；`verify-concerto-static` **31/31**；`check-docs-consistency` **9/9**；`verify-licenses` `checked=56 · violations=0`；门 4 红点与 PRE-1b 同形；门 3/8 **NOT RUN**（P0-1 已知红）。**场景级 0.2.x 证据**（真 `dsh 0.2.0-rc.2` 沙箱，probe 按绝对路径 import **出货的** guard）：`guard.stop(sessionId)` → `cancelledJobIds:["t3probe-1"]`；裸 `kill(id, sessionId, reason)` 返回 **`'requested'`**；外来 caller 抛 `belongs to another session`（证明字符串 caller 真被咨询）；`list()` 行普查实测 **`owner` 是字符串且无 `ownerSession` 键**（双读设计获真机正面证实）；kill 后 `stopping` 存活。**Q-6 仅闭合 kill 面**（`get`/`read` 输出语义仍属 Q-6，证据里明写不得读成全闭合）。**0.1.5 腿**：本机无 0.1.5 二进制，权威 = CI——**run `37145024889`（commit `97ae6c6`）`success`**：门 2 `56 files passed`、门 5 `checked=56 · violations=0`、门 6 `31/31`、门 7 `9/9`、门 8 `run-proofs: PASS 7/7`。双评审：**两路均 APPROVE**（残留 1 MINOR + 4 NIT 全为文案/记账，已修）；最大一条（`view.ts` 锚点 off-by-one ×7）源自仲裁者派单口误，规约已入本文件 ⑦⑷。
- **依赖**：P4.5-T1。**量级**：3 小时。

### [x] P4.5-T4 — ulw-execute/live-state：JobSpec 双模 + 降级可区分

- **产出**：`live-state.ts` `start()` spec 按探针分叉（0.2.x：`{kind, label, owner: sessionId}`，终态写在 **`result`** 而非 `output`）；preflight 拒绝与真实启动失败的日志区分；单测。**措辞订正（2026-10-04，T4 实施期）**：① 原写「`run(job)`」——实到货是**单个零形参闭包两代通吃**，0.2.x 在 `jobs-local/src/index.ts:239` 处确实把 `JobHandle` 递进 `spec.run(handle)`，本端口**有意不消费**（真机证据 `p45t4/logs/T4-scenario.ndjson` 的 `D-run-arity`）⇒ 分叉实为**两件**（owner / 终态键），不是三件。② 「outcome 读 `result ?? output`」**只对生产者 `JobOutcome` 成立**：0.2.x 的 `JobView.output` 是**对象** `{total, earliest, spillPaths?}`（`view.ts:99`），瞄 view 会还你一个对象；本模块**只写不读**，该双读表达式目前是给未来读面/canary 用的**单一可审计出口，无生产调用方**（读侧待接，记此备查）。
- **做法**：0.2.x 分支的 `owner` 传**当前会话 SessionId**（Q-6 实证的 preflight 语义——非在册拒绝仍走既有 catch 降级）；`run` 的签名按 `JobHandle` 形状；「`degraded: true` 且日志含原因」为可观测纪律（复核 §3.2-3 的「日志依旧干净」病灶的正面修复）；H-32 激活语义零变动（本任务只动 job 承载）。
- **判定**：✅ 单测双形状（启动成功/preflight 降级/服务缺席三态可区分）；0.2.x 实跑 `jobId` 非空；0.1.5 CI 绿。
- **证据**：✅ `.omo/evidence/p45t4/T4-live-state.md`（+ `logs/` 20 份）——门 1/2/5/6/7 全绿：`typecheck` 0；`vitest` **57 files / 1447 tests**（T3 后 1408，**+1 文件 / +39 用例，只增不减**，既有 119 条 v1 用例零删除）；static **31/31**；docs **9/9**；licenses `checked=56 · violations=0`；门 4 红点同 PRE-1b；门 3/8 NOT RUN。**场景级 0.2.x 证据**（真 `dsh 0.2.0-rc.2` 沙箱，probe 按绝对路径 import **出货模块**）：`startWorkJob` → **`jobId:"ulw-execute-1"` / `degraded:false`**（判定项成立）；v2 `run` 真收到 `JobHandle`（`argType:"object"`、`id:"t4probe-1"`、两个写方法齐备）；写在 **`result`** 上的事实被真机读回（`hasResultKey:true`）；真 registry 抛 `:365` 被分类为 preflight；服务缺席是**另一句** ⇒ **三态在真机上日志互不相同**。首跑失败（缺 bundle 布局 `cannot resolve profile bundle`）已如实归档未编造。双评审：第 1 轮 **A=REJECT / B=APPROVE**；修复三轮后**双 APPROVE**。**0.1.5 腿**：本机无 0.1.5 二进制，权威 = CI——**run `37150775008`（commit `977f813`）`success`**：门 2 `57 files passed`、门 4 `dsh-version: pass (dsh 0.1.5-rc.1, pinned 0.1.x, decision D7)`、门 5 `checked=56 · violations=0`、门 6 `31/31`、门 7 `9/9`、门 8 `run-proofs: PASS 7/7`。
- **⚠️ 遗留观察（编码方如实上报、仲裁定性：留待后续，不在 T4 修）**：`ulw-execute.ts:1116` 是 `let jobs = readJobsService(ctx)`，`:1119-1130` 的 `ctx.inject(['jobs'], cb)` 回调**重新赋值**它 ⇒ 跨 await 的可变捕获。若真机 `ctx.inject` **异步** fulfil 且晚于第一次 `agent/pre-step`，那次 plan selection 会看到 `jobs === undefined`，于是 **work session 在没有 job 的情况下登记**并打 `[jobs absent]`——正是本阶段要消灭的那类静默降级。该捕获**早于 T4 存在**（P3-T17），T4 未引入、且 C5 冻结了那段语义，**本任务不改**。**触发条件**：T10/T11 的双运行时全链复跑若在任何一次真机 boot 上看到 `[jobs absent]`，按 DoD-d **回本清单插新任务**（不是改结论）。
- **依赖**：P4.5-T1。**量级**：3 小时。

---

## WP-2 协奏 preset 注册迁移（计划书 §4.3；复核 §2 为权威）

### [x] P4.5-T5 — syncConcertoPreset 双模出口 + disposer 持有

- **产出**：抽出纯函数 **`renderConcertoComposition(): string`**（渲染后的 YAML 文本）；`syncConcertoPreset` **保留写盘契约**（doctor-lite.mjs:602 主动调它并读产物——评审 R1-B4 实证，「不再写盘」与门 4 互斥，予以删除）；`concerto-preset.ts` 出口探针（`typeof agentPresets.register === 'function'`）；0.2.x 分支 = **同一个字符串** → 对象解析（**T1 Q-2 定案：零新增依赖，动态 import 已装 dsh 的 `js-yaml`，`JSON_SCHEMA` + `tag:yaml.org,2002:js` 真 tag**）→ `register()` + disposer 持有（Q-4 接线）+ **调用点约束**（`ctx.inject(['agentPresets'])` 回调内触发，不在 apply() 同步路径——registry :126-127，R-9）；0.1.5 分支 = 既有物化不变；单测。
- **做法**：sentinel 渲染管线与防残留闸**零改动**；解析失败的 loud-but-non-fatal 纪律（`concerto preset register FAILED: <reason>` marker 进 probe 同步网）；disposer 在 cordis effect/dispose 路径释放（Q-4 §3.4：disposer **幂等、arity=0、名为 `unregister`**，**不需 once 守卫**；且幂等性由上游 `agent-preset-registry/src/index.ts:88-89` 的 `if (disposed) return` **源码级保证**）。**仲裁修订（2026-10-04）**：原写「disposer 存**模块级槽位**」——**字面作废**，改为「从 `ctx.inject([...], cb)` 回调 `return` disposer，由 cordis 收集进该注入子 fiber 的 `_disposables`**（链路一手可证：`registry.ts:300-302` → `fiber.ts:259` → `:373-374` → `:361` → `:231` → `:265-297`）；**代价登记**：`inject` 签名是 `Plugin.Function<void>`，返回 disposer 属**运行期可行 / 类型层越界**，依赖 cordis 的 effect 约定而非 API 契约；单测含「`omo-agents` **不在被注册组合的行集内**」的结构断言（R-9 的结构性不变量——组合行集无 `omo-agents`，它挂仓根 `cordis.yml:36-38` 独立 insert 行；结构变更时立刻报警）+ `renderConcertoComposition()` 纯函数用例（不落盘，断言 YAML 文本含全部渲染锚点）+ **解析产物中凡 `typeof row.disabled === 'string'` 即 fail 的断言**（Q-3 §4.3：`!!js` 是反序列化产物，裸字符串会静默变禁用行且零告警；`entryListProblem` 只校验 `name` 非空与 group 的 `config` 是数组，**不是安全网**）。
- **做法（仲裁裁定的三处硬约束，2026-10-04 开工前成文，续 T1 实测）**：① **验收的唯一证据是回读，不是「不抛」**——`register()` 只对空/重复 `id` reject；mount 失败**绝不 reject**，只写 roster 的 `broken`，且 host 的 `logger.warn` 在捕获到的 stdout/stderr 流里**没有出现**（证据边界：未读 logger level、未定位落盘 sink，故不可推广为「dsh 就是 silent-on-console」）。故单测与真机证据**必须**在注册后回读 roster 断言目标 id 的 `broken` **缺席**，且 **omo-agents 必须自己**把 `broken` 打成 boot marker。② **「时机」已降级为「调用点」，不得设计等待/重试**——真相是**能不能拿到句柄的二值问题**：apply() 同步段 100% 拿不到（`ctx.get(name,false)` 与 apply 后异步取句柄**未测**，既不许可也不禁止），`ctx.inject(['agentPresets'])` 回调 100% 拿得到，register 本体 4–9ms。③ **Service.init + yield 候选 = 裁定不采用**（原「若经 T1 裁定采用则一并落地形态转换」的分支关闭）——`ctx.inject` 回调与 `async* [Service.init]` 在可用性上等价且已实测，改 Service class 形态要付出 `tests/omo-agents/boot-markers.test.ts` 的 `apply()` harness 全量改造成本。
- **判定**：✅ 单测（register 在场/缺席双形状；解析产物含全部渲染锚点；双注册的 disposer 语义；时机结构断言；`broken` 回读断言）；门 4 绿（写盘契约未破）；0.2.x 实 boot roster 含 `concerto`（**判定必须经 `remoteExportList()` 取 `isDefault:false`——进程内 `list()` 结构上不返回 `isDefault`**，走 `list()` 断言会永远失败。**⚠️ 仲裁实测订正（2026-10-04，编码方质疑③经一手源码复核成立）**：`remoteExportList()` 返回的是**信封 `{ presets: [...] }` 不是数组**（`dsh@rc.2 agent-preset-registry/src/index.ts:171-174` + `types.ts` 的 `AgentPresetRoster`），**必须先取 `.presets` 再消费**；而进程内 `list()` 返回**真数组**——**两者同名不同形、相距仅 3 行**。按数组消费 `remoteExportList()` 会抛 `TypeError: … .map is not a function`，且因跑在 cordis inject 回调里**被吞进 logger、不冒泡** ⇒ **静默故障**。**T6 起生效的通用规约：凡消费 `agentPresets` 的 RPC 面，先核对该面返回的是数组还是信封**，不凭「0.1.5 同名方法返回什么」外推）；0.1.5 CI 绿（物化路径不回归）。
- **证据**：✅ `.omo/evidence/p45t5/T5-concerto-preset.md`（+ `logs/` 36 份 + `review-A/`、`review-B/` 两路评审产物；`ARBITRATION-primary-source-verification.md` = 仲裁者一手复核与裁定台账）——门 1/2/5/6/7 全绿（仲裁者**独立复跑**确认）：`typecheck` exit 0；`vitest` **57 files / 1467 tests**（基线 57/1447，**+20 只增不减**，既有 119 条 v1 用例零删除、仅两行 import 各增一名）；static **31/31**；docs **9/9**；licenses `checked=56 · violations=0`（**零新增依赖**，Q-2 定案落地）；门 4 红 = `{dsh-version, llm-adapters}` **与 PRE-1b 逐条同形、零新增红**（`subagent-config` 仍 pass = 写盘契约未破）；门 3/8 **NOT RUN**（消费环境 dsh 二进制 + P0-1 已知红）。**场景级 0.2.x 证据**（真 `dsh 0.2.0-rc.2` 沙箱，四环境变量全沙箱、探针绝对路径 import **出货**模块、用完 `kill -TERM`）：`registered: id=concerto broken=absent` + 零 FAILED；`disposer name=unregister arity=0 heldIsSame=true`；`remoteExportList` 读到 `{"id":"concerto","order":5,"isDefault":false}`；释放后 roster 无 `concerto`；二次释放幂等。**变异**：编码方 5 处 + 评审 A 5 处 + 评审 B 4 处（合计 14 次破坏→红→还原），每次还原经 sha256 逐字节验证。**双评审**：A=**APPROVE**（0 MAJOR / 1 MINOR + 6 NIT）、B=**APPROVE**（0 MAJOR / 1 MINOR + 5 NIT），**两路独立收敛在同一批缺陷**；两条 MINOR 实为同一条（probe `trust` grep 行号陈旧，**源头是仲裁者**的 `:959-960`，编码方如实沿用且无权改 docs）；修复轮修 F1–F4（拼写、JSDoc 诚实性、报告 3 处 off-by-one、引用同步），**编码方另自查抓到一条两路评审都漏掉的松锚**（`:813` 是消息文本行、语句起始 `:817`）⇒ 规约⑩。**仲裁者驳倒自己的裁定一条**：编码方质疑③「`remoteExportList()` 返回 `{presets:[…]}` **信封**非数组」经一手源码复核**成立**——而那句「判定必须经 `remoteExportList()` 取 `isDefault:false`」正是**仲裁者写的**，照字面施工会 `TypeError` 且被 cordis 吞进 logger（静默）。**T6 派单必带**：信封形状（`registry index.ts:171-174`）、R-9 结构不变量、`:976-977` 漂移后的锚点、规约⑩⑪⑫。
- **依赖**：P4.5-T1。**量级**：5 小时。

### [x] P4.5-T6 — roster 词汇与断言生态迁移（probe / drive.mjs / boot 打印）

- **产出**：`omo-agents/src/index.ts` roster 打印行去 `trust`（改 registry 字段 `isDefault`/`broken`——**`trust` 两处同删**：list 行与 read 文档，评审 R1-B1）；**断言生态统一迁到 `agentPresets/read` 单一断言面**（0.1.5/0.2.x 均在场，无需双模——评审 R1-B1 更正），覆盖运行时面可数清单（评审 R1-B2）：① probe **63 行**物化引用面（sentinel 残留反断言、`prefix: \| -`、persona 章节 marker、explore 行 id/toolName、toolFilter grep、喂 dsh schema 校验器 :583-584、`trust` grep :976-977）；② drive.mjs `materializedCompositionPath` **5 个调用点**（:1385/:2544/:2568/:6804/:9856，定义 :2462）；`RosterEntry` 结构类型按 T1 Q-3 附项 b 裁定落地。**单测侧（评审 R2-B1 更正——「保持不动 + 仅新增」）**：`concerto-preset.test.ts` **12 处** `.agent-presets`（含路径契约 :171-173）与 `roster-composition.test.ts:81`（+ T5 新增的 `:300`）**既有断言保留不动**——它们是纯 vitest 单测、无 RPC 能力，测的是渲染器与写盘契约（B4 承重面，门 4 依赖的唯一自动化保护）；仅随 T5 **新增** `renderConcertoComposition()` 纯函数用例（不落盘，直接断言 YAML 文本含全部渲染锚点）。「read 文档锚点」断言归属运行时面（probe 与 drive.mjs，已有 RPC 通道），不在单测射程内。**⚠️ 仲裁实测订正（2026-10-04，`.omo/evidence/p45t5/ARBITRATION-primary-source-verification.md` §6）**：「read 文档锚点」**不是**把物化 grep 原样搬过去——`agentPresets/read` 的 `content` 是对**已解析对象**的 `yaml.dump()`（`dsh@rc.2 agent-preset-registry/src/index.ts:200-205`），实测 **flow 序列展开成 block 序列**（`deny: [..]` → `deny:` + 逐行）、**引号被去掉**（`provider: "spawn"` → `provider: spawn`）、**（`!!js` 一类经仲裁者 §6.2a 自我更正作废**——上游 `vendor/include/src/index.ts:9-15` 的 `JsExpr` 带 `represent`，真 `content` 里仍是单行 `disabled: !!js …`，grep `!!js` 的断言**照旧命中**）；行/缩进/块标量类锚点仍命中。**⇒ T6 的断言重写范围只有两类：flow 序列 + 引号。****做法改写**：断言按 `content` 的实际形态**重写**，推荐把 `deny`/`allow` 的逐字 grep（probe 的 `grep -qxF` 整行相等）改成「**解析 `content` 后的数组与 `roster.ts` 推导值逐元素相等**」——**比逐字 grep 更强**。「禁止落回物化兜底」的纪律不变。**「锚点齐全」这个前提作废**：Q-3/Q-4 证据零命中，从未钉过。
- **做法**：probe 断言 = `id: concerto` 在列 + `name`/`description` 与 preset.yml 单源一致 + `isDefault: false`；**禁止「远程面缺失则落回物化断言」的兜底**（真实回归时静默降级，违反金丝雀纪律——评审 R1-B1-3）；**PASS banner（probe :1228）重写不得削弱其中的否定断言句**（`NO … FAILED` / `ABSENT` / no-vacuity-guard——评审 R1-N2，门 8/`run-proofs.sh` 消费该文案）。
- **判定**：✅ probe 在 0.2.x 全绿（含 roster 段与 banner）；drive.mjs 双运行时各绿（0.1.5 侧 read 同样在场，断言面统一）；门 2 绿（两个单测文件**保留** + 新增纯函数用例）；0.1.5 CI 绿。
- **证据**：✅ `.omo/evidence/p45t6/T6-roster-assertions.md`（555 行 + `logs/` 58 份 + `review-B/verdict{,-fix2}.txt`；仲裁者一手台账 `.omo/evidence/p45t5/ARBITRATION-primary-source-verification.md` §6d2 = 五次裁定被推翻的台账）——门禁（仲裁者**独立复跑**确认）：`typecheck` 0；`vitest` **57 files / 1473 tests**（T5 后 1473，**+6 只增不减**）；static **32/32**（T6 新增 `c23`，已由仲裁者例外授权）；docs **9/9**；licenses `checked=56 · violations=0`；门 4 红 = `{dsh-version, llm-adapters}` **与 PRE-1b 同形、零新增红**（`subagent-config` 仍 pass）；drive `--self-test` 0；**门 8 首次真跑**（5 次尝试，attempt5 与 attempt4 逐字节同：fetched 101226 B / read 98962 B / **READ-FACE PASS** / 未绑定错误 0）——**收口口径**：门 8 在本机 ambient 上因 P0-1 适配器矩阵缺行（`llm-adapters`）而恒红，**验收以 FACE B 段全绿 + 零未绑定/零 ECONNREFUSED 为准**，末行 `'route provider not registered'` 与 HEAD **逐字相同**、**非 T6 引入**；门 3 **NOT RUN**（需真 LLM 凭据，本机缺 `dsh-llm-deepseek` adapter）**——⚠️ 此句已被 2026-10-05 仲裁者复核订正：结论（门 3 本机红）对、机理错**；门 3 本机**跑得动**，红因是 **ambient `route provider not registered`**（`mockRequestCount=0`）而非缺凭据，且 read 面断言本机**确实执行了 33 次**）。**设计要点**：`assert-concerto-read-face.mjs` 提成**仓库脚本**（probe 与 drive.mjs **共用同一份**，杜绝两面分叉）；FACE A（0.1.5，文件发现面）保留 **19 条物化逐字 grep**（含仅该面成立的 flow 序列锚点）；FACE B（0.2.x，`agentPresets/read`）**解析后与 `roster.ts` 逐元素比对**——评审 B 复现 6 组变异证明其**严格强于逐字 grep**（deny 少元素/换序/allow 少元素/行改名/哨兵残留 ⇒ 红；纯装饰加引号 ⇒ 绿）。**双评审**：A 首轮 **REJECT**（2 MAJOR + 3 MINOR + 4 NIT）→ 修复轮 → A 复评 **APPROVE**（并**主动自认 MINOR-2 修法判错、编码方对**）；B 首轮 **REJECT**（2 MAJOR：drive 少传第 6 参、resolver 少解 symlink ⇒ 门 3 双重不可达）→ 修复轮 2 → B 复评 **APPROVE**（并独立裁 `c23` 正确、补测出下限守卫）。**编码方自查事故**：曾误用 `git checkout-index -f` 抹掉 `index.ts` 全部 T6 改动，已用备份还原、仲裁者与两路评审均以 sha256 **逐字节**复核善后完成（`27e73eac…3d29`）。**可数清单重锚**：probe `materialized|\.agent-presets` **63→71**；`materializedCompositionPath` 调用点 **5→6**（定义 `:2591`）；`concerto-preset.test.ts` 的 `.agent-presets` **12**（不变）；`roster-composition.test.ts` **`:81`/`:300`**（不变）。**⚠️ 2026-10-05 仲裁者补做 0.1.5 腿（WP-2 五个提交此前从未推送 ⇒ 这条腿从未存在）⇒ 抓出一条双评审都放过的 MAJOR 并已修复，见头部修订记录**：CI run `37200076805` 门 3 红（attempt 1+2 均红）；根因 = `prometheus-md-only-denied` 的 `augmentMaterialized` 删掉沙箱副本里 prometheus 的 `toolFilter`，而 read 期望取未编辑的 `roster.ts`，**0.2.x（`register()` 供数⇒编辑不可见）与 0.1.5（文件发现供数⇒编辑可见）行为相反**。修复 `de68919`：fixture 强制声明 `(row,key,after)`、接受集二值化、**只允许叶子级声明**；顺带修 3 类既有缺陷（`drive.mjs` 进度行污染 stdout、class-filter 契约单向、`c23` 名册硬编码→自动发现 + 新增 `c24`）并删掉两句**可被证伪的注释/banner**（规约⑱⑲）。**终态门禁**：typecheck 0 · vitest **58 files / 1492 tests** · static **33/33**（c01–c24）· licenses `checked=56 · violations=0` · docs 9/9 · `run-proofs` **7/7** · `--self-test` 0；**0.1.5 真机 CI run `37220817614` 八门全绿**（`read-face asserted` 33 次、drive 终判 `{"result":"PASS"}`、门 4 `dsh-version: pass (dsh 0.1.5-rc.1)`）。双评审修复轮**四轮全部落盘 verdict**：`.omo/evidence/wp2-fix1/review-{A,B}/verdict{,2,3,4}.txt`。
- **依赖**：P4.5-T5。**量级**：4 小时。

---

## WP-3 安装器交付线（计划书 §4.4；复核 §2.4 为权威）

### [x] P4.5-T7 — 安装器声明式迁移（或重定范围）+ 安装验证

- **产出**：按 T1 Q-7 fork 裁定落地——（A）：`install-concerto.sh` 改写为 profile patch 行注入（幂等行替换 + 时间戳备份 + registry 前提断言 + 响亮报错指引）+ 沙箱全新安装验证；（B）：安装器在 0.2.x 探测到文件发现缺席时响亮拒绝 + 指引插件线 + 理由成文。两形态均含 `docs/install-concerto{,_zh-CN}.md` 双语更新。
- **做法**：（A）形态——`PresetDefinition` 的 config 由 omo-agents-current 组合 + env 覆盖渲染生成（与今日两文件语义等价的核对单测）；profile patch 写入器只 touch `preset-concerto` 行（对照测试：预置用户行的 patch 文件安装后用户行逐字保留，R-4）；安装验证 = 真实 boot + roster RPC 含 `concerto`（复用 probe 传输自适应通道）。（B）形态——探测逻辑（registry 缺席/文件发现缺席）+ 拒绝文案 + 指引。
- **判定**：✅（A）：沙箱全新安装后 roster 含 `concerto` 且 session/create 组合成功；二次安装幂等（无重复行、用户行无损）；0.1.5 安装路径不回归（双模或探针分流）。（B）：拒绝行为与指引文案的实证记录。**退出标准 (e) 的承载任务**。
- **fork 裁定（2026-10-05 仲裁成文）：选 (A)，(B) 被排除。** 依据四条互相独立的事实（任意一条单排即足以排除 (B)）：**F1** 全量 grep 整个 0.2.x 安装，`.agent-presets` **仅 1 处命中**，是上游自带技能文档 `dsh-agent-preset/skills/editing-cordis-compositions/SKILL.md:70`，逐字「**Nothing reads that directory any more.**」⇒ 旧安装器在 0.2.x 上是静默空操作；**F2** (A) 的形状在本机已被四个 shipped preset 验证过四次（`standard`/`ptc`/`minimal`/`cordis` 全来自 `dsh-web-app/presets/*.patch.yml` 的声明行，且都真实出现在 0.2.0-rc.2 的 roster 里、`broken` 全缺席）；**F3** 反面对照在案：P0-1 的 before 记录 `agent-preset/not-found`、`available = ["standard","ptc","minimal","cordis"]` —— 可用的四个**恰好**就是那四个声明行；**F4** 承重机制源码级钉死：`dsh-agent-preset/lib/index.js` **全文 29 行**，`:10` `static inject = ["agentPresets"]`、`:24-26` `async *[Service.init]() { yield await this.ctx.agentPresets.register(this.config) }`。
- **⚠️ 同时订正本任务书「做法」段的一处失真**：原文写「安装验证 = 真实 boot + roster RPC 含 `concerto`（复用 **probe 传输自适应通道**）」——**该通道不适用于本任务**：`scripts/concerto-mode-probe.sh:842` 读的是**物化/`.agent-presets` 面**，而 0.2.x 上那张面零读取方。本任务的验证通道是**真 `dsh web` boot + 独立的 roster RPC 探测**，两者不是同一条路。真相见下方证据的「真 boot 腿」小节。
- **证据**：✅ `.omo/evidence/p45t7/`（`T7-installer.md` 交付报告 + `T7-boot-leg.md` 真 boot 腿 + `artifacts/` 12 份原始件 + `review-A/verdict{1,2,3,4}.txt` 与 `review-B/verdict{,2,3,4}.txt` 六份落盘 verdict 及其 sha256 清单 + 仲裁者一手台账 `ARBITRATION-primary-source-verification.md`（R1–R17 + 17 份 `arb-*.txt` 上游源码归档）+ 逐轮裁决 `ARBITRATION-review1-findings.md` / `ARBITRATION-review2-verdictB.md`；`.omo/` 被 gitignore，证据留本地不入库）——**四轮双评审**：轮 1 双 REJECT · 轮 2 A REJECT / B APPROVE · 轮 3 A REJECT / B APPROVE · 轮 4 A REJECT（1 MAJOR + 3 MINOR + 1 NIT）/ B APPROVE（1 MINOR + 1 NIT）⇒ **轮 5 仲裁者按两路共识收口**（A 明确「只剩一个布尔项挡着，不要开第 5 轮」），最终零 BLOCKER/MAJOR。

  **提交**：`e588ea2`（脚本 100 → **1034** 行；新增 `tests/omo-agents/installer-declaration-face.test.ts` **2461 行 / 58 用例**；两份 install 文档 EN 255 / ZH 223 行）。仲裁者**提交前独立复跑**并落盘 `ARB-gates-final.log`：**门 1 `tsc` exit 0 · 门 2 `59 files / 1550 tests`（基线 58 files / 1492 tests，**只增不减**）· 门 5 `checked=56 · violations=0`（**零新增依赖**，`package.json`/`pnpm-lock.yaml` 零 diff）· 门 6 `33/33` · 门 7 `9/9`**；`bash -n`/`dash -n`/`sh -n` 三过；`TAG="${CONCERTO_TAG:-v0.2}"` 仍在 `:27` 行首（门 7 `d02` 与 `release-bump.mjs` 的消费面）；`docs/plans/` 零越界改动。**门 3 / 门 4 / 门 8 = NOT RUN**（消费环境 dsh 二进制 + P0-1 已知红；门 4 与本任务无关）。

  **判定项逐条**：
  - **① 沙箱全新安装后 roster 含 `concerto` 且 `session/create` 组合成功 = 成立（真机腿）**。dsh 0.2.0-rc.2 沙箱、`mktemp -d` 的 `DSH_HOME`、**联网**跑真实安装器（未替换成离线副本）；真起 `dsh --profile web --port 0 --no-open`，20s 内就绪。原始件：`artifacts/roster.raw.json`（`presets` 5 条，`concerto` 在列、带 `name`/`description`，`grep -o broken` 全文**零命中**——是**键不存在**而非空值）、`artifacts/session-create.{request,response}.json`（`{"args":{"request":{…,"agentPreset":"concerto"}}}` → `ok:true`、`agentPreset` 回显 `concerto`）、`artifacts/session.v4.jsonl` 首行 `agentPreset":"concerto"`、`artifacts/cordis.patch.yml.installed`（317 行）、`artifacts/dump-config.out`（组成树第 1260 行的层标记正是该 patch 文件、1261 行是本 row、`plugins:` 下 16 条齐全、`disabled: !!js process.platform …` 按表达式存活）。
  - **② 二次安装幂等 = 成立**。仲裁者**亲手**离线三连跑（`curl`→`cp`、`dsh`→版本 shim）：`preset-concerto` **1 次**；**run1 == run2 == run3 逐字节相同**；用户行是结果文件的**精确字节前缀**（含注释与空行）。四层独立钉子：T3 幂等 / T4 用户行保全 / T5 两种形态识别 / T19 备份只留最新 3 份且异前缀哨兵存活。
  - **③ 0.1.5 安装路径不回归 = 成立**。桩验证成立（0.1.x 面用 `dsh --version` shim 桩成 `0.1.5-rc.1`：只建两个旧文件、与仓源**逐字节相同**、`profiles/` 不存在；评审 A 另跑 `diff -r` 与 HEAD 版产物逐字节相同，含 EXPLORE 覆盖版）。**真机腿已于 2026-10-06 按 PRE-1c 通道补做并成立**（头部 D17 修订记录第六条）：真实 `dsh 0.1.5-rc.1` + 空 `DSH_HOME` ⇒ 安装器 exit 0、file-discovery 产物正确、八门全绿。原写的「权威通道 = CI」因 `compat-probe.yml` 的 `gh issue create` 哨兵步骤在 `main` 上即已失败而未能使用；**证据文件已注明通道为 PRE-1c 本机腿，不是 CI**。
  - **④ 双语文档同 commit = 成立**。两份各六段 + 三处后续订正（python3/PyYAML 前置条件、卸载 `2>/dev/null` 与「首次安装不产生备份」、嵌套声明行拒绝段）；门 7 `d08` 的 8 条 raw URL 全部 `/v0.2/`。
  - **⑤ 卸载路径 = 成立**。0.1.x 面 `rm -rf ${DEST}`；0.2.x 面改为「只删 `preset-concerto` 那一行 / 还原最新的**安装器**备份（glob 收紧为 `.bak.[0-9]*`）」并明写**不要 `rm -rf` 整个 patch 文件**。T15 双向断言。
  - **⑥ registry 前提断言 = 成立**。写入**任何字节之前**读 `profiles/web/package.json` 的 `dsh.profile.bundles`：缺席 → 放行并打印首启模板提示；含 `@deepseek-ai/dsh-web-app` → 放行且 `package.json` 逐字节不变；不含 → **响亮拒绝、退出码非 0、stderr 点名实际 bundles、patch 文件 Buffer 比对逐字节未写、无 `.bak`**（T16 三分支）。

  **真 boot 腿是否需要重跑（两路独立收敛「不需要」）**：A 与 B **各自**把当前 `render_patch_block` 的 `PYRENDER` 段原样抠出喂仓内两份 yml，**各自算出同一 sha256** `92695521d05a0a19318aa5dd6c03618736286164afc46f77d3fb9de77a4bf866`、**18262 字节**，与 `artifacts/cordis.patch.yml.installed` **同值同长、diff 0 行**（仲裁者提交前**再算一遍**并 `cmp` 确认）。⇒ 16:34 那条腿挂载进去的东西**一个字节都没变**，此后所有改动都在 `write_patch_row`、shell 前置闸与文档里。**此后记 sha256，不记 mtime。**

  **变异记录（仲裁者亲手做 M1–M4，两路评审另做 A–L / M1–M10，每次变异前先用 `grep -F` 确认变异点存在）**：仲裁者 M1 缩进 8→4 ⇒ **10 红**；M2 禁用形态① 删除 ⇒ 1 红；M3 禁用形态② 删除 ⇒ 2 红；M4 `json.dumps`→裸拼接 ⇒ T11 红（`ScannerError: mapping values are not allowed here`）。评审 A 轮 4 的 11 条、评审 B 轮 4 的 5 条**全部被杀**（唯一存活的 M10 经二次验证是冗余无害的纵深防御）。

  **仲裁者自查抓出、两路评审都判错性质的一条（F2′，本阶段最贵的一条）**：两路都把「R15 引号化」当成**缺断言**，其中一路明写「代码本身是对的」。**错——代码里当时根本没有 `json.dumps`**：`scripts/install-concerto.sh:147-148` 是裸拼接，且**修复轮前的基线也已是裸拼接** ⇒ 不是修复轮弄丢的，是分段交付期间该文件被**并发改写**时丢的。复现：一份**完全合法**的 `preset.yml`（description 含 ASCII `": "`）⇒ `ScannerError` ⇒ 安装器 exit 1。仓内当时的 `preset.yml` 侥幸用**全角 `：`**所以没暴露。已恢复 `json.dumps(..., ensure_ascii=False)` + 往返自检（含 U+0085 折叠）+ 敌意 fixture。

  **本阶段对全局有价值的产出 —— 规约⑳（见头部修订记录）**：本阶段「**台账/报告说已闭合，但代码里不是那样**」发生**两次**：一次栽在「**缺断言**」，一次栽在「**断言在但判定式错**」（`group is True` 严格窄于上游 `dsh-app-boot/lib/index.js:2100` 的三分支并集，`name: cordis:group` 那条**最规范**的写法照样溜过去，安装器 exit 0 + 两条活 preset row）。⇒ **每条 finding 的闭合判据必须写成可执行形式**（形如「拒绝覆盖 `:2100` 的三个分支并各有一个用例」），**要能对着上游源码逐条对账，不能对着自己的实现自洽**。
- **遗留观察（按 DoD-d 回填，不在 T7 修）**：评审 A 测出 `tests/omo-hooks/background-notification.test.ts`（**不在 T7 diff 里**）吃 vitest 默认 5s `testTimeout`，负载下会随机红 1 条（`Test timed out in 5000ms`，T13 ⑨；单独复跑 3 次全绿）。**这正是 T7 自己那份文件修掉的同种闪烁**（每用例显式 60s）。⇒ 归 T2 线的后续修缮，**不改 T7 结论**。台账里「门 6 全绿」须注明是**观测值不是保证值**。
- **依赖**：P4.5-T1（fork 裁定）、P4.5-T5（渲染产物复用）。**量级**：1 天。

---

## WP-4 会话日志 v4 观测通道（计划书 §4.5；复核 §4 为权威）

### [~] P4.5-T8a — drive.mjs 沙箱播种适配 0.2.x（2026-10-06 新增，D17 派生）

- **为什么有这一片**：T8 的全部输入是「T1 Q-8 从真实 0.2.x 沙箱会话抓取的 v4 逐字形状」，而**抓取需要门 3 在本机 0.2.x 上真跑出带 `tool/call` + `tool/result` 的会话**。仲裁者派单前的可行性探针实测：门 3 **跑得动**（沙箱真 boot、read-face 校验器 `READ-FACE PASS`、session 建出且带 `agentPreset:"concerto"`、日志头 `"version":4`），但**红 9 条断言且全部属于「explore 席没起来」的链** ⇒ 日志里 `tool/*` 事件**零条** ⇒ **Q-8 一条数据都采不到**。根因已一手钉死（头部 D17 修订记录第四条）：**0.2.x 删掉了 `settings.yaml` 配置面**，其补导入由 `ctx.root.loader.await().then(...)` 触发，**晚于** `omo-agents` 在自己 `apply()` 期的 route provider 判定 ⇒ 首启必然抢跑。**反证**：同一沙箱再启一次该 marker 整行消失。
- **产出**：`seedSandbox()` 把 LLM 接线（`agent-default-model` / `llm-deepseek` / `llm-pi-ai` 三个 section）种进 **profile patch overlay**，使配置在 `apply()` 前在场；`settings.yaml` 那条路在 0.2.x 上自然退化为一次性导入。**两侧都要成立**（CI 仍钉 0.1.5-rc.1）。
- **做法**：patch 行的形状（override-by-id 是否需要 `name:`、三个 entry id 在两代是否同名）**必须先从上游 loader 与 composition 源码各钉一条，不得照抄本仓安装器的行形状**——0.2.x 的补导入自己写的是 `- id: llm-deepseek` + `name: "@deepseek-ai/dsh-llm-deepseek-api-key"`，**与直觉名不同**。
- **判定**（⚠️ **2026-10-06 双评审后重写**，原判定要求的 `"result":"PASS"` 属 T8b）：
  - **A1′（主判据，无计时器、可造红）**：离线 `DSH_HOME=<scratch> dsh --profile web --patch <sandbox>/e2e.patch.yml --dump-config`，断言**组合结果**——`llm-pi-ai.config.providers` 是**非空映射**且其中每个 provider 的 `baseURL === <mock>/v1`、`llm-deepseek.config.baseURL === <mock>/v1`、`agent-default-model.config.provider/model` 等于解析出的 sisyphus 路由、**stderr `patch:` 零命中**。**退出码与 stderr 都区分不出来**（仲裁者实测：错缩进时 `--dump-config` 仍 exit 0、stderr `patch:` 仍零命中，只有组合结构不同：`providers: null` + provider 键落成兄弟键）。该断言必须能在 `--self-test` 里跑（`seedSandbox()` 此前从不被它覆盖，所以没有任何东西守这个形状）。
  - **非空洞性**：四种破坏各跑一次并展示红——错缩进 / 删掉 `- id: llm-pi-ai` 行 / 错 `baseURL` / 在 0.2.x 上写 0.1.5 的包名拼法。
  - **boot marker 降为辅助信号并显式标注其计时依赖**（见下「为什么改判据」）。
  - `--self-test` exit 0；改动面按**文件 + hunk** 归属判定（不按 `git diff --stat`，共享 worktree 下有两个切片叠加）；`package.json`/`pnpm-lock.yaml` 零 diff。
- **非空洞性（硬性）**：修复后必须**把旧行为（只写 `settings.yaml`）放回去再跑一次**，展示它退回那 9 条红，再恢复修复展示绿。**造不出红的门比没有门更坏**。
- **证据**：⬜ 修复轮进行中（`.omo/evidence/p45t8/T8a-sandbox-seeding.md`；双评审落盘 `.omo/evidence/p45t8/review-A/verdict.txt` **APPROVE**(1 MAJOR+4 MINOR+2 NIT) 与 `review-B/verdict.txt` **APPROVE**(3 MINOR)；仲裁者裁决 `.omo/evidence/p45t8/ARBITRATION-T8a-verdict.md`；探针 `ARBITRATION-feasibility-probe.md` + `logs/Q8-session.v4.jsonl`）
- **⚠️ 为什么改判据（双评评审定，仲裁者一手复核成立）**：原判据写「全新沙箱首启 boot log 里 marker 零命中」，并把它称作**确定性证据**——**这是反的**。`boot-markers.ts:277-284` 在 `ctx.inject(['llm'])` 处取 `baseline`、武装 `setTimeout(check, ROUTE_PROVIDER_CHECK_SETTLE_MS)`（`:219` = **8000ms**），并在 `llm/adapters-updated` 上按「注册表是否增长」改用事件宽限重武装；`dsh-llm/lib/index.js:1886-1894` 的 `commitRoutes` 每次 `registerAdapter` 都发这个事件。⇒ **marker 在场与否取决于 check 落在 legacy 导入之前还是之后**，是一个 8 秒窗口上的竞态；**绿是结构性的**（注册发生在 pi-ai 自己的 `apply()` 里），**红不是**。⇒ 「首启无 marker」在未修复的代码上**可以读成绿**，且被评那对红/绿对照继承同一缺陷。⇒ 换成 A1′。
- **依赖**：无（纯 0.2.x 驱动侧适配）。**量级**：3 小时。

### [ ] P4.5-T8b — MOCKROLE 投递迁到 0.2.x 的注册面（2026-10-06 新增，D17 派生；T8 与 Q-8 的硬前置）

- **为什么有这一片**：T8a 把门 3 的**第一道**红点修掉之后（route provider 已绿），场景仍红 8 条，末因逐字是 `mock-llm: no MOCKROLE=<role> marker found in any system message`（`INVALID_REQUEST` 400）。**这不是 T8a 引入的**：仲裁者自己 00:11 归档的**修复前**基线日志 `.omo/evidence/p45t8/logs/Q8-session.v4.jsonl` 里同一条错误逐字存在 ⇒ **两个独立根因叠着**，T8a 只覆盖了靠前那道。
- **根因（一手，三处）**：`appendMockRoleMarker()`（`drive.mjs:2821-2838`）把标记写进 `materializedCompositionPath(sandbox)` = `$DSH_HOME/.agent-presets/concerto/agent.cordis.yml`；该目录在 0.2.x 上**零读取方**（T7 fork 裁定的 F1）；真正被挂载的组合来自 `CONCERTO_TEMPLATE_DIR`，而 `patches/omo-dsh/omo-agents/src/concerto-preset.ts:122-126` 用 `dirname(fileURLToPath(import.meta.url)) + '/../concerto'` **相对已安装插件包**解析，`:377-381` 从那里渲染，`:859` 交给 `register()`。⇒ **标记打在 A 面，运行时挂载的是 B 面。**
- **产出**：MOCKROLE 在 0.2.x 上到达**被注册的**那份组合；**0.1.5 的物化面投递路径保留**（它在 0.1.5 上仍是被读的），T12/T13 再删。
- **做法**：首选方向 = **让沙箱装插件包的副本**——`installPlugin()`（`drive.mjs:2505-2527`）现在 `dsh plugin add <仓内目录>`；改成先 `cp -r` 进沙箱、在**副本的模板**上盖 MOCKROLE、再 `add` 副本路径。依据是 `CONCERTO_TEMPLATE_DIR` 走 `import.meta.url` 相对解析 ⇒ 副本的模板就是副本渲染时读的模板。**不得为此改任何出货码、不得新增依赖。**
- **实施方必须先答的三个问题（不得替它答）**：① `dsh plugin add <目录>` 是复制还是符号链接（查 `dsh/lib/bin.js` 与 plugin-manager 实装并引行号）；② 沙箱内的副本会不会被门 5 / 门 6 看见（**要实测，不能假定**）；③ 两条投递路径在 T12 之前的并存方式与各自的断言面。
- **判定**：✅ `DSH_E2E_ONLY=concerto-delegation-demo node tests/e2e/drive.mjs` 在本机 0.2.x 上 `"result":"PASS"`；**日志里出现 `tool/call` 与 `tool/result` 事件**（这是 Q-8 能开工的前提，也是本切片最硬的判据）；非空洞性：把修复放回旧行为须退回那 8 条红。
- **⚠️ 计划缺口登记（DoD-d）**：计划书 §4.6 门 3 行要求迁移的是 `materializedCompositionPath` 的**断言**面（T6 已做）；**MOCKROLE 是注入面**，§4.5/§4.6 通篇未提。⇒ 「T6 已迁移」**不得**读成「drive.mjs 的物化依赖已清空」——同一文件里两张面同时存在，只迁一张，门 3 在 0.2.x 上永远绿不了。
- **证据**：⬜ 待填（`.omo/evidence/p45t8/P8-mockrole-dead-face.md` 为仲裁者的一手根因记录）
- **依赖**：P4.5-T8a。**量级**：1 天。

### [ ] P4.5-T8 — drive.mjs 双形状夹具 + 信封读取点核对

- **产出**：drive.mjs 的运行时形状探针（会话日志 header format 版本）+ v4 形状伪造/解析（T1 Q-8 抓取的逐字形状，形状常量单源）；9+ 处伪造点按分类清单迁移；prove 脚本与 smoke 的信封读取点核对结果（双形状或现状确认）。
- **做法**：「运行时消费」类伪造必须过 v4 准入语义（形状与 Q-8 抓取逐字一致）；「解析器消费」类保持解析器双语义；形状常量集中定义（v3/v4 两组，禁止散落字面量）；对照断言 = 0.1.5 沙箱仍产 v3 形状且全链绿。**⚠️ D17 附注（2026-10-06）**：「9+ 处伪造点」的行号清单是**计划期读数，已随 T5/T6 漂移**——开工前由**仲裁者**重锚（规约⑪），编码 agent 无权改 docs。**T13 删死路径时**本任务的 v3 分支会随之删除，届时形状常量收敛为 v4 单组。
- **判定**：✅ drive.mjs 33 场景在 0.2.x 全绿（含 v4 形状断言）；0.1.5 CI 绿（T12 之前是防回归的唯一真实信号）；prove/smoke 双运行时核对记录。
- **证据**：⬜ 待填
- **依赖**：P4.5-T1（Q-8，**实际前置是 T8a——Q-8 的数据采集被它阻塞**）。**量级**：1 天。

---

## WP-5 延后对齐（deferrable；计划书 §4.8）

### [ ] P4.5-T9 — 专属 source kind 迁移（仅当证据拉入）

- **产出**（仅当 T1–T8 期间发现 0.2.x 消费者对未知 kind 有实际误行为时）：10 处代码点迁为专属 kind（`omo-hard-blocks` / `omo-todo-continuation` 等逐点定名）+ 3 处注释同步 + 结构类型更正；否则本任务记 `deferred` 出阶段并写明理由。
- **判定**：✅ 拉入时：迁移点单测（kind 字符串单源）、注入链路 e2e 不回归；defer 时：任务书裁定成文。**⚠️ D17 改写判据（2026-10-06）**：defer 的举证**不再需要 0.1.5 侧对照**——WP-4/5/6 剩余部分只剩 0.2.x 一个运行时，「消费者」不再分两代，**只需证明 0.2.x 上没有任何消费者对未知 `kind` 误行为**即可 defer。
- **证据**：⬜ 待填（或 defer 裁定）
- **依赖**：P4.5-T1。**量级**：0.5 天（可 defer）。

---

## WP-6 门与复跑（计划书 §4.6）

### [ ] P4.5-T10 — 门断言随面迁移（静态门 / doctor-lite / probe）

- **产出**：verify-concerto-static c 组随 T5/T6 的锚点迁移（**门 6 低风险**：c01–c09 读仓内模板 `omo-agents-current/preset/agent.cordis.yml`，`verify-concerto-static.mjs:106-108`——迁移只随模板/署名面变化，0.1.5 死路径不断言）；doctor-lite **零改动成立的确认记录**（写盘契约保留后，闸继续调 `syncConcertoPreset(temp)` 读渲染产物——评审 R1-B4 后提，若有残余变化则同 commit 同步）；probe marker 同步网（T2/T5 的 marker 措辞变更处）全绿。**⚠️ D17 追加产出**：门 3/门 8 在 **0.2.x 上**的任何残余红点（**已知一条：0.2.x 删掉 `settings.yaml` 配置面导致 drive 沙箱首启 route provider 抢跑，由 T8a 修；probe 侧是否同源需本任务核实**）必须在此清零。
- **⚠️ D17 追加订正（2026-10-06，仲裁者一手实测）**：`scripts/concerto-mode-probe.sh` **不在任何一道门里**——`scripts/ci-local.sh:61` 的门 8 是 `run_gate "session-free proofs" scripts/run-proofs.sh`，那 7 条 proof 里没有 probe；实测 **门 8 在 0.2.x 上本就已经 `PASS — 7/7 … on dsh 0.2.0-rc.2`**。计划书 §4.6 把「probe 71 行物化引用面迁移」列在门 8 行下，**分组 ≠ 门链结构**。⇒ **新增纪律⑳b**：「X 属于门 N」必须先打开 `scripts/ci-local.sh` 数 `run_gate` 并在该门实现里找到 X 才能引用；且**证据文件里被纠正过的事实必须同轮同步进计划/任务书**——本项目已在 T6 证据段纠正过一次「run-proofs 的 7 条里没有 probe」，但没带进计划书，被重新犯了一遍。⇒ probe 的修复**仍要做**（它是人读的观测工具，`docs/manual-testing.md:65` 双语，T8b/T10 之后要用它验注册面），但性质是**工具修复 + 文档纪律**，**不得**表述成任何一道门的前置。
- **做法**：每处门改动与引发它的代码改动同 commit（门随代码走纪律）；断言强度比对记录（迁移前后断言数量与覆盖面不降）；c 组编号不新增（在既有编号内迁移语义）——**⚠️ 仲裁例外授权（2026-10-04，T6 实施期）：新增 `c23`**（`assert-concerto-read-face.mjs` 声明的 argv 元数 ↔ **每个消费者**实传个数的三方对账，门 6 由 31/31 变 **32/32**）。理由：本轮两条 MAJOR **同源于「改共享 API 签名只改了一个消费者」**——probe 少传第 6 参 ⇒ 门 3 必红；drive.mjs 的 `resolveDshNodeModules()` 少解 symlink ⇒ 必抛。计划「不加新门」的意图是**不新增 CI 阶段**，c23 落在既有门 6 内、不新增阶段。评审 B 独立裁「c23 正确、无误报漏报、与既有 c 组无语义冲突」，并补测出**下限守卫**（validator 与消费者协同缩到 3 时仍被抓）。**规约⑭（T7 起生效）：改共享 API 必须同轮改完所有消费者并留静态对账；注释里的 `cannot drift` 不是证据，机器对账才是**。迁移重心次序：**门 3 > 门 8 > 门 2**（评审 R1-B2 实测分布）。**⚠️ D17 重心加权重排（2026-10-06）**：原顺序的依据是「双运行时都要绿」；D17 之后**唯一目标运行时是 0.2.x**，且 **T12 的 pin 翻转以「0.2.x 全链绿」为前置** ⇒ **门 3 与门 8 从「迁移重心」升为「翻转前置」**，二者在本任务内必须达到 0.2.x 全绿，门 2 仍仅增量。
- **判定**：✅ **门 4/6/8 在 0.2.x 上绿**（D17 后这是唯一被要求的运行时；门 4 的红点 = D7 pin 未翻转，由 T12 消解，本任务只需**记录并说明**，不得顺手改 D7 常量——那是 T12 的面）。
- **证据**：⬜ 待填
- **依赖**：P4.5-T2 … P4.5-T6、**T8a**、T8。**量级**：3 小时（原估；D17 后门 3/门 8 权重上调，若 0.2.x 残余红点超出已知那一条则重估并回填）。

### [ ] P4.5-T11′ — 0.2.x 全链复跑 + 级联金丝雀 + roster 往返（原 T11，D17 改写）

- **产出**：0.2.x 侧 `scripts/ci-local.sh` 8 门完整记录（**T12 翻转前的 pre-pin 基线**）；`/stop-continuation` 级联金丝雀场景在 0.2.x 的 verdict（退出标准 d 承载）；roster 含 `concerto` + explore 委派往返场景在 0.2.x 的 verdict（退出标准 c 承载）。**0.1.5 侧仍跑一次并记录，但降级为「防回归信号」而非判定项**——CI 本来就在跑，零额外成本。
- **做法**：金丝雀场景可复用/扩展现有 `stop-continuation-halts-todo`（断言 `cancelledJobIds` 非空 + 目标 job 消失 + 未触达降级 marker 的反向断言）；roster 往返复用现有委派场景；两侧记录进 `.omo/evidence/`；发现的残余断裂回本任务清单插新任务（不改结论改计划，DoD-d）。**机制注记（工程师反馈修订）**：门 3/4/8 消费环境 dsh 二进制（门 1/2/5/6/7 不碰）——0.2.x 侧 = 本机环境二进制直跑；0.1.5 侧 = **CI（权威）** 或 **PRE-1c 的 throwaway-prefix 本机腿**（`PATH=<prefix>/bin:$PATH scripts/ci-local.sh`）——证据文件必须注明 0.1.5 侧实际所用通道与二进制来源。
- **判定**：✅ **0.2.x 侧 8 门绿**（门 4 的 `dsh-version` 红点属**预期**——D7 pin 未翻转的正常表现，由 T12 消解；该红点必须**显式写为已知且可解释**，不得算进「全链绿」）；退出标准 (c)(d) 的 verdict 文件落盘。**⚠️ 不得写「双运行时 8 门绿」**——D17 之后该断言无意义且不可核。
- **证据**：⬜ 待填
- **依赖**：P4.5-T2、T3、T4、T5、T6、**T7（安装器线——退出标准 e 不得被 pin 翻转越过，评审 R1-I5 显式枚举）**、T8a、T8、P4.5-T10。**量级**：4 小时。

---

## WP-7 pin 与收口（计划书 §4.7）

### [ ] P4.5-T12 — pin 机器：bump-dsh + D7 常量

- **产出**：`scripts/bump-dsh.sh <选定 rc>` 执行结果（`ci.yml` + `compat-probe.yml` 原子改，d09 复验绿）；**D7 断言权威面同 commit 手工改**（bump-dsh.sh `apply_bump` 不覆盖——评审 R1-B3）：`scripts/doctor-lite-core.ts:15-17`（`PINNED_MAJOR = 0` / `PINNED_MINOR = 1` 常量 + `Decision D7 pin: minor 0.1.x` 注释）与 `:44`（`isPinnedDshVersion` 注释文案）、`scripts/doctor-lite.mjs:211`（"pinned 0.1.x" 提示文案）、`tests/omo-agents/doctor-lite.test.ts:39-50`（夹具：`0.2.0` 从 rejects 组移入 accepts 组 + describe 标题 "decision D7: 0.1.x" 改口径）；bump-dsh.sh / release.sh / probe 注释中**会误导下一次执行**的 0.1.x 假设更正（历史记录不动）。**⚠️ D17 追加（2026-10-06，仲裁者一手钉死的隐藏前置）**：**`scripts/doctor-lite-core.ts` 的 `LLM_ADAPTER_ROWS` 第一项也必须同 commit 改**——它现在钉着 `'@deepseek-ai/dsh-llm-deepseek'`，而 **0.2.0-rc.2 的组合树里根本没有这个包名**（实测只有 `@deepseek-ai/dsh-llm-deepseek-api-key` 与 `@deepseek-ai/dsh-llm-deepseek-account`），`doctor-lite.mjs:400` 的 `LLM_ADAPTER_ROWS.filter((a) => !stdout.includes(\`name: '${a}'\`))` 因此**恒判 missing** ⇒ **门 4 的 `llm-adapters` 红的真因是这个常量，不是 ambient 缺 adapter**（PRE-1b 以来一直被记成后者）。**不跟着改的后果**：翻转后门 4 **仍然红、且红点与翻转前一模一样** ⇒ 下一个执行者会误判成「pin 翻转没修好门 4」并去回滚 pin。⇒ 本项必须改第一项为 `'@deepseek-ai/dsh-llm-deepseek-api-key'` 并与 `doctor-lite.test.ts` 夹具同 commit 同步。**顺带登记（本次可一并考虑）**：那条断言是**子串匹配**，今天没被 `-api-key` 误命中**恰好**因为模板串末尾带一个单引号 ⇒ 正确性依赖一个偶然字符；改成按行精确比较成本很低。证据 `.omo/evidence/p45t8/P10-llm-adapters-red-rootcause.md`。**⚠️ D17 修订：本任务不再承担「0.1.5 死路径删除」**——拆到 T13，理由见头部重排序表第 8 行：**翻转 commit 必须小到能二分**，CI 一旦红要能立刻分清是「pin 本身」还是「顺手删的一大片」造成的。
- **做法**：bump-dsh.sh 既定流程（safe_point 时间序、`apply_bump`、`family_verdict`）。**硬规则（评审 R1-I6）的 D17 修订**：原写「T12 与 T13 不可能分开交付——合并为同一收口 commit/PR 是前提」。**修订为**：两者仍在**同一 PR** 内交付（不拆 PR、不拆分支），但**拆成两个 commit**；**退出标准 (f)「pin 翻转与绿色证据同一次变更交付」由 T12 这一个 commit 承载**——即该 commit 上 CI 必须在**新 pin** 下 8 门绿。理由：f 的本意是「不许拿着未经验证的 pin 发布」，不是「不许把删除与翻转分两次提交」。
- **判定**：✅ **T11′ 的 0.2.x 全链绿记录已落盘**（pre-pin）+ **T12 这个 commit 上 CI 在新 pin 下 8 门绿**（评审 R1-I6 去自指：不要求在翻转前拿到翻转后的 CI 记录）；d09 绿；门 4/门 2 在新 pin 下绿（D7 常量与夹具同步的实证）。
- **证据**：⬜ 待填
- **依赖**：P4.5-T11′。**量级**：3 小时。

### [ ] P4.5-T13 — 0.1.x 死路径删除 + L2 重验证 + 矩阵跨段迁移 + 文档收口

- **产出**：① **0.1.x 死路径删除**（D17 新增，从 T12 接过）：`.omo/evidence/p45t8/D17-scope-survey.md` 的 DELETE / DELETE-WITH-TESTS 清单逐点落地 + 删除清单成文 + CHANGELOG；**可保留的探针双模保留**（§4.1「默认保留探针与双路径」的纪律不变——删的是**结构性不可达**的分支，不是探测能力）；T8 的 v3 形状常量随之收敛为 v4 单组。② `.omo/evidence/concerto-verify-dsh-<rc>.md`（沿用 0.1.5-rc.1 证据文件的核对骨架在 0.2.x 重推导）；③ `.omo/compat.yaml` 的 0.2.x 行**跨段迁移**（`untested:` → `tested:`——补 **`{our, date, evidence}`** 字段集；**`our:` 取值裁定**（release-process §2a：`latest` 现为 `0.2.1`；裁定结果成文）+ **release gate 前置**：0.2.x 行在任何基于翻转后 pin 的发布**之前**已 `tested`——评审 R1-I1）+ 矩阵双语重渲染；④ README 状态行翻转（🔬 → ✅ 适配完成口径，含 (A)/(B) 终态与"≠ 0.2.x 特性消费"的 R-8 措辞）；⑤ CHANGELOG；⑥ decisions.md 带日期行（**D7 pin 翻转 + D17 放弃 0.1.5 两条登记**，沿用"无新增决策 + PRD §12 跟踪"体例）；⑦ PRD §12 该项翻 [x]；⑧ 复核报告「实施期订正」节（若有实质出入）。
- **判定**：✅ 退出标准 (a)–(f) 逐条有证据指针（核对表回填到本文末尾）；门 7/4 绿；文档双语同 commit；**删除后 0.2.x 侧 8 门仍绿**，且**每一笔删除都能指回 `D17-scope-survey.md` 的某一行**——「顺手删掉的」不算，删除清单必须逐条可核。

- **⚠️ D17 删除裁定（2026-10-06，仲裁者依 `.omo/evidence/p45t8/D17-scope-survey.md` 逐条裁定。该普查的行号仲裁者已抽样复核 6 条**全部成立**：guard `:424`、probe `:1137`、bg `:783/:1156/:1163`、live-state `:633/:634/:657/:670`、ulw 测试 `:2577`）**：

  **一、删除规则（可执行形式，规约⑲⑳）——本任务唯一授权的删除判据**：

  > **删的是「代语义」，留的是「探测与降级」。** 逐点过三问：
  > 1. 该行/该臂**只在 0.1.x 上可达**，且它在 0.2.x 上的等价行为**已被另一条断言覆盖** ⇒ **DELETE**；
  > 2. 该行是**探测**或**降级兜底**，删掉会把「可观测的退化」变成「静默的错误」 ⇒ **KEEP**；
  > 3. 该行是**历史引用**（注释 / 复核报告引用 / 存档矩阵行）⇒ **KEEP**，一字不动。

  **二、shape 判定本身永不删除。** 删的是 v1 臂的**语义实现**，不是判定。**v1 臂的新形态 = 「generation mismatch ⇒ 响亮 marker + 安全兜底」**，不是「悄悄走 v2 路」。依据：`dshRuntimeShape()` 的 `undefined → 'v1'` 同时承担**降级路由**（普查 §5-Q2 实测）；本阶段要消灭的正是**静默降级**——删臂不留 marker，会把一个今天**可区分**的结果变成**方向性静默失效**。

  **三、对普查「7 处可执行 v1/v2 分叉」的订正（仲裁者复核后收紧为 5 真 2 拆）**：
  - **真分叉（删 v1 臂）5 处**：`live-state.ts:633`（caller/owner）、`:634`（终态键）、`:657`（终态载荷）、`:670`（失败分类）、`stop-continuation-guard.ts:405`（caller 形状）。
  - **须按臂拆、不可按行删 2 处**：`background-notification.ts:783` 的 `?:`——**删的是 `:785` 的 `typeof jobs.onJobDone === 'function'` 那一臂**，`:783` 的判定本身留；`:1156` 的 `if (… === 'v2')`——删 `else`，留 `if`。
  - **⚠️ 明确不得删除 1 处**：`background-notification.ts:1163` 的 `BACKGROUND_NOTE_V2_WITHOUT_SUBSCRIBE` 兜底**在 v2 臂之内**，是 0.2.x 自己的降级路径（注释逐字「Identity says v2, capability says no」）。按行号批量删会把 0.2.x 的可观测退化删成静默。

  **四、普查 5 条高风险假阳性，仲裁全部采纳为 KEEP**：guard `:424` 的 `owner ?? ownerSession` 双读（删了装饰面会从「被围栏拦」变「无主静默跳过」）；probe `:1137` 的死 `trust` 词汇**反断言**（引用 0.1.5 正是为证明它已死，是防回归网）；pull 降级路径整体；`ulw-execute.test.ts:2577`（名字带 v1 但实测 `jobs===undefined`，**世代无关**）；compat.yaml 的 0.1.x `tested` 行（带 L2 evidence 存档，`dropped` 重标 ≠ 删行）。

  **五、普查 5 个待仲裁问题的裁定**：
  - **Q1「0.2.x and above」是精确 minor 还是下限？→ 精确 minor。** `doctor-lite-core.ts:51-52` 的判定式**不动**，只把 `PINNED_MINOR` 由 `1` 改成 `2`。理由：D7 的机制就是 pin minor；改成 `>=` 下限会让**未测过的 0.3.x 静默通过** doctor 门，正是本阶段要消灭的那类假绿。D17 明确不推翻 D7，因此不顺手改它的判定式。
  - **Q2 `dshRuntimeShape` 整体删还是留？→ 留**（见上第二条）。
  - **Q3 `augmentMaterialized`（drive `:14307`/`:14452`，行号待 T13 重锚）→ T13 删，但前置条件是先确认 `declaredSandboxEdits` 的声明机制没有被任何 0.2.x 有意义的编辑复用**；普查标 UNKNOWN ⇒ T13 必须逐条举证「谁在消费它」，不得按形态猜。
  - **Q4 compat.yaml 的 0.1.x 行 → 重标 `dropped` 并保留行与 evidence**，不删行（与 D13 的矩阵纪律一致）。
  - **Q5 安装器对 <0.2 是拒绝还是照装？→ 响亮拒绝。** 0.2.x 上 `.agent-presets/` **零读取方**，「照装」等于交付一个静默空操作（正是 T7 fork 裁定排除 (B) 时要避免的形态）；已有先例——版本读不出时安装器已经这么做了。

  **六、对普查三条挑战的裁定**：
  - **挑战 1（T13 横跨 ≥18 文件、自身需可二分）→ 采纳。** T13 **内部按门拆 commit**（门 2 → 门 6 → 门 8 → probe/drive 运行时面），每个 commit 单独过 CI；否则「翻转可二分」是空话。
  - **挑战 2（反对删 guard `:424` 双读）→ 采纳，已并入第四条 KEEP。**
  - **挑战 3（更便宜的收口 = 双模代码原地转 legacy defensive、只删 20+36 条测试 v1 腿）→ 部分采纳。** **否决其「原地转」的部分**：`ownerSession` / `output` / `{ id }` caller 若永久留在类型面上，下一个读代码的人会以为它们还活着——那不是防御，是误导。**采纳其成本预警**：本任务确是全阶段最贵的一条，故由第一条规则**把删除面收窄**（不是全删，也不是全留）。代价如实登记。

- **证据**：⬜ 待填
- **依赖**：P4.5-T12（同一 PR，两个 commit，T12 硬规则）。**量级**：1 天 + 删除规模（D17-scope-survey 出稿后由仲裁者重估，**初估上修**——见第六条挑战 3）。


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
