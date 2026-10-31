import { contextCwd } from "../request-context.ts";
import type { WorkspaceEdit } from "./types.ts";
import { commitWorkspaceEditPlan } from "./workspace-edit-commit.ts";
import { fingerprintWorkspaceEdit, planWorkspaceEdit } from "./workspace-edit-plan.ts";
import type {
	ApplyResult,
	ApplyWorkspaceEditOptions,
	WorkspaceEditCommit,
	WorkspaceMutationDelta,
} from "./workspace-edit-types.ts";

export type {
	ApplyResult,
	ApplyWorkspaceEditOptions,
	LspRenameResult,
	PlannedWorkspaceOperation,
	WorkspaceEditCommit,
	WorkspaceEditCommitIo,
	WorkspaceEditPlan,
	WorkspaceEditPlanResult,
	WorkspaceMutation,
	WorkspaceMutationDelta,
} from "./workspace-edit-types.ts";
export { commitWorkspaceEditPlan } from "./workspace-edit-commit.ts";
export { fingerprintWorkspaceEdit, planWorkspaceEdit } from "./workspace-edit-plan.ts";

const EMPTY_DELTA: WorkspaceMutationDelta = { operations: [], changedPaths: [] };

function noEditCommit(): WorkspaceEditCommit {
	return {
		result: { success: false, filesModified: [], totalEdits: 0, errors: ["No edit provided"] },
		delta: EMPTY_DELTA,
		fingerprint: null,
	};
}

export function applyWorkspaceEditDetailed(
	edit: WorkspaceEdit | null,
	options: ApplyWorkspaceEditOptions = {},
): WorkspaceEditCommit {
	if (!edit) return noEditCommit();
	const workspaceRoot = options.workspaceRoot ?? contextCwd();
	const planned = planWorkspaceEdit(edit, workspaceRoot);
	if (!planned.success) return { result: planned.result, delta: EMPTY_DELTA, fingerprint: null };
	return commitWorkspaceEditPlan(planned.plan, options);
}

export function applyWorkspaceEdit(edit: WorkspaceEdit | null, options: ApplyWorkspaceEditOptions = {}): ApplyResult {
	return applyWorkspaceEditDetailed(edit, options).result;
}

export function workspaceEditFingerprint(edit: WorkspaceEdit, workspaceRoot: string): string | null {
	const fingerprint = fingerprintWorkspaceEdit(edit, workspaceRoot);
	return fingerprint.success ? fingerprint.fingerprint : null;
}
