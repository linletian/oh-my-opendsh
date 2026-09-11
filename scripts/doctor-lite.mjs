#!/usr/bin/env node
// scripts/doctor-lite.mjs — T21 (PRD §8 L3): a 4-check environment gate for the
// oh-my-opendsh MVP. Reference pattern: OMO doctor (feasibility report §14.6,
// docs/feasibility-report_zh-CN.md:1522-1557) — every check returns
// { status: "pass"|"fail"|"warn"|"skip", message, issues[] }, `skip` is a
// FIRST-CLASS status (a check that could not run is reported as skip with a
// reason, never faked into pass/fail), `--json` emits a single machine-readable
// object, and any fail exits 1 — so doctor-lite doubles as a CI gate.
//
// The four checks (PRD §8 L3):
//   1. dsh-version     `dsh --version` exists and is the pinned 0.1.x
//                      (decision D7) — fail if missing or outside 0.1.x,
//                      surfacing the found version.
//   2. cordis          <repo>/cordis.yml parses with the exact YAML dialect
//                      dsh loads patch files with (JSON_SCHEMA + !!js) and
//                      uses the `- insert:` row form (T4's P-8 findings: a
//                      plain `- id:` row silently skips, so rows without
//                      `insert:` downgrade the check to WARN).
//   3. llm-adapters    both LLM adapter rows visible in the composed config —
//                      `dsh --profile web --dump-config --patch <cordis>`,
//                      the same cheap observable cold-start.sh Stage A uses
//                      (T14 showed both rows). Sandboxed via HOME /
//                      XDG_CONFIG_HOME / DSH_HOME / DSH_AGENTS_HOME
//                      redirection — the user's real ~/.dsh is never touched.
//                      Skipped (cascade honesty) when check 1 already failed.
//   4. subagent-config the tool-subagent-explore row of our concerto template
//                      validates against the REAL installed dsh-tool-subagent
//                      Config schema (schemastery) — the T11 validator
//                      approach: the installed dsh's node_modules are resolved
//                      from the dsh binary itself (read-only imports of its
//                      js-yaml + Config), the template's two T11 sentinels are
//                      rendered by the plugin's own syncConcertoPreset (single
//                      source of truth, Node type-stripping), and the row's
//                      config runs through the exact schema cordis applies
//                      lazily at session composition. Imports impossible →
//                      skip with reason, not fail.
//
// Zero npm dependencies of its own: the only external modules are read-only
// imports from the installed dsh (checks 2 and 4). No boot anywhere: checks
// 1-2 are instant, check 3 is a --dump-config composition (seconds), check 4
// is a schema run — total budget < 60s.
//
// Usage:
//   node scripts/doctor-lite.mjs            human output, one line per check
//   node scripts/doctor-lite.mjs --json     single JSON object
//   node scripts/doctor-lite.mjs --cordis <path>    override the cordis.yml
//   OMO_DOCTOR_CORDIS_PATH=<path>                   (env form of --cordis)
// Exit code: 1 iff any check reported FAIL (warn/skip do not affect it).

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import {
  analyzePatchEntries,
  findRowsById,
  isPinnedDshVersion,
  LLM_ADAPTER_ROWS,
  parseDshVersion,
  PINNED_MAJOR,
  PINNED_MINOR,
} from './doctor-lite-core.ts'

const execFileAsync = promisify(execFile)

/** Repo root: this script's directory's parent (scripts/doctor-lite.mjs). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Default cordis.yml location (overridable: --cordis / OMO_DOCTOR_CORDIS_PATH). */
export const DEFAULT_CORDIS_PATH = join(REPO_ROOT, 'cordis.yml')

/**
 * Resolves the INSTALLED dsh's node_modules directory from the dsh binary
 * itself (read-only — the install is never modified): `command -v dsh`, the
 * realpath of the resolved binary, then walk up at most 8 levels for the
 * first `node_modules` carrying dsh-tool-subagent/lib/index.js and
 * js-yaml/dist/js-yaml.mjs (the two read-only imports checks 2 and 4 need).
 * Returns the absolute path or null when dsh is not on PATH or the tree
 * cannot be found.
 */
