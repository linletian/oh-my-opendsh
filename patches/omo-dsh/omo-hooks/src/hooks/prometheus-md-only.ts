// prometheus-md-only.ts — P3-T16 listener (task book WP-6 批 C; plan §4.2
// pattern B + D): OMO's "Prometheus may only write .omo/*.md" guard, reborn as
// a `tools/pre-execute` DENY gate plus a `tools/post-execute` advisory append.
//
// Upstream: packages/omo-opencode/src/hooks/prometheus-md-only/ @ v4.19.4
//   (frozen baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a).
//   SEVEN files, ALL of them audited for this port — 6 implementation +
//   1 test (39 `test(` — bun:test spells them `test`, not `it` — the largest
//   upstream seed in the port group):
//     * .../prometheus-md-only/agent-matcher.ts     (isPrometheusAgent — the
//         case-insensitive SUBSTRING match `includes("prometheus")`)
//     * .../prometheus-md-only/agent-resolution.ts  (getAgentFromSession: the
//         three-level fallback in-memory → boulder state → message files)
//     * .../prometheus-md-only/constants.ts         (HOOK_NAME, PROMETHEUS_AGENT,
//         ALLOWED_EXTENSIONS, ALLOWED_PATH_PREFIX, BLOCKED_TOOLS, the planning
//         consult warning, the workflow reminder)
//     * .../prometheus-md-only/hook.ts              (the one
//         `tool.execute.before` listener: identity gate → task-tool consult
//         warning → write/edit path policy → THROW on a disallowed path →
//         workflow reminder on `.omo/plans/`)
//     * .../prometheus-md-only/index.ts             (barrel export)
//     * .../prometheus-md-only/path-policy.ts       (isAllowedFile: node:path
//         resolve/relative/isAbsolute + the `.omo` segment regex + the `.md`
//         extension check — entirely self-contained, no platform API)
//     * .../prometheus-md-only/index.test.ts        (the R-3 seed)
//   语义移植（非逐字复制）: the PATH POLICY (workspace confinement, the `.omo`
//   segment rule, the extension rule) is transcribed branch for branch, and the
//   denied-path behavior is the same refusal. The IDENTITY surface and the
//   advisory LANDING are DSH's (below). No upstream code is vendored.
//
// ═══════════ 触发面 (THE KEY DESIGN QUESTION) — WHAT WAS MEASURED ═══════════
// Upstream identified the agent through `getAgentFromSession(sessionID,
// directory, client)`: an in-memory session map → boulder-state's persisted
// agent → the message files (agent-resolution.ts:41-70). NONE of those three
// levels exists on DSH, and — measured at the pinned install, not assumed —
// `exec.agent` carries NO roster-seat identifier:
//   * `Agent` exposes `id`/`options`/`session`/`inbox`/`status`/`ctx` — `id` in
//     the BASE interface (dsh-agent/lib/types/types.d.ts:11-13), the other five
//     in the runtime declaration merge
//     (dsh-agent/lib/types/runtime-types.d.ts:139-149); `session.header` carries
//     `cwd`, `parentSession`, `isSeeded`, `origin`, `delegationDepth`,
//     `agentPreset` (dsh-session/lib/types/types.d.ts:58-95) — and the child's
//     `agentPreset` is the PARENT'S preset, copied verbatim
//     (dsh-subagent/lib/index.js:502-513 `childSessionMeta`), so all ten
//     delegation children share it. The delegation TOOL NAME (roster row id) is
//     NOT persisted anywhere: the subagent descriptor's only free-form field is
//     `label`, and that is the model-supplied `description`
//     (dsh-subagent/lib/index.js:1656-1666; dsh-tool-subagent/lib/index.js:510).
//   * The capability probe the sibling H-22 port uses (which delegation tools a
//     scope can see) does not discriminate here either: `prometheus` is a
//     read-only roster row, so `denyToolNamesFor` (omo-agents/src/roster.ts:361)
//     gives it `toolFilter.deny = [write, edit, ...all ten delegation toolNames]`
//     — IDENTICAL to the other five read-only rows (explore, oracle, librarian,
//     plan-consultant, plan-reviewer).
// THE ONE SURFACE THAT DOES DISCRIMINATE (and is measured, not invented): the
// child's own durable `subagent/descriptor` event carries `persona` — "the
// per-child persona that shadows the deployment persona on resume"
// (dsh-subagent/lib/types/descriptor.d.ts, descriptor version 3), written from
// the delegation row's `config.persona`
// (dsh-subagent/lib/index.js:1656-1666). The persona text is the roster row's
// own authored markdown, and each `system-sections/<id>-persona.md` names
// itself `omo-<id>` exactly once — so `omo-prometheus` IS a per-row identity
// anchor (drift-guarded by the unit suite against the real persona file set).
// The event is read from the IN-MEMORY session log (`session.ownEvents()`),
// never from disk, and it is appended inside the child's creation window —
// before its first request (descriptor.d.ts: "appended once by the establishing
// provider inside the child's initial turn, before its first request") — so the
// very first `write`/`edit` call already sees it. The read is cached per live
// session object in a WeakMap created by the registrar (discipline ⑤); a
// session with NO descriptor is re-read every time, so a hypothetically later
// descriptor cannot be missed.
//
// ⚠️ MEASURED BOUNDARY — THE SURFACE EXISTS ONLY FOR `continuable` CHILDREN
// (P3-T16 e2e, both shapes read back out of real session logs):
//   * a BACKGROUND delegation (`run_in_background: true`, the shipped rows'
//     `backgroundMode: continuable`) goes through `startContinuable` and its
//     descriptor IS
//     `{version, mode:'continuable', provider, label, agentProvider,
//       agentModel, agentReasoningEffort, persona, toolFilter?}`
//     — the persona is there and the gate fires.
//   * a FOREGROUND delegation goes through `SubagentRuntime.start`, whose
//     descriptor is literally built as
//     `snapshotSubagentDescriptor({mode: 'one-shot', provider: name, label})`
//     (dsh-subagent/lib/index.js:3150-3154) — `OneShotSubagentDescriptorData`
//     has NO persona and NO toolFilter field (descriptor.d.ts), so the measured
//     child log carries `{version, mode:'one-shot', provider, label}`.
//     `applyChildComposition` still installs the persona in the child's LIVE
//     prompt, but nothing durable records it.
// CONSEQUENCE, recorded rather than hidden: for a foreground (`one-shot`)
// prometheus delegation this listener cannot identify the session and stays
// SILENT — the hook degrades to "does not fire", never to "fires for everyone".
// That is a real coverage boundary of the port, not a claim that the guard is
// total; the compositions that matter here are background delegations (roster
// rows are `continuable`), and Phase 3's shipped read-only filter makes
// non-`.md` writes unreachable anyway (defense in depth). Arbitration options
// for closing it are recorded in the P3-T16 report: (a) read the child's
// assembled prompt sections (`systemPrompt.assemble({scope})`, the only
// mode-independent carrier, at the cost of assembling a prompt inside a
// pre-execute listener), or (b) request a durable per-child composition field
// from the runtime. Neither is invented here.
//
// REGISTERED ASSUMPTION: the anchor is the persona PROSE (and its presence in
// the descriptor). If a deployment replaces `prometheus-persona.md` with text
// that drops `omo-prometheus`, the identity gate goes quiet; if a future
// runtime stops persisting the persona for continuable children, the same. The
// unit suite pins the anchor against the shipped file, so the repo cannot drift
// silently; a foreign persona or a foreign runtime is the deployment's call.
//
// ═══════════ 与 PHASE 2 的关系（层不冲突）═══════════
// Phase 2 deliberately did NOT mirror upstream's hook-limited `.omo/*.md` write
// capability: the prometheus persona states "You are read-only … the delegation
// tools are physically absent", and the roster's class filter
// (`toolFilter.deny = [write, edit, ...]`, read-only class) makes non-.md writes
// structurally impossible in the shipped composition
// (omo-agents/system-sections/prometheus-persona.md, the DELIBERATE NARROWING
// note ③). THAT decision is a PERSONA/PERMISSION-layer (composition) decision.
// This module is the LISTENER-layer counterpart and does not contradict it:
//   * while the roster keeps `write`/`edit` denied, the deny gate here is
//     UNREACHABLE (the registry rejects the call before any listener), and the
//     hook is pure defense-in-depth for a composition that loosens the filter;
//   * the e2e scenario proves the listener itself by lifting that ONE row's
//     `toolFilter` in a SANDBOX-ONLY preset edit (the P3-T13 precedent), so the
//     gate is exercised against a real write call without changing any shipped
//     artifact.
// phase3-hooks.md H-26 records exactly this layering ("Phase 2『有意不镜像』是
// persona/permission 层的决策，本模块在 hook listener 层补齐").
//
// ═══════════ WHAT IS AND IS NOT PORTED FROM UPSTREAM'S FOUR SEGMENTS ═══════════
// Upstream's single before-hook has four segments; their fate here is explicit:
//   1. IDENTITY gate (`isPrometheusAgent` substring match) → PORTED with the
//      DSH surface above. The substring match is NOT transcribed: it would fire
//      for any name containing "prometheus" (`prometheus-junior`, a
//      user-authored row), and on DSH the identity is an exact persona anchor.
//      The upstream matcher is kept as {@link isPrometheusAgentName} for the
//      audit trail and is used nowhere in the decision path.
//   2. TASK-TOOL consult warning (`TASK_TOOLS = ["task", "call_omo_agent"]` →
//      prepend `PLANNING_CONSULT_WARNING` to the delegation prompt, hook.ts:27-38)
//      → NOT PORTABLE, recorded (DoD-d note): its effect is on the DELEGATE's
//      prompt (the warning must be read BY the child), and DSH has no
//      pre-execute argument-rewrite seam — a post-execute `additionalContexts`
//      would deliver the warning to the PARENT's next request instead, which is
//      the wrong reader. It is also structurally unreachable on the shipped
//      composition (the prometheus row's own delegation tools are denied). The
//      upstream warning text is kept verbatim as an audit constant.
//   3. WRITE/EDIT path policy (the real refusal; hook.ts:40-62) → PORTED 1:1 as
//      the B half: the same `isAllowedFile` predicate (transcribed) over the
//      same three argument names (`file_path` first — DSH's verified write/edit
//      parameter, dsh-tool-fs/lib/index.js:600/:745 — then upstream's
//      `filePath`/`path`/`file`), refusing with the upstream message instead of
//      a throw (`throw` on DSH pre-execute = fail-closed `final-result` that
//      bypasses post-execute — plan §4.2 discipline ②; upstream's opencode
//      `throw` was its way of refusing).
//   4. WORKFLOW reminder on an allowed `.omo/plans/` write (hook.ts:64-73,
//      `output.message += PROMETHEUS_WORKFLOW_REMINDER`) → PORTED as the D half:
//      `tools/post-execute` appends the reminder to the rendered result
//      (`accept` + `content`, the H-14/H-15/H-21/H-22 precedent — upstream's
//      `output.message` lands in the tool result the model sees, whereas
//      `additionalContexts` would become a separate next-request message).
//      The reminder text is DSH-adapted: the Phase-4 command face
//      (`/start-work`) and the delegation-based consult/review steps
//      (plan-consultant/plan-reviewer `task(...)` calls, which this agent
//      physically cannot make) are removed, and the upstream text is kept
//      verbatim as an audit constant.
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2, all modes):
//   ② both listener bodies wrap their OWN logic in try/catch and fail OPEN
//      (`return next()`); the refusal is an explicit `{kind:'deny', reason}`
//      decision and NEVER a throw (pre-execute throw = fail-closed
//      `final-result`, post-execute throw = the whole result becomes an isError).
//      `next()` sits OUTSIDE the try in both bodies.
//   ③ no disk reads on the event path — the only session read is the in-memory
//      descriptor described above; both texts are module constants and the path
//      policy is pure `node:path`.
//   ⑤ no bare Map: the identity cache is a per-registration WeakMap keyed by the
//      live session object, reset on `session/disposed`.
//   pre/post pairing: NOT NEEDED — `exec` is the SAME live object in both
//      waterfall stages, so the D half re-derives the target path from
//      `exec.arguments` (leaf read) and the identity from the same session. No
//      `callId`/`token` bookkeeping is introduced, and none is needed.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import { isAbsolute, relative, resolve } from 'node:path'
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar } from '../index.ts'

