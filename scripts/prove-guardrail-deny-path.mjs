#!/usr/bin/env node
// scripts/prove-guardrail-deny-path.mjs — P3-T19 (plan §4.7 门 8; R-9): the
// session-level proof that a Phase 3 B-mode guardrail really REFUSES, and that
// a throwing listener fails the ONE call without killing the pipeline.
//
// Precedent: scripts/prove-explore-toolfilter.mjs (T12). Same discipline — the
// INSTALLED dsh's own modules do the work, a real registry is built in-process,
// and only the leaves are stubs; no LLM, no network, no boot.
//
// What is REAL here:
//   * the materialized concerto composition (argv[2]) — the prometheus row's
//     OWN toolFilter is read from the file the installer ships;
//   * @deepseek-ai/dsh-tool-subagent applyChildComposition → tools.restrict,
//     i.e. the exact child-composition path a delegated subagent runs;
//   * @deepseek-ai/dsh-tools ToolRuntime.execute — the full staged scheduler:
//     prepareExecution → the real `tools/pre-execute` waterfall → deny
//     materialization (`Error: ${reason}`, isError, dsh-tools:3127-3140) →
//     dispatch → the real `tools/post-execute` waterfall → finalize;
//   * the plugin's OWN registrar `registerPrometheusMdOnly` (imported from
//     patches/omo-dsh/omo-hooks/src/hooks/prometheus-md-only.ts) driven through
//     the manifest row (HOOK_MANIFEST) — never a restated event literal;
//   * the plugin's OWN reason/reminder text and persona anchor constants, so a
//     wording drift fails this proof instead of passing a stale copy.
//
// What is stubbed (declared honestly): the tool BODIES (they only count calls),
// the agent identity leaf (`session.ownEvents()` → a descriptor carrying the
// `omo-prometheus` persona), and the `tools/pre-execute` / `tools/post-execute`
// observers the R-9 half registers.
//
// Parts:
//   ① the B-mode DENY decision is effective, at session level, in both filters:
//      ①a the prometheus row's OWN read-only class filter hides write/edit and
//          every delegation tool from the child scope (defence in depth: the
//          guard's own gate is structurally unreachable for a real prometheus
//          delegation);
//      ①b with the filter relaxed exactly the way the P3-T16 e2e relaxes it in
//          its sandbox preset (write/edit dropped from the deny list), the
//          listener itself refuses a non-.md write: isError, reason verbatim,
//          `Error: [prometheus-md-only] …`, body NEVER dispatched;
//      ①c control: the same relaxed child writing `.omo/plans/*.md` is ALLOWED
//          (body dispatched) and its D-half appends the workflow reminder;
//      ①d control: the same non-.md write from a child WITHOUT the prometheus
//          descriptor is allowed — the identity gate is not "everyone";
//   ② R-9 (listener throw semantics; the plan revision corrected the draft's
//      "freeze every tool call" wording to "this call only"):
//      ②a a throwing `tools/pre-execute` listener → that call is an isError
//          final-result and BYPASSES `tools/post-execute` entirely (the
//          dsh-tools prepareExecution catch);
//      ②b the next call succeeds and its post-execute listeners DO run (the
//          pipeline is alive — one bad listener is not a dead harness);
//      ②c a throwing `tools/post-execute` listener replaces an already
//          DISPATCHED successful result with an isError (the documented LOSSY
//          half of R-9; the body had already run);
//      ②d the call after that succeeds again;
//      ②e the REAL guard's own fail-open discipline: an execution whose
//          identity read throws (a `session` accessor that throws) is
//          ALLOWED, not blocked — a throw on pre-execute is fail-CLOSED, so a
//          guard that wants "no decision" must swallow its own errors
//          (discipline ② in index.ts).
//
// Usage:
//   node scripts/prove-guardrail-deny-path.mjs <dsh-node_modules> <agent.cordis.yml>
// Exit 0 = PASS, exit 1 = FAIL (with every failed assertion printed).

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const [nm, compositionPath] = process.argv.slice(2)
if (!nm || !compositionPath) {
  console.error('usage: prove-guardrail-deny-path.mjs <dsh-node_modules> <agent.cordis.yml>')
  process.exit(1)
}

