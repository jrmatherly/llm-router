# Claude Apps Gateway Client (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a developer sign LLMR in to their organization's Claude apps gateway with the gateway's device flow, and expose that gateway as an LLMR provider whose bearer token stays fresh at runtime.

**Architecture:** A session store owns one token file per gateway host. A device-login service runs start, wait and cancel over the gateway's OAuth endpoints and writes a session on success. A new `claude-apps-gateway` local-agent provider kind turns stored sessions into candidates and imports, and the existing runtime auth hook gains a branch that swaps in a live token per request. The RPC triplet and the import-panel form follow the bot-gateway QR login and the Kimi provider exactly.

**Tech Stack:** TypeScript under `packages/core`, React under `packages/ui`, Electron IPC, `node:test` with `node:assert/strict`, a fake gateway on `node:http` in tests.

**Spec:** `docs/superpowers/specs/2026-10-25-claude-apps-gateway-client.md`

## Global Constraints

- Endpoint paths and grant strings, verbatim: `/.well-known/oauth-authorization-server`, `/oauth/device_authorization`, `/oauth/token`, `/v1/models`, `urn:ietf:params:oauth:grant-type:device_code`, `refresh_token`. Token requests are `application/x-www-form-urlencoded`.
- Poll errors, verbatim: `authorization_pending` keep polling, `slow_down` add 5 s to the interval, `expired_token` and `access_denied` end the login.
- Session file: `CONFIGDIR/claude-apps-gateway/<slug>.json`, mode `0o600`, written to a temp file then renamed. Slug: host plus `:port` with every character outside `[a-z0-9.-]` replaced by `-`.
- Gateway URL: `https:` anywhere, `http:` only when the host is `127.0.0.1`, `localhost` or `::1`; normalized to its origin with no trailing slash.
- Plugin key suffix, verbatim: `claude-apps-gateway-oauth` (public) and `claude-apps-gateway-oauth-internal`; the plugin carries `claudeAppsGateway: { url }`.
- Wait RPC default `timeoutMs` 20000; the UI loops until `confirmed` or a terminal status.
- Style per `AGENTS.md`; every new `t("...")` key gets an `en` and a `zh` entry in `packages/ui/src/pages/home/shared/i18n.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit-or-integration>/<path>.test.js`. UI component tests: `npm run test:ui`. Commit gate runs typecheck plus `npm run test:architecture`.
- All HTTP through `fetchWithSystemProxy` from `@ccr/core/proxy/system-proxy-fetch`; tests override `globalThis.fetch` the way `local-agent-auth-provider-hook.test.mjs` does, or point the URL at the fake server.

## Review Focus

1. A refresh that answers `401`: expected the session file stays (so the user sees "sign in again"), the candidate turns `locked`, and the hook falls back to the plugin's baked token rather than failing the request with a thrown error. Pinned in Tasks 1 and 3.
2. Two gateways on different hosts: expected two session files, two candidates, two providers, and no cross-talk in the hook. Pinned in Task 3.
3. A `slow_down` reply during polling: expected the next poll waits `interval + 5` seconds and the wait call still returns within `timeoutMs`. Pinned in Task 2.
4. An `http://` URL to a non-loopback host: expected `start` rejects before any network call. Pinned in Task 2.
5. The import panel's wait loop after the user closes the dialog mid-login: expected the pending login is canceled and no further `wait` calls fire. Pinned in Task 5 by the DOM-free login driver test.

---

### Task 1: Session store

**Files:**
- Create: `packages/core/src/agents/claude-apps-gateway/session-store.ts`
- Test: `packages/core/test/unit/agents/claude-apps-gateway-session-store.test.mjs`

