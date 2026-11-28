# Claude Apps Gateway Management, Phase 1 Implementation Plan

> **Status, 2026-11-25: written, audited once on another model with its three blockers and sixteen corrections applied, not built.** No task here is built and none is merged. Building needs the owner's word, as does the merge.

> **Delivery.** [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md) orders the unbuilt work. No task of this plan is built (checked against `main` on 2026-11-28). It is not a batch: by decision 8 of that file it is built after the release, and 9.1.0 is released. Where it sits beside the remediation plan is the owner's call and is not recorded. Batch 17, which it needed, merged as PR 160 on 2026-11-25. "Where this fits" says what it must not be open beside. Where that file and this one disagree on order or branch, that file is right.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person adds a Claude apps gateway to LLM Router by name and address, and a page shows whether it is up, which version it runs, who is signed in, which groups they are in and whether the gateway treats them as an admin. They sign in and out from that page. In the web interface each browser signs in as its own person.

**Architecture:** One PR of six commits. The gateway record is a new section of the saved config with a writer of its own. A new core module derives a gateway's status and a person's identity from the gateway's own answers and stores neither. The web interface gets a sign-in that lives only in the server's memory, behind a handle the browser keeps. The page is a new view under Setup.

**Tech Stack:** TypeScript, Electron 45, React, `node:test` with `node:assert/strict`.

**Spec:** [`docs/superpowers/specs/2026-11-24-claude-apps-gateway-management.md`](../specs/2026-11-24-claude-apps-gateway-management.md). Gap ids G-1 and G-2 come from it. Read "Owner's decisions" (D-1 to D-6), "The data shape", "One page, sections by capability", and decisions O-3, O-4, O-10 and O-11 before you start. This plan is the spec's phase 1.

**Built after** [`2026-11-25-apps-gateway-phase-0.md`](completed/2026-11-25-apps-gateway-phase-0.md), Tasks 1 to 4 (batch 17, merged as PR 160). It uses that plan's test of the web bridge's method names, its single declaration of the view ids, and its harness.

**Evidence status.** A survey agent read every file and symbol named below at `main` `0be5ad63` on 2026-11-25, and its notes are kept by the plan author and not in the repo. The plan author re-read the theme writer, the config revision rule, the login's persist step and its wait loop, the gateway request helper, the API key save and the interface's key save. A second model then audited the plan against `main` `0ebbdd53` by reading, and ran no test. The gateway answers this plan relies on were run on 2026-11-25 against Claude Code 2.1.332 on the local harness, with a scratch home: the admin route for an admin, for a non-admin and with no `admin:` block, the version header, and the landing page. No test in this plan was run.

## Decisions this plan rests on

**From the spec, all accepted by the owner.**

- **D-1.** LLM Router manages a gateway it runs and one deployed elsewhere. This phase builds only the second kind, a gateway named by its address. Nothing here may get in the way of the first.
- **O-3.** The default admin credential is the signed-in person's own bearer.
- **O-4, O-10.** The page is its own entry under Setup, after Providers. Its label is "Apps gateway", with body text that says it manages Anthropic's Claude apps gateway. No Anthropic logo.
- **O-11.** In the web interface each browser signs in on its own for admin work. That session lives in the server's memory against a handle the browser keeps in `sessionStorage`, refresh token included, and is never written to disk. The desktop app has one user and uses the stored session.
- **From the data shape.** Status is derived on demand and nothing about it is stored. The gateway is the only judge of who is an admin.

**Measured for this plan, 2026-11-25, Claude Code 2.1.332.**

| Call | Answer |
|---|---|
| `GET /v1/organizations/spend_limits?limit=1`, an admin's bearer | 200 with a list |
| The same, the bearer of a person in no admin group | 401, `missing or invalid admin credentials` |
| The same, a gateway whose config has no `admin:` block, a valid bearer | 404, the text `not found` |
| The same, no credential | 401. The message differs with and without an `admin:` block, and that is the only difference |
| `GET /managed/settings`, a valid bearer, no `managed:` block | 404 with the header `x-cc-gateway-version: 2.1.332` |
| `GET /` | An HTML page whose text includes `Version` followed by the version |

**Plan author, changeable in review without reopening the plan:**

- **The secrets store moves to phase 2.** The spec's build order puts it in phase 1. Nothing in this phase holds a secret: the only credential is a session, which already has a store. The first secret is the static admin key of phase 2. Building a store with nothing to put in it is work a reviewer cannot judge. The spec's phase 1 row is changed to match in the commit that adds this plan.
- **Whether a gateway has an admin API is part of a person's identity, not of the gateway's status.** The spec's status type carried `adminApi: boolean`. The table above shows it can only be told with a valid bearer. The spec's type is changed to match in the same commit.
- **The record has a writer of its own, and the writer is told what the caller started from.** Saving the whole config runs profile work and other side effects, and it changes the config's revision, which would refuse a settings draft open in another window. So the list is saved apart and joins the theme in the revision's exceptions. A list cannot be saved the way the theme is, by replacing it: two windows that each add a gateway would lose one. The API keys are a list with the same problem, and `saveApiKeysConfig(next, base)` is the pattern followed here.
- **The page shows a list and, below it, the selected gateway's detail.** This phase's detail has one section, Status. Phases 2 to 5 add sections to the detail and do not change the list.
- **No `sub` or `groups` field is stored.** They are read from the access token each time they are shown, so a refresh can never leave them stale and the session file's format does not change.
- **A session that is past its end and cannot be refreshed reads as signed out.** The store keeps such a session on disk. The gateway answers it with 401, which would otherwise read as "signed in, not an admin".
- **Status calls give up after 5 seconds each.** The shared request helper waits 30 seconds, and the status view makes four calls in a row.
- **The version shown is the landing page's.** The header is exact but needs a bearer. The landing page answers anyone.

