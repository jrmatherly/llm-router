# Backlog: Test Harness, CI and the Gateway Fork Implementation Plan

> **Status, 2026-11-25 (UTC): Tasks 1, 2 and 3 audited on another model at `main` `fddb278a` and corrected; Tasks 4, 5 and 6 still owe their text audit.** The audit built Tasks 1 and 2 in a throwaway worktree and ran every suite (3 Blockers, 4 Corrections), and built Task 3 with the stripper plan's Task 1 (no Blocker, 5 Corrections across the two). The session reproduced two Blockers itself before changing the text: `process.argv[1]` is missing in an `-e` child, and a worker given an `env` object is guarded without the runner. The third narrowed Task 1's title. The audits are outside the repo, `private/audits/2026-11-25-audit-batch3-*.md`. What follows is the fix round's status, which the audit did not change. Every Blocker and Correction of the 2026-11-22 audit was checked against `main` at `c491eb48` and the fork at `4d902e6` (`v1.0.22-llmr.4`), and the task text below is corrected for each one that holds. A throwaway copy of Task 2's guard ran under every package suite and the architecture suite (run, all green, 29 refusals). The connections it found are listed under Task 2, Step 7. Not verified in this round: anything on a Windows or Intel Mac runner, `smol-toml` against LLM Router's Codex output, the fork's vitest suite, and the corrected text as a whole. The delivery index asks for one audit of the changed text on another model before batch 3 is built.

> **Delivery, 2026-11-25.** [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md) groups this plan's unbuilt tasks into batches with other plans' tasks and sets the order. It overrides this plan's lines on branches, on one PR per task, and on waiting for a VM check: the owner's VM pass comes once, at the end.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who works on LLM Router can trust a green test run. It left no temporary home on their disk, it reached no outside host, every Codex file it wrote was parsed by a real TOML parser, and it also ran on Windows and an Intel Mac. A person who runs LLM Router gets a gateway that is ready for Fastify 6.

**Architecture:** Six tasks, one commit each, in the delivery index's batches 3, 4, 5 and 13. Tasks 1 and 2 change the three files under `build/` that every test process loads. Task 3 adds a test-only TOML parser and one helper. Task 4 adds one matrix job to the test workflow. Task 5 is one commit in the gateway fork, with its release behind the owner's word. Task 6 makes a refused connection fail the run, and it comes after the pricing plan's Task 3 on the same branch.

**Tech Stack:** Node 24, `node:test` with `node:assert/strict`, esbuild test bundles (`build/test.mjs`), GitHub Actions, `smol-toml` 1.9.1 (dev only), Fastify 5 and vitest in the fork.

**Spec:** [`docs/superpowers/research/2026-11-22-open-items-validation.md`](../research/2026-11-22-open-items-validation.md). Row ids H-1 to H-6 come from its "H. Test harness, CI and the fork" table. Read each row a task names before you start the task.

**Evidence status.** Written 2026-11-22 against `main` at `eb84a3ba` and the fork at `26e74df` (`v1.0.22-llmr.3`). Every path, symbol and line named below was read in the code that day. Three things were run for this plan, in a scratch folder, on Node 24.22.3 and Electron 45.3.3:

- A wrapper on `net.Socket.prototype.connect`, loaded through `NODE_OPTIONS=--import=`, refused `fetch`, `node:https` and a raw socket to a host that is not loopback, in the main thread, in a worker thread and in a child process. Loopback by `127.0.0.1` and by `localhost` still answered 200.
- The same wrapper loaded under Electron with `ELECTRON_RUN_AS_NODE=1`, with the same result.
- When the wrapper is imported by the process itself and `NODE_OPTIONS` is set afterwards, a child process is covered and a worker thread is not. Task 2 states this as a limit.

Not run by anyone: any test on a Windows or Intel Mac runner, the TOML parser against LLM Router's Codex output, and any fix in this plan as a whole.

Re-checked 2026-11-25 against `main` at `c491eb48`, on Node 24.22.3. Nothing under `build/`, `.github/` or `tests/architecture/test-home-isolation.test.mjs` changed since `eb84a3ba` (read, `git diff`). The fork released `v1.0.22-llmr.4` for other work, and LLM Router pins it (read). Run in this round, in a scratch folder, with every test process under `run-tests.mjs` and its temporary home:

- `node build/run-tests.mjs zz-no-such-project` with `TMPDIR` pointed at an empty folder left one `llmr-test-home-*` folder in it. H-1 holds.
- A copy of the guard rule, loaded through `NODE_OPTIONS=--import=<file URL>`, under `npm run test` with `LLMR_TEST_GATEWAY_ENTRY` set. Every suite passed (cli 21, core 2106 of 2113 with the rest skipped or todo, electron 46, ui 308, architecture 186). It refused 29 connections. Task 2, Step 7 lists them.
- A worker made with `{ eval: true }` is not guarded, even with the guard in `NODE_OPTIONS` from the start. A file worker is. A file worker started after an in-process import is not guarded, unless `execArgv: ["--import=<guard URL>"]` is passed to it.
- Electron 45.3.3 with `ELECTRON_RUN_AS_NODE=1` loads the guard from `NODE_OPTIONS`.

## Decisions this plan rests on

- **B-4.** `smol-toml` is a dev dependency. Tests assert that Codex files parse. Nothing ships to users and there is no runtime parse guard. Task 3.
- **B-6.** The test workflow also runs the unit suites on a Windows runner and an Intel Mac runner. No manual platform pass. Task 4.
- **X-5, X-6.** A duplicate key is invalid TOML, and an array spans lines. `smol-toml` 1.9.1 has no dependencies and passes the official suite. Task 3's test values come from X-5.
- **X-14.** `logController` arrived in Fastify 5.10.0. The top-level `disableRequestLogging` warns as FSTDEP023 and is gone in Fastify 6. Task 5.
- **V-10** of the v8 plan. A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. Task 5, Step 6.
- **Plan author's choices, open to change in review.** The guard is one mechanism, a wrapper on `net.Socket.prototype.connect` (reason under Task 2). It does not wrap `worker_threads.Worker`, so a single-file run does not guard worker threads, and `AGENTS.md` says so (fix round, 2026-11-25). The platform jobs run `npm run test:packages`, not the architecture suite (reason under Task 4). The fork's unused `pnpm-lock.yaml` is deleted, not refreshed (reason under Task 5). The file, function and job names in the Interfaces blocks.

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json` and never deletes or migrates `~/.claude/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why. The fork's own files use single quotes, and a change there follows the file.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. For `tests/architecture/`: `node build/test.mjs architecture && node --test .test-dist/architecture/test/<name>.test.js`. Do not pass `--scope`.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and the package suites the task touches. Tasks 1, 2 and 6 change what every suite loads, so they run all four package suites, with `LLMR_TEST_GATEWAY_ENTRY` set as `.github/workflows/test.yml` sets it.
- No test, script or doc names a real provider host or holds a key. A test that needs an outside host uses a name under `.invalid`.
- A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time.
- Merging needs the owner's word, once per PR.
- Each batch starts from `main` after the batch it needs has merged, by the delivery index. Batches 3 and 5 both change `package-lock.json` (Task 3 and Task 5, Step 7), so the second to merge rebases.
- npm only. Never hand-edit `package-lock.json`.
- Never start LLM Router outside the test runner. Never read or write the real `~/.codex`, `~/.claude`, `~/.claude.json` or `~/.llm-router`.

## Review Focus

Each line names a condition no row's own test covers. The test that pins it sits in the task named at the end of the line.

