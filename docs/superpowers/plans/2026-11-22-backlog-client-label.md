# Backlog: Client Label Implementation Plan

> **Status, 2026-11-22: draft, not ready to build.** A second-model audit found Blockers in this plan, and none has been checked in the code or corrected here. Do not build from it until its fix round is done. The audit lives outside the repo.

> **Delivery, 2026-11-25.** [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md) groups this plan's unbuilt tasks into batches with other plans' tasks and sets the order. It overrides this plan's lines on branches, on one PR per task, and on waiting for a VM check: the owner's VM pass comes once, at the end.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The client a person reads in Logs and in the usage totals is one LLM Router can stand behind. A developer's email shows only for requests sent with a key the owner marked as a trusted forwarder, a caller without a valid key is named from its `User-Agent` alone, and no label is longer than 120 characters.

**Architecture:** Three tasks, one PR each, in order. Task 1 adds a `trustedForwarder` mark to an API key, stores it with the key and puts a switch on the API Keys page. Task 2 puts the whole label rule in `inferGatewayClient` as data, gives every caller the key it has in hand, and changes the guide in the same PR. Task 3 stops three header names reaching a provider.

**Tech Stack:** TypeScript, `better-sqlite3`, Electron 45, React, `node:test` with `node:assert/strict`, component tests that render with `renderToStaticMarkup`.

**Spec:** [`docs/superpowers/research/2026-11-22-open-items-validation.md`](../research/2026-11-22-open-items-validation.md). Row L-5, findings C-1 to C-7, decisions B-5 and B-10 and outside facts X-16 to X-21 come from that record. Read its "Client identity" section before you start.

**Evidence status.** The plan author read every file, symbol and test named below at `main` `eb84a3ba` on 2026-11-22, and read the keys plan and the logs plan as drafted the same day. One thing was run: the built header sanitizer (`.test-dist/core/runtime/upstream-header-sanitizer.js`) passed `x-client-name`, `client-cert` and `client-cert-chain` from a client request into the provider request, and dropped `x-llmr-client`, `x-forwarded-client-cert` and `x-claude-gateway-user-email`. Nothing else was run and no fix was prototyped, so no size here is measured. Two claims are read and not run, and each is the first step of its task: that a raw trace's client headers carry `x-auth-sub` in both trace modes (Task 2), and that the API Keys components render under `renderToStaticMarkup` (Task 1).

**Built after** [`2026-11-22-backlog-keys.md`](2026-11-22-backlog-keys.md) and [`2026-11-22-backlog-logs.md`](2026-11-22-backlog-logs.md). This plan uses `saveApiKeysConfig(next, base)` and the `setKeys` test helper from the keys plan's Task 1, and the third parameter of `startWireService` and the reason `Invalid API key.` from the logs plan's Task 2. If either plan lands differently, the steps that name those say what to adapt.

## Decisions this plan rests on

- **B-5.** A request's client label takes an identity header (`x-claude-gateway-user-email`, `x-litellm-end-user-id`) only when the request's API key is marked as a trusted forwarder, and never for a refused caller. A refused caller is labelled from `User-Agent` alone. `x-forwarded-client-cert` leaves the label list. Every stored label is cut to a fixed length. The guide gains the step of marking the gateway's key.
- **B-10.** Certificate authentication is not built. No task here parses a certificate header or adds a trusted-proxy setting.
- **X-16, X-17.** A header an intermediary sets must not be something the end caller can set for itself, and the Claude apps gateway does not sign its identity headers. The key the gateway calls with is therefore the only anchor LLM Router has.
- **X-19.** `Client-Cert` and `Client-Cert-Chain` are set by a proxy that ends TLS and are meant for the next hop only. Task 3 keeps them from a provider.
- **X-21.** An email in a label is personal data kept 90 days in usage events. Taking it only from a marked key limits it to setups that asked for it.
- **Plan author, changeable in review without reopening the plan:**
  - The field is `trustedForwarder`, and the column is `trusted_forwarder`.
  - The length is 120 characters, the same bound the refused-key notice already puts on a route and a reason. The notice's own 60 for a client goes away, so one number bounds every label.
  - `x-llmr-client` and `x-client-name` keep naming the client for any caller with a valid key, marked or not. They are display names LLM Router's own Kilo, Kimi, OpenCode and Pi profiles write into the agent's config. A caller without a valid key gets nothing from them.
  - A profile key cannot carry the mark. The store drops it, and the page shows no switch for such a key.
  - The switch's label and help text (Task 1, Step 7) and the guide's wording (Task 2, Step 9).
  - No hint on the Logs page when an identity header from an unmarked key was ignored. See "What a user sees after an upgrade".

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code. Task 1 adds one column to a table every existing database already has, by the column check `ensureUsageSchema` in `packages/core/src/usage/store.ts` uses. It rewrites no row.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json` and never deletes or migrates `~/.claude/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Never pass `--scope`. The wire file needs `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js"` and skips its tests without it.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads. `gateway.md` applies to Tasks 2 and 3, `ui.md` to Task 1, `tests.md` to every test.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and the package suites the task touches.
- No test, script or doc names a real provider host or holds a key. Test keys are made-up strings such as `sk-wire-forwarder-0002`, and test addresses end in `example.com`.
- A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. No task here touches the fork.
- Merging needs the owner's word, once per PR.
- No two PRs of this plan run at the same time. Start each from `main` after the one before it has merged.
- Tasks 1 and 2 ship in the same release. Task 1 alone shows a switch that changes nothing.
- Docs are English only. The guide change rides in Task 2's PR and not straight on `main`, because it describes a step that does nothing until that PR's code is merged.
- The repository is public. Describe a change by what the code does.

