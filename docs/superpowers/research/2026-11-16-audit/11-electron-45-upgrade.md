# Research: the Electron 45 upgrade

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

**Goal.** The owner wants a plan that fixes today's audit findings. This report settles the Electron upgrade so the plan can name versions, files and proofs. Nothing in the repo was changed.

## 1. Answer

**Target `better-sqlite3@13.2.0` first, on Electron 42. Then `electron@^45.3.3` with `electron-builder@26.18.1`.** Two PRs, in that order.

- **Electron 42 has been end-of-life since 2026-10-20** (measured, releases.electronjs.org/schedule). The audit's date range is wrong. 43.0.0, 44.0.0 and 45.0.0 shipped 2026-06-30, 08-25 and 10-21 (measured, `npm view electron time`). The 11-12 to 11-16 releases are patches.
- **Supported today are 43, 44 and 45.** The policy is "the latest three stable major versions" (measured, electronjs.org `tutorial/electron-timelines`).
- **45 gives the longest runway.** Its planned EOL is 2027-04-27, against 2027-03-02 for 44 and 2027-01-05 for 43. It is at 45.3.3 after four weeks of patches. It ships Chromium M156 and Node 24.22.0, so `@types/node` 24 stays. 46 (planned stable 2027-01-05) moves to Node 26.
- **better-sqlite3 13 is N-API and stable.** `latest` is 13.2.0 (2026-11-14), the sixth 13.x release since 13.0.0 on 2026-07-21. The tarball carries eight prebuilds under `prebuilds/` (darwin, linux, linuxmusl, win32, each x64 and arm64). It has no install script, and `prebuild-install` and `bindings` are gone. `engines` is `node >=22` and `NAPI_VERSION=10`. All measured.
- **Why sqlite goes first.** The 12.11.1 prebuilds stop at Electron ABI v146, which is Electron 42 (43 is 148, 45 is 150; measured from the release assets and `node_modules/node-abi/abi_registry.json`). `scripts/prepare-electron-sqlite.mjs:21` would therefore fail on Electron 45, and packaging would compile from source.
- **No API break touches core.** The 13.0.0 to 13.2.0 release notes list none beyond the N-API move. Core uses only `exec`, `prepare`, `pragma`, `transaction`, `bind`, `iterate`, `columns` and `close`, with no `.backup`, `.function`, `.aggregate` or `safeIntegers` (measured). `@types/better-sqlite3` is still 9.6.0, with no 13-specific typings.

**Electron 43 to 45 breaking changes against this repo** (all of `docs/breaking-changes.md` on `main` for those versions, checked with `rg`):

| Change | Repo hit | Action |
|---|---|---|
| 44: `openAsHidden` removed | `packages/electron/src/main/launch-at-login.ts:26` | Delete the assignment. Typecheck fails otherwise. |
| 44: `clipboard` methods return Promises | `packages/electron/src/main/built-in-browser.ts:689` | `void clipboard.writeText(...)`. The UI uses `navigator.clipboard`, so it is unaffected. |
| 44: macOS 12 dropped, macOS 13 minimum | No minimum is documented anywhere in the repo | State it in the release notes and README. |
| 44: win32-ia32 and linux-armv7l dropped | Builds are x64 and arm64 only | None. |
| 43: Linux rounded corners and WCO layout | `built-in-browser.ts:438` (`titleBarStyle: "hidden"` off macOS), `tray-controller.ts:235` | Visual check on Linux. |
| 43: dialogs default to Downloads | The save dialogs set `defaultPath`. `ipc.ts:176` (plugin directory) does not. | Accept. |
| 45: sandboxed preloads lose Node shims and `Buffer` | `preload.ts` and `browser-preload.ts` import only `electron`. Built files have zero `Buffer` or `setImmediate` hits. | None. |
| 45: screen capture reported as `display-capture` | `permission-policy.ts:4` allows only clipboard write and fullscreen | None. |
| 45: `window.open` children sandboxed, ASAR fds, contentTracing, safeStorage deprecation | Every window is `sandbox: true`. No other hits. | None. |
| 47 (future): positional `console-message` args removed | `built-in-browser.ts:620` uses `(_event, level, message)` with `level >= 2` | Optional now. `level` becomes a string. |

