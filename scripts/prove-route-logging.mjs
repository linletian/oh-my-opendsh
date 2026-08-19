#!/usr/bin/env node
// scripts/prove-route-logging.mjs — T15 (P-7, AC-5 observation half):
// does the DSH session log (JSONL) record each agent's RESOLVED route
// {provider, model}? Driven against the INSTALLED rc.6 modules (read-only),
// the FULL real stack — no session-free stubs on the write path:
//
//   @deepseek-ai/dsh-llm (LlmRuntime) + dsh-session (SessionStore) +
//   dsh-system-prompt + dsh-tools (ToolRuntime) + dsh-agent (AgentRegistry) —
//   the exact five mountAgentLoopTestDependencies mounts from dsh's own
//   subagent continuation tests — PLUS the real write path:
//   dsh-session-persistence-jsonl (JsonlSessionPersistence, plaintext,
//   unpacked) + dsh-agent-loop (AgentLoop) + dsh-subagent (SubagentRuntime) +
//   dsh-subagent-spawn-in-process (the explore row's provider).
//
// The model boundary is a scripted MockAdapter (dsh's own test pattern:
// packages/core/agent-loop/tests/mock-adapter.ts) registered on OUR TWO REAL
// ROUTE NAMES from src/model-routes.ts (P-8.6 type-stripping, the single
// source of truth) — deepseek-official for the sisyphus parent, deepseek for
// the explore child — so no live model or API key is involved, while every
// module between the delegation call and the bytes on disk is dsh's own.
//
// What is asserted (all citations rc.7 source ≡ rc.6 installed lib):
//   * CHILD, declared route: the continuable start snapshots the RESOLVED
//     route — agentProvider = request.agentOptions?.provider ??
//     parent.options.provider, agentModel likewise (subagent/src/
//     continuation.ts:413-414 ≡ dsh-subagent/lib/index.js:779-780) — into the
//     durable `subagent/descriptor` event (descriptor.ts:71-83 ≡
//     lib/index.js:418-435), seeded into the child's initial log before its
//     first request (continuation.ts:437 → descriptor-seed.ts:23-31 ≡
//     lib/index.js:640). The snapshot precedence (request wins, else inherit
//     parent) is exactly resolveChildAgentOptions' merge order feeding
//     ctx.agents.create (child-agent.ts:68-83; continuation.ts:444), so the
//     descriptor values ARE the resolved child options.
//   * CHILD + PARENT, executed route: every agent loop appends
//     `request/header` with the full call config on its first request
//     (agent-loop/src/agent.ts:466 reason 'initial', :469 'change' ≡
//     dsh-agent-loop/lib/index.js:710-716); EpochHeader.config is the
//     LlmCallConfig {provider, model, …} (session/src/types.ts:201-210).
//     The MAIN agent's route record is this event — a subagent child gets one
//     too, so the child route is recorded twice (declared + executed).
//   * The bytes on disk: JSONL = one `type:"session"` header line then one
//     JSON event per line (session-persistence-jsonl/src/format.ts:51-64,
//     221-224); the coordinator persists the creation seed (which carries the
//     descriptor) on session/created and live events on session/event
//     (dsh-session-persistence/lib/index.js:1152-1158 installWritePath,
//     onCreated → appendCore(seed)).
//   * The route reaches the adapter boundary: the mock adapter records the
//     exact GenerateOptions.{provider,model} the loop dispatched with.
//
// Verdict logic (routeLogVerdict below) is the honest decision procedure the
// P-7 verdict rests on: child route observable (descriptor first, child
// request/header as fallback) AND parent route observable (request/header) →
// 'logged'; anything missing → 'self-listener-needed'. `--expect unlogged`
// feeds it fabricated logs LACKING route fields and asserts the fallback
// branch fires — proof the 'logged' verdict is earned, not hardcoded.
//
// Note on one-shot children (not our row): the one-shot descriptor schema
// omits agentProvider/agentModel (descriptor.ts:60-68; start path
// subagent/src/index.ts:419-423 ≡ lib/index.js:2509-2513) — a one-shot
// child's route is still recorded by its own request/header. Our explore row
// is backgroundMode: continuable (concerto/agent.cordis.yml), so the stronger
// pre-turn descriptor record applies.
//
// Modes:
//   (default | --expect logged)    full real-stack drive; both routes must be
//                                  found in the real JSONL artifacts, distinct,
//                                  and matching the adapter-boundary dispatch.
//   --expect unlogged              verdict-logic QA: fabricated route-less logs
//                                  MUST select 'self-listener-needed' (and a
//                                  fabricated complete log MUST select 'logged').
//
// Usage:
//   node scripts/prove-route-logging.mjs <dsh-node_modules> [--expect logged|unlogged]
// Exit 0 = PASS (mode-dependent), exit 1 = FAIL.

