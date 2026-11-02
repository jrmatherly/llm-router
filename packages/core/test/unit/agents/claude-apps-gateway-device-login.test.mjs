import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cancelClaudeAppsGatewayLogin,
  startClaudeAppsGatewayLogin,
  waitClaudeAppsGatewayLogin
} from "@llmr/core/agents/claude-apps-gateway/device-login-service.ts";
import { claudeAppsGatewaySessionFile, readClaudeAppsGatewaySession } from "@llmr/core/agents/claude-apps-gateway/session-store.ts";

const deviceGrant = "urn:ietf:params:oauth:grant-type:device_code";

test("start validates the URL before any request", async (t) => {
  const gateway = await fakeGateway(t);
  await assert.rejects(startClaudeAppsGatewayLogin({ gatewayUrl: "http://gw.example.com" }), /https/);
  await assert.rejects(startClaudeAppsGatewayLogin({ gatewayUrl: "ftp://127.0.0.1" }), /https/);
  assert.equal(gateway.requests.length, 0);
});

test("start rejects a host whose discovery document lacks the device-code grant", async (t) => {
  const gateway = await fakeGateway(t, { grants: ["authorization_code"] });
  await assert.rejects(startClaudeAppsGatewayLogin({ gatewayUrl: gateway.url }, { configDir: tempConfigDir(t) }), /not a Claude apps gateway/);
  assert.deepEqual(gateway.requests.map((request) => request.url), ["/.well-known/oauth-authorization-server"]);
});

test("start rejects a verification link that is not https or loopback", async (t) => {
  const gateway = await fakeGateway(t, { verificationUriComplete: "http://evil.example.com/device" });
  await assert.rejects(startClaudeAppsGatewayLogin({ gatewayUrl: gateway.url }, { configDir: tempConfigDir(t) }), /https/);
});

test("start returns the device code prompt", async (t) => {
  const gateway = await fakeGateway(t);
  const start = await startClaudeAppsGatewayLogin({ gatewayUrl: `${gateway.url}/ignored/path` }, { configDir: tempConfigDir(t) });
  t.after(() => cancelClaudeAppsGatewayLogin({ sessionId: start.sessionId }));
  assert.equal(start.userCode, "WDJB-MJHT");
  assert.equal(start.gatewayUrl, gateway.url);
  assert.equal(start.intervalSeconds, 0);
  assert.equal(start.verificationUri, `${gateway.url}/device`);
  assert.match(start.verificationUriComplete, /user_code=WDJB-MJHT/);
  assert.ok(Date.parse(start.expiresAt) > Date.now());
  assert.ok(start.sessionId);
});

test("start ignores endpoint URLs in the discovery document", async (t) => {
  const configDir = tempConfigDir(t);
  const gateway = await fakeGateway(t, {
    discoveryEndpoint: "http://127.0.0.1:1/elsewhere",
    token: () => [200, { access_token: "tok", expires_in: 3600, refresh_token: "ref", token_type: "Bearer" }]
  });
  const start = await startClaudeAppsGatewayLogin({ gatewayUrl: gateway.url }, { configDir });
  const result = await waitClaudeAppsGatewayLogin({ sessionId: start.sessionId, timeoutMs: 5000 });
  assert.equal(result.status, "confirmed");
  assert.ok(gateway.requests.some((request) => request.url === "/oauth/device_authorization"));
});

test("wait polls through pending and slow_down, then persists the session", { timeout: 10_000 }, async (t) => {
  const configDir = tempConfigDir(t);
  const replies = [
    [400, { error: "authorization_pending" }],
    [400, { error: "slow_down" }],
    [200, { access_token: "tok", email: "dev@example.com", expires_in: 3600, refresh_token: "ref", token_type: "Bearer" }]
  ];
  const tokenBodies = [];
  let slowDownAt = 0;
  let slowDownGapMs = 0;
  const gateway = await fakeGateway(t, {
    token: (body) => {
      tokenBodies.push(body);
      if (slowDownAt) slowDownGapMs = Date.now() - slowDownAt;
      const reply = replies.shift();
      if (reply[1].error === "slow_down") slowDownAt = Date.now();
      return reply;
    }
  });
  const start = await startClaudeAppsGatewayLogin({ gatewayUrl: gateway.url }, { configDir });

  const result = await waitClaudeAppsGatewayLogin({ sessionId: start.sessionId, timeoutMs: 20000 });
  assert.equal(result.status, "confirmed");
  assert.equal(result.confirmed, true);
  assert.equal(result.email, "dev@example.com");
  assert.equal(result.gatewayUrl, gateway.url);
  assert.deepEqual(result.models, ["claude-sonnet-4-6"]);
  assert.ok(slowDownGapMs >= 5000 - 50, `slow_down gap was ${slowDownGapMs}ms`);
  assert.equal(tokenBodies[0], `grant_type=${encodeURIComponent(deviceGrant)}&device_code=dc-1`);
  assert.ok(existsSync(claudeAppsGatewaySessionFile(gateway.url, configDir)));
  const stored = readClaudeAppsGatewaySession(gateway.url, configDir);
  assert.equal(stored?.accessToken, "tok");
  assert.equal(stored?.refreshToken, "ref");
  assert.deepEqual(stored?.modelDisplayNames, { "claude-sonnet-4-6": "Claude Sonnet 4.6" });
  assert.equal((await waitClaudeAppsGatewayLogin({ sessionId: start.sessionId })).status, "canceled");
});

