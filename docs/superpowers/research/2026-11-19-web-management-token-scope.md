# What the web management token can do, and what limiting it would take

Research for open follow-up 4 in `docs/superpowers/upstream-review/reviews/2026-11-16-review.md`. Read-only; no code changed. Code state: `main` at `75562a9e`. This is a findings document, not a plan. The owner picks a direction first.

## Answer in short

- **The token is full control of the host account LLMR runs as, by several independent routes.** Five separate RPC paths run a command or load code, and one of them needs a single call with no saved config (`startBotGatewayQrLogin`). `testRouteScript` alone reads and writes any file the process can, returns the whole process environment, and fetches any URL.
- **Masking provider keys (PR 115) therefore protects against shoulder-surfing and a leaked response, not against a token holder.** `testRouteScript` can read `config.sqlite` directly.
- **The three paths in the follow-up are confirmed**, with two corrections: the probe path also sends the *local agent logins* (Codex, Claude Code, Claude apps gateway tokens) to a caller-chosen address with no masked reference involved, and `saveConfig` does not need to change an existing provider's URL, because a reference names the secret and can be placed in a new provider.
- **A destination check alone (direction c) is worth nothing until every code-running route is closed** (direction b), and direction b is large: at least nine config fields and three RPC arguments start a process or load a module.
- The existing exposure is narrow by default: the server binds `127.0.0.1` (`management-server.ts:129`), Docker keeps it on loopback behind Nginx (`Dockerfile:32`, `docker/entrypoint.sh:5`), and PR 114 rejects untrusted browser origins.

## How to read the labels

| Label | Meaning |
|---|---|
| **R** | Read in the code by the author of this document, at the cited lines. |
| **A** | Read by a research subagent and reported with a quoted line. Not re-read by the author. Treat as a lead until checked. |
| **RUN** | Executed during this research; the command is described. |
| **INF** | Inferred, not traced to the end. |

Paths are under `packages/core/src/` unless they start with another top-level folder. `ms.ts` is `web/management-server.ts`; `ps.ts` is `web/provider-secrets.ts`.

## Live verification (2026-11-19)

The shortest chains were run against `llmr serve --no-gateway` on `127.0.0.1`, with `HOME` and `LLMR_INTERNAL_HOME_DIR` set to a throwaway directory and a harmless marker command (`/usr/bin/touch`) or a local sink server standing in for an attacker. All results below are **RUN** against a dist rebuilt from `main` at `322c2bc8`.

| Chain | Result |
|---|---|
| `testRouteScript`, script reads a file and calls `api.env("LLMR_WEB_AUTH_TOKEN")` | Returned the file's contents and the management token. |
| `saveConfig` with a stdio MCP server, then `listMcpServerTools` | Ran the command (marker file created). |
| `probeProvider` with a saved-key reference and `baseUrl` `127.0.0.1:<sink>/v1` (no scheme) | The sink received the saved key as `authorization: Bearer` and `x-api-key` on `/v1/models` and `/v1/messages`. |
| Same with a leading space before `http://` | Same: the key reached the sink. |
| `testProviderAccountConnector` `http-json`, endpoint `␠http://127.0.0.1:<sink>/acct` | The sink received the key as `authorization: Bearer`. |
| `saveConfig` adding a second provider at the sink's address that carries the first provider's reference | Accepted (HTTP 200); both providers hold the same reference. |

`startBotGatewayQrLogin` with `command: /usr/bin/touch` also created its marker, but only on the stale build described next; its source is unchanged by PR 115 and was re-read (R).

**Stale-build hazard.** The `dist/` on this checkout before the rebuild (built 2026-11-18 19:31, before `75562a9e`) still contained a probe address check that was written and then removed inside PR 115: probes failed with "A saved provider credential can only be sent to its own provider's address." `git log -S` finds that message in no commit under `packages/core/src`, so it never reached `main`. A live check run without `npm run build:assets` first reports a guard that does not exist. After the rebuild, restore the generated files with `git checkout -- packages/core/models.json packages/ui/src/generated`.

## Part 1. Every handler in `rpcHandlers`

`rpcHandlers` is `ms.ts:289-519` and has 69 entries (RUN: counted with grep over those lines). Every call needs the token (`ms.ts:235`) and a trusted or absent browser origin (`ms.ts:239`). Responses pass through `redactWebRpcValue`, which masks only inside an object that has a `Providers` array, and there only `Providers`, `providerPlugins` and `toolHub` (`ps.ts:8`, `ps.ts:71-82`) (R).

Gain column: **CMD** starts a process or loads code the caller chooses. **FILE** reads or writes a caller-chosen path. **SEND** sends a saved secret to a caller-chosen address. **READ** returns a secret. **NET** fetches a caller-chosen URL from the host with no saved secret. **OPEN** opens a URL on the host. **HOST** changes host state with fixed inputs. **none** is nothing beyond its stated job.

### Handlers that give the host away

