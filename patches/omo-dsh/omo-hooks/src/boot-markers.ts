// boot-markers.ts — P3-T3 boot-marker computation for @oh-my-opendsh/omo-hooks,
// factored out of index.ts so every line the plugin logs is produced by a
// unit-tested pure function (the omo-agents boot-markers.ts precedent: "pure
// module + thin index.ts wiring", so the probe's greps anchor on text pinned by
// tests instead of on text assembled inline in apply()).
//
// WHY THE FORMATS ARE A CONTRACT (plan §4.1; task P3-T3). The boot markers are
// the ONLY in-process observable that the plugin mounted and registered
// anything: scripts/concerto-mode-probe.sh and scripts/cold-start.sh grep the
// boot log, and P3-T19 extends that to the full per-hook set. Changing a format
// silently turns those greps into false negatives, so:
//
//   KEEP THESE FORMATS STABLE — extend the probe, never the format.
//
// The three lines (exact grammar, so a future edit cannot "improve" it by
// accident):
//
//   summary   "[omo-hooks] loaded: manifest <N> entries (pre-step=<n>,
//              pre-execute=<n>, post-execute=<n>, turn-stopping=<n>,
//              session/event=<n>, status=<n>)"
//             — exactly ONE line, logged once per apply() AFTER the manifest
//               validated. `<N>` is the manifest length and every `<n>` is a
//               per-event count DERIVED from the manifest (never hard-coded);
//               the field order is SUMMARY_EVENT_FIELDS, fixed, so the line is
//               diffable across boots. The `[omo-hooks] loaded` prefix is the
//               mount anchor cold-start.sh / the probe grep (a substring grep,
//               so the counts can evolve without a probe edit).
//   registered "[omo-hooks] hook <id> registered on <event>"
//             — ONE line per manifest row whose registrar is implemented and
//               returned without throwing. NOTE (P3-T3): the implementation
//               registry is deliberately empty, so NO line of this form is
//               logged yet; the loop that would emit it is in place, and T4+
//               fills the registry one hook at a time (the probe's additive
//               assertions follow).
//   FAILED    "[omo-hooks] hook <id> FAILED: <describeError>"
//             — loud-but-non-fatal: the failing hook names itself and the loop
//               keeps going (P2-T16 discipline — one broken hook must never
//               suppress the others).
//
// The manifest is the single source of truth (manifest.ts) and the event set is
// exactly MANIFEST_EVENTS, so a summary field can never be missing: every row
// event is one of the six fields below. `other=` is the total function's
// defensive tail for a fixture/roster that carries an event outside those six
// (validateManifest rejects such a roster on the real path, so on a real boot
// the tail is always 0 and the line never contains it).
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.

import type { HookEvent, HookManifestEntry } from './manifest.ts'

/**
 * Renders one caught error for a FAILED boot line. Deliberately a second,
 * independent copy of omo-agents' boot-markers.ts helper: the two plugins must
 * not import each other (index.ts header: sharing code across them is a
 * plan-level decision), and a 3-line pure function is cheaper than the coupling.
 */
export function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

/**
 * The summary line's fields, in log order: the human label paired with the DSH
 * event it counts. The `HookEvent` type makes a typo'd event a compile error
 * here before any runtime check, and the six rows cover MANIFEST_EVENTS
 * exactly — the label vocabulary is what the probe's summary grep reads.
 */
export const SUMMARY_EVENT_FIELDS: readonly { readonly label: string; readonly event: HookEvent }[] = [
  { label: 'pre-step', event: 'agent/pre-step' },
  { label: 'pre-execute', event: 'tools/pre-execute' },
  { label: 'post-execute', event: 'tools/post-execute' },
  { label: 'turn-stopping', event: 'agent/turn-stopping' },
  { label: 'session/event', event: 'session/event' },
  { label: 'status', event: 'agent/status' },
]

/**
 * `[omo-hooks] loaded: manifest <N> entries (<fields>)` — the ONE summary line,
 * with every count derived from `entries` (task P3-T3: 禁止硬编码). Pure, so a
 * unit test can feed a synthetic roster and observe the derived counts, and the
 * real-manifest test pins the exact line a boot logs.
 */
export function formatLoadedSummaryLine(entries: readonly HookManifestEntry[]): string {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    counts.set(entry.event, (counts.get(entry.event) ?? 0) + 1)
  }
  const fields = SUMMARY_EVENT_FIELDS.map(
    ({ label, event }) => `${label}=${counts.get(event) ?? 0}`,
  )
  const counted = SUMMARY_EVENT_FIELDS.reduce((sum, { event }) => sum + (counts.get(event) ?? 0), 0)
  // Total, never silently lossy: a roster event outside the six fields is
  // reported instead of dropped (unreachable on a validated roster).
  if (counted !== entries.length) fields.push(`other=${entries.length - counted}`)
  return `[omo-hooks] loaded: manifest ${entries.length} entries (${fields.join(', ')})`
}

/**
 * `[omo-hooks] hook <id> registered on <event>` — one line per successfully
 * registered hook (see the file header for why this is empty in P3-T3).
 */
export function formatHookRegisteredLine(id: string, event: string): string {
  return `[omo-hooks] hook ${id} registered on ${event}`
}

/**
 * `[omo-hooks] hook <id> FAILED: <describeError>` — loud-but-non-fatal, the
 * per-hook failure form (P2-T16 precedent).
 */
export function formatHookFailedLine(id: string, err: unknown): string {
  return `[omo-hooks] hook ${id} FAILED: ${describeError(err)}`
}

/**
 * `[omo-hooks] manifest validation FAILED: <describeError>` — the ONE form for
 * a roster that validateManifest rejects. On this path the summary line is NOT
 * logged: a roster whose length/shape could not be trusted must not print a
 * count that reads like a successful mount (cold-start's `[omo-hooks] loaded`
 * grep then fails loudly, which is the point).
 */
export function formatManifestValidationFailedLine(err: unknown): string {
  return `[omo-hooks] manifest validation FAILED: ${describeError(err)}`
}
