#!/usr/bin/env node
// scripts/prove-explore-toolfilter.mjs — T12 (P-4, AC-6 negative-a); updated by
// P2-T15 for the roster-computed deny list: session-free proof that the
// concerto explore row's `toolFilter.deny` is ENFORCED through dsh's real
// child-composition path — not merely present as config text. A live model
// session closes the loop in T20; this script proves everything up to the model
// boundary by executing the installed dsh's own modules (read-only, exactly
// like T11's validator):
//
// The deny list is no longer the F1-era inline triple `[write, edit, explore]`:
// it is the read-only CLASS list computed by roster.ts's `denyToolNamesFor` —
// `[write, edit, ...DELEGATION_TOOL_NAMES]`, i.e. the two mutation tools plus
// ALL TEN delegation toolNames (explore, hephaestus, oracle, librarian,
// plan-consultant, plan-reviewer, atlas, multimodal-looker, sisyphus-junior,
// prometheus). This proof IMPORTS that list from roster.ts — the same single
// source the renderer consumes — so it follows the roster instead of restating
// it, and it also asserts the composed row's filter EQUALS that list (without
// that check the proof would validate the row against its own, possibly
// weakened, filter).
//
//   js-yaml (JSON_SCHEMA + !!js, the dialect dsh-app-boot loads compositions
//     with) parses the MATERIALIZED agent.cordis.yml;
//   @deepseek-ai/dsh-tool-subagent Config (schemastery) validates the explore
//     row — the value dsh passes as `request.toolFilter`
//     (tool-subagent src/index.ts:385; rc.6 lib/index.js:230);
//   @deepseek-ai/cordis Context + @deepseek-ai/dsh-system-prompt +
//     @deepseek-ai/dsh-tools build a real registry;
//   @deepseek-ai/dsh-scope createScope mints a parent agent-plane scope holding
//     the concerto tool roster and a CHILD scope bound under it — the same
//     ancestor layering composeFrom() produces for a real child
//     (agent-presets src/index.ts:316-325 binds the child key to the parent's
//     standing-mount scope, so preset rows are ANCESTOR contributions, the
//     exact branch ToolRuntime.view() filters: core/tools src/index.ts:1152-1193);
//   @deepseek-ai/dsh-subagent applyChildComposition — the REAL function every
//     in-process child runs in its creation window (subagent src/
//     child-agent.ts:163-175; rc.6 lib/index.js:570-583; called by the
//     continuation manager at continuation.ts:1003 and by the one-shot driver
//     at subagent-in-process-driver src/index.ts:122) — applies the row's
//     toolFilter via childCtx.tools.restrict().
//
// The denial becomes effective at exactly one place: restrict() appends a
// compiled {deny:Set} to the child scope's layer (core/tools src/index.ts:1071
// -1098; rc.6 lib/index.js:2772-2786), and view() then excludes any inherited
// name a layer does not admit (`layers.every(layer => layer.admits(name))`,
// src/index.ts:1174; rc.6 lib/index.js:2850). Consequences asserted below:
//   * schemas(childKey) — the model-facing tool list a presenter renders —
//     contains neither `write` nor `edit` NOR ANY of the ten delegation tools
//     (the read-only child never sees another agent's tool either);
//   * get/resolveExecution return undefined for all of them, so a hallucinated
//     call surfaces ToolNotFoundError UNKNOWN_TOOL, indistinguishable from a
//     tool that does not exist (src/index.ts:1204-1226; ToolNotFoundError :494);
//   * read/grep/glob/read_image + the platform shell (bash here, pwsh on win32)
//     survive — the deliberate OMO-faithful read-only surface (verdict (a), see
//     the T12 evidence log; read_image is the H-1 vision entry point);
//   * the parent scope's own view is untouched (restrictions are child-scoped).
//
// Modes:
//   (default)            expect-denied gate — the proofs above must ALL hold.
//   --expect reachable   failure-mode control for QA: run against a copy of
//                        the composition with the toolFilter block REMOVED;
//                        write/edit must be visible AND executable, proving the
//                        denied-mode assertions are sensitive, not vacuous.
//   --deny-extra <name>  unknown-name control: adds <name> to the deny list
//                        and expects applyChildComposition to throw
//                        "tools.restrict() names unknown global tool" verbatim
//                        (re-confirms T11's lazy-validation finding through the
//                        real path, and demonstrates why the platform-gated
//                        shell name can never be in the static deny list).
//
// Usage:
//   node scripts/prove-explore-toolfilter.mjs <dsh-node_modules> <agent.cordis.yml> [--expect denied|reachable] [--deny-extra <name>]
// Exit 0 = PASS (mode-dependent), exit 1 = FAIL.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// The deny list this proof asserts is the roster's read-only class list
// (P2-T15). Import it from roster.ts — the single source the renderer itself
// consumes — through Node 24 type-stripping (P-8.6), the same move
// scripts/doctor-lite.mjs makes.
const { DELEGATION_TOOL_NAMES, MUTATION_TOOL_NAMES } = await import(
  new URL('../patches/omo-dsh/omo-agents/src/roster.ts', import.meta.url).href
)
const ROSTER_READ_ONLY_DENY = [...MUTATION_TOOL_NAMES, ...DELEGATION_TOOL_NAMES]

