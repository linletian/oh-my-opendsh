#!/usr/bin/env node
// scripts/prove-explore-maxdepth.mjs — T13 (P-5, AC-6 negative-b): session-free
// proof that the concerto explore row's `maxDepth: 1` is ENFORCED through
// dsh's real delegation start path — not merely present as config text. A
// live model session closes the loop in T20; this script proves everything up
// to the model boundary by executing the installed dsh's own modules
// (read-only, same discipline as T11's validator and T12's proof):
//
//   js-yaml (JSON_SCHEMA + !!js, the dialect dsh-app-boot loads compositions
//     with) parses the MATERIALIZED agent.cordis.yml;
//   @deepseek-ai/dsh-tool-subagent Config (schemastery) validates the explore
//     row — the value dsh folds into `request.maxDepth` at execute time
//     (tool-subagent src/index.ts:378,386; rc.6 lib/index.js:220,231);
//   @deepseek-ai/cordis Context + @deepseek-ai/dsh-system-prompt +
//     @deepseek-ai/dsh-tools + @deepseek-ai/dsh-subagent (SubagentRuntime) +
//     @deepseek-ai/dsh-subagent-spawn-in-process (the row's provider) +
//     @deepseek-ai/dsh-tool-subagent (the row's own plugin, mounted with the
//     row's own validated config) build the REAL delegation surface: the
//     model-facing `explore` tool registered on the real registry, backed by
//     the real spawn provider.
//
// The depth gate itself (all citations rc.7 source ≡ rc.6 installed lib):
//   * tool execute folds the cap: maxDepth = typeof config.maxDepth ===
//     'number' ? config.maxDepth : undefined — tool-subagent/src/index.ts:378,
//     spread into the start request at :386 ('provider-managed' sends NO cap).
//   * registry capability check: { when: request.maxDepth !== undefined, cap:
//     'depthLimit' } — subagent/src/index.ts:484 (spawn declares depthLimit:
//     true — subagent-spawn-in-process/src/index.ts:42).
//   * the calling agent's CURRENT depth: delegationDepthOf(parent) =
//     max(session.header.delegationDepth ?? 0, options.subagentDepth ?? 0) —
//     subagent/src/depth.ts:28-36; the child is stamped via
//     resolveChildAgentOptions (subagentDepth: childDepth —
//     child-agent.ts:81) and childSessionMeta (delegationDepth: childDepth —
//     child-agent.ts:117), so depth increments exactly one per level and a
//     resumed child keeps its budget.
//   * THE REJECTION: resolveChildDepth(parent, maxDepth) throws
//     SubagentDepthError(`${attempted} > ${max}`) — child-agent.ts:48-56 —
//     called on BOTH start paths before any child exists: the one-shot driver
//     (subagent-in-process-driver/src/index.ts:106-109, reached via
//     ctx.subagents.start → spawn.start) and the continuable manager
//     (subagent/src/continuation.ts:408-410, reached via
//     ctx.subagents.startContinuable — our row's default background mode).
//   * THE TOOL-BOUNDARY CONTRACT (README: "The tool stays visible at the cap;
//     each attempted start ... returns an errored tool result when rejected"):
//     the throw propagates out of the tool's execute() and the tool runtime
//     converts it — core/tools/src/index.ts:1554-1555 → toolErrorResult
//     :1870-1877 — into { isError: true, content: [{ type: 'text', text:
//     `Error: subagent depth 2 exceeds maxDepth 1` }] }. The tool remains
//     registered and model-visible throughout.
//
// Session-free honesty: the parent is a stub Agent surface (id/options/
// session.header/ctx) carried by a REAL scope key. The depth gate reads only
// options.subagentDepth + session.header.delegationDepth, so the rejection is
// exercised bit-for-bit. For PASS controls the gate lets the start through to
// the next real call — parent.ctx.agents.create — which the stub answers with
// a distinctive sentinel error; reaching the sentinel proves the gate passed
// (a real session creates the child there; that half closes in T20).
//
// Modes:
//   (default)                  capped gate — the committed row (maxDepth: 1):
//                              a depth-1 parent is rejected on BOTH the
//                              foreground path (run_in_background: false →
//                              ctx.subagents.start) and the row's default
//                              continuable path (startContinuable) with the
//                              exact errored tool result; a depth-0 parent
//                              PASSES the same gate (factory sentinel);
//                              `explore` stays model-visible before and after.
//   --expect passed            failure-mode control for QA: run against a
//                              copy of the composition with maxDepth: 2 — the
//                              depth-1 parent must PASS the gate, proving the
//                              capped-mode assertions are sensitive to the
//                              cap value, not vacuous.
//   --expect default3          P-5 default documentation: run against a copy
//                              with the maxDepth key REMOVED — the schema
//                              default must be 3 (tool-subagent/src/index.ts:98):
//                              a depth-3 parent is rejected ("depth 4 exceeds
//                              maxDepth 3"), a depth-2 parent passes.
//   --expect provider-managed  P-5 union-member semantics: run against a copy
//                              with maxDepth: provider-managed — no cap is
//                              sent (execute folds undefined), so the depth-1
//                              parent passes dsh's gate; the provider owns the
//                              recursion budget (for out-of-process backends).
//
// Usage:
//   node scripts/prove-explore-maxdepth.mjs <dsh-node_modules> <agent.cordis.yml> [--expect capped|passed|default3|provider-managed]
// Exit 0 = PASS (mode-dependent), exit 1 = FAIL.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const [nm, compositionPath, ...flags] = process.argv.slice(2)
if (!nm || !compositionPath) {
  console.error('usage: prove-explore-maxdepth.mjs <dsh-node_modules> <agent.cordis.yml> [--expect capped|passed|default3|provider-managed]')
  process.exit(1)
}
const expectMode = flags.includes('--expect') ? flags[flags.indexOf('--expect') + 1] : 'capped'
const MODES = ['capped', 'passed', 'default3', 'provider-managed']
if (!MODES.includes(expectMode)) {
  console.error(`T13-PROOF FAIL: --expect must be ${MODES.join('|')}, got "${expectMode}"`)
  process.exit(1)
}

