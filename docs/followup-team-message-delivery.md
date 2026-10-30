# Follow-up：团队消息投递保证的残余问题（待议）

> **状态**：🟡 OPEN — 已知、已披露、**未修**；按「先记下来，后续再议」处理。
> **登记日期**：2026-10-29 · **落点**：PR #17（`ae38da3` → `01a0f7d`）· 任务书 P5-T21 / P5-T22
> **性质**：这不是一个待修的 bug 清单，而是**当前设计取舍带来的固有代价**。前 5 条是真问题，第 6–8 条是边界；最后一节是待拍板的选项。
> **为什么要单独记**：第五轮评审（MAJOR-1）把「TTL 重新预约」定性为投递层缺陷后，我选择的修法（隔离、不交还投递权）**用"不重复"换掉了"不丢"**。这个交换是对的，但它的代价必须留痕，否则半年后会有人把它当成 bug 重新"修"回去，从而重开同一个重复投递窗口。
>
> ⚠️ **读法（P5-T25 第七轮评审 MINOR-3 后加）**：本文档里凡是描述「工具/文案怎么说」的句子，都以**代码为准**——`team_send_message` 的合同段、`quarantined` 的 note、`team_status.messageLedgerNote` 已按 best-effort / 可迟到 settle / 满载非终态三条订正。标注 **[已修]** 的条目是**历史问题**，不是当前状态；只有 **[OPEN]** 的条目才是待议的取舍。

---

## 1. 当前设计是什么

`team_send_message` 带一个 `correlationId`（消息指纹）。投递前后在 sidecar 账本（`omo-team-extensions.json`）上走三段：

| 阶段 | 账本变化 | 含义 |
|---|---|---|
| `reserveMessageDelivery` | 写入 **在途行** `inFlightMessages: {id, at, token}` | 「这个 id 归我，我正在投」 |
| `commitMessageDelivery` | 在途行 → **已送达** `processedMessageIds` | 「投递确认成功」 |
| `rollbackMessageReservation` | 删掉**自己 token** 的在途行 | 「投失败，id 还回去」 |

TTL（`TEAM_MESSAGE_RESERVATION_TTL_MS = 5 分钟`）**只用来区分两种回答**，不交还投递权：

- 行**未过期** ⇒ 再要同一个 id 得到 `in-flight`（"有人在投，稍后重试"）；
- 行**已过期** ⇒ 再要同一个 id 得到 `quarantined`（"上一个发送者失联，**不投、也不宣称已交付**，要保证就换新 id"）。

**关键性质**：过期行**永不被回收**——它占着的 id 与预算单位永久保留。这是刻意的：

> 回收 = 把投递权交还给一个**可能还活着**的旧发送者 ⇒ 新旧 owner 各投一帧 ⇒ 同一 `correlationId` 物理重复投递。这正是第五轮 MAJOR-1 的根因。

**但"不回收"≠"永远拿不回来"**（第六轮评审 MINOR-2 订正）：TTL **不自动**清理停滞行，
可**原 owner 的迟到 settle** 仍会改变它——迟到 `rollback` 删掉自己那行并**归还预算**，
迟到 `commit` 把它变成已送达（`stalledInFlight` 随之下降）。所以"永久占用"的准确前提是
**原 owner 永不再 settle**。

---

## 2. 它为什么会变成这样（五轮演化）

| 阶段 | 账本形态 | 新增能力 | 被哪轮评审打回 |
|---|---|---|---|
| 上游 omo | **无去重账**；`max_messages_per_run` 只声明、**不执法**（T5 记差异） | 配置面有，执行面没有 | — |
| T5（本仓初版） | 一本账 `processedMessageIds`，**先记后投**，失败退账 | 能去重、能补偿 | 第 3 轮（并发同 ID 误报"已交付"） |
| T17 | 加**封顶不裁剪**（满载显式拒收 `MESSAGE_LEDGER_FULL`） | 账有上界 | 第 2 轮（滚动裁剪破坏补偿退账） |
| T19 | 拆成**在途 + 已送达**两本账 | 并发语义正确 | 第 4 轮（cap 不计在途、TTL 无 owner） |
| T20 | 在途行加 **owner token** | 旧调用不会误删新预约 | 第 5 轮（TTL 仍是投递权交接） |
| **T21** | **TTL 只隔离，不交权** | 同 ID 不会被物理重复投递 | 未被驳回（本轮修法） |
| T22 | `messageLedger` 可观测 + 工具合同写明取舍 | 取舍**可见**而非静默 | —（自查残余） |

