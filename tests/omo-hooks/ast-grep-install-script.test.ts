// ast-grep-install-script.test.ts — adapted CARRY of upstream
// packages/utils/src/ast-grep/install-script.test.ts @ v4.19.4 (frozen
// baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a).
//
// RUNNER RULING (P6-T6 first action, measured): upstream line 3 imports
// `describe, expect, test` from "bun:test"; every body is runner-neutral
// (injected spawnProcess, no process spawning) → CARRIED, import re-pointed
// to `vitest`, module path re-pointed to the omo-hooks provisioning layer.
//
// D9 ADAPTATION (itemised, mirrors the manifest row note ⑤): upstream's
// `#given Windows and pwsh is missing #when provisioning runs #then
// powershell.exe is tried next` is DROPPED — the runner no longer selects
// install.ps1 nor names pwsh/powershell.exe (single bash invocation). Its
// INVERSE is pinned in its place: on every platform the ONLY invocation is
// `bash install.sh`, and a missing install.sh SKIPs with the reason — the
// fallback never half-fires on Windows shapes.
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'

import {
  AST_GREP_BIN_DIR_ENV_KEY,
  astGrepRuntimeDir,
  runAstGrepSkillInstall,
  type AstGrepInstallSpawn,
  type AstGrepInstallSpawnOutcome,
} from '../../patches/omo-dsh/omo-hooks/src/ast-grep/install-script.ts'

describe('runAstGrepSkillInstall', () => {
  it('#given install.sh exists #when provisioning runs #then OMO_AST_GREP_BIN_DIR targets the runtime slug', async () => {
    // given — the dual-source wiring (T1 ruling, FORKS.md §3.2): the env key
    // and the targetDir formula the vendored skill's install.sh honours
    // (install.sh:34 `${OMO_AST_GREP_BIN_DIR:-$SKILL_ROOT/bin}`) are pinned
    // end-to-end here.
    const invocations: Array<{ readonly command: string; readonly binDir: string | undefined }> = []
    const targetDir = astGrepRuntimeDir('/home/test/.omo', 'darwin', 'arm64')
    const spawnProcess: AstGrepInstallSpawn = (command, _args, options) => {
      invocations.push({ command, binDir: options.env[AST_GREP_BIN_DIR_ENV_KEY] })
      return { kill: () => undefined, outcome: Promise.resolve({ kind: 'exit', code: 0, signal: null }) }
    }

    // when
    const result = await runAstGrepSkillInstall({
      fileExists: (filePath) => filePath.endsWith('install.sh'),
      platform: 'darwin',
      skillDir: '/skills/ast-grep',
      spawnProcess,
      targetDir,
    })

    // then
    expect(result.kind).toBe('succeeded')
    expect(invocations).toEqual([{ command: 'bash', binDir: targetDir }])
    expect(targetDir).toBe(join('/home/test/.omo', 'runtime', 'ast-grep', 'darwin-arm64'))
  })

  it('#given install script exits one #when provisioning runs #then the failure is returned without throwing', async () => {
    // given
    const spawnProcess: AstGrepInstallSpawn = () => ({
      kill: () => undefined,
      outcome: Promise.resolve({ kind: 'exit', code: 1, signal: null }),
    })

    // when
    const result = await runAstGrepSkillInstall({
      fileExists: (filePath) => filePath.endsWith('install.sh'),
      platform: 'linux',
      skillDir: '/skills/ast-grep',
      spawnProcess,
      targetDir: '/home/test/.omo/runtime/ast-grep/linux-x64',
    })

    // then
    expect(result.kind).toBe('failed')
  })

  it('#given install script hangs #when timeout elapses #then the child is killed and timeout is returned', async () => {
    // given
    let kills = 0
    let finish: ((outcome: AstGrepInstallSpawnOutcome) => void) | undefined
    const spawnProcess: AstGrepInstallSpawn = () => ({
      kill: () => {
        kills += 1
        finish?.({ kind: 'exit', code: null, signal: 'SIGTERM' })
      },
      outcome: new Promise<AstGrepInstallSpawnOutcome>((resolve) => {
        finish = resolve
      }),
    })

    // when
    const result = await runAstGrepSkillInstall({
      fileExists: (filePath) => filePath.endsWith('install.sh'),
      platform: 'linux',
      skillDir: '/skills/ast-grep',
      spawnProcess,
      targetDir: '/home/test/.omo/runtime/ast-grep/linux-x64',
      timeoutMs: 1,
    })

    // then
    expect(result.kind).toBe('timed-out')
    expect(kills).toBe(1)
  })

  it('#given a missing install.sh #when provisioning runs #then it skips with the reason (no ps1 ever named)', async () => {
    // The D9 inverse pin (header): the runner's ONLY script face is
    // install.sh and its ONLY shell is bash — a missing install.sh skips loud
    // in the reason, and install.ps1 / pwsh never appear on any surface.
    const commands: string[] = []
    const scriptPaths: string[] = []
    const spawnProcess: AstGrepInstallSpawn = (command, args) => {
      commands.push(command)
      scriptPaths.push(...args)
      return { kill: () => undefined, outcome: Promise.resolve({ kind: 'exit', code: 0, signal: null }) }
    }

    // when
    const result = await runAstGrepSkillInstall({
      fileExists: () => false,
      platform: 'linux',
      skillDir: '/skills/ast-grep',
      spawnProcess,
      targetDir: '/home/test/.omo/runtime/ast-grep/linux-x64',
    })

    // then
    expect(result.kind).toBe('skipped')
    expect(result.kind === 'skipped' && result.reason).toContain('install.sh')
    expect(commands).toEqual([])
    expect(scriptPaths.join(' ')).not.toContain('install.ps1')
    expect(scriptPaths.join(' ')).not.toMatch(/pwsh|powershell/)
  })

  it('#given a win32-shaped host #when provisioning runs #then bash install.sh is still the only invocation', async () => {
    // D9 shape of the DROPPED pwsh-fallback test: even a win32 platform tag
    // cannot make this runner select install.ps1 — the selection branch is
    // gone, the fallback list is gone, and the platform option survives only
    // as inert pass-through data (recorded in the row note ⑤).
    const invocations: string[] = []
    const spawnProcess: AstGrepInstallSpawn = (command, args) => {
      invocations.push(`${command} ${args.join(' ')}`)
      return { kill: () => undefined, outcome: Promise.resolve({ kind: 'exit', code: 0, signal: null }) }
    }

    const result = await runAstGrepSkillInstall({
      fileExists: (filePath) => filePath.endsWith('install.sh'),
      platform: 'win32',
      skillDir: 'C:\\skills\\ast-grep',
      spawnProcess,
      targetDir: 'C:\\Users\\test\\.omo\\runtime\\ast-grep\\linux-x64',
    })

    expect(result.kind).toBe('succeeded')
    expect(invocations).toHaveLength(1)
    expect(invocations[0]).toContain('install.sh')
    expect(invocations[0]).not.toContain('install.ps1')
    expect(invocations[0]).not.toMatch(/pwsh|powershell/)
  })
})
