// P5-T5 — team-create.ts 执行链 + agent/created 按角色分发的结构化 mock 单测。
//
// WHY A STRUCTURAL MOCK AND NOT A REAL HOST. The unit boundary is the tool's
// decision surface, not dsh's child machinery (that is the e2e scenario's job:
// tests/e2e drive.mjs `team-create-and-message` / `team-nested-create-denied`).
// Here we call executeTeamCreate / registerTeamCreateSurface with a hand-built
// subagents channel + Agent so EVERY argument the tool passes to the host is
// observed field-by-field:
//   * startContinuable call sequence and args == the seat values (provider
//     'spawn', label `team:<id>:<name>`, reserved childId, request.persona /
//     agentOptions / toolFilter straight from TEAM_ROSTER_SEATS);
//   * the nested gate text (already-a-participant) and the eligibility bubble
//     (a rejected seat surfaces verbatim, not swallowed);
//   * first-failure rollback: interrupt + drainContinuableChildren fire for
//     the ALREADY-created members, the run flips 'failed', the error names the
//     failing member;
//   * the briefing is an INDEPENDENT injected frame (source.kind
//     'omo-team-briefing', role 'user', form 'instructions') and its text is
//     NOT in the spawn prompt body (Q-8 separation, canary-tested).
//
// The mock is dumb on purpose: it records, it does not simulate. A host change
// that reorders startContinuable vs interrupt, or drops the reserved childId,
// shows up HERE as a red assertion, not as a phantom green.
//
// The `.ts` extension in the import paths is load-bearing (Node 24 type-stripping).
import { describe, expect, it, vi } from 'vitest'
import {
  TEAM_BRIEFING_SOURCE_KIND,
  TEAM_BRIEFING_SOURCE_PLUGIN,
  TEAM_CREATE_TOOL_NAME,
  TEAM_MEMBER_DEFAULT_INITIAL_PROMPT,
  buildTeamBriefingText,
  buildTeamMemberLabel,
  createTeamCreateDefinition,
  executeTeamCreate,
  registerTeamCreateSurface,
  type TeamAgent,
  type TeamContinuableChannel,
  type TeamMemberStartRequest,
} from '../../patches/omo-dsh/omo-team/src/tools/team-create.ts'
import {
  TEAM_ROSTER_SEATS,
  OMO_TEAM_DELEGATION_TOOL_NAMES,
} from '../../patches/omo-dsh/omo-team/src/team/roster-seats.ts'
import { TeamStateMemoryStore } from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

interface RecordedStart {
  provider: string
  label: string
  childId?: string
  request: TeamMemberStartRequest
}

interface MockChannel extends TeamContinuableChannel {
  starts: RecordedStart[]
  interrupts: Array<{ targetSessionId: string; authorityKind: string }>
  drains: Array<{ childIds: readonly string[] }>
  /** childIds whose startContinuable rejects (the first-failure trigger set). */
  failOn: Set<string>
}

function makeChannel(): MockChannel {
  return {
    starts: [],
    interrupts: [],
    drains: [],
    failOn: new Set<string>(),
    async startContinuable(spec) {
      this.starts.push({ provider: spec.provider, label: spec.label, childId: spec.childId, request: spec.request })
      if (spec.childId !== undefined && this.failOn.has(spec.childId)) {
        throw new Error(`mock: startContinuable rejected for child ${spec.childId}`)
      }
      // Echo the reserved childId back (the host honors the reserved identity).
      return { childId: spec.childId ?? 'host-allocated', messageId: `msg-${this.starts.length}` }
    },
    interrupt(targetSessionId, authority) {
      this.interrupts.push({ targetSessionId, authorityKind: authority.kind })
    },
    async drainContinuableChildren(_parent, childIds) {
      this.drains.push({ childIds })
    },
  }
}

interface InjectedFrame {
  id: string
  role: string
  content: readonly { type: string; text: string }[]
  source: { kind: string; plugin: string; form: string }
}

