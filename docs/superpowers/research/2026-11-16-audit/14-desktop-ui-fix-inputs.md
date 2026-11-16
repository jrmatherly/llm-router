# Research: desktop, UI, dependency and docs fix inputs

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

**Goal.** The owner wants a plan to fix the 2026-11-16 audit findings. This report covers the desktop, UI, dependency and docs items. I changed nothing in the repo. The only experiments ran on copies under `<session scratchpad>/desktop-ui-deps/`.

## 1. Answer
Every finding reproduced except two parts of item 2. The extension "per-job secret" adds nothing, because the job UUID already is one. Item 3's architecture test finds no current violation; all 13 `webPreferences` blocks already set the three flags. My recommendations, grouped into PRs:

- **PR A, Electron renderer hardening** (items 1, 3, 4, plus the update-service half of 5).
- **PR B, Chrome login import** (item 2, plus the chrome-login-import half of 5).
- **PR C, UI dependency cleanup** (items 6, 7, 8).
- **PR D, typecheck the TS tests** (the tsconfig part of item 9).
- **Docs-only, straight to `main`** (the rest of item 9).

## 2. Evidence (M = measured, I = inferred)
- Item 1. `normalizeBrowserUrl` (`built-in-browser.ts:938-952`) is private. Importing that module pulls in `pluginService` and registers IPC in its constructor (`:78-80`), so the function is not cheaply testable (M). A second copy sits in `browser-automation-mcp.ts:2036-2038` (`normalizeNavigationUrlForMatch`). If only one copy is fixed, automation URL matching breaks (M for the copy, I for the breakage).
- Electron under node. `require("electron")` returns a string, so named imports are `undefined` (M). Requiring `electron-updater` throws under node (M). `update-service.ts:22-29` calls `app.getVersion()` in a field initializer, so it cannot be imported in tests (M). Existing tests avoid electron by injecting dependencies (`provider-account-webcontent.test.ts`) or by testing pure functions.
- Item 2, ports. Chrome docs say a pattern with no port "match[es] all ports" (developer.chrome.com/docs/extensions/develop/concepts/match-patterns, M).
- Item 2, permissions. `permissions.request` must run inside a user gesture. After `permissions.remove`, a later `request()` "usually re-adds the permission without prompting" (…/reference/api/permissions, M). `action.openPopup()` works for all extensions from Chrome 127 (…/reference/api/action, M).
- Item 2, public suffixes. `npm ls tldts psl` is empty (M). `tldts` 7.5.4 has one dependency, `tldts-core` (M). The Electron main bundle inlines non-native deps; only electron, better-sqlite3 and builtins stay external (`build/esbuild.config.mjs:85-90,340`, M).
- Item 2, who creates jobs. Job creation is reachable from the agent tool (`browser-automation-mcp.ts:988`), IPC (`ipc.ts:149`) and the browser page (`built-in-browser.ts:346`) (M).
- Item 2, permissions in practice. `host_permissions` include `*://*/*`, so `ensureHostPermissions` always passes (M). `confirm.js` never checks `event.isTrusted` (M).
- Item 3, tray popover. It has no `will-navigate` or `setWindowOpenHandler` (grep, M). Only `ipc.ts` (80 handlers, all at column 0) and `built-in-browser.ts` call `ipcMain.handle`, and there is no `ipcMain.on` (M).
- Item 3, renderer URLs. Every renderer is `file://` via `pathToFileURL` (`windows.ts:286`, `tray-controller.ts:527`). There is no dev-server URL (M).
- Item 4, browser page CSP. `pages/browser/main.tsx` loads no images and makes no network calls; it uses only `window.llmrBrowser` (M).
- Item 6, what BaseUI adds. `BaseProvider` renders `LayersManager`, which outputs two sibling divs: an app container (here with `height:100%; min-height:0; min-width:0; width:100%` as Styletron atomic classes) and an empty layers container. It also adds document key and click listeners. `UIDReset` and `ThemeProvider` are context only. `LightTheme` adds no global CSS. Nothing imports a `baseui` component (M, `node_modules/baseui/helpers/base-provider.js`, `layer/layers-manager.js:180-218`).
- Items 6 and 7, lockfile simulation (scratch copy plus `npm install --package-lock-only --ignore-scripts`).
  - Root: removing the five overrides leaves the lockfile byte-identical. A fresh resolution picks js-yaml 4.3.2, brace-expansion 5.0.12, find-my-way 9.10.0 and fast-uri 3.1.9, and `npm audit` shows the same 6 moderate findings (the alert-144 minimatch chain) (M).
  - Root: removing baseui and the two styletron packages from root and `packages/ui`, plus root `dependencies`, drops 116 lock entries (core-js among them) and adds none (M).
  - Docs lockfile: the same removal drops 130 entries, core-js among them (M).
