// ast-grep-sg-provision.test.ts — adapted CARRY of upstream
// packages/omo-opencode/src/hooks/ast-grep-sg-provision/ast-grep-sg-provision.test.ts
// @ v4.19.4 (frozen baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a),
// plus the P6-T6 additions the task book requires.
//
// RUNNER RULING (P6-T6 first action, measured): upstream line 3 imports
// `afterEach, describe, expect, test` from "bun:test"; the body is
// runner-neutral (deps-injected, no Bun APIs) → CARRIED, import re-pointed
// to `vitest`.
//
// SEAM ADAPTATION (the one structural rewrite): upstream drove the hook with
// `hook.event({ event: { type: "session.created" } })`; the DSH seam is the
// `session/created` EMIT, whose listener receives the Session itself
// (api-catalog dsh-tool-cordis/lib/types/api-catalog.js:4120 — evidence chain
// in hooks/ast-grep-sg-provision.ts's header). Upstream's body never read the
// payload — the event TYPE was the whole gate — so the adapted driver calls
// `hook.handleSessionCreated()` with a placeholder session object: the same
// code path the emit reaches, one spelling shorter. Every asserted event
// sequence is upstream's, verbatim.
//
// P6-T6 ADDITIONS (task book, 空头指令纪律 + 失败形态):
//   * the provision-once memory gets its own pin (upstream left it implicit);
//   * the skill precondition is pinned at build time — the vendored SKILL.md
//     EXISTS, teaches `sg`, and the binary name this hook writes
//     (`sgBinaryName("linux")`) equals the name the skill teaches;
//   * the loud failure surface is pinned: the marker prefix, the structured
//     guidance's recovery paths (manual install + OMO_AST_GREP_SG_PATH), and
//     the never-throw contract on EVERY path (event gate AND async task).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  AST_GREP_SG_PROVISION_EVENT,
  AST_GREP_SG_PROVISION_MARKER,
  buildProvisionFailureGuidance,
  clearAstGrepSgProvisionTargetsForTesting,
  createAstGrepSgProvisionHook,
  registerAstGrepSgProvision,
  type AstGrepSgProvisionDeps,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/ast-grep-sg-provision.ts'
import { sgBinaryName } from '../../patches/omo-dsh/omo-hooks/src/ast-grep/sg-manifest.ts'
import { HOOK_MANIFEST } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'

const SKILL_DIR = fileURLToPath(new URL('../../patches/omo-dsh/vendor/shared-skills/skills/ast-grep', import.meta.url))

function createDeps(events: string[], overrides: Partial<AstGrepSgProvisionDeps> = {}): AstGrepSgProvisionDeps {
  return {
    findSgBinary: () => null,
    homeDir: () => '/home/test',
    log: (message) => events.push(`log:${message}`),
    provisionSgBinary: async (input) => {
      events.push(`provision:${input.targetDir}`)
      return join(input.targetDir, 'sg')
    },
    schedule: (task) => {
      events.push('scheduled')
      void task()
    },
    ...overrides,
  }
}

