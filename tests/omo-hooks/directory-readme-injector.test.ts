// P3-T15 — directory-readme-injector listener (plan §4.2 pattern D; task book
// WP-6 批 B). The listener is the semantic port of upstream
// packages/omo-opencode/src/hooks/directory-readme-injector/ @ v4.19.4:
//
//   upstream  `tool.execute.after` → tool name `read` (case-insensitive), path
//             from `output.title`, walk root `ctx.directory` → probe
//             `<dir>/README.md` up the chain → skip directories already injected
//             in this session → `output.output += "\n\n[Project README: …]\n…"`
//   this port `tools/post-execute` → the same gate on `exec.name`, the path from
//             the DSH `read` argument `file_path`, the walk root from
//             `session.header.cwd`, the same DIRECTORY-keyed de-duplication, and
//             D-mode delivery `{kind:'accept', content:[{type:'text', text}]}`
//
// The TEN upstream `it` cases are the seed and are transcribed as cases ①–⑨
// below (injector.test.ts ①–⑧ = the parent README, the root README, the
// multi-README chain, the finder's promise+order, the cache, the truncation
// notice, the unresolvable path, the truncation failure; finder.catch-fallbacks
// ⑨ = a missing README rejected with an `Error` and with a non-`Error`).
// Everything after that is the DSH side the upstream suite could not reach: the
// DSH read argument, the cwd walk root, the text-only-content guard, the
// fail-open listener contract, the error-path parity, and the two session
// life-cycle surfaces.
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { access as fsAccess, readFile as fsReadFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HooksRegistrationContext } from '../../patches/omo-dsh/omo-hooks/src/index.ts'
import {
  COMPACTION_END_EVENT_TYPE,
  DIRECTORY_README_INJECTOR_DISPOSED_EVENT,
  DIRECTORY_README_INJECTOR_EVENT,
  DIRECTORY_README_INJECTOR_ID,
  DIRECTORY_README_INJECTOR_SESSION_EVENT,
  README_FILENAME,
  README_INJECTION_MARKER,
  README_READ_PATH_ARGUMENT,
  README_READ_TOOL_NAME,
  README_TARGET_MAX_TOKENS,
  createDirectoryReadmeInjector,
  findReadmeMdUp,
  isReadExecution,
  readExecutionSession,
  readReadPath,
  readSessionCwd,
  readmeTruncationNotice,
  registerDirectoryReadmeInjector,
  resolveFilePath,
  truncateReadmeContent,
  type DirectoryReadmeInjector,
  type ReadmeFailureDetail,
  type ReadmeInjectorDeps,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/directory-readme-injector.ts'
import {
  CONTEXT_EXHAUSTED_RESULT,
  isTextOnlyResultContent,
  readRenderedText,
} from '../../patches/omo-dsh/omo-hooks/src/hooks/tool-output-truncator.ts'
import { HOOK_MANIFEST, type HookManifestEntry } from '../../patches/omo-dsh/omo-hooks/src/manifest.ts'

/** Upstream's failure wording, transcribed from injector.ts:67. */
const UPSTREAM_FAILURE_MESSAGE =
  '[directory-readme-injector] Skipped README injection after read/truncate failure'

let testRoot = ''

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), 'directory-readme-injector-'))
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

/** A session fixture whose header carries the walk root (前置① point 2). */
function sessionFixture(id: string, cwd: string | null = testRoot): object {
  return { id, header: cwd === null ? {} : { cwd } }
}

/** The `tools/post-execute` execution fixture (DSH `read` argument shape). */
function readExecutionFixture(session: unknown, filePath: unknown, name = 'read'): object {
  return { name, arguments: { [README_READ_PATH_ARGUMENT]: filePath }, agent: { session } }
}

/** A successful tool result with one text block. */
function textResult(text: string): object {
  return { isError: false, content: [{ type: 'text', text }] }
}

/** The real filesystem seams; the failure cases override one of them. */
function realFs(): ReadmeInjectorDeps['fs'] {
  return {
    access: (path) => fsAccess(path),
    readFile: (path) => fsReadFile(path, 'utf-8'),
  }
}

