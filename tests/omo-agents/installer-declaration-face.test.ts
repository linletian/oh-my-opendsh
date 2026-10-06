// tests/omo-agents/installer-declaration-face.test.ts — the install contract of
// scripts/install-concerto.sh, the one-liner every user runs.
//
// WHY THIS FILE EXISTS. The installer used to have exactly one face: download
// `agent.cordis.yml` + `preset.yml` into $DSH_HOME/.agent-presets/concerto/ and
// hope dsh found them. dsh >= 0.2 deleted that directory scan — the Loader
// composes only what a profile DECLARES, i.e. the rows of
// $DSH_HOME/profiles/<profile>/cordis.patch.yml — so on 0.2 the old installer
// wrote two files that NOTHING reads: no error, no preset, an installer that
// lied. It now branches on `dsh --version` (>= 0.2 ⇒ declaration, 0.1.x ⇒
// filediscovery, undetectable ⇒ refuse with exit 1), and every one of those
// three branches is a place a silent regression can hide:
//
//   • the re-indent in render_patch_block. `plugins:` is emitted at column 8,
//     so the composition rides in at column 8 too. Re-indent it by 4 and YAML
//     resolves `plugins: null` — an EMPTY preset, installed silently, with the
//     whole harness missing and nothing printed. T2 pins the rendered content,
//     not just the exit code, because an exit code cannot see that failure.
//   • the text-level delete in write_patch_row. Upstream appends top-level
//     inserts with NO dedup, so a second install used to leave TWO
//     preset-concerto rows; and the `- id:` target form warns-and-skips on a
//     first install, i.e. installs nothing at all. T3/T5 pin idempotency and
//     BOTH pre-existing shapes.
//   • user-row loss. A yaml.load→dump rewrite of the patch file shreds the
//     user's comments and indentation. T4 pins the untouched prefix byte-for-byte.
//   • the version gate itself. T7 pins that the 0.1.x face did not regress while
//     0.2 support was added, and T8 pins that "I could not tell" is a refusal
//     rather than a silent wrong-face install.
//
// WHY IT RUNS HERMETICALLY. The installer really curls raw.githubusercontent.com,
// so every test here runs a COPY of it whose two `${BASE}` fetches have been
// rewritten to `cp` from this checkout, against a mkdtemp DSH_HOME, with a fake
// `dsh` shim on PATH answering `--version`, and a `curl` shim that fails loudly
// if anything still tries the network. NO_PIAI=1 keeps it out of settings.yaml.
// Nothing here touches ~/.dsh, and nothing here needs the network.
//
// WHY THE YAML PARSER IS python3 AND NOT `import … from 'yaml'`. This repo has
// no `yaml` (nor `js-yaml`) on its dependency graph — node_modules holds only
// @types, typescript and vitest, and `node -e "import('yaml')"` answers
// ERR_MODULE_NOT_FOUND — so the patch document is parsed with PyYAML through
// node:child_process, exactly the parser the installer itself renders with. The
// `tag:yaml.org,2002:js` constructor is registered BEFORE the parse on both
// sides: the composition carries `disabled: !!js process.platform === 'win32'`,
// and without that constructor the parse dies with "could not determine a
// constructor for the tag 'tag:yaml.org,2002:js'". The fixtures prove that
// failure is real instead of taking the comment's word for it.
//
// WHY EVERY CASE CARRIES `it(name, { timeout: 60_000 }, fn)`. These are not
// in-memory assertions: each one forks REAL child processes — `sh` running the
// installer, which itself forks two `cp` and TWO `python3` (render_patch_block,
// then write_patch_row) — and then forks `python3` again for the PyYAML parses
// the assertions read. vitest's default testTimeout is 5000ms, and on a loaded
// machine that budget is a coin flip, not a margin: this file was seen to fail
// on T2/T3 under load and pass green on an idle re-run. A gate that flickers is
// WORSE than no gate — false confidence most of the time, a random red light at
// exactly the moment someone is trying to land a fix — so every case pins its own
// 60s budget instead of inheriting the default.
//
// THE FORM, and why this one: vitest v4 accepts `it(name, options, fn)` and
// @vitest/runner resolves `options.timeout ?? runner.config.testTimeout`, so the
// per-case option wins over the config default WITHOUT touching vitest.config.ts
// (one file changed, not two). Verified by measurement, not by belief: a case
// that sleeps 6.5s passes under the untouched 5s default once it carries
// `{ timeout: 60_000 }`. Nothing else here is altered — no assertion rewritten,
// no case renamed, no case removed; the only edits in this file are the timeouts
// and this note.
import { spawnSync } from 'node:child_process'
import { accessSync, chmodSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

/** Repo root, anchored to THIS file — never to process.cwd(). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const INSTALLER = join(REPO_ROOT, 'scripts', 'install-concerto.sh')
const PRESET_DIR = join(REPO_ROOT, 'patches', 'omo-dsh', 'omo-agents-current', 'preset')
const AGENT_SRC = join(PRESET_DIR, 'agent.cordis.yml')
const PRESET_YML_SRC = join(PRESET_DIR, 'preset.yml')

const TARGET = 'preset-concerto'
const PRESET_ROW_NAME = '@deepseek-ai/dsh-agent-preset'
// The route the authored preset carries. T6 asserts the override CHANGED it,
// which needs the authored value from outside the bytes under assertion.
// CANARY — 改动仓内 preset 路由（patches/omo-dsh/omo-agents-current/preset/
// agent.cordis.yml 里 agentOptions 的 provider/model）时必须连带改这两个常量，
// 否则「没有 override 时原样装机」这类断言会跟着源文件一起漂移而测不出漂移。
// T12b cutover executed this canary: the authored model is now deepseek-flash
// (the 0.2.x pi-ai catalog id; deepseek-v4-flash was the 0.1.x-era value).
const AUTHORED_PROVIDER = 'deepseek'
const AUTHORED_MODEL = 'deepseek-flash'

/** Printed by the PATH-local curl shim; any occurrence means a test went online. */
const NETWORK_ATTEMPTED = 'OFFLINE-Harness-blocked-a-real-curl'

type Json = Record<string, unknown>

// ---------------------------------------------------------------------------
// The offline copy of the installer.
//
// Two lines fetch from ${BASE}; both become `cp` out of this checkout. The
// replacement is done with String.replace on the readFileSync text (NOT with
// shell sed, so the transform is visible, reviewable and asserted below), and
// the fixture test proves it was non-vacuous: 2 hits, and no executable
// `${BASE}` request left anywhere in the script.
// ---------------------------------------------------------------------------
const FETCH_RE = /curl -fsSL "\$\{BASE\}\/patches\/omo-dsh\/omo-agents-current\/preset\/(agent\.cordis\.yml|preset\.yml)" -o "\$1\/\1"/g
const installerSource = readFileSync(INSTALLER, 'utf8')
let fetchReplacements = 0
const offlineInstaller = installerSource.replace(FETCH_RE, (_match, name: string) => {
  fetchReplacements += 1
  return `  cp ${JSON.stringify(join(PRESET_DIR, name))} "$1/${name}"`
})

/** A `dsh` that answers --version with the version a test claims is installed. */
const DSH_SHIM = (version: string): string =>
  `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${version}"; exit 0; fi\nexit 0\n`

/** A curl that never fetches: if the installer still asks, the run fails loudly. */
const CURL_GUARD_SHIM = `#!/bin/sh\necho "${NETWORK_ATTEMPTED} $*" >&2\nexit 22\n`

// ---------------------------------------------------------------------------
// YAML, via python3 + PyYAML (see the header for why not `import 'yaml'`).
// ---------------------------------------------------------------------------
const PY_PARSE = [
  'import json, sys, yaml',
  'class _JsLoader(yaml.SafeLoader):',
  '    pass',
  'def _js(loader, node):',
  '    if isinstance(node, yaml.ScalarNode):',
  '        return {"__jsExpr": node.value}',
  '    if isinstance(node, yaml.SequenceNode):',
  '        return {"__jsExpr": loader.construct_sequence(node)}',
  '    return {"__jsExpr": loader.construct_mapping(node)}',
  '_JsLoader.add_constructor("tag:yaml.org,2002:js", _js)',
  'sys.stdout.write(json.dumps(yaml.load(sys.stdin.read(), Loader=_JsLoader)))',
  '',
].join('\n')

/** Same shape as PY_PARSE minus the constructor — used to prove the tag needs it. */
const PY_PARSE_PLAIN = [
  'import json, sys, yaml',
  'sys.stdout.write(json.dumps(yaml.load(sys.stdin.read(), Loader=yaml.SafeLoader)))',
  '',
].join('\n')

function runPython(code: string, input: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('python3', ['-c', code], { input, encoding: 'utf8', timeout: 60_000 })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** Parse a Cordis YAML document into plain JSON, tolerating `!!js <expr>`. */
function parseCordis(text: string, label: string): unknown {
  const r = runPython(PY_PARSE, text)
  if (r.status !== 0) {
    throw new Error(`cannot parse ${label} with PyYAML (rc=${r.status}):\n${r.stderr}`)
  }
  return JSON.parse(r.stdout) as unknown
}

function parseFile(path: string): unknown {
  return parseCordis(readFileSync(path, 'utf8'), path)
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------
type Sandbox = {
  root: string
  home: string
  bin: string
  script: string
  /** The version the sandbox `dsh` shim answers, or null when NO shim was made. */
  dshVersion: string | null
}

const sandboxes: Sandbox[] = []

function makeSandbox(opts: { dshVersion?: string | null } = {}): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'installer-declaration-face-'))
  const home = join(root, 'home')
  const bin = join(root, 'bin')
  mkdirSync(home, { recursive: true })
  mkdirSync(bin, { recursive: true })
  if (opts.dshVersion) {
    const shim = join(bin, 'dsh')
    writeFileSync(shim, DSH_SHIM(opts.dshVersion), { mode: 0o755 })
    chmodSync(shim, 0o755)
  }
  const curl = join(bin, 'curl')
  writeFileSync(curl, CURL_GUARD_SHIM, { mode: 0o755 })
  chmodSync(curl, 0o755)
  const script = join(root, 'install-offline.sh')
  writeFileSync(script, offlineInstaller, { mode: 0o755 })
  chmodSync(script, 0o755)
  const sbx: Sandbox = { root, home, bin, script, dshVersion: opts.dshVersion ?? null }
  sandboxes.push(sbx)
  return sbx
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const sbx = sandboxes.pop() as Sandbox
    rmSync(sbx.root, { recursive: true, force: true })
  }
})

/**
 * Every tool the installer still needs from the real PATH, after the dirs that
 * hold a `dsh` are removed. Built once, asserted by a fixture test so T8 cannot
 * pass merely because curl was missing too.
 */
const REAL_PATH = (process.env.PATH ?? '').split(':').filter((d) => d !== '')
function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}
const PATH_WITHOUT_DSH = REAL_PATH.filter((dir) => !isExecutable(join(dir, 'dsh'))).join(':')

/**
 * THE ANTI-RECURRENCE GUARD — read this before touching any env below.
 *
 * WHY THIS EXISTS. GitHub Actions run 37325570400 (gate 2, unit tests) went red
 * on a case that was green on every laptop that ever ran it. T24 case ② built
 * its env BY HAND and prepended the sandbox `bin/` to nothing: `PATH` stayed
 * the ambient one, so the installer ran `command -v dsh` against the REAL dsh
 * on the machine. That answers 0.2.0-rc.2 locally ⇒ declaration face ⇒ it
 * reaches the PyYAML guard ⇒ green. CI installs 0.1.5-rc.1 per D7 ⇒ the
 * filediscovery face ⇒ the guard is never reached ⇒ exit 0 ⇒
 * `expected +0 not to be +0`, hundreds of lines and one silent face-branch away
 * from the thing that actually broke. The test was not testing the script, it
 * was testing whichever dsh the environment happened to gift it.
 *
 * So "which dsh does the installer actually see" stops being an environment
 * gift and becomes an ASSERTED FACT, asked with the exact env the test is about
 * to hand the installer:
 *   1. `command -v dsh` resolves to the sandbox shim, not to the host's dsh;
 *   2. `dsh --version` answers the version THIS test claims is installed;
 *   3. `command -v curl` resolves to the offline guard shim (the network fence).
 * Miss a `PATH:` prefix in the future and this fails FIRST, by name, instead of
 * letting a wrong-face install walk off unnoticed.
 *
 * `expectedVersion === null` is the other side of the same coin: the sandbox
 * made NO shim, so dsh must be UNREACHABLE on that PATH (T8).
 */
function assertShimWins(label: string, env: NodeJS.ProcessEnv, bin: string, expectedVersion: string | null): void {
  const found = spawnSync('sh', ['-c', 'command -v dsh'], { env, encoding: 'utf8', timeout: 30_000 })
  const resolved = (found.stdout ?? '').trim()
  if (expectedVersion === null) {
    expect(resolved, `${label}: dsh must be UNREACHABLE on this PATH, but it resolved to '${resolved}' — the sandbox made no shim, so any hit here is the ambient dsh leaking in`).toBe('')
    expect(found.status, `${label}: dsh resolved to '${resolved}' although this sandbox declares NO dsh shim`).not.toBe(0)
    return
  }
  expect(resolved, `${label}: the SANDBOX SHIM WAS NOT USED — the installer would run '${resolved}', not the sandbox shim at ${join(bin, 'dsh')}. PATH is missing its '${bin}:' prefix (or the ambient dsh was put in front of it), so the version gate would pick a DIFFERENT install face than this test claims. 沙箱 shim 没被用上。`).toBe(join(bin, 'dsh'))
  const ver = spawnSync('sh', ['-c', 'dsh --version'], { env, encoding: 'utf8', timeout: 30_000 })
  expect((ver.stdout ?? '').split('\n')[0].trim(), `${label}: the dsh on this PATH answers a different version than the sandbox shim '${join(bin, 'dsh')}' declares — the ambient dsh is being used. 沙箱 shim 没被用上。`).toBe(expectedVersion)
  const curl = spawnSync('sh', ['-c', 'command -v curl'], { env, encoding: 'utf8', timeout: 30_000 })
  expect((curl.stdout ?? '').trim(), `${label}: the offline curl guard shim at ${join(bin, 'curl')} is NOT the curl the installer would run — a real curl could reach the network from a hermetic test`).toBe(join(bin, 'curl'))
}

function runInstaller(sbx: Sandbox, opts: { withDsh: boolean; extraEnv?: Record<string, string> }): {
  status: number | null
  stdout: string
  stderr: string
} {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_HOME: sbx.home,
    NO_PIAI: '1',
    PATH: opts.withDsh ? `${sbx.bin}:${process.env.PATH}` : `${sbx.bin}:${PATH_WITHOUT_DSH}`,
    // HERMETIC, not ambient. `...process.env` above carries whatever the host
    // happens to export, and the installer READS all three of these:
    // EXPLORE_PROVIDER / EXPLORE_MODEL rewrite agentOptions (so T6's
    // "no override ⇒ authored route" case would be testing the host, not the
    // script), and CONCERTO_TAG picks the ${BASE} ref whose printed tag several
    // cases quote. Cleared HERE, before extraEnv, so a case that WANTS an
    // override still sets it explicitly and visibly.
    EXPLORE_PROVIDER: '',
    EXPLORE_MODEL: '',
    CONCERTO_TAG: '',
    ...opts.extraEnv,
  }
  // The guard runs on the FINAL env — the same one the installer is about to
  // get — so a future extraEnv that rewrites PATH cannot slip past it.
  assertShimWins('runInstaller', env, sbx.bin, opts.withDsh ? sbx.dshVersion : null)
  // HOME is ambient too, and the installer falls back to `${HOME}/.dsh` when
  // DSH_HOME is unset. It is never unset here, so nothing can ever be written
  // to a real ~/.dsh — pinned rather than assumed.
  expect(env.DSH_HOME, 'every installer run here must be sandboxed by DSH_HOME').toBe(sbx.home)
  if (process.env.HOME) {
    expect(env.DSH_HOME, 'DSH_HOME must not be the developer real ~/.dsh').not.toBe(join(process.env.HOME, '.dsh'))
  }
  expect(env.NO_PIAI, 'NO_PIAI must stay set or the installer writes settings.yaml').toBe('1')
  const r = spawnSync('sh', [sbx.script], {
    encoding: 'utf8',
    timeout: 120_000,
    env,
  })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function runWithDsh(sbx: Sandbox, extraEnv: Record<string, string> = {}) {
  return runInstaller(sbx, { withDsh: true, extraEnv })
}

