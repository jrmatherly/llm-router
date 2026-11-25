import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { reserveLoopbackPort } from "../../support/loopback-listener.mjs";
import { removeTestDir, testTempRoot } from "../../support/test-temp-dir.mjs";

const previousRuntimeEnv = {
  appData: process.env.LLMR_INTERNAL_APP_DATA_DIR,
  home: process.env.LLMR_INTERNAL_HOME_DIR,
  userData: process.env.LLMR_INTERNAL_USER_DATA_DIR
};
const runtimeRoot = mkdtempSync(path.join(testTempRoot, "llmr-web-management-test-"));
process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(runtimeRoot, "app-data");
process.env.LLMR_INTERNAL_HOME_DIR = path.join(runtimeRoot, "home");
process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(runtimeRoot, "user-data");

after(() => {
  setOptionalEnv("LLMR_INTERNAL_APP_DATA_DIR", previousRuntimeEnv.appData);
  setOptionalEnv("LLMR_INTERNAL_HOME_DIR", previousRuntimeEnv.home);
  setOptionalEnv("LLMR_INTERNAL_USER_DATA_DIR", previousRuntimeEnv.userData);
  removeTestDir(runtimeRoot, ["config.sqlite"]);
});

test("normalizeExternalHttpTarget accepts absolute http, https, and LLMR plugin URLs only", async () => {
  const { normalizeExternalHttpTarget } = await import("@llmr/core/web/management-server.ts");
  assert.equal(normalizeExternalHttpTarget(""), undefined);
  assert.equal(normalizeExternalHttpTarget(undefined), undefined);
  assert.equal(normalizeExternalHttpTarget("about:blank"), undefined);
  assert.equal(normalizeExternalHttpTarget(" https://example.com/path?q=1 "), "https://example.com/path?q=1");
  assert.equal(normalizeExternalHttpTarget("http://localhost:3458/"), "http://localhost:3458/");
  assert.throws(() => normalizeExternalHttpTarget("file:///etc/passwd"), /Only http, https, and LLMR plugin URLs/);
  assert.throws(() => normalizeExternalHttpTarget("javascript:alert(1)"), /Only http, https, and LLMR plugin URLs/);
  assert.throws(() => normalizeExternalHttpTarget("example.com"), /valid absolute URL/);
});

test("the runtime keeps the token out of its URL", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const authToken = "test-web-auth-token-0123456789abcdef";
  const runtime = await startWebManagementServer({ authToken, host: "127.0.0.1", port: 0, startGateway: false });
  try {
    assert.equal(new URL(runtime.url).search, "");
    assert.equal(new URL(runtime.url).hash, "");
    assert.equal(runtime.authToken, authToken);
    assert.equal(runtime.tokenGenerated, false);
    assert.equal(runtime.openUrl, runtime.url, "a supplied token is not put in any URL");
  } finally {
    await runtime.close();
  }
});

test("a generated token is offered once, in the fragment, and survives escaping", async (t) => {
  const previous = process.env.LLMR_WEB_AUTH_TOKEN;
  t.after(() => setOptionalEnv("LLMR_WEB_AUTH_TOKEN", previous));
  delete process.env.LLMR_WEB_AUTH_TOKEN;
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const runtime = await startWebManagementServer({ host: "127.0.0.1", port: 0, startGateway: false });
  try {
    assert.equal(runtime.tokenGenerated, true);
    assert.equal(new URL(runtime.openUrl).search, "");
    assert.equal(decodeURIComponent(new URL(runtime.openUrl).hash.slice("#llmr_web_token=".length)), runtime.authToken);
  } finally {
    await runtime.close();
  }
});

test("a supplied token is never part of what LLMR prints, a generated one is", async () => {
  const { describeWebManagementUrl } = await import("@llmr/core/web/management-server.ts");
  const url = "http://127.0.0.1:3458/";
  const openUrl = `${url}#llmr_web_token=secret-value`;
  assert.equal(describeWebManagementUrl({ openUrl: url, tokenGenerated: false, url }), `${url} (sign in with your LLMR_WEB_AUTH_TOKEN)`);
  assert.equal(describeWebManagementUrl({ openUrl, tokenGenerated: true, url }), openUrl);
});

test("a token set in the environment must be at least 32 characters", async (t) => {
  const previous = process.env.LLMR_WEB_AUTH_TOKEN;
  t.after(() => setOptionalEnv("LLMR_WEB_AUTH_TOKEN", previous));
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  process.env.LLMR_WEB_AUTH_TOKEN = "short-token";
  await assert.rejects(startWebManagementServer({ host: "127.0.0.1", port: 0, startGateway: false }), /LLMR_WEB_AUTH_TOKEN must be at least 32 characters.*openssl rand -base64 32/);
});

test("the token is gone from the environment once the server has read it", async (t) => {
  const previous = process.env.LLMR_WEB_AUTH_TOKEN;
  t.after(() => setOptionalEnv("LLMR_WEB_AUTH_TOKEN", previous));
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  process.env.LLMR_WEB_AUTH_TOKEN = "test-web-auth-token-0123456789abcdef";
  const runtime = await startWebManagementServer({ host: "127.0.0.1", port: 0, startGateway: false });
  try {
    assert.equal(process.env.LLMR_WEB_AUTH_TOKEN, undefined);
    assert.equal(runtime.authToken, "test-web-auth-token-0123456789abcdef");
    assert.equal(runtime.tokenGenerated, false);
  } finally {
    await runtime.close();
  }
});

test("a non-loopback bind needs an explicit opt-in", async (t) => {
  const previous = process.env.LLMR_WEB_ALLOW_REMOTE;
  t.after(() => setOptionalEnv("LLMR_WEB_ALLOW_REMOTE", previous));
  delete process.env.LLMR_WEB_ALLOW_REMOTE;
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const authToken = "test-web-auth-token-0123456789abcdef";
  for (const host of ["0.0.0.0", "192.0.2.1", "127.0.0.2"]) {
    await assert.rejects(startWebManagementServer({ authToken, host, port: 0, startGateway: false }), /--allow-remote/, host);
  }
  for (const host of ["127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]"]) {
    const runtime = await startWebManagementServer({ authToken, host, port: 0, startGateway: false });
    await runtime.close();
  }
  const remote = await startWebManagementServer({ allowRemote: true, authToken, host: "0.0.0.0", port: 0, startGateway: false });
  await remote.close();
  process.env.LLMR_WEB_ALLOW_REMOTE = "true";
  await assert.rejects(startWebManagementServer({ authToken, host: "0.0.0.0", port: 0, startGateway: false }), /--allow-remote/, "only 1 opts in");
  process.env.LLMR_WEB_ALLOW_REMOTE = "1";
  const optedIn = await startWebManagementServer({ authToken, host: "0.0.0.0", port: 0, startGateway: false });
  await optedIn.close();
});

