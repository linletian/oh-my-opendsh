#!/usr/bin/env node
// scripts/doctor-lite.mjs — T21 (PRD §8 L3): a 5-check environment gate for the
// oh-my-opendsh MVP. Reference pattern: OMO doctor (feasibility report §14.6,
// docs/feasibility-report_zh-CN.md:1522-1557) — every check returns
// { status: "pass"|"fail"|"warn"|"skip", message, issues[] }, `skip` is a
// FIRST-CLASS status (a check that could not run is reported as skip with a
// reason, never faked into pass/fail), `--json` emits a single machine-readable
// object, and any fail exits 1 — so doctor-lite doubles as a CI gate.
//
// The five checks (PRD §8 L3; 2b added by P3-T3):
//   1. dsh-version     `dsh --version` exists and is the pinned 0.2.x
//                      (decision D7, minor flipped 1→2 by the D17 cutover,
//                      P4.5-T12b) — fail if missing or outside 0.2.x,
//                      surfacing the found version.
//   2. cordis          <repo>/cordis.yml parses with the exact YAML dialect
//                      dsh loads patch files with (JSON_SCHEMA + !!js) and
//                      uses the `- insert:` row form (T4's P-8 findings: a
//                      plain `- id:` row silently skips, so rows without
//                      `insert:` downgrade the check to WARN).
//   2b. cordis-plugins cordis.yml inserts EXACTLY the plugin rows P3-T3 names
//                      (EXPECTED_INSERT_ROW_IDS: omo-agents, then omo-hooks, then
//                      omo-commands since P4-T3, omo-team since P5-T3, omo-lsp
//                      since P6-T4 — in mount order), the fact every
//                      sandbox boot site installs a package for (the omo-lsp row's
//                      plugin is dsh-bundled — no profile install; probe-proven).
//                      A dropped /
//                      renamed / reordered / extra plugin row fails here instead
//                      of surfacing as a plugin that silently never mounted.
//                      Skipped when check 2 could
//                      not produce a parsed row list (cascade honesty).
//   3. llm-adapters    both LLM adapter rows visible in the composed config —
//                      `dsh --profile web --dump-config --patch <cordis>`,
//                      the same cheap observable cold-start.sh Stage A uses
//                      (T14 showed both rows). Sandboxed via HOME /
//                      XDG_CONFIG_HOME / DSH_HOME / DSH_AGENTS_HOME
//                      redirection — the user's real ~/.dsh is never touched.
//                      Skipped (cascade honesty) when check 1 already failed.
//   4. subagent-config every config-bearing row of our concerto template
//                      validates against the REAL installed dsh-tool-subagent
//                      Config schema (schemastery) — the T11 validator
//                      approach: the installed dsh's node_modules are resolved
//                      from the dsh binary itself (read-only imports of its
//                      js-yaml + Config), the template's 29 T11/P2-T15
//                      sentinels are rendered by the plugin's own
//                      syncConcertoPreset (single source of truth, Node
//                      type-stripping), and every row's config runs through the
//                      exact schema cordis applies lazily at session
//                      composition. P2-T20 adds the SEMANTIC half: each of the
//                      10 roster delegation rows is asserted against its
//                      roster-derived contract (toolName == entry id, class
//                      filter — roster-computed deny / no key for the
//                      orchestrator / allowTools for the allowlist — the
//                      entry's maxDepth, the entry's resolved route, and a
//                      rendered non-empty persona), plus the explore-named T10
//                      heading specialization. The 0.1.5-rc.1 persona break
//                      shipped because schema legality was the ONLY gate
//                      (docs/dsh-0.1.5-rc.1-review.md §6). Imports impossible
//                      → skip with reason, not fail.
//
// Zero npm dependencies of its own: the only external modules are read-only
// imports from the installed dsh (checks 2, 2b and 4). No boot anywhere: checks
// 1-2b are instant (2b re-reads the same tiny file), check 3 is a --dump-config
// composition (seconds), check 4 is a schema run — total budget < 60s.
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
  collectInsertRowIds,
  delegationRowContractProblems,
  DSH_BUNDLED_INSERT_ROW_NAMES,
  EXPECTED_INSERT_ROW_IDS,
  expectedDelegationRowContract,
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

