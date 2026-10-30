import type { Task } from "../types.ts"

export function canClaim(task: Task, allTasks: Task[]): boolean {
  return task.blockedBy.every((blockerId) => {
    const blockerTask = allTasks.find((candidateTask) => candidateTask.id === blockerId)
    return blockerTask === undefined || blockerTask.status === "completed"
  })
}
