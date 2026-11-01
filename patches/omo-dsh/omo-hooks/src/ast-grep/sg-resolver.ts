// sg-resolver.ts — S-16 binary resolver, semantic PORT of upstream
// packages/utils/src/ast-grep/sg-resolver.ts @ v4.19.4 (frozen baseline tag,
// commit b072d279110bdda2c6ac2525d0d24dc54d16148a). 语义移植（semantic port only）.
//
// THE ORDER IS THE CONTRACT (FORKS.md §3.1, phase6-mcp-editing.md G-2b) and it
// is transcribed exactly:
//
//   ① OMO_AST_GREP_SG_PATH env override (a non-empty path that exists)
//   ② the runtimeDir (<homeDir>/.omo/runtime/ast-grep/<slug>/sg — the dir the
//      hook provisions into; see install-script.ts astGrepRuntimeDir)
//   ③ PATH, preferring `ast-grep` over `sg`, and for the bare `sg` candidate only
//      when a `--version` probe proves the binary IS ast-grep (Linux ships a
//      setgroups `sg` at /usr/bin/sg — the probe is what keeps that collision
//      from being mistaken for ast-grep; upstream test "prefers ast-grep over
//      Linux setgroups sg collisions" pins it).
//
// CI/HERMETIC SAFETY (the T7 handoff, LANDED): this resolver is the ONLY gate
// between "a session was created" and "a GitHub download is scheduled". An e2e/CI
// boot that exports OMO_AST_GREP_SG_PATH=<fake sg> short-circuits at ① and the
// provisioner is never reached. That export is not a plan any more:
// tests/e2e/drive.mjs's scenarioEnv exports it for EVERY scenario, pointed at the
// committed tests/e2e/fixtures/fake-sg.sh (executable; `--version` answers
// `ast-grep 0.43.0`, the same version as SG_PINNED_VERSION; every other argv is
// refused with a named stderr line and exit 2), a scenario may still re-point or
// empty the key through its own overrides, and `drive.mjs --self-test` refuses a
// pre-seed that is missing, relative, empty, non-executable or pinned elsewhere —
// all before any spawn (FORKS.md §5.1 sg fixture; MAJOR-1 of ARBITRATION-r1,
// which measured the download this seal closes). No gate was invented here; the
// resolver order is upstream's and the override is upstream's.
//
// DEVIATIONS from upstream (itemised, recorded in the manifest row):
//   1. upstream imports `bunWhich` from ../runtime/which (a Bun.which fast path
//      over a pure-PATH scan). DSH runs on Node 24 type-stripping — there is no
//      Bun — so the fast path is DROPPED and the PURE PATH scan is inlined here
//      as {@link whichOnPath} (same candidate order, same unsafe-name guards,
//      minus the win32 PATHEXT expansion which D9 excludes). Behaviour of the
//      scan itself is upstream's, verbatim in order and guards.
//   2. D9: the win32 PATH/PATHEXT branches of whichOnPath are absent; the
//      resolver never names `sg.exe` (sgBinaryName is always `sg`).
//   3. D9 (reduction, recorded here because it is a GUARD that is gone, not a
//      branch): upstream `isUnsafeCommandName` (runtime/which.ts:11) carries a
//      FOURTH arm rejecting a drive-letter command name, `/^[a-zA-Z]:/`. It is
//      ABSENT here, together with the win32 surface it belongs to. It is
//      UNREACHABLE on this call site: the only names ever passed are the
//      literals `"ast-grep"` and `"sg"` ({@link pathCommandCandidates}), neither
//      of which matches that pattern — judged independently by both reviewers
//      (ARBITRATION-r1 A-NIT-T6-1 / B-NIT-4②). The three retained arms are
//      verbatim; adding the fourth back would be a win32 surface D9 excludes.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import { execFileSync } from "node:child_process"
import { accessSync, constants, existsSync, statSync } from "node:fs"
import { delimiter, join } from "node:path"

import { sgBinaryName } from './sg-manifest.ts'
import { SG_PATH_ENV_KEY, type SgResolverOptions } from './types.ts'

function nonEmptyValue(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
}

/** Upstream sg-resolver.ts:14-23, verbatim (isFile && size > 0). */
function defaultFileExists(filePath: string): boolean {
  if (!existsSync(filePath)) return false
  try {
    const stats = statSync(filePath)
    return stats.isFile() && stats.size > 0
  } catch (error) {
    if (error instanceof Error) return false
    return false
  }
}

