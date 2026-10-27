# Fork Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM Router installs, updates, names its CLI and fetches its model catalog as its own product, with nothing pointing at upstream claude-code-router.

**Architecture:** Each identity value gets one defining constant and an architecture test that keeps its second copy in sync: the CLI name, the deep-link scheme and the appId. The model catalog moves to an orphan `models-catalog` branch of this repo, which a scheduled workflow force-pushes as a single commit. The CLI stops writing configs before it validates its arguments, and stops running a stale copy of itself after an upgrade. There is no migration path. Users uninstall the 4.x app and install 5.0.0 clean.

**Tech Stack:** TypeScript in `packages/core`, `packages/cli`, `packages/electron` and `packages/ui`; electron-builder; GitHub Actions; `node:test` with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/completed/2026-10-27-audit-remediation.md` (findings F1 to F6, and the Decisions section)

## Global Constraints

- Identity values, exactly:
  - appId: `net.matherly.llmrouter`
  - deep-link scheme: `llmr`
  - CLI command: `llmr`, for both the npm bin and the desktop launcher
  - desktop CLI runtime file: `llmr-cli.js`
  - catalog URL: `https://raw.githubusercontent.com/jrmatherly/llm-router/models-catalog/models.json`
  - docs site: `https://jrmatherly.github.io/llm-router/`
  - releases page: `https://github.com/jrmatherly/llm-router/releases/latest`
- Out of scope, unchanged: `CCR_*` env vars (including `CCR_CLI_COMMAND_NAME` and `CCR_MODEL_CATALOG_URL`), `x-ccr-*` headers, `/__ccr/` paths, `ccr:` IPC channel names, `window.ccr`, `@ccr/` aliases, the `.ccr-backup` and `.ccr-original` suffixes, and the `ccr-*-wrapper-*`, `ccr-claude-code-api-key-*` and `ccr-*-model-catalog.json` managed file names.
- No migration code. Remove legacy launcher files (`ccr`, `ccr.cmd`, `ccr-app`, `ccr-app.cmd`, `ccr-cli.js`) from `~/.llm-router/bin` on desktop start. Do not convert anything.
- The release that ships this is `v5.0.0`. Its notes tell users to quit LLM Router, uninstall it, install 5.0.0, and re-register `llmr://` links.
- Style per `AGENTS.md`. `packages/core/models.json` is generated and is never edited by hand. Restore it with `git checkout -- packages/core/models.json` after a build.
- This plan rebases after `2026-10-27-profile-config-safety.md` merges, because both touch `packages/core/src/profiles`.
- Task 6 links the docs site. It goes live only after the docs deploy in `2026-10-27-pipeline-and-cleanup.md` lands. Until then, links to the docs site are correct but return 404.

## Review Focus

1. A user who runs `llmr --version` or `llmr typo` while their agents are restored. Expected: no file under `~/.claude` or `~/.codex` changes. Pinned in Task 2.
2. A desktop upgrade where the app has not been reopened. Expected: `llmr` runs the new release's CLI, or prints one line saying to open LLM Router once. It never runs the old JS silently. Pinned in Task 3.
3. A machine that still has the 4.x `ccr-app` on PATH after the clean install. Expected: the 5.0.0 desktop start removes the old launcher files, so `ccr-app` stops resolving to stale JS. Pinned in Task 1.
4. The catalog workflow running when the generator fails part way. Expected: it pushes nothing, and the branch keeps the last good catalog. Pinned in Task 5.
5. A third-party page still emitting `ccr://provider?...` links. Expected: the 5.0.0 app does not claim them, and the docs explain the new scheme. Pinned in Task 4.

---

