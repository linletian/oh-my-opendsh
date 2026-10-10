// P5-T6 — team-message.ts 的结构化 mock 单测（消息工具层全错误族 + 投递面）。
//
// WHY A STRUCTURAL MOCK AND NOT A REAL HOST. The unit boundary is the tool's
// decision surface: WHICH sender, WHICH target, WHICH frame, and whether the
// native channel is touched at all (dedup must not touch it). The delivery
// machinery itself (cold resume, spliced persistence) is the e2e scenario's
// job (`team-create-and-message` full segment). Here every ctx.subagents.
// sendMessage call is recorded field-by-field:
//   * lead→member direct: sender == the live lead exec.agent, target == the
//     member's childId, frame == ['Team message <id> from lead:', body];
//   * member→lead direct: sender == the live member, target == leadSessionId;
//   * member→member: the native channel has NO sibling edge — the tool layer
//     relays through the LIVE lead resolved from the agents registry, and the
//     frame says `(relayed via lead)`;
//   * broadcast '*' is lead-only (verbatim 'broadcast requires lead role'),
//     fan-out one native call per active member, the lead excluded;
//   * same-id re-send is deduplicated WITHOUT touching the channel
//     (deliveries stay one, the note carries the upstream词根);
//   * every rejection is NAMED (unknown recipient / team missing / >32KB /
//     not a participant / relay lead missing), never a silent swallow.
//
// The mock is dumb on purpose: it records, it does not simulate. A tool change
// that re-delivers a duplicate, or delivers a sibling directly, shows up HERE
// as a red assertion, not as a phantom green.
//
// The `.ts` extension in the import paths is load-bearing (Node 24 type-stripping).
import { describe, expect, it } from 'vitest'
import {
  TEAM_BROADCAST_RECIPIENT,
  TEAM_MESSAGE_TOOL_KINDS,
  TEAM_SEND_MESSAGE_TOOL_NAME,
  TeamMessageError,
  buildTeamMessageContent,
  buildTeamMessageFramePrefix,
  createTeamSendMessageDefinition,
  executeTeamSendMessage,
  registerTeamMessageSurface,
  type TeamLiveAgents,
  type TeamMessageSendChannel,
} from '../../patches/omo-dsh/omo-team/src/tools/team-message.ts'
import type { TeamAgent } from '../../patches/omo-dsh/omo-team/src/tools/team-create.ts'
import {
  TEAM_LEAD_SENTINEL,
  TEAM_MESSAGE_PAYLOAD_MAX_BYTES,
  TeamStateMemoryStore,
} from '../../patches/omo-dsh/omo-team/src/team/team-state.ts'

// ── mocks ─────────────────────────────────────────────────────────────────────

interface RecordedSend {
  senderId: string
  targetSessionId: string
  content: readonly { type: string; text: string }[]
}

interface MockSendChannel extends TeamMessageSendChannel {
  sends: RecordedSend[]
  /** targetSessionIds whose sendMessage rejects (the delivery-failure trigger set). */
  failOn: Set<string>
}

function makeSendChannel(): MockSendChannel {
  return {
    sends: [],
    failOn: new Set<string>(),
    async sendMessage(sender, targetSessionId, content) {
      this.sends.push({ senderId: sender.session.header.id, targetSessionId, content })
      if (this.failOn.has(targetSessionId)) {
        throw new Error(`mock: sendMessage rejected for target ${targetSessionId}`)
      }
      return `accepted-msg-${this.sends.length}`
    },
  }
}

interface MockLiveAgents extends TeamLiveAgents {
  observed: string[]
  /** test knob: drop/restore a session's liveness mid-test */
  setLive(sessionId: string, value: boolean): void
}

function makeAgentsRegistry(liveIds: Iterable<string>): MockLiveAgents {
  const live = new Set(liveIds)
  return {
    observed: [],
    get(sessionId: string) {
      this.observed.push(sessionId)
      return live.has(sessionId) ? ({ session: { header: { id: sessionId } } } as unknown as TeamAgent) : undefined
    },
    setLive(sessionId: string, value: boolean) {
      if (value) live.add(sessionId)
      else live.delete(sessionId)
    },
  }
}

