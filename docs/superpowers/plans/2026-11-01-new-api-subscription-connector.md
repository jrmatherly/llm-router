# New API Subscription Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `new-api-account` plugin, which cannot read upstream New API's subscription response, with a built-in connector that reports subscription quota on Desktop, CLI and Docker.

**Architecture:** Add a `new-api-subscription-self` parser beside the two existing New API parsers in `account-service.ts`, and a connector template beside `newApiUserSelfConnectorConfig`. Authentication is an `http-json` request with an access token holding `wallet:read`, so no browser session is involved. Then delete the plugin and all of its build wiring, because it was the last user of that wiring.

**Tech Stack:** TypeScript, `node:test`, esbuild, electron-builder.

**Spec:** None. Jason chose this direction on 2026-11-01 after the investigation summarized under Evidence, which stands in for a spec.

## Evidence

Upstream is `QuantumNous/new-api`, read at `main` on 2026-11-01. No live server was tested. Re-check these if execution starts much later.

- `GET /api/subscription/self` returns `{ success, message, data: { billing_preference, subscriptions, all_subscriptions } }` (`controller/subscription.go`, `GetSubscriptionSelf`). It returned the same keys on 2026-08-18, when the plugin was written.
- `subscriptions` holds active subscriptions only (`status = active AND end_time > now`, `GetAllActiveUserSubscriptions`). Each item is `{ subscription: UserSubscription }` (`model/subscription.go:295`).
- `UserSubscription` has `amount_total` and `amount_used` (int64 quota units), and `end_time` and `next_reset_time` (Unix seconds, `0` when unset).
- `amount_total` is copied from the plan's `TotalAmount`, where `0 = unlimited` (`model/subscription.go:181`, `:539`).
- A user can hold several active subscriptions.
- Access tokens reach this route with scope `wallet:read` (`middleware/access_token_routes.go:127`). `New-Api-User` plays no part in access token auth on current upstream (`docs/authentication.md:146`), and legacy access tokens are rejected with `ACCESS_TOKEN_LEGACY_RETIRED` (`middleware/auth.go`). Older instances may still need the header, so the template sends it only when the user supplies an ID.
- Auth failures return non-2xx, which `readJsonResponse` already turns into a connector error.
- The plugin throws `New API subscription response did not include quota fields.` on upstream's shape, reproduced with mocked responses. Its test passes because the fixture uses a flat `quota` field upstream does not return.
- The plugin was never auto-loaded. The loader removed in `b411aca6` accepted only Claude Design and Claude Ship.

These LLMR behaviors shape the design, read at `efdd27c5`:

- All connectors run, and `mergeConnectorResults` merges their meters by id. An explicit `status` on any result overrides `statusFromMeters` for the whole snapshot, so the new parser must not return one, or it could hide a critical meter from another connector.
- With no meters and no errors, a snapshot's status is `unsupported`. That is what a user with no subscription and no other connector sees, beside the message.
- `formatProviderAccountMeterValue` displays `remaining ?? used ?? limit` with the meter's label and no hint about which one it is. A used-only meter therefore needs a label that says so.
- The connector template button renders only in `Raw connector JSON` mode, and only when New API was detected or the JSON already names a New API parser. A proxy that strips the `x-new-api-version` header hides it, so the docs need the JSON too.
- `Test first JSON connector` tests only the first one. The template appends, so with the auto-added key usage connector first, the button does not test the subscription connector.

## Known Limits

- With a credential pool, connectors run once per credential, so the same subscription meter repeats per credential. The user balance connector behaves the same way. Left as is.
- `results.find((result) => result.message)` keeps the first message, so a key usage message can appear beside a working subscription meter. Also existing behavior.

## Global Constraints

- Code goes through a branch and a squash-merged PR. Branch: `feat/new-api-subscription-connector`.
- Double quotes, semicolons, two-space indent, no comments except a non-obvious why. Read a file with Read before editing it, since `.claude/rules/` load only on Read, Edit and Write.
- Core tests are `*.test.mjs` under `packages/core/test`. They compile to `.test-dist/<pkg>/test/.../<name>.test.js`.
- `packages/core/src/providers/new-api.ts` must stay free of `node:`, `better-sqlite3` and Electron imports, because the renderer imports it (`.claude/rules/ui.md`).
- Keep the documented `fetchProviderAccountJson` extension API in `packages/core/src/plugins/service.ts` and `docs/src/content/docs/en/configuration/extensions.md`. Only the plugin goes.
- This plan cuts no release. Removing a plugin that was never auto-loaded and cannot work suggests a minor bump to 7.2.0, which the README note in Task 3 assumes.