## Global Constraints

- The fork has no consumers. No compatibility path and no migration.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json`. No test starts `claude`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Never pass `--scope`. Check the build's exit code before you read a test result.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads.
- No test needs Docker, the `claude` binary or the network. A fake gateway listens on `127.0.0.1:0`. Each test file that needs one has its own, as the existing files do.
- No new test, script or doc names a real host or holds a real key or token.
- English only. The page says "Claude apps gateway" in body text and "Apps gateway" as its name.
- The three near names are other things. `gateway` and `GatewayStatus` are LLM Router's internal gateway. `ClaudeAppGateway*` is the Claude Desktop feature. Every new name here starts with `AppsGateway` or `appsGateway`.
- No new module goes under `packages/core/src/gateway/`. That folder is the internal gateway, and its `service.ts` is held to 20 lines by a test.
- Every new method lands in all of: `contracts/app.ts`, `contracts/ipc-channels.ts`, the handler in `electron/src/main/ipc.ts`, `electron/src/main/preload.ts`, `ui/src/types/electron.d.ts`, `ui/src/web-client-bridge.ts`, and `rpcHandlers` in `web/management-server.ts`. Phase 0's test fails if the last is missing.
- Merging needs the owner's word.
- The repository is public. Describe a change by what the code does.

## Review Focus

Each line is a condition no task's first test covers. The test that pins it is in the step named at the end.

1. Adding a gateway must not restart the internal gateway and must not change the config's revision. Task 1, Step 1, the last two tests.
2. Two records with the same address, written differently (`https://gw.example.test` and `https://gw.example.test/`). The second is refused. Task 1, Step 1.
3. A server that answers `/healthz` and is not a Claude apps gateway. It must read as not ready, with a reason, and never as ready. Task 2, Step 1.
4. A gateway with no admin API. The person must read as signed in with no admin API, and not as "not an admin". Task 2, Step 1.
5. In the web interface, a session stored on disk for provider traffic must never answer an identity or admin question. Task 3, Step 1, the test of the stored session.
6. A handle from one gateway used against another gateway's address. It must find no session. Task 3, Step 1.
7. A sign-in started from the page in the web interface must write no file and fetch no model list. Task 3, Step 1.
8. The page before it knows whether it runs in the desktop app. It must not ask for or show an identity until it knows. Task 4, Step 1.
9. Two windows each add a gateway from the same starting list. The second save must be refused, not win. Task 1, Step 1.
10. Adding a gateway from the page must not start a whole-config save. Task 5, Step 3, and its check in Task 6.
11. Two identity loads at once for a session that needs a refresh, against a gateway that rotates refresh tokens. One refresh must run, not two. Task 3, Step 1.
12. A session past its end with no refresh token. It must read as signed out. Task 2, Step 1.

## Where this fits

| Branch | Tasks | Meets these delivery batches | Build it |
|---|---|---|---|
| `feat/apps-gateway-page` | 1 to 6, one commit each | Batch 17 is phase 0's Tasks 1 to 4. Batch 8 rewrites the `saveConfig` handler in `ipc.ts` and `management-server.ts`. Batches 8, 14 and 16 edit `contracts/app.ts`. Batches 2, 8 and 12 edit `App.tsx`. Batch 16 edits the gateway guide, which Task 6 edits too | Batches 8, 16 and 17 are merged (PRs 167, 174 and 160), so nothing named here is open and this branch rebases on none of them. If reviewers cannot hold six commits, split after Task 3: Tasks 1 to 3 are core with tests and no interface, Tasks 4 to 6 are the page |

## Not in this plan

- **A gateway LLM Router runs.** Phase 4a. The record's `mode` has one value here, `"remote"`.
- **A static admin key and the store for it.** Phase 2.
- **Spend, caps, audit and "served to me".** Phase 2.
- **A link from an imported provider to its gateway's record.** The spec asks for it. It needs the page to exist first and is one line in phase 2.
- **Migrating the five private JWT readers in core to one.** This plan adds a sixth, in the session store, where its only caller is.

---

### Task 1: A managed gateway is a saved record (G-1)

Today LLM Router knows a Claude apps gateway only as a session file and, once imported, as a provider. After this task the config holds a list of managed gateways, each with an id, a name and an address, saved by a method of its own.

**Files:**
- Modify: `packages/core/src/contracts/app.ts` (new types beside the Claude apps gateway login types, and `AppConfig`)
- Modify: `packages/core/src/config/default-config.ts`, `packages/core/src/config/config.ts` (`pickConfig`, a new `parseAppsGateways`, a new `saveAppsGateways`, the line in `writeSanitizedConfig` that keeps the stored theme), `packages/core/src/config/config-repository.ts` (`appConfigRevision`)
- Modify: `packages/ui/src/pages/home/shared/config.ts` (`normalizeConfig`)
- Modify: the seven wiring files for one method, `saveAppsGateways`
- Test: `packages/core/test/unit/config/apps-gateways-config.test.mjs` (new), `packages/core/test/unit/gateway/gateway-runtime-change.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs`