const [nm, compositionPath, ...flags] = process.argv.slice(2)
if (!nm || !compositionPath) {
  console.error('usage: prove-explore-toolfilter.mjs <dsh-node_modules> <agent.cordis.yml> [--expect denied|reachable] [--deny-extra <name>]')
  process.exit(1)
}
const expectMode = flags.includes('--expect') ? flags[flags.indexOf('--expect') + 1] : 'denied'
if (expectMode !== 'denied' && expectMode !== 'reachable') {
  console.error(`T12-PROOF FAIL: --expect must be denied|reachable, got "${expectMode}"`)
  process.exit(1)
}
const denyExtra = flags.includes('--deny-extra') ? flags[flags.indexOf('--deny-extra') + 1] : undefined

const imp = (p) => import(pathToFileURL(`${nm}/${p}`).href)
const yaml = (await imp('js-yaml/dist/js-yaml.mjs')).default
const { Config } = await imp('@deepseek-ai/dsh-tool-subagent/lib/index.js')
const { Context } = await imp('@deepseek-ai/cordis/lib/index.js')
const SystemPrompt = (await imp('@deepseek-ai/dsh-system-prompt/lib/index.js')).default
const ToolRuntime = (await imp('@deepseek-ai/dsh-tools/lib/index.js')).default
const { createScope } = await imp('@deepseek-ai/dsh-scope/lib/index.js')
const { applyChildComposition } = await imp('@deepseek-ai/dsh-subagent/lib/index.js')
// 0.1.2 renamed the dsh-llm branded tool-call-id constructor CallId ->
// ToolCallId (packages/llm/llm/lib/index.js:31,:1825); rc.6/rc.7 export CallId.
const llmForId = await imp('@deepseek-ai/dsh-llm/lib/index.js')
const CallIdCtor = llmForId.ToolCallId ?? llmForId.CallId

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
  console.error(`T12-PROOF FAIL: expected exactly 1 tool-subagent-explore row, found ${found.length}`)
  process.exit(1)
}
let validated
try {
  validated = Config(found[0].config)
} catch (err) {
  console.error(`T12-PROOF FAIL: dsh-tool-subagent Config rejected the row: ${err.name}: ${err.message}`)
  process.exit(1)
}
let toolFilter = validated.toolFilter
// The composed row must BE the roster's read-only class list (P2-T15):
// reading the row's own filter without this check would let a weakened
// composition pass its own weaker expectation — the same vacuity the
// --expect reachable control guards against from the other side.
if (expectMode === 'denied' && denyExtra === undefined
  && JSON.stringify(toolFilter) !== JSON.stringify({ deny: ROSTER_READ_ONLY_DENY })) {
  console.error(`T12-PROOF FAIL: composed explore deny=${JSON.stringify(toolFilter)} `
    + `(want the roster read-only class list ${JSON.stringify(ROSTER_READ_ONLY_DENY)})`)
  process.exit(1)
}
if (denyExtra !== undefined) {
  toolFilter = { ...(toolFilter ?? {}), deny: [...(toolFilter?.deny ?? []), denyExtra] }
}
console.log(`T12-PROOF row: toolName=${validated.toolName} toolFilter=${JSON.stringify(validated.toolFilter)}`
  + (denyExtra !== undefined ? ` (test-mutated: deny += "${denyExtra}")` : ''))