## Review Focus

Each line below has its test in the owning task.

1. A capped subscription beside an unlimited one must not report a misleading limit, and its used amount must not read as quota left. The meter has no limit or remaining, and its label says it shows usage (Task 1).
2. A user with no active subscription sees a plain message and no meter, with no connector error (Task 1).
3. `amount_used` above `amount_total` never shows negative remaining (Task 1).
4. Malformed items (`subscription: null`, missing fields, numeric strings) are skipped or normalized, and never throw (Task 1).
5. Someone who installed the old plugin by module path upgrades to an app without that file. The app still starts and other plugins still load (Task 3).

---

### Task 1: Subscription parser and connector config

**Files:**
- Modify: `packages/core/src/contracts/app.ts:277`
- Modify: `packages/core/src/providers/new-api.ts`
- Modify: `packages/core/src/providers/account-service.ts` (test helpers near `:287`, parser dispatch near `:243`, `:771`, `:824`, meter functions near `:1113`)
- Test: `packages/core/test/unit/providers/provider-probe.test.mjs`
- Create: `packages/core/test/unit/providers/new-api-subscription-snapshot.test.mjs`

**Interfaces:**
- Produces: `newApiSubscriptionSelfConnectorConfig(baseUrl: string): ProviderAccountHttpJsonConnectorConfig` and `newApiSubscriptionSelfEndpoint(baseUrl: string): string`, both exported from `@llmr/core/providers/new-api`.
- Produces: parser id `"new-api-subscription-self"` on `ProviderAccountHttpJsonParser`.
- Produces: `newApiSubscriptionSelfMetersForTest(payload: unknown): ProviderAccountMeter[]` and `newApiSubscriptionSelfFallbackMessageForTest(payload: unknown): string`, exported from `account-service.ts`.

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/new-api-subscription-connector
```

- [ ] **Step 2: Write the failing tests**

Add to `provider-probe.test.mjs`, extending its existing imports from `account-service.ts` and `new-api.ts`. `sub` is a local helper that wraps its argument as `{ subscription: ... }`, and `payloadOf(list)` builds `{ success: true, message: "", data: { billing_preference: "subscription_first", subscriptions: list, all_subscriptions: list } }`.

```js
test("New API subscription config targets the root subscription route with a token placeholder", () => {
  const connector = newApiSubscriptionSelfConnectorConfig("https://gateway.example/v1");
  assert.equal(connector.endpoint, "https://gateway.example/api/subscription/self");
  assert.equal(connector.parser, "new-api-subscription-self");
  assert.equal(connector.auth, "none");
  assert.equal(connector.method, "GET");
  assert.equal(connector.headers?.Authorization, "Bearer <new-api-access-token>");
  assert.equal(connector.headers?.["New-Api-User"], undefined);
  assert.equal(connector.mapping.meters[0].id, "new_api_subscription_quota");
});

test("New API subscription meter sums active subscriptions", () => {
  assert.deepEqual(newApiSubscriptionSelfMetersForTest(payloadOf([
    sub({ amount_total: 1000, amount_used: 100, end_time: 2000000000, next_reset_time: 1900000000 }),
    sub({ amount_total: 500, amount_used: 200, end_time: 1950000000, next_reset_time: 1800000000 })
  ])), [{
    id: "new_api_subscription_quota",
    kind: "quota",
    label: "Subscription quota",
    limit: 1500,
    remaining: 1200,
    resetAt: new Date(1800000000 * 1000).toISOString(),
    source: "http-json",
    unit: "quota",
    used: 300
  }]);
});

test("New API subscription meter uses the earliest end time when nothing resets", () => {
  const [meter] = newApiSubscriptionSelfMetersForTest(payloadOf([
    sub({ amount_total: 10, amount_used: 0, end_time: 2000000000, next_reset_time: 0 }),
    sub({ amount_total: 10, amount_used: 0, end_time: 1950000000, next_reset_time: 0 })
  ]));
  assert.equal(meter.resetAt, new Date(1950000000 * 1000).toISOString());
});

