// team-core-vendor.ts — P5-T15 · manifest 行 ⑱–㉓ 六枚 `vendor-team-core-*`
// 行的 omo-team 侧交付面：team-core vendor 包的**启动完整性把门 + 逐行档案面**
// （cordis service，一行一张脸）。
// 署名（c25）：**无上游对应物——DSH 原生面**。六行的上游字节住在
// `patches/omo-dsh/vendor/team-core/`（T8a 落的 v4.19.4 子集，逐枚 sha256 pin 在
// 其 VENDOR-MANIFEST.json）；本模块是 DSH 侧的守门人代码，零上游字节、零语义移植。
//
// ── 这六行交付的是什么（为什么翻 ported 需要 registrar）────────────────────────
// 六行的 `nativeFace` 写的是 vendor 树里的字节（`patches/omo-dsh/vendor/team-core/src/…`），
// 而那批字节早在 T8a 落地、T8b 被消费（`team-task.ts` 薄壳直通 vendored
// team-tasklist；`team-state.ts` 的持久化换装直通 vendored team-state-store）。
// 但 omo-team 的注册循环只挂 `status === 'ported'` **且有 registrar** 的行
// （index.ts 的 `<r>/<N>` 契约），而 scripts/concerto-mode-probe.sh 的派生面对
// 「ported 而无 registrar」响亮判红——所以翻行必须同 commit 给每行一张可注册的
// 脸。这张脸就是**逐行守门人**：
//   * 行的文件集**从行自身派生**（`entry.upstreamSources` 剥掉
//     `packages/team-core/` 前缀 = vendor 树内的相对路径）——不重打文件清单，
//     manifest 少一行/多一行都直接改变这张脸的核验集（漂移无处藏）。
//   * 每枚文件在注册期现算 sha256 对 VENDOR-MANIFEST.json 的 pin——任何一字节
//     漂移都抛具名错，该行打 FAILED、census 诚实停在原地（注册循环的
//     loud-but-non-fatal 契约，`vendor-team-prompts` 的 T12 同族）。
//   * 核验过的事实发布成只读 service（`fileCount` / `verifiedCount` /
//     `files[{path, sha256, origin}]`）：门与单测读这张脸，不重算哈希。
//
// ── 派生集的口径（为什么 upstreamSources 就是正确的核验集）─────────────────────
// manifest 行的 upstreamSources 按 vendor 纪律**只收实现文件**（`*.test.ts` 与
// `test-support.ts` 等夹具显式排除，见 manifest.ts vendor 组头注与
// tests/omo-team/manifest.test.ts 的负向轮检），所以本模块逐行核验的正是「这行
// 声称承载的实现字节」——夹具的在册核验归 c27 的整树反向钉与
// `scripts/vendor-manifest.mjs` 的漂移探测器，两边不重复记账也不漏账。
//
// `vendor-team-core-closure` 行额外核 `src/plain-record.ts`：那枚 `project-new`
// 是行 nativeFace 点名的 `@oh-my-opencode/utils`（`isPlainRecord`）语义移植落点
// （T8b import-wall 裁定的两枚外部依赖之一），它是闭包能在本仓编译/运行的承重件，
// 所以由闭包行把门；上游包内不存在该路径，故它走**具名 EXTRA 清单**而不是
// upstreamSources 派生（派生规则不许为了一枚文件破例）。
//
// ── 不在这里修的东西 ────────────────────────────────────────────────────────────
// vendored 树里的 deviation（strip-only 重写 / ESM 补全 / active-resume 的预约
// 回收删除）全部登记在 vendor `VENDOR-MANIFEST.json` 的 `deviations[]`，正文逐字
// 保真（任务书铁律）。本模块只核字节、不改一个字节、也不重述 deviation。

import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { TeamRegistrationContext } from '../index.ts'
import type { TeamManifestEntry } from '../manifest.ts'

/** 上游路径的前缀：六行的 upstreamSources 全部落在这个命名空间下。 */
export const TEAM_CORE_UPSTREAM_PREFIX = 'packages/team-core/'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** vendor 包根（`patches/omo-dsh/vendor/team-core`）。 */
export const TEAM_CORE_VENDOR_DIR = resolve(MODULE_DIR, '../../../vendor/team-core')
/** vendor 包的机器可读在册面——本模块唯一的 pin 来源。 */
export const TEAM_CORE_VENDOR_MANIFEST_PATH = resolve(TEAM_CORE_VENDOR_DIR, 'VENDOR-MANIFEST.json')

/**
 * 行 id → 服务名（提供侧拼写；消费侧——门/探针/单测——本地声明同字面常量，
 * 交叉等值由 tests/omo-team/team-core-vendor.test.ts 钉死，
 * `omoTeamPromptsFace` / `omoTeamMemberQuery` 的 R-5 双拼写先例同族）。
 * 六张脸六个名字：注册循环是一行一 registrar，服务名撞车 = 后一张脸把前一张
 * 踢下线，那正是「census 齐了但脸塌了一半」的形态，所以名字逐枚具名、不派生。
 */
