# Backlog: API Keys and Gateway Reload Implementation Plan

> **Status, 2026-11-22: draft, not ready to build.** A second-model audit found Blockers in this plan, and none has been checked in the code or corrected here. Do not build from it until its fix round is done. The audit lives outside the repo.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who edits API keys keeps every key and every revocation that another window, the CLI or a profile wrote in the meantime, and a key added or revoked by another process takes effect in the running gateway without a manual restart.

**Architecture:** Three tasks, one PR each, in order. Task 1 removes the two writes that replace the whole `api_keys` table from a list read earlier, so every key write reads and writes inside one transaction. Task 2 makes the process that owns the gateway poll the stored key list and reload once when it changes. Task 3 makes a profile launch wait for the gateway to accept the profile's own key before it falls back to another one, and say so when it does.

**Tech Stack:** TypeScript, `better-sqlite3`, Electron 45, React, `node:test` with `node:assert/strict`.

**Spec:** [`docs/superpowers/research/2026-11-22-open-items-validation.md`](../research/2026-11-22-open-items-validation.md). Row ids K-1 to K-3, decisions B-1 to B-9 and outside facts X-1 to X-15 come from that record. Read rows K-1 to K-3 before you start.

**Evidence status.** The faults were run by the research pass (K-1, K-2) or read (K-3). No fix in this plan was prototyped, so no size given here is measured. The plan author read every file, symbol and test named below at `main` `eb84a3ba` on 2026-11-22 and ran none of the new tests. Where a step rests on something only read, the step says so.

## Decisions this plan rests on

- **B-8.** A key save merges, and a delete wins. Task 1 encodes it.
- **X-13.** SQLite protects a read and a write only inside one transaction, and `BEGIN IMMEDIATE` is its recommendation for read-then-write. `runTransaction` in `config-repository.ts` already opens every transaction that way.
- **V-13 of the v8 plan.** A change of the key list restarts the gateway child once, and a restart drops requests in flight. Task 2 adds no reload without a restart.
- **V-10 of the v8 plan.** Nothing here touches the gateway fork.
- **Plan author, changeable in review without reopening the plan:** the poll interval of 1000 ms and the two-tick rule (Task 2), the wait of 10 000 ms and its 500 ms poll (Task 3), and the wording of the warning (Task 3).

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json` and never deletes or migrates `~/.claude/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Never pass `--scope`.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads. `gateway.md` applies to Task 2, `ui.md` to Task 1, `tests.md` to every test.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and the package suites the task touches.
- No test, script or doc names a real provider host or holds a key. Test keys are made-up strings such as `sk-added-key-0004`.
- A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. No task here needs one.
- Merging needs the owner's word, once per PR.
- No two PRs of this plan run at the same time. Start each from `main` after the one before it has merged.
- The repository is public. Describe a change by what the code does.

## Review Focus

Each line is a condition no row's own test covers. The test that pins it is in the step named at the end.

1. A browser tab loaded before Task 1 shipped, or any caller that sends no `base`, saves its key list. Nothing is deleted. Its entries are added or updated. Task 1, Step 3.
2. The user deletes the last key. The store is never left empty, and a new `local-gateway` key is generated. Task 1, Step 1.
3. A key revoked in one window is edited in another window that still shows it. The key stays revoked. Task 1, Step 1.
4. The process that owns the gateway saves a key itself. The gateway restarts once, through the save handler, and the poll does not restart it a second time. Task 2, Steps 1 and 4.
5. A gateway started from a config whose keys were never stored, which is every existing wire test, keeps running on that config while nobody writes a key. Task 2, Step 1, and the unchanged cases of `gateway-child-env-wire.test.mjs` in Step 6.

## Rows this plan closes

| Row | Task |
|---|---|
| K-1 | Task 1 |
| K-2 | Task 2 |
| K-3 | Task 3. One question is under "Open with the owner", and the task does not wait on it |

## Not in this plan

