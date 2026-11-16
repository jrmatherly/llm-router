# Audit pass: core correctness and maintenance cost

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

ISSUES

Slice: correctness, reliability and maintenance cost of `packages/core/src` (392 files, about 104k lines). Everything was read-only: rg, sed, git log, and a scratch shell loop that counted references for each export. No builds or tests were run.

- **A remote MCP server on SSE transport stays broken after its stream drops, until the config changes or the process restarts** | medium | confirmed
  - Evidence: `packages/core/src/mcp/toolhub-mcp.ts:1022-1032`. When the SSE read loop ends, or hits an error, it only calls `rejectAll`. It never clears `endpointUrl` or `initialized`. `ensureStream()` (:976) returns at once while `endpointUrl` is set, so every later `request()` POSTs to the dead session endpoint and waits out the full `requestTimeoutMs` (:1049). Only `close()` (:954) resets that state. `clientForServer` (:595-612) caches the client by config hash and never evicts it on failure. `StdioMcpClient` does reset itself on child exit (:1289-1291); the SSE client has no equivalent.
  - Impact: after a network blip or server restart, every ToolHub call to that server times out with no error saying why.
  - Recommendation: on stream end or error, set `endpointUrl = ""` and `initialized = false` and abort `streamAbort`, so the next call reconnects. Add one test with a stream that closes. S.

- **Claude App takeover writes the original-config backup in place, and a damaged backup makes restore a silent no-op forever** | medium | confirmed
  - Evidence: `packages/core/src/agents/claude-app/gateway-service.ts:530-532`. `writeJsonFile` uses a plain `writeFileSync` (no temp file and rename) for `claude-app-gateway-backup.json` (:368) and for Claude-3p's `claude_desktop_config.json`, meta and library files (:476, :487, :515). `restoreClaudeAppGatewayConfig` (:213-217) returns quietly when `readClaudeAppGatewayBackup` gets `undefined` (:371-394 catches everything). Because `backupClaudeAppGatewayConfig` skips whenever the file exists (:356), a truncated backup is never rewritten. Separately, `applyClaudeAppDeploymentMode` (:513-518) overwrites a `claude_desktop_config.json` that does not parse with `{deploymentMode:"3p"}` alone, dropping its other keys.
  - Impact: a crash mid-write, or a hand-edited file with a JSON typo, leaves Claude Desktop stuck in gateway mode or loses its config, with nothing logged.
  - Recommendation: write through the existing `writeFileAtomic` in `profiles/backup-files.ts:76`. Log a warning when a backup exists but cannot be read. Refuse to overwrite a root config that does not parse, as the `.corrupt-` move-aside in `profiles/service.ts:3958` already does elsewhere. S.

- **The Grok CLI's own `auth.json` is rewritten in place and failures are swallowed** | medium | confirmed
  - Evidence: `packages/core/src/agents/local-providers/grok.ts:851-878`. `persistRefreshedGrokAuth` rewrites `~/.grok/auth.json` or `credentials.json` (:766-772) with `writeFileSync`, inside `catch { /* Best effort */ }`. The sibling providers write through a temp file and rename (`claude-code.ts:417`, `kimi.ts:470`).
  - Impact: a crash or a write racing the Grok CLI can corrupt the user's Grok login. If the write fails, a rotated refresh token is dropped and nothing is reported.
  - Recommendation: use `writeFileAtomic` and `console.warn` on failure. S.

- **The user's `~/.zshrc`, `~/.bashrc` or `~/.profile` is rewritten in place** | low | confirmed
  - Evidence: `packages/core/src/profiles/launch-service.ts:1927-1931,2045-2063`. `ensurePathBlock` rewrites the rc file through `writeFileIfChanged`, which is a plain `writeFileSync`. It also strips the file's leading blank lines (`.replace(/^\n+/, "")`, :2054).
  - Impact: an interrupted write truncates the user's shell rc.
  - Recommendation: have `writeFileIfChanged` call `writeFileAtomic`. S.

- **Provider presets still carry upstream's affiliate and partner referral links** | medium | confirmed
  - Evidence: `?aff=ccr` in `providers/presets/kimi-coding/index.ts:30,35,40` and `moonshot/index.ts:84-105`. `aff=CCRCCR` in `infistar-ai/index.ts:15`. `utm_source=claudecoderouter&utm_medium=partner` plus agent register IDs in `code0/index.ts:14` and `claudeapi/index.ts:14`. `aff=` codes in `runapi/index.ts:14` and `fenno/index.ts:14`.
  - Impact: sign-ups made through this fork are credited to upstream's referral accounts.
  - Recommendation: remove the referral parameters, and decide whether the sponsored presets (code0, claudeapi, runapi, fenno, infistar) stay. S.