/** The manifest id this registrar implements (manifest.ts row H-26). */
export const PROMETHEUS_MD_ONLY_ID = 'prometheus-md-only'

/** The PRIMARY surface: the B-mode deny gate (the manifest row's `event`). */
export const PROMETHEUS_MD_ONLY_EVENT = 'tools/pre-execute'

/**
 * The SECONDARY surface: the D-mode workflow-reminder append. A B+D row owns
 * its full surface set inside its registrar (index.ts discipline ④).
 */
export const PROMETHEUS_MD_ONLY_SECONDARY_EVENT = 'tools/post-execute'

/** Upstream constants.ts:4 — the hook name (also the denial message's prefix). */
export const HOOK_NAME = 'prometheus-md-only'

/** Upstream constants.ts:6 — the substring upstream matched agent names against. */
export const PROMETHEUS_AGENT = 'prometheus'

/**
 * THE DSH identity anchor: the `omo-<id>` self-name that
 * `omo-agents/system-sections/prometheus-persona.md` carries exactly once
 * (`You are **omo-prometheus**, a planning consultant.`). The unit suite
 * asserts against the REAL file set that this string appears in exactly one
 * persona file — the drift guard for the registered assumption in the header.
 */
export const PROMETHEUS_PERSONA_ANCHOR = 'omo-prometheus'

