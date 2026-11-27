# Backlog: Logs, Usage Timing, Retention and Layout Implementation Plan

> **Built, 2026-11-27.** Tasks 1 and 2 merged as PR 172 (`1191300a`) and Tasks 3 and 4 as PR 173 (`566f71aa`). Where the build corrected this text, and what its reviews left open, is in [`2026-11-25-delivery-order.md`](../2026-11-25-delivery-order.md) under "Before a batch is built" and "Findings with no task". The task text below is as it was before the build.

> **Status, 2026-11-24: fix round done, changed text not yet audited.** Every Blocker and Correction of the 2026-11-22 audit (outside the repo) was checked against `main` `c491eb48`, after PRs 146 to 155. Both Blockers and all nine Corrections hold. C5 needed only a label, since its test pins today's behaviour. The task text below is corrected for each, and for the drift this round found. Run this round: the core unit and integration files these tasks change (135 tests, all pass), the wire file with the gateway entry (12 pass), and one throwaway test of a retention write under a held lock, since deleted. Not run: any step's new test, the browser checks, and the fix-round text itself. The delivery index wants this text audited once on another model before batch 11 is built.

> **Delivery, 2026-11-25.** [`2026-11-25-delivery-order.md`](../2026-11-25-delivery-order.md) groups this plan's unbuilt tasks into batches with other plans' tasks and sets the order. It overrides this plan's lines on branches, on one PR per task, and on waiting for a VM check: the owner's VM pass comes once, at the end.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who sends a request through LLM Router sees its Logs row within about a second, sees it counted at the time and under the provider it belongs to, reads one wording for a refused key, can trust the retention the Logs page states, and can read and click everything on the Logs page in a narrow window.

**Architecture:** Four tasks, one commit each, in two batches of the delivery order: batch 11 (`fix/trace-import-and-refusals`, Tasks 1 and 2) and batch 12 (`fix/logs-page`, Tasks 3 and 4). Each batch is one branch and one squash-merged PR. Task 1 changes the trace importer and the usage write. Task 2 gives both processes one key check and folds the refused-key entries away. Task 3 makes the Logs page state what the log database holds. Task 4 is four class-level layout changes with one visual pass.

**Tech Stack:** TypeScript, Electron 45, React, Tailwind 4, `better-sqlite3`, `node:test` with `node:assert/strict`, component tests that render with `renderToStaticMarkup`.

**Spec:** [`docs/superpowers/research/2026-11-22-open-items-validation.md`](../../research/2026-11-22-open-items-validation.md). Row ids L-1 to L-16 come from its group L. Read each row a task names before you start the task.

**Evidence status.** The research ran rows L-1, L-2, L-5, L-8, L-8b, L-9 and L-10 in the test runner. Every other row was read. No fix in this plan was prototyped, and nothing was checked in the desktop app. The plan author re-read every file, symbol and test named below at `main` `eb84a3ba`. A step that rests on something only read says so, and a number that was estimated from classes is named as an estimate. The fix round of 2026-11-24 re-read the same names at `main` `c491eb48`. Since `eb84a3ba` these PRs touched the files named here: PR 146 (the beforeAuth hook in `router-plugin.ts`), PRs 147 and 149 (`config.ts` and `App.tsx`, and in 149 the key-save handlers of `management-server.ts` and `ipc.ts`), and PRs 150, 152 and 155 (`gateway-service.ts`). None of them changed a symbol a task here names. Only line numbers moved (read). No task or part of one is already built (read).

## Decisions this plan rests on

