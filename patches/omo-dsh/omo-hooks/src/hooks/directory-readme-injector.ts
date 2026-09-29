// directory-readme-injector.ts — P3-T15 listener (task book WP-6 批 B; plan §4.2
// pattern D): OMO's "the README of the directory you just read from is project
// context" injector, reborn as DSH `tools/post-execute` + session-lifecycle
// listeners.
//
// Upstream: packages/omo-opencode/src/hooks/directory-readme-injector/ @
//   v4.19.4 (frozen baseline tag, commit
//   b072d279110bdda2c6ac2525d0d24dc54d16148a; EIGHT files = 6 implementation
//   (constants.ts, finder.ts, hook.ts, index.ts, injector.ts, storage.ts) + 2
//   test files; test seed
//   `finder.catch-fallbacks.test.ts` (2 `it`) + `injector.test.ts` (8 `it`) =
//   10). 语义移植（非逐字复制）: the FINDER (directory-chain walk, order,
//   per-directory de-duplication) is ported branch for branch; the DELIVERY, the
//   truncation budget source, the walk ROOT and the injected-paths STORE are
//   DSH's (each recorded below). No upstream code is vendored; this is a new
//   listener.
//
// UPSTREAM EFFECT (verbatim, three files):
//
//   hook.ts:40-54 — the tool gate and the ONE argument upstream used:
//     const toolName = input.tool.toLowerCase();
//     if (toolName === "read") {
//       await processFilePathForReadmeInjection({ … filePath: output.title … });
//     }
//
//   finder.ts:12-36 — findReadmeMdUp, the walk this port transcribes:
//     let current = input.startDir
//     while (true) {
//       const readmePath = join(current, README_FILENAME)
//       try { await access(readmePath); found.push(readmePath) } catch (error) { error instanceof Error }
//       if (current === input.rootDir) break
//       const parent = dirname(current)
//       if (parent === current) break
//       if (!parent.startsWith(input.rootDir)) break
//       current = parent
//     }
//     return found.reverse()
//
//   injector.ts:39-77 — resolve, de-duplicate by DIRECTORY, append:
//     const readmeDir = dirname(readmePath)
//     if (cache.has(readmeDir)) continue
//     input.output.output += `\n\n[Project README: ${readmePath}]\n${result}${truncationNotice}`
//     cache.add(readmeDir)
//
// i.e. `read` → walk the file's directory chain up to the project root collecting
// README.md → skip directories already injected in this session → APPEND each
// README to the tool result. Never blocks; never touches title/metadata.
//
// ═══════════ 前置① — THE DSH READ SURFACE, VERIFIED VERBATIM ═══════════
// (plan §4.2 DoD-d. Upstream read `input.tool` + `output.title` + `ctx.directory`
// + a disk-persisted injected-paths store; none of the four is a DSH fact. Each
// was measured at the pinned install:)
//
//   1. THE TOOL AND THE PATH. DSH's read tool is registered as `read` with the
//      `file_path` input property (dsh-tool-fs/lib/index.js:332 and :335; the
//      tool itself requires a non-empty value at :310). Upstream's
//      `output.title` carries the same value in opencode; on DSH the ARGUMENT is
//      the authoritative copy and `title` has no DSH analog, so the port reads
//      `exec.arguments.file_path`.
//   2. THE WALK ROOT. Upstream used `ctx.directory` — the opencode project
//      directory — BOTH as the relative-path resolution base and as the walk
//      boundary (`parent.startsWith(rootDir)`). The DSH equivalent is the
//      session's own working directory, `exec.agent.session.header.cwd`
//      (dsh-session/lib/types/types.d.ts:68-69 "Absolute working directory the
//      session was created in (if any)"; the live `Session.header` face is
//      `dsh-session/lib/types/index.d.ts:117`). The e2e creates every session
//      with `cwd = <sandbox project>`, mirroring `ctx.directory`. A session
//      WITHOUT a cwd makes the port skip: guessing a boundary (the dsh process's
//      own cwd) could read READMEs from unrelated directories, so absence is a
//      skip, not a fallback.
//   3. REWRITING A READ RESULT CANNOT DISTURB THE READ-BEFORE-WRITE POLICY. The
//      fs-observation policy's record is fed by the `fs/observed` event emitted
//      by the filesystem layer itself (dsh-tool-fs/lib/index.js:276;
//      dsh-fs-observation-policy/lib/index.js:92 consumes it), NOT by parsing the
//      tool result. Replacing the result's rendered content (below) therefore
//      leaves `fs-observation-policy`, its CAS versions and its
//      `FS_STALE_VERSION` sibling untouched — which is what makes D-mode delivery
//      legal for `read` at all.
//   4. THE TRUNCATION BUDGET. Upstream truncated each README through
//      `createDynamicTruncator(ctx, modelCacheState)` (hook.ts:35-38), whose
//      budget was bound to `modelCacheState.anthropicContext1MEnabled` — a model
//      -family coupling with no DSH equivalent. The port REUSES the sibling
//      module's already-ported algorithm (tool-output-truncator.ts — the same
//      upstream `shared/dynamic-truncator.ts` +
//      `shared/token-limit-truncator.ts` pair) and its DSH-native remaining-token
//      source (`sessionProjections.snapshot(...).values.contextPressure`), with
//      upstream's OWN defaults for this call site: `DEFAULT_TARGET_MAX_TOKENS =
//      50_000` and `preserveHeaderLines = 3` (dynamic-truncator.ts:15,39).
//   5. THE INJECTED-PATHS STORE. Upstream persisted the per-session injected
//      DIRECTORY set to disk (`storage.ts` → `shared/session-injected-paths.ts`,
//      a `<sessionID>.json` under `OPENCODE_STORAGE/directory-readme`) so the
//      de-duplication survived a process restart. DSH has no equivalent
//      side-store and inventing one would be a new file format on the event path;
//      the port keeps the set IN MEMORY, keyed by the live Session object
//      (discipline ⑤). SCOPE LIMIT, recorded not hidden: after a dsh restart the
//      first read in a directory injects its README once more. Upstream's durable
//      half is NOT ported.
//
// ═══════════ 边界（覆盖基线 H-21）: dsh-agent-instructions DOES NOT COVER THIS ═══════════
// The task book requires the boundary to be PROVEN, not asserted. Measured at the
// pinned install (dsh-agent-instructions/lib/index.js:17-20):
//
//   const DEFAULT_INSTRUCTION_FILE_CANDIDATES = ["AGENTS.md", "CLAUDE.md"];
//   const DEFAULT_LOCAL_INSTRUCTION_FILE_CANDIDATES = ["AGENTS.local.md", "CLAUDE.local.md"];
//
// README.md appears in NEITHER list, and the two mechanisms differ in every other
// dimension as well: agent-instructions discovers UP the tree from cwd to a
// `.git` project-root marker and injects into the REQUEST (a user message), while
// this listener walks up from a FILE'S OWN directory to the session cwd and
// appends to a TOOL RESULT. There is therefore NO overlap: H-21 stays a port, and
// nothing in this file depends on that plugin.
//
// ═══════════ DELIVERY: `accept` + `content`, NOT `additionalContexts` ═══════════
// The task book asks for the choice to be made and justified. Upstream's
// `input.output.output += …` mutates the RESULT the model reads as the outcome of
// the call; that is the same shape H-14 (edit-error-recovery) and H-15
// (json-error-recovery) delivered:
//   * `{kind:'accept', additionalContexts:[…]}` (T5's C-mode form) — REJECTED. It
//     leaves the tool result untouched and ferries a separate user message into
//     the NEXT request, i.e. the README would arrive detached from the read that
//     motivated it, as a different message with different provenance.
//   * `{kind:'accept', content:[…]}` — CHOSEN. dsh-tools `postExecute`
//     (dsh-tools/lib/index.js:3377-3406) replaces `content` when the decision
//     carries it. Rebuilding the rendered text as `<原文本><注入块>` is the exact
//     analog of a string `+=`.
// As in the sibling D-mode modules the rebuild is CONSERVATIVE: it only rewrites a
// result whose content is TEXT-ONLY (reusing the sibling's
// `isTextOnlyResultContent`), so no image/file block can ever be dropped. `read`
// satisfies that by construction (dsh-tool-fs renders text; a read error renders
// the single `Error: …` text block).
//
// ═══════════ THE TRIGGER IS UPSTREAM'S TRIGGER — NO ERROR GATE ═══════════
// Upstream's ONLY gate was the tool name; a `read` that FAILED still reached the
// injector. This port keeps that (no `isError` gate, no remeasurement of the
// result's own text), and the unit suite pins BOTH branches so the behaviour is
// visible rather than accidental — including its upstream-inherited side effect:
// a README injected behind a FAILED read still marks its directory as injected in
// this session (upstream's `cache.add(readmeDir)` sat on the same path).
//
// ═══════════ KNOWN COMPOSITION SEMANTICS — READING A README INJECTS IT TWICE ═══════════
// (P3-T15 review MINOR-1; arbitrated: KEEP the parity and REGISTER it, do not filter.)
// The trigger is "a `read` happened", so a `read` whose path IS a `README.md` is at
// once the tool's own rendered text and this listener's injection target: when the
// walk reaches that README's own directory, the delivered result is
// `<the README bytes><the injected block carrying the same bytes>` — the content
// appears TWICE. Upstream behaved identically (`hook.ts` gated on the tool NAME
// only, and its injector's `cache.add(readmeDir)` never excluded the read's own
// directory), so the ×2 is PARITY, kept deliberately: filtering it out would
// narrow the upstream contract on a case the review did not ask to change.
// It is NOT a no-op observation either — it moves the child's read-result byte
// stream in the driver's `concerto-delegation-demo`, `roster-parade` and
// `atlas-nested-delegation` scenarios (drive.mjs's `demoScript` / `paradeScript`
// / `atlasNestedDelegationScript`, each of which reads the sandbox README
// itself). Every assertion there is
// `includes`-shaped, so the P3-T15 e2e pass stayed green with the ×2 present;
// the registration is what makes that a recorded fact instead of a latent one.
//
// ═══════════ THE SESSION-LIFE-CYCLE HALF (upstream's `event` channel) ═══════════
// Upstream registered `event` and cleared the session's directory set on
// `session.deleted` AND `session.compacted` (hook.ts:56-74). Both are mapped onto
// DSH surfaces that really exist:
//   * `session/disposed` (dsh-session/lib/types/index.d.ts:50
//     `'session/disposed'(session: Session)`, emitted with the session as its
//     argument) — the DSH analog of `session.deleted`. The cache entry is
//     dropped.
//   * `session/event` carrying `compaction/end` — the DSH analog of
//     `session.compacted`. Compaction REPLACES the shadowed range of the surface
//     with a summary, so previously injected README text can be gone while the
//     session survives; upstream's rule is therefore reproduced by re-arming the
//     cache at a SUCCESSFUL `compaction/end`
//     (dsh-compaction/lib/types/types.d.ts:69-78; the same event carries an
//     optional `error` for an unsuccessful attempt, which does NOT re-arm —
//     nothing was replaced, so a re-injection would only duplicate text).
//   * KNOWN COMPOSITION SEMANTICS, ARBITRATED (P3-T15 review 质疑①; decision:
//     ACCEPTED, no third re-arm trigger added): the pinned preset also mounts
//     `dsh-compaction-tool-result-pruner`, a PRUNE compaction that rewrites tool
//     results. A prune emits `compaction/prune` — a log-only shadow-price/metering
//     event with NO enclosing `compaction/start`/`compaction/end` pair
//     (dsh-compaction/lib/types/types.d.ts:88-98; the model-free prune protocol)
//     — so it never reaches the re-arm branch above. If a prune removes injected
//     README text from the surface, this port's directory set stays ARMED and the
//     same directory is therefore not re-injected by the next `read`; the text
//     comes back only after a LATER successful `compaction/end` clears the set, or
//     when the walk enters a directory that is not yet cached. The impact is
//     BOUNDED and accepted: the injected block is a convenience appended to a read
//     the model already made (in the ×2 case above it is literally a duplicate of
//     bytes the tool itself returned), so a dropped block degrades redundancy, not
//     correctness. NO `compaction/prune` listener is added: a prune-specific third
//     re-arm trigger would couple this hook to a preset row it does not own, which
//     is a coverage decision the arbitration declined. Registered here so the
//     interaction is a recorded fact rather than a silent gap.
//
// DISCIPLINES THIS FILE OBEYS (plan §4.2): ② both listeners wrap their OWN logic
// in try/catch and fail OPEN (`return next()` for the post-execute half; a silent
// return for the lifecycle half, which is a contained emit feed);
// ⑤ no module-level mutable state — the per-session directory sets live in a
// WeakMap keyed by the live Session OBJECT inside the registrar closure.
// ③ NOTE THE ONE DELIBERATE EXCEPTION: reading README files from disk IS this
// hook's semantic (upstream's injector did exactly that inside
// `tool.execute.after`). The discipline's purpose — no configuration/state file
// reads on the event path — still holds: the ONLY reads are the candidate
// `<dir>/README.md` probes and the README contents themselves, and the failure of
// either skips that README instead of failing the call.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import { access as fsAccess, readFile as fsReadFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { HookManifestEntry } from '../manifest.ts'
import type { HookRegistrar, HooksRegistrationContext } from '../index.ts'
import {
  CONTEXT_EXHAUSTED_RESULT,
  PRESERVE_HEADER_LINES,
  buildRemainingTokenReader,
  isTextOnlyResultContent,
  readRenderedText,
  truncateToTokenLimit,
  type PostExecuteNextLike,
  type RemainingTokenReader,
  type TruncatorAcceptDecision,
} from './tool-output-truncator.ts'

