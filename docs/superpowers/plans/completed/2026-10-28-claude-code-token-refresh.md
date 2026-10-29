# Claude Code Token Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLMR's imported Claude Code provider refreshes an expired claude.ai access token with the refresh token, persists the rotated pair where it came from without clobbering a peer's write, and adopts a token the CLI rotated in the meantime, the way the Grok provider already does.

**Architecture:** Four additions in `claude-code.ts`: a Claude Code token type that knows its store, a coalesced `resolveClaudeCodeAuth()` with an in-memory refreshed-pair cache, refresh and peer-rotation adoption, and a compare-and-swap persistence helper for the Keychain and the credentials file. Every raw-token reader calls the resolver. Tests drive the refresh endpoint through `globalThis.fetch` and a loopback env override, and the Keychain through a new stateful fake `security` in the test file.

**Tech Stack:** TypeScript under `packages/core`, `node:test` with `node:assert/strict`, `fetchWithSystemProxy` from `@llmr/core/proxy/system-proxy-fetch`.

**Spec:** `docs/superpowers/specs/2026-10-28-claude-app-opt-in-and-claude-code-token-refresh.md`, Change 2.

## Global Constraints

- Branch from `main` after PR 48 or its successor merges; independent of the takeover plan.
- Endpoint, verbatim: `https://platform.claude.com/v1/oauth/token`. Client id, verbatim: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`. Request: `Content-Type: application/json`, body `{ "grant_type": "refresh_token", "refresh_token": <stored>, "client_id": <client id>, "scope": <stored scopes joined by one space> }`; omit `scope` when the record has none. Response fields: `access_token`, `refresh_token`, `expires_in`, `refresh_token_expires_in`, `scope`. All read from the Claude Code 2.1.312 binary on 2026-10-28.
- Env override name, verbatim: `LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT`, used only when its host is `127.0.0.1`, `localhost` or `[::1]`. Timeout env, verbatim: `LLMR_CLAUDE_CODE_OAUTH_REFRESH_TIMEOUT_MS`, default 15000.
- Expiry margin: `expiresAt <= Date.now() + 60_000`. A record with a refresh token and no access token is expired.
- Rejection that triggers adoption: HTTP 401 or 403, or HTTP 400 or 401 whose JSON body has `error === "invalid_grant"`.
- Keychain write, verbatim: the line `add-generic-password -U -a "<account>" -s "<service>" -X <hex of the JSON record>\n` on the stdin of `execFileSync("security", ["-i"])`; argv form `security add-generic-password -U -a <account> -s <service> -X <hex>` only when the line is longer than 4032 bytes. Never `-w`. stderr of the write is discarded; a failure logs the fixed text `Claude Code login could not be written back to <store label> (security exited <code>)` once per store.
- File write: temp file in the same directory, `mode: 0o600`, then `renameSync`.
- Style per `AGENTS.md`. No comments except a non-obvious why; the compare-and-swap rule and the `security -i` shape are two.
- One test file: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/local-agent-provider-claude-code.test.js`, `.../gateway/local-agent-auth-provider-hook.test.js`, `.../providers/provider-account-service.test.js`.

## Review Focus

- A Keychain record without `expiresAt` (older Claude Code) is not expired and never refreshed on its own (Task 1).
- A refresh that returns no `refresh_token` keeps the old one; one that returns `refresh_token_expires_in` or `scope` updates `refreshTokenExpiresAt` and `scopes` (Task 2, Task 3).
- A refresh rejected with 400 `invalid_grant` while the Keychain already holds a newer refresh token adopts the Keychain's pair and does not fail the request (Task 2).
- After a failed write, the next request serves the cached fresh pair and retries only the write; the consumed refresh token is never posted twice (Task 3).
- A record that a peer rotated between LLMR's POST and its write is not overwritten; LLMR adopts it (Task 3).

---

### Task 0: Stateful fake `security` for the tests

