import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { gatewayService } from "@llmr/core/gateway/application/gateway-service.ts";
import { removeManagedCoreGatewayMarker, writeManagedCoreGatewayMarker } from "@llmr/core/gateway/core-runtime/supervisor.ts";
import { pluginService } from "@llmr/core/plugins/service.ts";
import { resetRefusedKeyRequestsForTest } from "@llmr/core/gateway/auth/refused-key-requests.ts";
import { llmrRefusedKeyRequestsMessageType } from "@llmr/core/gateway/core-runtime/router-plugin-contract.ts";

// A fresh service without starting HTTP, plugins, or child processes.
function createService() {
  return new gatewayService.constructor();
}

function crashedService() {
  const service = createService();
  const child = {};
  service.child = child;
  service.config = { gateway: { host: "127.0.0.1", port: 0 } };
  service.status = { state: "running", endpoint: "", coreEndpoint: "", networkEndpoints: [] };
  return { child, service };
}

test("#1867 unexpected core exit restarts with bounded backoff", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { child, service } = crashedService();
  let restarts = 0;
  service.startGateway = async () => {
    restarts += 1;
    service.status.state = "error";
    return service.getStatus();
  };
  await service.handleCoreGatewayTermination(child, undefined, "heap OOM");
  assert.equal(service.getStatus().state, "error");
  t.mock.timers.tick(999);
  assert.equal(restarts, 0);
  t.mock.timers.tick(1);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(restarts, 1);
  t.mock.timers.tick(1999);
  assert.equal(restarts, 1);
  t.mock.timers.tick(1);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(restarts, 2);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    t.mock.timers.tick(30_000);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.equal(restarts, 12);
});

test("#1867 explicit stop cancels a scheduled core restart", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { child, service } = crashedService();
  let restarts = 0;
  service.startGateway = async () => { restarts += 1; return service.getStatus(); };
  service.stopGateway = async () => { service.status.state = "stopped"; return service.getStatus(); };
  await service.handleCoreGatewayTermination(child, undefined, "heap OOM");
  await service.stop();
  t.mock.timers.tick(60_000);
  await Promise.resolve();
  assert.equal(restarts, 0);
});

test("#1867 explicit stop cleans up after an already running recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { child, service } = crashedService();
  const operations = [];
  let releaseRecovery;
  const recoveryGate = new Promise((resolve) => { releaseRecovery = resolve; });
  service.startGateway = async () => {
    await recoveryGate;
    operations.push("recovery completed");
    service.status.state = "running";
    return service.getStatus();
  };
  service.stopGateway = async () => {
    operations.push("stopped");
    service.status.state = "stopped";
    return service.getStatus();
  };
  await service.handleCoreGatewayTermination(child, undefined, "heap OOM");
  t.mock.timers.tick(1_000);
  const stopping = service.stop();
  releaseRecovery();
  await stopping;
  await Promise.resolve();
  assert.deepEqual(operations, ["recovery completed", "stopped"]);
  assert.equal(service.getStatus().state, "stopped");
  t.mock.timers.tick(60_000);
  assert.equal(operations.length, 2);
});

test("#1867 explicit start waits for an already running recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { child, service } = crashedService();
  const operations = [];
  let releaseRecovery;
  const recoveryGate = new Promise((resolve) => { releaseRecovery = resolve; });
  service.startGateway = async (_config, generation) => {
    if (generation !== undefined) {
      await recoveryGate;
      operations.push("recovery completed");
    } else {
      operations.push("manual start");
    }
    service.status.state = "running";
    return service.getStatus();
  };
  await service.handleCoreGatewayTermination(child, undefined, "heap OOM");
  t.mock.timers.tick(1_000);
  const starting = service.start(service.config);
  releaseRecovery();
  await starting;
  await Promise.resolve();
  assert.deepEqual(operations, ["recovery completed", "manual start"]);
  t.mock.timers.tick(60_000);
  assert.equal(operations.length, 2);
});

