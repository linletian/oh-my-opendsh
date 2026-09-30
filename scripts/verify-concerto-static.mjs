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
//   c11 root cordis.yml mounts EXACTLY the plugin insert rows (P3-T19; two at
//       P3-T3 — omo-agents + omo-hooks; three since P4-T3 — plus omo-commands,
//       mount order). The list is read from doctor-lite-core's shared constant,
//       never restated here.
//   c12 every src/hooks/**/*.ts implementation file carries the plan §4.9
//       signature header (upstream tag-relative path + @ v4.19.4 + the
//       semantic-port declaration)
//   c13 the manifest id set and the src/hooks/ file set agree in BOTH
//       directions; the ulw-execute/ submodule directory belongs to the
//       `ulw-execute` id and is never a separate entry
//   c14 the PORTED manifest rows are the 已移植 port group the coverage
//       baseline UNION declares — 文档是人读的一半、manifest 是机读的一半，
//       本记录是两者之间的桥。基线自 P4-T12 起是两份文档的并集
//       （phase3-hooks.md §1 + phase4-commands.md §1.2），manifest 侧按
//       `status === 'ported'` 过滤；全量行数对 EXPECTED_HOOK_COUNT 与 c13 的
//       文件集核对都**不过滤**（演进理由见实现处注释）
//
// Usage: node scripts/verify-concerto-static.mjs [--json]
// Exit: 1 iff any check FAILs (a check that could not run is also a FAIL,
// with the reason — same honesty rule as doctor-lite).

import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT, loadYamlDialect } from './doctor-lite.mjs'
// c11 复用 doctor-lite-core 自己的挂载序期望，而不是在本文件重抄插件清单
// （理由见 c11 块：引用同一事实源，另加 doctor-lite 2b 未覆盖的顶层 insert 行数断言）。
import { EXPECTED_INSERT_ROW_IDS, collectInsertRowIds } from './doctor-lite-core.ts'

const PATCH_DIR = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents-current')
const AGENT_YML = join(PATCH_DIR, 'preset', 'agent.cordis.yml')
const PRESET_YML = join(PATCH_DIR, 'preset', 'preset.yml')
const PLUGIN_JS = join(PATCH_DIR, 'concerto-plugin.host.js')
const INSTALL_SH = join(REPO_ROOT, 'scripts', 'install-concerto.sh')
const COMPAT_YML = join(REPO_ROOT, '.omo', 'compat.yaml')

// P3-T19 c12–c14：omo-hooks 源码树、它的 manifest、以及 manifest 必须与之
// 一致的「人读」覆盖基线文档。
const HOOKS_SRC = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-hooks', 'src')
const HOOKS_DIR = join(HOOKS_SRC, 'hooks')
const HOOKS_MANIFEST_TS = join(HOOKS_SRC, 'manifest.ts')

/**
 * c14 的覆盖基线 —— **两文档并集**（P4-T12 演进，见 c14 的实现处注释）。
 * 保持为数组而不是 `A + B` 的字符串拼接：解析要逐文档报告行数与问题，
 * 拼成一段会让「哪一份文档没贡献任何行」不可见。
 */
const COVERAGE_BASELINE_MDS = [
  join(REPO_ROOT, 'docs', 'plans', 'phase3-dev', 'phase3-hooks.md'),
  join(REPO_ROOT, 'docs', 'plans', 'phase4-dev', 'phase4-commands.md'),
]

/**
 * c12 接受的「移植声明」措辞。中文形态是房屋体例；若干文件头部的上游逐文件
 * 处置表用英文 `PORTED` / `PARTIAL PORT`，故检查同时对 `ported` 做大小写不敏感匹配。
 */
const PORT_DECLARATIONS = ['语义移植', '逐字移植', '逐行移植', '照搬']

/**
 * c14 唯一一处手写映射：覆盖基线里的「模块名」不等于 listener id 的那一行。
 * H-32 的上游目录是 `start-work/`，而本移植的命名锚点是 v5 名 `ulw-execute`
 * （ROADMAP §2 规则 6；manifest.ts H-32 行注释）。其余 13 行归一化后即自身 id，
 * 所以本表出现第二条就说明基线与 manifest 在命名上分叉——正是本记录要暴露的漂移。
 */
const BASELINE_ID_RENAMES = new Map([['start-work', 'ulw-execute']])

