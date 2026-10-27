# AI Assistant Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every test suite in this repo pass from one local install, then commit the instruction file, rules, hooks and verify skill that keep coding assistants inside the project's standards.

**Architecture:** Fix the test suites first (heap sizing, desktop-runtime detection in tests, a sidecar Electron build of `better-sqlite3`) so a commit gate can require green. Then add a short `AGENTS.md` that `CLAUDE.md` imports, four path-scoped rules that name the check enforcing each standard, two deterministic node hooks that block on their own failure, and a project `verify` skill. Hooks and the skill bind Claude Code sessions only; the tests and build checks bind everyone.

**Tech Stack:** Node 24 (`engines`, CI and `.node-version` pin 24; 24.22.1 locally), npm workspaces with `allowScripts`, esbuild, `node:test`, Playwright 1.61.1, Electron 42.4.1, better-sqlite3 12.11.1, Claude Code 2.1.310 hooks and skills.

**Spec:** `docs/superpowers/specs/completed/2026-10-25-ai-assistant-guardrails.md`

**Revision 3 (2026-10-25):** after a second independent review. Hooks block on their own failure (`onFailure: "block"`), resolve the repo root from the input `cwd`, refuse to gate a tree with no `node_modules`, match every `git ... commit` spelling and the Jean commit tool, close the Serena `replace_in_files` scope hole, and compare temp paths by realpath. The verify runner is a node script that restores generated files only when they were clean before the run, and its tests run inside a throwaway git repo. `node-abi` is replaced by Electron's own ABI report. Single-file test commands drop `--scope`. Rules name their check instead of restating its numbers.

**Revision 4 (2026-10-25, as built on branch `ai-assistant-guardrails`):** the sidecar is named by Electron version (`better_sqlite3.electron-<version>.node`, from `process.versions.electron` and `electron/package.json`) instead of ABI, because learning the ABI meant launching Electron, whose first launch after `npm ci` prints a download banner. `npm run test:e2e` runs `npm run sqlite:electron` itself, and the e2e fixture helpers run under node. The commit gate runs only when the resolved root's `package.json` names this project. `protect-generated.mjs` blocks on unparsable input. `build/verify-packaged-app.cjs` rejects a bundle that carries a sidecar, with fixture tests. The commit regex accepts long git options. Tasks 1 to 9 are complete.

## Global Constraints

- Package manager is npm. Every install step is `npm ci` against `package-lock.json`. `allowScripts` in the root `package.json` lists the native dependencies whose install scripts may run; approve a new one with `npm install-scripts approve <pkg>`. Never run pnpm in this repo.
- Code style: double quotes, semicolons, two-space indent, object keys and type members usually alphabetized (follow the surrounding file), `node:` imports first then `@ccr/<pkg>/...` aliases, `type` aliases unless the surrounding file already uses `interface`, no comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`. Core, Electron and CLI tests are `*.test.mjs`; UI component tests are `*.test.ts` or `*.test.tsx`. They live under `packages/<pkg>/test/{unit,integration,component}` or `tests/architecture/`. Run one package with `npm run test:<pkg>`. Run one file with `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit-or-integration>/<path>.test.js` (do not pass `--scope`; it drops the `unit/` or `integration/` segment from the output path).
- Instruction files stay under 120 lines each. A rule names the check that enforces it and the command that runs the check; it does not restate the check's numbers or lists, which would drift.
- Hook scripts are `.mjs` files in `.claude/hooks/`, read JSON on stdin, print nothing on success, and block by writing to stderr and calling `process.exit(2)`. No other exit code blocks, and a hook that cannot start or times out is only blocking because its settings entry sets `onFailure: "block"`.
- `npm run build:assets` (and therefore `npm run test:e2e`) regenerates the tracked files `packages/core/models.json` and `packages/ui/src/generated/claude-code-config-options.json`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated` unless the change to them is intended.
- Nothing AI-written goes under `docs/` except `docs/superpowers/`.
- Commit after each task with the message given. End every commit message with the attribution line the session is instructed to use.

## Review Focus

1. **Sidecar leaks into a packaged app.** `electron-builder.json` unpacks `**/*.node` and `npmRebuild` rebuilds the main binary, so a host-arch sidecar left from `npm run sqlite:electron` would ship and the resolver would prefer it. Task 4 adds the `files` exclusion and a test that asserts it is present.
2. **Commit gate fails open.** Only exit code 2 blocks a `PreToolUse` hook; a crash, a missing `node`, a timeout or a `null` spawn status is otherwise a non-blocking error and the commit proceeds. Task 7 sets `onFailure: "block"`, tests `status !== 0`, and has a test that runs the gate against a failing check.
3. **Gate runs in the wrong directory.** `CLAUDE_PROJECT_DIR` stays at the original checkout in a worktree, and `cwd` follows every `cd`. Task 7 resolves `git rev-parse --show-toplevel` from the input `cwd`, refuses with a clear message when that tree has no `node_modules` (your worktrees are created `fresh`), and tests both.
4. **Heap test on a future node.** A heap limit above 1 GiB would push the dynamic request count past the 30 s timeout. Task 2 caps the count and asserts the cap still exceeds the measured limit.
5. **A verify run discards intended edits to generated files.** Task 8 restores the two generated files only when they were clean before the e2e run, prints `SKIPPED restore` otherwise, and its tests run in a throwaway git repo so they never touch the real tree.

