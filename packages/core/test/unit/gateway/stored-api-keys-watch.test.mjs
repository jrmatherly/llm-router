import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";

const root = path.join(process.env.LLMR_INTERNAL_HOME_DIR || os.tmpdir(), `stored-api-keys-watch-${process.pid}`);
process.env.LLMR_INTERNAL_HOME_DIR = path.join(root, "home");
process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");

let APP_CONFIG_DB_FILE;
let Database;
let createDefaultAppConfig;
let gatewayService;
let loadAppConfig;
let updatePersistedApiKeys;
before(async () => {
  ({ APP_CONFIG_DB_FILE } = await import("@llmr/core/config/constants.ts"));
  ({ default: Database } = await import("better-sqlite3"));
  ({ createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts"));
  ({ gatewayService } = await import("@llmr/core/gateway/application/gateway-service.ts"));
  ({ loadAppConfig } = await import("@llmr/core/config/config.ts"));
  ({ updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts"));
});

const first = { createdAt: "2026-01-01T00:00:00.000Z", id: "first", key: "first-token" };
const second = { createdAt: "2026-01-02T00:00:00.000Z", id: "second", key: "second-token" };

async function runningService(keys) {
  await updatePersistedApiKeys(() => keys);
  const service = new gatewayService.constructor();
  service.child = {};
  service.status = { coreEndpoint: "", endpoint: "", networkEndpoints: [], state: "running" };
  const reloads = [];
  service.schedulePersistedRuntimeConfigReload = (revision, force) => { reloads.push([revision, force]); };
  await service.rememberStoredApiKeys();
  return { reloads, service };
}

test("a stored key change seen on two ticks reloads the gateway once", async () => {
  const { reloads, service } = await runningService([first]);
  await service.checkStoredApiKeys();
  await updatePersistedApiKeys((current) => [...current, second]);
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, [[undefined, false]]);
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.equal(reloads.length, 1);
});

test("a key write that the service itself follows with a new config does not reload", async () => {
  const { reloads, service } = await runningService([first]);
  await updatePersistedApiKeys((current) => [...current, second]);
  await service.checkStoredApiKeys();
  service.child = undefined;
  service.server = {};
  await service.updateConfig(createDefaultAppConfig());
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
});

test("a stored key change that is undone before the second tick does not reload", async () => {
  const { reloads, service } = await runningService([first]);
  await updatePersistedApiKeys((current) => [...current, second]);
  await service.checkStoredApiKeys();
  await updatePersistedApiKeys(() => [first]);
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
});

test("a service whose held keys were never stored is left alone", async () => {
  const { reloads, service } = await runningService([first]);
  service.config = { APIKEYS: [second], gateway: { host: "127.0.0.1", port: 0 } };
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
});

test("a stopped gateway and a gateway another process owns are not polled", async () => {
  const { reloads, service } = await runningService([first]);
  await updatePersistedApiKeys((current) => [...current, second]);
  service.status = { ...service.status, gatewayManagedExternally: true };
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  service.status = { ...service.status, gatewayManagedExternally: undefined, state: "stopped" };
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
});

test("a key written while the gateway starts is reloaded once it runs", async () => {
  await updatePersistedApiKeys(() => [first]);
  const service = new gatewayService.constructor();
  const reloads = [];
  service.schedulePersistedRuntimeConfigReload = (revision, force) => { reloads.push([revision, force]); };
  service.routeScriptRuntime.prepare = async () => {
    await updatePersistedApiKeys((current) => [...current, second]);
    return [];
  };
  await service.start(createDefaultAppConfig());
  service.child = {};
  service.status = { coreEndpoint: "", endpoint: "", networkEndpoints: [], state: "running" };
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, [[undefined, false]]);
});

test("a key written while the old gateway stops is reloaded once the new one runs", async () => {
  await updatePersistedApiKeys(() => [first]);
  const service = new gatewayService.constructor();
  const reloads = [];
  service.schedulePersistedRuntimeConfigReload = (revision, force) => { reloads.push([revision, force]); };
  const stopGateway = service.stopGateway.bind(service);
  let written = false;
  service.stopGateway = async (options) => {
    if (!written) {
      written = true;
      await updatePersistedApiKeys((current) => current.filter((key) => key.id !== "first").concat(second));
    }
    return stopGateway(options);
  };
  await service.start(createDefaultAppConfig());
  service.child = {};
  service.status = { coreEndpoint: "", endpoint: "", networkEndpoints: [], state: "running" };
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, [[undefined, false]]);
});

test("a restart after a crash keeps the baseline, so a key written while the child was down is reloaded", async () => {
  const { reloads, service } = await runningService([first]);
  await updatePersistedApiKeys((current) => [...current, second]);
  service.child = undefined;
  await service.startGateway(createDefaultAppConfig(), service.coreRestartGeneration);
  service.child = {};
  service.status = { coreEndpoint: "", endpoint: "", networkEndpoints: [], state: "running" };
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, [[undefined, false]]);
});

