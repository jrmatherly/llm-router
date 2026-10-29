# Claude Code Token Refresh Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Claude Code OAuth refresh from PR 50 fail visibly instead of silently, harden the Keychain write, and fold its four-map state into one record per credential, as decided in the spec's "Change 2 revisions, 2026-10-29".

**Architecture:** Five tasks on top of PR 50's branch. Task 1 moves the fallback policy into one helper and lets the hook and the import surface a rejected refresh. Task 2 hardens `writeClaudeCodeStoreRecord` (timeout, sink validation, argv warning, re-armed failure warning). Task 3 is the small reader and `expires_in` cleanups. Task 4 is the behaviour-preserving state refactor with a concurrency test the old shape never had. Task 5 splits the test file. Tasks 1 to 3 are independent of Task 4 and land first so the refactor is reviewed on its own.

**Tech Stack:** TypeScript under `packages/core`, `node:test` with `node:assert/strict`, the stateful fake `security` script from `local-agent-provider-claude-code.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-28-claude-app-opt-in-and-claude-code-token-refresh.md`, Change 2 plus "Change 2 revisions, 2026-10-29".

## Global Constraints

- Branch from `claude/claude-code-token-refresh-0e5883` (PR 50, head 50f31b73) or from `main` once PR 50 merges; do not merge PR 50 as part of this plan.
- Fixed log text, verbatim: argv path `Claude Code login record exceeds the security -i stdin limit; written through argv, where ps can read it until the write returns (<store label>)`; write failure stays `Claude Code login could not be written back to <store label> (security exited <code>)`. Never the caught error text or any token in a log.
- Keychain write timeout: `execFileSync`'s `timeout` option, `LLMR_CLAUDE_CODE_KEYCHAIN_WRITE_TIMEOUT_MS` when it is a positive number, else `10_000` (the same shape as `LLMR_CLAUDE_CODE_OAUTH_REFRESH_TIMEOUT_MS`). A timeout is a failed write and takes the existing 60 s retry hold; its warning reason is `security timed out` (Node reports `error.code === "ETIMEDOUT"` with a null `status`, so the generic `security exited unknown` would be wrong).
- Sink validation: `claudeCodeKeychainAccountPattern` (already defined) for the account and `claudeCodeKeychainServicePattern` (already defined) for the service, asserted inside `writeClaudeCodeStoreRecord`; a miss throws a plain `Error` whose message carries neither value.
- Rejection surfaces as `ClaudeCodeRefreshAuthError` only; a transient failure (network, abort, 5xx, malformed body) is a plain `Error`. The hook's user-facing error is the `ClaudeCodeRefreshAuthError` message unchanged.
- `expires_in` absent in the refresh response: `expiresAt: undefined`.
- Style per `AGENTS.md`: double quotes, semicolons, alphabetized keys and type members, `type` aliases, no comments except a non-obvious why. The refactor (Task 4) keeps exactly the three existing why-comments (coalescing, compare-and-swap baseline, `security -i` shape) and adds none.
- One test file: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/<name>.test.js` (never `--scope`). Before each commit: `npm run typecheck`, `npm run test:core`; before the PR: `npm run test:architecture`.
- Commits end with the Co-Authored-By line the session is given; `/simplify` then `/code-review` on the diff before each commit, as the operator requires.

## Review Focus

- A refresh rejected with `invalid_grant` while the Keychain holds nothing newer: the gateway answers that request with an error naming `claude /login`, not with an upstream 401 (Task 1 hook test).
- Import of a login whose refresh is rejected: the import fails with that message instead of installing an expired bearer (Task 1 import test).
- A `security` write that never returns (Keychain prompt): the request completes with the cached pair once the timeout fires, the write counts as failed with the `timed out` reason, and the next request within 60 s does not spawn `security` again (Task 2 timeout test, fake sleeps past a 500 ms test timeout).
- A record over the stdin cutoff: exactly one argv warning per store, no token in it (Task 2 argv test).
- Two callers where one retry-persists the cached pair while the other's chained refresh is in flight: one POST, the store ends on the newest pair, no consumed token is posted twice (Task 4 interleaving test).

---

### Task 1: One fallback policy; the hook and the import surface a rejected refresh

**Files:**
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (`importClaudeCodeProvider` ~187; new export beside `resolveClaudeCodeAuth`)
- Modify: `packages/core/src/agents/local-providers/service.ts:16` (re-export the new helper)
- Modify: `packages/core/src/gateway/core-runtime/local-agent-auth-provider-hook.ts:151-173` (`authenticateClaudeCode`)
- Modify: `packages/core/src/providers/account-service.ts:1831`, `packages/core/src/gateway/core-runtime/config-compiler.ts:591`, `packages/core/src/providers/probe.ts:970` (use the helper)
- Test: `packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs`, `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`

**Interfaces:**
- Produces: `export async function resolveClaudeCodeAuthOrStored(): Promise<ClaudeCodeTokenSet | undefined>` in `claude-code.ts`: `resolveClaudeCodeAuth()` with every error (rejection included) replaced by `readClaudeCodeOauth()`. This is the one home of the stale-token policy; re-exported from `service.ts`.
- Consumes: `ClaudeCodeRefreshAuthError` (has `message`, `status`, `code`), `resolveClaudeCodeAuth`, `readClaudeCodeOauth`.
- The three stale-tolerant readers (usage connector at `account-service.ts:1831`, compiled defaults at `config-compiler.ts:591`, probe at `probe.ts:970`) call `resolveClaudeCodeAuthOrStored()` with no `.catch` of their own. The hook calls `resolveClaudeCodeAuth()` in a `try`: a caught `ClaudeCodeRefreshAuthError` returns `{ error: error.message, ok: false }`; any other error falls back to `readClaudeCodeOauth()` (transient failure, stale token still best). The import calls `resolveClaudeCodeAuth()` and lets every error propagate, as `importGrokProvider` does. After this task no `.catch(() => readClaudeCodeOauth())` remains outside the helper.

- [ ] **Step 1: Write the failing tests**

Hook test, beside "Claude Code local agent auth hook refreshes an expired token before authenticating":

```js
test("Claude Code local agent auth hook fails the request when the refresh token was rejected", { skip: process.platform === "win32" }, async (t) => {
  // credentials file: accessToken "expired", refreshToken "r1", expiresAt past; fetch stub returns 401 { error: "invalid_grant" }
  const result = await hook.authenticate({ upstreamRequest });
  assert.equal(result.ok, false);
  assert.match(result.error, /claude \/login/);
  assert.doesNotMatch(result.error, /r1|expired/);
});
```

Provider test, beside "importing Claude Code refreshes an expired access token first":

```js
test("importing Claude Code fails when the refresh token was rejected", { skip: process.platform === "win32" }, async (t) => {
  // keychain: expired access token, refreshToken "r1"; fetch stub returns 400 { error: "invalid_grant" }
  await assert.rejects(importClaudeCodeProvider(claudeCodeCandidate(), []), (error) => error.name === "ClaudeCodeRefreshAuthError");
});