- **B-7.** A stored retention value that is not a whole number from 1 to 90 becomes 90, with a warning. Task 3.
- **B-8.** The plan author's choices, open to change in review: the refused-key entries sit in a closed `<details>` (L-3), the three refusal reasons are one set in both processes (L-4), a long log value wraps (L-14). Tasks 2 and 4.
- **B-9.** L-13 and L-16 are closed with no change. L-11 is closed by the evidence under its row.
- **B-5.** Decided by the owner on 2026-11-22 (the spec's Decisions table). [`2026-11-22-backlog-client-label.md`](../2026-11-22-backlog-client-label.md) builds it, as batch 16, after this plan. No task here changes `inferGatewayClient` or `clientNameHeaders`. See "Hand-off to the client label plan".
- **Fix round, 2026-11-24.** Two choices made against the audit, both open to change in review. A trace fills in the provider only of a usage event that has no tokens and no cost (Task 1, Step 6, audit C7). The pending retention line compares what this process asked for with what its writer last saved, not with the database (Task 3, audit C2).
- **X-12.** A browser `title` tooltip is out of reach for keyboard and touch users. Task 4.
- **X-15.** Electron gives no way to stop the default `userData` folder being made. L-16.
- **V-19 of the v8 plan** stands: a request refused for its key is counted and not logged as a row, and no part of a key is kept.
- The plan author chose these values, and any of them can change in review: the 100 ms spacing of the child's "trace ready" message, the 1500 ms bound in Task 1's wire test, the two warning sentences in Task 3, and the class strings in Task 4.

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json` and never deletes or migrates `~/.claude/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Do not pass `--scope`.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them afterwards with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and the package suites the task touches.
- No test, script or doc in this repo names a real provider host or holds a key.
- A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. No task here touches the fork.
- Merging needs the owner's word, once per PR.
- Batch 12 starts from `main` after batch 11 has merged, because Tasks 2, 3 and 4 all edit `network-logs.tsx`.
- No step waits on a VM check. The owner's VM pass comes once, at the end of the whole program. Each task's "VM check, for the end pass" line goes to the list under "The end" in the delivery index.
- `october-issues-wire.test.mjs` skips unless `LLMR_TEST_GATEWAY_ENTRY` is set. Run it locally as `LLMR_TEST_GATEWAY_ENTRY=$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js node --test .test-dist/core/test/integration/gateway/october-issues-wire.test.js`.
- A check in the desktop app runs in an isolated home. Prove before the start that it cannot touch the real home, and prove afterwards that it did not.

## Review Focus

Each line names a condition no row's own test covers. The test that pins it sits in the task named at the end of the line.

1. Many requests finish while the importer is in the middle of a pass. The scan that was asked for during the pass still runs, so the last rows are not left for the 5-second scan. Task 1, Step 3.
2. A trace has no start time, a start time that is not a date, or one in the future. Its usage event gets the import time, and no event is ever dated later than now. Task 1, Step 5.
3. The parent process is gone and the IPC channel is closed when the child reports a trace. The child keeps serving. Task 1, Step 7.
4. A request carries the gateway's own core token, or an expired key. The first passes and is not counted. The second gets 401 in both layouts, and its reason is `API key is expired.` in both. The body differs by layout: the fork wraps the hook's error as `Gateway plugin "llmr-public-auth-context" beforeAuth failed: <reason>` (run by the audit, and read in the installed gateway `1.0.22-llmr.4`). Task 2, Steps 1 and 4.
5. The log database is locked while the user saves a new retention. The save returns in under two seconds, the Logs page says which value the database still holds, and the warning is gone once the write lands. Task 3, Step 6.

## Rows this plan closes

| Row | Closed by | Evidence when no task |
|---|---|---|
| L-1 | Task 1 | |
| L-2 | Task 1 | |
| L-2b | Task 1 | |
| L-3 | Task 2 | |
| L-4 | Task 2 | |
| L-5 | Not in this plan | B-5 is decided. The client label plan builds it. See "Hand-off to the client label plan". |
| L-6 | Task 1, Step 11 | Read: `getRequestLogs` goes to the query worker in the parent process and `buildLogWhereClause` has no gateway condition, so the read path cannot depend on the gateway. The likely cause is L-2. Step 11 is a wire test that settles it in the harness. The same check in the desktop app is a line of the end pass. |
| L-7 | Task 4 | |
| L-8 | Task 3 | |
| L-8b | Task 3 | |
| L-9 | Task 3 | |
| L-10 | Task 3 | |
| L-11 | No change | Run on a model of the code: Escape drops a typed retention value because no blur fires, and the Close button commits it. A dropped value prunes nothing, so it is the safe outcome. Committing on unmount would save a half-typed `3` on the way to `30`. |
| L-12 | Task 4 | |
| L-13 | No change (B-9) | Read: the window buttons end at 30 window points and the first drawn content starts at 68 CSS pixels times the zoom factor, so nothing overlaps until the factor is below 0.44. |
| L-14 | Task 4 | |
| L-15 | Task 4 | |
| L-16 | No change (B-9, X-15) | Read: `main.ts` calls `app.setPath("userData", ...)` at module top, before `whenReady`. Electron documents no way to stop the default folder being made. |

## Order

| Position | Task | Batch | Why here |
|---|---|---|---|
| 1 | Task 1 | 11 | Late rows reach every user of the default layout, and L-6 closes with it. |
| 2 | Task 2 | 11 | Edits `router-plugin.ts` after Task 1 added its publisher there, and `network-logs.tsx` before Task 4. |
| 3 | Task 3 | 12 | Independent of Tasks 1 and 2 in core. Edits `network-logs.tsx` after Task 2. |
| 4 | Task 4 | 12 | Its visual pass measures the notice Task 2 built and the page Task 3 changed. |

---

### Task 1: Import a trace when it is ready, and date and name its usage event correctly (L-1, L-2, L-2b, L-6)

In the single gateway layout, the desktop default, every Logs row appears up to 5 seconds after the answer, and its usage event carries the import time. After this task the row appears within about a second and the event carries the request's start time, also for a trace that was still in the spool when LLM Router quit. In the compatibility layout a request the child refused is counted under the provider its Logs row names, not under `unknown`.

**The mechanism, and why.** The fork posts each finished trace to `/__llmr/raw-trace-sync`. In the single layout that route is LLMR's own plugin route inside the gateway child (`llmrRawTraceSyncAckRouteKey` in `router-plugin.ts`). It answers 202 and tells nobody, and the parent finds the bundle only when `reconcileSourceBundles` runs, at most every `sourceScanIntervalMs` (5000). The child now sends the parent one IPC message from that route, and the parent scans at once. The other option, a 1000 ms scan interval, was not chosen. The replay timer is also 1000 ms, so a row could still take 2 seconds, which misses the bound, and the spool would be walked every second while idle. The 5-second scan stays as the fallback for a lost message.

**Read, not run:** that the bundle's `manifest.json` is on disk when the fork posts to the ack route. Step 9 is the check. If the row still lags there, stop and report. The audit read the fork's `RawTraceCapture.process`, which awaits the write of every part and of `manifest.json` before it posts, and in a polled run never saw a partial manifest.

**Known cost.** Each "trace ready" message makes the next replay walk the whole spool, so under load the spool is walked up to ten times a second (100 ms spacing). Inferred, not measured. The 100 ms is the plan author's value and can rise in review.

**Not in this task.**
- The time of a usage event the compatibility host writes itself (`recordUsage` in `pipeline.ts`). It is the completion time, as today.
- A final scan when the gateway stops. A trace the child wrote in its last milliseconds is imported at the next start, now with the right time.
- The cost of an event whose provider this task fills in. Step 6 fills in the provider only of an event with no tokens and no cost, so no price changes.
- The compatibility layout with request logs on and body capture `none`. Raw trace is off there (`buildRawTraceConfig` with `standaloneUsageCapture` false, read by the audit), so no trace arrives, and the row and the event both keep `unknown`. They agree, so nothing is wrong.
- The client label (B-5).

**Files:**
- Modify: `packages/core/src/observability/raw-trace-sync.ts`, `packages/core/src/usage/store.ts`, `packages/core/src/gateway/core-runtime/router-plugin.ts`, `packages/core/src/gateway/core-runtime/router-plugin-contract.ts`, `packages/core/src/gateway/application/gateway-service.ts`.
- Test: `packages/core/test/unit/observability/raw-trace-sync.test.mjs`, `packages/core/test/unit/gateway/router-plugin.test.mjs`, `packages/core/test/unit/gateway/core-restart.test.mjs`, `packages/core/test/integration/gateway/october-issues-wire.test.mjs`.

**Interfaces:**
- Produces: `RawTraceSynchronizer.scanSourcesSoon(): void`.
- Produces: `UsageCaptureInput.createdAt?: string` and `UsageStore.setProviderIfUnknown(requestId: string, provider: string | undefined): Promise<void>` in `usage/store.ts`.
- Produces in `router-plugin-contract.ts`: `llmrRawTraceReadyMessageType = "llmr:raw-trace-ready"` and `type LlmrRawTraceReadyMessage = { protocolVersion: 1; type: typeof llmrRawTraceReadyMessageType }`.
- Produces in `router-plugin.ts`: `resetRawTraceReadyPublisherForTest(): void`.

- [ ] **Step 1: Write the failing wire tests.** In `october-issues-wire.test.mjs`:

  In the existing loop test `a request for a model no provider has gets one Logs row and one usage event (${layout})`, change the `SELECT` in `readUsage` to `SELECT provider, request_id, status_code` and the expected value to:

  ```js
  assert.deepEqual(events, [{ provider: "Provider", request_id: row.requestId, status_code: 400 }], `usage read ${read}`);
  ```

  Add `a single-layout Logs row appears within 1500 ms of the answer`. Start with `startWireService(t, "single")`, send the same unknown-model request, and take `answeredAt = Date.now()` after `await response.text()`. Poll with `until` on `requestLogRuntime.list({ pageSize: 100 })` for the row whose `model` is the one sent, with no `flushRequestLogRuntime` call inside the poll. Then:

  ```js
  assert.ok(Date.now() - answeredAt < 1500, `row took ${Date.now() - answeredAt} ms`);
  ```

  Add `a trace left in the spool gives a usage event dated at its start`. Start with `startWireService(t, "single")`. Make the bundle directory directly under `RAW_TRACE_SPOOL_DIR` (`@llmr/core/config/constants.ts`), because `iterateRawTraceSourceDirectories` walks only that level. Write its three part files the way `raw trace usage capture keeps the client label the request log gets` in `raw-trace-sync.test.mjs` does (`client_request_metadata.json`, `upstream_response_metadata.json`, `upstream_response.json`), then write `manifest.json` last. The manifest holds `parts` with the three `filePath`s inside that directory, `startedAt` set to `new Date(Date.now() - 3_600_000).toISOString()`, a unique `turnKey`, and `target: { model, providerName: "Provider" }`. Without `parts`, `persistRawTraceBundle` throws and the bundle is never adopted (read). Wait with `until(() => usageStore.hasRequestId(turnKey), 10000)`, then:

  ```js
  const event = (await usageStore.getDatabase()).prepare("SELECT created_at FROM usage_events WHERE request_id = ?").get(turnKey);
  assert.equal(event.created_at, startedAt);
  ```

- [ ] **Step 2: Run them and see them fail.** Run the wire file with the command under Global Constraints. Expected: the `(compat)` case fails on `provider: "unknown"`, the 1500 ms case fails at about 4700 ms, and the spool case fails on a `created_at` of now.

- [ ] **Step 3: Write the failing importer tests.** In `raw-trace-sync.test.mjs`, model both on `#1867 source sweep and upload share one durable bundle adoption` for the source bundle and its `manifest.json`. Both build the synchronizer with `replayIntervalMs: 60000` and `sourceScanIntervalMs: 60000`, and an `enqueueUpdate` that pushes `input.requestId` to `seen` and returns `true`.

  `a scan asked for adopts a source bundle without waiting for the scan interval`: write bundle A, `start()`, `waitFor(() => seen.includes("a"))`, write bundle B, call `synchronizer.scanSourcesSoon()`, then `await waitFor(() => seen.includes("b"))`. `waitFor` times out at 2 seconds, so the 60-second intervals cannot satisfy it.

  `a scan asked for during a replay still runs` (Review Focus 1): the same, with an `enqueueUpdate` that waits on a gate for request `a`. Write bundle B and call `scanSourcesSoon()` while the gate is closed, open the gate, then `await waitFor(() => seen.includes("b"))`.

- [ ] **Step 4: Implement `scanSourcesSoon(): void` on `RawTraceSynchronizer`.** It records that a source scan is wanted and starts a replay when storage is ready. `replayStoredBundles` runs `reconcileSourceBundles` when the scan interval has passed or a scan is wanted, and clears the mark before it scans. A request that arrives while a replay is running leads to one more replay after it. Before `start()` and after `stop()` the method does nothing.

- [ ] **Step 5: Write the failing usage tests.** In `raw-trace-sync.test.mjs`, copy `raw trace usage capture keeps the client label the request log gets` three times. Each sends a manifest through `sendRawTrace` and reads `created_at` as Step 1 does.

  `a trace's usage event is dated at the trace's start`: `startedAt` one hour ago. Assert `created_at` equals it.

  `a trace with no usable start time is dated at its import` (Review Focus 2): one manifest with no `startedAt`, one with `startedAt: "not a date"`, one with `startedAt` one hour ahead. For each, take `const sentAt = new Date().toISOString()` just before `sendRawTrace`, then:

  ```js
  assert.ok(event.created_at >= sentAt && event.created_at <= new Date().toISOString(), event.created_at);
  ```

  `a trace names the provider of a usage event recorded as unknown`: first `await usageStore.record({ durationMs: 1, method: "POST", path: "/v1/chat/completions", requestId, statusCode: 400 })`, then send a manifest with the same `turnKey` and `target: { model, providerName: "Stub" }`. Assert the store holds one event for `requestId` and its `provider` is `Stub`. A second case records the event with `provider: "Other"` first and asserts it stays `Other`. A third records an `unknown` event with `usage: { inputTokens: 5, outputTokens: 2 }` first and asserts it stays `unknown`, because Step 6 leaves an event with tokens alone.

- [ ] **Step 6: Implement the usage changes.**
  - `UsageCaptureInput` gains `createdAt?: string`, and `recordCapture` passes it to `record`, which already takes `UsageEventInput.createdAt`.
  - `recordUsageCaptureFromRawTrace` passes `createdAt` from `input.startedAt`. The rule: only when `Date.parse` gives a finite time that is not later than now, and always re-written with `toISOString()`, because every range query compares `created_at` as text.
  - `UsageStore.setProviderIfUnknown(requestId: string, provider: string | undefined): Promise<void>` runs one statement, `UPDATE usage_events SET provider = ? WHERE request_id = ? AND provider = 'unknown' AND total_tokens = 0 AND cost_usd IS NULL`, and emits `recorded` when a row changed. It does nothing for an empty id or a provider that normalizes to `unknown`. The token and cost conditions exist because `recordGatewayUsageCaptureIfMissing` runs for every trace, and an event with tokens keeps a cost that was priced under `unknown` (audit C7, read). L-1 is a refused request, which has neither.
  - `recordGatewayUsageCaptureIfMissing` calls it when the request id already exists, with `resolveUsagePricingTarget(input.config, input).provider`. That is the value `recordCapture` would have stored whenever the trace names a provider, which every L-1 trace does. `recordCapture` also passes the response body's model, which matters only when the trace names no provider (read). The Logs row gets its provider from this same trace, so the two cannot name different providers.

- [ ] **Step 7: Write the failing child tests.** In `router-plugin.test.mjs`, model on the refused-key helper near `resetRefusedKeyRequestPublisherForTest`: stub `process.send` and collect messages whose `type` is `llmrRawTraceReadyMessageType`. Find the route with `plugin.httpRoutes.find((item) => item.path === rawTraceSyncPath)` and call its handler with `config: { rawTrace: { sync: { headers: { [rawTraceSyncHeader]: "token" } } } }`, a request whose headers carry that token, and a `reply` stub with `code` and `send`.
  - `the trace ack tells the parent a trace is ready`: one call sends one message `{ protocolVersion: 1, type: "llmr:raw-trace-ready" }`, and the reply is still 202 with `localSpool: true`.
  - `a wrong sync token sends no message`: the reply is 401 and no message is sent.
  - `a burst of acks sends a first message at once and one more after 100 ms`: under `t.mock.timers.enable({ apis: ["Date", "setTimeout"] })`, five calls give one message, and `t.mock.timers.tick(100)` gives a second and no third.
  - `a closed channel does not end the child` (Review Focus 3): copy the two refused-key tests that set `process.send` to a function that throws and to one that calls its callback with an error. The handler still replies 202.

- [ ] **Step 8: Implement the message.**
  - Add the type and the constant to `router-plugin-contract.ts`.
  - In `router-plugin.ts` add a module-level publisher beside `RefusedKeyRequestPublisher`, with the same shape: a leading send, a trailing timer, `unref`, and `process.send?.(message, () => undefined)` inside `try`. Its interval is `rawTraceReadyPublishIntervalMs = 100`. The ack route calls it after the token check passes. Export `resetRawTraceReadyPublisherForTest`.
  - In `gateway-service.ts`, `handleCoreGatewayMessage` calls `this.rawTraceSynchronizer.scanSourcesSoon()` for a message whose `type` is `llmrRawTraceReadyMessageType` and whose `protocolVersion` is 1. The existing check that drops a message from a child that is not `this.child` covers it.
  - Test in `core-restart.test.mjs`, beside `refused-key counts survive a core restart and only the current child is heard`: replace `service.rawTraceSynchronizer.scanSourcesSoon` with a counter. A message from the current child counts 1. After `service.adoptCoreGatewayChild({})`, a message from the old child leaves the count at 1.

- [ ] **Step 9: Run every test of Steps 1, 3, 5 and 7, and Step 11's test once it is written.** Run the three unit files and the wire file. Expected: all pass. This is also the check for the claim marked "Read, not run" above.

- [ ] **Step 10: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`. Expected: all pass. `gateway-service-architecture.test.mjs` must stay green, because this task edits `gateway/`.

- [ ] **Step 11: Settle L-6 in the harness.** In `october-issues-wire.test.mjs`, add `Logs rows sent before the gateway stops are listed after it`. Start with `startWireService(t, "single")`, send three requests for a model no provider has, each with its own model name, and wait with `until` until `requestLogRuntime.list({ pageSize: 100 })` holds all three. Then `await service.stop()` and list again. Pass: the three rows are still there. The `t.after` that `startWireService` registers calls `stop` a second time, which is harmless: `stopGateway` skips a child and a server that are already gone, and it does not close the request log runtime (read). If the second list is empty, L-6 is a separate defect: stop and report it with the count `SELECT COUNT(*) FROM request_logs` gives in `REQUEST_LOGS_DB_FILE`.

  **VM check, for the end pass.** In the desktop app, send three requests, wait 10 seconds, stop the gateway from the sidebar, and open Logs. Three rows show.

- [ ] **Step 12: Commit.** `fix(logs): import a trace when the gateway reports it, and date and name its usage event from the trace`

---

### Task 2: One set of refusal reasons, and a refused-key notice that stays short (L-4, L-3)

A caller with an expired key is told `API key is expired.` whichever process answers. Today the gateway child says `Invalid or expired API key.` for a wrong key and an expired one, and LLMR's own front says `Invalid API key.` or `API key is expired.`, so the notice can list two spellings. The notice's entries move into a closed `<details>`, so five refusals no longer push the table down in a narrow window.

The child's 401 body changes with this task. A wrong key now reads `Gateway plugin "llmr-public-auth-context" beforeAuth failed: Invalid API key.` and an expired one ends `API key is expired.`. The prefix is the fork's, and LLMR's own front sends the bare reason. So after this task the reason text is one set in both layouts and in the notice, and the two bodies still differ by that prefix. Making the bodies equal needs the fork (see "Open with the owner").

Today the hook's `resolvePublicGatewayAuth` reads the key through `resolveApiKey`, which calls `resolveApiKeyFromHeaders` and drops an expired match, so the hook cannot tell a wrong key from an expired one (read). The hook's copy of the config holds expired `APIKEYS` entries: only the fork's static key list drops them (`publicGatewayAuthTokens` in `supervisor.ts`, read). So `checkApiKeyToken` sees the expired entry and can name it. PRs 149 and 150 changed how keys are saved and when the gateway reloads them, not what the hook reads (read).

**Files:**
- Modify: `packages/core/src/gateway/auth/api-key-authorizer.ts`, `packages/core/src/gateway/core-runtime/router-plugin.ts`, `packages/ui/src/pages/home/components/network-logs.tsx`.
- Test: `packages/core/test/unit/gateway/api-key-authorizer.test.mjs`, `packages/core/test/unit/gateway/router-plugin.test.mjs`, `packages/core/test/integration/gateway/october-issues-wire.test.mjs`, `packages/core/test/unit/gateway/core-restart.test.mjs`, `packages/core/test/unit/gateway/refused-key-requests.test.mjs`, `packages/ui/test/component/observability.test.tsx`.

**Interfaces:**
- Produces in `api-key-authorizer.ts`:

  ```ts
  export const apiKeyRefusalReasons = {
    expired: "API key is expired.",
    invalid: "Invalid API key.",
    missing: "API key is missing."
  } as const;
  export type ApiKeyTokenCheck =
    | { apiKey: ApiKeyConfig; ok: true }
    | { ok: false; reason: (typeof apiKeyRefusalReasons)[keyof typeof apiKeyRefusalReasons] };
  export function checkApiKeyToken(apiKeys: ApiKeyConfig[], token: string | undefined): ApiKeyTokenCheck;
  ```

- [ ] **Step 1: Write the failing core tests.**

  In `api-key-authorizer.test.mjs`, `checkApiKeyToken tells a missing, a wrong and an expired key apart`:

  ```js
  const live = { createdAt: new Date(0).toISOString(), id: "live", key: "live-key" };
  const old = { createdAt: new Date(0).toISOString(), expiresAt: "2020-01-02T00:00:00.000Z", id: "old", key: "old-key" };
  assert.deepEqual(checkApiKeyToken([live, old], "live-key"), { apiKey: live, ok: true });
  assert.deepEqual(checkApiKeyToken([live, old], undefined), { ok: false, reason: "API key is missing." });
  assert.deepEqual(checkApiKeyToken([live, old], "nope"), { ok: false, reason: "Invalid API key." });
  assert.deepEqual(checkApiKeyToken([live, old], "old-key"), { ok: false, reason: "API key is expired." });
  ```

  In `router-plugin.test.mjs` two pinned strings change, in two tests (line numbers read at `c491eb48`):
  - `a wrong public API key sends one refused-key count to the parent without the key`: `messages[0].recent[0].reason` (line 795) becomes `Invalid API key.`.
  - `LLMR router core plugin rejects expired public API keys before gateway static auth`: the hook result's `error` (line 782) becomes `API key is expired.`. Its key is expired, so it already covers the hook half of an expired key. Do not add a separate expired-key test. Extend this one instead: build the plugin through `refusedKeyHarness(t)`'s `process.send` stub, or copy its stub, and assert that one message is sent whose `recent[0].reason` is `API key is expired.`.

  The existing tests `a request with the core token or a good key sends no refused-key count` and `a bare Bearer header is refused by the hook and counted once` must stay green unchanged (Review Focus 4). The second compares the reason with `result.error`, so it follows the new wording.

- [ ] **Step 2: Run them and see them fail.** Expected: `checkApiKeyToken` is not exported, and the child's reason is `Invalid or expired API key.`.

- [ ] **Step 3: Implement the one check.**
  - `checkApiKeyToken` in `api-key-authorizer.ts` holds the rule that `authorize` holds inline today: no token is `missing`, a token that matches no key is `invalid`, a match that `isApiKeyExpired` is `expired`.
  - `authorize` calls it with the list it already loaded and sends its `reason`. Its 403 for an empty key list stays as it is.
  - `resolveApiKeyFromHeaders` becomes a thin caller of it and keeps its signature, because `router-plugin.ts` uses it for the models, bootstrap and count-tokens routes.
  - In `router-plugin.ts`, `resolvePublicGatewayAuth` returns `apiKeyRefusalReasons.missing` when `rejectMissing` is set. For a token that is not a static bypass token it replaces today's `resolveApiKey(config, authHeadersForToken(headers, token))` with `checkApiKeyToken(await configuredApiKeys(config, { includePersisted: false }), token)`, and returns the reason as `error`. `configuredApiKeys` is already exported from `api-key-authorizer.ts`. The two literals `"API key is missing."` (the hook's refused-key record and `resolvePublicGatewayAuth`) become `apiKeyRefusalReasons.missing`. `findApiKeyByToken` stays private. `resolveApiKey` stays, because the models, bootstrap and count-tokens routes use it.
  - After this step `grep -rn "Invalid or expired API key" packages/core/src` prints nothing.

- [ ] **Step 4: Update the strings other tests carry.** `october-issues-wire.test.mjs`, in `a request with a wrong API key shows on the gateway status without the key`: `newest.reason` is `Invalid API key.`. Add to the same file `an expired key gets the same 401 in both layouts`: a loop over `["single", "compat"]` that starts `startWireService`, sends a key that is in `config.APIKEYS` with `expiresAt` in 2020, and asserts status 401. The body's `error.message` equals `API key is expired.` in the compat layout and matches `/beforeAuth failed: API key is expired\.$/` in the single layout, where the fork wraps the hook's error (audit B1, run by the audit). In both layouts, after waiting with `until` for `refusedKeyCount(service)` to grow by one as the wrong-key test does, the newest `refusedForKey.recent` entry's `reason` is `API key is expired.`. Both layouts feed one module-level log in `refused-key-requests.ts` that `getStatus` reads (read). `startWireService` builds the config itself, so give it an optional third parameter `configure?: (config) => void` that runs before `singleGatewayRuntimeBlockersForTest` and `service.start`. The client label plan consumes that parameter. The fixtures in `core-restart.test.mjs` (line 216), `refused-key-requests.test.mjs` (lines 60 and 119) and `observability.test.tsx` (line 85) use `Invalid or expired API key.` as sample text. Change each to `Invalid API key.`, so no file carries the retired wording.

- [ ] **Step 5: Write the failing notice test.** In `observability.test.tsx`, add `LogsView folds the refused-key entries away until they are asked for`:

  ```tsx
  const html = render(true, refusedForKey);
  const notice = firstMatch(html, /<div class="[^"]*network-notice[^"]*">.*?<\/details><\/div>/);
  assert.match(notice, /<details><summary[^>]*><span role="status">2 requests were refused/);
  assert.doesNotMatch(notice, /<details[^>]*open/);
  assert.match(notice, /<\/summary><ul/);
  assert.match(notice, /Codex/);
  ```

  `render` and `refusedForKey` are the ones inside `LogsView shows requests refused for the API key, with logs on or off, and nothing at zero`. Lift them to module scope. In `LogsView words one refused request in the singular, with its time, outside the log shell`, the pattern that finds the notice becomes `/<div class="[^"]*"><details><summary[^>]*><span role="status">1 request was refused/`.

