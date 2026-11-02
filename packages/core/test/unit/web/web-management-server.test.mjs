import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

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

test("the management URL carries the token as llmr_web_token", async () => {
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  const runtime = await startWebManagementServer({ authToken: "test-web-auth-token", host: "127.0.0.1", port: 0, startGateway: false });
  try {
    const url = new URL(runtime.url);
    assert.equal(url.searchParams.get("llmr_web_token"), "test-web-auth-token");
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

test("web RPC ignores Origin and Referer when the auth token is valid", async () => {
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
  const gatewayPort = await findAvailablePort();
  const webAuthToken = "test-web-auth-token";
  const config = await loadAppConfig();
  config.gateway.port = gatewayPort;
  config.gateway.corePort = await findAvailablePort();
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
    assert.equal(externalGatewayState.revision, gatewayRuntimeConfigRevision(saveResult.value));
    assert.equal(gatewayService.getStatus().gatewayManagedExternally, true);
  } finally {
    gatewayService.start = originalStart;
    await runtime.close();
    await gatewayService.stop();
    await closeServer(externalGateway);
  }
});

test("closing the web service releases the Claude Code takeover when no gateway still serves", async (t) => {
  const { runtime, settingsFile } = await startWithStubbedGateway(t, await findAvailablePort());
  const claudeAppBackup = await seedClaudeAppTakeover();
  await runtime.close();
  assertReleased(settingsFile);
  assert.equal(existsSync(claudeAppBackup), false, "the Claude App takeover is restored");
});

test("closing the web service keeps the takeover while another LLMR gateway serves", async (t) => {
  const { restoreClaudeAppGatewayConfig } = await import("@llmr/core/agents/claude-app/gateway-service.ts");
  const { restoreGlobalProfileConfigsOnExit } = await import("@llmr/core/profiles/service.ts");
  const gatewayPort = await findAvailablePort();
  const otherGateway = createHealthyLlmrGateway(undefined, { reloadRequests: [], revision: "" });
  await listen(otherGateway, gatewayPort);
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
  const { runtime, settingsFile } = await startWithStubbedGateway(t, await findAvailablePort());
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
  const { runtime, settingsFile } = await startWithStubbedGateway(t, await findAvailablePort());
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

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Failed to allocate a web management test port."));
        }
      });
    });
  });
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
