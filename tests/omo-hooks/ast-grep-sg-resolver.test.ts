// ast-grep-sg-resolver.test.ts — adapted CARRY of upstream
// packages/utils/src/ast-grep/sg-resolver.test.ts @ v4.19.4 (frozen baseline
// tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a).
//
// RUNNER RULING (P6-T6 first action, measured per file): upstream line 1
// imports `describe, expect, it` from "bun:test"; 7 of its 8 bodies are
// runner-neutral → CARRIED with the import re-pointed to `vitest`. The ONE
// bun-specific body — `keeps the probed binary's stderr out of the parent
// process` — used `import.meta.dir` (:157) and `Bun.spawnSync(["bun", …])`
// (:172), neither of which exists under Node 24 → ADAPTED, not dropped: the
// child is now `process.execPath` running the same generated runner.ts under
// Node's default type-stripping (P-8.6), `import.meta.url` replaces
// `import.meta.dir`, and the asserted property is UNCHANGED: a fake `sg` that
// prints the 0.45 deprecation banner on stderr resolves, and NOTHING the
// default probe wrote escapes into the parent's stderr.
//
// D9 ADAPTATION: the win32 case
// (`prefers ast-grep over sg on win32 without running the version probe`) is
// DROPPED (recorded in the manifest row note ⑤) — its semantics (ast-grep
// first, no probe) is already pinned on the darwin/linux side of the same
// family, and win32 candidate shapes (`C:\\tools\\sg.exe`) no longer exist in
// the narrowed resolver.
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { findSgBinarySync } from '../../patches/omo-dsh/omo-hooks/src/ast-grep/sg-resolver.ts'
import { SG_PATH_ENV_KEY } from '../../patches/omo-dsh/omo-hooks/src/ast-grep/types.ts'

function tempDir(name: string): string {
  return join(tmpdir(), `omo-${name}-${crypto.randomUUID()}`)
}

function writeExecutable(filePath: string): void {
  writeFileSync(filePath, "#!/bin/sh\nprintf 'ast-grep 0.43.0\\n'\n")
}