const problems = []
const fail = (message) => problems.push(message)
const note = (message) => console.log(`P3T19-PROOF ${message}`)

const imp = (p) => import(pathToFileURL(`${nm}/${p}`).href)
const yaml = (await imp('js-yaml/dist/js-yaml.mjs')).default
const { Context } = await imp('@deepseek-ai/cordis/lib/index.js')
const SystemPrompt = (await imp('@deepseek-ai/dsh-system-prompt/lib/index.js')).default
const ToolRuntime = (await imp('@deepseek-ai/dsh-tools/lib/index.js')).default
const { createScope } = await imp('@deepseek-ai/dsh-scope/lib/index.js')
const { applyChildComposition } = await imp('@deepseek-ai/dsh-subagent/lib/index.js')
const llmForId = await imp('@deepseek-ai/dsh-llm/lib/index.js')
const CallIdCtor = llmForId.ToolCallId ?? llmForId.CallId

const hooksSrc = new URL('../patches/omo-dsh/omo-hooks/src/', import.meta.url)
const {
  registerPrometheusMdOnly,
  PROMETHEUS_PERSONA_ANCHOR,
  PROMETHEUS_WORKFLOW_REMINDER,
  HOOK_NAME,
} = await import(new URL('hooks/prometheus-md-only.ts', hooksSrc).href)
const { HOOK_MANIFEST } = await import(new URL('manifest.ts', hooksSrc).href)
// The roster's delegation tool names: the read-only class filter denies them,
// and the stub palette must register them so tools.restrict() can validate the
// names (it rejects unknown global tools — T11's lazy validation).
const { DELEGATION_TOOL_NAMES } = await import(
  new URL('../patches/omo-dsh/omo-agents/src/roster.ts', import.meta.url).href
)

const manifestRow = (id) => {
  const entry = HOOK_MANIFEST.find((row) => row.id === id)
  if (entry === undefined) throw new Error(`manifest row '${id}' not found`)
  return entry
}

// ── 1. The materialized row this proof is about ─────────────────────────────
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (d) => typeof d === 'string',
  construct: (d) => ({ __jsExpr: d }),
})
const rows = yaml.load(readFileSync(compositionPath, 'utf8'), { schema: yaml.JSON_SCHEMA.extend(JsExpr) })
const prometheusRows = []
const walk = (list) => {
  for (const row of list) {
    if (row && typeof row === 'object') {
      if (row.id === 'tool-subagent-prometheus') prometheusRows.push(row)
      if (Array.isArray(row.config)) walk(row.config)
    }
  }
}
walk(rows)
if (prometheusRows.length !== 1) {
  console.error(`P3T19-PROOF FAIL: expected exactly 1 tool-subagent-prometheus row, found ${prometheusRows.length}`)
  process.exit(1)
}
const rowFilter = prometheusRows[0].config && prometheusRows[0].config.toolFilter
if (rowFilter === undefined || !Array.isArray(rowFilter.deny)) {
  console.error(`P3T19-PROOF FAIL: prometheus row carries no toolFilter.deny (got ${JSON.stringify(rowFilter)})`)
  process.exit(1)
}
const rowDeny = [...rowFilter.deny]
note(`row: tool-subagent-prometheus toolFilter.deny=${JSON.stringify(rowDeny)}`)
for (const name of ['write', 'edit']) {
  if (!rowDeny.includes(name)) fail(`prometheus row deny list does not carry '${name}' — the read-only class filter changed`)
}

// ── 2. The real stack — registry, scopes, stub bodies ──────────────────────
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
const PALETTE = ['read', 'glob', 'write', 'edit', 'probe_tool', ...DELEGATION_TOOL_NAMES]
const parentKey = { id: 'p3t19-parent-stub' }
let parentScope
await ctx.plugin(Object.assign(
  (inner) => { parentScope = createScope(inner, parentKey) },
  { inject: ['tools', 'systemPrompt'] },
))
for (const name of PALETTE) parentScope.ctx.tools.register(stubTool(name))