**Interfaces:**
- Produces in `contracts/app.ts`:

  ```ts
  export type ManagedAppsGateway = {
    id: string;
    mode: "remote";
    name: string;
    url: string;
  };
  ```

  and `appsGateways: ManagedAppsGateway[]` on `AppConfig`.
- Produces in `config.ts`: `parseAppsGateways(value: unknown): ManagedAppsGateway[]`. It keeps an entry only when `id` and `name` are non-empty strings after trimming and `url` passes `normalizeClaudeAppsGatewayUrl`, whose result it stores. It sets `mode` to `"remote"`. It drops an entry whose id or whose normalized address an earlier entry already has. `pickConfig` is an allow-list, so without a call to this function the section is dropped on every load.
- Produces in `config.ts`: `saveAppsGateways(next: unknown, base: unknown): Promise<ManagedAppsGateway[]>`. Unlike the loader, it does not drop a bad entry in silence. For the first entry of `next` that has no id or no name it throws `new Error("A gateway needs an id and a name.")`, for the first whose address fails it rethrows the error of `normalizeClaudeAppsGatewayUrl`, and for two entries with one normalized address it throws `new Error("Two gateways cannot share one address.")`. Then, inside `enqueueAppConfigWrite`, it loads the config and calls `updatePersistedAppConfig`: when `JSON.stringify` of the stored list, parsed, differs from that of `parseAppsGateways(base)`, it throws `new AppConfigConflictError()`, and otherwise it sets only `appsGateways`. The web server already answers that error with 409.
- Changes, `appConfigRevision` leaves `appsGateways` out of the hash, as it does `theme`. `writeSanitizedConfig`, which every whole-config save goes through, keeps the stored `appsGateways` over the one in the config being saved, on the line where it keeps the stored theme: `appsGateways: isObject(current) && Array.isArray(current.appsGateways) ? current.appsGateways : config.appsGateways`. So a whole-config save from a stale window cannot undo an added gateway.
- Produces the method `saveAppsGateways(next: ManagedAppsGateway[], base: ManagedAppsGateway[]): Promise<ManagedAppsGateway[]>` and the channel `appSaveAppsGateways: "llmr:app:save-apps-gateways"`. Neither handler does anything but call the core function.

- [ ] **Step 1: Write the failing tests.**

In the new `apps-gateways-config.test.mjs`. The test build gives each test file one temporary home (`build/test-home.mjs`), so the tests of this file share one config database and run in this order. Each save passes the list the test last read as `base`.

1. `adding a gateway leaves the config's revision as it was, and it is there after a reload with its address as an origin`. Read `configRevision`, save one gateway with the address `https://gw.example.test/some/path` and base `[]`, load the config, and assert the revision is unchanged and the list holds the gateway with `url` `https://gw.example.test` and `mode` `"remote"`.
2. `a save is refused for an entry without a name, and for a plain-http address off loopback, in words that say why`. Assert each rejects, and that the stored list is unchanged.
3. `two gateways cannot share one address, however it is written`. A save with `https://gw2.example.test` and `https://gw2.example.test/` rejects with the message above.
4. `a save that started from an older list is refused`. With one gateway stored, save a second with base `[]`. Assert it rejects with an error whose `name` is `AppConfigConflictError`, and that one gateway is stored.
5. `a whole-config save from before a gateway was added keeps the gateway`. Load the config, save a second gateway with the right base, then call `saveAppConfig` with the config loaded first. Assert it does not throw a conflict and both gateways are still there.
6. `the loader drops an entry it cannot read and keeps the rest`. Call `parseAppsGateways` on a list with one good entry, one with no name and one with the address `ftp://x`, and assert it returns the good one.

In `gateway-runtime-change.test.mjs` add `a change to the managed apps gateways does not restart the gateway`, following that file's existing test of an unrelated section. This one is a guard and passes before any change, because what restarts the gateway is an allow-list the new section is not on.

In `web-management-server.test.mjs` add `web RPC saves the managed apps gateways`, with `rpc(runtime.url, authToken, "saveAppsGateways", [[{ id: "a", mode: "remote", name: "Team", url: "http://127.0.0.1:18080" }], []])`, asserting the value echoes one gateway.

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/config/apps-gateways-config.test.js .test-dist/core/test/unit/gateway/gateway-runtime-change.test.js .test-dist/core/test/unit/web/web-management-server.test.js`
Expected: the build fails on the missing export `saveAppsGateways`. Not run.

- [ ] **Step 3: Implement core** as Interfaces says. Add `appsGateways: []` to the default config. In `pickConfig` add the call beside the one for the bot configs.

- [ ] **Step 4: Wire the method** in the seven files. In the UI's `normalizeConfig`, keep `appsGateways` when it is an array and use `[]` otherwise.

- [ ] **Step 5: Verify.**

Run: the command of Step 2. Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron`
Expected: all pass.

