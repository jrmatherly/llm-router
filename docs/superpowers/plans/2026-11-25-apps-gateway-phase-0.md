# Claude Apps Gateway Management, Phase 0 Implementation Plan

> **Status, 2026-11-25: written, audited once on another model with its three blockers and nine corrections applied, not built.** No task here is built and none is merged. Building each PR needs the owner's word, as does each merge.

> **Delivery.** [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md) lists Tasks 1 to 4 as its batch 17 and Task 5 as the last commit of its batch 16. "Where this fits" below repeats that. Where that file and this one disagree on order or branch, that file is right.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who signs LLM Router in to a Claude apps gateway can sign out again from the same panel, the gateway's token is not left in the config database, the local harness cannot touch that person's own Claude files, and a request a gateway forwards is recorded under the developer's id and e-mail in fields of their own. A method the web interface calls can no longer be missing on the server without a test saying so.

**Architecture:** One PR of its own and one commit in another plan's PR. PR A is four commits that need nothing else built: a test that ties the web bridge's method names to the server's handlers, sign-out end to end, a placeholder where the import wrote a token, and a harness that gives the gateway its own directory and cleans up. Task 5 is the last commit of the client label plan's PR, batch 16 of the delivery order, agreed with the session that owns that order on 2026-11-25: it adds the forwarded user id and e-mail to usage rows and request-log rows, and takes the e-mail back out of the client label.

**Tech Stack:** TypeScript, `better-sqlite3`, Electron 45, React, `node:test` with `node:assert/strict`.

**Spec:** [`docs/superpowers/specs/2026-11-24-claude-apps-gateway-management.md`](../specs/2026-11-24-claude-apps-gateway-management.md). Gap ids G-3, G-5, G-6, G-13 to G-16 come from it. Read "Owner's decisions" (D-1 to D-6), "Decisions on the researched questions" and "Identity from a gateway that forwards to LLMR" before you start. This plan is the spec's phase 0.

**Evidence status.** The plan author read every file and symbol named below at `main` between `25e1828c` and `dfd71f1d` on 2026-11-24 and 2026-11-25. Three things were run. The test of Task 1 ran as written against `main` and passed, and failed as it should when one handler was removed from a copy of the server file. The local harness ran six times on Claude Code 2.1.332 with a scratch `HOME` and `CLAUDE_CONFIG_DIR`, an environment of five names, and booted every time. In those runs the gateway wrote `.claude.json` and `backups/` into `CLAUDE_CONFIG_DIR`. Nothing else in this plan was run. The facts of Task 5 come from a survey agent's reading, kept in the author's notes and not in the repo, and Task 5 says which of them to read again.

## Decisions this plan rests on

**From the spec, all accepted by the owner on 2026-11-24.** The fork has no consumers, so `client` changes meaning with no compatibility path. An API key carries a mark that lets it forward identity. The usage and request-log rows gain a forwarded user id and e-mail apart from `client`.

**From the delivery order, decision 7 under "The owner's decisions", 2026-11-25.** Batch 16 builds client label Tasks 3, 1 and 2 and then Task 5 of this plan, in one PR. The client label plan ([`2026-11-22-backlog-client-label.md`](2026-11-22-backlog-client-label.md), batch 16) already builds the per-key mark, as `trustedForwarder`, and the rule that only a marked key's identity headers count. That is the spec's G-5. This plan does not build G-5. It adds G-6 on top as the last commit of the same branch, so the two are reviewed and merged together. If the owner picks another answer to that item, Task 5 is rewritten and Tasks 1 to 4 do not change.

**Plan author, changeable in review without reopening the plan:**

- G-16 is closed with a test and not with a type. The client API's type is `Window["llmr"]` in `packages/ui/src/types/electron.d.ts`, and core may not import from the UI package (`tests/architecture/package-boundaries.test.mjs`). Typing `rpcHandlers` against it would mean moving a type of about 80 members into core. The test gives the same guarantee.
- Sign-out names a gateway by the candidate id the scan already returns, `claude-apps-gateway:<slug>`. The candidate carries no gateway URL, and the import finds its session the same way.
- The placeholder written at import is `localAgentProviderApiKey`, the marker the config already holds for every local-agent provider.
- The new fields are `forwardedUserId` and `forwardedUserEmail`, in columns `forwarded_user_id` and `forwarded_user_email`.
- The id comes from `x-claude-gateway-user-id` and the e-mail from `x-claude-gateway-user-email`. `x-litellm-end-user-id` fills neither until Task 5 Step 1 shows what the gateway puts in it.
- The harness stops its containers and deletes its rendered files when the gateway exits. `--keep` leaves them.

## Global Constraints

- The fork has no consumers. No compatibility path and no migration of old rows.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json`. No test and no check in this plan starts `claude` with the real home.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`. Tests under `tests/architecture/` are `*.test.mjs`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. For `tests/architecture/`: `node build/test.mjs architecture && node --test .test-dist/architecture/test/<name>.test.js`. Never pass `--scope`.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads.
- Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and the package suites the task touches.
- No test needs Docker, the `claude` binary or the network. A fake gateway listens on `127.0.0.1:0`, as the existing tests do.
- No new test, script or doc names a real host or holds a real key. Test keys and tokens are made-up strings.
- English only.
- Merging needs the owner's word, once per PR.
- The repository is public. Describe a change by what the code does.

## Review Focus

Each line is a condition no task's first test covers. The test that pins it is in the step named at the end.

