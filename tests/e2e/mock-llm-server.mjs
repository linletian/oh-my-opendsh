#!/usr/bin/env node
// tests/e2e/mock-llm-server.mjs — T17 (MVP PRD §8, L2 core): a mock LLM
// server for zero-cost e2e that serves TWO wire dialects, chosen per request
// (see WIRE DIALECT SELECTION below). Zero npm dependencies (node:http only)
// so vitest (or the T18 driver) can spawn it in-process on an ephemeral port
// and point dsh's REAL LLM adapters at it with dummy keys.
//
// WIRE DIALECT SELECTION (T8c): a concerto scenario puts seats on BOTH LLM
// providers against this one port — `deepseek` (@deepseek-ai/dsh-llm-pi-ai →
// @earendil-works/pi-ai openai-completions, chat-completions) and
// `deepseek-official` (@deepseek-ai/dsh-llm-deepseek, the DeepSeek *Messages*
// / Anthropic dialect on dsh 0.2.0-rc.2). So the mode is a property of the
// request — its path first, then its body — never of configuration or
// environment: isMessagesRequest(url, body) keys on the endpoint the client
// posted to (`/messages` vs `/chat/completions`) and falls back to body
// markers. The path is decisive because the persona can ride EITHER face of a
// Messages request: dsh-llm-deepseek writes a top-level `system`
// (installed lib/index.js:1701,:1709) but also splices `role:"system"` rows
// INSIDE `messages[]` for a model whose catalog row declares
// systemPromptUpdate "in-history" (:47 deepseek-flash, read at :1579, built at
// :1653-1661, spliced at :1612-1615) — and then omits `system` altogether,
// which is the required shape for a loop-built request (installed
// @deepseek-ai/dsh-agent-loop/lib/invariant.js:28 demands options.system be
// absent). OpenAI-dialect requests take the pre-existing writeCompletion() path
// unchanged; Messages-dialect requests take writeMessagesCompletion().
// modeCounts records which path each request took and is exposed on the
// returned server object.
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
// adapters; line citations in .omo/evidence/task-17-mvp-implementation.log,
// and re-verified per generation in .omo/evidence/p45t8/T8c-mock-messages-mode.md):
//   * dsh-llm-deepseek on dsh 0.1.5-rc.1 (git source tree ~/GithubRepo/
//     deepseek-harness, tag dsh-v0.1.5-rc.1): OpenAI chat-completions. POSTs
//     `${baseURL}/chat/completions` (packages/llm/llm-deepseek/src/adapter.ts
//     :651) with `stream: true` + `stream_options.include_usage` (src/
//     serialize.ts:360-361), and the persona is a `messages[]` row with
//     `role: "system"` (src/serialize.ts:386-387). Parses SSE `data:` payloads
//     via eventsource-parser and REQUIRES a terminal `[DONE]` (else
//     STREAM_CLOSED); reads choices[].delta.{content,tool_calls},
//     choices[].finish_reason ("stop"|"tool_calls"|"length"), chunk.usage
//     {prompt_tokens, completion_tokens}; on !response.ok reads
//     body.error.message — hence the {error:{message,type,code}} shape here.
//   * dsh-llm-deepseek on dsh 0.2.0-rc.2 (installed npm package
//     ~/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/
//     @deepseek-ai/dsh-llm-deepseek/lib/index.js): DeepSeek *Messages*. The
//     protocol "is not configurable" (:392) and POSTs
//     `${messagesApiRoot(baseURL)}/messages` (:2188; messagesApiRoot appends
//     `/v1` unless the path already ends with it, :557-559). The persona is a
//     TOP-LEVEL `system` string (:1701, emitted only when non-empty, :1709)
//     and `stream: true` is hardcoded (:1704 — the only `stream` key the
//     serializer writes, so this adapter never sends a non-streaming request).
//     Required reply grammar, all from that one file:
//       - every frame that arrives BEFORE `message_stop` must carry JSON in
//         `data` (:1780-1782) — the OpenAI `[DONE]` sentinel placed there is a
//         MALFORMED_RESPONSE (measured); translate() returns at :2003, so a
//         trailing `[DONE]` is never read. Messages replies therefore end at
//         `message_stop` with no sentinel;
//       - an `event:` line is optional but must equal `data.type` (:1785);
//       - `message_start` first and once (:1924-1925), carrying
//         `message.usage` as an object (:1926 → object() :1467-1469 and
//         updateUsage() :1808-1809);
//       - unknown event types between those are skipped (:1930-1936);
//       - `content_block_start` needs a unique non-negative `index` before any
//         stop reason (:1938-1940, indexOf() :1804-1807) and a
//         `content_block` object (:1823): `text` requires a string `text`
//         (:1830), `tool_use` requires non-empty `id`+`name` and an object
//         `input` (:1845-1851); anything else is UNSUPPORTED_CONTENT (:1854);
//       - delta type must match the open block's type (:1867-1899):
//         `text_delta{text}` on a text block, `input_json_delta{partial_json}`
//         on a tool_use block — a text delta on a tool_use block is
//         MALFORMED (:1899), hence one block per part;
//       - `content_block_stop` closes it, and accumulated `partial_json`
//         REPLACES the block's arguments when non-empty (:1967-1969);
//       - `message_delta.delta.stop_reason` ∈ {end_turn, stop_sequence,
//         tool_use, max_tokens} (:1978, stopReason() :1901-1909);
//       - `message_stop` requires a stop reason AND every block closed
//         (:1981), rejects a zero-block `end_turn` as EMPTY_RESPONSE (:1982),
//         and requires every tool_use `arguments` to parse as a JSON object
//         unless the reason is max_tokens (:1983-1992); ending the stream
//         without it is STREAM_CLOSED (:2006).
//     Hence writeMessagesCompletion() below.
//   * dsh-llm-pi-ai (@earendil-works/pi-ai openai-completions): official
//     OpenAI SDK client against `${baseUrl}/chat/completions`; reads
//     chunk.id, chunk.model, chunk.usage, delta.content (string),
//     delta.tool_calls[].{index,id,function.{name,arguments-string-fragments}},
//     and errors on "Stream ended without finish_reason" — so every
//     non-hang response sends exactly one finish_reason frame before [DONE].
//     Its request posts `${baseUrl}/chat/completions` — which is what keeps
//     this lane on the OpenAI path under the decisive path rule — and it never
//     sends a top-level `system` (installed @earendil-works/pi-ai@0.87.1
//     dist/api/openai-completions.js:571-582). The persona rides a `messages[]`
//     row whose role is "system", or "developer" when the model is
//     reasoning-capable AND the compat allows it (:896,:919); moot in this
//     deployment, where both deepseek catalog rows set
//     compat.supportsDeveloperRole false. A `developer` row would in any case
//     never reach the dialect rule: detectRole() scans only `role: "system"`
//     and would 400 the request first.
//
// SESSION MODEL: HTTP is stateless, so "per session" is scoped to the server
// INSTANCE: one `cursor` per role, advanced on every request whose system
// prompt carries that role's MOCKROLE marker — in either dialect, i.e. from a
// `messages[]` row with `role: "system"` or from a top-level `system` field
// (detectRole) — (`steps[min(i, len-1)]` — the
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
// Messages-dialect stop reasons. The adapter maps exactly these four and
// MALFORMEDs anything else (installed dsh-llm-deepseek lib/index.js:1901-1909);
// `max_tokens` would read as truncation and drop tool calls downstream
// (installed dsh-llm lib/index.js:1053), so the mock only ever uses the two
// that mean "this turn is finished": end_turn for text, tool_use for tools.
const STOP_END_TURN = "end_turn";
const STOP_TOOL_USE = "tool_use";