1. A developer sets `LLMR_TEST_HOME` to a folder of their own to look at what a test wrote. A direct run must not delete it. Task 1, Step 2.
2. A test file throws before its first test. The temporary home is still removed. Task 1, Step 2.
3. The repository is checked out under a path with a space in it, or on Windows, where `NODE_OPTIONS` reads a backslash as an escape. The guard still loads in every child. Task 2, Step 1, test 4, on POSIX only, because the architecture suite does not run on the Windows job. On Windows the runner's file URL is exercised by Task 4's job.
4. A test that talks to its own server over a Unix socket or to `localhost` by name keeps working under the guard. Task 2, Step 1, test 2.
5. A Codex directory with no `.toml` file in it, because a restore removed them or a test passed the wrong folder. The parse check fails instead of passing on nothing. Task 3, Step 1.

## Rows this plan closes

| Row | Task |
|---|---|
| H-1 | Task 1 |
| H-2 | Task 1 |
| H-3 | Task 2 (connections refused and reported) and Task 6 (a refused connection fails the run) |
| H-4 | Task 3 |
| H-5 | Task 4 |
| H-6 | Task 5 |

H-7 has no task. It waits for the owner's Claude Desktop check.

## Order

| Order | Task | Batch | Why here |
|---|---|---|---|
| 1 | Task 1 | 3 | It splits `build/test-home.mjs`, and Task 2 builds on the split. |
| 2 | Task 2 | 3 | It needs Task 1's side-effect-free module and its exit handler. |
| 3 | Task 3 | 3 | Independent of Tasks 1 and 2. The stripper plan's Task 1, the next commit on the same branch, calls its helper. |
| 4 | Task 4 | 4 | Independent in code. It follows batch 3 so the first Windows run already exercises the guard's file URL. |
| 5 | Task 5 | 5 | Independent of every other task. It can run at any point, and its release waits for the owner. |
| 6 | Task 6 | 13 | It follows the pricing plan's Task 3 on the same branch. Until the request log worker stops loading its own price catalog, a strict guard fails `request-log-runtime.test.mjs` for a fetch no test file can stub. |

Tasks 3, 4 and 5 do not depend on each other.

---

### Task 1: Remove the temporary home a test run makes (H-1, H-2)

Today every `node build/run-tests.mjs` run leaves one empty `llmr-test-home-*` folder, because `build/run-tests.mjs:7` imports `build/test-home.mjs`, whose top level makes a home. A direct `node --test` run, the single-file command in `AGENTS.md`, leaves a home that holds a config database and can reach 20 MB. After this task the runner's import makes no folder, and a process that made its own home removes it when it exits. Other files that tests and source write to the temp folder are not this task's: on `fddb278a` one `npm run test` leaves 130 entries before this task and 124 after it (audit, run with a private `TMPDIR`). The PR names that number.

**Files:**
- Create: `build/test-home-env.mjs`
- Modify: `build/test-home.mjs`, `build/run-tests.mjs:7` and `:69`
- Modify (import line only): `packages/cli/test/integration/cli-help.test.mjs:7`, `packages/cli/test/integration/cli-service-daemon.test.mjs:8`, `packages/core/test/integration/profiles/profile-open-lookup.test.mjs:11`
- Test: `tests/architecture/test-home-isolation.test.mjs`

**Interfaces:**
- Produces: `build/test-home-env.mjs`, a module with no side effect on import, exporting `isolateTestHome(testHome: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv`. The body moves from `build/test-home.mjs` unchanged.
- Produces: `build/test-home.mjs` with no export. It stays the module that `testHomeGuardPlugin` in `build/test.mjs` puts first in every test bundle.

- [ ] **Step 1: Write the failing test for the runner.** In `tests/architecture/test-home-isolation.test.mjs`:

```js
test("the test runner leaves no folder in the temp directory", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "llmr-runner-temp-"));
  try {
    const env = { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp };
    delete env.LLMR_TEST_HOME;
    const result = spawnSync(process.execPath, [path.join(projectRoot, "build", "run-tests.mjs"), "zz-no-such-project"], { encoding: "utf8", env });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown test project: zz-no-such-project/);
    assert.deepEqual(readdirSync(temp), []);
  } finally {
    rmSync(temp, { force: true, recursive: true });
  }
});
```

Add `existsSync` and `readdirSync` to the file's `node:fs` import. The run fails after the imports, so the folder count shows what the import alone made. Run it. Expected: FAIL, `readdirSync(temp)` holds one `llmr-test-home-*` name.

- [ ] **Step 2: Write the failing tests for a direct run.** In the same file. `homeSeenBy` already starts a child that imports the guard and prints its home.
  - In "a compiled test run outside run-tests gets a temporary HOME", add after the existing assertions: `assert.equal(existsSync(seen.home), false, "a process that made its own home removes it at exit");`. This also ends the leak of that test's own child.
  - In "each test process takes a home of its own inside the one run-tests isolated", add inside the loop: `assert.equal(existsSync(seen.home), true, "a home inside a home someone else set is theirs to remove");`. This pins Review Focus 1.
  - A new test, "a test file that throws still removes its home": start a child with its own `spawnSync` (`homeSeenBy` asserts exit `0`), with `LLMR_TEST_HOME` deleted and a script that imports the guard, prints `process.env.HOME`, then throws. Assert `result.status` is `1` and `existsSync(<printed home>)` is `false`. This pins Review Focus 2.

  Run them. Expected: the first and the third FAIL, the second passes already.

- [ ] **Step 3: Split the module.** Create `build/test-home-env.mjs` with `isolateTestHome`. `build/test-home.mjs` imports it and keeps its one call. Switch `build/run-tests.mjs:7`, the architecture test and the three test files under Files to import `isolateTestHome` from `test-home-env.mjs`. `build/test-home.mjs` exports nothing afterwards.

- [ ] **Step 4: Remove the home at exit.** In `build/test-home.mjs`, read whether `process.env.LLMR_TEST_HOME` is set before the home is made. When it was not set, register `process.on("exit", ...)` that removes the home with `rmSync(home, { force: true, maxRetries: 3, recursive: true })`. The handler removes the path it captured when it made the home, not `process.env.HOME` at exit, because `profile-open-lookup.test.mjs:25` calls `isolateTestHome` on `process.env` while it runs (read). A removal that throws is caught and dropped, with a one-line comment that gives the reason. On Windows an open database handle refuses the removal, and a leftover folder must not turn a passing test into a failing one. Under `run-tests.mjs` the variable is set, so nothing is registered and `runProject` removes the suite's home. Give that `rmSync` in `runProject`'s `finally` the same `maxRetries: 3` and the same catch, for the same reason. Today it has neither (read, `build/run-tests.mjs:69`), so on Windows a handle still open could throw there and hide the suite's result.

  The PR names what still leaves a home behind (audit, partly run). A `SIGKILL`, a `SIGTERM` with no handler, such as a timeout kill, and a native crash fire no `exit` event. A detached child that outlives its parent, such as the CLI daemon in `cli-service-daemon.test.mjs` when its `t.after` does not run, writes into a home that was removed.

- [ ] **Step 5: Run the tests.** `node build/test.mjs architecture && node --test .test-dist/architecture/test/test-home-isolation.test.js`. Expected: all pass, the existing "build/test.mjs bundles the guard" case included.