test("New API subscription meter labels usage and omits the limit when any subscription is unlimited", () => {
  const [meter] = newApiSubscriptionSelfMetersForTest(payloadOf([
    sub({ amount_total: 0, amount_used: 50 }),
    sub({ amount_total: 1000, amount_used: 100 })
  ]));
  assert.equal(meter.label, "Subscription used (unlimited)");
  assert.equal(meter.used, 150);
  assert.equal(meter.limit, undefined);
  assert.equal(meter.remaining, undefined);
});

test("New API subscription meter never reports negative remaining", () => {
  const [meter] = newApiSubscriptionSelfMetersForTest(payloadOf([sub({ amount_total: 100, amount_used: 150 })]));
  assert.equal(meter.limit, 100);
  assert.equal(meter.remaining, 0);
});

test("New API subscription meter tolerates malformed items", () => {
  const [meter] = newApiSubscriptionSelfMetersForTest(payloadOf([
    null,
    { subscription: null },
    sub({ amount_total: "1000", amount_used: "100" })
  ]));
  assert.equal(meter.limit, 1000);
  assert.equal(meter.used, 100);
  assert.deepEqual(newApiSubscriptionSelfMetersForTest({ success: true, data: { subscriptions: "nope" } }), []);
  assert.deepEqual(newApiSubscriptionSelfMetersForTest("nope"), []);
});

test("New API subscription reports a plain message when there is no active subscription", () => {
  assert.deepEqual(newApiSubscriptionSelfMetersForTest(payloadOf([])), []);
  assert.equal(newApiSubscriptionSelfFallbackMessageForTest(payloadOf([])), "No active New API subscription.");
  assert.equal(newApiSubscriptionSelfFallbackMessageForTest({ success: false, message: "denied" }), "denied");
});
```

Create `new-api-subscription-snapshot.test.mjs`, copying the temp home, dynamic import and `globalThis.fetch` mock setup from `claude-oauth-usage-snapshot.test.mjs`. These tests fail if a dispatch branch is missing, which the helper tests above cannot detect. Each saves a provider with `api_key: "provider-key"`, `account: { enabled: true, connectors }`, then reads `getProviderAccountSnapshots(name, { forceRefresh: true })`.

```js
test("subscription connector merges with key usage and sends only the access token", async () => {
  // connectors: [newApiKeyUsageAccountConfig(base).connectors[0], { ...newApiSubscriptionSelfConnectorConfig(base), headers: { Authorization: "Bearer nap_test" } }]
  // the mock returns key usage JSON for /api/usage/token and an active subscription for /api/subscription/self
  assert.deepEqual(snapshot.meters.map((meter) => meter.id).sort(), ["new_api_key_quota", "new_api_subscription_quota"]);
  assert.equal(subscriptionRequestHeaders.Authorization, "Bearer nap_test");
  assert.equal(subscriptionRequestHeaders.authorization, undefined);
});

test("no active subscription reports a message without an error", async () => {
  // connectors: only the subscription connector; the mock returns payloadOf([])
  assert.deepEqual(snapshot.meters, []);
  assert.equal(snapshot.message, "No active New API subscription.");
  assert.equal(snapshot.errors, undefined);
  assert.equal(snapshot.status, "unsupported");
});

test("a denied subscription request keeps the other connector's meter", async () => {
  // the mock returns HTTP 403 with { success: false, message: "scope denied" } for the subscription route
  assert.deepEqual(snapshot.meters.map((meter) => meter.id), ["new_api_key_quota"]);
  assert.match(snapshot.errors[0].message, /HTTP 403/);
  assert.equal(snapshot.status, "warning");
});

test("a critical subscription is not hidden by the merge", async () => {
  // amount_total: 100, amount_used: 99, with the key usage connector first reporting plenty of quota
  assert.equal(snapshot.status, "critical");
});

