#!/usr/bin/env node
// scripts/release-bump.mjs — the file-edit engine behind scripts/release.sh.
// Applies ONE release's version tokens across every file the release
// convention touches (docs/release-process §6/§7):
//   package.json version, scripts/install-concerto.sh TAG pin, the README x2
//   Current Status lines, .omo/compat.yaml (our.latest / tag_alias + a new
//   `tested` row), CHANGELOG.md top entry — then re-renders
//   docs/compat-matrix*.md.
//
// Usage: node scripts/release-bump.mjs <new-semver> <new-alias> [--dry-run]
// Old values are read from the CURRENT files, never from arguments. Every
// replacement must match exactly once, and the new alias must be the
// v<major>.<minor> of the new semver — otherwise the script aborts WITHOUT
// writing anything (all-or-nothing).

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { REPO_ROOT } from './doctor-lite.mjs'

const PACKAGE = join(REPO_ROOT, 'package.json')
const INSTALLER = join(REPO_ROOT, 'scripts', 'install-concerto.sh')
const README_EN = join(REPO_ROOT, 'README.md')
const README_ZH = join(REPO_ROOT, 'README_zh-CN.md')
const COMPAT = join(REPO_ROOT, '.omo', 'compat.yaml')
const CHANGELOG = join(REPO_ROOT, 'CHANGELOG.md')

const exec = (cmd) => execFileSync('sh', ['-c', cmd], { encoding: 'utf8', cwd: REPO_ROOT }).trim()

function cmp(a, b) {
  const [a1, a2, a3] = a.split('.').map(Number)
  const [b1, b2, b3] = b.split('.').map(Number)
  return (a1 - b1) || (a2 - b2) || (a3 - b3)
}

function statusLineReplace(text, oldAlias, newAlias) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.startsWith('## Current Status') || l.startsWith('## 当前状态'))
  if (start === -1) throw new Error('Current Status section not found')
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break }
  }
  const hits = []
  for (let i = start; i < end; i++) {
    if (lines[i].startsWith('🟢 ') && lines[i].includes(oldAlias)) hits.push(i)
  }
  if (hits.length !== 1) throw new Error(`expected exactly 1 status line containing ${oldAlias}, found ${hits.length}`)
  lines[hits[0]] = lines[hits[0]].split(oldAlias).join(newAlias)
  return lines.join('\n')
}