- The API Keys page still shows the list from its last load or save. A key another process wrote appears after the page's next save or reload. After Task 1 a save from that older list loses nothing.
- A reload of the key list without a restart of the gateway child. It needs a fork change (V-13).
- A gateway that another process owns (`gatewayManagedExternally`). That process's owner runs the poll.
- Concurrent `startGateway` calls. `GatewayService.start` has no lock (read). Task 2 keeps the poll from adding one by the two-tick rule and does not add a lock.

---

### Task 1: Never replace the key table from a list read earlier (K-1)

First, because Task 2's reload would otherwise spread a list that a save from an older list had just damaged.

Today the API Keys page sends its whole list, and `saveApiKeysConfig` deletes every stored row and inserts that list. A change written since the page loaded, an added key or a removed one, is not kept, and a profile key is recreated with a new token, so the token just written into an agent's files stops working. `loadAppConfig` has the same shape on its write path: it reads the key table, and later replaces it inside a transaction that did not read it. After this task the page sends the list it started from beside the list it wants, and only its own changes are applied. No code path is left that replaces the table from a list read outside the transaction.

Key ids, read in the code. A key made in the UI gets `key_` plus 9 random bytes (`generateApiKeyId`, `packages/ui/src/pages/home/shared/api-keys.ts`). A profile key is `profile:<profile id>` (`profileApiKeyId`, `packages/core/src/profiles/api-key.ts`). The generated gateway key is `local-gateway` (`GENERATED_GATEWAY_API_KEY_ID`, `config.ts`). `id` is the table's primary key. A key that came from a legacy config file has a positional id (`key-1`, `key-2`), which is stable once stored. The merge matches on `id`.

**Files:**
- Modify: `packages/core/src/config/config.ts` (`saveApiKeysConfig`, the write in `loadAppConfig`, its load-failure fallback)
- Modify: `packages/core/src/config/config-repository.ts` (`replaceConfigSnapshot`, `replacePersistedConfigSnapshot`. Delete `replaceApiKeys` and `replacePersistedApiKeys`)
- Modify: `packages/electron/src/main/ipc.ts` (the `appSaveApiKeys` handler), `packages/electron/src/main/preload.ts` (`saveApiKeys`)
- Modify: `packages/core/src/web/management-server.ts` (the `saveApiKeys` RPC handler)
- Modify: `packages/ui/src/types/electron.d.ts`, `packages/ui/src/web-client-bridge.ts`, `packages/ui/src/pages/home/App.tsx` (`persistApiKeys`)
- Test: `packages/core/test/unit/config/config-credential-writes.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs`
- Test, callers of the deleted function: `packages/core/test/integration/profiles/profile-open-lookup.test.mjs` (1 call), `packages/core/test/integration/profiles/profile-service.test.mjs` (5 calls), `packages/core/test/unit/web/web-management-server.test.mjs` (1 call)

**Interfaces:**
- Produces: `saveApiKeysConfig(next: ApiKeyConfig[], base: ApiKeyConfig[]): Promise<AppConfig>` in `config.ts`. Both arguments are required in the type.
- Produces: `replacePersistedConfigSnapshot(value: unknown, updateApiKeys: (current: ApiKeyConfig[]) => ApiKeyConfig[], expectedRevision?: string): Promise<ApiKeyConfig[]>` and the same shape on `ConfigRepository.replaceConfigSnapshot`. It returns the stored list after the write.
- Produces: `saveApiKeys: (apiKeys: ApiKeyConfig[], base: ApiKeyConfig[]) => Promise<AppConfig>` on `window.llmr`.
- Removes: `replacePersistedApiKeys` and `ConfigRepository.replaceApiKeys`. `updatePersistedApiKeys` is the one way to write keys.
- Consumes: `updatePersistedApiKeys(update)`, which reads and writes inside one `BEGIN IMMEDIATE` transaction and writes only when the list changed.

- [ ] **Step 1: Write the failing tests for the save.** In `config-credential-writes.test.mjs`, add a helper and five tests. The file's tests share one database, so each starts by setting the stored list.

