// keyword-detector.ts — P4-T12 listener（task book WP：H-33 / Phase 3 S-06；
// manifest 第 15 行，模式 A pre-step）。
//
// WHAT THIS IS. OMO 的 `keyword-detector` hook（`chat.message` 上检测
// ultrawork / ulw / hyperplan / hpp / `hyperplan ulw` 组合词，命中即把整份
// 模式指令注入本轮）在 DSH 上的重生，形态 = **一个 `agent/pre-step`
// waterfall listener**（模式 A）：判别用户本轮文本 → 命中则用 `agent.inject()`
// 把模式指令排进该会话的下一步，**永远 `return next()`**。
//
// Upstream: packages/omo-opencode/src/hooks/keyword-detector/ @ v4.19.4
//   （冻结基线 tag，commit b072d279110bdda2c6ac2525d0d24dc54d16148a；PRE-1）。
//   语义移植（非逐字复制）：判别面（模式、剥壳、六级过滤、配置规则、组合
//   抑制、消息级幂等）逐条落地；**注入文案改为引用 P4-T4 vendor 的 SKILL.md
//   正文**；交付面（事件、注入、会话身份）全是 DSH 的。
//
// ═══════════ 上游逐文件处置（`git ls-tree -r v4.19.4` 实测） ═════════════════
//
// **件数算术**：上游**目录** `hooks/keyword-detector/` = 24 条目 = 16 实现 +
// 7 测试 + 1 个 `AGENTS.md`；`AGENTS.md` 按 N-03 不计入移植面。另加**目录之外**
// 的 `config/schema/keyword-detector.ts`（KeywordType 枚举 + 两个配置字段的
// 定义处，被 constants.ts 与 hook.ts 共同 import）→ manifest 的
// `upstreamFiles` = 16 + 1 = **17**，`upstreamTestFiles` = **7**。
// （📌 覆盖文档 phase4-commands.md §1.2 写的是「25 文件」= 目录 24 + 配置
// schema 1；本移植按「两列之和」登记 17 + 7，差异登记在 P4-T12 报告里，
// 该文档是仲裁侧文件，本任务只读。）
//
// 本目录（keyword-detector/）承载 4 个模块 + 本文件承载 listener 与 registrar：
//   keyword-detector/constants.ts  — 模式表 / 剥壳模式 / banner 锚点 / 名册快照
//   keyword-detector/messages.ts   — vendor 正文加载 + 3 个文案工厂 + 关键词表
//   keyword-detector/detector.ts   — 剥壳 / slash 判定 / 配置规则 / 组合抑制 / 幂等
//   keyword-detector/filters.ts    — 六级输入过滤（payload 与会话身份面）
//
//   IMPLEMENTATION (16 目录内 + 1 目录外)
//   config/schema/keyword-detector.ts (9) — PORTED 逐字（KeywordType 四元枚举
//                                     含 team 预留位 + 两个 optional 字段 →
//                                     constants.ts 的 KeywordType /
//                                     detector.ts 的 KeywordDetectorConfig；
//                                     zod 校验器本身不移植——本插件的配置读面
//                                     是 ctx 侧的普通对象，见 S-10）
//   index.ts (5)                    — PORTED（barrel：上列 4 个模块 + 本文件）
//   types.ts (4)                    — 跳过段（`KeywordDetectorState{detected,
//                                     injected}` 是上游的**运行时状态载体**，且
//                                     它描述的正是 default-mode 那个 Set
//                                     （本移植未移植，见 S-6）；DSH 侧**没有**
//                                     对应状态载体可保——同一条用户消息只在一批
//                                     可见，重复触发由 claim 破坏性 + ① 号 user
//                                     源过滤防住，不需要会话级状态。单独保一个
//                                     接口等于多一个无人写的状态面）
//   constants.ts (54)               — PORTED（模式逐字；5 个消息工厂 → messages.ts）
//   detector.ts (80)                — PORTED（extractPromptText → filters.ts）
//   hook.ts (248)                   — PARTIAL PORT（六级过滤 + 幂等 + 注入面
//                                     落地；default-mode 与 toast 见 S-6/S-8）
//   AGENTS.md (104)                 — NOT PORTED（上游目录说明文档，非运行时面；
//                                     N-03 亦不入 manifest 两列）
//   hyperplan/index.ts (2)          — PORTED（barrel，合并进关键词表）
//   hyperplan/default.ts (33)       — PORTED（模式逐字 → constants.ts；8 步工作流
//                                     → messages.ts 的 hyperplan 文案 + S-7 载体声明）
//   team/index.ts (2)               — PORTED 逐字（枚举位；不接线，见 S-3）
//   team/default.ts (26)            — 跳过段（S-3：team_* 工具族 DSH 无等价面）
//   ultrawork/index.ts (2)          — PORTED（barrel，合并进关键词表）
//   ultrawork/default.ts (9)        — PORTED（转发 → vendor 正文，见 S-2）
//   ultrawork/gpt.ts (9)            — 跳过段（S-2：按模型分流，DSH 无模型族路由）
//   ultrawork/gemini.ts (9)         — 跳过段（S-2）
//   ultrawork/glm.ts (9)            — 跳过段（S-2）
//   ultrawork/planner.ts (7)        — 跳过段（S-2 + S-5：planner 席位整体被
//                                     ⑤ 号闸拦掉，文案永不送达）
//   ultrawork/source-detector.ts (51) — PORTED（isNonOmoAgent / isPlannerAgent
//                                     逐字 → filters.ts；getUltraworkSource /
//                                     getRuntimeVariant → S-2/S-6）
//
//   TEST SEEDS (7 — 89 its = 计划书 §4.7 L1 的移植种子)
//   index.test.ts (1307, 47)              — PORTED（命中/剥壳/配置/组合/幂等组；
//                                           toast 断言剔除见 S-8，default-mode
//                                           断言剔除见 S-6）
//   hyperplan.test.ts (328, 14)           — PORTED（模式组，含 #4215 的 `.hpp` 负例）
//   hook-ralph-loop.test.ts (259, 11)     — 跳过段（S-9：ralph-loop 的自注入面
//                                           是 opencode 专属，DSH 无等价面）
//   hyperplan-ultrawork.test.ts (262, 10) — PORTED（组合严格相邻 + 独立抑制组）
//   ultrawork-edge-trigger.test.ts (138, 4) — PORTED（注入文本已在上下文时的
//                                           消息级幂等组）
//   ultrawork-runtime-variant.test.ts (58, 2) — 跳过段（S-2）
//   ultrawork/ultrawork-source-routing.test.ts (55, 1) — PORTED（isPlannerAgent /
//                                           isNonOmoAgent 谓词组）
//
// ═══════════ S — 跳过段与收窄（逐条理由，不允许静默吞掉） ═══════════════════
//
// S-1 **上游 `chat.message` → DSH `agent/pre-step`（事件面）**。上游的触发面是
//     opencode 插件的 `chat.message`（一条**消息**一次）；DSH 的模式 A 面是
//     `agent/pre-step`（**一步**一次，H-32 实测同一会话一次会话可产生 268 步）。
//     这不是可选的换词：注入面只有 pre-step 有（`agent.inject()` 挂在 agent 上）。
//     **后果已在 S-6 登记**：初版据「两步一触发」补了一道会话级一次性守卫，
//     PR #10 复核发现该守卫的**必要性前提**（同一条消息在每一步都可见）与宿主
//     事实矛盾、遂**删除**。今天残留的真实差异只有「批次可能含多条 user 消息」，
//     由判定面**逐条**处理（对齐上游的逐条触发），见 S-13。
//
// S-2 **模型变体收窄：5+1（hook 侧 5 个模型变体 + 1 份 codex 专用 md）→ 1**。
//     上游两份分流：(a) hook 侧按 `gpt`/`glm`/`gemini`/`default`/`planner` 五份
//     `ULTRAWORK_*_PROMPT`（判据 = `input.model.modelID` 与 session agent 名，
//     hook.ts:39-45）；(b) 1 份 `ULTRAWORK_CODEX.md`。DSH 名册里没有这些模型族，
//     pre-step 载荷也不带 model 字段，按模型分流**没有第二个消费方**。处置：一份
//     名册感知正文（messages.ts 的 `ROSTER_TAIL_NOTE` 补齐 reviewer 席位），
//     `getRuntimeVariant` 与 `getUltraworkSource` 随之不移植。**收窄面已登记**：
//     vendor ultrawork 正文点名 `momus`（3 次）/`metis`（2 次）两个名册里没有的
//     reviewer，尾注把它们映射到 `plan-consultant` / `plan-reviewer`。
//     （`UNMAPPED_REVIEWER_LITERALS` 与 `ROSTER_TAIL_NOTE` 的注释里不再另起
//     一套计数——本行是 S-2 计数的唯一定义处。）
//
// S-3 **team 跳过段（枚举位预留）**。`team/default.ts` 的 26 行是
//     `TEAM_MESSAGE = TEAM_MODE_PROMPT` 的一次转发，正文以 `team_create` 团队
//     工具族为骨架。C 组证据「载体」已判定该工具族 DSH **无等价面**（最近邻是
//     subagent，但缺 teamRunId / 广播 / 关闭协议）。处置：`team` 的 type 与
//     pattern 常量**保留**（枚举位，Phase 5 接 Team Mode 时只需补一个消息工厂），
//     但不接线——一个没有等价载体的关键词命中后只会产出死指令。
//
// S-4 **non-OMO agent 闸的可达形态**。上游 `isNonOmoAgent` 判的是"这个会话被
//     用户切到了 opencode 内置的 builder/plan"。DSH **没有"会话切 agent"这个
//     动作**（agent 在子会话创建时按 roster 行固定，ulw-execute/identity.ts 已
//     就位该事实），故上游谓词在 DSH 上恒假。谓词**逐字保留**（审计对照 +
//     将来 reintroduce 时的防线），真正可达的判定改为 §filters 的
//     `isForeignAgentSession`：子会话 persona 自称了一个**不在 Phase 2 名册**里的
//     `omo-*` agent（外来 agent 借 OMO 挂载的会话）→ 不注入。
//
// S-5 **planner 闸的覆盖面（PR #10 评审 A-1 更正）**。上游 `isPlannerAgent`
//     （名字含 prometheus/planner，或规范化后含独立词 `plan`）**谓词本身**在 DSH
//     名册上原样就位：`prometheus` 命中第一支；`plan-consultant` / `plan-reviewer`
//     规范化成 `plan consultant` / `plan reviewer` 后命中 `\bplan\b`。三个规划席位
//     **都在谓词的覆盖范围内**——但「在覆盖范围内」≠「闸在本部署里会触发」。
//     实测可观测范围（DSH 0.1.5-rc.1 亲核）：
//       * **continuable 子会话**：descriptor 在 setup 期**同步**落盘且**含 persona**
//         （`dsh-subagent/lib/index.js:1063-1067`）→ ⑤ **先于** ⑥a 执行：规划
//         席位在 background 整跳之前就被拦掉（`decideKeywordInjection` 的
//         `isPlannerAgent` :540 在 `isBackgroundSession` :542 之前，单测
//         tests/omo-hooks/keyword-detector.test.ts 的 ⑤/⑥a 段钉死这个位序）。
//         **与上游位序一致**：v4.19.4 `hook.ts:98-106` 的 planner 段同样排在
//         `hook.ts:108-114` 的 background 段**之前**。
//       * **one-shot 子会话**：persona **结构性不可持久化**
//         （`ONE_SHOT_DESCRIPTOR_KEYS` 不含 persona，descriptor.js:30-37；
//         两个 one-shot 分支都不落——parse 的 :118-125 与 snapshot 的 :151-157），
//         且 descriptor 还比首个 pre-step 晚一步落盘
//         （`attachDescriptorAppend` 在 `await next()` 之后 append，
//         in-process-driver/lib/index.js:139-149）→ ⑤ 对它**恒失明**。
//     所以 DSH 上「三个规划席位被覆盖」的准确表述是：**谓词覆盖三个席位；会话
//     面上，persona 可得的会话走 ⑤，persona 不可得的会话由「身份不可判定」闸
//     保守整跳**（`subagent-identity-undecidable`，见 S-13 ③）。本仓姊妹模块早已
//     登记同一边界（prometheus-md-only.ts:85-87、ulw-execute/identity.ts:24-27），
//     原措辞与它们矛盾。
//     上游 `ultrawork/planner.ts` 那份文案因此永不送达（它在 ⑤ 号闸之后）——
//     无论哪种会话形态。
//
// S-6 **双幂等的第二道：初版加了，PR #10 复核后删除（对齐上游）**。
//     **上游只有一道**：消息级 `filterAlreadyInjectedKeywords`
//     （`!text.includes(keyword.message)`，v4.19.4 hook.ts:31-36）——本移植**逐字
//     保留**，它今天仍是唯一的幂等闸。
//     另一道 `defaultModeUltraworkInjectedSessions`（hook.ts:23）**只在
//     default-mode 分支被读**：`grep -n` 上游 hook.ts:120-121 可证它位于
//     `if (detectedKeywords.length === 0)` 之内，也就是「本轮没命中关键词、改由
//     配置自动开 ultrawork」这条路径。**关键词触发路径上上游没有任何会话闸**。
//     完整链路（**登记它，因为它是被证伪后删掉的，不是从未存在**）：
//       1. 初版（P4-T12 任务书）按「S-1 每步触发一次」加了会话级一次性 Set，
//          理由写的是「同一条 `ulw` 消息会触发本会话的每一个 pre-step（268 步
//          实测），一条消息会注入 268 次 30 KB 指令」。
//       2. PR #10 评审复核：**该前提与宿主事实矛盾**。`payload.messages` 是
//          `inbox.claim(...)` 的返回值（dsh-agent-loop/lib/index.js:889,895），
//          而 `claim`（:104-111）是**破坏性** splice（`mutate("next-step", 0,
//          this.nextStep.length, [], false)`）→ **一条用户消息只在一个批次可见**。
//          268 是单会话步数，不是同一条消息的重复可见次数。
//       3. 处置：**删除**会话级闸（`injectedSessions` / `alreadyInjected` /
//          `session-one-shot`），对齐上游。真实后果是修复了一个缺陷：初版会让用户
//          在同一会话里第二次敲 `ulw` 被静默吞掉（只留一行 warn），上游会正常
//          再次武装。
//     **删闸后为什么没有重复注入面**（两条，都是可核的宿主事实）：
//       ① **闸挡 plugin 源注入消息**：本 hook 注入的消息带
//          `source.kind === 'plugin'`，① 号 user 源过滤在下一批把它摘掉，所以
//          「注入正文里的 `ulw` token 触发自我再注入」这条路根本不成立
//          （filters.ts 的 `isUserAuthoredMessage`）。
//       ② **claim 破坏性防同消息重触发**：同一条用户消息不会被第二个 pre-step
//          再次看到，所以它不会被判第二次。
//     两条合起来 = 「同一条消息只武装一次」这个**上游就有的性质**在 DSH 上仍然
//     成立；被删掉的是一个上游**没有**的额外收窄。
//
// S-7 **hyperplan 的载体差异**。vendor `hyperplan/SKILL.md`（senpi 变体）以
//     `team_create` / `task_send` / `team_delete` 为骨架（实测 `team_*` 13 次、
//     `task_send` 17 次），与 S-3 同一载体问题；但 hyperplan **本阶段在计划书
//     的端口内**（`hyperplan.test.ts` 14 its 是移植种子），故不整词跳过。
//     处置：正文逐字照搬 vendor + banner 后加一段**载体声明**
//     （`HYPERPLAN_CARRIER_NOTE`：工具名的 DSH 对应物 = 5 次 `task(...)` 子代理
//     派发，无 `team_run_id`，lane 靠子会话标签）。声明是环境事实，不是指令改写。
//     ⚠️ 同时**不收尾**上游 hyperplan.md 那句 "enable `team_mode.enabled` in
//     `~/.config/opencode/oh-my-opencode.jsonc`"——P4-T1 已登记该配置路径
//     与模板 `~/.omo/omo.jsonc` 不一致，且 opencode 的配置面在 DSH 上根本不存在。
//
// S-8 **toast 收窄**。上游每次命中都调 `ctx.client.tui.showToast({…})` 弹 UI
//     提示（hook.ts:124-160，三处）。DSH 侧无 `client.tui` 等价面（本插件是纯
//     Host listener，且 Workspace 明确禁止跨进程读会话）。处置：**不移植**，
//     改以 `console.warn` 的审计行承载同样的可观测性（每次注入一行，含
//     session 标签与命中类型）。用户可见性由注入正文里的 banner
//     （"首行必须说 ULTRAWORK MODE ENABLED!"）承担——那本来就是主路径。
//
// S-10 **zod 配置校验器不移植**。上游 `config/schema/keyword-detector.ts` 用
//     zod 声明 `KeywordDetectorConfigSchema`，宿主在读用户配置时校验。DSH 的
//     omo-hooks 组合**不向插件暴露 config 服务**（index.ts 头部：本插件无
//     Config 导出），所以本移植的配置读面是 `ctx.config?.keywordDetector` 的
//     **可选**读（`readConfigOverride`）：缺席或非对象即回落默认（全启用、无
//     allowlist），字段非数组即视同缺席。**语义方向与 zod 一致**（非法值不
//     抛、只回落默认），差别是 zod 会**报错**而这里静默回落——这是刻意选择：
//     一份坏配置不该让每一步 pre-step 都失败。代价是拼错的键名不会有任何
//     提示，故两处字段名（camelCase 与上游 snake_case）都接受。
//     ⚠️ 若将来本插件真的挂上 cordis Config，zod 校验器应在那时接上，
//     而不是在这里先造一个（那会是一个永远不执行的校验器）。
//
// S-9 **hook-ralph-loop.test.ts 跳过段**。它的 11 例断言的是 ralph-loop 特性
//     把 keyword 注入文本自举进循环的那条自注入路径（opencode 专属面，DSH 无
//     ralph 特性）。不移植用例；该路径的**防御**（已注入文本不重复触发）由 ① 号
//     消息级幂等 + ① 号 user 源过滤共同承担——注入消息是 plugin 源，下一批就被
//     摘掉，永远进不了检测面——两条都在本移植的单测里（S-6 记录了会话级闸为何
//     不再参与这件事）。
//
// S-11 **登记：注入文本的抵达时机比上游晚一个 step 边界**（映射性质，非缺陷）。
//     上游（opencode）：命中后直接改写 `output.parts[textPartIndex].text`，注入
//     文本与原文本在**同一条消息**里，**该消息的首个模型请求就已经带上**它。
//     DSH：模式 A 只能在 waterfall 里 `agent.inject(...)`，而 dsh-agent-loop 在
//     进入 waterfall **之前**已经 claim 了本批 inbox（lib:888-899）——所以注入
//     消息要等**下一个 step 边界**才进 inbox，模型在**下一次**模型请求才看到。
//     后果：命中 `ulw` 的那一轮，模型的第一遍思考**看不到** ultrawork 协议，
//     从下一轮起才生效。
//     **不修**：这是模式 A 的固有语义（`agent/pre-step` 的时点由宿主决定，
//     插件无法把注入排进已 claim 的批次）。本移植**只登记**，不改时点。
//     ⚠️ **P4-T13 的 e2e 断言口径按此设计**：`ultrawork-keyword-injected` 场景
//     不得断言"首个模型请求就带 `ULTRAWORK MODE ENABLED!`"（会红），应断言
//     "本轮注入被记录进 session log，且**后续**某次模型请求带上了它"。
// S-12 **检测面剥掉命令扩展消息**（L4 真模型冒烟实证的移植分歧，已修）。
//     上游的检测面是**原始用户输入行**，匹配前先剥 slash 前导（`/ulw-execute
//     alpha` → `alpha`），因此上游**永不自触发**。DSH 侧读的是会话消息流，命令
//     准入后 omo-commands 会把命令模板作为一条 `source.kind==='user'` 的 followup
//     消息投进会话——user 源过滤与 synthetic 过滤都放它过，于是**命令模板本身**
//     被当成本轮用户散文送去匹配：实测 `/ulw-execute alpha` 触发了 ultrawork
//     绑定（模型在 turn 2 就喊 `ULTRAWORK MODE ENABLED!`），`/hyperplan` 同形风险。
//     修法：`readCurrentUserTexts` 跳过文本含 `<command-instruction>` 的消息——那是
//     上游**命令条目的 `template` 字面量**首尾行（v4.19.4 commands.ts:43/45），
//     本仓 `omo-commands/src/templates/*.ts` 逐字保留，两侧同锚。实测：外框不在
//     `formatCommandTemplate` 里。与上游**同源**（上游剥原始行上的 slash 前导，我们剥扩展消息上的
//     命令包裹，都是把派生产物从用户散文里摘出去）。`continue` 而非整体放弃，
//     所以「本批命令扩展 + 同批真实散文」时后者仍被检测。详见 filters.ts。
//     `/ulw-plan` 手势不受影响：载体是 `<skill_content>`（source.kind ===
//     'skill-invocation'），早已被 user 源过滤排除。
//     另注：命令扩展消息里那句 `ulw` 唯一可能导致的自触发形态，也已被两道宿主
//     事实关掉——注入正文是 plugin 源（① 号过滤摘掉），同一条用户消息不会被
//     第二个 pre-step 再看到（claim 破坏性，见 S-6）。所以 S-11 的「晚一步」是
//     唯一的可观测差别，不要把它和幂等混成一个失败现象。
//
// S-13 **子会话身份面（PR #10 评审 A-1/A-2 采纳「选项甲」，DSH 0.1.5-rc.1）**。
//     本条登记三件事，事实与出处见 filters.ts 头部与 S-5：
//     ① **⑥b 的判定面**从「descriptor 存在」换成 `session.header.origin ===
//        'subagent'`。旧判据在 one-shot 子会话上永不成立——descriptor 比首个
//        pre-step 晚一步落盘，而 task 文本只在那一批可见。
//     ② **descriptor 只在 `origin === 'subagent'` 的会话上读**，且闭包缓存
//        **只缓存 `found: true`**。`found:false` 在 one-shot 的首步是**正常
//        状态**，缓存它就是把时序窗永久化（缓存毒化）。主会话因此**根本不扫
//        descriptor**——这同时消掉 MINOR-5 担心的性能回退：主会话（无 origin）
//        的 268 步**零次** `ownEvents()` 全副本调用，旧实现是每步一次。
//     ③ **`origin === 'subagent'` 且（descriptor 缺席 或 mode==='one-shot'）**
//        → 具名 reason `subagent-identity-undecidable` **整个 pre-step 跳过**，
//        ④⑤⑥b 在 persona 不可得的会话上一律不判定。这守住上游位序最高的意图
//        （规划席位不被 30 KB 执行指令污染），代价是关掉上游「前台子会话放行
//        ultrawork/combo」这条 lane——**如实登记为收窄**，理由（concerto 默认委派
//        形态 continuable 本就被 ⑥a 整跳；atlas 的 ultrawork 武装走 H-32 自有
//        注入面）见 filters.ts 头部。
//     ④ 由此 ⑥b 的 `SUBAGENT_ALLOWED_TYPES` 过滤**在新形态下不可达**：continuable
//        被 ⑥a 拦下、one-shot 被本闸拦下，能走到 ⑥b 的只有「origin=subagent 且
//        descriptor found 且 mode 既非 one-shot 也非 continuable」这一条残余路径
//        （descriptor 格式目前不产生它）。**该过滤按防御层保留**（若将来放宽不可
//        判定闸，它立刻重新成为有效防线），不静默删除——删掉会改动上游对齐面的
//        登记（上游 hook.ts:150-152 的非主会话类型收窄）。
//
// ═══════════ 注入面映射（模式 A） ═══════════
//
// 上游把注入文本**写回同一条消息的文本块**：
//     output.parts[textPartIndex].text = `${allMessages}\n\n---\n\n${originalText}`
// DSH 模式 A 没有"改写既有消息"的接口，唯一的注入面是 `agent.inject(message)`
// ——且参数是 `UserMessage` **对象**不是裸字符串（见上方 BLOCKER-1 注记：inbox
// 读 `message.id` 做 pending 唯一校验，裸字符串第二次注入即撞 id）
// ——它排一条**新消息**到下一步之前，用户原文本原样留在后面。因此：
//   * 注入文本 = 各命中文案以 `\n\n` 连接 + `\n\n---\n` 分隔尾行。
//     尾行保留上游的 `---` 分隔装置（它的用途是标出"以上是 hook 注入、以下是
//     用户原话"的边界；DSH 里两者在不同消息上，尾行让注入消息自带闭合标记）。
//   * 用户原文本**不被覆盖**（这是 DSH 面的能力，不是丢弃上游语义）。
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.