function changelogEntries() {
  // Since the previous tag (prefer a full vX.Y.Z tag; fall back to any tag —
  // the first release after v0.1 has only the moving alias).
  let lastTag = ''
  try {
    const full = exec("git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-creatordate | head -1")
    if (full !== '') lastTag = full
  } catch { /* no tags */ }
  if (lastTag === '') {
    try { lastTag = exec('git describe --tags --abbrev=0') } catch { lastTag = '' }
  }
  const range = lastTag === '' ? '' : `${lastTag}..HEAD`
  const out = exec(`git log ${range} --pretty=format:'- %s' --max-count=60`)
  return out.split('\n').filter((l) => l.trim() !== '').join('\n')
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function freshestEvidence() {
  const out = exec('find .omo/evidence -maxdepth 2 -name "*verify*.md" -print | xargs -r ls -t 2>/dev/null | head -1 || true')
  return out === '' ? '.omo/evidence/verify-<run>.md' : out
}

function dshVersion() {
  try { return exec('dsh --version') } catch { return 'unknown' }
}

function omoVersion() {
  try { return exec('npm view oh-my-openagent version 2>/dev/null') } catch { return 'unknown' }
}

function main() {
  const argv = process.argv.slice(2)
  const newSemver = argv[0]
  const newAlias = argv[1]
  const dryRun = argv.includes('--dry-run')
  if (!/^\d+\.\d+\.\d+$/.test(newSemver ?? '')) {
    console.error('usage: node scripts/release-bump.mjs <new-semver> <new-alias> [--dry-run]')
    process.exit(64)
  }
  const mm = newSemver.match(/^(\d+)\.(\d+)\.\d+$/)
  const wantAlias = `v${mm[1]}.${mm[2]}`
  if (newAlias !== wantAlias) {
    console.error(`new alias must be ${wantAlias} for semver ${newSemver} (got ${newAlias})`)
    process.exit(64)
  }

  const pkg = JSON.parse(readFileSync(PACKAGE, 'utf8'))
  const oldSemver = pkg.version
  if (cmp(newSemver, oldSemver) <= 0) {
    console.error(`new version ${newSemver} must be greater than current ${oldSemver}`)
    process.exit(64)
  }

  const compatText = readFileSync(COMPAT, 'utf8')
  const oldAlias = compatText.match(/^\s*tag_alias:\s*"([^"]+)"/m)[1]
  const date = today()

  // Build every mutation first; apply only if all of them are well-formed.
  const mutations = []

  const newPkg = { ...pkg, version: newSemver }
  mutations.push({ file: PACKAGE, label: 'package.json version', before: oldSemver, write: () => writeFileSync(PACKAGE, JSON.stringify(newPkg, null, 2) + '\n') })

  const installerText = readFileSync(INSTALLER, 'utf8')
  const tagLine = `TAG="\${CONCERTO_TAG:-${oldAlias}}"`
  if (!installerText.includes(tagLine)) throw new Error(`installer TAG line not found: ${tagLine}`)
  mutations.push({
    file: INSTALLER, label: `installer TAG pin → ${newAlias}`, before: tagLine,
    write: () => writeFileSync(INSTALLER, installerText.replace(tagLine, `TAG="\${CONCERTO_TAG:-${newAlias}}"`)),
  })

  const enText = readFileSync(README_EN, 'utf8')
  const zhText = readFileSync(README_ZH, 'utf8')
  const enNew = statusLineReplace(enText, oldAlias, newAlias)
  const zhNew = statusLineReplace(zhText, oldAlias, newAlias)
  mutations.push({ file: README_EN, label: 'README.md status token', before: oldAlias, write: () => writeFileSync(README_EN, enNew) })
  mutations.push({ file: README_ZH, label: 'README_zh-CN.md status token', before: oldAlias, write: () => writeFileSync(README_ZH, zhNew) })

  // compat.yaml: bump our block + insert the new tested row right after `tested:`.
  const dsh = dshVersion()
  const omo = omoVersion()
  const evidence = freshestEvidence()
  const row = [
    `  - our: "${newSemver}"`,
    `    dsh: "${dsh}"`,
    `    omo: "${omo}"`,
    `    date: "${date}"`,
    `    evidence: "${evidence}"`,
    `    note_en: "released ${newAlias} (release.sh)"`,
    `    note_zh: "发布 ${newAlias}（release.sh 自动登记）"`,
    '',
  ].join('\n')
  let compatNew = compatText
  if (!compatNew.includes(`latest: "${oldSemver}"`)) throw new Error(`compat.yaml our.latest line not found (want latest: "${oldSemver}")`)
  compatNew = compatNew.replace(`latest: "${oldSemver}"`, `latest: "${newSemver}"`)
  if (!compatNew.includes(`tag_alias: "${oldAlias}"`)) throw new Error(`compat.yaml tag_alias line not found (want tag_alias: "${oldAlias}")`)
  compatNew = compatNew.replace(`tag_alias: "${oldAlias}"`, `tag_alias: "${newAlias}"`)
  if (!/^tested:\s*$/m.test(compatNew)) throw new Error('compat.yaml `tested:` block not found')
  compatNew = compatNew.replace(/^tested:\s*$/m, `tested:\n${row}`)
  mutations.push({ file: COMPAT, label: 'compat.yaml our block + tested row', before: 'compat.yaml', write: () => writeFileSync(COMPAT, compatNew) })

  // CHANGELOG.md: create if missing, then prepend the new release section.
  let changelogText = ''
  try { changelogText = readFileSync(CHANGELOG, 'utf8') } catch { /* created by the first release */ }
  const entries = changelogEntries()
  const section = `## v${newSemver} (${date})\n\n${entries || '- (no conventional commits in range)'}\n\n`
  const existing = changelogText.replace(/^# Changelog\s*\n?/, '')
  const changelogNew = `# Changelog\n\n${section}${existing}`
  mutations.push({ file: CHANGELOG, label: 'CHANGELOG.md top entry', before: 'CHANGELOG.md', write: () => writeFileSync(CHANGELOG, changelogNew) })

  if (dryRun) {
    console.log(`release-bump --dry-run: ${oldSemver} → ${newSemver} (alias ${oldAlias} → ${newAlias})`)
    for (const m of mutations) console.log(`  would update ${m.file.replace(REPO_ROOT + '/', '')} (${m.label})`)
    console.log('  would re-render docs/compat-matrix*.md')
    console.log('  new tested row: dsh=' + dsh + ', omo=' + omo + ', date=' + date + ', evidence=' + evidence)
    return
  }

  for (const m of mutations) m.write()
  exec('node scripts/render-compat-matrix.mjs')
  console.log(`release-bump: bumped ${oldSemver} → ${newSemver} (alias ${oldAlias} → ${newAlias})`)
  console.log(`  files: package.json, install-concerto.sh, README x2, .omo/compat.yaml, CHANGELOG.md, docs/compat-matrix*.md`)
  console.log(`  new tested row: dsh=${dsh}, omo=${omo}, date=${date}`)
}

main()