/** The persona file the anchor is drift-guarded against (repo-relative). */
export const PROMETHEUS_PERSONA_FILE = 'patches/omo-dsh/omo-agents/system-sections/prometheus-persona.md'

/** Upstream constants.ts:8 — the only allowed extension. */
export const ALLOWED_EXTENSIONS: readonly string[] = ['.md']

/** Upstream constants.ts:10 — the only allowed workspace subtree. */
export const ALLOWED_PATH_PREFIX = '.omo'

/**
 * The VERIFIED DSH write-class tool names. Upstream enumerated
 * `["Write", "Edit", "write", "edit"]` (constants.ts:12) because opencode
 * registers both casings; DSH's registry names tools canonically lowercase
 * (`write`/`edit`, dsh-tool-fs/lib/index.js:597/:742), so the live set is the
 * two lowercase ids and the upstream quartet is kept beside it as the audit
 * record.
 */
export const BLOCKED_TOOLS: readonly string[] = ['write', 'edit']

/** Upstream's own four-name list, verbatim (audit only — see {@link BLOCKED_TOOLS}). */
export const UPSTREAM_BLOCKED_TOOLS: readonly string[] = ['Write', 'Edit', 'write', 'edit']

/** Upstream constants.ts:20 — the planning-context wrapper opening tag. */
export const PLANNING_CONTEXT_OPEN = '<planning-context source="prometheus-read-only">'