/** `dir` 下全部 `*.ts`，以相对 `base` 的路径返回（递归、排序）。 */
function collectTsFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectTsFiles(full, base, out)
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(relative(base, full))
  }
  return out.sort()
}

/**
 * 文件开头的 `//` 注释块（即署名头）：去掉注释符、把空白折叠成单空格，使跨行
 * 折叠的 tag（多个 P3-T17 头部把 `@ v4.19.4` 折到下一行）仍能匹配。遇到第一行
 * 既非注释也非空行即停止——正文深处的溯源行不算署名头，因此不能满足 c12。
 */
function signatureHeader(text) {
  const header = []
  for (const line of text.split('\n')) {
    if (line.startsWith('//') || line.trim() === '') header.push(line)
    else break
  }
  return header.join('\n').replace(/^\/\/ ?/gm, '').replace(/\s+/g, ' ')
}

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

  // ── c11 — the root overlay mounts exactly the plugin insert rows (2 → 3) ───
  //
  // 与 doctor-lite check 2b（gate 4）的关系：那是本事实的既有断言，本记录**引用**
  // 它而不是平行重抄插件清单——期望值直接取自 doctor-lite-core 的
  // EXPECTED_INSERT_ROW_IDS + collectInsertRowIds（与 2b 同一事实源），故「挂哪些
  // 插件」只有一处定义。两条记录并不等价：2b 汇总比较每个 insert 条目里的 mapping
  // id（一个 insert 行塞两个 id 也通过），且 dsh/parser 缺席时 cascade 成 SKIP；
  // 本记录零成本、永远运行，并额外断言 (a) 顶层 patch 条目恰好与期望行数相等
  // （P4-T3 起 = 3：新增 omo-commands 行时本条随共享常量自动加严，无需改动本文件
  // 的断言逻辑）、(b) 每条都是
  // insert 形态——非 insert 的顶层条目会被 dsh 静默跳过（P-8）、(c) 每行的
  // `name` 就是 `@oh-my-opendsh/<id>`（2b 只比 id，name 对调它看不见）。只加严，不放松。
  try {
    const cordisRows = await loadYamlDialect(join(REPO_ROOT, 'cordis.yml'))
    const expectedIds = [...EXPECTED_INSERT_ROW_IDS]
    const problems = []
    let passDetail = ''
    if (!Array.isArray(cordisRows)) {
      problems.push('cordis.yml is not a top-level array of patch entries')
    } else {
      const insertEntries = cordisRows.filter((row) => row && Array.isArray(row.insert))
      const observedIds = collectInsertRowIds(cordisRows)
      if (insertEntries.length !== expectedIds.length) {
        problems.push(`${insertEntries.length} top-level insert entr${insertEntries.length === 1 ? 'y' : 'ies'} (want exactly ${expectedIds.length})`)
      }
      if (insertEntries.length !== cordisRows.length) {
        problems.push(`${cordisRows.length - insertEntries.length} top-level entr${cordisRows.length - insertEntries.length === 1 ? 'y is' : 'ies are'} not insert-form (dsh skips those silently, P-8)`)
      }
      if (JSON.stringify(observedIds) !== JSON.stringify(expectedIds)) {
        problems.push(`inserted ids [${observedIds.join(', ')}] (want [${expectedIds.join(', ')}] — mount order)`)
      }
      // 行 id ↔ 包名的耦合断言：doctor-lite 2b 只比 id，而 dsh 是按 `name` 解析
      // 模块的——把任意两行的 name 对调（或改成别的包）会让「omo-hooks」这个标签
      // 挂上别的代码，且现有门全部照绿。本记录把 `@oh-my-opendsh/<id>` 这一约定
      // 钉死（三个包的 package.json name 实测与之一致，P4-T3 新增的 omo-commands
      // 同受此断言约束）。
      const nameProblems = []
      for (const row of cordisRows) {
        if (!row || !Array.isArray(row.insert)) continue
        for (const inserted of row.insert) {
          if (!inserted || typeof inserted !== 'object') continue
          const id = inserted.id
          if (typeof id !== 'string' || id.length === 0) continue
          if (inserted.name !== `@oh-my-opendsh/${id}`) {
            nameProblems.push(`${id}: name=${JSON.stringify(inserted.name)} (want @oh-my-opendsh/${id})`)
          }
        }
      }
      if (nameProblems.length > 0) problems.push(`insert row id/name mismatch: ${nameProblems.join('; ')}`)
      passDetail = `${insertEntries.length} insert rows [${observedIds.join(', ')}], mount order, each id ↔ @oh-my-opendsh/<id> — `
        + 'expectation from doctor-lite-core.EXPECTED_INSERT_ROW_IDS (not restated), plus the top-level entry count and insert-form shape'
    }
    // The NAME is count-derived too: restating "2" here would be a fourth copy
    // of the row count to forget (it went stale the moment P4-T3 added the
    // omo-commands row, while the assertion itself stayed green).
    results.push(check('c11', `root cordis.yml mounts exactly the ${expectedIds.length} insert rows in EXPECTED_INSERT_ROW_IDS`, problems.length === 0, problems.join('; ') || passDetail))
  } catch (e) {
    results.push(check('c11', 'root cordis.yml mounts exactly the insert rows in EXPECTED_INSERT_ROW_IDS', false,
      `cordis.yml could not be read/parsed: ${String(e.message ?? e)}`))
  }

  // ── c12 — plan §4.9 signature header on every implementation file ─────────
  //
  // 扫 src/hooks/**/*.ts（含 ulw-execute/ 子模块；递归，将来更深的子目录同样受
  // 约束）。署名头 = 文件开头的注释块，必须同时含：上游 tag 相对路径
  // `packages/omo-opencode/src/hooks/…`、冻结 tag `v4.19.4`、以及一句移植声明。
  // 三者在折叠空白后匹配，故跨行折行的 tag 不会造成误报。
  try {
    const files = collectTsFiles(HOOKS_DIR)
    const offenders = []
    for (const rel of files) {
      const header = signatureHeader(readFileSync(join(HOOKS_DIR, rel), 'utf8'))
      const problems = []
      if (!header.includes('packages/omo-opencode/src/hooks/')) problems.push('no upstream tag-relative path')
      if (!/v4\.19\.4/.test(header)) problems.push('no @ v4.19.4 frozen-baseline tag')
      if (!PORT_DECLARATIONS.some((token) => header.includes(token)) && !/ported/i.test(header)) {
        problems.push('no semantic-port declaration')
      }
      if (problems.length > 0) offenders.push(`${rel} (${problems.join(', ')})`)
    }
    const nonVacuous = files.length > 0
    results.push(check('c12', 'src/hooks signature headers', nonVacuous && offenders.length === 0,
      offenders.length > 0
        ? offenders.join('; ')
        : nonVacuous
          ? `${files.length} .ts implementation files carry "upstream path + @ v4.19.4 + semantic-port declaration" in their leading comment block`
          : `no .ts implementation file under ${relative(REPO_ROOT, HOOKS_DIR)}/ — assertion would be vacuous`))
  } catch (e) {
    results.push(check('c12', 'src/hooks signature headers', false,
      `src/hooks/**/*.ts could not be scanned: ${String(e.message ?? e)}`))
  }

  // ── c13/c14 — the source tree ↔ manifest ↔ coverage baseline triangle ─────
  let hooksManifest = null
  try {
    hooksManifest = await import(pathToFileURL(HOOKS_MANIFEST_TS).href)
  } catch (e) {
    const reason = `manifest.ts could not be imported: ${String(e.message ?? e)}`
    results.push(check('c13', 'manifest ↔ src/hooks file set', false, reason))
    results.push(check('c14', 'manifest ↔ coverage baseline port group', false, reason))
  }
  if (hooksManifest !== null) {
    const manifestIds = hooksManifest.HOOK_MANIFEST.map((entry) => entry.id)
    const wantIds = [...manifestIds].sort()

    // c13 — 双向集合一致 + 子模块目录归属规则。
    // 归属规则（按实际形态）：顶层 `src/hooks/<id>.ts` 是 manifest 条目；`ulw-execute/`
    // 这样的子目录是**某个 id 的子模块目录**，其 basename 必须同时满足「有 manifest
    // 条目」与「有同名顶层 listener 文件」，绝不单独成为一个条目；`src/hooks/` 下任何
    // 不属于任何 id 的 .ts 都是孤儿。
    try {
      const entries = readdirSync(HOOKS_DIR, { withFileTypes: true })
      const topLevelIds = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) => entry.name.slice(0, -'.ts'.length))
        .sort()
      const subdirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
      const allTs = collectTsFiles(HOOKS_DIR)
      const problems = []
      const missing = wantIds.filter((id) => !topLevelIds.includes(id))
      const extra = topLevelIds.filter((id) => !wantIds.includes(id))
      if (missing.length > 0) problems.push(`manifest ids with no src/hooks/<id>.ts: ${missing.join(', ')}`)
      if (extra.length > 0) problems.push(`src/hooks/<id>.ts with no manifest entry: ${extra.join(', ')}`)
      for (const dir of subdirs) {
        if (!wantIds.includes(dir)) problems.push(`submodule directory '${dir}/' has no manifest entry with that id`)
        else if (!topLevelIds.includes(dir)) problems.push(`submodule directory '${dir}/' has no owning src/hooks/${dir}.ts listener`)
      }
      const orphans = allTs.filter((rel) => {
        const owner = rel.includes('/') ? rel.split('/')[0] : rel.slice(0, -'.ts'.length)
        return !wantIds.includes(owner)
      })
      if (orphans.length > 0) problems.push(`.ts files belonging to no manifest id: ${orphans.join(', ')}`)
      if (wantIds.length === 0 || topLevelIds.length === 0) problems.push('empty manifest id set or empty src/hooks file set — assertion would be vacuous')
      const subdirCensus = subdirs
        .map((dir) => `${dir}/ (${allTs.filter((rel) => rel.startsWith(`${dir}/`)).length} submodules)`)
        .join(', ')
      results.push(check('c13', 'manifest ↔ src/hooks file set', problems.length === 0,
        problems.length > 0
          ? problems.join('; ')
          : `${topLevelIds.length} top-level listener files ↔ ${manifestIds.length} manifest ids (both directions, no orphan .ts); `
            + `submodule dir(s): ${subdirCensus || 'none'}`))
    } catch (e) {
      results.push(check('c13', 'manifest ↔ src/hooks file set', false,
        `src/hooks/ could not be enumerated: ${String(e.message ?? e)}`))
    }

    // c14 — 覆盖基线 §1 的移植组 = manifest。文档是人读的一半、manifest 是机读的
    // 一半；本记录是桥。单向同步纪律（manifest.ts 头部同一口径）：落一个移植时先改
    // 覆盖基线文档（可审计的记录）→ 再改 manifest.ts（status/e2eScenario）→ 再落
    // listener 代码；绝不反向。解析不产出任何行 = 直接 FAIL（杜绝格式漂移后断言真空）。
    //
    // ══ P4-T12 演进：单文档 → 两文档并集 + manifest 侧 status 过滤 ══
    //
    // **为什么演进**。c14 原先把「移植组」定义为 phase3-hooks.md §1 一份文档的
    // 已移植行，与 manifest 的**全量** id 一一相等。P4-T12 落 H-33
    // `keyword-detector` 时这条等式第一次不再成立，且不是漂移：H-33 属于
    // Phase 4 的端口（H-33/H-34 是 Phase 4 拥有的新 H 号，见
    // phase4-commands.md §1.2 的编号声明），它的行在 phase4-commands.md §1.2 而
    // 不在 phase3-hooks.md §1；同时它的 manifest 状态是 **'pending'**（listener +
    // 单测已落，e2e 属 P4-T13，见 manifest.ts 该行注释①）。两侧因此**同时**需要
    // 一次口径调整：基线扩为并集，manifest 侧按 `status === 'ported'` 过滤。
    //
    // **两侧过滤为什么必须同时做，且语义对称**。「文档侧的『已移植』」与
    // 「manifest 侧的 `status === 'ported'`」是同一个状态的两份书写：某一行处于
    // 「已立项、未移植」时，两侧都必须把它排除。只过滤一侧会立刻破坏等式；而
    // 只在文档侧过滤会让 manifest 里一个 `pending` 行永久无人对账——**翻转
    // （pending → ported）就再也不会被任何断言看见**。对称过滤把「翻转」变成
    // 一个可观测事件：翻转的同一 commit 若只改一侧，门 6 立刻红。
    //
    // **仍然守住的强度**（演进没有削弱本记录）：
    //   ① 全量 manifest 的行数仍与 `EXPECTED_HOOK_COUNT` 相等（**不过滤**）——
    //      「15 行真的存在」这条守卫没有被 status 过滤掏空；
    //   ② c13 的双向文件集核对跑在**全量** manifest 上，因此新增 pending 行
    //      依然必须落成 `src/hooks/<id>.ts` 顶层 listener 文件；
    //   ③ 两侧都非空才允许通过（任一侧解析出 0 行即 FAIL，断言不会真空）。
    // 这三条合起来给出「pending 行存在于树里、但不参与移植组对账」的确切语义。
    //
    // **解析契约（两文档共用，phase4-commands.md §1.2 已按此布局）**：取 `## 1.`
    // 与 `## 2.` 之间、以 `| H-xx |` 开头的行，拆成单元格后**只对状态列**
    // （第 5 个数据格，下标 4）做「已移植」判定；模块列的第一个反引号 code span
    // 归一化为 id——去掉尾部 `.ts` / `/` / `-*`，再过 BASELINE_ID_RENAMES 的 v5
    // 改名表（仅 H-32）。两份文档的 §1 表格都是 6 列（`| # | 模块 | … | 状态 |`），
    // 故状态格下标一致。
    try {
      const portedRows = []
      const nonPortedRows = []
      const perDocument = []
      for (const baseline of COVERAGE_BASELINE_MDS) {
        const label = relative(REPO_ROOT, baseline)
        const lines = readFileSync(baseline, 'utf8').split('\n')
        let inSectionOne = false
        let found = 0
        let total = 0
        for (const line of lines) {
          if (/^## 1\./.test(line)) { inSectionOne = true; continue }
          if (/^## 2\./.test(line)) { inSectionOne = false; continue }
          if (!inSectionOne) continue
          const row = line.match(/^\|\s*(H-\d+)\s*\|(.*)$/)
          if (row === null) continue
          // 单元格切分：heading 匹配吃掉了第 1 格与分隔 `|`，故
          // cells = [模块, 形态, 模式, 语义摘要, 状态, '']（§1 表格六列固定）。
          const cells = row[2].split('|').map((cell) => cell.trim())
          const statusCell = cells[4] ?? ''
          total += 1
          if (!statusCell.includes('已移植')) {
            // 非已移植行 = 跳过行 + 待移植行。两类都收集：跳过行用于「文档多出
            // 一条非已移植行而 manifest 已翻」的检查（那是文档侧漏翻），待移植
            // 行用于 pending 行的翻转锚点守卫。
            nonPortedRows.push({ heading: row[1], cells: row[2], statusCell, doc: label })
            continue
          }
          found += 1
          portedRows.push({ heading: row[1], cells: row[2], statusCell, doc: label })
        }
        perDocument.push({ label, ported: found, total })
      }
      const problems = []
      if (portedRows.length === 0) {
        problems.push(`no 已移植 row parsed from ${COVERAGE_BASELINE_MDS.map((f) => relative(REPO_ROOT, f)).join(' + ')} §1 — the assertion would be vacuous (table format changed?)`)
      }
      // 逐文档非空：并集里一份文档贡献 0 行时，并集断言仍会被另一份撑住，
      // 于是「那份文档的表格漂移了」这件事会被静默吞掉。逐文档报数让漂移可见。
      //
      // ⚠️ 判据是**总行数**（已移植 + 非已移植）而不是已移植行数：P4-T12 之后
      // phase4-commands.md 的两条 H 行（H-33/H-34）都还在 pending，它合法地
      // 贡献 0 条已移植行。要求每份文档都贡献已移植行会在下一个纯 Phase 4 阶段
      // 误报；要求它贡献至少一条 `| H-xx |` 行则既能抓住表格漂移（真 0 行），
      // 又能让「整份文档暂时全是 pending」合法通过。
      for (const entry of perDocument) {
        if (entry.total === 0) problems.push(`${entry.label}: 0 — a baseline document in the union contributed no | H-xx | row at all (table format changed?)`)
      }
      const derived = []
      for (const row of portedRows) {
        const code = row.cells.match(/`([^`]+)`/)
        if (code === null) {
          problems.push(`${row.heading}: module cell carries no code span — cannot derive its listener id`)
          continue
        }
        const moduleName = code[1].replace(/\.ts$/, '').replace(/\/$/, '').replace(/-\*$/, '')
        derived.push({
          heading: row.heading,
          moduleName,
          id: BASELINE_ID_RENAMES.get(moduleName) ?? moduleName,
        })
      }
      const derivedIds = derived.map((row) => row.id)
      const derivedSet = new Set(derivedIds)
      // manifest 侧的「已移植」= `status === 'ported'`（与文档侧的状态格对称，
      // 见上方「两侧过滤为什么必须同时做」）。`pending` 行不进对账——但它仍在
      // c13 的文件集核对与 EXPECTED_HOOK_COUNT 里。
      const portedManifestIds = hooksManifest.HOOK_MANIFEST
        .filter((entry) => entry.status === 'ported')
        .map((entry) => entry.id)
      const pendingManifestIds = hooksManifest.HOOK_MANIFEST
        .filter((entry) => entry.status !== 'ported')
        .map((entry) => entry.id)
      const manifestSet = new Set(portedManifestIds)
      if (derivedSet.size !== derivedIds.length) {
        problems.push(`baseline yields duplicate listener ids: [${derivedIds.join(', ')}]`)
      }
      const missing = portedManifestIds.filter((id) => !derivedSet.has(id))
      const extra = derivedIds.filter((id) => !manifestSet.has(id))
      const union = COVERAGE_BASELINE_MDS.map((f) => relative(REPO_ROOT, f)).join(' + ')
      if (missing.length > 0) problems.push(`ported manifest ids absent from the ${union} §1 port group: ${missing.join(', ')}`)
      if (extra.length > 0) problems.push(`${union} §1 已移植 rows with no ported manifest entry: ${extra.join(', ')}`)
      // 守卫 ①：**全量**行数仍对 EXPECTED_HOOK_COUNT（不过滤 status）。
      if (manifestIds.length !== hooksManifest.EXPECTED_HOOK_COUNT) {
        problems.push(`manifest carries ${manifestIds.length} rows but EXPECTED_HOOK_COUNT is ${hooksManifest.EXPECTED_HOOK_COUNT}`)
      }
      // 翻转锚点守卫：**P4-T12 双评审后删除**（MAJOR-2）。它想守的是"两侧同改"
      // 这条纪律，但它把两类完全不同的行混进了一个判据：
      //   * phase3-hooks.md §1 里 H-08 / H-09 两条**设计内跳过**行（永不移植）；
      //   * phase4-commands.md §1.2 里"已移植但设计上不进入 e2e"的 pending 行。
      // P4-T13 交付 H-33/H-34 时两侧同改为 ported，`pendingManifestIds` 归零而
      // H-08/H-09 仍在文档里 —— 那个分支会**按设计报红**，把一次正确提交判成失败。
      //
      // 两个单侧变异各由既有断言承担，无需新分支（评审已在 /tmp 对两侧分别实证为红）：
      //   * 文档已移植、manifest 未翻 → `missing`（ported manifest id 不在文档端口组）；
      //   * manifest 已翻、文档未翻 → `extra`（文档已移植行没有 ported manifest 项）。
      // 另：脚本层与 `tests/omo-hooks/manifest-coverage-consistency.test.ts` 的
      // pending→ported 锚点测试互补——后者在单元层断言"pending 行确实带着
      // 它将来的 e2e 场景名"，双侧对账仍只由本处的 missing/extra 负责。
      const renames = derived
        .filter((row) => row.id !== row.moduleName)
        .map((row) => `${row.heading} ${row.moduleName} → ${row.id}`)
        .join(', ')
      results.push(check('c14', 'manifest ↔ coverage baseline port group', problems.length === 0,
        problems.length > 0
          ? problems.join('; ')
          : `${portedRows.length} 已移植 rows across ${union} §1 `
            + `(${perDocument.map((d) => `${d.label}: ${d.ported}/${d.total}`).join(', ')}) → ${derivedIds.length} ids `
            + `== the ${portedManifestIds.length} ported manifest ids of ${manifestIds.length} total`
            + (pendingManifestIds.length === 0
              ? ''
              : ` (not in the port group, flip both sides when ported: ${pendingManifestIds.join(', ')})`)
            + (renames === '' ? '' : ` (v5 rename: ${renames})`)))
    } catch (e) {
      results.push(check('c14', 'manifest ↔ coverage baseline port group', false,
        `${COVERAGE_BASELINE_MDS.map((f) => relative(REPO_ROOT, f)).join(' + ')} could not be read: ${String(e.message ?? e)}`))
    }
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