- [ ] **Step 6: Implement the notice.** `RefusedKeyRequestsNotice` keeps its outer `div.network-notice` and its sentence. Inside it: `<details>`, a `<summary className="cursor-pointer font-semibold text-foreground">` that holds the sentence in `<span role="status">`, then the `<ul>` as it is today. The `<details>` has no `open` attribute and no class, because Step 5's pattern expects `<details><summary`. `feedback.tsx` already uses a `<details>` with a `cursor-pointer` summary for its technical details, so no new style is needed. The sentence moves from today's `div` with `role="status"` into the `span`.

- [ ] **Step 7: Run the tests.** The three core unit files, the wire file and `observability.test.tsx`. Expected: all pass.

- [ ] **Step 8: Measure the notice in a browser check.** This is a check an agent runs with the `chrome-devtools-mcp:chrome-devtools` tools against the branch's built app in an isolated home, not a VM check, and it gates nothing outside this batch. Start the app as Task 4, Step 6 describes. Send five requests with a wrong key to the gateway port. On the Logs page, with the sidebar open, read `document.querySelector(".network-notice").getBoundingClientRect().height`.
  - At 1280x800: at most 40. It is 120 today (v8 Task 12, as built).
  - At 760x800: at most 60. It is about 240 today, which the v8 open-items row records as measured in the app (read by the audit, not re-read).

  The 60 allows the sentence to wrap once. The sentence is about 570 px wide by estimate and the notice is about 446 px wide at 760, so one line at 760 is not expected. If the owner wants one line at every width, the sentence has to shorten, which is a copy decision (B-8). Open the `<details>` with the keyboard (Tab, then Enter) and confirm the five entries show. Record the numbers in the PR. Close every page the check opened, and quit the app.

  **VM check, for the end pass.** On the released app, five wrong-key requests leave the notice one line high at a wide window, and the entries open from the keyboard.

