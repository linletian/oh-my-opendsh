// skills.ts — P4-T5: the SKILL DELIVERY mechanism (plan §4.1 candidate b′).
//
// WHAT THIS DOES. At apply() the plugin reads every vendored `SKILL.md` under
// patches/omo-dsh/vendor/shared-skills/skills/ once, parses its YAML
// frontmatter, and hands the body to dsh's own skill registry
// (`ctx.skills.register`), so the 19 upstream skills become visible to BOTH
// surfaces: the model-facing `skill` tool + `<available_skills>` catalog
// (`@deepseek-ai/dsh-tool-skill`) and the user-facing `/name` gesture
// (SKILL_GESTURE injection). This is the ONLY place the command surface reads
// the vendor tree; the command path keeps its no-disk-read discipline because a
// slash command is a live handler, while a skill body is a static document that
// the native `ctx.skills.get` surface already serves.
//
// MEASURED FACTS THIS FILE IS BUILT ON (dsh 0.1.5-rc.1; cite the file, not the
// docstring, when a comment here claims a shape):
//   • `ctx.skills.register(skill)` — lib/types/index.d.ts:283 (SkillRegistration
//     = Omit<SkillDefinition,'invocation'|'provider'> & {invocation?,provider?}).
//     Returns the exact cordis effect disposer, so registrations are already
//     fiber-scoped (lib/index.js:209-214 `this.layers.effect(...)`).
//   • `register()` validates name/description/invocation ONLY
//     (lib/index.js:465-469) and DEFAULTS `invocation` to both-invocable
//     (lib/index.js:203-206) — so omitting it keeps `ulw-plan` user-invocable,
//     which the T15 gesture bridge depends on.
//   • `source` IS NOT DEFAULTED, and `get()` runs `validateDefinition` on every
//     load (lib/index.js:261, 471-490) which requires `typeof source ===
//     'string'`. A registration without it would register fine and then throw a
//     TypeError inside EVERY `skill` tool call. Hence the explicit
//     `RUNTIME_SOURCE` below — measured, not stylistic.
//   • Duplicate names in one layer are FIRST-WINS: `register()` logs a warning
//     and hands back a NO-OP disposer (lib/index.js:197-200), so a duplicate can
//     never evict the winner.
//   • Parsing semantics are copied from `@deepseek-ai/dsh-skill-filesystem`
//     `parseSkillFile` (lib/index.js:664-703): first line must be `---` (CR
//     tolerated), a closing `---` terminates it, name+description are required,
//     the name must match the kebab-case grammar, and `content` is
//     `body.trim()`.
//
// WHY THE FRONTMATTER READER IS HAND-WRITTEN. The plan's zero-npm-dependency
// rule (T2, package.json) leaves no YAML parser, and this package must not reach
// into dsh's own dependency tree to borrow one. So the reader below covers
// EXACTLY the three shapes the vendored frontmatter actually uses (measured over
// all 19 files: two of them use shapes this reader REJECTS loudly rather than
// guesses at — see FRONTMATTER SHAPES below) and THROWS on every other
// STRUCTURE. A future vendor file with block scalars, lists or deeper nesting
// therefore surfaces as one loud per-skill FAILED line at boot rather than as a
// silently dropped field.
//
// WHAT IS *NOT* THROWN ON: an unknown top-level key carrying a plain scalar value
// is IGNORED, exactly the way dsh-skill-filesystem ignores every field it does
// not consume. The one deliberate exception is the canonical invocation pair
// (`disable-model-invocation` / `user-invocable`): dsh-skill-filesystem DOES
// consume those, and this runtime registration path would drop them silently —
// see INVOCATION_KEYS below. (An earlier draft of this header claimed "THROWS on
// anything else"; dual review caught that the implementation has always ignored
// unknown scalar keys. This header now describes what the code does.)
// P4-T16 — vendor SKILL.md 的发现 + 解析 + 注册机制（P4-T5 候选 b′ 的新机制面）。
// 署名声明（c16 原生总体）：本文件**无上游对应物**——v4.19.4 没有任何同职责的模块。
// 它是 DSH 侧的原生代码，不是语义移植；宣称上游来源就是假署名。语义移植文件请带
// 「UPSTREAM SOURCE + @ v4.19.4 + 移植声明」三件套。

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatSkillFailedLine, formatSkillsScanFailedLine, formatSkillsSummaryLine } from './boot-markers.ts'