/** Records what upstream's `log(...)` carried. */
function createFailureSink(): {
  logFailure: (message: string, detail: ReadmeFailureDetail) => void
  calls: Array<{ message: string; detail: ReadmeFailureDetail }>
} {
  const calls: Array<{ message: string; detail: ReadmeFailureDetail }> = []
  return {
    calls,
    logFailure: (message, detail) => {
      calls.push({ message, detail })
    },
  }
}

function makeInjector(overrides: Partial<ReadmeInjectorDeps> = {}): {
  injector: DirectoryReadmeInjector
  failures: ReturnType<typeof createFailureSink>
} {
  const failures = createFailureSink()
  const injector = createDirectoryReadmeInjector({
    fs: realFs(),
    logFailure: failures.logFailure,
    ...overrides,
  })
  return { injector, failures }
}

/** The injected block upstream injector.ts:60 appended, built by hand. */
function expectedBlock(readmePath: string, content: string): string {
  return `\n\n${README_INJECTION_MARKER} ${readmePath}]\n${content}`
}

/** The number of injected README markers in one text (upstream test helper). */
function countReadmeMarkers(text: string): number {
  return text.split(README_INJECTION_MARKER).length - 1
}

/** A fake ctx that records every `ctx.on` registration. */
function fakeContext(): {
  ctx: HooksRegistrationContext
  listeners: Map<string, (...args: readonly unknown[]) => unknown>
} {
  const listeners = new Map<string, (...args: readonly unknown[]) => unknown>()
  return {
    listeners,
    ctx: {
      on(event, listener) {
        listeners.set(event, listener)
        return () => {}
      },
    },
  }
}

const MANIFEST_ROW = { event: DIRECTORY_README_INJECTOR_EVENT } as never

/**
 * The REAL manifest row (P3-T15 review MINOR-2): the sibling T14 modules pin
 * their row's `e2eScenario` name so a rename can never drift away from the
 * scenario the driver really prints; this row gets the same guard.
 */
function directoryReadmeManifestRow(): HookManifestEntry {
  const row = HOOK_MANIFEST.find((entry) => entry.id === DIRECTORY_README_INJECTOR_ID)
  if (row === undefined) throw new Error('manifest is missing the directory-readme-injector row')
  return row
}

describe('P3-T15 directory-readme-injector — the finder (upstream finder.ts)', () => {
  it('① resolves the path exactly as upstream: empty ⇒ null, absolute ⇒ as-is, relative ⇒ under the root', () => {
    expect(resolveFilePath('/root', '')).toBeNull()
    expect(resolveFilePath('/root', '/elsewhere/README.md')).toBe('/elsewhere/README.md')
    expect(resolveFilePath('/root', 'src/a.ts')).toBe(join('/root', 'src/a.ts'))
  })

  it('② returns a promise and the chain in ROOT-FIRST order (upstream `found.reverse()`)', async () => {
    const src = join(testRoot, 'src')
    const components = join(src, 'components')
    mkdirSync(components, { recursive: true })
    writeFileSync(join(testRoot, README_FILENAME), '# Root README')
    writeFileSync(join(src, README_FILENAME), '# Src README')
    writeFileSync(join(components, README_FILENAME), '# Components README')

    const promise = findReadmeMdUp({ startDir: components, rootDir: testRoot }, realFs())
    expect(promise).toBeInstanceOf(Promise)
    await expect(promise).resolves.toEqual([
      join(testRoot, README_FILENAME),
      join(src, README_FILENAME),
      join(components, README_FILENAME),
    ])
  })

  it('③ walks from the file directory to the root INCLUSIVE (the root README is found)', async () => {
    writeFileSync(join(testRoot, README_FILENAME), '# Root README')
    await expect(findReadmeMdUp({ startDir: testRoot, rootDir: testRoot }, realFs()))
      .resolves.toEqual([join(testRoot, README_FILENAME)])
  })

  it('④ skips a missing README when access rejects with an Error AND with a non-Error (upstream catch fallbacks)', async () => {
    const rejecting = (reason: unknown) => ({
      access: () => Promise.reject(reason),
      readFile: () => Promise.reject(reason),
    })
    await expect(
      findReadmeMdUp({ startDir: join(testRoot, 'src'), rootDir: testRoot }, rejecting(new Error('missing'))),
    ).resolves.toEqual([])
    await expect(
      findReadmeMdUp({ startDir: join(testRoot, 'src'), rootDir: testRoot }, rejecting('not-an-error')),
    ).resolves.toEqual([])
  })

  it('⑤ breaks at the root boundary exactly as upstream (startsWith comparison, then reverse)', async () => {
    // A start dir OUTSIDE the root: upstream probes ITS OWN directory once, then
    // the `!parent.startsWith(rootDir)` break stops the walk before the root.
    const outside = join(testRoot, 'outside')
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, README_FILENAME), '# Outside README')
    writeFileSync(join(testRoot, README_FILENAME), '# Root README')
    await expect(findReadmeMdUp({ startDir: outside, rootDir: join(testRoot, 'inner') }, realFs()))
      .resolves.toEqual([join(outside, README_FILENAME)])
  })
})