// ── 2. Build the real registry with the concerto roster on a parent scope ───
const ctx = new Context()
await ctx.plugin(SystemPrompt, {})
await ctx.plugin(ToolRuntime)

// Plain ToolDefinition shells (the shape dsh's own scoped.spec.ts registers):
// restriction semantics live in the registry, not in tool bodies. The roster
// mirrors the materialized concerto composition's model-facing tools
// (read/write/edit/read_image from tool-fs, glob/grep from tool-fs-search,
// the platform-gated shell, the ten named delegation tools of the P2-T15
// roster, and the remaining rows' tool names). The T11-era generic
// `subagent`/`subagent_fork` names are GONE from the composition (F1) and so
// are gone here: the stub roster tracks the real one.
const stubTool = (name) => ({
  name,
  description: `probe stub for ${name}`,
  parameters: { type: 'object', properties: {} },
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
  execute: () => Promise.resolve(`ran:${name}`),
})
const SHELL = process.platform === 'win32' ? 'pwsh' : 'bash'
const CONCERTO_TOOLS = [
  'read', 'write', 'edit', 'read_image', // tool-fs
  'glob', 'grep', // tool-fs-search
  SHELL, // tool-bash (non-win32) / tool-pwsh (win32), platform-gated rows
  'job_list', 'job_output', 'job_kill', // tool-jobs
  'skill', // tool-skill
  'create_goal', 'get_goal', 'update_goal', // tool-goal
  ...DELEGATION_TOOL_NAMES, // delegation group: the 10 named roster rows (P2-T15)
  'ask_user_question', // tool-ask-user
  'todo_write', // tool-todo
  'web_search', // tool-web (fetch: false in the row → no web_fetch)
]

// The parent agent-plane scope plays the role of the preset's standing mount:
// composeFrom() binds a real child's scope key to exactly such an ancestor
// scope (agent-presets src/index.ts:323 bindScopeParent).
const parentKey = { id: 'concerto-parent-stub' }
let parentScope
await ctx.plugin(Object.assign(
  (inner) => { parentScope = createScope(inner, parentKey) },
  { inject: ['tools', 'systemPrompt'] },
))
for (const name of CONCERTO_TOOLS) parentScope.ctx.tools.register(stubTool(name))

const childKey = { id: 'explore-child-stub' }
let childScope
await ctx.plugin(Object.assign(
  (inner) => { childScope = createScope(inner, childKey, { parent: parentKey }) },
  { inject: ['tools', 'systemPrompt'] },
))

const childToolNames = () => ctx.tools.schemas(childKey).map((t) => t.name).sort()
async function execAsChild(name) {
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallIdCtor(`t12-probe-${name}`),
    name,
    arguments: {},
    agent: childKey,
  })
  const first = result.content[0]
  return first?.type === 'text' ? first.text : JSON.stringify(result.content)
}

const before = childToolNames()
console.log(`T12-PROOF child visible BEFORE applyChildComposition (${before.length}): ${before.join(',')}`)

// ── 3. Run the REAL child composition with the row's own toolFilter ─────────
let restrictThrew
try {
  applyChildComposition(
    childScope.ctx,
    { id: parentKey.id, ctx: parentScope.ctx },
    { ...(toolFilter !== undefined ? { toolFilter } : {}) },
  )
} catch (err) {
  restrictThrew = err
}

