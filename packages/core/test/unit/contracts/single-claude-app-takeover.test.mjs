import assert from "node:assert/strict";
import test from "node:test";
import { enforceSingleEnabledGlobalProfilePerAgent } from "@llmr/core/contracts/app.ts";

function claudeCodeProfile(overrides) {
  return { agent: "claude-code", enabled: true, model: "test-model", name: "claude-code", scope: "llmr", ...overrides };
}

test("enforceSingleEnabledGlobalProfilePerAgent keeps the Claude App takeover on one profile", () => {
  const a = claudeCodeProfile({ claudeAppTakeover: true, id: "a" });
  const b = claudeCodeProfile({ claudeAppTakeover: true, id: "b" });
  assert.deepEqual(enforceSingleEnabledGlobalProfilePerAgent([a, b]).map((p) => p.claudeAppTakeover), [true, undefined]);
  assert.deepEqual(enforceSingleEnabledGlobalProfilePerAgent([a, b], 1).map((p) => p.claudeAppTakeover), [undefined, true]);
  const disabled = claudeCodeProfile({ claudeAppTakeover: true, enabled: false, id: "c" });
  assert.deepEqual(enforceSingleEnabledGlobalProfilePerAgent([disabled, b]).map((p) => p.claudeAppTakeover), [true, true]);
  const cli = claudeCodeProfile({ claudeAppTakeover: true, id: "cli", surface: "cli" });
  const app = claudeCodeProfile({ claudeAppTakeover: true, id: "app", surface: "app" });
  assert.deepEqual(enforceSingleEnabledGlobalProfilePerAgent([cli, app]).map((p) => p.claudeAppTakeover), [true, true]);
});
