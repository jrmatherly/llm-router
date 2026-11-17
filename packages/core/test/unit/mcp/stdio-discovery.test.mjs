import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listMcpServerTools } from "@llmr/core/mcp/tool-discovery.ts";

for (const probe of [
  { label: "a silent server times out", pattern: /timed out after 1000 ms\./, script: "process.stdin.resume();" },
  { label: "a server that exits before its handshake reports the exit code", pattern: /exited before tools\/list completed \(3\)/, script: "process.exit(3);" },
  { label: "a missing command reports the spawn error", pattern: /ENOENT/ }
]) {
  test(`stdio discovery: ${probe.label}`, async (t) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-stdio-discovery-"));
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
        stdioMessageMode: "newline-json",
        transport: "stdio"
      }),
      probe.pattern
    );
  });
}

// Answers initialize after closing its own stdin, so the client's next write hits a closed pipe.
const closesStdinAfterHandshake = `
const fs = require("node:fs");
const chunk = Buffer.alloc(65536);
const length = fs.readSync(0, chunk);
const message = JSON.parse(chunk.subarray(0, length).toString("utf8").split("\\n")[0]);
fs.closeSync(0);
process.stdout.write(JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }) + "\\n");
setInterval(() => {}, 1000);
`;

test("stdio discovery: a write to a server that closed its stdin rejects and does not crash the process", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-stdio-discovery-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const script = path.join(dir, "server.cjs");
  writeFileSync(script, closesStdinAfterHandshake);

  await assert.rejects(
    listMcpServerTools({ args: [script], command: process.execPath, env: {}, name: "probe", startupTimeoutMs: 3000, transport: "stdio" }),
    /EPIPE/
  );
});