/** Await a rejection and narrow it to the named error family — the honest
 *  counterpart of `.rejects.toMatchObject` where the assertion must read the
 *  exact upstream-carried text off the error. */
async function rejectionOf(promise: Promise<unknown>): Promise<TeamMessageError> {
  try {
    await promise
  } catch (err) {
    if (err instanceof TeamMessageError) return err
    throw new Error(`expected a TeamMessageError, got: ${String(err)}`)
  }
  throw new Error('expected the call to reject — it resolved instead')
}

function makeAgent(sessionId: string): TeamAgent {
  return {
    session: { header: { id: sessionId } },
    ctx: { tools: { register: (definition: unknown) => definition } },
  } as unknown as TeamAgent
}

function execOf(agent: TeamAgent) {
  return { agent, signal: new AbortController().signal }
}

interface TeamFixture {
  store: TeamStateMemoryStore
  teamRunId: string
  leadSessionId: string
  analystSessionId: string
  builderSessionId: string
}

/** A real store seeded through the REAL create/activate path (no hand-built rows).
 *  `suffix` namespaces the child ids so two teams on ONE store stay distinct. */
function seedTeam(store: TeamStateMemoryStore, leadSessionId = 'lead-session-1', suffix = '1'): TeamFixture {
  const analystSessionId = `child-analyst-${suffix}`
  const builderSessionId = `child-builder-${suffix}`
  const state = store.create({
    teamName: 'drive-team',
    leadSessionId,
    members: [
      { name: 'analyst', seat: 'sisyphus-junior', childId: analystSessionId },
      { name: 'builder', seat: 'hephaestus', childId: builderSessionId },
    ],
    now: 1700000000000,
  })
  store.transition(state.teamRunId, 'active')
  // Members become deliverable once running (pending is not a deliverable phase).
  store.setMemberPhase(state.teamRunId, 'analyst', 'running')
  store.setMemberPhase(state.teamRunId, 'builder', 'running')
  return { store, teamRunId: state.teamRunId, leadSessionId, analystSessionId, builderSessionId }
}

function makeDeps(fixture: TeamFixture) {
  const subagents = makeSendChannel()
  const agents = makeAgentsRegistry([
    fixture.leadSessionId,
    fixture.analystSessionId,
    fixture.builderSessionId,
  ])
  return { subagents, agents, store: fixture.store }
}

const CORRID_A = '11111111-2222-3333-4444-555555555555'
const CORRID_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

// ── frame format ──────────────────────────────────────────────────────────────

describe('P5-T6 frame format (native deliveryContent semantics, Q-8 B1)', () => {
  it('direct frame prefix is `Team message <id> from <name>:`', () => {
    expect(buildTeamMessageFramePrefix('msg-7', TEAM_LEAD_SENTINEL, false)).toBe('Team message msg-7 from lead:')
    expect(buildTeamMessageFramePrefix('msg-7', 'analyst', false)).toBe('Team message msg-7 from analyst:')
  })

  it('relay frame names the sender AND the lead relay inside the same prefix', () => {
    expect(buildTeamMessageFramePrefix('msg-7', 'analyst', true)).toBe(
      'Team message msg-7 from analyst (relayed via lead):',
    )
  })

  it('content is the two-block frame: prefix block then body block', () => {
    const content = buildTeamMessageContent('msg-7', 'lead', 'hello analyst', false)
    expect(content).toEqual([
      { type: 'text', text: 'Team message msg-7 from lead:' },
      { type: 'text', text: 'hello analyst' },
    ])
  })
})

// ── lead→member / member→lead direct ─────────────────────────────────────────

