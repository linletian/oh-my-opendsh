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
 * P5-T16（第二轮评审 MAJOR-4）：**消费侧的 team 面适配注记**。
 *
 * 问题：vendored `shared-skills` 里有两枚技能的正文带着**与本部署的 team 工具面
 * 不兼容**的 Team Mode 分支——Phase 5 之前那句「shared-skills 文本与本仓工具面
 * 一致，无需改写」是**假的**（评审逐条复核后驳回）：
 *
 *   * `refactor` 的 Phase 5.1-T（`refactor-squad` 队）：调 `team_list`（本部署
 *     无此工具）、写 `~/.omo/teams/refactor-squad/config.json`（本部署**没有**
 *     盘上 team config 面）、用 `team_create(teamName=...)`（本面只收
 *     `inline_spec`）、用 `category: "unspecified-low"`（本面只有
 *     `quick`/`deep`）、多次调缺必填参数的 `team_task_update(status=...)`。
 *   * `hyperplan` 的 Phase 1（`team_create` + OMO category + `task_send` +
 *     `team_run_id`）：category 在本部署**解析不出来**，`task_send` / `team_run_id`
 *     这两个拼写在本部署**不存在**。
 *
 * 处置（评审建议的第一半「在消费侧完成适配」）：**vendor 字节不动**（vendor
 * 树保持对冻结 tag 的逐字忠实），在**注册给模型的那份正文**前置一段载体注记，
 * 把差异就地讲清——体例同 `ULTRAWORK_CARRIER_NOTE` / `TEAM_CARRIER_NOTE`。
 * `refactor` 的处置是评审建议的第二半「未完成前**强制走 legacy 路径**」：
 * 它的 Team 分支没有被适配，所以注记直接判它走 Phase 5.1-L。
 *
 * **按名登记，不按模式扫**（门 6 c26 的「named, not pattern-matched」同款纪律）：
 * 一枚新技能若也带 team 分支，它的注记必须显式登记在这里——漏登记 = 该技能的
 * 不兼容正文原样进模型面。
 */
/**
 * 本部署 team 面的**真实形状**（P5-T19 第三轮评审 MAJOR-3/MAJOR-4 的共享片段）。
 *
 * 一份文本、三处消费（refactor / hyperplan / ultrawork 的技能注记）；与 omo-hooks
 * 的 `ULTRAWORK_TEAM_CARRIER_NOTE` **逐字相同**——那一份在另一个包（跨包禁 import），
 * 等值由 `tests/omo-commands/team-surface-consistency.test.ts` 的交叉钉保证，
 * 体例同 `OMO_TEAM_*` 服务名的 R-5 双拼写先例。
 */
export const TEAM_SURFACE_SHAPES_NOTE = [
  // P5-T24：**条件句**（第六轮 MINOR-1 的同类漏网）。这条 note 也会在 team 面
  // **缺席**的会话里被注入（skill 随时可加载、keyword 只过滤 type='team'），
  // 所以不能无条件断言「surface 在这里」。
  'IF the team_* tools are in your tool list, THIS deployment\'s surface (not the opencode',
  'one) is: `team_create` takes ONLY `inline_spec`',
  '(`{ name, members: [{ name, category, prompt }] }` — spec level accepts ONLY `name`',
  'and `members`, so NO `description`/`lead`/`leadAgentId`; a member accepts ONLY',
  '`name`/`category`/`seat`/`prompt`, so NO `kind`/`subagent_type`); a member `category`',
  'is exactly `quick` or `deep`; messages are',
  '`team_send_message(teamRunId=<id>, to=<member|"lead"|"*">, body=<text>)` (`body` REQUIRED);',
  'the task board is `team_task_create/team_task_list/team_task_update/team_task_get`',
  '(NOT `task_create`/`task_list`/`task_update`/`task_get`); teardown is',
  '`team_delete(teamRunId=<id>)`; there is NO `team_list`, NO on-disk team config',
  '(`~/.omo/teams/**.json` is never read here), and `team_run_id` is spelled `teamRunId`.',
].join('\n')