**Interfaces:**
- Produces:
  - `export type ClaudeAppsGatewaySession = { accessToken: string; email?: string; expiresAt: number; gatewayUrl: string; modelDisplayNames?: Record<string, string>; models: string[]; refreshToken?: string; sourceFile: string }`
  - `export class ClaudeAppsGatewayAuthError extends Error { constructor(public readonly status: number, message: string) }`
  - `export function normalizeClaudeAppsGatewayUrl(value: string): string` (throws `Error` naming the rule on a bad URL)
  - `export function claudeAppsGatewaySlug(gatewayUrl: string): string`
  - `export function claudeAppsGatewaySessionFile(gatewayUrl: string, configDir?: string): string`
  - `export function readClaudeAppsGatewaySession(gatewayUrl: string, configDir?: string): ClaudeAppsGatewaySession | undefined`
  - `export function listClaudeAppsGatewaySessions(configDir?: string): ClaudeAppsGatewaySession[]`
  - `export function persistClaudeAppsGatewaySession(session: ClaudeAppsGatewaySession): void`
  - `export function removeClaudeAppsGatewaySession(gatewayUrl: string, configDir?: string): void`
  - `export function claudeAppsGatewaySessionExpired(session: ClaudeAppsGatewaySession, nowSeconds?: number, skewSeconds?: number): boolean` (skew default 60)
  - `export async function refreshClaudeAppsGatewaySession(session: ClaudeAppsGatewaySession): Promise<ClaudeAppsGatewaySession>` (POST `/oauth/token`, throws `ClaudeAppsGatewayAuthError` on 401/403, `Error` otherwise; keeps the old `refreshToken` when the response omits one)
  - `export async function resolveClaudeAppsGatewaySession(gatewayUrl: string, configDir?: string): Promise<ClaudeAppsGatewaySession | undefined>` (read, refresh if expired and a refresh token exists, persist, return)
  - `export async function fetchClaudeAppsGatewayModels(session: ClaudeAppsGatewaySession): Promise<{ models: string[]; modelDisplayNames: Record<string, string> }>` (GET `/v1/models` with the bearer; `data[].id`, `data[].display_name`)
- `configDir` defaults to `CONFIGDIR` from `@ccr/core/config/constants`.

- [ ] **Step 1: Write the failing tests**

Use a `mkdtempSync` dir as `configDir` and a fake gateway: `createServer` from `node:http` on `127.0.0.1:0`, routing `/oauth/token` and `/v1/models`, closed in `t.after`.

```js
test("gateway URLs normalize to an origin and refuse plain http off loopback", () => {
  assert.equal(normalizeClaudeAppsGatewayUrl("https://gw.example.com/some/path?x=1"), "https://gw.example.com");
  assert.equal(normalizeClaudeAppsGatewayUrl("http://127.0.0.1:18080/"), "http://127.0.0.1:18080");
  assert.throws(() => normalizeClaudeAppsGatewayUrl("http://gw.example.com"), /https/);
  assert.throws(() => normalizeClaudeAppsGatewayUrl("ftp://gw.example.com"), /http/);
  assert.equal(claudeAppsGatewaySlug("https://GW.Example.com:8443"), "gw.example.com-8443");
});
test("sessions persist with mode 0600 and list per host", () => { /* persist two sessions, assert statSync(file).mode & 0o777 === 0o600, list() length 2 sorted by gatewayUrl, read() round-trips, remove() deletes */ });
test("expired sessions refresh and persist the new tokens", async (t) => { /* fake /oauth/token asserts body grant_type=refresh_token&refresh_token=old, returns access_token new, expires_in 3600, no refresh_token; resolve() returns accessToken "new", refreshToken still "old", file updated */ });
test("a 401 on refresh is an auth error and leaves the file in place", async (t) => { /* fake returns 401 {error:"invalid_grant"}; await assert.rejects(refresh, ClaudeAppsGatewayAuthError); file still exists */ });
test("models come from /v1/models with display names", async (t) => { /* fake asserts authorization: Bearer tok; returns data:[{id:"claude-sonnet-4-6",display_name:"Claude Sonnet 4.6"}]; assert.deepEqual */ });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-apps-gateway-session-store.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `session-store.ts`**

Persist the file as `{ access_token, refresh_token, expires_at, gateway_url, email, models, model_display_names }` (snake_case on disk, the Kimi convention) and map back on read; skip unreadable or malformed files in `list` with no throw. `refresh` sends `grant_type=refresh_token&refresh_token=…` as `URLSearchParams` with `accept: application/json`; compute `expiresAt = floor(Date.now()/1000) + expires_in`.

- [ ] **Step 4: Run the test to verify it passes**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/claude-apps-gateway/session-store.ts packages/core/test/unit/agents/claude-apps-gateway-session-store.test.mjs
git commit -m "feat(agents): Claude apps gateway session store with refresh"
```

