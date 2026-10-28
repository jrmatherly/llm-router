import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import {
  isManagedKiloConfigContent,
  resolveKiloConfigFile,
  writeKiloGatewayConfig
} from "@llmr/core/agents/kilo/profile-config.ts";

function testConfig(root) {
  const config = createDefaultAppConfig();
  config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model-a", "model-b"], name: "Provider" }];
  config.preferredProvider = "Provider";
  config.gateway.host = "127.0.0.1";
  config.gateway.port = 4567;
  return config;
}

function testProfile(overrides = {}) {
  return {
    agent: "kilo",
    enabled: true,
    env: {},
    id: "kilo-main",
    model: "Provider,model-a",
    name: "Kilo Main",
    providerId: "llm-router",
    providerName: "LLM Router",
    scope: "llmr",
    surface: "cli",
    ...overrides
  };
}

test("Kilo profile config routes primary and small models through LLMR", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-kilo-profile-"));
  try {
    const profile = testProfile();
    const result = writeKiloGatewayConfig(root, testConfig(root), profile, "llmr-profile-key");
    const config = JSON.parse(readFileSync(result.file, "utf8"));

    assert.equal(result.file, path.join(root, "profiles", "kilo-main", "kilo", "kilo.jsonc"));
    assert.equal(config.$schema, "https://app.kilo.ai/config.json");
    assert.equal(config.model, "llm-router/Provider/model-a");
    assert.equal(config.small_model, config.model);
    assert.equal(config.provider["llm-router"].npm, "@ai-sdk/openai-compatible");
    assert.equal(config.provider["llm-router"].options.baseURL, "http://127.0.0.1:4567/v1");
    assert.equal(config.provider["llm-router"].options.apiKey, "llmr-profile-key");
    assert.equal(config.provider["llm-router"].options.headers["x-llmr-client"], "kilo");
    assert.ok(config.provider["llm-router"].models["Provider/model-a"]);
    assert.equal(JSON.parse(result.inlineConfig).model, config.model);
    assert.equal(isManagedKiloConfigContent(readFileSync(result.file, "utf8"), "llm-router"), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Kilo global config keeps user settings and snapshots the original JSONC", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-kilo-global-"));
  try {
    const configFile = path.join(root, "kilo.jsonc");
    const original = `{
      // Keep this user preference in the managed config.
      "autoupdate": false,
      "provider": { "existing": { "name": "Existing" } }
    }\n`;
    writeFileSync(configFile, original);
    if (process.platform !== "win32") {
      chmodSync(configFile, 0o644);
    }
    const profile = testProfile({ configFile, scope: "global" });
    const result = writeKiloGatewayConfig(root, testConfig(root), profile, "llmr-profile-key");
    const managed = JSON.parse(readFileSync(configFile, "utf8"));

    assert.equal(resolveKiloConfigFile(root, profile), configFile);
    assert.equal(managed.autoupdate, false);
    assert.equal(managed.provider.existing.name, "Existing");
    assert.equal(readFileSync(`${configFile}.llmr-original`, "utf8"), original);
    assert.ok(result.backupFile && existsSync(result.backupFile));
    if (process.platform !== "win32") {
      chmodSync(configFile, 0o644);
      chmodSync(`${configFile}.llmr-original`, 0o644);
      chmodSync(result.backupFile, 0o644);
      const unchanged = writeKiloGatewayConfig(root, testConfig(root), profile, "llmr-profile-key");
      assert.equal(unchanged.changed, false);
      assert.equal(statSync(configFile).mode & 0o777, 0o600);
      assert.equal(statSync(`${configFile}.llmr-original`).mode & 0o777, 0o600);
      assert.equal(statSync(result.backupFile).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
