import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import { createRequestLogRuntime, RequestLogStore } from "@llmr/core/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "@llmr/core/storage/sqlite-native.ts";

const workerFile = [
  path.resolve(__dirname, "../../../runtime/request-log-worker.js"),
  path.resolve(__dirname, "../../runtime/request-log-worker.js")
].find(existsSync);

const usageBody = '{"usage":{"input_tokens":1000000,"output_tokens":500000}}';
const doubledBody = '{"usage":{"input_tokens":2000000,"output_tokens":1000000}}';
const litellmPrice = { price: { pricing: { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 8 }, source: "litellm" }, state: "priced" };
const otherPrice = { price: { pricing: { inputUsdPerMillionTokens: 4, outputUsdPerMillionTokens: 16 }, source: "models.dev" }, state: "priced" };

function createRecord(requestId, responseBodyText, price = { state: "no-catalog" }) {
  const now = new Date().toISOString();
  return {
    completedAt: now,
    durationMs: 10,
    method: "POST",
    model: "pricing-lock-model",
    path: "/v1/messages",
    price,
    providerName: "pricing-lock-provider",
    requestBody: Buffer.from('{"model":"pricing-lock-model"}'),
    requestHeaders: { "content-type": "application/json" },
    requestId,
    responseBodyText,
    responseHeaders: { "content-type": "application/json" },
    startedAt: now,
    statusCode: 200,
    url: "http://127.0.0.1:3456/v1/messages"
  };
}

function open(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const query = (sql, ...params) => {
    const database = createBetterSqliteDatabase(dbFile);
    try {
      return database.prepare(sql).all(...params).map((row) => ({ ...row }));
    } finally {
      database.close();
    }
  };
  return {
    dbFile,
    dir,
    pending: () => query("SELECT request_id, price_json FROM request_log_pending_prices ORDER BY request_id"),
    query,
    readRow: (requestId) => query("SELECT cost_source, cost_usd, input_tokens, pricing_json FROM request_logs WHERE request_id = ?", requestId)[0] ?? {},
    store: new RequestLogStore(dbFile)
  };
}

const record = (requestId, sequence, body = usageBody, price) => ({ eventId: `${requestId}-event`, input: createRecord(requestId, body, price), kind: "record", sequence });
const priceUpdate = (requestId, price, sequence) => ({ input: [{ price, requestId }], kind: "price-update", sequence });
const rawTrace = (requestId, sequence, body = doubledBody) => ({ input: { requestId, responseBodyText: body }, kind: "raw-trace-update", sequence });
const pricedDoubled = { cost_source: "litellm", cost_usd: 12, input_tokens: 2000000, pricing_json: JSON.stringify(litellmPrice.price.pricing) };

