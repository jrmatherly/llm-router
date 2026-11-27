import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { costBasisFor, listedCostSources, totalCostBasis } from "@llmr/core/contracts/app.ts";
import { RequestLogStore } from "@llmr/core/observability/request-log-store.ts";
import { UsageStore } from "@llmr/core/usage/store.ts";
import { removeTestDir, testTempRoot } from "../../support/test-temp-dir.mjs";

globalThis.fetch = async () => {
  throw new Error("cost-basis tests do not reach the network");
};

const costFields = (totals) => ({
  estimatedCostUsd: totals.estimatedCostUsd,
  pricedRequestCount: totals.pricedRequestCount,
  unpricedRequestCount: totals.unpricedRequestCount
});

async function usageStoreWithRows(prefix, rows) {
  const dir = mkdtempSync(path.join(testTempRoot, prefix));
  const store = new UsageStore(path.join(dir, "usage.sqlite"));
  const database = await store.getDatabase();
  const insert = database.prepare(`
    INSERT INTO usage_events (created_at, request_id, client, method, path, model, logical_model, provider, status_code, duration_ms,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost_usd, cost_source)
    VALUES (?, ?, 'test', 'POST', '/v1/messages', ?, ?, 'alpha', 200, 1, ?, ?, ?, ?, ?, ?, ?)
  `);
  rows.forEach((row, index) => {
    const tokens = { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0, ...row.tokens };
    insert.run(new Date(Date.now() - index).toISOString(), `row-${index}`, row.model ?? `model-${index}`, row.model ?? `model-${index}`,
      tokens.input, tokens.output, tokens.cacheRead, tokens.cacheWrite, tokens.total, row.costUsd ?? null, row.costSource);
  });
  return { dir, store };
}

test("the SQL totals and the per-request rows give every stored source, cost and token shape the same basis", async () => {
  const sources = ["", "custom", ...listedCostSources, "models.dev-median", "gateway_billing", "request_log", "unpriced", "Custom", "something-new"];
  const costs = [undefined, 0, 0.5];
  const tokenShapes = [{ input: 10 }, { output: 3 }, { cacheRead: 7 }, { cacheWrite: 5 }, {}, { total: 12 }];
  for (const costSource of sources) {
    for (const costUsd of costs) {
      for (const tokens of tokenShapes) {
        const { dir, store } = await usageStoreWithRows("llmr-usage-basis-matrix-test-", [{ costSource, costUsd, tokens }]);
        try {
          const stats = await store.getStats("24h", { includeProxy: true });
          const label = JSON.stringify({ costSource, costUsd, tokens });
          const billableTokens = (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.cacheRead ?? 0) + (tokens.cacheWrite ?? 0);
          const basis = costBasisFor({ billableTokens, costSource, costUsd });
          const expected = {
            estimatedCostUsd: basis === "estimate" ? costUsd : 0,
            pricedRequestCount: basis !== undefined && basis !== "unknown" ? 1 : 0,
            unpricedRequestCount: basis === "unknown" ? 1 : 0
          };
          assert.deepEqual(costFields(stats.totals), expected, `SQL totals ${label}`);
          assert.deepEqual(costFields(stats.recentRequests[0]), expected, `recent request ${label}`);
          assert.deepEqual(costFields(stats.series.at(-1)), expected, `series point ${label}`);
          assert.deepEqual(costFields(stats.models[0]), expected, `model row ${label}`);
          assert.deepEqual(costFields(stats.clientModels[0]), expected, `client row ${label}`);
          assert.deepEqual(costFields(stats.providerModels[0]), expected, `provider row ${label}`);
        } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
      }
    }
  }
});