- [ ] **Step 6: Commit.** Subject: `feat(apps-gateway): save a managed gateway as a record of its own`

---

### Task 2: A gateway's status and a person's identity are read from the gateway (G-2)

After this task core can answer two questions about an address: what state the gateway there is in, and what a given session is to it. Both are computed on each call from the gateway's own answers.

**Files:**
- Create: `packages/core/src/agents/claude-apps-gateway/status.ts`
- Modify: `packages/core/src/agents/claude-apps-gateway/session-store.ts` (one new exported function, and `gatewayRequest`)
- Modify: `packages/core/src/contracts/app.ts`
- Test: `packages/core/test/unit/agents/claude-apps-gateway-status.test.mjs` (new), `packages/core/test/unit/agents/claude-apps-gateway-session-store.test.mjs`

**Interfaces:**
- Produces in `contracts/app.ts`:

  ```ts
  export type AppsGatewayStatus =
    | { error: string; state: "unreachable" }
    | { reason: string; state: "not-ready" }
    | { protocolVersion: number; signIn: boolean; state: "ready"; version?: string };

  export type AppsGatewayAdmin = "no" | "no-admin-api" | "unknown" | "yes";

  export type AppsGatewayIdentity =
    | { state: "signed-out" }
    | {
        admin: AppsGatewayAdmin;
        canRefresh: boolean;
        email?: string;
        expiresAt: number;
        groups: string[];
        state: "signed-in";
        sub?: string;
      };
  ```

- Produces in `session-store.ts`: `claudeAppsGatewayTokenClaims(accessToken: string): { groups: string[]; sub?: string }`. It decodes the token's second segment as base64url JSON and returns `sub` when it is a non-empty string and `groups` as the strings of an array, or `[]`. Anything it cannot read gives `{ groups: [] }`. It never throws and checks no signature. One comment gives the why: the gateway verifies the token, and this is for display.
- Produces in `status.ts`:

  ```ts
  export async function readAppsGatewayStatus(gatewayUrl: string): Promise<AppsGatewayStatus>;
  export async function readAppsGatewayIdentity(session: ClaudeAppsGatewaySession | undefined): Promise<AppsGatewayIdentity>;
  ```

  Both use `gatewayRequest` from the session store, which never throws on an HTTP status and throws on a network error or a timeout. It gains an optional fourth parameter, `timeoutMs = gatewayRequestTimeoutMs`, used for the signal and for the timeout message. Every call in `status.ts` passes `5000`. Its other callers do not change.

  `readAppsGatewayStatus` normalizes the address, then in order:
  1. `GET /healthz`. A thrown error gives `unreachable` with the error's message. A status other than 200 gives `not-ready` with `health check answered <status>`.
  2. `GET /readyz`. A 503 gives `not-ready` with the response text, trimmed and cut to 200 characters, or `readiness check answered 503` when the text is empty. Any other status goes on to step 3, so that a server which is not a gateway is named as that and not by its own 404 page.
  3. `GET /.well-known/oauth-authorization-server`. It is a gateway only when the status is 200 and the payload's `gateway_protocol_version` is a number. Otherwise `not-ready` with `This address does not answer as a Claude apps gateway.`
  4. `GET /`. Tags are removed from the response text with `/<[^>]+>/g`, and `version` is the first match of `/Version\s+(\d[\w.-]*)/` in what is left. It is left out when there is none or the call throws.

  The result is `ready` with `protocolVersion` from step 3 and `signIn` true when the payload's `grant_types_supported` includes `urn:ietf:params:oauth:grant-type:device_code`.

  `readAppsGatewayIdentity` returns `signed-out` for no session, and for a session for which `claudeAppsGatewaySessionExpired` is true: its callers have already tried a refresh, so such a session cannot be used. Otherwise it calls `GET /v1/organizations/spend_limits?limit=1` with the session's bearer and maps the answer by the table under "Measured for this plan": 200 is `"yes"`, 401 and 403 are `"no"`, 404 is `"no-admin-api"`, and a thrown error or any other status is `"unknown"`. `sub` and `groups` come from `claudeAppsGatewayTokenClaims`, `email` and `expiresAt` from the session, and `canRefresh` is whether it has a refresh token.

- [ ] **Step 1: Write the failing tests.** The new test file has its own fake gateway on `127.0.0.1:0`, a `node:http` server whose answer for each path is set by the test.

For status: `a gateway that answers all four calls is ready, with its version and protocol version`; `an address nothing listens on is unreachable`; `a gateway whose store is down is not ready, in the gateway's own words` (readiness answers 503 `store unavailable`); `a server that is up but is not a gateway is not ready and says so` (health 200, readiness 404, discovery 404); `a gateway without a version on its landing page is ready with no version`; `a gateway that offers no device sign-in says so`.

For identity: `no session is signed out`; `a session past its end is signed out, and the gateway is not asked`, with a count of the fake gateway's requests; `the gateway's answer decides admin: 200 yes, 401 no, 404 no admin API, 500 unknown`, one fake gateway reset between the four; `an unreachable gateway leaves admin unknown and keeps the person signed in`; `the id and groups come from the token`. Build the token in the test as three base64url segments, the second holding `{"sub":"u-1","groups":["authors"]}`.

In `claude-apps-gateway-session-store.test.mjs` add `token claims read an id and groups, and read nothing from a token that is not a JWT`, and `a gateway request gives up after the time it was given`, against a fake gateway that never answers and a `timeoutMs` of 50.

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-apps-gateway-status.test.js .test-dist/core/test/unit/agents/claude-apps-gateway-session-store.test.js`
Expected: the build fails on the missing module. Not run.

