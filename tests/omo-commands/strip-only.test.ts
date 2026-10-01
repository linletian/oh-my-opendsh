// P4-T5 — the STRIP-ONLY syntax guard for the omo-commands package.
//
// WHY THIS FILE EXISTS. dsh loads this plugin through Node's type-stripping
// (P-8.6), and the loader runs in STRIP-ONLY mode: types are erased, nothing is
// transformed. Strip-only cannot handle the TypeScript constructs that require
// code generation, and the failure is a hard `SyntaxError
// [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]` at PLUGIN LOAD — the whole dsh boot dies
// with `plugin tree failed to load … omo-commands`.
//
// THE POINT OF THE GUARD: vitest transpiles .ts with esbuild, which happily
// supports every construct below. So a parameter property, an enum or a
// namespace in this package passes EVERY unit test in the suite — 39 green
// tests, zero warning — and kills the real boot. This file is the only surface
// that can see the difference, so it reads the package's own sources and
// rejects the shapes strip-only refuses.
//
// It is deliberately a SOURCE scan rather than a load test: booting dsh per
// syntax error is a five-minute feedback loop, and the offending construct is
// textual. The boot-level check that these files really do load exists too
// (scripts/cold-start.sh greps the markers of a real boot).
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** The package's `src/` — anchored to this test file, never to process.cwd(). */
const PACKAGE_SRC_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'patches',
  'omo-dsh',
  'omo-commands',
  'src',
)

/**
 * Every .ts file under the package source, recursively, as a path RELATIVE to
 * `src/` — sorted for a stable failure order.
 *
 * RECURSIVE on purpose (dual review, NIT): the flat `readdirSync(dir)` this
 * replaced would have kept passing while silently SKIPPING every file a future
 * refactor moved into `src/<subdir>/` — and the whole point of this guard is
 * that it cannot miss a source file. A `.ts` file's relative path is what the
 * failure messages print.
 */
function packageSources(): { file: string; source: string }[] {
  const found: { file: string; source: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(child)
        continue
      }
      if (!entry.name.endsWith('.ts')) continue
      found.push({
        file: relative(PACKAGE_SRC_DIR, child),
        source: readFileSync(child, 'utf8'),
      })
    }
  }
  walk(PACKAGE_SRC_DIR)
  return found.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

/**
 * Comments removed, STRINGS KEPT — the input for specifier extraction.
 *
 * This split exists because the first cut ran the specifier scan on `codeOnly`
 * output, which replaces every string literal with `''`; the regex then required
 * a `.` immediately after the quote and could never match, so the `.ts`-specifier
 * check passed on ZERO imports, including a package whose imports were all bare
 * specifiers (a vacuous assertion, caught while applying dual review NIT 8).
 * An import specifier IS a literal we need the value of, so this pass keeps it.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/**
 * Strips comments and string literals so a keyword inside prose (these files are
 * comment-heavy on purpose) cannot trip the scan, and a keyword inside a string
 * literal is genuinely not code.
 */
function codeOnly(source: string): string {
  return withoutComments(source)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

/** The parameter list of the first `constructor(`, brace-balanced. */
function constructorParameters(code: string): string | undefined {
  const start = code.search(/\bconstructor\s*\(/)
  if (start < 0) return undefined
  let depth = 0
  for (let index = code.indexOf('(', start); index < code.length; index += 1) {
    const char = code[index]
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) return code.slice(code.indexOf('(', start) + 1, index)
    }
  }
  return code.slice(code.indexOf('(', start) + 1)
}

/**
 * The one suffix rule, named once so the loop and its counterfactual share it.
 */
const TS_SUFFIX = /\.ts$/

const sources = packageSources()