function makeLeadAgent(sessionId = 'lead-session-1') {
  const registered: unknown[] = []
  const injected: InjectedFrame[] = []
  const raw = {
    session: { header: { id: sessionId } },
    ctx: { tools: { register: (definition: unknown) => { registered.push(definition); return definition } } },
    inject: (frame: InjectedFrame) => { injected.push(frame) },
  }
  return { agent: raw as unknown as TeamAgent, registered, injected }
}

function exec(leadAgent: TeamAgent, signal: AbortSignal = new AbortController().signal) {
  return { agent: leadAgent, signal }
}

const VALID_SPEC = {
  name: 'analysis-team',
  members: [
    { name: 'structure-analyst', category: 'quick', prompt: 'Map the module graph.' },
    { name: 'deep-builder', seat: 'hephaestus', prompt: 'Refactor the parser.' },
  ],
}

describe('P5-T5 executeTeamCreate — happy path: per-member routing field-by-field', () => {
  it('parses, spawns two continuable children with the seat trio verbatim, then activates', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent()

    const result = await executeTeamCreate({ inline_spec: VALID_SPEC }, exec(agent), { subagents: channel, store })

    expect(result.status).toBe('active')
    expect(result.teamName).toBe('analysis-team')
    expect(result.members.map((m) => m.seat)).toEqual(['sisyphus-junior', 'hephaestus'])
    // sessionId == the reserved childId the tool handed the host.
    expect(result.members.map((m) => m.sessionId)).toEqual(channel.starts.map((s) => s.childId))

    // Two starts, in member order.
    expect(channel.starts).toHaveLength(2)

    // Member 1: category 'quick' resolved to sisyphus-junior; trio verbatim.
    const quickSeat = TEAM_ROSTER_SEATS['sisyphus-junior']!
    const start0 = channel.starts[0]!
    expect(start0.provider).toBe('spawn')
    expect(start0.label).toBe(buildTeamMemberLabel(result.teamRunId, 'structure-analyst'))
    expect(start0.childId).toMatch(/^[0-9a-f-]{36}$/)
    expect(start0.request.agentOptions).toEqual(quickSeat.agentOptions)
    expect(start0.request.persona).toBe(quickSeat.persona)
    expect(start0.request.toolFilter?.deny).toEqual(OMO_TEAM_DELEGATION_TOOL_NAMES)
    // The prompt is the CALLER's prompt only, not the briefing (Q-8 separation).
    expect(start0.request.prompt).toEqual([{ type: 'text', text: 'Map the module graph.' }])

    // Member 2: hephaestus trio verbatim (STRONG route) — the FULL mirror of
    // member 1's field-by-field pin (no asymmetric shortcut: a seat whose
    // deny list or prompt silently changed must go red HERE, not nowhere).
    const strongSeat = TEAM_ROSTER_SEATS.hephaestus!
    const start1 = channel.starts[1]!
    expect(start1.provider).toBe('spawn')
    expect(start1.label).toBe(buildTeamMemberLabel(result.teamRunId, 'deep-builder'))
    expect(start1.childId).toMatch(/^[0-9a-f-]{36}$/)
    expect(start1.request.agentOptions).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    expect(start1.request.persona).toBe(strongSeat.persona)
    // The ten delegation tools, position-by-position, off the hephaestus seat.
    expect(start1.request.toolFilter?.deny).toEqual(OMO_TEAM_DELEGATION_TOOL_NAMES)
    // The prompt is the CALLER's prompt only, not the briefing (Q-8 separation).
    expect(start1.request.prompt).toEqual([{ type: 'text', text: 'Refactor the parser.' }])

    // The state machine reached active with both members running.
    const state = store.get(result.teamRunId)!
    expect(state.status).toBe('active')
    expect(state.members.map((m) => m.phase)).toEqual(['running', 'running'])
  })

  it('accepts a JSON-string inline_spec through the same chain', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent()
    const result = await executeTeamCreate({ inline_spec: JSON.stringify(VALID_SPEC) }, exec(agent), { subagents: channel, store })
    expect(result.status).toBe('active')
    expect(channel.starts).toHaveLength(2)
  })

  it('uses the default initial prompt when a member omits prompt, and it is NOT the briefing', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent()
    await executeTeamCreate(
      { inline_spec: { name: 't', members: [{ name: 'solo', seat: 'hephaestus' }] } },
      exec(agent),
      { subagents: channel, store },
    )
    expect(channel.starts[0]!.request.prompt).toEqual([{ type: 'text', text: TEAM_MEMBER_DEFAULT_INITIAL_PROMPT }])
    // The default prompt carries none of the briefing's discipline sentences.
    expect(channel.starts[0]!.request.prompt[0]!.text).not.toContain('injected messages')
    expect(channel.starts[0]!.request.prompt[0]!.text).not.toContain('must NOT spawn')
  })

  it('each child gets a DISTINCT reserved childId (no identity collision)', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent()
    const result = await executeTeamCreate({ inline_spec: VALID_SPEC }, exec(agent), { subagents: channel, store })
    const ids = channel.starts.map((s) => s.childId)
    expect(new Set(ids).size).toBe(2)
    expect(new Set(result.members.map((m) => m.sessionId)).size).toBe(2)
  })
})

