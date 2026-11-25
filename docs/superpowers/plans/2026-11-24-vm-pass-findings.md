# VM Pass Findings Implementation Plan

> **Status, 2026-11-24: written from the second research pass, audited once on another model, the owner accepted every recommendation, Tasks 1 and 2 merged on 2026-11-24 as PR 152 after keys plan Task 4 merged as PR 151. Task 3 waits on the owner's VM check, and Task 4 goes into follow-ups PR 3.** On 2026-11-24 the owner accepted the recommendation for each of the seven findings, so no decision is open and the lines below that say a task "waits on the owner's answer" are settled. Building each PR still needs his word, as does each merge. Task 5 is a docs paragraph and was committed the same day. Nothing else was built. The audit wrote every test below as given and ran it on today's code, then against the smallest change each Interfaces block describes, in a throwaway worktree. It found 1 Blocker, in a fixture of Task 4, and 10 Corrections. All are applied. The text changed by that round was then reviewed by the session on 2026-11-24. It ran the one test added after the audit in the audit's worktree (17 of 17) and one more mutation. It found one gap behind Task 1's VM check, an adopted gateway that nobody watches, which is now under "Not in this plan". Task 6 was added for it on 2026-11-24 on the owner's word, audited once, and merged on 2026-11-25 as PR 155.

> **Delivery, 2026-11-25.** [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md) groups this plan's unbuilt tasks into batches with other plans' tasks and sets the order. It overrides this plan's lines on branches, on one PR per task, and on waiting for a VM check: the owner's VM pass comes once, at the end.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who runs the desktop app and the CLI service on one machine keeps a working gateway and a truthful status window, opening an agent app raises no macOS permission prompt, and a provider is called a local login only when it is one.

**Architecture:** Five tasks in four deliveries. Tasks 1 and 2 are one PR in core: a restart that finds another healthy gateway on its port adopts it or waits, and never stops it, and the exit message drops the child's stderr for the one signal LLM Router sends itself. Task 3 is one PR in core that brings an agent app forward without an Apple Event. Task 4 is one more commit in PR 3 of the pass-through follow-ups plan, placed before that plan's Task 9, and changes what the provider form calls a local login. Task 5 is a docs paragraph.

**Tech Stack:** TypeScript, Electron 45, React, `node:test` with `node:assert/strict`, Playwright.

**Spec:** [`docs/superpowers/research/2026-11-24-decisions-vm-pass.md`](../research/2026-11-24-decisions-vm-pass.md). Finding ids VP-3 to VP-9 come from that record. Read its section "Second research pass, 2026-11-24" before you start. Its table "Decisions for the owner, revised" is what this plan builds.

**Evidence status.** The faults were seen on the owner's VM with the released 9.0.0 app. For Tasks 1 and 2 the fault and a prototype of the fix ran against the real gateway child, as throwaway code that is not in the repo. For Task 3 the new call ran on macOS 27.2 against other apps, not against the released app. For Task 4 the rule's inputs ran through the real `shared/providers.ts` in a scratch bundle. The plan author read every file and symbol named below at `main` `f7f38103` and ran none of the new tests. The audit then ran them: with its corrections and a throwaway build of Tasks 1 to 4, `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`, `npm run test:ui` (308 of 308) and the end-to-end spec of Task 4 (6 of 6) passed. Where a step still rests on something only read or inferred, the step says so.

## Decisions this plan rests on

**Answered, 2026-11-24: the owner accepted every row as recommended.**

| Finding | Recommended | Task | If the owner says no |
|---|---|---|---|
| VP-4, VP-5 | The restart yields to another healthy gateway | Task 1 | The exchange of the VM stays for every case keys plan Task 4 does not remove |
| VP-6 | No stderr in the message for a `SIGTERM` exit | Task 2 | The banner keeps the deprecation line until a fork change removes it |
| VP-3 | Bring the app forward by process id with no Apple Event | Task 3, after the VM check in its Step 1 | The prompt stays. The record has the smaller change that only explains it |
| VP-9 | Local login by plugin or Codex address | Task 4 | Follow-ups PR 3 is built as written |
| VP-7 | Leave the file mode, add a docs paragraph | Task 5, done | Nothing is written |
| VP-8 | No task | None | |

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Never pass `--scope`.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and the package suites the task touches.
- No new test, script or doc names a real provider host or holds a key, other than Codex's default address, which the source already holds. Test keys are made-up strings. The existing end-to-end test that Task 4 changes at `:157` already saves a provider at a real host, and this plan leaves that address as it is.
- A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. No task here needs one.
- Merging needs the owner's word, once per PR.
- The repository is public. Describe a change by what the code does.
- No test launches an app, sends an Apple Event or runs `osascript`. What needs the real apps is a VM check.

## Review Focus

Each line is a condition no task's first test covers. The test that pins it is in the step named at the end.

1. The other gateway refuses this process's key. The restart must not stop it, must say that another process serves the port, and must try again later. Task 1, Step 1, the test of the refused key.
2. The port is free when the restart runs, which is every crash with one owner. The restart must still start a child. Task 1, Step 1, the test of the free port, and the five `#1867` tests of the file.
3. `stop` or `start` is called while the restart's probe is in flight. The restart must not adopt after it was cancelled. Task 1, Step 1, the cancelled test.
4. A child that ran out of memory. Its exit is `SIGABRT` and its stderr must stay in the message. Task 2, Step 1.
5. A saved Codex provider at Codex's default address whose plugin entry is gone. It must still read as a local login. Task 4, Step 1.
6. A provider whose key is the placeholder typed by hand. Its key field must be shown, in the Add flow and in the edit dialog. Task 4, Steps 1 and 5.
7. The process an adopter took its gateway from is only restarting. The adopter must not start a gateway inside the wait. Task 6, Step 1, the test of the gateway that answers again.
8. `stop` or `start` is called while the check of the adopted gateway is in flight. Nothing may be started after it. Task 6, Step 1, the last test.

## Not in this plan

- **One change of owner.** A second process that calls `start` still stops the first one's child once, and requests in flight are dropped. Task 1 ends the exchange after that. Removing the first stop means `ensureStarted` in the seven callers that start with no probe, which the record lists. One of them is the app-profile open (`profiles/launch-service.ts:463`), where keys plan Task 4 already notes that an open restarts a gateway that serves the same config. Not run.
- **An adopted gateway that nobody watches.** A process that has adopted another process's gateway shows `running` and runs no timer for it. The stored-key poll skips an adopted gateway (`gateway-service.ts:771`), and no other check of it exists (run by the session, a search for `gatewayManagedExternally`). So when the serving process quits, the adopter stays green while nothing answers, until a save, a launch or a restart calls `ensureStarted` or `start`. This is today's behaviour for a service started beside a running one, and Task 1 makes adoption the outcome of more cases. Read when this line was written, and since run by the session: Task 6 is the fix, written on the owner's word of 2026-11-24.
- **One process in the single layout beside one in the compat layout.** The compat server answers `/health` with its state, `running`, and not `ok` (`gateway/http/request-handler.ts:231-238`), so the check of Task 1 does not see it. The restart then takes the normal path, removes the other process's marker, fails on the port and tries again every 30 s, with no signal sent. Read by the audit, not run. Both processes read one stored config, so they have one layout unless one of them was started from another config.
- **An owner id in the gateway marker.** Prototyped and dropped. The record has the run.
- **A two-process wire test.** The research ran one by editing `build/test-home.mjs`, which gives every test process its own home. A kept test needs a supported way to share one home between two processes. The unit tests of Task 1 and the VM check stand in for it.
- **The deprecation line itself.** It comes from an option the gateway fork passes to Fastify. It goes at a fork change, which needs the owner's word.
- **The dead status field `coreManagedExternally`.** Never set. Deleting it is its own small change.
- **The marker removed without a check of whose it is** (`gateway-service.ts:620`). Harmless to Task 1. If it removes the new owner's marker, a later manual start fails with "already in use" and sends no signal (inferred).
- **VP-8, the backups.** The restore plan's fix round, which the record describes.
- **A hand-typed placeholder key at request time.** The gateway sends the placeholder upstream and the provider refuses it, as it refuses any wrong key (inferred).
- **A file mode put back exactly.** The record sizes it. Not recommended.

## Order

1. Keys plan Task 4 merges first. Done, PR 151, `c53eb517`. Task 1 here depends on it: with a one-key config the adopting side ends in `error`.
2. Tasks 1 and 2, one PR, branch `fix/gateway-restart-yields`. Done, PR 152, `72c747cd`.
3. Keys plan Task 3 can go before or after step 2.
4. Task 3. Done, PR 156, `92c8cf3f`.
5. Follow-ups PR 3 with Task 4 of this plan as its second commit: Task 8, this Task 4, Task 9, Task 10. Done, PR 157, `3aef9d00`, batch 2 of the delivery order.
6. Task 5, a docs commit on `main`. Done, `082624bc`.
7. Task 6, its own PR, branch `fix/adopted-gateway-watch`. Done, PR 155, `533244e9`.
8. Tasks 7, 8 and 3. Done, PR 156, `92c8cf3f`, batch 1 of the delivery order.

---

### Task 1: A restart that finds another gateway on its port adopts it or waits (VP-4, VP-5)

Accepted by the owner, 2026-11-24. Build after keys plan Task 4 has merged.

**Merged, 2026-11-24: PR 152, `72c747cd`, with three changes its review added to the text below.** Each was confirmed before it was made.

- **A restart no longer calls `stopPreviousManagedCoreGateway`.** Interfaces below says that function's call is not changed. The review found that a first health check that timed out sent the restart down the normal start, where that call reads the marker and signals the process it names. A test with a real process named in the marker saw it get `SIGTERM` on the first build (run). A restart's own child has exited and its marker is gone, so the call now runs only for a manual start.
- **The health check asks the port from the config, not `this.status.coreEndpoint`.** After an adoption that ends in an error the status holds the core port, which the other gateway does not serve in the single layout, so the next look fell through to the normal start (read, then pinned by a test and a mutation).
- **`anotherGatewayOwnerMessage` is gone.** The two messages are built in place. The one for a gateway that did not refuse the key names the port that answered the health check, and the first wait is logged once with the probe's result.

Three tests came with it: the timer keeps looking after a refusal and stops after an adoption, the look uses the port from the config, and the signal test above. Not changed, and still open: the wording "does not accept this process's key" when this process has no unexpired key to offer (not reached by any path found, inferred), and the compat layout's probe of this process's own public server, which "Not in this plan" already has.

When a gateway child exits and the restart timer fires, the service looks at its port before it starts anything. If another healthy gateway answers there and accepts this process's key, the service adopts it and shows `running`. If it answers and refuses the key, the service shows an error that names the cause and looks again later. In neither case does it stop the other gateway. With the port free it restarts as today.

