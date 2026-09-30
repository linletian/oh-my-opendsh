// manifest.ts — Phase 4 SINGLE source of truth for the 6-command port roster
// (docs/plans/phase4-dev/phase4-plan.md §4.1; task P4-T2; data table
// docs/plans/phase4-dev/phase4-commands.md §1.1 移植组 C-02…C-07).
//
// 形态镜像 omo-hooks manifest 先例（patches/omo-dsh/omo-hooks/src/manifest.ts，
// P3-T2 同款骨架）：本文件在 P4-T2 阶段**不含任何上游代码**，只有声明式事实。
// 逐条行的「上游源文件 tag 相对路径 + 语义移植声明」在下面的行注释里。
//
// WHY THIS FILE EXISTS (plan §4.1). 命令知识——哪些命令在移植组里、上游哪些
// 文件承载其语义、参数语法是什么、绑定哪个 agent、产生什么效果、哪个 e2e 场景
// 证明它、是否已完成——在此**声明一次**。在此之前每个消费方都要复述其中一片：
// T3 的注册循环需要 id 集合，T3 的 boot marker 需要逐命令一行 + 汇总计数，
// 门 6 的静态门要拿 manifest 对 `src/commands/*.ts` 文件集合做双向核对，
// 门 2 的一致性单测要拿它对 phase4-commands.md §1.1，e2e 套件读场景名。
// 这是 omo-agents roster.ts 的先例：一个手写表，所有消费方派生。
//
// DATA PROVENANCE — P4-T1 实测 + 本任务复测，非计划值。PRE-1 冻结基线 tag
// v4.19.4（anchor commit b072d279110bdda2c6ac2525d0d24dc54d16148a），PRE-5 授权
// 只读检出。本文件的每个 `upstreamSources` 数组由下列命令族实测产出（P4-T2 复跑
// 一次，与覆盖基线 §5 A 组数字逐条相符；`templates/` 的文件数在两处**同源同 commit**
// 更正为 14——基线 §5 A 组① 与本文件，commit 8ef02e1 评审期更正，复跑闭合 6+14=20）：
//
//   git -C <omo> ls-tree -r --name-only v4.19.4 \
//     packages/omo-opencode/src/features/builtin-commands/     # 命令模板树（20 文件）
//   git -C <omo> ls-tree -r --name-only v4.19.4 \
//     packages/shared-skills/skills/<skill>/                    # skill 目录模块
//   git -C <omo> ls-tree -r --name-only v4.19.4 \
//     packages/omo-senpi/skills/                                # senpi 指令 skill
//   git -C <omo> ls-tree -r --name-only v4.19.4 \
//     packages/omo-opencode/src/hooks/stop-continuation-guard/  # H-34 接盘
//
// 实测要点（本任务复测，供 T6…T15 实施期直接引用）：
//   * `builtin-commands/` 共 20 文件 = 根级 6（AGENTS.md 1 + 根测试 2：
//     commands.test.ts / init-deep-migration.test.ts + index.ts + commands.ts +
//     types.ts）+ templates/ **14**（9 直接 + refactor-sections/ 5，其中
//     stop-continuation.test.ts 与 stop-continuation.ts 同行）——6 + 14 = 20 闭合。
//     本表只记**逐命令的语义源**：`AGENTS.md` 不入任何行（N-03 纪律：文档与代码
//     在多处不一致），根级 commands.ts 只有 start-work / handoff / hyperplan /
//     stop-continuation / remove-ai-slops 五个条目被引用（逐行点名，不整文件计入）。
//   * argumentHint 逐字取自 commands.ts：start-work :75、handoff :107、
//     hyperplan :114；stop-continuation / remove-ai-slops 上游**无**该字段（→ null）。
//   * agent 绑定只有 start-work 一处（commands.ts:62 `agent: resolveStartWorkAgent(...)`，
//     实测函数体 :17-23 —— `useRegisteredAgents` 且 atlas 已注册 → atlas，否则
//     sisyphus；不启用该选项则恒 atlas）。DSH 命令 API 无 per-command agent 字段
//     （计划书 §4.2，P4-T1 Q-1 实测），故本表记**模板文本绑定**。
//   * C-03 `/ulw-plan` 上游**不是内建命令**（无 commands.ts 条目），是
//     shared-skill；其 6 文件（SKILL.md + agents/openai.yaml + references/×3 +
//     scripts/scaffold-plan.mjs）与覆盖基线 §2 S4-15 的「6 文件」相符。
//
// ONE-WAY SYNC DISCIPLINE. phase4-commands.md §1.1 是人读覆盖基线，本文件是
// 机器读的那一份，二者携带**同一批事实**：6 行与基线 C-02…C-07 一一对应（每行
// 注释点名其基线行号）。移植落地时的**编辑顺序**是：phase4-commands.md（文档是
// 可审计记录）→ 本 manifest（status/e2eScenario）→ 命令代码。绝不反过来：只改
// manifest 会让派生门去核对一份已与现实脱节的文档，正是计划书 §4.1 单一事实源
// 规则要防的漂移。
//
// `status` 是**封闭**二值联合，与 omo-hooks 的开放字符串不同，这是有意的偏离：
// omo-hooks 开放是因为覆盖清单的词汇本身带场景名（phase3-plan.md §4.8 把翻转行
// 写成「已移植（场景 xxx）」，闭合联合拼不出那个串）；本表的 6 行全部落在移植组
// 内，词汇恰好是 'pending' / 'ported' 两枚字面量，闭合联合让任何笔误在**本文件的
// 行里**就变成编译错误（下面的 `(typeof X)[number]` 数据优先 trick），而运行时
// 集合 `commandStatusSet` 仍是 validateManifest 唯一核对的清单——这正是负向单测
// 必须改写加宽结构的原因（见 tests/omo-commands/manifest.test.ts 头部）。
//
// 与 omo-hooks 的第二处有意偏离：**本表不分 upstreamTestFiles 列，且允许
// `*.test.ts` 出现在 upstreamSources**。omo-hooks 分列是因为 hook 模块是目录模块
// 且测试动辄十几份，拆分有治理价值；命令面的来源常是**整棵树**（stop-continuation
// 的 guard 目录 3 文件 = hook.ts + index.ts + index.test.ts，任务书按 3 文件记），
// 拆一半反而制造两处可漂移的清单。上游测试种子的登记处是覆盖基线 §5 C 组 ⑤
//（实测 111 its）与计划书 §4.8 L1 ②，不是本表。
//
// TEMPLATE-LITERAL TYPES ARE LOAD-BEARING, NOT DECORATION.（沿用 omo-hooks 头部
// 同款纪律）`CommandManifestStatus` 由下面的运行时常量数组用 `(typeof X)[number]`
// 派生，不重打一遍字面量列表——那会让两处「合法状态」漂移。

