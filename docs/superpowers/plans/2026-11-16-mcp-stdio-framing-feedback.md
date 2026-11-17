# Stdio MCP framing feedback implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a stdio MCP server fails its handshake because LLMR spoke `Content-Length` framing to it, the error the user sees names framing as the likely cause.

**Architecture:** One small module holds the hint text and the rule for when it applies. The two stdio clients (tool discovery and the ToolHub backend client) call it on a handshake failure. The ToolHub runtime also starts showing the backend errors it already stores, and its client stops reusing a child process that failed to start. Two further PRs change behavior and wait for owner decisions.

**Tech Stack:** TypeScript on Node 24, `node:test` with `node:assert/strict`, esbuild.

**Spec:** `docs/superpowers/specs/2026-11-16-mcp-stdio-framing-feedback.md`

## PR order

| PR | Title | Starts when | Size |
|---|---|---|---|
| MF-1 | Name framing in stdio handshake errors | The owner approves this plan | S |
| MF-2 | Always speak newline JSON from LLMR's own stdio clients | The owner decides OD-1 as yes | M |
| MF-3 | Cap interactive discovery below the startup timeout | The owner decides OD-2 and gives a number | S |

MF-2 and MF-3 are independent of each other. Each needs MF-1 merged first, because all three edit `packages/core/src/mcp/tool-discovery.ts`. If MF-2 lands, its Task 1 deletes the hint MF-1 added, since no server those clients talk to can then be in `content-length` mode. Do not start MF-2 or MF-3 on an agent's judgment: the spec lists OD-1 and OD-2 as open.

## Global Constraints

- Node `>=24`. npm only, never pnpm or yarn.
- Code goes through a branch and a squash-merged PR. Docs-only changes commit straight to `main`.
- The commit gate runs `npm run typecheck` and `npm run test:architecture`. Both must pass on every commit.
- Never `import()` the `ai-gateway` package or run it in-process.
- Never run `npm run rebuild:sqlite3` locally.
- `npm run build:assets` may rewrite `packages/core/models.json` and `packages/ui/src/generated/`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Style: double quotes, semicolons, two-space indent, `node:` imports first, `type` aliases unless the file already uses `interface`, no comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, in `*.test.mjs` for core. Run one file with `node build/test.mjs core && node --test .test-dist/core/test/<kind>/<path>.test.js`. Do not pass `--scope`.
- No migration rewrites a saved server's mode (spec decision D-1).
- The hint text is exactly: `This server is set to Content-Length framing. MCP servers use newline JSON unless they document otherwise. Set its stdio message mode to newline-json.`
- New text must not contain Chinese, a referral link, or the fork's old three-letter prefix. The architecture tests fail on each.
- Read a file with Read before you edit it. The rules in `.claude/rules/` load on Read, Edit and Write only. `packages/core/src/mcp/**` follows `.claude/rules/mcp-subprocess.md`.

## Review Focus

Each line has its pinning test in the owning task.

1. A server in `content-length` mode answers `initialize` and then stalls on `tools/list`. Framing is working, so the error must not carry the hint (MF-1 Task 1 case c, Task 2 case b).
2. A server in `newline-json` mode never answers. The error must not carry the hint (MF-1 Task 1 case b).
3. The server's command does not exist. The spawn error must reach the user unchanged, with no hint and without waiting for a timeout (MF-1 Task 1 case e, Task 2 case c).
4. ToolHub has more than three failing backends, or one with a very long error. The combined message must stay bounded: at most three servers, each error cut to 300 characters (MF-1 Task 2 cases c and d).
5. ToolHub has one working backend and one failing backend. The catalog is not empty, so no error is raised and the failing backend's error stays hidden. No task fixes this. It is listed under Known limits so a reviewer does not rediscover it.

## Known limits

- **A failing backend beside a working one stays silent.** `ToolHubRuntime` reports backend errors only when the catalog is empty (Review Focus 5).
- **ToolHub waits twice the startup timeout before it reports an empty catalog** (spec F-4). `ToolHubRuntime` probes every server a second time when the first pass finds no tools. No task changes that. MF-1's tests set 1000 ms timeouts, so each takes about 2 seconds.
- **The spawn behavior behind MF-1 Task 2 Step 3 was measured on macOS only.** Node documents the `error` event for a failed spawn on every platform, and CI runs the test on Linux.
- **The settings page still cannot test a server** (spec F-5, option E). A user who only uses the settings page meets the hint at run time, in the agent's tool error.
- **The hint can appear for a server that fails for another reason while set to `content-length`.** The text states the setting and what to try. It does not claim framing is the cause.
- **F-2 was measured against a script, not an SDK-built server.** Nobody has run a real SDK server in this repo.

