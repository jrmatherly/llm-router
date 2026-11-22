import assert from "node:assert/strict";
import test from "node:test";
import { requestLogRequestedModel } from "@llmr/core/observability/request-log-model.ts";

test("a long model reaches routing whole, from the body and from a Gemini-style path", () => {
  const model = "m".repeat(500);
  assert.equal(requestLogRequestedModel(JSON.stringify({ model }), "/v1/messages"), model);
  assert.equal(requestLogRequestedModel("", `/v1beta/models/${model}:generateContent`), model);
});
