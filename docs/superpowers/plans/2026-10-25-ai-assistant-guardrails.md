# AI Assistant Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every test suite in this repo pass from one local install, then commit the instruction file, rules, hooks and verify skill that keep coding assistants inside the project's standards.

**Architecture:** Fix the test suites first (heap sizing, desktop-runtime detection in tests, a sidecar Electron build of `better-sqlite3`) so a commit gate can require green. Then add a short `AGENTS.md` that `CLAUDE.md` imports, four path-scoped rules that describe each standard and name the check that enforces it, two deterministic node hooks, and a project `verify` skill. Hooks and the skill bind Claude Code sessions only; the tests and build checks are what bind everyone.

**Tech Stack:** Node 24 (`engines`, CI and `.node-version` pin 24; 24.22.1 locally), npm workspaces with `allowScripts`, esbuild, `node:test`, Playwright 1.61, Electron 42.4.1, better-sqlite3 12.11.1, Claude Code 2.1.310 hooks and skills.

**Spec:** `docs/superpowers/specs/2026-10-25-ai-assistant-guardrails.md`

**Revision 2 (2026-10-25):** rewritten after two independent reviews. The changes: both e2e SQLite calls get the sidecar; hooks are node scripts that exit 2 explicitly, run in the hook input's `cwd`, and have a blocking test; the sidecar is excluded from packaged apps; the ui rule states the real browser-bundle boundary; `verify.sh` runs all four suites and restores generated files; the auto-memory plugin config and markers are dropped; the bundled `/verify` shadowing is named.

## Global Constraints

- Package manager is npm. Every install step is `npm ci` against `package-lock.json`. `allowScripts` in the root `package.json` lists the native dependencies whose install scripts may run; approve a new one with `npm install-scripts approve <pkg>`. Never run pnpm in this repo.
- Code style: double quotes, semicolons, two-space indent, alphabetized object keys and type members, `node:` imports first then `@ccr/<pkg>/...` aliases, `type` aliases unless the surrounding file already uses `interface`, no comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`. Core, Electron and CLI tests are `*.test.mjs`; UI component tests are `*.test.ts` or `*.test.tsx`. They live under `packages/<pkg>/test/{unit,integration,component}` or `tests/architecture/`. Run one package with `npm run test:<pkg>`; run one compiled file with `node --test .test-dist/<pkg>/test/<path>.test.js` after `node build/test.mjs <pkg>`.
- Instruction files stay under 120 lines each. A rule restates nothing a check enforces; it names the check by path and says how to run it.
- Hook scripts are `.mjs` files in `.claude/hooks/`, read JSON on stdin, print nothing on success, and block by writing one line to stderr and calling `process.exit(2)`. No other exit code blocks.
- `npm run build:assets` (and therefore `npm run test:e2e`) regenerates the tracked files `packages/core/models.json` and `packages/ui/src/generated/claude-code-config-options.json`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated` before committing unless the change to them is intended.
- Nothing AI-written goes under `docs/` except `docs/superpowers/`.
- Commit after each task with the message given. End every commit message with the attribution line the session is instructed to use.

## Review Focus

1. **Sidecar leaks into a packaged app.** `electron-builder.json` unpacks `**/*.node` and `npmRebuild` rebuilds the main binary, so a host-arch sidecar left from `npm run sqlite:electron` would ship and the resolver would prefer it. Task 4 adds the `files` exclusion and a test that asserts it is present.
2. **Commit gate fails open.** Only exit code 2 blocks a `PreToolUse` hook; a crash (exit 1, 127) is a non-blocking error and the commit proceeds. Task 7's gate wraps every check and exits 2 on failure, and a test runs it against a temp project whose `typecheck` script exits 1.
3. **Gate tests the wrong tree in a worktree.** `CLAUDE_PROJECT_DIR` stays at the original checkout; the hook input's `cwd` follows Claude. Task 7 reads `cwd` and a test passes a temp `cwd` and asserts the gate ran there.
4. **Heap test on a future node.** A heap limit above 1 GiB would push the dynamic request count past the 30 s timeout. Task 2 caps the count and asserts the cap still exceeds the measured limit.
5. **`build:assets` churn gets committed.** A 24 MB `models.json` timestamp diff after any e2e run. Task 8's `verify.sh` restores both generated files after `--e2e`, and a test asserts the restore ran. AGENTS.md says not to commit that diff.

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
Expected: typecheck clean; architecture 5 pass; core 1116 pass 4 fail; ui 212 pass; electron 44 pass; cli 6 pass; e2e: `cli-web`, `opencode-go-import`, `provider-edit` and `recent-issues` pass, `electron-cdp.spec.ts` fails in `beforeAll` at `createLegacyApiKeyDatabase` with `NODE_MODULE_VERSION 137 ... requires 146` and its 4 tests do not run. If core shows different failures than the spec lists, stop and report before continuing.