import {
  SUBAGENT_ALLOWED_TYPES,
  type KeywordType,
} from './keyword-detector/constants.ts'
import {
  detectKeywordsWithMessages,
  filterAlreadyInjectedKeywords,
  looksLikeSlashCommand,
  removeCodeBlocks,
  resolveConfig,
  suppressComboStandalones,
  type KeywordDetectorConfig,
} from './keyword-detector/detector.ts'
import {
  isBackgroundSession,
  isForeignAgentSession,
  isNonOmoAgent,
  isPlannerAgent,
  isSubagentIdentityUndecidable,
  isSubagentSession,
  isSystemDirective,
  readCurrentUserTextsDetail,
  readPreStepSession,
  readSessionDescriptor,
  readSessionOrigin,
  removeSystemReminders,
  resolveRosterSeat,
  type SessionDescriptor,
} from './keyword-detector/filters.ts'
import {
  describeInstructionTexts,
  loadInstructionTexts,
} from './keyword-detector/messages.ts'
import type { InstructionTexts } from './keyword-detector/constants.ts'
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar, HooksRegistrationContext } from '../index.ts'

/** 本 hook 的 manifest id（= 文件名，c13 的双向绑定）。 */
export const KEYWORD_DETECTOR_ID = 'keyword-detector'

