// P2-T14 — anti-drift unit test for the conductor's static delegation roster
// (docs/plans/phase2-dev/phase2-tasks.md P2-T14 判定: "表中 10 个委派目标与
// roster.ts 的 toolName 集合逐一对应（单测断言，防文档与名册漂移）").
//
// The section is CONTENT, so it cannot be typed; this test is the mechanical
// guard that keeps it from drifting away from the single source of truth
// (roster.ts DELEGATION_TOOL_NAMES) in either direction:
//   * every delegation target has exactly one row, and
//   * the table names no id the roster does not delegate (in particular not the
//     conductor), and
//   * the table's order is the roster order (the deny-sentinel renderer and the
//     static gates emit lists in that order, so a reordering here is real drift).
//
// The expected cost map is hard-coded (not read from roster.ts, which does not
// carry costs) so the test would go red if a row's tier were silently changed:
// six tiers come from the upstream *_PROMPT_METADATA constants, hephaestus/atlas
// from their unregistered constants, and sisyphus-junior/prometheus from their
// ported persona role semantics (phase2-roster.md §2 head note ③).
import { describe, expect, it } from 'vitest'
import { RUNTIME_INJECTED_HEADINGS } from '../../patches/omo-dsh/omo-agents/src/persona-prompts'
import { DELEGATION_TOOL_NAMES } from '../../patches/omo-dsh/omo-agents/src/roster'
import {
  SYSTEM_SECTIONS_DIR,
  loadSectionFile,
} from '../../patches/omo-dsh/omo-agents/src/system-sections'

const ROSTER_FILE = 'delegation-roster.md'

/** The markdown table's 5 columns, in order. */
const COLUMNS = ['Agent', 'Domain', 'Delegate when', 'Never delegate when', 'Cost'] as const

/** The five columns, as a pipe-delimited header line. */
const HEADER_LINE = `| ${COLUMNS.join(' | ')} |`

/**
 * phase2-roster.md §1 总表 cost tiers, transcribed by hand. FREE/CHEAP/EXPENSIVE
 * are the only legal values; the map pins WHICH tier each agent is on.
 */
const EXPECTED_COST: Readonly<Record<string, string>> = {
  explore: 'FREE',
  hephaestus: 'EXPENSIVE',
  oracle: 'EXPENSIVE',
  librarian: 'CHEAP',
  'plan-consultant': 'EXPENSIVE',
  'plan-reviewer': 'EXPENSIVE',
  atlas: 'EXPENSIVE',
  'multimodal-looker': 'CHEAP',
  'sisyphus-junior': 'CHEAP',
  prometheus: 'EXPENSIVE',
}

const COST_TIERS = ['FREE', 'CHEAP', 'EXPENSIVE'] as const

interface RosterRow {
  readonly agentId: string
  readonly domain: string
  readonly delegateWhen: string
  readonly neverDelegateWhen: string
  readonly cost: string
}

/**
 * Parses the delegation table. A body row is a line starting with `| ` that is
 * not the header; the agent column must be exactly one backticked id, which
 * makes the parse independent of any code span used later in a row. A malformed
 * row throws (rather than being skipped), so a broken table cannot read as a
 * shorter-but-consistent one.
 */
