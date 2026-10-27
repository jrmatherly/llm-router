# Rebrand phase 2: finish the move from Claude Code Router to LLM Router, with LLMR as the short name

Date: 2026-10-25. Status: approved for planning.

## Why

v4.1.0 renamed the packaging: product name, DMG, installers, artifact names and the README. Running the released app still shows the old brand in five places the owner screenshotted, and the CCR abbreviation remains across the product copy.

| Surface | Shows today | Source |
|---|---|---|
| macOS app menu | "Hide @claude-code-router/electron", "Quit @claude-code-router/electron" | Electron takes `app.name` from `packages/electron/package.json`, which has `name` "@claude-code-router/electron" and no `productName`. electron-builder packages that file (`directories.app`). |
| Tray window header and tray preview in Settings | "CCR" under the token count | Hardcoded in `packages/ui/src/pages/tray/components/status-strip.tsx:20` and `packages/ui/src/pages/home/components/settings.tsx:2696` |
| Share cards | "CCR" column header | `packages/ui/src/pages/home/components/share-cards.tsx:264` and `:500` |
| Onboarding error | "before starting CCR Gateway or opening an agent through CCR" | `packages/core/src/contracts/app.ts:1132`, Chinese copy in `packages/core/src/contracts/i18n.ts:35` |
| Onboarding import card | "CCR scanned this computer ..." | `packages/ui/src/pages/home/components/providers.tsx:1471` and two keys in `packages/ui/src/pages/home/shared/i18n.tsx` |
| Settings, Data section | `/Users/jason/.claude-code-router/...` | `APP_STORAGE_NAME` in `packages/core/src/runtime/app-paths.ts`; kept on purpose, see Deferred |

Measured on main 1989d687 (`git grep -P '(?<![A-Z_])CCR(?![A-Z_])'`, which excludes `CCR_` env names and identifiers):

| Area | Occurrences | Files |
|---|---|---|
| `packages/ui/src` | 140 | 19, of which 44 English translation keys and 50 Chinese values in `shared/i18n.tsx` |
| `packages/core/src` | 248 | 50 |
| `packages/electron/src` | 55 | 7 |
| `packages/cli/src` | 19 | 1 |
| `docs/src/content` | 1191 | 96 |
| `packages/electron/bundled-plugins` | 32 | 8, including the `plugin.json` descriptions the Extensions page shows and the built `index.cjs` artifacts, which have no source tree in this repo |
| `docs/src` outside `content` | about 25 | 16: twelve `.astro` guide pages, the docs layout, the nav structure, two demo components |
| `packages/*/test` and `tests/e2e` | 109 lines | assertions and fixtures that pin the old copy, including the e2e wait on "CCR web management is running at" |

Remaining literal "Claude Code Router" strings in `packages/`: a legacy app-name match in `packages/cli/src/cli.ts:964`, the legacy Windows config dir, the shell PATH block markers in `packages/core/src/profiles/launch-service.ts:27-28`, and the proxy CA subject in `packages/core/src/proxy/certificates.ts:48,52` with its keychain cleanup commands in `packages/core/src/proxy/service.ts`.

Two docs fixtures, `docs/src/components/interactive/fixtures-agent-analysis.json` and `fixtures-request-logs.json`, carry the upstream author's absolute path `/Volumes/Data/Products/claude-code-router/...` 100+ times.

## Decision

Keep a short name, but a new one. In every user-facing string the abbreviation "CCR" becomes "LLMR". Compound phrases follow:

| From | To |
|---|---|
| `CCR Desktop` | `LLMR Desktop` |
| `CCR Gateway` | `LLMR Gateway` |
| `CCR app` | `LLMR app` |
| `CCR service` | `LLMR service` |
| `CCR management service` | `LLMR management service` |
| `CCR plugin` | `LLMR plugin` |
| `CCR` alone | `LLMR` |

Chinese copy follows the same substitution; "CCR 网关" becomes "LLMR 网关".

Not renamed, because they are protocol or on-disk contracts that existing 4.0.1 and 4.1.0 installs depend on:

- `CCR_*` environment variables, `x-ccr-*` headers, `/__ccr/` routes, the `ccr://` scheme (276 distinct identifiers in `packages/*/src`).
- The `ccr` CLI command and its subcommands as typed by users (`ccr ui`, `ccr start`); copy that quotes a command keeps it.
- The npm package name `@musistudio/claude-code-router` and the `appId` `com.claudecoderouter.desktop`.
- The proxy CA subject "Claude Code Router CA" and its keychain cleanup commands. Renaming the CA forces every user through a new trust prompt and leaves the old CA trusted; that is a migration of its own.
- Code identifiers (`ClaudeCodeRouterPlugin`, `ccrRouterHttpRouteKey`, `@ccr/` import aliases, `window.ccr`), the gateway plugin id `claude-code-router`, and test fixtures that assert on them.
- Any string literal whose whole text is `CCR`. There are four: the MCP client name in `packages/core/src/mcp/tool-discovery.ts:30`, an account name in a Codex payload in `packages/core/src/agents/codex/app-net-responder.ts:48`, a profile-name fallback in `packages/core/src/agents/codex/cli-middleware-runtime.ts:5273`, and the three-letter client badge `clientInitial` returns in `packages/ui/src/pages/home/shared/network.ts:171`. They are identifiers that other software reads, not copy.
- The macOS proxy CA install dialog (`packages/electron/src/main/main-app.ts:141`) names the certificate as Keychain Access shows it, "Claude Code Router CA", rather than "LLM Router Proxy CA", until the CA itself is renamed.

Shell PATH blocks written into users' rc files by `launch-service.ts` carry the markers `# >>> Claude Code Router CLI >>>`. New writes use `# >>> LLM Router CLI >>>`; reads must recognize both so an existing block is replaced, not duplicated.

## Data directory (decided 2026-10-25, during implementation)

The owner withdrew the deferral. `APP_STORAGE_NAME` is `llm-router`: `~/.llm-router` on macOS and Linux, `%APPDATA%\llm-router` on Windows, `/data/.llm-router` in Docker; the desktop CLI launcher lives in `~/.llm-router/bin` and the shell PATH block points there. There is no migration from `~/.claude-code-router`: existing installs are uninstalled and reinstalled cleanly. The pre-4.0 JSON import reads from the new directory, and the Windows "Claude Code Router" legacy directory with its copy-on-startup is removed. Provider and plugin ids spelled `claude-code-router` are identifiers written into agent configs, not paths, and stay.

## Deferred, owner's call later

1. Renaming the proxy CA, with removal of the old trusted CA from the keychain.
2. Publishing the CLI under a new npm name.

## Done means

- The five screenshotted surfaces show LLM Router or LLMR, never CCR or @claude-code-router.
- `git grep -P '(?<![A-Z_])CCR(?![A-Z_])' -- packages/*/src docs/src/content` returns only lines that quote a `ccr` command, an identifier, or a path.
- `git grep --fixed-strings "Claude Code Router" -- packages` returns only the legacy service-name matcher, the PATH block legacy marker, and the CA strings.
- No source, plugin, Docker, docs or test path names `.claude-code-router`; `tests/architecture/rebrand-ccr.test.mjs` guards it.
- Typecheck, `build:assets` and every suite pass; the sweep script is committed so a reviewer can rerun it.