export const TEAM_CORE_VENDOR_SERVICE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'vendor-team-core-types': 'omoTeamCoreVendorTypesFace',
  'vendor-team-core-member-parser': 'omoTeamCoreVendorMemberParserFace',
  'vendor-team-core-team-registry': 'omoTeamCoreVendorTeamRegistryFace',
  'vendor-team-core-team-tasklist': 'omoTeamCoreVendorTeamTasklistFace',
  'vendor-team-core-team-state-store': 'omoTeamCoreVendorStateStoreFace',
  'vendor-team-core-closure': 'omoTeamCoreVendorClosureFace',
})

/**
 * 额外承重件（具名 EXTRA，不进 upstreamSources）：`project-new` 的语义移植落点
 * 由 nativeFace 点名、由本模块把门。只有闭包行有 EXTRA——其余五行派生集即全集。
 */
export const TEAM_CORE_ROW_EXTRA_LOCALS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'vendor-team-core-closure': Object.freeze(['src/plain-record.ts']),
})

/** 一枚在册文件的核验结果（冻结进 service 载荷）。 */
export interface TeamCoreVendorVerifiedFile {
  /** vendor 树内相对路径（由 upstreamSources 剥前缀派生，或 EXTRA 清单具名）。 */
  readonly path: string
  /** 上游 v4.19.4 tag 相对路径（派生的另一半——两半同进冻结载荷，可逐枚回查）。 */
  readonly upstreamPath: string
  /** VENDOR-MANIFEST.json 的 pin。 */
  readonly sha256: string
  /** VENDOR-MANIFEST.json 的 origin（`verbatim` / `modified` / `project-new`）。 */
  readonly origin: string
}

/** 一行的守门档案面（发布进 cordis 的冻结载荷）。 */
export interface TeamCoreVendorRowFace {
  /** manifest 行 id（脸的名字来源，注册循环逐行传入）。 */
  readonly rowId: string
  /** 发布用的服务名（TEAM_CORE_VENDOR_SERVICE_NAMES 的派生值）。 */
  readonly service: string
  /** 本行声称承载的在册文件数（派生集 + EXTRA）。 */
  readonly fileCount: number
  /** 启动期实际核验过的文件数——与 fileCount 不等即未核验，而未核验不进这张脸。 */
  readonly verifiedCount: number
  readonly files: readonly TeamCoreVendorVerifiedFile[]
}

function sha256Of(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * 上游 tag 相对路径 → vendor 树内相对路径。前缀不匹配 = 行指向 team-core 之外，
 * 那是 manifest 的畸形（六行的 upstreamSources 按 manifest 检查 10 必须在
 * `packages/` 下，而六行的语义源只能是 team-core——抛具名错，不静默跳过）。
 */
export function teamCoreVendorLocalPath(upstreamPath: string): string {
  if (!upstreamPath.startsWith(TEAM_CORE_UPSTREAM_PREFIX)) {
    throw new Error(
      `vendor-team-core: upstream path '${upstreamPath}' is outside '${TEAM_CORE_UPSTREAM_PREFIX}'`
      + ' — the six vendor-team-core rows carry team-core bytes only, so the derivation has no honest target',
    )
  }
  return upstreamPath.slice(TEAM_CORE_UPSTREAM_PREFIX.length)
}

/** VENDOR-MANIFEST.json 的 `files[]` 读入 + 形状校验；一切畸形都抛具名错。 */
function readVendorManifestFiles(
  read: (absolutePath: string) => string,
): { path: string; sha256: string; origin: string }[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(read(TEAM_CORE_VENDOR_MANIFEST_PATH))
  } catch (err) {
    throw new Error(
      `vendor-team-core: manifest unreadable at ${TEAM_CORE_VENDOR_MANIFEST_PATH}: `
      + `${err instanceof Error ? err.message : String(err)}`,
    )
  }
  const files = (parsed as { files?: unknown }).files
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`vendor-team-core: manifest lists no files[] at ${TEAM_CORE_VENDOR_MANIFEST_PATH}`)
  }
  return files.map((raw, index) => {
    const entry = raw as { path?: unknown; sha256?: unknown; origin?: unknown }
    if (typeof entry?.path !== 'string' || entry.path.length === 0) {
      throw new Error(`vendor-team-core: manifest files[${index}] declares no path`)
    }
    // 自指在册行（VENDOR-MANIFEST.json 自身）的 sha256 是 null——它不进本行的
    // 核验集（六行没有一行声称承载 manifest 自己），所以 null 在这里是合法形状。
    if (entry.sha256 !== null && typeof entry.sha256 !== 'string') {
      throw new Error(`vendor-team-core: manifest files[${index}] (${entry.path}) sha256 must be a string or null`)
    }
    if (typeof entry.origin !== 'string' || entry.origin.length === 0) {
      throw new Error(`vendor-team-core: manifest files[${index}] (${entry.path}) declares no origin`)
    }
    return { path: entry.path, sha256: entry.sha256 as string, origin: entry.origin }
  })
}

