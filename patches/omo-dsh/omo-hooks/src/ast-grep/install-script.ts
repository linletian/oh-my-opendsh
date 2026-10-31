// install-script.ts — S-16 skill-install runner, semantic PORT of upstream
// packages/utils/src/ast-grep/install-script.ts @ v4.19.4 (frozen baseline tag,
// commit b072d279110bdda2c6ac2525d0d24dc54d16148a). 语义移植（semantic port only）.
//
// THE DUAL-SOURCE WIRING (T1 ruling, FORKS.md §3.2 — this file is where the
// two sources meet):
//   · astGrepRuntimeDir (:astGrepRuntimeDir below, upstream :55-57 VERBATIM) is
//     the ONE targetDir formula: `<baseDir>/runtime/ast-grep/<slug>`. The hook
//     (src/hooks/ast-grep-sg-provision.ts) computes its provision target with
//     exactly this function, so the authoritative provision path (sha256-verified
//     sg-provisioner) and the skill fallback path land in the SAME directory.
//   · runAstGrepSkillInstall spawns the vendored skill's own install.sh with
//     OMO_AST_GREP_BIN_DIR=<targetDir> injected (upstream :135 — the env key
//     the skill honours: vendored install.sh:34 reads
//     `${OMO_AST_GREP_BIN_DIR:-$SKILL_ROOT/bin}`), 30s timeout. It is NOT the
//     hook's provisioning path — the hook uses sg-provisioner (checksum
//     verified); this runner stays in the layer as the skill-documented fallback
//     the ruling says to KEEP, so the env/targetDir convention cannot drift
//     from what install.sh honours.
//
// D9 DROP (itemised; recorded in the manifest row):
//   - scriptPathForPlatform loses the `install.ps1` selection — the script is
//     always install.sh (the vendored skill keeps install.ps1 byte-identical as
//     skill payload; this runner simply never names it).
//   - invocationsForPlatform loses the pwsh / powershell.exe fallback list —
//     the only invocation is `bash <install.sh>`.
//   - the win32 `missingExecutable → continue` arm of the outcome loop is gone
//     with it (single bash invocation, no fallback to continue to).
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

import { runtimeSlug } from './sg-manifest.ts'

/** Upstream :7 — the env key the vendored skill's install.sh honours, verbatim. */
export const AST_GREP_BIN_DIR_ENV_KEY = "OMO_AST_GREP_BIN_DIR"
/** Upstream :8 — 30s skill-install budget, verbatim. */
export const AST_GREP_INSTALL_TIMEOUT_MS = 30_000

/** Upstream :10-12, verbatim. */
export type AstGrepInstallSpawnOutcome =
  | { readonly kind: "exit"; readonly code: number | null; readonly signal: NodeJS.Signals | null }
  | { readonly kind: "spawn-error"; readonly error: Error; readonly missingExecutable: boolean }

export interface AstGrepInstallSpawnOptions {
  readonly cwd: string
  readonly env: Record<string, string | undefined>
}

export interface AstGrepInstallSpawnedProcess {
  readonly kill: () => void
  readonly outcome: Promise<AstGrepInstallSpawnOutcome>
}

export type AstGrepInstallSpawn = (
  command: string,
  args: readonly string[],
  options: AstGrepInstallSpawnOptions,
) => AstGrepInstallSpawnedProcess

/** Upstream :30-34 — the four terminal outcomes, verbatim vocabulary. */
export type AstGrepSkillInstallResult =
  | { readonly kind: "succeeded" }
  | { readonly kind: "skipped"; readonly reason: string }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "timed-out" }

export interface AstGrepSkillInstallOptions {
  readonly env?: Record<string, string | undefined>
  readonly fileExists?: (filePath: string) => boolean
  readonly platform?: NodeJS.Platform
  readonly skillDir: string
  readonly spawnProcess?: AstGrepInstallSpawn
  readonly targetDir: string
  readonly timeoutMs?: number
}

export type RunAstGrepSkillInstall = (options: AstGrepSkillInstallOptions) => Promise<AstGrepSkillInstallResult>

interface InstallInvocation {
  readonly command: string
  readonly args: readonly string[]
}

type TimedInvocationOutcome = AstGrepInstallSpawnOutcome | { readonly kind: "timed-out" }

/**
 * Upstream :55-57, VERBATIM — the single targetDir formula shared by the hook's
 * provisioning target and the skill fallback's bin dir (dual-source wiring,
 * header). `runtimeSlug` is the same narrowed slug as sg-manifest.ts.
 */
