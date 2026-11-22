import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  estimateUsageCostUsd,
  estimateUsageCostUsdFromLoadedCatalog,
  parseUsagePricingSource,
  preloadUsagePriceCatalog,
  providerModelPricingForUsage,
  resolveProviderModelPrice,
  resolveRequestPrice
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

const makerHaiku = { cacheReadUsdPerMillionTokens: 0.01, cacheWriteUsdPerMillionTokens: 0.125, inputUsdPerMillionTokens: 0.1, outputUsdPerMillionTokens: 0.5 };
const makerHaikuOffer = { cost: { cache_read: 0.01, cache_write: 0.125, input: 0.1, output: 0.5 }, id: "claude-haiku-5-5" };
const resellerHaikuOffer = (input, output) => ({
  canonical_model_id: "anthropic/claude-haiku-5-5",
  cost: { input, output },
  id: "claude-haiku-5-5"
});
const haikuModelsDev = {
  "reseller-a": { models: { "claude-haiku-5-5": resellerHaikuOffer(0.06, 0.3) } },
  anthropic: { models: { "claude-haiku-5-5": makerHaikuOffer } },
  "reseller-b": { models: { "claude-haiku-5-5": resellerHaikuOffer(0.1714, 0.8571) } }
};
const customProvider = { baseUrl: "https://api.example.com", models: ["claude-haiku-5-5"], name: "VM Custom" };
const customConfig = { Providers: [customProvider] };
const million = { inputTokens: 1_000_000, outputTokens: 1_000_000 };

async function withPriceCatalogs({ liteLlm = {}, modelsDev = {}, openRouter = [] }, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes("litellm")) return Response.json(liteLlm);
    if (target.includes("models.dev")) return Response.json(modelsDev);
    if (target.includes("openrouter.ai")) return Response.json({ data: openRouter });
    throw new Error(`a test must not reach ${target}`);
  };
  try {
    await preloadUsagePriceCatalog({ forceRefresh: true });
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("two catalogs that list the same offers in a different provider order give the same price", async () => {
  const reversed = Object.fromEntries(Object.entries(haikuModelsDev).reverse());
  for (const modelsDev of [haikuModelsDev, reversed]) {
    await withPriceCatalogs({ modelsDev }, () => {
      assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "claude-haiku-5-5"), {
        pricing: makerHaiku,
        source: "models.dev"
      });
      assert.deepEqual(
        estimateUsageCostUsdFromLoadedCatalog({ ...million, model: "claude-haiku-5-5", provider: "VM Custom" }),
        { amountUsd: 0.6, model: "claude-haiku-5-5", source: "models.dev" }
      );
    });
  }
});

test("a price the user set for the provider's model wins over every catalog", async () => {
  const pricing = { inputUsdPerMillionTokens: 9, outputUsdPerMillionTokens: 9 };
  const config = { Providers: [{ ...customProvider, modelMetadata: { "claude-haiku-5-5": { pricing } } }] };
  await withPriceCatalogs({ modelsDev: haikuModelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(config, "VM Custom", "claude-haiku-5-5"), { pricing, source: "custom" });
  });
});

test("a user price of zero is a real price of zero", async () => {
  const pricing = { inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 };
  const config = { Providers: [{ ...customProvider, modelMetadata: { "claude-haiku-5-5": { pricing } } }] };
  await withPriceCatalogs({ modelsDev: haikuModelsDev }, () => {
    const price = resolveProviderModelPrice(config, "VM Custom", "claude-haiku-5-5");
    assert.deepEqual(price, { pricing, source: "custom" });
    const usage = { model: "claude-haiku-5-5", pricing: price.pricing, pricingSource: price.source, provider: "VM Custom" };
    assert.deepEqual(estimateUsageCostUsdFromLoadedCatalog({ ...usage, inputTokens: 143, outputTokens: 4 }), {
      amountUsd: 0,
      model: "claude-haiku-5-5",
      source: "custom"
    });
    assert.equal(estimateUsageCostUsdFromLoadedCatalog(usage), undefined, "no tokens, no cost");
  });
});

