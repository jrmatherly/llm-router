import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { probeExistingCcrGateway } from "@llmr/core/gateway/existing-gateway-probe.ts";

function probeConfig(host) {
  const config = createDefaultAppConfig();
  config.APIKEY = "legacy-key";
  config.APIKEYS = [
    { createdAt: "", id: "first", key: "first-key", name: "First" },
    { createdAt: "", id: "second", key: "second-key", name: "Second" }
  ];
  config.gateway.host = host;
  config.gateway.port = 3466;
  return config;
}

function withFetch(t, handler) {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ authorization: new Headers(init.headers).get("authorization"), host: url.hostname, path: url.pathname });
    return handler(url);
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  return requests;
}

const llmrHealth = () => Response.json({ core: "http://127.0.0.1:3467", status: "running", timestamp: "2026-01-01T00:00:00.000Z" });

test("existing gateway probe sends nothing to a host that is not this machine", async (t) => {
  const requests = withFetch(t, () => {
    throw new Error("unexpected request");
  });

  const result = await probeExistingCcrGateway(probeConfig("203.0.113.10"));

  assert.equal(result.state, "unavailable");
  assert.deepEqual(requests, []);
});

test("existing gateway probe offers one key to a responder that rejects it", async (t) => {
  const requests = withFetch(t, (url) => url.pathname === "/health"
    ? llmrHealth()
    : Response.json({ error: { message: "Invalid API key" } }, { status: 401 }));

  const result = await probeExistingCcrGateway(probeConfig("127.0.0.1"));

  assert.equal(result.state, "unauthorized");
  assert.equal(result.message, "Invalid API key");
  assert.deepEqual(
    requests.filter((request) => request.authorization).map((request) => request.authorization),
    ["Bearer first-key"]
  );
});

test("existing gateway probe reuses a local gateway that accepts the first key", async (t) => {
  withFetch(t, (url) => url.pathname === "/health" ? llmrHealth() : Response.json({ data: [] }));

  const result = await probeExistingCcrGateway(probeConfig("0.0.0.0"));

  assert.deepEqual(result, { apiKey: "first-key", endpoint: "http://127.0.0.1:3466", state: "usable" });
});

test("existing gateway probe skips an expired first key", async (t) => {
  const requests = withFetch(t, (url) => url.pathname === "/health" ? llmrHealth() : Response.json({ data: [] }));
  const config = probeConfig("127.0.0.1");
  config.APIKEYS[0].expiresAt = "2020-01-01T00:00:00.000Z";

  const result = await probeExistingCcrGateway(config);

  assert.equal(result.state, "usable");
  assert.equal(result.apiKey, "second-key");
  assert.deepEqual(requests.filter((request) => request.authorization).map((request) => request.authorization), ["Bearer second-key"]);
});

test("existing gateway probe sends no key to a health response without the LLMR shape", async (t) => {
  const requests = withFetch(t, (url) => url.pathname === "/health"
    ? Response.json({ core: "x", status: "ok" })
    : Response.json({ name: "something-else" }));

  const result = await probeExistingCcrGateway(probeConfig("localhost"));

  assert.equal(result.state, "not-ccr");
  assert.equal(requests.some((request) => request.authorization), false);
});