/** A child scope key carrying the identity leaf the guard reads. */
const childKeyWith = (id, session) => ({ id, session })
const prometheusSession = {
  header: { cwd: process.cwd() },
  ownEvents: () => [{ type: 'subagent/descriptor', data: { persona: `stub persona\n${PROMETHEUS_PERSONA_ANCHOR}\n` } }],
}
const plainSession = { header: { cwd: process.cwd() }, ownEvents: () => [] }
const makeChildScope = async (key) => {
  let scope
  await ctx.plugin(Object.assign(
    (inner) => { scope = createScope(inner, key, { parent: parentKey }) },
    { inject: ['tools', 'systemPrompt'] },
  ))
  return scope
}

const prometheusChild = childKeyWith('p3t19-prom-child', prometheusSession)
const prometheusChildScope = await makeChildScope(prometheusChild)
const plainChild = childKeyWith('p3t19-plain-child', plainSession)
const plainChildScope = await makeChildScope(plainChild)

// The REAL guard, registered from the plugin's own registrar + manifest row.
registerPrometheusMdOnly(ctx, manifestRow('prometheus-md-only'))
note('registered the real registerPrometheusMdOnly through HOOK_MANIFEST')

const visible = (key) => ctx.tools.schemas(key).map((tool) => tool.name).sort()
async function execAs(agent, name, args) {
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallIdCtor(`p3t19-${name}-${Math.random().toString(36).slice(2)}`),
    name,
    arguments: args,
    agent,
  })
  const first = result.content[0]
  return {
    text: first?.type === 'text' ? first.text : JSON.stringify(result.content),
    isError: result.isError === true,
    contexts: result.additionalContexts,
  }
}

// ── ①a. The row's OWN filter is enforced through the real child path ───────
applyChildComposition(
  prometheusChildScope.ctx,
  { id: parentKey.id, ctx: parentScope.ctx },
  { toolFilter: rowFilter },
)
const guardedVisible = visible(prometheusChild)
const leaked = rowDeny.filter((name) => guardedVisible.includes(name))
if (leaked.length > 0) fail(`①a child scope still sees denied tool(s) ${leaked.join(', ')} after the row's toolFilter`)
for (const keep of ['read', 'glob']) {
  if (!guardedVisible.includes(keep)) fail(`①a '${keep}' wrongly removed by the read-only class filter`)
}
note(`①a prometheus child visible with the row filter (${guardedVisible.length}): ${guardedVisible.join(',')}`)

// ── ①b. Relax the filter exactly like the P3-T16 e2e does, then judge ──────
const relaxedDeny = rowDeny.filter((name) => name !== 'write' && name !== 'edit')
const relaxedChild = childKeyWith('p3t19-prom-child-relaxed', prometheusSession)
const relaxedScope = await makeChildScope(relaxedChild)
applyChildComposition(
  relaxedScope.ctx,
  { id: parentKey.id, ctx: parentScope.ctx },
  { toolFilter: { deny: relaxedDeny } },
)
const relaxedVisible = visible(relaxedChild)
if (!relaxedVisible.includes('write') || !relaxedVisible.includes('edit')) {
  fail(`①b relaxed child does not see write/edit (visible: ${relaxedVisible.join(',')}) — the B-gate would be untestable`)
}
note(`①b relaxed child visible (${relaxedVisible.length}): ${relaxedVisible.join(',')}`)