describe('P5-T6 direct delivery (adjacent native channel)', () => {
  it('lead→member: sender is the live lead, target the member childId, frame verbatim', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)

    const result = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'analyst', body: 'STATUS: report structure', correlationId: CORRID_A },
      execOf(lead),
      deps,
    )

    expect(result.delivered).toBe(true)
    expect(result.deduplicated).toBe(false)
    expect(result.messageId).toBe(CORRID_A)
    expect(result.kind).toBe('message')
    expect(deps.subagents.sends).toHaveLength(1)
    const send = deps.subagents.sends[0]!
    expect(send.senderId).toBe(fixture.leadSessionId)
    expect(send.targetSessionId).toBe(fixture.analystSessionId)
    expect(send.content[0]!.text).toBe(`Team message ${CORRID_A} from ${TEAM_LEAD_SENTINEL}:`)
    expect(send.content[1]!.text).toBe('STATUS: report structure')
    // residentAtSend: the registry saw the member live before the send.
    expect(result.deliveries[0]!.residentAtSend).toBe(true)
    expect(result.deliveries[0]!.relayed).toBe(false)
  })

  it('member→lead: sender is the live member, target the lead session', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const analyst = makeAgent(fixture.analystSessionId)

    const result = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: TEAM_LEAD_SENTINEL, body: 'structure summarized', correlationId: CORRID_B },
      execOf(analyst),
      deps,
    )

    expect(result.delivered).toBe(true)
    const send = deps.subagents.sends[0]!
    expect(send.senderId).toBe(fixture.analystSessionId)
    expect(send.targetSessionId).toBe(fixture.leadSessionId)
    expect(send.content[0]!.text).toBe(`Team message ${CORRID_B} from analyst:`)
    // member→lead is NOT a relay — the native sendToParent edge is adjacency.
    expect(result.deliveries[0]!.relayed).toBe(false)
  })

  it('announcement kind rides the same frame; the kind lands on the result', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)

    const result = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'builder', body: 'freeze window starts', kind: 'announcement' },
      execOf(lead),
      deps,
    )

    expect(result.kind).toBe('announcement')
    // The frame prefix stays the upstream form — kind does NOT leak into it.
    expect(deps.subagents.sends[0]!.content[0]!.text).toBe(`Team message ${result.messageId} from ${TEAM_LEAD_SENTINEL}:`)
    // messageId fell back to a generated UUID (no correlationId given).
    expect(result.messageId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})

// ── member→member lead relay ──────────────────────────────────────────────────

describe('P5-T6 member↔member: no native sibling edge → lead relay', () => {
  it('relay delivery: sender is the LIVE LEAD, frame names from + relay', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const analyst = makeAgent(fixture.analystSessionId)

    const result = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'builder', body: 'use the summarized map', correlationId: CORRID_A },
      execOf(analyst),
      deps,
    )

    expect(result.delivered).toBe(true)
    expect(deps.subagents.sends).toHaveLength(1)
    const send = deps.subagents.sends[0]!
    // The native channel authorizes the delivery through the live lead — the
    // relay authority — not the calling member (adjacency rule).
    expect(send.senderId).toBe(fixture.leadSessionId)
    expect(send.targetSessionId).toBe(fixture.builderSessionId)
    expect(send.content[0]!.text).toBe(`Team message ${CORRID_A} from analyst (relayed via ${TEAM_LEAD_SENTINEL}):`)
    expect(result.deliveries[0]!.relayed).toBe(true)
    // Live-registry resolution TIMING, pinned via the mock's `observed`
    // trail: the lead is resolved EXACTLY ONCE at recipient-resolution time
    // and REUSED in the delivery loop (target.relaySender) — the loop must
    // NOT re-resolve across the await (that re-opened the lead-eviction
    // window; review T6-2). A re-resolving implementation surfaces here as
    // [lead, lead, builder], not as a phantom green.
    expect(deps.agents.observed).toEqual([fixture.leadSessionId, fixture.builderSessionId])
  })

  it('relay without a live lead is a NAMED refusal, never a silent sibling send', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    deps.agents.setLive(fixture.leadSessionId, false)
    const analyst = makeAgent(fixture.analystSessionId)

    await expect(
      executeTeamSendMessage({ teamRunId: fixture.teamRunId, to: 'builder', body: 'x' }, execOf(analyst), deps),
    ).rejects.toMatchObject({ code: 'RELAY_LEAD_NOT_LIVE', name: 'TeamMessageError' })
    // Nothing reached the channel, and the dedup ledger is empty (attempt ≠ delivery).
    expect(deps.subagents.sends).toHaveLength(0)
    expect(deps.store.hasProcessedMessage(fixture.teamRunId, CORRID_A)).toBe(false)
  })
})

