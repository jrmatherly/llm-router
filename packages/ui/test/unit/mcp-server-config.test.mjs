import assert from "node:assert/strict";
import test from "node:test";
import {
  createMcpServerDraft,
  createMcpServerDraftFromConfig,
  createMcpServerDraftFromUnknown,
  mcpServerConfigFromDraft,
  validateMcpServerDraft
} from "@llmr/ui/pages/home/shared/virtual-models.ts";

test("MCP server drafts accept streamablehttp type alias", () => {
  const draft = createMcpServerDraftFromUnknown({
    headers: {
      Authorization: "Bearer YOUR_MCP_TOKEN"
    },
    name: "mcd-mcp",
    type: "streamablehttp",
    url: "https://mcp.mcd.cn"
  });

  assert.equal(draft.transport, "streamable-http");
  assert.equal(validateMcpServerDraft(draft), "");

  const config = mcpServerConfigFromDraft(draft, [], undefined);
  assert.equal(config.transport, "streamable-http");
  assert.equal(config.name, "mcd-mcp");
  assert.equal(config.url, "https://mcp.mcd.cn");
  assert.equal(config.headers.Authorization, "Bearer YOUR_MCP_TOKEN");
});

test("a stdio MCP server draft has no message mode and saves as newline JSON", () => {
  const draft = createMcpServerDraftFromUnknown({ command: "npx", name: "files", stdioMessageMode: "content-length" });
  assert.equal("stdioMessageMode" in draft, false);
  assert.equal("stdioMessageMode" in createMcpServerDraft(), false);
  assert.equal(mcpServerConfigFromDraft(draft, [], undefined).stdioMessageMode, "newline-json");
  // The settings dialog changes only the transport when a remote server becomes a stdio one.
  const remote = createMcpServerDraftFromConfig({ headers: {}, name: "remote", protocolVersion: "2024-11-05", requestTimeoutMs: 30000, startupTimeoutMs: 600000, transport: "streamable-http", url: "https://mcp.example.test" });
  assert.equal("stdioMessageMode" in remote, false);
  assert.equal(mcpServerConfigFromDraft({ ...remote, command: "npx", transport: "stdio" }, [], undefined).stdioMessageMode, "newline-json");
});
