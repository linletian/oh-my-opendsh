// P3-T17 — ulw-execute listener (plan §4.2 pattern A; task book WP-6 批 D, the
// largest single module of Phase 3). The listener is the semantic port of
// upstream packages/omo-opencode/src/hooks/start-work/ @ v4.19.4 (20 files =
// 13 implementation + 7 test), read under the v5 name `ulw-execute`
// (ROADMAP §2 rule 6 — the name is a human rename: `git grep ulw-execute`
// over v4.19.4 returns NOTHING, P3-T1 ruling C).
//
// 上游 → 本移植的事件形态：
//   upstream  `chat.message` / `command.execute.before` → 命令模板 marker 检测
//             → 改写 output.parts（就地追加 contextInfo）→ 切 agent 为 atlas
//   this port `agent/pre-step` (waterfall) → 「atlas 子会话 + 任务含工作计划
//             意图」检测 → `agent.inject()`（新消息，不改写已入队消息）
//
// The cases below are transcribed BY HAND from upstream's test files wherever an
// upstream test exists (parse-user-request.test.ts 16 例、notepad-scaffold.test.ts
// 4 例、context-info-builder.test.ts 的判定树主干、plan-checklist 的计数语义) —
// a test that derived them from the module under test would agree with any drift,
// which is exactly what this suite exists to catch. The activation / injection /
// jobs cases have NO upstream analog (the DSH surface is new) and are marked as
// such.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  CONTEXT_INFO_MARKER,
  START_WORK_TEMPLATE_MARKER,
  ULW_EXECUTE_HOOK_ID,
  ULW_EXECUTE_PRIMARY_EVENT,
  UPSTREAM_MARKER_AUDIT,
  buildInjectionMessage,
  buildInjectionText,
  parseUserRequestFor,
  createInventoryReader,
  createUlwExecuteListener,
  decideUlwExecuteActivation,
  formatUlwExecuteFailureLine,
  formatUlwExecuteLine,
  hasContextMarkerInSession,
  hasWorkIntent,
  planNameOf,
  readAgentSession,
  readBoulderView,
  readPreStepAgent,
  readSessionCwd,
  readSessionId,
  readDelegationTaskText,
  readTaskText,
  readWorkLabel,
  registerUlwExecute,
  type PreStepListener,
  type UlwExecuteDeps,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute.ts'
