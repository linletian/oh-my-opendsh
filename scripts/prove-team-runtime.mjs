// scripts/prove-team-runtime.mjs — P5-T14 (门 8 第 8 证；T8b 墙裁定的回归网).
//
// Precedent: scripts/prove-command-registry.mjs (P4-T16). Same house shape —
// real modules do the work in-process, the fixture face is a tmpdir, no LLM,
// no network, no boot.
//
// WHAT IS REAL HERE:
//   * the VENDORED team-core, imported DIRECTLY from patches/omo-dsh/
//     vendor/team-core/src/ on host Node 24 (type-stripping) — this is the
//     point. The T8b wall ruling (fork (B), .omo/evidence/p5t1/FORK.md §3.3)
//     decided the team state machine runs on the vendored harness-neutral
//     subset, byte-frozen, with `.ts`-extension imports as the T8b shim. If
//     ANY vendored file drifts back to extensionless imports (bun-only
//     resolution), the drift is silent to every gate except this one — the
//     e2e imports omo-team's own modules, and unit tests import through the
//     package specifier resolved by node_modules. This proof imports the
//     vendor copy BY PATH so the loadability ruling itself stays gated.
//   * the vendored resumeAllTeams executes for real against a tmpdir teams
//     face (empty dir → the terminal zero-report shape, pinned field by
//     field — a report-shape change in the vendored resume is a contract
//     break this gate sees first);
//   * the omo-team manifest integrity run in-process (validateManifest +
//     the derived row count + id uniqueness);
//   * the P5-T14 row Config (gate 4) loaded on host Node — the mount
//     contract is real bytes, not a comment.
//
// WHAT IS STUBBED, AND WHY THAT IS STILL A PROOF:
//   * the TeamSessionContext ctx — on an empty teams face resumeAllTeams
//     never touches it (the switch is over DISCOVERED teams; discovery reads
//     config.base_dir). Stubbing the untouched face is honest; the loaded
//     modules and the executed discovery path are what is proven.
//
// Usage: node scripts/prove-team-runtime.mjs
// Exit 0 = PASS, exit 1 = FAIL (every failed assertion printed).

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const VENDOR_CORE = join(REPO, 'patches', 'omo-dsh', 'vendor', 'team-core')
const imp = (p) => import(pathToFileURL(p).href)

const problems = []
const fail = (message) => problems.push(message)
const note = (message) => console.log(`P5T14-TEAM-PROOF ${message}`)

// ── 1. vendored team-core loads DIRECTLY on host Node (T8b wall ruling) ────
const vendored = {}
try {
  vendored.config = await imp(join(VENDOR_CORE, 'src', 'config.ts'))
  vendored.types = await imp(join(VENDOR_CORE, 'src', 'types.ts'))
  vendored.sessionClient = await imp(join(VENDOR_CORE, 'src', 'session-client.ts'))
  vendored.stateStore = await imp(join(VENDOR_CORE, 'src', 'team-state-store', 'index.ts'))
  vendored.resume = await imp(join(VENDOR_CORE, 'src', 'team-state-store', 'resume.ts'))
  vendored.tasklist = await imp(join(VENDOR_CORE, 'src', 'team-tasklist', 'index.ts'))
  vendored.registry = await imp(join(VENDOR_CORE, 'src', 'team-registry', 'index.ts'))
  note('vendored team-core imports resolve on host Node: config / types / session-client / team-state-store / team-tasklist / team-registry')
} catch (e) {
  fail(`vendored team-core failed to load on host Node (the T8b wall ruling regressed?): ${String(e.message ?? e).slice(0, 300)}`)
}
if (typeof vendored.resume?.resumeAllTeams !== 'function') fail('vendored resumeAllTeams is not a function')
if (typeof vendored.config?.TeamModeConfigSchema?.parse !== 'function') fail('vendored TeamModeConfigSchema.parse is not a function')
if (typeof vendored.types?.RuntimeStateSchema?.parse !== 'function') fail('vendored RuntimeStateSchema.parse is not a function')

