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

// A closed runtime stays closed, so it closes once, after every test here.
after(() => closeRequestLogRuntime());

// The base URL maps to models.dev's "deepseek" provider, whose price differs
// from the maker's: only the pipeline's lookup uses that mapping.
const modelsDev = (input, output) => ({
  deepseek: { models: { "shared-model": { canonical_model_id: "lab/shared-model", cost: { input, output } } } },
  lab: { models: { "shared-model": { cost: { input: 1, output: 3 } } } }
});

function catalogFetch(modelsDevPayload) {
  return async (input) => {
    const url = String(input);
    if (url.includes("litellm")) return Response.json({ "other-model": { input_cost_per_token: 0.000001, output_cost_per_token: 0.000001 } });
    if (url.includes("models.dev")) return Response.json(modelsDevPayload);
    if (url.includes("openrouter.ai")) return Response.json({ data: [{ id: "lab/other-model", pricing: { completion: "0.000001", prompt: "0.000001" } }] });
    return undefined;
  };
}

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

test("one request through the pipeline stores the same cost and source in its log row and its usage row", async () => {
  requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
  const config = createDefaultAppConfig();
  config.contextArchive.enabled = false;
  config.observability = { ...config.observability, requestLogBodyCapture: "all", requestLogs: true, requestLogSuccessSampleRate: 1 };
  config.Providers = [{ api_base_url: "https://api.deepseek.com", models: ["shared-model"], name: "DS", type: "anthropic_messages" }];

  const previousFetch = globalThis.fetch;
  globalThis.fetch = catalogFetch(modelsDev(0.3, 0.9));
  await preloadUsagePriceCatalog({ forceRefresh: true });
  // A day later the catalog is stale, and the refresh the request starts
  // serves other prices. A second lookup inside the request would see them.
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 25 * 60 * 60 * 1000 });
  const servedCatalog = catalogFetch(modelsDev(0.6, 1.8));
  let reload;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const catalog = await servedCatalog(input);
    if (catalog) return catalog;
    if (new URL(url).pathname.startsWith("/__llmr/")) return new Response(null, { status: 404 });
    const body = JSON.stringify({ content: [{ text: "ok", type: "text" }], id: "msg", model: "shared-model", role: "assistant", type: "message", usage: { input_tokens: 1000, output_tokens: 100 } });
    return new Response(body, { headers: { "content-type": "application/json", "x-gateway-target-provider-name": "DS" }, status: 200 });
  };
  const router = new LLMRouterPlugin(config);
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "test",
    getPlugin: () => router,
    getStatus: () => ({ coreEndpoint: "http://127.0.0.1:3457", endpoint: "http://127.0.0.1:3456" }),
    refreshUsagePriceCatalog: () => { reload = preloadUsagePriceCatalog({ forceRefresh: true }); }
  });
  try {
    const request = Readable.from([Buffer.from(JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: "DS/shared-model" }))]);
    request.method = "POST";
    request.url = "/v1/messages";
    request.headers = { "content-type": "application/json" };
    let status;
    const response = new Writable({ write(_chunk, _encoding, done) { done(); } });
    response.writeHead = (value) => { status = value; return response; };
    await pipeline.proxyRequest(request, response, "/v1/messages");
    assert.equal(status, 200);

    const [usageRow] = await until(() => {
      const rows = readRows(USAGE_DB_FILE, "SELECT cost_source, cost_usd, request_id FROM usage_events");
      return rows.length > 0 && rows;
    }, "the usage row was not written");
    const [logRow] = await until(async () => {
      await flushRequestLogRuntime(1_000);
      const rows = readRows(REQUEST_LOGS_DB_FILE, "SELECT cost_source, cost_usd, request_id FROM request_logs");
      return rows.length > 0 && rows;
    }, "the log row was not written");

    assert.deepEqual(logRow, usageRow);
    assert.equal(usageRow.cost_source, "models.dev");
    assert.ok(Math.abs(usageRow.cost_usd - 0.00039) < 1e-12, `priced by the mapped provider: ${usageRow.cost_usd}`);
  } finally {
    await reload;
    mock.timers.reset();
    globalThis.fetch = previousFetch;
  }
});

