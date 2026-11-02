# Claude Apps Gateway Client (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a developer sign LLMR in to their organization's Claude apps gateway with the gateway's device flow, and expose that gateway as an LLMR provider whose bearer token stays fresh at runtime.

**Architecture:** A session store owns one token file per gateway host. A device-login service runs start, wait and cancel over the gateway's OAuth endpoints and writes a session on success. A new `claude-apps-gateway` local-agent provider kind turns stored sessions into candidates and imports, and the existing runtime auth hook gains a branch that swaps in a live token per request. The RPC triplet and the import-panel form follow the bot-gateway QR login and the Kimi provider exactly.

**Tech Stack:** TypeScript under `packages/core`, React under `packages/ui`, Electron IPC, `node:test` with `node:assert/strict`, a fake gateway on `node:http` in tests.

**Spec:** `docs/superpowers/specs/completed/2026-10-25-claude-apps-gateway-client.md`

**Checked against `main` at `0c6128ee` on 2026-11-01.** Line numbers below are from that commit. The refresh-failure rule, single-flight refresh, fixed endpoint paths, the probe step and the always-visible panel came from that review.

## Global Constraints

- Endpoint paths and grant strings, verbatim: `/.well-known/oauth-authorization-server`, `/oauth/device_authorization`, `/oauth/token`, `/v1/models`, `urn:ietf:params:oauth:grant-type:device_code`, `refresh_token`. Token requests are `application/x-www-form-urlencoded`.
- Poll errors, verbatim: `authorization_pending` keep polling, `slow_down` add 5 s to the interval, `expired_token` and `access_denied` end the login.
- Session file: `CONFIGDIR/claude-apps-gateway/<slug>.json`, mode `0o600`, written to a temp file then renamed. Slug: host plus `:port` with every character outside `[a-z0-9.-]` replaced by `-`.
- Gateway URL: `https:` anywhere, `http:` only for a loopback host; normalized to its origin with no trailing slash. Test loopback with `isLoopbackUrl` from `local-providers/shared.ts`, because `new URL("http://[::1]").hostname` is `[::1]`, not `::1`.
- Every call goes to the fixed paths above on the normalized gateway origin. The discovery document only confirms the host is a gateway: `start` rejects it unless `grant_types_supported` includes the device-code grant. Endpoint URLs inside it are ignored, so a device code or refresh token never goes to a host the user did not type.
- Refresh follows `resolveKimiAuth` (`kimi.ts:201`). One in-flight refresh per session file (a module `Map<string, Promise<…>>` keyed by `sourceFile`), a 30 s `AbortController` timeout, and on a 401/403 a re-read of the file that adopts a newer refresh token written by another LLMR process (Desktop and the `llmr` CLI share `CONFIGDIR`).
- Plugin key suffix, verbatim: `claude-apps-gateway-oauth` (public) and `claude-apps-gateway-oauth-internal`; the plugin carries `claudeAppsGateway: { url }`.
- Wait RPC default `timeoutMs` 20000; the UI loops until `confirmed` or a terminal status.
- Style per `AGENTS.md`. UI copy is literal English in the component; the repo is English-only (`tests/architecture/english-only.test.mjs`), so there is no translation map to update.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit-or-integration>/<path>.test.js`. UI component tests: `npm run test:ui`. Commit gate runs typecheck plus `npm run test:architecture`.
- All HTTP through `fetchWithSystemProxy` from `@llmr/core/proxy/system-proxy-fetch`; tests override `globalThis.fetch` the way `local-agent-auth-provider-hook.test.mjs` does, or point the URL at the fake server.

## Review Focus

1. A refresh that answers `401`: expected the session file stays, the candidate turns `locked`, and the hook fails the request with `ok: false` and an error that says to sign in again and contains no token. That matches the Claude Code hook since `f3c1cebf` (tests at `local-agent-auth-provider-hook.test.mjs:182`). The token baked in at import is older than the rejected one, so falling back to it only turns a clear message into an upstream 401. A transient refresh failure (5xx, timeout) keeps the stored token, as the Claude Code test at line 204 does. Pinned in Tasks 1 and 3.
2. Two gateways on different hosts: expected two session files, two candidates, two providers, and no cross-talk in the hook. Pinned in Task 3.
3. A `slow_down` reply during polling: expected the next poll waits `interval + 5` seconds and the wait call still returns within `timeoutMs`. Pinned in Task 2.
4. An `http://` URL to a non-loopback host: expected `start` rejects before any network call. Pinned in Task 2.
5. The import panel's wait loop after the user closes the dialog mid-login: expected the pending login is canceled and no further `wait` calls fire. Pinned in Task 5 by the DOM-free login driver test.
6. A fresh machine with no local agents: expected the import panel still renders so the sign-in form is reachable. Today the panel returns `null` when it has no candidates (`providers.tsx:1408`), and the spec adds no `missing` gateway candidate. Pinned in Task 5.
7. Five concurrent requests with an expired token: expected one `/oauth/token` call. Pinned in Task 1.

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
  - `export async function resolveClaudeAppsGatewaySession(gatewayUrl: string, configDir?: string): Promise<ClaudeAppsGatewaySession | undefined>` (read, refresh if expired and a refresh token exists, persist, return; concurrent callers share one refresh, and an auth error adopts a newer token already on disk before it rethrows)
  - `export async function fetchClaudeAppsGatewayModels(session: ClaudeAppsGatewaySession): Promise<{ models: string[]; modelDisplayNames: Record<string, string> }>` (GET `/v1/models` with the bearer; `data[].id`, `data[].display_name`)