- [ ] **Step 3: Implement** as Interfaces says.

- [ ] **Step 4: Verify.**

Run: the command of Step 2. Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test:core`
Expected: all pass.

- [ ] **Step 5: Commit.** Subject: `feat(apps-gateway): read a gateway's status and a person's standing from the gateway`

---

### Task 3: The methods, and a sign-in for the web interface that is never written to disk (O-11)

After this task the interface can ask for a gateway's status and for the caller's identity, and can sign out by address. In the desktop app those use the stored session. In the web interface a sign-in started from the page returns a handle and the session stays in the server's memory.

**Files:**
- Create: `packages/core/src/agents/claude-apps-gateway/admin-sessions.ts`
- Modify: `packages/core/src/agents/claude-apps-gateway/device-login-service.ts` (`startClaudeAppsGatewayLogin`, the poll that persists, a new `waitClaudeAppsGatewayLoginSession`)
- Modify: `packages/core/src/contracts/app.ts`, and the seven wiring files for three methods
- Test: `packages/core/test/unit/agents/claude-apps-gateway-admin-sessions.test.mjs` (new), `packages/core/test/unit/agents/claude-apps-gateway-device-login.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs`

**Interfaces:**
- Changes in `contracts/app.ts`: `ClaudeAppsGatewayLoginStartRequest` gains `inMemory?: boolean`, and `ClaudeAppsGatewayLoginWaitResult` gains `adminHandle?: string`.
- Produces in `contracts/app.ts`:

  ```ts
  export type AppsGatewayStatusRequest = { url: string };
  export type AppsGatewayIdentityRequest = { adminHandle?: string; url: string };
  export type AppsGatewaySignOutRequest = { adminHandle?: string; url: string };
  ```

- Changes in `device-login-service.ts`: a pending login remembers `inMemory`. When it is set, a confirmed poll does not call `fetchClaudeAppsGatewayModels` and does not call `persistClaudeAppsGatewaySession`. A new export `waitClaudeAppsGatewayLoginSession(request): Promise<{ result: ClaudeAppsGatewayLoginWaitResult; session?: ClaudeAppsGatewaySession }>` returns the confirmed session beside the result, and sets `session` only when the pending login had `inMemory`. It must be returned from the same call: a confirmed poll deletes the pending login before the function returns, so nothing can be asked about it afterwards, and a second wait for the same id answers `canceled`. `waitClaudeAppsGatewayLogin` becomes a call to it that returns `result`, so its callers do not change.
- Produces in `admin-sessions.ts`, a module-level map as the pending logins use:

  ```ts
  export function keepAppsGatewayAdminSession(session: ClaudeAppsGatewaySession): string;
  export async function resolveAppsGatewayAdminSession(handle: string | undefined, gatewayUrl: string): Promise<ClaudeAppsGatewaySession | undefined>;
  export function dropAppsGatewayAdminSession(handle: string | undefined): boolean;
  ```

  `keep` returns a `randomUUID()` handle. The map holds at most 64 sessions and drops the oldest when a 65th is kept. `resolve` returns nothing for an unknown handle, and nothing when the session's `gatewayUrl` is not the normalized `gatewayUrl` it was asked for. A session that is expired and has a refresh token is refreshed with `refreshClaudeAppsGatewaySession`, which writes nothing, and the refreshed one replaces it in the map. One refresh runs per handle at a time: a second map holds the promise in flight, as `refreshInFlight` does in the session store, because a gateway that rotates refresh tokens refuses the second of two. A `ClaudeAppsGatewayAuthError` from that refresh drops the handle and returns nothing. Any other error is thrown.
- `signOutAppsGateway` returns phase 0's `ClaudeAppsGatewaySignOutResult`. Phase 0's `signOutClaudeAppsGateway` names a gateway by the provider panel's candidate id and stays as it is. This one names it by address, which is what the page has.
- Produces the methods, each with a channel named after it under `llmr:app:`:

  | Method | Desktop handler | Web handler |
  |---|---|---|
  | `getAppsGatewayStatus(request)` | `readAppsGatewayStatus(request.url)` | the same |
  | `getAppsGatewayIdentity(request)` | `readAppsGatewayIdentity` of `resolveClaudeAppsGatewaySession(request.url)`, with a `ClaudeAppsGatewayAuthError` read as signed out. Any other error from the resolve, a network failure during a refresh for one, is thrown, and the page shows it. `adminHandle` is ignored | `readAppsGatewayIdentity` of `resolveAppsGatewayAdminSession(request.adminHandle, request.url)`. It never reads a stored session |
  | `signOutAppsGateway(request)` | It reads the stored session with `readClaudeAppsGatewaySession`, awaits `removeClaudeAppsGatewaySession(request.url)`, which phase 0 made a promise of nothing, and returns `{ signedOut: Boolean(read) }` | `dropAppsGatewayAdminSession(request.adminHandle)`. It never removes a stored session |

- Changes, the two existing login methods. The desktop handler for start drops `inMemory` from the request, so a desktop sign-in is always stored. The web handler for wait calls `waitClaudeAppsGatewayLoginSession`, and whenever a session comes back it keeps it and returns the result with `adminHandle`.

- [ ] **Step 1: Write the failing tests.**

In the new `claude-apps-gateway-admin-sessions.test.mjs`: `a kept session is found by its handle and its gateway's address`; `a handle from one gateway finds nothing at another address`; `an unknown handle and a missing handle find nothing`; `an expired session is refreshed in memory, and nothing is written to the config directory`, with a fake gateway answering `/oauth/token` and an assertion that the temporary config directory holds no file; `a refresh the gateway refuses drops the handle`; `two resolves at once of a session that needs a refresh make one call to the gateway`; `the sixty-fifth session pushes out the first`; `a dropped handle finds nothing, and dropping it twice says so`.

