# AI Assistant Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every test suite in this repo pass from one local install, then commit the instruction file, rules, hooks and verify skill that keep coding assistants inside the project's standards.

**Architecture:** Fix the test suites first (heap sizing, desktop-runtime detection in tests, a sidecar Electron build of `better-sqlite3`) so a commit gate can require green. Then add a short `AGENTS.md` that `CLAUDE.md` imports, four path-scoped rules that point at the tests which already enforce each standard, two deterministic hooks, and a project `verify` skill that Claude Code runs before every commit.

**Tech Stack:** Node 24 (`engines` and CI pin 24; 24.22.1 locally), npm workspaces, esbuild, `node:test`, Playwright 1.62, Electron 42, better-sqlite3 12, Claude Code hooks (`jq`, bash).

**Spec:** `docs/superpowers/specs/2026-10-25-ai-assistant-guardrails.md`

## Global Constraints

- Package manager is npm. Every install step is `npm ci` against `package-lock.json`. Never run pnpm in this repo.
- Code style: double quotes, semicolons, two-space indent, alphabetized object keys and type members, `node:` imports first then `@ccr/<pkg>/...` aliases, `type` over `interface`, no comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named `*.test.mjs` under `packages/<pkg>/test/{unit,integration}`. Run one package with `npm run test:<pkg>`; run one compiled file with `node --test .test-dist/<pkg>/test/<path>.test.js` after `node build/test.mjs <pkg>`.
- Instruction files stay under 120 lines each. Rules restate nothing a test enforces; they name the test file.
- Hook scripts live in `.claude/hooks/`, are executable, read JSON on stdin, and exit 2 with a one-line stderr message to block.
- Nothing AI-written goes under `docs/` except `docs/superpowers/`.
- Commit after each task with the message given. End every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **Electron ABI drift.** After `npm ci` or an Electron upgrade the sidecar binary is stale and Electron falls back to the node binary with `ERR_DLOPEN_FAILED`. Task 4 pins this with a resolver test and a script re-run step; the `verify` skill in Task 8 checks the sidecar's recorded ABI.
2. **Hook blocks a legitimate regeneration.** `scripts/generate-models-json.mjs` writes `packages/core/models.json` through Bash, not Edit, so the protect hook must match only Edit and Write. Task 7 tests that a Bash write path is not matched.
3. **Commit gate false positive on docs-only commits.** The commit hook runs typecheck and architecture tests even when only Markdown changed. Task 7 keeps this behavior (11 s total) and tests that a non-commit git command returns 0 without running anything.
4. **Heap test on a future node.** If a future node reports a heap limit above 1 GiB the dynamic request count grows past the 30 s timeout. Task 2 caps the count and asserts the cap is above the measured limit.
5. **Desktop helper leaks state.** A test that throws before restore leaves `process.versions.electron` set for later tests in the same file. Task 3's helper restores in `finally` and a test asserts the value is gone afterwards.

---

### Task 1: Toolchain baseline

Steps 1 and 2 were completed on 2026-10-25 and committed as the node 24 / npm install-scripts commit. Step 3 remains.

**Files:**
- Modify: none committed. Writes `node_modules/`, `~/Library/Caches/ms-playwright/`.

