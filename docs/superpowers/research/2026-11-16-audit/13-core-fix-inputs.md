# Research: core gateway fix inputs

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

Goal. The owner wants a plan that fixes today's audit findings. For each core gateway item this report gives the smallest correct fix, the tests to follow, and how to group the PRs. I edited nothing in the repo. My scratch scripts are in <session scratchpad>/core-gateway-fixes/.

## 1. Answer

Every audit claim held up when I read the code, with two corrections. In item 1 the guard must also accept Gemini credentials. In item 6 the fix is a deletion, not a throttle. The rest of the findings are below. Paths are relative to `packages/core/`.

- **9a.** Retry mode does resend after the request body was fully sent. This is a real billing risk (inferred, not measured).
- **9b.** `request_logs.url` stores `?key=` unredacted. Confirmed.
- **9c.** `proxy.browserMode` is dead config. Confirmed.

Recommended PR order (Subtract Before You Add):
- **PR-1.** Dead code: item 8 plus 9c. S.
- **PR-2.** Proxy hardening: items 1 and 2, the proxy docs, and query redaction in network capture. M/L.
- **PR-3.** Safe writes of user-owned files: item 4. M.
- **PR-4.** Small gateway guards: items 6, 7 and 9b. S/M.
- **PR-5.** SSE reconnect: item 3. S/M.
- **PR-6.** Marketplace integrity: item 5. S.
- **PR-7.** Retry-mode narrowing: 9a. S. It needs the owner's call.

## 2. Evidence (all read unless marked)

- **Item 1.**
  - `createForwardHeaders(headers: IncomingHttpHeaders, upstreamUrl: URL, routedToGateway: boolean, config: AppConfig, route?: { pluginRoute?; targetUrl? }): Record<string,string>` is at `src/proxy/service.ts:1236`. Its three call sites (`:947`, `:1024`, `:1143`) all pass `targetUrl`.
  - The gateway rejects keyless requests with 403 or 401 (`src/gateway/auth/api-key-authorizer.ts:25-50`), so injection is the only way a provider-keyed client gets in.
  - `sdkCompatibleTokenHeaderNames` is authorization, x-api-key, api-key, x-goog-api-key, x-mcp-key and x-codex-access-token (`src/gateway/internal/shared.ts:35`). Today the proxy strips only the first two.
  - `DEFAULT_PROXY_TARGETS` includes `generativelanguage.googleapis.com` (`src/config/default-config.ts:12-19`). Gemini SDKs send `x-goog-api-key` or `?key=` (training data, not checked). A guard on authorization, x-api-key and api-key alone would therefore break Gemini clients.
  - Cursor traffic takes plugin routes (`:720-726`), so this change does not touch it.
  - Gateway CORS allows only its own origin (`src/gateway/core-runtime/supervisor.ts:966-972`). A cross-site page therefore cannot pass a preflight to add an auth header (inferred). Rejecting requests that carry `Origin` is defense in depth and costs browser apps nothing, because their calls through the proxy already fail CORS (inferred).
  - **Must change.** `test/unit/proxy/proxy-peer.test.mjs:76` currently asserts that a request *without* auth gets the key injected.
