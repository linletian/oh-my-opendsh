// P4-T6 — the `createUserMessage` equivalent, rebuilt structurally.
//
// WHY NOT IMPORT IT. `createUserMessage` lives in `@deepseek-ai/dsh-llm`
// (lib/index.js:48-53). This workspace has no dsh dependency and must not gain one
// (P4-2: a patch plugin imports nothing from dsh; every dsh surface is declared
// structurally — see ./command-types.ts). So this file reproduces the MEASURED
// shape of what `createUserMessage` returns, and nothing else.
//
// MEASURED (dsh 0.1.5-rc.1, dsh-llm/lib/index.js:24-53 + dsh-util-values/lib/index.js:188-229):
//
//   function freezeMessage(message) { return deepFreeze(structuredClone(message)) }
//   function createMessage(input) { return freezeMessage({ ...input, id: brandString(randomUUID()) }) }
//   function createUserMessage(input) { return createMessage({ ...input, role: "user" }) }
//
// So the real thing is NOT "freeze the object literal" — it is **clone, then
// deep-freeze the clone**, and this file reproduces both halves. (A first version
// froze the literal in place; review MINOR-4 caught the difference.)
//
//   * `structuredClone` — a DETACHING copy: the caller's own graph stays mutable
//     and the result shares no reference with it. We build the literal here, so
//     nothing of the caller's is at stake, but the copy is part of the contract:
//     it is what makes "what you hand the agent is unreachable from anything else"
//     true rather than merely likely.
//   * `deepFreeze` — the measured one is an ITERATIVE walk with a `WeakSet` of
//     visited nodes, skipping non-objects and `AbortSignal` instances (a live
//     signal must stay usable), freezing in place and returning the same value.
//     Reproduced with the same three properties, because a SHALLOW freeze would
//     leave `message.content[0].text` reassignable after the agent queued it —
//     that nested block is the one mutation that would matter here.
//   * `brandString(randomUUID())` — the brand is a TYPE-level cast, so at runtime
//     it is a plain fresh `randomUUID()`. Omitting the id would be the dangerous
//     choice: session messages are addressed by id.
//   * `role: 'user'` and `source: {kind:'user'}` — verbatim. `CommandSource` is
//     `CommandSourceMap[keyof CommandSourceMap]` (dsh-commands
//     lib/types/types.d.ts:69-75), whose ONLY member is
//     `user: {kind:'user'}` — so a human-typed command has exactly one legal
//     source, and dsh-command-goal passes precisely this one (lib/index.js:99-104):
//     a command IS a user message in DSH's model.
//   * content — one text block. dsh-command-goal's attachment path builds
//     `[...attachments, {type:'text', text}]`; ours is text-only because both
//     ported commands declare no `input.attachments` (see the registrars in
//     index.ts), so the registry never admits attachments for them.
//
// The unit test asserts the OBSERVABLE consequences (the returned graph is deeply
// frozen, ids differ per call, the text survives the clone) rather than
// re-implementing deepFreeze's algorithm inside an assertion.

import { randomUUID } from 'node:crypto'

import type { CommandUserMessageLike } from './command-types.ts'

/**
 * 构造一条送进 `agent.followup` 的用户消息（`createUserMessage` 的结构化等价）：
 * 先克隆，再深冻结克隆体。
 */
export function createUserMessage(text: string): CommandUserMessageLike {
  return deepFreeze(structuredClone({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  } as CommandUserMessageLike))
}

/**
 * deepFreeze 的等价实现（dsh-util-values/lib/index.js:194-229 的语义移植）。
 *
 * 三条必须保留的性质，逐条说明为什么：
 *   ① **迭代**而非递归：实测版是显式栈。消息图很浅，递归也能过，但递归版的失败
 *      模式是「深图直接爆栈」，而我们不控制将来被塞进 content 的东西。
 *   ② `WeakSet` 去重：同一节点出现两次（共享引用）时不重复冻结、也不死循环。
 *   ③ 跳过 `AbortSignal`：实测版显式排除，因为 signal 必须保持可用（可被 abort
 *      观察）。我们的消息图里不会有 signal，但保留这条分支，被复用到带 signal 的
 *      输入时就不会把活对象冻死。
 *
 * 返回同一个引用（实测版亦然）：`Object.freeze` 就地冻结，调用方要的正是这个值。
 */
function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>()
  const pending: unknown[] = [value]
  while (pending.length > 0) {
    const node = pending.pop()
    if (node === null || typeof node !== 'object') continue
    if (node instanceof AbortSignal) continue
    if (seen.has(node)) continue
    seen.add(node)
    Object.freeze(node)
    for (const key of Object.keys(node)) {
      pending.push((node as Record<string, unknown>)[key])
    }
  }
  return value
}