## Review Focus

Each line is a condition no row's own test covers. The test that pins it is in the step named at the end.

1. Request logs are off, so the gateway child writes its trace in the redacted mode, where the fork replaces the value of `x-auth-api-key-id` with `***`. A marked key's email still labels the usage event. Task 2, Step 1, the `logs off` case.
2. A caller with a valid unmarked key sends `x-auth-sub` and `x-auth-api-key-id` naming a marked key, with an identity header. The label is not the email. Task 2, Step 1, the unmarked case, and Step 3.
3. A database made before this plan has no `trusted_forwarder` column. It opens, and a mark saves and loads. Task 1, Step 1.
4. A mark set in one window survives a settings save and a key save sent from a list read before the mark was set. Task 1, Step 1.
5. A profile key reaches the store with the mark set, from a hand-edited config or an older page. It is stored without it. Task 1, Step 1.

## Rows this plan closes

| Row | Task |
|---|---|
| L-5 | Task 2 |
| C-1 | Tasks 1 and 2 |
| C-2 | Task 2 |
| C-3 | Task 2 |
| C-4 | Task 2 keeps a refused caller from the rewrite. The rewrite stays for a caller with a valid key. See "The Cursor rewrite" |
| C-5 | Task 3 |

C-6 and C-7 describe the transport and the fork. They need no change under B-10.

## What a user sees after an upgrade

A setup behind a Claude apps gateway stops showing emails. Its rows carry the key's name in the compatibility layout and the `User-Agent` name in the single layout, until the owner opens **API Keys**, edits the gateway's key and switches **Trusted forwarder** on. Rows already stored keep the label they have. No migration marks a key, because nothing in a stored key says which one a gateway uses.

Release note sentence: "A request's client is taken from the Claude apps gateway identity headers only when its API key is marked as a trusted forwarder under API Keys. Mark the key your gateway uses to keep seeing the developer's email."

No hint is built for an ignored header. A hint needs either a field on every row or a counter the gateway child sends to the parent the way the refused-key count travels, and that is a publisher, a status field and a notice. The guide and the release note carry the step instead.

## The Cursor rewrite (C-4)

`prepareCursorOpenAICompatChatBody` in `packages/core/src/gateway/features/cursor-compat.ts` acts when the label is exactly `Cursor`. It adds the system prompt and tools stored in the `cursor-proxy` plugin's config to a chat request that has only user messages, and it changes nothing when that plugin holds neither. No agent profile in this repo writes `x-llmr-client: Cursor`. The label becomes `Cursor` from that header, from a key named `Cursor`, or from the `User-Agent` when the system proxy forwards with `x-llmr-proxy-mode: gateway`. Only `packages/core/src/gateway/request/pipeline.ts` calls it, after authentication, so a refused caller never reaches it. After Task 2 that also holds for the label. A caller with a valid key can still name itself `Cursor` and get the owner's own configured context added to its own request. That is how the feature is switched on, and this plan leaves it. No question for the owner.

---

### Task 1: Mark an API key as a trusted forwarder (C-1)

First, because Task 2's rule reads the mark.

The API Keys page gains a **Trusted forwarder** switch in the Add and Edit dialogs and a tag on a marked key's row. The mark is stored with the key and survives every other write of the key list. It changes nothing until Task 2.

How a key is stored, read in the code. `api_keys` is created by `createSchema` in `packages/core/src/config/config-repository.ts` with `CREATE TABLE IF NOT EXISTS`, so a new column in that statement never reaches an existing database. Every write goes through `replaceApiKeyRows`, every read through `listApiKeys` and `toApiKeyConfig`, and both pass through that file's `uniqueApiKeyConfigs`, which rebuilds each key field by field. `config.ts` has a second `uniqueApiKeyConfigs` and a `parseApiKeyConfig`, and the page has `normalizeApiKeys`, `normalizeApiKeyConfig` and `updateApiKeyEditableConfig`. Each of the six drops a field it does not name. The save RPC passes `ApiKeyConfig[]` whole in both paths (`ipc.ts`, `preload.ts`, `web-client-bridge.ts`, `management-server.ts`), so none of those four files changes.