---

### Task 2: Device-flow login service

**Files:**
- Create: `packages/core/src/agents/claude-apps-gateway/device-login-service.ts`
- Modify: `packages/core/src/contracts/app.ts` (add the six types below next to the `BotGatewayQrLogin*` types at line 1769)
- Test: `packages/core/test/unit/agents/claude-apps-gateway-device-login.test.mjs`

**Interfaces:**
- Produces in `contracts/app.ts`:
  - `export type ClaudeAppsGatewayLoginStartRequest = { gatewayUrl: string }`
  - `export type ClaudeAppsGatewayLoginStartResult = { expiresAt: string; gatewayUrl: string; intervalSeconds: number; sessionId: string; userCode: string; verificationUri: string; verificationUriComplete: string }`
  - `export type ClaudeAppsGatewayLoginWaitRequest = { sessionId: string; timeoutMs?: number }`
  - `export type ClaudeAppsGatewayLoginStatus = "canceled" | "confirmed" | "denied" | "expired" | "pending"`
  - `export type ClaudeAppsGatewayLoginWaitResult = { confirmed: boolean; email?: string; gatewayUrl: string; message: string; models: string[]; sessionId: string; status: ClaudeAppsGatewayLoginStatus }`
  - `export type ClaudeAppsGatewayLoginCancelRequest = { sessionId: string }` and `export type ClaudeAppsGatewayLoginCancelResult = { canceled: boolean }`
- Produces in `device-login-service.ts`:
  - `export async function startClaudeAppsGatewayLogin(request: ClaudeAppsGatewayLoginStartRequest, options?: { configDir?: string }): Promise<ClaudeAppsGatewayLoginStartResult>`
  - `export async function waitClaudeAppsGatewayLogin(request: ClaudeAppsGatewayLoginWaitRequest): Promise<ClaudeAppsGatewayLoginWaitResult>`
  - `export function cancelClaudeAppsGatewayLogin(request: ClaudeAppsGatewayLoginCancelRequest): ClaudeAppsGatewayLoginCancelResult`
- Consumes: Task 1's `normalizeClaudeAppsGatewayUrl`, `persistClaudeAppsGatewaySession`, `fetchClaudeAppsGatewayModels`.

- [ ] **Step 1: Write the failing tests**

Fake gateway with `/.well-known/oauth-authorization-server` (returns the two endpoint URLs), `/oauth/device_authorization` (returns `device_code: "dc"`, `user_code: "WDJB-MJHT"`, `verification_uri_complete`, `expires_in: 600`, `interval: 0`), `/oauth/token` scripted per test, `/v1/models`.

```js
test("start validates the URL before any request", async () => {
  await assert.rejects(startClaudeAppsGatewayLogin({ gatewayUrl: "http://gw.example.com" }), /https/);
  assert.equal(requestCount, 0);
});
test("start returns the device code prompt", async (t) => { /* assert userCode "WDJB-MJHT", verificationUriComplete contains "user_code=WDJB-MJHT", intervalSeconds 0, gatewayUrl normalized */ });
test("wait polls through pending and slow_down, then persists the session", async (t) => {
  // token replies in order: 400 authorization_pending, 400 slow_down, 200 { access_token, refresh_token, expires_in: 3600, token_type: "Bearer" }
  const result = await waitClaudeAppsGatewayLogin({ sessionId, timeoutMs: 20000 });
  assert.equal(result.status, "confirmed");
  assert.deepEqual(result.models, ["claude-sonnet-4-6"]);
  assert.ok(existsSync(claudeAppsGatewaySessionFile(gatewayUrl, configDir)));
  assert.ok(slowDownGapMs >= 5000 - 50);   // measured between the slow_down reply and the next poll, with interval 0
});
test("wait returns pending at timeoutMs and keeps the login alive", async (t) => { /* always authorization_pending; timeoutMs 300; status "pending"; a second wait call still finds the session */ });
test("expired_token and access_denied end the login", async (t) => { /* two sessions; statuses "expired" and "denied"; a later wait on either returns status "canceled" with message naming an unknown session */ });
test("cancel drops a pending login", () => { /* canceled true, then false */ });
```

