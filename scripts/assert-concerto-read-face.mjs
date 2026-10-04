// argv: <dsh nm dir> <content file> <roster expectations json> <explore provider> <explore model> <expected !!js count>
// SIX arguments, consumed by TWO callers (scripts/concerto-mode-probe.sh and
// tests/e2e/drive.mjs). The 6th is the expected `!!js` gate count, derived by
// each caller from the WRITE face. This comment is the contract's only written
// form, and it previously listed five — the omission is exactly how the missing
// 6th argument travelled between the two consumers unnoticed.
// scripts/verify-concerto-static.mjs now pins the arity of both call sites.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const [nm, contentPath, expectPath, expectedProvider, expectedModel, expectedJsCountRaw] = process.argv.slice(2)
// The expected number of `!!js` gates comes from OUTSIDE this face — the
// probe passes the count it greps off the materialized file, which both faces
// are rendered from. Self-counting cannot catch silent degradation: dropping a
// tag removes one from the text count AND one from the node count, so the two
// stay equal and the face stays green (that was MINOR-2's real shape — my
// first fix, `jsExprNodes === jsLines.length`, was still self-referential and
// was measured passing a single-tag degradation). An external expected count
// is the only thing that turns 'a tag became a string' into a failure.
const expectedJsCount = Number(expectedJsCountRaw)
const yaml = (await import(pathToFileURL(nm + '/js-yaml/dist/js-yaml.mjs').href)).default
// The loader's OWN dialect, so `!!js` reads as declared (same full-qualified
// tag the include schema uses; construct-only is enough for a LOAD).
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
})
const text = readFileSync(contentPath, 'utf8')
const rows = yaml.load(text, { schema: yaml.JSON_SCHEMA.extend(JsExpr) })
const expectations = JSON.parse(readFileSync(expectPath, 'utf8'))
const problems = []

const walk = (list, visit) => {
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    visit(row)
    if (Array.isArray(row.config)) walk(row.config, visit)
  }
}
if (!Array.isArray(rows)) {
  console.error('READ-FACE FAIL: content did not parse to an entry list')
  process.exit(1)
}

// Negative: no sentinel residue may reach the face the runtime actually reads.
if (text.includes('__OMO_')) {
  const residue = [...new Set(text.match(/__OMO_[A-Z_]+__/g) ?? [])]
  problems.push(`read content carries surviving sentinel residue: ${residue.join(', ')}`)
}

// Text anchors that survive the dump (measured on a real 0.2.0-rc.2 boot):
// the block scalars and the row/indent anchors stay line-stable, so they are
// still worth pinning as text.
// ⚠️ /m is REQUIRED on every one of these: without it `^` anchors to the
// START OF THE STRING. The first version of this face shipped exactly that
// bug and went RED against a real boot where the block scalars sit at line 4
// (`prefix: |-`) and line 199 (`persona: |-`) — archived as
// scenario-runner-2nd-attempt-FAILED.log and -3rd-attempt-FAILED.log. A gate
// that fails on its own syntax is worse than no gate, so the failure is kept
// in the comment where the next reader will hit it.
if (!/^    prefix: \|[-+]?$/m.test(text)) {
  problems.push('read content has no `prefix: |-` block scalar for the conductor persona')
}
if (!/^        persona: \|[-+]?$/m.test(text)) {
  problems.push('read content has no `persona: |-` block scalar on a delegation row')
}
for (const marker of ['      # Orchestrator Role', '      # Delegation Discipline', '      ## Hard Blocks']) {
  if (!text.includes(marker)) problems.push(`read content missing conductor persona section: ${marker}`)
}
if (!text.includes('          # Explore: Read-Only Retrieval Agent')) {
  problems.push('read content missing the explore persona heading')
}
// `!!js` must still be a REAL tag on this face, not a stringified one — the
// single-line form is what the upstream `represent` produces
// (vendor/include/src/index.ts:9-15 declares `represent: (data) => data['__jsExpr']`).
const jsLines = text.split('\n').filter((line) => line.includes('!!js '))
if (jsLines.length === 0) problems.push('read content carries no `!!js` line at all')
// Count EVERY parsed {__jsExpr} node, on any key — not just `disabled`. The
// earlier draft counted only `disabled` and then compared aggregates against
// aggregates (`jsLines.length === 0` / `jsExprStrings === 0`), so degrading
// BOTH halves went red while degrading exactly ONE of two tags stayed green
// (MINOR-2). One-to-one correspondence is the honest invariant: N `!!js`
// tokens in the text must produce exactly N expression nodes.
let jsExprNodes = 0
const jsNodeKeys = []
const countExprs = (row) => {
  for (const [key, value] of Object.entries(row)) {
    if (key === 'config') continue
    if (typeof value === 'string' && value.includes('!!js')) {
      problems.push(`row ${row.id} has a STRING \`!!js\` on \`${key}\`: ${JSON.stringify(value.slice(0, 80))}`)
    } else if (value && typeof value === 'object' && typeof value.__jsExpr === 'string') {
      jsExprNodes += 1
      jsNodeKeys.push(`${row.id}.${key}`)
    }
  }
}
walk(rows, countExprs)
if (jsExprNodes === 0 && jsLines.length > 0) {
  problems.push('`!!js` lines are present but no row parsed to a {__jsExpr} node — the dialect is wrong')
}
if (!Number.isInteger(expectedJsCount) || expectedJsCount < 0) {
  problems.push(`expected \`!!js\` gate count is not a non-negative integer: ${JSON.stringify(expectedJsCountRaw)}`)
}
if (Number.isInteger(expectedJsCount) && jsExprNodes !== expectedJsCount) {
  problems.push(
    `read face carries ${jsExprNodes} parsed expression node(s) [${jsNodeKeys.join(', ') || 'none'}] but the `
      + `materialized face declares ${expectedJsCount} \`!!js\` gate(s) — a tag silently became a string`,
  )
}
if (jsExprNodes !== jsLines.length) {
  problems.push(
    `\`!!js\` tokens and parsed expression nodes do not match one-to-one: ${jsLines.length}`
      + ` text token(s) vs ${jsExprNodes} node(s) [${jsNodeKeys.join(', ') || 'none'}]`
      + ' — a tag silently became a string',
  )
}

