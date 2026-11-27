import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import { loadAppConfig } from "@llmr/core/config/config.ts";
import { replacePersistedAppConfig, updatePersistedApiKeys } from "@llmr/core/config/config-repository.ts";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { gatewayService } from "@llmr/core/gateway/application/gateway-service.ts";
import { reserveLoopbackPort } from "../../support/loopback-listener.mjs";
import { withEnv } from "../../support/with-env.mjs";

// The price catalogs load in this process. Only the test's own loopback servers answer.
const loopbackFetch = globalThis.fetch;
mock.method(globalThis, "fetch", (input, init) => {
  const { hostname } = new URL(input instanceof Request ? input.url : String(input));
  return ["127.0.0.1", "[::1]", "localhost"].includes(hostname)
    ? loopbackFetch(input, init)
    : Promise.reject(new TypeError(`fetch failed: ${hostname} is outside the test`));
});

const entry = process.env.LLMR_TEST_GATEWAY_ENTRY;
const skip = !entry && "set LLMR_TEST_GATEWAY_ENTRY to the gateway production entry";
const good = { authorization: "Bearer sk-good-key-0001" };

// node:http rather than fetch, which drops a Host header set by the caller.
function send(port, route, { body, headers = {}, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      headers: body === undefined ? headers : { ...headers, "content-length": Buffer.byteLength(body) },
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

async function startGateway(t, layout, edit, { stored = false } = {}) {
  withEnv(t, {
    AUTH_STATIC_API_KEY: "sk-env-key-0003",
    GATEWAY_CORS_ORIGINS: "*",
    LLMR_GATEWAY_ENTRY: entry,
    MANAGER_API_KEY: "abc"
  });
  const service = new gatewayService.constructor();
  const upstream = createServer((req, res) => { req.resume(); res.end("{}"); });
  t.after(async () => {
    await service.stop();
    if (upstream.listening) await new Promise((resolve) => upstream.close(resolve));
  });
  await new Promise((resolve, reject) => { upstream.once("error", reject); upstream.listen(0, "127.0.0.1", resolve); });
  const publicPort = await reserveLoopbackPort();
  const corePort = layout === "single" ? publicPort : await reserveLoopbackPort();
  const config = createDefaultAppConfig();
  config.Providers = [{ api_base_url: `http://127.0.0.1:${upstream.address().port}`, api_key: "test-provider-secret", id: "provider", models: ["native"], name: "Provider", type: "anthropic_messages" }];
  config.APIKEY = "sk-good-key-0001";
  config.APIKEYS = [{ createdAt: new Date(0).toISOString(), id: "good", key: "sk-good-key-0001" }];
  config.gateway = { ...config.gateway, coreHost: "127.0.0.1", corePort, enabled: true, host: "127.0.0.1", port: publicPort };
  if (layout === "compat") config.Router.fallback = { mode: "model-chain", models: ["Provider/native"], retryCount: 0 };
  config.mediaTools.enabled = false;
  config.proxy.enabled = false; config.proxy.captureNetwork = false;
  config.contextArchive.enabled = false;
  config.observability.requestLogs = false; config.observability.requestLogBodyCapture = "none";
  config.profile.enabled = false; config.profile.profiles = [];
  config.plugins = [];
  edit?.(config);
  await updatePersistedApiKeys(() => config.APIKEYS);
  if (stored) await replacePersistedAppConfig({ ...config, APIKEY: "", APIKEYS: [] });
  const startConfig = stored ? await loadAppConfig() : config;
  const started = await service.start(startConfig);
  assert.equal(started.state, "running", started.lastError);
  assert.equal(Boolean(service.server), layout === "compat");
  return { corePort: startConfig.gateway.corePort, publicPort: startConfig.gateway.port, service };
}

for (const layout of ["single", "compat"]) {
  test(`the gateway child serves no manager or agent routes, and LLMR's own front still asks for a key (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const secrets = ["sk-good-key-0001", "test-provider-secret", gateway.service.coreAuthToken];
    const dir = mkdtempSync(path.join(tmpdir(), "llmr-wire-"));
    t.after(() => rmSync(dir, { force: true, recursive: true }));
    const marker = path.join(dir, "ran");
    const modulePath = `${marker}.mjs`;
    writeFileSync(modulePath, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "x"); export default () => ({});`);
    const callers = [
      {},
      good,
      { "x-manager-key": "abc" },
      { host: "evil.example:8080" }
    ];
    for (const port of new Set([gateway.publicPort, gateway.corePort])) {
      const onChild = layout === "single" || port === gateway.corePort;
      for (const route of ["/manager/config", "/manager/plugins", "/manager/providers"]) {
        for (const headers of callers) {
          const response = await send(port, route, { headers });
          // LLMR's own front passes a request with a good key on to the child.
          assert.equal(response.status, onChild || headers === good ? 404 : 401, `${port} ${route}`);
          for (const secret of secrets) assert.equal(response.body.includes(secret), false, `${route} body`);
        }
      }
      for (const headers of callers) {
        const install = await send(port, "/manager/plugins", {
          body: JSON.stringify({ enabled: true, key: "wire", modulePath }),
          headers: { ...headers, "content-type": "application/json" },
          method: "POST"
        });
        assert.equal(install.status, onChild || headers === good ? 404 : 401, `${port} POST /manager/plugins`);
      }
      const write = await send(port, "/manager/config", {
        body: "{}",
        headers: { "content-type": "application/json" },
        method: "PUT"
      });
      assert.equal(write.status, onChild ? 404 : 401);
    }
    assert.equal(existsSync(marker), false);
    for (const route of ["/", "/health", "/ready"]) {
      const response = await send(gateway.corePort, route);
      for (const secret of secrets) assert.equal(response.body.includes(secret), false, `${route} body`);
    }
    for (const headers of [{}, good, { authorization: "Bearer sk-env-key-0003" }]) {
      assert.equal((await send(gateway.corePort, "/agent/sessions", { headers })).status, 404, JSON.stringify(headers));
    }
    assert.equal((await send(gateway.corePort, "/v1/models", { headers: { authorization: "Bearer sk-env-key-0003" } })).status, 401);
  });
}

