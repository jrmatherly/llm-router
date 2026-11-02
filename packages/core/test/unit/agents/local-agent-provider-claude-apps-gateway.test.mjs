import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claudeAppsGatewayCandidateId,
  claudeAppsGatewayCandidates,
  importClaudeAppsGatewayProvider
} from "@llmr/core/agents/local-providers/claude-apps-gateway.ts";
import { claudeAppsGatewaySessionFile, persistClaudeAppsGatewaySession } from "@llmr/core/agents/claude-apps-gateway/session-store.ts";

test("no sessions means no candidates", (t) => {
  assert.deepEqual(claudeAppsGatewayCandidates(tempConfigDir(t)), []);
});

test("a stored session becomes an importable candidate and a bearer provider", async (t) => {
  const configDir = tempConfigDir(t);
  const gateway = await fakeGateway(t);
  persistClaudeAppsGatewaySession(session(configDir, gateway.url, { models: ["claude-sonnet-4-6"] }));

  const [candidate] = claudeAppsGatewayCandidates(configDir);
  assert.equal(candidate.kind, "claude-apps-gateway");
  assert.equal(candidate.id, `claude-apps-gateway:127.0.0.1-${gateway.port}`);
  assert.equal(candidate.id, claudeAppsGatewayCandidateId(gateway.url));
  assert.equal(candidate.name, `Claude apps gateway (127.0.0.1:${gateway.port})`);
  assert.equal(candidate.protocol, "anthropic_messages");
  assert.equal(candidate.importable, true);
  assert.equal(candidate.status, "available");
  assert.deepEqual(candidate.models, ["claude-sonnet-4-6"]);

  const result = await importClaudeAppsGatewayProvider(candidate, [], configDir);
  assert.equal(result.provider.baseUrl, gateway.url);
  assert.equal(result.provider.apiKey, "llmr-local-agent-login");
  assert.equal(result.provider.name, candidate.name);
  assert.deepEqual(result.provider.models, ["claude-sonnet-4-6", "claude-opus-4-6"]);
  assert.deepEqual(result.provider.modelDisplayNames, { "claude-opus-4-6": "Claude Opus 4.6" });
  assert.equal(result.providerPlugins.length, 2);
  assert.equal(result.providerPlugins[0].key, "llmr-local-agent-__LLMR_PROVIDER_NAME_SLUG__-claude-apps-gateway-oauth");
  assert.equal(result.providerPlugins[1].key, "llmr-local-agent-__LLMR_PROVIDER_NAME_SLUG__-claude-apps-gateway-oauth-internal");
  assert.equal(result.providerPlugins[1].providerName, "__LLMR_PROVIDER_INTERNAL_NAME__");
  assert.deepEqual(result.providerPlugins[0].claudeAppsGateway, { url: gateway.url });
  assert.deepEqual(result.providerPlugins[1].claudeAppsGateway, { url: gateway.url });
  assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer tok");
});

test("import falls back to the stored models when the live list fails", async (t) => {
  const configDir = tempConfigDir(t);
  const gateway = await fakeGateway(t, { modelsStatus: 500 });
  persistClaudeAppsGatewaySession(session(configDir, gateway.url, { models: ["claude-haiku-4-5"] }));

  const [candidate] = claudeAppsGatewayCandidates(configDir);
  const result = await importClaudeAppsGatewayProvider(candidate, [candidate.name], configDir);
  assert.deepEqual(result.provider.models, ["claude-haiku-4-5"]);
  assert.equal(result.provider.name, `${candidate.name} 2`);
});

test("an expired session without a refresh token is locked", (t) => {
  const configDir = tempConfigDir(t);
  persistClaudeAppsGatewaySession(session(configDir, "https://gw.example.com", { expiresAt: 1 }));

  const [candidate] = claudeAppsGatewayCandidates(configDir);
  assert.equal(candidate.importable, false);
  assert.equal(candidate.status, "locked");
  assert.match(candidate.detail, /sign in again/i);
});

test("an expired session with a refresh token stays importable", (t) => {
  const configDir = tempConfigDir(t);
  persistClaudeAppsGatewaySession(session(configDir, "https://gw.example.com", { expiresAt: 1, refreshToken: "ref" }));

  assert.equal(claudeAppsGatewayCandidates(configDir)[0].importable, true);
});

test("two gateways give two candidates", (t) => {
  const configDir = tempConfigDir(t);
  persistClaudeAppsGatewaySession(session(configDir, "https://a.example.com"));
  persistClaudeAppsGatewaySession(session(configDir, "https://b.example.com:8443"));

  assert.deepEqual(claudeAppsGatewayCandidates(configDir).map((candidate) => candidate.id), [
    "claude-apps-gateway:a.example.com",
    "claude-apps-gateway:b.example.com-8443"
  ]);
});

function tempConfigDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-cag-provider-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  return dir;
}

function session(configDir, gatewayUrl, fields = {}) {
  return {
    accessToken: "tok",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    gatewayUrl,
    models: ["claude-sonnet-4-6"],
    sourceFile: claudeAppsGatewaySessionFile(gatewayUrl, configDir),
    ...fields
  };
}

async function fakeGateway(t, options = {}) {
  const server = createServer((request, response) => {
    if (request.url === "/v1/models" && request.headers.authorization === "Bearer tok" && !options.modelsStatus) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "claude-sonnet-4-6" }, { display_name: "Claude Opus 4.6", id: "claude-opus-4-6" }] }));
      return;
    }
    response.writeHead(options.modelsStatus ?? 404);
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  return { port, url: `http://127.0.0.1:${port}` };
}