export function astGrepRuntimeDir(baseDir: string, platform: NodeJS.Platform = process.platform, arch: string = process.arch): string {
  return join(baseDir, "runtime", "ast-grep", runtimeSlug(platform, arch))
}

function isMissingExecutable(error: Error): boolean {
  if (!("code" in error)) return false
  return error.code === "ENOENT"
}

/** Upstream :64-91, verbatim — stdio ignored, windowsHide irrelevant on POSIX, exit/error settled once. */
function defaultSpawnProcess(command: string, args: readonly string[], options: AstGrepInstallSpawnOptions): AstGrepInstallSpawnedProcess {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: "ignore",
    windowsHide: true,
  })
  let settled = false
  const outcome = new Promise<AstGrepInstallSpawnOutcome>((resolve) => {
    const settle = (result: AstGrepInstallSpawnOutcome): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    child.once("error", (error: Error) => {
      settle({ kind: "spawn-error", error, missingExecutable: isMissingExecutable(error) })
    })
    child.once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      settle({ kind: "exit", code, signal })
    })
  })
  return {
    kill: () => {
      if (!child.killed) child.kill()
    },
    outcome,
  }
}

/**
 * Upstream :93-95 minus the win32 `install.ps1` arm (D9): the script this
 * runner ever names is install.sh.
 */
function scriptPathForPlatform(skillDir: string): string {
  return join(skillDir, "install.sh")
}

/** Upstream :97-101 minus the pwsh/powershell.exe fallback list (D9): bash only. */
function invocationsForPlatform(scriptPath: string): readonly InstallInvocation[] {
  return [{ command: "bash", args: [scriptPath] }]
}

/** Upstream :103-123, verbatim — kill-on-timeout, unref'd timer, clearTimeout in finally. */
async function runInvocation(input: {
  readonly invocation: InstallInvocation
  readonly env: Record<string, string | undefined>
  readonly skillDir: string
  readonly spawnProcess: AstGrepInstallSpawn
  readonly timeoutMs: number
}): Promise<TimedInvocationOutcome> {
  const child = input.spawnProcess(input.invocation.command, input.invocation.args, { cwd: input.skillDir, env: input.env })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill()
  }, input.timeoutMs)
  timeout.unref?.()
  try {
    const outcome = await child.outcome
    return timedOut ? { kind: "timed-out" } : outcome
  } finally {
    clearTimeout(timeout)
  }
}

function failedReason(outcome: Exclude<TimedInvocationOutcome, { readonly kind: "exit" } | { readonly kind: "timed-out" }>): string {
  return outcome.error.message
}

/**
 * Upstream :129-155, branch for branch, minus the win32 fallback arm (D9): a
 * missing install.sh SKIPs with the reason (never throws), non-zero exit /
 * spawn-error FAIL with the reason, timeout returns timed-out — the four-outcome
 * vocabulary is the caller's contract and is unchanged.
 */
export async function runAstGrepSkillInstall(options: AstGrepSkillInstallOptions): Promise<AstGrepSkillInstallResult> {
  const fileExists = options.fileExists ?? existsSync
  const scriptPath = scriptPathForPlatform(options.skillDir)
  if (!fileExists(scriptPath)) return { kind: "skipped", reason: `missing ${scriptPath}` }

  const env = { ...(options.env ?? process.env), [AST_GREP_BIN_DIR_ENV_KEY]: options.targetDir }
  const spawnProcess = options.spawnProcess ?? defaultSpawnProcess
  const timeoutMs = options.timeoutMs ?? AST_GREP_INSTALL_TIMEOUT_MS
  const invocations = invocationsForPlatform(scriptPath)

  try {
    for (const invocation of invocations) {
      const outcome = await runInvocation({ env, invocation, skillDir: options.skillDir, spawnProcess, timeoutMs })
      if (outcome.kind === "timed-out") return { kind: "timed-out" }
      if (outcome.kind === "exit") {
        if (outcome.code === 0) return { kind: "succeeded" }
        return { kind: "failed", reason: `${invocation.command} exited ${outcome.code ?? outcome.signal ?? "without status"}` }
      }
      return { kind: "failed", reason: failedReason(outcome) }
    }
    return { kind: "failed", reason: "no ast-grep install shell was available" }
  } catch (error) {
    if (error instanceof Error) return { kind: "failed", reason: error.message }
    return { kind: "failed", reason: String(error) }
  }
}
