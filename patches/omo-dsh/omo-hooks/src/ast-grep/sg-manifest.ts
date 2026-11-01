// sg-manifest.ts — S-16 pinned-release manifest, semantic PORT of upstream
// packages/utils/src/ast-grep/sg-manifest.ts @ v4.19.4 (frozen baseline tag,
// commit b072d279110bdda2c6ac2525d0d24dc54d16148a). 语义移植（semantic port only）.
//
// THE PIN IS DATA, AND IT STAYS DATA: SG_PINNED_VERSION and the six→four asset
// table are transcribed from upstream verbatim (sha256 + release URL per slug,
// copied character-for-character from the upstream file at the frozen tag —
// FORKS.md §3.1 "六平台 slug manifest（sha256 + 逐字 GitHub release URL）").
// A pin edited by hand is a different binary, so the values are NEVER retyped
// from memory: they were read with
//   git -C <omo> show v4.19.4:packages/utils/src/ast-grep/sg-manifest.ts
// and the four retained rows copied out of that output.
//
// D9 DROP (itemised; recorded in the manifest row and THIRD_PARTY_NOTICES too):
//   - SG_RELEASE_ASSETS loses "win32-arm64" and "win32-x64" (two upstream rows,
//     sha256 `a519fdd9…` / `a4febbc8…`) — Windows is excluded by decision D9.
//   - normalizeRuntimePlatform loses its `win32` acceptance branch: anything
//     outside darwin/linux still falls back to "linux", exactly like upstream's
//     default arm; on a Windows host the fallback would previously return
//     win32 and select a .exe asset — here it degrades to the linux slug, which
//     the provisioner can fetch but which would not run on Windows. D9 says
//     Windows is not a supported deployment, so the fallback is unreachable in
//     practice and stays honest (never silently "sg.exe", never a crash).
//   - sgBinaryName loses the "sg.exe" branch: the binary name is always "sg".
//     Upstream's `sg` alias note (the skill teaches `sg`, installed also as
//     `ast-grep`) survives untouched.
//
// The `.ts` extension is load-bearing: Node 24 type-stripping (P-8.6) does no
// specifier resolution, and there is no bundler to rewrite it.
import type { SgManifestAsset, SgRuntimeArch, SgRuntimePlatform, SgRuntimeSlug } from './types.ts'

/** Upstream sg-manifest.ts:3 — the pinned ast-grep release, verbatim. */
export const SG_PINNED_VERSION = "0.43.0"

/**
 * Upstream sg-manifest.ts:5-30 with the two win32 rows DROPPED (D9). The four
 * retained rows are byte-identical in sha256 and URL to the upstream table.
 */
export const SG_RELEASE_ASSETS = {
  "darwin-arm64": {
    sha256: "8c847d0a29aa4b3101b3361e0b3ee7fb53c7e497adc9ed1afc9615538cd40782",
    url: "https://github.com/ast-grep/ast-grep/releases/download/0.43.0/app-aarch64-apple-darwin.zip",
  },
  "darwin-x64": {
    sha256: "6d703090b106747b2f56086b6ccc7e798fe78bcae70257aa20519b220153555b",
    url: "https://github.com/ast-grep/ast-grep/releases/download/0.43.0/app-x86_64-apple-darwin.zip",
  },
  "linux-arm64": {
    sha256: "e706846148493967f3ab8011334817edd86ce5acbec10718b2a7b40799c640ff",
    url: "https://github.com/ast-grep/ast-grep/releases/download/0.43.0/app-aarch64-unknown-linux-gnu.zip",
  },
  "linux-x64": {
    sha256: "a26253a9c821d935f7e383e40f0de7c2ca62a4121de1f73a6d81ec32eae631e0",
    url: "https://github.com/ast-grep/ast-grep/releases/download/0.43.0/app-x86_64-unknown-linux-gnu.zip",
  },
} as const satisfies Record<SgRuntimeSlug, SgManifestAsset>

/**
 * Upstream sg-manifest.ts:32-35 minus the win32 acceptance branch (D9).
 * Unknown platforms fall back to "linux" — upstream's own default arm, kept.
 */
export function normalizeRuntimePlatform(platform: NodeJS.Platform = process.platform): SgRuntimePlatform {
  if (platform === "darwin") return platform
  return "linux"
}

/** Upstream sg-manifest.ts:37-40, verbatim (arm64/aarch64 alias kept). */
export function normalizeRuntimeArch(arch: string = process.arch): SgRuntimeArch {
  if (arch === "arm64" || arch === "aarch64") return "arm64"
  return "x64"
}

/** Upstream sg-manifest.ts:42-44, verbatim. */
export function runtimeSlug(platform: NodeJS.Platform = process.platform, arch: string = process.arch): SgRuntimeSlug {
  return `${normalizeRuntimePlatform(platform)}-${normalizeRuntimeArch(arch)}`
}

/**
 * Upstream sg-manifest.ts:46-47 with the win32 "sg.exe" branch DROPPED (D9):
 * the binary this layer ever names is `sg` — the name the vendored ast-grep
 * skill teaches ("`sg` (also installed as `ast-grep`)…", SKILL.md), which the
 * resolver's PATH candidates and the skill's install.sh both honour.
 */
export function sgBinaryName(_platform: NodeJS.Platform = process.platform): "sg" {
  return "sg"
}