describe('createAstGrepSgProvisionHook', () => {
  afterEach(() => {
    clearAstGrepSgProvisionTargetsForTesting()
  })

  it('#given sg is missing #when a session is created #then provisioning is scheduled for the OMO runtime directory', async () => {
    // given
    const events: string[] = []
    const hook = createAstGrepSgProvisionHook(createDeps(events, { arch: 'x64', platform: 'linux' }))

    // when — the seam driver (header: SEAM ADAPTATION)
    hook.handleSessionCreated({ id: 'ses_test' })
    await Promise.resolve()

    // then
    expect(events).toContain('scheduled')
    expect(events).toContain(`provision:${join('/home/test', '.omo', 'runtime', 'ast-grep', 'linux-x64')}`)
  })

  it('#given sg already resolves #when a session is created #then no provisioning is scheduled', () => {
    // given — the resolver short-circuit is ALSO the hermetic CI control: an
    // e2e boot exporting OMO_AST_GREP_SG_PATH lands in this branch and the
    // download path is never scheduled (FORKS.md §5.1).
    const events: string[] = []
    const hook = createAstGrepSgProvisionHook(createDeps(events, { arch: 'x64', findSgBinary: () => '/usr/bin/sg', platform: 'linux' }))

    // when
    hook.handleSessionCreated({ id: 'ses_test' })

    // then
    expect(events).toEqual([])
  })

  it('#given sg is missing twice #when two sessions are created #then provisioning is scheduled once per process', () => {
    // The provision-once memory (upstream hook.ts:24/:64, pinned explicitly
    // here — the second event must NOT re-schedule, re-spawn or re-log).
    const events: string[] = []
    const hook = createAstGrepSgProvisionHook(createDeps(events, { arch: 'x64', platform: 'linux' }))

    hook.handleSessionCreated({ id: 'ses_one' })
    hook.handleSessionCreated({ id: 'ses_two' })

    expect(events.filter((event) => event === 'scheduled')).toHaveLength(1)
  })

  it('#given provisioning fails #when background work runs #then the session hook logs loud guidance and never throws', async () => {
    // given
    const events: string[] = []
    const hook = createAstGrepSgProvisionHook(createDeps(events, {
      platform: 'linux',
      arch: 'x64',
      provisionSgBinary: async () => {
        throw new Error('download failed')
      },
    }))

    // when
    expect(() => hook.handleSessionCreated({ id: 'ses_test' })).not.toThrow()
    await Promise.resolve()

    // then — the LOUD named marker carries the error code and the guidance
    // block follows it, and NOTHING threw (upstream parity: best-effort).
    const failure = events.find((event) => event.includes('PROVISION FAILED'))
    expect(failure).toBeDefined()
    expect(failure ?? '').toContain(AST_GREP_SG_PROVISION_MARKER)
    expect(failure ?? '').toContain('download failed')
    expect(events.some((event) => event.includes('guidance:'))).toBe(true)
  })

  it('#given the event gate itself explodes #when the handler runs #then it fails open with a named log', () => {
    // discipline ②: the handler's own catch (upstream hook.ts:68-71). A
    // poisoned resolver input must not travel back into the emit dispatch.
    const events: string[] = []
    const hook = createAstGrepSgProvisionHook(createDeps(events, {
      findSgBinary: () => {
        throw new Error('resolver exploded')
      },
    }))

    expect(() => hook.handleSessionCreated({ id: 'ses_test' })).not.toThrow()
    expect(events.some((event) => event.includes('event handler failed'))).toBe(true)
  })

  it('the failure guidance names the skill, the pin, and the env override (空头指令纪律)', () => {
    // The invariant lives HERE, loud: the vendored skill teaches `sg`, the
    // binary is NOT guaranteed, and both recovery paths are spelled out.
    const guidance = buildProvisionFailureGuidance('/home/test/.omo/runtime/ast-grep/linux-x64')
    expect(guidance).toContain('ast-grep')
    expect(guidance).toContain('`sg`')
    expect(guidance).toContain('no `sg` binary is guaranteed')
    expect(guidance).toContain('OMO_AST_GREP_SG_PATH')
    expect(guidance).toContain('https://ast-grep.github.io')
    expect(guidance).toContain('/home/test/.omo/runtime/ast-grep/linux-x64')
  })

  it('the skill precondition holds: SKILL.md exists, teaches sg, and the binary name matches', () => {
    // 空头指令纪律 at BUILD time: the skill the roster mounts must really
    // teach the CLI this hook guarantees — and the name it teaches must be
    // the name the provisioner writes (`sgBinaryName("linux") === "sg"`).
    const skillMd = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8')
    expect(skillMd).toContain('name: ast-grep')
    expect(skillMd).toMatch(/\bsg\b/)
    expect(skillMd).toContain('`sg`')
    expect(sgBinaryName('linux')).toBe('sg')
    // The install entry the fallback honours is in the same skill dir.
    expect(readFileSync(join(SKILL_DIR, 'install.sh'), 'utf8')).toContain('OMO_AST_GREP_BIN_DIR')
  })

  it('the registrar wires exactly one session/created listener, matching its manifest row', () => {
    // The seam cannot drift: the row's event, the exported constant, and the
    // actual ctx.on call must all read `session/created` (seam evidence in the
    // listener's header).
    const row = HOOK_MANIFEST.find((entry) => entry.id === 'ast-grep-sg-provision')
    expect(row).toBeDefined()
    expect(row?.event).toBe(AST_GREP_SG_PROVISION_EVENT)
    expect(AST_GREP_SG_PROVISION_EVENT).toBe('session/created')

    const onCalls: Array<{ event: string; listener: (...args: readonly unknown[]) => unknown }> = []
    const ctx = {
      on: (event: string, listener: (...args: readonly unknown[]) => unknown) => {
        onCalls.push({ event, listener })
      },
    }
    registerAstGrepSgProvision(ctx as never, row!)

    expect(onCalls).toHaveLength(1)
    expect(onCalls[0]?.event).toBe('session/created')
    // HERMETIC DRIVE (the T7 pattern, FORKS.md §5.1): pre-seed the env
    // override with a file that EXISTS, so the resolver's first gate returns
    // and the default provisioner is NEVER scheduled — no GitHub traffic from
    // a unit suite, ever. The drive must be total (never throws).
    const seed = join(SKILL_DIR, 'install.sh') // an existing, non-empty file — content irrelevant to gate ①
    process.env.OMO_AST_GREP_SG_PATH = seed
    try {
      expect(() => onCalls[0]?.listener({ id: 'ses_probe' })).not.toThrow()
    } finally {
      delete process.env.OMO_AST_GREP_SG_PATH
    }
  })
})

