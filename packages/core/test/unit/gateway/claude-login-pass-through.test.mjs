import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyClaudeAppGatewayConfig } from "@llmr/core/agents/claude-app/gateway-service.ts";
import { buildClaudeAppGatewayModelRoutes, resolveClaudeAppGatewayRouteModel } from "@llmr/core/agents/claude-app/gateway-routes.ts";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { NO_AVAILABLE_GATEWAY_MODELS_MESSAGE } from "@llmr/core/contracts/app.ts";
import { compileCoreGatewayConfig } from "@llmr/core/gateway/core-runtime/config-compiler.ts";
import { claudeLoginCarriedValue, claudeLoginPassThroughTarget, claudeLoginProviderNames, claudeLoginRoutedProvider, withoutClaudeLoginProviders } from "@llmr/core/gateway/features/claude-login-pass-through.ts";
import { createGatewayModelsResponse } from "@llmr/core/gateway/features/model-discovery.ts";
import { sanitizeHeaderValue } from "@llmr/core/providers/runtime-topology.ts";

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

test("a request without a login is still routed to the pass-through provider, with a value the hook refuses", () => {
  const key = { "x-llmr-api-key": "sk-profile-key-0001" };
  assert.equal(target({ headers: key }), "Claude Code API/claude-opus-4-8");
  assert.equal(claudeLoginCarriedValue(key), "none");
  assert.equal(claudeLoginCarriedValue({ ...key, authorization: "sk-ant-api-key" }), "none");
  assert.equal(claudeLoginCarriedValue({ ...key, authorization: "Bearer sk-ant-oat01-FAKE" }) === "Bearer sk-ant-oat01-FAKE", true);
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

test("a model id with the [1m] suffix goes to the pass-through provider as sent", () => {
  assert.equal(target({ model: "claude-opus-4-8[1m]" }), "Claude Code API/claude-opus-4-8[1m]");
});

test("the internal plugin entry alone still finds the pass-through provider", () => {
  const config = passThroughConfig();
  config.Providers[0].id = "claude-code-api";
  config.providerPlugins = config.providerPlugins.filter((plugin) => plugin.key.endsWith("-internal"));
  assert.deepEqual(claudeLoginProviderNames(config), ["Claude Code API"]);
  assert.equal(target({}, config), "Claude Code API/claude-opus-4-8");
});

test("a provider whose name has a non-ASCII character is found from its sanitized routed id", () => {
  const config = passThroughConfig();
  config.Providers[0].name = "Claude Côde API";
  config.providerPlugins = [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Côde API" }];
  const routed = sanitizeHeaderValue("Claude Côde API/claude-opus-4-8");
  assert.notEqual(routed, "Claude Côde API/claude-opus-4-8");
  const found = claudeLoginRoutedProvider(config, { "x-llmr-caller-authorization": "none" }, routed);
  assert.equal(found?.provider.name, "Claude Côde API");
  assert.equal(found?.model, "claude-opus-4-8");
});

function listedIds(config, headers, key) {
  return createGatewayModelsResponse(config, headers, key).data.map((model) => model.id);
}

function withoutPassThroughProvider(config) {
  return { ...config, Providers: config.Providers.filter((provider) => provider.name !== "Claude Code API") };
}

const listCallers = [
  ["a Claude Code user agent", { "user-agent": "claude-cli/2.1.215" }, undefined],
  ["a plain caller", { "user-agent": "curl/8" }, undefined],
  ["a Claude Desktop key", { "user-agent": "claude-app/1.0" }, { name: "Claude App" }]
];

for (const [caller, headers, key] of listCallers) {
  test(`GET /v1/models leaves the pass-through provider out for ${caller}`, () => {
    const ids = listedIds(passThroughConfig(), headers, key);
    assert.ok(ids.length > 0, "Other's models are listed");
    assert.deepEqual(ids, listedIds(withoutPassThroughProvider(passThroughConfig()), headers, key));
    assert.deepEqual(ids.filter((id) => id.startsWith("Claude Code API/") || id.includes("claude-sonnet-5")), []);
  });
}

test("withoutClaudeLoginProviders leaves a config without the pass-through provider as it is", () => {
  const config = withoutPassThroughProvider(passThroughConfig());
  config.providerPlugins = [];
  assert.deepEqual(withoutClaudeLoginProviders(config), config);
  assert.deepEqual(withoutClaudeLoginProviders(passThroughConfig()).Providers.map((provider) => provider.name), ["Other"]);
});

test("a pass-through model id still routes to the pass-through provider", () => {
  const config = passThroughConfig();
  const route = buildClaudeAppGatewayModelRoutes(config).find((item) => item.targetModel === "Claude Code API/claude-sonnet-5");
  assert.ok(route, "the pass-through model has a route");
  assert.equal(resolveClaudeAppGatewayRouteModel(route.id, config), "Claude Code API/claude-sonnet-5");
});

function desktopConfig(providers) {
  const config = passThroughConfig();
  return { ...config, APIKEY: "sk-desktop-key-0001", APIKEYS: [], HOST: "127.0.0.1", PORT: 3456, Providers: config.Providers.filter((provider) => providers.includes(provider.name)), gateway: { enabled: false, host: "127.0.0.1", port: 3456 }, virtualModelProfiles: [] };
}

test("Claude Desktop's model list leaves the pass-through provider out", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-login-desktop-"));
  try {
    const config = desktopConfig(["Claude Code API", "Other"]);
    const { result } = applyClaudeAppGatewayConfig(config, { backup: false, dataDir });
    const names = JSON.parse(readFileSync(result.configLibraryFile, "utf8")).inferenceModels.map((model) => model.name);
    assert.deepEqual(names.map((name) => resolveClaudeAppGatewayRouteModel(name, config)), ["Other/model"]);
  } finally {
    rmSync(dataDir, { force: true, recursive: true });
    rmSync(`${dataDir}-3p`, { force: true, recursive: true });
  }
});

test("Claude Desktop gets the no-models message when the pass-through provider is the only one", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "llmr-claude-login-desktop-"));
  try {
    assert.throws(() => applyClaudeAppGatewayConfig(desktopConfig(["Claude Code API"]), { backup: false, dataDir }), { message: NO_AVAILABLE_GATEWAY_MODELS_MESSAGE });
  } finally {
    rmSync(dataDir, { force: true, recursive: true });
    rmSync(`${dataDir}-3p`, { force: true, recursive: true });
  }
});

test("the compiled gateway config marks only the pass-through provider's entries for credential pass-through", async () => {
  const config = { ...createDefaultAppConfig(), ...passThroughConfig() };
  config.Providers[0].id = "claude-code-api";
  const compiled = await compileCoreGatewayConfig(config, "trace", "billing", "auth");
  const marked = compiled.providers.map((provider) => [provider.baseurl, provider.clientCredentialPassthrough === true]);
  assert.deepEqual(marked, [["https://example.test", true], ["https://example.test/other", false]]);
});
