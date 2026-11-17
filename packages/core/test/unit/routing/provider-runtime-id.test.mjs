import assert from "node:assert/strict";
import test from "node:test";
import { parseProvidersForTest } from "@llmr/core/config/config.ts";
import { providerCapabilityNameMatches } from "@llmr/core/providers/runtime-topology.ts";
import { providerRuntimeId } from "@llmr/core/routing/model-registry.ts";

test("#1920 provider ids the core reads as protocol selectors get a provider- prefix", () => {
  for (const id of ["openai", "anthropic", "claude", "gemini", "google", "OpenAI"]) {
    assert.equal(providerRuntimeId({ id, name: "Any" }), `provider-${id.toLowerCase()}`);
  }
  assert.equal(providerRuntimeId({ id: "openai-eu", name: "Any" }), "openai-eu");
});

test("#1920 two providers never share a runtime id", () => {
  const providers = parseProvidersForTest([
    { id: "openai", name: "First", api_base_url: "https://one.example/v1", api_key: "k", models: ["m"] },
    { id: "provider-openai", name: "Second", api_base_url: "https://two.example/v1", api_key: "k", models: ["m"] }
  ]);

  assert.equal(new Set(providers.map(providerRuntimeId)).size, 2);
  assert.equal(providers[0].id, "openai");
});

test("#1920 a plugin named with the configured provider id still matches its provider", () => {
  const provider = { id: "openai", name: "Renamed" };

  assert.ok(providerCapabilityNameMatches(provider, "openai_chat_completions", "openai::openai_chat_completions"));
  assert.ok(providerCapabilityNameMatches(provider, "openai_chat_completions", "provider-openai::openai_chat_completions"));
  assert.ok(!providerCapabilityNameMatches(provider, "openai_chat_completions", "other::openai_chat_completions"));
});