For the slow-down timing test, use `interval: 0` from the fake so the only delay is the added 5 s; mark the test with a 10 s `timeout` option.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-apps-gateway-device-login.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `device-login-service.ts`**

In-process `Map<string, PendingLogin>` with `{ configDir, deviceCode, expiresAtMs, gatewayUrl, intervalMs, tokenEndpoint }`. `sessionId` from `randomUUID()`. `wait` loops: poll, on `authorization_pending` sleep `intervalMs`, on `slow_down` add 5000 to `intervalMs` then sleep, on success call `fetchClaudeAppsGatewayModels`, persist, delete the entry, return `confirmed`; on `expired_token`, `access_denied` or the device code's own expiry, delete the entry and return that status; when `timeoutMs` elapses, return `pending` without deleting. An unknown `sessionId` returns `status: "canceled"` with `message: "Login session was not found or was canceled."`.

- [ ] **Step 4: Run the test to verify it passes**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/claude-apps-gateway/device-login-service.ts packages/core/src/contracts/app.ts packages/core/test/unit/agents/claude-apps-gateway-device-login.test.mjs
git commit -m "feat(agents): Claude apps gateway device-flow login service"
```

---

### Task 3: The `claude-apps-gateway` provider kind and its runtime hook

**Files:**
- Modify: `packages/core/src/contracts/app.ts:452` (`LocalAgentProviderKind` gains `"claude-apps-gateway"`)
- Create: `packages/core/src/agents/local-providers/claude-apps-gateway.ts`
- Modify: `packages/core/src/agents/local-providers/service.ts` (candidates and import dispatch)
- Modify: `packages/core/src/gateway/core-runtime/local-agent-auth-provider-hook.ts:95-130` (`LocalAgentOauthKind`, `localAgentOauthKind`, a new branch)
- Modify: `packages/ui/src/pages/home/shared/providers.ts:65` (`localAgentProviderIconUrls` gains the new kind; use `claudeCodeLogoUrl`)
- Modify: `packages/ui/src/pages/home/components/providers.tsx:1545` (`localAgentProviderPluginSuffixes` gains `"claude-apps-gateway": ["-claude-apps-gateway-oauth", "-claude-apps-gateway-oauth-internal"]`)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-apps-gateway.test.mjs`
- Test: `packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs`

**Interfaces:**
- Produces in `local-providers/claude-apps-gateway.ts`:
  - `export function claudeAppsGatewayCandidates(configDir?: string): LocalAgentProviderCandidate[]`
  - `export async function importClaudeAppsGatewayProvider(candidate: LocalAgentProviderCandidate, providerNames: string[], configDir?: string): Promise<LocalAgentProviderImportResult>`
  - `export function claudeAppsGatewayCandidateId(gatewayUrl: string): string` returning `claude-apps-gateway:<slug>`
- Consumes: Task 1's store, `providerPayload`, `uniqueProviderName`, `bearerAuthPlugin`, `providerInternalNamePlaceholder` from `local-providers/shared.ts`.
- The two `Record<LocalAgentProviderKind, …>` maps in the UI must gain the key or `npm run typecheck` fails; that is why they are in this task.

- [ ] **Step 1: Write the failing provider tests**

```js
test("no sessions means no candidates", () => { assert.deepEqual(claudeAppsGatewayCandidates(emptyDir), []); });
test("a stored session becomes an importable candidate and a bearer provider", async (t) => {
  // persist a session for the fake gateway with models ["claude-sonnet-4-6"]
  const [candidate] = claudeAppsGatewayCandidates(configDir);
  assert.equal(candidate.kind, "claude-apps-gateway");
  assert.equal(candidate.id, `claude-apps-gateway:127.0.0.1-${port}`);
  assert.equal(candidate.protocol, "anthropic_messages");
  assert.equal(candidate.importable, true);
  const result = await importClaudeAppsGatewayProvider(candidate, [], configDir);
  assert.equal(result.provider.baseUrl, gatewayUrl);
  assert.equal(result.provider.apiKey, "ccr-local-agent-login");
  assert.deepEqual(result.provider.models, ["claude-sonnet-4-6"]);
  assert.equal(result.providerPlugins.length, 2);
  assert.equal(result.providerPlugins[0].key, "ccr-local-agent-__CCR_PROVIDER_NAME_SLUG__-claude-apps-gateway-oauth");
  assert.deepEqual(result.providerPlugins[0].claudeAppsGateway, { url: gatewayUrl });
  assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer tok");
});
test("an expired session without a refresh token is locked", () => { /* importable false, status "locked", detail matches /sign in again/i */ });
test("two gateways give two candidates", () => { /* two hosts, two ids */ });
```

