# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the nine trust-boundary gaps the audit found in the Electron shell, the gateway, the proxy, the UI deep-link flow and the Chrome extension.

**Architecture:** Each fix copies a guard that already exists elsewhere in the repo. These are the http/https URL check, the capped body reader, the sensitive-header redactor and the `headersSent` guard. Where a check is missing entirely, it goes at the single entry point every caller passes through. The proxy gets a loopback-peer check, remote control gets an owner per session, and the extension derives its import URL from its own page.

**Tech Stack:** TypeScript in `packages/core`, `packages/electron` and `packages/ui`; plain JS in `extension/chrome`; `node:test` with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-10-27-audit-remediation.md` (findings S1 to S9)

## Global Constraints

- Style per `AGENTS.md`: double quotes, semicolons, two-space indent, `node:` imports first, no comments except a non-obvious why.
- Run one test file with `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit-or-integration>/<path>.test.js`. Never pass `--scope`.
- Nothing in `packages/electron/test` mocks `electron`. Electron fixes put their logic in pure modules that the tests import, as `packages/electron/test/unit/plugin-app-url.test.ts` does.
- Cap values: the default gateway body cap is 16 MiB; `/v1/oauth/token` gets 64 KiB; the model request pipeline keeps the 256 MiB `bodyLimitBytes` from `packages/core/src/gateway/core-runtime/config-compiler.ts:155`. An over-cap request gets HTTP 413.
- Loopback peers are `127.0.0.1`, `::1` and `::ffff:127.0.0.1`.
- The redaction placeholder is `"[redacted]"`, the same as `packages/core/src/observability/request-log-runtime.ts:1109`.

## Review Focus

1. A browser on the same machine using the system proxy in shared mode, where the gateway is bound to `0.0.0.0`. Expected: it still works, because the check is on the peer address, not the bind host. Pinned in Task 2.
2. A streaming model response that fails after its first chunk. Expected: the socket closes with no JSON appended and no unhandled rejection. Pinned in Task 8.
3. A remote-control session created before an API key was configured, where `authorization.apiKey` is undefined. Expected: it belongs to a shared anonymous owner, and keyed callers cannot see it. Pinned in Task 5.
4. A plugin page that opens a `mailto:` link. Expected: it is ignored rather than handed to the OS. Only http and https go out. Pinned in Task 1.
5. A 17 MiB `/v1/messages` body. Expected: accepted, because the pipeline keeps its own 256 MiB limit. Pinned in Task 3.

---

### Task 1: Only http and https URLs leave Electron windows (S1, S8)

**Files:**
- Create: `packages/electron/src/main/external-url.ts`
- Modify: `packages/electron/src/main/windows.ts` (`:209`, `:227`, `:377`, `:385`, and the main window block `:61-101`)
- Modify: `packages/electron/src/main/built-in-browser.ts:937` and `packages/electron/src/main/bot-gateway-qr-window-service.ts:119` (delete their private `isHttpUrl` and import the new one)
- Test: `packages/electron/test/unit/external-url.test.ts`

**Interfaces:**
- Produces: `isHttpUrl(value: string): boolean` and `openHttpExternal(url: string, open: (url: string) => Promise<void>): boolean`. The second calls `open` only for http or https and returns whether it did.

- [ ] **Step 1: Write the failing test**

```ts
test("openHttpExternal forwards only http and https", () => {
  const opened: string[] = [];
  const open = async (url: string) => { opened.push(url); };
  assert.equal(openHttpExternal("https://example.com/a", open), true);
  assert.equal(openHttpExternal("http://example.com", open), true);
  for (const url of ["file:///System/Applications/Calculator.app", "smb://host/share", "ms-msdt:/id", "mailto:a@b.c", "javascript:alert(1)", "not a url"]) {
    assert.equal(openHttpExternal(url, open), false, url);
  }
  assert.deepEqual(opened, ["https://example.com/a", "http://example.com"]);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/external-url.test.js`
Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement and wire every site**

Move `isHttpUrl` from `built-in-browser.ts:937` into `external-url.ts`. Replace each of the four `void shell.openExternal(url)` calls in `windows.ts` with `openHttpExternal(url, shell.openExternal)`. On the main window add `setWindowOpenHandler` that calls `openHttpExternal` and returns `{ action: "deny" }`. Also add a `will-navigate` handler that calls `event.preventDefault()` unless the target URL starts with the renderer origin from `this.resolveRendererUrl("pages/home/index.html")`, and opens other http(s) targets through `openHttpExternal`.

- [ ] **Step 4: Check that no unfiltered call is left**

Run: `git grep -n "shell.openExternal(" packages/electron/src`
Expected: only `external-url.ts` and the already-filtered `ipc.ts:188-193` site.

- [ ] **Step 5: Run the Electron suite**

Run: `npm run test:electron`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/electron/src/main packages/electron/test/unit/external-url.test.ts
git commit -m "fix(electron): open only http and https links from app windows"
```

### Task 2: The proxy serves loopback peers only (S2)

**Files:**
- Modify: `packages/core/src/proxy/service.ts` (`handleHttpRequest` and `handleProxyRequest` entry, `handleConnect` :630)
- Create: `packages/core/src/net/loopback.ts`
- Test: `packages/core/test/unit/proxy/proxy-peer.test.mjs`

**Interfaces:**
- Produces: `isLoopbackAddress(address: string | undefined): boolean`. Proxy HTTP requests from other peers get 403 through the existing `sendProxyError(response, 403, message)`. CONNECT from other peers gets `HTTP/1.1 403 Forbidden\r\n\r\n` and the socket is destroyed.

- [ ] **Step 1: Write the failing tests**

```js
test("isLoopbackAddress accepts only loopback peers", () => {
  for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) assert.equal(isLoopbackAddress(address), true, address);
  for (const address of ["192.168.1.20", "::ffff:10.0.0.5", "", undefined]) assert.equal(isLoopbackAddress(address), false, String(address));
});

test("a non-loopback absolute-URL request gets 403 and no forwarded API key", async () => {
  // start the proxy service with proxy.enabled and mode "gateway" on an http server,
  // and stub request.socket.remoteAddress to "192.168.1.20"
  assert.equal(response.statusCode, 403);
  assert.equal(upstreamCalls, 0);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/proxy/proxy-peer.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Check `isLoopbackAddress(request.socket.remoteAddress)` as the first statement of the HTTP proxy entry and of `handleConnect`. That covers both the shared gateway listener (`attach` :204) and the standalone proxy server (:170-180).

- [ ] **Step 4: Run the core suite**

Run: `npm run test:core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/proxy/service.ts packages/core/src/net/loopback.ts packages/core/test/unit/proxy/proxy-peer.test.mjs
git commit -m "fix(proxy): refuse proxy and CONNECT requests from non-loopback peers"
```

### Task 3: The gateway caps request bodies (S3)

**Files:**
- Modify: `packages/core/src/gateway/http/io.ts:308` (`readRequestBody`)
- Modify: `packages/core/src/gateway/auth/api-key-authorizer.ts:77`, `packages/core/src/gateway/request/pipeline.ts:135`
- Test: `packages/core/test/unit/gateway/read-request-body.test.mjs`

**Interfaces:**
- Produces: `readRequestBody(request: IncomingMessage, maxBytes?: number): Promise<Buffer>`, with `maxBytes` defaulting to `16 * 1024 * 1024`. On overflow it rejects with `RequestBodyTooLargeError` (exported, `status = 413`) and calls `request.destroy()`. The top-level handler from Task 8 maps that error to 413.

- [ ] **Step 1: Write the failing tests**

```js
test("readRequestBody rejects past the cap with a 413 error", async () => {
  // http.createServer that awaits readRequestBody(request, 1024); fetch with a 2048-byte body
  await assert.rejects(bodyPromise, (error) => error instanceof RequestBodyTooLargeError && error.status === 413);
});

test("readRequestBody returns bodies under the cap", async () => {
  assert.equal((await readFor(512)).length, 512);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/read-request-body.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Copy the counting loop from `packages/core/src/web/management-server.ts:753`. The authorizer passes `64 * 1024`. The pipeline passes the compiled `bodyLimitBytes`. Every other caller keeps the default.

- [ ] **Step 4: Run the core suite**

Run: `npm run test:core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/gateway packages/core/test/unit/gateway/read-request-body.test.mjs
git commit -m "fix(gateway): cap request bodies and the pre-auth token exchange body"
```

### Task 4: Network capture redacts credentials (S4)

**Files:**
- Modify: `packages/core/src/proxy/service.ts` (`cloneHeaders` :1734, used at :769 and for response headers)
- Test: `packages/core/test/unit/proxy/capture-headers.test.mjs`

**Interfaces:**
- Consumes: `isSensitiveRequestLogHeaderName(value: string): boolean` from `packages/core/src/observability/sensitive-headers.ts`.
- Produces: `cloneHeaders` exported as `cloneCapturedHeaders(headers): CapturedHeaders`, with sensitive values replaced by `"[redacted]"`.

- [ ] **Step 1: Write the failing test**

```js
test("captured headers hide credentials and keep the rest", () => {
  const headers = cloneCapturedHeaders({ authorization: "Bearer x", cookie: "a=b", "set-cookie": ["s=1"], "content-type": "application/json" });
  assert.equal(headers.authorization, "[redacted]");
  assert.equal(headers.cookie, "[redacted]");
  assert.equal(headers["set-cookie"], "[redacted]");
  assert.equal(headers["content-type"], "application/json");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/proxy/capture-headers.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Redact inside `cloneCapturedHeaders`, so stored captures never hold the secret and the MCP tool (`packages/core/src/mcp/network-capture-mcp.ts:283`) needs no change. Check what upstream forwarding uses. If forwarding reads from the same clone, give forwarding the raw headers and use the redacted clone only for capture.

- [ ] **Step 4: Run the core suite**

Run: `npm run test:core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/proxy/service.ts packages/core/test/unit/proxy/capture-headers.test.mjs
git commit -m "fix(proxy): redact credentials in captured network headers"
```

### Task 5: Remote-control sessions belong to the key that made them (S6)

**Files:**
- Modify: `packages/core/src/gateway/remote-control-service.ts` (`RemoteSession`, `ensureSession` :343, the handlers at :134, :167, :219, :262, :305, the eviction at :499-509)
- Modify: `packages/core/src/gateway/http/request-handler.ts:120-133`
- Test: `packages/core/test/unit/gateway/remote-control-service.test.mjs`

**Interfaces:**
- Consumes: `ApiKeyAuthorizationResult` (`packages/core/src/gateway/internal/shared.ts:45`), whose success value carries `apiKey?: ApiKeyConfig` with `id`.
- Produces: `CcrRemoteControlRequestContext` gains `ownerId: string`, set to `authorization.apiKey?.id ?? "anonymous"`. `RemoteSession` gains `ownerId`. A lookup by another owner answers 404, and eviction only removes the caller's own sessions.

- [ ] **Step 1: Write the failing tests**

```js
test("a key sees only its own sessions", async () => {
  // owner "key-a" creates session s1; owner "key-b" lists sessions
  assert.deepEqual(listedIds, []);
});

test("another key cannot read or inject into a session", async () => {
  assert.equal(await statusFor("key-b", "GET", "/sessions/s1/events"), 404);
  assert.equal(await statusFor("key-b", "POST", "/sessions/s1/inbound"), 404);
});

test("one key filling its quota does not evict another key's sessions", async () => {
  // key-a creates 1 session, key-b creates maxSessions sessions
  assert.equal(await statusFor("key-a", "GET", "/sessions/s1"), 200);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/remote-control-service.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Construct the service directly in the test with stub request and response objects. In code, every `this.sessions.get(id)` goes through one `ownedSession(id, ownerId)` helper. `maxSessions` counts per owner.

- [ ] **Step 4: Run the core suite**

Run: `npm run test:core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/gateway packages/core/test/unit/gateway/remote-control-service.test.mjs
git commit -m "fix(gateway): scope remote-control sessions to the API key that created them"
```

### Task 6: A deep link probes nothing until the user asks (S5)

**Files:**
- Modify: `packages/ui/src/pages/home/App.tsx` (`openImportProviderDialog` :1294-1345)
- Modify: `packages/ui/src/pages/home/components/providers.tsx` (the import dialog's protocol-detection panel near :1759)
- Test: `packages/ui/test/integration/providers.test.ts`

**Interfaces:**
- Produces:
  - `buildProviderImportDraft(payload: ProviderDeepLinkPayload, providers: ProviderConfig[]): ProviderDraft`, a synchronous export from `packages/ui/src/pages/home/shared/providers.ts`. It wraps the existing `createProviderDraftFromDeepLinkPayload` plus the metadata merges at `App.tsx:1336-1342`.
  - `openImportProviderDialog(payload)` calls only `buildProviderImportDraft` and opens the dialog. It makes no `getProviderCatalogModels` or `probeProvider` IPC call.
  - A new `detectImportedProvider()` in `App.tsx` runs the current catalog-then-probe sequence (lines 1305-1330, unchanged) and is passed to the dialog as `onDetect`.
  - The dialog shows a "Detect models and protocols" button while `providerProbe` is undefined.

- [ ] **Step 1: Write the failing test**

In `providers.test.ts`, stub `globalThis.window = { ccr: { probeProvider, getProviderCatalogModels } }` with counting functions:

```ts
test("building the import draft for a deep link makes no network call", () => {
  const draft = buildProviderImportDraft({ apiKey: "k", baseUrl: "http://169.254.169.254/latest", models: [] }, []);
  assert.equal(draft.baseUrl, "http://169.254.169.254/latest");
  assert.equal(calls.probeProvider, 0);
  assert.equal(calls.getProviderCatalogModels, 0);
});
```

Because the function is synchronous, it cannot await an IPC call. The live check in Task 9 covers the dialog wiring.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/integration/providers.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Move lines 1305-1330 into `detectImportedProvider`. Keep the `providerProbeRequestId` staleness checks.

- [ ] **Step 4: Run the UI suite**

Run: `npm run test:ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/pages/home packages/ui/test/integration/providers.test.ts
git commit -m "fix(ui): wait for the user before probing a deep-linked provider"
```

### Task 7: The Chrome extension imports only from LLMR's own confirm page (S7)

**Files:**
- Modify: `extension/chrome/manifest.json` (content script `matches`)
- Modify: `extension/chrome/confirm.js:6`, `extension/chrome/background.js:24`, `:206-235` (`normalizeImportUrl`)
- Test: `tests/architecture/chrome-extension.test.mjs`

**Interfaces:**
- Produces: the content script matches only `http://127.0.0.1/chrome-import/jobs/*/confirm` and `http://localhost/chrome-import/jobs/*/confirm`. `confirm.js` builds the import URL as `location.origin + location.pathname.replace(/\/confirm$/, "")` and ignores `data-import-url`. `normalizeImportUrl` rejects any URL whose origin differs from the sender tab's origin.

- [ ] **Step 1: Write the failing test**

```js
test("the extension content script runs only on LLMR confirm pages", () => {
  const manifest = JSON.parse(readFileSync("extension/chrome/manifest.json", "utf8"));
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "http://127.0.0.1/chrome-import/jobs/*/confirm",
    "http://localhost/chrome-import/jobs/*/confirm"
  ]);
  assert.doesNotMatch(readFileSync("extension/chrome/confirm.js", "utf8"), /data-import-url|dataset\.importUrl/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/chrome-extension.test.js`. Check the real `.test-dist` path for architecture tests with `ls .test-dist`.
Expected: FAIL.

- [ ] **Step 3: Implement**

The server side, `packages/electron/src/main/chrome-login-import.ts:45`, already serves the confirm page at `/chrome-import/jobs/<id>/confirm` on an ephemeral port, so no server change is needed.

- [ ] **Step 4: Run the architecture suite**

Run: `npm run test:architecture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/chrome tests/architecture/chrome-extension.test.mjs
git commit -m "fix(extension): take the cookie import URL from LLMR's confirm page only"
```

### Task 8: Gateway errors never write headers twice (S9)

**Files:**
- Modify: `packages/core/src/gateway/http/io.ts` (add the sender)
- Modify: `packages/core/src/gateway/application/gateway-service.ts:525-536`
- Test: `packages/core/test/unit/gateway/send-gateway-error.test.mjs`

**Interfaces:**
- Consumes: `RequestBodyTooLargeError` from Task 3.
- Produces: `sendGatewayError(response: ServerResponse, error: unknown): void`. With headers unsent it writes the error's `status` if present, else 502, as JSON. With headers already sent it calls `response.destroy()`.

- [ ] **Step 1: Write the failing tests**

```js
test("sendGatewayError writes 413 for an oversized body", () => {
  sendGatewayError(response, new RequestBodyTooLargeError());
  assert.equal(response.statusCode, 413);
});

test("sendGatewayError destroys a response whose headers were sent", () => {
  response.writeHead(200);
  response.write("partial");
  sendGatewayError(response, new Error("boom"));
  assert.equal(response.destroyed, true);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/send-gateway-error.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement and use it in both catches in `listen`**

- [ ] **Step 4: Run the core suite**

Run: `npm run test:core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/gateway packages/core/test/unit/gateway/send-gateway-error.test.mjs
git commit -m "fix(gateway): send one error response and never rewrite sent headers"
```

### Task 9: Prove it live and open the PR

**Files:** none changed.

- [ ] **Step 1: Live check in the desktop app**

Run `npm run dev:electron`. Drive it with the `chrome-devtools-mcp:chrome-devtools` skill and close every page you open.
- Open a plugin window and run `window.open("file:///etc/hosts")` in its devtools. Expected: nothing opens.
- Open a provider deep link with a `baseUrl` of `http://127.0.0.1:9/`. Expected: the network panel shows no request to port 9 until "Detect models and protocols" is clicked.

- [ ] **Step 2: Live check of the gateway**

Start the gateway with `proxy.enabled` and `gateway.host` set to `0.0.0.0`. From another machine or container, send `curl -x http://<lan-ip>:3456 http://api.anthropic.com/v1/messages`. Expected: 403. Then send `curl --data-binary @<70 KiB file> http://127.0.0.1:3456/v1/oauth/token`. Expected: 413.

- [ ] **Step 3: Run every suite**

Run: `npm run typecheck && npm run test`
Expected: all PASS.

- [ ] **Step 4: Open the PR**

Title: `fix: close the trust-boundary gaps from the 2026-10-27 audit`. The body maps each commit to S1 to S9 and pastes the live-check output.

## Risks

- **Peer check behind a local reverse proxy.** In the Docker image, nginx forwards to the gateway from `127.0.0.1`, so remote clients appear as loopback. The proxy is not exposed through nginx today (`docker/entrypoint.sh:176-187` proxies only model paths), and the PR keeps it that way.
- **Remote-control clients that share one key across tools.** They still see each other's sessions, which matches how a key is meant to be used.
