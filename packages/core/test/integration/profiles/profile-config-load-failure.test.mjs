import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// This test corrupts the config DB, so it runs in a home no other test file shares.
test("a config that failed to load does not release the agent takeovers", async (t) => {
  const home = mkdtempSync(path.join(process.env.CCR_TEST_HOME || os.tmpdir(), "config-load-failure-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.CCR_INTERNAL_HOME_DIR = home;
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(home, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(home, "user-data");
  const { loadAppConfig } = await import("@ccr/core/config/config.ts");
  const { replacePersistedAppConfig } = await import("@ccr/core/config/config-repository.ts");
  const { APP_CONFIG_DB_FILE } = await import("@ccr/core/config/constants.ts");
  const { createDefaultAppConfig } = await import("@ccr/core/config/default-config.ts");
  const { applyProfileConfig } = await import("@ccr/core/profiles/service.ts");
  const { createBetterSqliteDatabase } = await import("@ccr/core/storage/sqlite-native.ts");
  assert.ok(path.resolve(APP_CONFIG_DB_FILE).startsWith(home), "config DB lives in this test's home");

  const settingsFile = path.join(home, ".claude", "settings.json");
  mkdirSync(path.dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, `${JSON.stringify({ env: { ANTHROPIC_MODEL: "user-model" } }, null, 2)}\n`);
  const config = createDefaultAppConfig();
  config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model"], name: "Provider" }];
  config.profile.profiles = [{
    agent: "claude-code",
    enabled: true,
    env: {},
    id: "config-load-failure-claude-code",
    model: "Provider/model",
    name: "Claude Code",
    scope: "global",
    settingsFile: "~/.claude/settings.json",
    smallFastModel: "",
    surface: "auto"
  }];
  const applied = await applyProfileConfig(config);
  assert.equal(applied.clients.some((client) => client.client === "claude-code" && client.ok), true);
  assert.match(readFileSync(settingsFile, "utf8"), /127\.0\.0\.1/);

  await replacePersistedAppConfig(config);
  const database = createBetterSqliteDatabase(APP_CONFIG_DB_FILE);
  database.prepare("UPDATE app_config SET value_json = ? WHERE key = ?").run("{\"Providers\": [", "default");
  database.close();

  t.mock.method(console, "warn", () => undefined);
  const fallback = await loadAppConfig();
  assert.deepEqual(fallback.Providers, []);
  await assert.rejects(applyProfileConfig(fallback), /config failed to load/);
  assert.match(readFileSync(settingsFile, "utf8"), /127\.0\.0\.1/);
});
