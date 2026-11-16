# Audit pass: desktop app and UI

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

ISSUES

Slice: desktop app and UI (packages/electron, packages/ui, extension/, electron-builder.json, build/entitlements*.plist). This was a read-only pass. I ran no builds or tests.

- **Electron 42 is out of support** | high | confirmed
  - Evidence: `npm ls electron` → 42.11.18 (`package.json:99`, `packages/electron/package.json:17` pin `^42.3.3`). `npm view electron time` shows 42.11.18 and 45.0.0 both published 2026-10-21, and no 42.x since. The latest is 45.3.3, and dist-tags list 43/44/45 as current lines. Electron supports only the latest three majors, so 42 gets no more Chromium security fixes.
  - Impact: every user. It matters most for the built-in browser and plugin-app windows, which load arbitrary remote pages.
  - Recommendation: move to Electron 45. Your dependency notes already list the prerequisites: better-sqlite3 13 first, and `openAsHidden` removed from `launch-at-login.ts`. Your notes treat this as a code-needing major. This finding adds that it is now a security deadline. Size M.

- **Chrome login-import extension can be steered by any localhost listener, with no limit on domain breadth** | medium | likely
  - Evidence:
    - `extension/chrome/manifest.json`: the content script matches `http://127.0.0.1/chrome-import/jobs/*/confirm` with no port. The LLMR job server listens on a random port (`chrome-login-import.ts:100`), so the pattern must match any port.
    - `host_permissions` includes `http://*/*` and `https://*/*`, so `ensureHostPermissions` always passes.
    - `background.js` `normalizeImportUrl` only checks that the URL is same-origin with the sender tab and on 127.0.0.1/localhost.
    - On the app side, `normalizeImportDomain` (`chrome-login-import.ts:395`) accepts a bare TLD such as `com`. `cookieDomainMatches` then takes every `*.com` cookie. The MCP tool `browser_chrome_login_import` (`browser-automation-mcp.ts:984`) lets an agent pick the domains.
  - Impact: a developer with the unpacked extension installed is exposed in two ways:
    - One click on a fake confirm page served by any local process sends cookies for attacker-chosen domains to that process.
    - An agent (possibly prompt-injected) can ask for whole-TLD imports into the browser it drives.
  - Recommendation: pin the content script and import origin to LLMR's job server, for example a fixed port or a per-job secret the extension checks. Reject public-suffix and single-label domains in `normalizeImportDomain`. Narrow `host_permissions` to optional permissions requested per job. Size M.

- **What `extension/` is, and whether anything builds, tests or ships it**
  - Evidence:
    - It is an unpacked MV3 Chrome extension, "LLMR Login Import", version 0.1.0. It copies cookies and localStorage for selected domains from your real Chrome into LLMR's in-app browser.
    - Nothing builds, packages or ships it. The only reference outside docs is `tests/architecture/chrome-extension.test.mjs`, which runs two regex checks on manifest and source text. Users are told to "Load unpacked" from the repo (`docs/.../toolhub.md:51-58`).
    - `popup.js` re-implements about 200 lines of `background.js` (cookie dedupe, localStorage read, permission check, URL normalization).
  - Recommendation: have the popup message the background worker instead of keeping a second copy. Decide whether to ship it as a release asset or keep it dev-only. Size S.

- **Main-app IPC handlers never check who is calling, and the tray popover has no navigation guards** | low | confirmed
  - Evidence:
    - None of the roughly 70 `ipcMain.handle` calls in `ipc.ts` checks `event.sender`. These include `appSaveConfig`, `appOpenProfile` and `appExportData`. The built-in browser's handlers do check, via `assertBrowserSender` (`built-in-browser.ts:889`).
    - The tray popover (`tray-controller.ts:225-249`) loads the full-privilege `preload.js` but has no `will-navigate` or `setWindowOpenHandler`, unlike the main window (`windows.ts:97-107`).
  - Impact: nothing exploitable today: the tray has no links, the main window has no iframes, and no remote page gets the preload. But one future link in the tray could hand `window.llmr` to a remote page.
  - Recommendation: add the main window's two guards to the popover. Add a shared sender check: frame URL starts with the renderer file URL. Size S.

- **Windows builds are unsigned, so auto-update cannot check the publisher** | low-medium | confirmed
  - Evidence: `release.yml:259-309` sets no `CSC_LINK` or `WIN_CSC_LINK` for Windows, and `electron-builder.json` has no `win` signing settings. The updater is enabled whenever the app is packaged (`update-service.ts:328`).
  - Impact: SmartScreen warnings on install. Updates are trusted on the GitHub release's `latest.yml` hash alone.
  - Recommendation: add Authenticode signing (Azure Trusted Signing or a certificate), or write down that Windows updates are hash-only. Size M.

