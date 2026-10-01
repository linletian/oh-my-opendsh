// P4-T16 — the STRIP-ONLY syntax guard for the omo-hooks package.
//
// WHY THIS FILE EXISTS. dsh loads this plugin through Node's type-stripping
// (P-8.6), whose loader runs in STRIP-ONLY mode, and the failure for a construct
// that needs code generation is a hard `SyntaxError
// [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]` AT PLUGIN LOAD — the whole dsh boot dies
// with `plugin tree failed to load … omo-hooks`. vitest transpiles .ts with
// esbuild, which supports every such construct, so a parameter property or an
// enum passes EVERY unit test in the suite and kills the real boot.
//
// WHY omo-hooks NEEDED ITS OWN. The guard began as `tests/omo-commands/
// strip-only.test.ts` (P4-T5), when omo-commands was the only package with a
// `src/` tree to scan. P4-T8 then created `src/services/stop-continuation-guard.
// ts` — the FIRST source file in omo-hooks outside `src/hooks/` — and it was
// covered by nothing: no guard, and (by design) not by c12/c13's `src/hooks/`
// scan either. This file closes that gap over the WHOLE `src/` tree, so the next
// `src/<newdir>/` is covered the day it is written rather than the day someone
// remembers.
//
// THE RULES ARE SHARED, NOT COPIED. Every predicate lives in
// `tests/strip-only/guard.ts`, which omo-commands' guard also imports. A second
// copy of the rule would be the same drift this gate exists to catch, one layer
// down. What stays here is what is genuinely package-specific: the file roster,
// the non-vacuity proof, and the counterfactuals that show each rule CAN fail.
import { resolve, dirname } from 'node:path'
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
  'omo-hooks',
  'src',
)

const sources = packageSources(PACKAGE_SRC_DIR)

describe('P4-T16 the omo-hooks sources are loadable by Node strip-only type erasure', () => {
  it('finds the package sources (a silent empty scan must not pass for green)', () => {
    // The roster is an EQUALITY, in both directions: a new source file that nobody
    // registered here turns this red, and so does a registered file that no longer
    // exists. Recursive, so `src/hooks/<subdir>/` and `src/services/` are both in
    // scope — the P4-T8 `src/services/` file is the reason this package is guarded
    // at all, and a flat scan would have missed it.
    expect(sources.map((entry) => entry.file)).toEqual([
      'boot-markers.ts',
      'hooks/agent-usage-reminder.ts',
      'hooks/background-notification.ts',
      'hooks/bash-file-read-guard.ts',
      'hooks/directory-readme-injector.ts',
      'hooks/edit-error-recovery.ts',
      'hooks/empty-task-response-detector.ts',
      'hooks/json-error-recovery.ts',
      'hooks/keyword-detector.ts',
      'hooks/keyword-detector/constants.ts',
      'hooks/keyword-detector/detector.ts',
      'hooks/keyword-detector/filters.ts',
      'hooks/keyword-detector/messages.ts',
      'hooks/prometheus-md-only.ts',
      'hooks/session-notification.ts',
      'hooks/task-resume-info.ts',
      'hooks/todo-continuation-enforcer.ts',
      'hooks/tool-output-truncator.ts',
      'hooks/ulw-execute.ts',
      'hooks/ulw-execute/constants.ts',
      'hooks/ulw-execute/context-builder.ts',
      'hooks/ulw-execute/identity.ts',
      'hooks/ulw-execute/live-state.ts',
      'hooks/ulw-execute/parse-request.ts',
      'hooks/ulw-execute/plan-discovery.ts',
      'hooks/ulw-execute/worktree.ts',
      'hooks/webfetch-redirect-guard.ts',
      'index.ts',
      'manifest.ts',
      // P4-T8 — the first file outside src/hooks/. Without this line the whole
      // reason P4-T16 exists would be untested.
      'services/stop-continuation-guard.ts',
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
    // Non-vacuity first: a package whose relative imports were all rewritten away
    // would otherwise pass for green.
    expect(specifiers.length).toBeGreaterThan(0)
    expect(missingTsSuffixProblems(sources)).toEqual([])
  })

  it('proves each rule CAN fail, on this package\'s own sources', () => {
    // COUNTERFACTUALS. A guard nobody has watched go red is a guard whose passing
    // means nothing. These run the SHARED predicates over synthetic sources built
    // from shapes that exist in this package, so a future refactor of
    // `guard.ts` that silently no-ops a predicate is caught here.
    const tripwire: { file: string; source: string }[] = [
      { file: 'tripwire-enum.ts', source: 'export enum Kind { A = 1 }\n' },
      { file: 'tripwire-paramprop.ts', source: 'export class C { constructor(private readonly x: string) {} }\n' },
      { file: 'tripwire-suffix.ts', source: "import { m } from './manifest'\n" },
    ]
    expect(forbiddenConstructProblems(tripwire)).toContain('tripwire-enum.ts: enum declaration')
    expect(parameterPropertyProblems(tripwire)).toEqual([
      'tripwire-paramprop.ts: constructor parameter property (private readonly x)',
    ])
    expect(missingTsSuffixProblems(tripwire)).toContain('tripwire-suffix.ts: ./manifest')
    // …and the same predicates stay quiet on a legal source, so the tripwires are
    // not simply always-firing.
    // The false positive P4-T16 removed: `readonly` inside a nested object TYPE is
    // erased by strip-only exactly like a parameter property, and is NOT one.
    // `webfetch-redirect-guard.ts` has exactly this shape, so the counterfactual is
    // a real source shape from this package, not a synthetic one.
    const nestedReadonly = [{ file: 'nested.ts', source: 'export class C {\nconstructor(code: string, options?: { readonly cause?: unknown }) { void code; void options }\n}\n' }]
    expect(parameterPropertyProblems(nestedReadonly)).toEqual([])
    const legal = [{ file: 'legal.ts', source: 'export class C { readonly x: string\nconstructor(y: string) { void y } }\n' }]
    expect(forbiddenConstructProblems(legal)).toEqual([])
    expect(parameterPropertyProblems(legal)).toEqual([])
    expect(TS_SUFFIX.test('legal.ts')).toBe(true)
    expect(TS_SUFFIX.test('legal')).toBe(false)
  })
})
