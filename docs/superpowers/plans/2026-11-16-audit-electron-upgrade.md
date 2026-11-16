# Audit remediation: Electron 45 upgrade implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the desktop app from Electron 42, which left support on 2026-10-21, to Electron 45, and delete the Electron sqlite sidecar that the move makes unnecessary.

**Architecture:** Two PRs. EU-1 moves `better-sqlite3` from 12.11.1 to 13.2.0 while the app is still on Electron 42. Version 13 is an N-API addon that ships one prebuilt binary per platform inside the npm package, so the same file loads under Node and under every Electron version. That removes the per-Electron sidecar binary, its build script, the loader that looked for it, and the rebuild step in packaging. EU-2 then bumps Electron to 45 and `electron-builder` to 26.18.1 and fixes the two call sites that Electron 44 breaks.

**Tech Stack:** Electron 45, better-sqlite3 13 (N-API), electron-builder 26.18.1, TypeScript, `node:test`, Playwright over CDP.

**Spec:** `docs/superpowers/specs/2026-11-16-audit-remediation.md`. This plan fixes F-D1, F-D2 and F-D3.

## Evidence

Checked on 2026-11-16 at `136ad730`. Re-run the commands if execution starts more than a week later.

- `npm view better-sqlite3 dist-tags versions engines` gives `latest: 13.2.0` (published 2026-11-14), `engines: { node: ">=22" }`, and six 13.x versions: 13.0.0, 13.0.1, 13.0.2, 13.0.3, 13.1.1, 13.2.0. The last 12.x on npm is 12.11.1.
- `better-sqlite3@13.2.0` has no `install` script and `gypfile: false`. Its only dependency is `node-addon-api ^8.0.0`. The package holds `binding.gyp`, `deps/`, `lib/`, `src/` and `prebuilds/` with eight files named `<platform>-<arch>.node` for `darwin`, `linux`, `linuxmusl` and `win32`, each in `x64` and `arm64`. It has no `build/` directory.
- `lib/binding.js` in 13.2.0 loads `build/Debug/better_sqlite3.node` or `build/Release/better_sqlite3.node` when one exists. Otherwise it loads `prebuilds/<platform>-<arch>.node`. A compiled binary therefore wins over the prebuild.
- The installed tree has `better-sqlite3@12.11.1`, `electron@42.11.18`, `electron-builder@26.18.0` and `electron-updater@6.8.11`.
- `npm view electron-builder dist-tags` gives `latest: 26.18.0`, `v26: 26.18.1`, `next: 27.0.0-alpha.14`. `latest` has not moved, so 26.18.1 must be installed by exact version. `app-builder-lib@26.18.1/out/electron/ElectronFramework.js` renames `electron_wer.dll` to `<productFilename>_wer.dll` for Electron 45 and later. The 26.18.0 file has no such code.
- `npm view electron dist-tags` gives `latest: 45.3.3` and `45-x-y: 45.3.3`. Version 45.3.3 was published on 2026-11-16 and 45.3.0 on 2026-11-10. The `electron` package has no install script.
- `electron@45.3.3/electron.d.ts` has zero occurrences of `openAsHidden` (the installed 42 typings have three). `Clipboard.writeText` is `writeText(text: string): Promise<void>`. The positional `console-message` listener `(details, level, message)` still exists and is marked deprecated, so `built-in-browser.ts:620` compiles unchanged.
- `~/.npmrc` sets `min-release-age=7`. npm refuses `better-sqlite3@13.2.0` before 2026-11-21 and `electron@45.3.3` before 2026-11-23 unless one command passes `--min-release-age=0`.
- A scratch install on 2026-10-26 loaded `better-sqlite3@13.0.3` under Node 24 and under Electron 42.11.18 (`.superpowers/sdd/dependency-update-assessment.md:77`). Nobody has loaded 13.2.0 in this repo. Task 1 does.
- `release.yml` runs only on a `v*` tag push. No workflow packages Windows or Linux before a release.

## Global Constraints

Copied from the spec:

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

- `npm install` on this machine rewrites every manifest range to an exact pin, because `save-prefix` is empty. Edit the manifests by hand, then run a bare `npm install`. Before each commit, run `git diff package.json packages/*/package.json` and confirm that only the intended lines changed.
- Never pass `--min-release-age=0` without Jason's approval for that one command. Without approval, wait for the dates under Evidence.
- EU-1 deletes the `rebuild:sqlite3` script. The spec constraint above stops applying when EU-1 merges.
- Read a file with Read before editing it. The path-scoped rules under `.claude/rules/` load only on Read, Edit and Write.
- Launch a packaged or development build only with both `HOME` and `LLMR_INTERNAL_HOME_DIR` set to a temporary directory. A build started with the real home can rewrite the owner's `~/.claude` and `~/.codex` files.