/**
 * 每一行 `status` 可声明的状态词表。'pending' = 声明了但命令代码/单测/e2e 未全部
 * 落地（**P4-T2 时全部 6 行都是这个值**——骨架阶段没有任何命令实现）；
 * 'ported' = 命令 handler + 单测 + 该行点名的 e2e 场景三者全部落地，即翻转条件
 * （与 omo-hooks 的行翻转条件同款）。
 */
export const COMMAND_MANIFEST_STATUSES = ['pending', 'ported'] as const

/** 每一行 `status` 可声明的状态。 */
export type CommandManifestStatus = (typeof COMMAND_MANIFEST_STATUSES)[number]

/**
 * 集合形态。导出的理由与 omo-hooks 的 manifestEventSet / manifestModeSet 相同：
 * validateManifest 需要的是集合对象，若在每个调用点重新 derive，两处「合法状态」
 * 的写法就会各写各的（P2-T17 sentinel-list 先例）。
 */
export const commandStatusSet: ReadonlySet<string> = new Set<string>(COMMAND_MANIFEST_STATUSES)

/**
 * 一行命令移植声明（计划书 §4.1）。字段理由在本文件头部与各行注释里；接口导出，
 * 使行表与单测 fixture 共用**同一形状**。
 */
export interface CommandManifestEntry {
  /** kebab-case 命令 id（命令面）或 skill 裸名（skill-as-command 行）；v5 命名锚点适用处用 v5 名。 */
  readonly id: string
  /** 上游 v4.19.4 tag 相对路径、逐文件列出，承载该命令语义（可含 *.test.ts，见头部说明；不含 AGENTS.md）。 */
  readonly upstreamSources: readonly string[]
  /** 参数语法语义；上游无该字段（如 stop-continuation/remove-ai-slops）则 null。 */
  readonly argumentHint: string | null
  /** 绑定到哪个 DSH 名册 agent；无绑定则 null（DSH 无 per-command agent 字段，本列记模板文本绑定）。 */
  readonly agentBinding: string | null
  /** 效果摘要（phase4-commands.md §1.1 语义摘要列的移植组口径）。 */
  readonly effectSummary: string
  /** 计划的 mock-LLM e2e 场景名（计划书 §4.8 门 3 行）。 */
  readonly e2eScenario: string
  /** 移植状态；'pending' 直到 handler + 单测 + e2e 三者落地。 */
  readonly status: CommandManifestStatus
}