**Files:**
- Modify: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs:352-380` (beside `withFakeSecurityScript`)

**Interfaces:**
- Produces: `withFakeKeychain(initialRecord, run, options?)`, where `run` receives `{ read(): object, write(record): void, calls: Array<{ argv: string[], stdin: string }> }`. The fake script keeps the record in a state file: `find-generic-password -w` prints its JSON, `add-generic-password` (as argv, or parsed from a `-i` stdin line) replaces it with the hex-decoded `-X` value and appends to `calls`, and `options.writeExitCode` makes `add-generic-password` exit with that code without writing. `read` and `write` let a test rotate the record between LLMR's calls.

- [ ] **Step 1: Write the helper and a self-test**

```js
test("fake keychain records security -i writes and exposes the record", async () => {
  await withFakeKeychain({ claudeAiOauth: { accessToken: "a" } }, async (keychain) => {
    execFileSync("security", ["-i"], { input: `add-generic-password -U -a "u" -s "Claude Code-credentials" -X ${Buffer.from("{\"x\":1}").toString("hex")}\n` });
    assert.deepEqual(keychain.read(), { x: 1 });
    assert.equal(keychain.calls.length, 1);
  });
});
```

- [ ] **Step 2: Run the file, verify PASS, commit**

```bash
git add packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs
git commit -m "test(claude-code): stateful fake keychain"
```

### Task 1: A token type that knows its store and its expiry

**Files:**
- Modify: `packages/core/src/agents/local-providers/shared.ts:138-151` (`readOauthTokenSetFields` also returns `expiresAt`, `refreshTokenExpiresAt` as numbers when present and `scopes` as a string array; other callers ignore the extra keys)
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (`ClaudeCodeTokenSet`, `ClaudeCodeTokenStore`; the three places a token set is built: the file path near line 211, the `claudeAiOauth` Keychain path near 318, the legacy-root Keychain path near 327)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`

**Interfaces:**
- Produces:
  - `export type ClaudeCodeTokenStore = { kind: "keychain"; account?: string; service: string; container: "claudeAiOauth" | "root"; refreshable: boolean } | { kind: "file"; path: string; container: "claudeAiOauth" | "root"; refreshable: boolean }`. `refreshable` is false for a Keychain item read without an account or whose service name ends in `-custom-oauth-credentials` (or starts with the custom-oauth prefix the scan builds at line 252).
  - `export type ClaudeCodeTokenSet = OAuthTokenSet & { expiresAt?: number; refreshTokenExpiresAt?: number; scopes?: string[]; store: ClaudeCodeTokenStore }`; `readClaudeCodeOauth(): ClaudeCodeTokenSet | undefined`.
  - `export function claudeCodeAccessTokenExpired(auth: Pick<ClaudeCodeTokenSet, "accessToken" | "expiresAt">): boolean`.
- `OAuthTokenSet` in `shared.ts` does not change (Grok and Kimi already give `expiresAt` their own types).

- [ ] **Step 1: Write the failing tests**

```js
test("Claude Code local provider carries expiry, scopes and store from the keychain record", { skip: process.platform === "win32" }, async () => {
  await withFakeKeychain({ claudeAiOauth: { accessToken: "a", refreshToken: "r", expiresAt: 1793249706961, refreshTokenExpiresAt: 1800000000000, scopes: ["user:inference"] }, mcpOAuth: {} }, async () => {
    const oauth = readClaudeCodeOauth();
    assert.equal(oauth.expiresAt, 1793249706961);
    assert.equal(oauth.refreshTokenExpiresAt, 1800000000000);
    assert.deepEqual(oauth.scopes, ["user:inference"]);
    assert.deepEqual(oauth.store, { account: keychainAccount, container: "claudeAiOauth", kind: "keychain", refreshable: true, service: "Claude Code-credentials" });
  });
});

test("claudeCodeAccessTokenExpired honors the 60 s margin, a missing expiresAt and a missing access token", () => {
  const now = Date.now();
  assert.equal(claudeCodeAccessTokenExpired({ accessToken: "a", expiresAt: now + 30_000 }), true);
  assert.equal(claudeCodeAccessTokenExpired({ accessToken: "a", expiresAt: now + 120_000 }), false);
  assert.equal(claudeCodeAccessTokenExpired({ accessToken: "a" }), false);
  assert.equal(claudeCodeAccessTokenExpired({ expiresAt: now + 120_000 }), true);
});
```