test("every response forbids framing and sends no referrer", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const authToken = "test-web-auth-token-0123456789abcdef";
  const runtime = await startWebManagementServer({ authToken, host: "127.0.0.1", port: 0, startGateway: false });
  try {
    const endpoint = new URL("/api/llmr/rpc", runtime.url);
    const body = JSON.stringify({ args: [], method: "getAppInfo" });
    const responses = {
      "GET /": await fetch(runtime.url),
      "RPC 200": await fetch(endpoint, { body, headers: { "content-type": "application/json", "x-llmr-web-auth": authToken }, method: "POST" }),
      "RPC 401": await fetch(endpoint, { body, headers: { "content-type": "application/json" }, method: "POST" }),
      "OPTIONS 204": await fetch(endpoint, { headers: { origin: "http://127.0.0.1:8000" }, method: "OPTIONS" })
    };
    assert.deepEqual(Object.values(responses).map((response) => response.status).slice(1), [200, 401, 204]);
    for (const [name, response] of Object.entries(responses)) {
      assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/, name);
      assert.equal(response.headers.get("referrer-policy"), "same-origin", name);
      assert.equal(response.headers.get("x-frame-options"), "DENY", name);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", name);
    }
  } finally {
    await runtime.close();
  }
});

test("resolveRendererRoot falls back to the app resources when the CLI runs from a copy outside the app", async () => {
  const { resolveRendererRoot } = await import("@llmr/core/web/management-server.ts");
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-renderer-root-test-"));
  try {
    const copiedCliDir = path.join(root, "home", ".llm-router", "bin");
    const resourcesPath = path.join(root, "LLM Router.app", "Contents", "Resources");
    const bundledRenderer = path.join(resourcesPath, "app.asar", "dist", "renderer");
    mkdirSync(path.join(bundledRenderer, "pages", "home"), { recursive: true });
    writeFileSync(path.join(bundledRenderer, "pages", "home", "index.html"), "<html></html>");

    assert.equal(resolveRendererRoot(copiedCliDir, resourcesPath), bundledRenderer);
    assert.equal(resolveRendererRoot(copiedCliDir, undefined), path.resolve(copiedCliDir, "..", "renderer"));

    const besideCli = path.join(root, "dist", "renderer");
    mkdirSync(path.join(besideCli, "pages", "home"), { recursive: true });
    writeFileSync(path.join(besideCli, "pages", "home", "index.html"), "<html></html>");
    assert.equal(resolveRendererRoot(path.join(root, "dist", "main"), resourcesPath), besideCli, "a renderer beside the CLI wins");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("#1835 web RPC rejects hostile browser sources even with a valid token", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const runtime = await startWebManagementServer({ authToken: "source-test", host: "127.0.0.1", port: 0, startGateway: false });
  try {
    for (const [headers, rejected] of [
      [{ origin: "https://evil.example" }, "https://evil.example"],
      [{ referer: "https://evil.example/page" }, "https://evil.example/page"],
      [{ origin: "null" }, "null"],
      [{ origin: "file://localhost" }, "file://localhost"],
      [{ origin: "http://127.0.0.1:8000", referer: "https://evil.example/page" }, "https://evil.example/page"],
      [{ referer: "not a url" }, "not a url"]
    ]) {
      const response = await fetch(new URL("/api/llmr/rpc", runtime.url), {
        body: JSON.stringify({ args: [], method: "getAppInfo" }),
        headers: { "content-type": "application/json", "x-llmr-web-auth": "source-test", ...headers },
        method: "POST"
      });
      assert.equal(response.status, 403, JSON.stringify(headers));
      const payload = await response.json();
      assert.equal(payload.ok, false);
      assert.ok(payload.error.message.includes(rejected), payload.error.message);
      assert.match(payload.error.message, /LLMR_PUBLIC_BASE_URL/);
    }
    const trustedReferer = await fetch(new URL("/api/llmr/rpc", runtime.url), {
      body: JSON.stringify({ args: [], method: "getAppInfo" }),
      headers: { "content-type": "application/json", "x-llmr-web-auth": "source-test", referer: "http://127.0.0.1:8000/page" },
      method: "POST"
    });
    assert.equal(trustedReferer.status, 200);
  } finally {
    await runtime.close();
  }
});

test("#1835 browser origins support explicit public URLs and allowlists", async (t) => {
  const previousPublic = process.env.LLMR_PUBLIC_BASE_URL;
  const previousAllowed = process.env.LLMR_WEB_ALLOWED_ORIGINS;
  process.env.LLMR_PUBLIC_BASE_URL = "https://llmr.example.com/";
  process.env.LLMR_WEB_ALLOWED_ORIGINS = "https://tools.example.com, http://192.168.1.20:3458";
  t.after(() => {
    setOptionalEnv("LLMR_PUBLIC_BASE_URL", previousPublic);
    setOptionalEnv("LLMR_WEB_ALLOWED_ORIGINS", previousAllowed);
  });
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const runtime = await startWebManagementServer({ authToken: "remote-test", host: "127.0.0.1", port: 0, startGateway: false });
  try {
    for (const origin of ["https://llmr.example.com", "https://tools.example.com", "http://192.168.1.20:3458"]) {
      const response = await fetch(new URL("/api/llmr/rpc", runtime.url), {
        body: JSON.stringify({ args: [], method: "getAppInfo" }),
        headers: { "content-type": "application/json", "x-llmr-web-auth": "remote-test", origin, referer: `${origin}/page` },
        method: "POST"
      });
      assert.equal(response.status, 200, origin);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
    }
    for (const origin of ["https://tools.example.com", "http://127.0.0.1:8000"]) {
      const preflight = await fetch(new URL("/api/llmr/rpc", runtime.url), { headers: { origin }, method: "OPTIONS" });
      assert.equal(preflight.status, 204, origin);
      assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    }
    const denied = await fetch(new URL("/api/llmr/rpc", runtime.url), { headers: { origin: "https://evil.example" }, method: "OPTIONS" });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  } finally {
    await runtime.close();
  }
});

test("#1835 a wildcard bind trusts a browser on the server's own address and port only", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const runtime = await startWebManagementServer({ allowRemote: true, authToken: "lan-test", host: "0.0.0.0", port: 0, startGateway: false });
  try {
    const port = runtime.server.address().port;
    const statusFor = async (origin) => (await fetch(`http://127.0.0.1:${port}/api/llmr/rpc`, {
      body: JSON.stringify({ args: [], method: "getAppInfo" }),
      headers: { "content-type": "application/json", "x-llmr-web-auth": "lan-test", origin },
      method: "POST"
    })).status;
    assert.equal(await statusFor(`http://192.0.2.1:${port}`), 200);
    assert.equal(await statusFor(`https://192.0.2.1:${port}`), 403);
    assert.equal(await statusFor(`http://192.0.2.1:${port + 1}`), 403);
    assert.equal(await statusFor(`http://lan.example:${port}`), 403);
  } finally {
    await runtime.close();
  }
});

test("web RPC accepts loopback tools with a valid auth token", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const authToken = "test-web-auth-token";
  const runtime = await startWebManagementServer({
    authToken,
    host: "127.0.0.1",
    port: 0,
    startGateway: false
  });
  try {
    const endpoint = new URL("/api/llmr/rpc", runtime.url);
    const response = await fetch(endpoint, {
      body: JSON.stringify({ args: [], method: "getAppInfo" }),
      headers: {
        "content-type": "application/json",
        "origin": "http://127.0.0.1:8000",
        "referer": "http://127.0.0.1:8000/",
        "x-llmr-web-auth": authToken
      },
      method: "POST"
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.value.name, "LLM Router");
  } finally {
    await runtime.close();
  }
});

test("#1835 getConfig and saveConfig redact provider credentials without overwriting them", async (t) => {
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");
  const { gatewayService } = await import("@llmr/core/gateway/service.ts");
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const secrets = /first-secret|second-secret|header-secret|credential-secret/;
  const config = await loadAppConfig();
  config.Providers = [
    {
      api_base_url: "http://127.0.0.1:9/v1",
      api_key: "first-secret",
      credentials: [{ api_key: "credential-secret", id: "credential" }],
      extraHeaders: { Authorization: "Bearer header-secret", "x-visible": "visible" },
      id: "first",
      models: ["alpha"],
      name: "First",
      type: "openai_chat_completions"
    },
    { api_base_url: "http://127.0.0.1:9/v1", api_key: "second-secret", id: "second", models: ["beta"], name: "Second", type: "openai_chat_completions" }
  ];
  await saveAppConfig(config);
  const status = gatewayService.getStatus();
  t.mock.method(gatewayService, "start", async () => status);
  t.mock.method(gatewayService, "updateConfig", async () => status);
  const token = "redaction-test";
  const runtime = await startWebManagementServer({ authToken: token, host: "127.0.0.1", port: 0, startGateway: false });
  const stored = async (id) => (await loadAppConfig()).Providers.find((provider) => provider.id === id);
  try {
    let current = (await rpc(runtime.url, token, "getConfig")).value;
    assert.doesNotMatch(JSON.stringify(current), secrets);
    assert.equal(current.Providers[0].extraHeaders["x-visible"], "visible");

    const misplaced = await fetch(new URL("/api/llmr/rpc", runtime.url), {
      body: JSON.stringify({ args: [{ apiKey: current.Providers[0].api_key, baseUrl: "http://127.0.0.1:9/v1" }], method: "getProviderCatalogModels" }),
      headers: { "content-type": "application/json", "x-llmr-web-auth": token },
      method: "POST"
    });
    assert.equal(misplaced.status, 500, "only a config or a probe may carry a reference");

    current.toolHub = { ...current.toolHub, llm: { ...current.toolHub?.llm, apiKey: current.Providers[0].api_key } };
    current.Providers.reverse();
    current.Providers[1].name = "Renamed";
    const saved = await rpc(runtime.url, token, "saveConfig", [current, { applyProfile: false }]);
    assert.equal(saved.ok, true);
    assert.doesNotMatch(JSON.stringify(saved.value), secrets);
    assert.equal((await stored("first")).api_key, "first-secret");
    assert.equal((await stored("first")).name, "Renamed");
    assert.equal((await stored("first")).extraHeaders.Authorization, "Bearer header-secret");
    assert.equal((await stored("first")).credentials[0].api_key, "credential-secret");
    assert.equal((await stored("second")).api_key, "second-secret");
    assert.equal((await loadAppConfig()).toolHub.llm.apiKey, "first-secret", "a key the UI copied into Tool Hub is restored");
    assert.equal(saved.value.toolHub.llm.apiKey, saved.value.Providers.find((provider) => provider.id === "first").api_key);

    const stale = await fetch(new URL("/api/llmr/rpc", runtime.url), {
      body: JSON.stringify({ args: [current, { applyProfile: false }], method: "saveConfig" }),
      headers: { "content-type": "application/json", "x-llmr-web-auth": token },
      method: "POST"
    });
    assert.equal(stale.status, 409, "restoring masks must keep config conflict detection");

    current = saved.value;
    current.Providers[1].api_key = "replacement-secret";
    current = (await rpc(runtime.url, token, "saveConfig", [current, { applyProfile: false }])).value;
    assert.doesNotMatch(JSON.stringify(current), /replacement-secret/);
    assert.equal((await stored("first")).api_key, "replacement-secret");

    current.Providers[1].api_key = "";
    await rpc(runtime.url, token, "saveConfig", [current, { applyProfile: false }]);
    assert.equal((await stored("first")).api_key ?? "", "");
  } finally {
    await runtime.close();
  }
});

test("#1835 a probe from the web UI reaches the provider with the saved key", async (t) => {
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");
  const { gatewayService } = await import("@llmr/core/gateway/service.ts");
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const seen = [];
  const provider = createServer((request, response) => {
    seen.push(`${request.headers.authorization ?? ""} ${request.headers["x-api-key"] ?? ""}`);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "alpha", object: "model" }], object: "list" }));
  });
  await listen(provider, 0);
  const baseUrl = `http://127.0.0.1:${provider.address().port}/v1`;
  const config = await loadAppConfig();
  config.Providers = [{ api_base_url: baseUrl, api_key: "probe-secret", id: "probe", models: ["alpha"], name: "Probe", type: "openai_chat_completions" }];
  await saveAppConfig(config);
  const status = gatewayService.getStatus();
  t.mock.method(gatewayService, "start", async () => status);
  t.mock.method(gatewayService, "updateConfig", async () => status);
  const token = "probe-test";
  const runtime = await startWebManagementServer({ authToken: token, host: "127.0.0.1", port: 0, startGateway: false });
  try {
    const reference = (await rpc(runtime.url, token, "getConfig")).value.Providers[0].api_key;
    assert.doesNotMatch(reference, /probe-secret/);
    await rpc(runtime.url, token, "probeProvider", [{ apiKey: reference, baseUrl, mode: "models" }]);
    assert.ok(seen.length > 0, "the probe reached the provider");
    assert.ok(seen.some((headers) => headers.includes("probe-secret")), seen.join(" | "));
    assert.ok(!seen.some((headers) => headers.includes("REDACTED")), "the reference text is never sent upstream");
  } finally {
    await runtime.close();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("web RPC routes the Claude apps gateway login triplet", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const authToken = "test-web-auth-token";
  const runtime = await startWebManagementServer({ authToken, host: "127.0.0.1", port: 0, startGateway: false });
  try {
    const payload = await rpc(runtime.url, authToken, "cancelClaudeAppsGatewayLogin", [{ sessionId: "nope" }]);
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.value, { canceled: false });
    const wait = await rpc(runtime.url, authToken, "waitClaudeAppsGatewayLogin", [{ sessionId: "nope", timeoutMs: 10 }]);
    assert.equal(wait.value.status, "canceled");
  } finally {
    await runtime.close();
  }
});