test("a request written while no price source is loaded gets the full rule's price in both rows once the catalog loads", async () => {
  requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
  const config = createDefaultAppConfig();
  config.contextArchive.enabled = false;
  config.observability = { ...config.observability, requestLogBodyCapture: "all", requestLogs: true, requestLogSuccessSampleRate: 1 };
  config.Providers = [{ api_base_url: "https://api.deepseek.com", models: ["shared-model"], name: "DS", type: "anthropic_messages" }];

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  await preloadUsagePriceCatalog({ forceRefresh: true });
  // A failed source is retried after 5 minutes. Six minutes later the usage
  // write sees a catalog due for a refresh and starts the sweep.
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 6 * 60 * 1000 });
  connectUsagePricing({
    enqueueRequestLogPrices: enqueueGatewayRequestLogPrices,
    resolvePrice: (provider, model) => resolveRequestPrice(config, provider, model)
  });
  const servedCatalog = catalogFetch(modelsDev(3, 3));
  const loads = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    const catalog = await servedCatalog(input);
    if (catalog) return catalog;
    if (new URL(url).pathname.startsWith("/__llmr/")) return new Response(null, { status: 404 });
    const body = JSON.stringify({ content: [{ text: "ok", type: "text" }], id: "msg", model: "shared-model", role: "assistant", type: "message", usage: { input_tokens: 1000, output_tokens: 100 } });
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
  const earlier = new Set(readRows(USAGE_DB_FILE, "SELECT request_id FROM usage_events").map((row) => row.request_id));
  const ownRows = (rows) => rows.filter((row) => !earlier.has(row.request_id));
  try {
    const request = Readable.from([Buffer.from(JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: "DS/shared-model" }))]);
    request.method = "POST";
    request.url = "/v1/messages";
    request.headers = { "content-type": "application/json" };
    let status;
    const response = new Writable({ write(_chunk, _encoding, done) { done(); } });
    response.writeHead = (value) => { status = value; return response; };
    await pipeline.proxyRequest(request, response, "/v1/messages");
    assert.equal(status, 200);

    const priced = (rows) => rows.length > 0 && rows[0].cost_usd !== null && rows;
    const [usageRow] = await until(() => priced(ownRows(readRows(USAGE_DB_FILE, "SELECT cost_source, cost_usd, request_id FROM usage_events"))), "the usage row was not priced");
    const [logRow] = await until(async () => {
      await flushRequestLogRuntime(1_000);
      return priced(ownRows(readRows(REQUEST_LOGS_DB_FILE, "SELECT cost_source, cost_usd, request_id FROM request_logs")));
    }, "the log row was not priced");
    assert.deepEqual(logRow, usageRow);
    assert.equal(usageRow.cost_source, "models.dev");
    assert.ok(Math.abs(usageRow.cost_usd - 0.0033) < 1e-12, `priced by the mapped provider, not the maker: ${usageRow.cost_usd}`);
  } finally {
    await Promise.all(loads);
    mock.timers.reset();
    globalThis.fetch = previousFetch;
  }
});

// 150,000 prompt tokens over the tier's 100,000: 150,000 at $3 and 100 at $6 per million.
const tieredModelsDev = {
  deepseek: { models: { "shared-model": { cost: { input: 1, output: 2, tiers: [{ input: 3, output: 6, tier: { size: 100000, type: "context" } }] } } } }
};
const tieredCost = 0.4506;