一句话读法：**前四轮都在补"我要投"和"我投完了"之间的区分，最后一轮承认了"我说不清"这个第三态。**

---

## 3. 问题清单

### P1（高）消息可能**静默丢失**

发送者挂住 → TTL 过期 → 该行永远停在在途。若**没有人再拿这个 id 来问**：

- 没有任何错误、没有任何通知；
- 那条消息可能到了，也可能没到；
- 唯一痕迹是 `team_status.messageLedger.stalledInFlight` 的计数，**必须主动去查**。

**这是本方案最实质的退步**：丢消息从「会报错」降级为「要主动查」。
**现有缓解**：仅可见性（`messageLedger`）。**未修**（见 §5-1）。

### P2（中高）**[OPEN]** 封存后其他调用无法复用该 id；若原 owner 永不再 settle，唯一恢复手段过重

封存后该 id 不再被**其他调用**复用，其预算单位也**不自动**归还。若原 owner 永不再 settle，唯一的恢复路径就是 `team_delete` + 重建——为了「两条消息挂了」而拆掉整个队（成员 / 任务板 / briefing 全丢），代价极不相称。

（若原 owner 迟到 settle：`rollback` 释放预算、`commit` 把 id 变成已送达。见 §1 订正。）

`cap` 默认 10000 时实际影响很小；但 `max_messages_per_run` **可配置**——本仓测试就用 1~3。**若有人把它设成 20，两次挂起就足以让该 run 再也发不出消息。**

**未修**（见 §4 选项 C）。

### P3（中）「换新 id 重发」本身允许**内容重复**

**[已修]** 历史版本的工具文案曾写 *"If you need a delivery guarantee, re-send the content under a NEW correlationId."* —— 那句已被换掉（现在是 *"A re-send under a NEW correlationId is BEST-EFFORT, not a guarantee"*，并明写「若前一个发送者其实投成功了，这段内容会到第二份」）。照旧句做的话，**内容可能真的到两遍**（在新 id 看来那是另一条消息）。

> **被保证的是「同一 id 不重投」；「同一段内容不重投」没有被保证。**
>
> 第六轮评审 MINOR-3 进一步订正：本方案**也不是 at-least-once 保证**——quarantined 恰恰允许零送达。准确的合同是三条：
> **① 同 ID 防重；② 可能漏投（静默）；③ 跨 ID 可能重复**。换新 id 重发是 **best-effort**，不是 guarantee。

这个限制目前只隐含在措辞里。**未修**（见 §5-2）。

### P4（中）TTL 分不清「慢」和「死」⇒ 误封存

5 分钟是常量。一个只是**慢**的发送者（成员冷启动唤醒 / 宿主排队 / 长 turn）超时后会被判死；它可能随后正常投递成功。

客户端**无法**区分「死」与「慢」，任何 TTL 都是猜测。**只能写进合同**：TTL 是**推定**死亡，不是确认死亡。**未修**（见 §5-3）。

### P5（中）重启是常态时，损耗单向累积

本部署里 SIGTERM / 重启是常规操作（e2e 有真实跨进程重启断言）。**任何一次重启，只要当时有一条在途投递，那条 id 就不再有其他调用能复用它、那一格预算也不再自动归还**。`stalledInFlight` 让它可见；它**不是只增不减**（原 owner 迟到 settle 会使其下降），但重启场景下原 owner 基本不会回来。

### P6（低）`max_messages_per_run` 语义漂移

原意接近「这个 run 能发多少条消息」，现在计的是**投递尝试**（含尚未/永不确认的那些）。于是「只成功发了 50 条却已撞上限」是可能的。已用 `messageLedger` 拆开展示缓解，但**名字与含义已不一致**。

另外，满载**不一定是终态**（第六轮评审 MINOR-2）：若名额被 fresh 在途行占着，等它 settle（失败会释放）即可；只有 `delivered` 自己达到 cap 才是真正的终态。错误文本与 `messageLedgerNote` 已按这三路分开写。

### P7（低-中，已披露）sidecar 损坏 ⇒ 封存记录**全部遗忘**

账本损坏的降级路径是「重建空账」，告警明写：*"a correlationId that was already delivered may be delivered AGAIN"*。即**隔离的强度等于 sidecar 的完整性**。

叠加长期挂着的 **MINOR-11**（`atomicWrite` 无父目录 fsync）：crash 可能丢掉最后一次写入 ⇒ 封存记录回退。

### P8（低）时钟

`at` 与 TTL 判断都用 `Date.now()`。NTP 回拨会让在途行**瞬间变新**（退回 `in-flight`，调用方继续等）或**瞬间变旧**（提前封存）。无单调时钟保护。

