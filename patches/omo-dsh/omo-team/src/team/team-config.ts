// team-config.ts — P5-T8b · vendored TeamModeConfig 的宿主构造面（DSH 原生，无上游对应物）。
//
// ── 为什么存在 ────────────────────────────────────────────────────────────────
// vendored team-core 的每一个落盘操作都以 `TeamModeConfig` 为参（config.ts 逐字
// 形状：snake_case 字段 + zod 默认值），T8b 换装后 omo-team 的状态骨架与任务板
// 全部经它寻址。这个对象必须有一个**单一构造点**——散抄字面量就是散抄默认值，
// 上游默认值搬家时没人跟得上（S-10 收窄边界：range 与默认值住在 vendored 件，
// omo 侧只出指针，不复述数字）。
//
// ── base_dir 的裁定面（T8b 任务书钉死）─────────────────────────────────────
// `base_dir = 项目 .omo/teams/ 面`：本构造点把 base_dir 定为
// `<home>/.omo/teams`——
//   * 生产宿主：home = 用户 HOME，`~/.omo/teams/` 正是上游 team-spec 的 teams 面
//     （skills 手册逐字：`~/.omo/teams/{name}/config.json`），runtime 目录随
//     vendored paths 落在 `<base_dir>/runtime/<teamRunId>/`（paths.ts
//     getRuntimeStateDir 的 resolveContainedPath 语义）；
//   * e2e 宿主：drive.mjs 的 scenarioEnv 把 HOME 重定向进沙箱（drive.mjs:4554
//     `env.HOME = sandbox.home`），teams 面随之整体入箱——重启断言（Q-5b run C
//     型夹具）读回的正是同一沙箱目录，HOME 指针即项目面替身；
//   * `OMO_TEAM_BASE_DIR` 环境变量 = 显式覆盖臂（同一指针，调用方给绝对路径时
//     原样采用；缺省走 HOME 派生）。生产不设此变量 = 行为不变。
// 差异记此（NOTES 同步）：上游 base_dir 缺省 `~/.omo`（paths.ts:69 逐字），本
// 构造点多套一层 `teams/`——T8b 裁定钉的正是这个词汇；runtime/tasks 的相对结构
// 由 vendored paths 承载，不改写。
//
// 其余字段**零复述**：TeamModeConfigSchema.parse 只喂 base_dir 一枚，其余默认值
// 全部由 vendored zod 自己产出（message_payload_max_bytes 等五枚默认值与
// team-state.ts 的 TEAM_RUNTIME_BOUNDS_DEFAULTS 同值同源——上游值，两处指针）。

import { homedir } from 'node:os'
import path from 'node:path'

import { TeamModeConfigSchema, type TeamModeConfig } from '@oh-my-opencode/team-core/config'

/** 覆盖臂的环境变量名（唯一读点在本文件）。 */
export const TEAM_BASE_DIR_ENV_VAR = 'OMO_TEAM_BASE_DIR'

/**
 * 构造 vendored TeamModeConfig：base_dir 按上述裁定解析，其余字段 = vendored
 * zod 默认值（一次 parse，零手抄）。
 */
export function buildTeamModeConfig(env: NodeJS.ProcessEnv = process.env): TeamModeConfig {
  const override = env[TEAM_BASE_DIR_ENV_VAR]
  const baseDir = override !== undefined && override.length > 0
    ? override
    : path.join(homedir(), '.omo', 'teams')
  return TeamModeConfigSchema.parse({ base_dir: baseDir })
}