/**
 * @typedef {{ type: "text", text: string }}
 *        | {{ type: "tool_call", name: string, arguments: Record<string, unknown>, id?: string }}
 *        | {{ type: "tool_calls", calls: Array<{ name: string, arguments: Record<string, unknown>, id?: string }> }}
 *        | {{ type: "hang" }} MockStep
 *
 * `tool_calls` (plural, P2-T18) is the PARALLEL-batch primitive: every call is
 * emitted inside ONE assistant delta with the OpenAI-mandated increasing
 * `index`, which is exactly what "the conductor fires N delegations in one
 * message" looks like on the wire. The singular `tool_call` step stays
 * byte-identical for every pre-existing scenario. Ids default to
 * `mock-llm-tool-<callIndex>-<i>`: the singular step's `<callIndex>` alone
 * would collide across the batch (one cursor advance, N calls).
 */

/**
 * Start the mock server.
 * @param {{ script: Record<string, MockStep[]>, host?: string }} options
 * @returns {Promise<{ baseUrl: string, port: number,
 *   requests: Array<{ role: string, body: Record<string, unknown>, receivedAt: number }>,
 *   modeCounts: { openai: number, messages: number },
 *   close: () => Promise<void> }>}
 */
export async function startMockLlmServer({ script, host = "127.0.0.1" }) {
  if (script === null || typeof script !== "object" || Array.isArray(script)) {
    throw new TypeError("mock-llm: script must be a Record<role, MockStep[]>");
  }
  assertScriptShape(script);
  const cursors = new Map(); // role -> next step index (see SESSION MODEL above)
  const requests = []; // observation channel: T18/T20 assert on recorded payloads
  // Observation channel for T8c: how many requests each dialect path served.
  // Mutable and shared by reference, like `requests`, so a caller can read it
  // after the scenario to prove the Messages branch is not dead code.
  const modeCounts = { openai: 0, messages: 0 };

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
      if (isMessagesRequest(body, request.url)) {
        modeCounts.messages += 1;
        // One stderr line per Messages request: the driver runs this server
        // in-process, so it lands in the driver's own stderr and is the
        // direct evidence that a 0.2.x `deepseek-official` request reached
        // writeMessagesCompletion(). Nothing is written on the OpenAI path,
        // so the pre-existing path's output stays byte-identical.
        process.stderr.write(
          `mock-llm: messages-mode #${modeCounts.messages} role=${role} path=${request.url ?? "?"} model=${String(body.model ?? "?")}\n`,
        );
        writeMessagesCompletion(response, step, body, role, index + 1);
        return;
      }
      modeCounts.openai += 1;
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
    modeCounts,
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

/**
 * Fail LOUD at startup on a malformed script step (P2-T18): a bad step is
 * author error in the scenario definition, and discovering it mid-stream would
 * either crash the request handler or replay a nonsense frame. An empty
 * `tool_calls` batch is the one shape that looks valid but produces a
 * `finish_reason: "tool_calls"` frame with zero calls — rejected here.
 */
function assertScriptShape(script) {
  for (const [role, steps] of Object.entries(script)) {
    if (!Array.isArray(steps)) {
      throw new TypeError(`mock-llm: script role '${role}' must map to MockStep[]`);
    }
    for (const [index, step] of steps.entries()) {
      const where = `script['${role}'][${index}]`;
      if (step === null || typeof step !== "object") {
        throw new TypeError(`mock-llm: ${where} must be a MockStep object`);
      }
      if (step.type === "tool_calls") {
        if (!Array.isArray(step.calls) || step.calls.length === 0) {
          throw new TypeError(`mock-llm: ${where} is a tool_calls step with no calls`);
        }
        for (const [callIndex, call] of step.calls.entries()) {
          if (typeof call?.name !== "string" || call.name.length === 0) {
            throw new TypeError(`mock-llm: ${where}.calls[${callIndex}] needs a non-empty name`);
          }
        }
      } else if (step.type === "tool_call") {
        if (typeof step.name !== "string" || step.name.length === 0) {
          throw new TypeError(`mock-llm: ${where} needs a non-empty tool name`);
        }
      } else if (step.type !== "text" && step.type !== "hang") {
        throw new TypeError(`mock-llm: ${where} has unknown step type '${String(step.type)}'`);
      }
    }
  }
}

/**
 * Extract the MOCKROLE marker from the request's system prompt, in either
 * dialect. The `messages[]` scan runs FIRST and unchanged, so a request that
 * carries the marker in a system row — every OpenAI chat-completions request,
 * on 0.1.5-rc.1 and on the pi-ai lane of 0.2.x — resolves exactly as before.
 * Only when that scan finds nothing does it look at a top-level `system`
 * field, which is where dsh 0.2.0-rc.2's dsh-llm-deepseek puts the persona
 * when it does not ride inside `messages[]` as an in-history system row
 * (installed lib/index.js:1701,:1709 for the top-level field; :1653-1661 with
 * :1612-1615 for the in-history rows, which the first scan already covers).
 * Same single ROLE_MARKER rule, no second rule. A request with neither still
 * returns undefined and is 400'd with the pre-existing message.
 */
function detectRole(body) {
  const messages = body !== null && typeof body === "object" ? body.messages : undefined;
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (message === null || typeof message !== "object" || message.role !== "system") continue;
      const match = ROLE_MARKER.exec(messageText(message.content));
      if (match !== null) return match[1];
    }
  }
  const systemMarker = ROLE_MARKER.exec(messageText(body?.system));
  return systemMarker !== null ? systemMarker[1] : undefined;
}

