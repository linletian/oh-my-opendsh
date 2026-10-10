import type { TeamModeConfig } from "../config.ts"
import type { RuntimeState } from "../types.ts"
import { cleanupMemberWorktrees } from "./runtime-cleanup.ts"
import { transitionRuntimeState } from "./store.ts"

export function isCreatingStateStuck(
  runtimeState: RuntimeState,
  now: number,
  creatingTimeoutMs: number,
): boolean {
  return runtimeState.status === "creating" && now - runtimeState.createdAt > creatingTimeoutMs
}

export async function markStuckCreatingTeamFailed(
  runtimeState: RuntimeState,
  config: TeamModeConfig,
): Promise<void> {
  await transitionRuntimeState(runtimeState.teamRunId, (currentRuntimeState) => ({
    ...currentRuntimeState,
    status: "failed",
  }), config)
  await cleanupMemberWorktrees(runtimeState)
}
