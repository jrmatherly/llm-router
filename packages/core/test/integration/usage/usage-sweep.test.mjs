import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { RequestLogStore } from "@llmr/core/observability/request-log-store.ts";
import { providerRuntimeId } from "@llmr/core/routing/model-registry.ts";
import { createBetterSqliteDatabase } from "@llmr/core/storage/sqlite-native.ts";
import { UsageStore } from "@llmr/core/usage/store.ts";
import { removeTestDir, testTempRoot } from "../../support/test-temp-dir.mjs";

globalThis.fetch = async () => {
  throw new Error("usage sweep tests do not reach the network");
};

const price = { price: { pricing: { inputUsdPerMillionTokens: 100_000, outputUsdPerMillionTokens: 0 }, source: "litellm" }, state: "priced" };
const event = { durationMs: 1, method: "POST", model: "known-model", path: "/v1/messages", price: { state: "no-catalog" }, provider: "alpha", statusCode: 200, usage: { inputTokens: 10, outputTokens: 1 } };

function open(prefix, options = {}) {
  const dir = mkdtempSync(path.join(testTempRoot, prefix));
  const file = path.join(dir, "usage.sqlite");
  const query = (sql, ...params) => {
    const database = createBetterSqliteDatabase(file);
    try {
      return database.prepare(sql).all(...params).map((row) => ({ ...row }));
    } finally {
      database.close();
    }
  };
  return {
    dir,
    file,
    query,
    row: (requestId) => query("SELECT cost_source, cost_usd FROM usage_events WHERE request_id = ?", requestId)[0],
    store: new UsageStore(file, { loadPriceCatalog: async () => {}, priceCatalogNeedsRefresh: () => true, ...options })
  };
}