test("startGateway reuses an already healthy LLMR gateway on the configured port", async () => {
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");
  const { gatewayRuntimeConfigRevision } = await import("@llmr/core/gateway/runtime-config-control.ts");
  const { gatewayService } = await import("@llmr/core/gateway/service.ts");
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  await gatewayService.stop();
  const gatewayPort = await reserveLoopbackPort();
  const webAuthToken = "test-web-auth-token";
  const config = await loadAppConfig();
  config.gateway.port = gatewayPort;
  config.gateway.corePort = await reserveLoopbackPort();
  config.Providers = [{
    api_base_url: "http://127.0.0.1:9/v1",
    api_key: "test-provider-key",
    id: "test-provider",
    models: ["test-model"],
    name: "Test Provider",
    type: "openai_chat_completions"
  }];
  const savedConfig = await saveAppConfig(config);
  const externalGatewayState = {
    reloadRequests: [],
    revision: gatewayRuntimeConfigRevision(savedConfig)
  };
  const externalGateway = createHealthyLlmrGateway(savedConfig.APIKEY, externalGatewayState);
  await listen(externalGateway, gatewayPort);
  const runtime = await startWebManagementServer({
    authToken: webAuthToken,
    host: "127.0.0.1",
    port: 0,
    startGateway: false
  });
  const originalStart = gatewayService.start;
  let managedStarts = 0;
  gatewayService.start = async function (...args) {
    managedStarts += 1;
    return originalStart.apply(this, args);
  };

  try {
    const payload = await rpc(runtime.url, webAuthToken, "startGateway");

    assert.equal(payload.ok, true);
    assert.equal(payload.value.state, "running", payload.value.lastError);
    assert.equal(payload.value.endpoint, `http://127.0.0.1:${gatewayPort}`);
    assert.equal(payload.value.gatewayManagedExternally, true);
    assert.equal(gatewayService.getStatus().state, "running");
    assert.equal(gatewayService.getStatus().gatewayManagedExternally, true);
    assert.equal(managedStarts, 0, "existing gateways should be adopted without spawning a competing runtime");

    const secondStart = await rpc(runtime.url, webAuthToken, "startGateway");
    assert.equal(secondStart.ok, true);
    assert.equal(secondStart.value.endpoint, `http://127.0.0.1:${gatewayPort}`);
    assert.equal(secondStart.value.gatewayManagedExternally, true);
    assert.equal(managedStarts, 0);

    const nextConfig = structuredClone(savedConfig);
    nextConfig.Providers[0].name = "Updated Test Provider";
    const reloadCountBeforeSave = externalGatewayState.reloadRequests.length;
    const saveResult = await rpc(runtime.url, webAuthToken, "saveConfig", [nextConfig, { applyProfile: false }]);
    assert.equal(saveResult.ok, true);
    assert.equal(externalGatewayState.reloadRequests.length, reloadCountBeforeSave + 1);
    assert.equal(externalGatewayState.reloadRequests.at(-1).forceRestart, true);
    assert.equal(externalGatewayState.revision, gatewayRuntimeConfigRevision(await loadAppConfig()));
    assert.equal(gatewayService.getStatus().gatewayManagedExternally, true);
  } finally {
    gatewayService.start = originalStart;
    await runtime.close();
    await gatewayService.stop();
    await closeServer(externalGateway);
  }
});

