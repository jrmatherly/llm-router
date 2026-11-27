import assert from "node:assert/strict";
import test from "node:test";
import { extractUsageFromBody } from "@llmr/core/usage/response-usage.ts";

test("a JSON body gives its token counts, its model and its reasoning tokens", () => {
  const usage = extractUsageFromBody(JSON.stringify({
    model: "m",
    usage: { completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 2 }, prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 4 } }
  }));
  assert.equal(usage.inputTokens, 10);
  assert.equal(usage.outputTokens, 5);
  assert.equal(usage.cacheReadTokens, 4);
  assert.equal(usage.reasoningTokens, 2);
  assert.equal(usage.inputIncludesCacheTokens, true);
  assert.equal(usage.model, "m");
});

test("a stream takes each count from the last chunk that states it", () => {
  const stream = [
    `data: ${JSON.stringify({ message: { model: "m", usage: { cache_read_input_tokens: 3, input_tokens: 7 } }, type: "message_start" })}`,
    `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 9 } })}`,
    "data: [DONE]"
  ].join("\n");
  const usage = extractUsageFromBody(stream);
  assert.equal(usage.inputTokens, 7);
  assert.equal(usage.cacheReadTokens, 3);
  assert.equal(usage.outputTokens, 9);
  assert.equal(usage.inputIncludesCacheTokens, false);
});

test("a body with no usage gives nothing", () => {
  assert.equal(extractUsageFromBody("{}"), undefined);
  assert.equal(extractUsageFromBody(""), undefined);
});
