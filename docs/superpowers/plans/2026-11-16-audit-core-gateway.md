# Audit remediation: core gateway implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix audit findings F-C1 to F-C12 in `packages/core` so the proxy decrypts only what it routes and forwards the client's own credential, user-owned files survive a crash mid-write, a dropped MCP stream reconnects, and marketplace modules are verified before they are cached.

**Architecture:** Eight pull requests and one docs commit, each small enough to review alone. CG-1 deletes dead code first so later PRs edit a smaller tree. Every fix reuses a helper the repo already has (`writeFileAtomic`, the `session-store.ts` unsaved-refresh pattern, the existing upstream-proxy CONNECT code) instead of adding a new one. CG-9 deletes the proxy key injection (F-C1), as decision D-12 says.

**Tech Stack:** TypeScript on Node 24, `node:test` with `node:assert/strict`, esbuild, React for the one UI change.

**Spec:** `docs/superpowers/specs/2026-11-16-audit-remediation.md`

## Decisions made after the spec

Jason made these on 2026-11-16. They bind this plan. The spec records them as D-10, D-11 and D-12.

- **Retry mode (F-C9).** The logic stays as it is. It matches the Anthropic and OpenAI SDK defaults and is off by default. The fix is one docs change that says retries stack. The finding closes as not a defect. CG-8 has no code.
- **Marketplace (F-C6).** Every module entry needs a sha256 `integrity`. An entry without one is skipped. LLMR hashes the raw bytes, writes the cached module atomically, and downloads a cached file again when it fails its hash, unless LLMR is offline. An entry whose module fails its hash stays in the list with Install disabled and the message "Integrity check failed".
- **Proxy key injection (F-C1, D-12).** Delete the injection. The proxy forwards the client's own credential and the gateway validates it. No opt-in setting. CG-9 does this.
- **No consumers (D-9).** No PR here adds a compatibility path.

## PR order and independence

| PR | Title | Depends on |
|---|---|---|
| CG-1 | Delete dead core exports and config | None |
| CG-2 | Tunnel non-target hosts and bound the MITM cache | CG-1 |
| CG-3 | Write user-owned files atomically | CG-1 |
| CG-4 | Small gateway guards | CG-1, CG-2 |
| CG-5 | Reconnect a dropped SSE MCP stream | CG-1 |
| CG-6 | Require marketplace module integrity | CG-1 |
| CG-7 | Refresh with the rotated Codex refresh token in the provider probe and account service | CG-1 |
| CG-8 | Document retry stacking | None |
| CG-9 | Delete the proxy key injection | CG-2 |

CG-1 goes first. It only moves line numbers for the others. CG-2, CG-3, CG-5, CG-6 and CG-7 touch different files and can land in any order after CG-1. CG-4 needs `redactSensitiveUrlQuery`, which CG-2 adds. CG-8 is docs-only and can land at any time.

Line numbers below are from `136ad730`. Each edit also names a symbol or a text anchor. After CG-1 lands, find the anchor, not the line.

## Global Constraints

Copied from the spec.

- Node `>=24`. npm only, never pnpm or yarn. Regenerate lockfiles with npm; never edit them by hand.
- Code goes through a branch and a squash-merged PR. Docs-only changes commit straight to `main`.
- The commit gate runs `npm run typecheck` and `npm run test:architecture`. Both must pass on every commit.
- Never `import()` the `ai-gateway` package or run it in-process in a test or script. It starts a server on `*:3000` that never exits. The one exception is the two wire test files in F-A3. They spawn the gateway bin as a child process that the test owns, and RS-1 runs them. The release safety plan's workstream constraints say how they start and stop it.
- Never run `npm run rebuild:sqlite3` locally.
- `npm run build:assets` and `npm run test:e2e` may rewrite `packages/core/models.json` and `packages/ui/src/generated/`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated` unless the change is intended.
- Style: double quotes, semicolons, two-space indent, `node:` imports first, `type` aliases unless the file already uses `interface`, no comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`. Run one file with `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<kind>/<path>.test.js`.
- The project has no consumers as of 2026-11-16 (decision D-9). No fix adds a compatibility shim, a migration for existing installs, or a deprecation period.
- A rule and the check that enforces it change in the same PR.
- This machine's `~/.npmrc` sets `min-release-age=7`. A package version younger than seven days does not install without an override, which is an owner step.

Specific to this plan.

- Read a file with Read before you edit it. The path-scoped rules in `.claude/rules/` load only on Read, Edit and Write.
- `packages/core/src/gateway/**` follows `.claude/rules/gateway.md`. Gateway modules never import `gateway/service.ts`. Run `npm run test:core` after any gateway change, because the commit gate does not.
- `packages/core/src/mcp/**` follows `.claude/rules/mcp-subprocess.md`. Run `npm run build:assets` after you touch a file there (CG-5).
- `packages/ui/**` follows `.claude/rules/ui.md`. UI component tests render with `renderToStaticMarkup`.
- Core tests are `*.test.mjs`. The compiled path keeps the subfolder, for example `.test-dist/core/test/unit/proxy/proxy-peer.test.js`.
- The test bundles isolate `HOME` on their own (`build/test-home.mjs`). A test that needs its own directories creates them under `os.tmpdir()`.
- Do not change `createForwardHeaders` or `primaryApiKey` in `proxy/service.ts`, or the test "a loopback absolute-URL request reaches the gateway with the API key". They belong to CG-9.

## Review Focus

Each line has its pinning test in the owning task.

1. A user with a takeover profile and a `claude_desktop_config.json` that does not parse starts the gateway or saves settings. `syncClaudeAppGatewayConfig` runs on both paths. It must skip the takeover with a message and must not throw (CG-3 Task 1).
2. A gateway key is created and used within one second. With refresh-on-miss gone, the persisted-key cache can be up to 1,000 ms stale. The key must work as soon as the cache expires (CG-4 Task 1).
3. The MITM cache evicts a server while a client still streams through it. Eviction must never call `closeAllConnections` (CG-2 Task 3).
4. The Grok CLI writes a newer credential to `auth.json` while LLMR holds an unsaved refresh in memory. The newer credential on disk must win (CG-3 Task 2).
5. A client sends `CONNECT [::1]:8443`. `URL.hostname` keeps the brackets and `net.connect` rejects them, so the tunnel must strip them (CG-2 Task 2).

## Known limits

No task fixes these. Each one is stated so a reviewer does not rediscover it.

- **Hard-linked rc files.** `writeFileAtomic` renames a temp file over the target. A symlink is followed and survives. A hard link is broken, and the other name keeps the old content.
- **Tunnels opened before capture is turned on.** A tunnel is opaque for its lifetime. Turning Capture network on affects new connections only.
- **An evicted MITM server and a CONNECT in flight.** A CONNECT that resolved its server just before eviction can fail with 502. The client retries.
- **Codex token rotation is unverified.** Nobody has checked whether the Codex OAuth token endpoint rotates refresh tokens (spec, "Not verified by anyone"). CG-7 makes the probe correct if it does. CG-7 keeps the rotated token in memory only, so a restart goes back to the token in `~/.codex/auth.json` or in the provider plugin config.
- **The same pattern in `account-service.ts`.** `refreshCodexAccountToken` (`packages/core/src/providers/account-service.ts:1911`) keys `codexOauthCache` by the hash of the presented refresh token, stores the rotated token in the entry, and on the next stale refresh sends the presented token again (`refresh_token: refreshToken`, `:1941`). Review confirmed it on 2026-11-16 and added Steps 4a to 4c to CG-7 Task 1, which fix it the same way.
- **Captured bodies stay readable.** With Capture network on, every host is still decrypted, and any holder of a gateway key can read captured bodies through the `network_capture_get` MCP tool. After CG-9 every proxied tool holds one. The spec defers narrowing who can read them.
- **Custom marketplaces.** A catalog set through `LLMR_PLUGIN_MARKETPLACE_URL` loses every module entry that has no `integrity`. D-9 accepts this.

---

## CG-1 Delete dead core exports and config

**Fixes:** F-C11
**Depends on:** None
**Branch:** `refactor/core-dead-exports`
**Size:** S
**Owner steps:** None