Add one case to the existing file-path test asserting `store` is `{ container: "claudeAiOauth", kind: "file", path: credentialsFile, refreshable: true }`, and one to the legacy-root Keychain test asserting `container: "root"`.

- [ ] **Step 2: Run to verify they fail**

Run: `node build/test.mjs core && node --test --test-reporter=tap .test-dist/core/test/unit/agents/local-agent-provider-claude-code.test.js`
Expected: `not ok` (`expiresAt` undefined, `store` undefined, function not exported).

- [ ] **Step 3: Implement**

`readOauthTokenSetFields` reads `expiresAt`/`expires_at` and `refreshTokenExpiresAt` as numbers only, and `scopes` as an array of strings. `scanClaudeCodeKeychain` and the file scan fill `store` at each of the three build sites; `claudeCodeAccessTokenExpired` returns `!auth.accessToken || (auth.expiresAt !== undefined && auth.expiresAt <= Date.now() + 60_000)`.

- [ ] **Step 4: Run to verify they pass, `npm run typecheck`, then commit**

```bash
git add packages/core/src/agents/local-providers/shared.ts packages/core/src/agents/local-providers/claude-code.ts packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs
git commit -m "feat(claude-code): read the OAuth expiry and store from the login record"
```

### Task 2: Coalesced refresh with cached result and peer-rotation adoption

**Files:**
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (new `resolveClaudeCodeAuth`, `refreshClaudeCodeAuth`, `ClaudeCodeRefreshAuthError`, `adoptPeerRotatedClaudeCodeAuth`, `claudeCodeTokenEndpoint`; module state `claudeCodeRefreshInFlight: Map<string, Promise<ClaudeCodeTokenSet>>`, `claudeCodeRefreshed: Map<string, { postedRefreshToken: string; auth: ClaudeCodeTokenSet; persisted: boolean }>`, `claudeCodeRejectedRefreshTokens: Set<string>`; the map key is `storeKey(store)`, `keychain:<service>\u0000<account>` or `file:<path>`)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`

**Interfaces:**
- Consumes: `ClaudeCodeTokenSet`, `claudeCodeAccessTokenExpired`, `readClaudeCodeOauth` (Task 1).
- Produces: `export async function resolveClaudeCodeAuth(): Promise<ClaudeCodeTokenSet | undefined>`; `export class ClaudeCodeRefreshAuthError extends Error { status: number; code?: string }`; `export function resetClaudeCodeAuthStateForTest(): void` clearing the three module maps. Task 3 adds the persistence call inside the refresh task; until then `persisted` stays false and the cached pair is served.

- [ ] **Step 1: Write the failing tests**

Model on `local-agent-provider-grok.test.mjs:81-120` and `:298-420`. Each test sets `process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT = "http://127.0.0.1/claude/oauth/token"`, stubs `globalThis.fetch`, restores both in `t.after`, and calls `resetClaudeCodeAuthStateForTest()` first.

```js
test("Claude Code local provider refreshes an expired access token with a JSON body", async (t) => {
  // keychain: accessToken "expired", refreshToken "r1", expiresAt Date.now() - 1, scopes ["user:inference", "user:profile"]
  // fetch stub asserts: URL is the override; headers["content-type"] is "application/json"; JSON.parse(body) deep-equals
  //   { client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e", grant_type: "refresh_token", refresh_token: "r1", scope: "user:inference user:profile" }
  // returns 200 { access_token: "fresh", refresh_token: "r2", expires_in: 3600, refresh_token_expires_in: 86400, scope: "user:inference" }
  const auth = await resolveClaudeCodeAuth();
  assert.equal(auth.accessToken, "fresh");
  assert.equal(auth.refreshToken, "r2");
  assert.ok(auth.expiresAt > Date.now() + 3_500_000);
  assert.ok(auth.refreshTokenExpiresAt > Date.now() + 86_000_000);
  assert.deepEqual(auth.scopes, ["user:inference"]);
});

test("Claude Code local provider keeps the refresh token, refresh expiry and scopes when the response omits them", async (t) => { /* response { access_token, expires_in } only; assert r1, old refreshTokenExpiresAt, old scopes kept */ });