---

## 4. 根因与待议选项

**根因（单点）**：DSH 原生投递 `sendMessage(sender, targetSessionId, content[], { signal })` **没有幂等键**，且发送可能悬挂在里面 ⇒ 「检查所有权」与「真正发出」之间没有原子点 ⇒ 投递层 fencing 在本仓做不出来。

于是只有两条路：① 交出投递权并回收预算（重开重复投递 bug）；② 不交出（现方案，宁漏不重）。**现在选的是 ②。**

| 选项 | 内容 | 代价 | 需要谁 |
|---|---|---|---|
| **A（现状）** | 接受「同 ID 防重 + 可能漏投 + 跨 ID 可能重复」，把三条语义写进合同 | 问题 P1/P2/P5 长期存在 | 无需改动（合同文案已在 `ae38da3`→`645439a` 间修正） |
| **B** | 宿主导航层提供幂等键（`sendMessage(..., { idempotencyKey })`） | 要 DSH 侧支持；本仓只能等 | DSH |
| **C** | 提供**显式可审计的清账入口**（具名工具或运维动作），而不是只能拆队 | 等于把「回收」放回人手里；需要合同层面的正确性论证 | 本仓可做，但要新决策 |
| **D** | 小修：单调时钟、`stalledInFlight` 告警注入成功路径、note 写明「新 id = 承认可能重复」 | 不解决 P1/P2，只降低误读与时钟边界 | 本仓可做 |

**推荐**：短期做 **D**（成本极小）+ 把 **A** 的三条语义写死进合同；中期推动 **B**；**C** 只在 B 不可得且 P2 真的咬人时才考虑。

---

## 5. 三条小修（D）——**已全部实施**

> 初版登记时写作"尚未实施"；`01a0f7d`（`stalledInFlight` 可观测）与 `4c08deb`/`388340f`（术语与会话条件句）之后，三条都已在代码里。**保留本节是为了记录判据，不再表示待办。**

1. **P1 可见化**：任何一次**成功**的 `team_send_message`，若账上 `stalledInFlight > 0`，在返回 note 里带一句警告（"N earlier delivery(s) in this run were never confirmed — see team_status.messageLedger"）。把「要主动查」变成「每次发消息都被提醒」。
2. **P3 语义写明**：note 明写「换新 id 重发 = 承认内容可能重复，只在漏掉比重复更糟时这么做」。
3. **P4 语义写明**：note 明写「TTL 是推定死亡，不是确认死亡」。

---

## 6. 改动落点（供后续实现时定位）

| 关注点 | 位置 |
|---|---|
| TTL 常量（5 分钟） | `patches/omo-dsh/omo-team/src/team/team-state.ts:541` |
| `reserve` / `commit` / `rollback` / `messageBudget` | `patches/omo-dsh/omo-team/src/team/team-state.ts:1122 / 1200 / 1222 / 1248` |
| `quarantined` 的模型可见文案 | `patches/omo-dsh/omo-team/src/tools/team-message.ts:499` |
| 工具合同（「永久占预算」句） | `patches/omo-dsh/omo-team/src/tools/team-message.ts:628-632` |
| `messageLedger` 读数 + 读法说明 | `patches/omo-dsh/omo-team/src/tools/team-status.ts:151-160, 269-279` |
| cap 默认值（10000） | `patches/omo-dsh/vendor/team-core/src/config.ts:8`（vendor 字节，**不可改**） |
| 回归腿 | `tests/omo-team/team-message.test.ts`、`tests/omo-team/team-state.test.ts`、`tests/omo-team/team-status.test.ts` |

---

## 7. 若将来要"修回去"，必须先回答的问题

1. 回收后的投递权交给谁？新 owner 与原 owner 同时活着时，**谁**保证不重复投递？
2. 如果答不出第 1 条，回收就是**重开第五轮 MAJOR-1**——那时应该改的是**合同**（承认 at-least-once），而不是账本。
3. 幂等键是否已由宿主提供？若已提供，本文件的 P1/P2/P5 应整体作废并按新契约重写。

**关于"回收"的一个常见误解（必须更正）**：回收**不会**创造送达保证。它只把投递权交还给可能仍存活的旧 owner，因此「回收 + 承认 at-least-once」不是可行替代方案——它与第 1 节的取舍直接冲突，且**既不提升不重复、也不提升不丢失**。若真要走回收，前提是第 7 节第 1 条已有答案（谁保证不重复投递），而那需要宿主幂等键。
