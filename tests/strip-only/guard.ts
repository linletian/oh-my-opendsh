// tests/strip-only/guard.ts — the SHARED strip-only guard.
//
// P4-T16. Two DSH patch packages are loaded by Node's TYPE-STRIPPING, whose loader
// runs in STRIP-ONLY mode: types are erased, nothing is transformed. Strip-only
// cannot handle the TypeScript constructs that require code generation, and the
// failure is a hard `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]` AT PLUGIN
// LOAD — the whole dsh boot dies with `plugin tree failed to load … <package>`.
//
// WHY THIS IS A SHARED MODULE AND NOT A SECOND COPY. The guard started life as
// `tests/omo-commands/strip-only.test.ts` (P4-T5), written when omo-commands was
// the only package with a `src/` tree worth scanning. P4-T8 then created
// `omo-hooks/src/services/stop-continuation-guard.ts` — the first source file in
// omo-hooks OUTSIDE `src/hooks/` — and no guard covered it at all. Copying the
// file would have created a second copy of a rule that must not drift: the exact
// failure c12/c16 exist to prevent, one layer down. So the rules live here once
// and both packages' tests supply only their own file roster and call the shared
// predicates.
//
// The predicates return PROBLEMS (strings), not assertions. That is what lets one
// implementation serve two packages: the vitest wiring (roster equality,
// non-vacuity, counterfactuals) stays in each test file, where it is package-
// specific, while the RULE has exactly one definition.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Every `.ts` file under `srcDir`, recursively, as paths relative to `srcDir`. */
export function packageSources(srcDir: string): { file: string; source: string }[] {
  const found: { file: string; source: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(child)
        continue
      }
      if (!entry.name.endsWith('.ts')) continue
      found.push({ file: relative(srcDir, child), source: readFileSync(child, 'utf8') })
    }
  }
  walk(srcDir)
  return found.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

/**
 * Comments removed, STRINGS KEPT — the input for specifier extraction.
 *
 * The split from `codeOnly` exists because the first cut ran the specifier scan on
 * `codeOnly` output, which replaces every string literal with `''`; the regex then
 * required a `.` immediately after the quote and could never match, so the
 * `.ts`-specifier check passed on ZERO imports — a vacuous assertion. An import
 * specifier IS a literal we need the value of, so this pass keeps it.
 */
export function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/**
 * Strips comments and string literals so a keyword inside prose (these files are
 * comment-heavy on purpose) cannot trip the scan, and a keyword inside a string
 * literal is genuinely not code.
 */