bodyCalls.clear()
const denied = await execAs(relaxedChild, 'write', { file_path: 'src/p3t19-evil.ts' })
const wantReason = `Error: [${HOOK_NAME}]`
if (!denied.isError) fail(`①b non-.md write was NOT denied (text=${JSON.stringify(denied.text)})`)
if (!denied.text.startsWith(wantReason)) fail(`①b deny text=${JSON.stringify(denied.text.slice(0, 80))} (want it to start with ${JSON.stringify(wantReason)})`)
if (!denied.text.includes('src/p3t19-evil.ts')) fail('①b deny reason does not name the attempted path')
if ((bodyCalls.get('write') ?? 0) !== 0) fail('①b the write body RAN despite the deny — the decision was not authoritative')
note(`①b denied non-.md write: ${JSON.stringify(denied.text.slice(0, 120))}… (body calls: ${bodyCalls.get('write') ?? 0})`)

// ── ①c. Control: an .omo/*.md write is allowed and the D-half appends ──────
const allowed = await execAs(relaxedChild, 'write', { file_path: '.omo/plans/p3t19.md' })
if (allowed.isError) fail(`①c allowed control FAILED (text=${JSON.stringify(allowed.text.slice(0, 120))})`)
if ((bodyCalls.get('write') ?? 0) !== 1) fail(`①c the allowed control did not dispatch exactly once (body calls: ${bodyCalls.get('write') ?? 0})`)
// P3-T19 mcode [P1] fix — the reminder is a template literal that BEGINS with a
// newline (`\n\n---\n## PROMETHEUS …`, prometheus-md-only.ts:285), so the old
// marker `PROMETHEUS_WORKFLOW_REMINDER.split('\n')[0]` was the EMPTY string and
// `String.prototype.includes('')` is true for EVERY string: the assertion was
// vacuously true and stayed green even with the D half (`tools/post-execute`)
// unregistered — a structural false green. Both markers below are DERIVED from
// the constant (never hand-copied, so the wording-drift contract holds), are
// non-empty by construction, and an empty derivation is its own failure instead
// of silently degrading into `includes('')`.
const reminderMarker = PROMETHEUS_WORKFLOW_REMINDER
  .split('\n')
  .map((line) => line.trim())
  .find((line) => line.length > 0)
const reminderBody = PROMETHEUS_WORKFLOW_REMINDER.trim()
if (reminderMarker === undefined || reminderMarker.length === 0 || reminderBody.length === 0) {
  fail('①c could not derive a non-empty workflow-reminder marker from PROMETHEUS_WORKFLOW_REMINDER')
} else if (!allowed.text.includes(reminderBody)) {
  fail('①c the allowed plans write carries no D-half workflow reminder (derived marker '
    + `${JSON.stringify(reminderMarker)}, ${reminderBody.length}-char body absent)`)
}
note('①c control: .omo/plans/*.md write allowed (body dispatched) and the D-half reminder appended')

// ── ①d. Control: without the prometheus descriptor the same write passes ───
const plain = await execAs(plainChild, 'write', { file_path: 'src/p3t19-evil.ts' })
if (plain.isError) fail(`①d identity control FAILED: a non-prometheus child was denied (${JSON.stringify(plain.text.slice(0, 120))})`)
note('①d control: a child without the omo-prometheus descriptor is allowed')

// ── ② R-9: a throwing listener fails THIS call; the pipeline survives ──────
let postExecuteRuns = 0
ctx.on('tools/pre-execute', (exec, next) => {
  if (exec.name === 'probe_tool' && exec.arguments && exec.arguments.preBoom === true) {
    throw new Error('p3t19-pre-listener-boom')
  }
  return next()
})
ctx.on('tools/post-execute', (exec, result, next) => {
  if (exec.name === 'probe_tool') postExecuteRuns += 1
  if (exec.name === 'probe_tool' && exec.arguments && exec.arguments.postBoom === true) {
    throw new Error('p3t19-post-listener-boom')
  }
  return next()
})