// ── broadcast (lead-only) ─────────────────────────────────────────────────────

describe('P5-T6 broadcast: lead-only discipline, fan-out per member', () => {
  it('member broadcast is refused with the upstream verbatim text', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const analyst = makeAgent(fixture.analystSessionId)

    const err = await rejectionOf(executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: TEAM_BROADCAST_RECIPIENT, body: 'anyone?' }, execOf(analyst), deps,
    ))
    expect(err).toBeInstanceOf(TeamMessageError)
    expect(err.message).toBe('broadcast requires lead role')
    expect(err.code).toBe('BROADCAST_NOT_PERMITTED')
    expect(deps.subagents.sends).toHaveLength(0)
  })

  it('lead broadcast fans out one send per member, lead excluded, same frame id', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)

    const result = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: TEAM_BROADCAST_RECIPIENT, body: 'stand down', correlationId: CORRID_B },
      execOf(lead),
      deps,
    )

    expect(deps.subagents.sends.map((s) => s.targetSessionId)).toEqual([
      fixture.analystSessionId,
      fixture.builderSessionId,
    ])
    for (const send of deps.subagents.sends) {
      expect(send.senderId).toBe(fixture.leadSessionId)
      expect(send.content[0]!.text).toBe(`Team message ${CORRID_B} from ${TEAM_LEAD_SENTINEL}:`)
    }
    expect(result.deliveries.map((d) => d.to)).toEqual(['analyst', 'builder'])
    expect(result.note).toContain('broadcast')
  })

  it('broadcast partial failure bubbles NAMED and keeps the reservation (宁漏不重)', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    deps.subagents.failOn.add(fixture.builderSessionId)
    const lead = makeAgent(fixture.leadSessionId)

    const err = await rejectionOf(executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: TEAM_BROADCAST_RECIPIENT, body: 'x', correlationId: CORRID_A }, execOf(lead), deps,
    ))
    expect(err.code).toBe('DELIVERY_FAILED')
    expect(err.message).toContain('builder')
    // analyst got it once; the channel was called for builder and rejected —
    // two channel CALLS, ONE accepted delivery. The ledger KEEPS the id —
    // retry needs a new one (宁漏不重, file header ruling).
    expect(deps.subagents.sends.map((s) => s.targetSessionId)).toEqual([
      fixture.analystSessionId,
      fixture.builderSessionId,
    ])
    expect(deps.store.hasProcessedMessage(fixture.teamRunId, CORRID_A)).toBe(true)
  })

  it('broadcast partial failure names the member AND counts what landed first', async () => {
    // THREE-member team on the real create path (the count is live, not a
    // constant — a two-member fixture can only ever print 0/1 by construction
    // of the failure slot; here the fan-out order analyst→builder→courier
    // fails at the SECOND member, so `(1 delivered before failure)` is the
    // deliveries.length snapshot the file header diff段 promises 已投计数).
    const store = new TeamStateMemoryStore()
    const state = store.create({
      teamName: 'count-team',
      leadSessionId: 'lead-session-9',
      members: [
        { name: 'analyst', seat: 'sisyphus-junior', childId: 'child-analyst-9' },
        { name: 'builder', seat: 'hephaestus', childId: 'child-builder-9' },
        { name: 'courier', seat: 'hephaestus', childId: 'child-courier-9' },
      ],
      now: 1700000000000,
    })
    store.transition(state.teamRunId, 'active')
    store.setMemberPhase(state.teamRunId, 'analyst', 'running')
    store.setMemberPhase(state.teamRunId, 'builder', 'running')
    store.setMemberPhase(state.teamRunId, 'courier', 'running')
    const subagents = makeSendChannel()
    subagents.failOn.add('child-builder-9') // the SECOND member in fan-out order
    const agents = makeAgentsRegistry([
      'lead-session-9',
      'child-analyst-9',
      'child-builder-9',
      'child-courier-9',
    ])
    const lead = makeAgent('lead-session-9')

    const err = await rejectionOf(executeTeamSendMessage(
      { teamRunId: state.teamRunId, to: TEAM_BROADCAST_RECIPIENT, body: 'x', correlationId: CORRID_B },
      execOf(lead),
      { subagents, agents, store },
    ))

    expect(err.code).toBe('DELIVERY_FAILED')
    // 点名成员——失败的正是扇出第二席 builder…
    expect(err.message).toContain(`broadcast member 'builder'`)
    // …与已投计数——失败点前 analyst 一人落地，N 是实况不是摆设。
    expect(err.message).toContain('(1 delivered before failure)')
    // The count matches the channel trail: analyst accepted, builder rejected,
    // courier never attempted (the loop aborts at the first failure).
    expect(subagents.sends.map((s) => s.targetSessionId)).toEqual([
      'child-analyst-9',
      'child-builder-9',
    ])
    // 宁漏不重 unchanged: the ledger keeps the whole-message id.
    expect(store.hasProcessedMessage(state.teamRunId, CORRID_B)).toBe(true)
  })

  it('single-target delivery failure COMPENSATES the reservation (retry may deliver)', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    deps.subagents.failOn.add(fixture.analystSessionId)
    const lead = makeAgent(fixture.leadSessionId)

    await expect(
      executeTeamSendMessage({ teamRunId: fixture.teamRunId, to: 'analyst', body: 'x', correlationId: CORRID_A }, execOf(lead), deps),
    ).rejects.toMatchObject({ code: 'DELIVERY_FAILED' })
    expect(deps.store.hasProcessedMessage(fixture.teamRunId, CORRID_A)).toBe(false)

    // The same id now goes through (the message was never delivered).
    deps.subagents.failOn.clear()
    const retry = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'analyst', body: 'x', correlationId: CORRID_A }, execOf(lead), deps,
    )
    expect(retry.delivered).toBe(true)
  })
})

