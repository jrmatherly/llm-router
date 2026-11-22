import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { gatewayProcessEnvForTest } from "@llmr/core/gateway/core-runtime/supervisor.ts";
import { withEnv } from "../../support/with-env.mjs";

test("the gateway child gets a manager key of its own and no inherited key names", (t) => {
  withEnv(t, {
    AUTH_STATIC_API_KEY: "sk-env-key-0003",
    AUTH_STATIC_API_KEYS: "sk-env-key-0004",
    MANAGER_API_KEY: "abc",
    Manager_Api_Key: "abc"
  });
  const first = gatewayProcessEnvForTest(createDefaultAppConfig(), "core-token");
  const second = gatewayProcessEnvForTest(createDefaultAppConfig(), "core-token");
  assert.notEqual(first.MANAGER_API_KEY, "abc");
  assert.ok(first.MANAGER_API_KEY.length >= 32);
  assert.notEqual(first.MANAGER_API_KEY, second.MANAGER_API_KEY);
  assert.equal("AUTH_STATIC_API_KEY" in first, false);
  assert.equal("Manager_Api_Key" in first, false);
  assert.equal("AUTH_STATIC_API_KEYS" in first, false);
  assert.equal(typeof first.AUTH_STATIC_API_KEY_HEADER, "string");
  assert.equal(first.AUTH_STATIC_API_KEY_ENV in first, true);
});

test("the gateway child registers no manager or agent routes, whatever the shell says", (t) => {
  withEnv(t, { GATEWAY_MANAGEMENT_ROUTES_ENABLED: "true", Gateway_Management_Routes_Enabled: "true" });
  const env = gatewayProcessEnvForTest(createDefaultAppConfig(), "core-token");
  assert.equal(env.GATEWAY_MANAGEMENT_ROUTES_ENABLED, "false");
  assert.equal("Gateway_Management_Routes_Enabled" in env, false);
});

test("the gateway child sends CORS headers only to LLMR's own origin", (t) => {
  const names = [
    "CORS_ORIGIN",
    "GATEWAY_CORS_ALLOWED_HEADERS",
    "GATEWAY_CORS_ALLOWED_METHODS",
    "GATEWAY_CORS_ALLOW_CREDENTIALS",
    "GATEWAY_CORS_ENABLED",
    "GATEWAY_CORS_MAX_AGE_SECONDS",
    "GATEWAY_CORS_ORIGIN",
    "GATEWAY_CORS_ORIGINS"
  ];
  withEnv(t, Object.fromEntries(names.map((name) => [name, "*"])));
  const config = createDefaultAppConfig();
  config.gateway.host = "127.0.0.1";
  config.gateway.port = 3456;
  const env = gatewayProcessEnvForTest(config, "core-token");
  assert.equal(env.GATEWAY_CORS_ORIGIN, "http://127.0.0.1:3456");
  assert.deepEqual(names.filter((name) => name !== "GATEWAY_CORS_ORIGIN" && name in env), []);
});
