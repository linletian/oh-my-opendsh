// P4-T6 — the command-template renderer (语义移植 of the upstream executor's
// `substituteCommandTemplate`).
//
// UPSTREAM SOURCE (frozen tag v4.19.4, commit b072d279110bdda2c6ac2525d0d24dc54d16148a):
//   packages/omo-opencode/src/hooks/auto-slash-command/executor.ts:18
//     const COMMAND_TEMPLATE_VARIABLE_PATTERN =
//       /\$\{user_message\}|\$ARGUMENTS|\$SESSION_ID|\$TIMESTAMP/g
//   packages/omo-opencode/src/hooks/auto-slash-command/executor.ts:92-108
//     function substituteCommandTemplate(content, args, sessionID) { … }
//   packages/omo-opencode/src/hooks/auto-slash-command/executor.ts:20-24
//     class MissingCommandSessionIDError extends Error
//
// 语义移植（逐项对照 upstream，不改语义）:
//   ① 四个占位符的替换值与 upstream 完全一致：`$ARGUMENTS` 与 `${user_message}`
//      同为原始参数文本，`$SESSION_ID` 为会话 id，`$TIMESTAMP` 为渲染时刻。
//      upstream 用 `new Date().toISOString()`，本移植**保持 ISO-8601**（见下方
//      TIMESTAMP FORMAT 注记），只把"从哪拿时间"换成注入的时钟函数 —— 因为它必须
//      是纯函数才可被单测钉死。
//   ② upstream 在「模板需要 $SESSION_ID 但没有会话 id」时抛
//      `MissingCommandSessionIDError`；本移植保留同一守卫与同一个类名语义
//      （{@link MissingCommandSessionIDError}），消息文本逐字相同。
//   ③ upstream 的正则以 `/g` 全局替换且**只替换第一个分支命中**（replace 的回调
//      每次只看当前匹配），因此未知 `$FOO` 原样保留 —— 本移植同样只认这四个词。
//
// TIMESTAMP FORMAT — 一处**有意的**字面偏离，逐条说明（任务书写的是
// `Date.now()` 派生；实测 upstream 是 ISO 字符串，executor.ts:95）：
//   * 派生方式照任务书：由当前时钟派生（DSH 的 `CommandInvocation` 只有
//     `commandId / agent / rawInput / attachments / signal` 五个字段，
//     dsh-commands/lib/types/index.d.ts，无任何时间戳），所以必须自己取。
//   * **格式**照 upstream：`new Date().toISOString()`，不是 epoch 毫秒。理由是模板
//     把它当**人读的时间**展示（`Timestamp: $TIMESTAMP` 出现在
//     `<session-context>` 段里给模型看），epoch 数字会改变指令的语义；若照
//     `Date.now()` 会把 "2026-10-01T09:12:33.412Z" 换成 "1790787153412"。
//   * 时钟以 `now` 参数注入，默认实现就是 `() => new Date().toISOString()`；单测
//     传入固定时钟，所以渲染结果是纯函数可断言的（这也是不能直接调
//     `new Date()` 的原因）。
//
// PURE BY CONSTRUCTION: 本模块不读文件、不读 env、不取全局时钟（`now` 由调用方
// 注入）。任何一次渲染都由「模板常量 + 三个值」唯一决定，所以单测可以钉死全集。

/** upstream executor.ts:18 的占位符词表，逐字沿用其正则（顺序有意义）。 */
const COMMAND_TEMPLATE_VARIABLE_PATTERN =
  /\$\{user_message\}|\$ARGUMENTS|\$SESSION_ID|\$TIMESTAMP/g

/**
 * upstream executor.ts:20-24 的错误类。消息文本逐字沿用：它会出现在
 * `/handoff` 的 `kind:'error'` 结果里，是人读的那一行。
 *
 * NOTE: 属性在构造体内赋值，**不是** TypeScript 参数属性 —— P-8.6 strip-only
 * 模式拒绝参数属性，而 vitest(esbuild) 接受，所以那种写法会绿着单元测试、
 * 杀掉真机启动（tests/omo-commands/strip-only.test.ts 是唯一的守卫面）。
 */