/**
 * `hyperplan` 技能体里那段 `team_create` 的**合规替换规格**（P5-T19 第三轮评审
 * MAJOR-4）。
 *
 * 评审的实测：vendored `SKILL.md:223-235` 的 spec 带 spec 级 `description` 与每个
 * member 的 `kind`——本仓 `parseTeamSpec` 的 closed shape 两枚都拒
 * （`V1_UNSUPPORTED_FIELD`，`TEAM_SPEC_UNSUPPORTED_UPSTREAM_FIELDS_V1` 含
 * `description`，`TEAM_MEMBER_UNSUPPORTED_UPSTREAM_FIELDS_V1` 含 `kind`）。上一轮
 * 的注记只翻译 category / 消息工具名 / `teamRunId`，**没有说这两个字段要删**——于是
 * 模型按注记换成 quick/deep 之后，`team_create` 仍然在 Phase 1 被拒。
 *
 * 这份常量给出**可直接抄的完整规格**（两个被拒字段已删、category 已映射），
 * 消费侧三处引用它：本文件的 `hyperplan` 技能注记、`templates/hyperplan.ts` 的
 * FULL roster 契约。`tests/omo-commands/team-surface-consistency.test.ts` 用它跑
 * **真实** `parseTeamSpec`，证明"照抄就能过"。
 */
export const HYPERPLAN_TEAM_SPEC_REPLACEMENT = [
  'team_create({ inline_spec: {',
  '  "name": "hyperplan",',
  '  "members": [',
  '    { "name": "skeptic",    "category": "quick", "prompt": "<full Skeptic system prompt>" },',
  '    { "name": "validator",  "category": "quick", "prompt": "<full Validator system prompt>" },',
  '    { "name": "researcher", "category": "deep",  "prompt": "<full Researcher system prompt>" },',
  '    { "name": "architect",  "category": "deep",  "prompt": "<full Architect system prompt>" },',
  '    { "name": "creative",   "category": "quick", "prompt": "<full Creative system prompt>" }',
  '  ]',
  '} })',
].join('\n')

/**
 * 消费侧的 team 面适配注记（P5-T19 第三轮评审 MAJOR-2/3/4 扩容）。
 *
 * 背景（上一轮）：vendored `shared-skills` 里带 team 分支的技能与本部署的工具面
 * 不兼容；处置是**消费侧**前置注记（vendor 字节不动）。
 *
 * 本轮补三件事：
 *   ① **`debugging` 漏了**——它的 team 路径不在顶层 `SKILL.md`，而在
 *      `references/methodology/02-investigate.md` 的 Path A（写盘上
 *      `~/.omo/teams/debug-squad/config.json`、spec 带 `lead`/`kind`、广播缺
 *      `teamRunId`/`body`）。上一轮的反向门只扫顶层 SKILL.md，所以漏了它。
 *      处置：注记**强制走 Path B**（异步委派），并点名 Path A 的三处不兼容。
 *   ② **`ultrawork` 漏了**——它的 team 指南（`SKILL.md:373-393`）教
 *      `category | subagent_type`（本面拒 `subagent_type`）、`task_send`、
 *      `team_run_id`、`task_create/task_list/...`（本面是 `team_task_*`）。
 *   ③ **`hyperplan` 的注记不够**——只翻译词汇，没删 `description`/`kind`，
 *      照抄仍然被 `parseTeamSpec` 拒。现在直接给**合规替换规格**。
 *
 * **按名登记，不按模式扫**（门 6 c26 的同款纪律）：一枚新技能若也带 team 分支，
 * 它的注记必须显式登记在这里——反向门（`team-surface-consistency` 测试）会扫
 * **顶层 SKILL.md + references/\*\*.md**，漏登记即红。
 */
