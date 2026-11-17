import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { prepareGatewayUpstreamAttemptForTest } from "@llmr/core/gateway/upstream/executor.ts";

function chainFor(model, routedModel = model) {
  const config = createDefaultAppConfig();
  config.Providers = ["pool-a", "pool-b"].map((id) => ({
    credentials: [{ apiKey: "one-key", id: "one" }, { apiKey: "two-key", id: "two" }],
    id,
    models: ["m"],
    name: id,
    type: "openai_chat_completions"
  }));
  return prepareGatewayUpstreamAttemptForTest({
    body: { messages: [], model },
    config,
    headers: { "x-llmr-routed-model": routedModel },
    method: "POST",
    path: "/v1/chat/completions",
    routedModel: model
  }).credentialChain;
}

const credential = (pool, id) => `${pool}::openai_chat_completions::cred:${id}`;

test("#1923 a request without a pin gets the whole pool as its chain", () => {
  assert.deepEqual(chainFor("pool-a/m"), [credential("pool-a", "one"), credential("pool-a", "two")]);
});

test("#1923 a pinned credential is the whole chain", () => {
  assert.deepEqual(chainFor(`${credential("pool-a", "two")}/m`), [credential("pool-a", "two")]);
});

test("#1923 a pin that names no credential of the pool gets no chain, so no key is charged for it", () => {
  assert.equal(chainFor(`${credential("pool-a", "missing")}/m`), undefined);
});

test("#1923 a pin on one provider does not pin the same-named credential of a fallback provider", () => {
  assert.deepEqual(
    chainFor("pool-b/m", `${credential("pool-a", "two")}/m`),
    [credential("pool-b", "one"), credential("pool-b", "two")]
  );
});