- [ ] **Step 2: Write the failing hook test**

In `local-agent-auth-provider-hook.test.mjs`, following the Grok test's shape (fake `globalThis.fetch`, `createGatewayPlugin({ config: { providerPlugins: [plugin] } })`):

```js
test("Claude apps gateway hook swaps in a refreshed bearer token", async (t) => {
  // persist an expired session with refreshToken "old" under a temp configDir exposed via process.env.CCR_INTERNAL_HOME_DIR per the suite's HOME isolation; fake fetch answers /oauth/token with access_token "fresh"
  const [hook] = createGatewayPlugin({ config: { providerPlugins: [{ auth: { headers: { authorization: "Bearer stale" }, removeHeaders: ["x-api-key"], strict: true }, claudeAppsGateway: { url: gatewayUrl }, key: "ccr-local-agent-gw-claude-apps-gateway-oauth", providerName: "gw" }] } }).providerHooks;
  const result = await hook.authenticate({ model: "claude-sonnet-4-6", upstreamRequest: { headers: { "x-api-key": "client" }, method: "POST", url: `${gatewayUrl}/v1/messages` } });
  assert.equal(result.ok, true);
  assert.equal(result.value.headers.authorization, "Bearer fresh");
  assert.equal(result.value.headers["x-api-key"], undefined);
});
test("Claude apps gateway hook falls back to the baked token when refresh is refused", async (t) => { /* fake fetch 401; authorization stays "Bearer stale"; result.ok true */ });
```

`build/test-home.mjs` sets `CCR_INTERNAL_HOME_DIR` to a temp home for every test run, and `CONFIGDIR` derives from it (`packages/core/src/runtime/app-paths.ts:7,37`), so write the session file at `claudeAppsGatewaySessionFile(gatewayUrl)` with the default `configDir` and remove it in `t.after`; the hook cannot take a `configDir` argument.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/local-agent-provider-claude-apps-gateway.test.js .test-dist/core/test/unit/gateway/local-agent-auth-provider-hook.test.js`
Expected: FAIL, module not found and unknown hook kind.

- [ ] **Step 4: Implement**

`local-providers/claude-apps-gateway.ts`: candidate `name` is `` `Claude apps gateway (${host})` ``, `detail` "Signed in. Click Import to add it as a gateway provider." when importable, "Gateway session expired. Sign in again." when locked. Import: `resolveClaudeAppsGatewaySession`, then `fetchClaudeAppsGatewayModels` in try/catch falling back to the stored list, `providerPayload(nextCandidate, uniqueProviderName(providerNames, candidate.name), session.gatewayUrl)`, two plugins via `{ ...bearerAuthPlugin("claude-apps-gateway-oauth", token, {}, providerName), claudeAppsGateway: { url } }`.

`service.ts`: spread `...claudeAppsGatewayCandidates()` into `getLocalAgentProviderCandidates` and add the `candidate.kind === "claude-apps-gateway"` branch in `importLocalAgentProvider`.

Hook: `LocalAgentOauthKind` gains `"claude-apps-gateway"`; `localAgentOauthKind` returns it when the key includes `claude-apps-gateway-oauth`; the branch sets `hook.authenticate = (input) => authenticateWithBearer(input, () => resolveLiveClaudeAppsGatewayToken(plugin), plugin, "Claude apps gateway session was not found.")`, where `resolveLiveClaudeAppsGatewayToken` reads `plugin.claudeAppsGateway.url`, calls `resolveClaudeAppsGatewaySession(url).catch(() => readClaudeAppsGatewaySession(url))`, and returns `accessToken` when the session exists and is not expired, else `undefined`; `authenticateWithBearer` (`local-agent-auth-provider-hook.ts:138`) already falls back to `originalBearerToken(plugin)` on `undefined`.

- [ ] **Step 5: Run the tests and typecheck**

Run: the Step 3 command, then `npm run typecheck`.
Expected: PASS; typecheck passes only once both UI maps have the new key.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/contracts/app.ts packages/core/src/agents/local-providers/claude-apps-gateway.ts packages/core/src/agents/local-providers/service.ts packages/core/src/gateway/core-runtime/local-agent-auth-provider-hook.ts packages/ui/src/pages/home/shared/providers.ts packages/ui/src/pages/home/components/providers.tsx packages/core/test/unit/agents/local-agent-provider-claude-apps-gateway.test.mjs packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs
git commit -m "feat(providers): Claude apps gateway as a local-agent provider with live bearer auth"
```

