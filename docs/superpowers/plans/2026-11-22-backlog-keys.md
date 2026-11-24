# Backlog: API Keys and Gateway Reload Implementation Plan

> **Status, 2026-11-24: corrected and audited again, waiting for the owner's approval to build.** A second-model audit of 2026-11-22 found 3 Blockers and 6 Corrections. Each was read again in the code at `main` `81773a5d` and held, and the tasks below carry the corrections. A second audit of the corrected text on 2026-11-24 found no Blocker and 5 Corrections, 4 of them in test text, and those are applied too. The text changed by that last round was not audited a third time. The audits live outside the repo. Tasks 1 and 2 merged on 2026-11-24 (PRs 149 and 150). Task 4 and the second-round notes under "Open with the owner" were added the same day and audited once.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who edits API keys keeps every key and every revocation that another window, the CLI or a profile wrote in the meantime, and a key added or revoked by another process takes effect in the running gateway without a manual restart.

**Architecture:** Three tasks, one PR each, in order. Task 1 removes the two writes that replace the whole `api_keys` table from a list read earlier, so every key write reads and writes inside one transaction. Task 2 makes the process that owns the gateway poll the stored key list and reload once when it changes. Task 3 makes a profile launch wait for the gateway to accept the profile's own key before it falls back to another one, and say so when it does.

**Tech Stack:** TypeScript, `better-sqlite3`, Electron 45, React, `node:test` with `node:assert/strict`.

**Spec:** [`docs/superpowers/research/2026-11-22-open-items-validation.md`](../research/2026-11-22-open-items-validation.md). Row ids K-1 to K-3, decisions B-1 to B-9 and outside facts X-1 to X-15 come from that record. Read rows K-1 to K-3 before you start.

**Evidence status.** The faults were run by the research pass (K-1, K-2) or read (K-3). No fix in this plan was prototyped, so no size given here is measured. The plan author read every file, symbol and test named below at `main` `eb84a3ba` on 2026-11-22 and ran none of the new tests. Where a step rests on something only read, the step says so. The fix round of 2026-11-24 read the code behind each audit finding again at `main` `81773a5d` (v9.0.0). Of the files this plan names, only `config.ts` (one line lower from line 28 on) and `App.tsx` changed between the two commits, and `profile-service.test.mjs` gained one call of the function Task 1 deletes. The second audit of 2026-11-24 ran the eight save tests of Task 1 against a throwaway copy of the merge rules, where all passed, and against today's code, where they fail as Step 2 says. It ran the setup of the two new Task 2 tests and the Task 3 fixture, and its corrections are in the text. The wire test of Task 2, the web test and the load test of Task 1 were not run.

## Decisions this plan rests on

- **B-8.** A key save merges, and a delete wins. Task 1 encodes it.
- **X-13.** SQLite protects a read and a write only inside one transaction, and `BEGIN IMMEDIATE` is its recommendation for read-then-write. `runTransaction` in `config-repository.ts` already opens every transaction that way.
- **V-13 of the v8 plan.** A change of the key list restarts the gateway child once, and a restart drops requests in flight. Task 2 adds no reload without a restart.
- **V-10 of the v8 plan.** Nothing here touches the gateway fork.
- **Plan author, changeable in review without reopening the plan:** the poll interval of 1000 ms and the two-tick rule (Task 2), the wait of 10 000 ms and its 500 ms poll (Task 3), and the wording of the two messages (Task 3).

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

1. A caller that sends no `base` saves its key list. The save is refused with a message that says to reload, and nothing is written, because a delete from such a caller would otherwise be skipped while the save reported success (found in the review of PR 149). A caller that sends an empty `base` deletes nothing: an entry with a new id is added, and an entry whose id is stored is updated only when its token is the stored one. Task 1, Steps 1 and 3.
2. The user deletes the last key. The store is never left empty, and a new `local-gateway` key is generated. Task 1, Step 1.
3. A key revoked in one window is edited in another window that still shows it. The key stays revoked. Task 1, Step 1.
4. The process that owns the gateway saves a key itself. The gateway restarts once, through the save handler, and the poll does not restart it a second time. Task 2, Steps 1 and 4.
5. A gateway started from a config whose keys were never stored, which is every existing wire test, keeps running on that config while nobody writes a key. Task 2, Step 1, and the cases of `gateway-child-env-wire.test.mjs` in Step 6. A wire case on an empty store does write one today: a `loadAppConfig` call during the case stores a generated `local-gateway` key (run by the second audit, call site not traced). Step 6 stores the keys before the start so the baseline holds them.
6. A profile is switched off and on again while a window still shows its old key. That window's save neither deletes the new key nor writes the old token back. Task 1, Step 1.
7. A key changes at the moment the stored config cannot be loaded. The running gateway keeps its config. Task 2, Step 1.
8. The gateway restarts while a launch waits for it. The launch keeps waiting and does not start a second gateway. Task 3, Step 1.

## Rows this plan closes

| Row | Task |
|---|---|
| K-1 | Task 1 |
| K-2 | Task 2 |
| K-3 | Tasks 3 and 4. One question is under "Open with the owner". Task 4 was added on 2026-11-24 and does not wait on it |

## Not in this plan

- The API Keys page still shows the list from its last load or save. A key another process wrote appears after the page's next save or reload. After Task 1 a save from that older list loses nothing.
- A reload of the key list without a restart of the gateway child. It needs a fork change (V-13).
- A gateway that another process owns (`gatewayManagedExternally`). That process's owner runs the poll.
- Concurrent `startGateway` calls. `GatewayService.start` has no lock (read). Task 2 keeps the poll from adding one by the two-tick rule and does not add a lock. It clears a timer before it sets one, so two overlapping starts leave one timer.
- A key written between the moment a caller loads the config and the moment the service takes it. Task 2 reads its baseline when the service is given the config, so such a key is in the baseline and not in the child, and the poll does not see it. In the save handlers that window is the few calls between `saveApiKeysConfig` and `updateConfig` (read, not timed). The time the old child takes to stop is outside the window. The next key change or restart picks it up.
- A gateway from a version without Task 2. Task 3's wait runs its full length against it on every launch that created a key, then warns.
- An edit of a generated key that was never stored. After a load failure whose generated `local-gateway` key could not be written, the page holds a key the store does not. An edit of it is skipped as deleted elsewhere (read, not run).
- Two entries with one id in a saved list. No caller sends them (read). The second would replace the first.
- An entry whose token another stored row already holds under another id. The repository keeps the earlier row and drops the later one, as today's whole-list write does (read). No page sets a token.
- A message for a request the merge leaves out. A delete or an edit of a key that was made again elsewhere, and a rotation or a delete from a caller that sends an empty `base`, are skipped without one. The page then shows the stored list, so the user sees the result.
- A gateway the desktop app started for an app profile. `openCodexAppProfile`, `openOpenCodeAppProfile` and `openClaudeAppProfile` start the owner's gateway from a config whose key list is the profile's key alone (`launch-service.ts:207`, `:307`, `:395`, `:794-806`, read). After Task 2 the next change of the stored key list reloads that gateway from the stored config, so it then accepts every stored key. The plan first took the one-key start as intended. The research of 2026-11-24 changed that, and Task 4 now starts that gateway from the full key list.