```js
const added = { createdAt: "2026-02-01T00:00:00.000Z", id: "added", key: "added-token" };

async function setKeys(keys) {
  return configApi.saveApiKeysConfig(keys, (await configApi.loadAppConfig()).APIKEYS);
}

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
```

  In the four existing tests of the file, every `saveApiKeysConfig([retained, revoked])` becomes `setKeys([retained, revoked])`, every `saveApiKeysConfig([retained])` becomes `saveApiKeysConfig([retained], stale.APIKEYS)`, and `saveApiKeysConfig([rotated])` becomes `saveApiKeysConfig([rotated], stale.APIKEYS)`. Their assertions do not change.

- [ ] **Step 2: Run the file and see the new tests fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/config/config-credential-writes.test.js`
Expected: the first new test fails with `saved.APIKEYS` equal to `[renamed, revoked]`, the second with `revoked` present, the fourth with `[added]` alone. The third and fifth can pass before the change.

- [ ] **Step 3: Implement `saveApiKeysConfig(next, base)` in `config.ts`.** Normalize both lists the way the function normalizes its one list today (`normalizeApiKeys(list, undefined)` without the seed key), treating a `base` that is not an array as empty. Then, inside `enqueueAppConfigWrite`, call `updatePersistedApiKeys((current) => ...)` and return `loadAppConfig()`. The update applies these rules, in this order, and is the whole algorithm:

  1. Drop from `current` every id that is in `base` and not in `next`.
  2. For each entry of `next` whose JSON equals the `base` entry with the same id, do nothing.
  3. For each other entry of `next`: if its id is in `current`, replace that row in place. If its id is not in `current` and not in `base`, append it. If its id is in `base` and no longer in `current`, skip it, because the key was deleted elsewhere and a delete wins.
  4. Pass the result through `ensureGatewayApiKeys`, so an empty list gets a generated key.

  Every other row of `current` keeps its content and its position. `ensureGatewayApiKeys` no longer runs on the caller's list before the write.

- [ ] **Step 4: Pass `base` through the chain.** One rule per file.
  - `ipc.ts`: the handler becomes `async (_event, apiKeys: ApiKeyConfig[], base: ApiKeyConfig[])` and calls `saveApiKeysConfig(apiKeys, base)`. The rest of the handler is unchanged.
  - `management-server.ts`: `saveApiKeys: async (apiKeys, base)` calls `saveApiKeysConfig(apiKeys as ApiKeyConfig[], base as ApiKeyConfig[])`.
  - `preload.ts`: `saveApiKeys: (apiKeys: ApiKeyConfig[], base: ApiKeyConfig[]) => invoke(IPC_CHANNELS.appSaveApiKeys, apiKeys, base)`.
  - `web-client-bridge.ts`: `saveApiKeys: (apiKeys, base) => rpc("saveApiKeys", [apiKeys, base])`.
  - `electron.d.ts`: `saveApiKeys: (apiKeys: ApiKeyConfig[], base: ApiKeyConfig[]) => Promise<AppConfig>;`.
  - `App.tsx`, `persistApiKeys`: take `const base = currentDraft.current.APIKEYS;` as the function's first statement, before any `await`, and call `window.llmr!.saveApiKeys(apiKeys, base)`. Its three callers build their list from `currentDraft.current` in the statement before the call, so this is the list the edit started from. The save runs later in `configSaveQueue`, after which `currentDraft.current` may hold another save's result, so do not read it inside the queued function. No UI test can reach `persistApiKeys`, because it lives inside the `App` component and no DOM test library is installed. `npm run typecheck` pins the two-argument call.

- [ ] **Step 5: Pin the web path.** In `web-management-server.test.mjs`, add `the saveApiKeys RPC applies only the caller's changes`. Start the server as the test `a profile save creates its key before the gateway starts...` does (`startWebManagementServer({ authToken, host: "127.0.0.1", port: 0, startGateway: false })`, with `gatewayService.start` and `gatewayService.updateConfig` mocked). Read `current = (await rpc(runtime.url, token, "getConfig")).value.APIKEYS`. Add a key with `updatePersistedApiKeys((keys) => [...keys, { createdAt: "2026-02-01T00:00:00.000Z", id: "elsewhere", key: "elsewhere-token" }])`. Call `rpc(runtime.url, token, "saveApiKeys", [[...current, { createdAt: "2026-02-02T00:00:00.000Z", id: "mine", key: "mine-token" }], current])`. Assert the returned `value.APIKEYS` ids include both `elsewhere` and `mine`. Then call `rpc(runtime.url, token, "saveApiKeys", [[]])` with no base, and assert `loadPersistedApiKeys()` still holds `elsewhere` and `mine`. The handler also applies profiles, as it does today, inside the test's temporary home.