**Evidence.** Ran, 2026-11-24, as throwaway code against the real gateway child, two owner processes on one temporary home. On today's code the two took the port from each other at 1, 2, 4, 8 and 16 s, also when both held the full key list. With the change below each layout ended after one change of owner. The record has the output.

**Files:**
- Modify: `packages/core/src/gateway/application/gateway-service.ts` (`startGateway` `:179-190`, `scheduleCoreRestart` `:639-642`)
- Test: `packages/core/test/unit/gateway/core-restart.test.mjs`

**Interfaces:**
- Consumes: `isCoreGatewayHealthy(coreEndpoint: string): Promise<boolean>` and `probeExistingLlmrGateway(config): Promise<ExistingLlmrGatewayProbe>`, both already imported in the file (`:17`, `:21`). `this.adoptExternalGateway(config, endpoint, apiKey)` and `this.stopGateway({ nextConfig })`, both private methods of the class.
- Changes, `startGateway(config, recoveryGeneration)`. One block after the `coreHostError` return and before the line `if (recoveryGeneration === undefined) await this.rememberStoredApiKeys();`. It runs only when `recoveryGeneration !== undefined` and `await isCoreGatewayHealthy(this.status.coreEndpoint)` is true. On the restart path `this.child` is already unset (`:617`), so a healthy answer is not this process's child. Inside it:
  1. `const existing = await probeExistingLlmrGateway(config);`
  2. If `recoveryGeneration !== this.coreRestartGeneration`, return `this.getStatus()`. A `stop` or `start` cancelled this restart while the probe ran.
  3. If `existing.state === "usable"`: `await this.stopGateway({ nextConfig: config });` then `return this.adoptExternalGateway(config, existing.endpoint, existing.apiKey);`. This is what `ensureStarted` does for a usable gateway (`:358-372`).
  4. Otherwise set `this.status = { ...this.getStatus(), lastError: anotherGatewayOwnerMessage(this.status.endpoint, existing.state === "unauthorized"), state: "error" }` and return `this.getStatus()`. The timer sees `error` and schedules the next look (`:650`). The probe has four results besides `usable` (`existing-gateway-probe.ts:7-12`), and only `unauthorized` means the key was refused.
- Produces, in the same file, not exported: `function anotherGatewayOwnerMessage(gatewayEndpoint: string, keyRefused: boolean): string`. With `keyRefused` it returns `` `Another LLM Router process serves ${gatewayEndpoint} and does not accept this process's key. Quit the other one, or restart this one.` ``. Without it, `` `Another process serves ${gatewayEndpoint}.` ``
- Changes, `scheduleCoreRestart`. The warning text becomes `` `[gateway] Core gateway is not running; trying again in ${delayMs}ms.` ``, because the timer now also runs when nothing exited. No test or source pins the old text (run, a search for "exited unexpectedly").
- Not changed: `start`, `ensureStarted`, `stopPreviousManagedCoreGateway`, the marker, the backoff, every caller.

- [ ] **Step 1: Write the failing tests** in `core-restart.test.mjs`. They call the real `startGateway` of a fresh service with a generation, and answer the health and probe requests through `globalThis.fetch`, as `existing-gateway-probe.test.mjs` does with its `withFetch` helper (`:18-31`). Copy that helper into this file. The stand-in answers `/health` with a shape the probe and the health check both accept (`existing-gateway-probe.ts:226-231`, `supervisor.ts:894-897`, read). A real gateway child answers without `core`, and the probe then reads `/`, which the router plugin serves (read by the audit). Each test builds the service the same way:

```js
function config() {
  const value = createDefaultAppConfig();
  value.APIKEY = "first-key";
  value.APIKEYS = [{ id: "first", key: "first-key", name: "First" }];
  value.gateway.host = "127.0.0.1";
  value.gateway.port = 3456;
  return value;
}

const health = () => Response.json({ core: "http://127.0.0.1:3467", status: "ok", timestamp: "2026-01-01T00:00:00.000Z" });

function restartingService(heldConfig) {
  const service = createService();
  service.config = heldConfig;
  service.coreRestartGeneration = 3;
  service.status = { coreEndpoint: "http://127.0.0.1:3467", endpoint: "http://127.0.0.1:3456", networkEndpoints: [], state: "error" };
  const calls = [];
  service.stopGateway = async () => { calls.push("stop"); return service.getStatus(); };
  service.adoptExternalGateway = async (_config, endpoint, apiKey) => {
    calls.push(`adopt ${endpoint} ${apiKey}`);
    service.status = { ...service.status, gatewayManagedExternally: true, state: "running" };
    return service.getStatus();
  };
  service.rememberStoredApiKeys = async () => { calls.push("remember"); };
  service.holdConfig = () => { calls.push("hold"); throw new Error("reached the normal start"); };
  return { calls, service };
}
```

  `holdConfig` is the first call of the normal start after `stopGateway` (`:192`, read) and is outside the `try`, so a throw there rejects the start and shows the normal path was taken without starting anything (ran by the audit).