| Handler | `ms.ts` | Gain | How |
|---|---|---|---|
| `startBotGatewayQrLogin` | 494 | **CMD**, one call | Takes `request.config.botGateway` from the argument, not saved config (`agents/bot-gateway/qr-login-service.ts:52-53`). `bot.command`, `args`, `cwd` go to the SDK client (`:199-205`, `:183-191`), which spawns them (`node_modules/@the-next-ai/bot-gateway-sdk/dist/index.js:223`). Only guard: `enabled`, platform `weixin-ilink`, auth `qr_login` (`:54`). Also `mkdirSync` on a caller-influenced state dir (`:58-59`). The child inherits all of `process.env` (`:186`), including `LLMR_WEB_AUTH_TOKEN`. (R) |
| `testRouteScript` | 510 | **FILE**, **READ**, **NET**, then **CMD** | Runs `request.script.source` from the argument (`gateway/application/gateway-service.ts:467-480`) in a worker with plain `node:vm` (`routing/route-script-worker.ts:35`). The bridge exposes `fs.readText`/`fs.writeText` on any path (`:175-188`, `:286-308`), the whole `process.env` (`:48`, `:204-207`) and `fetch` of any http(s) URL (`:152`, `:209-232`). Output returns to the caller. Writing a `.js` file and then pointing `CUSTOM_ROUTER_PATH` or a plugin `module` at it makes it **CMD**. (R) |
| `saveConfig` | 452 | **CMD**, **FILE**, **SEND**, **HOST**, **READ** | Stores an arbitrary `AppConfig` (`config/config.ts:391`). See Part 2 for each field that starts a process, loads a module, writes a file or moves a key. Returns the config, masked only in the three fields. (R) |
| `applyClaudeAppGateway` | 290 | same as `saveConfig` | Saves the config in its argument (`ms.ts:292`), restores references the same way (`ms.ts:275`). (R) |
| `listMcpServerTools` | 373 | **CMD** (after `saveConfig`) | Spawns the saved server's `command`, `args`, `cwd`, `env` (`mcp/tool-discovery.ts:58-60`). No allow-list in normalisation (`config/config.ts:2495-2503`). Only `LLMR_*TOKEN/SECRET/PASSWORD/API_KEY` names are stripped from the inherited env (`mcp/child-env.ts:3`). (R) The child's stderr tail returns in the error (A). |
| `startGateway`, `restartGateway`, `restartProxy` | 496, 423, 430 | **CMD** (after `saveConfig`), **HOST** | Gateway start loads every configured plugin module with `import()` (`plugins/service.ts:976-980`; called from `gateway-service.ts:185`, A) and applies profiles (file writes, Part 2). `saveConfig` already restarts the gateway when `plugins` changed (A: `gateway/runtime-change.ts`), so these are not needed for the chain. |
| `openProfile` | 407 | **CMD** (after `saveConfig`) | Spawns the profile's app. The executable comes from `profile.appPath` with `allowGenericExecutable: true`; on macOS and Linux any existing file passes (`agents/claude-app/launch.ts:77`, `:162`, `:249-259`). (A) |
| `openProfileInTerminal` | 416 | **CMD**, macOS only | Writes `<bin>/llmr-open-<slug>.command` and opens it (`profiles/launch-service.ts:125-147`). The wrapper it runs embeds `profile.env` and binary paths from config. (A) |
| `applyProfile`, `getProfileOpenCommand` | 323, 357 | **FILE** (after `saveConfig`) | `applyProfileConfig` writes agent config files and wrapper scripts from saved config; see Part 2. `getProfileOpenCommand` returns only `llmr <profile> [app]` (`profiles/launch-core.ts:98`). (A) |
| `testProviderAccountConnector` | 509 | **SEND**, **NET** with read-back | Part 2. Returns the fetched JSON body whole (`providers/account-service.ts:250-257`), so it reads any JSON endpoint the host can reach, including loopback and cloud metadata. (R) |
| `probeProvider`, `probeProviderCandidates`, `checkProviderConnectivity` | 418, 419, 326 | **SEND**, **NET** | Part 2. Results carry status and an upstream message, not the body. (R for the send; A for the result shape) |
| `getOpenRouterProviderCatalog` | 361 | **SEND**, **NET** | Part 2. (R) |
| `getProviderAccountSnapshots` | 359 | **SEND** (after `saveConfig`) | Sends each saved provider's key, or the local agent login for a marker provider, to the saved connector endpoints (`account-service.ts:127-153`, `:697-739`, `:1685-1706`). (R) |
| `installProxyCertificate` | 372 | **HOST** | macOS: `osascript … with administrator privileges` adding the LLMR CA to the System keychain as a trusted root; Windows: `certutil -user -addstore Root` with no prompt in the code (`proxy/service.ts:422-456`, `:1632-1672`). Fixed inputs. In web mode the in-app consent defaults to approved (`:483`). (A) |
| `getConfig`, `saveApiKeys` | 345, 443 | **READ** | Return the config with everything in Part 3 in clear. `saveApiKeys` also replaces the client key table. (R) |
| `getRequestLogDetail`, `getRequestLogBodyChunk`, `getRequestLogs`, `getAgentAnalysis`, `getAgentTracePayload` | 366, 367, 368, 342, 343 | **READ** (content) | Stored request and response bodies, tool inputs and results, unredacted; headers redacted at capture. Part 3. (A) |
| `getProxyNetworkCaptures` | 364 | **READ** (content) | Bodies of intercepted traffic up to 256 KB each, unredacted; headers redacted. Part 3. (A, partly R) |
| `exportData` | 340 | **FILE** (fixed path) | Writes the unredacted config and base64 of every sqlite file to `~/Downloads/llm-router-data-<ts>.json`, mode 0600, and returns only the path (`ms.ts:888-916`). Readable afterwards through `testRouteScript`. (R) |