## Review Focus

Each line names the task that pins it.

1. A `build/Release/better_sqlite3.node` left in `node_modules/better-sqlite3`, or produced by a packaging rebuild, loads instead of the prebuild and is tied to one ABI. Task 1 checks that the directory is gone after the install. Task 2 pins `npmRebuild: false` with a test.
2. electron-builder passes `arch` as a number (1 for x64, 3 for arm64), not a string. A prune that compares the raw value deletes every prebuild. Task 2 has a test that passes the numeric value.
3. A `universal` macOS build has no `darwin-universal.node` prebuild. The verification must fail the build with the missing file's path. It must not ship an app without a binary. Task 2 has the test.
4. The `linux-x64` prebuild may need a newer glibc than the Docker image (`node:24-bookworm-slim`, glibc 2.36) or an older desktop distribution has. Task 1 measures the requirement and Task 5 runs `npm run test:system`.
5. A Mac on macOS 12 that runs 7.2.1 takes the automatic update to the Electron 45 build, and the app does not launch. D-9 rules out a guard. Task 7 states the minimum in the README and the install guide, and Task 8 puts it in the release notes.

---

## EU-1: Move to better-sqlite3 13 and delete the Electron sqlite sidecar

- **Fixes:** F-D2.
- **Depends on:** RS-1 and RS-2 in the [release safety plan](2026-11-16-audit-release-safety.md), as the [program index](2026-11-16-audit-remediation-index.md) orders it. Nothing in the code depends on them. EU-1 changes packaging, and Windows and Linux packaging first run in a release, so that release should go through the draft flow.
- **Branch:** `chore/better-sqlite3-13`.
- **Size:** M.
- **Owner steps:** Approve `--min-release-age=0` for the one install in Task 1 if work starts before 2026-11-21. Approve the edit to `permissions.deny` in `.claude/settings.json` (Task 4). Run the Windows and Linux packaging checks in Task 5 if a machine is available.

### Task 1: Prove that 13.2.0 loads under Node and Electron 42

Nothing is deleted before this task passes.

**Files:**
- Modify: `package.json:81` (`"better-sqlite3": "^12.11.1"` under `dependencies`) and `package.json:133` (`"better-sqlite3@12.11.1": true` under `allowScripts`)
- Modify: `packages/core/package.json:21`, `packages/cli/package.json:41`, `packages/electron/package.json:14`
- Modify: `package-lock.json` (through npm only)

**Interfaces:**
- Produces: a working tree with `better-sqlite3@13.2.0` installed and `node_modules/better-sqlite3/prebuilds/<platform>-<arch>.node` present. Tasks 2 to 5 build on it.

- [ ] **Step 1: Create the branch and re-check the npm facts**

Run: `git switch -c chore/better-sqlite3-13 && npm view better-sqlite3 dist-tags versions engines`
Expected: `latest` is `13.2.0` or newer. If `latest` is newer than 13.2.0, read its release notes at `https://github.com/WiseLibs/better-sqlite3/releases` and use it only if they list no breaking change. Otherwise stay on 13.2.0.

- [ ] **Step 2: Bump the four manifests by hand**

Set `"better-sqlite3": "^13.2.0"` in all four `package.json` files. Delete the `"better-sqlite3@12.11.1": true` line from `allowScripts` in the root `package.json`. Version 13 has no install script, so it needs no entry.

- [ ] **Step 3: Install**

Run: `npm install`
Expected: exit 0, and `npm ls better-sqlite3` shows one deduped `better-sqlite3@13.2.0`.
If npm reports that no version satisfies the range, the 7-day cooldown is the cause. Stop and ask Jason to approve `npm install --min-release-age=0`, or wait until 2026-11-21.

- [ ] **Step 4: Confirm that no compiled binary is left**

Run: `ls node_modules/better-sqlite3/build 2>&1; ls node_modules/better-sqlite3/prebuilds`
Expected: the first command reports that the directory does not exist. The second lists eight `.node` files. If `build/` exists, delete `node_modules/better-sqlite3` and run `npm install` again. A leftover 12.x binary would make the next step test the wrong file.

- [ ] **Step 5: Run the two load checks**

```sh
node -e "new (require('better-sqlite3'))(':memory:').close(); console.log('node ok', process.versions.node)"
ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron -e "new (require('better-sqlite3'))(':memory:').close(); console.log('electron ok', process.versions.electron)"
```

Expected: `node ok 24.x.y` and `electron ok 42.11.18`.