- [ ] **Step 6: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test` with `LLMR_TEST_GATEWAY_ENTRY` set. Then, with `TMPDIR` pointed at an empty folder of your own, list it after one `npm run test:cli`. Expected: no `llmr-test-home-*` entry. The shared temp folder also holds other sessions' runs, so a count there proves nothing.

- [ ] **Step 7: Commit.** `fix(tests): leave no temporary home behind after a test run`

---

### Task 2: Refuse and report every connection a test makes to an outside host (H-3, first step)

Today seven or eight core test files and one CLI test's child process connect to public catalog hosts, depending on timing, and a test passes or fails by what those hosts answer (run, the list is under Step 7). After this task no test process, worker thread or child process can open a connection to a host that is not loopback, and each run prints what it refused. The run does not fail on a refusal yet. Task 6 changes that.

**Why one wrapper on `net.Socket.prototype.connect`.** The code under test opens connections five ways: the global `fetch` (for example `models/catalog-file.ts:51`), the global `fetch` with a proxy dispatcher (`proxy/system-proxy-fetch.ts:42`), the `undici` package's own `fetch` and `WebSocket` (`proxy/undici-proxy-agent.ts`, `agents/cdp-client.ts`), `node:https` (`providers/manifest-service.ts`, `proxy/service.ts`) and `node:net`. A wrapper on `fetch` sees only the first two. All five end in `net.Socket.prototype.connect`, and the wrapper sees the host name before any lookup. A second wrapper on `fetch` would add a second mechanism for no connection the first one misses.

**Limits, stated in the PR.**
- A request sent through a proxy that listens on loopback is seen as a loopback connection. `fetchWithSystemProxy` reads the machine's proxy setting, so a developer who runs a local proxy app is not covered for those requests.
- In a direct `node --test` run the guard reaches the test process, its child processes, and a worker started with an `env` object, because Node reads `NODE_OPTIONS` from that object (run). A worker started without one is covered only under `run-tests.mjs`, where the guard is in `NODE_OPTIONS` from the start (run). So a single-file run of `request-log-runtime.test.mjs` does not see its worker's catalog fetch, and passes alone where the suite would report it. The guard does not wrap `worker_threads.Worker` to close this. Passing `execArgv: ["--import=<guard URL>"]` to a worker does cover it (run), and a wrap is the change to make if a worker fetch ever hides this way after the pricing plan's Task 3.
- A worker made with `new Worker(code, { eval: true })` is not covered, even under the runner (run). Two tests use one, `request-log-runtime.test.mjs:1563` and `request-log-orphans.test.mjs:104`, for SQLite only (read).
- A child process whose env drops or replaces `NODE_OPTIONS` is not covered (audit, run). One test replaces it today. `october-issues-wire.test.mjs:484` sets `NODE_OPTIONS` to its own `--import` for the gateway child (read). That child's own preload already throws for an upstream that is not `127.0.0.1` (read, line 455), and Step 5 keeps the inherited value there anyway. The supervisor's `createGatewayProcessEnv` keeps `NODE_OPTIONS`, so the gateway child LLM Router starts is covered (audit, read).
- A program that is not Node, such as `git` or `curl` started by a test, is not covered.
- DNS queries (`dns.lookup`, `dns.resolve*`) and `dgram` are not covered. No test makes one to a public name today (audit, run with a logger on the `dns` module under core and cli).
- Playwright (`npm run test:e2e`) does not go through `build/run-tests.mjs` and stays outside the guard.

**Files:**
- Create: `build/test-network-guard.mjs`
- Modify: `build/test-home-env.mjs`, `build/test-home.mjs`, `build/run-tests.mjs` (`runProject`, lines 32 to 71), `AGENTS.md` (one entry under "Where the standards are enforced"), `.claude/rules/tests.md` (one sentence)
- Modify (one line): `packages/core/test/integration/gateway/october-issues-wire.test.mjs:484`
- Test: create `tests/architecture/test-network-guard.test.mjs`. Modify `tests/architecture/test-home-isolation.test.mjs`.

**Interfaces:**
- Consumes: Task 1's `build/test-home-env.mjs` and the exit handler in `build/test-home.mjs`.
- Produces: `build/test-network-guard.mjs`, a module whose import wraps `net.Socket.prototype.connect` once per thread. The wrapper carries the property `Symbol.for("llmr.test-network-guard")`, so a second copy of the module (one bundled, one from `--import`) does not wrap again. It has no export.
- Produces, in `build/test-home-env.mjs`:
  - `guardTestNetwork(env: NodeJS.ProcessEnv, guardFile: string, logFile: string): NodeJS.ProcessEnv`. It always sets `env.LLMR_TEST_NETWORK_LOG` to `logFile`. Each caller chooses the file, because the two callers need different rules. The runner always names its own suite's log, so a nested runner or an exported name cannot send its refusals elsewhere. `build/test-home.mjs` keeps an inherited log and names its own home's log only when none is set.
  - `refusedConnections(logFile: string): string[]`
  - `export const refusedConnectionFailsRun = false;`
- Produces: three environment names. `LLMR_TEST_NETWORK_LOG` is the file a refusal is appended to. `LLMR_TEST_FILE` is the test file a process or its children belong to, relative to the working directory. `NODE_OPTIONS` carries `--import=<file URL of the guard>`.
- Produces: the refusal error, `new Error("test network guard: refused <host>:<port>")` with `code: "ECONNREFUSED"`, and the log line `<host>:<port>\t<owner>`, where the owner is `LLMR_TEST_FILE`, else `process.argv[1]` relative to the working directory, else empty. An `-e` child has no `process.argv[1]` (run). Both runners start in the repository root, so the line holds no user's home path and can be pasted into a public PR. `process.argv[1]` inside a `node --test` child is the test file (audit, run).

- [ ] **Step 1: Write the failing tests.** New file `tests/architecture/test-network-guard.test.mjs`. One local helper starts `process.execPath` with `["--input-type=module", "-e", script]`. It builds the child's env from `process.env` with `NODE_OPTIONS`, `LLMR_TEST_NETWORK_LOG` and `LLMR_TEST_FILE` deleted, a fresh temporary directory as `LLMR_TEST_HOME`, then passes it through `guardTestNetwork(env, guardFile, path.join(<that home>, "network-refused.log"))`, where `guardFile` defaults to `path.join(process.cwd(), "build", "test-network-guard.mjs")`. Under the runner this test process holds the suite's log and the guard in `NODE_OPTIONS`. Without the three deletions the planted refusals land in the suite's log, which Task 6 would then fail on, and test 4 would pass on the inherited guard instead of its copy. The helper returns the child's parsed stdout and `refusedConnections(<that home>/network-refused.log)`.

  1. `"a connection to a host that is not loopback is refused before any lookup"`. The script tries `fetch("https://outside.invalid/")`, `https.get("https://outside.invalid/")` and `net.connect(443, "outside.invalid")` and prints each error's message, taking `error.cause.message` for `fetch`. Assert each of the three matches `/test network guard: refused outside\.invalid:443/`, and `refused` deep-equals one line that starts with `outside.invalid:443\t`. When `process.env.LLMR_TEST_NETWORK_LOG` is set, assert that `refusedConnections` of it is the same before and after the child ran.
  2. `"loopback still connects, by address, by name and by socket path"`. The script starts an `http` server on `127.0.0.1` and fetches it as `127.0.0.1` and as `localhost`, then starts a `net` server on a socket path inside the temporary home and connects to it. Assert both statuses are `200`, the socket connected, and `refused` is `[]`. This pins Review Focus 4.
  3. `"a worker thread and a child process are refused too"`. The script writes a worker file into the temporary home, starts a `Worker` from that file with `execArgv: []` that fetches `https://worker.invalid/` (the child's `--input-type=module` is not allowed in a file worker, and the guard still loads from `NODE_OPTIONS`), and starts a child `node` that fetches `https://child.invalid/`. The worker must be a file: one made with `{ eval: true }` is not guarded (run). Assert both report the guard's message, and `refused.map((line) => line.split("\t")[0])` deep-equals `["child.invalid:443", "worker.invalid:443"]`.
  4. `"a guard file under a path with a space still loads"`. Copy the guard to `<temp>/with space/guard.mjs`, pass that path to `guardTestNetwork`, run the script of test 1. Assert the same refusal. This pins Review Focus 3.
  5. `"guardTestNetwork adds the import once, keeps what was there and names the log it is given"`. Call it twice on `{ LLMR_TEST_NETWORK_LOG: "/old.log", NODE_OPTIONS: "--max-old-space-size=4096" }` with the log file `/h/network-refused.log`. Assert `NODE_OPTIONS` starts with `--max-old-space-size=4096 --import=file://`, holds `--import=` once, and `LLMR_TEST_NETWORK_LOG` equals `/h/network-refused.log`.
  6. `"every test process runs under the guard"`. In the test process itself: `net.Socket.prototype.connect[Symbol.for("llmr.test-network-guard")]` is `true`, `process.env.NODE_OPTIONS` includes `test-network-guard.mjs`, and `process.env.LLMR_TEST_NETWORK_LOG` is set. These three pass without Step 5, because `build/test-home.mjs` sets them in-process. So a second case pins Step 5, `"under the runner a worker thread is refused too"`. It starts a `Worker` from a file in the test's home that fetches `https://worker6.invalid/`, with no `env` option. A worker given an `env` object reads `NODE_OPTIONS` from it, and that copy holds the guard `build/test-home.mjs` set in-process, so the case would pass without Step 5 (run). To keep the planted refusal out of the suite's log, set `process.env.LLMR_TEST_NETWORK_LOG` to a file in the test's home before `new Worker` and restore it in a `finally`. The worker copies `process.env` when it starts. Assert the guard's message, which only a guard in `NODE_OPTIONS` from process start gives (run). It carries `skip` with the reason "a direct run does not guard worker threads" when the parent folder of `process.env.LLMR_TEST_HOME` does not start with `llmr-architecture-test-home-`, the suite home `runProject` makes (read, `build/run-tests.mjs:39`). That folder name does not depend on Step 5, so deleting Step 5's call fails this case instead of skipping it. Check that once by deleting the call: the case must fail.
  7. `"a direct run prints what it refused"`. Start a child with `LLMR_TEST_HOME`, `LLMR_TEST_NETWORK_LOG`, `LLMR_TEST_FILE` and `NODE_OPTIONS` deleted from its env. It imports `build/test-home.mjs`, then fetches `https://outside.invalid/` inside a `try`. Assert `result.stderr` matches `/1 connection to an outside host was refused/` and includes `outside.invalid:443`, and `result.status` is `0`. A second child makes two such fetches to different hosts and the assertion is `/2 connections to an outside host were refused/`.

  In `test-home-isolation.test.mjs`, the case "build/test.mjs bundles the guard into tests that never import it" gains `assert.match(readFileSync(compiled, "utf8"), /test network guard: refused/);`.

  Build it. Expected: `node build/test.mjs architecture` exits 1 with `No matching export in "build/test-home-env.mjs" for import "guardTestNetwork"`. Do not run `.test-dist` after a failed build. It holds the previous one.

