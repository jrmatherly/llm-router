import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("a key database made before the trusted forwarder column opens, and a mark saves and loads", async () => {
  const testRoot = path.join(
    process.env.LLMR_INTERNAL_HOME_DIR,
    `config-repository-trusted-forwarder-${process.pid}`
  );
  process.env.LLMR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const { APP_CONFIG_DB_FILE } = await import("@llmr/core/config/constants.ts");
  const { createBetterSqliteDatabase } = await import("@llmr/core/storage/sqlite-native.ts");

  createApiKeyDatabase(createBetterSqliteDatabase, APP_CONFIG_DB_FILE, {
    id: "existing-key",
    key: "sk-existing"
  });

  const { loadPersistedApiKeys, updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  await updatePersistedApiKeys((current) => current.map((apiKey) => ({ ...apiKey, trustedForwarder: true })));
  assert.deepEqual(await loadPersistedApiKeys(), [{ createdAt: new Date(0).toISOString(), id: "existing-key", key: "sk-existing", trustedForwarder: true }]);
});

function createApiKeyDatabase(createDatabase, file, apiKey) {
  mkdirSync(path.dirname(file), { recursive: true });
  const database = createDatabase(file);
  try {
    database.exec(`
      CREATE TABLE api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        encrypted_key TEXT NOT NULL,
        encryption TEXT NOT NULL DEFAULT 'plain',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL DEFAULT '',
        limits_json TEXT NOT NULL DEFAULT ''
      )
    `);
    database.prepare(`
      INSERT INTO api_keys (
        id, name, encrypted_key, encryption, created_at, expires_at, limits_json
      ) VALUES (?, '', ?, 'plain', ?, '', '')
    `).run(apiKey.id, apiKey.key, new Date(0).toISOString());
  } finally {
    database.close();
  }
}
