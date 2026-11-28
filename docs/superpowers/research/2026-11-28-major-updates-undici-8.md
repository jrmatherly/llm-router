> Prototype notes for [`../plans/2026-11-28-major-updates.md`](../plans/2026-11-28-major-updates.md), written by the prototype's builder on 2026-11-28 and copied here unchanged. The patch and scripts it names are outside the repo in `private/research/2026-11-28-major-updates/undici-8/`. Where these notes and the plan differ, the plan is right: it was audited and reviewed after them.

# undici 7 to 8: prototype notes (2026-11-28)

Goal: a proven recipe for moving `undici` from `^7.29.0` to `^8` in `packages/core` and `packages/cli`, built in a worktree from `main` at `8f1725f1`. Nothing committed. The diff, lockfile included, is `prototype.patch` beside this file. The scratch scripts are in `scripts/`.

Labels: **run** means I ran it and saw the result, **read** means I read the code, **inferred** means reasoned from code and not run.

## Install

- `npm install undici@^8.0.0 -w packages/core -w packages/cli` picked 8.13.1 under the `~/.npmrc` cooldown (`min-release-age=2`). `~/.npmrc` also has `save-exact=true`, so npm wrote `"8.13.1"`. I set both manifests to `"^8.13.1"` by hand and ran `npm install` again to resync the lockfile. **run**
- I chose the floor `^8.13.1` over `^8.0.0`. That is the version every run below used, and it already clears the cooldown, so it cannot hit ETARGET. Change it back if the plan wants `^8.0.0`.
- Lockfile result. 8.13.1 sits nested at `packages/core/node_modules/undici` and `packages/cli/node_modules/undici`. Root `node_modules/undici` stays 7.30.1 and is now marked `dev` and `optional`. It is only openai's optional peer (`>=5 <9`) and `@electron/get`'s dependency. The gateway keeps its own 6.29.1 at `node_modules/@the-next-ai/ai-gateway/node_modules/undici`. **run** (`npm ls undici`)

## The five failing core tests: one cause

All five are in `packages/core/test/integration/gateway/october-issues-wire.test.mjs`, and all five go through `codexWireFixture`. With undici 8 and no code change, they fail with `502` and `stage: "upstream_connect"`, plus `actual: 0, expected: 2` on the first one. **run**

Cause: the test's own redirect. The product code is not at fault. **run** and **read**

1. The fixture writes a `--import` preload for the gateway child. That preload loads undici from the gateway's resolution (`createRequire(process.env.LLMR_TEST_GATEWAY_ENTRY)("undici")`, old line 730), which is the gateway's undici **6.29.1**. Its `setGlobalDispatcher(new LoopbackOnly())` writes only `Symbol.for('undici.globalDispatcher.1')`.
2. The gateway then loads the provider hook `.test-dist/core/runtime/local-agent-auth-provider-hook.js`. That bundle inlines LLMR's undici through `proxy/system-proxy-fetch.ts`, so the inlined copy is now 8.13.1.
3. On load, undici 8's `lib/global.js` runs `if (getGlobalDispatcher() === undefined) setGlobalDispatcher(new Agent())`. It checks only the **v2** symbol `undici.globalDispatcher.2`, and its `setGlobalDispatcher` also overwrites the **v1** symbol with `new Dispatcher1Wrapper(agent)`. The test's `LoopbackOnly` is replaced.
4. The gateway sends Codex upstream calls through the global `fetch`, and Node 24's bundled undici 7 reads the v1 symbol. Built gateway code: `E=y?await MT(e,b):await fetch(e,b)`. So the request goes to the real `chatgpt.com`, the test network guard refuses it, and the gateway reports `upstream_connect` 502. The first test counts calls that never arrive, hence 0 for 2.

Proof (`scripts/clobber.cjs`, **run**):