import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [nm, ...flags] = process.argv.slice(2)
if (!nm) {
  console.error('usage: prove-route-logging.mjs <dsh-node_modules> [--expect logged|unlogged]')
  process.exit(1)
}
const expectMode = flags.includes('--expect') ? flags[flags.indexOf('--expect') + 1] : 'logged'
if (!['logged', 'unlogged'].includes(expectMode)) {
  console.error(`T15-PROOF FAIL: --expect must be logged|unlogged, got "${expectMode}"`)
  process.exit(1)
}

// The verdict decision procedure — pure, shared by the real run and the
// fabricated-log QA. childEvents are one subagent child's session events,
// parentEvents the delegating parent's.
function descriptorRoute(events) {
  const data = events.find((event) => event.type === 'subagent/descriptor')?.data
  return data !== undefined
    && typeof data.agentProvider === 'string' && data.agentProvider.length > 0
    && typeof data.agentModel === 'string' && data.agentModel.length > 0
    ? { provider: data.agentProvider, model: data.agentModel, via: 'subagent/descriptor' }
    : undefined
}
function lastRequestHeaderRoute(events) {
  let route
  for (const event of events) {
    if (event.type === 'request/header') {
      route = {
        provider: event.data.header.config.provider,
        model: event.data.header.config.model,
        via: 'request/header',
      }
    }
  }
  return route
}
function routeLogVerdict({ childEvents, parentEvents }) {
  const child = descriptorRoute(childEvents) ?? lastRequestHeaderRoute(childEvents)
  const parent = lastRequestHeaderRoute(parentEvents)
  return { verdict: child !== undefined && parent !== undefined ? 'logged' : 'self-listener-needed', child, parent }
}

