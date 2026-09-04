// @oh-my-opendsh/omo-agents — MVP cordis plugin (AC-1) + T6 Concerto Mode
// registration (FR-2, AC-2) + T8 omo-sisyphus system prompt (FR-3, AC-3)
// + T14 dual model route resolution (FR-5, P-2; AC-5 config half)
// + T16 Hard Blocks injection listener (FR-6, P-3)
// + T10 omo-explore read-only subagent persona (FR-4).
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
//
// T16: one `agent/pre-step` waterfall listener injects the Hard Blocks +
// Anti-Patterns sections into every sub-agent's context via agent.inject()
// (see hard-blocks-injection.ts for the verified API citations). The
// `hard-blocks injection listener registered on agent/pre-step` line is the
// boot-level registration observable; unit tests assert the inject call and
// the single registration; live sub-agent prompt proof lands in T20 (e2e).
//
// T10: the omo-explore read-only retrieval subagent persona is assembled at
// apply() time from system-sections/explore-persona.md (see explore-prompt.ts
// for the architecture decision + the T11 binding contract). The persona is
// NOT a run mode and authors no preset roster entry — T11 binds the built
// text as a dsh-tool-subagent instance's `persona` config. The
// `omo-explore persona assembled` line is the boot-level observable the
// probe asserts (a broken persona file is loud at boot, never at T11's
// first delegation).

// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import {
  CONCERTO_TEMPLATE_DIR,
  concertoPresetDir,
  syncConcertoPreset,
  type ConcertoSyncOutcome,
} from './concerto-preset.ts'
import { SISYPHUS_SECTION_ORDER, buildSisyphusSystemPrompt } from './system-prompt.ts'
import { EXPLORE_SECTION_ORDER, buildExploreSystemPrompt } from './explore-prompt.ts'
import { resolveModelRoutes } from './model-routes.ts'
import {
  HARD_BLOCKS_INJECTION_EVENT,
  registerHardBlocksInjection,
  type PreStepRegistrationContext,
} from './hard-blocks-injection.ts'

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

interface InjectingContext extends PreStepRegistrationContext {
  inject(deps: string[], cb: (ctx: { agentPresets: AgentPresetsLike }) => unknown): void
}

function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

export function apply(ctx: InjectingContext): void {
  console.log('[omo-agents] loaded')

  // T16 first: the listener is independent of preset sync, so a sync throw
  // must never take the registration down with it.
  try {
    registerHardBlocksInjection(ctx)
    console.log(
      `[omo-agents] hard-blocks injection listener registered on ${HARD_BLOCKS_INJECTION_EVENT}`,
    )
  } catch (err) {
    console.log(`[omo-agents] hard-blocks injection FAILED: ${describeError(err)}`)
  }

  // T14: resolve + validate the dual routes at apply() time so a
  // misconfiguration is loud at boot (the probe asserts this marker), and so
  // T11/T15/T20 read the same validated pairs from model-routes.ts.
  try {
    const routes = resolveModelRoutes()
    console.log(
      `[omo-agents] model routes: sisyphus=${routes.sisyphus.provider}/${routes.sisyphus.model} `
      + `explore=${routes.explore.provider}/${routes.explore.model}`,
    )
  } catch (err) {
    console.log(`[omo-agents] model routes FAILED: ${describeError(err)}`)
  }

  // T10: assemble the omo-explore subagent persona at apply() time — same
  // loud-but-non-fatal discipline: the probe asserts the marker, and a broken
  // persona file surfaces here rather than at T11's first delegation.
  try {
    const explorePrompt = buildExploreSystemPrompt()
    console.log(
      `[omo-agents] omo-explore persona assembled: `
      + `${EXPLORE_SECTION_ORDER.length} section, ${explorePrompt.length} chars`,
    )
  } catch (err) {
    console.log(`[omo-agents] omo-explore persona FAILED: ${describeError(err)}`)
  }

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

  try {
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
  } catch (err) {
    console.log(`[omo-agents] agentPresets inject FAILED: ${describeError(err)}`)
  }
}