**Files:**
- Modify: `packages/core/src/contracts/app.ts` (`ApiKeyConfig`)
- Modify: `packages/core/src/config/config-repository.ts` (`createSchema`, `StoredApiKeyRow`, `toStoredApiKeyRow`, `toApiKeyConfig`, `listApiKeys`, `replaceApiKeyRows`, `uniqueApiKeyConfigs`)
- Modify: `packages/core/src/config/config.ts` (`uniqueApiKeyConfigs`, `parseApiKeyConfig`)
- Modify: `packages/ui/src/pages/home/shared/api-keys.ts`, `packages/ui/src/pages/home/shared/types.ts` (`AddApiKeyDraft`), `packages/ui/src/pages/home/components/api-keys.tsx`, `packages/ui/src/pages/home/App.tsx` (the `apiKeyEdit` props)
- Create: `packages/core/test/unit/config/config-repository-trusted-forwarder-column.test.mjs`, `packages/ui/test/component/api-keys.test.tsx`
- Test: `packages/core/test/unit/config/config-credential-writes.test.mjs`, `packages/ui/test/unit/api-keys.test.ts`

**Interfaces:**
- Produces: `trustedForwarder?: boolean` on `ApiKeyConfig`, after `name`. It is present only when `true`. Every copy site writes it as `...(value.trustedForwarder === true ? { trustedForwarder: true } : {})`, so a key without the mark is the same object it is today and every existing `deepEqual` on a key holds.
- Produces: column `trusted_forwarder INTEGER NOT NULL DEFAULT 0` on `api_keys`.
- Produces: `trustedForwarder: boolean` on `AddApiKeyDraft`, and `showTrustedForwarder: boolean` on the props of `EditApiKeyDialog`.
- Consumes from the keys plan: `saveApiKeysConfig(next: ApiKeyConfig[], base: ApiKeyConfig[])`, `updatePersistedApiKeys(update)`, and the `setKeys(keys)` helper in `config-credential-writes.test.mjs`. The keys plan's merge replaces a stored row with the caller's whole entry when that entry differs from its `base` entry, and leaves the row alone when it does not. Step 1's second test rests on that. If the merge as built rebuilds a row field by field, add `trustedForwarder` there.
- Consumes: `profileIdFromApiKeyId(value)` from `@llmr/core/profiles/api-key`, which is `undefined` for any id that is not `profile:<id>`.

- [ ] **Step 1: Write the failing core tests.**

  In `config-credential-writes.test.mjs`:

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
  - `config-repository.ts`, `createSchema`: add `trusted_forwarder INTEGER NOT NULL DEFAULT 0` as the last column of the `CREATE TABLE IF NOT EXISTS api_keys` statement. After the `database.exec` that creates the tables, read `PRAGMA table_info(api_keys)` with `queryRows` and run `ALTER TABLE api_keys ADD COLUMN trusted_forwarder INTEGER NOT NULL DEFAULT 0` when no row is named `trusted_forwarder`.
  - `listApiKeys` selects `trusted_forwarder`. `StoredApiKeyRow` gains `trustedForwarder: boolean`, which `toStoredApiKeyRow` sets from `Number(row.trusted_forwarder) === 1` and `toApiKeyConfig` copies by the rule under Interfaces. `replaceApiKeyRows` names the column and writes `1` or `0`.
  - Leave `readLegacyApiKeyRows` and `insertRawApiKeyRows` as they are. A legacy database has no such column, and the insert names its seven columns, so the default applies.

- [ ] **Step 4: Carry the field through the three core copy sites.** The repository's `uniqueApiKeyConfigs` carries the mark only when it is `true` and `profileIdFromApiKeyId(id)` is `undefined`. This is the one place the profile rule lives, and every read and write of the table passes it. `config.ts`'s `uniqueApiKeyConfigs` and `parseApiKeyConfig` carry it by the rule under Interfaces, so a key in a config file can hold `"trustedForwarder": true`.

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

  New file `packages/ui/test/component/api-keys.test.tsx`. Its first test is also the check that these components render statically, which nobody has run. Import `ApiKeysView` and `EditApiKeyDialog` from `@llmr/ui/pages/home/components/api-keys.tsx`, `createApiKeyEditDraft` and `createApiKeyList` from `@llmr/ui/pages/home/shared/api-keys.ts`, and `createDefaultAppConfig` from `@llmr/core/config/default-config.ts`. Build `config` with `APIKEYS` of the `marked` key above and a second key `{ createdAt: "2026-01-01T00:00:00.000Z", id: "plain", key: "sk-plain-key-0002", name: "Plain" }`.

  - `the API Keys list tags a trusted forwarder key and no other`: render `ApiKeysView` with `createApiKeyList(config)` and no-op handlers. Assert the markup holds `Trusted forwarder` exactly once.
  - `the edit dialog shows the trusted forwarder switch on, and hides it for a profile key`: render `EditApiKeyDialog` with `draft: createApiKeyEditDraft(marked)`, `canSubmit: true`, `error: ""`, no-op handlers and `showTrustedForwarder: true`. Assert the markup matches `/role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/`. Render it again with `showTrustedForwarder: false` and assert it does not match `/role="switch"/`.

  If `ApiKeysView` cannot render statically because of its motion wrappers, keep the dialog test, move the list assertion into it by exporting the row's tag as a small component, and say so in the PR.