- `configDir` defaults to `CONFIGDIR` from `@llmr/core/config/constants`.

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
test("concurrent resolves share one refresh", async (t) => { /* expired session; fake /oauth/token counts calls and answers after 50 ms; await Promise.all of five resolve() calls; token call count 1, all five get the same accessToken */ });
test("a 401 adopts a newer refresh token another process already wrote", async (t) => { /* fake answers 401 and, before replying, rewrites the session file with refresh_token "peer" and a valid access_token "peer-access"; resolve() returns accessToken "peer-access" */ });
test("models come from /v1/models with display names", async (t) => { /* fake asserts authorization: Bearer tok; returns data:[{id:"claude-sonnet-4-6",display_name:"Claude Sonnet 4.6"}]; assert.deepEqual */ });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-apps-gateway-session-store.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `session-store.ts`**

Persist the file as `{ access_token, refresh_token, expires_at, gateway_url, email, models, model_display_names }` (snake_case on disk, the Kimi convention) and map back on read; skip unreadable or malformed files in `list` with no throw. Create the directory with `mkdirSync(dir, { recursive: true, mode: 0o700 })` (Kimi never needs this, because its CLI owns the folder). Then write the way `persistKimiAuth` does (`kimi.ts:456-480`): a `${file}.${process.pid}.${randomUUID()}.tmp` file written with `mode: 0o600`, `renameSync`, `chmodSync(file, 0o600)`, and removing the temp file on failure. Unlike Kimi, a failed write during login must throw, so the UI does not report a sign-in that was never saved. `refresh` POSTs `${gatewayUrl}/oauth/token` with `grant_type=refresh_token&refresh_token=…` as `URLSearchParams` and `accept: application/json`; compute `expiresAt = floor(Date.now()/1000) + expires_in`. `resolve` copies the `kimiRefreshInFlight` and `adoptPeerRotatedKimiAuth` shape from `kimi.ts:201-232`, and the refresh copies its 30 s abort from `kimi.ts:398`.

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
- Modify: `packages/core/src/contracts/app.ts` (add the six types below next to the `BotGatewayQrLogin*` types at line 1747)
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
test("start rejects a host whose discovery document lacks the device-code grant", async (t) => { /* fake discovery returns grant_types_supported: ["authorization_code"]; rejects with /not a Claude apps gateway/; no device_authorization call */ });
test("start ignores endpoint URLs in the discovery document", async (t) => { /* fake discovery advertises token_endpoint "http://127.0.0.1:1/elsewhere"; the login still completes against the fake's own /oauth/token */ });
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

