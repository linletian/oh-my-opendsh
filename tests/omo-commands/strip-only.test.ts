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
// P4-T16: every rule below now lives ONCE in `tests/strip-only/guard.ts`, which
// `tests/omo-hooks/strip-only.test.ts` also imports. This file keeps what is
// genuinely omo-commands-specific — the file roster, the non-vacuity proof and the
// counterfactuals — and no longer carries its own copy of the predicates. A second
// copy is the drift this guard exists to catch, one layer down.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  TS_SUFFIX,
  forbiddenConstructProblems,
  missingTsSuffixProblems,
  packageSources,
  parameterPropertyProblems,
  relativeSpecifiers,
} from '../strip-only/guard.ts'

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
const sources = packageSources(PACKAGE_SRC_DIR)

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
    expect(forbiddenConstructProblems(sources)).toEqual([])
  })

  it('has no parameter property hiding in a constructor signature', () => {
    expect(parameterPropertyProblems(sources)).toEqual([])
  })

  it('keeps the `.ts` specifier on every relative import (no bundler rewrites it)', () => {
    const specifiers = relativeSpecifiers(sources)
    // Non-vacuity first: the scan must have found something, or a package whose
    // imports were all rewritten away would pass for green.
    expect(specifiers.length).toBeGreaterThan(0)
    expect(missingTsSuffixProblems(sources)).toEqual([])
    // COUNTERFACTUAL, because the first cut of this check compared the string
    // `[file]: [specifier] ends with .ts` against ITSELF — true for every input,
    // so the `.ts` suffix had in fact never been asserted by anything. These two
    // lines run the SAME rule over a specifier that must pass and one that must
    // not, so the guard above is proven capable of failing.
    expect('index.ts: ./manifest.ts').toMatch(TS_SUFFIX)
    expect('index.ts: ./manifest').not.toMatch(TS_SUFFIX)
  })
})