There are no hits for fuses, `utilityProcess`, `BrowserView`, `protocol.handle`, `safeStorage` or `net.request`. `ELECTRON_RUN_AS_NODE` spawning is used heavily and is untouched until 46, which removes `--experimental-transform-types` (not used here).

**Tooling.**
- **electron-builder.** Installed 26.18.0 lacks the Electron 45 Windows fix that renames `electron_wer.dll` (measured, no `electron_wer` in `node_modules/app-builder-lib/out`). 26.18.1 has it (measured from the published file). 26.18.1 sits on dist-tag `v26`, while `latest` is still 26.18.0, so it must be installed by exact version.
- **electron-updater.** 6.8.11 is installed and is `latest`.
- **Playwright.** The e2e suite spawns Electron and uses `chromium.connectOverCDP` (`tests/e2e/electron-cdp.spec.ts:1-15`), not `_electron`. Playwright's Electron support matrix does not apply. 1.64.1 is installed and 1.65.1 is latest. No bump is required (inferred).
- **Other native dependencies.** The lockfile's install-script packages are `better-sqlite3`, `@parcel/watcher`, `fsevents`, `esbuild`, `core-js` and `electron-winstaller`. Only better-sqlite3 loads inside Electron.

## 2. Evidence

- `npm view electron dist-tags time`: latest 45.3.3, `42-x-y` 42.11.18.
- `npm view better-sqlite3@{12.11.1,13.0.0,13.2.0} scripts dependencies engines`.
- `gh api repos/WiseLibs/better-sqlite3/releases/tags/v13.0.0` (also v13.0.1 to v13.2.0, v12.12.0, v12.11.1).
- `data.jsdelivr.com/v1/package/npm/better-sqlite3@13.2.0/flat` for the file list. `lib/binding.js` loads `build/Release/better_sqlite3.node` if present, else `prebuilds/<platform>-<arch>.node`. `binding.gyp` makes `node-gyp rebuild` a no-op when a prebuild exists.
- `gh api` on electron-builder PR 10428 (merged 2026-10-24 into `release/v26`) and issue 10395.
- Repo files: `packages/core/src/storage/sqlite-native.ts:15-48`, `build/verify-packaged-app.cjs:4-11,41-47,53,60`, `tests/architecture/packaging-contract.test.mjs:8-38`, `electron-builder.json:8,34`, `package.json:64,70,71,133`, `.claude/settings.json:4`, `AGENTS.md:11,53`, `packages/electron/src/main/main.ts:78`, `README.md:216`.

## 3. Plan inputs

**PR 1 (M): better-sqlite3 13.2.0 on Electron 42, delete the sidecar.**

- Bump `better-sqlite3` to `^13.2.0` in `package.json:81`, `packages/core/package.json:21`, `packages/cli/package.json:41` and `packages/electron/package.json:14`.
- In `package.json`, remove the `allowScripts` entry at line 133 and the scripts `rebuild:sqlite3` (70) and `sqlite:electron` (71). Drop `npm run sqlite:electron &&` from `test:e2e` (64).
- Delete `scripts/prepare-electron-sqlite.mjs`.
- In `packages/core/src/storage/sqlite-native.ts`, reduce `createBetterSqliteDatabase` to `new DatabaseConstructor(filename, options)`. Delete `betterSqliteNativeBindingCandidates`, `resolveBetterSqliteNativeBinding` and the `createRequire` import.
- Delete `packages/core/test/unit/storage/sqlite-native-binding.test.mjs`.
- In `electron-builder.json`, remove line 34 and set `npmRebuild` to `false`.
- In `build/verify-packaged-app.cjs`:
  - Point the native path at `prebuilds/${platform}-${arch}.node`.
  - Replace the sidecar check (41-47) with a prune of the other seven prebuilds, in `cleanupBetterSqlitePackage`.
  - Reword the errors at 53 and 60.
