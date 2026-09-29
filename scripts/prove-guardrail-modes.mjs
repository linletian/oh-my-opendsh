#!/usr/bin/env node
// scripts/prove-guardrail-modes.mjs — P3-T19 (plan §4.7 门 8): the
// mechanism-level proof for the two remaining listener patterns of the port —
// C (advisory via `additionalContexts`) and E (`agent.steer` continuation).
//
// Precedent: scripts/prove-explore-toolfilter.mjs (T12). The INSTALLED dsh's own
// modules do the work, a real registry is built in-process, and only the leaves
// are stubs; no LLM, no network, no boot.
//
// What is REAL here:
//   * @deepseek-ai/dsh-tools ToolRuntime.execute — the full staged scheduler,
//     so the C-mode advisory really travels the `tools/post-execute` waterfall
//     and is ferried to the caller as `result.additionalContexts`
//     (dsh-tools postExecute: `additionalContexts: [...result.additionalContexts,
//     ...decisionContexts]`);
//   * @deepseek-ai/dsh-agent agentEvents(ctx, agent).serial(...) — the exact
//     fused dispatcher dsh-agent-loop uses for `agent/turn-stopping`
//     (dsh-agent-loop lib:967), so the E-mode listener receives the real
//     `{turn, signal, agent}` payload shape;
//   * the plugin's OWN registrars, manifest events and text builders imported
//     from patches/omo-dsh/omo-hooks/src — a wording or event drift fails this
//     proof instead of passing a stale copy.
//
// What is stubbed (declared honestly): the tool BODIES (call counters), the
// steering agent (a `steer` recorder + session key) and the `sessionProjections`
// / `goals` services the E-mode reader consults.
//
// Parts:
//   ③a C mode (bash-file-read-guard, `tools/post-execute`): a simple `cat`
//       command keeps its result AND ferries exactly one advisory user message
//       whose text is the module's own WARNING_MESSAGE and whose
//       `source.plugin` is `omo-hooks`;
//   ③b C-mode control: `cat -n f` (an option — upstream's `(?!-)` lookahead)
//       produces NO advisory, so ③a is sensitive rather than vacuous;
//   ③c E mode (todo-continuation-enforcer, `agent/turn-stopping`): an
//       incomplete todo list makes the listener call `agent.steer` exactly once
//       with the module's own buildContinuationText output;
//   ③d E-mode controls: an all-complete list steers nothing; an absent
//       projection (null) steers nothing; an ACTIVE ARMED goal yields to the
//       goal round driver (R-8) and steers nothing.
//
// Usage:
//   node scripts/prove-guardrail-modes.mjs <dsh-node_modules>
// Exit 0 = PASS, exit 1 = FAIL (with every failed assertion printed).

import { pathToFileURL } from 'node:url'

const [nm] = process.argv.slice(2)
if (!nm) {
  console.error('usage: prove-guardrail-modes.mjs <dsh-node_modules>')
  process.exit(1)
}

const problems = []
const fail = (message) => problems.push(message)
const note = (message) => console.log(`P3T19-PROOF ${message}`)

const imp = (p) => import(pathToFileURL(`${nm}/${p}`).href)
const { Context } = await imp('@deepseek-ai/cordis/lib/index.js')
const SystemPrompt = (await imp('@deepseek-ai/dsh-system-prompt/lib/index.js')).default
const ToolRuntime = (await imp('@deepseek-ai/dsh-tools/lib/index.js')).default
const { createScope } = await imp('@deepseek-ai/dsh-scope/lib/index.js')
const { agentEvents } = await imp('@deepseek-ai/dsh-agent/lib/index.js')
const llmForId = await imp('@deepseek-ai/dsh-llm/lib/index.js')
const CallIdCtor = llmForId.ToolCallId ?? llmForId.CallId