### Handlers with limited reach

| Handler | `ms.ts` | Gain | Note |
|---|---|---|---|
| `openBuiltInBrowser`, `openBotGatewayQrWindow` | 394, 385 | **OPEN** | `http:`, `https:` or `llmr://plugin…` only (`ms.ts:1535-1553`), passed to `open`/`rundll32`/`xdg-open` as one argument (`ms.ts:1513-1525`). (R) The `llmr://plugin` handler is Electron-only (A). |
| `selectPluginDirectory` | 488 | **FILE** (read, narrow) | Parses `plugin.json` and `package.json` in any directory and returns derived fields (`name`, `main`, `dependencies`, paths), not raw content (`ms.ts:970-1003`). Executes nothing. (R) |
| `fetchProviderManifest` | 341 | **NET**, guarded | HTTPS only, refuses private and reserved addresses after DNS lookup (`providers/manifest-service.ts:40-42`, `:145`, `:239-248`), deletes `apiKey` (`:31`), result masked with `redactWebSecrets` (`ms.ts:276`). The one handler with a destination guard today. (R) |
| `detectProviderIcon` | 339 | **NET** | Fetches pages derived from `request.baseUrl` (`providers/icons.ts:16`, `:120`, `:169`). No key sent. Guarding not read. (R for the fetch, INF for the absence of a guard) |
| `startClaudeAppsGatewayLogin`, `waitClaudeAppsGatewayLogin`, `cancelClaudeAppsGatewayLogin` | 495, 518, 325 | **NET**, **FILE** (fixed) | Device login against `request.gatewayUrl` (`agents/claude-apps-gateway/device-login-service.ts:51`). Returns user code, email and models, no tokens (A). Where the session is stored was not read. |
| `waitBotGatewayQrLogin`, `cancelBotGatewayQrLogin`, `closeBotGatewayQrWindow` | 517, 324, 338 | none new | Act on a session `startBotGatewayQrLogin` made. Return no bot token (A). |
| `importLocalAgentProvider` | 371 | **READ**, one gap | Reads a local agent login into a provider; tokens masked by `redactWebSecrets`, except the OpenCode Gemini key under `query.key` (Part 3). (R for the gap) |
| `getLocalAgentProviderCandidates`, `probeLocalAgentProvider` | 354, 417 | none | Paths and key *names* of credential files, no values (`agents/local-providers/claude-code.ts:491`). (A) |
| `resetCodexRateLimitCredit` | 441 | **HOST** (account) | Sends the saved Codex login to a fixed endpoint and consumes a reset credit (`account-service.ts:314-340`). Fixed destination. (R) |
| `stopGateway`, `stopProfile`, `quitApp` | 503, 508, 420 | **HOST** | Stop the gateway (restoring agent config files from backup), kill tracked profile processes, SIGTERM self. (R for `quitApp`, A for the rest) |
| `setProxyNetworkCaptureEnabled`, `clearProxyNetworkCaptures` | 493, 337 | **HOST** | Turn body capture of intercepted traffic on or off, in memory. (A) |
| `revealProxyCertificate` | 437 | **HOST** | Reveals a fixed file in the file manager (`ms.ts:1501-1511`). (R) |
| `scanBotHandoffWifiTargets`, `scanBotHandoffBluetoothTargets` | 487, 486 | none | Run `arp -a`, `system_profiler` or PowerShell with fixed arguments; return nearby devices. (A) |
| `getServiceIdentity` | 347 | none | Returns booleans; confirms a full guess of `LLMR_SERVICE_INSTANCE_TOKEN` with a plain `===` (`ms.ts:350-352`). (R) |
| `getPluginMarketplace` | 356 | **FILE** (cache) | URL from an env var or a constant, not the caller; downloads listed modules to a cache dir after a sha256 check, runs nothing (`plugins/marketplace.ts:30-58`, `:246-284`). (A) |
| `resetOverviewStatistics`, `setOnboardingFinished` | 442, 489 | **HOST** | Clear usage statistics; set a flag. (R, by name and handler body only) |
| `getAppInfo`, `getGatewayStatus`, `getProxyStatus`, `getProxyCertificateStatus`, `getProfileRuntimeStatus`, `getOnboardingFinished`, `getProviderCatalogModels`, `getProviderPresets`, `getUsageStats`, `getUpdateStatus`, `updateCheck`, `updateDownload`, `updateInstall`, `validateRouteScript` | 344-369, 511-516 | none | File paths, status, catalog data. `validateRouteScript` only compiles (`route-script-worker.ts:39-40`). The update handlers return a constant or throw. (R for the handler bodies; A for `getProxyStatus` omitting the upstream password; `getProviderPresets` and `getUsageStats` outputs not read) |

## Part 2. The three paths, confirmed or corrected

### 2.1 A probe sends a saved key to the address in its request: confirmed, and wider than recorded