---

### Task 1: Toolchain baseline

Steps 1 and 2 were completed on 2026-10-25 and committed with the node 24 / npm install-scripts change. Step 3 remains.

**Files:**
- Modify: none committed. Writes `node_modules/`, `~/Library/Caches/ms-playwright/`.

**Interfaces:**
- Produces: a node_modules laid out by npm (no `node_modules/.pnpm`), `node_modules/.bin/electron-rebuild` present, the Playwright Chromium build that the installed `@playwright/test` 1.61.1 pins (`chromium_headless_shell-1228`).

- [x] **Step 1: Reinstall from the lockfile**

Run: `rm -rf node_modules packages/*/node_modules && npm ci`
Expected: exits 0 and ends without an `install-scripts` warning. `ls node_modules/.pnpm` reports "No such file". `node -e "console.log(require('./node_modules/electron/package.json').version)"` prints `42.4.1`.

- [x] **Step 2: Install the Playwright browser the config needs**

Run: `npm run test:e2e:install`
Expected: `npx playwright install chromium --dry-run` lists install locations that already exist.

- [ ] **Step 3: Record the baseline**

Run each and note pass/fail counts: `npm run typecheck`, `npm run test:architecture`, `npm run test:core`, `npm run test:ui`, `npm run test:electron`, `npm run test:cli`, `npm run test:e2e`, then `git checkout -- packages/core/models.json packages/ui/src/generated`.
Expected: typecheck clean; architecture 5 pass; core 1116 pass 4 fail; ui 212 pass; electron 44 pass; cli 6 pass; e2e 17 pass, 1 fail, 3 did not run: `electron-cdp.spec.ts` fails in `beforeAll` at `createLegacyApiKeyDatabase` with `NODE_MODULE_VERSION 137 ... requires 146` and its other 3 tests do not run. If core shows different failures than the spec lists, stop and report before continuing.

No commit for this task.

---

### Task 2: Size the bounded-heap test from the live heap limit

**Files:**
- Modify: `packages/core/test/integration/observability/request-log-store.test.mjs:1868-1894` (the count is at line 1877)

**Interfaces:**
- Consumes: `recordLargeAgentRequests(store, dbFile, { paddingBytes, requestCount, sessionId })` at line 179 of the same file, which returns total body bytes. `getHeapStatistics` is already imported there.

- [ ] **Step 1: Reproduce the failure under node 24**

Run: `node build/test.mjs core && CCR_REQUEST_LOG_BOUNDED_HEAP_WORKER=1 node --max-old-space-size=64 --test .test-dist/core/test/integration/observability/request-log-store.test.js`
Expected: `tests 37`, `fail 1`, on `streams more body text than the bounded worker heap` with `ok(totalBodyBytes > ... heap_size_limit)`.

- [ ] **Step 2: Replace the fixed request count**

In the test body, replace `const requestCount = 384;` with:

```js
const paddingBytes = 256 * 1024;
const heapLimit = getHeapStatistics().heap_size_limit;
const requestCount = Math.min(2048, Math.ceil(heapLimit / (2 * paddingBytes)) + 16);
assert.ok(requestCount * 2 * paddingBytes > heapLimit, `cap of 2048 requests cannot exceed heap limit ${heapLimit}`);
```

Pass `paddingBytes` and `requestCount` through to `recordLargeAgentRequests`. Keep the existing `assert.ok(totalBodyBytes > getHeapStatistics().heap_size_limit)` and the four analysis assertions. On node 24 the heap limit is 268435456, the formula yields 528 requests, and the test takes about 1.5 s.

- [ ] **Step 3: Verify under node 24**

Run the Step 1 command again.
Expected: `tests 37`, `fail 0`.

- [ ] **Step 4: Run the whole core suite**

Run: `npm run test:core`
Expected: `ℹ fail 3` (the three desktop-runtime failures remain).

- [ ] **Step 5: Commit**

```bash
git add packages/core/test/integration/observability/request-log-store.test.mjs
git commit -m "test(core): size bounded-heap request count from the live heap limit"
```

---

### Task 3: Shared desktop-runtime test helper

**Files:**
- Create: `packages/core/test/support/desktop-runtime.mjs`
- Create: `packages/core/test/unit/runtime/desktop-runtime-helper.test.mjs`
- Modify: `packages/core/test/unit/config/plugin-config-migration.test.mjs` (the two tests that set `process.env[CCR_DESKTOP_APP_ENV] = "1"`, at lines 17 and 103)
- Modify: `packages/core/test/unit/agents/plugin-permissions.test.mjs:323-331` (`withDesktopRuntime`)

**Interfaces:**
- Produces: `export async function withDesktopRuntime(run)` in `packages/core/test/support/desktop-runtime.mjs`. Sets `process.env.CCR_DESKTOP_APP = "1"` and, when `process.versions.electron` is undefined, assigns `process.versions.electron = "test"`. Awaits `run()`, restores both in `finally` (deleting a key whose previous value was `undefined`), returns `run()`'s value.
- Consumes: `CCR_DESKTOP_APP_ENV` from `@ccr/core/runtime/desktop-app.ts`.

- [ ] **Step 1: Write the failing helper test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { isDesktopAppRuntime } from "@ccr/core/runtime/desktop-app.ts";
import { withDesktopRuntime } from "../../support/desktop-runtime.mjs";

