# Backlog: Client Label Implementation Plan

> **Built, 2026-11-27.** Tasks 3, 1 and 2 merged in PR 174 (`1768107e`), with Task 5 of the gateway phase 0 plan as the batch's last task. That task replaced the marked-key row of the label rule, so the e-mail is no longer a client label: it is in a field of its own. What the build corrected and what its reviews left open is in [`2026-11-25-delivery-order.md`](../2026-11-25-delivery-order.md) under "Before a batch is built" and "Findings with no task". The text below is as the audit left it before the build.

> **Status, 2026-11-27: text audit done by building, not built for the product.** A second model built Tasks 3, 1 and 2 from this text at `main` `c8efa3a5`, test-first, in a throwaway worktree, and corrected the text where it was wrong. No step failed to build and no planned test expected a wrong result. It ran the rule on the wire in both layouts with request logs on, off and with body capture `none`: a marked key with and without identity headers, an unmarked key that sends identity headers and its own `x-auth-sub` and `x-auth-api-key-id`, a profile key carrying the mark, a caller with a wrong key and one with no key that send every label header, and a label over 120 characters from each source. Every expected label held. It ran 23 mutants of the rule against the planned tests: 20 were killed, two are killed only by a request and an assertion this audit added to Task 2 Steps 1 and 2, and one fails no test. It read the trace's client headers from the spool in every mode: the three identity header values and `x-auth-sub` are readable where the import reads them. Not run: the desktop app, the web page in a browser, the Docker harness, `npm run test:electron`, a save from two real windows, and two processes opening one database at the same instant. "Behaviour the audit measured" below lists what the rule does that the tasks did not say. Read "Open with the owner" first. The accepted Claude apps gateway management spec plans the same key mark (its G-5) and moves the e-mail out of `client` (its G-6).

> **Delivery, 2026-11-25.** [`2026-11-25-delivery-order.md`](../2026-11-25-delivery-order.md) groups this plan's unbuilt tasks into batches with other plans' tasks and sets the order. It overrides this plan's lines on branches, on one PR per task, and on waiting for a VM check: the owner's VM pass comes once, at the end.

> **One batch with the gateway program, 2026-11-25.** Task 5 of [`2026-11-25-apps-gateway-phase-0.md`](2026-11-25-apps-gateway-phase-0.md) is built as the last commit of this plan's batch, after Tasks 3, 1 and 2, in the same branch and PR. It adds the forwarded user id and e-mail as fields of their own and takes the two identity headers back out of the label row Task 2 writes, and it rewrites the guide sentences of Task 2 Step 9. So the first option under "Open with the owner", item 1, is what is built, with the two PRs made one. Agreed with the session that owns that plan. This plan's task text is unchanged.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The client a person reads in Logs and in the usage totals is one LLM Router can stand behind. A developer's email shows only for requests sent with a key the owner marked as a trusted forwarder, a caller without a valid key is named from its `User-Agent` alone, and no label is longer than 120 characters.

**Architecture:** Three tasks, one commit each, on batch 16's branch `fix/client-label-and-forwarded-identity` and in one squash-merged PR. Build them in the order Task 3, Task 1, Task 2. Task 3 stops three header names reaching a provider and adds the list of display-name headers that Task 2 reads. Task 1 adds a `trustedForwarder` mark to an API key, stores it with the key and puts a switch on the API Keys page. Task 2 puts the whole label rule in `inferGatewayClient` as data, gives every caller the key it has in hand, keeps identity header values out of stored Logs headers, and changes the guide in the same commit.

**Tech Stack:** TypeScript, `better-sqlite3`, Electron 45, React, `node:test` with `node:assert/strict`, component tests that render with `renderToStaticMarkup`.

**Spec:** [`docs/superpowers/research/2026-11-22-open-items-validation.md`](../../research/2026-11-22-open-items-validation.md). Row L-5, findings C-1 to C-7, decisions B-5 and B-10 and outside facts X-16 to X-21 come from that record. Read its "Client identity" section before you start. Read also "Identity from a gateway that forwards to LLMR" in [`2026-11-24-claude-apps-gateway-management.md`](../../specs/2026-11-24-claude-apps-gateway-management.md), which plans the same mark.

**Evidence status.** The plan author read every file, symbol and test named below at `main` `eb84a3ba` on 2026-11-22. A second-model audit the same day ran a throwaway wire test in both layouts and every trace mode. Its results, which this plan relies on, are these. In the single layout the stored trace's `x-auth-sub` holds the key id in every mode, `x-auth-api-key-id` reads `***` when the trace is redacted, and a caller's own `x-auth-sub` is overwritten for a valid key (run). In the compatibility layout the host's label wins over the trace's (run). Node's `fetch` sends `user-agent: node`, which maps to `Node.js` (run). The fix round on 2026-11-24 read every cited symbol again at `main` `c491eb48`. It ran three things. The existing tests the tasks change pass on `main` (139 of 139, run). `ApiKeysView` and `EditApiKeyDialog` render under `renderToStaticMarkup`, and the `Switch` control renders `role="switch"` with `aria-checked="true"` (run, throwaway test, deleted). Today's API Keys dialogs hold no `Switch` (read). The text audit on 2026-11-27 built the three tasks at `main` `c8efa3a5` with gateway `1.0.22-llmr.4` and ran every test named below. Two facts above changed since the first audit (run). With request logs on, the trace the import reads holds `x-auth-api-key-id` and `authorization` as `[redacted]`, where the first audit read the key id and the token. `x-auth-sub` still holds the key id in every mode, and the identity headers hold their values. Measured for the audit's build, in lines added: Task 3 is 6 of source and 9 of test, Task 1 is 61 and 128, Task 2 is 61 and 152 with 9 of docs. That counts the tests the audit added to the steps and not the 229-line wire matrix it ran, which Task 2 Step 1 describes.

**Built after** [`2026-11-22-backlog-keys.md`](2026-11-22-backlog-keys.md), which is built. This plan uses `saveApiKeysConfig(next, base)` in `packages/core/src/config/config.ts`, `updatePersistedApiKeys(update)` in `config-repository.ts` and the `setKeys(keys)` helper in `config-credential-writes.test.mjs`, all as built (read).

**Meets** [`2026-11-22-backlog-logs.md`](2026-11-22-backlog-logs.md), which is built (PRs 172 and 173, 2026-11-27). `startWireService(t, layout, configure)` has its optional third parameter `(config) => void` on `main`, and the single layout's refusal text is `Invalid API key.` (run). This plan uses the parameter as it is. No assertion here reads the refusal reason.

## Decisions this plan rests on

- **B-5.** A request's client label takes an identity header (`x-claude-gateway-user-email`, `x-litellm-end-user-id`) only when the request's API key is marked as a trusted forwarder, and never for a refused caller. A refused caller is labelled from `User-Agent` alone. `x-forwarded-client-cert` leaves the label list. Every stored label is cut to a fixed length. The guide gains the step of marking the gateway's key.
- **B-10.** Certificate authentication is not built. No task here parses a certificate header or adds a trusted-proxy setting.
- **X-16, X-17.** A header an intermediary sets must not be something the end caller can set for itself, and the Claude apps gateway does not sign its identity headers. The key the gateway calls with is therefore the only anchor LLM Router has.
- **X-19.** `Client-Cert` and `Client-Cert-Chain` are set by a proxy that ends TLS and are meant for the next hop only. Task 3 keeps them from a provider.
- **X-21.** An email in a label is personal data kept 90 days in usage events. Taking it only from a marked key limits the label to setups that asked for it. The compatibility layout also stores each request's headers in its Logs row, identity headers included, for any key (run by the audit). Task 2 stores those values as `[redacted]`, so a Logs row holds the e-mail only in its label.
- **Plan author, changeable in review without reopening the plan:**
  - The field is `trustedForwarder`, and the column is `trusted_forwarder`.
  - The length is 120 characters, the same bound the refused-key notice already puts on a route and a reason. The notice's own 60 for a client goes away, so one number bounds every label.
  - `x-llmr-client` and `x-client-name` keep naming the client for any caller with a valid key, marked or not. They are display names LLM Router's own Kilo, Kimi, OpenCode and Pi profiles write into the agent's config. A caller without a valid key gets nothing from them.
  - A profile key cannot carry the mark. The store drops it, the label rule ignores it, and the page shows no switch for such a key.
  - The switch's label and help text (Task 1, Step 7) and the guide's wording (Task 2, Step 9).
  - No hint on the Logs page when an identity header from an unmarked key was ignored. See "What a user sees after an upgrade".

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code. Task 1 adds one column to a table every existing database already has, by the column check `ensureUsageSchema` in `packages/core/src/usage/store.ts` uses. It rewrites no row.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json` and never deletes or migrates `~/.claude/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Never pass `--scope`. Check the build's exit code, because a failed build leaves a stale `.test-dist`. The wire file needs `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js"` and skips its tests without it.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads. `gateway.md` applies to Tasks 2 and 3, `ui.md` to Task 1, `tests.md` to every test.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before each commit: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and the package suites the task touches.
- No test, script or doc names a real provider host or holds a key. Test keys are made-up strings such as `sk-wire-forwarder-0002`, and test addresses end in `example.com`.
- A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. No task here touches the fork.
- Merging needs the owner's word, once for the batch's PR.
- Tasks 1 and 2 ship in the same release. Task 1 alone shows a switch that changes nothing.
- Docs are English only. The guide change rides in Task 2's commit and not straight on `main`, because it describes a step that does nothing until that code is merged.
- The repository is public. Describe a change by what the code does.

