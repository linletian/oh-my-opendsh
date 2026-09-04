#!/usr/bin/env node
// tests/e2e/mock-llm-server.mjs — T17 (MVP PRD §8, L2 core): an OpenAI
// chat-completions-compatible mock LLM server for zero-cost e2e. Zero npm
// dependencies (node:http only) so vitest (or the T18 driver) can spawn it
// in-process on an ephemeral port and point dsh's REAL LLM adapters at it
// with dummy keys.
//
// SEMANTIC SOURCE (read-only reference; this file is a fresh implementation,
// no code copied): OMO's e2e mock-provider pattern —
//   oh-my-openagent/packages/omo-senpi/scripts/qa/team-e2e-mock-provider.ts
//     :40-46  MockStep union {text | tool_call | hang | wait_for_liveness}
//     :110-114 MOCKROLE=<role> spawn-prompt marker selects the sub-script
//     :207,236-240 per-role sequential playback (roleCallCounts), clamped to
//              the script tail; hang keeps the turn alive (report §14.4.3)
//   oh-my-openagent/packages/omo-senpi/scripts/qa/mock-completions-server.mjs
//     one-step-per-request SSE replay with `data:` framing + `[DONE]` sentinel
// Deliberate MVP deltas: NO wait_for_liveness (no Team Mode in the MVP), and
// an unknown/missing MOCKROLE is a 4xx error instead of OMO's
// default-to-`lead` fallback — a silent wrong-role replay would corrupt e2e
// assertions.
//
// WIRE FIDELITY (verified read-only against the globally installed dsh
// adapters; line citations in .omo/evidence/task-17-mvp-implementation.log):
//   * dsh-llm-deepseek: POSTs `${baseURL}/chat/completions` with
//     `stream: true` + `stream_options.include_usage`; parses SSE `data:`
//     payloads via eventsource-parser and REQUIRES a terminal `[DONE]`
//     (else STREAM_CLOSED); reads choices[].delta.{content,tool_calls},
//     choices[].finish_reason ("stop"|"tool_calls"|"length"), chunk.usage
//     {prompt_tokens, completion_tokens}; on !response.ok reads
//     body.error.message — hence the {error:{message,type,code}} shape here.
//   * dsh-llm-pi-ai (@earendil-works/pi-ai openai-completions): official
//     OpenAI SDK client against `${baseUrl}/chat/completions`; reads
//     chunk.id, chunk.model, chunk.usage, delta.content (string),
//     delta.tool_calls[].{index,id,function.{name,arguments-string-fragments}},
//     and errors on "Stream ended without finish_reason" — so every
//     non-hang response sends exactly one finish_reason frame before [DONE].
//
// SESSION MODEL: HTTP is stateless, so "per session" is scoped to the server
// INSTANCE: one `cursor` per role, advanced on every request whose system
// prompt carries that role's MOCKROLE marker (`steps[min(i, len-1)]` — the
// OMO clamp: the tail step replays once the script is exhausted). This
// matches how dsh drives one agent loop per lane (one LLM request per agent
// step, exactly like OMO's "one step per request"). LIMIT: two concurrent
// agent loops sharing the same role on one server interleave on the same
// cursor — give each lane its own role (or its own server) if a scenario
// ever needs that.

import { createServer } from "node:http";

const TOOL_CALL_ID_PREFIX = "mock-llm-tool-";
const ROLE_MARKER = /MOCKROLE=([A-Za-z0-9_-]+)/;
const CREATED = 0;

/**
 * @typedef {{ type: "text", text: string }}
 *        | {{ type: "tool_call", name: string, arguments: Record<string, unknown>, id?: string }}
 *        | {{ type: "hang" }} MockStep
 */

/**
 * Start the mock server.
 * @param {{ script: Record<string, MockStep[]>, host?: string }} options
 * @returns {Promise<{ baseUrl: string, port: number,
 *   requests: Array<{ role: string, body: Record<string, unknown>, receivedAt: number }>,
 *   close: () => Promise<void> }>}
 */