// ── check 1: dsh --version exists and is the pinned 0.2.x (D7, flipped 1→2
//    at the D17 cutover, 2323658 — this header said 0.1.x until PR #12) ──────

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
        [`expected a semver like 0.2.0-rc.2 (pinned 0.2.x, decision D7), found ${JSON.stringify(found)}`],
      )
    }
    if (!isPinnedDshVersion(version)) {
      return check(
        'dsh-version',
        'fail',
        `dsh ${found} is outside the pinned 0.2.x range (decision D7, D17 cutover)`,
        [`found ${found}, pinned ${PINNED_MAJOR}.${PINNED_MINOR}.x`],
      )
    }
    return check('dsh-version', 'pass', `dsh ${found} (pinned 0.2.x, decision D7)`)
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

// ── check 2b: cordis.yml mounts exactly the five plugin rows (P3-T3; P4-T3 +1; P5-T3 +1; P6-T4 +1)

/**
 * P3-T3's mount assertion: the patch overlay must insert exactly the plugin
 * rows EXPECTED_INSERT_ROW_IDS names (two at P3-T3, three since P4-T3 mounted
 * omo-commands, four since P5-T3 mounted omo-team, five since P6-T4 mounted
 * omo-lsp), in mount order. The COUNT
 * is never restated here — it comes from the shared constant, which
 * scripts/verify-concerto-static.mjs's c11 also reads. A NEW check rather than
 * more conditions inside check 2: check 2 owns the P-8 parse question ("does
 * every top-level row use the insert form"), while this one owns "which plugins
 * are mounted" — the fact every sandbox boot site (scripts/cold-start.sh,
 * tests/e2e/drive.mjs, scripts/concerto-mode-probe.sh, scripts/smoke-real.mjs)
 * has to install a package for. A row dropped from the overlay, renamed,
 * reordered or joined by a third plugin without its install site fails here
 * instead of surfacing as a plugin that silently never mounted.
 *
 * Cascades honestly: check 2 owns the missing-file / unparseable-file report
 * (this check re-parses the same file only to read the ids), so it skips with
 * the reason when check 2 could not produce a parsed row list. check 1's
 * missing-dsh case cascades for the same reason check 3 does — the YAML dialect
 * parser is imported from the installed dsh.
 */