test("#1867 an obsolete child's exit cannot restart its replacement", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { service } = crashedService();
  let restarts = 0;
  service.startGateway = async () => { restarts += 1; return service.getStatus(); };
  await service.handleCoreGatewayTermination({}, undefined, "old child");
  t.mock.timers.tick(60_000);
  assert.equal(restarts, 0);
  assert.equal(service.getStatus().state, "running");
});

test("refused-key counts survive a core restart and only the current child is heard", () => {
  resetRefusedKeyRequestsForTest();
  const { child, service } = crashedService();
  service.handleCoreGatewayMessage(child, refusedKeyMessage(1, ["2026-11-22T00:00:01.000Z"]));
  service.handleCoreGatewayMessage(child, refusedKeyMessage(2, ["2026-11-22T00:00:02.000Z", "2026-11-22T00:00:01.000Z"]));
  const nextChild = {};
  service.adoptCoreGatewayChild(nextChild);
  service.handleCoreGatewayMessage(child, refusedKeyMessage(9, ["2026-11-22T00:00:09.000Z"]));
  service.handleCoreGatewayMessage(nextChild, refusedKeyMessage(1, ["2026-11-22T00:00:03.000Z"]));
  service.handleCoreGatewayMessage(nextChild, { count: "lots", protocolVersion: 1, recent: [], type: llmrRefusedKeyRequestsMessageType });

  const { refusedForKey } = service.getStatus();
  assert.equal(service.child, nextChild);
  assert.equal(refusedForKey.count, 3);
  assert.deepEqual(refusedForKey.recent.map((entry) => entry.at), [
    "2026-11-22T00:00:03.000Z",
    "2026-11-22T00:00:02.000Z",
    "2026-11-22T00:00:01.000Z"
  ]);
});

test("a status with no refused-key requests carries no refusedForKey", () => {
  resetRefusedKeyRequestsForTest();
  const { service } = crashedService();
  assert.equal("refusedForKey" in service.getStatus(), false);
});

test("a message from the replaced child that arrives after the new child's leaves the count alone", () => {
  resetRefusedKeyRequestsForTest();
  const { child, service } = crashedService();
  service.handleCoreGatewayMessage(child, refusedKeyMessage(2, ["2026-11-22T00:00:02.000Z"]));
  const nextChild = {};
  service.adoptCoreGatewayChild(nextChild);
  service.handleCoreGatewayMessage(nextChild, refusedKeyMessage(1, ["2026-11-22T00:00:03.000Z"]));
  service.handleCoreGatewayMessage(child, refusedKeyMessage(9, ["2026-11-22T00:00:09.000Z"]));
  assert.equal(service.getStatus().refusedForKey.count, 3);
});

test("a malformed refused-key message leaves the count alone", () => {
  resetRefusedKeyRequestsForTest();
  const { child, service } = crashedService();
  service.handleCoreGatewayMessage(child, refusedKeyMessage(2, ["2026-11-22T00:00:02.000Z"]));
  for (const message of [
    { ...refusedKeyMessage(5, []), protocolVersion: 2 },
    { ...refusedKeyMessage(5, []), recent: [null] },
    { ...refusedKeyMessage(5, []), count: "5" }
  ]) {
    assert.doesNotThrow(() => service.handleCoreGatewayMessage(child, message));
  }
  assert.equal(service.getStatus().refusedForKey.count, 2);
});

test("a status copy that carries an old refused-key count never shows once the count is zero", () => {
  resetRefusedKeyRequestsForTest();
  const { service } = crashedService();
  service.status.refusedForKey = { count: 4, recent: [] };
  assert.equal("refusedForKey" in service.getStatus(), false);
});

