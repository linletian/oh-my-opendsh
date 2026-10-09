// team-spec.ts — P5-T4 · inline team spec 解析（纯函数，零 ctx / 零副作用 /
// 零 io）。
//
// ── 语义移植声明（SEMANTIC PORT, NOT A COPY）────────────────────────────────
// 上游源路径（署名，OMO tag v4.19.4 = commit b072d279…，PRE-3 冻结基线）：
//   - packages/omo-opencode/src/features/team-mode/tools/lifecycle-inline-spec.ts
//     （parseInlineTeamSpec :67-89——string 臂 JSON.parse + 失败文案
//     `inline_spec is a string but not valid JSON: <msg>` :77 的语义随本
//     文件；normalize → schema safeParse → validateSpec 的三段序）
//   - packages/omo-opencode/src/features/team-mode/tools/lifecycle-create-tool.ts
//     （工具 schema：inline spec union :33-44 = object 臂 ∪ JSON string 臂；
//     成员 schema :21-31 = name/kind/category/subagent_type/prompt/
//     systemPrompt/loadSkills/role/description；「Provide 1-8 members」
//     文案 :39）
// 本文件**不抄任何上游代码**（无 zod、无上游类型 import）；对齐的语义逐条
// 在规则注释里点名上游锚点，逐字可对照处 = .omo/evidence/p5t1/
// Q1a-tools-lifecycle.md §2.1 / §3.2。披露：个别**错误文案**与上游逐字
// 复用（如 max-8 句 `Team 'X' exceeds max 8 members.`，validator.ts:28-34），
// 语义移植纪律下有意为之（工具错误文本 = 契约面），代码零抄。
//
// ── v1 收窄形状（任务书 P5-T4 / 计划书 §4.3 / 覆盖基线 §1 行 1）───────────
// 接受：{ name, members: [{ name, category | seat, prompt? }] }（object 臂）
// 或其 JSON string（string 臂——上游 union :43 的语义，v1 **支持**而非记差
// 异：成本低且对齐，仲裁建议同款）。`seat` 是本仓新增臂（直接点名 roster
// 席），取代上游靠 kind+subagent_type 拼出来的「指名席」。
// 拒绝（具名，不静默）：上游 member schema 的其余六件 kind / subagent_type /
// systemPrompt / loadSkills / role / description 与 spec 级的 description /
// leadAgentId / lead / teamAllowedPaths / sessionPermission（Q1a §2.1:21-44
// 全集，v1 形状之外的每一枚都进 UNSUPPORTED 表）——传入即 V1_UNSUPPORTED_
// FIELD 具名错误（subagent_type 另有专属 SUBAGENT_TYPE_UNSUPPORTED code，因
// 它是「记差异」的旗舰字段，理由文案住 member-validator.ts）；表外字段
// UNKNOWN_*_FIELD 具名拒绝。**schema 形状封闭的理由**：v1 的 spec 形状是
// 任务书钉死的收窄集，任何未列入的字段被静默吞掉都会让「调用方以为生效」
// 的错觉进系统——诚实优于静默（差异清单随交卷回报进覆盖基线回填）。
//
// ── 校验序（成文，测试按此钉）──────────────────────────────────────────────
// 1. string 臂 JSON.parse → INVALID_JSON_STRING；
// 2. 非 plain object → SPEC_NOT_OBJECT；
// 3. spec 级字段扫描（closed shape）→ V1_UNSUPPORTED_FIELD / UNKNOWN_SPEC_
//    FIELD 两码（SUBAGENT_TYPE_UNSUPPORTED **不在**本步——它是 member 级
//    专属码，只在 6b 发射；spec 级携带 subagent_type 命中 UNKNOWN_SPEC_
//    FIELD）；
// 4. team name 非空 → TEAM_NAME_REQUIRED；
// 5. members 存在且为数组 → MEMBERS_REQUIRED；空 → MEMBERS_EMPTY；
//    超上限 → TEAM_MEMBER_LIMIT_EXCEEDED（MAX_TEAM_MEMBERS = 8，上游
//    team-core/team-registry/validator.ts:5 同名同值）；
// 6. 逐成员：对象 → 字段扫描 → name 非空（MEMBER_NAME_REQUIRED）→ 重名
//    （DUPLICATE_MEMBER_NAME，上游 validator.ts:40-47 同码同语义）→
//    category|seat 恰好其一（对齐上游 member-parser 的 both-kinds /
//    missing-kind issues，本仓更名对席面）→ 类型 → 席/类别经
//    member-validator.ts 判定（UNKNOWN_SEAT / SEAT_NOT_ELIGIBLE /
//    UNRESOLVABLE_CATEGORY）→ prompt 类型；
// 7. kebab-case 为**建议性**（宽严自定，成文于此）：上游对 name 写的是
//    "kebab-case or natural text; normalized before team creation"
//    （lifecycle-create-tool.ts:22/:35）——上游不拒而归一；v1 无归一器
//    （归一语义归 vendored member-parser，T8），故**不拒**非 kebab 名，
//    只在解析结果的 `advisories` 里给建议文案，由工具层决定呈现。
// 首个问题即返错（收集式错误留给 T5 工具层聚合；本层的每种失败都是编写
// 错误，点名字段与成员）。
//
// ── 与上游的三条 prompt 政策差异（记差异，随交卷回报进覆盖基线）───────────
// 上游 validator.ts:116-136 有 EMPTY_PROMPT 与 CATEGORY_PROMPT_TOO_SHORT
// （≥8 字符）两条 prompt 内容规则，member-parser.ts:38-44 有第三条
// `category-missing-prompt`（category 成员必带 prompt——硬拒）；v1 **三条
// 均不执行**——prompt 的内容政策属成员引导域（T5 briefing），不属 spec 形状
// 解析域（v1 `prompt?` 可选）；三码不注册、规则不成文在本层，差异在此注释
// 即成文点。