for (const layout of ["single", "compat"]) {
  test(`a foreign origin gets no CORS grant from the gateway (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout);
    const own = `http://127.0.0.1:${gateway.publicPort}`;
    const allowed = (response) => response.headers["access-control-allow-origin"];
    const foreign = await send(gateway.publicPort, "/v1/models", { headers: { ...good, origin: "https://evil.example" } });
    assert.equal(foreign.status, 200);
    assert.ok([undefined, own].includes(allowed(foreign)), String(allowed(foreign)));
    const same = await send(gateway.publicPort, "/v1/models", { headers: { ...good, origin: own } });
    assert.equal(allowed(same), own);
    const agent = await send(gateway.publicPort, "/v1/models", { headers: good });
    assert.equal(agent.status, 200);
    assert.ok([undefined, own].includes(allowed(agent)), String(allowed(agent)));
    assert.ok(JSON.parse(agent.body).data.some((model) => model.id === "Provider/native"));
    const preflight = await send(gateway.publicPort, "/v1/models", { headers: { "access-control-request-method": "PUT", origin: "https://evil.example" }, method: "OPTIONS" });
    assert.ok([undefined, own].includes(allowed(preflight)), String(allowed(preflight)));
  });
}

test("the gateway child refuses an API key that has expired", { skip, timeout: 60000 }, async (t) => {
  const gateway = await startGateway(t, "single", (config) => {
    config.APIKEYS.unshift({ createdAt: "2020-01-01T00:00:00.000Z", expiresAt: "2020-01-02T00:00:00.000Z", id: "old", key: "sk-expired-key-0002" });
    config.APIKEY = "sk-expired-key-0002";
  });
  const expired = { authorization: "Bearer sk-expired-key-0002" };
  assert.equal((await send(gateway.publicPort, "/v1/models/native", { headers: expired })).status, 401);
  assert.equal((await send(gateway.publicPort, "/v1/models", { headers: expired })).status, 401);
  assert.equal((await send(gateway.publicPort, "/v1/models", { headers: good })).status, 200);
  const core = { authorization: `Bearer ${gateway.service.coreAuthToken}` };
  assert.equal((await send(gateway.publicPort, "/v1/models", { headers: core })).status, 200);
});

for (const layout of ["single", "compat"]) {
  test(`a key another process adds answers 200 and a key it revokes answers 401 without a manual restart (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout, undefined, { stored: true });
    const status = async (key) => {
      try {
        return (await send(gateway.publicPort, "/v1/models", { headers: { authorization: `Bearer ${key}` } })).status;
      } catch {
        return 0;
      }
    };
    assert.equal(await status("sk-good-key-0001"), 200);
    assert.equal(await status("sk-added-key-0004"), 401);
    const firstPid = gateway.service.getStatus().pid;
    await updatePersistedApiKeys(() => [{ createdAt: "2026-01-01T00:00:00.000Z", id: "added", key: "sk-added-key-0004" }]);
    const deadline = Date.now() + 30000;
    // The compat front answers from the stored keys while the child is still restarting, so the restart is over only once the state says so.
    while (Date.now() < deadline && !(gateway.service.getStatus().state === "running" && await status("sk-added-key-0004") === 200 && await status("sk-good-key-0001") === 401)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(await status("sk-added-key-0004"), 200);
    assert.equal(await status("sk-good-key-0001"), 401);
    const secondPid = gateway.service.getStatus().pid;
    assert.notEqual(secondPid, firstPid);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    assert.equal(gateway.service.getStatus().pid, secondPid);
    assert.equal(gateway.service.getStatus().state, "running");
  });
}
