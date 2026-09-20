// manifest.ts — Phase 3 SINGLE source of truth for the 14-hook port roster
// (docs/plans/phase3-dev/phase3-plan.md §4.1; task P3-T2; data table
// docs/plans/phase3-dev/phase3-hooks.md §1 移植组).
//
// WHY THIS FILE EXISTS (plan §4.1). The hook knowledge — which upstream module
// is ported, which files carry its semantics, which DSH event it lands on,
// which listener pattern (§4.2 A–F) it is, what effect it produces, which e2e
// scenario proves it, whether it is done yet — is declared ONCE here. Before
// this file every consumer would restate a slice of it: the T3 registration
// loop needs the id+event pairs, the T3 boot marker needs the ids, the T19
// static gate compares the manifest against the real `src/hooks/*.ts` file
// set, T20's coverage-list consistency test compares it against
// phase3-hooks.md §1, and the e2e suite reads the scenario names. This is the
// roster.ts precedent (patches/omo-dsh/omo-agents/src/roster.ts): one authored
// table, every consumer derives.
//
// DATA PROVENANCE — P3-T1 MEASURED, NOT PLANNED. Every `upstreamFiles` and
// `upstreamTestFiles` row below was produced by P3-T1's read-only survey of the
// frozen baseline tag, with the same command family recorded in the task
// book:
//
//   git -C <omo> ls-tree -r --name-only v4.19.4 \
//     packages/omo-opencode/src/hooks/<module>/        # directory modules
//   git -C <omo> ls-tree -r --name-only v4.19.4 \
//     packages/omo-opencode/src/hooks/<module>.ts      # single-file modules
//
// (baseline anchor commit b072d279110bdda2c6ac2525d0d24dc54d16148a; PRE-1).
// `*.test.ts` files go to `upstreamTestFiles` — they are the R-3 unit-test
// seeds — and `AGENTS.md` is excluded from both lists (N-03: that file
// disagrees with the code in several places). Among the 14 port modules exactly
// ONE upstream directory ships an `AGENTS.md`: H-03's
// `todo-continuation-enforcer/` (34 ls-tree entries = 17 实现 + 16 测试 +
// 1 AGENTS.md, so its "33 文件" count already excludes the doc); H-32 (20 files)
// contains none, so no row count in this table needs an AGENTS.md correction.
// Reproduce the audit with
//   git -C <omo> ls-tree -r --name-only v4.19.4 packages/omo-opencode/src/hooks/ \
//     | grep -E 'hooks/[^/]+/AGENTS\.md$'
// → 12 hits repo-wide, H-03 the only one inside the port group.
//
// H-01 REMOVED (P3-T5 / WP-2 开工仲裁, plan revision 2026-09-19). The
// `write-existing-file-guard/` row (H-01, formerly the first P0 row and the
// reason P3-T4 existed) is NOT in this roster: `dsh-fs-observation-policy` is
// mounted in the base composition (dsh-base:257-258) and already implements
// "refuse to overwrite an unread file" plus version CAS staleness detection
// (`FS_STALE_VERSION`, which OMO has no equivalent of — strictly stronger).
// OMO's residue (one-shot tickets, `.omo` exemption, overwrite stripping) has
// no port value. The port group is therefore 14, not 15, and the plan's B-mode
// pilot moved to T16.
//
// ONE-WAY SYNC DISCIPLINE. phase3-hooks.md §1 is the human-readable coverage
// baseline and this file is the machine-readable one; they carry the SAME
// facts. The 14 rows are 1:1 with the coverage baseline's H-02…H-32 port group
// (each row's comment names its baseline line), and the consistency test
// (P3-T20, phase3-plan.md §4.7 L1(③)) asserts the two agree. When a port
// lands, the EDIT ORDER IS: phase3-hooks.md (the doc is the auditable record)
// → this manifest (status/e2eScenario) → the listener code. Never the reverse:
// a manifest edited alone would make the doc-derived gate pass over a doc that
// no longer matches reality, which is exactly the roster drift the plan §4.1
// single-source rule exists to prevent.
//
// MODE/EVENT SEMANTICS. `mode` is the plan §4.2 A–F listener pattern and
// `event` is the DSH registration surface. They are one authored pair, not two
// independent facts: A → agent/pre-step, B → tools/pre-execute, C/D →
// tools/post-execute, E → agent/turn-stopping, F → session/event or
// agent/status. The B+D rows (H-24/H-26, below) are the one place a row covers
// TWO surfaces: the row's `event` is the PRIMARY decision surface (the B half
// on tools/pre-execute), `mode` records the primacy, and `summary` spells the D
// half out. Consuming code must therefore read `summary` when it needs the
// full surface set — this field pair is a label, never a complete event map
// (see hooksByEvent's note).
//
// TEMPLATE-LITERAL TYPES ARE LOAD-BEARING, NOT DECORATION. `HookMode` /
// `HookEvent` are derived from the runtime arrays below with
// `(typeof X)[number]`, the same "data first, type derived" trick as
// roster.ts's `AgentId`. A literal that is not in the array — a typo'd event,
// an accidental mode 'G' — becomes a compile error in this file's rows, before
// any runtime assertion is reached; the runtime sets remain the single list
// validateManifest checks (which is why the NEGATIVE tests mutate a widened
// structural shape instead of these narrowed rows — see the header of
// tests/omo-hooks/manifest.test.ts).
//
// NO SEPARATE TYPES MODULE. The row interface needs `HookEvent`/`HookMode`,
// which are derived from the arrays in THIS file, while the arrays' `satisfies`
// clause needs the interface — mutually referential. Declaring the interface
// after the arrays keeps that a single-file, single-pass dependency; a separate
// `manifest-types.ts` would either re-spell the unions (two lists that can
// drift) or create an import cycle.

/** The six-event DSH face of Phase 3 (plan §4.2 event column, P3-T1 verified). */
export const MANIFEST_EVENTS = [
  'agent/pre-step',
  'tools/pre-execute',
  'tools/post-execute',
  'agent/turn-stopping',
  'session/event',
  'agent/status',
] as const

/** The plan §4.2 A–F listener patterns. */
export const MANIFEST_MODES = ['A', 'B', 'C', 'D', 'E', 'F'] as const

/** Every `event` a manifest row may declare. */
export type HookEvent = (typeof MANIFEST_EVENTS)[number]