test("the connector test action and browser connectors dispatch the parser too", async () => {
  const tested = await testProviderAccountConnector({ baseUrl: base, connector: newApiSubscriptionSelfConnectorConfig(base) });
  assert.equal(tested.meters[0].id, "new_api_subscription_quota");
  // also a { type: "webcontent-json", parser: "new-api-subscription-self", ... } connector through
  // getProviderAccountSnapshots, with setProviderAccountWebContentFetchHandler returning { payload }
});
```

Confirm the key usage route the mock answers by reading `newApiKeyUsageEndpoint`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-probe.test.js .test-dist/core/test/unit/providers/new-api-subscription-snapshot.test.js`
Expected: FAIL, because the new exports do not exist.

- [ ] **Step 4: Add the parser id and connector config**

In `contracts/app.ts`, add `"new-api-subscription-self"` to `ProviderAccountHttpJsonParser`.

In `new-api.ts`, add `newApiSubscriptionSelfEndpoint` modeled on `newApiUserSelfEndpoint`, and `newApiSubscriptionSelfConnectorConfig` modeled on `newApiUserSelfConnectorConfig`. Use `auth: "none"`, `method: "GET"`, and only the `Authorization` header. Its mapping has one meter with id `new_api_subscription_quota`, kind `quota`, label `Subscription quota`, unit `quota`, `limit: "$.data.subscriptions[0].subscription.amount_total"` and `used: "$.data.subscriptions[0].subscription.amount_used"`. As with the user balance connector, the parser overrides this mapping at runtime.

- [ ] **Step 5: Implement the meter and fallback message in `account-service.ts`**

Add `newApiSubscriptionSelfMeters(payload: unknown, source: ProviderAccountConnectorSource = "http-json"): ProviderAccountMeter[]` and `newApiSubscriptionSelfFallbackMessage(payload: unknown): string`, plus the two `ForTest` exports. Reuse `normalizeNumber`, `readJsonRecordValue` and `isRecord`.

The rules the tests pin:
- Read `data.subscriptions` when it is an array, and keep items whose `subscription` is a record. Return `[]` if none remain.
- `used` is the sum of `amount_used`, treating missing values as 0.
- If any kept item has `amount_total` that is not above 0, leave `limit` and `remaining` undefined and use the label `Subscription used (unlimited)`. Otherwise `limit` is the sum, `remaining` is `Math.max(limit - used, 0)`, and the label is `Subscription quota`.
- `resetAt` is the earliest positive `next_reset_time`. If there is none, it is the earliest positive `end_time`. If there is neither, it is undefined. Multiply seconds by 1000 and format with `toISOString()`.
- The fallback message is `readMappedString("$.message", payload) || "No active New API subscription."`. Use `||` because upstream sends `message: ""` on success.

- [ ] **Step 6: Dispatch the parser at all three sites**