- [ ] **Step 2: Write the guard.** `build/test-network-guard.mjs`. The rule the wrapper encodes:
  - The target is read from the call's first argument. It is the options object, or the first element when `net.connect` passed its normalized array, or `(port, host)`.
  - A target with a `path` passes. A target with no host, or a host that is `localhost`, in `127.0.0.0/8`, `::1`, `::ffff:127.x.x.x`, `0.0.0.0` or `::`, passes. The host is compared lowercased, with one pair of square brackets removed: `web-management-server.test.mjs` listens on `LOCALHOST` and `[::1]` (read).
  - Any other target is refused. The wrapper appends the log line to `process.env.LLMR_TEST_NETWORK_LOG` when that is set, read at the time of the refusal. An append that throws is caught and dropped. A child that outlives a direct run's home gets `ENOENT` there, and a throw out of `connect` is the failure this rule must not cause. It then destroys the socket with the refusal error on the next tick and returns the socket. It does not throw, because a caller such as `https.get` expects the failure as an `error` event.
  - `foo.localhost` is refused although it resolves to loopback. No test uses a `*.localhost` name (audit, grep).

- [ ] **Step 3: Add the two helpers.** In `build/test-home-env.mjs`.
  - `guardTestNetwork` sets `env.LLMR_TEST_NETWORK_LOG` to `logFile`. It appends `--import=${pathToFileURL(guardFile).href}` to `env.NODE_OPTIONS` unless that text is already in it. A file URL, because `NODE_OPTIONS` treats a backslash as an escape and splits on a space.
  - `refusedConnections` returns the file's lines without duplicates, sorted, and `[]` when the file does not exist.

- [ ] **Step 4: Load the guard in every test process.** In `build/test-home.mjs`, import `./test-network-guard.mjs`, set `process.env.LLMR_TEST_FILE` to `path.relative(process.cwd(), process.argv[1])` when it is unset and `process.argv[1]` is set (an `-e` child has none, and `path.relative` throws on `undefined`), and call `guardTestNetwork(process.env, path.resolve("build", "test-network-guard.mjs"), process.env.LLMR_TEST_NETWORK_LOG ?? path.join(home, "network-refused.log"))` after `isolateTestHome`, where `home` is the folder this module just made. Read `LLMR_TEST_NETWORK_LOG` before the call. The guard path is relative to the working directory because the bundle is CommonJS and has no `import.meta.url`, and both runners start in the repository root, as the comment at the top of `test-home-isolation.test.mjs` already records. A direct run started outside the root puts a missing file into `NODE_OPTIONS`, and every Node child then fails at start (audit, inferred). That matches the assumption the isolation test already makes. In the exit handler Task 1 added, before the home is removed, read `refusedConnections` of the log. When it is not empty, print `1 connection to an outside host was refused` or `<n> connections to an outside host were refused`, then the lines, to stderr, and set `process.exitCode = 1` when `refusedConnectionFailsRun` is true.

- [ ] **Step 5: Load the guard from the runner.** In `runProject` in `build/run-tests.mjs`, pass the child's env through `guardTestNetwork(env, path.join(__dirname, "test-network-guard.mjs"), path.join(testHome, "network-refused.log"))` for both runtimes, and delete `LLMR_TEST_FILE` from it, so a runner started by a test does not put that test's name on the nested suite's refusals. In the child's `exit` handler, before it resolves or rejects, so that a failing suite prints its refusals too, read `refusedConnections` of that same file. When it is not empty, print `<project>: 1 connection to an outside host was refused` or `<project>: <n> connections to an outside host were refused`, then the lines, and reject when `refusedConnectionFailsRun` is true. The runner itself does not import the guard.

  In `october-issues-wire.test.mjs:484`, the gateway child's env sets `NODE_OPTIONS` to its own `--import` and drops the inherited one. Join the two instead, `` [process.env.NODE_OPTIONS, `--import=${pathToFileURL(preload).href}`].filter(Boolean).join(" ") ``, so that child runs under the guard too.

- [ ] **Step 6: Run the new tests.** `node build/test.mjs architecture && node --test .test-dist/architecture/test/test-network-guard.test.js .test-dist/architecture/test/test-home-isolation.test.js`. Expected: PASS.