---

## MF-1 Name framing in stdio handshake errors

**Fixes:** spec F-2 and F-4
**Branch:** `fix/mcp-stdio-framing-hint`
**Owner steps:** Approve the plan before the branch is cut.

### Task 1: The hint module and tool discovery

**Files:**
- Create: `packages/core/src/mcp/stdio-framing.ts`
- Modify: `packages/core/src/mcp/tool-discovery.ts` (`listStdioMcpServerTools`)
- Test: `packages/core/test/unit/mcp/stdio-framing.test.mjs` (create)

**Interfaces:**
- Produces: `stdioFramingHint: string` (the exact text from Global Constraints) and `withStdioFramingHint(message: string, server: { stdioMessageMode?: GatewayMcpStdioMessageMode }, handshakeDone: boolean): string`. It returns `` `${message} ${stdioFramingHint}` `` when `server.stdioMessageMode === "content-length"` and `handshakeDone` is `false`. Otherwise it returns `message` unchanged. `GatewayMcpStdioMessageMode` comes from `@llmr/core/contracts/app`.

- [ ] **Step 1: Create the branch**

```bash
git switch -c fix/mcp-stdio-framing-hint
```

- [ ] **Step 2: Write the failing tests**

Create `packages/core/test/unit/mcp/stdio-framing.test.mjs`. Import `listMcpServerTools` from `@llmr/core/mcp/tool-discovery.ts` and `stdioFramingHint`, `withStdioFramingHint` from `@llmr/core/mcp/stdio-framing.ts`. Write each server script to a temp directory and remove it with `t.after(() => rmSync(dir, { force: true, recursive: true }))`, as `mcp-child-env.test.mjs` does.

Server scripts, each a `.cjs` file run with `process.execPath`:

- `newlineOnly`: reads stdin, splits on `\n`, skips a line that `JSON.parse` rejects, and answers `initialize` and `tools/list` in newline JSON. This mirrors the SDKs (spec F-1).
- `silent`: `process.stdin.resume();` and nothing else.
- `framedThenStalls`: parses `Content-Length` frames, answers `initialize` with a `Content-Length` frame, and never answers `tools/list`.
- `exits`: `process.exit(3);`

Every discovery call uses `env: {}`, `name: "probe"`, `requestTimeoutMs: 30000`, `startupTimeoutMs: 1000`, `transport: "stdio"`. `mcpTimeoutMs` clamps to a 1000 ms minimum, so 1000 is the fastest test.

```js
test("the hint applies only to a content-length server before its handshake", () => {
  assert.equal(withStdioFramingHint("failed.", { stdioMessageMode: "content-length" }, false), `failed. ${stdioFramingHint}`);
  assert.equal(withStdioFramingHint("failed.", { stdioMessageMode: "content-length" }, true), "failed.");
  assert.equal(withStdioFramingHint("failed.", { stdioMessageMode: "newline-json" }, false), "failed.");
  assert.equal(withStdioFramingHint("failed.", {}, false), "failed.");
});
```

Discovery cases, one test each, asserting on the rejection's `message`:

| Case | Script | Mode | Message must match | Hint |
|---|---|---|---|---|
| a | `newlineOnly` | `content-length` | `/timed out after 1000 ms\./` | present |
| b | `silent` | `newline-json` | `/timed out after 1000 ms\./` | absent |
| c | `framedThenStalls` | `content-length` | `/timed out after 1000 ms\./` | absent |
| d | `exits` | `content-length` | `/exited before tools\/list completed \(3\)/` | present |
| e | command `llmr-no-such-command`, no script | `content-length` | `/ENOENT/` | absent |

"Present" is `message.endsWith(stdioFramingHint)`. "Absent" is `!message.includes("Content-Length framing")`.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `node build/test.mjs core`
Expected: the build fails, because `@llmr/core/mcp/stdio-framing.ts` does not exist.

- [ ] **Step 4: Implement `stdio-framing.ts`**

Export `stdioFramingHint` and `withStdioFramingHint` as the Interfaces block states. No other export.

- [ ] **Step 5: Use it in `listStdioMcpServerTools`**

