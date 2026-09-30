// P3-T7 — todo-continuation-enforcer listener (plan §4.2 pattern E pilot; task
// book WP-3). The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/todo-continuation-enforcer/ @ v4.19.4:
//
//   upstream  `session.idle` state machine → `dispatchInternalPrompt(...)`
//             (134 tests across 16 files; 24 短路闸)
//   this port `agent/turn-stopping`       → `agent.steer(createUserMessage(...))`
//             (the DSH-measured E-mode mechanism: the listener's return value is
//             DISCARDED, the side effect decides)
//
// WHAT THE HARD-CODED EXPECTATIONS BELOW PROTECT.
//   * The status predicate and the continuation text are transcribed BY HAND
//     from upstream (todo.ts:3-11, constants.ts:7-14), not from the module under
//     test: a suite that derived them would agree with any drift, which is the
//     exact failure mode this file exists to catch.
//   * The "do not steer" branches are each asserted by their distinct reason, so
//     a gate that silently collapsed into another one cannot pass.
//   * The circuit breaker is exercised across TWO sessions, because a
//     module-level counter (the discipline ⑤ anti-pattern) would pass a
//     single-session test. Its 进展复员 semantics (arbitration 2026-09-19) are
//     pinned by BOTH directions: a shrinking incomplete list must RESET the
//     counter (⑤), and only consecutive no-progress continuations may trip it
//     (⑥); a trip must not be permanent once new progress arrives (⑦).
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it } from 'vitest'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  CONTINUATION_DIRECTIVE,
  CONTINUATION_PROMPT,
  MAX_CONSECUTIVE_FAILURES,
  NON_INCOMPLETE_STATUSES,
  TODO_CONTINUATION_ENFORCER_EVENT,
  TODO_CONTINUATION_ENFORCER_ID,
  TODO_CONTINUATION_ENFORCER_PLUGIN,
  TODOS_PROJECTION_KEY,
  buildContinuationMessage,
  buildContinuationText,
  createTodoContinuationListener,
  decideTodoContinuation,
  formatCircuitBreakerLine,
  getIncompleteCount,
  getIncompleteTodos,
  hasActiveGoal,
  isContinuationStopped,
  isIncompleteTodo,
  readTodosProjection,
  registerTodoContinuationEnforcer,
  type ContinuationDecisionInput,
  type ContinuationDeps,
  type TodoLike,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/todo-continuation-enforcer.ts'
import { STOP_CONTINUATION_SERVICE } from '../../patches/omo-dsh/omo-hooks/src/services/stop-continuation-guard.ts'

/** One `todo_write` entry, as the DSH `todos` projection stores it. */
function todo(status: string, content: string): TodoLike {
  return { status, content }
}

/** A session object — only its identity matters (the WeakMap key). */
function session(): object {
  return { id: 'session-fixture' }
}

/** A fake agent recording every `steer` payload. */
function fakeAgent(sessionObject: object, steer?: (message: unknown) => void): {
  agent: { session: object; steer?: (message: unknown) => void }
  steers: unknown[]
} {
  const steers: unknown[] = []
  const agent: { session: object; steer?: (message: unknown) => void } = {
    session: sessionObject,
    steer(message) {
      steers.push(message)
      steer?.(message)
    },
  }
  return { agent, steers }
}

/** The listener's injected seams, with recording log sink. */
function makeDeps(overrides: Partial<ContinuationDeps> = {}): {
  deps: ContinuationDeps
  logs: string[]
} {
  const logs: string[] = []
  return {
    deps: {
      readTodos: () => [],
      hasActiveGoal: () => false,
      // P4-T8: default "not stopped" — the pre-T8 behaviour every pre-T8 fixture
      // below assumes. The stopped path has its own describe block.
      isContinuationStopped: () => false,
      log: (line) => {
        logs.push(line)
      },
      ...overrides,
    },
    logs,
  }
}

/** The single steering message's text, failing loudly when none was sent. */
function steeredText(steers: readonly unknown[]): string {
  expect(steers).toHaveLength(1)
  const message = steers[0] as {
    role: string
    content: Array<{ type: string; text: string }>
  }
  expect(message.role).toBe('user')
  expect(message.content).toHaveLength(1)
  return message.content[0]!.text
}

