import assert from "node:assert/strict";
import test from "node:test";
import { modelPricingAfterEdit } from "@llmr/ui/pages/home/components/providers.tsx";

test("editing one price field saves that field and none of the catalog's defaults", () => {
  assert.deepEqual(modelPricingAfterEdit(undefined, "cacheReadUsdPerMillionTokens", "0.5"), {
    cacheReadUsdPerMillionTokens: 0.5
  });
});

test("a price edit keeps the provider's own saved prices", () => {
  const saved = { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 8 };
  assert.deepEqual(modelPricingAfterEdit(saved, "outputUsdPerMillionTokens", "0"), {
    inputUsdPerMillionTokens: 2,
    outputUsdPerMillionTokens: 0
  });
  assert.deepEqual(modelPricingAfterEdit(saved, "inputUsdPerMillionTokens", ""), { outputUsdPerMillionTokens: 8 });
  assert.equal(modelPricingAfterEdit({ inputUsdPerMillionTokens: 2 }, "inputUsdPerMillionTokens", ""), undefined);
});

test("setting the 5m cache-write price drops the legacy cache-write price", () => {
  assert.deepEqual(
    modelPricingAfterEdit({ cacheWriteUsdPerMillionTokens: 3 }, "cacheWrite5mUsdPerMillionTokens", "4"),
    { cacheWrite5mUsdPerMillionTokens: 4 }
  );
});