describe('P5-T5 executeTeamCreate — named rejections bubble verbatim', () => {
  it('parse failure surfaces the T4 message under a team_create: prefix', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent()
    await expect(executeTeamCreate({ inline_spec: { name: 't' } }, exec(agent), { subagents: channel, store }))
      .rejects.toThrow(/team_create: .*members/)
    expect(channel.starts).toHaveLength(0)
  })

  it('nested gate: a lead already leading an active run is refused by the upstream text', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent('shared-lead')
    // First team succeeds and makes the lead a participant.
    const first = await executeTeamCreate({ inline_spec: VALID_SPEC }, exec(agent), { subagents: channel, store })
    expect(first.status).toBe('active')
    // Second team from the SAME lead session → named refusal, no new spawns.
    const startsBefore = channel.starts.length
    await expect(executeTeamCreate(
      { inline_spec: { name: 'second-team', members: [{ name: 'x', seat: 'hephaestus' }] } },
      exec(agent),
      { subagents: channel, store },
    )).rejects.toThrow('team_create denied: session is already a participant of team')
    expect(channel.starts).toHaveLength(startsBefore)
  })

  it('eligibility rejection names the member and bubbles the validator reason', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent()
    // 'explore' is a read-only seat, ineligible. parseTeamSpec runs the SAME
    // member-validator first, so the rejection bubbles from the parse gate with
    // the member named and the read-only reason verbatim (the resolveTeamSeat
    // eligibility branch in executeTeamCreate is defense-in-depth over the same
    // validator — roster-seats.test.ts pins that branch directly).
    const err = await executeTeamCreate(
      { inline_spec: { name: 't', members: [{ name: 'reader', seat: 'explore' }] } },
      exec(agent),
      { subagents: channel, store },
    ).catch((e) => e)
    expect((err as Error).message).toContain("member 'reader'")
    expect((err as Error).message).toContain('ineligible seat')
    expect((err as Error).message).toContain('read-only')
    expect(channel.starts).toHaveLength(0)
  })

  it('a lead that is a member of another run is refused by the nested gate', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    // 'worker' is a MEMBER of a run created by a DIFFERENT lead.
    const owner = makeLeadAgent('owner-lead')
    const first = await executeTeamCreate(
      { inline_spec: { name: 'first', members: [{ name: 'helper', category: 'quick' }] } },
      exec(owner.agent),
      { subagents: channel, store },
    )
    // The member's REAL session id == the reserved childId the host echoed.
    const memberSessionId = channel.starts[0]!.childId!
    expect(store.participationOfMember(memberSessionId)?.role).toBe('member')

    // That SAME member session now tries to LEAD its own team: the exec agent
    // is a live agent whose header id is the member session id, so participantOf
    // hits the MEMBER arm and the named refusal bubbles verbatim — the nested
    // gate's defense-in-depth through the member arm, driven end-to-end rather
    // than only its precondition (the ledger lookup alone proved nothing before).
    const memberAsLead = makeLeadAgent(memberSessionId)
    const startsBefore = channel.starts.length
    await expect(executeTeamCreate(
      { inline_spec: { name: 'second', members: [{ name: 'x', seat: 'hephaestus' }] } },
      exec(memberAsLead.agent),
      { subagents: channel, store },
    )).rejects.toThrow(`team_create denied: session is already a participant of team ${first.teamRunId}`)
    // Refused BEFORE any spawn — the gate did not half-build the second team.
    expect(channel.starts).toHaveLength(startsBefore)
    expect(store.listActive()).toHaveLength(1)
  })
})