In-process `Map<string, PendingLogin>` with `{ configDir, deviceCode, expiresAtMs, gatewayUrl, intervalMs }`. The token endpoint is always `${gatewayUrl}/oauth/token`. `sessionId` from `randomUUID()`. `wait` loops: poll, on `authorization_pending` sleep `intervalMs`, on `slow_down` add 5000 to `intervalMs` then sleep, on success call `fetchClaudeAppsGatewayModels`, persist, delete the entry, return `confirmed`; on `expired_token`, `access_denied` or the device code's own expiry, delete the entry and return that status; when `timeoutMs` elapses, return `pending` without deleting. An unknown `sessionId` returns `status: "canceled"` with `message: "Login session was not found or was canceled."`. `start` runs `verification_uri_complete` (falling back to `verification_uri`) through the same https-or-loopback rule as the gateway URL before returning it, because the UI hands it straight to `openExternal`.

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
- Modify: `packages/core/src/contracts/app.ts:453` (`LocalAgentProviderKind` gains `"claude-apps-gateway"`; today it lists `claude-code`, `codex`, `grok`, `kimi`, `opencode` and `zcode`)
- Create: `packages/core/src/agents/local-providers/claude-apps-gateway.ts`
- Modify: `packages/core/src/agents/local-providers/service.ts` (candidates and import dispatch; re-export the session-store functions the hook and the probe need, as it does for Kimi at line 18)
- Modify: `packages/core/src/gateway/core-runtime/local-agent-auth-provider-hook.ts` (`LocalAgentOauthKind` at line 48, `localAgentOauthKind` at 115, a new branch in `localAgentOauthProviderHook` beside the Kimi one at 102)
- Modify: `packages/core/src/providers/probe.ts:961-985` (the provider Test button uses the live gateway token, beside `isLocalClaudeProbe`)
- Modify: `packages/ui/src/pages/home/shared/providers.ts:66` (`localAgentProviderIconUrls` gains the new kind; use `claudeCodeLogoUrl`)
- Modify: `packages/ui/src/pages/home/components/providers.tsx:1530` (`localAgentProviderPluginSuffixes` gains `"claude-apps-gateway": ["-claude-apps-gateway-oauth", "-claude-apps-gateway-oauth-internal"]`)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-apps-gateway.test.mjs`
- Test: `packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs`
- Test: `packages/core/test/unit/providers/provider-probe.test.mjs` (its local-agent cases start at line 366)

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
  assert.equal(result.provider.apiKey, "llmr-local-agent-login");
  assert.deepEqual(result.provider.models, ["claude-sonnet-4-6"]);
  assert.equal(result.providerPlugins.length, 2);
  assert.equal(result.providerPlugins[0].key, "llmr-local-agent-__LLMR_PROVIDER_NAME_SLUG__-claude-apps-gateway-oauth");
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
  // persist an expired session with refreshToken "old" under a temp configDir exposed via process.env.LLMR_INTERNAL_HOME_DIR per the suite's HOME isolation; fake fetch answers /oauth/token with access_token "fresh"
  const [hook] = createGatewayPlugin({ config: { providerPlugins: [{ auth: { headers: { authorization: "Bearer stale" }, removeHeaders: ["x-api-key"], strict: true }, claudeAppsGateway: { url: gatewayUrl }, key: "llmr-local-agent-gw-claude-apps-gateway-oauth", providerName: "gw" }] } }).providerHooks;
  const result = await hook.authenticate({ model: "claude-sonnet-4-6", upstreamRequest: { headers: { "x-api-key": "client" }, method: "POST", url: `${gatewayUrl}/v1/messages` } });
  assert.equal(result.ok, true);
  assert.equal(result.value.headers.authorization, "Bearer fresh");
  assert.equal(result.value.headers["x-api-key"], undefined);
});
test("Claude apps gateway hook fails the request when refresh is refused", async (t) => { /* fake fetch 401; result.ok false; result.error matches /sign in again/i and does not match /stale|old/ */ });
test("Claude apps gateway hook keeps the stored token after a transient refresh failure", async (t) => { /* fake fetch 503; result.ok true; authorization is the stored access token */ });
test("two gateway plugins resolve their own sessions", async (t) => { /* two session files on two ports; each hook's authorization matches its own session's token */ });
```

