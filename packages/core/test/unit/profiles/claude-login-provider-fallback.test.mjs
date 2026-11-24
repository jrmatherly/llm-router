import assert from "node:assert/strict";
import test from "node:test";
import { defaultClientModel } from "@llmr/core/profiles/apply-support.ts";

const config = {
  Providers: [
    { api_base_url: "https://example.test", api_key: "llmr-local-agent-login", models: ["claude-sonnet-5"], name: "Claude Code API", type: "anthropic_messages" },
    { api_base_url: "https://example.test/other", api_key: "sk-other-key-0001", models: ["model"], name: "Other", type: "anthropic_messages" }
  ],
  preferredProvider: "Claude Code API",
  providerPlugins: [
    { key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" },
    { key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" }
  ]
};

test("an empty model does not fall back to the pass-through provider", () => {
  assert.equal(defaultClientModel(config), "Other/model");
  assert.equal(defaultClientModel({ ...config, Providers: [config.Providers[0]] }), "gpt-5-codex");
  assert.equal(defaultClientModel({ ...config, providerPlugins: [] }), "Claude Code API/claude-sonnet-5");
});
