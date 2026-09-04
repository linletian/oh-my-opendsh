#!/usr/bin/env node
// scripts/check-docs-consistency.mjs — the review-proof lint (CI gate 7 /
// release-check gate 7). Turns the human review items into machine checks so
// a release can never ship with version tokens, matrix rows, or pin lines out
// of sync. Zero cost; no harness, no LLM.
//
// Checks:
//   d01 package.json version === .omo/compat.yaml our.latest
//   d02 tag_alias === 'v<major>.<minor>' of our.latest, and the installer
//       TAG pin equals it
//   d03 both READMEs' Current Status sections mention the tag_alias
//   d04 docs/compat-matrix*.md are current (renderer --check)
//   d05 no stray probe*.txt at the repo root (they belong in
//       .omo/evidence/manual-probes/ or nowhere — .gitignore lesson)
//   d06 CHANGELOG.md (when present): top version heading equals our.latest
//
// Usage: node scripts/check-docs-consistency.mjs [--json]
// Exit: 1 iff any check FAILs.

import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { REPO_ROOT, loadYamlDialect } from './doctor-lite.mjs'

function check(id, name, pass, detail = '') {
  return { id, name, pass: Boolean(pass), detail: String(detail) }
}

function statusSection(text, marker) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.startsWith(marker))
  if (start === -1) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}

async function run() {
  const results = []

  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
  const our = pkg.version

  let compat = null
  try {
    compat = await loadYamlDialect(join(REPO_ROOT, '.omo', 'compat.yaml'))
  } catch (e) {
    results.push(check('d01', 'package.json ↔ compat.yaml', false, `cannot read compat.yaml: ${e.message ?? e}`))
  }

  const latest = compat && compat.our && compat.our.latest
  const alias = compat && compat.our && compat.our.tag_alias

  results.push(check('d01', 'package.json ↔ compat.yaml', compat && our === latest,
    `package.json=${our}, compat our.latest=${latest}`))

  const mm = String(our).match(/^(\d+)\.(\d+)\.\d+$/)
  const wantAlias = mm ? `v${mm[1]}.${mm[2]}` : null
  const installer = (() => {
    try { return readFileSync(join(REPO_ROOT, 'scripts', 'install-concerto.sh'), 'utf8') } catch { return '' }
  })()
  const pin = installer.match(/^TAG="\$\{CONCERTO_TAG:-([^}]+)\}"/m)
  const aliasOk = wantAlias !== null && alias === wantAlias
  results.push(check('d02', 'tag alias + installer pin', aliasOk && pin && pin[1] === wantAlias,
    `our.latest=${our} → want alias ${wantAlias}; compat=${alias}; installer TAG=${pin ? pin[1] : 'MISSING'}`))

  const readmeEn = (() => {
    try { return readFileSync(join(REPO_ROOT, 'README.md'), 'utf8') } catch { return '' }
  })()
  const readmeZh = (() => {
    try { return readFileSync(join(REPO_ROOT, 'README_zh-CN.md'), 'utf8') } catch { return '' }
  })()
  const enSec = statusSection(readmeEn, '## Current Status')
  const zhSec = statusSection(readmeZh, '## 当前状态')
  results.push(check('d03', 'README status sections', Boolean(wantAlias) && enSec.includes(wantAlias) && zhSec.includes(wantAlias),
    `want "${wantAlias}" in both Current Status sections — en ${enSec.includes(wantAlias) ? 'OK' : 'MISSING'}, zh ${zhSec.includes(wantAlias) ? 'OK' : 'MISSING'}`))

  const renderCheck = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'render-compat-matrix.mjs'), '--check'],
    { cwd: REPO_ROOT, encoding: 'utf8' })
  results.push(check('d04', 'matrix render current', renderCheck.status === 0,
    (renderCheck.stderr || renderCheck.stdout || '').trim().split('\n')[0] || 'renderer exited ' + renderCheck.status))

  let strayProbes = []
  try {
    strayProbes = readdirSync(REPO_ROOT).filter((f) => /^probe.*\.txt$/.test(f))
  } catch { /* repo root unreadable → report as fail below */ }
  results.push(check('d05', 'no stray probe files', strayProbes.length === 0,
    strayProbes.length > 0 ? `repo root has: ${strayProbes.join(', ')} (move under .omo/evidence/manual-probes/ or delete)` : 'repo root clean'))

  let changelog = ''
  try { changelog = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8') } catch { /* not present yet — first release creates it */ }
  if (changelog === '') {
    results.push(check('d06', 'CHANGELOG top entry', true, 'CHANGELOG.md not present yet (created by the first release.sh run)'))
  } else {
    const top = changelog.split('\n').find((l) => /^## v/.test(l))
    const topVersion = top && top.match(/^## v(\d+\.\d+\.\d+)/)?.[1]
    results.push(check('d06', 'CHANGELOG top entry', topVersion === our,
      `top heading "${top}" vs package.json ${our}`))
  }

  // d07 — the Pages `install` wrapper must point at the alias raw URL
  // (PR #1 review F2: the two-hop install chain follows the alias exactly).
  let wrapper = ''
  try { wrapper = readFileSync(join(REPO_ROOT, 'install'), 'utf8') } catch { /* wrapper missing → fail below */ }
  const wantWrapperUrl = `https://raw.githubusercontent.com/linletian/oh-my-opendsh/${wantAlias}/scripts/install-concerto.sh`
  results.push(check('d07', 'install wrapper URL', wrapper.includes(wantWrapperUrl),
    wrapper === '' ? 'install wrapper file missing' : `want ${wantWrapperUrl}`))

  const json = process.argv.includes('--json')
  if (json) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    for (const r of results) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} — ${r.name}${r.detail ? `: ${r.detail}` : ''}`)
    }
    const failed = results.filter((r) => !r.pass).length
    console.log(`check-docs-consistency: ${results.length - failed}/${results.length} PASS${failed > 0 ? ` — ${failed} FAIL` : ''}`)
  }
  process.exit(results.some((r) => !r.pass) ? 1 : 0)
}

await run()