- [ ] **Step 9: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`, `npm run test:ui`. Commit, one for the task as the delivery index wants: `fix(gateway): give a refused key one reason in both processes, and fold the notice's entries away`. Then open the batch 11 PR: branch `fix/trace-import-and-refusals`, one commit for Task 1 and one for Task 2, squash-merged.

---

### Task 3: State the retention the log database holds (L-8, L-8b, L-9, L-10)

The Logs page says "Request logs are kept for N days" from the config. When the write to the log database fails, the page states a value the database does not hold. After this task the page states the database's value and says so when the app asked for a different one. A save no longer waits up to 5 seconds on a locked log database. A retention in the stored config that is not a whole number from 1 to 90 loads as 90 with a warning (B-7).

**Where the comparison is made, and why.** The research proposed that `LogsView` compare the page's value with the config. The config the view holds is the draft, which changes before the save, and the page refreshes every 5 seconds, so that comparison would show a false warning after every retention change. `RequestLogRuntime` already holds both sides in the parent process: `requestedRetentionDays`, and `savedRetentionDays`, which `sendRequestedRetentionDays` sets only after the writer confirms a value (read). It makes the comparison in `list`, and the view shows what it is told.

The comparison is requested against saved, not requested against the database. Two processes can share the log database, for example the desktop app and `llmr serve --no-gateway`. If process B writes 12 after process A saved 30, a database comparison would make A warn forever: A's next save finds requested equal to saved and sends nothing, so "Saving any setting tries again" would be untrue (audit C2, read and inferred). Requested against saved is exactly "this process's last write has not landed", and a save then does resend. The page still states the database's own value. A brief warning while a normal write is in flight is possible and harmless, because the page refreshes every 5 seconds (inferred).