```
before load: .1 is the test's dispatcher = true
after loading undici 8.13.1: .1 is the test's dispatcher = false -> Dispatcher1Wrapper
after loading undici 7.30.1: .1 is the test's dispatcher = true -> Agent
```

Fix (test only): the preload takes `Agent` and `setGlobalDispatcher` from LLMR's own undici, `createRequire(<cwd>/packages/core/package.json)("undici")`. undici 8's `setGlobalDispatcher` sets both symbols, and the hook's inlined copy then finds v2 already set and leaves it. With the fix, the file passes 24 of 24 on undici 8 and 24 of 24 on undici 7.30.1. **run**

Product consequence of the same mechanism (**run** for Node 24, **read** for the rest). Any process that loads LLMR's undici 8 replaces the global dispatcher behind Node's built-in `fetch` with `Dispatcher1Wrapper(new undici8.Agent())`. That covers the core server, the gateway child once the auth hook or the preload module loads, and the Electron main process. Today nothing in `packages/*/src` calls `setGlobalDispatcher` (rg), so no product dispatcher is lost. Global `fetch` still speaks HTTP/1.1 because the wrapper forces `allowH2: false` (`dispatcher1-wrapper.js` lines 98 to 102, measured in row 2 below). The agent's other defaults (keep-alive, connection limits) now come from undici 8 instead of Node's bundled 7. I did not compare those.

## Files changed and why

| File | Change | Why |
|---|---|---|
| `packages/core/package.json:24`, `packages/cli/package.json:43` | `"undici": "^7.29.0"` to `"^8.13.1"` | the upgrade |
| `package-lock.json` | npm output | the upgrade |
| `packages/core/src/proxy/system-proxy-fetch.ts:1` | `import { ProxyAgent, type Dispatcher }` to `import { Dispatcher1Wrapper, ProxyAgent, type Dispatcher }` | see the next row |
| `packages/core/src/proxy/system-proxy-fetch.ts:213-214` | `new ProxyAgent(proxyUrl)` to `new Dispatcher1Wrapper(new ProxyAgent(proxyUrl))`, plus a one-line why | `fetchWithSystemProxy` hands an undici 8 dispatcher to Node 24's built-in fetch (undici 7). Without the wrapper every proxied request fails with `UND_ERR_INVALID_ARG: invalid onRequestStart method`. That covers Codex/Grok/Kimi token refresh, the pricing catalog, provider probes and marketplace fetches whenever a system or custom upstream proxy is set. |
| `packages/core/src/gateway/core-runtime/supervisor.ts:594-597` | `timeoutOptions` renamed `dispatcherOptions` and now always holds `allowH2: false`, plus a one-line why | The preload pairs undici 8's `Agent` and `ProxyAgent` with undici 8's own `fetch`, which negotiates h2 by default (measured below) |
| `packages/core/src/gateway/core-runtime/supervisor.ts:601-603` | the stale comment "Node >= 25 ships undici 8 while LLMR bundles undici 7" now reads "Node 24 ships undici 7 while LLMR bundles undici 8", and the quoted error is now `onRequestStart` | It was false after the bump |
| `packages/core/test/integration/gateway/october-issues-wire.test.mjs:727-731` | the redirect preload takes undici from `packages/core` | the cause above |
| `packages/core/test/unit/gateway/gateway-fetch-preload.test.mjs:39,62` | assert `allowH2 === false` on the `Agent` and `ProxyAgent` options | pins the HTTP/1.1 choice |
| `packages/core/test/integration/proxy/system-proxy-fetch.test.mjs` (new) | see below | proves the proxy path |

## New test: `a request to an outside host goes through the configured upstream proxy`

File `packages/core/test/integration/proxy/system-proxy-fetch.test.mjs`. It saves a config with `proxy.upstream.mode: "custom"` that points at a loopback HTTP server, which serves both absolute-form requests and CONNECT tunnels back to itself. It then calls `fetchWithSystemProxy("http://192.0.2.1/models")` and asserts status 200, the body `via proxy 192.0.2.1`, and that the proxy saw `192.0.2.1`.