Track whether `initialize` has been answered. Declare `let handshakeDone = false;` beside `let settled = false;`, in the Promise executor's scope, so the timer callback and the `exit` handler can read it. Set it to `true` in `run()` after `await request("initialize", ...)` returns. Wrap the two messages with `withStdioFramingHint(message, server, handshakeDone)`:

- the timeout message, `` `MCP tools discovery timed out after ${mcpTimeoutMs(server)} ms.` ``. The timer callback already builds it when it fires, so wrap it there.
- the exit message, `` `MCP server exited before tools/list completed (...).${detail}` ``.

Leave the `child.on("error", ...)` path unchanged.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/mcp/stdio-framing.test.js`
Expected: 6 tests pass, in about 3 seconds.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/mcp/stdio-framing.ts packages/core/src/mcp/tool-discovery.ts packages/core/test/unit/mcp/stdio-framing.test.mjs
git commit -m "fix(toolhub): name framing when a content-length stdio server fails discovery"
```

### Task 2: The ToolHub backend client and the empty-catalog error

**Files:**
- Modify: `packages/core/src/mcp/toolhub-mcp.ts` (`StdioMcpClient`, `ToolHubRegistry`, `ToolHubRuntime`)
- Test: `packages/core/test/integration/mcp/toolhub-mcp-runtime.test.mjs`

**Interfaces:**
- Consumes: `withStdioFramingHint` from Task 1.
- Produces: `ToolHubRegistry.serverErrors(): string[]`. It returns one `` `${name}: ${error}` `` string for each entry whose `status` is `"offline"` and whose `error` is set, in entry order, at most 3 strings, each `error` cut to 300 characters.

- [ ] **Step 1: Extract the test setup into a helper**

The two framing cases in `toolhub-mcp-runtime.test.mjs` share an inline body inside a `for` loop. Move that body into a function so the new cases reuse it:

```js
// Spawns the built runtime with these backends and returns the JSON-RPC response to one tool_hub.resolve call.
async function resolveWithBackends(t, servers) // returns { response, stderr } or undefined when the test was skipped
```

`servers` is the array that becomes `TOOLHUB_MCP_SERVERS_JSON`. The helper writes nothing to disk: the caller writes backend scripts and passes their paths in `servers`. It keeps the existing skips, the resolver server, the `initialize` exchange, the `tool_hub.resolve` call with id 2, and the 12-second wait for the reply. Rewrite the framing loop to call it. Run the file and confirm its 9 tests still pass before adding cases.

- [ ] **Step 2: Write the failing tests**

Add three backend script constants beside the existing ones. Each reuses `STDBACKEND_REPLIES` unless it says otherwise.

- `NEWLINE_ONLY_STDBACKEND_SCRIPT`: `NEWLINE_JSON_STDBACKEND_SCRIPT` without the block that exits on `Content-Length:`, and with a `try` around `JSON.parse` that skips a bad line. It mirrors the SDKs (spec F-1).
- `CONTENT_LENGTH_STALLS_STDBACKEND_SCRIPT`: `CONTENT_LENGTH_STDBACKEND_SCRIPT`, except that it writes a reply only when `message.method === "initialize"`.
- `LONG_ERROR_STDBACKEND_SCRIPT`: reads newline JSON and answers `initialize` with `{ id, jsonrpc: "2.0", error: { code: -32000, message: "x".repeat(1000) } }`. It does not use `STDBACKEND_REPLIES`.

Every server entry below also carries `startupTimeoutMs: 1000`, `requestTimeoutMs: 1000` and `transport: "stdio"`. Without the two timeouts a case waits for the 60-second default, twice per server (spec F-4). A backend failure surfaces as a JSON-RPC error, so assert on `response.error.message`. `hint` below is the text from Global Constraints.

| Case | Servers | `response.error.message` must |
|---|---|---|
| a | one, named `stdio-test`: `NEWLINE_ONLY` script, `stdioMessageMode: "content-length"` | start with `No MCP tools are available to resolve. Backend errors: stdio-test: MCP stdio request timed out (stdio-test): initialize` and end with `hint` |
| b | one, named `stdio-test`: `CONTENT_LENGTH_STALLS` script, `stdioMessageMode: "content-length"` | include `stdio-test: MCP stdio request timed out (stdio-test): tools/list` and not include `Content-Length framing` |
| c | four, named `one` to `four`, each with command `llmr-no-such-command`, no args and `stdioMessageMode: "content-length"` | include `one: spawn llmr-no-such-command ENOENT`, include `two: ` and `three: `, not include `four: `, and not include `Content-Length framing` |
| d | one, named `stdio-test`: `LONG_ERROR` script, no mode | include `stdio-test: xxx` and be shorter than 400 characters |

