import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

test("saving profiles synchronizes legacy profile enabled flags", async () => {
  const testRoot = path.join(
    process.env.LLMR_INTERNAL_HOME_DIR,
    `profile-legacy-sync-${process.pid}`
  );
  process.env.LLMR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const { createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts");
  const { loadPersistedAppConfig, replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");

  const config = createDefaultAppConfig();
  config.profile.profiles = config.profile.profiles
    .filter((profile) => profile.agent !== "claude-code")
    .map((profile) => ({ ...profile, enabled: true }));

  const savedWithoutClaude = await saveAppConfig(config);
  assert.equal(savedWithoutClaude.profile.enabled, true);
  assert.equal(savedWithoutClaude.profile.claudeCode.enabled, false);
  assert.equal(savedWithoutClaude.profile.codex.enabled, true);

  const rawWithoutClaude = await loadPersistedAppConfig();
  assert.equal(rawWithoutClaude.profile.claudeCode.enabled, false);
  assert.equal(rawWithoutClaude.profile.codex.enabled, true);

  const topLevelDisabledConfig = createDefaultAppConfig();
  topLevelDisabledConfig.configRevision = savedWithoutClaude.configRevision;
  topLevelDisabledConfig.profile.profiles = topLevelDisabledConfig.profile.profiles.map((profile) => ({ ...profile, enabled: true }));
  const savedTopLevelDisabled = await saveAppConfig(topLevelDisabledConfig);
  assert.equal(savedTopLevelDisabled.profile.enabled, true);
  assert.equal(savedTopLevelDisabled.profile.claudeCode.enabled, true);
  assert.equal(savedTopLevelDisabled.profile.codex.enabled, true);
  assert.equal(savedTopLevelDisabled.profile.profiles.some((profile) => profile.enabled), true);

  const rawTopLevelDisabled = await loadPersistedAppConfig();
  assert.equal(rawTopLevelDisabled.profile.enabled, true);
  assert.equal(rawTopLevelDisabled.profile.claudeCode.enabled, true);
  assert.equal(rawTopLevelDisabled.profile.codex.enabled, true);

  savedWithoutClaude.profile.profiles = [];
  savedWithoutClaude.configRevision = savedTopLevelDisabled.configRevision;
  const savedWithoutProfiles = await saveAppConfig(savedWithoutClaude);
  assert.equal(savedWithoutProfiles.profile.enabled, false);
  assert.equal(savedWithoutProfiles.profile.claudeCode.enabled, false);
  assert.equal(savedWithoutProfiles.profile.codex.enabled, false);

  const rawWithoutProfiles = await loadPersistedAppConfig();
  assert.equal(rawWithoutProfiles.profile.enabled, false);
  assert.equal(rawWithoutProfiles.profile.claudeCode.enabled, false);
  assert.equal(rawWithoutProfiles.profile.codex.enabled, false);

  const staleLegacyConfig = createDefaultAppConfig();
  staleLegacyConfig.profile.enabled = true;
  staleLegacyConfig.profile.claudeCode.enabled = true;
  staleLegacyConfig.profile.codex.enabled = true;
  staleLegacyConfig.profile.profiles = [];
  await replacePersistedAppConfig(staleLegacyConfig);

  const loadedStaleLegacyConfig = await loadAppConfig();
  assert.equal(loadedStaleLegacyConfig.profile.enabled, false);
  assert.equal(loadedStaleLegacyConfig.profile.claudeCode.enabled, false);
  assert.equal(loadedStaleLegacyConfig.profile.codex.enabled, false);
  assert.deepEqual(loadedStaleLegacyConfig.profile.profiles, []);

  const legacyBooleanConfig = createDefaultAppConfig();
  legacyBooleanConfig.profile.claudeCode.managedCompact = true;
  legacyBooleanConfig.profile.codex.managedCompact = true;
  legacyBooleanConfig.profile.codex.showAllSessions = true;
  legacyBooleanConfig.profile.profiles = legacyBooleanConfig.profile.profiles.map((profile) => {
    const profileWithoutOptionalBooleans = { ...profile };
    delete profileWithoutOptionalBooleans.managedCompact;
    delete profileWithoutOptionalBooleans.showAllSessions;
    return profileWithoutOptionalBooleans;
  });
  await replacePersistedAppConfig(legacyBooleanConfig);

  const loadedLegacyBooleanConfig = await loadAppConfig();
  assert.equal(loadedLegacyBooleanConfig.profile.claudeCode.managedCompact, true);
  assert.equal(loadedLegacyBooleanConfig.profile.codex.managedCompact, true);
  assert.equal(loadedLegacyBooleanConfig.profile.codex.showAllSessions, true);

  const stuckConfig = createDefaultAppConfig();
  stuckConfig.profile.profiles = stuckConfig.profile.profiles.map((profile) => ({ ...profile, enabled: true }));
  await replacePersistedAppConfig(stuckConfig);
  const loadedStuckConfig = await loadAppConfig();
  assert.equal(loadedStuckConfig.profile.enabled, true);
  assert.equal(loadedStuckConfig.profile.claudeCode.enabled, true);

  loadedStuckConfig.profile.profiles = loadedStuckConfig.profile.profiles.map((profile) => ({ ...profile, enabled: false }));
  const savedAllOff = await saveAppConfig(loadedStuckConfig);
  assert.equal(savedAllOff.profile.enabled, false);
  assert.equal((await loadPersistedAppConfig()).profile.enabled, false);

  savedAllOff.profile.profiles = savedAllOff.profile.profiles.map((profile) =>
    profile.agent === "claude-code" ? { ...profile, enabled: true } : profile
  );
  const savedOneOn = await saveAppConfig(savedAllOff);
  assert.equal(savedOneOn.profile.enabled, true);
  assert.equal(savedOneOn.profile.claudeCode.enabled, true);
  assert.equal(savedOneOn.profile.codex.enabled, false);

  const rawOneOn = await loadPersistedAppConfig();
  assert.equal(rawOneOn.profile.enabled, true);
  assert.equal(rawOneOn.profile.claudeCode.enabled, true);
});

test("a new install can enable its first profile after an earlier save", async () => {
  const { createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts");
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");

  const fresh = createDefaultAppConfig();
  fresh.configRevision = (await loadAppConfig()).configRevision;
  const saved = await saveAppConfig(fresh);
  assert.equal(saved.profile.enabled, false);
  saved.profile.profiles[0].enabled = true;
  const savedAgain = await saveAppConfig(saved);
  assert.equal(savedAgain.profile.enabled, true);
  assert.equal(savedAgain.profile.claudeCode.enabled, true);
  assert.equal(savedAgain.profile.codex.enabled, false);
});