```js
test("a restart adopts another gateway on its port that accepts its key", async (t) => {
  withFetch(t, (url) => url.pathname === "/health" ? health() : Response.json({ data: [] }));
  const { calls, service } = restartingService(config());
  const status = await service.startGateway(service.config, 3);
  assert.deepEqual(calls, ["stop", "adopt http://127.0.0.1:3456 first-key"]);
  assert.equal(status.state, "running");
  assert.equal(status.gatewayManagedExternally, true);
});

test("a restart leaves another gateway that refuses its key alone and says who serves the port", async (t) => {
  withFetch(t, (url) => url.pathname === "/health" ? health() : new Response("{}", { status: 401 }));
  const { calls, service } = restartingService(config());
  const status = await service.startGateway(service.config, 3);
  assert.deepEqual(calls, []);
  assert.equal(status.state, "error");
  assert.equal(status.lastError, "Another LLM Router process serves http://127.0.0.1:3456 and does not accept this process's key. Quit the other one, or restart this one.");
});

test("a restart says only that the port is served when the other gateway fails without refusing the key", async (t) => {
  withFetch(t, (url) => url.pathname === "/health" ? health() : new Response("{}", { status: 500 }));
  const { calls, service } = restartingService(config());
  const status = await service.startGateway(service.config, 3);
  assert.deepEqual(calls, []);
  assert.equal(status.lastError, "Another process serves http://127.0.0.1:3456.");
});

test("a restart with nothing on its port starts a gateway as before", async (t) => {
  withFetch(t, () => { throw new Error("connection refused"); });
  const { calls, service } = restartingService(config());
  await assert.rejects(service.startGateway(service.config, 3), /reached the normal start/);
  assert.deepEqual(calls, ["stop", "hold"]);
});

test("a restart cancelled while it probes adopts nothing", async (t) => {
  const { calls, service } = restartingService(config());
  withFetch(t, (url) => {
    if (url.pathname !== "/health") service.coreRestartGeneration = 4;
    return url.pathname === "/health" ? health() : Response.json({ data: [] });
  });
  await service.startGateway(service.config, 3);
  assert.deepEqual(calls, []);
});

test("a manual start does not look for another gateway first", async (t) => {
  const requests = withFetch(t, () => health());
  const { calls, service } = restartingService(config());
  await assert.rejects(service.startGateway(service.config), /reached the normal start/);
  assert.deepEqual(calls, ["remember", "stop", "hold"]);
  assert.equal(requests.length, 0);
});
```

  Ran by the audit, for the five tests it had: the health check and the probe both reach `globalThis.fetch` in a test, because `fetchWithSystemProxy` calls the bare `fetch` for a loopback address (`proxy/system-proxy-fetch.ts:31-35`, `:244-253`), the probe returns `http://127.0.0.1:3456` for this config, and the four methods can be replaced on the instance. The test of the 500 answer was added after the audit. The session ran it in the audit's worktree with the two-result message: 17 of 17. The probe gives a 500 on `/v1/models` the result `unusable` and only a 401 or 403 the result `unauthorized` (`existing-gateway-probe.ts:61-69`, read).

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/core-restart.test.js`
Expected: the two adopt-or-wait tests, the 500 test and the cancelled test fail, because today's restart reaches `stopGateway` and `holdConfig` whatever answers on the port and rejects with "reached the normal start". The "nothing on its port" test and the manual-start test pass today. The eleven existing tests pass. Ran by the audit without the 500 test: 13 pass, 3 fail. The 500 test was not run on today's code.

- [ ] **Step 3: Implement** as Interfaces says.

- [ ] **Step 4: Verify.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/core-restart.test.js`
Expected: all seventeen pass (ran by the session in the audit's worktree). Smallest mutations caught. Dropping the generation check fails the cancelled test, and only that one (ran by the audit). Running the block for a manual start fails the last test, and only that one (ran by the session). Not run: calling the normal start in the refusing case, which should fail the second test at `calls`.
Run: `npm run test:core`
Expected: all pass. Ran by the audit: 2093 tests, 0 fail. `stored-api-keys-watch.test.mjs` and `gateway-child-env-wire.test.mjs` restart real and stubbed children and are the suites most likely to notice a change on this path.

  One thing to read in review, which no test reaches. In the compat layout this process keeps its own public server after a child exits, so a probe of the public port would reach this process itself. The block runs only when the core port is healthy, and in that layout another process cannot hold the core port without first failing to bind the public one (read by the audit, `gateway-service.ts:250-252`).

- [ ] **Step 5: Commit.** Subject: `fix(gateway): a restart adopts or waits for another gateway on its port`

**VM check, for the owner, on the build that holds this task and keys plan Task 4.** Open the desktop app, open an App-only profile, then run `llmr start`. Expected: one change of the gateway's owner, then the port keeps one owner for five minutes, every stored key answers, and the desktop window is green with no banner. Then quit the CLI service and note what the desktop window shows and whether a key still answers. Expected, read and not run: the window stays green and nothing answers, until a save or a restart of the desktop app. "Not in this plan" has the reason, under the adopted gateway that nobody watches.

### Task 2: An exit from `SIGTERM` shows no stderr (VP-6)

Accepted by the owner, 2026-11-24. Same branch as Task 1, second commit.

**Merged, 2026-11-24: PR 152, `72c747cd`, as written.** The child's stderr still reaches the log for every exit (`gateway-service.ts`, the `stderr` listener of the start), read by the review.

**Evidence.** Ran, 2026-11-24, Node 24, stderr captured. Out of memory and `process.abort()` both exit from `SIGABRT` with the cause on stderr. A `SIGTERM` to the child comes from LLM Router, from another owner's start or this owner's stop. On the VM its stderr was a Fastify deprecation line shown as the error detail.

**Files:**
- Modify: `packages/core/src/gateway/core-runtime/supervisor.ts` (`formatCoreGatewayChildExit` `:173-182`, `captureGatewayChildOutput` `:535`)
- Test: `packages/core/test/unit/gateway/core-exit-message.test.mjs` (new)

**Interfaces:**
- Changes, `formatCoreGatewayChildExit(child, code, signal, phase)`. When `signal === "SIGTERM"` it returns the sentence alone and does not call `appendGatewayChildOutput`. Every other exit is unchanged. One comment gives the why: LLM Router is what normally sends this signal, so the child's output is not the cause. A logout, a shutdown or a `kill` sends it too, and their stderr is dropped the same way.
- Changes, `captureGatewayChildOutput(child: ChildProcess): void` gains `export`, so the test can record output for a stand-in child. Nothing else calls it from outside.

- [ ] **Step 1: Write the failing test.**

```js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { captureGatewayChildOutput, formatCoreGatewayChildExit } from "@llmr/core/gateway/core-runtime/supervisor.ts";

function childThatPrinted(text) {
  const child = { stderr: new EventEmitter(), stdout: new EventEmitter() };
  captureGatewayChildOutput(child);
  child.stderr.emit("data", text);
  return child;
}

test("an exit from SIGTERM shows no stderr, and every other exit keeps it", () => {
  assert.equal(formatCoreGatewayChildExit(childThatPrinted("a warning"), null, "SIGTERM"), "Core gateway exited with SIGTERM.");
  assert.equal(formatCoreGatewayChildExit(childThatPrinted("heap limit"), null, "SIGABRT"), "Core gateway exited with SIGABRT.\nstderr:\nheap limit");
  assert.equal(formatCoreGatewayChildExit(childThatPrinted("heap limit"), null, "SIGKILL"), "Core gateway exited with SIGKILL.\nstderr:\nheap limit");
  assert.equal(formatCoreGatewayChildExit(childThatPrinted("bad config"), 23, null), "Core gateway exited with 23.\nstderr:\nbad config");
  assert.equal(formatCoreGatewayChildExit(childThatPrinted("a warning"), null, "SIGTERM", "before accepting runtime config"), "Core gateway exited with SIGTERM before accepting runtime config.");
});
```

- [ ] **Step 2: Add the export, run and see it fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/core-exit-message.test.js`
Expected: the first assertion fails, with `"Core gateway exited with SIGTERM.\nstderr:\na warning"` as the actual value (ran by the audit).

- [ ] **Step 3: Implement** as Interfaces says.

- [ ] **Step 4: Verify.**

Run: the command of Step 2. Expected: PASS. Ran by the audit, before and after, with the results Steps 2 and 4 give.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`
Expected: all pass. `gateway-status.test.mjs:156` matches `/Core gateway exited with 23/`, which this task leaves true.

- [ ] **Step 5: Commit.** Subject: `fix(gateway): leave the child's stderr out of the message for a SIGTERM exit`

Then open the PR for Tasks 1 and 2. Say in it what "Not in this plan" says about the one change of owner.

---

### Task 3: Bring an agent app forward without an Apple Event (VP-3)

**Merged, 2026-11-25: PR 156, `92c8cf3f`, batch 1.** Two changes from its review: the exported function is `profileAppActivationCommand`, since production code calls it, and the spawned child has an `error` listener, because a spawn that fails reports through that event and an unheard one ends the process. An architecture test, `gateway-takeover-wiring.test.mjs`, pins that the source holds no Apple Event. Two reviewers noted that option `2` is deprecated since macOS 14 and that a background `osascript` may not bring the window forward. Nobody ran that, and it is a line of the end pass.

Accepted by the owner, 2026-11-24. It no longer waits on the VM check of Step 1: on 2026-11-25 the owner moved every VM check to one pass at the end, so the task is built on the run its Evidence names and Step 1 is a line of that pass. Batch 1 of the delivery order.

Opening or reopening an App profile brings that app's window forward and raises no macOS prompt.

**Evidence.** `activateProfileAppWindow` asks System Events to set a process frontmost (`profiles/launch-service.ts:979-1003`). That is an Apple Event, and macOS asks the user for it once, in LLM Router's name, with no explanation. A refusal is kept, and the activation then fails with no sign. Ran, 2026-11-24, macOS 27.2: `osascript -l JavaScript` with `NSRunningApplication` brought Finder forward and then the first app again, and printed `true` both times. That call sends no Apple Event. Not run: the released app, and two instances of one app.

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts` (`activateProfileAppWindow` `:979-1003`)
- Test: `packages/core/test/unit/profiles/profile-app-process-detection.test.mjs`

**Interfaces:**
- Produces, in `launch-service.ts`, beside the two `...ForTest` exports (`:1114`, `:1171`): `export function profileAppActivationCommandForTest(pid: number): { args: string[]; command: string }`. It returns `command: "/usr/bin/osascript"` and `args: ["-l", "JavaScript", "-e", script]`, where `script` is exactly `` `ObjC.import("AppKit"); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid}).activateWithOptions(2)` ``. The option `2` is `NSApplicationActivateIgnoringOtherApps`, the value the run used.
- Changes, `activateProfileAppWindow`. Its `spawn` takes the command and the arguments from that function. The alive check becomes `if (pid === undefined || !isProcessAlive(pid)) return;`, because the pid there is `number | undefined` and the new function takes a number (typecheck fails without it, ran by the audit). The two delays, `detached`, `stdio: "ignore"`, `unref` and the seven callers stay. The comment in its `catch` stays. Apple marks option `2` as deprecated since macOS 14, where an activation became a request. It is the value that ran.

- [ ] **Step 1: The owner's VM check.** Not before the code any more: it runs in the end pass, and a failure there is a fix in the remediation plan. On the VM with released 9.0.0: start two Claude Code App profiles, so that two Claude instances run. Put Terminal in front. Find the main process id of the instance further back with `ps -axo pid,command | grep -- --user-data-dir`. Run `sleep 3; osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSRunningApplication.runningApplicationWithProcessIdentifier(<pid>).activateWithOptions(2)'` and click another window during the three seconds. Expected: no prompt, `true` printed, and that instance in front. Repeat five times, and once with the instance on another Space. If any run prompts, prints `false` or leaves the window behind, stop. The record's section "VP-3, run and documented" then has the change to build in place of this task, under "If the VM check fails".

- [ ] **Step 2: Write the failing test** in `profile-app-process-detection.test.mjs`. Add `profileAppActivationCommandForTest` to the file's import.

```js
test("an app is brought forward by process id with no Apple Event", () => {
  const { args, command } = profileAppActivationCommandForTest(4242);
  assert.equal(command, "/usr/bin/osascript");
  assert.deepEqual(args.slice(0, 3), ["-l", "JavaScript", "-e"]);
  assert.equal(args[3], 'ObjC.import("AppKit"); $.NSRunningApplication.runningApplicationWithProcessIdentifier(4242).activateWithOptions(2)');
  assert.doesNotMatch(args.join(" "), /System Events|tell application/);
});
```

- [ ] **Step 3: Run and see it fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/profile-app-process-detection.test.js`
Expected: the build fails on the missing export. Add the function with today's arguments, `["-e", <the System Events line>]`, run again, and the test fails at its second assertion.

- [ ] **Step 4: Implement** as Interfaces says.

- [ ] **Step 5: Verify.**

Run: the command of Step 3. Expected: PASS.
Run: `git grep -n "System Events" -- 'packages/*/src'` Expected: no line. The new test holds the words in its last assertion.
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`
Expected: all pass.

- [ ] **Step 6: Commit.** Subject: `fix(profiles): bring an agent app forward without asking for Automation access`

**VM check, for the owner, on the build that holds this task.** `tccutil reset AppleEvents net.matherly.llmrouter`, then open a Claude Code App profile, a Codex App profile and an OpenCode App profile, and reopen each while it runs. Expected: no prompt at any step, and each reopen brings that profile's window forward.

---

### Task 4: A provider is a local login only with a login behind it (VP-9)

**Merged, 2026-11-25: PR 157, `3aef9d00`, batch 2.** The branch was `fix/provider-form-local-login`. One change from its review: onboarding edits a saved provider, so it now passes that provider to the login rule and to its form. Without it, renaming a saved login in onboarding showed the API-key step.

Accepted by the owner, 2026-11-24. It is built on the branch of follow-ups PR 3, `fix/vm-pass-follow-ups`, as the commit after that plan's Task 8 and before its Task 9. It changes eight things in that plan's PR 3, most of them in Task 9, which this task lists at its end.

A provider whose key is the placeholder is shown as a local login when the draft has plugins of its own, when its address is Codex's default, or when a plugin of the config matches it. Otherwise it is a provider with a key, and the key field is shown.

**Evidence.** VM pass, 2026-11-24: a provider with the placeholder typed by hand read "Local login provider" with two green ticks while every probe was refused, and its key field was hidden. Ran, 2026-11-24, through the real `shared/providers.ts`: a saved provider with two plugin entries matched two, and still two after the draft was renamed. A saved Codex provider at Codex's default address with no plugin matched none, and core serves it as a login (`gateway/core-runtime/config-compiler.ts:301-341`, `providers/probe.ts:1009-1011`).

**Files:**
- Modify: `packages/ui/src/pages/home/shared/providers.ts` (`isLocalAgentLoginDraft` `:85-87`, `providerSetupStepsForDraft` `:89-91`, `providerConnectivityProviderPlugins` `:814`, `isClaudeLoginProviderDraft` `:830`)
- Modify: `packages/ui/src/pages/home/App.tsx` (`:62-70`, `:1499`)
- Modify: `packages/ui/src/pages/home/components/providers.tsx` (`:2024-2026`, `:3579-3581`)
- Modify: `packages/ui/src/pages/home/components/onboarding.tsx` (`:108-109`)
- Test: `packages/ui/test/unit/provider-setup-steps.test.ts`
- Test: `packages/ui/test/component/onboarding.test.tsx` (`:110`)
- Test: `tests/e2e/local-agent-login-import.spec.ts` (`:157`)

