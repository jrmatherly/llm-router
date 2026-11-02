import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ClaudeAppsGatewayAuthError,
  claudeAppsGatewaySessionFile,
  claudeAppsGatewaySlug,
  fetchClaudeAppsGatewayModels,
  listClaudeAppsGatewaySessions,
  normalizeClaudeAppsGatewayUrl,
  persistClaudeAppsGatewaySession,
  readClaudeAppsGatewaySession,
  refreshClaudeAppsGatewaySession,
  removeClaudeAppsGatewaySession,
  resolveClaudeAppsGatewaySession
} from "@llmr/core/agents/claude-apps-gateway/session-store.ts";

test("gateway URLs normalize to an origin and refuse plain http off loopback", () => {
  assert.equal(normalizeClaudeAppsGatewayUrl("https://gw.example.com/some/path?x=1"), "https://gw.example.com");
  assert.equal(normalizeClaudeAppsGatewayUrl("http://127.0.0.1:18080/"), "http://127.0.0.1:18080");
  assert.equal(normalizeClaudeAppsGatewayUrl("http://[::1]:18080"), "http://[::1]:18080");
  assert.throws(() => normalizeClaudeAppsGatewayUrl("http://gw.example.com"), /https/);
  assert.throws(() => normalizeClaudeAppsGatewayUrl("ftp://gw.example.com"), /http/);
  assert.throws(() => normalizeClaudeAppsGatewayUrl("not a url"), /https/);
  assert.equal(claudeAppsGatewaySlug("https://GW.Example.com:8443"), "gw.example.com-8443");
});

test("sessions persist with mode 0600 and list per host", (t) => {
  const configDir = tempConfigDir(t);
  const second = session(configDir, "https://b.example.com", { accessToken: "b" });
  const first = session(configDir, "https://a.example.com:8443", { accessToken: "a", email: "dev@example.com", modelDisplayNames: { "claude-sonnet-4-6": "Claude Sonnet 4.6" } });
  persistClaudeAppsGatewaySession(second);
  persistClaudeAppsGatewaySession(first);

  assert.equal(statSync(first.sourceFile).mode & 0o777, 0o600);
  assert.equal(path.basename(first.sourceFile), "a.example.com-8443.json");
  assert.deepEqual(listClaudeAppsGatewaySessions(configDir).map((item) => item.gatewayUrl), ["https://a.example.com:8443", "https://b.example.com"]);
  assert.deepEqual(readClaudeAppsGatewaySession("https://a.example.com:8443", configDir), first);
  assert.equal(JSON.parse(readFileSync(first.sourceFile, "utf8")).access_token, "a");

  writeFileSync(path.join(configDir, "claude-apps-gateway", "broken.json"), "{");
  assert.equal(listClaudeAppsGatewaySessions(configDir).length, 2);

  removeClaudeAppsGatewaySession("https://a.example.com:8443", configDir);
  assert.equal(existsSync(first.sourceFile), false);
  assert.equal(readClaudeAppsGatewaySession("https://a.example.com:8443", configDir), undefined);
});

test("expired sessions refresh and persist the new tokens", async (t) => {
  const configDir = tempConfigDir(t);
  const gateway = await fakeGateway(t, async (request, response, body) => {
    assert.equal(request.url, "/oauth/token");
    assert.equal(request.headers["content-type"], "application/x-www-form-urlencoded");
    assert.equal(body, "grant_type=refresh_token&refresh_token=old");
    json(response, 200, { access_token: "new", expires_in: 3600, token_type: "Bearer" });
  });
  persistClaudeAppsGatewaySession(session(configDir, gateway.url, { accessToken: "stale", expiresAt: 1, refreshToken: "old" }));

  const resolved = await resolveClaudeAppsGatewaySession(gateway.url, configDir);
  assert.equal(resolved?.accessToken, "new");
  assert.equal(resolved?.refreshToken, "old");
  assert.ok((resolved?.expiresAt ?? 0) > Date.now() / 1000 + 3000);
  assert.equal(readClaudeAppsGatewaySession(gateway.url, configDir)?.accessToken, "new");
});