describe('P3-T7 todo predicate — verbatim upstream todo.ts:3-11', () => {
  it('① excludes exactly completed / cancelled / blocked / deleted', () => {
    // The four members are transcribed by hand from upstream's `!==` chain
    // (todo.ts:4-9) — constants.ts does NOT carry this predicate, which is the
    // task book's one naming correction for this module.
    expect([...NON_INCOMPLETE_STATUSES]).toEqual([
      'completed',
      'cancelled',
      'blocked',
      'deleted',
    ])
    for (const status of NON_INCOMPLETE_STATUSES) {
      expect(isIncompleteTodo(todo(status, 'x')), status).toBe(false)
    }
  })

  it('② treats DSH\'s live statuses (pending / in_progress) as incomplete', () => {
    // DSH's TodoItem.status union is 'pending' | 'in_progress' | 'completed'
    // (dsh-tool-todo/lib/types/types.d.ts:24); the other two upstream members
    // are inert here but kept so a widened union cannot silently pass.
    expect(isIncompleteTodo(todo('pending', 'x'))).toBe(true)
    expect(isIncompleteTodo(todo('in_progress', 'x'))).toBe(true)
    expect(isIncompleteTodo(todo('completed', 'x'))).toBe(false)
  })

  it('③ a missing / non-string status counts as INCOMPLETE (upstream `!==` semantics)', () => {
    // A filter that required a known incomplete status would drop an entry whose
    // status the port cannot read — silently losing work. Conservative direction
    // is "still incomplete", exactly like `status !== "completed" && ...`.
    expect(isIncompleteTodo({ status: undefined as unknown as string, content: 'x' })).toBe(true)
  })

  it('④ getIncompleteCount / getIncompleteTodos count and keep order', () => {
    const todos = [
      todo('completed', 'a'),
      todo('pending', 'b'),
      todo('cancelled', 'c'),
      todo('in_progress', 'd'),
      todo('blocked', 'e'),
      todo('deleted', 'f'),
    ]
    expect(getIncompleteCount(todos)).toBe(2)
    expect(getIncompleteTodos(todos).map((entry) => entry.content)).toEqual(['b', 'd'])
  })
})