/**
 * Whether this request speaks the DeepSeek Messages (Anthropic) dialect rather
 * than OpenAI chat-completions. Derived from the request itself — its path and
 * its body — never from configuration, a flag, or the environment, so one server
 * serves both dialects on one port (the concerto scenario's seats are split
 * across `deepseek-official` and `deepseek`).
 *
 * Rule, in order:
 *  0. THE PATH IS DECISIVE. A POST to a path ending `/messages` is Messages; a
 *     POST to `/chat/completions` or `/responses` is OpenAI. Chosen because no
 *     body-only rule can be sound here: the persona may ride EITHER face.
 *     dsh-llm-deepseek writes the top-level `system` (installed lib/index.js
 *     :1701,:1709) but ALSO puts `role:"system"` rows INSIDE `messages[]` when
 *     the model's catalog row says systemPromptUpdate "in-history" (:47 for
 *     deepseek-flash; :1579 reads it; :1653-1661 builds the rows; :1612-1615
 *     splices them in) — and in that case `system` is omitted entirely
 *     (:1701,:1709). That is the NORMAL state of a loop-built request, not an
 *     exotic one: installed @deepseek-ai/dsh-agent-loop/lib/invariant.js:28
 *     REQUIRES `options.system === void 0` on every request the loop builds.
 *     Negative control — every OpenAI-dialect client installed here targets
 *     `/chat/completions` (@earendil-works/pi-ai dist/api/openai-completions.js
 *     via the openai SDK; dist/api/mistral-conversations.js:164) or `/responses`
 *     (dist/api/azure-openai-responses.js:157, dist/api/
 *     openai-codex-responses.js:464-465), never `/messages`. The one installed
 *     client that DOES POST `/messages` besides the Anthropic-dialect ones is
 *     pi-ai's own native API (dist/api/pi-messages.js:250), and it sends
 *     `{ model, context, options }` (:5) — no `messages[]`, no `system` — so
 *     detectRole() has already 400'd it before this function is consulted.
 *  1. body fallback, for an unrecognised path — EXCLUSIVE wire markers first:
 *     `stream_options` present is OpenAI-only (installed @earendil-works/pi-ai
 *     dist/api/openai-completions.js:582, and at the dsh-v0.1.5-rc.1 tag's
 *     packages/llm/llm-deepseek/src/serialize.ts:361; ZERO occurrences in the
 *     installed 0.2.x Messages adapter); `output_config` present is Messages-only
 *     (installed dsh-llm-deepseek lib/index.js:1708; in pi-ai it appears only in
 *     dist/api/anthropic-messages.js and dist/api/bedrock-converse-stream.js,
 *     never in openai-completions.js).
 *  2. a top-level `system` carrying text (a string, or an array of {text} parts)
 *     is Messages.
 *  3. otherwise OpenAI — the conservative legacy default. The only shape reaching
 *     here is a marker found in a `role:"system"` row by detectRole()'s first
 *     scan, which is the OpenAI face.
 *
 * `thinking` is deliberately NOT a marker: it looks Messages-only but is not —
 * pi-ai writes `params.thinking = { type: "enabled" | "disabled" }` on the
 * OpenAI wire for compat.thinkingFormat "deepseek" (dist/api/
 * openai-completions.js:666-671), which BOTH models of the installed deepseek
 * catalog declare, so it would mis-route an OpenAI request.
 *
 * There is deliberately NO `developer`-role arm: detectRole() scans only
 * `role: "system"` rows and runs FIRST, so a request carrying its persona in a
 * `developer` row is answered with the 400 before this function is reached, and
 * the arm could never fire. Making it fire would mean widening detectRole to
 * `developer` rows, which would change the pre-existing OpenAI path's behaviour
 * (400 → 200) — out of scope here. It is also moot in this deployment: both
 * models of the installed pi-ai deepseek catalog declare
 * compat.supportsDeveloperRole false, so openai-completions.js:896 selects
 * "system" as the instruction role for every lane.
 *
 * EXPORTED so the decision itself is testable: this rule is load-bearing for
 * every scenario's correctness, and the four facts it rests on are read out of
 * installed packages, so a committed guard is the only thing that would notice
 * if upstream changed one. Nothing else consumes the export; it changes no
 * runtime behaviour.
 */
