// ast-grep-sg-manifest.test.ts — adapted CARRY of upstream
// packages/utils/src/ast-grep/sg-manifest.test.ts @ v4.19.4 (frozen baseline
// tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a).
//
// RUNNER RULING (P6-T6 first action, measured): upstream line 1 imports
// `describe, expect, it` from "bun:test"; the body is runner-neutral (pure
// data asserts) → CARRIED, adapted: import re-pointed to `vitest` (the repo's
// own suite spelling; the root tsconfig typechecks tests/ and maps no
// "bun:test"), module path re-pointed to the omo-hooks provisioning layer.
//
// D9 ADAPTATION (itemised, mirrors the manifest row note ⑤):
//   - upstream case `{ arch: "x64", platform: "win32", slug: "win32-x64" }`
//     DROPPED — win32 is out of the narrowed union (a win32 slug is now a
//     compile error, so the runtime case cannot even be authored);
//   - upstream `it("pins ast-grep 0.43.0 assets and uses an exe name on
//     Windows")` REWRITTEN to the darwin/linux shape: the pin and the sha
//     lengths survive, `sgBinaryName("win32") === "sg.exe"` becomes
//     `sgBinaryName("linux") === "sg"` — the name the vendored skill teaches
//     (SKILL.md: "`sg` (also installed as `ast-grep`)"), pinned here as the
//     skill-precondition half of the 空头指令纪律 (the loud runtime half lives
//     in ast-grep-sg-provision.ts).
import { describe, expect, it } from 'vitest'

import { runtimeSlug, SG_PINNED_VERSION, SG_RELEASE_ASSETS, sgBinaryName } from '../../patches/omo-dsh/omo-hooks/src/ast-grep/sg-manifest.ts'

describe('sg manifest', () => {
  it('builds the Node-style runtime slug for the supported platforms', () => {
    // given — the four retained darwin/linux slugs (D9: win32 rows dropped,
    // see the provisioning layer's sg-manifest.ts header)
    const cases = [
      { arch: 'arm64', platform: 'darwin', slug: 'darwin-arm64' },
      { arch: 'x64', platform: 'darwin', slug: 'darwin-x64' },
      { arch: 'arm64', platform: 'linux', slug: 'linux-arm64' },
      { arch: 'x64', platform: 'linux', slug: 'linux-x64' },
    ] as const

    // when
    const slugs = cases.map((entry) => runtimeSlug(entry.platform, entry.arch))

    // then
    expect(slugs).toEqual(cases.map((entry) => entry.slug))
  })

  it('maps alternate arch spellings to the same runtime slug', () => {
    // given — upstream aliases, verbatim
    const aliases = ['x86_64', 'amd64'] as const

    // when
    const slugs = aliases.map((arch) => runtimeSlug('linux', arch))

    // then
    expect(slugs).toEqual(['linux-x64', 'linux-x64'])
  })

  it('falls back to the linux slug for an unsupported platform, never a win32 slug', () => {
    // The D9 shape of the normalize fallback: unknown platforms degrade to
    // "linux" (upstream's own default arm), and the win32 acceptance branch is
    // GONE — a win32 host gets the linux slug, never "win32-x64".
    expect(runtimeSlug('freebsd' as NodeJS.Platform, 'x64')).toBe('linux-x64')
    expect(runtimeSlug('win32', 'x64')).toBe('linux-x64')
    expect(sgBinaryName('win32')).toBe('sg')
  })

  it('pins ast-grep 0.43.0 assets with six→four sha256 rows and the skill-taught name', () => {
    // given — the four retained assets, each with a full sha256 and a pinned
    // release URL (the upstream win32 rows `a519fdd9…`/`a4febbc8…` are the
    // DROPPED pair, recorded in the manifest row note ⑤)
    const slugs = Object.keys(SG_RELEASE_ASSETS).sort()

    // then
    expect(SG_PINNED_VERSION).toBe('0.43.0')
    expect(slugs).toEqual(['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'])
    for (const slug of slugs) {
      const asset = SG_RELEASE_ASSETS[slug as keyof typeof SG_RELEASE_ASSETS]
      expect(asset.url).toContain(`/${SG_PINNED_VERSION}/`)
      expect(asset.sha256).toHaveLength(64)
    }
    // The binary name the skill teaches and the provisioner writes — ONE name.
    expect(sgBinaryName('linux')).toBe('sg')
    expect(sgBinaryName('darwin')).toBe('sg')
  })
})