describe('P3-T7 continuation text — semantic port of constants.ts:7-14 + continuation-injection.ts:167-174', () => {
  it('① carries the four upstream bullets and the skeptical-recheck paragraph verbatim', () => {
    // Transcribed by hand from `git show v4.19.4:.../constants.ts`.
    expect(CONTINUATION_PROMPT).toContain(
      'Incomplete tasks remain in your todo list. Continue working on the next pending task.',
    )
    expect(CONTINUATION_PROMPT).toContain('- Proceed without asking for permission')
    expect(CONTINUATION_PROMPT).toContain('- Mark each task complete when finished')
    expect(CONTINUATION_PROMPT).toContain('- Do not stop until all tasks are done')
    expect(CONTINUATION_PROMPT).toContain(
      '- If you believe all work is already complete, the system is questioning your '
      + 'completion claim. Critically re-examine each todo item from a skeptical '
      + 'perspective, verify the work was actually done correctly, and update the todo '
      + 'list accordingly.',
    )
  })

  it('② rewrites ONLY the OMO directive header (harness-specific reference)', () => {
    // Upstream's first line is `[SYSTEM DIRECTIVE: OH-MY-OPENCODE - TODO
    // CONTINUATION]`; the structure is preserved, the identity is this port's.
    expect(CONTINUATION_DIRECTIVE).toBe('[SYSTEM DIRECTIVE: OH-MY-OPENDSH - TODO CONTINUATION]')
    expect(CONTINUATION_PROMPT.startsWith(CONTINUATION_DIRECTIVE)).toBe(true)
    expect(CONTINUATION_PROMPT).not.toContain('OH-MY-OPENCODE')
  })

  it('③ appends the status line and the remaining list in upstream order', () => {
    const text = buildContinuationText([
      todo('completed', 'a'),
      todo('pending', 'b'),
      todo('in_progress', 'c'),
      todo('cancelled', 'd'),
    ])
    // `[Status: <completed>/<total> completed, <n> remaining]` — one completed
    // and one cancelled out of four, so 2/4 and 2 remaining.
    expect(text).toContain('[Status: 2/4 completed, 2 remaining]')
    expect(text).toContain('Remaining tasks:\n- [pending] b\n- [in_progress] c')
  })

  it('④ builds a user message with plugin/instructions source and a fresh id', () => {
    const first = buildContinuationMessage('hello')
    const second = buildContinuationMessage('hello')
    expect(first.role).toBe('user')
    expect(first.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(first.source).toEqual({
      kind: 'plugin',
      plugin: TODO_CONTINUATION_ENFORCER_PLUGIN,
      form: 'instructions',
    })
    // The inbox validates pending-id uniqueness, so two messages must differ.
    expect(first.id).not.toBe(second.id)
  })
})

describe('P4-T8 the stop gate — `/stop-continuation` must actually stop todo continuation', () => {
  // This is Q-5 机制 ①. Upstream's `stop-continuation-guard` publishes stop state
  // and upstream's `todo-continuation-enforcer` reads it; in DSH the guard is the
  // `omoStopContinuation` service (this plugin) and the enforcer reads it lazily.
  const incomplete = [{ status: 'pending', content: 'finish the port' }]

  it('the pure decision skips with stopped-by-command BEFORE any other gate', () => {
    // Deliberately given a list that WOULD steer (incomplete todos, no goal, budget
    // available) so the assertion cannot pass by accident on another gate.
    expect(decideTodoContinuation({
      todos: incomplete,
      goalOwned: false,
      stopped: true,
      consecutiveSteers: 0,
    })).toEqual({ kind: 'skip', reason: 'stopped-by-command' })
  })

  it('a stopped session with NOTHING to do also reports stopped, not "all-complete"', () => {
    // The ordering is load-bearing: the convergence branch would DELETE the
    // breaker entry (re-arming the budget) for a session the user just paused.
    expect(decideTodoContinuation({ todos: [], goalOwned: false, stopped: true, consecutiveSteers: 0 }))
      .toEqual({ kind: 'skip', reason: 'stopped-by-command' })
    expect(decideTodoContinuation({ todos: undefined, goalOwned: false, stopped: true, consecutiveSteers: 0 }))
      .toEqual({ kind: 'skip', reason: 'stopped-by-command' })
  })

  it('the breaker entry SURVIVES the stopped period — armed first, then proven still armed', () => {
    // MINOR-5：旧写法从一开始就 stopped，于是"breaker 从没被点亮"和"条目熬过了停止
    // 期"给出同样的结果 —— 不可判别。现在先**点亮并触发** breaker，再进入停止期，
    // 最后 clear 后看下一回合是否仍然不 steer。只有"停止期把条目清掉了"这种实现
    // 才会让阶段 ③ 的回合 steer 出去。
    let stopped = false
    const { agent, steers } = fakeAgent(session())
    const { deps, logs } = makeDeps({
      readTodos: () => incomplete,
      isContinuationStopped: () => stopped,
    })
    const listener = createTodoContinuationListener(deps)

    // 阶段 ①：预算用满并触发 breaker（无进展：incomplete 数恒为 1，进展复员不生效）。
    for (let turn = 1; turn <= MAX_CONSECUTIVE_FAILURES; turn += 1) {
      listener({ agent, turn, signal: undefined })
    }
    listener({ agent, turn: MAX_CONSECUTIVE_FAILURES + 1, signal: undefined })
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('stopped steering')

    // 阶段 ②：停止期。'stopped-by-command' 既不 steer 也不产生 breaker 日志。
    stopped = true
    for (let turn = MAX_CONSECUTIVE_FAILURES + 2; turn <= MAX_CONSECUTIVE_FAILURES + 4; turn += 1) {
      listener({ agent, turn, signal: undefined })
    }
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    expect(logs).toHaveLength(1)

    // 阶段 ③：clear 后第一回合 —— 条目还活着（预算仍是满的），所以仍然不 steer。
    stopped = false
    listener({ agent, turn: MAX_CONSECUTIVE_FAILURES + 5, signal: undefined })
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    expect(logs).toHaveLength(2)
    expect(logs[1]).toContain('stopped steering')
  })

  it('the listener stops steering the moment the guard says stopped, and resumes on clear', () => {
    let stopped = false
    const { agent, steers } = fakeAgent(session())
    const { deps } = makeDeps({
      readTodos: () => incomplete,
      isContinuationStopped: () => stopped,
    })
    const listener = createTodoContinuationListener(deps)

    listener({ agent, turn: 1, signal: undefined })
    expect(steers).toHaveLength(1)

    stopped = true
    listener({ agent, turn: 2, signal: undefined })
    expect(steers).toHaveLength(1)

    stopped = false
    listener({ agent, turn: 3, signal: undefined })
    expect(steers).toHaveLength(2)
  })

  it('isContinuationStopped resolves agent.session.id against the published service', () => {
    const stopStates = new Set<string>(['sess-stopped'])
    const ctx = {
      get: (name: string) => name === STOP_CONTINUATION_SERVICE
        ? { isStopped: (id: string) => stopStates.has(id) }
        : undefined,
    }
    expect(isContinuationStopped(ctx, { session: { id: 'sess-stopped' } })).toBe(true)
    expect(isContinuationStopped(ctx, { session: { id: 'sess-other' } })).toBe(false)
  })

  it('isContinuationStopped degrades to false for every absent/odd capability — never a throw', () => {
    const throwingGuard = {
      get: () => ({ isStopped: () => { throw new Error('guard exploded') } }),
    }
    expect(isContinuationStopped({}, { session: { id: 'x' } })).toBe(false)
    expect(isContinuationStopped({ get: () => undefined }, { session: { id: 'x' } })).toBe(false)
    expect(isContinuationStopped({ get: () => ({}) }, { session: { id: 'x' } })).toBe(false)
    expect(isContinuationStopped({ get: () => ({ isStopped: () => true }) }, { session: {} })).toBe(false)
    expect(isContinuationStopped({ get: () => ({ isStopped: () => true }) }, 'not-an-object')).toBe(false)
    expect(isContinuationStopped(throwingGuard, { session: { id: 'x' } })).toBe(false)
  })
})

describe('P3-T7 decideTodoContinuation — the gate ordering', () => {
  const base: ContinuationDecisionInput = { todos: [], goalOwned: false, stopped: false, consecutiveSteers: 0 }

  it('① skips with a distinct reason per gate, in upstream gate order', () => {
    expect(decideTodoContinuation({ ...base, todos: undefined }))
      .toEqual({ kind: 'skip', reason: 'projection-absent' })
    expect(decideTodoContinuation({ ...base, todos: null }))
      .toEqual({ kind: 'skip', reason: 'projection-absent' })
    expect(decideTodoContinuation({ ...base, todos: [] }))
      .toEqual({ kind: 'skip', reason: 'no-todos' })
    expect(decideTodoContinuation({ ...base, todos: [todo('completed', 'a')] }))
      .toEqual({ kind: 'skip', reason: 'all-complete' })
    expect(decideTodoContinuation({
      ...base,
      todos: [todo('pending', 'a')],
      goalOwned: true,
    })).toEqual({ kind: 'skip', reason: 'goal-owns-continuation' })
    expect(decideTodoContinuation({
      ...base,
      todos: [todo('pending', 'a')],
      consecutiveSteers: MAX_CONSECUTIVE_FAILURES,
    })).toEqual({ kind: 'skip', reason: 'circuit-breaker' })
  })

  it('② "nothing to continue" outranks the breaker, so convergence always clears it', () => {
    // If the breaker were checked first, a converged session would keep its
    // counter armed forever and the NEXT incomplete list would be starved.
    expect(decideTodoContinuation({
      ...base,
      todos: [todo('completed', 'a')],
      consecutiveSteers: MAX_CONSECUTIVE_FAILURES + 10,
    })).toEqual({ kind: 'skip', reason: 'all-complete' })
  })

  it('③ yields to the goal driver BEFORE consuming breaker budget (R-8)', () => {
    expect(decideTodoContinuation({
      ...base,
      todos: [todo('pending', 'a')],
      goalOwned: true,
      consecutiveSteers: MAX_CONSECUTIVE_FAILURES,
    })).toEqual({ kind: 'skip', reason: 'goal-owns-continuation' })
  })

  it('④ steers with the full text when exactly one incomplete todo remains', () => {
    const decision = decideTodoContinuation({
      ...base,
      todos: [todo('pending', 'finish the report')],
    })
    expect(decision.kind).toBe('steer')
    if (decision.kind !== 'steer') throw new Error('unreachable')
    expect(decision.text).toContain('finish the report')
    expect(decision.text).toContain('[Status: 0/1 completed, 1 remaining]')
  })
})

describe('P3-T7 listener — steering through the inbox', () => {
  it('① steers exactly once for an incomplete list, with the ported text', () => {
    const sessionObject = session()
    const { agent, steers } = fakeAgent(sessionObject)
    const { deps } = makeDeps({
      readTodos: () => [todo('completed', 'a'), todo('pending', 'b')],
    })
    const listener = createTodoContinuationListener(deps)
    expect(listener({ agent, turn: 3, signal: undefined })).toBeUndefined()
    const text = steeredText(steers)
    expect(text).toContain('Incomplete tasks remain in your todo list.')
    expect(text).toContain('[Status: 1/2 completed, 1 remaining]')
    expect(text).toContain('- [pending] b')
  })

  it('② does not steer when every todo is completed (the turn closes naturally)', () => {
    const { agent, steers } = fakeAgent(session())
    const { deps } = makeDeps({ readTodos: () => [todo('completed', 'a')] })
    createTodoContinuationListener(deps)({ agent, turn: 1, signal: undefined })
    expect(steers).toEqual([])
  })

  it('③ does not steer when every todo is cancelled (upstream excluded status)', () => {
    const { agent, steers } = fakeAgent(session())
    const { deps } = makeDeps({ readTodos: () => [todo('cancelled', 'a'), todo('cancelled', 'b')] })
    createTodoContinuationListener(deps)({ agent, turn: 1, signal: undefined })
    expect(steers).toEqual([])
  })

  it('④ does not steer and does not throw when the todo projection is absent (U-4)', () => {
    // An unmounted dsh-tool-todo (no service, no key, or a null pre-first-write
    // value) must degrade to "let the turn close", never to a turn error.
    const { agent, steers } = fakeAgent(session())
    const { deps, logs } = makeDeps({ readTodos: () => undefined })
    expect(() => createTodoContinuationListener(deps)({ agent, turn: 1, signal: undefined }))
      .not.toThrow()
    expect(steers).toEqual([])
    expect(logs).toEqual([])
  })

  it('⑤ does not steer when an active armed goal owns continuation (R-8)', () => {
    const { agent, steers } = fakeAgent(session())
    const { deps } = makeDeps({
      readTodos: () => [todo('pending', 'a')],
      hasActiveGoal: () => true,
    })
    createTodoContinuationListener(deps)({ agent, turn: 1, signal: undefined })
    expect(steers).toEqual([])
  })
})

describe('P3-T7 circuit breaker — MAX_CONSECUTIVE_FAILURES (upstream constants.ts:24)', () => {
  it('① the cap is the upstream literal 5', () => {
    expect(MAX_CONSECUTIVE_FAILURES).toBe(5)
  })

  it('② steers 5 times, then stops steering and logs the cap', () => {
    const { agent, steers } = fakeAgent(session())
    const { deps, logs } = makeDeps({ readTodos: () => [todo('pending', 'a')] })
    const listener = createTodoContinuationListener(deps)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
      listener({ agent, turn: i, signal: undefined })
    }
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    expect(logs).toEqual([])
    // The sixth boundary is refused AND names the cap.
    listener({ agent, turn: 99, signal: undefined })
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    expect(logs).toEqual([formatCircuitBreakerLine(MAX_CONSECUTIVE_FAILURES)])
    expect(logs[0]).toContain(`cap ${MAX_CONSECUTIVE_FAILURES}`)
  })

  it('③ the counter is PER SESSION — a module-level map would leak the cap', () => {
    const sessionA = session()
    const sessionB = session()
    const a = fakeAgent(sessionA)
    const b = fakeAgent(sessionB)
    const { deps } = makeDeps({ readTodos: () => [todo('pending', 'a')] })
    const listener = createTodoContinuationListener(deps)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
      listener({ agent: a.agent, turn: i, signal: undefined })
    }
    // Session A is capped; session B must still get its full budget.
    listener({ agent: a.agent, turn: 50, signal: undefined })
    expect(a.steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    listener({ agent: b.agent, turn: 1, signal: undefined })
    expect(b.steers).toHaveLength(1)
  })

  it('④ a converged boundary resets the counter (progress re-arms continuation)', () => {
    const sessionObject = session()
    const { agent, steers } = fakeAgent(sessionObject)
    let todos: TodoLike[] = [todo('pending', 'a')]
    const { deps, logs } = makeDeps({ readTodos: () => todos })
    const listener = createTodoContinuationListener(deps)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
      listener({ agent, turn: i, signal: undefined })
    }
    listener({ agent, turn: 100, signal: undefined })
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    expect(logs).toHaveLength(1)
    // Todos clear → the breaker resets.
    todos = [todo('completed', 'a')]
    listener({ agent, turn: 101, signal: undefined })
    // A new incomplete list starts with a full budget again.
    todos = [todo('pending', 'b')]
    listener({ agent, turn: 102, signal: undefined })
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES + 1)
    expect(steeredText(steers.slice(-1))).toContain('- [pending] b')
  })

  it('⑤ 进展复员: a shrinking incomplete list resets the counter to zero', () => {
    // Arbitration 2026-09-19: the cap counts consecutive NO-PROGRESS
    // continuations, so a todo list that keeps moving keeps its full budget.
    // Four boundaries on an unmoved 2-item list, then one todo completes — the
    // incomplete count drops 2 → 1 (progress) — so the counter restarts at 1
    // instead of becoming a fifth failure.
    const { agent, steers } = fakeAgent(session())
    let todos: TodoLike[] = [todo('pending', 'a'), todo('pending', 'b')]
    const { deps, logs } = makeDeps({ readTodos: () => todos })
    const listener = createTodoContinuationListener(deps)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i += 1) {
      listener({ agent, turn: i, signal: undefined })
    }
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES - 1)
    todos = [todo('pending', 'a'), todo('completed', 'b')]
    listener({ agent, turn: 40, signal: undefined })
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    // The reset restored a FULL budget: MAX-1 more no-progress boundaries still
    // steer; only the MAX-th after the reset trips the breaker.
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i += 1) {
      listener({ agent, turn: 41 + i, signal: undefined })
    }
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES * 2 - 1)
    expect(logs).toEqual([])
    listener({ agent, turn: 60, signal: undefined })
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES * 2 - 1)
    expect(logs).toEqual([formatCircuitBreakerLine(MAX_CONSECUTIVE_FAILURES)])
  })

  it('⑥ five continuations with NO progress stop steering; the cap is logged', () => {
    // The other half of 进展复员: a list that never moves IS the stuck loop the
    // upstream constant bounds, so the sixth boundary is refused.
    const { agent, steers } = fakeAgent(session())
    const { deps, logs } = makeDeps({ readTodos: () => [todo('pending', 'a')] })
    const listener = createTodoContinuationListener(deps)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
      listener({ agent, turn: i, signal: undefined })
    }
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    expect(logs).toEqual([])
    listener({ agent, turn: 50, signal: undefined })
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    expect(logs).toEqual([formatCircuitBreakerLine(MAX_CONSECUTIVE_FAILURES)])
  })

  it('⑦ after the breaker trips, NEW todo progress resumes steering', () => {
    // Silence must not be permanent: 进展复员 means a todo that finally moves
    // proves the loop is alive, so the baseline comparison re-arms the budget.
    const { agent, steers } = fakeAgent(session())
    let todos: TodoLike[] = [todo('pending', 'a'), todo('pending', 'b')]
    const { deps, logs } = makeDeps({ readTodos: () => todos })
    const listener = createTodoContinuationListener(deps)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
      listener({ agent, turn: i, signal: undefined })
    }
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    // The unmoved list is refused on every later boundary...
    listener({ agent, turn: 50, signal: undefined })
    listener({ agent, turn: 51, signal: undefined })
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    expect(logs).toHaveLength(2)
    // ...until one todo completes (incomplete 2 → 1): the streak is broken and
    // the resumed text reflects the live, shrunk list.
    todos = [todo('pending', 'a'), todo('completed', 'b')]
    listener({ agent, turn: 52, signal: undefined })
    expect(steers).toHaveLength(MAX_CONSECUTIVE_FAILURES + 1)
    const text = steeredText(steers.slice(-1))
    expect(text).toContain('[Status: 1/2 completed, 1 remaining]')
    expect(text).toContain('- [pending] a')
  })
})

