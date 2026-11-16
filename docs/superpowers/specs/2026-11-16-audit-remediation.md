# Audit remediation spec

This spec records the project audit of 2026-11-16, the research that followed it, and the decisions Jason made. The plans under `docs/superpowers/plans/2026-11-16-audit-*.md` implement it. Start with the [program index](../plans/2026-11-16-audit-remediation-index.md).

## Goal

Fix the defects, security weaknesses and maintenance costs the audit confirmed, in an order where each pull request is small, independently verified, and protected by the release path it ships through.

## How the findings were produced

- Base commit `136ad730` (tag `v7.2.1`), CI green.
- Six read-only audit passes covered dependencies, CI and release, gateway security, core correctness, the desktop app and UI, and tests, guardrails and docs.
- Ten research passes then settled open questions by reading code, running tools on scratch copies, and checking current primary sources (npm, GitHub, vendor docs) as of 2026-11-16.
- The unedited reports from every pass are in [`docs/superpowers/research/2026-11-16-audit/`](../research/2026-11-16-audit/). Later passes corrected some of their claims. Where a report and this spec disagree, this spec wins.
- Nobody ran the repo's test suites or the app during the audit. Behaviour claims come from reading code unless a line says "measured".

Each finding carries a status:

- **Checked.** The session lead re-read the cited code or re-ran the cited command.
- **Researched.** A research pass confirmed it with file and line evidence or a measurement; the lead spot-checked its anchors.
- **Inferred.** It follows from the code or from a third-party source, and nobody observed it.

Line numbers are from `136ad730`. Re-read the file before editing; earlier plans in the program move lines.

## Global constraints

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

## Decisions

| ID | Decision | Made by |
|---|---|---|
| D-1 | Strip every referral, affiliate and tracking code from provider links. | Jason, 2026-11-16 |
| D-2 | Delete the six paid reseller presets: `code0`, `claudeapi`, `fenno`, `infistar-ai`, `runapi`, `unity2`. Keep `qiniu-ai`, `kimi-coding` and `moonshot` with clean links. | Jason, 2026-11-16 |
| D-3 | Windows builds stay unsigned. Document it as a known limit. | Jason, 2026-11-16 |
| D-4 | Remove the `TZ=UTC` override for China time zones. | Jason, 2026-11-16 |
| D-5 | Migrate the `CODEXL_*` environment names to `LLMR_*` and delete the old names. Keep only the lists that strip stale keys from users' settings files. | Jason, 2026-11-16 |
| D-6 | Adopt Biome for linting only. No formatter, no import sorting, no sorted-keys rule. | Jason, 2026-11-16 |
| D-7 | Move the Codex CLI middleware runtime out of its `String.raw` template into a real `.cjs` source file, then type-check it non-strictly. | Jason, 2026-11-16 |
| D-8 | For `profiles/service.ts`, do three move-only extractions (shared helpers, Grok, Kimi). Defer the Claude Code, Codex and takeover clusters until a takeover module is designed. | Jason, 2026-11-16 |
| D-9 | The project has no consumers today. Judge breaking changes on design quality alone. | Jason, 2026-11-16 |
| D-10 | Retry mode keeps its logic. It matches the Anthropic and OpenAI SDK defaults (408, 409, 429, 5xx) and is off by default. Document that gateway, core-runtime and client SDK retries stack, and close F-C9 as not a defect. | Jason, 2026-11-16 |
| D-11 | Marketplace modules require a sha256 `integrity`. Hash raw bytes, write atomically, re-download a cached file that fails its hash, and show a failed entry in the UI with Install disabled. | Jason, 2026-11-16 |
| D-12 | Delete the proxy key injection (F-C1). In gateway mode the proxy forwards the client's own credential and the gateway authorizer validates it, so a tool must carry an LLMR key. No opt-in setting. A guard on "has any credential" was rejected, because `x-api-key: x` or `?key=x` defeats it. Apps that sign in by OAuth with a fixed endpoint can no longer be rerouted through Proxy mode. | Jason, 2026-11-16 |

