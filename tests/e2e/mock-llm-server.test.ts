// T17 (PRD §8 L2): vitest suite for the zero-dependency mock LLM server in
// ./mock-llm-server.mjs. Fires real OpenAI chat-completions-shaped requests
// over HTTP at an ephemeral port and asserts text replay, tool_call replay,
// sequential per-role playback, the hang primitive, and the unknown-role /
// malformed-request failure paths.
import { describe, expect, it } from "vitest";
import {
  startMockLlmServer,
  type MockLlmServer,
  type MockScript,
} from "./mock-llm-server.mjs";

interface WireToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface WireDelta {
  role?: string;
  content?: string;
  tool_calls?: WireToolCallDelta[];
}

interface WireChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index: number;
    delta?: WireDelta;
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface SseCapture {
  raw: string;
  frames: WireChunk[];
  doneSentinel: boolean;
}

interface ErrorBody {
  error: { message: string; type: string; code?: string };
}

function openAiBody(system: string): Record<string, unknown> {
  return {
    model: "dsh-mock-model",
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      { role: "system", content: system },
      { role: "user", content: "drive the script" },
    ],
  };
}

async function postChat(
  baseUrl: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      authorization: "Bearer dummy-e2e-key",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal,
  });
}

async function readSseFully(response: Response): Promise<SseCapture> {
  if (response.body === null) throw new Error("response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  return parseSse(raw);
}

function parseSse(raw: string): SseCapture {
  const frames: WireChunk[] = [];
  let doneSentinel = false;
  for (const block of raw.split("\n\n")) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice("data: ".length))
      .join("\n");
    if (data.length === 0) continue;
    if (data === "[DONE]") {
      doneSentinel = true;
      continue;
    }
    frames.push(JSON.parse(data) as WireChunk);
  }
  return { raw, frames, doneSentinel };
}

function streamedContent(frames: WireChunk[]): string {
  return frames.map((frame) => frame.choices?.[0]?.delta?.content ?? "").join("");
}