test("a price update and a raw trace that both arrive before their row both apply, in either order", async () => {
  const { dir, pending, query, readRow, store } = open("llmr-price-update-both-parked-");
  try {
    await store.writeBatch([priceUpdate("price-first", litellmPrice, 1), rawTrace("price-first", 2)]);
    await store.writeBatch([rawTrace("trace-first", 3), priceUpdate("trace-first", litellmPrice, 4)]);
    assert.equal(pending().length, 2);
    await store.writeBatch([record("price-first", 5), record("trace-first", 6)]);
    assert.deepEqual(readRow("price-first"), pricedDoubled);
    assert.deepEqual(readRow("trace-first"), pricedDoubled);
    assert.deepEqual(pending(), [], "a taken price is deleted");
    assert.deepEqual(query("SELECT request_id FROM request_log_pending_updates"), []);
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a row that exists takes a raw trace and a price update in either order and ends with the same cost", async () => {
  const { dir, readRow, store } = open("llmr-price-update-existing-order-");
  try {
    await store.writeBatch([record("price-first", 1), record("trace-first", 2)]);
    await store.writeBatch([priceUpdate("price-first", litellmPrice, 3), rawTrace("price-first", 4)]);
    await store.writeBatch([rawTrace("trace-first", 5), priceUpdate("trace-first", litellmPrice, 6)]);
    assert.deepEqual(readRow("price-first"), pricedDoubled);
    assert.deepEqual(readRow("trace-first"), pricedDoubled);
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a price update never replaces a price or an unpriced mark the row already has, and a second update for a priced row changes nothing", async () => {
  const { dir, readRow, store } = open("llmr-price-update-guard-");
  try {
    const custom = { price: { pricing: { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 1 }, source: "custom" }, state: "priced" };
    await store.writeBatch([
      record("unpriced-on-path", 1, usageBody, { state: "unpriced" }),
      record("priced-no-tokens", 2, "{}", custom),
      record("swept", 3),
      record("swept-unpriced", 4)
    ]);
    await store.writeBatch([
      priceUpdate("unpriced-on-path", litellmPrice, 5),
      priceUpdate("priced-no-tokens", litellmPrice, 6),
      priceUpdate("swept", litellmPrice, 7),
      priceUpdate("swept-unpriced", { state: "unpriced" }, 8)
    ]);
    await store.writeBatch([priceUpdate("swept", otherPrice, 9), priceUpdate("swept", { state: "unpriced" }, 10), priceUpdate("swept-unpriced", otherPrice, 11)]);
    assert.deepEqual(readRow("unpriced-on-path"), { cost_source: "unpriced", cost_usd: null, input_tokens: 1000000, pricing_json: "" });
    assert.deepEqual(readRow("priced-no-tokens"), { cost_source: "custom", cost_usd: null, input_tokens: 0, pricing_json: JSON.stringify(custom.price.pricing) });
    assert.deepEqual(readRow("swept"), { cost_source: "litellm", cost_usd: 6, input_tokens: 1000000, pricing_json: JSON.stringify(litellmPrice.price.pricing) });
    assert.deepEqual(readRow("swept-unpriced"), { cost_source: "unpriced", cost_usd: null, input_tokens: 1000000, pricing_json: "" });
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a parked price does not replace the price the request path stored with the row", async () => {
  const { dir, pending, readRow, store } = open("llmr-price-update-parked-guard-");
  try {
    await store.writeBatch([priceUpdate("path-priced", litellmPrice, 1)]);
    await store.writeBatch([record("path-priced", 2, usageBody, otherPrice)]);
    assert.deepEqual(readRow("path-priced"), { cost_source: "models.dev", cost_usd: 12, input_tokens: 1000000, pricing_json: JSON.stringify(otherPrice.price.pricing) });
    assert.deepEqual(pending(), []);
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a later parked price replaces an earlier one for the same request, and a parked unpriced mark is applied to the row", async () => {
  const { dir, pending, readRow, store } = open("llmr-price-update-parked-replace-");
  try {
    await store.writeBatch([priceUpdate("replaced", otherPrice, 1), priceUpdate("replaced", litellmPrice, 2), priceUpdate("marked", { state: "unpriced" }, 3)]);
    assert.equal(pending().length, 2);
    await store.writeBatch([record("replaced", 4), record("marked", 5)]);
    assert.equal(readRow("replaced").cost_usd, 6);
    assert.equal(readRow("replaced").cost_source, "litellm");
    assert.deepEqual(readRow("marked"), { cost_source: "unpriced", cost_usd: null, input_tokens: 1000000, pricing_json: "" });
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a parked price older than the pending window is dropped by the next price update, with no raw trace parked", async () => {
  const { dir, pending, store } = open("llmr-price-update-parked-prune-");
  try {
    await store.writeBatch([priceUpdate("never-logged", litellmPrice, 1)]);
    mock.timers.enable({ apis: ["Date"], now: Date.now() + 6 * 60 * 1000 });
    await store.writeBatch([priceUpdate("fresh", litellmPrice, 2)]);
    assert.deepEqual(pending().map((row) => row.request_id), ["fresh"]);
  } finally { mock.timers.reset(); await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a price update for a row with no tokens stores the price, and the raw trace that brings the tokens prices from it", async () => {
  const { dir, readRow, store } = open("llmr-price-update-no-tokens-");
  try {
    await store.writeBatch([record("late-tokens", 1, "{}")]);
    await store.writeBatch([priceUpdate("late-tokens", litellmPrice, 2)]);
    assert.deepEqual(readRow("late-tokens"), { cost_source: "litellm", cost_usd: null, input_tokens: 0, pricing_json: JSON.stringify(litellmPrice.price.pricing) });
    await store.writeBatch([rawTrace("late-tokens", 3, usageBody)]);
    assert.equal(readRow("late-tokens").cost_usd, 6);
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

// Finding, not a rule: the row keeps one cache-write column, so an update
// prices 1h cache writes at the 5m price. The request path prices them apart.
test("FINDING a waiting row with 1h cache writes is priced lower by an update than the request path prices it", async () => {
  const { dir, readRow, store } = open("llmr-price-update-cache-split-");
  try {
    const body = [
      "event: message_start",
      `data: ${JSON.stringify({ message: { model: "custom-model", usage: { cache_creation: { ephemeral_1h_input_tokens: 100000, ephemeral_5m_input_tokens: 200000 }, cache_creation_input_tokens: 300000, input_tokens: 1000000 } }, type: "message_start" })}`,
      "",
      "event: message_delta",
      `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 500000 } })}`,
      ""
    ].join("\n");
    const split = { price: { pricing: { cacheWrite1hUsdPerMillionTokens: 6, cacheWrite5mUsdPerMillionTokens: 3, inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 8 }, source: "litellm" }, state: "priced" };
    await store.writeBatch([record("on-path", 1, body, split), record("waiting", 2, body)]);
    await store.writeBatch([priceUpdate("waiting", split, 3)]);
    assert.ok(Math.abs(readRow("on-path").cost_usd - 7.2) < 1e-9);
    assert.ok(Math.abs(readRow("waiting").cost_usd - 6.9) < 1e-9, String(readRow("waiting").cost_usd));
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("one price update of 500 rows commits in one writer batch and prices every row", async () => {
  const { dir, query, store } = open("llmr-price-update-page-");
  try {
    const records = Array.from({ length: 500 }, (_unused, index) => record(`row-${index}`, index + 1));
    for (let start = 0; start < records.length; start += 50) await store.writeBatch(records.slice(start, start + 50));
    const started = performance.now();
    await store.writeBatch([{ input: records.map((command) => ({ price: litellmPrice, requestId: command.input.requestId })), kind: "price-update", sequence: 501 }]);
    const elapsed = performance.now() - started;
    assert.deepEqual(query("SELECT COUNT(*) AS priced FROM request_logs WHERE cost_usd = 6 AND cost_source = 'litellm'"), [{ priced: 500 }]);
    console.log(`MEASURED 500 price updates in one writeBatch: ${elapsed.toFixed(1)} ms`);
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a page of 500 price updates is one queue item, runs after the records enqueued before it, and leaves room for records", { timeout: 20000 }, async () => {
  assert.ok(workerFile, "compiled request-log-worker.js must exist");
  const { dbFile, dir, query } = open("llmr-price-update-runtime-");
  const runtime = createRequestLogRuntime({ dbFile, batchMaxWaitMs: 200, queueMaxItems: 100, workerFile });
  try {
    for (let index = 0; index < 5; index += 1) assert.equal(runtime.enqueueRecord(createRecord(`before-${index}`, usageBody)).accepted, true);
    const ids = [...Array.from({ length: 5 }, (_unused, index) => `before-${index}`), ...Array.from({ length: 495 }, (_unused, index) => `after-${index}`)];
    const result = runtime.enqueuePriceUpdates(ids.map((requestId) => ({ price: litellmPrice, requestId })));
    assert.deepEqual(result, { accepted: true, degraded: false });
    assert.equal(runtime.metrics().queueItems + runtime.metrics().inFlightItems, 6, "the page is one item");
    for (let index = 0; index < 5; index += 1) assert.equal(runtime.enqueueRecord(createRecord(`after-${index}`, usageBody)).accepted, true, `record ${index} after the page`);
    assert.equal((await runtime.flush({ timeoutMs: 15000 })).timedOut, false);
    assert.equal(runtime.metrics().dropped, 0);
    assert.equal(runtime.metrics().committed, 11);
    assert.deepEqual(query("SELECT COUNT(*) AS priced FROM request_logs WHERE cost_usd = 6 AND cost_source = 'litellm'"), [{ priced: 10 }]);
    assert.deepEqual(query("SELECT COUNT(*) AS parked FROM request_log_pending_prices"), [{ parked: 490 }]);
  } finally {
    await runtime.close({ timeoutMs: 2000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("a closed runtime refuses a price update and a full queue refuses it without retry", { timeout: 20000 }, async () => {
  assert.ok(workerFile, "compiled request-log-worker.js must exist");
  const { dbFile, dir } = open("llmr-price-update-runtime-refuse-");
  const full = createRequestLogRuntime({ dbFile, queueMaxBytes: 128 * 500 - 1, workerFile });
  const closed = createRequestLogRuntime({ dbFile, workerFile });
  try {
    const page = Array.from({ length: 500 }, (_unused, index) => ({ price: litellmPrice, requestId: `row-${index}` }));
    assert.deepEqual(full.enqueuePriceUpdates(page), { accepted: false, degraded: false, reason: "queue_full" });
    assert.equal(full.enqueuePriceUpdates(page.slice(1)).accepted, true, "128 bytes for each update");
    await closed.close({ timeoutMs: 2000 });
    assert.deepEqual(closed.enqueuePriceUpdates(page), { accepted: false, degraded: false, reason: "closed" });
  } finally {
    await full.close({ timeoutMs: 2000 });
    rmSync(dir, { force: true, recursive: true });
  }
});

test("a row stored with a cost and no recorded source keeps its cost when a price update names it", async () => {
  const { dbFile, dir, readRow, store } = open("llmr-price-update-old-row-");
  try {
    await store.writeBatch([record("old", 1)]);
    const database = createBetterSqliteDatabase(dbFile);
    try {
      database.prepare("UPDATE request_logs SET cost_usd = 5 WHERE request_id = 'old'").run();
    } finally {
      database.close();
    }
    await store.writeBatch([priceUpdate("old", litellmPrice, 2), priceUpdate("old", { state: "unpriced" }, 3)]);
    assert.deepEqual(readRow("old"), { cost_source: "", cost_usd: 5, input_tokens: 1000000, pricing_json: "" });
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a price update that arrives before a row the raw trace itself creates prices that row", async () => {
  const { dir, pending, readRow, store } = open("llmr-request-log-price-update-standalone-test-");
  try {
    const standalone = {
      input: { allowStandaloneRecord: true, method: "POST", model: "m", path: "/v1/messages", price: { state: "no-catalog" }, provider: "p", requestId: "standalone", responseBodyText: usageBody, statusCode: 200 },
      kind: "raw-trace-update",
      sequence: 2
    };
    await store.writeBatch([priceUpdate("standalone", litellmPrice, 1), standalone]);
    assert.deepEqual(
      { cost_source: readRow("standalone").cost_source, cost_usd: readRow("standalone").cost_usd },
      { cost_source: "litellm", cost_usd: 6 }
    );
    assert.deepEqual(pending(), []);
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a price update prices every waiting row of its request, each from its own tokens", async () => {
  const { dir, query, store } = open("llmr-request-log-price-update-shared-id-test-");
  try {
    await store.writeBatch([
      record("shared", 1),
      { ...record("shared", 2, doubledBody), eventId: "shared-second-event" }
    ]);
    await store.writeBatch([priceUpdate("shared", litellmPrice, 3)]);
    assert.deepEqual(
      query("SELECT cost_usd FROM request_logs WHERE request_id = ? ORDER BY id", "shared").map((row) => row.cost_usd),
      [6, 12]
    );
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});
