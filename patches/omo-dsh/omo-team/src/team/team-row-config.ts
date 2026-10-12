// team-row-config.ts — P5-T14 · omo-team 插件行的 row Config（门 4 扩展）。
//
// ── 上游对应物 ────────────────────────────────────────────────────────────────
// **无上游对应物**——DSH 原生面。上游 omo 没有 cordis row 概念，其团队规模的
// 唯一事实是 `MAX_TEAM_MEMBERS = 8`（vendored team-core/src/team-registry/
// validator.ts:5，spec 校验硬顶；omo 侧同名同值指针在 team-spec.ts:81）。本
// 文件将这一枚事实升格为**可挂载的 row Config**（dsh Config 契约形态），旋钮
// 只许收紧、不许越过 vendored 硬顶——放宽是 vendored 字节的事（铁律：vendor
// 实现字节不动），收紧才是 row config 的事。
//
// ── dsh Config 契约形态（两枚消费方，逐一对着契约实现）─────────────────────
// 本仓库零 @deepseek-ai 依赖（house 纪律：宿主表面只声明最小结构化类型），
// 所以 Config 不是 schemastery 实例，而是**同时满足两枚消费方所施加契约**的
// 手写类——两枚契约都在门上有活体调用，不是纸面：
//   1. cordis 宿主（@deepseek-ai/cordis lib/index.js:957-961 resolveConfig）：
//      `runtime.Config['~standard'].validate(config)` → Standard Schema 接口，
//      合法返回 {value}（应用默认值后的对象），非法返回 {issues:[{message}]}；
//      宿主在 plugin 启动前调用（`this.config = this._resolveConfig(...)`），
//      并把结果作为第二参数传给 apply（lib/index.js:1071
//      `runtime.callback(this.ctx, this.config)`）——本包 apply 消费该参数。
//   2. scripts/doctor-lite.mjs check 4 的 row 扫描：`typeof Schema ===
//      'function'` + `new Schema(row.config ?? {})`——构造即校验，非法抛
//      TypeError（schemastery 的构造语义，doctor-lite 对全部 26 枚已装行用
//      的正是这一面）；构造成功 = 该行进入已校验面（checked），不再 unchecked。
// 两臂共用同一个 validateTeamRowConfig 判定核——不存在"构造面松、standard 面
// 紧"的两套规则，一文件一处成文纪律。
//
// ── 消费点（诚实性条款：schema 不是装饰）────────────────────────────────────
// `maxMembers` 的活体消费链：apply(ctx, config) → setTeamRowConfig（进程内
// row-config 单例，与 teamStateStore 同型的进程单例纪律，写点唯一 = apply）→
// TEAM_REGISTRARS.team_create → TeamCreateDeps.maxMembers → executeTeamCreate →
// parseTeamSpec(raw, maxMembers)（team-spec.ts 第 5 步成员上限从常量改读该
// 参数，缺省 = MAX_TEAM_MEMBERS，默认路径文案逐字节不变）。缺省 8 = vendored
// 硬顶 = 今日行为；row 写 `config: {maxMembers: 3}` 后 4 成员 spec 具名拒
// `exceeds max 3 members.`。
//
// ── 合法域 ────────────────────────────────────────────────────────────────────
// `maxMembers`：可选；给了就必须是 1..MAX_TEAM_MEMBERS 的整数（收紧臂）。
// 0 / 负数 / 非整数 / >8 / 非 number / config 不是 plain object——全部具名
// issue，不静默回落默认值（回落 = 把坏配置洗成好挂载）。

import { MAX_TEAM_MEMBERS } from './team-spec.ts'

/** row Config 的校验后形状（apply 之后全进程唯一）。 */
export interface TeamRowConfig {
  readonly maxMembers: number
}

/** 缺省值 = vendored 硬顶指针（8），零复述数字。 */
export const TEAM_ROW_CONFIG_DEFAULTS: TeamRowConfig = {
  maxMembers: MAX_TEAM_MEMBERS,
}

type ValidateOutcome = { readonly ok: true; readonly value: TeamRowConfig } | { readonly ok: false; readonly issues: readonly { readonly message: string }[] }

/**
 * 唯一判定核（两臂共用，见头注）。config undefined/null 视作 {}（行不写
 * config = 全默认，与 cordis 对缺省行的喂法一致）；其余非 plain object 拒。
 */
export function validateTeamRowConfig(config: unknown): ValidateOutcome {
  const raw: unknown = config === undefined || config === null ? {} : config
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, issues: [{ message: `team row config must be an object; got ${Array.isArray(raw) ? 'array' : typeof raw}` }] }
  }
  const record = raw as Record<string, unknown>
  const issues: { message: string }[] = []
  for (const key of Object.keys(record)) {
    if (key !== 'maxMembers') {
      issues.push({ message: `unknown team row config field '${key}' (v1 knows only 'maxMembers')` })
    }
  }
  const maxMembers = record.maxMembers
  if (maxMembers !== undefined) {
    if (typeof maxMembers !== 'number' || !Number.isInteger(maxMembers) || maxMembers < 1 || maxMembers > MAX_TEAM_MEMBERS) {
      issues.push({
        message: `team row config field 'maxMembers' must be an integer in 1..${MAX_TEAM_MEMBERS}; got ${JSON.stringify(maxMembers)}`,
      })
    }
  }
  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    value: {
      maxMembers: maxMembers === undefined ? TEAM_ROW_CONFIG_DEFAULTS.maxMembers : (maxMembers as number),
    },
  }
}

/**
 * 插件 row Config（dsh Config 契约形态，头注两臂）。`new Config(config)`
 * 构造即校验（doctor-lite 面）；`Config['~standard'].validate(config)`
 * 返回 Standard Schema 结果（cordis 宿主面）。合法返回的 value 与实例字段
 * 同源同值。
 */
export class Config {
  readonly maxMembers: number

  constructor(config: unknown = {}) {
    const result = validateTeamRowConfig(config)
    if (!result.ok) {
      throw new TypeError(`invalid team row config:\n${result.issues.map((issue) => `  - ${issue.message}`).join('\n')}`)
    }
    this.maxMembers = result.value.maxMembers
  }

  static readonly ['~standard'] = {
    version: 1,
    validate: (config: unknown): { value: TeamRowConfig } | { issues: readonly { message: string }[] } => {
      const result = validateTeamRowConfig(config)
      return result.ok ? { value: result.value } : { issues: result.issues }
    },
  }
}

// ── 进程内 row-config 单例（写点唯一 = apply，读点 = team_create registrar）──
// 与 teamStateStore 同型的进程单例纪律：插件每进程挂载一次，config 随挂载
// 定终身；读面 currentTeamRowConfig() 永不为 undefined（缺省即默认值，消费链
// 无空值分支）。
let teamRowConfig: TeamRowConfig = { ...TEAM_ROW_CONFIG_DEFAULTS }

/** 写点（仅 apply 调用；重复调用 = 重新挂载语义，幂等覆盖为最新校验值）。 */
export function setTeamRowConfig(config: unknown): TeamRowConfig {
  teamRowConfig = new Config(config ?? {})
  return teamRowConfig
}

/** 读点（team_create registrar 用；返回当前挂载行的生效 row config）。 */
export function currentTeamRowConfig(): TeamRowConfig {
  return teamRowConfig
}