`build/test-home.mjs` sets `LLMR_INTERNAL_HOME_DIR` to a temp home for every test run, and `CONFIGDIR` derives from it (`packages/core/src/runtime/app-paths.ts:7,37`), so write the session file at `claudeAppsGatewaySessionFile(gatewayUrl)` with the default `configDir` and remove it in `t.after`; the hook cannot take a `configDir` argument.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/local-agent-provider-claude-apps-gateway.test.js .test-dist/core/test/unit/gateway/local-agent-auth-provider-hook.test.js .test-dist/core/test/unit/providers/provider-probe.test.js`
Expected: FAIL, module not found and unknown hook kind.

- [ ] **Step 4: Implement**

`local-providers/claude-apps-gateway.ts`: candidate `name` is `` `Claude apps gateway (${host})` ``, `detail` "Signed in. Click Import to add it as a gateway provider." when importable, "Gateway session expired. Sign in again." when locked. Import: `resolveClaudeAppsGatewaySession`, then `fetchClaudeAppsGatewayModels` in try/catch falling back to the stored list, `providerPayload(nextCandidate, uniqueProviderName(providerNames, candidate.name), session.gatewayUrl)`, and two plugins, as `importKimiProvider` builds them (`kimi.ts:163-166`): `{ ...bearerAuthPlugin("claude-apps-gateway-oauth", token), claudeAppsGateway: { url } }` and `{ ...bearerAuthPlugin("claude-apps-gateway-oauth-internal", token, {}, providerInternalNamePlaceholder), claudeAppsGateway: { url } }`. `config-compiler.ts:236` (`withoutStaticLocalOauthAuth`) strips the static `auth` from both once the hook recognizes the key, so only the live hook sets the bearer at request time.

`service.ts`: spread `...claudeAppsGatewayCandidates()` into `getLocalAgentProviderCandidates` and add the `candidate.kind === "claude-apps-gateway"` branch in `importLocalAgentProvider`.

Hook: `LocalAgentOauthKind` gains `"claude-apps-gateway"`; `localAgentOauthKind` returns it when the key includes `claude-apps-gateway-oauth` (this also matches the `-internal` key). The branch follows `authenticateClaudeCode` (line 151), not `authenticateWithBearer`, because a refused refresh must fail the request:

```ts
async function authenticateClaudeAppsGateway(input: ProviderPluginInput, plugin: Record<string, unknown>): Promise<ProviderHookResult> {
  const url = isRecord(plugin.claudeAppsGateway) ? stringValue(plugin.claudeAppsGateway.url) : undefined;
  if (!url) return { error: "Claude apps gateway URL is missing from the provider plugin.", ok: false };
  let session: ClaudeAppsGatewaySession | undefined;
  try {
    session = await resolveClaudeAppsGatewaySession(url);
  } catch (error) {
    if (error instanceof ClaudeAppsGatewayAuthError) {
      return { error: "Claude apps gateway session ended. Sign in again from Providers, Add, Import local agent provider.", ok: false };
    }
    session = readClaudeAppsGatewaySession(url);
  }
  const token = session?.accessToken || originalBearerToken(plugin);
  if (!token) return { error: "Claude apps gateway session was not found. Sign in again.", ok: false };
  return { ok: true, value: { ...input.upstreamRequest, headers: withBearerAuth(input.upstreamRequest.headers, token, originalRemoveHeaders(plugin)) } };
}
```

Probe: `providerProbeAuthRequest` (`probe.ts:913`) applies the plugin's static auth, which holds the import-time token. Sessions last one hour by default, so the provider Test button would fail an hour after import. Add a branch beside `isLocalClaudeProbe`: when `apiKey === localAgentProviderApiKey` and a plugin carries `claudeAppsGateway.url`, set `authorization` from `resolveClaudeAppsGatewaySession(url)` (falling back to `readClaudeAppsGatewaySession` on any error) and delete `x-api-key`. Test it with an expired baked token and a valid session file.

- [ ] **Step 5: Run the tests and typecheck**

Run: the Step 3 command, then `npm run typecheck`.
Expected: PASS; typecheck passes only once both UI maps have the new key.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/contracts/app.ts packages/core/src/agents/local-providers/claude-apps-gateway.ts packages/core/src/agents/local-providers/service.ts packages/core/src/gateway/core-runtime/local-agent-auth-provider-hook.ts packages/core/src/providers/probe.ts packages/ui/src/pages/home/shared/providers.ts packages/ui/src/pages/home/components/providers.tsx packages/core/test/unit/agents/local-agent-provider-claude-apps-gateway.test.mjs packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs packages/core/test/unit/providers/provider-probe.test.mjs
git commit -m "feat(providers): Claude apps gateway as a local-agent provider with live bearer auth"
```