### Task 1: The CLI is called llmr everywhere (F4)

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts:31-33` (`desktopCliCommandName`, `desktopCliRuntimeFileName`), `:1738-1750` (legacy cleanup)
- Modify: `packages/core/src/profiles/service.ts:3408-3420` (`isManagedGeneratedBinFile`)
- Modify: `packages/cli/src/cli.ts:70` (`defaultCliCommandName`), `packages/cli/package.json` (`name`, `bin`, `private`, and remove `publishConfig`, `prepack` and `prepublishOnly`)
- Modify: root `package.json` `test:cli` (`-w` target)
- Modify: user-facing copy that names the command: `packages/ui/src/pages/home/shared/profiles.ts`, `packages/ui/src/pages/home/components/profiles.tsx`, `packages/cli/README.md`, `packages/cli/README_zh.md`, `docs/src/content/docs/{en,zh}/guides/cli.md`, `docs/src/content/docs/{en,zh}/guides/install.md`, `docker/README.md`
- Test: `packages/cli/test/integration/cli-help.test.mjs`, `tests/architecture/cli-identity.test.mjs` (new), and the core and UI tests that assert `ccr-app` (find them with `git grep -n "ccr-app\|ccr-cli" packages tests`)

**Interfaces:**
- Produces: `desktopCliCommandName = "llmr"`, `desktopCliRuntimeFileName = "llmr-cli.js"`, `defaultCliCommandName = "llmr"`. `packages/cli/package.json` becomes `{"name": "@claude-code-router/cli", "private": true, "bin": {"llmr": "dist/main/cli.js"}}`, matching the sibling workspace names. `legacyCliLauncherFileNames = ["ccr", "ccr.cmd", "ccr-app", "ccr-app.cmd", "ccr-cli.js"]` is exported from `launch-service.ts`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/architecture/cli-identity.test.mjs
test("the npm bin and the desktop launcher share one CLI name", () => {
  const cliPackage = JSON.parse(readFileSync("packages/cli/package.json", "utf8"));
  assert.deepEqual(Object.keys(cliPackage.bin), ["llmr"]);
  assert.equal(cliPackage.private, true);
  assert.match(readFileSync("packages/core/src/profiles/launch-service.ts", "utf8"), /desktopCliCommandName = "llmr"/);
});
```