---

### Task 4: RPC and IPC wiring for the login triplet

**Files:**
- Modify: `packages/core/src/contracts/ipc-channels.ts:42-44` (add `appClaudeAppsGatewayLoginCancel: "ccr:app:claude-apps-gateway-login-cancel"`, `...LoginStart: "ccr:app:claude-apps-gateway-login-start"`, `...LoginWait: "ccr:app:claude-apps-gateway-login-wait"`)
- Modify: `packages/core/src/web/management-server.ts:266` (`rpcHandlers` gains `cancelClaudeAppsGatewayLogin`, `startClaudeAppsGatewayLogin`, `waitClaudeAppsGatewayLogin`, alphabetized)
- Modify: `packages/electron/src/main/ipc.ts:257` (three `ipcMain.handle` blocks)
- Modify: `packages/electron/src/main/preload.ts:172` (three entries)
- Modify: `packages/ui/src/types/electron.d.ts:160` (three `CcrApi` members and the type imports)
- Modify: `packages/ui/src/web-client-bridge.ts:110` (three `rpc(...)` entries)
- Test: `packages/core/test/unit/web/web-management-server.test.mjs`

**Interfaces:**
- Consumes Task 2's three functions and six types.
- Produces on `window.ccr`: `startClaudeAppsGatewayLogin(request): Promise<ClaudeAppsGatewayLoginStartResult>`, `waitClaudeAppsGatewayLogin(request): Promise<ClaudeAppsGatewayLoginWaitResult>`, `cancelClaudeAppsGatewayLogin(request): Promise<ClaudeAppsGatewayLoginCancelResult>`.

- [ ] **Step 1: Write the failing test**

Boot the runtime the way the test at `web-management-server.test.mjs:69` does and call the file's `rpc(baseUrl, authToken, method, args)` helper (line 143): `await rpc(runtime.url, webAuthToken, "cancelClaudeAppsGatewayLogin", [{ sessionId: "nope" }])` and assert `deepEqual(result, { canceled: false })`. That proves the route exists without a network login.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/web/web-management-server.test.js`
Expected: FAIL, unknown method.

- [ ] **Step 3: Wire all six files**

Copy the QR-login lines in each file and rename. In `preload.ts` the pattern is `invoke(IPC_CHANNELS.appClaudeAppsGatewayLoginStart, request) as Promise<ClaudeAppsGatewayLoginStartResult>`; in `web-client-bridge.ts`, `rpc("startClaudeAppsGatewayLogin", [request]) as ReturnType<CcrApi["startClaudeAppsGatewayLogin"]>`.

- [ ] **Step 4: Run the test, typecheck, and the Electron suite**