---

### Task 4: RPC and IPC wiring for the login triplet

**Files:**
- Modify: `packages/core/src/contracts/ipc-channels.ts:42-44` (add `appClaudeAppsGatewayLoginCancel: "llmr:app:claude-apps-gateway-login-cancel"`, `...LoginStart: "llmr:app:claude-apps-gateway-login-start"`, `...LoginWait: "llmr:app:claude-apps-gateway-login-wait"`)
- Modify: `packages/core/src/web/management-server.ts:267` (`rpcHandlers` gains `cancelClaudeAppsGatewayLogin`, `startClaudeAppsGatewayLogin`, `waitClaudeAppsGatewayLogin`, alphabetized)
- Modify: `packages/electron/src/main/ipc.ts:237-245` (three `ipcMain.handle` blocks beside the QR-login ones, plus the import at line 9 and the type imports at line 56)
- Modify: `packages/electron/src/main/preload.ts` (three entries in alphabetical order, as the QR-login ones sit at lines 109, 172 and 183, plus the type imports at line 21)
- Modify: `packages/ui/src/types/electron.d.ts:160` (three members on `Window["llmr"]` and the type imports)
- Modify: `packages/ui/src/web-client-bridge.ts:110` (three `rpc(...)` entries)
- Test: `packages/core/test/unit/web/web-management-server.test.mjs`

**Interfaces:**
- Consumes Task 2's three functions and six types.
- Produces on `window.llmr`: `startClaudeAppsGatewayLogin(request): Promise<ClaudeAppsGatewayLoginStartResult>`, `waitClaudeAppsGatewayLogin(request): Promise<ClaudeAppsGatewayLoginWaitResult>`, `cancelClaudeAppsGatewayLogin(request): Promise<ClaudeAppsGatewayLoginCancelResult>`.

- [ ] **Step 1: Write the failing test**

Boot the runtime the way the test at `web-management-server.test.mjs:71` does and call the file's `rpc(baseUrl, authToken, method, args)` helper (line 176): `await rpc(runtime.url, webAuthToken, "cancelClaudeAppsGatewayLogin", [{ sessionId: "nope" }])` and assert `deepEqual(result, { canceled: false })`. That proves the route exists without a network login.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/web/web-management-server.test.js`
Expected: FAIL, unknown method.

- [ ] **Step 3: Wire all six files**

Copy the QR-login lines in each file and rename. In `preload.ts` the pattern is `invoke(IPC_CHANNELS.appClaudeAppsGatewayLoginStart, request) as Promise<ClaudeAppsGatewayLoginStartResult>`; in `web-client-bridge.ts`, `rpc("startClaudeAppsGatewayLogin", [request]) as ReturnType<LlmrApi["startClaudeAppsGatewayLogin"]>` (the type was `CcrApi` before the v6 rename).

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
- Modify: `packages/ui/src/pages/home/components/providers.tsx:1360-1530` (`LocalAgentProviderImportPanel` renders the form above the candidate list and stops hiding itself when there are no candidates)
- Test: `packages/ui/test/component/claude-apps-gateway-login.test.tsx`