## Conflicts with other plans

- **`2026-11-22-backlog-restore.md`** changes the return type of `saveApiKeys` to `AppSaveResult` in the same five files and in `persistApiKeys`, and keeps this plan's parameters. The two fit when this plan ships first, as the spec's order says.
- **The same plan's Task 2** adds statuses after `applyProfileConfig` in the save handlers. That call runs after `updateConfig` (`ipc.ts:386-387`, read) and can write keys. Today those writes change nothing, because `reconcileProfileApiKeys` ran first. If either plan moves the reconcile, the poll of Task 2 here sees the apply's write and reloads once.

---

### Task 1: Never replace the key table from a list read earlier (K-1)

First, because Task 2's reload would otherwise spread a list that a save from an older list had just damaged.

Today the API Keys page sends its whole list, and `saveApiKeysConfig` deletes every stored row and inserts that list. A change written since the page loaded, an added key or a removed one, is not kept, and a profile key is recreated with a new token, so the token just written into an agent's files stops working. `loadAppConfig` has the same shape on its write path: it reads the key table, and later replaces it inside a transaction that did not read it. After this task the page sends the list it started from beside the list it wants, and only its own changes are applied. No code path is left that replaces the table from a list read outside the transaction.

Key ids, read in the code. A key made in the UI gets `key_` plus 9 random bytes (`generateApiKeyId`, `packages/ui/src/pages/home/shared/api-keys.ts`). A profile key is `profile:<profile id>` (`profileApiKeyId`, `packages/core/src/profiles/api-key.ts`). The generated gateway key is `local-gateway` (`GENERATED_GATEWAY_API_KEY_ID`, `config.ts`). `id` is the table's primary key. A key that came from a legacy config file has a positional id (`key-1`, `key-2`), which is stable once stored.

Two ids are given again to a new key with a new token (read). A profile key is removed when its profile is switched off (`pruneInactiveProfileApiKeysFromList`) and made again as `profile:<id>` with a fresh token when it is switched on (`syncProfileApiKeys`). The `local-gateway` key is made again whenever the list becomes empty (`ensureGatewayApiKeys`). So an id alone does not say that a stored row is the key the caller saw. The merge treats a stored row as the caller's key only when both its `id` and its token match the caller's `base` entry.

**Files:**
- Modify: `packages/core/src/config/config.ts` (`saveApiKeysConfig`, the write in `loadAppConfig`, its load-failure fallback)
- Modify: `packages/core/src/config/config-repository.ts` (`replaceConfigSnapshot`, `replacePersistedConfigSnapshot`. Delete `replaceApiKeys` and `replacePersistedApiKeys`)
- Modify: `packages/electron/src/main/ipc.ts` (the `appSaveApiKeys` handler), `packages/electron/src/main/preload.ts` (`saveApiKeys`)
- Modify: `packages/core/src/web/management-server.ts` (the `saveApiKeys` RPC handler)
- Modify: `packages/ui/src/types/electron.d.ts`, `packages/ui/src/web-client-bridge.ts`, `packages/ui/src/pages/home/App.tsx` (`persistApiKeys`)
- Test: `packages/core/test/unit/config/config-credential-writes.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs`
- Test, callers of the deleted function: `packages/core/test/integration/profiles/profile-open-lookup.test.mjs` (1 call), `packages/core/test/integration/profiles/profile-service.test.mjs` (6 calls), `packages/core/test/unit/web/web-management-server.test.mjs` (1 call)

**Interfaces:**
- Produces: `saveApiKeysConfig(next: ApiKeyConfig[], base: ApiKeyConfig[]): Promise<AppConfig>` in `config.ts`. Both arguments are required in the type.
- Produces: `replacePersistedConfigSnapshot(value: unknown, updateApiKeys: (current: ApiKeyConfig[]) => ApiKeyConfig[], expectedRevision?: string): Promise<ApiKeyConfig[]>` and the same shape on `ConfigRepository.replaceConfigSnapshot`. It returns the stored list after the write.
- Produces: `saveApiKeys: (apiKeys: ApiKeyConfig[], base: ApiKeyConfig[]) => Promise<AppConfig>` on `window.llmr`.
- Removes: `replacePersistedApiKeys` and `ConfigRepository.replaceApiKeys`. `updatePersistedApiKeys` is the one way to write keys.
- Consumes: `updatePersistedApiKeys(update)`, which reads and writes inside one `BEGIN IMMEDIATE` transaction and writes only when the list changed.

- [ ] **Step 1: Write the failing tests for the save.** In `config-credential-writes.test.mjs`, add a helper and eight tests. The file's tests share one database, so each starts by setting the stored list.

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
```

  The second test of the file runs `saveApiKeysConfig([rotated], stale.APIKEYS)` beside two settings saves and asserts the stored list equals `[rotated]`. After this task that result depends on rule 1 dropping `revoked` by `base`, so a pass there is not the proof that the merge works. The new tests are.

  In the four existing tests of the file that call `saveApiKeysConfig`, every `saveApiKeysConfig([retained, revoked])` becomes `setKeys([retained, revoked])`, every `saveApiKeysConfig([retained])` becomes `saveApiKeysConfig([retained], stale.APIKEYS)`, and `saveApiKeysConfig([rotated])` becomes `saveApiKeysConfig([rotated], stale.APIKEYS)`. Their assertions do not change.

- [ ] **Step 2: Run the file and see the new tests fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/config/config-credential-writes.test.js`
Expected: the first new test fails with `saved.APIKEYS` equal to `[renamed, revoked]`, the second with `revoked` present, the fourth with `[added]` alone, the sixth with the first token stored, the seventh with `[retained]` alone, and the eighth with no name. The third and fifth can pass before the change.

- [ ] **Step 3: Implement `saveApiKeysConfig(next, base)` in `config.ts`.** Normalize both lists the way the function normalizes its one list today (`normalizeApiKeys(list, undefined)` without the seed key), after throwing an `Error` for a `base` that is not an array. The default seed key is also left out of the stored list the update returns, as the old whole-list write removed it. Then, inside `enqueueAppConfigWrite`, call `updatePersistedApiKeys((current) => ...)` and return `loadAppConfig()`. The update applies these rules, in this order, and is the whole algorithm:

  1. For each entry of `base` whose id is not in `next`: drop the `current` row with that id when its token equals the `base` entry's token. A row with another token was made again elsewhere and stays.
  2. For each entry of `next` that equals the `base` entry with the same id, do nothing. Two entries are equal when `createdAt`, `expiresAt`, `id`, `key`, `name` and every field of `limits` are equal, whatever order the fields of `limits` come in. `ApiKeyLimitConfig` is a flat record of numbers (read), so sorting its keys before a JSON comparison is enough.
  3. For each other entry of `next`:
     - Its id is in `current`. Replace that row in place when the row's token equals the `base` entry's token, or equals the entry's own token when `base` has no entry with that id. Otherwise leave the row, because the key was made again elsewhere and the caller edited one that no longer exists.
     - Its id is not in `current` and not in `base`. Append it.
     - Its id is in `base` and not in `current`. Skip it, because the key was deleted elsewhere and a delete wins.
  4. Pass the result through `ensureGatewayApiKeys`, so an empty list gets a generated key.

  Every other row of `current` keeps its content and its position. `ensureGatewayApiKeys` no longer runs on the caller's list before the write. A caller that rotates a key sends the new token under the id whose `base` token is still the stored one, so rule 3 replaces the row.