export async function resolveDshNodeModules() {
  let binPath
  try {
    const { stdout } = await execFileAsync('sh', ['-c', 'command -v dsh'], {
      timeout: 15000,
      encoding: 'utf8',
    })
    binPath = stdout.trim().split('\n')[0]
  } catch {
    return null
  }
  if (binPath === '') return null
  let realBin
  try {
    realBin = realpathSync(binPath)
  } catch {
    return null
  }
  let dir = dirname(realBin)
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'node_modules')
    if (
      existsSync(join(candidate, '@deepseek-ai', 'dsh-tool-subagent', 'lib', 'index.js'))
      && existsSync(join(candidate, 'js-yaml', 'dist', 'js-yaml.mjs'))
    ) {
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** Dynamic import from the installed dsh's node_modules (pathToFileURL form). */
const imp = (nm, specifier) => import(pathToFileURL(join(nm, specifier)).href)

/**
 * The `!!js` scalar Type dsh's patch loader registers (same construction as
 * cordis-plugin-include's JsExpr and the T11 probe validator): `!!js`
 * scalars round-trip as { __jsExpr } nodes so the loader dialect parses the
 * repo's own cordis.yml and the concerto template exactly as dsh would.
 */
function makeJsExprType(yaml) {
  return new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    resolve: (data) => typeof data === 'string',
    construct: (data) => ({ __jsExpr: data }),
  })
}

/**
 * Loads a YAML file with the installed dsh's js-yaml in the exact dialect
 * dsh loads patch files with (JSON_SCHEMA + !!js). Throws an Error with
 * `code === 'NO_PARSER'` when the installed dsh (and thus the parser) is
 * unavailable, or `code === 'PARSE'` on a YAML syntax error (message = the
 * YAMLException text).
 */
export async function loadYamlDialect(file) {
  const nm = await resolveDshNodeModules()
  if (nm === null) {
    const error = new Error('installed dsh not found')
    error.code = 'NO_PARSER'
    throw error
  }
  let yaml
  try {
    yaml = (await imp(nm, 'js-yaml/dist/js-yaml.mjs')).default
  } catch (cause) {
    const error = new Error(`js-yaml import from the installed dsh failed: ${cause.message}`)
    error.code = 'NO_PARSER'
    throw error
  }
  try {
    return yaml.load(readFileSync(file, 'utf8'), {
      schema: yaml.JSON_SCHEMA.extend(makeJsExprType(yaml)),
    })
  } catch (cause) {
    const error = new Error(String(cause.message ?? cause))
    error.code = 'PARSE'
    throw error
  }
}

/** Check result factory: the public {name, status, message, issues} shape. */
function check(name, status, message, issues = [], meta = undefined) {
  return meta === undefined
    ? { name, status, message, issues }
    : { name, status, message, issues, meta }
}

// ── check 1: dsh --version exists and is the pinned 0.1.x (D7) ──────────────

async function checkDshVersion() {
  try {
    const { stdout } = await execFileAsync('dsh', ['--version'], {
      timeout: 15000,
      encoding: 'utf8',
    })
    const found = stdout.trim()
    const version = parseDshVersion(found)
    if (version === null) {
      return check(
        'dsh-version',
        'fail',
        `dsh --version returned an unrecognized version string: ${JSON.stringify(found)}`,
        [`expected a semver like 0.1.5-rc.1 (pinned 0.1.x, decision D7), found ${JSON.stringify(found)}`],
      )
    }
    if (!isPinnedDshVersion(version)) {
      return check(
        'dsh-version',
        'fail',
        `dsh ${found} is outside the pinned 0.1.x range (decision D7)`,
        [`found ${found}, pinned ${PINNED_MAJOR}.${PINNED_MINOR}.x`],
      )
    }
    return check('dsh-version', 'pass', `dsh ${found} (pinned 0.1.x, decision D7)`)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return check(
        'dsh-version',
        'fail',
        'dsh not found on PATH',
        [`spawn dsh failed: ${error.message}`],
        { dshMissing: true },
      )
    }
    return check(
      'dsh-version',
      'fail',
      `dsh --version failed: ${error.message}`,
      [`dsh --version could not run (${error.code ?? 'unknown error'})`],
    )
  }
}

// ── check 2: cordis.yml parses + insert row form (P-8) ──────────────────────

