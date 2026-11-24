import assert from "node:assert/strict";
import test from "node:test";
import { updatePersistedApiKeys } from "@llmr/core/config/config-repository.ts";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { gatewayService } from "@llmr/core/gateway/service.ts";
import { openProfileFromLlmr } from "@llmr/core/profiles/launch-service.ts";

test("opening a Claude App profile starts the gateway with every stored key", async (t) => {
  const config = createDefaultAppConfig();
  config.APIKEY = "primary-token";
  config.APIKEYS = [
    { createdAt: "2026-01-01T00:00:00.000Z", id: "primary", key: "primary-token" },
    { createdAt: "2026-01-01T00:00:00.000Z", id: "profile:claude-app", key: "profile-token", name: "Profile: Claude App" }
  ];
  config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model"], name: "Provider" }];
  config.gateway.host = "127.0.0.1";
  config.gateway.port = 3466;
  config.profile.enabled = true;
  config.profile.profiles = [{ agent: "claude-code", enabled: true, env: {}, id: "claude-app", model: "Provider/model", name: "Claude App", scope: "llmr", surface: "app" }];
  await updatePersistedApiKeys(() => config.APIKEYS);
  // A failed start makes the open throw before it launches the app.
  const start = t.mock.method(gatewayService, "start", async () => ({ lastError: "stop before launch", state: "error" }));

  await assert.rejects(openProfileFromLlmr(config, { profileId: "claude-app", surface: "app" }), /stop before launch/);

  assert.equal(start.mock.callCount(), 1);
  assert.deepEqual(start.mock.calls[0].arguments[0].APIKEYS.map((apiKey) => apiKey.id), ["primary", "profile:claude-app"]);
});
