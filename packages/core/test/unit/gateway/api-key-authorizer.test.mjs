import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { authorize, exchangeClaudeCodeWifToken } from "@llmr/core/gateway/auth/api-key-authorizer.ts";

const authorizerSourceFile = path.join(
  process.cwd(),
  "packages",
  "core",
  "src",
  "gateway",
  "auth",
  "api-key-authorizer.ts"
);
const gatewayApiKey = "llmr-3f8a1c7d9e2b4056a1c7d9e2b4056f8a";

function configWithApiKeys(apiKeys) {
  const config = createDefaultAppConfig();
  config.APIKEYS = apiKeys;
  return config;
}

function createResponse() {
  const response = {
    payload: undefined,
    statusCode: undefined,
    end(chunk) {
      response.payload = JSON.parse(String(chunk));
    },
    writeHead(statusCode) {
      response.statusCode = statusCode;
    }
  };
  return response;
}

async function authorizeRequest(config, request) {
  const response = createResponse();
  const result = await authorize({ headers: {}, url: "/v1/messages", ...request }, response, config);
  return { response, result };
}

test("gateway authorization accepts the configured API key on every supported carrier", async () => {
  const config = configWithApiKeys([
    { createdAt: new Date(0).toISOString(), id: "primary", key: gatewayApiKey }
  ]);

  for (const request of [
    { headers: { authorization: `Bearer ${gatewayApiKey}` } },
    { headers: { "x-api-key": gatewayApiKey } },
    { headers: { "api-key": gatewayApiKey } },
    { headers: { "x-goog-api-key": gatewayApiKey } },
    { headers: { "x-mcp-key": gatewayApiKey } },
    { headers: { "x-codex-access-token": gatewayApiKey } },
    { url: `/__llmr/remote/status?api_key=${gatewayApiKey}` }
  ]) {
    const { response, result } = await authorizeRequest(config, request);

    assert.equal(result.ok, true);
    assert.equal(result.apiKey.id, "primary");
    assert.equal(response.statusCode, undefined);
  }
});

test("gateway authorization rejects near-miss tokens of any length without throwing", async () => {
  const config = configWithApiKeys([
    { createdAt: new Date(0).toISOString(), id: "primary", key: gatewayApiKey }
  ]);

  for (const token of [
    `X${gatewayApiKey.slice(1)}`,
    `${gatewayApiKey.slice(0, -1)}b`,
    gatewayApiKey.toUpperCase(),
    gatewayApiKey.slice(0, -1),
    `${gatewayApiKey}-extra`
  ]) {
    const { response, result } = await authorizeRequest(config, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(result.ok, false);
    assert.equal(response.statusCode, 401);
    assert.equal(response.payload.error.message, "Invalid API key.");
  }
});

test("gateway authorization separates a missing token from an expired key", async () => {
  const config = configWithApiKeys([
    {
      createdAt: new Date(0).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      id: "expired",
      key: gatewayApiKey
    }
  ]);

  const missing = await authorizeRequest(config, {});
  assert.equal(missing.result.ok, false);
  assert.equal(missing.response.statusCode, 401);
  assert.equal(missing.response.payload.error.message, "API key is missing.");

  const expired = await authorizeRequest(config, {
    headers: { authorization: `Bearer ${gatewayApiKey}` }
  });
  assert.equal(expired.result.ok, false);
  assert.equal(expired.response.statusCode, 401);
  assert.equal(expired.response.payload.error.message, "API key is expired.");
});

test("Claude Code WIF token exchange returns a bearer token for a configured profile key", async () => {
  const config = configWithApiKeys([
    { createdAt: new Date(0).toISOString(), id: "profile:claude", key: gatewayApiKey }
  ]);

  const result = await exchangeClaudeCodeWifToken(config, Buffer.from(JSON.stringify({
    assertion: gatewayApiKey,
    federation_rule_id: "llmr-local",
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    organization_id: "llmr-local"
  })));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload, {
    access_token: gatewayApiKey,
    expires_in: 3600,
    token_type: "Bearer"
  });
});

test("Claude Code WIF token exchange rejects invalid assertions", async () => {
  const config = configWithApiKeys([
    { createdAt: new Date(0).toISOString(), id: "profile:claude", key: gatewayApiKey }
  ]);

  const result = await exchangeClaudeCodeWifToken(config, Buffer.from(new URLSearchParams({
    assertion: `${gatewayApiKey}-wrong`,
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer"
  }).toString()));

  assert.equal(result.statusCode, 401);
  assert.equal(result.payload.error, "invalid_grant");
});

// A constant-time comparison is behaviour-preserving by construction, so the
// tests above pass on both sides of the change and only prove there is no
// regression. The invariant itself is asserted on the module source, the same
// way test/architecture/gateway-service-architecture.test.mjs asserts that the
// config compiler never reaches for node:fs.
test("gateway API key matching never uses a short-circuiting equality check", () => {
  const source = readFileSync(authorizerSourceFile, "utf8");

  assert.match(source, /from "node:crypto"/);
  assert.match(source, /timingSafeEqual\(/);
  assert.doesNotMatch(source, /\.key\s*===/);
});

test("invalid tokens load persisted keys at most once per cache window", async (t) => {
  const { configRepository } = await import("@llmr/core/config/config-repository.ts");
  let loads = 0;
  t.mock.method(configRepository, "listApiKeys", async () => {
    loads += 1;
    return [];
  });
  const config = configWithApiKeys([{ createdAt: new Date(0).toISOString(), id: "k1", key: "sk-right" }]);
  for (let i = 0; i < 10; i++) {
    const { response } = await authorizeRequest(config, { headers: { authorization: `Bearer sk-wrong-${i}` } });
    assert.equal(response.statusCode, 401);
  }
  assert.ok(loads <= 1, `listApiKeys ran ${loads} times`);
});

test("a key persisted after a miss is accepted once the cache expires", async (t) => {
  const { configRepository } = await import("@llmr/core/config/config-repository.ts");
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 5000 });
  const persisted = [];
  t.mock.method(configRepository, "listApiKeys", async () => [...persisted]);
  const config = configWithApiKeys([{ createdAt: new Date(0).toISOString(), id: "k1", key: "sk-other" }]);
  const request = { headers: { authorization: "Bearer sk-new" } };
  assert.equal((await authorizeRequest(config, request)).response.statusCode, 401);
  persisted.push({ createdAt: new Date(0).toISOString(), id: "k2", key: "sk-new" });
  t.mock.timers.tick(1001);
  assert.equal((await authorizeRequest(config, request)).result.ok, true);
});
