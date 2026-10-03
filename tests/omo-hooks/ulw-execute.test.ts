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
// The REAL product of the omo-commands handler — see `commandMessage()` below
// for why this cross-package import is legal in a test but not at runtime.
import { renderUlwExecuteInstruction } from '../../patches/omo-dsh/omo-commands/src/commands/ulw-execute.ts'
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
  hasCommandTemplateMarker,
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
// The SHARED identity marker — imported, never reimplemented in this suite.
import { dshRuntimeShape } from '../../patches/omo-dsh/omo-hooks/src/dsh-runtime-shape.ts'
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
  PREFLIGHT_REJECT_MARKERS,
  buildNotepadHeader,
  classifyStartWorkJobFailure,
  readPlanInventory,
  readPlanProgress,
  readStartWorkJobOutcome,
  scaffoldNotepad,
  startWorkJob,
  type JobsSurface,
  type StartWorkJobHandleLike,
  type StartWorkJobHooksLike,
  type StartWorkJobSpecLike,
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

  it('⑨ createInventoryReader 按 cwd 记忆化（同一缓存寿命内只读一次）', () => {
    let reads = 0
    const loaded: string[] = []
    const reader = createInventoryReader((directory) => {
      reads += 1
      return { entries: [planEntry(join(directory, 'x.md'), 0, 1)], scannedDirs: [directory] }
    }, (directory) => loaded.push(directory))
    const first = reader.inventoryFor('/a')
    const second = reader.inventoryFor('/a')
    expect(first).toBe(second)
    expect(reads).toBe(1)
    expect(loaded).toEqual(['/a'])
    reader.inventoryFor('/b')
    expect(reads).toBe(2)
    expect(loaded).toEqual(['/a', '/b'])
    // F3: the memo is NOT permanent. `invalidate` is the boundary the registrar
    // drives from `session/disposed`; the NEXT read re-reads and re-announces.
    reader.invalidate('/a')
    expect(reader.inventoryFor('/a')).not.toBe(first)
    expect(reads).toBe(3)
    expect(loaded).toEqual(['/a', '/b', '/a'])
    // Only the invalidated key is dropped: `/b` still hits its memo.
    reader.inventoryFor('/b')
    expect(reads).toBe(3)
    // `clear` drops everything (the fiber-teardown floor).
    reader.clear()
    reader.inventoryFor('/b')
    expect(reads).toBe(4)
  })

  it('⑨ createInventoryReader 吞掉读面抛错（空清单）', () => {
    const reader = createInventoryReader(() => {
      throw new Error('permission denied')
    })
    expect(reader.inventoryFor('/a')).toEqual(EMPTY_PLAN_INVENTORY)
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
// ⑯ P4-T10 命令模板轨的**生产可达性**（穿过 createUlwExecuteListener）
//
// 上一节的纯函数用例只能证明判定函数的取值表，不能证明真实链路上轨 B 会被走到。
// 本节用 omo-commands 的**真实渲染产物**当首条 user 消息，穿过真正的 listener，
// 断言注入次数。
//
// ⚠️ 跨包 import 只在测试里合法：两个补丁包各自独立安装，运行期相互 import 会在
// 对方缺席时炸掉整包加载。测试 import 缺失文件只是测试失败，不是坏安装。
// ═══════════════════════════════════════════════════════════════════════════

describe('P4-T10 ulw-execute — 命令模板轨穿过真实 listener（生产可达性）', () => {
  /**
   * The REAL product of `omo-commands`'s handler — same renderer the command
   * calls, same fixed clock. Restating the template here would defeat the whole
   * purpose: the point is that the *command's own output* reaches the hook, so a
   * change to the template that breaks an R-10 marker turns THIS red.
   */
  function commandMessage(): string {
    return renderUlwExecuteInstruction(
      {
        rawInput: 'alpha --ship',
        agent: { id: 'session-conductor-1', followup: () => {} },
      } as never,
      () => '2026-05-11T00:00:00.000Z',
    )
  }

  function withPlanDirectory<T>(body: (directory: string, listener: PreStepListener) => Promise<T>): Promise<T> {
    const directory = join(tmpdir(), `ulw-execute-t10-${randomUUID()}`)
    mkdirSync(join(directory, '.omo', 'plans'), { recursive: true })
    writeFileSync(join(directory, '.omo', 'plans', 'alpha.md'), '## TODOS\n- [x] 1. First\n- [ ] 2. Second\n')
    const { ctx, onCalls } = fakeContext()
    registerUlwExecute(ctx, ulwExecuteRow())
    const pre = onCalls.find((candidate) => candidate.event === 'agent/pre-step')
    if (pre === undefined) throw new Error('registrar wiring incomplete')
    return body(directory, pre.listener as PreStepListener).finally(() => {
      rmSync(directory, { recursive: true, force: true })
    })
  }

  it('atlas 子会话形态：首条 user 消息 = 命令模板真实产物 → 恰好注入一次', async () => {
    await withPlanDirectory(async (directory, listener) => {
      const { payload, injected } = injectingPayload(atlasSession(directory), [commandMessage()])
      await listener(payload, nextDouble().next)
      expect(injected).toHaveLength(1)
      // 注入的不是模板原文，而是 H-32 构建的上下文文档 —— 命令消息是**信号**，
      // 不是要喂回模型的内容。
      const [message] = injected as [{ readonly content: readonly [{ readonly text: string }] }]
      expect(message.content[0].text).not.toBe(commandMessage())
      // …and it names the plan that is actually on disk, i.e. the context was
      // BUILT rather than stubbed.
      expect(message.content[0].text).toContain('alpha')
    })
  })

  it('同会话第二 step：幂等，不再注入（共享幂等键的生产证据）', async () => {
    await withPlanDirectory(async (directory, listener) => {
      // ⚠️ 同一个 session **对象**贯穿两步：幂等键是 registrar 的会话级 WeakMap +
      // 会话日志审计，两条都按会话记账。换一个新 session 对象等于换了一个会话，
      // 那样第二步当然会再注入 —— 那测的是别的东西（本例第一次就是这么写错的）。
      const session = atlasSession(directory)
      const first = injectingPayload(session, [commandMessage()])
      await listener(first.payload, nextDouble().next)
      expect(first.injected).toHaveLength(1)

      // 第二步是新 payload（新的 pre-step 事件），但会话没变。
      const second = injectingPayload(session, [commandMessage()])
      await listener(second.payload, nextDouble().next)
      expect(second.injected).toHaveLength(0)
    })
  })

  it('对照：指挥者会话形态（无 descriptor）**零注入**，且这是 by-design', async () => {
    // 语义更正后的真实形态（BLOCKER-1）。指挥者会话没有 descriptor，
    // `runUlwExecuteStep` 在 `!identity.found` 处早退 —— 与上游「没有命令 marker
    // 时不激活」同形，属**设计如此**。命令行的激活发生在指挥者**委派 atlas**
    // 之后（marker 作为委派任务文本抵达 atlas 子会话，见上一节）。
    //
    // 所以这一条**不是**缺陷断言，而是「不要试图靠放开身份门来让编排者会话激活」
    // 的守卫。
    //
    // ⚠️ 守卫的**强度已实测**，别把它当更强的守卫读：把 `!identity.found` 早退
    // 单独去掉，本例**仍然是绿的**。原因是人格门是**双份**的 —— 早退之外，
    // `runUlwExecuteStep` 里 `built` 的三元式也按 `isAtlasPersona` 短路，于是
    // 判定函数收到的是空 `contextText`，走 `no-context` 而不是注入，净结果不变。
    // 必须**两处同时**去掉（早退 + 三元式 + 判定函数的 bypass）本例才会从 0 变 1
    // 而变红（已实测）。这是纵深防御，但也意味着单点回归不会被这里抓到；R-10
    // marker 漂移同样抓不到（两条轨重叠，词表仍然命中）—— 抓 marker 漂移的是
    // tests/omo-commands/ulw-execute.test.ts 的跨包相等断言，不是本例。
    await withPlanDirectory(async (directory, listener) => {
      const noDescriptor = { header: { cwd: directory, id: 'ses_conductor' } }
      const { payload, injected } = injectingPayload(noDescriptor, [commandMessage()])
      await listener(payload, nextDouble().next)
      expect(injected).toHaveLength(0)
    })
  })

  it('atlas 子会话但任务文本**无 marker 无意图** → 不注入（轨 B 没把门开成永远真）', async () => {
    await withPlanDirectory(async (directory, listener) => {
      const { payload, injected } = injectingPayload(atlasSession(directory), ['please tidy the README wording'])
      await listener(payload, nextDouble().next)
      expect(injected).toHaveLength(0)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑪ 激活检测（纯函数）—— 无上游对应（DSH 原生形态）
// ═══════════════════════════════════════════════════════════════════════════

describe('P3-T17 ulw-execute — 激活检测（纯函数，DSH 原生信号）', () => {
  const ATLAS = `You are **${ATLAS_PERSONA_ANCHOR}**, the master orchestrator.`
  const CONTEXT = '## Auto-Selected Plan\n**Plan**: alpha'
  // ⚠️ The CLOSE tag is deliberately a local literal, not an R-10 constant. The
  // frozen upstream check (start-work-hook.ts:170-175) matches the OPEN tag only —
  // `text.includes('<session-context>')` — so the close tag is not part of the
  // interface contract and `constants.ts` correctly does not register one. The
  // omo-commands side declares it only because its template has to emit it.
  const CLOSE = '</session-context>'

  it('⑪ 委派 atlas + 工作计划意图 + 有上下文 → inject', () => {
    const decision = decideUlwExecuteActivation({
      persona: ATLAS,
      taskText: 'start work on the plan',
      alreadyInjected: false,
      contextText: CONTEXT,
    })
    expect(decision).toEqual({ kind: 'inject', text: CONTEXT })
  })

  it('⑪ marker 是**合取**：只带一个 marker 的普通文本不算模板产物（防假阳性）', () => {
    // 上游 start-work-hook.ts:170-175 是 `||` 提前 return，即两个 marker 都必须
    // 命中。任一即可命中的话，一段恰好提到 `<session-context>` 的普通文本就算激活
    // —— 那是激活门的假阳性，正是本 hook 明确不该有的方向（漏注入 ≠ 错注入）。
    expect(hasCommandTemplateMarker(TEMPLATE_SESSION_CONTEXT_OPEN)).toBe(false)
    expect(hasCommandTemplateMarker(TEMPLATE_HEADER_MARKER)).toBe(false)
    expect(hasCommandTemplateMarker('the <session-context> block is optional here')).toBe(false)
  })

  it('⑪ 两条轨在真实模板上**重叠**（记录事实，不是缺陷）', () => {
    // ⚠️ 这条断言最初写成「最小模板产物不命中词表，所以轨 B 确实替代了词表」——
    // 它**是假的**。`TEMPLATE_HEADER_MARKER`（`You are starting an Atlas work
    // session.`）自身就含 `atlas work session`，而那是 WORK_INTENT_MARKERS 的一
    // 条。所以对**任何**真实的命令模板产物，词表也会命中，两条轨的门并不互斥。
    //
    // 后果要说清楚：**对真实模板产物，轨 B 与轨 A 的判定结果相同**。轨 B 的价值
    // 在**纯 marker 文本**上（词表不命中、marker 命中），那才是两轨可区分的输入，
    // 而那种文本在生产里是否出现取决于指挥者怎么委派 —— 不能断言。所以这里只钉
    // 重叠这个事实本身，**不**断言"轨 B 不查词表"。
    const templateProduct = `${TEMPLATE_HEADER_MARKER}\n${TEMPLATE_SESSION_CONTEXT_OPEN}\nSession ID: s\n${CLOSE}`
    expect(hasWorkIntent(templateProduct)).toBe(true)
    // 记录重叠的具体来源，而不是笼统地说"碰巧"：是 marker 文本里那句
    // 'atlas work session' 命中了词表。若将来 marker 改写而词表没跟着改，这条
    // 断言变红 —— 那正是需要重新评估两轨关系的时候。
    // 大小写无关：marker 里是 "Atlas"，词表条目是全小写，而匹配带 `iu` 标志，
    // 所以这里用小写化后的 toContain，否则会在正确状态上误红。
    expect(templateProduct.toLowerCase()).toContain('atlas work session')
    expect(WORK_INTENT_MARKERS).toContain('atlas work session')
  })

  it('⑪ 身份门是**两轨共享前提**，marker 不能替代它（BLOCKER-1 语义更正）', () => {
    // 早一版把 `!viaCommandTemplate &&` 加在 `isAtlasPersona` 前面，理由写作
    // 「命令跑在指挥者会话里、那里没有 atlas persona」。那个理由与监听器结构
    // 矛盾：`runUlwExecuteStep` 在 `!identity.found` 处就 return，无 descriptor 的
    // 指挥者会话**根本到不了**本函数。所以那条路径在生产里不可达，纯函数用例假装
    // 它可达就是假证据。身份门恢复无条件，轨 B 只替代第 ④ 条意图门。
    expect(decideUlwExecuteActivation({
      persona: 'You are **omo-sisyphus**, the orchestrator.',
      taskText: `${TEMPLATE_HEADER_MARKER}\n${TEMPLATE_SESSION_CONTEXT_OPEN}\nSession ID: s\n${CLOSE}`,
      alreadyInjected: false,
      contextText: CONTEXT,
    })).toEqual({ kind: 'skip', reason: 'not-atlas' })
    // 非 atlas 的普通会话同样如此（身份门没有被这次改动动过）。
    expect(decideUlwExecuteActivation({
      persona: 'You are **omo-explore**, a search agent.',
      taskText: 'summarize the repository layout',
      alreadyInjected: false,
      contextText: CONTEXT,
    })).toEqual({ kind: 'skip', reason: 'not-atlas' })
  })

  it('⑪ 幂等键两轨共享且位置不动（纯函数层）', () => {
    // 回归守卫：两轨合流后读**同一个** `alreadyInjected` 输入，短路仍在
    // 「身份 → 幂等 → 内容」的同一位置，跳过理由仍是既有那条，没有新分支。
    const templateProduct = `${TEMPLATE_HEADER_MARKER}\n${TEMPLATE_SESSION_CONTEXT_OPEN}\nSession ID: s\n${CLOSE}`
    expect(decideUlwExecuteActivation({
      persona: ATLAS,
      taskText: templateProduct,
      alreadyInjected: true,
      contextText: CONTEXT,
    })).toEqual({ kind: 'skip', reason: 'already-injected' })
    // 纯 marker 文本（词表不命中）+ 幂等 → 幂等先于内容，仍是 already-injected，
    // 证明轨 B 没有把幂等挤到第 ④ 条之后。
    expect(decideUlwExecuteActivation({
      persona: ATLAS,
      taskText: `${TEMPLATE_SESSION_CONTEXT_OPEN}\n${CLOSE}`,
      alreadyInjected: true,
      contextText: CONTEXT,
    })).toEqual({ kind: 'skip', reason: 'already-injected' })
  })

  it('⑪ 轨 A 原生委派路径无回归', () => {
    expect(decideUlwExecuteActivation({
      persona: ATLAS,
      taskText: 'start work on the plan',
      alreadyInjected: false,
      contextText: CONTEXT,
    })).toEqual({ kind: 'inject', text: CONTEXT })
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

  it('⑬ 同一会话第二步不再注入（会话内 WeakMap 幂等）', async () => {
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

  it('⑭ session/disposed 按 cwd 失效清单缓存：dispose 后再激活能发现新计划（F3）', async () => {
    const directory = join(tmpdir(), `ulw-execute-invalidate-${randomUUID()}`)
    mkdirSync(join(directory, '.omo', 'plans'), { recursive: true })
    writeFileSync(join(directory, '.omo', 'plans', 'alpha.md'), '## TODOs\n- [ ] 1. First\n')
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (line: unknown) => {
      warnings.push(String(line))
    }
    try {
      const { ctx, onCalls } = fakeContext()
      registerUlwExecute(ctx, ulwExecuteRow())
      const pre = onCalls.find((candidate) => candidate.event === 'agent/pre-step')
      const disposed = onCalls.find((candidate) => candidate.event === 'session/disposed')
      if (pre === undefined || disposed === undefined) throw new Error('registrar wiring incomplete')

      const activate = async (session: unknown): Promise<number> => {
        const { payload, injected } = injectingPayload(session, ['start work on the plan'])
        await pre.listener(payload, nextDouble().next)
        return injected.length
      }
      const loads = (): string[] => warnings.filter((line) => line.includes('inventory loaded'))

      const sessionA = atlasSession(directory)
      expect(await activate(sessionA)).toBe(1)
      expect(loads()).toHaveLength(1)
      expect(loads()[0]).toContain('1 plan(s)')

      // Prometheus creates a second plan while the process stays alive.
      writeFileSync(join(directory, '.omo', 'plans', 'beta.md'), '## TODOs\n- [x] 1. Second\n')

      // A NEW child session on the SAME cwd still hits the memo: the cache is
      // keyed by cwd on the registration, not by session.
      expect(await activate(atlasSession(directory))).toBe(1)
      expect(loads()).toHaveLength(1)

      // F3: `session/disposed` invalidates that cwd, so the next activation
      // re-reads the plan directory and the new plan becomes visible.
      disposed.listener(sessionA)
      expect(await activate(atlasSession(directory))).toBe(1)
      expect(loads()).toHaveLength(2)
      expect(loads()[1]).toContain('2 plan(s)')

      // A malformed/absent payload is a no-op, never a throw (discipline ②).
      expect(() => disposed.listener(undefined)).not.toThrow()
      expect(() => disposed.listener({ header: {} })).not.toThrow()
    } finally {
      console.warn = originalWarn
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑮ P4.5-T4 — `ctx.jobs` 存储面的 DUAL-SHAPE 行为（live-state.ts 的 fork）
//
// 每组场景在**两个形状**上各跑一遍：v1（0.1.5，无 `events` 键）与 v2（0.2.x，
// 有 `events` 键）。形状判定**不在测试里重写**——测试构造形状，然后断言生产
// 代码经共享标记 `dshRuntimeShape` 取到的结果，以及 owner / 终态键的落点。
// 上面的 ⑧ 组是 P3-T17 的 v1 用例，**一条都没改**；本组是它的 v2 对偶 +
// 双形状参数化。
// ═══════════════════════════════════════════════════════════════════════════

/** What one `start()` call handed us, captured off the REAL spec object. */
interface DualStartCall {
  readonly kind: string
  readonly label: string
  readonly owner: unknown
  readonly specKeys: readonly string[]
  /** What `run` received: the JobHandle on v2, nothing on v1 (arity fork). */
  readonly handle: StartWorkJobHandleLike | undefined
  /** The producer hooks — `done` is awaited by the test, never unwrapped here. */
  readonly hooks: StartWorkJobHooksLike
}

/**
 * A fake registry whose shape differs in exactly ONE key: `events`. It mimics
 * the real jobs-local `start()` in the three ways this hook depends on:
 *   * v2 hands `run` a JobHandle, v1 hands it nothing (types.ts:157 vs the
 *     0.1.5 no-arg form — citations in live-state.ts);
 *   * v2 refuses a NON-string owner with the registry's verbatim `:365` message,
 *     interpolated like the upstream template literal, so a wrong owner shape
 *     really does reject here the way it does on a real 0.2.x machine;
 *   * it returns a `<kind>-N` id.
 * Nothing else about the real registry is simulated, and nothing here is offered
 * as fact about dsh — the mirror citations carry that, and the real-machine half
 * is the canary evidence in .omo/evidence/p45t4/.
 */
function dualRegistry(
  shape: 'v1' | 'v2',
  options: { throwOnStart?: (spec: StartWorkJobSpecLike) => Error } = {},
): { jobs: JobsSurface; calls: DualStartCall[] } {
  const calls: DualStartCall[] = []
  // Both handle members THROW if ever called: this port must not append to the
  // ring or write progress, so a misuse fails loudly instead of passing quietly.
  const handle: StartWorkJobHandleLike = {
    id: 'ulw-execute-1',
    append: () => { throw new Error('this port must never append to the ring') },
    updateProgress: () => { throw new Error('this port must never write progress') },
  }
  const start = (spec: StartWorkJobSpecLike): string => {
    if (options.throwOnStart !== undefined) throw options.throwOnStart(spec)
    // v2 mimics jobs-local:357-367 `resolveOwner`: a non-string owner misses the
    // `agents.get(session)` lookup and throws the interpolated :365 message.
    if (shape === 'v2' && typeof spec.owner !== 'string') {
      throw new Error(`session "${String(spec.owner)}" has no live agent (background job owner must be live)`)
    }
    const received = shape === 'v2' ? handle : undefined
    const hooks = spec.run(received)
    calls.push({
      kind: spec.kind,
      label: spec.label,
      owner: spec.owner,
      specKeys: Object.keys(spec).sort(),
      handle: received,
      hooks,
    })
    return `ulw-execute-${calls.length}`
  }
  // THE ONLY structural difference between the two faces is the `events` key.
  const jobs: JobsSurface = shape === 'v2'
    ? { start, events: { subscribe: () => () => {} } }
    : { start }
  return { jobs, calls }
}

describe.each([['v1'], ['v2']] as const)('P4.5-T4 ulw-execute — ctx.jobs DUAL-SHAPE 存储面 [%s]', (shape) => {
  let testDirectory = ''
  const sessionId = 'ses_t4_dual'
  const liveAgent = { id: 'agent-t4', session: { header: { id: sessionId } } }

  beforeEach(() => {
    testDirectory = join(tmpdir(), `ulw-execute-dual-${shape}-${randomUUID()}`)
    mkdirSync(testDirectory, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDirectory)) rmSync(testDirectory, { recursive: true, force: true })
  })

  it(`⑮ 形状前提：${shape} 面被共享 dshRuntimeShape 判为 ${shape}`, () => {
    const { jobs } = dualRegistry(shape)
    // Imported, not reimplemented — the SAME shared predicate the two other
    // touch points use (the cross-touchpoint half is pinned in
    // tests/omo-hooks/dsh-runtime-shape-consistency.test.ts).
    expect(dshRuntimeShape(jobs)).toBe(shape)
  })

  it(`⑮ ${shape}: 成功启动 → jobId 非空 + degraded:false + 脚手架落地 + 无降级日志`, () => {
    const { jobs, calls } = dualRegistry(shape)
    const logs: string[] = []
    const result = startWorkJob({ jobs, directory: testDirectory, planName: 'alpha', sessionId, agent: liveAgent, log: (l) => logs.push(l) })

    expect(result.jobId).toBe('ulw-execute-1')
    expect(result.degraded).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0].kind).toBe('ulw-execute')
    expect(calls[0].label).toBe('ulw-execute: alpha')
    // 成功态不写任何降级行（C4：成功必须与两种降级在日志上可分）。
    expect(logs.filter((l) => /degraded|absent|rejected|failed/.test(l))).toEqual([])
    expect(existsSync(join(testDirectory, '.omo', 'notepads', 'alpha', 'learnings.md'))).toBe(true)
  })

  it(`⑮ ${shape}: owner 逐字断言 — ${shape === 'v1' ? '活 Agent 对象本体（同一引用）' : 'sessionId 字符串（逐字相等）'}`, () => {
    const { jobs, calls } = dualRegistry(shape)
    const result = startWorkJob({ jobs, directory: testDirectory, planName: 'alpha', sessionId, agent: liveAgent })
    expect(result.degraded).toBe(false)
    expect(calls).toHaveLength(1)
    if (shape === 'v1') {
      // 同一引用：不是副本，也不是它的 session。
      expect(calls[0].owner).toBe(liveAgent)
      expect(calls[0].owner).not.toBe(sessionId)
    } else {
      // 逐字符串：不是 `{ id }`，不是 Agent 对象。
      expect(calls[0].owner).toBe(sessionId)
      expect(typeof calls[0].owner).toBe('string')
      expect(calls[0].owner).not.toBe(liveAgent)
    }
  })

  // HONEST SCOPE (review F5): the handle this test inspects is the one the MOCK
  // decided to pass (`const received = shape === 'v2' ? handle : undefined`), so
  // this case proves only that the port returns valid hooks when its `start` is
  // invoked WITH a handle (v2) and WITHOUT one (v1) — i.e. the zero-parameter
  // closure tolerates both call shapes. It is NOT evidence of dsh's real arity;
  // that evidence is the real-machine `D-run-arity` row in
  // `.omo/evidence/p45t4/logs/T4-scenario.ndjson` (`argType:"object"`,
  // `id:"t4probe-1"`). The name says which.
  it(`⑮ ${shape}: ${shape === 'v2' ? 'mock 带 JobHandle 调用 start 时端口照常返回 hooks（真机 arity 见 canary D-run-arity）' : 'mock 不带参数调用 start 时端口照常返回 hooks'}`, () => {
    const { jobs, calls } = dualRegistry(shape)
    const result = startWorkJob({ jobs, directory: testDirectory, planName: 'alpha', sessionId, agent: liveAgent })
    expect(calls).toHaveLength(1)
    expect(result.degraded).toBe(false)
    expect(result.jobId).toBe('ulw-execute-1')
    if (shape === 'v2') {
      expect(calls[0].handle).toBeDefined()
      expect(calls[0].handle?.id).toBe('ulw-execute-1')
    } else {
      expect(calls[0].handle).toBeUndefined()
    }
  })

  it(`⑮ ${shape}: 终态载荷键名 — ${shape === 'v2' ? 'result（不是 output）' : 'output（不是 result）'}；双读读出同一句`, async () => {
    const { jobs, calls } = dualRegistry(shape)
    const result = startWorkJob({ jobs, directory: testDirectory, planName: 'alpha', sessionId, agent: liveAgent })
    expect(calls).toHaveLength(1)
    const outcome = await calls[0].hooks.done
    const outcomeKeys = Object.keys(outcome).sort()
    if (shape === 'v2') {
      expect(outcomeKeys).toEqual(['result', 'status'])
      expect(outcome.result).toBeDefined()
      expect(outcome.output).toBeUndefined()
    } else {
      expect(outcomeKeys).toEqual(['output', 'status'])
      expect(outcome.output).toBeDefined()
      expect(outcome.result).toBeUndefined()
    }
    // THE DOUBLE READ: one expression, both generations, identical content.
    const fact = readStartWorkJobOutcome(outcome)
    expect(fact).toContain('plan=alpha session=ses_t4_dual')
    expect(fact).toContain(`notepad=${result.scaffold.directory}`)
    expect(fact).toContain('created=[learnings.md,decisions.md,issues.md,problems.md]')
    expect(outcome.status).toBe('completed')
  })

  it(`⑮ ${shape}: 服务缺席 → degraded:true + 日志 jobs service absent + 脚手架照常落地`, () => {
    const logs: string[] = []
    const result = startWorkJob({ jobs: undefined, directory: testDirectory, planName: 'alpha', sessionId, agent: liveAgent, log: (l) => logs.push(l) })
    expect(result.jobId).toBeUndefined()
    expect(result.degraded).toBe(true)
    expect(result.scaffold.created).toEqual([...NOTEPAD_FILES])
    expect(logs.filter((l) => l.includes('jobs service absent'))).toHaveLength(1)
    // 缺席 ≠ 拒绝：这条日志不得带 preflight/rejected 字样。
    expect(logs.join('\n')).not.toMatch(/preflight|rejected/)
  })

  it(`⑮ ${shape}: start 抛非 preflight 异常 → 日志说 start failed，不说 preflight`, () => {
    const { jobs } = dualRegistry(shape, { throwOnStart: () => new Error('ring allocation exploded') })
    const logs: string[] = []
    const result = startWorkJob({ jobs, directory: testDirectory, planName: 'alpha', sessionId, agent: liveAgent, log: (l) => logs.push(l) })
    expect(result.jobId).toBeUndefined()
    expect(result.degraded).toBe(true)
    expect(result.scaffold.created).toEqual([...NOTEPAD_FILES])
    const line = logs.find((l) => l.includes('start failed'))
    expect(line).toBeDefined()
    expect(line).toContain('ring allocation exploded')
    expect(line).not.toContain('preflight')
  })

  it(`⑮ ${shape}: 三态返回值互不相同 + 三态日志互不相同（C4 判定项）`, () => {
    const logsOk: string[] = []
    const logsFailed: string[] = []
    const logsAbsent: string[] = []

    const good = dualRegistry(shape)
    const ok = startWorkJob({ jobs: good.jobs, directory: testDirectory, planName: 'ok', sessionId, agent: liveAgent, log: (l) => logsOk.push(l) })
    const bad = dualRegistry(shape, { throwOnStart: () => new Error('ring allocation exploded') })
    const failed = startWorkJob({ jobs: bad.jobs, directory: testDirectory, planName: 'bad', sessionId, agent: liveAgent, log: (l) => logsFailed.push(l) })
    const absent = startWorkJob({ jobs: undefined, directory: testDirectory, planName: 'absent', sessionId, agent: liveAgent, log: (l) => logsAbsent.push(l) })

    // 返回值：成功 vs 两种降级
    expect(ok.degraded).toBe(false)
    expect(failed.degraded).toBe(true)
    expect(absent.degraded).toBe(true)
    expect(ok.jobId).toBeDefined()
    expect(failed.jobId).toBeUndefined()
    expect(absent.jobId).toBeUndefined()

    // 日志：三态各一句，互不重叠。
    const lineOk = logsOk.join('\n')
    const lineFailed = logsFailed.join('\n')
    const lineAbsent = logsAbsent.join('\n')
    expect(lineOk).toBe('')
    expect(lineFailed).toContain('start failed')
    expect(lineAbsent).toContain('jobs service absent')
    expect(lineFailed).not.toContain('jobs service absent')
    expect(lineAbsent).not.toContain('start failed')
  })

  it(`⑮ ${shape}: 不碰 0.1.5 专属面 — spec 只有四个键，且从不追加 ring`, () => {
    const { jobs, calls } = dualRegistry(shape)
    // handle.append/updateProgress THROW if called, so a misuse fails loudly.
    expect(() => startWorkJob({ jobs, directory: testDirectory, planName: 'alpha', sessionId, agent: liveAgent })).not.toThrow()
    expect(calls).toHaveLength(1)
    expect(calls[0].specKeys).toEqual(['kind', 'label', 'owner', 'run'])
    // No 0.1.5-only job face is invented or consulted by this storage surface.
    const face = jobs as Record<string, unknown>
    for (const legacy of ['alreadyFinishedJobIds', 'kill', 'list', 'get', 'wait', 'remove', 'read']) {
      expect(face[legacy]).toBeUndefined()
    }
  })
})

describe('P4.5-T4 ulw-execute — preflight 分类器（C4 的判定表）', () => {
  it('⑮ 表上每条逐字标记都判为 preflight，并回带命中的标记', () => {
    // Exact count, not a lower bound (review F8): a `>=` here would let an eighth
    // fabricated marker through and still read as "the table is pinned". The real
    // weight of this test is the per-marker loop below, which checks each string
    // individually.
    expect(PREFLIGHT_REJECT_MARKERS.length).toBe(7)
    for (const marker of PREFLIGHT_REJECT_MARKERS) {
      const verdict = classifyStartWorkJobFailure(`some prefix ${marker} some suffix`)
      expect(verdict.preflight).toBe(true)
      if (verdict.preflight === true) expect(verdict.marker).toBe(marker)
    }
  })

  it('⑮ 不在表上的报错判为真实启动失败（不得一律算 preflight）', () => {
    for (const message of ['ring allocation exploded', 'TypeError: x is not a function', '']) {
      expect(classifyStartWorkJobFailure(message).preflight).toBe(false)
    }
  })

  // F7: the `shape === 'v2' ? classify… : {preflight:false}` guard inside
  // startWorkJob had NO assertion — flipping it to classify unconditionally kept
  // the whole suite green, because no v1 mock ever threw a v2 marker string.
  // This test throws one ON PURPOSE. The 0.1.5 error strings are unre-verified
  // (H2), so a v1 throw must NEVER be dressed up as a 0.2.x preflight rejection
  // just because its text happens to collide with a transcribed 0.2.x marker.
  it('⑮ v1 face 抛一条含 v2 逐字标记的错 → 仍判 start failed，绝不判 preflight', () => {
    for (const marker of PREFLIGHT_REJECT_MARKERS) {
      const directory = join(tmpdir(), `ulw-execute-f7-${randomUUID()}`)
      mkdirSync(directory, { recursive: true })
      try {
        // A v1 face: NO `events` key, so dshRuntimeShape answers 'v1'.
        const jobs: JobsSurface = {
          start: () => {
            throw new Error(`0.1.5 registry said: ${marker}`)
          },
        }
        const logs: string[] = []
        const result = startWorkJob({
          jobs,
          directory,
          planName: 'alpha',
          sessionId: 'ses_f7',
          agent: undefined,
          log: (l) => logs.push(l),
        })
        const joined = logs.join('\n')
        expect(result.degraded).toBe(true)
        expect(result.jobId).toBeUndefined()
        expect(joined).toContain('start failed')
        expect(joined).not.toContain('preflight rejected')
        expect(joined).not.toContain('(matched:')
        // Scaffold still lands on the degraded path (§5.5).
        expect(result.scaffold.created).toEqual([...NOTEPAD_FILES])
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  })

  it('⑮ 对照：同一串报错走 v2 面则判 preflight（guard 的分叉方向正确）', () => {
    const directory = join(tmpdir(), `ulw-execute-f7-v2-${randomUUID()}`)
    mkdirSync(directory, { recursive: true })
    try {
      // Identical thrown text; the ONLY difference is the `events` identity key.
      const jobs: JobsSurface = {
        events: { subscribe: () => () => {} },
        start: () => {
          throw new Error('0.1.5 registry said: invalid job label: expected a non-empty string')
        },
      }
      const logs: string[] = []
      startWorkJob({ jobs, directory, planName: 'alpha', sessionId: 'ses_f7', agent: undefined, log: (l) => logs.push(l) })
      const joined = logs.join('\n')
      expect(joined).toContain('preflight rejected by the jobs registry')
      expect(joined).toContain('(matched: invalid job label: expected a non-empty string)')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('⑮ v2 上 owner 形状写反真的会被 mock registry 按 :365 拒掉（owner fork 承重）', () => {
    const directory = join(tmpdir(), `ulw-execute-ownerflip-${randomUUID()}`)
    mkdirSync(directory, { recursive: true })
    try {
      const { jobs } = dualRegistry('v2')
      const logs: string[] = []
      // Force the WRONG owner shape on v2: the sessionId slot carries an object.
      const result = startWorkJob({
        jobs,
        directory,
        planName: 'alpha',
        sessionId: { id: 'ses_t4' } as unknown as string,
        agent: undefined,
        log: (l) => logs.push(l),
      })
      expect(result.degraded).toBe(true)
      expect(result.jobId).toBeUndefined()
      const line = logs.find((l) => l.includes('preflight rejected'))
      expect(line).toBeDefined()
      expect(line).toContain('has no live agent (background job owner must be live)')
      // 降级时脚手架照常落地（既有语义，§5.5）。
      expect(result.scaffold.created).toEqual([...NOTEPAD_FILES])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('⑮ 诊断行前缀与父模块 formatUlwExecuteLine 逐字同形（可 grep 是硬要求）', () => {
    const directory = join(tmpdir(), `ulw-execute-prefix-${randomUUID()}`)
    mkdirSync(directory, { recursive: true })
    try {
      const logs: string[] = []
      startWorkJob({ jobs: undefined, directory, planName: 'alpha', sessionId: 'ses_p', agent: undefined, log: (l) => logs.push(l) })
      expect(logs).toHaveLength(1)
      expect(logs[0].startsWith(formatUlwExecuteLine('work-session job'))).toBe(true)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('P4.5-T4 ulw-execute — 双读优先级（破坏式自检补上的非真空断言）', () => {
  // WHY THIS BLOCK EXISTS: self-check 2 flipped `result ?? output` to
  // `output ?? result` and the whole suite stayed GREEN — because no other case
  // carries BOTH keys, so the order was never observed. That is a vacuous
  // assertion, and §5.7 exists precisely to catch it. These cases make the ORDER
  // observable: with both keys present `result` must win, and the test names the
  // winner so a flip cannot hide.
  it('⑮ 两键都在时 result 胜出（双读的优先级不是真空断言）', () => {
    expect(readStartWorkJobOutcome({ status: 'completed', result: 'FROM-result', output: 'FROM-output' })).toBe('FROM-result')
  })

  it('⑮ 只有 result（v2 形状）读得出', () => {
    expect(readStartWorkJobOutcome({ status: 'completed', result: 'ONLY-result' })).toBe('ONLY-result')
  })

  it('⑮ 只有 output（v1 形状）读得出', () => {
    expect(readStartWorkJobOutcome({ status: 'completed', output: 'ONLY-output' })).toBe('ONLY-output')
  })

  it('⑮ 两键都不在 → undefined（不得读出空串冒充事实）', () => {
    expect(readStartWorkJobOutcome({ status: 'completed' })).toBeUndefined()
  })

  it('⑮ result 是空串时仍胜出（?? 只在 nullish 上兜底，不在空串上）', () => {
    // Pins the operator itself: `||` would fall through an empty `result` to
    // `output`, `??` does not. The distinction is observable only here.
    expect(readStartWorkJobOutcome({ status: 'completed', result: '', output: 'FROM-output' })).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑯ P4.5-T4 修复轮 F1 — `ulw-execute.ts` 的两处改动必须有断言
//
// 评审 A 的 MAJOR：`ulw-execute.ts` 自报「诚实修复」，但它的全部行为改动**一条
// 断言都没有**——整体回退到 HEAD、删掉 `log:` 汇、把三元改回说谎的 `[jobs absent]`，
// 三种回退门 2 全绿。§3.2-3 的病灶会静默回归。
// 所以本组**经真实 registrar 链路**跑（`registerUlwExecute` → pre-step listener →
// `runPlanSelection` → `startWorkJob`），**不直接调 `startWorkJob`**：只有这条链路
// 才经过 `ulw-execute.ts` 里那两处改动。
//
// 通道（**G4 修正**，旧注释曾夸大成「只读 console.warn」）：registrar 把 listener 的
// 日志接 `log: (line) => console.warn(line)`（`ulw-execute.ts:1141`），
// `logSafely` 在 `:838`，`startWorkJob` 的 `log:` 汇在 `:1052` —— 所以
// **live-state 的诊断与调用点的 `work session …` 摘要都落在 console.warn**；
// 而 registrar 自己的注册期 NOTE（`NOTE: jobs service never appeared` /
// `jobs service observed; …`）走 **console.log**。两个通道**分开捕获**，断言各自
// 读自己那条，不再合并成一个 blob 后用 `not.toContain` 假装钉住了单一通道。
// 抖动的处置见 `driveRegistrar` 上方的 DETERMINISM CONTRACT。
// ═══════════════════════════════════════════════════════════════════════════

describe('P4.5-T4 F1 — 真实 registrar 链路上的降级日志（ulw-execute.ts 的断言）', () => {
  let directory = ''

  beforeEach(() => {
    directory = join(tmpdir(), `ulw-execute-f1-${randomUUID()}`)
    mkdirSync(join(directory, '.omo', 'plans'), { recursive: true })
    writeFileSync(join(directory, '.omo', 'plans', 'alpha.md'), '## TODOs\n- [ ] 1. First\n')
  })

  afterEach(() => {
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true })
  })

  /**
   * Registers through the REAL registrar and drives exactly ONE pre-step.
   *
   * ⚠️ **DETERMINISM CONTRACT (review G1/G4) — read this before editing.**
   * `registerUlwExecute` wires `log: (line) => console.warn(line)` and emits its
   * registration NOTE on `console.log`; both are LATE-BOUND to the process-global
   * `console`. That means this harness is only trustworthy if three things hold,
   * and the harness enforces all three rather than trusting the runner:
   *   1. the two channels are captured into **SEPARATE** arrays (G4: an earlier
   *      revision merged warn+log into one array, which made every `not.toContain`
   *      read a superset of the channel it claimed to assert on);
   *   2. the capture window is exactly this one drive, restored in `finally`, and
   *      the restore is **verified** (`restored` below) — a leaked patch would
   *      otherwise poison whichever test runs next, and under `--sequence.shuffle`
   *      "next" is random, which is precisely the shape of a heisenflaky gate;
   *   3. the drive is asserted to have produced **exactly one** `work session`
   *      line, so a second activation (foreign or duplicated) fails HERE, loudly,
   *      instead of silently turning a `not.toContain` into a coin flip.
   * Assertions below therefore read per-channel deltas, never a merged blob.
   */
  async function driveRegistrar(jobs: JobsSurface | undefined): Promise<{
    warns: string[]
    logs: string[]
    restored: boolean
  }> {
    const warns: string[] = []
    const logs: string[] = []
    const originalWarn = console.warn
    const originalLog = console.log
    console.warn = (line: unknown) => { warns.push(String(line)) }
    console.log = (line: unknown) => { logs.push(String(line)) }
    try {
      const { ctx, onCalls } = fakeContext({ jobs, withInject: true })
      registerUlwExecute(ctx, ulwExecuteRow())
      const pre = onCalls.find((call) => call.event === 'agent/pre-step')
      if (pre === undefined) throw new Error('registrar did not wire agent/pre-step')
      const session = atlasSession(directory)
      const { payload } = injectingPayload(session, ['start work on the plan'])
      await pre.listener(payload, nextDouble().next)
    } finally {
      console.warn = originalWarn
      console.log = originalLog
    }
    return { warns, logs, restored: console.warn === originalWarn && console.log === originalLog }
  }

  /** Fail loudly if the drive did not produce exactly one activation summary line. */
  function exactlyOneSessionLine(warns: readonly string[]): string {
    const sessionLines = warns.filter((line) => line.includes('work session'))
    expect(sessionLines, `expected exactly one 'work session' line, got ${sessionLines.length}: ${JSON.stringify(sessionLines)}`)
      .toHaveLength(1)
    return sessionLines[0] as string
  }

  it('⑯ F1-1 v2 面 + start 抛 :365 逐字串 → warn 通道里 preflight 行与 [degraded] 行同时出现', async () => {
    // v2 face: the `events` key is the identity signal; start throws the
    // registry's VERBATIM :365 message (jobs-local/src/index.ts:365).
    const owners: unknown[] = []
    const jobs: JobsSurface = {
      events: { subscribe: () => () => {} },
      start: (spec) => {
        owners.push(spec.owner)
        throw new Error('session "ses_f1" has no live agent (background job owner must be live)')
      },
    }
    const { warns, logs, restored } = await driveRegistrar(jobs)
    // Harness self-check first: if the console leaked, every assertion below is
    // meaningless, so fail on the harness rather than on the product.
    expect(restored).toBe(true)
    const sessionLine = exactlyOneSessionLine(warns)

    // The `log:` seam at ulw-execute.ts:1052 really delivered live-state's
    // diagnostic into the registrar's logSafely → console.warn. Delete that seam
    // and THIS assertion goes RED (self-check F1-a).
    expect(warns.join('\n')).toContain('preflight rejected by the jobs registry')
    expect(warns.join('\n')).toContain('has no live agent (background job owner must be live)')
    // The call-site note must be the HONEST one, on the SAME channel it was
    // written to. Scoped to the single session line (G1): a stray `[jobs absent]`
    // anywhere else in the process can no longer flip this.
    // Revert the ternary at ulw-execute.ts and THIS assertion goes RED (F1-b).
    expect(sessionLine).toContain('[degraded: see the startWorkJob line above]')
    expect(sessionLine).not.toContain('[jobs absent]')
    // And the v1-absent NOTE must NOT have been emitted for a face that IS present.
    expect(logs.join('\n')).not.toContain('NOTE: jobs service never appeared')
    // And the v2 owner really was the session id string on this path too.
    expect(owners).toEqual(['ses_atlas'])
    // Degraded, but the scaffold still lands (§5.5).
    expect(existsSync(join(directory, '.omo', 'notepads', 'alpha', 'learnings.md'))).toBe(true)
  })

  it('⑯ F1-2 v1 缺席面（jobs === undefined）→ [jobs absent] 仍在（既有契约不许丢）', async () => {
    const { warns, logs, restored } = await driveRegistrar(undefined)
    expect(restored).toBe(true)
    const sessionLine = exactlyOneSessionLine(warns)
    expect(sessionLine).toContain('[jobs absent]')
    // Absent is NOT refusal: the honest v2 note must not appear on this channel…
    expect(sessionLine).not.toContain('[degraded: see the startWorkJob line above]')
    // …and live-state's own absent line (not a rejection line) is what got logged.
    expect(warns.join('\n')).toContain('jobs service absent')
    expect(warns.join('\n')).not.toContain('preflight rejected')
    expect(existsSync(join(directory, '.omo', 'notepads', 'alpha', 'learnings.md'))).toBe(true)
  })

  it('⑯ F1-3 v2 成功路经真实 registrar → jobId 落地且无任何降级文案', async () => {
    const owners: unknown[] = []
    const jobs: JobsSurface = {
      events: { subscribe: () => () => {} },
      start: (spec) => {
        owners.push(spec.owner)
        spec.run({ id: 'ulw-execute-1' })
        return 'ulw-execute-1'
      },
    }
    const { warns, logs, restored } = await driveRegistrar(jobs)
    expect(restored).toBe(true)
    const sessionLine = exactlyOneSessionLine(warns)
    expect(sessionLine).toContain('work session ulw-execute-1 plan=alpha')
    // Scoped to the one session line, plus a whole-channel guard for the strings
    // that must NEVER appear regardless of which line carries them.
    expect(sessionLine).not.toContain('[jobs absent]')
    expect(sessionLine).not.toContain('[degraded')
    expect(warns.join('\n')).not.toContain('preflight rejected')
    expect(warns.join('\n')).not.toContain('jobs service absent')
    expect(logs.join('\n')).not.toContain('NOTE: jobs service never appeared')
    expect(owners).toEqual(['ses_atlas'])
  })
})
