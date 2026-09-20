// ulw-execute/worktree.ts — P3-T17: the worktree / PR-delivery TEXT fragments of
// the ulw-execute port.
//
// 上游：packages/omo-opencode/src/hooks/start-work/worktree-block.ts（32 行）@
// v4.19.4。**语义移植**——`createWorktreeActiveBlock` / `createPrDeliveryBlock`
// 的判定与文案逐字照搬，只有命名锚点改写（无 `/start-work` 引用出现在这两个
// 函数里，故实际零改写）。
//
// ⚠️ 与 worktree-detector.ts（上游 109 行）的关系 —— 见 ../ulw-execute.ts 头部
// 的「跳过段」表：git worktree **探测**（`git rev-parse --show-toplevel` /
// `git worktree list --porcelain` 解析）在 DSH 侧**不移植**，理由成文于该表；
// 本文件只承载**文本片段**语义，与探测无关。
//
// The `.ts` extension is load-bearing (Node 24 type-stripping; see ../index.ts).
import { WORKTREE_ACTIVE_TEMPLATE, WORKTREE_PLACEHOLDER } from './constants.ts'

/** PR 交付模式的输入 flag（上游 worktree-block.ts:16-19 `PrDeliveryFlags`）。 */
export interface PrDeliveryFlags {
  readonly makePr: boolean
  readonly ship: boolean
}

/**
 * 上游 worktree-block.ts:1-13 `createWorktreeActiveBlock(worktreePath)`，逐字
 * （常量模板 + 占位符替换），见 constants.ts 的 `WORKTREE_ACTIVE_TEMPLATE`。
 */
export function createWorktreeActiveBlock(worktreePath: string): string {
  return WORKTREE_ACTIVE_TEMPLATE.split(WORKTREE_PLACEHOLDER).join(worktreePath)
}

/**
 * 上游 worktree-block.ts:18-32 `createPrDeliveryBlock(flags, worktreePath)`，逐字
 * （含 `--ship` 与 `--make-pr` 两分支、标题行的两种形态）。
 */
export function createPrDeliveryBlock(
  flags: PrDeliveryFlags,
  worktreePath: string | undefined,
): string {
  if (!flags.makePr && !flags.ship) return ''

  const worktreeInstruction = worktreePath
    ? '- Work exclusively inside the active worktree above; never touch the main repository directory.'
    : '- Worktree mode is IMPLIED: BEFORE any implementation, create a task-owned worktree '
      + '(`git worktree add <absolute-path> <base-branch>`), record it in boulder.json as '
      + '`"worktree_path"`, and perform ALL work inside it.'

  const completionInstruction = flags.ship
    ? '- Then stay on the job until the PR is MERGED: watch CI and review gates, fix failures '
      + 'and address feedback inside the worktree (capture fresh QA evidence for behavior changes), '
      + 'merge per the repository\'s merge policy once green, then remove the worktree and sync '
      + '`.omo/` state back to the main repo.'
    : '- Hand off with the PR URL after it is created. Do not merge unless the user explicitly asks.'

  const heading = flags.ship
    ? '## PR Delivery Mode (--ship: work until merged)'
    : '## PR Delivery Mode (--make-pr)'

  return `\n${heading}\n\nDeliver this work as a pull request.\n${worktreeInstruction}\n`
    + '- On completion: commit, push the branch, and open a reviewer-readable PR '
    + '(plain-language summary, changes grouped by area, QA evidence with artifact paths, risks).\n'
    + `${completionInstruction}`
}