- [ ] **Step 6: Write the failing test for the load path.** The research ran this shape as its case S3 and saw the loss. The test below was not run. In `config-credential-writes.test.mjs`, add `a config load that has to write keeps a key committed during the load`. It follows the child-process pattern of `config-concurrency.test.mjs`.

  1. Import `loadPersistedAppConfig` and `replacePersistedAppConfig` from `@llmr/core/config/config-repository.ts` and `APP_CONFIG_DB_FILE` from `@llmr/core/config/constants.ts`. `setKeys([retained])`, then store a config that forces the write: `await replacePersistedAppConfig({ ...(await loadPersistedAppConfig()), APIKEYS: [{ createdAt: "2026-01-01T00:00:00.000Z", id: "legacy", key: "legacy-token" }] })`.
  2. Spawn (`spawn`, not `spawnSync`) `process.execPath -e <script> APP_CONFIG_DB_FILE` with `ELECTRON_RUN_AS_NODE: "1"`. The script opens the file with `better-sqlite3`, runs `BEGIN IMMEDIATE`, inserts a row `('concurrent', '', 'concurrent-token', 'plain', '2026-03-01T00:00:00.000Z', '', '')` into `api_keys (id, name, encrypted_key, encryption, created_at, expires_at, limits_json)`, prints `locked`, and after 500 ms runs `COMMIT` and closes.
  3. When the child's stdout holds `locked`, `const loaded = await configApi.loadAppConfig();`. Wait for the child to exit with status 0.
  4. Assert `loaded.APIKEYS.map((key) => key.id)` equals `["retained", "concurrent", "legacy"]`, and that `(await configApi.loadAppConfig()).APIKEYS` has the same ids.

  Run it. Expected before the change: `concurrent` is missing.

- [ ] **Step 7: Merge inside the transaction.** In `config-repository.ts`, `replaceConfigSnapshot(value, updateApiKeys, expectedRevision)` keeps its revision check and its `replaceAppConfigRow` call. In place of `replaceApiKeyRows(database, normalized)` it does what `updateApiKeys` the method does: `const current = listApiKeys(database)`, `result = uniqueApiKeyConfigs(updateApiKeys(current))`, write only when the JSON differs, and return `result`. In `loadAppConfig`, the call becomes `replacePersistedConfigSnapshot(sanitized, (current) => ensureGatewayApiKeys(uniqueApiKeyConfigs([...current.filter((apiKey) => !isDefaultSeedApiKey(apiKey)), ...configFileApiKeys])), revision)`, and the returned list replaces `config.APIKEYS` and `config.APIKEY` (its first key, or `""`) before `config` is returned. The read at the top of `loadAppConfig` stays. It decides `shouldPersistApiKeys` and fills the config when no write happens.

- [ ] **Step 8: Remove the last table replace.** In the `catch` of `loadAppConfig`, replace the `replacePersistedApiKeys(apiKeys)` call with `updatePersistedApiKeys((current) => current.length ? current : apiKeys)`, keep its `.catch` warning, and build the fallback config from the list it returns when it succeeds. Delete `replacePersistedApiKeys` and `ConfigRepository.replaceApiKeys` from `config-repository.ts` and the import from `config.ts`. In the three test files listed under Files, each `replacePersistedApiKeys(list)` becomes `updatePersistedApiKeys(() => list)`. `replaceApiKeyRows` stays, as the private writer both transactions use.

- [ ] **Step 9: Verify.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/config/config-credential-writes.test.js .test-dist/core/test/unit/web/web-management-server.test.js`
Expected: every test passes, 0 fail.
Run: `rtk bypass grep -rn "replacePersistedApiKeys\|\.replaceApiKeys(" packages tests --include="*.ts" --include="*.tsx" --include="*.mjs" | grep -v node_modules`
Expected: no output.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron`
Expected: all pass.