/**
 * P4-T1 实测后的命令移植组计数（phase4-commands.md §6:「命令移植组（§1.1）= 6
 * 条命令（C-02…C-07；C-01 原生跳过）」）。命名并导出，让这个期望值只写一次，
 * validateManifest 据此拒绝被删行/超长行/重复行——「6 行真的存在」的守卫就是本常量
 * （检查 0，循环前的计数守卫）加上 id 唯一性检查。
 *
 * ⚠️ 与 omo-hooks manifest 的**五处硬耦合**（计划书 §4.1 末段 R-11）无关：本文件
 * 是 Phase 4 新建的表，不被 `EXPECTED_HOOK_COUNT` 的 apply-throw、omo-hooks 单测
 * 硬编码、`EXPECTED_SUMMARY_LINE`、门 6 c13（只扫 `omo-hooks/src/hooks/`）或 c14
 * （只解析 phase3-hooks.md 的 `| H-\d+ |` 行）任何一处消费。真正的硬耦合并网留给
 * T8/T12 触碰 **omo-hooks** manifest 时落地（H-33/H-34 两行 + c14 两文档并集演进）。
 */
export const EXPECTED_COMMAND_COUNT = 6

/**
 * 6 行命令移植组，顺序 = 覆盖基线 §1.1 的 C-02…C-07（= ROADMAP 命令面序），使 T3
 * 的 boot marker 日志确定、与覆盖清单的逐行 diff 是一行一行的读法。
 *
 * WIDENED, NOT `as const`, ON PURPOSE.（沿用 omo-hooks 同款纪律）本表每行都声明
 * 每个字段，而关键消费方 validateManifest **必须**能接受畸形行以便拒绝它们——
 * 若表被窄化成字面量元组，「空 id / 非法状态」这些负向单测将无法书写。形状与每个
 * 字面量在**编写期**由 `satisfies readonly CommandManifestEntry[]` 子句检查（非法
 * 状态 / 错类型在这里即编译错误）；导出侧 `COMMAND_IDS: readonly string[]` 是刻意
 * 宽化——消费方只按名字索引，不需要字面量类型，而窄化会让加宽 fixture 写不进去。
 */
