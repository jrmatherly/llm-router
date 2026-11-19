import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CLAUDE_CODE_MCP_CONFIG_ENV,
  claudeCodeHomeEnv,
  claudeCodeMcpConfigEnv
} from "@llmr/core/agents/claude-code/environment.ts";
import { toolHubClaudeCodeMcpConfig } from "@llmr/core/mcp/toolhub-config.ts";

test("a Claude Code profile on the default ~/.claude exports no CLAUDE_CONFIG_DIR; any other home exports its own", () => {
  const defaultSettings = path.join(os.homedir(), ".claude", "settings.json");
  const customSettings = path.join(os.homedir(), ".claude-work", "settings.json");
  const generatedSettings = path.join(os.homedir(), "llmr", "profiles", "claude-main", "claude", "settings.json");
  const global = { agent: "claude-code", scope: "global" };
  const generated = { agent: "claude-code", scope: "llmr" };

  assert.deepEqual(claudeCodeHomeEnv(global, defaultSettings), {});
  assert.deepEqual(claudeCodeHomeEnv({ ...global, claudeCodeSharedHome: true }, defaultSettings), {});
  assert.deepEqual(claudeCodeHomeEnv(global, customSettings), { CLAUDE_CONFIG_DIR: path.dirname(customSettings) });
  assert.deepEqual(claudeCodeHomeEnv(generated, generatedSettings), { CLAUDE_CONFIG_DIR: path.dirname(generatedSettings) });
  assert.deepEqual(claudeCodeHomeEnv({ ...generated, claudeCodeSharedHome: true }, generatedSettings), { LLMR_CLAUDE_CODE_SETTINGS_FILE: generatedSettings });
});

test("exports Claude Code MCP config path env for wrapper injection", () => {
  assert.deepEqual(claudeCodeMcpConfigEnv("/tmp/toolhub-mcp.json"), {
    [CLAUDE_CODE_MCP_CONFIG_ENV]: "/tmp/toolhub-mcp.json"
  });
  assert.deepEqual(claudeCodeMcpConfigEnv(undefined), {});
});

test("builds Claude Code ToolHub MCP config when ToolHub has backend MCP servers", () => {
  const config = toolHubClaudeCodeMcpConfig({
    agent: {
      mcpServers: []
    },
    toolHub: {
      enabled: true,
      llm: {
        apiKey: "resolver-key",
        baseUrl: "https://resolver.example/v1",
        model: "resolver-model"
      },
      maxTools: 10,
      mcpServers: [
        {
          headers: { Authorization: "Bearer token" },
          name: "mcd-mcp",
          transport: "streamable-http",
          url: "https://mcp.mcd.cn"
        }
      ],
      requestTimeoutMs: 60000
    }
  }, {
    command: "/Applications/LLMR.app/Contents/MacOS/LLMR",
    entryPath: "/Applications/LLMR.app/Contents/Resources/app/dist/main/toolhub-mcp.js"
  });

  assert.equal(Object.keys(config.mcpServers).length, 1);
  const server = config.mcpServers["llmr-toolhub"];
  assert.equal(server.command, "/Applications/LLMR.app/Contents/MacOS/LLMR");
  assert.deepEqual(server.args, ["/Applications/LLMR.app/Contents/Resources/app/dist/main/toolhub-mcp.js"]);
  assert.equal(server.env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(server.env.TOOLHUB_OPENAI_MODEL, "resolver-model");
  assert.equal(server.env.TOOLHUB_MAX_TOOLS, "10");
  assert.equal(server.env.TOOLHUB_REQUEST_TIMEOUT_MS, "60000");
  assert.deepEqual(JSON.parse(server.env.TOOLHUB_MCP_SERVERS_JSON), [
    {
      headers: { Authorization: "Bearer token" },
      name: "mcd-mcp",
      transport: "streamable-http",
      url: "https://mcp.mcd.cn"
    }
  ]);
});

test("does not build Claude Code ToolHub MCP config without enabled backend servers", () => {
  assert.equal(toolHubClaudeCodeMcpConfig({
    agent: {
      mcpServers: []
    },
    toolHub: {
      enabled: true,
      mcpServers: []
    }
  }), undefined);
  assert.equal(toolHubClaudeCodeMcpConfig({
    agent: {
      mcpServers: []
    },
    toolHub: {
      enabled: false,
      mcpServers: [
        {
          command: "node",
          name: "server",
          transport: "stdio"
        }
      ]
    }
  }), undefined);
});