function patchPath(sbx: Sandbox): string {
  return join(sbx.home, 'profiles', 'web', 'cordis.patch.yml')
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function backupFiles(sbx: Sandbox): string[] {
  const dir = dirname(patchPath(sbx))
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => /^cordis\.patch\.yml\.bak(\.[^/]*)?$/.test(n))
    .sort()
}

/** A top-level row that IS the target, or an `insert:` block that carries it. */
function refsTarget(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) return false
  const row = entry as Json
  if (row.id === TARGET) return true
  const insert = row.insert
  return Array.isArray(insert) && insert.some((x) => typeof x === 'object' && x !== null && (x as Json).id === TARGET)
}

/** The target row itself — either the plain row or the row nested in insert:. */
function targetRow(doc: unknown): Json | null {
  if (!Array.isArray(doc)) return null
  for (const entry of doc) {
    if (typeof entry !== 'object' || entry === null) continue
    const row = entry as Json
    if (row.id === TARGET) return row
    const insert = row.insert
    if (Array.isArray(insert)) {
      for (const x of insert) {
        if (typeof x === 'object' && x !== null && (x as Json).id === TARGET) return x as Json
      }
    }
  }
  return null
}

type Located = { path: string[]; value: Json }

/**
 * Depth-first walk collecting every `agentOptions` mapping, with the chain of
 * row ids that leads to it. The explore route is NOT top level: it sits under
 * the `delegation` group's config list, so a flat scan finds nothing here. Each
 * mapping on the way is labelled with its own `id`, so the reported path names
 * the group it was found in instead of just `plugins/[11]/config/[2]`.
 */
function collectAgentOptions(node: unknown, path: string[] = [], out: Located[] = []): Located[] {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectAgentOptions(item, [...path, `[${i}]`], out))
    return out
  }
  if (typeof node !== 'object' || node === null) return out
  const obj = node as Json
  const last = path[path.length - 1] ?? ''
  const here = typeof obj.id === 'string'
    ? [...path.slice(0, -1), `${last}#${obj.id}`]
    : path
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'agentOptions' && typeof value === 'object' && value !== null) {
      out.push({ path: [...here, key], value: value as Json })
    }
    collectAgentOptions(value, [...here, key], out)
  }
  return out
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const asJson = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {})
/** The declared preset row's plugin list — `row.config.plugins`, two levels down. */
const pluginsOf = (row: Json | null): unknown[] => asArray(asJson(asJson(row).config).plugins)

// ---------------------------------------------------------------------------
// Fixtures: prove the harness itself can fail.
// ---------------------------------------------------------------------------
describe('installer test harness fixtures (non-vacuity)', () => {
  it('rewrote BOTH ${BASE} fetches to cp and left no network request behind', { timeout: 60_000 }, () => {
    expect(fetchReplacements).toBe(2)
    // No executable fetch of ${BASE} survives — only the doc comment on line 8,
    // which quotes a literal URL and is never run.
    const liveFetchLines = offlineInstaller.split('\n').filter((ln) => /curl -fsSL "\$\{BASE\}/.test(ln))
    expect(liveFetchLines).toEqual([])
    expect(offlineInstaller).toContain(`cp ${JSON.stringify(AGENT_SRC)} "$1/agent.cordis.yml"`)
    expect(offlineInstaller).toContain(`cp ${JSON.stringify(PRESET_YML_SRC)} "$1/preset.yml"`)
    // The copy is the real script apart from those two lines.
    expect(offlineInstaller.split('\n').length).toBe(installerSource.split('\n').length)
  })

  it('the !!js tag really does need its own constructor — SafeLoader alone dies', { timeout: 60_000 }, () => {
    // Without this the whole T2 comparison would be vacuous: the installer's
    // render step would die on the authored composition before any of it.
    const plain = runPython(PY_PARSE_PLAIN, readFileSync(AGENT_SRC, 'utf8'))
    expect(plain.status).not.toBe(0)
    expect(plain.stderr).toContain('could not determine a constructor')
    expect(plain.stderr).toContain('tag:yaml.org,2002:js')
    // With it, the same bytes parse and the two gates survive as opaque markers.
    const doc = parseFile(AGENT_SRC)
    const disabled = asArray(doc)
      .map((e) => asJson(e).disabled)
      .filter((d) => d !== undefined)
    expect(disabled.length).toBe(2)
    expect(disabled).toEqual([
      { __jsExpr: "process.platform === 'win32'" },
      { __jsExpr: "process.platform !== 'win32'" },
    ])
  })

  it('the dsh-free PATH used by T8 still carries every tool the installer needs', { timeout: 60_000 }, () => {
    expect(PATH_WITHOUT_DSH.split(':').length).toBeGreaterThan(1)
    const probe = (tool: string): number | null =>
      spawnSync('sh', ['-c', 'command -v "$1" >/dev/null 2>&1 && exit 0 || exit 1', 'sh', tool], {
        env: { PATH: PATH_WITHOUT_DSH },
      }).status
    // curl is needed by `need curl` BEFORE the version gate — if it were gone,
    // T8 would pass for the wrong reason. head/rm/cp are the T24 guardbin
    // symlinks (GUARD_TOOLS): findRealTool throws if they are gone, so they
    // are pinned here too rather than only by an exception at use time.
    for (const tool of ['curl', 'sh', 'sed', 'grep', 'mktemp', 'python3', 'head', 'rm', 'cp']) {
      expect(probe(tool), `PATH_WITHOUT_DSH lost ${tool}`).toBe(0)
    }
    expect(probe('dsh'), 'dsh must be unreachable on that PATH').not.toBe(0)
  })

  it('the PATH guard really tells the sandbox shim apart from the host dsh — it has teeth', { timeout: 60_000 }, () => {
    // POSITIVE: exactly the PATH runInstaller builds, and it stays green.
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    expect(() => assertShimWins('guard-positive', { ...process.env, PATH: `${sbx.bin}:${process.env.PATH}` }, sbx.bin, '0.2.0-rc.2')).not.toThrow()

    // The host's own dsh — when there is one — is a DIFFERENT FILE, which is
    // what makes the resolution above a fact and not a tautology.
    const host = spawnSync('sh', ['-c', 'command -v dsh'], { env: { ...process.env, PATH: process.env.PATH ?? '' }, encoding: 'utf8', timeout: 30_000 })
    if (host.status === 0) {
      expect(host.stdout.trim(), 'the host dsh resolves to the SAME path as the sandbox shim — assertShimWins can no longer tell them apart').not.toBe(join(sbx.bin, 'dsh'))
    }

    // NEGATIVE ①: the exact shape of the CI bug — the `${sbx.bin}:` prefix
    // dropped, PATH left ambient. 断言一 must go red, naming the shim.
    expect(() => assertShimWins('guard-negative-no-prefix', { ...process.env, PATH: process.env.PATH ?? '' }, sbx.bin, '0.2.0-rc.2'), 'the guard stayed green while the sandbox shim was off PATH').toThrow()

    // NEGATIVE ②: the shim IS on PATH but is a 0.1.x one while the case claims
    // 0.2.0-rc.2 — what CI run 37325570400 actually looked like from the inside.
    // 断言二 must go red even though 断言一 passes.
    const ci = makeSandbox({ dshVersion: '0.1.5-rc.1' })
    expect(() => assertShimWins('guard-negative-wrong-version', { ...process.env, PATH: `${ci.bin}:${process.env.PATH}` }, ci.bin, '0.2.0-rc.2'), 'the guard stayed green while a 0.1.x shim answered on PATH').toThrow()
  })
})

// ---------------------------------------------------------------------------
// T1 — first install into an empty DSH_HOME, declaration face.
// ---------------------------------------------------------------------------
describe('T1 first install into an empty DSH_HOME (declaration face)', () => {
  it('creates profiles/web/cordis.patch.yml with exactly one preset-concerto row', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const r = runWithDsh(sbx)
    expect(r.stderr).not.toContain(NETWORK_ATTEMPTED)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    expect(r.stdout).toContain('install face: declaration')

    const patch = patchPath(sbx)
    expect(existsSync(patch)).toBe(true)
    const text = readFileSync(patch, 'utf8')
    expect(countOccurrences(text, TARGET)).toBe(1)

    // 0.2 never reads .agent-presets/ — writing it would be a lying install.
    expect(existsSync(join(sbx.home, '.agent-presets'))).toBe(false)
    // dsh writes package.json on first boot; the installer must not pre-empt it.
    expect(existsSync(join(sbx.home, 'profiles', 'web', 'package.json'))).toBe(false)
    // NO_PIAI=1 — settings.yaml stays unwritten.
    expect(existsSync(join(sbx.home, 'settings.yaml'))).toBe(false)
    // Nothing else appeared in the home.
    expect(readdirSync(sbx.home).sort()).toEqual(['profiles'])
  })
})

// ---------------------------------------------------------------------------
// T2 — the rendered semantics, not just the exit code.
// ---------------------------------------------------------------------------
describe('T2 rendered patch semantics', () => {
  it('declares the concerto preset with the authored plugins, byte-equivalent', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    expect(runWithDsh(sbx).status).toBe(0)

    const doc = parseFile(patchPath(sbx))
    expect(Array.isArray(doc)).toBe(true)
    const block = asArray(doc)
    expect(block).toHaveLength(1)
    const insert = asArray(asJson(block[0]).insert)
    expect(insert).toHaveLength(1)

    const row = asJson(insert[0])
    expect(row.id).toBe(TARGET)
    expect(row.name).toBe(PRESET_ROW_NAME)

    const cfg = asJson(row.config)
    expect(cfg.id).toBe('concerto')
    // `order:` is not part of the patch dialect here; emitting it would reorder
    // the host composition the user did not ask to reorder.
    expect(Object.keys(cfg)).not.toContain('order')

    const preset = asJson(parseFile(PRESET_YML_SRC))
    expect(cfg.name).toBe(preset.name)
    expect(cfg.description).toBe(preset.description)

    const want = asArray(parseFile(AGENT_SRC))
    // Non-vacuity: a composition of a handful of rows is not the real thing.
    expect(want.length).toBeGreaterThan(10)
    const got = asArray(cfg.plugins)
    expect(got).toHaveLength(want.length)
    for (let i = 0; i < want.length; i += 1) {
      // Element-wise, so a dropped or reordered row names itself in the diff.
      expect(got[i], `config.plugins[${i}]`).toEqual(want[i])
    }
    // The 8-column re-indent must not have collapsed `plugins:` to null — the
    // silent-empty-preset failure mode.
    expect(got.length).toBeGreaterThan(0)
    expect(asJson(got[0]).id).toBe(asJson(want[0]).id)
  })
})

