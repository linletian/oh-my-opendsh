// P5-T15 — the six `vendor-team-core-*` rows' omo-team-visible half: the
// per-row boot-time vendor integrity gate (src/team/team-core-vendor.ts).
//
// WHY EVERY EXPECTATION BELOW IS HARD-CODED. 同 tests/omo-team/manifest.test.ts
// 的纪律：从被测模块派生期望值的测试会同意它的任何漂移。所以六枚服务名、六行
// 的核验集规模、闭包行的 EXTRA 枚数、每一枚负腿的**完整错误文本**都是手抄的；
// 正向腿读真盘（真 sha 对账），负向腿喂假 reader/existence（不碰 vendor 树——
// 铁律：vendor/** 禁改，负例只能在内存里造）。
//
// WHAT THIS FILE PROVES AND WHAT IT DOES NOT. It proves the gate verifies what
// the manifest row CLAIMS to carry (the derivation from `entry.upstreamSources`),
// that a drifted byte / a missing file / an unregistered path / a foreign-prefix
// path each refuse that row by name, and that the published face is the row's
// own. It does NOT prove the vendored bytes match the upstream tag — that stays
// the tag-side operation (scripts/vendor-manifest.mjs's header says so, and
// c28's residual boundary names it too).
//
// The `.ts` extension in the import paths is load-bearing (Node 24
// type-stripping does no specifier resolution; see the plugin's index.ts).
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  TEAM_CORE_ROW_EXTRA_LOCALS,
  TEAM_CORE_UPSTREAM_PREFIX,
  TEAM_CORE_VENDOR_DIR,
  TEAM_CORE_VENDOR_MANIFEST_PATH,
  TEAM_CORE_VENDOR_SERVICE_NAMES,
  loadVerifiedTeamCoreVendorRowFace,
  registerTeamCoreVendorRowSurface,
  teamCoreVendorLocalPath,
  type TeamCoreVendorRowFace,
} from '../../patches/omo-dsh/omo-team/src/team/team-core-vendor.ts'
import {
  TEAM_MANIFEST,
  type TeamManifestEntry,
} from '../../patches/omo-dsh/omo-team/src/manifest.ts'
import type { TeamRegistrationContext } from '../../patches/omo-dsh/omo-team/src/index.ts'

/** 六行的 id，按名册行序手抄（转抄 #1 of 2；另一处是 manifest.ts 的行表）。 */
const VENDOR_CORE_ROW_IDS: readonly string[] = [
  'vendor-team-core-types',
  'vendor-team-core-member-parser',
  'vendor-team-core-team-registry',
  'vendor-team-core-team-tasklist',
  'vendor-team-core-team-state-store',
  'vendor-team-core-closure',
]

/** 六枚服务名，逐枚手抄（撞名 = 后一张脸把前一张踢下线，所以这里逐枚钉死）。 */
const EXPECTED_SERVICES: Readonly<Record<string, string>> = {
  'vendor-team-core-types': 'omoTeamCoreVendorTypesFace',
  'vendor-team-core-member-parser': 'omoTeamCoreVendorMemberParserFace',
  'vendor-team-core-team-registry': 'omoTeamCoreVendorTeamRegistryFace',
  'vendor-team-core-team-tasklist': 'omoTeamCoreVendorTeamTasklistFace',
  'vendor-team-core-team-state-store': 'omoTeamCoreVendorStateStoreFace',
  'vendor-team-core-closure': 'omoTeamCoreVendorClosureFace',
}

function rowById(id: string): TeamManifestEntry {
  const found = TEAM_MANIFEST.find((entry) => entry.id === id)
  if (found === undefined) throw new Error(`no manifest row named ${id}`)
  return found
}

/** The real filesystem behind the injectable seams, so the positive legs are real. */
const realRead = (absolutePath: string): string => readFileSync(absolutePath, 'utf8')

/** A reader that serves every path from a map and loud-throws on any other. */
function fakeRead(files: Record<string, string>): (absolutePath: string) => string {
  return (absolutePath: string) => {
    if (absolutePath in files) return files[absolutePath]
    throw new Error(`fixture reader: ${absolutePath} is not in the fixture (a path the gate reads that this test did not stage)`)
  }
}