// ── R-6 dedup ─────────────────────────────────────────────────────────────────

describe('P5-T6 R-6: same-id re-send dedup (DuplicateMessageIdError semantics)', () => {
  it('second send with the same correlationId: no channel call, dedup note', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)

    const first = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'analyst', body: 'first', correlationId: CORRID_A }, execOf(lead), deps,
    )
    const second = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'analyst', body: 'first again', correlationId: CORRID_A }, execOf(lead), deps,
    )

    expect(first.delivered).toBe(true)
    expect(second.delivered).toBe(false)
    expect(second.deduplicated).toBe(true)
    expect(second.deliveries).toEqual([])
    expect(second.note).toContain('duplicate message id')
    expect(second.note).toContain(CORRID_A)
    // ONE native call total — the recipient cannot receive it twice.
    expect(deps.subagents.sends).toHaveLength(1)
  })

  it('a DIFFERENT correlationId is a different message (no false dedup)', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)

    await executeTeamSendMessage({ teamRunId: fixture.teamRunId, to: 'analyst', body: 'a', correlationId: CORRID_A }, execOf(lead), deps)
    const second = await executeTeamSendMessage({ teamRunId: fixture.teamRunId, to: 'analyst', body: 'b', correlationId: CORRID_B }, execOf(lead), deps)
    expect(second.delivered).toBe(true)
    expect(deps.subagents.sends).toHaveLength(2)
  })

  it('ledger is per team: the same id on another team is a fresh message', async () => {
    const store = new TeamStateMemoryStore()
    const fixtureA = seedTeam(store)
    const fixtureB = seedTeam(store, 'lead-session-2', '2')
    const subagents = makeSendChannel()
    const lead = makeAgent(fixtureA.leadSessionId)

    await executeTeamSendMessage(
      { teamRunId: fixtureA.teamRunId, to: 'analyst', body: 'x', correlationId: CORRID_A },
      execOf(lead),
      { subagents, agents: makeAgentsRegistry([fixtureA.leadSessionId, fixtureA.analystSessionId]), store },
    )
    const otherLead = makeAgent(fixtureB.leadSessionId)
    const second = await executeTeamSendMessage(
      { teamRunId: fixtureB.teamRunId, to: 'analyst', body: 'x', correlationId: CORRID_A },
      execOf(otherLead),
      { subagents, agents: makeAgentsRegistry([fixtureB.leadSessionId, fixtureB.analystSessionId]), store },
    )
    expect(second.delivered).toBe(true)
    expect(second.teamRunId).toBe(fixtureB.teamRunId)
    expect(subagents.sends).toHaveLength(2)
  })

  it('empty-string correlationId preprocesses to absent (upstream zod verbatim)', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)

    const first = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'analyst', body: 'x', correlationId: '' }, execOf(lead), deps,
    )
    const second = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'analyst', body: 'x', correlationId: '' }, execOf(lead), deps,
    )
    // Two generated UUIDs — empty string never collides into a false dedup.
    expect(first.delivered).toBe(true)
    expect(second.delivered).toBe(true)
    expect(first.messageId).not.toBe(second.messageId)
  })
})