- Item 7, socks and the root manifest. `npm ls socks` is empty (M). The Electron app dir is `packages/electron` (`electron-builder.json` `directories.app`). Docker installs with `--include-workspace-root=false` (`Dockerfile:26`). So the root `dependencies` ship nowhere (M).
- Item 8. `git grep -w` finds only the definitions of `slugValue` and `providerAccountCurrentMeterDetail`. The `pluginRuntimeSurfacesEnabled` and `stringListValue` matches in core are different functions (M).
- Item 9, typecheck. A scratch tsconfig extending the root config, adding `packages/*/test/**/*.ts(x)` and `allowImportingTsExtensions`, gives 35 errors in 12 UI test files, none in electron tests (M). Files: `providers.test.ts` 16, `onboarding.test.tsx` 4, and the rest. Codes: TS2345 13, TS6133 11, other 11.
- Item 9, other facts.
  - `gh api …/private-vulnerability-reporting` returns `{"enabled":true}` (M).
  - `CLAUDE.local.md` is ignored only by `.git/info/exclude`, and `.superpowers/` only by its own nested `.gitignore` (M).
  - Outside `blog/`, only `README.md:23` (`llm-router.png`) and `scripts/llmr-rename.mjs:25` (`"blog/en/"`) refer to `blog/`, apart from historical notes under `docs/superpowers/`. `sponsors/` does not exist (M).
  - `build/docker-local-gateway.mjs:16-38` reads `LLMR_DOCKER_GATEWAY_SOURCE_DIR` and otherwise falls back to the lockfile's ai-gateway (M).

## 3. Plan inputs
**PR A. Electron renderer hardening (M).**
- **A1. Shared URL normaliser (S).**
  - New `packages/electron/src/main/browser-url.ts` exports `normalizeBrowserInput(value: string | undefined, homeUrl: string): string`. It uses `http://` when the host is localhost, 127.0.0.1 or [::1], and `https://` otherwise.
  - Delete `normalizeBrowserUrl` (`built-in-browser.ts:938-952`). Make `normalizeNavigationUrlForMatch` (`browser-automation-mcp.ts:2025-2040`) call the new function.
  - Test `packages/electron/test/unit/browser-url.test.ts`, case "normalizeBrowserInput uses http for loopback and https elsewhere". `localhost:3000` gives `http://localhost:3000`. `127.0.0.1:8080/x` and `[::1]:5173` likewise get http. `example.com` gives `https://example.com`. Free text and `file:///etc/passwd` give a Google search. Empty input gives `homeUrl`.
- **A2. Navigation guard (S).**
  - New `navigation-guard.ts` exports `guardRendererNavigation(webContents: Pick<WebContents,"on"|"setWindowOpenHandler">, allowedUrlPrefix: string, openExternal = shell.openExternal): void`. Lift the body from `windows.ts:97-107` and call it there and in `tray-controller.ts` after line 248, with the `pages/tray/index.html` file URL as the prefix.
  - Test `navigation-guard.test.ts`, case "denies window.open and forwards only http(s)": a fake records the handler. The handler returns `deny`, sends `https://…` to the fake opener, and drops `file:` URLs.
  - Case "allows renderer-page navigation and blocks the rest": `…/tray/index.html?mode=detail` is not prevented, while `https://example.com` and `file:///etc/passwd` are.
- **A3. IPC sender check (M).**
  - New `ipc-sender.ts` exports `isAppRendererFrame(frameUrl: string | undefined, rendererRootUrl: string): boolean` and `assertAppRendererSender(event: IpcMainInvokeEvent, rendererRootUrl: string): void`. The rule is that `event.senderFrame?.url` starts with `pathToFileURL(path.join(__dirname, "../renderer/"))`, trailing slash included. A null `senderFrame` is rejected.
  - In `ipc.ts`, add `function handle(channel, listener)` wrapping `ipcMain.handle` with the assertion. Then codemod `sed -i '' 's/^ipcMain\.handle(/handle(/' packages/electron/src/main/ipc.ts`, which touches all 80 lines.
  - Test `ipc-sender.test.ts`, case "accepts home and tray pages": both URLs pass, query strings included. Case "rejects other frames": `https://evil.example`, `file:///other/`, a `…/renderer-evil/` prefix trick and `undefined` all fail.
- **A4. Architecture test (S).** New `tests/architecture/electron-security.test.mjs`.
  - Case "every webPreferences block isolates the renderer": for each `webPreferences: {` block under `packages/electron/src`, the block contains `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false`. Today there are 13 and all pass.
  - Case "ipc.ts registers handlers only through the sender check": `ipc.ts` contains exactly one `ipcMain.handle(`.
  - Run with `node build/test.mjs architecture && node --test .test-dist/architecture/test/electron-security.test.js`.