/** Every `mode` a manifest row may declare. */
export type HookMode = (typeof MANIFEST_MODES)[number]

/**
 * The set form of MANIFEST_EVENTS, exported because the object form is what
 * `validateManifest` needs and re-deriving it at every call site would let two
 * spellings of "the legal events" drift apart (P2-T17 sentinel-list precedent).
 */
export const manifestEventSet: ReadonlySet<string> = new Set<string>(MANIFEST_EVENTS)

/** The set form of MANIFEST_MODES (see manifestEventSet). */
export const manifestModeSet: ReadonlySet<string> = new Set<string>(MANIFEST_MODES)

/**
 * `status` is an open string on purpose. Rows started flipping at P3-T7: H-02
 * (`bash-file-read-guard`) is now 'ported' because listener + unit test + e2e
 * have ALL landed (its e2e scenario is `bash-read-guard-warned`); the other 13
 * rows are still 'pending'. The edit order is doc-first — phase3-hooks.md
 * already read ✅ 已移植 for H-02 before this row moved — with docs/ out of scope
 * for the port tasks. A closed union could not spell the coverage list's
 * vocabulary: phase3-plan.md §4.8 words a flipped row as 已移植（场景 xxx）, so
 * the coverage-list status embeds the row's e2e scenario name. The T20
 * consistency test pins the actual vocabulary against the coverage list instead.
 */
export type HookManifestStatus = string

/**
 * One row of the port roster (plan §4.1). Field-by-field reasoning lives in
 * this file's header and in each row's comment; the interface is exported so
 * the row table and the test fixtures share ONE shape.
 */
export interface HookManifestEntry {
  /** kebab-case listener module id == `src/hooks/<id>.ts` basename (the v5 naming anchor where it applies). */
  readonly id: string
  /** Upstream tag-relative source files carrying this hook's semantics (no tests, no AGENTS.md). */
  readonly upstreamFiles: readonly string[]
  /** Upstream tag-relative test files — the R-3 unit-test seeds; [] when upstream has none. */
  readonly upstreamTestFiles: readonly string[]
  /** The DSH event the listener registers on (primary decision surface for B+D rows). */
  readonly event: HookEvent
  /** The plan §4.2 A–F listener pattern. */
  readonly mode: HookMode
  /** One-sentence effect summary (phase3-hooks.md §1 语义摘要 column). */
  readonly summary: string
  /** The planned mock-LLM e2e scenario name (phase3-plan.md §4.7 门 3 row). */
  readonly e2eScenario: string
  /** Port state; 'pending' until the listener+unit test+e2e land. */
  readonly status: HookManifestStatus
}

/**
 * The P3-T5 port count (phase3-hooks.md §5: 移植组 = 14 — the P3-T1 "15" minus
 * H-01, which the WP-2 arbitration moved to DSH-native skip). Named and exported
 * so the expectation is stated ONCE and `validateManifest` can reject a dropped
 * or duplicated row without a magic number in the middle of the checks — the
 * "14 rows really exist" guard is this constant (check 5) plus the uniqueness
 * check.
 */
export const EXPECTED_HOOK_COUNT = 14

/**
 * The 14-row port roster, in ROADMAP priority order (P0 文件护栏 → P1 todo/goal
 * 执行器 → P3 会话通知 → P4 其余 → P5 ulw-execute) — the same order as
 * phase3-hooks.md §1, so the T3 boot-marker log is deterministic and the
 * coverage-list diff is a line-by-line read.
 *
 * WIDENED, NOT `as const`, ON PURPOSE. roster.ts exports the narrowed literal
 * tuple because its consumers branch on optional keys; here every row declares
 * every field, and the consumer that matters (validateManifest) MUST accept
 * malformed rows to reject them — a literal-typed array would make the
 * "empty id" / "illegal mode" negative tests unwritable. The shape is still
 * checked at authoring time by the satisfies clause, and the ids are still
 * literal-typed where they are read (`HOOK_IDS` below).
 */