/** Upstream constants.ts:21 — the planning-context wrapper closing tag. */
export const PLANNING_CONTEXT_CLOSE = '</planning-context>'

/**
 * Upstream constants.ts:23-44 — the consult warning prepended to a delegated
 * prompt. Kept VERBATIM as the audit constant; NOT delivered by this port (see
 * segment 2 in the header). It is not exported as live text because nothing may
 * reasonably consume it on DSH.
 */
export const UPSTREAM_PLANNING_CONSULT_WARNING = `

---

${PLANNING_CONTEXT_OPEN}

You are being invoked by Prometheus, a planning agent restricted to .omo/*.md plan files only.

**CRITICAL CONSTRAINTS:**
- DO NOT modify any files (no Write, Edit, or any file mutations)
- DO NOT execute commands that change system state
- DO NOT create, delete, or rename files
- ONLY provide analysis, recommendations, and information

**YOUR ROLE**: Provide consultation, research, and analysis to assist with planning.
Return your findings and recommendations. The actual implementation will be handled separately after planning is complete.

${PLANNING_CONTEXT_CLOSE}

---

`

/**
 * The LIVE workflow reminder (upstream constants.ts:46-89, DSH-adapted). Kept
 * deliberately close to upstream's wording and structure; the edits are:
 *   * the `[SYSTEM DIRECTIVE: …]` line is dropped — `createSystemDirective` is
 *     an OMO-internal marker with no DSH registry behind it;
 *   * upstream's five-row table named `/start-work` (a Phase 4 command face)
 *     and two delegation steps (plan-consultant / plan-reviewer `task(...)`
 *     calls) this agent physically cannot make; the reminder is reduced to the
 *     three steps that exist here, with the plan's own todo-row contract;
 *   * the closing instructions keep upstream's two self-questions verbatim
 *     (they are the actual check) and drop the `/start-work` pointer.
 * The upstream text is preserved verbatim in
 * {@link UPSTREAM_PROMETHEUS_WORKFLOW_REMINDER} for the audit trail.
 */
export const PROMETHEUS_WORKFLOW_REMINDER = `

---

## PROMETHEUS MANDATORY WORKFLOW REMINDER

**You are writing a work plan. STOP AND VERIFY you completed ALL steps:**

    1  INTERVIEW: full consultation with the conductor (gather ALL
       requirements, clarify ambiguities, record decisions).
    2  PLAN GENERATION: write to .omo/plans/*.md   <- YOU ARE HERE
    3  SUMMARY: present the plan, its scope IN/OUT, every default you adopted
       and every surviving question.

**DID YOU COMPLETE STEP 1 BEFORE WRITING THIS PLAN?**
**AFTER WRITING, WILL YOU RETURN THE PLAN AS YOUR REPORT?**

If you skipped a step, STOP NOW. Go back and complete it.

---

`