async function checkCordis(cordisPath) {
  if (!existsSync(cordisPath)) {
    return check('cordis', 'fail', `cordis.yml not found at ${cordisPath}`, [
      'expected the repo-root patch overlay; pass --cordis <path> or OMO_DOCTOR_CORDIS_PATH for a non-default location',
    ])
  }
  let rows
  try {
    rows = await loadYamlDialect(cordisPath)
  } catch (error) {
    if (error.code === 'NO_PARSER') {
      return check(
        'cordis',
        'skip',
        `cannot parse cordis.yml — no YAML parser available (${error.message})`,
        ['the installed dsh provides the parser (js-yaml); check 1 already reports the missing dsh'],
      )
    }
    return check('cordis', 'fail', `cordis.yml failed to parse: ${error.message}`, [
      `YAML syntax error in ${cordisPath}`,
    ])
  }
  if (!Array.isArray(rows)) {
    return check('cordis', 'fail', 'cordis.yml must be a top-level YAML array of patch entries', [
      'dsh rejects non-array patch files at apply time ("must be a top-level YAML array of loader patch entries")',
    ])
  }
  const analysis = analyzePatchEntries(rows)
  if (analysis.nonMapping > 0) {
    return check(
      'cordis',
      'fail',
      `cordis.yml parses but ${analysis.nonMapping} top-level entr${analysis.nonMapping === 1 ? 'y is' : 'ies are'} not mappings`,
      analysis.issues,
    )
  }
  if (analysis.issues.length > 0) {
    return check(
      'cordis',
      'warn',
      `cordis.yml parses (${rows.length} top-level entr${rows.length === 1 ? 'y' : 'ies'}, ${analysis.insertForm} insert-form) — ${analysis.issues.length} row${analysis.issues.length === 1 ? '' : 's'} would be silently skipped (P-8)`,
      analysis.issues,
    )
  }
  return check(
    'cordis',
    'pass',
    `cordis.yml parses: ${rows.length} insert-form patch entr${rows.length === 1 ? 'y' : 'ies'} (no silent-skip rows)`,
  )
}

// ── check 3: both LLM adapters visible in the composed config ───────────────

async function checkLlmAdapters(cordisPath, check1) {
  if (check1.status === 'fail' && check1.meta?.dshMissing === true) {
    return check(
      'llm-adapters',
      'skip',
      'dsh unavailable — cascaded from check 1 (dump-config cannot run)',
      ['check 1 already reports the missing dsh; fix that first'],
    )
  }
  const sandbox = mkdtempSync(join(tmpdir(), 'omo-doctor-lite-dump-'))
  try {
    // Same sandboxing discipline as scripts/cold-start.sh: HOME /
    // XDG_CONFIG_HOME / DSH_HOME / DSH_AGENTS_HOME redirected into a
    // throwaway dir — the user's real ~/.dsh and ~/.config are never touched.
    const env = {
      ...process.env,
      HOME: join(sandbox, 'home'),
      XDG_CONFIG_HOME: join(sandbox, 'xdg'),
      DSH_HOME: join(sandbox, 'dsh'),
      DSH_AGENTS_HOME: join(sandbox, 'agents'),
    }
    mkdirSync(env.HOME, { recursive: true })
    mkdirSync(env.XDG_CONFIG_HOME, { recursive: true })
    // Root flags (--profile/--patch) precede app flags (--dump-config is a
    // root-level dump action; the exact cold-start.sh Stage A invocation).
    const { stdout, stderr } = await execFileAsync(
      'dsh',
      ['--profile', 'web', '--dump-config', '--patch', resolve(cordisPath)],
      { env, timeout: 45000, encoding: 'utf8' },
    )
    const missing = LLM_ADAPTER_ROWS.filter((adapter) => !stdout.includes(`name: '${adapter}'`))
    const patchWarnings = stderr
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && /patch:|not found|mismatch|failed/i.test(line))
    if (missing.length > 0) {
      return check(
        'llm-adapters',
        'fail',
        `composed config is missing adapter row(s): ${missing.join(', ')}`,
        [...missing.map((adapter) => `no "name: '${adapter}'" row in the --dump-config tree`), ...patchWarnings],
      )
    }
    return check(
      'llm-adapters',
      'pass',
      `both LLM adapters in the composed config: ${LLM_ADAPTER_ROWS.join(' + ')} (dsh --profile web --dump-config)`,
      patchWarnings,
    )
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.killed === true) {
      return check(
        'llm-adapters',
        'fail',
        'dsh --profile web --dump-config timed out (45s budget)',
        ['the composed-config observable could not be produced in time'],
      )
    }
    const stderrTail = (error.stderr ?? '').trim()
    return check(
      'llm-adapters',
      'fail',
      `dsh --profile web --dump-config failed: ${error.message}`,
      stderrTail.length > 0 ? [stderrTail] : [],
    )
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
}

// ── check 4: every config-bearing row vs the real installed Config ──────────

/**
 * Flattens a composition's rows, recursing into `cordis:group` config lists
 * (the same traversal the mount performs).
 */