test("wait returns pending at timeoutMs and keeps the login alive", async (t) => {
  const gateway = await fakeGateway(t, { interval: 1, token: () => [400, { error: "authorization_pending" }] });
  const start = await startClaudeAppsGatewayLogin({ gatewayUrl: gateway.url }, { configDir: tempConfigDir(t) });
  t.after(() => cancelClaudeAppsGatewayLogin({ sessionId: start.sessionId }));

  const startedAt = Date.now();
  const first = await waitClaudeAppsGatewayLogin({ sessionId: start.sessionId, timeoutMs: 300 });
  assert.equal(first.status, "pending");
  assert.equal(first.confirmed, false);
  assert.ok(Date.now() - startedAt < 900);
  assert.equal((await waitClaudeAppsGatewayLogin({ sessionId: start.sessionId, timeoutMs: 100 })).status, "pending");
});

test("expired_token and access_denied end the login", async (t) => {
  const gateway = await fakeGateway(t, {
    token: (body) => body.endsWith("dc-1") ? [400, { error: "expired_token" }] : [400, { error: "access_denied" }]
  });
  const configDir = tempConfigDir(t);
  const expired = await startClaudeAppsGatewayLogin({ gatewayUrl: gateway.url }, { configDir });
  const denied = await startClaudeAppsGatewayLogin({ gatewayUrl: gateway.url }, { configDir });

  assert.equal((await waitClaudeAppsGatewayLogin({ sessionId: expired.sessionId })).status, "expired");
  assert.equal((await waitClaudeAppsGatewayLogin({ sessionId: denied.sessionId })).status, "denied");
  for (const sessionId of [expired.sessionId, denied.sessionId]) {
    const later = await waitClaudeAppsGatewayLogin({ sessionId });
    assert.equal(later.status, "canceled");
    assert.match(later.message, /not found or was canceled/);
  }
  assert.equal(existsSync(claudeAppsGatewaySessionFile(gateway.url, configDir)), false);
});

test("a 5xx poll keeps the login alive and a model-list failure still saves the session", async (t) => {
  const configDir = tempConfigDir(t);
  const replies = [
    [503, { error: "unavailable" }],
    [200, { access_token: "no-models", expires_in: 3600, refresh_token: "ref", token_type: "Bearer" }]
  ];
  const gateway = await fakeGateway(t, { token: () => replies.shift() });
  const start = await startClaudeAppsGatewayLogin({ gatewayUrl: gateway.url }, { configDir });

  const result = await waitClaudeAppsGatewayLogin({ sessionId: start.sessionId, timeoutMs: 5000 });
  assert.equal(result.status, "confirmed");
  assert.deepEqual(result.models, []);
  assert.equal(readClaudeAppsGatewaySession(gateway.url, configDir)?.accessToken, "no-models");
});

test("cancel drops a pending login", async (t) => {
  const gateway = await fakeGateway(t, { token: () => [400, { error: "authorization_pending" }] });
  const start = await startClaudeAppsGatewayLogin({ gatewayUrl: gateway.url }, { configDir: tempConfigDir(t) });
  assert.deepEqual(cancelClaudeAppsGatewayLogin({ sessionId: start.sessionId }), { canceled: true });
  assert.deepEqual(cancelClaudeAppsGatewayLogin({ sessionId: start.sessionId }), { canceled: false });
  assert.equal((await waitClaudeAppsGatewayLogin({ sessionId: start.sessionId })).status, "canceled");
});

function tempConfigDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-cag-login-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  return dir;
}

async function fakeGateway(t, options = {}) {
  const requests = [];
  let deviceCodes = 0;
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({ body, url: request.url });
      const url = `http://127.0.0.1:${server.address().port}`;
      if (request.url === "/.well-known/oauth-authorization-server") {
        const endpoint = options.discoveryEndpoint ?? url;
        return json(response, 200, {
          device_authorization_endpoint: `${endpoint}/oauth/device_authorization`,
          grant_types_supported: options.grants ?? [deviceGrant, "refresh_token"],
          issuer: url,
          token_endpoint: `${endpoint}/oauth/token`
        });
      }
      if (request.url === "/oauth/device_authorization" && request.method === "POST") {
        deviceCodes += 1;
        return json(response, 200, {
          device_code: `dc-${deviceCodes}`,
          expires_in: 600,
          interval: options.interval ?? 0,
          user_code: "WDJB-MJHT",
          verification_uri: `${url}/device`,
          verification_uri_complete: options.verificationUriComplete ?? `${url}/device?user_code=WDJB-MJHT`
        });
      }
      if (request.url === "/oauth/token" && request.method === "POST" && options.token) {
        const [status, payload] = options.token(body);
        return json(response, status, payload);
      }
      if (request.url === "/v1/models" && request.headers.authorization === "Bearer tok") {
        return json(response, 200, { data: [{ display_name: "Claude Sonnet 4.6", id: "claude-sonnet-4-6" }] });
      }
      json(response, 404, { error: "not_found" });
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
