// ast-grep-sg-provision.ts — S-16 listener, semantic PORT of upstream
// packages/omo-opencode/src/hooks/ast-grep-sg-provision/hook.ts + index.ts
// @ v4.19.4 (frozen baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a).
// 语义移植（semantic port only）: the gate order, the once-per-process memory, the
// async scheduling and the never-break-the-session discipline are upstream's
// (hook.ts:24-73 transcribed branch for branch); the EVENT and the LOG surface
// are DSH's (mapped below). No upstream code is vendored; this is a new listener.
//
// ═══════════ THE EVENT SEAM — NAIL WITH EVIDENCE, NOT IMPROVISATION ═══════════
// Upstream fired on `session.created` (hook.ts:63 `if (input.event.type !==
// "session.created") return`). The faithful DSH seam is the native session
// creation announcement, registered through this plugin's preferred channel
// (`ctx.on`, index.ts discipline ①):
//
//   ctx.on('session/created', …)
//
// Evidence that this seam is the once-per-session / early / async-safe shape
// (installed tree, dsh@0.2.0-rc.2):
//   · EMITTED EXACTLY ONCE PER SESSION: "Emit `session/created` exactly once
//     for an entered session" — dsh-session/lib/index.js:1775, dispatch site
//     :1789-1791 (collectSessionCallbacks → ctx.events.dispatch, :1224-1226);
//     re-announce THROWS (:1784), so a second firing cannot even be staged.
//   · EARLY: it is the "Creation announcement during session publication"
//     (dsh-tool-cordis/lib/types/api-catalog.js:4116-4119, mode 'emit'), and
//     the agent factory composes everything registered through agentCtx
//     "before `session/created`, `agent/created`, and the first prompt
//     assembly" (dsh-agent/lib/types/index.d.ts:94-95) — the session exists and
//     is complete when the listener runs, and no prompt has been sent yet.
//   · ASYNC-SAFE: a returned promise that rejects is logged by the emitter and
//     cannot veto or break the publication ("A returned-promise rejection is
//     logged but cannot retroactively veto this synchronous boundary",
//     api-catalog :4120; the emitter's own `Promise.resolve(returned).catch(…
//     logger.warn)` at dsh-session/lib/index.js:1796-1798). Our listener body
//     is synchronous anyway (schedule, never await), and the scheduled task
//     catches its own errors (§FAILURE SHAPE below) — belt AND suspenders.
//   · ESTABLISHED SURFACE: 14+ installed packages register exactly this way
//     (`ctx.on("session/created", (session) => …)` — dsh-session-projection-cache
//     lib/index.js:313, dsh-session-telemetry lib/index.js:66,
//     dsh-api-session-controller lib/index.js:1472, dsh-permission-presets
//     lib/index.js:202, dsh-schedule lib/index.js:2669, …). This is the seam
//     the host itself uses for per-session-creation work; upstream's
//     `session.created` maps onto it 1:1 in name and semantics.
// PAYLOAD MAPPING: upstream read `{ event: { type } }`; the DSH emit passes the
// Session itself (api-catalog :4121 `parameters: [session]`). Upstream's body
// never inspected the session — the event TYPE was the entire gate — so the
// DSH listener's gate is the event name itself (registered on it, fired once per
// session); the handler signature stays `(session: unknown)` to honour the emit
// arity and ignore the payload, which is exactly upstream's behaviour re-spelled.
//
// ═══════════ THE GATES — UPSTREAM ORDER, VERBATIM ═══════════
// hook.ts:63-67 transcribed: (1) already-provisioned-this-process short-circuit
// (the `provisionedTargets` Set, :24 — the provision-once memory; cleared for
// tests via clearAstGrepSgProvisionTargetsForTesting, :51-53); (2) resolver
// short-circuit — `findSgBinarySync({ runtimeDir: targetDir })` non-null means
// sg is present (env override → runtimeDir → PATH, sg-resolver.ts header — the
// OMO_AST_GREP_SG_PATH override is ALSO the hermetic e2e/CI control: an e2e
// boot that exports it never schedules a download, FORKS.md §5.1 sg fixture);
// (3) schedule async — setTimeout(0) + unref (upstream :26-31 verbatim), so the
// event path never blocks and never keeps the process alive.
// targetDir = astGrepRuntimeDir(join(homeDir(), ".omo"), platform, arch)
// (upstream :58) — the SAME formula install-script.ts exports verbatim, which
// is also the directory convention the vendored skill's install.sh honours via
// OMO_AST_GREP_BIN_DIR (install-script.ts dual-source wiring header).
//
// ═══════════ FAILURE SHAPE — LOUD, NAMED, NEVER BREAKING ═══════════
// Upstream logged failures via its shared logger (hook.ts:37-40, :68-71). The
// plugin convention for a degraded capability is a named NOTE/WARN line on the
// console (index.ts provideStopContinuationGuard precedent uses console.warn for
// exactly this class) — so failures log through `console.warn` with the marker
// prefix `[omo-hooks] ast-grep-sg-provision` and a STRUCTURED GUIDANCE block
// (manual install paths + the env override), never a bare rethrow:
//
//   [omo-hooks] ast-grep-sg-provision PROVISION FAILED (<code>): <message>
//   [omo-hooks] ast-grep-sg-provision guidance: the vendored `ast-grep` skill teaches the `sg` CLI, but no `sg` binary is guaranteed on PATH — install ast-grep pinned to <version> manually (https://ast-grep.github.io), or pre-seed a binary and export OMO_AST_GREP_SG_PATH=<path> (the resolver's first gate). targetDir: <dir>
//
// The FAILED line's second logger argument retains the original Error cause chain.
// The stable message stays upstream-shaped, while console.warn still exposes a
// nested ECONNREFUSED that Node's top-level "fetch failed" message would hide.
//
// THE "skill present but binary unguaranteed" INVARIANT (空头指令纪律,
// phase6-mcp-editing.md G-3) lives HERE — in this loud failure path — and NOT
// as a boot-time hard failure: a session must never die because a helper binary
// is absent (upstream parity: the provisioning hook is best-effort, hook.ts:33-41).
// The skill precondition itself (SKILL.md present, teaches `sg`, and the binary
// name the hook writes matches what the skill teaches) is pinned by the unit
// suite, so the invariant is TESTED at build time and LOUD at runtime.
//
// DISCIPLINES (plan §4.2): ① registers through ctx.on — fiber-scoped, returns
// nothing; ② the handler body wraps its OWN logic in try/catch and fails open
// (upstream :68-71's own catch, kept); ③ no disk reads on the event path at
// REGISTRATION time — the resolver's existsSync/PATH scan runs inside the
// event handler, which is upstream's own event-path behaviour (hook.ts:65),
// and it is short-circuited by the once-per-process memory after the first
// event; the download itself is async off the event path.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import { homedir } from "node:os"
import { join } from "node:path"