/** Upstream constants.ts:46-89 — the reminder verbatim, for the audit trail. */
export const UPSTREAM_PROMETHEUS_WORKFLOW_REMINDER = `

---

## PROMETHEUS MANDATORY WORKFLOW REMINDER

**You are writing a work plan. STOP AND VERIFY you completed ALL steps:**

┌─────────────────────────────────────────────────────────────────────┐
│                     PROMETHEUS WORKFLOW                             │
├──────┬──────────────────────────────────────────────────────────────┤
│  1   │ INTERVIEW: Full consultation with user                       │
│      │    - Gather ALL requirements                                 │
│      │    - Clarify ambiguities                                     │
│      │    - Record decisions to .omo/drafts/                   │
├──────┼──────────────────────────────────────────────────────────────┤
│  2   │ METIS CONSULTATION: Pre-generation gap analysis              │
│      │    - task(agent="Metis - Plan Consultant", ...)     │
│      │    - Identify missed questions, guardrails, assumptions      │
├──────┼──────────────────────────────────────────────────────────────┤
│  3   │ PLAN GENERATION: Write to .omo/plans/*.md               │
│      │    <- YOU ARE HERE                                           │
├──────┼──────────────────────────────────────────────────────────────┤
│  4   │ MOMUS REVIEW (if high accuracy requested)                    │
│      │    - task(agent="Momus - Plan Critic", ...)         │
│      │    - Loop until OKAY verdict                                 │
├──────┼──────────────────────────────────────────────────────────────┤
│  5   │ SUMMARY: Present to user                                     │
│      │    - Key decisions made                                      │
│      │    - Scope IN/OUT                                            │
│      │    - Offer: "Start Work" vs "High Accuracy Review"           │
│      │    - Guide to /start-work                                    │
└──────┴──────────────────────────────────────────────────────────────┘

**DID YOU COMPLETE STEPS 1-2 BEFORE WRITING THIS PLAN?**
**AFTER WRITING, WILL YOU DO STEPS 4-5?**

If you skipped steps, STOP NOW. Go back and complete them.

---

`

// --- path policy (upstream path-policy.ts, transcribed branch for branch) ----

/**
 * Upstream `isAllowedFile` (path-policy.ts:14-39), transcribed branch for
 * branch. The four rules, in upstream's order:
 *   1. resolve the path against the workspace root;
 *   2. take the workspace-relative form;
 *   3. reject anything that escapes the root (`..` prefix or an absolute
 *      remainder — the `isAbsolute(rel)` arm covers a different Windows drive);
 *   4. require a `.omo` path SEGMENT (not a substring: the `(^|[/\\])\.omo([/\\]|$)`
 *      regex, case-insensitive, so `.omo-backup/x.md` and `x.omo.md` do not
 *      qualify) and an extension in {@link ALLOWED_EXTENSIONS}
 *      (case-insensitive, matched against the RESOLVED path — upstream does the
 *      same, so a trailing `.MD` is allowed).
 *
 * Pure `node:path` + regex: no platform API, which is why this half of the
 * module is portable 1:1 (P3-T1 §9: "判定完全自包含、只用 node:path").
 */
export function isAllowedFile(filePath: string, workspaceRoot: string): boolean {
  // 1. Resolve to absolute path.
  const resolved = resolve(workspaceRoot, filePath)
  // 2. Get relative path from workspace root.
  const rel = relative(workspaceRoot, resolved)
  // 3. Reject if it escapes the root.
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return false
  }
  // 4a. Require the `.omo` segment.
  if (!/(^|[/\\])\.omo([/\\]|$)/i.test(rel)) {
    return false
  }
  // 4b. Require an allowed extension (case-insensitive, against the resolved path).
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some(
    (ext) => resolved.toLowerCase().endsWith(ext.toLowerCase()),
  )
  if (!hasAllowedExtension) {
    return false
  }
  return true
}

/**
 * Upstream hook.ts:44 — the three argument names, in upstream's precedence
 * order. DSH's write/edit parameter is `file_path` (verified), so it leads and
 * upstream's three names follow, unmodified, for parity with a foreign
 * registration.
 */
