// ast-grep-sg-provisioner.test.ts — adapted CARRY of upstream
// packages/utils/src/ast-grep/sg-provisioner.test.ts @ v4.19.4 (frozen
// baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a).
//
// RUNNER RULING (P6-T6 first action, measured): upstream line 1 imports
// `describe, expect, it` from "bun:test"; every body is runner-neutral —
// `new Response(bytes)` (:76) is a WHATWG global under Node 18+, the zip
// fixture builder is pure Buffer arithmetic → CARRIED, import re-pointed to
// `vitest`, module path re-pointed to the omo-hooks provisioning layer.
//
// D9 ADAPTATION (itemised, mirrors the manifest row note ⑤): upstream's
// `keeps all temporary and final writes inside targetDir` was authored on the
// win32 face (`platform: "win32"`, entry `ast-grep.exe`, destination `sg.exe`,
// releaseAssets override `win32-x64`). The CONTAINMENT property it pins is NOT
// win32-specific, so it is RE-AUTHORED on the linux face — same fixture
// builder, same containment assertions (nothing lands outside targetDir), with
// the entry and destination names narrowed to the retained `ast-grep` → `sg`
// pair. The win32 naming itself is dropped, recorded, not silently lost.
//
// All fetches here are MOCKED (fetchImpl + releaseAssets overrides) — the
// pinned GitHub URLs are never touched by this suite (the hermetic rule,
// FORKS.md §5.1; the e2e pre-sees OMO_AST_GREP_SG_PATH instead).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { provisionSgBinary, SgProvisionError } from '../../patches/omo-dsh/omo-hooks/src/ast-grep/sg-provisioner.ts'

function tempDir(name: string): string {
  return join(tmpdir(), `omo-${name}-${crypto.randomUUID()}`)
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value)
  return buffer
}

/** Upstream fixtureZip (:25-73), verbatim — a stored (method 0) single-entry zip. */
function fixtureZip(entryName: string, bytes: Buffer): Buffer {
  const name = Buffer.from(entryName)
  const localHeader = Buffer.concat([
    uint32(0x04034b50),
    uint16(20),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(0),
    uint32(bytes.length),
    uint32(bytes.length),
    uint16(name.length),
    uint16(0),
    name,
  ])
  const centralHeader = Buffer.concat([
    uint32(0x02014b50),
    uint16(20),
    uint16(20),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(0),
    uint32(bytes.length),
    uint32(bytes.length),
    uint16(name.length),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(0),
    uint32(0),
    name,
  ])
  const centralOffset = localHeader.length + bytes.length
  const eocd = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(1),
    uint16(1),
    uint32(centralHeader.length),
    uint32(centralOffset),
    uint16(0),
  ])
  return Buffer.concat([localHeader, bytes, centralHeader, eocd])
}

function responseFor(bytes: Buffer): Response {
  // `new Response(bytes)` is the upstream spelling (:76) and works at runtime
  // under Node's undici; the strict lib types want a BodyInit, and Buffer's
  // ArrayBufferLike is not ArrayBuffer — the Uint8Array copy is the same
  // bytes, seen through the type the Response ctor promises to read.
  return new Response(new Uint8Array(bytes))
}

describe('provisionSgBinary', () => {
  it('downloads a verified archive, extracts standalone ast-grep, and writes sg', async () => {
    // given
    const targetDir = tempDir('sg-provision')
    const binary = Buffer.from("#!/bin/sh\nprintf 'ast-grep 0.43.0\\n'\n")
    const archive = fixtureZip('release/ast-grep', binary)
    const archiveSha = createHash('sha256').update(archive).digest('hex')

    // when
    const result = await provisionSgBinary({
      arch: 'x64',
      fetchImpl: async () => responseFor(archive),
      platform: 'linux',
      releaseAssets: {
        'linux-x64': { sha256: archiveSha, url: 'memory://ast-grep.zip' },
      },
      targetDir,
    })

    // then — the sha256 gate passed, the standalone entry was extracted, the
    // destination is <targetDir>/sg (D9: the ONLY name this ever writes)
    expect(result).toBe(join(targetDir, 'sg'))
    expect(readFileSync(result)).toEqual(binary)

    rmSync(targetDir, { force: true, recursive: true })
  })

  it('throws an actionable error when the network request fails', async () => {
    // given
    const targetDir = tempDir('sg-network-failure')

    // when
    const attempt = provisionSgBinary({
      fetchImpl: async () => {
        throw new Error('offline')
      },
      platform: 'linux',
      targetDir,
    })

    // then — download_failed with the pinned version in the message; NO
    // binary left behind; the hook's loud-failure path receives exactly this
    // error and converts it into the named marker + guidance (never a crash).
    const error = await attempt.catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(SgProvisionError)
    expect(error).toHaveProperty('message', expect.stringContaining('failed to download ast-grep'))
    expect(existsSync(join(targetDir, 'sg'))).toBe(false)

    rmSync(targetDir, { force: true, recursive: true })
  })

  it('rejects a bad sha256 and leaves no binary behind', async () => {
    // given — the archive does NOT match the pinned hash for linux-x64
    const targetDir = tempDir('sg-bad-sha')
    const archive = Buffer.from('not the pinned release archive')
    const archiveSha = createHash('sha256').update(archive).digest('hex')

    // when
    const attempt = provisionSgBinary({
      fetchImpl: async () => responseFor(archive),
      platform: 'linux',
      targetDir,
    })

    // then — the checksum gate is the authoritative-source property (dual
    // source ruling, FORKS.md §3.2: the skill's install.sh has NO checksum
    // verification; this one names both hashes).
    await expect(attempt).rejects.toThrow(`got ${archiveSha}`)
    expect(existsSync(join(targetDir, 'sg'))).toBe(false)

    rmSync(targetDir, { force: true, recursive: true })
  })

  it('keeps all temporary and final writes inside targetDir', async () => {
    // given — upstream authored this containment pin on the win32 face; the
    // property is platform-independent, so it is re-authored on linux with the
    // retained entry/destination names (header, D9 ADAPTATION).
    const root = tempDir('sg-contained')
    const targetDir = join(root, 'target')
    const binary = Buffer.from('standalone ast-grep')
    const archive = fixtureZip('ast-grep', binary)

    // when
    const result = await provisionSgBinary({
      arch: 'x64',
      fetchImpl: async () => responseFor(archive),
      platform: 'linux',
      releaseAssets: {
        'linux-x64': {
          sha256: createHash('sha256').update(archive).digest('hex'),
          url: 'memory://ast-grep-linux.zip',
        },
      },
      targetDir,
    })

    // then — everything lands inside targetDir, nothing escapes to the root
    expect(result).toBe(join(targetDir, 'sg'))
    expect(existsSync(join(root, 'sg'))).toBe(false)
    expect(readFileSync(result)).toEqual(binary)

    rmSync(root, { force: true, recursive: true })
  })
})