**If either check fails:** restore the tree with `git checkout -- package.json packages/*/package.json package-lock.json && npm ci`, then stop. Report the full error text to Jason. Do not delete the sidecar, do not start Task 2, and do not start EU-2, which cannot work without this step.

- [ ] **Step 6: Measure the platform floor of the prebuilds**

```sh
otool -l node_modules/better-sqlite3/prebuilds/darwin-arm64.node | grep -A4 LC_BUILD_VERSION | grep minos
otool -l node_modules/better-sqlite3/prebuilds/darwin-x64.node | grep -A4 LC_BUILD_VERSION | grep minos
strings node_modules/better-sqlite3/prebuilds/linux-x64.node | grep -o 'GLIBC_2\.[0-9]*' | sort -Vu | tail -1
```

Expected: `minos` is 12.0 or lower, and the highest glibc symbol version is 2.36 or lower. Record the three values in the PR description. A `minos` above 12.0 means EU-1 already raises the macOS minimum, so move the README and install-guide edit from Task 7 into Task 4. A glibc value above 2.36 means the Docker image cannot load the binary. Stop and report it, because the fix (a newer base image or the `linuxmusl` route) is a decision for Jason.

Do not commit yet. The architecture test still reads the old binary path, so the commit gate fails until Task 2 is done.

### Task 2: Verify and prune the prebuilds in the packaged app

**Files:**
- Modify: `tests/architecture/packaging-contract.test.mjs:8-38` (the first three tests and the `packagedApp` helper; keep the product-name test at 40-45)
- Modify: `build/verify-packaged-app.cjs:4-24` (the path constants), `:26-63` (`verifyPackagedApp`), `:65-70` (`cleanupBetterSqlitePackage`)
- Modify: `electron-builder.json:9` (`npmRebuild`), `:34` and `:38-40` (`files`)

**Interfaces:**
- Consumes: the installed 13.2.0 package from Task 1.
- Produces: `verifyPackagedApp(context)` keeps its signature. After it resolves, `app.asar.unpacked/node_modules/better-sqlite3/prebuilds/` holds exactly one file, `<electronPlatformName>-<arch>.node`.

- [ ] **Step 1: Rewrite the tests**

Replace lines 8 to 38 of `tests/architecture/packaging-contract.test.mjs`. Add `existsSync` and `readdirSync` to the `node:fs` import.

```js
const hostPlatform = process.platform;
const hostPrebuild = `${hostPlatform}-${process.arch}.node`;
const foreignPrebuilds = ["darwin-arm64.node", "linux-x64.node", "win32-x64.node"].filter((name) => name !== hostPrebuild);

function packagedApp({ withHostPrebuild = true } = {}) {
  const appOutDir = mkdtempSync(path.join(os.tmpdir(), "llmr-packaged-"));
  const resources = hostPlatform === "darwin"
    ? path.join(appOutDir, "Fake.app", "Contents", "Resources")
    : path.join(appOutDir, "resources");
  const prebuilds = path.join(resources, "app.asar.unpacked", "node_modules", "better-sqlite3", "prebuilds");
  mkdirSync(prebuilds, { recursive: true });
  writeFileSync(path.join(resources, "app.asar"), "asar");
  for (const name of foreignPrebuilds) {
    writeFileSync(path.join(prebuilds, name), "foreign");
  }
  if (withHostPrebuild) {
    copyFileSync(path.join(process.cwd(), "node_modules", "better-sqlite3", "prebuilds", hostPrebuild), path.join(prebuilds, hostPrebuild));
  }
  return { appOutDir, prebuilds };
}

test("electron-builder ships the better-sqlite3 prebuild and never rebuilds it", () => {
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "electron-builder.json"), "utf8"));
  assert.equal(config.npmRebuild, false);
  assert.deepEqual(config.files.filter((entry) => entry.includes("build/Release")), []);
  assert.equal(existsSync(path.join(process.cwd(), "node_modules", "better-sqlite3", "build")), false);
});

test("packaged-app verification accepts a bundle with the host prebuild", async () => {
  const { appOutDir } = packagedApp();
  await verifyPackagedApp({ appOutDir, arch: process.arch, electronPlatformName: hostPlatform });
});

test("packaged-app verification removes other platforms' prebuilds", async () => {
  const { appOutDir, prebuilds } = packagedApp();
  await verifyPackagedApp({ appOutDir, arch: process.arch === "arm64" ? 3 : 1, electronPlatformName: hostPlatform });
  assert.deepEqual(readdirSync(prebuilds), [hostPrebuild]);
});

test("packaged-app verification rejects a bundle without the host prebuild", async () => {
  const { appOutDir } = packagedApp({ withHostPrebuild: false });
  await assert.rejects(
    verifyPackagedApp({ appOutDir, arch: process.arch, electronPlatformName: hostPlatform }),
    /better-sqlite3 native module is missing: .*prebuilds/
  );
});

test("packaged-app verification rejects an architecture that has no prebuild", async () => {
  const { appOutDir } = packagedApp();
  await assert.rejects(
    verifyPackagedApp({ appOutDir, arch: "universal", electronPlatformName: hostPlatform }),
    /better-sqlite3 native module is missing: .*-universal\.node/
  );
});
```