- [ ] **Step 4: Pass `base` through the chain.** One rule per file.
  - `ipc.ts`: the handler becomes `async (_event, apiKeys: ApiKeyConfig[], base: ApiKeyConfig[])` and calls `saveApiKeysConfig(apiKeys, base)`. The rest of the handler is unchanged.
  - `management-server.ts`: `saveApiKeys: async (apiKeys, base)` calls `saveApiKeysConfig(apiKeys as ApiKeyConfig[], base as ApiKeyConfig[])`.
  - `preload.ts`: `saveApiKeys: (apiKeys: ApiKeyConfig[], base: ApiKeyConfig[]) => invoke(IPC_CHANNELS.appSaveApiKeys, apiKeys, base)`.
  - `web-client-bridge.ts`: `saveApiKeys: (apiKeys, base) => rpc("saveApiKeys", [apiKeys, base])`.
  - `electron.d.ts`: `saveApiKeys: (apiKeys: ApiKeyConfig[], base: ApiKeyConfig[]) => Promise<AppConfig>;`.
  - `App.tsx`, `persistApiKeys`: take `const base = currentDraft.current.APIKEYS;` as the function's first statement, before any `await`, and call `window.llmr!.saveApiKeys(apiKeys, base)`. Its three callers build their list from `currentDraft.current` in the statement before the call, so this is the list the edit started from. The save runs later in `configSaveQueue`, after which `currentDraft.current` may hold another save's result, so do not read it inside the queued function. No UI test can reach `persistApiKeys`, because it lives inside the `App` component and no DOM test library is installed. `npm run typecheck` pins the two-argument call.

- [ ] **Step 5: Pin the web path.** In `web-management-server.test.mjs`, add `the saveApiKeys RPC applies only the caller's changes`. Start the server as the test `a profile save creates its key before the gateway starts...` does (`startWebManagementServer({ authToken, host: "127.0.0.1", port: 0, startGateway: false })`, with `gatewayService.start` and `gatewayService.updateConfig` mocked). Read `current = (await rpc(runtime.url, token, "getConfig")).value.APIKEYS`. Add a key with `updatePersistedApiKeys((keys) => [...keys, { createdAt: "2026-02-01T00:00:00.000Z", id: "elsewhere", key: "elsewhere-token" }])`. Call `rpc(runtime.url, token, "saveApiKeys", [[...current, { createdAt: "2026-02-02T00:00:00.000Z", id: "mine", key: "mine-token" }], current])`. Assert the returned `value.APIKEYS` ids include both `elsewhere` and `mine`. Then post `saveApiKeys` with `[[]]` and no base, and assert the answer is status 500 with the reload message and that `loadPersistedApiKeys()` still holds `elsewhere` and `mine`. Last, save the returned list without `elsewhere`, with the returned list as base, and assert `elsewhere` is gone and `mine` is kept. That delete is what proves the handler passes `base` on. The handler also applies profiles, as it does today, inside the test's temporary home.

- [ ] **Step 6: Write the failing test for the load path.** The research ran this shape as its case S3 and saw the loss. The test below was not run. In `config-credential-writes.test.mjs`, add `a config load that has to write keeps a key committed during the load`. It follows the child-process pattern of `config-concurrency.test.mjs`.

  1. Import `loadPersistedAppConfig` and `replacePersistedAppConfig` from `@llmr/core/config/config-repository.ts` and `APP_CONFIG_DB_FILE` from `@llmr/core/config/constants.ts`. `setKeys([retained])`, then store a config that forces the write: `await replacePersistedAppConfig({ ...(await loadPersistedAppConfig()), APIKEYS: [{ createdAt: "2026-01-01T00:00:00.000Z", id: "legacy", key: "legacy-token" }] })`.
  2. Spawn (`spawn`, not `spawnSync`) `process.execPath -e <script> APP_CONFIG_DB_FILE` with `ELECTRON_RUN_AS_NODE: "1"`. The script opens the file with `better-sqlite3`, runs `BEGIN IMMEDIATE`, inserts a row `('concurrent', '', 'concurrent-token', 'plain', '2026-03-01T00:00:00.000Z', '', '')` into `api_keys (id, name, encrypted_key, encryption, created_at, expires_at, limits_json)`, prints `locked`, and after 500 ms runs `COMMIT` and closes.
  3. When the child's stdout holds `locked`, `const loaded = await configApi.loadAppConfig();`. Wait for the child to exit with status 0.
  4. Assert `loaded.APIKEYS.map((key) => key.id)` equals `["retained", "concurrent", "legacy"]`, and that `(await configApi.loadAppConfig()).APIKEYS` has the same ids.

  Run it. Expected before the change: `concurrent` is missing.

- [ ] **Step 7: Merge inside the transaction.** In `config-repository.ts`, `replaceConfigSnapshot(value, updateApiKeys, expectedRevision)` keeps its revision check and its `replaceAppConfigRow` call. In place of `replaceApiKeyRows(database, normalized)` it does what `updateApiKeys` the method does: `const current = listApiKeys(database)`, `result = uniqueApiKeyConfigs(updateApiKeys(current))`, write only when the JSON differs, and return `result`. In `loadAppConfig`, the call becomes `replacePersistedConfigSnapshot(sanitized, (current) => ensureGatewayApiKeys(uniqueApiKeyConfigs([...current.filter((apiKey) => !isDefaultSeedApiKey(apiKey)), ...configFileApiKeys])), revision)`, and the returned list replaces `config.APIKEYS` and `config.APIKEY` (its first key, or `""`) before `config` is returned. The read at the top of `loadAppConfig` stays. It decides `shouldPersistApiKeys` and fills the config when no write happens.

- [ ] **Step 8: Remove the last table replace.** In the `catch` of `loadAppConfig`, keep the `persistedApiKeys.length === 0` condition, replace the `replacePersistedApiKeys(apiKeys)` call inside it with `updatePersistedApiKeys((current) => current.length ? current : apiKeys)`, and keep its `.catch` warning. When the update resolves, build the fallback config from `ensureGatewayApiKeys(returned.filter((apiKey) => !isDefaultSeedApiKey(apiKey)))`. The filter matters: another process can have stored the seed key since the read, and the fallback must never carry it. When the update rejects, the fallback keeps the generated list, as today. Delete `replacePersistedApiKeys` and `ConfigRepository.replaceApiKeys` from `config-repository.ts` and the import from `config.ts`. In the three test files listed under Files, each `replacePersistedApiKeys(list)` becomes `updatePersistedApiKeys(() => list)`. `replaceApiKeyRows` stays, as the private writer both transactions use.