export function isMessagesRequest(body, requestUrl) {
  const path = typeof requestUrl === "string" ? requestUrl : "";
  if (path.endsWith("/messages")) return true;
  if (path.endsWith("/chat/completions") || path.endsWith("/responses")) return false;
  const object = body !== null && typeof body === "object" ? body : {};
  if (object.stream_options !== undefined) return false;
  if (object.output_config !== undefined) return true;
  const system = object.system;
  if (typeof system === "string" && system.length > 0) return true;
  if (Array.isArray(system) && messageText(system).length > 0) return true;
  return false;
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
    // Both the singular step (one call, index 0) and the plural batch (N calls,
    // indices 0..N-1, ONE delta) take this path: the wire shape is identical,
    // only the count differs. The adapters accumulate by `index`.
    const calls = step.type === "tool_calls"
      ? step.calls
      : [{ name: step.name, arguments: step.arguments, id: step.id }];
    send({
      tool_calls: calls.map((call, index) => ({
        index,
        id: call.id ?? (step.type === "tool_calls"
          ? `${TOOL_CALL_ID_PREFIX}${callIndex}-${index}`
          : `${TOOL_CALL_ID_PREFIX}${callIndex}`),
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments ?? {}),
        },
      })),
    });
  }
  send({}, step.type === "text" ? "stop" : "tool_calls");

  const outputTokens = step.type === "text"
    ? step.text.length
    : step.type === "tool_calls"
      ? step.calls.reduce((total, call) => total + JSON.stringify(call.arguments ?? {}).length, 0)
      : JSON.stringify(step.arguments ?? {}).length;
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