function flattenRows(rows, out = []) {
  for (const row of rows ?? []) {
    if (typeof row !== 'object' || row === null) continue
    out.push(row)
    if (Array.isArray(row.config)) flattenRows(row.config, out)
  }
  return out
}

/**
 * Resolves a row's plugin to the entry file this install would load, or null
 * when the package is not installed under `nm`.
 *
 * Handles the subpath form the compositions use
 * (`@deepseek-ai/dsh-tool-subagent-control/list-agents`): the package is the
 * first two segments for a scoped name, everything after is the subpath, and
 * the package's own `exports` map names the file. A row naming an absent
 * package is discovery's `broken` verdict to report, not this check's.
 */
function resolvePluginEntry(nm, specifier) {
  const segments = specifier.split('/')
  const packageName = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
  const subpath = specifier.slice(packageName.length)
  const packageDir = join(nm, packageName)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
  const key = subpath === '' ? '.' : `.${subpath}`
  const entry = manifest.exports?.[key] ?? (subpath === '' ? manifest.exports : undefined)
  const relative = typeof entry === 'string'
    ? entry
    : entry?.default ?? entry?.import ?? (subpath === '' ? manifest.main : undefined)
  return typeof relative === 'string' ? relative : null
}

/**
 * Every row's config against the Config schema of the plugin THIS INSTALL
 * would mount for it — the schema cordis applies lazily at session
 * composition, run eagerly here.
 *
 * This is the check whose absence shipped the 0.1.5-rc.1 persona break: the
 * eager gate existed but covered exactly one row (`tool-subagent-explore`),
 * and the row that broke (`persona`) had none
 * (docs/dsh-0.1.5-rc.1-review.md §6). A key rename in any unguarded row is
 * therefore invisible to every other gate in the chain — the YAML parses, the
 * markers are present, and discovery's health check only proves a row's module
 * RESOLVES, never that its config validates. Rows whose package exports no
 * `Config` are reported as unchecked, never as pass, so the report cannot
 * claim coverage it does not have.
 *
 * `nm` is the installed dsh's node_modules, so the schema is the runtime's own.
 * @returns { checked: string[], unchecked: string[], skipped: string[], failures: string[] }
 */
async function validateCompositionRows(nm, rows, imp) {
  const checked = []
  const unchecked = []
  const skipped = []
  const failures = []
  for (const row of flattenRows(rows)) {
    const id = typeof row.id === 'string' ? row.id : '(anonymous)'
    const name = row.name
    if (typeof name !== 'string' || name.length === 0) continue
    if (name.startsWith('cordis:')) continue // loader builtin (group/meta), no package schema
    if (row.disabled === true) {
      skipped.push(id)
      continue
    }
    const relative = resolvePluginEntry(nm, name)
    if (relative === null) {
      skipped.push(`${id} (${name} not installed)`)
      continue
    }
    let mod
    try {
      mod = await imp(nm, join(name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0], relative))
    } catch (error) {
      // A package that exists but cannot import is a mount failure the real
      // session would hit; report it rather than swallowing it.
      failures.push(`${id} (${name}): import failed — ${String(error.message ?? error).slice(0, 160)}`)
      continue
    }
    const Schema = mod.Config ?? mod.default?.Config
    if (typeof Schema !== 'function') {
      unchecked.push(`${id} (${name})`)
      continue
    }
    try {
      // A row with no `config` still gets the schema's defaults applied, which
      // is exactly what the loader does — an omitted required field fails here.
      const validated = new Schema(row.config ?? {})
      void validated
      checked.push(id)
    } catch (error) {
      failures.push(`${id} (${name}): ${error.name ?? 'Error'}: ${String(error.message ?? error).slice(0, 240)}`)
    }
  }
  return { checked, unchecked, skipped, failures }
}

