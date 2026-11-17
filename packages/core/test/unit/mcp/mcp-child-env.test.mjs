import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { replacePersistedAppConfig } from "@llmr/core/config/config-repository.ts";
import { loadAppConfig } from "@llmr/core/config/config.ts";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@llmr/core/gateway/core-runtime/config-compiler.ts";
import { withoutLlmrSecretEnv } from "@llmr/core/mcp/child-env.ts";
import { listMcpServerTools } from "@llmr/core/mcp/tool-discovery.ts";

const secretNames = ["LLMR_WEB_AUTH_TOKEN", "LLMR_CORE_GATEWAY_AUTH_TOKEN", "LLMR_REMOTE_SYNC_API_KEY"];

function withEnv(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });
}

// A stdio MCP server that reports which of the watched variables it can see as tool names.
const envProbeServer = `
const names = ${JSON.stringify([...secretNames, "TAVILY_API_KEY", "SERVER_ONLY"])};
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\\n")) >= 0) {
    const message = JSON.parse(buffer.slice(0, newline));
    buffer = buffer.slice(newline + 1);
    if (message.id === undefined) continue;
    const result = message.method === "tools/list"
      ? { tools: names.filter((name) => process.env[name]).map((name) => ({ inputSchema: { type: "object" }, name })) }
      : { capabilities: {}, protocolVersion: "2024-11-05", serverInfo: { name: "env-probe", version: "1" } };
    process.stdout.write(JSON.stringify({ id: message.id, jsonrpc: "2.0", result }) + "\\n");
  }
});
`;

test("stdio MCP discovery does not pass LLMR secrets to the server process", async (t) => {
  withEnv(t, {
    LLMR_CORE_GATEWAY_AUTH_TOKEN: "client-keys",
    LLMR_REMOTE_SYNC_API_KEY: "sync-key",
    LLMR_WEB_AUTH_TOKEN: "web-token",
    TAVILY_API_KEY: "user-key"
  });
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-mcp-env-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const script = path.join(dir, "server.cjs");
  writeFileSync(script, envProbeServer);

  const tools = await listMcpServerTools({
    args: [script],
    command: process.execPath,
    env: { SERVER_ONLY: "1" },
    name: "env-probe",
    stdioMessageMode: "newline-json",
    transport: "stdio"
  });

  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["SERVER_ONLY", "TAVILY_API_KEY"]);
});

test("compiled stdio MCP servers hide the core runtime's client API keys", async () => {
  const config = createDefaultAppConfig();
  config.toolHub = { ...config.toolHub, enabled: false };
  config.agent = {
    ...config.agent,
    mcpServers: [
      { args: [], command: "user-mcp", env: { TAVILY_API_KEY: "user-key" }, name: "user", transport: "stdio" },
      { args: [], command: "lsp-style", name: "framed", stdioMessageMode: "content-length", transport: "stdio" },
      { headers: {}, name: "remote", transport: "streamable-http", url: "https://mcp.example.com" }
    ]
  };

  const compiled = await compileCoreGatewayConfig(config, "raw-trace-token", "billing-token", "core-token");
  const servers = Object.fromEntries(compiled.agent.mcpServers.map((server) => [server.name, server]));

  assert.deepEqual(servers.user.env, { LLMR_CORE_GATEWAY_AUTH_TOKEN: "", TAVILY_API_KEY: "user-key" });
  assert.equal(servers.remote.env, undefined);
  assert.equal(servers.user.stdioMessageMode, "newline-json");
  assert.equal(servers.framed.stdioMessageMode, "newline-json");
  assert.equal(servers.remote.stdioMessageMode, undefined);
});

test("a saved stdio MCP server loads as newline JSON whatever mode it was saved with and is discoverable", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-mcp-mode-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const script = path.join(dir, "server.cjs");
  writeFileSync(script, envProbeServer);

  const current = await loadAppConfig();
  await replacePersistedAppConfig({
    ...current,
    agent: {
      ...current.agent,
      mcpServers: [
        { args: [script], command: process.execPath, env: { SERVER_ONLY: "1" }, name: "plain", transport: "stdio" },
        { args: [script], command: process.execPath, env: { SERVER_ONLY: "1" }, name: "framed", stdioMessageMode: "content-length", transport: "stdio" }
      ]
    }
  });
  const servers = Object.fromEntries((await loadAppConfig()).agent.mcpServers.map((server) => [server.name, server]));

  assert.equal(servers.plain.stdioMessageMode, "newline-json");
  assert.equal(servers.framed.stdioMessageMode, "newline-json");
  // The probe reads newline JSON only, so it answers only if discovery ignores a stale content-length mode.
  assert.deepEqual((await listMcpServerTools(servers.plain)).map((tool) => tool.name), ["SERVER_ONLY"]);
  assert.deepEqual((await listMcpServerTools({ ...servers.framed, startupTimeoutMs: 2000, stdioMessageMode: "content-length" })).map((tool) => tool.name), ["SERVER_ONLY"]);
});

test("child process env drops LLMR secrets and keeps everything else", () => {
  assert.deepEqual(
    withoutLlmrSecretEnv({
      LLMR_CORE_GATEWAY_AUTH_TOKEN: "client-keys",
      LLMR_INTERNAL_HOME_DIR: "/home/llmr",
      LLMR_SERVICE_INSTANCE_TOKEN: "service",
      LLMR_WEB_AUTH_TOKEN: "web-token",
      PATH: "/usr/bin",
      TAVILY_API_KEY: "user-key"
    }),
    { LLMR_INTERNAL_HOME_DIR: "/home/llmr", PATH: "/usr/bin", TAVILY_API_KEY: "user-key" }
  );
});