- [ ] **Step 10: Commit.** Subject: `fix(config): apply only the caller's own changes when API keys are saved, and merge keys inside the load's transaction`

---

### Task 2: Reload the gateway when the stored key list changes (K-2)

After Task 1, because the reload trusts the stored list.

The gateway child gets its keys once, at spawn. When another process writes a key, for example `llmr <profile>` while the desktop app runs the gateway, the running gateway keeps the key list it started with until something restarts it, so an added key and a removed key do not take effect. After this task the process that owns the gateway reads the stored key list once a second while the gateway runs, and reloads its stored config once when the list has changed. A key added elsewhere works, and a key revoked elsewhere stops working, within a few seconds and one child restart (V-13).

**How the poll tells its own write from another's.** It does not compare the stored list with the config the service holds. Callers mutate that config in place (see the comment on `holdConfig`), and a service started from a config whose keys were never stored, which is every wire test, would be reloaded onto the stored config. It compares the stored list with the stored list as it was when the service last took a config. Three rules follow.

1. **Baseline.** `holdConfig` clears the baseline. `startGateway` and `updateConfig` then read the stored list and remember its JSON. Every key save in the owning process ends in `updateConfig` or `start` (read in `ipc.ts` and `management-server.ts`), so its own write is inside the new baseline.
2. **Two ticks.** A changed list must be seen unchanged on two ticks in a row before the poll acts. A save handler writes the key and calls `updateConfig` some milliseconds later. Without this rule a tick between the two would schedule a second restart beside the handler's own.
3. **Once per change.** When the poll acts it sets the baseline to the list it acted on, whatever the reload's outcome. A reload that fails is not retried every second.

The reload is the existing `reloadPersistedRuntimeConfig`, which loads the stored config and restarts when `runtimeGatewayConfigSignature` differs. That signature includes `APIKEYS`.

**Files:**
- Modify: `packages/core/src/gateway/application/gateway-service.ts`
- Create: `packages/core/test/unit/gateway/stored-api-keys-watch.test.mjs`
- Test: `packages/core/test/integration/gateway/gateway-child-env-wire.test.mjs`

**Interfaces:**
- Consumes: `loadPersistedApiKeys(): Promise<ApiKeyConfig[]>` from `@llmr/core/config/config-repository`, and `updatePersistedApiKeys` in tests.
- Produces, all private members of `GatewayService`: `storedApiKeysBaseline?: string`, `storedApiKeysPending?: string`, `storedApiKeysTimer?: NodeJS.Timeout`, `rememberStoredApiKeys(): Promise<void>`, `checkStoredApiKeys(): Promise<void>`. Module constant `storedApiKeysPollMs = 1000`.
- Changes: `schedulePersistedRuntimeConfigReload(expectedRevision: string | undefined, forceRestart: boolean)` and `reloadPersistedRuntimeConfig(expectedRevision: string | undefined, forceRestart: boolean)`. With `undefined` the revision check is skipped.

- [ ] **Step 1: Write the failing unit tests.** New file `stored-api-keys-watch.test.mjs`. Set `LLMR_INTERNAL_HOME_DIR`, `LLMR_INTERNAL_APP_DATA_DIR` and `LLMR_INTERNAL_USER_DATA_DIR` to a folder named for `process.pid` before any import, as `config-credential-writes.test.mjs` does, and import with `await import(...)` in `before`. Build the service the way `core-restart.test.mjs` does.

