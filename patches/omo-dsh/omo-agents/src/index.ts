// @oh-my-opendsh/omo-agents — MVP cordis plugin (AC-1) + T6 Concerto Mode
// registration (FR-2, AC-2) + T8 omo-sisyphus system prompt (FR-3, AC-3)
// + T14 dual model route resolution (FR-5, P-2; AC-5 config half)
// + T16 Hard Blocks injection listener (FR-6, P-3)
// + T10 omo-explore read-only subagent persona (FR-4)
// + P2-T16 roster-wide boot markers and non-blocking route warnings.
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
// main-agent brain is the system-sections markdown files, rebuilt fresh on
// every boot. The `omo-sisyphus system prompt assembled` line is the
// in-process marker the probe asserts. The conductor has NO child persona
// marker: it is a preset persona, not a dsh-tool-subagent instance.
//
// T16: one `agent/pre-step` waterfall listener injects the Hard Blocks +
// Anti-Patterns sections into every sub-agent's context via agent.inject()
// (see hard-blocks-injection.ts for the verified API citations). The
// `hard-blocks injection listener registered on agent/pre-step` line is the
// boot-level registration observable.
//
// T10 → P2-T16(A): the omo-explore read-only retrieval subagent persona is
// assembled at apply() time from system-sections/explore-persona.md (see
// explore-prompt.ts for the architecture decision + the T11 binding contract).
// Since P2-T16 the explore-only block is a LOOP over roster.ts
// DELEGATION_ENTRIES, so every one of the 10 delegation agents logs its own
// assembly at boot — with an independent try/catch per agent, so one broken
// persona file never takes the other nine down (loud-but-non-fatal). A broken
// persona is loud at boot, never at the first delegation.
//
// P2-T16 marker formats (documented in full, with the probe-anchor reasoning,
// in boot-markers.ts — the pure module that builds every line below; KEEP
// THESE FORMATS STABLE, extend the probe rather than the format):
//   * `[omo-agents] omo-<id> persona assembled: 1 section, <N> chars`
//     — 10 lines, one per DELEGATION_ENTRIES row, in roster order. The explore
//       line is byte-identical to the pre-P2-T16 T10 marker, which
//       scripts/concerto-mode-probe.sh:694 greps as a substring.
//   * `[omo-agents] omo-<id> persona FAILED: <describeError>`
//     — the per-agent failure form (same wording the T10 block already used).
//   * `[omo-agents] model routes: sisyphus=<P>/<M> explore=<P>/<M>
//      hephaestus=<P>/<M> oracle=<P>/<M> librarian=<P>/<M>
//      plan-consultant=<P>/<M> plan-reviewer=<P>/<M> atlas=<P>/<M>
//      multimodal-looker=<P>/<M> sisyphus-junior=<P>/<M> prometheus=<P>/<M>`
//     — ONE line, all 11 roster routes in roster order (P2-T16(B)). The
//       `sisyphus=<P>/<M> explore=<P>/<M>` prefix is byte-compatible with the
//       T14 marker the probe greps (concerto-mode-probe.sh:707, no line-end
//       anchor); the full 11-field line is the P2-T20 11-route anchor. The
//       AC-5 throw path keeps the `[omo-agents] model routes FAILED: …` line.
//   * `[omo-agents] route warning [<code>]: <message>`
//     — ONE non-blocking line per resolveModelRoutesWithWarnings() warning
//       (plan §4.6 rules 1/2; P2-T16(C)). Nothing logs when they do not fire —
//       the default three-seat distribution must stay silent.
//   * `[omo-agents] route provider not registered: <provider> (agents: <ids>)`
//     — ONE non-blocking line per distinct route provider with no registered
//       adapter (plan §4.6 third warning, runtime layer; P2-T16(D)). Read
//       through ctx.inject(['llm']) -> llm.listProviders() (verified surface:
//       dsh-llm lib/index.js:1846, LlmProviderInfo {id,name}). Registration is
//       keyless and hot-loadable, so this NEVER throws and NEVER blocks; when
//       the llm service is absent the inject simply never fires. The read is
//       SETTLED, not literally synchronous at apply(): a bare t0 read is a
//       measured false positive because dsh-llm-pi-ai registers its
//       settings-driven routes asynchronously AFTER our apply() — see
//       boot-markers.ts ROUTE_PROVIDER_CHECK_SETTLE_MS for the measured
//       timeline and the registry-growth + quiet-fallback design.
//   * `[omo-agents] route provider check FAILED: <describeError>` /
//     `[omo-agents] llm inject FAILED: <describeError>`
//     — unexpected-error discipline shared with every sibling boot block.
//   * P4.5-T5 registration outlet (three forms, built by concerto-preset.ts):
//     `[omo-agents] concerto preset registered: id=concerto broken=absent`
//     — the ONLY success form: register resolved AND the roster read back
//     the entry with `broken` ABSENT (arbitration ②: "register did not
//     throw" is not evidence — mount failures never reject). The line names
//     the id and the verdict; the probe greps it whole (-qF), never as a
//     prefix.
//     `[omo-agents] concerto preset register face absent, materialized path
//     only` — the 0.1.5 shape: no register member on the service, the
//     materialized write above owns the registration.
//     `[omo-agents] concerto preset register FAILED: <reason>` — loud-but-
//     non-fatal; already inside the probe's existing negative grep
//     `\[omo-agents\] concerto .* FAILED` (scripts/concerto-mode-probe.sh:939).

// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import {
  CONCERTO_TEMPLATE_DIR,
  concertoPresetDir,
  formatConcertoRosterLine,
  registerConcertoPreset,
  syncConcertoPreset,
  type ConcertoSyncOutcome,
  type PresetDisposer,
} from './concerto-preset.ts'
import { SISYPHUS_SECTION_ORDER, buildSisyphusSystemPrompt } from './system-prompt.ts'
import { resolveModelRoutesWithWarnings, type ModelRoutes } from './model-routes.ts'
import { DELEGATION_ENTRIES } from './roster.ts'
import { buildAgentPersona } from './persona-prompts.ts'
import {
  describeError,
  formatPersonaAssembledLine,
  formatPersonaFailedLine,
  formatRouteSummaryLine,
  formatRouteWarningLine,
  registerRouteProviderCheck,
  type LlmServiceLike,
} from './boot-markers.ts'
import {
  HARD_BLOCKS_INJECTION_EVENT,
  registerHardBlocksInjection,
  type PreStepRegistrationContext,
} from './hard-blocks-injection.ts'

export const name = 'omo-agents'

// Minimal structural typings — this workspace has no cordis dependency, so
// the plugin declares only the shape it touches (keeps `pnpm typecheck`
// honest without importing DSH types).
// P4.5-T5 shape extension: 0.2.x `agent-preset-registry` rows carry
// `broken?: string` — ABSENT is the normal form (`...(broken === undefined
// ? {} : { broken })`, agent-preset-registry/src/index.ts:161 @
// dsh-v0.2.0-rc.2), so the readback asserts absence, never a value.
//
// P4.5-T6: `trust` is GONE from this declaration. The 0.2.x roster row is
// built by one object literal (agent-preset-registry/src/index.ts:156-162 @
// dsh-v0.2.0-rc.2) whose ONLY keys are id/name/description/order/broken —
// `trust` was 0.1.5-only vocabulary, so a field left declared here would be
// an invitation to read a key that can never exist (it printed `concerto:?`
// at boot, which is what the probe used to assert). Deleting the key makes
// the vocabulary DEAD in this repo: any re-introduced `preset.trust` read
// fails `pnpm typecheck`, so the regression cannot come back silently.
// `isDefault` is deliberately NOT declared here either: it is NOT a `list()`
// key — only `remoteExportList()` adds it (:173), and the print line below
// reads `list()`. Asserting `isDefault` belongs to the roster RPC face in
// scripts/concerto-mode-probe.sh, never to this in-process row.
interface RosterEntry {
  id: string
  name?: string
  broken?: string
}

