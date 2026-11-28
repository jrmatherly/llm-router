import assert from "node:assert/strict";
import test from "node:test";
import { costBasisFor } from "@llmr/core/contracts/app.ts";
import { priceSourceLabel } from "@llmr/ui/pages/home/shared/usage.ts";

test("a cost the request's own provider lists at zero reads as that list price", () => {
  const basis = costBasisFor({ billableTokens: 11, costSource: "listed-free", costUsd: 0 });
  assert.equal(basis, "listed");
  assert.equal(priceSourceLabel("listed-free", basis), "Listed at no charge");
});