/**
 * Upstream sg-resolver.ts:25-33, verbatim: stdout only, stderr ignored (the
 * leak under test is the `sg` deprecation banner escaping into the parent —
 * carried by the adapted stderr unit test), 5s timeout.
 */
function defaultVersionProbe(binaryPath: string): string {
  return String(
    execFileSync(binaryPath, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }),
  )
}

/** Upstream sg-resolver.ts:35-37, verbatim — the probe output must say ast-grep. */
function isAstGrepVersionOutput(output: string): boolean {
  return output.toLowerCase().includes("ast-grep")
}

/** Upstream sg-resolver.ts:39-46, verbatim (a throwing probe means "not ast-grep"). */
function hasAstGrepVersion(binaryPath: string, runVersionProbeSync: (binaryPath: string) => string): boolean {
  try {
    return isAstGrepVersionOutput(runVersionProbeSync(binaryPath))
  } catch (error) {
    if (error instanceof Error) return false
    return false
  }
}

/** Upstream sg-resolver.ts:48-50, verbatim — ast-grep first, sg second. */
function pathCommandCandidates(): readonly string[] {
  return ["ast-grep", "sg"]
}

/**
 * The pure-PATH scan half of upstream's `bunWhich` (runtime/which.ts), with the
 * Bun.which fast path and the win32 PATHEXT candidate list DROPPED (deviation 1
 * and 2 in the header). Guards KEPT verbatim: an empty name, path separators, dot
 * segments and NUL bytes all resolve to null, never to a spawn.
 *
 * ONE GUARD IS NOT KEPT, AND THIS DOC USED TO CLAIM IT WAS: upstream's
 * `isUnsafeCommandName` (runtime/which.ts:11) also refuses a drive-letter name
 * (`/^[a-zA-Z]:/`). That arm is absent here (deviation 3 in the header — D9), so
 * a drive-letter name is NOT specially rejected by this function: it would simply
 * find no `"<letter>:<name>"` file on any PATH entry and fall through to null.
 * Same observable answer on every POSIX host, by a different route — which is why
 * the omission is honest once it is named, and a false claim once it is not. The
 * only names ever passed are `"ast-grep"` and `"sg"` anyway.
 */
export function whichOnPath(commandName: string): string | null {
  if (!commandName) return null
  if (isUnsafeCommandName(commandName)) return null

  const pathValue = process.env["PATH"]
  if (!pathValue) return null

  const pathEntries = pathValue.split(delimiter).filter((pathEntry) => pathEntry.length > 0)
  if (pathEntries.length === 0) return null

  for (const pathEntry of pathEntries) {
    const candidatePath = join(pathEntry, commandName)
    if (isExecutable(candidatePath)) return candidatePath
  }
  return null
}

/** Upstream runtime/which.ts isUnsafeCommandName, verbatim minus the win32 drive-letter arm (D9). */
function isUnsafeCommandName(commandName: string): boolean {
  if (commandName.includes("/") || commandName.includes("\\")) return true
  if (commandName === "." || commandName === ".." || commandName.includes("..")) return true
  if (commandName.includes("\0")) return true

  return false
}

/** Upstream runtime/which.ts isExecutable (POSIX arm only, D9). */
function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK)
    return true
  } catch (error) {
    if (!(error instanceof Error) && Object.prototype.toString.call(error) !== "[object Error]") {
      throw error
    }

    return false
  }
}

/**
 * Upstream sg-resolver.ts:52-78, branch for branch. Total function: every input
 * shape resolves to a string or null, never a throw (the outer catch is
 * upstream's and stays).
 */
export function findSgBinarySync(options: SgResolverOptions = {}): string | null {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const fileExists = options.fileExists ?? defaultFileExists
  const runVersionProbeSync = options.runVersionProbeSync ?? defaultVersionProbe
  const which = options.which ?? whichOnPath

  try {
    const envOverride = nonEmptyValue(env[SG_PATH_ENV_KEY])
    if (envOverride !== null && fileExists(envOverride)) return envOverride

    if (options.runtimeDir !== undefined) {
      const runtimeCandidate = join(options.runtimeDir, sgBinaryName(platform))
      if (fileExists(runtimeCandidate)) return runtimeCandidate
    }

    for (const commandName of pathCommandCandidates()) {
      const pathCandidate = which(commandName)
      if (pathCandidate === null || !fileExists(pathCandidate)) continue
      if (commandName !== "sg" || hasAstGrepVersion(pathCandidate, runVersionProbeSync)) return pathCandidate
    }
    return null
  } catch (error) {
    if (error instanceof Error) return null
    return null
  }
}