**Interfaces:**
- Consumes `window.llmr.startClaudeAppsGatewayLogin`, `waitClaudeAppsGatewayLogin`, `cancelClaudeAppsGatewayLogin`, `openExternal`, `getLocalAgentProviderCandidates`.
- Produces in `shared/claude-apps-gateway-login.ts` a DOM-free driver, so the loop is testable with `node:test` like the other UI unit files:
  - `export type ClaudeAppsGatewayLoginApi = Pick<NonNullable<Window["llmr"]>, "cancelClaudeAppsGatewayLogin" | "openExternal" | "startClaudeAppsGatewayLogin" | "waitClaudeAppsGatewayLogin">`
  - `export type ClaudeAppsGatewayLoginEvents = { onConfirmed: (result: ClaudeAppsGatewayLoginWaitResult) => void; onError: (message: string) => void; onPrompt: (start: ClaudeAppsGatewayLoginStartResult) => void }`
  - `export function runClaudeAppsGatewayLogin(api: ClaudeAppsGatewayLoginApi, gatewayUrl: string, events: ClaudeAppsGatewayLoginEvents): { cancel: () => void; done: Promise<void> }`
- Produces in `components/claude-apps-gateway-sign-in.tsx`: `export function ClaudeAppsGatewaySignInForm({ onConfirmed }: { onConfirmed: () => void })`, which owns the URL field, the Sign in button, the user-code prompt and the error line, calls `runClaudeAppsGatewayLogin(window.llmr, url, events)` from its click handler and the returned `cancel` from its effect cleanup. The panel renders `<ClaudeAppsGatewaySignInForm onConfirmed={() => setScanAttempt((value) => value + 1)} />` so a confirmed login re-scans candidates. The form lives in its own file so its test renders it alone. `provider-dialog-local-agent.test.tsx` already renders `AddProviderForm` from `providers.tsx`, but only in edit mode and without `window.llmr`, so it cannot reach the panel.

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
test("add dialog shows the gateway sign-in form when no local agents were found", () => {
  // in provider-dialog-local-agent.test.tsx: render(createProviderDraft([]), { mode: "add" }) with no window.llmr; assert.match(html, /Sign in to a Claude apps gateway/)
});
test("sign-in form renders the URL field and the Sign in button", () => {
  const en = renderToStaticMarkup(<ClaudeAppsGatewaySignInForm onConfirmed={() => undefined} />);
  assert.match(en, /aria-label="Claude apps gateway URL"/);
  assert.match(en, />Sign in<\/button>/);
});
```

`fakeApi` records `start:<url>`, `open:<url>`, `wait:<sessionId>`, `cancel:<sessionId>` and returns `sessionId: "s1"` from `start`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:ui`
Expected: FAIL, no Sign in button.

- [ ] **Step 3: Implement the form**

Driver: `start`, `onPrompt`, `openExternal(verificationUriComplete)`, then loop `wait({ sessionId })` while not canceled and `status === "pending"`; `confirmed` → `onConfirmed`; `denied`, `expired`, `canceled` or a thrown error → `onError(message)`; `cancel()` sets a flag and calls `api.cancelClaudeAppsGatewayLogin({ sessionId })` once when a session was started and not finished.

Form state: `gatewayUrl`, `loginPrompt: ClaudeAppsGatewayLoginStartResult | undefined`, `error`, a `useRef` holding the running driver. The panel's early return at `providers.tsx:1408` becomes `if (mode !== "add") return null;`, so the panel renders with the form even when the scan found nothing; the candidate list keeps its own `candidates.length > 0` guard. The header copy at line 1457 gains a sentence: "Or sign in to your organization's Claude apps gateway." The panel places the form between its header and the candidate list: an `Input` with placeholder `https://claude-gateway.internal.example.com`, aria-label `Claude apps gateway URL`, and a `Button` labelled `Sign in`. While a prompt is set, show `Enter this code in the browser: ${prompt.userCode}`. `onConfirmed` clears the prompt, shows "Gateway sign-in confirmed." and calls the `onConfirmed` prop. The message matters when the gateway is already imported: the rescan then hides the candidate (`localAgentProviderAlreadyImported`), yet the new session file already fixes the existing provider, because the hook reads it by URL; `onError` writes the form's `error` line. The effect cleanup calls the ref's `cancel`. New copy: "Sign in to a Claude apps gateway", "Claude apps gateway URL", "Sign in", "Enter this code in the browser:", "Gateway sign-in confirmed.", "Gateway sign-in was denied.", "Gateway sign-in expired. Try again.".

