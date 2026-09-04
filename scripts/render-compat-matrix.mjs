#!/usr/bin/env node
// scripts/render-compat-matrix.mjs — renders .omo/compat.yaml (the single
// source of truth for the three-party version matrix) into
// docs/compat-matrix.md (en) and docs/compat-matrix_zh-CN.md (zh).
//
// Usage:
//   node scripts/render-compat-matrix.mjs            (re)write both files
//   node scripts/render-compat-matrix.mjs --check    exit 1 when disk differs
//
// YAML is loaded with the INSTALLED dsh's js-yaml in the exact dialect dsh
// itself uses (read-only import; same resolution as scripts/doctor-lite.mjs —
// the compat subset is plain YAML, but sharing one loader keeps one dialect
// story). CI installs dsh before this gate (.github/workflows/ci.yml), and
// locally the installed dsh is the same prerequisite doctor-lite has.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, loadYamlDialect } from './doctor-lite.mjs'

const COMPAT_YAML = join(REPO_ROOT, '.omo', 'compat.yaml')
const OUT_EN = join(REPO_ROOT, 'docs', 'compat-matrix.md')
const OUT_ZH = join(REPO_ROOT, 'docs', 'compat-matrix_zh-CN.md')

const STATUS_EN = { tested: '✅ tested', untested: '🔬 untested', broken: '❌ broken', dropped: '🪦 dropped' }
const STATUS_ZH = { tested: '✅ 已测试', untested: '🔬 未测试', broken: '❌ 不兼容', dropped: '🪦 已弃用' }

function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|')
}