// ── Failure-branch QA: the verdict logic must not lie ───────────────────────
if (expectMode === 'unlogged') {
  const problems = []
  // Fabricated child log: a descriptor WITHOUT route fields (e.g. a hypothetical
  // one-shot-only record) and NO request/header — nothing records the route.
  const bareChild = [
    { seq: 0, type: 'subagent/descriptor', data: { version: 2, mode: 'one-shot', provider: 'spawn', label: 'x' } },
    { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: 'x' }] } },
  ]
  const bareParent = [
    { seq: 0, type: 'user/message', data: { content: [{ type: 'text', text: 'y' }] } },
  ]
  const unlogged = routeLogVerdict({ childEvents: bareChild, parentEvents: bareParent })
  console.log(`T15-PROOF fabricated route-less logs → verdict: ${unlogged.verdict}`)
  if (unlogged.verdict !== 'self-listener-needed') {
    problems.push(`route-less fabricated logs must select 'self-listener-needed', got '${unlogged.verdict}'`)
  }
  // Child-only gap: descriptor carries the route but the PARENT log has no
  // request/header — AC-5 needs BOTH agents, so this too must fall back.
  const childOnly = routeLogVerdict({
    childEvents: [{ seq: 0, type: 'subagent/descriptor', data: { version: 2, mode: 'continuable', provider: 'spawn', label: 'x', agentProvider: 'deepseek', agentModel: 'deepseek-v4-flash' } }],
    parentEvents: bareParent,
  })
  console.log(`T15-PROOF fabricated parent-route-less logs → verdict: ${childOnly.verdict}`)
  if (childOnly.verdict !== 'self-listener-needed') {
    problems.push(`parent-route-less fabricated logs must select 'self-listener-needed', got '${childOnly.verdict}'`)
  }
  // Positive control: a fabricated COMPLETE pair must select 'logged' (the
  // fallback branch is selective, not constant).
  const complete = routeLogVerdict({
    childEvents: [{ seq: 0, type: 'subagent/descriptor', data: { version: 2, mode: 'continuable', provider: 'spawn', label: 'x', agentProvider: 'deepseek', agentModel: 'deepseek-v4-flash' } }],
    parentEvents: [{ seq: 0, type: 'request/header', data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-pro' } }, reason: 'initial' } }],
  })
  console.log(`T15-PROOF fabricated complete logs → verdict: ${complete.verdict}`)
  if (complete.verdict !== 'logged') problems.push(`complete fabricated logs must select 'logged', got '${complete.verdict}'`)
  if (problems.length > 0) {
    console.error(`T15-PROOF FAIL: ${problems.join('; ')}`)
    process.exit(1)
  }
  console.log("T15-PROOF VERDICT-LOGIC PASS: fabricated route-less logs select 'self-listener-needed' (both the child-gap and parent-gap forms), a fabricated complete log selects 'logged' — the real-run verdict is earned, not hardcoded")
  process.exit(0)
}

// ── Real-stack drive ────────────────────────────────────────────────────────
const imp = (p) => import(pathToFileURL(`${nm}/${p}`).href)
const { Context } = await imp('@deepseek-ai/cordis/lib/index.js')
const LlmRuntime = (await imp('@deepseek-ai/dsh-llm/lib/index.js')).default
const { LlmAdapter, createUserMessage } = await imp('@deepseek-ai/dsh-llm/lib/index.js')
const SessionStore = (await imp('@deepseek-ai/dsh-session/lib/index.js')).default
const { SessionId } = await imp('@deepseek-ai/dsh-session/lib/index.js')
const SystemPrompt = (await imp('@deepseek-ai/dsh-system-prompt/lib/index.js')).default
const ToolRuntime = (await imp('@deepseek-ai/dsh-tools/lib/index.js')).default
const AgentRegistry = (await imp('@deepseek-ai/dsh-agent/lib/index.js')).default
const JsonlSessionPersistence = (await imp('@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js')).default
const AgentLoop = (await imp('@deepseek-ai/dsh-agent-loop/lib/index.js')).default
const SubagentRuntime = (await imp('@deepseek-ai/dsh-subagent/lib/index.js')).default
const SpawnProvider = await imp('@deepseek-ai/dsh-subagent-spawn-in-process/lib/index.js')

// The route values come from the plugin's own config module — the single
// source of truth (same Node type-stripping the probe uses, P-8.6).
const { resolveModelRoutes } = await import(new URL('../patches/omo-dsh/omo-agents/src/model-routes.ts', import.meta.url).href)
const routes = resolveModelRoutes()
console.log(`T15-PROOF routes under test: sisyphus=${routes.sisyphus.provider}/${routes.sisyphus.model} explore=${routes.explore.provider}/${routes.explore.model}`)

// Scripted adapter on each REAL route name (dsh's own MockAdapter pattern —
// packages/core/agent-loop/tests/mock-adapter.ts — reduced to the one shape
// this proof needs). Records every dispatched request for the boundary check.
function textResponse(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}
class MockAdapter extends LlmAdapter {
  constructor(script) {
    super()
    this.script = [...script]
    this.requests = []
  }
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model })
  }
  async *stream(options) {
    this.requests.push(options)
    const entry = this.script.shift()
    if (entry === undefined) throw new Error('MockAdapter: script exhausted')
    for (const chunk of entry) {
      if (options.signal?.aborted) throw new Error('aborted')
      yield chunk
    }
  }
}
const parentAdapter = new MockAdapter([textResponse('parent turn done')])
const childAdapter = new MockAdapter([textResponse('explore turn done')])

// The full real stack, in dsh's own test-mount order (continuation.spec.ts
// setupWith): the five testkit services, then persistence, loop, subagents.
const ctx = new Context()
await ctx.plugin(LlmRuntime)
await ctx.plugin(SessionStore)
await ctx.plugin(SystemPrompt, {})
await ctx.plugin(ToolRuntime, {})
await ctx.plugin(AgentRegistry)
const root = mkdtempSync(join(tmpdir(), 't15-route-logging-'))
// Plaintext, unpacked artifacts: one JSON event per line, byte-identical to
// the pre-packing layout — the exact lines T20 will grep.
const persistenceFiber = await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none', packChunks: false })
await ctx.plugin(AgentLoop, { agents: [] })
await ctx.plugin(SubagentRuntime)
await ctx.plugin(SpawnProvider, { providerName: 'spawn' })
ctx.llm.registerAdapter([routes.sisyphus.provider], parentAdapter)
ctx.llm.registerAdapter([routes.explore.provider], childAdapter)

const problems = []