bodyCalls.clear()
postExecuteRuns = 0
const preThrew = await execAs(relaxedChild, 'probe_tool', { preBoom: true })
if (!preThrew.isError) fail('②a a throwing pre-execute listener did NOT fail the call')
if (!preThrew.text.includes('p3t19-pre-listener-boom')) fail(`②a the failure does not carry the listener error (${JSON.stringify(preThrew.text)})`)
if (postExecuteRuns !== 0) fail(`②a post-execute ran ${postExecuteRuns} time(s) on the failed call — expected the final-result bypass`)
if ((bodyCalls.get('probe_tool') ?? 0) !== 0) fail('②a the tool body ran although prepareExecuted threw')
note('②a throwing pre-execute listener → isError final-result, post-execute bypassed, body never dispatched')

const normal = await execAs(relaxedChild, 'probe_tool', {})
if (normal.isError) fail('②b the call after the throw did NOT succeed')
if ((bodyCalls.get('probe_tool') ?? 0) !== 1) fail('②b the following call did not dispatch its body')
if (postExecuteRuns !== 1) fail(`②b post-execute did not run for the following call (runs=${postExecuteRuns})`)
note('②b pipeline alive: the next call succeeds and its post-execute listeners run')

const postThrew = await execAs(relaxedChild, 'probe_tool', { postBoom: true })
if (!postThrew.isError) fail('②c a throwing post-execute listener did NOT replace the successful result')
if (!postThrew.text.includes('p3t19-post-listener-boom')) fail(`②c the lossy failure does not carry the listener error (${JSON.stringify(postThrew.text)})`)
// P3-T19 mcode [P3] fix — the old text ("the post-execute throw happened before
// the body dispatched") named a state the dsh-tools scheduler cannot reach:
// dispatchScheduledExecution runs BEFORE finalizeScheduledExecution →
// postExecute (dsh-tools lib/index.js; invariant.js:83 "tools/post-execute must
// follow tools/pre-execute or tools/execute"). A throwing post-execute listener
// therefore always fires AFTER the body ran, so that story sent a reader hunting
// a reordering bug that cannot exist. State the real condition — the cumulative
// probe_tool body count (1 from ②b + 1 from ②c) — with the value observed.
if ((bodyCalls.get('probe_tool') ?? 0) !== 2) fail(`②c body dispatch count is not 2 (expected 1 from ②b + 1 from ②c, got ${bodyCalls.get('probe_tool') ?? 0})`)
note('②c throwing post-execute listener → dispatched success replaced by isError (documented lossy half)')

const after = await execAs(relaxedChild, 'probe_tool', {})
if (after.isError) fail('②d the call after the post-execute throw did NOT succeed')
note('②d pipeline still alive after the post-execute throw')

// ── ②e. The real guard's own fail-open discipline (index.ts discipline ②) ──
const boomChild = { id: 'p3t19-boom-child', get session() { throw new Error('p3t19-session-getter-boom') } }
const boomScope = await makeChildScope(boomChild)
applyChildComposition(
  boomScope.ctx,
  { id: parentKey.id, ctx: parentScope.ctx },
  { toolFilter: { deny: relaxedDeny } },
)
const failOpen = await execAs(boomChild, 'write', { file_path: 'src/p3t19-evil.ts' })
if (failOpen.isError) {
  fail(`②e the real guard did NOT fail open on a throwing identity read (${JSON.stringify(failOpen.text.slice(0, 120))})`)
}
note("②e real guard fail-open: a throwing identity read leaves the call ALLOWED (a pre-execute throw would be fail-closed)")

// ── Report ─────────────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error(`P3T19-PROOF FAIL: ${problems.join('; ')}`)
  process.exit(1)
}
console.log('P3T19-PROOF PASS: B-mode deny effective at session level (row filter enforced through the real '
  + 'applyChildComposition → tools.restrict child path; the relaxed-filter listener denies a non-.md write with '
  + `"${wantReason} …" isError and never dispatches the body; .omo/*.md allowed with the D-half reminder; a `
  + 'non-prometheus child unaffected) AND R-9 honoured (throwing pre-execute → this call isError + post-execute '
  + 'bypassed, throwing post-execute → lossy isError, later calls normal, real guard fails open on its own '
  + 'identity-read throw)')