- [ ] **Step 9: Verify.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/config/config-credential-writes.test.js .test-dist/core/test/unit/web/web-management-server.test.js`
Expected: every test passes, 0 fail.
Run: `grep -rn "replacePersistedApiKeys\|\.replaceApiKeys(" packages tests --include="*.ts" --include="*.tsx" --include="*.mjs" | grep -v node_modules`
Expected: no output. The three test files also import the deleted function (`profile-open-lookup.test.mjs:8`, `profile-service.test.mjs:15`, `web-management-server.test.mjs:1008`), and the import lines change with the calls.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron`
Expected: all pass.

- [ ] **Step 10: Commit.** Subject: `fix(config): apply only the caller's own changes when API keys are saved, and merge keys inside the load's transaction`

---

### Task 2: Reload the gateway when the stored key list changes (K-2)

After Task 1, because the reload trusts the stored list.

The gateway child gets its keys once, at spawn. When another process writes a key, for example `llmr <profile>` while the desktop app runs the gateway, the running gateway keeps the key list it started with until something restarts it, so an added key and a removed key do not take effect. After this task the process that owns the gateway reads the stored key list once a second while the gateway runs, and reloads its stored config once when the list has changed. A key added elsewhere works, and a key revoked elsewhere stops working, within a few seconds and one child restart (V-13).

**How the poll tells its own write from another's.** It does not compare the stored list with the config the service holds. Callers mutate that config in place (see the comment on `holdConfig`), and a service started from a config whose keys were never stored, which is every wire test, would be reloaded onto the stored config. It compares the stored list with the stored list as it was when the service last took a config. Five rules follow.

1. **Baseline.** The service reads the stored list and remembers its JSON as early as it is given a new config: at the top of `startGateway`, before the old child is stopped, and in `updateConfig` before the route scripts are prepared. The first build read it after `holdConfig`. A review of PR 150 moved it, because stopping the old child takes time and a key written meanwhile was inside the baseline and not in the new child. Every key save in the owning process ends in `updateConfig` or `start` (read in `ipc.ts` and `management-server.ts`), so its own write is inside the new baseline. The baseline is not read at the end of a start. A start takes seconds, the child gets the keys of the config it was started with, and a key written during the start has to stay outside the baseline so the poll sees it once the gateway runs. A restart after a crash starts from the config the service already holds (`scheduleCoreRestart`), so it takes no new baseline, and a key written while the child was down is seen after the restart.
2. **Two ticks.** A changed list must be seen unchanged on two ticks in a row before the poll acts. A save handler writes the key and calls `updateConfig` some milliseconds later. Without this rule a tick between the two would schedule a second restart beside the handler's own. The rule does not rule out two restarts in every order. When the poll's reload restarts first and a handler's `updateConfig` then passes a config that differs from it, the gateway restarts again (inferred, a matter of timing).
3. **Once per change, and again after a failure.** When the poll acts it sets the baseline to the list it acted on. When that reload fails while the gateway still runs, the baseline is set to a value no stored list equals and the poll waits a minute, then reloads again. The wait covers the list whose reload failed: a list that has changed since is reloaded without it. The same failure is logged once. The poll's failure is kept apart from the error a requested reload reports to its caller, so neither is taken for the other. The first build did not try again. Reviews of PR 150 changed that, because a removed key would otherwise stay accepted until the next key change, and set the wait, because a stored config that cannot be loaded logs a line on every load.
4. **Never onto a config that would stop the gateway.** Before the poll's reload restarts a running child, it checks that the stored config would run the gateway and has a model to serve. If not, the reload is refused and counts as a failure under rule 3. The running gateway then keeps the key list it started with, as it did before this task, until the stored config can run. Stopping the gateway in that case is the other choice, and it is the owner's to make (see "Open with the owner"). Without this a key change in another process could stop a working gateway whose held config differs from the stored one, and that stop was counted as a success (found in the review of PR 150).
5. **A read that fails.** A failed read of the stored list is logged once per run of failures. At a baseline it keeps the older baseline, so a change is reloaded later and not taken as applied.

The reload is the existing `reloadPersistedRuntimeConfig`, which loads the stored config and restarts when `runtimeGatewayConfigSignature` differs. That signature includes `APIKEYS`. `loadAppConfig` does not throw when the stored config cannot be loaded. It returns the default config, marked so that `appConfigLoadError` reports the failure. Today the revision comparison keeps that default config away from a running gateway. The poll passes no revision, so the reload itself must refuse a config that carries a load error.

The reload loads the bare stored config, as the child-requested reload already does. The owner's start paths first run `syncClaudeAppGatewayConfig` and `reconcileProfileApiKeys`, and both store what they change (read), so the stored config is the one those paths start from. The wire test of Step 6 does not cover a Claude apps gateway config.

Cost, not measured: one `SELECT` on `api_keys` per second on the owner's main thread, and a wake-up each second in an otherwise idle desktop app.

**Files:**
- Modify: `packages/core/src/gateway/application/gateway-service.ts`
- Create: `packages/core/test/unit/gateway/stored-api-keys-watch.test.mjs`
- Test: `packages/core/test/integration/gateway/gateway-child-env-wire.test.mjs`

**Interfaces:**
- Consumes: `loadPersistedApiKeys(): Promise<ApiKeyConfig[]>` from `@llmr/core/config/config-repository`, and `updatePersistedApiKeys` in tests.
- Produces, all private members of `GatewayService`: `storedApiKeysBaseline?: string`, `storedApiKeysPending?: string`, `storedApiKeysTimer?: NodeJS.Timeout`, `rememberStoredApiKeys(): Promise<void>`, `checkStoredApiKeys(): Promise<void>`. Module constant `storedApiKeysPollMs = 1000`.
- Changes: `schedulePersistedRuntimeConfigReload(expectedRevision: string | undefined, forceRestart: boolean)` and `reloadPersistedRuntimeConfig(expectedRevision: string | undefined, forceRestart: boolean)`. With `undefined` the revision check is skipped. For every caller, a loaded config that carries a load error is refused.
- Consumes: `appConfigLoadError(config)` from `@llmr/core/config/config`.

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

