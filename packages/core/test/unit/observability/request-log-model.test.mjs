import assert from "node:assert/strict";
import test from "node:test";
import { requestLogRequestedModel } from "@llmr/core/observability/request-log-model.ts";

test("a long model in a Gemini-style path is cut to 200 characters", () => {
  const model = "m".repeat(500);
  const requested = requestLogRequestedModel("", `/v1beta/models/${model}:generateContent`);
  assert.equal(requested, model.slice(0, 200));
});