export function readWriteTargetPath(argumentsBag: unknown): string | undefined {
  if (typeof argumentsBag !== 'object' || argumentsBag === null) return undefined
  const args = argumentsBag as {
    readonly file_path?: unknown
    readonly filePath?: unknown
    readonly path?: unknown
    readonly file?: unknown
  }
  const candidate = args.file_path ?? args.filePath ?? args.path ?? args.file
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined
}

/** True when `exec.name` is one of the write-class tools (upstream BLOCKED_TOOLS). */
export function isWriteClassExecution(exec: unknown): boolean {
  if (typeof exec !== 'object' || exec === null) return false
  const name = (exec as { readonly name?: unknown }).name
  return typeof name === 'string' && BLOCKED_TOOLS.includes(name)
}

/** True when the tools-registry name would satisfy upstream's substring matcher (audit only). */
export function isPrometheusAgentName(agentName: string | undefined): boolean {
  return agentName?.toLowerCase().includes(PROMETHEUS_AGENT) ?? false
}

// --- minimal structural typings of the DSH surface this file touches ---------

/** The B-mode decision (dsh-tools PreToolDecision's `deny` arm). */
export interface PrometheusDenyDecision {
  readonly kind: 'deny'
  readonly reason: string
}

/** The D-mode decision: append the reminder to the rendered content. */
export interface PrometheusAppendDecision {
  readonly kind: 'accept'
  readonly content: readonly { readonly type: 'text'; readonly text: string }[]
}

/** The `tools/pre-execute` delegator handed to the listener by the waterfall. */
export type PreExecuteNextLike = () => Promise<unknown>

/** The `tools/post-execute` delegator (three-argument waterfall). */
export type PostExecuteNextLike = () => Promise<unknown>

/** The session shape this file reads (live Session; leaves only). */
export interface SessionLike {
  readonly header?: { readonly cwd?: unknown }
  ownEvents?(): readonly unknown[]
  snapshotEvents?(): readonly unknown[]
}

/**
 * One cached identity answer, keyed by the live session object. Exported
 * because the cache type is part of the public shape of
 * {@link isPrometheusSession} / {@link decidePrometheusMdOnlyDeny}, and a
 * consumer (the unit suite) must be able to name the map it hands in.
 */
export interface CachedPersona {
  readonly persona: string | undefined
}

/** The remote/disposed reset surface `ctx.on` gives us (structural). */
export type SessionDisposedListener = (session: unknown) => void

/**
 * Reads the child's own durable `subagent/descriptor` persona from the
 * session's IN-MEMORY log. The FIRST descriptor is authoritative
 * (dsh-subagent/lib/types/descriptor.d.ts: "The first `subagent/descriptor`
 * event is authoritative — the establishing provider appends exactly one"), so
 * the scan stops at the first one that is present.
 *
 * Returns `undefined` when the session has no descriptor (not a delegation
 * child), when the descriptor carries no persona, or when the session exposes
 * no in-memory log at all. Leaf reads only — no event is copied or serialized.
 */
export function readChildPersona(session: unknown): string | undefined {
  return readDescriptorIdentity(session).persona
}

/**
 * One pass over the session's own in-memory log returning BOTH facts the
 * identity gate needs: whether a descriptor exists at all (cacheability) and
 * the persona it carries.
 */
function readDescriptorIdentity(session: unknown): { found: boolean; persona: string | undefined } {
  if (typeof session !== 'object' || session === null) return { found: false, persona: undefined }
  const s = session as SessionLike
  let events: readonly unknown[]
  try {
    if (typeof s.ownEvents === 'function') events = s.ownEvents()
    else if (typeof s.snapshotEvents === 'function') events = s.snapshotEvents()
    else return { found: false, persona: undefined }
  } catch {
    return { found: false, persona: undefined }
  }
  for (const event of events) {
    if (typeof event !== 'object' || event === null) continue
    if ((event as { readonly type?: unknown }).type !== 'subagent/descriptor') continue
    const data = (event as { readonly data?: unknown }).data
    if (typeof data !== 'object' || data === null) return { found: true, persona: undefined }
    const persona = (data as { readonly persona?: unknown }).persona
    return { found: true, persona: typeof persona === 'string' ? persona : undefined }
  }
  return { found: false, persona: undefined }
}

/**
 * The identity predicate: is the executing session the prometheus roster child?
 * `undefined`/cached-miss semantics:
 *   * a descriptor WAS found → the answer is cached (the descriptor is durable),
 *     including "found, but no persona" (`persona: undefined`);
 *   * NO descriptor was found → NOT cached, so a descriptor that appears later
 *     is still observed.
 */