- **No tests for the risky Electron logic** | medium | confirmed
  - Evidence:
    - `packages/electron/test/unit` has only 6 files: external-url, launch-at-login, native-theme, permission-policy, provider-account-webcontent and tray-balance-progress.
    - Nothing tests `parsePluginDeepLinkRequest` or plugin-app URL normalization (`deep-link.ts:266-357`), the window navigation and window-open guards (`windows.ts`), or the cookie and localStorage filters in chrome-login-import.
    - No architecture test asserts `sandbox`/`contextIsolation` on windows or the presence of a CSP.
  - Recommendation: add unit tests for those pure functions, plus one architecture test that scans `new BrowserWindow`/`WebContentsView` for the required `webPreferences`. Size S–M.

- **An `llmr://plugin/<id>/open` link from any web page starts a stopped gateway without asking** | low | confirmed
  - Evidence: `deep-link.ts:131-138` calls `gatewayService.start` when the gateway is not running. It only needs an enabled plugin with an app, and no dialog appears.
  - Recommendation: ask for confirmation when the gateway was stopped. Size S.

- **The built-in browser's own page has no CSP** | low | confirmed
  - Evidence: `packages/ui/src/pages/browser/index.html` has no CSP meta tag, but it carries the `llmrBrowser` preload. Home and tray both declare a strict CSP.
  - Recommendation: copy the home page's CSP. Size S.

- **The built-in browser rewrites `localhost:3000` to `https://`** | low | confirmed
  - Evidence: `built-in-browser.ts:949-950` prefixes `https://` even for the localhost and 127.0.0.1 pattern it just matched, so plain-http dev servers fail to load.
  - Recommendation: use `http://` for loopback hosts. Size S.

- **Four unused UI exports** | low | confirmed
  - Evidence: running `rg -w` across the packages finds only their definitions:
    - `pluginRuntimeSurfacesEnabled`, `slugValue` and `stringListValue` in `ui/src/pages/home/shared/extensions.ts:630,688,696`
    - `providerAccountCurrentMeterDetail` in `ui/src/pages/home/shared/provider-accounts.ts:68`
  - Recommendation: delete them. Size S.

**Unverified leads**
- `com.apple.security.cs.disable-library-validation` in both plists may be broader than needed. The bundled better-sqlite3 is signed with your own Team ID. It may still be needed if gateway plugins load third-party `.node` files. To settle it, sign a build without it and load a plugin that has a native module.
- Whether the extension's no-port match pattern really matches every port. To settle it, load the extension and open `http://127.0.0.1:<other port>/chrome-import/jobs/x/confirm` with the expected element IDs.
- Whether a `window.open` from the tray would inherit `preload.js` (Electron's default inheritance). To settle it, add a test link in a dev build.

**Checked and found fine**
- Every BrowserWindow and WebContentsView sets `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` and `webSecurity` (in windows, tray, built-in browser, QR, chrome-import, web-search, webcontent and export render).
- Main and plugin windows: `setWindowOpenHandler` denies new windows and sends only http(s) links to the system browser through `openHttpExternal`. `appOpenExternal` enforces http(s).
- The built-in browser's IPC checks its sender. Its tabs have no preload, and new windows open only http(s) URLs.
- The permission policy is installed on every session (`main-app.ts:41`).
- Provider deep links are size-bounded, checked against provider-identity safety, and need a user confirmation dialog.
- The `llmr` scheme is registered only in packaged builds, behind a single-instance lock.
- Updater: no auto-download, no install-on-quit, and the feed override is env-only.
- RunAsNode is needed by the CLI and web-search MCP, so leaving fuses at their defaults is justified.
- No `dangerouslySetInnerHTML`. The one `innerHTML` (`update.tsx:295`) is entity decoding on a textarea, which does not create elements.
- API keys use `ProviderApiKeyInput`. No secrets in localStorage; the web token is in sessionStorage and removed from the URL.
- Every icon-only button I sampled has an `aria-label`.
- No non-English UI strings; `i18n.tsx` is a single English copy table.
- No leftover Claude Design or Ship UI. The routing editor stays for cursor-proxy by decision.
- Every UI source file is referenced (a few through `build/esbuild.config.mjs`).
- Empty `catch` blocks in the UI are parse helpers or cleanup.

Not checked: the gateway-side endpoints the UI calls (core slice), and whether every input field has a label.