- [ ] **Step 4: Run the UI tests**

Run: `npm run test:ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/pages/home/shared/claude-apps-gateway-login.ts packages/ui/src/pages/home/components/claude-apps-gateway-sign-in.tsx packages/ui/src/pages/home/components/providers.tsx packages/ui/test/component/claude-apps-gateway-login.test.tsx packages/ui/test/component/provider-dialog-local-agent.test.tsx
git commit -m "feat(ui): sign in to a Claude apps gateway from the provider import panel"
```

---

### Task 6: Docs and the harness proof

**Files:**
- Modify: `docs/src/content/docs/en/guides/claude-apps-gateway.md` (phase 1 page; add a section)

- [ ] **Step 1: Add the section "Use a gateway as an LLMR provider"**

After the "Try it locally" section: Providers → Add → Import local agent provider → enter the gateway URL → Sign in → approve in the browser → Import. State that the token names the signing developer, so the gateway's spend limits and model allowlist apply to every agent LLMR routes to that provider, that the session refreshes itself and asks for a new sign-in after IdP deprovisioning or a JWT secret rotation, that signing in again repairs an already-imported provider without a re-import, and that sign-out is deleting the file under `~/.llm-router/claude-apps-gateway/` (`%APPDATA%\llm-router\claude-apps-gateway\` on Windows). End the section with a one-line verification note naming the date, the LLMR commit and the gateway's `claude --version` (the harness runs the host's `claude gateway`).

- [ ] **Step 2: Prove it against the phase 1 harness**

Run `node scripts/claude-apps-gateway-dev.mjs --load-test`. Start LLMR Desktop from this branch against a scratch home, never the real one: set both `HOME` and `LLMR_INTERNAL_HOME_DIR` to a fresh `mktemp -d` (setting only the latter leaked into the real `~/.claude` before PR 13). Opening Add provider scans for a Claude Code login, which runs `security find-generic-password` (`claude-code.ts:668`) against the real login Keychain even with a scratch home, so macOS may prompt; Deny is safe and only hides the Claude Code candidate. Turn on `observability.requestLogs` in that home, since request logs are off by default. Then sign in to `http://127.0.0.1:18080` through the new form as the Dex mock user, import the provider, pick `claude-sonnet-4-6`, and send one request from any client. Expected: a 200 whose response body starts with the gateway's canned-reply sentence, and the logged request's `authorization` header showing `[redacted]` (the redaction rules are in `packages/core/src/gateway/http/io.ts:255-257`). Put the date, commit and `claude --version` in the verification note from Step 1. Then click the provider's Test button and expect it to pass, which proves the probe uses the live token.

- [ ] **Step 3: Build the docs and commit**

Run: `cd docs && npm run build`. Expected: the page builds.

```bash
git add docs/src/content/docs/en/guides/claude-apps-gateway.md
git commit -m "docs: sign LLMR in to a Claude apps gateway"
```

---

### Task 7: Whole-branch check

- [ ] **Step 1:** `npm run typecheck && npm run test:core && npm run test:ui && npm run test:electron && npm run test:architecture && npm run build:assets`. `build:assets` is the only check that the renderer bundle still builds (`.claude/rules/ui.md`); the new UI files import only types from `@llmr/core/contracts/app`. Expected: all PASS; restore `packages/core/models.json` and `packages/ui/src/generated` if a build touched them.
- [ ] **Step 2:** Open the PR titled `feat: sign LLMR in to a Claude apps gateway (phase 2)` with the proof line from Task 6 and the repo's attribution footer.
