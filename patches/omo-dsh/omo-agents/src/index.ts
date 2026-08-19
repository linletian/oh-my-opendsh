// @oh-my-opendsh/omo-agents — MVP cordis plugin (AC-1) + T6 Concerto Mode
// registration (FR-2, AC-2) + T8 omo-sisyphus system prompt (FR-3, AC-3).
//
// T6: apply-time authoring registers the 协奏 / Concerto Mode preset as a real
// 5th run mode at the same roster level as the official 4 (P-1 verdict:
// register-branch). syncConcertoPreset materializes the repo-shipped template
// (../concerto/) into `$DSH_HOME/.agent-presets/concerto/` — the user root
// dsh-agent-presets auto-appends — idempotently; the roster log line via
// ctx.inject is the in-process observable, and POST /api/agentPreset.list is
// the external one (scripts/concerto-mode-probe.sh). The T4 load marker is
// kept; "(no-op)" is dropped because the plugin now performs registration.
//
// T8: the materialized preset's persona is the assembled omo-sisyphus system
// prompt — buildSisyphusSystemPrompt() renders the sentinel in the template
// at apply() time (design (a); see system-prompt.ts), so the concerto mode's
// main-agent brain is the four system-sections markdown files, rebuilt fresh
// on every boot. The `omo-sisyphus system prompt assembled` line is the
// in-process marker the probe asserts.

// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import {
  CONCERTO_TEMPLATE_DIR,
  concertoPresetDir,
  syncConcertoPreset,
  type ConcertoSyncOutcome,
} from './concerto-preset.ts'
import { SISYPHUS_SECTION_ORDER, buildSisyphusSystemPrompt } from './system-prompt.ts'

export const name = 'omo-agents'

// Minimal structural typings — this workspace has no cordis dependency, so
// the plugin declares only the shape it touches (keeps `pnpm typecheck`
// honest without importing DSH types).
interface RosterEntry {
  id: string
  trust?: string
  name?: string
}

interface AgentPresetsLike {
  list(): Promise<RosterEntry[]>
}

interface InjectingContext {
  inject(deps: string[], cb: (ctx: { agentPresets: AgentPresetsLike }) => unknown): void
}

function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

export function apply(ctx: InjectingContext): void {
  console.log('[omo-agents] loaded')

  let outcome: ConcertoSyncOutcome
  const targetDir = concertoPresetDir()
  try {
    const personaPrompt = buildSisyphusSystemPrompt()
    console.log(
      `[omo-agents] omo-sisyphus system prompt assembled: `
      + `${SISYPHUS_SECTION_ORDER.length} sections, ${personaPrompt.length} chars`,
    )
    outcome = syncConcertoPreset(targetDir, CONCERTO_TEMPLATE_DIR, personaPrompt)
  } catch (err) {
    // A throw is loud-but-non-fatal evidence: the host keeps booting and the
    // probe fails on the missing roster entry, never on a dressed-up success.
    console.log(`[omo-agents] concerto preset sync FAILED: ${describeError(err)}`)
    return
  }
  console.log(`[omo-agents] concerto preset ${outcome} at ${targetDir}`)

  ctx.inject(['agentPresets'], async (injected) => {
    try {
      const roster = await injected.agentPresets.list()
      console.log(
        '[omo-agents] concerto roster: '
        + roster.map((preset) => `${preset.id}:${preset.trust ?? '?'}`).join(','),
      )
    } catch (err) {
      console.log(`[omo-agents] concerto roster FAILED: ${describeError(err)}`)
    }
  })
}