async function checkCordisPlugins(cordisPath, check1, check2) {
  if (check1.status === 'fail' && check1.meta?.dshMissing === true) {
    return check(
      'cordis-plugins',
      'skip',
      'dsh unavailable — cascaded from check 1 (the YAML dialect parser comes from the installed dsh)',
      ['check 1 already reports the missing dsh; fix that first'],
    )
  }
  if (check2.status === 'fail' || check2.status === 'skip') {
    return check(
      'cordis-plugins',
      'skip',
      `cordis.yml plugin rows not readable — cascaded from check 2 (${check2.status})`,
      [check2.message],
    )
  }
  let rows
  try {
    rows = await loadYamlDialect(cordisPath)
  } catch (error) {
    return check(
      'cordis-plugins',
      'skip',
      `cordis.yml could not be re-parsed for the plugin rows — cascaded from check 2 (${error.code ?? error.message})`,
      [check2.message],
    )
  }
  const observed = collectInsertRowIds(rows)
  const expected = [...EXPECTED_INSERT_ROW_IDS]
  const matches = observed.length === expected.length
    && observed.every((id, index) => id === expected[index])
  if (!matches) {
    return check(
      'cordis-plugins',
      'fail',
      `cordis.yml inserts ${observed.length} plugin row${observed.length === 1 ? '' : 's'} [${observed.join(', ')}] — expected exactly ${expected.length} in mount order [${expected.join(', ')}]`,
      [
        'the root overlay mounts @oh-my-opendsh/omo-agents, then @oh-my-opendsh/omo-hooks '
        + '(P3-T3), then @oh-my-opendsh/omo-commands (P4-T3); each of those needs its own '
        + '`dsh plugin --profile web add <dir>` at every sandbox boot site '
        + '(omo-team since P5-T3 likewise; omo-lsp since P6-T4 mounts the dsh-bundled '
        + '@deepseek-ai/dsh-mcp-client and needs NO profile install)',
      ],
    )
  }
  return check(
    'cordis-plugins',
    'pass',
    `cordis.yml inserts exactly the ${expected.length} plugin rows in mount order: ${expected.join(' + ')}`,
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

/**
 * P5-T14 (门 4) — the REPO's own plugin rows (root cordis.yml) are a second
 * composition surface the preset sweep above never touches: the four
 * `@oh-my-opendsh/*` rows are mounted from this workspace, not from dsh's
 * node_modules, so their Configs could not be swept by `resolvePluginEntry`.
 * This sweep closes that gap and moves omo-team from "not swept at all" to
 * the VALIDATED face:
 *
 *   * every plugin row's package is imported from its own `exports['.']`
 *     (Node 24 type-stripping, the same loader the real boot uses through the
 *     installed copy — here the repo copy is the source of truth);
 *   * a row whose package exports a `Config` is validated with
 *     `new Schema(row.config ?? {})` — the identical constructor-validation
 *     contract the preset sweep applies to the 26 installed rows, and the
 *     same shape cordis validates through `~standard.validate` at mount
 *     (omo-team/src/team/team-row-config.ts's header carries the two-arm
 *     contract; this sweep is arm 2's live exercise);
 *   * a row whose package exports NO `Config` is legal only if it is on the
 *     explicit no-schema declaration list below AND carries no `config:` key
 *     — an undeclared no-schema row, or a no-schema row that grew config,
 *     fails loudly instead of riding the unchecked list quietly.
 *
 * omo-team is PINNED to the checked side (`REPO_ROWS_WITH_SCHEMA`): the day
 * its `Config` export disappears, this check reddens — the schema is a mount
 * contract, not a comment. The default it validates to is READ off the
 * schema (`new Config({}).maxMembers`), never restated here.
 *
 * P6-T4 adds the DECLARED-EXCEPTION arm for the dsh-bundled rows (the rows
 * the name filter above excludes by construction): every row whose id is a
 * key of doctor-lite-core's `DSH_BUNDLED_INSERT_ROW_NAMES` (omo-lsp →
 * @deepseek-ai/dsh-mcp-client) has its config validated against the
 * INSTALLED plugin's own `Config` schema — resolved from the installed dsh's
 * node_modules exactly like `validateCompositionRows` does. Before this arm
 * the omo-lsp row's config was validated by NOTHING (review MINOR-3): a
 * config typo booted with failOnStartupError:false and lost the LSP face
 * silently. The exception is data, not a relaxed rule — the row's name must
 * equal the declared one, the schema must exist, and a key naming no mounted
 * row fails (the map is checked bidirectionally, review NIT-2). The `!!js`
 * nodes are interpolated first with the installed cordis loader's OWN
 * `interpolate(ctx, config)` (cordis-plugin-loader's `internal/config` hook)
 * — the raw `{__jsExpr}` scalars are not what the mounted plugin receives,
 * so validating them raw would be a false alarm, and validating nothing was
 * the hole this arm closes.
 */
const REPO_ROWS_WITH_SCHEMA = ['omo-team']
// v1 carries no row config, by ruling: omo-agents' config face is the roster
// + model-routes rendered into the concerto preset (its rows live there and
// ARE swept there); omo-hooks' and omo-commands' knobs are boot constants,
// not row config. If one of them ever gains a Config export it moves to the
// checked side automatically (the sweep derives, this list only declares the
// absence it expects).
const REPO_ROWS_NO_SCHEMA = ['omo-agents', 'omo-hooks', 'omo-commands']

async function validateRepoPluginRows(yaml, nm) {
  const failures = []
  const checked = []
  const noSchema = []
  let rows
  try {
    rows = yaml.load(readFileSync(join(REPO_ROOT, 'cordis.yml'), 'utf8'), {
      schema: yaml.JSON_SCHEMA.extend(makeJsExprType(yaml)),
    })
  } catch (error) {
    return { checked, noSchema, failures: [`root cordis.yml failed to parse: ${error.message}`] }
  }
  // The patch file's rows nest under `insert:` (the patch entry form — see
  // cordis.yml's header), unlike the rendered preset whose groups nest under
  // `config:`; flattenRows only knows the second shape, so the walk here
  // covers both. The `- insert:` wrapper objects carry no `name` and fall
  // out of the plugin filter naturally.
  const flat = []
  const walk = (node) => {
    if (!Array.isArray(node)) return
    for (const row of node) {
      if (typeof row !== 'object' || row === null) continue
      flat.push(row)
      if (Array.isArray(row.insert)) walk(row.insert)
      if (Array.isArray(row.config)) walk(row.config)
    }
  }
  walk(rows)
  const pluginRows = flat.filter((row) => typeof row?.name === 'string' && row.name.startsWith('@oh-my-opendsh/'))
  for (const row of pluginRows) {
    const id = String(row.id ?? row.name)
    const pkgDir = join(REPO_ROOT, 'patches', 'omo-dsh', id)
    let entry
    try {
      const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
      const exported = typeof pkg.exports === 'string' ? pkg.exports : pkg.exports?.['.']
      if (typeof exported !== 'string') {
        failures.push(`${id}: package.json exports['.'] is missing — the row cannot resolve its entry`)
        continue
      }
      entry = pathToFileURL(join(pkgDir, exported)).href
    } catch (error) {
      failures.push(`${id}: cannot resolve repo package entry — ${error.message}`)
      continue
    }
    let mod
    try {
      mod = await import(entry)
    } catch (error) {
      failures.push(`${id}: import failed — ${String(error.message ?? error).slice(0, 160)}`)
      continue
    }
    const Schema = mod.Config ?? mod.default?.Config
    if (typeof Schema !== 'function') {
      if (!REPO_ROWS_NO_SCHEMA.includes(id)) {
        failures.push(`${id}: exports no Config schema and is not on the declared no-schema list — declare it (REPO_ROWS_NO_SCHEMA) or ship a Config`)
        continue
      }
      if (row.config !== undefined) {
        failures.push(`${id}: no-schema row carries a config: key — a config needs a schema to answer it`)
        continue
      }
      noSchema.push(id)
      continue
    }
    if (REPO_ROWS_NO_SCHEMA.includes(id)) {
      failures.push(`${id}: declared no-schema but now exports a Config — move it to REPO_ROWS_WITH_SCHEMA`)
      continue
    }
    try {
      const validated = new Schema(row.config ?? {})
      // Read the default OFF the schema — the message reports what the
      // contract produced, never a hand-copied number.
      checked.push(`${id}(maxMembers=${JSON.stringify(validated.maxMembers ?? null)})`)
    } catch (error) {
      failures.push(`${id}: ${error.name ?? 'Error'}: ${String(error.message ?? error).slice(0, 240)}`)
    }
  }
  // P6-T4 declared-exception arm (review MINOR-3): the dsh-bundled rows the
  // @oh-my-opendsh/* name filter above cannot see. Same constructor-validation
  // contract, but the package resolves from the INSTALLED dsh (resolvePluginEntry
  // + imp — the face checkSubagentConfig already uses), and the `!!js` scalars
  // are interpolated first with the installed cordis loader's OWN interpolate
  // (the internal/config hook: the raw {__jsExpr} nodes are not what the
  // mounted plugin receives). Exception = data, not a relaxed rule: an
  // undeclared row name, a missing schema, and a map key that names no
  // mounted row (NIT-2, bidirectional) all FAIL here.
  const bundledRows = flat.filter(
    (row) => typeof row?.id === 'string' && DSH_BUNDLED_INSERT_ROW_NAMES[row.id] !== undefined,
  )
  const bundledSeen = new Set()
  if (bundledRows.length > 0) {
    let interpolate
    try {
      ;({ interpolate } = await imp(nm, '@deepseek-ai/cordis-plugin-loader/lib/index.js'))
    } catch (error) {
      failures.push(`dsh-bundled arm: cordis-plugin-loader import failed — ${String(error.message ?? error).slice(0, 160)}`)
    }
    for (const row of bundledRows) {
      const id = String(row.id)
      const declaredName = DSH_BUNDLED_INSERT_ROW_NAMES[id]
      bundledSeen.add(id)
      if (row.name !== declaredName) {
        failures.push(`${id}: declared dsh-bundled as '${declaredName}', the row names ${JSON.stringify(row.name)} — the exception is data, an undeclared name fails`)
        continue
      }
      if (typeof interpolate !== 'function') {
        failures.push(`${id}: cannot interpolate its !!js config — the cordis-plugin-loader import above failed`)
        continue
      }
      const relative = resolvePluginEntry(nm, declaredName)
      if (relative === null) {
        failures.push(`${id}: '${declaredName}' does not resolve in the installed dsh node_modules — its Config cannot be checked`)
        continue
      }
      let mod
      try {
        mod = await imp(nm, join(declaredName.startsWith('@') ? declaredName.split('/').slice(0, 2).join('/') : declaredName.split('/')[0], relative))
      } catch (error) {
        failures.push(`${id}: import of '${declaredName}' failed — ${String(error.message ?? error).slice(0, 160)}`)
        continue
      }
      const Schema = mod.Config ?? mod.default?.Config
      if (typeof Schema !== 'function') {
        failures.push(`${id}: '${declaredName}' exports no Config schema — the declared exception assumed the runtime's own validator exists`)
        continue
      }
      try {
        // Identity is READ off the validated config, never restated here.
        const validated = new Schema(interpolate({}, row.config ?? {}))
        checked.push(`${id}(serverName=${JSON.stringify(validated.serverName ?? null)})`)
      } catch (error) {
        failures.push(`${id}: ${error.name ?? 'Error'}: ${String(error.message ?? error).slice(0, 240)}`)
      }
    }
  }
  // NIT-2: DSH_BUNDLED_INSERT_ROW_NAMES is honoured in BOTH directions — a
  // key that names no mounted row is stale exception data and fails loudly.
  for (const requiredId of Object.keys(DSH_BUNDLED_INSERT_ROW_NAMES)) {
    if (!bundledSeen.has(requiredId)) {
      failures.push(`${requiredId}: declared dsh-bundled (DSH_BUNDLED_INSERT_ROW_NAMES) but cordis.yml mounts no row with this id — the exception names nothing`)
    }
  }
  for (const requiredId of REPO_ROWS_WITH_SCHEMA) {
    if (!checked.some((entry) => entry.startsWith(`${requiredId}(`))) {
      failures.push(`${requiredId}: pinned to the validated face (REPO_ROWS_WITH_SCHEMA) but did not reach it — its Config export or its cordis.yml row is gone`)
    }
  }
  if (pluginRows.length === 0) {
    failures.push('root cordis.yml carries no @oh-my-opendsh/* plugin rows — the repo overlay itself is broken')
  }
  return { checked, noSchema, failures }
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
  let DELEGATION_ENTRIES
  let denyToolNamesFor
  let allowToolNamesFor
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
    // P2-T15/P2-T20: every per-row expectation (toolName, class filter,
    // maxDepth) is derived from the same roster the renderer uses.
    ;({ DELEGATION_ENTRIES, denyToolNamesFor, allowToolNamesFor } = await import(
      pathToFileURL(join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents', 'src', 'roster.ts')).href
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
    // schema. The per-row roster contract below is a STRICTER assertion on the
    // ten delegation rows; this pass is what makes a rename in any OTHER row
    // loud.
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
    // P5-T14 (门 4): the repo's OWN plugin rows (root cordis.yml) ride the
    // same validated face — omo-team's exported Config is constructed here with
    // the row's config (absent → defaults), the three sibling packages are
    // held to their declared no-schema ruling, and since P6-T4 the declared
    // dsh-bundled exception rows (omo-lsp) are validated against the
    // INSTALLED plugin's own Config. See validateRepoPluginRows' header for
    // the arms it exercises.
    const repoSweep = await validateRepoPluginRows(yaml, nm)
    if (repoSweep.failures.length > 0) {
      return check(
        'subagent-config',
        'fail',
        `${String(repoSweep.failures.length)} repo plugin row(s) rejected on the root cordis.yml sweep`,
        [
          ...repoSweep.failures,
          'root cordis.yml rows mount from this workspace — their Configs are the packages own exports, validated here with the same constructor contract cordis applies at mount',
        ],
      )
    }

    // ── P2-T20: PER-ROW CONTRACT ASSERTIONS for all 10 roster rows ──────────
    // Schema legality is not meaning. Each delegation row must additionally
    // honour the roster: toolName == the entry id, the class filter (deny for
    // read-only/worker — roster-computed; NO filter key for the orchestrator;
    // allowTools for the allowlist), the entry's maxDepth, the resolved route
    // of THAT entry, and a rendered (non-empty) persona. Every expectation is
    // derived from roster.ts / model-routes.ts, never restated.
    const routes = resolveModelRoutes()
    const contractProblems = []
    const validatedDelegationRows = new Map()
    if (DELEGATION_ENTRIES.length === 0) {
      contractProblems.push('roster.ts declares no delegation entries — the per-row contract has no rows to check')
    }
    for (const entry of DELEGATION_ENTRIES) {
      const rowId = `tool-subagent-${entry.id}`
      const found = findRowsById(rows, rowId)
      if (found.length !== 1) {
        contractProblems.push(`${rowId}: expected exactly 1 row in the rendered concerto template, found ${found.length}`)
        continue
      }
      const row = found[0]
      if (row.name !== '@deepseek-ai/dsh-tool-subagent') {
        contractProblems.push(
          `${rowId}: row name ${JSON.stringify(row.name)} — expected '@deepseek-ai/dsh-tool-subagent' (T11 form A)`,
        )
        continue
      }
      let validated
      try {
        validated = Config(row.config)
      } catch (error) {
        contractProblems.push(
          `${rowId}: installed dsh-tool-subagent Config rejected the row: ${error.name ?? 'Error'}: ${error.message}`,
        )
        continue
      }
      const contract = expectedDelegationRowContract(
        {
          id: entry.id,
          className: entry.class,
          maxDepth: entry.maxDepth,
          deny: denyToolNamesFor(entry),
          allow: allowToolNamesFor(entry),
        },
        routes[entry.id],
      )
      for (const problem of delegationRowContractProblems(validated, contract)) {
        contractProblems.push(`${rowId} (${entry.class}): ${problem}`)
      }
      validatedDelegationRows.set(entry.id, validated)
    }
    // F1 fix: no generic delegation rows may remain in the rendered template
    // (findRowsById is group-recursive — the rows were nested in `delegation`).
    // P2-T15 opened delegation to the TEN named roster rows, so the stale
    // "only `explore` may delegate" wording became false: the invariant is
    // that delegation happens ONLY through the named roster tools.
    if (findRowsById(rows, 'tool-subagent').length > 0 || findRowsById(rows, 'tool-subagent-fork').length > 0) {
      contractProblems.push(
        'generic subagent/subagent_fork rows present (F1: must be dropped — delegation goes only through '
        + `the ${DELEGATION_ENTRIES.length} named roster tools)`,
      )
    }
    if (contractProblems.length > 0) {
      return check(
        'subagent-config',
        'fail',
        `${String(contractProblems.length)} roster-contract violation(s) in the rendered concerto template`,
        [
          ...contractProblems,
          'every delegation row must match its roster entry (toolName / class filter / maxDepth / route / persona) — the semantic gate absent at 0.1.5-rc.1 (docs/dsh-0.1.5-rc.1-review.md §6)',
        ],
      )
    }

    // Explore SPECIALIZATION of the generic contract above: the T11 row must
    // still carry the T10 persona heading (a per-file property the generic
    // roster-driven checker cannot know). Everything else about the row was
    // already asserted by the loop.
    const validated = validatedDelegationRows.get('explore')
    if (validated === undefined) {
      return check(
        'subagent-config',
        'fail',
        "roster.ts declares no delegation entry with id 'explore' — the T11 contract has no row to check",
        ['roster.ts is the single source for this check (P2-T15)'],
      )
    }
    if (typeof validated.persona !== 'string' || !validated.persona.includes('# Explore: Read-Only Retrieval Agent')) {
      return check(
        'subagent-config',
        'fail',
        'tool-subagent-explore persona is missing the T10 explore persona heading (sentinels unrendered?)',
        ['the T11 specialization asserts the explore persona heading on top of the generic per-row contract'],
      )
    }
    const exploreEntry = DELEGATION_ENTRIES.find((entry) => entry.id === 'explore')
    const expectedDeny = denyToolNamesFor(exploreEntry)
    const expectedRoute = routes.explore
    const rowSummary = DELEGATION_ENTRIES.map((entry) => {
      const deny = denyToolNamesFor(entry)
      const allow = allowToolNamesFor(entry)
      const filter = deny !== undefined
        ? `deny:${deny.length}`
        : allow !== undefined
          ? `allow:${allow.length}`
          : 'no-filter'
      return `${entry.id}[${entry.class} ${filter} depth=${JSON.stringify(entry.maxDepth)} ${routes[entry.id].provider}/${routes[entry.id].model}]`
    }).join(' ')
    return check(
      'subagent-config',
      'pass',
      `${String(sweep.checked.length)} row(s) validate against their installed Config schemas, plus the roster contract on all `
        + `${DELEGATION_ENTRIES.length} delegation rows — ${rowSummary}; explore specialization: `
        + `maxDepth=${JSON.stringify(exploreEntry.maxDepth)} deny=[${expectedDeny.join(',')}] `
        + `route=${expectedRoute.provider}/${expectedRoute.model} persona=${validated.persona.length} chars`
        + (sweep.unchecked.length === 0
          ? ''
          : `; unchecked (package exports no Config schema): ${sweep.unchecked.join(', ')}`)
        + (sweep.skipped.length === 0 ? '' : `; skipped: ${sweep.skipped.join(', ')}`)
        // P5-T14: the repo-overlay half of this check's evidence — validated
        // plugin rows (omo-team, with the default READ off its schema; since
        // P6-T4 also the declared dsh-bundled omo-lsp row, serverName READ
        // off the installed mcp-client's validated Config) and
        // the declared no-schema siblings, all derived from the sweep, no
        // hand-copied counts.
        + `; repo plugin rows (root cordis.yml): validated=${repoSweep.checked.join(',') || 'none'} no-schema-by-declaration=${repoSweep.noSchema.join(',') || 'none'}`,
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
 * Runs the five checks in order (3 and 4 depend on 1's cascade state; 2b reads
 * the same file 2 parsed). Returns { checks: [{name, status, message, issues}],
 * pass } where `pass` is false iff any check reported FAIL. Never throws:
 * unexpected errors are folded into a final fail check so the doctor never
 * crashes unhandled.
 */
export async function runDoctor(cordisPath) {
  const results = []
  try {
    const c1 = await checkDshVersion()
    results.push(c1)
    const c2 = await checkCordis(cordisPath)
    results.push(c2)
    results.push(await checkCordisPlugins(cordisPath, c1, c2))
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
        'doctor-lite: 5-check environment gate (PRD §8 L3)\n'
        + 'usage: node scripts/doctor-lite.mjs [--json] [--cordis <path>]\n'
        + '       OMO_DOCTOR_CORDIS_PATH=<path> overrides the cordis.yml location (env form)\n'
        + 'checks: dsh-version, cordis, cordis-plugins, llm-adapters, subagent-config — exit 1 iff any FAIL',
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