/**
 * Stream one MockStep as one DeepSeek Messages (Anthropic) SSE response — the
 * dialect dsh 0.2.0-rc.2's dsh-llm-deepseek adapter parses. Same scripted
 * content as writeCompletion(), different framing:
 *   message_start → (per part) content_block_start → content_block_delta →
 *   content_block_stop → message_delta(stop_reason) → message_stop
 * There is deliberately NO `[DONE]` sentinel: every frame that arrives before
 * `message_stop` is JSON-parsed, so the OpenAI terminator there is a
 * MALFORMED_RESPONSE (installed dsh-llm-deepseek lib/index.js:1780-1782, and
 * measured: a `[DONE]` placed before `message_stop` fails with "SSE contains
 * invalid JSON"). One placed after `message_stop` happens to be never read —
 * translate() returns at :2003 — but it is not part of this dialect, so the
 * Messages path ends at `message_stop`.
 * @param {import("node:http").ServerResponse} response
 * @param {MockStep} step the step selected by the per-role cursor
 * @param {Record<string, unknown>} body the parsed request body
 * @param {string} role the MOCKROLE the request carried
 * @param {number} callIndex 1-based, as in writeCompletion(): it seeds the
 *   default tool-call id, so a delegated call gets the same id whichever
 *   dialect carried it.
 */
