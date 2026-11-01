// tests/omo-lsp/mount-row.test.ts — P6-T4 pin for the root cordis.yml
// omo-lsp mount row ITSELF (review MINOR-4: c11 pins the ids/order/name
// coupling, c15 pins that the name RESOLVES, doctor-lite check 4 validates
// the config against the installed mcp-client's Config schema — but nothing
// pinned the row's own load-bearing shape, the seam the whole LSP face
// stands on).
//
// What this pins, and why each is a real failure mode:
//
//   ① the row exists, mounted through the dsh-BUNDLED @deepseek-ai/
//      dsh-mcp-client — the name is the declared exception in
//      doctor-lite-core's DSH_BUNDLED_INSERT_ROW_NAMES (single source; the
//      literal is the second face, and the pair is the sync check).
//   ② `command`/`cwd` are `!!js` EXPRESSION nodes ({ __jsExpr }), not
//      strings — the row depends on the loader evaluating them IN THE DSH
//      PROCESS at interpolation time (cordis-plugin-loader's internal/config
//      hook). A hand-edit to a literal node path or a fixed cwd silently
//      breaks the clone-and-run contract or the era-proven execPath pick.
//   ③ `args[0]` is the RELATIVE vendored cli path AND the file exists from
//      the repo root — the relative-args + `cwd: !!js process.cwd()` pair
//      only resolves at repo-root boots (the four named boot sites; see the
//      cordis.yml ⚠️ note). A moved/renamed cli.ts, or an absolute path
//      pretending to be portable, fails HERE instead of booting with the
//      LSP row silently absent (failOnStartupError:false).
//   ④ the decided transport identity — serverName 'lsp' (the reserved
//      namespace of every mcp__lsp__* tool), transport 'stdio', and
//      failOnStartupError FALSE as a DECIDED value (S4 semantics, measured;
//      a flip to true would reject the whole entry activation, S4b).
//
// The dialect is the same one dsh loads patch files with: doctor-lite's
// `loadYamlDialect` (installed js-yaml, JSON_SCHEMA + `!!js` → { __jsExpr })
// — no second YAML reader is hand-rolled here (roster-composition.test.ts
// precedent).
import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadYamlDialect, REPO_ROOT } from '../../scripts/doctor-lite.mjs'
import { DSH_BUNDLED_INSERT_ROW_NAMES } from '../../scripts/doctor-lite-core.ts'

const CLI_ARG = 'patches/omo-dsh/vendor/lsp-core/src/cli.ts'

type Row = Record<string, unknown>

/** The single omo-lsp insert row of the repo-root cordis.yml, parsed in the
 *  dsh loader dialect. Fails the calling test if the row is absent or
 *  duplicated — every assertion below addresses exactly one row. */
async function omoLspRow(): Promise<Row> {
  const parsed = await loadYamlDialect(join(REPO_ROOT, 'cordis.yml'))
  expect(Array.isArray(parsed), 'cordis.yml must be a top-level array of patch entries').toBe(true)
  const inserted = (parsed as Row[]).flatMap((entry) => (Array.isArray(entry.insert) ? entry.insert as Row[] : []))
  const found = inserted.filter((row) => row.id === 'omo-lsp')
  expect(found.length, 'exactly one omo-lsp insert row').toBe(1)
  return found[0] as Row
}

function rowConfig(row: Row): Row {
  expect(typeof row.config, 'the omo-lsp row must carry a config: mapping').toBe('object')
  expect(Array.isArray(row.config), 'config must be a mapping, not a list').toBe(false)
  return row.config as Row
}

describe('P6-T4 root cordis.yml: the omo-lsp mount row is pinned', () => {
  it('① the row exists and mounts the dsh-bundled mcp-client — declared name and row name agree', async () => {
    const row = await omoLspRow()
    expect(row.name).toBe('@deepseek-ai/dsh-mcp-client')
    // Second face of the same fact: the declared-exception constant
    // (doctor-lite / c11 / c15 all read it) must name exactly this row.
    expect(DSH_BUNDLED_INSERT_ROW_NAMES['omo-lsp']).toBe(row.name)
  })

  it('② command and cwd are !!js expression nodes, not baked-in strings', async () => {
    const config = rowConfig(await omoLspRow())
    expect(config.command).toEqual({ __jsExpr: 'process.execPath' })
    expect(config.cwd).toEqual({ __jsExpr: 'process.cwd()' })
  })

  it('③ args[0] is the relative vendored cli and resolves to an existing file from the repo root', async () => {
    const config = rowConfig(await omoLspRow())
    expect(Array.isArray(config.args)).toBe(true)
    expect(config.args).toEqual([CLI_ARG])
    const arg = (config.args as unknown[])[0]
    expect(typeof arg).toBe('string')
    // The contract is RELATIVE + repo-root cwd: an absolute path here would
    // resolve on this clone but break the clone-and-run promise everywhere
    // else — reject it explicitly, then prove the relative path lands.
    expect(isAbsolute(arg as string), 'args[0] must stay relative (cwd: !!js process.cwd())').toBe(false)
    expect(existsSync(resolve(REPO_ROOT, arg as string)), `${CLI_ARG} does not exist from the repo root`).toBe(true)
  })

  it('④ transport identity is the decided mount contract (stdio / lsp / failOnStartupError:false)', async () => {
    const config = rowConfig(await omoLspRow())
    expect(config.serverName).toBe('lsp')
    expect(config.transport).toBe('stdio')
    expect(config.failOnStartupError).toBe(false)
  })
})