// Parent runs ONE real turn on the sisyphus route → its request/header lands
// in the parent log (the MAIN-agent route record AC-5 needs).
const parent = ctx.agentLoop.create(SessionId('t15-parent'), {
  provider: routes.sisyphus.provider,
  model: routes.sisyphus.model,
})
parent.followup(createUserMessage({ content: [{ type: 'text', text: 't15 parent route probe' }], source: { kind: 'user' } }))
await parent.whenIdle()

// Park the parent afterwards (dsh's parkParent pattern): every child
// settlement wakes its parent, and the parked pre-step rejection keeps that
// wake from spending adapter script entries or masking the assertions.
ctx.on('agent/pre-step', async ({ agent: subject }, next) => {
  if (subject !== parent) return next()
  return { kind: 'reject' }
})

// The REAL delegation call our explore row makes: continuable start on the
// spawn provider with the row's agentOptions override (T11's binding).
const started = await ctx.subagents.startContinuable({
  provider: 'spawn',
  label: 't15 explore route probe',
  request: {
    prompt: [{ type: 'text', text: 't15 child route probe' }],
    parent,
    agentOptions: { provider: routes.explore.provider, model: routes.explore.model },
  },
  signal: new AbortController().signal,
})
console.log(`T15-PROOF continuable child started: childId=${started.childId}`)

// Wait for the child's initial turn to settle and its Activation to release
// (dsh's waitNoActivation pattern) — all local, mock streams instantly.
const deadline = Date.now() + 10_000
while (ctx.agents.get(started.childId) !== undefined) {
  if (Date.now() > deadline) {
    console.error('T15-PROOF FAIL: child activation did not release within 10s')
    process.exit(1)
  }
  await new Promise((resolve) => setTimeout(resolve, 10))
}

// Flush the write-behind batcher deterministically: disposing the persistence
// fiber flushes every live session (installWritePath's effect disposer).
await persistenceFiber.dispose()

// Read the REAL artifacts from disk (recursive scan collecting EVERY session
// log; each header line carries the session id, origin, parentSession,
// delegationDepth).
function readSessionLogs(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      readSessionLogs(path, out)
    } else if (entry.name === 'session.jsonl') {
      const text = readFileSync(path, 'utf8')
      const lines = text.split('\n').filter((line) => line.length > 0)
      out.push({ path, lines, header: JSON.parse(lines[0]), events: lines.slice(1).map((line) => JSON.parse(line)) })
    }
  }
  return out
}
const logs = new Map()
for (const found of readSessionLogs(root)) logs.set(found.header.id, found)
const parentLog = logs.get('t15-parent')
const childLog = logs.get(String(started.childId))
if (parentLog === undefined) problems.push('parent session.jsonl not found under the persistence root')
if (childLog === undefined) problems.push(`child session.jsonl (${started.childId}) not found under the persistence root`)