async function checkSubagentConfig(check1) {
  if (check1.status === 'fail' && check1.meta?.dshMissing === true) {
    return check(
      'subagent-config',
      'skip',
      'dsh unavailable — cascaded from check 1 (validator imports impossible)',
      ['check 1 already reports the missing dsh; fix that first'],
    )
  }
  const nm = await resolveDshNodeModules()
  if (nm === null) {
    return check(
      'subagent-config',
      'skip',
      'cannot resolve the installed dsh node_modules — validator imports impossible',
      ['the validator reads js-yaml + plugin Config schemas from the dsh install; check 1 reports the dsh state'],
    )
  }
  let yaml
  let Config
  let concerto
  let resolveModelRoutes
  try {
    yaml = (await imp(nm, 'js-yaml/dist/js-yaml.mjs')).default
    ;({ Config } = await imp(nm, '@deepseek-ai/dsh-tool-subagent/lib/index.js'))
    // Node 24 type-stripping runs the plugin's own modules — the same single
    // source of truth production uses at apply() time (P-8.6).
    concerto = await import(
      pathToFileURL(join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents', 'src', 'concerto-preset.ts')).href
    )
    ;({ resolveModelRoutes } = await import(
      pathToFileURL(join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents', 'src', 'model-routes.ts')).href
    ))
  } catch (error) {
    return check(
      'subagent-config',
      'skip',
      `validator imports impossible: ${error.message}`,
      ['the T11 validator path requires the installed dsh (js-yaml + Config) and the repo plugin sources'],
    )
  }
  const temp = mkdtempSync(join(tmpdir(), 'omo-doctor-lite-concerto-'))
  try {
    // Renders the T11 sentinels (persona + agentOptions) with the plugin's
    // own renderers — validating the RAW template would be a false negative:
    // the sentinel scalars are not the config production mounts.
    concerto.syncConcertoPreset(temp)
    const rows = yaml.load(readFileSync(join(temp, 'agent.cordis.yml'), 'utf8'), {
      schema: yaml.JSON_SCHEMA.extend(makeJsExprType(yaml)),
    })
    // The general pass FIRST: every row's config against its own installed
    // schema. The T11 contract checks below are stricter assertions on ONE of
    // those rows; this pass is what makes a rename in any OTHER row loud.
    const sweep = await validateCompositionRows(nm, rows, imp)
    if (sweep.failures.length > 0) {
      return check(
        'subagent-config',
        'fail',
        `${String(sweep.failures.length)} row(s) rejected by their installed Config schema`,
        [
          ...sweep.failures,
          'this is the exact schema cordis applies lazily at session composition — a broken row fails here instead of at first session',
        ],
      )
    }
    const found = findRowsById(rows, 'tool-subagent-explore')
    if (found.length !== 1) {
      return check(
        'subagent-config',
        'fail',
        `expected exactly 1 tool-subagent-explore row in the rendered concerto template, found ${found.length}`,
        [`the T11 delegation tool instance is the contract this check validates`],
      )
    }
    const row = found[0]
    if (row.name !== '@deepseek-ai/dsh-tool-subagent') {
      return check(
        'subagent-config',
        'fail',
        `tool-subagent-explore row has name ${JSON.stringify(row.name)} — expected '@deepseek-ai/dsh-tool-subagent'`,
        ['the row must be a dsh-tool-subagent instance (T11 form A)'],
      )
    }
    let validated
    try {
      validated = Config(row.config)
    } catch (error) {
      return check(
        'subagent-config',
        'fail',
        `installed dsh-tool-subagent Config rejected the row: ${error.name ?? 'Error'}: ${error.message}`,
        ['this is the exact schema cordis applies lazily at session composition — a broken row fails here instead of at first session'],
      )
    }
    const problems = []
    if (validated.provider !== 'spawn') problems.push(`provider=${JSON.stringify(validated.provider)} (want spawn)`)
    if (validated.toolName !== 'explore') problems.push(`toolName=${JSON.stringify(validated.toolName)} (want explore)`)
    if (validated.backgroundMode !== 'continuable') problems.push(`backgroundMode=${JSON.stringify(validated.backgroundMode)} (want continuable)`)
    if (validated.maxDepth !== 1) problems.push(`maxDepth=${JSON.stringify(validated.maxDepth)} (want 1, T13)`)
    // T12 + F1 fix (2026-09-04): deny = the two mutation tools PLUS the
    // delegation tool itself (physical no-delegation, AC-6b parity).
    if (JSON.stringify(validated.toolFilter) !== JSON.stringify({ deny: ['write', 'edit', 'explore'] })) {
      problems.push(`toolFilter=${JSON.stringify(validated.toolFilter)} (want deny:[write,edit,explore], T12 + F1)`)
    }
    // F1 fix: no generic delegation rows may remain in the rendered template
    // (findRowsById is group-recursive — the rows were nested in `delegation`).
    if (findRowsById(rows, 'tool-subagent').length > 0 || findRowsById(rows, 'tool-subagent-fork').length > 0) {
      problems.push('generic subagent/subagent_fork rows present (F1: must be dropped — only `explore` may delegate)')
    }
    const expectedRoute = resolveModelRoutes().explore
    if (validated.agentOptions?.provider !== expectedRoute.provider || validated.agentOptions?.model !== expectedRoute.model) {
      problems.push(`agentOptions=${JSON.stringify(validated.agentOptions)} (want ${expectedRoute.provider}/${expectedRoute.model}, T14)`)
    }
    if (typeof validated.persona !== 'string' || !validated.persona.includes('# Explore: Read-Only Retrieval Agent')) {
      problems.push('persona missing the T10 explore persona heading (sentinels unrendered?)')
    }
    if (problems.length > 0) {
      return check(
        'subagent-config',
        'fail',
        `validated row mismatches the T11 contract: ${problems.join('; ')}`,
        problems,
      )
    }
    return check(
      'subagent-config',
      'pass',
      `${String(sweep.checked.length)} row(s) validate against their installed Config schemas, plus the T11 contract — `
        + 'tool-subagent-explore: '
        + `provider=spawn toolName=explore backgroundMode=continuable maxDepth=1 deny=[write,edit,explore] route=${expectedRoute.provider}/${expectedRoute.model} persona=${validated.persona.length} chars`
        + (sweep.unchecked.length === 0
          ? ''
          : `; unchecked (package exports no Config schema): ${sweep.unchecked.join(', ')}`)
        + (sweep.skipped.length === 0 ? '' : `; skipped: ${sweep.skipped.join(', ')}`),
      sweep.unchecked.length === 0
        ? []
        : [`these rows carry no schema and were NOT verified: ${sweep.unchecked.join(', ')}`],
    )
  } catch (error) {
    return check(
      'subagent-config',
      'fail',
      `concerto template validation threw: ${error.message}`,
      ['the template or its renderers are broken (sentinel discipline, system sections, or model routes)'],
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

/**
 * Runs the four checks in order (3 and 4 depend on 1's cascade state).
 * Returns { checks: [{name, status, message, issues}], pass } where `pass`
 * is false iff any check reported FAIL. Never throws: unexpected errors are
 * folded into a final fail check so the doctor never crashes unhandled.
 */
export async function runDoctor(cordisPath) {
  const results = []
  try {
    const c1 = await checkDshVersion()
    results.push(c1)
    results.push(await checkCordis(cordisPath))
    results.push(await checkLlmAdapters(cordisPath, c1))
    results.push(await checkSubagentConfig(c1))
  } catch (error) {
    results.push(check(
      'doctor-lite',
      'fail',
      `unexpected error: ${error.message ?? error}`,
      [String(error.stack ?? error)],
    ))
  }
  const pass = !results.some((result) => result.status === 'fail')
  return { checks: results.map(({ name, status, message, issues }) => ({ name, status, message, issues })), pass }
}

/** Human output: one line per check, then a summary line. */
function formatHuman(result) {
  const lines = []
  for (const { name, status, message } of result.checks) {
    lines.push(`[${status.toUpperCase()}] ${name}: ${message}`)
  }
  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 }
  for (const { status } of result.checks) counts[status] += 1
  lines.push(
    `doctor-lite: ${counts.pass} pass, ${counts.fail} fail, ${counts.warn} warn, ${counts.skip} skip — exit ${result.pass ? 0 : 1}`,
  )
  return lines.join('\n')
}

function parseArgs(argv) {
  let json = false
  let cordisPath = process.env.OMO_DOCTOR_CORDIS_PATH ?? undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') json = true
    else if (arg === '--cordis') cordisPath = argv[++i]
    else if (arg === '-h' || arg === '--help') {
      console.log(
        'doctor-lite: 4-check environment gate (PRD §8 L3)\n'
        + 'usage: node scripts/doctor-lite.mjs [--json] [--cordis <path>]\n'
        + '       OMO_DOCTOR_CORDIS_PATH=<path> overrides the cordis.yml location (env form)\n'
        + 'checks: dsh-version, cordis, llm-adapters, subagent-config — exit 1 iff any FAIL',
      )
      process.exit(0)
    }
  }
  return { json, cordisPath: resolve(cordisPath ?? DEFAULT_CORDIS_PATH) }
}

// Main guard: importing this module (e.g. from vitest) is side-effect free.
const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const { json, cordisPath } = parseArgs(process.argv.slice(2))
  const result = await runDoctor(cordisPath)
  if (json) {
    console.log(JSON.stringify(result))
  } else {
    console.log(formatHuman(result))
  }
  process.exit(result.pass ? 0 : 1)
}