import {
  NOTEPAD_FILES,
  NOTEPAD_FOOTER,
  NOTEPAD_LABELS,
  UPSTREAM_NOTEPAD_FOOTER,
  ULW_EXECUTE_CONTEXT_MARKER,
  ULW_EXECUTE_ID,
  ULW_EXECUTE_PLUGIN,
  UPSTREAM_HOOK_NAME,
  UPSTREAM_CONTEXT_INFO_MARKER,
  TEMPLATE_HEADER_MARKER,
  TEMPLATE_SESSION_CONTEXT_OPEN,
  WORK_INTENT_MARKERS,
  WORKTREE_PLACEHOLDER,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/constants.ts'
import {
  EMPTY_REQUEST,
  hasUserRequestTag,
  parseUserRequest,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/parse-request.ts'
import {
  ATLAS_PERSONA_ANCHOR,
  ATLAS_PERSONA_FILE,
  isAtlasPersona,
  readDescriptorIdentity,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/identity.ts'
import {
  EMPTY_PLAN_PROGRESS,
  buildAutoSelectedPlanContextInfoOnly,
  buildExistingSessionContextText,
  buildMissingPlanContext,
  buildMultipleActiveWorksContext,
  buildPlanAlreadyCompleteContext,
  emptyChecklist,
  findPlanByName,
  formatElapsedHuman,
  formatIncompletePlanList,
  getPlanName,
  normalizePlanLookupValue,
  parsePlanChecklist,
  pickPreferredIncompletePlan,
  planProgressFromMarkdown,
  shouldDiscoverPlans,
  shouldResumeExistingState,
  shouldResumeSingleWorkOption,
  type BoulderLikeState,
  type BoulderLikeWorkOption,
  type PlanEntry,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/plan-discovery.ts'
import {
  buildStaticTextBlocks,
  buildWorkContextDocument,
  resolveWorktreeContext,
  type BoulderView,
  type WorkContextParams,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/context-builder.ts'
import {
  createPrDeliveryBlock,
  createWorktreeActiveBlock,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/worktree.ts'
import {
  EMPTY_PLAN_INVENTORY,
  buildNotepadHeader,
  readPlanInventory,
  readPlanProgress,
  scaffoldNotepad,
  startWorkJob,
  type JobsSurface,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ulw-execute/live-state.ts'

// ── helpers ─────────────────────────────────────────────────────────────────

/** One recorded `ctx.on` call — the registration observable. */
interface OnCall {
  readonly event: string
  readonly listener: (...args: readonly unknown[]) => unknown
}

/** A fake cordis context that records registrations (and serves `get`/`inject`). */
function fakeContext(options: {
  jobs?: unknown
  /** When true, `ctx.get('jobs')` returns undefined (the P3-T13 concurrent-loader race). */
  hideJobsFromGet?: boolean
  withInject?: boolean
} = {}): { ctx: HooksRegistrationContext; onCalls: OnCall[]; logs: string[] } {
  const onCalls: OnCall[] = []
  const logs: string[] = []
  const ctx: HooksRegistrationContext = {
    on(event, listener) {
      onCalls.push({ event, listener })
      return () => {}
    },
    get: (name) => (name === 'jobs' && options.hideJobsFromGet !== true ? options.jobs : undefined),
    ...(options.withInject === true
      ? {
        inject: (_deps: readonly string[], callback: (injected: Record<string, unknown>) => unknown) => {
          // The real cordis contract: the callback runs once its dependency is
          // available. This fake has no loader, so it invokes the callback with
          // the (possibly absent) jobs surface exactly once — that is the
          // "deferred acquisition resolved with nothing" branch.
          callback(options.jobs === undefined ? {} : { jobs: options.jobs })
          return () => {}
        },
      }
      : {}),
  }
  return { ctx, onCalls, logs }
}

/** The real manifest row — the registrar must read its primary event from the row. */
function ulwExecuteRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === ULW_EXECUTE_HOOK_ID)
  if (row === undefined) throw new Error('manifest is missing the ulw-execute row')
  return row
}

/**
 * A fake live session: `ownEvents()` returns the descriptor log the real
 * `Session` would, `header.cwd` is the workspace root. `persona === undefined`
 * means "no descriptor at all" (a top-level conductor session).
 */
function fakeSession(options: {
  cwd?: string
  id?: string
  persona?: string
  label?: string
  withDescriptor?: boolean
  extraEvents?: readonly unknown[]
} = {}): Record<string, unknown> {
  const events: unknown[] = [...(options.extraEvents ?? [])]
  if (options.withDescriptor !== false && (options.persona !== undefined || options.label !== undefined)) {
    events.unshift({
      type: 'subagent/descriptor',
      data: {
        version: 3,
        mode: 'continuable',
        provider: 'spawn',
        label: options.label ?? 'start work on the plan',
        ...(options.persona === undefined ? {} : { persona: options.persona }),
      },
    })
  }
  events.push({ type: 'turn/start', data: {} })
  return {
    header: { cwd: options.cwd ?? '/workspace', id: options.id ?? 'ses_atlas' },
    ownEvents: () => events,
  }
}

/** An atlas child session whose persona carries the anchor. */
function atlasSession(cwd = '/workspace'): Record<string, unknown> {
  return fakeSession({
    cwd,
    persona: `# Atlas: Master Orchestrator\nYou are **${ATLAS_PERSONA_ANCHOR}**, the master orchestrator.\n`,
  })
}

/** A sibling delegation child (explore) — the identity 对照. */
function siblingSession(cwd = '/workspace'): Record<string, unknown> {
  return fakeSession({ cwd, persona: 'You are **omo-explore**, a search agent.\n' })
}

/** A user message carrying model-visible text blocks. */
function userMessage(text: string): Record<string, unknown> {
  return { id: `msg_${randomUUID()}`, role: 'user', content: [{ type: 'text', text }] }
}

/** A pre-step payload double. */
function preStepPayload(session: unknown, texts: readonly string[]): Record<string, unknown> {
  return {
    agent: { id: 'agent-1', session, inject: () => {} },
    messages: texts.map(userMessage),
    turn: 1,
    step: 1,
    signal: AbortSignal.abort(),
  }
}

/** The value `next()` resolves to — a sentinel so "delegated verbatim" is checkable. */
const NEXT_RESULT = Object.freeze({ kind: 'enter' })

/** A `next` double that records calls and resolves to the sentinel. */
function nextDouble(): { next: () => Promise<unknown>; calls: () => number } {
  const calls: number[] = []
  return {
    next: async () => {
      calls.push(1)
      return NEXT_RESULT
    },
    calls: () => calls.length,
  }
}

/** Collects the injected messages off a payload double. */
function injectingPayload(
  session: unknown,
  texts: readonly string[],
): { payload: Record<string, unknown>; injected: unknown[] } {
  const injected: unknown[] = []
  const payload = {
    agent: { id: 'agent-1', session, inject: (message: unknown) => injected.push(message) },
    messages: texts.map(userMessage),
    turn: 1,
    step: 1,
    signal: AbortSignal.abort(),
  }
  return { payload, injected }
}

/** The listener deps with a FIXED inventory (zero I/O) and a captured log. */
function deps(options: {
  inventory?: Partial<Record<string, readonly PlanEntry[]>>
  logs?: string[]
  jobs?: JobsSurface
  now?: string
} = {}): UlwExecuteDeps {
  const logs = options.logs ?? []
  const inventoryFor = (directory: string) => {
    const entries = options.inventory?.[directory]
    return entries === undefined ? EMPTY_PLAN_INVENTORY : { entries, scannedDirs: [] }
  }
  return {
    blocks: buildStaticTextBlocks(),
    inventoryFor,
    readJobs: () => options.jobs,
    log: (line) => logs.push(line),
    now: () => options.now ?? '2026-05-11T00:00:00.000Z',
  }
}

/**
 * The listener deps whose inventory for `directory` is read from the REAL temp
 * directory (so the 计划发现 path exercises the actual file read + checklist
 * parse, not a hand-built list).
 */
function depsWithInventory(
  directory: string,
  options: { logs?: string[]; jobs?: JobsSurface } = {},
): UlwExecuteDeps {
  const logs = options.logs ?? []
  return {
    blocks: buildStaticTextBlocks(),
    inventoryFor: (requested) => (requested === directory ? readPlanInventory(directory) : EMPTY_PLAN_INVENTORY),
    readJobs: () => options.jobs,
    log: (line) => logs.push(line),
    now: () => '2026-05-11T00:00:00.000Z',
  }
}

/** One plan entry with an explicit progress (the builder's only data input). */
function planEntry(path: string, completed: number, total: number): PlanEntry {
  return { path, progress: { completed, total, isComplete: total > 0 && completed === total } }
}

/** A minimal `BoulderLikeState` double. */
function boulderState(overrides: Partial<BoulderLikeState> = {}): BoulderLikeState {
  return {
    activePlan: '/workspace/.omo/plans/alpha.md',
    planName: 'alpha',
    startedAt: '2026-01-01T00:00:00.000Z',
    sessionIds: ['ses_a'],
    activePlanProgress: { completed: 1, total: 4, isComplete: false },
    ...overrides,
  }
}

/** A minimal `BoulderLikeWorkOption` double. */
function workOption(overrides: Partial<BoulderLikeWorkOption> = {}): BoulderLikeWorkOption {
  return {
    workId: 'work-1',
    planName: 'alpha',
    activePlan: '/workspace/.omo/plans/alpha.md',
    status: 'active',
    startedAt: '2026-01-01T00:00:00.000Z',
    sessionCount: 1,
    progress: { completed: 1, total: 4, isComplete: false },
    ...overrides,
  }
}

/** The base `buildWorkContextDocument` params (each test overrides what it needs). */
function contextParams(overrides: Partial<WorkContextParams> = {}): WorkContextParams {
  return {
    blocks: buildStaticTextBlocks(),
    sessionId: 'ses_current',
    timestamp: '2026-05-11T00:00:00.000Z',
    directory: '/workspace',
    activeAgent: 'atlas',
    inventory: [],
    explicitPlanName: null,
    explicitWorktreePath: null,
    makePr: false,
    ship: false,
    preferredPlanPath: null,
    boulder: { existingState: null, activeWorks: [], resumeOptions: [] },
    validateWorktree: (candidate) => (candidate.trim().length > 0 ? candidate.trim() : undefined),
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ① 命名锚点与 Phase 4 接口契约（R-10 漂移哨兵）
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — 命名锚点与 Phase 4 接口契约（R-10）', () => {
  it('① id 用 v5 名 ulw-execute，上游名 start-work 只作审计', () => {
    expect(ULW_EXECUTE_ID).toBe('ulw-execute')
    expect(ULW_EXECUTE_HOOK_ID).toBe('ulw-execute')
    expect(UPSTREAM_HOOK_NAME).toBe('start-work')
  })

  it('① manifest 行 H-32 的事件面是 agent/pre-step，且 id 与实现一致', () => {
    const row = ulwExecuteRow()
    expect(row.event).toBe(ULW_EXECUTE_PRIMARY_EVENT)
    expect(row.mode).toBe('A')
    expect(row.status).toBe('ported')
    expect(row.e2eScenario).toBe('ulw-execute-activated')
  })

  it('① 幂等 marker 是命名锚点改写后的串，上游原文保留为审计', () => {
    expect(ULW_EXECUTE_CONTEXT_MARKER).toBe('<!-- omo-ulw-execute-context -->')
    expect(UPSTREAM_CONTEXT_INFO_MARKER).toBe('<!-- omo-start-work-context -->')
    expect(CONTEXT_INFO_MARKER).toBe(ULW_EXECUTE_CONTEXT_MARKER)
    expect(UPSTREAM_MARKER_AUDIT).toBe(UPSTREAM_CONTEXT_INFO_MARKER)
    // 幂等判据必须真的换过名（否则 Phase 4 模板对接时会与新模板不一致）
    expect(ULW_EXECUTE_CONTEXT_MARKER).not.toBe(UPSTREAM_CONTEXT_INFO_MARKER)
  })

  it('① Phase 4 模板 marker 逐字钉死（上游 templates/start-work.ts:1 + commands.ts:67）', () => {
    expect(START_WORK_TEMPLATE_MARKER).toBe('You are starting an Atlas work session.')
    expect(TEMPLATE_HEADER_MARKER).toBe(START_WORK_TEMPLATE_MARKER)
    expect(TEMPLATE_SESSION_CONTEXT_OPEN).toBe('<session-context>')
  })

  it('① 意图 marker 表含 Phase 4 模板语义与上游 parse-user-request 的 ulw 关键词', () => {
    expect(WORK_INTENT_MARKERS).toContain('atlas work session')
    expect(WORK_INTENT_MARKERS).toContain('start-work')
    expect(WORK_INTENT_MARKERS).toContain('ulw-execute')
    expect(WORK_INTENT_MARKERS).toContain('ultrawork')
    expect(WORK_INTENT_MARKERS).toContain('ulw')
  })

  it('① notepad footer 是命名锚点改写后的串（无 /ulw-execute 命令引用），上游原文保留', () => {
    expect(NOTEPAD_FOOTER).toBe(
      '_Auto-scaffolded by ulw-execute. Append new entries below - never overwrite._',
    )
    expect(UPSTREAM_NOTEPAD_FOOTER).toBe(
      '_Auto-scaffolded by /start-work. Append new entries below - never overwrite._',
    )
    expect(NOTEPAD_FOOTER).not.toContain('/ulw-execute')
    expect(NOTEPAD_FOOTER).not.toContain('/start-work')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ② parseUserRequest — 上游 parse-user-request.test.ts 16 例逐例移植
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — parseUserRequest（上游 parse-user-request.test.ts 逐例）', () => {
  it('② 无 <user-request> 标签 → 全 null', () => {
    const result = parseUserRequest('Just a regular message without any tags')
    expect(result.planName).toBeNull()
    expect(result.explicitWorktreePath).toBeNull()
    expect(result).toEqual(EMPTY_REQUEST)
    expect(hasUserRequestTag('Just a regular message without any tags')).toBe(false)
  })

  it('② 空标签 → 全 null', () => {
    const result = parseUserRequest('<user-request>  </user-request>')
    expect(result.planName).toBeNull()
    expect(result.explicitWorktreePath).toBeNull()
  })

  it('② 只有计划名（标签在 session-context 之内）', () => {
    const result = parseUserRequest(
      '<session-context>\n<user-request>my-plan</user-request>\n</session-context>',
    )
    expect(result.planName).toBe('my-plan')
    expect(result.explicitWorktreePath).toBeNull()
  })

  it('② 只有 --worktree <path>（无计划名）', () => {
    const result = parseUserRequest('<user-request>--worktree /home/user/repo-feat</user-request>')
    expect(result.planName).toBeNull()
    expect(result.explicitWorktreePath).toBe('/home/user/repo-feat')
  })

  it('② 计划名在 --worktree 之前 / 之后都解析出两者', () => {
    const before = parseUserRequest('<user-request>my-plan --worktree /path/to/worktree</user-request>')
    expect(before.planName).toBe('my-plan')
    expect(before.explicitWorktreePath).toBe('/path/to/worktree')

    const after = parseUserRequest('<user-request>--worktree /path/to/worktree my-plan</user-request>')
    expect(after.planName).toBe('my-plan')
    expect(after.explicitWorktreePath).toBe('/path/to/worktree')
  })

  it('② 包裹引号剥离', () => {
    const result = parseUserRequest('<user-request>"my feature plan"</user-request>')
    expect(result.planName).toBe('my feature plan')
    expect(result.explicitWorktreePath).toBeNull()
  })

  it('② --worktree 无 path → worktree 路径为 null', () => {
    const result = parseUserRequest('<user-request>--worktree</user-request>')
    expect(result.explicitWorktreePath).toBeNull()
  })

  it('② --make-pr 单独出现', () => {
    const result = parseUserRequest('<user-request>--make-pr</user-request>')
    expect(result.planName).toBeNull()
    expect(result.makePr).toBe(true)
    expect(result.ship).toBe(false)
  })

  it('② 计划名 + --make-pr → flag 从计划名里剥掉', () => {
    const result = parseUserRequest('<user-request>my-plan --make-pr</user-request>')
    expect(result.planName).toBe('my-plan')
    expect(result.makePr).toBe(true)
  })

  it('② --ship + 计划名 + worktree 三件套', () => {
    const result = parseUserRequest('<user-request>my-plan --ship --worktree /path/to/wt</user-request>')
    expect(result.planName).toBe('my-plan')
    expect(result.ship).toBe(true)
    expect(result.makePr).toBe(false)
    expect(result.explicitWorktreePath).toBe('/path/to/wt')
  })

  it('② --make-pr 与 --ship 同时出现 → 两者皆 true', () => {
    const result = parseUserRequest('<user-request>--make-pr --ship my-plan</user-request>')
    expect(result.planName).toBe('my-plan')
    expect(result.makePr).toBe(true)
    expect(result.ship).toBe(true)
  })

  it('② 无交付 flag → 两者皆 false', () => {
    const result = parseUserRequest('<user-request>my-plan</user-request>')
    expect(result.makePr).toBe(false)
    expect(result.ship).toBe(false)
  })

  it('② ultrawork 关键词从计划名剥掉', () => {
    const result = parseUserRequest('<user-request>my-plan ultrawork</user-request>')
    expect(result.planName).toBe('my-plan')
  })

  it('② ulw 关键词剥掉且保留 worktree', () => {
    const result = parseUserRequest('<user-request>my-plan ulw --worktree /path/to/wt</user-request>')
    expect(result.planName).toBe('my-plan')
    expect(result.explicitWorktreePath).toBe('/path/to/wt')
  })

  it('② 只有 ultrawork 关键词 + worktree → 计划名 null、worktree 保留', () => {
    const result = parseUserRequest('<user-request>ultrawork --worktree /wt</user-request>')
    expect(result.planName).toBeNull()
    expect(result.explicitWorktreePath).toBe('/wt')
  })

  it('② parseUserRequestFor 区分两种输入形态（Phase 4 标签 vs Phase 3 无标签）', () => {
    // Phase 4 形态：真标签 → 上游解析器的四元组全部生效。
    const withTag = '<session-context><user-request>my-plan --worktree /wt</user-request></session-context>'
    expect(parseUserRequestFor(withTag)).toEqual({
      planName: 'my-plan',
      explicitWorktreePath: '/wt',
      makePr: false,
      ship: false,
    })
    // Phase 3 形态：无标签 → EMPTY_REQUEST，绝不把整段自然语言当计划名
    // （否则判定树会产出虚假的 `did not match any plan` Reason 行）。
    expect(parseUserRequestFor('start work on the plan: read it and begin execution'))
      .toEqual(EMPTY_REQUEST)
    expect(parseUserRequestFor('')).toEqual(EMPTY_REQUEST)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ③ plan-discovery — checklist 计数（上游 boulder-state plan-checklist.ts）
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — 计划 checklist 计数（上游 plan-checklist.ts 语义）', () => {
  it('③ 结构化 TODOs 段落只数顶层编号任务', () => {
    const markdown = ['## TODOs', '- [ ] 1. First', '- [x] 2. Second', '- [ ] 3. Third', ''].join('\n')
    const progress = planProgressFromMarkdown(markdown)
    expect(progress).toEqual({ total: 3, completed: 1, isComplete: false })
    const checklist = parsePlanChecklist(markdown)
    expect(checklist).toEqual({
      completed: 1,
      remaining: 2,
      total: 3,
      nextTaskLabel: '1. First',
    })
  })

  it('③ 无结构化段落 → 简单模式数任意层级 checkbox', () => {
    // 上游 SIMPLE_CHECKBOX_PATTERN 锚定行首（`^[-*][ \t]*\[…\]…`），故缩进的
    // `  - [x] beta` 不计入——这是上游语义，不是本移植的收窄。
    const markdown = ['# Plan', '- [ ] alpha', '  - [x] indented not counted', '- [x] beta', ''].join('\n')
    const progress = planProgressFromMarkdown(markdown)
    expect(progress.total).toBe(2)
    expect(progress.completed).toBe(1)
    expect(progress.isComplete).toBe(false)
  })

  it('③ 代码块（``` fence）内的 checkbox 不计数', () => {
    const markdown = ['# Plan', '```', '- [ ] ignored', '```', '- [ ] counted', ''].join('\n')
    const progress = planProgressFromMarkdown(markdown)
    expect(progress.total).toBe(1)
    expect(progress.completed).toBe(0)
  })

  it('③ isComplete 只在 total>0 且 remaining===0 时为真（空计划不算完成）', () => {
    expect(planProgressFromMarkdown('## TODOs\n- [x] 1. Done\n').isComplete).toBe(true)
    expect(planProgressFromMarkdown('').isComplete).toBe(false)
    expect(planProgressFromMarkdown('## TODOs\n').isComplete).toBe(false)
  })

  it('③ 结构化 Final Verification Wave 段落也计入（上游第二条标题）', () => {
    const markdown = [
      '## TODOs',
      '- [x] 1. Main task',
      '## Final Verification Wave',
      '- [ ] F1. Verify it',
      '',
    ].join('\n')
    const progress = planProgressFromMarkdown(markdown)
    expect(progress.total).toBe(2)
    expect(progress.completed).toBe(1)
  })

  it('③ emptyChecklist 与 EMPTY_PLAN_PROGRESS 的形状是上游的（total>0 才有 isComplete）', () => {
    expect(emptyChecklist()).toEqual({ completed: 0, remaining: 0, total: 0, nextTaskLabel: null })
    expect(EMPTY_PLAN_PROGRESS).toEqual({ total: 0, completed: 0, isComplete: false })
    expect(parsePlanChecklist('')).toEqual(emptyChecklist())
  })
})

describe('P3-T17 ulw-execute — 计划选择（上游 plan-selection.ts）', () => {
  it('④ findPlanByName 四级优先：名称全等 → 归一化全等 → 名称子串 → 归一化子串', () => {
    const plans = [
      '/w/.omo/plans/alpha-feature.md',
      '/w/.omo/plans/beta_feature.md',
      '/w/.omo/plans/gamma.md',
    ]
    expect(getPlanName(plans[0])).toBe('alpha-feature')
    expect(findPlanByName(plans, 'ALPHA-FEATURE')).toBe(plans[0])
    // 归一化全等：`beta feature` → `beta-feature` == `beta_feature` 的归一化
    expect(findPlanByName(plans, 'beta feature')).toBe(plans[1])
    // 名称子串
    expect(findPlanByName(plans, 'gamma')).toBe(plans[2])
    expect(findPlanByName(plans, 'nothing-like-this')).toBeNull()
  })

  it('④ normalizePlanLookupValue 逐条：trim/引号/大小写/空白/Unicode 保留', () => {
    expect(normalizePlanLookupValue('  "My Plan"  ')).toBe('my-plan')
    expect(normalizePlanLookupValue('my_feature plan')).toBe('my-feature-plan')
    expect(normalizePlanLookupValue('中文计划名')).toBe('中文计划名')
    expect(normalizePlanLookupValue('--a---b--')).toBe('a-b')
  })

  it('④ formatIncompletePlanList 编号从 1 起、进度格式与上游一致', () => {
    const entries = [planEntry('/w/.omo/plans/alpha.md', 3, 10), planEntry('/w/.omo/plans/beta.md', 0, 5)]
    expect(formatIncompletePlanList(entries, false)).toBe(
      '1. [alpha] - Progress: 3/10\n2. [beta] - Progress: 0/5',
    )
    // includeModifiedTime=true 且带 modifiedAt 时插入 Modified 行（上游同形；
    // 本移植的差异是直接用 ISO 串而不是 new Date(mtimeMs)）
    const withTime: PlanEntry[] = [
      { ...entries[0], modifiedAt: '2026-05-11T00:00:00.000Z' },
      entries[1],
    ]
    expect(formatIncompletePlanList(withTime, true)).toBe(
      '1. [alpha] - Modified: 2026-05-11T00:00:00.000Z - Progress: 3/10\n2. [beta] - Progress: 0/5',
    )
  })

  it('④ pickPreferredIncompletePlan 只认逐字命中', () => {
    const entries = [planEntry('/w/.omo/plans/alpha.md', 0, 3)]
    expect(pickPreferredIncompletePlan(entries.map((entry) => entry.path), '/w/.omo/plans/alpha.md'))
      .toBe('/w/.omo/plans/alpha.md')
    expect(pickPreferredIncompletePlan(entries.map((entry) => entry.path), '/w/.omo/plans/alpha')).toBeNull()
    expect(pickPreferredIncompletePlan(entries.map((entry) => entry.path), null)).toBeNull()
  })

  it('④ buildMissingPlanContext 两分支逐字（有未完成计划 / 一个都没有）', () => {
    const incomplete = buildMissingPlanContext('nope', [planEntry('/w/.omo/plans/alpha.md', 0, 3)])
    expect(incomplete).toContain('## Plan Not Found')
    expect(incomplete).toContain('Could not find a plan matching "nope".')
    expect(incomplete).toContain('Available incomplete plans:')
    expect(incomplete).toContain('1. [alpha] - Progress: 0/3')
    expect(incomplete).toContain('Ask the user which plan to work on.')

    const none = buildMissingPlanContext('nope', [planEntry('/w/.omo/plans/done.md', 3, 3)])
    expect(none).toContain('No incomplete plans available. Create a new plan using the Prometheus agent.')
  })

  it('④ shouldResumeExistingState 三条否定 + 一条肯定', () => {
    expect(shouldResumeExistingState({ existingState: null, preferredPlanPath: null })).toBe(false)
    expect(shouldResumeExistingState({
      existingState: boulderState({ activePlanProgress: { completed: 4, total: 4, isComplete: true } }),
      preferredPlanPath: null,
    })).toBe(false)
    expect(shouldResumeExistingState({
      existingState: boulderState(),
      preferredPlanPath: '/w/.omo/plans/other.md',
    })).toBe(false)
    expect(shouldResumeExistingState({ existingState: boulderState(), preferredPlanPath: null })).toBe(true)
  })

  it('④ shouldDiscoverPlans 逐字', () => {
    expect(shouldDiscoverPlans({ existingState: null, explicitPlanName: null, preferredPlanPath: null }))
      .toBe(true)
    expect(shouldDiscoverPlans({ existingState: null, explicitPlanName: 'named', preferredPlanPath: null }))
      .toBe(false)
    expect(shouldDiscoverPlans({
      existingState: boulderState(),
      explicitPlanName: null,
      preferredPlanPath: null,
    })).toBe(false)
  })

  it('④ shouldResumeSingleWorkOption：无偏好→true；偏好=该 work→true；偏好仍是未完成计划→false', () => {
    const option = workOption()
    expect(shouldResumeSingleWorkOption({ option, preferredPlanPath: null, allPlans: [] })).toBe(true)
    expect(shouldResumeSingleWorkOption({
      option,
      preferredPlanPath: option.activePlan,
      allPlans: [],
    })).toBe(true)
    expect(shouldResumeSingleWorkOption({
      option,
      preferredPlanPath: '/w/.omo/plans/other.md',
      allPlans: [planEntry('/w/.omo/plans/other.md', 0, 3)],
    })).toBe(false)
  })

  it('④ formatElapsedHuman 逐字（running / 秒 / 分 / 时）', () => {
    expect(formatElapsedHuman(undefined)).toBe('running')
    expect(formatElapsedHuman(0)).toBe('running')
    expect(formatElapsedHuman(45_000)).toBe('45s')
    expect(formatElapsedHuman(125_000)).toBe('2m 5s')
    expect(formatElapsedHuman(3_725_000)).toBe('1h 2m 5s')
  })

  it('④ buildMultipleActiveWorksContext 含 Question 指引，且命令引用写 ulw-execute（无斜杠）', () => {
    const text = buildMultipleActiveWorksContext({
      resumeOptions: [workOption(), workOption({ planName: 'beta', workId: 'work-2' })],
      sessionId: 'ses_current',
      timestamp: '2026-05-11T00:00:00.000Z',
    })
    expect(text).toContain('## Multiple Active Works Found')
    expect(text).toContain('Use the Question tool to ask the user which plan to resume.')
    expect(text).toContain('- If the user chooses one option, run ulw-execute {plan-name} for that plan.')
    expect(text).not.toContain('/ulw-execute')
    expect(text).not.toContain('/start-work')
    expect(text).toContain('1. alpha - 1/4')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ context-builder — 判定树（上游 context-info-builder.ts）
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — 上下文构建判定树（上游 context-info-builder.ts）', () => {
  it('⑤ 多活动 work（无显式计划名）→ 询问分支，无副作用', () => {
    const result = buildWorkContextDocument(contextParams({
      boulder: {
        existingState: boulderState(),
        activeWorks: [workOption(), workOption({ workId: 'work-2', planName: 'beta' })],
        resumeOptions: [workOption(), workOption({ workId: 'work-2', planName: 'beta' })],
      },
    }))
    expect(result.branch).toBe('multiple-active-works')
    expect(result.text).toContain('Use the Question tool')
    expect(result.selectPlan).toBeUndefined()
  })

  it('⑤ 恰好一个活动 work（无偏好计划）→ 续接分支 + 副作用（计划路径）', () => {
    const result = buildWorkContextDocument(contextParams({
      boulder: {
        existingState: boulderState(),
        activeWorks: [workOption()],
        resumeOptions: [workOption()],
      },
    }))
    expect(result.branch).toBe('resume-single-work')
    expect(result.text).toContain('RESUMING existing work')
    expect(result.text).toContain('**Plan**: alpha')
    expect(result.text).toContain('The current session (ses_current) has been added to session_ids.')
    expect(result.selectPlan?.planPath).toBe('/workspace/.omo/plans/alpha.md')
    expect(result.selectPlan?.source).toBe('plan-discovery')
  })

  it('⑤ 无活动 work 且无计划文件 → No Plans Found', () => {
    const result = buildWorkContextDocument(contextParams())
    expect(result.branch).toBe('discovery-no-plans')
    expect(result.text).toContain('## No Plans Found')
    expect(result.text).toContain('Use the Prometheus agent to create a work plan first.')
    expect(result.selectPlan).toBeUndefined()
  })

  it('⑤ 计划全部完成 → All Plans Complete（计数来自清单长度）', () => {
    const result = buildWorkContextDocument(contextParams({
      inventory: [planEntry('/w/.omo/plans/a.md', 3, 3), planEntry('/w/.omo/plans/b.md', 2, 2)],
    }))
    expect(result.branch).toBe('discovery-all-complete')
    expect(result.text).toContain('All 2 plan(s) are complete.')
    expect(result.selectPlan).toBeUndefined()
  })

  it('⑤ 唯一未完成计划 → 自动选中 + 副作用（上游 :107-116）', () => {
    const result = buildWorkContextDocument(contextParams({
      inventory: [planEntry('/w/.omo/plans/alpha.md', 1, 4), planEntry('/w/.omo/plans/done.md', 2, 2)],
    }))
    expect(result.branch).toBe('discovery-auto-selected')
    expect(result.text).toContain('## Auto-Selected Plan')
    expect(result.text).toContain('**Plan**: alpha')
    expect(result.text).toContain('**Progress**: 1/4 tasks')
    expect(result.text).toContain('boulder.json has been created. Read the plan and begin execution.')
    expect(result.selectPlan?.planPath).toBe('/w/.omo/plans/alpha.md')
    expect(result.selectPlan?.source).toBe('plan-discovery')
  })

  it('⑤ 多个未完成计划 → 询问分支（带 Modified 与编号）', () => {
    const result = buildWorkContextDocument(contextParams({
      inventory: [
        { path: '/w/.omo/plans/alpha.md', progress: { completed: 1, total: 4, isComplete: false }, modifiedAt: '2026-05-01T00:00:00.000Z' },
        planEntry('/w/.omo/plans/beta.md', 0, 3),
      ],
    }))
    expect(result.branch).toBe('discovery-ask')
    expect(result.text).toContain('## Multiple Plans Found')
    expect(result.text).toContain('1. [alpha] - Modified: 2026-05-01T00:00:00.000Z - Progress: 1/4')
    expect(result.text).toContain('2. [beta] - Progress: 0/3')
    expect(result.text).toContain('Ask the user which plan to work on.')
    expect(result.selectPlan).toBeUndefined()
  })

  it('⑤ 偏好计划命中未完成清单 → 自动选中且带 Reason 行', () => {
    const result = buildWorkContextDocument(contextParams({
      inventory: [planEntry('/w/.omo/plans/alpha.md', 1, 4), planEntry('/w/.omo/plans/beta.md', 0, 3)],
      preferredPlanPath: '/w/.omo/plans/alpha.md',
    }))
    expect(result.branch).toBe('discovery-auto-selected')
    expect(result.text).toContain('**Reason**: Most recently referenced plan in this session')
  })

  it('⑤ 显式计划名命中 → 自动选中该计划（模糊匹配）', () => {
    const result = buildWorkContextDocument(contextParams({
      explicitPlanName: 'alpha',
      inventory: [planEntry('/w/.omo/plans/alpha.md', 0, 4), planEntry('/w/.omo/plans/beta.md', 0, 3)],
    }))
    expect(result.branch).toBe('explicit-plan-auto-selected')
    expect(result.text).toContain('**Plan**: alpha')
    expect(result.selectPlan?.source).toBe('explicit-plan')
  })

  it('⑤ 显式计划名未命中且恰好一个未完成计划 → 带 reason 的兜底自动选中', () => {
    const result = buildWorkContextDocument(contextParams({
      explicitPlanName: 'does-not-exist',
      inventory: [planEntry('/w/.omo/plans/alpha.md', 0, 4), planEntry('/w/.omo/plans/done.md', 1, 1)],
    }))
    expect(result.branch).toBe('explicit-plan-fallback-single-incomplete')
    expect(result.text).toContain(
      '**Reason**: Only incomplete plan available after "does-not-exist" did not match any plan',
    )
    expect(result.selectPlan?.planPath).toBe('/w/.omo/plans/alpha.md')
  })

  it('⑤ 显式计划名未命中且多个未完成 → Plan Not Found（无副作用）', () => {
    const result = buildWorkContextDocument(contextParams({
      explicitPlanName: 'does-not-exist',
      inventory: [planEntry('/w/.omo/plans/alpha.md', 0, 4), planEntry('/w/.omo/plans/beta.md', 0, 3)],
    }))
    expect(result.branch).toBe('explicit-plan-missing')
    expect(result.text).toContain('## Plan Not Found')
    expect(result.selectPlan).toBeUndefined()
  })

  it('⑤ 显式计划名命中但已完成 → Plan Already Complete', () => {
    const result = buildWorkContextDocument(contextParams({
      explicitPlanName: 'alpha',
      inventory: [planEntry('/w/.omo/plans/alpha.md', 3, 3)],
    }))
    expect(result.branch).toBe('explicit-plan-complete')
    expect(result.text).toContain('## Plan Already Complete')
    expect(result.text).toContain('All 3 tasks are done.')
    expect(result.selectPlan).toBeUndefined()
  })

  it('⑤ 无显式名 + 存在无关活动 state → 忽略该 state 并继续计划发现（上游 :138-156）', () => {
    const result = buildWorkContextDocument(contextParams({
      inventory: [planEntry('/w/.omo/plans/alpha.md', 0, 4)],
      boulder: {
        existingState: boulderState({ activePlan: '/w/.omo/plans/other.md', planName: 'other' }),
        activeWorks: [workOption()],
        resumeOptions: [],
      },
      preferredPlanPath: '/w/.omo/plans/alpha.md',
    }))
    expect(result.branch).toBe('discovery-auto-selected')
    expect(result.text).toContain('**Plan**: alpha')
    expect(result.selectPlan?.planPath).toBe('/w/.omo/plans/alpha.md')
  })

  it('⑤ 计划已完成时 buildExistingSessionContextText 给 Previous Work Complete', () => {
    const text = buildExistingSessionContextText({
      existingState: boulderState({ planName: 'alpha' }),
      planPath: '/w/.omo/plans/alpha.md',
      progress: { completed: 4, total: 4, isComplete: true },
      sessionId: 'ses_current',
      worktreePath: undefined,
      worktreeBlock: '',
      createWorktreeBlock: createWorktreeActiveBlock,
    })
    expect(text).toContain('## Previous Work Complete')
    expect(text).toContain('The previous plan (alpha) has been completed.')
  })

  it('⑤ buildPlanAlreadyCompleteContext / buildAutoSelectedPlanContextInfoOnly 逐字', () => {
    expect(buildPlanAlreadyCompleteContext('alpha', 5)).toContain(
      ' The requested plan "alpha" has been completed.',
    )
    const auto = buildAutoSelectedPlanContextInfoOnly({
      planPath: '/w/.omo/plans/alpha.md',
      planProgress: { completed: 1, total: 4, isComplete: false },
      sessionId: 'ses_x',
      timestamp: 'T',
      worktreeBlock: '',
    })
    expect(auto).toContain('**Plan**: alpha')
    expect(auto).toContain('**Path**: /w/.omo/plans/alpha.md')
    expect(auto).toContain('**Progress**: 1/4 tasks')
    expect(auto).toContain('**Session ID**: ses_x')
    expect(auto).toContain('**Started**: T')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ worktree 文本块（上游 worktree-block.ts）；探测面登记为跳过段
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — worktree 文本块（上游 worktree-block.ts 逐字）', () => {
  it('⑥ createWorktreeActiveBlock 逐字含路径两处与 CRITICAL 段', () => {
    const block = createWorktreeActiveBlock('/tmp/wt')
    expect(block).toContain('## Worktree Active')
    expect(block).toContain('**Worktree**: `/tmp/wt`')
    expect(block).toContain('Every file read, write, edit, and git operation MUST target paths under: `/tmp/wt`')
    expect(block).toContain('NEVER operate on the main repository directory')
    expect(block).not.toContain(WORKTREE_PLACEHOLDER)
  })

  it('⑥ createPrDeliveryBlock：无 flag → 空串；--make-pr 与 --ship 两种标题', () => {
    expect(createPrDeliveryBlock({ makePr: false, ship: false }, undefined)).toBe('')
    const makePr = createPrDeliveryBlock({ makePr: true, ship: false }, undefined)
    expect(makePr).toContain('## PR Delivery Mode (--make-pr)')
    expect(makePr).toContain('Worktree mode is IMPLIED')
    expect(makePr).toContain('Hand off with the PR URL after it is created. Do not merge unless the user explicitly asks.')
    const ship = createPrDeliveryBlock({ makePr: false, ship: true }, '/tmp/wt')
    expect(ship).toContain('## PR Delivery Mode (--ship: work until merged)')
    expect(ship).toContain('Work exclusively inside the active worktree above')
    expect(ship).toContain('stay on the job until the PR is MERGED')
  })

  it('⑥ resolveWorktreeContext：未指定 → 空；校验通过 → active block；校验失败 → needs setup', () => {
    const validate = (candidate: string): string | undefined =>
      (candidate.trim().length > 0 ? candidate.trim() : undefined)
    expect(resolveWorktreeContext(null, validate)).toEqual({ worktreePath: undefined, block: '' })
    const accepted = resolveWorktreeContext('/tmp/wt', validate)
    expect(accepted.worktreePath).toBe('/tmp/wt')
    expect(accepted.block).toContain('## Worktree Active')
    const rejected = resolveWorktreeContext('   ', validate)
    expect(rejected.worktreePath).toBeUndefined()
    expect(rejected.block).toContain('(needs setup)')
    expect(rejected.block).toContain('git worktree add')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ notepad 脚手架 + jobs 存储面（上游 notepad-scaffold.ts / work-initializer.ts）
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — notepad 脚手架（上游 notepad-scaffold.test.ts 逐例）', () => {
  let testDirectory = ''

  beforeEach(() => {
    testDirectory = join(tmpdir(), `ulw-execute-notepad-${randomUUID()}`)
    mkdirSync(testDirectory, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDirectory)) rmSync(testDirectory, { recursive: true, force: true })
  })

  it('⑦ 空目录 → 建出四个文件并写入头部（含改名后的 footer）', () => {
    const result = scaffoldNotepad(testDirectory, 'alpha')
    const notepadDir = join(testDirectory, '.omo', 'notepads', 'alpha')
    for (const fileName of NOTEPAD_FILES) {
      expect(existsSync(join(notepadDir, fileName))).toBe(true)
    }
    const learnings = readFileSync(join(notepadDir, 'learnings.md'), 'utf8')
    expect(learnings).toContain('# Learnings \u2014 alpha')
    expect(learnings).toContain('Auto-scaffolded by ulw-execute')
    expect(learnings).not.toContain('/start-work')
    expect(result.created).toEqual([...NOTEPAD_FILES])
    expect(result.skipped).toEqual([])
    expect(result.directory).toBe(notepadDir)
  })

  it('⑦ 已脚手架化的目录再次调用 → 四文件不变（幂等）', () => {
    scaffoldNotepad(testDirectory, 'alpha')
    const notepadDir = notepadDirectoryOf(testDirectory, 'alpha')
    const before = NOTEPAD_FILES.map((name) => readFileSync(join(notepadDir, name), 'utf8'))
    const result = scaffoldNotepad(testDirectory, 'alpha')
    const after = NOTEPAD_FILES.map((name) => readFileSync(join(notepadDir, name), 'utf8'))
    expect(after).toEqual(before)
    expect(result.created).toEqual([])
    expect(result.skipped).toEqual([...NOTEPAD_FILES])
  })

  it('⑦ 部分预存在 → 只建缺的，预存在内容原样保留', () => {
    const notepadDir = notepadDirectoryOf(testDirectory, 'alpha')
    mkdirSync(notepadDir, { recursive: true })
    writeFileSync(join(notepadDir, 'learnings.md'), 'ORIGINAL LEARNINGS')
    writeFileSync(join(notepadDir, 'decisions.md'), 'ORIGINAL DECISIONS')

    const result = scaffoldNotepad(testDirectory, 'alpha')
    expect(readFileSync(join(notepadDir, 'learnings.md'), 'utf8')).toBe('ORIGINAL LEARNINGS')
    expect(readFileSync(join(notepadDir, 'decisions.md'), 'utf8')).toBe('ORIGINAL DECISIONS')
    expect(result.created).toEqual(['issues.md', 'problems.md'])
    expect(result.skipped).toEqual(['learnings.md', 'decisions.md'])
  })

  it('⑦ 缺失父目录 → 递归建出 .omo/notepads/<plan>', () => {
    scaffoldNotepad(testDirectory, 'alpha')
    expect(existsSync(join(testDirectory, '.omo', 'notepads', 'alpha'))).toBe(true)
  })

  it('⑦ buildNotepadHeader 四文件的 label/purpose 与上游一致', () => {
    expect(buildNotepadHeader('learnings.md', 'alpha')).toContain('# Learnings \u2014 alpha')
    expect(buildNotepadHeader('decisions.md', 'alpha')).toContain('# Decisions \u2014 alpha')
    expect(buildNotepadHeader('issues.md', 'alpha')).toContain('# Issues \u2014 alpha')
    expect(buildNotepadHeader('problems.md', 'alpha')).toContain('# Problems \u2014 alpha')
    expect(NOTEPAD_LABELS['problems.md']).toBe('Problems')
    expect(buildNotepadHeader('learnings.md', 'alpha')).toBe(
      `# Learnings \u2014 alpha\n\n`
      + `Conventions, patterns, and successful approaches discovered during work on this plan.\n\n`
      + `${NOTEPAD_FOOTER}\n\n---\n`,
    )
  })
})

/** The notepad dir for a temp root (mirrors the implementation's join). */
function notepadDirectoryOf(directory: string, planName: string): string {
  return join(directory, '.omo', 'notepads', planName)
}

describe('P3-T17 ulw-execute — ctx.jobs 存储面（上游 work-initializer.ts 的副作用半）', () => {
  let testDirectory = ''

  beforeEach(() => {
    testDirectory = join(tmpdir(), `ulw-execute-jobs-${randomUUID()}`)
    mkdirSync(testDirectory, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDirectory)) rmSync(testDirectory, { recursive: true, force: true })
  })

  it('⑧ jobs 在场 → 注册一个 kind=ulw-execute 的 job，脚手架照常落地', async () => {
    const starts: Array<{ kind: string; label: string; output?: string }> = []
    const jobs: JobsSurface = {
      start: (spec) => {
        const hooks = spec.run()
        starts.push({ kind: spec.kind, label: spec.label })
        void hooks.done.then((outcome) => {
          starts[0].output = outcome.output
        })
        return 'ulw-execute-1'
      },
    }
    const result = startWorkJob({
      jobs,
      directory: testDirectory,
      planName: 'alpha',
      sessionId: 'ses_child',
      agent: undefined,
    })
    expect(result.jobId).toBe('ulw-execute-1')
    expect(result.degraded).toBe(false)
    expect(starts[0].kind).toBe('ulw-execute')
    expect(starts[0].label).toBe('ulw-execute: alpha')
    await Promise.resolve()
    expect(starts[0].output).toContain('plan=alpha session=ses_child')
    expect(starts[0].output).toContain(`notepad=${result.scaffold.directory}`)
    expect(starts[0].output).toContain('created=[learnings.md,decisions.md,issues.md,problems.md]')
  })

  it('⑧ owner 是活 Agent 实例（dsh-jobs 的预检要求），不是它的 session', () => {
    const owners: unknown[] = []
    const liveAgent = { id: 'agent-1', session: { header: { id: 'ses_child' } } }
    const jobs: JobsSurface = {
      start: (spec) => {
        owners.push(spec.owner)
        spec.run()
        return 'ulw-execute-1'
      },
    }
    const result = startWorkJob({
      jobs,
      directory: testDirectory,
      planName: 'alpha',
      sessionId: 'ses_child',
      agent: liveAgent,
    })
    expect(result.jobId).toBe('ulw-execute-1')
    expect(owners).toEqual([liveAgent])
    expect(owners[0]).not.toBe(liveAgent.session)
  })

  it('⑧ jobs 缺席 → degraded=true、jobId undefined，脚手架仍然落地（loud-but-non-fatal）', () => {
    const result = startWorkJob({
      jobs: undefined,
      directory: testDirectory,
      planName: 'alpha',
      sessionId: 'ses_child',
      agent: undefined,
    })
    expect(result.jobId).toBeUndefined()
    expect(result.degraded).toBe(true)
    expect(result.scaffold.created).toEqual([...NOTEPAD_FILES])
    expect(existsSync(join(testDirectory, '.omo', 'notepads', 'alpha', 'learnings.md'))).toBe(true)
  })

  it('⑧ jobs.start 抛错（预检拒绝）→ 降级，不抛出', () => {
    const jobs: JobsSurface = {
      start: () => {
        throw new Error('owner is not a live agent')
      },
    }
    const result = startWorkJob({
      jobs,
      directory: testDirectory,
      planName: 'alpha',
      sessionId: 'ses_child',
      agent: undefined,
    })
    expect(result.jobId).toBeUndefined()
    expect(result.degraded).toBe(true)
    expect(result.scaffold.created).toEqual([...NOTEPAD_FILES])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ 计划清单读面（上游 boulder-state plan-progress.ts findPrometheusPlans）
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — 计划清单读面（含 .sisyphus/plans 旧布局）', () => {
  let testDirectory = ''

  beforeEach(() => {
    testDirectory = join(tmpdir(), `ulw-execute-plans-${randomUUID()}`)
    mkdirSync(testDirectory, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDirectory)) rmSync(testDirectory, { recursive: true, force: true })
  })

  it('⑨ 两条目录都扫、只收 .md、按 mtime 倒序、进度来自文件内容', () => {
    const plansDir = join(testDirectory, '.omo', 'plans')
    const legacyDir = join(testDirectory, '.sisyphus', 'plans')
    mkdirSync(plansDir, { recursive: true })
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(join(plansDir, 'alpha.md'), '## TODOs\n- [x] 1. A\n- [ ] 2. B\n')
    writeFileSync(join(plansDir, 'ignored.txt'), 'not a plan')
    writeFileSync(join(legacyDir, 'legacy.md'), '## TODOs\n- [ ] 1. L\n')

    const inventory = readPlanInventory(testDirectory)
    const names = inventory.entries.map((entry) => getPlanName(entry.path)).sort()
    expect(names).toEqual(['alpha', 'legacy'])
    expect([...inventory.scannedDirs].sort()).toEqual([plansDir, legacyDir].sort())
    const alpha = inventory.entries.find((entry) => getPlanName(entry.path) === 'alpha')
    expect(alpha?.progress).toEqual({ completed: 1, total: 2, isComplete: false })
    expect(alpha?.modifiedAt).toBeDefined()
  })

  it('⑨ 目录不存在 / cwd 未知 → 空清单，不抛错', () => {
    expect(readPlanInventory(join(testDirectory, 'nope'))).toEqual(EMPTY_PLAN_INVENTORY)
    expect(readPlanInventory(undefined)).toEqual(EMPTY_PLAN_INVENTORY)
    expect(readPlanInventory('')).toEqual(EMPTY_PLAN_INVENTORY)
  })

  it('⑨ readPlanProgress：文件缺失 → 空进度；坏内容不抛', () => {
    expect(readPlanProgress(join(testDirectory, 'missing.md'))).toEqual(EMPTY_PLAN_PROGRESS)
    const weird = join(testDirectory, 'weird.md')
    writeFileSync(weird, '## TODOs\n- [ ] not-numbered\n')
    expect(readPlanProgress(weird).total).toBe(0)
  })

  it('⑨ createInventoryReader 按 cwd 记忆化（同一目录只读一次）', () => {
    let reads = 0
    const loaded: string[] = []
    const reader = createInventoryReader((directory) => {
      reads += 1
      return { entries: [planEntry(join(directory, 'x.md'), 0, 1)], scannedDirs: [directory] }
    }, (directory) => loaded.push(directory))
    const first = reader('/a')
    const second = reader('/a')
    expect(first).toBe(second)
    expect(reads).toBe(1)
    expect(loaded).toEqual(['/a'])
    reader('/b')
    expect(reads).toBe(2)
    expect(loaded).toEqual(['/a', '/b'])
  })

  it('⑨ createInventoryReader 吞掉读面抛错（空清单）', () => {
    const reader = createInventoryReader(() => {
      throw new Error('permission denied')
    })
    expect(reader('/a')).toEqual(EMPTY_PLAN_INVENTORY)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ 身份面（omo-atlas 锚点）—— 无上游对应（DSH 面为新）
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — 身份面（descriptor.persona 的 omo-atlas 锚点）', () => {
  it('⑩ readDescriptorIdentity 读第一个 descriptor 的 persona', () => {
    const session = atlasSession()
    expect(readDescriptorIdentity(session)).toEqual({
      found: true,
      persona: expect.stringContaining(ATLAS_PERSONA_ANCHOR) as unknown as string,
      label: 'start work on the plan',
    })
  })

  it('⑩ descriptor 存在但无 persona → found:true / persona:undefined（可缓存）', () => {
    const session = fakeSession({ withDescriptor: false })
    expect(readDescriptorIdentity(session)).toEqual({ found: false, persona: undefined, label: undefined })
    const bare = fakeSession({ label: 'no persona here' })
    expect(readDescriptorIdentity(bare)).toEqual({
      found: true,
      persona: undefined,
      label: 'no persona here',
    })
  })

  it('⑩ 非会话/无日志面 → found:false；ownEvents 抛错 → found:false（不传播）', () => {
    expect(readDescriptorIdentity(undefined)).toEqual({ found: false, persona: undefined, label: undefined })
    expect(readDescriptorIdentity({})).toEqual({ found: false, persona: undefined, label: undefined })
    expect(readDescriptorIdentity({
      ownEvents: () => {
        throw new Error('boom')
      },
    })).toEqual({ found: false, persona: undefined, label: undefined })
  })

  it('⑩ isAtlasPersona 只认锚点；sibling persona 为假', () => {
    expect(isAtlasPersona('You are **omo-atlas**, the master orchestrator.')).toBe(true)
    expect(isAtlasPersona(undefined)).toBe(false)
    expect(isAtlasPersona('You are **omo-explore**, a search agent.')).toBe(false)
    expect(isAtlasPersona('You are omo-prometheus.')).toBe(false)
  })

  it('⑩ DRIFT GUARD：锚点在真实 persona 文件集里恰好出现一次（atlas 那份）', () => {
    const dir = 'patches/omo-dsh/omo-agents/system-sections'
    const files = readFileSync
    void files
    const { readdirSync } = require('node:fs') as { readdirSync: (p: string) => string[] }
    const hits = readdirSync(dir).filter((name) => {
      const text = readFileSync(join(dir, name), 'utf8')
      return text.includes(ATLAS_PERSONA_ANCHOR)
    })
    expect(hits).toEqual(['atlas-persona.md'])
    const atlas = readFileSync(ATLAS_PERSONA_FILE, 'utf8')
    expect(atlas).toBe(readFileSync(join(dir, 'atlas-persona.md'), 'utf8'))
  })

  it('⑩ readWorkLabel / readSessionCwd / readSessionId 的叶子读取', () => {
    expect(readWorkLabel(atlasSession())).toBe('start work on the plan')
    expect(readWorkLabel({})).toBeUndefined()
    expect((atlasSession() as { header: { cwd: string } }).header.cwd).toBe('/workspace')
    expect(readSessionCwd({ header: { cwd: '/w' } })).toBe('/w')
    expect(readSessionCwd({ header: {} })).toBeUndefined()
    expect(readSessionId({ header: { id: 'ses_x' } })).toBe('ses_x')
    expect(readSessionId({})).toBe('')
  })

  it('⑩ readBoulderView 默认空投影（S-1：无 boulder-state 读者）', () => {
    expect(readBoulderView(atlasSession())).toEqual({
      existingState: null,
      activeWorks: [],
      resumeOptions: [],
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑪ 激活检测（纯函数）—— 无上游对应（DSH 原生形态）
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — 激活检测（纯函数，DSH 原生信号）', () => {
  const ATLAS = `You are **${ATLAS_PERSONA_ANCHOR}**, the master orchestrator.`
  const CONTEXT = '## Auto-Selected Plan\n**Plan**: alpha'

  it('⑪ 委派 atlas + 工作计划意图 + 有上下文 → inject', () => {
    const decision = decideUlwExecuteActivation({
      persona: ATLAS,
      taskText: 'start work on the plan',
      alreadyInjected: false,
      contextText: CONTEXT,
    })
    expect(decision).toEqual({ kind: 'inject', text: CONTEXT })
  })

  it('⑪ 非 atlas → not-atlas（即使任务含意图）', () => {
    expect(decideUlwExecuteActivation({
      persona: 'You are **omo-explore**, a search agent.',
      taskText: 'start work on the plan',
      alreadyInjected: false,
      contextText: CONTEXT,
    })).toEqual({ kind: 'skip', reason: 'not-atlas' })
    expect(decideUlwExecuteActivation({
      persona: undefined,
      taskText: 'start work on the plan',
      alreadyInjected: false,
      contextText: CONTEXT,
    })).toEqual({ kind: 'skip', reason: 'not-atlas' })
  })

  it('⑪ atlas 但任务无工作计划意图 → no-work-intent（普通委派的 对照）', () => {
    expect(decideUlwExecuteActivation({
      persona: ATLAS,
      taskText: 'summarize the repository layout',
      alreadyInjected: false,
      contextText: CONTEXT,
    })).toEqual({ kind: 'skip', reason: 'no-work-intent' })
  })

  it('⑪ atlas + 意图但任务文本为空 → no-task-text', () => {
    expect(decideUlwExecuteActivation({
      persona: ATLAS,
      taskText: '',
      alreadyInjected: false,
      contextText: CONTEXT,
    })).toEqual({ kind: 'skip', reason: 'no-task-text' })
  })

  it('⑪ 已注入过 → already-injected（幂等优先于意图）', () => {
    expect(decideUlwExecuteActivation({
      persona: ATLAS,
      taskText: 'start work on the plan',
      alreadyInjected: true,
      contextText: CONTEXT,
    })).toEqual({ kind: 'skip', reason: 'already-injected' })
  })

  it('⑪ 上下文文档为空 → no-context（不注入空文档）', () => {
    expect(decideUlwExecuteActivation({
      persona: ATLAS,
      taskText: 'start work on the plan',
      alreadyInjected: false,
      contextText: '',
    })).toEqual({ kind: 'skip', reason: 'no-context' })
  })

  it('⑪ hasWorkIntent 大小写不敏感且覆盖全部 marker（词边界内）', () => {
    expect(hasWorkIntent('START WORK on my plan')).toBe(true)
    expect(hasWorkIntent('ultrawork')).toBe(true)
    expect(hasWorkIntent('please run ulw-execute')).toBe(true)
    expect(hasWorkIntent('You are starting an Atlas work session.')).toBe(true)
    expect(hasWorkIntent('just read some files')).toBe(false)
    for (const marker of WORK_INTENT_MARKERS) {
      expect(hasWorkIntent(`prefix ${marker} suffix`)).toBe(true)
    }
  })

  it('⑪ hasWorkIntent 按词边界匹配：真实假阳性反例不得命中（P3-T17 e2e 实测）', () => {
    // 这两个串是 e2e 里真实出现过的「无意图」文本，子串匹配会把它们判成命中
    // ——`ulw` 落在 `SUL-1.0` 里、也落在普通英文词 `would` 里：
    expect(hasWorkIntent(
      '<!-- Source: oh-my-openagent (SUL-1.0), packages/omo-opencode/src/agents/'
      + 'dynamic-agent-policy-sections.ts:7-20. -->',
    )).toBe(false)
    expect(hasWorkIntent('would you kindly read the repository layout')).toBe(false)
    // 委派子会话一定会收到的续作指引（`withContinuableReturnGuidance` 的原文）
    expect(hasWorkIntent(
      'summarize the repository layout in three sentences\n'
      + 'Your parent agent id is "session-x". Before you finish, send your result to that '
      + 'agent with send_message({ agent_id: "session-x", message: "<self-contained result>" }).',
    )).toBe(false)
    // 边界的两侧：连字符不算边界内侧，端点算
    expect(hasWorkIntent('start-work')).toBe(true)
    expect(hasWorkIntent('start-work-extra')).toBe(false)
    expect(hasWorkIntent('ulw')).toBe(true)
    expect(hasWorkIntent('(ulw)')).toBe(true)
    expect(hasWorkIntent('xulw')).toBe(false)
  })

  it('⑪ buildInjectionText 采用上游形态 `\\n\\n---\\n<marker>\\n<context>`', () => {
    expect(buildInjectionText('BODY')).toBe(`\n\n---\n${ULW_EXECUTE_CONTEXT_MARKER}\nBODY`)
    const message = buildInjectionMessage('BODY')
    expect(message.role).toBe('user')
    expect(message.content).toEqual([{ type: 'text', text: buildInjectionText('BODY') }])
    expect(message.source).toEqual({
      kind: 'plugin',
      plugin: ULW_EXECUTE_PLUGIN,
      form: 'instructions',
    })
    expect(typeof message.id).toBe('string')
    expect(message.id.length).toBeGreaterThan(0)
    // 每条注入必须是新 id（inbox 校验 pending-id 唯一）
    expect(buildInjectionMessage('BODY').id).not.toBe(message.id)
  })

  it('⑪ formatUlwExecuteLine / formatUlwExecuteFailureLine / planNameOf', () => {
    expect(formatUlwExecuteLine('branch=x')).toBe('[omo-hooks] ulw-execute: branch=x')
    expect(formatUlwExecuteFailureLine('listener failed', new Error('boom')))
      .toContain('[omo-hooks] ulw-execute: listener failed: ')
    expect(planNameOf('/w/.omo/plans/alpha.md')).toBe('alpha')
    expect(planNameOf('C:\\w\\.omo\\plans\\beta.md')).toBe('beta')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑫ 载荷读取（防御式）
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — 载荷读取（防御式叶子读）', () => {
  it('⑫ readPreStepAgent / readAgentSession 对畸形输入返回 undefined', () => {
    expect(readPreStepAgent(undefined)).toBeUndefined()
    expect(readPreStepAgent({})).toBeUndefined()
    expect(readPreStepAgent({ agent: 'nope' })).toBeUndefined()
    const agent = { session: { header: {} } }
    expect(readPreStepAgent({ agent })).toBe(agent)
    expect(readAgentSession(agent as never)).toBe(agent.session)
    expect(readAgentSession(undefined)).toBeUndefined()
  })

  it('⑫ readDelegationTaskText 只取第一条 user 消息，并在续作指引处截断', () => {
    // 真实形态：任务块 + dsh 的续作指引同处一条 user 消息。
    const payload = {
      messages: [
        { role: 'user', content: [
          { type: 'text', text: 'summarize the repository layout' },
          {
            type: 'text',
            text: 'Your parent agent id is "ses_x". Before you finish, send your result to that '
              + 'agent with send_message({ agent_id: "ses_x", message: "<result>" }).',
          },
        ] },
        // 后续 pre-step 的 messages 会带上别的插件注入段——它们**不是**任务文本。
        { role: 'user', content: [{ type: 'text', text: '## Hard Blocks (NEVER violate)\n- Start work only when requested' }] },
      ],
    }
    expect(readDelegationTaskText(payload)).toBe('summarize the repository layout')
    // 插件来源的注入段（含本 hook 自己的 job 通知，其 label 就是 `ulw-execute: alpha`）
    // 一律不是任务文本——这是 e2e 实测的自指假阳性来源。
    expect(readDelegationTaskText({ messages: [
      { role: 'user', source: { kind: 'plugin', plugin: 'tool-jobs' }, content: [
        { type: 'text', text: 'background job ulw-execute-2 (ulw-execute: ulw-execute: alpha) finished' },
      ] },
      { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'real task' }] },
    ] })).toBe('real task')
    expect(readDelegationTaskText({ messages: [
      { role: 'user', source: { kind: 'plugin', plugin: 'omo-agents' }, content: [
        { type: 'text', text: '## Hard Blocks\n- Start work only when requested' },
      ] },
    ] })).toBe('')
    // 没有指引时原样返回；空/畸形输入 → 空串
    expect(readDelegationTaskText({ messages: [{ role: 'user', content: [{ type: 'text', text: 'start work' }] }] }))
      .toBe('start work')
    expect(readDelegationTaskText(undefined)).toBe('')
    expect(readDelegationTaskText({ messages: [{ role: 'assistant', content: [{ type: 'text', text: 'x' }] }] })).toBe('')
    expect(readDelegationTaskText({ messages: [{ role: 'user', content: [{ type: 'text', text: '' }] }] })).toBe('')
  })

  it('⑫ readTaskText 只收 user 消息的 text 块，畸形条目跳过', () => {
    expect(readTaskText(undefined)).toBe('')
    expect(readTaskText({})).toBe('')
    expect(readTaskText({ messages: 'nope' })).toBe('')
    expect(readTaskText({
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'ignored' }] },
        { role: 'user', content: [{ type: 'image', text: 'ignored' }, { type: 'text', text: 'first' }] },
        null,
        { role: 'user', content: 'nope' },
        { role: 'user', content: [{ type: 'text', text: 'second' }] },
      ],
    })).toBe('first\nsecond')
  })

  it('⑫ hasContextMarkerInSession 扫 ownEvents 的 user/message 文本块', () => {
    const without = fakeSession({ withDescriptor: false })
    expect(hasContextMarkerInSession(without)).toBe(false)
    const withMarker = fakeSession({
      withDescriptor: false,
      extraEvents: [
        { type: 'user/message', data: { content: [{ type: 'text', text: `x${ULW_EXECUTE_CONTEXT_MARKER}y` }] } },
      ],
    })
    expect(hasContextMarkerInSession(withMarker)).toBe(true)
    // 上游原文 marker 不算（命名锚点已改写）
    const upstreamOnly = fakeSession({
      withDescriptor: false,
      extraEvents: [
        { type: 'user/message', data: { content: [{ type: 'text', text: UPSTREAM_CONTEXT_INFO_MARKER }] } },
      ],
    })
    expect(hasContextMarkerInSession(upstreamOnly)).toBe(false)
    expect(hasContextMarkerInSession(undefined)).toBe(false)
    expect(hasContextMarkerInSession({
      ownEvents: () => {
        throw new Error('boom')
      },
    })).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑬ listener 行为（注入 / 不注入 / 异常吞没 / 幂等）
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — listener 行为', () => {
  let testDirectory = ''

  beforeEach(() => {
    testDirectory = join(tmpdir(), `ulw-execute-listener-${randomUUID()}`)
    mkdirSync(join(testDirectory, '.omo', 'plans'), { recursive: true })
    writeFileSync(
      join(testDirectory, '.omo', 'plans', 'alpha.md'),
      '## TODOs\n- [ ] 1. First\n- [ ] 2. Second\n',
    )
  })

  afterEach(() => {
    if (existsSync(testDirectory)) rmSync(testDirectory, { recursive: true, force: true })
  })

  it('⑬ 委派 atlas + 工作计划意图 → 注入一条消息，且仍 next()', async () => {
    const session = atlasSession(testDirectory)
    const { payload, injected } = injectingPayload(session, ['start work on the plan'])
    const { next, calls } = nextDouble()
    const listener: PreStepListener = createUlwExecuteListener(depsWithInventory(testDirectory))
    const result = await listener(payload, next)

    expect(result).toBe(NEXT_RESULT)
    expect(calls()).toBe(1)
    expect(injected).toHaveLength(1)
    const message = injected[0] as { content: Array<{ text: string }>; source: { plugin: string } }
    expect(message.source.plugin).toBe(ULW_EXECUTE_PLUGIN)
    expect(message.content[0].text).toContain(ULW_EXECUTE_CONTEXT_MARKER)
    expect(message.content[0].text).toContain('## Auto-Selected Plan')
    expect(message.content[0].text).toContain('**Plan**: alpha')
  })

  it('⑬ 普通委派（含意图但非 atlas）→ 不注入', async () => {
    const session = siblingSession(testDirectory)
    const { payload, injected } = injectingPayload(session, ['start work on the plan'])
    const { next, calls } = nextDouble()
    await createUlwExecuteListener(deps())(payload, next)
    expect(injected).toHaveLength(0)
    expect(calls()).toBe(1)
  })

  it('⑬ atlas 委派但无工作计划意图 → 不注入（对照）', async () => {
    const session = atlasSession(testDirectory)
    const { payload, injected } = injectingPayload(session, ['summarize the repository'])
    const { next, calls } = nextDouble()
    await createUlwExecuteListener(deps())(payload, next)
    expect(injected).toHaveLength(0)
    expect(calls()).toBe(1)
  })

  it('⑬ 非委派会话（无 descriptor）→ 不注入、不读清单', async () => {
    const session = fakeSession({ withDescriptor: false })
    const { payload, injected } = injectingPayload(session, ['start work on the plan'])
    const { next, calls } = nextDouble()
    let reads = 0
    const depsWithCounter: UlwExecuteDeps = {
      ...deps(),
      inventoryFor: () => {
        reads += 1
        return EMPTY_PLAN_INVENTORY
      },
    }
    await createUlwExecuteListener(depsWithCounter)(payload, next)
    expect(injected).toHaveLength(0)
    expect(reads).toBe(0)
    expect(calls()).toBe(1)
  })

  it('⑬ 同一会话第二步不再注入（WeakSet 幂等）', async () => {
    const session = atlasSession(testDirectory)
    const listener = createUlwExecuteListener(deps())
    const first = injectingPayload(session, ['start work on the plan'])
    await listener(first.payload, nextDouble().next)
    expect(first.injected).toHaveLength(1)
    const second = injectingPayload(session, ['start work on the plan'])
    await listener(second.payload, nextDouble().next)
    expect(second.injected).toHaveLength(0)
  })

  it('⑬ 会话日志里已有 marker（冷续场景）→ 不注入', async () => {
    const session = atlasSession(testDirectory)
    ;(session.ownEvents as unknown as () => unknown[]) = () => [
      { type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', label: 'x', persona: `You are **${ATLAS_PERSONA_ANCHOR}**.` } },
      { type: 'user/message', data: { content: [{ type: 'text', text: ULW_EXECUTE_CONTEXT_MARKER }] } },
    ]
    const { payload, injected } = injectingPayload(session, ['start work on the plan'])
    await createUlwExecuteListener(deps())(payload, nextDouble().next)
    expect(injected).toHaveLength(0)
  })

  it('⑬ 选中计划 → notepad 脚手架落地 + jobs job 注册（js 在场路）', async () => {
    const session = atlasSession(testDirectory)
    const { payload } = injectingPayload(session, ['start work on the plan'])
    const started: string[] = []
    const jobs: JobsSurface = {
      start: (spec) => {
        spec.run()
        started.push(spec.label)
        return 'ulw-execute-1'
      },
    }
    const logs: string[] = []
    await createUlwExecuteListener(depsWithInventory(testDirectory, { jobs, logs }))(
      payload,
      nextDouble().next,
    )
    expect(started).toEqual(['ulw-execute: alpha'])
    expect(existsSync(join(testDirectory, '.omo', 'notepads', 'alpha', 'learnings.md'))).toBe(true)
    expect(logs.some((line) => line.includes('work session ulw-execute-1 plan=alpha'))).toBe(true)
  })

  it('⑬ jobs 缺席 → 脚手架照常落地 + 日志标 [jobs absent]（降级路）', async () => {
    const session = atlasSession(testDirectory)
    const { payload } = injectingPayload(session, ['start work on the plan'])
    const logs: string[] = []
    await createUlwExecuteListener(depsWithInventory(testDirectory, { logs }))(payload, nextDouble().next)
    expect(existsSync(join(testDirectory, '.omo', 'notepads', 'alpha', 'learnings.md'))).toBe(true)
    expect(logs.some((line) => line.includes('[jobs absent]'))).toBe(true)
  })

  it('⑬ 无 cwd → 不注入（无法做计划发现）', async () => {
    const session = fakeSession({ cwd: '', persona: `You are **${ATLAS_PERSONA_ANCHOR}**.` })
    const { payload, injected } = injectingPayload(session, ['start work on the plan'])
    const { next, calls } = nextDouble()
    await createUlwExecuteListener(deps())(payload, next)
    expect(injected).toHaveLength(0)
    expect(calls()).toBe(1)
  })

  it('⑬ 异常吞没：payload 是 null / agent 无 inject → 只 next()，不抛', async () => {
    const listener = createUlwExecuteListener(deps())
    for (const payload of [null, {}, { agent: null }, { agent: {} }, { agent: { session: null } }]) {
      const { next, calls } = nextDouble()
      await expect(listener(payload, next)).resolves.toBe(NEXT_RESULT)
      expect(calls()).toBe(1)
    }
  })

  it('⑬ 异常吞没：inject 抛错 → 记一行 FAILED，仍 next()（fail open）', async () => {
    const session = atlasSession(testDirectory)
    const payload = {
      agent: {
        session,
        inject: () => {
          throw new Error('inbox rejected')
        },
      },
      messages: [userMessage('start work on the plan')],
    }
    const logs: string[] = []
    const { next, calls } = nextDouble()
    await expect(createUlwExecuteListener(deps({ logs }))(payload, next)).resolves.toBe(NEXT_RESULT)
    expect(calls()).toBe(1)
    expect(logs.some((line) => line.includes('listener failed'))).toBe(true)
  })

  it('⑬ 异常吞没：诊断口自己抛错也不影响 next()', async () => {
    const session = atlasSession(testDirectory)
    const { payload } = injectingPayload(session, ['start work on the plan'])
    const brokenDeps: UlwExecuteDeps = {
      ...deps(),
      log: () => {
        throw new Error('log sink broken')
      },
    }
    const { next, calls } = nextDouble()
    await expect(createUlwExecuteListener(brokenDeps)(payload, next)).resolves.toBe(NEXT_RESULT)
    expect(calls()).toBe(1)
  })

  it('⑬ next() 抛错向上传播（不是本 listener 的错，不该吞）', async () => {
    const session = atlasSession(testDirectory)
    const { payload } = injectingPayload(session, ['start work on the plan'])
    const failingNext = async (): Promise<unknown> => {
      throw new Error('downstream waterfall listener failed')
    }
    await expect(createUlwExecuteListener(deps())(payload, failingNext)).rejects.toThrow(
      'downstream waterfall listener failed',
    )
  })

  it('⑬ 下游抛错 → next() 恰好一次，且第二次调用不可能吞掉它（F-1 盲区钉死）', async () => {
    // The F-1 blind spot: the old body called `delegate()` from INSIDE the try,
    // so a downstream throw was caught and the waterfall was re-entered a second
    // time — a second call that succeeds resolves the waterfall and swallows the
    // real downstream error. This double resolves on its `calls > 1` path (the
    // exact shape the review probe used), so the `rejects` + `calls === 1` pair
    // fails on the old body and passes once `next()` is outside the try.
    const session = atlasSession(testDirectory)
    const { payload } = injectingPayload(session, ['start work on the plan'])
    let calls = 0
    const failingOnceNext = async (): Promise<unknown> => {
      calls += 1
      if (calls > 1) return NEXT_RESULT // a second call would swallow the throw
      throw new Error('downstream waterfall listener failed')
    }
    await expect(createUlwExecuteListener(deps())(payload, failingOnceNext)).rejects.toThrow(
      'downstream waterfall listener failed',
    )
    expect(calls).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑭ 注册面
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — 注册面', () => {
  it('⑭ 注册一个 agent/pre-step listener + 一个 session/disposed 兜底', () => {
    const { ctx, onCalls } = fakeContext()
    registerUlwExecute(ctx, ulwExecuteRow())
    expect(onCalls.map((call) => call.event)).toEqual(['agent/pre-step', 'session/disposed'])
  })

  it('⑭ jobs 缺席且无 ctx.inject → 打一行 NOTE（loud-but-non-fatal）', () => {
    const { ctx } = fakeContext()
    const logged: string[] = []
    const original = console.log
    console.log = (line: unknown) => {
      logged.push(String(line))
    }
    try {
      registerUlwExecute(ctx, ulwExecuteRow())
    } finally {
      console.log = original
    }
    expect(logged.some((line) => line.includes('NOTE: jobs service never appeared'))).toBe(true)
  })

  it('⑭ ctx.inject 武装延迟获取：服务出现 → 记一行 live；缺席 → NOTE', () => {
    const absent = fakeContext({ withInject: true })
    const logsAbsent: string[] = []
    const originalLog = console.log
    console.log = (line: unknown) => {
      logsAbsent.push(String(line))
    }
    try {
      registerUlwExecute(absent.ctx, ulwExecuteRow())
    } finally {
      console.log = originalLog
    }
    expect(logsAbsent.some((line) => line.includes('NOTE: jobs service never appeared'))).toBe(true)

    const present = fakeContext({
      withInject: true,
      hideJobsFromGet: true,
      jobs: { start: () => 'ulw-execute-1' },
    })
    const logsPresent: string[] = []
    console.log = (line: unknown) => {
      logsPresent.push(String(line))
    }
    try {
      registerUlwExecute(present.ctx, ulwExecuteRow())
    } finally {
      console.log = originalLog
    }
    expect(logsPresent.some((line) => line.includes('jobs service observed'))).toBe(true)
  })

  it('⑭ ctx.inject 抛错 → 记一行 FAILED，注册仍完成', () => {
    const onCalls: OnCall[] = []
    const warnings: string[] = []
    const ctx: HooksRegistrationContext = {
      on(event, listener) {
        onCalls.push({ event, listener })
        return () => {}
      },
      get: () => undefined,
      inject: () => {
        throw new Error('inject broken')
      },
    }
    const originalWarn = console.warn
    console.warn = (line: unknown) => {
      warnings.push(String(line))
    }
    try {
      registerUlwExecute(ctx, ulwExecuteRow())
    } finally {
      console.warn = originalWarn
    }
    expect(onCalls.map((call) => call.event)).toEqual(['agent/pre-step', 'session/disposed'])
    expect(warnings.some((line) => line.includes('ctx.inject("jobs") failed'))).toBe(true)
  })

  it('⑭ 注册的 listener 端到端跑通（真实 registrar → 注入）', async () => {
    const directory = join(tmpdir(), `ulw-execute-registrar-${randomUUID()}`)
    mkdirSync(join(directory, '.omo', 'plans'), { recursive: true })
    writeFileSync(join(directory, '.omo', 'plans', 'alpha.md'), '## TODOs\n- [ ] 1. First\n')
    try {
      const { ctx, onCalls } = fakeContext()
      registerUlwExecute(ctx, ulwExecuteRow())
      const call = onCalls.find((candidate) => candidate.event === 'agent/pre-step')
      if (call === undefined) throw new Error('registrar did not wire agent/pre-step')
      const session = atlasSession(directory)
      const { payload, injected } = injectingPayload(session, ['start work on the plan'])
      await call.listener(payload, nextDouble().next)
      expect(injected).toHaveLength(1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