import {
  astGrepRuntimeDir,
  findSgBinarySync,
  provisionSgBinary,
  SG_PINNED_VERSION,
  type SgProvisionOptions,
  type SgResolverOptions,
} from '../ast-grep/index.ts'
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar } from '../index.ts'

/** The manifest id this registrar implements (manifest.ts row ast-grep-sg-provision). */
export const AST_GREP_SG_PROVISION_ID = 'ast-grep-sg-provision'

/**
 * The one and only DSH event this listener registers on — the seam nailed in the
 * header (mode F: session lifecycle observation with an async side effect).
 */
export const AST_GREP_SG_PROVISION_EVENT = 'session/created'

/** The loud named marker prefix — pinned by the unit suite, greppable by T7's e2e. */
export const AST_GREP_SG_PROVISION_MARKER = '[omo-hooks] ast-grep-sg-provision'

export interface AstGrepSgProvisionDeps {
  readonly arch?: string
  readonly findSgBinary: (options: SgResolverOptions) => string | null
  readonly homeDir: () => string
  readonly log: (message: string, data?: Record<string, unknown>) => void
  readonly platform?: NodeJS.Platform
  readonly provisionSgBinary: (options: SgProvisionOptions) => Promise<string>
  readonly schedule: (task: () => Promise<void>) => void
}

/**
 * Upstream hook.ts:24 — the provision-once memory, verbatim semantics: keyed by
 * targetDir (the process-scoped Set; upstream's own shape, cleared only by the
 * testing export).
 */
const provisionedTargets = new Set<string>()

/** Upstream hook.ts:26-31, verbatim — macrotask hop + unref (never holds the process). */
function defaultSchedule(task: () => Promise<void>): void {
  const timer = setTimeout(() => {
    void task()
  }, 0)
  timer.unref?.()
}

/** Default log: the loud console.warn channel (header §FAILURE SHAPE). */
function defaultLog(message: string, data?: Record<string, unknown>): void {
  if (data === undefined) {
    console.warn(message)
    return
  }
  console.warn(message, data)
}

