import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config";
import { onboardingProfileIndex, withOnboardingProfile } from "@llmr/ui/pages/home/shared/onboarding-profile";
import { isOnboardingProfileReady } from "@llmr/ui/pages/home/shared/options";

test("onboarding enables the chosen agent's default profile and leaves the other off", () => {
  const profiles = createDefaultAppConfig().profile.profiles;
  const index = onboardingProfileIndex(profiles, "claude-code");
  const next = withOnboardingProfile(profiles, index, { ...profiles[index], model: "p/m" });
  assert.equal(next.find((profile) => profile.agent === "claude-code")?.enabled, true);
  assert.equal(next.find((profile) => profile.agent === "claude-code")?.model, "p/m");
  assert.equal(next.find((profile) => profile.agent === "codex")?.enabled, false);
  assert.equal(next.length, profiles.length);
});

test("onboarding edits an enabled profile of the chosen agent before the disabled default", () => {
  const profiles = createDefaultAppConfig().profile.profiles;
  const own = { ...profiles[0], enabled: true, id: "own-claude-code", scope: "llmr" as const };
  assert.equal(onboardingProfileIndex([...profiles, own], "claude-code"), profiles.length);
});

test("onboarding appends a profile for an agent that has no default", () => {
  const profiles = createDefaultAppConfig().profile.profiles;
  assert.equal(onboardingProfileIndex(profiles, "pi"), -1);
  const next = withOnboardingProfile(profiles, -1, { ...profiles[0], agent: "pi", enabled: false, id: "pi" });
  assert.equal(next.length, profiles.length + 1);
  assert.equal(next.at(-1)?.enabled, true);
  assert.deepEqual(next.slice(0, profiles.length), profiles);
});

test("a skipped agent step counts as ready, and an unconfigured one does not", () => {
  const config = createDefaultAppConfig();
  assert.equal(isOnboardingProfileReady(config), false);
  assert.equal(isOnboardingProfileReady(config, { profileSkipped: true }), true);
  assert.equal(isOnboardingProfileReady(config, { profileSkipped: true, requireProfileConfirmation: true }), true);
});
