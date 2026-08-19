// @oh-my-opendsh/omo-agents — minimal no-op cordis plugin (MVP AC-1).
//
// Registers nothing: no services, no tools, no listeners. It exists to prove
// the `dsh --patch` overlay loads this package end to end. The console marker
// is the positive load signal grepped by scripts/cold-start.sh.

export const name = 'omo-agents'

export function apply(): void {
  console.log('[omo-agents] loaded (no-op)')
}