For case c also assert that the call settles in under 3000 ms, measured around `resolveWithBackends`.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/mcp/toolhub-mcp-runtime.test.js`
Expected: the four new cases fail. In each, `response.error.message` is exactly `No MCP tools are available to resolve.` Case c takes about 5 seconds before the change, because each dead child is waited on for a second (spec F-7).

- [ ] **Step 4: Stop reusing a child that failed to start**

In `StdioMcpClient.ensureChild`, the `child.on("error", ...)` handler today only calls `this.rejectAll(error)`. A failed spawn emits `error` and never `exit`, so `this.child` keeps pointing at a dead process. Change the handler so that, when `this.child === child`, it sets `this.initialized = false` and `this.child = undefined` before it rejects. The next call then spawns again and fails at once with the spawn error.

- [ ] **Step 5: Add the hint to `StdioMcpClient`**

- In `request`, the timeout message `` `MCP stdio request timed out (${this.server.name}): ${method}` `` goes through `withStdioFramingHint(message, this.server, this.initialized)`. `this.initialized` is `false` while `initialize` is pending and `true` for every later request.
- In the `exit` handler, read `this.initialized` into a local before the handler sets it to `false`, and pass that local as `handshakeDone` for the `` `MCP server exited (...)` `` message.
- The spawn error from Step 4 gets no hint.

- [ ] **Step 6: Add `ToolHubRegistry.serverErrors()`**

As the Interfaces block states. It reads `this.entries`.

- [ ] **Step 7: Show the errors when the catalog is empty**

In `ToolHubRuntime`, the throw of `"No MCP tools are available to resolve."` becomes: that sentence alone when `this.registry.serverErrors()` is empty, and otherwise that sentence followed by `` ` Backend errors: ${errors.join("; ")}` ``.

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/mcp/toolhub-mcp-runtime.test.js`
Expected: 13 tests pass. Cases a and b take about 2 seconds each, and case c takes well under 1 second.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/mcp/toolhub-mcp.ts packages/core/test/integration/mcp/toolhub-mcp-runtime.test.mjs
git commit -m "fix(toolhub): report backend errors when no MCP tools are available"
```

### Task 3: Docs and the full check

**Files:**
- Modify: `docs/src/content/docs/en/configuration/toolhub.md` (the "Troubleshooting" list)

- [ ] **Step 1: Add one troubleshooting line**

After the line that starts "Calls time out", add:

```markdown
- A stdio server never connects and its error mentions Content-Length framing: open the server in **Settings → ToolHub** and set **Stdio message mode** to `newline-json`. A server saved before v7.3 kept `content-length`, which standard MCP servers do not read.
```

Before writing it, replace `v7.3` with the release that ships PR 76: run `git tag --contains 75cb9c4d | sort -V | head -1`. If no tag contains it yet, write "before the stdio default changed" in place of the version.

- [ ] **Step 2: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
npm run build:assets
git checkout -- packages/core/models.json packages/ui/src/generated
```

Expected: every command exits 0, and `git status --short` lists only the files this PR changed.

- [ ] **Step 3: Commit and open the PR**

```bash
git add docs/src/content/docs/en/configuration/toolhub.md
git commit -m "docs(toolhub): say what to do when a stdio server reports Content-Length framing"
```

Write the PR body to a scratch file and pass `--body-file`. Open `## Why` with the spec's Goal.

---

## MF-2 Always speak newline JSON from LLMR's own stdio clients

**Fixes:** spec F-6, by option B
**Depends on:** MF-1 merged, and owner decision OD-1 answered yes
**Branch:** `refactor/mcp-stdio-newline-only`
**Owner steps:** Decide OD-1. Paste the release note from Task 1 Step 7 into the release that ships it.

Do not start this PR on an agent's judgment. If OD-1 is answered no, mark this section "Not doing" and stop.

LLMR's two stdio clients talk to three kinds of server: the ones in `config.agent.mcpServers`, the ones in `config.toolHub.mcpServers`, and the ones a plugin contributes through `coreGateway.config.agent.mcpServers`. `compileCoreGatewayConfig` joins the three into `externalMcpServers` (`packages/core/src/gateway/core-runtime/config-compiler.ts`). The gateway child, not LLMR, spawns the bundled servers that read `Content-Length`. So once none of those three can be `content-length`, the `Content-Length` code in both clients has no caller, and neither has the hint from MF-1.

