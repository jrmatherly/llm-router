import assert from "node:assert/strict";
import test from "node:test";
import { maskApiKey } from "@llmr/ui/pages/home/shared/api-keys.ts";

test("maskApiKey never shows most of a short key", () => {
  assert.equal(maskApiKey("abcdefghi"), "****");
  assert.equal(maskApiKey("abcdefghijkl"), "****");
  assert.equal(maskApiKey("abcdefghijklmnop"), "abcd***");
  assert.equal(maskApiKey(`sk-${"x".repeat(32)}`), "sk-xxxxx***");
});