import {
  resolveCategorySeat,
  SUBAGENT_TYPE_UNSUPPORTED_REASON,
  validateMemberSeat,
  type TeamAgentClass,
} from './member-validator.ts'

/**
 * 成员数上限 = 8。上游 team-core/src/team-registry/validator.ts:5
 * `const MAX_TEAM_MEMBERS = 8` 同名同值（语义移植）；「Provide 1-8 members」
 * 文案锚 = lifecycle-create-tool.ts:39。
 */
export const MAX_TEAM_MEMBERS = 8

/** 成员数下限 = 1（「Provide 1-8 members」的下半边）。 */
export const MIN_TEAM_MEMBERS = 1

/**
 * 错误码词表（封闭联合；运行时数组唯一声明，类型由 `(typeof X)[number]`
 * 派生——同 omo-team manifest.ts 的模板字面量纪律）。对齐锚逐码注在数组里：
 * 上游同名码沿用（TEAM_MEMBER_LIMIT_EXCEEDED / DUPLICATE_MEMBER_NAME /
 * UNRESOLVABLE_CATEGORY），本仓新码对席面命名（SEAT_*），差异码自带
 * UNSUPPORTED 词根。
 */
export const TEAM_SPEC_ERROR_CODES = [
  'INVALID_JSON_STRING', // ← lifecycle-inline-spec.ts:77（string 臂 parse 失败）
  'SPEC_NOT_OBJECT', // ← union 两臂之外的输入（lifecycle-inline-spec.ts:71-81 语义）
  'TEAM_NAME_REQUIRED', // ← 上游 zod name 必填（lifecycle-create-tool.ts:35）
  'MEMBERS_REQUIRED', // ← members 缺失或非数组（flat array，:39）
  'MEMBERS_EMPTY', // ← 「Provide 1-8 members」下半边（:39）
  'TEAM_MEMBER_LIMIT_EXCEEDED', // ← 上游同码（team-core validator.ts:28-34）
  'MEMBER_NOT_OBJECT',
  'MEMBER_NAME_REQUIRED', // ← 上游 member.name 必填（types.ts MemberSchema 语义）
  'DUPLICATE_MEMBER_NAME', // ← 上游同码同语义（team-core validator.ts:40-47）
  'CATEGORY_SEAT_BOTH', // ← 对齐 member-parser issue 'both-kinds'（member-parser.ts:22-28）
  'CATEGORY_SEAT_MISSING', // ← 对齐 member-parser issue 'missing-kind'（:30-36）
  'FIELD_NOT_STRING',
  'SUBAGENT_TYPE_UNSUPPORTED', // ← v1 记差异旗舰码（理由文案住 member-validator.ts）
  'V1_UNSUPPORTED_FIELD', // ← 上游在册、v1 不收的字段（Q1a §2.1:21-44 全集）
  'UNKNOWN_SPEC_FIELD', // ← schema 形状封闭（team 级）
  'UNKNOWN_MEMBER_FIELD', // ← schema 形状封闭（member 级）
  'UNKNOWN_SEAT', // ← 对齐上游 UNKNOWN_SUBAGENT_TYPE 文案族（validator.ts:12-13）
  'SEAT_NOT_ELIGIBLE', // ← 对齐上游 INELIGIBLE_AGENT（validator.ts:106-113）
  'UNRESOLVABLE_CATEGORY', // ← 上游同码（senpi member-validator.ts:34）
] as const