describe('P4-T5 the omo-commands sources are loadable by Node strip-only type erasure', () => {
  it('finds the package sources (a silent empty scan must not pass for green)', () => {
    expect(sources.map((entry) => entry.file)).toEqual([
      'boot-markers.ts',
      // P4-T6 起包内有子目录（handler 一层、模板一层）。这些是相对包根的递归
      // 相对路径 —— 所以这份清单同时钉住「有哪些文件」与「没有多出清单外的文件」，
      // 新增一个文件而忘了在这里登记（或反之）都会变红。P4-T10 增两条（ulw-execute
      // 的 handler + 模板；P4-T14 再增两条（hyperplan 的 handler + 模板）。该扫描是本仓唯一能抓到「.ts 后缀被写丢」的守卫面 ——
      // 写丢则真机 Node type-stripping 找不到模块，而 vitest(esbuild) 照常绿。
      'commands/command-types.ts',
      'commands/errors.ts',
      'commands/handoff.ts',
      'commands/hyperplan.ts',
      'commands/remove-ai-slops.ts',
      'commands/stop-continuation.ts',
      'commands/ulw-execute.ts',
      'commands/user-message.ts',
      'index.ts',
      'manifest.ts',
      'skills.ts',
      'templates/handoff.ts',
      'templates/hyperplan.ts',
      'templates/remove-ai-slops.ts',
      'templates/render.ts',
      'templates/stop-continuation.ts',
      'templates/ulw-execute.ts',
    ])
  })

  it('uses no TypeScript construct that needs code generation', () => {
    // Each entry: what strip-only refuses, and the construct that triggers it.
    // Parameter properties are NOT in this table on purpose: the keyword also
    // appears in ordinary field declarations (`readonly name: string`), which are
    // perfectly legal strip-only. The precise check scopes the same keywords to a
    // constructor's parameter list, in the test below.
    const forbidden: { label: string; pattern: RegExp }[] = [
      { label: 'enum declaration', pattern: /\benum\s+[A-Za-z_$]/ },
      { label: 'namespace / module declaration', pattern: /\b(namespace|module)\s+[A-Za-z_$]/ },
      { label: 'export assignment (export = x)', pattern: /^\s*export\s*=/m },
      { label: 'import assignment (import x = require(...))', pattern: /^\s*import\s+[A-Za-z_$][\w$]*\s*=\s*require\(/m },
      { label: 'declare on a runtime binding', pattern: /^\s*declare\s+(const|let|var|function|class)\b/m },
    ]
    for (const { file, source } of sources) {
      const code = codeOnly(source)
      for (const { label, pattern } of forbidden) {
        expect(`${file}: ${label}: ${pattern.test(code)}`).toBe(`${file}: ${label}: false`)
      }
    }
  })

  it('has no parameter property hiding in a constructor signature', () => {
    // Spelled out separately from the table above because the constructor slice
    // is the precise shape: a `readonly` in ordinary field position is legal TS
    // AND legal strip-only, and must not fail the check.
    for (const { file, source } of sources) {
      const parameters = constructorParameters(codeOnly(source))
      if (parameters === undefined) continue
      expect(`${file}: ${/\b(readonly|private|protected|public)\b/.test(parameters)}`).toBe(`${file}: false`)
    }
  })

  it('keeps the `.ts` specifier on every relative import (no bundler rewrites it)', () => {
    // P-8.6 again: strip-only does no specifier resolution, so a bare
    // './manifest' would fail at load with ERR_MODULE_NOT_FOUND. Three forms are
    // matched (dual review, NIT 8): single-quoted and double-quoted static
    // imports, and DYNAMIC `import('…')` — a dynamic import resolves at RUNTIME,
    // which is strictly worse than a static one, so it must not be the loophole
    // that drops the `.ts` suffix.
    const specifiers = sources.flatMap(({ file, source }) => [...withoutComments(source)
      .matchAll(/(?:from\s+|import\s*\()\s*(['"])(\.[^'"]*)\1/g)]
      .map((match) => ({ file, specifier: match[2]! })))
    // Non-vacuity first: the scan must have found something, or a package whose
    // imports were all rewritten away would pass for green.
    expect(specifiers.length).toBeGreaterThan(0)
    for (const { file, specifier } of specifiers) {
      expect(`${file}: ${specifier}`).toMatch(TS_SUFFIX)
    }
    // COUNTERFACTUAL, because the first cut of this check compared the string
    // `[file]: [specifier] ends with .ts` against ITSELF — true for every input,
    // so the `.ts` suffix had in fact never been asserted by anything. These two
    // lines run the SAME pattern over a specifier that must pass and one that must
    // not, so the guard above is proven capable of failing.
    expect('index.ts: ./manifest.ts').toMatch(TS_SUFFIX)
    expect('index.ts: ./manifest').not.toMatch(TS_SUFFIX)
  })
})