test("a catalog entry priced 0 for input and output does not stop the rule", async () => {
  const modelsDev = {
    deepseek: { models: { "deepseek-chat": { cost: { input: 0, output: 0 } } } }
  };
  const liteLlm = { "deepseek-chat": { input_cost_per_token: 0.0000008, output_cost_per_token: 0.000002 } };
  const config = { Providers: [{ baseUrl: "https://api.deepseek.com", models: ["deepseek-chat"], name: "DeepSeek" }] };
  await withPriceCatalogs({ liteLlm, modelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(config, "DeepSeek", "deepseek-chat"), {
      pricing: { inputUsdPerMillionTokens: 0.8, outputUsdPerMillionTokens: 2 },
      source: "litellm"
    });
    const resolved = { inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 5 };
    assert.equal(
      estimateUsageCostUsdFromLoadedCatalog({ inputTokens: 10, model: "m", pricing: resolved, pricingSource: "models.dev" }),
      undefined,
      "only a user price may come to zero"
    );
  });
});

test("an OpenRouter provider is priced by OpenRouter's own entry, and no other provider is", async () => {
  const openRouter = [{ id: "anthropic/claude-haiku-5-5", pricing: { completion: "0.0000007", prompt: "0.0000002" } }];
  const openRouterOnly = [{ id: "lab/only-on-openrouter", pricing: { completion: "0.000002", prompt: "0.000001" } }];
  const config = {
    Providers: [
      { baseUrl: "https://openrouter.ai/api/v1", models: ["anthropic/claude-haiku-5-5"], name: "Router" },
      { ...customProvider, models: ["lab/only-on-openrouter"] }
    ]
  };
  await withPriceCatalogs({ modelsDev: haikuModelsDev, openRouter: [...openRouter, ...openRouterOnly] }, () => {
    assert.deepEqual(resolveProviderModelPrice(config, "Router", "anthropic/claude-haiku-5-5"), {
      pricing: { inputUsdPerMillionTokens: 0.2, outputUsdPerMillionTokens: 0.7 },
      source: "openrouter"
    });
    assert.deepEqual(resolveRequestPrice(config, "VM Custom", "lab/only-on-openrouter"), { state: "unpriced" });
  });
});

test("the catalog provider a base URL maps to prices its own model before the maker does", async () => {
  const modelsDev = {
    deepseek: { models: { "shared-model": { canonical_model_id: "lab/shared-model", cost: { input: 0.3, output: 0.9 } } } },
    lab: { models: { "shared-model": { cost: { input: 1, output: 3 } } } }
  };
  const config = { Providers: [{ baseUrl: "https://api.deepseek.com", models: ["shared-model"], name: "My DS" }] };
  await withPriceCatalogs({ modelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(config, "My DS", "shared-model"), {
      pricing: { inputUsdPerMillionTokens: 0.3, outputUsdPerMillionTokens: 0.9 },
      source: "models.dev"
    });
  });
});

test("the maker's entry is found by a provider/model name, by the one canonical id, and by the provider's name", async () => {
  const modelsDev = {
    anthropic: { models: { "claude-haiku-5-5": makerHaikuOffer, "claude-hinted": { cost: { input: 4, output: 5 } } } },
    "reseller-a": {
      models: {
        "claude-haiku-5-5": resellerHaikuOffer(0.06, 0.3),
        "claude-hinted": { cost: { input: 1, output: 1 } }
      }
    },
    "reseller-b": { models: { "claude-hinted": { cost: { input: 2, output: 2 } } } }
  };
  const proxy = { baseUrl: "https://proxy.example.com", models: ["claude-hinted"], name: "Anthropic Proxy" };
  const config = { Providers: [customProvider, proxy] };
  const maker = { pricing: makerHaiku, source: "models.dev" };
  await withPriceCatalogs({ modelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(config, "VM Custom", "reseller-a/claude-haiku-5-5"), maker);
    assert.deepEqual(resolveProviderModelPrice(config, "VM Custom", "claude-haiku-5-5"), maker);
    assert.deepEqual(resolveProviderModelPrice(config, "Anthropic Proxy", "claude-hinted"), {
      pricing: { inputUsdPerMillionTokens: 4, outputUsdPerMillionTokens: 5 },
      source: "models.dev"
    });
  });
});