Add a `connector.parser === "new-api-subscription-self"` branch after the `new-api-user-self` branch at each of the three dispatch sites (near `:243`, `:771`, `:824`). Match each site's existing return shape and `source` argument. The message is `meters.length === 0 ? newApiSubscriptionSelfFallbackMessage(payload) : readMappedString(connector.mapping.message, payload)`. The two runtime sites return no `status` key, for the reason under Evidence. The test action site at `:243` uses `statusFromMeters(meters, [], 1)` as its neighbors do.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-probe.test.js .test-dist/core/test/unit/providers/new-api-subscription-snapshot.test.js`
Expected: PASS, with `fail 0`.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/contracts/app.ts packages/core/src/providers/new-api.ts packages/core/src/providers/account-service.ts packages/core/test/unit/providers/provider-probe.test.mjs packages/core/test/unit/providers/new-api-subscription-snapshot.test.mjs
git commit -m "feat(core): read New API subscription quota with an access token"
```

### Task 2: Connector template in the provider editor

**Files:**
- Modify: `packages/ui/src/pages/home/shared/providers.ts:47,1673-1696`
- Modify: `packages/ui/src/pages/home/components/providers.tsx:13,2898-2900,3032-3040,3264-3279`
- Test: `packages/ui/test/integration/providers.test.ts`

**Interfaces:**
- Consumes: `newApiSubscriptionSelfConnectorConfig(baseUrl)` from Task 1.
- Produces: `providerAccountConnectorsTextWithNewApiSubscriptionTemplate(connectorsText: string, baseUrl: string, userId: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
test("New API subscription template adds a connector beside existing ones", () => {
  const account = newApiKeyUsageAccountConfig("https://gateway.example/v1");
  const connectors = JSON.parse(providerAccountConnectorsTextWithNewApiSubscriptionTemplate(
    JSON.stringify(account.connectors ?? [], null, 2),
    "https://gateway.example/v1",
    ""
  ));

  assert.equal(connectors.length, 2);
  assert.equal(connectors[0].parser, "new-api-key-usage");
  assert.equal(connectors[1].endpoint, "https://gateway.example/api/subscription/self");
  assert.equal(connectors[1].parser, "new-api-subscription-self");
  assert.equal(connectors[1].headers.Authorization, "Bearer <new-api-access-token>");
  assert.equal(connectors[1].headers["New-Api-User"], undefined);
});

test("New API subscription template sends the user ID only when one is given", () => {
  const [connector] = JSON.parse(providerAccountConnectorsTextWithNewApiSubscriptionTemplate("[]", "https://gateway.example/v1", " 42 "));
  assert.equal(connector.headers["New-Api-User"], "42");
});

test("New API subscription template replaces its earlier copy", () => {
  const first = providerAccountConnectorsTextWithNewApiSubscriptionTemplate("[]", "https://gateway.example/v1", "");
  const connectors = JSON.parse(providerAccountConnectorsTextWithNewApiSubscriptionTemplate(first, "https://other.example/v1", ""));
  assert.equal(connectors.length, 1);
  assert.equal(connectors[0].endpoint, "https://other.example/api/subscription/self");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/integration/providers.test.js`
Expected: FAIL, because the export does not exist.

- [ ] **Step 3: Implement the template**

Extract the connector merge in `providerAccountConnectorsTextWithNewApiUserBalanceTemplate` (parse the text, drop any `http-json` connector with the same parser, append, stringify) into one private helper taking the connector, and use it from both templates. Keep the existing handling of invalid JSON. Replace `isNewApiUserSelfConnector` with a parser comparison in that helper. In the new template, set `New-Api-User` only when the trimmed user ID is not empty, and default the base URL to `https://new-api.example/v1` as the balance template does.

- [ ] **Step 4: Add the button**

In `components/providers.tsx`:
- Add `insertNewApiSubscriptionTemplate()`, modeled on `insertNewApiUserBalanceTemplate()`.
- Make `showNewApiUserBalanceTemplate` also true when the text includes `"new-api-subscription-self"`.
- Wrap the existing button and a new outline button labeled `Insert New API subscription quota` in `<div className="flex flex-wrap gap-2">`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/integration/providers.test.js && npm run typecheck`
Expected: PASS, with `fail 0` and no type errors.

- [ ] **Step 6: Look at it in the real UI**

Run `LLMR_INTERNAL_HOME_DIR="$(mktemp -d)" npm run dev:electron`, so nothing touches the real `~/.llm-router`, `~/.claude` or `~/.codex`. In **Providers**, add any provider, turn on **Fetch usage**, choose **Raw connector JSON**, and enter `[{ "parser": "new-api-key-usage" }]` to reveal the template row. Click the new button. Expected: both buttons fit at the dialog's narrowest width, and the JSON gains the connector with the placeholder token.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/pages/home/shared/providers.ts packages/ui/src/pages/home/components/providers.tsx packages/ui/test/integration/providers.test.ts
git commit -m "feat(ui): add a New API subscription quota connector template"
```

### Task 3: Retire the plugin and its build wiring

**Files:**
- Delete: `packages/electron/bundled-plugins/new-api-account/` (`README.md`, `index.cjs`, `plugin.json`)
- Delete: `packages/electron/test/unit/new-api-account-plugin.test.mjs`
- Modify: `build/esbuild.config.mjs:51-53,196,236-241,275-291`
- Modify: `build/build.mjs:3,9`
- Modify: `build/dev.mjs:15,28,293,406,425`
- Modify: `electron-builder.json:7`
- Modify: `README.md` (Quick Start upgrade notes)
- Modify: `docs/src/content/docs/en/configuration/providers.md`
- Test: `packages/core/test/integration/plugins/plugin-service.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks at the code level. The docs describe the Task 2 button.

- [ ] **Step 1: Write the upgrade test**

Add to `plugin-service.test.mjs`, using that file's temp dir and `console.warn` capture pattern. This exact test was run against `efdd27c5` and passed.

```js
test("a plugin whose module file is gone is disabled without blocking later plugins", async () => {
  const validPlugin = path.join(root, "valid.cjs");
  writeFileSync(validPlugin, 'module.exports = { setup() { return { providerAccountConnectors: [{ id: "c", resolve() { return []; } }] }; } };');
  const permissions = ["trusted-code", "provider-account-connectors"];
  const surfaces = { provider: true };
  const config = createDefaultAppConfig();
  config.plugins = [
    { id: "new-api-account", module: path.join(root, "gone", "index.cjs"), permissions, surfaces },
    { id: "valid", module: validPlugin, permissions, surfaces }
  ];
  await pluginService.start(config);
  assert.match(warnings.join("\n"), /plugin:new-api-account.*Disabled after startup failure/);
  assert.equal(pluginService.getProviderAccountConnector("new-api-account", "subscription-self"), undefined);
  assert.ok(pluginService.getProviderAccountConnector("valid", "c"));
});
```

- [ ] **Step 2: Run it to record the behavior**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/plugins/plugin-service.test.js`
Expected: PASS. `start()` already catches load failures and logs `Disabled after startup failure`. This test pins that for the upgrade path. If it fails, stop and report, since the removal would then break upgrades.

- [ ] **Step 3: Delete the plugin and its test, and remove the build wiring**

Remove `bundledClaudeRuntimePluginIds`, `bundledClaudeRuntimePluginsInputDir`, `electronBundledRuntimePluginsDir`, `copyBundledClaudeRuntimePlugins` and `copyBundledClaudeRuntimePlugin` from `esbuild.config.mjs`, along with the `mkdirSync` at `:196`. Remove their imports, calls, poll watcher and `rememberWatchSignature` from `build.mjs` and `dev.mjs`. Remove `"dist/bundled-plugins/**"` from `asarUnpack` in `electron-builder.json`, keeping `"**/*.node"`.

- [ ] **Step 4: Verify nothing references it and the build still works**

Run: `git grep -n -E 'bundled-plugins|BundledClaudeRuntime|bundledClaudeRuntime|electronBundledRuntime|new-api-account' -- ':!docs/superpowers' ':!packages/core/test/integration/plugins/plugin-service.test.mjs'`
Expected: no output.

Run: `npm run build:assets && test ! -e packages/electron/dist/bundled-plugins && echo gone`
Expected: the build succeeds and prints `gone`. Then run `git status --short`, and if the build rewrote generated files, restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.

Run: `npm run typecheck && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron`
Expected: all pass.

- [ ] **Step 5: Write the user-facing notes**

In the root `README.md`, add this above `### Upgrading to 7.0`:

```markdown
### Upgrading to 7.2

The New API Account plugin is gone. It could not read New API's subscription response. Remove it under **Extensions**, delete its connector from the provider's account connector JSON, then use **Insert New API subscription quota** instead. The connector needs a New API access token with the `wallet:read` scope.
```

In `docs/src/content/docs/en/guides/provider.md`, add a `## New API subscription quota` section above `## Related pages` with these points:
- Create an access token in New API with the `wallet:read` scope.
- In the provider's account connectors, click **Insert New API subscription quota** and replace `<new-api-access-token>`.
- The meter totals all active subscriptions, and shows usage with no limit when any subscription is unlimited.
- Enter a user ID only if your New API version requires the `New-Api-User` header.

- [ ] **Step 6: Commit**

```bash
git add -A packages/electron/bundled-plugins packages/electron/test/unit/new-api-account-plugin.test.mjs build/esbuild.config.mjs build/build.mjs build/dev.mjs electron-builder.json README.md docs/src/content/docs/en/configuration/providers.md packages/core/test/integration/plugins/plugin-service.test.mjs
git commit -m "chore: retire the new-api-account plugin and its bundling"
```

- [ ] **Step 7: Open the PR**

Run the `/verify` skill with `--e2e`, because this touches the renderer and the build, and restore generated files afterward if the e2e run rewrote them. Push the branch and open a PR with `gh pr create`. The body states what users notice (a working subscription meter in every mode, and the plugin removed), that no live New API server was tested, and the Evidence section's upstream read date.

- [ ] **Step 8: After the squash merge, retire this plan**

Move this file to `docs/superpowers/plans/completed/` and repoint any references to its old path. Commit that straight to `main`, since it is docs-only.
