# Four Test Faults Behind the Red Intel Mac Entry Implementation Plan

> **Status, 2026-11-25 (UTC): built and merged as PR 163 (`2b1c6916`).** The four tasks are one commit each, and a fifth commit fixed what the review found: a time limit on Task 1's warm-up hook, an architecture test that pins the runner's line from Task 3, and the port test's child processes claiming in the run's folder. The Intel Mac entry passed on both of the PR's runs. That does not prove the faults are gone, since each showed in one to four of thirteen jobs. Question 2 below is not answered. The text below is the plan as it was built from, after one audit: the audit found two Blockers, in Tasks 2 and 3, both tasks were rewritten, and the session ran the rewritten tasks. "Audit" at the end says what each round ran.

> **Delivery.** [`2026-11-25-delivery-order.md`](../2026-11-25-delivery-order.md) has no row for this plan. Its decisions 1 to 8 apply. The four tasks touch four test files, one test helper and the test runner, so they land as one branch, `fix/intel-mac-test-faults`, and one squash-merged PR with one commit per task. No product code changes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A green Intel Mac entry means the code is right and a red one means it is not, so `npm run release` is never refused for a test that failed on its own timing.

**Architecture:** Four separate faults in tests, each fixed where it is. None is a product fault. The runner is slow and its speed varies, which is what exposes them. Nothing here changes the workflow, raises a job timeout or marks a test as flaky.

**Tech Stack:** `node:test` with `node:assert/strict`, esbuild test bundles (`build/test.mjs`), `build/run-tests.mjs`, GitHub Actions `macos-26-intel`.

## Evidence

Each claim carries a label: run (CI) for a line read in an Actions log, run (local) for a command run on an Apple silicon Mac at `main` `8ea25ca3`, run (audit) for a command the audit ran in its worktree at the same commit, read for code that was read, inferred for a conclusion nothing ran.

Six Tests runs had a red Intel Mac entry on 2026-11-25. The logs of all six and of seven passing Intel Mac jobs were read.

| Run | Commit | What failed on the Intel Mac |
|---|---|---|
| `45684187505` | `237cf901`, PR 160's branch | Stream truncation tests, `no file under the data folder holds the login (compat)` |
| `45687915249` | `37ab5ba3`, `main` | Stream truncation tests, `route script workers distribute concurrent executions across available slots` |
| `45695259003` | `a18498fe`, `main` | `route script workers distribute concurrent executions across available slots` |
| `45703069195`, first attempt | `b0720eb4`, PR 162 | Stream truncation tests |
| `45705092956` | `f5c1d9eb`, `main` | Stream truncation tests |
| `45705299569` | `7a2f1711`, `main` | `the gateway child refuses an API key that has expired` |

**The runner's speed varies.** The core suite's own `duration_ms` ran from 127 to 413 seconds across these thirteen jobs for the same tests (run, CI).

**Two runs at once is not the cause.**

- PR 162's first attempt failed with no other Intel Mac job of this repository running. Its job ran from 21:18:35 to 21:25:44. The job before it was cancelled at 21:18:31 and the next began at 21:26:42 (run, CI).
- The runs for `1b09fc2d` and `b69fcde8` overlapped from 19:07:41 to 19:11:39 and both passed (run, CI).
- Each job runs on its own machine (read, `.github/workflows/test.yml`).

**Nothing here ran on an Intel Mac outside those logs.** Every local and audit run was on Apple silicon.

### Fault 1: the first stream test pays a cold start under a 5 second cap

- The first test of `stream-terminal-error-frame.test.mjs` took 1.7 to 3.1 seconds in the seven passing jobs and 5.2 to 8.8 seconds in the four failing ones. Its cap is `{ timeout: 5_000 }`. The same test for the next protocol takes about 70 ms (run, CI).
- Locally the first test takes about 490 ms and its siblings about 68 ms (run, local, three runs). A CPU profile puts about 378 ms of the first test under `findProviderModelCatalogEntry`: about 113 ms in `loadModelCatalogPayload` and about 190 ms building the catalog indexes (run, audit). The first request through `GatewayRequestPipeline` loads and indexes the model catalog, and the test that happens to run first pays for it.
- The rest is one cascade. Sixteen tests in the file make a request. In each failing job the first timed out and fourteen or fifteen of the others failed with `ECONNREFUSED` on the first test's port (run, CI). `proxyTruncatedStream` saves `globalThis.fetch` as `originalFetch`, replaces it, and puts it back in `finally` (read). `node:test` reports a timeout and starts the next test while the timed-out function is still running, so a later test saves the first test's replacement as its own `originalFetch`, and its requests go to the first test's server, which has closed. A 1 ms cap on the first test reproduces the cascade (run, audit).