// P4.5-T5: `register` is OPTIONAL on purpose — its presence IS the 0.2.x
// capability probe's answer (0.1.5's agent-presets service has no register
// member; the probe is concerto-preset.ts `hasAgentPresetsRegisterFace`,
// which reads the runtime handle, not this type).
interface AgentPresetsLike {
  list(): Promise<RosterEntry[]>
  register?(definition: {
    id: string
    name?: string
    description?: string
    order?: number
    plugins: readonly Record<string, unknown>[]
  }): Promise<PresetDisposer>
}

/**
 * `ctx.inject` is cordis's "start this callback once these services exist"
 * form. One overload per call site keeps each callback's injected surface
 * exact: agentPresets for the T6 roster read, and — since P2-T16(D) — the llm
 * service for the provider-registration warning. The `llm` overload types ONLY
 * the method the check calls (boot-markers.ts `LlmServiceLike`).
 */
interface InjectingContext extends PreStepRegistrationContext {
  inject(
    deps: readonly ['agentPresets'],
    cb: (injected: { agentPresets: AgentPresetsLike }) => unknown,
  ): void
  inject(
    deps: readonly ['llm'],
    cb: (injected: LlmInjection) => unknown,
  ): void
}

/**
 * The `ctx.inject(['llm'])` surface: the service plus `on`, which the settled
 * provider check uses to observe `llm/adapters-updated` (see
 * boot-markers.ts `registerRouteProviderCheck`). `on` is the same cordis
 * listener form as PreStepRegistrationContext's, just without a payload.
 */
interface LlmInjection {
  llm: LlmServiceLike
  on(event: string, listener: () => void): unknown
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

  // T14 → P2-T16(B/C): resolve + validate all 11 roster routes at apply() time
  // so a misconfiguration is loud at boot (the probe asserts the summary
  // marker), log the ONE 11-route summary line, and surface the two
  // non-blocking plan §4.6 route-value warnings. The AC-5 precheck still
  // throws through this same catch: `model routes FAILED` is unchanged.
  let routes: ModelRoutes | undefined
  try {
    const resolved = resolveModelRoutesWithWarnings()
    routes = resolved.routes
    console.log(formatRouteSummaryLine(resolved.routes))
    for (const warning of resolved.warnings) console.log(formatRouteWarningLine(warning))
  } catch (err) {
    console.log(`[omo-agents] model routes FAILED: ${describeError(err)}`)
  }

  // P2-T16(D): runtime provider-registration check (plan §4.6 third warning).
  // NON-BLOCKING by contract — registration is keyless and hot-loadable, so a
  // missing adapter must never take the boot down; a deployment missing e.g.
  // the pi-ai settings section otherwise only fails later, when a fast-seat
  // child is first delegated to (session-level model-unavailable, not a
  // boot-visible line). `ctx.inject` never fires without the llm service, in
  // which case no line is logged at all. Only runs when the routes resolved,
  // because the check is a function of them. The reporting read is SETTLED
  // (boot-markers.ts registerRouteProviderCheck): a settings-driven adapter
  // registers after this apply() runs, so an immediate read would false-
  // positive on a fully registered deployment.
  if (routes !== undefined) {
    const resolvedRoutes = routes
    try {
      ctx.inject(['llm'], (injected) => {
        registerRouteProviderCheck(injected, injected.llm, resolvedRoutes, console.log)
      })
    } catch (err) {
      console.log(`[omo-agents] llm inject FAILED: ${describeError(err)}`)
    }
  }