**Interfaces:**
- Produces: a node_modules laid out by npm (no `node_modules/.pnpm`), `node_modules/.bin/electron-rebuild` present, the Playwright Chromium build that the installed `@playwright/test` pins (`chromium_headless_shell-1228` for the lockfile's version).

- [x] **Step 1: Reinstall from the lockfile**

Run: `rm -rf node_modules packages/*/node_modules && npm ci`
Expected: exits 0 and ends without an `install-scripts` warning, because `allowScripts` in `package.json` covers every native dependency. `ls node_modules/.pnpm` reports "No such file". `node -e "console.log(require('./node_modules/electron/package.json').version)"` prints `42.4.1`.

- [x] **Step 2: Install the Playwright browser the config needs**

Run: `npm run test:e2e:install`
Expected: `npx playwright install chromium --dry-run` lists install locations that already exist.

- [ ] **Step 3: Record the baseline**

Run each and note pass/fail counts: `npm run typecheck`, `npm run test:architecture`, `npm run test:core`, `npm run test:ui`, `npm run test:electron`, `npm run test:e2e`.
Expected: typecheck clean; architecture 5 pass; core 1116 pass 4 fail; ui 212 pass; electron 44 pass; e2e: the 12 `browserType.launch` failures are gone, `electron-cdp.spec.ts` still fails with `NODE_MODULE_VERSION` and 3 tests did not run. If core shows different failures than the spec lists, stop and report before continuing.

No commit for this task.

---

### Task 2: Size the bounded-heap test from the live heap limit

**Files:**
- Modify: `packages/core/test/integration/observability/request-log-store.test.mjs:1868-1894`

**Interfaces:**
- Consumes: `recordLargeAgentRequests(store, dbFile, { paddingBytes, requestCount, sessionId })` at line 179 of the same file, which returns total body bytes.

- [ ] **Step 1: Reproduce the failure under node 24**

Run: `node build/test.mjs core && node --max-old-space-size=64 --test .test-dist/core/test/integration/observability/request-log-store.test.js` with `CCR_REQUEST_LOG_BOUNDED_HEAP_WORKER=1` in the environment.
Expected: FAIL on `streams more body text than the bounded worker heap` with `ok(totalBodyBytes > ... heap_size_limit)`.

- [ ] **Step 2: Replace the fixed request count**

In the test body, replace `const requestCount = 384;` with a count derived from the heap:

```js
const paddingBytes = 256 * 1024;
const heapLimit = getHeapStatistics().heap_size_limit;
const requestCount = Math.min(2048, Math.ceil(heapLimit / (2 * paddingBytes)) + 16);
assert.ok(requestCount * 2 * paddingBytes > heapLimit, `cap of 2048 requests cannot exceed heap limit ${heapLimit}`);
```

Pass `paddingBytes` and `requestCount` through to `recordLargeAgentRequests`. Keep the existing `assert.ok(totalBodyBytes > getHeapStatistics().heap_size_limit)` and the four analysis assertions.

- [ ] **Step 3: Verify under node 24**

Run the Step 1 command again.
Expected: PASS, 37 tests, 1 fail becomes 0 fail in that file.

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
- Modify: `packages/core/test/unit/config/plugin-config-migration.test.mjs` (three tests that set `process.env[CCR_DESKTOP_APP_ENV] = "1"`)
- Modify: `packages/core/test/unit/agents/plugin-permissions.test.mjs:323-331` (`withDesktopRuntime`)

**Interfaces:**
- Produces: `export async function withDesktopRuntime(run)` in `packages/core/test/support/desktop-runtime.mjs`. Sets `process.env.CCR_DESKTOP_APP = "1"` and, when `process.versions.electron` is undefined, assigns `process.versions.electron = "test"`. Awaits `run()`, restores both in `finally`, returns `run()`'s value.
- Consumes: `CCR_DESKTOP_APP_ENV` from `@ccr/core/runtime/desktop-app.ts`.

- [ ] **Step 1: Write the failing helper test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { isDesktopAppRuntime } from "@ccr/core/runtime/desktop-app.ts";
import { withDesktopRuntime } from "../../support/desktop-runtime.mjs";

test("withDesktopRuntime makes isDesktopAppRuntime true under plain node", async () => {
  assert.equal(isDesktopAppRuntime(), Boolean(process.versions.electron));
  const seen = await withDesktopRuntime(() => isDesktopAppRuntime());
  assert.equal(seen, true);
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
Expected: FAIL, module `../../support/desktop-runtime.mjs` not found (esbuild reports the unresolved import).

- [ ] **Step 3: Implement the helper**

Create `packages/core/test/support/desktop-runtime.mjs` with the `withDesktopRuntime(run)` described in Interfaces. Restore by deleting the key when the previous value was `undefined`, otherwise reassigning it.

- [ ] **Step 4: Run the helper test**

Run the Step 2 command.
Expected: PASS, 2 tests.

- [ ] **Step 5: Use the helper in the two failing test files**

In `plugin-permissions.test.mjs` delete the local `withDesktopRuntime` and import the helper from `../../support/desktop-runtime.mjs`; keep the local `restoreEnv` only if another test in the file still calls it. In `plugin-config-migration.test.mjs` wrap the body of each test that sets `process.env[CCR_DESKTOP_APP_ENV] = "1"` in `await withDesktopRuntime(async () => { ... })`, remove the manual env save and restore for that key, and make those tests `async`.

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
- Modify: `packages/core/src/storage/sqlite-native.ts:15-40`
- Modify: `tests/e2e/electron-cdp.spec.ts:408-416` (`readSqliteRows` inline script)
- Modify: `package.json` scripts

**Interfaces:**
- Produces: `export function betterSqliteNativeBindingCandidates(versions: { electron?: string; modules?: string }): string[]` in `sqlite-native.ts`, returning module-relative paths in priority order: `["better-sqlite3/build/Release/better_sqlite3.electron-<modules>.node", "better-sqlite3/build/Release/better_sqlite3.node"]` when `versions.electron` is set, else only the second.
- Produces: `npm run sqlite:electron` which writes `node_modules/better-sqlite3/build/Release/better_sqlite3.electron-<abi>.node` where `<abi>` is Electron's `process.versions.modules`, leaving the node binary untouched.
- Produces: env var `CCR_E2E_SQLITE_BINDING` read by the e2e Electron helper.

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

- [ ] **Step 5: Write the sidecar script**

Create `scripts/prepare-electron-sqlite.mjs` (ESM, no dependencies beyond `node:` and the installed `electron` package):

1. Read Electron's ABI: `spawnSync(electronPath, ["-p", "process.versions.modules"], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } })`.
2. `releaseDir = node_modules/better-sqlite3/build/Release`; `nodeBinary = better_sqlite3.node`; `sidecar = better_sqlite3.electron-<abi>.node`. If the sidecar exists, print it and exit 0.
3. Rename `nodeBinary` to `better_sqlite3.node.bak`.
4. Run `node_modules/.bin/prebuild-install --runtime electron --target <electron version> --tag-prefix v` with `cwd` `node_modules/better-sqlite3`. Electron version comes from `node_modules/electron/package.json`.
5. Rename the produced `nodeBinary` to `sidecar`, then rename `.bak` back to `nodeBinary`. Do the restore in `finally` so a failed download never leaves the node binary missing.
6. Print the sidecar path.

Add to root `package.json` scripts: `"sqlite:electron": "node scripts/prepare-electron-sqlite.mjs"`. Leave `rebuild:sqlite3` as is; it is for Windows packaging.

- [ ] **Step 6: Run the script and prove both runtimes load**

Run: `npm run sqlite:electron`
Expected: prints `.../better_sqlite3.electron-146.node`; `ls node_modules/better-sqlite3/build/Release/` shows both files.
Run: `node -e "require('better-sqlite3')(':memory:').close(); console.log('node ok')"`
Expected: `node ok`.
Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e "const D=require('better-sqlite3'); new D(':memory:',{nativeBinding:require.resolve('better-sqlite3/build/Release/better_sqlite3.electron-'+process.versions.modules+'.node')}).close(); console.log('electron ok')"`
Expected: `electron ok`.

- [ ] **Step 7: Make the e2e Electron helper use the sidecar**

In `tests/e2e/electron-cdp.spec.ts` `readSqliteRows`, change the inline script to `new Database(process.env.CCR_E2E_SQLITE_FILE, { nativeBinding: process.env.CCR_E2E_SQLITE_BINDING, readonly: true })`. In `runElectronNode`, set `CCR_E2E_SQLITE_BINDING` to `require.resolve("better-sqlite3/build/Release/better_sqlite3.electron-" + abi + ".node")` where `abi` is read once with the same `electron -p process.versions.modules` call as the script. The Electron main process itself needs no change: it loads through `sqlite-native.ts`.

- [ ] **Step 8: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: `21 passed` (5 + 12 + 4), 0 failed, 0 did not run.

- [ ] **Step 9: Run typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add scripts/prepare-electron-sqlite.mjs packages/core/src/storage/sqlite-native.ts packages/core/test/unit/storage/sqlite-native-binding.test.mjs tests/e2e/electron-cdp.spec.ts package.json
git commit -m "build: load an Electron sidecar build of better-sqlite3 so node and Electron suites share one install"
```

---

### Task 5: Instruction files and gitignore

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `.claude/auto-memory/config.json`
- Modify: `.gitignore:10` (`.claude`)

**Interfaces:**
- Produces: `AGENTS.md` sections in this order: Commands, Where the standards are enforced, Style that differs from defaults, Files never hand-edited, Repository etiquette, Local environment notes. Each section is a bullet list. Sections `build-commands` and `conventions` are wrapped in `<!-- AUTO-MANAGED: build-commands -->` ... `<!-- END AUTO-MANAGED -->` markers so the auto-memory plugin can update them; the rest is inside one `<!-- MANUAL -->` ... `<!-- END MANUAL -->` block.

- [ ] **Step 1: Un-ignore the committed Claude config**

Replace the line `.claude` in `.gitignore` with:

```
.claude/*
!.claude/settings.json
!.claude/rules/
!.claude/skills/
!.claude/hooks/
!.claude/auto-memory/
.claude/auto-memory/*
!.claude/auto-memory/config.json
```

Run: `git check-ignore -v .claude/settings.json .claude/settings.local.json .claude/rules/x.md`
Expected: only `.claude/settings.local.json` is reported ignored.

- [ ] **Step 2: Write AGENTS.md**

Content, under 120 lines, from the spec's baseline and decisions. Commands: `npm ci`, `npm run typecheck`, `npm run test:architecture`, `npm run test:<core|ui|electron|cli>`, `npm run test:e2e` (needs `npm run test:e2e:install` and `npm run sqlite:electron` once), `npm run dev:electron`. Standards: name `tests/architecture/package-boundaries.test.mjs`, `tests/architecture/ui-build-contract.test.mjs`, `packages/core/test/architecture/gateway-service-architecture.test.mjs`, and the lightweight MCP bundle limit in `build/esbuild.config.mjs`. Style: the Global Constraints style line. Never hand-edited: `packages/core/models.json`, `packages/ui/src/generated/`, `package-lock.json`, `dist/`, `.test-dist/`. Etiquette: npm only, and `npm ci` runs the install scripts listed in `allowScripts` (approve a new native dependency with `npm install-scripts approve <pkg>`); no AI review notes or plan docs under `docs/` outside `docs/superpowers/`; architecture rules change only with their test. Environment: node 24 (`.node-version`); `../ccr-extensions` and `../../next-ai/gateway` are optional sibling checkouts and absent here.

- [ ] **Step 3: Write CLAUDE.md and the auto-memory config**

`CLAUDE.md` contains exactly one line: `@AGENTS.md`.

`.claude/auto-memory/config.json`:

```json
{
  "memoryFiles": ["CLAUDE.md", "AGENTS.md"]
}
```

- [ ] **Step 4: Verify the file loads**

Run: `wc -l AGENTS.md`
Expected: under 120.
Start a fresh `claude` session in the repo and run `/context`.
Expected: `AGENTS.md` appears under Memory files via the `CLAUDE.md` import.

- [ ] **Step 5: Commit**

```bash
git add .gitignore AGENTS.md CLAUDE.md .claude/auto-memory/config.json
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
- Produces: four rule files, each with `paths:` frontmatter and at most 15 body lines. Each names the test or build check that enforces it so the rule and the check cannot silently diverge.

- [ ] **Step 1: Write the four rules**

| File | `paths` | Body says |
| --- | --- | --- |
| `gateway.md` | `packages/core/src/gateway/**` | `gateway/service.ts` is re-exports only (max 20 lines); no gateway module imports the facade; `core-runtime/config-compiler.ts` never touches `node:fs`. Enforced by `packages/core/test/architecture/gateway-service-architecture.test.mjs`. New protocol features go in `gateway/features/`. |
| `mcp-subprocess.md` | `packages/core/src/mcp/**` | Lightweight MCP bundles (`fusion-vision-mcp`, `media-tools-proxy-mcp`, `browser-web-search-proxy-mcp`, `fusion-tool-fallback-mcp`) stay under 128 KiB and may not import `config/`, `storage/`, Electron, UI, or `better-sqlite3`. Enforced by `build/esbuild.config.mjs` (`forbiddenLightweightMcpInputs`). |
| `tests.md` | `packages/*/test/**`, `tests/**` | `node:test` plus `node:assert/strict`; name a test after the issue it pins (`#1822 ...`); UI component tests render with `renderToStaticMarkup`; run one file with `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<path>.test.js`; tests that assert desktop behavior use `packages/core/test/support/desktop-runtime.mjs`. |
| `ui.md` | `packages/ui/**` | Components come from `components/ui/` (Base UI + Tailwind 4); the renderer talks to the backend only through `window.ccr` (`web-client-bridge.ts` in the browser, Electron preload in the app); never import `@ccr/core` runtime modules into the renderer. Enforced by `tests/architecture/ui-build-contract.test.mjs` and the esbuild renderer config. |

- [ ] **Step 2: Verify the frontmatter parses and the rule loads on demand**

Run: `claude --debug -p "read packages/core/src/gateway/service.ts and say nothing else" 2>&1 | grep -i 'rules/gateway.md'`
Expected: one line showing the rule loaded. If nothing prints, run `/context` interactively after reading that file and confirm the rule is listed.

- [ ] **Step 3: Commit**

```bash
git add .claude/rules
git commit -m "docs: add path-scoped assistant rules that point at the enforcing tests"
```

---

### Task 7: Hooks

**Files:**
- Create: `.claude/hooks/protect-generated.sh`
- Create: `.claude/hooks/gate-commit.sh`
- Create: `.claude/hooks/test/hooks.test.mjs`
- Create: `.claude/settings.json`

**Interfaces:**
- Produces: `protect-generated.sh` reads PreToolUse JSON on stdin, extracts `.tool_input.file_path`, exits 2 with `Blocked: <path> is generated; edit the generator instead` when the path matches any of `packages/core/models.json`, `packages/ui/src/generated/`, `package-lock.json`, `pnpm-lock.yaml`, `/dist/`, `/.test-dist/`. Exits 0 otherwise, including when `file_path` is empty.
- Produces: `gate-commit.sh` reads PreToolUse JSON, extracts `.tool_input.command`; exits 0 immediately unless the command contains `git commit`; otherwise runs `npm run typecheck` then `npm run test:architecture` from `$CLAUDE_PROJECT_DIR` and exits 2 with the first failing command's last 20 lines on stderr.
- Produces: `.claude/settings.json` registering both under `hooks.PreToolUse`: matcher `Edit|Write` for protect, matcher `Bash` with `"if": "Bash(git commit *)"` and `"timeout": 120` for the gate.

- [ ] **Step 1: Write the failing hook tests**

`.claude/hooks/test/hooks.test.mjs` (plain `node:test`; this file is run directly, not through `build/test.mjs`):

```js
const run = (script, payload, env = {}) => spawnSync("bash", [path.join(hooksDir, script)], {
  encoding: "utf8",
  env: { ...process.env, ...env },
  input: JSON.stringify(payload)
});

test("protect blocks the model catalog", () => {
  const r = run("protect-generated.sh", { tool_input: { file_path: "/repo/packages/core/models.json" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /generated/);
});
test("protect allows ordinary source", () => {
  assert.equal(run("protect-generated.sh", { tool_input: { file_path: "/repo/packages/core/src/x.ts" } }).status, 0);
});
test("protect ignores a Bash call with no file_path", () => {
  assert.equal(run("protect-generated.sh", { tool_input: { command: "node scripts/generate-models-json.mjs" } }).status, 0);
});
test("gate passes through a non-commit git command without running checks", () => {
  const r = run("gate-commit.sh", { tool_input: { command: "git status" } }, { CLAUDE_PROJECT_DIR: "/nonexistent" });
  assert.equal(r.status, 0);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test .claude/hooks/test/hooks.test.mjs`
Expected: FAIL, scripts not found.

- [ ] **Step 3: Write both scripts and chmod +x**

Use `set -euo pipefail`, `INPUT=$(cat)`, `jq -r '.tool_input.file_path // empty'` and `jq -r '.tool_input.command // empty'`. Quote every variable. The gate uses `cd "$CLAUDE_PROJECT_DIR"`.

- [ ] **Step 4: Run the hook tests**

Run: `node --test .claude/hooks/test/hooks.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write `.claude/settings.json` and exercise it live**

Write the settings described in Interfaces. Start a new `claude` session, run `/hooks`.
Expected: both hooks listed under PreToolUse.
Ask Claude to add a key to `packages/core/models.json`.
Expected: the edit is blocked and Claude reports the `Blocked:` message.
Ask Claude to run `git commit --allow-empty -m "hook smoke"` then undo it with `git reset --soft HEAD~1`.
Expected: the commit waits roughly 11 s while typecheck and architecture tests run, then succeeds.

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks .claude/settings.json
git commit -m "chore: add protect-generated and commit-gate hooks for coding assistants"
```

---

### Task 8: Project `verify` skill

**Files:**
- Create: `.claude/skills/verify/SKILL.md`
- Create: `.claude/skills/verify/scripts/verify.sh`

**Interfaces:**
- Produces: `verify.sh` with no arguments runs, in order, `npm run typecheck`, `npm run test:architecture`, then `npm run test:<pkg>` for each of `core`, `ui`, `electron`, `cli` whose `packages/<pkg>/` has changes in `git diff --name-only HEAD` plus staged and untracked files; always runs all four when `build/` or the root `package.json` changed. Prints a one-line summary per command and exits non-zero on the first failure. With `--e2e` it also checks that `node_modules/better-sqlite3/build/Release/better_sqlite3.electron-*.node` exists (printing `run npm run sqlite:electron` if not) and runs `npm run test:e2e`.
- Produces: `SKILL.md` with `name: verify`, a description that says it runs the repo's checks for the touched packages and must be used before every commit and whenever asked to verify, `allowed-tools: Bash(bash .claude/skills/verify/scripts/verify.sh*)`, and a body that tells Claude to run the script, paste the summary lines, and stop on the first failure instead of retrying. No `disable-model-invocation`, so Claude Code's built-in commit instructions invoke it.

- [ ] **Step 1: Write the script and run it on a clean tree**

Run: `bash .claude/skills/verify/scripts/verify.sh`
Expected: typecheck and architecture run; no package suites run; exit 0.

- [ ] **Step 2: Run it with a touched core file**

Run: `touch packages/core/src/routing/contracts.ts && bash .claude/skills/verify/scripts/verify.sh; git checkout packages/core/src/routing/contracts.ts`
Expected: core suite runs (`ℹ fail 0`), ui/electron/cli do not; exit 0.

- [ ] **Step 3: Run it with `--e2e`**

Run: `bash .claude/skills/verify/scripts/verify.sh --e2e`
Expected: ends with Playwright `21 passed`.

- [ ] **Step 4: Write SKILL.md and confirm it is listed**

Start a new `claude` session, type `/verify`.
Expected: the project skill runs the script and reports the summary lines.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/verify
git commit -m "chore: add project verify skill that runs the touched packages' checks"
```

---

### Task 9: Whole-tree proof and prompt audit

**Files:**
- Modify: none expected. Fix anything the audit flags in the files from Tasks 5 to 8.

- [ ] **Step 1: Full suite from scratch**

Run: `rm -rf node_modules .test-dist && npm ci && npm run sqlite:electron && npm run test && npm run test:e2e`
Expected: `npm run test` ends with all packages `ℹ fail 0` and architecture 5 pass; e2e `21 passed`.

- [ ] **Step 2: Audit the instruction files**

In a `claude` session run `/doctor prompt-audit`.
Expected: no findings about missing files, contradictory rules, or stale commands. Apply any proposed edit that is a correctness fix; decline wording changes.

- [ ] **Step 3: Check the instruction file size budget**

Run: `wc -l AGENTS.md .claude/rules/*.md`
Expected: every file under 120 lines; `/status` shows no size warning.

- [ ] **Step 4: Commit any audit fixes**

```bash
git add AGENTS.md .claude
git commit -m "docs: apply prompt-audit fixes to assistant instructions"
```

Skip the commit if nothing changed.