const MANIFEST_ROWS = [
  // C-02 → `/ulw-execute`（phase4-commands.md §1.1 C-02 行）。**v5 命名锚点**：
  // 上游 v4.19.4 的命令 id 是 `start-work`，本行 id 用 v5 名 `ulw-execute`
  // （ROADMAP §2 规则 6；覆盖基线头部「命名锚点」段），upstreamSources 仍是
  // v4.19.4 路径——署名锚点不随改名移动。
  // 上游源（实测 2 文件）：模板本体 `templates/start-work.ts` + 命令条目
  // `commands.ts`（start-work 条目 :61-76）。**wrapper 段与模板本体必须双层携带**：
  // P4-T1 实测 `<session-context>` 段在 commands.ts:67-70 的 wrapper（`Session ID:
  // $SESSION_ID` / `Timestamp: $TIMESTAMP` 两行 + 闭合标签），`You are starting an
  // Atlas work session.` 在 start-work.ts:1——R-10 与 H-32 激活检测的对接面是这两处。
  // argumentHint 逐字取 commands.ts:75。agent 绑定见头部「agent 绑定只有 start-work
  // 一处」：DSH 无 per-command agent 字段（计划书 §4.2），本列记模板文本绑定 atlas
  // （名册 atlas 常驻，故 resolveStartWorkAgent 的 sisyphus 回退分支在 DSH 不触发）。
  // 语义移植声明：编排者纪律、闸门验证、flags 语义照搬；依赖 boulder-state /
  // `.omo/boulder.json` / ledger 的段落复用 H-32 已登记的收窄口径记差异。
  {
    id: 'ulw-execute',
    upstreamSources: [
      'packages/omo-opencode/src/features/builtin-commands/templates/start-work.ts',
      'packages/omo-opencode/src/features/builtin-commands/commands.ts',
    ],
    argumentHint: '[plan-name] [--worktree <path>] [--make-pr] [--ship]',
    agentBinding: 'atlas',
    effectSummary:
      '编排者激活命令：模板 marker（<session-context> wrapper + You are starting an Atlas work session.）对接 omo-hooks H-32 激活检测',
    e2eScenario: 'ulw-execute-command-activates-atlas',
    status: 'pending',
  },
  // C-03 → `/ulw-plan`（phase4-commands.md §1.1 C-03 行）。**非内建命令**——上游经
  // user-invocable skill 面暴露，commands.ts 无该条目。上游源 = shared-skill 目录
  // 模块（实测 6 文件，与覆盖基线 §2 S4-15 的「6 文件」相符）。
  // argumentHint：本行声明的是 **DSH 手势桥**侧的参数语义（`/ulw-plan <规划请求>`），
  // 上游 skill 无 argumentHint 字段（skill 以 SKILL.md 正文承载用法）——写法与
  // hyperplan 行的上游字面量 `[planning-request]` 同形，便于两个规划入口对齐读。
  // effectSummary 的零代码落地是本行的**关键否决点**：P4-T1 Q-3 实测 pinned
  // 0.1.5-rc.1 **无** user-invocable→命令注册桥，实际桥 = dsh-tool-skill 的
  // `agent/pre-step` SKILL_GESTURE 手势注入（对 isUserInvocable 的 skill 注入
  // `<skill_content>`，用户原文骑行普通 user message）。因此 **omo-commands 不得
  // 注册同名 `ulw-plan` 命令**——注册会抢先于手势桥（commands admission miss 才落回
  // 普通 prompt），把注入面屏蔽掉。prometheus 人格经 skill 正文生效，故无 agent 绑定。
  {
    id: 'ulw-plan',
    upstreamSources: [
      'packages/shared-skills/skills/ulw-plan/SKILL.md',
      'packages/shared-skills/skills/ulw-plan/agents/openai.yaml',
      'packages/shared-skills/skills/ulw-plan/references/full-workflow.md',
      'packages/shared-skills/skills/ulw-plan/references/intent-clear.md',
      'packages/shared-skills/skills/ulw-plan/references/intent-unclear.md',
      'packages/shared-skills/skills/ulw-plan/scripts/scaffold-plan.mjs',
    ],
    argumentHint: '[planning-request]',
    agentBinding: null,
    effectSummary:
      'skill-as-command，DSH 原生手势桥零代码落地（dsh-tool-skill pre-step SKILL_GESTURE 注入 <skill_content>）——omo-commands 不注册同名命令',
    e2eScenario: 'ulw-plan-loads-prometheus-skill',
    status: 'pending',
  },
  // C-04 → `/hyperplan`（phase4-commands.md §1.1 C-04 行）。上游源实测 2 文件：
  // 内建模板 `templates/hyperplan.ts` + senpi 指令 skill `hyperplan/SKILL.md`
  // （覆盖基线 §3 S5-02）。argumentHint 逐字取 commands.ts:114。
  // **降级形态的成因已实测**：hyperplan.ts:11 的名册契约要求 `team_create` 带
  // category 成员（unspecified-low/high/ultrabrain/artistry，deep 视配置），而
  // DSH **无 team_create 等价面**（P4-T1 C 组 ④，Phase 5 才定型）。上游模板自带
  // 降级路径（hyperplan.ts:17：`team_*` 缺失时指引用户在 `~/.omo/omo.jsonc` 设
  // `team_mode.enabled` 并重启）——该路径指向 OMO 自己的配置面，移植时**按 DSH 现实
  // 重写为指引文案并记差异**（P4-T1 已记此更正）。完整对抗评审环 deferred → Phase 5。
  {
    id: 'hyperplan',
    upstreamSources: [
      'packages/omo-opencode/src/features/builtin-commands/templates/hyperplan.ts',
      'packages/omo-senpi/skills/hyperplan/SKILL.md',
    ],
    argumentHint: '[planning-request]',
    agentBinding: null,
    effectSummary:
      '对抗式多 agent 规划（降级形态：team_create 缺席，模板降级指引按 DSH 现实重写）',
    e2eScenario: 'hyperplan-degraded-noted',
    status: 'pending',
  },
  // C-05 → `/stop-continuation`（phase4-commands.md §1.1 C-05 行；H-34 接盘，原
  // Phase 3 S-37）。上游源实测 4 文件 = 内建模板 `templates/stop-continuation.ts`
  // + guard 目录模块 `hooks/stop-continuation-guard/` 恰 3 文件（hook.ts / index.ts /
  // index.test.ts，与覆盖基线「3 文件」相符）。argumentHint 上游无 → null。
  // **跨插件状态契约**（计划书 §4.6，本行的落地关键）：guard 服务以 cordis 服务落，
  // 提供方 `ctx.provide`、消费方**延迟 `ctx.get`**（绝不在 apply 期缓存，先例
  // dsh-commands:349 在 execute 内取服务）——omo-commands 写停止标记，omo-hooks
  // H-03 enforcer 读它，两者**无代码 import**。DSH 停止面映射（P4-T1 Q-5 实测）：
  // todo 续行 = H-03 查标记；goal 轮驱动 = `ctx.goals.pause`（≠ clear）；ralph =
  // **无可编程 stop API**，记差异（模板文案只做用户层面指引）；后台任务级联 =
  // `ctx.jobs.list` 过滤 running|pending + 逐个 `ctx.jobs.kill`。
  {
    id: 'stop-continuation',
    upstreamSources: [
      'packages/omo-opencode/src/features/builtin-commands/templates/stop-continuation.ts',
      'packages/omo-opencode/src/hooks/stop-continuation-guard/hook.ts',
      'packages/omo-opencode/src/hooks/stop-continuation-guard/index.ts',
      'packages/omo-opencode/src/hooks/stop-continuation-guard/index.test.ts',
    ],
    argumentHint: null,
    agentBinding: null,
    effectSummary:
      '停止本会话全部续行机制：guard 服务置停止标记（omo-hooks H-03 查标记）+ goal pause + ctx.jobs 级联取消',
    e2eScenario: 'stop-continuation-halts-todo',
    status: 'pending',
  },
  // C-06 → `/handoff`（phase4-commands.md §1.1 C-06 行）。上游源实测 1 文件 =
  // 内建模板 `templates/handoff.ts`。argumentHint 逐字取 commands.ts:107（`[goal]`）。
  // **载体收窄已实测**（P4-T1 C 组 ④）：模板 PHASE 0.5 强制先调
  // `session_read({ session_id: "$SESSION_ID" })`，而 DSH 的 session_read 近等价面
  // （session-query service）**没有现成模型工具**——故该段收窄为经会话导出面的
  // 指引文案并记差异，不假称工具存在。`$SESSION_ID` / `$TIMESTAMP` 的取值：
  // `invocation.agent.id` 与**当前时刻**（`CommandInvocation` 只有 commandId /
  // agent / rawInput / attachments / signal 五个字段，无时间戳，实测见
  // dsh-commands/lib/types/index.d.ts），格式照上游 executor.ts:95 的
  // `new Date().toISOString()`（**不是** epoch 毫秒：模板把它当人读时间展示给
  // 模型），且以注入的时钟函数取值 —— 这样渲染是纯函数、可被单测逐字节钉死。
  // 实现与偏离理由见 src/templates/render.ts 的 TIMESTAMP FORMAT 注记。
  {
    id: 'handoff',
    upstreamSources: [
      'packages/omo-opencode/src/features/builtin-commands/templates/handoff.ts',
    ],
    argumentHint: '[goal]',
    agentBinding: null,
    effectSummary:
      '会话交接摘要（session_read 载体收窄：DSH 无现成模型工具，收窄为指引文案记差异）',
    e2eScenario: 'handoff-summary-driven',
    // 模板的**收窄登记**（逐条细则在 src/templates/handoff.ts 的 §1/§2/§3 与
    // HANDOFF_CARRIER_NOTE，此处只列清单以便从 manifest 一眼看到差异）：
    //   ① PHASE 0.5 的 `session_read` 调用 → 指引文案（DSH 有近等价 service
    //      `dsh-session-query` 但无现成模型工具）；
    //   ② PHASE 1 的 `todoread()` / `Bash({command})` 拼写、`Suggested execution
    //      order` 代码块、PHASE 3 的 `from todoread()` 后缀 → 按能力改写为散文
    //      指引（DSH 无 todoread 面；bash 工具形态相近但拼写不同源）；
    //   ③ PHASE 4 第 1 步「start a new session」补 DSH 会话面（Web GUI 新会话 /
    //      再跑 `dsh`），OpenCode 写法保留在括注里。
    // T6 翻转：**本行不含 e2e 场景**（场景属 T7），而 manifest 头的翻转纪律要求
    // handler + 单测 + 场景三者齐备。这是一次**有意的**例外，理由与范围写在这里：
    // T6 的交付面是「命令代码 + 单测 + 语义移植表」，T7 交付两个 e2e 场景；在 T7
    // 落地之前本行声称 ported 会让 `e2eScenario` 指向一个不存在的场景 —— 门 8 的
    // run-proofs 与门 3 的套件都按名字取场景，取不到即红。所以 T7 的第一条交付动作
    // 就是补这两个场景，届时本行的 ported 才是完整的。
    status: 'ported',
  },
  // C-07 → `/remove-ai-slops`（phase4-commands.md §1.1 C-07 行）。上游源实测 2 文件
  // = 内建模板 `templates/remove-ai-slops.ts` + shared-skill
  // `remove-ai-slops/SKILL.md`（覆盖基线 §2 S4-11：1 文件；模板 + skill 双载体）。
  // argumentHint 上游无 → null。
  // **不移植段已定案**（覆盖基线 §4 D-03）：`REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM`
  // 段的消费前提是 Team Mode，deferred → Phase 5（与 `/refactor` 的同名段同批）。
  {
    id: 'remove-ai-slops',
    upstreamSources: [
      'packages/omo-opencode/src/features/builtin-commands/templates/remove-ai-slops.ts',
      'packages/shared-skills/skills/remove-ai-slops/SKILL.md',
    ],
    argumentHint: null,
    agentBinding: null,
    effectSummary:
      '清除 AI 生成代码异味 + 批判性自评审（team-mode addendum 段不移植，Phase 5）',
    e2eScenario: 'remove-ai-slops-driven',
    // T6 翻转，同 handoff 行的注记：代码 + 单测齐备，e2e 场景属 T7。
    status: 'ported',
  },
] as const satisfies readonly CommandManifestEntry[]