- [ ] **Step 7: Implement the page.**
  - `types.ts`: `trustedForwarder: boolean` on `AddApiKeyDraft`.
  - `shared/api-keys.ts`: `createApiKeyDraft` sets it `false`. `createApiKeyEditDraft` sets it from `apiKey.trustedForwarder === true`. `normalizeApiKeys`, `normalizeApiKeyConfig`, `createGeneratedApiKey` and `updateApiKeyEditableConfig` carry it by the rule under Interfaces, the last two reading the draft.
  - `components/api-keys.tsx`: one component `TrustedForwarderField({ checked, onChange })`, rendered in `AddApiKeyDialog` and, when `showTrustedForwarder` is true, in `EditApiKeyDialog`, in both above `ApiKeyAdvancedSettings`. It is a `Switch` from `../shared/index` with `aria-label="Trusted forwarder"`, the label `Trusted forwarder`, and the help text `Take the client shown in Logs from the identity headers sent with this key. Switch it on only for the key a Claude apps gateway uses.` In `ApiKeysView`, a marked key's Name cell shows the text `Trusted forwarder` under the name, in the row's muted `text-[11px]` style.
  - `App.tsx`: the `apiKeyEdit` props gain `showTrustedForwarder: !apiKeyEditItem.key.id.startsWith("profile:")`.

