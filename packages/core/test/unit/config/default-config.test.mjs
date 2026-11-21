import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@llmr/core/config/default-config.ts";

test("the default config takes over no agent", () => {
  const config = createDefaultAppConfig();
  assert.equal(config.profile.profiles.every((profile) => !profile.enabled), true);
  assert.equal(config.profile.enabled, false);
  assert.equal(config.profile.claudeCode.enabled, false);
  assert.equal(config.profile.codex.enabled, false);
});