/**
 * 注入消息 `source.plugin` 用的**包名**，不是 hook id。
 *
 * 同包先例口径：ulw-execute（`ULW_EXECUTE_PLUGIN`）、bash-file-read-guard 的
 * notice 载荷都是 `'omo-hooks'`（e2e 实测 session log 里
 * `source:{kind:'plugin',plugin:'omo-hooks',form:'notice'}`）。`source.plugin`
 * 标识的是**写入方插件**，消费方按它分流；填 hook id 会让下游看到一个它不认识的
 * 写入方名。hook 身份由上面那个 `KEYWORD_DETECTOR_ID` + 诊断行前缀承担。
 */
export const KEYWORD_DETECTOR_PLUGIN = 'omo-hooks'

/** 注入文本里的分隔尾行（上游 `${allMessages}\n\n---\n\n${originalText}` 的尾装置）。 */
export const INJECTION_SEPARATOR = '---'

/**
 * 「不是子会话」的空身份面。
 *
 * 共享常量（不是每步新建的对象字面量）：listener 在**非子会话**的每一步都返回它，
 * 而它是只读的，所以一个共享实例与每步新建在行为上不可区分——但前者让「这一步
 * 根本没读 descriptor」在代码里一眼可见。冻结它，避免下游误改。
 */
const NO_DESCRIPTOR: SessionDescriptor = Object.freeze({
  found: false,
  mode: undefined,
  persona: undefined,
  label: undefined,
})

