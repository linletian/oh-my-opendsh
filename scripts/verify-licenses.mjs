#!/usr/bin/env node
/**
 * scripts/verify-licenses.mjs — license gate (plan T3, PRD AC-8).
 *
 * Scans the pnpm lockfile + all in-repo package.json files and verifies every
 * resolvable dependency license against the allowlist. Exit 0 = PASS,
 * exit 1 = violations (or cannot verify), exit 2 = usage error.
 *
 * SOURCE CHOICE (documented per T3):
 *   pnpm-lock.yaml v9 carries NO license metadata (packages entries only have
 *   resolution/integrity/engines), so the reliable license source is the
 *   installed packages' own manifests:
 *     - node_modules/<pkg>/package.json             (top-level, incl. @scope)
 *     - node_modules/.pnpm/<store>/node_modules/<pkg>/package.json (virtual store)
 *     - in-repo package.json files                  (our own packages' "license")
 *   The lockfile "packages:" section is used ONLY to enumerate the locked
 *   universe; entries absent from node_modules (platform-specific optional
 *   deps pnpm did not install on this host, e.g. darwin/win32 bindings) are
 *   reported as "skipped" and never fail the gate.
 *
 * ALLOWLIST (plan T3 + task spec): MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause,
 * ISC, 0BSD, CC0-1.0, MIT-0, Unicode-DFS-2016, BlueOak-1.0.0, Python-2.0.
 * SUL-1.0 is allowed ONLY when the package name contains "omo" or
 * "oh-my-openagent". License expressions: "X OR Y" passes if any branch is
 * allowed; "X AND Y" requires all branches.
 *
 * EXTENSION BEYOND THE PLAN'S LIST — MPL-2.0 (see UNIVERSAL_WHITELIST below):
 *   vite@8.2.1 (a hard dependency of vitest@4, declared in its
 *   "dependencies") hard-depends on lightningcss@1.33.0, which is MPL-2.0
 *   (plus its platform binding lightningcss-linux-x64-gnu@1.33.0). Without
 *   this entry the gate FAILS on the current tree, contradicting T3's
 *   acceptance criterion "当前仓库 PASS". MPL-2.0 is weak file-level
 *   copyleft consumed here purely as a build-time dependency. DECIDED:
 *   decision D12 (docs/decisions.md / docs/decisions_zh-CN.md, 2026-08-19)
 *   accepts MPL-2.0 into the whitelist — the authoritative record lives
 *   there; this comment is only the implementation note. If the policy is
 *   ever reversed: delete the entry below and pin/replace vite.
 *
 * Usage:
 *   scripts/verify-licenses.sh [--json] [--root <dir>]
 *   node scripts/verify-licenses.mjs [--json] [--root <dir>]
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

const UNIVERSAL_WHITELIST = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'MIT-0',
  'Unicode-DFS-2016',
  'BlueOak-1.0.0',
  'Python-2.0',
  // EXTENSION beyond plan T3 whitelist — see header comment for rationale.
  // Remove this single line if MPL-2.0 is rejected.
  'MPL-2.0',
]);

/**
 * SUL-1.0 is allowed only for packages whose name matches this pattern:
 * a whole-word "omo" (start/end or a non-letter boundary — rejects loose
 * substrings like "comodo", "promo", "omocha") or the "oh-my-openagent" name.
 * R2-4: the previous /omo|oh-my-openagent/i matched any "omo" substring.
 */
export const SUL_ALLOWED_NAME = /(^|[^a-z])omo([^a-z]|$)|oh-my-openagent/i;

/** Dirs the in-repo walk never descends into (incl. `.codegraph` symlink). */
const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.omo', '.codegraph', 'dist']);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  console.error('usage: node scripts/verify-licenses.mjs [--json] [--root <dir>]');
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { json: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--root') {
      if (i + 1 >= argv.length) usage();
      opts.root = resolve(argv[++i]);
    } else if (arg.startsWith('--root=')) {
      opts.root = resolve(arg.slice('--root='.length));
    } else {
      usage();
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Filesystem helpers (follow symlinks deliberately — pnpm layout is symlink-heavy)
// ---------------------------------------------------------------------------

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readManifest(file) {
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (pkg && typeof pkg.name === 'string') return pkg;
  } catch {
    // unreadable / invalid manifest — not a package root we can check
  }
  return null;
}

// ---------------------------------------------------------------------------
// License expression evaluation
// ---------------------------------------------------------------------------

function licenseStrings(pkg) {
  const raw = pkg.license ?? pkg.licenses;
  if (raw == null) return [];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) {
    const out = [];
    for (const entry of raw) {
      const t = typeof entry === 'string' ? entry : entry?.type;
      if (typeof t === 'string') out.push(t);
    }
    return out;
  }
  if (typeof raw === 'object') {
    const t = raw.type ?? raw.name;
    return typeof t === 'string' ? [t] : [];
  }
  return [];
}

export function tokenAllowed(token, pkgName) {
  const t = token.trim().replace(/^\(+|\)+$/g, '').trim();
  if (!t) return false;
  if (UNIVERSAL_WHITELIST.has(t)) return true;
  if (t === 'SUL-1.0' && SUL_ALLOWED_NAME.test(pkgName)) return true;
  return false;
}