describe("mock-llm-server (T17 L2 core)", () => {
  it("replays a text step as an OpenAI SSE completion (content delta, stop, usage, [DONE])", async () => {
    const script: MockScript = {
      lead: [{ type: "text", text: "hello from mock" }],
    };
    const server: MockLlmServer = await startMockLlmServer({ script });
    try {
      const response = await postChat(server.baseUrl, openAiBody("you are the lead. MOCKROLE=lead"));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const { frames, doneSentinel } = await readSseFully(response);
      expect(streamedContent(frames)).toBe("hello from mock");
      expect(frames.some((f) => f.choices?.[0]?.finish_reason === "stop")).toBe(true);
      expect(doneSentinel).toBe(true);

      // Chunk envelope fields both real adapters read (see evidence §1):
      // pi-ai records chunk.id / chunk.model; deepseek maps chunk.usage.
      for (const frame of frames) {
        expect(frame.id).toBeDefined();
        expect(frame.object).toBe("chat.completion.chunk");
        expect(frame.model).toBe("dsh-mock-model");
      }
      const usage = frames.find((f) => f.usage !== undefined)?.usage;
      expect(typeof usage?.prompt_tokens).toBe("number");
      expect(typeof usage?.completion_tokens).toBe("number");

      // Observation channel for T18/T20: the request payload is recorded per role.
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0]?.role).toBe("lead");
      expect(server.requests[0]?.body.model).toBe("dsh-mock-model");
    } finally {
      await server.close();
    }
  });

  it("plays a role's steps sequentially across requests, clamping to the last step when exhausted", async () => {
    const script: MockScript = {
      lead: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    };
    const server = await startMockLlmServer({ script });
    try {
      const bodies: string[] = [];
      for (let call = 0; call < 3; call += 1) {
        const response = await postChat(server.baseUrl, openAiBody("MOCKROLE=lead"));
        const capture = await readSseFully(response);
        bodies.push(streamedContent(capture.frames));
      }
      // One step per request (a real agent loop calls back after each tool
      // result); beyond the script tail the last step replays (OMO clamp).
      expect(bodies).toEqual(["first", "second", "second"]);
    } finally {
      await server.close();
    }
  });

  it("replays a tool_call step with the OpenAI tool_calls delta shape and finish_reason tool_calls", async () => {
    const script: MockScript = {
      lead: [
        {
          type: "tool_call",
          name: "read_file",
          arguments: { path: "/tmp/x" },
          id: "call_42",
        },
      ],
    };
    const server = await startMockLlmServer({ script });
    try {
      const response = await postChat(server.baseUrl, openAiBody("MOCKROLE=lead"));
      expect(response.status).toBe(200);
      const { frames, doneSentinel } = await readSseFully(response);

      const toolFrame = frames.find(
        (f) => (f.choices?.[0]?.delta?.tool_calls?.length ?? 0) > 0,
      );
      expect(toolFrame?.choices?.[0]?.delta?.tool_calls?.[0]).toEqual({
        index: 0,
        id: "call_42",
        type: "function",
        function: {
          name: "read_file",
          arguments: JSON.stringify({ path: "/tmp/x" }),
        },
      });
      expect(frames.some((f) => f.choices?.[0]?.finish_reason === "tool_calls")).toBe(true);
      expect(doneSentinel).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("keeps the SSE stream open on a hang step (no finish, no [DONE]) until the client aborts", async () => {
    const script: MockScript = { lead: [{ type: "hang" }] };
    const server = await startMockLlmServer({ script });
    try {
      const controller = new AbortController();
      const response = await postChat(
        server.baseUrl,
        openAiBody("MOCKROLE=lead"),
        controller.signal,
      );
      expect(response.status).toBe(200);
      if (response.body === null) throw new Error("response has no body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let received = "";
      const pump = (async () => {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          received += decoder.decode(value, { stream: true });
        }
      })();
      const verdict = await Promise.race([
        pump.then(() => "stream-ended" as const),
        new Promise<"still-open">((resolve) => {
          setTimeout(() => resolve("still-open"), 400);
        }),
      ]);
      // The async-observation primitive (report §14.4.3): the turn stays alive.
      expect(verdict).toBe("still-open");
      expect(received).toContain("chat.completion.chunk");
      expect(received).not.toContain("[DONE]");
      expect(received).not.toContain('"finish_reason":"stop"');
      expect(received).not.toContain('"finish_reason":"tool_calls"');

      controller.abort();
      await expect(pump).rejects.toThrow();
    } finally {
      await server.close();
    }
  });

  it("rejects an unknown MOCKROLE with a clear OpenAI-style 400 error (no hang, no crash)", async () => {
    const script: MockScript = { lead: [{ type: "text", text: "hi" }] };
    const server = await startMockLlmServer({ script });
    try {
      const unknown = await postChat(server.baseUrl, openAiBody("MOCKROLE=ghost"));
      expect(unknown.status).toBe(400);
      const unknownBody = (await unknown.json()) as ErrorBody;
      expect(unknownBody.error.type).toBe("invalid_request_error");
      expect(unknownBody.error.message).toContain("ghost");
      expect(unknownBody.error.message).toContain("lead");

      const missing = await postChat(server.baseUrl, openAiBody("no marker in this prompt"));
      expect(missing.status).toBe(400);
      const missingBody = (await missing.json()) as ErrorBody;
      expect(missingBody.error.message).toContain("MOCKROLE");
    } finally {
      await server.close();
    }
  });

  it("rejects malformed requests gracefully and keeps serving", async () => {
    const script: MockScript = { lead: [{ type: "text", text: "still alive" }] };
    const server = await startMockLlmServer({ script });
    try {
      const badJson = await postChat(server.baseUrl, "{not valid json");
      expect(badJson.status).toBe(400);
      const badBody = (await badJson.json()) as ErrorBody;
      expect(badBody.error.type).toBe("invalid_request_error");

      const get = await fetch(`${server.baseUrl}/v1/chat/completions`, { method: "GET" });
      expect(get.status).toBe(404);

      const ok = await postChat(server.baseUrl, openAiBody("MOCKROLE=lead"));
      expect(ok.status).toBe(200);
      const capture = await readSseFully(ok);
      expect(streamedContent(capture.frames)).toBe("still alive");
    } finally {
      await server.close();
    }
  });
});