/** The manifest id this registrar implements (manifest.ts row H-21). */
export const DIRECTORY_README_INJECTOR_ID = 'directory-readme-injector'

/** The DSH event carrying the decision (pattern D). */
export const DIRECTORY_README_INJECTOR_EVENT = 'tools/post-execute'

/**
 * The auxiliary surfaces the registrar owns (index.ts discipline ④: a multi-event
 * row registers its full surface set from the implementation, never from
 * `hooksByEvent`). Both are DSH session-life-cycle feeds; the boot marker keeps
 * printing the row's PRIMARY event.
 */
export const DIRECTORY_README_INJECTOR_SESSION_EVENT = 'session/event'
export const DIRECTORY_README_INJECTOR_DISPOSED_EVENT = 'session/disposed'

/** The session event type that re-arms the cache (upstream `session.compacted`). */
export const COMPACTION_END_EVENT_TYPE = 'compaction/end'

/** Upstream constants.ts:6 — `README_FILENAME = "README.md"`, verbatim. */
export const README_FILENAME = 'README.md'

/** Upstream hook.ts:43 — the ONE tool this hook observes (`read`). */
export const README_READ_TOOL_NAME = 'read'

/** Upstream hook.ts:48 — the DSH argument carrying upstream's `output.title`. */
export const README_READ_PATH_ARGUMENT = 'file_path'

