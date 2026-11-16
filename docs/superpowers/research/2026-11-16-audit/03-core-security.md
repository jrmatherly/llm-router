# Audit pass: core gateway security

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

ISSUES

All findings come from reading the code paths. Nothing was run and no files were changed.

- **Proxy "gateway" mode adds the primary API key to any loopback request, so a web page in a browser using the system proxy can spend the owner's provider quota** | medium | likely
  - Evidence:
    - `packages/core/src/proxy/service.ts:1266-1276` deletes the client's `authorization`/`x-api-key` and always injects `primaryApiKey(config)` for requests that match a target.
    - `DEFAULT_PROXY_TARGETS` (`config/default-config.ts:12-19`) include `api.openai.com/v1/chat/completions` and `api.anthropic.com/v1/messages`.
    - `handleConnect` (`service.ts:633-641`) and `handleProxyRequest` (`:708-711`) check only that the client is loopback. With `systemProxy`, the user's browser is that loopback client.
    - With the proxy on, the unified server is forced (`gateway-service.ts:745-750`). It parses the body as JSON whatever the content-type and rewrites it to `application/json` (`gateway/request/pipeline.ts:366,394`).
    - No Origin or `sec-fetch-*` check exists in `gateway/` or `proxy/` (rg found none).
    - So a "simple" CORS POST (`text/plain`, no auth header) from any site gets through. The page cannot read the reply but the tokens are billed.
    - Other OS users on the same host get the same free access through the loopback proxy.
  - Impact: Opt-in (`proxy.enabled` + `systemProxy`; mode defaults to `gateway`). The owner sees unexplained usage and cost.
  - Recommendation: Inject the key only when the request already carried an `authorization`, `x-api-key` or `api-key` header (browsers cannot add one without a preflight, which the gateway's CORS blocks). Also reject requests that have an `Origin` header. Size S.

- **System-proxy mode decrypts every HTTPS host, and network capture keeps full bodies that any API-key holder's agent can read** | medium | confirmed
  - Evidence:
    - `handleConnect` runs `getMitmServer(target.hostname)` for every CONNECT without checking `proxy.targets` or plugin routes (`service.ts:639`).
    - Capture runs in every mode, transparent included (`service.ts:728`), keeping up to 256 KB per body (`:128`). Only headers are redacted (`:1751-1762`).
    - The `network_capture_get` MCP tool returns the whole item with bodies and the unsanitized `url` (`mcp/network-capture-mcp.ts:243-247`). It needs only a gateway API key (`request-handler.ts:201-211`).
  - Impact: With `captureNetwork` on, banking and login form posts, OAuth token responses and query-string tokens from every app are decrypted, stored in memory and readable by a prompt-injected agent.
  - Recommendation: Tunnel CONNECTs to hosts that match no target or plugin proxy route without MITM, and capture only routed modes. Size M.

- **Grok token refresh writes the rotating refresh token to the CLI's auth file in place and ignores write failures** | medium | confirmed
  - Evidence:
    - `agents/local-providers/grok.ts:851-877` does read-modify-`writeFileSync` straight onto `auth.sourceFile`, with no temp file or rename, and an empty `catch`.
    - The code's own comment at `:270-273` says the token "rotates on every refresh".
    - `resolveGrokAuth` (`:265`) re-reads from disk on each call and has no in-memory fallback.
    - By contrast, Claude Code (`claude-code.ts:414-418`), Kimi (`kimi.ts:470-471`) and claude-apps-gateway (`session-store.ts:82-86`, plus its `unsavedRefreshes` map) all write atomically.
  - Impact: A failed or interrupted write leaves the spent refresh token on disk, which logs the user out of both LLMR and the Grok CLI. A concurrent Grok CLI write can be lost.
  - Recommendation: Reuse the temp-file-and-rename pattern and keep unsaved refreshes in memory, as `session-store.ts:150-154` does. Size S.

- **Marketplace modules without an `integrity` hash are re-downloaded over the installed plugin's file** | low | confirmed
  - Evidence:
    - `plugins/marketplace.ts:244-264`: with no hash, the cache key is `hash(url)` and the module is re-fetched and overwritten at the same path on every listing refresh (5-minute TTL).
    - `plugins/service.ts:975-980` imports that path with no integrity check at load time.
  - Impact: Latent. The default manifest is currently empty (`gh api …/marketplace/plugins.json` returns `{"plugins": []}`). Once entries exist, the code of an installed plugin can change silently.
  - Recommendation: Require `integrity` for marketplace entries, or pin the bytes at install time. Size S.

- **MITM server cache grows without limit** | low | confirmed
  - Evidence: `service.ts:664-676` caches one HTTPS server plus a fresh RSA-2048 keypair per hostname until `stop()`.
  - Impact: Any loopback client can exhaust memory or CPU by sending CONNECTs to many hostnames.
  - Recommendation: Use an LRU cap and reuse one leaf key. Size S.

- **Every invalid API key forces a SQLite reload** | low | confirmed
  - Evidence: `gateway/auth/api-key-authorizer.ts:37-40` and `:96-99` bypass the cache with `refresh: true` on every miss. The `/v1/oauth/token` route has no rate limit.
  - Impact: Cheap DoS when the gateway is bound to a LAN interface.
  - Recommendation: Rate-limit the refresh-on-miss, for example at most one per second. Size S.

## Unverified leads
- `request_logs.url` stores the inbound URL unsanitized (`observability/request-log-store.ts:678,1701`), while raw traces redact `key`, `api_key` and `access_token` (`raw-trace-sync.ts:1810-1832`). To settle: check whether any supported client sends credentials in the query string, as Gemini-style `?key=` does.
- Plugin gateway routes declared `auth: "none"` (`request-handler.ts:214-221`) and plugin browser apps sit on a gateway that has no Host-header check, so DNS rebinding could reach them. To settle: list the built-in plugins whose routes use `auth: "none"`.
- Device login accepts `interval: 0` and an unbounded `timeoutMs` from the RPC caller (`device-login-service.ts:73,99`), which allows back-to-back token polls. To settle: add a floor of 1 second and a cap.
- `proxy.browserMode` is parsed (`config/config.ts:2536-2544`) but never read. To settle: rg the UI and Electron packages for it.

## Checked and found fine
- Management server binds to 127.0.0.1 by default, enforces a Host allowlist against DNS rebinding, requires a 32-byte token compared with `timingSafeEqual`, and accepts only JSON POST for RPC (`web/management-server.ts:143-258,681-758`).
- Gateway and core default to 127.0.0.1. `assertLoopbackCoreHost` keeps the core on loopback, and the core requires a static key (`config-compiler.ts:135-145`).
- API keys are compared with `timingSafeEqual` and generated from 32 random bytes (`config/config.ts:3717`).
- The sync endpoints use per-run UUID tokens. Media artifacts are token-gated.
- The config DB is 0600 inside a 0700 directory (`config-repository.ts:31-32,193,853-856`). The CA private key is 0600 (`proxy/certificates.ts:12,81`). The CLI state file is 0600, and the data export is written 0600.
- No upstream TLS verification is disabled anywhere (no `rejectUnauthorized` in `src`).
- All SQL is parameterized. The only interpolated identifiers are code constants (`request-log-store.ts:873-881,5319`, `config-repository.ts:678`).
- Process spawns use argv arrays. The terminal script uses `shQuote` (`launch-service.ts:150-155`), and `osascript` receives only a numeric pid.
- Core config travels over IPC, not argv (`supervisor.ts:79`).
- `openSystemExternal` allows only http(s) and the plugin deep link. Static file serving is guarded against traversal (`management-server.ts:599-606`).
- Header redaction is fail-closed (`observability/sensitive-headers.ts`), and no log line prints secrets.
- `x-auth-api-key-id` is overwritten after authentication in both runtimes (`pipeline.ts:151-155`, `router-plugin.ts:954-960`).
- The claude-apps-gateway session store writes atomically with mode 0600, coalesces refreshes and adopts a token a peer rotated. Its URLs must be https or loopback http.
- The bot gateway spawns only commands from config or the bundled runner, with no request input.

I did not open the Electron preload, the `ai-gateway` internals (only its content-type parsers), the UI, or Docker and nginx, which belong to other slices. The proxy finding's browser leg rests on standard CORS simple-request rules; I did not run it.