- [ ] **Step 8: Verify.**

  Run: `node build/test.mjs ui && node --test .test-dist/ui/test/unit/api-keys.test.js .test-dist/ui/test/component/api-keys.test.js`
  Expected: every test passes.
  Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron`
  Expected: all pass.

- [ ] **Step 9: Commit.** Subject: `feat(api-keys): mark a key as a trusted forwarder`

---

### Task 2: Take the client label from a rule that knows the caller (L-5, C-1 to C-4)

After Task 1, because the rule reads the mark.

Today any caller names itself in Logs and in the usage totals with a header, a caller with no valid key included, and a long header value is stored whole. After this task a request sent with a marked key shows the forwarded email, a request sent with any other valid key shows its display name, key name or `User-Agent`, and a caller refused for its key shows its `User-Agent` name only. No label is longer than 120 characters. `x-forwarded-client-cert` names nothing.

**The rule, in one place.** `inferGatewayClient` takes who is calling and the headers.

| Caller | Sources, first non-empty wins |
|---|---|
| Refused, or unknown | The `User-Agent` mapping |
| A valid key | `x-llmr-client`, `x-client-name`, then the key's name or the `User-Agent` mapping in today's order (`x-llmr-proxy-mode: gateway` puts the `User-Agent` first) |
| A valid key marked as a trusted forwarder | `x-llmr-client`, `x-client-name`, `x-claude-gateway-user-email`, `x-litellm-end-user-id`, then as above |

The result is cut to `maxGatewayClientLabelLength`.

**What each caller has in hand, read in the code.**

| Caller | Key in hand today | After this task |
|---|---|---|
| `pipeline.ts`, `proxyRequest` | The `apiKey` `authorize` returned | `gatewayClientCallerForKey(apiKey)` |
| `refused-key-requests.ts`, `refusedKeyRequestEntry`, for LLM Router's own front and for the child's `beforeAuth` hook | None, and the caller was refused | `{ kind: "refused" }` |
| `raw-trace-sync.ts`, `readRawTraceRequestLogBundle`, the only label source in the single layout | None | The key id from the trace's `x-auth-sub` header, looked up in the config's keys for its mark. No name, so the single layout keeps naming a request from its `User-Agent`, as it does today |
| `request-log-store.ts`, `standaloneRecordInputFromRawTrace`, used when the trace gave no label | None, and the headers are the provider-bound ones | `{ kind: "refused" }` |

**How the trace import learns the key (read, not run).** In the single layout the gateway child's `beforeAuth` hook writes `x-auth-api-key-id` and `x-auth-sub` onto the request for a valid key (`setApiKeyAuthContextHeaders`, `router-plugin.ts`). The fork passes the hook the Fastify request itself (`createGatewayPluginPreAuthHandler`, `src/gateway/routes.ts`) and later writes that request's headers into the trace's `client_request_metadata` part (`publishRawTraceCaptureSafe`, `src/gateway/handler.ts`, fork `v1.0.22-llmr.3`). With request logs off the single layout still writes a trace (`standaloneUsageCapture` in `config-compiler.ts`), in `body_redacted` mode (`buildRawTraceConfig`), where the fork replaces the value of any header whose name holds `apikey`, so `x-auth-api-key-id` reads `***`. `x-auth-sub` holds the same id and is not replaced. The rule therefore reads `x-auth-sub`. Step 1's wire cases are the check. If the `logs off` case fails because the trace holds no usable `x-auth-sub`, stop and report: the alternative is a header of LLM Router's own that the hook sets, and that is a design change for the owner to see.

The hook sets those two headers only when a key resolves, so a request that passes with the internal core token keeps whatever the caller sent. Step 3 removes both at the top of the hook in the single layout. In the compatibility layout the parent's pipeline sets them and the hook leaves them.

**Files:**
- Modify: `packages/core/src/gateway/internal/shared.ts`, `packages/core/src/gateway/http/io.ts`, `packages/core/src/gateway/request/pipeline.ts`, `packages/core/src/gateway/auth/refused-key-requests.ts`, `packages/core/src/observability/raw-trace-sync.ts`, `packages/core/src/observability/request-log-store.ts`, `packages/core/src/gateway/core-runtime/router-plugin.ts`, `packages/core/src/proxy/service.ts`
- Modify: `docs/src/content/docs/en/guides/claude-apps-gateway.md`, `docker/claude-apps-gateway/README.md`
- Test: `packages/core/test/unit/gateway/http-boundary.test.mjs`, `packages/core/test/unit/gateway/upstream-header-sanitizer.test.mjs`, `packages/core/test/unit/gateway/refused-key-requests.test.mjs`, `packages/core/test/unit/gateway/router-plugin.test.mjs`, `packages/core/test/unit/observability/raw-trace-sync.test.mjs`, `packages/core/test/unit/proxy/capture-headers.test.mjs`, `packages/core/test/integration/gateway/october-issues-wire.test.mjs`

**Interfaces:**
- Consumes: `trustedForwarder?: boolean` on `ApiKeyConfig` (Task 1).
- Consumes from the logs plan: `startWireService(t, layout, configure?: (config) => void)` and the refusal reason `Invalid API key.`. If the logs plan has not added the third parameter, add it here: it runs on the config just before `service.start`.
- Produces in `shared.ts`, beside `claudeAppsGatewayIdentityHeaderNames`: `export const clientDisplayNameHeaderNames = ["x-llmr-client", "x-client-name"] as const;`. Task 3 uses it.
- Produces in `io.ts`:

  ```ts
  export const maxGatewayClientLabelLength = 120;
  export type GatewayClientCaller =
    | { kind: "refused" }
    | { kind: "key"; name?: string; trustedForwarder: boolean };
  export function gatewayClientCallerForKey(apiKey: Pick<ApiKeyConfig, "id" | "name" | "trustedForwarder">): GatewayClientCaller;
  export function inferGatewayClient(caller: GatewayClientCaller, headers: IncomingHttpHeaders): string | undefined;
  ```

  `gatewayClientCallerForKey` returns `kind: "key"`, `name` from the key's trimmed name or else its trimmed id, and `trustedForwarder` true only for `apiKey.trustedForwarder === true`.
- Changes: `readRawTraceRequestLogBundle(manifest, spoolDirectory = RAW_TRACE_SPOOL_DIR, apiKeys: readonly ApiKeyConfig[] = [])`.
- Changes: `inferProxyClient` in `proxy/service.ts` becomes an export, for its test.
- The logs plan's "Waiting for B-5" table lists these same functions. It expects `api-key-authorizer.ts` to change. It does not: `authorize` keeps passing `request.headers`, and the refused rule lives in `refusedKeyRequestEntry`.

- [ ] **Step 1: Write the wire test that settles the trace question.** In `october-issues-wire.test.mjs`, add a loop over `["single", "compat", "single, logs off"]` with the test `the client label follows the key's trusted forwarder mark (${name})`. Start with `startWireService(t, layout, configure)`, where `configure` appends `{ createdAt: new Date(0).toISOString(), id: "forwarder", key: "sk-wire-forwarder-0002", trustedForwarder: true }` to `config.APIKEYS` and, for the third case, sets `config.observability.requestLogs = false`. Send three chat completions for models no provider has, as the test above it does, each with its own model name so its usage event can be found:

  | Request | Headers besides `content-type` | Status |
  |---|---|---|
  | marked | `authorization: Bearer sk-wire-forwarder-0002`, `x-claude-gateway-user-email: dev@example.com` | 400 |
  | unmarked | `authorization: Bearer sk-wire-key-0001`, `x-claude-gateway-user-email: other@example.com`, `x-auth-sub: forwarder`, `x-auth-api-key-id: forwarder` | 400 |
  | refused | `authorization: Bearer sk-wrong-key-7777`, `x-llmr-client: Spoof`, `x-claude-gateway-user-email: other@example.com` | 401 |

  Read each label from `usage_events` with `database.prepare("SELECT client FROM usage_events WHERE model = ?").all(model)`, polling with `until` as the test above does. Assertions:
  - marked: `[{ client: "dev@example.com" }]` in all three cases.
  - unmarked: `[{ client: "Node.js" }]` in the two single cases, because the trace import passes no key name and the test's `fetch` sends a `User-Agent` of `node`. `[{ client: "wire" }]` in `compat`, the key's id, because the key has no name.
  - With logs on, the Logs row for each of the two models has the same `client` as its usage event.
  - refused: `service.getStatus().refusedForKey.recent[0].client` is `Node.js`, and its `reason` is `Invalid API key.`.
  - `JSON.stringify` of the usage rows, the Logs rows and `refusedForKey` holds neither `other@example.com` nor `Spoof`.

