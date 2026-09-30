// scripts/verify-licenses.d.mts — type declarations for the license gate's
// pure exports (scripts/verify-licenses.mjs), consumed by the vitest unit
// tests (tests/omo-agents/verify-licenses.test.ts). The implementation stays
// plain .mjs (no build step); these signatures mirror the real exports so the
// tests typecheck under strict mode.
//
// P4-T4: this file also shadows the implementation's types for
// tests/vendor/shared-skills-manifest.test.ts, so any export added to
// verify-licenses.mjs must be declared here too — otherwise the consumer sees
// TS2305 ("no exported member") even though the runtime export exists.
export declare const SUL_ALLOWED_NAME: RegExp

export declare function tokenAllowed(token: string, pkgName: string): boolean

export declare function exprAllowed(expr: string, pkgName: string): boolean

/**
 * Every in-repo `package.json` this gate scores, as absolute paths, in walk
 * order — every returned path is a file that exists. A direct child of
 * `patches/omo-dsh/vendor/` contributes only its own manifest: vendored package
 * *content* is not a package of this repo (P4-T4 — the shared-skills tree ships
 * a Playwright template manifest that the skill tells the user to copy into
 * their own project).
 */
export declare function repoManifestFiles(root: string): string[]

export declare function reportPayload(args: {
  checked: number
  violations: string[]
  skippedKeys: string[]
}): {
  pass: boolean
  violations: string[]
  checked: number
  skipped: number
  skippedNames: string[]
}
