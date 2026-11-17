import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stdioFramingHint, withStdioFramingHint } from "@llmr/core/mcp/stdio-framing.ts";
import { listMcpServerTools } from "@llmr/core/mcp/tool-discovery.ts";

// Reads newline JSON and skips a line that is not JSON, as the MCP SDKs do.
const newlineOnly = `
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf("\\n");
    if (index < 0) return;
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    const result = message.method === "initialize" ? {} : message.method === "tools/list" ? { tools: [] } : undefined;
    if (result) process.stdout.write(JSON.stringify({ id: message.id, jsonrpc: "2.0", result }) + "\\n");
  }
});
`;

const framedThenStalls = `
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
    if (headerEnd < 0) return;
    const length = Number(/content-length:\\s*(\\d+)/i.exec(buffer.subarray(0, headerEnd).toString("utf8"))?.[1]);
    if (buffer.length < headerEnd + 4 + length) return;
    const message = JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString("utf8"));
    buffer = buffer.subarray(headerEnd + 4 + length);
    if (message.method === "initialize") {
      const text = JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} });
      process.stdout.write("Content-Length: " + Buffer.byteLength(text, "utf8") + "\\r\\n\\r\\n" + text);
    }
  }
});
`;

test("the hint applies only to a content-length server before its handshake", () => {
  assert.equal(withStdioFramingHint("failed.", { stdioMessageMode: "content-length" }, false), `failed. ${stdioFramingHint}`);
  assert.equal(withStdioFramingHint("failed.", { stdioMessageMode: "content-length" }, true), "failed.");
  assert.equal(withStdioFramingHint("failed.", { stdioMessageMode: "newline-json" }, false), "failed.");
  assert.equal(withStdioFramingHint("failed.", {}, false), "failed.");
});

for (const probe of [
  { hint: true, label: "a newline-only server set to content-length times out with the hint", mode: "content-length", pattern: /timed out after 1000 ms\./, script: newlineOnly },
  { hint: false, label: "a silent newline-json server times out without the hint", mode: "newline-json", pattern: /timed out after 1000 ms\./, script: "process.stdin.resume();" },
  { hint: false, label: "a content-length server that stalls after its handshake gets no hint", mode: "content-length", pattern: /timed out after 1000 ms\./, script: framedThenStalls },
  { hint: true, label: "a content-length server that exits before its handshake gets the hint", mode: "content-length", pattern: /exited before tools\/list completed \(3\)/, script: "process.exit(3);" },
  { hint: false, label: "a missing command reports the spawn error without the hint", mode: "content-length", pattern: /ENOENT/ }
]) {
  test(`stdio discovery: ${probe.label}`, async (t) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-stdio-framing-"));
    t.after(() => rmSync(dir, { force: true, recursive: true }));
    const script = path.join(dir, "server.cjs");
    if (probe.script) {
      writeFileSync(script, probe.script);
    }

    await assert.rejects(
      listMcpServerTools({
        args: probe.script ? [script] : [],
        command: probe.script ? process.execPath : "llmr-no-such-command",
        env: {},
        name: "probe",
        requestTimeoutMs: 30000,
        startupTimeoutMs: 1000,
        stdioMessageMode: probe.mode,
        transport: "stdio"
      }),
      (error) => {
        assert.match(error.message, probe.pattern);
        assert.equal(error.message.endsWith(stdioFramingHint), probe.hint, error.message);
        assert.equal(error.message.includes("Content-Length framing"), probe.hint, error.message);
        return true;
      }
    );
  });
}
