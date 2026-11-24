import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

test("a config saved by an earlier version loses the stored auth block on load and on the next save", async () => {
  const testRoot = path.join(
    process.env.LLMR_INTERNAL_HOME_DIR,
    `claude-login-stored-auth-${process.pid}`
  );
  process.env.LLMR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const { createDefaultAppConfig } = await import("@llmr/core/config/default-config.ts");
  const { loadAppConfig, saveAppConfig } = await import("@llmr/core/config/config.ts");
  const { loadPersistedAppConfig, replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");

  const auth = { headers: { authorization: "Bearer sk-ant-oat01-FAKE" }, strict: true };
  await replacePersistedAppConfig({
    ...createDefaultAppConfig(),
    providerPlugins: [
      { auth, key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" },
      { auth, key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" },
      { auth: { headers: { "x-other": "kept" } }, key: "other-plugin", providerName: "Other" }
    ]
  });
  const loaded = await loadAppConfig();
  assert.deepEqual(loaded.providerPlugins.map((plugin) => "auth" in plugin), [false, false, true]);
  assert.equal(loaded.providerPlugins[2].auth.headers["x-other"], "kept");
  await saveAppConfig(loaded);
  assert.equal(JSON.stringify(await loadPersistedAppConfig()).includes("sk-ant-oat01-FAKE"), false);
  const reloaded = await loadAppConfig();
  assert.equal(reloaded.providerPlugins[2].auth.headers["x-other"], "kept");
});