test("withDesktopRuntime makes isDesktopAppRuntime true under plain node", async () => {
  delete process.env.CCR_DESKTOP_APP;
  assert.equal(isDesktopAppRuntime(), false);
  const seen = await withDesktopRuntime(() => isDesktopAppRuntime());
  assert.equal(seen, true);
  assert.equal(isDesktopAppRuntime(), false);
});

test("withDesktopRuntime restores env and versions after a throw", async () => {
  const before = { env: process.env.CCR_DESKTOP_APP, electron: process.versions.electron };
  await assert.rejects(withDesktopRuntime(() => { throw new Error("boom"); }), /boom/);
  assert.equal(process.env.CCR_DESKTOP_APP, before.env);
  assert.equal(process.versions.electron, before.electron);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/runtime/desktop-runtime-helper.test.js`
Expected: FAIL, esbuild reports the unresolved import `../../support/desktop-runtime.mjs`.

- [ ] **Step 3: Implement the helper**

Create `packages/core/test/support/desktop-runtime.mjs` with the `withDesktopRuntime(run)` described in Interfaces.

- [ ] **Step 4: Run the helper test**

Run the Step 2 command.
Expected: PASS, 2 tests.

- [ ] **Step 5: Use the helper in the two failing test files**

In `plugin-permissions.test.mjs` delete the local `withDesktopRuntime` and import the helper from `../../support/desktop-runtime.mjs`; keep the local `restoreEnv`, other tests in the file still call it. In `plugin-config-migration.test.mjs` wrap the body of the two tests that set `process.env[CCR_DESKTOP_APP_ENV] = "1"` in `await withDesktopRuntime(async () => { ... })`, remove the manual save and restore for that key, make those tests `async`, and keep `restoreEnv` for the `CCR_EXTENSIONS_DIR` handling.

- [ ] **Step 6: Run the core suite**

Run: `npm run test:core`
Expected: `ℹ fail 0`.

- [ ] **Step 7: Commit**

```bash
git add packages/core/test/support/desktop-runtime.mjs packages/core/test/unit/runtime/desktop-runtime-helper.test.mjs packages/core/test/unit/config/plugin-config-migration.test.mjs packages/core/test/unit/agents/plugin-permissions.test.mjs
git commit -m "test(core): share a desktop-runtime helper so plugin tests pass under node"
```

---

### Task 4: Dual-runtime SQLite binding

**Files:**
- Create: `scripts/prepare-electron-sqlite.mjs`
- Create: `packages/core/test/unit/storage/sqlite-native-binding.test.mjs`
- Create: `tests/architecture/packaging-contract.test.mjs`
- Modify: `packages/core/src/storage/sqlite-native.ts:15-40`
- Modify: `tests/e2e/electron-cdp.spec.ts:367-372` (`createLegacyApiKeyDatabase`) and `:407-416` (`readSqliteRows`)
- Modify: `electron-builder.json` (`files`)
- Modify: `package.json` scripts

**Interfaces:**
- Produces: `export function betterSqliteNativeBindingCandidates(versions: { electron?: string; modules?: string }): string[]` in `sqlite-native.ts`, returning module-relative paths in priority order: `["better-sqlite3/build/Release/better_sqlite3.electron-<modules>.node", "better-sqlite3/build/Release/better_sqlite3.node"]` when `versions.electron` is set, else only the second.
- Produces: `npm run sqlite:electron`, which writes `node_modules/better-sqlite3/build/Release/better_sqlite3.electron-<abi>.node` where `<abi>` is what Electron itself reports: `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron -p process.versions.modules` (146 for 42.4.1; this is the same value the resolver reads at runtime, so no `node-abi` dependency). The node binary is never touched.
- Produces: in `electron-builder.json` `files`, the entry `"!node_modules/better-sqlite3/build/Release/better_sqlite3.electron-*.node"`.

- [ ] **Step 1: Write the failing resolver test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { betterSqliteNativeBindingCandidates } from "@ccr/core/storage/sqlite-native.ts";

test("node runtime resolves only the default binary", () => {
  assert.deepEqual(betterSqliteNativeBindingCandidates({ modules: "137" }), [
    "better-sqlite3/build/Release/better_sqlite3.node"
  ]);
});

test("electron runtime prefers the ABI-named sidecar", () => {
  assert.deepEqual(betterSqliteNativeBindingCandidates({ electron: "42.4.1", modules: "146" }), [
    "better-sqlite3/build/Release/better_sqlite3.electron-146.node",
    "better-sqlite3/build/Release/better_sqlite3.node"
  ]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/storage/sqlite-native-binding.test.js`
Expected: FAIL, `betterSqliteNativeBindingCandidates` is not exported.

- [ ] **Step 3: Implement the resolver**

In `sqlite-native.ts` add the exported pure function from Interfaces, and change `resolveBetterSqliteNativeBinding()` to iterate `betterSqliteNativeBindingCandidates(process.versions)` and return the first that `requireFromHere.resolve` succeeds on. Keep the `nativeBindingResolved` cache.

- [ ] **Step 4: Run the resolver test and the core suite**

Run: the Step 2 command, then `npm run test:core`.
Expected: PASS, then `ℹ fail 0`.

- [ ] **Step 5: Write the packaging-contract test, then the exclusion**

`tests/architecture/packaging-contract.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("packaged apps never carry the Electron sidecar binary", () => {
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "electron-builder.json"), "utf8"));
  assert.ok(config.files.includes("!node_modules/better-sqlite3/build/Release/better_sqlite3.electron-*.node"));
});
```

Run: `npm run test:architecture`
Expected: FAIL on this test. Then add the entry to `files` in `electron-builder.json` after the existing `!node_modules/better-sqlite3/deps/**` line and run again.
Expected: PASS, 6 tests.

- [ ] **Step 6: Write the sidecar script**

Create `scripts/prepare-electron-sqlite.mjs` (ESM, `node:` imports only):

1. `electronBin = node_modules/.bin/electron`; `electronVersion` from `node_modules/electron/package.json`; `abi = spawnSync(electronBin, ["-p", "process.versions.modules"], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8" }).stdout.trim()`. Exit 1 with a message if `abi` is not digits.
2. `sidecar = node_modules/better-sqlite3/build/Release/better_sqlite3.electron-<abi>.node`. If it exists, print it and exit 0.
3. Create a temp dir under `os.tmpdir()` and copy `node_modules/better-sqlite3/package.json` into it (prebuild-install reads `package.json` from its cwd; verified to work with only that file present).
4. Run `node_modules/.bin/prebuild-install --runtime electron --target <electronVersion>` with `cwd` set to the temp dir. It downloads about 2 MB from GitHub releases and writes `<tempdir>/build/Release/better_sqlite3.node`.
5. Copy that file to `sidecar`, remove the temp dir in `finally`, print the sidecar path.

Add to root `package.json` scripts: `"sqlite:electron": "node scripts/prepare-electron-sqlite.mjs"`. Leave `rebuild:sqlite3` as is; it is for Windows packaging.

- [ ] **Step 7: Run the script and prove both runtimes load**

Run: `npm run sqlite:electron`
Expected: prints `.../better_sqlite3.electron-146.node`; `ls node_modules/better-sqlite3/build/Release/` shows both files.
Run: `node -e "require('better-sqlite3')(':memory:').close(); console.log('node ok')"`
Expected: `node ok`.
Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e "const D=require('better-sqlite3'); new D(':memory:',{nativeBinding:require.resolve('better-sqlite3/build/Release/better_sqlite3.electron-'+process.versions.modules+'.node')}).close(); console.log('electron ok')"`
Expected: `electron ok`.

- [ ] **Step 8: Make both e2e Electron helpers use the sidecar**

In `tests/e2e/electron-cdp.spec.ts`, both inline scripts (`createLegacyApiKeyDatabase` at line 370 and `readSqliteRows` at line 410) construct `Database` with `nativeBinding: require.resolve("better-sqlite3/build/Release/better_sqlite3.electron-" + process.versions.modules + ".node")`. The scripts run inside Electron with `cwd: projectRoot`, where that `require.resolve` works. The Electron main process needs no change: it loads through `sqlite-native.ts`.

- [ ] **Step 9: Run the full e2e suite**

Run: `npm run test:e2e; git checkout -- packages/core/models.json packages/ui/src/generated`
Expected: `21 passed` (5 cli-web, 4 electron-cdp, 2 opencode-go-import, 7 provider-edit, 3 recent-issues), 0 failed, 0 did not run, and `git status --short` shows only this task's files.

- [ ] **Step 10: Run typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add scripts/prepare-electron-sqlite.mjs packages/core/src/storage/sqlite-native.ts packages/core/test/unit/storage/sqlite-native-binding.test.mjs tests/architecture/packaging-contract.test.mjs tests/e2e/electron-cdp.spec.ts electron-builder.json package.json
git commit -m "build: load an Electron sidecar build of better-sqlite3 so node and Electron suites share one install"
```

---

### Task 5: Instruction files and gitignore

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Modify: `.gitignore:10` (`.claude`)

**Interfaces:**
- Produces: `AGENTS.md`, hand-written, no plugin markers, sections in this order: Commands, Where the standards are enforced, Style that differs from defaults, Generated files, Repository etiquette, Local checks. Every line is an instruction or a fact an assistant can act on; no meta commentary.

- [ ] **Step 1: Un-ignore the committed Claude config**

Replace the line `.claude` in `.gitignore` with:

```
.claude/*
!.claude/settings.json
!.claude/rules/
!.claude/skills/
!.claude/hooks/
```

Run: `git check-ignore .claude/settings.json .claude/settings.local.json .claude/rules/x.md; echo "exit $?"`
Expected: prints only `.claude/settings.local.json` and `exit 0`. (Do not pass `-v`; it also prints negation matches.)

- [ ] **Step 2: Write AGENTS.md**

Content, under 120 lines, from the spec:

- Commands: `npm ci`, `npm run typecheck`, `npm run test:architecture`, `npm run test:<core|ui|electron|cli>`, `npm run test:e2e` (needs `npm run test:e2e:install` and `npm run sqlite:electron` once), `npm run build:assets`, `npm run dev:electron`, and the single-file test command from Global Constraints.
- Where the standards are enforced, with the command that runs each: `tests/architecture/*.test.mjs` (`npm run test:architecture`, also run by the commit gate); `packages/core/test/architecture/gateway-service-architecture.test.mjs` (`npm run test:core`, not run by the gate); the lightweight MCP bundle guard `validateLightweightMcpBundles` in `build/esbuild.config.mjs` (`npm run build:assets` only). Read the check before changing the structure it guards; change a rule only together with its check.
- Style: the Global Constraints style line.
- Generated files, each with its regeneration command, never hand-edited: `packages/core/models.json` (`npm run models:build`), `packages/ui/src/generated/claude-code-config-options.json` (`node scripts/generate-claude-code-config-options.mjs`), `package-lock.json` (npm), `dist/` and `.test-dist/` (build output). Then: "`npm run build:assets` and `npm run test:e2e` rewrite the first two with a new timestamp; restore them with `git checkout -- packages/core/models.json packages/ui/src/generated` unless the change is intended. Bulk replaces with Serena `replace_in_files` must set `relative_path` to a file or directory; a project-wide replace is blocked."
- Etiquette: npm only and the `allowScripts` rule; no AI review notes or plan docs under `docs/` outside `docs/superpowers/`; tests that need `CCR_EXTENSIONS_DIR` create their own temp dirs, nothing depends on sibling checkouts.
- Local checks: "In Claude Code sessions, `.claude/settings.json` blocks hand-edits to generated files and runs typecheck plus `npm run test:architecture` before every `git commit` and before the Jean commit tool (about 11 s). A fresh worktree without `node_modules` blocks commits until `npm ci` runs there. `CCR_GATE_COMMANDS` and `CCR_VERIFY_COMMANDS` exist for tests only; never set them in a session. Edits made through Bash (`sed`, redirects) and commits from other tools are not hooked; the tests above are the check."

- [ ] **Step 3: Write CLAUDE.md**

`CLAUDE.md` contains exactly one line: `@AGENTS.md`. With a `CLAUDE.md` present Claude Code does not read `AGENTS.md` on its own, so the import is required.

- [ ] **Step 4: Verify the file loads**

Run: `wc -l AGENTS.md`
Expected: under 120.
Add a temporary `InstructionsLoaded` hook to `.claude/settings.local.json` whose command appends stdin to a file in the session scratchpad, start a fresh `claude` session, and read the file.
Expected: an entry with `file_path` ending in `AGENTS.md` and `load_reason` `include`. Remove the temporary hook afterwards (Task 6 reuses the same hook, so it may stay until then).

- [ ] **Step 5: Commit**

```bash
git add .gitignore AGENTS.md CLAUDE.md
git commit -m "docs: add AGENTS.md instructions for coding assistants and commit .claude config"
```

---

### Task 6: Path-scoped rules

**Files:**
- Create: `.claude/rules/gateway.md`
- Create: `.claude/rules/mcp-subprocess.md`
- Create: `.claude/rules/tests.md`
- Create: `.claude/rules/ui.md`

**Interfaces:**
- Produces: four rule files, each with `paths:` frontmatter and at most 12 body lines. Each names the check that enforces it and the command that runs the check, and gives no numbers or lists the check already owns.

- [ ] **Step 1: Write the four rules**

| File | `paths` | Body says |
| --- | --- | --- |
| `gateway.md` | `packages/core/src/gateway/**` | `gateway/service.ts` is a re-export facade; gateway modules never import it; `core-runtime/config-compiler.ts` has no filesystem persistence. The exact limits live in `packages/core/test/architecture/gateway-service-architecture.test.mjs`; read it before restructuring and run `npm run test:core`. New protocol features go in `gateway/features/`. |
| `mcp-subprocess.md` | `packages/core/src/mcp/**` | The lightweight MCP bundles are stdio subprocesses with a size cap and a list of forbidden imports (config, storage, Electron, UI, SQLite). Both live in `validateLightweightMcpBundles` and `forbiddenLightweightMcpInputs` in `build/esbuild.config.mjs`, which only `npm run build:assets` runs; run it after touching these files. |
| `tests.md` | `packages/*/test/**`, `tests/**` | `node:test` plus `node:assert/strict`; `*.test.mjs` for core, electron and cli, `*.test.ts(x)` for UI; name a test after the issue it pins (`#1822 ...`); UI component tests render with `renderToStaticMarkup`; the single-file command from `AGENTS.md`; tests that assert desktop behavior use `packages/core/test/support/desktop-runtime.mjs`. |
| `ui.md` | `packages/ui/**` | The renderer is a browser bundle built by `createRendererBuildOptions` in `build/esbuild.config.mjs`. It may import core modules that have no `node:`, `better-sqlite3` or Electron dependency (today `@ccr/core/contracts/*`, `providers/presets/*`, `providers/url`, `providers/new-api`, `media/models`, `config/default-config`); anything else fails `npm run build:assets`. The backend is reached only through `window.ccr` (`web-client-bridge.ts` in the browser, the Electron preload in the app). Shared controls live in `components/ui/` (React plus Tailwind 4; `baseui` only through `lib/baseui-provider.tsx`). The bridge load order is checked by `tests/architecture/ui-build-contract.test.mjs`. |

- [ ] **Step 2: Verify a rule loads on demand**

With the temporary `InstructionsLoaded` hook from Task 5 Step 4 still in `.claude/settings.local.json`, start a `claude` session and ask it to read `packages/core/src/gateway/service.ts` with the Read tool.
Expected: a log entry with `file_path` ending in `rules/gateway.md` and `load_reason` `path_glob_match`. Then ask it to read the same file through `codegraph_explore` in a fresh session and record whether the rule loads; if it does not, note in `AGENTS.md` "Where the standards are enforced" that the rules load on Read/Edit/Write only. Remove the temporary hook.

- [ ] **Step 3: Commit**

```bash
git add .claude/rules
git commit -m "docs: add path-scoped assistant rules that name their enforcing checks"
```

---

### Task 7: Hooks

**Files:**
- Create: `.claude/hooks/protect-generated.mjs`
- Create: `.claude/hooks/gate-commit.mjs`
- Create: `tests/architecture/claude-hooks.test.mjs`
- Create: `.claude/settings.json`

**Interfaces:**
- Produces: `protect-generated.mjs` reads the hook JSON from stdin. Path = `tool_input.file_path` or `tool_input.relative_path`. Normalize: prefix a relative path with `/`, convert backslashes. Block (stderr line, `process.exit(2)`) when the path matches any of `/packages/core/models.json`, `/packages/ui/src/generated/`, `/package-lock.json`, or has a path segment `dist` or `.test-dist` outside `node_modules`. The stderr line names the regeneration command for the first two (`npm run models:build`, `node scripts/generate-claude-code-config-options.mjs`). For `tool_name` `mcp__serena__replace_in_files`, also block when `relative_path` is empty (project-wide scope) or names a directory that contains a protected path, with the message "set relative_path to a specific file or a directory without generated files". Exits 0 when no path field is present for any other tool, and on unparsable stdin.
- Produces: `gate-commit.mjs` reads the hook JSON. It is a commit when `tool_name` is not `Bash`, or when `tool_input.command` matches `/(^|[\s;&|])(rtk\s+)?git(\s+-[A-Za-z]\S*(\s+\S+)?)*\s+commit\b/` (covers `git commit`, `git -C dir commit`, `git -c k=v commit`, `rtk git commit`). Otherwise exit 0. Root = `git rev-parse --show-toplevel` run in the input `cwd`, falling back to `cwd`, then `CLAUDE_PROJECT_DIR`. If `<root>/node_modules` is missing, write `run npm ci in <root> before committing` and exit 2. Run the checks, default `[["npm", ["run", "typecheck"]], ["npm", ["run", "test:architecture"]]]`, via `spawnSync` with `cwd: root`, `stdio: "pipe"`, `maxBuffer: 64 * 1024 * 1024`. On `status !== 0` (which includes `null`), write the last 20 lines of combined output and exit 2. Unparsable stdin exits 2. `CCR_GATE_COMMANDS` (JSON array of `[cmd, args]`) overrides the checks, for tests.
- Produces: `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|mcp__serena__replace_content|mcp__serena__replace_in_files|mcp__serena__replace_symbol_body|mcp__serena__insert_after_symbol|mcp__serena__insert_before_symbol",
        "hooks": [
          { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/protect-generated.mjs"], "onFailure": "block", "timeout": 10 }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "if": "Bash(git *)", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/gate-commit.mjs"], "onFailure": "block", "timeout": 120 }
        ]
      },
      {
        "matcher": "mcp__jean__create_commit",
        "hooks": [
          { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/gate-commit.mjs"], "onFailure": "block", "timeout": 120 }
        ]
      }
    ]
  }
}
```

`onFailure: "block"` needs Claude Code 2.1.295 or later (installed: 2.1.310). The `if` filter is best effort and only narrows which Bash calls spawn the script; the regex in the script is the real test. The Serena tool names are the user-scoped server's (`mcp__serena__*`), which is how Serena is installed on this machine.

- [ ] **Step 1: Write the failing hook tests**

`tests/architecture/claude-hooks.test.mjs` (picked up by `npm run test:architecture`, which runs with `cwd` at the repo root):

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const hooksDir = path.join(process.cwd(), ".claude", "hooks");
const run = (script, payload, env = {}) => spawnSync(process.execPath, [path.join(hooksDir, script)], {
  encoding: "utf8",
  env: { ...process.env, ...env },
  input: JSON.stringify(payload)
});
const tempRepo = () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "ccr-gate-")));
  mkdirSync(path.join(dir, "node_modules"));
  return dir;
};
const pass = JSON.stringify([[process.execPath, ["-e", "process.exit(0)"]]]);