export async function startMockLlmServer({ script, host = "127.0.0.1" }) {
  if (script === null || typeof script !== "object" || Array.isArray(script)) {
    throw new TypeError("mock-llm: script must be a Record<role, MockStep[]>");
  }
  const cursors = new Map(); // role -> next step index (see SESSION MODEL above)
  const requests = []; // observation channel: T18/T20 assert on recorded payloads

  const server = createServer((request, response) => {
    if (request.method !== "POST") {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        sendError(response, 400, "mock-llm: request body is not valid JSON", "mock_bad_json");
        return;
      }
      const role = detectRole(body);
      if (role === undefined) {
        sendError(
          response,
          400,
          "mock-llm: no MOCKROLE=<role> marker found in any system message",
          "mock_role_missing",
        );
        return;
      }
      requests.push({ role, body, receivedAt: Date.now() });
      const steps = script[role];
      if (!Array.isArray(steps) || steps.length === 0) {
        const known = Object.keys(script).join(", ") || "<none>";
        sendError(
          response,
          400,
          `mock-llm: unknown MOCKROLE '${role}' (script roles: ${known})`,
          "mock_role_unknown",
        );
        return;
      }
      const index = cursors.get(role) ?? 0;
      cursors.set(role, index + 1);
      const step = steps[Math.min(index, steps.length - 1)];
      writeCompletion(response, step, body, role, index + 1);
    });
  });

  const baseUrl = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      resolve(`http://${host}:${server.address().port}`);
    });
  });
  // A listening socket is a live handle: never let a forgotten close() keep
  // the test process alive (OMO's server does the same).
  server.unref();

  let closed = false;
  return {
    baseUrl,
    port: server.address().port,
    requests,
    close: () =>
      new Promise((resolve) => {
        if (closed) {
          resolve();
          return;
        }
        closed = true;
        // Reap keep-alive/hanging sockets so close() settles immediately even
        // after a hang step left a stream open.
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Extract the MOCKROLE marker from the request's system message(s). */
function detectRole(body) {
  const messages = body !== null && typeof body === "object" ? body.messages : undefined;
  if (!Array.isArray(messages)) return undefined;
  for (const message of messages) {
    if (message === null || typeof message !== "object" || message.role !== "system") continue;
    const match = ROLE_MARKER.exec(messageText(message.content));
    if (match !== null) return match[1];
  }
  return undefined;
}

/** Content may be a plain string or an array of {type:"text", text} parts. */
function messageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const part of content) {
    if (part !== null && typeof part === "object" && typeof part.text === "string") {
      parts.push(part.text);
    }
  }
  return parts.join("\n");
}

/** OpenAI-style error body — dsh-llm-deepseek surfaces body.error.message. */
function sendError(response, status, message, code) {
  const payload = JSON.stringify({
    error: { message, type: "invalid_request_error", code },
  });
  response.writeHead(status, { "content-type": "application/json" });
  response.end(payload);
}

/**
 * Stream one MockStep as one OpenAI chat-completion. Every non-hang response
 * ends with a finish_reason frame, a usage frame (adapters request
 * stream_options.include_usage), and the `[DONE]` sentinel.
 */
function writeCompletion(response, step, body, role, callIndex) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const model = typeof body.model === "string" ? body.model : "mock-llm";
  const id = `chatcmpl-mock-${role}-${callIndex}`;
  const send = (delta, finishReason = null) => {
    response.write(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created: CREATED,
        model,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      })}\n\n`,
    );
  };

  send({ role: "assistant" });
  if (step.type === "hang") {
    // Async-observation primitive (report §14.4.3): the stream stays open and
    // never sends a finish frame; the client (or test) aborts when done.
    // closeAllConnections() in close() reaps the socket at teardown.
    return;
  }

  if (step.type === "text") {
    send({ content: step.text });
  } else {
    send({
      tool_calls: [
        {
          index: 0,
          id: step.id ?? `${TOOL_CALL_ID_PREFIX}${callIndex}`,
          type: "function",
          function: {
            name: step.name,
            arguments: JSON.stringify(step.arguments ?? {}),
          },
        },
      ],
    });
  }
  send({}, step.type === "tool_call" ? "tool_calls" : "stop");

  const outputTokens =
    step.type === "text" ? step.text.length : JSON.stringify(step.arguments ?? {}).length;
  response.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created: CREATED,
      model,
      choices: [],
      usage: {
        prompt_tokens: 0,
        completion_tokens: outputTokens,
        total_tokens: outputTokens,
      },
    })}\n\n`,
  );
  response.write("data: [DONE]\n\n");
  response.end();
}