Keep the `verifyPackagedApp` `createRequire` line. The third test passes `arch` as electron-builder's numeric value, which pins Review Focus 2. The tests assume an x64 or arm64 host, which holds for CI and for every developer machine this repo supports.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/packaging-contract.test.js`
Expected: FAIL. The first test fails on `npmRebuild` (`true !== false`). The others fail with `better-sqlite3 native module is missing` for a path under `build/Release`. The product-name test passes.

- [ ] **Step 3: Change `build/verify-packaged-app.cjs`**

- Replace the `betterSqliteNativeRelativePath` constant (lines 4-11) with `betterSqlitePrebuildsRelativePath`, equal to `path.join(betterSqlitePackageRelativePath, "prebuilds")`. Declare it after `betterSqlitePackageRelativePath`.
- Remove the two `path.join("build", "Release", ...)` entries from `betterSqlitePrunablePaths`. Version 13 has no `build/` directory.
- In `verifyPackagedApp`, extend the guard at line 31 to `!platform || !arch || !appOutDir`. A prebuild cannot be chosen without an architecture.
- Change the cleanup to `cleanupBetterSqlitePackage(resourcesDir: string, keepPrebuild: string): void`, called with `` `${platform}-${arch}.node` ``. After the existing loop, it deletes every entry of the prebuilds directory whose name is not `keepPrebuild`. It does nothing more when the directory does not exist.
- Point `nativeModule` at `path.join(resourcesDir, betterSqlitePrebuildsRelativePath, keepPrebuild)`. Keep the `assertFile(nativeModule, "better-sqlite3 native module")` call and its label.
- Delete the sidecar check (lines 41-47, the `sidecars` filter and its `throw`).
- In both mismatch errors (lines 51-54 and 58-61), replace the sentence after `${platform}/${arch}.` with `Run npm ci to restore the better-sqlite3 prebuilds.`
- Leave `inspectNativeModule` and everything below it unchanged. The platform and architecture check still guards against a wrong file under the right name.

- [ ] **Step 4: Change `electron-builder.json`**

- Line 9: `"npmRebuild": false`. With `true`, electron-builder runs a rebuild for the target Electron. A compiled `build/Release` binary would then win over the prebuild (see Evidence).
- Delete line 34, the `better_sqlite3.electron-*.node` exclusion.
- Delete lines 38 to 40, the `docs/**`, `benchmark/**` and `test/**` exclusions. The 13.2.0 package has none of those directories. Keep the `deps/**`, `src/**`, `binding.gyp` and `README.md` exclusions, which still match files.

- [ ] **Step 5: Run the tests to see them pass**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/packaging-contract.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

Run `npm run typecheck` first, then:

```bash
git add package.json packages/core/package.json packages/cli/package.json packages/electron/package.json package-lock.json tests/architecture/packaging-contract.test.mjs build/verify-packaged-app.cjs electron-builder.json
git commit -m "chore(deps): move to better-sqlite3 13 and ship its prebuilds"
```

### Task 3: Delete the sidecar loader and its scripts

This task removes code and keeps behavior. The existing core suite is its test, because every store opens its database through `createBetterSqliteDatabase`.

**Files:**
- Modify: `packages/core/src/storage/sqlite-native.ts:1,15-48`
- Delete: `packages/core/test/unit/storage/sqlite-native-binding.test.mjs`
- Delete: `scripts/prepare-electron-sqlite.mjs`
- Modify: `package.json:64` (`test:e2e`), `:70` (`rebuild:sqlite3`), `:71` (`sqlite:electron`)

**Interfaces:**
- Produces: `createBetterSqliteDatabase(filename: string, options: BetterSqliteDatabaseOptions = {}): BetterSqliteDatabase`, unchanged for its six importers under `packages/core/src` and the test files that import it. `betterSqliteNativeBindingCandidates` no longer exists.

- [ ] **Step 1: Reduce `sqlite-native.ts`**