describe('P5-T5 executeTeamCreate — first-failure rollback', () => {
  it('interrupts + drains already-created members, flips failed, names the failure', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent()

    // Reserve ids are random, so we cannot predict which childId is member 2.
    // Instead: pre-seed a failOn that matches the SECOND reserved id by letting
    // the first start succeed. We hook the channel to fail starts after the
    // first one, so child 0 is created (recorded) and child 1 rejects.
    let startCount = 0
    channel.startContinuable = async function patchedStart(this: MockChannel, spec: Parameters<TeamContinuableChannel['startContinuable']>[0]) {
      startCount += 1
      this.starts.push({ provider: spec.provider, label: spec.label, childId: spec.childId, request: spec.request })
      if (startCount >= 2) throw new Error(`mock: member 2 rejected: ${spec.label}`)
      return { childId: spec.childId!, messageId: 'm' }
    }

    const err = await executeTeamCreate({ inline_spec: VALID_SPEC }, exec(agent), { subagents: channel, store }).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    const message = (err as Error).message
    expect(message).toContain('team_create rolled back')
    expect(message).toContain("member 'deep-builder' failed to start")
    expect(message).toContain('1 already-created member(s) interrupted and drained')

    // The FIRST child was created, so it must be interrupted + drained.
    const firstChildId = channel.starts[0]!.childId!
    expect(channel.interrupts).toEqual([{ targetSessionId: firstChildId, authorityKind: 'ancestor' }])
    expect(channel.drains).toEqual([{ childIds: [firstChildId] }])

    // The run reached 'failed'. teamOfLead reads the ledger REGARDLESS of
    // status (it returns the row), so it still names the failed run; the
    // ACTIVE-gated view participantOf is where the lead is freed to retry.
    expect(store.teamOfLead('lead-session-1')?.status).toBe('failed')
    expect(store.participantOf('lead-session-1')).toBeUndefined()
    const failedRun = store.listAll().find((s) => s.status === 'failed')
    expect(failedRun).toBeDefined()
    expect(failedRun!.teamName).toBe('analysis-team')
    // The created-then-released child never shows on the freed lead's member
    // index once forgotten — but the ledger keeps the row for diagnostics.
    expect(store.participationOfMember(firstChildId)?.teamRunId).toBe(failedRun!.teamRunId)
  })

  it('a host that breaks the reserved-identity contract throws and rolls back', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent()

    // Child 0 honors the reserved id and really exists; child 1 comes back
    // under a DIFFERENT id than the one reserved in the ledger. The tool must
    // treat that as a host contract violation (team-create.ts reserved-identity
    // branch): throw loudly, flip failed, and interrupt+drain the ONE member
    // that was genuinely created — never adopt the rogue id, never drain a
    // session it never had a ledger claim on.
    let startCount = 0
    channel.startContinuable = async function patchedStart(this: MockChannel, spec: Parameters<TeamContinuableChannel['startContinuable']>[0]) {
      startCount += 1
      this.starts.push({ provider: spec.provider, label: spec.label, childId: spec.childId, request: spec.request })
      if (startCount >= 2) {
        // Host breach: echo back a foreign childId instead of the reserved one.
        return { childId: `rogue-host-id-${startCount}`, messageId: 'm' }
      }
      return { childId: spec.childId!, messageId: 'm' }
    }

    const err = await executeTeamCreate({ inline_spec: VALID_SPEC }, exec(agent), { subagents: channel, store })
      .then(() => undefined, (e) => e)
    expect(err).toBeInstanceOf(Error)
    const message = (err as Error).message
    // The reserved-identity semantic anchor, naming BOTH ids (reserved + rogue).
    expect(message).toContain('reserved-identity contract is broken')
    expect(message).toContain(`host returned childId rogue-host-id-2 for reserved ${channel.starts[1]!.childId}`)
    expect(message).toContain('team_create rolled back')
    expect(message).toContain("member 'deep-builder' failed to start")
    expect(message).toContain('1 already-created member(s) interrupted and drained')

    // Rollback fired on the ALREADY-CREATED member only: child 0 gets the
    // interrupt + drain; the rogue id was never adopted into startedChildIds.
    const firstChildId = channel.starts[0]!.childId!
    expect(channel.interrupts).toEqual([{ targetSessionId: firstChildId, authorityKind: 'ancestor' }])
    expect(channel.drains).toEqual([{ childIds: [firstChildId] }])

    // The run reached 'failed' and the lead is freed to retry.
    expect(store.teamOfLead('lead-session-1')?.status).toBe('failed')
    expect(store.participantOf('lead-session-1')).toBeUndefined()
  })

  it('rollback faults are surfaced, not swallowed (interrupt throws → fault in message)', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent()
    let startCount = 0
    channel.startContinuable = async function patchedStart(this: MockChannel, spec: Parameters<TeamContinuableChannel['startContinuable']>[0]) {
      startCount += 1
      this.starts.push({ provider: spec.provider, label: spec.label, childId: spec.childId, request: spec.request })
      if (startCount >= 2) throw new Error('mock: member 2 rejected')
      return { childId: spec.childId!, messageId: 'm' }
    }
    channel.interrupt = () => {
      throw new Error('mock: interrupt refused')
    }
    const err = await executeTeamCreate({ inline_spec: VALID_SPEC }, exec(agent), { subagents: channel, store }).catch((e) => e)
    expect((err as Error).message).toContain('rollback faults')
    expect((err as Error).message).toContain('interrupt refused')
  })

  it('a first-member failure rolls back nothing (nothing created yet) but still fails', async () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { agent } = makeLeadAgent()
    channel.startContinuable = async function patchedStart(this: MockChannel, spec: Parameters<TeamContinuableChannel['startContinuable']>[0]) {
      this.starts.push({ provider: spec.provider, label: spec.label, childId: spec.childId, request: spec.request })
      throw new Error('mock: first member rejected')
    }
    const err = await executeTeamCreate({ inline_spec: VALID_SPEC }, exec(agent), { subagents: channel, store }).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('0 already-created member(s)')
    expect(channel.interrupts).toEqual([])
    // No members were created, so the drain is NOT called at all — a drain([])
    // round-trip on the channel would restate "nothing happened" as if it
    // were an operation (fix: startedChildIds.length > 0 guards the call).
    expect(channel.drains).toEqual([])
    expect(store.listAll().every((s) => s.status === 'failed')).toBe(true)
  })
})