export function codeOnly(source: string): string {
  return withoutComments(source)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

/** The parameter list of the first `constructor(`, brace-balanced. */
export function constructorParameters(code: string): string | undefined {
  const start = code.search(/\bconstructor\s*\(/)
  if (start < 0) return undefined
  for (let index = code.indexOf('(', start); index < code.length; index += 1) {
    const char = code[index]
    if (char === '(') continue
    if (char === ')') {
      // Rewind to the matching '(' by counting from the constructor's own open.
      let depth = 0
      for (let i = code.indexOf('(', start); i <= index; i += 1) {
        if (code[i] === '(') depth += 1
        else if (code[i] === ')') {
          depth -= 1
          if (depth === 0) return code.slice(code.indexOf('(', start) + 1, i)
        }
      }
    }
  }
  return code.slice(code.indexOf('(', start) + 1)
}

/** The one suffix rule, named once so the callers' counterfactuals share it. */
export const TS_SUFFIX = /\.ts$/

/**
 * Each entry: what strip-only refuses, and the construct that triggers it.
 *
 * Parameter properties are NOT in this table on purpose: the keyword also appears
 * in ordinary field declarations (`readonly name: string`), which are perfectly
 * legal strip-only. The precise check scopes the same keywords to a constructor's
 * parameter list — `parameterPropertyProblems`.
 */
export const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: 'enum declaration', pattern: /\benum\s+[A-Za-z_$]/ },
  { label: 'namespace / module declaration', pattern: /\b(namespace|module)\s+[A-Za-z_$]/ },
  { label: 'export assignment (export = x)', pattern: /^\s*export\s*=/m },
  { label: 'import assignment (import x = require(...))', pattern: /^\s*import\s+[A-Za-z_$][\w$]*\s*=\s*require\(/m },
  { label: 'declare on a runtime binding', pattern: /^\s*declare\s+(const|let|var|function|class)\b/m },
]

/** Source files using a construct that needs code generation (empty = clean). */
export function forbiddenConstructProblems(sources: { file: string; source: string }[]): string[] {
  const problems: string[] = []
  for (const { file, source } of sources) {
    const code = codeOnly(source)
    for (const { label, pattern } of FORBIDDEN) {
      if (pattern.test(code)) problems.push(`${file}: ${label}`)
    }
  }
  return problems
}

/**
 * The top-level parameter SEGMENTS of a constructor parameter list, with every
 * nested `{…}` / `[…]` / `(…)` / `<…>` dropped.
 *
 * P4-T16. The rule this replaces tested the whole parameter list for
 * `readonly|private|protected|public`, which is too coarse: it reported
 * `hooks/webfetch-redirect-guard.ts` for
 * `constructor(code: E, message: string, options?: { readonly cause?: unknown })`
 * — a `readonly` inside a nested object TYPE, not a parameter property. Strip-only
 * erases both, so the old rule was a false positive on a file that boots fine.
 * It survived until now only because no guard covered omo-hooks.
 *
 * A parameter property is a modifier on a TOP-LEVEL segment, so cutting the list
 * at top-level commas is the whole job — and cutting at EVERY comma is the bug:
 * the nested `{ readonly cause?: unknown }` gets split mid-object and the fragment
 * `readonly cause?` matches a modifier pattern. That is why the split here is
 * depth-aware, and why the nesting regression case is a real source shape from this
 * package rather than a synthetic one.
 */
export function topLevelParameterSegments(parameters: string): string[] {
  const segments: string[] = []
  let depth = 0
  let segment = ''
  const flush = () => {
    const trimmed = segment.trim()
    if (trimmed !== '') segments.push(trimmed)
    segment = ''
  }
  for (const char of parameters) {
    if (char === '{' || char === '[' || char === '(' || char === '<') {
      depth += 1
      continue
    }
    if (char === '}' || char === ']' || char === ')' || char === '>') {
      depth -= 1
      continue
    }
    if (char === ',' && depth === 0) { flush(); continue }
    segment += char
  }
  flush()
  return segments
}

/** The parameter NAMES at the top level of a constructor parameter list. */
export function topLevelParameterNames(parameters: string): string[] {
  return topLevelParameterSegments(parameters)
    .map((segment) => (segment.split(/[:?=]/)[0] ?? '').replace(/^\s*|\s*$/g, ''))
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name))
}

/** Parameter properties (`constructor(private x: T)`) — legal TS, fatal strip-only. */
export function parameterPropertyProblems(sources: { file: string; source: string }[]): string[] {
  const problems: string[] = []
  for (const { file, source } of sources) {
    const parameters = constructorParameters(codeOnly(source))
    if (parameters === undefined) continue
    // 修饰符必须落在**顶层段**上：`private x` 是参数属性；`options?: { readonly … }`
    // 的 `readonly` 在被丢弃的嵌套层里，不是。
    const offenders = topLevelParameterSegments(parameters)
      .filter((segment) => /^(?:(?:public|private|protected|readonly|override|abstract)\s+)+[A-Za-z_$][\w$]*\s*[?:=]/.test(segment))
      .map((segment) => segment.split(/[?:=]/)[0]!.trim())
    if (offenders.length > 0) {
      problems.push(`${file}: constructor parameter property (${offenders.join(', ')})`)
    }
  }
  return problems
}

/**
 * Every relative import specifier, static and dynamic.
 *
 * Strip-only does no specifier resolution, so a bare './manifest' fails at load
 * with ERR_MODULE_NOT_FOUND — and a DYNAMIC import resolves at RUNTIME, which is
 * strictly worse than a static one, so it must not be the loophole that drops the
 * suffix.
 */
export function relativeSpecifiers(sources: { file: string; source: string }[]): { file: string; specifier: string }[] {
  return sources.flatMap(({ file, source }) => [...withoutComments(source)
    .matchAll(/(?:from\s+|import\s*\()\s*(['"])(\.[^'"]*)\1/g)]
    .map((match) => ({ file, specifier: match[2]! })))
}

/** Relative import specifiers that lost their `.ts` suffix (empty = clean). */
export function missingTsSuffixProblems(sources: { file: string; source: string }[]): string[] {
  return relativeSpecifiers(sources)
    .filter(({ specifier }) => !TS_SUFFIX.test(specifier))
    .map(({ file, specifier }) => `${file}: ${specifier}`)
}
