// P4-T6 — the shared error describer for the command handlers.
//
// WHY A LEAF MODULE (NIT-7): `/handoff`, `/remove-ai-slops` and the skill sweep
// each need the same one-liner — "what a human should read about a thrown value".
// Three verbatim copies would let the wording drift per command (the exact
// failure a reviewer flags), so the fact lives here once and the three call sites
// import it.
//
// NOT a catch-all error utility: this module intentionally exposes exactly one
// function. Anything broader (rethrow-wrapping, cause chains, logging policy) is a
// decision that belongs to the loop in index.ts, not to a helper that silently
// decides it for three callers.
//
// The same shape exists as a private helper in skills.ts (T5, before this file
// existed). It is deliberately NOT de-duplicated across that module: skills.ts is a
// self-contained delivery mechanism that must keep working if a command module
// fails to load, so the two never import each other. Two copies, two module
// lifetimes, one documented reason.

// P4-T16 — 本仓命令面自有的错误类型。
// 署名声明（c16 原生总体）：本文件**无上游对应物**——v4.19.4 没有任何同职责的模块。
// 它是 DSH 侧的原生代码，不是语义移植；宣称上游来源就是假署名。语义移植文件请带
// 「UPSTREAM SOURCE + @ v4.19.4 + 移植声明」三件套。

/**
 * 取人读的那一句错误描述：`Error` 用 `message`，其余用 `String(value)`。
 *
 * 刻意**不**返回 `String(error)` 给 Error —— 那会拼出 `"Error: xxx"` 前缀，让三条
 * 不同的消息前缀各自再带一次类名。也刻意不序列化整个 error：堆栈与自定义字段属于
 * 诊断日志，不属于给用户看的一行结果。
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}