/** The marker prefix of one injected block (upstream injector.ts:60). */
export const README_INJECTION_MARKER = '[Project README:'

/** Upstream dynamic-truncator.ts:15 — `DEFAULT_TARGET_MAX_TOKENS = 50_000`. */
export const README_TARGET_MAX_TOKENS = 50_000

/** The one accept-decision shape this module produces (mode D). */
export type ReadmeAcceptDecision = TruncatorAcceptDecision

// --- Minimal structural typings of the DSH surface this file touches --------
// Same discipline as the sibling modules: this workspace has no dsh dependency,
// so only the shapes actually read are declared, and all of them are `readonly`
// because the live objects are frozen.

/** The two filesystem probes the finder/injector need (tests own both). */
export interface ReadmeFileSystem {
  /** Upstream `access(readmePath)` — the existence probe. */
  readonly access: (path: string) => Promise<void>
  /** Upstream `readFile(readmePath, "utf-8")` on the injector path. */
  readonly readFile: (path: string) => Promise<string>
}

/** The detail upstream's `log(...)` carried (kept as one owned plain object). */
export interface ReadmeFailureDetail {
  readonly error: string
  readonly readmePath: string
  readonly sessionID: string | undefined
}

/** The injectable seams of {@link createDirectoryReadmeInjector}. */
export interface ReadmeInjectorDeps {
  readonly fs: ReadmeFileSystem
  /** Upstream's dynamic-truncator budget; absent ⇒ the fixed-threshold path. */
  readonly readRemainingTokens?: RemainingTokenReader
  /** Upstream's `log(...)` sink for a skipped README. */
  readonly logFailure: (message: string, detail: ReadmeFailureDetail) => void
}