test("Claude Code local provider serves the cached fresh pair instead of posting the consumed refresh token again", async (t) => {
  // first resolve refreshes (fetch 1); keychain still holds r1 (Task 3 not yet writing); second resolve
  assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
  assert.equal(fetchCalls, 1);
});

test("Claude Code local provider adopts a peer-rotated token on 400 invalid_grant", async (t) => {
  // fetch returns 400 { error: "invalid_grant" }; the stub rotates the fake keychain to refreshToken "r3", accessToken "peer", expiresAt future before responding
  assert.equal((await resolveClaudeCodeAuth()).accessToken, "peer");
});

test("Claude Code local provider surfaces a rejected refresh and does not post that token again", async (t) => {
  await assert.rejects(resolveClaudeCodeAuth(), (error) => error.name === "ClaudeCodeRefreshAuthError" && error.status === 401);
  await assert.rejects(resolveClaudeCodeAuth(), (error) => error.name === "ClaudeCodeRefreshAuthError");
  assert.equal(fetchCalls, 1);
});

test("Claude Code local provider coalesces concurrent refreshes", async (t) => { /* Promise.all of two resolves; fetchCalls 1 */ });

test("Claude Code local provider does not refresh a token that is still valid", async (t) => { /* fetch stub throws if called */ });

test("Claude Code local provider never refreshes an unrefreshable store", async (t) => {
  // accountless legacy keychain record, expired; fetch stub throws if called; resolve returns the expired set unchanged
});

test("the token endpoint override is honoured only for loopback hosts", () => {
  process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT = "https://evil.example/token";
  assert.equal(claudeCodeTokenEndpoint(), "https://platform.claude.com/v1/oauth/token");
});
```

- [ ] **Step 2: Run to verify they fail**

Expected: `not ok` for all nine (`resolveClaudeCodeAuth` not exported).

- [ ] **Step 3: Implement**

`resolveClaudeCodeAuth` reads the record; if `claudeCodeRefreshed` holds an entry whose `postedRefreshToken` equals the record's refresh token, it returns that entry's `auth` (and, after Task 3, retries persistence when `persisted` is false); if the record's refresh token is in `claudeCodeRejectedRefreshTokens` it throws the remembered error; if not expired, or the store is not refreshable, or there is no refresh token, it returns the record. Otherwise it coalesces on the store key and runs `refreshClaudeCodeAuth`, catching `ClaudeCodeRefreshAuthError` into `adoptPeerRotatedClaudeCodeAuth` (re-read; adopt when the refresh token differs and an access token exists; else add the posted token to the rejected set and rethrow). `refreshClaudeCodeAuth` posts the JSON body through `fetchWithSystemProxy` with an `AbortController` on the timeout; it maps the rejection statuses from Global Constraints to `ClaudeCodeRefreshAuthError`, builds the new set (`expiresAt = Date.now() + expires_in * 1000`; `refreshTokenExpiresAt` and `scopes` from the response when present, else carried over), stores it in `claudeCodeRefreshed` with `persisted: false`, and returns it. `claudeCodeTokenEndpoint()` returns the override only when `new URL(override).hostname` is a loopback name.

- [ ] **Step 4: Run to verify they pass, then commit**

```bash
git add packages/core/src/agents/local-providers/claude-code.ts packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs
git commit -m "feat(claude-code): refresh an expired OAuth token and adopt a peer rotation"
```

### Task 3: Persist the refreshed record with compare-and-swap

**Files:**
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (new `persistRefreshedClaudeCodeAuth(entry): "written" | "adopted" | "failed"`, called inside the refresh task after a successful refresh and again from `resolveClaudeCodeAuth` when a cached entry has `persisted: false`)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`

**Interfaces:**
- Consumes: `ClaudeCodeTokenStore`, the `claudeCodeRefreshed` entry shape (Task 2).
- Produces: after a successful write the entry is `persisted: true`; after an adoption the entry is replaced by the on-disk set; after a failure the entry stays and a warning is logged once per store key.

- [ ] **Step 1: Write the failing tests**