// ── 2. manifest integrity, in-process ───────────────────────────────────────
try {
  const manifest = await imp(join(REPO, 'patches', 'omo-dsh', 'omo-team', 'src', 'manifest.ts'))
  const rows = manifest.TEAM_MANIFEST
  if (!Array.isArray(rows) || rows.length !== manifest.EXPECTED_TEAM_MANIFEST_COUNT) {
    fail(`TEAM_MANIFEST length ${Array.isArray(rows) ? rows.length : 'not-array'} != EXPECTED_TEAM_MANIFEST_COUNT ${manifest.EXPECTED_TEAM_MANIFEST_COUNT}`)
  }
  const ids = new Set(rows.map((row) => row.id))
  if (ids.size !== rows.length) fail(`TEAM_MANIFEST has duplicate ids (${ids.size} unique of ${rows.length})`)
  // validateManifest(entries) is THROWS-on-invalid (void-on-valid) — the
  // call itself is the assertion; a throw is the FAIL, no return to inspect.
  manifest.validateManifest(rows)
  for (const row of rows) {
    if (row.status === 'ported' && typeof row.e2eScenario !== 'string') {
      fail(`ported row '${row.id}' carries no e2eScenario — ported without an e2e face`)
    }
  }
  note(`manifest integrity: ${rows.length} rows, unique ids, validateManifest(rows) green, every ported row names its e2e scenario`)
} catch (e) {
  fail(`omo-team manifest could not be loaded/integrity-checked: ${String(e.message ?? e).slice(0, 200)}`)
}

// ── 3. state machine resume shape on a tmpdir teams face ────────────────────
const teams = mkdtempSync(join(tmpdir(), 'omo-team-proof-'))
try {
  const teamConfig = await imp(join(REPO, 'patches', 'omo-dsh', 'omo-team', 'src', 'team', 'team-config.ts'))
  const config = teamConfig.buildTeamModeConfig({ OMO_TEAM_BASE_DIR: teams })
  if (config.base_dir !== teams) fail(`buildTeamModeConfig ignored the OMO_TEAM_BASE_DIR override: ${config.base_dir}`)
  const ctxStub = {}
  const report = await vendored.resume.resumeAllTeams(ctxStub, config)
  const shape = ['resumed', 'marked_failed', 'marked_orphaned', 'cleaned']
  for (const key of shape) {
    if (typeof report?.[key] !== 'number') fail(`resume report field '${key}' is not a number: ${JSON.stringify(report?.[key])}`)
  }
  if (!Array.isArray(report?.errors)) fail(`resume report 'errors' is not an array: ${JSON.stringify(report?.errors)}`)
  if (report.resumed !== 0 || report.marked_failed !== 0 || report.marked_orphaned !== 0 || report.cleaned !== 0 || report.errors.length !== 0) {
    fail(`resume over an EMPTY teams face must be the all-zero report, got ${JSON.stringify(report)}`)
  }
  note(`resume shape: empty teams face settles as the terminal zero-report {resumed:0, marked_failed:0, marked_orphaned:0, cleaned:0, errors:[]} through the vendored resumeAllTeams`)
} catch (e) {
  fail(`resume-shape proof threw: ${String(e.message ?? e).slice(0, 300)}`)
} finally {
  rmSync(teams, { recursive: true, force: true })
}

// ── 4. the gate-4 row Config loads and defaults on host Node ───────────────
try {
  const rowConfig = await imp(join(REPO, 'patches', 'omo-dsh', 'omo-team', 'src', 'team', 'team-row-config.ts'))
  const spec = await imp(join(REPO, 'patches', 'omo-dsh', 'omo-team', 'src', 'team', 'team-spec.ts'))
  const def = new rowConfig.Config()
  if (def.maxMembers !== spec.MAX_TEAM_MEMBERS) fail(`row Config default maxMembers ${def.maxMembers} != vendored MAX_TEAM_MEMBERS ${spec.MAX_TEAM_MEMBERS}`)
  if (new rowConfig.Config({ maxMembers: 3 }).maxMembers !== 3) fail('row Config tightened knob broken')
  let threw = false
  try { new rowConfig.Config({ maxMembers: 9 }) } catch { threw = true }
  if (!threw) fail('row Config accepted maxMembers past the vendored hard cap')
  note(`row Config (gate 4): default ${def.maxMembers} = vendored cap, tightening knob live, past-cap refused`)
} catch (e) {
  fail(`row Config proof threw: ${String(e.message ?? e).slice(0, 200)}`)
}

if (problems.length > 0) {
  for (const p of problems) console.error(`P5T14-TEAM-PROOF FAIL ${p}`)
  console.log(`P5T14-TEAM-PROOF: FAIL (${problems.length})`)
  process.exit(1)
}
console.log('P5T14-TEAM-PROOF: PASS — vendored team-core loads on host Node (T8b wall), manifest integrity, resume zero-shape, row Config defaults')