**Interfaces:**
- Produces, in `shared/providers.ts`: `export function hasLocalAgentLoginKey(draft: Pick<AddProviderDraft, "apiKey" | "credentialMode" | "credentials">): boolean`, with the body `isLocalAgentLoginDraft` has today.
- Produces, in `shared/providers.ts`, moved from `App.tsx:62-70` with the same bodies: `export const localCodexDefaultBaseUrl`, and `export function isLocalCodexProviderDraft(draft: AddProviderDraft): boolean`. `App.tsx` imports both. `localCodexProviderId` stays in `App.tsx`.
- Changes: `isLocalAgentLoginDraft(draft: AddProviderDraft, providerPlugins: unknown[] | undefined, existingProvider?: GatewayProviderConfig): boolean`. True when `hasLocalAgentLoginKey(draft)` and one of: `draft.providerPlugins.length > 0`, `isLocalCodexProviderDraft(draft)`, or `providerConnectivityProviderPlugins(draft, providerPlugins, existingProvider).length > 0`.
- Changes: `providerSetupStepsForDraft` takes the same three parameters and passes them on.
- Changes: `providerConnectivityProviderPlugins` (`:814`) and `isClaudeLoginProviderDraft` (`:830`) call `hasLocalAgentLoginKey` where they call `isLocalAgentLoginDraft` today. If `providerConnectivityProviderPlugins` called the new function, the two would call each other without end.
- Changes, callers. `App.tsx:1499` calls `hasLocalAgentLoginKey(providerDraft)`, which keeps that branch's meaning. `App.tsx` imports through `./shared/index`: it drops `localAgentProviderApiKey` and `isLocalAgentLoginDraft`, which it no longer uses, and adds `hasLocalAgentLoginKey` and `isLocalCodexProviderDraft` (typecheck fails on the unused names otherwise, ran by the audit). `providers.tsx:2024` and `:3579` pass `providerPlugins` and `existingProvider`, which are in scope on the next line of each, and `:2026` and `:3581` pass them to `providerSetupStepsForDraft`. `onboarding.tsx:108-109` pass `config.providerPlugins` and no saved provider.
- Not changed: `savedLoginAddressChanged` of follow-ups Task 10, core, and the import panel's "already imported" check (`components/providers.tsx:1559`, `:1571`).

- [ ] **Step 1: Change the unit tests** in `provider-setup-steps.test.ts`. Add `createProviderDraftFromProvider` and `hasLocalAgentLoginKey` to the import. The two tests at `:13` and `:19` become one test of the key check and one of the steps:

```ts
const loginPlugins = [{ key: "llmr-local-agent-stand-in-login-codex-oauth", providerName: "Stand-in login" }];
const savedLogin = { api_base_url: "http://127.0.0.1:8799/v1", api_key: localAgentProviderApiKey, id: "stand-in-login", models: ["stand-in-model"], name: "Stand-in login", type: "openai_chat_completions" as const };

test("the placeholder key is recognized in a single key and in a pool", () => {
  assert.equal(hasLocalAgentLoginKey({ ...createProviderDraft([]), apiKey: localAgentProviderApiKey }), true);
  assert.equal(hasLocalAgentLoginKey({
    ...createProviderDraft([]),
    credentialMode: "pool" as const,
    credentials: [{ ...createProviderCredentialDraft(), apiKey: localAgentProviderApiKey, enabled: true }]
  }), true);
  assert.equal(hasLocalAgentLoginKey({ ...createProviderDraft([]), apiKey: "sk-stand-in-0001" }), false);
});

test("a placeholder key is a local login only with a login behind it", () => {
  const typed = { ...createProviderDraft([]), apiKey: localAgentProviderApiKey, baseUrl: "http://127.0.0.1:8799/v1", name: "Typed by hand" };
  assert.equal(isLocalAgentLoginDraft(typed, loginPlugins), false);
  assert.deepEqual(providerSetupStepsForDraft(typed, loginPlugins), providerSetupStepIds);
  const edit = createProviderDraftFromProvider(savedLogin);
  assert.equal(isLocalAgentLoginDraft(edit, loginPlugins, savedLogin), true);
  assert.deepEqual(providerSetupStepsForDraft(edit, loginPlugins, savedLogin), ["provider", "models", "verify"]);
  assert.equal(isLocalAgentLoginDraft({ ...edit, name: "Renamed" }, loginPlugins, savedLogin), true);
  assert.equal(isLocalAgentLoginDraft(edit, [], savedLogin), false);
  assert.equal(isLocalAgentLoginDraft({ ...typed, baseUrl: "https://chatgpt.com/backend-api/codex" }, []), true);
  assert.equal(isLocalAgentLoginDraft({ ...typed, providerPlugins: loginPlugins }, []), true);
  assert.equal(isLocalAgentLoginDraft({ ...edit, apiKey: "sk-stand-in-0001" }, loginPlugins, savedLogin), false);
});
```

  In the file's third test, `api key and empty drafts keep all four steps`, pass `[]` as the second argument to `isLocalAgentLoginDraft` and to both `providerSetupStepsForDraft` calls. With one argument they no longer typecheck.

  In order, the cases of the second test are a key typed by hand, a saved login in the edit dialog, the same draft renamed, the same draft with its plugin entry gone, Codex's default address with no plugin, an import being added, and a key of the provider's own.