const MANIFEST_ROWS = [
  // H-02 — phase3-hooks.md §1 P0 行（单文件模块）。这是剔除 H-01 后的首行
  // （H-01/`write-existing-file-guard` 经 WP-2 仲裁改判 DSH 原生跳过，见本文件
  // 头部 "H-01 REMOVED" 段）。
  // ⚠️ 上游语义是**劝导非阻断**（`output.message = WARNING_MESSAGE`），而
  // DSH 的 pre-execute 无 advisory 形态（P3-T1 更正，计划书 §4.2 模式 C 行），
  // 故 event 落 tools/post-execute、以 accept+additionalContexts 把 warning
  // 送进下一请求——命令照常执行，这正是上游"不阻断"语义的等价落地。
  {
    id: 'bash-file-read-guard',
    upstreamFiles: ['packages/omo-opencode/src/hooks/bash-file-read-guard.ts'],
    upstreamTestFiles: [],
    event: 'tools/post-execute',
    mode: 'C',
    summary:
      '简单 cat/head/tail 读文件 → 劝导改用 read 工具；命令照执行，warning 经 additionalContexts 进下一请求',
    e2eScenario: 'bash-read-guard-warned',
    // P3-T7: flipped 'pending' → 'ported' on the WP-2 仲裁 ruling that the T6
    // e2e (scenario `bash-read-guard-warned`, landing in tests/e2e/drive.mjs)
    // passed — listener + unit test + e2e have all landed, which is the row-flip
    // condition the status-type comment states. The human-readable half is
    // already AHEAD of this row (phase3-hooks.md §1 H-02 reads ✅ 已移植（场景
    // bash-read-guard-warned，P3-T5 listener + P3-T6 e2e，commit 3e6903d+）), so
    // the doc → manifest edit order holds.
    status: 'ported',
  },
  // H-03 — phase3-hooks.md §1 P1 行。上游 33 文件 = 17 实现 + 16 测试（另
  // AGENTS.md 不计）。模式 E 是 P3-T1 更正后的口径：turn-stopping listener 的
  // **返回值被 driver 丢弃**，续行 = `agent.steer(createUserMessage(...))`
  // 写入 inbox 的副作用（dsh-hooks-claude-code 先例
  // lib/index.js:292-307），不是投票。
  // U-4 实测（P3-T7）：DSH **无 ctx.todo 服务**——`dsh-tool-todo` 是「工具 +
  // session projection」，原生读面 = `ctx.sessionProjections.stateOf(session,
  // 'todos')`（dsh-tool-todo/lib/types/index.d.ts:26-31；返回 TodoItem[] | null
  // | undefined）。R-8 实测（P3-T7）：`dsh-goal-round-driver` 只在「active 且
  // armed 的 goal」存在时续行，触发面是 agent/status(idle)+goal/changed+pre-step
  // 围栏（**不监听 turn-stopping**），且以**开新回合**续行——与「todo 未清 →
  // 同一回合 steer」互补不重叠；本 hook 在有活跃 armed goal 时让位（可选
  // ctx.get('goals')，缺席不报错）。
  {
    id: 'todo-continuation-enforcer',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/abort-detection.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/compaction-guard.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/constants.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/continuation-injection.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/countdown.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/handler.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/idle-event.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/index.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/message-directory.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/non-idle-events.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/pending-question-detection.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/resolve-message-info.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/session-state.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/stagnation-detection.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/todo.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/token-limit-detection.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/types.ts',
    ],
    upstreamTestFiles: [
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/compaction-guard.regression.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/continuation-injection-agent-name.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/continuation-injection-agent-resolution.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/continuation-injection.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/dispose.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/handler.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/idle-event.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/non-idle-events.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/opencode-overload-continuation.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/parent-wake-race.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/pending-question-detection.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/resolve-message-info.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/session-state.regression.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/session-state.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/stagnation-detection.test.ts',
      'packages/omo-opencode/src/hooks/todo-continuation-enforcer/todo-continuation-enforcer.test.ts',
    ],
    event: 'agent/turn-stopping',
    mode: 'E',
    summary:
      'todo 未清且回合将停 → agent.steer 注入续行上下文（副作用非投票），todo 状态源 = ctx.todo；R-8：与 dsh-goal-round-driver 的关系实施期记录',
    e2eScenario: 'todo-continuation-enforced',
    status: 'pending',
  },
  // H-07 — phase3-hooks.md §1 P1 行（原 P0 草案的 task_* 族模块已 §2 S-32 跳过，
  // 本行是与 todo 执行器同批的 D 模式模块）。上游单文件、无测试文件。
  // U-7 实测（P3-T7，前置**通过** → 按原计划实施，不改判跳过）：
  //   * `dsh-subagent` 的 `AssistantOutputFold.collect()` 在子代理既无非空
  //     assistant 消息、也无累积流文本时返回 `undefined`；
  //   * `dsh-tool-subagent` 对前台结果 render 为
  //     `outputValueText(value.output)`（lib/index.js:484-487），空 output 渲染出
  //     **空文本**——无警告、无注释、无诊断。
  //   ⇒ DSH 无原生等价纠正。收窄两点（记入 listener 头部）：非 `completed` 停止
  //     原因已由 `stopReasonError`（lib/index.js:286-296）物化为 isError（故本
  //     listener 跳过 isError 结果）；末句 "not waiting" 在 DSH 同样成立，改为
  //     可执行指令。
  // 委派工具名集合 = roster.ts `DELEGATION_TOOL_NAMES` 的 10 个（手抄 + 漂移
  // 守测，因计划书 §4.1 禁止 omo-agents ↔ omo-hooks 互相 import）外加**钉死
  // 基础组合**实际挂载的 `subagent`/`subagent_fork`（dsh-base/cordis.patch.yml
  // :349-365）——后者是登记在案的超集，见 listener 头部与报告。
  {
    id: 'empty-task-response-detector',
    upstreamFiles: ['packages/omo-opencode/src/hooks/empty-task-response-detector.ts'],
    upstreamTestFiles: [],
    event: 'tools/post-execute',
    mode: 'D',
    summary:
      '空任务响应检测 → 纠正性工具结果（上游原地改写 output.output；DSH 走 accept{content} 替换渲染内容）；U-7 实测无原生覆盖，前置通过',
    e2eScenario: 'empty-task-response-corrected',
    // P3-T14: flipped 'pending' → 'ported' on the arbitration decision that
    // moved H-07's e2e into this task (P3-T9's task book named only the todo
    // scenario; the coverage gap was recorded there and closed here). Listener
    // (P3-T7) + unit test + the `empty-task-response-corrected` scenario in
    // tests/e2e/drive.mjs have all landed, which is the row-flip condition.
    status: 'ported',
  },
  // H-10 — phase3-hooks.md §1 P3 行。这是**文件族**而非目录模块：上游把这 16 个
  // 实现文件平铺在 hooks/ 顶层（ls-tree 实测 21 文件 = 16 实现 + 5 测试），故
  // upstreamFiles 用 `session-notification*.ts` 前缀枚举，而非某个目录。
  // 基线 N-04 的 helper `session-todo-status.ts` 语义并入本模块实施，但它不是
  // session-notification 前缀文件，故不在本行文件表内（记账见覆盖清单 §3）。
  // 后端口径（草案更正 C-3/C-12）：上游 = darwin / linux(notify-send) / win32
  // 三个后端，无 log 后端；Linux 为 CI 可验载体，Windows 不移植（D9）。
  {
    id: 'session-notification',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/session-notification-content.ts',
      'packages/omo-opencode/src/hooks/session-notification-event-properties.ts',
      'packages/omo-opencode/src/hooks/session-notification-formatting.ts',
      'packages/omo-opencode/src/hooks/session-notification-init.ts',
      'packages/omo-opencode/src/hooks/session-notification-linux.ts',
      'packages/omo-opencode/src/hooks/session-notification-log.ts',
      'packages/omo-opencode/src/hooks/session-notification-macos.ts',
      'packages/omo-opencode/src/hooks/session-notification-platform.ts',
      'packages/omo-opencode/src/hooks/session-notification-runner.ts',
      'packages/omo-opencode/src/hooks/session-notification-scheduler.ts',
      'packages/omo-opencode/src/hooks/session-notification-send.ts',
      'packages/omo-opencode/src/hooks/session-notification-sender.ts',
      'packages/omo-opencode/src/hooks/session-notification-sound.ts',
      'packages/omo-opencode/src/hooks/session-notification-utils.ts',
      'packages/omo-opencode/src/hooks/session-notification-windows.ts',
      'packages/omo-opencode/src/hooks/session-notification.ts',
    ],
    upstreamTestFiles: [
      'packages/omo-opencode/src/hooks/session-notification-content.test.ts',
      'packages/omo-opencode/src/hooks/session-notification-desktop-sidecar.test.ts',
      'packages/omo-opencode/src/hooks/session-notification-input-needed.test.ts',
      'packages/omo-opencode/src/hooks/session-notification-sender.test.ts',
      'packages/omo-opencode/src/hooks/session-notification.test.ts',
    ],
    // 主事件面 = session/event（turn/end + reason.kind 判完成/错误）；idle 侧
    // 走 agent/status(status==='idle')。一行只能记一个 event，故记主面，idle
    // 面在 summary 里点名（同 B+D 行的记录纪律）。
    event: 'session/event',
    mode: 'F',
    summary:
      '会话完成/错误的用户通知（turn/end + reason.kind；无 session.idle/session.error 类型——idle = agent/status）；后端 Linux notify-send（CI）/ macOS（L4），Windows 不移植',
    e2eScenario: 'session-notification-log',
    status: 'pending',
  },
  // H-11 — phase3-hooks.md §1 P3 行。前置（U-8 之外的实施期项）：ctx.jobs 事件面
  // 核实（计划书 §6 开放问题，T12）；等价面未定型时按 DoD-d 记录降级。
  {
    id: 'background-notification',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/background-notification/hook.ts',
      'packages/omo-opencode/src/hooks/background-notification/index.ts',
      'packages/omo-opencode/src/hooks/background-notification/types.ts',
    ],
    upstreamTestFiles: [
      'packages/omo-opencode/src/hooks/background-notification/hook.test.ts',
    ],
    event: 'session/event',
    mode: 'F',
    summary:
      '后台任务完成通知；前置：ctx.jobs 事件面核实（T12），无对应面则按 DoD-d 记降级',
    e2eScenario: 'background-notification-log',
    status: 'pending',
  },
  // H-14 — phase3-hooks.md §1 P4 行（批 A 首项：58 行零状态）。前置（T14 实施期
  // 逐字核实，**已闭合**）：DSH edit 工具错误文案 = `old_string and new_string
  // must differ`（dsh-tool-fs:713）/ `old_string was not found in "<path>"`
  // （dsh-fs-local:685）/ `old_string matched <N> times in "<path>"; provide a
  // more specific old_string or set replace_all to true`（dsh-fs-local:686）/
  // `old_string must be a non-empty string`（dsh-tool-fs:712 与 dsh-fs-local:682）。
  // 上游三条串（oldString 词汇）在 DSH 结果里**永不出现**，故错误串表按 DSH 实际
  // 文案重建（上游三条保留为审计参照 UPSTREAM_EDIT_ERROR_PATTERNS）；差异与
  // DSH-only 第 4 条的来由记在 listener 头部 前置①。
  {
    id: 'edit-error-recovery',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/edit-error-recovery/hook.ts',
      'packages/omo-opencode/src/hooks/edit-error-recovery/index.ts',
    ],
    upstreamTestFiles: ['packages/omo-opencode/src/hooks/edit-error-recovery/index.test.ts'],
    event: 'tools/post-execute',
    mode: 'D',
    summary:
      'edit 输出命中错误串表 → 尾部追加回读提醒（58 行零状态）；前置 T14：DSH 文案逐字核实通过，错误串表按 DSH 文案重建',
    e2eScenario: 'edit-error-recovery-reminder',
    // P3-T14: flipped 'pending' → 'ported' (listener + unit test + the
    // `edit-error-recovery-reminder` scenario all landed).
    status: 'ported',
  },
  // H-15 — phase3-hooks.md §1 P4 行（批 A）。含幂等哨兵 + 19 项排除表。
  // 前置（T14 实施期，**已闭合，结论双半**）：① 上游 8 条正则**全部不命中**
  // DSH 自身参数解析失败文案（DSH 的失败文本是 `invalid arguments: "arguments"
  // must be an object`，dsh-agent-loop:541-547 保留非法 JSON 原文 + dsh-tools:449
  // /:812-818 根值类型违例（NIT P3-T15：:449 是 `case "object"` 的非对象分支，
  // :423 是 lossless-object 分支，两者不同串）；全文无 "json" 字样），故 live 表 = 上游 8 条（逐字
  // 保留，provider/MCP 原文仍可能出现）+ 3 条 DSH 原生签名；② 19 项排除表按 DSH
  // 工具名空间重建：13 项映射、6 项无对应剔除（映射表与依据记在 listener 头部）。
  {
    id: 'json-error-recovery',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/json-error-recovery/hook.ts',
      'packages/omo-opencode/src/hooks/json-error-recovery/index.ts',
    ],
    upstreamTestFiles: ['packages/omo-opencode/src/hooks/json-error-recovery/index.test.ts'],
    event: 'tools/post-execute',
    mode: 'D',
    summary:
      '非排除工具输出命中 JSON 错误正则 → 追加提醒（含幂等哨兵 + 19 项排除表）；前置 T14：上游 8 条不命中 DSH 文案，追加 3 条 DSH 原生签名；排除表按 DSH 工具名映射（13 映射 / 6 剔除）',
    e2eScenario: 'json-error-recovery-reminder',
    // P3-T14: flipped 'pending' → 'ported' (listener + unit test + the
    // `json-error-recovery-reminder` scenario all landed).
    status: 'ported',
  },
  // H-16 — phase3-hooks.md §1 P4 行（批 A 末项）。单文件模块，但 hooks/ 顶层
  // 有 1 实现 + 1 测试且测试与实现同行：`tool-output-truncator.ts` +
  // `tool-output-truncator.test.ts`（后者即本行 upstreamTestFiles）。
  // ⚠️ 记账更正（P3-T2 实测）。可重跑证据（<omo> = 上游只读检出，PRE-5）：
  //   git -C <omo> ls-tree -r --name-only v4.19.4 \
  //     packages/omo-opencode/src/hooks/ | grep tool-output-truncator
  //     # → 恰 2 条：tool-output-truncator.ts + tool-output-truncator.test.ts
  //   git -C <omo> show v4.19.4:packages/omo-opencode/src/hooks/tool-output-truncator.ts
  //     # → 唯一 value import = `../shared/dynamic-truncator`
  //   git -C <omo> grep -n 'from "\./' v4.19.4 -- \
  //     packages/omo-opencode/src/shared/dynamic-truncator.ts \
  //     packages/omo-opencode/src/shared/dynamic-truncator-types.ts \
  //     packages/omo-opencode/src/shared/token-limit-truncator.ts \
  //     packages/omo-opencode/src/shared/context-window-usage.ts \
  //     packages/omo-opencode/src/shared/context-limit-resolver.ts \
  //     packages/omo-opencode/src/shared/logger.ts \
  //     packages/omo-opencode/src/shared/normalize-sdk-response.ts \
  //     packages/omo-opencode/src/shared/plugin-identity.ts
  //     # → 逐边核实下面的闭包
  // 覆盖基线 H-16 行写"1 + 4 shared 支撑文件"（§N-01 同），但实测：
  // （a）hooks/ 侧只有 1 个实现文件，其测试亦在 hooks/ 顶层（故登入
  // upstreamTestFiles）；
  // （b）它 value-import 的 dynamic-truncator 一族住在
  // `packages/omo-opencode/src/shared/`，**不在 hooks/**，也不属于
  // hooks/shared/（后者 ls-tree 恰 11 文件，无 truncator）；该族在 shared/ 侧的
  // import 闭包（value + type，不含 `@oh-my-opencode/*` 外部包）共 **8 个文件**：
  //   dynamic-truncator.ts → context-limit-resolver.ts / context-window-usage.ts
  //     / dynamic-truncator-types.ts / token-limit-truncator.ts
  //   context-window-usage.ts → logger.ts / normalize-sdk-response.ts
  //   logger.ts → plugin-identity.ts（经 logger 链到达的第 8 个）
  //   （context-limit-resolver.ts 是 `@oh-my-opencode/model-core` 的纯 re-export
  //   垫片、无自有实现：去掉垫片则是 7 实现 + 1 垫片。）
  // 另有 2 个 shared/ 测试文件（dynamic-truncator.test.ts /
  // dynamic-truncator-behavior.test.ts），不计入实现闭包。全传递闭包若把
  // tool-output-truncator.ts 的 type-only `../config/schema` 子树也算上则是另一
  // 数量级（47 路径），故"支撑文件 = N"依赖口径。本表按任务书的
  // "ls-tree hooks/<模块>" 口径只记 hooks/ 侧 2 文件（1 实现 + 1 测试），
  // shared/ 侧闭包的口径与最终计数以 T14 裁定为准，与覆盖清单修订一并落地。
  // 另注（P3-T14 裁定，闭合上一段的"以 T14 裁定为准"）：本行 upstreamFiles/
  // upstreamTestFiles 维持 "ls-tree hooks/<模块>" 口径 —— 1 实现 + 1 测试；shared/
  // 侧闭包（dynamic-truncator / dynamic-truncator-types /
  // token-limit-truncator / context-window-usage + logger/normalize-sdk-response/
  // context-limit-resolver 垫片/plugin-identity）在 listener 头部逐文件记账，其中
  // context-window-usage 的 191 行 opencode RPC 层**不移植**（DSH 无对应面）。
  // 前置（T14 实施期，**已闭合，结论为正向**）：DSH **有**剩余 token 暴露面 ——
  // `contextPressure` 会话投影的 **client wire view**
  // （dsh-session-projection `snapshot`:185 / impl index.js:142-156，值经
  // viewSchema 校验；token-meter 行在钉死基础组合 dsh-base/cordis.patch.yml:317），
  // 其形状 = dsh-token-meter projection.d.ts:28-46 的
  // {pressureTokens?, projectedTokens?, contextWindow?}，剩余 =
  // contextWindow − (projectedTokens ?? pressureTokens)，session 经
  // `exec.agent.session` 取（dsh-tools types:207-208）。
  // ⚠️ P3-T14 评审 MAJOR-1（本次修订修复）：**不能**用 `stateOf`
  // （types:175 / impl index.js:127-132）——它返回 host state
  // （token-meter contextPressureStateSchema，index.js:397-407：
  // contextWindow?/pressureTokens?/surfaceTokens/sampledSurfaceTokens?/claim?，
  // **无 projectedTokens**）；projectedTokens 仅由 wire view 的 view 产出
  // （index.js:509-516，:514 = Math.max(0, pressureTokens + surfaceTokens −
  // sampledSurfaceTokens)，且 pressureTokens 与 sampledSurfaceTokens 同在时才有）。
  // 读 stateOf 会使 projectedTokens 分支生产不可达、自适应预算恒退化为
  // pressureTokens（系统性少估占用）。故 min(剩余×0.5, 工具阈值) 自适应语义**照搬**，
  // 读取面固定为 wire view、无 stateOf 回退；上游自己的 `if (!usage)` 固定阈值回退
  // 保留为投影尚未有 provider usage 时的正常分支（首条工具结果即如此），非降级替代。
  // 上游 12 项工具白名单映射到 DSH = grep / glob / web_fetch 三项（映射表记在
  // listener 头部）；truncate_all 实验开关因 DSH registrar 无 config 通道而以模块
  // 常量承载（默认 false，与上游一致），接线留待后续。
  // 实测重叠（T14 e2e，须仲裁评估）：钉死基础组合还挂 `dsh-spill-policy`
  // （maxInlineBytes: 50000，listener prepend，dsh-base/cordis.patch.yml:383-386），
  // 它对链尾输出再做一次字节上限替换——e2e 里本 listener 的截断结果（含本模块尾注
  // `[90 more lines truncated due to context window limit]`）确实durable 落地，随后被
  // spill-policy 收到 50 000 字节并附它自己的 Omitted 提示。即：>50KB 的最终字节上限
  // 归 spill-policy；本模块仍贡献 token 预算感知（自适应预算低于该字节上限时才是约束
  // 方）与统一尾注。是否记"部分 DSH 原生覆盖"属仲裁项，见 T14 报告质疑节。
  {
    id: 'tool-output-truncator',
    upstreamFiles: ['packages/omo-opencode/src/hooks/tool-output-truncator.ts'],
    upstreamTestFiles: ['packages/omo-opencode/src/hooks/tool-output-truncator.test.ts'],
    event: 'tools/post-execute',
    mode: 'D',
    summary:
      '超长工具输出按 min(剩余上下文×0.5, 工具阈值) 截断；前置 T14 正向：剩余量取 contextPressure 投影的 client wire view（sessionProjections.snapshot → values.contextPressure 的 projectedTokens ?? pressureTokens；stateOf 是 host state、无 projectedTokens，不可用），自适应语义照搬（仅投影无 provider usage 时走上游自己的固定阈值回退）',
    e2eScenario: 'tool-output-truncated',
    // P3-T14: flipped 'pending' → 'ported' (listener + unit test + the
    // `tool-output-truncated` scenario all landed). The task book's "H-16 退化
    // 路径也要标" clause is moot on this runtime — the prerequisite measured
    // POSITIVE — so the row records the adaptive path rather than a degradation.
    status: 'ported',
  },
  // H-21 — phase3-hooks.md §1 P4 行（批 B）。上游 8 文件 = 6 实现 + 2 测试。
  // 与 dsh-agent-instructions 无重叠：其候选名 = AGENTS.md/CLAUDE.md，不含
  // README（覆盖基线 H-21 已核）。
  {
    id: 'directory-readme-injector',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/directory-readme-injector/constants.ts',
      'packages/omo-opencode/src/hooks/directory-readme-injector/finder.ts',
      'packages/omo-opencode/src/hooks/directory-readme-injector/hook.ts',
      'packages/omo-opencode/src/hooks/directory-readme-injector/index.ts',
      'packages/omo-opencode/src/hooks/directory-readme-injector/injector.ts',
      'packages/omo-opencode/src/hooks/directory-readme-injector/storage.ts',
    ],
    upstreamTestFiles: [
      'packages/omo-opencode/src/hooks/directory-readme-injector/finder.catch-fallbacks.test.ts',
      'packages/omo-opencode/src/hooks/directory-readme-injector/injector.test.ts',
    ],
    event: 'tools/post-execute',
    mode: 'D',
    summary:
      '读文件后把所在目录链 README 注入工具输出（上游 tool.execute.after 追加）；与 dsh-agent-instructions 无重叠（其候选名不含 README）',
    e2eScenario: 'directory-readme-injected',
    // P3-T15: flipped 'pending' → 'ported' (listener + unit test + the
    // `directory-readme-injected` scenario all landed). 实测要点记在 listener 头部：
    // ① 边界（H-21）实证 dsh-agent-instructions/lib/index.js:17-20 候选名 =
    //    AGENTS.md/CLAUDE.md + AGENTS.local.md/CLAUDE.local.md，无 README，无重叠；
    // ② D-mode 落点取 accept + content 替换（同批 A 三模块；`+=` 的等价物），
    //    非 additionalContexts；③ 走链 root = session.header.cwd（上游
    //    `ctx.directory` 的 DSH 等价物）；④ 去重键 = README 所在**目录**（上游
    //    injector.ts:48-49 语义，按 finder.ts 逐字复核）；⑤ 截断复用姊妹模块
    //    tool-output-truncator 的算法（同一上游 shared/dynamic-truncator.ts），
    //    预算默认 50 000 token / preserveHeaderLines 3；
    //    ⑥ 生命周期 = session/disposed（上游 session.deleted）+ session/event 的成功
    //    `compaction/end`（上游 session.compacted）；⑦ 未移植：上游磁盘
    //    injected-paths 存储（重启后首读会再注入一次，记降级）；⑧ 已仲裁（P3-T15）：
    //    `compaction/prune`（preset 挂了 tool-result-pruner）是 log-only 计量事件、
    //    不带 compaction/end，若它剪掉注入文本则目录集合仍武装、同目录下次 read 不再
    //    注入，待后续某次成功 `compaction/end` 清空集合后恢复——影响有界，接受；
    //    不追加 prune 触发（详见 listener 头部 KNOWN COMPOSITION SEMANTICS 段）。
    status: 'ported',
  },
  // H-22 — phase3-hooks.md §1 P4 行（批 B）。注入文本 apply 时一次构建
  // （计划书 §4.2 纪律④）。
  {
    id: 'agent-usage-reminder',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/agent-usage-reminder/constants.ts',
      'packages/omo-opencode/src/hooks/agent-usage-reminder/hook.ts',
      'packages/omo-opencode/src/hooks/agent-usage-reminder/index.ts',
      'packages/omo-opencode/src/hooks/agent-usage-reminder/storage.ts',
      'packages/omo-opencode/src/hooks/agent-usage-reminder/types.ts',
    ],
    upstreamTestFiles: [
      'packages/omo-opencode/src/hooks/agent-usage-reminder/index.test.ts',
      'packages/omo-opencode/src/hooks/agent-usage-reminder/storage.test.ts',
    ],
    event: 'tools/post-execute',
    mode: 'D',
    summary:
      '工具结果尾部追加 agent 使用提醒（上游 output.output += REMINDER_MESSAGE）',
    e2eScenario: 'agent-usage-reminder-appended',
    // P3-T15: flipped 'pending' → 'ported'. 实测要点记在 listener 头部：
    // ① 触发条件逐字对照上游 hook.ts:80-112 的顺序（orchestrator 门 → 委派工具
    //    置 agentUsed → TARGET_TOOLS 门 → 上限/已用门 → 追加）；MAX_REMINDERS=3；
    // ② orchestrator 门按 DSH 现实改写为「该 agent scope 是否看得见任一委派工具」
    //    （tools.get(name, exec.agent)；机制已由 scripts/prove-explore-toolfilter.mjs
    //    与 tests/omo-agents/roster-toolfilter-mechanism.test.ts:233-235 实证），
    //    因为 DSH 不落 roster 座位名（子会话 agentPreset 与父相同）；未知能力时
    //    按上游 unknown-agent 语义放行；③ TARGET_TOOLS 10 项 → DSH 4 项
    //    (grep/glob/web_fetch/web_search)，AGENT_TOOLS 2 项 → DSH 委派面 12 项；
    // ④ 提醒文案 5 处改写（OMO `task(...)` 签名 → DSH 名册工具 + description/prompt），
    //    上游原文逐字保留为 UPSTREAM_REMINDER_MESSAGE 审计；⑤ 状态 = WeakMap keyed
    //    session 对象（纪律⑤），session/disposed 重置；compaction **不**重置（上游
    //    测试钉死）；磁盘半未移植（记降级）。
    status: 'ported',
  },
  // H-23 — phase3-hooks.md §1 P4 行（批 B）。前置（实施期答）：是否依赖 OMO
  // task 工具族语义，若是则按 DoD-d 改判跳过并记录（覆盖基线 H-23）。
  {
    id: 'task-resume-info',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/task-resume-info/hook.ts',
      'packages/omo-opencode/src/hooks/task-resume-info/index.ts',
    ],
    upstreamTestFiles: ['packages/omo-opencode/src/hooks/task-resume-info/index.test.ts'],
    event: 'tools/post-execute',
    mode: 'D',
    summary:
      '工具结果追加任务恢复信息；前置：是否依赖 OMO task 工具族语义，若是则改判跳过（DoD-d）',
    e2eScenario: 'task-resume-info-appended',
    // P3-T15 前置**已闭合，结论：独立成立 → 移植**（不改判跳过）。逐字证据记在
    // listener 头部：上游 3 文件全部依赖面 = hook.ts:1 的唯一 import
    // `extractTaskLink`（纯解析器，task-metadata-contract.ts:115-143，不调用任何
    // task 工具/存储）+ hook.ts:3 的工具**名**列表 + hook.ts:19-21 的提示串。
    // 即依赖的是「(a) 返回可续作子会话的工具名 + (b) 如何续作」，DSH 两者皆有：
    // subagent 值 `{kind:'continuable', subagentId}`（dsh-tool-subagent:440-486）
    // → `send_message(agent_id=…, message=…)`（dsh-tool-subagent-control:23）。
    // 另证：上游 `link.backgroundTaskId` 解析后**从未使用**（hook.ts:16
    // `taskId ?? sessionId`），故 background/foreground 两种 kind 不产提示 = 上游
    // 自身判断的等价物，非静默收窄。
    status: 'ported',
  },
  // H-24 — phase3-hooks.md §1 P4 行（批 C）。**B + D 组合行**：event/mode 记主
  // 决策面（B 落 tools/pre-execute，deny reason 携带最终 URL 指引），D 段
  // （结果附加）在 summary 点名——两段共享 pre/post 配对，用 exec.callId /
  // exec.token 原生关联（计划书 §4.2 纪律⑤，不建裸 Map）。
  {
    id: 'webfetch-redirect-guard',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/webfetch-redirect-guard/constants.ts',
      'packages/omo-opencode/src/hooks/webfetch-redirect-guard/hook.ts',
      'packages/omo-opencode/src/hooks/webfetch-redirect-guard/index.ts',
      'packages/omo-opencode/src/hooks/webfetch-redirect-guard/redirect-resolution.ts',
    ],
    upstreamTestFiles: [
      'packages/omo-opencode/src/hooks/webfetch-redirect-guard/index.test.ts',
    ],
    event: 'tools/pre-execute',
    mode: 'B',
    summary:
      'webfetch 重定向护栏：B 段 deny（reason 携带最终 URL 指引）+ D 段结果附加（含 D）；pre/post 配对用 exec.callId/exec.token',
    e2eScenario: 'webfetch-redirect-denied',
    status: 'pending',
  },
  // H-26 — phase3-hooks.md §1 P4 行（批 C）。**B + D 组合行**（同 H-24 记录纪律）：
  // B 段 deny 非 .md 写（上游 hook.ts:40-62 可 1:1），D 段劝导因注入警告段在 DSH
  // 无附言缝而改落 post-execute 附加。
  {
    id: 'prometheus-md-only',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/prometheus-md-only/agent-matcher.ts',
      'packages/omo-opencode/src/hooks/prometheus-md-only/agent-resolution.ts',
      'packages/omo-opencode/src/hooks/prometheus-md-only/constants.ts',
      'packages/omo-opencode/src/hooks/prometheus-md-only/hook.ts',
      'packages/omo-opencode/src/hooks/prometheus-md-only/index.ts',
      'packages/omo-opencode/src/hooks/prometheus-md-only/path-policy.ts',
    ],
    upstreamTestFiles: ['packages/omo-opencode/src/hooks/prometheus-md-only/index.test.ts'],
    event: 'tools/pre-execute',
    mode: 'B',
    summary:
      'prometheus 仅可写 .md：B 段 deny 非 .md 写（hook.ts:40-62 可 1:1）+ D 段劝导落 post-execute 附加（含 D）',
    e2eScenario: 'prometheus-md-only-denied',
    status: 'pending',
  },
  // H-32 — phase3-hooks.md §1 P5 行。上游目录 20 文件 = **13 实现 + 7 测试**
  // （实测；覆盖基线 H-32 与计划书 §4.3 的"20 文件"含 AGENTS.md 之外无其他
  // 遗漏——13+7=20 恰好闭合，故此处**不需要**质疑计数，仅登记"20"的构成）。
  // 命名锚点：id 用 v5 名 `ulw-execute`（ROADMAP §2 规则 6），upstreamFiles 仍是
  // v4.19.4 的 `hooks/start-work/` 路径。模式 A/E：激活检测在 agent/pre-step
  // （A 段），Phase 4 命令模板 marker（`<session-context>` + "You are starting
  // an Atlas work session."）到期对接（R-10）；依赖 boulder-state 的部分
  // （session-plan-affinity 等）为登记在案的跳过段；脚手架/notepad 存储面用
  // ctx.jobs；`/ulw-execute` 命令引用一律不写（Phase 4）。
  {
    id: 'ulw-execute',
    upstreamFiles: [
      'packages/omo-opencode/src/hooks/start-work/context-info-builder.ts',
      'packages/omo-opencode/src/hooks/start-work/context-info-formatters.ts',
      'packages/omo-opencode/src/hooks/start-work/explicit-plan-context.ts',
      'packages/omo-opencode/src/hooks/start-work/index.ts',
      'packages/omo-opencode/src/hooks/start-work/notepad-scaffold.ts',
      'packages/omo-opencode/src/hooks/start-work/parse-user-request.ts',
      'packages/omo-opencode/src/hooks/start-work/plan-discovery-context.ts',
      'packages/omo-opencode/src/hooks/start-work/plan-selection.ts',
      'packages/omo-opencode/src/hooks/start-work/session-plan-affinity.ts',
      'packages/omo-opencode/src/hooks/start-work/start-work-hook.ts',
      'packages/omo-opencode/src/hooks/start-work/work-initializer.ts',
      'packages/omo-opencode/src/hooks/start-work/worktree-block.ts',
      'packages/omo-opencode/src/hooks/start-work/worktree-detector.ts',
    ],
    upstreamTestFiles: [
      'packages/omo-opencode/src/hooks/start-work/context-info-builder.test.ts',
      'packages/omo-opencode/src/hooks/start-work/index.test.ts',
      'packages/omo-opencode/src/hooks/start-work/notepad-scaffold.test.ts',
      'packages/omo-opencode/src/hooks/start-work/parse-user-request.test.ts',
      'packages/omo-opencode/src/hooks/start-work/session-plan-affinity.test.ts',
      'packages/omo-opencode/src/hooks/start-work/start-work-hook.test.ts',
      'packages/omo-opencode/src/hooks/start-work/worktree-detector.test.ts',
    ],
    event: 'agent/pre-step',
    mode: 'A',
    summary:
      '工作计划意图/显式委派 → 激活 atlas 并构建计划上下文/脚手架（A 段 pre-step + E 段 turn-stopping 补充 + ctx.jobs 存储面）；boulder-state 依赖段登记跳过',
    e2eScenario: 'ulw-execute-plan-intent',
    status: 'pending',
  },
] as const satisfies readonly HookManifestEntry[]