`restoreWebProbeSecrets` restores a reference under any credential-named key anywhere in the request (`ps.ts:86-103`, `ps.ts:123-125`; methods at `ms.ts:277`) (R). So the reference can sit in `apiKey`, in `connector.headers.authorization`, in `providerPlugins[].auth.headers.*` or `auth.query.token`. Where each handler then sends it:

| Handler | Destination field | Derivation in the sending code | Credential placement |
|---|---|---|---|
| `probeProvider` | `request.baseUrl` | `parseProviderBaseUrl` (`providers/url.ts:14-49`) via `parseProviderUrl` (`providers/probe.ts:1334-1336`); then `${candidate}/models`, `/v1/models`, `/responses`, `/chat/completions`, `/v1/messages`, `/messages`, Gemini paths (`probe.ts:595-653`, `:1345-1410`) | `authorization: Bearer`, `x-api-key`, `x-goog-api-key`, and `?key=` for Gemini (`probe.ts:1421-1461`) |
| `probeProviderCandidates` | `request.candidates[].baseUrl` | each candidate goes through `probeGatewayProvider` (`probe.ts:146-163`) | same |
| `checkProviderConnectivity` | `request.candidates[].baseUrl` | through `probeGatewayProviderCandidates` (`probe.ts:183-191`) | same |
| `testProviderAccountConnector`, `http-json` | `request.connector.endpoint` | passed **raw** to `fetch` (`account-service.ts:188`, `:2063`); not through `absoluteAccountEndpoint`, not trimmed by LLMR | `authorization` from `request.apiKey`, raw or `Bearer` (`:2057`); plus every entry of `connector.headers` (`:2043-2046`) |
| `testProviderAccountConnector`, `webcontent-json` | `request.connector.endpoint` against `request.baseUrl` | `absoluteAccountEndpoint` (`:1997`, `:2142-2155`) | Desktop only; throws in web mode (`providers/account-webcontent.ts:35-37`) |
| `getOpenRouterProviderCatalog` | `request.baseUrl` | `openRouterApiRoot`: trim, `new URL`, strip `/api/v1`, and **fall back to `https://openrouter.ai` when parsing fails** (`providers/openrouter-provider-catalog.ts:267-278`) | `authorization: Bearer` to `${root}/api/v1/activity`, only when `request.model` is set (`:57-60`, `:142-148`) |

All R.

**Correction 1: probes also send the local agent logins, with no reference.** The marker `llmr-local-agent-login` is never masked (`ps.ts:39`). A probe whose `apiKey` is the marker and whose `providerPlugins` holds an object with a `key` starting `llmr-local-agent-` gets:

- the Codex access token and account id, at any URL, when the key contains `codex-oauth` (`probe.ts:992-1009`: `hasLocalPlugin` skips the `isCodexProbeEndpoint` test; header set at `:1249-1256`, and `authHeader`/`authScheme` are fixed by LLMR, not the caller);
- the Claude Code OAuth token as `authorization: Bearer`, at any URL, when the key contains `claude-code-oauth` (`probe.ts:947-956`, `:973-975`, `providers/oauth-plugin.ts:3-7`);
- the Claude apps gateway session token for the gateway URL named in `providerPlugins[].claudeAppsGateway.url`, sent to the probe URL (`probe.ts:959-968`, `:977-984`).

All R. These are refreshable account logins, not API keys, and no destination test stands between them and the probe URL apart from the Codex endpoint test that the plugin key bypasses.

**The existing hook is a stub.** `providerApiKeySafetyIssue` and `providerEndpointCanReceiveProviderApiKey` are called before the probe (`probe.ts:328`), before the account fetch (`account-service.ts:2048`), on save (`config/config.ts:406`, `:569-644`) and when the gateway providers are built (`providers/runtime-topology.ts:155`). Both return `undefined` unconditionally (`providers/presets/utils.ts:51-62`, `:68-79`) (R). The call sites exist; the rule does not.

**Redirects (RUN).** No probe or account fetch sets `redirect` (grep over `probe.ts`, `account-service.ts`, `proxy/system-proxy-fetch.ts` found none). A local test on Node 24.22.3, one server answering 307 to a second origin: `authorization` was dropped, `x-api-key` and `x-goog-api-key` arrived at the second origin. So an allowed host that redirects passes Anthropic-style and Gemini-style keys onward.

### 2.2 `saveConfig` keeps a masked key while the address changes: confirmed, and the framing is too narrow

`restoreWebConfigSecrets` restores any known reference under any credential-named key inside `Providers`, `providerPlugins` and `toolHub` (`ps.ts:109-118`) (R). A reference is a keyed hash of the secret, not of its place (`ps.ts:10-14`, `:42`). So:

- changing `api_base_url` of the provider that holds the key works, as recorded;
- **Correction 2:** so does adding a *new* provider, credential, account connector header, plugin auth header or `toolHub.llm.apiKey` that carries the reference. A check that compares "this provider's URL before and after" misses all of these. The rule has to bind the secret, not the provider. (RUN for a new provider: see Live verification.)

Where a saved provider key is then sent, and the field each sender reads:

| Sender | Address field read | Key field read |
|---|---|---|
| Gateway runtime (`providers/runtime-topology.ts:149-150`, `:512-514`) | `capabilities[].baseUrl` first, else `baseurl \|\| baseUrl \|\| api_base_url`, through `normalizeProviderBaseUrl(value, protocol)` | `apikey \|\| apiKey \|\| api_key`, or a `credentials[]` entry |
| Save-time check hook (`config/config.ts:662-668`) | `api_base_url \|\| baseUrl \|\| baseurl` | `api_key \|\| apiKey \|\| apikey` |
| Account service (`account-service.ts:2190-2196`) | `api_base_url \|\| baseUrl \|\| baseurl` | `api_key \|\| apiKey \|\| apikey` |

All R. **The precedence is opposite between the gateway and the two others, and normalisation keeps all three spellings side by side** (`config/config.ts:1451-1458`). A provider saved with `api_base_url` pointing at the real host and `baseurl` pointing elsewhere passes any check written on the hook's reading while the gateway sends to the other. `capabilities[].baseUrl` overrides both and the hook does not look at it. What the gateway package (`@the-next-ai/ai-gateway`) does with `baseurl` after LLMR hands it over was not read.

Further saved destinations for a provider key:

- account connectors: `standard` endpoints through `absoluteAccountEndpoint` (`account-service.ts:2126-2139`), `http-json` `connector.endpoint` raw (`:739`), on the provider and on each `credentials[]` entry (R);
- `toolHub.llm.apiKey` with `toolHub.llm.baseUrl`, passed as environment to the Tool Hub process (`mcp/toolhub-config.ts:112-113`) (R);
- the upstream proxy: `proxy.upstream.custom` routes provider traffic through a caller-chosen proxy (`proxy/system-proxy-fetch.ts:31-46`). A proxy sees keys only for `http://` providers; HTTPS is tunnelled (INF);
- a marker provider with a connector: `getProviderAccountSnapshots` swaps in the local agent login and sends it to the connector endpoint (`account-service.ts:1685-1706`, `:1715-1757`) (R).

### 2.3 `saveConfig` plus `listMcpServerTools` runs a command: confirmed, and it is one of five routes

Confirmed as recorded (`ms.ts:373-384`, `mcp/tool-discovery.ts:58`, `config/config.ts:2495-2503`) (R). The other items the brief asked about:

| Item | Reach | Label |
|---|---|---|
| Route scripts (`testRouteScript`) | File read and write anywhere, full `process.env`, any fetch. Plain `node:vm` in a worker, not a security sandbox. No config needed. | R |
| Route scripts (`validateRouteScript`) | Compile only. | R |
| Route scripts saved in `Router.rules[].script` | Same bridge, run on gateway requests. | A (config parse), INF (request wiring) |
| `CUSTOM_ROUTER_PATH` | `require` of the file with full privileges (`gateway/llm-router-plugin.ts:251`). An absolute path is accepted anywhere; extension must be `.js/.cjs/.mjs` (`:263-290`). | R |
| Plugins (`plugins[].module`) | `import()` in the management process on every gateway start (`plugins/service.ts:976-980`). Gated by a `trusted-code` permission (`:527`) that is itself a field of the saved config (`config/config.ts:2675`). | R for the load and gate; A for the permission source |
| Plugins (`plugins[].coreGateway.plugins[]`) | Forwarded to the gateway child, which imports their `modulePath`. | A |
| `selectPluginDirectory` | Reads manifest JSON from any directory; executes nothing. | R |
| Tool Hub MCP servers (`toolHub.mcpServers`) | Not spawned by LLMR at start. Spawned by the separate Tool Hub process (`mcp/toolhub-mcp.ts:1299`) and by the gateway child for `agent.mcpServers`. | A; spawn timing not determined |
| Profile apply | Writes `profile.claudeSettings` (arbitrary JSON, no key allow-list, so `hooks`, `apiKeyHelper`, `statusLine`) into a caller-chosen `settingsFile`, default `~/.claude/settings.json`; writes wrapper scripts embedding `profile.env` and binary paths. The agent runs them later. | A |
| `openProfile` | Spawns `profile.appPath`; any existing file on macOS and Linux. | A |
| `openProfileInTerminal` | macOS: writes and opens a `.command` script. | A |
| `openBuiltInBrowser` | Opens an http(s) or `llmr://plugin` URL. No command injection: one argv element. | R |
| Proxy certificate handlers | Fixed commands; `installProxyCertificate` asks the OS for admin rights and trusts the LLMR CA system-wide. With `proxy.enabled` and `proxy.systemProxy`, `saveConfig` then sets the host's system proxy (`networksetup`, `reg.exe`), after which `getProxyNetworkCaptures` returns intercepted bodies. | A |
| `startBotGatewayQrLogin` | Spawns a command from its own argument. Not in the brief's list; the shortest route found. | R |

Config fields that start a process or load code, for direction (b): `agent.mcpServers[].command`, `toolHub.mcpServers[].command`, `plugins[].module`, `plugins[].coreGateway.plugins[]`, `plugins[].coreGateway.config` (INF), `CUSTOM_ROUTER_PATH`, `Router.rules[].script`, `profile.profiles[].appPath`, `profile.profiles[].env` and the binary-path keys in it, `profile.*.claudeSettings`, `profile.*.settingsFile`, `botGateway.command`, `botConfigs[].botGateway.command`. RPC arguments that do the same: `startBotGatewayQrLogin` `config.botGateway`, `testRouteScript` `script`, and any `saveConfig` body.