export class MissingCommandSessionIDError extends Error {
  constructor() {
    super('Command template requires a session ID')
    this.name = 'MissingCommandSessionIDError'
  }
}

/** 渲染所需的三个值 + 可注入时钟（`now` 缺省即 upstream 的 ISO 时刻）。 */
export interface TemplateRenderValues {
  /** `$ARGUMENTS` / `${user_message}`：命令名之后的原始文本。 */
  readonly arguments: string
  /** `$SESSION_ID`：渲染目标会话的 id。 */
  readonly sessionId: string | undefined
  /** 取时刻；默认 `() => new Date().toISOString()`（upstream executor.ts:95）。 */
  readonly now?: () => string
}

/**
 * 把模板里的四个占位符替换成实值。upstream executor.ts:92-108 的语义移植。
 *
 * 未识别的 `$FOO` 原样保留 —— 与 upstream 一致：模板作者写错的占位符应当在
 * 渲染结果里**看得见**，而不是被悄悄吞掉。
 */
export function renderCommandTemplate(
  template: string,
  values: TemplateRenderValues,
): string {
  // upstream executor.ts:89 是 `if (content.includes('$SESSION_ID') && !sessionID)`
  // —— 真值判断，不是 `undefined` 判断，所以空串 session id 同样抛错。按上游取
  // 真值：一个空串会话 id 渲染进 `<session-context>` 会让模型拿到一个"存在但为空"
  // 的会话标识，比缺标识更坏。
  if (template.includes('$SESSION_ID') && !values.sessionId) {
    throw new MissingCommandSessionIDError()
  }
  const timestamp = (values.now ?? defaultClock)()
  return template.replace(COMMAND_TEMPLATE_VARIABLE_PATTERN, (variable) => {
    switch (variable) {
      case '${user_message}':
      case '$ARGUMENTS':
        return values.arguments
      case '$SESSION_ID':
        // Unreachable with a falsy id — the guard above already threw — so the
        // `?? ''` is a total-function fallback for the type checker, not a live
        // branch. A falsy id reaching here would render an EMPTY session id,
        // which is exactly what the guard exists to prevent.
        return values.sessionId ?? ''
      case '$TIMESTAMP':
        return timestamp
      default:
        return variable
    }
  })
}


