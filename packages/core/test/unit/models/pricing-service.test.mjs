import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  estimateUsageCostUsd,
  estimateUsageCostUsdFromLoadedCatalog,
  preloadUsagePriceCatalog,
  providerModelPricingForUsage
} from "@llmr/core/models/pricing-service.ts";

const pricing = {
  cacheReadUsdPerMillionTokens: 0.5,
  cacheWriteUsdPerMillionTokens: 3,
  inputUsdPerMillionTokens: 2,
  outputUsdPerMillionTokens: 8
};

test("custom model pricing is used without loading the remote catalog", async () => {
  const input = {
    cacheReadTokens: 250000,
    cacheWriteTokens: 100000,
    inputTokens: 1000000,
    model: "custom-model",
    outputTokens: 500000,
    pricing,
    provider: "Custom"
  };

  assert.deepEqual(await estimateUsageCostUsd(input), {
    amountUsd: 6.425,
    model: "custom-model",
    source: "custom"
  });
  assert.deepEqual(estimateUsageCostUsdFromLoadedCatalog(input), {
    amountUsd: 6.425,
    model: "custom-model",
    source: "custom"
  });
});

test("custom pricing requires both input and output prices", async () => {
  const result = estimateUsageCostUsdFromLoadedCatalog({
    inputTokens: 1000,
    model: "custom-model",
    pricing: { inputUsdPerMillionTokens: 2 },
    provider: "Custom"
  });

  assert.equal(result, undefined);
});

test("custom pricing applies separate 5m and 1h cache-write rates", () => {
  const result = estimateUsageCostUsdFromLoadedCatalog({
    cacheWrite1hTokens: 40000,
    cacheWrite5mTokens: 60000,
    cacheWriteTokens: 120000,
    model: "custom-model",
    pricing: {
      cacheWrite1hUsdPerMillionTokens: 6,
      cacheWrite5mUsdPerMillionTokens: 3,
      inputUsdPerMillionTokens: 2,
      outputUsdPerMillionTokens: 8
    },
    provider: "Custom"
  });

  assert.ok(Math.abs((result?.amountUsd ?? 0) - 0.48) < 1e-12);
  assert.equal(result?.model, "custom-model");
  assert.equal(result?.source, "custom");
});

test("provider model pricing lookup is case-insensitive and accepts a full selector", () => {
  const config = {
    Providers: [{
      modelMetadata: {
        "Custom-Model": { pricing },
        "Vendor/some-model": { pricing }
      },
      models: ["Custom-Model", "Vendor/some-model"],
      name: "Custom"
    }]
  };

  assert.deepEqual(providerModelPricingForUsage(config, "custom", "CUSTOM/Custom-Model"), pricing);
  assert.deepEqual(
    providerModelPricingForUsage(config, "custom", "custom::openai_chat_completions/Custom-Model"),
    pricing
  );
  assert.deepEqual(
    providerModelPricingForUsage(
      config,
      "custom",
      "custom::openai_chat_completions::cred:main/Custom-Model"
    ),
    pricing
  );
  assert.deepEqual(
    providerModelPricingForUsage(config, "custom", "custom::anthropic_messages/Vendor/some-model"),
    pricing
  );
  assert.equal(providerModelPricingForUsage(config, "custom", "my-alias"), undefined);
  assert.equal(providerModelPricingForUsage(config, "other", "custom-model"), undefined);
});

test("a price source that failed is fetched again well before the 24h catalog TTL", async () => {
  const originalFetch = globalThis.fetch;
  let modelsDevUp = false;
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    if (String(url).includes("litellm")) {
      return Response.json({ "litellm-model": { input_cost_per_token: 0.000001, output_cost_per_token: 0.000002 } });
    }
    if (String(url).includes("models.dev")) {
      if (!modelsDevUp) throw new Error("models.dev unreachable");
      return Response.json({
        anthropic: { models: { "retry-model": { cost: { input: 2, output: 8 }, id: "retry-model" } } }
      });
    }
    return Response.json({ data: [] });
  };
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const usage = { inputTokens: 1_000_000, model: "retry-model", outputTokens: 0, provider: "anthropic" };
  try {
    await preloadUsagePriceCatalog({ forceRefresh: true });
    assert.equal(estimateUsageCostUsdFromLoadedCatalog(usage), undefined);

    modelsDevUp = true;
    mock.timers.tick(5 * 60 * 1000);
    await preloadUsagePriceCatalog();
    assert.deepEqual(estimateUsageCostUsdFromLoadedCatalog(usage), {
      amountUsd: 2,
      model: "retry-model",
      source: "models.dev"
    });
    assert.equal(fetched.filter((url) => url.includes("litellm")).length, 1, "a healthy source is not refetched");

    mock.timers.tick(60 * 60 * 1000);
    assert.ok(estimateUsageCostUsdFromLoadedCatalog(usage), "a complete catalog keeps the full TTL");
  } finally {
    mock.timers.reset();
    globalThis.fetch = originalFetch;
  }
});