`createBetterSqliteDatabase` returns `new DatabaseConstructor(filename, options)`. Delete `betterSqliteNativeBindingCandidates`, `resolveBetterSqliteNativeBinding`, `requireFromHere`, the two module-level `let` variables, and the `createRequire` import. Keep the type exports and `BetterSqliteDatabaseOptions`.

- [ ] **Step 2: Delete the unit test and the script**

Run: `git rm packages/core/test/unit/storage/sqlite-native-binding.test.mjs scripts/prepare-electron-sqlite.mjs`
The unit test covers only `betterSqliteNativeBindingCandidates`, which is gone.

- [ ] **Step 3: Edit the root `package.json` scripts**

- `test:e2e` becomes `"npm run build:assets && playwright test"`.
- Delete the `rebuild:sqlite3` and `sqlite:electron` lines.

- [ ] **Step 4: Confirm that nothing still refers to the deleted names**

Run: `git grep -nE "sqlite:electron|rebuild:sqlite3|prepare-electron-sqlite|betterSqliteNativeBinding|better_sqlite3\.electron" -- . ':!docs/superpowers' ':!docs/src/components/interactive'`
Expected: hits only in `AGENTS.md`, `.claude/settings.json` and `packages/electron/src/main/main.ts`. Task 4 edits all three.

- [ ] **Step 5: Run the checks**

Run: `npm run typecheck && npm run test:core`
Expected: both exit 0. `test:core` no longer lists `sqlite-native-binding`.

- [ ] **Step 6: Commit**

```bash
git add -A packages/core/src/storage/sqlite-native.ts packages/core/test/unit/storage scripts package.json
git commit -m "refactor(core): delete the Electron sqlite sidecar loader and scripts"
```

### Task 4: Update the text and the rule that named the sidecar

**Files:**
- Modify: `AGENTS.md:11` (the `npm run test:e2e` bullet) and `AGENTS.md:53` (the Local checks paragraph)
- Modify: `.claude/settings.json:3-5` (the `permissions` block)
- Modify: `README.md:216` (the sentence that starts "Windows app packaging must run on Windows x64")
- Modify: `packages/electron/src/main/main.ts:78` (in `startupErrorMessage`)
- Modify: `build/windows-package-preflight.mjs:7`

- [ ] **Step 1: `AGENTS.md`**

Replace line 11 with:

```markdown
- `npm run test:e2e` builds the assets, then runs Playwright. Once per install, run `npm run test:e2e:install` first.
```

In line 53, delete the words `denies `npm run rebuild:sqlite3`,` so the sentence reads "blocks hand-edits to generated files, and runs typecheck plus".

- [ ] **Step 2: `.claude/settings.json`**

Delete the whole `permissions` block (lines 3-5). Its two `deny` entries block a script that no longer exists. The AGENTS.md sentence in Step 1 is the rule and this block is its check, so they change in the same commit. This edit changes permission settings, so ask Jason before making it. If he declines, leave the block and restore the AGENTS.md words.

- [ ] **Step 3: `README.md:216`**

Replace only the first sentence with: "Windows app packaging runs on Windows x64 only. The preflight check rejects other hosts." Leave the second sentence alone. Its `windows-latest` wording belongs to RS-4 in the [release safety plan](2026-11-16-audit-release-safety.md).

- [ ] **Step 4: `main.ts:78`**

Replace the string with:

```ts
"This usually means the installed app is missing the better-sqlite3 binary for this platform, or the file is damaged. Reinstall LLM Router. If the error returns, report it with the detail below.",
```

Leave `isBetterSqliteNativeError` unchanged.

- [ ] **Step 5: `build/windows-package-preflight.mjs:7`**

Replace the sentence with `"The NSIS packaging path is tested on Windows only."`. Keep the platform and architecture checks.

- [ ] **Step 6: Commit**

Run `npm run typecheck`, then:

```bash
git add AGENTS.md .claude/settings.json README.md packages/electron/src/main/main.ts build/windows-package-preflight.mjs
git commit -m "docs: drop the sqlite sidecar and rebuild instructions"
```

### Task 5: Verify before opening the PR

- [ ] **Step 1: Run the suites**

```sh
npm run typecheck
npm run test:architecture
npm run test:core
npm run test:electron
npm run test:cli
npm run test:e2e
git checkout -- packages/core/models.json packages/ui/src/generated
npm run test:system
```

Expected: every command exits 0. `test:e2e` needs `npm run test:e2e:install` once per install. `test:system` needs Docker. It builds the image on `node:24-bookworm-slim` and opens the config database through `better-sqlite3`, so it proves that the `linux` prebuild loads on glibc 2.36.

- [ ] **Step 2: Package the macOS app and inspect it**