- [ ] **Step 2: Add the stubs, run and see it fail.** Export `hasLocalAgentLoginKey` with today's body, and give `isLocalAgentLoginDraft` and `providerSetupStepsForDraft` the new parameters with underscores and today's bodies.

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/unit/provider-setup-steps.test.js`
Expected: the first new test passes and the second fails at its first assertion, because today's rule calls a hand-typed placeholder a login.

- [ ] **Step 3: Implement** as Interfaces says.

- [ ] **Step 4: Change the two tests that pin the old rule.**
  - `onboarding.test.tsx:110`, `Onboarding skips credentials for a local agent import`. An import being added carries its plugins, so the draft gains `providerPlugins: [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }]`. Its assertions stay. Read the fixture's other fields first, and if the test's render reads a plugin's shape, use the shape `provider-dialog-local-agent.test.tsx:29` uses.
  - `local-agent-login-import.spec.ts:157`, `editing an imported provider shows the local login notice instead of the marker`. Its `page.evaluate` also sets `config.providerPlugins = [{ key: "llmr-local-agent-stand-in-codex-oauth", providerName: name }]`, passing `name` as it does today, so the saved provider has a login behind it. Its assertions stay. The key must not contain `claude-code-oauth`: any such key makes the provider a Claude login provider (`core/src/providers/oauth-plugin.ts:3-7`), whose dialog shows another box, and the test then fails at "Signed in with your local agent" (ran by the audit).

- [ ] **Step 5: Add the end-to-end test** to `tests/e2e/local-agent-login-import.spec.ts`, after the test of Step 4.

```ts
test("a provider whose key is the placeholder typed by hand shows its key field", async ({ page }) => {
  const current = requireRuntime();
  await mockLocalAgentRpc(page);
  await page.goto(`${current.baseUrl}/#llmr_web_token=${encodeURIComponent(current.token)}`);
  await waitForBridge(page);
  await page.evaluate(async (apiKey) => {
    const config = await window.llmr!.getConfig();
    config.Providers = [{ api_base_url: "http://127.0.0.1:9/v1", api_key: apiKey, models: ["stand-in-model"], name: "Typed by hand", type: "openai_chat_completions" }];
    config.providerPlugins = [];
    await window.llmr!.saveConfig(config);
    await window.llmr!.setOnboardingFinished?.();
  }, localAgentProviderApiKey);
  await page.reload();
  await waitForBridge(page);
  await page.getByRole("button", { name: "Providers", exact: true }).click();
  await page.locator('button[aria-label="Edit Typed by hand"]:visible').first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Signed in with your local agent")).toHaveCount(0);
  await expect(dialog.getByText("Local login provider")).toHaveCount(0);
  await expect(dialog.locator(`input[value="${localAgentProviderApiKey}"]`)).toHaveCount(1);
});
```

  Inferred, not run: that the key field of an edit dialog holds the saved key as its `value`, which the last assertion of the test at `:157` already relies on for the opposite case.

- [ ] **Step 6: Verify.**

Run: `npm run test:ui`
Expected: all pass. Ran by the audit: 308 of 308, with the onboarding test the only one the rule broke before Step 4. The seven tests of `provider-dialog-local-agent.test.tsx` pass unchanged.
Run: `npm run build:assets && npx playwright test tests/e2e/local-agent-login-import.spec.ts`, then `git checkout -- packages/core/models.json packages/ui/src/generated`.
Expected: PASS. Ran by the audit: 6 of 6, and the test of Step 5 fails on today's code at its first count. The web bridge keeps a made-up plugin entry through a save and a reload, which follow-ups Task 10's test also rests on. If the test of Step 4 fails at "Signed in with your local agent", check the fixture's plugin key first.
Run: `npm run typecheck && npm run lint && npm run test:architecture`

- [ ] **Step 7: Commit.** Subject: `fix(ui): call a provider a local login only when a login is behind it`

  Say two things in the PR description. A saved login whose plugin row is switched off on the Extensions page now shows the placeholder in an editable key field, because a disabled entry does not match. And the Codex clause looks at the key and the address only, while core adds the Codex plugin only for the protocol `openai_responses` (`config-compiler.ts:333-341`), so a placeholder provider at Codex's address on another protocol reads as a login here and has none in core.

**What this changes in follow-ups Task 9.** Apply these when Task 9 is built, and they are noted at the top of that task.

- Its condition `providerEditIndex !== undefined && isLocalAgentLoginDraft(providerDraft)` becomes `providerEditIndex !== undefined && localAgentLoginDraft`, with a new constant beside `claudeLoginProviderDraft` (`App.tsx:1428-1432`): `const localAgentLoginDraft = isLocalAgentLoginDraft(providerDraft, draftConfig.providerPlugins, providerEditIndex === undefined ? undefined : draftConfig.Providers[providerEditIndex]);`. The effect's dependency list gains `localAgentLoginDraft` beside `providerEditIndex`.
- Its sentence "That is a saved provider whose key, or whose first enabled pool key, is the placeholder" gains "and that has a login behind it, as Task 4 of the VM pass findings plan defines". A provider with the placeholder typed by hand is then probed on open, against its saved address with its saved key, which is what its requests send.
- Its sentence "`isLocalAgentLoginDraft` is already imported there, because the next branch uses it" is no longer true. Task 9 adds the name back to `App.tsx`'s import from `./shared/index`.
- This task removes eight lines near the top of `App.tsx`, so every `App.tsx` line that Tasks 9 and 10 cite is 8 lower than written (measured by the audit: `:1499` becomes `:1491`).
- Its bullet on an add draft with the placeholder typed by hand ends "which has no decision yet and is not settled here". This task settles it for the form's text. That draft still keeps its probe.
- Its Step 4 says "the spec's five existing tests unchanged". The spec then has six, one of them changed by this task.
- The intro of PR 3 says "Three tasks, one commit each". It is four.
- The fixture of its test `the edit dialog sends no probe for a saved local login provider` saves the provider with no plugin entry. `openSavedProviderEditDialog` gains a fifth parameter, `providerPlugins: unknown[] = []`, which it writes to `config.providerPlugins`, and that test passes `[{ key: "llmr-local-agent-stand-in-login-codex-oauth", providerName: "Stand-in login" }]`. The control test passes none.

---

### Task 5: The docs say what LLM Router does to a config file's mode and to a linked file (VP-7)

Accepted by the owner, 2026-11-24. **Done the same day**, commit `082624bc` on `main`. The steps below are kept as the record of what was written.

**Evidence.** Every write and restore of an agent's config file sets mode 600 (`profiles/apply-support.ts:15`, and the write sites the record lists). Ran, 2026-11-24, in a temporary folder: a link is kept and its target becomes 600, a read-only target in a folder the user can write is replaced, and a target in a folder the user cannot write is left with an error.

**Files:**
- Modify: `docs/src/content/docs/en/configuration/profiles.md` ("Restore original settings", after the Codex bullet at `:222` and before the paragraph that starts "The message after a restore")

- [x] **Step 1: Add one paragraph** at that place. It names the two main files and not every file, because some side files are written with no mode (`profiles/service.ts:3275`, `profiles/launch-service.ts:1940`, read by the audit):

```md
When LLMR writes an agent's main config file, such as `settings.json` or `config.toml`, it makes the file readable and writable only by you (mode 600), and a restore keeps that mode. If the file is a link, this applies to the file it points to, even one you made read-only. If LLMR cannot write in that file's folder, as in a Nix store, the profile is not applied and the LLMR log has the error.
```

- [x] **Step 2: Check the page.** Read the paragraph in the diff. Run `npm run test:architecture`, which holds the docs checks the commit gate runs. Expected: PASS.

- [x] **Step 3: Commit.** Subject: `docs(profiles): say which mode LLMR gives a config file and what it does with a linked one`

### Task 6: A process watches the gateway it adopted and starts its own when that one is gone

Written 2026-11-24 from "Not in this plan", on the owner's word to write and audit it. Building it needs his word. Its own PR, branch `fix/adopted-gateway-watch`.

**Merged, 2026-11-25: PR 155, `533244e9`, with two changes from its review.** Two reviewers on another model read it, and each finding was checked before it was acted on.

- **The watch is held back while a reload is in flight.** A save or Restart in the adopting process waits up to 20 seconds for the other process to restart (`existing-gateway-probe.ts`, `runtimeConfigReloadTimeoutMs`). The watch fired 10 seconds into that wait. A new test reproduced it on the first commit, with three starts inside the wait. `reloadExternalGatewayConfig` now counts itself in `adoptedGatewayReloads`, and the check returns after its await while that count is above zero. A seventh test pins it, and a mutation that removes the count fails it (run).
- **The message and the helper.** `isGatewayEndpointAnswering` became `gatewayEndpointSilence(endpoint): Promise<string | undefined>`, which returns the reason when nothing answered. The log line carries it as "Last check: ...". The status text is now "The LLM Router gateway at ..., run by another LLM Router process, stopped answering.", because a `/health` that times out is not a gateway that is gone.
- **Not changed, the 10 seconds.** The code reviewer asked for more than 20, since the other process's slowest restart of its own is a 2 second stop plus a 15 second startup limit (`supervisor.ts:32`, read, not reproduced). Kept, because every real exit of the other process would then cost 10 more seconds with nothing answering. The owner's to change.
- **Open with the owner: a stop in the owning process is undone.** When the service is stopped in the process that owns the gateway, a process that adopted it starts its own 10 seconds later. Nothing signals a deliberate stop today. Read by the review, not run.
- **Found after the merge, 2026-11-25, by the audit of keys plan Task 6 (read, not run).** When the process whose gateway was adopted is a profile-managed service, its shutdown restores the agent takeovers, because nothing serves at that moment (`web/management-server.ts:611-617`, `profiles/service.ts:3541-3573`). The watch then brings a gateway back, and nothing applies the profiles again until a save, a model refresh or a restart of the desktop app. So after the first run of the VM check below, the window is green and the agents' own config files no longer point at LLM Router. The restore is older than this PR. Task 7 is the fix. Keys plan Task 6 has the detail.
- **Not changed, older than the PR:** a reload that fails inside `adoptExternalGateway` is never logged, and a start that fails on the core host leaves `gatewayManagedExternally` set.

The text below is the task as it was audited, kept as written. Where it names `isGatewayEndpointAnswering`, the old message or six tests, the merged code has the three changes above.

**Audited once on another model, 2026-11-24.** The audit built the task from this text alone and ran every gate and mutation. It found no Blocker and four Corrections, all applied below: the watch has to act after a failed reload, the retry count has to be reset, one more test for two mutations that survived, and two sentences that were inexact. The session ran the first two again before applying them: each new assertion failed on the task as first written and passed with the change. The text changed by that round was not audited again.

**Evidence.**
- **Run, 2026-11-24, `main` `1fc3603e`.** A service put into the adopted state by `markExternalGatewayRunning`, with every request failing, was left for 3.5 seconds. Its status stayed `running`, it sent no request, and it held no key-poll timer and no restart timer.
- **Read, not run on real processes.** The state is reached with no race. A Grok, Kimi or Pi launch that finds no gateway starts a service of its own (`cli.ts:173`). The desktop app, opened after it, finds that gateway and adopts it (`main-app.ts:228`, `gateway-service.ts:377-391`). When the agent exits, that service stops itself 2 seconds after its last lease is gone (`cli.ts:556-573`). The desktop window then shows a running gateway while nothing answers, until a save, a launch or a restart.
- **Read by the audit, and run.** A save while the adopted gateway is gone makes it worse. The reload fails and leaves `error` with `gatewayManagedExternally` set (`gateway-service.ts:739-745`). From then on a save or the tray's Restart goes to the reload again and fails again (`ipc.ts:224-230`, `gateway-service.ts:416-420`). Only Start, a launch or an app restart recovers it. A model refresh or a key save reaches this with nobody at the window (`main-app.ts:262`, `ipc.ts:386`, `:453`).
- **Prototype, run.** The change below was built as throwaway code with the six tests of Step 1. `core-restart.test.mjs` passed 26 of 26, and `npm run typecheck`, `npm run lint`, `npm run test:architecture` (186 of 186) and `npm run test:core` (2112 tests, 0 failed) passed. The mutations of Step 4 each failed a test, on the session's build or the audit's. The prototype is not in the repo.

**What changes for a user.** A window that adopted another process's gateway goes from green to an error about 10 to 12 seconds after that gateway stops answering, then back to green once this process's own gateway is up, which the restart begins one second later. The first request after the other process quits can still fail during that time.

**Files:**
- Modify: `packages/core/src/gateway/existing-gateway-probe.ts` (a new export before `nonLocalGatewayMessage`)
- Modify: `packages/core/src/gateway/application/gateway-service.ts` (the constants at `:51`, the fields of the class at `:130`, `stopGateway` `:432`, `markExternalGatewayRunning` `:843`, one new method after it)
- Test: `packages/core/test/unit/gateway/core-restart.test.mjs` (six tests and one helper at the end)

**Interfaces:**
- Produces, in `existing-gateway-probe.ts`: `export async function isGatewayEndpointAnswering(endpoint: string): Promise<boolean>`. It returns `(await fetchExistingGateway(endpoint, "/health", {}, 1)).status !== undefined`: one attempt, no key sent, and any HTTP answer counts. One comment gives the why: the compat server answers `/health` with a state that is not `ok`, so `isCoreGatewayHealthy` would call a compat owner gone.
- Produces, in `gateway-service.ts`: `const adoptedGatewayGoneMs = 10_000` and `const adoptedGatewayPollMs = 2000`, and two private fields, `adoptedGatewayGoneSince?: number` and `adoptedGatewayTimer?: NodeJS.Timeout`.
- Changes, `markExternalGatewayRunning`. After it sets the status it clears `adoptedGatewayGoneSince`, clears any earlier `adoptedGatewayTimer`, and sets a new one with `setInterval(() => { void this.checkAdoptedGateway(); }, adoptedGatewayPollMs).unref()`.
- Changes, `stopGateway`. Beside the lines that clear `storedApiKeysTimer` it clears `adoptedGatewayTimer` and sets it to `undefined`. Nothing else clears the timer. In a state the watch skips, it ticks and does nothing until the next `stopGateway`.
- Produces, `private async checkAdoptedGateway(): Promise<void>`, in this order:
  1. Return unless the status has `gatewayManagedExternally`. The state is not checked: a failed reload leaves `error` with the flag set (`:739-745`), and the watch must still act then.
  2. Take `this.coreRestartGeneration`, then `await isGatewayEndpointAnswering(this.status.endpoint)`.
  3. Return if the generation changed during the await, or the status no longer has `gatewayManagedExternally`.
  4. If it answered, clear `adoptedGatewayGoneSince` and return.
  5. Set `adoptedGatewayGoneSince ??= Date.now()`. Return while `Date.now() - adoptedGatewayGoneSince < adoptedGatewayGoneMs`.
  6. Log once with `console.warn`, set the status to `{ ...this.status, gatewayManagedExternally: undefined, lastError, state: "error" }` with `lastError` = `` `The LLM Router gateway at ${this.status.endpoint} that this process was using is gone.` ``, set `this.coreRestartAttempts = 0`, and call `this.scheduleCoreRestart(generation)`. The reset matters: a restart of Task 1 that ended in an adoption leaves the count above zero, and the next restart would then wait up to 30 seconds (`:660`, run by the audit: with a count of 3 the start came at 8 seconds).
  One comment above it gives the why of the wait: the serving process may only be restarting.
- Consumes, unchanged: `scheduleCoreRestart` and the restart path of Task 1. That path adopts another healthy gateway on the port, waits when one refuses this process's key, and starts a child when the port is free. It does not run `stopPreviousManagedCoreGateway`, so it signals no process.

**Why 10 seconds.** The serving process restarts its gateway when a stored key changes, and the gateway is gone for that time. An earlier session measured about 2 seconds for it. A launch already waits 10 seconds for the same restart (`launch-service.ts:484`). If this process started a gateway inside that time, the serving process's own start would then find a healthy gateway named in the marker and signal it (`supervisor.ts:775-800`, read). That is the exchange Task 1 ended.

- [ ] **Step 1: Write the tests.** Append to `core-restart.test.mjs`. `withFetch`, `config` and `createService` are the file's own.

```js
function adoptedService(t) {
  t.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"] });
  const service = createService();
  t.after(() => clearInterval(service.adoptedGatewayTimer));
  service.markExternalGatewayRunning(config(), "http://127.0.0.1:3456", "first-key");
  const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
  const pass = async (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 1_000) {
      t.mock.timers.tick(1_000);
      await settle();
    }
  };
  return { pass, service };
}

test("an adopted gateway that stays gone for the wait is replaced by this process's own, and not sooner", async (t) => {
  const requests = withFetch(t, () => { throw new Error("connection refused"); });
  const { pass, service } = adoptedService(t);
  const starts = [];
  service.startGateway = async (config, generation) => { starts.push([config.gateway.port, generation]); return service.getStatus(); };
  service.coreRestartAttempts = 3;
  await pass(10_000);
  assert.equal(service.getStatus().state, "running");
  assert.equal(service.getStatus().gatewayManagedExternally, true);
  assert.deepEqual(starts, []);
  await pass(2_000);
  assert.equal(service.getStatus().state, "error");
  assert.equal(service.getStatus().gatewayManagedExternally, undefined);
  assert.match(service.getStatus().lastError, /gateway at http:\/\/127\.0\.0\.1:3456 that this process was using is gone/);
  await pass(1_000);
  assert.deepEqual(starts, [[3456, 0]]);
  assert.deepEqual([...new Set(requests.map((request) => `${request.path} ${request.authorization}`))], ["/health null"]);
  const seen = requests.length;
  await pass(30_000);
  assert.equal(requests.length, seen);
});