export function isPrometheusSession(
  session: unknown,
  cache: WeakMap<object, CachedPersona>,
): boolean {
  if (typeof session !== 'object' || session === null) return false
  const cached = cache.get(session)
  if (cached !== undefined) return personaMatches(cached.persona)
  const identity = readDescriptorIdentity(session)
  if (identity.found) cache.set(session, { persona: identity.persona })
  return personaMatches(identity.persona)
}

/** True when the persona text carries the prometheus anchor. */
function personaMatches(persona: string | undefined): boolean {
  return persona !== undefined && persona.includes(PROMETHEUS_PERSONA_ANCHOR)
}

/** The session's workspace root — the DSH analog of upstream's `ctx.directory`. */
export function readSessionCwd(session: unknown): string | undefined {
  if (typeof session !== 'object' || session === null) return undefined
  const header = (session as SessionLike).header
  if (typeof header !== 'object' || header === null) return undefined
  const cwd = (header as { readonly cwd?: unknown }).cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/** `exec.agent.session`, read defensively (the listener receives `unknown`). */
export function readExecutionSession(exec: unknown): unknown {
  if (typeof exec !== 'object' || exec === null) return undefined
  const agent = (exec as { readonly agent?: unknown }).agent
  if (typeof agent !== 'object' || agent === null) return undefined
  return (agent as { readonly session?: unknown }).session
}

/**
 * The B half's reason text — upstream's refusal message (hook.ts:56-61), with
 * two deliberate edits:
 *   * `/start-work` is gone (a Phase 4 command face; the naming anchor for that
 *     hook is `ulw-execute` and neither command exists in this harness). The
 *     sentence keeps upstream's meaning — the change must be recorded, not
 *     implemented — without pointing at a command that does not exist.
 *   * the format-string spacing is upstream's single-space join.
 * It does NOT start with `Error: ` (DSH materializes a deny as `Error: ${reason}`,
 * dsh-tools/lib/index.js:3127-3140, the prefix itself at :3134), and it KEEPS
 * upstream's `[prometheus-md-only]` prefix — that token is upstream's own marker
 * and the e2e's grep anchor.
 */
export function buildPrometheusDenyReason(filePath: string): string {
  return `[${HOOK_NAME}] Prometheus is a planning agent. File operations restricted to `
    + '.omo/*.md plan files only. '
    + 'Do NOT route this change through a subagent either - delegated implementation is still '
    + 'implementation. '
    + 'Record the intended change as a todo in the plan; implementation starts only in a '
    + 'separate execution session the caller opens. '
    + `Attempted to modify: ${filePath}.`
}

/**
 * The B half's pure decision. `undefined` means "not our call / allowed → let
 * the waterfall continue"; a decision means "refuse".
 *
 * Upstream's order is kept: tool gate → path presence → policy. A missing
 * `file_path` is upstream's `if (!filePath) return` (hook.ts:44-47) — the tool
 * itself will reject the call for its own missing argument.
 */
export function decidePrometheusMdOnlyDeny(
  exec: unknown,
  cache: WeakMap<object, CachedPersona>,
): PrometheusDenyDecision | undefined {
  if (!isWriteClassExecution(exec)) return undefined
  const session = readExecutionSession(exec)
  if (!isPrometheusSession(session, cache)) return undefined
  const filePath = readWriteTargetPath((exec as { readonly arguments?: unknown }).arguments)
  if (filePath === undefined) return undefined
  const cwd = readSessionCwd(session)
  if (cwd === undefined) return undefined
  if (isAllowedFile(filePath, cwd)) return undefined
  return { kind: 'deny', reason: buildPrometheusDenyReason(filePath) }
}

/**
 * The `.omo/plans/` substring test of upstream hook.ts:64-65, transcribed. The
 * second upstream clause (`.omo\\plans\\`) is unreachable after the backslash
 * replacement and is therefore NOT restated — the diff note is here instead of
 * a dead disjunct in the code.
 */
export function isPlansPath(filePath: string): boolean {
  return filePath.toLowerCase().replace(/\\/g, '/').includes('.omo/plans/')
}

/** The rendered text of a tool result: its `text` content blocks joined. */
export function readResultText(result: unknown): string | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const content = (result as { readonly content?: unknown }).content
  if (!Array.isArray(content)) return undefined
  return content
    .filter((block): block is { readonly type: 'text'; readonly text: string } =>
      typeof block === 'object'
      && block !== null
      && (block as { readonly type?: unknown }).type === 'text'
      && typeof (block as { readonly text?: unknown }).text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/**
 * The D half's decision: append the workflow reminder to an ALLOWED
 * `.omo/plans/*.md` write's result. `undefined` leaves the result alone
 * (unknown session, unknown path, a path the B half would have DENIED, a
 * non-plans path, or an unreadable result).
 *
 * Upstream attached the reminder in its BEFORE hook, i.e. before the write's
 * outcome existed, so this port does not gate on success either — the reminder
 * is about the planning workflow, not about that one write. It DOES re-apply the
 * same path policy the B half applies, because upstream's policy check ran — and
 * THREW — before its reminder line, so a denied write never carried the
 * reminder. Without that gate the D half would append the reminder to its OWN
 * deny text for `.omo/plans/*.txt`: the B half denies it, and `isPlansPath`
 * alone is already true. The path is re-derived from `exec.arguments` (the SAME
 * live execution object the B half saw), so no cross-stage bookkeeping is
 * involved.
 */
export function decidePrometheusWorkflowReminder(
  exec: unknown,
  result: unknown,
  cache: WeakMap<object, CachedPersona>,
): PrometheusAppendDecision | undefined {
  if (!isWriteClassExecution(exec)) return undefined
  const session = readExecutionSession(exec)
  if (!isPrometheusSession(session, cache)) return undefined
  const filePath = readWriteTargetPath((exec as { readonly arguments?: unknown }).arguments)
  if (filePath === undefined) return undefined
  const cwd = readSessionCwd(session)
  if (cwd === undefined) return undefined
  // Upstream's path policy ran before its reminder line and THREW on a
  // disallowed path — only an ALLOWED write may carry the reminder here.
  if (!isAllowedFile(filePath, cwd)) return undefined
  if (!isPlansPath(filePath)) return undefined
  const text = readResultText(result)
  // An EMPTY render has no carrier to append to; the sibling D-mode rewriters
  // (edit-error-recovery / json-error-recovery) make the same choice.
  if (text === undefined || text === '') return undefined
  if (text.includes(PROMETHEUS_WORKFLOW_REMINDER.trimStart())) return undefined
  return { kind: 'accept', content: [{ type: 'text', text: `${text}${PROMETHEUS_WORKFLOW_REMINDER}` }] }
}

/**
 * The B-half listener body: decide inside a fail-open try/catch, then either
 * delegate or return the deny. `next()` is OUTSIDE the try (discipline ②).
 */
export async function handlePrometheusMdOnlyPreExecute(
  exec: unknown,
  next: unknown,
  cache: WeakMap<object, CachedPersona>,
): Promise<unknown> {
  const delegate = next as PreExecuteNextLike
  let decision: PrometheusDenyDecision | undefined
  try {
    decision = decidePrometheusMdOnlyDeny(exec, cache)
  } catch {
    // Fail open: a throw on pre-execute is fail-CLOSED and skips post-execute
    // (dsh-tools prepareExecution's catch) — never the refusal channel here.
    return delegate()
  }
  if (decision === undefined) return delegate()
  return decision
}

/** The D-half listener body (fail open: a throw leaves the result untouched). */
export async function handlePrometheusMdOnlyPostExecute(
  exec: unknown,
  result: unknown,
  next: unknown,
  cache: WeakMap<object, CachedPersona>,
): Promise<unknown> {
  const delegate = next as PostExecuteNextLike
  let decision: PrometheusAppendDecision | undefined
  try {
    decision = decidePrometheusWorkflowReminder(exec, result, cache)
  } catch {
    return delegate()
  }
  if (decision === undefined) return delegate()
  return decision
}

/**
 * Registers BOTH surfaces through `ctx.on`, plus the `session/disposed`
 * reset for the identity cache (discipline ⑤: the WeakMap is keyed by the live
 * session object, so a disposed session's entry is dropped eagerly rather than
 * waiting for GC). The primary event comes from the manifest row, never a
 * second literal.
 */
export const registerPrometheusMdOnly: HookRegistrar = (
  ctx,
  entry: HookManifestEntry,
) => {
  const cache = new WeakMap<object, CachedPersona>()
  ctx.on(entry.event, (exec, next) => handlePrometheusMdOnlyPreExecute(exec, next, cache))
  ctx.on(
    PROMETHEUS_MD_ONLY_SECONDARY_EVENT,
    (exec, result, next) => handlePrometheusMdOnlyPostExecute(exec, result, next, cache),
  )
  ctx.on('session/disposed', (session) => {
    if (typeof session === 'object' && session !== null) cache.delete(session)
  })
}
