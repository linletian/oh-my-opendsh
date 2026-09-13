// P2-T17 (exit criterion b) — the roster STRUCTURE snapshot renderer.
//
// WHAT THIS IS. A deterministic markdown rendering of the 11-row roster: per
// agent, one table row carrying id / class / delegation flag / default route /
// resolved route (defaults) / filter shape / maxDepth / writeCapable / env
// override pair. It is checked in as tests/omo-agents/__snapshots__/roster.md
// and read (never rewritten) by tests/omo-agents/roster-composition.test.ts,
// which asserts byte-equality. It is the roster analogue of the persona
// snapshots: a human-reviewable artifact that makes a roster change visible in
// `git diff` instead of only in a failing assertion's message.
//
// WHY IT LIVES TEST-SIDE, NOT IN roster.ts (P2-T17 asks for this judgment).
//   1. No runtime consumer: nothing in the plugin ever renders this markdown —
//      it exists only so a reviewer and a test can compare against it. Adding
//      it to roster.ts would ship dead code in the host plugin's dependency
//      graph.
//   2. Import direction: this rendering needs the RESOLVED routes
//      (model-routes.ts), and model-routes.ts imports roster.ts VALUES
//      (ROSTER / ALL_AGENT_IDS / DELEGATION_TOOL_NAMES). Putting the renderer
//      in roster.ts would therefore either create a runtime import cycle or
//      force an awkward `routes` parameter onto the single-source module. A
//      test-side module simply imports both, downward.
//   3. roster.ts stays the minimal authored table it was designed to be
//      (phase2-plan.md §4.2); the snapshot is documentation-of-record, not
//      roster logic.
//
// SINGLE-SOURCE DISCIPLINE. Every cell is computed from the sources the plugin
// itself consumes: ROSTER (roster.ts) for the rows and classes,
// denyToolNamesFor / allowToolNamesFor for the filter, resolveModelRoutes({})
// for the resolved defaults (an EXPLICITLY empty env, so a developer's
// OMO_* overrides cannot leak into the snapshot). Nothing is restated by hand.
//
// REGENERATION (the asserting test deliberately has NO rewrite path):
//   node --experimental-strip-types -e "import('./tests/omo-agents/roster-snapshot.ts').then(m => process.stdout.write(m.renderRosterSnapshot()))" > tests/omo-agents/__snapshots__/roster.md
import {
  DELEGATION_ENTRIES,
  ROSTER,
  allowToolNamesFor,
  denyToolNamesFor,
  type AgentId,
  type RosterEntry,
} from '../../patches/omo-dsh/omo-agents/src/roster.ts'
// Explicit `.ts` extensions follow the src/ tree's own convention (roster.ts
// imports './model-routes.ts') and are what make this module runnable straight
// through Node 24 type-stripping — the documented regeneration command above
// executes it directly, outside vitest.
import { resolveModelRoutes } from '../../patches/omo-dsh/omo-agents/src/model-routes.ts'

/** `—` is the phase2-roster.md §1 `—` cell: the conductor has no child class. */
const NONE = '—'

/**
 * The filter shape of one row, as the reviewable text phase2-roster.md §1's
 * "deny 列表与逐行哨兵" block describes it:
 *   deny N [<exact names>]   — read-only (write, edit + the delegation names)
 *                              and worker (delegation names only) rows
 *   allow N [<exact names>]  — the allowlist row
 *   none (no toolFilter key) — the orchestrator row
 *   —                        — the route-only conductor (not a delegation row)
 * The full name list (not just a count) is printed on purpose: the snapshot is
 * where an extra/missing name becomes visible to a human reviewer, and it makes
 * the byte-compare sensitive to every roster-driven list change (including the
 * static `write, edit` prefix, which is not a separate row field).
 */
function describeToolFilter(entry: RosterEntry): string {
  if (!entry.delegation) return NONE
  const deny = denyToolNamesFor(entry)
  if (deny !== undefined) return `deny ${deny.length} [${deny.join(', ')}]`
  const allow = allowToolNamesFor(entry)
  if (allow !== undefined) return `allow ${allow.length} [${allow.join(', ')}]`
  return 'none (no toolFilter key)'
}

/** One route as `provider/model` (the shape the plan's seat table uses). */
function routeText(route: { provider: string; model: string }): string {
  return `${route.provider}/${route.model}`
}

/**
 * Renders the whole roster.md snapshot. Deterministic: no clock, no locale, no
 * environment reads beyond the explicit empty env handed to
 * `resolveModelRoutes`. Returns text ending in exactly one newline.
 */
export function renderRosterSnapshot(): string {
  // Empty env: the snapshot documents the DOCUMENTED defaults, so a developer's
  // OMO_<AGENT>_{PROVIDER,MODEL} overrides must not leak into it.
  const routes = resolveModelRoutes({})

  const delegationIds = DELEGATION_ENTRIES.map((entry) => entry.id)
  const classCounts = (['read-only', 'worker', 'orchestrator', 'allowlist'] as const)
    .map((klass) => `${klass} ${DELEGATION_ENTRIES.filter((entry) => entry.class === klass).length}`)
    .join(' · ')

  const lines: string[] = [
    '# Phase 2 roster snapshot (P2-T17 · exit criterion b)',
    '',
    '> GENERATED — do not hand-edit. Every cell is computed from the single',
    '> sources: `patches/omo-dsh/omo-agents/src/roster.ts` (rows, classes,',
    '> allowTools, maxDepth, writeCapable, env pairs), its',
    '> `denyToolNamesFor` / `allowToolNamesFor` computations, and',
    '> `src/model-routes.ts` resolved with an EMPTY env (the documented defaults).',
    '> The test `tests/omo-agents/roster-composition.test.ts` reads this file and',
    '> asserts it byte-equals `renderRosterSnapshot()`; no code path rewrites it.',
    '> Regenerate:',
    '>',
    '> ```',
    "> node --experimental-strip-types -e \"import('./tests/omo-agents/roster-snapshot.ts').then(m => process.stdout.write(m.renderRosterSnapshot()))\" > tests/omo-agents/__snapshots__/roster.md",
    '> ```',
    '',
    `Rows: ${ROSTER.length} = ${ROSTER.length - delegationIds.length} conductor + ${delegationIds.length} delegation · ${classCounts}`,
    `Delegation toolNames (roster order): ${delegationIds.join(', ')}`,
    '',
    '| # | agent | delegation | class | maxDepth | writeCapable | default route | resolved route (empty env) | env override pair | toolFilter |',
    '|---|-------|------------|-------|----------|--------------|---------------|---------------------------|-------------------|------------|',
  ]

  ROSTER.forEach((entry, index) => {
    const route = routes[entry.id as AgentId]
    const cells = [
      String(index + 1),
      `\`${entry.id}\``,
      entry.delegation ? 'yes' : 'no (conductor)',
      entry.class ?? NONE,
      entry.maxDepth === undefined ? NONE : String(entry.maxDepth),
      String(entry.writeCapable),
      routeText(entry.defaultRoute),
      routeText(route),
      `${entry.routeEnvVars.provider} / ${entry.routeEnvVars.model}`,
      describeToolFilter(entry),
    ]
    lines.push(`| ${cells.join(' | ')} |`)
  })

  lines.push('')
  return `${lines.join('\n')}\n`
}