This PR takes the `content-length` choice away from plugins too. OD-1 covers that. No plugin in this repo sets it.

### Task 1: Remove the choice

**Files:**
- Modify: `packages/core/src/config/config.ts` (`parseMcpServers`)
- Modify: `packages/core/src/gateway/core-runtime/config-compiler.ts` (`withStdioMessageModeDefault`)
- Modify: `packages/core/src/mcp/toolhub-mcp.ts` (`normalizeServerConfig`, `StdioMcpClient`)
- Modify: `packages/core/src/mcp/tool-discovery.ts` (`writeStdioMessage`, `createStdioMessageReader`)
- Delete: `packages/core/src/mcp/stdio-framing.ts`, `packages/core/test/unit/mcp/stdio-framing.test.mjs`
- Modify: `packages/ui/src/pages/home/shared/options.ts`, `shared/external.tsx`, `shared/types.ts`, `shared/virtual-models.ts`, `components/settings.tsx`, `components/virtual-models.tsx`
- Modify: `docs/src/content/docs/en/configuration/toolhub.md`
- Test: `packages/core/test/unit/mcp/mcp-child-env.test.mjs`, `packages/core/test/integration/mcp/toolhub-mcp-runtime.test.mjs`, `packages/ui/test/unit/mcp-server-config.test.mjs`

**Interfaces:**
- Consumes: nothing from MF-1 survives this task.
- Produces: `GatewayMcpStdioServerConfig.stdioMessageMode` keeps its type in `packages/core/src/contracts/app.ts`, because the bundled-server builders still set it. For a user-configured server its value is always `"newline-json"`.

- [ ] **Step 1: Confirm the premise**

```bash
rg -n "stdioMessageMode: \"content-length\"" packages -g '!**/test/**'
```

Expected: hits only in `packages/core/src/mcp/fusion-config.ts`, `packages/core/src/mcp/grok-media-config.ts` and `packages/electron/src/main/electron-web-search-mcp.ts`. A hit in any other source file means a new producer of a `Content-Length` server exists. Stop and tell the lead.

Then confirm no bundled server reaches LLMR's own clients. Read where `externalMcpServers` is built in `config-compiler.ts`: its three sources must be the plugin list, `config.agent.mcpServers` and `config.toolHub.mcpServers`, and nothing from `builtinToolArtifacts.mcpServers`. Read the two callers of `listMcpServerTools` (`packages/electron/src/main/ipc.ts`, `packages/core/src/web/management-server.ts`): each must take its server from `config.agent.mcpServers`. If either check fails, stop and tell the lead.

- [ ] **Step 2: Change the tests first**

- `mcp-child-env.test.mjs`: in both tests that use a server named `framed`, the expected `stdioMessageMode` becomes `"newline-json"`.
- `toolhub-mcp-runtime.test.mjs`: delete the `Content-Length` entry from the framing loop, `CONTENT_LENGTH_STDBACKEND_SCRIPT`, and MF-1's case a. Add one case: a `NEWLINE_JSON_STDBACKEND_SCRIPT` backend configured with `stdioMessageMode: "content-length"` resolves `["mcp.stdio_test.campaign-calendar"]`.
- `mcp-server-config.test.mjs`: replace the draft assertions with `mcpServerConfigFromDraft(...)` returning `stdioMessageMode: "newline-json"` for a stdio draft, and assert the draft object has no `stdioMessageMode` key.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npm run test:core` and `npm run test:ui`
Expected: the changed cases fail, and nothing else does.

- [ ] **Step 4: Make the core change**

- `parseMcpServers` and `normalizeServerConfig` set `stdioMessageMode: "newline-json"` and stop reading the input field.
- `withStdioMessageModeDefault` sets `"newline-json"` on every stdio server it maps, whatever the input says. Rename it `withNewlineStdioFraming`.
- `StdioMcpClient.write` and `readStdout` keep only the newline branch. Delete `drainContentLengthStdout`.
- `writeStdioMessage` and `createStdioMessageReader` lose their `mode` parameter and their `Content-Length` branch. Delete `contentLengthHeaderDelimiter` in `tool-discovery.ts`, which only that branch uses.
- Delete `stdio-framing.ts`, its test, and both call sites of `withStdioFramingHint`. Keep `ToolHubRegistry.serverErrors()` and the empty-catalog message.

- [ ] **Step 5: Make the UI change**

Delete `mcpStdioMessageModeOptions`, the `stdioMessageMode` member of `McpServerDraft`, the two dropdowns, and the field from the three draft builders. `mcpServerConfigFromDraft` writes `stdioMessageMode: "newline-json"` for a stdio server.

Remove what the deletion leaves unused: the `mcpStdioMessageModeOptions` import in `settings.tsx` and `virtual-models.tsx`, its two re-exports in `external.tsx`, and each `GatewayMcpStdioMessageMode` import that no longer has a use (`options.ts`, `types.ts`, `external.tsx`). `tsconfig.json` sets `noUnusedLocals`, so `npm run typecheck` names any that remain as error TS6133. Run it until it is clean.

- [ ] **Step 6: Update the docs page**

In `toolhub.md`, delete the "Stdio message mode" bullet and the `stdioMessageMode` line of the JSON example, and delete the troubleshooting line MF-1 added.

- [ ] **Step 7: Verify, commit and open the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
npm run test:ui
npm run build:assets
git checkout -- packages/core/models.json packages/ui/src/generated
rg -n "content-length" packages/core/src/mcp/tool-discovery.ts packages/ui/src/pages/home/shared/options.ts
```