/** 错误码（封闭联合）。 */
export type TeamSpecErrorCode = (typeof TEAM_SPEC_ERROR_CODES)[number]

/**
 * 解析后的成员：`seat` + `seatClass` 是**解析产物**（category 臂已解析到
 * 席），T5 的逐成员路由直接消费；`via` 记录调用方用的是哪一臂（诊断与
 * briefing 文案用）；`category` 只在 via='category' 时在场（保留原词，
 * 别名解析是翻译不是销毁）。
 */
export interface ParsedTeamMember {
  readonly name: string
  readonly seat: string
  readonly seatClass: TeamAgentClass
  readonly via: 'category' | 'seat'
  readonly category?: string
  readonly prompt?: string
}

/** 解析后的 team spec。`advisories` = 建议性文案集（kebab-case，见文件头 7）。 */
export interface ParsedTeamSpec {
  readonly name: string
  readonly members: readonly ParsedTeamMember[]
  readonly advisories: readonly string[]
}

/** 解析失败的结构（对齐上游 TeamSpecValidationError 的 code/field/memberName 三件套形状， :15-25）。 */
export interface TeamSpecParseFailure {
  readonly ok: false
  readonly code: TeamSpecErrorCode
  readonly message: string
  readonly field?: string
  readonly memberName?: string
}

/** 解析结果（判别联合；不 throw——见校验序段首注）。 */
export type TeamSpecParseResult =
  | { readonly ok: true; readonly spec: ParsedTeamSpec }
  | TeamSpecParseFailure

/** team 级 v1 收的字段（closed shape 白名单）。 */
export const TEAM_SPEC_ALLOWED_FIELDS_V1: readonly string[] = ['name', 'members']

/** member 级 v1 收的字段（closed shape 白名单）。 */
export const TEAM_MEMBER_ALLOWED_FIELDS_V1: readonly string[] = ['name', 'category', 'seat', 'prompt']

/**
 * team 级上游在册、v1 不收的字段（lifecycle-create-tool.ts:34-41 逐字段
 * 对照：description/leadAgentId/lead/teamAllowedPaths/sessionPermission）。
 */
export const TEAM_SPEC_UNSUPPORTED_UPSTREAM_FIELDS_V1: readonly string[] = [
  'description',
  'leadAgentId',
  'lead',
  'teamAllowedPaths',
  'sessionPermission',
]

/**
 * member 级上游在册、v1 不收的字段（lifecycle-create-tool.ts:21-31 逐字段
 * 对照：kind/subagent_type/systemPrompt/loadSkills/role/description）。
 * subagent_type 在白名单扫描时**先于**本表命中 SUBAGENT_TYPE_UNSUPPORTED
 * （专属具名码），所以本表不再含它——两码不得同指一字段，命中序成文。
 */
export const TEAM_MEMBER_UNSUPPORTED_UPSTREAM_FIELDS_V1: readonly string[] = [
  'kind',
  'systemPrompt',
  'loadSkills',
  'role',
  'description',
]

/**
 * kebab-case 判定（建议性校验的谓词）：小写字母/数字段以单个连字符相连。
 * 'structure-analyst' ✓；'Structure Analyst' / 'my_team' ✗（进 advisories，
 * 不拒——宽严取舍见文件头校验序第 7 条）。
 */
export const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * 名字风格建议文案（team/member 两级共用）。返回 undefined = 已合 kebab。
 * 建议而非拒绝的理由在文件头第 7 条；文案本身钉住「上游归一、v1 保真」
 * 这一事实，让读日志的人知道名字没有被动过。
 */
