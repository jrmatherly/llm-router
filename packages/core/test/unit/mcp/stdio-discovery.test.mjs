import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listMcpServerTools, mcpDiscoveryMaxTimeoutMs } from "@llmr/core/mcp/tool-discovery.ts";
import { npmNodeShim } from "../../support/windows-command-cases.mjs";

for (const probe of [
  { label: "a silent server times out at its own startup timeout", pattern: /timed out after 1000 ms\.$/, script: "process.stdin.resume();" },
  { label: "a timeout reports what the server wrote to stderr", pattern: /timed out after 1000 ms\. cannot parse header/, script: 'process.stderr.write("cannot parse header\\n"); process.stdin.resume();' },
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

test("stdio discovery: gives up at its own ceiling, before the server's startup timeout", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-stdio-discovery-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const script = path.join(dir, "server.cjs");
  writeFileSync(script, "process.stdin.resume();");

  await assert.rejects(
    listMcpServerTools(
      { args: [script], command: process.execPath, env: {}, name: "probe", startupTimeoutMs: 3000, stdioMessageMode: "newline-json", transport: "stdio" },
      { maxTimeoutMs: 1000 }
    ),
    /timed out after 1000 ms\. Tool discovery waits no longer than this for a stdio server, whatever its startup timeout\.$/
  );
});

test("stdio discovery: the default ceiling is one minute", () => {
  assert.equal(mcpDiscoveryMaxTimeoutMs, 60000);
});

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
    // Windows reports no error to a writer whose child closed its stdin, so the request ends at its timeout there.
    process.platform === "win32" ? /timed out/ : /EPIPE/
  );
});

test("a stdio server named by a command on the path is started", { skip: process.platform !== "win32" }, async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-stdio-discovery-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  mkdirSync(path.join(dir, "node_modules", "fake-mcp"), { recursive: true });
  copyFileSync(path.resolve("packages/core/test/support/stub-mcp-server.mjs"), path.join(dir, "node_modules", "fake-mcp", "server.mjs"));
  writeFileSync(path.join(dir, "fake-mcp.cmd"), npmNodeShim("node_modules\\fake-mcp\\server.mjs"));

  const tools = await listMcpServerTools({
    args: [],
    command: "fake-mcp",
    env: { Path: `${dir};${process.env.PATH ?? ""}` },
    name: "fake",
    stdioMessageMode: "newline-json",
    transport: "stdio"
  });

  assert.deepEqual(tools.map((tool) => tool.name), ["stub_tool"]);
});

test("a line break for a batch-file stdio server rejects the discovery, under a stubbed platform", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-stdio-discovery-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const file = path.join(dir, "hand.cmd");
  writeFileSync(file, "@echo off\r\n");
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32" });
  t.after(() => Object.defineProperty(process, "platform", platform));

  await assert.rejects(
    listMcpServerTools({ args: ["line1\nline2"], command: file, env: {}, name: "fake", stdioMessageMode: "newline-json", transport: "stdio" }),
    /line break/
  );
});
