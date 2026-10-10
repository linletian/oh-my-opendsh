import type { TeamModeConfig } from "../config"
import type { TeamSessionContext } from "../session-client"
import type { RuntimeState } from "../types"
import { inspectWorkerMembers, sessionExists } from "./session-liveness"
import { markDeadWorkersErrored, summarizeWorkerLiveness } from "./worker-resume-status"
import { transitionRuntimeState } from "./store"

export type ActiveResumeOutcome = "resumed" | "marked_orphaned"

async function markActiveTeamOrphaned(runtimeState: RuntimeState, config: TeamModeConfig): Promise<void> {
  await transitionRuntimeState(runtimeState.teamRunId, (currentRuntimeState) => ({
    ...currentRuntimeState,
    status: "orphaned",
  }), config)
}

export async function resumeActiveTeam(
  ctx: TeamSessionContext,
  runtimeState: RuntimeState,
  config: TeamModeConfig,
  staleReservationTtlMs: number,
): Promise<ActiveResumeOutcome> {
  if (!runtimeState.leadSessionId || !(await sessionExists(ctx, runtimeState.leadSessionId))) {
    await markActiveTeamOrphaned(runtimeState, config)
    return "marked_orphaned"
  }

  const workerCheckResults = await inspectWorkerMembers(ctx, runtimeState)
  const workerResumeStatus = summarizeWorkerLiveness(workerCheckResults)

  if (workerResumeStatus.hasAnyWorker && !workerResumeStatus.hasAliveWorker) {
    await transitionRuntimeState(runtimeState.teamRunId, (currentRuntimeState) => ({
      ...markDeadWorkersErrored(currentRuntimeState, workerResumeStatus.deadWorkerNames),
      status: "orphaned",
    }), config)
    return "marked_orphaned"
  }

  if (workerResumeStatus.deadWorkerNames.length > 0) {
    await transitionRuntimeState(
      runtimeState.teamRunId,
      (currentRuntimeState) => markDeadWorkersErrored(currentRuntimeState, workerResumeStatus.deadWorkerNames),
      config,
    )
  }

  return "resumed"
}
