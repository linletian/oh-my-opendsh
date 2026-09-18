#!/usr/bin/env node
// scripts/verify-concerto-static.mjs — zero-cost STATIC gate over the concerto
// layer (CI gate 6 / release-check gate 6). Asserts on the ARCHIVED artifacts
// under patches/omo-dsh/omo-agents-current/ — the exact files the installer
// ships into a user's DSH_HOME — so a PASS here means the shipped preset and
// plugin keep the AC-6 hardening and the P-19 lessons intact, without any
// harness or LLM. The real-model `concerto_verify` (22 checks) remains the
// local release gate (scripts/release-check.sh gate 8).
//
// Checks:
//   c01 preset YAML parses  (agent.cordis.yml + preset.yml, dsh dialect)
//   c02 explore binding     (provider spawn / toolName call_omo_explore /
//       backgroundMode one-shot / agentOptions = the pi-ai deepseek route /
//       toolFilter.deny ⊇ [write, edit, call_omo_explore] / maxDepth 1)
//   c03 single delegation path (no generic subagent/subagent_fork rows, no
//       codex/claude-code product rows; delegation group = exactly 3 rows)
//   c04 plugin parses as a function body (new Function — it is the verbatim
//       cordis_define code.host artifact, not a module)
//   c05 plugin markers      (READ_ONLY_FILTER triple deny, MAX_DEPTH 1,
//       registerProvider, defineTool, the 3 tool names)
//   c06 installer passes bash -n
//   c07 installer TAG pin equals .omo/compat.yaml tag_alias
//   c08 preset.yml identity (name + description non-empty)
//   c09 persona shadow      (hard-blocks + anti-patterns in both personas)
//   c10 live path roster integrity (P2-T15; generalized into per-class
//       assertion records by P2-T20 — the template under
//       patches/omo-dsh/omo-agents/, still the build/e2e/cold-start load
//       target, carries the FULL 12-row delegation roster derived from
//       roster.ts). ONE record per DoD-c assertion class (c10.1 … c10.10):
//       ①a no generic spawn/fork rows, ①b no product-provider rows,
//       ② delegation group == 12-row census in roster order, ②/③ per-row
//       binding to the roster entry, ③a read-only class filter shape,
//       ③b worker class filter shape, ③c orchestrator (atlas) NO toolFilter
//       key, ③d allowlist (multimodal-looker) allow == entry.allowTools,
//       ③e per-class row census, ④ uniform roster maxDepth on every row
//       (target-row semantics, D-2026-09-13-01). Every expectation is derived
//       from roster.ts + the renderer's sentinel naming, never restated.)
//
// Usage: node scripts/verify-concerto-static.mjs [--json]
// Exit: 1 iff any check FAILs (a check that could not run is also a FAIL,
// with the reason — same honesty rule as doctor-lite).

import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT, loadYamlDialect } from './doctor-lite.mjs'

const PATCH_DIR = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents-current')
const AGENT_YML = join(PATCH_DIR, 'preset', 'agent.cordis.yml')
const PRESET_YML = join(PATCH_DIR, 'preset', 'preset.yml')
const PLUGIN_JS = join(PATCH_DIR, 'concerto-plugin.host.js')
const INSTALL_SH = join(REPO_ROOT, 'scripts', 'install-concerto.sh')
const COMPAT_YML = join(REPO_ROOT, '.omo', 'compat.yaml')

function check(id, name, pass, detail = '') {
  return { id, name, pass: Boolean(pass), detail: String(detail) }
}

function hasAll(haystack, needles) {
  return needles.map((n) => haystack.includes(n)).every(Boolean)
}

/** Flattens a row list including nested rows inside cordis:group configs. */
function flatten(rows) {
  const out = []
  for (const r of rows ?? []) {
    out.push(r)
    if (r && Array.isArray(r.config)) out.push(...flatten(r.config))
  }
  return out
}

/**
 * The ten c10 assertion records (P2-T20): ONE result per DoD-c assertion
 * class, so the gate's assertion count is enumerable and the pre-Phase-2
 * 4-class baseline (generic rows / single explore row / explore deny /
 * explore maxDepth, all lumped into one record) can be compared record by
 * record. Every record below is at least as strict as its baseline peer.
 */