function sha(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** The vendor manifest as a JS object, read off disk (the fixture's base fact). */
function vendorManifestShape(): { files: { path: string; sha256: string | null; origin: string }[] } {
  return JSON.parse(realRead(TEAM_CORE_VENDOR_MANIFEST_PATH)) as {
    files: { path: string; sha256: string | null; origin: string }[]
  }
}

describe('P5-T15 team-core-vendor — the derivation', async () => {
  it('strips exactly the team-core prefix and refuses anything else by name', async () => {
    expect(teamCoreVendorLocalPath('packages/team-core/src/types.ts')).toBe('src/types.ts')
    expect(teamCoreVendorLocalPath(`${TEAM_CORE_UPSTREAM_PREFIX}team-tasklist/claim.ts`)).toBe('team-tasklist/claim.ts')
    // 前缀外的路径：抛具名错，不静默返回一个错目标。
    expect(() => teamCoreVendorLocalPath('packages/utils/src/record-type-guard.ts')).toThrowError(
      /vendor-team-core: upstream path 'packages\/utils\/src\/record-type-guard\.ts' is outside 'packages\/team-core\/'/,
    )
    expect(() => teamCoreVendorLocalPath('src/types.ts')).toThrowError(
      /the six vendor-team-core rows carry team-core bytes only/,
    )
  })

  it('names six rows, six distinct service names, and one EXTRA file on the closure row only', async () => {
    // 六枚 id 与名册逐一对得上（名册少一行/改名，这里即红）。
    expect(TEAM_MANIFEST.filter((row) => row.id.startsWith('vendor-team-core-')).map((row) => row.id))
      .toEqual(VENDOR_CORE_ROW_IDS)
    const services = Object.values(EXPECTED_SERVICES)
    expect(services).toHaveLength(6)
    expect(new Set(services).size).toBe(6)
    // 模块导出的表与手抄表逐键逐值对——表漂了，注册循环发的就是没人能找的脸。
    for (const id of VENDOR_CORE_ROW_IDS) {
      expect(TEAM_CORE_VENDOR_SERVICE_NAMES[id]).toBe(EXPECTED_SERVICES[id])
    }
    // EXTRA 只在闭包行：其余五行的派生集即全集。
    expect(Object.keys(TEAM_CORE_ROW_EXTRA_LOCALS)).toEqual(['vendor-team-core-closure'])
    expect(TEAM_CORE_ROW_EXTRA_LOCALS['vendor-team-core-closure']).toEqual(['src/plain-record.ts'])
  })
})

describe('P5-T15 team-core-vendor — the positive legs (real bytes on real disk)', async () => {
  it('verifies every row of the six and publishes the row face with the derived file set', async () => {
    // 手抄的核验集规模（转抄自 manifest.ts 各行 upstreamSources 的长度）。
    const expectedCounts: Readonly<Record<string, number>> = {
      'vendor-team-core-types': 1,
      'vendor-team-core-member-parser': 1,
      'vendor-team-core-team-registry': 6,
      'vendor-team-core-team-tasklist': 7,
      'vendor-team-core-team-state-store': 12,
      // 4 派生 + 1 EXTRA = 5（plain-record.ts 是闭包能在本仓跑的那枚）。
      'vendor-team-core-closure': 5,
    }
    const pinned = new Map(vendorManifestShape().files.map((f) => [f.path, f]))
    for (const id of VENDOR_CORE_ROW_IDS) {
      const row = rowById(id)
      const face: TeamCoreVendorRowFace = loadVerifiedTeamCoreVendorRowFace(row)
      expect(face.rowId).toBe(id)
      expect(face.service).toBe(EXPECTED_SERVICES[id])
      expect(face.fileCount).toBe(expectedCounts[id])
      // 未核验不进脸：verifiedCount 必须等于 fileCount（这不是冗余——它是
      // 「跑了一圈但什么都没核」与「全核了」之间唯一的区分）。
      expect(face.verifiedCount).toBe(face.fileCount)
      expect(face.files).toHaveLength(face.fileCount)
      // 两半同进冻结载荷：local path 就是 upstream path 剥前缀。
      for (const file of face.files) {
        expect(file.upstreamPath).toBe(`${TEAM_CORE_UPSTREAM_PREFIX}${file.path}`)
        const pin = pinned.get(file.path)
        expect(pin, `${file.path} must be registered`).toBeDefined()
        expect(file.sha256).toBe(pin?.sha256)
        expect(file.origin).toBe(pin?.origin)
        // 真盘重算一遍——门说核验过，这里就自己核一遍。
        expect(sha(realRead(resolve(TEAM_CORE_VENDOR_DIR, file.path)))).toBe(file.sha256)
      }
      expect(Object.isFrozen(face)).toBe(true)
    }
  })

  it('the registrar publishes under the row service and hands the disposer back', async () => {
    const provided = new Map<string, unknown>()
    const ctx = {
      provide: (name: string, service: unknown) => {
        provided.set(name, service)
        return () => {
          provided.delete(name)
        }
      },
    } as unknown as TeamRegistrationContext
    const disposer = registerTeamCoreVendorRowSurface(ctx, rowById('vendor-team-core-team-tasklist'))
    expect(typeof disposer).toBe('function')
    const face = provided.get('omoTeamCoreVendorTeamTasklistFace') as TeamCoreVendorRowFace | undefined
    expect(face).toBeDefined()
    expect(face?.verifiedCount).toBe(7)
    disposer?.()
    expect(provided.has('omoTeamCoreVendorTeamTasklistFace')).toBe(false)
  })
})

describe('P5-T15 team-core-vendor — the negative legs (hermetic, vendor tree untouched)', async () => {
  const typesRow = rowById('vendor-team-core-types')
  const manifestText = realRead(TEAM_CORE_VENDOR_MANIFEST_PATH)
  const typesPath = join(TEAM_CORE_VENDOR_DIR, 'src/types.ts')

  it('refuses a drifted byte with the full named message (pin vs disk)', async () => {
    const drifted = `${realRead(typesPath)}\n// one byte more\n`
    expect(() => loadVerifiedTeamCoreVendorRowFace(
      typesRow,
      fakeRead({ [TEAM_CORE_VENDOR_MANIFEST_PATH]: manifestText, [typesPath]: drifted }),
      () => true,
    )).toThrowError(/vendor-team-core: sha256 drift on src\/types\.ts \(row 'vendor-team-core-types'\) — manifest pins [0-9a-f]{64}, disk holds [0-9a-f]{64}/)
  })

  it('refuses a missing file with the target named', async () => {
    expect(() => loadVerifiedTeamCoreVendorRowFace(
      typesRow,
      fakeRead({ [TEAM_CORE_VENDOR_MANIFEST_PATH]: manifestText }),
      (absolute) => absolute !== typesPath,
    )).toThrowError(/vendor-team-core: row 'vendor-team-core-types' targets src\/types\.ts, which is not on disk/)
  })

  it('refuses a carriage the manifest does not register (unregistered = drift with a green census)', async () => {
    const row = { ...typesRow, upstreamSources: ['packages/team-core/src/not-registered.ts'] }
    expect(() => loadVerifiedTeamCoreVendorRowFace(
      row,
      fakeRead({ [TEAM_CORE_VENDOR_MANIFEST_PATH]: manifestText }),
      () => true,
    )).toThrowError(/vendor-team-core: row 'vendor-team-core-types' targets src\/not-registered\.ts, which carries no VENDOR-MANIFEST files\[\] row/)
  })

  it('refuses a row whose derivation is empty (a content-vendor row carrying no bytes is a fake port)', async () => {
    const row = { ...typesRow, upstreamSources: [] }
    expect(() => loadVerifiedTeamCoreVendorRowFace(
      row,
      fakeRead({ [TEAM_CORE_VENDOR_MANIFEST_PATH]: manifestText }),
      () => true,
    )).toThrowError(/vendor-team-core: row 'vendor-team-core-types' derives an empty verification set/)
  })

  it('refuses a row id that names no face (the sixth-row shape)', async () => {
    const row = { ...typesRow, id: 'vendor-team-core-seventh' }
    expect(() => loadVerifiedTeamCoreVendorRowFace(
      row,
      fakeRead({ [TEAM_CORE_VENDOR_MANIFEST_PATH]: manifestText }),
      () => true,
    )).toThrowError(/vendor-team-core: row 'vendor-team-core-seventh' names no published face/)
  })

  it('refuses an absent vendor manifest and a malformed one, both by name', async () => {
    expect(() => loadVerifiedTeamCoreVendorRowFace(
      typesRow,
      fakeRead({}),
      () => false,
    )).toThrowError(/vendor-team-core: manifest absent at .*VENDOR-MANIFEST\.json/)
    expect(() => loadVerifiedTeamCoreVendorRowFace(
      typesRow,
      fakeRead({ [TEAM_CORE_VENDOR_MANIFEST_PATH]: '{ not json' }),
      () => true,
    )).toThrowError(/vendor-team-core: manifest unreadable at .*VENDOR-MANIFEST\.json/)
    expect(() => loadVerifiedTeamCoreVendorRowFace(
      typesRow,
      fakeRead({ [TEAM_CORE_VENDOR_MANIFEST_PATH]: JSON.stringify({ files: [] }) }),
      () => true,
    )).toThrowError(/vendor-team-core: manifest lists no files\[\]/)
  })

  it('refuses a host with no ctx.provide — a gate nobody can read is not a registration', async () => {
    const ctx = {} as unknown as TeamRegistrationContext
    expect(() => registerTeamCoreVendorRowSurface(ctx, rowById('vendor-team-core-closure'))).toThrowError(
      /vendor-team-core-closure: this host exposes no ctx\.provide/,
    )
  })
})
