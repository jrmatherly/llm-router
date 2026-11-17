import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { createGatewayModelsResponse } from "@llmr/core/gateway/features/model-discovery.ts";

test("#1911 both discovery formats expose the configured context window", () => {
  const config = createDefaultAppConfig();
  config.Providers = [{ id: "local", name: "Local", type: "openai_responses", models: ["custom-model"], modelMetadata: { "custom-model": { contextWindow: 262144 } } }];
  config.profile.enabled = false;
  config.virtualModelProfiles = [];
  for (const agent of ["test-client", "claude-cli/2.1.306 (external, cli)"]) {
    const response = createGatewayModelsResponse(config, { "user-agent": agent });
    assert.ok(response.data.length > 0);
    for (const model of response.data) {
      assert.equal(model.context_window, 262144);
      assert.equal(model.max_context_window, 262144);
      assert.equal(model.max_input_tokens, 262144);
    }
  }
});

test("#1911 an unknown context size is left out of the OpenAI-compatible list", () => {
  const config = createDefaultAppConfig();
  config.Providers = [{ id: "local", name: "Local", type: "openai_responses", models: ["zz-unknown-model"] }];
  config.profile.enabled = false;
  config.virtualModelProfiles = [];
  const openAi = createGatewayModelsResponse(config, { "user-agent": "test-client" });
  assert.ok(openAi.data.length > 0);
  for (const model of openAi.data) {
    assert.equal("context_window" in model, false);
    assert.equal("max_context_window" in model, false);
    assert.equal("max_input_tokens" in model, false);
  }
  const claude = createGatewayModelsResponse(config, { "user-agent": "claude-cli/2.1.306 (external, cli)" });
  assert.ok(claude.data.length > 0);
  for (const model of claude.data) {
    assert.equal(model.context_window, model.max_input_tokens);
    assert.equal(model.max_context_window, model.max_input_tokens);
  }
});