async function until(read) {
  const deadline = performance.now() + 2_000;
  while (!(await read()) && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

test("a sweep that finds no catalog writes nothing and sends nothing, and the next sweep prices the row", async () => {
  const { dir, row, store } = open("llmr-usage-sweep-no-catalog-");
  try {
    let outcome = { state: "no-catalog" };
    const sent = [];
    store.connectPricing({ enqueueRequestLogPrices: (updates) => sent.push(...updates), resolvePrice: () => outcome });
    await store.record({ ...event, requestId: "first" });
    await settle();
    assert.deepEqual(row("first"), { cost_source: "", cost_usd: null });
    assert.deepEqual(sent, []);
    outcome = price;
    await store.record({ ...event, requestId: "second" });
    await until(() => row("first").cost_usd !== null && row("second").cost_usd !== null);
    assert.deepEqual(row("first"), { cost_source: "litellm", cost_usd: 1 });
    assert.deepEqual(sent.map((update) => update.requestId).sort(), ["first", "second"]);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("the sweep sends one list of at most 500 updates for each page, after the page's rows are written", async () => {
  const { dir, query, store } = open("llmr-usage-sweep-pages-");
  try {
    const calls = [];
    await store.record({ ...event, price: { state: "unpriced" }, requestId: "seed" });
    const database = createBetterSqliteDatabase(path.join(dir, "usage.sqlite"));
    try {
      const insert = database.prepare("INSERT INTO usage_events (created_at, request_id, method, path, model, provider, input_tokens, total_tokens) VALUES (?, ?, 'POST', '/v1/messages', 'known-model', 'alpha', 10, 10)");
      database.transaction(() => {
        for (let index = 0; index < 1_200; index += 1) insert.run(new Date().toISOString(), `row-${index}`);
      })();
    } finally {
      database.close();
    }
    store.connectPricing({
      enqueueRequestLogPrices: (updates) => {
        const ids = updates.map((update) => update.requestId);
        const written = query(`SELECT COUNT(*) AS priced FROM usage_events WHERE cost_usd IS NOT NULL AND request_id IN (${ids.map(() => "?").join(",")})`, ...ids)[0].priced;
        calls.push({ size: updates.length, written });
      },
      resolvePrice: () => price
    });
    await store.record({ ...event, requestId: "trigger" });
    await until(() => query("SELECT COUNT(*) AS waiting FROM usage_events WHERE cost_usd IS NULL AND cost_source = ''")[0].waiting === 0);
    await settle();
    const first = calls.slice(0, 3);
    assert.deepEqual(first, [{ size: 500, written: 500 }, { size: 500, written: 500 }, { size: 201, written: 201 }]);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("recordCapture stores the routed model as the model to price by, so a sweep prices a row whose response named a rule alias", async () => {
  const { dir, query, row, store } = open("llmr-usage-sweep-alias-");
  try {
    const provider = { baseUrl: "https://api.example.com", models: ["Vendor/some-model"], name: "ProviderA", type: "anthropic_messages" };
    const asked = [];
    store.connectPricing({
      enqueueRequestLogPrices: () => undefined,
      resolvePrice: (providerName, model) => {
        asked.push([providerName, model]);
        return model === "Vendor/some-model" ? price : { state: "unpriced" };
      }
    });
    await store.recordCapture({
      bodyText: JSON.stringify({ model: "my-alias", usage: { input_tokens: 10, output_tokens: 1 } }),
      config: { Providers: [provider] },
      durationMs: 40,
      fallbackModel: `${providerRuntimeId(provider)}::anthropic_messages/Vendor/some-model`,
      method: "POST",
      path: "/v1/messages",
      price: { state: "no-catalog" },
      providerName: `${providerRuntimeId(provider)}::anthropic_messages`,
      requestId: "alias-request",
      responseHeaders: new Headers({ "content-type": "application/json" }),
      statusCode: 200
    });
    await until(() => row("alias-request").cost_source !== "");
    assert.deepEqual(query("SELECT model, price_model, provider FROM usage_events"), [{ model: "my-alias", price_model: "Vendor/some-model", provider: "ProviderA" }]);
    assert.deepEqual(row("alias-request"), { cost_source: "litellm", cost_usd: 1 });
    assert.deepEqual(asked[0], ["ProviderA", "Vendor/some-model"]);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("a usage database made before the price_model column gains it, and its old rows are priced by their model", async () => {
  const { dir, file, row } = open("llmr-usage-sweep-old-database-");
  try {
    await new UsageStore(file).record({ ...event, requestId: "old" });
    const legacy = createBetterSqliteDatabase(file);
    try {
      legacy.exec("ALTER TABLE usage_events DROP COLUMN price_model");
    } finally {
      legacy.close();
    }
    const store = new UsageStore(file, { loadPriceCatalog: async () => {}, priceCatalogNeedsRefresh: () => true });
    store.connectPricing({ enqueueRequestLogPrices: () => undefined, resolvePrice: (_provider, model) => model === "known-model" ? price : { state: "unpriced" } });
    await store.record({ ...event, requestId: "new" });
    await until(() => row("old").cost_usd !== null);
    assert.deepEqual(row("old"), { cost_source: "litellm", cost_usd: 1 });
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("a waiting request ends with the same cost and source in its usage row and its log row, whichever store hears of the price first", async () => {
  const { dir, row, store } = open("llmr-usage-sweep-both-stores-");
  const logs = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    const logRow = async (requestId) => ({ ...(await logs.getDatabase()).prepare("SELECT cost_source, cost_usd FROM request_logs WHERE request_id = ?").get(requestId) });
    const now = new Date().toISOString();
    const logRecord = (requestId, sequence) => ({
      eventId: `${requestId}-event`,
      input: { completedAt: now, durationMs: 1, method: "POST", model: "known-model", path: "/v1/messages", price: { state: "no-catalog" }, providerName: "alpha", requestBody: Buffer.from("{}"), requestHeaders: {}, requestId, responseBodyText: '{"usage":{"input_tokens":10,"output_tokens":1}}', responseHeaders: {}, startedAt: now, statusCode: 200, url: "http://127.0.0.1:3456/v1/messages" },
      kind: "record",
      sequence
    });
    let sequence = 10;
    let writes = Promise.resolve();
    store.connectPricing({
      enqueueRequestLogPrices: (updates) => { writes = writes.then(() => logs.writeBatch([{ input: updates, kind: "price-update", sequence: sequence += 1 }])); },
      resolvePrice: () => price
    });
    await logs.writeBatch([logRecord("log-first", 1)]);
    await store.record({ ...event, requestId: "log-first" });
    await store.record({ ...event, requestId: "usage-first" });
    await until(() => row("usage-first").cost_usd !== null);
    await writes;
    await logs.writeBatch([logRecord("usage-first", 99)]);
    for (const requestId of ["log-first", "usage-first"]) {
      assert.deepEqual(await logRow(requestId), row(requestId), requestId);
      assert.deepEqual(row(requestId), { cost_source: "litellm", cost_usd: 1 });
    }
  } finally {
    await logs.close();
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

// Finding, not a rule: a raw trace re-prices the log row from its own tokens
// and the usage row is never touched again, as for a row priced on the request path.
test("FINDING a raw trace that changes a swept row's tokens leaves the log row and the usage row with different costs", async () => {
  const { dir, row, store } = open("llmr-usage-sweep-raw-trace-");
  const logs = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    const now = new Date().toISOString();
    let writes = Promise.resolve();
    store.connectPricing({
      enqueueRequestLogPrices: (updates) => { writes = writes.then(() => logs.writeBatch([{ input: updates, kind: "price-update", sequence: 2 }])); },
      resolvePrice: () => price
    });
    await logs.writeBatch([{
      eventId: "event",
      input: { completedAt: now, durationMs: 1, method: "POST", model: "known-model", path: "/v1/messages", price: { state: "no-catalog" }, providerName: "alpha", requestBody: Buffer.from("{}"), requestHeaders: {}, requestId: "request", responseBodyText: '{"usage":{"input_tokens":10,"output_tokens":1}}', responseHeaders: {}, startedAt: now, statusCode: 200, url: "http://127.0.0.1:3456/v1/messages" },
      kind: "record",
      sequence: 1
    }]);
    await store.record({ ...event, requestId: "request" });
    await until(() => row("request").cost_usd !== null);
    await writes;
    await logs.writeBatch([{ input: { requestId: "request", responseBodyText: '{"usage":{"input_tokens":30,"output_tokens":1}}' }, kind: "raw-trace-update", sequence: 3 }]);
    const logRow = { ...(await logs.getDatabase()).prepare("SELECT cost_source, cost_usd FROM request_logs WHERE request_id = 'request'").get() };
    assert.deepEqual(row("request"), { cost_source: "litellm", cost_usd: 1 });
    assert.deepEqual(logRow, { cost_source: "litellm", cost_usd: 3 });
  } finally {
    await logs.close();
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("a row recorded with no catalog after the catalog has landed is swept, and one recorded while the rule still finds no catalog starts no sweep", async () => {
  let loads = 0;
  const { dir, row, store } = open("llmr-usage-sweep-not-due-", { loadPriceCatalog: async () => { loads += 1; }, priceCatalogNeedsRefresh: () => false });
  try {
    let outcome = { state: "no-catalog" };
    store.connectPricing({ enqueueRequestLogPrices: () => undefined, resolvePrice: () => outcome });
    await store.record({ ...event, requestId: "still-none" });
    await settle();
    assert.equal(loads, 0);
    outcome = price;
    await store.record({ ...event, requestId: "landed" });
    await until(() => row("landed").cost_usd !== null);
    assert.deepEqual(row("landed"), { cost_source: "litellm", cost_usd: 1 });
    assert.deepEqual(row("still-none"), { cost_source: "litellm", cost_usd: 1 });
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("a row whose resolved price gives no amount for its tokens stays waiting and sends nothing", async () => {
  const { dir, row, store } = open("llmr-usage-sweep-zero-amount-");
  try {
    const sent = [];
    const outputOnly = { price: { pricing: { inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 5 }, source: "models.dev" }, state: "priced" };
    store.connectPricing({ enqueueRequestLogPrices: (updates) => sent.push(...updates), resolvePrice: (_provider, model) => model === "input-only" ? outputOnly : price });
    await store.record({ ...event, model: "input-only", requestId: "zero", usage: { inputTokens: 10 } });
    await store.record({ ...event, requestId: "marker" });
    await until(() => row("marker").cost_usd !== null);
    await settle();
    assert.deepEqual(row("zero"), { cost_source: "", cost_usd: null });
    assert.deepEqual(sent.map((update) => update.requestId), ["marker"]);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("a waiting log row copied into the totals is priced by the routed model the log row holds, in both rows", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-sweep-copied-routed-"));
  const logFile = path.join(dir, "request-logs.sqlite");
  const logs = new RequestLogStore(logFile);
  try {
    const now = new Date().toISOString();
    await logs.writeBatch([{
      eventId: "event",
      input: { completedAt: now, durationMs: 1, method: "POST", model: "Vendor/some-model", path: "/v1/messages", price: { state: "no-catalog" }, providerName: "ProviderA", requestBody: Buffer.from("{}"), requestHeaders: {}, requestId: "copied", resolvedModel: "Vendor/some-model", responseBodyText: '{"model":"my-alias","usage":{"input_tokens":10,"output_tokens":1}}', responseHeaders: {}, startedAt: now, statusCode: 200, url: "http://127.0.0.1:3456/v1/messages" },
      kind: "record",
      sequence: 1
    }]);
    const store = new UsageStore(path.join(dir, "usage.sqlite"), { loadPriceCatalog: async () => {}, priceCatalogNeedsRefresh: () => true, requestLogDbFile: logFile });
    let writes = Promise.resolve();
    store.connectPricing({
      enqueueRequestLogPrices: (updates) => { writes = writes.then(() => logs.writeBatch([{ input: updates, kind: "price-update", sequence: 2 }])); },
      resolvePrice: (_provider, model) => model === "Vendor/some-model" || model === "known-model" ? price : { state: "unpriced" }
    });
    await store.getStats("24h", { includeProxy: true });
    await store.record({ ...event, requestId: "trigger" });
    const read = (database, table) => ({ ...database.prepare(`SELECT cost_source, cost_usd FROM ${table} WHERE request_id = 'copied'`).get() });
    await until(async () => read(await store.getDatabase(), "usage_events").cost_source !== "");
    await writes;
    assert.deepEqual({ ...(await store.getDatabase()).prepare("SELECT price_model FROM usage_events WHERE request_id = 'copied'").get() }, { price_model: "Vendor/some-model" });
    assert.deepEqual(read(await store.getDatabase(), "usage_events"), { cost_source: "litellm", cost_usd: 1 });
    assert.deepEqual(read(await logs.getDatabase(), "request_logs"), { cost_source: "litellm", cost_usd: 1 });
  } finally {
    await logs.close();
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("a log database with no resolved_model column is still copied into the totals", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-sweep-copied-old-log-"));
  const logFile = path.join(dir, "request-logs.sqlite");
  try {
    const legacy = createBetterSqliteDatabase(logFile);
    try {
      legacy.exec(`CREATE TABLE request_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, source_usage_id INTEGER, created_at TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT '', client TEXT NOT NULL DEFAULT 'unknown', method TEXT NOT NULL, path TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'unknown', credential_id TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT 'unknown', status_code INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0, total_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL)`);
      legacy.prepare("INSERT INTO request_logs (created_at, request_id, method, path, provider, model, input_tokens, output_tokens, total_tokens) VALUES (?, 'old-log', 'POST', '/v1/messages', 'alpha', 'known-model', 10, 1, 11)").run(new Date().toISOString());
    } finally {
      legacy.close();
    }
    const store = new UsageStore(path.join(dir, "usage.sqlite"), { loadPriceCatalog: async () => {}, priceCatalogNeedsRefresh: () => true, requestLogDbFile: logFile });
    await store.getStats("24h", { includeProxy: true });
    assert.deepEqual({ ...(await store.getDatabase()).prepare("SELECT model, price_model FROM usage_events WHERE request_id = 'old-log'").get() }, { model: "known-model", price_model: "" });
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});