**Where the tests live, and why.** The research proposed adding the save tests to `web-management-server.test.mjs`. Every test in that file ends with `runtime.close()`, which calls `closeRequestLogRuntime()`, and the request log runtime cannot reopen once closed. The tests go in a new file, which runs in its own process, as one test with one server.

**Not in this task.**
- A retry after a failed retention write. The next save of any setting sends the value again, because `sendRequestedRetentionDays` resends while the requested and saved values differ. A writer restart resends too (read, `request-log-runtime.ts`, the `ready` handler).
- The pending line with request logs off. It renders only in the enabled branch, so a failed write is not shown there.
- The Agent Analysis page, which keeps reading the config's value.
- The Electron save handler has no test harness. Its change is the same word as the web handler's, and only typecheck covers it.

**Files:**
- Create: `packages/core/test/unit/web/request-log-retention-save.test.mjs`.
- Modify: `packages/core/src/contracts/app.ts`, `packages/core/src/observability/request-log-store.ts`, `packages/core/src/observability/request-log-runtime.ts`, `packages/core/src/web/management-server.ts`, `packages/electron/src/main/ipc.ts`, `packages/core/src/config/config.ts`, `packages/ui/src/pages/home/components/network-logs.tsx`, `packages/ui/src/pages/home/shared/logs.ts`, `docs/src/content/docs/en/configuration/observability.md` (the `requestLogRetentionDays` row, line 35, gains B-7's rule).
- Test: `packages/core/test/integration/observability/request-log-retention.test.mjs`, `packages/core/test/integration/observability/request-log-runtime.test.mjs`, `packages/core/test/unit/config/request-log-retention-config.test.mjs`, `packages/ui/test/component/observability.test.tsx`.

**Interfaces:**
- Produces: `RequestLogPage` gains `retentionDays?: number` (what the database holds, absent when it holds none) and `retentionRequestedDays?: number` (present only when this process asked for a value its writer has not confirmed).
- Produces in `shared/logs.ts`: `requestLogRetentionPendingNotice(requestedDays: number, storedDays: number | undefined): string`.

- [ ] **Step 1: Write the failing config test (L-10, B-7).** In `request-log-retention-config.test.mjs`, replace the first test with `a stored retention that is not a whole number from 1 to 90 loads as 90, with a warning`:

  ```js
  for (const value of [500, 0, 2.7, -3, "30", null, Number.NaN]) {
    assert.equal(await loadWithRetention(value), 90, String(value));
  }
  assert.equal(await loadWithRetention(1), 1);
  assert.equal(await loadWithRetention(90), 90);
  assert.equal(await loadWithRetention(30), 30);
  ```

  Capture `console.warn` around the loop and assert at least one call whose text matches `/request log retention/i`. The warn-once flag means only the first bad value warns, which "at least one" allows. The second test, a config with no retention loading the default 7, stays. The audit ran `NaN` through `replacePersistedAppConfig`: it loads like `null`, so it stays in the list. Today's values, run by the audit: 500 gives 90, 0 gives 1, 2.7 gives 2, -3 gives 1, and `"30"`, `null` and `NaN` give 7.

- [ ] **Step 2: Implement it in `parseObservability`.** The rule: a `requestLogRetentionDays` that is `undefined` is left out, so the default applies. Any other value that is not an integer from `minRequestLogRetentionDays` to `maxRequestLogRetentionDays` becomes `maxRequestLogRetentionDays`. Warn once per process, with a module-level flag as `warnedMalformedRefusedKeyMessage` in `gateway-service.ts` has, because `loadAppConfig` runs on every RPC. The warning names the value read and says 90 days is used.

- [ ] **Step 3: Write the failing store and runtime tests.**

  In `request-log-retention.test.mjs`, `a page states the retention the database holds`:

  ```js
  const store = open();
  assert.equal((await store.list({})).retentionDays, undefined);
  await setDays(store, 12);
  assert.equal((await store.list({})).retentionDays, 12);
  ```

  In `request-log-runtime.test.mjs`, model on `RequestLogRuntime saves a retention value the writer died before saving once a new writer is ready`, whose fixture wraps the worker file.

  `RequestLogRuntime sends an unchanged retention to the writer once` (L-9): the wrapper appends a line to a file for each `setRetentionDays` message. Call `setRetentionDays(7)` twice and `setRetentionDays(8)` once, and assert the file holds two lines. This test passes on today's code (audit C5, read). It pins behaviour that Step 7 must keep, so it is not one of the failing tests.

  `RequestLogRuntime says which retention it asked for while the database holds another`: no wrapper. A wrapper that throws ends the worker thread, the runtime restarts the writer, and its `ready` handler resends the value, so the pending state either crash-loops or races the restart (audit B2, read). Hold a lock instead, as Step 6 does. Use a plain runtime on the compiled `workerFile`. Call `setRetentionDays(7)`, then `runtime.list({})` once, so the query worker has opened the database. Open the database with `createBetterSqliteDatabase` and run `BEGIN EXCLUSIVE`. `await assert.rejects(runtime.setRetentionDays(30), /locked/)`, which takes about 5.2 seconds, the writer's `busy_timeout`. While the lock is held, the page has `retentionDays` 7 and `retentionRequestedDays` 30. `ROLLBACK`, call `setRetentionDays(30)` again, and the page has `retentionDays` 30 and no `retentionRequestedDays`. Also assert `runtime.metrics().writerRestarts` is 0.

  Run on today's code with a throwaway test, 2026-11-24: the database is in WAL mode, the write under the lock rejected with `database is locked` after 5226 ms with no writer restart, a warm query worker listed under the lock in 0 ms, and after `ROLLBACK` a second `setRetentionDays(30)` stored 30. A query worker first opened under the lock failed: its open runs a migration that writes, which waited out its own busy timeout and threw `database is locked`. So the warm-up `list` is required.

- [ ] **Step 4: Implement the page fields.**
  - `contracts/app.ts`: add the two optional fields to `RequestLogPage`, in alphabetical place.
  - `RequestLogStore.list` adds `retentionDays` from `readRequestLogRetentionDays(database)` when it is defined. That function already returns `undefined` for a missing or out-of-range stored value.
  - `RequestLogRuntime.list` adds `retentionRequestedDays: this.requestedRetentionDays` to the page when `requestedRetentionDays` is defined and differs from `savedRetentionDays`. It does not compare with the page's `retentionDays` (see "Where the comparison is made").
  - `createEmptyRequestLogPage` in `packages/ui/src/pages/home/shared/usage.ts` and the test fixture `emptyLogPage` need no change, because both fields are optional.

- [ ] **Step 5: Write the failing view test.** In `observability.test.tsx`, `LogsView states the database's retention and says when another was asked for`. Render `LogsView` with `retentionDays={7}` and these pages:

  ```tsx
  assert.match(render({ ...emptyLogPage, retentionDays: 12 }), /Request logs are kept for 12 days\./);
  assert.doesNotMatch(render({ ...emptyLogPage, retentionDays: 12 }), /has not been applied/);
  const pending = render({ ...emptyLogPage, retentionDays: 12, retentionRequestedDays: 3 });
  assert.match(pending, /Request logs are kept for 12 days\./);
  assert.match(pending, /role="alert"[^>]*>Settings ask for 3 days\. That has not been applied to the log database yet\. Saving any setting tries again\./);
  const none = render({ ...emptyLogPage, retentionRequestedDays: 3 });
  assert.match(none, /Settings ask for 3 days\. The log database has no retention yet, so it keeps every row\. Saving any setting tries again\./);
  assert.doesNotMatch(none, /Request logs are kept for/);
  assert.match(render(emptyLogPage), /Request logs are kept for 7 days\./);
  ```

  The existing test `LogsView says how long request logs are kept only when it is given the retention` stays green: a page without either field falls back to the prop.

  Then implement. `LogsView` takes the stated number as `page.retentionRequestedDays !== undefined ? page.retentionDays : page.retentionDays ?? retentionDays`, and uses the same number where it disables date ranges longer than the retention. The prop is the config's value, which after a save is the value just asked for. A page that says a value is pending and the database holds none must not fall back to it, or it would read "kept for 3 days" beside "the log database has no retention yet" (fix round, read). When `page.retentionRequestedDays` is defined it renders `requestLogRetentionPendingNotice(page.retentionRequestedDays, page.retentionDays)` in a `role="alert"` line under the retention line, with the two sentences above. `App.tsx` needs no change.

- [ ] **Step 6: Write the failing save test (L-9, L-8b, Review Focus 5).** New file `request-log-retention-save.test.mjs`. Copy the header of `web-management-server.test.mjs` that sets the three `LLMR_INTERNAL_*` variables to a temp directory before any import and restores them in `after`, and its `rpc` helper. One test, `a --no-gateway start and a save both write the retention, and a locked log database does not hold a save up`:
  1. Set `requestLogRuntime.options.workerFile = path.resolve(__dirname, "../../../runtime/request-log-worker.js")`, the line `october-issues-wire.test.mjs` uses. `build/test.mjs` builds that file.
  2. Save a config with `observability.requestLogRetentionDays = 5` through `saveAppConfig`, then `startWebManagementServer({ authToken, host: "127.0.0.1", port: 0, startGateway: false })`.
  3. Open `REQUEST_LOGS_DB_FILE` with `createBetterSqliteDatabase` (`@llmr/core/storage/sqlite-native.ts`). Poll until `SELECT value FROM request_log_settings WHERE key = 'retention_days'` gives `"5"`. Then call `getRequestLogs` once through `rpc`, so the query worker opens the database before any lock (see Step 3's run).
  4. Stub `gatewayService.start` and `gatewayService.updateConfig` as the test `startGateway reuses an already healthy LLMR gateway on the configured port` stubs `start`, and restore both in `finally`. Save `requestLogRetentionDays: 12` with `rpc(runtime.url, authToken, "saveConfig", [config, { applyProfile: false }])`. Poll until the stored value is `"12"`.
  5. Run `BEGIN EXCLUSIVE` on the test's own connection. Save `3` and time the call:

     ```js
     assert.ok(elapsedMs < 2000, `save took ${elapsedMs} ms`);
     assert.equal((await loadAppConfig()).observability.requestLogRetentionDays, 3);
     const page = (await rpc(runtime.url, authToken, "getRequestLogs", [{}])).value;
     assert.equal(page.retentionDays, 12);
     assert.equal(page.retentionRequestedDays, 3);
     ```

     The read works under the lock because the database is in WAL mode and the query worker is already open (run, Step 3).
  6. `ROLLBACK` at once after those reads. The write started under the lock may still land, or may have given up after the writer's 5-second busy timeout, which nothing in the test controls (audit C9). So save `3` once more through `saveConfig`: requested and saved still differ, so the runtime sends it again. Then poll until the stored value is `"3"`, with a 10-second bound and a message that names the busy timeout. Read the page again, and assert `retentionDays` is 3 and `retentionRequestedDays` is `undefined`. This also pins "Saving any setting tries again".
  7. Close the database and the server in `finally`.

  Run it. Expected: it fails at the 2000 ms assertion, at about 5200 ms.

- [ ] **Step 7: Stop the save waiting.** In `saveConfig` in `management-server.ts` and in the `appSaveConfig` handler in `ipc.ts`, `await applyRequestLogRetentionDays(...)` becomes `void applyRequestLogRetentionDays(...)`, as both `startConfiguredServices` functions already call it. `applyRequestLogRetentionDays` catches and logs its own failure, so the promise cannot reject unhandled. Nothing after that line in either handler reads the log database. The lines are `management-server.ts:513` and `ipc.ts:335` at `c491eb48` (read). A save followed at once by a quit loses nothing, because the config holds the value and the next start applies it (audit N6, read).

  In `observability.md`, the `requestLogRetentionDays` row says a stored value that is not a whole number from 1 to 90 is read as 90, with a warning.

- [ ] **Step 8: Run the tests and the gates.** The four core test files, `observability.test.tsx`, then `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`, `npm run test:ui`, `npm run test:electron`. Expected: all pass.

- [ ] **Step 9: Commit.** `fix(logs): state the retention the log database holds, and keep a save from waiting on it`

  **VM check, for the end pass.** None needed: every behaviour here is covered in the harness. The Electron save handler has no harness, so the end pass saves a retention in the released app once and sees the Logs page state it.

---

### Task 4: Fix four Logs and feedback layout faults (L-7, L-12, L-14, L-15)

With request logs off, the card's shadow is cut flush at the card's edges. In a window 720 px wide or narrower, the save toast sits on the navigation buttons and takes their clicks for 3 seconds after every save. A long value in an expanded log row is cut off and readable only by hovering with a mouse. `feedback.tsx` carries two branches no call site can reach.

Build in this order: L-15 first, because it removes code that L-12 would otherwise edit. The task lands as one commit on the batch 12 branch, as the delivery index wants. Steps 1 to 4 each still end in a test that fails before its change.

**Read, not run:** every layout number in the research is computed from class names and estimated font widths. Step 6 is the measurement. The class strings in Steps 2 and 4 are the plan author's proposal and were not rendered. If a measurement fails, change the classes until the numbers hold. The numbers are the requirement.

**Not in this task.**
- The request line in the expanded row's header, which is also `truncate` with a `title`. It shows the path, and the full URL is in the request details below it.
- Dark mode, Windows and Linux.

**Files:**
- Modify: `packages/ui/src/pages/home/components/feedback.tsx`, `packages/ui/src/pages/home/components/network-logs.tsx`, `packages/ui/src/pages/home/App.tsx`.
- Test: `packages/ui/test/component/ux-feedback.test.tsx`, `packages/ui/test/component/observability.test.tsx`.

**Interfaces:**
- Produces: `PersistenceFeedback` and `LightToast` lose their `contained` prop.

- [ ] **Step 1: Delete the unreachable branches (L-15).** The only `PersistenceFeedback` call passes `contained={!settingsOpen}` and `inline={settingsOpen}`, and the only `LightToast` call passes `contained`. Confirm with `grep -rn "PersistenceFeedback\|LightToast" packages/ui/src`: two call sites, both in `App.tsx`. Remove the prop from both components. `PersistenceFeedback` keeps two cases, `inline` and the contained classes. `LightToast` keeps `max-w-full`. Remove `contained` from the two call sites and from the two elements in `global feedback stack keeps save feedback and toast notifications at the top`. Add to `ux-feedback.test.tsx`, in `failed saves expose an actionable alert and collapsed diagnostic details`:

  ```tsx
  assert.doesNotMatch(html, /class="[^"]*fixed/);
  ```

  It fails before the deletion, because that test renders the default branch, which is `fixed ... top-5`. Run `ux-feedback.test.tsx` and `npm run typecheck`. The call sites are `App.tsx:3173` and `App.tsx:3605` at `c491eb48` (read).

- [ ] **Step 2: Move the feedback stack to the bottom in the compact layout (L-12).** In `ux-feedback.test.tsx`, rename `global feedback stack keeps save feedback and toast notifications at the top` to `global feedback stack sits at the top, and at the bottom in the compact layout`, and add:

  ```tsx
  assert.match(html, /fixed left-1\/2 top-14[^"]*max-\[720px\]:top-auto[^"]*max-\[720px\]:bottom-3/);
  ```

  See it fail, then add `max-[720px]:top-auto max-[720px]:bottom-3` at the end of `FeedbackStack`'s class string. The existing `doesNotMatch(html, /bottom-4/)` stays.

- [ ] **Step 3: Let a long log value wrap (L-14, B-8, X-12).** In `observability.test.tsx`, replace `LogExpandedDetails keeps a gap between summary columns and titles each value` with `LogExpandedDetails keeps a gap between summary columns and wraps a long value`:

  ```tsx
  const html = renderToStaticMarkup(<LogExpandedDetails entry={{ ...sampleRequestLogEntry, requestId: "r".repeat(200) }} />);
  assert.match(html, /network-body-meta[^"]*gap-x-4/);
  const value = firstMatch(html, new RegExp(`<div class="[^"]*"[^>]*>${"r".repeat(200)}<`));
  assert.match(value, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(value, /truncate|title=/);
  ```

  See it fail, then change the value `div` in `LogMetric`: `truncate` becomes `[overflow-wrap:anywhere]` and the `title` attribute goes. The label `div` keeps `truncate`, because every label is a short fixed string. `LogMetric` is at `network-logs.tsx:1424` at `c491eb48` (read). The pricing plan's Task 5 later adds a "Price source" `LogMetric`, which inherits the wrap.

- [ ] **Step 4: Give the scroll wrapper its padding back (L-7).** In `observability.test.tsx`, add to `LogsView keeps disabled request logs discoverable with an enable action`:

  ```tsx
  const wrapper = firstMatch(html, /^<div class="[^"]*"/);
  assert.match(wrapper, /overflow-y-auto/);
  assert.match(wrapper, /(^|[" ])-m-5 /);
  assert.match(wrapper, / p-5[ "]/);
  ```

  See it fail. A scroll container clips a child's shadow at its own padding edge, and the wrapper PR 145 added has no padding. Before PR 145 the card sat directly in the content area, whose `px-5 pb-5 pt-5` gave the shadow 20 px. The wrapper takes that room back by covering the content area's padding with its own. Proposed class string, replacing the wrapper's current one in the `!enabled` branch of `LogsView`:

  ```
  -m-5 flex h-[calc(100%+2.5rem)] min-w-0 flex-col overflow-y-auto p-5 max-[720px]:-m-3 max-[720px]:h-[calc(100%+1.5rem)] max-[720px]:p-3
  ```

  It drops `network-view`, whose only rule is `height: 100%; max-height: 100%`, which would cancel the taller box. The rule sits in `globals.css`'s `@layer utilities`, after Tailwind's own utilities, so it would beat `h-[calc(...)]` (read by the audit). `MonitorDisabledView` keeps `network-view` on its own root.

- [ ] **Step 5: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:ui`. Expected: all pass. Commit: `fix(ui): Logs and feedback layout in narrow windows`.

- [ ] **Step 6: Measure in a browser check.** This is a check an agent runs with the `chrome-devtools-mcp:chrome-devtools` tools against the branch's built app in an isolated home. It is not a VM check, and the VM pass does not gate it. This is how PR 145's notice was measured (v8 plan, Task 12, "As built"): the built app in an isolated home, with the window sizes emulated. It also runs Task 2, Step 8's measurement again on this branch, because Task 3 changed the page above the notice.
  1. `npm run build:assets`, then `git checkout -- packages/core/models.json packages/ui/src/generated`.
  2. Make a marker file, then start the app with `LLMR_INTERNAL_HOME_DIR="$(mktemp -d)" node_modules/.bin/electron . --remote-debugging-port=9333`. `LLMR_INTERNAL_HOME_DIR` alone isolates every write since PR 13. Afterwards, show that nothing under the real home's LLM Router, Claude Code or Codex folders is newer than the marker.
  3. Drive it through the `chrome-devtools-mcp:chrome-devtools` skill on port 9333. Set each size with `emulate` and confirm `innerWidth` before measuring. Finish onboarding with a provider whose base URL is a local stub server on `127.0.0.1`, and skip the agent step.
  4. **L-7, at 1280x800, request logs off, Logs page.** Let `w` be the wrapper, found as `document.querySelector(".network-shell").closest(".network-view").parentElement`. It is not the content area's first child: the content area renders `MainViewSwitch`, whose `ViewMotionShell` (`shared/motion.tsx`, a `motion.div` with `h-full min-h-0`) sits between them, so the first child would measure 0 on every side (audit C4, read). Wait for the view's entry animation to end before measuring, because it scales the shell. Let `c` be `.network-shell`. Pass: `c.left - w.left`, `w.right - c.right`, `c.top - w.top` and `w.bottom - c.bottom` from `getBoundingClientRect()` are each 20, and `w.scrollHeight === w.clientHeight`. At 700x800 the four numbers are each 12. Take a screenshot at each size. The shadow fades out below and beside the card with no straight cut.
  5. **L-12, at 700x800, sidebar open.** Press **Enable request logs**, which saves. While "Changes saved." shows, let `t` be the rect of the `fixed` feedback stack and `n` the rect of each `nav button`. Pass: `t.top >= n.bottom` for every button, and `innerHeight - t.bottom` is 12. At 1280x800 `t.top` is 56, as before.
  6. **L-14, at 1280x800, request logs on.** Send one chat completion whose `model` is 200 characters long. It is refused with 400 and gets a row. Expand the row. Let `m` be the value element of the Model metric. Pass: `m.scrollWidth <= m.clientWidth`, `m.getBoundingClientRect().height > 20`, `m.title === ""`, and `document.querySelector(".network-body-meta").scrollWidth <= document.querySelector(".network-body-meta").clientWidth`. Take a screenshot for the owner, because a 200-character value in a narrow column is tall.
  7. Close every page the check opened, and quit the app.

  Record the numbers and the screenshots in the PR. Not covered: dark mode, a real window resize, Windows and Linux.

  **VM check, for the end pass.** On the released app, with a real window resized to about 700 px: the save toast clears the navigation, the card's shadow has no straight cut with request logs off, and a long model value wraps in an expanded row.

- [ ] **Step 7: Open the batch 12 PR.** Branch `fix/logs-page`, one commit for Task 3 and one for Task 4, squash-merged. Title: `fix(logs): state the stored retention, and fix the Logs and feedback layout in narrow windows`.

---

## Hand-off to the client label plan

**Rows it carries:** L-5, and the research's finding that the client label is uncut outside the refused-key notice and that `x-forwarded-client-cert` is one of its sources. B-5 is decided, and [`2026-11-22-backlog-client-label.md`](../2026-11-22-backlog-client-label.md) builds it as batch 16, after this plan. No task above changes `inferGatewayClient`, `clientNameHeaders`, or the length of a stored client label.

**What that plan consumes from this one:** the third parameter `configure?: (config) => void` of `startWireService` (Task 2, Step 4), and the reason `Invalid API key.` (Task 2). It also rewrites `raw trace usage capture keeps the client label the request log gets` and says to give the copies Task 1 makes the same change.

**Files the later task will touch, and what this plan changed in them.**

| File | What the B-5 task will change there | What this plan already changed there |
|---|---|---|
| `packages/core/src/gateway/http/io.ts` | `clientNameHeaders` and `inferGatewayClient` | Nothing |
| `packages/core/src/gateway/auth/refused-key-requests.ts` | `refusedKeyRequestEntry`, which calls `inferGatewayClient(undefined, input.headers)` | Nothing |
| `packages/core/src/observability/raw-trace-sync.ts` | The `inferGatewayClient` call in `readRawTraceRequestLogBundle` | Task 1: `scanSourcesSoon`, the wanted-scan branch in `replayStoredBundles`, and `createdAt` in `recordUsageCaptureFromRawTrace` |
| `packages/core/src/gateway/request/pipeline.ts` | The `inferGatewayClient(apiKey, request.headers)` call | Nothing |
| `packages/core/src/observability/request-log-store.ts` | The fallback `inferGatewayClient` call in `record()`, and any cut of the label | Task 3: `retentionDays` on the page `list` returns |
| `packages/core/src/gateway/core-runtime/router-plugin.ts` | The `headers` the hook passes to the refused-key publisher | Task 1: the trace-ready publisher and its call in the ack route. Task 2: `resolvePublicGatewayAuth` returns reasons from `checkApiKeyToken` |
| `packages/core/src/gateway/auth/api-key-authorizer.ts` | Nothing. The client label plan keeps `authorize` passing `request.headers`, and its refused-caller rule lives in `refusedKeyRequestEntry` | Task 2: `checkApiKeyToken`, `apiKeyRefusalReasons`, and `authorize` and `resolveApiKeyFromHeaders` built on them |
| `packages/core/test/integration/gateway/october-issues-wire.test.mjs` | A loop over layouts that uses `startWireService(t, layout, configure)` | Task 1: three new tests and a wider `SELECT`. Task 2: the third parameter, the expired-key loop and the `Invalid API key.` reason |
| `packages/core/test/unit/gateway/refused-key-requests.test.mjs` | A test for the label of a refused caller | Task 2: two sample reasons |
| `packages/core/test/unit/observability/raw-trace-sync.test.mjs` | `raw trace usage capture keeps the client label the request log gets`, which pins an email address as the label | Task 1: five new tests, three of them copies of that test with a different assertion |
| `packages/core/src/usage/store.ts` | Nothing named. The pricing plan (batches 13 to 15) changes `recordCapture` and `UsageCaptureInput` after this plan | Task 1: `UsageCaptureInput.createdAt` and `setProviderIfUnknown` |
| `packages/ui/src/pages/home/components/network-logs.tsx` | Nothing expected | Task 2: the notice's `<details>`. Task 3: the retention lines. Task 4: `LogMetric` and the disabled-state wrapper |

## Open with the owner

Nothing in this plan waits on a decision. Each point below has a default, which is built unless he says otherwise.

- **The single layout's 401 body keeps the fork's prefix.** After Task 2 a refused key reads `Gateway plugin "llmr-public-auth-context" beforeAuth failed: API key is expired.` from the gateway child and `API key is expired.` from LLM Router's own front. The reason text is one set, which is what L-4 asked for. A bare body in both layouts needs a fork change to how `beforeAuth` errors are wrapped, a fork push and tag, and a pin bump. Default: keep the prefix. Recommendation: keep it, because a caller reads the reason either way, and a fork release for wording is out of proportion.
- **Which events a trace may name a provider for.** Task 1 fills in `unknown` only on an event with no tokens and no cost. The other way is to fill it in on every `unknown` event and reprice in the same write. Default and recommendation: the narrow rule, because only refused requests need it (L-1) and repricing belongs to the pricing plan's batches.

One more point for the owner to see, which blocks no task: Task 2 Step 8 expects the refused-key notice to be one line at 1280 px and two lines at 760 px with the sidebar open, because the sentence itself is wider than the notice there by estimate. One line at every width needs a shorter sentence, for example "5 requests were refused for their API key since LLM Router started." The plan keeps today's sentence.
