# Claude Code Token Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLMR's imported Claude Code provider refreshes an expired claude.ai access token with the refresh token, persists the rotated pair where it came from, and adopts a token the CLI rotated in the meantime, the way the Grok provider already does.

**Architecture:** Three additions in `claude-code.ts`: expiry on the parsed token set, a coalesced `resolveClaudeCodeAuth()` with refresh and peer-rotation adoption, and a persistence helper for the Keychain and the credentials file. The hook, the usage connector and the import call the resolver instead of the raw read. Tests drive the refresh endpoint through `globalThis.fetch` and an env override, the Keychain through the existing fake `security` shim in the test file.

**Tech Stack:** TypeScript under `packages/core`, `node:test` with `node:assert/strict`, `fetchWithSystemProxy` from `@llmr/core/proxy/system-proxy-fetch`.

**Spec:** `docs/superpowers/specs/2026-10-28-claude-app-opt-in-and-claude-code-token-refresh.md`, Change 2.

## Global Constraints

- Branch from `main` after PR 48 or its successor merges; independent of the takeover plan.
- Endpoint, verbatim: `https://platform.claude.com/v1/oauth/token`. Client id, verbatim: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`. Env override name, verbatim: `LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT`. Timeout env, verbatim: `LLMR_CLAUDE_CODE_OAUTH_REFRESH_TIMEOUT_MS`, default 15000.
- Expiry margin: `expiresAt <= Date.now() + 60_000`.
- Keychain write, verbatim shape: `security add-generic-password -U -a <account> -s <service> -X <hex of the JSON record>`, through `execFileSync`. Never `-w` with the JSON on the command line.
- Style per `AGENTS.md`. No comments except a non-obvious why; the partition reason for the write shape is one.
- One test file: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/local-agent-provider-claude-code.test.js` and `.../gateway/local-agent-auth-provider-hook.test.js`.

## Review Focus

- A Keychain record without `expiresAt` (older Claude Code) must be treated as not expired and never refreshed on its own (Task 1 test).
- A refresh that returns no `refresh_token` must keep the old one (Task 2 test).
- A refresh 401 while the Keychain already holds a newer refresh token (the CLI rotated it) must adopt the Keychain's pair and not fail the request (Task 2 test "adopts a peer-rotated token").
- Two concurrent requests with one expired token must make one refresh call (Task 2 test "coalesces").
- A persistence failure (Keychain write denied) must not lose the refreshed token for the current request and must be logged once; the next request retries the write (Task 3 test).

---

### Task 0: Verify the refresh request encoding

- [ ] **Step 1: Observe a real refresh**

With a Keychain record whose `expiresAt` is in the past and LLMR not running, run `claude auth status` under `CLAUDE_CODE_OAUTH_TOKEN` unset in a terminal while capturing with the proxy LLMR ships (`llmr serve` with proxy mode on, or `mitmproxy`), and read the request to `platform.claude.com/v1/oauth/token`: content type and body shape. Record the answer at the top of Task 2 as `Encoding: form` or `Encoding: json` with the exact field names. If capture is impractical, implement form encoding first (RFC 6749 §6) and treat an HTTP 400 with `unsupported_grant_type` or `invalid_request` in the Task 2 integration check as the signal to switch to JSON.

### Task 1: Expiry on the parsed token set

**Files:**
- Modify: `packages/core/src/agents/local-providers/shared.ts:11-17` (`OAuthTokenSet` gains `expiresAt?: number`), `:138-151` (`readOauthTokenSetFields` returns `expiresAt` from `expiresAt`, `expires_at` or `anthropicExpiresAt`, numbers only; a string ISO date is parsed with `Date.parse`)
- Modify: `packages/core/src/agents/local-providers/claude-code.ts:273-340` (carry `expiresAt` into the returned token set, both the Keychain and file paths)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`

**Interfaces:**
- Produces: `export function claudeCodeAccessTokenExpired(auth: Pick<OAuthTokenSet, "expiresAt">): boolean` in `claude-code.ts`.

- [ ] **Step 1: Write the failing tests**

```js
test("Claude Code local provider carries expiresAt from the keychain record", { skip: process.platform === "win32" }, async () => {
  // fake security returns {"claudeAiOauth":{"accessToken":"a","refreshToken":"r","expiresAt":1793249706961}}
  const oauth = readClaudeCodeOauth();
  assert.equal(oauth.expiresAt, 1793249706961);
});