/**
 * 读 manifest、按行派生核验集、逐枚 sha 对账，回冻结档案面。
 * 一切失败模式都抛具名错（注册循环接住打该行的 FAILED）：manifest 缺席/畸形、
 * 派生集为空（= 这行不承载任何字节 = 翻 ported 是假账）、在册文件缺席、
 * pin 缺席（未登记 = 不在册 = 不合法）、sha 不等（漂移）。
 */
export function loadVerifiedTeamCoreVendorRowFace(
  entry: TeamManifestEntry,
  read: (absolutePath: string) => string = (p) => readFileSync(p, 'utf8'),
  exists: (absolutePath: string) => boolean = existsSync,
): TeamCoreVendorRowFace {
  const service = TEAM_CORE_VENDOR_SERVICE_NAMES[entry.id]
  if (typeof service !== 'string') {
    throw new Error(
      `vendor-team-core: row '${entry.id}' names no published face (TEAM_CORE_VENDOR_SERVICE_NAMES has no entry)`
      + ' — a sixth row would register a surface nobody can find',
    )
  }
  if (!exists(TEAM_CORE_VENDOR_MANIFEST_PATH)) {
    throw new Error(`vendor-team-core: manifest absent at ${TEAM_CORE_VENDOR_MANIFEST_PATH}`)
  }
  const pinned = readVendorManifestFiles(read)
  const byPath = new Map(pinned.map((f) => [f.path, f]))
  const derived = (entry.upstreamSources ?? []).map(teamCoreVendorLocalPath)
  const locals = [...derived, ...(TEAM_CORE_ROW_EXTRA_LOCALS[entry.id] ?? [])]
  if (locals.length === 0) {
    throw new Error(
      `vendor-team-core: row '${entry.id}' derives an empty verification set`
      + ' — a content-vendor row that carries no bytes must not be ported',
    )
  }
  const files: TeamCoreVendorVerifiedFile[] = []
  for (const localPath of locals) {
    const absolute = resolve(TEAM_CORE_VENDOR_DIR, localPath)
    if (!exists(absolute)) {
      throw new Error(`vendor-team-core: row '${entry.id}' targets ${localPath}, which is not on disk`)
    }
    const pin = byPath.get(localPath)
    if (pin === undefined) {
      throw new Error(
        `vendor-team-core: row '${entry.id}' targets ${localPath}, which carries no VENDOR-MANIFEST files[] row`
        + ' — unregistered carriage is drift with a green census',
      )
    }
    if (pin.sha256 === null) {
      throw new Error(`vendor-team-core: ${localPath} is registered with a null sha256 but row '${entry.id}' demands a pinned byte`)
    }
    const actual = sha256Of(read(absolute))
    if (actual !== pin.sha256) {
      throw new Error(
        `vendor-team-core: sha256 drift on ${localPath} (row '${entry.id}') — manifest pins ${pin.sha256}, `
        + `disk holds ${actual}`,
      )
    }
    files.push(Object.freeze({ path: localPath, upstreamPath: `${TEAM_CORE_UPSTREAM_PREFIX}${localPath}`, sha256: pin.sha256, origin: pin.origin }))
  }
  return Object.freeze({
    rowId: entry.id,
    service,
    fileCount: locals.length,
    verifiedCount: files.length,
    files: Object.freeze(files),
  })
}

/**
 * 六行的 registrar（TEAM_REGISTRARS 的落点，一行一次调用）。
 * `ctx.provide` 缺席 = 抛具名错打 FAILED（`vendor-team-prompts` / 
 * `stop-continuation-team` 的同款契约）：门发不出去，这行就不该记账成注册成功。
 * disposer 交回 `ctx.effect` 收编（index.ts 的「register, never invoke」纪律）。
 */
export function registerTeamCoreVendorRowSurface(
  ctx: TeamRegistrationContext,
  entry: TeamManifestEntry,
): (() => void) | void {
  if (typeof ctx.provide !== 'function') {
    throw new Error(
      `${entry.id}: this host exposes no ctx.provide — the vendor integrity gate for this row`
      + ' has no published face, so registering it would claim a gate nobody can read',
    )
  }
  const face = loadVerifiedTeamCoreVendorRowFace(entry)
  return ctx.provide(face.service, face) as (() => void) | void
}