describe('P5-T5 registerTeamCreateSurface — role-scoped dispatch on agent/created', () => {
  /** A ctx that captures the single agent/created listener. */
  function makeCtx() {
    const listeners: Array<(payload: { agent: TeamAgent }) => unknown> = []
    const ctx = {
      on: (_event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown) => {
        listeners.push(listener)
        return () => { listeners.length = 0 }
      },
    }
    return { ctx, listeners, fire: (agent: TeamAgent) => listeners[0]!({ agent }) }
  }

  function childAgent(sessionId: string, parentSessionId: string) {
    const registered: unknown[] = []
    const injected: InjectedFrame[] = []
    const raw = {
      session: { header: { id: sessionId, parentSession: parentSessionId, origin: 'subagent' } },
      ctx: { tools: { register: (d: unknown) => { registered.push(d) } } },
      inject: (frame: InjectedFrame) => { injected.push(frame) },
    }
    return { agent: raw as unknown as TeamAgent, registered, injected }
  }

  it('installs the lead surface on a root session (registers team_create)', () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { ctx, fire } = makeCtx()
    registerTeamCreateSurface(ctx, { subagents: channel, store })
    const { agent, registered } = makeLeadAgent('root-1')
    fire(agent)
    expect(registered).toHaveLength(1)
    const definition = registered[0] as { name: string }
    expect(definition.name).toBe(TEAM_CREATE_TOOL_NAME)
  })

  it('installs briefing + no team_create on a team-member child, nothing on a foreign child', () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { ctx, fire } = makeCtx()
    registerTeamCreateSurface(ctx, { subagents: channel, store })

    // Create a run so the member index carries 'worker-1'.
    const { agent: lead } = makeLeadAgent('lead-1')
    // Fire the lead so future member children dispatch correctly.
    fire(lead)
    // The run: reserve childId via the tool so the index is populated.
    return executeTeamCreate({ inline_spec: VALID_SPEC }, exec(lead), { subagents: channel, store }).then((result) => {
      const memberSessionId = channel.starts[0]!.childId!
      const member = childAgent(memberSessionId, 'lead-1')
      fire(member.agent)
      // Member face: structurally NO team_create registered.
      expect(member.registered).toHaveLength(0)
      // Exactly one injected briefing frame.
      expect(member.injected).toHaveLength(1)
      const frame = member.injected[0]!
      expect(frame.source).toEqual({ kind: TEAM_BRIEFING_SOURCE_KIND, plugin: TEAM_BRIEFING_SOURCE_PLUGIN, form: 'instructions' })
      expect(frame.content[0]!.type).toBe('text')
      // The briefing addresses the member by name and the lead by sentinel.
      expect(frame.content[0]!.text).toContain('structure-analyst')
      expect(frame.content[0]!.text).toContain("'lead'")
      // And the member's own prompt did NOT leak into the briefing (separation).
      expect(frame.content[0]!.text).not.toContain('Map the module graph.')

      // Foreign child (no team ledger): nothing installed, nothing injected.
      const foreign = childAgent('foreign-1', 'lead-1')
      fire(foreign.agent)
      expect(foreign.registered).toHaveLength(0)
      expect(foreign.injected).toHaveLength(0)

      expect(result.status).toBe('active')
    })
  })

  it('P5-T7 dedup: a re-materialized member gets the briefing EXACTLY ONCE', () => {
    // T6 e2e 观测过 frameCount:2——同一成员会话被重复物化（wake 后的二次
    // agent/created）时 briefings 重注。治理 = team-state.ts 的
    // briefingInjectedMembers 账：claimBriefingInjection 原子「查+记」，
    // 第二次物化 claim 失败即跳过（console 记 skip，不静默）。
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { ctx, fire } = makeCtx()
    registerTeamCreateSurface(ctx, { subagents: channel, store })
    const { agent: lead } = makeLeadAgent('lead-1')
    fire(lead)
    return executeTeamCreate({ inline_spec: VALID_SPEC }, exec(lead), { subagents: channel, store }).then((result) => {
      const memberSessionId = channel.starts[0]!.childId!
      const member = childAgent(memberSessionId, 'lead-1')
      fire(member.agent)
      expect(member.injected).toHaveLength(1)
      // 第二次物化（同一 member 会话再过一遍闸）：claim 失败，不重注。
      fire(member.agent)
      fire(member.agent)
      expect(member.injected).toHaveLength(1)
      // 账本记名：该 run 的 briefingInjectedMembers 含且仅含该成员一次。
      const ledger = store.get(result.teamRunId)!.briefingInjectedMembers
      expect(ledger).toEqual([ledger[0]])
      expect(ledger).toHaveLength(1)
      // 别的成员不受牵连：第二席（reserved childId 的另一枚）首过照注、
      // 重过不重注。
      const second = childAgent(channel.starts[1]!.childId!, 'lead-1')
      fire(second.agent)
      expect(second.injected).toHaveLength(1)
      fire(second.agent)
      expect(second.injected).toHaveLength(1)
      expect(store.get(result.teamRunId)!.briefingInjectedMembers).toHaveLength(2)
    })
  })

  it('P5-T7 review-MINOR: an inject throw releases the briefing ledger — next materialization re-injects', () => {
    // 未送达不占幂等位（与 releaseShutdownRequest/unmarkMessageProcessed 同
    // 一不变量）：agent.inject 抛错 → releaseBriefingInjection 退账 + 错误
    // 响亮冒泡；下一次物化再 claim 再注入成功、账重新武装；第三过 claim
    // 再挡——退账只救未送达，不破恰一次的治理。
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { ctx, fire } = makeCtx()
    registerTeamCreateSurface(ctx, { subagents: channel, store })
    const { agent: lead } = makeLeadAgent('lead-1')
    fire(lead)
    return executeTeamCreate({ inline_spec: VALID_SPEC }, exec(lead), { subagents: channel, store }).then((result) => {
      const memberSessionId = channel.starts[0]!.childId!
      const injected: InjectedFrame[] = []
      let failNextInject = true
      const raw = {
        session: { header: { id: memberSessionId, parentSession: 'lead-1', origin: 'subagent' } },
        ctx: { tools: { register: (_d: unknown) => undefined } },
        inject: (frame: InjectedFrame) => {
          if (failNextInject) {
            failNextInject = false
            throw new Error('mock: inject refused (host channel down)')
          }
          injected.push(frame)
        },
      }
      const agent = raw as unknown as TeamAgent
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        // 第一次物化：inject 抛 → 退账（账面空）→ 错误冒（不吞）。
        expect(() => fire(agent)).toThrow('mock: inject refused')
        expect(store.get(result.teamRunId)!.briefingInjectedMembers).toEqual([])
        expect(injected).toHaveLength(0)
        // 退账须响亮：console.error 点名成员与「ledger released」。
        expect(errSpy).toHaveBeenCalledTimes(1)
        expect(String(errSpy.mock.calls[0]![0])).toContain('structure-analyst')
        expect(String(errSpy.mock.calls[0]![0])).toContain('ledger released')
        // 下一次物化：claim 可再入账，注入成功，账重新武装。
        fire(agent)
        expect(injected).toHaveLength(1)
        expect(injected[0]!.source).toEqual({ kind: TEAM_BRIEFING_SOURCE_KIND, plugin: TEAM_BRIEFING_SOURCE_PLUGIN, form: 'instructions' })
        expect(store.get(result.teamRunId)!.briefingInjectedMembers).toEqual(['structure-analyst'])
        // 第三过：已送达的账挡重注（恰一次治理回归防护）。
        fire(agent)
        expect(injected).toHaveLength(1)
      } finally {
        errSpy.mockRestore()
      }
    })
  })

  it("state-gates the member face: a terminal run's ledger installs NO briefing", () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { ctx, fire } = makeCtx()
    registerTeamCreateSurface(ctx, { subagents: channel, store })

    // A run that reached a terminal status keeps its member ledger for
    // diagnostics (participationOfMember deliberately does NOT status-filter)
    // — but the DISPATCH is state-gated: briefing is a live-run face only.
    const provisioned = store.create({
      teamName: 'gated',
      leadSessionId: 'lead-1',
      members: [{ name: 'helper', seat: 'hephaestus', childId: 'reserved-gated-1' }],
    })
    store.transition(provisioned.teamRunId, 'failed')
    expect(store.participationOfMember('reserved-gated-1')?.role).toBe('member')

    const member = childAgent('reserved-gated-1', 'lead-1')
    fire(member.agent)
    expect(member.registered).toHaveLength(0)
    expect(member.injected).toHaveLength(0)
  })

  it('member ledger without run state is an impossible state: warns loudly, installs nothing', () => {
    // Simulate the should-be-impossible divergence (participation row present,
    // state row gone) by blinding ONLY get() — the dispatch must WARN rather
    // than return silently, and must inject nothing built on a missing state.
    class StateBlindStore extends TeamStateMemoryStore {
      override get(_teamRunId: string) { return undefined }
    }
    const channel = makeChannel()
    const store = new StateBlindStore()
    const { ctx, fire } = makeCtx()
    registerTeamCreateSurface(ctx, { subagents: channel, store })

    const provisioned = store.create({
      teamName: 'ghost',
      leadSessionId: 'lead-1',
      members: [{ name: 'helper', seat: 'hephaestus', childId: 'reserved-ghost-1' }],
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const member = childAgent('reserved-ghost-1', 'lead-1')
      fire(member.agent)
      expect(member.registered).toHaveLength(0)
      expect(member.injected).toHaveLength(0)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]![0])).toContain('impossible state')
      expect(String(warn.mock.calls[0]![0])).toContain(provisioned.teamRunId)
    } finally {
      warn.mockRestore()
    }
  })

  it('returns a disposer that unsubscribes the listener', () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const { ctx, listeners, fire } = makeCtx()
    const dispose = registerTeamCreateSurface(ctx, { subagents: channel, store })
    expect(listeners).toHaveLength(1)
    dispose()
    expect(listeners).toHaveLength(0)
    // Firing after disposal is inert (no listener); guard the call shape.
    expect(() => { if (listeners[0]) fire(makeLeadAgent('late').agent) }).not.toThrow()
  })
})