/**
 * The 14-row port roster as `readonly HookManifestEntry[]`, in priority order.
 * Widened for the same reason roster.ts widens ROSTER: `as const` is kept on
 * the authored table for literal id inference above, while consumers get the
 * declared shape.
 */
export const HOOK_MANIFEST: readonly HookManifestEntry[] = MANIFEST_ROWS

/**
 * The 14 port ids, in roster order, derived from the rows above (so a typo in
 * an `id` cannot silently widen the list). The T3 boot marker logs exactly
 * these, in this order.
 */
export const HOOK_IDS: readonly string[] = MANIFEST_ROWS.map((entry) => entry.id)

/**
 * Validates one roster (plan §4.1 / P3-T2 判定). Throws on the FIRST problem
 * instead of collecting a list: every failure mode here is an authoring error
 * whose message names the offending row, and a throw is what makes the T3
 * `apply()` call a loud-but-non-fatal boot line rather than a silent pass.
 *
 * Checks, in order per row (so a row with several problems reports its
 * structural one first):
 *   1. `id` non-empty, `upstreamFiles` non-empty, `summary` non-empty,
 *      `e2eScenario` non-empty;
 *   2. `event` ∈ MANIFEST_EVENTS, `mode` ∈ MANIFEST_MODES;
 *   3. no `upstreamFiles` entry ending in `.test.ts` (tests belong in
 *      `upstreamTestFiles`, which is the R-3 seed column) and none named
 *      `AGENTS.md` (N-03: not a hook source);
 *   4. `id` unique across the roster;
 *   5. the row count equals EXPECTED_HOOK_COUNT — the "14 rows really exist"
 *      assertion; without it a silently truncated table would validate.
 *
 * The AGENTS.md check matches on the path BASENAME, not a suffix substring, so
 * a hypothetical `.../AGENTS.md.ts` source is still legal.
 */