test("protect blocks the model catalog and names the generator", () => {
  const r = run("protect-generated.mjs", { tool_name: "Edit", tool_input: { file_path: "/repo/packages/core/models.json" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /npm run models:build/);
});
test("protect blocks a Serena edit by relative path", () => {
  assert.equal(run("protect-generated.mjs", { tool_name: "mcp__serena__replace_content", tool_input: { relative_path: "packages/ui/src/generated/claude-code-config-options.json" } }).status, 2);
});
test("protect blocks a project-wide Serena replace_in_files", () => {
  assert.equal(run("protect-generated.mjs", { tool_name: "mcp__serena__replace_in_files", tool_input: { needle: "a", repl: "b", mode: "literal" } }).status, 2);
});
test("protect allows a scoped Serena replace_in_files", () => {
  assert.equal(run("protect-generated.mjs", { tool_name: "mcp__serena__replace_in_files", tool_input: { relative_path: "packages/core/src/routing", needle: "a", repl: "b", mode: "literal" } }).status, 0);
});
test("protect blocks relative dist paths but not node_modules dist", () => {
  assert.equal(run("protect-generated.mjs", { tool_name: "Write", tool_input: { file_path: "dist/main/x.js" } }).status, 2);
  assert.equal(run("protect-generated.mjs", { tool_name: "Write", tool_input: { file_path: "/repo/node_modules/x/dist/y.js" } }).status, 0);
});
test("protect allows ordinary source and ignores payloads with no path", () => {
  assert.equal(run("protect-generated.mjs", { tool_name: "Edit", tool_input: { file_path: "/repo/packages/core/src/x.ts" } }).status, 0);
  assert.equal(run("protect-generated.mjs", { tool_name: "Edit", tool_input: {} }).status, 0);
});
test("gate passes through non-commit git commands without running checks", () => {
  assert.equal(run("gate-commit.mjs", { cwd: "/nonexistent", tool_name: "Bash", tool_input: { command: "git status" } }).status, 0);
  assert.equal(run("gate-commit.mjs", { cwd: "/nonexistent", tool_name: "Bash", tool_input: { command: "git log --oneline" } }).status, 0);
});
test("gate recognizes every commit spelling", () => {
  for (const command of ["git commit -m x", "git -C sub commit", "git -c a=b commit -m x", "rtk git commit -m x", "npm test && git commit -m x"]) {
    const r = run("gate-commit.mjs", { cwd: tempRepo(), tool_name: "Bash", tool_input: { command } }, { CCR_GATE_COMMANDS: pass });
    assert.equal(r.status, 0, command);
  }
});
test("gate treats the Jean commit tool as a commit", () => {
  const fail = JSON.stringify([[process.execPath, ["-e", "console.log('tsc says no'); process.exit(1)"]]]);
  const r = run("gate-commit.mjs", { cwd: tempRepo(), tool_name: "mcp__jean__create_commit", tool_input: { message: "x" } }, { CCR_GATE_COMMANDS: fail });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /tsc says no/);
});
test("gate blocks when a check fails and reports its output", () => {
  const fail = JSON.stringify([[process.execPath, ["-e", "console.log('tsc says no'); process.exit(1)"]]]);
  const r = run("gate-commit.mjs", { cwd: tempRepo(), tool_name: "Bash", tool_input: { command: "git commit -m x" } }, { CCR_GATE_COMMANDS: fail });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /tsc says no/);
});
test("gate blocks a tree without node_modules", () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "ccr-gate-bare-")));
  const r = run("gate-commit.mjs", { cwd: dir, tool_name: "Bash", tool_input: { command: "git commit -m x" } }, { CCR_GATE_COMMANDS: pass });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /npm ci/);
});
test("gate runs in the hook input cwd, not CLAUDE_PROJECT_DIR", () => {
  const dir = tempRepo();
  const record = JSON.stringify([[process.execPath, ["-e", "require('fs').writeFileSync('ran-here', process.cwd())"]]]);
  const r = run("gate-commit.mjs", { cwd: dir, tool_name: "Bash", tool_input: { command: "git commit -m x" } }, { CCR_GATE_COMMANDS: record, CLAUDE_PROJECT_DIR: "/nonexistent" });
  assert.equal(r.status, 0);
  assert.equal(readFileSync(path.join(dir, "ran-here"), "utf8"), dir);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:architecture`
Expected: the 12 new tests FAIL with `Cannot find module` for the hook scripts.

- [ ] **Step 3: Write both scripts**

Plain `.mjs`, `node:` imports only, per Interfaces. Read stdin fully with `readFileSync(0, "utf8")`.

- [ ] **Step 4: Run the hook tests**

Run: `npm run test:architecture`
Expected: PASS, 18 tests.

- [ ] **Step 5: Write `.claude/settings.json` and exercise it live**

Write the JSON from Interfaces. Start a new `claude` session, run `/hooks`.
Expected: three PreToolUse entries listed.
Ask Claude to add a key to `packages/core/models.json`.
Expected: the edit is blocked and Claude reports the message naming `npm run models:build`.
Ask Claude to run `git commit --allow-empty -m "hook smoke"` then undo it with `git reset --soft HEAD~1`. Your default permission mode is `auto`; if its classifier refuses the empty commit, approve it once.
Expected: the commit waits roughly 11 s while typecheck and architecture tests run, then succeeds. The user-level `rtk hook claude` Bash hook runs in parallel and does not change this.

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks .claude/settings.json tests/architecture/claude-hooks.test.mjs
git commit -m "chore: add protect-generated and commit-gate hooks for coding assistants"
```

---

### Task 8: Project `verify` skill

**Files:**
- Create: `.claude/skills/verify/SKILL.md`
- Create: `.claude/skills/verify/scripts/verify.mjs`
- Create: `tests/architecture/verify-skill.test.mjs`

**Interfaces:**
- Produces: `verify.mjs` (node, `node:` imports only). Root = `git rev-parse --show-toplevel` from `process.cwd()`, else `process.cwd()`. With no arguments it runs `npm run test:core`, `npm run test:ui`, `npm run test:electron`, `npm run test:cli` in that order (about 18 s total) with `cwd: root`, prints one `PASS <suite>` or `FAIL <suite>` line per suite, and exits 1 at the first failure. It does not run typecheck or the architecture tests, because the commit gate already does. With `--e2e`: (a) records `clean = git diff --quiet -- packages/core/models.json packages/ui/src/generated` succeeded in `root`; (b) requires the sidecar `node_modules/better-sqlite3/build/Release/better_sqlite3.electron-<abi>.node` under `root`, where `<abi>` comes from `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron -p process.versions.modules`, printing `run npm run sqlite:electron` and exiting 1 if missing; (c) runs `npm run test:e2e`; (d) in `finally`, if `clean`, runs `git checkout -- packages/core/models.json packages/ui/src/generated` in `root` and prints `RESTORED generated files`, else prints `SKIPPED restore: generated files had prior changes`. Overrides for tests only: `CCR_VERIFY_COMMANDS` (JSON array of `[cmd, args]` replacing the four suites), `CCR_VERIFY_E2E_COMMAND` (JSON `[cmd, args]` replacing the e2e run), `CCR_VERIFY_SIDECAR` (a file path that replaces the sidecar check).
- Produces: `SKILL.md`:

```yaml
---
name: verify
description: Run this repo's test suites (core, ui, electron, cli) and report PASS or FAIL per suite. Use before every commit and whenever asked to verify, check, test, or prove that a change works. Pass --e2e to include the Playwright suite. Runs tests only; it does not launch the app, use /run for that.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/verify.mjs *)
---
```

Body: run `node ${CLAUDE_SKILL_DIR}/scripts/verify.mjs $ARGUMENTS` (add `--e2e` when the change touches the renderer, Electron main, the CLI entry, or the build), paste the PASS, FAIL, RESTORED or SKIPPED lines, stop at the first FAIL and fix it instead of retrying. State that typecheck and architecture tests run in the commit gate. State that this project skill replaces the bundled `/verify` at the repo root, so `/verify` here runs tests rather than driving the app. State that Claude Code's built-in commit instructions invoke it before commits except for docs-only or tests-only changes.

- [ ] **Step 1: Write the failing skill-script tests**

`tests/architecture/verify-skill.test.mjs`. Each test creates a throwaway repo: `mkdtempSync`, `git init -q`, write `packages/core/models.json` and `packages/ui/src/generated/claude-code-config-options.json`, `git add -A`, `git -c user.email=t@t -c user.name=t commit -qm init`, create an empty `node_modules/` and a fake sidecar file, and runs `verify.mjs` with `cwd` set to that repo and `CCR_VERIFY_SIDECAR` pointing at the fake sidecar. Three tests:

1. With `CCR_VERIFY_COMMANDS` set to one passing and one failing command plus a third: exits 1, stdout has exactly one `PASS` and one `FAIL`, and the third command did not run (it would have written a marker file).
2. `--e2e` with a passing `CCR_VERIFY_E2E_COMMAND` that rewrites `packages/core/models.json`: exits 0, prints `RESTORED generated files`, and `git status --short` in the temp repo is empty afterwards.
3. `--e2e` after the test itself has modified `packages/core/models.json` before the run, with a failing `CCR_VERIFY_E2E_COMMAND`: exits 1, prints `SKIPPED restore`, and the pre-run modification is still present.

Run: `npm run test:architecture`
Expected: FAIL, script missing.

- [ ] **Step 2: Write the script, then run the tests**

Run: `npm run test:architecture`
Expected: PASS, 21 tests.

- [ ] **Step 3: Run it for real**

Run: `node .claude/skills/verify/scripts/verify.mjs`
Expected: four `PASS` lines; exit 0.
Run: `node .claude/skills/verify/scripts/verify.mjs --e2e; git status --short`
Expected: ends with Playwright `21 passed`, then `RESTORED generated files`; `git status` shows no change to `packages/core/models.json`.

- [ ] **Step 4: Write SKILL.md and confirm it runs by hand and before a commit**

Skills load at session start, so start a new `claude` session and type `/verify`.
Expected: the project skill runs the script and reports the four PASS lines.
In the same session, change one line under `packages/core/src/` and ask Claude to commit it.
Expected: Claude invokes the `verify` skill before the commit (watch for the Skill call), then the commit gate runs. Revert the change afterwards.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/verify tests/architecture/verify-skill.test.mjs
git commit -m "chore: add project verify skill that runs the test suites"
```

---

### Task 9: Whole-tree proof and prompt audit

**Files:**
- Modify: none expected. Fix anything the audit flags in the files from Tasks 5 to 8.

- [ ] **Step 1: Full suite from scratch**

Run: `rm -rf node_modules .test-dist && npm ci && npm run sqlite:electron && npm run test && npm run test:e2e; git checkout -- packages/core/models.json packages/ui/src/generated`
Expected: `npm run test` ends with every package `ℹ fail 0` and architecture 21 pass (5 existing, 1 packaging, 12 hooks, 3 verify); e2e `21 passed`; `git status --short` clean.

- [ ] **Step 2: Audit the instruction files, scoped to this repo**

In a `claude` session run `/doctor prompt-audit AGENTS.md`, then `/doctor prompt-audit .claude`. The audit covers rules and skills; it does not read `.claude/settings.json` or `.claude/hooks/`, which Task 7's tests cover.
Expected: no findings that name a missing file, a command that does not exist, or two instructions that contradict each other. Apply any proposed edit of that kind; decline wording changes.

- [ ] **Step 3: Check the instruction file size budget**

Run: `wc -l AGENTS.md .claude/rules/*.md .claude/skills/verify/SKILL.md`
Expected: every file under 120 lines.

- [ ] **Step 4: Commit any audit fixes**

```bash
git add AGENTS.md .claude
git commit -m "docs: apply prompt-audit fixes to assistant instructions"
```

Skip the commit if nothing changed.