In `claude-apps-gateway-device-login.test.mjs`, beside its test of a confirmed login: `a sign-in kept in memory writes no session file and asks for no model list`. The fake gateway counts requests to `/v1/models`. Assert the count is zero, the config directory has no session file, and `waitClaudeAppsGatewayLoginSession` returns a session. Add `a sign-in that is stored hands back no session`, which is the existing confirmed login read through the new function.

In `web-management-server.test.mjs`:

1. `web RPC reads a gateway's status`, against a fake gateway started in the test.
2. `the web interface never answers an identity question from a stored session`. Persist a session for the fake gateway in the test's config directory, call `getAppsGatewayIdentity` with that address and no handle, and assert `{ state: "signed-out" }`.
3. `web sign-out with an unknown handle signs nothing out, and leaves a stored session in place`.

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-apps-gateway-admin-sessions.test.js .test-dist/core/test/unit/agents/claude-apps-gateway-device-login.test.js .test-dist/core/test/unit/web/web-management-server.test.js`
Expected: the build fails on the missing module. Not run.

- [ ] **Step 3: Implement core.** The login change, the new module, and the web handlers.

- [ ] **Step 4: Wire the desktop app and the bridge** for the three methods, and change the desktop start handler as Interfaces says.

- [ ] **Step 5: Verify.**

Run: the command of Step 2. Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron`
Expected: all pass.

- [ ] **Step 6: Commit.** Subject: `feat(apps-gateway): status, identity and sign-out methods, with a web sign-in held in memory`

---

### Task 4: The page's logic, apart from the page

The interface's tests render to a string and run no effects. So what the page decides is written as plain functions that take the API as an argument, the way `shared/claude-apps-gateway-login.ts` is, and tested there.

**Files:**
- Create: `packages/ui/src/pages/home/shared/apps-gateway.ts`
- Test: `packages/ui/test/component/apps-gateway.test.tsx` (new)

**Interfaces:**
- Produces in `shared/apps-gateway.ts`:

  ```ts
  export type AppsGatewayApi = Pick<NonNullable<Window["llmr"]>,
    "getAppInfo" | "getAppsGatewayIdentity" | "getAppsGatewayStatus" | "saveAppsGateways" | "signOutAppsGateway">;

  export type AppsGatewayViewState =
    | { state: "loading" }
    | { identity?: AppsGatewayIdentity; state: "loaded"; status: AppsGatewayStatus; web: boolean };

  export function appsGatewayAdminHandleKey(url: string): string;
  export function readAppsGatewayAdminHandle(storage: Pick<Storage, "getItem"> | undefined, url: string): string | undefined;
  export function writeAppsGatewayAdminHandle(storage: Pick<Storage, "removeItem" | "setItem"> | undefined, url: string, handle: string | undefined): void;
  export async function loadAppsGatewayView(api: AppsGatewayApi, storage: Pick<Storage, "getItem"> | undefined, url: string): Promise<AppsGatewayViewState>;
  export function withAddedAppsGateway(gateways: ManagedAppsGateway[], draft: { name: string; url: string }, id: string): { error: string } | { gateways: ManagedAppsGateway[] };
  ```

  The type is not named `AppsGatewayView`, because the component of Task 5 is. The key is `llmr.appsGatewayAdminHandle:` followed by the address. The two storage functions swallow a storage that throws, as the web bridge's token functions do. `loadAppsGatewayView` calls `getAppInfo` first, and `web` is `!appInfo.desktop`. It then reads the status. It asks for an identity only when the status is `ready`, with the stored handle when `web` is true and none otherwise. `withAddedAppsGateway` returns an error for an empty name or address, and for an address already in the list after trimming and removing one trailing slash. Core is the judge of the address rule, so this function checks no scheme.

- [ ] **Step 1: Write the failing tests** in `apps-gateway.test.tsx`, with a fake API as `claude-apps-gateway-login.test.tsx` builds one.

1. `the view asks who is signed in only once the gateway is ready`. A fake whose status is `not-ready` records its calls. Assert `getAppsGatewayIdentity` was not called.
2. `in the desktop app the view sends no handle, and in the web interface it sends the one this browser kept`.
3. `the view knows the mode before it asks for an identity`. Assert `getAppInfo` is the first call recorded.
4. `a kept handle is read back for its own gateway and not for another`.
5. `a storage that throws is treated as empty`.
6. `a gateway is added with its name and address, and one at an address already listed is refused`.

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/component/apps-gateway.test.js`
Expected: the build fails on the missing module. Not run.

- [ ] **Step 3: Implement** as Interfaces says.

- [ ] **Step 4: Verify.**

Run: the command of Step 2. Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test:ui`
Expected: all pass.

