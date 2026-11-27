import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import test, { after, mock } from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { REQUEST_LOGS_DB_FILE, USAGE_DB_FILE } from "@llmr/core/config/constants.ts";
import { GatewayRequestPipeline } from "@llmr/core/gateway/request/pipeline.ts";
import { LLMRouterPlugin } from "@llmr/core/gateway/llm-router-plugin.ts";
import { preloadUsagePriceCatalog, resolveRequestPrice } from "@llmr/core/models/pricing-service.ts";
import { closeRequestLogRuntime, enqueueGatewayRequestLogPrices, flushRequestLogRuntime, requestLogRuntime } from "@llmr/core/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "@llmr/core/storage/sqlite-native.ts";
import { connectUsagePricing } from "@llmr/core/usage/store.ts";

after(() => closeRequestLogRuntime());

function readRows(file, sql) {
  if (!existsSync(file)) return [];
  const database = createBetterSqliteDatabase(file);
  try {
    return database.prepare(sql).all().map((row) => ({ ...row }));
  } catch {
    return [];
  } finally {
    database.close();
  }
}

async function until(read, message) {
  const deadline = performance.now() + 10_000;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (performance.now() > deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// Review Focus 1 and 5 together: the machine is offline from the first launch,
// two requests are recorded with no cost, the response names a rule alias, and
// a third request after the network returns prices all three in both stores.
test("requests recorded while every price source fails are priced the same in Logs and in the totals by the first request after the network returns", async () => {
  requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
  const config = createDefaultAppConfig();
  config.contextArchive.enabled = false;
  config.observability = { ...config.observability, requestLogBodyCapture: "all", requestLogs: true, requestLogSuccessSampleRate: 1 };
  config.Providers = [{ api_base_url: "https://api.deepseek.com", models: ["shared-model"], name: "DS", type: "anthropic_messages" }];
  connectUsagePricing({
    enqueueRequestLogPrices: enqueueGatewayRequestLogPrices,
    resolvePrice: (provider, model) => resolveRequestPrice(config, provider, model)
  });

  const previousFetch = globalThis.fetch;
  let online = false;
  const loads = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("litellm") || url.includes("openrouter.ai") || url.includes("models.dev")) {
      if (!online) throw new Error("offline");
      if (url.includes("litellm")) return Response.json({ "other-model": { input_cost_per_token: 0.000001, output_cost_per_token: 0.000001 } });
      if (url.includes("openrouter.ai")) return Response.json({ data: [{ id: "lab/other-model", pricing: { completion: "0.000001", prompt: "0.000001" } }] });
      return Response.json({
        deepseek: { models: { "shared-model": { canonical_model_id: "lab/shared-model", cost: { input: 3, output: 3 } } } },
        lab: { models: { "shared-model": { cost: { input: 1, output: 3 } } } }
      });
    }
    if (new URL(url).pathname.startsWith("/__llmr/")) return new Response(null, { status: 404 });
    const body = JSON.stringify({ content: [{ text: "ok", type: "text" }], id: "msg", model: "an-alias-the-catalog-does-not-know", role: "assistant", type: "message", usage: { input_tokens: 1000, output_tokens: 100 } });
    return new Response(body, { headers: { "content-type": "application/json", "x-gateway-target-provider-name": "DS" }, status: 200 });
  };
  const router = new LLMRouterPlugin(config);
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "test",
    getPlugin: () => router,
    getStatus: () => ({ coreEndpoint: "http://127.0.0.1:3457", endpoint: "http://127.0.0.1:3456" }),
    refreshUsagePriceCatalog: () => { loads.push(preloadUsagePriceCatalog()); }
  });
  const send = async () => {
    const request = Readable.from([Buffer.from(JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: "DS/shared-model" }))]);
    request.method = "POST";
    request.url = "/v1/messages";
    request.headers = { "content-type": "application/json" };
    let status;
    const response = new Writable({ write(_chunk, _encoding, done) { done(); } });
    response.writeHead = (value) => { status = value; return response; };
    await pipeline.proxyRequest(request, response, "/v1/messages");
    assert.equal(status, 200);
  };
  const usageRows = () => readRows(USAGE_DB_FILE, "SELECT cost_source, cost_usd, request_id FROM usage_events ORDER BY request_id");
  const logRows = () => readRows(REQUEST_LOGS_DB_FILE, "SELECT cost_source, cost_usd, request_id FROM request_logs ORDER BY request_id");
  try {
    await preloadUsagePriceCatalog({ forceRefresh: true });
    mock.timers.enable({ apis: ["Date"], now: Date.now() });
    await send();
    mock.timers.setTime(Date.now() + 60 * 1000);
    await send();
    await until(() => usageRows().length === 2, "the offline usage rows were not written");
    await until(async () => { await flushRequestLogRuntime(1_000); return logRows().length === 2; }, "the offline log rows were not written");
    await Promise.all(loads);
    assert.deepEqual(usageRows().map((row) => [row.cost_source, row.cost_usd]), [["", null], ["", null]]);
    assert.deepEqual(logRows().map((row) => [row.cost_source, row.cost_usd]), [["", null], ["", null]]);

    online = true;
    mock.timers.setTime(Date.now() + 6 * 60 * 1000);
    await send();
    const usage = await until(() => {
      const rows = usageRows();
      return rows.length === 3 && rows.every((row) => row.cost_usd !== null) && rows;
    }, "the usage rows were not priced");
    const logs = await until(async () => {
      await flushRequestLogRuntime(1_000);
      const rows = logRows();
      return rows.length === 3 && rows.every((row) => row.cost_usd !== null) && rows;
    }, "the log rows were not priced");
    assert.deepEqual(logs, usage);
    for (const row of usage) {
      assert.equal(row.cost_source, "models.dev");
      assert.ok(Math.abs(row.cost_usd - 0.0033) < 1e-12, `priced by the mapped provider and the routed model: ${row.cost_usd}`);
    }
  } finally {
    await Promise.all(loads);
    mock.timers.reset();
    globalThis.fetch = previousFetch;
  }
});
