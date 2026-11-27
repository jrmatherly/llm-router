import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { preloadUsagePriceCatalog, resolveRequestPrice } from "@llmr/core/models/pricing-service.ts";
import { RequestLogStore } from "@llmr/core/observability/request-log-store.ts";
import { providerRuntimeId } from "@llmr/core/routing/model-registry.ts";
import { createBetterSqliteDatabase } from "@llmr/core/storage/sqlite-native.ts";
import { GatewayBillingSynchronizer } from "@llmr/core/usage/billing-sync.ts";
import { resolveUsageModelAttribution } from "@llmr/core/usage/model-attribution.ts";
import { UsageStore } from "@llmr/core/usage/store.ts";
import { removeTestDir, testTempRoot } from "../../support/test-temp-dir.mjs";

// Stores built without an injected loader warm the real price catalog.
globalThis.fetch = async () => {
  throw new Error("usage-store tests do not reach the network");
};

const fusionUsageConfig = {
  Providers: [
    {
      baseUrl: "https://api.moonshot.cn/anthropic",
      models: ["kimi-for-coding", "kimi-vision"],
      name: "Kimi Code - Coding Plan",
      type: "anthropic_messages"
    },
    {
      baseUrl: "https://api.example.com/v1",
      models: ["openai-vision"],
      name: "OpenAI Compatible",
      type: "openai_chat_completions"
    }
  ],
  virtualModelProfiles: [
    {
      baseModel: { fixedModel: "Kimi Code - Coding Plan/kimi-for-coding", mode: "fixed" },
      enabled: true,
      id: "kimisearch",
      key: "kimisearch",
      match: { exactAliases: ["kimisearch"], prefixes: [], suffixes: [] }
    }
  ]
};

test("Fusion usage attribution resolves fixed aliases to their upstream model", () => {
  assert.deepEqual(resolveUsageModelAttribution(fusionUsageConfig, "Fusion/kimisearch"), {
    logicalModel: "Fusion/kimisearch",
    model: "kimi-for-coding",
    provider: "Kimi Code - Coding Plan"
  });
});

test("Fusion usage attribution mirrors gateway virtual-model precedence and target rewriting", () => {
  const config = {
    Providers: [
      { models: ["base", "web-base-tail", "web-special-base"], name: "Requested", type: "openai_chat_completions" },
      { models: ["long-prefix", "short-prefix", "suffix"], name: "Targets", type: "openai_chat_completions" }
    ],
    virtualModelProfiles: [
      {
        baseModel: { fixedModel: "Targets/short-prefix", mode: "fixed" },
        enabled: true,
        match: { exactAliases: [], prefixes: ["web-"], suffixes: [] }
      },
      {
        baseModel: { fixedModel: "Targets/long-prefix", mode: "fixed" },
        enabled: true,
        match: { exactAliases: [], prefixes: ["web-special-"], suffixes: [] }
      },
      {
        baseModel: { fixedModel: "Targets/suffix", mode: "fixed" },
        enabled: true,
        match: { exactAliases: [], prefixes: [], suffixes: ["-tail"] }
      },
      {
        baseModel: { mode: "request" },
        enabled: true,
        match: { exactAliases: [], prefixes: ["raw-"], suffixes: [] }
      }
    ]
  };

  assert.deepEqual(resolveUsageModelAttribution(config, "Requested/web-special-base"), {
    logicalModel: "Requested/web-special-base",
    model: "long-prefix",
    provider: "Targets"
  });
  assert.deepEqual(resolveUsageModelAttribution(config, "Requested/web-base-tail"), {
    logicalModel: "Requested/web-base-tail",
    model: "suffix",
    provider: "Targets"
  });
  assert.deepEqual(resolveUsageModelAttribution(config, "Requested/raw-base"), {
    logicalModel: "Requested/raw-base",
    model: "base",
    provider: "Requested"
  });
});

test("usage attribution preserves slash-containing physical model IDs", () => {
  const model = "accounts/fireworks/models/llama-v3p2-11b-vision-instruct";
  assert.deepEqual(resolveUsageModelAttribution(fusionUsageConfig, model, { physicalModel: true }), {
    logicalModel: model,
    model
  });
});