## Review Focus

Each line is a condition no row's own test covers. The test that pins it is in the step named at the end.

1. Request logs are off, so the gateway child writes its trace in the redacted mode, where the fork replaces the value of `x-auth-api-key-id` with `***`. A marked key's email still labels the usage event. Task 2, Step 1, the `single, logs off` case.
2. A caller with a valid unmarked key sends `x-auth-sub` and `x-auth-api-key-id` naming a marked key, with an identity header. The label is not the email. Task 2, Step 1, the unmarked case, and Step 2's router plugin test.
3. A database made before this plan has no `trusted_forwarder` column. It opens, and a mark saves and loads. Task 1, Step 1.
4. A mark set in one window survives a settings save and a key save sent from a list read before the mark was set. A mark switched on or off alone is saved, which needs `sameApiKey` in `config.ts` to compare it. Task 1, Step 1.
5. A profile key reaches the store or the config with the mark set, from a hand-edited config or an older page. It is stored without it, and the label rule ignores it. Task 1, Step 1, and Task 2, Step 2.
6. In the compatibility layout a Logs row's stored request headers hold no identity header value, whatever the key. Task 2, Step 1, the `compat` case.

## Rows this plan closes

| Row | Task |
|---|---|
| L-5 | Task 2 |
| C-1 | Tasks 1 and 2 |
| C-2 | Task 2 |
| C-3 | Task 2 |
| C-4 | Closed with no change. See "The Cursor rewrite" |
| C-5 | Task 3 |

C-6 and C-7 describe the transport and the fork. They need no change under B-10.

## What a user sees after an upgrade

A setup behind a Claude apps gateway stops showing emails. Its rows carry the key's name in the compatibility layout and the `User-Agent` name in the single layout, until the owner opens **API Keys**, edits the gateway's key and switches **Trusted forwarder** on. Rows already stored keep the label they have. No migration marks a key, because nothing in a stored key says which one a gateway uses.

Switching the mark on or off restarts LLM Router's gateway, as any key change does today, because `runtimeGatewayConfigSignature` in `gateway/runtime-change.ts` holds `APIKEYS` whole (read). The child never reads the mark.

In the single layout the mark is read when a trace is imported, not when the request was made (`attemptStoredBundle` reads `getConfig()`, read). A trace still in the spool when the mark changes is labelled by the mark at import.

Release note sentence: "A request's client is taken from the Claude apps gateway identity headers only when its API key is marked as a trusted forwarder under API Keys. Mark the key your gateway uses to keep seeing the developer's email."

No hint is built for an ignored header. A hint needs either a field on every row or a counter the gateway child sends to the parent the way the refused-key count travels, and that is a publisher, a status field and a notice. The guide and the release note carry the step instead.

## The Cursor rewrite (C-4)

`prepareCursorOpenAICompatChatBody` in `packages/core/src/gateway/features/cursor-compat.ts` acts when the label is exactly `Cursor`. It adds the system prompt and tools stored in the `cursor-proxy` plugin's config to a chat request that has only user messages, and it changes nothing when that plugin holds neither. No agent profile in this repo writes `x-llmr-client: Cursor`, and the `User-Agent` mapping has no `Cursor` branch, so only the first-token fallback gives `Cursor` (read by the audit). Only `packages/core/src/gateway/request/pipeline.ts` calls it, and `proxyRequest` runs only after `authorize` returned a key (`gateway/http/request-handler.ts`, read). A refused caller never reached the rewrite, so Task 2 changes nothing for C-4. A caller with a valid key can still name itself `Cursor` and get the owner's own configured context added to its own request. That is how the feature is switched on, and this plan leaves it. C-4 is closed with no change. No question for the owner.

---

### Task 3: Keep three more header names from a provider (C-5)

Built first in the batch, because it is independent and Task 2 reads the list it adds. It could also ride in any earlier batch: no other plan's task changes `front-door-headers.ts` or `upstream-header-sanitizer.ts` (grep of `docs/superpowers/plans`, read).

A caller's `x-client-name`, and the `Client-Cert` and `Client-Cert-Chain` headers a TLS-ending proxy adds (X-19), reach the provider today. The plan author ran the built sanitizer and saw all three in the provider request, and the audit saw them reach an upstream stub in both layouts. After this task none does. A routing rule on `request.header.x-client-name` is not affected, because rules read the request as it came in, and the removal happens where the provider request is built (inferred, not run). A header of the same name that a provider's own configuration sets is kept, as it is for the other front-door names. Adding the two certificate names to `frontDoorHeaderNames` also makes a route rewrite that targets them fail validation, because `parseRewritePath` in `routing/rewrite.ts` refuses a front-door name (read). `x-client-name` gets its own check, so a rewrite may still set it.

**Files:**
- Modify: `packages/core/src/gateway/internal/shared.ts`, `packages/core/src/gateway/internal/front-door-headers.ts`, `packages/core/src/gateway/core-runtime/upstream-header-sanitizer.ts`
- Test: `packages/core/test/unit/gateway/upstream-header-sanitizer.test.mjs`

**Interfaces:**
- Produces in `shared.ts`, beside `claudeAppsGatewayIdentityHeaderNames`: `export const clientDisplayNameHeaderNames = ["x-llmr-client", "x-client-name"] as const;`. It is an ordered array, not a `Set`, because Task 2 reads it in order.
- Produces nothing else a later task uses.

- [ ] **Step 1: Extend the failing test.** In `gateway sanitizer hook does not forward reverse proxy metadata to providers`, add three client request headers, `"client-cert": ":MIIB:"`, `"client-cert-chain": ":MIIC:"` and `"x-client-name": "codex-cli"`. The expected headers stay `{ "content-type": "application/json", "x-custom-provider-header": "custom-value" }`. Then add a second call of the same hook, with the client header `"x-client-name": "codex-cli"` and `"x-client-name": "provider-set"` on `upstreamRequest.headers`, and assert the result's `x-client-name` is `provider-set`. The first call is the one that pins the removal. The merge lets a provider's own header overwrite the client's (`mergeUpstreamProviderHeaders`, read), so the second call passes before the change too.

