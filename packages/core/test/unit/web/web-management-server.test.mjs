import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { reserveLoopbackPort } from "../../support/loopback-listener.mjs";

const previousRuntimeEnv = {
  appData: process.env.LLMR_INTERNAL_APP_DATA_DIR,
  home: process.env.LLMR_INTERNAL_HOME_DIR,
  userData: process.env.LLMR_INTERNAL_USER_DATA_DIR
};
const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "llmr-web-management-test-"));
process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(runtimeRoot, "app-data");
process.env.LLMR_INTERNAL_HOME_DIR = path.join(runtimeRoot, "home");
process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(runtimeRoot, "user-data");

after(() => {
  setOptionalEnv("LLMR_INTERNAL_APP_DATA_DIR", previousRuntimeEnv.appData);
  setOptionalEnv("LLMR_INTERNAL_HOME_DIR", previousRuntimeEnv.home);
  setOptionalEnv("LLMR_INTERNAL_USER_DATA_DIR", previousRuntimeEnv.userData);
  rmSync(runtimeRoot, { force: true, recursive: true });
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
