import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";

const root = path.join(process.env.LLMR_INTERNAL_HOME_DIR || os.tmpdir(), `credential-writes-${process.pid}`);
process.env.LLMR_INTERNAL_HOME_DIR = path.join(root, "home");
process.env.LLMR_INTERNAL_APP_DATA_DIR = path.join(root, "app-data");
process.env.LLMR_INTERNAL_USER_DATA_DIR = path.join(root, "user-data");

let configApi;
before(async () => {
  configApi = await import("@llmr/core/config/config.ts");
});

const retained = { createdAt: "2026-01-01T00:00:00.000Z", id: "retained", key: "retained-token" };
const revoked = { createdAt: "2026-01-01T00:00:00.000Z", id: "revoked", key: "revoked-token" };
const added = { createdAt: "2026-02-01T00:00:00.000Z", id: "added", key: "added-token" };

async function setKeys(keys) {
  return configApi.saveApiKeysConfig(keys, (await configApi.loadAppConfig()).APIKEYS);
}

test("saving an old settings snapshot cannot restore a revoked key", async () => {
  const stale = await setKeys([retained, revoked]);
  await configApi.saveApiKeysConfig([retained], stale.APIKEYS);

  const saved = await configApi.saveAppConfig({ ...stale, autoStart: !stale.autoStart });
  assert.equal(saved.autoStart, !stale.autoStart);
  assert.deepEqual(saved.APIKEYS, [retained]);
  assert.deepEqual((await configApi.loadAppConfig()).APIKEYS, [retained]);
});

test("interleaved settings saves preserve key rotations and updated limits", async () => {
  const stale = await setKeys([retained, revoked]);
  const rotated = { ...retained, key: "rotated-token", limits: { rpm: 2 } };
  const results = await Promise.allSettled([
    configApi.saveAppConfig({ ...stale, autoStart: false }),
    configApi.saveApiKeysConfig([rotated], stale.APIKEYS),
    configApi.saveAppConfig({ ...stale, autoStart: true })
  ]);
  assert.equal(results[2].status, "rejected");
  assert.match(results[2].reason.message, /Configuration changed/);

  const current = await configApi.loadAppConfig();
  assert.equal(current.autoStart, false);
  assert.equal(current.APIKEY, rotated.key);
  assert.deepEqual(current.APIKEYS, [rotated]);
});

test("profile maintenance cannot restore general keys from a stale config", async () => {
  const { applyProfileConfig } = await import("@llmr/core/profiles/service.ts");
  const stale = await setKeys([retained, revoked]);
  await configApi.saveApiKeysConfig([retained], stale.APIKEYS);
  stale.profile = { ...stale.profile, enabled: false, profiles: [] };

  await applyProfileConfig(stale);

  assert.deepEqual(stale.APIKEYS, [retained]);
  assert.deepEqual((await configApi.loadAppConfig()).APIKEYS, [retained]);
});