- **A5. Deep links and CSP (S).**
  - In `deep-link.ts:131-133`, when the gateway is not running, call `dialog.showMessageBox({buttons:["Start gateway","Cancel"],cancelId:1,defaultId:0,message:…})` and return on Cancel.
  - Move `parsePluginDeepLinkRequest`, `boundedPluginId`, `resolveGatewayPluginAppUrl`, `normalizePluginAppUrl` and `normalizeGatewayPluginAppHost` (`:266-357`) into a new electron-free `deep-link-url.ts`. `built-in-browser.ts:1004-1012` duplicates the host normaliser and should use the moved one.
  - Test `deep-link-url.test.ts`, case "parses host and path forms": `llmr://plugin/foo/open` and `llmr:///plugin/foo?app=bar` parse. Case "rejects bad actions and ids": `/delete`, a 121-character id and `..%2F` throw. Case "ignores non-plugin links": the result is `undefined`. Case "resolves gateway paths": `0.0.0.0` becomes `127.0.0.1`, `::1` becomes `[::1]`, `//evil.com` and `javascript:` throw, and `https://…` passes through.
  - Add a CSP meta tag to `packages/ui/src/pages/browser/index.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`. Extend `ui-build-contract.test.mjs` with "every page declares a CSP with script-src 'self' and object-src 'none'".
- **A6. Update-service tests (S).**
  - Extract `deriveStatus`, `normalizeProgress`, `formatReleaseNotes`, `formatError` (renamed `formatUpdateError`) and a pure `silentFailureStatus(restore, error): Partial<AppUpdateStatus>` (from `:274-287`) into `update-status.ts`, which must not import electron or electron-updater.
  - Test `update-status.test.ts`, case "busy states disable check": `canDownload` is true only when available, `canInstall` only when downloaded, and an unsupported build disables everything. Case "release notes": string, array and null inputs. Case "signature errors get the friendly message". Case "progress drops non-finite numbers". Case "silent failure restores state": `checking` and `error` become `idle`, while `available` keeps its version.
- **Commands.** Run one file with `node build/test.mjs electron && node --test .test-dist/electron/test/unit/<name>.test.js`. Verify the change by hand in `npm run dev:electron`: type `localhost:3000`, and open `llmr://plugin/<id>/open` with the gateway stopped.

**PR B. Chrome login import (M).**
- **Electron side** (`chrome-login-import.ts`).
  - `normalizeImportDomain` rejects single labels other than `localhost`, and any host where `tldts.getPublicSuffix(host,{allowPrivateDomains:true}) === host`. Add `tldts` to `packages/electron` devDependencies; esbuild inlines it the way it does `electron-updater`.
  - Delete `setCorsHeaders` and the OPTIONS branch (`:122-127`, `:544-548`).
  - Return 403 when an `Origin` header is present and does not start with `chrome-extension://`.
  - Set `job.status = "importing"` before the awaits in `importLoginState`, so a second POST gets 409.
  - Call `server.unref()` at `:100`.
  - Export the class and add `chromeLoginImportInternalsForTest` (the same pattern as `provider-account-webcontent.ts:317`).
- **Electron test** `chrome-login-import.test.ts`, unit cases:
  - "normalizeImportDomain rejects TLDs and public suffixes": `com`, `co.uk` and `github.io` are rejected; `Sub.Example.com/x` becomes `sub.example.com`; `localhost` is kept.
  - "normalizeChromeCookie keeps only allowed, unexpired, unpartitioned cookies".
  - "normalizeLocalStorageEntry rejects non-http and foreign origins".
  - "readImportPayload rejects empty payloads".
  - "confirmation page escapes domains".
- **Electron test**, integration cases on a real node server:
  - "job JSON has no CORS header and rejects web origins": no `access-control-allow-origin` header, and `Origin: https://evil.example` gets 403.
  - "confirm page sends its CSP".
- **Extension side.**
  - `manifest.json`: `host_permissions` become `["http://127.0.0.1/*","http://localhost/*"]`, and `optional_host_permissions` become `["http://*/*","https://*/*"]`.
  - Popup: replace `popup.js` with a two-step popup. "Load job" sends `{type:"llmr-login-import-preview"}` to the background and renders the domains. The "Import" click calls `chrome.permissions.request({origins})` synchronously, because the user-gesture rule applies, then sends `llmr-login-import-run`.
  - Background: accept a run with no tab only when `sender.url === chrome.runtime.getURL("popup.html")`.
  - Content-script path: if `permissions.contains` is false, store the URL in `chrome.storage.session`, call `chrome.action.openPopup()`, and return "Grant access in the extension popup."
  - Single-label guard in `normalizeDomain`.
  - `confirm.js` ignores clicks unless `event.isTrusted`.