// ── named rejections (error families) ─────────────────────────────────────────

describe('P5-T6 named error families (send.ts semantics, non-verbatim except where pinned)', () => {
  it('unknown recipient: the upstream `unknown or inactive team recipient` text', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)

    const err = await rejectionOf(executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'ghost', body: 'x' }, execOf(lead), deps,
    ))
    expect(err.message).toBe('unknown or inactive team recipient: ghost')
    expect(err.code).toBe('INVALID_RECIPIENT')
  })

  it('inactive member (terminal phase) is refused the same named way', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    // Drive the member row to a non-deliverable phase through the real API.
    fixture.store.setMemberPhase(fixture.teamRunId, 'analyst', 'completed')
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)

    await expect(
      executeTeamSendMessage({ teamRunId: fixture.teamRunId, to: 'analyst', body: 'x' }, execOf(lead), deps),
    ).rejects.toMatchObject({ code: 'INVALID_RECIPIENT', message: 'unknown or inactive team recipient: analyst' })
  })

  it('team missing: named TEAM_NOT_FOUND', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)
    await expect(
      executeTeamSendMessage({ teamRunId: 'no-such-run', to: 'analyst', body: 'x' }, execOf(lead), deps),
    ).rejects.toMatchObject({ code: 'TEAM_NOT_FOUND' })
  })

  it('deleting team refuses delivery (TeamDeletingError semantics)', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    fixture.store.transition(fixture.teamRunId, 'shutdown_requested')
    fixture.store.transition(fixture.teamRunId, 'deleting')
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)
    const err = await rejectionOf(executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'analyst', body: 'x' }, execOf(lead), deps,
    ))
    expect(err.message).toBe('team is deleting')
    expect(err.code).toBe('TEAM_DELETING')
  })

  it('payload over 32768 bytes: PayloadTooLargeError semantics with the upstream text', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)
    const oversized = 'x'.repeat(TEAM_MESSAGE_PAYLOAD_MAX_BYTES + 1)

    const err = await rejectionOf(executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'analyst', body: oversized }, execOf(lead), deps,
    ))
    expect(err.code).toBe('PAYLOAD_TOO_LARGE')
    expect(err.message).toContain('payload exceeds 32 KB')
    expect(err.message).toContain('message_payload_max_bytes=32768')
    expect(deps.subagents.sends).toHaveLength(0)

    // The boundary itself passes: exactly 32768 bytes is legal (default cap).
    const exact = await executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'analyst', body: 'x'.repeat(TEAM_MESSAGE_PAYLOAD_MAX_BYTES) }, execOf(lead), deps,
    )
    expect(exact.delivered).toBe(true)
  })

  it('non-participant caller: the upstream gating text', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const stranger = makeAgent('stranger-session')
    const err = await rejectionOf(executeTeamSendMessage(
      { teamRunId: fixture.teamRunId, to: 'analyst', body: 'x' }, execOf(stranger), deps,
    ))
    expect(err.message).toBe(
      `team-mode tool ${TEAM_SEND_MESSAGE_TOOL_NAME} denied: not a participant of team ${fixture.teamRunId}`,
    )
    expect(err.code).toBe('NOT_PARTICIPANT')
  })

  it('a member of team A cannot message into team B (participation must match)', async () => {
    const store = new TeamStateMemoryStore()
    const fixtureA = seedTeam(store)
    // team B needs a DIFFERENT lead — one session leads at most one live run
    // (the nested gate's storage half, ALREADY_PARTICIPANT).
    const fixtureB = seedTeam(store, 'lead-session-2', '2')
    const subagents = makeSendChannel()
    const analystOfA = makeAgent(fixtureA.analystSessionId)
    await expect(
      executeTeamSendMessage(
        { teamRunId: fixtureB.teamRunId, to: 'analyst', body: 'x' },
        execOf(analystOfA),
        { subagents, agents: makeAgentsRegistry([fixtureB.leadSessionId, fixtureB.analystSessionId]), store },
      ),
    ).rejects.toMatchObject({ code: 'NOT_PARTICIPANT' })
    expect(subagents.sends).toHaveLength(0)
  })

  it('correlationId must be a UUID (the upstream task-ID admonition enforced)', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)
    await expect(
      executeTeamSendMessage({ teamRunId: fixture.teamRunId, to: 'analyst', body: 'x', correlationId: 'task-1' }, execOf(lead), deps),
    ).rejects.toMatchObject({ code: 'INVALID_CORRELATION_ID' })
  })

  it('unknown kind is refused against the MESSAGE_TOOL_KINDS vocabulary', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)
    await expect(
      executeTeamSendMessage({ teamRunId: fixture.teamRunId, to: 'analyst', body: 'x', kind: 'shutdown_request' }, execOf(lead), deps),
    ).rejects.toMatchObject({ code: 'UNKNOWN_KIND' })
    expect(TEAM_MESSAGE_TOOL_KINDS).toEqual(['message', 'announcement'])
  })

  it('lead messaging itself is refused as the non-edge it is', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    const lead = makeAgent(fixture.leadSessionId)
    await expect(
      executeTeamSendMessage({ teamRunId: fixture.teamRunId, to: TEAM_LEAD_SENTINEL, body: 'dear me' }, execOf(lead), deps),
    ).rejects.toMatchObject({ code: 'SELF_DELIVERY_NOT_ADJACENT' })
  })

  it('missing exec.agent is loud, never a silent no-op', async () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const deps = makeDeps(fixture)
    await expect(
      executeTeamSendMessage({ teamRunId: fixture.teamRunId, to: 'analyst', body: 'x' }, { signal: new AbortController().signal }, deps),
    ).rejects.toMatchObject({ code: 'CALLER_MISSING' })
  })
})