describe('P3-T7 listener — fail-open discipline ②', () => {
  it('① swallows a throwing todo reader instead of erroring the turn', () => {
    const { agent, steers } = fakeAgent(session())
    const { deps, logs } = makeDeps({
      readTodos: () => {
        throw new Error('projection exploded')
      },
    })
    const listener = createTodoContinuationListener(deps)
    expect(() => listener({ agent, turn: 1, signal: undefined })).not.toThrow()
    expect(steers).toEqual([])
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('listener failed: Error: projection exploded')
  })

  it('② swallows a throwing goal probe (a non-live agent must not error the turn)', () => {
    const { agent, steers } = fakeAgent(session())
    const { deps, logs } = makeDeps({
      readTodos: () => [todo('pending', 'a')],
      hasActiveGoal: () => {
        throw new Error('not the live instance')
      },
    })
    const listener = createTodoContinuationListener(deps)
    expect(() => listener({ agent, turn: 1, signal: undefined })).not.toThrow()
    expect(steers).toEqual([])
    expect(logs[0]).toContain('listener failed')
  })

  it('③ swallows a throwing steer, counts it against the breaker, and logs it', () => {
    const { agent } = fakeAgent(session(), () => {
      throw new Error('inbox rejected')
    })
    const { deps, logs } = makeDeps({ readTodos: () => [todo('pending', 'a')] })
    const listener = createTodoContinuationListener(deps)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
      expect(() => listener({ agent, turn: i, signal: undefined })).not.toThrow()
    }
    expect(logs).toHaveLength(MAX_CONSECUTIVE_FAILURES)
    expect(logs[0]).toContain('steer failed: Error: inbox rejected')
    // The sixth attempt is refused by the breaker (the failures were counted).
    listener({ agent, turn: 50, signal: undefined })
    expect(logs).toHaveLength(MAX_CONSECUTIVE_FAILURES + 1)
    expect(logs.at(-1)).toContain('stopped steering')
  })

  it('④ a throwing log sink cannot break the turn either', () => {
    const { agent, steers } = fakeAgent(session())
    const deps: ContinuationDeps = {
      readTodos: () => {
        throw new Error('boom')
      },
      hasActiveGoal: () => false,
      isContinuationStopped: () => false,
      log: () => {
        throw new Error('logger down')
      },
    }
    const listener = createTodoContinuationListener(deps)
    expect(() => listener({ agent, turn: 1, signal: undefined })).not.toThrow()
    expect(steers).toEqual([])
  })

  it('⑤ ignores malformed payloads and agents with no steer entry point', () => {
    const { deps } = makeDeps()
    const listener = createTodoContinuationListener(deps)
    for (const payload of [undefined, null, 42, 'agent', {}, { agent: null }, { agent: {} }]) {
      expect(() => listener(payload)).not.toThrow()
    }
  })
})