test("claudeCodeAccessTokenExpired honors the 60 s margin and tolerates a missing expiresAt", () => {
  const now = Date.now();
  assert.equal(claudeCodeAccessTokenExpired({ expiresAt: now + 30_000 }), true);
  assert.equal(claudeCodeAccessTokenExpired({ expiresAt: now + 120_000 }), false);
  assert.equal(claudeCodeAccessTokenExpired({}), false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node build/test.mjs core && node --test --test-reporter=tap .test-dist/core/test/unit/agents/local-agent-provider-claude-code.test.js`
Expected: both `not ok` (`expiresAt` undefined; function not exported).

- [ ] **Step 3: Implement**

Add the field and parsing in `shared.ts`; in `claude-code.ts` spread `expiresAt` into the two return sites and add `claudeCodeAccessTokenExpired`.

- [ ] **Step 4: Run to verify they pass, then commit**

Run: the Step 2 command. Expected: all `ok`.

```bash
git add packages/core/src/agents/local-providers/shared.ts packages/core/src/agents/local-providers/claude-code.ts packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs
git commit -m "feat(claude-code): read the OAuth expiry from the login record"
```

### Task 2: Coalesced refresh with peer-rotation adoption

**Files:**
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (new `resolveClaudeCodeAuth`, `refreshClaudeCodeAuth`, `ClaudeCodeRefreshAuthError`, `adoptPeerRotatedClaudeCodeAuth`, a module-level `claudeCodeRefreshInFlight: Map<string, Promise<OAuthTokenSet>>`)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`

**Interfaces:**
- Consumes: `claudeCodeAccessTokenExpired`, `readClaudeCodeOauth` (Task 1).
- Produces: `export async function resolveClaudeCodeAuth(): Promise<OAuthTokenSet | undefined>`; `class ClaudeCodeRefreshAuthError extends Error { status: number }`. Task 3 adds the persistence call inside `refreshClaudeCodeAuth`; until then the refreshed set is returned without being written.

- [ ] **Step 1: Write the failing tests**

Model on `local-agent-provider-grok.test.mjs:81-120` and `:298-420`, with `process.env.LLMR_CLAUDE_CODE_OAUTH_TOKEN_ENDPOINT = "http://127.0.0.1/claude/oauth/token"` and a `globalThis.fetch` stub restored in `t.after`:

```js
test("Claude Code local provider refreshes an expired access token", async (t) => {
  // keychain: accessToken "expired", refreshToken "r1", expiresAt Date.now() - 1
  // fetch stub asserts URL and body carries grant_type=refresh_token, refresh_token=r1, client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e; returns { access_token: "fresh", refresh_token: "r2", expires_in: 3600 }
  const auth = await resolveClaudeCodeAuth();
  assert.equal(auth.accessToken, "fresh");
  assert.equal(auth.refreshToken, "r2");
  assert.ok(auth.expiresAt > Date.now() + 3_500_000);
});

test("Claude Code local provider keeps the refresh token when the response omits it", async (t) => { /* response without refresh_token; assert auth.refreshToken === "r1" */ });

test("Claude Code local provider adopts a peer-rotated token on refresh 401", async (t) => {
  // fetch returns 401; after the first read, the fake keychain record changes to refreshToken "r3", accessToken "peer", expiresAt future
  const auth = await resolveClaudeCodeAuth();
  assert.equal(auth.accessToken, "peer");
});

test("Claude Code local provider surfaces refresh 401 when nothing rotated on disk", async (t) => {
  await assert.rejects(resolveClaudeCodeAuth(), (error) => error.name === "ClaudeCodeRefreshAuthError" && error.status === 401);
});

test("Claude Code local provider coalesces concurrent refreshes", async (t) => {
  // count fetch calls; await Promise.all([resolveClaudeCodeAuth(), resolveClaudeCodeAuth()]); assert.equal(calls, 1)
});

test("Claude Code local provider does not refresh a token that is still valid", async (t) => { /* fetch stub throws if called; expiresAt far future; assert accessToken unchanged */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: the Task 1 Step 2 command. Expected: `not ok` for all six (`resolveClaudeCodeAuth` not exported).

- [ ] **Step 3: Implement**

`resolveClaudeCodeAuth` reads, returns early when not expired or no refresh token, else coalesces on `sourceFile` through `claudeCodeRefreshInFlight` and runs `refreshClaudeCodeAuth`, catching `ClaudeCodeRefreshAuthError` into `adoptPeerRotatedClaudeCodeAuth` (re-read; adopt when the refresh token differs and an access token exists; else rethrow). `refreshClaudeCodeAuth` posts to the endpoint (env override first) with the encoding from Task 0, an `AbortController` on the timeout env, through `fetchWithSystemProxy`; 401 and 403 become `ClaudeCodeRefreshAuthError`; `expiresAt` is `Date.now() + expires_in * 1000` when present, else the JWT `exp` claim if the token is a JWT, else undefined.

- [ ] **Step 4: Run to verify they pass, then commit**

```bash
git add packages/core/src/agents/local-providers/claude-code.ts packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs
git commit -m "feat(claude-code): refresh an expired OAuth token and adopt a peer rotation"
```

### Task 3: Persist the refreshed record

**Files:**
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (new `persistRefreshedClaudeCodeAuth(auth: OAuthTokenSet): void`, called at the end of `refreshClaudeCodeAuth` and after a successful adoption is not needed since the peer already wrote)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`

**Interfaces:**
- Consumes: `OAuthTokenSet.sourceFile` (`keychain:<service> (<account>)` or a file path) from Task 1.

- [ ] **Step 1: Write the failing tests**

```js
test("refreshed Claude Code tokens are written back to the keychain item in Claude Code's own shape", async (t) => {
  // fake security records add-generic-password argv; assert ["add-generic-password","-U","-a",account,"-s","Claude Code-credentials","-X",hex] where hex decodes to JSON whose claudeAiOauth has the new tokens and whose mcpOAuth key is preserved
});

test("refreshed Claude Code tokens are written back to .credentials.json with mode 0600", async (t) => { /* file source; assert parsed file and (statSync(file).mode & 0o777) === 0o600 */ });

test("a failed keychain write keeps the refreshed token for the request and retries next time", async (t) => {
  // fake security exits 51 on add-generic-password; first resolve returns "fresh"; second resolve (still expired on disk) refreshes again and writes again: assert fetch calls 2, write attempts 2
});
```

- [ ] **Step 2: Run to verify they fail**

Expected: `not ok` (no write happens).

- [ ] **Step 3: Implement `persistRefreshedClaudeCodeAuth`**

Keychain source: re-read the current record (so `mcpOAuth` and siblings survive), replace `claudeAiOauth.accessToken`, `refreshToken`, `expiresAt`, and write with the verbatim `security add-generic-password` shape; the why comment names the Keychain partition behaviour (an item keeps the partition of the tool that last wrote it, so the write must look like Claude Code's own). File source: same replacement, `writeFileSync` with `mode: 0o600` then `chmodSync`. Errors are caught, logged once per `sourceFile` through `console.warn`, and never thrown.

- [ ] **Step 4: Run to verify they pass, then commit**

```bash
git add packages/core/src/agents/local-providers/claude-code.ts packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs
git commit -m "feat(claude-code): persist refreshed OAuth tokens where the login lives"
```

### Task 4: Wire the resolver into the hook, the usage connector and the import

**Files:**
- Modify: `packages/core/src/gateway/core-runtime/local-agent-auth-provider-hook.ts:151-172` (`authenticateClaudeCode` awaits `resolveClaudeCodeAuth().catch(() => readClaudeCodeOauth())` then falls back to `originalBearerToken`)
- Modify: `packages/core/src/providers/account-service.ts:1828-1836` (`localClaudeCodeAccountCredential` uses the resolver; make it async if it is not)
- Modify: `packages/core/src/agents/local-providers/claude-code.ts:84-128,143-166` (`claudeCodeCandidate` reports `locked` with detail `Claude Code access token is expired and could not be refreshed. Run \`claude /login\`, then retry.` when `claudeCodeAccessTokenExpired` and no refresh token; `importClaudeCodeProvider` becomes async and uses the resolver)
- Modify: callers of `importClaudeCodeProvider` (find with `codegraph explore importClaudeCodeProvider`; they already await the Grok import so the shape exists)
- Test: `packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs`, `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`

**Interfaces:**
- Consumes: `resolveClaudeCodeAuth`, `claudeCodeAccessTokenExpired`.

- [ ] **Step 1: Write the failing tests**

In the hook test, after "re-reads the on-disk access token on every request" (`:112-160`), add:

```js
test("Claude Code local agent auth hook refreshes an expired token before authenticating", { skip: process.platform === "win32" }, async (t) => {
  // credentials file: accessToken "expired", refreshToken "r1", expiresAt past; fetch stub returns access_token "fresh"
  const auth = await hook.authenticate({ upstreamRequest });
  assert.equal(auth.value.headers.authorization, "Bearer fresh");
  assert.equal(JSON.parse(readFileSync(credentialsFile, "utf8")).claudeAiOauth.accessToken, "fresh");
});
```

In the provider test: `importClaudeCodeProvider` with an expired record yields `auth.headers.authorization === "Bearer fresh"`; `claudeCodeCandidate` with an expired record and no refresh token is `locked` with the detail above.

- [ ] **Step 2: Run to verify they fail**, then **Step 3: implement**, then **Step 4: run both files, `npm run typecheck`, `npm run test:core`**

Expected: all pass; core suite count unchanged plus the new tests.

- [ ] **Step 5: Live check against this Mac, then commit and open the PR**

With the real Keychain record and LLMR's isolated home (`LLMR_INTERNAL_HOME_DIR=$(mktemp -d)`, real `HOME`, per the memory `isolated-llmr-run-leak`), set `expiresAt` in a copy of the record to the past in a scratch Keychain service name is not possible without touching the real item, so instead run the built CLI `llmr serve` against the real item once its token is naturally within 60 s of expiry (`expiresAt` is visible with `security find-generic-password -s "Claude Code-credentials" -w`), send one `/v1/messages` through the imported provider, and confirm in `~/.llm-router/app-data/request-logs.sqlite` a 200 and in the Keychain a new `expiresAt`. Record the result in the PR.

```bash
git add -A packages/core/src packages/core/test
git commit -m "feat(claude-code): the imported provider refreshes its OAuth login"
git push -u origin HEAD && gh pr create --title "feat(claude-code): refresh the imported Claude Code OAuth login" --body "<spec Change 2 summary, test commands, live check result>"
```

Docs: add to `docs/src/content/docs/en/configuration/providers.md`, in the Claude Code import section, one sentence: `LLMR refreshes the imported login's access token with its refresh token when it expires and writes the new tokens back to the Keychain, so the login stays usable while Claude Code itself is routed through LLMR.`
