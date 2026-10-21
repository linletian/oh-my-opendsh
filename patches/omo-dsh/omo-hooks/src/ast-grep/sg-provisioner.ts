// sg-provisioner.ts — S-16 binary provisioner, semantic PORT of upstream
// packages/utils/src/ast-grep/sg-provisioner.ts @ v4.19.4 (frozen baseline tag,
// commit b072d279110bdda2c6ac2525d0d24dc54d16148a). 语义移植（semantic port only）.
//
// WHAT THIS IS (phase6-mcp-editing.md G-2b, FORKS.md §3.1): the authoritative
// binary source of the dual-source ruling (§3.2) — download the PINNED release
// asset, VERIFY its sha256, extract the standalone binary with a hand-rolled zip
// reader (no zip64), chmod 755, atomic rename. The vendored skill's own
// install.sh stays the documented fallback (it has NO checksum verification —
// that is exactly why the hook layer is authoritative).
//
// EVERY SAFETY PROPERTY IS TRANSCRIBED, NOT RE-INVENTED:
//   · fetch with AbortSignal.timeout(60_000), merged with the caller's signal
//     (upstream :43-46);
//   · sha256 over the WHOLE archive BEFORE extraction (:160-163) — a mismatch
//     names both hashes;
//   · zip reader over the End-Of-Central-Directory scan (:71-124): stored +
//     deflate only, zip64 sentinels REJECTED, inflated length cross-checked
//     against the central directory;
//   · containment: both the temp path and the destination must resolve INSIDE
//     targetDir (:137-142) — a path that escapes is a write_failed, not a
//     write;
//   · write to `.sg-<uuid8>.partial`, chmod 755, rename — a crash never leaves
//     a half-written `sg`; the catch removes the partial (rm force) and wraps
//     foreign errors as write_failed while re-throwing SgProvisionError as-is.
//
// D9 DROP (itemised; recorded in the manifest row):
//   - extractStandaloneSgBinary loses its `.exe` suffix branch and the
//     `ast-grep.exe`/`sg.exe` preferredNames variants — the preferred entry
//     names are exactly ["ast-grep", "sg"] (the archive layout of the retained
//     darwin/linux assets).
//   - provisionSgBinary loses the win32 destination naming (sgBinaryName is
//     always `sg` here, see sg-manifest.ts).
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import { createHash, randomUUID } from "node:crypto"
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { basename, isAbsolute, join, relative, resolve } from "node:path"
import { inflateRawSync } from "node:zlib"

import { runtimeSlug, SG_PINNED_VERSION, SG_RELEASE_ASSETS, sgBinaryName } from './sg-manifest.ts'
import type { SgProvisionOptions } from './types.ts'

/** Upstream :9 — 60s download budget, verbatim. */
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 60_000
// Upstream :10-13 — zip structure constants, verbatim.
const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const ZIP64_SENTINEL = 0xffffffff

/** Upstream :15 — the five error codes, verbatim. */
export type SgProvisionErrorCode = "bad_checksum" | "download_failed" | "extract_failed" | "unsupported_platform" | "write_failed"

/** Upstream :17-25, verbatim (name + stable code; the message carries the detail). */
export class SgProvisionError extends Error {
  readonly code: SgProvisionErrorCode

  constructor(code: SgProvisionErrorCode, message: string, options: { readonly cause?: unknown } = {}) {
    super(message, options)
    this.name = "SgProvisionError"
    this.code = code
  }
}