// ── 注入载荷（BLOCKER-1：必须是 UserMessage，不能是裸字符串） ──────────────
//
// 上游（opencode 的 `agent.inject`）收一个字符串；**DSH 不然**：
//   * dsh-agent 的类型是 `inject(message: UserMessage)`（runtime-types.d.ts:209）；
//   * dsh-agent-loop 把注入消息 splice 进 inbox，随后 **读 `message.id` 做
//     pending 唯一性校验**（lib:192-194）。裸字符串的 `id` 是 `undefined`，所以
//     同一个会话里第二次注入就撞上 `message "undefined" is already pending`。
//   * 而且裸字符串缺 `role` / `content` / `source`，对下游是残缺载荷。
// 形态与同插件先例 ulw-execute.ts（`buildInjectionMessage`，:264-284 / :390）完全
// 同构：id 每注入一次新铸，`source.form = 'instructions'` 表明"这段在指导模型"。

export interface InjectedTextBlock {
  readonly type: 'text'
  readonly text: string
}

export interface InjectedPluginSource {
  readonly kind: 'plugin'
  readonly plugin: string
  readonly form: 'instructions'
}

export interface InjectedUserMessage {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly InjectedTextBlock[]
  readonly source: InjectedPluginSource
}

/** 铸一条注入消息（**每次注入一个新 id** —— 唯一性语义由单测钉死）。 */
export function buildInjectionMessage(text: string): InjectedUserMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: KEYWORD_DETECTOR_PLUGIN, form: 'instructions' },
  }
}