No commit for this task.

---

### Task 2: Size the bounded-heap test from the live heap limit

**Files:**
- Modify: `packages/core/test/integration/observability/request-log-store.test.mjs:1868-1894`

**Interfaces:**
- Consumes: `recordLargeAgentRequests(store, dbFile, { paddingBytes, requestCount, sessionId })` at line 179 of the same file, which returns total body bytes. `getHeapStatistics` is already imported there.

- [ ] **Step 1: Reproduce the failure under node 24**

Run: `node build/test.mjs core && CCR_REQUEST_LOG_BOUNDED_HEAP_WORKER=1 node --max-old-space-size=64 --test .test-dist/core/test/integration/observability/request-log-store.test.js`
Expected: FAIL on `streams more body text than the bounded worker heap` with `ok(totalBodyBytes > ... heap_size_limit)`.

- [ ] **Step 2: Replace the fixed request count**

In the test body, replace `const requestCount = 384;` with:

```js
const paddingBytes = 256 * 1024;
const heapLimit = getHeapStatistics().heap_size_limit;
const requestCount = Math.min(2048, Math.ceil(heapLimit / (2 * paddingBytes)) + 16);
assert.ok(requestCount * 2 * paddingBytes > heapLimit, `cap of 2048 requests cannot exceed heap limit ${heapLimit}`);
```

Pass `paddingBytes` and `requestCount` through to `recordLargeAgentRequests`. Keep the existing `assert.ok(totalBodyBytes > getHeapStatistics().heap_size_limit)` and the four analysis assertions. On node 24 the formula yields 528 requests and the test takes about 1.5 s.

- [ ] **Step 3: Verify under node 24**

Run the Step 1 command again.
Expected: PASS; the file reports 37 tests and 0 fail.

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

Run: `node build/test.mjs core --scope unit && node --test .test-dist/core/test/unit/runtime/desktop-runtime-helper.test.js`
Expected: FAIL, esbuild reports the unresolved import `../../support/desktop-runtime.mjs`.

- [ ] **Step 3: Implement the helper**

Create `packages/core/test/support/desktop-runtime.mjs` with the `withDesktopRuntime(run)` described in Interfaces.

- [ ] **Step 4: Run the helper test**

Run the Step 2 command.
Expected: PASS, 2 tests.

- [ ] **Step 5: Use the helper in the two failing test files**

In `plugin-permissions.test.mjs` delete the local `withDesktopRuntime` and import the helper from `../../support/desktop-runtime.mjs`; keep the local `restoreEnv` only if another test in the file still calls it. In `plugin-config-migration.test.mjs` wrap the body of the two tests that set `process.env[CCR_DESKTOP_APP_ENV] = "1"` in `await withDesktopRuntime(async () => { ... })`, remove the manual save and restore for that key, and make those tests `async`.

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
- Produces: `npm run sqlite:electron`, which writes `node_modules/better-sqlite3/build/Release/better_sqlite3.electron-<abi>.node` where `<abi>` is `require("node-abi").getAbi(<electron version>, "electron")` (146 for 42.4.1), without touching the node binary.
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

Run: `node build/test.mjs core --scope unit && node --test .test-dist/core/test/unit/storage/sqlite-native-binding.test.js`
Expected: FAIL, `betterSqliteNativeBindingCandidates` is not exported.

- [ ] **Step 3: Implement the resolver**

In `sqlite-native.ts` add the exported pure function from Interfaces, and change `resolveBetterSqliteNativeBinding()` to iterate `betterSqliteNativeBindingCandidates(process.versions)` and return the first that `requireFromHere.resolve` succeeds on. Keep the `nativeBindingResolved` cache.

- [ ] **Step 4: Run the resolver test and the core suite**

Run: the Step 2 command, then `npm run test:core`.
Expected: PASS, then `ℹ fail 0`.

