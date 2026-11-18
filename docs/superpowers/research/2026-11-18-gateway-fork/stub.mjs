import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const [mode, port, logFile] = process.argv.slice(2);
const bodies = {
  spec: { type: "error", error: { type: "invalid_request_error", message: "safeguards is not supported by this gateway" } },
  patch: { error: { message: "Server safeguards require client-owned tool execution. Select the native provider model or a virtual model without internal gateway tools." } }
};
let seq = 0;

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}

function reply(body) {
  const toolResults = JSON.stringify(body.messages ?? []).split('"tool_result"').length - 1;
  const bash = (body.tools ?? []).find((tool) => tool.name === "Bash");
  if (bash && toolResults < 3) {
    return { stop: "tool_use", block: { type: "tool_use", id: `toolu_stub_${toolResults}_${seq}`, name: "Bash", input: {} },
      delta: { type: "input_json_delta", partial_json: JSON.stringify({ command: process.env.STUB_CMD ? `${process.env.STUB_CMD} # ${toolResults}` : `mkdir -p out && echo step${toolResults} > out/f${toolResults}.txt`, description: "write a file" }) } };
  }
  return { stop: "end_turn", block: { type: "text", text: "" }, delta: { type: "text_delta", text: "done" } };
}

createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => {
    let body = {};
    try { body = JSON.parse(raw || "{}"); } catch {}
    const beta = String(req.headers["anthropic-beta"] ?? "");
    const hasField = Object.hasOwn(body, "safeguards");
    const entry = { n: ++seq, path: req.url.split("?")[0], model: body.model, tools: (body.tools ?? []).length,
      stream: body.stream === true, betaDangerous: /dangerous-tool-use/.test(beta), safeguards: hasField,
      toolResults: JSON.stringify(body.messages ?? []).split('"tool_result"').length - 1 };
    if (req.method !== "POST" || !entry.path.endsWith("/v1/messages")) {
      entry.status = entry.path.endsWith("/count_tokens") ? 200 : 404;
      appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
      res.writeHead(entry.status, { "content-type": "application/json" });
      res.end(JSON.stringify(entry.status === 200 ? { input_tokens: 100 } : { type: "error", error: { type: "not_found_error", message: "not found" } }));
      return;
    }
    if (hasField && bodies[mode]) {
      entry.status = 400;
      appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify(bodies[mode]));
      return;
    }
    const { stop, block, delta } = reply(body);
    entry.status = 200;
    entry.answered = block.type;
    appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
    const message = { id: `msg_stub_${seq}`, type: "message", role: "assistant", model: body.model ?? "stub", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } };
    if (!body.stream) {
      const content = block.type === "text" ? [{ type: "text", text: delta.text }] : [{ ...block, input: JSON.parse(delta.partial_json) }];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ...message, content, stop_reason: stop, usage: { input_tokens: 10, output_tokens: 5 } }));
      return;
    }
    sse(res, [
      ["message_start", { type: "message_start", message }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: block }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } }],
      ["message_stop", { type: "message_stop" }]
    ]);
  });
}).listen(Number(port), "127.0.0.1", () => console.log(`stub ${mode} on ${port}`));