function render(data, zh) {
  const status = zh ? STATUS_ZH : STATUS_EN
  const L = zh
    ? {
        title: '# 兼容矩阵',
        rendered: '机器渲染自',
        single: '——单一事实来源。请勿手改本文件：改 YAML 后运行',
        gate: '；docs 一致性门与',
        auto: '会自动重渲染。',
        parties: '## 三方',
        role: '角色',
        source: '版本来源',
        probe: '探测方式',
        ourRole: '我们发什么',
        dshRole: '我们跑在哪',
        omoRole: '架构蓝本（指挥/explore 语义）',
        ourSource: 'git tag：不可变的',
        alias: '+ 移动别名',
        installer: '（安装器锁定的就是它）',
        ourProbe: '每次发布 = 新增一行 ✅',
        dshSource: 'npm 仓库 / git tag `dsh-v*`',
        dshProbe: '本地',
        plus: '＋每周',
        workflow: '工作流自动开 issue',
        omoSource: 'npm 仓库',
        omoProbe: '仅感知：每周工作流标记新版本待复核（无运行时耦合）',
        legend: '状态图例：',
        gateBold: '**发布门：发布所依据的行必须是 ✅。**',
        tested: '## 已测试组合',
        untested: '## 未测试（已登记，待探测）',
        date: '日期',
        evidence: '证据（本地文件）',
        since: '登记于',
        note: '说明',
        how: '## 如何更新',
        how1: '编辑',
        how2: '（探测通过 → 加',
        how3: '行；上游发新版本 → 加',
        how4: '行；每周工作流会提醒你）。',
        how5: '运行',
        how6: '。',
        full: '完整流程：',
        process: '发布流程',
        processEn: 'release process',
        our: 'our',
        ourZh: '本项目',
        dsh: 'dsh',
        omo: 'omo',
      }
    : {
        title: '# Compatibility Matrix',
        rendered: 'Machine-rendered from',
        single: '— the single source of truth. Do not hand-edit this file: edit the YAML, then run',
        gate: 'the docs-consistency gate and',
        auto: 're-render automatically.',
        parties: '## Three parties',
        role: 'Role',
        source: 'Version source',
        probe: 'How it is probed',
        ourRole: 'what we ship',
        dshRole: 'the runtime we run on',
        omoRole: 'architecture blueprint (conductor/explore semantics)',
        ourSource: 'git tags',
        alias: '(immutable) + moving alias',
        installer: '(what the installer pins)',
        ourProbe: 'every release = one new ✅ row',
        dshSource: 'npm registry / git tags `dsh-v*`',
        dshProbe: 'locally via',
        plus: '+ weekly',
        workflow: 'workflow opens an issue',
        omoSource: 'npm registry',
        omoProbe: 'awareness only: weekly workflow flags new versions for review (no runtime coupling)',
        legend: 'Status legend:',
        gateBold: '**Release gate: the row a release is made on must be ✅.**',
        tested: '## Tested combinations',
        untested: '## Untested (registered, awaiting probe)',
        date: 'date',
        evidence: 'evidence (local file)',
        since: 'since',
        note: 'note',
        how: '## How to update',
        how1: 'Edit',
        how2: ' (probe passed → add a',
        how3: 'row; upstream published a new version → add',
        how4: 'rows; the weekly workflow will remind you).',
        how5: 'Run',
        how6: '.',
        full: 'Full process:',
        process: 'release process',
        processEn: 'release process',
        processZh: '发布流程',
        our: 'our',
        ourZh: 'our',
        dsh: 'dsh',
        omo: 'omo',
      }

  const testedRows = (data.tested ?? []).map((r) =>
    `| ${esc(r.our)} | ${esc(r.dsh)} | ${esc(r.omo)} | ${esc(r.date)} | \`${esc(r.evidence)}\` |`)
    .join('\n')

  const testedNotes = (data.tested ?? []).filter((r) => (zh ? r.note_zh : r.note_en))
    .map((r) => `> ${esc(r.our)} — ${zh ? r.note_zh : r.note_en}`)
    .join('\n')

  const untestedRows = (data.untested ?? []).map((r) =>
    `| ${esc(r.dsh)} | ${esc(r.omo)} | ${esc(r.since)} | ${zh ? r.note_zh : r.note_en} |`)
    .join('\n')

  const untestedEmpty = zh
    ? '（暂无——上游发新版本后，每周探测工作流会开 issue 提醒登记）'
    : '(none — when upstream publishes something new, the weekly probe workflow opens an issue as a reminder to register it)'

  const quote = zh
    ? `> 机器渲染自 [\`.omo/compat.yaml\`](../.omo/compat.yaml)${L.single} \`node scripts/render-compat-matrix.mjs\`${L.gate} \`scripts/release.sh\`${L.auto}`
    : `> Machine-rendered from [\`.omo/compat.yaml\`](../.omo/compat.yaml) ${L.single} \`node scripts/render-compat-matrix.mjs\` — ${L.gate} \`scripts/release.sh\` ${L.auto}`

  const dshProbeCell = zh
    ? `${L.dshProbe} \`scripts/compat-probe.sh\`${L.plus} \`compat-probe\` ${L.workflow}`
    : `${L.dshProbe} \`scripts/compat-probe.sh\` ${L.plus} \`compat-probe\` ${L.workflow}`

  return `${L.title}

${quote}

${L.parties}

| ${zh ? '参与方' : 'Party'} | ${L.role} | ${L.source} | ${L.probe} |
|---|---|---|---|
| **${L.our}** — \`oh-my-opendsh\` | ${L.ourRole} | ${L.ourSource} \`vX.Y.Z\` ${L.alias} \`vX.Y\` ${L.installer} | ${L.ourProbe} |
| **${L.dsh}** — \`@deepseek-ai/dsh\` | ${L.dshRole} | ${L.dshSource} | ${dshProbeCell} |
| **${L.omo}** — \`oh-my-openagent\` | ${L.omoRole} | ${L.omoSource} | ${L.omoProbe} |

${L.legend} ${Object.values(status).join(' · ')}${zh ? '。' : '.'}
${L.gateBold}

${L.tested}

| ${zh ? '我们' : 'our'} | ${L.dsh} | ${L.omo} | ${L.date} | ${L.evidence} |
|---|---|---|---|---|
${testedRows}

${testedNotes}

${L.untested}

| ${L.dsh} | ${L.omo} | ${L.since} | ${L.note} |
|---|---|---|---|
${untestedRows || `| — | — | — | ${untestedEmpty} |`}

${L.how}

1. ${L.how1} \`.omo/compat.yaml\`${L.how2} \`tested\` ${L.how3} \`untested\` ${L.how4}
2. ${L.how5} \`node scripts/render-compat-matrix.mjs\`${L.how6}
3. ${L.full} [${zh ? L.process : L.processEn}](${zh ? './release-process_zh-CN.md' : './release-process.md'}) / [${zh ? L.processEn : L.processZh}](${zh ? './release-process.md' : './release-process_zh-CN.md'})
`
}

async function main() {
  const check = process.argv.includes('--check')
  const data = await loadYamlDialect(COMPAT_YAML)
  if (data.schema !== 1) {
    throw new Error(`render-compat-matrix: unknown compat.yaml schema ${JSON.stringify(data.schema)} (expected 1)`)
  }
  const en = render(data, false)
  const zh = render(data, true)
  if (check) {
    const mismatches = []
    if (readFileSync(OUT_EN, 'utf8') !== en) mismatches.push('docs/compat-matrix.md')
    if (readFileSync(OUT_ZH, 'utf8') !== zh) mismatches.push('docs/compat-matrix_zh-CN.md')
    if (mismatches.length > 0) {
      console.error(`render-compat-matrix --check: rendered output differs on disk: ${mismatches.join(', ')}`)
      console.error('Fix: edit .omo/compat.yaml, then run `node scripts/render-compat-matrix.mjs`.')
      process.exit(1)
    }
    console.log('render-compat-matrix --check: docs/compat-matrix.md + _zh-CN.md are current')
    return
  }
  writeFileSync(OUT_EN, en)
  writeFileSync(OUT_ZH, zh)
  console.log('render-compat-matrix: wrote docs/compat-matrix.md + docs/compat-matrix_zh-CN.md')
}

main()