const imp = (p) => import(pathToFileURL(`${nm}/${p}`).href)
const yaml = (await imp('js-yaml/dist/js-yaml.mjs')).default
const ToolSubagent = await imp('@deepseek-ai/dsh-tool-subagent/lib/index.js')
const { Context } = await imp('@deepseek-ai/cordis/lib/index.js')
const SystemPrompt = (await imp('@deepseek-ai/dsh-system-prompt/lib/index.js')).default
const ToolRuntime = (await imp('@deepseek-ai/dsh-tools/lib/index.js')).default
const { createScope } = await imp('@deepseek-ai/dsh-scope/lib/index.js')
const SubagentRuntime = (await imp('@deepseek-ai/dsh-subagent/lib/index.js')).default
const SpawnProvider = await imp('@deepseek-ai/dsh-subagent-spawn-in-process/lib/index.js')
const { CallId } = await imp('@deepseek-ai/dsh-llm/lib/index.js')

// ── 1. Parse + validate the real materialized row ───────────────────────────
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (d) => typeof d === 'string',
  construct: (d) => ({ __jsExpr: d }),
})
const rows = yaml.load(readFileSync(compositionPath, 'utf8'), { schema: yaml.JSON_SCHEMA.extend(JsExpr) })
const found = []
const walk = (list) => {
  for (const row of list) {
    if (row && typeof row === 'object') {
      if (row.id === 'tool-subagent-explore') found.push(row)
      if (Array.isArray(row.config)) walk(row.config)
    }
  }
}
walk(rows)
if (found.length !== 1) {
  console.error(`T13-PROOF FAIL: expected exactly 1 tool-subagent-explore row, found ${found.length}`)
  process.exit(1)
}
let validated
try {
  validated = ToolSubagent.Config(found[0].config)
} catch (err) {
  console.error(`T13-PROOF FAIL: dsh-tool-subagent Config rejected the row: ${err.name}: ${err.message}`)
  process.exit(1)
}
const expectedMax = { capped: 1, passed: 2, default3: 3, 'provider-managed': 'provider-managed' }[expectMode]
if (validated.maxDepth !== expectedMax) {
  console.error(`T13-PROOF FAIL: mode ${expectMode} expects validated maxDepth=${expectedMax}, got ${JSON.stringify(validated.maxDepth)}`)
  process.exit(1)
}
console.log(`T13-PROOF row: toolName=${validated.toolName} provider=${validated.provider} backgroundMode=${validated.backgroundMode} maxDepth=${JSON.stringify(validated.maxDepth)}`)