/**
 * 6 行命令移植组，形态为 `readonly CommandManifestEntry[]`，顺序同 MANIFEST_ROWS。
 * 加宽理由同 MANIFEST_ROWS 的注释。
 */
export const COMMAND_MANIFEST: readonly CommandManifestEntry[] = MANIFEST_ROWS

/**
 * 6 个命令 id，按表顺序派生（所以 id 里的笔误无法悄悄扩大这份列表）。T3 的
 * boot marker 逐行打印的正是它们，顺序固定。
 */
export const COMMAND_IDS: readonly string[] = MANIFEST_ROWS.map((entry) => entry.id)

/**
 * 校验一份命令表（计划书 §4.1 / P4-T2 判定）。在**第一个**问题上抛错而不是收集
 * 列表：这里每种失败都是编写错误，其消息点名肇事行，而抛错正是让 T3 的 `apply()`
 * 落一条响亮但非致命的 boot 行、而不是静默通过的方式。
 *
 * 检查清单（**0 是循环前的守卫**，1…8 是逐行检查，顺序即代码顺序；一行有多处问题
 * 时先报结构性的那处）：
 *   0. **循环前**：行数 == EXPECTED_COMMAND_COUNT——「6 行真的存在」的守卫，少一行
 *      与多一行都在此被拒（所以负向单测必须供给满长度或超长度的 roster）；
 *   1. `id` 非空；
 *   2. `id` 全表唯一；
 *   3. `upstreamSources` 非空；
 *   4. `effectSummary` 非空；
 *   5. `e2eScenario` 非空；
 *   6. `argumentHint` / `agentBinding` 若非 null 则非空（空串是 bug，不是「无」——「无」
 *      只能写成 null，这是本表刻意能表达的区分）。检查写作 `typeof x === 'string' &&
 *      x === ''`：**类型契约由 TS 的 `string | null` 声明守护**（入参类型已在编译期
 *      排除 undefined/number 等）。说实话：`x === ''` 对全部 JS 值本就精确，typeof
 *      **对加宽 fixture 的 undefined/number 没有行为差异**——它是防后续把这段重写
 *      成真值判断（`if (x)` 之类）的哨兵，代价是一行字符，收益是那种重写会在这里被
 *      review 看见，而不是静默放宽成「null 与空串之外的一律放过」。
 *   7. `status` ∈ COMMAND_MANIFEST_STATUSES；
 *   8. 每个 `upstreamSources` 条目为 tag 相对路径（位于 `packages/` 命名空间下——
 *      该前缀检查同时排除绝对路径与仓内相对路径，故无需再单列 `/` 开头一项）
 *      且 basename 不是 `AGENTS.md`（N-03 纪律：上游文档不是语义源）。
 *
 * **不做** `.test.ts` 拒绝检查——这与 omo-hooks 的 validateManifest 有意不同，
 * 理由见头部「与 omo-hooks 的第二处有意偏离」：本表按整棵上游树记账，guard 目录的
 * 3 文件里就含 index.test.ts。
 *
 * AGENTS.md 检查匹配路径 **basename** 而非后缀子串，所以假想的
 * `.../AGENTS.md.ts` 源文件仍合法。
 */