1. A handler written as a shorthand property (`getPluginMarketplace,`) must count as present. Task 1, Step 1, the second test.
2. A sign-out that arrives while a token refresh is in flight. The refresh must not write the session file back. Task 2, Step 1, the test of the refresh in flight.
3. A refreshed session that could not be saved is kept in memory. Sign-out must drop it too. Task 2, Step 1, the test of the unsaved refresh.
4. A provider imported before sign-out. Its next request and its next Check Connection must fail with the message to sign in again, and neither may send a stored token. Task 3, Step 1, the probe test. The runtime hook's half is already pinned in `local-agent-auth-provider-hook.test.mjs`.
7. A gateway that is already imported. Its row must stay in the import panel, or there is nothing to sign out of. Task 2, Step 1, the test of the rows.
5. The harness's Docker call needs the caller's own environment, and the gateway's must not get it. Task 4, Step 1.
6. A marked key that sends no identity headers. Both new fields stay empty and the label is the tool or the key. Task 5, Step 3.

## Where this fits

| PR | Branch | Tasks | Meets these delivery batches | Build it |
|---|---|---|---|---|
| A, batch 17 | `fix/apps-gateway-phase-0` | 1, 2, 3, 4 | Batch 2 edits `providers.tsx`. Batch 8 edits `ipc.ts` and `management-server.ts`. Batches 8, 14 and 16 edit `contracts/app.ts`. Task 2 adds lines to all four | After batch 2. Before or after batch 8, with a rebase by whichever is second. The edits are additions and do not overlap by line |
| Batch 16 | `fix/client-label-and-forwarded-identity` | Client label 3, 1, 2, then Task 5 of this plan, one commit each | Task 5 replaces the label row and the guide sentences that client label Task 2 writes, and edits the same files. Batch 12 edits `network-logs.tsx`. Batches 13a to 15 add columns to `usage/store.ts` and `request-log-store.ts` | After batches 11, 12 and 17, and not open beside batches 13a to 15. It follows 17 because Task 5's two harness runs need the harness of Task 4. One branch means no released state in which the e-mail sits in `client` for a marked key |

## Not in this plan

- **The mark on an API key, and the rule that only a marked key's identity headers count (G-5).** Batch 16 builds both.
- **The guide's lines on what LLM Router records (G-14).** Batch 16 rewrites those sentences in its Task 2, and Task 5 here changes them again. PR A leaves them alone so the two do not collide. The fault to fix when they are next written: the guide says the e-mail is kept 7 days and only with request logs on, and usage events keep it 90 days either way (`usage/store.ts`, `usageEventRetentionMs`).
- **A page, a status view or a people view.** Phases 1 to 3.
- **A stale token in a config saved before Task 3.** It stays until that provider is imported again. There are no consumers to clean up for.
- **Sign-out across processes.** The runtime hook runs in the gateway child, so the child is the usual refresher, and Task 2's wait covers only the main process: the import, the probe and the model refresh. If the child is refreshing the same session at the instant of a sign-out it can write the file back, and a refreshed pair the child could not save stays in its memory until it restarts. Both windows are narrow. Task 2 states them in a comment and in the guide.

---

### Task 1: A method the web bridge calls has a handler on the server (G-16)

Today `rpcHandlers` in `packages/core/src/web/management-server.ts` is a `Record<string, RpcHandler>`. The web bridge in `packages/ui/src/web-client-bridge.ts` calls methods by name, and a name with no handler is a 404 at run time under `llmr serve` and in Docker, where the desktop app would have worked. Every later phase adds methods. After this task a missing handler fails `npm run test:architecture`.

**Evidence.** Ran, 2026-11-25, on `main`: the bridge calls 69 method names and each has a handler. The test below passed. With `getPluginMarketplace,` deleted from a copy of the server file, the same reader reported `getPluginMarketplace` as missing.

**Files:**
- Create: `tests/architecture/web-rpc-contract.test.mjs`
- Modify: `packages/ui/src/pages/home/shared/options.ts`, `packages/ui/src/pages/home/shared/i18n.tsx`

- [ ] **Step 1: Write the test.** It passes on `main`. It is a guard, so there is no failing run first. Prove it by the mutation in Step 2.

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bridgeFile = "packages/ui/src/web-client-bridge.ts";
const serverFile = "packages/core/src/web/management-server.ts";