  // P2-T16(A): assemble every delegation persona at apply() time — the T10
  // explore block generalized to `DELEGATION_ENTRIES` (roster order). Same
  // loud-but-non-fatal discipline, now PER AGENT: each row gets its own
  // try/catch, so one broken persona file surfaces here (naming the agent)
  // rather than at that agent's first delegation, and never suppresses the
  // other nine markers. The conductor keeps its separate
  // `omo-sisyphus system prompt assembled` marker below.
  for (const entry of DELEGATION_ENTRIES) {
    try {
      const persona = buildAgentPersona(entry.id)
      console.log(formatPersonaAssembledLine(entry.id, persona))
    } catch (err) {
      console.log(formatPersonaFailedLine(entry.id, err))
    }
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
      // P4.5-T5: the registration outlet runs INSIDE this inject callback —
      // the ONLY call site where the agentPresets handle is measured present
      // (apply()'s synchronous stretch reads `undefined` 100% of the time,
      // T1 Q-3 §3.1; registry :126-127 forbids register() inside a Host
      // row's own activation, and the structural invariant that keeps that
      // safe is `omo-agents` NOT being a row of the composition it
      // registers — it is the host insert row cordis.yml:36-38). The
      // callback RETURNS the disposer so cordis collects it as the injected
      // child fiber's disposal (fiber.ts:373-374); it is idempotent, so no
      // once guard is added. On 0.1.5 the face probe says no and the
      // materialized path above stays the whole story.
      //
      // ⚠️ COST REGISTERED (arbitration #4, 2026-10-04): `inject`'s official
      // signature is `Plugin.Function<void>` (vendor/cordis/src/registry.ts:300
      // @ dsh-v0.2.0-rc.2) — the callback is TYPED to return void. Returning
      // the disposer is RUNTIME-EFFECTIVE but TYPE-LAYER OVER REACH: it rides
      // cordis's implementation convention that a function plugin's return
      // value is treated as an effect (fiber.ts:366, :373-374 → safeCollect
      // :359-361 → collect :230-232 → child-fiber disposal :265-297, chain
      // one-hand verifiable), NOT its API contract. A cordis upgrade that
      // stops collecting function returns silently un-holds this disposer —
      // that is the price of the convention, kept visible here. The local
      // `let disposer` + return REPLACES the plan's original "module-level
      // slot" wording (arbitration: cordis collection is automatic; a slot
      // would be human-memory burden instead).
      let disposer: PresetDisposer | undefined
      try {
        disposer = await registerConcertoPreset(
          injected.agentPresets,
          console.log,
          CONCERTO_TEMPLATE_DIR,
        )
      } catch (err) {
        // registerConcertoPreset is loud-but-non-fatal by contract; reaching
        // here means something outside its catch surfaced — same discipline.
        console.log(`[omo-agents] concerto preset register FAILED: ${describeError(err)}`)
      }
      try {
        // P4.5-T6. A first `list()` can come back EMPTY at the instant the
        // inject callback fires (T1 Q-3 §1.4, reproduced twice: rows land on
        // the next microtask). Printing that as a roster line would hand the
        // probe a prefix-only match on `concerto roster: ` with no rows —
        // exactly the vacuity the arbitration assigned to T6 — so read once
        // more after a tick before declaring it empty, and print an explicit
        // EMPTY token when it really is empty. No wait/retry loop: one
        // settle re-read, then the honest token (arbitration: 不得设计等待).
        let roster = await injected.agentPresets.list()
        if (roster.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0))
          roster = await injected.agentPresets.list()
        }
        // Vocabulary: the pre-T6 line printed `${id}:${trust ?? '?'}`, and
        // `trust` is not a 0.2.x roster key at all, so EVERY row printed a
        // naked `?` (`concerto:?`) — a placeholder dressed as a verdict. The
        // shipped helper now prints the field the registry really produces
        // (`broken`, absent on a healthy row) and refuses to invent
        // `isDefault`, which only `remoteExportList()` returns.
        console.log(formatConcertoRosterLine(roster))
      } catch (err) {
        console.log(`[omo-agents] concerto roster FAILED: ${describeError(err)}`)
      }
      return disposer
    })
  } catch (err) {
    console.log(`[omo-agents] agentPresets inject FAILED: ${describeError(err)}`)
  }
}