// Element-wise comparison of every roster delegation row.
const byRowId = new Map()
walk(rows, (row) => {
  if (typeof row.id === 'string' && row.id.startsWith('tool-subagent-')) byRowId.set(row.id.slice('tool-subagent-'.length), row)
})
const seenToolNames = []
walk(rows, (row) => {
  const config = row.config
  if (config && typeof config === 'object' && typeof config.toolName === 'string') seenToolNames.push(config.toolName)
})
if (seenToolNames.length !== expectations.rows.length) {
  problems.push(`read content has ${seenToolNames.length} toolName rows, roster has ${expectations.rows.length}`)
}
for (const want of expectations.rows) {
  const row = byRowId.get(want.id)
  if (row === undefined) {
    problems.push(`read content has no tool-subagent-${want.id} row`)
    continue
  }
  const config = row.config ?? {}
  if (config.toolName !== want.id) problems.push(`${want.id}: parsed toolName=${JSON.stringify(config.toolName)}`)
  if (config.maxDepth !== want.maxDepth) problems.push(`${want.id}: parsed maxDepth=${JSON.stringify(config.maxDepth)} want ${want.maxDepth}`)
  if (want.deny !== null) {
    const got = Array.isArray(config.toolFilter?.deny) ? config.toolFilter.deny : null
    if (got === null) problems.push(`${want.id}: parsed toolFilter.deny is not an array`)
    else if (got.length !== want.deny.length || got.some((n, k) => n !== want.deny[k])) {
      problems.push(`${want.id}: parsed deny is NOT the roster list element-wise — got ${JSON.stringify(got)} want ${JSON.stringify(want.deny)}`)
    }
  }
  if (want.allow !== null) {
    const got = Array.isArray(config.toolFilter?.allow) ? config.toolFilter.allow : null
    if (got === null) problems.push(`${want.id}: parsed toolFilter.allow is not an array`)
    else if (got.length !== want.allow.length || got.some((n, k) => n !== want.allow[k])) {
      problems.push(`${want.id}: parsed allow is NOT the roster list element-wise — got ${JSON.stringify(got)} want ${JSON.stringify(want.allow)}`)
    }
  }
  if (want.id === 'explore') {
    if (config.provider !== 'spawn') problems.push(`explore: parsed provider=${JSON.stringify(config.provider)} want "spawn" (unquoted on this face)`)
    const seat = config.agentOptions ?? {}
    if (seat.provider !== expectedProvider) problems.push(`explore: parsed agentOptions.provider=${JSON.stringify(seat.provider)} want ${expectedProvider}`)
    if (seat.model !== expectedModel) problems.push(`explore: parsed agentOptions.model=${JSON.stringify(seat.model)} want ${expectedModel}`)
    if (typeof config.persona !== 'string' || !config.persona.includes('# Explore: Read-Only Retrieval Agent')) {
      problems.push('explore: parsed persona missing the heading')
    }
  }
}
const depths = expectations.rows.map(() => expectations.uniformMaxDepth)
const gotDepths = expectations.rows
  .map((want) => byRowId.get(want.id)?.config?.maxDepth)
  .filter((d) => d !== undefined)
if (gotDepths.some((d, k) => d !== depths[k])) {
  problems.push(`delegation maxDepth set ${JSON.stringify(gotDepths)} != roster-uniform ${JSON.stringify(depths)}`)
}

if (problems.length > 0) {
  console.error(`READ-FACE FAIL: ${problems.join('; ')}`)
  process.exit(1)
}
console.log(`READ-FACE PASS: ${expectations.rows.length} delegation rows compared element-wise against src/roster.ts (deny/allow/maxDepth/toolName), conductor persona + explore persona block scalars present, ${jsExprNodes} parsed expression node(s) [${jsNodeKeys.join(', ')}] == ${expectedJsCount} \`!!js\` gate(s) declared by the materialized face, no sentinel residue`)
