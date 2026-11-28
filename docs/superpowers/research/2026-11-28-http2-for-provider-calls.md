> Research for [`../plans/2026-11-28-major-updates.md`](../plans/2026-11-28-major-updates.md), Task 2, written by the researcher on 2026-11-28 and copied here unchanged. Its scripts and raw runs are outside the repo in `private/research/2026-11-28-major-updates/http2/`.

# HTTP/1.1 or HTTP/2 to providers after undici 8 (2026-11-28)

Goal: tell the owner, with evidence as of 2026-11-28, whether LLMR's calls to LLM providers should stay on HTTP/1.1 or move to HTTP/2 with the undici 7 to 8 move (plan `docs/superpowers/plans/2026-11-28-major-updates.md`, Task 2). Research and loopback measurement only. Nothing in the repo was edited, nothing was installed into it, no provider got a request with a key or a body.

Labels: **run** = I ran it and saw the result. **read** = I read the file (path:line) or page (URL). **inferred** = reasoned from what I read or ran, not run.

## Conclusion

1. **The streamed provider traffic does not go through the code the plan's flag changes.** Every provider call the gateway makes, streamed or not, goes through the gateway package's own nested undici 6 `fetch` with its own dispatcher. That path speaks HTTP/1.1 on Node 24 and Node 26, on `main`, after Task 2 as planned, and after Task 2 without the flag. **run** (probe table) and **read** (below). The plan's `allowH2: false` only reaches the fusion MCP children, and only when an upstream proxy is set.
2. **Task 2 does change the protocol on one path the plan does not cover.** On Node 26, LLMR's own direct requests (token refresh, pricing catalog, provider probes, marketplace, icons, media artifact downloads, and so on, through `fetchWithSystemProxy` with no proxy) go from HTTP/1.1 on `main` to HTTP/2 after Task 2. That happens because undici 7 seeds the global dispatcher Node 26's fetch reads and undici 8 seeds it with an h2 Agent. **run**. Node 24, Docker and the current desktop app (Electron 45, Node 24.22.3) are not affected.
3. **Recommendation: (a) keep HTTP/1.1 for provider traffic, as planned, and fix the plan's text.** Confidence high for the next six months. HTTP/2 brings little to this workload. In the measurements it saved about 50 to 65 ms of first byte on warm bursts of 8 to 32 streams at an emulated 40 ms RTT. It cost about 36 ms on cold bursts. One connection reset killed every stream on the connection, against one stream on HTTP/1.1. undici 8's HTTP/2 client still has three open bugs that match this workload. One of them (#6106) was reported by someone streaming Anthropic-style SSE for hours on Node 26. The official Python SDKs keep HTTP/1.1 on purpose, and both TypeScript SDKs take whatever global `fetch` does.
4. **What would change it:** a real-network measurement, from the gateway to api.anthropic.com or api.openai.com, showing that HTTP/1.1 costs users something they notice: first-token latency on warm concurrent bursts, a connection cap or handshake rate limit being hit. That measurement only matters once undici #6106 and #6149 are fixed in a release and in Node 26's bundled copy.

## 1. Which requests go where (read)

### Provider calls: the gateway child, undici 6

- LLMR core never talks to providers for model calls. It forwards each agent request to the gateway child over loopback plain HTTP: `pipeline.ts:813` builds the URL from `this.status.coreEndpoint`, and `executor.ts:520` sends it with `fetchWithSystemProxy`. No TLS on that hop, so HTTP/2 cannot apply. **read**
- The gateway child is spawned with one argument, the bootstrap entry, and no `--require` (`supervisor.ts:62-74`). `gateway-bootstrap.ts` loads the gateway and installs no dispatcher (rg over the file: no `fetch`, `undici` or `dispatcher`). **So the gateway fetch preload never runs in the gateway child.** **read**
- In `@the-next-ai/ai-gateway` 1.0.22-llmr.4 (`node_modules/@the-next-ai/ai-gateway/dist/index.js`, read as text, never loaded), all five provider call sites go through one function `Yr` (offset 40243). Callers: the agent model client (`mh`, `hh`), the endpoint path (`nb`, offset 422537) and the passthrough path (`Do`, offset 711356). `Yr` does `y = $T(timeoutMs)` and then `E = y ? await MT(e, b) : await fetch(e, b)`. `MT` is `require("undici").fetch`, the gateway's nested undici **6.29.1**. **read**
- `$T` (offset 42401) returns a dispatcher when the timeout is above 0 or a proxy env var is set (`CCR_UPSTREAM_PROXY_URL`, `HTTP(S)_PROXY`, `ALL_PROXY`). It wraps `undici6.getGlobalDispatcher()` in class `ql`, which sets `headersTimeout` and `bodyTimeout` per request (offset ~43600). Through a proxy it routes to a cached undici 6 `ProxyAgent` (`Nl`, `WT`). **read**
- The timeout is almost always above 0. LLMR's default `API_TIMEOUT_MS` is 600000 (`default-config.ts:30`), compiled to `upstreamTimeoutMs` (`config-compiler.ts:176`). The gateway falls back to 60000 (`n0=6e4`) only when the value is missing, and `rn(0)` keeps 0. So the global-`fetch` branch runs only when the user sets `API_TIMEOUT_MS` to 0 (or to something `Number()` turns into NaN) and no proxy is set. **read**
- undici 6 and 7 default `allowH2` to false (`connect.js:87` in the gateway's 6.29.1, `connect.js:76` in the root 7.30.1). undici 8.13.1 defaults it to true (`connect.js:76`). **read**
- With undici 8 loaded in the same process (the local-agent auth hook bundles LLMR's undici through `system-proxy-fetch.ts`), undici 8's `lib/global.js` overwrites the v1 global dispatcher symbol with `Dispatcher1Wrapper(new Agent())`. The wrapper forces `allowH2: false` on every dispatch (`dispatcher1-wrapper.js:98-102`, citing undici issue #4989: v1 handlers cannot do h2). undici 6's `fetch` then runs through undici 8's Agent but stays on HTTP/1.1. **read**, and **run** (probe rows with "base Dispatcher1Wrapper").

### LLMR's own direct requests: core process and the hook

- `fetchWithSystemProxy` (`system-proxy-fetch.ts:31-46`) is Node's built-in `fetch`. It has no dispatcher when there is no proxy, and LLMR's undici `ProxyAgent` when there is one (Task 2 wraps it in `Dispatcher1Wrapper`). Callers (rg): `gateway/upstream/executor.ts` (loopback only), `media/executors.ts` (gateway via loopback, plus generated-artifact downloads straight from the provider), `plugins/marketplace.ts`, `gateway/features/hosted-web-search/discovery.ts`, `mcp/tool-discovery.ts`, `providers/icons.ts`, `providers/account-service.ts`, `providers/probe.ts`, `agents/local-providers/{codex,grok,kimi}.ts` (token refresh), `agents/claude-apps-gateway/session-store.ts`, `models/pricing-service.ts`. All are short, non-streamed requests. **read** (call sites), **inferred** (none streams).
- The core process is the CLI's `node`, or Electron's main process in the desktop app.

### The fusion MCP children: the only place the preload runs

- `writeGatewayProxyPreloadFile()` runs only when an upstream proxy URL exists (`config-compiler.ts:88`). The file is passed as `--require` only to the fusion builtin MCP servers (`fusion-config.ts:142`): `fusion-vision-*` and `fusion-web-search-*`. Their `command` is `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, so they run on the core's Node (Electron's Node in the desktop app). **read**
- Those children call a vision provider directly when the profile has its own `baseUrl` and `apiKey`, and a search provider for web search (`fusion-vision-mcp.ts:254,290`; `fusion-config.ts:59,92-105`). Otherwise they call the gateway on loopback, which the preload bypasses. **read**
- `LLMR_UPSTREAM_TIMEOUT_MS`, the preload's other trigger, is set nowhere under `packages/*/src`. Only `gateway-fetch-preload.test.mjs` sets it. The timeout branch is dead in production. **read** (rg, and `git log -S` shows only the rename commit 78338655)

### Which Node each piece runs on

- CLI: the gateway child runs on `LLMR_NODE_BIN` or the CLI's own `process.execPath` (`supervisor.ts:447-464`). **read**
- Desktop: the gateway child prefers a **system Node** (`NODE_BINARY`, `NODE`, `node` on PATH, `/opt/homebrew/bin/node`, `/usr/local/bin/node`, `/usr/bin/node`) that can load `better-sqlite3`. It falls back to Electron's Node only when none qualifies (`supervisor.ts:447-480`). The premise "the gateway child runs on Electron's Node in the desktop app" holds only on a Mac with no usable Node installed. **read**
- Electron 45.3.3 (the repo's pin, `node_modules/electron/package.json`) bundles Node 24.22.3. **read** https://releases.electronjs.org/releases.json. Electron 46.0.0-alpha.14 bundles Node 26.13.1, with a tentative stable date of 2027-01-05 (same source, and https://releases.electronjs.org/schedule).
- Docker: `node:24-bookworm-slim` for build and runtime (`Dockerfile:1-2`). **read**
- Node 24.22.3 bundles undici 7.30.2, and Node 26.13.1 bundles undici 8.12.4. **run** (`process.versions.undici`)

## 2. The map

Built from the probe (`scripts/probe.mjs`, raw output `raw/probe.log`). The probe ran each path in a fresh process of the target Node against a loopback TLS server that offers h2 and http/1.1, with the real preload text taken from `supervisor.ts` and the plan's Task 2 line applied to it. "main" means undici 7.30.1 as LLMR's undici. "Task 2" means 8.13.1 with the flag, and "no flag" means 8.13.1 without it. Rows are **run** unless marked. A row that holds for any Node 24 holds for Docker and for the desktop app today.

| Path | Desktop today (Electron 45 = Node 24.22.3; gateway child on system Node 24 or Electron) | CLI Node 24 | CLI Node 26 (or desktop gateway child on system Node 26) | Docker (Node 24) |
|---|---|---|---|---|
| **Provider calls, gateway `Yr`, timeout > 0 (default), no proxy** | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 |
| **Provider calls, upstream proxy set (undici 6 ProxyAgent)** | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 |
| Provider calls, `API_TIMEOUT_MS` 0 and no proxy (gateway uses global `fetch`) | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 | **2.0 / 2.0 / 2.0** (already h2 on main) | 1.1 / 1.1 / 1.1 |
| Core direct requests, no proxy (`fetchWithSystemProxy`) | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 | 1.1 / **2.0 / 2.0** | 1.1 / 1.1 / 1.1 |
| Core direct requests, proxy set | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 |
| Gateway-child Node `fetch` (auth hook token refresh, gateway side calls), no proxy | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 | **2.0 / 2.0 / 2.0** (already h2 on main; the probe's "timeout 0, hook loaded" rows) | 1.1 / 1.1 / 1.1 |
| Fusion MCP child, proxy set, outside host (the preload) | 1.1 / 1.1 / **2.0** | 1.1 / 1.1 / **2.0** | 1.1 / 1.1 / **2.0** | 1.1 / 1.1 / **2.0** |
| Fusion MCP child, no proxy (plain Node `fetch`) | 1.1 / 1.1 / 1.1 | 1.1 / 1.1 / 1.1 | **2.0 / 2.0 / 2.0** (already h2 on main) | 1.1 / 1.1 / 1.1 |

Each cell is main / Task 2 as planned / Task 2 without the flag.

Notes on the table:
- Desktop fusion children run on Electron's Node 24.22.3, so the Node 26 column applies to them only after LLMR moves to Electron 46. **inferred** from `fusion-config.ts:143`.
- Why the core row differs on Node 26: undici 7.30.1's `lib/global.js` sets **both** the v1 and the v2 symbol to its own h1 Agent when it loads (lines 10-30, **read**). Node 26's fetch reads v2, so on `main` it finds undici 7's Agent and speaks 1.1. undici 8 sets v2 to `new Agent()` with `allowH2` on, so after Task 2 Node 26's fetch speaks 2.0. On `main` this depends on order: if Node's own fetch initialised first, it would keep its own h2 Agent. **inferred**. In the core process LLMR's undici is imported when the bundle loads, before any fetch. **inferred**
- In the gateway child on Node 26, undici 6 loads first and sets only v1, so Node's fetch builds its own h2 Agent. That is already h2 on `main`. **run**

What this means:
- The SSE traffic the question is about is HTTP/1.1 in every column and every state. The flag does not touch it. Moving it to HTTP/2 needs a change in the gateway fork, not in LLMR. **run** + **read**
- HTTP/2 already reaches providers today from `main` on Node 26, for short requests only: the gateway child's own Node `fetch` calls, the fusion children without a proxy, and the gateway's provider calls if `API_TIMEOUT_MS` is 0. **run**

## 3. Providers (run unless marked)

ALPN with `openssl s_client -alpn h2,http/1.1` and `curl --http2`, no key, no body. SETTINGS from a `node:http2` session that opened and closed without a request (`scripts/settings-probe.mjs`). Settings the server did not send show Node's defaults, so `enablePush` and the 4294967295 values are not the server's.

| Host | ALPN offered h2 first | ALPN offered http/1.1 first | Front | MAX_CONCURRENT_STREAMS | INITIAL_WINDOW_SIZE |
|---|---|---|---|---|---|
| api.anthropic.com | h2 | h2 | cloudflare | 256 | 65536 |
| api.openai.com | h2 | h2 | cloudflare | 256 | 65536 |
| generativelanguage.googleapis.com | h2 | h2 | Google | 100 | 1048576 |
| openrouter.ai | h2 | h2 | cloudflare | 256 | 65536 |
| chatgpt.com (Codex OAuth upstream) | h2 | h2 | cloudflare | 256 | 65536 |
| api.groq.com, api.together.xyz, api.mistral.ai, api.x.ai | h2 | (not checked) | cloudflare | 256 | 65536 |
| api.deepseek.com | h2 | h2 | CloudFront / ELB | 128 | 65536 |
| api.fireworks.ai | h2 | h2 | (none shown) | 128 | 65536 |

- Every host picks h2 even when the client lists http/1.1 first. undici 8 lists http/1.1 first unless `preferH2` is set (`connect.js:98`, **read**). So with `allowH2` on, undici 8 would get h2 from all of them. **run** + **read**
- Cloudflare's client-side connection idle timeout is 400 s for both HTTP/1.1 and HTTP/2, not configurable. Its origin-side Proxy Read Timeout is 125 s. **read** https://developers.cloudflare.com/fundamentals/reference/connection-limits/
- Anthropic: use streaming for long requests. "Some networks might drop idle connections"; the SDK sets TCP keep-alive. Nothing on HTTP/2. **read** https://platform.claude.com/docs/en/api/errors. Streams carry `ping` events. **read** https://platform.claude.com/docs/en/build-with-claude/streaming
- OpenRouter sends `: OPENROUTER PROCESSING` comments to keep connections open. **read** https://openrouter.ai/docs/api-reference/streaming
- Gemini: "the server bounds requests: 10 min unary, 20 min streaming", from a comment in Google's js-genai source. **read** https://github.com/googleapis/js-genai/blob/main/src/_api_client.ts
- No provider documents HTTP/2, stream limits or idle timeouts for its API (not found by the delegate; I did not search further).

## 4. What the official clients do (read, spot-checked)

- anthropic-sdk-typescript and openai-node use the global `fetch` and set no dispatcher (`src/internal/shims.ts:12` in both). In Node they inherit whatever the global dispatcher negotiates: HTTP/1.1 on Node 24 and HTTP/2 on Node 26. https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/internal/shims.ts (I read lines 8-16), https://github.com/openai/openai-node/blob/main/src/client.ts
- anthropic-sdk-python and openai-python use httpx2 with `http2=False` by default, with pools of 1000 connections and 100 keep-alive. https://github.com/anthropics/anthropic-sdk-python/blob/main/src/anthropic/_base_client.py, https://github.com/pydantic/httpx2
- openai-python closed "Consider enabling HTTP2 by default" (#3476) as NOT_PLANNED on 2026-10-26. The stated reason is to stay aligned with HTTPX2, where HTTP/2 is opt-in. https://github.com/openai/openai-python/issues/3476 (I checked the state with `gh`)
- Codex CLI uses reqwest 0.12 with default features, which include `http2`, so it negotiates h2 by ALPN. It forces HTTP/2 only for gRPC. https://github.com/openai/codex/blob/main/codex-rs/http-client/src/client_builder.rs. Open issue #24545: api.openai.com picks h2, which breaks a WebSocket Upgrade unless HTTP/1.1 is forced. https://github.com/openai/codex/issues/24545
- Claude Code documents no HTTP version. Its changelog has "Fixed supervised and background sessions crashing when a server closed an HTTP/2 connection with a GOAWAY while requests were in flight", so some of its traffic is HTTP/2. https://code.claude.com/docs/llms-full.txt (I grepped the line myself)

## 5. undici 8 and Node (read, top claims spot-checked with gh)

- HTTP/2 is on by default from undici 8.0.0: PR #4828, "feat!: enable h2 by default", merged 2026-03-06. https://github.com/nodejs/undici/pull/4828. The Client docs call it "Stability: 2 - Stable". https://github.com/nodejs/undici/blob/v8.14.0/docs/docs/api/Client.md
- Defaults in 8.13.1 (`lib/dispatcher/client.js:330-342`, **read**): `maxConcurrentStreams` 100, `pingInterval` 60 s, `connectionWindowSize` 512 KiB, `initialWindowSize` 256 KiB. The h2 options moved under `h2Options` in 8.10.0.
- GOAWAY: streams at or below `lastStreamID` keep running, and requests that never started a response are replayed once (`client-h2.js:57-61`, `onHttp2SessionGoAway` at 727, **read**). The release notes show GOAWAY fixes in 8.2.0, 8.6.0, 8.7.0, 8.11.0 and 8.12.4. Dispatcher.md still warns that a request may hang on GOAWAY. https://github.com/nodejs/undici/releases
- Before the server's SETTINGS frame arrives, undici sends one request and holds the rest (`client-h2.js:380`, **read**). That is where the cold-burst penalty in the measurements comes from.
- Open issues that match this workload (state checked with `gh`):
  - #6106: "Client never recovers when a request is dispatched during session teardown". The reporter was streaming Anthropic-style SSE for hours on Node 26.12.1 (bundled undici 8.12.2). Every later request to that origin failed in about 1 ms until a restart. https://github.com/nodejs/undici/issues/6106
  - #6149: a session Node resets for memory (ENHANCE_YOUR_CALM) stays in the pool and fails every later request. All the streams share one 10 MB `maxSessionMemory`. https://github.com/nodejs/undici/issues/6149
  - #6143: aborting a fetch on an established session causes an uncaught "socket idle timeout" later. https://github.com/nodejs/undici/issues/6143
  - #6181 and #6187: OOM in `Http2Session::CopyDataIntoOutgoing` after an abort with the body still queued. Node fixed it in nodejs/node#67372, which is not released in v24 or v26. https://github.com/nodejs/undici/issues/6181
- The latest release is 8.14.0, from 2026-11-27. It is inside the `~/.npmrc` two-day cooldown today, so `^8.13.1` resolves to 8.13.1 until then. **run** (`gh release list`)
- Node 26 negotiates h2 in its built-in fetch from 26.0.0 (undici 8.0.2, nodejs/node#62384). The changelog only says undici was updated. https://github.com/nodejs/node/pull/62384. Node 26.13.1 (LTS) bundles 8.12.4, so it has none of the 8.13.1 and 8.14.0 h2 fixes. Node 24 stays on undici 7 until it reaches end of life on 2028-04-30. https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- Middleboxes: Palo Alto can strip ALPN to force HTTP/1.1. Zscaler downgrades non-browser CONNECT traffic to HTTP/1.1. Netskope and FortiGate need HTTP/2 enabled or let admins force a protocol. A client that wants HTTP/2 must fall back cleanly. https://docs.paloaltonetworks.com/pan-os/11-1/pan-os-admin/app-id/http2, https://help.zscaler.com/zia/configuring-ssl-inspection-policy, https://docs.fortinet.com/document/fortigate/7.0.0/new-features/710924
- RFC 9113 §2 says TCP head-of-line blocking is not addressed, and §9.1 says clients SHOULD NOT open more than one connection per origin. So every stream to a provider shares one TCP connection's fate. https://www.rfc-editor.org/rfc/rfc9113

## 6. Measurements (run)

Setup: undici 8.13.1 `fetch` with `new Agent({ allowH2, connect: { ca } })` or `new ProxyAgent({ allowH2, requestTls: { ca }, uri })`, on Node 24.22.3, macOS, 12 cores. Load average was 2.1 before and 3.4 after. The machine was not idle and I could not quiet it, so the runs interleave h1 and h2: each repetition flips the order, and every run gets a fresh server process and a fresh client process. The server is `http2.createSecureServer({ allowHTTP1: true })` and sends SSE with 200-byte events, 30 events at 100 ms each (about 3 s per stream). It counts TLS connections and reports which connection served each request (`x-conn`). The client counts events and records every error. The delay relay adds 20 ms each way per chunk to emulate a 40 ms RTT. It emulates latency only, not loss or bandwidth.

What limits each number:
- Batch time is set by the server's pacing (29 × 100 ms ≈ 2.9 s). Neither protocol can change it, and none did: 2935 to 3088 ms everywhere.
- Loopback first byte is limited by client CPU: TLS handshakes and connection setup. This is the hardware cost, not network cost.
- Relay first byte is limited by round trips: TCP + TLS 1.3 + request ≈ 2.5 RTT cold.
- Errors: no case without a fault had a failed stream (0 in 270 runs). Every run checked that the streams arrived: events counted per stream, `x-proto` read from the server.

### Throughput and first byte, loopback (median of 7 runs, range in brackets)

| Case | Proto | First byte, median stream (ms) | First byte, slowest stream (ms) | TLS connections | Client CPU (ms) |
|---|---|---|---|---|---|
| 1 stream, cold | h1 | 16.8 (16.5-17.2) | 16.8 | 1 | 94 (90-97) |
| 1 stream, cold | h2 | 15.8 (15.6-20.4) | 15.8 | 1 | 45 (41-49) |
| 8 streams, cold | h1 | 13.5 (13.3-13.9) | 20.7 (19.8-21.0) | 8 | 130 (115-140) |
| 8 streams, cold | h2 | 11.2 (10.0-12.0) | 16.7 (16.1-17.3) | 1 | 86 (78-88) |
| 32 streams, cold | h1 | 24.0 (23.5-24.8) | 30.7 (30.0-31.3) | 32 | 257 (243-277) |
| 32 streams, cold | h2 | 11.3 (11.1-11.4) | 17.2 (17.0-17.3) | 1 | 161 (140-174) |
| 8 streams, warm | h1 | 6.8 (6.5-8.7) | 8.1 (7.6-11.0) | 8 | 101 (85-128) |
| 8 streams, warm | h2 | 2.1 (2.0-2.6) | 2.6 (2.5-3.2) | 1 | 69 (46-78) |
| 32 streams, warm | h1 | 20.3 (19.8-24.6) | 27.3 (26.7-28.1) | 32 | 242 (204-260) |
| 32 streams, warm | h2 | 4.3 (4.1-4.6) | 5.5 (5.1-7.4) | 1 | 138 (100-157) |
| 128 streams, cold (5 runs) | h1 | 98.7 (95.9-101.9) | 126.6 | 128 | 608 (562-681) |
| 128 streams, cold (5 runs) | h2 | 18.7 (18.1-22.0) | 22.7 | 2 | 293 (230-311) |

### Emulated 40 ms RTT (delay relay, median of 7 runs)

| Case | h1 first byte, median stream (ms) | h2 first byte, median stream (ms) |
|---|---|---|
| 1 stream, cold | 104.5 (103.3-108.7) | 103.9 (102.4-108.3) |
| 8 streams, cold | 105.1 (102.6-110.0) | **141.0** (139.4-148.0) |
| 32 streams, cold | 114.2 (111.6-119.5) | **144.6** (143.0-145.8) |
| 1 stream, warm | 44.1 (43.0-44.6) | 44.0 (43.1-44.3) |
| 8 streams, warm | 96.2 (92.2-97.3) | **46.0** (44.8-46.6) |
| 32 streams, warm | 115.5 (110.8-116.1) | **49.8** (47.8-50.3) |

- Cold bursts: h2 is about 1 RTT slower, because undici sends one request and holds the rest until the server's SETTINGS frame arrives (`client-h2.js:380`, **read**). h1 opens every connection in parallel.
- Warm bursts: h2 saves the connections h1 still has to open, 50 to 65 ms here. A warm single stream is the same on both.
- The "warm" numbers in `raw/perf.jsonl` and `raw/rtt.jsonl` are void. In that first pass, the warm-up request and the batch ran back to back in one tick, so undici had not returned the connection to its pool and h1 opened a new one. `scripts/reuse-check.mjs` shows reuse working with a 20 ms gap. The warm rows above come from the rerun, `raw/perfwarm.jsonl` and `raw/rttwarm.jsonl`.
- When the server caps MAX_CONCURRENT_STREAMS at 8 and 32 streams start, undici 8 opens 4 connections and does not queue behind long streams. First byte was 15.6 ms (h2) against 24.1 ms (h1), 5 runs each.
- Does it matter? LLM time to first token is hundreds of milliseconds to seconds, so 50 ms is a few percent of what a user waits for, and only on concurrent warm bursts. **inferred**. Loopback and the relay hide loss: on a lossy link HTTP/2's shared TCP connection stalls every stream on each loss, and h1 stalls one (RFC 9114 §1.1). Nothing here measures that.

### Faults (8 concurrent streams, 5 runs each, the same in every run)

| Fault, injected at event 10 of stream 0 | h1: streams that finished | h2: streams that finished | h2 error the others saw | Next request |
|---|---|---|---|---|
| Server destroys the connection | 7 of 8 | **0 of 8** | `UND_ERR_SOCKET` "other side closed" on all 8 | ok on both, new connection |
| Server resets one stream (h2 RST_STREAM INTERNAL_ERROR; h1 has no equivalent, so its socket is destroyed) | 7 of 8 | 7 of 8 | only the reset stream: `ERR_HTTP2_STREAM_ERROR` | h2 reuses the connection |
| Client aborts one stream at 1 s | 7 of 8 | 7 of 8 | only the aborted one: `AbortError` | h2 reuses the connection; h1 had to open a new one |
| Server GOAWAY NO_ERROR (graceful) | n/a, 8 of 8 | 8 of 8 | none | new connection |
| Server GOAWAY with ENHANCE_YOUR_CALM (11) | n/a, 8 of 8 | **0 of 8** | `ERR_HTTP2_SESSION_ERROR` "Session closed with error code 11" on all 8 | ok, new connection |
| Server `session.close()` | n/a, 8 of 8 | 8 of 8 | none | new connection |
| 1 or 3 streams offered 4 MB each with the reader stopped | 8 of 8 | 8 of 8 | none; the 5 to 7 live streams finished on time (batch 2949-2969 ms) | ok |

- Through a loopback CONNECT proxy (undici 8 `ProxyAgent`, h2 inside the tunnel) the results were the same for destroy, reset, abort, GOAWAY and both stall cases, 5 runs each (`raw/proxyfaults.jsonl`).
- An error-coded GOAWAY ends every stream, including the ones the server had accepted. RFC 9113 §6.8 lets those finish. That comes from how Node's http2 session handles a GOAWAY with an error code, not from undici: the error text is Node's `ERR_HTTP2_SESSION_ERROR`. **inferred** from the error code. Real servers send coded GOAWAYs when overloaded or abused, so under h2 one such event drops every agent's stream to that provider.
- Stalled readers did not starve their siblings at undici's default windows (256 KiB per stream, 512 KiB per connection). Three held streams together are past the connection window, so the connection-level window must be refilled as data arrives, not when it is read. **inferred**. Go has open issues on this hazard (golang/go#54330), so it is real in other stacks.

## 7. Options

| Option | What a user notices | Failure modes | Work and tests | When it is the right choice |
|---|---|---|---|---|
| **(a) Keep HTTP/1.1 everywhere LLMR controls (the plan), with the plan text corrected** | Nothing. Every provider stream stays as it is today. On Node 26, LLMR's short direct requests switch to h2 unless (a+) below is done. | Today's: one TCP+TLS handshake per concurrent stream, and more client CPU (about 1.6× to 2× here). | Plan text only (section 8). The flag stays. Optional: a Node 26 probe in CI. | Now. The SSE path is h1 whatever LLMR sets, and the h2 client has open bugs for this workload. |
| (a+) (a) plus `setGlobalDispatcher(new Agent({ allowH2: false }))` from LLMR's undici in the core and hook bundles | Same as (a), and Node 26 also keeps LLMR's own requests on h1. | New code that owns the global dispatcher. It must keep undici 8's default timeouts and limits, and must load before anything calls fetch. | One call, a test asserting the protocol on Node 26 (CI runs Node 24, so it needs a Node 26 job or a scratch probe). | Only if the owner wants Node 26 to match Node 24 exactly. These are short requests, and Node 26 already sends the gateway's own and the fusion children's side requests over h2 on `main`, so I would not. |
| (b) Allow HTTP/2 by default | Dropping the flag changes only the fusion children behind a proxy. Real h2 for provider streams needs the gateway fork to send `Yr` through an undici 8 (or undici 6 `allowH2`) dispatcher. Then: slightly faster first byte on warm concurrent bursts (about 50 ms at 40 ms RTT), fewer handshakes. | One connection reset or coded GOAWAY ends every live agent stream to that provider (measured). Open undici bugs #6106 and #6149 leave a dead session that fails every later request until restart. TLS-inspecting proxies downgrade or break h2. Node 26's bundled undici 8.12.4 lacks the 8.13.1 and 8.14.0 fixes. | A fork change and release (`jrmatherly/llmr-gateway`, which needs Jason's word). A pinned undici ≥ 8.14.0 inside the fork, not Node's fetch. Fault tests for reset, GOAWAY and abort. A real-provider soak test. | When #6106 and #6149 are fixed in a release, a soak against a real provider shows no dead sessions, and a real-network measurement shows a gain users notice. |
| (c) HTTP/1.1 by default, with a setting or env var to allow HTTP/2 | Nothing until set. With it set, as in (b). | As (b), for those who opt in. Two code paths to support and test. The setting must reach the gateway child and the fork. | (b)'s fork work, plus config plumbing (config schema, `createGatewayProcessEnv`, UI), plus tests for both values. | When a user with many concurrent agents reports a cost of HTTP/1.1 (handshake rate limits, connection caps on a corporate proxy). Nobody has. |
| (d) Pin HTTP/1.1 explicitly in the gateway fork too | Nothing today. | It prevents a silent switch: if the fork moves off undici 6 to undici 8, or starts to use Node 26's fetch, provider streams turn h2 with no LLMR change. | One option in the fork's dispatcher, recorded as a cross-repo coupling. | Whenever the fork's undici changes. Worth noting now. |

## 8. Plan gaps, with text to put in

1. "What the prototypes found", undici 8, the HTTP/2 bullet is wrong about scope. Replace:
   > HTTP/2: the gateway fetch preload in `supervisor.ts` is the only path where undici 8 changes the protocol. Its `Agent` and `ProxyAgent` speak HTTP/2 to a TLS server that offers it, through a proxy tunnel too. `allowH2: false` keeps HTTP/1.1 on both, which is what `main` does on every path.

   with:
   > HTTP/2: provider calls, streamed or not, do not pass through LLMR's undici. The gateway sends them with its own nested undici 6.29.1 (`fetch` plus a timeout dispatcher over its global dispatcher, or its own `ProxyAgent`), and they stay on HTTP/1.1 on Node 24 and Node 26 whatever this task does (research run, `private/research/2026-11-28-major-updates/http2/`). The fetch preload in `supervisor.ts` runs only in the fusion MCP servers (`fusion-config.ts:142`), and only when an upstream proxy is set (`config-compiler.ts:88`). There, undici 8's `Agent` and `ProxyAgent` speak HTTP/2 to a TLS server that offers it, through a tunnel too, and `allowH2: false` keeps HTTP/1.1. Its `LLMR_UPSTREAM_TIMEOUT_MS` branch is set only by tests.
2. The same section, the "Loading undici 8 anywhere" bullet holds only on Node 24. Replace:
   > Loading undici 8 anywhere replaces the global dispatcher behind Node's fetch with a wrapper around an undici 8 `Agent`. It stays on HTTP/1.1. No product code calls `setGlobalDispatcher`.

   with:
   > Loading undici 8 anywhere sets both global dispatcher symbols: the v2 one to an undici 8 `Agent` with HTTP/2 allowed, and the v1 one to a `Dispatcher1Wrapper` that forces HTTP/1.1. Node 24 (and Electron 45) read v1, so their fetch stays on HTTP/1.1. Node 26 reads v2, so on Node 26 every `fetchWithSystemProxy` call without a proxy moves from HTTP/1.1 to HTTP/2 with this task (research run). On `main` it is HTTP/1.1 there only because undici 7 also seeds v2 with its own Agent. No product code calls `setGlobalDispatcher`.
3. Review Focus, a new item 6:
   > 6. **Node 26 and HTTP/2 on LLMR's own requests.** After this task, on Node 26, token refresh, the pricing catalog, provider probes, marketplace and icon fetches and media artifact downloads negotiate HTTP/2 with every provider that offers it. Provider model calls do not change. The desktop app is on Node 24 until Electron 46. Check: the PR body says so; the owner decides whether to pin it (`setGlobalDispatcher(new Agent({ allowH2: false }))`) or accept it.
4. Task 2 Step 7, the comment the step asks for. Replace "It says that undici 8 negotiates HTTP/2 over TLS by default, and upstreams have always been reached over HTTP/1.1." with:
   > It says that undici 8 negotiates HTTP/2 over TLS by default, and the fusion MCP servers have always reached outside hosts through the proxy over HTTP/1.1.
5. Task 2 Step 9, PR body. Add after "the e2e job is the only check that undici 8 loads in the Electron main process":
   > It also states, under "Not in this PR", that the gateway's provider calls use the gateway's own undici 6 and stay on HTTP/1.1, so a future gateway bump that moves it to undici 8 or to Node's fetch will turn them to HTTP/2 unless it sets `allowH2: false`; and that `LLMR_UPSTREAM_TIMEOUT_MS` is read by the preload and set by nothing outside its unit test.
6. Step 1's `^8.13.1` floor is fine. 8.14.0 (2026-11-27) carries more h2 fixes, but that matters only if h2 is ever turned on.


## 9. Not checked

- No real provider was measured with a request. The latency numbers are loopback and an emulated delay relay with no loss, so they show round-trip and CPU effects only, not TCP loss or head-of-line blocking.
- The desktop app, Electron's main process and the packaged gateway were not run. Electron's Node version comes from the release feed, not a run.
- The probe emulates the gateway's `Yr`, `ql` and `Nl` from the bundle text. It did not run the gateway (the plan forbids loading it). The probe used undici 6.29.1 from the gateway's own `node_modules`, the same copy the gateway uses.
- Corporate TLS-inspecting proxies: none tested. All proxy runs used a loopback CONNECT proxy.
- I did not verify every issue and release-note claim in sections 4 and 5. I spot-checked these with `gh`, `curl` or the source: PR 4828; issues 6106, 6149, 6143, 6181; openai-python 3476; the Claude Code GOAWAY changelog line; the Anthropic TS shim; the Electron Node versions; and the undici 8.13.1 defaults and wrapper in the installed source. The rest is the delegates' reading.
- Node 26's own undici 8.12.4 was not benchmarked. The h2 measurements use undici 8.13.1 from npm.
- Order dependence on Node 26 `main` (whether Node's fetch could initialise before LLMR's undici 7 loads in the core) is inferred, not run in the real bundle.

## Files

- `scripts/server.mjs`: TLS h2 + h1 SSE server with fault injection, CONNECT proxy and delay relay.
- `scripts/client.mjs`: one batch of N streams.
- `scripts/run.mjs`: suites `perf`, `rtt`, `perfwarm`, `rttwarm`, `faults`, `proxyfaults`, `mcs`, run as `U8=<undici8 dir> node run.mjs <suite> <reps> <out.jsonl>`.
- `scripts/summarize.mjs`: makes the tables.
- `scripts/probe.mjs`: the protocol map, run as `node probe.mjs <repo> <undici8 dir> <node bin>...`. It writes `preload-main.cjs` and `preload-task2.cjs` from `supervisor.ts`.
- `scripts/settings-probe.mjs`: provider SETTINGS. `scripts/reuse-check.mjs`: h1 pool reuse.
- The scripts need `cert.pem` and `key.pem` beside them, which are not copied here: `openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 3 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:h2.test,IP:127.0.0.1"`. undici 8.13.1 came from `npm install undici@8` in a scratch folder.
- `raw/`: every run as JSON lines, the logs, `probe.log` and `probe.json`, `summary-first-pass.md` (its warm rows are void, see section 6), `summary-warm.md`, and the uptime readings.