/**
 * The vendored skills root, resolved from THIS module's own URL — never from
 * process.cwd() (P-9). `dsh plugin add` installs the plugin as a `link:`
 * dependency (measured: `$DSH_HOME/profiles/web/package.json` pins
 * `link:/…/patches/omo-dsh/omo-agents`), and Node resolves symlinks before
 * building `import.meta.url`, so the path below is the REAL repository path and
 * the sibling `vendor/` tree is reachable from the installed copy. The same fact
 * is what lets the catalog carry absolute `SKILL.md` paths that stay valid for
 * the model reading a reference file.
 */
export const VENDOR_SKILLS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'vendor',
  'shared-skills',
  'skills',
)

/** The document name every vendored skill directory carries. */
export const SKILL_FILE_NAME = 'SKILL.md'

/**
 * How many skill directories the vendor tree carries (T5: 17 shared + ultrawork
 * + hyperplan). Pinned here as a hand-transcribed count and asserted against the
 * REAL tree in tests/omo-commands/skills.test.ts — the same "manifest ↔ file
 * set" discipline c13 applies to omo-hooks. A new vendored skill must move this
 * number in the same commit.
 */
export const EXPECTED_VENDOR_SKILL_COUNT = 19

/**
 * dsh's own skill-name grammar (dsh-skill/lib/index.js:17), re-declared rather
 * than imported: the package may not depend on dsh at runtime (it is mounted
 * INTO dsh, not the other way round), and the mirrored pattern is pinned by a
 * unit test that asserts this source equals the installed one.
 */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The `source` bucket every registration declares. See the MEASURED FACTS
 * header: `register()` never defaults it and `get()` rejects a non-string one,
 * so this constant is load-bearing, not metadata. `runtime` is the accurate
 * bucket — these are runtime contributions, not user/project files on disk
 * (which are what `dsh-skill-filesystem`'s own `source` values describe).
 */
export const RUNTIME_SOURCE = 'runtime'

/**
 * The two canonical frontmatter keys that select INVOCABILITY, and the one
 * class of unknown key this reader refuses instead of ignoring.
 *
 * MEASURED: `dsh-skill-filesystem` consumes both (lib/index.js, its frontmatter
 * mapping) — they decide whether the model may call the skill and whether the
 * `/name` gesture reaches it. This package registers through the RUNTIME
 * registry, which has no such fields (`SkillRegistration` omits `invocation`,
 * and `toSkillRegistration` deliberately leaves it absent so dsh defaults it to
 * both-invocable). A vendored file carrying `disable-model-invocation: true`
 * would therefore be registered as model-invocable — the OPPOSITE of what the
 * file asks. Silent inversion of an invocability decision is worse than a boot
 * failure, so the reader refuses those two keys by name and says why.
 *
 * Every OTHER unknown key stays ignored (see the header): this repo vendors a
 * fixed tree whose frontmatter is fully measured, and a future informational key
 * should not break the boot.
 */
export const INVOCATION_KEYS: ReadonlySet<string> = new Set([
  'disable-model-invocation',
  'user-invocable',
])

/** One parsed vendored skill document, ready to become a `SkillRegistration`. */
export interface VendorSkillDocument {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly metadata?: Readonly<Record<string, unknown>>
  /** The markdown body with the frontmatter block removed and edges trimmed. */
  readonly content: string
}

/** One discovered skill file plus the absolute path it was read from. */
export interface VendorSkillEntry {
  /** Absolute path of the `SKILL.md` this entry came from. */
  readonly path: string
  /** The skill's directory name (the catalog-visible identity before parsing). */
  readonly directoryName: string
  readonly document: VendorSkillDocument
}

/** One skill that could not be read or parsed, with the reason already logged. */
export interface VendorSkillFailure {
  readonly path: string
  readonly directoryName: string
  readonly error: unknown
}

/** The result of scanning the vendor tree: everything discovered, in one value. */
export interface VendorSkillScan {
  readonly entries: readonly VendorSkillEntry[]
  readonly failures: readonly VendorSkillFailure[]
}

/** A parse/read failure that names the offending file. */
export class VendorSkillError extends Error {
  /** The offending file, kept as a plain field — see the strip-only note. */
  readonly filePath: string

  /**
   * NB — `filePath` is assigned by hand, NOT as a TypeScript parameter property
   * (`constructor(readonly filePath: string, …)`). dsh loads this package through
   * Node's STRIP-ONLY type erasure, which cannot emit the implicit field
   * assignment: a parameter property throws ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX at
   * plugin load and takes the whole boot down. Vitest transpiles with esbuild and
   * would have passed either way, so the failure is invisible to every unit test —
   * tests/omo-commands/skills.test.ts carries a strip-only syntax guard over this
   * package's sources for exactly that reason.
   */
  constructor(filePath: string, reason: string) {
    super(`skill file ${filePath}: ${reason}`)
    this.name = 'VendorSkillError'
    this.filePath = filePath
  }
}

// ── frontmatter reader ──────────────────────────────────────────────────────
//
// FRONTMATTER SHAPES (measured over all 19 vendored SKILL.md files):
//   1. `name: <bare>`                              — ultrawork
//   2. `description: "<double-quoted>"`             — 18 files; ONE of them
//      (remove-ai-slops) contains escaped quotes inside the quoted scalar, so a
//      naive slice-and-slice would leave `\"` in the catalog description.
//   3. `metadata:` + one indented `  short-description: "<quoted>"` — 3 files
//      (hyperplan, ultrawork, ulw-plan). ONE nesting level only.
// Skipped as legal YAML: blank lines, whole-line `#` comments, and the TRAILING
// ` #…` comment on a plain (unquoted) scalar — `description: A. # note` is `A.`,
// while `c#/razor` and any `#` inside a double-quoted scalar are data.
// Rejected loudly (never guessed): block scalars (`|`/`>`), sequence items
// (`- `), keys without a colon, duplicate keys, the invocability pair, and
// nesting deeper than one level.

/**
 * Removes a YAML trailing comment from a scalar's raw text, leaving the value.
 *
 * MEASURED YAML semantics: outside quotes a `#` opens a comment only when it
 * starts the scalar or follows whitespace. So `A. # note` is `A.`, but `c#/razor`
 * stays literal (a real case: the vendored `lsp-setup` description lists
 * `c#/razor` among its languages), and a `#` inside a double-quoted scalar is
 * never a comment at all — which also means a quoted value may be FOLLOWED by
 * one: `"short" # for the catalog` is `short`. That trailing form is the COMMON
 * one here, since 18 of the 19 vendored files quote their description.
 *
 * An empty result means the entire text was a comment, which YAML reads as the
 * key having NO value; `readScalar` lets the field rules report that as a missing
 * field rather than as a syntax fault nobody wrote.
 *
 * WHY IT MATTERS HERE: these values are not internal state — `description` goes
 * straight into the model-facing `<available_skills>` catalog. A swallowed
 * `# note` would print a human's aside to the model as part of the contract.
 */
function stripYamlComment(rawValue: string): string {
  const trimmed = rawValue.trim()
  if (trimmed.startsWith('#')) return ''
  if (trimmed.startsWith('"')) {
    // Walk the quoted run (honouring `\` escapes) and look for a comment only
    // AFTER it. A genuinely unterminated quote is returned untouched, so the
    // caller throws its own precise error instead of a confusing one.
    let index = 1
    while (index < trimmed.length) {
      const char = trimmed[index]
      if (char === '\\') {
        index += 2
        continue
      }
      if (char === '"') {
        const rest = trimmed.slice(index + 1)
        const hash = rest.search(/[ \t]#/)
        return hash < 0 ? trimmed : trimmed.slice(0, index + 1 + hash).trim()
      }
      index += 1
    }
    return trimmed
  }
  const hash = trimmed.search(/[ \t]#/)
  return hash < 0 ? trimmed : trimmed.slice(0, hash).trim()
}

/** Parses a top-level `key: value` line, returning the unquoted value. */
function readScalar(raw: string, filePath: string): string {
  const rawValue = raw.trim()
  if (rawValue === '') throw new VendorSkillError(filePath, 'empty scalar value')
  // NOTE: `""` is legal YAML and is returned as the empty string here; the
  // field helpers below then treat it as MISSING, exactly like dsh's own
  // `stringField` / `optionalString` (lib/index.js:833-839) do.
  // The block-scalar check reads the RAW text, so `| # why` is still rejected
  // rather than being mistaken for a bare `|` after comment stripping.
  if (rawValue.startsWith('|') || rawValue.startsWith('>')) {
    throw new VendorSkillError(filePath, 'block scalars are not supported by this reader')
  }
  // A quoted scalar keeps its `#` (that is data); a plain one loses its trailing
  // comment. Both go through stripYamlComment, which is quote-aware.
  const value = stripYamlComment(rawValue)
  // Comment-only text: the key is VALUELESS in YAML, so let the FIELD rules
  // report it (a missing `description` names the field) instead of raising a
  // syntax complaint about a line nobody meant as syntax.
  if (value === '') return ''
  if (!value.startsWith('"')) return value
  if (value.length < 2 || !value.endsWith('"')) {
    throw new VendorSkillError(filePath, 'unterminated double-quoted scalar')
  }
  // YAML double-quoted escapes. Only the escapes the vendored files use are
  // translated; an unknown escape throws instead of passing through, because a
  // silently wrong description is a wrong catalog entry.
  const inner = value.slice(1, -1)
  let out = ''
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index]!
    if (char !== '\\') {
      out += char
      continue
    }
    const escaped = inner[index + 1]
    if (escaped === undefined) throw new VendorSkillError(filePath, 'trailing backslash in scalar')
    if (escaped === '"' || escaped === '\\') out += escaped
    else if (escaped === 'n') out += '\n'
    else if (escaped === 't') out += '\t'
    else throw new VendorSkillError(filePath, `unsupported escape \\${escaped} in scalar`)
    index += 1
  }
  return out
}

/** Splits a `key: value` line; returns undefined when the line has no key. */
function splitKey(raw: string): { key: string; value: string } | undefined {
  const colon = raw.indexOf(':')
  if (colon < 0) return undefined
  const key = raw.slice(0, colon).trim()
  if (key === '') return undefined
  return { key, value: raw.slice(colon + 1) }
}

/**
 * The reader's own shape guard: only a bare top-level key or a single level of
 * one-space-indented nesting is understood. Anything else names the file and
 * the offending line so the boot log says which vendored skill needs a reader
 * change.
 */
function rejectUnsupportedLine(raw: string, filePath: string, lineNumber: number): never {
  throw new VendorSkillError(filePath, `unsupported frontmatter at line ${lineNumber}: ${JSON.stringify(raw)}`)
}

/** dsh's `stringField`: a present, non-empty string, else undefined. */
function nonEmptyField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Parses one vendored `SKILL.md` document. Mirrors dsh-skill-filesystem's
 * `parseFrontmatter` + field rules (see the MEASURED FACTS header) and throws
 * `VendorSkillError` naming the file on anything malformed — the caller turns
 * that into one loud FAILED line rather than a partial registration.
 */
export function parseSkillDocument(raw: string, filePath: string): VendorSkillDocument {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) throw new VendorSkillError(filePath, 'missing YAML frontmatter')
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') {
    throw new VendorSkillError(filePath, 'missing YAML frontmatter')
  }
  const frontmatterStart = firstLineEnd + 1
  const frontmatter = parseFrontmatterBlock(raw, frontmatterStart, filePath)
  const data = frontmatter.data
  // Field rules copied from dsh-skill-filesystem's own helpers (lib/index.js
  // 833-875): a required field is a NON-EMPTY string (an empty `""` reads as
  // missing), an optional string is forwarded only when non-empty, and
  // `metadata` is forwarded only when it is a non-array object.
  const name = nonEmptyField(data.name)
  const description = nonEmptyField(data.description)
  if (name === undefined) throw new VendorSkillError(filePath, 'frontmatter requires name')
  if (description === undefined) throw new VendorSkillError(filePath, 'frontmatter requires description')
  if (!SKILL_NAME_PATTERN.test(name)) throw new VendorSkillError(filePath, `invalid skill name "${name}"`)
  const whenToUseRaw = data.whenToUse
  if (whenToUseRaw !== undefined && typeof whenToUseRaw !== 'string') {
    throw new VendorSkillError(filePath, 'frontmatter field "whenToUse" must be a string')
  }
  // An empty `whenToUse` is DROPPED, not rejected — dsh's `optionalString`
  // forwards the field only when non-empty (lib/index.js:837-839).
  const whenToUse = nonEmptyField(whenToUseRaw)
  const metadata = data.metadata
  if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))) {
    throw new VendorSkillError(filePath, 'frontmatter field "metadata" must be a mapping')
  }
  return {
    name,
    description,
    ...whenToUse !== undefined ? { whenToUse } : {},
    ...metadata !== undefined ? { metadata: metadata as Readonly<Record<string, unknown>> } : {},
    content: frontmatter.body.trim(),
  }
}