test("a key written while the gateway starts is reloaded once it runs", async () => {
  await updatePersistedApiKeys(() => [first]);
  const service = new gatewayService.constructor();
  const reloads = [];
  service.schedulePersistedRuntimeConfigReload = (revision, force) => { reloads.push([revision, force]); };
  service.routeScriptRuntime.prepare = async () => {
    await updatePersistedApiKeys((current) => [...current, second]);
    return [];
  };
  await service.start(createDefaultAppConfig());
  service.child = {};
  service.status = { coreEndpoint: "", endpoint: "", networkEndpoints: [], state: "running" };
  await service.checkStoredApiKeys();
  await service.checkStoredApiKeys();
  assert.deepEqual(reloads, [[undefined, false]]);
});

test("a reload whose config load failed leaves the running gateway alone", async () => {
  const { service } = await runningService([first]);
  const taken = [];
  service.start = async (config) => { taken.push(config); return service.getStatus(); };
  service.updateConfig = async (config) => { taken.push(config); };
  await loadAppConfig();
  const database = new Database(APP_CONFIG_DB_FILE);
  assert.equal(database.prepare("UPDATE app_config SET value_json = '{' WHERE key = 'default'").run().changes, 1);
  database.close();
  await service.reloadPersistedRuntimeConfig(undefined, false);
  assert.deepEqual(taken, []);
  assert.ok(service.runtimeConfigReloadError);
});
```

  The sixth test's setup was run by the second audit: the stub ran once inside the start, and the start ended `stopped`. It imports `createDefaultAppConfig` from `@llmr/core/config/default-config.ts` and does not call `service.stop()`, which would call `kill` on the stand-in child. `routeScriptRuntime.prepare` is the first call of `startGateway` after `holdConfig` (`gateway-service.ts:179-181`), so a write inside its stub lands after the baseline and before the end of the start. A start from `createDefaultAppConfig()` ends in state `stopped` without a child, as `gateway-status.test.mjs` shows, so the test sets the running state itself. It fails on an implementation that reads the baseline where the state becomes `running`.

  The seventh test is the last of the file, because it leaves the file's stored config unreadable. It imports `Database` from `better-sqlite3` and `APP_CONFIG_DB_FILE` from `@llmr/core/config/constants.ts`. `'default'` is the value of `appConfigKey` in `config-repository.ts` (read). It also imports `loadAppConfig` from `@llmr/core/config/config.ts`. No earlier test of the file stores a config row, so the test loads the config once to write it, and asserts that the update changed one row (run by the second audit). An unparseable row makes `loadAppConfig` return its marked fallback (run, `config.ts:372-391`). `runningService` leaves `service.config` unset, so an implementation that skips the revision check without refusing a load error calls `start` with the fallback.

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/stored-api-keys-watch.test.js`
Expected: FAIL with `service.rememberStoredApiKeys is not a function`.

- [ ] **Step 3: Implement the two methods in `gateway-service.ts`.**
  - `rememberStoredApiKeys()` sets `storedApiKeysBaseline = JSON.stringify(await loadPersistedApiKeys())` and clears `storedApiKeysPending`. A read that throws leaves the baseline undefined.
  - `checkStoredApiKeys()` returns at once unless `this.status.state === "running"`, `this.status.gatewayManagedExternally` is not set, and `this.child` or `this.server` exists. It reads the stored list's JSON as `seen`. With no baseline it sets the baseline to `seen` and returns. When `seen` equals the baseline it clears the pending value. When `seen` differs from the pending value it sets the pending value to `seen`. Otherwise it sets the baseline to `seen`, clears the pending value and calls `this.schedulePersistedRuntimeConfigReload(undefined, false)`. A read that throws is swallowed, so the next tick tries again.
  - `holdConfig` is unchanged. It is synchronous and has callers that need no baseline.
  - `reloadPersistedRuntimeConfig`: right after `loadAppConfig()`, throw an `Error` that carries `appConfigLoadError(nextConfig)` when it is set. The existing `catch` records and logs it, and nothing is started. Then skip the revision comparison when `expectedRevision` is `undefined`. Its two other callers pass a string. For them a fallback config already failed the revision comparison, so only the recorded message changes.

- [ ] **Step 4: Wire the timer and the baseline.**
  - `startGateway`: right before `await this.stopGateway({ nextConfig: config })`, `if (recoveryGeneration === undefined) await this.rememberStoredApiKeys();`. Where it sets `state: "running"` near its end, `clearInterval(this.storedApiKeysTimer)` and then start `storedApiKeysTimer = setInterval(() => { void this.checkStoredApiKeys(); }, storedApiKeysPollMs)` with `.unref()`.
  - `updateConfig`: on its non-restart path, before `routeScriptRuntime.prepare`, `await this.rememberStoredApiKeys()`. The restart path goes through `startGateway`.
  - `stopGateway`: clear the timer first and set the field to `undefined`. It leaves the baseline alone, so the recovery path keeps it.
  - `markExternalGatewayRunning` needs nothing. `checkStoredApiKeys` returns for a gateway another process owns.

- [ ] **Step 5: Run the unit tests.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/stored-api-keys-watch.test.js .test-dist/core/test/unit/gateway/core-restart.test.js`
Expected: every test passes, 0 fail.

- [ ] **Step 6: Write the wire test for both layouts.** In `gateway-child-env-wire.test.mjs`. The reload loads the stored config, so this case must start from one. Add a fourth parameter to the file's `startGateway(t, layout, edit, { stored = false } = {})`. In every case, after `edit?.(config)` and before the start: `await updatePersistedApiKeys(() => config.APIKEYS)`, so the store is not empty and nothing writes a generated key while the gateway runs. When `stored` is true, also `await replacePersistedAppConfig({ ...config, APIKEY: "", APIKEYS: [] })`, then start the service with `await loadAppConfig()` and return that config's `gateway.port` and `gateway.corePort`. The file gains imports of `loadAppConfig` (`@llmr/core/config/config.ts`) and of `replacePersistedAppConfig` and `updatePersistedApiKeys` (`@llmr/core/config/config-repository.ts`). The other cases call the helper as before and stay unchanged, which is Review Focus 5.

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
    while (Date.now() < deadline && !(gateway.service.getStatus().state === "running" && await status("sk-added-key-0004") === 200 && await status("sk-good-key-0001") === 401)) {
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

  The last four lines are Review Focus 4 on the wire: one restart per change, and none after it. The loop also waits for the state `running`. In the compat layout LLM Router's own front answers from the stored keys while the child is still restarting, so without that condition the pid is read in the middle of the restart (run by the builder: the case failed there). Note the time between the write and the first 200 in the PR description. Task 3's wait is checked against it. Measured on the build of 2026-11-24: 2328 ms in the single layout and 1792 ms in the compat layout, where that time is the front accepting the key and not the end of the restart.

- [ ] **Step 7: Run the wire file with the real gateway entry.**

Run: `node build/test.mjs core && LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" node --test .test-dist/core/test/integration/gateway/gateway-child-env-wire.test.js`. That is the value `.github/workflows/test.yml` sets. Without it every case of the file is skipped.
Expected: every case passes in both layouts, 0 fail, 0 skipped. To see the new case fail first, run it with Step 4 reverted. Run by the builder: the single layout then keeps refusing the added key, and the compat layout accepts the added key at once and keeps accepting the revoked one.