test("startGateway does not adopt a running gateway from an older version", async () => {
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");
  const { gatewayRuntimeConfigRevision } = await import("@llmr/core/gateway/runtime-config-control.ts");
  const { gatewayService } = await import("@llmr/core/gateway/service.ts");
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  await gatewayService.stop();
  const gatewayPort = await reserveLoopbackPort();
  const webAuthToken = "test-web-auth-token";
  const config = await loadAppConfig();
  config.gateway.port = gatewayPort;
  config.gateway.corePort = await reserveLoopbackPort();
  config.Providers = [{
    api_base_url: "http://127.0.0.1:9/v1",
    api_key: "test-provider-key",
    id: "test-provider",
    models: ["test-model"],
    name: "Test Provider",
    type: "openai_chat_completions"
  }];
  const savedConfig = await saveAppConfig(config);
  const externalGatewayState = {
    managerStatus: 200,
    reloadRequests: [],
    revision: gatewayRuntimeConfigRevision(savedConfig)
  };
  const externalGateway = createHealthyLlmrGateway(savedConfig.APIKEY, externalGatewayState);
  await listen(externalGateway, gatewayPort);
  const runtime = await startWebManagementServer({
    authToken: webAuthToken,
    host: "127.0.0.1",
    port: 0,
    startGateway: false
  });
  const originalStart = gatewayService.start;
  let managedStarts = 0;
  gatewayService.start = async function (...args) {
    managedStarts += 1;
    return originalStart.apply(this, args);
  };

  try {
    const payload = await rpc(runtime.url, webAuthToken, "startGateway");

    assert.equal(payload.ok, true);
    assert.equal(payload.value.state, "error");
    assert.equal(payload.value.lastError, `A running LLM Router gateway from an older version holds http://127.0.0.1:${gatewayPort}. Quit it, then start LLM Router again.`);
    assert.equal(payload.value.endpoint, `http://127.0.0.1:${gatewayPort}`);
    assert.equal(payload.value.gatewayManagedExternally, undefined);
    assert.equal(managedStarts, 0);
    assert.deepEqual(externalGatewayState.reloadRequests, []);

    externalGatewayState.managerStatus = undefined;
    const adopted = await rpc(runtime.url, webAuthToken, "startGateway");
    assert.equal(adopted.value.state, "running", adopted.value.lastError);
    assert.equal(adopted.value.gatewayManagedExternally, true);

    externalGatewayState.managerStatus = 200;
    const refusedAgain = await rpc(runtime.url, webAuthToken, "startGateway");
    assert.equal(refusedAgain.value.state, "error");
    assert.equal(refusedAgain.value.lastError, payload.value.lastError);
    assert.equal(refusedAgain.value.gatewayManagedExternally, undefined);
    assert.equal(managedStarts, 0);
  } finally {
    gatewayService.start = originalStart;
    await runtime.close();
    await gatewayService.stop();
    await closeServer(externalGateway);
  }
});