const hooksSrc = new URL('../patches/omo-dsh/omo-hooks/src/', import.meta.url)
const {
  registerBashFileReadGuard,
  WARNING_MESSAGE,
  BASH_FILE_READ_GUARD_PLUGIN,
} = await import(new URL('hooks/bash-file-read-guard.ts', hooksSrc).href)
const {
  registerTodoContinuationEnforcer,
  buildContinuationText,
  TODO_CONTINUATION_ENFORCER_PLUGIN,
} = await import(new URL('hooks/todo-continuation-enforcer.ts', hooksSrc).href)
const { HOOK_MANIFEST } = await import(new URL('manifest.ts', hooksSrc).href)

const manifestRow = (id) => {
  const entry = HOOK_MANIFEST.find((row) => row.id === id)
  if (entry === undefined) throw new Error(`manifest row '${id}' not found`)
  return entry
}

// ── The real stack ─────────────────────────────────────────────────────────
const ctx = new Context()
await ctx.plugin(SystemPrompt, {})
await ctx.plugin(ToolRuntime)

const bodyCalls = new Map()
const stubTool = (name) => ({
  name,
  description: `probe stub for ${name}`,
  parameters: { type: 'object', properties: {} },
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
  execute: () => {
    bodyCalls.set(name, (bodyCalls.get(name) ?? 0) + 1)
    return Promise.resolve(`ran:${name}`)
  },
})
const parentKey = { id: 'p3t19-modes-parent-stub' }
let parentScope
await ctx.plugin(Object.assign(
  (inner) => { parentScope = createScope(inner, parentKey) },
  { inject: ['tools', 'systemPrompt'] },
))
for (const name of ['read', 'bash']) parentScope.ctx.tools.register(stubTool(name))

async function execAsChild(name, args) {
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallIdCtor(`p3t19-modes-${name}-${Math.random().toString(36).slice(2)}`),
    name,
    arguments: args,
    agent: parentKey,
  })
  const first = result.content[0]
  return {
    text: first?.type === 'text' ? first.text : JSON.stringify(result.content),
    isError: result.isError === true,
    contexts: result.additionalContexts,
  }
}

// ── ③a/③b — C mode: the advisory is ferried, once, only on a real match ────
registerBashFileReadGuard(ctx, manifestRow('bash-file-read-guard'))
note('registered the real registerBashFileReadGuard through HOOK_MANIFEST')

const advisory = await execAsChild('bash', { command: 'cat README.md' })
if (advisory.isError) fail(`③a the matched bash read FAILED (text=${JSON.stringify(advisory.text)})`)
if (advisory.text !== 'ran:bash') fail(`③a the command result was not preserved (text=${JSON.stringify(advisory.text)})`)
const advisoryContexts = advisory.contexts ?? []
if (advisoryContexts.length !== 1) {
  fail(`③a expected exactly 1 advisory context, got ${advisoryContexts.length}`)
} else {
  const message = advisoryContexts[0]
  if (message.role !== 'user') fail(`③a advisory role=${JSON.stringify(message.role)} (want user)`)
  const text = message.content?.[0]?.text
  if (text !== WARNING_MESSAGE) fail(`③a advisory text=${JSON.stringify(text)} (want the module's own WARNING_MESSAGE)`)
  if (message.source?.plugin !== BASH_FILE_READ_GUARD_PLUGIN) {
    fail(`③a advisory source.plugin=${JSON.stringify(message.source?.plugin)} (want ${BASH_FILE_READ_GUARD_PLUGIN})`)
  }
  if (message.source?.form !== 'notice') fail(`③a advisory source.form=${JSON.stringify(message.source?.form)} (want notice)`)
  if (typeof message.id !== 'string' || message.id.length === 0) fail('③a advisory carries no message id')
}
note(`③a C-mode advisory ferried: additionalContexts=[1 message, ${advisoryContexts[0]?.content?.[0]?.text?.length ?? 0} chars] with result preserved`)