- [ ] **Step 5: Write the packaging-contract test, then the exclusion**

`tests/architecture/packaging-contract.test.mjs`:

```js
test("packaged apps never carry the Electron sidecar binary", () => {
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "electron-builder.json"), "utf8"));
  assert.ok(config.files.includes("!node_modules/better-sqlite3/build/Release/better_sqlite3.electron-*.node"));
});
```

Run: `npm run test:architecture`
Expected: FAIL on this test. Then add the entry to `files` in `electron-builder.json` after the existing `!node_modules/better-sqlite3/deps/**` line and run again.
Expected: PASS, 6 tests.

- [ ] **Step 6: Write the sidecar script**

Create `scripts/prepare-electron-sqlite.mjs` (ESM, imports only `node:` modules, `node-abi`, and reads `node_modules/electron/package.json`):

1. `electronVersion` from `node_modules/electron/package.json`; `abi = getAbi(electronVersion, "electron")`.
2. `sidecar = node_modules/better-sqlite3/build/Release/better_sqlite3.electron-<abi>.node`. If it exists, print it and exit 0.
3. Create a temp dir in `os.tmpdir()`, copy `node_modules/better-sqlite3/package.json` into it (prebuild-install reads `package.json` from its cwd).
4. Run `node_modules/.bin/prebuild-install --runtime electron --target <electronVersion>` with `cwd` set to the temp dir.
5. Copy `<tempdir>/build/Release/better_sqlite3.node` to `sidecar`, remove the temp dir in `finally`, print the sidecar path.

Add to root `package.json` scripts: `"sqlite:electron": "node scripts/prepare-electron-sqlite.mjs"`. Leave `rebuild:sqlite3` as is; it is for Windows packaging.

- [ ] **Step 7: Run the script and prove both runtimes load**