/** Frontmatter field values, where a mapping field stays a plain object. */
interface FrontmatterFields {
  readonly [key: string]: string | Record<string, string> | undefined
}

/**
 * Locates the closing `---` line and parses the block above it. Blank lines and
 * whole-line `#` COMMENTS are skipped (a comment is legal YAML that
 * dsh-skill-filesystem accepts, and it is the most likely innocuous addition to a
 * future vendored file — failing a skill over its own comment would be absurd).
 * Unknown top-level keys carrying a scalar value are IGNORED (the way
 * dsh-skill-filesystem ignores every field it does not consume) except the
 * invocability pair, which is refused by name — see INVOCATION_KEYS. Unsupported
 * STRUCTURES are rejected by name, and a DUPLICATE key is rejected too: letting
 * the second occurrence overwrite the first would merge a contradicting field
 * silently.
 */
function parseFrontmatterBlock(
  raw: string,
  start: number,
  filePath: string,
): { data: FrontmatterFields; body: string } {
  const data: Record<string, string | Record<string, string>> = {}
  // The key whose nested mapping is currently being filled, if any. It stays set
  // across CONSECUTIVE indented lines — that is one YAML block mapping, and
  // clearing it per line would reject a legal two-key `metadata` — and is
  // zeroed explicitly on the only line that closes it (a non-indented one), so
  // no stale key can swallow an unrelated indented line afterwards.
  let openKey: string | undefined
  let lineStart = start
  // 2, not 1: `start` is already past the file's first line (the opening `---`),
  // so the first frontmatter line IS file line 2. Reporting it as line 1 would
  // send whoever fixes a vendored file to the wrong line (dual review, NIT).
  let lineNumber = 2
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    const line = raw.slice(lineStart, lineEnd).replace(/\r$/, '')
    if (line === '---') {
      return { data, body: raw.slice(nextNewline < 0 ? raw.length : nextNewline + 1) }
    }
    if (line.trim() !== '' && !line.trim().startsWith('#')) {
      const indented = line.startsWith(' ') || line.startsWith('\t')
      const parsed = splitKey(line.trim())
      if (parsed === undefined) rejectUnsupportedLine(line, filePath, lineNumber)
      if (indented) {
        if (openKey === undefined) rejectUnsupportedLine(line, filePath, lineNumber)
        const parent = data[openKey]
        // DEFENSIVE, currently unreachable: every assignment to `openKey` is
        // paired with `data[openKey] = {}`, and a later line with the same key is
        // rejected as a duplicate BEFORE it could replace that object. Kept
        // because the two facts live in different branches, and a future refactor
        // that made a scalar reachable here would otherwise silently drop a field
        // (dual review, MINOR 3): `parent` must be the mapping, not a scalar.
        if (typeof parent !== 'object') rejectUnsupportedLine(line, filePath, lineNumber)
        if (parsed.key in parent) {
          throw new VendorSkillError(
            filePath,
            `duplicate frontmatter key "${openKey}.${parsed.key}" at line ${lineNumber}`,
          )
        }
        parent[parsed.key] = readScalar(parsed.value, filePath)
      } else if (INVOCATION_KEYS.has(parsed.key)) {
        // Refused BEFORE any value is read: this reader cannot honour it, and
        // registering the skill anyway inverts the file's invocability decision.
        throw new VendorSkillError(
          filePath,
          `frontmatter key "${parsed.key}" selects invocability, which this runtime registration path cannot honour (it is consumed by dsh-skill-filesystem); fix the vendored file instead of shipping a silently inverted skill`,
        )
      } else if (parsed.value.trim() === '') {
        // Opens a nested mapping; only ONE such level is supported.
        openKey = parsed.key
        if (parsed.key in data) {
          throw new VendorSkillError(filePath, `duplicate frontmatter key "${parsed.key}" at line ${lineNumber}`)
        }
        data[parsed.key] = {}
      } else {
        // A non-indented line CLOSES any open mapping: zero the key explicitly
        // rather than relying on the assignment order below.
        openKey = undefined
        if (parsed.key in data) {
          throw new VendorSkillError(filePath, `duplicate frontmatter key "${parsed.key}" at line ${lineNumber}`)
        }
        data[parsed.key] = readScalar(parsed.value, filePath)
      }
    }
    if (nextNewline < 0) throw new VendorSkillError(filePath, 'unterminated YAML frontmatter')
    lineStart = nextNewline + 1
    lineNumber += 1
  }
  throw new VendorSkillError(filePath, 'unterminated YAML frontmatter')
}

