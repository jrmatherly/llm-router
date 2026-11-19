import assert from "node:assert/strict";
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