- [ ] **Step 2: Write the failing unit tests.**

  `http-boundary.test.mjs`. Replace the bodies of `gateway client inference honors explicit, proxy, API-key, and user-agent identity` and `inferGatewayClient names the developer a Claude apps gateway forwards` with the rule's table, and add the third test:

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
  });

  test("inferGatewayClient names the developer only for a trusted forwarder key", () => {
    const identity = { "x-claude-gateway-user-email": " dev@example.com ", "user-agent": "claude-cli/2.1.310" };
    assert.equal(inferGatewayClient(forwarder, identity), "dev@example.com");
    assert.equal(inferGatewayClient(forwarder, { "x-litellm-end-user-id": "dev@example.com" }), "dev@example.com");
    assert.equal(inferGatewayClient(forwarder, { "x-llmr-client": "Proxy", "x-claude-gateway-user-email": "dev@example.com" }), "Proxy");
    assert.equal(inferGatewayClient(forwarder, { "x-claude-gateway-user-email": "   " }), "Apps gateway key");
    assert.equal(inferGatewayClient(forwarder, { "x-claude-gateway-user-id": "sub-123" }), "Apps gateway key");
    assert.equal(inferGatewayClient(plain, identity), "Team key");
    assert.equal(inferGatewayClient(refused, identity), "Claude");
  });

  test("a refused caller is named from its User-Agent alone, and every label is cut to 120 characters", () => {
    assert.equal(inferGatewayClient(refused, { "x-llmr-client": "Cursor", "x-client-name": "Cursor", "user-agent": "curl/8.0" }), "curl");
    assert.equal(inferGatewayClient(refused, { "x-llmr-client": "Cursor" }), undefined);
    assert.equal(inferGatewayClient(refused, { "user-agent": "custom-client/2.1" }), "custom-client");
    assert.equal(inferGatewayClient(refused, { "user-agent": "u".repeat(300) }), "u".repeat(120));
    assert.equal(inferGatewayClient(plain, { "x-llmr-client": "c".repeat(300) }), "c".repeat(120));
    assert.equal(inferGatewayClient(forwarder, { "x-claude-gateway-user-email": `${"a".repeat(300)}@example.com` }).length, 120);
  });
  ```

  `upstream-header-sanitizer.test.mjs`: the last assertion of `Claude apps gateway identity headers are attributed at ingress and never reach the provider` becomes two lines, `inferGatewayClient({ kind: "key", trustedForwarder: true }, request.headers)` equal to `kilgore@kilgore.trout` and `inferGatewayClient({ kind: "refused" }, request.headers)` equal to `Claude`.

  `refused-key-requests.test.mjs`: in `the refused key log cuts the client label and the route, and drops the query string`, the first record's headers become `{ "user-agent": "c".repeat(300), "x-llmr-client": "Spoof" }`, and the assertion becomes `assert.equal(long.client, "c".repeat(120))`. In `a child snapshot is bounded before it is held`, `entry.client.length <= 60` becomes `<= 120`.

  `router-plugin.test.mjs`, new test `a request that passes with the core token loses the key id headers it sent`: build the plugin as `LLMR router core plugin allows internal core auth tokens before public gateway auth` does, call the hook with `{ authorization: "Bearer core-token", "x-auth-api-key-id": "client", "x-auth-sub": "client" }`, and assert the result is `undefined` and both headers are `undefined`. A second plugin with `publicGatewayMode: false` and the same headers keeps both as `client`.

  `raw-trace-sync.test.mjs`:
  - `raw trace bundle preserves manifest lifecycle metadata`: the client metadata headers become `{ "x-auth-sub": "wire", "x-llmr-client": "opencode" }`. The `opencode` assertion stays.
  - `raw trace usage capture keeps the client label the request log gets`: the headers become `{ "x-auth-sub": "gw", "x-claude-gateway-user-email": "dev@example.com" }`, and `getConfig` returns `createConfig()` with `APIKEYS` of `{ createdAt: new Date(0).toISOString(), id: "gw", key: "gw-token", trustedForwarder: true }`. Its assertions stay. The logs plan copies this test three times. Give each copy that still asserts the email the same two changes.
  - New test `a trace names the developer only when its key is a trusted forwarder`: write one bundle directory as the lifecycle test does, with client headers `{ "user-agent": "claude-cli/2.1.310", "x-auth-sub": "gw", "x-auth-api-key-id": "***", "x-claude-gateway-user-email": "dev@example.com" }`. Read it three times with `readRawTraceRequestLogBundle(manifest, spoolDirectory, apiKeys)` and assert `bundle.update.client`: `dev@example.com` with the marked `gw` key, `Claude` with the same key unmarked, and `Claude` with an empty list. Then rewrite the metadata without `x-auth-sub`, add `"x-llmr-client": "Spoof"`, and assert `Claude` with the marked key.

  `capture-headers.test.mjs`, new test `the proxy names a client from its display name or User-Agent, never from a certificate header`: `inferProxyClient({ "x-forwarded-client-cert": "By=spiffe://a", "user-agent": "curl/8.0" })` is `curl`, and `inferProxyClient({ "x-llmr-client": "kilo" })` is `kilo`.

- [ ] **Step 3: Run them and see them fail.**

  Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/http-boundary.test.js .test-dist/core/test/unit/gateway/refused-key-requests.test.js .test-dist/core/test/unit/gateway/router-plugin.test.js .test-dist/core/test/unit/observability/raw-trace-sync.test.js .test-dist/core/test/unit/proxy/capture-headers.test.js`
  Expected: the new and changed tests fail. `gatewayClientCallerForKey` and `inferProxyClient` are not exported.