- **Extension architecture test.** Extend `tests/architecture/chrome-extension.test.mjs`.
  - "manifest requests remote hosts only optionally".
  - "popup delegates to the worker": `popup.js` no longer defines `readCookiesForDomains` or `normalizeImportUrl`.
  - "confirm requires a trusted click".
  - "worker rejects single-label domains": load `background.js` with `vm.runInNewContext(src,{chrome:{runtime:{onMessage:{addListener(){}}}},URL})` and call `normalizeDomain("com")`.
- **Docs.** Update `extension/chrome/README.md` and `docs/src/content/docs/en/configuration/toolhub.md:49-68,189`. The site-access step becomes a Chrome prompt.

**PR C. Dependency cleanup (S).**
- Delete `packages/ui/src/lib/baseui-provider.tsx`.
- In `home/main.tsx` and the four `docs/src/components/interactive/*Demo.tsx`, replace `<BaseUiProvider>` with `<div className="h-full w-full min-h-0 min-w-0">`.
- Remove `baseui`, `styletron-engine-atomic` and `styletron-react` from `packages/ui/package.json:17,24-25`, root `package.json:97,108-109` and `docs/package.json:24,28-29`.
- In root `package.json`, delete `dependencies` (`:78-85`), the five overrides (`fast-uri@3`, `find-my-way@9.6.0`, `minimatch@10.2.5`, `pm2`, `socks`) and `"core-js@2.6.12"` from `allowScripts`. Keep `@the-next-ai/ai-gateway.glob`, `@types/react` and `js-yaml`.
- Run `npm install` at the root and in `docs/` to regenerate both lockfiles.
- Edit `.claude/rules/ui.md` to drop "`baseui` only through `lib/baseui-provider.tsx`".
- Delete the four exports (`extensions.ts:630-632,688-698`, `provider-accounts.ts:68-76`).
- `npm audit` must still show exactly 6 moderate findings and nothing else.
- Visual check at 1366x768 and 390x844: the home page in `npm run dev:electron`, the web UI (`llmr ui`), and the four `docs/src/pages/guides/*-app.astro` demos. Compare screenshots before and after for the app filling the window with no scroll.

**PR D. Typecheck tests (M).** Add `"packages/*/test/**/*.ts"`, `"packages/*/test/**/*.tsx"` and `"allowImportingTsExtensions": true` to `tsconfig.json`, then fix the 35 UI-test errors. 11 of them are unused-variable errors.

**Docs-only commits to `main` (S).**
- **AGENTS.md:22**, corrected sentence: "the `gateway/service.ts` facade (20-line cap, no `GatewayService` class or `node:http`; it re-exports `gateway/application/gateway-service` and `routing/protocol-endpoints`, and no other gateway module imports it)".
- **blog/.** Move `blog/images/llm-router.png` to `.github/assets/llm-router.png`, repoint `README.md:23`, delete `blog/`, and drop `"blog/en/"` from `scripts/llmr-rename.mjs:25`. That script is code, so run `npm run test:architecture`.
- **LICENSE and packages/cli/LICENSE.** Keep the existing text and add a line under the original notice: `Copyright (c) 2025 musistudio` / `Copyright (c) 2026 Jason Matherly`.
- **SECURITY.md.** "Report vulnerabilities privately through GitHub: Security tab, Report a vulnerability. Do not open public issues. Only the latest release is supported."
- **.gitignore.** Add `CLAUDE.local.md` and `.superpowers/`.
- **README:201.** Replace the sibling-path sentence with: "Set `LLMR_DOCKER_GATEWAY_SOURCE_DIR` to a local ai-gateway checkout to pack it; otherwise the image uses the locked package." Add: "Release images: `ghcr.io/<owner>/llm-router:latest` (see `docker/README.md`)."

**Ordering.** In PR A, A3 lands before A4. In PR B, the manifest change and the popup rewrite must land together, or the popup loses its permissions. PR C needs both lockfiles regenerated in the same PR.

## 4. Risks and unknowns
- Two guesses (I) in PR B are untested. One is that extension service-worker fetches send `Origin: chrome-extension://<id>` while top-level confirm navigations send no Origin. The other is that `action.openPopup()` works from a content-script message without a user gesture. Check both in Chrome with the unpacked extension against a dev build.
- Residual risk after PR B. A malicious localhost page can still trigger a re-import for domains the user granted before, because Chrome may re-grant without prompting. Fully binding the extension to LLMR needs a pairing key, which is an owner call.
- Unverified: `senderFrame` on the tray popover after a `loadURL` mode switch. Verify by clicking through tray modes in the dev app.
- Unverified: BaseUI's document listeners may have been handling Escape for something. Grep found no BaseUI consumers. Press Esc in the home page dialogs after PR C.
- I did not run `npm run build:assets`, so the browser-page CSP and the renderer bundle without BaseUI are not built yet.

Not checked: the e2e suite, Windows behaviour, the `tldts` bundle size after minification, and whether `docs/superpowers` historical notes should mention the blog removal.