## Part 3. Secrets the web RPC still returns in clear

Returned by `getConfig` (`ms.ts:345`), `saveConfig` (`:484`) and `saveApiKeys` (`:450`). Types in `contracts/app.ts`.

| Field | Declared | Label |
|---|---|---|
| `APIKEY`, `APIKEYS[].key` (LLMR client keys; clear on purpose, `ps.ts:7`) | `app.ts:1863-1864` | R |
| `proxy.upstream.custom.password`, `.username` | `app.ts:823-827` | R |
| `agent.mcpServers[].env`, `.args`, `.apiKey`, `.headers`, `.url` | `app.ts:920-934` | R |
| `botGateway.credentials`, `botConfigs[].botGateway.credentials` | `app.ts:1727`, `:1873-1874` | R |
| `profile.profiles[].env`, `.claudeSettings`, `.botGateway` | `app.ts:1882`; inner lines A | A |
| `plugins[].config`, `plugins[].coreGateway.*`, `plugins[].proxy.routes[].headers` | `app.ts:1881`; inner lines A | A |
| `virtualModelProfiles[].metadata.fusionVision.apiKey`, `.fusionWebSearch.env` | `mcp/fusion-config.ts:685`, `:713` | A |
| `Router.rules[].rewrites[].value` (a header value) | `app.ts:711` | A |

Inside the three masked fields, masking goes by key name (`ps.ts:16-21`):

- **Not matched (RUN by the subagent against the three regexes):** `key`, `Ocp-Apim-Subscription-Key`, `privateKey`, `private_key`, `access_key`, `secretAccessKey`, `AWS_SECRET_ACCESS_KEY`, `sessionToken`, `authToken`, `bearerToken`, `botToken`, `appSecret`, `secret_key`, `x-auth-key`, `GITHUB_PAT`, `OPENAI_KEY`. A header or env entry with one of these names is returned in clear. (A)
- **A concrete case:** the OpenCode Gemini import writes the key under `auth.query.key` (`agents/local-providers/opencode.ts:328-330`), so it is clear in the `importLocalAgentProvider` result and in `getConfig().providerPlugins` once saved, while the same key under `x-goog-api-key` two lines above is masked. (R)
- A URL with `user:pass@` or `?key=` in `api_base_url`; `args[]` of a Tool Hub server; any non-string under a credential key (`ps.ts:39`). (R for the code, INF that such values occur)

Outside the config:

| RPC | What comes back | Label |
|---|---|---|
| `testRouteScript` | Anything: file contents, `process.env` (which holds `LLMR_WEB_AUTH_TOKEN` when set by env, and provider keys set by env). | R |
| `testProviderAccountConnector` | The whole JSON reply of the endpoint, plus flattened paths (`account-service.ts:252-256`). | R |
| Request log and trace RPCs | Bodies and tool content unredacted; headers redacted at capture by name (`observability/sensitive-headers.ts:1-23`); URL query redacted only for `access_token`, `api_key`, `apikey`, `key` (`:25`). | R for the classifier, A for the store |
| `getProxyNetworkCaptures` | Bodies unredacted (`proxy/service.ts:1763-1768`), headers redacted (`:1825`). | R |
| `exportData` | Nothing in the response; the file on disk holds everything. | R |

Where the token itself travels (A unless marked): in the URL query at start (`ms.ts:693-697`, R); printed to stdout (`packages/cli/src/cli.ts:524`, R); in the Docker log when generated (`docker/entrypoint.sh:205-206`, R); in a 0600 service state file; passed to the OS opener as an argument (`ms.ts:170`, R). The page strips it from the address bar and keeps it in `sessionStorage` (`packages/ui/src/web-client-bridge.ts:59-64`, `:81`, R).

## Part 4. Directions and their cost

No choice is made here. Sizes are rough and relative.

### (a) The token is full administrative access by design

What it means: say so, and narrow who can reach the server.

- Documentation: one statement in the web and Docker docs that the token equals a shell as the LLMR user. Replace the comment at `ps.ts:120-122` and the "not masked" list in the review log with a pointer to it.
- Default exposure, already in place: loopback bind (`ms.ts:129`), Docker web server on loopback behind Nginx (`Dockerfile:32`), origin check from PR 114, token out of the address bar.
- Possible narrowing, each small: stop printing the tokened URL where a log collects it (`cli.ts:524`, `entrypoint.sh:206`); refuse a non-loopback bind without an explicit flag; strip `LLMR_WEB_AUTH_TOKEN` from `process.env` handed to children and route scripts (`route-script-worker.ts:204-207`, `qr-login-service.ts:186`); fix the two masking gaps that are plain bugs (`query.key`, non-string values).
- Cost: small. Risk left: anyone who gets the token, or a script running in a trusted origin, owns the host. Masking stays cosmetic and should be described that way.

### (b) Command-starting config is not editable over the web RPC, or needs a second factor