// ── 2. Build the REAL delegation stack and mount the row's own tool ─────────
const ctx = new Context()
await ctx.plugin(SystemPrompt, {})
await ctx.plugin(ToolRuntime)
// Continuable-path service presence stubs: the continuation manager requires
// the agents service to exist and session persistence to be resolvable. The
// depth gate throws before either is exercised, so empty Service instances
// suffice (their only role is to make the REAL start path reachable, exactly
// like a booted deployment where dsh-agent-loop and a persistence backend
// are up). cordis 4 registers services via Service subclasses (ctx.provide is
// the reflect-level API; a Service class plugin is the dsh pattern).
const { Service } = await imp('@deepseek-ai/cordis/lib/index.js')
class StubAgents extends Service { static provide = 'agents' }
class StubSessionPersistence extends Service { static provide = 'sessionPersistence' }
await ctx.plugin(StubAgents)
await ctx.plugin(StubSessionPersistence)
await ctx.plugin(SubagentRuntime)
await ctx.plugin(SpawnProvider, { providerName: 'spawn' })
// The row's OWN plugin mounted with the row's OWN raw config — the same
// schemastery validation + apply() cordis runs at session composition.
await ctx.plugin(ToolSubagent, found[0].config)
// Let any deferred inject callbacks (continuation-manager binding) settle.
await new Promise((resolve) => setImmediate(resolve))

// ── 3. Stub parents on REAL scope keys ──────────────────────────────────────
// The gate reads options.subagentDepth + session.header.delegationDepth; the
// pass-control then reaches parent.ctx.agents.create, answered with a
// distinctive sentinel. Depth 0 omits subagentDepth entirely (top-level shape,
// per dsh's own spawn test: parent.options.subagentDepth === undefined).
const SENTINEL = 'T13-PROBE-REACHED-AGENT-FACTORY (depth gate passed; session-free boundary)'
const parentKeys = new Map()
async function parentAt(depth) {
  if (!parentKeys.has(depth)) {
    const key = { id: `t13-parent-depth-${depth}` }
    await ctx.plugin(Object.assign(
      (inner) => { createScope(inner, key) },
      { inject: ['tools', 'systemPrompt'] },
    ))
    Object.assign(key, {
      options: { provider: 't13-stub', model: 't13-stub', ...(depth > 0 ? { subagentDepth: depth } : {}) },
      session: { header: {} },
      ctx: {
        get: () => undefined,
        agents: { create: () => Promise.reject(new Error(SENTINEL)) },
      },
    })
    parentKeys.set(depth, key)
  }
  return parentKeys.get(depth)
}

const visibleTo = (key) => ctx.tools.schemas(key).map((t) => t.name)
async function execExplore(parentKey, background) {
  const args = { description: 'probe nested delegation', prompt: 't13 probe' }
  if (!background) args.run_in_background = false
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId(`t13-probe-${background ? 'cont' : 'fg'}-d${parentKey.options.subagentDepth ?? 0}`),
    name: 'explore',
    arguments: args,
    agent: parentKey,
  })
  const first = result.content[0]
  return { isError: result.isError === true, text: first?.type === 'text' ? first.text : JSON.stringify(result.content) }
}