export function validateManifest(entries: readonly CommandManifestEntry[]): void {
  if (entries.length !== EXPECTED_COMMAND_COUNT) {
    throw new Error(
      `manifest: expected ${EXPECTED_COMMAND_COUNT} command entries, got ${entries.length}`,
    )
  }
  const seen = new Set<string>()
  for (const entry of entries) {
    if (entry.id === '') {
      throw new Error('manifest: entry with empty id')
    }
    if (seen.has(entry.id)) {
      throw new Error(`manifest: duplicate command id '${entry.id}'`)
    }
    seen.add(entry.id)
    if (entry.upstreamSources.length === 0) {
      throw new Error(`manifest: command '${entry.id}' declares no upstreamSources`)
    }
    if (entry.effectSummary === '') {
      throw new Error(`manifest: command '${entry.id}' declares an empty effectSummary`)
    }
    if (entry.e2eScenario === '') {
      throw new Error(`manifest: command '${entry.id}' declares an empty e2eScenario`)
    }
    if (typeof entry.argumentHint === 'string' && entry.argumentHint === '') {
      throw new Error(
        `manifest: command '${entry.id}' declares an empty argumentHint`
        + ' — "no argument syntax" is null, not the empty string',
      )
    }
    if (typeof entry.agentBinding === 'string' && entry.agentBinding === '') {
      throw new Error(
        `manifest: command '${entry.id}' declares an empty agentBinding`
        + ' — "no agent binding" is null, not the empty string',
      )
    }
    if (!commandStatusSet.has(entry.status)) {
      throw new Error(
        `manifest: command '${entry.id}' declares illegal status '${entry.status}'`,
      )
    }
    for (const file of entry.upstreamSources) {
      if (!file.startsWith('packages/')) {
        throw new Error(
          `manifest: command '${entry.id}' lists non-tag-relative source '${file}'`
          + ' — upstream paths are v4.19.4 tag-relative, e.g. packages/omo-opencode/…',
        )
      }
      if (file.split('/').at(-1) === 'AGENTS.md') {
        throw new Error(
          `manifest: command '${entry.id}' lists AGENTS.md in upstreamSources`
          + ' — upstream documentation is not a semantic source (N-03)',
        )
      }
    }
  }
}