const labOffer = (input, output, extra = {}) => ({
  canonical_model_id: "lab/lab-model",
  cost: { input, output, ...extra }
});
const labModelsDev = {
  "reseller-a": { models: { "lab-model": labOffer(50, 60) } },
  "reseller-b": { models: { "lab-model": labOffer(5, 6, { cache_read: 0.5 }) } },
  "reseller-c": { models: { "lab-model": labOffer(1, 100) } }
};
const labMedian = {
  pricing: { cacheReadUsdPerMillionTokens: 0.5, inputUsdPerMillionTokens: 5, outputUsdPerMillionTokens: 6 },
  source: "models.dev-median"
};

test("a canonical id that names no priced entry is priced by the median reseller offer, labelled as such", async () => {
  await withPriceCatalogs({ modelsDev: labModelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "lab-model"), labMedian);
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "reseller-a/lab-model"), labMedian);
    assert.deepEqual(
      estimateUsageCostUsdFromLoadedCatalog({ ...million, model: "lab-model", provider: "VM Custom" }),
      { amountUsd: 11, model: "lab-model", source: "models.dev-median" }
    );
  });
});

test("the median offer does not depend on the order the catalog lists its providers", async () => {
  const reversed = Object.fromEntries(Object.entries(labModelsDev).reverse());
  await withPriceCatalogs({ modelsDev: reversed }, () => {
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "lab-model"), labMedian);
  });
});

test("an even number of offers takes the lower middle offer, ordered by input then output price", async () => {
  const modelsDev = {
    "reseller-a": { models: { "lab-model": labOffer(2, 9) } },
    "reseller-b": { models: { "lab-model": labOffer(8, 8) } },
    "reseller-c": { models: { "lab-model": labOffer(1, 1) } },
    "reseller-d": { models: { "lab-model": labOffer(2, 3) } }
  };
  await withPriceCatalogs({ modelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "lab-model"), {
      pricing: { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 3 },
      source: "models.dev-median"
    });
  });
});

test("an offer priced 0 for input and output is not counted toward the median", async () => {
  const modelsDev = {
    "free-tier": { models: { "lab-model": labOffer(0, 0) } },
    "reseller-a": { models: { "lab-model": labOffer(3, 3) } },
    "reseller-b": { models: { "lab-model": labOffer(6, 6) } },
    "reseller-c": { models: { "lab-model": labOffer(9, 9) } }
  };
  await withPriceCatalogs({ modelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "lab-model"), {
      pricing: { inputUsdPerMillionTokens: 6, outputUsdPerMillionTokens: 6 },
      source: "models.dev-median"
    });
  });
});

test("a LiteLLM entry wins over the median reseller offer", async () => {
  const liteLlm = { "lab-model": { input_cost_per_token: 0.000007, output_cost_per_token: 0.000008 } };
  await withPriceCatalogs({ liteLlm, modelsDev: labModelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "lab-model"), {
      pricing: { inputUsdPerMillionTokens: 7, outputUsdPerMillionTokens: 8 },
      source: "litellm"
    });
  });
});

test("a stored models.dev-median source reads back as a pricing source", () => {
  assert.equal(parseUsagePricingSource("models.dev-median"), "models.dev-median");
  assert.equal(parseUsagePricingSource("models.dev-mean"), undefined);
});

