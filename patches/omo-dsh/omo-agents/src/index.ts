// @oh-my-opendsh/omo-agents — minimal cordis plugin (MVP AC-1) + T5 P-1 spike.
//
// Base behavior (T4): registers no services/tools/listeners; the console
// marker below is the positive load signal grepped by scripts/cold-start.sh.
//
// === T5 P-1 SPIKE — clearly marked; REPLACED by T6's real implementation ===
// Probe question: can a scratch plugin (dsh --patch overlay) register a 5th
// run-mode preset at the SAME roster level as the official 4 modes
// (standard/code/minimal/cordis)?
// Mechanism under test: the official authoring write ctx.agentPresets.copy()
// from dsh-agent-presets (discovery root: $DSH_HOME/.agent-presets — inside
// the probe sandbox; includeUserRoot defaults to true; discovery is
// unmemoized). Inject defers until the service is active, so load order does
// not matter. The probe's external observable is POST /api/agentPreset.list
// (scripts/p1-preset-probe.sh) plus the roster log line below.

export const name = 'omo-agents'

// Minimal structural typings — this workspace has no cordis dependency, so
// the spike declares only the shape it touches (keeps `pnpm typecheck`
// honest without importing DSH types).
interface RosterEntry {
  id: string
  trust?: string
  name?: string
}

interface AgentPresetsLike {
  list(): Promise<RosterEntry[]>
  copy(from: string, id: string, name?: string): Promise<void>
}

interface InjectingContext {
  inject(deps: string[], cb: (ctx: { agentPresets: AgentPresetsLike }) => unknown): void
}

export function apply(ctx: InjectingContext): void {
  console.log('[omo-agents] loaded (no-op)')

  ctx.inject(['agentPresets'], async (injected) => {
    try {
      const before = await injected.agentPresets.list()
      if (!before.some((preset) => preset.id === 'concerto')) {
        await injected.agentPresets.copy('standard', 'concerto', '演奏模式 (Concerto P-1 spike)')
        console.log('[omo-agents] P-1 spike: concerto authored via agentPresets.copy(standard)')
      } else {
        console.log('[omo-agents] P-1 spike: concerto already present (idempotent re-run)')
      }
      const roster = await injected.agentPresets.list()
      console.log(
        '[omo-agents] P-1 spike roster: '
        + roster.map((preset) => `${preset.id}:${preset.trust ?? '?'}`).join(','),
      )
    } catch (err) {
      // A throw is a VALID probe outcome (fallback-branch evidence): print it
      // verbatim for the evidence log, never dress it up as success.
      console.log(
        '[omo-agents] P-1 spike FAILED: '
        + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)),
      )
    }
  })
}