// ═══════════════════════════════════════════════════════════════════════════
// ruling-9 — the MESSAGE OUTER FRAME, ported from upstream's
// `formatCommandTemplate` (executor.ts:112-146). This is 保真面, not a
// convenience: upstream's rendered command is what the MODEL actually reads —
// `# /handoff Command` + Description + Scope + `---` + `## Command Instructions`
// + the substituted body (+ a `## User Request` tail). Porting the body without
// this frame would hand the model a differently-shaped message than upstream's,
// so the shape is part of the ported semantics.
//
// PORTED, field for field (executor.ts:113-152):
//   * `sections.push(\`# /${cmd.name} Command\n\`)` → the header names the COMMAND,
//     so our `name` argument is the command id ('handoff' / 'remove-ai-slops').
//   * `**Description**: …` when a description exists (both ported rows have one,
//     taken from the manifest-side constant the registrar also registers).
//   * `**User Arguments**: …` when args are non-empty — upstream:117-119.
//   * `**Model**: …` / `**Agent**: …` — upstream:121-127, both CONDITIONAL, and
//     **deliberately not reproduced as parameters here**: upstream's own two
//     entries declare neither (`commands.ts:85-107`), and this repo's manifest
//     rows both carry `agentBinding: null`, so for every row this port can ever
//     render those sections would be empty. A parameter no row can fill would be
//     speculative surface; the manifest row is the machine-readable proof of the
//     fact (see the handoff/remove-ai-slops rows' `agentBinding` field).
//   * `**Scope**: builtin` → upstream interpolates `cmd.scope`; both rows are
//     builtin commands, so the literal is the same value, and the parameter keeps
//     the interpolation honest instead of hard-coding it in two templates.
//   * `---\n` then `## Command Instructions\n`, then `substitutedContent.trim()`.
//   * the `## User Request` tail — separator `\n\n---\n` byte-for-byte with
//     executor.ts:150 — under upstream's FULL guard (executor.ts:145-152)
//     — args non-empty AND the content mentions neither `\${user_message}` nor
//     `$ARGUMENTS`. Both ported templates DO mention `$ARGUMENTS`, so on today's
//     two commands the tail is never emitted; the guard is ported anyway (and
//     unit-tested with a template that lacks the placeholder) because dropping the
//     condition would make the tail fire and duplicate the request.
//   * `sections.join('\n')` — upstream joins with a newline between sections that
//     each already end in one, which is where the blank lines come from.
//
// NOT PORTED, on purpose (executor.ts:140-142):
//   * `resolveFileReferencesInText(content, commandDir)` — upstream expands
//     `@file` references in a command body against the command's directory.
//     **No equivalent is ported here**: this package does not need one (neither
//     template body contains an `@file` reference), and the expansion needs a
//     command-directory concept this plugin has no field for. Registered as a
//     known difference rather than silently skipped.
//   * `resolveCommandsInText(withFileRefs)` — upstream expands nested `/command`
//     invocations inside a body. **Not ported**: DSH delivers commands through
//     the registry (`ctx.commands.register`) and the model invokes them as its own
//     turn; nested in-body expansion is upstream's own dispatch mechanism, not
//     instruction text. `invocation.attachments` is DSH's own carrier for file
//     context and remains a later-task decision — deliberately unclaimed here,
//     because claiming it without an implementation would be a false promise.
//
// Both omissions live in THIS file because this file is where the port's outer
// shape ends; the caller does not need to know, and a later task that needs either
// expansion has exactly these two lines to start from.

/** upstream 的时刻来源，一次求值（upstream 同样每次调用只取一次）。 */
function defaultClock(): string {
  return new Date().toISOString()
}


/** `formatCommandTemplate` 的输入（executor.ts:113-152 的等价形态）。 */
export interface CommandMessageFrame {
  /** 命令 id —— 进 `# /<name> Command` 头行。 */
  readonly name: string
  /** 进 `**Description**` 行；空串则整行不出现（upstream 的 `if (description)`）。 */
  readonly description: string
  /** 进 `**Scope**` 行（两条移植行都是 `builtin`）。 */
  readonly scope: string
  /** 进 `**User Arguments**` 行与 `## User Request` 尾段；空则两者都不出现。 */
  readonly arguments: string
  /** 已完成占位符替换的正文 —— 调用方先渲染，这里只排外框。 */
  readonly content: string
  /** 替换**前**的模板：尾段的 `includes` 判据读的是它（upstream 判的是 resolved 但未替换的 content）。 */
  readonly template: string
}

/**
 * 把已渲染正文装进 upstream 的消息外框（executor.ts:112-152 的语义移植）。
 *
 * 纯函数：没有 await（upstream 的 await 只服务于下面登记的两个未移植扩展），
 * 所以渲染与外框两层都能被单测逐字节钉死。
 */
export function formatCommandTemplate(frame: CommandMessageFrame): string {
  const sections: string[] = []
  sections.push(`# /${frame.name} Command\n`)
  if (frame.description) sections.push(`**Description**: ${frame.description}\n`)
  if (frame.arguments) sections.push(`**User Arguments**: ${frame.arguments}\n`)
  sections.push(`**Scope**: ${frame.scope}\n`)
  sections.push('---\n')
  sections.push('## Command Instructions\n')
  sections.push(frame.content.trim())
  if (
    frame.arguments
    && !frame.template.includes('${user_message}')
    && !frame.template.includes('$ARGUMENTS')
  ) {
    // upstream executor.ts:150 pushes the two-NEWLINE form verbatim; this section
    // is the only one whose separator differs from the plain '---\n' of line 5,
    // so it is written out rather than shared with that one.
    sections.push('\n\n---\n')
    sections.push('## User Request\n')
    sections.push(frame.arguments)
  }
  return sections.join('\n')
}