- [ ] **Step 8: Run the gates.**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`
Expected: all pass. `npm run test:core` matters here beyond the new files. Any core test that starts a real gateway for more than two seconds and writes a key without giving the service a new config would now be reloaded onto the stored config. A `loadAppConfig` call on an empty store is such a write, and the wire file had one until Step 6 stored its keys first. The other core tests that start a real gateway were not searched for it, and the whole core suite then ran with `LLMR_TEST_GATEWAY_ENTRY` set and passed (2074 pass, 0 fail, 2026-11-24). If one fails, stop and report it before changing the test.

- [ ] **Step 9: Commit.** Subject: `fix(gateway): reload when another process changes the stored API keys`

---

### Task 3: Wait for the profile's own key before using another one (K-3)

Last, because the wait only ends well once Task 2 makes the gateway pick the key up.

`llmr <profile>` applies the profile in its own process, which can create the profile's key, and probes the running gateway milliseconds later (`cli.ts`, `ensureProfileGateway`). The gateway does not know the key yet, so the probe goes on to the other stored keys (`existingGatewayApiKeyCandidates`, `launch-service.ts`) and the agent is launched on the first one the gateway accepts. Nothing says so. The agent then runs its session on a key that is not the profile's, so settings that are matched by the profile's key id are not the ones in effect, and Logs name another key. Task 2 alone does not change this, because the reload takes seconds and the probe does not wait (read, not run). After this task the launch says that it waits, and waits up to 10 seconds for the gateway to accept the profile's key. If it still does not, the launch falls back as today and prints one warning.

The wait is waiting for Task 2's restart of the owner's gateway, so the gateway goes away and comes back while the launch waits. A probe in that gap finds no gateway. Handled as today, that result throws `ProfileGatewayUnavailableError`, and `cli.ts:168-186` answers that error by starting a service of its own on the port the owner is about to bind again (read). So inside the wait, no probe result ends the wait except the profile's key being accepted. Each probe of the wait sends the profile's key alone. A full probe sends every stored key in turn, and since v8.1.0 each refused one is a row in Logs and a count on the key (read, not run).

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts` (`ensureProfileGateway`, `ensureGatewayConfigRunning`)
- Test: `packages/core/test/unit/profiles/profile-gateway-probe.test.mjs`

**Interfaces:**
- Changes: the options of `ensureProfileGateway` and `ensureGatewayConfigRunning` gain `profileKeyWaitMs?: number`, default `10_000`. Callers in `cli.ts` and in `launch-service.ts` pass nothing.
- Changes: `probeExistingProfileGateway(config, profile, candidateConfig, apiKeys?: string[])`. When `apiKeys` is given it is the whole candidate list.
- Consumes: the `usable` result of that probe, which carries the accepted `apiKey`. Inside `ensureGatewayConfigRunning`, `config.APIKEY` is the profile's own token (`profileGatewayConfigFor`).

- [ ] **Step 1: Write the failing tests.** In `profile-gateway-probe.test.mjs`. All three use a config with two keys, built from the file's `claudeProfileConfig()`: `config.APIKEY = "primary-token"` and `config.APIKEYS = [{ createdAt: "2026-01-01T00:00:00.000Z", id: "primary", key: "primary-token" }, <the profile key the helper already makes>]`. The `fetch` stub answers `/health` as the first test of the file does, and `/v1/models` by the bearer token.

```js
test("a profile launch waits for the gateway to accept the profile's own key", async (t) => {
  let profileProbes = 0;
  let primaryProbes = 0;
  // stub: "Bearer profile-token" answers 401 for its first two probes and 200 after, "Bearer primary-token" answers 200
  const info = t.mock.method(console, "info", () => {});
  const warn = t.mock.method(console, "warn", () => {});
  const result = await ensureProfileGateway(config, profile, "Local subscription router", { profileKeyWaitMs: 5000, reuseExisting: true, startIfMissing: false });
  assert.equal(result.APIKEY, "profile-token");
  assert.equal(profileProbes, 3);
  assert.equal(primaryProbes, 1);
  assert.equal(info.mock.callCount(), 1);
  assert.match(String(info.mock.calls[0].arguments[0]), /Waiting for the gateway to accept the key of profile "Claude Main"/);
  assert.equal(warn.mock.callCount(), 0);
});

test("a gateway that restarts during the wait is waited for, not replaced", async (t) => {
  // stub: "Bearer primary-token" answers 200. "Bearer profile-token" answers 401 on its first probe and 200 on its next.
  // For the whole first poll of the wait, every fetch rejects with new TypeError("fetch failed"), /health included,
  // so that poll never reaches /v1/models. The second poll finds the gateway back and the profile key accepted.
  t.mock.method(console, "info", () => {});
  const start = t.mock.method(gatewayService, "start", async () => ({ state: "error" }));
  const result = await ensureProfileGateway(config, profile, "Local subscription router", { profileKeyWaitMs: 5000, reuseExisting: true });
  assert.equal(result.APIKEY, "profile-token");
  assert.equal(start.mock.callCount(), 0);
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

  The first and second tests take about one second of real time each, two polls of 500 ms. In the first, `primaryProbes` is 1 because only the first probe sends the whole key list. The second test leaves `startIfMissing` at its default and imports `gatewayService` from `@llmr/core/gateway/service.ts`, the facade `launch-service.ts` uses, so an implementation that handles the failed poll as today calls the mocked `start` and the count is 1.

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/profile-gateway-probe.test.js`
Expected: the first and second fail with `result.APIKEY` equal to `"primary-token"`, the third with a warn count of 0. The second audit ran the fixture on today's code and saw that key and no warning.

- [ ] **Step 3: Implement the wait and the warning in `launch-service.ts`.** `probeExistingProfileGateway` takes the optional `apiKeys` list and uses it in place of `existingGatewayApiKeyCandidates(...)` when it is given. In `ensureGatewayConfigRunning`, at both places where `probeExistingProfileGateway` returns `usable` with an `apiKey` that is not `config.APIKEY`, and `profileKeyWaitMs` is above 0:

  1. Print once, with `console.info`: `[profile] Waiting for the gateway to accept the key of profile "<profile.name || profile.id>".`
  2. Until `profileKeyWaitMs` has passed: wait 500 ms, then probe with `[config.APIKEY]` as the only candidate. A `usable` result ends the wait with the profile's key. Every other result, `unavailable` included, keeps waiting.
  3. When the time is up, probe once more with the full candidate list and handle that result as that call site handles its probe today.

  With `profileKeyWaitMs` at 0 the first result is used as it is today. Two limits, both read. The time bounds when a probe starts, not how long it runs: one probe can take several seconds against a port that accepts and does not answer, because each request is tried three times at 1200 ms. And a restart of the owner's gateway that is still under way when the time is up is handled as no gateway, as today. A launch against a gateway that will never take the key waits the full time, and the line of point 1 is what the user sees meanwhile. In `ensureProfileGateway`, where `result.acceptedApiKey !== result.config.APIKEY` already selects the fallback, call `console.warn` once with `[profile] The running LLM Router gateway did not accept the key of profile "<profile.name || profile.id>". This launch uses another key the gateway accepts, so the profile's model list does not apply to it. Restart the gateway to fix this.` The message never holds a key or part of one.

- [ ] **Step 4: Verify.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/profile-gateway-probe.test.js`
Expected: every test passes, 0 fail. The five existing tests of the file use one key that is accepted, so they never wait.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:cli`
Expected: all pass.

- [ ] **Step 5: Check the wait against Task 2's measurement.** If the time Task 2, Step 6 recorded between a key write and its first 200 is above 8 seconds, raise the default so it is that time plus 2 seconds, and say so in the PR description.

- [ ] **Step 6: Commit.** Subject: `fix(profiles): wait for the gateway to accept a profile's key before launching on another one`