Expected: the npm commands exit 0, and `rg` prints nothing.

Commit message: `refactor(toolhub): always speak newline JSON to user-configured stdio servers`.

Release note for the PR body: "The stdio message mode setting is gone. LLMR always speaks newline-delimited JSON, the MCP standard, to a stdio server you configure. A server saved with `content-length` now connects without a change."

---

## MF-3 Cap interactive discovery below the startup timeout

**Fixes:** spec F-3, by option D
**Depends on:** MF-1 merged, and owner decision OD-2 answered with a number of milliseconds
**Branch:** `fix/mcp-discovery-timeout`
**Owner steps:** Decide OD-2. A first `npx` start downloads a package and can take longer than a minute, so the number trades a fast failure against a false timeout on first use.

Do not start this PR on an agent's judgment, and do not pick the number.

### Task 1: A separate ceiling for discovery

**Files:**
- Modify: `packages/core/src/mcp/tool-discovery.ts` (`mcpTimeoutMs`, `listMcpServerTools`)
- Test: `packages/core/test/unit/mcp/stdio-framing.test.mjs` if MF-2 has not deleted it, else `packages/core/test/unit/mcp/mcp-child-env.test.mjs`

**Interfaces:**
- Produces: `mcpDiscoveryMaxTimeoutMs: number`, exported from `tool-discovery.ts`, holding the owner's number. `listMcpServerTools(server, options?: { maxTimeoutMs?: number })`: discovery waits `Math.min(mcpTimeoutMs(server), options?.maxTimeoutMs ?? mcpDiscoveryMaxTimeoutMs)`. The option exists so a test does not wait for the real ceiling.

- [ ] **Step 1: Write the failing test**

A `silent` server (`process.stdin.resume();`) with `startupTimeoutMs: 3000`, called with `{ maxTimeoutMs: 1000 }`, rejects with a message that matches `/timed out after 1000 ms\./`. Assert the call settles in under 2500 ms. Keep `startupTimeoutMs` small: a test that leaves a long timer and a live child keeps `node --test` running after the test itself is reported, and `--test-timeout` does not end it.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/mcp/<file>.test.js`
Expected: FAIL after about 3 seconds. The message says `timed out after 3000 ms.`, because `listMcpServerTools` ignores its second argument today.

- [ ] **Step 3: Implement the ceiling**

As the Interfaces block states. The timeout message reports the wait that was applied, not `startupTimeoutMs`.

- [ ] **Step 4: Run it and confirm it passes**

Run the command from Step 2.
Expected: PASS in about 1 second.

- [ ] **Step 5: Verify, commit and open the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
npm run build:assets
git checkout -- packages/core/models.json packages/ui/src/generated
```

Commit message: `fix(toolhub): stop tool discovery waiting for the full server startup timeout`.

---

## When this plan has shipped

Add a `**Status:**` line under each PR heading when it merges, as the audit plans do. When MF-1 has merged and OD-1 and OD-2 are each either shipped or declined, move this plan and its spec to the `completed/` folders and repoint the links between them.