### Fault 2: 50 ms of slack in the route worker test

- The test runs two scripts that each spin for 350 ms under `timeoutMs: 400`, on two workers, and expects both to return `ok`. Twice one returned `timeout` (run, CI).
- The spin ends on a wall-clock deadline set inside the script, so the script needs 350 ms of the 400 ms that `runInContext` allows. The worker's start and the script's compile come before that budget (read by the audit, `route-script-worker.ts`). The 50 ms left covers the call's preamble and any time the thread waits for a core. Two spinning workers, the test process and the other test files share four cores.
- **The test does not prove what its name says.** `RouteScriptWorkerSlot.rpc` waits for the slot's previous call before it starts its `timeoutMs + 250` timer (read, `route-script-runtime.ts`), so two calls on one worker both return `ok`, one after the other. With `workerCount: 1` the test passed three times of three, in about 720 ms (run, audit). The first draft of this plan claimed the opposite and its Task 2 was built on that. See "Open with the owner", question 2.

### Fault 3: two test processes can reserve the same port

- The failure was `Core gateway endpoint http://127.0.0.1:31487 is owned by a different runtime` (run, CI). `supervisor.ts` raises it when another LLM Router gateway answers `/health` on the port (read by the audit).
- `reserveLoopbackPort` picks a random port from 20000 to 31999, binds it, releases it, and records it in a `Set` (read, `packages/core/test/support/loopback-listener.mjs`). The `Set` lives in one process. Thirteen test files call the helper, and `node --test` runs each file in its own process, several at a time.
- Another file's gateway held 31487 when this file's gateway started on it (inferred. The log does not name the other file, and the audit found no path to the error inside one process).
- Two processes that each reserve 400 ports draw a shared one every time (run, audit, three of three).

### Fault 4: a 10 second wait for the request log

- `no file under the data folder holds the login (compat)` failed with `the request is logged and its trace bundle is ingested` false, after 14.8 seconds (run, CI). That job was the slowest of the day, with the core suite at 413 seconds.
- The assertion follows the file's one `until(...)` call, whose default wait is 10 seconds, inside tests whose own cap is 60 seconds (read).
- Locally the wait already uses about 4.7 of its 10 seconds, because new spool files are ingested in one batch at about 4.7 seconds (run, audit). `raw-trace-sync.ts` scans every 5 seconds (read by the audit. The link between the two is inferred). So the wait has room for about one scan more.
- Not checked: whether the predicate can stay false for good, for example when a bundle goes to the dead-letter folder. If it can, 30 seconds fails the same way and the task's Step 3 will not show it.
- This is not the fault recorded in the index as "A request log `flush()` throws when its checkpoint takes over the caller's budget". That one throws. This wait returned `false`.

## File structure

| File | Change |
|---|---|
| `packages/core/test/unit/gateway/stream-terminal-error-frame.test.mjs` | Warm the pipeline in a `before` hook. Keep one reference to the real `fetch`. |
| `packages/core/test/unit/routing/route-script-runtime.test.mjs` | A larger limit for one test. |
| `build/run-tests.mjs` | Give every test process of a run one folder for port claims. |
| `packages/core/test/support/loopback-listener.mjs` | Claim a port with a file in that folder. |
| `packages/core/test/unit/support/loopback-listener.test.mjs` | One test that two processes never get the same port. |
| `packages/core/test/integration/gateway/claude-login-pass-through-wire.test.mjs` | A longer wait at the one call that waits for the request log. |