test("a valid session resolves without a refresh", async (t) => {
  const configDir = tempConfigDir(t);
  const gateway = await fakeGateway(t, async (_request, response) => json(response, 500, {}));
  persistClaudeAppsGatewaySession(session(configDir, gateway.url, { accessToken: "valid", refreshToken: "old" }));

  assert.equal((await resolveClaudeAppsGatewaySession(gateway.url, configDir))?.accessToken, "valid");
  assert.equal(gateway.requests.length, 0);
});

test("a 401 on refresh is an auth error and leaves the file in place", async (t) => {
  const configDir = tempConfigDir(t);
  const gateway = await fakeGateway(t, async (_request, response) => json(response, 401, { error: "invalid_grant" }));
  const stored = session(configDir, gateway.url, { accessToken: "stale", expiresAt: 1, refreshToken: "old" });
  persistClaudeAppsGatewaySession(stored);

  await assert.rejects(refreshClaudeAppsGatewaySession(stored), ClaudeAppsGatewayAuthError);
  await assert.rejects(resolveClaudeAppsGatewaySession(gateway.url, configDir), ClaudeAppsGatewayAuthError);
  assert.ok(existsSync(stored.sourceFile));
});

test("a 5xx on refresh is a plain error", async (t) => {
  const configDir = tempConfigDir(t);
  const gateway = await fakeGateway(t, async (_request, response) => json(response, 503, { error: "unavailable" }));
  const stored = session(configDir, gateway.url, { accessToken: "stale", expiresAt: 1, refreshToken: "old" });

  await assert.rejects(refreshClaudeAppsGatewaySession(stored), (error) => !(error instanceof ClaudeAppsGatewayAuthError) && /503/.test(error.message));
});

test("concurrent resolves share one refresh", async (t) => {
  const configDir = tempConfigDir(t);
  const gateway = await fakeGateway(t, async (_request, response) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    json(response, 200, { access_token: `fresh-${gateway.requests.length}`, expires_in: 3600, refresh_token: "rotated" });
  });
  persistClaudeAppsGatewaySession(session(configDir, gateway.url, { accessToken: "stale", expiresAt: 1, refreshToken: "old" }));

  const results = await Promise.all(Array.from({ length: 5 }, () => resolveClaudeAppsGatewaySession(gateway.url, configDir)));
  assert.equal(gateway.requests.length, 1);
  assert.deepEqual(results.map((item) => item?.accessToken), Array(5).fill("fresh-1"));
});

test("a 401 adopts a newer refresh token another process already wrote", async (t) => {
  const configDir = tempConfigDir(t);
  let stored;
  const gateway = await fakeGateway(t, async (_request, response) => {
    persistClaudeAppsGatewaySession({ ...stored, accessToken: "peer-access", expiresAt: Math.floor(Date.now() / 1000) + 3600, refreshToken: "peer" });
    json(response, 401, { error: "invalid_grant" });
  });
  stored = session(configDir, gateway.url, { accessToken: "stale", expiresAt: 1, refreshToken: "old" });
  persistClaudeAppsGatewaySession(stored);

  const resolved = await resolveClaudeAppsGatewaySession(gateway.url, configDir);
  assert.equal(resolved?.accessToken, "peer-access");
  assert.equal(resolved?.refreshToken, "peer");
});

test("models come from /v1/models with display names", async (t) => {
  const configDir = tempConfigDir(t);
  const gateway = await fakeGateway(t, async (request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/v1/models");
    assert.equal(request.headers.authorization, "Bearer tok");
    json(response, 200, { data: [{ display_name: "Claude Sonnet 4.6", id: "claude-sonnet-4-6" }, { id: "claude-haiku-4-5" }] });
  });

  const result = await fetchClaudeAppsGatewayModels(session(configDir, gateway.url, { accessToken: "tok" }));
  assert.deepEqual(result, {
    modelDisplayNames: { "claude-sonnet-4-6": "Claude Sonnet 4.6" },
    models: ["claude-sonnet-4-6", "claude-haiku-4-5"]
  });
});

function tempConfigDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-cag-store-"));
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

async function fakeGateway(t, handler) {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({ body, url: request.url });
      Promise.resolve(handler(request, response, body)).catch((error) => {
        response.writeHead(599);
        response.end(String(error));
      });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { requests, url: `http://127.0.0.1:${server.address().port}` };
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