test("the status a start returns carries the refused-key count", async (t) => {
  resetRefusedKeyRequestsForTest();
  const { child, service } = crashedService();
  service.handleCoreGatewayMessage(child, refusedKeyMessage(2, ["2026-11-22T00:00:02.000Z"]));
  service.stopGateway = async () => service.getStatus();
  service.routeScriptRuntime = { close: async () => {}, prepare: async () => [] };
  t.mock.method(pluginService, "start", async () => { throw new Error("plugin start failed"); });
  const config = createDefaultAppConfig();
  config.gateway.port = 0;
  config.gateway.corePort = 0;

  for (const status of [await service.start(config), await service.restart(config), await service.ensureStarted(config)]) {
    assert.equal(status.state, "error");
    assert.equal(status.refusedForKey?.count, 2);
  }
});

function refusedKeyMessage(count, times) {
  return {
    count,
    protocolVersion: 1,
    recent: times.map((at) => ({ at, client: "Codex", reason: "Invalid or expired API key.", route: "/v1/responses" })),
    type: llmrRefusedKeyRequestsMessageType
  };
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

function config() {
  const value = createDefaultAppConfig();
  value.APIKEY = "first-key";
  value.APIKEYS = [{ id: "first", key: "first-key", name: "First" }];
  value.gateway.host = "127.0.0.1";
  value.gateway.port = 3456;
  return value;
}

const health = () => Response.json({ core: "http://127.0.0.1:3467", status: "ok", timestamp: "2026-01-01T00:00:00.000Z" });

function restartingService(config) {
  const service = createService();
  service.config = config;
  service.coreRestartGeneration = 3;
  service.status = { coreEndpoint: "http://127.0.0.1:3467", endpoint: "http://127.0.0.1:3456", networkEndpoints: [], state: "error" };
  const calls = [];
  service.stopGateway = async () => { calls.push("stop"); return service.getStatus(); };
  service.adoptExternalGateway = async (_config, endpoint, apiKey) => {
    calls.push(`adopt ${endpoint} ${apiKey}`);
    service.status = { ...service.status, gatewayManagedExternally: true, state: "running" };
    return service.getStatus();
  };
  service.rememberStoredApiKeys = async () => { calls.push("remember"); };
  service.holdConfig = () => { calls.push("hold"); throw new Error("reached the normal start"); };
  return { calls, service };
}

test("a restart adopts another gateway on its port that accepts its key", async (t) => {
  withFetch(t, (url) => url.pathname === "/health" ? health() : Response.json({ data: [] }));
  const { calls, service } = restartingService(config());
  const status = await service.startGateway(service.config, 3);
  assert.deepEqual(calls, ["stop", "adopt http://127.0.0.1:3456 first-key"]);
  assert.equal(status.state, "running");
  assert.equal(status.gatewayManagedExternally, true);
});

test("a restart leaves another gateway that refuses its key alone and says who serves the port", async (t) => {
  withFetch(t, (url) => url.pathname === "/health" ? health() : new Response("{}", { status: 401 }));
  const { calls, service } = restartingService(config());
  const status = await service.startGateway(service.config, 3);
  assert.deepEqual(calls, []);
  assert.equal(status.state, "error");
  assert.equal(status.lastError, "Another LLM Router process serves http://127.0.0.1:3456 and does not accept this process's key. Quit the other one, or restart this one.");
});

test("a restart says only that the port is served when the other gateway fails without refusing the key", async (t) => {
  withFetch(t, (url) => url.pathname === "/health" ? health() : new Response("{}", { status: 500 }));
  const { calls, service } = restartingService(config());
  const status = await service.startGateway(service.config, 3);
  assert.deepEqual(calls, []);
  assert.equal(status.lastError, "Another process serves http://127.0.0.1:3456.");
});

test("a restart with nothing on its port starts a gateway as before", async (t) => {
  withFetch(t, () => { throw new Error("connection refused"); });
  const { calls, service } = restartingService(config());
  await assert.rejects(service.startGateway(service.config, 3), /reached the normal start/);
  assert.deepEqual(calls, ["stop", "hold"]);
});

test("a restart cancelled while it probes adopts nothing", async (t) => {
  const { calls, service } = restartingService(config());
  withFetch(t, (url) => {
    if (url.pathname !== "/health") service.coreRestartGeneration = 4;
    return url.pathname === "/health" ? health() : Response.json({ data: [] });
  });
  await service.startGateway(service.config, 3);
  assert.deepEqual(calls, []);
});

test("a manual start does not look for another gateway first", async (t) => {
  const requests = withFetch(t, () => health());
  const { calls, service } = restartingService(config());
  await assert.rejects(service.startGateway(service.config), /reached the normal start/);
  assert.deepEqual(calls, ["remember", "stop", "hold"]);
  assert.equal(requests.length, 0);
});

test("a restart that finds another gateway refusing its key keeps looking, and one that adopts stops looking", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let modelsStatus = 401;
  const requests = withFetch(t, (url) => url.pathname === "/health" ? health() : new Response("{}", { status: modelsStatus }));
  const { child, service } = crashedService();
  service.config = config();
  service.status = { coreEndpoint: "http://127.0.0.1:3467", endpoint: "http://127.0.0.1:3456", networkEndpoints: [], state: "running" };
  service.stopGateway = async () => service.getStatus();
  service.adoptExternalGateway = async () => {
    service.status = { ...service.status, gatewayManagedExternally: true, lastError: undefined, state: "running" };
    return service.getStatus();
  };
  const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
  const probes = () => requests.filter((request) => request.path === "/v1/models").length;
  await service.handleCoreGatewayTermination(child, undefined, "Core gateway exited with SIGTERM.");
  t.mock.timers.tick(1_000);
  await settle();
  assert.equal(probes(), 1);
  assert.equal(service.getStatus().state, "error");
  assert.ok(service.coreRestartTimer, "an error leaves another look scheduled");
  modelsStatus = 200;
  t.mock.timers.tick(2_000);
  await settle();
  assert.equal(probes(), 2);
  assert.equal(service.getStatus().state, "running");
  assert.equal(service.coreRestartTimer, undefined);
  t.mock.timers.tick(120_000);
  await settle();
  assert.equal(probes(), 2);
});