test("an adopted gateway that answers again within the wait is kept, in either layout", async (t) => {
  let answer = () => { throw new Error("connection refused"); };
  withFetch(t, () => answer());
  const { pass, service } = adoptedService(t);
  service.startGateway = async () => { throw new Error("started a gateway"); };
  await pass(8_000);
  answer = () => Response.json({ status: "running" });
  await pass(2_000);
  answer = () => { throw new Error("connection refused"); };
  await pass(8_000);
  assert.equal(service.getStatus().state, "running");
  assert.equal(service.getStatus().gatewayManagedExternally, true);
  assert.equal(service.coreRestartTimer, undefined);
});

test("a stop ends the watch of an adopted gateway", async (t) => {
  const requests = withFetch(t, () => { throw new Error("connection refused"); });
  const { pass, service } = adoptedService(t);
  await service.stop();
  assert.equal(service.adoptedGatewayTimer, undefined);
  await pass(30_000);
  assert.equal(requests.length, 0);
  assert.equal(service.getStatus().state, "stopped");
});

test("a stop while the adopted gateway is being checked starts nothing", async (t) => {
  let fail;
  withFetch(t, () => new Promise((_resolve, reject) => { fail = reject; }));
  const { pass, service } = adoptedService(t);
  service.adoptedGatewayGoneSince = Date.now() - 60_000;
  await pass(2_000);
  service.cancelCoreRestart();
  fail(new Error("connection refused"));
  await pass(1_000);
  assert.equal(service.getStatus().state, "running");
  assert.equal(service.coreRestartTimer, undefined);
});

test("a save that fails while the adopted gateway is gone still lets the watch replace it", async (t) => {
  withFetch(t, () => { throw new Error("connection refused"); });
  const { pass, service } = adoptedService(t);
  const starts = [];
  service.startGateway = async (_config, generation) => { starts.push(generation); return service.getStatus(); };
  await pass(4_000);
  await service.updateConfig(config()).catch(() => undefined);
  assert.equal(service.getStatus().state, "error");
  await pass(10_000);
  assert.equal(starts.length > 0, true);
});

test("a gateway adopted again is watched once, on the port it serves", async (t) => {
  const requests = withFetch(t, (url) => {
    if (url.port !== "3456") throw new Error("connection refused");
    return Response.json({ status: "ok" });
  });
  const { pass, service } = adoptedService(t);
  service.startGateway = async () => { throw new Error("started a gateway"); };
  service.markExternalGatewayRunning(config(), "http://127.0.0.1:3456", "first-key");
  await pass(14_000);
  assert.equal(requests.length, 7);
  assert.equal(service.getStatus().state, "running");
});
```

- [ ] **Step 2: Run and see it fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/core-restart.test.js`
Expected, ran by the session on `main` `1fc3603e`: 22 pass and 4 fail. The first test fails at `assert.equal(service.getStatus().state, "error")` with `"running"`. The fourth fails with a `TypeError` at `fail(...)`, because no check ran and so no request was ever made. The fifth fails at its last assertion with `false`, and the sixth at `requests.length` with 0. The second and third pass on today's code, because nothing watches and nothing starts. Each of them is held by a mutation in Step 4.

- [ ] **Step 3: Implement** as Interfaces says.

- [ ] **Step 4: Verify.**

Run: the command of Step 2. Expected: 26 of 26 pass (ran on the prototype).
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`
Expected: all pass (ran on the prototype).
Mutations, each alone, each expected to fail the test named (the first five ran on the session's first prototype and again in the audit, the last four in the audit or the session's second run):
- Remove the return of point 5. Fails the first and second tests.
- Remove the clearing of `adoptedGatewayGoneSince` in point 4. Fails the second test.
- Remove the generation comparison of point 3. Fails the fourth test.
- Remove the two lines added to `stopGateway`. Fails the third test.
- Make `isGatewayEndpointAnswering` true only when the body's `status` is `ok`. Fails the second test.
- Put the `running` check back into point 1. Fails the fifth test.
- Remove the reset of `coreRestartAttempts`. Fails the first test.
- Ask `this.status.coreEndpoint` in place of `this.status.endpoint`. Fails the sixth test.
- Leave the earlier interval uncleared in `markExternalGatewayRunning`. Fails the sixth test.

Known to survive, and left: three fetch attempts in place of one, and the reset of `adoptedGatewayGoneSince` in `markExternalGatewayRunning` removed. The next failing check starts a fresh wait either way (read by the audit).

- [ ] **Step 5: Commit.** Subject: `fix(gateway): watch an adopted gateway and start one when it is gone`

**VM check, for the owner, on the build that holds this task.** Two runs.
1. With no LLM Router process running, open a Grok, Kimi or Pi profile from a terminal, then open the desktop app. Quit the agent. Expected: the desktop window shows an error within about 15 seconds and is green again a few seconds later, and a stored key answers on the gateway port.
2. Open the desktop app, then run `llmr start`, then `llmr stop`. Expected: the same.
In both, watch the port for five minutes after. Expected: one owner.

**Not in this task.**
- **The first seconds after the other process quits.** Requests fail until this process's gateway is up, about 12 seconds plus the start. A shorter wait would bring back the exchange of owners.
- **The config the new gateway starts from.** It is the config of the last adoption or reload that worked. A save whose reload failed is not in it. A process that never ran a gateway of its own has no stored-key baseline, so a key another process stored after the adoption is not accepted until this process saves or restarts (read at `gateway-service.ts:776-777`, not run).
- **An adopted gateway that answers but no longer accepts this process's key.** The watch sends no key and does not see it.
- **The save and Restart paths while the flag is set.** They still go to the reload of the adopted gateway (`ipc.ts:224-230`, `gateway-service.ts:416-420`). With the watch that state ends by itself within about 12 seconds, so they are left as they are.
- **The warning logged twice.** Two checks that overlap can both reach point 6. The second restart is not scheduled (`:659`), and the line is printed twice (read by the audit).
- **Two adopters of one gateway.** Both start when it is gone. One child loses the port, and that process's restart adopts the other (inferred from Task 1, not run).

**After this task.** Keys plan Task 5 took one change out of PR 154: a Grok, Kimi or Pi launch that starts its own service when the gateway is gone at the end of the launch's wait. The owner accepted that change on 2026-11-24, and it was withdrawn because the desktop app, having adopted that service, would be left with nothing answering when the agent exits. This task removes that reason. The two-line change can then go back as its own task, with a real-process run before it merges.

---

### Task 7: A process that starts a gateway in place of the one it adopted applies the agent configs again

**Merged, 2026-11-25: PR 156, `92c8cf3f`, batch 1, with one defect fixed by its review.** The task passed the config the process held to the apply. A reviewer found, and a test then showed, that a held config older than a save by the other process makes the apply remove a new profile's key from the key store and take over an agent that was switched off. As merged, `applyTakeoversAfterGatewayReplaced()` takes no argument and reads the stored config, as the restore does, and the handler is `() => unknown`. So the line "The config applied" under "Not in this task" below no longer holds. Both host lines are pinned by `tests/architecture/gateway-takeover-wiring.test.mjs`, since removing one passed the whole core suite. Left by the review, with no task: a failed apply after a takeover reaches no log a person reads and is not retried, as with the startup apply; and no test covers the Claude App config being applied again or the load-error return.

Written 2026-11-25 on the owner's word, from the audit of keys plan Task 6. Building it needs his word. Its own PR, branch `fix/apply-takeovers-after-takeover`. Keys plan Task 6 waits on it.

**Audited once on another model, 2026-11-25.** The audit built the task from this text, ran every gate and mutation, and ran the two-process case for real: one process applied a global Claude Code profile, a child process sharing its temporary home ran the restore, and the first applied again. It found no Blocker and six Corrections, all applied below. The largest changes the design: the stale record is fixed where it is kept, in `storeGlobalProfileTakeoverRecords`, and the reset this task first put in the new function is gone. The session ran that change again before applying it, with every gate. The text changed by that round was not audited again.

**The fault.** A process that stops its gateway restores the agent configs it took over when no LLM Router gateway serves at that moment (`profiles/service.ts`, `restoreTakeoversWhenNoGatewayServes`, called from `web/management-server.ts:561` and `:616`, `electron/src/main/ipc.ts:417` and `main-app.ts:197`). That is right at that moment: the agents would otherwise point at nothing. A process that had adopted that gateway then starts its own about 12 seconds later (Task 6), and nothing applies the configs again. A profile is applied only at startup and after a save or a model refresh (`main-app.ts:233` and `:264`, `management-server.ts:595` and `:622`). So the window is green, a gateway answers, and a global profile's agent settings and the Claude App gateway config no longer point at LLM Router, until a save, a model refresh or a restart. It runs both ways: a service that stops beside the desktop app, and the desktop app that quits beside a service.

**Evidence.**
- **Read, 2026-11-25, `main` `a623b76c`.** The restore and every caller of `applyProfileConfig`. No call sits on the path from the watch to a running gateway (`gateway-service.ts`, `checkAdoptedGateway`, `scheduleCoreRestart`, `startGateway`).
- **Run in two processes, by the audit.** Process A applied a global Claude Code profile in a temporary home. A child process B sharing that home ran `restoreTakeoversWhenNoGatewayServes`: the settings no longer pointed at the gateway and the marker file was gone. A applied again through the function below: the settings pointed at the gateway and the marker was back. B restored again and the user's own settings came back. With B killed before it restored, two more applies by A added no backup file and left the user's saved original alone.
- **The stale record, run.** After B's restore, an ordinary `applyProfileConfig` in A wrote the settings and left no marker file, because A's own record in memory still matched (`storeGlobalProfileTakeoverRecords`, the early return). That holds for every apply in A, a save and a model refresh included, not only this task's.
- **Prototype, run.** The change below with its eight tests: `core-restart.test.mjs` 34 of 34, the new integration test 1 of 1, and `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `test:core`, `test:ui`, `test:electron` and `test:cli` passed. The mutations of Step 4 each failed a test. The prototype is not in the repo.
- **Not run.** Two long-running LLM Router processes with a real gateway. Codex, OpenCode and Pi global profiles, and the Claude App config file, across the two-process run.

**What changes for a user.** After a service or the desktop app stops and another LLM Router process takes the gateway over, that process applies the profiles again as it does at its own startup. The agents' config files point at LLM Router again a second or two after the window turns green.