What it means: the token can manage providers and routing but cannot make the host run something new.

Must cover, or it is not a boundary:

1. The thirteen config fields and three RPC arguments listed at the end of Part 2.3. `saveConfig` would have to refuse a change to any of them (compare against the stored value field by field), and `startBotGatewayQrLogin` would have to use saved config, not its argument.
2. `testRouteScript` and saved route scripts: the bridge's `fs`, `env` and `fetch` (`route-script-worker.ts:152-188`) are host access by design. Either scripts become unavailable over the web RPC, or the bridge loses those three for web callers, which changes what a route script is.
3. Profile apply: `claudeSettings` and `settingsFile` write files another program executes. An allow-list of settings keys, or not editable over web.
4. The file-write primitive behind any remaining path: a rule that only blocks *changing* a module path fails if the caller can overwrite the file already named there.

Second factor variant: a separate secret (env var or a file on the host) required for the guarded fields and RPCs. Cost is the same enumeration plus a UI prompt; the benefit is that the web UI keeps its features for the owner.

- Cost: large. Roughly: a field-level diff guard on `saveConfig` and `applyClaudeAppGateway`, changes to four or five handlers, a decision on route scripts, UI states for "not editable here", and tests per field. The web UI loses MCP server, plugin, custom router, profile app path and bot gateway editing, or gains a second prompt.
- Risk left: the list is found by reading; a new config field that starts a process reopens it. An architecture test that fails on a new `spawn`/`import()` fed from config would be the guard. The gateway child's own config-driven sinks (`plugins[].coreGateway.config`) were not traced.
- Without (b), (c) buys nothing.

### (c) Destination checks on probes and on `saveConfig`

What it means: a restored reference may only be sent to a host it was saved with.

**The rule must bind the secret, not the provider** (Part 2.2). When `mask` creates a reference (`ps.ts:42-44`) it would also have to record the destinations that secret is stored with; `restore` would have to return which references it restored; the handler compares each destination below against that record. A key typed fresh by the caller needs no check. The local agent logins (Part 2.1, correction 1) need their own rule because no reference is involved: the marker plus a plugin key is enough today.

**How each destination must be derived.** In every case compare `new URL(x).origin` of the *derived* string, never the request text.

| Request shape | Derivation that matches the sender |
|---|---|
| `probeProvider.baseUrl`, `probeProviderCandidates.candidates[].baseUrl`, `checkProviderConnectivity.candidates[].baseUrl` | `parseProviderBaseUrl(value)` (`url.ts:14`): it trims, adds a scheme with `providerUrlWithDefaultScheme` (`url.ts:77-87`), parses, drops userinfo, query and fragment. Check the origin of every entry of `openaiBaseUrlCandidates`, `anthropicBaseUrlCandidates` and `geminiBaseUrl` (they share one origin today; check all so a later change cannot split them). If it throws, refuse. |
| `testProviderAccountConnector` `http-json` `connector.endpoint` | `new URL(endpoint)` exactly as `fetch` will parse it, with no base. Refuse if it throws. Do not run it through `absoluteAccountEndpoint`: the sender does not (`account-service.ts:188`). |
| `testProviderAccountConnector` `webcontent-json` | `absoluteAccountEndpoint(provider, endpoint)` (`account-service.ts:2142-2155`): absolute `http(s)://` endpoints are used as is; otherwise the origin is that of `providerUrlWithDefaultScheme(normalizeProviderBaseUrl(api_base_url \|\| baseUrl \|\| baseurl))`. Web mode throws before sending, so refusing the shape outright is also correct. |
| `getOpenRouterProviderCatalog.baseUrl` | `openRouterApiRoot` (`openrouter-provider-catalog.ts:267-278`): trim, `new URL`, and on a parse failure the destination is `https://openrouter.ai`, not an error. The check must reproduce the fallback or the function must stop falling back. |
| Saved provider, gateway traffic | For each capability: `normalizeProviderBaseUrl(capability.baseUrl ?? (baseurl \|\| baseUrl \|\| api_base_url), protocol)` (`runtime-topology.ts:149`, `:503-514`), with the key read as `apikey \|\| apiKey \|\| api_key` or from `credentials[]`. Note `normalizeProviderBaseUrl` returns unparsed text when parsing fails (`url.ts:60-62`, `:206-235`); refuse that case. |
| Saved provider, account connectors | `standard`: `absoluteAccountEndpoint` over `connector.endpoint`, `connector.endpoints[]`, or the built-in paths (`account-service.ts:2126-2139`). `http-json`: `connector.endpoint` raw. Both on the provider and on each `credentials[].account`. |
| `toolHub.llm` | `toolHub.llm.baseUrl`; how the Tool Hub process normalises it was not read. |

**What the real functions do with odd shapes (RUN:** `node --experimental-strip-types` importing `providers/url.ts` and calling `parseProviderBaseUrl`**).**

