// scripts/vendor-manifest.d.mts — type declarations for the vendor drift
// detector's exports (scripts/vendor-manifest.mjs), consumed by the vitest unit
// test (tests/vendor/shared-skills-manifest.test.ts). The implementation stays
// plain .mjs (no build step); these signatures mirror the real exports so the
// test typechecks under strict mode — the same pattern as
// scripts/verify-licenses.d.mts and scripts/doctor-lite.d.mts (P4-T4).
//
// Without this file, TypeScript resolves the `.mjs` import as untyped `any`,
// which cascades into TS7016 at the import and TS7006 on every callback that
// consumes one of its return values.

/** One manifest entry whose recorded sha256 no longer matches the file on disk. */
export interface VendorDriftEntry {
  /** Manifest-relative path. */
  path: string
  /** The manifest's `origin` for that entry. */
  origin: string
  /** sha256 recorded in the manifest. */
  expected: string
  /** sha256 recomputed from disk. */
  actual: string
  /** Whether `deviations[]` declares a change for this path. */
  declaredDeviation: boolean
}

/** The report for one vendored package directory. */
export interface VendorPackageReport {
  /** Repo-relative package path (posix separators). */
  package: string
  /** True when there is no drift, nothing missing and nothing untracked. */
  ok: boolean
  /** Set only when the package has no readable VENDOR-MANIFEST.json. */
  error?: string
  /** Number of `files[]` entries in the manifest. */
  files: number
  /** The manifest's own `counts` block, verbatim, when it has one. */
  counts: Record<string, unknown> | null
  drift: VendorDriftEntry[]
  /** Manifest entries with no file on disk. */
  missing: string[]
  /** Files on disk that the manifest does not list. */
  untracked: string[]
}

/** The aggregate payload both the CLI and `reportPayload` report. */
export interface VendorPayload {
  pass: boolean
  packages: Array<{ package: string; files: number; ok: boolean }>
  files: number
  violations: string[]
}

/** Every vendored file under `dir`, as sorted posix-relative paths. */
export declare function listFiles(dir: string): string[]

/** sha256 of one file's bytes, hex. */
export declare function sha256File(file: string): string

/** Vendored package directories under `patches/omo-dsh/vendor/` that carry a manifest. */
export declare function vendorPackageDirs(root: string): string[]

/** Check one vendored package directory (pure: no printing, no exit code). */
export declare function checkVendorPackage(pkgDir: string): VendorPackageReport

/** Check every requested package; defaults to all vendored packages under `root`. */
export declare function checkAll(root: string, dirs?: string[]): VendorPackageReport[]

/** Flatten package reports into the pass/fail payload. */
export declare function reportPayload(reports: VendorPackageReport[]): VendorPayload