function bridgeRpcNames(source) {
  return [...new Set([...source.matchAll(/\brpc\("([A-Za-z0-9_]+)"/g)].map((match) => match[1]))].sort();
}

function serverRpcHandlerNames(source) {
  const start = source.indexOf("const rpcHandlers: Record<string, RpcHandler> = {");
  assert.notEqual(start, -1, `${serverFile} no longer declares rpcHandlers the way this test reads it`);
  const end = source.indexOf("\n};", start);
  assert.notEqual(end, -1, "rpcHandlers has no closing line");
  return [...source.slice(start, end).matchAll(/^  ([A-Za-z0-9_]+)(?::|,$)/gm)].map((match) => match[1]).sort();
}

test("every method the web bridge calls has a handler on the management server", () => {
  const called = bridgeRpcNames(readFileSync(bridgeFile, "utf8"));
  const handled = new Set(serverRpcHandlerNames(readFileSync(serverFile, "utf8")));
  assert.ok(called.length > 50, `read only ${called.length} method names from ${bridgeFile}`);
  assert.deepEqual(called.filter((name) => !handled.has(name)), []);
});

test("the reader sees a handler written as a shorthand property, and misses one that is absent", () => {
  const source = "const rpcHandlers: Record<string, RpcHandler> = {\n  alpha: async () => 1,\n  beta,\n  gamma: () => {\n    return { nested: 1 };\n  }\n};\nconst other = {\n  delta: 1\n};\n";
  assert.deepEqual(serverRpcHandlerNames(source), ["alpha", "beta", "gamma"]);
  assert.deepEqual(bridgeRpcNames('rpc("alpha"); rpc("alpha", [x]); rpc("delta")'), ["alpha", "delta"]);
});
```

- [ ] **Step 2: Run it, then prove it.**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/web-rpc-contract.test.js`
Expected: 2 pass.
Then delete the line `  getPluginMarketplace,` from `management-server.ts`, run again, and see the first test fail naming `getPluginMarketplace`. Restore the line with `git checkout -- packages/core/src/web/management-server.ts`.

- [ ] **Step 3: Declare the view ids once.** `ViewId`, `NavigationId` and `OnboardingStepId` are exported from `shared/types.ts`. `shared/options.ts` declares all three again as private types, and `shared/i18n.tsx` declares `NavigationId` again as the same union. Delete the copies. In `options.ts` write `import type { NavigationId, OnboardingStepId } from "./types";` after the imports from `@llmr/core/contracts/app`. Do not import `ViewId` there: `options.ts` used it only to define `NavigationId`, and an unused import fails `npm run lint`, which treats warnings as errors (the audit ran Biome on a copy and saw `noUnusedImports`). In `i18n.tsx` write `import type { NavigationId } from "./types";`. `types.ts` already imports a type from `options.ts`. Both imports are type-only, so the cycle costs nothing at run time, and the audit saw no lint rule object to it. The edit was not compiled. `npm run typecheck` is the check.

- [ ] **Step 4: Verify.**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:ui`
Expected: all pass.

- [ ] **Step 5: Commit.** Subject: `test(web): fail when the web bridge calls a method the server does not handle`

---

### Task 2: Sign out of a Claude apps gateway from the panel that signs in (G-3)

Today the only way to sign out is to delete a file by hand, and the guide says so. `removeClaudeAppsGatewaySession` exists and nothing in the product calls it. After this task a signed-in gateway in the "Import local agent provider" panel has a Sign out button. A provider imported from that gateway then fails with the message to sign in again, which the runtime hook already gives when the session file is gone (`local-agent-auth-provider-hook.ts`, `authenticateClaudeAppsGateway`).

**Files:**
- Modify: `packages/core/src/agents/claude-apps-gateway/session-store.ts` (`removeClaudeAppsGatewaySession`)
- Modify: `packages/core/src/agents/local-providers/claude-apps-gateway.ts`
- Modify: `packages/core/src/contracts/app.ts`, `packages/core/src/contracts/ipc-channels.ts`
- Modify: `packages/electron/src/main/ipc.ts`, `packages/electron/src/main/preload.ts`
- Modify: `packages/ui/src/types/electron.d.ts`, `packages/ui/src/web-client-bridge.ts`, `packages/core/src/web/management-server.ts`
- Modify: `packages/ui/src/pages/home/components/providers.tsx` (the scan's filter and the candidate row of the import panel)
- Modify: `docs/src/content/docs/en/guides/claude-apps-gateway.md` (the one paragraph that begins "To sign out")
- Test: `packages/core/test/unit/agents/claude-apps-gateway-session-store.test.mjs`, `packages/core/test/unit/agents/local-agent-provider-claude-apps-gateway.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs`, `packages/ui/test/integration/providers.test.ts`

**Interfaces:**
- Changes, `removeClaudeAppsGatewaySession(gatewayUrl: string, configDir?: string): Promise<void>`. It was synchronous. Both maps are keyed by the session's file path. The function waits for every refresh of that session in flight in this process, as `while (refreshInFlight.has(key)) await refreshInFlight.get(key)?.catch(() => undefined);`, then deletes the file, then deletes the key from `unsavedRefreshes`. The loop and not a single await, because a refresh that failed can be followed at once by a new one. One comment gives the why: a refresh that finishes after the delete would write the session back. The same comment states the limit under "Not in this plan".
- Produces in `local-providers/claude-apps-gateway.ts`: `signOutClaudeAppsGateway(request: ClaudeAppsGatewaySignOutRequest, configDir?: string): Promise<ClaudeAppsGatewaySignOutResult>`. It finds the stored session whose `claudeAppsGatewayCandidateId` equals `request.candidateId`, as `importClaudeAppsGatewayProvider` does. With none it returns `{ signedOut: false }`. Otherwise it removes the session and returns `{ signedOut: true }`.
- Produces in `contracts/app.ts`, beside the login types:

  ```ts
  export type ClaudeAppsGatewaySignOutRequest = {
    candidateId: string;
  };

  export type ClaudeAppsGatewaySignOutResult = {
    signedOut: boolean;
  };
  ```

- Produces in `providers.tsx`, exported beside `localAgentProviderAlreadyImported`: `localAgentProviderCandidateRows(items: LocalAgentProviderCandidate[], providers: GatewayProviderConfig[], providerPlugins: unknown[]): Array<{ candidate: LocalAgentProviderCandidate; imported: boolean }>`. It drops a candidate whose `status` is `"missing"`. It drops a candidate that is already imported, as the scan's filter does today, unless its `kind` is `"claude-apps-gateway"`, which it keeps with `imported: true`. Today the filter drops an imported gateway's row, so the button would be missing in the one case it is for.
- Produces the channel `appClaudeAppsGatewaySignOut: "llmr:app:claude-apps-gateway-sign-out"` and the method `signOutClaudeAppsGateway` in each of: the Electron handler, the preload object, the `Window["llmr"]` type, the web bridge and `rpcHandlers`. Task 1's test fails if the last one is forgotten.

- [ ] **Step 1: Write the failing tests.**

In `claude-apps-gateway-session-store.test.mjs`, which already has a fake gateway and a temporary config directory, change the existing test "sessions persist with mode 0600 and list per host" from `(t) =>` to `async (t) =>`, await its call `removeClaudeAppsGatewaySession("https://a.example.com:8443", configDir);`, and add after it one assertion that `resolveClaudeAppsGatewaySession` for that address resolves to `undefined`. Then add two tests.

1. `sign-out waits for a refresh in flight, so the refresh cannot write the session back`. Persist an expired session with a refresh token. Have the fake gateway hold the `/oauth/token` reply until released. Start `resolveClaudeAppsGatewaySession` and do not await it. Start the removal and do not await it. Release the reply. Await both. Assert the file does not exist.
2. `sign-out drops a refreshed session that could not be saved`. Follow the existing test "a refresh that cannot be saved is kept in memory" up to the point where the refreshed pair is held in memory, then make the directory writable again, await the removal, and assert a resolve finds no session.

In `local-agent-provider-claude-apps-gateway.test.mjs` add `sign-out by candidate id removes that gateway's session and leaves another gateway's`. Persist sessions for two hosts, sign out of the first by its candidate id, assert `{ signedOut: true }`, assert `claudeAppsGatewayCandidates` lists only the second, and assert a second sign-out of the first returns `{ signedOut: false }`.

In `packages/ui/test/integration/providers.test.ts` add `an imported Claude apps gateway keeps its row, and an imported agent of another kind does not`. Build two candidates, one of kind `"claude-apps-gateway"` and one of kind `"codex"`, with providers and plugins that make `localAgentProviderAlreadyImported` true for both, and a third candidate with `status: "missing"`. Assert `localAgentProviderCandidateRows` returns one row, the gateway's, with `imported: true`. Read how that file's existing tests build an imported provider before you write the fixtures.

In `web-management-server.test.mjs`, in the test "web RPC routes the Claude apps gateway login triplet", add one call: `rpc(runtime.url, authToken, "signOutClaudeAppsGateway", [{ candidateId: "claude-apps-gateway:nope" }])` and assert its value is `{ signedOut: false }`.

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-apps-gateway-session-store.test.js .test-dist/core/test/unit/agents/local-agent-provider-claude-apps-gateway.test.js .test-dist/core/test/unit/web/web-management-server.test.js`
Expected: the build fails on the missing export `signOutClaudeAppsGateway`. Not run. Check the build's exit code before you read a test result, because a failed build leaves the last `.test-dist` in place.

- [ ] **Step 3: Implement core** as Interfaces says: the store, the function, the two types, the channel, and the `rpcHandlers` entry `signOutClaudeAppsGateway: (request) => signOutClaudeAppsGateway(request as ClaudeAppsGatewaySignOutRequest)`.

- [ ] **Step 4: Wire the desktop app and the bridge.** Add the handler in `ipc.ts` after the login cancel handler, the preload entry, the line in `electron.d.ts`, and the bridge entry `signOutClaudeAppsGateway: (request) => rpc("signOutClaudeAppsGateway", [request]) as ReturnType<LlmrApi["signOutClaudeAppsGateway"]>`. Keep each list in its file's order, which is alphabetical.

- [ ] **Step 5: Keep the row and add the button.** In `providers.tsx`, the scan's `setCandidates(items.filter(...))` becomes a call to `localAgentProviderCandidateRows`, and the panel's state holds its rows. A row with `imported: true` shows its Import button disabled with the text `Imported`. A candidate whose `kind` is `"claude-apps-gateway"` gets a second button before Import: `Sign out`, `variant="outline"`, `size` and classes as the Import button, disabled while an import or a sign-out runs. Its handler calls `window.llmr.signOutClaudeAppsGateway({ candidateId: candidate.id })`, then runs the scan again the way the sign-in form's `onConfirmed` does, and puts a failure in the panel's existing `error` state. Under the candidate's detail line add one sentence for that kind: `Signing out stops every provider imported from this gateway until you sign in again.`

- [ ] **Step 6: Change the guide.** Replace the paragraph that begins "To sign out, delete the session file" with: `To sign out, open **Providers → Add → Import local agent provider** and choose **Sign out** on the gateway's row. A provider imported from that gateway then fails with a message to sign in again. The gateway offers no revocation endpoint, so sign-out is local: it deletes the stored session, and the gateway's own session ends when its token expires. A request already in flight can finish, and the gateway process LLM Router runs may keep a token it holds in memory until it restarts.`

- [ ] **Step 7: Verify.**

Run: the command of Step 2. Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron`
Expected: all pass. The button has no component test: the panel is inside the provider dialog and renders only after a scan. `npm run typecheck` covers its wiring, and the proof in Task 4 Step 6 covers its effect.

- [ ] **Step 8: Commit.** Subject: `feat(providers): sign out of a Claude apps gateway from the import panel`

---

### Task 3: The import writes no gateway token into the config (G-13)

Today `importClaudeAppsGatewayProvider` passes the session's access token to `bearerAuthPlugin`, twice, and the result is saved in `providerPlugins` in `config.sqlite`. The runtime hook never reads it: it takes the token from the session file on every request and fails when the file is gone. The provider probe does read it. `providerProbeAuthRequest` in `probe.ts` applies the plugin's saved `auth.headers` first and replaces `authorization` only when a session resolves. So after a sign-out, Check Connection and the model refresh send the saved token to the gateway (read by the audit, and re-read by the author). After this task the import writes the marker `localAgentProviderApiKey` in its place, and a probe of a signed-out gateway fails with the message to sign in again and sends nothing.

**Files:**
- Modify: `packages/core/src/agents/local-providers/claude-apps-gateway.ts` (the two `bearerAuthPlugin` calls in `importClaudeAppsGatewayProvider`)
- Modify: `packages/core/src/providers/probe.ts` (`providerProbeAuthRequest`, the block that follows `localClaudeAppsGatewayProbeUrl`)
- Test: `packages/core/test/unit/agents/local-agent-provider-claude-apps-gateway.test.mjs`, `packages/core/test/unit/providers/provider-probe.test.mjs`

**Interfaces:**
- Changes, both calls pass `localAgentProviderApiKey` (imported from `@llmr/core/agents/local-providers/shared`) where they passed `session.accessToken`. The plugin keeps its shape, so `auth.headers.authorization` reads `Bearer llmr-local-agent-login`. One comment gives the why: the hook sets the real token per request, and a signed-out gateway must have none left in the config.
- Changes, `providerProbeAuthRequest`: when `localClaudeAppsGatewayProbeUrl` returns an address and no session with an access token resolves, it throws `new Error("Claude apps gateway session was not found. Sign in again.")`, the hook's own sentence. Today it falls through and sends whatever the plugin holds.

- [ ] **Step 1: Change the tests.** In the import test, give the fixture's session the access token `session-access-token-7f3a` in place of `tok`, and change the fake gateway's check of `Bearer tok` to match. The result carries the candidate's `sourceFile`, a path under a random temporary directory, so the three letters `tok` can occur in it by chance. The assertion `assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer tok");` becomes `assert.equal(result.providerPlugins[0].auth.headers.authorization, "Bearer llmr-local-agent-login");`, and one line is added after it: `assert.equal(JSON.stringify(result).includes("session-access-token-7f3a"), false, "the session token is not in the import result");`.

In `provider-probe.test.mjs`, beside the test "connectivity probe uses the live Claude apps gateway session token", add `a probe of a signed-out Claude apps gateway fails with the sign-in message and sends no request`. Use that test's fake gateway and plugins with no session file, count the requests the fake gateway receives, and assert the probe's result carries `Claude apps gateway session was not found. Sign in again.` and the count is zero. Read how that test reads a probe's failure before you write the assertion.

- [ ] **Step 2: Run and see it fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/local-agent-provider-claude-apps-gateway.test.js .test-dist/core/test/unit/providers/provider-probe.test.js`
Expected: the changed assertion fails with `"Bearer session-access-token-7f3a"` as the actual value, and the new probe test fails because the fake gateway received a request. Not run.

- [ ] **Step 3: Implement** as Interfaces says.

- [ ] **Step 4: Verify.**

Run: the command of Step 2. Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test:core`
Expected: all pass. `packages/core/test/unit/gateway/local-agent-auth-provider-hook.test.mjs` already covers the hook setting the session's token over whatever the plugin holds.

- [ ] **Step 5: Commit.** Subject: `fix(providers): keep the gateway session token out of the saved provider`

---

### Task 4: The harness gives the gateway its own directory and cleans up (G-15)

Today `scripts/claude-apps-gateway-dev.mjs` starts `claude gateway` with `{ ...process.env }`. `CLAUDE_CONFIG_DIR` is not set, so the gateway uses the caller's own Claude directory. On 2.1.332 the gateway wrote `.claude.json` and `backups/` into its config directory in every run the author made with a scratch one. Whether the default directory puts that file at `~/.claude.json` was not run and must not be. The script also leaves its two containers and the volume running when the gateway stops, and leaves `gateway.rendered.yaml`, which holds the signing secret. After this task the gateway runs with a short list of variables and a state directory inside the harness folder, and the script cleans up on exit unless told to keep.

**Files:**
- Modify: `scripts/claude-apps-gateway-dev.mjs` (`parseArgs`, `main`, a new `gatewayChildEnv`)
- Modify: `docker/claude-apps-gateway/.gitignore`, `docker/claude-apps-gateway/README.md`, `docs/src/content/docs/en/guides/claude-apps-gateway.md` (the "Try it locally" section's tear-down lines)
- Test: `tests/architecture/claude-apps-gateway-harness.test.mjs`

**Interfaces:**
- Produces, exported: `gatewayChildEnv(base: NodeJS.ProcessEnv, stateDir: string): NodeJS.ProcessEnv`. It returns only these names: `PATH` from `base`; `HOME` set to `stateDir`; `CLAUDE_CONFIG_DIR` set to `path.join(stateDir, "claude")`; `CLAUDE_GATEWAY_ALLOW_LOOPBACK` set to `"1"`; and, each only when `base` has it, `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`, `CLAUDE_GATEWAY_LOG_FORMAT`, `CLAUDE_GATEWAY_LOG_LEVEL` and `CLAUDE_GATEWAY_DRAIN_TIMEOUT_MS`.
- Changes, `parseArgs` gains `--keep` (boolean, default `false`) and returns `keep`.
- Changes, `main`: the state directory is `path.join(harnessDir, ".state")`, created with mode `0o700`. The gateway is spawned with `gatewayChildEnv(process.env, stateDir)`. The `docker compose` calls keep `{ ...process.env, DEX_PORT }`, because Docker finds its plugins and its socket through the caller's home (run: with a scratch `HOME` and nothing else, `docker compose` was not found). Cleanup is one function: it runs `docker compose -f <compose file> down -v`, deletes `gateway.rendered.yaml`, `dex.rendered.yaml` and the state directory with `rmSync(..., { force: true, recursive: true })`, and prints one line saying so. It runs once, guarded by a flag, because the child's `error` and `exit` events can both fire. It runs only after the gateway has exited or never started, so the state directory is never deleted under a running gateway. Without `--keep` it also runs when `docker compose up` fails, which today leaves `dex.rendered.yaml` and any container that did start. With `keep` the script prints the teardown command as it does today. The `claude --version` check at the top of `main` also runs with `gatewayChildEnv`, so no call to `claude` gets the caller's environment.
- Changes, the error for a missing `claude` reads `claude is not on PATH; install Claude Code.` and names no version.

- [ ] **Step 1: Write the failing tests** in `claude-apps-gateway-harness.test.mjs`. Add `gatewayChildEnv` to the import.

```js
test("the gateway gets its own home and config directory, and none of the caller's secrets", () => {
  const env = gatewayChildEnv({
    ANTHROPIC_API_KEY: "made-up-key",
    CLAUDE_CONFIG_DIR: "/home/someone/.claude",
    HOME: "/home/someone",
    HTTPS_PROXY: "http://proxy.invalid:3128",
    LLMR_WEB_AUTH_TOKEN: "made-up-token",
    PATH: "/usr/bin"
  }, "/work/state");
  assert.deepEqual(env, {
    CLAUDE_CONFIG_DIR: "/work/state/claude",
    CLAUDE_GATEWAY_ALLOW_LOOPBACK: "1",
    HOME: "/work/state",
    HTTPS_PROXY: "http://proxy.invalid:3128",
    PATH: "/usr/bin"
  });
});

test("the harness state directory and rendered files are not tracked", () => {
  const ignore = readFileSync("docker/claude-apps-gateway/.gitignore", "utf8").split("\n");
  assert.ok(ignore.includes(".state/"));
  assert.ok(ignore.includes("*.rendered.yaml"));
});
```

In the existing test "parseArgs defaults and flags", add `keep: false` to both expected objects in key order, and add `assert.equal(parseArgs(["--keep"]).keep, true);`.

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/claude-apps-gateway-harness.test.js`
Expected: the build fails on the missing export `gatewayChildEnv`. Not run.

- [ ] **Step 3: Implement** as Interfaces says, and add `.state/` to `docker/claude-apps-gateway/.gitignore`.

- [ ] **Step 4: Update the README.** In "What runs where", the `claude gateway` row drops "verified with 2.1.310" and gains: `It runs with its own home and config directory under docker/claude-apps-gateway/.state, so it does not read or write your Claude files.` Add `--keep` to the flags line. Replace the "Tear down" section's text with: `The script stops the containers, removes the volume and deletes the rendered files when the gateway exits. Pass --keep to leave them, and then run:` followed by the existing command. In "Notes", the line that says to run the teardown command between a real run and a load-test run becomes: `--load-test needs an empty database. The script removes the volume on exit, so this matters only after a run with --keep.` In the guide's "Try it locally", replace the sentence "Tear down with:" and its command with: `The script removes the containers and the rendered files when the gateway exits. Pass --keep to leave them.` Add to "Verified": `2026-11-24, Claude Code 2.1.332, load-test mode with a scratch home: boot, device-flow sign-in as the mock user, the spend-limit and cost-report admin routes with that user's bearer, and a restart that kept the session.`

- [ ] **Step 5: Verify.**

Run: the command of Step 2. Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test:architecture`
Expected: all pass.

- [ ] **Step 6: Prove PR A on the harness.** This is the one step that starts real processes. It needs Docker and the `claude` binary, and it is safe for the real home only because of this task.

1. Record the modification time and size of `~/.claude/settings.json`.
2. Run `node scripts/claude-apps-gateway-dev.mjs --load-test`. Expected: the gateway logs `claude gateway listening on http://127.0.0.1:18080`.
3. Build with `npm run build:assets`, then restore the files it rewrites with `git checkout -- packages/core/models.json packages/ui/src/generated`. Run `llmr serve --port 3459` from this branch's build with `HOME` and `LLMR_INTERNAL_HOME_DIR` set to a scratch directory and `LLMR_WEB_AUTH_TOKEN` set to a made-up 32-character value. Use the absolute Node binary from `mise which node`, because the shim fails with a scratch home.
4. In the web interface open Providers, Add, Import local agent provider. Sign in to `http://127.0.0.1:18080`, approve the mock user in the browser, and import the gateway. Then read the access token from the session file under the scratch home's `.llm-router/claude-apps-gateway/` and search the scratch home's `config.sqlite` for it, for example with `strings`. Expected: no match, and the saved plugin holds `Bearer llmr-local-agent-login`. The web interface's `getConfig` cannot show this, because it masks every `authorization`.
5. Open the import panel again. Expected: the gateway's row is there with Import disabled and reading Imported. Choose Sign out. Expected: the row leaves the list. Use Check Connection on the imported provider. Expected: it fails with `Claude apps gateway session was not found. Sign in again.`
6. Stop the gateway with Ctrl-C. Expected: the script prints that it removed the containers and files, `docker ps` shows no harness container, and `docker/claude-apps-gateway/` holds no `*.rendered.yaml` and no `.state`.
7. Compare `~/.claude/settings.json` with step 1. Expected: unchanged.

Write the outcome of each numbered line into the PR.

- [ ] **Step 7: Commit.** Subject: `fix(harness): run the gateway with its own directory and clean up on exit`

Then open PR A for Tasks 1 to 4.

---

### Task 5: A forwarded request is recorded under the developer's id and e-mail (G-6)

**Built as the last commit of batch 16**, on its branch, after client label Tasks 3, 1 and 2, and after batch 12 is on `main`. Do Step 0 before anything else, because this task was written against those tasks' plan text and not their code. Steps 1 and 10 need Docker and the `claude` binary.

After batch 16 a request sent with a marked key shows the forwarded e-mail as its client label, and the developer's stable id is still thrown away. After this task such a request has two fields of its own, the forwarded user id and e-mail, in its usage row and its request-log row. Its client label is the tool or the key, as for any other request. The Logs detail panel shows the e-mail on its own line, so nobody loses sight of who sent a request before phase 3 builds a view of people.

**Files, as they stand before batch 16:**
- Modify: `packages/core/src/gateway/http/io.ts` (the label rule, and a new reader)
- Modify: `packages/core/src/gateway/request/pipeline.ts` (`proxyRequest`, where `client` is computed and passed to `recordGatewayRequestLog` and `recordUsage`)
- Modify: `packages/core/src/observability/raw-trace-sync.ts` (`readRawTraceRequestLogBundle`, `recordUsageCaptureFromRawTrace`)
- Modify: `packages/core/src/usage/store.ts` (`UsageEventInput`, `UsageCaptureInput`, `recordCapture`, the insert, the `CREATE TABLE`, `ensureUsageSchema`, `backfillFromAttachedRequestLog`)
- Modify: `packages/core/src/observability/request-log-store.ts` (`RequestLogRecordInput`, `RequestLogRawTraceUpdateInput`, the insert, the `CREATE TABLE`, `ensureRequestLogSchema`, `standaloneRecordInputFromRawTrace`, the list query's `SELECT`, the `SELECT` of `readRequestLogById`, `toRequestLogEntry`)
- Modify: `packages/core/src/contracts/app.ts` (`RequestLogEntry`)
- Modify: `packages/ui/src/pages/home/components/network-logs.tsx` (the detail panel)
- Modify: `docs/src/content/docs/en/guides/claude-apps-gateway.md`, `docker/claude-apps-gateway/README.md`
- Test: `packages/core/test/unit/gateway/http-boundary.test.mjs`, `packages/core/test/unit/observability/raw-trace-sync.test.mjs`, `packages/core/test/integration/usage/usage-store.test.mjs`, `packages/core/test/integration/observability/request-log-store.test.mjs`, `packages/core/test/integration/gateway/october-issues-wire.test.mjs`

**Interfaces:**
- Consumes from batch 16: `trustedForwarder` on `ApiKeyConfig`, `GatewayClientCaller`, `gatewayClientCallerForKey`, `isTrustedForwarderKey`, and the label rule held as data in `io.ts`.
- Changes, the label rule: the row for a valid key marked as a trusted forwarder is deleted, not left empty, so a marked key reads the same sources as any valid key. This replaces what client label Task 2 wrote one commit earlier: its marked-key row, its guide sentence that the e-mail is the client, and its check that the client reads `kilgore@kilgore.trout`. The delivery order's decision 7 allows it.
- Produces in `io.ts`:

  ```ts
  export type ForwardedIdentity = {
    userEmail?: string;
    userId?: string;
  };
  export function forwardedIdentity(caller: GatewayClientCaller, headers: IncomingHttpHeaders): ForwardedIdentity;
  ```

  It returns `{}` unless the caller is a key marked as a trusted forwarder. For such a caller `userId` is `x-claude-gateway-user-id` and `userEmail` is `x-claude-gateway-user-email`, each trimmed, cut to `maxGatewayClientLabelLength`, and left out when empty.
- Produces, on both usage input types and both request-log input types: `forwardedUserEmail?: string` and `forwardedUserId?: string`.
- Produces, in both tables: `forwarded_user_email TEXT NOT NULL DEFAULT ''` and `forwarded_user_id TEXT NOT NULL DEFAULT ''`, in the `CREATE TABLE` and added to an existing database by `ensureUsageSchema` and `ensureRequestLogSchema` the way each already adds a column.
- Produces, on `RequestLogEntry`: `forwardedUserEmail?: string` and `forwardedUserId?: string`, filled by `toRequestLogEntry`.

- [ ] **Step 0: Read what the three commits before this one built.** Read `io.ts`, `raw-trace-sync.ts`, `pipeline.ts` and `request-log-store.ts` on the branch. Confirm each name under "Consumes". Confirm the one fact this task cannot work without: in the single layout, the trace import still sees the values of the two identity headers after batch 16 stores them as `[redacted]` in Logs. Batch 16's own label for a marked key reads them at the same place, so its wire test for the single layout already answers this. If a name or that fact differs, correct this task's text and have the change audited before building.

- [ ] **Step 1: Measure what a gateway sends.** Start the harness with a mock upstream that logs the headers it receives (`--upstream http://127.0.0.1:<port> --api-key <made-up key>`), send one message through the gateway as the mock user, and write down the three identity headers' values. The README records that all three are sent. It does not record whether `x-litellm-end-user-id` holds the e-mail or the id. If it holds the id, nothing changes. If it holds the e-mail and `x-claude-gateway-user-email` is ever absent, say so in the PR and leave the mapping as planned.

- [ ] **Step 2: Write the failing tests.**

In `http-boundary.test.mjs`: `a marked key's forwarded id and e-mail are read into their own fields, and its label is the tool`. With a marked key and the three headers, `forwardedIdentity` returns both fields and `inferGatewayClient` returns the `User-Agent` name. With an unmarked key and the same headers, `forwardedIdentity` returns `{}`. With a refused caller, `{}`. With a marked key and no identity headers, `{}`.

In `usage-store.test.mjs` and `request-log-store.test.mjs`: `a row keeps the forwarded id and e-mail it was recorded with`, and `a database made before these columns gains them when it is opened`. Each store's test file already opens a database made by an older schema for an earlier column. Follow that test.

In `raw-trace-sync.test.mjs`: change the two existing assertions that expect the e-mail as the client (in the test of the trace-to-usage path) to expect the `User-Agent` name as the client and the e-mail and id in the new fields.

In `october-issues-wire.test.mjs`, in both layouts: `a request from a marked key is recorded under the developer's id and e-mail, and one from another key naming the same developer is not`. Use `startWireService` with the configure callback to mark one key.

- [ ] **Step 3: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/http-boundary.test.js .test-dist/core/test/unit/observability/raw-trace-sync.test.js .test-dist/core/test/integration/usage/usage-store.test.js .test-dist/core/test/integration/observability/request-log-store.test.js .test-dist/core/test/integration/gateway/october-issues-wire.test.js`
Expected: the build fails on the missing export `forwardedIdentity`. Not run.

- [ ] **Step 4: Implement the rule and the reader** in `io.ts`.

- [ ] **Step 5: Implement the stores.** Add the two fields to the types, the two columns to each `CREATE TABLE` and each schema check, and the two values to each insert. In `usage/store.ts`, `backfillFromAttachedRequestLog` copies named columns from the request-log database: add the two. Count the columns and the placeholders of each insert after the edit. They must be equal.

- [ ] **Step 6: Pass the fields from both layouts.** In `pipeline.ts` compute `forwardedIdentity(gatewayClientCallerForKey(apiKey), request.headers)` beside `client` and pass both fields to every `recordUsage` and `recordGatewayRequestLog` call that takes `client`. In `raw-trace-sync.ts` compute it in `readRawTraceRequestLogBundle` with the caller that function builds from the trace's key id, put both fields in `update`, and pass them on in `recordUsageCaptureFromRawTrace`. In `request-log-store.ts`, `standaloneRecordInputFromRawTrace` passes them through from its input. The list query and `readRequestLogById` name their columns one by one: add `forwarded_user_id, forwarded_user_email` to both, or `toRequestLogEntry` never sees them and the panel of Step 7 stays empty.

- [ ] **Step 7: Show the e-mail in Logs.** In `network-logs.tsx`, `LogExpandedDetails` lists a request's fields as `LogMetric` rows, one of them `<LogMetric label="Client" ...>`. Add one after it, `<LogMetric label="Gateway user" ...>`, rendered only when `entry.forwardedUserEmail` or `entry.forwardedUserId` is set: the e-mail, or the id when there is no e-mail.

- [ ] **Step 8: Change the guide and the README.** In the guide's "What LLMR records": a marked key's requests are recorded with the developer's id and e-mail in fields of their own, the client label is the tool or the key, and the Logs detail panel shows the e-mail as "Gateway user". State how long each store keeps them: usage events for 90 days whether or not request logs are on, request logs for as long as they are kept, 7 days by default. In the harness README, step 4 of "Sign a Claude Code session in" reads `Gateway user kilgore@kilgore.trout` where it read `Client`.

- [ ] **Step 9: Verify.**

Run: the command of Step 3. Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui`
Expected: all pass.

- [ ] **Step 10: Prove it on the harness.** With LLM Router as the gateway's upstream and the gateway's key marked: one message as the mock user appears in Logs with Gateway user `kilgore@kilgore.trout` and a client that is not the e-mail. Then send one request straight to LLM Router with an ordinary key and the header `x-claude-gateway-user-email: kilgore@kilgore.trout`. Expected: its Logs row has no Gateway user. Do this once with default settings, which is the single layout, and once with a limit set on any key, which forces the compatibility layout. Write both outcomes into the PR.

- [ ] **Step 11: Commit.** Subject: `feat(gateway): record a forwarded request under the developer's id and e-mail`

Then the batch's PR is opened as the delivery order says, with the outcomes of Steps 1 and 10 in it.

## Self-review

- Every gap the spec gives phase 0 has a home: G-16 in Task 1, G-3 in Task 2, G-13 in Task 3, G-15 in Task 4, G-6 in Task 5, G-5 in batch 16, G-14 in "Not in this plan" with its owner named.
- No task changes the meaning of a stored value except Task 5, which the spec decided.
- Tasks 2 and 3 both edit `local-providers/claude-apps-gateway.ts` and its test, in different functions. Task 1 reads `management-server.ts` and Task 2 adds one line to it. Tasks 2, 4 and 5 each edit the guide, and Tasks 4 and 5 the harness README, in different paragraphs.

## Not verified

- Tasks 2, 3 and 4 name their failing runs and none was run. Only Task 1's test ran.
- Task 1 Step 3, the single declaration of the view ids, was not compiled.
- Whether the gateway writes the real `~/.claude.json` under the harness as it stands. It is inferred from where it wrote in a scratch directory, and it must not be tested against the real home.
- Task 5 rests on code that does not exist yet. Its Step 0 is the check.
- The audit of this plan read the code, ran Task 1's test and the architecture build, and ran Biome on a copy of Task 1 Step 3. It ran no test of Tasks 2 to 5.
- Whether `claude gateway` needs `TMPDIR` or `USER` in its environment. The author's runs passed neither and it booted.
- Line overlap with batches 2 and 8 in `providers.tsx` and `ipc.ts`. Their plan texts were not compared line by line.
