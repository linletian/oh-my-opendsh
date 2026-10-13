#!/usr/bin/env node
// PROJECT-NEW file (P6-T4, fork (L-B)) — NOT upstream content. Registered in
// VENDOR-MANIFEST.json as origin "project-new" (deviations class "addition").
//
// Thin stdio entry for the vendored LSP MCP server: it starts the vendored
// `runMcpStdioServer` (lsp-core/src/mcp.ts) and disposes the default LSP
// manager on exit. Semantics REFERENCE the MIT package
// `@code-yeongyu/lsp-tools-mcp`'s src/cli.ts (~30 lines: run the stdio server,
// dispose the manager in `finally` and in the top-level catch); this file is a
// project-written face over the vendored engine, not a vendored file — the MIT
// attribution rides in THIRD_PARTY_NOTICES.md (FORKS.md §0-6: the (L-B) ruling
// does not vendor that package, so the attribution is a notice entry, not a
// license-file copy).
//
// Imports are relative `.ts` specifiers (the repo's explicit-extension
// discipline, T8b precedent): the host runs this file under plain Node 24
// type-stripping, which resolves no extensionless specifier.
import { argv, stderr } from "node:process";

import { disposeDefaultLspManager } from "./lsp/manager.ts";
import { runMcpStdioServer } from "./mcp.ts";

async function main(): Promise<void> {
	const [command = "mcp"] = argv.slice(2);

	try {
		if (command === "mcp") {
			// stderr only — stdout is exclusively JSON-RPC frames (MCP stdio transport).
			stderr.write(`[lsp-mcp] stdio server starting pid=${String(process.pid)}\n`);
			await runMcpStdioServer();
			return;
		}

		stderr.write("Usage: lsp-core [mcp]\n");
		process.exitCode = 2;
	} finally {
		await disposeDefaultLspManager();
	}
}

main().catch(async (error: unknown) => {
	stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
	await disposeDefaultLspManager();
	process.exitCode = 1;
});