```js
const first = { createdAt: "2026-01-01T00:00:00.000Z", id: "first", key: "first-token" };
const second = { createdAt: "2026-01-02T00:00:00.000Z", id: "second", key: "second-token" };

async function runningService(keys) {
  await updatePersistedApiKeys(() => keys);
  const service = new gatewayService.constructor();
  service.child = {};
  service.status = { coreEndpoint: "", endpoint: "", networkEndpoints: [], state: "running" };
  const reloads = [];
  service.schedulePersistedRuntimeConfigReload = (revision, force) => { reloads.push([revision, force]); };
  await service.rememberStoredApiKeys();
  return { reloads, service };
}

test("a stored key change seen on two ticks reloads the gateway once", async () => {
  const { reloads, service } = await runningService([first]);
  await service.checkStoredApiKeys();
  await updatePersistedApiKeys((current) => [...current, second]);
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, [[undefined, false]]);
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.equal(reloads.length, 1);
});

test("a key write that the service itself follows with a new config does not reload", async () => {
  const { reloads, service } = await runningService([first]);
  await updatePersistedApiKeys((current) => [...current, second]);
  await service.checkStoredApiKeys();
  await service.rememberStoredApiKeys();
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
});

test("a stored key change that is undone before the second tick does not reload", async () => {
  const { reloads, service } = await runningService([first]);
  await updatePersistedApiKeys((current) => [...current, second]);
  await service.checkStoredApiKeys();
  await updatePersistedApiKeys(() => [first]);
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
});

test("a service whose held keys were never stored is left alone", async () => {
  const { reloads, service } = await runningService([first]);
  service.config = { APIKEYS: [second], gateway: { host: "127.0.0.1", port: 0 } };
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
});

test("a stopped gateway and a gateway another process owns are not polled", async () => {
  const { reloads, service } = await runningService([first]);
  await updatePersistedApiKeys((current) => [...current, second]);
  service.status = { ...service.status, gatewayManagedExternally: true };
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  service.status = { ...service.status, gatewayManagedExternally: undefined, state: "stopped" };
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, []);
});
```

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/stored-api-keys-watch.test.js`
Expected: FAIL with `service.rememberStoredApiKeys is not a function`.

- [ ] **Step 3: Implement the two methods in `gateway-service.ts`.**
  - `rememberStoredApiKeys()` sets `storedApiKeysBaseline = JSON.stringify(await loadPersistedApiKeys())` and clears `storedApiKeysPending`. A read that throws leaves the baseline undefined.
  - `checkStoredApiKeys()` returns at once unless `this.status.state === "running"`, `this.status.gatewayManagedExternally` is not set, and `this.child` or `this.server` exists. It reads the stored list's JSON as `seen`. With no baseline it sets the baseline to `seen` and returns. When `seen` equals the baseline it clears the pending value. When `seen` differs from the pending value it sets the pending value to `seen`. Otherwise it sets the baseline to `seen`, clears the pending value and calls `this.schedulePersistedRuntimeConfigReload(undefined, false)`. A read that throws is swallowed, so the next tick tries again.
  - `holdConfig` also clears the baseline and the pending value.
  - `reloadPersistedRuntimeConfig` skips its revision comparison when `expectedRevision` is `undefined`. Its two other callers pass a string and are unchanged.

- [ ] **Step 4: Wire the timer and the baseline.**
  - `startGateway`: where it sets `state: "running"` near its end, `await this.rememberStoredApiKeys()` and then start `storedApiKeysTimer = setInterval(() => { void this.checkStoredApiKeys(); }, storedApiKeysPollMs)` with `.unref()`.
  - `updateConfig`: after the `this.holdConfig(config)` on its non-restart path, `await this.rememberStoredApiKeys()`. The restart path goes through `startGateway`.
  - `stopGateway`: clear the timer first and set the field to `undefined`.
  - `markExternalGatewayRunning` needs nothing. `checkStoredApiKeys` returns for a gateway another process owns.

- [ ] **Step 5: Run the unit tests.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/stored-api-keys-watch.test.js .test-dist/core/test/unit/gateway/core-restart.test.js`
Expected: every test passes, 0 fail.

- [ ] **Step 6: Write the wire test for both layouts.** In `gateway-child-env-wire.test.mjs`. The reload loads the stored config, so this case must start from one. Add a fourth parameter to the file's `startGateway(t, layout, edit, { stored = false } = {})`. When `stored` is true, after `edit?.(config)`: `await updatePersistedApiKeys(() => config.APIKEYS)`, `await replacePersistedAppConfig({ ...config, APIKEY: "", APIKEYS: [] })`, then start the service with `await loadAppConfig()` and return that config's `gateway.port` and `gateway.corePort`. The file gains imports of `loadAppConfig` (`@llmr/core/config/config.ts`) and of `replacePersistedAppConfig` and `updatePersistedApiKeys` (`@llmr/core/config/config-repository.ts`). The other cases call the helper as before and stay unchanged, which is Review Focus 5.