- **The largest file is 7,348 lines of untyped JavaScript inside a `String.raw` template** | medium | confirmed
  - Evidence: `packages/core/src/agents/codex/cli-middleware-runtime.ts:3-7347`. It has about 350 functions and 89 `catch` blocks. `tsc` and lint never see it. Its only check is `node --check` plus 45 spawn tests (`test/integration/agents/codex-cli-middleware-runtime.test.mjs`). It changed in 16 commits in the last 90 days.
  - Impact: type errors and renames slip through. The ccr→llmr rename (#37-#41) had to edit it by hand.
  - Recommendation: move it to a real `.ts` or `.js` source file bundled by esbuild and emitted as the script. M-L.

- **`profiles/service.ts` mixes agent-specific code into the generic profile service** | medium | confirmed
  - Evidence: 4,539 lines, 281 functions, 34 imports and 29 commits in 90 days. 54 functions are Claude Code-specific and 24 Codex-specific, plus some for Grok, Kimi, Kilo, OpenCode, Pi and Zcode. Meanwhile `agents/claude-code/` holds only 232 lines.
  - Of the rest of the top 10, these have real structural problems: `request-log-store.ts` (6,577 lines: schema, migrations and queries in one file) and `config.ts` (3,891 lines, 22 commits in 90 days). Merely long: `contracts/app.ts` (type declarations), `account-service.ts`, `toolhub-mcp.ts`, `probe.ts`, `launch-service.ts`, `proxy/service.ts`.
  - Recommendation: move the per-agent takeover and restore code into `agents/<kind>/`. M.

- **11 exported symbols have no reference anywhere in `packages`, `tests`, `scripts` or `build`** | low | confirmed with rg
  - `broadcastWindowsEnvironmentChanged`, `GROK_MEDIA_MCP_SERVER_NAME`, `readProxyCertificateSerialNumber`, `DEFAULT_RETRY_AFTER_MS`, `claudeCodeEffectiveMaxInputTokens`, `modelCatalogReasoningEffortConfig`, `findInstalledZcodeAppExecutable`, `isSafeRouteReadPath`, `decodeLlmrRouteFallbackHeader`, `zcodeModelCatalogJson`, `updateGatewayRequestLogFromRawTrace` (`request-log-store.ts:1818`).
  - There are no `export *` barrels in core, so nothing re-exports them.
  - Recommendation: delete them. S.

- **Naming and behaviour left over from upstream** | low | confirmed
  - A parallel `CODEXL_*` env family appears 155 times. It is dual-written next to the `LLMR_*` names (`agents/claude-code/environment.ts:5,9,50`), and `CODEXL_HOME` takes precedence over `LLMR_CONFIG_DIR` (`cli-middleware-runtime.ts:76`).
  - `claudeCodeUtcTimezoneEnvOverride` (`environment.ts:101-116`, 15 references) silently sets `TZ=UTC` for Claude Code when the machine is in a China time zone.
  - Recommendation: decide whether either is still wanted, then drop `CODEXL_*` and the TZ override. S-M.

**Unverified leads**
- `agents/codex/app-launch.ts:304,866` writes a Codex or WorkBuddy auth and model-catalog file in place. Whether `codexHome` can be the user's real `~/.codex` is open; tracing `resolveCodexConfigFile` settles it.
- `plugins/marketplace.ts:263` and `providers/icons.ts:192` write cache files in place, so a truncated cache after a crash is possible. Checking whether readers re-verify `expectedSha256` on load settles it.
- Retry mode (`executor.ts:600-605`) retries after a network error even if the request body was already fully sent, which could bill twice on non-idempotent upstreams. It needs a check of what errors `fetchWithSystemProxy` raises after the body is sent.

**Checked and found fine**
- No `TODO`, `FIXME`, `HACK` or `XXX` markers in core src.
- Upstream fallback loop (`gateway/upstream/executor.ts:357-617`): bounded by the attempt list and a shared `API_TIMEOUT_MS` deadline, honours the abort signal, cancels failed bodies.
- Core runtime restart: exponential backoff capped at 30 s, cancelled by generation (`gateway/application/gateway-service.ts:578-597`).
- App config writes: SQLite behind a serialised write queue (`config/config.ts:387-414`).
- Profile apply is serialised (`profiles/service.ts:153-161`), and corrupt JSON is moved aside with a warning (:3958-3966).
- System proxy snapshot is persisted before the proxy is applied, so a torn write cannot strand the proxy (`proxy/system-proxy.ts:113-138`).
- Request-log writer restarts with backoff and logs failures (`observability/request-log-runtime.ts:815-830`).
- Interval timers are cleared or `unref`'d (media cleanup, remote-control heartbeat).
- Remaining `CCR_GATEWAY_RUNTIME_ID` and `CCR_UPSTREAM_PROXY_URL` (`gateway/internal/shared.ts:317-318`) are the gateway-owned names kept by decision. Not counted as findings.

Not checked: the 604 `catch` blocks were sampled (profiles/service.ts in full, plus the toolhub, grok and claude-app files above), not all read. No behaviour was reproduced by running code; every finding above comes from reading the source.
