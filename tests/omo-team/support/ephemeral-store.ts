// support/ephemeral-store.ts — P5-T8b · 单测临时基座（每测一箱的 base_dir）。
//
// WHY THIS EXISTS. team-state.ts 换装持久化后，`new TeamStateStore()` 没有
// 默认值——base_dir 是 vendored config 的必填寻址（team-config.ts 唯一构造
// 点）。单测要的是「同一指针、临时箱底」：buildTeamModeConfig 的
// OMO_TEAM_BASE_DIR 覆盖臂（生产不设 = HOME 派生，行为不变）正是为此留的
// 门。cleanup 由调用方在 afterEach 里跑（本模块只记账，不劫持生命周期）。

import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildTeamModeConfig } from '../../../patches/omo-dsh/omo-team/src/team/team-config.ts'
import { TeamStateStore } from '../../../patches/omo-dsh/omo-team/src/team/team-state.ts'

const tempDirs: string[] = []

/** 一枚新的临时 base_dir（记账，随 cleanupEphemeralStores 清）。 */
export function ephemeralConfig() {
  const dir = mkdtempSync(join(tmpdir(), 'omo-team-test-'))
  tempDirs.push(dir)
  return buildTeamModeConfig({ OMO_TEAM_BASE_DIR: dir })
}

/** 临时基座上的新 store。 */
export function makeStore(): TeamStateStore {
  return new TeamStateStore(ephemeralConfig())
}

/** 清光记过账的临时箱（afterEach 调）。 */
export async function cleanupEphemeralStores(): Promise<void> {
  const dirs = tempDirs.splice(0, tempDirs.length)
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
}