- **Item 2.**
  - Capture defaults off (`default-config.ts:195`) and is toggled at runtime (`service.ts:319`). Docs say "uses MITM interception to identify and decrypt HTTPS requests, then proxies supported model requests" (`docs/src/content/docs/en/configuration/server.md:43`). Nothing promises to capture all hosts while capture is off.
  - Each new host spawns an HTTPS server and is never evicted (`:664-676`).
  - forge 2048-bit keygen took 80, 157, 23, 21 and 19 ms (measured with `keygen.cjs` against the repo's node-forge). A reused leaf key is therefore low value.
- **Item 3.** The read loop's `done` and `catch` paths (`src/mcp/toolhub-mcp.ts:1029-1034`) never clear `endpointUrl`, `initialized` or `streamBuffer`. Clients are cached per server (`:600-611`), so a dead SSE client times out on every call until its config changes. A stream that ends before the `endpoint` event also waits out the full startup timeout.
- **Item 4.**
  - `agents/*` already imports `writeFileAtomic` from `profiles/backup-files` in 5 modules (`agents/opencode/profile-config.ts:7`, `agents/pi`, `agents/zcode`, `agents/kilo`, `agents/codex/app-launch.ts`).
  - No architecture test forbids that import, so no move is needed.
  - `writeFileAtomic` resolves symlinks and keeps the existing mode (`src/profiles/backup-files.ts:76-100,152-161`).
  - Restore runs on every sync that has no takeover profile (`gateway-service.ts:88-91`), so a missing backup is normal. The defect is that a *corrupt* backup silently leaves the takeover in place (`:371-393`).
  - `applyClaudeAppDeploymentMode` replaces an unparseable `claude_desktop_config.json` with `{deploymentMode:"3p"}` (`:513-518`, `readJsonRecord` returns undefined on a parse error).
  - In Grok, a failed save leaves a spent refresh token on disk. The next `resolveGrokAuth` (`grok.ts:265`) re-reads disk, refreshes with the dead token, gets a 401 and finds no peer rotation. The credential is then lost (inferred from code).
  - The rc-file strip removes the user's own leading blank lines (measured with `rc-strip.mjs`).
- **Item 5.** Without integrity, `cachedMarketplaceModulePath` (`src/plugins/marketplace.ts:244-264`) re-fetches and overwrites the same URL-keyed file that the installed plugin's `module` points at. The committed manifest fixture has `"plugins": []` (`test/fixtures/plugin-marketplace/plugins.json`). I did not fetch the live manifest.
- **Item 6.** The cache TTL is already 1000 ms (`api-key-authorizer.ts:11`). A throttle of one refresh per second does the same thing as deleting `refresh`.
- **Item 7.** The test gateway serves `interval: 0` by default (`test/unit/agents/claude-apps-gateway-device-login.test.mjs:182`). A 5xx gateway with interval 0 hot-loops until `expires_in`. A non-number `timeoutMs` (the RPC casts at `src/web/management-server.ts:500`) makes the deadline `NaN`, so the wait never times out.
- **Item 8.** I ran `rg -nw <sym> packages tests scripts build docs` for each symbol. All 11 hit only their own definition, so there is no use in tests or in the `String.raw` runtime. `tsconfig.json:16` sets `noUnusedLocals: true`, so typecheck flags each newly orphaned helper.
- **9a.** `fetchUpstreamWithFallback` (`src/gateway/upstream/executor.ts:497-610`) retries on any 408, 409, 429 or 5xx (`src/routing/failure-classifier.ts`), and on any fetch rejection. Nothing checks whether the body had already been sent. Response-body errors after headers are not retried. Whether a given upstream bills for a 500, 502 or 504, or for a connection reset mid-request, is unverified.
- **9b.** The pipeline stores `new URL(request.url).toString()` (`src/gateway/request/pipeline.ts:137,342`), and the store keeps it as is (`src/observability/request-log-store.ts:1701`). Only the raw-trace path sanitizes (`src/observability/raw-trace-sync.ts:1660,1811-1830`). Gateway-mode proxying keeps the search string (`proxy/service.ts:1348`), so a real Google `?key=` lands in the log. Network capture stores `${pathname}${search}` (`proxy/service.ts:780,790`) unredacted.
- **9c.** `rg -nw browserMode` finds only `src/contracts/app.ts:1237`, `src/config/config.ts:2536-2544` and `default-config.ts:194`. No code reads it.

## 3. Plan inputs

Test commands follow AGENTS.md: `node build/test.mjs core && node --test .test-dist/core/test/<unit|integration>/<path>.test.js`.

### PR-1 (S). Item 8 and 9c

Delete each symbol entirely. None of them has an internal caller.

| Symbol | Delete together with it |
|---|---|
| `broadcastWindowsEnvironmentChanged` (`platform/windows-system.ts:30`) | the `spawnSync` import. Keep `windowsEnvironmentChangedPowerShellLines`, which `launch-service.ts:1967` uses. |
| `GROK_MEDIA_MCP_SERVER_NAME` (`contracts/app.ts:131`) | Reword the comment to "name". |
| `readProxyCertificateSerialNumber` (`proxy/certificates.ts:136`) | nothing |
| `DEFAULT_RETRY_AFTER_MS` (`gateway/internal/clock.ts:1`) | nothing |
| `claudeCodeEffectiveMaxInputTokens` (`gateway/model-catalog.ts:164`) | `claudeCodeDefaultContextTokens` (`:5`) |
| `modelCatalogReasoningEffortConfig` (`:184`) | type `ModelCatalogReasoningEffortConfig`, `sourceRecordsForProvider`, `reasoningConfigFromMetadata`, `normalizeReasoningEfforts`, `normalizeReasoningEffort`. Afterwards `ModelCatalogEntry.sourceRecords` and `parseModelCatalogSourceRecords` are only written, never read. Leave them or drop them as a follow-up; no UI reads them. |
| `findInstalledZcodeAppExecutable` (`agents/codex/app-launch.ts:246`) | nothing |
| `isSafeRouteReadPath` (`routing/rewrite.ts:210`) | nothing |
| `decodeLlmrRouteFallbackHeader` (`gateway/core-runtime/router-plugin-contract.ts:83`) | `isRouterFallbackConfig`. The encode side stays. Note that nothing in TS reads `x-llmr-route-fallback`. |
| `zcodeModelCatalogJson` (`agents/zcode/model-catalog.ts:77`) | nothing |
| `updateGatewayRequestLogFromRawTrace` (`observability/request-log-store.ts:1818`) | nothing |

- For 9c, delete `browserMode` from `ProxyRuntimeConfig`, the default config, and `parseProxy` along with its two aliases.
- Check with `npm run typecheck`, re-run until clean, then `npm run test:core`.

### PR-2 (M/L). Proxy

**Item 1.**
- In the `routedToGateway` branch of `createForwardHeaders`, compute `hasClientCredential` as any `sdkCompatibleTokenHeaderNames` header present, or `route.targetUrl.searchParams.has("key")`.
- Delete every name in that list, not just two. Inject `primaryApiKey(config)` only when `hasClientCredential` is true.
- In `handleProxyRequest`, after the loopback check, return 403 when `mode === "gateway"` and `request.headers.origin` is set.
- Strip `key` from the search string in `buildGatewayUrl` when a credential was replaced.
- Tests go in `test/unit/proxy/proxy-peer.test.mjs`:
  - Rewrite `:76` as "gateway mode swaps a client's provider key for the LLMR key". Send `x-api-key: sk-provider` and assert that authorization is `Bearer sk-test-proxy-peer` and that no `sk-provider` header reaches upstream.
  - "gateway mode forwards a keyless request without the LLMR key". Upstream sees no authorization.
  - "gateway mode accepts a Gemini x-goog-api-key or ?key= credential". The key is injected and `key` is gone from the upstream URL.
  - "gateway mode rejects a browser request carrying Origin". Expect 403 and no upstream hit.

**Item 2.**
- In `handleConnect`, after the loopback guard, check `this.networkCaptureEnabled || this.shouldIntercept(target.hostname)`. If neither holds, call `tunnelConnect(target, clientSocket, head)`.
- `shouldIntercept` returns true when `config.proxy.mode === "gateway"` and a `proxy.targets` host matches (`matchesHost`), or when any `pluginService.getProxyRouteHosts()` host matches.
- `tunnelConnect` uses `selectUpstreamProxyForUrl(this.upstreamProxy, new URL(\`https://${host}:${port}\`))`.
  - With an upstream proxy, `net.connect` to it, write `CONNECT host:port` plus `proxy-authorization` from `upstreamProxyAuthorizationHeader`, write `head`, and pipe both ways. The upstream's 200 reaches the client as is.
  - Without one, `net.connect(port, host)`, write our own 200, and pipe.
- Default behaviour: capture off, so only target and plugin hosts are decrypted. Capture on keeps decrypting everything.
- For the LRU, set `maxMitmServers = 32`. Move an entry to the end on a hit. On overflow, evict the oldest with `server.close()` plus `closeIdleConnections()` only, never `closeServer`'s `closeAllConnections`, so live streams survive.
- Reused leaf key (optional, low value). Add a `keys` parameter to `createCertificateForHost` and generate the pair once beside `this.authority`.
- Tests go in the same file, mocking `getMitmServer` and `createMitmServer` the way `:93` does:
  - "CONNECT to a non-target host tunnels raw bytes without MITM". Use a local echo server. Expect 0 MITM calls.
  - "CONNECT to a target host is intercepted".
  - "capture on intercepts every host".
  - "the MITM cache evicts the least recently used server past its cap". The first fake server's `close` gets called.
- Docs: update `server.md:43-49`.

**Query redaction (PR-2 or PR-4).** Export `redactSensitiveUrlQuery(url: string): string` from `src/observability/sensitive-headers.ts`, moving the logic out of `raw-trace-sync.ts`. Use it in network capture.

### PR-3 (M). Item 4

- **Claude app config (`agents/claude-app/gateway-service.ts`).**
  - The bodies of `writeJsonFile` (`:530`) and `restoreFileSnapshot` (`:417`) become `mkdirSync(dirname)` plus `writeFileAtomic(file, content, { mode: 0o600 })`.
  - Add `readJsonRecordForUpdate(file)`. It returns undefined when the file is missing and throws "… could not be parsed; LLMR left it unchanged" when the file exists but does not parse to a record. Use it in the three `apply*` writers.
  - In `restoreClaudeAppGatewayConfig`, a backup file that exists but is unreadable gets a `console.warn` and a fallback. The fallback removes `appliedId` only if it equals `CLAUDE_APP_CONFIG_ID`, and in that case also removes `deploymentMode:"3p"`.
- **Grok (`agents/local-providers/grok.ts`).**
  - `persistRefreshedGrokAuth` stops swallowing errors and uses `writeFileAtomic(auth.sourceFile, …)`, which keeps the existing mode.
  - Add `grokUnsavedRefreshes: Map<string, GrokTokenSet>`, keyed like `grokRefreshInFlight`. `refreshGrokAuth` catches a save failure, stores the token set there and warns.
  - `resolveGrokAuth` prefers the unsaved entry when its `expiresAt` is newer than the disk copy's (the `session-store.ts:136-152` pattern). A later successful save clears the entry.
- **launch-service (`profiles/launch-service.ts`).**
  - `writeFileIfChanged` (`:1927`) calls `writeFileAtomic`. Its callers already `chmodSafe`.
  - At `:2050-2054`, replace with `(match, offset) => offset === 0 ? repl.replace(/^\n/, "") : repl` and drop `.replace(/^\n+/, "")`. Verified in `rc-fix.mjs`.
- **Tests.**
  - `test/unit/agents/claude-app-gateway-sync.test.mjs`: "apply refuses to overwrite an unparseable claude_desktop_config.json" (throws, bytes unchanged) and "restore with a corrupt backup still removes LLMR's takeover keys".
  - `test/unit/agents/local-agent-provider-grok.test.mjs`: "Grok keeps a rotated refresh token in memory when auth.json cannot be saved". Make the dir 0o500 and skip on win32. One fetch, and the second resolve returns the refreshed token.
  - `test/unit/profiles/shell-rc-path-block.test.mjs`: "an rc file's own leading blank lines survive" and "a symlinked rc file stays a symlink".

### PR-4 (S/M). Items 6, 7 and 9b

- **Item 6.** Delete the `refresh` option and the miss-retry branches (`api-key-authorizer.ts:37-40`, `:65-68`, `:96-99`). The TTL bounds staleness at 1 s.
  - Test: "invalid tokens do not reload persisted keys more than once per second". Use `t.mock.method(configRepository, "listApiKeys", …)` from `@llmr/core/config/config-repository.ts`, send 10 bad tokens, and assert at most 1 load.
- **Item 7.**
  - `intervalMs: Math.max(1, intervalSeconds) * 1000`, and return the floored `intervalSeconds`.
  - `timeoutMs` uses `defaultWaitTimeoutMs` unless it is a finite number, then clamped to `[0, 120_000]`.
  - Existing tests change: `:40` now expects 1, and `:59` needs a 15 s timeout (about 7 s of polling).
  - New tests: "an interval of 0 polls at most once per second" and "a non-numeric timeoutMs falls back to the default".
- **9b.** Call `redactSensitiveUrlQuery` where the record is normalized (`request-log-store.ts:1701`), which covers both pipeline and probe.
  - Test in `test/unit/observability/`: "request logs store ?key= and ?api_key= redacted".

### PR-5 (S/M). Item 3

- Add `resetStream(controller, error)`. It clears the timeout, calls `rejectEndpoint`, and, only when `this.streamAbort === controller`, clears `endpointUrl`, `initialized`, `streamAbort` and `streamBuffer`. Then it calls `rejectAll`. Call it on `done` and in `catch`.
- Test in `test/integration/mcp/toolhub-mcp-runtime.test.mjs`, following the fakes at `:731-860` and the spawned `.test-dist/core/runtime/toolhub-mcp.js`: "an SSE backend that drops its stream is reconnected on the next call". The fake SSE server closes its stream after the first reply. Assert 2 GETs and that the second call succeeds.
- Per `.claude/rules/mcp-subprocess.md`, run `npm run build:assets` afterwards.

### PR-6 (S). Item 5

- In `cachedMarketplaceModulePath`, throw "must declare a sha256 integrity" when `!expectedSha256`. The per-entry catch skips that entry. Write the module with `writeFileAtomic`.
- Test in `test/unit/plugins/marketplace-manifest.test.mjs`: "entries without integrity are skipped". Call `normalizeMarketplaceManifest({plugins:[{id:"x",module:"https://e.test/x.js"}]}, url, {offline:true})` and expect `[]`.

### PR-7 (S). 9a, owner's call

- In retry mode only, retry statuses 408, 429, 503 and 529, and network errors whose `cause.code` is ECONNREFUSED, ENOTFOUND, EAI_AGAIN or UND_ERR_CONNECT_TIMEOUT.
- Put this in `routing/failure-classifier.ts` and `gateway/upstream/retry-policy.ts`.
- Extend `test/unit/gateway/routing-architecture.test.mjs:413` and `test/unit/gateway/upstream-executor.test.mjs`.

## 4. Risks and unknowns

- **Item 1.** Some real client may route through gateway mode with no credential. That is unlikely, since providers reject keyless calls (inferred). A grep of the Cursor and plugin route definitions would settle it for in-repo plugins.
- **Item 2.** `pluginService` has its own `matchesHost`. Reuse that one so the tunnel decision and route resolution agree. Tunnels opened while capture is off stay undecrypted after capture is turned on.
- **Item 4.** An atomic rename breaks hard links on rc files. Symlinks are handled.
- **Item 5.** Requiring integrity breaks custom marketplaces (`LLMR_PLUGIN_MARKETPLACE_URL`) that omit it. Check the live manifest before landing.
- **9a.** Whether an upstream bills for a 5xx or a reset is unverified, so it needs the provider docs or a trace. The upstream is the local core runtime, which may retry on its own (unchecked).
- I ran no repo tests or typecheck, per the brief.

I skipped fetching the live marketplace manifest, checking Gemini SDK header behaviour, and checking whether the ai-gateway core retries.
