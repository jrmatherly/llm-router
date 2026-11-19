import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";
import { gatewayModelSelectionMatcher } from "@llmr/core/contracts/app.ts";
import { reconcileProfileModelSelections } from "@llmr/core/profiles/model-selection.ts";

function fixture() {
  const config = createDefaultAppConfig();
  config.Providers = [{ id: "local-engine", models: ["local-model", "openai/vendor-model"], name: "Local", type: "openai_responses" }];
  config.virtualModelProfiles = [];
  config.profile.profiles = [{ agent: "claude-code", availableModels: ["Local/local-model", "Local/local-engine", "Gone/model", "Local/openai/vendor-model"], enabled: true,
    id: "checked", model: "Local/local-model", name: "Checked", scope: "llmr" }];
  return config;
}

test("#1910 save reconciliation removes stale provider/model entries and keeps the restrictive default", () => {
  const config = fixture();
  const result = reconcileProfileModelSelections(config);
  assert.deepEqual(result.profile.profiles[0].availableModels, ["Local/local-model", "Local/openai/vendor-model"]);
  assert.equal(config.profile.profiles[0].availableModels.length, 4, "reconciliation does not mutate its input");
});

test("#1910 an invalid default names its provider and never becomes allow-all", () => {
  const config = fixture();
  config.profile.profiles[0].model = "Local/local-engine";
  assert.throws(() => reconcileProfileModelSelections(config), /Profile "Checked".*Provider "Local".*local-engine.*Its models: local-model, openai\/vendor-model/);
  config.profile.profiles[0].model = "";
  config.profile.profiles[0].availableModels = ["Gone/model"];
  assert.throws(() => reconcileProfileModelSelections(config), /Choose at least one configured model/);
});

test("#1910 a served default is listed only when no other served entry is left", () => {
  const config = fixture();
  config.profile.profiles[0].availableModels = ["Gone/model", "Gone/other"];
  assert.deepEqual(reconcileProfileModelSelections(config).profile.profiles[0].availableModels, ["Local/local-model"]);
  config.profile.profiles[0].availableModels = ["Gone/model", "Local/openai/vendor-model"];
  assert.deepEqual(reconcileProfileModelSelections(config).profile.profiles[0].availableModels, ["Local/openai/vendor-model"]);
});

test("#1910 a bare model served by more than one provider stays valid", () => {
  const config = fixture();
  config.Providers.push({ id: "second", models: ["local-model"], name: "Second", type: "anthropic_messages" });
  config.profile.profiles[0].model = "local-model";
  config.profile.profiles[0].availableModels = ["local-model", "Gone/model"];
  assert.deepEqual(reconcileProfileModelSelections(config).profile.profiles[0].availableModels, ["local-model"]);
});

test("selections written differently from the picker's value are kept on save and in the picker check", () => {
  const config = fixture();
  config.Providers[0].provider = "local-preset";
  config.virtualModelProfiles = [{ displayName: "Smart", enabled: true, execution: {}, id: "smart", key: "smart", match: { exactAliases: ["smart"], prefixes: [], suffixes: [] }, materialization: { enabled: true, includeInGatewayModels: true }, tools: [] }];
  const variants = ["local/LOCAL-MODEL", "Local,local-model", "local-model", "local-engine/local-model", "local-preset/local-model", "Fusion/smart", "fusion/SMART"];
  config.profile.profiles[0].availableModels = variants;
  assert.deepEqual(reconcileProfileModelSelections(config).profile.profiles[0].availableModels, variants, "nothing is dropped or added");
  for (const variant of variants) assert.equal(gatewayModelSelectionMatcher(config)(variant), true, variant);
  for (const stale of ["Gone/model", "Local/local-engine", "Fusion/other", "smart"]) assert.equal(gatewayModelSelectionMatcher(config)(stale), false, stale);
});

test("removing the provider behind an enabled profile's default blocks the save with a fix, and turning the profile off saves without widening it", () => {
  const config = fixture();
  config.Providers.push({ id: "other", models: ["x"], name: "Other", type: "openai_responses" });
  config.Providers = config.Providers.filter((provider) => provider.name !== "Local");
  assert.throws(() => reconcileProfileModelSelections(config), /Profile "Checked": Model "Local\/local-model" is not served by an enabled provider or virtual model\. Choose a configured default model for this profile, or turn the profile off, then save again\./);
  config.Providers.push({ enabled: false, id: "local-engine", models: ["local-model"], name: "Local", type: "openai_responses" });
  assert.throws(() => reconcileProfileModelSelections(config), /not served by an enabled provider/, "a disabled provider blocks the same way");
  config.profile.profiles[0].enabled = false;
  const saved = reconcileProfileModelSelections(config).profile.profiles[0];
  assert.deepEqual(saved.availableModels, config.profile.profiles[0].availableModels, "an empty list would allow every model once the profile is turned back on");
});

test("#1910 settings persistence reconciles the saved profile allowlist", async () => {
  const root = path.join(process.env.LLMR_INTERNAL_HOME_DIR, `profile-model-selection-${process.pid}`);
  process.env.LLMR_INTERNAL_HOME_DIR = path.join(root, "home");
  process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
  process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");
  const saved = await saveAppConfig(fixture());
  assert.deepEqual(saved.profile.profiles[0].availableModels, ["Local/local-model", "Local/openai/vendor-model"]);
  assert.deepEqual((await loadAppConfig()).profile.profiles[0].availableModels, saved.profile.profiles[0].availableModels);
});