test("resolveClaudeCodeAuthOrStored returns the stored pair after any refresh failure", { skip: process.platform === "win32" }, async (t) => {
  // first: fetch stub returns 503 -> resolves to the stored set (accessToken "expired")
  // then: resetClaudeCodeAuthStateForTest(); fetch stub returns 401 invalid_grant -> ALSO resolves to the stored set (catch-all), and
  // resolveClaudeCodeAuth() itself rejects with ClaudeCodeRefreshAuthError
});

test("Claude Code local agent auth hook keeps the stored token after a transient refresh failure", { skip: process.platform === "win32" }, async (t) => {
  // fetch stub returns 503 -> result.ok === true and authorization is "Bearer expired"
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/local-agent-auth-provider-hook.test.js .test-dist/core/test/unit/agents/local-agent-provider-claude-code.test.js`
Expected: `not ok` for the three (hook returns `ok: true` with the expired token; helper not exported).

- [ ] **Step 3: Implement**

`resolveClaudeCodeAuthOrStored` as in Interfaces. Replace the five `.catch(() => readClaudeCodeOauth())` sites as the Interfaces block assigns them. In `authenticateClaudeCode`, `try { auth = await resolveClaudeCodeAuth(); } catch (error) { if (error instanceof ClaudeCodeRefreshAuthError) return { error: error.message, ok: false }; auth = readClaudeCodeOauth(); }`.

- [ ] **Step 4: Run the two files, `npm run typecheck`, `npm run test:core`; commit**

```bash
git add packages/core/src packages/core/test
git commit -m "fix(claude-code): surface a rejected OAuth refresh instead of sending the dead token"
```

### Task 2: Harden the Keychain write

**Files:**
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (`writeClaudeCodeStoreRecord` ~424-451, `persistRefreshedClaudeCodeAuth` ~378-415, module state ~43)
- Modify: `docs/src/content/docs/en/configuration/providers.md:23`
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs` (fake keychain gains `options.writeDelayMs`)

**Interfaces:**
- Consumes: `withFakeKeychain(record, run, options)`. Extend the fake: the script reads an optional `write-failure` state file in its bin dir before every `add-generic-password` (contents: an exit code; present means fail with it, still recording the call), and `run` gains `setWriteFailure(exitCode | undefined)` that writes or removes that file, so a test can fail, succeed and fail again in one run (`options.writeExitCode`/`options.failWrites` keep working for the existing tests). Add `options.writeDelaySeconds` so the script runs `sleep <n>` before writing.
- Produces: `writeClaudeCodeStoreRecord` throws `new Error("Claude Code keychain item name is not safe to write.")` when the account or the service fails its pattern; passes `timeout` (per Global Constraints) to both `execFileSync` calls; `persistRefreshedClaudeCodeAuth`'s warning reason is `security timed out` when `error.code === "ETIMEDOUT"`; emits the argv warning once per store key through a module `Set` (`claudeCodeArgvWarned`), cleared by `resetClaudeCodeAuthStateForTest()`; `persistRefreshedClaudeCodeAuth` deletes the store key from `claudeCodeWriteBackWarned` on `"written"`.
- The comment above the `-i` line changes to one line: `security -i` keeps the record off argv until the 4032-byte stdin cutoff, past which Claude Code itself falls back to argv.

- [ ] **Step 1: Write the failing tests**

```js
test("a keychain record over the stdin limit warns once that it went through argv", { skip: process.platform === "win32" }, async (t) => {
  // mcpOAuth padded past 4032 bytes; capture console.warn; two resolves with the first write failing (writeExitCode) so a second write happens
  assert.equal(warnings.filter((line) => /security -i stdin limit/.test(line)).length, 1);
  assert.doesNotMatch(warnings.join("\n"), /fresh|r2|[0-9a-f]{40}/);
});

test("a keychain write that hangs is a failed write after the timeout", { skip: process.platform === "win32" }, async (t) => {
  // withEnv("LLMR_CLAUDE_CODE_KEYCHAIN_WRITE_TIMEOUT_MS", "500"); options.writeDelaySeconds 2 (the fake runs `sleep 2` before writing)
  const started = Date.now();
  assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");
  assert.ok(Date.now() - started >= 500 && Date.now() - started < 2_000);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\(security timed out\)$/);
  assert.equal(keychain.read().claudeAiOauth.refreshToken, "r1");
  assert.equal((await resolveClaudeCodeAuth()).accessToken, "fresh");   // within the 60 s hold: no second security write
  assert.equal(keychain.calls.length, 1);
});

test("the write-failure warning re-arms after a successful write", { skip: process.platform === "win32" }, async (t) => {
  // keychain.setWriteFailure(51) -> resolve -> one warning; setWriteFailure(undefined), mock Date.now past the hold -> resolve -> written;
  // keychain.write() a rotated pair (refreshToken "r5", expired access token), setWriteFailure(51) -> resolve -> second warning
  assert.equal(warnings.length, 2);
});

test("the keychain writer refuses an unsafe account or service name", { skip: process.platform === "win32" }, async () => {
  // writeClaudeCodeStoreRecord becomes an export for this test only; the fake keychain records nothing when it throws
  const store = { account: keychainAccount, container: "claudeAiOauth", kind: "keychain", refreshable: true, service: "Claude Code-credentials\"" };
  assert.throws(() => writeClaudeCodeStoreRecord(store, { claudeAiOauth: {} }), /not safe to write/);
  assert.throws(() => writeClaudeCodeStoreRecord({ ...store, account: "other user", service: "Claude Code-credentials" }, { claudeAiOauth: {} }), /not safe to write/);
  assert.equal(keychain.calls.length, 0);
});
```

`sleep` is on PATH on macOS and Linux, where the fake runs; the hang test costs about 2 s.

- [ ] **Step 2: Run to verify they fail**

Expected: `not ok` (no argv warning; the hang test exceeds its timeout because the write blocks; the warned set never re-arms).

- [ ] **Step 3: Implement** per Interfaces, plus the docs sentence appended to `providers.md:23`: `Logins whose Keychain record exceeds the 4032-byte security stdin limit are written through the command line, as Claude Code does; the record is visible to local processes for the duration of that write.`

- [ ] **Step 4: Run the file, `npm run typecheck`, `npm run test:core`; commit**

```bash
git add packages/core/src packages/core/test docs/src/content/docs/en/configuration/providers.md
git commit -m "fix(claude-code): time out, validate and announce the Keychain write"
```

### Task 3: Reader cleanups and the missing `expires_in` rule

**Files:**
- Modify: `packages/core/src/agents/local-providers/shared.ts:135-190` (drop `expires_at`/`refresh_token_expires_at` reads; delete `findOauthTokenSet`)
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (`refreshClaudeCodeAuth` ~359: `expiresAt: expiresIn === undefined ? undefined : Date.now() + expiresIn * 1000`)
- Modify: `packages/core/src/agents/local-providers/service.ts:16` (drop `claudeCodeAccessTokenExpired` from the re-export)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs`

**Interfaces:**
- `readOauthTokenSetFields` keeps its signature and return type; `findOauthTokenSet` is gone (verified: no caller but itself).

- [ ] **Step 1: Change the tests**

In "keeps the expiry, refresh token, refresh expiry and scopes when the response omits them" assert `auth.expiresAt === undefined` and that a following resolve does not POST again (`endpoint.calls === 1`). Add to the file-path store test a record with `expires_at: 1793249706961` and assert `oauth.expiresAt === undefined`.

- [ ] **Step 2: Run to verify they fail**, **Step 3: implement**, **Step 4: run the file, `npm run typecheck`, `npm run test:core`; commit**

```bash
git add packages/core/src packages/core/test
git commit -m "refactor(claude-code): read only the expiry fields Claude Code writes; unknown expires_in means not expired"
```

### Task 4: One state record per credential

**Files:**
- Modify: `packages/core/src/agents/local-providers/claude-code.ts` (module state ~39-45, `resolveClaudeCodeAuth` ~262-307, `adoptPeerRotatedClaudeCodeAuth` ~310-321, `refreshClaudeCodeAuth` ~323-366, `persistRefreshedClaudeCodeAuth` ~378-415, `resetClaudeCodeAuthStateForTest` ~250)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs` (one new test; every existing test unchanged and green)

**Interfaces (the sketch; implement against it, report any deviation):**

```ts
type ClaudeCodeCachedPair = { auth: ClaudeCodeTokenSet; persisted: boolean; retryWriteAfter?: number; storeBaseline: string };
type ClaudeCodeCredentialState = {
  cached?: ClaudeCodeCachedPair;
  inFlight?: Promise<ClaudeCodeTokenSet>;
  rejected?: { code?: string; status: number; token: string };
  warnedArgv: boolean;
  warnedWriteFailure: boolean;
};
const claudeCodeCredentials = new Map<string, ClaudeCodeCredentialState>();   // keyed by storeKey(store)
function credentialState(store: ClaudeCodeTokenStore): ClaudeCodeCredentialState;   // get-or-create

export async function resolveClaudeCodeAuth(): Promise<ClaudeCodeTokenSet | undefined>;   // unchanged signature
async function postClaudeCodeRefresh(auth: ClaudeCodeTokenSet, refreshToken: string): Promise<ClaudeCodeTokenSet>;   // pure POST; no map access; throws ClaudeCodeRefreshAuthError or Error
function persistClaudeCodePair(state: ClaudeCodeCredentialState, pair: ClaudeCodeCachedPair): ClaudeCodeCachedPair;   // the only writer of `state.cached`; returns the entry now cached (written pair, or the adopted on-disk pair); on failure sets retryWriteAfter and returns `pair` unchanged with persisted false
function adoptPeerRotatedClaudeCodeAuth(state: ClaudeCodeCredentialState, stored: ClaudeCodeTokenSet, postedRefreshToken: string, error: unknown): ClaudeCodeTokenSet;   // records state.rejected
```

Resolver order (same as today, with the baseline read at creation time instead of patched after): read store → `state = credentialState(auth.store)` → `current` is `state.cached.auth` when `state.cached.storeBaseline === auth.refreshToken`, else `auth` → if `current` is the cached pair, not persisted and past its hold, `state.cached = persistClaudeCodePair(state, state.cached)` and recompute `current` → return `current` unless expired and refreshable → rejected check: `state.rejected?.token === refreshToken` throws the remembered `ClaudeCodeRefreshAuthError` → coalesce on `state.inFlight` → inside: `const pair = await postClaudeCodeRefresh(current, refreshToken)`, then `const baseline = state.cached?.auth === current ? state.cached.storeBaseline : auth.refreshToken` (read after the await, so a write that landed meanwhile moves it), then `state.cached = persistClaudeCodePair(state, { auth: pair, persisted: false, storeBaseline: baseline })`, return `state.cached.auth`.

`resetClaudeCodeAuthStateForTest()` clears `claudeCodeCredentials`. `claudeCodeRefreshInFlight`, `claudeCodeRefreshed`, `claudeCodeRejectedRefreshTokens`, `claudeCodeWriteBackWarned`, `claudeCodeArgvWarned` are deleted.

- [ ] **Step 1: Write the one new failing test**

```js
test("a retry-persist by one caller during another caller's chained refresh converges on the newest pair", { skip: process.platform === "win32" }, async (t) => {
  // keychain r1 expired; failWrites 1; fetch stub: first call returns expires_in 0 + r2 (so the cached pair is expired at once);
  // second call (posting r2) awaits a deferred promise. Sequence: A = resolveClaudeCodeAuth() (refresh r1 -> r2, write fails, cached unpersisted);
  // B = resolveClaudeCodeAuth() -> retry-persist (write succeeds now), then joins A's chained in-flight refresh of r2; release the deferred with r3.
  // Assert: posted tokens exactly ["r1", "r2"]; keychain.read().claudeAiOauth.refreshToken === "r3"; both A and B resolve to accessToken "fresher".
});
```

- [ ] **Step 2: Run to verify it fails or passes on the old shape, and record which** (the old shape is believed to pass it through the in-place mutation; the test is the regression guard for the refactor either way)

- [ ] **Step 3: Implement the sketch.** Deviations from the sketch go in the report with the reason.

- [ ] **Step 4: Run the file (all existing refresh tests must pass unchanged), `npm run typecheck`, `npm run test:core`; commit**

```bash
git add packages/core/src/agents/local-providers/claude-code.ts packages/core/test
git commit -m "refactor(claude-code): one state record per credential"
```

### Task 5: Split the provider test file

**Files:**
- Create: `packages/core/test/support/claude-code-keychain.mjs` (move `withFakeKeychain`, `withFakeSecurityScript`, `withFakeSecurityOutput`, `withFakeSecurityFailure`, `withFakeSecurityKeychain`, `fakeSecurityBody`, `keychainAccount`, `withClaudeCodeHome`, `withPlatform`, `withEnv`, `writeClaudeCredentials`, `restoreEnv`, `stubTokenEndpoint`, `jsonResponse`, `withKeychainLogin`; export each)
- Create: `packages/core/test/unit/agents/local-agent-provider-claude-code-refresh.test.mjs` (the three fake-keychain self-tests, the refresh tests, the persistence tests, the Task 1 to 4 tests of this plan, `claudeCodeAccessTokenExpired` and the endpoint-override test)
- Modify: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs` (keeps the scan, store, candidate and import tests; imports helpers from the support module)

**Interfaces:**
- Consumes: `packages/core/test/support/desktop-runtime.mjs` as the precedent (imported by relative path, e.g. `../../support/desktop-runtime.mjs` in `test/unit/config/plugin-config-migration.test.mjs`, and bundled into each test by esbuild); import the new module the same way.

- [ ] **Step 1: Move; no test body changes.** **Step 2: Run both files and `npm run test:core`; the total test count equals the count before the move.** **Step 3: Commit**

```bash
git add packages/core/test
git commit -m "test(claude-code): split the refresh and keychain tests from the provider scan tests"
```

Then push and open the PR: title `fix(claude-code): review fixes for the imported login refresh`, body with the spec's "Change 2 revisions" summary, the test commands, and a note that the live check from PR 50 covers the unchanged refresh and write path while Task 1 and Task 2 add behaviour the throwaway login did not exercise (rejection surfacing, argv warning, write timeout); say whether a second throwaway run was done.