- [ ] **Step 4: Implement the rule in `io.ts`.** Delete `clientNameHeaders`. Hold the table above as data: an ordered list of `{ names, when }` entries, where `names` is `clientDisplayNameHeaderNames` with `when: "key"` and `["x-claude-gateway-user-email", "x-litellm-end-user-id"]` with `when: "trustedForwarder"`. `inferGatewayClient` returns the `User-Agent` mapping for a refused caller, and otherwise the first non-empty header of the entries the caller qualifies for, then the name and `User-Agent` in today's order. One `slice(0, maxGatewayClientLabelLength)` at the single return path covers every source. `inferClientFromUserAgent` does not change.

- [ ] **Step 5: Migrate every caller in the same commit.**
  - `pipeline.ts`: `inferGatewayClient(apiKey ? gatewayClientCallerForKey(apiKey) : { kind: "refused" }, request.headers)`. The Cursor call below it takes the same `client` as today.
  - `refused-key-requests.ts`: `refusedKeyRequestEntry` passes `{ kind: "refused" }`. Delete `maxClientLength` and use `maxGatewayClientLabelLength` in `boundedRefusedKeyRequest`.
  - `raw-trace-sync.ts`: `readRawTraceRequestLogBundle` reads the key id with `readHeader(clientRequestHeaders?.["x-auth-sub"])`. With an id the caller is `{ kind: "key", trustedForwarder: <the mark of the key in apiKeys with that id, false when none> }`. Without one it is `{ kind: "refused" }`. Its one production caller, in `attemptStoredBundle`, passes `config.APIKEYS` from the `config` it already holds.
  - `request-log-store.ts`: the fallback in `standaloneRecordInputFromRawTrace` passes `{ kind: "refused" }`.
  - `router-plugin.ts`: inside `if (publicGatewayMode)`, beside `stripUntrustedLlmrRouteHeaders`, delete `x-auth-api-key-id` and `x-auth-sub` from the request's headers before `resolvePublicGatewayAuth`.
  - `proxy/service.ts`: remove the `x-forwarded-client-cert` line from `inferProxyClient` and export the function. Its records live in memory, capped by `maxNetworkCaptureEntries`, and are not stored, so it gets no length cut.

- [ ] **Step 6: Run the unit tests.** Same command as Step 3, plus `.test-dist/core/test/unit/gateway/upstream-header-sanitizer.test.js`. Expected: all pass.

- [ ] **Step 7: Run the wire test.**

  Run: `node build/test.mjs core && LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" node --test .test-dist/core/test/integration/gateway/october-issues-wire.test.js`
  Expected: every test passes, the three new cases included. A failure of the marked request in `single, logs off` alone means the trace did not carry `x-auth-sub`. Stop and report, as the section above says.

- [ ] **Step 8: Check nothing else calls the old shape.**

  Run: `rtk bypass grep -rn "inferGatewayClient(undefined\|x-forwarded-client-cert\|clientNameHeaders" packages/core/src packages/core/test`
  Expected: nothing under `packages/core/src`. Three lines under `packages/core/test`, all `x-forwarded-client-cert`: the sanitizer test that pins it never reaches a provider, and the two new assertions that it names nothing.