test("a restart looks at the port its gateway runs on when its last status names another", async (t) => {
  const requests = withFetch(t, (url) => {
    if (url.port !== "3456") throw new Error("connection refused");
    return url.pathname === "/health" ? health() : Response.json({ data: [] });
  });
  const { calls, service } = restartingService(config());
  service.status = { ...service.status, coreEndpoint: "http://127.0.0.1:3999" };
  await service.startGateway(service.config, 3);
  assert.deepEqual(calls, ["stop", "adopt http://127.0.0.1:3456 first-key"]);
  assert.equal(requests.length > 0, true);
});

test("a restart whose first look times out does not signal the gateway another process started", async (t) => {
  const other = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  t.after(() => other.kill("SIGKILL"));
  await writeManagedCoreGatewayMarker(other, "other-runtime");
  t.after(() => removeManagedCoreGatewayMarker());
  let healthReads = 0;
  withFetch(t, (url) => {
    if (url.pathname !== "/health") return Response.json({ data: [] });
    healthReads += 1;
    if (healthReads === 1) throw new Error("timed out");
    return Response.json({ runtimeId: "other-runtime", status: "ok" });
  });
  const service = createService();
  service.config = config();
  service.config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model"], name: "Provider" }];
  service.coreRestartGeneration = 3;
  service.status = { coreEndpoint: "http://127.0.0.1:3456", endpoint: "http://127.0.0.1:3456", networkEndpoints: [], state: "error" };
  const status = await service.startGateway(service.config, 3);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.match(status.lastError, /already in use/);
  assert.equal(other.signalCode, null);
  assert.equal(other.exitCode, null);
});

function adoptedService(t) {
  t.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"] });
  const service = createService();
  t.after(() => clearInterval(service.adoptedGatewayTimer));
  service.markExternalGatewayRunning(config(), "http://127.0.0.1:3456", "first-key");
  const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
  const pass = async (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 1_000) {
      t.mock.timers.tick(1_000);
      await settle();
    }
  };
  return { pass, service };
}