- [ ] **Step 7: Run every suite and read the report.** `npm run test` with `LLMR_TEST_GATEWAY_ENTRY` set. Expected: the same pass counts as on `main`, and a report under `core` and under `cli`. The 2026-11-25 run of a scratch copy of this guard, on `main` at `c491eb48`, passed every suite and refused these, each to `raw.githubusercontent.com`, `models.dev` and `openrouter.ai` on port 443 unless the line says otherwise (run):

  | Test file | Where the connection came from |
  |---|---|
  | `core/.../observability/request-log-store.test` | the test process, twice per host |
  | `core/.../observability/request-log-runtime.test` | the request log worker thread |
  | `core/.../gateway/credential-and-model-routing.test` | the test process |
  | `core/.../gateway/claude-login-pass-through-wire.test` | the test process and the request log worker |
  | `core/.../gateway/october-issues-wire.test` | the test process and the request log worker |
  | `core/.../gateway/gateway-child-env-wire.test` | the test process |
  | `core/.../unit/web/web-management-server.test` | the test process, `raw.githubusercontent.com` only |
  | `core/.../gateway/recent-issues-wire.test` | seen in one of two runs on `fddb278a` (audit, run) |
  | `cli/.../integration/cli-help.test` | the CLI runtime it starts, `raw.githubusercontent.com` only. Setting `LLMR_MODEL_CATALOG_PATH` removed it, so it is the model catalog download (run) |

  The three hosts are the price catalog's three sources (`pricing-service.ts:102` to `:104`, read). Paste the report the PR's CI run prints into the PR, not a local one. It names host and test file only. The table's second column came from a scratch run and is not in the report. The set depends on timing (22 refusals in 8 core files in one run, 19 in 7 in the next), so Task 6's work list is the union of several CI runs, not one. A suite that fails only under the guard depends on an outside answer today. Stop and report it, and do not exempt it.

- [ ] **Step 8: Record the rule beside its check.** In `AGENTS.md` under "Where the standards are enforced", add an entry for `build/test-network-guard.mjs`. It says what the guard refuses, that `run-tests.mjs` loads it into every test process through `NODE_OPTIONS`, that `tests/architecture/test-network-guard.test.mjs` pins it, that a single-file run does not guard worker threads, and that Playwright is outside it. In `.claude/rules/tests.md`, add one sentence. A test cannot reach a host that is not loopback, so it serves its own fixture on `127.0.0.1` or stubs `fetch`.

- [ ] **Step 9: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Commit: `test(harness): refuse and report a test's connection to an outside host`

---

### Task 3: Parse the Codex files the profile tests write with a real TOML parser (H-4, B-4)

Today no test parses the TOML that LLM Router writes, so an output that Codex cannot load passes every test (read, `smol-toml` and any other TOML parser are absent from `node_modules` and the lockfile). After this task a helper fails a test when any Codex file directly inside a directory does not parse, and the Codex applies made through `withAppliedDefaultProfiles` call it. Nothing changes for a user, and no source file may import the parser.

The check is "valid TOML 1.1", which `smol-toml` implements, not "Codex can load it". TOML 1.1 is a superset of 1.0, and the TOML version Codex's parser reads is not known (audit, inferred). So the check can pass a file a 1.0-only Codex refuses, and it cannot fail a file Codex accepts. The PR says so.

**Files:**
- Modify: `package.json` and `package-lock.json`, both through npm
- Create: `packages/core/test/support/codex-toml.mjs`
- Modify: `packages/core/test/integration/profiles/profile-service.test.mjs` (`withAppliedDefaultProfiles`, line 3997 at `c491eb48`), `tests/architecture/package-boundaries.test.mjs`
- Test: create `packages/core/test/unit/support/codex-toml.test.mjs`

**Interfaces:**
- Produces: `assertCodexFilesParse(codexDir: string, options: { allowNone?: boolean } = {}): string[]`, exported from `packages/core/test/support/codex-toml.mjs`. It parses every file directly inside `codexDir` whose name ends in `.toml` (`config.toml`, `llm-router.config.toml`, `<provider id>.config.toml`) with `parse` from `smol-toml`. It throws an `AssertionError` that names the file and carries the parser's message when one does not parse, and when the directory is missing or holds no such file. With `allowNone: true` a missing or empty directory returns `[]`, for a check made after a restore that may have removed every file. It returns the names it parsed, sorted. It reads no subfolder. Copies such as `config.toml.llmr-original` and `config.toml.llmr-backup-*` are not read, because they may be the user's own file, valid or not (S-5).
- A test under `packages/core/test/integration/profiles/` imports it as `../../support/codex-toml.mjs`. The stripper plan's Task 1 (`2026-11-22-backlog-stripper.md`), the next commit on batch 3's branch, calls it by this name, puts the call Step 6 adds under its `options.parse` switch, and adds a call with `{ allowNone: true }` after the test body. This plan keeps the strict default, because Review Focus 5 needs it.

- [ ] **Step 1: Write the failing helper tests.** `packages/core/test/unit/support/codex-toml.test.mjs`, each case in its own `mkdtempSync` directory.

```js
test("a directory of Codex files that parse passes and names what it read", () => {
  writeFileSync(path.join(dir, "config.toml"), "model = \"m\"\n\n[model_providers.a]\nname = \"A\"\n");
  writeFileSync(path.join(dir, "llm-router.config.toml"), "args = [\n  \"a\",\n  \"b\"\n]\n");
  writeFileSync(path.join(dir, "config.toml.llmr-original"), "model = \"a\"\nmodel = \"b\"\n");
  assert.deepEqual(assertCodexFilesParse(dir), ["config.toml", "llm-router.config.toml"]);
});

test("a key written twice fails and names the file", () => {
  writeFileSync(path.join(dir, "config.toml"), "model = \"a\"\nmodel = \"b\"\n");
  assert.throws(() => assertCodexFilesParse(dir), /config\.toml/);
});

test("a file that ends inside an array fails", () => {
  writeFileSync(path.join(dir, "config.toml"), "args = [\n  \"a\",\n");
  assert.throws(() => assertCodexFilesParse(dir), /config\.toml/);
});

test("a directory with no .toml file fails, unless the caller allows none", () => {
  assert.throws(() => assertCodexFilesParse(dir), /no \.toml file/);
  assert.throws(() => assertCodexFilesParse(path.join(dir, "missing")), /no \.toml file/);
  assert.deepEqual(assertCodexFilesParse(dir, { allowNone: true }), []);
  assert.deepEqual(assertCodexFilesParse(path.join(dir, "missing"), { allowNone: true }), []);
});
```

The last case pins Review Focus 5. Run: `node build/test.mjs core`. Expected: the build fails, `../../support/codex-toml.mjs` cannot be resolved (Step 4 writes it).

- [ ] **Step 2: Write the failing boundary test.** In `tests/architecture/package-boundaries.test.mjs`:

```js
test("the TOML parser is a root dev dependency and no workspace declares it", () => {
  const root = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.match(root.devDependencies["smol-toml"] ?? "", /^\d+\.\d+\.\d+$/);
  assert.equal(root.dependencies?.["smol-toml"], undefined);
  for (const packageName of packageNames) {
    const manifest = JSON.parse(readFileSync(path.join(projectRoot, "packages", packageName, "package.json"), "utf8"));
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      assert.equal(manifest[field]?.["smol-toml"], undefined, `${packageName} ${field}`);
    }
  }
});
```

The existing test in that file, "every package a workspace's source imports is declared in that workspace's manifest", then fails for any `packages/*/src` file that imports `smol-toml`, because no workspace manifest declares it. The two tests together are the check that the parser never ships. Expected now: FAIL on the first assertion.