- [ ] **Step 5: Commit.** Subject: `feat(apps-gateway): the page's decisions as functions over the API`

---

### Task 5: The Apps gateway page

After this task Setup has an entry "Apps gateway" after Providers.

**Files:**
- Create: `packages/ui/src/pages/home/components/apps-gateway.tsx`
- Modify: `packages/ui/src/pages/home/shared/types.ts` (`ViewId`), `shared/options.ts` (`navigation`), `shared/i18n.tsx` (`appCopy.navigation`), `shared/providers.ts` (`viewUsesInternalScroll`), `shared/claude-apps-gateway-login.ts`, `components/layout.tsx` (the Setup group, `MainViewProps`, the view switch), `App.tsx` (the view's props and the save)
- Test: `packages/ui/test/component/apps-gateway.test.tsx`, `packages/ui/test/component/layout.test.tsx`, `packages/ui/test/component/claude-apps-gateway-login.test.tsx`

**Interfaces:**
- Before anything else: if `shared/options.ts` still declares its own `type ViewId`, stop. Phase 0 Task 1 is not built, and this task needs it.
- Changes, `ViewId` gains `"apps-gateway"`. `appCopy.navigation` is a record over the view ids, so `npm run typecheck` fails until it has the label `Apps gateway`. The Setup group becomes `["providers", "apps-gateway", "profile", "routing"]`. The `navigation` list gains an entry with an icon from `lucide-react` that the file does not use yet, `Waypoints`.
- Produces `AppsGatewayView` in `components/apps-gateway.tsx`, with the frame of `ApiKeysView` in `components/api-keys.tsx`: the same outer `motion.div`, one full-height `Card`, a `CardHeader` that is the toolbar, an error box and an empty state. Every primitive comes from `../shared/index`. Its props are `{ config: AppConfig; onGatewaysChange: (next: ManagedAppsGateway[]) => Promise<string | undefined> }`, where the promise gives an error to show, or nothing.

  What it shows:

  | Part | Content |
  |---|---|
  | Header | The title `Apps gateway`, the line `Manage Anthropic's Claude apps gateway from here.`, and a button `Add gateway` |
  | Add form | Two inputs, `Name` and `Address`, and `Add`. An error from `withAddedAppsGateway` or from `saveAppsGateways` shows under it in the gateway's or core's own words |
  | Empty state | `No gateway yet. Add one by its address to see its status and sign in.` |
  | List | One row per gateway: name, address, and a `Badge` reading `Ready`, `Not ready`, `Unreachable` or `Checking`. Choosing a row selects it. The first is selected to begin with |
  | Detail, section Status | For the selected gateway: the state and, when not ready or unreachable, the reason or error as given. When ready: `Version`, `Protocol version`, and a `Check again` button |
  | Detail, section Signed in | Signed out: a `Sign in` button, which runs `runClaudeAppsGatewayLogin` for this address and shows its code prompt as the provider panel does. Signed in: the e-mail, or the id when there is no e-mail, the groups as badges, `Session ends` with the time, an admin line, and `Sign out` |
  | Remove | A `Remove` button on the selected gateway, which saves the list without it. It does not sign out |

  The admin line reads `Admin: yes`, `Admin: no`, `This gateway has no admin API.` or `Could not ask the gateway whether you are an admin.` for the four values.

  When `web` is true the Signed in section also says: `This sign-in is yours and lasts for this browser tab. LLM Router uses it for admin work only. Provider traffic uses the sign-in under Providers.` The page then passes `inMemory: true` to the login's start, keeps the `adminHandle` from the wait with `writeAppsGatewayAdminHandle`, and clears it after a sign-out. When a sign-in is not offered because `signIn` is false, the section says `This gateway offers no device sign-in.` in place of the button.

  The page reads the status of every listed gateway when it opens and after `Check again`, so each row's badge is true. It reads an identity only for the selected gateway, when it is selected and after a sign-in and a sign-out. It does not poll. An error from reading an identity shows in the Signed in section as given.

  In the desktop app the Signed in section says, beside Sign out, phase 0's sentence: `Signing out stops every provider imported from this gateway until you sign in again.` There the session is the stored one, which provider traffic uses too.
- Changes, `runClaudeAppsGatewayLogin` in `shared/claude-apps-gateway-login.ts` gains an optional fourth argument `{ inMemory?: boolean }`, passed to the start. Its `onConfirmed` already receives the whole wait result, so the `adminHandle` arrives with no other change, and its other caller does not change.

- [ ] **Step 1: Write the failing tests.**

In `apps-gateway.test.tsx`, with `renderToStaticMarkup`: `with no gateway the page says how to add one`, rendered with `{ ...appConfigFixture(), appsGateways: [] }`, because the fixture is a partial config and has no such list; `a gateway's row shows its name and address`, rendered with a list of one. A static render runs no effect, so neither test sees a loaded status. That is Task 4's ground.

In `layout.test.tsx`, the test lists the sidebar's entries by id, in two expected arrays. In both, the Setup group becomes `["providers", "apps-gateway", "profile", "routing"]`.

In `claude-apps-gateway-login.test.tsx` add `a sign-in kept in memory asks for it at the start, and the handle the wait returns reaches the caller`.

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/component/apps-gateway.test.js .test-dist/ui/test/component/layout.test.js .test-dist/ui/test/component/claude-apps-gateway-login.test.js`
Expected: the build fails on the missing component. Not run.

- [ ] **Step 3: Implement the shell edits**, then the page. In `App.tsx`, write `onGatewaysChange` the way `persistApiKeys` is written. The app autosaves the whole config whenever its draft and its saved copy differ, so changing one of the two would start a whole-config save with its profile work. Take `base` from `currentDraft.current.appsGateways`, run `window.llmr.saveAppsGateways(next, base)` through `configSaveQueue.current.run`, and in its commit call `setConfigSnapshots({ ...currentSaved.current, appsGateways: saved }, { ...currentDraft.current, appsGateways: saved })`, so both copies change together and stay equal. Return the error's message when the save rejects. For a conflict the page says `This list changed in another window. Reload to see it.`

- [ ] **Step 4: Verify.**

Run: the command of Step 2. Expected: PASS.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:ui`
Expected: all pass. `tests/e2e/` clicks sidebar entries by exact name, so no spec there changes. `npm run test:e2e` is left to CI. It opens the real Electron window on the owner's Mac.

- [ ] **Step 5: Commit.** Subject: `feat(apps-gateway): a page that shows a gateway's status and who is signed in`

---

### Task 6: The guide, and the proof on a real gateway

**Files:**
- Modify: `docs/src/content/docs/en/guides/claude-apps-gateway.md`

- [ ] **Step 1: Add a section to the guide**, after "What LLMR records", titled `## See a gateway's status`. It says: where the page is; that a gateway is added by name and address, `https` or a loopback `http`; what Ready, Not ready and Unreachable mean, and that the reason shown is the gateway's own; what the admin line means and that the gateway decides it; and that in the web interface each browser signs in as its own person for the length of the tab, apart from the sign-in that provider traffic uses.

- [ ] **Step 2: Prove it on the harness.** This step starts real processes. It needs Docker and the `claude` binary, and phase 0's harness, which keeps the gateway out of the real home.

1. Record the modification time and size of `~/.claude/settings.json`.
2. Run `node scripts/claude-apps-gateway-dev.mjs --load-test --keep`.
3. Build with `npm run build:assets` and restore the two paths it rewrites. Run `llmr serve --port 3459` from the build with `HOME` and `LLMR_INTERNAL_HOME_DIR` set to a scratch directory and `LLMR_WEB_AUTH_TOKEN` set to a made-up 32-character value, using the absolute Node binary.
4. Open Apps gateway. Add `http://127.0.0.1:18080` as `Local`. Expected: Ready, Version `2.1.` and three more digits, Protocol version `1`. Expected in the server's output: no line about applying a profile, which a whole-config save would print. Add `ftp://x` as `Bad`. Expected: refused, with the address rule's own sentence.
5. Sign in and approve the mock user. Expected: `kilgore@kilgore.trout`, the group `authors`, `Admin: yes`. Expected in the scratch home: no file under `.llm-router/claude-apps-gateway/`.
6. Open the page in a second browser profile with the same token. Expected: signed out there.
7. Stop the Postgres container with `docker stop`. Choose `Check again`. Expected: Not ready, `store unavailable`. Start it again and check again. Expected: Ready.
8. Stop the gateway. Check again. Expected: Unreachable, with the connection error.
9. Start a second run of the harness with a config whose `admin_groups` names a group the mock user is not in. The harness has no flag for that: edit the rendered file by hand and start `claude gateway --config` on it with the harness's environment. Sign in. Expected: `Admin: no`. Then remove the `admin:` block and restart. Expected: `This gateway has no admin API.`
10. Tear down with the command the harness printed. Compare `~/.claude/settings.json` with step 1. Expected: unchanged.

Write the outcome of each numbered line into the PR. The desktop app's half, where the session is the stored one, is checked in the owner's single VM pass at the end of the program.

- [ ] **Step 3: Commit.** Subject: `docs(apps-gateway): how to see a gateway's status and sign in`

Then open the PR.

## Self-review

- G-1 is Task 1. G-2 is Tasks 2 to 5. O-11 is Tasks 3 to 5. O-4 and O-10 are Task 5.
- The record holds no secret, so nothing new needs masking in the web layer.
- Tasks 1 and 3 both add types to `contracts/app.ts` and lines to the seven wiring files. No other file is edited by two tasks.

## Not verified

- No test here was run, and no step's failing run was seen.
- The survey read the code. The plan author re-read three places and no more.
- The version pattern was seen on one version, 2.1.332, as plain text. The landing page's HTML around it was not read, which is why tags are removed first.
- Whether the build fails on a missing export the way each Step 2 expects.
- A gateway without `oidc` was not run, so what its discovery document offers is not known. The `signIn` field is this plan's answer to whatever it offers.
- Line overlap with batches 8 and 16 in `App.tsx`, `contracts/app.ts`, `ipc.ts` and `management-server.ts`.
