# VM Pass Findings Implementation Plan

> **Status, 2026-11-24: written from the second research pass, audited once on another model, the owner accepted every recommendation, Tasks 1 and 2 merged on 2026-11-24 as PR 152 after keys plan Task 4 merged as PR 151. Task 3 waits on the owner's VM check, and Task 4 goes into follow-ups PR 3.** On 2026-11-24 the owner accepted the recommendation for each of the seven findings, so no decision is open and the lines below that say a task "waits on the owner's answer" are settled. Building each PR still needs his word, as does each merge. Task 5 is a docs paragraph and was committed the same day. Nothing else was built. The audit wrote every test below as given and ran it on today's code, then against the smallest change each Interfaces block describes, in a throwaway worktree. It found 1 Blocker, in a fixture of Task 4, and 10 Corrections. All are applied. The text changed by that round was then reviewed by the session on 2026-11-24. It ran the one test added after the audit in the audit's worktree (17 of 17) and one more mutation. It found one gap behind Task 1's VM check, an adopted gateway that nobody watches, which is now under "Not in this plan".

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

## Not in this plan

- **One change of owner.** A second process that calls `start` still stops the first one's child once, and requests in flight are dropped. Task 1 ends the exchange after that. Removing the first stop means `ensureStarted` in the seven callers that start with no probe, which the record lists. One of them is the app-profile open (`profiles/launch-service.ts:463`), where keys plan Task 4 already notes that an open restarts a gateway that serves the same config. Not run.
- **An adopted gateway that nobody watches.** A process that has adopted another process's gateway shows `running` and runs no timer for it. The stored-key poll skips an adopted gateway (`gateway-service.ts:752`), and no other check of it exists (run by the session, a search for `gatewayManagedExternally`). So when the serving process quits, the adopter stays green while nothing answers, until a save, a launch or a restart calls `ensureStarted` or `start`. This is today's behaviour for a service started beside a running one, and Task 1 makes adoption the outcome of more cases. Read, not run. Recommended as the next task after this plan's VM check shows it: a health check of the adopted gateway on the timer the key poll uses, which starts this process's own gateway when the other one is gone. Not written, and it needs the owner's word.
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
4. Task 3, its own PR, branch `fix/app-activation-no-apple-event`, after the owner's VM check.
5. Follow-ups PR 3 with Task 4 of this plan as its second commit: Task 8, this Task 4, Task 9, Task 10.
6. Task 5, a docs commit on `main`. Done, `082624bc`.

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

Accepted by the owner, 2026-11-24. It still waits on the VM check of Step 1. Its own PR.

Opening or reopening an App profile brings that app's window forward and raises no macOS prompt.

**Evidence.** `activateProfileAppWindow` asks System Events to set a process frontmost (`profiles/launch-service.ts:979-1003`). That is an Apple Event, and macOS asks the user for it once, in LLM Router's name, with no explanation. A refusal is kept, and the activation then fails with no sign. Ran, 2026-11-24, macOS 27.2: `osascript -l JavaScript` with `NSRunningApplication` brought Finder forward and then the first app again, and printed `true` both times. That call sends no Apple Event. Not run: the released app, and two instances of one app.

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts` (`activateProfileAppWindow` `:979-1003`)
- Test: `packages/core/test/unit/profiles/profile-app-process-detection.test.mjs`

**Interfaces:**
- Produces, in `launch-service.ts`, beside the two `...ForTest` exports (`:1114`, `:1171`): `export function profileAppActivationCommandForTest(pid: number): { args: string[]; command: string }`. It returns `command: "/usr/bin/osascript"` and `args: ["-l", "JavaScript", "-e", script]`, where `script` is exactly `` `ObjC.import("AppKit"); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid}).activateWithOptions(2)` ``. The option `2` is `NSApplicationActivateIgnoringOtherApps`, the value the run used.
- Changes, `activateProfileAppWindow`. Its `spawn` takes the command and the arguments from that function. The alive check becomes `if (pid === undefined || !isProcessAlive(pid)) return;`, because the pid there is `number | undefined` and the new function takes a number (typecheck fails without it, ran by the audit). The two delays, `detached`, `stdio: "ignore"`, `unref` and the seven callers stay. The comment in its `catch` stays. Apple marks option `2` as deprecated since macOS 14, where an activation became a request. It is the value that ran.

- [ ] **Step 1: The owner's VM check, before any code.** On the VM with released 9.0.0: start two Claude Code App profiles, so that two Claude instances run. Put Terminal in front. Find the main process id of the instance further back with `ps -axo pid,command | grep -- --user-data-dir`. Run `sleep 3; osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSRunningApplication.runningApplicationWithProcessIdentifier(<pid>).activateWithOptions(2)'` and click another window during the three seconds. Expected: no prompt, `true` printed, and that instance in front. Repeat five times, and once with the instance on another Space. If any run prompts, prints `false` or leaves the window behind, stop. The record's section "VP-3, run and documented" then has the change to build in place of this task, under "If the VM check fails".

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

---

## Self-review

- **Coverage.** VP-3 is Task 3. VP-4 and VP-5 are Task 1. VP-6 is Task 2. VP-7 is Task 5. VP-9 is Task 4. VP-8 and the key line left in a profile's own settings file have no task, and "Not in this plan" says why. VP-1 is Task 8 of the follow-ups plan and VP-2 needs nothing.
- **Steps.** Every test step gives a name and its assertions with made-up values. Tasks 2, 3 and 4 add an export or a stub before their first run and say so.
- **Names across tasks.** `hasLocalAgentLoginKey` and the three-parameter `isLocalAgentLoginDraft` come from Task 4 and are used by follow-ups Task 9 as this plan's Task 4 says. `savedLoginAddressChanged` of follow-ups Task 10 takes the same three parameters in the same order. Nothing else crosses a task.
- **Order.** Task 1 needs keys plan Task 4. Task 2 needs nothing. Task 3 needs the VM check. Task 4 goes between follow-ups Tasks 8 and 9. Task 5 needs nothing.
- **Proportion.** The code of the five tasks is about 60 lines. The plan is longer than that because each task carries its evidence and its VM check.

## Not verified

- The test of the 500 answer in Task 1 on today's code. It ran only against the change.
- One mutation claim of Task 1, the normal start in the refusing case.
- What a process that adopted a gateway does when the serving process quits. Read, not run.
- The mixed layout under "Not in this plan", which was read and not run.
- Task 1 with keys plan Task 4 applied. The research ran a full-list owner as a stand-in for it.
- A service of an older version beside a build with Task 1, and the yielding side taking the port again after the other process quits. Both inferred.
- Task 3 against the released app, with several instances of one app, on another Space, and from a process whose parent is the CLI service and not the desktop app. Step 1 and the VM check after the task cover the first three.
- Task 4's change in the app itself. Its rule ran in a scratch bundle and in the audit's throwaway build, with the unit, component and end-to-end tests.
- The docs paragraph of Task 5 on a real Nix, stow or chezmoi setup. The cases ran on plain folders and modes. That a failed apply shows only in the log is inferred.