test("a bare name with more than one canonical id skips the maker and is priced by LiteLLM", async () => {
  const modelsDev = {
    "lab-one": { models: { "twin": { cost: { input: 1, output: 1 } } } },
    "lab-two": { models: { "twin": { cost: { input: 2, output: 2 } } } },
    "reseller-a": { models: { "twin": { canonical_model_id: "lab-one/twin", cost: { input: 3, output: 3 } } } },
    "reseller-b": { models: { "twin": { canonical_model_id: "lab-two/twin", cost: { input: 4, output: 4 } } } }
  };
  const liteLlm = { twin: { input_cost_per_token: 0.000007, output_cost_per_token: 0.000008 } };
  await withPriceCatalogs({ liteLlm, modelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "twin"), {
      pricing: { inputUsdPerMillionTokens: 7, outputUsdPerMillionTokens: 8 },
      source: "litellm"
    });
  });
});

test("the only offer of a bare name prices it when exactly one provider lists it", async () => {
  const modelsDev = { "small-host": { models: { "org/rare-model": { cost: { input: 0.4, output: 0.6 } } } } };
  const liteLlm = { "rare-model": { input_cost_per_token: 0.000009, output_cost_per_token: 0.000009 } };
  await withPriceCatalogs({ liteLlm, modelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "rare-model"), {
      pricing: { inputUsdPerMillionTokens: 0.4, outputUsdPerMillionTokens: 0.6 },
      source: "models.dev"
    });
  });
});

test("LiteLLM prices a model by its exact key, then by its bare name", async () => {
  const liteLlm = {
    "host/lite-model": { input_cost_per_token: 0.000001, output_cost_per_token: 0.000002 },
    "lite-model": { input_cost_per_token: 0.000003, output_cost_per_token: 0.000004 }
  };
  await withPriceCatalogs({ liteLlm }, () => {
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "host/lite-model")?.pricing, {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2
    });
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "other/lite-model"), {
      pricing: { inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 4 },
      source: "litellm"
    });
  });
});

test("a model only resellers offer, with no canonical id and no LiteLLM entry, gets the median offer", async () => {
  const modelsDev = {
    "reseller-a": { models: { "orphan": { cost: { input: 1, output: 1 } } } },
    "reseller-b": { models: { "orphan": { cost: { input: 2, output: 2 } } } }
  };
  await withPriceCatalogs({ liteLlm: { other: { input_cost_per_token: 1, output_cost_per_token: 1 } }, modelsDev }, () => {
    assert.deepEqual(resolveProviderModelPrice(customConfig, "VM Custom", "orphan"), {
      pricing: { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 1 },
      source: "models.dev-median"
    });
  });
});

test("a model with no offer that has both an input and an output price above zero stays unpriced", async () => {
  const modelsDev = {
    "free-tier": { models: { "orphan": { cost: { input: 0, output: 0 } } } },
    "half-listed": { models: { "orphan": { cost: { input: 2 } } } }
  };
  await withPriceCatalogs({ liteLlm: { other: { input_cost_per_token: 1, output_cost_per_token: 1 } }, modelsDev }, () => {
    assert.deepEqual(resolveRequestPrice(customConfig, "VM Custom", "orphan"), { state: "unpriced" });
    assert.equal(
      estimateUsageCostUsdFromLoadedCatalog({ ...million, model: "orphan", provider: "VM Custom" }),
      undefined
    );
  });
});

test("the fallback estimate unwraps a route selector and strips the provider prefix", async () => {
  await withPriceCatalogs({ modelsDev: haikuModelsDev }, () => {
    for (const model of ["VM Custom/claude-haiku-5-5", "vm-custom::anthropic_messages/claude-haiku-5-5"]) {
      assert.equal(
        estimateUsageCostUsdFromLoadedCatalog({ ...million, model, provider: "VM Custom" })?.amountUsd,
        0.6,
        model
      );
    }
  });
});

test("with no catalog loaded only a user price resolves, and the outcome says so", async () => {
  const pricing = { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 };
  const config = { Providers: [{ ...customProvider, modelMetadata: { priced: { pricing } }, models: ["priced", "other"] }] };
  await withPriceCatalogs({}, () => {
    assert.deepEqual(resolveRequestPrice(config, "VM Custom", "other"), { state: "no-catalog" });
    assert.deepEqual(resolveRequestPrice(config, "VM Custom", "priced"), {
      price: { pricing, source: "custom" },
      state: "priced"
    });
  });
});
