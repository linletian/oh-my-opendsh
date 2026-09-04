// scripts/verify-licenses.d.mts — type declarations for the license gate's
// pure exports (scripts/verify-licenses.mjs), consumed by the vitest unit
// tests (tests/omo-agents/verify-licenses.test.ts). The implementation stays
// plain .mjs (no build step); these signatures mirror the real exports so the
// tests typecheck under strict mode.
export declare const SUL_ALLOWED_NAME: RegExp

export declare function tokenAllowed(token: string, pkgName: string): boolean

export declare function exprAllowed(expr: string, pkgName: string): boolean

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