function writeMessagesCompletion(response, step, body, role, callIndex) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const model = typeof body.model === "string" ? body.model : "mock-llm";
  const send = (type, fields) => {
    // An `event:` line is optional for this adapter but, when present, must
    // equal `data.type` (lib/index.js:1785); the Messages wire format sends it.
    response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
  };

  send("message_start", {
    // `message` and `message.usage` must both be objects; they are the only
    // parts of this event the adapter reads (lib/index.js:1926 with
    // object() :1467-1469 and updateUsage() :1808-1809).
    message: {
      id: `msg_mock-${role}-${callIndex}`,
      type: "message",
      role: "assistant",
      model,
      content: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });
  if (step.type === "hang") {
    // Same async-observation primitive as writeCompletion(): the stream stays
    // open after the opening frame and never settles, so translate() waits
    // instead of seeing STREAM_CLOSED (lib/index.js:2006).
    return;
  }

  // One block per part: a text delta addressed to a tool_use block is
  // MALFORMED (lib/index.js:1899), so text and tool calls never share an
  // index. A plural `tool_calls` step becomes N tool_use blocks, each with
  // its own start/delta/stop, under one stop_reason.
  const parts = step.type === "text"
    ? [{ kind: "text", text: step.text }]
    : (step.type === "tool_calls"
      ? step.calls
      : [{ name: step.name, arguments: step.arguments, id: step.id }]).map((call, index) => ({
        kind: "tool_use",
        id: call.id ?? (step.type === "tool_calls"
          ? `${TOOL_CALL_ID_PREFIX}${callIndex}-${index}`
          : `${TOOL_CALL_ID_PREFIX}${callIndex}`),
        name: call.name,
        input: call.arguments ?? {},
      }));

  let outputTokens = 0;
  for (const [index, part] of parts.entries()) {
    if (part.kind === "text") {
      // `text` is required and must be a string even when empty (:1830).
      send("content_block_start", { index, content_block: { type: "text", text: "" } });
      send("content_block_delta", { index, delta: { type: "text_delta", text: part.text } });
      outputTokens += part.text.length;
    } else {
      // `input` must be an object at block start (:1849); the arguments travel
      // as `input_json_delta`, and the adapter replaces the block's arguments
      // with the accumulated partial_json when it closes (:1969).
      send("content_block_start", {
        index,
        content_block: { type: "tool_use", id: part.id, name: part.name, input: {} },
      });
      const partialJson = JSON.stringify(part.input);
      send("content_block_delta", {
        index,
        delta: { type: "input_json_delta", partial_json: partialJson },
      });
      outputTokens += partialJson.length;
    }
    send("content_block_stop", { index });
  }

  // `end_turn` for a text turn, `tool_use` when tool calls are advertised:
  // those are the two accepted reasons that mean "settled" (stopReason()
  // :1901-1909). `max_tokens` would read as truncation and the assembler would
  // drop the tool calls (installed dsh-llm lib/index.js:1053).
  send("message_delta", {
    delta: { stop_reason: step.type === "text" ? STOP_END_TURN : STOP_TOOL_USE },
    usage: { input_tokens: 0, output_tokens: outputTokens },
  });
  send("message_stop", {});
  response.end();
}