```js
test("refreshed Claude Code tokens are written to the keychain through security -i in Claude Code's own shape", async (t) => {
  // keychain record has mcpOAuth and claudeAiOauth with subscriptionType "max"; expired; refresh returns r2 + refresh_token_expires_in + scope
  await resolveClaudeCodeAuth();
  const [call] = keychain.calls;
  assert.deepEqual(call.argv, ["-i"]);
  assert.match(call.stdin, /^add-generic-password -U -a "[^"]+" -s "Claude Code-credentials" -X [0-9a-f]+\n$/);
  const written = keychain.read();
  assert.equal(written.claudeAiOauth.accessToken, "fresh");
  assert.equal(written.claudeAiOauth.refreshToken, "r2");
  assert.equal(written.claudeAiOauth.subscriptionType, "max");
  assert.ok(written.claudeAiOauth.refreshTokenExpiresAt > Date.now());
  assert.deepEqual(written.claudeAiOauth.scopes, ["user:inference"]);
  assert.deepEqual(written.mcpOAuth, originalRecord.mcpOAuth);
});

test("a keychain record over the stdin limit is written on argv", async (t) => { /* mcpOAuth padded past 4032 bytes; assert call.argv[0] === "add-generic-password" and call.stdin === "" */ });

test("refreshed Claude Code tokens are written to .credentials.json atomically with mode 0600", async (t) => { /* file store; assert parsed file, (statSync(file).mode & 0o777) === 0o600, and no leftover temp file in the directory */ });

test("a refreshed Claude Code token is not written over a pair a peer rotated meanwhile", async (t) => {
  // fetch stub rotates the fake keychain to refreshToken "r9", accessToken "peer" before responding with r2
  const auth = await resolveClaudeCodeAuth();
  assert.equal(auth.accessToken, "peer");
  assert.equal(keychain.calls.length, 0);
});

test("a failed keychain write keeps the fresh pair, retries only the write and warns once", async (t) => {
  // options.writeExitCode 51 for the first two writes; capture console.warn
  assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
  assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
  assert.equal(fetchCalls, 1);
  assert.equal(keychain.calls.length, 2);
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0], /fresh|r2|[0-9a-f]{40}/);
});
```

- [ ] **Step 2: Run to verify they fail**

Expected: `not ok` (no write happens; the peer test passes only by accident and must be checked after Step 3).

- [ ] **Step 3: Implement `persistRefreshedClaudeCodeAuth`**

Re-read the current record from the store. If its refresh token in `container` is neither the posted one nor empty, return `"adopted"` after replacing the cache entry with the on-disk set. Otherwise replace `accessToken`, `refreshToken`, `expiresAt`, and when the entry has them `refreshTokenExpiresAt` and `scopes`, inside the same container, and write: Keychain through `security -i` per Global Constraints with `stdio: ["pipe", "ignore", "ignore"]`, argv fallback above 4032 bytes; file through a temp file and `renameSync`. Catch everything, log the fixed message once per store key, return `"failed"`.

- [ ] **Step 4: Run to verify they pass, then commit**

```bash
git add packages/core/src/agents/local-providers/claude-code.ts packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs
git commit -m "feat(claude-code): persist refreshed OAuth tokens where the login lives"
```

### Task 4: Wire the resolver into every raw-token reader

