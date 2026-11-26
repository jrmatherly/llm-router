# Request Log Flush and Cleanup Test Faults Implementation Plan

> **Status, 2026-11-26 (UTC): merged as [PR 165](https://github.com/jrmatherly/llm-router/pull/165), squash commit `bf7425d7`.** The Windows entry passed on all three pushes of the branch with no rerun. The task bodies below describe the code as planned. Review changed these things from the steps below:
> - Two of Task 1's tests would have failed on a slow runner. A mutation and load review ran them under a preload that delays timers: the unhandled-rejection test failed with the main thread's timers about 100 ms late, and the writer-error test with the worker more than a second late. Both now wait on events. The fixture holds its `flush` reply until the next batch arrives, the writer-error test has a 60 second budget, and no test sleeps a fixed time. A review of that round ran the six flush tests 270 times under lag and 40 under load with no failure.
> - Two tests were added for mutants that survived: a flush that finishes in time leaves no timer behind, and a record queued while a flush waits on its checkpoint counts as pending.
> - Task 2 also changes the wire test's `stopGateway`. It waits for the child's exit after the forced kill, where it returned at once, and rejects naming the child if no exit comes within five seconds. A gateway child that outlived the stop could hold the same `config.sqlite`, and the wider cleanup list would have hidden it.
> - The comment on the race says that the checkpoint or the writer work ahead of it may still be running, and Task 3's assert carries the flush result in its message.
>
> Not done: anything on Windows outside CI.

> **Status before the build, 2026-11-26 (UTC): audited once on another model at `main` `19d6aeb6` by building all three tasks from the text, and corrected. Nothing is built.** A pushed plan changes no code. The audit checked every line of Evidence against the code and all held. It found one Blocker and three Corrections in Task 1's tests, all applied below and marked "audit": the first test could not tell one budget from two, a mutation named dead code, a command ran a skipped test, and the fixture pointer named the wrong test. With its own corrected test the audit's build passed typecheck, lint, the architecture suite and `npm run test:core` (2219 tests, 0 fail), and its new tests passed 40 runs in a row on macOS. The budget test below was redesigned after the audit to assert no elapsed time, and that version has not been built.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A red Tests run means a real defect, so no PR and no release waits on a rerun for a test that failed on its own timing.

**Architecture:** Two faults, three tasks, one branch `fix/request-log-flush-budget`, one squash-merged PR, one commit per task. Task 1 changes eight or so lines of product code in `RequestLogRuntime.flush`, which no product path waits on. Tasks 2 and 3 change tests only.

**Tech Stack:** TypeScript, `node:test` with `node:assert/strict`, `better-sqlite3`.

**Where this sits.** Outside the batches of [`2026-11-25-delivery-order.md`](../2026-11-25-delivery-order.md), on the owner's word of 2026-11-25, before batch 7. It closes that file's finding "A request log `flush()` throws when its checkpoint takes over the caller's budget" and the Windows cleanup failure recorded beside PR 164. The third fault of that day, two backups in one millisecond sharing a file name, is row S-15 and stays in batch 7.

## Evidence

Labels: run (executed), read (read in the code or a log), inferred.

**Fault 1. `Request log operation timed out after 1000ms`.**

- Failed the Windows job twice on PR 164 (runs `45736093268` and `45739535062`), in five tests of three files: `october-issues-wire.test.mjs`, `recent-issues-wire.test.mjs` and `request-pipeline-cost-parity.test.mjs` (read). Earlier on Ubuntu in run `45632829586`, and reproduced then in a Linux container with a capped disk (the delivery order's finding).
- `RequestLogRuntime.flush` in `packages/core/src/observability/request-log-runtime.ts` waits twice. A queue that does not drain within `timeoutMs` returns `{ timedOut: true }`. A queue that drains is followed by the writer's `flush` RPC under a second, full `timeoutMs`, and when that is slow `withTimeout` throws (read). So one call can take up to twice its budget and then throw.
- Reproduced on macOS by the diagnosis (run): with a fixture worker that answers `flush` after 300 ms, `flush({ timeoutMs: 100 })` rejected with that message after 113 ms.
- The RPC is `wal_checkpoint(PASSIVE)`, queued on the writer's one serial chain behind any batch or pricing page already queued (read). Which part is slow on a Windows runner was not measured.
- No file under `packages/*/src` calls `flushRequestLogRuntime` (run, `grep`). The one product caller of `flush` is `close()`, which already discards a rejection (read). Nothing relies on the throw.
- The callers are tests. Most call it inside a longer wait that would retry on `timedOut`, and a throw aborts the test instead.

**Fault 2. `Windows will not remove ...\data\llm-router\config.sqlite ...: something still holds it open`.**

- Failed the Windows job on `06ea2534` (run `45742156106`) and once before (run `45695259003`), both in `recent issues: production HTTP, tool replay, logs and usage SQLite` (read). The test body had finished: every diagnostic printed, and the `finally` failed in `removeTestDir(root, ["usage.sqlite", "unused.sqlite"])`.
- The holder is the test process (run on macOS by the diagnosis: a stack logged at open, and `lsof` at cleanup showed only the test's pid holding the file). The test's replay requests to the unpriced model `native` reach its `RawTraceSynchronizer`, `UsageStore.record` starts a price-catalog load, each catalog fetch reads the proxy setting through `loadAppConfig`, and that opens the module's `configRepository`, which is opened once per process and has no close.
- The logs agree (read, checked again for this plan): the three refused price-catalog connections tagged `recent-issues-wire.test.js` are in the failing Windows log and in none of the three passing or otherwise-failing Windows logs at hand. They are in every Linux and Intel Mac run, where an open file does not stop a removal.
- Why the trace usually arrives too late on Windows to open the file before cleanup is inferred.
- Two tests already name `config.sqlite` for this same handle: `web-management-server.test.mjs` and `model-catalog-startup.test.mjs`.

## Decisions

- **The flush fix is one budget, and a slow checkpoint is reported, not thrown.** A real writer error still rejects.
- **Fault 2 is fixed by naming the database in the test's cleanup**, not by closing the handle. The handle is the process's one config repository, it is released when the test process exits, and the folder is inside the test home that the runner removes afterwards. Giving `native` a price in the fixture would also stop the load, but it changes what the replay case exercises, and a later change to pricing could bring the load back.
- **No retry is added to any test.** A test that already retries on `timedOut` needs no change once the throw is gone.

## Global Constraints

- The fork has no consumers. No compatibility path.
- Double quotes, semicolons, two-space indent. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour.
- One test file: `node build/test.mjs core && node --test .test-dist/core/test/<unit|integration>/<path>.test.js`. Do not pass `--scope`.
- Read a file with Read before you change it.
- Before each commit: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`.
- Merging needs the owner's word.
- The repository is public. Describe a change by what the code does.

---

### Task 1: Give a flush one budget, and report a slow checkpoint as timed out

**Files:**
- Modify: `packages/core/src/observability/request-log-runtime.ts` (`flush`)
- Test: `packages/core/test/integration/observability/request-log-runtime.test.mjs`

**Interfaces:**
- `flush(options: { timeoutMs: number }): Promise<{ pending: number; timedOut: boolean }>` keeps its signature. The rules after this task:
  - One deadline is taken when `flush` is entered. The drain wait and the writer's `flush` RPC share it. The RPC gets what is left, at least 1 ms.
  - When the RPC has not answered by the deadline, `flush` resolves with `timedOut: true`. It does not reject.
  - When the RPC rejects before the deadline, `flush` rejects with that error, as today.
  - An RPC left behind at the deadline can still reject later. That rejection is handled, so it never reaches the process as an unhandled rejection.
  - The timer is cleared or unreferenced, so a resolved `flush` holds no process open.
  - `pending` is computed as today.
- `withTimeout` stays as it is. `shutdownWorker` uses it.

- [ ] **Step 1: Write the failing tests** at the end of `request-log-runtime.test.mjs`, in the style of the fake-worker test near line 1005 (`delayed-ack-worker.cjs`), which answers the worker protocol itself. The fixture test near line 1192 wraps the real worker and cannot delay one RPC (audit). Build each runtime with `createRequestLogRuntime({ batchMaxWaitMs: 1, dbFile, workerFile: fixture })`, not `createRuntime`, which forces its own `workerFile`. Start the writer first with `enqueueRecord` and wait for `metrics().committed === 1`, because a runtime with no writer and an empty queue returns before any RPC. Close each runtime in `finally` with a short `timeoutMs`. No test here asserts an elapsed time.

  - `a flush whose checkpoint outlasts its budget reports timedOut and does not throw`. The fixture answers every RPC at once except `flush`, which it answers after 2000 ms. `await runtime.flush({ timeoutMs: 100 })` resolves to an object whose `timedOut` is `true`.
  - `the drain and the checkpoint of a flush share one budget`. The fixture acknowledges a batch after 2000 ms and answers `flush` after 2000 ms. After the warm-up, enqueue one more record, then `await runtime.flush({ timeoutMs: 3000 })` resolves with `timedOut: true`: the drain uses 2000 ms and the checkpoint cannot answer in the 1000 ms left. With a fresh 3000 ms for the checkpoint it would answer in time and `timedOut` would be `false`. Each side has about 1000 ms of slack, so a slow runner does not change the result. The audit showed that with an empty queue the drain takes no time and the two rules cannot be told apart.
  - `a flush whose writer reports an error still rejects`. The fixture answers `flush` with an error. `await assert.rejects(runtime.flush({ timeoutMs: 1000 }), /<the fixture's error text>/)`.
  - `a checkpoint that fails after its flush timed out is not an unhandled rejection`. The fixture answers `flush` with an error after 150 ms. Register `process.once("unhandledRejection", ...)` to record any, call `flush({ timeoutMs: 50 })`, expect `timedOut: true`, wait 400 ms, and assert nothing was recorded. Remove the listener in `finally`. A slower fixture cannot turn this red, because the late rejection is handled whenever it comes.

- [ ] **Step 2: Run them and see them fail.**

Run: `node build/test.mjs core && node --test --test-name-pattern="checkpoint|share one budget|writer reports an error" .test-dist/core/test/integration/observability/request-log-runtime.test.js`
Expected: the first test FAILS with `Request log operation timed out after 100ms.` The second FAILS with `timedOut` false. The third PASSES already, and pins that a real error keeps rejecting. The fourth FAILS, rejecting with `timed out after 50ms` (audit, run).

- [ ] **Step 3: Change `flush`.** Take `const deadline = Date.now() + Math.max(1, options.timeoutMs)` before `schedulePump`. Keep the drain wait. Replace the `withTimeout(this.writerRpc("flush", []), ...)` call with a `Promise.race` between the RPC and a timer for `Math.max(1, deadline - Date.now())` that resolves, not rejects, and is cleared afterwards. Return `timedOut: !drained || <the timer won>`. `Promise.race` already handles the promise that loses, so no extra `catch` is needed (audit, run). One comment, on why a slow checkpoint is reported and not thrown.

- [ ] **Step 4: Run the tests.** All four pass. Then the whole file: `node --test .test-dist/core/test/integration/observability/request-log-runtime.test.js`. An existing test that expected the throw is a finding to report, not a value to edit.

- [ ] **Step 5: Break it twice.** Give the RPC a fresh `options.timeoutMs` in place of what is left, and confirm the second test fails with `timedOut` false. Add `void checkpoint.then(() => undefined);` beside the race, where `checkpoint` is the RPC promise, and confirm the third and fourth tests fail (the audit ran this one). Put both back. Then run the four new tests 20 times in a row and report any failure.

- [ ] **Step 6: Run the gates and commit.** `fix(request-log): give a flush one budget, and report a slow checkpoint as timed out`

---

### Task 2: Name the config database in the recent-issues test's cleanup

**Files:**
- Modify: `packages/core/test/integration/gateway/recent-issues-wire.test.mjs` (the `removeTestDir` call in its `finally`)

- [ ] **Step 1: Change the call** to `removeTestDir(root, ["config.sqlite", "usage.sqlite", "unused.sqlite"])`, with one comment above it: a price-catalog load for the unpriced `native` model opens the process's config repository under `root`, and it stays open until the test process exits.

- [ ] **Step 2: Run the file.** After a build, `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" node --test .test-dist/core/test/integration/gateway/recent-issues-wire.test.js`. Without that variable the test is skipped, and only CI sets it (audit). It passes on macOS before and after, because only Windows refuses to remove an open file. The evidence that it failed is the two Windows runs above. Say so in the PR.

- [ ] **Step 3: Run the gates and commit.** `test(core): name the config database the recent-issues wire test leaves open`

---

### Task 3: Make the one flush caller that reads once say when its flush timed out

`local-agent-provider-claude-code.test.mjs` flushes with a one-second budget and reads the row count once, ignoring the result. A drain that outlasts the budget returns `timedOut: true` today, and after Task 1 so does a slow checkpoint. The test would then compare a stale count and fail with a message about counts.

**Files:**
- Modify: `packages/core/test/unit/agents/local-agent-provider-claude-code.test.mjs` (the `rows` helper near line 92)

- [ ] **Step 1: Change `rows`** to flush with a budget of 10 seconds and assert on the result:

```js
const rows = async () => {
  const flushed = await flushRequestLogRuntime(10_000);
  assert.equal(flushed.timedOut, false, "the request log did not flush in 10 seconds");
  return (await getRequestLogs({ pageSize: 10 })).items.length;
};
```

A flush returns as soon as the queue is drained and the checkpoint answers, so the larger budget costs nothing on a fast machine.

- [ ] **Step 2: Run the file**, then check the other single-shot callers and change none of them: `claude-login-pass-through-wire.test.mjs:419`, `request-pipeline-cost-parity.test.mjs:101`, `recent-issues-wire.test.mjs:104` and `october-issues-wire.test.mjs:88`, `:201` and `:217` each sit inside an `until` loop that reads again (read for this plan and by the audit). If one does not, report it. Run those four files once with `LLMR_TEST_GATEWAY_ENTRY` set as in Task 2, since they are skipped without it.

- [ ] **Step 3: Run the gates and commit.** `test(core): fail the Claude Code provider test on a flush that timed out, not on a stale count`

---

## Not verified

- Whether `claude-app-vm-storage.test.mjs`, the one other test that removes a folder holding its app data directory with a plain `rmSync`, can open the config repository there. The audit read its imports and saw nothing that does, and did not trace it to the end.
- Anything on Windows. The proof of both fixes is the Windows entry staying green over the following pushes. Fault 1 showed in two of five runs on 2026-11-25 and fault 2 in two of about twenty.
- Why the checkpoint is slow on a Windows runner.
- Whether `config.sqlite` exists under the test's folder in a passing Windows run. The diagnosis names a probe that would settle it: in the `finally`, log whether `user/usage.sqlite` has a row for model `native` and whether `data/llm-router/config.sqlite` exists. It was not run, because a probe's Actions logs are public.