test("UsageStore aggregates stats in SQLite without loading all events", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await store.record({
      createdAt: earlier.toISOString(),
      durationMs: 120,
      method: "POST",
      model: "alpha-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "req-1",
      statusCode: 200,
      usage: {
        cacheReadTokens: 2,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 17
      }
    });
    await store.record({
      createdAt: now.toISOString(),
      durationMs: 80,
      method: "POST",
      model: "beta-model",
      path: "/v1/messages",
      provider: "beta",
      requestId: "req-2",
      statusCode: 500,
      usage: {
        inputTokens: 4,
        outputTokens: 6
      }
    });

    const stats = await store.getStats("30d", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 2);
    assert.equal(stats.totals.errorCount, 1);
    assert.equal(stats.totals.totalTokens, 27);
    assert.equal(stats.totals.inputTokens, 14);
    assert.equal(stats.totals.outputTokens, 11);
    assert.equal(stats.recentRequests.length, 2);
    assert.equal(stats.models[0]?.requestCount, 1);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("UsageStore records usage while the price catalog loads and prices it afterwards", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-catalog-pending-test-"));
  try {
    const file = path.join(dir, "usage.sqlite");
    let catalogLoaded = false;
    const pricing = { priceCatalogNeedsRefresh: () => !catalogLoaded };
    const connection = {
      enqueueRequestLogPrices: () => undefined,
      resolvePrice: () => catalogLoaded
        ? { price: { pricing: { inputUsdPerMillionTokens: 25_000, outputUsdPerMillionTokens: 0 }, source: "models.dev" }, state: "priced" }
        : { state: "no-catalog" }
    };
    const event = (requestId) => ({
      durationMs: 10,
      method: "POST",
      model: "catalog-model",
      path: "/v1/messages",
      provider: "anthropic",
      requestId,
      statusCode: 200,
      usage: { inputTokens: 10, outputTokens: 5 }
    });

    // The first process never sees its catalog load, as if it quit mid-fetch.
    const stalled = new UsageStore(file, { ...pricing, loadPriceCatalog: () => new Promise(() => {}) });
    stalled.connectPricing(connection);
    await stalled.record(event("req-before-restart"));
    assert.equal(await stalled.hasRequestId("req-before-restart"), true);
    assert.equal((await stalled.getStats("24h", { includeProxy: true })).totals.costUsd, 0);

    let finishCatalogLoad;
    const store = new UsageStore(file, {
      ...pricing,
      loadPriceCatalog: () => new Promise((resolve) => {
        finishCatalogLoad = () => {
          catalogLoaded = true;
          resolve();
        };
      })
    });
    store.connectPricing(connection);
    await store.record(event("req-after-restart"));
    assert.equal((await store.getStats("24h", { includeProxy: true })).totals.costUsd, 0);

    finishCatalogLoad();
    const deadline = Date.now() + 2_000;
    let stats = await store.getStats("24h", { includeProxy: true });
    while (stats.totals.costUsd < 0.5 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      stats = await store.getStats("24h", { includeProxy: true });
    }
    assert.equal(stats.totals.costUsd, 0.5, "both rows are priced once the catalog loads");
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("UsageStore cache ratio denominator includes cache tokens when total tokens omit cache", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-cache-ratio-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));

    await store.record({
      createdAt: new Date().toISOString(),
      durationMs: 50,
      method: "POST",
      model: "glm-cache",
      path: "/v1/messages",
      provider: "zhipu",
      requestId: "cache-ratio-total-omits-cache",
      statusCode: 200,
      usage: {
        cacheReadTokens: 90,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15
      }
    });

    const stats = await store.getStats("30d");
    assert.equal(stats.totals.totalTokens, 105);
    assert.equal(stats.totals.cacheRatio, 0.9);
    assert.equal(stats.models[0]?.cacheRatio, 0.9);
    assert.equal(stats.recentRequests[0]?.totalTokens, 105);
    assert.equal(stats.recentRequests[0]?.cacheRatio, 0.9);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("UsageStore excludes proxy rows by default and includes them on request", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-proxy-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const createdAt = new Date().toISOString();

    await store.record({
      createdAt,
      durationMs: 10,
      method: "POST",
      model: "direct/model-a",
      path: "/v1/messages",
      requestId: "direct-1",
      statusCode: 200,
      usage: {
        inputTokens: 5,
        outputTokens: 7
      }
    });
    await store.record({
      createdAt,
      durationMs: 10,
      method: "POST",
      model: "proxy-model",
      path: "/v1/messages",
      provider: "proxy",
      requestId: "proxy-1",
      statusCode: 200,
      usage: {
        inputTokens: 100,
        outputTokens: 200
      }
    });

    const defaultStats = await store.getStats("30d");
    assert.equal(defaultStats.totals.requestCount, 1);
    assert.equal(defaultStats.totals.totalTokens, 12);
    assert.equal(defaultStats.providerModels[0]?.provider, "direct");
    assert.equal(defaultStats.providerModels[0]?.model, "model-a");

    const withProxy = await store.getStats("30d", { includeProxy: true });
    assert.equal(withProxy.totals.requestCount, 2);
    assert.equal(withProxy.totals.totalTokens, 312);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("UsageStore treats null web RPC usage filters as empty filters", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-null-filter-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));

    await store.record({
      createdAt: new Date().toISOString(),
      durationMs: 10,
      method: "POST",
      model: "alpha-model",
      path: "/v1/messages",
      provider: "alpha",
      requestId: "req-null-filter",
      statusCode: 200,
      usage: {
        inputTokens: 3,
        outputTokens: 4
      }
    });

    const stats = await store.getStats("7d", null);
    assert.equal(stats.range, "7d");
    assert.equal(stats.totals.requestCount, 1);

    const defaultRangeStats = await store.getStats(null, null);
    assert.equal(defaultRangeStats.range, "7d");
    assert.equal(defaultRangeStats.totals.requestCount, 1);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("UsageStore keeps the Fusion logical model while grouping by the upstream model", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-fusion-attribution-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    await store.record({
      createdAt: new Date().toISOString(),
      durationMs: 25,
      logicalModel: "Fusion/kimisearch",
      method: "POST",
      model: "kimi-for-coding",
      path: "/v1/messages",
      provider: "Kimi Code - Coding Plan",
      requestId: "fusion-request-1",
      statusCode: 200,
      usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 }
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, "kimi-for-coding");
    assert.equal(stats.models[0]?.provider, "Kimi Code - Coding Plan");
    assert.equal(stats.recentRequests[0]?.logicalModel, "Fusion/kimisearch");
    assert.equal(stats.totals.requestCount, 1);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("UsageStore prices the routed upstream model when the response echoes a rule alias", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-alias-pricing-test-"));
  try {
    const pricing = {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2
    };
    const provider = {
      baseUrl: "https://api.example.com",
      modelMetadata: { "Vendor/some-model": { pricing } },
      models: ["Vendor/some-model"],
      name: "ProviderA",
      type: "anthropic_messages"
    };
    const estimatedInputs = [];
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async (input) => {
        estimatedInputs.push({
          model: input.model,
          pricing: input.pricing,
          provider: input.provider
        });
        return input.pricing
          ? { amountUsd: 2, model: input.model, source: "custom" }
          : undefined;
      }
    });

    await store.recordCapture({
      bodyText: JSON.stringify({
        model: "my-alias",
        usage: { input_tokens: 1000000, output_tokens: 500000 }
      }),
      config: { Providers: [provider] },
      durationMs: 40,
      fallbackModel: `${providerRuntimeId(provider)}::anthropic_messages/Vendor/some-model`,
      method: "POST",
      path: "/v1/messages",
      providerName: `${providerRuntimeId(provider)}::anthropic_messages`,
      requestId: "alias-pricing-request",
      responseHeaders: new Headers({ "content-type": "application/json" }),
      statusCode: 200
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, "my-alias");
    assert.equal(stats.models[0]?.provider, "ProviderA");
    assert.equal(stats.totals.costUsd, 2);
    assert.deepEqual(estimatedInputs, [{
      model: "my-alias",
      pricing,
      provider: "ProviderA"
    }]);

    const database = createBetterSqliteDatabase(path.join(dir, "usage.sqlite"));
    try {
      const row = database.prepare("SELECT model, cost_source, cost_usd FROM usage_events").get();
      assert.equal(row.model, "my-alias");
      assert.equal(row.cost_source, "custom");
      assert.equal(row.cost_usd, 2);
    } finally {
      database.close();
    }
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("a chunk that states only a reasoning count does not name the usage row's model", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"), { estimateCost: async () => undefined });
    await store.recordCapture({
      bodyText: [
        `data: ${JSON.stringify({ model: "counted-model", usage: { completion_tokens: 5, prompt_tokens: 10 } })}`,
        `data: ${JSON.stringify({ model: "reasoning-only-model", usage: { completion_tokens_details: { reasoning_tokens: 2 } } })}`
      ].join("\n"),
      config: { Providers: [] },
      durationMs: 1,
      fallbackModel: "fallback-model",
      method: "POST",
      path: "/v1/chat/completions",
      requestId: "reasoning-only-chunk",
      responseHeaders: new Headers({ "content-type": "text/event-stream" }),
      statusCode: 200
    });
    const database = createBetterSqliteDatabase(path.join(dir, "usage.sqlite"));
    try {
      assert.equal(database.prepare("SELECT model FROM usage_events").get().model, "counted-model");
    } finally {
      database.close();
    }
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("#1791 UsageStore records DeepSeek-native prompt cache hits", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-deepseek-cache-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    await store.recordCapture({
      bodyText: JSON.stringify({
        model: "deepseek-v4.1-flash",
        usage: {
          completion_tokens: 10,
          prompt_cache_hit_tokens: 800,
          prompt_cache_miss_tokens: 200,
          prompt_tokens: 1000,
          prompt_tokens_details: {},
          total_tokens: 1010
        }
      }),
      durationMs: 40,
      fallbackModel: "deepseek-v4.1-flash",
      method: "POST",
      path: "/v1/messages",
      providerName: "OpenCode Go",
      providerProtocol: "openai_chat_completions",
      requestId: "deepseek-native-cache-usage",
      responseHeaders: new Headers({ "content-type": "application/json" }),
      statusCode: 200
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.inputTokens, 200);
    assert.equal(stats.totals.cacheTokens, 800);
    assert.equal(stats.totals.outputTokens, 10);
    assert.equal(stats.totals.totalTokens, 1010);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("UsageStore attributes Claude App encoded response model IDs to the routed upstream model", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-claude-app-encoded-model-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const encodedModel = `anthropic/claude-llmr-h${Buffer.from("Fusion/kimisearch", "utf8").toString("hex")}`;

    await store.recordCapture({
      bodyText: [
        "event: message_start",
        `data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"${encodedModel}","usage":{"input_tokens":12,"output_tokens":8,"total_tokens":20}}}`,
        "",
        "data: [DONE]",
        ""
      ].join("\n"),
      client: "Claude Code",
      config: fusionUsageConfig,
      durationMs: 100,
      fallbackModel: "Fusion/kimisearch",
      method: "POST",
      path: "/v1/messages",
      providerProtocol: "anthropic_messages",
      requestId: "encoded-claude-app-model",
      responseHeaders: new Headers({ "content-type": "text/event-stream; charset=utf-8" }),
      statusCode: 200
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, "kimi-for-coding");
    assert.equal(stats.models[0]?.provider, "Kimi Code - Coding Plan");
    assert.equal(stats.recentRequests[0]?.logicalModel, "Fusion/kimisearch");
    assert.notEqual(stats.models[0]?.model, encodedModel);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("UsageStore attributes client-visible provider-prefixed response models to the bare model", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-client-visible-selector-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const config = {
      Providers: [
        {
          baseUrl: "https://dashscope.example.com/api/v2/apps/anthropic",
          models: ["ZHIPU/GLM-5.3"],
          name: "dashscope-private",
          type: "anthropic_messages"
        }
      ],
      virtualModelProfiles: []
    };

    await store.recordCapture({
      bodyText: [
        "event: message_start",
        'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"dashscope-private/ZHIPU/GLM-5.3","usage":{"input_tokens":12,"output_tokens":8,"total_tokens":20}}}',
        "",
        "data: [DONE]",
        ""
      ].join("\n"),
      client: "Claude Code",
      config,
      durationMs: 100,
      fallbackModel: "dashscope-private/ZHIPU/GLM-5.3",
      method: "POST",
      path: "/v1/messages",
      providerProtocol: "anthropic_messages",
      requestId: "client-visible-selector-model",
      responseHeaders: new Headers({ "content-type": "text/event-stream; charset=utf-8" }),
      statusCode: 200
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, "ZHIPU/GLM-5.3");
    assert.equal(stats.models[0]?.provider, "dashscope-private");
    assert.notEqual(stats.models[0]?.model, "dashscope-private/ZHIPU/GLM-5.3");
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("UsageStore keeps physical response models with unknown provider prefixes verbatim", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-physical-slash-model-test-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    const config = {
      Providers: [
        {
          baseUrl: "https://dashscope.example.com/api/v2/apps/anthropic",
          models: ["ZHIPU/GLM-5.3"],
          name: "dashscope-private",
          type: "anthropic_messages"
        }
      ],
      virtualModelProfiles: []
    };

    // The upstream echoes the physical model id, whose own name contains a
    // slash; "ZHIPU" is not a configured provider, so the echo must be kept
    // verbatim instead of being re-attributed as a route selector.
    await store.recordCapture({
      bodyText: [
        "event: message_start",
        'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"ZHIPU/GLM-5.3","usage":{"input_tokens":12,"output_tokens":8,"total_tokens":20}}}',
        "",
        "data: [DONE]",
        ""
      ].join("\n"),
      client: "Claude Code",
      config,
      durationMs: 100,
      fallbackModel: "dashscope-private/ZHIPU/GLM-5.3",
      method: "POST",
      path: "/v1/messages",
      providerProtocol: "anthropic_messages",
      requestId: "physical-slash-model",
      responseHeaders: new Headers({ "content-type": "text/event-stream; charset=utf-8" }),
      statusCode: 200
    });

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, "ZHIPU/GLM-5.3");
    assert.equal(stats.models[0]?.provider, "dashscope-private");
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("lightweight usage synchronization records and deduplicates Fusion internal upstream calls", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-fusion-internal-test-"));
  try {
    let estimateCallCount = 0;
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async () => {
        estimateCallCount += 1;
        return { amountUsd: 99, model: "unexpected", source: "litellm" };
      }
    });
    const synchronizer = new GatewayBillingSynchronizer({ getConfig: () => fusionUsageConfig, store });
    const event = {
      billing: {
        cost: { total: 0.001 },
        usage: { input_tokens: 50, output_tokens: 5, total_tokens: 55 }
      },
      emittedAt: new Date().toISOString(),
      eventId: "fusion-vision-event-1",
      outcome: { status: "success", statusCode: 200 },
      performance: { latency_ms: 150 },
      route: { method: "POST", url: "/v1/chat/completions" },
      schema: "llmr.fusion-usage.v1",
      source: { adapterKey: "openai_chat", provider: "fusion_vision" },
      target: {
        credentialId: "test-1",
        model: "kimi-vision",
        providerName: "Kimi Code - Coding Plan"
      }
    };

    assert.equal(await synchronizer.ingest(event), true);
    assert.equal(await store.hasRequestId(event.eventId), true);
    assert.equal(await synchronizer.ingest(event), true);
    assert.equal(await synchronizer.ingest({
      ...event,
      eventId: "top-level-embedding-event",
      source: { adapterKey: "openai_embeddings", provider: "openai" }
    }), false);
    assert.equal(await synchronizer.ingest({ ...event, eventId: "legacy-full-billing-event", schema: undefined }), false);

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 1);
    assert.equal(stats.totals.totalTokens, 55);
    assert.equal(stats.totals.costUsd, 0.001);
    assert.equal(stats.models[0]?.model, "kimi-vision");
    assert.equal(stats.models[0]?.provider, "Kimi Code - Coding Plan");
    assert.equal(stats.recentRequests[0]?.credentialId, "test-1");
    assert.equal(estimateCallCount, 0);

    const database = createBetterSqliteDatabase(path.join(dir, "usage.sqlite"));
    try {
      const queryPlan = database
        .prepare("EXPLAIN QUERY PLAN SELECT 1 FROM usage_events WHERE request_id = ? LIMIT 1")
        .all(event.eventId)
        .map((row) => String(row.detail ?? ""))
        .join("\n");
      assert.match(queryPlan, /usage_events_request_id_idx/);
    } finally {
      database.close();
    }
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("lightweight Fusion usage normalizes OpenAI cache tokens and estimates unconfigured zero costs", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-fusion-zero-cost-test-"));
  try {
    const estimatedInputs = [];
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async (input) => {
        estimatedInputs.push(input);
        return { amountUsd: 0.0025, model: input.model, source: "litellm" };
      }
    });
    const synchronizer = new GatewayBillingSynchronizer({ getConfig: () => fusionUsageConfig, store });

    assert.equal(await synchronizer.ingest({
      billing: {
        cost: { total: 0 },
        usage: {
          cache_read_tokens: 10,
          input_tokens: 50,
          output_tokens: 5,
          total_tokens: 55
        }
      },
      emittedAt: new Date().toISOString(),
      eventId: "fusion-vision-zero-cost-event",
      outcome: { status: "success", statusCode: 200 },
      performance: { latency_ms: 100 },
      route: { method: "POST", url: "/v1/chat/completions" },
      schema: "llmr.fusion-usage.v1",
      source: { adapterKey: "openai_chat", provider: "fusion_vision" },
      target: {
        model: "openai-vision",
        providerName: "OpenAI Compatible::openai_chat_completions"
      }
    }), true);

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.inputTokens, 40);
    assert.equal(stats.totals.cacheTokens, 10);
    assert.equal(stats.totals.totalTokens, 55);
    assert.equal(stats.totals.costUsd, 0.0025);
    assert.equal(stats.models[0]?.provider, "OpenAI Compatible");
    assert.deepEqual(estimatedInputs, [{
      cacheReadTokens: 10,
      cacheWrite1hTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWriteTokens: 0,
      inputTokens: 40,
      model: "openai-vision",
      outputTokens: 5,
      pricing: undefined,
      provider: "OpenAI Compatible"
    }]);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("lightweight Fusion usage preserves slash-containing external model IDs through storage", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-fusion-external-model-test-"));
  try {
    const estimatedInputs = [];
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async (input) => {
        estimatedInputs.push(input);
        return { amountUsd: 0.004, model: input.model, source: "litellm" };
      }
    });
    const synchronizer = new GatewayBillingSynchronizer({ getConfig: () => fusionUsageConfig, store });
    const model = "accounts/fireworks/models/llama-v3p2-11b-vision-instruct";

    assert.equal(await synchronizer.ingest({
      billing: {
        cost: {},
        usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 }
      },
      emittedAt: new Date().toISOString(),
      eventId: "fusion-external-slash-model-event",
      outcome: { status: "success", statusCode: 200 },
      performance: { latency_ms: 100 },
      route: { method: "POST", url: "/v1/chat/completions" },
      schema: "llmr.fusion-usage.v1",
      source: { adapterKey: "openai_chat", provider: "fusion_vision" },
      target: { model }
    }), true);

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.models[0]?.model, model);
    assert.equal(stats.models[0]?.provider, "unknown");
    assert.equal(stats.recentRequests[0]?.logicalModel, model);
    assert.deepEqual(estimatedInputs, [{
      cacheReadTokens: 0,
      cacheWrite1hTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWriteTokens: 0,
      inputTokens: 10,
      model,
      outputTokens: 3,
      pricing: undefined,
      provider: "unknown"
    }]);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("lightweight Fusion usage honors numeric-string zero costs from global core billing rates", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-fusion-global-rate-test-"));
  try {
    let estimateCallCount = 0;
    const store = new UsageStore(path.join(dir, "usage.sqlite"), {
      estimateCost: async () => {
        estimateCallCount += 1;
        return { amountUsd: 99, model: "unexpected", source: "litellm" };
      }
    });
    const synchronizer = new GatewayBillingSynchronizer({
      getConfig: () => fusionUsageConfig,
      getGlobalBillingConfig: () => ({
        rates: {
          openai: {
            cacheReadPerMillionUsd: "0",
            cacheWritePerMillionUsd: "0",
            inputPerMillionUsd: "0",
            outputPerMillionUsd: "0"
          }
        }
      }),
      store
    });

    assert.equal(await synchronizer.ingest({
      billing: {
        cost: { total: 0 },
        usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 }
      },
      emittedAt: new Date().toISOString(),
      eventId: "fusion-global-zero-rate-event",
      outcome: { status: "success", statusCode: 200 },
      performance: { latency_ms: 100 },
      route: { method: "POST", url: "/v1/chat/completions" },
      schema: "llmr.fusion-usage.v1",
      source: { adapterKey: "openai_chat", provider: "fusion_vision" },
      target: {
        model: "openai-vision",
        providerName: "OpenAI Compatible::openai_chat_completions"
      }
    }), true);

    const stats = await store.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.costUsd, 0);
    assert.equal(estimateCallCount, 0);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("lightweight Fusion usage coalesces concurrent deliveries of the same event", async () => {
  let hasRequestIdCallCount = 0;
  let recordCallCount = 0;
  let releaseRecord;
  let markRecordStarted;
  const recordStarted = new Promise((resolve) => {
    markRecordStarted = resolve;
  });
  const recordReleased = new Promise((resolve) => {
    releaseRecord = resolve;
  });
  const store = {
    hasRequestId: async () => {
      hasRequestIdCallCount += 1;
      return false;
    },
    record: async () => {
      recordCallCount += 1;
      markRecordStarted();
      await recordReleased;
    }
  };
  const synchronizer = new GatewayBillingSynchronizer({ getConfig: () => fusionUsageConfig, store });
  const event = {
    billing: {
      cost: { total: 0.001 },
      usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 }
    },
    emittedAt: new Date().toISOString(),
    eventId: "fusion-concurrent-event",
    outcome: { status: "success", statusCode: 200 },
    performance: { latency_ms: 100 },
    route: { method: "POST", url: "/v1/chat/completions" },
    schema: "llmr.fusion-usage.v1",
    source: { adapterKey: "openai_chat", provider: "fusion_vision" },
    target: { model: "openai-vision", providerName: "OpenAI Compatible" }
  };

  const first = synchronizer.ingest(event);
  await recordStarted;
  const second = synchronizer.ingest(event);
  releaseRecord();

  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(hasRequestIdCallCount, 1);
  assert.equal(recordCallCount, 1);
});

test("UsageStore backfills missing events from request logs", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-request-log-backfill-test-"));
  try {
    const requestLogDbFile = path.join(dir, "request-logs.sqlite");
    const requestLogStore = new RequestLogStore(requestLogDbFile);
    const usageStore = new UsageStore(path.join(dir, "usage.sqlite"), { requestLogDbFile });
    const createdAt = new Date().toISOString();

    await requestLogStore.record({
      client: "Claude Code",
      completedAt: createdAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/messages",
      providerName: "alpha",
      requestBody: Buffer.from(JSON.stringify({ model: "alpha-model" })),
      requestHeaders: { "content-type": "application/json" },
      requestId: "req-backfill-1",
      responseBodyText: JSON.stringify({
        model: "alpha-model",
        usage: {
          input_tokens: 12,
          output_tokens: 5,
          total_tokens: 17
        }
      }),
      responseHeaders: new Headers({ "content-type": "application/json" }),
      startedAt: createdAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const stats = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(stats.totals.requestCount, 1);
    assert.equal(stats.totals.totalTokens, 17);
    assert.equal(stats.providerModels[0]?.provider, "alpha");
    assert.equal(stats.providerModels[0]?.model, "alpha-model");

    const reread = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(reread.totals.requestCount, 1);
    assert.equal(reread.totals.totalTokens, 17);
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("UsageStore reset clears overview stats and does not backfill old request logs", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-reset-test-"));
  try {
    const requestLogDbFile = path.join(dir, "request-logs.sqlite");
    const requestLogStore = new RequestLogStore(requestLogDbFile);
    const usageStore = new UsageStore(path.join(dir, "usage.sqlite"), { requestLogDbFile });
    const beforeResetAt = new Date().toISOString();

    await requestLogStore.record({
      client: "Claude Code",
      completedAt: beforeResetAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/messages",
      providerName: "alpha",
      requestBody: Buffer.from(JSON.stringify({ model: "alpha-model" })),
      requestHeaders: { "content-type": "application/json" },
      requestId: "req-reset-before",
      responseBodyText: JSON.stringify({
        model: "alpha-model",
        usage: {
          input_tokens: 12,
          output_tokens: 5,
          total_tokens: 17
        }
      }),
      responseHeaders: new Headers({ "content-type": "application/json" }),
      startedAt: beforeResetAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const before = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(before.totals.requestCount, 1);

    const reset = await usageStore.resetStatistics();
    assert.equal(reset.deletedEvents, 1);

    const afterReset = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(afterReset.totals.requestCount, 0);
    assert.equal(afterReset.totals.totalTokens, 0);

    const afterResetAt = new Date(Date.parse(reset.resetAt) + 1000).toISOString();
    await requestLogStore.record({
      client: "Claude Code",
      completedAt: afterResetAt,
      durationMs: 40,
      method: "POST",
      path: "/v1/messages",
      providerName: "beta",
      requestBody: Buffer.from(JSON.stringify({ model: "beta-model" })),
      requestHeaders: { "content-type": "application/json" },
      requestId: "req-reset-after",
      responseBodyText: JSON.stringify({
        model: "beta-model",
        usage: {
          input_tokens: 7,
          output_tokens: 3,
          total_tokens: 10
        }
      }),
      responseHeaders: new Headers({ "content-type": "application/json" }),
      startedAt: afterResetAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    const afterNewRequest = await usageStore.getStats("today", { includeProxy: true });
    assert.equal(afterNewRequest.totals.requestCount, 1);
    assert.equal(afterNewRequest.totals.totalTokens, 10);
    assert.equal(afterNewRequest.providerModels[0]?.provider, "beta");
  } finally {
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("#1801 unknown HTTP status is excluded from failure and success rate counts", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-outcome-"));
  try {
    const store = new UsageStore(path.join(dir, "usage.sqlite"));
    for (const statusCode of [0, 200, 500]) {
      await store.record({ createdAt: new Date().toISOString(), durationMs: 5, method: "POST", model: "local", path: "/v1/messages", provider: "local", requestId: `status-${statusCode}`, statusCode, usage: { inputTokens: 1, outputTokens: 1 } });
    }
    const stats = await store.getStats("today");
    assert.equal(stats.totals.requestCount, 3);
    assert.equal(stats.totals.errorCount, 1);
    assert.equal(stats.totals.successRate, 0.5);
    assert.equal(stats.models[0].successRate, 0.5);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("UsageStore drops usage events older than the retention window", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-retention-test-"));
  try {
    const dbFile = path.join(dir, "usage.sqlite");
    const event = { durationMs: 1, method: "POST", model: "alpha-model", path: "/v1/messages", provider: "alpha", statusCode: 200 };
    await new UsageStore(dbFile).record({ ...event, createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1_000).toISOString(), requestId: "old" });
    await new UsageStore(dbFile).record({ ...event, createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1_000).toISOString(), requestId: "kept" });

    const totals = await new UsageStore(dbFile).getTotalsSince(new Date(0), {}, { includeProxy: true });
    assert.equal(totals.requestCount, 1);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("UsageStore backs off request-log backfill after it fails", async (t) => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-backfill-backoff-test-"));
  try {
    const requestLogDbFile = path.join(dir, "request-logs.sqlite");
    writeFileSync(requestLogDbFile, "not a sqlite database");
    t.mock.method(console, "warn", () => {});
    // The tick below crosses local midnight. With the "today" range the request then counted as yesterday's, so this
    // test failed for the last minute of each day.
    const justBeforeMidnight = new Date();
    justBeforeMidnight.setHours(23, 59, 30, 0);
    t.mock.timers.enable({ apis: ["Date"], now: justBeforeMidnight.getTime() });
    const usageStore = new UsageStore(path.join(dir, "usage.sqlite"), { requestLogDbFile });

    assert.equal((await usageStore.getStats("24h", { includeProxy: true })).totals.requestCount, 0);

    rmSync(requestLogDbFile, { force: true });
    const createdAt = new Date().toISOString();
    await new RequestLogStore(requestLogDbFile).record({
      client: "Claude Code",
      completedAt: createdAt,
      durationMs: 25,
      method: "POST",
      path: "/v1/messages",
      providerName: "alpha",
      requestBody: Buffer.from(JSON.stringify({ model: "alpha-model" })),
      requestHeaders: { "content-type": "application/json" },
      requestId: "req-backoff-1",
      responseBodyText: JSON.stringify({ model: "alpha-model", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }),
      responseHeaders: new Headers({ "content-type": "application/json" }),
      startedAt: createdAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    });

    assert.equal((await usageStore.getStats("24h", { includeProxy: true })).totals.requestCount, 0, "still backing off");
    t.mock.timers.tick(60_001);
    assert.equal((await usageStore.getStats("24h", { includeProxy: true })).totals.requestCount, 1, "retried after the backoff");
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

async function until(read) {
  const deadline = performance.now() + 2_000;
  while (!read() && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
}

test("the usage sweep prices a waiting row by the connected rule and the priced model, marks a row the rule cannot price, and sends both outcomes to the request log", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-connected-sweep-test-"));
  const file = path.join(dir, "usage.sqlite");
  const read = (sql, ...params) => {
    const database = createBetterSqliteDatabase(file);
    try {
      return database.prepare(sql).get(...params);
    } finally {
      database.close();
    }
  };
  const row = (requestId) => ({ ...read("SELECT cost_source, cost_usd FROM usage_events WHERE request_id = ?", requestId) });
  const rowWithoutRequestId = () => ({ ...read("SELECT cost_source, cost_usd FROM usage_events WHERE request_id = ''") });
  try {
    const store = new UsageStore(file, { loadPriceCatalog: async () => {}, priceCatalogNeedsRefresh: () => true });
    const event = { durationMs: 1, method: "POST", path: "/v1/messages", provider: "alpha", statusCode: 200, usage: { inputTokens: 10, outputTokens: 1 } };
    const sent = [];
    const price = { price: { pricing: { inputUsdPerMillionTokens: 100_000, outputUsdPerMillionTokens: 0 }, source: "litellm" }, state: "priced" };
    store.connectPricing({
      enqueueRequestLogPrices: (updates) => sent.push(...updates),
      resolvePrice: (_provider, model) => model === "known-model" ? price : { state: "unpriced" }
    });
    await store.record({ ...event, model: "known-model", price: { state: "no-catalog" }, requestId: "waiting" });
    await store.record({ ...event, model: "my-alias", price: { state: "no-catalog" }, priceModel: "known-model", requestId: "alias" });
    await store.record({ ...event, model: "no-price-model", price: { state: "no-catalog" }, requestId: "unpriced" });
    await store.record({ ...event, model: "known-model", price: { state: "no-catalog" }, requestId: "" });
    await until(() => row("waiting").cost_usd !== null && row("alias").cost_usd !== null && row("unpriced").cost_source === "unpriced" && rowWithoutRequestId().cost_usd !== null);
    assert.deepEqual(row("waiting"), { cost_source: "litellm", cost_usd: 1 });
    assert.deepEqual(row("alias"), { cost_source: "litellm", cost_usd: 1 });
    assert.deepEqual(row("unpriced"), { cost_source: "unpriced", cost_usd: null });
    assert.deepEqual(rowWithoutRequestId(), { cost_source: "litellm", cost_usd: 1 });
    assert.deepEqual(sent.sort((left, right) => left.requestId < right.requestId ? -1 : 1), [
      { price, requestId: "alias" },
      { price: { state: "unpriced" }, requestId: "unpriced" },
      { price, requestId: "waiting" }
    ]);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("a store that was never connected to the rule records a waiting row and never loads a catalog", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-unconnected-test-"));
  try {
    let loads = 0;
    const store = new UsageStore(path.join(dir, "usage.sqlite"), { loadPriceCatalog: async () => { loads += 1; }, priceCatalogNeedsRefresh: () => true });
    await store.record({ durationMs: 1, method: "POST", model: "known-model", path: "/v1/messages", price: { state: "no-catalog" }, provider: "alpha", requestId: "waiting", statusCode: 200, usage: { inputTokens: 10, outputTokens: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const row = (await store.getDatabase()).prepare("SELECT cost_source, cost_usd FROM usage_events WHERE request_id = 'waiting'").get();
    assert.deepEqual({ ...row }, { cost_source: "", cost_usd: null });
    assert.equal(loads, 0);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("a row keeps the forwarded id and e-mail it was recorded with", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-forwarded-identity-test-"));
  try {
    const dbFile = path.join(dir, "usage.sqlite");
    const store = new UsageStore(dbFile);
    const event = { durationMs: 1, method: "POST", model: "alpha-model", path: "/v1/messages", provider: "alpha", statusCode: 200 };
    await store.record({ ...event, forwardedUserEmail: "dev@example.com", forwardedUserId: "sub-123", requestId: "forwarded" });
    await store.record({ ...event, requestId: "plain" });
    await store.recordCapture({ bodyText: "", durationMs: 1, forwardedUserEmail: "cap@example.com", forwardedUserId: "sub-456", method: "POST", path: "/v1/messages", requestId: "captured", responseHeaders: new Headers(), statusCode: 200 });
    const rows = (await store.getDatabase()).prepare("SELECT request_id, forwarded_user_email, forwarded_user_id FROM usage_events ORDER BY id").all().map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { forwarded_user_email: "dev@example.com", forwarded_user_id: "sub-123", request_id: "forwarded" },
      { forwarded_user_email: "", forwarded_user_id: "", request_id: "plain" },
      { forwarded_user_email: "cap@example.com", forwarded_user_id: "sub-456", request_id: "captured" }
    ]);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("a database made before these columns gains them when it is opened", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-forwarded-columns-test-"));
  try {
    const dbFile = path.join(dir, "usage.sqlite");
    const event = { durationMs: 1, method: "POST", model: "alpha-model", path: "/v1/messages", provider: "alpha", statusCode: 200 };
    await new UsageStore(dbFile).record({ ...event, requestId: "old" });
    const legacy = createBetterSqliteDatabase(dbFile);
    try {
      legacy.exec("ALTER TABLE usage_events DROP COLUMN forwarded_user_email");
      legacy.exec("ALTER TABLE usage_events DROP COLUMN forwarded_user_id");
    } finally {
      legacy.close();
    }
    const store = new UsageStore(dbFile);
    await store.record({ ...event, forwardedUserEmail: "dev@example.com", forwardedUserId: "sub-123", requestId: "new" });
    const rows = (await store.getDatabase()).prepare("SELECT request_id, forwarded_user_email, forwarded_user_id FROM usage_events ORDER BY id").all().map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { forwarded_user_email: "", forwarded_user_id: "", request_id: "old" },
      { forwarded_user_email: "dev@example.com", forwarded_user_id: "sub-123", request_id: "new" }
    ]);
  } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
});

test("a log row copied into the totals keeps its price source, and a log database without the column still copies", async () => {
  for (const dropColumn of [false, true]) {
    const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-copy-cost-source-test-"));
    try {
      const requestLogDbFile = path.join(dir, "request-logs.sqlite");
      const logs = new RequestLogStore(requestLogDbFile);
      const createdAt = new Date().toISOString();
      const pricing = { inputUsdPerMillionTokens: 5, outputUsdPerMillionTokens: 6 };
      await logs.writeBatch([{
        eventId: "median-event",
        input: {
          completedAt: createdAt,
          durationMs: 10,
          forwardedUserEmail: "dev@example.com",
          forwardedUserId: "sub-123",
          method: "POST",
          path: "/v1/messages",
          price: { price: { pricing, source: "models.dev-median" }, state: "priced" },
          providerName: "alpha",
          requestBody: Buffer.from(JSON.stringify({ model: "lab-model" })),
          requestHeaders: { "content-type": "application/json" },
          requestId: "median-request",
          responseBodyText: JSON.stringify({ model: "lab-model", usage: { input_tokens: 1_000_000, output_tokens: 0 } }),
          responseHeaders: { "content-type": "application/json" },
          startedAt: createdAt,
          statusCode: 200,
          url: "http://127.0.0.1:3456/v1/messages"
        },
        kind: "record",
        sequence: 1
      }]);
      await logs.close();
      if (dropColumn) {
        const database = createBetterSqliteDatabase(requestLogDbFile);
        try {
          database.exec("ALTER TABLE request_logs DROP COLUMN cost_source");
        } finally {
          database.close();
        }
      }

      const usageDbFile = path.join(dir, "usage.sqlite");
      const stats = await new UsageStore(usageDbFile, { requestLogDbFile }).getStats("today", { includeProxy: true });
      assert.equal(stats.totals.requestCount, 1);
      const database = createBetterSqliteDatabase(usageDbFile);
      try {
        assert.deepEqual(
          { ...database.prepare("SELECT cost_source, cost_usd, forwarded_user_email, forwarded_user_id FROM usage_events WHERE request_id = 'median-request'").get() },
          { cost_source: dropColumn ? "request_log" : "models.dev-median", cost_usd: 5, forwarded_user_email: "dev@example.com", forwarded_user_id: "sub-123" }
        );
      } finally {
        database.close();
      }
    } finally { removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]); }
  }
});

const customHaikuProvider = {
  baseUrl: "https://api.example.com",
  models: ["claude-haiku-5-5"],
  name: "VM Custom",
  type: "anthropic_messages"
};
const customHaikuConfig = { Providers: [customHaikuProvider] };
const haikuResponseBody = JSON.stringify({
  model: "claude-haiku-5-5",
  usage: { input_tokens: 143, output_tokens: 4 }
});

// Stands in for a process that loaded its catalog at another time: the same
// offers at other prices, served through fetch and never from an outside host.
async function loadHaikuCatalog(input, output) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes("models.dev")) {
      return Response.json({
        "reseller-a": { models: { "claude-haiku-5-5": { canonical_model_id: "anthropic/claude-haiku-5-5", cost: { input: 0.1714, output: 0.8571 } } } },
        anthropic: { models: { "claude-haiku-5-5": { cost: { input, output } } } }
      });
    }
    if (target.includes("openrouter.ai")) {
      return Response.json({ data: [{ id: "lab/unrelated-model", pricing: { completion: "0.000001", prompt: "0.000001" } }] });
    }
    return Response.json({ "unrelated-model": { input_cost_per_token: 0.000001, output_cost_per_token: 0.000001 } });
  };
  try {
    await preloadUsagePriceCatalog({ forceRefresh: true });
  } finally {
    globalThis.fetch = previousFetch;
  }
}

async function recordHaikuRequest(dir, requestId, price) {
  const requestLogDbFile = path.join(dir, "request-logs.sqlite");
  const createdAt = new Date().toISOString();
  const logs = new RequestLogStore(requestLogDbFile);
  await logs.writeBatch([{
    eventId: `${requestId}-event`,
    input: {
      client: "curl",
      completedAt: createdAt,
      durationMs: 30,
      method: "POST",
      path: "/v1/messages",
      price,
      providerName: customHaikuProvider.name,
      requestBody: Buffer.from(JSON.stringify({ model: "claude-haiku-5-5" })),
      requestHeaders: { "content-type": "application/json" },
      requestId,
      responseBodyText: haikuResponseBody,
      responseHeaders: { "content-type": "application/json" },
      startedAt: createdAt,
      statusCode: 200,
      url: "http://127.0.0.1:3456/v1/messages"
    },
    kind: "record",
    sequence: 1
  }]);
  await logs.close();
  await new UsageStore(path.join(dir, "usage.sqlite"), { requestLogDbFile }).recordCapture({
    bodyText: haikuResponseBody,
    client: "curl",
    config: customHaikuConfig,
    durationMs: 30,
    fallbackModel: "claude-haiku-5-5",
    method: "POST",
    path: "/v1/messages",
    price,
    providerName: customHaikuProvider.name,
    providerProtocol: "anthropic_messages",
    requestId,
    responseHeaders: new Headers({ "content-type": "application/json" }),
    statusCode: 200
  });
  const read = (file, table) => {
    const database = createBetterSqliteDatabase(path.join(dir, file));
    try {
      return database.prepare(`SELECT cost_source, cost_usd FROM ${table} WHERE request_id = ?`).get(requestId);
    } finally {
      database.close();
    }
  };
  return { logRow: read("request-logs.sqlite", "request_logs"), usageRow: read("usage.sqlite", "usage_events") };
}

// These two tests load a price catalog into module state, so they stay last
// and unload it when they finish.
test("a request priced once keeps one cost and one source in Logs and in the totals after the catalog changes", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-logs-cost-parity-test-"));
  try {
    await loadHaikuCatalog(0.1, 0.5);
    const price = resolveRequestPrice(customHaikuConfig, customHaikuProvider.name, "claude-haiku-5-5");
    await loadHaikuCatalog(0.2, 1);

    const { logRow, usageRow } = await recordHaikuRequest(dir, "vm-request-1", price);

    assert.ok(Math.abs(logRow.cost_usd - 0.0000163) < 1e-12, "priced by the catalog the request was resolved against");
    assert.deepEqual({ ...usageRow }, { ...logRow });
    assert.equal(logRow.cost_source, "models.dev");
  } finally {
    await preloadUsagePriceCatalog({ forceRefresh: true }).catch(() => undefined);
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});

test("a request resolved to no price is estimated by neither writer, whatever catalog each holds", async () => {
  const dir = mkdtempSync(path.join(testTempRoot, "llmr-usage-logs-unpriced-test-"));
  try {
    await loadHaikuCatalog(0.2, 1);

    const { logRow, usageRow } = await recordHaikuRequest(dir, "vm-request-2", { state: "unpriced" });

    assert.deepEqual({ ...logRow }, { cost_source: "unpriced", cost_usd: null });
    assert.deepEqual({ ...usageRow }, { cost_source: "unpriced", cost_usd: null });
  } finally {
    await preloadUsagePriceCatalog({ forceRefresh: true }).catch(() => undefined);
    removeTestDir(dir, ["usage.sqlite", "request-logs.sqlite"]);
  }
});