Why the RFC 5737 address: with a hostname target such as `upstream.test`, undici 8's connector calls `net.connect({ host: <servername>, lookup: () => <proxy IP> })` (`lib/core/connect.js` lines 122 to 132). The test network guard (`build/test-network-guard.mjs` line 12) reads `host` and refused `upstream.test:<proxy port>`, even though the socket actually goes to the loopback proxy. An IP target has no servername, so `host` stays 127.0.0.1. **run**. The guard misfire also hits any future test that sends a hostname target through a loopback forward proxy on undici 8.

Runs (single-file command, **run**):

| State | Result |
|---|---|
| undici 8.13.1, no wrapper (`scripts/toggle-wrap.py` off) | fail: `TypeError: fetch failed`, cause `InvalidArgumentError: invalid onRequestStart method`, `UND_ERR_INVALID_ARG` |
| undici 8.13.1, with wrapper | pass 1 |
| undici 7.30.1 (main manifests and lockfile, `npm ci`), no wrapper | pass 1. undici 7 passes it too. |
| undici 8.13.1 with wrapper, run on Node 26.13.1 | pass 1 |

## HTTP/2 measurement

Script `scripts/h2-measure.mjs` (run it as `node scripts/h2-measure.mjs <worktree>`). It needs `cert.pem` and `key.pem` beside it:
`openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:h2.test,IP:127.0.0.1"`.

It starts a loopback `http2.createSecureServer({ allowHTTP1: true })` that echoes `req.httpVersion`, and a loopback CONNECT proxy that counts tunnels and maps every host to 127.0.0.1. Each scenario runs in its own child process with `NODE_EXTRA_CA_CERTS`. The supervisor rows take the preload text from the worktree's `supervisor.ts` itself. Proxied preload rows target `https://h2.test:<port>`, because the preload sends loopback names direct.

Node 24.22.3 (bundled undici 7.30.2), **run**:

| Path | Before the `allowH2` change | After |
|---|---|---|
| Node fetch, nothing loaded | 1.1 | 1.1 |
| Node fetch after `require(undici 8)` (global wrapper) | 1.1 | 1.1 |
| gateway undici 6 fetch, no dispatcher, after undici 8 loads | 1.1 | 1.1 |
| undici 8 fetch + `new Agent()` | 2.0 | (library default) |
| undici 8 fetch + `new Agent({ allowH2: false })` | 1.1 | |
| undici 8 fetch + `new ProxyAgent({ uri })`, via tunnel | 2.0 | (library default) |
| undici 8 fetch + `new ProxyAgent({ uri, allowH2: false })`, via tunnel | 1.1 | |
| Node fetch + bare undici 8 ProxyAgent (system-proxy-fetch without the fix) | `UND_ERR_INVALID_ARG` | |
| Node fetch + `Dispatcher1Wrapper(undici 8 ProxyAgent)`, via tunnel (the fix) | 1.1 | 1.1 |
| Node fetch + undici 7 ProxyAgent (main today), via tunnel | 1.1 | 1.1 |
| **supervisor preload, proxy set, undici 8 module**, via tunnel | **2.0** | **1.1** |
| **supervisor preload, timeout only, undici 8 module** | **2.0** | **1.1** |
| supervisor preload, proxy set, undici 7 module | 1.1 | 1.1 |
| supervisor preload, timeout only, undici 7 module | 1.1 | 1.1 |

The two bold rows are the only paths where undici 8 changes the protocol. Both are the gateway child's preload, when an upstream proxy or `API_TIMEOUT_MS` is set. `allowH2: false` puts both back to HTTP/1.1, through the tunnel too: `ProxyAgent` passes `allowH2` to its inner `Agent`, and the tunnel picks `kConnectEndpointHTTP1` when `opts.allowH2 === false` (`proxy-agent.js` lines 202 and 254). **run** and **read**