test("stale claude-design and claude-ship entries are dropped on load and leave the stored config on save", async () => {
  const { loadPersistedAppConfig, replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");
  const base = await configApi.loadAppConfig();
  await replacePersistedAppConfig({
    ...base,
    plugins: [
      { enabled: true, id: "claude-design", module: "/gone/index.cjs" },
      { enabled: true, id: "claude-ship", module: "/gone/index.cjs" },
      { enabled: true, id: "cursor-proxy" }
    ],
    profile: { ...base.profile, enabled: true, profiles: [
      { agent: "claude-design", enabled: true, id: "old-design", model: "Provider/model", name: "Old", scope: "llmr" },
      { agent: "zcode", enabled: true, id: "keep", model: "Provider/model", name: "Keep", scope: "llmr" }
    ] }
  });

  const loaded = await configApi.loadAppConfig();
  assert.deepEqual(loaded.plugins.map((plugin) => plugin.id), ["cursor-proxy"]);
  assert.deepEqual(loaded.profile.profiles.map((profile) => profile.id), ["keep"]);
  assert.doesNotMatch(JSON.stringify(await loadPersistedAppConfig()), /claude-ship/);

  await configApi.saveAppConfig(loaded);
  assert.doesNotMatch(JSON.stringify(await loadPersistedAppConfig()), /claude-design|claude-ship/);
});

test("profile key generation uses the latest credentials without restoring revoked keys", async () => {
  const { applyProfileConfig } = await import("@llmr/core/profiles/service.ts");
  const stale = await setKeys([retained, revoked]);
  await configApi.saveApiKeysConfig([retained], stale.APIKEYS);
  stale.Providers = [{ name: "Provider", models: ["model"], api_base_url: "https://example.test/v1" }];
  stale.profile = {
    ...stale.profile,
    enabled: true,
    profiles: [{ agent: "zcode", enabled: true, id: "new-profile", model: "Provider/model", name: "New", scope: "llmr" }]
  };

  await applyProfileConfig(stale);

  const current = await configApi.loadAppConfig();
  assert.deepEqual(current.APIKEYS.map((key) => key.id), ["retained", "profile:new-profile"]);
  assert.ok(current.APIKEYS[1].key.startsWith("llmr-profile-"));
});

test("a key list saved from an older list keeps a key written since", async () => {
  const { updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  const stale = (await setKeys([retained, revoked])).APIKEYS;
  await updatePersistedApiKeys((current) => [...current, added]);
  const renamed = { ...retained, name: "Renamed" };
  const saved = await configApi.saveApiKeysConfig([renamed, revoked], stale);
  assert.deepEqual(saved.APIKEYS, [renamed, revoked, added]);
});

test("a key list saved from an older list keeps a revocation", async () => {
  const { updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  const stale = (await setKeys([retained, revoked])).APIKEYS;
  await updatePersistedApiKeys((current) => current.filter((key) => key.id !== "revoked"));
  const saved = await configApi.saveApiKeysConfig([retained, { ...revoked, name: "Edited" }, added], stale);
  assert.deepEqual(saved.APIKEYS, [retained, added]);
});

test("a key edited in two places keeps the later save, and the same save still deletes another key", async () => {
  const { updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  const stale = (await setKeys([retained, revoked])).APIKEYS;
  await updatePersistedApiKeys((current) => current.map((key) => key.id === "retained" ? { ...key, name: "Theirs" } : key));
  const saved = await configApi.saveApiKeysConfig([{ ...retained, name: "Mine" }], stale);
  assert.deepEqual(saved.APIKEYS, [{ ...retained, name: "Mine" }]);
});

test("a key list saved with an empty base deletes nothing", async () => {
  await setKeys([retained, revoked]);
  const saved = await configApi.saveApiKeysConfig([added], []);
  assert.deepEqual(saved.APIKEYS, [retained, revoked, added]);
});

test("deleting the last key leaves one generated gateway key", async () => {
  const stale = (await setKeys([retained])).APIKEYS;
  const saved = await configApi.saveApiKeysConfig([], stale);
  assert.deepEqual(saved.APIKEYS.map((key) => key.id), ["local-gateway"]);
  assert.ok(saved.APIKEYS[0].key.startsWith("sk-llmr-"));
});

const profileKey = { createdAt: "2026-01-01T00:00:00.000Z", id: "profile:foo", key: "first-profile-token", name: "Profile: Foo" };
const remadeProfileKey = { ...profileKey, createdAt: "2026-02-01T00:00:00.000Z", key: "second-profile-token" };

test("an edit of a key that was made again elsewhere leaves the new token in place", async () => {
  const { updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  const stale = (await setKeys([retained, profileKey])).APIKEYS;
  await updatePersistedApiKeys(() => [retained, remadeProfileKey]);
  const saved = await configApi.saveApiKeysConfig([retained, { ...profileKey, name: "Renamed" }], stale);
  assert.deepEqual(saved.APIKEYS, [retained, remadeProfileKey]);
});

test("a delete of a key that was made again elsewhere leaves the new key in place", async () => {
  const { updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  const stale = (await setKeys([retained, profileKey])).APIKEYS;
  await updatePersistedApiKeys(() => [retained, remadeProfileKey]);
  const saved = await configApi.saveApiKeysConfig([retained], stale);
  assert.deepEqual(saved.APIKEYS, [retained, remadeProfileKey]);
});

test("a key whose limits come back in another order is not taken for an edit", async () => {
  const { updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  const limited = { ...retained, limits: { rpm: 5, tpm: 100 } };
  const stale = (await setKeys([limited])).APIKEYS;
  await updatePersistedApiKeys((current) => current.map((key) => ({ ...key, name: "Theirs" })));
  const saved = await configApi.saveApiKeysConfig([{ ...retained, limits: { tpm: 100, rpm: 5 } }], stale);
  assert.equal(saved.APIKEYS[0].name, "Theirs");
});

test("a config load that has to write keeps a key committed during the load", async () => {
  const { loadPersistedAppConfig, replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");
  const { APP_CONFIG_DB_FILE } = await import("@llmr/core/config/constants.ts");
  await setKeys([retained]);
  await replacePersistedAppConfig({ ...(await loadPersistedAppConfig()), APIKEYS: [{ createdAt: "2026-01-01T00:00:00.000Z", id: "legacy", key: "legacy-token" }] });
  const child = spawn(process.execPath, ["-e", `
    const Database = require('better-sqlite3');
    const db = new Database(process.argv[1]);
    db.exec('BEGIN IMMEDIATE');
    db.prepare("INSERT INTO api_keys (id, name, encrypted_key, encryption, created_at, expires_at, limits_json) VALUES ('concurrent', '', 'concurrent-token', 'plain', '2026-03-01T00:00:00.000Z', '', '')").run();
    process.stdout.write('locked');
    setTimeout(() => {
      db.exec('COMMIT');
      db.close();
    }, 500);
  `, APP_CONFIG_DB_FILE], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  await new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("locked")) resolve();
    });
    child.once("exit", () => reject(new Error(`child exited before it locked: ${stderr}`)));
  });
  const loaded = await configApi.loadAppConfig();
  assert.equal(await exited, 0, stderr);
  assert.deepEqual(loaded.APIKEYS.map((key) => key.id), ["retained", "concurrent", "legacy"]);
  assert.deepEqual((await configApi.loadAppConfig()).APIKEYS.map((key) => key.id), ["retained", "concurrent", "legacy"]);
});

test("a key save removes a stored default seed key", async () => {
  const { loadPersistedApiKeys, updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  const stale = (await setKeys([retained])).APIKEYS;
  await updatePersistedApiKeys((current) => [...current, { createdAt: new Date(0).toISOString(), id: "key-1", key: "sk-123", name: "API Key 1" }]);
  await configApi.saveApiKeysConfig([{ ...retained, name: "Renamed" }], stale);
  assert.deepEqual((await loadPersistedApiKeys()).map((key) => key.id), ["retained"]);
});
