import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { gatewayService } from "@llmr/core/gateway/application/gateway-service.ts";
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
