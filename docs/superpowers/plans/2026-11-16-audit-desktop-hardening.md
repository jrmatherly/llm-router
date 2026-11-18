# Audit remediation: desktop hardening and UI dependency cleanup implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix audit findings F-D4 to F-D11. The built-in browser loads plain-http loopback servers, every app IPC handler checks its caller, the tray popover cannot navigate away, deep links ask before they start the gateway, the Chrome login-import extension holds no standing access to every site, and the UI drops three packages that exist to render two divs.

**Architecture:** Three independent pull requests. DH-1 moves the risky Electron logic into small files that import no Electron runtime code, so `node:test` can load them, and wires each one in at a single place. DH-2 tightens both ends of the Chrome login import, the job server in the app and the unpacked extension. DH-3 deletes `baseui`, the two `styletron` packages, five dead overrides, the root `dependencies` block and four unused exports.

**Tech Stack:** TypeScript, Electron 42, `node:test`, esbuild, a Manifest V3 Chrome extension in plain JavaScript, `tldts` (new, DH-2 only), npm workspaces, Astro for the docs site.

**Spec:** `docs/superpowers/specs/2026-11-16-audit-remediation.md`

## Global Constraints

From the spec, verbatim:

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

Specific to this plan:

- Line numbers are from `136ad730`. Each edit also names a symbol or a text anchor. Trust the anchor when the two disagree.
- Read a file with Read before you edit it. The path-scoped rules in `.claude/rules/` load only on Read, Edit and Write.
- A new Electron source file that a test imports must not import `electron` or `electron-updater` at runtime. Use `import type` for their types. The test build keeps `electron` external, and under node `require("electron")` returns a path string, so a runtime named import is `undefined`.
- Electron tests are `*.test.ts` under `packages/electron/test/unit` or `packages/electron/test/integration`. They import sources as `@llmr/electron/main/<file>.ts`.
- `tsconfig.json` sets `noUnusedLocals`. When a move or a delete leaves a helper or an import unused, delete it. Do not silence the error.
- DH-1 and DH-2 are independent of each other and can be open at the same time.
- DH-2 adds one dependency, so it edits `packages/electron/package.json` and `package-lock.json`. DH-3 and EU-1 and EU-2 in the [Electron upgrade plan](completed/2026-11-16-audit-electron-upgrade.md) edit `package.json` and the lockfile too. Do not have DH-3 and an EU PR open at the same time. The [program index](2026-11-16-audit-remediation-index.md) puts DH-3 after EU-2. When DH-2 meets either of them, merge one, rebase the other, and regenerate the lockfile with `npm install`. Never resolve a lockfile conflict by hand.

## Review Focus

Each line has its pinning test or check in the task named.

1. An install path that holds a space, a `~` or a non-ASCII character. `pathToFileURL` writes `~` as `%7E` and Chromium does not, so a string-prefix sender check would reject every IPC call and the app would show no data. The check compares decoded paths (DH-1 Task 3, test "accepts frames under an encoded install path").
2. An extension POST that fails or sends bad JSON. The job must stay `pending` so the user can retry, and a second POST that arrives while the first is still open must get 409 (DH-2 Task 1, the integration test on concurrent POSTs).
3. A user who opens a plugin app from inside LLMR while the gateway is stopped. The new confirmation is for links from outside the app. The in-app button must still start the gateway without a prompt (DH-1 Task 7, step 3).
4. An import job for `localhost` or an IP address. The public-suffix rule must reject `com` and `github.io` and still accept these two (DH-2 Task 1, test "normalizeImportDomain rejects public suffixes and single labels").
5. A dialog on the home page that closed on Escape before DH-3. BaseUI's `LayersManager` added document key and click listeners. No component imports BaseUI, so nothing should depend on them, but nobody has pressed the key (DH-3 Task 4, step 4).

---

## DH-1: Electron renderer hardening

**Fixes:** F-D4, F-D5, F-D6, and the F-D8 gaps for the deep-link parser, the window guards and the update service.
**Depends on:** None.
**Branch:** `fix/electron-renderer-hardening`
**Size:** M
**Owner steps:** One. The sender check in Task 3 fails closed, and CI runs only on Ubuntu. RS-2 publishes the release automatically once every platform uploads, so there is no pause before it goes out. As soon as the release that carries DH-1 is out, install its Windows build once and confirm that the home page shows providers and settings. If the page is empty, the frame URL did not match the renderer root. Pull the release back with `gh release edit vX.Y.Z --draft`, report the value of `event.senderFrame?.url` from the main-process log, and fix forward.