```sh
npm run build:app:mac:local
git checkout -- packages/core/models.json packages/ui/src/generated
find release-local -path "*app.asar.unpacked/node_modules/better-sqlite3/*" -name "*.node"
```

Expected: the build exits 0, which means `verify-packaged-app.cjs` found and checked the host prebuild. `find` prints exactly one file, `prebuilds/darwin-<arch>.node`. If the build fails with `better-sqlite3 native module is missing`, electron-builder did not unpack `prebuilds/`. Add `"**/node_modules/better-sqlite3/prebuilds/**"` to `asarUnpack` in `electron-builder.json` and run the step again.

- [ ] **Step 3: Launch the packaged app in an isolated home**

```sh
T="$(mktemp -d)"
HOME="$T" LLMR_INTERNAL_HOME_DIR="$T" release-local/mac*/"LLM Router.app"/Contents/MacOS/"LLM Router"
```

Expected: the main window opens and no dialog says "The bundled SQLite native module could not be loaded". `find "$T" -name "*.sqlite"` lists at least one file. Quit the app.

- [ ] **Step 4: Open the PR**

Push the branch and open the PR with title `chore(deps): move to better-sqlite3 13 and delete the Electron sqlite sidecar`. The body states the three values from Task 1 Step 6 and says that Windows and Linux packaging were not run unless the owner step below was done.

- [ ] **Step 5 (owner): Package on Windows and Linux**

On Windows x64: `npm ci && npm run build:app:win`. On Linux x64: `npm ci && npm run build:assets && npx electron-builder --config build/electron-builder.local.cjs --linux AppImage --publish never`. Each build must exit 0, and the installed app must open. Without those machines, the first release after the merge is the first Windows and Linux packaging run. That is why EU-2, and ideally this PR's release, follow RS-1 and RS-2.

## EU-2: Upgrade to Electron 45

- **Fixes:** F-D1, F-D3.
- **Depends on:** EU-1 (merged). Ship it after RS-1 and RS-2 from the [release safety plan](2026-11-16-audit-release-safety.md) (see the [program index](2026-11-16-audit-remediation-index.md)), so the upgrade goes out through a release path that tests what it ships. Nothing in the code depends on them. They are an ordering rule for the release.
- **Branch:** `chore/electron-45`.
- **Size:** S.
- **Owner steps:** Approve `--min-release-age=0` if the chosen Electron patch is younger than 7 days and waiting is not acceptable. Run the Windows and Linux checklists in Task 8.

### Task 6: Bump Electron and electron-builder, and fix the two call sites

**Files:**
- Modify: `package.json:99` (`"electron": "^42.3.3"`), `package.json:100` (`"electron-builder": "^26.8.1"`)
- Modify: `packages/electron/package.json:17` (`"electron": "^42.3.3"`)
- Modify: `package-lock.json` (through npm only)
- Modify: `packages/electron/src/main/launch-at-login.ts:26` (in `loginItemSettings`)
- Modify: `packages/electron/src/main/built-in-browser.ts:689` (the `Copy Link` menu item)

- [ ] **Step 1: Create the branch and re-check the versions**

Run: `git switch -c chore/electron-45 && npm view electron dist-tags.45-x-y && npm view electron-builder dist-tags`
Expected: a `45.x.y` version, and the electron-builder tags.
- If electron-builder's `latest` is now 26.18.1 or a later 26.x, use that version and say so in the PR. If `latest` is still 26.18.0, use `26.18.1`.
- If `latest` is a 27.x, stay on the newest 26.x. A major bump of the packager is outside this plan.

- [ ] **Step 2: Edit the manifests by hand**

- `electron` becomes `^45.3.3` in both files. If 45.3.3 is younger than 7 days and Jason has not approved skipping the cooldown, write `^45.3.0` and let npm pick the newest eligible patch.
- `electron-builder` becomes the exact version `26.18.1`, with no caret. With a caret, npm resolves a range to the `latest` tag when that tag satisfies it, which gives 26.18.0 again.

- [ ] **Step 3: Install and confirm**

Run: `npm install && npm ls electron electron-builder app-builder-lib && node_modules/.bin/electron --version && grep -c electron_wer node_modules/app-builder-lib/out/electron/ElectronFramework.js`
Expected: one `electron@45.x.y`, `electron-builder@26.18.1`, `app-builder-lib@26.18.1`, then `v45.x.y`, then a count of 1 or more.

- [ ] **Step 4: Run the typecheck to see it fail**

Run: `npm run typecheck`
Expected: FAIL with `packages/electron/src/main/launch-at-login.ts(26,` and `Property 'openAsHidden' does not exist on type 'Settings'`. This is the failing test for the first edit.
If the typecheck reports any other error, the research missed a break. A renamed or re-typed Electron API under `packages/electron/src` is in scope. Fix it and name it in the PR. Stop and report anything else.