async function proxyLongPrompt(config, onRefresh) {
  const servedCatalog = catalogFetch(tieredModelsDev);
  globalThis.fetch = async (input) => {
    const catalog = await servedCatalog(input);
    if (catalog) return catalog;
    if (new URL(String(input)).pathname.startsWith("/__llmr/")) return new Response(null, { status: 404 });
    const body = JSON.stringify({ content: [{ text: "ok", type: "text" }], id: "msg", model: "shared-model", role: "assistant", type: "message", usage: { input_tokens: 150000, output_tokens: 100 } });
    return new Response(body, { headers: { "content-type": "application/json", "x-gateway-target-provider-name": "DS" }, status: 200 });
  };
  const router = new LLMRouterPlugin(config);
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "test",
    getPlugin: () => router,
    getStatus: () => ({ coreEndpoint: "http://127.0.0.1:3457", endpoint: "http://127.0.0.1:3456" }),
    refreshUsagePriceCatalog: onRefresh
  });
  const request = Readable.from([Buffer.from(JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: "DS/shared-model" }))]);
  request.method = "POST";
  request.url = "/v1/messages";
  request.headers = { "content-type": "application/json" };
  let status;
  const response = new Writable({ write(_chunk, _encoding, done) { done(); } });
  response.writeHead = (value) => { status = value; return response; };
  await pipeline.proxyRequest(request, response, "/v1/messages");
  assert.equal(status, 200);
}

function longPromptConfig() {
  requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js");
  const config = createDefaultAppConfig();
  config.contextArchive.enabled = false;
  config.observability = { ...config.observability, requestLogBodyCapture: "all", requestLogs: true, requestLogSuccessSampleRate: 1 };
  config.Providers = [{ api_base_url: "https://api.deepseek.com", models: ["shared-model"], name: "DS", type: "anthropic_messages" }];
  return config;
}

async function pricedRows(earlier) {
  const own = (rows) => rows.filter((row) => !earlier.has(row.request_id));
  const priced = (rows) => rows.length > 0 && rows[0].cost_usd !== null && rows;
  const [usageRow] = await until(() => priced(own(readRows(USAGE_DB_FILE, "SELECT cost_source, cost_usd, request_id FROM usage_events"))), "the usage row was not priced");
  const [logRow] = await until(async () => {
    await flushRequestLogRuntime(1_000);
    return priced(own(readRows(REQUEST_LOGS_DB_FILE, "SELECT cost_source, cost_usd, request_id FROM request_logs")));
  }, "the log row was not priced");
  return { logRow, usageRow };
}

function earlierRequestIds() {
  return new Set(readRows(USAGE_DB_FILE, "SELECT request_id FROM usage_events").map((row) => row.request_id));
}

test("a prompt over a catalog tier's size is priced at that tier in its log row and its usage row", async () => {
  const config = longPromptConfig();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = catalogFetch(tieredModelsDev);
  await preloadUsagePriceCatalog({ forceRefresh: true });
  const earlier = earlierRequestIds();
  try {
    await proxyLongPrompt(config, () => {});
    const { logRow, usageRow } = await pricedRows(earlier);
    assert.deepEqual(logRow, usageRow);
    assert.ok(Math.abs(usageRow.cost_usd - tieredCost) < 1e-12, `priced at the tier: ${usageRow.cost_usd}`);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a long prompt written before the catalog loads is priced at the tier by the sweep and the price update", async () => {
  const config = longPromptConfig();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  await preloadUsagePriceCatalog({ forceRefresh: true });
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 6 * 60 * 1000 });
  connectUsagePricing({
    enqueueRequestLogPrices: enqueueGatewayRequestLogPrices,
    resolvePrice: (provider, model) => resolveRequestPrice(config, provider, model)
  });
  const loads = [];
  const earlier = earlierRequestIds();
  try {
    await proxyLongPrompt(config, () => { loads.push(preloadUsagePriceCatalog()); });
    const { logRow, usageRow } = await pricedRows(earlier);
    assert.deepEqual(logRow, usageRow);
    assert.ok(Math.abs(usageRow.cost_usd - tieredCost) < 1e-12, `priced at the tier: ${usageRow.cost_usd}`);
  } finally {
    await Promise.all(loads);
    mock.timers.reset();
    globalThis.fetch = previousFetch;
  }
});
