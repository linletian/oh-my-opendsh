import type { ToolExecutionResult } from "./types.ts";

export function text(text: string, details?: unknown, isError = false): ToolExecutionResult {
	return { content: [{ type: "text", text }], details, isError };
}