---

### Task 4: Start an app profile's gateway from the full key list (K-3)

Added on 2026-11-24, after the research of that day. It is its own PR and can be built before or after Task 3. Build it before Task 3 if the owner answers the second question below with (b), because it removes the one case Task 3's wait cannot fix.

`ensureGatewayConfigRunning` starts the gateway from the config it is given (`launch-service.ts:463`). For an app-profile open that is the config `profileGatewayConfigWithToken` builds: the caller's config with `APIKEY` set to the profile's token and `APIKEYS` replaced by one new entry that holds the token, the profile's key id, a name and a new `createdAt` (`:794-806`). The entry has no `limits` and no `expiresAt`. Three opens reach that start: `openOpenCodeAppProfile` and the Codex-compatible open through `ensureProfileGateway` (`:207`, `:307`), and `openClaudeAppProfile` directly (`:395`). All read. The CLI's own launch does not reach it, because it passes `startIfMissing: false` (`cli.ts:164-167`, `:183-186`, read). A Codex app launch from the CLI goes through the service's `openProfile` (`cli.ts:142-155`, read) and does.

After such an open the gateway holds one key until its next reload. Run, 2026-11-24: in the single layout a second stored key answered 401 at the start and five seconds later. In the compat layout it answered 200, because the front also accepts the stored keys (`api-key-authorizer.ts:157-165`, read). So the one-key list separates nothing in the compat layout, and in the single layout it refuses the keys of every other profile. The files the open writes still need the profile's token as `APIKEY` and as the first entry of `APIKEYS` (read by the researcher at `claude-app/gateway-service.ts:338` and `toolhub-config.ts:187`, not traced further). Nothing found needs the gateway itself to hold one key (inferred).

After this task the gateway is started from the config before the narrowing, and the open still hands the narrowed config to everything else.

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts` (`ensureGatewayConfigRunning`, `openClaudeAppProfile`)
- Test: `packages/core/test/unit/profiles/profile-gateway-probe.test.mjs`

**Interfaces:**
- Changes: none in a signature. `ensureGatewayConfigRunning` already takes `candidateConfig`, the config before the narrowing, and `ensureProfileGateway` already passes it.
- Consumes: `gatewayService.start` from `@llmr/core/gateway/service.ts`, the facade `launch-service.ts` uses.

- [ ] **Step 1: Write the failing test.** In `profile-gateway-probe.test.mjs`, with the two-key config of Task 3, Step 1, and `limits: { rpm: 5 }` added to the profile's entry. If Task 3 is not built yet, build that config here from `claudeProfileConfig()`. Add `import { gatewayService } from "@llmr/core/gateway/service.ts";` to the file's imports, which it does not have today.

```js
test("an app profile's gateway is started with every stored key and the open still gets the profile's key", async (t) => {
  const start = t.mock.method(gatewayService, "start", async () => ({ state: "running" }));
  const result = await ensureProfileGateway(config, profile, "OpenCode App");
  assert.equal(start.mock.callCount(), 1);
  const started = start.mock.calls[0].arguments[0];
  assert.equal(started.APIKEY, "primary-token");
  assert.deepEqual(started.APIKEYS.map((apiKey) => apiKey.id), ["primary", "profile:claude-main"]);
  assert.deepEqual(started.APIKEYS[1].limits, { rpm: 5 });
  assert.equal(result.APIKEY, "profile-token");
  assert.deepEqual(result.APIKEYS.map((apiKey) => apiKey.key), ["profile-token"]);
});
```

  The test passes no `reuseExisting`, so no probe runs and no `fetch` stub is needed. `rpm` is a field of `ApiKeyLimitConfig` (`contracts/app.ts:1679-1692`, read).

- [ ] **Step 2: Run and see it fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/profile-gateway-probe.test.js`
Expected: the new test fails at `started.APIKEY`, which is `"profile-token"` today. Inferred, not run.

- [ ] **Step 3: Implement.** In `ensureGatewayConfigRunning`, `gatewayService.start(config)` becomes `gatewayService.start(candidateConfig)`. The function still returns `config`. In `openClaudeAppProfile`, the call becomes `ensureGatewayConfigRunning(profileGatewayConfig, profile, "Claude App", {}, config)`. Nothing else changes. `profileGatewayConfigWithToken` stays, because the writers use it.

  What changes besides the key list, all read by the audit of 2026-11-24. Say each in the PR description.

  - **The stored expiry and limits of the profile's key now apply in the single layout.** The narrowed entry had neither, so a profile key past its `expiresAt` is accepted there today and refused after this task (`supervisor.ts:438-443`). The compat front already applies both.
  - **The gateway's own ToolHub and media tool servers use the first stored key in place of the profile's token.** They are built from the started config on every start (`config-compiler.ts:122-123`, `toolhub-config.ts:187`, `grok-media-config.ts:45`). That key is accepted, and their requests are counted under its id.
  - **No case found where the profile loses its settings.** `findProfileApiKey` falls back to the first stored key, then to `config.APIKEY`, when the store has no entry with the profile's key id (`launch-service.ts:2169-2172`). Every open applies the profiles first (`:162`), which stores an entry for each enabled profile, and only an enabled profile can be opened. The fallback is reached only with the global profile switch off, where no key maps to a profile before or after this task. Not traced: `context-archive.ts:413`, `:426`, which match key ids without that switch.

- [ ] **Step 4: Verify.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/profile-gateway-probe.test.js`
Expected: every test passes, 0 fail.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`
Expected: all pass.

- [ ] **Step 5: Commit.** Subject: `fix(profiles): start an app profile's gateway with every stored key`

Not in this task. An open still stops the running gateway and starts it again, because `start` always does (read by the researcher at `gateway-service.ts:173-193`). Skipping the start when the running gateway already serves this config is a separate change. What the real apps do after the change is a check for the owner's VM.

---

## Open with the owner

**What should the gateway do when its keys changed in the store and the stored config would not run it? (Task 2, rule 4)**

This happens only when the running gateway was started from a config that differs from the stored one.