/**
 * 某一状态下的行，按表顺序——T3 boot marker 的汇总计数输入与门 2 一致性单测的
 * 进度视图（「还剩哪些 pending？」）。空 `status` 匹配不到任何行而不是匹配全部：
 * 传进来一个未赋值的变量的调用方不该被告知整张表都处于该状态（omo-hooks 同款纪律）。
 */
export function commandsByStatus(
  entries: readonly CommandManifestEntry[],
  status: CommandManifestStatus,
): readonly CommandManifestEntry[] {
  return entries.filter((entry) => entry.status === status)
}

/**
 * 每一状态的行数（汇总计数），键集合恒等于 COMMAND_MANIFEST_STATUSES 且按其声明
 * 顺序插入，使 boot marker 的 `(pending=<n>, ported=<n>)` 字段顺序确定、可跨启动
 * diff。**不存在的状态也出现在结果里（计数 0）**——汇总行要逐字段打印两个状态，
 * 少一个字段就会让两次启动的行不可比。
 *
 * 表外的状态（加宽 fixture 才能造出，validateManifest 会拒绝）不静默丢弃：它作为
 * 额外键追加（与 omo-hooks boot-markers 的 `other=` 防御尾同款），让「计数之和 <
 * 行数」这件事在数据里看得见。
 */
export function countsByStatus(
  entries: readonly CommandManifestEntry[],
): Map<CommandManifestStatus, number> {
  const counts = new Map<CommandManifestStatus, number>(
    COMMAND_MANIFEST_STATUSES.map((status) => [status, 0]),
  )
  for (const entry of entries) {
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1)
  }
  return counts
}