- [ ] **Step 3: Add the dependency.** `npm install --save-dev --save-exact smol-toml@1.9.1` in the repository root. Expected: the install changes `package.json` and `package-lock.json` only (`git diff --stat` also lists the test file Step 2 changed), and the lock entry has no `hasInstallScript` (audit, run). The package has no install script and no dependencies (`npm view smol-toml@1.9.1 scripts dependencies`, run 2026-11-25, which lists only `test` and `update-gha`), so `allowScripts` gains no entry. 1.9.1 is still the latest version (run). If the lock entry does carry `hasInstallScript`, stop and report.

- [ ] **Step 4: Write the helper.** `packages/core/test/support/codex-toml.mjs`, by the Interfaces block.

- [ ] **Step 5: Run the helper and boundary tests.** `node build/test.mjs core && node --test .test-dist/core/test/unit/support/codex-toml.test.js`, then `npm run test:architecture`. Expected: PASS.

- [ ] **Step 6: Call it after every Codex apply the profile tests make.** In `withAppliedDefaultProfiles` in `profile-service.test.mjs`, inside the existing `if (profileIds.includes("default-codex"))` block, after the token assertion, add `assertCodexFilesParse(codexDir);`, and `import { assertCodexFilesParse } from "../../support/codex-toml.mjs";` after the file's `node:` imports. That fixture has 111 callers, so every Codex apply made through `withAppliedDefaultProfiles` is parsed (read, grep). The file's other calls of `applyProfileConfig` and `recoverGlobalAgentProfile`, made outside the fixture, are not parsed by this task. Run `node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected: PASS (audit, run on `fddb278a`: 224 of 224, with 131 parse checks). `smol-toml` reads TOML 1.1 and accepts at least one input TOML 1.0 refuses, so a green check does not prove Codex loads the file. Nobody has checked which version Codex reads. A failure here is a file LLM Router writes that does not parse, on an input the stripper plan does not list. Do not remove the call and do not skip the test. Stop, record the test name and the parser's message as a new S row in the spec, and ask the owner whether this PR waits for the stripper plan's fix.

- [ ] **Step 7: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`. Commit: `test(profiles): parse every Codex file a profile test writes with smol-toml`

---

### Task 4: Run the package suites on Windows and an Intel Mac (H-5, B-6)

Today every test runs on `ubuntu-26.04` only, and the release builds for Windows and both Macs with no test on any of them. After this task each push and pull request also runs the four package suites on `windows-2025` and `macos-26-intel`, the two runner labels `release.yml` already builds on.

The job runs `npm run test:packages` (core, ui, electron, cli). It does not run typecheck, lint or the architecture suite. Those check the repository's own files, give the same answer on every platform, and already run on Ubuntu, and several architecture tests start `bash` scripts that would fail on Windows for reasons that are not the product's.

**Evidence.** No test has run on either runner. The first run of this PR is the measurement, and it is expected to fail on Windows. Under `packages/*/test`, the suites this job runs, 26 test files mention `win32`, and 18 use `chmodSync`, `symlinkSync` or a `#!/bin/sh` script (counted 2026-11-25 by grep).

**Cost, estimated.** Both runner labels exist and ran on this repository. Release run `45326126722` for `v9.0.0` built on `windows-2025` in 2 min 10 s and on `macos-26-intel` in 5 min 43 s (run, `gh run view`). The `test` job on `ubuntu-26.04`, with `npm ci`, typecheck, lint and every suite, took 2 min 41 s on `main` (run `45548113130`). Locally the package suites took about 41 s of test time, 36 s of it core (run). So each new job is guessed at 5 to 12 minutes, the Windows one the slower for `npm ci` and file I/O (inferred, not run). The repository is public (run, `gh repo view`), and GitHub's standard hosted runners cost nothing for a public repository (inferred from GitHub's billing terms, not read this round). The cost is wall time on each pull request, not money. The `test` job's `concurrency` group already cancels a superseded branch run.

**Files:**
- Modify: `.github/workflows/test.yml`
- Test: `tests/architecture/workflow-permissions.test.mjs`
- Modify as the first run requires: test files under `packages/*/test/`, by the rules of Step 4

**Interfaces:**
- Produces: a job with the id `platforms` in `test.yml`, whose two checks are named `🧪 Unit (Windows)` and `🧪 Unit (Intel Mac)`. The repository ruleset "main: tests must pass" requires `🧪 Unit and architecture`, `🎭 End to end` and `🐳 Docker smoke` (read through the API on 2026-11-22). This task does not add to that list.
- Keeps: the `test` job's id, name and steps. `package-scripts.test.mjs` and `workflow-permissions.test.mjs` find it by `  test:`.

- [ ] **Step 1: Write the failing test.** In `tests/architecture/workflow-permissions.test.mjs`:

```js
test("the package suites also run on Windows and an Intel Mac", () => {
  const job = jobBlocks(".github/workflows/test.yml").get("platforms");
  assert.match(job, gatewayEntry);
  assert.match(job, /^ {4}runs-on: \$\{\{ matrix\.runner \}\}$/m);
  assert.match(job, /^ {12}runner: windows-2025$/m);
  assert.match(job, /^ {12}runner: macos-26-intel$/m);
  assert.match(job, /^ {6}fail-fast: false$/m);
  assert.match(job, /^ {4}timeout-minutes: \d+$/m);
  assert.ok(job.includes("run: npm ci\n"));
  assert.ok(job.includes("run: npm run test:packages\n"));
  assert.doesNotMatch(job, /continue-on-error|^ {4}needs:/m);
});
```

Run it. Expected: FAIL, `job` is undefined.

- [ ] **Step 2: Add the job.** After the `test` job in `test.yml`:

```yaml
  platforms:
    name: 🧪 Unit (${{ matrix.display_name }})
    runs-on: ${{ matrix.runner }}
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        include:
          - display_name: Windows
            runner: windows-2025
          - display_name: Intel Mac
            runner: macos-26-intel
    env:
      LLMR_TEST_GATEWAY_ENTRY: ${{ github.workspace }}/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js
```

Its steps are the `test` job's checkout, Node setup and `npm ci` steps, copied with their pinned action commits and `persist-credentials: false`, then one step `🧪 Run package tests` with `run: npm run test:packages`. On Windows the entry path mixes separators, which Node accepts (inferred, not run). `better-sqlite3` 13.2.0 ships `win32-x64` and `darwin-x64` prebuilds (audit, listed), so it should load on both. Whether the `electron` binary installs on these runners is not known until the first run.

- [ ] **Step 3: Run the architecture suite.** `npm run test:architecture`. Expected: PASS, including the two per-file cases in `workflow-permissions.test.mjs` that check runner names and action pins.

- [ ] **Step 4: Push the branch, open the PR and read the two new checks.** Sort every failing test into one of three kinds, and list each with its kind in the PR.
  - **The test assumes POSIX and the behaviour under test does not.** A hard-coded `/` separator, a `/tmp` path, an LF-only comparison of text the product writes with the platform's line ending. Fix the test in this PR.
  - **The behaviour under test exists only on some platforms.** A shell wrapper run by `/bin/sh`, a file mode, the macOS keychain. Mark the test with a `skip` on `process.platform` and the reason in the test's options, the way `profile-service.test.mjs` already does at lines 668, 1398 and 1966 (read). A test that fails on the Intel Mac alone is sorted by the same three kinds, and a skip there names `process.arch === "x64"` with its reason. These are the only skips this task may add, and the PR names each one.
  - **The product does the wrong thing on that platform.** Do not skip the test and do not change the product here. Record a new H row in the spec with the test name, the platform and the output, for a plan of its own.

  A failure in `build/run-tests.mjs`, `build/test.mjs` or the files Tasks 1 and 2 added is a harness fault, and it is fixed in this PR.