/** `payload.agent`，读不到返回 undefined。 */
interface PreStepAgentLike {
  readonly inject?: (message: InjectedUserMessage) => unknown
  readonly session?: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// ── 诊断行 ──────────────────────────────────────────────────────────────────

/** 每次注入一行（替代上游的 toast，理由见 S-8）。 */
export function formatKeywordDetectorLine(text: string): string {
  return `[omo-hooks] ${KEYWORD_DETECTOR_ID}: ${text}`
}

/** 吞掉的失败行（pre-step 抛错会让整步失败，纪律②）。 */
export function formatKeywordDetectorFailureLine(what: string, err: unknown): string {
  const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return formatKeywordDetectorLine(`${what}: ${reason}`)
}

/** vendor 正文不可用时的具名 NOTE（一次性，不注入任何替代文本）。 */
export function formatKeywordDetectorDegradedLine(reason: string): string {
  return formatKeywordDetectorLine(`NOTE: keyword injection disabled — ${reason}`)
}

// ── 判定（纯函数，单测直接打它） ────────────────────────────────────────────

/** 每一条"不注入"的具名原因；**不静默**：每个值都对应上游的一行 log。 */
export type KeywordSkipReason =
  | 'no-inject-surface'
  | 'synthetic-internal'
  /** MINOR-7：S-12 跳过了命令扩展消息——与「没有用户文本」分开命名，故它会记日志。 */
  | 'command-expansion'
  | 'system-directive'
  | 'slash-command'
  | 'foreign-agent'
  | 'non-omo-agent'
  | 'planner-agent'
  | 'background-session'
  /**
   * S-13：子会话，但 persona 结构性不可得（one-shot descriptor 不含 persona /
   * 首步 descriptor 还没落盘）→ ④⑤⑥b 的判据无输入，保守整跳。**必记日志**——
   * 它是「身份不可判定」，不是「没有用户文本」，静默它等于把 30 KB 指令的注入
   * 决策藏起来。收窄面见 S-13 ③ 与 filters.ts 头部。
   */
  | 'subagent-identity-undecidable'
  | 'no-keyword'
  | 'already-injected-message'
  | 'subagent-keyword-filtered'
  | 'vendor-texts-unavailable'

export type KeywordDecision =
  | { readonly kind: 'skip'; readonly reason: KeywordSkipReason }
  | {
    readonly kind: 'inject'
    readonly types: readonly KeywordType[]
    readonly text: string
    readonly agentName: string | undefined
  }

/** 判定所需的全部输入（把载荷读面收在一个窄接口后面）。 */
export interface KeywordStepFacts {
  /** 是否有 `agent.inject` 注入面。 */
  readonly hasInject: boolean
  /** vendor 正文；缺席即降级（不注入替代文本，见 messages.ts）。 */
  readonly texts: InstructionTexts | undefined
  /**
   * 本批**全部**用户散文候选（已过 ① 号闸与 S-12，按批次顺序）。
   * 空数组 = ① 号 skip。**不是**单值——见 S-1 与 filters.ts 的批次读面。
   */
  readonly promptTexts: readonly string[]
  /** MINOR-7：本批是否因为 S-12 跳过了一条命令扩展消息（故 `promptTexts` 为空）。 */
  readonly commandExpansionSkipped?: boolean
  /** `session.header.origin`（S-13 ①：无时序窗的子会话判定面）。 */
  readonly sessionOrigin: 'subagent' | undefined
  readonly descriptor: SessionDescriptor
  readonly config: KeywordDetectorConfig
}

/**
 * 六级过滤 + 消息级幂等 + 组合抑制的**纯判定**。
 *
 * 单一数据源：`KeywordStepFacts` 一次带齐载荷面 / 身份面 / 配置面。之前这里
 * 还有一个并行的 `KeywordDecisionDeps`（texts + config），而两项在
 * `facts` 里同样存在——两个来源可以各说各话（"降级判定看过 facts.texts，正文
 * 却用 deps.texts 组装"），那正是最难查的一类漂移。故合并为一处。
 *
 * 实际顺序（本文件即顺序，对齐上游 hook.ts:69-161 的六道闸）：
 *   ① 合成/内部 → ② system directive → ③ slash 前导（**后两道逐条**）
 *   → ⑥' 子会话身份不可判定（S-13 新增，④⑤⑥b 的前提）
 *   → ④ 外来 persona → ④' 上游 builder/plan 谓词 → ⑤ planner 席位
 *   → ⑥a background session
 *   → 命中判别（**逐条**，合并去重；含组合抑制与配置规则）
 *   → ⑥b 非主会话只留 ultrawork/combo → ①号幂等（消息级，逐条）
 *
 * ④ 处与上游不同，都是刻意的：
 *   * **⑤ 提前到判别之前**：上游在判别之后才用 planner 谓词清空三类命中
 *     （hook.ts:98-106），本移植在判别之前就返回 skip——结果集完全相同，但
 *     少组装两份 30 KB 文案（upstream 的顺序会先把 planner 席位的三份正文
 *     构造出来再全部丢掉）。
 *   * **⑥b 提前到幂等之前**：两者都是逐条独立的纯过滤，交换顺序不改变结果集，
 *     但先收窄候选让审计日志更准。
 *   * **②/③ 按候选逐条判**：上游的触发面是逐条消息，所以「这条文本是不是系统
 *     指令 / slash 前导」只约束**这一条**——同批里另一条用户散文不因此被连坐。
 *     若全部候选都被 ②/③ 拦掉，返回**第一条**被拦候选的具名 reason（日志里
 *     仍能看到是哪一闸关的），与旧单值实现在单条批次上完全一致。
 *   * **⑥' 提到 ④ 之前**（S-13）：它是 ④⑤⑥b 的**前提**（persona 到底可不可得），
 *     不是这三道闸里的第四道。上游没有对应面——它的 persona 永远可读。
 */
export function decideKeywordInjection(facts: KeywordStepFacts): KeywordDecision {
  if (!facts.hasInject) return { kind: 'skip', reason: 'no-inject-surface' }
  if (facts.texts === undefined) return { kind: 'skip', reason: 'vendor-texts-unavailable' }
  // MINOR-7：`command-expansion` 必须排在 `synthetic-internal` **之前**——S-12 跳过后
  // `promptTexts` 同样是空，不先判就会被并进去，而并进去它就不记日志了。
  if (facts.promptTexts.length === 0 && facts.commandExpansionSkipped === true) {
    return { kind: 'skip', reason: 'command-expansion' }
  }
  if (facts.promptTexts.length === 0) return { kind: 'skip', reason: 'synthetic-internal' }

  // ②/③ 逐条：被拦的候选不参与判定，也不连坐同批的其他候选。
  let blocked: 'system-directive' | 'slash-command' | undefined
  const proseTexts: string[] = []
  for (const text of facts.promptTexts) {
    if (isSystemDirective(text)) { blocked ??= 'system-directive'; continue }
    if (looksLikeSlashCommand(text)) { blocked ??= 'slash-command'; continue }
    proseTexts.push(text)
  }
  if (proseTexts.length === 0) {
    // ⚠️ **原式是 `blocked ?? 'synthetic-internal'`，那个 fallback 是死分支**（复审
    // n-7d）。可证：`:518` 已拦掉 `promptTexts` 为空的情形，故循环至少跑一次；
    // 每条候选只有三条出路——② 拦、③ 拦、或进 `proseTexts`。`proseTexts` 为空 ⟺
    // 前两条至少发生过一次 ⟹ `blocked` 必有值。留着 `??` 会让读者以为「还有第三
    // 条没有具名 reason 的路」，而它永远取不到。
    //
    // 不变量破了就**显式崩**，不静默换一个 reason：崩在本 listener 内被 :687-692
    // 的 try/catch 接住，记一条 `listener failed` 失败行后照常 `next()`（纪律②，
    // pre-step 抛错不得让整步失败）。这条分支今天不可达，保留它是为了让「②/③ 的
    // 判据被改成不设 reason」这种未来的改动**响**，而不是悄悄换成一个错的 reason。
    if (blocked === undefined) {
      throw new Error(
        'keyword-detector invariant: no prose left AND no gate reason — a candidate was neither prose nor blocked',
      )
    }
    return { kind: 'skip', reason: blocked }
  }

  // S-13 ③：子会话但身份不可判定 → 整跳。这一闸排在 ④/⑤/⑥a **之前**，因为
  // 它的输入（descriptor 是否落盘、mode）就是后三者判据的**前提**。
  if (isSubagentIdentityUndecidable(facts.sessionOrigin, facts.descriptor)) {
    return { kind: 'skip', reason: 'subagent-identity-undecidable' }
  }

  const agentName = resolveRosterSeat(facts.descriptor.persona)
  // ④ 号闸的两个分支：外来 persona 优先，上游谓词次之（谓词逐字保留，见 S-4）。
  if (isForeignAgentSession(facts.descriptor.persona)) {
    return { kind: 'skip', reason: 'foreign-agent' }
  }
  if (isNonOmoAgent(agentName)) return { kind: 'skip', reason: 'non-omo-agent' }
  // ⑤ 号闸：规划席位不接关键词指令（谓词覆盖三个 DSH 席位，会话面见 S-5）。
  if (isPlannerAgent(agentName)) return { kind: 'skip', reason: 'planner-agent' }
  // ⑥a：后台委派会话（descriptor mode = continuable）整会话跳过。
  if (isBackgroundSession(facts.descriptor)) {
    return { kind: 'skip', reason: 'background-session' }
  }

  // 逐条判别 → 按 type 去重合并（同 type 多条命中只注入一份）。
  // ⚠️ 合并后再跑一次组合抑制：组合正文**逐字包含** ultrawork 正文，所以「前一条
  // 命中 ultrawork、后一条命中组合」若不抑制，一次注入里会出现两份 ultrawork
  // 正文。单条批次上这次调用是幂等的（detect 内部已抑制过），所以它不影响任何
  // 既有行为——它只在多候选批次上起作用，且方向与上游一致（上游两条消息会注入
  // 两份正文；我们合成一份，取其中更完整的组合）。
  const cleanTexts = proseTexts.map((text) => removeSystemReminders(text))
  // 上面的 `facts.texts === undefined` 早退把这个字段收窄成 `InstructionTexts`，
  // 但收窄不穿过箭头函数的闭包——所以取一个局部别名，别在闭包里重新读 facts。
  const texts = facts.texts
  const seenTypes = new Set<KeywordType>()
  let hits = suppressComboStandalones(
    cleanTexts.flatMap((text) => detectKeywordsWithMessages(
      removeCodeBlocks(text),
      { texts, agentName },
      facts.config,
    )).filter((hit) => {
      if (seenTypes.has(hit.type)) return false
      seenTypes.add(hit.type)
      return true
    }),
  )
  // ⑥b：非主会话（被委派的子会话）只保留 ultrawork 与组合模式。
  // ⚠️ **可达性（S-13 ④）**：continuable 被 ⑥a 整跳、one-shot 被 S-13③ 整跳，
  // 所以今天能走到这里的只有 origin=subagent 的残余路径。按**防御层**保留，
  // 不静默删除——它是上游 hook.ts:150-152 的非主会话类型收窄登记。
  // 具名 reason `subagent-keyword-filtered` **同属这套防御层**：它只在本闸真的滤空
  // hits 时发射，而本闸唯一的残余可达路径是「origin=subagent + descriptor found +
  // mode 不可识别」——`readSessionDescriptor`（filters.ts:155，mode 归一化在 :177）
  // 把非两个字面量的 mode 归一为 `undefined`，于是 `isSubagentIdentityUndecidable`
  // （filters.ts:542）不成立、`isBackgroundSession`（filters.ts:504）也不成立，
  // 才落到这里。`descriptor.js` 今天只产 continuable/one-shot，故生产上这条路
  // 同样走不到；它防的是宿主格式变化，而不是当前形态下的任何行为。
  if (isSubagentSession(facts.sessionOrigin)) {
    hits = hits.filter((hit) => SUBAGENT_ALLOWED_TYPES.includes(hit.type))
    if (hits.length === 0) return { kind: 'skip', reason: 'subagent-keyword-filtered' }
  }
  if (hits.length === 0) return { kind: 'skip', reason: 'no-keyword' }
  // ① 号幂等（消息级，上游 hook.ts:31-36 逐字）：注入正文已在文本里 → 不重复注入。
  // **逐条应用后按 type 去重**：一条 hit 被保留当且仅当存在**某条**候选文本还没带着
  // 它的正文。逐条适用的理由见上——上游逐条消息判定，同一条消息里已带的正文只
  // 压制它自己那次命中，不该连坐同批另一条散文触发的同 type 注入。
  // 局部别名而非在闭包里重读 `hits`：赋值在右侧求值完之后才发生，读 `hits` 虽然
  // 结果相同，但下一个编辑者很容易把它误读成「边遍历边改」。
  const surviving = hits
  const keptTypes = new Set<KeywordType>()
  // ⚠️ **这次 `suppressComboStandalones` 可证为 no-op（PR #10 复审 n-7a）**，按
  // ⑥b 段的纪律**保留为防御层**，不静默删除。两句证明 + 一句保留理由：
  //   (1) 它只**删**独立类型、不新增（detector.ts:128-131），故后置条件「组合命中
  //       在场 ⟹ ultrawork/hyperplan 独立命中不在场」幂等成立；① 段的逐条过滤与
  //       按 type 去重同样只删不增，造不出「独立类型与组合并存」的集合。第一次调用
  //       （上方）已建立该后置条件，⑥b 也只删不加，故本次输入必满足后置条件、
  //       输出恒等于输入。
  //   (2) 仍保留：第一处是**可被未来编辑改动**的（换顺序、删掉、或让 ⑥b 之后新增
  //       命中），而「合并后再抑制」是上游 hook.ts:157-161 的不变量本身。在这里再
  //       钉一遍，比赌上一个编辑者记得回头改更便宜。
  hits = suppressComboStandalones(
    cleanTexts
      .flatMap((text) => filterAlreadyInjectedKeywords(surviving, text))
      .filter((hit) => {
        if (keptTypes.has(hit.type)) return false
        keptTypes.add(hit.type)
        return true
      }),
  )
  if (hits.length === 0) return { kind: 'skip', reason: 'already-injected-message' }

  return {
    kind: 'inject',
    types: hits.map((hit) => hit.type),
    text: `${hits.map((hit) => hit.message).join('\n\n')}\n\n${INJECTION_SEPARATOR}\n`,
    agentName,
  }
}

// ── listener ───────────────────────────────────────────────────────────────

/** listener 的依赖（全部可替换，便于单测与降级）。 */
export interface KeywordDetectorDeps {
  readonly texts: InstructionTexts | undefined
  readonly config: KeywordDetectorConfig
  readonly log: (line: string) => void
  /** 读 `payload.agent`；默认取 `payload.agent`（与 ulw-execute 同名函数同构）。 */
  readonly readAgent?: (payload: unknown) => PreStepAgentLike | undefined
}

type PreStepNextLike = () => unknown
type PreStepListener = (payload: unknown, next: unknown) => unknown

/**
 * 构造 `agent/pre-step` listener。唯一的闭包状态是 **descriptor 缓存**
 * （`WeakMap`，随 fiber 回收 = 纪律⑤）。
 *
 * 永远 `return next()`（waterfall 合同）；效果是 `agent.inject(...)` 的副作用。
 * 与 ulw-execute.ts 同纪律：`next()` 结构性地位于 try **之外**（F-1），本
 * listener 自己的逻辑收在零 `next()` 调用的 `runKeywordDetectorStep` 里。
 */
export function createKeywordDetectorListener(deps: KeywordDetectorDeps): PreStepListener {
  // MINOR-5：**descriptor 缓存**。pre-step 每**步**触发一次（H-32 实测单会话 268
  // 步），而 `ownEvents()` 每次都返回全事件副本（slice + freeze），身份面却
  // 一次会话内不变——每步重造是纯浪费。先例 prometheus-md-only / ulw-execute
  // identity。键 = 会话对象；**非对象**键不进缓存。
  //
  // ⚠️ **两条约束（S-13 ②）**：
  //   * **只缓存 `found: true`**。`found:false` 在 one-shot 子会话的首个 pre-step
  //     上是**正常状态**（descriptor 还没 append，in-process-driver:139-149），
  //     缓存它 = 把时序窗永久化 = 缓存毒化（本评审 A-2 的原缺陷）。
  //   * **主会话根本不进这里**：调用方先读 `session.header.origin`，非 subagent
  //     的会话压根不扫 descriptor。所以 MINOR-5 担心的性能回退不存在——主会话的
  //     268 步**零次** `ownEvents()` 全副本调用（旧实现是每步一次）。
  const descriptorCache = new WeakMap<object, SessionDescriptor>()
  const readDescriptorCached = (session: unknown): SessionDescriptor => {
    if (!isObject(session)) return readSessionDescriptor(session)
    const cached = descriptorCache.get(session)
    if (cached !== undefined) return cached
    const descriptor = readSessionDescriptor(session)
    if (descriptor.found) descriptorCache.set(session, descriptor)
    return descriptor
  }
  return async (payload, next) => {
    const delegate = next as PreStepNextLike
    try {
      runKeywordDetectorStep(deps, payload, readDescriptorCached)
    } catch (err) {
      logSafely(deps, formatKeywordDetectorFailureLine('listener failed', err))
      return await delegate()
    }
    return await delegate()
  }
}

function logSafely(deps: KeywordDetectorDeps, line: string): void {
  try {
    deps.log(line)
  } catch {
    // 诊断不值得一次 step 失败。
  }
}

/** listener 自有逻辑：零 `next()` 调用（见上方 F-1 注记）。 */
function runKeywordDetectorStep(
  deps: KeywordDetectorDeps,
  payload: unknown,
  readDescriptorCached: (session: unknown) => SessionDescriptor,
): void {
  const agent = (deps.readAgent ?? readPreStepAgent)(payload)
  // 载荷没有 agent —— 与 ① 号同为"绝大多数 pre-step 之前就没有可判别对象"的
  // 常态，不记日志。`KeywordSkipReason` 因此不含 `no-agent`：该分支根本不进
  // 判定函数，一个永远不产生的 reason 就是一条永远没人核对的分支。
  if (agent === undefined) return
  const session = isObject(agent.session) ? agent.session : undefined
  // S-13 ②：子会话判定走无时序窗的 header.origin；descriptor 只在子会话上读。
  const sessionOrigin = readSessionOrigin(session)
  const descriptor = sessionOrigin === 'subagent' ? readDescriptorCached(session) : NO_DESCRIPTOR
  if (deps.texts === undefined) {
    // 降级态：无 vendor 正文时一条日志都不打（registrar 已在 apply 期打过
    // 具名 NOTE），每步再打一次只会刷屏。
    return
  }
  const current = readCurrentUserTextsDetail(payload)
  const decision = decideKeywordInjection(
    {
      hasInject: typeof agent.inject === 'function',
      texts: deps.texts,
      promptTexts: current.texts,
      commandExpansionSkipped: current.commandExpansionSkipped,
      sessionOrigin,
      descriptor,
      config: deps.config,
    },
  )
  if (decision.kind === 'skip') {
    // MINOR-7：只有 ① 号（`synthetic-internal`，绝大多数 pre-step 的常态）不记日志。
    // `command-expansion` **要记**——它意味着命令面与关键词面发生过一次交互，是本
    // 文件里最该留下痕迹的一条。
    if (decision.reason !== 'synthetic-internal') {
      // ① 号是绝大多数 pre-step 的常态（无用户文本），不记日志。
      logSafely(deps, formatKeywordDetectorLine(`skipped: ${decision.reason}`))
    }
    return
  }
  // ⚠️ 这里刻意**不写** `if (agent.inject === undefined) return`：`hasInject` 事实是
  // `inject` 判定的**充要前置**，所以那条守卫不可达——而不可达的守卫意味着
  // "判定通过但没有注入面"这条路径永远无人核对，正是本次评审 MINOR-4 点名的
  // 坏味道。`?.` 仅用于类型收窄：若将来判定条件放宽到不依赖 `hasInject`，
  // 这里会静默吞掉一次注入（最坏的组合：日志也不打），届时单测 `an agent
  // without an inject surface skips with a named reason` 里的两条无-inject
  // 载荷必须重新审视（它们今天都走 no-inject-surface）。
  agent.inject?.(buildInjectionMessage(decision.text))
  logSafely(
    deps,
    formatKeywordDetectorLine(
      `injected [${decision.types.join(', ')}] into `
      + `${sanitizeDiagnosticLabel(descriptor.label) ?? 'main session'} `
      + `(${decision.text.length} chars)`,
    ),
  )
}

/**
 * 诊断行里的会话标签：**剥掉控制字符**再拼进 `console.warn`（PR #10 评审 A-8）。
 *
 * 为什么必须：`descriptor.label` 的来源是委派方的 `args.description`
 * （`dsh-tool-subagent` 的工具入参）——**调用方可控的散文**，模型/用户都能写。
 * 未清洗时它可以把 `\n`、`\r`、`\x1b` 带进诊断流：伪造整行日志（下游 grep 锚
 * `[omo-hooks] keyword-detector:` 会被骗）、把光标移到行首覆盖既有输出、用 CSI
 * 序列改终端颜色。评审已逐条排除其他注入面——**label 只有一个日志面**：注入正文
 * 走 `agent.inject()` 的结构化载荷，不经字符串拼接。
 *
 * ⚠️ **相邻的另一处未转义插值，如实登记而不是一并声称清白**（复审 n-8）：
 * `formatKeywordDetectorFailureLine`（:416-419）把 `err.message`（非 Error 时是
 * `String(err)`）原样拼进行内。它**不是 label**，控制面低得多——唯一调用点是
 * listener 的 catch（:689-690），err 由本 listener 自己抛出、不是调用方散文；但它
 * 仍可能经宿主实现（`agent.inject()` 之类抛出的 message）间接带上载荷文本。故本
 * 注释只声称「label 的日志面唯一」，**不**声称「诊断流全干净」；要收口的话下一处
 * 就是那一行（清洗可复用本函数的同一套正则），不是本处。
 *
 * 做法：删掉 C0 控制区（`U+0000–U+001F`）与 DEL（`U+007F`），并把 C1 的 CSI
 * 序列起点 `U+009B` 换成一个可见的中点——只删 C0 会漏掉 8-bit 转义（`\x9b` 是
 * CSI 的等价写法）。普通散文（含中文、空格、连字符）一个字符都不动。
 *
 * 可读性：清洗后为空（整条 label 都是控制字符）返回 `undefined`，调用方据此打
 * 主会话那个兜底标签，而不是打出一行 `[omo-hooks] keyword-detector: injected []`
 * 后面跟一串不可见字符。
 */
export function sanitizeDiagnosticLabel(label: string | undefined): string | undefined {
  if (label === undefined) return undefined
  // eslint-disable-next-line no-control-regex -- 清洗对象**就是**控制字符。
  const cleaned = label.replace(/[\u0000-\u001f\u007f\u009b]/g, (ch) => (
    ch === '\u009b' ? '·' : ''
  ))
  return cleaned.trim().length === 0 ? undefined : cleaned
}

function readPreStepAgent(payload: unknown): PreStepAgentLike | undefined {
  if (!isObject(payload)) return undefined
  const agent = payload.agent
  return isObject(agent) ? (agent as PreStepAgentLike) : undefined
}

// ── 注册 ────────────────────────────────────────────────────────────────────

/**
 * 本 registrar。上游 25 文件 → 1 个 pre-step listener + 1 次 apply 期的
 * vendor 正文加载。
 *
 * `entry.event`（manifest 的 PRIMARY event = `agent/pre-step`）是唯一事件来源；
 * 本文件不写第二个事件字面量（纪律④）。
 */
export const registerKeywordDetector: HookRegistrar = (
  ctx: HooksRegistrationContext,
  entry: HookManifestEntry,
) => {
  const config = resolveConfig(readConfigOverride(ctx))
  const loaded = loadInstructionTexts()
  let texts: InstructionTexts | undefined
  if (loaded.ok) {
    texts = loaded.texts
    console.log(formatKeywordDetectorLine(`instruction texts loaded: ${describeInstructionTexts(texts)}`))
  } else {
    for (const failure of loaded.failures) {
      console.warn(formatKeywordDetectorDegradedLine(
        `${failure.kind} vendor text ${failure.path}`
        + ('error' in failure ? ` (${failure.error})` : '')
        + ' — no keyword will be injected, and no substitute text is ever used',
      ))
    }
  }

  const listener = createKeywordDetectorListener({
    texts,
    config,
    log: (line) => console.warn(line),
  })
  ctx.on(entry.event, (payload: unknown, next: unknown) => listener(payload, next))
}

/**
 * 配置覆盖读面。**导出**是为了让它可单测——一个不导出、也没有其他可达路径的
 * 配置读面就是死代码，而死代码比没有配置更糟（它看起来在工作）。
 * `ctx.config?.keywordDetector`（若宿主提供了）覆盖默认值；
 * 上游两个字段都是 optional 无默认，本移植默认即"全启用、无 allowlist"。
 * 读面缺席（当前 DSH 组合不向插件暴露 config 服务）不是错误：默认生效。
 */
export function readConfigOverride(
  ctx: HooksRegistrationContext,
): Partial<KeywordDetectorConfig> | undefined {
  // ⚠️ **`ctx.get('config')`, never `ctx.config`.** The cordis ctx is a Proxy that
  // THROWS on an undeclared property access — `ctx.config` on a context with no
  // injected `config` service raises `cannot get property "config" without
  // inject`. P4-T13's e2e caught exactly that: the whole hook failed to register
  // (`[omo-hooks] hook keyword-detector FAILED: Error: cannot get property
  // "config" without inject`) and every keyword assertion was vacuously red.
  // The optional-chaining `?.` did NOT help — the throw happens on the property
  // GET, before the chain applies. `ctx.get(name)` is the sanctioned optional
  // read (same idiom as ulw-execute's `ctx.get('jobs')`, which has the same
  // "the service is usually absent at apply() time" property).
  const service = readOptionalService(ctx, 'config')
  const raw = isObject(service) ? (service as { keywordDetector?: unknown }).keywordDetector : undefined
  if (!isObject(raw)) return undefined
  const disabled = raw.disabledKeywords ?? raw.disabled_keywords
  const enabled = raw.enabledExpansions ?? raw.enabled_expansions
  return {
    ...(Array.isArray(disabled) ? { disabledKeywords: disabled as KeywordType[] } : {}),
    ...(Array.isArray(enabled) ? { enabledExpansions: enabled as KeywordType[] } : {}),
  }
}

/**
 * `ctx.get(name)` narrowed to a readable value, and **inert on a throwing ctx**.
 *
 * Two independent reasons for the try/catch, both learned the hard way:
 *   * the ctx proxy throws for an undeclared property, and a future cordis could
 *     throw from `get()` itself — either way a *config read* must not be able to
 *     take hook registration down with it;
 *   * S-10's whole premise is "a bad config degrades to the default, it does not
 *     fail the step". A config read that throws would break that premise at
 *     apply() time, long before any step runs.
 */
function readOptionalService(ctx: unknown, name: string): unknown {
  if (!isObject(ctx)) return undefined
  const get = (ctx as { get?: unknown }).get
  if (typeof get !== 'function') return undefined
  try {
    return (get as (service: string) => unknown).call(ctx, name)
  } catch {
    return undefined
  }
}
