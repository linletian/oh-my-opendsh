import { readFile } from "node:fs/promises"

import type { TeamModeConfig } from "../config.ts"
import { getTaskFilePath, resolveBaseDir } from "../team-registry/index.ts"
import { TaskSchema } from "../types.ts"
import type { Task } from "../types.ts"

export async function getTask(teamRunId: string, taskId: string, config: TeamModeConfig): Promise<Task> {
  const taskContent = await readFile(getTaskFilePath(resolveBaseDir(config), teamRunId, taskId), "utf8")
  return TaskSchema.parse(JSON.parse(taskContent))
}
