import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelPricingFields, modelMetadataAfterPriceEdit } from "@llmr/ui/pages/home/components/providers.tsx";

test("editing one price field saves that field and none of the catalog's defaults", () => {
  assert.deepEqual(modelMetadataAfterPriceEdit({}, "cacheReadUsdPerMillionTokens", "0.5"), {
    pricing: { cacheReadUsdPerMillionTokens: 0.5 }
  });
});

test("a price edit keeps the model's other settings and its own saved prices", () => {
  const current = { contextWindow: 1000, pricing: { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 8 } };
  assert.deepEqual(modelMetadataAfterPriceEdit(current, "outputUsdPerMillionTokens", "0"), {
    contextWindow: 1000,
    pricing: { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 0 }
  });
  assert.deepEqual(modelMetadataAfterPriceEdit(current, "inputUsdPerMillionTokens", ""), {
    contextWindow: 1000,
    pricing: { outputUsdPerMillionTokens: 8 }
  });
  assert.deepEqual(
    modelMetadataAfterPriceEdit({ contextWindow: 1000, pricing: { inputUsdPerMillionTokens: 2 } }, "inputUsdPerMillionTokens", ""),
    { contextWindow: 1000 }
  );
});

test("setting the 5m cache-write price drops the legacy cache-write price", () => {
  assert.deepEqual(
    modelMetadataAfterPriceEdit({ pricing: { cacheWriteUsdPerMillionTokens: 3 } }, "cacheWrite5mUsdPerMillionTokens", "4"),
    { pricing: { cacheWrite5mUsdPerMillionTokens: 4 } }
  );
});

const catalogDefaults = { inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15 };
const inputTag = (html: string, placeholder: string) => html.match(new RegExp(`<input[^>]*placeholder="${placeholder}"[^>]*>`))?.[0] ?? "";

test("a price field with a catalog default and no saved price shows the default only as a placeholder", () => {
  const html = renderToStaticMarkup(<ModelPricingFields defaultPricing={catalogDefaults} onChange={() => undefined} />);
  assert.match(inputTag(html, "3"), /value=""/);
  assert.match(inputTag(html, "15"), /value=""/);
  assert.doesNotMatch(html, /price is ignored/);
});

test("a saved price with only one of input and output warns that the other is required", () => {
  const onlyInput = renderToStaticMarkup(
    <ModelPricingFields defaultPricing={catalogDefaults} onChange={() => undefined} savedPricing={{ inputUsdPerMillionTokens: 2 }} />
  );
  assert.match(onlyInput, /Output price required, or this price is ignored\./);
  const onlyOutput = renderToStaticMarkup(
    <ModelPricingFields onChange={() => undefined} savedPricing={{ cacheReadUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 }} />
  );
  assert.match(onlyOutput, /Input price required, or this price is ignored\./);
  const both = renderToStaticMarkup(
    <ModelPricingFields onChange={() => undefined} savedPricing={{ inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 8 }} />
  );
  assert.doesNotMatch(both, /price is ignored/);
});