- [ ] **Step 5: Fix `launch-at-login.ts`**

Delete line 26, `settings.openAsHidden = false;`. Keep the `if (process.platform === "darwin")` block with its `return settings;`. macOS must still return before `path` and `args` are set.

- [ ] **Step 6: Fix `built-in-browser.ts`**

Line 689 becomes `click: () => void clipboard.writeText(params.linkURL),`. `clipboard.writeText` returns a Promise from Electron 44, and the neighboring `shell.openExternal` item already uses `void`. The compiler does not force this edit. The manual check in Task 8 is its test. Leave the `console-message` listener at line 620 unchanged. Its positional arguments are deprecated and go away in Electron 47.

- [ ] **Step 7: Run the checks**

Run: `npm run typecheck && node build/test.mjs electron && node --test .test-dist/electron/test/unit/launch-at-login.test.js && npm run test:electron`
Expected: all exit 0.

- [ ] **Step 8: Re-run the Task 1 load check on Electron 45**

Run: `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron -e "new (require('better-sqlite3'))(':memory:').close(); console.log('electron ok', process.versions.electron, process.versions.node)"`
Expected: `electron ok 45.x.y 24.x.y`.

- [ ] **Step 9: Commit**

Confirm with `git diff package.json packages/electron/package.json` that only the three version lines changed, then:

```bash
git add package.json packages/electron/package.json package-lock.json packages/electron/src/main/launch-at-login.ts packages/electron/src/main/built-in-browser.ts
git commit -m "chore(deps): upgrade to Electron 45 and electron-builder 26.18.1"
```

### Task 7: State the macOS 13 minimum

Electron 44 dropped macOS 12. No file in the repo states a minimum today.

**Files:**
- Modify: `README.md:122` (below the `### Desktop app (recommended)` heading)
- Modify: `docs/src/content/docs/en/guides/install.md:18` (below the `## Install the desktop app` heading)

- [ ] **Step 1: Add the sentence to both files**

Add this line as its own paragraph directly below each heading: "The desktop app needs macOS 13 (Ventura) or later on a Mac."

- [ ] **Step 2: Build the docs site**