// ── BARREL INTEGRITY (ARBITRATION-r2 B-R2-MAJOR-1) ───────────────────────────
// The provisioning layer reaches this hook through ONE seam, `src/ast-grep/
// index.ts`. c29's textual arm reads that file's bytes, and bytes are not the
// wiring: with the re-export commented out (`// export * from './sg-resolver.ts'`)
// the unanchored regex still matches, c29 prints "barrel members (5 of 5)", the
// 8 tests above stay green, and the hook dies at boot with
// `deps.findSgBinary is not a function`. This suite is the runtime half of that
// fix — it IMPORTS the barrel and asks what is actually there.
//
// WHY EXPLICIT typeof ASSERTIONS AND NOT A TRUTHINESS SWEEP. vitest's SSR
// transform turns a MISSING named export into `undefined` rather than throwing at
// import time (reviewer B's reminder, recorded in the ledger), so `import * as`
// never errors on a dead re-export and a loop over `Object.keys(barrel)` would
// happily report the four keys it does not have. Each symbol is therefore named
// and its typeof pinned, exactly as the gate's runtime arm pins them — two
// independent readers of one seam, gate 6 and gate 2.
describe('the provisioning barrel is live at runtime, not just on disk', () => {
  it('the four symbols the hook consumes through the barrel exist with the right typeof', async () => {
    const barrel = await import('../../patches/omo-dsh/omo-hooks/src/ast-grep/index.ts')
    // Named one by one: a missing symbol must fail HERE, by name, not silently
    // shrink a collection assertion.
    expect(typeof barrel.findSgBinarySync).toBe('function')
    expect(typeof barrel.provisionSgBinary).toBe('function')
    expect(typeof barrel.astGrepRuntimeDir).toBe('function')
    expect(typeof barrel.SG_PINNED_VERSION).toBe('string')
    // And they are the real thing, not placeholders: the resolver answers on the
    // hermetic env gate, so this touches no network and writes nothing.
    expect(barrel.SG_PINNED_VERSION).toBe('0.43.0')
    expect(barrel.findSgBinarySync({
      env: { OMO_AST_GREP_SG_PATH: join(SKILL_DIR, 'install.sh') },
      fileExists: () => true,
    })).toBe(join(SKILL_DIR, 'install.sh'))
  })

  it('the barrel is the only door: the hook source names no deeper module', () => {
    // Pairs with c29 ③, from the test side: if a future edit re-points the hook
    // at a single module, the seam stops being one door and this goes red with it.
    const hookSrc = readFileSync(fileURLToPath(new URL('../../patches/omo-dsh/omo-hooks/src/hooks/ast-grep-sg-provision.ts', import.meta.url)), 'utf8')
    expect(hookSrc).toContain("from '../ast-grep/index.ts'")
    expect(hookSrc).not.toMatch(/from '\.\.\/ast-grep\/(sg-resolver|sg-provisioner|sg-manifest|install-script|types)\.ts'/)
  })
})