- (a) Keep running on the key list it started with, log the failure once and try again each minute. Task 2 is built this way. A key removed elsewhere stays accepted by this gateway until the stored config can run or the gateway is restarted, which is what happened before Task 2 in every case.
- (b) Stop the gateway. No removed key stays accepted. A key change in another process then takes a working gateway down.

- (c) Restart on the config the gateway holds, with only the stored key list put in its place. A removed key stops being accepted and a working gateway is not stopped. Found by the research of 2026-11-24, which sizes it at about three lines and a test. Not built. **Prototyped by a run, 2026-11-24** (a throwaway wire test against the real gateway child in a temporary home, and a five-line change to `reloadPersistedRuntimeConfig`, both removed afterwards). The gateway started from a stored config with key A. Another process then stored a config with the gateway disabled and replaced A with B. The gateway restarted on the config it held, with the stored `APIKEY` and `APIKEYS` put in: B answered 200 and A answered 401 after 2329 ms (single) and 2024 ms (compat), and the gateway was still running 3.5 s later. Both fields must be swapped, because `configuredApiKeysFromConfig` also accepts `APIKEY` (read). Not checked: what the gateway child uses the first key of the list for.

Recommendation: (c), with the refusal also shown in the gateway status. It first read (a). The two automated reviews of PR 150 disagreed on (a) and (b): the error-handling review rated the stop as the more serious fault, and the commit security review asked for the stop.

Research of 2026-11-24, read in the code at `8c75afb1` and not run:

- **How it is reached.** A process that does not own the gateway saves a config that disables the gateway or removes its last model, for example `llmr serve --no-gateway`. Its key reconcile, or any later key change, then sets off the owner's poll, and rule 4 refuses (inferred). The owner's own save handlers store first and then hand over the stored config (`ipc.ts:324-366`, `:381-386`, `management-server.ts:494-532`), so they cannot cause it. An app-profile open starts the gateway from a one-key config, and the stored config still runs, so rule 4 does not fire there.
- **How long it lasts.** Until the stored config can run again, a save in the owner, a restart or a quit.
- **Where it shows.** One `console.error` line. `getStatus` does not carry it, and the UI shows `lastError` only when the gateway is not running (`App.tsx:727`).
- **The requested reload differs.** A reload another process asks for has no such check, so it takes a disabled stored config and stops the gateway (`gateway-service.ts`, `reloadPersistedRuntimeConfig`).

Second research round, 2026-11-24, read at `1d3c1d46` and not run. The recommendation stays (c), with two changes to it:

- **Keep only the held keys that are still stored, with their stored fields, and add none.** The run above put the whole stored list in. A stored key whose profile the held config does not have would then be accepted with no profile, so no allowed model list and no Claude login routing would apply to it (inferred: a key is matched to its profile by key id). Removing a key is the case this question is about, and that still works. If no held key is left, the gateway runs and refuses every key, and the gateway status should say so.
- **Give the requested reload the same check in the same change.** The check at `gateway-service.ts:791` covers the poll only (read). Without it the next requested reload stops the gateway that (c) kept running.

Also read: the runtime-config control route needs the gateway's primary key (`router-plugin.ts:741`), and another process sends the first stored key, so taking `APIKEY` from the store keeps that route usable. The gateway's ToolHub and media tool servers take the first key and are built again from the started config on every start (`config-compiler.ts:122-123`, read by the audit), so they follow the swap.

**What should a profile launch do when the gateway still refuses the profile's own key after the wait? (K-3, Task 3)**

- (a) Fall back to another accepted key and print the warning. Task 3 is written this way. The agent starts, on a key that is not the profile's.
- (b) Refuse the launch with an error that says to restart the gateway. No session ever runs on another key. A user whose gateway is stale for a reason Task 2 does not cover cannot launch until they restart it.
- (c) Keep today's behaviour and only add the warning, with no wait. A launch right after a profile's first apply then always runs on another key.

- (d) Refuse only for a Claude Code profile in Claude login mode, and fall back with the warning for the others. Found by the research of 2026-11-24. It is the least that makes that mode correct.

Recommendation: (b). It first read (a). The research of 2026-11-24 changed it, read in the code at `8c75afb1` and not run:

- **Claude login mode does not work on another key.** A request is sent on with the user's Claude login only when the key it carries belongs to a Claude Code profile in that mode (`claude-login-pass-through.ts:65-69`). On another key the request is routed as an ordinary one: it is refused, or answered by another provider when the routing has one.
- **The profile's settings follow the key.** The allowed model list, the default model, the agent routes, the limits and expiry, and the name in Logs are all those of the key the launch ended on.
- **The launch writes that key into the agent's files.** `applyProfileRuntimeConfig(launchConfig, profile, launchConfig.APIKEY)` (`cli.ts:190`) writes it into the agent's settings and helper files, where it stays until the next apply.
- **One case the wait cannot fix.** After the desktop app starts its gateway for an app profile, that gateway holds one key and the stored list has not changed, so no reload comes and the profile's key is never accepted. **Checked by a run, 2026-11-24** (a throwaway wire test in a temporary home, deleted afterwards): the store held keys A and B and the gateway was started with A alone. In the single layout B answered 401 at the start and 401 five seconds later, with the same child. In the compat layout B answered 200 both times, so this case is the single layout's. The compat front accepts the stored keys next to the ones the gateway was started with (`api-key-authorizer.ts:157-165`, read).
- **What is left after Task 2.** A gateway from a version without the poll, a gateway another process owns, a refused or failed reload. Each needs a restart, which is what the error of (b) says.

Second research round, 2026-11-24, read at `1d3c1d46` and not run. The recommendation stays (b), and Task 4 should ship with it:

- **The case the wait cannot fix has a cause, and Task 4 removes it.** Without Task 4, (b) refuses every `llmr <profile>` launch of another profile after an app-profile open in the single layout, until the gateway is restarted.
- **The fallback there ends on another profile's key.** The candidates are every stored key (`existingGatewayApiKeyCandidates`, `launch-service.ts:631-643`), so the launch is accepted on the key of the profile the app was opened for, and that profile's settings apply to it.
- **(d) is weaker than (b).** In the other modes the fallback still starts the agent on whichever key answers first and writes that key into the agent's files.
- **Who sees the refusal.** Only `cli.ts:164` and `:183` pass `reuseExisting`, so it is every `llmr <profile>` launch, the desktop app's "open in terminal" included. The message prints in a terminal. The desktop and management-server opens never reach it.
- **One more change under (b).** A gateway that is still restarting when the wait ends is handled as no gateway, and `cli.ts:168-186` then starts a service of its own. Under (b) that result is a refusal too.

Task 3 is written for (a) and does not wait on the answer. If the owner picks (b), Step 3's warning becomes a thrown `Error` with the same text, the second test asserts the rejection, and an `unavailable` result of the last probe throws the same `Error` in place of `ProfileGatewayUnavailableError`. If (c), the wait and the first test are dropped.