**Files:**
- Modify: `packages/core/src/gateway/application/gateway-service.ts` (two fields, one setter, `cancelCoreRestart`, the timer callback of `scheduleCoreRestart`, `checkAdoptedGateway`, one new method)
- Modify: `packages/core/src/profiles/service.ts` (`syncClaudeAppGatewayConfig` joins an existing import, one new export before `synchronizeGlobalProfileTakeovers`, one condition in `storeGlobalProfileTakeoverRecords`)
- Modify: `packages/core/src/web/management-server.ts` (`applyTakeoversAfterGatewayReplaced` joins the existing import from `@llmr/core/profiles/service`, one line in `startWebManagementServer`)
- Modify: `packages/electron/src/main/main-app.ts` (the same import, one line in `startPrimaryInstance`)
- Test: `packages/core/test/unit/gateway/core-restart.test.mjs` (seven tests and two helpers at the end)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs` (one test, before "a shared-home Claude Code profile never writes ~/.claude ...")

**Interfaces:**
- Produces, in `gateway-service.ts`: two private fields, `adoptedGatewayReplaced = false` and `adoptedGatewayReplacedHandler?: (config: AppConfig) => unknown`, and a public `setAdoptedGatewayReplacedHandler(handler: (config: AppConfig) => unknown): void` beside `setBrowserAutomationMcpIntegration`. One comment on the setter gives the why: the process that served the adopted gateway restores the agent configs when it stops, so the host applies them again once this process serves.
- Changes, `checkAdoptedGateway`. In its last step, before `this.scheduleCoreRestart(generation)`, it sets `this.adoptedGatewayReplaced = true`.
- Changes, `cancelCoreRestart`. It sets `this.adoptedGatewayReplaced = false`, so a `stop` or `start` that comes in between tells the host nothing. The host callers of `ensureStarted`, `restart` and `stop` apply or restore after their own call. Three callers of `gatewayService.start` apply nothing after it: `deep-link.ts:142` and `:196`, and `ensureProfileGateway` (`launch-service.ts:460`). "Not in this task" has that case.
- Changes, the timer callback of `scheduleCoreRestart`. After `const status = await recovery;` the line `if (status.state === "error") this.scheduleCoreRestart(generation);` gains `else this.tellHostAdoptedGatewayReplaced(status);`.
- Produces, `private tellHostAdoptedGatewayReplaced(status: GatewayStatus): void`. It reads `adoptedGatewayReplaced` and clears it. It returns unless it was set, a config is held, `status.state` is `running` and `status.gatewayManagedExternally` is not set. Otherwise it calls the handler with the held config through `void Promise.resolve().then(...).catch(...)`, and the `catch` logs with `console.warn`. A restart that fails leaves the flag set, because the callback schedules another and does not call this method. A restart that adopts another gateway clears it and tells nothing: the process that serves applied its own.
- Produces, in `profiles/service.ts`: `export async function applyTakeoversAfterGatewayReplaced(config: AppConfig): Promise<void>`. It never throws. In order: it returns, logging with `console.error`, when `appConfigLoadError(config)` is set, because a host that adopted after a failed load holds the default config and a sync of that would restore the Claude App config while a gateway serves; then `syncClaudeAppGatewayConfig(config)` in a `try` whose `catch` logs, keeping the config it returns; then, in a second `try` whose `catch` logs, `applyProfileConfig(<that config>, { excludeAgents: ["zcode"] })`, logging each client that is not `ok` with `console.error`. `syncClaudeAppGatewayConfig` joins the existing import from `@llmr/core/agents/claude-app/gateway-service`.
- Changes, `storeGlobalProfileTakeoverRecords`. Its early return becomes `if (JSON.stringify(previous) === JSON.stringify(records) && (records.length === 0) !== existsSync(globalProfileTakeoverFile)) { return; }`. One comment gives the why: another LLM Router process can clear the marker file as it stops, so matching records in memory do not show the file is there. It costs one `existsSync` per apply.
- Changes, both hosts: `gatewayService.setAdoptedGatewayReplacedHandler(applyTakeoversAfterGatewayReplaced);`. In `management-server.ts` it is the first line inside `if (options.startGateway !== false)` of `startWebManagementServer`. In `main-app.ts` it goes beside the two `gatewayService.set...Integration` calls of `startPrimaryInstance`.
- Not changed: `restoreTakeoversWhenNoGatewayServes`, `startGateway`, `reconcileProfileApiKeys` (the apply does its work itself, read by the audit), what a crash restart of this process's own gateway does (nobody restored anything then, and each apply can add a backup file), ZCode, which both hosts leave out of the startup apply too.

- [ ] **Step 1: Write the tests.** Append to `core-restart.test.mjs`. `adoptedService`, `withFetch` and `config` are the file's own.

```js
function replacingService(t, startGateway) {
  withFetch(t, () => { throw new Error("connection refused"); });
  t.mock.method(console, "warn", () => {});
  const adopted = adoptedService(t);
  const told = [];
  adopted.service.setAdoptedGatewayReplacedHandler((config) => { told.push(config.gateway.port); });
  adopted.service.startGateway = async () => startGateway(adopted.service);
  return { ...adopted, told };
}

const ownGatewayRuns = (service) => {
  service.status = { ...service.status, gatewayManagedExternally: undefined, lastError: undefined, state: "running" };
  return service.getStatus();
};

test("a process that starts a gateway in place of the one it adopted tells its host once", async (t) => {
  const { pass, told } = replacingService(t, ownGatewayRuns);
  await pass(12_000);
  assert.deepEqual(told, []);
  await pass(1_000);
  assert.deepEqual(told, [3456]);
  await pass(60_000);
  assert.deepEqual(told, [3456]);
});

test("the host is told when the gateway starts, not on a start that fails first", async (t) => {
  let attempts = 0;
  const { pass, told } = replacingService(t, (service) => {
    attempts += 1;
    if (attempts > 1) return ownGatewayRuns(service);
    service.status = { ...service.status, lastError: "port taken", state: "error" };
    return service.getStatus();
  });
  await pass(13_000);
  assert.deepEqual(told, []);
  await pass(2_000);
  assert.deepEqual(told, [3456]);
});

test("the host is not told when the restart adopts another gateway", async (t) => {
  const { pass, service, told } = replacingService(t, (current) => {
    current.markExternalGatewayRunning(config(), "http://127.0.0.1:3456", "first-key");
    return current.getStatus();
  });
  service.startGateway = ((adopt) => async () => {
    globalThis.fetch = async () => Response.json({ status: "ok" });
    return adopt();
  })(service.startGateway);
  await pass(20_000);
  assert.equal(service.getStatus().gatewayManagedExternally, true);
  assert.deepEqual(told, []);
});

test("a stop between the takeover and the restart tells the host nothing, and neither does a later crash", async (t) => {
  const { pass, service, told } = replacingService(t, ownGatewayRuns);
  await pass(12_000);
  assert.equal(service.getStatus().state, "error");
  service.cancelCoreRestart();
  service.child = {};
  service.status = { ...service.status, state: "running" };
  await service.handleCoreGatewayTermination(service.child, undefined, "Core gateway exited with SIGTERM.");
  await pass(5_000);
  assert.equal(service.getStatus().state, "running");
  assert.deepEqual(told, []);
});

test("a host whose handler throws leaves the gateway running", async (t) => {
  const { pass, service } = replacingService(t, ownGatewayRuns);
  service.setAdoptedGatewayReplacedHandler(() => { throw new Error("could not write"); });
  await pass(14_000);
  assert.equal(service.getStatus().state, "running");
  assert.equal(service.coreRestartTimer, undefined);
});

test("the host is not told when the restart leaves the gateway stopped", async (t) => {
  const { pass, told } = replacingService(t, (service) => {
    service.status = { ...service.status, gatewayManagedExternally: undefined, state: "stopped" };
    return service.getStatus();
  });
  await pass(20_000);
  assert.deepEqual(told, []);
});

test("a crash of the gateway that replaced the adopted one does not tell the host again", async (t) => {
  const { pass, service, told } = replacingService(t, (current) => {
    current.child = {};
    return ownGatewayRuns(current);
  });
  await pass(13_000);
  assert.deepEqual(told, [3456]);
  await service.handleCoreGatewayTermination(service.child, undefined, "Core gateway exited with SIGTERM.");
  await pass(5_000);
  assert.equal(service.getStatus().state, "running");
  assert.deepEqual(told, [3456]);
});
```

  In `profile-service.test.mjs`, add `applyTakeoversAfterGatewayReplaced` to the import from `@llmr/core/profiles/service.ts`, and before the shared-home test:

```js
test("takeovers another process restored are applied again by the process that takes over the gateway", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const takeoverFile = path.join(CONFIGDIR, "global-profile-takeover.json");
  const settingsFile = path.join(process.env.LLMR_INTERNAL_HOME_DIR, ".claude", "settings.json");
  const original = `${JSON.stringify({ theme: "dark" }, null, 2)}\n`;
  const profile = { agent: "claude-code", enabled: true, env: {}, id: "default-claude-code", model: "Provider/model", name: "Claude Code", scope: "global", settingsFile: "~/.claude/settings.json", smallFastModel: "", surface: "auto" };
  const config = createDefaultAppConfig();
  config.APIKEY = "llmr-profile-takeover-again-test";
  config.APIKEYS = [{ createdAt: "2026-01-01T00:00:00.000Z", id: `profile:${profile.id}`, key: "llmr-profile-takeover-again-test", name: "Profile: Claude Code" }];
  config.Providers = [{ api_base_url: "https://example.test/v1", api_key: "provider-key", models: ["model"], name: "Provider" }];
  config.profile.enabled = true;
  config.profile.profiles = [profile];
  const pointsAtGateway = () => Boolean(JSON.parse(readFileSync(settingsFile, "utf8")).apiKeyHelper);
  try {
    rmSync(takeoverFile, { force: true });
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, original);
    await applyProfileFixture(config);
    assert.equal(pointsAtGateway(), true);
    const marker = readFileSync(takeoverFile, "utf8");

    // What another process does to the files as it stops, which leaves this process holding its own record of them.
    writeFileSync(settingsFile, original);
    rmSync(takeoverFile);

    await applyTakeoversAfterGatewayReplaced(config);
    assert.equal(pointsAtGateway(), true);
    assert.equal(readFileSync(takeoverFile, "utf8"), marker);
  } finally {
    restoreGlobalProfileConfigsOnExit([], { manageMarker: true });
    rmSync(takeoverFile, { force: true });
    rmSync(path.dirname(settingsFile), { force: true, recursive: true });
  }
});
```

- [ ] **Step 2: Run and see them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/core-restart.test.js`
Expected: 27 pass and 7 fail, each new test with `TypeError: adopted.service.setAdoptedGatewayReplacedHandler is not a function`. Ran by the session and the audit on `main` `a623b76c` with the first five tests, 27 pass and 5 fail. The last two use the same helper.
The integration file does not build until the export exists, so its test is run in Step 4.