- [ ] **Step 2: Run it and see it fail.**

  Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/upstream-header-sanitizer.test.js`
  Expected: FAIL, with `client-cert`, `client-cert-chain` and `x-client-name` present in the first call's result.

- [ ] **Step 3: Remove the three names from the client side.** Add `client-cert` and `client-cert-chain` to `frontDoorHeaderNames`, in alphabetical order. Add `clientDisplayNameHeaderNames` to `shared.ts`. In `mergeUpstreamProviderHeaders`, the loop over `requestHeaders` also skips a name in `clientDisplayNameHeaderNames`. Write the check as `clientDisplayNameHeaderNames.some((name) => name === normalized)`: the list is a tuple of two literals, so `includes(normalized)` with a plain string does not type-check. `x-llmr-client` is already skipped by the `x-llmr-` prefix. `sanitizeUpstreamProviderHeaders` does not change, so a provider's own header survives.

- [ ] **Step 4: Verify.** Same command as Step 2. Expected: PASS. Then `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`.

- [ ] **Step 5: Commit.** Subject: `fix(gateway): stop x-client-name and the client certificate headers reaching a provider`

---

### Task 1: Mark an API key as a trusted forwarder (C-1)

Before Task 2, because Task 2's rule reads the mark.

The API Keys page gains a **Trusted forwarder** switch in the Add and Edit dialogs and a tag on a marked key's row. The mark is stored with the key and survives every other write of the key list. It changes nothing until Task 2.

How a key is stored, read in the code at `c491eb48`. `api_keys` is created by `createSchema` in `packages/core/src/config/config-repository.ts` with `CREATE TABLE IF NOT EXISTS`, so a new column in that statement never reaches an existing database. Every write goes through `replaceApiKeyRows`, every read through `listApiKeys` and `toApiKeyConfig`, and both pass through that file's `uniqueApiKeyConfigs`, which rebuilds each key field by field. `ConfigRepository.updateApiKeys` and `replaceConfigSnapshot` write the rows only when `JSON.stringify` of the result differs from the current list, so every copy site must place the field in the same position. `config.ts` has a second `uniqueApiKeyConfigs` (which `normalizeApiKeys` calls) and a `parseApiKeyConfig`, and the page has `normalizeApiKeys`, `normalizeApiKeyConfig` and `updateApiKeyEditableConfig`. Each of the six drops a field it does not name.

`saveApiKeysConfig` in `config.ts`, as built by the keys plan, skips an entry whose `sameApiKey(seen, apiKey)` is true. `sameApiKey` compares a fixed list of fields (`createdAt`, `expiresAt`, `id`, `key`, `name`, `limits`). A save that changes only the mark would be skipped and never stored, so `sameApiKey` gains the field. When an entry differs, the merge replaces the row with the caller's whole entry, but only while the row's token is still the one the caller saw (read). The save RPC passes `ApiKeyConfig[]` whole in both paths (`ipc.ts`, `preload.ts`, `web-client-bridge.ts`, `management-server.ts`), so none of those four files changes. `dialog-stack.tsx` types `apiKeyEdit` as `ComponentProps<typeof EditApiKeyDialog>`, so a new prop flows through it unchanged (read by the audit).

**Files:**
- Modify: `packages/core/src/contracts/app.ts` (`ApiKeyConfig`)
- Modify: `packages/core/src/config/config-repository.ts` (`createSchema`, `StoredApiKeyRow`, `toStoredApiKeyRow`, `toApiKeyConfig`, `listApiKeys`, `replaceApiKeyRows`, `uniqueApiKeyConfigs`)
- Modify: `packages/core/src/config/config.ts` (`uniqueApiKeyConfigs`, `parseApiKeyConfig`, `sameApiKey`)
- Modify: `packages/ui/src/pages/home/shared/api-keys.ts`, `packages/ui/src/pages/home/shared/types.ts` (`AddApiKeyDraft`), `packages/ui/src/pages/home/components/api-keys.tsx`, `packages/ui/src/pages/home/App.tsx` (the `apiKeyEdit` props)
- Create: `packages/core/test/unit/config/config-repository-trusted-forwarder-column.test.mjs`, `packages/ui/test/component/api-keys.test.tsx`
- Test: `packages/core/test/unit/config/config-credential-writes.test.mjs`, `packages/ui/test/unit/api-keys.test.ts`

**Interfaces:**
- Produces: `trustedForwarder?: boolean` on `ApiKeyConfig`, after `name`. It is present only when `true`. Every copy site writes it as the last field, as `...(value.trustedForwarder === true ? { trustedForwarder: true } : {})`, so a key without the mark is the same object it is today and every existing `deepEqual` on a key holds.
- Produces: column `trusted_forwarder INTEGER NOT NULL DEFAULT 0` on `api_keys`.
- Produces: `trustedForwarder: boolean` on `AddApiKeyDraft`, and `showTrustedForwarder: boolean` on the props of `EditApiKeyDialog`.
- Consumes: `saveApiKeysConfig(next: ApiKeyConfig[], base: ApiKeyConfig[])` and `sameApiKey` in `config.ts`, `updatePersistedApiKeys(update)` and `loadPersistedApiKeys()` in `config-repository.ts`, and the `setKeys(keys)` helper in `config-credential-writes.test.mjs`, which calls `saveApiKeysConfig(keys, (await loadAppConfig()).APIKEYS)`.
- Consumes: `profileIdFromApiKeyId(value)` from `@llmr/core/profiles/api-key`, which is `undefined` for any id that is not `profile:<id>`.

- [ ] **Step 1: Write the failing core tests.**

  In `config-credential-writes.test.mjs`. The file's tests share one temporary home, so each test starts from whatever the one before it stored, and `setKeys` takes the current list as its base.

  ```js
  test("a trusted forwarder mark is stored with its key and survives a settings save and a key save from an older list", async () => {
    const stale = await setKeys([retained, revoked]);
    const marked = await configApi.saveApiKeysConfig([{ ...retained, trustedForwarder: true }, revoked], stale.APIKEYS);
    assert.deepEqual(marked.APIKEYS, [{ ...retained, trustedForwarder: true }, revoked]);
    await configApi.saveAppConfig({ ...marked, autoStart: !marked.autoStart });
    const saved = await configApi.saveApiKeysConfig([retained, { ...revoked, name: "Edited" }], stale.APIKEYS);
    assert.deepEqual(saved.APIKEYS, [{ ...retained, trustedForwarder: true }, { ...revoked, name: "Edited" }]);
  });

  test("switching the trusted forwarder mark off removes it from the stored key", async () => {
    const marked = await setKeys([{ ...retained, trustedForwarder: true }]);
    assert.deepEqual(marked.APIKEYS, [{ ...retained, trustedForwarder: true }]);
    const saved = await configApi.saveApiKeysConfig([retained], marked.APIKEYS);
    assert.deepEqual(saved.APIKEYS, [retained]);
    assert.equal("trustedForwarder" in saved.APIKEYS[0], false);
  });

  test("a profile key is stored without the trusted forwarder mark", async () => {
    const { loadPersistedApiKeys, updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
    const profileKey = { createdAt: "2026-01-01T00:00:00.000Z", id: "profile:codex", key: "profile-token" };
    await updatePersistedApiKeys(() => [{ ...profileKey, trustedForwarder: true }, { ...retained, trustedForwarder: true }, { ...revoked, trustedForwarder: "yes" }]);
    assert.deepEqual(await loadPersistedApiKeys(), [profileKey, { ...retained, trustedForwarder: true }, revoked]);
  });
  ```

  The second test's first assertion makes it fail today, because today's store drops the mark on the way in. Without it the test would pass before the change.

  Two more tests in the same file, added by the text audit. Both pass once Steps 3 and 4 are done (run). The first pins Review Focus 4 as it is worded: the test above saves the settings from a snapshot that already holds the mark, and this one saves from a snapshot read before it. The second is the only test that fails when `parseApiKeyConfig` drops the mark (run as a mutant).

  ```js
  test("a settings save from a snapshot read before the mark was set keeps the mark", async () => {
    const stale = await setKeys([retained, revoked]);
    await configApi.saveApiKeysConfig([{ ...retained, trustedForwarder: true }, revoked], stale.APIKEYS);
    const saved = await configApi.saveAppConfig({ ...stale, autoStart: !stale.autoStart });
    assert.deepEqual(saved.APIKEYS, [{ ...retained, trustedForwarder: true }, revoked]);
  });

  test("a key in the config's own list brings its mark when it is first stored, a profile key does not, and a stored key takes no mark from it", async () => {
    const { loadPersistedAppConfig, replacePersistedAppConfig } = await import("@llmr/core/config/config-repository.ts");
    await setKeys([retained]);
    const fromFile = { createdAt: "2026-01-01T00:00:00.000Z", id: "from-file", key: "from-file-token", trustedForwarder: true };
    const profileFromFile = { createdAt: "2026-01-01T00:00:00.000Z", id: "profile:file", key: "profile-file-token", trustedForwarder: true };
    await replacePersistedAppConfig({ ...(await loadPersistedAppConfig()), APIKEYS: [fromFile, profileFromFile, { ...retained, trustedForwarder: true }] });
    const loaded = await configApi.loadAppConfig();
    const { trustedForwarder: _mark, ...profileStored } = profileFromFile;
    assert.deepEqual(loaded.APIKEYS, [retained, fromFile, profileStored]);
  });
  ```

  New file `config-repository-trusted-forwarder-column.test.mjs`, one test, `a key database made before the trusted forwarder column opens, and a mark saves and loads`. Copy the environment setup and the `createApiKeyDatabase` helper from `config-repository-existing-data-migration.test.mjs`, with the folder named `config-repository-trusted-forwarder-${process.pid}`. Create only the database at `APP_CONFIG_DB_FILE`, with the row `{ id: "existing-key", key: "sk-existing" }`. Then:

  ```js
  const { loadPersistedApiKeys, updatePersistedApiKeys } = await import("@llmr/core/config/config-repository.ts");
  await updatePersistedApiKeys((current) => current.map((apiKey) => ({ ...apiKey, trustedForwarder: true })));
  assert.deepEqual(await loadPersistedApiKeys(), [{ createdAt: new Date(0).toISOString(), id: "existing-key", key: "sk-existing", trustedForwarder: true }]);
  ```

- [ ] **Step 2: Run them and see them fail.**

  Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/config/config-credential-writes.test.js .test-dist/core/test/unit/config/config-repository-trusted-forwarder-column.test.js`
  Expected: the four new tests fail with the mark missing from the loaded keys. The profile test fails on the second key.

- [ ] **Step 3: Add the field and the column.**
  - `contracts/app.ts`: `trustedForwarder?: boolean;` as the last member of `ApiKeyConfig`.
  - `config-repository.ts`, `createSchema`: add `trusted_forwarder INTEGER NOT NULL DEFAULT 0` as the last column of the `CREATE TABLE IF NOT EXISTS api_keys` statement. After the `database.exec` that creates the tables, run one immediate transaction that reads `PRAGMA table_info(api_keys)` with `queryRows` and runs `ALTER TABLE api_keys ADD COLUMN trusted_forwarder INTEGER NOT NULL DEFAULT 0` when no row is named `trusted_forwarder`. Use the file's own `runTransaction(database, fn)`, which opens with `BEGIN IMMEDIATE` (read), and not `database.transaction(fn).immediate()`. The immediate transaction matters because the app and an `llmr` command can open the same database at once. Without it both could see no column, and the second `ALTER` would fail the open with "duplicate column name" (inferred by the audit). With it the second opener waits on the connection's `busy_timeout` and then sees the column. `config-repository.ts` has had no `ALTER TABLE` until now, so this is the file's first column change (read).
  - `listApiKeys` selects `trusted_forwarder`. `StoredApiKeyRow` gains `trustedForwarder: boolean`, which `toStoredApiKeyRow` sets from `Number(row.trusted_forwarder) === 1` and `toApiKeyConfig` copies by the rule under Interfaces. `replaceApiKeyRows` names the column and writes `1` or `0`.
  - Leave `readLegacyApiKeyRows` and `insertRawApiKeyRows` as they are. A legacy database has no such column, and the insert names its seven columns, so the default applies.

- [ ] **Step 4: Carry the field through the core copy sites.**
  - The repository's `uniqueApiKeyConfigs` carries the mark only when it is `true` and `profileIdFromApiKeyId(id)` is `undefined`, where `id` is the one it has just made unique. Every read and write of the table passes it, so no stored profile key holds the mark.
  - `config.ts`'s `uniqueApiKeyConfigs` and `parseApiKeyConfig` carry it by the rule under Interfaces, so a key in the config's own `APIKEYS` list can hold `"trustedForwarder": true`. `loadAppConfig` stores such a key on the load that first sees it, and hands back the stored list, so a profile key in that list arrives without the mark (run by the text audit, against the first audit's reading). The mark comes in only with a key that is not stored yet: a key already in the table keeps the table's value, whatever the config's list says (run). A config built in code, as the wire test builds one, can still hold a marked profile key, so Task 2's `isTrustedForwarderKey` ignores the mark on such a key. That is the rule where trust is read. The store rule keeps the table clean.
  - `config.ts`'s `sameApiKey` adds `rest.trustedForwarder === true` to the array it compares.

- [ ] **Step 5: Run the core tests.** Same command as Step 2. Expected: every test in both files passes.

- [ ] **Step 6: Write the failing UI tests.**

  In `packages/ui/test/unit/api-keys.test.ts`, with `createApiKeyDraft`, `createApiKeyEditDraft`, `normalizeApiKeys` and `updateApiKeyEditableConfig` added to the import:

  ```ts
  test("the trusted forwarder mark survives the page's own normalizing and editing of a key", () => {
    const marked = { createdAt: "2026-01-01T00:00:00.000Z", id: "gw", key: "sk-gateway-key-0001", name: "Gateway", trustedForwarder: true };
    assert.deepEqual(normalizeApiKeys([marked]), [marked]);
    assert.equal("trustedForwarder" in normalizeApiKeys([{ ...marked, trustedForwarder: "yes" }])[0], false);
    const draft = createApiKeyEditDraft(marked);
    assert.equal(draft.trustedForwarder, true);
    assert.deepEqual(updateApiKeyEditableConfig(marked, draft), marked);
    assert.equal("trustedForwarder" in updateApiKeyEditableConfig(marked, { ...draft, trustedForwarder: false }), false);
    assert.equal(createApiKeyDraft().trustedForwarder, false);
  });
  ```

  `createGeneratedApiKey` reads `window.crypto`, which this runner does not have, so no unit test calls it. `npm run typecheck` and Step 7's rule cover it.

  New file `packages/ui/test/component/api-keys.test.tsx`. Import `renderToStaticMarkup` from `react-dom/server`, `ApiKeysView` and `EditApiKeyDialog` from `@llmr/ui/pages/home/components/api-keys.tsx`, `createApiKeyEditDraft` and `createApiKeyList` from `@llmr/ui/pages/home/shared/api-keys.ts`, and `createDefaultAppConfig` from `@llmr/core/config/default-config.ts`. Build `config` as `{ ...createDefaultAppConfig(), APIKEYS: [marked, plain] }`, with the `marked` key above and `plain = { createdAt: "2026-01-01T00:00:00.000Z", id: "plain", key: "sk-plain-key-0002", name: "Plain" }`. Both components render statically today (run).

  - `the API Keys list tags a trusted forwarder key and no other`: render `ApiKeysView` with `apiKeys: createApiKeyList(config)`, `error: ""` and no-op `addApiKey`, `editApiKey`, `notify` and `removeApiKey`. Assert the markup holds `Trusted forwarder` exactly once.
  - `the edit dialog shows the trusted forwarder switch on, and hides it for a profile key`: render `EditApiKeyDialog` with `draft: createApiKeyEditDraft(marked)`, `canSubmit: true`, `error: ""`, no-op `onChange`, `onClose` and `onSubmit`, and `showTrustedForwarder: true`. Assert the markup matches `/role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/`. Render it again with `showTrustedForwarder: false` and assert it does not match `/role="switch"/`.

- [ ] **Step 7: Implement the page.**
  - `types.ts`: `trustedForwarder: boolean` on `AddApiKeyDraft`.
  - `shared/api-keys.ts`: `createApiKeyDraft` sets it `false`. `createApiKeyEditDraft` sets it from `apiKey.trustedForwarder === true`. `normalizeApiKeys`, `normalizeApiKeyConfig`, `createGeneratedApiKey` and `updateApiKeyEditableConfig` carry it by the rule under Interfaces, the last two reading the draft.
  - `components/api-keys.tsx`: one component `TrustedForwarderField({ checked, onChange })`, rendered in `AddApiKeyDialog` and, when `showTrustedForwarder` is true, in `EditApiKeyDialog`, in both above `ApiKeyAdvancedSettings`. It is a `Switch` from `../shared/index` with `aria-label="Trusted forwarder"`, the label `Trusted forwarder`, and the help text `Take the client shown in Logs from the identity headers sent with this key. Switch it on only for the key a Claude apps gateway uses.` In `ApiKeysView`, a marked key's Name cell shows the text `Trusted forwarder` under the name, in the row's muted `text-[11px] text-muted-foreground` style.
  - `App.tsx`: the `apiKeyEdit` props gain `showTrustedForwarder: !apiKeyEditItem.key.id.startsWith("profile:")`. `apiKeyEditItem.key` is the `ApiKeyConfig` (`ApiKeyListItem`, read). The renderer reads the prefix with `startsWith` because `ui.md` keeps it off `profiles/api-key`.

- [ ] **Step 8: Verify.**

  Run: `node build/test.mjs ui && node --test .test-dist/ui/test/unit/api-keys.test.js .test-dist/ui/test/component/api-keys.test.js`
  Expected: every test passes.
  Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron`
  Expected: all pass.

- [ ] **Step 9: Commit.** Subject: `feat(api-keys): mark a key as a trusted forwarder`

---

### Task 2: Take the client label from a rule that knows the caller (L-5, C-1 to C-3)

After Tasks 3 and 1, because the rule reads the mark and Task 3's list.

Today any caller names itself in Logs and in the usage totals with a header, a caller with no valid key included, and a long header value is stored whole. After this task a request sent with a marked key shows the forwarded email, a request sent with any other valid key shows its display name, key name or `User-Agent`, and a caller refused for its key shows its `User-Agent` name only. No label is longer than 120 characters. `x-forwarded-client-cert` names nothing. No stored Logs headers hold an identity header value.

**The rule, in one place.** `inferGatewayClient` takes who is calling and the headers.

| Caller | Sources, first non-empty wins |
|---|---|
| Refused, or unknown | The `User-Agent` mapping |
| A valid key | `x-llmr-client`, `x-client-name`, then the key's name or the `User-Agent` mapping in today's order (`x-llmr-proxy-mode: gateway` puts the `User-Agent` first) |
| A valid key marked as a trusted forwarder | `x-llmr-client`, `x-client-name`, `x-claude-gateway-user-email`, `x-litellm-end-user-id`, then as above |

The result is cut to `maxGatewayClientLabelLength`. A display name beats the email for a marked key, as it does today (read by the audit).

**What each caller has in hand, read in the code.**

| Caller | Key in hand today | After this task |
|---|---|---|
| `pipeline.ts`, `proxyRequest` | The `apiKey` `authorize` returned | `gatewayClientCallerForKey(apiKey)` |
| `refused-key-requests.ts`, `refusedKeyRequestEntry`, for LLM Router's own front and for the child's `beforeAuth` hook | None, and the caller was refused | `{ kind: "refused" }` |
| `raw-trace-sync.ts`, `readRawTraceRequestLogBundle`, the only label source in the single layout | None | The key id from the trace's `x-auth-sub` header, looked up in the config's keys for its mark with `isTrustedForwarderKey`. No name, so the single layout keeps naming a request from its `User-Agent`, as it does today |
| `request-log-store.ts`, `standaloneRecordInputFromRawTrace`, used when the trace gave no label | None, and the headers are the provider-bound ones | `{ kind: "refused" }` |

**How the trace import learns the key (run by the audit).** In the single layout the gateway child's `beforeAuth` hook writes `x-auth-api-key-id` and `x-auth-sub` onto the request for a valid key (`setApiKeyAuthContextHeaders`, `router-plugin.ts`). The fork writes that request's headers into the trace's `client_request_metadata` part. With request logs off the single layout still writes a trace (`standaloneUsageCapture` in `config-compiler.ts`), in `body_redacted` mode, where `x-auth-api-key-id` reads `***` and `x-auth-sub` keeps the id. The rule therefore reads `x-auth-sub`. In the compatibility layout the parent's pipeline sets both headers before it forwards, and the host's label wins over the trace's.

The hook sets those two headers only when a key resolves, so a request that passes with a static bypass token (the internal core token, or a key in `publicAuthKeys`) keeps whatever the caller sent. The audit ran this, and the core-token request's trace kept the caller's value. Step 5 removes both at the top of the hook in the single layout. In the compatibility layout the child runs with `publicGatewayMode` off, the parent's pipeline sets them, and the hook leaves them (read).

**Files:**
- Modify: `packages/core/src/gateway/http/io.ts`, `packages/core/src/gateway/request/pipeline.ts`, `packages/core/src/gateway/auth/refused-key-requests.ts`, `packages/core/src/observability/raw-trace-sync.ts`, `packages/core/src/observability/request-log-store.ts`, `packages/core/src/observability/sensitive-headers.ts`, `packages/core/src/gateway/core-runtime/router-plugin.ts`, `packages/core/src/proxy/service.ts`
- Modify: `docs/src/content/docs/en/guides/claude-apps-gateway.md`, `docker/claude-apps-gateway/README.md`
- Test: `packages/core/test/unit/gateway/http-boundary.test.mjs`, `packages/core/test/unit/gateway/upstream-header-sanitizer.test.mjs`, `packages/core/test/unit/gateway/refused-key-requests.test.mjs`, `packages/core/test/unit/gateway/router-plugin.test.mjs`, `packages/core/test/unit/observability/raw-trace-sync.test.mjs`, `packages/core/test/unit/proxy/capture-headers.test.mjs`, `packages/core/test/integration/gateway/october-issues-wire.test.mjs`

**Interfaces:**
- Consumes: `trustedForwarder?: boolean` on `ApiKeyConfig` (Task 1).
- Consumes: `clientDisplayNameHeaderNames` from `@llmr/core/gateway/internal/shared` (Task 3).
- Consumes: `startWireService(t, layout, configure?: (config) => void)`, as it is on `main`. `configure` runs on the config just before `service.start` (read).
- Produces in `io.ts`:

  ```ts
  export const maxGatewayClientLabelLength = 120;
  export type GatewayClientCaller =
    | { kind: "refused" }
    | { kind: "key"; name?: string; trustedForwarder: boolean };
  export function isTrustedForwarderKey(apiKey: Pick<ApiKeyConfig, "id" | "trustedForwarder"> | undefined): boolean;
  export function gatewayClientCallerForKey(apiKey: Pick<ApiKeyConfig, "id" | "name" | "trustedForwarder">): GatewayClientCaller;
  export function inferGatewayClient(caller: GatewayClientCaller, headers: IncomingHttpHeaders): string | undefined;
  ```

  `isTrustedForwarderKey` is true only for `apiKey.trustedForwarder === true` with `profileIdFromApiKeyId(apiKey.id)` `undefined`. `gatewayClientCallerForKey` returns `kind: "key"`, `name` from the key's trimmed name or else its trimmed id, and `trustedForwarder` from `isTrustedForwarderKey`.
- Changes: `readRawTraceRequestLogBundle(manifest, spoolDirectory = RAW_TRACE_SPOOL_DIR, apiKeys: readonly ApiKeyConfig[] = [])`.
- Changes: `inferProxyClient` in `proxy/service.ts` becomes an export, for its test.
- The logs plan's "Waiting for B-5" table lists these same functions. Its only signature change that meets this plan is the `startWireService` parameter. No change to `api-key-authorizer.ts` is needed: `authorize` keeps passing `request.headers`, and the refused rule lives in `refusedKeyRequestEntry`.

- [ ] **Step 1: Write the wire test that settles the trace question.** In `october-issues-wire.test.mjs`, add a loop over `[["single", "single"], ["compat", "compat"], ["single, logs off", "single"]]` as `[name, layout]` with the test `the client label follows the key's trusted forwarder mark (${name})`. Start with `startWireService(t, layout, configure)`, where `configure` appends `{ createdAt: new Date(0).toISOString(), id: "forwarder", key: "sk-wire-forwarder-0002", trustedForwarder: true }` and the profile key `{ createdAt: new Date(0).toISOString(), id: "profile:codex", key: "sk-wire-profile-0003", trustedForwarder: true }` to `config.APIKEYS` and, for the third case, sets `config.observability.requestLogs = false`. The loop's cases run in one process and share one usage database (run by the audit), so each request's model is `` `no-provider-${name.replaceAll(/\W+/g, "-")}-${kind}` `` with `kind` the request's name below. No provider has these models, as in the test above it. Take `before = refusedKeyCount(service)` before the first request.

  | Request | Headers besides `content-type` | Status |
  |---|---|---|
  | marked | `authorization: Bearer sk-wire-forwarder-0002`, `x-claude-gateway-user-email: dev@example.com` | 400 |
  | unmarked | `authorization: Bearer sk-wire-key-0001`, `x-claude-gateway-user-email: other@example.com`, `x-auth-sub: forwarder`, `x-auth-api-key-id: forwarder` | 400 |
  | profile | `authorization: Bearer sk-wire-profile-0003`, `x-claude-gateway-user-email: other@example.com` | 400 |
  | refused | `authorization: Bearer sk-wrong-key-7777`, `x-llmr-client: Spoof`, `x-claude-gateway-user-email: other@example.com` | 401 |

  Read each label from `usage_events` with `database.prepare("SELECT client FROM usage_events WHERE model = ?").all(model)`, polling with `until` as the test above does. Assertions:
  - marked: `[{ client: "dev@example.com" }]` in all three cases.
  - unmarked: `[{ client: "Node.js" }]` in the two single cases, because the trace import passes no key name and the test's `fetch` sends a `User-Agent` of `node`. `[{ client: "wire" }]` in `compat`, the key's id, because the key has no name.
  - profile: `[{ client: "Node.js" }]` in the two single cases and `[{ client: "profile:codex" }]` in `compat`. The text audit added this request. Without it, a pipeline that builds its caller without `gatewayClientCallerForKey` and so believes the mark on a profile key passes every other test (run as a mutant).
  - With logs on, the Logs row for each of the three models has the same `client` as its usage event. `requestLogRuntime.list` returns each row with its `requestHeaders` (run).
  - refused: poll `until(() => refusedKeyCount(service) === before + 1, 5000)`, because the single layout's child publishes refusals at most once a second (`refusedKeyRequestPublishIntervalMs`, read). Then `service.getStatus().refusedForKey.recent[0].client` is `Node.js`. The refused request has no usage event in either layout (run), so assert that its model's usage rows are `[]`.
  - `JSON.stringify` of the usage rows, of the Logs rows for the three models with their `requestHeaders`, and of `refusedForKey` holds neither `other@example.com` nor `Spoof`. In `compat` this needs Step 5's redaction, because the host stores each request's forwarded headers in its Logs row (run by the audit, and run again as a mutant: with the three names left out of the sensitive list only the `compat` case fails).

  Send the four requests one after another, as written. Do not add more requests to this test without a pause between them: in the single layout only 7 or 8 of 12 requests sent back to back got a usage event, on `main` as on the branch (run, finding 11 under "Behaviour the audit measured").

  **A second test, the matrix the text audit ran.** `the client label holds for every source and caller (${layout})`, for `single` and `compat`, with request logs on. The audit ran it in six cases, the two layouts with logs on, logs off and body capture `none`, with the same labels in all six. Two cases are enough to keep. `configure` appends the `forwarder` and `profile:codex` keys above, the second with the name `Profile: Codex`, and `{ createdAt: new Date(0).toISOString(), id: "long", key: "sk-wire-long-0004", name: "n".repeat(300) }`. The upstream stub answers `/v1/messages` with a valid Anthropic message and records the headers it receives. Wait 700 ms after each request, for the reason above. `identity(email)` is the three headers `x-claude-gateway-user-email: email`, `x-claude-gateway-user-id: id-of-<email>` and `x-litellm-end-user-id: email`. `forged` is `x-auth-api-key-id: forwarder` and `x-auth-sub: forwarder`. Every model is `audit-<layout>-<request>`, which no provider has, except the last request.

  | Request | Key | Other headers | Client in `single` | Client in `compat` |
  |---|---|---|---|---|
  | marked-identity | forwarder | `identity("dev@example.com")` | `dev@example.com` | `dev@example.com` |
  | marked-bare | forwarder | none | `Node.js` | `forwarder` |
  | marked-display | forwarder | `identity("dev@example.com")`, `x-llmr-client: Tool` | `Tool` | `Tool` |
  | marked-litellm-only | forwarder | `x-litellm-end-user-id: lite@example.com` | `lite@example.com` | `lite@example.com` |
  | marked-id-only | forwarder | `x-claude-gateway-user-id: sub-123` | `Node.js` | `forwarder` |
  | marked-long-email | forwarder | `x-claude-gateway-user-email` of 300 `a` and `@example.com` | its first 120 characters | the same |
  | plain-forged | wire | `forged`, `identity("other@example.com")` | `Node.js` | `wire` |
  | plain-display | wire | `x-client-name: MyTool` | `MyTool` | `MyTool` |
  | plain-long-display | wire | `x-llmr-client` of 300 `c` | 120 `c` | 120 `c` |
  | plain-long-agent | wire | `user-agent` of 300 `u` and `/1.0` | 120 `u` | `wire` |
  | plain-cert | wire | `x-forwarded-client-cert: By=spiffe://a;Hash=b` | `Node.js` | `wire` |
  | profile-marked | profile:codex | `identity("other@example.com")` | `Node.js` | `Profile: Codex` |
  | long-key-name | long | none | `Node.js` | 120 `n` |
  | refused | a wrong key | `forged`, `identity("other@example.com")`, `user-agent` of 300 `r` and `/1.0`, and `Spoof` as `x-llmr-client`, `x-client-name` and `x-forwarded-client-cert` | 401, no usage event, no Logs row | the same |
  | missing | none | `forged`, `identity("other@example.com")`, `x-llmr-client: Spoof` | 401, no usage event, no Logs row | the same |
  | upstream | forwarder | `identity("dev@example.com")`, `client-cert: :MIIB:`, `x-client-name: codex-cli`, model `Provider/native` | 200 | 200 |

  Assertions, all of which held in the audit's run: each request's usage rows are the one label in its column, and its Logs row has the same `client`. The refused-key count rose by two, and the two newest entries name `Node.js` (the missing key) and 120 `r` (the wrong key). In `compat` the Logs row of `plain-forged` holds `[redacted]` for each of the three identity headers. `JSON.stringify` of every Logs row and of each row's `requestLogRuntime.getDetail({ id })` holds none of `other@example.com`, `id-of-` and `Spoof`, and no row's `requestHeaders`, `responseHeaders` or `routeTrace` holds `dev@example.com`. The upstream stub received one request, with no header whose name matches `/claude-gateway|litellm|client-cert|x-client-name|x-auth|x-llmr/`.

- [ ] **Step 2: Write the failing unit tests.**

  `http-boundary.test.mjs`. Replace the bodies of `gateway client inference honors explicit, proxy, API-key, and user-agent identity` and `inferGatewayClient names the developer a Claude apps gateway forwards` with the rule's table, and add the third test. Every `inferGatewayClient(undefined, ...)` call in the file goes, including the two `User-Agent` lines at the end of the first test's body.

  ```js
  const refused = { kind: "refused" };
  const plain = { kind: "key", name: "Team key", trustedForwarder: false };
  const forwarder = { kind: "key", name: "Apps gateway key", trustedForwarder: true };

  test("gateway client inference honors explicit, proxy, API-key, and user-agent identity", () => {
    assert.equal(inferGatewayClient(plain, { "x-llmr-client": "  Desktop App  " }), "Desktop App");
    assert.equal(inferGatewayClient(plain, { "x-client-name": "codex-cli" }), "codex-cli");
    assert.equal(inferGatewayClient(plain, { "user-agent": "codex-cli/1.0" }), "Team key");
    assert.equal(inferGatewayClient(plain, { "user-agent": "codex-cli/1.0", "x-llmr-proxy-mode": "gateway" }), "Codex");
    assert.equal(inferGatewayClient({ kind: "key", trustedForwarder: false }, { "user-agent": "curl/8.0" }), "curl");
    assert.equal(inferGatewayClient(plain, { "x-forwarded-client-cert": "By=spiffe://a;Hash=b" }), "Team key");
    assert.deepEqual(gatewayClientCallerForKey({ id: "key-id", name: " Team key " }), plain);
    assert.deepEqual(gatewayClientCallerForKey({ id: "key-id", trustedForwarder: true }), { kind: "key", name: "key-id", trustedForwarder: true });
    assert.deepEqual(gatewayClientCallerForKey({ id: "profile:codex", trustedForwarder: true }), { kind: "key", name: "profile:codex", trustedForwarder: false });
    assert.equal(isTrustedForwarderKey(undefined), false);
  });

  test("inferGatewayClient names the developer only for a trusted forwarder key", () => {
    const identity = { "x-claude-gateway-user-email": " dev@example.com ", "user-agent": "claude-cli/2.1.310" };
    assert.equal(inferGatewayClient(forwarder, identity), "dev@example.com");
    assert.equal(inferGatewayClient(forwarder, { "x-litellm-end-user-id": "dev@example.com" }), "dev@example.com");
    assert.equal(inferGatewayClient(forwarder, { "x-llmr-client": "Proxy", "x-claude-gateway-user-email": "dev@example.com" }), "Proxy");
    assert.equal(inferGatewayClient(forwarder, { "x-claude-gateway-user-email": "   " }), "Apps gateway key");
    assert.equal(inferGatewayClient(forwarder, { "x-claude-gateway-user-id": "sub-123" }), "Apps gateway key");
    assert.equal(inferGatewayClient(plain, identity), "Team key");
    assert.equal(inferGatewayClient(plain, { "x-litellm-end-user-id": "dev@example.com", "user-agent": "curl/8.0" }), "Team key");
    assert.equal(inferGatewayClient(refused, identity), "Claude");
  });

  test("a refused caller is named from its User-Agent alone, and every label is cut to 120 characters", () => {
    assert.equal(inferGatewayClient(refused, { "x-llmr-client": "Cursor", "x-client-name": "Cursor", "user-agent": "curl/8.0" }), "curl");
    assert.equal(inferGatewayClient(refused, { "x-llmr-client": "Cursor" }), undefined);
    assert.equal(inferGatewayClient(refused, { "user-agent": "custom-client/2.1" }), "custom-client");
    assert.equal(inferGatewayClient(refused, { "user-agent": "u".repeat(300) }), "u".repeat(120));
    assert.equal(inferGatewayClient(plain, { "x-llmr-client": "c".repeat(300) }), "c".repeat(120));
    assert.equal(inferGatewayClient({ kind: "key", name: "n".repeat(300), trustedForwarder: false }, {}), "n".repeat(120));
    assert.equal(inferGatewayClient(forwarder, { "x-claude-gateway-user-email": `${"a".repeat(300)}@example.com` }).length, 120);
  });
  ```

  The key-name line in the third test is from the text audit. A cut that skips the key's name passes every other unit test (run as a mutant).

  `upstream-header-sanitizer.test.mjs`: the last assertion of `Claude apps gateway identity headers are attributed at ingress and never reach the provider` becomes two lines, `inferGatewayClient({ kind: "key", trustedForwarder: true }, request.headers)` equal to `kilgore@kilgore.trout` and `inferGatewayClient({ kind: "refused" }, request.headers)` equal to `Claude`. Add, with `isSensitiveRequestLogHeaderName` imported from `@llmr/core/observability/sensitive-headers.ts`, `for (const name of Object.keys(identity)) assert.equal(isSensitiveRequestLogHeaderName(name), true, name);`.

  `refused-key-requests.test.mjs`: in `the refused key log cuts the client label and the route, and drops the query string`, the first record's headers become `{ "user-agent": "c".repeat(300), "x-llmr-client": "Spoof" }`, and `assert.equal(long.client.length, 60)` becomes `assert.equal(long.client, "c".repeat(120))`. In `a child snapshot is bounded before it is held`, `assert.ok(entry.client.length <= 60)` becomes `assert.equal(entry.client.length, 120)`. That test's client is `"x".repeat(300)`, so `<= 120` would pass with the old 60.

  `router-plugin.test.mjs`, new test `a request that passes with the core token loses the key id headers it sent`: build the plugin as `LLMR router core plugin allows internal core auth tokens before public gateway auth` does, call the hook with `{ authorization: "Bearer core-token", "x-auth-api-key-id": "client", "x-auth-sub": "client" }`, and assert the result is `undefined` and both headers are `undefined`. A second plugin with `publicGatewayMode: false` and the same headers keeps both as `client`.

  `raw-trace-sync.test.mjs`:
  - `raw trace bundle preserves manifest lifecycle metadata`: the client metadata headers become `{ "x-auth-sub": "wire", "x-llmr-client": "opencode" }`. The `opencode` assertion stays. An `x-auth-sub` not in the key list still makes the caller a key, so the display name counts.
  - `raw trace usage capture keeps the client label the request log gets`: the headers become `{ "x-auth-sub": "gw", "x-claude-gateway-user-email": "dev@example.com" }`, and `getConfig` returns `createConfig()` with `APIKEYS` set to `[{ createdAt: new Date(0).toISOString(), id: "gw", key: "gw-token", trustedForwarder: true }]`. Its assertions stay. It is the only test in the file that asserts the email: the logs plan added a helper, `sendUsageTrace`, whose traces carry no headers, and not copies of this test (run). This test is also the one that pins where the mark is read, because it fails when `attemptStoredBundle` does not pass the keys of the config it holds at import (run as a mutant).
  - New test `a trace names the developer only when its key is a trusted forwarder`: write one bundle directory as the lifecycle test does, with client headers `{ "user-agent": "claude-cli/2.1.310", "x-auth-sub": "gw", "x-auth-api-key-id": "***", "x-claude-gateway-user-email": "dev@example.com" }`. Read it with `readRawTraceRequestLogBundle(manifest, spoolDirectory, apiKeys)` and assert `bundle.update.client`: `dev@example.com` with the marked `gw` key, `Claude` with the same key unmarked, and `Claude` with an empty list. Rewrite the metadata with `x-auth-sub: "profile:codex"` and a marked key of that id, and assert `Claude`. Then rewrite it without `x-auth-sub`, add `"x-llmr-client": "Spoof"`, and assert `Claude` with the marked `gw` key.

  `capture-headers.test.mjs`, new test `the proxy names a client from its display name or User-Agent, never from a certificate header`: `inferProxyClient({ "x-forwarded-client-cert": "By=spiffe://a", "user-agent": "curl/8.0" })` is `curl`, and `inferProxyClient({ "x-llmr-client": "kilo" })` is `kilo`. Import it from `@llmr/core/proxy/service.ts`.

- [ ] **Step 3: Run them and see them fail.**

  Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/http-boundary.test.js .test-dist/core/test/unit/gateway/refused-key-requests.test.js .test-dist/core/test/unit/gateway/router-plugin.test.js .test-dist/core/test/unit/gateway/upstream-header-sanitizer.test.js .test-dist/core/test/unit/observability/raw-trace-sync.test.js .test-dist/core/test/unit/proxy/capture-headers.test.js`
  Expected: the build fails, because `gatewayClientCallerForKey`, `isTrustedForwarderKey` and `inferProxyClient` are not exported yet (run). Check its exit code: `node --test` then runs the stale `.test-dist` and reports every test as passing.

- [ ] **Step 4: Implement the rule in `io.ts`.** Delete `clientNameHeaders`. Hold the table above as data: an ordered list of `{ names, when }` entries, where `names` is `clientDisplayNameHeaderNames` with `when: "key"` and `["x-claude-gateway-user-email", "x-litellm-end-user-id"]` with `when: "trustedForwarder"`. `inferGatewayClient` returns the `User-Agent` mapping for a refused caller, and otherwise the first non-empty header of the entries the caller qualifies for, then the name and `User-Agent` in today's order. One `slice(0, maxGatewayClientLabelLength)` at the single return path covers every source. `inferClientFromUserAgent` does not change. `isTrustedForwarderKey` imports `profileIdFromApiKeyId` from `@llmr/core/profiles/api-key`, which imports only `node:crypto` and the contracts (read).

- [ ] **Step 5: Migrate every caller in the same commit.**
  - `pipeline.ts`: `inferGatewayClient(apiKey ? gatewayClientCallerForKey(apiKey) : { kind: "refused" }, request.headers)`. The Cursor call below it takes the same `client` as today.
  - `refused-key-requests.ts`: `refusedKeyRequestEntry` passes `{ kind: "refused" }`. Delete `maxClientLength` and use `maxGatewayClientLabelLength` in `boundedRefusedKeyRequest`.
  - `raw-trace-sync.ts`: `readRawTraceRequestLogBundle` reads the key id with `readHeader(clientRequestHeaders?.["x-auth-sub"])`. With an id the caller is `{ kind: "key", trustedForwarder: isTrustedForwarderKey(apiKeys.find((apiKey) => apiKey.id === id)) }`. Without one it is `{ kind: "refused" }`. Its one production caller, in `attemptStoredBundle`, passes `config.APIKEYS` from the `config` it already holds. Add `ApiKeyConfig` to the file's type import from `@llmr/core/contracts/app`, which names only `AppConfig` today (read).
  - `request-log-store.ts`: the fallback in `standaloneRecordInputFromRawTrace` passes `{ kind: "refused" }`.
  - `sensitive-headers.ts`: add `x-claude-gateway-user-email`, `x-claude-gateway-user-id` and `x-litellm-end-user-id` to `sensitiveRequestLogHeaderNames`, in order. The request log store, the request log runtime, the route trace and the proxy capture already store a sensitive name's value as `[redacted]` (read). The label is computed from the live headers before any of them, so it is unchanged.
  - `router-plugin.ts`: inside `if (publicGatewayMode)` in the `llmr-public-auth-context` `beforeAuth` hook, beside `stripUntrustedLlmrRouteHeaders`, delete `x-auth-api-key-id` and `x-auth-sub` from the request's headers before `resolvePublicGatewayAuth`.
  - `proxy/service.ts`: remove the `x-forwarded-client-cert` line from `inferProxyClient` and export the function. Its records live in memory, capped by `maxNetworkCaptureEntries`, and are not stored, so it gets no length cut. It keeps display names from callers with no key, because B-5 speaks of stored labels (read by the audit).

- [ ] **Step 6: Run the unit tests.** Same command as Step 3. Expected: all pass.

- [ ] **Step 7: Run the wire test.**

  Run: `node build/test.mjs core && LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" node --test .test-dist/core/test/integration/gateway/october-issues-wire.test.js`
  Expected: every test passes, the three new cases and the two matrix cases included (run by the text audit). A failure of the marked request in `single, logs off` alone means the trace did not carry `x-auth-sub`, against both audits' runs. Stop and report. The alternative is a header of LLM Router's own that the hook sets, and that is a design change for the owner to see.

- [ ] **Step 8: Check nothing else calls the old shape.**

  Run: `rtk bypass grep -rn "inferGatewayClient(undefined\|x-forwarded-client-cert\|clientNameHeaders" packages/core/src packages/core/test`
  Expected: nothing under `packages/core/src`. Three lines under `packages/core/test`, all `x-forwarded-client-cert`: the sanitizer test that pins it never reaches a provider, and the two new assertions that it names nothing. Today the grep also finds four `inferGatewayClient(undefined` lines in `http-boundary.test.mjs` and one in `upstream-header-sanitizer.test.mjs` (run by the audit). Step 2 replaces all of them.

- [ ] **Step 9: Change the guide and the harness notes.**
  - `claude-apps-gateway.md`, "Point the gateway at LLMR": after the YAML block's lead-in, the key is described as "a client key created under **API Keys** in LLMR, with **Trusted forwarder** switched on". Add one paragraph after the block: "Switch **Trusted forwarder** on for this key and for no other. LLMR believes the identity headers only on requests sent with a key marked this way, because any holder of a key can send those headers. Use the key for the gateway alone."
  - "What LLMR records": the second sentence starts "For a request sent with a trusted forwarder key, LLMR takes the client label from". Add: "A request sent with any other key is labelled by its key name or its `User-Agent`, whatever identity headers it carries, and a caller refused for its key is named from its `User-Agent` alone. A label is cut to 120 characters. The Logs page stores the identity headers' values as `[redacted]`."
  - "Try it locally": the sentence that ends "LLMR's Logs page shows that e-mail as the client" ends "LLMR's Logs page shows that e-mail as the client, once the key the gateway uses is marked as a trusted forwarder".
  - `docker/claude-apps-gateway/README.md`: the LLM Router row of the table ends "so LLMR's request log attributes each call to the developer's e-mail when the client key is marked as a trusted forwarder". "Run it" reads "a client key created under API Keys with Trusted forwarder switched on". Step 4 of "Sign a Claude Code session in" adds "when the client key is marked as a trusted forwarder" after "reads Client `kilgore@kilgore.trout`". Under "Verified", keep the dated record and add: "Since the release that carries the trusted forwarder mark, a request sent to LLMR directly with those headers and an unmarked key is labelled by its key name or `User-Agent`. Not run again against this harness."

- [ ] **Step 10: Run the gates and commit.** `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`, the last with `LLMR_TEST_GATEWAY_ENTRY` set. Subject: `fix(gateway): take a request's client from identity headers only for a trusted forwarder key`

**VM check, for the end pass.** With the harness in `docker/claude-apps-gateway/`, sign a Claude Code session in through the gateway and send a prompt. With the gateway's key unmarked the Logs row's client is the key's name or `User-Agent` name. With it marked the client is `kilgore@kilgore.trout`. In both, the row's request headers show the identity headers as `[redacted]`. No task waits on this.

---

## Behaviour the audit measured

The text audit of 2026-11-27 found these by building and running the tasks. None is fixed here and none is part of a task. They are for the owner's later review, with the batch's other findings. "Run" means the audit's wire matrix or a test named above.

1. **A trace on disk holds the identity header values of any key.** In the single layout, and in the compatibility layout with request logs on, the trace bundle in the spool holds `x-claude-gateway-user-email`, `x-claude-gateway-user-id` and `x-litellm-end-user-id` as sent, for a marked key and an unmarked one, until the import removes the bundle (run, read from the spool in each mode). The label rule depends on this for a marked key. X-21's limit is on the stored label and the Logs row, not on the spool or its dead-letter folder.
2. **The compatibility layout's Logs row still stores other caller headers whole.** `x-forwarded-client-cert`, `client-cert` and `x-client-name` are in the row's request headers as sent (run). They name nothing and reach no provider. C-2's long certificate value is no longer a label and is still in that row.
3. **A caller can still choose the text of its label.** A refused caller is named from the first token of its `User-Agent`, up to 120 characters, so `User-Agent: someone@example.com` shows that text in the refused-key notice (run with 300 `r`). A caller with a valid key can do the same with a display-name header, as the plan states.
4. **The mark in the config's own key list counts once.** It is stored with a key the list introduces, and ignored for a key that is already stored (run, Task 1 Step 1). The API Keys page is the way to change it.
5. **A marked key with no identity header reads differently in the two layouts**, `Node.js` in the single layout and the key's name or id in the compatibility layout (run). This is "Open with the owner", item 3, for one more caller.
6. **In the single layout a request that passes with the core token is named from its `User-Agent` alone**, because Step 5 removes the key id headers it sent and the hook sets none for it. Its `x-llmr-client` is not read (inferred from the unit test of the hook and the trace rule, not run on the wire). No code in the repo sends that header with the core token (grep).
7. **Step 5's removal also changes what two other readers see.** `routeAuthContext` and the profile lookup in `llm-router-plugin.ts`, and `buildRouteScriptInput`, read `x-auth-api-key-id`. Before this plan a core-token request in the single layout could name any key id to them. After it, such a request has none (read, not run). No code in the repo sends one (grep).
8. **`x-llmr-proxy-mode: gateway` is the caller's own header** and decides whether the key's name or the `User-Agent` comes first (read). Unchanged by this plan.
9. **A key whose id is exactly `profile:`** is not a profile key to `profileIdFromApiKeyId`, so the store keeps its mark, while the page hides the switch for it (read, not run).
10. **One mutant of the rule changes no test:** the fallback in `standaloneRecordInputFromRawTrace` built as a marked key instead of a refused caller. It reads the provider-bound headers, which hold no identity header and no display name the caller sent after Task 3, so the audit found no caller input that shows the difference.
11. **Already on `main`, not from this plan:** in the single layout, of 12 requests for unknown models sent back to back, 8 got a usage event within 70 seconds in two runs, one on `main` `c8efa3a5` and one on the branch, and 7 within 12 seconds in a third. The spool was empty afterwards. The cause was not looked for. Sent 700 ms apart, each of the matrix's 14 accepted requests did, in every run the audit made.

---

## Open with the owner

None of these stops the batch. Each has a default, which is built unless he says otherwise.

**1. The accepted gateway management spec plans the same mark and a different home for the e-mail.** `docs/superpowers/specs/2026-11-24-claude-apps-gateway-management.md`, accepted on 2026-11-24, lists G-5 ("Forwarded identity is trusted from anyone") and G-6 for its phase 0. Its section "Identity from a gateway that forwards to LLMR" gives an API key a flag that lets it forward identity, with a column or a place in the stored limits, and says the flag is for one gateway only and the interface states that (read). That is Task 1 and Task 2's rule, with the same limit in the switch's help text. G-6 then adds a forwarded user id and e-mail to the usage and request-log rows, apart from `client`, and says "`client` goes back to meaning the tool or the key" (read). Task 2 puts the e-mail in `client` for a marked key. So G-6, when built, changes one row of Task 2's table and the guide lines of Step 9. The spec does not mention this plan, and this plan did not know the spec. The delivery index orders neither against the other.

1. Build this batch as planned, and let the spec's phase 0 plan take Tasks 1 and 2 as G-5 done and build G-6 on them. The rule is data, so G-6 moves the trusted forwarder row's two headers out of the label and into the new fields. What G-6 discards is that row and three guide sentences.
2. Fold Tasks 1 and 2 into the spec's phase 0 plan, and build only Task 3 here. Nothing is built twice, and the batch waits for a plan that does not exist yet.
3. Rework Task 2 now to the G-6 shape. That needs a new column on two stores and is G-6's work, not this plan's.

Recommendation: 1. Task 1, the caller plumbing, the refused rule, the cut, the trace lookup and the redaction are what G-6 needs anyway, and phase 0 has no plan yet. Whoever writes the phase 0 plan should read this plan's Task 2 first.

**2. Identity header values are stored as `[redacted]` in Logs headers.** The audit found that the compatibility layout keeps the e-mail of any caller in each Logs row's stored request headers (run). Task 2 adds the three names to the list of sensitive header names, so every layout stores them as `[redacted]`, a marked key's included. The label still shows a marked key's e-mail. The alternative is to remove them from the stored headers only for unmarked keys, which needs the key at the place the row is stored, and to say in X-21 that the label is the only place the plan limits. The default is to redact for every key.

**3. The two layouts name the same request differently, and this plan keeps that.** For a request with a valid key and no display-name header, the compatibility layout shows the key's name (`Profile: Codex`) and the single layout, which is the default, shows the `User-Agent` name (`Codex`). That is today's behaviour, because the trace import never had the key. After Task 2 it has the key's id and could show the key's name too.

1. Leave it, as planned. The default layout's Client Analysis keeps the names it has.
2. Show the key's name in both layouts. One line in `readRawTraceRequestLogBundle` (pass `name`), and every default-layout user's clients change from agent names to key names.
3. Show the `User-Agent` name in both layouts, by dropping the key name from the rule. Rows in the compatibility layout change instead.

Recommendation: 1 now. Option 2 or 3 is a product choice about what "client" means on the dashboard, and the spec's G-6 says it means "the tool or the key", which does not pick one.
