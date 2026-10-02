#!/usr/bin/env node
/**
 * scripts/vendor-manifest.mjs — vendor drift detection (P4-T4).
 *
 * Reads every `VENDOR-MANIFEST.json` under a package directory in
 * `patches/omo-dsh/vendor/` and answers the question the phase 1 vendoring
 * playbook leaves to §6: "has
 * anyone hand-edited a vendored file?". For every `files[]` entry it recomputes
 * the sha256 on disk and compares it with the recorded value, and it checks
 * the set in both directions (a file on disk that the manifest does not list is
 * drift too — so is a manifest entry with no file).
 *
 * Why a script now (the playbook said "not yet, wait for >= 3 packages"): the
 * second vendored package is here, and its manifest has 291 entries — a
 * hand-run "node -e" one-liner is no longer a reviewable operation. This is
 * the tool the playbook §6 deferred; it is NOT wired into a CI gate (gate
 * extension belongs to P4-T16 / the plan's 门 work). It is imported by
 * `tests/vendor/shared-skills-manifest.test.ts`, so the unit-test gate (门 2)
 * does run it on every `pnpm vitest run`.
 *
 * `origin: "verbatim"` entries are the drift-sensitive ones: any hash mismatch
 * means the vendored copy stopped being byte-identical to the tag. A mismatch
 * on a `modified` / `project-new` entry is equally a change, but it is the
 * expected shape for the declared deviations, so it is reported with its
 * deviation entry (if any) for review.
 *
 * Upstream comparison (`--upstream`, needs a local checkout of the OMO repo)
 * is deliberately NOT part of this script: this repo must stay self-contained
 * (playbook S-2 rejected a vitest alias into `~/GithubRepo/...` for exactly
 * that reason). Verifying "does this file still match the tag" stays a manual,
 * tag-side operation; this script pins the in-repo side.
 *
 * Usage:
 *   node scripts/vendor-manifest.mjs [--json] [--root <dir>] [packageDir…]
 * Exit: 0 = no drift, 1 = drift, 2 = usage error.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const USAGE = 'usage: node scripts/vendor-manifest.mjs [--json] [--root <dir>] [packageDir…]'

function parseArgs(argv) {
  const opts = { json: false, root: process.cwd(), dirs: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--root') {
      if (i + 1 >= argv.length) throw new Error(USAGE)
      opts.root = resolve(argv[++i])
    } else if (a.startsWith('--root=')) opts.root = resolve(a.slice('--root='.length))
    else if (a.startsWith('-')) throw new Error(USAGE)
    else opts.dirs.push(resolve(opts.root, a))
  }
  return opts
}

/** Dirs that are install artifacts, never vendored content (pnpm workspace). */
const SKIP_DIRS = new Set(['node_modules'])

/** Every vendored file under `dir`, recursively, as sorted posix-relative paths. */
export function listFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const entry of readdirSync(d).sort()) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(relative(dir, full).split('\\').join('/'))
    }
  }
  if (existsSync(dir)) walk(dir)
  return out.sort()
}

export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/** Directories under `patches/omo-dsh/vendor/` that carry a manifest. */
export function vendorPackageDirs(root) {
  const vendorRoot = join(root, 'patches/omo-dsh/vendor')
  if (!existsSync(vendorRoot)) return []
  return readdirSync(vendorRoot)
    .filter((e) => statSync(join(vendorRoot, e)).isDirectory())
    .map((e) => join(vendorRoot, e))
    .filter((d) => existsSync(join(d, 'VENDOR-MANIFEST.json')))
    .sort()
}

/**
 * Check one vendored package directory. Returns a pure report — no printing,
 * no exit code — so vitest can import it directly.
 */
export function checkVendorPackage(pkgDir) {
  const manifestFile = join(pkgDir, 'VENDOR-MANIFEST.json')
  if (!existsSync(manifestFile)) {
    return { package: pkgDir, ok: false, error: 'VENDOR-MANIFEST.json not found', files: 0, drift: [], missing: [], untracked: [] }
  }
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const entries = Array.isArray(manifest.files) ? manifest.files : []
  const onDisk = new Set(listFiles(pkgDir))

  const drift = []
  const missing = []
  for (const e of entries) {
    // The manifest cannot hash itself.
    if (e.sha256 === null || e.sha256 === undefined) continue
    const abs = join(pkgDir, e.path)
    if (!existsSync(abs)) {
      missing.push(e.path)
      continue
    }
    const actual = sha256File(abs)
    if (actual !== e.sha256) {
      const declared = (manifest.deviations ?? []).find((d) => d.path === e.path)
      drift.push({ path: e.path, origin: e.origin, expected: e.sha256, actual, declaredDeviation: Boolean(declared) })
    }
  }

  const tracked = new Set(entries.map((e) => e.path))
  const untracked = [...onDisk].filter((p) => !tracked.has(p)).sort()

  return {
    package: relative(process.cwd(), pkgDir).split('\\').join('/'),
    ok: drift.length === 0 && missing.length === 0 && untracked.length === 0,
    files: entries.length,
    counts: manifest.counts ?? null,
    drift,
    missing,
    untracked,
  }
}

/** Check every requested package (default: all vendor packages). */
export function checkAll(root, dirs) {
  const targets = dirs && dirs.length > 0 ? dirs : vendorPackageDirs(root)
  return targets.map((d) => checkVendorPackage(d))
}

export function reportPayload(reports) {
  const violations = []
  for (const r of reports) {
    if (r.error) violations.push(`${r.package}: ${r.error}`)
    for (const d of r.drift) violations.push(`${r.package}/${d.path}: sha256 drift (origin=${d.origin}${d.declaredDeviation ? ', deviation declared' : ''})`)
    for (const p of r.missing) violations.push(`${r.package}/${p}: listed in the manifest but absent on disk`)
    for (const p of r.untracked) violations.push(`${r.package}/${p}: on disk but absent from the manifest`)
  }
  return {
    pass: violations.length === 0,
    packages: reports.map((r) => ({ package: r.package, files: r.files, ok: r.ok })),
    files: reports.reduce((a, r) => a + r.files, 0),
    violations,
  }
}

function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(String(e.message ?? e))
    process.exit(2)
  }
  const reports = checkAll(opts.root, opts.dirs)
  const payload = reportPayload(reports)
  if (opts.json) {
    console.log(JSON.stringify(payload))
  } else {
    for (const p of payload.packages) console.log(`${p.ok ? 'OK  ' : 'DRIFT'} ${p.package} — ${p.files} files`)
    for (const v of payload.violations) console.log(`VIOLATION: ${v}`)
    console.log(`${payload.pass ? 'PASS' : 'FAIL'}: checked=${payload.files} · violations=${payload.violations.length}`)
  }
  process.exitCode = payload.pass ? 0 : 1
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) main()