Earlier decisions that still bind: divergence from upstream is intended; English only; no `ccr` compatibility; Dependabot alert 144 (minimatch) waits on electron-builder taking minimatch 11.

## Findings

### A. Release safety

| ID | Finding | Evidence | Status |
|---|---|---|---|
| F-A1 | CI never tests the ai-gateway build that releases ship. The lockfile pins `@the-next-ai/ai-gateway@1.0.21` (npm `latest`). Release and Docker Release build upstream commit `0a2c0abd` through `.github/actions/prepare-release-gateway/action.yml` and install that tarball. The tarball also reports version `1.0.21`, so `npm ls` cannot tell them apart. | `release.yml:82,131-135,284-288,336-340`; `docker-release.yml:72-73`; `test.yml` has no use of the action | Checked |
| F-A2 | Docker Release pushes multi-arch images without smoke-testing them. | `docker-release.yml:88-103` | Researched |
| F-A3 | Two gateway test files never run anywhere. They skip unless `LLMR_TEST_GATEWAY_ENTRY` is set, and nothing sets it. They may fail the first time they run. | `packages/core/test/integration/gateway/recent-issues-wire.test.mjs:15`, `october-issues-wire.test.mjs:18` | Checked |
| F-A4 | The GitHub release goes public before Windows and Linux build. `gh release create` has no `--draft`, and later jobs need `publish-macos`. A re-run of a failed Windows or Linux job more than two hours later uploads nothing and still shows green (electron-builder's publisher skips an existing published release). | `release.yml:225,261,313`; `node_modules/electron-publish/out/gitHubPublisher.js:69-97` | Checked (ordering), Researched (re-run) |
| F-A5 | `npm run release` checks only typecheck and architecture tests, not that the Tests workflow passed on `HEAD`. | `scripts/release.mjs:15,58-76` | Checked |
| F-A6 | `build/merge-macos-update-metadata.mjs` picks the default update artifact by URL substring and has no test. | No reference in `tests/` or `packages/*/test` | Researched |
| F-A7 | Pushes to `main` cancel in-progress Tests runs, so some `main` commits never get a result. | `test.yml:13-15` | Checked |
| F-A8 | Five of seven `release.yml` jobs and both `docs.yml` jobs set no `timeout-minutes`. | `release.yml`, `docs.yml` | Researched |
| F-A9 | `docs.yml` builds only on push to `main`, so a broken docs build shows after merge. | `docs.yml:3-10` | Checked |
| F-A10 | Dependabot covers only `github-actions` and root `npm`. `docs/` has its own lockfile, and Docker base images are digest-pinned with nothing to bump them. The repo is a fork, where GitHub leaves version updates off until an owner enables them in Settings; zero Dependabot PRs exist. | `.github/dependabot.yml`; `gh pr list` | Checked |
| F-A11 | Repo settings are looser than policy: Docker smoke is not a required check, SHA pinning is not enforced, merge commits and rebase merges are allowed, the Apple signing secrets sit at repo level, and no tag ruleset protects `v*`. | `gh api` reads | Researched |
| F-A12 | The root `package.json` has `publishConfig`, `prepack` and `prepublishOnly`, though every package is private and nothing publishes. | `package.json:29-31,46-47` | Checked |
| F-A13 | Windows builds are unsigned and no doc says so (D-3). | `electron-builder.json`, `release.yml:306-309` | Researched |

### B. Repo hygiene and provider presets

| ID | Finding | Evidence | Status |
|---|---|---|---|
| F-B1 | Upstream referral codes ship in provider links: `aff=ccr` (kimi-coding, moonshot), `aff=CCRCCR` (infistar-ai), `aff=9HHHAB5QLAES` (fenno), `aff=IX1t` (runapi), `utm_source=claudecoderouter` plus agent-register paths (code0, claudeapi), `source=claudecoderouter` (unity2), and the `s.qiniu.com/AVjMVf` short link, which redirects to a CPS referral. The same URLs appear encoded in `docs/.../provider-deeplink.md:85-105`. | `packages/core/src/providers/presets/*/index.ts` | Checked |
| F-B2 | `scripts/llmr-rename.mjs:38-58,85-93` lists `aff=ccr`, `aff=CCRCCR`, `aff%3DCCRCCR` and `claudecoderouter` as text that must stay, and `tests/architecture/llmr-rename.test.mjs:73-81` enforces it. Stripping the codes fails the commit gate unless those entries and three fixtures change in the same PR. | Scratch run of the helper | Researched |
| F-B3 | Six presets are paid reseller placements with no vetting (D-2). A saved provider holds no preset id, so deleting a preset costs an existing provider only its brand icon and website button. | `contracts/app.ts:161-188`; `shared/providers.ts:531-541,774` | Researched, user effect Inferred |
| F-B4 | `AGENTS.md:22` misstates the facade rule. The test checks that gateway modules do not import the facade, and that the facade re-exports `gateway/application/gateway-service`. | `gateway-service-architecture.test.mjs:25-40` | Checked |
| F-B5 | `blog/` holds three upstream posts nothing links to. Only `README.md:23` uses `blog/images/llm-router.png`, and `scripts/llmr-rename.mjs:25` names `blog/en/`. | `git grep` | Researched |
| F-B6 | `LICENSE` and `packages/cli/LICENSE` name only the upstream author. | `LICENSE:3` | Checked |
| F-B7 | The repo is public with private vulnerability reporting enabled but has no `SECURITY.md`. | `ls`, `gh api` | Checked |
| F-B8 | `CLAUDE.local.md` is ignored only by `.git/info/exclude`, and `.superpowers/` only by a nested ignore file. | `git check-ignore -v` | Checked |
| F-B9 | `README.md:205` describes a sibling path from the upstream author's machine and omits the published GHCR image. `README.md:216` names `windows-latest`; the workflow uses `windows-2025`. | `README.md` | Researched |

### C. Core gateway

| ID | Finding | Evidence | Status |
|---|---|---|---|
| F-C1 | In system-proxy gateway mode, `createForwardHeaders` strips the client's `authorization` and `x-api-key` and always injects `primaryApiKey(config)` for a routed host. Only a loopback check guards it, and no `Origin` check exists. A test asserts that a keyless request gets the key. Any local process, and probably a web page in a browser that uses the system proxy, can spend the owner's quota. Fix by deletion (D-12). | `proxy/service.ts:1236,1266-1276,706-730`; `test/unit/proxy/proxy-peer.test.mjs:76` | Checked (code), Inferred (browser path) |
| F-C2 | `handleConnect` decrypts every CONNECT host, not only routed ones. With network capture on, bodies up to 256 KB are kept and readable through the `network_capture_get` MCP tool with only a gateway key. Capture stores query strings unredacted. | `proxy/service.ts:633-641,728,128,780,790`; `mcp/network-capture-mcp.ts:243-247` | Checked (`:639`), Researched |
| F-C3 | The MITM server cache holds one HTTPS server per hostname and never evicts. | `proxy/service.ts:664-676` | Researched |
| F-C4 | An SSE MCP client never reconnects after its stream drops. The read loop only calls `rejectAll`; only `close()` clears `endpointUrl`, so `ensureStream` returns early and every later call times out. | `mcp/toolhub-mcp.ts:954-1034,600-611` | Checked |
| F-C5 | Three writes to files the user owns are not atomic: the Claude App takeover backup and config (`writeJsonFile`), the Grok CLI's auth file (failure swallowed, rotating refresh token), and shell rc files (`writeFileIfChanged`, which also strips the file's leading blank lines). A corrupt takeover backup makes restore return silently. An unparseable `claude_desktop_config.json` is replaced with `{deploymentMode:"3p"}`. | `agents/claude-app/gateway-service.ts:213-217,371-393,513-518,530-532`; `agents/local-providers/grok.ts:851-877`; `profiles/launch-service.ts:1927-1931,2050-2054` | Checked |
| F-C6 | A marketplace module with no `integrity` is cached by URL hash and re-downloaded over the installed file on each listing refresh, then imported without verification. The hash covers decoded text, not raw bytes, and a cached file that fails its hash hides the entry for good. The live manifest is empty (D-11). | `plugins/marketplace.ts:244-264`; `plugins/service.ts:975-980` | Researched |
| F-C7 | Every invalid API key forces a reload from SQLite through `refresh: true`, although the key cache already expires after 1,000 ms. | `gateway/auth/api-key-authorizer.ts:11,37-40,65-68,96-99` | Checked (TTL), Researched |
| F-C8 | Device login accepts `interval: 0` and a non-numeric `timeoutMs`, which gives a hot polling loop and a wait that never times out. | `device-login-service.ts:73,99`; `web/management-server.ts:500` | Researched |
| F-C9 | Retry mode retries on any 408, 409, 429 or 5xx and on any fetch rejection, without checking whether the request body was already sent. The status list equals the Anthropic and OpenAI SDK defaults, a streamed response is never retried after headers arrive, and the core runtime adds one retry of its own. Not a defect (D-10). | `gateway/upstream/executor.ts:497-610`; `routing/failure-classifier.ts` | Researched |
| F-C10 | `request_logs.url` stores the inbound URL with `?key=` unredacted. Only the raw-trace path redacts. | `gateway/request/pipeline.ts:137,342`; `observability/request-log-store.ts:1701`; `raw-trace-sync.ts:1660,1811-1830` | Researched |
| F-C11 | Eleven exports have no reference outside their definition: `broadcastWindowsEnvironmentChanged`, `GROK_MEDIA_MCP_SERVER_NAME`, `readProxyCertificateSerialNumber`, `DEFAULT_RETRY_AFTER_MS`, `claudeCodeEffectiveMaxInputTokens`, `modelCatalogReasoningEffortConfig`, `findInstalledZcodeAppExecutable`, `isSafeRouteReadPath`, `decodeLlmrRouteFallbackHeader`, `zcodeModelCatalogJson`, `updateGatewayRequestLogFromRawTrace`. `proxy.browserMode` is parsed and never read. | `rg -nw` per symbol | Researched; `browserMode` Checked |
| F-C12 | After a Codex OAuth refresh in the provider probe, the rotated `refreshToken` is assigned to a local and never used or persisted. If the endpoint rotates refresh tokens, a later refresh sends a revoked one. Whether it rotates is unverified. | `providers/probe.ts:1255-1258,1320-1354` | Checked (line), Inferred (impact) |
| F-C13 | Plugins load through in-process `import()` with full Node access, so plugin permissions gate only the registration API. Listing the marketplace downloads every module in the manifest before the user picks one. Deferred: it needs its own review. | `plugins/service.ts:976-980`; `plugins/marketplace.ts` | Researched |