describe('P5-T5 briefing text discipline (Q-8 canary, unit half)', () => {
  it('briefing carries the no-delegation + report-to-lead + idle-is-fine sentences', () => {
    const text = buildTeamBriefingText('pilot', 'worker-1', 'run-abc-123')
    expect(text).toContain('# Team Briefing')
    expect(text).toContain("'worker-1'")
    expect(text).toContain("'pilot'")
    expect(text).toContain('must NOT spawn or delegate')
    expect(text).toContain('report your result to the lead')
    expect(text).toContain('idle is not an error')
    expect(text).toContain('team_send_message')
    // P5-T6: the team coordinates paragraph — the machine-readable
    // {"teamRunId":"<id>"} fragment is the member's ONLY durable source for
    // the required teamRunId argument of team_send_message (the e2e mock
    // captures it from the member lane's request body, verbatim).
    expect(text).toContain('{"teamRunId":"run-abc-123"}')
    expect(text).toContain('pass that teamRunId verbatim')
    expect(text).toContain("'lead' is a valid `to` value")
  })

  it('briefing never embeds a member prompt (two-source separation)', () => {
    const canary = 'UNIQUE-CANARY-PROMPT-TEXT-9137'
    const text = buildTeamBriefingText('pilot', 'worker-1', 'run-abc-123')
    expect(text).not.toContain(canary)
  })

  it('createTeamCreateDefinition exposes the dsh-tools contract {name, parameters, output{schema,render}}', () => {
    const channel = makeChannel()
    const store = new TeamStateMemoryStore()
    const definition = createTeamCreateDefinition({ subagents: channel, store }) as {
      name: string
      parameters: { type: string; required: string[]; properties: Record<string, { oneOf: unknown[] }> }
      output: { schema: { properties: Record<string, unknown> }; render: (a: unknown, v: unknown) => unknown[] }
      execute: unknown
    }
    expect(definition.name).toBe(TEAM_CREATE_TOOL_NAME)
    expect(definition.parameters.type).toBe('object')
    expect(definition.parameters.required).toEqual(['inline_spec'])
    expect(definition.parameters.properties.inline_spec!.oneOf).toEqual([{ type: 'object' }, { type: 'string' }])
    expect(definition.output.schema.properties).toHaveProperty('teamRunId')
    expect(typeof definition.output.render).toBe('function')
    expect(typeof definition.execute).toBe('function')
    const rendered = definition.output.render({}, { teamRunId: 'x' })
    expect(rendered).toEqual([{ type: 'text', text: JSON.stringify({ teamRunId: 'x' }) }])
  })

  it('buildTeamMemberLabel is the senpi team:<runId>:<name> namespace', () => {
    expect(buildTeamMemberLabel('abc-123', 'analyst')).toBe('team:abc-123:analyst')
  })
})