interface ZipCentralEntry {
  readonly compressedSize: number
  readonly localHeaderOffset: number
  readonly method: number
  readonly name: string
  readonly uncompressedSize: number
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Upstream :39-41, verbatim. */
function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/** Upstream :43-46, verbatim — caller signal AND the 60s ceiling, whichever fires first. */
function timeoutSignal(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(DEFAULT_DOWNLOAD_TIMEOUT_MS)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

/** Upstream :48-64, verbatim — three download_failed faces (throw, non-OK, unreadable body). */
async function downloadAsset(url: string, fetchImpl: SgProvisionOptions["fetchImpl"], signal: AbortSignal): Promise<Buffer> {
  const activeFetch = fetchImpl ?? globalThis.fetch
  let response: Response
  try {
    response = await activeFetch(url, { signal })
  } catch (error) {
    throw new SgProvisionError("download_failed", `failed to download ast-grep ${SG_PINNED_VERSION} from ${url}: ${describeFailure(error)}`, { cause: error })
  }
  if (!response.ok) {
    throw new SgProvisionError("download_failed", `failed to download ast-grep ${SG_PINNED_VERSION} from ${url}: HTTP ${response.status}`)
  }
  try {
    return Buffer.from(await response.arrayBuffer())
  } catch (error) {
    throw new SgProvisionError("download_failed", `failed to read ast-grep ${SG_PINNED_VERSION} download from ${url}: ${describeFailure(error)}`, { cause: error })
  }
}

/** Upstream :66-69, verbatim. */
function zipEntryBaseName(entryName: string): string {
  const segments = entryName.split("/")
  return segments[segments.length - 1] ?? entryName
}

/** Upstream :71-77, verbatim — backward EOCD scan bounded by the 65 535 max comment. */
function findEndOfCentralDirectory(zip: Buffer): number {
  const lowestOffset = Math.max(0, zip.length - 22 - 65_535)
  for (let offset = zip.length - 22; offset >= lowestOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new SgProvisionError("extract_failed", "downloaded ast-grep asset is not a zip archive")
}

/** Upstream :79-101, verbatim — central-directory walk, 46-byte fixed headers. */
function listZipEntries(zip: Buffer): readonly ZipCentralEntry[] {
  const eocdOffset = findEndOfCentralDirectory(zip)
  const entryCount = zip.readUInt16LE(eocdOffset + 10)
  let cursor = zip.readUInt32LE(eocdOffset + 16)
  const entries: ZipCentralEntry[] = []
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new SgProvisionError("extract_failed", "downloaded ast-grep zip central directory is corrupt")
    }
    const nameLength = zip.readUInt16LE(cursor + 28)
    const extraLength = zip.readUInt16LE(cursor + 30)
    const commentLength = zip.readUInt16LE(cursor + 32)
    entries.push({
      compressedSize: zip.readUInt32LE(cursor + 20),
      localHeaderOffset: zip.readUInt32LE(cursor + 42),
      method: zip.readUInt16LE(cursor + 10),
      name: zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"),
      uncompressedSize: zip.readUInt32LE(cursor + 24),
    })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** Upstream :103-107, verbatim — stored (0) and deflate (8) only; anything else is extract_failed. */
function decompressZipEntry(raw: Buffer, entry: ZipCentralEntry): Buffer {
  if (entry.method === 0) return Buffer.from(raw)
  if (entry.method === 8) return inflateRawSync(raw)
  throw new SgProvisionError("extract_failed", `ast-grep zip entry ${entry.name} uses unsupported compression method ${entry.method}`)
}

/** Upstream :109-124, verbatim — zip64 sentinels rejected, local header cross-checked, inflated length must match. */
function readZipEntryBytes(zip: Buffer, entry: ZipCentralEntry): Buffer {
  if (entry.compressedSize === ZIP64_SENTINEL || entry.uncompressedSize === ZIP64_SENTINEL || entry.localHeaderOffset === ZIP64_SENTINEL) {
    throw new SgProvisionError("extract_failed", `ast-grep zip entry ${entry.name} uses unsupported zip64 extensions`)
  }
  if (zip.readUInt32LE(entry.localHeaderOffset) !== LOCAL_SIGNATURE) {
    throw new SgProvisionError("extract_failed", `ast-grep zip entry ${entry.name} has a corrupt local header`)
  }
  const nameLength = zip.readUInt16LE(entry.localHeaderOffset + 26)
  const extraLength = zip.readUInt16LE(entry.localHeaderOffset + 28)
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength
  const bytes = decompressZipEntry(zip.subarray(dataStart, dataStart + entry.compressedSize), entry)
  if (bytes.length !== entry.uncompressedSize) {
    throw new SgProvisionError("extract_failed", `ast-grep zip entry ${entry.name} inflated to ${bytes.length} bytes, expected ${entry.uncompressedSize}`)
  }
  return bytes
}

/**
 * Upstream :126-135 minus the `.exe` suffix branch (D9): preferredNames is
 * exactly ["ast-grep", "sg"] — the standalone entry of the retained darwin
 * and linux release archives.
 */
function extractStandaloneSgBinary(zip: Buffer): Buffer {
  const entries = listZipEntries(zip)
  const preferredNames = ["ast-grep", "sg"]
  for (const preferred of preferredNames) {
    const entry = entries.find((candidate) => zipEntryBaseName(candidate.name) === preferred)
    if (entry !== undefined) return readZipEntryBytes(zip, entry)
  }
  throw new SgProvisionError("extract_failed", `ast-grep release zip has no standalone ${preferredNames.join(" or ")} binary`)
}

/** Upstream :137-142, verbatim — containment is write_failed, never a silent escape. */
function assertInsideTarget(targetDir: string, filePath: string): void {
  const relativePath = relative(targetDir, filePath)
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new SgProvisionError("write_failed", `refusing to write ast-grep binary outside targetDir: ${filePath}`)
  }
}

/**
 * Upstream :144-173, branch for branch (minus the win32 destination naming —
 * D9). `unsupported_platform` stays reachable-by-shape even though the four
 * slug rows cover every SgRuntimeSlug the narrowed union can spell: the
 * releaseAssets override can still hand a caller a partial map, and upstream's
 * guard for that is kept, not deleted.
 */
export async function provisionSgBinary(options: SgProvisionOptions): Promise<string> {
  const platform = options.platform ?? process.platform
  const slug = runtimeSlug(platform, options.arch ?? process.arch)
  const asset = options.releaseAssets?.[slug] ?? SG_RELEASE_ASSETS[slug]
  if (asset === undefined) {
    throw new SgProvisionError("unsupported_platform", `ast-grep ${SG_PINNED_VERSION} has no asset for ${slug}`)
  }
  const targetDir = resolve(options.targetDir)
  const destination = join(targetDir, sgBinaryName(platform))
  const tempPath = join(targetDir, `.sg-${randomUUID().slice(0, 8)}.partial`)
  assertInsideTarget(targetDir, destination)
  assertInsideTarget(targetDir, tempPath)

  try {
    await mkdir(targetDir, { recursive: true })
    const archive = await downloadAsset(asset.url, options.fetchImpl, timeoutSignal(options.signal))
    const actualSha256 = sha256(archive)
    if (actualSha256 !== asset.sha256) {
      throw new SgProvisionError("bad_checksum", `checksum mismatch for ${basename(asset.url)}: expected ${asset.sha256}, got ${actualSha256}`)
    }
    await writeFile(tempPath, extractStandaloneSgBinary(archive))
    await chmod(tempPath, 0o755)
    await rename(tempPath, destination)
    return destination
  } catch (error) {
    await rm(tempPath, { force: true })
    if (error instanceof SgProvisionError) throw error
    throw new SgProvisionError("write_failed", `failed to provision ast-grep ${SG_PINNED_VERSION} into ${targetDir}: ${describeFailure(error)}`, { cause: error })
  }
}