describe('P3-T15 directory-readme-injector — the injector (upstream injector.ts)', () => {
  it('⑥ injects the file parent directory README into the result (upstream case 1)', async () => {
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Source README\nlocal context')
    const session = sessionFixture('session-parent')
    const { injector } = makeInjector()

    const decision = await injector.decide(
      readExecutionFixture(session, join(src, 'file.ts')),
      textResult('base'),
    )

    expect(decision?.kind).toBe('accept')
    const text = readRenderedText(decision)
    expect(text).toContain(README_INJECTION_MARKER)
    expect(text).toContain('# Source README')
    expect(text).toContain('local context')
    // APPEND, not replace: the original result bytes survive at the head.
    expect(text.startsWith('base')).toBe(true)
    expect(text).toBe(`base${expectedBlock(join(src, README_FILENAME), '# Source README\nlocal context')}`)
  })

  it('⑦ injects the ROOT README too (upstream) and walks the chain root-first', async () => {
    const src = join(testRoot, 'src')
    const components = join(src, 'components')
    mkdirSync(components, { recursive: true })
    writeFileSync(join(testRoot, README_FILENAME), '# Root README')
    writeFileSync(join(src, README_FILENAME), '# Src README')
    writeFileSync(join(components, README_FILENAME), '# Components README')
    const session = sessionFixture('session-multi')
    const { injector } = makeInjector()

    const decision = await injector.decide(
      readExecutionFixture(session, join(components, 'button.ts')),
      textResult(''),
    )
    const text = readRenderedText(decision)

    expect(countReadmeMarkers(text)).toBe(3)
    // Order is the upstream `reverse()` order: root, then src, then components.
    expect(text.indexOf('# Root README')).toBeLessThan(text.indexOf('# Src README'))
    expect(text.indexOf('# Src README')).toBeLessThan(text.indexOf('# Components README'))
  })

  it('⑧ de-duplicates by README DIRECTORY: a second read in the same dir is untouched (upstream case 5)', async () => {
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Source README')
    const session = sessionFixture('session-cache')
    const { injector } = makeInjector()

    const first = await injector.decide(
      readExecutionFixture(session, join(src, 'a.ts')),
      textResult(''),
    )
    const second = await injector.decide(
      readExecutionFixture(session, join(src, 'b.ts')),
      textResult(''),
    )

    expect(countReadmeMarkers(readRenderedText(first))).toBe(1)
    // Upstream: the second call returns `undefined` (nothing to append), so the
    // D-mode listener delegates and the result stays byte-identical.
    expect(second).toBeUndefined()
    expect(injector.cachedDirectoryCount(session)).toBe(1)
  })

  it('⑨ de-duplicates a SIBLING read through the SHARED ancestor directory as well', async () => {
    const src = join(testRoot, 'src')
    const left = join(src, 'left')
    const right = join(src, 'right')
    mkdirSync(left, { recursive: true })
    mkdirSync(right, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Src README')
    const session = sessionFixture('session-sibling')
    const { injector } = makeInjector()

    await injector.decide(readExecutionFixture(session, join(left, 'a.ts')), textResult(''))
    const second = await injector.decide(readExecutionFixture(session, join(right, 'b.ts')), textResult(''))

    // `src` is already injected, and `right` has no README of its own.
    expect(second).toBeUndefined()
  })

  it('⑩ emits the truncation notice verbatim when the content is truncated (upstream case 6)', async () => {
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Truncated README')
    const session = sessionFixture('session-truncated')
    // Upstream injected a fake truncator returning `{result:'trimmed content',
    // truncated:true}`; the D-mode seam is the remaining-token reader, and a
    // non-positive budget reaches the SAME `truncated: true` branch.
    const { injector } = makeInjector({ readRemainingTokens: () => 0 })

    const decision = await injector.decide(
      readExecutionFixture(session, join(src, 'file.ts')),
      textResult(''),
    )
    const text = readRenderedText(decision)

    expect(text).toContain(CONTEXT_EXHAUSTED_RESULT)
    expect(text).toContain(readmeTruncationNotice(join(src, README_FILENAME)))
    expect(text.endsWith(readmeTruncationNotice(join(src, README_FILENAME)))).toBe(true)
  })

  it('⑪ the truncation notice is ABSENT when the algorithm did not truncate (upstream `truncated ? … : ""`)', async () => {
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Small README')
    const session = sessionFixture('session-untruncated')
    const { injector } = makeInjector({ readRemainingTokens: () => README_TARGET_MAX_TOKENS * 100 })

    const text = readRenderedText(
      await injector.decide(readExecutionFixture(session, join(src, 'file.ts')), textResult('')),
    )

    expect(text).toContain('# Small README')
    expect(text.includes('[Note: Content was truncated')).toBe(false)
  })

  it('⑫ does nothing when the path cannot be resolved (upstream case 7: `filePath: ""`)', async () => {
    const session = sessionFixture('session-empty-path')
    const { injector } = makeInjector()
    expect(await injector.decide(readExecutionFixture(session, ''), textResult('unchanged'))).toBeUndefined()
    expect(await injector.decide(readExecutionFixture(session, undefined), textResult('unchanged'))).toBeUndefined()
  })

  it('⑬ logs and SKIPS a README when the read fails, leaving the directory uncached (upstream case 8)', async () => {
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    const readmePath = join(src, README_FILENAME)
    writeFileSync(readmePath, '# Source README')
    const session = sessionFixture('session-read-failure')
    const failures = createFailureSink()
    const injector = createDirectoryReadmeInjector({
      fs: {
        access: (path) => fsAccess(path),
        readFile: () => Promise.reject(new Error('truncator unavailable')),
      },
      logFailure: failures.logFailure,
    })

    const decision = await injector.decide(
      readExecutionFixture(session, join(src, 'file.ts')),
      textResult('base'),
    )

    expect(decision).toBeUndefined()
    expect(injector.cachedDirectoryCount(session)).toBe(0)
    expect(failures.calls).toEqual([{
      message: UPSTREAM_FAILURE_MESSAGE,
      detail: { error: 'truncator unavailable', readmePath, sessionID: 'session-read-failure' },
    }])
  })

  it('⑭ KEEPS upstream\'s only gate: a read whose result is an ERROR still receives the README, and caches the directory', async () => {
    // Upstream hook.ts gated on the tool NAME alone; no `isError` gate existed.
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Source README')
    const session = sessionFixture('session-error-result')
    const { injector } = makeInjector()

    const decision = await injector.decide(
      readExecutionFixture(session, join(src, 'missing.ts')),
      { isError: true, content: [{ type: 'text', text: 'Error: file not found' }] },
    )

    expect(readRenderedText(decision)).toBe(
      `Error: file not found${expectedBlock(join(src, README_FILENAME), '# Source README')}`,
    )
    expect(injector.cachedDirectoryCount(session)).toBe(1)
  })

  it('⑮ is NOT our call for a non-read tool, for a missing cwd, and for non-text content', async () => {
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Source README')
    const { injector } = makeInjector()

    expect(await injector.decide(
      readExecutionFixture(sessionFixture('s1'), join(src, 'a.ts'), 'edit'),
      textResult('base'),
    )).toBeUndefined()
    expect(await injector.decide(
      readExecutionFixture(sessionFixture('s2', null), join(src, 'a.ts')),
      textResult('base'),
    )).toBeUndefined()
    // An image block in the content makes the rewrite illegal (it could be lost).
    const withImage = {
      isError: false,
      content: [{ type: 'text', text: 'base' }, { type: 'image', data: 'x' }],
    }
    expect(isTextOnlyResultContent(withImage)).toBe(false)
    expect(await injector.decide(
      readExecutionFixture(sessionFixture('s3'), join(src, 'a.ts')),
      withImage,
    )).toBeUndefined()
  })

  it('⑯ keeps the cache PER SESSION OBJECT (discipline ⑤: a WeakMap keyed by the session)', async () => {
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Source README')
    const first = sessionFixture('session-a')
    const second = sessionFixture('session-b')
    const { injector } = makeInjector()

    await injector.decide(readExecutionFixture(first, join(src, 'a.ts')), textResult(''))
    const other = await injector.decide(readExecutionFixture(second, join(src, 'b.ts')), textResult(''))

    expect(countReadmeMarkers(readRenderedText(other))).toBe(1)
    expect(injector.cachedDirectoryCount(first)).toBe(1)
    expect(injector.cachedDirectoryCount(second)).toBe(1)
  })

  it('⑰ re-homes upstream\'s `session.deleted` onto `session/disposed`', async () => {
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Source README')
    const session = sessionFixture('session-disposed')
    const { injector } = makeInjector()

    await injector.decide(readExecutionFixture(session, join(src, 'a.ts')), textResult(''))
    expect(injector.cachedDirectoryCount(session)).toBe(1)

    injector.onSessionDisposed(session)
    expect(injector.cachedDirectoryCount(session)).toBe(0)
    // Upstream cleared the set so a later read re-injects.
    const again = await injector.decide(readExecutionFixture(session, join(src, 'b.ts')), textResult(''))
    expect(countReadmeMarkers(readRenderedText(again))).toBe(1)
  })

  it('⑱ re-arms exactly on a SUCCESSFUL `compaction/end` (upstream `session.compacted`)', async () => {
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Source README')
    const session = sessionFixture('session-compacted')
    const { injector } = makeInjector()

    await injector.decide(readExecutionFixture(session, join(src, 'a.ts')), textResult(''))

    // Unrelated events, malformed payloads and a FAILED compaction change nothing.
    injector.onSessionEvent(session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    injector.onSessionEvent(session, { type: COMPACTION_END_EVENT_TYPE, data: { error: 'summarizer died' } })
    injector.onSessionEvent(session, undefined)
    injector.onSessionEvent(undefined, { type: COMPACTION_END_EVENT_TYPE })
    expect(injector.cachedDirectoryCount(session)).toBe(1)

    injector.onSessionEvent(session, { type: COMPACTION_END_EVENT_TYPE, data: { compactionId: 'c1', turn: 1 } })
    expect(injector.cachedDirectoryCount(session)).toBe(0)
    const again = await injector.decide(readExecutionFixture(session, join(src, 'b.ts')), textResult(''))
    expect(countReadmeMarkers(readRenderedText(again))).toBe(1)
  })
})

describe('P3-T15 directory-readme-injector — leaf readers + the truncation port', () => {
  it('⑲ the tool gate is case-insensitive and total (upstream `input.tool.toLowerCase()`)', () => {
    expect(isReadExecution({ name: 'read' })).toBe(true)
    expect(isReadExecution({ name: 'READ' })).toBe(true)
    expect(isReadExecution({ name: 'read_image' })).toBe(false)
    expect(isReadExecution({ name: 'grep' })).toBe(false)
    expect(isReadExecution({})).toBe(false)
    expect(isReadExecution(undefined)).toBe(false)
    expect(isReadExecution('read')).toBe(false)
  })

  it('⑳ reads the DSH argument / agent.session / header.cwd, tolerating hostile payloads', () => {
    expect(README_READ_TOOL_NAME).toBe('read')
    expect(readReadPath({ arguments: { file_path: 'a.ts' } })).toBe('a.ts')
    expect(readReadPath({ arguments: { file_path: '' } })).toBeUndefined()
    expect(readReadPath({ arguments: {} })).toBeUndefined()
    expect(readReadPath(undefined)).toBeUndefined()

    const session = { id: 's', header: { cwd: '/w' } }
    expect(readExecutionSession({ agent: { session } })).toBe(session)
    expect(readExecutionSession({ agent: {} })).toBeUndefined()
    expect(readSessionCwd(session)).toBe('/w')
    expect(readSessionCwd({ header: {} })).toBeUndefined()
    expect(readSessionCwd({})).toBeUndefined()
  })

  it('㉑ truncates with upstream dynamic-truncator.ts defaults and honours the adaptive budget', () => {
    const long = `${'x'.repeat(400_000)}`
    // No usage ⇒ upstream's `if (!usage)` fixed threshold.
    expect(truncateReadmeContent(long, undefined).truncated).toBe(true)
    // A tiny remaining budget ⇒ the adaptive min(remaining × 0.5, 50 000).
    expect(truncateReadmeContent(long, 100).truncated).toBe(true)
    // Exhausted context ⇒ upstream's own replacement string.
    expect(truncateReadmeContent(long, 0)).toEqual({ result: CONTEXT_EXHAUSTED_RESULT, truncated: true })
    // A short README under any budget is returned untouched.
    expect(truncateReadmeContent('# small', undefined)).toEqual({ result: '# small', truncated: false })
  })
})

describe('P3-T15 directory-readme-injector — registration + fail-open listener', () => {
  it('㉒ registers the primary event plus the two life-cycle surfaces via ctx.on', () => {
    const { ctx, listeners } = fakeContext()
    expect(registerDirectoryReadmeInjector(ctx, MANIFEST_ROW)).toBeUndefined()
    expect([...listeners.keys()]).toEqual([
      DIRECTORY_README_INJECTOR_EVENT,
      DIRECTORY_README_INJECTOR_SESSION_EVENT,
      DIRECTORY_README_INJECTOR_DISPOSED_EVENT,
    ])
    expect(DIRECTORY_README_INJECTOR_ID).toBe('directory-readme-injector')
  })

  it('㉒b the manifest row pins the real e2eScenario name (T13 MINOR-2 guard)', () => {
    expect(directoryReadmeManifestRow().e2eScenario).toBe('directory-readme-injected')
  })

  it('㉓ the registered listener APPENDS through an accept decision and delegates when not ours', async () => {
    const src = join(testRoot, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, README_FILENAME), '# Source README')
    const { ctx, listeners } = fakeContext()
    registerDirectoryReadmeInjector(ctx, MANIFEST_ROW)
    const listener = listeners.get(DIRECTORY_README_INJECTOR_EVENT) as (
      exec: unknown, result: unknown, next: () => Promise<unknown>,
    ) => Promise<unknown>

    const next = vi.fn(async () => 'delegated')
    const decision = await listener(
      readExecutionFixture(sessionFixture('session-registered'), join(src, 'a.ts')),
      textResult('base'),
      next,
    )
    expect(next).not.toHaveBeenCalled()
    expect(decision).toMatchObject({ kind: 'accept' })

    // A non-read call delegates WITHOUT invoking our logic.
    expect(await listener(readExecutionFixture(sessionFixture('s'), join(src, 'a.ts'), 'grep'), textResult('x'), next))
      .toBe('delegated')
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('㉔ fails OPEN: a listener throw from OUR logic delegates instead of erroring the tool result', async () => {
    const { ctx, listeners } = fakeContext()
    registerDirectoryReadmeInjector(ctx, MANIFEST_ROW)
    const listener = listeners.get(DIRECTORY_README_INJECTOR_EVENT) as (
      exec: unknown, result: unknown, next: () => Promise<unknown>,
    ) => Promise<unknown>

    // A hostile execution whose every property read throws: our own gate throws,
    // and the listener must still delegate rather than reject.
    const poisoned = new Proxy({}, {
      get() {
        throw new Error('poisoned execution')
      },
    })
    const next = vi.fn(async () => 'delegated')
    await expect(listener(poisoned, textResult('base'), next)).resolves.toBe('delegated')
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('㉕ the life-cycle listeners are inert on hostile payloads (fail-open, no throw)', () => {
    const { ctx, listeners } = fakeContext()
    registerDirectoryReadmeInjector(ctx, MANIFEST_ROW)
    const onEvent = listeners.get(DIRECTORY_README_INJECTOR_SESSION_EVENT) as (
      ...args: readonly unknown[]
    ) => unknown
    const onDisposed = listeners.get(DIRECTORY_README_INJECTOR_DISPOSED_EVENT) as (
      ...args: readonly unknown[]
    ) => unknown

    expect(() => onEvent(undefined, undefined)).not.toThrow()
    expect(() => onEvent({}, { type: COMPACTION_END_EVENT_TYPE })).not.toThrow()
    expect(() => onDisposed(undefined)).not.toThrow()
  })
})
