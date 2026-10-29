import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

test("claudeAppTakeover survives a save and reload of the config", async () => {
  const testRoot = path.join(
    process.env.LLMR_INTERNAL_HOME_DIR,
    `profile-claude-app-takeover-${process.pid}`
  );
  process.env.LLMR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const { createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts");
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");

  const config = createDefaultAppConfig();
  config.profile.profiles = [
    { agent: "claude-code", claudeAppTakeover: true, enabled: true, id: "takeover", model: "claude-sonnet-4-5", name: "Takeover", surface: "app" },
    { agent: "claude-code", enabled: true, id: "plain", model: "claude-sonnet-4-5", name: "Plain", scope: "llmr", surface: "app" }
  ];
  await saveAppConfig(config);

  const loaded = await loadAppConfig();
  const takeover = loaded.profile.profiles.find((profile) => profile.id === "takeover");
  const plain = loaded.profile.profiles.find((profile) => profile.id === "plain");
  assert.equal(takeover.claudeAppTakeover, true);
  assert.equal("claudeAppTakeover" in plain, false);
});