// ---------------------------------------------------------------------------
// T3 — idempotency.
// ---------------------------------------------------------------------------
describe('T3 a second install is idempotent', () => {
  it('two runs leave cordis.patch.yml byte-identical with one target row', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const first = runWithDsh(sbx)
    expect(first.status, first.stderr).toBe(0)
    const text1 = readFileSync(patchPath(sbx), 'utf8')

    const second = runWithDsh(sbx)
    expect(second.status, second.stderr).toBe(0)
    const text2 = readFileSync(patchPath(sbx), 'utf8')

    expect(text2).toBe(text1)
    expect(countOccurrences(text2, TARGET)).toBe(1)
    // Upstream appends inserts with NO dedup: a second plain append is the bug.
    const doc = parseFile(patchPath(sbx))
    expect(asArray(doc).filter(refsTarget)).toHaveLength(1)
    expect(asArray(doc)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// T4 — the user's own rows survive byte-for-byte.
// ---------------------------------------------------------------------------
describe('T4 user rows are untouched', () => {
  it('keeps a pre-existing patch file byte-for-byte in front of the new row', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const userText = [
      '# my own cordis patch — do not reformat me',
      '# a second comment line',
      '',
      '- id: my-own-row',
      "  name: '@acme/my-own-row'",
      '  config:',
      '    hello: world   # trailing comment, kept verbatim',
      '',
      '# a comment attached to the row below',
      '- id: another-row',
      "  name: '@acme/another-row'",
      '',
    ].join('\n')
    mkdirSync(dirname(patchPath(sbx)), { recursive: true })
    writeFileSync(patchPath(sbx), userText, 'utf8')

    const r = runWithDsh(sbx)
    expect(r.status, r.stderr).toBe(0)

    const after = readFileSync(patchPath(sbx))
    const prefixBytes = Buffer.byteLength(userText, 'utf8')
    // head -c <original length>: byte-for-byte, comments, spacing and all.
    expect(after.subarray(0, prefixBytes).toString('utf8')).toBe(userText)

    const doc = parseFile(patchPath(sbx))
    expect(asArray(doc)).toHaveLength(3)
    const userRows = asArray(doc).filter((e) => !refsTarget(e))
    expect(userRows).toHaveLength(2)
    expect(asJson(userRows[0]).id).toBe('my-own-row')
    expect(asJson(userRows[1]).id).toBe('another-row')
    expect(countOccurrences(after.toString('utf8'), TARGET)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// T5 — the text-level delete recognises BOTH pre-existing shapes.
// ---------------------------------------------------------------------------
describe('T5 the delete recognises both pre-existing forms', () => {
  it('form ①: a top-level `- id: preset-concerto` row is replaced, not duplicated', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const fake = [
      '- id: preset-concerto',
      `  name: '${PRESET_ROW_NAME}'`,
      '  config:',
      '    id: concerto',
      '    plugins: []',
      '',
    ].join('\n')
    mkdirSync(dirname(patchPath(sbx)), { recursive: true })
    writeFileSync(patchPath(sbx), fake, 'utf8')

    const r = runWithDsh(sbx)
    expect(r.status, r.stderr).toBe(0)

    const text = readFileSync(patchPath(sbx), 'utf8')
    // The fabricated row is gone whole — its marker content must not survive.
    expect(text).not.toContain('plugins: []')
    expect(countOccurrences(text, TARGET)).toBe(1)

    const doc = parseFile(patchPath(sbx))
    expect(asArray(doc)).toHaveLength(1)
    // And what replaced it is the real declared row, not the empty fake.
    const row = targetRow(doc)
    expect(row).not.toBeNull()
    // plugins hangs off the ROW's config, not off the row itself.
    const cfg = asJson(asJson(row).config)
    expect(cfg.id).toBe('concerto')
    expect(asArray(cfg.plugins)).toHaveLength(asArray(parseFile(AGENT_SRC)).length)
  })

  it('form ②: inside a shared `- insert:` block, only the target row is cut', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const shared = [
      '- insert:',
      `    - id: ${TARGET}`,
      `      name: '${PRESET_ROW_NAME}'`,
      '      config:',
      '        id: concerto',
      '        plugins: []',
      '    - id: keep-me',
      "      name: '@acme/keep-me'",
      '',
    ].join('\n')
    mkdirSync(dirname(patchPath(sbx)), { recursive: true })
    writeFileSync(patchPath(sbx), shared, 'utf8')

    const r = runWithDsh(sbx)
    expect(r.status, r.stderr).toBe(0)

    const text = readFileSync(patchPath(sbx), 'utf8')
    expect(countOccurrences(text, TARGET)).toBe(1)
    expect(text).not.toContain('plugins: []')
    // The sibling and its parent block both survive.
    expect(countOccurrences(text, '- id: keep-me')).toBe(1)
    expect(countOccurrences(text, '- insert:')).toBe(2)

    const doc = parseFile(patchPath(sbx))
    expect(asArray(doc)).toHaveLength(2)
    const survivor = asJson(asArray(doc)[0])
    const kept = asArray(survivor.insert)
    expect(kept).toHaveLength(1)
    expect(asJson(kept[0]).id).toBe('keep-me')
    expect(refsTarget(survivor)).toBe(false)
    // The freshly installed row is the second, declared block.
    expect(refsTarget(asArray(doc)[1])).toBe(true)
    expect(asArray(asJson(asJson(targetRow(doc)).config).plugins))
      .toHaveLength(asArray(parseFile(AGENT_SRC)).length)
  })
})

// ---------------------------------------------------------------------------
// T6 — route overrides reach the NESTED agentOptions.
// ---------------------------------------------------------------------------
describe('T6 EXPLORE_PROVIDER / EXPLORE_MODEL overrides', () => {
  it('rewrites the agentOptions nested inside the delegation group', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const r = runWithDsh(sbx, { EXPLORE_PROVIDER: 'my-prov', EXPLORE_MODEL: 'my-model' })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('explore route overridden')

    const doc = parseFile(patchPath(sbx))
    const row = targetRow(doc)
    expect(row).not.toBeNull()

    // agentOptions is NOT top level — it lives under the delegation group's
    // config list, so the walk has to descend through the group nesting.
    const found = collectAgentOptions(asJson(row).config)
    expect(found).toHaveLength(1)
    expect(found[0].path.join('/')).toContain('delegation')
    expect(found[0].value.provider).toBe('my-prov')
    expect(found[0].value.model).toBe('my-model')
    // The override actually overrode: the authored route is gone.
    expect(found[0].value.provider).not.toBe(AUTHORED_PROVIDER)
    expect(found[0].value.model).not.toBe(AUTHORED_MODEL)
    // And nothing else in the row drifted.
    expect(pluginsOf(row)).toHaveLength(asArray(parseFile(AGENT_SRC)).length)
  })

  it('leaves the authored route alone when no override is set', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const r = runWithDsh(sbx)
    expect(r.status, r.stderr).toBe(0)
    // HERMETIC: an EXPLORE_PROVIDER / EXPLORE_MODEL exported by the host or
    // CI would make this case assert the ENVIRONMENT instead of the script.
    // runInstaller blanks both, and this is the assertion that would notice if
    // it stopped doing so — the override must not have fired at all.
    expect(r.stdout, 'the override fired although this case passes none — the host exported EXPLORE_PROVIDER / EXPLORE_MODEL').not.toContain('explore route overridden')
    const found = collectAgentOptions(asJson(targetRow(parseFile(patchPath(sbx)))).config)
    expect(found).toHaveLength(1)
    expect(found[0].value).toEqual({ provider: AUTHORED_PROVIDER, model: AUTHORED_MODEL })
  })
})

// ---------------------------------------------------------------------------
// T7 — the 0.1.x face must not regress while 0.2 support was added.
// ---------------------------------------------------------------------------
describe('T7 dsh 0.1.x still installs by file discovery', () => {
  it('writes .agent-presets/concerto/ byte-identically and never touches profiles/', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.1.5-rc.1' })
    const r = runWithDsh(sbx)
    expect(r.stderr).not.toContain(NETWORK_ATTEMPTED)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('install face: filediscovery')
    // Same hermeticity pin as T6: no override is passed, so the host must not
    // be the one supplying one.
    expect(r.stdout, 'the host exported EXPLORE_PROVIDER / EXPLORE_MODEL into a case that passes none').not.toContain('explore route overridden')

    const dest = join(sbx.home, '.agent-presets', 'concerto')
    expect(existsSync(join(dest, 'agent.cordis.yml'))).toBe(true)
    expect(existsSync(join(dest, 'preset.yml'))).toBe(true)
    expect(readFileSync(join(dest, 'agent.cordis.yml')).equals(readFileSync(AGENT_SRC))).toBe(true)
    expect(readFileSync(join(dest, 'preset.yml')).equals(readFileSync(PRESET_YML_SRC))).toBe(true)

    // 0.1.x has no patch file to declare into — and must not grow one.
    expect(existsSync(join(sbx.home, 'profiles'))).toBe(false)
    expect(readdirSync(sbx.home).sort()).toEqual(['.agent-presets'])
  })
})

// ---------------------------------------------------------------------------
// T8 — an undetectable version is a refusal, not a guess.
// ---------------------------------------------------------------------------
describe('T8 refuses when the dsh version cannot be detected', () => {
  it('exits non-zero, names the problem on stderr, and creates nothing', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: null })
    const r = runInstaller(sbx, { withDsh: false })
    expect(r.status).not.toBe(0)
    expect(r.status).not.toBeNull()
    expect(r.stderr).toContain('cannot detect dsh version')
    expect(r.stderr).toContain('re-run this installer')
    expect(r.stdout).not.toContain('installing concerto preset')
    expect(r.stdout).not.toContain('declared preset-concerto')
    // Nothing at all was written under DSH_HOME — not even an empty directory.
    expect(readdirSync(sbx.home)).toEqual([])
    expect(existsSync(join(sbx.home, '.agent-presets'))).toBe(false)
    expect(existsSync(patchPath(sbx))).toBe(false)
    expect(existsSync(join(sbx.home, 'settings.yaml'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T9 — the backup.
// ---------------------------------------------------------------------------
describe('T9 the pre-rewrite backup', () => {
  it('a first install into an empty home has nothing to back up', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    expect(runWithDsh(sbx).status).toBe(0)
    expect(backupFiles(sbx)).toEqual([])
    expect(existsSync(patchPath(sbx))).toBe(true)
  })

  it('backs up the exact bytes that were there before the rewrite', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const original = [
      '# the user had this here first',
      '- id: user-row',
      "  name: '@acme/user-row'",
      '',
    ].join('\n')
    mkdirSync(dirname(patchPath(sbx)), { recursive: true })
    writeFileSync(patchPath(sbx), original, 'utf8')

    const r = runWithDsh(sbx)
    expect(r.status, r.stderr).toBe(0)

    const baks = backupFiles(sbx)
    expect(baks).toHaveLength(1)
    expect(readFileSync(join(dirname(patchPath(sbx)), baks[0]), 'utf8')).toBe(original)
    // The live file kept the original as a prefix and declared the preset once.
    const after = readFileSync(patchPath(sbx), 'utf8')
    expect(after.startsWith(original)).toBe(true)
    expect(countOccurrences(after, TARGET)).toBe(1)
    expect(readFileSync(patchPath(sbx)).equals(readFileSync(join(dirname(patchPath(sbx)), baks[0])))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T10 — syntax gate on the REAL script, not the offline copy.
// ---------------------------------------------------------------------------
describe('T10 syntax gate on the real installer', () => {
  it('bash -n parses scripts/install-concerto.sh', { timeout: 60_000 }, () => {
    const r = spawnSync('bash', ['-n', INSTALLER], { encoding: 'utf8', timeout: 30_000 })
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })

  it('sh -n parses scripts/install-concerto.sh', { timeout: 60_000 }, () => {
    const r = spawnSync('sh', ['-n', INSTALLER], { encoding: 'utf8', timeout: 30_000 })
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// T11 — the hostile preset.yml (pins the json.dumps quoting in
// render_patch_block).
//
// WHY THIS EXISTS. `name:` / `description:` used to be bare-concatenated into
// the rendered block. A PERFECTLY LEGAL preset.yml whose description contains
// an ASCII ': ' (colon+space) then renders
// `description: contains: an ASCII colon ...` — not valid YAML: PyYAML dies
// with ScannerError "mapping values are not allowed here", render_patch_block
// exits 1, and the installer hard-fails on a preset with nothing wrong with it.
// The shipped preset.yml dodges this only by using the fullwidth '：', so the
// bug hid in plain sight. The fix quotes both values with
// `json.dumps(..., ensure_ascii=False)`.
//
// THE TEETH (verified by mutation, not by belief): with the fix reverted to
// bare concatenation, the installer run below exits 1 with that ScannerError on
// stderr; with the fix in place it exits 0 and every hostile byte round-trips.
// The parse-level assertions alone would not be enough — the last two assert
// the QUOTING directly on the patch text, so a parse layer that grew its own
// tolerance could not mask a dropped pair of quotes.
// ---------------------------------------------------------------------------
describe('T11 hostile preset.yml survives the full installer (quoting teeth)', () => {
  // Every hostile character in ONE legal YAML single-quoted scalar: ASCII
  // ': ', '#', '{', embedded double quotes, CJK. No single quotes in either
  // constant — that is the only character the fixture's own quoting cannot
  // carry, and the guards below pin that assumption.
  const HOSTILE_NAME = '协奏模式: Concerto "hostile" {name} # tag'
  const HOSTILE_DESC =
    'hostile: description with an ASCII colon-space, then # a hash, then { a brace, '
    + 'then "nested double quotes", and 中文 mixed with the fullwidth ： too.'

  it('installs a legal preset whose description carries ": ", #, {, " and CJK', { timeout: 60_000 }, () => {
    // Preconditions of the fixture ITSELF, asserted before anything runs: the
    // constants really carry every hostile character, and the preset.yml they
    // build is valid YAML that round-trips to exactly these values. If the
    // fixture were the thing that broke, the exit-code assertion below would
    // be testing nothing.
    expect(HOSTILE_NAME).not.toContain("'")
    expect(HOSTILE_DESC).not.toContain("'")
    for (const needle of [': ', '#', '{', '"']) {
      expect(HOSTILE_DESC, `fixture lost its ${needle}`).toContain(needle)
    }
    expect(/[一-鿿]/.test(HOSTILE_DESC)).toBe(true)
    const hostilePresetText = [
      '# hostile preset fixture — ": " # { " 中文 all in one legal scalar',
      'id: concerto',
      `name: '${HOSTILE_NAME}'`,
      `description: '${HOSTILE_DESC}'`,
      '',
    ].join('\n')

    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const hostilePreset = join(sbx.root, 'hostile-preset.yml')
    writeFileSync(hostilePreset, hostilePresetText, 'utf8')
    const parsedHostile = asJson(parseFile(hostilePreset))
    expect(parsedHostile.name).toBe(HOSTILE_NAME)
    expect(parsedHostile.description).toBe(HOSTILE_DESC)

    // Feed it through the FULL installer: re-point ONLY the preset.yml cp at
    // this fixture; agent.cordis.yml still comes from the repo, so the render,
    // the self-check and write_patch_row all run over the real pipeline.
    const cpPresetLine = `  cp ${JSON.stringify(PRESET_YML_SRC)} "$1/preset.yml"`
    expect(countOccurrences(offlineInstaller, cpPresetLine)).toBe(1)
    const hostileInstaller = offlineInstaller.replace(
      cpPresetLine,
      `  cp ${JSON.stringify(hostilePreset)} "$1/preset.yml"`,
    )
    expect(hostileInstaller).not.toBe(offlineInstaller)
    writeFileSync(sbx.script, hostileInstaller, 'utf8')
    chmodSync(sbx.script, 0o755)

    const r = runWithDsh(sbx)
    // THE TEETH: bare concatenation makes this exit 1 (ScannerError: mapping
    // values are not allowed here). A legal preset must install.
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    expect(r.stdout).toContain('install face: declaration')

    // The generated patch parses, and the hostile values round-trip VERBATIM.
    const text = readFileSync(patchPath(sbx), 'utf8')
    const doc = parseFile(patchPath(sbx))
    const row = targetRow(doc)
    expect(row).not.toBeNull()
    const cfg = asJson(asJson(row).config)
    expect(cfg.name).toBe(HOSTILE_NAME)
    expect(cfg.description).toBe(HOSTILE_DESC)

    // Pin the quoting layer itself, not just the parse result: the rendered
    // config name/description lines must START with a double quote. Col-8
    // `name:`/`description:` keys exist only in the config block the installer
    // emits — every col-8 line of the pasted body starts with '- ' — so each
    // prefix occurs exactly once.
    expect(countOccurrences(text, '\n        name: "')).toBe(1)
    expect(countOccurrences(text, '\n        description: "')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// T12 — the 0.1.x face honours EXPLORE_PROVIDER / EXPLORE_MODEL too.
// T7 pinned only the no-override 0.1.x install; the override runs through the
// SAME stage_sources rewrite, but filediscovery lands the rewritten SOURCE
// files, not a rendered block, so the target of the assertion is a different
// file.
// ---------------------------------------------------------------------------
describe('T12 dsh 0.1.x face honours the route overrides', () => {
  it('rewrites agentOptions inside the delegation group of the discovered file', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.1.5-rc.1' })
    const r = runWithDsh(sbx, { EXPLORE_PROVIDER: 'ovr-prov', EXPLORE_MODEL: 'ovr-model' })
    expect(r.stderr).not.toContain(NETWORK_ATTEMPTED)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    expect(r.stdout).toContain('install face: filediscovery')
    expect(r.stdout).toContain('explore route overridden')

    const dest = join(sbx.home, '.agent-presets', 'concerto')
    const installedAgent = join(dest, 'agent.cordis.yml')
    expect(existsSync(installedAgent)).toBe(true)
    // The override changed bytes — the installed file is NOT the repo source.
    expect(readFileSync(installedAgent).equals(readFileSync(AGENT_SRC))).toBe(false)
    // preset.yml carries no route — it must stay byte-identical to the source.
    expect(readFileSync(join(dest, 'preset.yml')).equals(readFileSync(PRESET_YML_SRC))).toBe(true)
    // 0.1.x must not grow a profiles/ tree.
    expect(existsSync(join(sbx.home, 'profiles'))).toBe(false)

    // agentOptions is NOT top level — same nested walk as T6, now over the
    // discovered source file.
    const found = collectAgentOptions(parseFile(installedAgent))
    expect(found).toHaveLength(1)
    expect(found[0].path.join('/')).toContain('delegation')
    expect(found[0].value.provider).toBe('ovr-prov')
    expect(found[0].value.model).toBe('ovr-model')
    expect(found[0].value.provider).not.toBe(AUTHORED_PROVIDER)
    expect(found[0].value.model).not.toBe(AUTHORED_MODEL)
  })
})

// ---------------------------------------------------------------------------
// T13 — the version gate on the MAJOR > 0 branch.
// `[ "$DSH_MAJOR" -gt 0 ] || [ "$DSH_MINOR" -ge 2 ]` sends every 1.x / 2.x
// install to the declaration face; until now only 0.2.x exercised it. A
// flipped comparison there silently sends 1.x users to the dead file-discovery
// face — no error, no preset.
// ---------------------------------------------------------------------------
describe('T13 the version gate sends MAJOR > 0 to the declaration face', () => {
  it('dsh 1.0.0 installs as a declared row, never into .agent-presets/', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '1.0.0' })
    const r = runWithDsh(sbx)
    expect(r.stderr).not.toContain(NETWORK_ATTEMPTED)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    expect(r.stdout).toContain('detected dsh 1.0.0 — install face: declaration')

    expect(existsSync(patchPath(sbx))).toBe(true)
    expect(existsSync(join(sbx.home, '.agent-presets'))).toBe(false)
    const doc = parseFile(patchPath(sbx))
    expect(asArray(doc).filter(refsTarget)).toHaveLength(1)
    const row = targetRow(doc)
    expect(row).not.toBeNull()
    expect(asJson(asJson(row).config).id).toBe('concerto')
  })
})

// ---------------------------------------------------------------------------
// T14 — dsh IS on PATH but its --version output parses to no MAJOR.MINOR.
// T8 covered "dsh missing"; this covers "dsh present, version unreadable" —
// the gate must refuse, not guess a face, and refuse BEFORE creating anything
// under DSH_HOME.
// ---------------------------------------------------------------------------
describe('T14 dsh on PATH with an unparseable version is a refusal', () => {
  it('exits non-zero, names the version it got, and creates nothing', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: 'unknown' })
    const r = runWithDsh(sbx)
    expect(r.status).not.toBe(0)
    expect(r.status).not.toBeNull()
    expect(r.stderr).toContain('cannot detect dsh version')
    expect(r.stderr).toContain("got 'unknown'")
    expect(r.stderr).toContain('re-run this installer')
    expect(r.stdout).not.toContain('installing concerto preset')
    expect(r.stdout).not.toContain('install face:')
    // Nothing at all was created under DSH_HOME.
    expect(readdirSync(sbx.home)).toEqual([])
    expect(existsSync(join(sbx.home, '.agent-presets'))).toBe(false)
    expect(existsSync(patchPath(sbx))).toBe(false)
    expect(existsSync(join(sbx.home, 'settings.yaml'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T15 — uninstall guidance, per face. The script ships NO uninstall code —
// `uninstall:` is printed instruction text only — so what is pinned here is
// the text and its face split: the declaration face must protect the user's
// patch file (it carries their own rows), while the filediscovery face's own
// directory is the one thing that may be rm -rf'd.
// ---------------------------------------------------------------------------
describe('T15 uninstall guidance per face', () => {
  it('declaration: protective wording, and never rm -rf on the patch file', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const r = runWithDsh(sbx)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('uninstall:')
    // Protective wording — the patch file holds the user's own rows too.
    expect(r.stdout).toContain('do NOT delete the file')
    // The rm -rf family must stay off the declaration face's output: deleting
    // the patch file is never the advice.
    expect(r.stdout).not.toContain(`rm -rf ${patchPath(sbx)}`)
    expect(r.stdout).not.toContain('rm -rf')
  })

  it('filediscovery: rm -rf on .agent-presets/concerto is the documented uninstall', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.1.5-rc.1' })
    const r = runWithDsh(sbx)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('uninstall:')
    expect(r.stdout).toContain(`rm -rf ${join(sbx.home, '.agent-presets', 'concerto')}`)
  })
})

// ---------------------------------------------------------------------------
// T16 — the agent-preset-registry precondition gate (all three branches).
//
// WHY THIS EXISTS. Before the declaration face writes ANYTHING, it reads
// dsh.profile.bundles out of $DSH_HOME/profiles/web/package.json: upstream
// dsh-agent-preset/lib/index.js:10 declares `static inject = ["agentPresets"]`,
// so a declared row only mounts while an agent-preset-registry service is in
// scope, and on 0.2.x that ships with @deepseek-ai/dsh-web-app. A profile that
// bundles no registry takes the row and mounts NOTHING — roster broken,
// nothing throws: the exact silent no-op this whole file exists to make loud.
// The review grep of the old suite found ZERO coverage of this gate:
//   ① package.json absent  → pass, with the first-boot-template hint line;
//   ② bundles carries it   → pass, package.json stays byte-identical;
//   ③ bundles lacks it     → LOUD refusal: exit non-zero, stderr names the
//      actual bundles value, and cordis.patch.yml is not ONE byte rewritten
//      (Buffer compare) with no .bak born. The zero-write is the entire value
//      of the guard — a "refusal" that still rewrote the file would shred the
//      user's rows on a profile that can never mount the row anyway.
// ---------------------------------------------------------------------------

/**
 * Block the main thread for ~ms WITHOUT busy-waiting and without child
 * processes: Atomics.wait on a fresh SharedArrayBuffer parks the worker/sync
 * context, which a pure setTimeout(0)-trick cannot do inside a synchronous
 * test body. Used only by T19 to spread second-granularity backup names.
 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

describe('T16 the agent-preset-registry precondition gate', () => {
  it('branch ①: no profiles/web/package.json passes, printing the first-boot template hint', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    // The hint line names the missing file and says WHY absence is fine:
    // dsh writes the web profile from its built-in template on first boot.
    expect(r.stdout).toContain('does not exist yet')
    expect(r.stdout).toContain('built-in template')
    expect(r.stdout).toContain('@deepseek-ai/dsh-web-app')
    // And the install still happened, normally.
    expect(existsSync(patchPath(sbx))).toBe(true)
    expect(countOccurrences(readFileSync(patchPath(sbx), 'utf8'), `- id: ${TARGET}\n`)).toBe(1)
    expect(existsSync(join(sbx.home, 'profiles', 'web', 'package.json'))).toBe(false)
  })

  it('branch ②: a web profile bundling @deepseek-ai/dsh-web-app passes and its package.json survives byte-identical', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const pkgPath = join(sbx.home, 'profiles', 'web', 'package.json')
    mkdirSync(dirname(pkgPath), { recursive: true })
    const pkgText = `${JSON.stringify({
      name: 'web',
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    }, null, 2)}\n`
    writeFileSync(pkgPath, pkgText, 'utf8')

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    expect(r.stdout).toContain('agent-preset-registry is in scope')
    // The gate READS package.json — dsh owns that file, the installer must
    // not rewrite it (T1 already pins it is never CREATED; this pins it is
    // never MUTATED once present).
    expect(readFileSync(pkgPath).equals(Buffer.from(pkgText, 'utf8'))).toBe(true)
    const doc = parseFile(patchPath(sbx))
    expect(asArray(doc).filter(refsTarget)).toHaveLength(1)
    expect(pluginsOf(targetRow(doc))).toHaveLength(asArray(parseFile(AGENT_SRC)).length)
  })

  it('branch ③: a web profile WITHOUT the bundle is refused loudly, with zero bytes written', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    const FOREIGN_BUNDLE = '@acme/standalone-bundle'
    const pkgText = `${JSON.stringify({
      dsh: { profile: { bundles: [FOREIGN_BUNDLE] } },
    }, null, 2)}\n`
    writeFileSync(join(dir, 'package.json'), pkgText, 'utf8')
    // The user already had rows here — the refusal must leave every byte.
    const userPatch = [
      '- id: user-row',
      "  name: '@acme/user-row'",
      '',
    ].join('\n')
    writeFileSync(patchPath(sbx), userPatch, 'utf8')
    const beforeBytes = readFileSync(patchPath(sbx))

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.status).not.toBeNull()
    // Loud: stderr names the missing bundle AND the actual bundles value, so
    // the user can see what the profile really declares.
    expect(r.stderr).toContain('does not bundle @deepseek-ai/dsh-web-app')
    expect(r.stderr).toContain(`dsh.profile.bundles=["${FOREIGN_BUNDLE}"]`)
    // The install never started — everything after the guard stayed silent.
    expect(r.stdout).not.toContain('installing concerto preset')
    expect(r.stdout).not.toContain('declared preset-concerto')
    // ZERO WRITES — the whole point of asserting a refusal at all: not one
    // byte of cordis.patch.yml moved (Buffer compare, not string compare),
    // and NO .bak was born: write_patch_row never ran, so it never even got
    // the chance to back the file up before rewriting it.
    expect(readFileSync(patchPath(sbx)).equals(beforeBytes)).toBe(true)
    expect(backupFiles(sbx)).toEqual([])
    expect(readdirSync(dir).filter((n) => n.includes('.bak'))).toEqual([])
    expect(existsSync(join(sbx.home, '.agent-presets'))).toBe(false)
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(pkgText)
  })
})

// ---------------------------------------------------------------------------
// T17 — quoted id spellings.
//
// WHY THIS EXISTS. `- id: 'preset-concerto'` and `- id: "preset-concerto"`
// are the SAME YAML scalar as the bare form, and the dsh-web-app editor
// round-trip plausibly writes ids quoted. _TARGET_SCALAR accepts all three
// spellings; if it regressed to bare-only, a quoted row would survive the
// text-level cut, the self-check would count 2 target rows, and the upgrade
// path would break on files the installer itself claims to handle. The old
// suite pinned bare spellings only (review grep: zero quoted hits).
// `- id: preset-concerto-extra` rides along in both cases as the
// must-NOT-match witness: the alternation is line-anchored, so a similar-but-
// different id survives VERBATIM — cutting it would be the guard eating user
// rows. (It also poisons substring counting: 'preset-concerto-extra'
// CONTAINS 'preset-concerto', so every count here is pinned on a form that
// cannot match inside the extra id.)
// ---------------------------------------------------------------------------
describe('T17 quoted id spellings are cut, similar ids survive', () => {
  it("form ① single-quoted: `- id: 'preset-concerto'` is replaced, not duplicated", { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const fake = [
      "- id: 'preset-concerto'",
      `  name: '${PRESET_ROW_NAME}'`,
      '  config:',
      '    id: concerto',
      '    plugins: []',
      '',
      '- id: preset-concerto-extra',
      "  name: '@acme/preset-concerto-extra'",
      '  config:',
      '    keep: yours',
      '',
    ].join('\n')
    mkdirSync(dirname(patchPath(sbx)), { recursive: true })
    writeFileSync(patchPath(sbx), fake, 'utf8')

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)

    const text = readFileSync(patchPath(sbx), 'utf8')
    // The quoted row was recognised and cut whole — marker content gone.
    expect(text).not.toContain('plugins: []')
    expect(text).not.toContain("id: 'preset-concerto'")
    // Exactly one target row survives, spelled bare (render_patch_block's
    // output). The `-extra` id CONTAINS TARGET, so the newline-terminated
    // form is the only text-level count that cannot match inside it.
    expect(countOccurrences(text, `- id: ${TARGET}\n`)).toBe(1)
    // The similar id survived byte-verbatim.
    expect(countOccurrences(text, '- id: preset-concerto-extra')).toBe(1)
    expect(countOccurrences(text, "  name: '@acme/preset-concerto-extra'")).toBe(1)

    const doc = parseFile(patchPath(sbx))
    expect(asArray(doc).filter(refsTarget)).toHaveLength(1)
    const ids = asArray(doc).map((e) => asJson(e).id)
    expect(ids).toContain('preset-concerto-extra')
    const row = targetRow(doc)
    expect(row).not.toBeNull()
    expect(asJson(row).id).toBe(TARGET)
    expect(pluginsOf(row)).toHaveLength(asArray(parseFile(AGENT_SRC)).length)
  })

  it('form ② double-quoted: `    - id: "preset-concerto"` inside insert: is cut, the sibling survives', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const shared = [
      '- insert:',
      '    - id: "preset-concerto"',
      `      name: '${PRESET_ROW_NAME}'`,
      '      config:',
      '        id: concerto',
      '        plugins: []',
      '    - id: preset-concerto-extra',
      "      name: '@acme/preset-concerto-extra'",
      '',
    ].join('\n')
    mkdirSync(dirname(patchPath(sbx)), { recursive: true })
    writeFileSync(patchPath(sbx), shared, 'utf8')

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)

    const text = readFileSync(patchPath(sbx), 'utf8')
    // No double-quoted spelling of the id survives anywhere.
    expect(text).not.toContain('"preset-concerto"')
    expect(text).not.toContain('plugins: []')
    expect(countOccurrences(text, `- id: ${TARGET}\n`)).toBe(1)
    // The sibling sub-row survives inside the kept insert: block.
    expect(countOccurrences(text, '    - id: preset-concerto-extra')).toBe(1)
    expect(countOccurrences(text, '- insert:')).toBe(2)

    const doc = parseFile(patchPath(sbx))
    expect(asArray(doc)).toHaveLength(2)
    const survivor = asJson(asArray(doc)[0])
    const kept = asArray(survivor.insert)
    expect(kept).toHaveLength(1)
    expect(asJson(kept[0]).id).toBe('preset-concerto-extra')
    expect(refsTarget(survivor)).toBe(false)
    expect(refsTarget(asArray(doc)[1])).toBe(true)
    expect(pluginsOf(targetRow(doc))).toHaveLength(asArray(parseFile(AGENT_SRC)).length)
  })
})

// ---------------------------------------------------------------------------
// T18 — a CRLF patch file is upgradeable.
//
// WHY THIS EXISTS. Windows-authored (or git autocrlf-checked-out) patch files
// arrive with \r\n. The installer splits on '\n', so every line keeps its
// '\r'; RE_FORM1/RE_SUB_TARGET carry a trailing `\r?` so the cut still
// recognises the old row. Without it NOTHING matches, the self-check counts 2
// target rows and the installer refuses with 'convert it to LF first' — a
// hard fail this gate pins away. The user's own CRLF rows must survive with
// their \r\n byte-intact (T4's preservation contract, now over CRLF bytes).
// ---------------------------------------------------------------------------
describe('T18 a CRLF patch file is upgradeable', () => {
  it('cuts the CRLF old row, appends the new block, and keeps the user CRLF row as CRLF', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    mkdirSync(dirname(patchPath(sbx)), { recursive: true })
    const crlfText = [
      '- id: preset-concerto',
      `  name: '${PRESET_ROW_NAME}'`,
      '  config:',
      '    id: concerto',
      '    plugins: []',
      '',
      '- id: user-row-crlf',
      "  name: '@acme/user-row'",
      '',
    ].join('\r\n')
    writeFileSync(patchPath(sbx), crlfText, 'utf8')

    const r = runWithDsh(sbx)
    // THE TEETH: strip the `\r?` from the regexes and the CRLF old row never
    // matches the cut, the self-check then finds 2 target rows and the run
    // exits 1 — this assertion is what goes red first.
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)

    const text = readFileSync(patchPath(sbx), 'utf8')
    // Old row cut whole — its marker content and its CR-bearing id line are
    // both gone.
    expect(text).not.toContain('plugins: []')
    expect(countOccurrences(text, `- id: ${TARGET}\r`)).toBe(0)
    // New row written, exactly one at text level ...
    expect(countOccurrences(text, `- id: ${TARGET}\n`)).toBe(1)
    // ... and exactly one at parse level (PyYAML normalizes CRLF itself).
    const doc = parseFile(patchPath(sbx))
    expect(asArray(doc).filter(refsTarget)).toHaveLength(1)
    expect(pluginsOf(targetRow(doc))).toHaveLength(asArray(parseFile(AGENT_SRC)).length)
    // The user row survives byte-identical, CR included.
    expect(text).toContain('- id: user-row-crlf\r\n')
    expect(text).toContain("  name: '@acme/user-row'\r\n")

    // HONEST OBSERVATION — the PRODUCT IS CRLF/LF MIXED, and that is what
    // this installer does by design. The cut copies each user row out as it
    // stands (every kept line still carries its '\r'), while the freshly
    // appended block is rendered LF-only by render_patch_block. So after the
    // upgrade the user's rows end '\r\n', the installer's block ends '\n',
    // and the seam is literally `user-row'\r\n- insert:\n`. YAML parsers
    // normalize both spellings, so it mounts fine — but a future
    // "normalize the whole file to LF" cleanup WOULD break the byte-
    // preservation assertions above, so the mix is pinned here as a known,
    // asserted property instead of being hidden or "fixed" silently.
    expect(countOccurrences(text, '- insert:\r\n')).toBe(0)
    expect(countOccurrences(text, '- insert:\n')).toBe(1)
    expect(text).toContain("user-row'\r\n- insert:\n")

    // The backup holds the exact original CRLF bytes — the binary round-trip
    // of the pre-rewrite file.
    const baks = backupFiles(sbx)
    expect(baks).toHaveLength(1)
    expect(readFileSync(join(dirname(patchPath(sbx)), baks[0]))
      .equals(Buffer.from(crlfText, 'utf8'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// T19 — backup retention: five runs, newest three .bak.<timestamp> survive.
//
// WHY THIS EXISTS. Without retention every re-run stacks another
// .bak.<timestamp> into the user's profile directory, unbounded. The prune
// (_prune_backups, keep=3) must delete ALL BUT the newest three, must delete
// them by the patch file's FULL '<patch>.bak.' prefix — and must touch
// NOTHING else in the directory. The foreign-prefixed witnesses below are
// the anti-over-deletion tripwire: a prune degraded to '*bak*' or a bare
// '.bak' substring test would delete them, and that is the failure mode with
// real user data behind it.
// ---------------------------------------------------------------------------
describe('T19 backup retention keeps exactly the newest three', () => {
  it('five runs stack exactly three backups; foreign-prefixed files always survive', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    const original = [
      '- id: user-row',
      "  name: '@acme/user-row'",
      '',
    ].join('\n')
    writeFileSync(patchPath(sbx), original, 'utf8')
    // Anti-over-deletion witnesses. `cordis.patch.yml.notes` shares the
    // patch file's stem but not the '.bak.' suffix; `other.bak.zzz` carries
    // '.bak.' INSIDE the name but not the full 'cordis.patch.yml.bak.'
    // prefix the prune is scoped to; `cordis.yml` is the neighbouring
    // composition file. All three must survive all five runs byte-intact.
    const foreign: Array<[string, string]> = [
      ['cordis.patch.yml.notes', '# my notes, not a backup\n'],
      ['cordis.yml', '- id: another-composition\n'],
      ['other.bak.zzz', 'a foreign .bak file — must survive every run\n'],
    ]
    for (const [name, body] of foreign) writeFileSync(join(dir, name), body, 'utf8')

    // WHY WE SLEEP BETWEEN RUNS: backups are named `.bak.<%Y%m%d%H%M%S>` —
    // SECOND granularity. Two runs inside one second collide, and the
    // installer renames the loser to `.bak.<ts>.1`; there, name order no
    // longer mirrors creation order (lexicographically '.bak.TS.10' sorts
    // before '.bak.TS.2'), so "the newest three survived" would hinge on
    // sub-second mtimes the test cannot read off the names — the same-second
    // collision would MASK an ordering bug in the prune. The 1100ms sleep
    // puts each run in its own second. Five installer spawns (~two python3
    // forks each) plus four sleeps is why this case leans on its
    // { timeout: 60_000 } budget.
    const created: string[] = []
    for (let i = 1; i <= 5; i += 1) {
      if (i > 1) sleepSync(1100)
      const r = runWithDsh(sbx)
      expect(r.status, `run ${i}:\n${r.stdout}\n${r.stderr}`).toBe(0)
      const present = backupFiles(sbx)
      // Runs 1-3 stack every backup; from run 4 the oldest is pruned, so
      // the directory holds exactly min(i, 3).
      expect(present, `backup count after run ${i}`).toHaveLength(Math.min(i, 3))
      const fresh = present.filter((n) => !created.includes(n))
      expect(fresh, `run ${i} must create exactly one new backup`).toHaveLength(1)
      created.push(fresh[0])
    }

    expect(created).toHaveLength(5)
    const survivors = backupFiles(sbx)
    // EXACTLY three, and they are the NEWEST three by creation order — the
    // distinct-second timestamps make this readable straight off the names.
    expect(survivors).toHaveLength(3)
    expect(survivors).toEqual(created.slice(2))
    for (const gone of created.slice(0, 2)) {
      expect(existsSync(join(dir, gone)), `${gone} must have been pruned`).toBe(false)
    }
    // Foreign witnesses byte-intact — the prune never left its prefix.
    for (const [name, body] of foreign) {
      expect(readFileSync(join(dir, name), 'utf8'), name).toBe(body)
    }
    // And the live patch still declares exactly one target row.
    const text = readFileSync(patchPath(sbx), 'utf8')
    expect(countOccurrences(text, `- id: ${TARGET}\n`)).toBe(1)
    expect(asArray(parseFile(patchPath(sbx))).filter(refsTarget)).toHaveLength(1)
    expect(text.startsWith(original)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// T20 — a preset-concerto nested inside a user group row is REFUSED.
//
// WHY THIS EXISTS. The text-level cut in write_patch_row and its whole
// self-check (_refs_target / _target_entry / the hits==1 count) only ever
// look at a top-level row's own `id:` and `insert:`. A `- id: preset-concerto`
// buried inside a user group row's `config:` LIST is invisible to every one
// of them: the text cut keeps it, hits==1 cannot count it, the installer
// prints success with exit 0 — and the profile then carries TWO presets whose
// config.id is 'concerto'. The next `dsh web` boot dies upstream in
// dsh-agent-preset-registry/lib/index.js:503 with 'Duplicate agent preset:
// concerto': a profile installed broken, loudly, at exactly the wrong time.
// Auto-deleting the nested row would mean rewriting the user's own group
// structure — too risky — so the installer REFUSES instead, before anything
// is written: exit non-zero, stderr starts with 'error:' and names the form,
// not one byte moves, not even a .bak is born.
// THE TEETH (mutation, not belief): delete the `_refuse_nested_group_target`
// call and the fixture below installs "successfully" — the status assertion
// goes red first, because that exit 0 is the lie being pinned away.
// ---------------------------------------------------------------------------
describe('T20 a preset-concerto nested inside a user group row is refused, never silently double-installed', () => {
  /** The unrepresentable form: target row nested in a group:true config LIST. */
  const nestedPatch = [
    '- id: my-group',
    '  name: cordis:group',
    '  group: true',
    '  config:',
    `    - id: ${TARGET}`,
    `      name: '${PRESET_ROW_NAME}'`,
    '      config:',
    '        id: concerto',
    '        plugins: []',
    '',
  ].join('\n')

  it('refuses loudly, names the form, exits non-zero, and writes ZERO bytes — not even a .bak', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    writeFileSync(patchPath(sbx), nestedPatch, 'utf8')
    const beforeBytes = readFileSync(patchPath(sbx))

    // Non-vacuity FIRST, on the fixture itself: the form is exactly what the
    // local mirrors of the installer's scanners are BLIND to — if this parse
    // says the nested row is visible to refsTarget, the scanner changed and
    // this whole refusal is testing nothing.
    const doc = parseFile(patchPath(sbx))
    const groupRow = asJson(asArray(doc)[0])
    expect(groupRow.id).toBe('my-group')
    expect(groupRow.group).toBe(true)
    expect(asArray(groupRow.config).some((x) => asJson(x).id === TARGET)).toBe(true)
    expect(refsTarget(groupRow)).toBe(false)

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.status).not.toBeNull()
    // Loud, and it names the FORM: a group:true row's config: list carries
    // the nested declaration, the installer cannot replace it, delete by hand.
    expect(r.stderr).toMatch(/^error: /m)
    expect(r.stderr).toContain('nested INSIDE the `config:` list of a `group: true` row')
    expect(r.stderr).toContain(TARGET)
    expect(r.stderr).toContain('Duplicate agent preset: concerto')
    expect(r.stderr).toContain('Delete that nested row')
    // The success lie never prints.
    expect(r.stdout).not.toContain('declared preset-concerto')
    // ZERO WRITES — the refusal runs before the backup, before any byte:
    // the original is byte-identical (Buffer compare) and NO .bak exists.
    expect(readFileSync(patchPath(sbx)).equals(beforeBytes)).toBe(true)
    expect(readdirSync(dir).filter((n) => n.includes('.bak'))).toEqual([])
    expect(existsSync(join(sbx.home, 'settings.yaml'))).toBe(false)
  })

  it('does NOT refuse the safely-expressible forms — top-level row, group row without a nested target, and its own re-install', { timeout: 60_000 }, () => {
    // The guard must not over-refuse: `- id: preset-concerto` at top level
    // (form ①) and inside `- insert:` (form ②, the block the installer itself
    // appends) ARE safely expressible and stay cut-and-replaced; a group row
    // whose config list carries NO target row is plain user content.
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    const safePatch = [
      '# safely expressible: form ① plus a group row without a nested target',
      '- id: preset-concerto',
      `  name: '${PRESET_ROW_NAME}'`,
      '  config:',
      '    id: concerto',
      '    plugins: []',
      '',
      '- id: my-group',
      '  name: cordis:group',
      '  group: true',
      '  config:',
      '    - id: some-plugin',
      "      name: '@acme/some-plugin'",
      '',
    ].join('\n')
    writeFileSync(patchPath(sbx), safePatch, 'utf8')

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    const text = readFileSync(patchPath(sbx), 'utf8')
    // Form ① was cut (marker content gone) ...
    expect(text).not.toContain('plugins: []')
    expect(countOccurrences(text, `- id: ${TARGET}\n`)).toBe(1)
    // ... the group row survived verbatim ...
    expect(text).toContain('- id: my-group\n  name: cordis:group\n  group: true\n')
    // ... and exactly one target row exists at parse level.
    const doc = parseFile(patchPath(sbx))
    expect(asArray(doc).filter(refsTarget)).toHaveLength(1)
    // A SECOND run must also pass — the installer's own appended `- insert:`
    // block is form ② and must never trip the nested guard.
    const second = runWithDsh(sbx)
    expect(second.status, `stderr:\n${second.stderr}`).toBe(0)
    expect(asArray(parseFile(patchPath(sbx))).filter(refsTarget)).toHaveLength(1)
  })

  // 必修 9 (round 3): the fixture above hard-codes `group: true`, which quietly
  // makes it a NECESSARY condition in the assertion face — a guard narrowed to
  // `group is True` passes this block green while the MAJOR it is supposed to
  // pin stays open. Upstream asks for THREE things (dsh-app-boot/lib/index.js:
  // 2100), and `name: cordis:group` alone is one of them, so the refusal is
  // pinned WITHOUT the `group:` key here too.
  it('the same refusal holds with NO `group:` key at all — `name: cordis:group` is sufficient upstream', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    const noGroupKeyPatch = [
      '- id: my-group',
      '  name: cordis:group',
      '  config:',
      `    - id: ${TARGET}`,
      `      name: '${PRESET_ROW_NAME}'`,
      '      config:',
      '        id: concerto',
      '        plugins: []',
      '',
    ].join('\n')
    writeFileSync(patchPath(sbx), noGroupKeyPatch, 'utf8')
    const beforeBytes = readFileSync(patchPath(sbx))

    // Non-vacuity: the row really has NO `group` key, so a guard that only
    // reads `group` cannot be what refuses this file.
    const groupRow = asJson(asArray(parseFile(patchPath(sbx)))[0])
    expect(groupRow.id).toBe('my-group')
    expect('group' in groupRow).toBe(false)
    expect(groupRow.name).toBe('cordis:group')
    expect(asArray(groupRow.config).some((x) => asJson(x).id === TARGET)).toBe(true)

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.stderr).toMatch(/^error: /m)
    // The refusal names the spelling that actually made it a group.
    expect(r.stderr).toContain('nested INSIDE the `config:` list of a `name: cordis:group` row')
    expect(r.stderr).toContain('Duplicate agent preset: concerto')
    expect(r.stdout).not.toContain('declared preset-concerto')
    expect(readFileSync(patchPath(sbx)).equals(beforeBytes)).toBe(true)
    expect(readdirSync(dir).filter((n) => n.includes('.bak'))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// T21 — the refusal hint names the REAL cause.
//
// WHY THIS EXISTS. When the hits==1 self-check fires, the message used to
// append "If <path> has CRLF line endings, convert it to LF first"
// UNCONDITIONALLY — on a pure-LF file (0 CR bytes) with, say,
// `- id: preset-concerto  # note` or 6-space sub-rows under `- insert:`,
// that hint points at a cause that was never possible while hiding the real
// one: a preset-concerto declaration in a shape the text-level cut
// recognises in prose but does not match. The hint is now a byte test: the
// CRLF advice only when b'\r\n' is actually in the original file; every
// other failure gets the honest unmatched-shape hint.
// THE TEETH: make the hint unconditional again and case ① goes red on the
// not-toContain('CRLF') assertion; delete the byte-test branch and case ②
// goes red on the convert-it-to-LF assertion.
// ---------------------------------------------------------------------------
describe('T21 the refusal hint names the real cause — CRLF advice only when CRLF bytes exist', () => {
  /** Valid YAML whose id row carries a trailing comment — RE_FORM1 misses it. */
  const trailingCommentPatch = [
    '- id: preset-concerto  # note',
    `  name: '${PRESET_ROW_NAME}'`,
    '  config:',
    '    id: concerto',
    '    plugins: []',
    '',
  ].join('\n')
  /** Valid YAML whose sub-rows sit at 6 columns — RE_SUB_TARGET misses them. */
  const sixSpaceInsertPatch = [
    '- insert:',
    `      - id: ${TARGET}`,
    `        name: '${PRESET_ROW_NAME}'`,
    '        config:',
    '          id: concerto',
    '          plugins: []',
    '',
  ].join('\n')

  it('a pure-LF file with an unmatched shape gets the honest hint and NEVER the CRLF one', { timeout: 60_000 }, () => {
    for (const [label, fixture] of [
      ['trailing comment after `- id: preset-concerto`', trailingCommentPatch],
      ['sub-rows indented 6 spaces under `- insert:`', sixSpaceInsertPatch],
    ] as Array<[string, string]>) {
      const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
      mkdirSync(dirname(patchPath(sbx)), { recursive: true })
      writeFileSync(patchPath(sbx), fixture, 'utf8')
      const beforeBytes = readFileSync(patchPath(sbx))
      // The fixture is pure LF — the CRLF hint would be a lie about this file.
      expect(beforeBytes.includes(Buffer.from('\r\n'))).toBe(false)

      const r = runWithDsh(sbx)
      expect(r.status, `${label} — stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
      expect(r.status).not.toBeNull()
      expect(r.stderr, label).toContain('recognises in prose but could not match at the text level')
      expect(r.stderr, label).not.toContain('CRLF')
      expect(r.stdout, label).not.toContain('declared preset-concerto')
      // Refused at the self-check: os.replace never ran, bytes unmoved.
      expect(readFileSync(patchPath(sbx)).equals(beforeBytes), label).toBe(true)
    }
  })

  it('a file that really carries CRLF bytes still gets the convert-it-to-LF advice', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    mkdirSync(dirname(patchPath(sbx)), { recursive: true })
    const crlf = trailingCommentPatch.split('\n').join('\r\n')
    writeFileSync(patchPath(sbx), crlf, 'utf8')
    expect(readFileSync(patchPath(sbx)).includes(Buffer.from('\r\n'))).toBe(true)
    const beforeBytes = readFileSync(patchPath(sbx))

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.stderr).toContain('convert it to LF')
    // 必修 3 (round 3): the CRLF sentence used to REPLACE the honest cause, so
    // the user ran dos2unix, re-ran, and read the same line again — this
    // fixture's `- id: preset-concerto  # note` fails the text-level cut under
    // LF too. The CRLF advice is now APPENDED to the honest shape hint, and
    // this case pins both halves in one message.
    expect(r.stderr).toContain('recognises in prose but could not match at the text level')
    expect(r.stderr).toContain('trailing comment')
    expect(r.stderr).toContain('does NOT fix this one')
    expect(r.stdout).not.toContain('declared preset-concerto')
    expect(readFileSync(patchPath(sbx)).equals(beforeBytes), 'refused at the self-check: bytes unmoved').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// T22 — the render self-check proves the quoting, because quoting has holes.
//
// WHY THIS EXISTS. `json.dumps(..., ensure_ascii=False)` quotes the
// double-quote, the backslash and every C0 control — and NOTHING else. A
// YAML 1.1 line-break character inside the value survives the quoting as a
// RAW byte, and PyYAML folds a raw U+0085 (NEL) to a space when it re-parses
// the rendered `description:` line: a silent description rewrite the old
// self-check could not see, because it only compared config.plugins. So the
// self-check now compares the RE-PARSED name AND description
// character-for-character against the parsed input. Separately, YAML 1.1
// happily parses `description: 2026-10-05` into a datetime.date — json.dumps
// then raised a bare TypeError through the one-liner; the block now names the
// key and its type and exits.
// THE TEETH (measured, not believed): the fixture probe below shows the
// corruption happens at the parse layer BEFORE the installer ever runs;
// remove the name/description round-trip assertion from render_patch_block
// and the NEL install goes GREEN with a silently folded description — which
// is exactly what this case pins red.
// ---------------------------------------------------------------------------
describe('T22 the render self-check round-trips name/description — quoting is bounded, the check is the proof', () => {
  // A PERFECTLY LEGAL preset.yml: U+0085 via the double-quoted \U escape.
  const NEL_PRESET = [
    'id: concerto',
    'name: "Concerto Mode"',
    'description: "hostile NEL \\U00000085 marker, 协奏 folds too"',
    '',
  ].join('\n')
  // Also perfectly legal YAML 1.1 — and not a str.
  const DATE_PRESET = ['id: concerto', 'name: "Concerto Mode"', 'description: 2026-10-05', ''].join('\n')

  /** Swap ONLY the preset.yml fetch of the offline installer for a fixture. */
  function installerWithPreset(sbx: Sandbox, presetPath: string): void {
    const cpPresetLine = `  cp ${JSON.stringify(PRESET_YML_SRC)} "$1/preset.yml"`
    expect(countOccurrences(offlineInstaller, cpPresetLine)).toBe(1)
    const swapped = offlineInstaller.replace(cpPresetLine, `  cp ${JSON.stringify(presetPath)} "$1/preset.yml"`)
    expect(swapped).not.toBe(offlineInstaller)
    writeFileSync(sbx.script, swapped, 'utf8')
    chmodSync(sbx.script, 0o755)
  }

  it('a U+0085 in description is caught by the round-trip self-check, not shipped silently', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const nelPreset = join(sbx.root, 'nel-preset.yml')
    writeFileSync(nelPreset, NEL_PRESET, 'utf8')

    // TEETH PROOF AT THE PARSE LAYER, before any installer runs: the value
    // parses WITH the raw NEL, and re-parsing the json-quoted line folds it
    // to a space — the corruption is real, quoting cannot stop it, only the
    // round-trip self-check can see it.
    const parsed = asJson(parseFile(nelPreset))
    expect(typeof parsed.description).toBe('string')
    expect((parsed.description as string).includes('\u0085')).toBe(true)
    const PY_NEL_PROBE = [
      'import json, sys, yaml',
      'v = yaml.safe_load(sys.stdin.read())["description"]',
      'out = "description: " + json.dumps(v, ensure_ascii=False)',
      'back = yaml.safe_load(out)["description"]',
      'sys.stdout.write(json.dumps({"hasNEL": "\\u0085" in v, "folded": back != v}))',
      '',
    ].join('\n')
    const probe = runPython(PY_NEL_PROBE, NEL_PRESET)
    expect(probe.status, probe.stderr).toBe(0)
    const teeth = JSON.parse(probe.stdout) as { hasNEL: boolean; folded: boolean }
    expect(teeth.hasNEL, 'fixture lost its NEL').toBe(true)
    expect(teeth.folded, 'this PyYAML stopped folding NEL — the teeth are gone').toBe(true)

    installerWithPreset(sbx, nelPreset)
    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.status).not.toBeNull()
    expect(r.stderr).toContain('SELF-CHECK FAILED')
    expect(r.stderr).toContain('round-trip')
    expect(r.stderr).toContain('U+0085')
    // The corrupted block never reaches the profile: render failed, so
    // write_patch_row never ran — no patch file, no .bak.
    expect(existsSync(patchPath(sbx))).toBe(false)
    expect(readdirSync(join(sbx.home, 'profiles', 'web')).filter((n) => n.includes('.bak'))).toEqual([])
  })

  it('a non-string scalar (date) description is refused by name and type, with no bare traceback', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const datePreset = join(sbx.root, 'date-preset.yml')
    writeFileSync(datePreset, DATE_PRESET, 'utf8')

    // The fixture really parses to date (json.dumps would die on it) — this
    // is the exact input that used to leak a raw TypeError traceback.
    const PY_TYPE_PROBE = ['import sys, yaml', 'sys.stdout.write(type(yaml.safe_load(sys.stdin.read())["description"]).__name__)', ''].join('\n')
    const probe = runPython(PY_TYPE_PROBE, DATE_PRESET)
    expect(probe.status, probe.stderr).toBe(0)
    expect(probe.stdout).toBe('date')

    installerWithPreset(sbx, datePreset)
    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.stderr).toContain('must define description: as a string')
    expect(r.stderr).toContain('date')
    // No bare traceback leaks through the one-liner.
    expect(r.stderr).not.toContain('Traceback')
    expect(r.stdout).not.toContain('declared preset-concerto')
    expect(existsSync(patchPath(sbx))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T23 — backup retention only ever deletes TIMESTAMP-SHAPED backups.
//
// WHY THIS EXISTS. The prune is scoped by PREFIX, and users — invited by
// this installer's own uninstall hint (`ls -t cordis.patch.yml.bak.*`) —
// keep archives under exactly that prefix: `cordis.patch.yml.bak.mine`,
// `cordis.patch.yml.bak.before-my-edits`. A prefix-only prune deletes them
// the moment retention kicks in, silently eating the user's hand-kept data.
// The deletion candidate set is therefore NAME-SHAPE-scoped: only
// `<patch>.bak.<14 digits>` and `<patch>.bak.<14 digits>.<N>` — the two
// shapes this script itself writes — may be pruned.
// THE TEETH: drop the BACKUP_SHAPE test in _prune_backups and this case goes
// red on the sentinel-survival assertions, because the sentinels are planted
// OLDER than every installer backup — the first thing a prefix-only prune
// with keep=3 would delete.
// ---------------------------------------------------------------------------
describe('T23 user-named .bak sentinels survive every prune — only timestamp-shaped backups are candidates', () => {
  it('sentinels `cordis.patch.yml.bak.mine` and `.bak.before-my-edits` outlive the prune', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    const original = [
      '- id: user-row',
      `  name: '@acme/user-row'`,
      '',
    ].join('\n')
    writeFileSync(patchPath(sbx), original, 'utf8')

    // Three installer-shaped backups, all older than this run, so that after
    // the run the candidate list holds FOUR timestamp-shaped files and keep=3
    // prunes exactly the oldest one.
    const installerShaped: Array<[string, string]> = [
      ['cordis.patch.yml.bak.20230101000001', 'old installer backup 1\n'],
      ['cordis.patch.yml.bak.20230102000002', 'old installer backup 2\n'],
      ['cordis.patch.yml.bak.20230103000003.7', 'old installer same-second collision backup\n'],
    ]
    installerShaped.forEach(([name, body], i) => {
      writeFileSync(join(dir, name), body, 'utf8')
      utimesSync(join(dir, name), 1700000000 + i, 1700000000 + i)
    })
    // The user's own archives: SAME prefix, WRONG shape, and the OLDEST
    // mtimes in the directory — a prefix-only prune with keep=3 deletes them
    // first. This is the data the shape test exists to protect.
    const sentinels: Array<[string, string]> = [
      ['cordis.patch.yml.bak.mine', '# my own archive — the prune must never touch me\n'],
      ['cordis.patch.yml.bak.before-my-edits', '# the exact file the uninstall hint invites me to keep\n'],
    ]
    sentinels.forEach(([name, body], i) => {
      writeFileSync(join(dir, name), body, 'utf8')
      utimesSync(join(dir, name), 1600000000 + i, 1600000000 + i)
    })

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)

    // Sentinels survive byte-intact — the whole point of the shape test.
    for (const [name, body] of sentinels) {
      expect(existsSync(join(dir, name)), `${name} was eaten by the prune`).toBe(true)
      expect(readFileSync(join(dir, name), 'utf8'), name).toBe(body)
    }
    // The fresh backup exists; retention pruned exactly the oldest shaped
    // candidate (20230101); the two newer planted ones, both sentinels and
    // the fresh backup remain.
    const survivors = backupFiles(sbx)
    const plantedNames = installerShaped.map(([name]) => name)
    const sentinelNames = sentinels.map(([name]) => name)
    const fresh = survivors.filter((n) => !plantedNames.includes(n) && !sentinelNames.includes(n))
    expect(fresh, 'exactly one fresh installer backup').toHaveLength(1)
    expect(fresh[0]).toMatch(/^cordis\.patch\.yml\.bak\.\d{14}(\.\d+)?$/)
    expect(survivors).toEqual(
      [...plantedNames.slice(1), ...sentinelNames, fresh[0]].sort(),
    )
    expect(existsSync(join(dir, 'cordis.patch.yml.bak.20230101000001'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T24 — the two python dependency guards of the declaration face.
//
// WHY THIS EXISTS. Before the declaration face creates a single directory it
// asserts `need python3` and `python3 -c 'import yaml'`. The review's
// mutation run deleted each guard in turn and the OLD suite stayed GREEN —
// zero coverage pinned either one. The entire value of a dependency guard is
// that it stops BEFORE anything is created, so every case here asserts exit
// non-zero, the exact stderr message, and ZERO bytes under DSH_HOME.
// THE TEETH: `need python3` → `command -v python3 || true` makes case ① red
// (the missing-python3 line disappears); `if ! python3 -c 'import yaml'` →
// `if false` makes case ② red (the real failure resurfaces downstream as a
// bare ImportError AFTER profiles/web was already mkdir'd — both the message
// and the zero-byte assertions go red there).
// ---------------------------------------------------------------------------
describe('T24 the python dependency guards stop before anything is created', () => {
  /** Every tool the installer invokes BEFORE the python3 guard, nothing more. */
  const GUARD_TOOLS = ['sh', 'sed', 'head', 'mktemp', 'rm', 'cp', 'grep'] as const

  function findRealTool(tool: string): string {
    for (const dir of REAL_PATH) {
      const p = join(dir, tool)
      if (isExecutable(p)) return p
    }
    throw new Error(`harness host lost '${tool}' — the guard tests need it on the real PATH`)
  }

  /** A PATH dir WITHOUT python3 but with everything the pre-guard run needs. */
  function makeGuardBin(sbx: Sandbox): string {
    const bin = join(sbx.root, 'guardbin')
    mkdirSync(bin, { recursive: true })
    for (const tool of GUARD_TOOLS) symlinkSync(findRealTool(tool), join(bin, tool))
    writeFileSync(join(bin, 'dsh'), DSH_SHIM('0.2.0-rc.2'), { mode: 0o755 })
    chmodSync(join(bin, 'dsh'), 0o755)
    writeFileSync(join(bin, 'curl'), CURL_GUARD_SHIM, { mode: 0o755 })
    chmodSync(join(bin, 'curl'), 0o755)
    return bin
  }

  function assertHomeZeroBytes(sbx: Sandbox): void {
    // The guard's whole value: it fires BEFORE any write — not even an empty
    // directory appeared under DSH_HOME.
    expect(readdirSync(sbx.home)).toEqual([])
    expect(existsSync(patchPath(sbx))).toBe(false)
    expect(existsSync(join(sbx.home, '.agent-presets'))).toBe(false)
    expect(existsSync(join(sbx.home, 'settings.yaml'))).toBe(false)
    expect(backupFiles(sbx)).toEqual([])
  }

  it('no python3 on PATH: exit non-zero, `error: missing python3`, zero bytes written', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const guardBin = makeGuardBin(sbx)
    // The PATH is really python3-free, and really complete otherwise — the
    // refusal must come from the guard, not from a crippled harness.
    expect(existsSync(join(guardBin, 'python3'))).toBe(false)
    expect(spawnSync('sh', ['-c', 'command -v python3 >/dev/null 2>&1', 'sh'], { env: { PATH: guardBin } }).status).not.toBe(0)
    for (const tool of [...GUARD_TOOLS, 'curl', 'dsh']) {
      expect(spawnSync('sh', ['-c', 'command -v "$1" >/dev/null 2>&1', 'sh', tool], { env: { PATH: guardBin } }).status, `guardbin lost ${tool}`).toBe(0)
    }

    // THE ENV IS BUILT ONCE, then asked about, then handed over untouched — so
    // what assertShimWins proves is exactly what the installer runs with.
    // This case's shim lives in guardBin (a python3-free PATH), NOT in sbx.bin.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DSH_HOME: sbx.home,
      NO_PIAI: '1',
      EXPLORE_PROVIDER: '',
      EXPLORE_MODEL: '',
      CONCERTO_TAG: '',
      PATH: guardBin,
    }
    // 防复发: PATH resolves to the guardbin shim, and that shim answers the
    // version this case claims. Without this the whole case could be running
    // the host's dsh on the host's PATH.
    assertShimWins('T24 no-python3', env, guardBin, '0.2.0-rc.2')

    const r = spawnSync('sh', [sbx.script], {
      encoding: 'utf8',
      timeout: 120_000,
      env,
    })
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.status).not.toBeNull()
    expect(r.stderr).toContain('error: missing python3')
    expect(r.stdout).not.toContain('installing concerto preset')
    expect(r.stdout).not.toContain('declared preset-concerto')
    assertHomeZeroBytes(sbx)
  })

  it('python3 present but `import yaml` failing: exit non-zero, the PyYAML error, zero bytes written', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const yamlDir = join(sbx.root, 'broken-yaml')
    mkdirSync(yamlDir, { recursive: true })
    // PYTHONPATH precedes site-packages, so this stub IS the `yaml` module.
    writeFileSync(join(yamlDir, 'yaml.py'), 'raise ImportError("no PyYAML — harness stub")\n', 'utf8')

    // THE ENV IS BUILT ONCE, then asked about, then handed over untouched.
    // PATH MUST PREPEND sbx.bin. This is the line that caused CI run
    // 37325570400: without the prefix the installer saw the HOST dsh —
    // 0.2.0-rc.2 on a laptop (declaration face, reaches the PyYAML guard,
    // green) and 0.1.5-rc.1 in CI per D7 (filediscovery face, never reaches
    // the guard, exit 0, red). The version gate is the FIRST branch in this
    // script and the face it picks decides whether the assertion below can
    // ever be reached at all.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DSH_HOME: sbx.home,
      NO_PIAI: '1',
      EXPLORE_PROVIDER: '',
      EXPLORE_MODEL: '',
      CONCERTO_TAG: '',
      PYTHONPATH: yamlDir,
      PATH: `${sbx.bin}:${process.env.PATH}`,
    }
    // 防复发 断言一 + 二: the sandbox shim IS the dsh on this PATH and it
    // answers 0.2.0-rc.2, so the declaration face — and with it the PyYAML
    // guard — is really the code path under test.
    assertShimWins('T24 broken-yaml', env, sbx.bin, '0.2.0-rc.2')
    // The same env, asked the same question the installer's guard asks: python3
    // is reachable, and `import yaml` fails THERE (not in some other env), on
    // the stub's own message — so the refusal can only come from the guard.
    expect(spawnSync('sh', ['-c', 'command -v python3'], { env, encoding: 'utf8', timeout: 30_000 }).status, 'python3 must be reachable on the installer PATH or this case tests `missing python3`, not the PyYAML guard').toBe(0)
    const pyImport = spawnSync('sh', ['-c', 'python3 -c \'import yaml\''], { env, encoding: 'utf8', timeout: 30_000 })
    expect(pyImport.status, `stderr:\n${pyImport.stderr}`).not.toBe(0)
    expect(`${pyImport.stderr}${pyImport.stdout}`).toContain('no PyYAML — harness stub')
    // python3 is an AMBIENT binary by design here (no sandboxed interpreter);
    // what is pinned is that it is the SAME interpreter the assertions parse
    // with, and that PYTHONPATH really shadows its site-packages `yaml`.
    const ambientPython = spawnSync('sh', ['-c', 'command -v python3'], { env, encoding: 'utf8', timeout: 30_000 })
    expect((ambientPython.stdout ?? '').trim(), 'python3 must resolve on the installer PATH — it is ambient by design').not.toBe('')

    const r = spawnSync('sh', [sbx.script], {
      encoding: 'utf8',
      timeout: 120_000,
      env,
    })
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.status).not.toBeNull()
    expect(r.stderr).toContain('error: PyYAML required for the dsh >= 0.2 install path')
    expect(r.stdout).not.toContain('installing concerto preset')
    expect(r.stdout).not.toContain('declared preset-concerto')
    assertHomeZeroBytes(sbx)
  })
})

// ---------------------------------------------------------------------------
// T25 — the registry refusal names the ACTUAL bundles value, even when it
// is not a list.
//
// WHY THIS EXISTS. `bundles if isinstance(bundles, list) else None` printed
// `dsh.profile.bundles=null` for a profile whose bundles was, say, a plain
// STRING — a message that contradicted its own promise ("stderr names the
// actual bundles value") and sent the user hunting for a value the file never
// carried. The refusal itself was right; the message lied. Non-list values
// now print as their raw repr.
// THE TEETH: revert to the laundering ternary and this case goes red on the
// `bundles=null` not-toContain assertion.
// ---------------------------------------------------------------------------
describe('T25 the registry refusal names the actual bundles value even when it is not a list', () => {
  it('a STRING bundles is refused with its raw repr, never laundered into null', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    // Legal JSON, wrong SHAPE: a string where the profile schema wants an
    // array — and the string even names the right bundle, so a list check
    // done wrong could almost pass.
    const pkgText = '{"dsh":{"profile":{"bundles":"@deepseek-ai/dsh-web-app"}}}\n'
    writeFileSync(join(dir, 'package.json'), pkgText, 'utf8')

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.status).not.toBeNull()
    expect(r.stderr).toContain('does not bundle @deepseek-ai/dsh-web-app')
    // The raw value, repr'd — exactly what the message promises.
    expect(r.stderr).toContain("bundles=raw value '@deepseek-ai/dsh-web-app'")
    expect(r.stderr).toContain('not a list')
    // The lie is gone: no laundered null anywhere in the message.
    expect(r.stderr).not.toContain('bundles=null')
    // Refused before any write, as every registry refusal must be.
    expect(existsSync(patchPath(sbx))).toBe(false)
    expect(readdirSync(dir).filter((n) => n.includes('.bak'))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// T26 — the group guard is upstream's UNION, not a narrower reading of it.
//
// WHY THIS EXISTS. Round 2 closed the nested-group MAJOR (T20) with a guard
// that asked `node.get('group') is True`. That is NARROWER than dsh. Upstream
// asks for a three-way union (dsh-app-boot/lib/index.js:2100):
//     row.group === true || row.name === "cordis:group"
//         || row.name === "@deepseek-ai/cordis-plugin-group"
// and the two `name:` spellings are sufficient ON THEIR OWN — the review ran
// the real Loader over `{name:'@deepseek-ai/cordis-plugin-group', config:[…]}`
// with `group` absent, true AND false, and all three mounted the children.
// Measured on the previous revision with this harness, every shape below exited 0
// and left the patch file holding TWO live preset rows: the same
// 'Duplicate agent preset: concerto' boot death T20 exists to prevent, open
// again through the most canonical spelling there is — `name: cordis:group`
// written without a `group:` key at all.
// THE TEETH (mutation, not belief): put the guard back to `is True` and all
// five cases go red on the exit status — that exit 0 IS the lie being pinned.
// ---------------------------------------------------------------------------
describe('T26 a nested preset row is refused under every group spelling dsh accepts', () => {
  /** The nested form under a `name: cordis:group` row, `group:` supplied or not. */
  const cordisGroupShape = (groupLine: string | null): string => [
    '- id: my-group',
    '  name: cordis:group',
    ...(groupLine ? [groupLine] : []),
    '  config:',
    `    - id: ${TARGET}`,
    `      name: '${PRESET_ROW_NAME}'`,
    '      config:',
    '        id: concerto',
    '        plugins: []',
    '',
  ].join('\n')
  /** The same nested form under the PACKAGE-name spelling, no `group:` key. */
  const packageGroupShape = [
    '- id: my-group',
    "  name: '@deepseek-ai/cordis-plugin-group'",
    '  config:',
    `    - id: ${TARGET}`,
    `      name: '${PRESET_ROW_NAME}'`,
    '      config:',
    '        id: concerto',
    '        plugins: []',
    '',
  ].join('\n')

  /** Shared body: refuse loudly, name the spelling, move ZERO bytes. */
  function refuseShape(label: string, fixture: string, reason: string): void {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    writeFileSync(patchPath(sbx), fixture, 'utf8')
    const beforeBytes = readFileSync(patchPath(sbx))

    // Non-vacuity FIRST: the nested row sits where the text-level cut and
    // refsTarget are both blind, so this really is the double-install form.
    const row = asJson(asArray(parseFile(patchPath(sbx)))[0])
    expect(refsTarget(row), label).toBe(false)
    expect(asArray(row.config).some((x) => asJson(x).id === TARGET), label).toBe(true)

    const r = runWithDsh(sbx)
    expect(r.status, `${label} — stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.status, label).not.toBeNull()
    expect(r.stderr, label).toMatch(/^error: /m)
    expect(r.stderr, label).toContain('nested INSIDE the `config:` list of a')
    expect(r.stderr, label).toContain(reason)
    expect(r.stderr, label).toContain('Duplicate agent preset: concerto')
    expect(r.stderr, label).toContain('Delete that nested row')
    expect(r.stdout, label).not.toContain('declared preset-concerto')
    // ZERO BYTES of the patch file or its backup — the guard runs before both.
    expect(readFileSync(patchPath(sbx)).equals(beforeBytes), `${label}: bytes moved`).toBe(true)
    expect(readdirSync(dir).filter((n) => n.includes('.bak')), label).toEqual([])
    // Still exactly the ONE nested row the user wrote: nothing was appended.
    expect(countOccurrences(readFileSync(patchPath(sbx), 'utf8'), `- id: ${TARGET}`), label).toBe(1)
  }

  it('no `group:` key at all, `name: cordis:group` — the canonical spelling is refused', { timeout: 60_000 }, () => {
    refuseShape('name: cordis:group, no group key', cordisGroupShape(null), '`name: cordis:group`')
  })

  it('`group: false` beside `name: cordis:group` is still a group — refused', { timeout: 60_000 }, () => {
    const fixture = cordisGroupShape('  group: false')
    // The fixture really says `group: false`, so `is True` cannot be what
    // refuses it: only upstream's name door can.
    const row = asJson(asArray(parseCordis(fixture, 'fixture'))[0])
    expect(row.group).toBe(false)
    refuseShape('group: false', fixture, '`name: cordis:group`')
  })

  it("`group: 'true'` as a quoted STRING is refused (YAML keeps the quote's type)", { timeout: 60_000 }, () => {
    const fixture = cordisGroupShape("  group: 'true'")
    // Parsed as str, not bool — `is True` and the YAML 1.1 plain-`yes`/`on`
    // resolutions are two different things, and both are covered here.
    expect(typeof asJson(asArray(parseCordis(fixture, 'fixture'))[0]).group).toBe('string')
    refuseShape("group: 'true'", fixture, '`name: cordis:group`')
  })

  it("`name: '@deepseek-ai/cordis-plugin-group'` with no `group:` key is refused", { timeout: 60_000 }, () => {
    refuseShape('package-name group', packageGroupShape, '`name: @deepseek-ai/cordis-plugin-group`')
  })

  it('a truthy non-boolean `group:` under a plain plugin name is refused too', { timeout: 60_000 }, () => {
    // No group NAME here — the only door is `group` itself, and upstream
    // rejects a non-boolean `group` outright ('group must be a literal boolean
    // or null', dsh-app-boot/lib/index.js:2958), so nothing installable is
    // being withheld. The previous revision's `is True` let it through and
    // exited 0; whether the row then mounts is upstream's call, and this
    // guard does not guess narrower than the runtime to find out.
    const fixture = [
      '- id: my-group',
      "  name: '@acme/plain-group'",
      "  group: 'yes'",
      '  config:',
      `    - id: ${TARGET}`,
      `      name: '${PRESET_ROW_NAME}'`,
      '      config:',
      '        id: concerto',
      '        plugins: []',
      '',
    ].join('\n')
    expect(typeof asJson(asArray(parseCordis(fixture, 'fixture'))[0]).group).toBe('string')
    refuseShape("truthy string group, plain name", fixture, "`group: 'yes'` (truthy, not the boolean true)")
  })
})

// ---------------------------------------------------------------------------
// T27 — `inside` is a ROW-level flag: a plugin may own `config.id`.
//
// WHY THIS EXISTS. The guard that closed T20 handed `inside=True` to EVERY key
// of every dict below a group's `config:` list, so the `config:` MAPPING of a
// plugin row was read as if it were a declaration row too. A perfectly ordinary
//     - id: some-plugin
//       config:
//         id: preset-concerto      ← the plugin's OWN config id
// therefore exited 1 and the user had to rename their plugin's config key
// before the installer would run. `id` inside a plugin's config is plain data:
// the Loader mounts rows out of a GROUP's config LIST, never out of a plugin's
// config mapping. A nested target that is `disabled: true` is the same story
// from the other side — a disabled row is never registered
// (cordis-plugin-loader/lib/index.js:334-341, :347-348), so it can never
// duplicate, and refusing it was pure friction.
// THE TEETH (mutation, not belief): pass `inside` down through every key again
// and case ① goes red on the exit status; drop the `_provably_disabled` skip
// and case ② does.
// ---------------------------------------------------------------------------
describe('T27 the nested guard stays at row level — a plugin may own config.id', () => {
  it('installs a group whose plugin row carries its OWN `config.id: preset-concerto`', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    const fixture = [
      '- id: my-group',
      '  name: cordis:group',
      '  group: true',
      '  config:',
      '    - id: some-plugin',
      "      name: '@acme/some-plugin'",
      '      config:',
      `        id: ${TARGET}`,
      '        mode: fast',
      '',
    ].join('\n')
    writeFileSync(patchPath(sbx), fixture, 'utf8')
    // Non-vacuity: this is exactly the shape the round-2 guard refused.
    const before = asJson(asArray(parseFile(patchPath(sbx)))[0])
    expect(asJson(asJson(asArray(before.config)[0]).config).id).toBe(TARGET)

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    const text = readFileSync(patchPath(sbx), 'utf8')
    // ONE live target row, and the user's plugin row untouched.
    expect(asArray(parseFile(patchPath(sbx))).filter(refsTarget)).toHaveLength(1)
    expect(countOccurrences(text, `- id: some-plugin`)).toBe(1)
    expect(text).toContain("      name: '@acme/some-plugin'\n")
    expect(text).toContain('        mode: fast\n')
    // The plugin's own config id survived verbatim — it is data, not a row.
    const groupRow = asJson(asArray(parseFile(patchPath(sbx))).find((e) => asJson(e).id === 'my-group'))
    expect(asJson(asJson(asArray(groupRow.config)[0]).config).id).toBe(TARGET)
    // And a second run stays idempotent over the same user content.
    const second = runWithDsh(sbx)
    expect(second.status, `stderr:\n${second.stderr}`).toBe(0)
    expect(countOccurrences(readFileSync(patchPath(sbx), 'utf8'), `- id: some-plugin`)).toBe(1)
    expect(asArray(parseFile(patchPath(sbx))).filter(refsTarget)).toHaveLength(1)
  })

  it('installs a nested target row that is `disabled: true` — it can never register', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    const fixture = [
      '- id: my-group',
      '  name: cordis:group',
      '  group: true',
      '  config:',
      `    - id: ${TARGET}`,
      `      name: '${PRESET_ROW_NAME}'`,
      '      disabled: true',
      '      config:',
      '        id: concerto',
      '        plugins: []',
      '',
    ].join('\n')
    writeFileSync(patchPath(sbx), fixture, 'utf8')
    const nested = asJson(asArray(asJson(asArray(parseFile(patchPath(sbx)))[0]).config)[0])
    expect(nested.id).toBe(TARGET)
    expect(nested.disabled).toBe(true)

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    const text = readFileSync(patchPath(sbx), 'utf8')
    // The disabled nested row stays exactly where the user wrote it, and the
    // ONE live target row is the installer's own declaration.
    expect(countOccurrences(text, `- id: ${TARGET}`)).toBe(2)
    expect(asArray(parseFile(patchPath(sbx))).filter(refsTarget)).toHaveLength(1)
    const live = targetRow(parseFile(patchPath(sbx)))
    expect(asJson(asJson(live).config).id).toBe('concerto')
    expect(pluginsOf(live).length).toBeGreaterThan(0)
    const second = runWithDsh(sbx)
    expect(second.status, `stderr:\n${second.stderr}`).toBe(0)
    expect(countOccurrences(readFileSync(patchPath(sbx), 'utf8'), `- id: ${TARGET}`)).toBe(2)
    expect(asArray(parseFile(patchPath(sbx))).filter(refsTarget)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// T28 — BACKUP_SHAPE is an ASCII class, because `\d` is not.
//
// WHY THIS EXISTS. Python's `\d` matches every Unicode decimal digit (category
// Nd), so `cordis.patch.yml.bak.١٢٣٤٥٦٧٨٩٠١٢٣٤` matched `\d{14}` and became a
// DELETION candidate — a name `time.strftime('%Y%m%d%H%M%S')` can never
// produce, i.e. a file a human wrote, which is precisely the data the docstring
// swears no retention policy may eat. `[0-9]` is the class the writer uses.
// THE TEETH (mutation, not belief): `\d{14}` and both sentinels go red, they
// are planted with the OLDEST mtimes so a widened class deletes them first.
// ---------------------------------------------------------------------------
describe('T28 the backup shape is ASCII — Unicode digits are a user archive, not a prune candidate', () => {
  it('a `.bak.<14 Unicode digits>` sentinel outlives a prune that really deletes shaped backups', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    writeFileSync(patchPath(sbx), `- id: user-row\n  name: '@acme/user-row'\n`, 'utf8')

    const shaped: Array<[string, string]> = [
      ['cordis.patch.yml.bak.20230101000001', 'shaped backup 1\n'],
      ['cordis.patch.yml.bak.20230102000002', 'shaped backup 2\n'],
      ['cordis.patch.yml.bak.20230103000003', 'shaped backup 3\n'],
    ]
    shaped.forEach(([name, body], i) => {
      writeFileSync(join(dir, name), body, 'utf8')
      utimesSync(join(dir, name), 1700000000 + i, 1700000000 + i)
    })
    // The user's archives: same prefix, 14 characters long, and the OLDEST
    // mtimes in the directory — a `\d{14}` prune deletes them before it
    // touches any shaped backup.
    const unicodeSentinels: Array<[string, string]> = [
      ['cordis.patch.yml.bak.\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669\u0660\u0661\u0662\u0663\u0664', 'Arabic-Indic digits — mine, keep me\n'],
      ['cordis.patch.yml.bak.\u0967\u0968\u0969\u096A\u096B\u096C\u096D\u096E\u096F\u0966\u0967\u0968\u0969\u096A', 'Devanagari digits — mine, keep me\n'],
    ]
    unicodeSentinels.forEach(([name, body], i) => {
      // 14 characters, none of them ASCII — Python's `\d` (category Nd) would
      // match this, JS's `\d` (ASCII) and `[0-9]` never do.
      expect(name.slice(-14)).toHaveLength(14)
      expect(name.slice(-14)).not.toMatch(/^[0-9]{14}$/)
      writeFileSync(join(dir, name), body, 'utf8')
      utimesSync(join(dir, name), 1600000000 + i, 1600000000 + i)
    })

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)

    for (const [name, body] of unicodeSentinels) {
      expect(existsSync(join(dir, name)), `${name} was eaten by the prune`).toBe(true)
      expect(readFileSync(join(dir, name), 'utf8'), name).toBe(body)
    }
    // The prune really ran: 3 shaped + 1 fresh candidates, keep=3.
    const survivors = backupFiles(sbx)
    const sentinelNames = unicodeSentinels.map(([n]) => n)
    const fresh = survivors.filter((n) => !sentinelNames.includes(n) && !shaped.map(([n]) => n).includes(n))
    expect(fresh, 'exactly one fresh installer backup').toHaveLength(1)
    expect(survivors).toEqual([...shaped.map(([n]) => n).slice(1), ...sentinelNames, ...fresh].sort())
    expect(existsSync(join(dir, shaped[0][0])), 'the oldest shaped backup must be pruned').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T29 — same-second backups sort by their collision suffix as an INTEGER.
//
// WHY THIS EXISTS. `_prune_backups` sorted by (mtime, name). Backups made in
// one second share an mtime, and there the tie broke on TEXT: ten collisions
// sort '.bak.TS.10' BEFORE '.bak.TS.2', so with 10+ collisions the prune
// deleted the NEWEST backups and kept stale ones — the exact inverse of what
// 'keep the newest three' promises, and the newest is precisely the file the
// uninstall hint (`ls -t … | head -n 1`) restores. T19/T23 spread their runs
// over distinct seconds and could not see it. The suffix is now parsed to an
// int, with a bare timestamp (the first file of its second) as -1.
// THE TEETH (mutation, not belief): back to (mt, name) and the survivor list
// becomes '.8/.9/fresh' — red on both the survivor equality and the two
// explicit '.10/.11 still exist' assertions.
// ---------------------------------------------------------------------------
describe('T29 same-second backups sort by their collision suffix as an integer', () => {
  it('twelve backups inside one second keep the three NEWEST by creation order, not by name', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    writeFileSync(patchPath(sbx), `- id: user-row\n  name: '@acme/user-row'\n`, 'utf8')

    // Creation order inside one second: the bare timestamp first, then .1 …
    // .11. Every file gets the SAME mtime, so only the parsed suffix — never
    // the clock, never the collation — can order them.
    const TS = '20230101000000'
    const created: string[] = [`cordis.patch.yml.bak.${TS}`]
    for (let i = 1; i <= 11; i += 1) created.push(`cordis.patch.yml.bak.${TS}.${i}`)
    expect(created).toHaveLength(12)
    created.forEach((name) => {
      writeFileSync(join(dir, name), `backup body ${name}\n`, 'utf8')
      utimesSync(join(dir, name), 1672531200, 1672531200)
    })
    // Lexicographic order really is the inverse of creation order past .9.
    expect([...created].sort().indexOf(`cordis.patch.yml.bak.${TS}.10`))
      .toBeLessThan([...created].sort().indexOf(`cordis.patch.yml.bak.${TS}.2`))

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)

    const survivors = backupFiles(sbx)
    const fresh = survivors.filter((n) => !created.includes(n))
    expect(fresh, 'exactly one fresh installer backup').toHaveLength(1)
    // keep=3 of thirteen candidates → the two highest collision indices of the
    // colliding second, plus this run's own backup.
    expect(survivors).toEqual([
      `cordis.patch.yml.bak.${TS}.10`,
      `cordis.patch.yml.bak.${TS}.11`,
      ...fresh,
    ].sort())
    for (const keep of [`cordis.patch.yml.bak.${TS}.10`, `cordis.patch.yml.bak.${TS}.11`]) {
      expect(existsSync(join(dir, keep)), `${keep} is the NEWEST — it must survive`).toBe(true)
    }
    for (const gone of created.slice(0, 9)) {
      expect(existsSync(join(dir, gone)), `${gone} is older and must be pruned`).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// T30 — the uninstall restore hint can only ever select an INSTALLER backup.
//
// WHY THIS EXISTS. The hint read `ls -t <patch>.bak.* | head -n 1`. `.bak.*`
// also matches the archives the user kept by hand — `cordis.patch.yml.bak.mine`
// — and those are exactly what T23's shape test protects from deletion, so the
// restore hint could hand back a file the retention policy had sworn to keep,
// silently overwriting the live patch with it. The glob is now timestamp-shaped
// (`.bak.[0-9]*`) in the script AND in both docs, and the wording says
// INSTALLER backup.
// THE TEETH: widen the glob back to `.bak.*` and case ② restores `.bak.mine`
// — the assertion names it, so the failure is self-explanatory.
// ---------------------------------------------------------------------------
describe('T30 the uninstall restore hint can only ever select an installer backup', () => {
  it('the script and BOTH docs glob `.bak.[0-9]*` and say installer backup, never bare `.bak.*`', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const r = runWithDsh(sbx)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain(`${patchPath(sbx)}.bak.[0-9]*`)
    expect(r.stdout).toMatch(/newest INSTALLER backup/)
    expect(r.stdout).not.toContain('.bak.* 2>/dev/null')

    for (const doc of ['install-concerto.md', 'install-concerto_zh-CN.md']) {
      const text = readFileSync(join(REPO_ROOT, 'docs', doc), 'utf8')
      expect(text, doc).toContain('cordis.patch.yml.bak.[0-9]*')
      expect(text, doc).not.toContain('.bak.* 2>/dev/null')
      // The word that carries the scope, in the doc's own language.
      expect(doc === 'install-concerto.md' ? text.toLowerCase() : text, doc)
        .toMatch(doc === 'install-concerto.md' ? /installer.*backup|backup.*installer/ : /安装器/)
    }
  })

  it('the printed glob really skips a `.bak.mine` that is newer than every installer backup', { timeout: 60_000 }, () => {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    const patch = patchPath(sbx)
    const installerBackup = `${patch}.bak.20230101000000`
    const mine = `${patch}.bak.mine`
    writeFileSync(installerBackup, `- id: installer-backup-body\n`, 'utf8')
    utimesSync(installerBackup, 1700000000, 1700000000)
    writeFileSync(mine, '- id: MY-OWN-ARCHIVE — never restore me\n', 'utf8')
    utimesSync(mine, 1800000000, 1800000000)

    const pick = (pattern: string): string => {
      const out = spawnSync('sh', ['-c', 'cd "$1" && ls -t cordis.patch.yml.bak.' + pattern + ' 2>/dev/null | head -n 1', 'sh', dir], { encoding: 'utf8' })
      return (out.stdout ?? '').trim()
    }
    // The widened glob the fix replaced really did select the user's archive.
    expect(pick('*')).toBe(basename(mine))
    // The shipped glob selects the installer's backup and nothing else.
    expect(pick('[0-9]*')).toBe(basename(installerBackup))
  })
})

// ---------------------------------------------------------------------------
// T31 — the nested-group refusal is DOCUMENTED, in both languages.
//
// WHY THIS EXISTS. It is a user-visible failure mode that ends an install with
// a non-zero exit and nothing written, and until now the only place a user
// could read about it was the stderr of the run they just lost. One sentence in
// each install doc, naming the form, the three group spellings, why it cannot
// be replaced automatically, and the fix.
// ---------------------------------------------------------------------------
describe('T31 both install docs tell the user about the nested-group refusal', () => {
  it('install-concerto.md names the refused form, the three group spellings, and the fix', { timeout: 60_000 }, () => {
    const text = readFileSync(join(REPO_ROOT, 'docs', 'install-concerto.md'), 'utf8')
    expect(text).toContain('nested inside the `config:` list of a group row')
    expect(text).toContain('cordis:group')
    expect(text).toContain('@deepseek-ai/cordis-plugin-group')
    expect(text).toContain('Duplicate agent preset: concerto')
    expect(text).toMatch(/exits non-zero/)
    expect(text).toMatch(/delete that nested row/i)
    expect(text).toMatch(/not even a `\.bak`/)
    // The two forms that must NOT frighten a user out of a working install.
    expect(text).toMatch(/disabled: true/)
    expect(text).toMatch(/own config id/)
  })

  it('install-concerto_zh-CN.md says the same thing in Chinese', { timeout: 60_000 }, () => {
    const text = readFileSync(join(REPO_ROOT, 'docs', 'install-concerto_zh-CN.md'), 'utf8')
    expect(text).toContain('嵌在某个 group 行的 `config:` 列表里面')
    expect(text).toContain('cordis:group')
    expect(text).toContain('@deepseek-ai/cordis-plugin-group')
    expect(text).toContain('Duplicate agent preset: concerto')
    expect(text).toMatch(/非 0 退出码/)
    expect(text).toMatch(/把那一嵌套的行删掉/)
    expect(text).toMatch(/\.bak/)
    expect(text).toMatch(/disabled: true/)
    expect(text).toMatch(/插件自己的配置 id/)
  })
})

// ---------------------------------------------------------------------------
// T32 — `disabled: true` is NOT a skip when the row itself says `group:`.
//
// WHY THIS EXISTS. The Loader's disabled test carries a short-circuit upstream
// never documented to this guard: `if (this.options.group) return false`
// (cordis-plugin-loader/lib/index.js:335) — a row that declares itself a group
// with a TRUTHY `group:` IGNORES its own `disabled` and mounts anyway. The
// leaf skip in _find_target_in_group_configs only consulted `_provably_disabled`
// (which judges the `disabled:` key), so `- id: preset-concerto` +
// `group: true` + `disabled: true` nested in a group's `config:` list was
// skipped as "provably disabled" while at runtime it mounted: rc=0, TWO live
// preset rows, `Duplicate agent preset: concerto` on the next boot. The leaf
// now refuses such a row — and the clause sits at the LEAF, not inside
// _provably_disabled, so the whole-subtree prune keeps working: a group whose
// `disabled` is honoured (falsy `group:`) still prunes, which is what case ④
// pins (mutating the prune's `return None` away turns ④ red — the walk then
// re-enters the disabled row with inside=False, finds the INNER group row, and
// refuses rows that genuinely cannot mount).
// THE TEETH (mutation, not belief):
//   • delete `and not _js_truthy(node.get('group'))` from the leaf test →
//     cases ① and ② go red on the exit status (the skipped row is exactly
//     what must be refused);
//   • delete the prune's `return None` → case ④ goes red.
// Case ③ is the OVER-FIX control: `group: false` + `disabled: true` is a row
// the Loader DOES honour as disabled — it must still install, so a guard that
// widened past the truthy side of `group:` cannot pass this suite either.
// ---------------------------------------------------------------------------
describe('T32 a nested target that declares itself a group is refused even disabled — the Loader ignores that disabled', () => {
  /** Nested target row carrying its OWN `group:` spelling, inside a plain
   *  `name: cordis:group` group row (which is not itself disabled). */
  const targetSelfGroup = (groupLine: string): string => [
    '- id: my-group',
    '  name: cordis:group',
    '  config:',
    `    - id: ${TARGET}`,
    `      name: '${PRESET_ROW_NAME}'`,
    groupLine,
    '      disabled: true',
    '      config:',
    '        id: concerto',
    '        plugins: []',
    '',
  ].join('\n')

  /** Shared refusal body — same zero-byte contract as T26's refuseShape. */
  function refuseSelfGroup(label: string, fixture: string): void {
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    writeFileSync(patchPath(sbx), fixture, 'utf8')
    const beforeBytes = readFileSync(patchPath(sbx))

    // Non-vacuity: the nested target really carries BOTH keys — `disabled`
    // (what the old leaf trusted) and a truthy `group` (what the Loader's
    // :335 short-circuit trusts over it).
    const nested = asJson(asArray(asJson(asArray(parseFile(patchPath(sbx)))[0]).config)[0])
    expect(nested.id, label).toBe(TARGET)
    expect(nested.disabled, label).toBe(true)
    expect(_jsTruthyProbe(nested.group), label).toBe(true)

    const r = runWithDsh(sbx)
    expect(r.status, `${label} — stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).not.toBe(0)
    expect(r.status, label).not.toBeNull()
    expect(r.stderr, label).toMatch(/^error: /m)
    expect(r.stderr, label).toContain('nested INSIDE the `config:` list of a')
    expect(r.stderr, label).toContain('`name: cordis:group`')
    expect(r.stderr, label).toContain('Duplicate agent preset: concerto')
    expect(r.stderr, label).toContain('Delete that nested row')
    expect(r.stdout, label).not.toContain('declared preset-concerto')
    // ZERO BYTES of the patch file, and not even a .bak — the guard runs
    // before the backup is written.
    expect(readFileSync(patchPath(sbx)).equals(beforeBytes), `${label}: bytes moved`).toBe(true)
    expect(readdirSync(dir).filter((n) => n.includes('.bak')), label).toEqual([])
    expect(countOccurrences(readFileSync(patchPath(sbx), 'utf8'), `- id: ${TARGET}`), label).toBe(1)
  }

  /** The JS-truthiness the guard's own `_js_truthy` encodes, restated here so
   *  the fixture is pinned against BOTH readings, not just the parser's. */
  function _jsTruthyProbe(v: unknown): boolean {
    if (v === null || v === false) return false
    if (Array.isArray(v) || typeof v === 'object') return true
    return Boolean(v)
  }

  it('① `group: true` + `disabled: true` on the nested target is refused — rc non-zero, zero bytes, no .bak', { timeout: 60_000 }, () => {
    const fixture = targetSelfGroup('      group: true')
    const nested = asJson(asArray(asJson(asArray(parseCordis(fixture, 'fixture'))[0]).config)[0])
    expect(nested.group, 'the fixture itself must parse `group` as boolean true').toBe(true)
    refuseSelfGroup('group: true + disabled: true', fixture)
  })

  it("② `group: 'true'` (quoted STRING) + `disabled: true` is refused too — YAML keeps the quote's type", { timeout: 60_000 }, () => {
    const fixture = targetSelfGroup("      group: 'true'")
    const nested = asJson(asArray(asJson(asArray(parseCordis(fixture, 'fixture'))[0]).config)[0])
    expect(typeof nested.group, 'the fixture itself must parse `group` as a string').toBe('string')
    refuseSelfGroup("group: 'true' + disabled: true", fixture)
  })

  it('③ the over-fix control: `group: false` + `disabled: true` IS provably disabled — it still installs', { timeout: 60_000 }, () => {
    const fixture = targetSelfGroup('      group: false')
    const nested = asJson(asArray(asJson(asArray(parseCordis(fixture, 'fixture'))[0]).config)[0])
    expect(nested.group, 'the fixture itself must parse `group` as boolean false').toBe(false)

    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    writeFileSync(patchPath(sbx), fixture, 'utf8')

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    const text = readFileSync(patchPath(sbx), 'utf8')
    // The disabled nested row stays exactly where the user wrote it (the cut
    // is blind to nested rows by design); the ONE live target row is the
    // installer's own declaration.
    expect(countOccurrences(text, `- id: ${TARGET}`)).toBe(2)
    expect(asArray(parseFile(patchPath(sbx))).filter(refsTarget)).toHaveLength(1)
    const live = targetRow(parseFile(patchPath(sbx)))
    expect(asJson(asJson(live).config).id).toBe('concerto')
    expect(pluginsOf(live).length).toBeGreaterThan(0)
    const second = runWithDsh(sbx)
    expect(second.status, `stderr:\n${second.stderr}`).toBe(0)
    expect(asArray(parseFile(patchPath(sbx))).filter(refsTarget)).toHaveLength(1)
    expect(countOccurrences(readFileSync(patchPath(sbx), 'utf8'), `- id: ${TARGET}`)).toBe(2)
  })

  it('④ the prune is real: a provably-disabled group prunes its whole subtree — a live target below an INNER group installs', { timeout: 60_000 }, () => {
    // `name: cordis:group` + `disabled: true` with a FALSY (absent) `group:`
    // — the Loader honours that disabled, so the disabled group mounts nothing
    // and NOTHING below it can duplicate. The old walk still descended through
    // the generic `for key` loop with inside=False, found the inner group and
    // refused the install over rows that provably cannot mount. Mutating the
    // prune's `return None` away turns THIS case red.
    const fixture = [
      '- id: outer-group',
      '  name: cordis:group',
      '  disabled: true',
      '  config:',
      '    - id: inner-group',
      '      name: cordis:group',
      '      config:',
      `        - id: ${TARGET}`,
      `          name: '${PRESET_ROW_NAME}'`,
      '          config:',
      '            id: concerto',
      '            plugins: []',
      '',
    ].join('\n')
    const sbx = makeSandbox({ dshVersion: '0.2.0-rc.2' })
    const dir = dirname(patchPath(sbx))
    mkdirSync(dir, { recursive: true })
    writeFileSync(patchPath(sbx), fixture, 'utf8')

    // Non-vacuity: without the prune this exact shape is the round-4 probe
    // that exited 1 — the nested target is ENABLED and lives under an inner
    // group, so every non-pruning walk finds it and refuses.
    const outer = asJson(asArray(parseCordis(fixture, 'fixture'))[0])
    expect(outer.disabled).toBe(true)
    expect(outer.name).toBe('cordis:group')

    const r = runWithDsh(sbx)
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0)
    expect(r.stdout).toContain('declared preset-concerto')
    const text = readFileSync(patchPath(sbx), 'utf8')
    // The disabled user subtree survives byte-for-byte (the cut never eats
    // user rows), and exactly ONE live target row — the installer's own.
    expect(text).toContain('- id: outer-group\n  name: cordis:group\n  disabled: true\n')
    expect(text).toContain('    - id: inner-group\n      name: cordis:group\n')
    expect(countOccurrences(text, `- id: ${TARGET}`)).toBe(2)
    expect(asArray(parseFile(patchPath(sbx))).filter(refsTarget)).toHaveLength(1)
    expect(targetRow(parseFile(patchPath(sbx)))).not.toBeNull()
    expect(pluginsOf(targetRow(parseFile(patchPath(sbx)))).length).toBeGreaterThan(0)
    // Idempotent over the same disabled subtree.
    const second = runWithDsh(sbx)
    expect(second.status, `stderr:\n${second.stderr}`).toBe(0)
    expect(countOccurrences(readFileSync(patchPath(sbx), 'utf8'), `- id: ${TARGET}`)).toBe(2)
    expect(asArray(parseFile(patchPath(sbx))).filter(refsTarget)).toHaveLength(1)
  })
})
