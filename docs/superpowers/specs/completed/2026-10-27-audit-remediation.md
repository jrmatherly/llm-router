# Audit remediation: fix what the 2026-10-27 repository audit found

Date: 2026-10-27. Status: approved for planning.

## Why

A read-only audit of main at a02943e0 split the repo into five slices: core gateway, core agents and profiles, Electron plus CLI, UI, and build, CI and docs. Each slice had its own auditor. The top claims were then re-checked by hand. This spec records what was found, how sure we are of each item, the operator's decisions, and how the work splits into plans.

Evidence labels used below:

- **Reproduced.** Run end to end in a scratch HOME, with the output captured.
- **Code.** The cited lines were read and match the claim.
- **Auditor.** Reported by one auditor and not yet re-checked. The owning plan's first task for that item re-checks it.

## Findings

### Tier 1. Users lose their own agent settings

| ID | Finding | Evidence | Where |
|---|---|---|---|
| P1 | Applying then releasing a global Claude Code profile deletes the user's own `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`/`VERTEX`, `ANTHROPIC_MODEL` and `ANTHROPIC_BASE_URL`. An input env of those plus `USER_VALUE` ends as `{USER_VALUE}`. | Reproduced | `packages/core/src/profiles/service.ts:105-114`, `:452-463`, `:4039`, `:4055` |
| P2 | Release can restore a mixed `.ccr-backup-*` that still holds `ANTHROPIC_BASE_URL=http://127.0.0.1:3456` and LLMR's `apiKeyHelper`. Sequence: apply, release, user deletes `settings.json`, apply, release. Plain `claude` then points at a stopped gateway. The operator's real `~/.claude` holds three such backups. | Reproduced | `service.ts:3864-3895`, `:3916-3933`, `:3935` |
| P3 | A global Pi profile overwrites `~/.pi/agent/models.json` with no backup and never restores it. | Auditor (reproduced by the auditor in a scratch HOME) | `packages/core/src/agents/pi/profile-config.ts:57-71`, `:176-187` |
| P4 | A global Workbuddy profile overwrites `~/.workbuddy/models.json` with no backup or restore. | Auditor | `packages/core/src/agents/codex/app-launch.ts:318-331` |
| P5 | `.ccr-backup-*` files beside user config files are never pruned. | Code (6 in the operator's `~/.claude`, 17 in `~/.codex`) | `service.ts:3981`, `:3251` |
| P6 | Writes to user config files are plain `writeFileSync`, so a crash truncates them. | Auditor | `service.ts:3268`, `:3876`, `:3890` |
| P7 | Concurrent `applyProfileConfig` runs can interleave their writes. | Auditor (not run) | `service.ts:148-232` |

### Tier 2. Security

| ID | Finding | Evidence | Where |
|---|---|---|---|
| S1 | Plugin windows pass any URL scheme to `shell.openExternal`. A remote plugin page can hand `file:` or custom-scheme URLs to the OS. | Code | `packages/electron/src/main/windows.ts:209`, `:227`, `:377`, `:385` |
| S2 | With `proxy.enabled`, absolute-URL requests on the gateway port skip `authorize()` and the proxy adds the primary API key. Exposed only when the gateway binds a non-loopback host. | Code (defaults are off and `127.0.0.1`) | `packages/core/src/gateway/application/gateway-service.ts:525-531`, `packages/core/src/proxy/service.ts:390`, `:1253-1262` |
| S3 | `readRequestBody` has no size cap, and `/v1/oauth/token` reads the body before any key check. | Code | `packages/core/src/gateway/http/io.ts:308-315` |
| S4 | Network capture stores raw `Authorization`, `Cookie` and `Set-Cookie` headers and returns them through the network-capture MCP tool. | Code | `proxy/service.ts:769`, `:1734`, `packages/core/src/mcp/network-capture-mcp.ts:283` |
| S5 | A provider deep link makes the app probe the link's `baseUrl` before the user approves anything. | Code (the auto-start); auditor (the SSRF reach) | `packages/ui/src/pages/home/App.tsx:487-493`, `:1300-1325` |
| S6 | Remote-control sessions are global, so any API key can list, read and inject into another key's sessions. | Auditor | `packages/core/src/gateway/remote-control-service.ts:134-138`, `:219-237`, `:262-280` |
| S7 | The Chrome extension trusts any localhost page on any port to name the cookie import URL. | Code (manifest); auditor (the flow) | `extension/chrome/manifest.json`, `background.js:24`, `:206-235` |
| S8 | The main window, which carries the full preload, has no window-open or navigation guard. | Auditor | `windows.ts:61-101` |
| S9 | The top-level request error handler calls `writeHead(502)` even after headers were sent. | Auditor | `gateway-service.ts:527-536` |

### Tier 3. Fork identity and the CLI

| ID | Finding | Evidence | Where |
|---|---|---|---|
| F1 | README install links download upstream 3.1.3 and `npm install -g @musistudio/claude-code-router`. | Code | `README.md:10-19`, `:140-161`, `:186-190`, same in `README_zh.md` |
| F2 | Installed apps fetch the model catalog from upstream's `https://models.ccrdesk.top/models.json`. | Code | `packages/core/src/models/catalog-file.ts:7` |
| F3 | The appId `com.claudecoderouter.desktop` and the `ccr://` scheme equal upstream's, so side-by-side installs clash. | Code (compared against `v3.1.3`) | `electron-builder.json:2`, `:25-29` |
| F4 | The CLI command is still `ccr`. | Code | `packages/cli/package.json` |
| F5 | `~/.llm-router/bin/ccr-cli.js` refreshes only when the desktop app launches, so the CLI runs the previous release's JS after an upgrade. | Code, plus the operator's bin still reporting 4.3.1 | `packages/core/src/profiles/launch-service.ts:1657-1673`, `packages/electron/src/main/main-app.ts:58`, `:225` |
| F6 | The CLI calls `applyProfileConfig` before it looks the profile up, so a typo or `--version` rewrites global agent configs. There is no version flag. | Code | `packages/cli/src/cli.ts:122-125`, `:243-292` |

### Tier 4. Shipping pipeline and cleanup

| ID | Finding | Evidence |
|---|---|---|
| D1 | The Docker image runs as root, and its health check fetches nginx `/`. | Code, `Dockerfile:29-77` |
| D2 | `.dockerignore` lets about 350 MB of local state and a secret-bearing rendered gateway YAML into the build context. | Code |
| D3 | `docs.yml` builds the site but never deploys it. | Code |
| D4 | No checkout sets `persist-credentials: false`, and release permissions are workflow-wide. | Code |
| D5 | Windows, Linux and Docker releases all wait on the macOS job, and the image is never built before a tag. | Auditor |
| C1 | The four `bench:*` scripts point at a missing `benchmarks/` directory. | Code |
| C2 | The provider dialog's Chrome-import poll spins forever on a missing job and leaves rejections unhandled. | Code, `packages/ui/src/pages/home/components/providers.tsx:2925-2936` |
| C3 | Codex clients show a "CCR" badge in network logs. | Code, `packages/ui/src/pages/home/shared/network.ts:170-171` |
| C4 | `maskApiKey` shows two-thirds of a short key. | Code, `packages/ui/src/pages/home/shared/api-keys.ts:342-348` |
| C5 | The tray copies 29 home helpers, and 10 have drifted. | Auditor |
| C6 | 44 UI exports are never imported. | Auditor |
| C7 | `@types/node` is `^22` while `engines.node` is `>=24`. Dependabot watches only GitHub Actions. | Code |
| C8 | Async UI actions without error handling. These are `browser/main.tsx:83-88`, `App.tsx:353`, and a `copyApiKey` toast that shows on failure. | Auditor |

## Decisions

- **Model catalog.** Stop fetching from upstream and host the catalog in this public repository. The test-pinned `packages/core/models.json` snapshot is not refreshed between releases, so a dedicated branch `models-catalog` holds one `models.json`. A scheduled workflow regenerates it and force-pushes a single commit, so the branch never accumulates history. The app default becomes `https://raw.githubusercontent.com/jrmatherly/llm-router/models-catalog/models.json`. That URL serves the 23.5 MB file gzipped at 1.27 MB with `cache-control: max-age=300` (measured 2026-10-27). The R2 upload script and the `cdn/` Pages project are removed.
- **App identity.** Change the appId and the deep-link scheme, and rename the CLI command from `ccr` to `llmr`. There is no migration. Users uninstall the 4.x app and reinstall clean, as with the rebrand phase 2 data-dir move. This reverses the keep-list in `2026-10-25-rebrand-phase-2.md` for these identifiers only.
- **node-forge alert 111.** Dismiss it as "vulnerable code not used". Forge only signs certificates in `packages/core/src/proxy/certificates.ts` and never verifies a signature. No patched version exists (1.4.0 is the latest).

## Scope

In scope: every finding above.

Out of scope, kept as they are:

- Internal identifiers that are not a command or a scheme. These are `CCR_*` environment variables, `x-ccr-*` headers, `/__ccr/` paths, `window.ccr`, the `@ccr/` import alias, and the `.ccr-backup-*`/`.ccr-original` suffixes. Renaming them changes wire and file contracts with no user-visible gain.
- Splitting the large UI files (`dashboard.tsx` at 6497 lines and others). That is structure work with no defect behind it.
- Cross-process locking of profile writes. Plan 1 serializes writes inside one process. Whether the CLI and the desktop app overlap in practice is recorded as a risk.

## Plans

Each plan produces working, tested software on its own and lands as its own PR or PR series.

1. `docs/superpowers/plans/completed/2026-10-27-profile-config-safety.md`. P1 to P7.
2. `docs/superpowers/plans/completed/2026-10-27-security-hardening.md`. S1 to S9.
3. `docs/superpowers/plans/completed/2026-10-27-fork-identity.md`. F1 to F6 and the catalog decision.
4. `docs/superpowers/plans/completed/2026-10-27-pipeline-and-cleanup.md`. D1 to D5, C1 to C8, and the node-forge dismissal.

Plan 1 goes first, because its defects are already damaging the operator's own config. Plans 2 and 4 are independent of each other and of Plan 1. Plan 3 touches the CLI and launcher names that Plan 1's tests assert on, so it rebases after Plan 1 merges.
