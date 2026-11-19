import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CONFIGDIR } from "@llmr/core/config/constants.ts";
import { claudeAppBotWorkerEnv } from "@llmr/core/profiles/launch-service.ts";

test("the Claude App bot worker on the default ~/.claude drops CLAUDE_CONFIG_DIR, even an inherited one", (t) => {
  const previous = process.env.CLAUDE_CONFIG_DIR;
  t.after(() => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  });
  process.env.CLAUDE_CONFIG_DIR = path.join(CONFIGDIR, "inherited-claude");
  const profile = { agent: "claude-code", enabled: true, env: {}, id: "bot-claude", model: "Provider/model", name: "Bot Claude", scope: "global", surface: "app" };

  const defaultHome = claudeAppBotWorkerEnv(profile, {}, false);
  assert.equal("CLAUDE_CONFIG_DIR" in defaultHome, false);
  assert.equal(defaultHome.LLMR_CLAUDE_BASE_CONFIG_DIR, path.join(process.env.LLMR_INTERNAL_HOME_DIR, ".claude"));

  const generated = claudeAppBotWorkerEnv({ ...profile, scope: "llmr" }, {}, false);
  assert.equal(generated.CLAUDE_CONFIG_DIR, path.join(CONFIGDIR, "profiles", "bot-claude", "claude"));
});

test("the Claude App bot worker on the default ~/.claude keeps CLAUDE_CONFIG_DIR when LLMR's home is not the child's HOME", (t) => {
  const previous = process.env.LLMR_INTERNAL_HOME_DIR;
  const runtimeHome = mkdtempSync(path.join(os.tmpdir(), "llmr-runtime-home-"));
  t.after(() => {
    process.env.LLMR_INTERNAL_HOME_DIR = previous;
    rmSync(runtimeHome, { force: true, recursive: true });
  });
  process.env.LLMR_INTERNAL_HOME_DIR = runtimeHome;
  const profile = { agent: "claude-code", enabled: true, env: {}, id: "bot-claude", model: "Provider/model", name: "Bot Claude", scope: "global", surface: "app" };

  assert.equal(claudeAppBotWorkerEnv(profile, {}, false).CLAUDE_CONFIG_DIR, path.join(runtimeHome, ".claude"));
});