test("closing the web service releases the Claude Code takeover when no gateway still serves", async (t) => {
  const { runtime, settingsFile } = await startWithStubbedGateway(t, await reserveLoopbackPort());
  const claudeAppBackup = await seedClaudeAppTakeover();
  await runtime.close();
  assertReleased(settingsFile);
  assert.equal(existsSync(claudeAppBackup), false, "the Claude App takeover is restored");
});

test("closing the web service keeps the takeover while another LLMR gateway serves", async (t) => {
  const { restoreClaudeAppGatewayConfig } = await import("@llmr/core/agents/claude-app/gateway-service.ts");
  const { restoreGlobalProfileConfigsOnExit } = await import("@llmr/core/profiles/service.ts");
  const otherGateway = createHealthyLlmrGateway(undefined, { reloadRequests: [], revision: "" });
  await listen(otherGateway, 0);
  const gatewayPort = otherGateway.address().port;
  try {
    const { runtime, settingsFile } = await startWithStubbedGateway(t, gatewayPort);
    const claudeAppBackup = await seedClaudeAppTakeover();
    await runtime.close();
    assertTakenOver(settingsFile);
    assert.equal(existsSync(claudeAppBackup), true, "the Claude App takeover stays");
  } finally {
    await closeServer(otherGateway);
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    restoreClaudeAppGatewayConfig();
  }
});

test("stopping the gateway over RPC releases the takeover when no gateway still serves", async (t) => {
  const { runtime, settingsFile } = await startWithStubbedGateway(t, await reserveLoopbackPort());
  try {
    const payload = await rpc(runtime.url, "test-web-auth-token", "stopGateway");
    assert.equal(payload.ok, true);
    assertReleased(settingsFile);
  } finally {
    await runtime.close();
  }
});

test("closing the web service releases the recorded takeovers when the config fails to load", async (t) => {
  const { APP_CONFIG_DB_FILE } = await import("@llmr/core/config/constants.ts");
  const { runtime, settingsFile } = await startWithStubbedGateway(t, await reserveLoopbackPort());
  const Database = createRequire(path.join(process.cwd(), "package.json"))("better-sqlite3");
  const database = new Database(APP_CONFIG_DB_FILE);
  const { value_json: savedConfig } = database.prepare("SELECT value_json FROM app_config WHERE key = 'default'").get();
  try {
    database.prepare("UPDATE app_config SET value_json = '{' WHERE key = 'default'").run();
    await runtime.close();
  } finally {
    database.prepare("UPDATE app_config SET value_json = ? WHERE key = 'default'").run(savedConfig);
    database.close();
  }
  assertReleased(settingsFile);
});

