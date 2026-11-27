import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { removeTestDir, testTempRoot } from "../../support/test-temp-dir.mjs";

const previousRuntimeEnv = {
  appData: process.env.LLMR_INTERNAL_APP_DATA_DIR,
  home: process.env.LLMR_INTERNAL_HOME_DIR,
  userData: process.env.LLMR_INTERNAL_USER_DATA_DIR
};
const runtimeRoot = mkdtempSync(path.join(testTempRoot, "llmr-request-log-retention-save-test-"));
process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(runtimeRoot, "app-data");
process.env.LLMR_INTERNAL_HOME_DIR = path.join(runtimeRoot, "home");
process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(runtimeRoot, "user-data");

after(() => {
  setOptionalEnv("LLMR_INTERNAL_APP_DATA_DIR", previousRuntimeEnv.appData);
  setOptionalEnv("LLMR_INTERNAL_HOME_DIR", previousRuntimeEnv.home);
  setOptionalEnv("LLMR_INTERNAL_USER_DATA_DIR", previousRuntimeEnv.userData);
  removeTestDir(runtimeRoot, ["config.sqlite"]);
});

test("a --no-gateway start and a save both write the retention, and a locked log database does not hold a save up", async () => {
  const { REQUEST_LOGS_DB_FILE } = await import("@llmr/core/config/constants.ts");
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");
  const { gatewayService } = await import("@llmr/core/gateway/service.ts");
  const { requestLogRuntime } = await import("@llmr/core/observability/request-log-store.ts");
  const { createBetterSqliteDatabase } = await import("@llmr/core/storage/sqlite-native.ts");
  const { startWebManagementServer } = await import("@llmr/core/web/management-server.ts");
  requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");

  const authToken = "test-web-auth-token-0123456789abcdef";
  const initial = await loadAppConfig();
  await saveAppConfig({ ...initial, observability: { ...initial.observability, requestLogRetentionDays: 5 } });
  const runtime = await startWebManagementServer({ authToken, host: "127.0.0.1", port: 0, startGateway: false });
  const originalStart = gatewayService.start;
  const originalUpdateConfig = gatewayService.updateConfig;
  let database;
  let locked = false;
  try {
    await waitFor(() => {
      try {
        database ??= createBetterSqliteDatabase(REQUEST_LOGS_DB_FILE);
        return storedDays(database) === "5";
      } catch {
        return false;
      }
    }, 5_000, "a --no-gateway start writes the configured retention");

    gatewayService.start = async () => gatewayService.getStatus();
    gatewayService.updateConfig = async () => undefined;
    const save = async (days) => {
      const config = await loadAppConfig();
      config.observability.requestLogRetentionDays = days;
      const payload = await rpc(runtime.url, authToken, "saveConfig", [config, { applyProfile: false }]);
      assert.equal(payload.ok, true, payload.error);
    };
    await save(12);
    await waitFor(() => storedDays(database) === "12", 5_000, "a save writes the retention");
    // A read prunes once per stored value, and a prune writes, so the query worker reads 12 before the lock.
    assert.equal((await rpc(runtime.url, authToken, "getRequestLogs", [{}])).ok, true);

    database.exec("BEGIN EXCLUSIVE");
    locked = true;
    const startedAt = Date.now();
    await save(3);
    const elapsedMs = Date.now() - startedAt;
    assert.ok(elapsedMs < 2000, `save took ${elapsedMs} ms`);
    assert.equal((await loadAppConfig()).observability.requestLogRetentionDays, 3);
    const page = (await rpc(runtime.url, authToken, "getRequestLogs", [{}])).value;
    assert.equal(page.retentionDays, 12);
    assert.equal(page.retentionRequestedDays, 3);
    database.exec("ROLLBACK");
    locked = false;

    await save(3);
    await waitFor(
      () => storedDays(database) === "3",
      10_000,
      "the retention lands once the lock is gone, within the writer's 5-second busy timeout and a resend"
    );
    const applied = (await rpc(runtime.url, authToken, "getRequestLogs", [{}])).value;
    assert.equal(applied.retentionDays, 3);
    assert.equal(applied.retentionRequestedDays, undefined);
  } finally {
    if (locked) database.exec("ROLLBACK");
    database?.close();
    gatewayService.start = originalStart;
    gatewayService.updateConfig = originalUpdateConfig;
    await runtime.close();
  }
});

function storedDays(database) {
  return database.prepare("SELECT value FROM request_log_settings WHERE key = 'retention_days'").get()?.value;
}

async function waitFor(condition, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    assert.ok(Date.now() < deadline, `timed out: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
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

function setOptionalEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