export function nameStyleAdvisory(level: 'team' | 'member', name: string): string | undefined {
  if (KEBAB_CASE_PATTERN.test(name)) {
    return undefined
  }
  return `advisory: ${level} name '${name}' is not kebab-case — upstream normalizes natural`
    + ' text before team creation (lifecycle-create-tool.ts:22/:35); v1 keeps the name verbatim'
    + ' and only advises.'
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(code: TeamSpecErrorCode, message: string, field?: string, memberName?: string): TeamSpecParseFailure {
  return { ok: false, code, message, field, memberName }
}

/** spec/member 级未知字段的具名文案（closed shape；两码共用生成器）。 */
function unsupportedFieldReason(scope: 'team spec' | 'team member', field: string, upstream: boolean): string {
  return upstream
    ? `field '${field}' on the ${scope} is an upstream team-spec field that v1 does not support — recorded-difference; omit it`
      + ' (v1 closed shape: {name, members:[{name, category|seat, prompt?}]}, plan §4.3)'
    : `unknown field '${field}' on the ${scope} — the v1 inline spec shape is closed`
      + ' ({name, members:[{name, category|seat, prompt?}]}); unknown fields are rejected by name'
      + ' rather than silently ignored'
}

/**
 * inline spec 解析主入口。raw = object 臂或其 JSON string（union 两臂，
 * 上游 lifecycle-inline-spec.ts:33-44 的 v1 收窄镜像）。校验序与全部对齐
 * 锚在文件头；这里只有序和文案，知识在头部——一文件一处成文纪律。
 */
export function parseTeamSpec(raw: unknown): TeamSpecParseResult {
  // 1. string 臂（上游 union 的 JSON string 臂；文案形随 lifecycle-inline-spec.ts:77）。
  let value: unknown = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return fail('INVALID_JSON_STRING', `inline_spec is a string but not valid JSON: ${message}`)
    }
  }

  // 2. 两臂之外的一切输入（number / null / array / undefined…）。
  if (!isPlainRecord(value)) {
    return fail('SPEC_NOT_OBJECT', `inline spec must be an object or a JSON string of one; got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`)
  }

  // 3. spec 级 closed shape 扫描（先命中先报；Object.keys 序 = 插入序，
  //    多畸形字段时报输入里先出现的那枚——与上游 zod 的 issue 序同惯例）。
  for (const key of Object.keys(value)) {
    if (TEAM_SPEC_ALLOWED_FIELDS_V1.includes(key)) {
      continue
    }
    if (TEAM_SPEC_UNSUPPORTED_UPSTREAM_FIELDS_V1.includes(key)) {
      return fail('V1_UNSUPPORTED_FIELD', unsupportedFieldReason('team spec', key, true), key)
    }
    return fail('UNKNOWN_SPEC_FIELD', unsupportedFieldReason('team spec', key, false), key)
  }

  // 4. team name：缺失 / 非串 / 纯空白，同一具名码，message 点名实况。
  const name = value.name
  if (typeof name !== 'string') {
    return fail('TEAM_NAME_REQUIRED', `team spec field 'name' must be a string; got ${name === undefined ? 'missing' : typeof name}`, 'name')
  }
  if (name.trim() === '') {
    return fail('TEAM_NAME_REQUIRED', "team spec field 'name' must not be empty", 'name')
  }

  // 5. members 数组与 1..8 上限（MAX_TEAM_MEMBERS 上游同名同值，见常量注）。
  const members = value.members
  if (!Array.isArray(members)) {
    return fail('MEMBERS_REQUIRED', `team spec field 'members' must be a flat array; got ${members === undefined ? 'missing' : typeof members}`, 'members')
  }
  if (members.length < MIN_TEAM_MEMBERS) {
    return fail('MEMBERS_EMPTY', `team spec 'members' must contain at least ${MIN_TEAM_MEMBERS} member`, 'members')
  }
  if (members.length > MAX_TEAM_MEMBERS) {
    return fail('TEAM_MEMBER_LIMIT_EXCEEDED', `team '${name}' exceeds max ${MAX_TEAM_MEMBERS} members.`, 'members')
  }

  const parsedMembers: ParsedTeamMember[] = []
  const advisories: string[] = []
  const seenNames = new Set<string>()

  const teamAdvisory = nameStyleAdvisory('team', name)
  if (teamAdvisory !== undefined) {
    advisories.push(teamAdvisory)
  }

  for (const [index, rawMember] of members.entries()) {
    // 6a. 成员必须是 plain object。
    if (!isPlainRecord(rawMember)) {
      return fail('MEMBER_NOT_OBJECT', `team member at index ${index} must be an object`, 'members')
    }

    // 6b. member 级 closed shape 扫描；subagent_type 先命专属码。
    for (const key of Object.keys(rawMember)) {
      if (TEAM_MEMBER_ALLOWED_FIELDS_V1.includes(key)) {
        continue
      }
      if (key === 'subagent_type') {
        return fail('SUBAGENT_TYPE_UNSUPPORTED', `member at index ${index}: ${SUBAGENT_TYPE_UNSUPPORTED_REASON}`, key)
      }
      const upstream = TEAM_MEMBER_UNSUPPORTED_UPSTREAM_FIELDS_V1.includes(key)
      return fail(upstream ? 'V1_UNSUPPORTED_FIELD' : 'UNKNOWN_MEMBER_FIELD', unsupportedFieldReason('team member', key, upstream), key)
    }

    // 6c. member name：非串 / 缺失 / 空白。
    const memberName = rawMember.name
    if (memberName !== undefined && typeof memberName !== 'string') {
      return fail('FIELD_NOT_STRING', `member at index ${index} field 'name' must be a string`, 'name')
    }
    if (typeof memberName !== 'string' || memberName.trim() === '') {
      return fail('MEMBER_NAME_REQUIRED', `team member at index ${index} requires a non-empty 'name'`, 'name')
    }

    // 6d. 重名（上游 DUPLICATE_MEMBER_NAME 同码同语义，team-core
    //     validator.ts:40-47：seen-set 扫序，报后出现的那枚）。
    if (seenNames.has(memberName)) {
      return fail('DUPLICATE_MEMBER_NAME', `member name '${memberName}' is duplicated within team '${name}'. Member names must be unique.`, 'members', memberName)
    }

    // 6e. category | seat 恰好其一（对齐 member-parser both-kinds /
    //     missing-kind issues，member-parser.ts:22-36；本仓把 kind 判别
    //     折叠成「给了哪一臂」，无需 kind 字段——kind 本身在 UNSUPPORTED 表）。
    const hasCategory = rawMember.category !== undefined
    const hasSeat = rawMember.seat !== undefined
    if (hasCategory && hasSeat) {
      return fail('CATEGORY_SEAT_BOTH', `member '${memberName}' specifies both 'category' and 'seat'; specify exactly one`, 'category', memberName)
    }
    if (!hasCategory && !hasSeat) {
      return fail('CATEGORY_SEAT_MISSING', `member '${memberName}' specifies neither 'category' nor 'seat'; specify exactly one`, 'seat', memberName)
    }

    // 6f. 解析到席（member-validator 是资格知识唯一住所，本层只搬运）。
    let seat: string
    let seatClass: TeamAgentClass
    let via: 'category' | 'seat'
    let category: string | undefined
    if (hasCategory) {
      const rawCategory = rawMember.category
      if (typeof rawCategory !== 'string') {
        return fail('FIELD_NOT_STRING', `member '${memberName}' field 'category' must be a string`, 'category', memberName)
      }
      const resolution = resolveCategorySeat(rawCategory)
      if (!resolution.ok) {
        return fail(resolution.code, `Team '${name}' member '${memberName}' references ${resolution.reason}`, 'category', memberName)
      }
      seat = resolution.seat
      seatClass = resolution.seatClass
      via = 'category'
      category = rawCategory
    } else {
      const rawSeat = rawMember.seat
      if (typeof rawSeat !== 'string') {
        return fail('FIELD_NOT_STRING', `member '${memberName}' field 'seat' must be a string`, 'seat', memberName)
      }
      const verdict = validateMemberSeat(rawSeat)
      if (!verdict.ok) {
        // 文案拼接分岔：unknown id 走上游 "references unknown X" 语法
        // （member-validator.ts:54 先例）；在册被拒席用破折号引出逐类理由，
        // 避免 "selects … cannot be" 的病句。
        const message = verdict.code === 'UNKNOWN_SEAT'
          ? `Team '${name}' member '${memberName}' references ${verdict.reason}`
          : `Team '${name}' member '${memberName}' selects an ineligible seat — ${verdict.reason}`
        return fail(verdict.code, message, 'seat', memberName)
      }
      seat = verdict.seat
      seatClass = verdict.seatClass
      via = 'seat'
    }

    // 6g. prompt：可选 string；内容政策不在本层（EMPTY_PROMPT/
    //     CATEGORY_PROMPT_TOO_SHORT 记差异，见文件头末段）。
    let prompt: string | undefined
    if (rawMember.prompt !== undefined) {
      if (typeof rawMember.prompt !== 'string') {
        return fail('FIELD_NOT_STRING', `member '${memberName}' field 'prompt' must be a string`, 'prompt', memberName)
      }
      prompt = rawMember.prompt
    }

    seenNames.add(memberName)
    const memberAdvisory = nameStyleAdvisory('member', memberName)
    if (memberAdvisory !== undefined) {
      advisories.push(memberAdvisory)
    }
    parsedMembers.push(
      category === undefined
        ? { name: memberName, seat, seatClass, via, prompt }
        : { name: memberName, seat, seatClass, via, category, prompt },
    )
  }

  return { ok: true, spec: { name, members: parsedMembers, advisories } }
}