- [ ] **Step 3: Implement** as Interfaces says.

- [ ] **Step 4: Verify.**

Run: the command of Step 2. Expected: 34 of 34 (ran on the prototype).
Run: `node --test --test-name-pattern="takeovers another process restored" .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected: 1 pass (ran on the prototype).
Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron && npm run test:cli`
Expected: all pass (ran on the prototype).
Mutations, each alone, each expected to fail the test named (ran on the prototype):
- Put the early return of `storeGlobalProfileTakeoverRecords` back without the check of the file. Fails the integration test at the marker file.
- Skip the `applyProfileConfig` call. Fails the integration test at the settings file.
- Remove the clearing in `cancelCoreRestart`. Fails "a stop between the takeover and the restart ...".
- Tell the host whether or not the flag was set. Fails the same test.
- Drop the check of `gatewayManagedExternally`. Fails "the host is not told when the restart adopts another gateway".
- Remove the line that sets the flag in `checkAdoptedGateway`. Fails the first two new tests.
- Call the handler with no `catch`. Fails "a host whose handler throws leaves the gateway running".
- Drop the check that the state is `running`. Fails "the host is not told when the restart leaves the gateway stopped" (ran by the audit).
- Leave the flag set once the host is told. Fails "a crash of the gateway that replaced the adopted one ..." (ran by the audit).

Known to survive, and left: skipping `syncClaudeAppGatewayConfig`, and dropping the ZCode exclusion. Neither has a test.

- [ ] **Step 5: Commit.** Subject: `fix(profiles): apply the agent configs again when a process takes over an adopted gateway`

**VM check, for the owner, on the build that holds this task.** The two runs of Task 6's VM check, with one more look in each: after the window is green again, a global profile's agent settings file and the Claude App gateway config point at LLM Router.

**Not in this task.**
- **A Stop in the process that owns the gateway.** A process that had adopted it starts its own gateway (Task 6) and now applies the agent configs again as well. Nothing signals a deliberate stop. This is the one way this task is worse for a user than today (inferred), and it is open with the owner under Task 6.
- **A start in the window that applies nothing.** A plugin-app deep link or a profile open that starts the gateway between the takeover and the restart clears the flag and applies no profiles (`deep-link.ts:142`, `:196`, `launch-service.ts:460`), so the configs stay restored until the next save, refresh or restart. The window is the one second before the restart, or longer while the port is held (read, not run).
- **A restore is not byte for byte.** It can leave an empty `env` object in a settings file that had none (seen by the audit's run). Older than this task.
- **The seconds in between.** From the other process's restore to this process's apply, about 12 seconds, the agents run on their own configs. That is the state the restore is for.
- **The host wiring has no test.** Each host gets one line. The function it registers is tested, and so is the call of whatever is registered.
- **A second backup file.** Each apply of a global profile can add a backup of the file it takes over (VP-8, the restore plan's fix round).
- **The config applied.** It is the one this process held when its gateway started, not a fresh read of the stored one.
- **A process that adopts again.** It tells its host nothing, on the reading that the process which serves applied its own at its start. A third process that is neither is not covered (inferred).

---

### Task 8: A key restart that fails gets the restart a crash gets

**Merged, 2026-11-25: PR 156, `92c8cf3f`, batch 1, with two faults of this text fixed on the way.** First, the test of Step 1 passed alone and failed with its file: an older test in `stored-api-keys-watch.test.mjs` corrupts the stored config and does not put it back, so the reload never reached the start. The two tests sit before "a key reload onto a stored config that would not run the gateway is refused", and the guard test sets `service.config`, without which its mutation survived. Second, the review found that the line of Interfaces reads the generation after the start has finished, so a stop that came in while the start ran was undone a second later (reproduced by a test). As merged, the generation is taken when `start` is called and before it is awaited, and a third test covers a stop during the start. The key reload's failure record is also cleared when a start reaches running. The steps below are the text as first written.

Written 2026-11-25 from the research on the owner's four open questions. Batch 1 of the delivery order, after Task 7. Not audited as text: it is under 100 lines and is reviewed with its code, as the delivery order says.

**The fault, run 2026-11-25 on `main` `d9a40cc7`.** When a stored key changes, the gateway restarts itself (`gateway-service.ts`, `checkStoredApiKeys`, `reloadPersistedRuntimeConfig`). If that start fails, the status is `error`, and nothing tries again: the key poll does nothing unless the state is `running`, and a start that is not a recovery schedules none. A throwaway test made the start fail, moved the clock two minutes on and ticked the poll eight times. One start, state `error`, no restart scheduled. A crash of a running gateway does get a restart, which adopts another LLM Router gateway on the port, waits when one refuses this process's key, or starts a child (Task 1).

**Why it matters here.** It is case 3 of keys plan Task 6, the worst one: a process restarting for a stored key loses the port to a service a launch started, ends in `error`, and stays there until someone clicks Start. With this task that process adopts the service's gateway, watches it (Task 6) and applies the agent configs again when it takes over (Task 7).

**Prototype, run.** Two lines in the `catch` of `reloadPersistedRuntimeConfig`. The same throwaway test then saw one restart scheduled. `stored-api-keys-watch.test.mjs` and `core-restart.test.mjs` passed, 40 of 40 with the throwaway test. The full suites were not run on it.

**Files:**
- Modify: `packages/core/src/gateway/application/gateway-service.ts` (the key poll's branch of the `catch` in `reloadPersistedRuntimeConfig`)
- Test: `packages/core/test/unit/gateway/stored-api-keys-watch.test.mjs` (one test at the end)

**Interfaces:**
- Changes, `reloadPersistedRuntimeConfig`. In its `catch`, in the branch the key poll takes, after `this.storedApiKeysRetryAt` is set: `if (this.status.state === "error" && this.config) this.scheduleCoreRestart(this.coreRestartGeneration);`. One comment gives the why: the poll stops while the gateway is down, so a start that failed here gets the restart a crash gets.
- Not changed: a reload another process or a save asked for. Its caller is told of the failure and can act. A failure that leaves the gateway running, such as a stored config that would not run it, keeps today's retry a minute later.

- [ ] **Step 1: Write the failing test.** Append to `stored-api-keys-watch.test.mjs`. `runningService`, `first` and `second` are the file's own.

```js
test("a key restart that fails gets the restart a crash gets", async (t) => {
  t.mock.method(console, "error", () => {});
  const { service } = await runningService([first]);
  delete service.schedulePersistedRuntimeConfigReload;
  service.child = undefined;
  service.server = {};
  service.start = async (config) => {
    service.config = config;
    service.status = { ...service.status, lastError: "Core gateway exited during startup with 1.", state: "error" };
    return service.getStatus();
  };
  const scheduled = [];
  service.scheduleCoreRestart = (generation) => { scheduled.push(generation); };
  await loadAppConfig();
  await service.rememberStoredApiKeys();
  await updatePersistedApiKeys((current) => [...current, second]);
  for (let tick = 0; tick < 4; tick += 1) {
    await service.checkStoredApiKeys();
    await service.runtimeConfigReloadQueue;
  }
  assert.deepEqual(scheduled, [service.coreRestartGeneration]);
});

test("a key reload that is refused while the gateway runs schedules no restart", async (t) => {
  t.mock.method(console, "error", () => {});
  const { service } = await runningService([first]);
  const scheduled = [];
  service.scheduleCoreRestart = (generation) => { scheduled.push(generation); };
  service.start = async () => service.getStatus();
  await loadAppConfig();
  await service.reloadPersistedRuntimeConfig(undefined, false);
  assert.deepEqual(scheduled, []);
});
```

- [ ] **Step 2: Run and see it fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/stored-api-keys-watch.test.js`
Expected: the first new test fails at its last assertion with `[]` (ran as a throwaway on today's code, which printed no restart scheduled). The second passes on today's code and is the guard: remove the `state === "error"` condition and it fails (read, not run).

- [ ] **Step 3: Implement** as Interfaces says.

- [ ] **Step 4: Verify.** The command of Step 2, then `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`.

- [ ] **Step 5: Commit.** Subject: `fix(gateway): restart after a key reload that failed to start`

**VM check, for the end pass.** None of its own. It changes what Task 6's and keys plan Task 6's checks can show.

**Not in this task.** A start a person asked for that fails is left with its error, as today.

---

## Self-review

- **Coverage.** The adopted gateway nobody watches is Task 6. VP-3 is Task 3. VP-4 and VP-5 are Task 1. VP-6 is Task 2. VP-7 is Task 5. VP-9 is Task 4. VP-8 and the key line left in a profile's own settings file have no task, and "Not in this plan" says why. VP-1 is Task 8 of the follow-ups plan and VP-2 needs nothing.
- **Steps.** Every test step gives a name and its assertions with made-up values. Tasks 2, 3 and 4 add an export or a stub before their first run and say so.
- **Names across tasks.** `hasLocalAgentLoginKey` and the three-parameter `isLocalAgentLoginDraft` come from Task 4 and are used by follow-ups Task 9 as this plan's Task 4 says. `savedLoginAddressChanged` of follow-ups Task 10 takes the same three parameters in the same order. Nothing else crosses a task.
- **Order.** Task 1 needs keys plan Task 4. Task 2 needs nothing. Task 3 needs the VM check. Task 4 goes between follow-ups Tasks 8 and 9. Task 5 needs nothing.
- **Proportion.** The code of the five tasks is about 60 lines. The plan is longer than that because each task carries its evidence and its VM check.

## Not verified

- The test of the 500 answer in Task 1 on today's code. It ran only against the change.
- One mutation claim of Task 1, the normal start in the refusing case.
- What a process that adopted a gateway does when the serving process quits, on real processes. A unit run shows it notices nothing today. Task 6 ran as a prototype against the unit tests only.
- Task 6 with two adopters, with a slow `/health`, and how often the desktop window and the tray read the status, so whether the short error is seen. Inferred or not looked at.
- The mixed layout under "Not in this plan", which was read and not run.
- Task 1 with keys plan Task 4 applied. The research ran a full-list owner as a stand-in for it.
- A service of an older version beside a build with Task 1, and the yielding side taking the port again after the other process quits. Both inferred.
- Task 3 against the released app, with several instances of one app, on another Space, and from a process whose parent is the CLI service and not the desktop app. Step 1 and the VM check after the task cover the first three.
- Task 4's change in the app itself. Its rule ran in a scratch bundle and in the audit's throwaway build, with the unit, component and end-to-end tests.
- The docs paragraph of Task 5 on a real Nix, stow or chezmoi setup. The cases ran on plain folders and modes. That a failed apply shows only in the log is inferred.