/** Reads and parses one vendored `SKILL.md` (throws `VendorSkillError`). */
export function readVendorSkillDocument(path: string, directoryName: string): VendorSkillEntry {
  const raw = readFileSync(path, 'utf8')
  return { path, directoryName, document: parseSkillDocument(raw, path) }
}

/**
 * The skill directory names under `dir`, sorted by code point — the same
 * ordering the registry itself uses for runtime entries (dsh-skill/lib/index.js
 * `compareCodePoints`), so the boot log order matches catalog order. A directory
 * without a `SKILL.md` is NOT a skill and is skipped silently; a directory that
 * cannot be stat'ed is skipped too (both are structural, not per-skill facts).
 */
export function listVendorSkillDirectories(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => {
      const candidate = join(dir, name)
      try {
        return statSync(candidate).isDirectory() && statSync(join(candidate, SKILL_FILE_NAME)).isFile()
      } catch {
        return false
      }
    })
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Scans the vendor tree once at apply time: every `SKILL.md` is read and parsed,
 * and a per-skill failure becomes one entry in `failures` instead of an
 * exception that would take the whole plugin down (loud-but-non-fatal, the same
 * discipline the command loop uses).
 *
 * Three failure sources, all loud and none fatal:
 *   - the DIRECTORY LISTING itself (missing/unreadable `vendor/…/skills`): one
 *     `skills scan FAILED` line and an EMPTY scan. Unprotected, `readdirSync`
 *     would throw out of `apply` and — because command registration happens in
 *     the same fiber — roll the command markers back too (dual review, MAJOR).
 *   - a per-file read/parse failure: one `skill <name> FAILED` line.
 *   - a DUPLICATE `name` across two directories: one `skill <name> FAILED` line.
 *     dsh's registry resolves duplicates first-wins with a NO-OP disposer
 *     (lib/index.js:197-200), which is indistinguishable from a real
 *     registration at the call site — so `registered` would silently over-count
 *     a skill the model can never reach under that name. Catching the collision
 *     HERE keeps the summary marker honest at its source.
 *
 * `log` is optional so the pure call sites (unit tests, the probe's derivation)
 * can scan without a logger; `apply` always passes one.
 */
export function scanVendorSkills(
  dir: string = VENDOR_SKILLS_DIR,
  log?: (line: string) => void,
): VendorSkillScan {
  let directoryNames: string[]
  try {
    directoryNames = listVendorSkillDirectories(dir)
  } catch (error) {
    log?.(formatSkillsScanFailedLine(dir, error))
    return { entries: [], failures: [] }
  }
  const entries: VendorSkillEntry[] = []
  const failures: VendorSkillFailure[] = []
  const seenNames = new Map<string, string>()
  for (const directoryName of directoryNames) {
    const path = join(dir, directoryName, SKILL_FILE_NAME)
    let entry: VendorSkillEntry
    try {
      entry = readVendorSkillDocument(path, directoryName)
    } catch (error) {
      failures.push({ path, directoryName, error })
      continue
    }
    const claimedBy = seenNames.get(entry.document.name)
    if (claimedBy !== undefined) {
      failures.push({
        path,
        directoryName,
        error: new VendorSkillError(
          path,
          `duplicate skill name "${entry.document.name}" — directory "${claimedBy}" already provides it, and the registry keeps the first (lib/index.js:197-200)`,
        ),
      })
      continue
    }
    seenNames.set(entry.document.name, directoryName)
    entries.push(entry)
  }
  return { entries, failures }
}

/**
 * The registration handed to `ctx.skills.register`, built from a parsed
 * document. `invocation` is deliberately ABSENT: dsh defaults it to
 * model+user invocable (lib/index.js:203-206), and the `ulw-plan` row's
 * user-invocability is exactly what the T15 gesture bridge needs. `provider` is
 * absent for the same reason (the registry labels its own runtime provider);
 * `source` is present because nothing else fills it.
 */
export function toSkillRegistration(entry: VendorSkillEntry): {
  name: string
  description: string
  whenToUse?: string
  metadata?: Readonly<Record<string, unknown>>
  content: string
  path: string
  source: string
} {
  const { document } = entry
  return {
    name: document.name,
    description: document.description,
    ...document.whenToUse !== undefined ? { whenToUse: document.whenToUse } : {},
    ...document.metadata !== undefined ? { metadata: document.metadata } : {},
    content: document.content,
    // Absolute path of the SKILL.md itself, so the model can resolve a
    // relative reference (`references/…`) against its own directory.
    path: entry.path,
    source: RUNTIME_SOURCE,
  }
}

/** What the loop needs from `ctx`: the registry's runtime registration. */
export interface SkillRegistrationService {
  register: (registration: ReturnType<typeof toSkillRegistration>) => unknown
}

/**
 * The context slice the skill loop reads. `effect` is the same optional cordis
 * member the command loop uses, typed with the same contract: the execute
 * callback's RETURN VALUE is what the fiber collects. It is declared here
 * rather than imported from index.ts because index.ts is the module that
 * depends on this one.
 */
export interface SkillRegistrationContext {
  /** dsh's skill registry (`dsh-skill`); runtime contributions land here. */
  readonly skills: SkillRegistrationService
  /** cordis's fiber-scoped effect collector — used only to adopt a returned disposer. */
  readonly effect?: (execute: () => (() => void) | void) => unknown
}

/** The outcome of one registration sweep, for the summary marker. */
export interface SkillRegistrationOutcome {
  readonly registered: number
  readonly total: number
  readonly failed: number
}

/**
 * Registers every discovered skill, one try/catch per skill: a single bad file
 * logs its own FAILED line and the sweep continues, and the summary marker
 * reports the honest `<r>/<N>` with the failure count beside it. A registration
 * that returns a disposer is adopted through `ctx.effect` (measured: the
 * registry's own `register` already scopes itself to the calling fiber — this
 * only matters for a service that hands a disposer back without scoping it).
 */
export function runSkillRegistrations(
  ctx: SkillRegistrationContext,
  scan: VendorSkillScan,
  log: (line: string) => void,
): SkillRegistrationOutcome {
  let registered = 0
  // BOTH failure sources count: a file that could not be read or parsed, AND a
  // registration the registry rejected. The first cut of this loop counted only
  // the former, which made the summary read `2/3 registered` with no failure
  // count — a loss with no name attached to it. (A unit test caught it; the
  // two sources are now one counter.)
  let failed = 0
  for (const entry of scan.entries) {
    try {
      const disposer = ctx.skills.register(toSkillRegistration(entry))
      if (typeof disposer === 'function' && typeof ctx.effect === 'function') {
        ctx.effect(() => disposer as () => void)
      }
      registered += 1
    } catch (error) {
      failed += 1
      log(formatSkillFailedLine(entry.directoryName, error))
    }
  }
  for (const failure of scan.failures) {
    failed += 1
    log(formatSkillFailedLine(failure.directoryName, failure.error))
  }
  const total = scan.entries.length + scan.failures.length
  log(formatSkillsSummaryLine({ registered, total, failed }))
  return { registered, total, failed }
}
