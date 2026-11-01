import type { JsonSchema } from "./types.ts";

export function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
	return {
		type: "object",
		properties,
		required,
	};
}