**Status:** Merged 2026-11-17 as [PR 95](https://github.com/jrmatherly/llm-router/pull/95), squash commit `2b58ce11`. The review changed these points:

- `isAppRendererFrame` ignores the case of a Windows drive letter, adds the trailing slash to the root itself, and rejects a decoded path with a `..` segment. `assertAppRendererSender` logs the rejected frame URL and the expected root.
- `openPluginRequest` reads the gateway status again after the confirmation dialog closes.
- A loopback address followed by `?` or `#` also loads over http.
- `electron-security.test.mjs` also pins that `ipc.ts` uses no `ipcMain.on`, that every built-in browser handler calls `assertBrowserSender`, and that only `openPluginApp` skips the confirmation.

Task 7 ran from a script over CDP and the main-process inspector in an isolated home. Step 2 used a plain window that loads the tray page, not the real popover. Step 3 replaced `dialog.showMessageBox` with a recorder. The owner step on the Windows build is still open.

Found and left alone: opening the built-in browser sometimes logs "Renderer process crashed" when the app is launched with `--disable-gpu --no-sandbox`. Over 20 launches each, `main` at `5ba62899` crashed 6 times and the branch 5. A normal launch was not checked.

### File structure

| File | Responsibility |
|---|---|
| `packages/electron/src/main/browser-url.ts` (new) | Turns address-bar text into a URL. The only copy. |
| `packages/electron/src/main/navigation-guard.ts` (new) | Denies `window.open` and blocks navigation away from one renderer page. |
| `packages/electron/src/main/ipc-sender.ts` (new) | Decides whether an IPC caller is an app renderer frame. |
| `packages/electron/src/main/deep-link-url.ts` (new) | Parses `llmr://plugin/...` links and resolves plugin app URLs. Moved, not rewritten. |
| `packages/electron/src/main/update-status.ts` (new) | Pure update-status helpers. Moved, not rewritten. |
| `tests/architecture/electron-security.test.mjs` (new) | Pins the `webPreferences` flags, the single IPC registration point, the guards and the single normaliser. |

### Task 1: Shared browser URL normaliser (F-D4)

**Files:**
- Create: `packages/electron/src/main/browser-url.ts`
- Modify: `packages/electron/src/main/built-in-browser.ts` (callers at `:261`, `:482`, `:809`; delete `normalizeBrowserUrl` at `:938-952`)
- Modify: `packages/electron/src/main/browser-automation-mcp.ts:2026-2041` (`normalizeNavigationUrlForMatch`)
- Test: `packages/electron/test/unit/browser-url.test.ts`

**Interfaces:**
- Produces: `normalizeBrowserInput(value: string | undefined, homeUrl: string): string`. Task 3's architecture test checks that both callers use it.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrowserInput } from "@llmr/electron/main/browser-url.ts";

const home = "about:blank";
const search = (text: string) => `https://www.google.com/search?q=${encodeURIComponent(text)}`;

test("normalizeBrowserInput uses http for loopback and https elsewhere", () => {
  assert.equal(normalizeBrowserInput("localhost:3000", home), "http://localhost:3000");
  assert.equal(normalizeBrowserInput("localhost", home), "http://localhost");
  assert.equal(normalizeBrowserInput("127.0.0.1:8080/x", home), "http://127.0.0.1:8080/x");
  assert.equal(normalizeBrowserInput("[::1]:5173", home), "http://[::1]:5173");
  assert.equal(normalizeBrowserInput("example.com", home), "https://example.com");
  assert.equal(normalizeBrowserInput("http://example.com/a", home), "http://example.com/a");
});

test("normalizeBrowserInput searches for free text and non-http schemes", () => {
  assert.equal(normalizeBrowserInput("hello world", home), search("hello world"));
  assert.equal(normalizeBrowserInput("file:///etc/passwd", home), search("file:///etc/passwd"));
});

test("normalizeBrowserInput returns the home URL for empty input", () => {
  for (const value of [undefined, "", "   ", "ABOUT:BLANK"]) {
    assert.equal(normalizeBrowserInput(value, home), home);
  }
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/browser-url.test.js`
Expected: the build fails with `Cannot read file: …/packages/electron/src/main/browser-url.ts`.

- [ ] **Step 3: Implement `normalizeBrowserInput` in `browser-url.ts`**

Move the body of `normalizeBrowserUrl`. Take `homeUrl` as a parameter in place of the module constant and the `isBrowserHomeUrl` call. Split the last `if` in two. The loopback pattern `/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i` returns `http://${trimmed}`. A value that contains `.` returns `https://${trimmed}`. Import `isHttpUrl` from `./external-url`.

- [ ] **Step 4: Replace both copies**

In `built-in-browser.ts`, change the three calls to `normalizeBrowserInput(url, browserHomeUrl)` and delete `normalizeBrowserUrl`. `isBrowserHomeUrl` and `isHttpUrl` stay, because other code in the file uses them.

In `browser-automation-mcp.ts`, keep the empty check and the `isBlankPageUrl` or `isChromiumErrorPage` early return in `normalizeNavigationUrlForMatch`. Replace the three branches after them with `return normalizeUrlForComparison(normalizeBrowserInput(trimmed, ""));`.

This changes one automation case on purpose. A value with a non-http scheme now predicts the search URL, which is the page `navigateAutomationTab` loads for it.

- [ ] **Step 5: Run the test and the typecheck**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/browser-url.test.js && npm run typecheck`
Expected: 3 tests pass, and `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add packages/electron/src/main/browser-url.ts packages/electron/src/main/built-in-browser.ts packages/electron/src/main/browser-automation-mcp.ts packages/electron/test/unit/browser-url.test.ts
git commit -m "fix(electron): load loopback addresses over http in the built-in browser"
```

### Task 2: Navigation guard for the main window and the tray popover (F-D5)

**Files:**
- Create: `packages/electron/src/main/navigation-guard.ts`
- Modify: `packages/electron/src/main/windows.ts:96-107` (anchor: `const rendererUrl = this.resolveRendererUrl("pages/home/index.html");`)
- Modify: `packages/electron/src/main/tray-controller.ts:261` (anchor: `void this.popover.loadURL(createTrayPageUrl("menu"));`)
- Test: `packages/electron/test/unit/navigation-guard.test.ts`

**Interfaces:**
- Consumes: `openHttpExternal(url, open)` from `./external-url`.
- Produces: `guardRendererNavigation(webContents: Pick<WebContents, "on" | "setWindowOpenHandler">, allowedUrlPrefix: string, open: (url: string) => Promise<void>): void`. `WebContents` is a type-only import.

- [ ] **Step 1: Write the failing test**

Build a fake with two members. `on(event, listener)` stores the listener by event name. `setWindowOpenHandler(handler)` stores the handler. Cast the fake to `any` at the call.

```ts
const trayUrl = "file:///app/dist/renderer/pages/tray/index.html";

test("guardRendererNavigation denies window.open and forwards only http(s)", () => {
  const opened: string[] = [];
  const fake = fakeWebContents();
  guardRendererNavigation(fake.webContents, trayUrl, async (url) => { opened.push(url); });
  assert.deepEqual(fake.open("https://example.com/a"), { action: "deny" });
  assert.deepEqual(fake.open("file:///etc/passwd"), { action: "deny" });
  assert.deepEqual(opened, ["https://example.com/a"]);
});

test("guardRendererNavigation allows the renderer page and blocks the rest", () => {
  const opened: string[] = [];
  const fake = fakeWebContents();
  guardRendererNavigation(fake.webContents, trayUrl, async (url) => { opened.push(url); });
  assert.equal(fake.navigate(`${trayUrl}?mode=detail`), false);
  assert.equal(fake.navigate("https://example.com"), true);
  assert.equal(fake.navigate("file:///etc/passwd"), true);
  assert.deepEqual(opened, ["https://example.com"]);
});
```

`fake.open(url)` calls the stored handler with `{ url }` and returns its result. `fake.navigate(url)` calls the stored `will-navigate` listener with `{ preventDefault }` and the URL, and returns whether `preventDefault` ran.

- [ ] **Step 2: Run it and see it fail**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/navigation-guard.test.js`
Expected: the build fails with `Cannot read file: …/packages/electron/src/main/navigation-guard.ts`.

- [ ] **Step 3: Implement `guardRendererNavigation`**

Lift the two handlers from `windows.ts:97-107` unchanged, with `rendererUrl` renamed to `allowedUrlPrefix` and `shell.openExternal` replaced by `open`.

- [ ] **Step 4: Use it in both windows**

In `windows.ts`, replace the two handlers with `guardRendererNavigation(window.webContents, rendererUrl, shell.openExternal);`. Leave the plugin app window guards (`:184-235` and `:379-392`) alone. They allow a different set of URLs.

In `tray-controller.ts`, add `shell` to the `electron` import. Before the `loadURL` call in `ensurePopover`, add `guardRendererNavigation(this.popover.webContents, pathToFileURL(path.join(__dirname, "../renderer/pages/tray/index.html")).toString(), shell.openExternal);`. `createTrayPageUrl` builds its URL from the same path, so reuse one constant for both.

- [ ] **Step 5: Run the test and the typecheck**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/navigation-guard.test.js && npm run typecheck`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/electron/src/main/navigation-guard.ts packages/electron/src/main/windows.ts packages/electron/src/main/tray-controller.ts packages/electron/test/unit/navigation-guard.test.ts
git commit -m "fix(electron): guard tray popover navigation like the main window"
```

### Task 3: IPC sender check and the Electron architecture test (F-D5)

**Files:**
- Create: `packages/electron/src/main/ipc-sender.ts`
- Create: `tests/architecture/electron-security.test.mjs`
- Modify: `packages/electron/src/main/ipc.ts` (all 80 top-level `ipcMain.handle(` calls, first at `:69`)
- Test: `packages/electron/test/unit/ipc-sender.test.ts`

**Interfaces:**
- Produces: `isAppRendererFrame(frameUrl: string | undefined, rendererRootUrl: string): boolean` and `assertAppRendererSender(event: Pick<IpcMainInvokeEvent, "senderFrame">, rendererRootUrl: string): void`. `IpcMainInvokeEvent` is a type-only import.

The 11 handlers in `built-in-browser.ts:340-387` already call `assertBrowserSender`. They stay as they are.

- [ ] **Step 1: Write the failing unit test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { assertAppRendererSender, isAppRendererFrame } from "@llmr/electron/main/ipc-sender.ts";

const root = "file:///app/dist/renderer/";

test("isAppRendererFrame accepts the home, tray and browser pages", () => {
  for (const page of ["pages/home/index.html", "pages/tray/index.html?mode=menu", "pages/browser/index.html#x"]) {
    assert.equal(isAppRendererFrame(`${root}${page}`, root), true, page);
  }
});

test("isAppRendererFrame rejects other frames", () => {
  for (const url of [undefined, "", "not a url", "https://evil.example/app/dist/renderer/pages/home/index.html", "file:///other/index.html", "file:///app/dist/renderer-evil/index.html", "file://host/app/dist/renderer/pages/home/index.html"]) {
    assert.equal(isAppRendererFrame(url, root), false, String(url));
  }
});

test("isAppRendererFrame accepts frames under an encoded install path", () => {
  const spaced = pathToFileURL("/Applications/LLM Router.app/Contents/Resources/app.asar/dist/renderer/").toString();
  assert.equal(isAppRendererFrame("file:///Applications/LLM%20Router.app/Contents/Resources/app.asar/dist/renderer/pages/home/index.html", spaced), true);
  assert.equal(isAppRendererFrame("file:///C:/Users/JASONM~1/app/renderer/pages/home/index.html", "file:///C:/Users/JASONM%7E1/app/renderer/"), true);
});

test("assertAppRendererSender throws for a missing or foreign frame", () => {
  assert.throws(() => assertAppRendererSender({ senderFrame: null }, root), /only available to LLM Router windows/);
  assert.throws(() => assertAppRendererSender({ senderFrame: { url: "https://evil.example/" } } as any, root), /only available to LLM Router windows/);
  assert.doesNotThrow(() => assertAppRendererSender({ senderFrame: { url: `${root}pages/home/index.html` } } as any, root));
});
```

- [ ] **Step 2: Write the failing architecture test**

`tests/architecture/electron-security.test.mjs` reads sources from `packages/electron/src/main` with `readFileSync`, relative to the repo root, as `chrome-extension.test.mjs` does. Four cases:

```js
test("every webPreferences block isolates the renderer", () => {
  let blocks = 0;
  for (const [file, source] of mainSources()) {
    const matches = [...source.matchAll(/webPreferences: \{([^{}]*)\}/g)];
    assert.equal(matches.length, source.split("webPreferences: {").length - 1, `${file} has a webPreferences block this test cannot read`);
    for (const [, body] of matches) {
      blocks += 1;
      for (const flag of ["contextIsolation: true", "sandbox: true", "nodeIntegration: false"]) {
        assert.ok(body.includes(flag), `${file} is missing ${flag}`);
      }
    }
  }
  assert.ok(blocks >= 13);
});

test("ipc.ts registers handlers only through the sender check", () => {
  const ipc = readFileSync("packages/electron/src/main/ipc.ts", "utf8");
  assert.equal(ipc.split("ipcMain.handle(").length - 1, 1);
  assert.match(ipc, /assertAppRendererSender\(event, rendererRootUrl\)/);
  const registrars = mainSources().filter(([, source]) => /ipcMain\.(handle|on)\(/.test(source)).map(([file]) => file);
  assert.deepEqual(registrars, ["built-in-browser.ts", "ipc.ts"]);
});

test("the main window and the tray popover guard navigation", () => {
  for (const file of ["windows.ts", "tray-controller.ts"]) {
    assert.match(readFileSync(`packages/electron/src/main/${file}`, "utf8"), /guardRendererNavigation\(/, file);
  }
});

test("the address bar and automation share one URL normaliser", () => {
  for (const file of ["built-in-browser.ts", "browser-automation-mcp.ts"]) {
    const source = readFileSync(`packages/electron/src/main/${file}`, "utf8");
    assert.match(source, /normalizeBrowserInput\(/, file);
    assert.doesNotMatch(source, /`https:\/\/\$\{trimmed\}`/, file);
  }
});
```

`mainSources()` returns `[file, source]` pairs for the `.ts` files in `packages/electron/src/main`, sorted by name.

- [ ] **Step 3: Run both and see them fail**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/ipc-sender.test.js`
Expected: the build fails with `Cannot read file: …/packages/electron/src/main/ipc-sender.ts`.

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/electron-security.test.js`
Expected: "ipc.ts registers handlers only through the sender check" fails with `80 !== 1`. The other three cases pass, because Tasks 1 and 2 are in and all 13 blocks already set the three flags.

- [ ] **Step 4: Implement `ipc-sender.ts`**

`isAppRendererFrame` parses both arguments with `new URL`. It returns true only when both protocols are `file:`, both `host` values are equal, and `decodeURIComponent(frame.pathname).startsWith(decodeURIComponent(root.pathname))`. Any thrown error returns false. Do not compare the raw strings. Review Focus 1 says why.

`assertAppRendererSender` throws `new Error("This IPC channel is only available to LLM Router windows.")` unless `isAppRendererFrame(event.senderFrame?.url, rendererRootUrl)` is true.

- [ ] **Step 5: Run the codemod on `ipc.ts`**

```bash
perl -pi -e 's/^ipcMain\.handle\(/handle(/' packages/electron/src/main/ipc.ts
grep -c '^handle(' packages/electron/src/main/ipc.ts
grep -c 'ipcMain\.handle(' packages/electron/src/main/ipc.ts
```

Expected: `80`, then `0`. The count was checked against `136ad730` with a dry run of the same expression. If the first number is not 80, an earlier PR added or removed handlers. Confirm that every new one starts at column 0, then continue.

- [ ] **Step 6: Add the wrapper to `ipc.ts`**

Add `import { pathToFileURL } from "node:url";` and the `./ipc-sender` import. Above the first `handle(` call (anchor: `handle(IPC_CHANNELS.appGetInfo`), add:

```ts
const rendererRootUrl = pathToFileURL(path.join(__dirname, "../renderer/")).toString();

function handle(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertAppRendererSender(event, rendererRootUrl);
    return listener(event, ...args);
  });
}
```

`pathToFileURL` keeps the trailing slash, which is what stops `renderer-evil/` from matching.

- [ ] **Step 7: Run the tests and the typecheck**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/ipc-sender.test.js && node build/test.mjs architecture && node --test .test-dist/architecture/test/electron-security.test.js && npm run typecheck`
Expected: 4 unit tests and 4 architecture tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/electron/src/main/ipc-sender.ts packages/electron/src/main/ipc.ts packages/electron/test/unit/ipc-sender.test.ts tests/architecture/electron-security.test.mjs
git commit -m "fix(electron): check the sender frame on every app IPC handler"
```

### Task 4: Deep-link URL module and the gateway-start confirmation (F-D6)

**Files:**
- Create: `packages/electron/src/main/deep-link-url.ts`
- Modify: `packages/electron/src/main/deep-link.ts` (`:11-15` type, `:91-158` request handling, `:266-357` moved functions)
- Test: `packages/electron/test/unit/deep-link-url.test.ts`

**Interfaces:**
- Produces: `type PluginDeepLinkRequest = { appId?: string; pluginId: string; rawUrl: string }`, `parsePluginDeepLinkRequest(rawUrl: string): PluginDeepLinkRequest | undefined`, `resolveGatewayPluginAppUrl(config: AppConfig, url: string): string`.

Do not merge `normalizeGatewayPluginAppHost` with `normalizeGatewayBrowserAppHost` in `built-in-browser.ts:1009-1013`. The two disagree on `::` and `[::]`, and no finding covers that difference.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "@llmr/core/contracts/app";
import { parsePluginDeepLinkRequest, resolveGatewayPluginAppUrl } from "@llmr/electron/main/deep-link-url.ts";

const gateway = (host: string) => ({ gateway: { host, port: 3456 } }) as AppConfig;

test("parsePluginDeepLinkRequest parses host and path forms", () => {
  assert.deepEqual(parsePluginDeepLinkRequest("llmr://plugin/foo/open"), { pluginId: "foo", rawUrl: "llmr://plugin/foo/open" });
  assert.deepEqual(parsePluginDeepLinkRequest("llmr:///plugin/foo?app=bar"), { appId: "bar", pluginId: "foo", rawUrl: "llmr:///plugin/foo?app=bar" });
});

test("parsePluginDeepLinkRequest rejects bad actions and ids", () => {
  assert.throws(() => parsePluginDeepLinkRequest("llmr://plugin/foo/delete"), /Unsupported plugin link action: delete/);
  assert.throws(() => parsePluginDeepLinkRequest(`llmr://plugin/${"a".repeat(121)}/open`), /Invalid plugin id/);
  assert.throws(() => parsePluginDeepLinkRequest("llmr://plugin/..%2F/open"), /Invalid plugin id/);
  assert.throws(() => parsePluginDeepLinkRequest("llmr://plugin"), /Plugin id is required/);
});

test("parsePluginDeepLinkRequest ignores links that are not plugin links", () => {
  assert.equal(parsePluginDeepLinkRequest("llmr://provider?name=x"), undefined);
  assert.equal(parsePluginDeepLinkRequest("https://plugin/foo/open"), undefined);
});

test("resolveGatewayPluginAppUrl resolves gateway paths and rejects other schemes", () => {
  assert.equal(resolveGatewayPluginAppUrl(gateway("0.0.0.0"), "/apps/x"), "http://127.0.0.1:3456/apps/x");
  assert.equal(resolveGatewayPluginAppUrl(gateway("::1"), "apps/x"), "http://[::1]:3456/apps/x");
  assert.equal(resolveGatewayPluginAppUrl(gateway("127.0.0.1"), "https://example.com/a"), "https://example.com/a");
  assert.throws(() => resolveGatewayPluginAppUrl(gateway("127.0.0.1"), "//evil.com"), /protocol-relative/);
  assert.throws(() => resolveGatewayPluginAppUrl(gateway("127.0.0.1"), "javascript:alert(1)"), /http\(s\) URL or an LLMR gateway path/);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/deep-link-url.test.js`
Expected: the build fails with `Cannot read file: …/packages/electron/src/main/deep-link-url.ts`.

- [ ] **Step 3: Move the functions**

Move `PluginDeepLinkRequest`, `parsePluginDeepLinkRequest`, `boundedPluginId`, `resolveGatewayPluginAppUrl`, `normalizePluginAppUrl` and `normalizeGatewayPluginAppHost` into `deep-link-url.ts` with no change to their bodies. Export the three names in the Interfaces block. The new file imports `appDeepLinkProtocol` from `@llmr/core/contracts/deep-link` and `AppConfig` as a type. `deep-link.ts` imports the three names back.

- [ ] **Step 4: Run the test**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/deep-link-url.test.js`
Expected: 4 tests pass.

- [ ] **Step 5: Ask before an outside link starts the gateway**

In `deep-link.ts`, give `openPluginRequest` a second parameter, `options: { confirmGatewayStart: boolean }`. `handlePluginRequest` and `flushPendingPluginRequests` pass `true`. `openPluginApp`, which the in-app button reaches through `IPC_CHANNELS.appOpenPluginApp`, passes `false`.

After the `resolvePluginApp` check and before `gatewayService.start` (anchor: `const startedGateway = currentStatus.state !== "running";`), add:

```ts
if (startedGateway && options.confirmGatewayStart) {
  const { response } = await dialog.showMessageBox({
    buttons: ["Start gateway", "Cancel"],
    cancelId: 1,
    defaultId: 1,
    detail: "A link asked LLM Router to open this plugin app. The gateway is stopped and has to start first.",
    message: `Open the plugin app "${pluginApp.name}"?`,
    type: "question"
  });
  if (response !== 0) {
    return;
  }
}
```

Cancel is the default button, so a stray Enter does not start the gateway. This branch has no unit test, because `deep-link.ts` imports Electron at runtime. Task 7 checks it in the app.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no output.

```bash
git add packages/electron/src/main/deep-link-url.ts packages/electron/src/main/deep-link.ts packages/electron/test/unit/deep-link-url.test.ts
git commit -m "fix(electron): confirm before a plugin deep link starts the gateway"
```

### Task 5: CSP for the built-in browser page (F-D6)

**Files:**
- Modify: `packages/ui/src/pages/browser/index.html` (after the `viewport` meta tag)
- Modify: `tests/architecture/ui-build-contract.test.mjs` (add one case)

- [ ] **Step 1: Write the failing test**

Add to `ui-build-contract.test.mjs`, with `existsSync` and `readdirSync` added to the `node:fs` import:

```js
test("every renderer page declares a CSP that blocks remote scripts and plugins", () => {
  const pagesRoot = path.join(process.cwd(), "packages", "ui", "src", "pages");
  const pages = readdirSync(pagesRoot).filter((name) => existsSync(path.join(pagesRoot, name, "index.html"))).sort();
  assert.deepEqual(pages, ["browser", "home", "tray"]);
  for (const page of pages) {
    const html = readFileSync(path.join(pagesRoot, page, "index.html"), "utf8");
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? "";
    assert.match(csp, /script-src 'self';/, page);
    assert.match(csp, /object-src 'none'/, page);
  }
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/ui-build-contract.test.js`
Expected: the new case fails on `browser`.

- [ ] **Step 3: Add the meta tag**

Use the same two-line form as `pages/home/index.html`. The content is:

`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`

The page is the toolbar only. Tabs are separate `WebContentsView`s and the meta tag does not apply to them. `pages/browser/main.tsx` has no `<img>` and no `fetch`, which is why `connect-src` is `'none'` here and not the home page's loopback list.

- [ ] **Step 4: Run the test and commit**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/ui-build-contract.test.js`
Expected: 2 tests pass.

```bash
git add packages/ui/src/pages/browser/index.html tests/architecture/ui-build-contract.test.mjs
git commit -m "fix(ui): give the built-in browser page a CSP"
```

### Task 6: Pure update-status helpers (F-D8)

**Files:**
- Create: `packages/electron/src/main/update-status.ts`
- Modify: `packages/electron/src/main/update-service.ts` (`:22-29` initializer, `:274-287` `publishSilentCheckFailure`, `:317-325` `deriveStatus`, `:334-373` helpers)
- Test: `packages/electron/test/unit/update-status.test.ts`

**Interfaces:**
- Produces, all in `update-status.ts`:
  - `deriveStatus(status: AppUpdateStatus): AppUpdateStatus`
  - `normalizeProgress(progress: ProgressInfo): AppUpdateStatus["progress"]`
  - `formatReleaseNotes(notes: UpdateInfo["releaseNotes"]): string | undefined`
  - `formatUpdateError(error: unknown): string` (today's `formatError`)
  - `silentFailureStatus(restoreStatus: AppUpdateStatus, error: unknown): Partial<AppUpdateStatus>` (the object `publishSilentCheckFailure` builds today)

`ProgressInfo` and `UpdateInfo` are `import type` from `electron-updater`. A runtime import of `electron-updater` throws under node.

- [ ] **Step 1: Write the failing test**

```ts
const base: AppUpdateStatus = { canCheck: false, canDownload: false, canInstall: false, currentVersion: "1.0.0", state: "idle", supported: true };

test("deriveStatus enables one action per state", () => {
  assert.deepEqual(pick(deriveStatus(base)), { canCheck: true, canDownload: false, canInstall: false });
  for (const state of ["checking", "downloading", "installing"] as const) {
    assert.equal(deriveStatus({ ...base, state }).canCheck, false, state);
  }
  assert.equal(deriveStatus({ ...base, state: "available" }).canDownload, true);
  assert.equal(deriveStatus({ ...base, state: "downloaded" }).canInstall, true);
  assert.deepEqual(pick(deriveStatus({ ...base, state: "available", supported: false })), { canCheck: false, canDownload: false, canInstall: false });
});

test("formatReleaseNotes handles strings, lists and null", () => {
  assert.equal(formatReleaseNotes("  notes  "), "notes");
  assert.equal(formatReleaseNotes("   "), undefined);
  assert.equal(formatReleaseNotes([{ note: "a", version: "1.1.0" }, { note: null, version: "1.2.0" }]), "1.1.0\na\n\n1.2.0");
  assert.equal(formatReleaseNotes(null), undefined);
});

test("formatUpdateError replaces code-signature errors with advice", () => {
  assert.equal(formatUpdateError(new Error("Code signature at URL file:///x did not pass validation")), "Downloaded update failed code-signature validation. Download the latest installer manually, or try again after the package is re-signed.");
  assert.equal(formatUpdateError(new Error("boom")), "boom");
  assert.equal(formatUpdateError("plain"), "plain");
});

test("normalizeProgress drops non-finite numbers", () => {
  assert.deepEqual(normalizeProgress({ bytesPerSecond: Number.NaN, delta: 0, percent: 50, total: Number.POSITIVE_INFINITY, transferred: 10 }), { bytesPerSecond: undefined, percent: 50, total: undefined, transferred: 10 });
});

test("silentFailureStatus restores the earlier state", () => {
  assert.equal(silentFailureStatus({ ...base, state: "checking" }, new Error("offline")).state, "idle");
  assert.equal(silentFailureStatus({ ...base, state: "error" }, new Error("offline")).state, "idle");
  const restored = silentFailureStatus({ ...base, availableVersion: "2.0.0", state: "available" }, new Error("offline"));
  assert.equal(restored.state, "available");
  assert.equal(restored.availableVersion, "2.0.0");
  assert.equal(restored.lastError, "offline");
});
```

`pick` returns `{ canCheck, canDownload, canInstall }` from a status.

- [ ] **Step 2: Run it and see it fail**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/update-status.test.js`
Expected: the build fails with `Cannot read file: …/packages/electron/src/main/update-status.ts`.

- [ ] **Step 3: Move the helpers**

Move `normalizeProgress`, `finiteNumber`, `formatReleaseNotes`, `formatError` (renamed) and `isCodeSignatureValidationError` unchanged. Turn the `deriveStatus` method into the exported function. Build `silentFailureStatus` from the object literal in `publishSilentCheckFailure`, which becomes `return this.publishStatus(silentFailureStatus(restoreStatus, error));`. In `update-service.ts`, replace `this.deriveStatus(` with `deriveStatus(` at both places and `formatError(` with `formatUpdateError(` at every call.

- [ ] **Step 4: Run the test and the typecheck, then commit**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/update-status.test.js && npm run typecheck`
Expected: 5 tests pass.

```bash
git add packages/electron/src/main/update-status.ts packages/electron/src/main/update-service.ts packages/electron/test/unit/update-status.test.ts
git commit -m "refactor(electron): extract pure update-status helpers and test them"
```

### Task 7: Check in the running app, then open the PR

No test covers these four. Record each result in the PR description.

Start every app in this task in an isolated home, as Task 5 Step 3 of the [Electron upgrade plan](completed/2026-11-16-audit-electron-upgrade.md) does. A build started with the real home can rewrite the owner's `~/.claude` and `~/.codex` files. Run `T="$(mktemp -d)"` once in the terminal that starts the app, and use that terminal for each launch below.

- [ ] **Step 1: Loopback address.** In a second terminal run `python3 -m http.server 3000`. Run `HOME="$T" LLMR_INTERNAL_HOME_DIR="$T" npm run dev:electron`, open the built-in browser, and type `localhost:3000`. Expected: the directory listing loads and the address bar shows `http://localhost:3000/`.

- [ ] **Step 2: Tray popover sender frame (unverified until this step).** Nobody has observed `event.senderFrame` on the tray popover. At `136ad730` the popover loads its page once (`tray-controller.ts:261`) and opens the provider detail through IPC (`setDetailOpen`), not through a second `loadURL`. In the dev app, open the tray popover, open a provider's detail, close it, hide the popover, and show it again. Expected: usage numbers render each time, and the terminal shows no `only available to LLM Router windows` error. If the error appears, stop. Log `event.senderFrame?.url` in `assertAppRendererSender`, fix the comparison, add the observed URL to `ipc-sender.test.ts`, and repeat this step.

- [ ] **Step 3: Deep-link confirmation.** This step needs a config with an enabled plugin that has an app. Quit every running LLM Router. Run `npm run build:assets`, restore the generated files as Global Constraints says, then run `HOME="$T" LLMR_INTERNAL_HOME_DIR="$T" node_modules/.bin/electron . "llmr://plugin/<plugin-id>/open"`. The plugin must be installed and enabled in that isolated home first. Expected: the dialog from Task 4 appears with Cancel as the default, Cancel leaves the gateway stopped, and a second run with Start gateway opens the plugin app. Then stop the gateway and open the same plugin app from the Extensions page. Expected: it opens with no dialog (Review Focus 3). Without such a plugin the link shows "Failed to open LLMR plugin app" before the dialog. Say so in the PR and ask the reviewer to read the branch in Task 4 step 5.

- [ ] **Step 4: Browser page CSP.** Run `HOME="$T" LLMR_INTERNAL_HOME_DIR="$T" ELECTRON_ENABLE_LOGGING=1 npm run dev:electron` and open the built-in browser. Expected: the toolbar is styled, tabs open and close, the key button opens the Chrome import dialog, and the terminal prints no line that contains `Content Security Policy`. If one appears, it names the blocked directive. Widen only that directive and note it in the PR.

- [ ] **Step 5: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:electron
npm run test:ui
npm run test:e2e
git checkout -- packages/core/models.json packages/ui/src/generated
```

Expected: every command exits 0. `npm run test:e2e` drives the built app through the preload, so it fails if the sender check rejects real IPC calls. Run `npm run test:e2e:install` first if Playwright's Chromium is not installed.

- [ ] **Step 6: Open the PR** from `fix/electron-renderer-hardening`. Squash-merge title: `fix(electron): harden renderer navigation, IPC senders and deep links`.

---

## DH-2: Chrome login import

**Fixes:** F-D7, and the F-D8 gap for the login-import filters.
**Depends on:** None. See Global Constraints for the lockfile overlap with DH-3, EU-1 and EU-2.
**Branch:** `fix/chrome-login-import-hardening`
**Size:** M
**Owner steps:** Task 1 Step 1 installs `tldts@^7.5.0`, which the 7-day cooldown allows from 2026-11-19. Before then it needs the owner's approval for `--min-release-age=0` on that one command. Task 3 needs Google Chrome 127 or newer with the unpacked extension loaded from the branch. An agent that can drive Chrome may run it. Otherwise the owner does.

**Status:** Merged 2026-11-17 as [PR 100](https://github.com/jrmatherly/llm-router/pull/100), squash commit `58adcba8`. No release-age override was needed (`min-release-age` was `2`, and `tldts` resolved to 7.5.4). The review changed these points:

- An install that had extension 0.1.0 kept `http://*/*` and `https://*/*` after the update, because Chrome keeps a granted host permission when an update makes it optional. The worker now drops that access before every job (`dropStandingSiteAccess` in `background.js`). Measured in Playwright's Chromium: the grant survives the manifest change, `permissions.contains` reports it, and `permissions.remove` clears it for good.
- `normalizeImportDomain` strips a trailing dot before the public-suffix rule. `com.` passed it, because tldts returns `com` for that host. The worker's `normalizeDomain` strips it too.
- A request that names only rejected domains gets an error that lists them.
- The popup's **Import** sends the previewed domains, and the worker refuses the run when the job no longer lists exactly those.
- The localStorage write uses the existing 15 s timeout, so a hung write cannot hold the in-flight marker until the job expires.
- The popup handles rejected promises, disables **Import** after a success or an edit to the URL, and stores a loaded job in session storage so a popup that Chrome closed reloads it.
- The extension tests drive the worker, the confirm script and the popup with a fake `chrome` object. The plan's source-text checks for the trusted click and the popup sender passed with those checks inverted or removed.

Task 3 Step 1 was measured in Playwright's Chromium, not in Google Chrome: the worker's `GET` sends no `Origin`, its `POST` sends `Origin: chrome-extension://<id>`, and there is no preflight, so the 403 rule stands. Step 2 is inferred from a second job request that only the popup sends. Steps 1 to 3 in Google Chrome are still the owner's.

Found and left alone:

- Chrome's documentation says it stops a service worker whose `fetch` response takes more than 30 s. An import with several slow localStorage origins can cross that (about 30 s per origin in the worst case), and the extension would then report a failure for an import that completed. The popup now says the import may have completed. Research on 2026-11-18 did not reproduce the stop: in Playwright's Chromium an import completed with the response held for 45 s and for 150 s. That does not clear it, because Playwright attaches to the worker over the debugging protocol, which may keep the worker alive. One long import in Google Chrome settles it. A fix, if needed, is a job status the extension can poll, or writing the localStorage origins in parallel.
- Fixed 2026-11-18 by [PR 102](https://github.com/jrmatherly/llm-router/pull/102), squash commit `cf291d72`: an import whose every entry was skipped was marked `completed`. A job is now `completed` only when something was imported. `failed` could never occur before, so the code that shows it had never run. The same PR makes the built-in browser page and the provider dialog show the counts and the first error, flushes the cookie store whenever a write was attempted, and has the extension say to start a new import. The service takes its session lookup as a constructor argument, which is how tests reach the cookie writes without Electron. Left alone from that review: nothing forces localStorage to disk after a write (`flushStorageData` is never called), and nobody has seen the two UI changes in the running app.
- `runtime.onInstalled` does fire with reason `update` when an unpacked extension is reloaded (Chrome's runtime reference). The review round's reading that it did not was a probe artifact. The point-of-use check stays, because it also covers a restart.
- The worker accepts a multi-label public suffix such as `co.uk` from a job. Only a fake local server can send one.
- The server accepts any `chrome-extension://` origin, not only this extension's. The deferred pairing key covers it.
- A real **Reload** of an install that had 0.1.0 was not run. To check it, load 0.1.0 from `136ad730`, switch to `main`, click **Reload**, run one import, then run `chrome.permissions.getAll()` in the worker console. It must not list `https://*/*`.

**What stays open.** The content script still matches the confirm path on any loopback port, because the job server listens on a random port and Chrome match patterns cannot name one. After DH-2 a page on another local port can still show a fake confirm page. For a domain the user has never granted, Chrome's own permission prompt names the domain. For a domain the user granted earlier, Chrome may grant it again with no prompt, so one trusted click on the fake page can send that domain's cookies to the local process that served it. Closing that needs a pairing key that binds the extension to one LLMR install. The spec defers the pairing key (see "Deferred, with reasons").

### Task 1: Job server rules in the app

**Files:**
- Modify: `packages/electron/package.json` and `package-lock.json` (through npm)
- Modify: `packages/electron/src/main/chrome-login-import.ts` (`:29-32` class fields, `:100` `server.listen`, `:121-176` `handleRequest`, `:395-406` `normalizeImportDomain`, `:544-548` `setCorsHeaders`, end of file)
- Test: `packages/electron/test/unit/chrome-login-import.test.ts`
- Test: `packages/electron/test/integration/chrome-login-import-server.test.ts`

**Interfaces:**
- Produces: `chromeLoginImportInternalsForTest = { confirmationPageHtml, createService, normalizeChromeCookie, normalizeImportDomain, normalizeLocalStorageEntry, readImportPayload }`, where `createService(): ChromeLoginImportService` returns a new instance. The pattern is `providerAccountWebContentInternalsForTest` in `provider-account-webcontent.ts:317`.

- [ ] **Step 1: Add `tldts`**

Run: `npm install --save-dev tldts@^7.5.0 -w @llm-router/electron`

`tldts@7.5.0` was published 2026-11-12T21:56Z (`npm view tldts time`), so with `min-release-age=7` this install works from 2026-11-19 21:56Z, or earlier with the owner's override. npm reports no matching version before then.

Expected: `packages/electron/package.json` lists `tldts` as `^7.5.0` under `devDependencies` (this machine's npm `save-prefix` is empty, so npm may write an exact pin. Edit it to the caret range by hand and run `npm install` again if so) beside `electron-updater`, and the lockfile gains `tldts` and `tldts-core` only. `npm view tldts@7.5.0 scripts` shows no install script, so `allowScripts` does not change. esbuild inlines the package into the main bundle, as it does `electron-updater` (`nodeExternals` in `build/esbuild.config.mjs:85-90` keeps only `electron`, `better-sqlite3` and node builtins external).

- [ ] **Step 2: Write the failing unit test**

```ts
const { confirmationPageHtml, createService, normalizeChromeCookie, normalizeImportDomain, normalizeLocalStorageEntry, readImportPayload } = chromeLoginImportInternalsForTest;
const soon = Date.now() / 1000 + 3600;

test("normalizeImportDomain rejects public suffixes and single labels", () => {
  for (const value of ["com", "co.uk", "github.io", "intranet", "*.com", ""]) {
    assert.equal(normalizeImportDomain(value), undefined, value);
  }
  assert.equal(normalizeImportDomain("Sub.Example.com/x"), "sub.example.com");
  assert.equal(normalizeImportDomain("https://user.github.io/page"), "user.github.io");
  assert.equal(normalizeImportDomain("localhost"), "localhost");
  assert.equal(normalizeImportDomain("192.168.1.10"), "192.168.1.10");
});

test("createJob refuses a request that names only public suffixes", async () => {
  await assert.rejects(createService().createJob({ domains: ["com", "co.uk"] }), /At least one Chrome import domain is required/);
});

test("normalizeChromeCookie keeps only allowed, unexpired, unpartitioned cookies", () => {
  const cookie = { domain: ".example.com", expirationDate: soon, hostOnly: false, httpOnly: true, name: "sid", path: "/", sameSite: "lax", secure: true, value: "1" };
  assert.deepEqual(normalizeChromeCookie(cookie as any, ["example.com"]), { domain: ".example.com", expirationDate: soon, httpOnly: true, name: "sid", path: "/", sameSite: "lax", secure: true, url: "https://example.com/", value: "1" });
  assert.equal(normalizeChromeCookie({ ...cookie, hostOnly: true } as any, ["example.com"])?.domain, undefined);
  for (const patch of [{ domain: "evil.com" }, { domain: "notexample.com" }, { expirationDate: 1 }, { partitionKey: { topLevelSite: "https://a.com" } }]) {
    assert.equal(normalizeChromeCookie({ ...cookie, ...patch } as any, ["example.com"]), undefined, JSON.stringify(patch));
  }
});

test("normalizeLocalStorageEntry rejects non-http and foreign origins", () => {
  assert.deepEqual(normalizeLocalStorageEntry({ items: { a: "1", b: 2 }, origin: "https://app.example.com/path" } as any, ["example.com"]), { items: { a: "1" }, origin: "https://app.example.com" });
  for (const origin of ["file:///x", "chrome-extension://abc", "https://evil.com", "not a url"]) {
    assert.equal(normalizeLocalStorageEntry({ items: { a: "1" }, origin }, ["example.com"]), undefined, origin);
  }
});

test("readImportPayload rejects empty payloads", () => {
  assert.throws(() => readImportPayload(null), /must be an object/);
  assert.throws(() => readImportPayload({ cookies: [], localStorage: [] }), /must include cookies or localStorage/);
});

test("the confirmation page escapes domains", () => {
  const html = confirmationPageHtml({ confirmUrl: "", createdAt: 0, domains: ['a"><script>'], endpointUrl: "", expiresAt: 0, id: "j", importUrl: "", status: "pending", target: "browser" });
  assert.match(html, /a&quot;&gt;&lt;script&gt;/);
  assert.doesNotMatch(html, /<script/);
});
```

The `192.168.1.10` line rests on the `tldts` documentation, which says `getPublicSuffix` returns `null` for an IP address. This test is the check. If it fails, return IP addresses from `normalizeImportDomain` before the suffix rule runs.

- [ ] **Step 3: Write the failing integration test**

Write a helper `send(url, { body, headers, method })` on `node:http` that resolves `{ body, headers, status }`. Do not use `fetch`, so the test controls the `Origin` header and can hold a request body open. Each test calls `createService()` and `createJob({ domains: ["example.com"] })`.

- "job JSON has no CORS header and rejects web origins". `GET job.importUrl` returns 200 and `headers["access-control-allow-origin"]` is `undefined`. The same request with `origin: "https://evil.example"` returns 403. With `origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop"` it returns 200. `OPTIONS job.importUrl` returns 405.
- "the confirm page sends its CSP". `GET job.confirmUrl` returns 200, `content-type` starts with `text/html`, and `content-security-policy` matches `/script-src 'none'/`.
- "a second POST during an import gets 409 and a failed POST leaves the job pending". Open request A as `POST ${job.importUrl}/cookies` with `http.request`, call `write('{"cookies":')`, and do not end it. Then send request B, a complete POST with body `{}`, up to 50 times, 10 ms apart, until one returns 409. Every earlier reply must be 500, because `{}` has no cookies. Assert that the 409 body's `error.message` is `Chrome login import job is importing.` End A with `]`, which is invalid JSON, and assert that A returns 500. Then assert that `GET job.importUrl` reports `job.status === "pending"` and that one more POST with body `{}` returns 500, not 409.

- [ ] **Step 4: Run both and see them fail**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/chrome-login-import.test.js .test-dist/electron/test/integration/chrome-login-import-server.test.js`
Expected: both files fail, because `chromeLoginImportInternalsForTest` is `undefined`.

- [ ] **Step 5: Change `chrome-login-import.ts`**

- **Exports.** Add `chromeLoginImportInternalsForTest` at the end of the file.
- **Public-suffix rule.** In `normalizeImportDomain`, after `normalizeCookieHost` returns a host, return `undefined` when the host is not `localhost` and `getPublicSuffix(host, { allowPrivateDomains: true }) === host`. This also rejects a single label such as `intranet`. Leave `normalizeCookieHost` alone. `normalizeChromeCookie` uses it for cookie domains, where the allowed-domain match already limits the result.
- **CORS removal.** Delete `setCorsHeaders` and its call. Delete the `OPTIONS` branch at `:123-127`. The extension holds host permission for loopback, so its requests never needed CORS.
- **Origin check.** At the top of `handleRequest`, when `request.headers.origin` is defined and does not start with `chrome-extension://`, send 403 with `{ error: { message: "Chrome login import accepts requests only from the LLMR extension." } }` and return.
- **In-flight marker.** Add `private readonly importingJobIds = new Set<string>();`. In the `POST .../cookies` branch, after the `job.status !== "pending"` check and before `await readJsonRequest(request)`, return 409 with `Chrome login import job is importing.` when the set holds the id. Otherwise add the id, and delete it in a `finally` around the two awaits.
- **Test exit.** Call `server.unref()` in the `listen` callback (anchor: `server.off("error", reject);`), so a test process can exit while the server is open. The Electron app keeps running without it.

The marker replaces the `importing` job status that the research report proposed. `ChromeLoginImportStatus` is public. The poll loops in `packages/ui/src/pages/browser/main.tsx:66` and `packages/ui/src/pages/home/components/providers.tsx:2928` stop on any status other than `pending`, so a new status would leave both pages showing a finished import as pending. The private set gives the second POST the same 409 and changes no contract.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `node build/test.mjs electron && node --test .test-dist/electron/test/unit/chrome-login-import.test.js .test-dist/electron/test/integration/chrome-login-import-server.test.js && npm run typecheck`
Expected: 6 unit tests and 3 integration tests pass.

- [ ] **Step 7: Commit**

```bash
git add package-lock.json packages/electron/package.json packages/electron/src/main/chrome-login-import.ts packages/electron/test/unit/chrome-login-import.test.ts packages/electron/test/integration/chrome-login-import-server.test.ts
git commit -m "fix(electron): reject public-suffix imports and web origins on the Chrome import server"
```

### Task 2: Extension permissions, popup and trusted click

The manifest change and the popup rewrite land in one commit. With only the manifest changed, the popup has no site access and no way to ask for it.

**Files:**
- Modify: `extension/chrome/manifest.json`
- Modify: `extension/chrome/background.js`
- Modify: `extension/chrome/popup.js` (rewrite, 313 lines down to about 80)
- Modify: `extension/chrome/popup.html:215-225`
- Modify: `extension/chrome/confirm.js:11-13,24-26`
- Modify: `tests/architecture/chrome-extension.test.mjs`

**Interfaces (extension messages):**
- `llmr-login-import-confirm` `{ importUrl }`, from the content script. Reply `{ ok: true, result }`, or `{ ok: false, error }`, or `{ ok: false, needsPermission: true, error }`.
- `llmr-login-import-preview` `{ importUrl }`, from the popup. Reply `{ ok: true, domains: string[], origins: string[] }` or `{ ok: false, error }`.
- `llmr-login-import-run` `{ importUrl }`, from the popup. Reply `{ ok: true, result }` or `{ ok: false, error }`.

- [ ] **Step 1: Write the failing architecture tests**

Add to `chrome-extension.test.mjs`, with `import vm from "node:vm";`. Keep the two existing tests unchanged. They still have to pass.

```js
const read = (name) => readFileSync(`extension/chrome/${name}`, "utf8");

test("the manifest requests remote hosts only optionally", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1/*", "http://localhost/*"]);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.equal(manifest.minimum_chrome_version, "127");
});

test("the popup delegates the import to the worker", () => {
  const popup = read("popup.js");
  assert.doesNotMatch(popup, /function (readCookiesForDomains|normalizeImportUrl|fetchImportJob|originsForDomains|normalizeDomain)\b/);
  assert.doesNotMatch(popup, /chrome\.cookies|chrome\.scripting|chrome\.tabs|fetch\(/);
  assert.match(popup, /chrome\.permissions\.request\(/);
  assert.match(popup, /llmr-login-import-preview/);
  assert.match(popup, /llmr-login-import-run/);
});

test("the confirm page requires a trusted click", () => {
  assert.match(read("confirm.js"), /event\.isTrusted/);
});

test("the worker accepts popup messages only from its own popup", () => {
  assert.match(read("background.js"), /chrome\.runtime\.getURL\("popup\.html"\)/);
});

test("the worker rejects single-label domains", () => {
  const context = { chrome: { runtime: { onMessage: { addListener() {} } } }, URL };
  vm.runInNewContext(read("background.js"), context);
  for (const value of ["com", "*.com", ".intranet", ""]) {
    assert.equal(context.normalizeDomain(value), "", value);
  }
  assert.equal(context.normalizeDomain(".Example.com"), "example.com");
  assert.equal(context.normalizeDomain("localhost"), "localhost");
  assert.equal(context.normalizeDomain("127.0.0.1"), "127.0.0.1");
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/chrome-extension.test.js`
Expected: the five new cases fail and the two old ones pass. At `136ad730`, `normalizeDomain("com")` returns `"com"`.

- [ ] **Step 3: Change `manifest.json`**

Set `host_permissions` to the two loopback patterns. Add `"optional_host_permissions": ["http://*/*", "https://*/*"]` and `"minimum_chrome_version": "127"` (`chrome.action.openPopup()` is open to all extensions from Chrome 127). Set `version` to `0.2.0`. Leave `content_scripts` unchanged.

- [ ] **Step 4: Change `background.js`**

- **`normalizeDomain`.** After the existing cleanup, return `""` unless the host is `localhost`, passes `isIpAddress`, or contains a `.`.
- **Message routing.** The listener handles the three types in the Interfaces block and returns `false` for anything else.
- **Confirm.** Require a string `sender.tab?.url` and keep `normalizeImportUrl(importUrl, sender.tab?.url)` with its `url.origin !== senderOrigin` check. Fetch the job. When `chrome.permissions.contains({ origins })` is false, run `await chrome.storage.session.set({ pendingImportUrl })`, call `chrome.action.openPopup()` inside a `try` whose `catch` does nothing, and reply `{ ok: false, needsPermission: true, error: "Chrome needs your approval for these sites. Open the LLMR Login Import popup and click Import." }`. Otherwise run the import as today.
- **Preview and run.** Reject both unless `!sender.tab && sender.url === chrome.runtime.getURL("popup.html")`. Call `normalizeImportUrl(importUrl)` with no sender. When the second argument is `undefined`, the function skips only the origin comparison and keeps the loopback-host and path rules. Preview replies with the job's normalized domains and `originsForDomains(domains)`. Run calls `ensureHostPermissions`, imports, then removes `pendingImportUrl`.
- **`ensureHostPermissions` message.** Change its second sentence to `Open the LLMR Login Import popup and click Import to grant site access.`

- [ ] **Step 5: Rewrite the popup**

In `popup.html`, add `<button id="load-button" type="button">Load Job</button>` above `import-button`. Change the `import-button` label to `Import` and give it the `disabled` attribute.

`popup.js` keeps `renderDomains`, `setStatus` and `formatError`, and gains this behaviour:

- On `DOMContentLoaded`, read `pendingImportUrl` from `chrome.storage.session`. Fall back to `lastImportUrl` from `chrome.storage.local`. Fill the textarea. When a pending URL exists, load it at once.
- **Load Job** sends `llmr-login-import-preview`, renders `domains`, keeps `origins` in a module variable, saves `lastImportUrl`, and enables **Import**.
- The **Import** click handler calls `chrome.permissions.request({ origins })` as its first statement, with no `await` before it. Chrome grants a permission request only inside the user gesture. When the promise resolves `false`, show `Chrome site access was not granted.` When it resolves `true`, send `llmr-login-import-run` and show the same result line as today.

- [ ] **Step 6: Change `confirm.js`**

The click listener takes `event` and returns at once unless `event.isTrusted`. In `confirmImport`, when `response.needsPermission` is true, show `response.error` with no `error` class, enable the button again, and return.

- [ ] **Step 7: Run the tests and commit**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/chrome-extension.test.js`
Expected: 7 tests pass.

```bash
git add extension/chrome tests/architecture/chrome-extension.test.mjs
git commit -m "fix(extension): request site access per import and require a trusted click"
```

### Task 3: Check the two guesses in Chrome, update the docs, open the PR

The research report guessed two Chrome behaviours and tested neither. Run `T="$(mktemp -d)"` and then `HOME="$T" LLMR_INTERNAL_HOME_DIR="$T" npm run dev:electron` on the branch, an isolated home as in Task 5 Step 3 of the [Electron upgrade plan](completed/2026-11-16-audit-electron-upgrade.md). In Chrome, open `chrome://extensions`, load `extension/chrome` unpacked, and click **service worker** on its card to open DevTools for the worker.

- [ ] **Step 1: What `Origin` the worker's fetch sends.** In LLMR's built-in browser, start an import for a site you are signed in to, and confirm it in Chrome. In the worker's Network tab, read the request headers of the `POST .../cookies` request.
  - `Origin: chrome-extension://<id>`, or no `Origin` header, and the import completes. The rule in Task 1 stands.
  - Any other value, and the POST returns 403. Change the rule to reject only an `Origin` that starts with `http://` or `https://`, update the integration test, and repeat this step.
  - An `OPTIONS` request that returns 405 before the POST. Chrome sent a preflight. Answer `OPTIONS` with 204 and `access-control-allow-origin` set to the request's own origin, only when that origin starts with `chrome-extension://`. Change the `OPTIONS` assertion in the integration test to match, and repeat this step.

- [ ] **Step 2: Whether `action.openPopup()` works from a content-script message.** Start an import for a domain the extension has never been granted, and click **Confirm and Import** on the confirm page.
  - The popup opens with the job loaded. Click **Import**. Chrome shows a permission prompt that names the domain, and the import completes.
  - The popup does not open, and the worker console logs an error from `openPopup`. No code changes. The confirm page already tells the user to open the popup. Check that the popup, opened by hand from the toolbar, has the job loaded. Then in Task 3 step 4, describe the popup as opened by the user.

- [ ] **Step 3: The rest of the flow.** Repeat the import for the domain granted in step 2. Expected: **Confirm and Import** completes with one click and no popup. Then paste the **Extension import URL** into the popup by hand. Expected: **Load Job** lists the domains and **Import** completes.

- [ ] **Step 4: Update the docs**

In `extension/chrome/README.md`, replace the sentence that begins "The confirmation-page flow uses the site access declared in `manifest.json`" with: "The extension holds site access only for LLMR's local import server. The first import for a domain opens the extension popup, where **Import** makes Chrome ask for access to that domain." In the Flow list, change step 4's button name to **Import** and add **Load Job** before it.

In `docs/src/content/docs/en/configuration/toolhub.md`, section "Chrome login import extension" (`:49-68`):
- Import flow step 3 becomes: "…paste that URL, click **Load Job**, and click **Import**."
- Add a step after step 4: "The first time you import a domain, the extension popup opens. Click **Import**, and allow the site access Chrome asks for."
- Replace the last sentence of the paragraph after the list ("If the confirmation page says the extension does not have site access…") with: "The extension has no standing access to your sites. Chrome asks you the first time each domain is imported."
- In the troubleshooting line at `:189`, replace "and has site access for the target domains" with "and that you allowed the site access Chrome asked for".

- [ ] **Step 5: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:electron
```

Expected: every command exits 0.

- [ ] **Step 6: Commit the docs and open the PR**

```bash
git add extension/chrome/README.md docs/src/content/docs/en/configuration/toolhub.md
git commit -m "docs: describe per-import site access for the Chrome login import"
```

Open the PR from `fix/chrome-login-import-hardening`. Squash-merge title: `fix: harden the Chrome login import server and extension`. The description records the outcome of steps 1 and 2 and repeats the "What stays open" paragraph.

---

## DH-3: UI dependency cleanup

**Fixes:** F-D9, F-D10, F-D11.
**Depends on:** EU-2, for ordering only, as the [program index](2026-11-16-audit-remediation-index.md) orders it. Nothing in the code depends on it. DH-3 and the EU PRs both edit `package.json` and `package-lock.json`, so they must not be open at the same time. Branch DH-3 from the `main` that contains EU-2.
**Branch:** `chore/ui-dependency-cleanup`
**Size:** S
**Owner steps:** None.

### Task 1: Remove BaseUI and Styletron (F-D9)

**Files:**
- Delete: `packages/ui/src/lib/baseui-provider.tsx`
- Modify: `packages/ui/src/pages/home/main.tsx:3,14-16`
- Modify: `docs/src/components/interactive/LogsViewDemo.tsx:8,21,35`, `ObservabilityViewDemo.tsx:10,36,51`, `ProfileViewDemo.tsx:9,120,150`, `ProvidersViewDemo.tsx:11,222,257`
- Modify: `packages/ui/package.json:17,24-25`, `package.json:97,108-109,134`, `docs/package.json:24,28-29`
- Modify: `package-lock.json`, `docs/package-lock.json` (through npm)
- Modify: `.claude/rules/ui.md:6`
- Modify: `tests/architecture/dependency-overrides.test.mjs` (add one case)

- [ ] **Step 1: Take the "before" screenshots on `main`**

Task 4 compares against these, so take them before any edit. Serve the web UI's home page (`npm run dev:ui`) and the docs site (`cd docs && npm run dev`). Capture the home page and the four demo pages, `/guides/agent-profile-app`, `/guides/logs-app`, `/guides/observability-app` and `/guides/provider-app`, at 1366x768 and at 390x844. That is 10 images. With the chrome-devtools MCP, set the size with `emulate` (`"1366x768x1"` and `"390x844x3,mobile,touch"`), confirm `innerWidth`, and omit `filePath` on the screenshot call. Save the images outside the repo.

- [ ] **Step 2: Record the audit baseline**

Run: `npm audit --json | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(JSON.stringify(r.metadata.vulnerabilities),Object.keys(r.vulnerabilities).sort().join(","))})'`
Expected at `136ad730`: 6 moderate findings and no others, all in the minimatch chain that Dependabot alert 144 tracks. Keep the printed line. Task 4 compares against it.

- [ ] **Step 3: Write the failing test**

Add to `tests/architecture/dependency-overrides.test.mjs`:

```js
test("no manifest depends on baseui or styletron, and core-js cannot run install scripts", () => {
  for (const file of ["package.json", "packages/ui/package.json", "docs/package.json"]) {
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    assert.deepEqual(names.filter((name) => /^(baseui|styletron-)/.test(name)), [], file);
  }
  const { allowScripts } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.deepEqual(Object.keys(allowScripts).filter((name) => name.startsWith("core-js@")), []);
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/dependency-overrides.test.js`
Expected: the new case fails on `package.json` with `["baseui", "styletron-engine-atomic", "styletron-react"]`.

- [ ] **Step 5: Replace the wrapper in five places**

`BaseProvider` rendered one app container with four style properties and one empty sibling. Replace each `<BaseUiProvider>` and its closing tag with this div, and remove the import:

```tsx
<div style={{ height: "100%", minHeight: 0, minWidth: 0, width: "100%" }}>
```

Use the inline style, not Tailwind classes. The docs site builds its own stylesheet, and nothing confirms that it scans `docs/src/components` for class names. Then delete `packages/ui/src/lib/baseui-provider.tsx`.

- [ ] **Step 6: Edit the manifests and the rule**

Remove `baseui`, `styletron-engine-atomic` and `styletron-react` from the three manifests. Remove `"core-js@2.6.12": true` from `allowScripts` in the root `package.json`. In `.claude/rules/ui.md`, change "(React plus Tailwind 4; `baseui` only through `lib/baseui-provider.tsx`)" to "(React plus Tailwind 4)". The test from step 3 is the check for that rule change.

- [ ] **Step 7: Regenerate both lockfiles**

```bash
npm install
(cd docs && npm install)
npm ls baseui styletron-react styletron-engine-atomic core-js
grep -c '"node_modules/core-js"' package-lock.json docs/package-lock.json
```

Expected: `npm ls` prints `(empty)`, and both `grep` counts are 0. `git diff --stat` shows deletions only in both lockfiles. The research pass measured 116 removed entries in the root lockfile together with Task 2's edits, and 130 in `docs/package-lock.json`. An added `node_modules/` entry in either file means npm resolved something new. Stop and find out why.

- [ ] **Step 8: Run the test and the typecheck, then commit**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/dependency-overrides.test.js && npm run typecheck`
Expected: 2 tests pass.

```bash
git add -A packages/ui docs/src/components/interactive docs/package.json docs/package-lock.json package.json package-lock.json .claude/rules/ui.md tests/architecture/dependency-overrides.test.mjs
git commit -m "chore(deps): remove baseui, styletron and the core-js install script"
```

### Task 2: Remove the dead overrides and the root `dependencies` block (F-D10)

**Files:**
- Modify: `package.json:78-85` (`dependencies`), `:119-130` (five entries in `overrides`)
- Modify: `package-lock.json` (through npm)

- [ ] **Step 1: Edit `package.json`**

Delete the whole root `dependencies` block. `packages/core/package.json` lists the same six packages, the Electron app directory is `packages/electron`, and the Dockerfile installs with `--include-workspace-root=false`, so the root block ships nowhere.

In `overrides`, delete `fast-uri@3`, `find-my-way@9.6.0`, `minimatch@10.2.5`, `pm2` and `socks`. Keep `@the-next-ai/ai-gateway` with its `glob` pin, `@types/react` and `js-yaml`.

- [ ] **Step 2: Regenerate the lockfile and check that nothing moved**

```bash
npm install
git diff package-lock.json
npm ls @the-next-ai/ai-gateway better-sqlite3 node-forge pm2 undici
```

Expected: the diff touches only the root package entry (`"packages": { "": { ... } }`), where `dependencies` disappears. No `node_modules/` entry changes version, because the five overrides did not affect resolution. `npm ls` still lists all five packages under `@llm-router/core`. A version change anywhere means an override was doing work. Put that override back and say so in the PR.

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run test:architecture`
Expected: both exit 0. `dependency-overrides.test.mjs` still guards the `glob` pin.

```bash
git add package.json package-lock.json
git commit -m "chore(deps): drop five dead overrides and the root dependencies block"
```

### Task 3: Delete four unused UI exports (F-D11)

**Files:**
- Modify: `packages/ui/src/pages/home/shared/extensions.ts:630-632` (`pluginRuntimeSurfacesEnabled`), `:688-694` (`slugValue`), `:696-698` (`stringListValue`)
- Modify: `packages/ui/src/pages/home/shared/provider-accounts.ts:68-76` (`providerAccountCurrentMeterDetail`)

- [ ] **Step 1: Confirm that nothing uses them**

Run: `git grep -nw -e pluginRuntimeSurfacesEnabled -e slugValue -e stringListValue -e providerAccountCurrentMeterDetail -- packages/ui docs/src tests`
Expected: four lines, each a definition. The matches under `packages/core` for `pluginRuntimeSurfacesEnabled` and `stringListValue` are separate functions with the same names. Do not touch them.

- [ ] **Step 2: Delete the four functions**

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run test:ui`
Expected: both exit 0. If `tsc` reports an import or a helper as unused, the deleted function was its last user. Delete it too.

```bash
git add packages/ui/src/pages/home/shared/extensions.ts packages/ui/src/pages/home/shared/provider-accounts.ts
git commit -m "refactor(ui): delete four unused exports"
```

### Task 4: Audit and visual checks, then open the PR

- [ ] **Step 1: Audit.** Run the command from Task 1 step 2 again. Expected: the same line as the baseline, which is exactly the alert-144 chain, 6 moderate findings and nothing else. A new finding or a missing one needs an explanation in the PR.

- [ ] **Step 2: Build.** Run `npm run build:assets` and `(cd docs && npm run build)`. Expected: both exit 0 with no unresolved import of `baseui`, `styletron-react` or `@/lib/baseui-provider`. Then run `git checkout -- packages/core/models.json packages/ui/src/generated`.

- [ ] **Step 3: "After" screenshots.** Repeat Task 1 step 1 on the branch and compare each of the 10 pairs. Expected: the app fills its container at both sizes, with no new scrollbar, no collapsed height and no shifted content. A difference means the wrapper div does not reproduce BaseUI's app container. Compare the two DOM trees at that element before changing anything else.

- [ ] **Step 4: Escape key.** Run `T="$(mktemp -d)"`, then `HOME="$T" LLMR_INTERNAL_HOME_DIR="$T" npm run dev:electron`, an isolated home as in Task 5 Step 3 of the [Electron upgrade plan](completed/2026-11-16-audit-electron-upgrade.md). Create one provider and one profile so the dialogs have something to edit. Open three dialogs on the home page (add provider, edit profile, and one settings dialog) and press Escape in each. Expected: each closes as it does on `main`. This is Review Focus 5.

- [ ] **Step 5: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:ui
npm run test:e2e
git checkout -- packages/core/models.json packages/ui/src/generated
```

Expected: every command exits 0.

- [ ] **Step 6: Open the PR** from `chore/ui-dependency-cleanup`. Squash-merge title: `chore(deps): remove baseui, dead overrides and unused UI exports`. Attach the screenshot pairs to the description. If an EU PR is open, wait for it to merge and rebase first.
