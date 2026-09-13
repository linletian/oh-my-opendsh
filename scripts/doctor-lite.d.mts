// scripts/doctor-lite.d.mts — type declarations for the doctor gate's exports
// (scripts/doctor-lite.mjs) that TypeScript consumers import. The
// implementation stays plain .mjs (no build step); these signatures mirror the
// real exports so the vitest unit tests typecheck under strict mode (same
// pattern as scripts/verify-licenses.d.mts).
//
// P2-T15: tests/omo-agents/concerto-preset.test.ts consumes `loadYamlDialect`
// to parse the RENDERED concerto composition in the exact dialect dsh loads
// compositions with (installed js-yaml, JSON_SCHEMA + `!!js`) instead of
// hand-rolling a second YAML reader.

/** Repo root: the script's directory's parent. */
export declare const REPO_ROOT: string

/** Default cordis.yml location (overridable: --cordis / OMO_DOCTOR_CORDIS_PATH). */
export declare const DEFAULT_CORDIS_PATH: string

/**
 * Resolves the INSTALLED dsh's node_modules from the dsh binary itself.
 * Returns the absolute path, or null when dsh is not on PATH or the tree
 * cannot be found.
 */
export declare function resolveDshNodeModules(): Promise<string | null>

/**
 * Loads a YAML file with the installed dsh's js-yaml in the loader dialect
 * (JSON_SCHEMA + `!!js`). Throws an Error with `code === 'NO_PARSER'` when the
 * installed dsh (and thus the parser) is unavailable, or `code === 'PARSE'` on
 * a YAML syntax error.
 */
export declare function loadYamlDialect(file: string): Promise<unknown>

/** One doctor check result. */
export interface DoctorCheck {
  name: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  message: string
  issues: string[]
}

/** Runs the four checks in order; `pass` is false iff any check FAILed. */
export declare function runDoctor(cordisPath: string): Promise<{
  checks: DoctorCheck[]
  pass: boolean
}>
