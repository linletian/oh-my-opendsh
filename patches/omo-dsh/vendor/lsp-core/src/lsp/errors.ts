import type { ServerLookupResult } from "./types.ts";

export type FailedServerLookupResult = Exclude<ServerLookupResult, { status: "found" }>;

export class LspConnectionClosedError extends Error {
	override readonly name = "LspConnectionClosedError";

	readonly serverId: string;
	readonly root: string;

	constructor(
		serverId: string,
		root: string,
		message?: string,
	) {
		super(message ?? `LSP connection closed for ${serverId} at ${root}`);
		this.serverId = serverId;
		this.root = root;
	}
}

export class LspProcessExitedError extends Error {
	override readonly name = "LspProcessExitedError";

	readonly serverId: string;
	readonly root: string;
	readonly exitCode: number | null;
	readonly stderrTail?: string;

	constructor(
		serverId: string,
		root: string,
		exitCode: number | null,
		stderrTail?: string,
	) {
		const stderrSuffix = stderrTail ? `\nstderr tail: ${stderrTail}` : "";
		super(`LSP server ${serverId} at ${root} exited with code ${exitCode ?? "null"}${stderrSuffix}`);
		this.serverId = serverId;
		this.root = root;
		this.exitCode = exitCode;
		this.stderrTail = stderrTail;
	}
}

export class LspRequestTimeoutError extends Error {
	override readonly name = "LspRequestTimeoutError";

	readonly method: string;
	readonly stderrTail?: string;

	constructor(
		method: string,
		stderrTail?: string,
	) {
		const stderrSuffix = stderrTail ? `\nrecent stderr: ${stderrTail}` : "";
		super(`LSP request timeout (method: ${method})${stderrSuffix}`);
		this.method = method;
		this.stderrTail = stderrTail;
	}
}

export class LspInvalidPathError extends Error {
	override readonly name = "LspInvalidPathError";
}

export class LspServerLookupError extends Error {
	override readonly name = "LspServerLookupError";

	readonly lookup?: FailedServerLookupResult;

	constructor(
		message: string,
		lookup?: FailedServerLookupResult,
	) {
		super(message);
		this.lookup = lookup;
	}
}

export class LspServerInitializingError extends Error {
	override readonly name = "LspServerInitializingError";

	readonly originalError: LspRequestTimeoutError;

	constructor(originalError: LspRequestTimeoutError) {
		super(
			`LSP server is still initializing. Please retry in a few seconds. Original error: ${originalError.message}`,
		);
		this.originalError = originalError;
	}
}

export class LspProcessSpawnError extends Error {
	override readonly name = "LspProcessSpawnError";
}

export function isLspDeadConnectionError(err: unknown): err is LspConnectionClosedError | LspProcessExitedError {
	return err instanceof LspConnectionClosedError || err instanceof LspProcessExitedError;
}
