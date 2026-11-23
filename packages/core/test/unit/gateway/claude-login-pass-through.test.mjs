import assert from "node:assert/strict";
import test from "node:test";
import { claudeLoginPassThroughTarget, claudeLoginProviderNames } from "@llmr/core/gateway/features/claude-login-pass-through.ts";

const apiKey = { createdAt: new Date(0).toISOString(), id: "profile:p1", key: "sk-profile-key-0001" };

function passThroughConfig() {
  return {
    Providers: [
      { api_base_url: "https://example.test", api_key: "llmr-local-agent-login", models: ["claude-sonnet-5"], name: "Claude Code API", type: "anthropic_messages" },
      { api_base_url: "https://example.test/other", api_key: "sk-other-key-0001", models: ["model"], name: "Other", type: "anthropic_messages" }
    ],
    profile: {
      enabled: true,
      profiles: [{ agent: "claude-code", enabled: true, env: { LLMR_CLAUDE_CODE_AUTH_MODE: "claude-login" }, id: "p1", model: "", name: "p1", scope: "global" }]
    },
    providerPlugins: [
      { key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" },
      { key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" }
    ]
  };
}

function target(overrides = {}, config = passThroughConfig()) {
  return claudeLoginPassThroughTarget({
    apiKey,
    config,
    headers: { authorization: "Bearer sk-ant-oat01-FAKE", "x-llmr-api-key": "sk-profile-key-0001" },
    method: "POST",
    model: "claude-opus-4-8",
    path: "/v1/messages",
    ...overrides
  });
}

function configWithProfile(change) {
  const config = passThroughConfig();
  change(config.profile.profiles[0]);
  return config;
}

test("a bare model id outside the provider's list goes to the pass-through provider", () => {
  assert.equal(target(), "Claude Code API/claude-opus-4-8");
});

test("a model id prefixed with the pass-through provider is returned as it is", () => {
  assert.equal(target({ model: "Claude Code API/claude-sonnet-5" }), "Claude Code API/claude-sonnet-5");
});

test("a model pinned to another provider is not pass-through traffic", () => {
  assert.equal(target({ model: "Other/model" }), undefined);
});

test("a gateway key sent in authorization is not pass-through traffic", () => {
  assert.equal(target({ headers: { authorization: "Bearer sk-profile-key-0001" } }), undefined);
});

test("an authorization value without Bearer is not carried", () => {
  assert.equal(target({ headers: { authorization: "sk-ant-api-key", "x-llmr-api-key": "sk-profile-key-0001" } }), undefined);
});

test("only an enabled Claude Code profile in Claude login mode qualifies", () => {
  assert.equal(target({}, configWithProfile((profile) => { profile.env = { LLMR_CLAUDE_CODE_AUTH_MODE: "api-key-helper" }; })), undefined, "helper mode");
  assert.equal(target({}, configWithProfile((profile) => { profile.agent = "codex"; })), undefined, "a Codex profile");
  assert.equal(target({}, configWithProfile((profile) => { profile.enabled = false; })), undefined, "a disabled profile");
  assert.equal(target({ apiKey: { ...apiKey, id: "profile:none" } }), undefined, "a key with no profile");
  assert.equal(target({ apiKey: undefined }), undefined, "no key");
});

test("a disabled pass-through provider carries nothing", () => {
  const config = passThroughConfig();
  config.Providers[0].enabled = false;
  assert.deepEqual(claudeLoginProviderNames(config), []);
  assert.equal(target({}, config), undefined);
});

test("only POST /v1/messages is pass-through traffic", () => {
  assert.equal(target({ path: "/v1/messages/count_tokens" }), undefined);
  assert.equal(target({ method: "GET" }), undefined);
  assert.equal(target({ path: "/v1/messages?beta=true" }), "Claude Code API/claude-opus-4-8");
});

test("a request with no model is not pass-through traffic", () => {
  assert.equal(target({ model: undefined }), undefined);
});