### D. Desktop app and browser extension

| ID | Finding | Evidence | Status |
|---|---|---|---|
| F-D1 | Electron 42 has been outside the supported window since 45.0.0 shipped on 2026-10-21. The app installs `42.11.18`. Supported majors are 43, 44 and 45. | `npm view electron time`; `npm ls electron` | Checked |
| F-D2 | `better-sqlite3@12.11.1` prebuilds stop at Electron 42's ABI. `13.2.0` is N-API, ships prebuilds in the package, and has no install script, which makes the Electron sqlite sidecar unnecessary. | `npm view better-sqlite3@13.2.0`; `scripts/prepare-electron-sqlite.mjs:21` | Checked (npm facts), Inferred (loads under Electron 42) |
| F-D3 | Electron 43 to 45 break two call sites: `settings.openAsHidden` (removed in 44) and `clipboard.writeText` (returns a Promise in 44). Electron 44 raises the macOS minimum to 13. Electron 45 on Windows needs `electron-builder@26.18.1`, which sits on dist-tag `v26` while `latest` is `26.18.0`. | `launch-at-login.ts:26`; `built-in-browser.ts:689`; `npm view electron-builder dist-tags` | Checked |
| F-D4 | The built-in browser turns `localhost:3000` into `https://localhost:3000`. A second copy of the normaliser lives in `browser-automation-mcp.ts:2026-2041`. | `built-in-browser.ts:938-952` | Checked |
| F-D5 | The tray popover loads the full-privilege `preload.js` and has no `will-navigate` or `setWindowOpenHandler` guard. None of the 80 `ipcMain.handle` calls in `ipc.ts` checks its sender. Nothing is exploitable today. | `tray-controller.ts:225-249`; `ipc.ts`; `windows.ts:97-107` | Checked (preload, IPC), Researched (guards) |
| F-D6 | An `llmr://plugin/<id>/open` link starts a stopped gateway without asking. The built-in browser's own page has no CSP. | `deep-link.ts:131-138`; `packages/ui/src/pages/browser/index.html` | Researched |
| F-D7 | The Chrome login-import extension grants `http://*/*` and `https://*/*`, matches its confirm page on any port, and never checks `event.isTrusted`. `normalizeCookieHost` accepts a bare `com`. The job server sends `access-control-allow-origin: *`. `popup.js` duplicates about 200 lines of `background.js`. | `extension/chrome/manifest.json`; `chrome-login-import.ts:395-414,547` | Checked (manifest, host rule), Researched |
| F-D8 | Electron has six unit test files, none for the deep-link parser, the window guards, the update service or the login-import filters. | `packages/electron/test/unit` | Checked |
| F-D9 | `baseui`, `styletron-engine-atomic` and `styletron-react` serve one provider wrapper that renders two divs. They are the only reason `core-js@2.6.12` and its install script are approved. | `packages/ui/src/lib/baseui-provider.tsx`; `npm explain core-js` | Checked |
| F-D10 | Five inherited overrides are dead or redundant (`socks`, `pm2`, `minimatch@10.2.5`, `find-my-way@9.6.0`, `fast-uri@3`). Removing them leaves the lockfile byte-identical. The root `dependencies` block duplicates core's and ships nowhere. | Scratch lockfile simulation | Researched |
| F-D11 | Four UI exports are unused: `pluginRuntimeSurfacesEnabled`, `slugValue`, `stringListValue`, `providerAccountCurrentMeterDetail`. | `git grep -w` | Researched |