const C10_ASSERTIONS = [
  ['c10.1', 'live roster ①a: no generic delegation rows'],
  ['c10.2', 'live roster ①b: no product-provider rows'],
  ['c10.3', 'live roster ②: delegation group == 12-row census in roster order'],
  ['c10.4', 'live roster ②/③: one roster-bound row per delegation entry'],
  ['c10.5', 'live roster ③a: read-only class filter shape'],
  ['c10.6', 'live roster ③b: worker class filter shape'],
  ['c10.7', 'live roster ③c: orchestrator row carries NO toolFilter key'],
  ['c10.8', 'live roster ③d: allowlist row allow == entry.allowTools'],
  ['c10.9', 'live roster ③e: per-class row census matches the roster'],
  ['c10.10', 'live roster ④: uniform roster maxDepth on every delegation row'],
]
const C10_NAMES = new Map(C10_ASSERTIONS)

async function run() {
  const results = []
  let agentRows = null
  let presetDoc = null
  let compat = null

  // c01 — both preset YAMLs parse in the dsh dialect.
  try {
    agentRows = await loadYamlDialect(AGENT_YML)
    presetDoc = await loadYamlDialect(PRESET_YML)
    results.push(check('c01', 'preset YAML parses', Array.isArray(agentRows) && presetDoc && typeof presetDoc === 'object',
      `${AGENT_YML.replace(REPO_ROOT + '/', '')} (${agentRows.length} rows) + preset.yml`))
  } catch (e) {
    results.push(check('c01', 'preset YAML parses', false, String(e.message ?? e)))
  }

  // c02 — the explore binding row keeps every guardrail (P-19 / AC-6).
  // (The row is nested inside the `delegation` cordis:group, hence flatten.)
  if (Array.isArray(agentRows)) {
    const flatRows = flatten(agentRows)
    const explore = flatRows.filter((r) => r && r.name === '@deepseek-ai/dsh-tool-subagent'
      && r.config && r.config.toolName === 'call_omo_explore')
    if (explore.length !== 1) {
      results.push(check('c02', 'explore binding row', false, `expected exactly 1 row, found ${explore.length}`))
    } else {
      const cfg = explore[0].config
      const deny = Array.isArray(cfg.toolFilter && cfg.toolFilter.deny) ? cfg.toolFilter.deny : []
      const problems = []
      if (cfg.provider !== 'spawn') problems.push(`provider=${cfg.provider} (want spawn)`)
      if (cfg.backgroundMode !== 'one-shot') problems.push(`backgroundMode=${cfg.backgroundMode} (want one-shot)`)
      if (!(cfg.agentOptions && cfg.agentOptions.provider === 'deepseek' && cfg.agentOptions.model === 'deepseek-v4-flash')) {
        problems.push(`agentOptions=${JSON.stringify(cfg.agentOptions)} (want pi-ai deepseek route: provider deepseek, model deepseek-v4-flash)`)
      }
      for (const t of ['write', 'edit', 'call_omo_explore']) {
        if (!deny.includes(t)) problems.push(`toolFilter.deny missing "${t}"`)
      }
      if (cfg.maxDepth !== 1) problems.push(`maxDepth=${cfg.maxDepth} (want 1)`)
      results.push(check('c02', 'explore binding row', problems.length === 0, problems.join('; ') || 'spawn / one-shot / pi-ai route / deny [write, edit, call_omo_explore] / maxDepth 1'))
    }

    // c03 — call_omo_explore is the ONLY delegation path (AC-6 hardening).
    const toolNames = flatRows.map((r) => r && r.config && r.config.toolName).filter(Boolean)
    const ids = flatRows.map((r) => r && r.id).filter(Boolean)
    const banned = toolNames.filter((t) => t === 'subagent' || t === 'subagent_fork')
    const product = ids.filter((i) => i === 'tool-subagent-codex' || i === 'tool-subagent-claude-code')
    const delegation = agentRows.find((r) => r && r.id === 'delegation')
    const groupIds = delegation && Array.isArray(delegation.config) ? delegation.config.map((r) => r && r.id) : []
    const wantGroup = ['tool-subagent-control', 'tool-subagent-list-agents', 'tool-subagent-explore']
    const c03Problems = []
    if (banned.length > 0) c03Problems.push(`generic delegation tools present: ${banned.join(', ')}`)
    if (product.length > 0) c03Problems.push(`product rows present: ${product.join(', ')}`)
    if (JSON.stringify(groupIds) !== JSON.stringify(wantGroup)) c03Problems.push(`delegation group rows=${JSON.stringify(groupIds)} (want ${wantGroup.join(', ')})`)
    results.push(check('c03', 'single delegation path', c03Problems.length === 0, c03Problems.join('; ') || `delegation group = ${wantGroup.join(', ')}`))

    // c09 — persona shadow: hard blocks + anti-patterns in both personas.
    // The conductor's key is `prefix` (renamed from `text` at
    // dsh-v0.1.3-alpha.2 — docs/dsh-0.1.5-rc.1-review.md §2); reading the old
    // key here would have made this check silently vacuous rather than failing.
    const conductor = agentRows.find((r) => r && r.id === 'persona')
    const exploreRow = flatRows.find((r) => r && r.config && r.config.toolName === 'call_omo_explore')
    const c09Problems = []
    for (const [label, text] of [
      ['conductor', conductor && conductor.config && conductor.config.prefix],
      ['explore', exploreRow && exploreRow.config && exploreRow.config.persona],
    ]) {
      if (typeof text !== 'string' || text.length === 0) {
        c09Problems.push(`${label} persona missing`)
      } else if (!(text.includes('## Hard Blocks') && text.includes('## Anti-Patterns'))) {
        c09Problems.push(`${label} persona lacks hard-blocks/anti-patterns sections`)
      }
    }
    results.push(check('c09', 'persona shadow', c09Problems.length === 0, c09Problems.join('; ') || 'hard-blocks + anti-patterns in both personas'))
  }

  // c04 — the plugin artifact parses as a function body.
  let pluginSource = ''
  try {
    pluginSource = readFileSync(PLUGIN_JS, 'utf8')
  } catch (e) {
    results.push(check('c04', 'plugin parses', false, `cannot read ${PLUGIN_JS}: ${e.message}`))
  }
  if (pluginSource !== '') {
    try {
      // eslint-disable-next-line no-new-func
      new Function(pluginSource)
      results.push(check('c04', 'plugin parses (function body)', true, 'new Function() accepted the verbatim code.host artifact'))
    } catch (e) {
      results.push(check('c04', 'plugin parses (function body)', false, String(e.message ?? e)))
    }
    // c05 — structural markers that encode the guardrails.
    const markers = [
      "deny: ['write', 'edit', 'call_omo_explore']",
      'MAX_DEPTH = 1',
      'registerProvider(',
      'defineTool(',
      "'call_omo_explore'",
      "'concerto_verify'",
      "'concerto_demo'",
    ]
    const missing = markers.filter((m) => !pluginSource.includes(m))
    results.push(check('c05', 'plugin markers', missing.length === 0, missing.length === 0 ? 'triple-deny filter, depth cap, provider + 3 tool registrations' : `missing: ${missing.join(', ')}`))
  }

  // c06 — installer is valid bash.
  try {
    execFileSync('bash', ['-n', INSTALL_SH], { stdio: 'pipe' })
    results.push(check('c06', 'installer bash -n', true, 'scripts/install-concerto.sh parses'))
  } catch (e) {
    results.push(check('c06', 'installer bash -n', false, String(e.stderr || e.message || e)))
  }

  // c07 — installer TAG pin follows the compat matrix alias.
  try {
    compat = await loadYamlDialect(COMPAT_YML)
  } catch (e) {
    results.push(check('c07', 'installer TAG pin', false, `cannot read compat.yaml: ${e.message ?? e}`))
  }
  if (compat) {
    const installerText = readFileSync(INSTALL_SH, 'utf8')
    const m = installerText.match(/^TAG="\$\{CONCERTO_TAG:-([^}]+)\}"/m)
    const alias = compat.our && compat.our.tag_alias
    results.push(check('c07', 'installer TAG pin', Boolean(m && m[1] === alias),
      m ? `TAG=${m[1]} (compat alias ${alias})` : 'TAG= line not found'))
  }

  // c08 — preset identity.
  results.push(check('c08', 'preset identity', Boolean(presetDoc && presetDoc.name && presetDoc.description
    && String(presetDoc.name).length > 0 && String(presetDoc.description).length > 0),
    presetDoc ? `name="${presetDoc.name}"` : 'preset.yml unavailable (see c01)'))

  // c10 — LIVE path roster integrity (P2-T15; per-class records by P2-T20;
  // origin: PR #1 review F1 hardening, 2026-09-04): the template under
  // patches/omo-dsh/omo-agents/ (still the load target of build / e2e /
  // cold-start / manual-testing) must carry the FULL roster-derived
  // delegation group. All expectations below are DERIVED from roster.ts and
  // from the renderer's own sentinel naming — never restated literals — so
  // this check cannot drift from the single source. See C10_ASSERTIONS for
  // the record-per-class mapping.
  try {
    const {
      DELEGATION_ENTRIES,
      MUTATION_TOOL_NAMES,
      DELEGATION_TOOL_NAMES,
      denyToolNamesFor,
      allowToolNamesFor,
    } = await import(
      pathToFileURL(join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents', 'src', 'roster.ts')).href
    )
    const { agentSentinelName } = await import(
      pathToFileURL(join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents', 'src', 'concerto-preset.ts')).href
    )
    const c10 = (id, pass, detail) => results.push(check(id, C10_NAMES.get(id), pass, detail))

    const legacyPath = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents', 'concerto', 'agent.cordis.yml')
    const legacyRows = await loadYamlDialect(legacyPath)
    const legacyFlat = flatten(legacyRows)
    const delegation = legacyRows.find((r) => r && r.id === 'delegation')
    const groupIds = delegation && Array.isArray(delegation.config)
      ? delegation.config.map((r) => r && r.id)
      : []
    const wantGroupIds = [
      'tool-subagent-control',
      'tool-subagent-list-agents',
      ...DELEGATION_ENTRIES.map((entry) => `tool-subagent-${entry.id}`),
    ]

    // ①a — no generic spawn/fork delegation tools anywhere (F1 hardening).
    const legacyToolNames = legacyFlat.map((r) => r && r.config && r.config.toolName).filter(Boolean)
    const legacyBanned = legacyToolNames.filter((t) => t === 'subagent' || t === 'subagent_fork')
    c10('c10.1', legacyBanned.length === 0,
      legacyBanned.length === 0
        ? 'no `subagent`/`subagent_fork` toolName anywhere in the live template'
        : `generic delegation tools present: ${legacyBanned.join(', ')}`)

    // ①b — no product-provider delegation rows (codex / claude-code).
    const legacyProduct = legacyFlat
      .map((r) => r && r.id)
      .filter((i) => i === 'tool-subagent-codex' || i === 'tool-subagent-claude-code')
    c10('c10.2', legacyProduct.length === 0,
      legacyProduct.length === 0
        ? 'no tool-subagent-codex / tool-subagent-claude-code row in the live template'
        : `product rows present: ${legacyProduct.join(', ')}`)

    // ② — the delegation group IS the 12-row roster, in roster order.
    const censusOk = JSON.stringify(groupIds) === JSON.stringify(wantGroupIds)
    c10('c10.3', censusOk,
      censusOk
        ? `delegation group = ${wantGroupIds.length} rows `
          + `(control + list-agents + ${DELEGATION_ENTRIES.length} roster agents, roster order)`
        : `delegation group rows=${JSON.stringify(groupIds)} `
          + `(want ${wantGroupIds.join(', ')} — roster order, no generic/product rows)`)

    // Per-row traversal shared by the ②/③/④ records below.
    const rowsByTool = new Map(
      legacyFlat
        .filter((r) => r && r.name === '@deepseek-ai/dsh-tool-subagent' && r.config && r.config.toolName)
        .map((r) => [r.config.toolName, r]),
    )
    const entriesByClass = new Map()
    for (const entry of DELEGATION_ENTRIES) {
      if (!entriesByClass.has(entry.class)) entriesByClass.set(entry.class, [])
      entriesByClass.get(entry.class).push(entry)
    }
    const classOf = (cls) => entriesByClass.get(cls) ?? []
    const bindingProblems = []
    const filterProblems = new Map()
    const depthProblems = []
    const liveRowsByClass = new Map()
    for (const entry of DELEGATION_ENTRIES) {
      const label = `live ${entry.id}`
      if (!filterProblems.has(entry.class)) filterProblems.set(entry.class, [])
      const classProblems = filterProblems.get(entry.class)
      const row = rowsByTool.get(entry.id)
      if (row === undefined) {
        bindingProblems.push(`no dsh-tool-subagent row for roster entry '${entry.id}'`)
        continue
      }
      liveRowsByClass.set(entry.class, (liveRowsByClass.get(entry.class) ?? 0) + 1)
      const cfg = row.config
      if (row.id !== `tool-subagent-${entry.id}`) {
        bindingProblems.push(`${label}: row id=${JSON.stringify(row.id)} (want tool-subagent-${entry.id})`)
      }
      if (row.name !== '@deepseek-ai/dsh-tool-subagent') {
        bindingProblems.push(`${label}: row name=${JSON.stringify(row.name)} (want @deepseek-ai/dsh-tool-subagent)`)
      }
      if (cfg.provider !== 'spawn') {
        bindingProblems.push(`${label}: provider=${JSON.stringify(cfg.provider)} (want spawn)`)
      }
      if (cfg.backgroundMode !== 'continuable') {
        bindingProblems.push(`${label}: backgroundMode=${JSON.stringify(cfg.backgroundMode)} (want continuable)`)
      }
      if (cfg.persona !== agentSentinelName(entry.id, 'PERSONA')) {
        bindingProblems.push(
          `${label}: persona sentinel=${JSON.stringify(cfg.persona)} (want ${agentSentinelName(entry.id, 'PERSONA')})`,
        )
      }
      if (cfg.agentOptions !== agentSentinelName(entry.id, 'AGENT_OPTIONS')) {
        bindingProblems.push(
          `${label}: agentOptions sentinel=${JSON.stringify(cfg.agentOptions)} `
          + `(want ${agentSentinelName(entry.id, 'AGENT_OPTIONS')})`,
        )
      }
      // ③ per-class filter shape. The template value is the row's own DENY
      // sentinel; the list the renderer substitutes for it is computed by the
      // SAME roster function and must equal the DoD-c class shape built from
      // roster.ts's own constants — so neither half can drift silently.
      const deny = denyToolNamesFor(entry)
      if (deny !== undefined) {
        const wantSentinel = agentSentinelName(entry.id, 'DENY')
        if (cfg.toolFilter === undefined || cfg.toolFilter.deny !== wantSentinel) {
          classProblems.push(
            `${label}: toolFilter=${JSON.stringify(cfg.toolFilter)} (want deny: ${wantSentinel} — class ${entry.class})`,
          )
        }
        const wantDeny = entry.class === 'read-only'
          ? [...MUTATION_TOOL_NAMES, ...DELEGATION_TOOL_NAMES]
          : [...DELEGATION_TOOL_NAMES]
        if (JSON.stringify(deny) !== JSON.stringify(wantDeny)) {
          classProblems.push(
            `${label}: denyToolNamesFor=${JSON.stringify(deny)} `
            + `(want ${JSON.stringify(wantDeny)} — class ${entry.class})`,
          )
        }
      } else if (entry.class === 'allowlist') {
        const wantAllow = allowToolNamesFor(entry)
        if (JSON.stringify(cfg.toolFilter) !== JSON.stringify({ allow: wantAllow })) {
          classProblems.push(
            `${label}: toolFilter=${JSON.stringify(cfg.toolFilter)} `
            + `(want static allow ${JSON.stringify(wantAllow)})`,
          )
        }
      } else if (cfg.toolFilter !== undefined) {
        classProblems.push(
          `${label}: toolFilter present (${JSON.stringify(cfg.toolFilter)}) — an orchestrator row carries NO filter key`,
        )
      }
      // ④ maxDepth: the row carries its own roster entry's value.
      if (cfg.maxDepth !== entry.maxDepth) {
        depthProblems.push(
          `${label}: maxDepth=${JSON.stringify(cfg.maxDepth)} `
          + `(want ${JSON.stringify(entry.maxDepth)} — roster value for ${entry.id})`,
        )
      }
    }

    // ②/③ — one roster-bound row per delegation entry.
    c10('c10.4', DELEGATION_ENTRIES.length > 0 && bindingProblems.length === 0,
      bindingProblems.length === 0
        ? `each of the ${DELEGATION_ENTRIES.length} roster entries has exactly one dsh-tool-subagent row `
          + '(id / name / provider=spawn / backgroundMode=continuable / persona + agentOptions sentinels)'
        : bindingProblems.join('; '))

    // ③a — read-only class: per-row deny sentinel + the class deny list.
    const readOnly = classOf('read-only')
    const readOnlyProblems = filterProblems.get('read-only') ?? []
    const readOnlyShape = `${readOnly.length} rows: per-row deny sentinel; class deny list == `
      + `[${[...MUTATION_TOOL_NAMES, ...DELEGATION_TOOL_NAMES].join(', ')}] `
      + `(write/edit + all ${DELEGATION_TOOL_NAMES.length} roster delegation names)`
    c10('c10.5', readOnly.length > 0 && readOnlyProblems.length === 0,
      readOnlyProblems.length > 0 ? readOnlyProblems.join('; ') : readOnlyShape)

    // ③b — worker class: per-row deny sentinel + the class deny list.
    const worker = classOf('worker')
    const workerProblems = filterProblems.get('worker') ?? []
    const workerShape = `${worker.length} rows: per-row deny sentinel; class deny list == `
      + `[${[...DELEGATION_TOOL_NAMES].join(', ')}] (all ${DELEGATION_TOOL_NAMES.length} roster delegation names)`
    c10('c10.6', worker.length > 0 && workerProblems.length === 0,
      workerProblems.length > 0 ? workerProblems.join('; ') : workerShape)

    // ③c — orchestrator: NO filter key at all.
    const orchestrator = classOf('orchestrator')
    const orchestratorProblems = filterProblems.get('orchestrator') ?? []
    c10('c10.7', orchestrator.length > 0 && orchestratorProblems.length === 0,
      orchestratorProblems.length > 0
        ? orchestratorProblems.join('; ')
        : `${orchestrator.map((entry) => entry.id).join(', ')} carr${orchestrator.length === 1 ? 'ies' : 'y'} `
          + 'NO toolFilter key (delegation tools kept; maxDepth is the structural cap)')

    // ③d — allowlist: the static allow list IS the roster entry's allowTools.
    const allowlist = classOf('allowlist')
    const allowlistProblems = filterProblems.get('allowlist') ?? []
    c10('c10.8', allowlist.length > 0 && allowlistProblems.length === 0,
      allowlistProblems.length > 0
        ? allowlistProblems.join('; ')
        : `${allowlist.map((entry) => `${entry.id} allow == ${JSON.stringify(entry.allowTools)}`).join(', ')}`)

    // ③e — class census: every class the roster declares has exactly its own
    // number of bound live rows (a silently dropped row, or a whole class, is
    // loud here even before the per-class record above).
    const censusProblems = []
    for (const [cls, entries] of entriesByClass) {
      const observed = liveRowsByClass.get(cls) ?? 0
      if (observed !== entries.length) {
        censusProblems.push(`class ${cls}: ${observed} bound live row(s) (roster declares ${entries.length})`)
      }
    }
    c10('c10.9', DELEGATION_ENTRIES.length > 0 && censusProblems.length === 0,
      censusProblems.length > 0
        ? censusProblems.join('; ')
        : `${[...entriesByClass].map(([cls, entries]) => `${cls}=${entries.length}`).join(', ')} `
          + `(all ${entriesByClass.size} roster classes present, each fully bound)`)

    // ④ — uniform roster maxDepth on every delegation row. The uniform maxDepth=2 binding is DELIBERATE design (arbiter decision D-2026-09-13-01), not an accident a future edit should casually relax: the dsh depth gate reads the INVOKED row's config.maxDepth → request.maxDepth → resolveChildDepth (childDepth = parent.depth + 1 > maxDepth → SubagentDepthError), so a uniform 2 caps every delegation chain at 2 levels and makes depth-3 structurally impossible.
    const uniformDepths = [...new Set(DELEGATION_ENTRIES.map((entry) => entry.maxDepth))]
    c10('c10.10', depthProblems.length === 0 && uniformDepths.length === 1,
      depthProblems.length === 0 && uniformDepths.length === 1
        ? `maxDepth == entry.maxDepth on all ${DELEGATION_ENTRIES.length} rows; `
          + `the roster maxDepth is uniform (${uniformDepths[0]}) — target-row semantics D-2026-09-13-01`
        : [
          ...depthProblems,
          ...(uniformDepths.length === 1 ? [] : [`roster maxDepth is NOT uniform: ${JSON.stringify(uniformDepths)}`]),
        ].join('; '))
  } catch (e) {
    // A c10 record that could not run is a FAIL with the reason (same honesty
    // rule as doctor-lite) — one record per assertion, not one lump.
    const reason = `could not evaluate the live-path roster assertions: ${String(e.message ?? e)}`
    for (const [id] of C10_ASSERTIONS) results.push(check(id, C10_NAMES.get(id), false, reason))
  }

  // Report.
  const json = process.argv.includes('--json')
  if (json) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    for (const r of results) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} — ${r.name}${r.detail ? `: ${r.detail}` : ''}`)
    }
    const failed = results.filter((r) => !r.pass).length
    console.log(`verify-concerto-static: ${results.length - failed}/${results.length} PASS${failed > 0 ? ` — ${failed} FAIL` : ''}`)
  }
  process.exit(results.some((r) => !r.pass) ? 1 : 0)
}

await run()