// ── surface dispatch (both faces, UNIVERSAL roster semantics) ─────────────────

describe('P5-T6 registerTeamMessageSurface — lead AND member faces', () => {
  interface CapturedListener {
    listener: (payload: { agent: TeamAgent }) => unknown
  }

  function makeCtx() {
    const captured: CapturedListener[] = []
    return {
      captured,
      on(_event: 'agent/created', listener: (payload: { agent: TeamAgent }) => unknown) {
        captured.push({ listener })
        return () => {}
      },
    }
  }

  /** An agent whose header shape matches its role — children carry
   *  origin:'subagent' + parentSession, exactly as the host stamps them (the
   *  dispatch reads origin/parentSession first, participation second). */
  function makeRegisteringAgent(sessionId: string, parentSessionId?: string) {
    const registered: unknown[] = []
    const agent = {
      session: {
        header: {
          id: sessionId,
          ...(parentSessionId === undefined ? {} : { origin: 'subagent', parentSession: parentSessionId }),
        },
      },
      ctx: { tools: { register: (definition: unknown) => { registered.push(definition); return definition } } },
    } as unknown as TeamAgent
    return { agent, registered }
  }

  function namesOf(registered: unknown[]): string[] {
    return registered.map((def) => (def as { name: string }).name)
  }

  it('root session: the message tool lands on the lead face', () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const ctx = makeCtx()
    registerTeamMessageSurface(ctx, makeDeps(fixture))
    const { agent, registered } = makeRegisteringAgent(fixture.leadSessionId)
    ctx.captured[0]!.listener({ agent })
    expect(namesOf(registered)).toEqual([TEAM_SEND_MESSAGE_TOOL_NAME])
  })

  it('team-member child: the message tool lands on the member face', () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const ctx = makeCtx()
    registerTeamMessageSurface(ctx, makeDeps(fixture))
    const { agent, registered } = makeRegisteringAgent(fixture.analystSessionId, fixture.leadSessionId)
    ctx.captured[0]!.listener({ agent })
    expect(namesOf(registered)).toEqual([TEAM_SEND_MESSAGE_TOOL_NAME])
  })

  it('NON-team child gets NOTHING (the structural absence half)', () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const ctx = makeCtx()
    registerTeamMessageSurface(ctx, makeDeps(fixture))
    const { agent, registered } = makeRegisteringAgent('unrelated-child', fixture.leadSessionId)
    ctx.captured[0]!.listener({ agent })
    expect(namesOf(registered)).toEqual([])
  })

  it('member face is gated by team status like team-create (terminal states install nothing)', () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    fixture.store.transition(fixture.teamRunId, 'shutdown_requested')
    fixture.store.transition(fixture.teamRunId, 'deleting')
    const ctx = makeCtx()
    registerTeamMessageSurface(ctx, makeDeps(fixture))
    const { agent, registered } = makeRegisteringAgent(fixture.analystSessionId, fixture.leadSessionId)
    ctx.captured[0]!.listener({ agent })
    expect(namesOf(registered)).toEqual([])
  })

  it('the disposer is handed back (subscription unwind, no late installs)', () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const ctx = makeCtx()
    const dispose = registerTeamMessageSurface(ctx, makeDeps(fixture))
    expect(ctx.captured).toHaveLength(1)
    dispose()
    expect(ctx.captured).toHaveLength(1)
  })
})