Run: the Step 2 command, `npm run typecheck`, `npm run test:electron`.
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/contracts/ipc-channels.ts packages/core/src/web/management-server.ts packages/electron/src/main/ipc.ts packages/electron/src/main/preload.ts packages/ui/src/types/electron.d.ts packages/ui/src/web-client-bridge.ts packages/core/test/unit/web/web-management-server.test.mjs
git commit -m "feat(ipc): expose Claude apps gateway login start, wait and cancel"
```

---

### Task 5: Sign-in form in the import panel

**Files:**
- Create: `packages/ui/src/pages/home/shared/claude-apps-gateway-login.ts`
- Create: `packages/ui/src/pages/home/components/claude-apps-gateway-sign-in.tsx` (`ClaudeAppsGatewaySignInForm`)
- Modify: `packages/ui/src/pages/home/components/providers.tsx:1372-1480` (`LocalAgentProviderImportPanel` renders the form above the candidate list)
- Modify: `packages/ui/src/pages/home/shared/i18n.tsx` (`en` map near line 354, `zh` map near line 1186)
- Test: `packages/ui/test/component/claude-apps-gateway-login.test.tsx`

**Interfaces:**
- Consumes `window.ccr.startClaudeAppsGatewayLogin`, `waitClaudeAppsGatewayLogin`, `cancelClaudeAppsGatewayLogin`, `openExternal`, `getLocalAgentProviderCandidates`.
- Produces in `shared/claude-apps-gateway-login.ts` a DOM-free driver, so the loop is testable with `node:test` like the other UI unit files:
  - `export type ClaudeAppsGatewayLoginApi = Pick<CcrApi, "cancelClaudeAppsGatewayLogin" | "openExternal" | "startClaudeAppsGatewayLogin" | "waitClaudeAppsGatewayLogin">`
  - `export type ClaudeAppsGatewayLoginEvents = { onConfirmed: (result: ClaudeAppsGatewayLoginWaitResult) => void; onError: (message: string) => void; onPrompt: (start: ClaudeAppsGatewayLoginStartResult) => void }`
  - `export function runClaudeAppsGatewayLogin(api: ClaudeAppsGatewayLoginApi, gatewayUrl: string, events: ClaudeAppsGatewayLoginEvents): { cancel: () => void; done: Promise<void> }`
- Produces in `components/claude-apps-gateway-sign-in.tsx`: `export function ClaudeAppsGatewaySignInForm({ onConfirmed }: { onConfirmed: () => void })`, which owns the URL field, the Sign in button, the user-code prompt and the error line, calls `runClaudeAppsGatewayLogin(window.ccr, url, events)` from its click handler and the returned `cancel` from its effect cleanup. The panel renders `<ClaudeAppsGatewaySignInForm onConfirmed={() => setScanAttempt((value) => value + 1)} />` so a confirmed login re-scans candidates. No test imports `providers.tsx` today, so the form lives in its own file and is rendered directly by the test.

- [ ] **Step 1: Write the failing component test**

The UI suite renders static markup only (`renderToStaticMarkup`, see `profiles.test.tsx`), so the loop is tested through the driver and the form through a render.

```ts
test("login driver starts, opens the browser, polls until confirmed", async () => {
  const calls: string[] = [];
  const api = fakeApi({ waitResults: [{ status: "pending" }, { status: "confirmed", confirmed: true, models: ["claude-sonnet-4-6"] }], calls });
  const prompts: ClaudeAppsGatewayLoginStartResult[] = [];
  const run = runClaudeAppsGatewayLogin(api, "http://127.0.0.1:18080", { onConfirmed: (r) => calls.push(`confirmed:${r.models.join()}`), onError: (m) => calls.push(`error:${m}`), onPrompt: (p) => prompts.push(p) });
  await run.done;
  assert.equal(prompts[0]?.userCode, "WDJB-MJHT");
  assert.deepEqual(calls, ["start:http://127.0.0.1:18080", "open:http://127.0.0.1:18080/device?user_code=WDJB-MJHT", "wait:s1", "wait:s1", "confirmed:claude-sonnet-4-6"]);
});
test("cancel during a pending wait stops polling and cancels the session", async () => {
  // fake wait resolves pending forever; call run.cancel() after the first wait resolves; assert calls end with "cancel:s1" and contain exactly one "wait:s1"
});
test("denied and expired end with an error message", async () => { /* status denied → onError called once with the result's message; no cancel call */ });
test("sign-in form renders in English and Chinese", () => {
  const en = renderToStaticMarkup(<ClaudeAppsGatewaySignInForm onConfirmed={() => undefined} />);
  assert.match(en, /aria-label="Claude apps gateway URL"/);
  assert.match(en, />Sign in<\/button>/);
  const zh = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.zh}>
      <ClaudeAppsGatewaySignInForm onConfirmed={() => undefined} />
    </AppI18nContext.Provider>
  );
  assert.match(zh, new RegExp(`>${appCopy.zh["Sign in"]}<\\/button>`));
});
```

`fakeApi` records `start:<url>`, `open:<url>`, `wait:<sessionId>`, `cancel:<sessionId>` and returns `sessionId: "s1"` from `start`. `AppI18nContext` and `appCopy` come from `packages/ui/src/pages/home/shared/i18n.tsx`, the way `profiles.test.tsx:33` uses them.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:ui`
Expected: FAIL, no Sign in button.