| Input | `normalizedInputBaseUrl` |
|---|---|
| `evil.example/v1` (no scheme) | `https://evil.example/v1` |
| `␠https://evil.example/v1` (leading space) | `https://evil.example/v1` |
| `//evil.example` | `https://evil.example` |
| `https://good.example@evil.example/v1` | `https://evil.example/v1` |
| `https://good.example\@evil.example/v1` | `https://good.example/@evil.example/v1` (host is `good.example`) |
| `https://evil.example<TAB>.good.example` | `https://evil.example.good.example` |
| `ht<TAB>tps://evil.example` | `https://https//evil.example` (host is `https`) |
| `localhost.evil.example/v1` | `http://localhost.evil.example/v1` (plain HTTP: the `localhost` test at `url.ts:82` is a prefix test) |
| `127.evil.example` | `http://127.evil.example` |
| `ftp://evil.example` | `ftp://evil.example` (any scheme passes `url.ts:78`) |
| `https://EVIL.example./v1` | `https://evil.example./v1` (trailing dot kept; a different origin string from `evil.example`) |
| `http://[::ffff:169.254.169.254]/` | `http://[::ffff:a9fe:a9fe]` |

The first two rows are the two bypasses of the PR 115 check. Separately (RUN: `new URL` on Node 24), plain `fetch` accepts a leading space and strips tabs and newlines inside a URL, which is what matters for the raw `http-json` endpoint.

**Shapes it must fail closed on:**

- a destination field that is not a string, or an array where a string is expected;
- a string the sender's own parser rejects, or for which `normalizeProviderBaseUrl` took its text fallback;
- a scheme other than `https:`, or `http:` to anything but a loopback literal;
- a restored reference in a request with *no* recognised destination field, or under a key the check has no rule for (`providerPlugins[].auth.*`, `connector.headers.*`, anything new);
- a probe handler added to `webProbeMethods` (`ms.ts:277`) without a derivation row: make the table the single source and refuse an unlisted method;
- a provider with more than one of `api_base_url`, `baseUrl`, `baseurl` set to different origins, or a `capabilities[].baseUrl` on another origin than the provider's;
- the marker key combined with a `llmr-local-agent-` plugin key at a URL that is not that agent's own endpoint;
- any redirect: set `redirect: "manual"` or `"error"` on the probe and account fetches, since `x-api-key` and `x-goog-api-key` survive a cross-origin redirect (Part 2.1).

Also to decide: whether an allowed host may resolve to a private address (`fetchProviderManifest` already refuses that, `manifest-service.ts:239-248`, but local model servers are a legitimate provider), and what "saved with" means for a key that the user wants to move to a provider's second official endpoint. The preset list (`providers/presets/`) could widen the allowed set per key.

- Cost: medium on its own. The four stubbed call sites already exist, so the wiring is there; the work is the secret-to-origin record, one derivation per row above, unifying the two field precedences, the redirect setting, and a test per odd shape in the table.
- Risk left: it protects keys only against a caller who cannot run code, so it is worth its cost only after (b), or as defence in depth under (a) against a confused page rather than a hostile token holder.

### How the directions combine

| Combination | Result |
|---|---|
| (a) alone | Honest and cheap. The token is root-equivalent and documented as such. |
| (c) alone | No security gain; Part 1 lists the routes around it. |
| (b) alone | The host is protected; saved keys still leave through probes and `saveConfig`. |
| (b) + (c) | The token becomes a provider-management credential. Largest cost; the unmasked fields in Part 3 then also need rules, or they are the next leak. |

## Part 5. Not determined

| Question | What would settle it |
|---|---|
| Does the gateway child spawn `agent.mcpServers` at boot or on first tool use? | Start the gateway with a stdio server whose command writes a marker file, send no request, check for the file. |
| What does `@the-next-ai/ai-gateway` do with `baseurl` after LLMR normalises it (further rewriting, redirects)? | Read the provider request builder in the fork `jrmatherly/llmr-gateway`. |
| Do `plugins[].coreGateway.config` keys reach a spawn in the gateway child? | Trace `configExternal` and similar keys in the gateway's `dist/index.js`. |
| Do the wrapper scripts execute the binary path taken from `profile.env`? Does Codex `config.toml` take caller-set fields that run a command? | Read the wrapper runtime and the Codex config writer in `profiles/service.ts`. |
| Not run live: the local agent logins sent by a probe (Part 2.1, correction 1), the plugin `import()` and custom router `require` chains, profile `claudeSettings` writes, and `startBotGatewayQrLogin` on a current build. The chains in "Live verification" were run. | Repeat that recipe after `npm run build:assets`, planting a `llmr-local-agent-codex-oauth` plugin with a test login, a `.js` plugin module that writes a marker, and a profile whose `settingsFile` is inside the throwaway home. |
| Is `detectProviderIcon` guarded against private addresses? Where does the Claude apps gateway login store its session? | Read `providers/icons.ts:100-210` and `agents/claude-apps-gateway/device-login-service.ts`. |
| Does Nginx in the Docker image log the first request's tokened URL? | Run the image and read the access log; no `access_log` directive was found under `docker/`. |
| Which rows marked **A** hold when re-read? | Re-read the cited lines; the headline ones (bot gateway spawn, route script bridge, MCP spawn, plugin import, custom router) were re-read and are marked R. |
| Does an upstream proxy see keys for HTTPS providers? | Inferred no (CONNECT tunnel); confirm by reading `proxyDispatcher` in `proxy/system-proxy-fetch.ts`. |