// ── definition shape (upstream zod mirror on the JSON-Schema face) ────────────

describe('P5-T6 tool definition mirrors the upstream zod shape (Q1a §2.6)', () => {
  it('parameters: teamRunId/to/body required; kind enum; correlationId documented verbatim', () => {
    const fixture = seedTeam(new TeamStateMemoryStore())
    const definition = createTeamSendMessageDefinition(makeDeps(fixture)) as {
      name: string
      description: string
      parameters: {
        type: string
        required: string[]
        properties: Record<string, { type?: string; enum?: string[]; minLength?: number; description?: string }>
      }
      output: { schema: unknown; render: (a: unknown, v: unknown) => unknown[] }
      execute: unknown
    }
    expect(definition.name).toBe(TEAM_SEND_MESSAGE_TOOL_NAME)
    expect(definition.parameters.type).toBe('object')
    expect(definition.parameters.required).toEqual(['teamRunId', 'to', 'body'])
    expect(definition.parameters.properties.teamRunId!.minLength).toBe(1)
    expect(definition.parameters.properties.kind!.enum).toEqual(['message', 'announcement'])
    // The upstream describe texts ride verbatim (messaging.ts :47/:50).
    expect(definition.parameters.properties.to!.description).toBe('Recipient name or * for broadcast.')
    expect(definition.parameters.properties.correlationId!.description).toContain('Do not use task IDs like')
    expect(typeof definition.output.render).toBe('function')
    expect(typeof definition.execute).toBe('function')
    const rendered = definition.output.render({}, { teamRunId: 'x' })
    expect(rendered).toEqual([{ type: 'text', text: JSON.stringify({ teamRunId: 'x' }) }])
  })
})