/** The injector's fiber-scoped face (one instance per registration). */
export interface DirectoryReadmeInjector {
  /** The post-execute half: `undefined` ⇒ "not our call", delegate. */
  decide(exec: unknown, result: unknown): Promise<ReadmeAcceptDecision | undefined>
  /** The `session/event` half: a successful compaction re-arms the cache. */
  onSessionEvent(session: unknown, event: unknown): void
  /** The `session/disposed` half: drop the session's directory set. */
  onSessionDisposed(session: unknown): void
  /** Diagnostics for the unit suite: how many directories this session injected. */
  cachedDirectoryCount(session: unknown): number
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/** A non-empty string leaf, or undefined (never throws on a hostile payload). */
function readStringField(source: unknown, key: string): string | undefined {
  if (!isObject(source)) return undefined
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Upstream finder.ts:6-10 `resolveFilePath`, verbatim: an empty path resolves to
 * `null`, an absolute path is taken as-is, a relative one is resolved against the
 * walk root.
 */
export function resolveFilePath(rootDirectory: string, path: string): string | null {
  if (!path) return null
  if (isAbsolute(path)) return path
  return resolve(rootDirectory, path)
}

/**
 * Upstream finder.ts:12-36 `findReadmeMdUp`, ported BRANCH FOR BRANCH — including
 * the three loop-break conditions, the `access` probe whose rejection is
 * swallowed for BOTH `Error` and non-`Error` reasons (upstream's bare
 * `error instanceof Error;` statement; the two upstream catch-fallback tests pin
 * exactly this), and the final `reverse()` so the caller sees root-first order.
 *
 * `rootDir` is a STRING comparison boundary exactly as upstream had it
 * (`parent.startsWith(input.rootDir)`), so a path OUTSIDE the root still gets its
 * own directory probed once before the loop breaks — upstream behaviour, kept.
 */
export async function findReadmeMdUp(
  input: { readonly startDir: string; readonly rootDir: string },
  fs: Pick<ReadmeFileSystem, 'access'>,
): Promise<string[]> {
  const found: string[] = []
  let current = input.startDir

  while (true) {
    const readmePath = join(current, README_FILENAME)
    try {
      await fs.access(readmePath)
      found.push(readmePath)
    } catch {
      // Upstream swallowed this rejection for every reason (`error instanceof
      // Error;` — a no-op statement). A missing README is not an error here.
    }

    if (current === input.rootDir) break
    const parent = dirname(current)
    if (parent === current) break
    if (!parent.startsWith(input.rootDir)) break
    current = parent
  }

  return found.reverse()
}

/**
 * Upstream hook.ts:41-43's tool gate, total on purpose: a missing/hostile tool
 * field is simply "not our call" instead of a throw. DSH ids are canonical
 * lowercase, so `toLowerCase` is redundant in production and kept because
 * upstream's comparison was case-insensitive (the unit suite pins it).
 */
export function isReadExecution(exec: unknown): boolean {
  if (!isObject(exec)) return false
  const name = (exec as { readonly name?: unknown }).name
  return typeof name === 'string' && name.toLowerCase() === README_READ_TOOL_NAME
}

/** Upstream's `output.title`, re-homed onto the DSH read argument. */
export function readReadPath(exec: unknown): string | undefined {
  if (!isObject(exec)) return undefined
  return readStringField((exec as { readonly arguments?: unknown }).arguments, README_READ_PATH_ARGUMENT)
}

/** The live Session behind one execution (`exec.agent.session`), if reachable. */
export function readExecutionSession(exec: unknown): unknown {
  if (!isObject(exec)) return undefined
  const agent = (exec as { readonly agent?: unknown }).agent
  if (!isObject(agent)) return undefined
  return (agent as { readonly session?: unknown }).session
}

/** `session.header.cwd` — the DSH analog of upstream's `ctx.directory`. */
export function readSessionCwd(session: unknown): string | undefined {
  if (!isObject(session)) return undefined
  return readStringField((session as { readonly header?: unknown }).header, 'cwd')
}

/** The session id, used ONLY for the failure detail (upstream logged it). */
function readSessionId(session: unknown): string | undefined {
  if (!isObject(session)) return undefined
  return readStringField(session, 'id')
}

/** The exact truncation notice upstream injector.ts:57-59 appended. */
export function readmeTruncationNotice(readmePath: string): string {
  return `\n\n[Note: Content was truncated to save context window space. For full context, please read the file directly: ${readmePath}]`
}

/**
 * Upstream's `truncator.truncate(sessionID, content)` folded to a leaf: the
 * `dynamicTruncate` branch structure is preserved (unavailable usage ⇒ the
 * conservative fixed threshold; `maxOutputTokens <= 0` ⇒ the exhausted-context
 * replacement), and `truncated` is what injector.ts:57-59 used to decide whether
 * the notice is emitted at all.
 */
export function truncateReadmeContent(
  content: string,
  remainingTokens: number | undefined,
): { readonly result: string; readonly truncated: boolean } {
  if (remainingTokens === undefined || !Number.isFinite(remainingTokens)) {
    return truncateToTokenLimit(content, README_TARGET_MAX_TOKENS, PRESERVE_HEADER_LINES)
  }
  const maxOutputTokens = Math.min(remainingTokens * 0.5, README_TARGET_MAX_TOKENS)
  return maxOutputTokens <= 0
    ? { result: CONTEXT_EXHAUSTED_RESULT, truncated: true }
    : truncateToTokenLimit(content, maxOutputTokens, PRESERVE_HEADER_LINES)
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Builds the injector. All cross-event state lives HERE (discipline ⑤): one
 * WeakMap keyed by the live Session OBJECT, so a finished session's set is
 * collected with it, and an explicit `session/disposed` delete reproduces
 * upstream's `sessionCaches.delete(sessionID)`.
 *
 * The map's value is a Set of README **DIRECTORIES** (`dirname(readmePath)`),
 * NOT of readme paths — upstream injector.ts:48-49 keyed the de-duplication that
 * way, and the P3-T1 §2 note calls that out explicitly as a trap to avoid.
 */
export function createDirectoryReadmeInjector(deps: ReadmeInjectorDeps): DirectoryReadmeInjector {
  const sessionDirectoryCaches = new WeakMap<object, Set<string>>()

  function cacheFor(session: object): Set<string> {
    const existing = sessionDirectoryCaches.get(session)
    if (existing !== undefined) return existing
    const created = new Set<string>()
    sessionDirectoryCaches.set(session, created)
    return created
  }

  async function decide(
    exec: unknown,
    result: unknown,
  ): Promise<ReadmeAcceptDecision | undefined> {
    if (!isReadExecution(exec)) return undefined
    if (!isObject(result) || !isTextOnlyResultContent(result)) return undefined

    const session = readExecutionSession(exec)
    if (!isObject(session)) return undefined
    const rootDir = readSessionCwd(session)
    // 前置① point 2: a session without a cwd has no walk boundary — skip.
    if (rootDir === undefined) return undefined

    const resolved = resolveFilePath(rootDir, readReadPath(exec) ?? '')
    if (resolved === null) return undefined

    const cache = cacheFor(session)
    const readmePaths = await findReadmeMdUp(
      { startDir: dirname(resolved), rootDir },
      deps.fs,
    )

    let injected = ''
    for (const readmePath of readmePaths) {
      const readmeDir = dirname(readmePath)
      if (cache.has(readmeDir)) continue

      try {
        const content = await deps.fs.readFile(readmePath)
        const truncated = truncateReadmeContent(content, deps.readRemainingTokens?.(exec))
        injected += `\n\n${README_INJECTION_MARKER} ${readmePath}]\n${truncated.result}`
          + (truncated.truncated ? readmeTruncationNotice(readmePath) : '')
        cache.add(readmeDir)
      } catch (error) {
        // Upstream injector.ts:63-72: a read/truncate failure SKIPS this README
        // (it does not mark the directory injected, and it never fails the call).
        deps.logFailure('[directory-readme-injector] Skipped README injection after read/truncate failure', {
          error: describeError(error),
          readmePath,
          sessionID: readSessionId(session),
        })
      }
    }

    if (injected === '') return undefined
    return {
      kind: 'accept',
      content: [{ type: 'text', text: `${readRenderedText(result)}${injected}` }],
    }
  }

  return {
    decide,
    onSessionEvent(session: unknown, event: unknown): void {
      try {
        if (!isObject(session)) return
        if (readStringField(event, 'type') !== COMPACTION_END_EVENT_TYPE) return
        const data = (event as { readonly data?: unknown }).data
        // A failed attempt replaced nothing (dsh-compaction types :69-78).
        if (readStringField(data, 'error') !== undefined) return
        sessionDirectoryCaches.delete(session)
      } catch {
        // `session/event` is a contained emit feed; our own bug must not reach it.
      }
    },
    onSessionDisposed(session: unknown): void {
      try {
        if (isObject(session)) sessionDirectoryCaches.delete(session)
      } catch {
        // Same containment as above.
      }
    },
    cachedDirectoryCount(session: unknown): number {
      if (!isObject(session)) return 0
      return sessionDirectoryCaches.get(session)?.size ?? 0
    },
  }
}

/**
 * The listener body: decide from OUR logic inside a fail-open try/catch, then
 * delegate — or return the rewrite. The `next()` calls are deliberately OUTSIDE
 * the try (discipline ②): a throw inside a `tools/post-execute` listener replaces
 * an entire successful tool result with an isError
 * (dsh-tools/lib/index.js:3241-3248).
 */
async function handleDirectoryReadmeInjection(
  injector: DirectoryReadmeInjector,
  exec: unknown,
  result: unknown,
  next: unknown,
): Promise<unknown> {
  const delegate = next as PostExecuteNextLike
  let decision: ReadmeAcceptDecision | undefined
  try {
    decision = await injector.decide(exec, result)
  } catch {
    return delegate()
  }
  if (decision === undefined) return delegate()
  return decision
}

/**
 * Registers the row's full surface set through `ctx.on` (the preferred channel,
 * so cordis scopes every listener to this Fiber and the registrar returns
 * nothing). The post-execute event comes from the manifest row; the two
 * life-cycle events are this module's own constants (a row has ONE primary event
 * — index.ts discipline ④).
 */
export const registerDirectoryReadmeInjector: HookRegistrar = (
  ctx: HooksRegistrationContext,
  entry: HookManifestEntry,
) => {
  const injector = createDirectoryReadmeInjector({
    fs: {
      access: (path) => fsAccess(path),
      readFile: (path) => fsReadFile(path, 'utf-8'),
    },
    readRemainingTokens: buildRemainingTokenReader(ctx),
    logFailure: (message, detail) => {
      console.warn(message, detail)
    },
  })
  ctx.on(entry.event, (exec, result, next) => handleDirectoryReadmeInjection(injector, exec, result, next))
  ctx.on(DIRECTORY_README_INJECTOR_SESSION_EVENT, (session, event) => {
    injector.onSessionEvent(session, event)
  })
  ctx.on(DIRECTORY_README_INJECTOR_DISPOSED_EVENT, (session) => {
    injector.onSessionDisposed(session)
  })
}