function parseRosterTable(markdown: string): RosterRow[] {
  const rows: RosterRow[] = []
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('| ') || !line.endsWith(' |')) continue
    const cells = line.slice(1, -1).split('|').map((cell) => cell.trim())
    if (cells[0] === COLUMNS[0]) continue // the header row
    if (cells.length !== COLUMNS.length) {
      throw new Error(`delegation table row must have ${COLUMNS.length} cells: ${line}`)
    }
    const match = /^`([^`]+)`$/.exec(cells[0]!)
    if (match === null) {
      throw new Error(`delegation table agent cell must be a single backticked id: ${cells[0]}`)
    }
    rows.push({
      agentId: match[1]!,
      domain: cells[1]!,
      delegateWhen: cells[2]!,
      neverDelegateWhen: cells[3]!,
      cost: cells[4]!,
    })
  }
  return rows
}

const markdown = loadSectionFile(SYSTEM_SECTIONS_DIR, ROSTER_FILE)
const rows = parseRosterTable(markdown)
/** The attribution header is an HTML comment that ends at the first `-->`. */
const headerEnd = markdown.indexOf('-->')
const attributionHeader = markdown.slice(0, headerEnd)
/** Everything after the header comment — the usage text and the table: the prompt body. */
const visibleBody = markdown.slice(headerEnd + 3)

describe('delegation-roster.md table (P2-T14 anti-drift)', () => {
  it('names every roster delegation toolName in roster order, and nothing else (set AND order)', () => {
    expect(rows.map((row) => row.agentId)).toEqual([...DELEGATION_TOOL_NAMES])
    expect(new Set(rows.map((row) => row.agentId))).toEqual(new Set(DELEGATION_TOOL_NAMES))
    expect(rows).toHaveLength(DELEGATION_TOOL_NAMES.length) // 10 delegation targets
  })

  it('names only delegation targets: the conductor is not a row', () => {
    expect(rows.map((row) => row.agentId)).not.toContain('sisyphus')
    expect(DELEGATION_TOOL_NAMES).not.toContain('sisyphus')
  })

  it('every row is complete: a domain, both when-cells, and a legal cost tier', () => {
    for (const row of rows) {
      expect(row.domain.length, `${row.agentId} domain`).toBeGreaterThan(0)
      expect(row.delegateWhen.length, `${row.agentId} delegate-when`).toBeGreaterThan(0)
      expect(row.neverDelegateWhen.length, `${row.agentId} never-delegate-when`).toBeGreaterThan(0)
      expect(COST_TIERS).toContain(row.cost)
    }
  })

  it('pins each agent to its expected cost tier', () => {
    expect(Object.fromEntries(rows.map((row) => [row.agentId, row.cost]))).toEqual(EXPECTED_COST)
  })

  it('carries the 5-column header the parser keys on', () => {
    expect(markdown).toContain(HEADER_LINE)
    expect(markdown).toContain('# Delegation Roster')
  })

  it('is non-empty, has no `{{` sequence, and carries no runtime-injected heading', () => {
    expect(markdown.trim().length).toBeGreaterThan(0)
    expect(markdown).not.toContain('{{')
    for (const heading of RUNTIME_INJECTED_HEADINGS) {
      expect(markdown).not.toContain(heading)
    }
  })

  it('keeps OMO-specific references generalized: renamed pair, no OMO plan path, no absent upstream tools', () => {
    // metis's "consult Metis before Prometheus" must use the v5 names.
    expect(visibleBody).toContain('plan-consultant')
    expect(visibleBody).not.toContain('Metis')
    expect(visibleBody).not.toContain('Momus')
    // momus's keyTrigger pointed at OMO's `.omo/plans/*.md` artifact convention.
    expect(visibleBody).not.toContain('.omo/plans')
    // Tools with no DSH counterpart are not restated as if they existed.
    expect(visibleBody).not.toContain('call_omo_agent')
    expect(visibleBody).not.toContain('apply_patch')
    expect(visibleBody).not.toContain('background_output')
  })

  it('the atlas row states it is the only target that may re-delegate (orchestrator, depth 2)', () => {
    const atlas = rows.find((row) => row.agentId === 'atlas')
    expect(atlas).toBeDefined()
    expect(atlas!.domain).toContain('ONLY target that may re-delegate')
    expect(atlas!.domain).toContain('depth 2')
    expect(atlas!.domain.toLowerCase()).toContain('orchestrat')
  })

  it('the multimodal-looker row covers the vision seat need (image/PDF input)', () => {
    const looker = rows.find((row) => row.agentId === 'multimodal-looker')
    expect(looker).toBeDefined()
    expect(looker!.domain).toContain('VISION seat')
    expect(looker!.domain.toUpperCase()).toContain('PDF')
    expect(looker!.domain.toLowerCase()).toContain('image')
  })

  it('the attribution header names the metadata sources with tag-verified line spans', () => {
    // AgentPromptMetadata shape + every metadata constant used as source.
    for (const source of [
      'types.ts:99-123',
      'explore.ts:7-25',
      'oracle.ts:8-38',
      'librarian.ts:7-22',
      'metis.ts:413-433',
      'momus.ts:324-353',
      'multimodal-looker.ts:7-12',
      'hephaestus/agent.ts:187-212',
      'atlas/agent.ts:135-161',
    ]) {
      expect(attributionHeader, `attribution header must name ${source}`).toContain(source)
    }
    expect(attributionHeader).toContain('Semantic translation only')
    // The four rows without table-reaching metadata are declared as derived.
    expect(attributionHeader).toContain('FOUR ROWS ARE DERIVED')
    for (const id of ['hephaestus', 'atlas', 'sisyphus-junior', 'prometheus']) {
      expect(attributionHeader).toContain(id)
    }
    // …and the two derived-cell cases are declared too (empty triggers, no avoidWhen).
    expect(attributionHeader).toContain('EMPTY')
    expect(attributionHeader).toContain('avoidWhen')
  })
})