Recommendation (built): `allowH2: false` in the preload. Main speaks HTTP/1.1 on every path today, so this is the default that changes behaviour least. HTTP/2 to providers can be a separate, measured change later.

Node 26.13.1 (bundled undici **8.12.4**), same script after the change, **run**. Node's own fetch with nothing loaded already speaks **2.0** there. So does Node fetch after `require(undici 8)`, and so does a bare undici 8 ProxyAgent through Node fetch, which works on Node 26 with no wrapper. Every path LLMR controls stays 1.1: the wrapper row, both preload rows, and undici 7 ProxyAgent through Node fetch. The gateway's undici 6 fetch stays 1.1.

## Node versions

- Node 24.22.3 bundles undici 7.30.2 (`node -p process.versions.undici`). **run**
- Node 26.13.1 bundles undici 8.12.4. **run** (installed locally under mise)
- On a Node whose bundled undici is 8: `Dispatcher1Wrapper.wrapHandler` returns a v2 handler unchanged (`dispatcher1-wrapper.js` lines 85 to 95), so the wrapper is correct on both majors. **read**, and **run** on Node 26 (new test passes, h2 table row 9). The preload pairs its own fetch, so it is independent of Node's undici. On such a Node, Node's built-in global fetch negotiates h2 whatever LLMR does, and that holds on main too. **run** (row 0 on Node 26)
- Electron 45.3.3's bundled Node version: **not checked**. Running Electron was off limits. undici 8 needs Node >= 22.19.0.

## Other undici uses

- `agents/cdp-client.ts` `WebSocket`: undici 8.13.1's WebSocket connects to a minimal loopback server and receives a frame (`scripts/ws-check.cjs`). **run**. No repo test covers cdp-client.
- `proxy/undici-proxy-agent.ts` re-exports `Agent`, `ProxyAgent` and `fetch`. Typecheck passes. **run**
- `benchmark/request-log-web-load.mjs` `Pool`: loopback plain HTTP, so h2 cannot apply. **not run**
- `scripts/http-proxy.cjs` shows that undici 8 sends a plain-http target through a proxy as an absolute-form request (`GET http://host/x`), where undici 7 opened a CONNECT tunnel. **run**. Proxies that refuse absolute-form requests would behave differently for `http:` upstreams. Most upstreams are `https:`, which still tunnel.

## Final suite counts (undici 8.13.1, Node 24.22.3, **run**)

| Suite | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `rtk bypass npm run lint` | 949 files, no findings, exit 0 |
| `npm run test:architecture` | 218 tests, 218 pass, 0 fail |
| `LLMR_TEST_GATEWAY_ENTRY=... npm run test:core` | 2,560 tests, 2,544 pass, 16 skipped, 0 fail, no refused connections |
| `npm run test:cli` | 21 tests, 21 pass |
| `npm run test:electron` | 46 tests, 46 pass (Electron binary as Node, no window) |

Core went from the baseline of 2,543 to 2,544 pass, and the one new test accounts for the difference. The later comment-only edit to `supervisor.ts` was rechecked with typecheck, lint and the preload unit file, not the whole core suite.

## Not checked

- `npm run test:ui`, `npm run test:e2e`, `npm run test:system` (Docker), `npm run build:assets`. The last one runs the lightweight MCP bundle cap. The test builds of `fusion-vision-mcp.js` and `media-tools-proxy-mcp.js` contain no undici (rg), so I expect the cap holds. **inferred**
- The packaged desktop app and the Electron main process with undici 8 loaded.
- A real HTTPS upstream through a real corporate proxy. All proxy runs used loopback proxies.
- Differences between the undici 8 and Node-bundled undici 7 `Agent` defaults behind global fetch, now that undici 8 owns the global dispatcher.
- The undici 8 changes to `Blob` and `FormData` handling. LLMR passes bodies through Node's global fetch, not undici's, so they should not apply. **inferred**