```js
for (const layout of ["single", "compat"]) {
  test(`a key another process adds answers 200 and a key it revokes answers 401 without a manual restart (${layout})`, { skip, timeout: 60000 }, async (t) => {
    const gateway = await startGateway(t, layout, undefined, { stored: true });
    const status = async (key) => {
      try {
        return (await send(gateway.publicPort, "/v1/models", { headers: { authorization: `Bearer ${key}` } })).status;
      } catch {
        return 0;
      }
    };
    assert.equal(await status("sk-good-key-0001"), 200);
    assert.equal(await status("sk-added-key-0004"), 401);
    const firstPid = gateway.service.getStatus().pid;
    await updatePersistedApiKeys(() => [{ createdAt: "2026-01-01T00:00:00.000Z", id: "added", key: "sk-added-key-0004" }]);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !(await status("sk-added-key-0004") === 200 && await status("sk-good-key-0001") === 401)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(await status("sk-added-key-0004"), 200);
    assert.equal(await status("sk-good-key-0001"), 401);
    const secondPid = gateway.service.getStatus().pid;
    assert.notEqual(secondPid, firstPid);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    assert.equal(gateway.service.getStatus().pid, secondPid);
    assert.equal(gateway.service.getStatus().state, "running");
  });
}
```

  The last four lines are Review Focus 4 on the wire: one restart per change, and none after it. Note the time between the write and the first 200 in the PR description. Task 3's wait is checked against it.

- [ ] **Step 7: Run the wire file with the real gateway entry.**

Run: `node build/test.mjs core && LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" node --test .test-dist/core/test/integration/gateway/gateway-child-env-wire.test.js`. That is the value `.github/workflows/test.yml` sets. Without it every case of the file is skipped.
Expected: every case passes in both layouts, 0 fail, 0 skipped. To see the new case fail first, run it with Step 4 reverted: each layout then keeps answering from the key list it started with.

- [ ] **Step 8: Run the gates.**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`
Expected: all pass. `npm run test:core` matters here beyond the new files. Any core test that starts a service for more than two seconds and writes a key without giving the service a new config would now be reloaded. None was found by reading. If one fails, stop and report it before changing the test.

- [ ] **Step 9: Commit.** Subject: `fix(gateway): reload when another process changes the stored API keys`

---

### Task 3: Wait for the profile's own key before using another one (K-3)

Last, because the wait only ends well once Task 2 makes the gateway pick the key up.

`llmr <profile>` applies the profile in its own process, which can create the profile's key, and probes the running gateway milliseconds later (`cli.ts`, `ensureProfileGateway`). The gateway does not know the key yet, so the probe goes on to the other stored keys (`existingGatewayApiKeyCandidates`, `launch-service.ts`) and the agent is launched on the first one the gateway accepts. Nothing says so. The agent then runs its session on a key that is not the profile's, so settings that are matched by the profile's key id are not the ones in effect, and Logs name another key. Task 2 alone does not change this, because the reload takes seconds and the probe does not wait (read, not run). After this task the launch waits up to 10 seconds for the gateway to accept the profile's key. If it still does not, the launch falls back as today and prints one warning.

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts` (`ensureProfileGateway`, `ensureGatewayConfigRunning`)
- Test: `packages/core/test/unit/profiles/profile-gateway-probe.test.mjs`

**Interfaces:**
- Changes: the options of `ensureProfileGateway` and `ensureGatewayConfigRunning` gain `profileKeyWaitMs?: number`, default `10_000`. Callers in `cli.ts` and in `launch-service.ts` pass nothing.
- Consumes: `probeExistingProfileGateway(config, profile, candidateConfig)`, whose `usable` result carries the accepted `apiKey`. Inside `ensureGatewayConfigRunning`, `config.APIKEY` is the profile's own token (`profileGatewayConfigFor`).