**Files:**
- Modify: `packages/core/src/agents/local-providers/service.ts:16` (also re-export `resolveClaudeCodeAuth`, `claudeCodeAccessTokenExpired`)
- Modify: `packages/core/src/gateway/core-runtime/local-agent-auth-provider-hook.ts:151-172` (`authenticateClaudeCode` awaits `resolveClaudeCodeAuth().catch(() => readClaudeCodeOauth())` then falls back to `originalBearerToken`)
- Modify: `packages/core/src/providers/account-service.ts:1828-1836` (`localClaudeCodeAccountCredential` becomes async and uses the resolver; its caller at 1484 already awaits the Grok sibling)
- Modify: `packages/core/src/gateway/core-runtime/config-compiler.ts:587-600` (`withClaudeCodeOauthRuntimeDefaults` becomes async like `withGrokOauthRuntimeDefaults` at 616 and uses the resolver; update its caller)
- Modify: `packages/core/src/providers/probe.ts:982-986` (`localClaudeProbeToken` becomes async and uses the resolver; update its caller)
- Modify: `packages/core/src/agents/local-providers/claude-code.ts:84-128,143-166` (`claudeCodeCandidate` reports `locked` with detail `Claude Code access token is expired and the login has no refresh token. Run \`claude /login\`, then retry.` when `claudeCodeAccessTokenExpired` and no refresh token; `importClaudeCodeProvider` becomes async and uses the resolver)
- Modify: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs:31,53` (the two existing `importClaudeCodeProvider` calls gain `await`)
- Test: `packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs`, `packages/core/test/unit/providers/provider-account-service.test.mjs` (beside the Claude Code case at line 420), `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`

**Interfaces:**
- Consumes: `resolveClaudeCodeAuth`, `claudeCodeAccessTokenExpired`.

- [ ] **Step 1: Write the failing tests**

In the hook test, after "re-reads the on-disk access token on every request" (line 112):

```js
test("Claude Code local agent auth hook refreshes an expired token before authenticating", { skip: process.platform === "win32" }, async (t) => {
  // credentials file: accessToken "expired", refreshToken "r1", expiresAt past; fetch stub returns access_token "fresh", refresh_token "r2"
  const auth = await hook.authenticate({ upstreamRequest });
  assert.equal(auth.value.headers.authorization, "Bearer fresh");
  assert.equal(JSON.parse(readFileSync(credentialsFile, "utf8")).claudeAiOauth.refreshToken, "r2");
});
```

In the account-service test: a copy of the line-420 case with an expired Keychain record and a fetch stub, asserting the credential's `apiKey` is `"fresh"`. In the provider test: `await importClaudeCodeProvider(...)` with an expired record yields `auth.headers.authorization === "Bearer fresh"`; `claudeCodeCandidate` with an expired record and no refresh token is `locked` with the detail above; a record with a refresh token and no access token is `locked` with the existing "no usable access token" detail (the scan stays synchronous) but `resolveClaudeCodeAuth` refreshes it.

- [ ] **Step 2: Run to verify they fail**, then **Step 3: implement**, then **Step 4: run the four files, `npm run typecheck`, `npm run test:core`**

Expected: all pass; core suite count unchanged plus the new tests.

- [ ] **Step 5: Live check on a throwaway login, then commit and open the PR**

Never refresh a copy of the real refresh token: the server rotates it and the real Keychain item is left with a dead one. Instead:

1. `CLAUDE_CONFIG_DIR=$(mktemp -d) claude /login` with any claude.ai account you can spare, which stores the login under the Keychain service `Claude Code-credentials-<sha8>` (claude-code.ts:246-254).
2. Read only the expiry: `security find-generic-password -s "Claude Code-credentials-<sha8>" -w | jq .claudeAiOauth.expiresAt`. Set it to the past by writing the record back through the same `security -i` line the implementation uses (a one-off script in the scratchpad, not committed).
3. Run the built CLI with that config dir and LLMR's isolated home (`CLAUDE_CONFIG_DIR=<dir> LLMR_INTERNAL_HOME_DIR=$(mktemp -d) llmr serve`, real `HOME`, per the memory `isolated-llmr-run-leak`), import the Claude Code provider through the UI, send one `/v1/messages` through it.
4. Confirm a 200 in `<isolated home>/.llm-router/app-data/request-logs.sqlite` and a new `expiresAt` in the throwaway Keychain item (same `jq` line); confirm `CLAUDE_CONFIG_DIR=<dir> claude auth status` still reports the login.
5. Delete the throwaway item (`security delete-generic-password -s "Claude Code-credentials-<sha8>"`) and the config dir. Record the result in the PR.

```bash
git add -A packages/core/src packages/core/test
git commit -m "feat(claude-code): the imported provider refreshes its OAuth login"
git push -u origin HEAD && gh pr create --title "feat(claude-code): refresh the imported Claude Code OAuth login" --body "<spec Change 2 summary, test commands, live check result, the stated residual race with an interactive claude refreshing in the same minute>"
```

Docs: add to `docs/src/content/docs/en/configuration/providers.md`, in the Claude Code import section (line 12-23), one sentence: `LLMR refreshes the imported login's access token with its refresh token when it expires and writes the new tokens back to the Keychain or credentials file, so the login stays usable while Claude Code itself is routed through LLMR.`