describe('findSgBinarySync', () => {
  it('prefers the OMO_AST_GREP_SG_PATH override', () => {
    // given
    const root = tempDir('sg-env')
    mkdirSync(root, { recursive: true })
    const overridePath = join(root, 'custom-sg')
    writeExecutable(overridePath)

    // when
    const result = findSgBinarySync({
      env: { [SG_PATH_ENV_KEY]: overridePath },
      fileExists: (filePath) => filePath === overridePath,
      runtimeDir: join(root, 'runtime'),
      which: () => join(root, 'path-sg'),
    })

    // then — the override wins over BOTH later gates; this is ALSO the
    // hermetic e2e/CI control (resolver header / FORKS.md §5.1: pre-seed a
    // fake sg here and the provisioner is never reached).
    expect(result).toBe(overridePath)

    rmSync(root, { force: true, recursive: true })
  })

  it('uses the harness runtime directory before PATH', () => {
    // given
    const root = tempDir('sg-runtime')
    const runtimeDir = join(root, 'runtime')
    mkdirSync(runtimeDir, { recursive: true })
    const runtimeSg = join(runtimeDir, 'sg')
    writeExecutable(runtimeSg)

    // when
    const result = findSgBinarySync({
      env: {},
      fileExists: (filePath) => filePath === runtimeSg,
      platform: 'linux',
      runtimeDir,
      which: () => join(root, 'path-sg'),
    })

    // then
    expect(result).toBe(runtimeSg)

    rmSync(root, { force: true, recursive: true })
  })

  it('returns null without throwing when nothing resolves', () => {
    // given
    const missing = {
      env: {},
      fileExists: () => false,
      runVersionProbeSync: () => {
        throw new Error('should not matter')
      },
      which: () => null,
    }

    // when
    const result = findSgBinarySync(missing)

    // then — total function, the hook's short-circuit depends on it
    expect(result).toBeNull()
  })

  it('prefers ast-grep over sg on darwin without running the version probe', () => {
    // given
    let probeCalls = 0
    const astGrep = '/usr/local/bin/ast-grep'
    const sgAlias = '/usr/local/bin/sg'

    // when
    const result = findSgBinarySync({
      env: {},
      fileExists: () => true,
      platform: 'darwin',
      runVersionProbeSync: () => {
        probeCalls += 1
        throw new Error('probe must not run when ast-grep resolves first')
      },
      which: (commandName) => (commandName === 'ast-grep' ? astGrep : sgAlias),
    })

    // then
    expect(result).toBe(astGrep)
    expect(probeCalls).toBe(0)
  })

  it('prefers ast-grep over sg on linux without running the version probe', () => {
    // given — the D9 shape of the dropped win32 twin: same order, same
    // zero-probe claim, POSIX candidate shapes.
    let probeCalls = 0
    const astGrep = '/usr/local/bin/ast-grep'
    const sgAlias = '/usr/local/bin/sg'

    // when
    const result = findSgBinarySync({
      env: {},
      fileExists: () => true,
      platform: 'linux',
      runVersionProbeSync: () => {
        probeCalls += 1
        throw new Error('probe must not run when ast-grep resolves first')
      },
      which: (commandName) => (commandName === 'ast-grep' ? astGrep : sgAlias),
    })

    // then
    expect(result).toBe(astGrep)
    expect(probeCalls).toBe(0)
  })

  it('falls back to the sg alias on darwin when ast-grep is absent', () => {
    // given
    const sgAlias = '/opt/homebrew/bin/sg'

    // when
    const result = findSgBinarySync({
      env: {},
      fileExists: () => true,
      platform: 'darwin',
      runVersionProbeSync: () => 'ast-grep 0.45.0',
      which: (commandName) => (commandName === 'sg' ? sgAlias : null),
    })

    // then
    expect(result).toBe(sgAlias)
  })

  it('keeps the probed binary stderr out of the parent process', () => {
    // shell-script fixture; the leak under test is POSIX stderr inheritance.
    // Upstream ran this child with Bun.spawnSync(["bun", runnerPath]); the
    // Node adaptation runs the SAME generated runner under
    // process.execPath (Node 24 default type-stripping — the very loader the
    // plugin ships under, P-8.6).
    if (process.platform === 'win32') return

    // given: a fake sg that prints the ast-grep 0.45 deprecation banner on
    // stderr and the version on stdout
    const root = tempDir('sg-stderr')
    mkdirSync(root, { recursive: true })
    const fakeSg = join(root, 'sg')
    writeFileSync(
      fakeSg,
      "#!/bin/sh\nprintf 'WARNING: `sg` is deprecated. Use `ast-grep` instead.\\n' >&2\nprintf 'ast-grep 0.45.0\\n'\n",
    )
    chmodSync(fakeSg, 0o755)
    const runnerPath = join(root, 'runner.ts')
    const resolverPath = fileURLToPath(new URL('../../patches/omo-dsh/omo-hooks/src/ast-grep/sg-resolver.ts', import.meta.url))
    writeFileSync(
      runnerPath,
      [
        `import { findSgBinarySync } from ${JSON.stringify(resolverPath)}`,
        `const result = findSgBinarySync({`,
        `  env: {},`,
        `  platform: "darwin",`,
        `  which: (commandName) => (commandName === "sg" ? ${JSON.stringify(fakeSg)} : null),`,
        `})`,
        `console.log(JSON.stringify({ result }))`,
      ].join('\n'),
    )

    // when: resolve with the DEFAULT version probe inside a child process so
    // inherited stderr is observable
    const child = spawnSync(process.execPath, [runnerPath], { encoding: 'utf8' })
    const childStdout = child.stdout ?? ''
    const childStderr = child.stderr ?? ''

    // then: the fake sg resolves, and nothing the probe wrote to stderr
    // escapes the resolver
    expect(JSON.parse(childStdout.trim())).toEqual({ result: fakeSg })
    expect(childStderr).not.toMatch(/deprecated|WARNING/)

    rmSync(root, { force: true, recursive: true })
  })

  it('prefers ast-grep over Linux setgroups sg collisions', () => {
    // given — /usr/bin/sg is setgroups' tool on Linux, NOT ast-grep; the
    // --version probe is what keeps the collision from being mistaken.
    const linuxSetgroups = '/usr/bin/sg'
    const astGrep = '/usr/local/bin/ast-grep'

    // when
    const result = findSgBinarySync({
      env: {},
      fileExists: () => true,
      platform: 'linux',
      runVersionProbeSync: () => 'sg from shadow-utils',
      which: (commandName) => (commandName === 'ast-grep' ? astGrep : linuxSetgroups),
    })

    // then
    expect(result).toBe(astGrep)
  })
})
