// Type declarations for ./mock-llm-server.mjs (zero-dependency runtime; the
// .mjs is intentionally not typechecked itself — tsc has no allowJs — so this
// .d.mts is the typed seam the vitest suite and the T18 driver import).
export type MockStep =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; arguments: Record<string, unknown>; id?: string }
  // P2-T18 parallel-batch primitive: N calls inside ONE assistant delta
  // (OpenAI `index` 0..N-1). The singular step above is unchanged.
  | {
      type: "tool_calls";
      calls: Array<{ name: string; arguments: Record<string, unknown>; id?: string }>;
    }
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
  // T8c: how many requests each dialect path served. Mutable and shared by
  // reference, like `requests`, so a caller can read it after a scenario to
  // prove the Messages branch is not dead code.
  modeCounts: MockWireModeCounts;
  close(): Promise<void>;
}

export interface MockWireModeCounts {
  openai: number;
  messages: number;
}

export interface StartMockLlmServerOptions {
  script: MockScript;
  host?: string;
}

export declare function startMockLlmServer(
  options: StartMockLlmServerOptions,
): Promise<MockLlmServer>;

/**
 * The wire-dialect decision, declared here so the vitest suite can assert the
 * rule directly (T8c). `body` is deliberately `unknown`: the rule guards its
 * own reads. See the rule and its citations in the .mjs.
 */
export declare function isMessagesRequest(
  body: unknown,
  requestUrl: unknown,
): boolean;