/**
 * SPDX expression precedence (spec v2.3 Annex D): AND binds tighter than OR.
 * R2-1: evaluate top-level AND-groups FIRST (every group must hold), then
 * allow any OR branch within each group (some). The previous order split OR
 * first, so `(MIT OR Apache-2.0) AND GPL-2.0` passed on the `(MIT` branch
 * without ever checking GPL-2.0. Parens are stripped per-token in
 * tokenAllowed (existing behavior). Hand-rolled and sufficient for the
 * license shapes package.json actually carries (single ids, "X OR Y",
 * parenthesized AND/OR groups); it is not a full SPDX parser.
 */
export function exprAllowed(expr, pkgName) {
  return expr
    .split(/\sAND\s/i)
    .every((group) => group.split(/\sOR\s/i).some((branch) => tokenAllowed(branch, pkgName)));
}

/** Legacy `licenses` arrays mean "either of these" — OR semantics. */
function licensesAllowed(strings, pkgName) {
  if (strings.length === 0) return false;
  return strings.some((s) => exprAllowed(s, pkgName));
}

// ---------------------------------------------------------------------------
// Collection: node_modules + in-repo package.json files
// ---------------------------------------------------------------------------

function collectManifest(file, out) {
  const pkg = readManifest(file);
  if (!pkg) return;
  const key = `${pkg.name}@${pkg.version ?? 'local'}`;
  if (out.has(key)) return;
  out.set(key, {
    name: pkg.name,
    version: pkg.version ?? 'local',
    licenses: licenseStrings(pkg),
  });
}

/** One package-directory level (handles @scope) — does NOT recurse. */
function collectFromDir(dir, out) {
  for (const entry of safeReaddir(dir)) {
    const full = join(dir, entry);
    if (!isDir(full)) continue;
    if (entry.startsWith('@')) {
      for (const sub of safeReaddir(full)) {
        collectManifest(join(full, sub, 'package.json'), out);
      }
    } else {
      collectManifest(join(full, 'package.json'), out);
    }
  }
}

function collectNodeModules(nmRoot, out) {
  collectFromDir(nmRoot, out); // top-level (direct deps + hoisted)
  const store = join(nmRoot, '.pnpm');
  for (const entry of safeReaddir(store)) {
    const sub = join(store, entry, 'node_modules');
    if (isDir(sub)) collectFromDir(sub, out);
  }
}

function walkRepoPackageFiles(dir, out) {
  for (const entry of safeReaddir(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (!isDir(full)) {
      if (entry === 'package.json') collectManifest(full, out);
      continue;
    }
    walkRepoPackageFiles(full, out);
  }
}

// ---------------------------------------------------------------------------
// Lockfile universe (hand-rolled line parser — v9 has no license metadata)
// ---------------------------------------------------------------------------

function parseLockfileUniverse(file) {
  const out = new Map();
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  let inPackages = false;
  for (const line of content.split('\n')) {
    if (line === 'packages:') {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (line === '') continue; // blank line right after "packages:" header
    if (!line.startsWith('  ')) break; // next top-level section
    const m = line.match(/^  ['"]?(@?[^'"@]*@[^'":]+)['"]?:/);
    if (!m) continue;
    const key = m[1];
    const at = key.lastIndexOf('@');
    if (at <= 0) continue;
    const name = key.slice(0, at);
    const version = key.slice(at + 1).replace(/\(.*\)$/, ''); // drop (patch_hash=…)
    out.set(`${name}@${version}`, { name, version });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = opts.root;
  const lockfile = join(root, 'pnpm-lock.yaml');
  const nodeModules = join(root, 'node_modules');

  const universe = parseLockfileUniverse(lockfile);

  if (!existsSync(nodeModules) && universe.size > 0) {
    return report(opts, {
      checked: 0,
      violations: [
        'cannot verify: node_modules not installed — run `pnpm install` first',
      ],
      skippedKeys: [...universe.keys()],
    });
  }

  const found = new Map();
  if (existsSync(nodeModules)) collectNodeModules(nodeModules, found);
  walkRepoPackageFiles(root, found);

  const violations = [];
  const sorted = [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, rec] of sorted) {
    if (!licensesAllowed(rec.licenses, rec.name)) {
      violations.push(`${key}: ${rec.licenses.join(' OR ') || 'MISSING'}`);
    }
  }

  const skippedKeys = [...universe.keys()].filter((k) => !found.has(k));
  return report(opts, { checked: found.size, violations, skippedKeys });
}

/**
 * Pure payload for the --json report (R2-3): exposes the skipped lockfile-only
 * packages by count AND sorted names — the text report keeps its previous
 * count-only shape.
 */
export function reportPayload({ checked, violations, skippedKeys }) {
  return {
    pass: violations.length === 0,
    violations,
    checked,
    skipped: skippedKeys.length,
    skippedNames: [...skippedKeys].sort((a, b) => a.localeCompare(b)),
  };
}

function report(opts, { checked, violations, skippedKeys }) {
  if (opts.json) {
    console.log(JSON.stringify(reportPayload({ checked, violations, skippedKeys })));
  } else {
    for (const v of violations) console.log(`VIOLATION: ${v}`);
    const skipNote = skippedKeys.length > 0
      ? ` · skipped(lockfile-only, not installed)=${skippedKeys.length}`
      : '';
    if (violations.length > 0) {
      console.log(`FAIL: ${violations.length} violation(s) · checked=${checked}${skipNote}`);
    } else {
      console.log(`PASS: checked=${checked} · violations=0${skipNote}`);
    }
  }
  return violations.length === 0 ? 0 : 1;
}

// Main guard: importing this module (e.g. from vitest) is side-effect free.
const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  process.exitCode = main()
}
