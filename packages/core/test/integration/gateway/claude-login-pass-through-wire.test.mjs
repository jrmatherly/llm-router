import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { gatewayService } from "@llmr/core/gateway/application/gateway-service.ts";
import { reserveLoopbackPort } from "../../support/loopback-listener.mjs";
import { withEnv } from "../../support/with-env.mjs";

const entry = process.env.LLMR_TEST_GATEWAY_ENTRY;
const skip = !entry && "set LLMR_TEST_GATEWAY_ENTRY to the gateway production entry";
const key = "sk-good-key-0001";
const login = "Bearer sk-ant-oat01-FAKE";
const messageReply = JSON.stringify({
  content: [{ text: "ok", type: "text" }],
  id: "msg_1",
  model: "m",
  role: "assistant",
  stop_reason: "end_turn",
  type: "message",
  usage: { input_tokens: 1, output_tokens: 1 }
});
const messageBody = JSON.stringify({ max_tokens: 16, messages: [{ content: "hi", role: "user" }], model: "Provider/native" });

// node:http rather than fetch, which drops a Host header set by the caller.
function send(port, route, { body, headers = {}, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      headers: body === undefined ? headers : { ...headers, "content-length": Buffer.byteLength(body), "content-type": "application/json" },
      host: "127.0.0.1",
      method,
      path: route,
      port
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ body: text, headers: response.headers, status: response.statusCode }));
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

async function startGateway(t, layout, edit) {
  withEnv(t, {
    AUTH_STATIC_API_KEY: "sk-env-key-0003",
    GATEWAY_CORS_ORIGINS: "*",
    LLMR_GATEWAY_ENTRY: entry,
    MANAGER_API_KEY: "abc"
  });
  const service = new gatewayService.constructor();
  const recorded = [];
  const upstream = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      recorded.push({ body, headers: req.headers, method: req.method, url: req.url });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(messageReply);
    });
  });
  t.after(async () => {
    await service.stop();
    if (upstream.listening) await new Promise((resolve) => upstream.close(resolve));
  });
  await new Promise((resolve, reject) => { upstream.once("error", reject); upstream.listen(0, "127.0.0.1", resolve); });
  const publicPort = await reserveLoopbackPort();
  const corePort = layout === "single" ? publicPort : await reserveLoopbackPort();
  const config = createDefaultAppConfig();
  config.Providers = [{ api_base_url: `http://127.0.0.1:${upstream.address().port}`, api_key: "test-provider-secret", id: "provider", models: ["native"], name: "Provider", type: "anthropic_messages" }];
  config.APIKEY = key;
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "good", key }];
  config.gateway = { ...config.gateway, coreHost: "127.0.0.1", corePort, enabled: true, host: "127.0.0.1", port: publicPort };
  if (layout === "compat") config.Router.fallback = { mode: "model-chain", models: ["Provider/native"], retryCount: 0 };
  config.mediaTools.enabled = false;
  config.proxy.enabled = false; config.proxy.captureNetwork = false;
  config.contextArchive.enabled = false;
  config.observability.requestLogs = false; config.observability.requestLogBodyCapture = "none";
  config.profile.enabled = false; config.profile.profiles = [];
  config.plugins = [];
  edit?.(config);
  const started = await service.start(config);
  assert.equal(started.state, "running", started.lastError);
  assert.equal(Boolean(service.server), layout === "compat");
  return { corePort, publicPort, recorded, service };
}

function headerValues(entry) {
  return Object.values(entry.headers).flat().map(String);
}

for (const layout of ["single", "compat"]) {
  test(`a gateway key in x-llmr-api-key is accepted (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const response = await send(gateway.publicPort, "/v1/messages", { body: messageBody, headers: { "x-llmr-api-key": key }, method: "POST" });

    assert.equal(response.status, 200);
    assert.equal(gateway.recorded.length, 1);
    const [seen] = gateway.recorded;
    assert.equal(seen.headers["x-api-key"], "test-provider-secret");
    assert.equal("x-llmr-api-key" in seen.headers, false);
    assert.equal(headerValues(seen).some((value) => value.includes(key)), false);
  });

  test(`a login beside the key does not replace the key (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const response = await send(gateway.publicPort, "/v1/messages", { body: messageBody, headers: { authorization: login, "x-llmr-api-key": key }, method: "POST" });

    assert.equal(response.status, 200);
    assert.equal(gateway.recorded.length, 1);
    assert.equal(headerValues(gateway.recorded[0]).some((value) => value.includes("sk-ant-oat01")), false);
  });

  test(`count_tokens and the model list accept the key beside a login (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const headers = { authorization: login, "x-llmr-api-key": key };
    const before = gateway.recorded.length;
    const count = await send(gateway.publicPort, "/v1/messages/count_tokens", { body: messageBody, headers, method: "POST" });
    const models = await send(gateway.publicPort, "/v1/models", { headers });

    assert.equal(count.status, 200);
    assert.equal(models.status, 200);
    assert.equal(gateway.recorded.length, before);
  });
}