test("#1951 authenticated recovery restores both agent configs while the gateway is down and survives reapply", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const { createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts");
  const { applyProfileConfig } = await import("@llmr/core/profiles/service.ts");
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");
  const { replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");
  const root = mkdtempSync(path.join(runtimeRoot, "recovery-"));
  const claudeFile = path.join(root, "claude", "settings.json");
  const codexFile = path.join(root, "codex", "config.toml");
  // One base URL: all three set alike read as an LLMR takeover, which the release drops instead of restoring.
  const originals = new Map([
    [claudeFile, `${JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://original.invalid", USER_SETTING: "kept" }, permissions: { defaultMode: "default" } })}\n`],
    [codexFile, 'model = "original-model"\nmodel_provider = "original-provider"\n[model_providers.original-provider]\nbase_url = "https://original.invalid/v1"\n']
  ]);
  for (const [file, content] of originals) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  const config = createDefaultAppConfig();
  config.Providers = [{ api_key: "private-provider-key", models: ["m"], name: "Broken", type: "openai_chat_completions" }];
  config.virtualModelProfiles = [];
  config.profile.enabled = true;
  config.profile.profiles = [
    { agent: "claude-code", enabled: true, id: "recovery-claude", model: "Broken/m", name: "Claude Main", scope: "global", settingsFile: claudeFile },
    { agent: "codex", configFile: codexFile, enabled: true, id: "recovery-codex", model: "Broken/m", name: "Codex Main", scope: "global" }
  ];
  await applyProfileConfig(config);
  for (const [file, content] of originals) assert.notEqual(readFileSync(file, "utf8"), content);
  const edited = JSON.parse(readFileSync(claudeFile, "utf8"));
  edited.env.USER_SETTING = "edited after takeover";
  edited.statusLine = { command: "my-status", type: "command" };
  writeFileSync(claudeFile, JSON.stringify(edited));
  const expectedClaude = JSON.parse(originals.get(claudeFile));
  expectedClaude.env.USER_SETTING = edited.env.USER_SETTING;
  expectedClaude.statusLine = edited.statusLine;
  // An unrelated profile that no save would accept must not block a narrow opt-out.
  config.profile.profiles.push({ agent: "claude-code", availableModels: ["Gone/model"], enabled: true, id: "invalid-unrelated", model: "Gone/model", name: "Unrelated", scope: "llmr" });
  await replacePersistedAppConfig(config);
  const stale = await loadAppConfig();
  const runtime = await startWebManagementServer({ authToken: "recovery-auth", host: "127.0.0.1", port: 0, startGateway: false });
  try {
    const denied = await fetch(new URL("/api/llmr/rpc", runtime.url), {
      body: JSON.stringify({ args: ["recovery-claude"], method: "recoverGlobalProfile" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    assert.equal(denied.status, 401);
    assert.equal((await loadAppConfig()).profile.profiles[0].enabled, true);
    for (const id of ["recovery-claude", "recovery-codex"]) {
      const result = await rpc(runtime.url, "recovery-auth", "recoverGlobalProfile", [id]);
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.value.status.ok, true, result.value.status.message);
      assert.equal(result.value.config.profile.profiles.find((profile) => profile.id === id).enabled, false);
      assert.ok(!JSON.stringify(result).includes("private-provider-key"), "web recovery redacts returned credentials");
    }
    stale.profile.enabled = true;
    stale.profile.profiles = stale.profile.profiles.filter((profile) => profile.id !== "invalid-unrelated");
    await assert.rejects(saveAppConfig(stale), (error) => error.name === "AppConfigConflictError", "a stale snapshot cannot re-enable the takeover");
    const saved = await loadAppConfig();
    assert.equal(saved.profile.profiles.find((profile) => profile.id === "invalid-unrelated").enabled, true);
    await applyProfileConfig(saved);
    assert.deepEqual(JSON.parse(readFileSync(claudeFile, "utf8")), expectedClaude, "restore keeps edits made after the takeover and a reapply does not take over again");
    assert.equal(readFileSync(codexFile, "utf8"), originals.get(codexFile));
    const rejected = await fetch(new URL("/api/llmr/rpc", runtime.url), {
      body: JSON.stringify({ args: ["invalid-unrelated"], method: "recoverGlobalProfile" }),
      headers: { "content-type": "application/json", "x-llmr-web-auth": "recovery-auth" },
      method: "POST"
    });
    assert.equal(rejected.status, 500);
    assert.match((await rejected.json()).error.message, /system-default Claude Code or Codex profile/);
  } finally {
    await runtime.close();
    rmSync(root, { force: true, recursive: true });
  }
});

test("#1951 a missing original backup reports failure and keeps the profile disabled", async () => {
  const { recoverGlobalAgentProfile } = await import("@llmr/core/profiles/service.ts");
  const { createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts");
  const { loadAppConfig } = await import("@llmr/core/config/config.ts");
  const { replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");
  const root = mkdtempSync(path.join(runtimeRoot, "missing-backup-"));
  const file = path.join(root, "config.toml");
  const managed = '# BEGIN LLMR managed profile\nmodel = "broken"\n# END LLMR managed profile\n';
  writeFileSync(file, managed);
  const config = createDefaultAppConfig();
  config.profile.enabled = true;
  config.profile.profiles = [{ agent: "codex", configFile: file, enabled: true, id: "missing-backup", model: "broken", name: "Missing backup", scope: "global" }];
  await replacePersistedAppConfig(config);
  try {
    const result = await recoverGlobalAgentProfile("missing-backup");
    assert.equal(result.status.ok, false);
    assert.match(result.status.message, /No original.*backup/);
    assert.equal((await loadAppConfig()).profile.profiles[0].enabled, false);
    assert.equal(readFileSync(file, "utf8"), managed);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("#1951 recovery keeps user edits to a file LLMR created and reports malformed settings", async () => {
  const { recoverGlobalAgentProfile } = await import("@llmr/core/profiles/service.ts");
  const { createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts");
  const { replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");
  const root = mkdtempSync(path.join(runtimeRoot, "claude-recovery-extra-"));
  try {
    for (const malformed of [false, true]) {
      const file = path.join(root, malformed ? "bad.json" : "new.json");
      const config = createDefaultAppConfig();
      config.profile.enabled = true;
      config.profile.profiles = [{ agent: "claude-code", enabled: true, id: "claude-recovery-extra", name: "Claude recovery", scope: "global", settingsFile: file }];
      await replacePersistedAppConfig(config);
      const content = malformed ? "{bad JSON" : JSON.stringify({ apiKeyHelper: "llmr-claude-code-api-key-extra",
        env: { ANTHROPIC_API_BASE_URL: "http://127.0.0.1:3456", ANTHROPIC_BASE_URL: "http://127.0.0.1:3456", CLAUDE_AGENT_API_BASE_URL: "http://127.0.0.1:3456", USER_EDIT: "keep" } });
      writeFileSync(file, content);
      writeFileSync(`${file}.llmr-original-missing`, "");
      const result = await recoverGlobalAgentProfile("claude-recovery-extra");
      assert.equal(result.config.profile.profiles[0].enabled, false);
      assert.equal(result.status.ok, !malformed, result.status.message);
      if (malformed) {
        assert.match(result.status.message, /disabled.*not valid JSON/);
        assert.equal(readFileSync(file, "utf8"), content);
      } else {
        assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { env: { USER_EDIT: "keep" } });
      }
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("restoring a disabled profile leaves the file an enabled profile of the same agent still manages", async () => {
  const { applyProfileConfig, recoverGlobalAgentProfile } = await import("@llmr/core/profiles/service.ts");
  const { createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts");
  const { replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");
  const root = mkdtempSync(path.join(runtimeRoot, "shared-file-"));
  try {
    for (const agent of ["claude-code", "codex"]) {
      const file = path.join(root, agent, agent === "codex" ? "config.toml" : "settings.json");
      const original = agent === "codex" ? 'model = "original-model"\n' : `${JSON.stringify({ env: { USER_SETTING: "kept" } })}\n`;
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, original);
      const fileKey = agent === "codex" ? "configFile" : "settingsFile";
      const config = createDefaultAppConfig();
      config.Providers = [{ models: ["m"], name: "Live", type: "openai_chat_completions" }];
      config.virtualModelProfiles = [];
      config.profile.enabled = true;
      config.profile.profiles = [
        { agent, enabled: false, id: `${agent}-off`, model: "Live/m", name: "Spare", scope: "global", [fileKey]: file },
        { agent, enabled: true, id: `${agent}-on`, model: "Live/m", name: "Main", scope: "global", [fileKey]: file }
      ];
      await applyProfileConfig(config);
      const takenOver = readFileSync(file, "utf8");
      assert.notEqual(takenOver, original, `${agent}: the enabled profile took the file over`);
      await replacePersistedAppConfig(config);
      const result = await recoverGlobalAgentProfile(`${agent}-off`);
      assert.equal(result.status.ok, true, result.status.message);
      assert.match(result.status.message, /disabled.*"Main" still manages/);
      assert.equal(readFileSync(file, "utf8"), takenOver, `${agent}: the enabled profile keeps its takeover`);
      assert.equal(result.config.profile.profiles.find((profile) => profile.id === `${agent}-on`).enabled, true);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("recovery decides on the profile the loader reads, not the stored entry", async () => {
  const { recoverGlobalAgentProfile } = await import("@llmr/core/profiles/service.ts");
  const { loadAppConfig } = await import("@llmr/core/config/config.ts");
  const { replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");
  const root = mkdtempSync(path.join(runtimeRoot, "loader-shape-"));
  const settingsFile = path.join(root, "settings.json");
  await loadAppConfig();
  try {
    await replacePersistedAppConfig({ profile: { profiles: [{ agent: "unknown-agent" }, { agent: "Claude Code", applyScope: "system", settingsFile }] } });
    const derived = await recoverGlobalAgentProfile("profile-2");
    assert.equal(derived.status.ok, true, derived.status.message);
    assert.equal((await loadAppConfig()).profile.profiles.find((profile) => profile.id === "profile-2").enabled, false, "a derived id and an agent alias reach the stored entry");

    await replacePersistedAppConfig({ profile: { profiles: [{ agent: "claude-code", id: "managed-scope", scope: "managed", settingsFile }] } });
    await assert.rejects(recoverGlobalAgentProfile("managed-scope"), /system-default Claude Code or Codex profile/);
    assert.equal((await loadAppConfig()).profile.profiles[0].enabled, true, "an LLMR-only profile is left alone");

    await replacePersistedAppConfig({ profile: { claudeCode: { enabled: true, settingsFile } } });
    const legacy = await recoverGlobalAgentProfile("default-claude-code");
    assert.equal(legacy.status.ok, true, legacy.status.message);
    assert.deepEqual((await loadAppConfig()).profile.profiles.map((profile) => [profile.id, profile.enabled]), [["default-claude-code", false]]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("a failed runtime refresh after recovery still returns the disabled profile and says to restart", async () => {
  const { recoverGlobalAgentProfile } = await import("@llmr/core/profiles/service.ts");
  const { createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts");
  const { replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");
  const root = mkdtempSync(path.join(runtimeRoot, "refresh-fails-"));
  const config = createDefaultAppConfig();
  config.profile.enabled = true;
  config.profile.profiles = [{ agent: "claude-code", enabled: true, id: "refresh-fails", name: "Refresh", scope: "global", settingsFile: path.join(root, "settings.json") }];
  await replacePersistedAppConfig(config);
  try {
    const result = await recoverGlobalAgentProfile("refresh-fails", () => {
      throw new Error("gateway refresh exploded");
    });
    assert.equal(result.config.profile.profiles[0].enabled, false);
    assert.equal(result.status.ok, false);
    assert.match(result.status.message, /disabled.*gateway refresh exploded.*Restart LLMR/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

// Seeded after start: the start-up sync restores any Claude App takeover no profile asks for.
async function seedClaudeAppTakeover() {
  const { CONFIGDIR } = await import("@llmr/core/config/constants.ts");
  const backupFile = path.join(CONFIGDIR, "claude-app-gateway-backup.json");
  const absent = { exists: false };
  writeFileSync(backupFile, `${JSON.stringify({ configLibraryFile: absent, createdAt: new Date().toISOString(), metaFile: absent, rootConfigFile: absent, version: 1 })}\n`);
  return backupFile;
}

function assertReleased(settingsFile) {
  const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.equal(settings.env?.ANTHROPIC_BASE_URL, undefined);
  assert.equal(settings.apiKeyHelper, undefined);
  assert.equal(settings.theme, "dark");
}

function assertTakenOver(settingsFile) {
  const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.match(settings.env?.ANTHROPIC_BASE_URL ?? "", /^http:\/\/127\.0\.0\.1:/);
}

async function startWithStubbedGateway(t, gatewayPort) {
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");
  const { gatewayService } = await import("@llmr/core/gateway/service.ts");
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const settingsFile = path.join(process.env.LLMR_INTERNAL_HOME_DIR, ".claude", "settings.json");
  mkdirSync(path.dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, `${JSON.stringify({ theme: "dark" }, null, 2)}\n`);
  const config = await loadAppConfig();
  config.gateway.port = gatewayPort;
  config.Providers = [{
    api_base_url: "http://127.0.0.1:9/v1",
    api_key: "test-provider-key",
    id: "test-provider",
    models: ["test-model"],
    name: "Test Provider",
    type: "openai_chat_completions"
  }];
  config.profile.enabled = true;
  config.profile.profiles = [{
    agent: "claude-code",
    enabled: true,
    env: {},
    id: "default-claude-code",
    model: "Test Provider/test-model",
    name: "Claude Code",
    scope: "global",
    settingsFile: "~/.claude/settings.json",
    smallFastModel: "",
    surface: "auto"
  }];
  await saveAppConfig(config);

  const running = { endpoint: `http://127.0.0.1:${gatewayPort}`, state: "running" };
  let status = running;
  t.mock.method(gatewayService, "ensureStarted", async () => running);
  t.mock.method(gatewayService, "getStatus", () => status);
  t.mock.method(gatewayService, "stop", async () => {
    status = { state: "stopped" };
    return status;
  });
  const runtime = await startWebManagementServer({ authToken: "test-web-auth-token", host: "127.0.0.1", port: 0 });
  try {
    assertTakenOver(settingsFile);
  } catch (error) {
    await runtime.close();
    throw error;
  }
  return { runtime, settingsFile };
}

async function rpc(baseUrl, authToken, method, args = []) {
  const response = await fetch(new URL("/api/llmr/rpc", baseUrl), {
    body: JSON.stringify({ args, method }),
    headers: {
      "content-type": "application/json",
      "x-llmr-web-auth": authToken
    },
    method: "POST"
  });
  assert.equal(response.status, 200);
  return response.json();
}

function createHealthyLlmrGateway(apiKey, state) {
  return createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/health") {
      sendJson(response, 200, {
        core: "http://127.0.0.1:3457",
        status: "running",
        timestamp: new Date().toISOString()
      });
      return;
    }
    if (url.pathname === "/") {
      sendJson(response, 200, {
        core: "next-ai-gateway",
        endpoints: ["GET /v1/models"],
        name: "llm-router",
        plugin: "llm-router"
      });
      return;
    }
    if (url.pathname === "/v1/models") {
      if (apiKey !== undefined && request.headers.authorization !== `Bearer ${apiKey}`) {
        sendJson(response, 401, { error: { message: "Invalid API key." } });
        return;
      }
      sendJson(response, 200, { data: [{ id: "test-model", object: "model" }], object: "list" });
      return;
    }
    if (url.pathname === "/manager/config" && state?.managerStatus) {
      sendJson(response, state.managerStatus, {});
      return;
    }
    if (url.pathname === "/__llmr/runtime/config") {
      if (request.headers.authorization !== `Bearer ${apiKey}`) {
        sendJson(response, 401, { error: { message: "Invalid API key." } });
        return;
      }
      if (request.method === "GET") {
        sendJson(response, 200, { revision: state.revision, state: "running" });
        return;
      }
      if (request.method === "POST") {
        void readJsonRequest(request).then((body) => {
          state.reloadRequests.push(body);
          state.revision = body.configRevision;
          sendJson(response, 202, {
            accepted: true,
            configRevision: body.configRevision,
            restarting: body.forceRestart === true
          });
        });
        return;
      }
    }
    sendJson(response, 404, { error: { message: "Not found." } });
  });
}

async function readJsonRequest(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function setOptionalEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function closeServer(server) {
  if (!server.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("a profile save creates its key before the gateway starts, and a save with applyProfile false creates none", async (t) => {
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");
  const { loadPersistedApiKeys, updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  const { createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts");
  const { gatewayService } = await import("@llmr/core/gateway/service.ts");
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const profileKeyIds = async () => (await loadPersistedApiKeys()).map((key) => key.id).filter((id) => id.startsWith("profile:"));
  const config = await loadAppConfig();
  config.Providers = [{ api_base_url: "http://127.0.0.1:9/v1", api_key: "provider-key", id: "provider", models: ["model"], name: "Provider", type: "openai_chat_completions" }];
  config.profile.profiles = createDefaultAppConfig().profile.profiles;
  await saveAppConfig(config);
  await updatePersistedApiKeys(() => []);
  const status = gatewayService.getStatus();
  const startedWithKeys = [];
  t.mock.method(gatewayService, "start", async (next) => {
    startedWithKeys.push(next.APIKEYS.map((key) => key.id).filter((id) => id.startsWith("profile:")));
    return status;
  });
  const updateConfig = t.mock.method(gatewayService, "updateConfig", async () => undefined);
  const token = "profile-key-save-test";
  const runtime = await startWebManagementServer({ authToken: token, host: "127.0.0.1", port: 0, startGateway: false });
  try {
    const current = (await rpc(runtime.url, token, "getConfig")).value;
    current.profile.enabled = true;
    current.profile.profiles.find((profile) => profile.id === "default-claude-code").enabled = true;
    const saved = (await rpc(runtime.url, token, "saveConfig", [current, { applyProfile: false }])).value;
    assert.deepEqual(await profileKeyIds(), []);

    await rpc(runtime.url, token, "saveConfig", [saved]);
    assert.deepEqual(await profileKeyIds(), ["profile:default-claude-code"]);
    assert.deepEqual(startedWithKeys, [[], ["profile:default-claude-code"]]);
    assert.equal(updateConfig.mock.callCount(), 0);
  } finally {
    await runtime.close();
  }
});

test("the saveApiKeys RPC applies only the caller's changes", async (t) => {
  const { loadPersistedApiKeys, updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  const { gatewayService } = await import("@llmr/core/gateway/service.ts");
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const status = gatewayService.getStatus();
  t.mock.method(gatewayService, "start", async () => status);
  t.mock.method(gatewayService, "updateConfig", async () => undefined);
  const token = "api-key-save-merge-test";
  const runtime = await startWebManagementServer({ authToken: token, host: "127.0.0.1", port: 0, startGateway: false });
  try {
    const current = (await rpc(runtime.url, token, "getConfig")).value.APIKEYS;
    await updatePersistedApiKeys((keys) => [...keys, { createdAt: "2026-02-01T00:00:00.000Z", id: "elsewhere", key: "elsewhere-token" }]);
    const saved = (await rpc(runtime.url, token, "saveApiKeys", [[...current, { createdAt: "2026-02-02T00:00:00.000Z", id: "mine", key: "mine-token" }], current])).value;
    const savedIds = saved.APIKEYS.map((key) => key.id);
    assert.ok(savedIds.includes("elsewhere"));
    assert.ok(savedIds.includes("mine"));

    const refused = await fetch(new URL("/api/llmr/rpc", runtime.url), {
      body: JSON.stringify({ args: [[]], method: "saveApiKeys" }),
      headers: { "content-type": "application/json", "x-llmr-web-auth": token },
      method: "POST"
    });
    assert.equal(refused.status, 500);
    assert.match((await refused.json()).error.message, /Reload the page and save again/);
    const storedIds = (await loadPersistedApiKeys()).map((key) => key.id);
    assert.ok(storedIds.includes("elsewhere"));
    assert.ok(storedIds.includes("mine"));

    await rpc(runtime.url, token, "saveApiKeys", [saved.APIKEYS.filter((key) => key.id !== "elsewhere"), saved.APIKEYS]);
    const afterDelete = (await loadPersistedApiKeys()).map((key) => key.id);
    assert.ok(!afterDelete.includes("elsewhere"));
    assert.ok(afterDelete.includes("mine"));
  } finally {
    await runtime.close();
  }
});