- [ ] **Step 5: Decide on the result.** When both checks are green, go to Step 6. When a failure of the third kind remains, the job stays red, the whole Tests run is red, and `npm run release` refuses to cut a release (`testsRunFailure` in `scripts/release.mjs`). Stop and put question 1 under "Open with the owner" to the owner. Do not merge before the answer.

- [ ] **Step 6: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and each package suite whose tests Step 4 changed. Commit: `ci(tests): run the package suites on Windows and an Intel Mac`

---

### Task 5: Turn request logging off through a `LogController` in the gateway fork (H-6)

Today the fork sets Fastify's top-level `disableRequestLogging` (`src/index.ts:73`, read at `4d902e6`, the `v1.0.22-llmr.4` release, which did not change it), so every gateway start under LLM Router's Fastify 5.12.7 emits the FSTDEP023 warning, and the option is gone in Fastify 6 (X-14). After this task the fork passes the same switch through a `LogController`, and a start prints no deprecation warning. LLM Router keeps the gateway child's stderr in memory (`gatewayChildOutput` in `supervisor.ts`) and shows it only when the child fails, so a user sees the warning today only inside a gateway failure message.

One commit in the clone at `~/dev/llmr-gateway`, on a branch from `llmr`. The release and the LLM Router bump are Steps 6 and 7, behind the owner's word.

**Files:**
- Fork, modify: `src/index.ts:2` and `:71-76`, `src/index.test.ts`, `package.json` (the `fastify` range), `package-lock.json` (through npm)
- Fork, delete: `pnpm-lock.yaml` (1648 lines). It pins Fastify 5.8.5, the last commit to touch it is upstream's `09351e7`, and no workflow, script, Dockerfile or doc in the fork reads it (audit, searched 2026-11-22). The fork's CI installs with `npm ci`. A second lockfile kept in step by hand is a second place to be wrong.
- LLM Router, modify at Step 7: `packages/core/package.json:19`, `packages/cli/package.json:39`, `package-lock.json` (through npm)

**Interfaces:**
- Consumes: `LogController`, exported by `fastify` from 5.10.0. The fork's own install is 5.9.0 today (read, its `package-lock.json` and `node_modules`), which has no such export. LLM Router installs 5.12.7, which exports it and warns FSTDEP023 whenever `disableRequestLogging` is passed (read, `fastify.js:888`).
- Produces: fork commit on branch `fastify-log-controller`, then at Step 6 the release `v1.0.22-llmr.5` with the asset `the-next-ai-ai-gateway-1.0.22-llmr.5.tgz`. `v1.0.22-llmr.4` is taken. It shipped the pass-through work, and LLM Router pins it (read).

- [ ] **Step 1: Branch and take the baseline.** `git switch -c fastify-log-controller llmr`, then `npm ci && npm run typecheck && npm run typecheck:all && npx vitest run`. Expected: all pass. Note the test count for the commit message. This round did not run the fork's suite.

- [ ] **Step 2: Raise the Fastify floor.** In `package.json` set `"fastify": "^5.10.0"`, then `npm install`. Expected: `package-lock.json` resolves `node_modules/fastify` to 5.10.0 or later (5.12.8 was the latest on 2026-11-22). Then `git rm pnpm-lock.yaml`.

- [ ] **Step 3: Write the failing test.** In `src/index.test.ts`, the one existing case already builds the entry, starts it with `GATEWAY_MANAGEMENT_ROUTES_ENABLED: 'false'` and collects stdout and stderr into `output` (read). Rename it to `'starts without a Fastify deprecation warning and serves no /manager or /agent route when GATEWAY_MANAGEMENT_ROUTES_ENABLED is false'`, and add one assertion after its three status checks:

```ts
      expect(output).not.toMatch(/FSTDEP|FastifyDeprecation/);
```

A second case with a second build and spawn would add a slower test and, with the management routes on and no manager key, a start-up path nobody checked. The fork sets no `requestIdLogLabel` and calls no `addHttpMethod` (audit, read), so FSTDEP024 and FSTDEP025 should not fire, and only FSTDEP023 is expected to match.

Run: `npx vitest run src/index.test.ts`. Expected: the case FAILS on `FSTDEP023`, now that Step 2 installed a Fastify that warns. If it passes, the warning did not reach the captured output. Stop and find out why before Step 4. The child's env is an explicit object with no `NODE_OPTIONS`, so `--no-warnings` cannot hide it (read).

- [ ] **Step 4: Pass the switch through a `LogController`.** In `src/index.ts`, import `LogController` beside the default import from `fastify`, and replace the line `disableRequestLogging: !config.logging.accessLog,` in the `Fastify({ ... })` call with `logController: new LogController({ disableRequestLogging: !config.logging.accessLog }),`. The 2026-11-22 research ran this form under Fastify 5.12.7 and it printed nothing.

- [ ] **Step 5: Run the fork's checks and commit.** `npm run typecheck && npm run typecheck:all && npx vitest run && npm run build`. Expected: all pass, the same count as Step 1. Commit on the branch: `fix(gateway): turn request logging off through a LogController`. The body says that Fastify 6 removes the top-level option, that the `fastify` range is now `^5.10.0` because earlier versions do not export `LogController`, and that `pnpm-lock.yaml` is removed and why.

- [ ] **Step 6: GATE. The owner's word (V-10), then release.** Nothing in this step runs before the owner says so, and the owner also answers question 2 under "Open with the owner" (release now, or with the next fork release). On the word: merge the branch into `llmr`, set the version with `npm version 1.0.22-llmr.5 --no-git-tag-version`, commit `chore: release 1.0.22-llmr.5` as `4d902e6` did for `.4`, push, then `git tag -m v1.0.22-llmr.5 v1.0.22-llmr.5 && git push origin v1.0.22-llmr.5`. The fork's release workflow refuses a tag that does not match `package.json`. The full recipe, the `gh run watch` note and the asset check are in [`completed/2026-11-18-gateway-fork.md`](completed/2026-11-18-gateway-fork.md), Task 1 Step 7 and Task 3 Step 6. If the owner chooses to wait, this task ends here with the branch pushed nowhere, and the next fork release carries the commit and this plan's Step 7.

- [ ] **Step 7: Bump LLM Router.** On a branch from `main`: change `v1.0.22-llmr.4` and `1.0.22-llmr.4` to `.5` in the gateway URL in `packages/core/package.json` and `packages/cli/package.json`, then `npm install`. Expected: `git diff --stat` shows the two manifests and `package-lock.json`, and the lock still resolves one `node_modules/fastify` at 5.10.0 or later. Run `npm run typecheck`, `npm run lint`, `npm run test:architecture` (its `gateway-dependency.test.mjs` checks the URL, the version and the `sha512`), and `npm run test:core` with `LLMR_TEST_GATEWAY_ENTRY` set, so the wire files run against the new build. There is no new LLM Router test. The child's stderr is not reachable from a test without a product change, and the fork's test is the proof. Commit: `fix(gateway): move to gateway 1.0.22-llmr.5, which starts without the Fastify deprecation warning`

---

### Task 6: Fail a test run that tried to reach an outside host (H-3, second step)

After Task 2 a connection to an outside host is refused and printed, and the run still passes, because the code that fetches a catalog catches the error. After this task such a run fails, so a new test that depends on an outside host cannot merge.