export const VENDOR_SKILL_TEAM_ADAPTATION_NOTES: Readonly<Record<string, string>> = {
  refactor: [
    '[oh-my-opendsh] Carrier note (refactor skill): the Team Mode branch in this skill',
    '(Phase 5.1-T, the `refactor-squad` team) is NOT adapted to this deployment — run the',
    'LEGACY path (Phase 5.1-L) instead. If the Phase 5 dispatch decision selects the Team',
    'path, take the legacy branch here. Why (the upstream branch names surfaces this',
    'deployment does not have):',
    '  * `team_list` — no such tool here.',
    '  * `~/.omo/teams/refactor-squad/config.json` — this deployment has NO on-disk team',
    '    config; a team is created through `team_create` with an inline spec.',
    '  * calling `team_create` with a `teamName` field — this surface takes ONE argument:',
    '    `inline_spec` (an object or a JSON string of one).',
    '  * `category: "unspecified-low"` — the member categories here are exactly `quick`',
    '    and `deep`.',
    '  * calling `team_task_update` with only `status` — the required arguments are',
    '    `teamRunId`, `taskId`',
    '    and `status`.',
    '',
    TEAM_SURFACE_SHAPES_NOTE,
    '',
    'Everything below this note is upstream\'s text unchanged.',
  ].join('\n'),
  hyperplan: [
    '[oh-my-opendsh] Carrier note (hyperplan skill): the body below is upstream\'s text and',
    'names the opencode team vocabulary. This deployment HAS a team surface, but it is not',
    'the opencode one.',
    '',
    TEAM_SURFACE_SHAPES_NOTE,
    '',
    'REPLACE the inline spec printed in the body below with EXACTLY this one (the body\'s',
    'spec is REJECTED by this parser: spec-level `description` and per-member `kind` are',
    'closed-shape violations — `V1_UNSUPPORTED_FIELD`, first one then the other — and the',
    'opencode categories do not resolve):',
    '',
    HYPERPLAN_TEAM_SPEC_REPLACEMENT,
    '',
    'Then translate the rest: `task_send` becomes `team_send_message(teamRunId, to, body)`,',
    '`team_run_id` becomes `teamRunId`. If the team_* tools are ABSENT in this session, the',
    'nearest surface is DSH subagent dispatch (one delegation per member); everything below',
    'this note is upstream\'s text unchanged.',
  ].join('\n'),
  debugging: [
    '[oh-my-opendsh] Carrier note (debugging skill): the Phase 3 team path',
    '(`references/methodology/02-investigate.md`, "Path A: Team mode ENABLED") is NOT',
    'adapted to this deployment — when you reach Phase 3, take **Path B (async subagents)**',
    'instead, even though the team_* tools may be present. Why Path A fails here:',
    '  * it writes `~/.omo/teams/debug-squad/config.json` — this deployment has NO on-disk',
    '    team config; a team is created through `team_create` with an inline spec.',
    '  * its spec carries `lead` (spec level) and `kind` (per member) — both are',
    '    closed-shape violations here (`V1_UNSUPPORTED_FIELD`).',
    '  * its broadcast `team_send_message` call carries only `to="*"` — the REQUIRED',
    '    `teamRunId` and `body` are missing.',
    '  * its `category: "deep"` members are fine, but the lead must be the creating',
    '    session — this surface has no `lead` field.',
    '',
    TEAM_SURFACE_SHAPES_NOTE,
    '',
    'Everything below this note is upstream\'s text unchanged.',
  ].join('\n'),
  ultrawork: [
    '[oh-my-opendsh] Carrier note (ultrawork skill): the "omo-senpi task + team tools"',
    'section below is upstream\'s text and names the opencode vocabulary. This deployment',
    'HAS a team surface, but it is not the opencode one — translate that section:',
    '  * `task_send` is `team_send_message` here; `team_run_id` is `teamRunId`.',
    '  * the shared task board is `team_task_create` / `team_task_list` /',
    '    `team_task_update` / `team_task_get` — NOT `task_create` / `task_list` /',
    '    `task_update` / `task_get`.',
    '  * a member may NOT take `subagent_type` on this surface (it is refused by name,',
    '    `SUBAGENT_TYPE_UNSUPPORTED`); use `category` (`quick` or `deep`) or `seat`.',
    '',
    TEAM_SURFACE_SHAPES_NOTE,
    '',
    'Everything below this note is upstream\'s text unchanged.',
  ].join('\n'),
}

/** 一枚技能要不要前置它的 team 面适配注记（按名登记）。 */
export function teamAdaptationNoteFor(skillName: string): string | undefined {
  return VENDOR_SKILL_TEAM_ADAPTATION_NOTES[skillName]
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
    // P5-T16 (MAJOR-4): 前置该技能的 team 面适配注记（vendor 字节不动——
    // 注记在**注册给模型的那份正文**之外的前置位，与 ultrawork/hyperplan 的
    // 载体注记同体例）。
    content: teamAdaptationNoteFor(document.name) === undefined
      ? document.content
      : `${teamAdaptationNoteFor(document.name)}\n\n---\n\n${document.content}`,
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
