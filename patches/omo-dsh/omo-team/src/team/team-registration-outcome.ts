// team-registration-outcome.ts — P5-T16 · 「本次 boot 实际注册成功」的行 id 集。
// 署名（c25）：**无上游对应物——DSH 原生面**。
//
// ── 为什么需要这一张脸 ───────────────────────────────────────────────────────
// manifest 的 `status: 'ported'` 是**静态声明**（「这一行已实现」），而注册循环
// 是**逐行 try/catch、loud-but-non-fatal** 的：某枚工具行的 registrar 在 boot
// 时抛错 → 该行打 FAILED、**没有注册** → 但声明层仍说「ported」。
// P5-T13 的在场探测面（team-tool-presence.ts）读的就是那份声明，于是
// 「切换开关朝一个方向撒谎」：某枚工具行注册失败时，`/hyperplan` 与
// `/remove-ai-slops` 仍渲染 FULL 环（"the team_* tools are live here"），
// 向模型宣称一批并不存在的工具。
//
// 本模块把**本次 boot 的实际结果**publish 出来：注册循环每成功注册一行就记
// 一次它的行 id；在场面读这个集合，而不是 manifest 的 status。语义变化：
//
//   旧：teamToolsPresent = ①–⑪ 的 status 全为 'ported'（声明层）
//   新：teamToolsPresent = ①–⑪ **本次 boot 实际注册成功**（事实层）
//
// 诚实边界（成文而非沉默）：注册循环在 roster 序里跑，行 ⑭（关键词槽）与
// 行 ⑮/⑯（两张在场脸）都在 ①–⑪ **之后**（manifest.ts 行序），所以这三行
// 读到的是**完整**的尝试结果。若将来 roster 序改动把某枚工具行排到行 ⑮
// 之后，本面会读到「尚未注册」⇒ 判缺席 ⇒ 降级——**保守方向**（少承诺，
// 不多承诺），与「宁可降级不可虚报」同向。
//
// strip-only 纪律（T5 NOTES-6）：本文件不用参数属性；零 @deepseek-ai import。

/** 本次 boot 已成功注册的 manifest 行 id（进程内单例，循环开始时清零）。 */
const registeredRowIds = new Set<string>()

/** 注册循环开始时清零（一次 boot = 一次登记；单测多次 apply 不串味）。 */
export function resetTeamRegistrationOutcome(): void {
  registeredRowIds.clear()
}

/** 记一行注册成功（循环在 registrar 正常返回后调用）。 */
export function recordTeamRowRegistered(rowId: string): void {
  registeredRowIds.add(rowId)
}

/** 读本次 boot 的注册结果（**只读快照**，调用方拿到的集合与本模块解耦）。 */
export function registeredTeamRowIds(): ReadonlySet<string> {
  return new Set(registeredRowIds)
}