const noAdvisory = await execAsChild('bash', { command: 'cat -n README.md' })
if (noAdvisory.isError) fail('③b the option-carrying control unexpectedly failed')
if ((noAdvisory.contexts ?? []).length !== 0) {
  fail(`③b control 'cat -n README.md' carried ${(noAdvisory.contexts ?? []).length} advisory context(s) (want none — upstream's (?!-) lookahead)`)
}
note('③b control: an option-carrying cat carries no advisory (③a is sensitive, not vacuous)')

// ── ③c/③d — E mode: the steer side effect and its three skips ──────────────
const e = manifestRow('todo-continuation-enforcer')
let todoProjection = [{ status: 'in_progress', content: 'finish the P3-T19 gates' }]
let activeGoal
ctx.provide('sessionProjections', { stateOf: () => todoProjection })
ctx.provide('goals', { get: () => activeGoal })
registerTodoContinuationEnforcer(ctx, e)
note(`registered the real registerTodoContinuationEnforcer through HOOK_MANIFEST (event ${e.event})`)

const steers = []
const steeringAgent = { id: 'p3t19-steering-agent', session: { header: { cwd: process.cwd() } }, steer: (message) => steers.push(message) }
const dispatchTurnStopping = () => agentEvents(ctx, steeringAgent).serial(
  e.event,
  { turn: 1, signal: new AbortController().signal },
)

await dispatchTurnStopping()
if (steers.length !== 1) {
  fail(`③c expected exactly 1 steer for an incomplete todo list, got ${steers.length}`)
} else {
  const message = steers[0]
  if (message.role !== 'user') fail(`③c steer role=${JSON.stringify(message.role)} (want user)`)
  const wantText = buildContinuationText(todoProjection)
  const gotText = message.content?.[0]?.text
  if (gotText !== wantText) fail('③c steer text != the module\'s own buildContinuationText output')
  if (message.source?.plugin !== TODO_CONTINUATION_ENFORCER_PLUGIN) {
    fail(`③c steer source.plugin=${JSON.stringify(message.source?.plugin)} (want ${TODO_CONTINUATION_ENFORCER_PLUGIN})`)
  }
}
note(`③c E-mode steer: ${steers.length} message, text == buildContinuationText(todos) (${steers[0]?.content?.[0]?.text?.length ?? 0} chars)`)

// ③d-1 — all complete: nothing to steer.
todoProjection = [{ status: 'completed', content: 'finish the P3-T19 gates' }]
await dispatchTurnStopping()
if (steers.length !== 1) fail(`③d an all-complete todo list steered again (steers=${steers.length})`)
note('③d control: an all-complete list steers nothing')

// ③d-2 — projection absent (null): capability-absent degrade, never a throw.
todoProjection = null
await dispatchTurnStopping()
if (steers.length !== 1) fail(`③d an absent projection steered (steers=${steers.length})`)
note('③d control: an absent todos projection steers nothing')

// ③d-3 — an active armed goal owns continuation (R-8): the listener yields.
todoProjection = [{ status: 'in_progress', content: 'finish the P3-T19 gates' }]
activeGoal = { phase: 'active', activation: 'armed' }
await dispatchTurnStopping()
if (steers.length !== 1) fail(`③d an active armed goal did not suppress the steer (steers=${steers.length})`)
note('③d control: an ACTIVE ARMED goal suppresses the steer (R-8 yield to the goal round driver)')

activeGoal = undefined

// ── Report ─────────────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error(`P3T19-PROOF FAIL: ${problems.join('; ')}`)
  process.exit(1)
}
console.log('P3T19-PROOF PASS: C mode ferries ONE advisory user message through the real tools/post-execute '
  + 'waterfall (module WARNING_MESSAGE, source omo-hooks/notice) while preserving the command result, and the '
  + 'option-carrying control carries none; E mode steers via the real dsh-agent agentEvents("'
  + `${e.event}") dispatch with the module's own continuation text, and steers nothing for an all-complete list, `
  + 'an absent projection, or an active armed goal (R-8)')