- [ ] **Step 9: Change the guide and the harness notes.**
  - `claude-apps-gateway.md`, "Point the gateway at LLMR": after the YAML block's lead-in, the key is described as "a client key created under **API Keys** in LLMR, with **Trusted forwarder** switched on". Add one paragraph after the block: "Switch **Trusted forwarder** on for this key and for no other. LLMR believes the identity headers only on requests sent with a key marked this way, because any holder of a key can send those headers. Use the key for the gateway alone."
  - "What LLMR records": the second sentence starts "For a request sent with a trusted forwarder key, LLMR takes the client label from". Add: "A request sent with any other key is labelled by its key name or its `User-Agent`, whatever identity headers it carries, and a caller refused for its key is named from its `User-Agent` alone. A label is cut to 120 characters."
  - `docker/claude-apps-gateway/README.md`: the LLM Router row of the table ends "so LLMR's request log attributes each call to the developer's e-mail when the client key is marked as a trusted forwarder". "Run it" reads "a client key created under API Keys with Trusted forwarder switched on". Step 4 of "Sign a Claude Code session in" says the same of the key. Under "Verified", keep the dated record and add: "Since the release that carries the trusted forwarder mark, a request sent to LLMR directly with those headers and an unmarked key is labelled by its key name or `User-Agent`. Not run again against this harness."

- [ ] **Step 10: Run the gates and commit.** `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`, the last with `LLMR_TEST_GATEWAY_ENTRY` set. Subject: `fix(gateway): take a request's client from identity headers only for a trusted forwarder key`

---

### Task 3: Keep three more header names from a provider (C-5)

Last, because nothing depends on it. It uses the list Task 2 added.

A caller's `x-client-name`, and the `Client-Cert` and `Client-Cert-Chain` headers a TLS-ending proxy adds (X-19), reach the provider today. The plan author ran the built sanitizer and saw all three in the provider request. After this task none does. A routing rule on `request.header.x-client-name` is not affected, because rules read the request as it came in, and the removal happens where the provider request is built. A header of the same name that a provider's own configuration sets is kept, as it is for the other front-door names.

**Files:**
- Modify: `packages/core/src/gateway/internal/front-door-headers.ts`, `packages/core/src/gateway/core-runtime/upstream-header-sanitizer.ts`
- Test: `packages/core/test/unit/gateway/upstream-header-sanitizer.test.mjs`

**Interfaces:**
- Consumes: `clientDisplayNameHeaderNames` from `@llmr/core/gateway/internal/shared` (Task 2).
- Produces: nothing a later task uses.

- [ ] **Step 1: Extend the failing test.** In `gateway sanitizer hook does not forward reverse proxy metadata to providers`, add three client request headers, `"client-cert": ":MIIB:"`, `"client-cert-chain": ":MIIC:"` and `"x-client-name": "codex-cli"`, and one header on `upstreamRequest.headers`, `"x-client-name": "provider-set"`. The expected headers become `{ "content-type": "application/json", "x-client-name": "provider-set", "x-custom-provider-header": "custom-value" }`.

- [ ] **Step 2: Run it and see it fail.**

  Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/upstream-header-sanitizer.test.js`
  Expected: FAIL, with `client-cert` and `client-cert-chain` present in the result.

- [ ] **Step 3: Remove the three names from the client side.** Add `client-cert` and `client-cert-chain` to `frontDoorHeaderNames`, in order. In `mergeUpstreamProviderHeaders`, the loop over `requestHeaders` also skips a name in `clientDisplayNameHeaderNames`. `sanitizeUpstreamProviderHeaders` does not change, so a provider's own header survives.

- [ ] **Step 4: Verify.** Same command as Step 2. Expected: PASS. Then `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`.

- [ ] **Step 5: Commit.** Subject: `fix(gateway): stop x-client-name and the client certificate headers reaching a provider`

---

## Open with the owner

No task waits on a decision. One point for the owner to see, which blocks nothing.

**The two layouts name the same request differently, and this plan keeps that.** For a request with a valid key and no display-name header, the compatibility layout shows the key's name (`Profile: Codex`) and the single layout, which is the default, shows the `User-Agent` name (`Codex`). That is today's behaviour: the trace import never had the key. After Task 2 it has the key's id and could show the key's name too.

1. Leave it, as planned. The default layout's Client Analysis keeps the names it has.
2. Show the key's name in both layouts. One line in `readRawTraceRequestLogBundle` (pass `name`), and every default-layout user's clients change from agent names to key names.
3. Show the `User-Agent` name in both layouts, by dropping the key name from the rule. Rows in the compatibility layout change instead.

Recommendation: 1 now. Option 2 or 3 is a product choice about what "client" means on the dashboard, and neither is needed to close a row.
