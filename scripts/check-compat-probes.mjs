#!/usr/bin/env node
// scripts/check-compat-probes.mjs — the cloud sentinel (weekly `compat-probe`
// workflow + manual dispatch). Zero secrets, zero LLM: it asks the npm
// registry for the latest @deepseek-ai/dsh and oh-my-openagent versions,
// compares them with every dsh/omo value already recorded in .omo/compat.yaml
// (tested OR untested rows), and opens ONE GitHub issue labeled `compat-probe`
// per NEW version, containing the local probe instructions — unless an open
// issue with that version in its title already exists (dedup). The actual
// verification stays local: scripts/compat-probe.sh + concerto_verify.
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

function npmLatest(pkg) {
  try { return exec(`npm view "${pkg}" version`) } catch { throw new Error(`npm view ${pkg} failed`) }
}

function normalizeOmo(v) {
  return String(v).match(/^\d+\.\d+\.\d+/)?.[0] ?? String(v)
}

function issueBody(repo, branch, pkg, version) {
  const base = `https://github.com/${repo}/blob/${branch}`
  return [
    `## ${pkg} \`${version}\` is newer than anything in the compat matrix`,
    '',
    'The weekly compat-probe sentinel found an upstream version that no matrix row (tested or untested) covers yet.',
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

  const dshLatest = npmLatest('@deepseek-ai/dsh')
  const omoLatest = npmLatest('oh-my-openagent')

  const candidates = []
  if (!coveredDsh.has(dshLatest)) candidates.push({ pkg: '@deepseek-ai/dsh', version: dshLatest })
  if (!coveredOmo.has(normalizeOmo(omoLatest))) candidates.push({ pkg: 'oh-my-openagent', version: omoLatest })

  if (candidates.length === 0) {
    console.log(`compat-probe: nothing new — matrix already covers dsh ${dshLatest} and omo ${omoLatest}`)
    return
  }

  let openTitles = ''
  try {
    openTitles = exec(`gh issue list --repo "${repo}" --label compat-probe --state open --json title -q '.[].title' || true`)
  } catch { /* gh issue list failing → fall through to create attempt */ }

  let created = 0
  const branch = process.env.GITHUB_REF_NAME || 'feature/dsh-omo-mvp'
  for (const c of candidates) {
    if (openTitles.includes(c.version)) {
      console.log(`compat-probe: open issue already exists for ${c.pkg} ${c.version} — skipping`)
      continue
    }
    const tmp = mkdtempSync(join(tmpdir(), 'compat-probe-'))
    const bodyFile = join(tmp, 'body.md')
    writeFileSync(bodyFile, issueBody(repo, branch, c.pkg, c.version))
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