Run: `npm run sqlite:electron`
Expected: prints `.../better_sqlite3.electron-146.node`; `ls node_modules/better-sqlite3/build/Release/` shows both files and `better_sqlite3.node` is unchanged (`git`-independent check: its mtime did not move).
Run: `node -e "require('better-sqlite3')(':memory:').close(); console.log('node ok')"`
Expected: `node ok`.
Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e "const D=require('better-sqlite3'); new D(':memory:',{nativeBinding:require.resolve('better-sqlite3/build/Release/better_sqlite3.electron-'+process.versions.modules+'.node')}).close(); console.log('electron ok')"`
Expected: `electron ok`.

- [ ] **Step 8: Make both e2e Electron helpers use the sidecar**

In `tests/e2e/electron-cdp.spec.ts`, both inline scripts (`createLegacyApiKeyDatabase` at line 370 and `readSqliteRows` at line 410) construct `Database` with `nativeBinding: require.resolve("better-sqlite3/build/Release/better_sqlite3.electron-" + process.versions.modules + ".node")`. The scripts run inside Electron, so they compute the path themselves; no env var and no extra spawn. The Electron main process needs no change: it loads through `sqlite-native.ts`.

- [ ] **Step 9: Run the full e2e suite**

Run: `npm run test:e2e; git checkout -- packages/core/models.json packages/ui/src/generated`
Expected: `21 passed` (5 + 12 + 4), 0 failed, 0 did not run, and `git status --short` is clean apart from this task's files.

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
- Produces: `AGENTS.md`, hand-written, no plugin markers, sections in this order: Commands, Where the standards are enforced, Style that differs from defaults, Generated files, Repository etiquette, What binds whom, Local environment notes. Each section is a bullet list.

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

Content, under 120 lines, from the spec. Commands: `npm ci`, `npm run typecheck`, `npm run test:architecture`, `npm run test:<core|ui|electron|cli>`, `npm run test:e2e` (needs `npm run test:e2e:install` and `npm run sqlite:electron` once), `npm run build:assets`, `npm run dev:electron`. Standards: name `tests/architecture/package-boundaries.test.mjs`, `tests/architecture/ui-build-contract.test.mjs`, `tests/architecture/packaging-contract.test.mjs`, `packages/core/test/architecture/gateway-service-architecture.test.mjs`, and the lightweight MCP bundle limit in `build/esbuild.config.mjs`, which only `npm run build:assets` exercises. Style: the Global Constraints style line. Generated files, each with its regeneration command: `packages/core/models.json` (`npm run models:build`), `packages/ui/src/generated/claude-code-config-options.json` (`node scripts/generate-claude-code-config-options.mjs`), `package-lock.json` (npm), plus `dist/` and `.test-dist/` (build output); and the sentence "`npm run build:assets` and `npm run test:e2e` rewrite the first two with a new timestamp; restore them with `git checkout -- packages/core/models.json packages/ui/src/generated` unless the change is intended." Etiquette: npm only and the `allowScripts` rule; no AI review notes or plan docs under `docs/` outside `docs/superpowers/`; architecture rules change only with their test. What binds whom: the hooks in `.claude/settings.json` and the `verify` skill apply to Claude Code sessions only; Codex, OpenCode, Serena's write tools and a human terminal are bound only by the tests, the build, and this file. Environment: node 24 (`.node-version`); `../ccr-extensions` and `../../next-ai/gateway` are optional sibling checkouts and absent here.

- [ ] **Step 3: Write CLAUDE.md**

`CLAUDE.md` contains exactly one line: `@AGENTS.md`. With a `CLAUDE.md` present Claude Code does not read `AGENTS.md` on its own, so the import is required.

- [ ] **Step 4: Verify the file loads**

Run: `wc -l AGENTS.md`
Expected: under 120.
Start a fresh `claude` session in the repo and run `/context`.
Expected: `CLAUDE.md` appears under Memory files, and asking "what command regenerates models.json" is answered from AGENTS.md without reading other files.

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
- Produces: four rule files, each with `paths:` frontmatter and at most 15 body lines. Each names the check that enforces it and the command that runs the check.

- [ ] **Step 1: Write the four rules**

| File | `paths` | Body says |
| --- | --- | --- |
| `gateway.md` | `packages/core/src/gateway/**` | `gateway/service.ts` is re-exports only (max 20 implementation lines); no gateway module imports the facade; `core-runtime/config-compiler.ts` never touches `node:fs`. Enforced by `packages/core/test/architecture/gateway-service-architecture.test.mjs` (`npm run test:core`). New protocol features go in `gateway/features/`. |
| `mcp-subprocess.md` | `packages/core/src/mcp/**` | The lightweight MCP bundles (`browser-web-search-proxy-mcp`, `fusion-vision-mcp`, `fusion-tool-fallback-mcp`, `media-tools-proxy-mcp`) stay under 128 KiB and may not pull in `packages/core/src/config/`, `packages/core/src/storage/`, `packages/electron/src/`, `packages/ui/src/`, `better-sqlite3` or `electron`. Enforced by `validateLightweightMcpBundles` in `build/esbuild.config.mjs`, which only `npm run build:assets` runs; run it after touching these files. |
| `tests.md` | `packages/*/test/**`, `tests/**` | `node:test` plus `node:assert/strict`; `*.test.mjs` for core, electron and cli, `*.test.ts(x)` for UI; name a test after the issue it pins (`#1822 ...`); UI component tests render with `renderToStaticMarkup`; run one file with `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<path>.test.js`; tests that assert desktop behavior use `packages/core/test/support/desktop-runtime.mjs`. |
| `ui.md` | `packages/ui/**` | The renderer is a browser bundle built by `createRendererBuildOptions` in `build/esbuild.config.mjs`. It may import core modules that have no `node:`, `better-sqlite3` or Electron dependency (today: `@ccr/core/contracts/*`, `providers/presets/*`, `providers/url`, `providers/new-api`, `media/models`, `config/default-config`); importing anything else fails `npm run build:assets`. The backend is reached only through `window.ccr` (`web-client-bridge.ts` in the browser, the Electron preload in the app). Shared controls live in `components/ui/` (plain React plus Tailwind 4; `baseui` is used only through `lib/baseui-provider.tsx`). The bridge load order is enforced by `tests/architecture/ui-build-contract.test.mjs`. |

- [ ] **Step 2: Verify a rule loads on demand**

Add a temporary `InstructionsLoaded` hook to `.claude/settings.local.json` that appends the hook input to a file, start a `claude` session, read `packages/core/src/gateway/service.ts`, and check the file.
Expected: an entry whose path ends in `rules/gateway.md` with `load_reason` `path_glob_match`. Remove the temporary hook afterwards.

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
- Produces: `protect-generated.mjs` reads the hook JSON from stdin, takes `tool_input.file_path`, or `tool_input.relative_path` for Serena tools, and blocks (stderr line, `process.exit(2)`) when the path matches any of `packages/core/models.json`, `packages/ui/src/generated/`, `package-lock.json`, `/dist/`, `/.test-dist/`. The stderr line names the regeneration command for the first two (`npm run models:build`, `node scripts/generate-claude-code-config-options.mjs`). Exits 0 otherwise, including when neither field is present.
- Produces: `gate-commit.mjs` reads the hook JSON, exits 0 at once unless `tool_input.command` contains `git commit`; otherwise runs `npm run typecheck` then `npm run test:architecture` with `cwd` set to the input's `cwd` (fallback `CLAUDE_PROJECT_DIR`), via `spawnSync` with `stdio: "pipe"`. On the first non-zero status it writes the last 20 lines of that command's output to stderr and calls `process.exit(2)`. Every failure path, including a thrown error, ends in `process.exit(2)`. Environment variable `CCR_GATE_COMMANDS` (JSON array of `[cmd, args]` pairs) overrides the two commands, for tests.
- Produces: `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|mcp__serena__replace_content|mcp__serena__replace_in_files|mcp__serena__replace_symbol_body|mcp__serena__insert_after_symbol|mcp__serena__insert_before_symbol",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/protect-generated.mjs\"", "timeout": 10 }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "if": "Bash(git commit *)", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/gate-commit.mjs\"", "timeout": 120 }
        ]
      }
    ]
  }
}
```

- [ ] **Step 1: Write the failing hook tests**

`tests/architecture/claude-hooks.test.mjs` (picked up by `npm run test:architecture`):

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const hooksDir = path.join(process.cwd(), ".claude", "hooks");
const run = (script, payload, env = {}) => spawnSync(process.execPath, [path.join(hooksDir, script)], {
  encoding: "utf8",
  env: { ...process.env, ...env },
  input: JSON.stringify(payload)
});

test("protect blocks the model catalog and names the generator", () => {
  const r = run("protect-generated.mjs", { tool_input: { file_path: "/repo/packages/core/models.json" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /npm run models:build/);
});
test("protect blocks a Serena edit by relative path", () => {
  assert.equal(run("protect-generated.mjs", { tool_input: { relative_path: "packages/ui/src/generated/claude-code-config-options.json" } }).status, 2);
});
test("protect allows ordinary source", () => {
  assert.equal(run("protect-generated.mjs", { tool_input: { file_path: "/repo/packages/core/src/x.ts" } }).status, 0);
});
test("protect ignores a payload with no path", () => {
  assert.equal(run("protect-generated.mjs", { tool_input: { command: "node scripts/generate-models-json.mjs" } }).status, 0);
});
test("gate passes through a non-commit git command without running checks", () => {
  const r = run("gate-commit.mjs", { cwd: "/nonexistent", tool_input: { command: "git status" } });
  assert.equal(r.status, 0);
});
test("gate blocks when a check fails and reports its output", () => {
  const r = run("gate-commit.mjs", { cwd: os.tmpdir(), tool_input: { command: "git commit -m x" } }, {
    CCR_GATE_COMMANDS: JSON.stringify([[process.execPath, ["-e", "console.log('tsc says no'); process.exit(1)"]]])
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /tsc says no/);
});
test("gate runs in the hook input cwd, not CLAUDE_PROJECT_DIR", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccr-gate-cwd-"));
  const r = run("gate-commit.mjs", { cwd: dir, tool_input: { command: "git commit -m x" } }, {
    CCR_GATE_COMMANDS: JSON.stringify([[process.execPath, ["-e", "require('fs').writeFileSync('ran-here', process.cwd())"]]]),
    CLAUDE_PROJECT_DIR: "/nonexistent"
  });
  assert.equal(r.status, 0);
  assert.equal(readFileSync(path.join(dir, "ran-here"), "utf8"), dir);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:architecture`
Expected: the 7 new tests FAIL with `Cannot find module` for the hook scripts.

- [ ] **Step 3: Write both scripts**

Plain `.mjs`, `node:` imports only. Read stdin fully, `JSON.parse` inside `try`, and treat parse failure as "no path" for protect (exit 0) and as a block for the gate (exit 2, since a gate that cannot read its input must not pass).

- [ ] **Step 4: Run the hook tests**

Run: `npm run test:architecture`
Expected: PASS, 13 tests.

- [ ] **Step 5: Write `.claude/settings.json` and exercise it live**

Write the JSON from Interfaces. Start a new `claude` session, run `/hooks`.
Expected: both hooks listed under PreToolUse.
Ask Claude to add a key to `packages/core/models.json`.
Expected: the edit is blocked and Claude reports the message naming `npm run models:build`.
Ask Claude to run `git commit --allow-empty -m "hook smoke"` then undo it with `git reset --soft HEAD~1`.
Expected: the commit waits roughly 11 s while typecheck and architecture tests run, then succeeds.

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks .claude/settings.json tests/architecture/claude-hooks.test.mjs
git commit -m "chore: add protect-generated and commit-gate hooks for coding assistants"
```

---

### Task 8: Project `verify` skill

**Files:**
- Create: `.claude/skills/verify/SKILL.md`
- Create: `.claude/skills/verify/scripts/verify.sh`
- Create: `tests/architecture/verify-skill.test.mjs`

**Interfaces:**
- Produces: `verify.sh` with no arguments runs `npm run test:core`, `npm run test:ui`, `npm run test:electron`, `npm run test:cli` in that order (about 18 s total), prints one `PASS <suite>` or `FAIL <suite>` line per suite, and exits non-zero on the first failure. It does not run typecheck or the architecture tests, because the commit gate already does. With `--e2e` it first checks that `node_modules/better-sqlite3/build/Release/better_sqlite3.electron-<abi>.node` exists, where `<abi>` is `node -p "require('node-abi').getAbi(require('./node_modules/electron/package.json').version,'electron')"`, printing `run npm run sqlite:electron` and exiting 1 if not; then runs `npm run test:e2e`; then always runs `git checkout -- packages/core/models.json packages/ui/src/generated` and prints `RESTORED generated files`. Environment variable `CCR_VERIFY_COMMANDS` (JSON array of `[cmd, args]`) overrides the suite commands, for tests.
- Produces: `SKILL.md`:

```yaml
---
name: verify
description: Run this repo's four test suites (core, ui, electron, cli) and report PASS/FAIL per suite. Use before every commit and whenever asked to verify, check, or prove a change works. Pass --e2e to include the Playwright suite.
allowed-tools: Bash(bash ${CLAUDE_SKILL_DIR}/scripts/verify.sh *)
---
```

Body: run `bash ${CLAUDE_SKILL_DIR}/scripts/verify.sh` (add `--e2e` when the change touches the renderer, Electron main, the CLI entry, or the build), paste the PASS/FAIL lines, stop at the first FAIL and fix it instead of retrying. State that typecheck and architecture tests run in the commit gate. State that this project skill replaces the bundled `/verify` at the repo root, so `/verify` here runs tests rather than driving the app; use `/run` to drive the app.

- [ ] **Step 1: Write the failing skill-script test**

`tests/architecture/verify-skill.test.mjs`: with `CCR_VERIFY_COMMANDS` set to one passing and one failing command, assert the script exits non-zero, prints `PASS` once and `FAIL` once, and does not run the command after the failure. A second test runs with four passing commands and `--e2e` where `CCR_VERIFY_COMMANDS` also supplies the e2e command, and asserts `RESTORED generated files` is printed even when the e2e command fails.

Run: `npm run test:architecture`
Expected: FAIL, script missing.

- [ ] **Step 2: Write the script, then run the tests**

Run: `npm run test:architecture`
Expected: PASS.

- [ ] **Step 3: Run it for real**

Run: `bash .claude/skills/verify/scripts/verify.sh`
Expected: four `PASS` lines; exit 0.
Run: `bash .claude/skills/verify/scripts/verify.sh --e2e; git status --short`
Expected: ends with Playwright `21 passed`, then `RESTORED generated files`; `git status` shows no change to `packages/core/models.json`.

- [ ] **Step 4: Write SKILL.md and confirm it is listed**

Skills load at session start, so start a new `claude` session, type `/verify`.
Expected: the project skill runs the script and reports the four PASS lines.

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
Expected: `npm run test` ends with every package `ℹ fail 0` and architecture 15 pass (5 existing, 1 packaging, 7 hooks, 2 verify); e2e `21 passed`; `git status --short` clean.

- [ ] **Step 2: Audit the instruction files, scoped to this repo**

In a `claude` session run `/doctor prompt-audit AGENTS.md`, then `/doctor prompt-audit .claude`.
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
