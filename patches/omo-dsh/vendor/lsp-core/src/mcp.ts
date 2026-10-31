import { appendFileSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import {
	errorResponse,
	isPlainRecord,
	jsonRpcId,
	runJsonRpcStdioServer,
	successResponse,
	type JsonRpcError,
	type JsonRpcId,
	type JsonRpcResponse,
	type JsonRpcResult,
	type McpToolDescriptor,
	type ParentWatchdogConfig,
} from "../../mcp-stdio-core/src/index.ts";
import { coerceToolArguments, executeLspTool, LSP_MCP_TOOLS } from "./tools.ts";
import { createStandaloneMcpRequestContext, runWithRequestContext } from "./request-context.ts";

export type { JsonRpcError, JsonRpcId, JsonRpcResponse, JsonRpcResult, McpToolDescriptor };

const SERVER_NAME = "lsp";
const SERVER_VERSION = "0.1.0";

// ── VENDOR DEVIATION (P6-T4, fork (L-B) ruling .omo/evidence/p6t1/FORKS.md §2.6 ⑤) ──
// modern-era (protocol revision 2026-07-28) wire fields. The dsh-mcp-client SDK
// negotiates the modern era by default via `server/discover` on a disposable sibling
// process (probe evidence .omo/evidence/p6t1/mcp-client-probe/RESULTS.md §1: sibling
// pid ≠ session pid, no `initialize` on a modern session); upstream answers
// `server/discover` with -32601, which silently downgrades the connection to the
// legacy era, and its tools/list / tools/call results lack the codec-required
// `resultType` (+ tools/list `ttlMs`/`cacheScope`). Codec ground truth read from the
// installed @modelcontextprotocol/client dist (rev2026Codec.decodeResult —
// "missing required resultType" is an InvalidResult once the era is modern;
// ListToolsResultSchema$1 requires ttlMs int ≥ 0 + cacheScope public|private;
// DiscoverResultSchema$1 requires supportedVersions + capabilities).
// The era is per-process state: the session process may never see `server/discover`
// (the sibling got it), so modern is ALSO inferred from the per-request `_meta`
// envelope modern clients stamp onto params — the same technique the p6t1 fixture
// proved green (fixture/mcp-fixture-server.mjs L81/L133).
const MODERN_PROTOCOL_VERSION = "2026-07-28";
const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";
// Honest cache values for this server's lists: the tool list changes the moment an
// LSP server installs or an install decision flips, so nothing is cacheable
// (ttlMs 0 = always revalidate); the state is this user's local machine, so the
// scope is private. These are the SDK's own defaults (DEFAULT_CACHE_TTL_MS /
// DEFAULT_CACHE_SCOPE in the installed client dist), restated explicitly here.
const MODERN_LIST_CACHE_FIELDS = { resultType: "complete", ttlMs: 0, cacheScope: "private" } as const;

export interface LspMcpEraState {
	modern: boolean;
}

export function createLspMcpEraState(): LspMcpEraState {
	return { modern: false };
}

function hasModernEnvelope(params: unknown): boolean {
	return isPlainRecord(params) && params["_meta"] !== undefined;
}

// Env-gated wire diagnostic seam (deviation, registered): when LSP_MCP_WIRE_LOG names
// a path, every handled frame is appended synchronously as
// `<method> pid=<pid> modern=<0|1> [requested=<pv>] [tool=<name>]`. stdout stays
// exclusively JSON-RPC frames (MCP stdio transport); stderr is the channel the SDK
// already discards/merges. Unset means zero behaviour change.
const WIRE_LOG_PATH = process.env["LSP_MCP_WIRE_LOG"] ?? "";

function wireLog(line: string): void {
	if (WIRE_LOG_PATH === "") return;
	try {
		appendFileSync(WIRE_LOG_PATH, `${line}\n`);
	} catch {
		// a diagnostic sink must never take the server down
	}
}

export interface HandleLspMcpRequestOptions {
	readonly signal?: AbortSignal;
	// Deviation (P6-T4): per-connection era tracker; absent keeps the legacy shape.
	readonly era?: LspMcpEraState;
}

export interface LspMcpStdioServerOptions {
	// Test seam: production callers leave this unset so the watchdog uses its
	// defaults (parentPid = process.ppid, 30s poll).
	readonly parentWatchdog?: ParentWatchdogConfig;
}

export async function handleLspMcpRequest(
	input: unknown,
	options: HandleLspMcpRequestOptions = {},
): Promise<JsonRpcResponse | undefined> {
	if (!isPlainRecord(input)) {
		return errorResponse(null, -32600, "Invalid Request");
	}

	const id = jsonRpcId(input["id"]);
	const method = input["method"];
	const era = options.era;
	// A modern client stamps the `_meta` envelope onto every request once the era is
	// modern; observing it here is what lets the SESSION process (which never handles
	// server/discover — the SDK probes that on a sibling) emit modern-shaped results.
	if (era !== undefined && hasModernEnvelope(input["params"])) era.modern = true;
	wireLog(`${String(method)} pid=${String(process.pid)} modern=${era?.modern === true ? 1 : 0}${method === "initialize" ? ` requested=${String(requestedProtocolVersion(input["params"]))}` : ""}${method === "tools/call" && isPlainRecord(input["params"]) ? ` tool=${String(input["params"]["name"])}` : ""}`);
	if (method === "notifications/initialized") return undefined;
	if (method === "ping") return successResponse(id, era?.modern === true ? { resultType: "complete" } : {});
	if (method === "initialize") {
		const protocolVersion = requestedProtocolVersion(input["params"]);
		// Echo semantics kept verbatim (upstream `requestedProtocolVersion`): the
		// server answers with whatever version the client asked for. A 2026-07-28
		// request is therefore answered modern — upstream already advertised it.
		if (era !== undefined && protocolVersion === MODERN_PROTOCOL_VERSION) era.modern = true;
		return successResponse(id, {
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
			protocolVersion,
		});
	}

	// Deviation (P6-T4): the modern-era advertisement. Answering `server/discover`
	// is what keeps the connection in the 2026-07-28 era instead of silently
	// downgrading to legacy (FORKS.md §2.6 ⑤). The result shape is the codec's
	// DiscoverResultSchema (supportedVersions + capabilities required; ttlMs/
	// cacheScope carry the honest no-cache values; serverInfo rides in `_meta`
	// per spec PR #3002).
	if (method === "server/discover") {
		if (era !== undefined) era.modern = true;
		return successResponse(id, {
			...MODERN_LIST_CACHE_FIELDS,
			supportedVersions: [MODERN_PROTOCOL_VERSION],
			capabilities: { tools: { listChanged: false } },
			_meta: { [SERVER_INFO_META_KEY]: { name: SERVER_NAME, version: SERVER_VERSION } },
		});
	}

	if (method === "tools/list") {
		return successResponse(id, {
			...(era?.modern === true ? MODERN_LIST_CACHE_FIELDS : {}),
			tools: LSP_MCP_TOOLS.map(describeTool),
		});
	}

	if (method === "tools/call") {
		return handleToolCall(id, input["params"], options.signal, era);
	}

	return errorResponse(id, -32601, `Method not found: ${String(method)}`);
}

export async function runMcpStdioServer(
	input: Readable = process.stdin,
	output: Writable = process.stdout,
	options: LspMcpStdioServerOptions = {},
): Promise<void> {
	const requestContext = createStandaloneMcpRequestContext();
	// Deviation (P6-T4): one era tracker per stdio connection (this process),
	// threaded into every request so the first modern signal — `server/discover`
	// here in the sibling, or a `_meta`-stamped request in the session — flips
	// every later result to its modern shape.
	const era = createLspMcpEraState();
	await runJsonRpcStdioServer({
		input,
		output,
		idleTimeoutMs: 0,
		parentWatchdog: options.parentWatchdog ?? {},
		handler: (request) => runWithRequestContext(requestContext, () => handleLspMcpRequest(request, { era })),
		handlerOptions: undefined,
	});
}

async function handleToolCall(id: JsonRpcId, params: unknown, signal?: AbortSignal, era?: LspMcpEraState): Promise<JsonRpcResponse> {
	if (!isPlainRecord(params) || typeof params["name"] !== "string") {
		return errorResponse(id, -32602, "tools/call requires params.name");
	}

	try {
		const result = await executeLspTool(params["name"], coerceToolArguments(params["arguments"]), signal);
		return successResponse(id, {
			...(era?.modern === true ? { resultType: "complete" } : {}),
			content: result.content,
			isError: result.isError ?? false,
			details: result.details,
		});
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		return successResponse(id, {
			...(era?.modern === true ? { resultType: "complete" } : {}),
			content: [{ type: "text", text: error.message }],
			isError: true,
		});
	}
}

function describeTool(tool: (typeof LSP_MCP_TOOLS)[number]): McpToolDescriptor {
	return {
		name: tool.name,
		title: tool.title,
		description: tool.description,
		inputSchema: tool.inputSchema,
	};
}

function requestedProtocolVersion(params: unknown): string {
	if (!isPlainRecord(params) || typeof params["protocolVersion"] !== "string") return "2024-11-05";
	return params["protocolVersion"];
}