describe('P3-T7 U-4 / R-8 service readers', () => {
  it('① reads the todos projection through stateOf(session, "todos")', () => {
    const calls: Array<{ session: unknown; key: string }> = []
    const ctx: { get(name: string): unknown } = {
      get(name) {
        if (name !== 'sessionProjections') return undefined
        return {
          stateOf(sessionValue: unknown, key: string) {
            calls.push({ session: sessionValue, key })
            return [{ content: 'a', status: 'pending' }]
          },
        }
      },
    }
    const sessionObject = session()
    expect(readTodosProjection(ctx, sessionObject)).toEqual([{ status: 'pending', content: 'a' }])
    expect(calls).toEqual([{ session: sessionObject, key: TODOS_PROJECTION_KEY }])
    expect(TODOS_PROJECTION_KEY).toBe('todos')
  })

  it('② absent service / absent method / absent key / malformed value all read as undefined', () => {
    const sessionObject = session()
    const noGet = {} as { get?(name: string): unknown }
    const noService = { get: () => undefined }
    const wrongShape = { get: () => ({ stateOf: 'not-a-function' }) }
    const nullValue = { get: () => ({ stateOf: () => null }) }
    const badItems = { get: () => ({ stateOf: () => [{ content: 'a' }] }) }
    for (const ctx of [noGet, noService, wrongShape, nullValue, badItems]) {
      expect(readTodosProjection(ctx, sessionObject)).toBeUndefined()
    }
  })

  it('③ hasActiveGoal is true only for phase=active && activation=armed', () => {
    const agents = { current: {} }
    const make = (goal: unknown) => ({
      get(name: string) {
        return name === 'goals' ? { get: () => goal } : undefined
      },
    })
    expect(hasActiveGoal(make({ phase: 'active', activation: 'armed' }), agents.current)).toBe(true)
    expect(hasActiveGoal(make({ phase: 'active', activation: 'disarmed' }), agents.current)).toBe(false)
    expect(hasActiveGoal(make({ phase: 'paused', activation: 'armed' }), agents.current)).toBe(false)
    expect(hasActiveGoal(make({ phase: 'complete', activation: 'disarmed' }), agents.current)).toBe(false)
    expect(hasActiveGoal(make(undefined), agents.current)).toBe(false)
  })

  it('④ an unmounted goals service yields false without touching anything', () => {
    expect(hasActiveGoal({}, {})).toBe(false)
    expect(hasActiveGoal({ get: () => undefined }, {})).toBe(false)
    expect(hasActiveGoal({ get: () => ({}) }, {})).toBe(false)
  })
})