### E. Upstream leftovers

| ID | Finding | Evidence | Status |
|---|---|---|---|
| F-E1 | `claudeCodeUtcTimezoneEnvOverride` sets `TZ=UTC` for Claude Code in China time zones. Upstream added it in `371520bb` (2026-07-01) with no stated reason. A duplicate lives inside the Codex runtime script. Existing installs in those zones keep `TZ: "UTC"` in Claude settings, because `TZ` is not a managed key. | `agents/claude-code/environment.ts:35-44,101-116`; `cli-middleware-runtime.ts:59-74,170,4125` | Checked (commit, function), Researched |
| F-E2 | A `CODEXL_*` environment family is written beside the `LLMR_*` names. It came from upstream's separate CodexL launcher. `CODEXL_HOME` wins over `LLMR_CONFIG_DIR`. Two workspace-name variables and one model variable are load-bearing with no `LLMR_` writer or read on the same path, so a blind delete breaks them. Nothing outside this repo was found reading the names. | `cli-middleware-runtime.ts:77,4347`; `profiles/service.ts:2869,2911,3013,3043`; `agents/codex/app-launch.ts:679,697` | Checked (`:77`, single `LLMR_` writer), Researched |

### F. Tooling

| ID | Finding | Evidence | Status |
|---|---|---|---|
| F-F1 | There is no linter or formatter. Biome 2.6.6 lints the tree in under 2 s; with about 20 noisy rules off, 58 diagnostics remain. A formatter pass would change about 500 of 607 files. ESLint with typescript-eslint took 23 to 40 s and its TypeScript peer range stops below 6.1. | Trial on a scratch copy | Researched |
| F-F2 | `share-cards.test.tsx:37` renders the poster header and asserts nothing on it. Thirteen imports are unused, mostly in test and build files. | `packages/ui/test/component/share-cards.test.tsx:34-38` | Checked |
| F-F3 | Test files under `packages/*/test/**/*.ts(x)` are not type-checked. Including them surfaces 35 errors in 12 UI test files. | Scratch tsconfig | Researched |

