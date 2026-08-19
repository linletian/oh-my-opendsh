// Type declarations for ./mock-llm-server.mjs (zero-dependency runtime; the
// .mjs is intentionally not typechecked itself — tsc has no allowJs — so this
// .d.mts is the typed seam the vitest suite and the T18 driver import).
export type MockStep =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; arguments: Record<string, unknown>; id?: string }
  | { type: "hang" };

export type MockScript = Record<string, MockStep[]>;

export interface MockRequestRecord {
  role: string;
  body: Record<string, unknown>;
  receivedAt: number;
}

export interface MockLlmServer {
  baseUrl: string;
  port: number;
  requests: MockRequestRecord[];
  close(): Promise<void>;
}

export interface StartMockLlmServerOptions {
  script: MockScript;
  host?: string;
}

export declare function startMockLlmServer(
  options: StartMockLlmServerOptions,
): Promise<MockLlmServer>;