export function validateManifest(entries: readonly HookManifestEntry[]): void {
  if (entries.length !== EXPECTED_HOOK_COUNT) {
    throw new Error(
      `manifest: expected ${EXPECTED_HOOK_COUNT} hook entries, got ${entries.length}`,
    )
  }
  const seen = new Set<string>()
  for (const entry of entries) {
    if (entry.id === '') {
      throw new Error('manifest: entry with empty id')
    }
    if (seen.has(entry.id)) {
      throw new Error(`manifest: duplicate hook id '${entry.id}'`)
    }
    seen.add(entry.id)
    if (entry.upstreamFiles.length === 0) {
      throw new Error(`manifest: hook '${entry.id}' declares no upstreamFiles`)
    }
    if (entry.summary === '') {
      throw new Error(`manifest: hook '${entry.id}' declares an empty summary`)
    }
    if (entry.e2eScenario === '') {
      throw new Error(`manifest: hook '${entry.id}' declares an empty e2eScenario`)
    }
    if (!manifestModeSet.has(entry.mode)) {
      throw new Error(`manifest: hook '${entry.id}' declares illegal mode '${entry.mode}'`)
    }
    if (!manifestEventSet.has(entry.event)) {
      throw new Error(`manifest: hook '${entry.id}' declares illegal event '${entry.event}'`)
    }
    for (const file of entry.upstreamFiles) {
      if (file.endsWith('.test.ts')) {
        throw new Error(
          `manifest: hook '${entry.id}' lists test file '${file}' in upstreamFiles`
          + ' — tests belong in upstreamTestFiles',
        )
      }
      if (file.split('/').at(-1) === 'AGENTS.md') {
        throw new Error(
          `manifest: hook '${entry.id}' lists AGENTS.md in upstreamFiles`
          + ' — upstream documentation is not a hook source (N-03)',
        )
      }
    }
  }
}