In `cli-help.test.mjs`, change every `ccr` usage regex to `llmr` (lines 12-13, 28-31) and the `CCR_CLI_COMMAND_NAME` fixture value at :78 to `"llmr"`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test:architecture && npm run test:cli`
Expected: FAIL.

- [ ] **Step 3: Implement**

Change the constants. Make the legacy cleanup remove `legacyCliLauncherFileNames` and keep its existing "only if it is our launcher" check (`isLegacyManagedCcrCliLauncher`). Add the new names to `isManagedGeneratedBinFile`. Update the copy listed above. Leave the out-of-scope identifiers alone.

- [ ] **Step 4: Check that no command-name `ccr` is left in user copy**

Run: `git grep -nwE "ccr(-app)?( (serve|start|stop|ui|<))" -- packages docs README.md README_zh.md docker`
Expected: no output.

- [ ] **Step 5: Run every suite**

Run: `npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A packages docs docker tests/architecture/cli-identity.test.mjs package.json
git commit -m "feat(cli)!: rename the ccr and ccr-app commands to llmr"
```

### Task 2: The CLI checks its arguments before it writes anything (F6)

**Files:**
- Modify: `packages/cli/src/cli.ts` (`main` :73-125, `parseArgs` :243-292, `printHelp` :578)
- Modify: `build/esbuild.config.mjs` (the CLI build options' `define`)
- Test: `packages/cli/test/integration/cli-help.test.mjs`

**Interfaces:**
- Produces: `llmr --version` and `llmr -v`, matched only as the first argument, print `llmr <version>` and exit 0 before `loadAppConfig`. The version comes from `define: { "process.env.LLMR_VERSION": JSON.stringify(rootPackage.version) }`. In `main`, `findProfileForOpen(config, profileRef)` runs before `applyProfileConfig(config)`.

- [ ] **Step 1: Write the failing tests**

```js
test("--version prints the release version and touches no config", () => {
  const result = runCli(["--version"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `llmr ${rootPackageVersion}`);
});

test("an unknown profile fails before any agent config is written", () => {
  // temp HOME with a config that has a model and a global claude-code profile; ~/.claude/settings.json absent
  const result = runCli(["no-such-profile"], { env: { HOME: home, CCR_INTERNAL_HOME_DIR: home } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not found/i);
  assert.equal(existsSync(path.join(home, ".claude", "settings.json")), false);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node build/test.mjs cli && node --test .test-dist/cli/test/integration/cli-help.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add a `{ command: "version" }` result to `parseArgs` for `args[0]` of `--version` or `-v`. Swap the two lines in `main`. Add `--version` to `printHelp`.

- [ ] **Step 4: Run them and confirm they pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli build/esbuild.config.mjs
git commit -m "fix(cli): add --version and look up the profile before applying configs"
```

### Task 3: The desktop CLI never runs a stale copy (F5)

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts` (`prepareCcrCliLauncherRuntime` :1657-1673, the POSIX and Windows launcher writers near :1773-1810, `findBundledCcrCliSource` near :1755)
- Test: `packages/core/test/integration/profiles/profile-launch-core.test.mjs` or the launcher test that covers `prepareCcrCliLauncherRuntime` (find it with `git grep -n prepareCcrCliLauncherRuntime packages/core/test`)

**Interfaces:**
- Produces one of two outcomes, chosen by Step 1:
  - **Direct.** The launcher execs the app's bundled `cli.js` path from `findBundledCcrCliSource()`. `llmr-cli.js` and its companion copies are no longer written to `~/.llm-router/bin`.
  - **Checked copy.** The copy stays. The CLI compares `process.env.LLMR_VERSION` (from Task 2) with the `version` in the app's `package.json`, found next to `process.execPath` through the same resource candidates as `findBundledCcrCliSource`. On a mismatch it prints `llmr: LLM Router was updated; open it once to refresh this command.` to stderr and carries on. Skip the check when `process.versions.electron` is undefined.

- [ ] **Step 1: Settle the open question by prototype**

On a packaged build (`npm run build:app:mac:local`), run `ELECTRON_RUN_AS_NODE=1 "<app>/Contents/MacOS/LLM Router" "<app>/Contents/Resources/app.asar/dist/main/cli.js" --version`. Then run it with the path that `findBundledCcrCliSource()` returns, if that is `app.asar.unpacked`. Also check that the request-log worker and the companion runtimes load from that location. Record the command, its output and the outcome you chose in the PR description.

- [ ] **Step 2: Write the failing test for the chosen outcome**

For Direct:

```js
test("the desktop launcher runs the bundled CLI, not a copy", () => {
  prepareCcrCliLauncherRuntime();
  assert.equal(existsSync(path.join(binDir, "llmr-cli.js")), false);
  assert.match(readFileSync(path.join(binDir, "llmr"), "utf8"), new RegExp(escapeRegExp(bundledCliPath)));
});
```

For Checked copy, a CLI integration test runs the runtime with a fake `package.json` reporting `9.9.9` and asserts the stderr line above.

- [ ] **Step 3: Run it and confirm it fails**

Run: `node build/test.mjs core && node --test <the launcher test file>`
Expected: FAIL.

- [ ] **Step 4: Implement the chosen outcome**

For Direct, delete `syncCcrCliCompanionRuntimes` and `syncCcrCliModelCatalog` if nothing else calls them, and add `llmr-cli.js` to the legacy cleanup list from Task 1.

- [ ] **Step 5: Run every suite**

Run: `npm run test:core && npm run test:cli && npm run test:electron`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/profiles packages/cli packages/core/test
git commit -m "fix(cli): stop the desktop llmr command from running a stale copy after upgrades"
```

### Task 4: The app has its own appId and llmr:// scheme (F3)

**Files:**
- Modify: `electron-builder.json:2` (`appId`), `:25-29` (`protocols.schemes`)
- Modify: `packages/core/src/contracts/deep-link.ts:15` (`appDeepLinkProtocol`)
- Modify: `packages/ui/src/pages/home/shared/providers.ts:1606` (use `appDeepLinkProtocol` instead of the literal)
- Modify: `docs/src/content/docs/{en,zh}/configuration/provider-deeplink.md`, the plugin READMEs under `packages/electron/bundled-plugins/claude-design` and `claude-ship`, and the `ccr://` literals in `packages/core/src/web/management-server.ts` and `packages/core/src/gateway/router-plugin-contract.ts`. Do not touch `packages/core/src/agents/codex/cli-middleware-runtime.ts` until each of its 21 `ccr://` hits is confirmed to be the scheme and not an internal URI.
- Test: `tests/architecture/app-identity.test.mjs` (new), `packages/electron/test/unit/deep-link.test.mjs` (or wherever the 5 `ccr://` assertions live), `tests/architecture/rebrand-ccr.test.mjs` fixtures

**Interfaces:**
- Produces: `appDeepLinkProtocol = "llmr"`. `electron-builder.json` holds `"appId": "net.matherly.llmrouter"` and `"schemes": ["llmr"]`.

- [ ] **Step 1: Write the failing test**

```js
test("electron-builder registers the same scheme the app parses", () => {
  const builder = JSON.parse(readFileSync("electron-builder.json", "utf8"));
  assert.equal(builder.appId, "net.matherly.llmrouter");
  assert.deepEqual(builder.protocols.flatMap((protocol) => protocol.schemes), ["llmr"]);
  assert.match(readFileSync("packages/core/src/contracts/deep-link.ts", "utf8"), /appDeepLinkProtocol = "llmr"/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:architecture`
Expected: FAIL.

- [ ] **Step 3: Implement, then update the deep-link tests to `llmr://`**

- [ ] **Step 4: Check for leftover scheme literals**

Run: `git grep -n "ccr://" -- packages docs tests ':!packages/core/src/agents/codex/cli-middleware-runtime.ts'`
Expected: only the `rebrand-ccr.test.mjs` fixtures, which test the old sweep script.

- [ ] **Step 5: Run every suite**

Run: `npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A electron-builder.json packages docs tests
git commit -m "feat!: give LLM Router its own appId and llmr:// scheme"
```

### Task 5: The model catalog comes from this repository (F2)

**Files:**
- Create: `.github/workflows/model-catalog.yml`
- Modify: `packages/core/src/models/catalog-file.ts:7` (`DEFAULT_MODEL_CATALOG_URL`)
- Delete: `scripts/update-models-cdn.mjs`, the `models:update` script in root `package.json`, `cdn/` (all of it, after Step 4 moves the button script)
- Create: `docs/public/llmr-provider-buttons.js` and `docs/public/llmr-icon.png`, moved from `cdn/public/`, with every `ccr://` changed to `llmr://`
- Modify: `docs/src/content/docs/{en,zh}/configuration/provider-deeplink.md` (the `<script src>` lines 126, 141, 153 become `https://jrmatherly.github.io/llm-router/llmr-provider-buttons.js`)
- Test: `tests/architecture/model-catalog.test.mjs` (new)

**Interfaces:**
- Produces: `DEFAULT_MODEL_CATALOG_URL = "https://raw.githubusercontent.com/jrmatherly/llm-router/models-catalog/models.json"`. The workflow runs on `schedule: cron "17 6 * * *"` and `workflow_dispatch`. Workflow-level permissions are `contents: read`, and one job sets `contents: write` and checks out with `persist-credentials: false`. The job:
  1. Runs `node scripts/generate-models-json.mjs --strict`.
  2. Validates `schemaVersion === 2` and that `models` is a non-empty array.
  3. Compares against the current branch file and stops when it is unchanged.
  4. Otherwise runs `git switch --orphan models-catalog-next`, commits only `models.json`, and runs `git push --force "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}" HEAD:models-catalog`.

- [ ] **Step 1: Write the failing test**

```js
test("installed apps fetch the catalog from this repository", () => {
  assert.match(readFileSync("packages/core/src/models/catalog-file.ts", "utf8"),
    /DEFAULT_MODEL_CATALOG_URL = "https:\/\/raw\.githubusercontent\.com\/jrmatherly\/llm-router\/models-catalog\/models\.json"/);
  assert.equal(existsSync("scripts/update-models-cdn.mjs"), false);
  assert.equal(existsSync("cdn"), false);
});

test("the catalog workflow pushes only the models-catalog branch and only after a strict build", () => {
  const workflow = readFileSync(".github/workflows/model-catalog.yml", "utf8");
  assert.match(workflow, /generate-models-json\.mjs --strict/);
  assert.match(workflow, /HEAD:models-catalog\b/);
  assert.doesNotMatch(workflow, /HEAD:main|refs\/heads\/main/);
  assert.match(workflow, /persist-credentials: false/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:architecture`
Expected: FAIL.

- [ ] **Step 3: Implement the workflow, the constant and the moves**

Pin every action by full SHA, as the existing workflows do. `set -euo pipefail` makes a generator failure stop the job before any push.

- [ ] **Step 4: Run every suite**

Run: `npm run test:architecture && npm run test:core`
Expected: PASS. `packages/core/test/unit/models/model-catalog-file.test.mjs` uses `https://test.invalid/models.json` and needs no change.

- [ ] **Step 5: Commit**

```bash
git add -A .github/workflows/model-catalog.yml packages/core/src/models/catalog-file.ts scripts package.json cdn docs tests/architecture/model-catalog.test.mjs
git commit -m "feat(models): serve the model catalog from this repository's models-catalog branch"
```

- [ ] **Step 6: After merge, seed and verify the branch**

The operator triggers `model-catalog.yml` with `workflow_dispatch`. Then run:

Run: `curl -s https://raw.githubusercontent.com/jrmatherly/llm-router/models-catalog/models.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s);console.log(c.schemaVersion,c.models.length)})"`
Expected: `2` followed by a model count above 0.

### Task 6: The README installs this fork (F1)

**Files:**
- Modify: `README.md` and `README_zh.md` (badges :10-19, downloads :140-161, CLI :186-190, docs links :190, :198, :238-245)

**Interfaces:**
- Produces: download links go to the releases page, with no versioned asset URLs that go stale. The CLI section says `llmr` is put on PATH by the desktop app on first launch, and there is no `npm install` line. Docs links point at the docs site. The license badge points at this repo. Upstream is credited once, with a link, as the project this fork came from.

- [ ] **Step 1: Write the failing test**

```js
// tests/architecture/readme-identity.test.mjs
for (const file of ["README.md", "README_zh.md"]) {
  test(`${file} points at this fork`, () => {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /musistudio\/claude-code-router\/releases|npm install -g @musistudio|ccrdesk\.top/);
    assert.match(text, /github\.com\/jrmatherly\/llm-router\/releases\/latest/);
  });
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:architecture`
Expected: FAIL.

- [ ] **Step 3: Rewrite the sections**

Keep the Chinese README in step with the English one, section for section.

- [ ] **Step 4: Run it and confirm it passes, then commit**

```bash
git add README.md README_zh.md tests/architecture/readme-identity.test.mjs
git commit -m "docs: point the README install and docs links at this fork"
```

### Task 7: Prove it on a packaged build and open the PR

**Files:** none changed.

- [ ] **Step 1: Clean-install check on macOS**

Quit and uninstall the 4.x app. Build with `npm run build:app:mac:local` and install it. Then check:
- `osascript -e 'id of app "LLM Router"'` prints `net.matherly.llmrouter`.
- `open "llmr://provider?payload=e30"` brings the app forward.
- `llmr --version` prints `llmr 5.0.0` (or the branch version).
- `ls ~/.llm-router/bin` shows no `ccr`, `ccr-app` or `ccr-cli.js`.

- [ ] **Step 2: Run every suite**

Run: `npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 3: Open the PR**

Title: `feat!: LLM Router identity (appId, llmr:// scheme, llmr CLI, self-hosted catalog)`. The body carries the clean-reinstall instructions that the `v5.0.0` release notes will reuse, and says that cutting `v5.0.0` with `npm run release -- major` is the operator's step after merge.

## Risks

- **macOS keychain and permission prompts reset.** A new bundle id means macOS treats the app as new, so users re-grant any permissions. This is accepted with the clean reinstall.
- **Windows installs side by side.** The NSIS GUID derives from the appId, so 5.0.0 installs beside 4.x rather than over it. The release notes tell users to uninstall 4.x first.
- **Raw GitHub limits.** `raw.githubusercontent.com` is rate-limited per IP. Each app fetches at most hourly, served gzipped at 1.27 MB (measured 2026-10-27), and falls back to the bundled and cached catalog on failure (`packages/core/src/models/catalog-file.ts:59-61`).
- **Force-pushing `models-catalog`.** The branch is bot-owned data with no history by design. Never protect it in a way that blocks the workflow, and never base work on it.