// Unknown-name control mode: the throw IS the expected outcome.
if (denyExtra !== undefined) {
  const msg = String(restrictThrew?.message ?? restrictThrew)
  if (restrictThrew && /unknown global tool/.test(msg) && msg.includes(`"${denyExtra}"`)) {
    console.log(`T12-PROOF UNKNOWN-NAME PASS: applyChildComposition → tools.restrict() threw verbatim: ${msg}`)
    process.exit(0)
  }
  console.error(`T12-PROOF UNKNOWN-NAME FAIL: expected unknown-global-tool throw naming "${denyExtra}", got: ${msg}`)
  process.exit(1)
}
if (restrictThrew) {
  console.error(`T12-PROOF FAIL: applyChildComposition threw: ${restrictThrew?.message ?? restrictThrew}`)
  process.exit(1)
}

const after = childToolNames()
console.log(`T12-PROOF child visible AFTER  applyChildComposition (${after.length}): ${after.join(',')}`)

const writeExec = await execAsChild('write')
const editExec = await execAsChild('edit')
const readExec = await execAsChild('read')
// The F1 case generalized: one delegation tool as the representative of the
// ten (the visible-list assertions below cover all of them).
const exploreExec = await execAsChild('explore')
console.log(`T12-PROOF exec as child: write → ${writeExec}`)
console.log(`T12-PROOF exec as child: edit → ${editExec}`)
console.log(`T12-PROOF exec as child: read → ${readExec}`)
console.log(`T12-PROOF exec as child: explore → ${exploreExec}`)
const parentSeesWrite = ctx.tools.get('write', parentKey) !== undefined
console.log(`T12-PROOF parent scope still sees write: ${parentSeesWrite}`)

// ── 4a. Failure-mode control: toolFilter removed → write/edit reachable ─────
if (expectMode === 'reachable') {
  const ok = after.includes('write') && after.includes('edit')
    && writeExec === 'ran:write' && editExec === 'ran:edit'
  if (ok) {
    console.log('T12-PROOF REACHABLE PASS: without the toolFilter row the child sees AND executes write/edit — the denied-mode assertions are sensitive, not vacuous')
    process.exit(0)
  }
  console.error(`T12-PROOF REACHABLE FAIL: expected write/edit reachable; visible=[${after.join(',')}] write="${writeExec}" edit="${editExec}"`)
  process.exit(1)
}

// ── 4b. Expect-denied gate ──────────────────────────────────────────────────
const problems = []
// Every name in the roster-computed deny list must be physically absent from
// the child's model-facing list (P2-T15: write/edit AND the ten delegation
// tools), and the read-only surface must survive intact.
for (const name of ROSTER_READ_ONLY_DENY) {
  if (after.includes(name)) problems.push(`${name} still visible to the child`)
}
for (const keep of ['read', 'read_image', 'glob', 'grep', SHELL]) {
  if (!after.includes(keep)) problems.push(`${keep} wrongly removed from the child`)
}
if (writeExec !== 'Error: unknown tool "write"') problems.push(`write exec = "${writeExec}" (want Error: unknown tool "write")`)
if (editExec !== 'Error: unknown tool "edit"') problems.push(`edit exec = "${editExec}" (want Error: unknown tool "edit")`)
if (exploreExec !== 'Error: unknown tool "explore"') problems.push(`explore exec = "${exploreExec}" (want Error: unknown tool "explore")`)
if (readExec !== 'ran:read') problems.push(`read exec = "${readExec}" (read must still run)`)
if (!parentSeesWrite) problems.push('parent scope lost write (restriction leaked upward)')
if (problems.length > 0) {
  console.error(`T12-PROOF FAIL: ${problems.join('; ')}`)
  process.exit(1)
}
console.log(`T12-PROOF PASS: deny=[${ROSTER_READ_ONLY_DENY.join(',')}] enforced by the installed dsh's real child-composition path — `
  + `the child's model-facing tool list excludes write/edit AND all ${DELEGATION_TOOL_NAMES.length} delegation tools, `
  + `execution surfaces UNKNOWN_TOOL, read/read_image/grep/glob/${SHELL} retained (OMO-faithful read-only surface), `
  + 'parent scope unaffected')