### G. Structure

| ID | Finding | Evidence | Status |
|---|---|---|---|
| F-G1 | `agents/codex/cli-middleware-runtime.ts` is 7,348 lines of CommonJS inside one `String.raw` template with a single interpolation, so `tsc` never checks it. Loaded as text from a `.cjs` file, the emitted script is byte-identical (sha256 `e35ead7b47ca5dc816950ef265c2c2ad93e6c00ec97ec14f0577f63b20ee2af1` at `136ad730`). A non-strict `checkJs` pass raises 11 errors. | Prototype in the session scratchpad | Researched |
| F-G2 | `profiles/service.ts` is 4,539 lines with eight public exports and two pieces of module state. Agent-specific clusters are interleaved. The Grok cluster (10 functions) depends on shared helpers only; Kimi (20 functions) adds three TOML helpers. No defect or conflict in 90 days traces to the file's size (D-8). | TypeScript-AST map | Researched |

## Deferred, with reasons

- **Windows code signing.** Costs money and needs an account only Jason can create (D-3).
- **Claude Code, Codex and takeover extraction from `profiles/service.ts`.** The clusters depend on each other and need a takeover module designed first (D-8).
- **Pending majors with no security driver:** undici 8, React 19, TypeScript 7, js-yaml 5.
- **Platform test legs.** CI is Ubuntu-only, so four Windows-only and two macOS-only tests never run. A matrix leg is worth doing after the release path is fixed.
- **Type-aware lint rules and a formatter** (D-6).
- **A pairing key that binds the Chrome extension to one LLMR install.** The extension is developer-only and loaded unpacked.
- **CLI lifecycle tests** (start lock, lease count, `stop`).
- **Docker image signing, SBOM and release checksums.**
- **A review of the plugin system's trust model** (F-C13).
- **Narrowing who can read captured network bodies.** With Capture network on, every host is still decrypted, and any holder of a gateway key can read captured bodies through the `network_capture_get` MCP tool (F-C2). CG-2 stops decrypting non-target hosts only while capture is off.
- **Automatic base-image digest updates.** Dependabot's Docker updater reads only literal `FROM image` lines. The `Dockerfile` uses `FROM ${NODE_IMAGE}` with the digest on `ARG` lines, so it finds nothing. RS-4 bumps the digest by hand. Moving the digest into the `FROM` lines would let Dependabot see it.
- **A required-reviewer gate on the release `publish` job.** RS-2 publishes automatically once every platform uploaded. A manual approval before publish would allow a platform check first, at the cost of a manual step on every release.
- **`ModelCatalogEntry.sourceRecords`**, which becomes write-only once F-C11 lands.

## Checked and found sound

The audit reported these as sound; they were not re-checked: the management server (loopback bind, Host allowlist, timing-safe 32-byte token, JSON-only RPC), API key generation and comparison, parameterised SQL, 0600 files in 0700 directories, argv-array process spawns, all 13 `webPreferences` blocks, SHA-pinned actions, least-privilege workflow permissions, and the Docker image (non-root, healthcheck, digest-pinned base).

## Not verified by anyone

- Whether current Claude Code still formats its date line differently by time zone (F-E1).
- Whether the Codex OAuth token endpoint rotates refresh tokens (F-C12).
- Packaging, notarization, and Windows and Linux visuals under Electron 45 (F-D3). These need runs on those platforms.