test("a key reload that succeeds is not repeated", async () => {
  const { service } = await runningService([first]);
  delete service.schedulePersistedRuntimeConfigReload;
  service.child = undefined;
  service.server = {};
  const starts = [];
  service.start = async (config) => { starts.push(config); return service.getStatus(); };
  await loadAppConfig();
  await service.rememberStoredApiKeys();
  await updatePersistedApiKeys((current) => [...current, second]);
  for (let tick = 0; tick < 4; tick += 1) {
    await service.checkStoredApiKeys();
    await service.runtimeConfigReloadQueue;
  }
  assert.equal(starts.length, 1);
  assert.deepEqual(starts[0].APIKEYS.map((key) => key.id), ["first", "second"]);
});

test("a key restart that fails gets the restart a crash gets", async (t) => {
  t.mock.method(console, "error", () => {});
  const { service } = await runningService([first]);
  delete service.schedulePersistedRuntimeConfigReload;
  service.child = undefined;
  service.server = {};
  service.start = async (config) => {
    service.config = config;
    service.status = { ...service.status, lastError: "Core gateway exited during startup with 1.", state: "error" };
    return service.getStatus();
  };
  const scheduled = [];
  service.scheduleCoreRestart = (generation) => { scheduled.push(generation); };
  await loadAppConfig();
  await service.rememberStoredApiKeys();
  await updatePersistedApiKeys((current) => [...current, second]);
  for (let tick = 0; tick < 4; tick += 1) {
    await service.checkStoredApiKeys();
    await service.runtimeConfigReloadQueue;
  }
  assert.deepEqual(scheduled, [service.coreRestartGeneration]);
});

test("a key reload that is refused while the gateway runs schedules no restart", async (t) => {
  t.mock.method(console, "error", () => {});
  const { service } = await runningService([first]);
  const scheduled = [];
  service.scheduleCoreRestart = (generation) => { scheduled.push(generation); };
  service.start = async () => service.getStatus();
  service.config = await loadAppConfig();
  await service.reloadPersistedRuntimeConfig(undefined, false);
  assert.deepEqual(scheduled, []);
});

test("a key reload onto a stored config that would not run the gateway is refused", async (t) => {
  const { service } = await runningService([first]);
  const logged = t.mock.method(console, "error", () => {});
  const starts = [];
  service.start = async (config) => { starts.push(config); return service.getStatus(); };
  await loadAppConfig();
  await service.reloadPersistedRuntimeConfig(undefined, false);
  assert.deepEqual(starts, []);
  assert.equal(logged.mock.callCount(), 1);
  assert.match(String(logged.mock.calls[0].arguments[0]), /would not run the gateway/);
});

test("a key reload whose config load failed leaves the gateway alone, is logged once and is tried again a minute later", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const logged = t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
  const { reloads, service } = await runningService([first]);
  const taken = [];
  service.start = async (config) => { taken.push(config); return service.getStatus(); };
  service.updateConfig = async (config) => { taken.push(config); };
  await loadAppConfig();
  const database = new Database(APP_CONFIG_DB_FILE);
  assert.equal(database.prepare("UPDATE app_config SET value_json = '{' WHERE key = 'default'").run().changes, 1);
  database.close();
  await service.reloadPersistedRuntimeConfig(undefined, false);
  await service.reloadPersistedRuntimeConfig(undefined, false);
  assert.deepEqual(taken, []);
  assert.equal(logged.mock.callCount(), 1);
  assert.equal(service.runtimeConfigReloadError, undefined);
  service.storedApiKeysActedOn = JSON.stringify([first]);
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
  t.mock.timers.tick(60_000);
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, [[undefined, false]]);
});

test("a key change made while a failed reload waits is reloaded without the wait", async (t) => {
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
  const { service } = await runningService([first]);
  delete service.schedulePersistedRuntimeConfigReload;
  const loads = t.mock.method(service, "reloadPersistedRuntimeConfig");
  await updatePersistedApiKeys((current) => [...current, second]);
  for (let tick = 0; tick < 4; tick += 1) {
    await service.checkStoredApiKeys();
    await service.runtimeConfigReloadQueue;
  }
  assert.equal(loads.mock.callCount(), 1);
  await updatePersistedApiKeys(() => [second]);
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  await service.runtimeConfigReloadQueue;
  assert.equal(loads.mock.callCount(), 2);
});
