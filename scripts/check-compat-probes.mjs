#!/usr/bin/env node
// scripts/check-compat-probes.mjs — the cloud sentinel (weekly `compat-probe`
// workflow + manual dispatch). Zero secrets, zero LLM: it asks the npm
// registry for EVERY dist-tag of @deepseek-ai/dsh and oh-my-openagent
// (latest/next/alpha/… — a successor on a non-latest tag must not be
// invisible, PR #12 review), compares them with every dsh/omo value already
// recorded in .omo/compat.yaml (tested OR untested rows), and opens ONE
// GitHub issue labeled `compat-probe` per NEW version, containing the local
// probe instructions — unless an open issue with that version in its title
// already exists (dedup). The actual verification stays local:
// scripts/compat-probe.sh + concerto_verify.
//
// Usage: node scripts/check-compat-probes.mjs
// Env: COMPAT_PROBE_REPO overrides the repo derived from the git remote.
// Exit: 0 when nothing new or the issues already exist; non-zero on an
// unexpected failure (registry unreachable, gh missing, …).

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REPO_ROOT, loadYamlDialect } from './doctor-lite.mjs'

const exec = (cmd, opts = {}) => execFileSync('sh', ['-c', cmd], { encoding: 'utf8', ...opts }).trim()

function repoName() {
  if (process.env.COMPAT_PROBE_REPO) return process.env.COMPAT_PROBE_REPO
  const url = exec('git config --get remote.origin.url || true')
  const m = url.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/)
  if (!m) throw new Error(`cannot derive GitHub repo from remote "${url}" — set COMPAT_PROBE_REPO`)
  return m[1]
}

function npmDistTagVersions(pkg) {
  // EVERY dist-tag, not just `latest`: `npm view <pkg> version` only answers
  // the latest dist-tag, so a successor published to alpha/next leaves the
  // sentinel printing "nothing new" forever (PR #12 review — measured:
  // dist-tags {alpha: 0.2.1-alpha.1, next: 0.2.0-rc.2, latest: 0.2.0-rc.2}
  // while the matrix covered only 0.2.0-rc.2 and no issue existed).
  let raw
  try { raw = exec(`npm view "${pkg}" dist-tags --json`) } catch { throw new Error(`npm view ${pkg} dist-tags failed`) }
  let parsed
  try { parsed = JSON.parse(raw) } catch { throw new Error(`npm view ${pkg} dist-tags returned non-JSON: ${raw.slice(0, 120)}`) }
  return Object.entries(parsed).map(([tag, version]) => ({ tag, version: String(version) }))
}

function normalizeOmo(v) {
  return String(v).match(/^\d+\.\d+\.\d+/)?.[0] ?? String(v)
}

// Just enough semver for the drift filter: MAJOR.MINOR.PATCH, then the
// prerelease chain (numeric identifiers compare numerically, alphanumeric
// lexically, numeric < alphanumeric, and a prerelease is OLDER than the same
// triple without one). Returns null when either side does not parse.
function semverCompare(a, b) {
  const parse = (v) => {
    const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/)
    if (!m) return null
    return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] }
  }
  const x = parse(a); const y = parse(b)
  if (!x || !y) return null
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i]
  if (x.pre.length === 0 && y.pre.length === 0) return 0
  if (x.pre.length === 0) return 1
  if (y.pre.length === 0) return -1
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined) return -1
    if (y.pre[i] === undefined) return 1
    const nx = Number(x.pre[i]); const ny = Number(y.pre[i])
    const ix = Number.isInteger(nx) && String(nx) === x.pre[i]
    const iy = Number.isInteger(ny) && String(ny) === y.pre[i]
    if (ix && iy) { if (nx !== ny) return nx - ny } else if (ix) return -1
    else if (iy) return 1
    else if (x.pre[i] !== y.pre[i]) return x.pre[i] < y.pre[i] ? -1 : 1
  }
  return 0
}

// A dist-tag pointing at an OLD version is not drift: omo's `next` tag sat on
// 4.5.12 long after the matrix's frozen 4.19.4 baseline (measured 2026-10-07)
// — "not covered" alone would file an issue for a version OLDER than what the
// matrix already covers. Only versions newer than the newest covered one are
// worth an issue; unparseable versions stay candidates (drift visibility
// beats silence).
function newerThanAnyCovered(version, covered) {
  const max = [...covered].reduce((acc, v) => {
    const c = semverCompare(v, acc)
    return c !== null && c > 0 ? v : acc
  }, '0.0.0')
  const cmp = semverCompare(version, max)
  return cmp === null || cmp > 0
}