const problems = []
function expectRejection(outcome, attempted, max, label) {
  const want = `Error: subagent depth ${attempted} exceeds maxDepth ${max}`
  console.log(`T13-PROOF ${label}: ${outcome.text} (isError=${outcome.isError})`)
  if (!outcome.isError) problems.push(`${label}: expected an errored tool result, got isError=${outcome.isError}`)
  if (outcome.text !== want) problems.push(`${label}: text = "${outcome.text}" (want exactly "${want}")`)
}
function expectGatePassed(outcome, label) {
  const want = `Error: ${SENTINEL}`
  console.log(`T13-PROOF ${label}: ${outcome.text} (isError=${outcome.isError})`)
  if (/exceeds maxDepth/.test(outcome.text)) problems.push(`${label}: WRONGLY rejected at the depth gate: "${outcome.text}"`)
  if (outcome.text !== want) problems.push(`${label}: text = "${outcome.text}" (want the factory sentinel "${want}")`)
}

// ── 4. Mode matrix ──────────────────────────────────────────────────────────
if (expectMode === 'capped') {
  const depth1 = await parentAt(1)
  const before = visibleTo(depth1)
  console.log(`T13-PROOF explore visible to depth-1 parent BEFORE attempts: ${before.includes('explore')}`)
  if (!before.includes('explore')) problems.push('explore tool not visible to the depth-1 parent (the cap must NOT hide the tool)')

  expectRejection(await execExplore(depth1, false), 2, 1, 'foreground start (run_in_background:false → ctx.subagents.start) at depth 1')
  expectRejection(await execExplore(depth1, true), 2, 1, 'continuable start (row default → ctx.subagents.startContinuable) at depth 1')

  const depth0 = await parentAt(0)
  expectGatePassed(await execExplore(depth0, false), 'control: depth-0 parent foreground start passes the same gate')

  const after = visibleTo(depth1)
  console.log(`T13-PROOF explore visible to depth-1 parent AFTER rejection: ${after.includes('explore')}`)
  if (!after.includes('explore')) problems.push('explore tool disappeared after the rejection (must stay model-visible at the cap)')
} else if (expectMode === 'passed') {
  const depth1 = await parentAt(1)
  expectGatePassed(await execExplore(depth1, false), 'maxDepth=2: depth-1 parent foreground start')
} else if (expectMode === 'default3') {
  const depth3 = await parentAt(3)
  expectRejection(await execExplore(depth3, false), 4, 3, 'default maxDepth=3: depth-3 parent foreground start')
  const depth2 = await parentAt(2)
  expectGatePassed(await execExplore(depth2, false), 'default maxDepth=3: depth-2 parent foreground start')
} else if (expectMode === 'provider-managed') {
  const depth1 = await parentAt(1)
  expectGatePassed(await execExplore(depth1, false), "'provider-managed': depth-1 parent foreground start (no cap sent)")
}

// ── 5. Verdict ──────────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error(`T13-PROOF FAIL: ${problems.join('; ')}`)
  process.exit(1)
}
const PASS_LINES = {
  capped: 'T13-PROOF PASS: maxDepth=1 enforced by the real delegation start path — the depth-1 explore child is rejected on BOTH the foreground (ctx.subagents.start → spawn → startInProcessRun) and continuable (ctx.subagents.startContinuable) starts with the exact errored tool result "Error: subagent depth 2 exceeds maxDepth 1" (isError=true), the explore tool stays model-visible at the cap, and a depth-0 parent PASSES the same gate (control)',
  passed: 'T13-PROOF PASSED-GATE PASS: with maxDepth=2 the depth-1 child PASSES the depth gate (agent-factory boundary reached) — the capped-mode rejection is sensitive to the cap value, not vacuous',
  default3: 'T13-PROOF DEFAULT-3 PASS: maxDepth absent → schemastery default 3 (P-5): a depth-3 parent is rejected with "Error: subagent depth 4 exceeds maxDepth 3" and a depth-2 parent passes — the default semantics match the documented contract',
  'provider-managed': 'T13-PROOF PROVIDER-MANAGED PASS: maxDepth: \'provider-managed\' sends no cap (execute folds undefined) — the depth-1 parent passes dsh\'s gate; the recursion budget belongs to the provider (out-of-process backends)',
}
console.log(PASS_LINES[expectMode])
