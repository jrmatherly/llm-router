import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { preloadUsagePriceCatalog } from "@llmr/core/models/pricing-service.ts";
import { RequestLogStore } from "@llmr/core/observability/request-log-store.ts";
import { createBetterSqliteDatabase } from "@llmr/core/storage/sqlite-native.ts";

test("RequestLogStore applies persisted custom model pricing to raw trace usage updates", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-request-log-custom-pricing-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const store = new RequestLogStore(dbFile);
  try {
    const record = createRecord(
      "custom-pricing-request",
      '{"usage":{"input_tokens":1000000,"output_tokens":500000}}'
    );
    record.model = "custom-model";
    record.providerName = "custom-provider";
    record.requestHeaders = {
      "content-type": "application/json",
      "user-agent": "openai-codex test",
      "x-codex-session-id": "custom-pricing-session"
    };
    record.price = {
      price: {
        pricing: {
          inputUsdPerMillionTokens: 2,
          outputUsdPerMillionTokens: 8
        },
        source: "custom"
      },
      state: "priced"
    };
    await store.writeBatch([{
      eventId: "custom-pricing-event",
      input: record,
      kind: "record",
      sequence: 1
    }]);

    let page = await store.list({ pageSize: 10 });
    let detail = await store.getDetail({ id: page.items[0].id });
    assert.equal(detail.costUsd, 6);
    let analysis = await store.analyze({
      range: "30d",
      sessionAgent: "codex",
      sessionId: "custom-pricing-session"
    });
    assert.equal(
      analysis.selectedSession?.trace.runs.find((run) => run.id === analysis.selectedSession?.trace.rootRunId)?.costUsd,
      6
    );
    assert.equal(
      analysis.selectedSession?.trace.runs.find((run) => run.kind === "llm")?.costUsd,
      6
    );

    assert.equal(await store.updateFromRawTrace({
      model: "custom-model",
      provider: "custom-provider",
      requestId: "custom-pricing-request",
      responseBodyText: '{"usage":{"input_tokens":2000000,"output_tokens":1000000}}'
    }), true);
    page = await store.list({ pageSize: 10 });
    detail = await store.getDetail({ id: page.items[0].id });
    assert.equal(detail.costUsd, 12);
    analysis = await store.analyze({
      range: "30d",
      sessionAgent: "codex",
      sessionId: "custom-pricing-session"
    });
    assert.equal(
      analysis.selectedSession?.trace.runs.find((run) => run.kind === "llm")?.costUsd,
      12
    );
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("RequestLogStore prices Anthropic 5m and 1h cache writes separately", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-request-log-cache-duration-pricing-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const store = new RequestLogStore(dbFile);
  try {
    const record = createRecord(
      "cache-duration-pricing-request",
      [
        "event: message_start",
        `data: ${JSON.stringify({
          message: {
            model: "custom-model",
            usage: {
              cache_creation: {
                ephemeral_1h_input_tokens: 100000,
                ephemeral_5m_input_tokens: 200000
              },
              cache_creation_input_tokens: 300000,
              input_tokens: 1000000
            }
          },
          type: "message_start"
        })}`,
        "",
        "event: message_delta",
        `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 500000 } })}`,
        ""
      ].join("\n")
    );
    record.model = "custom-model";
    record.providerName = "custom-provider";
    record.price = {
      price: {
        pricing: {
          cacheWrite1hUsdPerMillionTokens: 6,
          cacheWrite5mUsdPerMillionTokens: 3,
          inputUsdPerMillionTokens: 2,
          outputUsdPerMillionTokens: 8
        },
        source: "custom"
      },
      state: "priced"
    };

    await store.writeBatch([{
      eventId: "cache-duration-pricing-event",
      input: record,
      kind: "record",
      sequence: 1
    }]);

    const page = await store.list({ pageSize: 10 });
    const detail = await store.getDetail({ id: page.items[0].id });
    assert.equal(detail.cacheWriteTokens, 300000);
    assert.ok(Math.abs(detail.costUsd - 7.2) < 1e-12);
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("a log row stores where its price came from and keeps it through a raw-trace re-price", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "llmr-request-log-cost-source-test-"));
  const dbFile = path.join(dir, "request-logs.sqlite");
  const store = new RequestLogStore(dbFile);
  const readRow = (requestId) => {
    const database = createBetterSqliteDatabase(dbFile);
    try {
      return { ...database.prepare("SELECT cost_source, cost_usd FROM request_logs WHERE request_id = ?").get(requestId) };
    } finally {
      database.close();
    }
  };
  try {
    const pricing = { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 8 };
    const price = { price: { pricing, source: "models.dev" }, state: "priced" };
    await store.writeBatch([
      {
        eventId: "resolved-event",
        input: { ...createRecord("resolved-request", '{"usage":{"input_tokens":1000000,"output_tokens":500000}}'), price },
        kind: "record",
        sequence: 1
      },
      {
        eventId: "unpriced-event",
        input: {
          ...createRecord("unpriced-request", '{"usage":{"input_tokens":1,"output_tokens":1}}'),
          model: "no-price-model",
          price: { state: "unpriced" }
        },
        kind: "record",
        sequence: 2
      }
    ]);
    assert.deepEqual(readRow("resolved-request"), { cost_source: "models.dev", cost_usd: 6 });
    assert.deepEqual(readRow("unpriced-request"), { cost_source: "unpriced", cost_usd: null });

    assert.equal(await store.updateFromRawTrace({
      requestId: "resolved-request",
      responseBodyText: '{"usage":{"input_tokens":2000000,"output_tokens":1000000}}'
    }), true);
    assert.deepEqual(readRow("resolved-request"), { cost_source: "models.dev", cost_usd: 12 });
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

const usageBody = '{"usage":{"input_tokens":1000000,"output_tokens":500000}}';

async function loadCatalog(liteLlm) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes("litellm")) return Response.json(liteLlm);
    if (target.includes("models.dev")) return Response.json({ host: { models: { "unrelated-model": { cost: { input: 1, output: 1 } } } } });
    if (target.includes("openrouter.ai")) return Response.json({ data: [{ id: "lab/unrelated-model", pricing: { completion: "0.000001", prompt: "0.000001" } }] });
    throw new Error(`a test must not reach ${target}`);
  };
  try {
    await preloadUsagePriceCatalog({ forceRefresh: true });
  } finally {
    globalThis.fetch = previousFetch;
  }
}

function openStore(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const dbFile = path.join(dir, "request-logs.sqlite");
  return {
    dbFile,
    dir,
    readRow: (requestId) => {
      const database = createBetterSqliteDatabase(dbFile);
      try {
        return { ...database.prepare("SELECT cost_source, cost_usd FROM request_logs WHERE request_id = ?").get(requestId) };
      } finally {
        database.close();
      }
    },
    store: new RequestLogStore(dbFile)
  };
}

const litellmPrice = { price: { pricing: { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 8 }, source: "litellm" }, state: "priced" };

test("a raw trace does not price an existing row by its own outcome while the row's usage row stays unpriced", async () => {
  const { dir, readRow, store } = openStore("llmr-request-log-raw-trace-outcome-test-");
  try {
    await loadCatalog({});
    await store.writeBatch([{
      eventId: "no-catalog-event",
      input: { ...createRecord("no-catalog-request", "{}"), price: { state: "no-catalog" } },
      kind: "record",
      sequence: 1
    }]);
    await loadCatalog({ "pricing-lock-model": { input_cost_per_token: 0.000002, output_cost_per_token: 0.000008 } });
    await store.writeBatch([{
      input: { price: litellmPrice, requestId: "no-catalog-request", responseBodyText: usageBody },
      kind: "raw-trace-update",
      sequence: 2
    }]);
    assert.deepEqual(readRow("no-catalog-request"), { cost_source: "", cost_usd: null });
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("a row the raw trace itself creates takes the trace's outcome", async () => {
  const { dir, readRow, store } = openStore("llmr-request-log-raw-trace-create-test-");
  try {
    await store.writeBatch([{
      input: {
        allowStandaloneRecord: true,
        method: "POST",
        model: "pricing-lock-model",
        path: "/v1/messages",
        price: litellmPrice,
        provider: "pricing-lock-provider",
        requestId: "trace-created-request",
        responseBodyText: usageBody,
        statusCode: 200
      },
      kind: "raw-trace-update",
      sequence: 1
    }]);
    assert.deepEqual(readRow("trace-created-request"), { cost_source: "litellm", cost_usd: 6 });
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

test("a raw trace prices a row from the price stored with it", async () => {
  const { dir, readRow, store } = openStore("llmr-request-log-raw-trace-source-test-");
  try {
    await store.writeBatch([{
      eventId: "stored-price-event",
      input: {
        ...createRecord("stored-price-request", "{}"),
        price: { price: { pricing: { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 8 }, source: "custom" }, state: "priced" }
      },
      kind: "record",
      sequence: 1
    }]);
    assert.deepEqual(readRow("stored-price-request"), { cost_source: "custom", cost_usd: null });
    assert.equal(await store.updateFromRawTrace({ requestId: "stored-price-request", responseBodyText: usageBody }), true);
    assert.deepEqual(readRow("stored-price-request"), { cost_source: "custom", cost_usd: 6 });
  } finally {
    await store.close();
    rmSync(dir, { force: true, recursive: true });
  }
});

const noCatalogRecord = (requestId, sequence) => ({
  eventId: `${requestId}-event`,
  input: { ...createRecord(requestId, usageBody), price: { state: "no-catalog" } },
  kind: "record",
  sequence
});
const priceUpdate = (requestId, price, sequence) => ({ input: [{ price, requestId }], kind: "price-update", sequence });

test("a row written with no catalog has no cost until a price update prices it from the row's own tokens", async () => {
  const { dir, readRow, store } = openStore("llmr-request-log-price-update-test-");
  try {
    await store.writeBatch([noCatalogRecord("waiting", 1), noCatalogRecord("unpriced", 2)]);
    assert.deepEqual(readRow("waiting"), { cost_source: "", cost_usd: null });
    await store.writeBatch([priceUpdate("waiting", litellmPrice, 3), priceUpdate("unpriced", { state: "unpriced" }, 4)]);
    assert.deepEqual(readRow("waiting"), { cost_source: "litellm", cost_usd: 6 });
    assert.deepEqual(readRow("unpriced"), { cost_source: "unpriced", cost_usd: null });
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a price update leaves a row that already has a cost, and a later raw trace re-prices from the update's price", async () => {
  const { dir, readRow, store } = openStore("llmr-request-log-price-update-keep-test-");
  try {
    const custom = { price: { pricing: { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 1 }, source: "custom" }, state: "priced" };
    await store.writeBatch([
      { eventId: "priced-event", input: { ...createRecord("priced", usageBody), price: custom }, kind: "record", sequence: 1 },
      noCatalogRecord("waiting", 2)
    ]);
    await store.writeBatch([priceUpdate("priced", litellmPrice, 3), priceUpdate("waiting", litellmPrice, 4)]);
    assert.deepEqual(readRow("priced"), { cost_source: "custom", cost_usd: 1.5 });
    assert.equal(await store.updateFromRawTrace({ requestId: "waiting", responseBodyText: '{"usage":{"input_tokens":2000000,"output_tokens":1000000}}' }), true);
    assert.deepEqual(readRow("waiting"), { cost_source: "litellm", cost_usd: 12 });
  } finally { await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

test("a price update that arrives before its row prices the row when it is written, also after the store reopens, and one for a request that is never logged writes nothing", async () => {
  const { dbFile, dir, readRow, store } = openStore("llmr-request-log-price-update-early-test-");
  let reopened;
  try {
    await store.writeBatch([priceUpdate("early", litellmPrice, 1), priceUpdate("never-logged", litellmPrice, 2)]);
    assert.deepEqual(readRow("never-logged"), {});
    await store.close();
    reopened = new RequestLogStore(dbFile);
    await reopened.writeBatch([noCatalogRecord("early", 3)]);
    assert.deepEqual(readRow("early"), { cost_source: "litellm", cost_usd: 6 });
  } finally { await reopened?.close(); await store.close(); rmSync(dir, { force: true, recursive: true }); }
});

function createRecord(requestId, responseBodyText) {
  const now = new Date().toISOString();
  return {
    completedAt: now,
    durationMs: 10,
    method: "POST",
    model: "pricing-lock-model",
    path: "/v1/messages",
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
