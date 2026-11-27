import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test, { after, mock } from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { REQUEST_LOGS_DB_FILE, USAGE_DB_FILE } from "@llmr/core/config/constants.ts";
import { gatewayService } from "@llmr/core/gateway/application/gateway-service.ts";
import { closeRequestLogRuntime, flushRequestLogRuntime, requestLogRuntime } from "@llmr/core/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "@llmr/core/storage/sqlite-native.ts";
import { usageStore } from "@llmr/core/usage/store.ts";

globalThis.fetch = async () => {
  throw new Error("offline");
};

after(() => { mock.timers.reset(); return closeRequestLogRuntime(); });

function usageRow(requestId) {
  const database = createBetterSqliteDatabase(USAGE_DB_FILE);
  try {
    return { ...database.prepare("SELECT cost_source, cost_usd FROM usage_events WHERE request_id = ?").get(requestId) };
  } finally {
    database.close();
  }
}

async function until(read) {
  const deadline = performance.now() + 5_000;
  while (!read() && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
}

function configWith(observability) {
  const config = createDefaultAppConfig();
  config.observability = { ...config.observability, agentAnalysis: false, requestLogs: false, ...observability };
  config.Providers = [{
    api_base_url: "https://api.example.com",
    modelMetadata: { "priced-model": { pricing: { inputUsdPerMillionTokens: 100_000, outputUsdPerMillionTokens: 0 } } },
    models: ["priced-model"],
    name: "P",
    type: "anthropic_messages"
  }];
  return config;
}

const event = { durationMs: 1, method: "POST", model: "priced-model", path: "/v1/messages", price: { state: "no-catalog" }, provider: "P", statusCode: 200, usage: { inputTokens: 10, outputTokens: 1 } };

test("the gateway's sweep prices by the gateway's config, and with request logs off it sends no price to the log queue and creates no log database", async () => {
  requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
  gatewayService.config = configWith({});
  await usageStore.record({ ...event, requestId: "logs-off" });
  await until(() => usageRow("logs-off").cost_usd !== null);
  assert.deepEqual(usageRow("logs-off"), { cost_source: "custom", cost_usd: 1 });
  assert.equal(requestLogRuntime.metrics().accepted, 0);
  assert.equal(existsSync(REQUEST_LOGS_DB_FILE), false);
});

test("with request logs on the gateway's sweep sends the price to the log queue", async () => {
  // A failed source is due again after 5 minutes, and only a due catalog starts a sweep.
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 6 * 60 * 1000 });
  gatewayService.config = configWith({ requestLogs: true });
  await usageStore.record({ ...event, requestId: "logs-on" });
  await until(() => usageRow("logs-on").cost_usd !== null);
  await until(() => requestLogRuntime.metrics().accepted === 1);
  assert.equal(requestLogRuntime.metrics().accepted, 1);
  await flushRequestLogRuntime(2_000);
  const database = createBetterSqliteDatabase(REQUEST_LOGS_DB_FILE);
  try {
    assert.deepEqual(database.prepare("SELECT request_id FROM request_log_pending_prices").all().map((row) => row.request_id), ["logs-on"]);
  } finally {
    database.close();
  }
});

test("before the gateway has a config the sweep finds no catalog and sends nothing", async () => {
  mock.timers.setTime(Date.now() + 6 * 60 * 1000);
  gatewayService.config = undefined;
  await usageStore.record({ ...event, requestId: "no-config" });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(usageRow("no-config"), { cost_source: "", cost_usd: null });
  assert.equal(requestLogRuntime.metrics().accepted, 1);
});