/**
 * Groups a roster by target event — the T3 registration loop's input (one
 * listener batch per event) and the T3 static gate's expected boot-marker set.
 *
 * NOTE FOR THE T3 CONSUMER: this is a keyed-by-PRIMARY-event view. The B+D rows
 * (webfetch-redirect-guard, prometheus-md-only) also touch tools/post-execute
 * and session-notification also observes agent/status; a registration loop that
 * reads ONLY this map would register those halves nowhere. Derive the full
 * surface set from the listener implementations (or extend the rows with an
 * explicit secondary-event field) when T3 wires the loop — the map itself is
 * exact for what it claims: `entry.event` grouped, insertion order preserved.
 */
export function hooksByEvent(entries: readonly HookManifestEntry[]): Map<string, HookManifestEntry[]> {
  const grouped = new Map<string, HookManifestEntry[]>()
  for (const entry of entries) {
    const bucket = grouped.get(entry.event)
    if (bucket === undefined) {
      grouped.set(entry.event, [entry])
    } else {
      bucket.push(entry)
    }
  }
  return grouped
}

/**
 * The rows in a given status, in roster order — the T3/T19/T20 progress view
 * ("what is still 'pending'?"). An empty `status` matches nothing rather than
 * everything: a caller passing an unset variable must not be told the whole
 * roster is in that state.
 */
export function hooksByStatus(
  entries: readonly HookManifestEntry[],
  status: HookManifestStatus,
): readonly HookManifestEntry[] {
  return entries.filter((entry) => entry.status === status)
}
