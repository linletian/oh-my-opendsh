#!/usr/bin/env node
// scripts/check-l2-evidence.mjs — the L2 evidence gate, per matrix row
// (PR #1 review F6). For EVERY `tested` row in .omo/compat.yaml: the row's
// `evidence` file must exist, be fresh (mtime within VERIFY_FRESH_DAYS,
// default 7 days), and carry the canonical summary line
// `**PASS — N passed, 0 failed` (the marker concerto_verify writes). Rows
// sharing one evidence path are checked once. Exit 1 iff any row fails — a
// full-matrix release can no longer pass on a single record.
//
// Usage: node scripts/check-l2-evidence.mjs
//        VERIFY_FRESH_DAYS=7 node scripts/check-l2-evidence.mjs

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, loadYamlDialect } from './doctor-lite.mjs'

const FRESH_DAYS = Number(process.env.VERIFY_FRESH_DAYS ?? 7)
// Multiline: the marker must start a LINE, anywhere in the file.
const MARKER = /^\*\*PASS — [0-9]+ passed, 0 failed/m

const results = []
const compat = await loadYamlDialect(join(REPO_ROOT, '.omo', 'compat.yaml'))
const tested = compat.tested ?? []
if (tested.length === 0) {
  console.error('check-l2-evidence: no tested rows in .omo/compat.yaml')
  process.exit(1)
}

const seen = new Set()
for (const row of tested) {
  const path = row.evidence
  if (seen.has(path)) continue
  seen.add(path)
  const id = `our ${row.our} × dsh ${row.dsh}`
  let fail = ''
  if (typeof path !== 'string' || path === '') {
    fail = 'row has no evidence path'
  } else {
    try {
      const stat = statSync(join(REPO_ROOT, path))
      const ageDays = (Date.now() - stat.mtimeMs) / 86400000
      if (ageDays > FRESH_DAYS) {
        fail = `stale (${ageDays.toFixed(1)}d > ${FRESH_DAYS}d)`
      } else {
        const text = readFileSync(join(REPO_ROOT, path), 'utf8')
        if (!MARKER.test(text)) {
          fail = `summary marker '**PASS — N passed, 0 failed' not found in ${path}`
        }
      }
    } catch {
      fail = `missing ${path}`
    }
  }
  results.push({ id, path, pass: fail === '', detail: fail === '' ? 'fresh + 0 failed' : fail })
  console.log(`${fail === '' ? 'PASS' : 'FAIL'} ${id} — ${path}${fail === '' ? '' : `: ${fail}`}`)
}

const failed = results.filter((r) => !r.pass).length
console.log(`check-l2-evidence: ${results.length - failed}/${results.length} rows PASS${failed > 0 ? ` — ${failed} FAIL` : ''}`)
if (failed > 0) {
  console.error('Run concerto_verify in a live concerto session for each failing row (it writes the evidence file with the summary marker).')
}
process.exit(failed > 0 ? 1 : 0)