- [ ] **Step 3: Implement the form**

Driver: `start`, `onPrompt`, `openExternal(verificationUriComplete)`, then loop `wait({ sessionId })` while not canceled and `status === "pending"`; `confirmed` → `onConfirmed`; `denied`, `expired`, `canceled` or a thrown error → `onError(message)`; `cancel()` sets a flag and calls `api.cancelClaudeAppsGatewayLogin({ sessionId })` once when a session was started and not finished.

Form state: `gatewayUrl`, `loginPrompt: ClaudeAppsGatewayLoginStartResult | undefined`, `error`, a `useRef` holding the running driver. The panel places the form between its header and the candidate list: an `Input` with placeholder `https://claude-gateway.internal.example.com`, aria-label `t("Claude apps gateway URL")`, and a `Button` labelled `t("Sign in")`. While a prompt is set, show `t("Enter this code in the browser: {code}").replace("{code}", prompt.userCode)`, the interpolation style `settings.tsx:1363` uses. `onConfirmed` clears the prompt and calls the `onConfirmed` prop; `onError` writes the form's `error` line. The effect cleanup calls the ref's `cancel`. New copy, with `zh` values: "Sign in to a Claude apps gateway", "Claude apps gateway URL", "Sign in", "Enter this code in the browser:", "Gateway sign-in confirmed.", "Gateway sign-in was denied.", "Gateway sign-in expired. Try again.".

- [ ] **Step 4: Run the UI tests and the i18n pairing test**

Run: `npm run test:ui`
Expected: PASS, including `i18n-pairing.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/pages/home/shared/claude-apps-gateway-login.ts packages/ui/src/pages/home/components/claude-apps-gateway-sign-in.tsx packages/ui/src/pages/home/components/providers.tsx packages/ui/src/pages/home/shared/i18n.tsx packages/ui/test/component/claude-apps-gateway-login.test.tsx
git commit -m "feat(ui): sign in to a Claude apps gateway from the provider import panel"
```

---

### Task 6: Docs and the harness proof

**Files:**
- Modify: `docs/src/content/docs/en/guides/claude-apps-gateway.md` and `docs/src/content/docs/zh/guides/claude-apps-gateway.md` (phase 1 pages; add a section)

- [ ] **Step 1: Add the section "Use a gateway as an LLMR provider"**

After the "Try it locally" section in both pages: Providers → Add → Import local agent provider → enter the gateway URL → Sign in → approve in the browser → Import. State that the token names the signing developer, so the gateway's spend limits and model allowlist apply to every agent LLMR routes to that provider, that the session refreshes itself and asks for a new sign-in after IdP deprovisioning or a JWT secret rotation, and that sign-out is deleting the file under `~/.llm-router/claude-apps-gateway/`.

- [ ] **Step 2: Prove it against the phase 1 harness**

Run `node scripts/claude-apps-gateway-dev.mjs --load-test`, then in LLMR Desktop sign in to `http://127.0.0.1:18080` through the new form as the Dex mock user, import the provider, pick `claude-sonnet-4-6`, and send one request from any client. Expected: a 200 whose response body starts with the gateway's canned-reply sentence, and the logged request's `authorization` header showing `[redacted]` (`sensitive-headers.ts` marks it sensitive). Record the date and `claude --version` in the docs page's verification line.

- [ ] **Step 3: Build the docs and commit**

Run: `cd docs && npm run build`. Expected: both locale pages build.

```bash
git add docs/src/content/docs/en/guides/claude-apps-gateway.md docs/src/content/docs/zh/guides/claude-apps-gateway.md
git commit -m "docs: sign LLMR in to a Claude apps gateway"
```

---

### Task 7: Whole-branch check

- [ ] **Step 1:** `npm run typecheck && npm run test:core && npm run test:ui && npm run test:electron && npm run test:architecture`. Expected: all PASS; restore `packages/core/models.json` and `packages/ui/src/generated` if a build touched them.
- [ ] **Step 2:** Open the PR titled `feat: sign LLMR in to a Claude apps gateway (phase 2)` with the proof line from Task 6 and the repo's attribution footer.