**Status:** Merged 2026-11-16 as [PR 73](https://github.com/jrmatherly/llm-router/pull/73), squash commit `012964e7`. Two reviews changed no code and corrected two statements:

- Step 4 says a stored config with `browserMode` loads unchanged. That holds for loading. The next save writes the parsed config and merges back only `theme`, so the key leaves the stored config then, or during load when the load path rewrites the snapshot.
- `ModelCatalogEntry.metadata` lost its only reader with `modelCatalogReasoningEffortConfig`, the same way `sourceRecords` did. The spec's deferred list now names both.

`x-llmr-route-fallback` is still written (`decisionHeaders` in `gateway/core-runtime/router-plugin.ts`) and has no reader in this repo, in `@the-next-ai/ai-gateway` 1.0.21, or in upstream at v3.1.5. Its removal is an open owner decision.

### Task 1: Delete eleven exports, what they orphan, and `proxy.browserMode`

**Files:**
- Modify: the files in the table below, all under `packages/core/src/`
- Modify: `packages/core/src/contracts/app.ts`, `packages/core/src/config/default-config.ts`, `packages/core/src/config/config.ts`

**Interfaces:**
- Produces: nothing. Later PRs must not use any name in the table.

- [ ] **Step 1: Create the branch**

```bash
git switch -c refactor/core-dead-exports
```

- [ ] **Step 2: Confirm each symbol is still unreferenced**

```bash
for s in broadcastWindowsEnvironmentChanged GROK_MEDIA_MCP_SERVER_NAME readProxyCertificateSerialNumber DEFAULT_RETRY_AFTER_MS claudeCodeEffectiveMaxInputTokens modelCatalogReasoningEffortConfig findInstalledZcodeAppExecutable isSafeRouteReadPath decodeLlmrRouteFallbackHeader zcodeModelCatalogJson updateGatewayRequestLogFromRawTrace; do rg -nw "$s" packages tests scripts build docs -g '!**/dist/**' -g '!docs/superpowers/**'; done
```

Expected: one line per symbol, its own definition. A second hit means another plan added a use. Stop and tell the lead.

- [ ] **Step 3: Delete the symbols and what each deletion orphans**

| Symbol | File and line | Delete with it | Keep |
|---|---|---|---|
| `broadcastWindowsEnvironmentChanged` | `platform/windows-system.ts:30` | the `spawnSync` import on line 1 | `windowsEnvironmentChangedPowerShellLines` and `windowsSystemCommand`, which `profiles/launch-service.ts` imports |
| `GROK_MEDIA_MCP_SERVER_NAME` | `contracts/app.ts:131` | nothing | the comment above it, which still describes the other legacy names |
| `readProxyCertificateSerialNumber` | `proxy/certificates.ts:136` | nothing | the `pki` import, which `createCertificateForHost` uses |
| `DEFAULT_RETRY_AFTER_MS` | `gateway/internal/clock.ts:1` | nothing | `delay` |
| `claudeCodeEffectiveMaxInputTokens` | `gateway/model-catalog.ts:164` | `claudeCodeDefaultContextTokens` (`:5`) | `modelCatalogMaxInputTokens` |
| `modelCatalogReasoningEffortConfig` | `gateway/model-catalog.ts:184` | the exported type `ModelCatalogReasoningEffortConfig` (`:24`), and the functions `sourceRecordsForProvider` (`:385`), `reasoningConfigFromMetadata` (`:404`), `normalizeReasoningEfforts` (`:443`), `normalizeReasoningEffort` (`:457`) | `ModelCatalogSourceRecord`, `ModelCatalogEntry.sourceRecords` and `parseModelCatalogSourceRecords`. The spec defers them. `isRecord`, `stringValue` and `normalizeModelCatalogToken` have other callers in the file. |
| `findInstalledZcodeAppExecutable` | `agents/codex/app-launch.ts:246` | nothing | `zcodeAppSpec`, which `launchZcodeAppProfile` uses |
| `isSafeRouteReadPath` | `routing/rewrite.ts:210` | nothing | `unsafePathSegments`, used at `:132` and `:350` |
| `decodeLlmrRouteFallbackHeader` | `gateway/core-runtime/router-plugin-contract.ts:83` | `isRouterFallbackConfig` (`:95`) | `encodeLlmrRouteFallbackHeader` |
| `zcodeModelCatalogJson` | `agents/zcode/model-catalog.ts:77` | nothing | `buildZcodeModelCatalog` |
| `updateGatewayRequestLogFromRawTrace` | `observability/request-log-store.ts:1818` | nothing | `enqueueGatewayRequestLogFromRawTrace` |

`ModelCatalogReasoningEffortConfig` is exported, so `noUnusedLocals` does not flag it. Delete it by hand.

- [ ] **Step 4: Delete `proxy.browserMode`**

- `contracts/app.ts:1237`. Remove `browserMode: boolean;` from `ProxyRuntimeConfig`.
- `config/default-config.ts:194`. Remove `browserMode: true,`.
- `config/config.ts:2536-2545`, in `parseProxy`. Remove the `const browserMode = …` expression with its `builtInBrowser` and `builtInBrowserMode` aliases, and the `if (browserMode !== undefined)` block.

A stored config that still has the key loads unchanged, because `parseProxy` copies only the keys it names.

- [ ] **Step 5: Type-check until clean**

Run: `npm run typecheck`
Expected: exit 0. `tsconfig.json:16` sets `noUnusedLocals`, so an orphan the table missed shows as error TS6133. Delete it if it is module-private and has no other reference. Run again until clean.

- [ ] **Step 6: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
rg -nw "browserMode|builtInBrowser|builtInBrowserMode" packages tests scripts build
```

Expected: the three npm commands exit 0. `rg` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src
git commit -m "refactor(core): delete eleven dead exports and the unused proxy.browserMode setting"
```

---

## CG-2 Tunnel non-target hosts and bound the MITM cache

**Fixes:** F-C2, F-C3
**Depends on:** CG-1
**Branch:** `fix/proxy-tunnel-non-target-hosts`
**Size:** M
**Owner steps:** None

**Status:** Merged 2026-11-17 as [PR 93](https://github.com/jrmatherly/llm-router/pull/93), squash commit `5128f283`. The review changed these points:

- `beginNetworkCapture` builds `path` from the redacted URL object, not from a second `redactSensitiveUrlQuery` call. A request target that starts with `//` does not parse as a path, so the helper returned it with its key.
- An upstream proxy that refuses the tunnel goes through `handleConnectError`, so it is logged. The direct tunnel has the same 30 s connect timeout as the upstream path.
- The eviction test uses mocked timers. The Task 3 test as written passes when eviction calls `closeServer`, because its `closeAllConnections` timer fires after the assertion.
- One more test: a CONNECT to a plugin proxy route host is intercepted.
- The docs say proxy targets are decrypted in gateway mode only, and that a tunnel stays a tunnel after its host becomes a routed host. That second point is a known limit this plan did not list.

Found and left alone: `buildGatewayUrl` throws `Invalid URL` for a routed host when the request path starts with `//`, and the client gets 502. It predates CG-2.

All tests in this PR run with:

```bash
node build/test.mjs core && node --test .test-dist/core/test/unit/proxy/proxy-peer.test.js .test-dist/core/test/unit/observability/sensitive-url-query.test.js
```

### Task 1: Redact credential query parameters in network capture

**Files:**
- Modify: `packages/core/src/observability/sensitive-headers.ts`
- Modify: `packages/core/src/observability/raw-trace-sync.ts:1660` and `:1811-1830` (`sanitizeUrlForLog`, `isSensitiveQueryParam`)
- Modify: `packages/core/src/proxy/service.ts:780-790` (`beginNetworkCapture`, the `path`, `upstreamUrl` and `url` fields)
- Create: `packages/core/test/unit/observability/sensitive-url-query.test.mjs`
- Test: `packages/core/test/unit/proxy/proxy-peer.test.mjs`

**Interfaces:**
- Produces: `redactSensitiveUrlQuery(url: string): string`, exported from `@llmr/core/observability/sensitive-headers`. CG-4 uses it.

Rules for `redactSensitiveUrlQuery`. The sensitive names are `key`, `api_key`, `apikey` and `access_token`, matched after `trim().toLowerCase()`. That is the list `isSensitiveQueryParam` has today. Each matching value becomes `[redacted]` through `searchParams.set`. Parse with `new URL(url, "http://127.0.0.1")`. Return `url.toString()` when the input starts with a scheme, and `` `${pathname}${search}${hash}` `` when it does not. Return the input unchanged when it does not parse. `route-trace.ts:228` has its own sanitizer with a wider name rule. Leave it.

- [ ] **Step 1: Create the branch and write the failing tests**

```bash
git switch -c fix/proxy-tunnel-non-target-hosts
```

`sensitive-url-query.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { redactSensitiveUrlQuery } from "@llmr/core/observability/sensitive-headers.ts";

test("redactSensitiveUrlQuery hides credential parameters and keeps the rest", () => {
  assert.equal(redactSensitiveUrlQuery("https://h.test/v1?key=abc&x=1"), "https://h.test/v1?key=%5Bredacted%5D&x=1");
  assert.equal(redactSensitiveUrlQuery("https://h.test/v1?API_KEY=a&apikey=b&access_token=c"), "https://h.test/v1?API_KEY=%5Bredacted%5D&apikey=%5Bredacted%5D&access_token=%5Bredacted%5D");
  assert.equal(redactSensitiveUrlQuery("https://h.test/v1?x=1"), "https://h.test/v1?x=1");
});

test("redactSensitiveUrlQuery keeps a path a path and passes through what it cannot parse", () => {
  assert.equal(redactSensitiveUrlQuery("/v1/models?api_key=abc"), "/v1/models?api_key=%5Bredacted%5D");
  assert.equal(redactSensitiveUrlQuery("http://["), "http://[");
});
```

In `proxy-peer.test.mjs`, give `proxyGet` a second parameter, `url = "http://api.example.test/v1/messages"`, and use it as the request `path`. Add:

```js
test("network capture stores query-string credentials redacted", async () => {
  await withProxy(undefined, async ({ frontPort }) => {
    proxyService.setNetworkCaptureEnabled(true);
    try {
      assert.equal(await proxyGet(frontPort, "http://api.example.test/v1/messages?key=sk-secret&x=1"), 200);
      const item = proxyService.getNetworkCaptures().items[0];
      assert.equal(item.url, "http://api.example.test/v1/messages?key=%5Bredacted%5D&x=1");
      assert.equal(item.path, "/v1/messages?key=%5Bredacted%5D&x=1");
      assert.doesNotMatch(JSON.stringify(item), /sk-secret/);
    } finally {
      proxyService.setNetworkCaptureEnabled(false);
      proxyService.clearNetworkCaptures();
    }
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Expected: `node build/test.mjs core` exits non-zero before any test runs. The test build bundles with esbuild, and esbuild stops on `No matching export in "packages/core/src/observability/sensitive-headers.ts" for import "redactSensitiveUrlQuery"`. To see the capture test fail on `item.url` as well, add a stub `export function redactSensitiveUrlQuery(url: string): string { return url; }` first.

- [ ] **Step 3: Implement**

- Add `redactSensitiveUrlQuery` to `sensitive-headers.ts`.
- In `raw-trace-sync.ts`, delete `sanitizeUrlForLog` and `isSensitiveQueryParam`. Line 1660 becomes `const url = rawUrl ? redactSensitiveUrlQuery(rawUrl) : undefined;`.
- In `beginNetworkCapture`, redact once and build all three fields from the result. `url` is `redactSensitiveUrlQuery(targetUrl.toString())`, `path` is `` redactSensitiveUrlQuery(`${targetUrl.pathname}${targetUrl.search}`) ``, and `upstreamUrl` is `redactSensitiveUrlQuery(upstreamUrl.toString())`. The forwarded request keeps the real query string.

- [ ] **Step 4: Run the tests and see them pass**

Also run `node --test .test-dist/core/test/unit/observability/raw-trace-sync.test.js`. Expected: PASS, which shows the move changed no raw-trace output.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/observability packages/core/src/proxy/service.ts packages/core/test/unit
git commit -m "fix(proxy): redact credential query parameters in network capture"
```

### Task 2: Tunnel CONNECT for hosts LLMR does not route

**Files:**
- Modify: `packages/core/src/proxy/service.ts:633-662` (`handleConnect`)
- Test: `packages/core/test/unit/proxy/proxy-peer.test.mjs`

**Interfaces:**
- Produces, both private methods of `ProxyService`:
  - `shouldIntercept(hostname: string): boolean`
  - `tunnelConnect(request: IncomingMessage, target: { hostname: string; port: number }, clientSocket: Socket, head: Buffer): void`

Behaviour.

- `handleConnect` keeps its loopback guard first. After `parseConnectTarget`, it calls `tunnelConnect` and returns when `!this.networkCaptureEnabled && !this.shouldIntercept(target.hostname)`. Otherwise it runs the MITM path it has today. Capture on keeps decrypting every host.
- `shouldIntercept` is true when `this.config?.proxy.mode === "gateway"` and some `this.config.proxy.targets` entry satisfies `matchesHost(target.host, hostname)`, or when some host in `pluginService.getProxyRouteHosts()` satisfies `matchesHost(host, hostname)`. Use the module's own `matchesHost` (`:1330`). `plugins/service.ts:1146` holds a byte-identical private copy, so the two decisions agree. The match is by host only, because CONNECT carries no path.
- `tunnelConnect` picks the upstream with `` selectUpstreamProxyForUrl(this.upstreamProxy, new URL(`https://${target.hostname}:${target.port}`)) ``, built from the bracketed `target.hostname` that `parseConnectTarget` returns (`new URL("https://::1:8443")` throws). It strips one leading `[` and one trailing `]` only for the `net.connect` host. The CONNECT authority it sends to an upstream proxy keeps the brackets.
  - No upstream proxy. `net.connect(target.port, host)`. On `connect`, write `HTTP/1.1 200 Connection Established\r\n\r\n` to the client, write `head` to the remote if it is not empty, and pipe both ways.
  - With an upstream proxy. Send a CONNECT through `http.request`, built the way `forwardHttpsRequestViaHttpProxy` builds it at `:1104-1118`, with `upstreamProxyAuthorizationHeader` and `setClientRequestTimeout(…, upstreamProxyConnectTimeoutMs, …)`. On a 2xx reply, write the same 200 line to the client, forward both `head` buffers, and pipe both ways. On any other status, call `closeConnectSocket(clientSocket, 502, message)` and destroy the upstream socket.
  - Errors. An error before the tunnel is up goes to `handleConnectError(request, clientSocket, error)`. After that, an error or end on one socket destroys or ends the other. Both sockets get an `error` listener, so nothing is unhandled.

- [ ] **Step 1: Write the failing tests**

Add a helper `connectThrough(frontPort, authority)`. It opens `net.connect(frontPort, "127.0.0.1")`, writes `` `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n` ``, reads until the first `\r\n\r\n`, and resolves `{ socket, statusLine }`. Add `echoServer()`, a `net` server on `127.0.0.1` that pipes each socket to itself. Each test mocks `getMitmServer` with `t.mock.method` and counts calls, as the test at `:93` does. The mock resolves `{ host, port: sinkPort }`, where `sinkPort` is a second `echoServer`.

```js
test("CONNECT to a host that matches no target is tunnelled without MITM", async (t) => {
  // echo on 127.0.0.1, CONNECT `127.0.0.1:${echoPort}`
  assert.equal(statusLine, "HTTP/1.1 200 Connection Established");
  socket.write("ping");
  assert.equal(String((await once(socket, "data"))[0]), "ping");
  assert.equal(mitmCalls, 0);
});

test("CONNECT to a proxy target host is intercepted", async (t) => {
  // CONNECT api.example.test:443, the target withProxy configures
  assert.equal(statusLine, "HTTP/1.1 200 Connection Established");
  assert.equal(mitmCalls, 1);
});

test("with capture on, CONNECT to any host is intercepted", async (t) => {
  // proxyService.setNetworkCaptureEnabled(true) inside withProxy, CONNECT `127.0.0.1:${echoPort}`, reset in finally
  assert.equal(mitmCalls, 1);
});

test("a tunnelled CONNECT goes through the upstream proxy", async (t) => {
  // fake upstream: http.createServer() with a "connect" handler that records request.url and
  // request.headers["proxy-authorization"], replies "HTTP/1.1 200 OK\r\n\r\n" and echoes.
  // proxyService.upstreamProxy = { https: { host: "127.0.0.1", password: "p", port, protocol: "http", username: "u" } }
  // CONNECT tunnel.example.test:443, then set upstreamProxy back to undefined in finally
  assert.equal(statusLine, "HTTP/1.1 200 Connection Established");
  assert.deepEqual(seen, [{ authorization: `Basic ${Buffer.from("u:p").toString("base64")}`, url: "tunnel.example.test:443" }]);
  socket.write("ping");
  assert.equal(String((await once(socket, "data"))[0]), "ping");
  assert.equal(mitmCalls, 0);
});

test("an upstream proxy that refuses the CONNECT yields 502", async (t) => {
  // fake upstream replies "HTTP/1.1 403 Forbidden\r\n\r\n"
  assert.equal(statusLine, "HTTP/1.1 502 Bad Gateway");
});

test("CONNECT to an IPv6 literal is tunnelled", async (t) => {
  // echo on "::1"; t.skip("IPv6 loopback is unavailable") when listen rejects. CONNECT `[::1]:${echoPort}`
  assert.equal(statusLine, "HTTP/1.1 200 Connection Established");
  socket.write("ping");
  assert.equal(String((await once(socket, "data"))[0]), "ping");
  assert.equal(mitmCalls, 0);
});
```

The upstream test uses a non-loopback name on purpose. `shouldBypassUpstreamProxy` skips the upstream proxy for `localhost`, `127.0.0.1`, `::1` and `*.local`. `URL.hostname` keeps the brackets on an IPv6 literal, so its `"::1"` comparison never matches a tunnelled `[::1]` CONNECT, and that tunnel would go to a configured upstream proxy. In `shouldBypassUpstreamProxy` (`packages/core/src/proxy/service.ts:1440`), also match `"[::1]"`. Pin it in the IPv6 tunnel test: with an upstream proxy configured, a CONNECT to `[::1]:<port>` reaches the local echo server and the fake upstream proxy records 0 connections.

- [ ] **Step 2: Run the tests and see them fail**

Expected: the first, fourth, fifth and sixth tests fail, because `getMitmServer` runs for every host today (`mitmCalls` is 1, or the upstream sees nothing). The second and third pass already and pin behaviour that must not change.

- [ ] **Step 3: Implement `shouldIntercept` and `tunnelConnect`, and branch in `handleConnect`**

- [ ] **Step 4: Run the tests and see them pass**

Expected: PASS, including the existing "a non-loopback CONNECT gets 403 and the socket is closed".

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/proxy/service.ts packages/core/test/unit/proxy/proxy-peer.test.mjs
git commit -m "fix(proxy): tunnel CONNECT for hosts that match no target or plugin route"
```

### Task 3: Cap the MITM server cache

**Files:**
- Modify: `packages/core/src/proxy/service.ts:664-677` (`getMitmServer`), and the constants near `:128`
- Test: `packages/core/test/unit/proxy/proxy-peer.test.mjs`

**Interfaces:**
- Produces: `const maxMitmServers = 128;` beside `maxNetworkCaptureEntries`.

Behaviour. `secureServers` stays a `Map<string, Promise<MitmServer>>` and its insertion order is the recency order. Add `evictedServers: Set<MitmServer["server"]>`. Eviction adds the server to it and removes it again on the server's `close` event. `stop()` closes every server left in the set the same way it closes the cached ones, so no evicted server outlives the proxy. In the eviction test, call `stop()` after the eviction and assert that `closeAllConnections` ran for the evicted host then, and not before. On a hit, delete the key and set it again. After an insert, while `size > maxMitmServers`, take the first key, delete it, and close that server once its promise resolves with `server.close()` and `server.closeIdleConnections()`. Never call `closeServer` there, because its timer calls `closeAllConnections` and would cut a live stream. A rejected promise needs no close. The cap is 128 and not the 32 the research proposed. With capture on, one browser page opens 50 to 100 hosts, and each eviction costs an RSA key generation of 20 to 150 ms on the next visit.

- [ ] **Step 1: Write the failing tests**

Mock `createMitmServer` with `t.mock.method`. It resolves `{ host: hostname, port: 0, server: { close: () => closed.push(hostname), closeAllConnections: () => closedAll.push(hostname), closeIdleConnections: () => {} } }`. Register `t.after(() => proxyService.secureServers.clear())`.

```js
test("the MITM cache evicts the least recently used server past its cap", async (t) => {
  for (let i = 0; i < 128; i++) await proxyService.getMitmServer(`h${i}.test`);
  await proxyService.getMitmServer("h0.test");
  await proxyService.getMitmServer("h128.test");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(closed, ["h1.test"]);
  assert.deepEqual(closedAll, []);
  assert.equal(created, 129);
});
```

`created` counts `createMitmServer` calls. The second `h0.test` lookup must not create a server.

- [ ] **Step 2: Run the test and see it fail**

Expected: FAIL, `closed` is `[]`.

- [ ] **Step 3: Implement the cap in `getMitmServer`**

- [ ] **Step 4: Run the test and see it pass**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/proxy/service.ts packages/core/test/unit/proxy/proxy-peer.test.mjs
git commit -m "fix(proxy): cap the MITM server cache at 128 hosts"
```

### Task 4: Docs

**Files:**
- Modify: `docs/src/content/docs/en/configuration/server.md:41-56` (section "Proxy mode")

- [ ] **Step 1: Edit the section**

- Replace the sentence that starts "LLMR uses MITM interception to identify and decrypt HTTPS requests" with: "LLMR decrypts HTTPS only for the hosts it routes, which are the proxy targets and the hosts of plugin proxy routes. It passes every other host through as an opaque tunnel and cannot read that traffic."
- In the table, the **Capture network** row becomes: "Stores network requests that pass through proxy mode so the Networking page can show request and response details. While it is on, LLMR decrypts every host, not only the hosts it routes. Credential query parameters such as `key` and `api_key` are stored as `[redacted]`."
- Add after the table: "A connection that was opened as a tunnel stays a tunnel. Turn on Capture network before you start the client you want to inspect."

- [ ] **Step 2: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: all exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/src/content/docs/en/configuration/server.md
git commit -m "docs: say which hosts proxy mode decrypts"
```

---

## CG-3 Write user-owned files atomically

**Fixes:** F-C5
**Depends on:** CG-1
**Branch:** `fix/atomic-user-file-writes`
**Size:** M
**Owner steps:** None

Every write in this PR goes through `writeFileAtomic(file: string, content: string, options?: { mode?: number }): void` from `@llmr/core/profiles/backup-files` (`packages/core/src/profiles/backup-files.ts:76`). It writes a temp file beside the target and renames it, follows a symlink to its real file, and keeps the existing mode when `mode` is not given. Five `agents/*` modules import it already, and no architecture test forbids the import.

### Task 1: Claude App config and backup

**Files:**
- Modify: `packages/core/src/agents/claude-app/gateway-service.ts` (`syncClaudeAppGatewayConfig` `:88`, `applyClaudeAppGatewayConfig` `:145`, `restoreClaudeAppGatewayConfig` `:213`, `readClaudeAppGatewayBackup` `:371`, `restoreFileSnapshot` `:417`, the three `apply*` writers `:465-519`, `writeJsonFile` `:530`)
- Test: `packages/core/test/unit/agents/claude-app-gateway-sync.test.mjs`

**Interfaces:**
- Produces: `export class ClaudeAppConfigParseError extends Error`.
- Produces, module-private: `readJsonRecordForUpdate(file: string): Record<string, unknown> | undefined`. It returns `undefined` when the file is missing, empty or whitespace only. It throws `ClaudeAppConfigParseError` with the message `` `${file} could not be parsed; LLMR left it unchanged.` `` when the file has content that is not a JSON object.
- Changes: `readClaudeAppGatewayBackup(): ClaudeAppGatewayBackup | "corrupt" | undefined`. `undefined` means the file does not exist. `"corrupt"` means it exists and cannot be read as a version 1 backup.

Behaviour.

- **Atomic writes.** The bodies of `writeJsonFile` and of the `snapshot.exists` branch of `restoreFileSnapshot` become `mkdirSync(path.dirname(file), { recursive: true })` then `writeFileAtomic(file, content, { mode: 0o600 })`. Drop the `chmodSync` calls and the unused `fs` imports.
- **Refuse to overwrite.** `applyClaudeAppGatewayConfig` reads the library file, the meta file and the root config of every target path with `readJsonRecordForUpdate` before `backupClaudeAppGatewayConfig` and before the first write. The three `apply*` writers take the parsed record as a second parameter instead of reading the file themselves. A parse error therefore leaves all files and the backup untouched.
- **The passive path does not throw.** `syncClaudeAppGatewayConfig` wraps its `applyClaudeAppGatewayConfig(config)` call. On `ClaudeAppConfigParseError` it calls `console.warn` with the message and returns `{ config, configChanged: false, result: skippedClaudeAppGatewayResult(config, error.message) }`. Other errors propagate. The explicit callers (`packages/cli/src/cli.ts:208`, `profiles/launch-service.ts:385`) still get the throw.
- **Corrupt backup.** When `readClaudeAppGatewayBackup` returns `"corrupt"`, `restoreClaudeAppGatewayConfig` warns once with `` `[claude-app] ${CLAUDE_APP_GATEWAY_BACKUP_FILE} could not be read; removing LLMR's takeover keys without it.` ``. Then it reads the meta file. Only when `appliedId === CLAUDE_APP_CONFIG_ID` it deletes `appliedId` and writes the meta file, and deletes `deploymentMode` from the root config when that value is `"3p"`. A file that does not parse is left alone. Last, it renames the backup to `` `${CLAUDE_APP_GATEWAY_BACKUP_FILE}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}` ``, the pattern `readStateJson` uses at `profiles/service.ts:3958`. The rename lets the next takeover write a fresh backup.

- [ ] **Step 1: Create the branch and write the failing tests**

```bash
git switch -c fix/atomic-user-file-writes
```

Add `applyClaudeAppGatewayConfig` to what `loadModules` returns. `paths` below is `claudeAppPaths()`, the file's existing helper. Add `readdirSync` to the `node:fs` import. `takeover` below is `createConfig({ profile: { profiles: [claudeCodeProfile({ claudeAppTakeover: true })] } })`, and `read` parses a JSON file. Each test ends with `cleanup(BACKUP_FILE)` in `finally`.

```js
test("sync skips and leaves an unparseable claude_desktop_config.json unchanged", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  mkdirSync(path.dirname(paths.rootConfigFile), { recursive: true });
  writeFileSync(paths.rootConfigFile, "{ not json");
  const synced = await syncClaudeAppGatewayConfig(takeover);
  assert.equal(readFileSync(paths.rootConfigFile, "utf8"), "{ not json");
  assert.match(synced.result.message, /could not be parsed; LLMR left it unchanged\.$/);
  assert.equal(synced.result.requiresRestart, false);
  assert.equal(synced.configChanged, false);
  assert.equal(existsSync(paths.configLibraryFile), false);
  assert.equal(existsSync(BACKUP_FILE), false);
  assert.equal(warn.mock.callCount(), 1);
});

test("an explicit apply throws on an unparseable claude_desktop_config.json", async () => {
  writeFileSync(paths.rootConfigFile, "{ not json");   // after mkdirSync
  assert.throws(() => applyClaudeAppGatewayConfig(takeover), /could not be parsed; LLMR left it unchanged\.$/);
});

test("apply treats an empty claude_desktop_config.json as missing", async () => {
  writeFileSync(paths.rootConfigFile, "");             // after mkdirSync
  await syncClaudeAppGatewayConfig(takeover);
  assert.deepEqual(read(paths.rootConfigFile), { deploymentMode: "3p" });
});

test("restore with a corrupt backup removes LLMR's takeover keys and keeps the backup bytes", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  writeJsonFile(paths.rootConfigFile, { deploymentMode: "3p", preference: true });
  writeJsonFile(paths.metaFile, { appliedId: "8f69f2f1-3275-4ad8-9317-4aa7e972f311", entries: [] });
  mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
  writeFileSync(BACKUP_FILE, "{ truncated");
  await syncClaudeAppGatewayConfig(createConfig());
  assert.deepEqual(read(paths.rootConfigFile), { preference: true });
  assert.deepEqual(read(paths.metaFile), { entries: [] });
  assert.equal(existsSync(BACKUP_FILE), false);
  const kept = readdirSync(path.dirname(BACKUP_FILE)).filter((name) => name.startsWith("claude-app-gateway-backup.json.corrupt-"));
  assert.equal(kept.length, 1);
  assert.equal(readFileSync(path.join(path.dirname(BACKUP_FILE), kept[0]), "utf8"), "{ truncated");
  assert.equal(warn.mock.callCount(), 1);
});

test("restore with a corrupt backup leaves a user's own 3p mode alone", async (t) => {
  t.mock.method(console, "warn", () => {});
  writeJsonFile(paths.rootConfigFile, { deploymentMode: "3p" });
  writeJsonFile(paths.metaFile, { appliedId: "someone-else" });
  writeFileSync(BACKUP_FILE, "{ truncated");           // after mkdirSync
  await syncClaudeAppGatewayConfig(createConfig());
  assert.deepEqual(read(paths.rootConfigFile), { deploymentMode: "3p" });
  assert.deepEqual(read(paths.metaFile), { appliedId: "someone-else" });
});
```

Each test that creates a `.corrupt-` file removes it in its own `finally`, so no test depends on another's cleanup.

- [ ] **Step 2: Run the tests and see them fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-app-gateway-sync.test.js`
Expected: the first test fails because the root config now reads `{"deploymentMode":"3p"}`. The second fails with "Missing expected exception". The fourth fails because `deploymentMode` is still `"3p"`. The third and fifth pass already.

- [ ] **Step 3: Implement the four behaviours above**

- [ ] **Step 4: Run the tests and see them pass**

Expected: PASS for the whole file, including both `#1768` tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/claude-app/gateway-service.ts packages/core/test/unit/agents/claude-app-gateway-sync.test.mjs
git commit -m "fix(claude-app): write the takeover config atomically and refuse to overwrite a broken one"
```

### Task 2: Grok auth file

**Files:**
- Modify: `packages/core/src/agents/local-providers/grok.ts` (`resolveGrokAuth` `:265`, `refreshGrokAuth` `:673`, `persistRefreshedGrokAuth` `:851`, the module state near `:50`)
- Test: `packages/core/test/unit/agents/local-agent-provider-grok.test.mjs`

**Interfaces:**
- Produces, module-private: `const grokUnsavedRefreshes = new Map<string, GrokTokenSet>();` keyed like `grokRefreshInFlight`, `` `${auth.sourceFile}::${auth.authRecordKey ?? ""}` ``.

Behaviour, following `resolveClaudeAppsGatewaySession` in `agents/claude-apps-gateway/session-store.ts:136-152`.

- `persistRefreshedGrokAuth` loses its `try`/`catch`. It throws when the file cannot be read, is not a JSON object, or cannot be written. It writes with `writeFileAtomic(auth.sourceFile, content)` and no `mode`, which keeps the file's mode.
- `refreshGrokAuth` wraps the `persistRefreshedGrokAuth(refreshed)` call. On success it deletes the map entry. On failure it stores `refreshed` in the map and warns with `` `[grok] Could not save the refreshed credential to ${auth.sourceFile}: ${message}` ``. It returns `refreshed` either way.
- `resolveGrokAuth` reads the disk copy with `readGrokAuth()`, then looks up the map entry for that copy's key. It uses the entry when the entry's `expiresAt` is later than the disk copy's expiry. The disk copy's expiry is `dateMs(disk.expiresAt) ?? jwtExpiresAtMs(disk.accessToken) ?? 0`. Otherwise it uses the disk copy and deletes the entry. The rest of the function is unchanged.

- [ ] **Step 1: Write the failing tests**

Both tests skip when `process.platform === "win32"` or `process.getuid?.() === 0`, because file modes do not stop those writes. Add `chmodSync` to the test file's `node:fs` import. `lockGrokHome(grokHome)` is a new helper that runs `chmodSync(path.join(grokHome, "auth.json"), 0o400)` and `chmodSync(grokHome, 0o500)`. The file mode makes today's in-place write fail. The directory mode makes the atomic write fail. `unlockGrokHome` sets them back to `0o600` and `0o700`. Both run inside `withGrokHome` and set `GROK_OIDC_TOKEN_ENDPOINT` to `"http://127.0.0.1/grok/oauth/token"`. Each wraps its body in `try { … } finally { unlockGrokHome(grokHome); }` inside the `withGrokHome` callback, because `withGrokHome` runs `rmSync(grokHome, { force: true, recursive: true })` in its own `finally`, before `t.after` runs, and that `rmSync` fails with `EACCES` on a `0o500` directory. Restore `globalThis.fetch` in `t.after`. The stub replies `{ access_token: "refreshed-grok-access-token", expires_in: 3600, refresh_token: "rotated-1" }` and counts calls. The seed is the one the test at `:81` uses, with `expires_at: "2000-01-01T00:00:00Z"`.

```js
test("Grok keeps a rotated refresh token in memory when auth.json cannot be saved", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  lockGrokHome(grokHome);
  const first = await resolveGrokAuth();
  const second = await resolveGrokAuth();
  assert.equal(fetchCalls, 1);
  assert.equal(first.accessToken, "refreshed-grok-access-token");
  assert.equal(second.accessToken, "refreshed-grok-access-token");
  assert.equal(second.refreshToken, "rotated-1");
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(JSON.parse(readFileSync(path.join(grokHome, "auth.json"), "utf8"))["https://auth.x.ai::test-account"].refresh_token, "grok-refresh-token");
});

test("a newer Grok credential on disk wins over the unsaved one", async (t) => {
  t.mock.method(console, "warn", () => {});
  lockGrokHome(grokHome);
  await resolveGrokAuth();
  unlockGrokHome(grokHome);
  writeGrokAuth(grokHome, { key: "peer-token", refresh_token: "peer-refresh", expires_at: "2999-01-01T00:00:00Z", oidc_client_id: "grok-client-id", oidc_issuer: "https://auth.x.ai" });
  const auth = await resolveGrokAuth();
  assert.equal(auth.accessToken, "peer-token");
  assert.equal(fetchCalls, 1);
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/local-agent-provider-grok.test.js`
Expected: the first test fails with `fetchCalls` 2 and no warning. Today the failed save is swallowed, so the second resolve reads the spent token from disk and refreshes again. The second passes already and pins the Review Focus case.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and see them pass**

Expected: PASS for the whole file. "Grok local provider refreshes expired token during import" still finds the refreshed values in `auth.json`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/local-providers/grok.ts packages/core/test/unit/agents/local-agent-provider-grok.test.mjs
git commit -m "fix(grok): save the refreshed credential atomically and keep it when the save fails"
```

### Task 3: Shell rc files

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts:24` (import), `:1927-1932` (`writeFileIfChanged`), `:2046-2063` (`ensurePathBlock`)
- Test: `packages/core/test/unit/profiles/shell-rc-path-block.test.mjs`

**Interfaces:**
- No signature changes.

Behaviour.

- `writeFileIfChanged` calls `writeFileAtomic(file, content)` in place of `writeFileSync`. Add `writeFileAtomic` to the existing import from `@llmr/core/profiles/backup-files`. Its six other callers (`:134`, `:1692`, `:1709`, `:1726`, `:1746`, `:1811`) write LLMR's own scripts and gain the same safety.
- In `ensurePathBlock`, delete `.replace(/^\n+/, "")`. Both `source.replace(managedPattern, …)` calls take a function replacer, `(_match, offset: number) => offset === 0 ? replacement.replace(/^\n/, "") : replacement`. `managedPathBlockPattern` matches an optional newline before the block, and both replacements start with `\n`. Only a block at offset 0 gains a leading newline that was not there, so only that one is dropped.

- [ ] **Step 1: Write the failing tests**

Add `lstatSync`, `readdirSync` and `symlinkSync` to the test file's `node:fs` import.

```js
const legacyBlock = "# >>> Claude Code Router CLI >>>\nexport PATH=\"old:$PATH\"\n# <<< Claude Code Router CLI <<<\n";

test("an rc file's own leading blank lines survive", async () => {
  const { ensureShellRcPathBlock } = await import("@llmr/core/profiles/launch-service.ts");
  const rc = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-rc-")), ".zshrc");
  writeFileSync(rc, `\n\nexport A=1\n${legacyBlock}`);
  ensureShellRcPathBlock(rc, "/opt/llm-router/bin");
  assert.ok(readFileSync(rc, "utf8").startsWith("\n\nexport A=1\n# >>> LLM Router CLI >>>\n"));
});

test("a managed block at the top of an rc file gains no leading blank line", async () => {
  const { ensureShellRcPathBlock } = await import("@llmr/core/profiles/launch-service.ts");
  const rc = path.join(mkdtempSync(path.join(os.tmpdir(), "llmr-rc-")), ".zshrc");
  writeFileSync(rc, `${legacyBlock}export A=1\n`);
  ensureShellRcPathBlock(rc, "/opt/llm-router/bin");
  const text = readFileSync(rc, "utf8");
  assert.ok(text.startsWith("# >>> LLM Router CLI >>>\n"));
  assert.match(text, /^export A=1$/m);
});

test("a symlinked rc file stays a symlink", { skip: process.platform === "win32" }, async () => {
  const { ensureShellRcPathBlock } = await import("@llmr/core/profiles/launch-service.ts");
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-rc-"));
  const real = path.join(dir, "dotfiles-zshrc");
  const rc = path.join(dir, ".zshrc");
  writeFileSync(real, "export A=1\n");
  symlinkSync(real, rc);
  ensureShellRcPathBlock(rc, "/opt/llm-router/bin");
  assert.equal(lstatSync(rc).isSymbolicLink(), true);
  assert.match(readFileSync(real, "utf8"), /# >>> LLM Router CLI >>>/);
  assert.deepEqual(readdirSync(dir).sort(), [".zshrc", "dotfiles-zshrc"]);
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/shell-rc-path-block.test.js`
Expected: the first test fails, because the file now starts with `export A=1`. The second and third pass already. The third pins that the atomic write follows the link and leaves no temp file.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and see them pass**

Expected: PASS for the whole file, including the three existing tests.

- [ ] **Step 5: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
npm run test:cli
```

Expected: all exit 0. `test:cli` runs because `packages/cli/src/cli.ts` calls `applyClaudeAppGatewayConfig`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/profiles/launch-service.ts packages/core/test/unit/profiles/shell-rc-path-block.test.mjs
git commit -m "fix(profiles): write shell rc files atomically and keep their leading blank lines"
```

---

## CG-4 Small gateway guards

**Fixes:** F-C7, F-C8, F-C10
**Depends on:** CG-1, CG-2 (for `redactSensitiveUrlQuery`)
**Branch:** `fix/gateway-small-guards`
**Size:** S
**Owner steps:** None

### Task 1: Delete refresh-on-miss in the API key authorizer

**Files:**
- Modify: `packages/core/src/gateway/auth/api-key-authorizer.ts` (`ConfiguredApiKeyOptions` `:15-18`, `authorize` `:37-40`, `resolveApiKeyFromHeaders` `:65-68`, `exchangeClaudeCodeWifToken` `:99-102`, `loadPersistedApiKeysCached` `:226`)
- Test: `packages/core/test/unit/gateway/api-key-authorizer.test.mjs`

**Interfaces:**
- Changes: `ConfiguredApiKeyOptions` becomes `{ includePersisted?: boolean }`. `loadPersistedApiKeysCached(): Promise<ApiKeyConfig[]>` takes no argument. No caller outside this file passes `refresh`.

Behaviour. Delete the three "look again with `refresh: true`" branches, so `apiKeys` in each function becomes a `const`. The 1,000 ms cache (`persistedApiKeyCacheTtlMs`) already bounds how stale the list can be.

- [ ] **Step 1: Create the branch and write the failing tests**

```bash
git switch -c fix/gateway-small-guards
```

```js
test("invalid tokens load persisted keys at most once per cache window", async (t) => {
  const { configRepository } = await import("@llmr/core/config/config-repository.ts");
  let loads = 0;
  t.mock.method(configRepository, "listApiKeys", async () => {
    loads += 1;
    return [];
  });
  const config = configWithApiKeys([{ createdAt: new Date(0).toISOString(), id: "k1", key: "sk-right" }]);
  for (let i = 0; i < 10; i++) {
    const { response } = await authorizeRequest(config, { headers: { authorization: `Bearer sk-wrong-${i}` } });
    assert.equal(response.statusCode, 401);
  }
  assert.ok(loads <= 1, `listApiKeys ran ${loads} times`);
});

test("a key persisted after a miss is accepted once the cache expires", async (t) => {
  const { configRepository } = await import("@llmr/core/config/config-repository.ts");
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 5000 });
  const persisted = [];
  t.mock.method(configRepository, "listApiKeys", async () => [...persisted]);
  const config = configWithApiKeys([{ createdAt: new Date(0).toISOString(), id: "k1", key: "sk-other" }]);
  const request = { headers: { authorization: "Bearer sk-new" } };
  assert.equal((await authorizeRequest(config, request)).response.statusCode, 401);
  persisted.push({ createdAt: new Date(0).toISOString(), id: "k2", key: "sk-new" });
  t.mock.timers.tick(1001);
  assert.equal((await authorizeRequest(config, request)).result.ok, true);
});
```

`configWithApiKeys` and `authorizeRequest` are the file's existing helpers (`:19-23`, `:39-43`). Append both tests at the end of the file, in this order. The second mocks `Date` 5 s ahead, which leaves the persisted-key cache stamped in the future, so the cache looks fresh to any test that runs after it.

- [ ] **Step 2: Run the tests and see them fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/api-key-authorizer.test.js`
Expected: the first test fails with "listApiKeys ran 10 times", or 11 when the persisted-key cache was cold at the first call. The second passes already and pins the Review Focus case.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and see them pass**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/gateway/auth/api-key-authorizer.ts packages/core/test/unit/gateway/api-key-authorizer.test.mjs
git commit -m "fix(gateway): stop reloading persisted keys on every invalid token"
```

### Task 2: Bound device-login `interval` and `timeoutMs`

**Files:**
- Modify: `packages/core/src/agents/claude-apps-gateway/device-login-service.ts:73` (`startClaudeAppsGatewayLogin`), `:99` (`waitClaudeAppsGatewayLogin`)
- Test: `packages/core/test/unit/agents/claude-apps-gateway-device-login.test.mjs`

**Interfaces:**
- Produces: `export function normalizeLoginWaitTimeoutMs(value: unknown): number`. It returns `defaultWaitTimeoutMs` (20,000) unless `value` is a finite number, and otherwise clamps the number to 0 through 120,000.

Behaviour. In `startClaudeAppsGatewayLogin`, `const intervalSeconds = Math.max(1, nonNegativeNumber(device.payload?.interval) ?? 5);`. The pending login and the returned `intervalSeconds` both use the floored value. In `waitClaudeAppsGatewayLogin`, the deadline is `Date.now() + normalizeLoginWaitTimeoutMs(request.timeoutMs)`. The RPC entry at `web/management-server.ts:500` casts its input, so a string can arrive here.

- [ ] **Step 1: Write the failing tests and update the two existing ones**

- In "start returns the device code prompt" (`:34`), `assert.equal(start.intervalSeconds, 0)` becomes `assert.equal(start.intervalSeconds, 1)`.
- "wait polls through pending and slow_down, then persists the session" (`:59`) now waits about 7 s (one 1 s interval, then 1 s plus the 5 s slow-down step). Raise its `{ timeout: 10_000 }` to `{ timeout: 15_000 }`.

```js
test("an interval of 0 polls at most once per second", async (t) => {
  const gateway = await fakeGateway(t, { token: () => [400, { error: "authorization_pending" }] });
  const start = await startClaudeAppsGatewayLogin({ gatewayUrl: gateway.url }, { configDir: tempConfigDir(t) });
  t.after(() => cancelClaudeAppsGatewayLogin({ sessionId: start.sessionId }));
  const result = await waitClaudeAppsGatewayLogin({ sessionId: start.sessionId, timeoutMs: 1500 });
  assert.equal(result.status, "pending");
  const polls = gateway.requests.filter((request) => request.url === "/oauth/token").length;
  assert.ok(polls <= 2, `polled ${polls} times in 1.5 s`);
});

test("normalizeLoginWaitTimeoutMs bounds what the RPC caller sends", () => {
  assert.equal(normalizeLoginWaitTimeoutMs("abc"), 20_000);
  assert.equal(normalizeLoginWaitTimeoutMs(Number.NaN), 20_000);
  assert.equal(normalizeLoginWaitTimeoutMs(undefined), 20_000);
  assert.equal(normalizeLoginWaitTimeoutMs(-5), 0);
  assert.equal(normalizeLoginWaitTimeoutMs(300), 300);
  assert.equal(normalizeLoginWaitTimeoutMs(999_999), 120_000);
});
```

`fakeGateway` serves `interval: 0` unless told otherwise (`:182`).

- [ ] **Step 2: Run the tests and see them fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-apps-gateway-device-login.test.js`
Expected: `node build/test.mjs core` exits non-zero before any test runs, with esbuild's `No matching export in "packages/core/src/agents/claude-apps-gateway/device-login-service.ts" for import "normalizeLoginWaitTimeoutMs"`. Add `normalizeLoginWaitTimeoutMs` to the file's import list from `device-login-service.ts`. With a stub export that returns its input, the interval test fails with a poll count in the hundreds and the edited `:34` assertion fails with `0 !== 1`.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and see them pass**

Expected: PASS for the whole file. The file runs several seconds longer than before, because a second poll now waits at least 1 s.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/claude-apps-gateway/device-login-service.ts packages/core/test/unit/agents/claude-apps-gateway-device-login.test.mjs
git commit -m "fix(claude-apps-gateway): floor the device-login interval and bound the wait timeout"
```

### Task 3: Redact request-log URLs

**Files:**
- Modify: `packages/core/src/observability/request-log-store.ts:745` (the `input.url` argument of `statement.run` in `RequestLogStore.record`, `:578`)
- Test: `packages/core/test/integration/observability/request-log-store.test.mjs`

**Interfaces:**
- Consumes: `redactSensitiveUrlQuery(url: string): string` from `@llmr/core/observability/sensitive-headers` (CG-2 Task 1).

Behaviour. `RequestLogStore.record` is the one insert that the gateway pipeline (`gateway/request/pipeline.ts:309`), the provider probe (`providers/probe.ts:301`) and standalone raw traces all reach. Pass `redactSensitiveUrlQuery(input.url)` to the insert. Leave the `inferRequestLogIsStream` call above it on the raw value. The raw-trace update path (`:883`) gets a URL that `raw-trace-sync.ts` has already redacted.

The research placed this change at `:1701`. That line is in `standaloneRecordInputFromRawTrace` and covers raw traces only. `:745` is the shared point.

- [ ] **Step 1: Write the failing test**

Model it on "RequestLogStore keeps list rows lightweight and detail rows complete" (`:267`), with the same `store.record` fields and these two changed:

```js
test("RequestLogStore stores credential query parameters redacted", async () => {
  // path: "/v1beta/models/gemini-2.5-pro:generateContent",
  // url: "http://127.0.0.1:3456/v1beta/models/gemini-2.5-pro:generateContent?key=AIzaSECRET&alt=sse"
  const page = await store.list({ pageSize: 25 });
  const detail = await store.getDetail({ id: page.items[0].id });
  assert.equal(detail.url, "http://127.0.0.1:3456/v1beta/models/gemini-2.5-pro:generateContent?key=%5Bredacted%5D&alt=sse");
  assert.doesNotMatch(JSON.stringify(page.items[0]), /AIzaSECRET/);
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/observability/request-log-store.test.js`
Expected: FAIL, `detail.url` still holds `key=AIzaSECRET`.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the test and see it pass**

- [ ] **Step 5: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: all exit 0. `test:core` includes `gateway-service-architecture.test.mjs`, which the gateway rule requires after a change under `gateway/`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/observability/request-log-store.ts packages/core/test/integration/observability/request-log-store.test.mjs
git commit -m "fix(observability): redact credential query parameters in request-log URLs"
```

---

## CG-5 Reconnect a dropped SSE MCP stream

**Fixes:** F-C4
**Depends on:** CG-1
**Branch:** `fix/mcp-sse-reconnect`
**Size:** S
**Owner steps:** None

### Task 1: Reset the SSE client when its stream ends

**Files:**
- Modify: `packages/core/src/mcp/toolhub-mcp.ts:989-1038` (`SseMcpClient.openStream`)
- Test: `packages/core/test/integration/mcp/toolhub-mcp-runtime.test.mjs`

**Interfaces:**
- Produces: a closure inside `openStream`, `const resetStream = (error: Error): void`.

Behaviour. `resetStream` calls `clearTimeout(timeout)` and `rejectEndpoint(error)`. Then, only when `this.streamAbort === controller`, it sets `endpointUrl` to `""`, `initialized` to `false`, `streamAbort` to `undefined` and `streamBuffer` to `""`, and calls `this.rejectAll(error)`. The read loop calls it after `done` with `` new Error(`MCP SSE stream closed (${this.server.name}).`) `` and in `catch` with `toError(error)`. The guard matters because `close()` already clears the state and rejects the pending calls, and a late callback from an old stream must not reject the calls of a newer one. The next `listTools` or `callTool` then runs `ensureInitialized`, which opens a new stream and sends `initialize` again. A stream that ends before its `endpoint` event now rejects at once instead of waiting out the startup timeout.

- [ ] **Step 1: Create the branch and write the failing test**

```bash
git switch -c fix/mcp-sse-reconnect
```

Add a fake, `createMcpSseServer()`, beside `createMcpHttpServer` (`:722`). It returns `{ server, state }` with `state = { gets: 0, streams: [] }`.

- `GET /sse` increments `state.gets`, replies `content-type: text/event-stream`, writes `` `event: endpoint\ndata: /messages?session=${state.gets}\n\n` `` and pushes the response onto `state.streams`.
- `POST /messages?session=N` replies 202 with an empty body. If stream N is still open, it writes the JSON-RPC reply on it as `` `event: message\ndata: ${JSON.stringify(reply)}\n\n` ``. `initialize` gets the same result `createMcpHttpServer` sends. `tools/list` gets one tool, `{ description: "Echo the input back.", inputSchema: { type: "object" }, name: "echo" }`. `tools/call` gets `{ content: [{ text: "ok", type: "text" }] }`. `notifications/initialized` gets no reply.
- After the first `tools/call` reply, the fake ends that stream with `response.end()`.

The test follows "built ToolHub MCP runtime keeps resolve cache scoped by task" (`:542`) for the spawn, the skip guards and the reader. Its backend entry in `TOOLHUB_MCP_SERVERS_JSON` is `` { name: "sse-mcp", requestTimeoutMs: 2000, transport: "sse", url: `http://127.0.0.1:${port}/sse` } ``. Its resolver is `createFixedResolverServer(["mcp.sse_mcp.echo"])`. It sends `initialize` (id 1), `tool_hub.resolve` with `{ task: "echo something" }` (id 2), then two `tool_hub.invoke` calls with `{ tool: "mcp.sse_mcp.echo", args: {} }` (ids 3 and 4). Between ids 3 and 4 it waits for the first stream's `close` event and then 200 ms, so the runtime has seen the stream end.

```js
test("an SSE backend that drops its stream is reconnected on the next call", async (t) => {
  assert.equal(first.error, undefined);
  assert.equal(first.result.content[0].text, "ok");
  assert.equal(second.error, undefined, JSON.stringify(second.error));
  assert.equal(second.result.content[0].text, "ok");
  assert.equal(state.gets, 2);
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/mcp/toolhub-mcp-runtime.test.js`
Expected: FAIL on `second.error`, with the message "MCP SSE request timed out (sse-mcp): tools/call". `node build/test.mjs core` builds `.test-dist/core/runtime/toolhub-mcp.js`, the file the test spawns.

- [ ] **Step 3: Implement `resetStream` and call it on `done` and in `catch`**

- [ ] **Step 4: Run the test and see it pass**

- [ ] **Step 5: Check the lightweight MCP bundle rules**

Run: `npm run build:assets`
Expected: exit 0. `validateLightweightMcpBundles` in `build/esbuild.config.mjs` runs only here and checks the size cap and the forbidden imports. Then restore the generated files the build may have rewritten:

```bash
git checkout -- packages/core/models.json packages/ui/src/generated
```

- [ ] **Step 6: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/mcp/toolhub-mcp.ts packages/core/test/integration/mcp/toolhub-mcp-runtime.test.mjs
git commit -m "fix(mcp): reconnect an SSE backend after its stream drops"
```

---

## CG-6 Require marketplace module integrity

**Fixes:** F-C6
**Depends on:** CG-1
**Branch:** `fix/marketplace-module-integrity`
**Size:** M
**Owner steps:** None

**Status:** Merged 2026-11-17 as [PR 96](https://github.com/jrmatherly/llm-router/pull/96), squash commit `c9be0cc4`. The review changed these points:

- A `sha256-<base64>` integrity that does not decode to 32 bytes is invalid, so the entry is skipped before any download. It used to be accepted and shown as a failed check.
- The warnings name the entry. The mismatch message carries the computed hash and the byte count. A cached file that fails its hash is logged before it is downloaded again.
- `missingPluginDependenciesMessage` in `packages/ui/src/pages/home/shared/extensions.ts` marks a missing dependency that failed its integrity check.
- The docs say an entry is also skipped when a dependency has a `module` without an integrity. The parent's own verified module is still downloaded before that skip.

The live catalog was `{"plugins": []}` on 2026-11-17, so no entry disappeared. The dialog was not opened in the running app. Left as planned: the entry button uses native `disabled`, and the error string stays "Integrity check failed" when the failure is in a dependency. Not in scope: a plugin's cached module is not hashed again when it is loaded, only when the marketplace is listed.

### Task 1: Core

**Files:**
- Modify: `packages/core/src/plugins/marketplace.ts` (`normalizeMarketplaceEntry` `:126`, `cachedMarketplaceModulePath` `:228`, `fetchText` `:267`, `verifySha256` `:603`, `hashString` `:632`)
- Modify: `packages/core/src/contracts/app.ts:1223` (`PluginMarketplaceEntry`)
- Modify: `packages/core/src/profiles/backup-files.ts:76` (`writeFileAtomic`, the type of `content`)
- Test: `packages/core/test/unit/plugins/marketplace-manifest.test.mjs`

**Interfaces:**
- Produces: `error?: string` on `PluginMarketplaceEntry`. The only value is `"Integrity check failed"`. An entry with `error` has `modulePath: ""`.
- Produces, module-private in `marketplace.ts`: `class MarketplaceIntegrityError extends Error`, `fetchBytes(url: string, maxBytes: number): Promise<Buffer>`, and `verifySha256(source: Buffer, expectedHex: string, label: string): void`, which throws `MarketplaceIntegrityError`.
- Changes: `writeFileAtomic(file: string, content: string | Uint8Array, options?: { mode?: number }): void`. Only the parameter type widens. `writeFileSync` already accepts both.

Behaviour of `cachedMarketplaceModulePath`.

1. The HTTPS and extension checks stay.
2. When `normalizeSha256Integrity(integrity)` returns nothing, throw `` new Error(`Marketplace module must declare a sha256 integrity: ${moduleUrl}`) ``. This is a plain `Error`, so the entry is skipped and logged, as an entry with a bad URL is today.
3. The cache file is `` `${sanitizeFileSegment(id)}-${expectedSha256.slice(0, 24)}${extension}` ``. Delete `hashString`, which has no other caller.
4. When the file exists and `sha256(readFileSync(file))` over the raw bytes equals the expected hash, return it.
5. When the file exists and its hash differs, throw `MarketplaceIntegrityError` if `options.offline`. Otherwise continue to the download.
6. When the file is missing and `options.offline`, warn and return `undefined`, as today.
7. Download with `fetchBytes`, verify the bytes, call `ensureMarketplaceCacheDir()`, and write the bytes with `writeFileAtomic(file, bytes)`. A download that fails its hash throws `MarketplaceIntegrityError` and writes nothing.

`fetchBytes` is today's `fetchText` with `Buffer.from(await response.arrayBuffer())` and the size checks on `length`. `fetchText` becomes `new TextDecoder().decode(await fetchBytes(url, maxBytes))`, which strips a BOM as `response.text()` does, so manifest parsing does not change.

In `normalizeMarketplaceEntry`, one `try` wraps the `cachedMarketplaceModulePath` call and the `parsePluginDependencies` call. On `MarketplaceIntegrityError` it warns with the error message and returns the entry it would have returned, with `modulePath: ""`, `dependencies: []` and `error: "Integrity check failed"`. Any other error propagates to the `catch` in `normalizeMarketplaceManifest`, which skips the entry.

- [ ] **Step 1: Create the branch and write the failing tests**

```bash
git switch -c fix/marketplace-module-integrity
```

Each test stubs `globalThis.fetch` with a function that returns a new `Response` on every call, counts the calls, and restores it in `t.after`. `sha256` is `(bytes) => createHash("sha256").update(bytes).digest("hex")`. `bom` is `Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("module.exports = {};\n")])`. Each test uses its own plugin `id`, so cache files do not collide.

```js
test("a module entry without integrity is skipped and never downloaded", async (t) => {
  // fetch stub returns new Response("module.exports = {};")
  const entries = await normalizeMarketplaceManifest({ plugins: [{ id: "no-integrity", module: "https://e.test/x.js" }] }, manifestUrl);
  assert.deepEqual(entries, []);
  assert.equal(fetchCalls, 0);
});

test("an app-only entry needs no integrity", async () => {
  const entries = await normalizeMarketplaceManifest({ plugins: [{ apps: [{ name: "Status", url: "/plugins/status" }], id: "app-only", name: "App only" }] }, manifestUrl, { offline: true });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].error, undefined);
  assert.equal(entries[0].modulePath, "");
});

test("module bytes are hashed raw and cached unchanged", async (t) => {
  // fetch stub returns new Response(bom)
  const entries = await normalizeMarketplaceManifest({ plugins: [{ id: "raw-bytes", integrity: sha256(bom), module: "https://e.test/raw.js" }] }, manifestUrl);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].error, undefined);
  assert.deepEqual(readFileSync(entries[0].modulePath), bom);
});

test("a cached module that fails its hash is downloaded again", async (t) => {
  const manifest = { plugins: [{ id: "redownload", integrity: sha256(bom), module: "https://e.test/re.js" }] };
  const [first] = await normalizeMarketplaceManifest(manifest, manifestUrl);
  writeFileSync(first.modulePath, "truncated");
  const [second] = await normalizeMarketplaceManifest(manifest, manifestUrl);
  assert.equal(second.error, undefined);
  assert.deepEqual(readFileSync(second.modulePath), bom);
  assert.equal(fetchCalls, 2);
});

test("offline, a cached module that fails its hash is listed with an integrity error", async (t) => {
  const manifest = { plugins: [{ id: "offline-bad", integrity: sha256(bom), module: "https://e.test/off.js", name: "Offline bad" }] };
  const [first] = await normalizeMarketplaceManifest(manifest, manifestUrl);
  writeFileSync(first.modulePath, "truncated");
  const entries = await normalizeMarketplaceManifest(manifest, manifestUrl, { offline: true });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "Offline bad");
  assert.equal(entries[0].error, "Integrity check failed");
  assert.equal(entries[0].modulePath, "");
});

test("a download that fails its hash is listed with an integrity error and not cached", async (t) => {
  // fetch stub returns new Response("something else")
  const entries = await normalizeMarketplaceManifest({ plugins: [{ id: "bad-download", integrity: sha256(bom), module: "https://e.test/bad.js" }] }, manifestUrl);
  assert.equal(entries[0].error, "Integrity check failed");
  assert.equal(entries[0].modulePath, "");
  const again = await normalizeMarketplaceManifest({ plugins: [{ id: "bad-download", integrity: sha256(bom), module: "https://e.test/bad.js" }] }, manifestUrl, { offline: true });
  assert.deepEqual(again, []);
});
```

The last assertion holds because nothing was cached, so the offline pass finds no file and skips the entry.

- [ ] **Step 2: Run the tests and see them fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/plugins/marketplace-manifest.test.js`
Expected: the first test fails with one entry and `fetchCalls` 1. The third fails with `[]`, which settles the unverified claim that `response.text()` strips the BOM before hashing. The fourth, fifth and sixth fail. The second passes already.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and see them pass**

Expected: PASS, including "committed marketplace manifest normalizes without error". Its fixture has `"plugins": []`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plugins/marketplace.ts packages/core/src/contracts/app.ts packages/core/src/profiles/backup-files.ts packages/core/test/unit/plugins/marketplace-manifest.test.mjs
git commit -m "fix(plugins): require a sha256 integrity for marketplace modules and verify raw bytes"
```

### Task 2: UI, docs and schema

**Files:**
- Modify: `packages/ui/src/pages/home/components/virtual-models.tsx:1291-1385` (`InstallExtensionDialog`, the `marketplace.map` button and `selectMarketplace`)
- Modify: `packages/ui/src/pages/home/shared/extensions.ts:460-485` (`pluginDependencyCandidate`)
- Modify: `docs/src/content/docs/en/configuration/extensions.md:313-328`
- Modify: `docs/public/schemas/plugin-marketplace.schema.json` (`$defs.dependency`, `$defs.plugin`)
- Test: `packages/ui/test/component/layout.test.tsx`, `packages/ui/test/component/extensions.test.ts`

**Interfaces:**
- Consumes: `PluginMarketplaceEntry.error?: string` from Task 1.

The marketplace list is rendered by `InstallExtensionDialog` in `virtual-models.tsx`. `components/extensions.tsx` has no marketplace code.

Behaviour.

- The entry button gets `disabled={Boolean(entry.error)}` and, when `entry.error` is set, the classes `cursor-not-allowed opacity-60` in place of the hover class. Under the description it renders `<span className="text-[11px] text-destructive">{entry.error}</span>`. A disabled button cannot be selected, so the draft never takes the entry and Install stays disabled.
- `selectMarketplace` returns early when `entry.error` is set.
- `pluginDependencyCandidate` treats an entry with `error` as absent. `if (!entry)` becomes `if (!entry || entry.error)`. `resolvePluginInstallPlan` then reports it under `missing`, and the install stops with the existing "Missing plugin dependencies" message. Without this, an errored entry has `modulePath: ""` and would install as an app-only plugin with no module.

- [ ] **Step 1: Write the failing tests**

In `layout.test.tsx`, which already imports from `virtual-models.tsx`, add `InstallExtensionDialog` to that import. Also add `import type { PluginMarketplaceEntry } from "@llmr/core/contracts/app.ts";`. esbuild ignores a missing type import, but TL-2 type-checks this file and would report TS2304.

```tsx
test("InstallExtensionDialog shows a failed integrity check and disables that entry", () => {
  const entry = { capabilities: [], dependencies: [], description: "Usage connector", id: "bad", modulePath: "", name: "Bad plugin" };
  const draft = { dependencies: [], key: "", marketplaceId: "", modulePath: "", selectedName: "" };
  const render = (marketplace: PluginMarketplaceEntry[]) => renderToStaticMarkup(
    <InstallExtensionDialog canSubmit={false} draft={draft} error="" marketplace={marketplace} onChange={() => undefined} onChooseLocal={() => undefined} onClose={() => undefined} onSubmit={() => undefined} />
  );
  const failed = render([{ ...entry, error: "Integrity check failed" }]);
  assert.match(failed, /Integrity check failed/);
  assert.match(failed, /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Bad plugin/s);
  const healthy = render([{ ...entry, modulePath: "/tmp/bad.cjs" }]);
  assert.doesNotMatch(healthy, /Integrity check failed/);
  assert.doesNotMatch(healthy, /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Bad plugin/s);
});
```

In `extensions.test.ts`:

```ts
test("a marketplace dependency that failed its integrity check blocks the install", () => {
  const marketplace: PluginMarketplaceEntry[] = [{ capabilities: [], dependencies: [], description: "", error: "Integrity check failed", id: "dependency", modulePath: "", name: "Dependency" }];
  const root: PluginInstallCandidate = { dependencies: [{ id: "dependency" }], id: "root", modulePath: "/tmp/root.cjs", name: "Root" };
  const plan = resolvePluginInstallPlan(root, marketplace, []);
  assert.deepEqual(plan.missing, ["dependency"]);
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/component/layout.test.js .test-dist/ui/test/component/extensions.test.js`
Expected: the dialog test fails on the first `assert.match`. The plan test fails with `missing` equal to `[]`.

- [ ] **Step 3: Implement the three UI changes**

- [ ] **Step 4: Run the tests and see them pass**

- [ ] **Step 5: Update the docs and the schema**

- `extensions.md:328`. "Prefer an `integrity` field containing the module's actual 64-character hexadecimal SHA-256 or `sha256-<base64>` digest; update it whenever the module changes." becomes "Each entry with a `module` requires an `integrity` field that holds the module's 64-character hexadecimal SHA-256 or `sha256-<base64>` digest. LLMR skips a module entry that has none. Update the digest whenever the module changes. If the downloaded file does not match, the Extensions page lists the entry as "Integrity check failed" and does not let you install it."
- `extensions.md:313-325`, the example catalog. Add `"integrity": "<sha256 of index.cjs>",` after the `"module"` line, so the example passes the new rule.
- `plugin-marketplace.schema.json`. Add `"dependentRequired": { "module": ["integrity"] }` to both `$defs.dependency` and `$defs.plugin`. The schema declares draft 2020-12, which defines the keyword.

- [ ] **Step 6: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
npm run test:ui
node -e "JSON.parse(require('node:fs').readFileSync('docs/public/schemas/plugin-marketplace.schema.json','utf8'))"
```

Expected: all exit 0. The last command prints nothing when the schema is valid JSON.

- [ ] **Step 7: Commit**

```bash
git add packages/ui docs/src/content/docs/en/configuration/extensions.md docs/public/schemas/plugin-marketplace.schema.json
git commit -m "fix(ui): show a failed marketplace integrity check and block the install"
```

Put this sentence in the PR description and the release notes of the release that ships it: "Marketplace entries without a sha256 `integrity` are now skipped, so a custom catalog set through `LLMR_PLUGIN_MARKETPLACE_URL` must add `integrity` to every module entry."

---

## CG-7 Refresh with the rotated Codex refresh token in the provider probe and account service

**Fixes:** F-C12
**Depends on:** CG-1
**Branch:** `fix/probe-codex-refresh-rotation`
**Size:** S
**Owner steps:** None

What reading the code showed.

- `providerProbeCodexOauthRequest` (`packages/core/src/providers/probe.ts:1243`) assigns `refreshToken = refreshed.refreshToken || refreshToken` at `:1257` and never reads `refreshToken` again. The assignment is dead.
- The rotated token is not kept anywhere else. `refreshCodexProbeAccessToken` (`:1320`) keys `codexProbeOauthCache` by the hash of the token the caller presented. The caller gets that token from `readCodexAuth()`, which only reads `~/.codex/auth.json`, or from the provider plugin's `codexOauth` config (`:923-937`). No code in `packages/core/src` writes a Codex token back, and the gateway runtime bundle contains no `auth.json` string.
- So once the cached access token is within 60 s of expiry, the next probe sends the token it presented the first time. If the endpoint rotates refresh tokens, that token is spent and the refresh fails.

The fix keeps the chain in the cache entry the caller's token already maps to. It is the smallest place where the next refresh can find the rotated token. Writing into `~/.codex/auth.json` would put LLMR in a file the Codex CLI owns, and is out of scope (see Known limits).

### Task 1: Refresh with the rotated token

**Files:**
- Modify: `packages/core/src/providers/probe.ts:1251-1259` (`providerProbeCodexOauthRequest`), `:1320-1354` (`refreshCodexProbeAccessToken`), `:1356-1412` (`refreshCodexProbeAccessTokenUncached`)
- Modify: `packages/core/src/providers/account-service.ts:1911-1975` (`refreshCodexAccountToken`, Steps 4a to 4c)
- Test: `packages/core/test/unit/providers/provider-probe.test.mjs`, `packages/core/test/unit/providers/provider-account-service.test.mjs`

**Interfaces:**
- Changes: `refreshCodexProbeAccessTokenUncached(codexOauth, refreshToken, scope, tokenEndpoint, clientId, now, cacheKey: string)`. It stores its result under `cacheKey` instead of building a key from `refreshToken`.

Behaviour.

- In `refreshCodexProbeAccessToken`, `cacheKey` is still built from the token the caller presented. When the cached entry is fresh, return it, as today. Otherwise call the uncached function with `cached?.refreshToken || refreshToken` and with `cacheKey`. The in-flight map keeps using `cacheKey`.
- In `providerProbeCodexOauthRequest`, delete line 1257 and declare `refreshToken` with `const`.

- [ ] **Step 1: Create the branch and write the failing test**

```bash
git switch -c fix/probe-codex-refresh-rotation
```

Model it on "connectivity probe refreshes Codex OAuth plugin auth" (`:493`). Use port `49177` in every URL so the module-level cache of other tests cannot match. `shortLived(n)` is `jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-rotate" }, exp: Math.floor(Date.now() / 1000) + 30, n, scope: "api.connectors.read api.connectors.invoke" })`. A 30 s lifetime makes the cached entry stale at once, because the cache wants more than 60 s left.

The token endpoint stub records `body.refresh_token` in `refreshTokens`. It accepts `"refresh-rotate-0"` once and replies `{ access_token: shortLived(1), refresh_token: "refresh-rotate-1" }`. It accepts `"refresh-rotate-1"` and replies `{ access_token: shortLived(2), refresh_token: "refresh-rotate-2" }`. Any other token, including a second `"refresh-rotate-0"`, gets status 400 and `{ error: "invalid_grant", error_description: "refresh token reused" }`. `/codex/responses` replies 200 `{ id: "ok" }` for any bearer token.

```js
test("connectivity probe refreshes with the rotated Codex refresh token", async (t) => {
  const probe = () => checkGatewayProviderConnectivity({
    apiKey: "llmr-local-agent-login",
    candidates: [{ baseUrl: "http://127.0.0.1:49177/codex", name: "Codex API", protocols: ["openai_responses"], source: "custom" }],
    forceRefresh: true,
    models: ["gpt-5-codex"],
    providerPlugins: [{
      codexOauth: { refreshToken: "refresh-rotate-0", tokenEndpoint: "http://127.0.0.1:49177/oauth/token" },
      key: "llmr-local-agent-codex-api-codex-oauth",
      providerName: "Codex API"
    }],
    protocols: ["openai_responses"]
  });
  const first = await probe();
  const second = await probe();
  assert.equal(first.failed.length, 0);
  assert.equal(second.failed.length, 0);
  assert.deepEqual(refreshTokens, ["refresh-rotate-0", "refresh-rotate-1"]);
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-probe.test.js`
Expected: FAIL. `second.failed.length` is 1 and `refreshTokens` is `["refresh-rotate-0", "refresh-rotate-0"]`.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the test and see it pass**

Expected: PASS for the whole file, including "connectivity probe shares concurrent Codex OAuth refreshes".

Steps 4a to 4c were added in review on 2026-11-16. `refreshCodexAccountToken` in `account-service.ts` has the same defect: its cache key is the hash of the presented refresh token, and a stale entry is refreshed with the presented token (`:1941`), not with the rotated one the entry holds.

- [ ] **Step 4a: Write the failing account-service test**

In `provider-account-service.test.mjs`, model it on "Codex local account credential refreshes when only a refresh token is available" (`:332`), with the same `LLMR_INTERNAL_HOME_DIR` setup, so no `~/.codex/auth.json` exists. Use `tokenEndpoint: "http://127.0.0.1:49178/oauth/token"` so the module-level `codexOauthCache` of other tests cannot match. The fetch stub records `JSON.parse(init.body).refresh_token` in `refreshTokens`. It accepts `"refresh-acct-0"` once and replies `{ access_token: shortLived(1), refresh_token: "refresh-acct-1" }`, accepts `"refresh-acct-1"` and replies `{ access_token: shortLived(2), refresh_token: "refresh-acct-2" }`, and answers anything else with status 400 and `{ error: "invalid_grant" }`. `shortLived(n)` is the `jwt` helper (`:1003`) with `chatgpt_account_id: "acct-rotate"`, `exp` 30 s from now, `n`, and the scope the `:332` test uses.

```js
test("Codex local account credential refreshes with the rotated refresh token", async (t) => {
  const plugin = {
    codexOauth: { refreshToken: "refresh-acct-0", tokenEndpoint: "http://127.0.0.1:49178/oauth/token" },
    key: "llmr-local-agent-codex-api-codex-oauth",
    providerName: "Codex API"
  };
  const first = await localCodexAccountCredentialForTest(plugin);
  const second = await localCodexAccountCredentialForTest(plugin);
  assert.equal(first.apiKey, shortLived(1));
  assert.equal(second.apiKey, shortLived(2));
  assert.deepEqual(refreshTokens, ["refresh-acct-0", "refresh-acct-1"]);
});
```

Build each `shortLived` token once and reuse it, so the `assert.equal` calls compare the same strings.

- [ ] **Step 4b: Run it and see it fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/providers/provider-account-service.test.js`
Expected: FAIL. The second call rejects with "Codex OAuth token refresh returned HTTP 400", because it sends `"refresh-acct-0"` again and the caller rethrows when it holds no access token.

- [ ] **Step 4c: Refresh with the cached rotated token**

In `refreshCodexAccountToken`, keep `cacheKey` built from the presented token and keep the fresh-entry return. Send `cached?.refreshToken || refreshToken` as `refresh_token`, and use that same value as the fallback in `result.refreshToken`. Run the Step 4b command again. Expected: PASS for the whole file, including the `:332` test, whose request body still carries `"refresh-only"`.

- [ ] **Step 5: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/providers/probe.ts packages/core/src/providers/account-service.ts packages/core/test/unit/providers/provider-probe.test.mjs packages/core/test/unit/providers/provider-account-service.test.mjs
git commit -m "fix(providers): refresh Codex tokens with the rotated refresh token"
```

---

## CG-8 Document retry stacking

**Fixes:** F-C9 (closed as not a defect)
**Depends on:** None
**Branch:** None. Docs-only changes commit straight to `main`.
**Size:** S
**Owner steps:** None

### Task 1: Add the stacking note to the routing docs

**Files:**
- Modify: `docs/src/content/docs/en/configuration/routing.md:486-498` (section "Failure triggers")

- [ ] **Step 1: Add one paragraph**

Insert it after the paragraph that starts "Before moving to the next attempt, LLMR waits for every fallback-triggering failure":

```markdown
Retries stack. In **Retry** mode LLMR resends the request, the core runtime under it retries a failed upstream connection once, and a client SDK retries on its own (the Anthropic and OpenAI SDKs retry twice by default, on the same `408`, `409`, `429` and `5xx` statuses). One client call can therefore reach the provider many times. Keep `Retries` low when the client already retries, or turn the client's retries off. LLMR does not retry a streamed response after its headers arrive.
```

The facts come from the behaviour research of 2026-11-16, which read the SDK sources and `gateway/upstream/executor.ts:497-610`. The retry code does not change.

- [ ] **Step 2: Verify**

Run: `git diff --stat`
Expected: one file, `docs/src/content/docs/en/configuration/routing.md`, with insertions only.

Run: `rg -n "Retries stack" docs/src/content/docs/en/configuration/routing.md`
Expected: one line, inside the "Failure triggers" section.

- [ ] **Step 3: Commit to `main`**

```bash
git add docs/src/content/docs/en/configuration/routing.md
git commit -m "docs: say that gateway, core-runtime and client SDK retries stack"
```

---

## CG-9 Delete the proxy key injection

**Fixes:** F-C1
**Depends on:** CG-2. Both edit `proxy/service.ts`, `proxy-peer.test.mjs` and the "Proxy mode" section of `server.md`.
**Branch:** `fix/proxy-forward-client-credential`
**Size:** S
**Owner steps:** Task 2 Step 2. It needs the proxy CA trusted in the system certificate store and a real LLMR API key with a configured provider. An agent prepares the commands and stops.

**Status:** Merged 2026-11-17 as [PR 94](https://github.com/jrmatherly/llm-router/pull/94), squash commit `b1722142`. The review added one test change: the forwarding test sends `authorization`, `x-api-key`, `api-key` and `x-goog-api-key` and checks each arrives unchanged.

Task 2 Step 2 was run in a different form, at Jason's instruction that the agent run it. Proxy mode does not start without the proxy CA in the macOS System keychain (`getCertificateStatus`), `saveConfig` refuses `proxy.enabled` without it, and no CA exists on this machine, so the requests did not go through the proxy. Instead the built CLI (`llmr serve`) ran in a scratch `HOME` with a fake Anthropic provider, and the three requests went straight to the gateway port with the headers the proxy forwards (`x-llmr-proxy-mode: gateway`, `x-llmr-original-host`). Measured:

| Arrangement | Valid LLMR key | Non-LLMR key | No key |
|---|---|---|---|
| Single runtime (default, the gateway child on the public port) | 200, 1 provider call | 401, 0 calls | 401, 0 calls |
| Host in front of the child (forced with `contextArchive.enabled`; Proxy mode forces the same arrangement through the `proxy` blocker in `unifiedServerFallbackFeatureBlockers`) | 200, 1 provider call | 401 "Invalid API key.", 0 calls | 401 "API key is missing.", 0 calls |

The child's own port (`corePort`) also answered a keyless request with 401. The unit tests prove what the proxy forwards, and this run proves the gateway rejects it. Still not run by anyone: the three curl commands through the proxy itself with a trusted CA, which is the only check of the HTTPS interception path end to end.

Decision D-12 binds. In gateway mode the proxy stops replacing the client's credential with the first LLMR key. It forwards the request's own headers, and the gateway authorizer accepts or rejects them. There is no opt-in setting and no guard on "has a credential" (D-9, D-12). A tool that reaches LLMR through Proxy mode must carry an LLMR key.

### Task 1: Forward the client's own credential

**Files:**
- Modify: `packages/core/src/proxy/service.ts:1236-1290` (`createForwardHeaders`, `primaryApiKey`) and its three call sites (`:947`, `:1024`, `:1143`)
- Test: `packages/core/test/unit/proxy/proxy-peer.test.mjs:64-82` (`proxyGet`, and the test "a loopback absolute-URL request reaches the gateway with the API key")

**Interfaces:**
- Consumes: the `withProxy` helper in `proxy-peer.test.mjs`. It sets `config.APIKEY = "sk-test-proxy-peer"` and records each upstream request's headers in `upstreamRequests`.
- Produces: `createForwardHeaders(headers: IncomingHttpHeaders, upstreamUrl: URL, routedToGateway: boolean, route?: { pluginRoute?: GatewayPluginProxyRouteMatch; targetUrl?: URL }): Record<string, string>`. The `config` parameter is gone.

- [ ] **Step 1: Give `proxyGet` a headers argument**

CG-2 Task 1 already gave the helper a second parameter, `url = "http://api.example.test/v1/messages"`. Add a third, so it reads `proxyGet(frontPort, url = "http://api.example.test/v1/messages", headers = {})`, and pass `headers` into `http.request`. The tests below pass `undefined` for `url` to keep its default.

- [ ] **Step 2: Replace the injection test with two failing tests**

Delete the test "a loopback absolute-URL request reaches the gateway with the API key" and add:

```js
test("gateway mode forwards the client's own credential unchanged", async () => {
  await withProxy(undefined, async ({ frontPort, upstreamRequests }) => {
    assert.equal(await proxyGet(frontPort, undefined, { authorization: "Bearer sk-client" }), 200);
    assert.equal(upstreamRequests.length, 1);
    assert.equal(upstreamRequests[0].authorization, "Bearer sk-client");
    assert.equal(upstreamRequests[0]["x-api-key"], undefined);
    assert.equal(upstreamRequests[0]["x-llmr-proxy-mode"], "gateway");
  });
});

test("gateway mode adds no key to a request that carries none", async () => {
  await withProxy(undefined, async ({ frontPort, upstreamRequests }) => {
    assert.equal(await proxyGet(frontPort), 200);
    assert.equal(upstreamRequests.length, 1);
    assert.equal(upstreamRequests[0].authorization, undefined);
    assert.equal(upstreamRequests[0]["x-api-key"], undefined);
    assert.equal(JSON.stringify(upstreamRequests[0]).includes("sk-test-proxy-peer"), false);
  });
});
```

The fake upstream in `withProxy` answers 200 to everything, so both tests assert on what reached it. The real gateway rejects the second request, which Task 2 checks by hand.

- [ ] **Step 3: Run the tests and see them fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/proxy/proxy-peer.test.js`
Expected: both new tests fail. The first reports `'Bearer sk-test-proxy-peer' !== 'Bearer sk-client'`. The second reports that `authorization` is `'Bearer sk-test-proxy-peer'`, not `undefined`.

- [ ] **Step 4: Delete the injection**

In the `routedToGateway` branch of `createForwardHeaders`, delete the two `delete forwarded…` lines, the `primaryApiKey(config)` call and the `if (apiKey)` block. Keep the three lines that set `host`, `x-llmr-proxy-mode` and `x-llmr-original-host`. Delete the `primaryApiKey` function. Remove the `config` parameter from `createForwardHeaders` and from its three call sites.

- [ ] **Step 5: Run typecheck and remove what it flags**

Run: `npm run typecheck`
Expected: exit 0. `tsconfig.json` sets `noUnusedLocals` and `noUnusedParameters`, so the first run reports TS6133 for the now-unused `config` destructured in `forwardDirectRequest`, `forwardHttpRequestViaHttpProxy` and `forwardHttpsRequestViaHttpProxy`. Remove `config` from those three functions and their parameter types, then from `forwardRequest` and its four call arguments, then the `config: this.config` property in the `forwardRequest` call in `handleProxyRequest`. Each removal surfaces the next as TS6133 or TS2353. Keep the `AppConfig` import, which the class and other functions still use. Run it again until it exits 0.

- [ ] **Step 6: Run the tests and see them pass**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/proxy/proxy-peer.test.js`
Expected: every test in the file passes, with 0 failures.

- [ ] **Step 7: Confirm nothing else depended on the injected key**

Run: `git grep -n "primaryApiKey\|sk-test-proxy-peer" -- packages/core tests`
Expected: no hit for `primaryApiKey`. `sk-test-proxy-peer` appears only in `proxy-peer.test.mjs`. The path is `packages/core` because `packages/ui/src/pages/home/App.tsx` has an unrelated local named `primaryApiKey`.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/proxy/service.ts packages/core/test/unit/proxy/proxy-peer.test.mjs
git commit -m "fix(proxy): forward the client's credential instead of injecting the LLMR key"
```

### Task 2: Document the requirement and check it against the real gateway

**Files:**
- Modify: `docs/src/content/docs/en/configuration/server.md`, section "Proxy mode" (`:41-56` at `136ad730`; CG-2 edits the same section first)

- [ ] **Step 1: Add the credential rule to the docs**

Add this paragraph after the capability table:

```markdown
Proxy mode does not add an LLMR key to a request. A tool that reaches LLMR through the proxy must send an LLMR API key in the header its SDK already uses (`Authorization`, `x-api-key`, `api-key` or `x-goog-api-key`). A key in the query string, such as `?key=`, is not accepted. LLMR rejects a request that carries a provider key or no key. An app that signs in with OAuth and cannot be given an API key cannot be routed through Proxy mode. Point it at the LLMR gateway address directly, or use an agent profile.
```

- [ ] **Step 2 (owner): Check the three cases in the running app**

Run `npm run dev:electron`. In Settings, install and trust the proxy CA, then turn Proxy mode on and leave System proxy off. Proxy mode does not start until the CA is trusted (`requireTrustedCertificate` in `ProxyService.attach`). Create an LLMR API key. The app runs the proxy on the gateway's own listener (`gateway-service.ts:224` calls `proxyService.attach`), so the proxy address is the gateway address, `http://127.0.0.1:3456` by default, and `proxy.port` is not used. Send three requests through it to a routed host. `-k` skips curl's check of the MITM certificate:

```bash
curl -sk -x http://127.0.0.1:3456 https://api.anthropic.com/v1/messages -H "x-api-key: <LLMR key>" -H "content-type: application/json" -d '{"model":"<a configured model>","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}' -o /dev/null -w "%{http_code}\n"
curl -sk -x http://127.0.0.1:3456 https://api.anthropic.com/v1/messages -H "x-api-key: sk-not-an-llmr-key" -H "content-type: application/json" -d '{}' -o /dev/null -w "%{http_code}\n"
curl -sk -x http://127.0.0.1:3456 https://api.anthropic.com/v1/messages -H "content-type: application/json" -d '{}' -o /dev/null -w "%{http_code}\n"
```

Expected: the first prints `200`. The second and third print `401`, from `authorize` in `gateway/auth/api-key-authorizer.ts` ("Invalid API key." and "API key is missing."), and the Logs page shows no provider call for them. A `403` with "LLMR API key is not initialized" means no key exists yet. If either of the last two prints `200`, the gateway accepted a request without a valid LLMR key. Stop and report it. Do not merge.

- [ ] **Step 3: Verify before opening the PR**

Run, in order: `npm run typecheck`, `node build/test.mjs core && node --test .test-dist/core/test/unit/proxy/proxy-peer.test.js`, `npm run test:architecture`, `npm run test:core`.
Expected: each exits 0 with 0 failures.

- [ ] **Step 4: Commit**

```bash
git add docs/src/content/docs/en/configuration/server.md
git commit -m "docs(proxy): say that proxy mode needs an LLMR key from the client"
```

Put this sentence in the PR description and the release notes: "Proxy mode no longer adds your LLMR key to requests. Give each tool an LLMR API key."
