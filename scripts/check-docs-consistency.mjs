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
//   d07 the Pages `install` wrapper points at the current alias raw URL
//       (PR #1 review F2)
//   d08 EVERY live raw-URL pointer names the current alias — not just the
//       wrapper. Scoped to the raw-URL shape so historical `v0.1` prose in the
//       CHANGELOG and review records is never rewritten to match today.
//   d09 the D7 `--before` cutoffs on the two dsh install lines are WELL-SHAPED
//       and IDENTICAL (PR #9 round 2, N6). The pin is two tokens carried by two
//       files; the drift that motivated the check was ci.yml sitting on a
//       mixed-tree cutoff while compat-probe.yml claimed the same value.
//   d10 the alias TAG's own copy of the installer carries the declaration
//       face (DECL_PATCH) and NOT the deleted .agent-presets write target —
//       the pointer checks (d02/d07/d08) cannot see a stale alias serving the
//       dead face (PR #12 review BLOCKER). Red until the post-merge release
//       moves the alias; that red is the enforcement.
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

  // d08 — EVERY live pointer must name the CURRENT alias, not just the wrapper.
  //
  // d07 checks one file. The alias is quoted in seven more places (both READMEs'
  // fallback direct link, both install guides, the installer's own usage
  // header), and `release-bump.mjs` rewrites only the wrapper and the installer
  // TAG — so every minor bump silently leaves the rest pointing at the previous
  // line. v0.2.0 exposed it: the published one-liner AND the documented fallback
  // both still fetched `v0.1`, i.e. the pre-upgrade preset that cannot mount on
  // the pinned dsh.
  //
  // Scoped to the raw-URL form on purpose: that shape only ever appears as a
  // live pointer, while plain `v0.1` prose is how the CHANGELOG and the review
  // records write HISTORY, which must never be rewritten to match today.
  const aliasScan = spawnSync(
    'git',
    ['grep', '-n', '-E', 'raw\\.githubusercontent\\.com/linletian/oh-my-opendsh/v[0-9]+\\.[0-9]+/', '--', '.'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  const pointerLines = (aliasScan.stdout ?? '').split('\n').filter((line) => line.trim() !== '')
  const stalePointers = pointerLines.filter((line) => !line.includes(`/oh-my-opendsh/${wantAlias}/`))
  results.push(check(
    'd08',
    'live raw-URL pointers use the current alias',
    stalePointers.length === 0,
    stalePointers.length === 0
      ? `${String(pointerLines.length)} pointer(s) all name ${wantAlias}`
      : stalePointers
        .map((line) => {
          const [file, lineNo] = line.split(':')
          return `${file}:${lineNo} does not name ${wantAlias}`
        })
        .join('; '),
  ))

  // d09 — the D7 --before cutoffs agree and are well-shaped (PR #9 round 2, N6).
  //
  // The pin is TWO tokens (version + cutoff) spread over two files, and nothing
  // compared them: the values could drift apart silently, and an ill-shaped
  // value (a truncation, a stray token) only surfaces as an `install dsh`
  // ETARGET on a CI runner. Both facts are cheap to assert here. Only lines that
  // really are the npm install command are read — the headers deliberately
  // quote OLD cutoffs as history, and those must never be mistaken for
  // configuration.
  const CUTOFF_RE = /--before=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z)/g
  const cutoffValues = (file) => {
    let text = ''
    try { text = readFileSync(join(REPO_ROOT, file), 'utf8') } catch { return null }
    const values = []
    for (const line of text.split('\n')) {
      if (!line.includes('npm install') || !line.includes('--before=')) continue
      for (const match of line.matchAll(CUTOFF_RE)) values.push(match[1])
    }
    return values
  }
  const ciCutoffs = cutoffValues('.github/workflows/ci.yml')
  const probeCutoffs = cutoffValues('.github/workflows/compat-probe.yml')
  const cutoffsMatch = Array.isArray(ciCutoffs) && Array.isArray(probeCutoffs)
    && ciCutoffs.length === 1 && probeCutoffs.length === 1 && ciCutoffs[0] === probeCutoffs[0]
  let cutoffDetail
  if (ciCutoffs === null || probeCutoffs === null) cutoffDetail = 'a workflow file is missing'
  else if (ciCutoffs.length !== 1) cutoffDetail = `ci.yml install line carries ${ciCutoffs.length} well-shaped --before cutoff(s), want exactly 1`
  else if (probeCutoffs.length !== 1) cutoffDetail = `compat-probe.yml install line carries ${probeCutoffs.length} well-shaped --before cutoff(s), want exactly 1`
  else if (ciCutoffs[0] !== probeCutoffs[0]) cutoffDetail = `cutoffs differ: ci.yml=${ciCutoffs[0]}, compat-probe.yml=${probeCutoffs[0]}`
  else cutoffDetail = `both install lines pin --before=${ciCutoffs[0]}`
  results.push(check('d09', 'D7 --before cutoffs well-shaped + identical', cutoffsMatch, cutoffDetail))

  // d10 — the install one-liner's tag must SERVE the declaration-face
  // installer, not merely share its name (PR #12 review BLOCKER).
  //
  // d02/d07/d08 prove the docs, the installer pin, and the alias AGREE with
  // each other. None of them looks INSIDE the alias: `v0.2` → v0.2.1 shipped
  // an installer whose only face wrote into $DSH_HOME/.agent-presets/ — the
  // directory 0.2.x never reads — so every pointer check stayed green while
  // the documented install path installed a preset nothing reads. This check
  // reads the alias tag's own copy of scripts/install-concerto.sh and asserts
  // the declaration-face marker IS there and the dead face's write target is
  // NOT. The tag is fetched to a throwaway ref (the alias is force-moved at
  // every release, so a stale local tag must never be trusted); offline, the
  // local tag is the fallback and says so in the detail.
  //
  // RED HERE IS THE ENFORCEMENT, stated plainly: a merge that changes the
  // installer must be followed IMMEDIATELY by a release (release.sh moves the
  // alias and re-verifies from the new tag's raw URL). Until the alias moves,
  // this gate stays red on purpose.
  const d10 = (() => {
    if (!alias) return { pass: false, detail: 'no tag_alias in compat.yaml' }
    const tmpRef = 'refs/omo-gate-d10/alias'
    const gitOpts = { cwd: REPO_ROOT, encoding: 'utf8', timeout: 90_000 }
    const fetched = spawnSync('git',
      ['fetch', '--depth', '1', '--force', 'origin', `refs/tags/${alias}:${tmpRef}`], gitOpts)
    let ref = tmpRef
    let source = `origin tag ${alias} (fetched)`
    if (fetched.status !== 0) {
      const local = spawnSync('git', ['rev-parse', '--verify', '-q', `refs/tags/${alias}`], gitOpts)
      if (local.status !== 0) {
        return { pass: false, detail: `cannot resolve tag ${alias} (fetch: ${(fetched.stderr || 'failed').trim().split('\n')[0]}; no local tag either)` }
      }
      ref = `refs/tags/${alias}`
      source = `LOCAL tag ${alias} (fetch failed — result may be stale: ${(fetched.stderr || '').trim().split('\n')[0]})`
    }
    const show = spawnSync('git', ['show', `${ref}:scripts/install-concerto.sh`],
      { ...gitOpts, maxBuffer: 4 * 1024 * 1024 })
    if (ref === tmpRef) spawnSync('git', ['update-ref', '-d', tmpRef], gitOpts)
    if (show.status !== 0 || !(show.stdout ?? '')) {
      return { pass: false, detail: `git show ${ref}:scripts/install-concerto.sh failed (${(show.stderr || 'empty').trim().split('\n')[0]})` }
    }
    const content = show.stdout
    const hasDeclaration = content.includes('DECL_PATCH=')
    const servesDeadFace = content.includes('DEST="${D}/.agent-presets')
    const pass = hasDeclaration && !servesDeadFace
    return {
      pass,
      detail: pass
        ? `${source} serves the declaration-face installer`
        : `${source}: declaration marker DECL_PATCH ${hasDeclaration ? 'present' : 'MISSING'}; dead-face write target DEST=$D/.agent-presets ${servesDeadFace ? 'PRESENT' : 'absent'} — the documented one-liner installs from this tag; a merge that changes the installer must be followed by a release that moves the alias (scripts/release.sh)`,
    }
  })()
  results.push(check('d10', 'alias tag serves the live installer face', d10.pass, d10.detail))

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