describe('P3-T7 registrar — wiring to the manifest row', () => {
  /** A fake cordis context recording `ctx.on` calls and serving fake services. */
  function fakeContext(services: Record<string, unknown> = {}): {
    ctx: HooksRegistrationContext
    onCalls: Array<{ event: string; listener: (...args: readonly unknown[]) => unknown }>
  } {
    const onCalls: Array<{ event: string; listener: (...args: readonly unknown[]) => unknown }> = []
    return {
      ctx: {
        on(event, listener) {
          onCalls.push({ event, listener })
          return () => {}
        },
        get(name) {
          return services[name]
        },
      },
      onCalls,
    }
  }

  function todoRow(): HookManifestEntry {
    const row = HOOK_MANIFEST.find((entry) => entry.id === TODO_CONTINUATION_ENFORCER_ID)
    if (row === undefined) throw new Error('manifest is missing the todo-continuation-enforcer row')
    return row
  }

  it('① registers exactly one agent/turn-stopping listener and returns no disposer', () => {
    const row = todoRow()
    expect(row.event).toBe(TODO_CONTINUATION_ENFORCER_EVENT)
    expect(row.mode).toBe('E')
    const { ctx, onCalls } = fakeContext()
    expect(registerTodoContinuationEnforcer(ctx, row)).toBeUndefined()
    expect(onCalls).toHaveLength(1)
    expect(onCalls[0].event).toBe('agent/turn-stopping')
  })

  it('② the registered listener steers from the real projection service', () => {
    const { ctx, onCalls } = fakeContext({
      sessionProjections: {
        stateOf: () => [{ content: 'write the report', status: 'in_progress' }],
      },
    })
    registerTodoContinuationEnforcer(ctx, todoRow())
    const { agent, steers } = fakeAgent(session())
    const returned = onCalls[0]!.listener({ agent, turn: 1, signal: undefined })
    expect(returned).toBeUndefined()
    expect(steeredText(steers)).toContain('write the report')
  })

  it('③ with no services mounted the listener is a silent no-op', () => {
    const { ctx, onCalls } = fakeContext()
    registerTodoContinuationEnforcer(ctx, todoRow())
    const { agent, steers } = fakeAgent(session())
    expect(() => onCalls[0]!.listener({ agent, turn: 1, signal: undefined })).not.toThrow()
    expect(steers).toEqual([])
  })
})