Build the core tests with `node build/test.mjs core`, then run one file with `node --test .test-dist/core/test/<unit|integration>/<path>.test.js`. A fresh worktree needs `npm ci` first.

The gateway wire tests are skipped unless `LLMR_TEST_GATEWAY_ENTRY` is set, and CI sets it (read, `test.yml`). Without it a local `npm run test:core` skips 70 tests (run, audit). Tasks 3 and 4 run with:

```bash
export LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js"
```

## Task 1: the stream test's cold start and its cascade

**Files:** `packages/core/test/unit/gateway/stream-terminal-error-frame.test.mjs`

- [ ] **Step 1: show the cascade.** Give the first generated test a cap it cannot meet. In the loop below `positionNames`, change `options` to `protocol === "anthropic_messages" && index === 0 ? { timeout: 1 } : options` and run the file. Expected: the first test fails with `test timed out after 1ms` and most of the later request tests fail with `ECONNREFUSED`. The second test may pass (run, audit).

- [ ] **Step 2: keep one reference to the real `fetch`.** Add below the imports:

```js
// A test that outlives its cap is still running when the next one starts, so a
// fetch saved per test can be the previous test's replacement.
const realFetch = globalThis.fetch;
```

In `proxyTruncatedStream`, delete `const originalFetch = globalThis.fetch;` and use `realFetch` in the two places that used `originalFetch`.

- [ ] **Step 3: run the file with Step 1's cap still in.** Expected: the first test is cancelled on its cap and every other test passes (run, audit, three runs). A late `finally` of the timed-out test can still restore `fetch` under the test that is running at that moment. That limit is accepted: one timeout no longer reads as sixteen failures.

- [ ] **Step 4: warm the pipeline.** Import `before` from `node:test` beside `test`, and add below `truncationFixtures`:

```js
// The first request through a pipeline loads and indexes the model catalog.
// Paid here, it is not counted against the first test's cap.
before(async () => {
  await proxyTruncatedStream({ ...requestBodies.anthropic_messages, events: truncationFixtures.anthropic_messages[0] });
});
```

- [ ] **Step 5: prove the hook took the cost.** Change Step 1's cap from `1` to `250` and run the file three times. Expected: every test passes. `node:test` still adds the hook's time to the first test's reported duration, about 550 ms, but does not count it against the cap (run, audit). Without the hook the same cap fails. Then take the cap out, so the loop passes `options` again.

- [ ] **Step 6: run the file once more and commit.** `test(core): keep the stream test's cold start and a late timeout out of the other tests`

## Task 2: the route worker test's slack

**Files:** `packages/core/test/unit/routing/route-script-runtime.test.mjs`

This task removes the false failure and nothing else. It does not make the test prove that two workers ran side by side. It never did (Fault 2), and question 2 asks whether it should.

- [ ] **Step 1: raise the limit.** In `route script workers distribute concurrent executions across available slots`, `{ timeoutMs: 400 }` becomes `{ timeoutMs: 1000 }`. The spin stays at 350 ms, so the script has 650 ms of slack where it had 50. 1000 is inside the allowed range of 10 to 30000 (read by the audit).

- [ ] **Step 2: run the file three times.** Expected: every test passes, and this test takes about as long as before, since a script that returns in 350 ms does not wait for its limit.

- [ ] **Step 3: commit.** `test(core): give the route worker test 650 ms of slack`

## Task 3: a port reserved in one test process stays reserved in the others

**Files:** `build/run-tests.mjs`, `packages/core/test/support/loopback-listener.mjs`, `packages/core/test/unit/support/loopback-listener.test.mjs`

The claim has to live where every test process of a run can see it. `LLMR_TEST_HOME` is not that place. `build/test-home.mjs` runs first in every bundle and replaces it with a folder of that file's own (read. The audit printed two different folders from two files of one run). So the runner passes the folder in a variable of its own, which `isolateTestHome` does not touch. The folder sits inside the suite's home, which the runner removes when the run ends.

A run of one file with `node --test` has no such variable and one process, so the `Set` is enough there and no file is written.

- [ ] **Step 1: write the failing test.** Add to `loopback-listener.test.mjs`:

```js
test("two test processes never reserve the same port", async () => {
  // The bundle is CommonJS, so there is no import.meta.url; both runners start in the repo root.
  const helper = pathToFileURL(path.resolve("packages/core/test/support/loopback-listener.mjs")).href;
  const script = `const { reserveLoopbackPort } = await import(${JSON.stringify(helper)});
    const ports = [];
    for (let index = 0; index < 400; index += 1) ports.push(await reserveLoopbackPort());
    console.log(JSON.stringify(ports));`;
  const claims = mkdtempSync(path.join(tmpdir(), "llmr-port-claims-"));
  const run = () => new Promise((resolve, reject) => {
    execFile(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, LLMR_TEST_PORT_CLAIMS: claims } },
      (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout)));
  });
  try {
    const [first, second] = await Promise.all([run(), run()]);
    assert.deepEqual(first.filter((port) => second.includes(port)), []);
  } finally {
    rmSync(claims, { force: true, recursive: true });
  }
});
```

Import `execFile` from `node:child_process`, `mkdtempSync` and `rmSync` from `node:fs`, `tmpdir` from `node:os`, `path` from `node:path` and `pathToFileURL` from `node:url`. `import.meta.url` is empty in the bundle and throws `ERR_INVALID_URL` (run, audit), which is why the helper is found from the repository root.

- [ ] **Step 2: run it and see it fail** with a non-empty list of shared ports.

- [ ] **Step 3: claim the port with a file.** In `loopback-listener.mjs`:

```js
import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";

// Test files run in separate processes, so the Set alone cannot keep two of
// them off one port. A file made with "wx" can. run-tests.mjs names the folder
// and removes it with the suite's home.
const claimDir = process.env.LLMR_TEST_PORT_CLAIMS;

function claimPort(port) {
  if (!claimDir) return true;
  mkdirSync(claimDir, { recursive: true });
  try {
    closeSync(openSync(path.join(claimDir, String(port)), "wx"));
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}
```

In `reserveLoopbackPort`, replace `if (reservedPorts.has(port)) { continue; }` with `if (reservedPorts.has(port) || !claimPort(port)) { continue; }`. When the bind probe fails for a claimed port, the claim stays. That port is taken by something else and no test should get it.

- [ ] **Step 4: run both tests of the file.** Expected: both pass.

- [ ] **Step 5: name the folder in the runner.** In `runProject` of `build/run-tests.mjs`, add `LLMR_TEST_PORT_CLAIMS: path.join(testHome, "port-claims")` to the object passed to `guardTestNetwork`, after the `isolateTestHome(...)` spread.

- [ ] **Step 6: prove that two test files of one run share the folder.** This is the check the first draft lacked, and its absence is why the audit's Blocker was not caught by the new test. Add `console.error("claims", process.env.LLMR_TEST_PORT_CLAIMS);` at the top of `loopback-listener.mjs`, run `npm run test:core 2>&1 | grep "^claims" | sort | uniq -c`, and expect one line: one path, ending in `port-claims`, with a count of the processes that loaded the helper (18 at `8ea25ca3`, run by the session). Two lines mean two files did not share the folder. Remove the `console.error`.

- [ ] **Step 7: run the suites** with `LLMR_TEST_GATEWAY_ENTRY` set: `npm run test:core` and `npm run test:architecture`. Expected: both pass. `tests/architecture/test-home-isolation.test.mjs`, `test-network-guard.test.mjs` and `package-scripts.test.mjs` read the runner, so read each failure there against this change before touching the test.

- [ ] **Step 8: commit.** `test(core): keep two test processes from reserving the same loopback port`

## Task 4: the wait for the request log

**Files:** `packages/core/test/integration/gateway/claude-login-pass-through-wire.test.mjs`

`until` returns as soon as its predicate holds, so a longer limit costs nothing on a fast machine. The file has one `until(` call, in `no file under the data folder holds the login`, which runs once per layout under `timeout: 60000` (read by the audit).

- [ ] **Step 1: pass `30000` as the second argument of that `until(` call.**

- [ ] **Step 2: run the file** with `LLMR_TEST_GATEWAY_ENTRY` set. Expected: no test is skipped, every test passes, and the two tests take about as long as before.