test("series points, model rows, recent requests and the totals since a date all carry the same three cost figures", async () => {
  const rows = [
    { costSource: "models.dev", costUsd: 1, tokens: { input: 10 } },
    { costSource: "models.dev-median", costUsd: 0.25, tokens: { input: 10 } },
    { costSource: "gateway_billing", costUsd: 0.5, tokens: { output: 10 } },
    { costSource: "custom", costUsd: 0, tokens: { input: 10 } },
    { costSource: "unpriced", tokens: { input: 10 } },
    { costSource: "", tokens: { input: 10 } },
    { costSource: "", tokens: {} }
  ];
  const { dir, store } = await usageStoreWithRows("llmr-usage-basis-sum-test-", rows);
  try {
    const stats = await store.getStats("24h", { includeProxy: true });
    const expected = { estimatedCostUsd: 0.75, pricedRequestCount: 4, unpricedRequestCount: 2 };
    const summed = (items) => items.reduce((sum, item) => ({
      estimatedCostUsd: sum.estimatedCostUsd + item.estimatedCostUsd,
      pricedRequestCount: sum.pricedRequestCount + item.pricedRequestCount,
      unpricedRequestCount: sum.unpricedRequestCount + item.unpricedRequestCount
    }), { estimatedCostUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 0 });
    assert.deepEqual(costFields(stats.totals), expected);
    assert.deepEqual(summed(stats.series), expected);
    assert.deepEqual(summed(stats.models), expected);
    assert.deepEqual(summed(stats.clientModels), expected);
    assert.deepEqual(summed(stats.providerModels), expected);
    assert.deepEqual(summed(stats.recentRequests), expected);
    assert.deepEqual(costFields(await store.getTotalsSince(new Date(Date.now() - 60_000), { includeProxy: true })), expected);
    assert.equal(totalCostBasis(stats.totals), "estimate");
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("an empty range and an empty series point carry zero for the three cost figures", async () => {
  const { dir, store } = await usageStoreWithRows("llmr-usage-basis-empty-test-", []);
  try {
    const stats = await store.getStats("24h", { includeProxy: true });
    const zero = { estimatedCostUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 0 };
    assert.deepEqual(costFields(stats.totals), zero);
    assert.deepEqual(costFields(stats.series[0]), zero);
    assert.equal(totalCostBasis(stats.totals), undefined);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("a row waiting for the catalog counts as a request without a price until the sweep prices it", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-basis-waiting-test-"));
  try {
    let catalogLoaded = false;
    let releaseCatalog;
    const catalog = new Promise((resolve) => { releaseCatalog = resolve; });
    const store = new UsageStore(path.join(dir, "usage.sqlite"), { loadPriceCatalog: () => catalog, priceCatalogNeedsRefresh: () => !catalogLoaded });
    const price = { price: { pricing: { inputUsdPerMillionTokens: 100_000, outputUsdPerMillionTokens: 0 }, source: "models.dev-median" }, state: "priced" };
    store.connectPricing({ enqueueRequestLogPrices: () => undefined, resolvePrice: () => catalogLoaded ? price : { state: "no-catalog" } });
    await store.record({ durationMs: 1, method: "POST", model: "known-model", path: "/v1/messages", price: { state: "no-catalog" }, provider: "alpha", requestId: "waiting", statusCode: 200, usage: { inputTokens: 10 } });
    const waiting = await store.getStats("24h", { includeProxy: true });
    assert.deepEqual(costFields(waiting.totals), { estimatedCostUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 1 });
    assert.equal(totalCostBasis(waiting.totals), "unknown");
    assert.equal(waiting.recentRequests[0].unpricedRequestCount, 1);

    catalogLoaded = true;
    releaseCatalog();
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await store.getStats("24h", { includeProxy: true })).totals.pricedRequestCount === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const priced = await store.getStats("24h", { includeProxy: true });
    assert.deepEqual(costFields(priced.totals), { estimatedCostUsd: 1, pricedRequestCount: 1, unpricedRequestCount: 0 });
    assert.equal(totalCostBasis(priced.totals), "estimate");
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

function logRecord(requestId, responseBodyText, price, sequence, sessionId = "basis-session") {
  const now = new Date(Date.now() + sequence).toISOString();
  return {
    eventId: `${requestId}-event`,
    input: {
      completedAt: now,
      durationMs: 10,
      method: "POST",
      model: `${requestId}-model`,
      path: "/v1/messages",
      price,
      providerName: "basis-provider",
      requestBody: Buffer.from("{}"),
      requestHeaders: { "content-type": "application/json", "user-agent": "openai-codex test", "x-codex-session-id": sessionId },
      requestId,
      responseBodyText,
      responseHeaders: { "content-type": "application/json" },
      startedAt: now,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    },
    kind: "record",
    sequence
  };
}

const usage = '{"usage":{"input_tokens":1000000,"output_tokens":0}}';
const pricedBy = (source, inputUsdPerMillionTokens = 2) => ({ price: { pricing: { inputUsdPerMillionTokens, outputUsdPerMillionTokens: 8 }, source }, state: "priced" });

test("a log entry waiting for the catalog reads as unknown with an empty source, and a user price of 0 reads as the user's", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-log-basis-waiting-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    await store.writeBatch([
      logRecord("waiting", usage, { state: "no-catalog" }, 1),
      logRecord("user-zero", usage, { price: { pricing: { inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 }, source: "custom" }, state: "priced" }, 2),
      logRecord("litellm", usage, pricedBy("litellm"), 3),
      logRecord("openrouter", usage, pricedBy("openrouter"), 4),
      logRecord("cache-only", '{"usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":1000000}}', { state: "unpriced" }, 5)
    ]);
    const page = await store.list({ pageSize: 10 });
    const byRequest = Object.fromEntries(page.items.map((item) => [item.requestId, [item.costBasis, item.costSource, item.costUsd]]));
    assert.deepEqual(byRequest, {
      "cache-only": ["unknown", "unpriced", undefined],
      litellm: ["listed", "litellm", 2],
      openrouter: ["listed", "openrouter", 2],
      "user-zero": ["user", "custom", 0],
      waiting: ["unknown", "", undefined]
    });
    await store.writeBatch([{ input: [{ price: pricedBy("models.dev-median"), requestId: "waiting" }], kind: "price-update", sequence: 6 }]);
    const waiting = (await store.list({ pageSize: 10 })).items.find((item) => item.requestId === "waiting");
    assert.deepEqual([waiting.costBasis, waiting.costSource, waiting.costUsd], ["estimate", "models.dev-median", 2]);
  } finally {
    await store.close();
    removeTestDir(dir, ["request-logs.sqlite"]);
  }
});

test("Agent Analysis totals count each request by its basis, and the session's root run takes the total's basis", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-log-basis-analysis-test-"));
  const store = new RequestLogStore(path.join(dir, "request-logs.sqlite"));
  try {
    await store.writeBatch([
      logRecord("listed", usage, pricedBy("models.dev"), 1),
      logRecord("median", usage, pricedBy("models.dev-median", 0.5), 2),
      logRecord("unpriced", usage, { state: "unpriced" }, 3),
      logRecord("no-tokens", "{}", pricedBy("models.dev"), 4),
      logRecord("only-listed", usage, pricedBy("models.dev"), 5, "listed-session"),
      logRecord("only-unpriced", usage, { state: "unpriced" }, 6, "unpriced-session")
    ]);
    const all = await store.analyze({ range: "30d" });
    assert.deepEqual(costFields(all.totals), { estimatedCostUsd: 0.5, pricedRequestCount: 3, unpricedRequestCount: 2 });
    assert.equal(all.totals.costUsd, 4.5);
    assert.deepEqual(costFields(all.agents[0]), costFields(all.totals));
    const analysis = await store.analyze({ range: "30d", sessionAgent: "codex", sessionId: "basis-session" });

    const sessions = Object.fromEntries(analysis.sessions.map((session) => [session.id, session]));
    assert.deepEqual(costFields(sessions["basis-session"]), { estimatedCostUsd: 0.5, pricedRequestCount: 2, unpricedRequestCount: 1 });
    assert.deepEqual(costFields(sessions["listed-session"]), { estimatedCostUsd: 0, pricedRequestCount: 1, unpricedRequestCount: 0 });
    assert.deepEqual(costFields(sessions["unpriced-session"]), { estimatedCostUsd: 0, pricedRequestCount: 0, unpricedRequestCount: 1 });

    const selected = analysis.selectedSession;
    assert.deepEqual(costFields(selected.totals), { estimatedCostUsd: 0.5, pricedRequestCount: 2, unpricedRequestCount: 1 });
    assert.deepEqual(Object.fromEntries(selected.requests.map((request) => [request.requestId, request.costBasis])), {
      listed: "listed",
      median: "estimate",
      "no-tokens": undefined,
      unpriced: "unknown"
    });
    const runs = selected.trace.runs;
    assert.equal(runs.find((run) => run.id === selected.trace.rootRunId).costBasis, "estimate");
    assert.deepEqual(runs.filter((run) => run.kind === "llm").map((run) => run.costBasis).sort(), ["estimate", "listed", "unknown", undefined].sort());

    const rootBasis = async (sessionId) => {
      const detail = (await store.analyze({ range: "30d", sessionAgent: "codex", sessionId })).selectedSession;
      return detail.trace.runs.find((run) => run.id === detail.trace.rootRunId).costBasis;
    };
    assert.equal(await rootBasis("listed-session"), undefined);
    assert.equal(await rootBasis("unpriced-session"), "unknown");
  } finally {
    await store.close();
    removeTestDir(dir, ["request-logs.sqlite"]);
  }
});

test("a stored cost on a request with no tokens counts in the totals by its source, and a total beside an unpriced request is an estimate, not a dash", async () => {
  const billedNoTokens = { costSource: "gateway_billing", costUsd: 0.5, tokens: {} };
  const alone = await usageStoreWithRows("llmr-usage-basis-no-token-cost-test-", [billedNoTokens]);
  const beside = await usageStoreWithRows("llmr-usage-basis-no-token-cost-beside-test-", [billedNoTokens, { costSource: "", tokens: { input: 10 } }]);
  try {
    const aloneTotals = (await alone.store.getStats("24h", { includeProxy: true })).totals;
    assert.deepEqual(costFields(aloneTotals), { estimatedCostUsd: 0.5, pricedRequestCount: 1, unpricedRequestCount: 0 });
    assert.equal(totalCostBasis(aloneTotals), "estimate");
    const besideTotals = (await beside.store.getStats("24h", { includeProxy: true })).totals;
    assert.deepEqual(costFields(besideTotals), { estimatedCostUsd: 0.5, pricedRequestCount: 1, unpricedRequestCount: 1 });
    assert.equal(totalCostBasis(besideTotals), "estimate");
    assert.equal(costBasisFor({ billableTokens: 0, costSource: "gateway_billing", costUsd: 0.5 }), "estimate");
    assert.equal(costBasisFor({ billableTokens: 0, costSource: "models.dev", costUsd: 0.5 }), "listed");
    assert.equal(costBasisFor({ billableTokens: 0, costSource: "custom", costUsd: 0.5 }), "user");
    assert.equal(costBasisFor({ billableTokens: 0, costSource: "gateway_billing", costUsd: 0 }), undefined);
    assert.equal(costBasisFor({ billableTokens: 0, costSource: "", costUsd: undefined }), undefined);
  } finally {
    removeTestDir(alone.dir, ["usage.sqlite", "request-logs.sqlite"]);
    removeTestDir(beside.dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});