Run: `cd docs && npm ci --ignore-scripts && npm rebuild sharp && npm run build`
Expected: exit 0. A PR check builds the docs only after RS-4 has merged, so run this locally either way.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/src/content/docs/en/guides/install.md
git commit -m "docs: state the macOS 13 minimum for the desktop app"
```

### Task 8: Verify before opening the PR

- [ ] **Step 1: Run the suites**

```sh
npm run typecheck
npm run test:architecture
npm run test:core
npm run test:electron
npm run test:e2e
git checkout -- packages/core/models.json packages/ui/src/generated
```

Expected: every command exits 0. `test:core` matters here because the gateway supervisor probes `better-sqlite3` under `ELECTRON_RUN_AS_NODE`.

- [ ] **Step 2: Package and inspect on macOS**

```sh
npm run build:app:mac:local
git checkout -- packages/core/models.json packages/ui/src/generated
/usr/libexec/PlistBuddy -c "Print :LSMinimumSystemVersion" release-local/mac*/"LLM Router.app"/Contents/Info.plist
```

Expected: the build exits 0 and the minimum prints `13.0` or higher. Put the printed value in the PR description. If it prints 12 or lower, the README sentence from Task 7 is still correct for Electron 45, so report the value and continue.

- [ ] **Step 3: Run the macOS checklist (implementer)**

Launch the packaged app as in Task 5 Step 3, with `HOME` and `LLMR_INTERNAL_HOME_DIR` set to a new temporary directory. Check each item and record the result in the PR.

- The main window opens and the gateway starts from **Server**.
- The launch-at-login toggle switches on and off without an error dialog, and stays as set after the app restarts. In an isolated home the toggle still registers the real login item, so switch it off before quitting.
- In the built-in browser, right-click a link and choose **Copy Link**. Then `pbpaste` prints that link's URL.
- The share-card PNG export saves a file that opens.
- The tray popover opens, shows its content, and closes.
- Quit the app. No crash report dialog appears.

- [ ] **Step 4: Open the PR**

Title: `chore(deps): upgrade to Electron 45`. The body lists the macOS results, states that Windows and Linux were not checked by the implementer, and repeats the owner checklist below.

- [ ] **Step 5 (owner): Run the Windows checklist**

On Windows x64, from the PR branch: `npm ci && npm run build:app:win`.

- The NSIS installer installs and the app opens.
- The install directory holds `LLM Router_wer.dll` beside `LLM Router.exe`. A file still named `electron_wer.dll` means electron-builder 26.18.1 is not the version in use.
- The launch-at-login toggle works, and the entry appears under Task Manager, Startup apps.
- **Copy Link** in the built-in browser puts the URL on the clipboard.
- After the release, a 7.2.1 install offers the update, installs it, and restarts into the new version.

- [ ] **Step 6 (owner): Run the Linux checklist**

On Linux x64, from the PR branch: `npm ci && npm run build:assets && npx electron-builder --config build/electron-builder.local.cjs --linux AppImage --publish never`.

- The AppImage starts and the main window opens.
- The built-in browser window, which uses `titleBarStyle: "hidden"` (`built-in-browser.ts:438`), and the tray popover (`tray-controller.ts:235`) draw their window frame and corners correctly. Electron 43 changed the rounded corners and the window-controls layout on Linux.
- **Copy Link** puts the URL on the clipboard.

Without a Windows or Linux machine, these checks run against the first release that carries EU-2. RS-2 publishes that release automatically once every platform uploads, so run them on the published release as soon as it is out. If a check fails, pull the release back with `gh release edit vX.Y.Z --draft` and fix forward.

- [ ] **Step 7: Release notes**

When the release that carries EU-2 is cut, its notes say: "The desktop app now needs macOS 13 or later. It runs on Electron 45."

## After EU-2 merges

### Task 9: Update the memory note, the handoff and this plan's location

This task is docs-only and commits straight to `main`. The memory files live outside the repo and are not committed.

- [ ] **Step 1: Update `/Users/jason/.claude/projects/-Users-jason-dev-llm-router/memory/dependency-audit-state.md`**

- In the "Majors still needing code" sentence of the 2026-10-26 paragraph, remove `better-sqlite3 13 (...)` and `Electron 45 (...)`. The list then starts at undici 8.
- In the first paragraph, delete the clause that says `npm run sqlite:electron` must follow `npm ci`. The script no longer exists.
- Append a dated paragraph with the two PR numbers and merge commits, and these facts: better-sqlite3 13.2.0 is N-API and ships `prebuilds/<platform>-<arch>.node`; `build/verify-packaged-app.cjs` prunes the other seven; `npmRebuild` is `false` and a `build/Release` binary would win over the prebuild; Electron 45 needed the `openAsHidden` and `clipboard.writeText` edits; `electron-builder` is pinned to exact `26.18.1` because `latest` was 26.18.0, so drop the pin when `latest` passes it; the macOS minimum is 13.
- Update the matching line in `MEMORY.md` in the same directory.

- [ ] **Step 2: Update the handoff**

Run `/remember`. The handoff states which of the owner checklists in Task 5 and Task 8 were run and which are still open, each with the command that runs it.

- [ ] **Step 3: Move this plan**

```bash
git mv docs/superpowers/plans/2026-11-16-audit-electron-upgrade.md docs/superpowers/plans/completed/
git grep -n "plans/2026-11-16-audit-electron-upgrade.md"
```

Repoint every hit, including the program index, to the `completed/` path. Then commit with `docs(superpowers): move the shipped Electron upgrade plan to completed`.

## Left out on purpose

- `resolveRuntime` in `build/run-tests.mjs:73-82` falls back to Electron when plain Node cannot load `better-sqlite3`. Under N-API the fallback no longer triggers. It is harmless and stays.
- `electron-updater` stays at 6.8.11. Version 6.8.12 sits on the `v26` tag beside electron-builder 26.18.1, and the Windows fix does not need it.
- `node-addon-api`, the new build-time dependency of better-sqlite3 13, is packaged into the app. Nobody measured its size in the bundle.
- The `console-message` listener keeps its deprecated positional arguments until an Electron 47 upgrade.
- No update guard for macOS 12 machines (D-9).

## Not verified by this plan's author

- That `better-sqlite3@13.2.0` loads under Electron 42.11.18 and 45. Task 1 Step 5 and Task 6 Step 8 settle it.
- That electron-builder unpacks `prebuilds/*.node` through the existing `asarUnpack` pattern, and that the app loads the binary from `app.asar.unpacked`. Task 5 Steps 2 and 3 settle it.
- That deleting seven unpacked prebuilds after packing, while the asar header still lists them, has no effect at run time. Task 5 Step 3 settles it for macOS. The owner checklists settle it for Windows and Linux.
- That Apple notarization accepts the vendor-built `.node` file. Only the release macOS job settles it.
- The glibc and macOS floors of the prebuilds. Task 1 Step 6 measures them.
- Windows and Linux packaging and visuals under Electron 45. The owner checklists settle them.
