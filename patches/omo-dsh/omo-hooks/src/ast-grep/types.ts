// types.ts — S-16 provisioning-layer shared types, semantic PORT of upstream
// packages/utils/src/ast-grep/types.ts @ v4.19.4 (frozen baseline tag, commit
// b072d279110bdda2c6ac2525d0d24dc54d16148a). 语义移植（semantic port only）: the
// shape, the env key and the option names are upstream's; the platform union is
// DSH's (D9 Windows exclusion — see the drop note below). No upstream code is
// vendored; this is a new module of the omo-hooks plugin's provisioning layer,
// consumed ONLY by src/hooks/ast-grep-sg-provision.ts (the non-hook home is
// deliberate: c13 reconciles src/hooks/, and this layer is not a listener — the
// R2-7②③ static-gate-home decision, FORKS.md §2.7 / phase6-mcp-editing.md G-2b).
//
// D9 DROP (itemised, recorded in the manifest row too):
//   - upstream `SgRuntimePlatform` = "darwin" | "linux" | "win32" — the win32
//     member is DROPPED (decision D9, Windows excluded). The union is therefore
//     "darwin" | "linux" and `SgRuntimeSlug` can only ever spell the four
//     darwin/linux slugs; a win32 slug is a compile error here, not a runtime
//     branch.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.

/**
 * Upstream types.ts:1 — the env override key, verbatim. This is ALSO the key
 * the vendored skill's install.sh honours (`OMO_AST_GREP_BIN_DIR` is the
 * bin-DIR key; this one is the binary-PATH key — two different keys upstream,
 * two different keys here; the dual-source wiring is in install-script.ts).
 */
export const SG_PATH_ENV_KEY = "OMO_AST_GREP_SG_PATH"

/** D9: win32 dropped from the platform union (header). */
export type SgRuntimePlatform = "darwin" | "linux"
export type SgRuntimeArch = "arm64" | "x64"
export type SgRuntimeSlug = `${SgRuntimePlatform}-${SgRuntimeArch}`

export interface SgManifestAsset {
  readonly sha256: string
  readonly url: string
}

/** Upstream SgResolverOptions, verbatim — every resolver input stays injectable. */
export interface SgResolverOptions {
  readonly arch?: string
  readonly env?: Record<string, string | undefined>
  readonly fileExists?: (filePath: string) => boolean
  readonly platform?: NodeJS.Platform
  readonly runtimeDir?: string
  readonly runVersionProbeSync?: (binaryPath: string) => string
  readonly which?: (commandName: string) => string | null
}

export type SgFetch = (url: string, init: { readonly signal: AbortSignal }) => Promise<Response>

/** Upstream SgProvisionOptions, verbatim (the asset map narrows with the slug union). */
export interface SgProvisionOptions {
  readonly arch?: string
  readonly fetchImpl?: SgFetch
  readonly platform?: NodeJS.Platform
  readonly releaseAssets?: Partial<Record<SgRuntimeSlug, SgManifestAsset>>
  readonly signal?: AbortSignal
  readonly targetDir: string
}
