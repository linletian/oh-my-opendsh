import { formatApplyResult, formatPrepareRenameResult } from "../lsp/formatters.ts";
import { withLspClient } from "../lsp/client-wrapper.ts";
import { missingDependencyResult } from "../missing-dependency-result.ts";
import { clientOptions, requireNumber, requireString } from "./parameters.ts";
import { text } from "./result.ts";
import type { LspPrepareRenameDetails, LspRenameDetails, ToolExecutionResult } from "./types.ts";

export async function executeLspPrepareRename(
	params: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<ToolExecutionResult> {
	const filePath = requireString(params, "filePath");
	const line = requireNumber(params, "line");
	const character = requireNumber(params, "character");

	try {
			const result = await withLspClient(
				filePath,
				async (client) => client.prepareRename(filePath, line, character, signal),
				"prepareRename",
				clientOptions(signal),
			);
		const details: LspPrepareRenameDetails = { filePath, line, character, result };
		return text(formatPrepareRenameResult(result), details);
	} catch (error) {
		const missingDependency = missingDependencyResult(error, {
			filePath,
			line,
			character,
			result: null,
		} satisfies Omit<LspPrepareRenameDetails, "error" | "errorKind">);
		if (missingDependency) return missingDependency;
		throw error;
	}
}

export async function executeLspRename(
	params: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<ToolExecutionResult> {
	const filePath = requireString(params, "filePath");
	const line = requireNumber(params, "line");
	const character = requireNumber(params, "character");
	const newName = requireString(params, "newName");

	try {
		const result = await withLspClient(
			filePath,
			async (client) => client.rename(filePath, line, character, newName, signal),
			"rename",
			clientOptions(signal),
		);
		const details: LspRenameDetails = { filePath, line, character, newName, apply: result.apply, edit: result.edit };
		return text(formatApplyResult(result.apply), details, !result.apply.success);
	} catch (error) {
		const missingDependency = missingDependencyResult(error, {
			filePath,
			line,
			character,
			newName,
			apply: null,
			edit: null,
		} satisfies Omit<LspRenameDetails, "error" | "errorKind">);
		if (missingDependency) return missingDependency;
		throw error;
	}
}