- In `tests/architecture/packaging-contract.test.mjs`, rewrite tests 1 to 3:
  - "packaged-app verification accepts a bundle with the host prebuild" copies `node_modules/better-sqlite3/prebuilds/<host>.node`.
  - "packaged-app verification removes other platforms' prebuilds" asserts they are gone afterwards.
  - "packaged-app verification rejects a bundle without the host prebuild".
  - Run with `node build/test.mjs architecture && node --test .test-dist/architecture/test/packaging-contract.test.js`.
- Text only: `main.ts:78`, `AGENTS.md:11,53`, `README.md:216`, `build/windows-package-preflight.mjs:7`, and the `deny` block at `.claude/settings.json:4` (the rule and its check change together).
- Optional: `resolveRuntime` in `build/run-tests.mjs:73-82` becomes a dead fallback.
- Proof, in order:
  1. `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron -e "new (require('better-sqlite3'))(':memory:').close()"`, and the same under plain `node`.
  2. `npm run test:core`, `npm run test:architecture`, `npm run test:e2e`, `npm run test:system`.
  3. `npm run build:app:mac:local`, then list `app.asar.unpacked/node_modules/better-sqlite3` and launch the app.
  4. The owner runs the Windows and Linux packaging jobs.

**PR 2 (S): Electron 45.**

- Set `electron` to `^45.3.3` in `package.json:99` and `packages/electron/package.json:17`.
- Install `electron-builder@26.18.1` by exact version.
- Delete `launch-at-login.ts:26`. Keep the darwin early return.
- Change `built-in-browser.ts:689` to `void clipboard.writeText(...)`. Optionally update line 620.
- Add the macOS 13 minimum to the README.
- Proof: `npm run typecheck`, `npm run test:electron`, `npm run test:e2e`, then `build:app:mac:local`. Manual checks per platform:
  - macOS: the launch-at-login toggle, Copy Link in the built-in browser, the share-card PNG export, the tray popover.
  - Windows: the NSIS install, `LLM Router_wer.dll` beside the exe, auto-update from 7.2.1.
  - Linux: AppImage window chrome.

**Memory note.** Update the "majors needing code" line. better-sqlite3 13 is 13.2.0 and deletes the sidecar. Electron 45 also needs the clipboard fix and electron-builder 26.18.1.

## 4. Risks and unknowns

- **I did not install 13.2.0.** That it loads under Electron 42.11.18 is inferred from N-API 10 and Node 24.15. Step 1 of the PR 1 proof settles it.
- **`npmRebuild: false` and the afterPack prune are unverified.** I did not check whether electron-builder unpacks `prebuilds/*.node` as expected, or whether a `files` macro filter would be cleaner. `build:app:mac:local` settles it.
- **The Linux glibc floor is inferred.** The glibc prebuilds are built on `ubuntu-22.04` runners (measured from the upstream `build.yml`), which implies a floor near 2.35. The macOS deployment target of the darwin prebuilds was not checked. Run `otool -l` on the `.node`.
- **Notarization with a vendor-built `.node` is unverified.** The release mac job settles it.
- **Windows crash helper impact is a guess.** I assume the missing `electron_wer.dll` rename only costs fastfail crash capture.
- **Linux visuals under Electron 43+ were not observed.**
- **Read coverage.** The breaking-changes document was read through a summarizing fetch. The 43 to 47 sections were covered, the older tail was not.

Skipped: no installs, builds or tests were run, per the brief. I did not fetch the Electron 45 typings to confirm the positional `console-message` signature still compiles there.