**Gate.** This task is the last commit of batch 13b, after the pricing plan's Task 3 (`docs/superpowers/plans/2026-11-22-backlog-pricing.md`, row P-2) on the same branch. In that task the request log worker stops loading its own price catalog, and `RequestLogStore.record` stops awaiting a catalog load (read, its "For the harness plan" section). The worker's fetch runs in a worker thread, where no test file can stub it. The check that the gate is open is `grep -n preloadUsagePriceCatalog packages/core/src/observability/request-log-worker.ts`, which must print nothing. On `main` at `c491eb48` it prints lines 15 and 117, so the gate is closed (run).

**Files:**
- Modify: `build/test-home-env.mjs`, `build/test-home.mjs`, `build/run-tests.mjs`, `AGENTS.md` (the entry Task 2 added)
- Modify: each test file the report of Step 2 names
- Test: `tests/architecture/test-network-guard.test.mjs`

**Interfaces:**
- Consumes: Task 2's `refusedConnections`, `LLMR_TEST_NETWORK_LOG` and report lines.
- Removes: `refusedConnectionFailsRun` and both places that read it. A refusal always fails the run afterwards, so there is one behaviour and no switch.

- [ ] **Step 1: Check the gate.** Run the `grep` above. If it prints a line, stop. This task does not start.

- [ ] **Step 2: Take the work list.** `npm run test` with `LLMR_TEST_GATEWAY_ENTRY` set. Copy every report line. Each names a host and a test file. Compare it with the table under Task 2, Step 7. After the pricing plan's Task 3, the worker lines and the `request-log-store.test` lines are expected to be gone, and these expected to remain (inferred from that plan's text, not run): `credential-and-model-routing.test`, `web-management-server.test`, the three wire files' test-process lines, and `cli-help.test`.

- [ ] **Step 3: Remove each cause in the test that owns it.** One rule per kind of source, and no product code changes.
  - A fetch made in the test process. Stub it for that test with `t.mock.method(globalThis, "fetch", ...)`, answering the fixture the test needs or rejecting. In a wire test the stub hands a loopback URL to the original `fetch`, because the test talks to its own gateway with `fetch` (read, `october-issues-wire.test.mjs:78` and `:175`). A test that builds a `UsageStore` passes `loadPriceCatalog` in its options instead (`usage/store.ts:184`, which the pricing plan's Task 3 keeps, read).
  - The model catalog download, from the test process or from a child it starts. Set `LLMR_MODEL_CATALOG_PATH` to a fixture file in that test's env, which keeps `refreshModelCatalog` offline (`models/catalog-file.ts:34`). This removes `cli-help.test`'s line (run, with `packages/core/models.json` as the fixture).
  - The plugin marketplace download from a child. Set `LLMR_PLUGIN_MARKETPLACE_URL` to a loopback server the test starts (`plugins/marketplace.ts:57`). No test reaches it on `main` today (run, setting it changed nothing in the CLI suite's report).
  - Anything else, such as a price fetch from a child process, which has no override. Stop and report it with its line. It needs a seam in the product and is not this task's to add.

  After each file, run that file alone and confirm its line is gone from the report.

- [ ] **Step 4: Change the tests to expect a failed run.** In `test-network-guard.test.mjs`, test 7 becomes `"a direct run that was refused a connection fails"` and asserts `result.status` is `1` with the same stderr, for both children. Add `"a direct run that made no outside connection passes"`: the same child without the fetch exits `0` with nothing about refusals on stderr. Run. Expected: the first FAILS.

- [ ] **Step 5: Make a refusal fail the run.** Delete `refusedConnectionFailsRun` from `build/test-home-env.mjs`. In `build/test-home.mjs` the exit handler sets `process.exitCode = 1` whenever it prints a refusal. In `build/run-tests.mjs`, `runProject` rejects with `<project> tests tried to reach an outside host` whenever the list is not empty, also when the child exited `0`.

- [ ] **Step 6: Prove the runner fails, with a planted test.** Create `packages/cli/test/unit/zz-outside-probe.test.mjs` holding one test that awaits `fetch("https://outside.invalid/").catch(() => {})`. Run `npm run test:cli`. Expected: every test passes and the command exits non-zero with `cli tests tried to reach an outside host` and the line `outside.invalid:443`. Delete the file and its output under `.test-dist/cli`, and confirm `git status --short` does not list it.

- [ ] **Step 7: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test` with `LLMR_TEST_GATEWAY_ENTRY` set. Expected: PASS with no refusal report. Update the `AGENTS.md` entry to say that a refused connection fails the run.

- [ ] **Step 8: Commit.** `test(harness): fail a test run that tried to reach an outside host`

---

## Open with the owner

1. **A product fault on Windows or the Intel Mac that this plan does not fix (Task 4, Step 5).** It arises only if the first run finds one. A red platform job makes the Tests run red, and `npm run release` then refuses to cut a release until that fault's own plan lands. Task 4 waits at Step 5 for the answer.
   - (a) Keep the job blocking. No release ships while a known platform fault is open. This is the plain reading of B-6, which replaces the manual platform pass with these jobs.
   - (b) Set `continue-on-error: true` on the `platforms` job, with a comment that names the open rows, and remove it in the PR that closes the last of them. Releases continue. Whether GitHub then shows the job's own check as passed was not verified.
   - (c) Fix the fault inside Task 4's PR. The PR's size is unknown until the run.

   Recommendation: (a) when the fault loses or corrupts a user's file on that platform, (b) otherwise. Separately, the two new checks are not added to the ruleset's required list by this plan. Say so if they should be, once they have been green for a while.

2. **When the fork commit is released (Task 5, Step 6).** Task 5 Steps 1 to 5 do not wait. Steps 6 and 7 do.
   - (a) Release `v1.0.22-llmr.5` with this commit alone, then bump LLM Router.
   - (b) Hold the branch and let the next fork release carry it with the fork items that already wait in the private plan.

   Recommendation: (b). The warning reaches a user only inside a gateway failure message, and Fastify 6 has no release date (X-14), so nothing is lost by waiting, and one release costs one owner gate instead of two. Since this plan was written, `v1.0.22-llmr.4` shipped without this commit (read), and no plan under `docs/superpowers/plans/` schedules another fork release (read, grep for `llmr.5`). So (b) holds the branch until a fork release has another reason, which may be a long time. Choose (a) if that wait is not wanted.

## Self-review

- **Spec coverage.** H-1 and H-2 are Task 1. H-3 is Tasks 2 and 6. H-4 is Task 3. H-5 is Task 4. H-6 is Task 5. H-7 has no task, by the spec.
- **Names across tasks.** `isolateTestHome` and `build/test-home-env.mjs` are defined in Task 1 and used in Task 2. `guardTestNetwork`, `refusedConnections`, `refusedConnectionFailsRun`, `LLMR_TEST_NETWORK_LOG` and `LLMR_TEST_FILE` are defined in Task 2 and used in Task 6. `assertCodexFilesParse` is defined in Task 3 and is the name the stripper plan calls.
- **Not confirmed in the code, and where the plan says so.** That the Codex profile tests' output parses today (Task 3, Step 6). Anything on Windows or the Intel Mac (Task 4). The work list Task 6 will find after the pricing plan's Task 3 (Task 6, Step 2). Confirmed since the draft: `process.argv[1]` is the test file inside a `node --test` child (audit, run), and P-2 is the pricing plan's Task 3 (read).
- **VM check, for the end pass.** None. No task in this plan changes what a user's installed app does on a VM, except Task 5's bump, whose proof is the fork's test. H-7 waits on the owner's Claude Desktop check, which the delivery index puts in the end pass.