test("an adopted gateway that stays gone for the wait is replaced by this process's own, and not sooner", async (t) => {
  const requests = withFetch(t, () => { throw new Error("connection refused"); });
  const { pass, service } = adoptedService(t);
  const starts = [];
  service.startGateway = async (config, generation) => { starts.push([config.gateway.port, generation]); return service.getStatus(); };
  service.coreRestartAttempts = 3;
  await pass(10_000);
  assert.equal(service.getStatus().state, "running");
  assert.equal(service.getStatus().gatewayManagedExternally, true);
  assert.deepEqual(starts, []);
  await pass(2_000);
  assert.equal(service.getStatus().state, "error");
  assert.equal(service.getStatus().gatewayManagedExternally, undefined);
  assert.match(service.getStatus().lastError, /gateway at http:\/\/127\.0\.0\.1:3456 that this process was using is gone/);
  await pass(1_000);
  assert.deepEqual(starts, [[3456, 0]]);
  assert.deepEqual([...new Set(requests.map((request) => `${request.path} ${request.authorization}`))], ["/health null"]);
  const seen = requests.length;
  await pass(30_000);
  assert.equal(requests.length, seen);
});

test("an adopted gateway that answers again within the wait is kept, in either layout", async (t) => {
  let answer = () => { throw new Error("connection refused"); };
  withFetch(t, () => answer());
  const { pass, service } = adoptedService(t);
  service.startGateway = async () => { throw new Error("started a gateway"); };
  await pass(8_000);
  answer = () => Response.json({ status: "running" });
  await pass(2_000);
  answer = () => { throw new Error("connection refused"); };
  await pass(8_000);
  assert.equal(service.getStatus().state, "running");
  assert.equal(service.getStatus().gatewayManagedExternally, true);
  assert.equal(service.coreRestartTimer, undefined);
});

test("a stop ends the watch of an adopted gateway", async (t) => {
  const requests = withFetch(t, () => { throw new Error("connection refused"); });
  const { pass, service } = adoptedService(t);
  await service.stop();
  assert.equal(service.adoptedGatewayTimer, undefined);
  await pass(30_000);
  assert.equal(requests.length, 0);
  assert.equal(service.getStatus().state, "stopped");
});

test("a stop while the adopted gateway is being checked starts nothing", async (t) => {
  let fail;
  withFetch(t, () => new Promise((_resolve, reject) => { fail = reject; }));
  const { pass, service } = adoptedService(t);
  service.adoptedGatewayGoneSince = Date.now() - 60_000;
  await pass(2_000);
  service.cancelCoreRestart();
  fail(new Error("connection refused"));
  await pass(1_000);
  assert.equal(service.getStatus().state, "running");
  assert.equal(service.coreRestartTimer, undefined);
});

test("a save that fails while the adopted gateway is gone still lets the watch replace it", async (t) => {
  withFetch(t, () => { throw new Error("connection refused"); });
  const { pass, service } = adoptedService(t);
  const starts = [];
  service.startGateway = async (_config, generation) => { starts.push(generation); return service.getStatus(); };
  await pass(4_000);
  await service.updateConfig(config()).catch(() => undefined);
  assert.equal(service.getStatus().state, "error");
  await pass(10_000);
  assert.equal(starts.length > 0, true);
});

test("a gateway adopted again is watched once, on the port it serves", async (t) => {
  const requests = withFetch(t, (url) => {
    if (url.port !== "3456") throw new Error("connection refused");
    return Response.json({ status: "ok" });
  });
  const { pass, service } = adoptedService(t);
  service.startGateway = async () => { throw new Error("started a gateway"); };
  service.markExternalGatewayRunning(config(), "http://127.0.0.1:3456", "first-key");
  await pass(14_000);
  assert.equal(requests.length, 7);
  assert.equal(service.getStatus().state, "running");
});