/**
 * The structured guidance appended to every failure line (header §FAILURE
 * SHAPE): names the skill that teaches `sg`, states the binary is NOT
 * guaranteed, and gives both recovery paths (manual install / env override).
 */
export function buildProvisionFailureGuidance(targetDir: string): string {
  return `${AST_GREP_SG_PROVISION_MARKER} guidance: the vendored \`ast-grep\` skill teaches the \`sg\` CLI, but no \`sg\` binary is guaranteed on PATH — install ast-grep pinned to ${SG_PINNED_VERSION} manually (https://ast-grep.github.io), or pre-seed a binary and export OMO_AST_GREP_SG_PATH=<path> (the resolver's first gate). targetDir: ${targetDir}`
}

/**
 * Upstream runProvision (hook.ts:33-41), branch for branch: success logs the
 * finished line with the binary path; failure logs the FAILED line plus the
 * guidance block; NEITHER ever throws out (the session survives both).
 */
async function runProvision(targetDir: string, deps: AstGrepSgProvisionDeps): Promise<void> {
  try {
    const binaryPath = await deps.provisionSgBinary({ arch: deps.arch, platform: deps.platform, targetDir })
    deps.log(`${AST_GREP_SG_PROVISION_MARKER} provisioning finished`, { binaryPath, targetDir })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'unknown'
    deps.log(`${AST_GREP_SG_PROVISION_MARKER} PROVISION FAILED (${code}): ${message}`, {
      // Keep the stable one-line prefix, but do not discard the nested network
      // cause: Node's fetch message is only "fetch failed"; ECONNREFUSED lives
      // on its cause chain and is the e2e canary's proxy-refusal evidence.
      cause: error instanceof Error ? (error.cause ?? error) : error,
    })
    deps.log(buildProvisionFailureGuidance(targetDir))
  }
}

const defaultDeps: AstGrepSgProvisionDeps = {
  findSgBinary: findSgBinarySync,
  homeDir: homedir,
  log: defaultLog,
  provisionSgBinary,
  schedule: defaultSchedule,
}

/** Upstream hook.ts:51-53, verbatim — the test-only clear of the once-memory. */
export function clearAstGrepSgProvisionTargetsForTesting(): void {
  provisionedTargets.clear()
}

/**
 * The hook factory (upstream hook.ts:55-74, branch for branch):
 *   · targetDir computed ONCE at factory time (upstream :57-58) — the same
 *     astGrepRuntimeDir the install-script fallback honours;
 *   · the returned handler is the seam body: gates in upstream order, schedule
 *     async, self-catching (discipline ②), total (never throws).
 * The upstream `event.type === "session.created"` gate is discharged by the
 * registration itself — the handler is ONLY reachable through the
 * `session/created` emit (seam evidence in the header) — so it does not
 * re-spell a type check the registration already performs.
 */
export function createAstGrepSgProvisionHook(depsOverride: Partial<AstGrepSgProvisionDeps> = {}) {
  const deps: AstGrepSgProvisionDeps = { ...defaultDeps, ...depsOverride }
  const platform = deps.platform ?? process.platform
  const targetDir = astGrepRuntimeDir(join(deps.homeDir(), ".omo"), platform, deps.arch ?? process.arch)

  return {
    /** The `session/created` listener body — `_session` honours the emit arity; upstream never inspected the payload either. */
    handleSessionCreated(_session?: unknown): void {
      try {
        if (provisionedTargets.has(targetDir)) return
        if (deps.findSgBinary({ runtimeDir: targetDir }) !== null) return
        provisionedTargets.add(targetDir)
        deps.schedule(() => runProvision(targetDir, deps))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        deps.log(`${AST_GREP_SG_PROVISION_MARKER} event handler failed`, { error: message })
      }
    },
  }
}

/**
 * The registrar: ONE `ctx.on('session/created', …)` through the preferred
 * channel (index.ts discipline ① — cordis scopes it to this fiber, nothing to
 * hand back), the event taken from the manifest row (which is the same literal
 * as {@link AST_GREP_SG_PROVISION_EVENT}; the registration.test pins both
 * halves so they cannot drift).
 */
export const registerAstGrepSgProvision: HookRegistrar = (
  ctx,
  entry: HookManifestEntry,
) => {
  const hook = createAstGrepSgProvisionHook()
  ctx.on(entry.event, (session: unknown) => hook.handleSessionCreated(session))
}