function issueBody(repo, branch, pkg, version, tag) {
  const base = `https://github.com/${repo}/blob/${branch}`
  return [
    `## ${pkg} \`${version}\` is newer than anything in the compat matrix`,
    '',
    `The weekly compat-probe sentinel found an upstream version (published to the \`${tag}\` dist-tag) that no matrix row (tested or untested) covers yet.`,
    '',
    '**Local verification (no cloud, no secrets — per D13):**',
    '',
    '```bash',
    `scripts/compat-probe.sh ${version}`,
    '```',
    '',
    'Then the one manual real-model step the script prints, and finally:',
    `1. move the row to \`tested\` in [\`.omo/compat.yaml\`](${base}/.omo/compat.yaml) (or register it \`untested\` if the probe is deferred)`,
    '2. `node scripts/render-compat-matrix.mjs`',
    '3. commit (conventional prefix `chore:` or `feat:`)',
    '',
    `For dsh bumps this row also gates the D7 CI pin flip in [\`.github/workflows/ci.yml\`](${base}/.github/workflows/ci.yml) (\`DSH_VERSION\`).`,
    '',
    `Full process: [docs/release-process.md](${base}/docs/release-process.md) / [docs/release-process_zh-CN.md](${base}/docs/release-process_zh-CN.md).`,
  ].join('\n')
}

async function main() {
  const repo = repoName()
  const compat = await loadYamlDialect(join(REPO_ROOT, '.omo', 'compat.yaml'))
  const rows = [...(compat.tested ?? []), ...(compat.untested ?? [])]
  const coveredDsh = new Set(rows.map((r) => String(r.dsh ?? '')).filter(Boolean))
  const coveredOmo = new Set(rows.map((r) => normalizeOmo(r.omo)).filter(Boolean))

  const dshTags = npmDistTagVersions('@deepseek-ai/dsh')
  const omoTags = npmDistTagVersions('oh-my-openagent')

  // One candidate per uncovered, genuinely NEWER version (several tags may
  // carry the same one; a stale tag pointing backwards is not drift).
  const candidates = []
  const seen = new Set()
  for (const { tag, version } of dshTags) {
    if (!coveredDsh.has(version) && newerThanAnyCovered(version, coveredDsh) && !seen.has(version)) {
      seen.add(version)
      candidates.push({ pkg: '@deepseek-ai/dsh', version, tag })
    }
  }
  for (const { tag, version } of omoTags) {
    const norm = normalizeOmo(version)
    if (!coveredOmo.has(norm) && newerThanAnyCovered(norm, coveredOmo) && !seen.has(`omo:${norm}`)) {
      seen.add(`omo:${norm}`)
      candidates.push({ pkg: 'oh-my-openagent', version, tag })
    }
  }

  if (candidates.length === 0) {
    const watched = (tags) => tags.map((t) => `${t.tag}=${t.version}`).join(', ')
    console.log(`compat-probe: nothing new — matrix covers every dist-tag (dsh: ${watched(dshTags)}; omo: ${watched(omoTags)})`)
    return
  }

  let openTitles = ''
  try {
    openTitles = exec(`gh issue list --repo "${repo}" --label compat-probe --state open --json title -q '.[].title' || true`)
  } catch { /* gh issue list failing → fall through to create attempt */ }

  let created = 0
  const branch = process.env.GITHUB_REF_NAME || 'main'
  for (const c of candidates) {
    if (openTitles.includes(c.version)) {
      console.log(`compat-probe: open issue already exists for ${c.pkg} ${c.version} — skipping`)
      continue
    }
    const tmp = mkdtempSync(join(tmpdir(), 'compat-probe-'))
    const bodyFile = join(tmp, 'body.md')
    writeFileSync(bodyFile, issueBody(repo, branch, c.pkg, c.version, c.tag))
    try {
      exec(`gh issue create --repo "${repo}" --label compat-probe --title "compat-probe: ${c.pkg} ${c.version} untested" --body-file "${bodyFile}"`)
      created++
      console.log(`compat-probe: opened issue for ${c.pkg} ${c.version}`)
    } catch (e) {
      console.error(`compat-probe: gh issue create failed for ${c.pkg} ${c.version}: ${e.message ?? e}`)
      process.exitCode = 1
    }
  }
  if (created > 0) console.log(`compat-probe: ${created} issue(s) created in ${repo}`)
}

await main()
