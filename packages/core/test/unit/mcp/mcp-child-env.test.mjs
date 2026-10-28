import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { compileCoreGatewayConfig } from "@llmr/core/gateway/core-runtime/config-compiler.ts";
import { withoutLlmrSecretEnv } from "@llmr/core/mcp/child-env.ts";
import { listMcpServerTools } from "@llmr/core/mcp/tool-discovery.ts";

const secretNames = ["CCR_WEB_AUTH_TOKEN", "CCR_CORE_GATEWAY_AUTH_TOKEN", "CCR_REMOTE_SYNC_API_KEY"];

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
    CCR_CORE_GATEWAY_AUTH_TOKEN: "client-keys",
    CCR_REMOTE_SYNC_API_KEY: "sync-key",
    CCR_WEB_AUTH_TOKEN: "web-token",
    TAVILY_API_KEY: "user-key"
  });
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-mcp-env-"));
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
      { headers: {}, name: "remote", transport: "streamable-http", url: "https://mcp.example.com" }
    ]
  };

  const compiled = await compileCoreGatewayConfig(config, "raw-trace-token", "billing-token", "core-token");
  const servers = Object.fromEntries(compiled.agent.mcpServers.map((server) => [server.name, server]));

  assert.deepEqual(servers.user.env, { CCR_CORE_GATEWAY_AUTH_TOKEN: "", TAVILY_API_KEY: "user-key" });
  assert.equal(servers.remote.env, undefined);
});

test("child process env drops LLMR secrets and keeps everything else", () => {
  assert.deepEqual(
    withoutLlmrSecretEnv({
      CCR_CORE_GATEWAY_AUTH_TOKEN: "client-keys",
      CCR_INTERNAL_HOME_DIR: "/home/llmr",
      CCR_SERVICE_INSTANCE_TOKEN: "service",
      CCR_WEB_AUTH_TOKEN: "web-token",
      PATH: "/usr/bin",
      TAVILY_API_KEY: "user-key"
    }),
    { CCR_INTERNAL_HOME_DIR: "/home/llmr", PATH: "/usr/bin", TAVILY_API_KEY: "user-key" }
  );
});