- [ ] **Step 3: commit.** `test(core): wait up to 30 seconds for the request log in the pass-through wire test`

## After the four tasks

- [ ] `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and `npm run test:core` with `LLMR_TEST_GATEWAY_ENTRY` set.
- [ ] Open the PR. The Intel Mac entry must pass on it. One green run does not prove a fault that showed once in thirteen jobs, so the PR text says which claims rest on a local mutation and which on CI.
- [ ] After the merge, correct the index finding "The Intel Mac entry fails often" to say what was fixed, and move this plan to `completed/`.

## Not in this plan

- **Other tests with thin timing.** These four are the ones that failed. A sweep of every fixed timeout in the core tests is a larger piece of work with no failure behind it yet.
- **A probe on `macos-26-intel`.** The logs answered the question the probe was meant to settle.
- **The 22 connections to outside hosts that the guard refuses in each core run** (`models.dev`, `openrouter.ai`, `raw.githubusercontent.com`, from the catalog refresh). They are refused and reported, and they are not a cause here.
- **The cost of the first catalog load in the product.** About 300 ms on a fast Mac and seconds on the slow runner, paid by the first request after a start. Not measured outside the test.

## Open with the owner

| # | Question | Default |
|---|---|---|
| 1 | Does this get a batch number in the delivery index, and where in the order? | Build it before the next batch, because every red Intel Mac entry on `main` stops `npm run release` until a re-run. |
| 2 | `route script workers distribute concurrent executions across available slots` passes on one worker, so nothing tests that route scripts run side by side. Should a test prove it? The plain way is to time the pair and expect less than two spins, which is one more assertion that a slow runner can fail. | Leave the test as it is after Task 2 and keep this as a finding in the index. |

## Audit

**One round, 2026-11-25, on another model (Opus), in a throwaway worktree at `8ea25ca3` on Apple silicon.** It built all four tasks of the first draft and ran their steps and mutations. The session then read the code behind both Blockers before changing the text.

- **Blocker, Task 3.** The first draft kept the claims under `LLMR_TEST_HOME`, which each test file replaces with its own folder, so no two files would have shared a claim. The draft's new test passed anyway, because its two child processes inherit one environment. Confirmed by the session in `build/test-home.mjs`. The task now takes the folder from a variable the runner sets, and Step 6 checks the thing the test cannot.
- **Blocker, Task 2.** The first draft said the test fails on one worker and chose its numbers to keep that. It passes on one worker. Confirmed by the session in `RouteScriptWorkerSlot.rpc`. The task now only widens the limit, and question 2 carries the gap.
- **Corrections taken:** the first test's reported time stays high with the hook in place, so Task 1 Step 5 proves the hook with a 250 ms cap; building the catalog indexes costs more than loading the payload; `import.meta.url` is empty in the bundle; the wire tests need `LLMR_TEST_GATEWAY_ENTRY`; Task 4 has one call to change.
- **One correction not taken.** The audit counted fifteen tests that make a request. The CI logs show sixteen failing in two of the jobs (nine generated, seven named).
- **Found by the session's own re-read:** the first draft's exit handler released a process's claims while the other process of the new test was still drawing ports. The rewrite has no exit handler.
- **Ran and held:** the cascade under a 1 ms cap; `realFetch` containing it (33 pass, 1 cancelled, three runs); the warm-up hook; the port test failing before the fix; `npm run test:core` (2117 pass, 70 skipped for the missing variable) and `npm run test:architecture` (216 of 216) with the first draft's Task 3 applied.
- **The rewritten Tasks 2 and 3, run by the session after the rewrite** in a second throwaway worktree: the port test passed three times of three; the route worker file passed 45 of 45, with the changed test at 366 ms; with `LLMR_TEST_GATEWAY_ENTRY` set, `npm run test:core` passed (2171 pass, 0 fail, 16 skipped) and every process printed the same `port-claims` folder; `npm run test:architecture` passed (216 of 216). Not run after the rewrite: the port test without the fix, which the audit ran on the first draft's test.
- **Not run by anyone:** anything on Windows (`wx` and the path handling were read only); anything on an Intel Mac.