let verdict
if (problems.length === 0) {
  console.log(`T15-PROOF parent log: ${parentLog.path}`)
  console.log(`T15-PROOF child log:  ${childLog.path}`)
  console.log(`T15-PROOF child header line: ${JSON.stringify(childLog.header)}`)
  if (childLog.header.origin !== 'subagent') problems.push(`child header origin = ${JSON.stringify(childLog.header.origin)} (want "subagent")`)
  if (childLog.header.parentSession !== 't15-parent') problems.push(`child header parentSession = ${JSON.stringify(childLog.header.parentSession)} (want "t15-parent")`)

  // Child: declared route in the durable descriptor (pre-turn record).
  const descriptorLine = childLog.lines.find((line) => line.includes('"subagent/descriptor"'))
  const descriptor = childLog.events.find((event) => event.type === 'subagent/descriptor')
  if (descriptorLine === undefined || descriptor === undefined) {
    problems.push('child log has no subagent/descriptor event')
  } else {
    console.log(`T15-PROOF child descriptor JSONL line (verbatim): ${descriptorLine}`)
    const d = descriptor.data
    if (d.version !== 2) problems.push(`descriptor version = ${d.version} (want 2)`)
    if (d.mode !== 'continuable') problems.push(`descriptor mode = ${JSON.stringify(d.mode)} (want "continuable")`)
    if (d.provider !== 'spawn') problems.push(`descriptor provider = ${JSON.stringify(d.provider)} (want "spawn")`)
    if (d.agentProvider !== routes.explore.provider) problems.push(`descriptor agentProvider = ${JSON.stringify(d.agentProvider)} (want "${routes.explore.provider}")`)
    if (d.agentModel !== routes.explore.model) problems.push(`descriptor agentModel = ${JSON.stringify(d.agentModel)} (want "${routes.explore.model}")`)
  }

  // Child: executed route in its own request/header; must equal the declared.
  const childHeader = lastRequestHeaderRoute(childLog.events)
  if (childHeader === undefined) {
    problems.push('child log has no request/header event')
  } else {
    console.log(`T15-PROOF child request/header route: ${childHeader.provider}/${childHeader.model}`)
    if (childHeader.provider !== routes.explore.provider || childHeader.model !== routes.explore.model) {
      problems.push(`child request/header route = ${childHeader.provider}/${childHeader.model} (want "${routes.explore.provider}/${routes.explore.model}")`)
    }
  }

  // Parent: the MAIN agent's route record.
  const parentHeader = lastRequestHeaderRoute(parentLog.events)
  if (parentHeader === undefined) {
    problems.push('parent log has no request/header event')
  } else {
    console.log(`T15-PROOF parent request/header route: ${parentHeader.provider}/${parentHeader.model}`)
    if (parentHeader.provider !== routes.sisyphus.provider || parentHeader.model !== routes.sisyphus.model) {
      problems.push(`parent request/header route = ${parentHeader.provider}/${parentHeader.model} (want "${routes.sisyphus.provider}/${routes.sisyphus.model}")`)
    }
  }

  // Adapter boundary: the loop dispatched each turn on the resolved route.
  if (parentAdapter.requests.length !== 1) {
    problems.push(`parent adapter saw ${parentAdapter.requests.length} requests (want exactly 1)`)
  } else if (parentAdapter.requests[0].provider !== routes.sisyphus.provider || parentAdapter.requests[0].model !== routes.sisyphus.model) {
    problems.push(`parent adapter dispatch = ${parentAdapter.requests[0].provider}/${parentAdapter.requests[0].model} (want the sisyphus route)`)
  }
  if (childAdapter.requests.length !== 1) {
    problems.push(`child adapter saw ${childAdapter.requests.length} requests (want exactly 1)`)
  } else if (childAdapter.requests[0].provider !== routes.explore.provider || childAdapter.requests[0].model !== routes.explore.model) {
    problems.push(`child adapter dispatch = ${childAdapter.requests[0].provider}/${childAdapter.requests[0].model} (want the explore route)`)
  }

  // AC-5: the two observed routes must be DIFFERENT.
  if (childHeader !== undefined && parentHeader !== undefined
    && childHeader.provider === parentHeader.provider && childHeader.model === parentHeader.model) {
    problems.push(`AC-5 violated: parent and child observed on the SAME route ${parentHeader.provider}/${parentHeader.model}`)
  }

  verdict = routeLogVerdict({ childEvents: childLog.events, parentEvents: parentLog.events })
  console.log(`T15-PROOF verdict inputs: child route via ${verdict.child?.via ?? 'MISSING'} (${verdict.child?.provider ?? '?'}/${verdict.child?.model ?? '?'}), parent route via ${verdict.parent?.via ?? 'MISSING'} (${verdict.parent?.provider ?? '?'}/${verdict.parent?.model ?? '?'})`)
  if (verdict.verdict !== 'logged') problems.push(`routeLogVerdict selected '${verdict.verdict}' on the real logs (want 'logged')`)
  if (verdict.child?.via !== 'subagent/descriptor') problems.push(`child route must come from the descriptor (strongest pre-turn record), got via=${verdict.child?.via ?? 'MISSING'}`)
}

if (problems.length > 0) {
  console.error(`T15-PROOF FAIL: ${problems.join('; ')}`)
  process.exit(1)
}
console.log(`P-7 verdict: ${verdict.verdict}`)
console.log('T15-PROOF PASS: the installed rc.6 session JSONL records BOTH agents\' RESOLVED routes — the continuable child\'s declared route in `subagent/descriptor` (data.agentProvider/data.agentModel, resolved request-wins over parent at continuation.ts:413-414 ≡ lib/index.js:779-780) AND each agent\'s executed route in `request/header` (data.header.config.provider/model, agent-loop/src/agent.ts:466 ≡ dsh-agent-loop/lib/index.js:710-716); parent and child observed on two DIFFERENT routes (AC-5), and the dispatch reached the adapter boundary on those exact routes — no listener code needed')
