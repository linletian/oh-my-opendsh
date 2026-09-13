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
//   c10 live path roster integrity (P2-T15: the template under
//       patches/omo-dsh/omo-agents/ — still the build/e2e/cold-start load
//       target — carries the FULL 12-row delegation roster derived from
//       roster.ts: control + list-agents + one `tool-subagent-<id>` row per
//       roster delegation entry in roster order, no generic/product rows, the
//       per-class sentinel/filter shape (deny sentinel for read-only/worker,
//       NO filter key for atlas, static allow for multimodal-looker) and the
//       roster maxDepth (2 on every delegation row — target-row semantics,
//       D-2026-09-13-01))
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

  // c10 — LIVE path roster integrity (P2-T15; generalized from the PR #1
  // review F1 hardening, 2026-09-04): the template under
  // patches/omo-dsh/omo-agents/ (still the load target of build / e2e /
  // cold-start / manual-testing) must carry the FULL roster-derived
  // delegation group. All expectations below are DERIVED from roster.ts and
  // from the renderer's own sentinel naming — never restated literals — so
  // this check cannot drift from the single source.
  try {
    const { DELEGATION_ENTRIES, denyToolNamesFor } = await import(
      pathToFileURL(join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents', 'src', 'roster.ts')).href
    )
    const { agentSentinelName } = await import(
      pathToFileURL(join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents', 'src', 'concerto-preset.ts')).href
    )
    const legacyPath = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents', 'concerto', 'agent.cordis.yml')
    const legacyRows = await loadYamlDialect(legacyPath)
    const legacyFlat = flatten(legacyRows)
    const legacyProblems = []

    // ① the delegation group IS the 12-row roster, in roster order.
    const delegation = legacyRows.find((r) => r && r.id === 'delegation')
    const groupIds = delegation && Array.isArray(delegation.config)
      ? delegation.config.map((r) => r && r.id)
      : []
    const wantGroupIds = [
      'tool-subagent-control',
      'tool-subagent-list-agents',
      ...DELEGATION_ENTRIES.map((entry) => `tool-subagent-${entry.id}`),
    ]
    if (JSON.stringify(groupIds) !== JSON.stringify(wantGroupIds)) {
      legacyProblems.push(
        `delegation group rows=${JSON.stringify(groupIds)} `
        + `(want ${wantGroupIds.join(', ')} — roster order, no generic/product rows)`,
      )
    }

    // ② no generic spawn/fork rows, no product-provider rows anywhere.
    const legacyToolNames = legacyFlat.map((r) => r && r.config && r.config.toolName).filter(Boolean)
    const legacyBanned = legacyToolNames.filter((t) => t === 'subagent' || t === 'subagent_fork')
    if (legacyBanned.length > 0) legacyProblems.push(`generic delegation tools present: ${legacyBanned.join(', ')}`)
    const legacyProduct = legacyFlat
      .map((r) => r && r.id)
      .filter((i) => i === 'tool-subagent-codex' || i === 'tool-subagent-claude-code')
    if (legacyProduct.length > 0) legacyProblems.push(`product rows present: ${legacyProduct.join(', ')}`)

    // ③ every roster delegation entry has exactly one row with the class
    //    sentinel/filter shape and the class maxDepth.
    const rowsByTool = new Map(
      legacyFlat
        .filter((r) => r && r.name === '@deepseek-ai/dsh-tool-subagent' && r.config && r.config.toolName)
        .map((r) => [r.config.toolName, r]),
    )
    for (const entry of DELEGATION_ENTRIES) {
      const row = rowsByTool.get(entry.id)
      if (row === undefined) {
        legacyProblems.push(`no dsh-tool-subagent row for roster entry '${entry.id}'`)
        continue
      }
      const cfg = row.config
      const label = `legacy ${entry.id}`
      if (row.id !== `tool-subagent-${entry.id}`) {
        legacyProblems.push(`${label}: row id=${JSON.stringify(row.id)} (want tool-subagent-${entry.id})`)
      }
      if (cfg.provider !== 'spawn') legacyProblems.push(`${label}: provider=${JSON.stringify(cfg.provider)} (want spawn)`)
      if (cfg.backgroundMode !== 'continuable') {
        legacyProblems.push(`${label}: backgroundMode=${JSON.stringify(cfg.backgroundMode)} (want continuable)`)
      }
      if (cfg.persona !== agentSentinelName(entry.id, 'PERSONA')) {
        legacyProblems.push(`${label}: persona sentinel=${JSON.stringify(cfg.persona)} (want ${agentSentinelName(entry.id, 'PERSONA')})`)
      }
      if (cfg.agentOptions !== agentSentinelName(entry.id, 'AGENT_OPTIONS')) {
        legacyProblems.push(`${label}: agentOptions sentinel=${JSON.stringify(cfg.agentOptions)} (want ${agentSentinelName(entry.id, 'AGENT_OPTIONS')})`)
      }
      // Roster-derived (not the old per-class 2/1 split): maxDepth caps the
      // INVOKED row (dsh-tool-subagent folds config.maxDepth into
      // request.maxDepth; dsh-subagent resolveChildDepth rejects
      // parent.depth + 1 > maxDepth), so all ten delegation rows carry 2 —
      // arbiter D-2026-09-13-01 / phase2-roster.md §1 修正块.
      if (cfg.maxDepth !== entry.maxDepth) {
        legacyProblems.push(`${label}: maxDepth=${JSON.stringify(cfg.maxDepth)} (want ${JSON.stringify(entry.maxDepth)} — roster value for ${entry.id})`)
      }
      const deny = denyToolNamesFor(entry)
      if (deny !== undefined) {
        const wantSentinel = agentSentinelName(entry.id, 'DENY')
        if (cfg.toolFilter === undefined || cfg.toolFilter.deny !== wantSentinel) {
          legacyProblems.push(
            `${label}: toolFilter=${JSON.stringify(cfg.toolFilter)} (want deny: ${wantSentinel} — class ${entry.class})`,
          )
        }
      } else if (entry.class === 'allowlist') {
        if (JSON.stringify(cfg.toolFilter) !== JSON.stringify({ allow: entry.allowTools })) {
          legacyProblems.push(
            `${label}: toolFilter=${JSON.stringify(cfg.toolFilter)} `
            + `(want static allow ${JSON.stringify(entry.allowTools)})`,
          )
        }
      } else if (cfg.toolFilter !== undefined) {
        legacyProblems.push(
          `${label}: toolFilter present (${JSON.stringify(cfg.toolFilter)}) — an orchestrator row carries NO filter key`,
        )
      }
    }

    results.push(check('c10', 'live path roster integrity (P2-T15)', legacyProblems.length === 0,
      legacyProblems.join('; ')
      || `delegation group = ${wantGroupIds.length} rows (control + list-agents + ${DELEGATION_ENTRIES.length} roster agents, roster order); `
        + 'read-only/worker deny sentinels; atlas no filter key; multimodal-looker allow [read, read_image]; '
        + `maxDepth = roster value on every row (all ${DELEGATION_ENTRIES.length} delegation rows are 2, `
        + 'target-row semantics D-2026-09-13-01)'))
  } catch (e) {
    results.push(check('c10', 'live path roster integrity (P2-T15)', false, String(e.message ?? e)))
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