- [ ] **Step 1: Write the failing tests.** In `profile-gateway-probe.test.mjs`. Both use a config with two keys, built from the file's `claudeProfileConfig()`: `config.APIKEY = "primary-token"` and `config.APIKEYS = [{ createdAt: "2026-01-01T00:00:00.000Z", id: "primary", key: "primary-token" }, <the profile key the helper already makes>]`. The `fetch` stub answers `/health` as the first test of the file does, and `/v1/models` by the bearer token.

```js
test("a profile launch waits for the gateway to accept the profile's own key", async (t) => {
  let profileProbes = 0;
  // stub: "Bearer profile-token" answers 401 for its first two probes and 200 after, "Bearer primary-token" answers 200
  const warn = t.mock.method(console, "warn", () => {});
  const result = await ensureProfileGateway(config, profile, "Local subscription router", { profileKeyWaitMs: 5000, reuseExisting: true, startIfMissing: false });
  assert.equal(result.APIKEY, "profile-token");
  assert.equal(profileProbes, 3);
  assert.equal(warn.mock.callCount(), 0);
});

test("a profile launch that falls back to another key says so and names no key", async (t) => {
  // stub: "Bearer profile-token" always answers 401, "Bearer primary-token" answers 200
  const warn = t.mock.method(console, "warn", () => {});
  const result = await ensureProfileGateway(config, profile, "Local subscription router", { profileKeyWaitMs: 0, reuseExisting: true, startIfMissing: false });
  assert.equal(result.APIKEY, "primary-token");
  assert.equal(warn.mock.callCount(), 1);
  const message = String(warn.mock.calls[0].arguments[0]);
  assert.match(message, /did not accept the key of profile "Claude Main"/);
  assert.doesNotMatch(message, /profile-token|primary-token/);
});
```

  The first test takes about one second of real time, two polls of 500 ms.

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/profile-gateway-probe.test.js`
Expected: the first fails with `result.APIKEY` equal to `"primary-token"`, the second with a warn count of 0.

- [ ] **Step 3: Implement the wait and the warning in `launch-service.ts`.** In `ensureGatewayConfigRunning`, at both places where `probeExistingProfileGateway` returns `usable`: while the accepted `apiKey` is not `config.APIKEY` and less than `profileKeyWaitMs` has passed, wait 500 ms and probe again. A probe that is no longer `usable` ends the wait and is handled as it is today. In `ensureProfileGateway`, where `result.acceptedApiKey !== result.config.APIKEY` already selects the fallback, call `console.warn` once with `[profile] The running LLM Router gateway did not accept the key of profile "<profile.name || profile.id>". This launch uses another key the gateway accepts, so the profile's model list does not apply to it. Restart the gateway to fix this.` The message never holds a key or part of one.

- [ ] **Step 4: Verify.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/profile-gateway-probe.test.js`
Expected: every test passes, 0 fail. The five existing tests of the file use one key that is accepted, so they never wait.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:cli`
Expected: all pass.

- [ ] **Step 5: Check the wait against Task 2's measurement.** If the time Task 2, Step 6 recorded between a key write and its first 200 is above 8 seconds, raise the default so it is that time plus 2 seconds, and say so in the PR description.

- [ ] **Step 6: Commit.** Subject: `fix(profiles): wait for the gateway to accept a profile's key before launching on another one`

---

## Open with the owner

**What should a profile launch do when the gateway still refuses the profile's own key after the wait? (K-3, Task 3)**

- (a) Fall back to another accepted key and print the warning. Task 3 is written this way. The agent starts, on a key that is not the profile's.
- (b) Refuse the launch with an error that says to restart the gateway. No session ever runs on another key. A user whose gateway is stale for a reason Task 2 does not cover cannot launch until they restart it.
- (c) Keep today's behaviour and only add the warning, with no wait. A launch right after a profile's first apply then always runs on another key.

Recommendation: (a). Task 3 does not wait on the answer. If the owner picks (b), Step 3's warning becomes a thrown `Error` with the same text and the second test asserts the rejection. If (c), the wait and the first test are dropped.
