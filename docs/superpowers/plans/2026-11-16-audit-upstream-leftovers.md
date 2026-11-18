# Audit remediation: upstream leftovers implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove two things the fork inherited from upstream and never chose: the `TZ=UTC` override for Claude Code in China time zones (F-E1), and the `CODEXL_*` environment names written beside the `LLMR_*` names (F-E2).

**Architecture:** Two pull requests. UL-1 deletes the override, its duplicate inside the Codex runtime script, and every call site. UL-2 first adds the two `LLMR_` writers and two `LLMR_` reads that the load-bearing names lack, then deletes every `CODEXL_` write, read and prefix, then adds an architecture test that fails when `CODEXL_` reappears in `packages/*/src`. Three stale names stay as one cleanup list in `agents/claude-code/environment.ts`, so that apply and release keep stripping them from users' Claude settings files.

**Tech Stack:** TypeScript, the CommonJS runtime script in `packages/core/src/agents/codex/cli-middleware-runtime.ts`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-16-audit-remediation.md` (findings F-E1 and F-E2, decisions D-4, D-5 and D-9). The program index is `docs/superpowers/plans/2026-11-16-audit-remediation-index.md`.

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

- D-9 applies to both PRs. UL-1 does not strip an existing `TZ: "UTC"` from anyone's settings. UL-2 adds no code that reads a `CODEXL_` name as a fallback.
- Line numbers are from `136ad730`. UL-1 moves lines in `profiles/service.ts` and the runtime script before UL-2 starts. Find each edit by the symbol or text anchor given beside its line number.
- The runtime script is one `String.raw` template. ST-1 in the [structure plan](completed/2026-11-16-audit-structure.md) moves it to a `.cjs` file. The [program index](2026-11-16-audit-remediation-index.md) runs ST-1 after UL-2. If ST-1 has merged, make every runtime edit in that file. Find it with `git grep -l "function resolveConfigDir" packages/core/src`. The anchors are function names, so they hold in either file.
- Read each file with Read before editing it. `.claude/rules/` files load only on Read, Edit and Write.
- The profile-service integration tests skip unless `LLMR_INTERNAL_HOME_DIR` is set. `npm run test:core` sets it. When running that file alone, check the output for skipped tests. If the new tests show as skipped, run `npm run test:core` to see them.

## Review Focus

Each line names the test that pins it, or says why no test can.

1. **A wrapper generated before UL-2 runs the runtime generated after it.** The appendix section "Wrapper and runtime rewrite trace" shows this happens. The agent must still start, and it loses only the workspace label. Pinned in UL-2 Task 2, Step 2.
2. **Windows `.cmd` wrappers.** CI is Ubuntu-only, and `codexMiddlewareCmdScript` and `claudeCodeWrapperCmdScript` run only when `process.platform === "win32"`. No test in this plan executes them. The reviewer compares each `.cmd` edit with its shell twin line by line. The UL-2 guard still proves that no `CODEXL_` text remains in either generator.
3. **A machine that exports `CODEXL_HOME` for the real CodexL launcher.** Today that variable moves LLMR's config directory. After UL-2 it does nothing. Pinned in UL-2 Task 2, Step 2.
4. **A user's own `TZ` in Claude settings `env`.** Today apply overwrites it with `UTC` in a China time zone. After UL-1 apply leaves it alone, including a `TZ: "UTC"` that an earlier version wrote. Pinned in UL-1 Task 1, Step 2.
5. **Someone set a read-only `CODEXL_` name by hand, for example `CODEXL_CODEX_PATH`.** It stops working with no message. No test covers this. The UL-2 release note lists the `LLMR_` replacements.

## Known limits

- A takeover state file written by an earlier version can hold `CODEXL_CLAUDE_CODE_MODEL` in its displaced env, and release would put that key back into the user's settings. Nothing reads the key. The next apply strips it again. Left as is under D-9.
- `params.codexlWorkspaceCwd` in `trackRequestLine` (runtime `:1022-1023`) is a property name on an in-memory request record, not an environment name. D-5 does not cover it and this plan leaves it.

---

## UL-1: Remove the TZ=UTC override

- **Fixes:** F-E1 (decision D-4).
- **Depends on:** None.
- **Branch:** `fix/remove-claude-code-tz-override`
- **Size:** S
- **Owner steps:** Paste the release-note sentence from Task 1, Step 8 into the notes of the release that ships this PR.

**Status:** Merged 2026-11-17 as [PR 90](https://github.com/jrmatherly/llm-router/pull/90), squash commit `82de7d8c`. Two reviews found nothing to fix and added two test pins to the steps below: the profile test also checks that a user's `TZ` survives release, and a launch-core test checks that a Claude Code launch plan in a China time zone sets no `TZ`. The Windows `.cmd` wrapper edit was not executed. The release note is in the PR body and is not yet in a release.

### Task 1: Delete the override and its call sites

**Files:**
- Modify: `packages/core/src/agents/claude-code/environment.ts:35-44,101-116`
- Modify: `packages/core/src/profiles/service.ts:18,483,486,504,1724,1762,3344,3357`
- Modify: `packages/core/src/profiles/launch-service.ts:10,187,1366`
- Modify: `packages/core/src/profiles/launch-core.ts:3,327`
- Modify: `packages/core/src/agents/claude-app/launch.ts:8,69`
- Modify: `packages/core/src/agents/codex/cli-middleware-runtime.ts:28-37,59-74,170,4125`
- Test: `packages/core/test/unit/agents/claude-environment.test.mjs:7-8,12-24`
- Test: `packages/core/test/integration/agents/codex-cli-middleware-runtime.test.mjs`
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Removes: `claudeCodeUtcTimezoneEnvOverride`, `currentTimeZone` and `isChinaTimeZone` from `@llmr/core/agents/claude-code/environment`. Nothing else in the repo imports them.
- Produces: `claudeCodeManagedSettingsEnvKeys(profileEnvValues, profileSettingsEnv, mcpConfigEnv, wifEnv): Set<string>`, with the `timezoneEnv` parameter gone. UL-2 edits the same function.

- [ ] **Step 1: Create the branch**

```bash
git switch -c fix/remove-claude-code-tz-override main
```

- [ ] **Step 2: Write the failing tests**

In `codex-cli-middleware-runtime.test.mjs`, add `"    TZ: process.env.TZ || '',"` to the `env` object that `writeFakeClaudeCli` records (near `:1500`). Insert it before the `ANTHROPIC_MODEL` line, because the object's last entry has no trailing comma. Then add this test after "Claude Code wrapper preserves an explicit model argument":

```js
test("Claude Code wrapper passes the caller's time zone to the real CLI", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-runtime-wrapper-"));
  const runtimeFile = writeRuntimeScript(dir);
  const { fakeCli, outputFile } = writeFakeClaudeCli(dir);

  execFileSync(process.execPath, [runtimeFile, "-p", "hi"], {
    env: {
      ...process.env,
      LLMR_CLAUDE_CODE_WRAPPER: "1",
      LLMR_FAKE_CLAUDE_OUT: outputFile,
      LLMR_REAL_CLAUDE_CODE_BIN: fakeCli,
      LLMR_REMOTE_SYNC_ENABLED: "0",
      TZ: "Asia/Shanghai"
    },
    stdio: "pipe"
  });

  assert.equal(JSON.parse(readFileSync(outputFile, "utf8")).env.TZ, "Asia/Shanghai");
});
```

In `profile-service.test.mjs`, add this test after "release restores the user's own provider env that apply displaced". Node re-reads the time zone when `process.env.TZ` is assigned, so the override sees a China zone inside the test process.

```js
test("apply in a China time zone leaves TZ in Claude settings to the user", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "Asia/Shanghai";
  try {
    for (const [original, expected] of [
      [{ env: { USER_VALUE: "kept" } }, undefined],
      [{ env: { TZ: "Europe/Berlin" } }, "Europe/Berlin"],
      [{ env: { TZ: "UTC" } }, "UTC"]
    ]) {
      await withGlobalClaudeProfileRelease(original, async ({ apply, readSettings }) => {
        await apply();
        assert.equal(readSettings().env.TZ, expected);
        const suffix = process.platform === "win32" ? ".cmd" : "";
        const wrapper = readFileSync(path.join(CONFIGDIR, "bin", `llmr-claude-code-wrapper-displaced-env-claude-code${suffix}`), "utf8");
        assert.doesNotMatch(wrapper, /\bTZ=/);
      });
    }
  } finally {
    restoreEnv("TZ", previousTz);
  }
});
```

The third pair records D-9. An existing `TZ: "UTC"` stays, because LLMR cannot tell its own old value from the user's.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/agents/codex-cli-middleware-runtime.test.js`
Expected: FAIL in the new test with `'UTC' !== 'Asia/Shanghai'`.

Run: `npm run test:core`
Expected: FAIL in the new profile-service test with `'UTC' !== undefined`.

- [ ] **Step 4: Delete the override**

| File | Anchor | Edit |
|---|---|---|
| `environment.ts` | `const chinaTimeZones` (`:35-44`) | Delete the set. |
| `environment.ts` | `claudeCodeUtcTimezoneEnvOverride`, `currentTimeZone`, `isChinaTimeZone` (`:101-116`) | Delete the three functions. |
| `service.ts` | import list (`:18`) | Drop `claudeCodeUtcTimezoneEnvOverride`. |
| `service.ts` | `applyClaudeCodeProfile` (`:483`, `:486`, `:504`) | Delete `const timezoneEnv`. Drop `timezoneEnv` from `Object.assign(env, ...)` and from the `claudeCodeManagedSettingsEnvKeys(...)` call. |
| `service.ts` | `claudeCodeWrapperShellScript` (`:1724`), `claudeCodeWrapperCmdScript` (`:1762`) | Delete the `shellEnvExports(...)` and `cmdEnvExports(...)` lines that wrap the override. |
| `service.ts` | `claudeCodeManagedSettingsEnvKeys` (`:3344`, `:3357`) | Delete the `timezoneEnv` parameter and the `...Object.keys(timezoneEnv)` line. |
| `launch-service.ts` | `:10` | Delete the import line. The override is its only name. |
| `launch-service.ts` | spawn env in the profile launch (`:187`) | Delete the `...(profile.agent === "claude-code" ? ... : {})` line. |
| `launch-service.ts` | `startClaudeAppBotWorker` (`:1366`) | Delete the spread. |
| `launch-core.ts` | `:3`, `:327` | Drop the import name and the spread. |
| `claude-app/launch.ts` | `:8`, `:69` | Drop the import name and the spread. |
| runtime script | `CLAUDE_CODE_CHINA_TIME_ZONES` (`:28-37`) | Delete the set. |
| runtime script | `claudeCodeUtcTimezoneEnvOverride`, `currentTimeZone`, `isClaudeCodeChinaTimeZone` (`:59-74`) | Delete the three functions. |
| runtime script | `runClaudeCodeCliWrapper` (`:170`), `claudeCommand` (`:4125`) | Delete the two spreads. In `runClaudeCodeCliWrapper` the `env` object keeps only the `...withoutKeys(...)` spread and its comment. |

Before deleting `currentTimeZone` from the runtime script, confirm that nothing else calls it.

Run: `git grep -n "currentTimeZone\|ChinaTimeZone\|CHINA_TIME_ZONES\|UtcTimezone\|timezoneEnv" -- packages`
Expected after the edits: no output.

- [ ] **Step 5: Delete the two unit tests**

In `claude-environment.test.mjs`, delete "detects China time zones used by Claude Code" and "overrides Claude Code timezone only for China time zones" (`:12-24`), and drop `claudeCodeUtcTimezoneEnvOverride` and `isChinaTimeZone` from the import (`:7-8`).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-environment.test.js .test-dist/core/test/integration/agents/codex-cli-middleware-runtime.test.js`
Expected: PASS.

- [ ] **Step 7: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
```

Expected: all three exit 0. `npm run test:core` must list "apply in a China time zone leaves TZ in Claude settings to the user" as passed, not skipped.

- [ ] **Step 8: Commit and open the PR**

```bash
git add packages/core/src packages/core/test
git commit -m "fix(profiles): stop forcing TZ=UTC for Claude Code in China time zones"
```

Open the PR with `## Why` stating that the override ran the whole Claude Code process tree in UTC with no documented reason (F-E1, D-4). Add a `## Release note` section with this sentence, which the owner copies into the release notes:

> LLMR no longer sets `TZ=UTC` for Claude Code in China time zones. If an earlier version wrote `"TZ": "UTC"` into the `env` block of a Claude Code `settings.json`, LLMR leaves that line in place, because it cannot tell its own value from yours. Delete the line to run Claude Code in your local time zone. The file is `~/.claude/settings.json` for a global profile and `~/.llm-router/profiles/<profile id>/claude/settings.json` for an LLMR-scoped one.

---

## UL-2: Migrate CODEXL_ names to LLMR_

- **Fixes:** F-E2 (decision D-5).
- **Depends on:** UL-1. Both PRs edit `profiles/service.ts`, `profiles/launch-service.ts` and the runtime script.
- **Branch:** `refactor/codexl-env-to-llmr`
- **Size:** M
- **Owner steps:** None required. A check on Windows that a Codex profile still launches from its `.cmd` wrapper would cover Review Focus 2.

**Status:** Merged 2026-11-17 as [PR 91](https://github.com/jrmatherly/llm-router/pull/91), squash commit `aee43b67`. The three tasks landed as one commit. Three reviews found no code defect and changed two things from the steps below:

- A new test, "release strips stale CODEXL keys written after apply", pins the strip on release. Before it, removing the check in `withoutManagedClaudeCodeEnv` left the suite green.
- The stale-wrapper test gives `CODEXL_CODEX_PROFILE` its own value, so a `CODEXL_` read returning to `agentEnv` fails it.

Task 2, Step 1 found wrappers and the runtime are still not rewritten together, so the release note keeps its last sentence. Left as is: a `CODEXL_` key in a profile's own `env` passes through to the Claude settings file and the wrapper, and release removes it (measured with a probe test on 2026-11-17). Nothing reads it, and only the model key is new with this PR.

Follow-up, merged 2026-11-17 as [PR 92](https://github.com/jrmatherly/llm-router/pull/92), squash commit `eb65d18c`: `agentEnv`'s second suffix `CORE_MODE` resolved to an `LLMR_*_CORE_MODE` name nothing writes, so it is deleted. The same PR stops writing seven WorkBuddy names that had no reader in the repo (`LLMR_WORKBUDDY_MODEL`, `_MODEL_PROVIDER`, `_PROFILE`, `_REMOTE_FRONTEND_MODE`, `_MODEL_CATALOG_FILE`, `_VIRTUAL_AUTH_FILE`, `LLMR_REAL_WORKBUDDY_CLI_PATH`). That the WorkBuddy app ignores them is inferred, not observed. The `.cmd` wrappers were not executed. The release note is in the PR body and is not yet in a release.

The appendix lists every name, its write and read sites, and its class. The tasks cite it. Task 1 keeps every `CODEXL_` name in place, so behaviour is unchanged after it. Task 2 deletes them. Task 3 adds the guard.

### Task 1: Add the missing LLMR_ writers and reads

Three names are load-bearing (appendix class L). `CODEXL_CODEX_WORKSPACE_NAME` and `CODEXL_ZCODE_WORKSPACE_NAME` have no `LLMR_` writer on the wrapper and app paths. `parseCodexBotWorkerOptions` has no `LLMR_ZCODE_WORKSPACE_NAME` read. `modelList` reads `CODEXL_CLAUDE_CODE_MODEL` with no `LLMR_CLAUDE_CODE_MODEL` beside it.

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`codexMiddlewareShellScript` near `:2861` and `:2899`, `codexMiddlewareCmdScript` near `:3008` and `:3037`)
- Modify: `packages/core/src/agents/codex/app-launch.ts` (`codexProfileEnv` at `:664-716`, new export near `:785`)
- Modify: `packages/core/src/agents/codex/cli-middleware-runtime.ts` (`parseCodexBotWorkerOptions` at `:1845`, `modelList` at `:4347`)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`
- Test: `packages/core/test/unit/agents/codex-app-model-catalog.test.mjs`
- Test: `packages/core/test/integration/agents/codex-cli-middleware-runtime.test.mjs`

**Interfaces:**
- Produces: wrapper exports `LLMR_CODEX_WORKSPACE_NAME` (Codex and WorkBuddy wrappers) and `LLMR_ZCODE_WORKSPACE_NAME` (ZCode wrappers), value `profile.name || values.providerId`.
- Produces: `codexProfileEnvForTest(profile: ProfileConfig): Record<string, string>` exported from `app-launch.ts`. It returns `codexProfileEnv(profile, "", codexCompatibleAppSpecForProfile(profile))`, following `codexSharedChatGptAuthEnvForTest`.

- [ ] **Step 1: Create the branch**

```bash
git switch -c refactor/codexl-env-to-llmr main
```

- [ ] **Step 2: Write the failing tests**

In `profile-service.test.mjs`, test "Codex profile launcher bypasses middleware for Browser and Computer Use helpers", after `const content = readFileSync(launcher, "utf8");` add:

```js
assert.match(content, /^export LLMR_CODEX_WORKSPACE_NAME='Browser Helper Bypass'$/m);
```

In the same file, add a ZCode wrapper test. Copy the fixture of "profile service restores between-session ZCode edits after many takeover rewrites prune old backups" (root, `configFile`, `config`, the `finally` block), with `id: "workspace-name-zcode"`, `name: "Workspace Name ZCode"` and `cliMiddleware: true` on the profile, one `applyProfileFixture(config)` call, and this body:

```js
test("ZCode wrapper exports the workspace name under its LLMR_ name", { skip: process.platform === "win32" || !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  // fixture as described above
  const content = readFileSync(path.join(CONFIGDIR, "bin", "llmr-codex-cli-stdio-workspace-name-zcode"), "utf8");
  assert.match(content, /^export LLMR_ZCODE_WORKSPACE_NAME='Workspace Name ZCode'$/m);
});
```

In `codex-app-model-catalog.test.mjs`, import `codexProfileEnvForTest` and add:

```js
test("app launch env carries the workspace name under its LLMR_ name", () => {
  const base = { codexCliPath: "/usr/bin/true", enabled: true, env: {}, id: "p", model: "", providerId: "llm-router" };
  assert.equal(codexProfileEnvForTest({ ...base, agent: "codex", name: "Codex Main" }).LLMR_CODEX_WORKSPACE_NAME, "Codex Main");
  assert.equal(codexProfileEnvForTest({ ...base, agent: "workbuddy", name: "Buddy Main" }).LLMR_CODEX_WORKSPACE_NAME, "Buddy Main");
  assert.equal(codexProfileEnvForTest({ ...base, agent: "zcode", name: "ZCode Main" }).LLMR_ZCODE_WORKSPACE_NAME, "ZCode Main");
});
```

In `codex-cli-middleware-runtime.test.mjs`, add two tests. The first evaluates one runtime function. The second starts the Claude Code app-server mode, which answers `model/list` from its environment and exits when stdin closes.

```js
test("Codex bot worker reads the ZCode workspace name from its LLMR_ name", () => {
  const names = ["LLMR_CODEX_WORKSPACE_NAME", "LLMR_ZCODE_WORKSPACE_NAME", "CODEXL_CODEX_WORKSPACE_NAME", "CODEXL_ZCODE_WORKSPACE_NAME"];
  const previous = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    process.env.LLMR_ZCODE_WORKSPACE_NAME = "ZCode Main";
    const parse = evaluateRuntimeFunction("parseCodexBotWorkerOptions", ["nonEmptyEnv"]);
    assert.deepEqual(parse([]), { workspaceName: "ZCode Main" });
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});

test("Claude Code app-server lists the model from LLMR_CLAUDE_CODE_MODEL", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llmr-runtime-model-list-"));
  const runtimeFile = writeRuntimeScript(dir);
  const result = spawnSync(process.execPath, [runtimeFile, "app-server"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CODEXL_CLAUDE_CODE_MODEL: "",
      HOME: dir,
      LLMR_CLAUDE_CODE_MODEL: "Provider/only-llmr",
      LLMR_CODEX_MODEL: "",
      LLMR_CODEX_MODEL_CATALOG_FILE: "",
      LLMR_CODEX_REMOTE_FRONTEND_MODE: "claude-code"
    },
    input: `${JSON.stringify({ id: 1, method: "model/list", params: {} })}\n`
  });

  assert.equal(result.status, 0, result.stderr);
  const response = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line)).find((line) => line.id === 1);
  assert.deepEqual(response.result.data.map((item) => item.id), ["Provider/only-llmr"]);
});
```

The expected `data` comes from reading `modelList` and `codexModelItem`, not from a run. With no catalog and no existing result, the only item is the configured fallback.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/codex-app-model-catalog.test.js .test-dist/core/test/integration/agents/codex-cli-middleware-runtime.test.js`
Expected: FAIL. The catalog file fails on the missing `codexProfileEnvForTest` export. The bot worker test fails with `workspaceName: 'Codex'`. The model list test fails with `[] deepEqual ['Provider/only-llmr']`. If the model list test fails for another reason (a non-zero exit, or no line with `id: 1`), read `ClaudeCodeAppServer.run` and `handleRequest` and fix the fixture before going on. The assertion on `data` is the part that must flip.

Run: `npm run test:core`
Expected: FAIL in the two wrapper tests on the missing `export LLMR_..._WORKSPACE_NAME` line.

- [ ] **Step 4: Add the writers**

- `codexMiddlewareShellScript`, ZCode branch: after the `LLMR_ZCODE_REMOTE_FRONTEND_MODE` export, add ``export LLMR_ZCODE_WORKSPACE_NAME=${shellQuote(profile.name || values.providerId)}``.
- `codexMiddlewareShellScript`, Codex branch: after the `LLMR_CODEX_REMOTE_FRONTEND_MODE` export, add the same line for `LLMR_CODEX_WORKSPACE_NAME`.
- `codexMiddlewareCmdScript`: add `cmdSetLine("LLMR_ZCODE_WORKSPACE_NAME", workspaceName)` and `cmdSetLine("LLMR_CODEX_WORKSPACE_NAME", workspaceName)` at the matching places. `workspaceName` already exists at `:2994`.
- `codexProfileEnv`: add `LLMR_ZCODE_WORKSPACE_NAME: profile.name || providerId` to the ZCode object and `LLMR_CODEX_WORKSPACE_NAME: profile.name || providerId` to `codexEnv`. WorkBuddy spreads `codexEnv`, so it needs no name of its own.
- Add `codexProfileEnvForTest` beside `codexSharedChatGptAuthEnvForTest`.

`startClaudeAppBotWorker` already writes `LLMR_CODEX_WORKSPACE_NAME` (`launch-service.ts:1362`).

- [ ] **Step 5: Add the reads**

- `parseCodexBotWorkerOptions` (`:1845`): insert `nonEmptyEnv("LLMR_ZCODE_WORKSPACE_NAME") ||` after the `LLMR_CODEX_WORKSPACE_NAME` read.
- `modelList` (`:4347`): insert `nonEmptyEnv("LLMR_CLAUDE_CODE_MODEL") ||` before the `CODEXL_CLAUDE_CODE_MODEL` read.

`parseAppServerOptions` (`:2556`) and the bot config (`:5279`) already read both `LLMR_` workspace names through `agentEnv`. `loadChatGptAuth` (`:4733`) is Codex-only and already reads `LLMR_CODEX_WORKSPACE_NAME`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:core`
Expected: PASS, with the two wrapper tests listed as passed, not skipped.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src packages/core/test
git commit -m "refactor(core): write and read the LLMR_ workspace and model names the runtime lacked"
```

### Task 2: Delete every CODEXL_ write, read and prefix

**Files:**
- Modify: `packages/core/src/agents/claude-code/environment.ts`
- Modify: `packages/core/src/profiles/service.ts`
- Modify: `packages/core/src/profiles/launch-service.ts:1364-1365,1496`
- Modify: `packages/core/src/agents/codex/app-launch.ts`
- Modify: `packages/core/src/agents/codex/cli-middleware-runtime.ts`
- Modify: `packages/core/src/agents/bot-gateway/env.ts:64-75,278`
- Modify: `packages/core/src/agents/bot-gateway/qr-login-service.ts:189`
- Test: the six files listed in Step 3.

**Interfaces:**
- Produces, in `environment.ts`, the only `CODEXL_` text left in `packages/*/src`:

```ts
// Names an earlier build wrote into Claude settings env. Nothing reads or writes them; apply and release strip them.
export const STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS = ["CODEXL_CLAUDE_CODE_MCP_CONFIG", "CODEXL_CLAUDE_CODE_MODEL"] as const;
export const STALE_BOT_GATEWAY_ENV_PREFIX = "CODEXL_BOT_";
export function isStaleClaudeCodeSettingsEnvKey(key: string): boolean;
```

  `isStaleClaudeCodeSettingsEnvKey` returns true for the two keys only. `isBotGatewayEnvKey` in `service.ts` owns the prefix.
- Removes: `CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV` and `CODEXL_CLAUDE_CODE_MODEL_ENV` exports, `shellCodexlProfileSurfaceExports`, `cmdCodexlProfileSurfaceExports`.
- Changes: `CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS` loses its `CODEXL_` entry. The shared-home loop at `service.ts:489` iterates that list and writes a blank value per key, so leaving the entry in would keep writing `CODEXL_CLAUDE_CODE_MODEL: ""`.

- [ ] **Step 1: Settle the stale wrapper question**

The research report left open whether wrappers and `llmr-codex-cli-middleware.js` are always rewritten together. They are not. The appendix section "Wrapper and runtime rewrite trace" records the trace at `136ad730`. Re-run it, because UL-1 and other plans may have moved the code.

Run: `git grep -n "codexCliMiddlewareRuntimeScript()" -- packages/core/src ':!*cli-middleware-runtime*'` and `git grep -n "excludeAgents" -- packages`

- If the output still shows `ensureBotWorkerRuntime` writing the runtime with no wrapper, or any `applyProfileConfig` call with `excludeAgents`, the answer is still "not together". Do this: add no fallback read (D-5, D-9), keep the pinning test in Step 2, and keep the stale-wrapper sentence in the release note in Task 3, Step 6. An old wrapper exports every `LLMR_` twin except the workspace name, so the new runtime starts the agent and shows the default label until the next full apply rewrites the wrapper.
- If every runtime write now sits beside a write of every wrapper, the answer is "together". Do this: delete the stale-wrapper sentence from the release note. Keep the pinning test, which still passes.

- [ ] **Step 2: Write the failing tests**

In `profile-service.test.mjs`, add after the UL-1 test:

```js
test("stale CODEXL keys are stripped from settings env", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const original = {
    env: {
      CODEXL_BOT_GATEWAY_ENABLED: "true",
      CODEXL_CLAUDE_CODE_MCP_CONFIG: "/tmp/stale-toolhub-mcp.json",
      CODEXL_CLAUDE_CODE_MODEL: "Provider/stale",
      USER_VALUE: "kept"
    }
  };
  const staleKeys = (settings) => Object.keys(settings.env ?? {}).filter((key) => key.startsWith("CODEXL_"));
  await withGlobalClaudeProfileRelease(original, async ({ apply, readSettings }) => {
    await apply();
    assert.deepEqual(staleKeys(readSettings()), []);
    assert.equal(readSettings().env.USER_VALUE, "kept");
    assert.equal(readSettings().env.LLMR_CLAUDE_CODE_MODEL, "Provider/model");
  });
});
```

The release path already has its stale-key assertions at `:2139` and `:2249`, which Step 3 keeps.

In the same file, test "a shared-home Claude Code profile never writes ~/.claude and blanks the user's credential and provider env", after the `ANTHROPIC_MODEL` assertion add:

```js
assert.deepEqual(Object.keys(settings.env).filter((key) => key.startsWith("CODEXL_")), []);
```

In `codex-cli-middleware-runtime.test.mjs`, add the two Review Focus pins:

```js
test("CODEXL_HOME does not move the LLMR config directory", () => {
  const previous = [process.env.CODEXL_HOME, process.env.LLMR_CONFIG_DIR];
  try {
    process.env.CODEXL_HOME = "/tmp/codexl-home";
    process.env.LLMR_CONFIG_DIR = "/tmp/llmr-config";
    const resolveConfigDir = evaluateRuntimeFunction("resolveConfigDir", ["nonEmptyEnv", "expandHome", "runtimeHomeDir"]);
    assert.equal(resolveConfigDir(), "/tmp/llmr-config");
  } finally {
    restoreProcessEnv("CODEXL_HOME", previous[0]);
    restoreProcessEnv("LLMR_CONFIG_DIR", previous[1]);
  }
});
```

Add a three-line `restoreProcessEnv(name, value)` helper at the bottom of the file that deletes the variable when `value` is `undefined` and assigns it otherwise.

For the stale wrapper, copy the test "Codex app-server preserves workspace routing surfaced by newer app-servers" under the name "a wrapper from before the CODEXL migration still starts the app-server and loses only the workspace label". Keep its fake CLI and input. Use this env, which is what an old wrapper exports plus the blanks that isolate the test:

```js
env: {
  ...process.env,
  CODEX_HOME: codexHome,
  CODEXL_CODEX_PROFILE: "llm-router",
  CODEXL_CODEX_WORKSPACE_NAME: "Old Wrapper Label",
  HOME: isolatedHome,
  LLMR_CODEX_PROFILE: "llm-router",
  LLMR_CODEX_REMOTE_FRONTEND_MODE: "app",
  LLMR_CODEX_WORKSPACE_NAME: "",
  LLMR_PROFILE_SCOPE: "llmr",
  LLMR_REAL_CODEX_CLI_PATH: fakeCodex
}
```

Assert `result.status === 0` and `responses[0].result.account.email === "llm-router"`. The value comes from reading `loadChatGptAuth`, which falls back to `agentEnv("codex", "PROFILE")`. It was not observed in a run.

- [ ] **Step 3: Update the six existing test files**

| File | Line at `136ad730` | Edit |
|---|---|---|
| `unit/agents/bot-gateway-env.test.mjs` | `:57-60` | Expect `{ LLMR_BOT_GATEWAY_ENABLED: "false" }`. |
| `unit/agents/codex-app-model-catalog.test.mjs` | `:23,29,43-44` | Delete the `previousCodexl` save, clear and restore. |
| same | `:30-39` | Both `deepEqual` calls expect only `LLMR_CODEX_CHATGPT_AUTH_FILE`. |
| `unit/agents/claude-environment.test.mjs` | `:5,27-30` | Drop the `CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV` import. Expect `{ [CLAUDE_CODE_MCP_CONFIG_ENV]: "/tmp/toolhub-mcp.json" }`. |
| `unit/profiles/profile-launch-core.test.mjs` | `:197` | `assert.equal(claudePlan.env.CODEXL_CLAUDE_CODE_MODEL, undefined);` |
| `integration/agents/codex-cli-middleware-runtime.test.mjs` | `:155,258,387,754` | Delete the `CODEXL_...: ""` lines. |
| same | `:259,508` | Rename the key to `LLMR_CODEX_WORKSPACE_NAME`. |
| `integration/profiles/profile-service.test.mjs` | `:1060` | `assert.equal(settings.env.CODEXL_CLAUDE_CODE_MODEL, undefined);` |
| same | `:1346-1347,1360-1361` | Delete the four `CODEXL_...: ""` lines. |
| same | `:2139,2249` | Keep. They are stale-key fixtures for the cleanup path. |

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:core`
Expected: FAIL. "stale CODEXL keys are stripped from settings env" reports `['CODEXL_CLAUDE_CODE_MODEL']`, the shared-home assertion reports the same key, "CODEXL_HOME does not move the LLMR config directory" reports `'/tmp/codexl-home'`, the stale wrapper test reports `'Old Wrapper Label'`, and the edited assertions in Step 3 fail on values the source still writes.

- [ ] **Step 5: Introduce the cleanup list and switch the strip sites to it**

In `environment.ts`, replace the two `CODEXL_..._ENV` constants with the three exports from the Interfaces block. Remove the `CODEXL_` entry from `CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS`. Delete the `CODEXL_` line in `claudeCodeMcpConfigEnv` (`:50`) and in `claudeCodeModelEnv` (`:67`).

In `service.ts`, these are the strip sites. They are the lists D-5 keeps.

| Anchor | Line | Edit |
|---|---|---|
| import list | `:13` | Import the three new exports in place of `CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV`. |
| `deleteClaudeCodeToolHubEnv` | `:353` | Loop over `[CLAUDE_CODE_MCP_CONFIG_ENV, ...STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS]`. |
| `applyClaudeCodeProfile` | `:461-462` | Keep the `CLAUDE_CODE_MCP_CONFIG_ENV` delete. Replace the second delete with a loop that deletes each of `STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS` from `settingsEnv`. |
| `isBotGatewayEnvKey` | `:3094` | `key.startsWith(STALE_BOT_GATEWAY_ENV_PREFIX)`. |
| `claudeCodeManagedSettingsEnvKeys` | `:3359` | Spread `STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS` in place of the constant. |
| `isManagedClaudeCodeSettingsEnvKey` | `:3371` | `isStaleClaudeCodeSettingsEnvKey(key)`. |
| `withoutManagedClaudeCodeEnv` | `:4252` | `!isStaleClaudeCodeSettingsEnvKey(key)`. |

The `:461-462` loop is what removes a stale `CODEXL_CLAUDE_CODE_MODEL` on apply, now that `clearClaudeCodeManagedModelEnv` no longer knows the name. The `:3359` and `:3371` edits make the removal count as a managed change, so the settings file gets written.

- [ ] **Step 6: Delete the writes, reads and prefixes**

Work through the appendix, one file at a time. Every row of class R, D and U is a plain deletion of the `CODEXL_` half. The edits that are more than deleting a line or an `||` operand:

- `service.ts`: delete `shellCodexlProfileSurfaceExports` and `cmdCodexlProfileSurfaceExports` and their two spreads (`:2921`, `:3053`). Delete the `CODEXL_CLAUDE_CODE_BIN` lines (`:1730`, `:1767`). In both middleware scripts delete the whole `CODEXL_` run that follows the `LLMR_..._REMOTE_FRONTEND_MODE` line, including the three-line `if [ -z ... ]; fi; export` groups.
- `launch-service.ts`: delete `:1364`, `:1365` and `:1496`.
- `app-launch.ts`: drop the `CODEXL_` entry from each `envPathKeys` array (`:88`, `:148`, `:200`). Delete the two `delete env.CODEXL_..._MODEL_CATALOG_B64` lines (`:628`, `:630`). In `codexCompatibleAppGatewayEnv` the api-key spread becomes `{ LLMR_PROFILE_API_KEY: apiKey }`. In `sanitizeCodexCompatibleAppEnv` (`:920-923`) each array keeps only its `LLMR_` prefixes. In `codexAppNetResponderDisabled` (`:1011`, `:1013`) keep the two `LLMR_` checks.
- `bot-gateway/env.ts`: delete `:64-75` and `:278`. `disabledBotGatewayEnv` returns `{ LLMR_BOT_GATEWAY_ENABLED: "false" }`.
- `qr-login-service.ts:189` and runtime `:5728`: delete the `CODEXL_HOME` line.
- Runtime `resolveConfigDir` (`:77`): `const configured = nonEmptyEnv("LLMR_CONFIG_DIR");`.
- Runtime `:26` and `claudeCodeArgsWithMcpConfig` (`:240`): delete the constant and its read.
- Runtime `parseAppServerOptions` (`:2557`) and `loadChatGptAuth` (`:4734-4735`): delete the `CODEXL_CODEX_INSTANCE_NAME` and `CODEXL_CODEX_WORKSPACE_NAME` operands. `CODEXL_CODEX_INSTANCE_NAME` gets no successor. Nothing ever wrote it.
- Runtime `parseCodexBotWorkerOptions` (`:1845`): the chain becomes `LLMR_CODEX_WORKSPACE_NAME`, then `LLMR_ZCODE_WORKSPACE_NAME`, then `"Codex"`.
- Runtime `modelList` (`:4347`): `agentEnv(runtimeAgent, "MODEL") || nonEmptyEnv("LLMR_CLAUDE_CODE_MODEL")`.
- Runtime `childEnvForAgent` (`:7209-7210`): the `withoutKeys` list and `blockedPrefixes` keep only their non-`CODEXL_` entries.
- Runtime `agentEnv` (`:7281-7285`): `prefixes` becomes one string per agent. Keep the loop over `suffixes`. This one edit removes every dynamic read, the appendix sites marked "dyn".

- [ ] **Step 7: Confirm nothing else is left**

Run: `git grep -n "CODEXL_" -- 'packages/*/src'`
Expected: exactly two lines, both in `packages/core/src/agents/claude-code/environment.ts`, the `STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS` line and the `STALE_BOT_GATEWAY_ENV_PREFIX` line.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run typecheck && npm run test:core`
Expected: PASS, with "stale CODEXL keys are stripped from settings env" listed as passed, not skipped.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src packages/core/test
git commit -m "refactor(core): delete the CODEXL_ environment names"
```

### Task 3: Guard against CODEXL_ returning

**Files:**
- Create: `tests/architecture/codexl-names.test.mjs`

**Interfaces:**
- Consumes: the two `STALE_...` lines from Task 2.

- [ ] **Step 1: Write the guard**

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const environmentFile = "packages/core/src/agents/claude-code/environment.ts";
// The cleanup list: names LLMR strips from users' Claude settings and never reads or writes.
const cleanupOnly = [
  `${environmentFile}: CODEXL_BOT_`,
  `${environmentFile}: CODEXL_CLAUDE_CODE_MCP_CONFIG`,
  `${environmentFile}: CODEXL_CLAUDE_CODE_MODEL`
];

test("CODEXL_ appears in package sources only in the settings cleanup list", () => {
  const found = execFileSync("git", ["ls-files", "-z", "packages"], { encoding: "utf8" })
    .split("\0")
    .filter((file) => /^packages\/[^/]+\/src\//.test(file))
    .map((file) => ({ file, bytes: readFileSync(file) }))
    .filter(({ bytes }) => !bytes.includes(0))
    .flatMap(({ file, bytes }) => (bytes.toString("utf8").match(/CODEXL_[A-Z0-9_]*/g) ?? []).map((name) => `${file}: ${name}`))
    .sort();
  assert.deepEqual(found, cleanupOnly, "CODEXL_ names are gone (spec D-5). Use an LLMR_ name. Only a key that must be stripped from users' settings belongs in STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS, and then in this list.");
});
```

Each allowed name must occur exactly once, so a second use of a stale name inside `environment.ts` also fails.

- [ ] **Step 2: Run it to verify it passes**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/codexl-names.test.js`
Expected: PASS.

- [ ] **Step 3: Verify that it fails on a violation**

Append `const probe = "CODEXL_PROBE";` to `packages/core/src/agents/codex/app-launch.ts`. Re-run the command from Step 2.
Expected: FAIL, and the diff names `packages/core/src/agents/codex/app-launch.ts: CODEXL_PROBE`.
Then run `git checkout -- packages/core/src/agents/codex/app-launch.ts` and re-run. Expected: PASS.

- [ ] **Step 4: Verify before opening the PR**

```bash
npm run typecheck
npm run test:architecture
npm run test:core
node build/test.mjs core && node --test .test-dist/core/test/unit/agents/claude-environment.test.js .test-dist/core/test/unit/agents/bot-gateway-env.test.js .test-dist/core/test/unit/agents/codex-app-model-catalog.test.js .test-dist/core/test/unit/profiles/profile-launch-core.test.js
```

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add tests/architecture/codexl-names.test.mjs
git commit -m "test(architecture): fail on CODEXL_ names outside the settings cleanup list"
```

- [ ] **Step 6: Open the PR**

Title: `refactor(core): migrate CODEXL_ environment names to LLMR_`. Open `## Why` with the goal. The `CODEXL_` family came from upstream's separate CodexL launcher, `CODEXL_HOME` could move LLMR's config directory, and nothing outside this repo reads the names (F-E2, D-5). Add a `## Release note` section:

> LLMR no longer writes or reads `CODEXL_*` environment variables. If you set one by hand, use its `LLMR_` name: `LLMR_CODEX_APP_PATH`, `LLMR_CHATGPT_APP_PATH`, `LLMR_ZCODE_APP_PATH`, `LLMR_WORKBUDDY_APP_PATH`, `LLMR_CLAUDE_CODE_BIN`, `LLMR_CLAUDE_CODE_EXTRA_ARGS`, `LLMR_CLAUDE_CODE_CAPTURE_STDOUT`, `LLMR_CODEX_ISOLATED_IDENTITY`, `LLMR_SIGNED_CODEX_SUPERVISOR_NODE_PATH`, `LLMR_CODEX_APP_NET_RESPONDER_DISABLE`, `LLMR_CODEX_APP_INSPECTOR_DISABLE`, `LLMR_CONFIG_DIR` in place of `CODEXL_HOME`. `CODEXL_CODEX_INSTANCE_NAME` has no replacement. A profile launcher generated by an earlier version keeps working and shows a default workspace name until LLMR next applies that profile.

Drop the last sentence if Task 2, Step 1 found that wrappers and the runtime are now rewritten together.

---

## Appendix: CODEXL_ inventory at `136ad730`

Rebuilt from `grep -rnoE "CODEXL_[A-Z0-9_]*" packages/*/src`, then every line read. The grep finds 168 matches on 155 source lines in 7 files, and 61 distinct tokens. Two tokens are TypeScript identifiers, not environment names: `CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV` and `CODEXL_CLAUDE_CODE_MODEL_ENV`. Four are prefixes: `CODEXL_BOT_`, `CODEXL_CODEX_`, `CODEXL_ZCODE_`, `CODEXL_WORKBUDDY_`. That leaves 55 literal environment names. `agentEnv` builds 8 more names at run time that never appear as text.

File keys: **S** `profiles/service.ts`, **L** `profiles/launch-service.ts`, **A** `agents/codex/app-launch.ts`, **R** `agents/codex/cli-middleware-runtime.ts`, **E** `agents/claude-code/environment.ts`, **B** `agents/bot-gateway/env.ts`, **Q** `agents/bot-gateway/qr-login-service.ts`. "dyn" marks a read through `agentEnv(agent, suffix)` (R:7281), which tries `LLMR_<AGENT>_<suffix>` first and `CODEXL_<AGENT>_<suffix>` second.

Classes: **L** load-bearing, no `LLMR_` twin on that path. **R** redundant twin, the `LLMR_` name is written and read first on the same path. **D** dead, written and never read. **U** read-only, never written by LLMR, so only a user could set it. **C** cleanup-only, a strip list.

### Load-bearing (3)

| Name | Writes | Reads | `LLMR_` twin on the same path | Class |
|---|---|---|---|---|
| `CODEXL_CODEX_WORKSPACE_NAME` | S:2911, S:3043, A:697, L:1364 | R:1845, R:4734, dyn R:2556, R:5279 | Read first at every site. Written only at L:1362. The wrapper (S) and app (A) paths have no `LLMR_` writer. | L |
| `CODEXL_ZCODE_WORKSPACE_NAME` | S:2869, S:3013, A:679 | R:1845, dyn R:2556, R:5279 | No `LLMR_ZCODE_WORKSPACE_NAME` writer anywhere. R:1845 has no `LLMR_ZCODE_` read. | L |
| `CODEXL_CLAUDE_CODE_MODEL` | E:67, which reaches settings env (S:480), wrapper exports (S:1722, S:1760 through S:2715), the launch plan (`launch-core.ts:326`) and the Claude App env (`claude-app/launch.ts:62`) | R:1107, R:4114, R:4347, R:6512 | Written beside it at E:66. Read first at R:1107, R:4114, R:6512. R:4347 reads `agentEnv(..., "MODEL")` and then only the `CODEXL_` name. Also stripped through E:18. | L at R:4347, R elsewhere, C at E:18 |

### Redundant twins (29)

| Name | Writes | Reads | `LLMR_` twin on the same path | Class |
|---|---|---|---|---|
| `CODEXL_BOT_GATEWAY_ENABLED` | B:64, B:278 | R:315, R:5247 | B:37, read first | R |
| `CODEXL_BOT_GATEWAY_FORWARD_ALL_CODEX_MESSAGES` | B:65 | R:5261 | `LLMR_BOT_GATEWAY_FORWARD_ALL_AGENT_MESSAGES`, B:38, read first | R |
| `CODEXL_BOT_GATEWAY_INTEGRATION_ID` | B:66 | R:5271 | B:39, read first | R |
| `CODEXL_BOT_GATEWAY_PLATFORM` | B:67 | R:316, R:5248 | B:44, read first | R |
| `CODEXL_BOT_GATEWAY_STATE_DIR` | B:68 | R:1856, R:2022, R:2522, R:5285, R:6144 | B:52, read first | R |
| `CODEXL_BOT_GATEWAY_TENANT_ID` | B:69 | R:5287 | B:54, read first | R |
| `CODEXL_BOT_HANDOFF_ENABLED` | B:70 | R:5249 | B:55, read first | R |
| `CODEXL_BOT_HANDOFF_IDLE_SECONDS` | B:71 | R:5264 | B:56, read first | R |
| `CODEXL_BOT_HANDOFF_PHONE_BLUETOOTH_TARGETS` | B:72 | R:5265 | B:57. `listEnv` returns an array, so the `CODEXL_` operand is unreachable. | R |
| `CODEXL_BOT_HANDOFF_PHONE_WIFI_TARGETS` | B:73 | R:5266 | B:58, same | R |
| `CODEXL_BOT_HANDOFF_SCREEN_LOCK` | B:74 | R:5267 | B:59, read first | R |
| `CODEXL_BOT_HANDOFF_USER_IDLE` | B:75 | R:5268 | B:60, read first | R |
| `CODEXL_BUNDLED_CODEX_CLI_PATH` | S:2904-2907, S:3039, A:693 | R:7260 | S:2887-2890, S:3028, A:691, read at R:7259 | R |
| `CODEXL_REAL_CODEX_CLI_PATH` | S:2900-2903, S:3038, A:698 | R:7258, stripped from child env at R:7209 | S:2883-2886, S:3027, A:692, read at R:7257 | R |
| `CODEXL_REAL_ZCODE_CLI_PATH` | S:2862-2865, S:3009, A:675 | R:7241, R:7252, stripped at R:7209 | S:2851-2854, S:3001, A:674, read first | R |
| `CODEXL_CODEX_PROFILE` | S:2908, S:3040, A:696 | dyn R:333, R:4736, R:5278 | S:2891, S:3029, A:689 | R |
| `CODEXL_ZCODE_PROFILE` | S:2866, S:3010, A:678 | R:7239, dyn R:333, R:5278 | S:2855, S:3002, A:672, read at R:7238 | R |
| `CODEXL_CODEX_MODEL_PROVIDER` | S:2910, S:3042, A:695 | dyn R:334, R:4582, R:4648 | S:2896, S:3034, A:688 | R |
| `CODEXL_ZCODE_MODEL_PROVIDER` | S:2868, S:3012, A:677 | dyn, same sites | S:2858, S:3005, A:671 | R |
| `CODEXL_CODEX_MODEL_CATALOG_FILE` | S:2909, S:3041, A:812 | R:1836, dyn R:4682 | S:2893, S:3031, A:808, read first | R |
| `CODEXL_ZCODE_MODEL_CATALOG_FILE` | S:2867, S:3011, A:800 | R:1835, dyn R:4682 | S:2857, S:3004, A:799, read first | R |
| `CODEXL_CODEX_PROFILE_CONFIG_FORMAT` | S:2912, S:3044 | dyn R:335 | S:2897, S:3035 | R |
| `CODEXL_ZCODE_PROFILE_CONFIG_FORMAT` | S:2870, S:3014 | dyn R:335 | S:2859, S:3006 | R |
| `CODEXL_CODEX_CORE_MODE` | S:2913, S:3045, A:694 | dyn R:2569, R:4346, as the second suffix | `LLMR_CODEX_REMOTE_FRONTEND_MODE`, S:2899, S:3037, A:690, tried first | R |
| `CODEXL_ZCODE_CORE_MODE` | S:2871, S:3015, A:676 | dyn, same sites | `LLMR_ZCODE_REMOTE_FRONTEND_MODE`, S:2861, S:3008, A:673 | R |
| `CODEXL_PROFILE_SURFACE` | S:2809-2812, S:2944, A:615, L:1365, L:1496 | R:325 | `LLMR_PROFILE_SURFACE` at each site, read first | R |
| `CODEXL_CLAUDE_CODE_BIN` | S:1730, S:1767 | R:155, R:4103 | R:155 reads `LLMR_REAL_CLAUDE_CODE_BIN` first, written at S:1729, S:1766. R:4103 runs only in the app-server and bot worker modes, which the Claude Code wrapper never enters. | R |
| `CODEXL_CLAUDE_CODE_MCP_CONFIG` | E:50, which reaches settings env (S:482, S:486) and wrapper exports (S:1723, S:1761) | R:240 | E:49, read first. Also stripped at S:353, S:462, S:3359, S:3371, S:4252. | R and C |
| `CODEXL_CODEX_CHATGPT_AUTH_FILE` | A:725 | A:732, R:4741 | A:724, read first at A:731 and R:4740 | R |

`CODEXL_CLAUDE_CODE_MODEL` is also a redundant twin at three of its four read sites. It is counted once, in the load-bearing table.

One edge on `CODEXL_CLAUDE_CODE_BIN`. The wrapper strips `LLMR_REAL_CLAUDE_CODE_BIN` from the real CLI's environment (R:169) and leaves the `CODEXL_` name, so a Codex profile in Claude Code mode started from inside a wrapped Claude Code session inherits it at R:4103. After UL-2 that nested launch uses its own profile's `LLMR_CLAUDE_CODE_BIN` or `claude`. This is the behaviour the `LLMR_` strip already intends.

### Dead writes (10)

| Name | Writes | Reads | Class |
|---|---|---|---|
| `CODEXL_HOME` (as a write) | Q:189, R:5728, both into the env of the bot gateway SDK child | None in the child. `grep -rail codexl node_modules/@the-next-ai` is empty. | D |
| `CODEXL_PROFILE_API_KEY` | A:658 | None | D |
| `CODEXL_REAL_WORKBUDDY_CLI_PATH` | A:710 | None | D |
| `CODEXL_WORKBUDDY_CORE_MODE` | A:711 | None. `agentEnv` knows only `codex` and `zcode`. | D |
| `CODEXL_WORKBUDDY_MODEL_PROVIDER` | A:712 | None | D |
| `CODEXL_WORKBUDDY_PROFILE` | A:713 | None | D |
| `CODEXL_WORKBUDDY_WORKSPACE_NAME` | A:714 | None | D |
| `CODEXL_WORKBUDDY_GATEWAY_BASE_URL` | A:660 | None | D |
| `CODEXL_WORKBUDDY_MODEL_CATALOG_FILE` | A:825 | None | D |
| `CODEXL_WORKBUDDY_VIRTUAL_AUTH_FILE` | A:892 | None | D |

### Read-only, never written by LLMR (14 literal, 8 dynamic)

| Name | Reads | `LLMR_` twin in the same expression | Class |
|---|---|---|---|
| `CODEXL_HOME` (as a read) | R:77, ahead of `LLMR_CONFIG_DIR` | `LLMR_CONFIG_DIR`, second. The only place a `CODEXL_` name wins. | U |
| `CODEXL_CODEX_INSTANCE_NAME` | R:2557, R:4735 | None | U |
| `CODEXL_CHATGPT_PATH` | A:88 | `LLMR_CHATGPT_APP_PATH` | U |
| `CODEXL_CODEX_PATH` | A:88 | `LLMR_CODEX_APP_PATH` | U |
| `CODEXL_ZCODE_PATH` | A:148 | `LLMR_ZCODE_APP_PATH` | U |
| `CODEXL_WORKBUDDY_PATH` | A:200 | `LLMR_WORKBUDDY_APP_PATH` | U |
| `CODEXL_CLAUDE_CODE_CAPTURE_STDOUT` | R:305 | Yes | U |
| `CODEXL_CLAUDE_CODE_EXTRA_ARGS` | R:4119 | Yes | U |
| `CODEXL_CODEX_ISOLATED_IDENTITY` | R:4759 | Yes | U |
| `CODEXL_SIGNED_CODEX_SUPERVISOR_NODE_PATH` | R:395 | Yes | U |
| `CODEXL_CODEX_APP_NET_RESPONDER_DISABLE` | A:1011 | Yes | U |
| `CODEXL_CODEX_APP_INSPECTOR_DISABLE` | A:1013 | Yes | U |
| `CODEXL_CODEX_MODEL_CATALOG_B64` | dyn R:4384, R:4668. Removed from the app's env at A:628. | Yes | U |
| `CODEXL_ZCODE_MODEL_CATALOG_B64` | dyn, same. Removed at A:630. | Yes | U |
| `CODEXL_{CODEX,ZCODE}_MODEL` | dyn R:1107, R:3591, R:4347, R:4371, R:4646, R:6512 | Yes, written at S:2892, S:2856, A:683, A:670 | U, dynamic only |
| `CODEXL_{CODEX,ZCODE}_REMOTE_FRONTEND_MODE` | dyn R:2569, R:4346 | Yes | U, dynamic only |
| `CODEXL_{CODEX,ZCODE}_MODEL_CATALOG` | dyn R:4392 | Yes | U, dynamic only |
| `CODEXL_{CODEX,ZCODE}_MODEL_CATALOG_PATH` | dyn R:4683 | Yes | U, dynamic only |

`CODEXL_HOME` appears in both the dead and the read-only table, because its writes and its read are on different processes. Counted once, the 55 literal names are 3 load-bearing, 29 redundant, 9 dead plus `CODEXL_HOME`, and 13 read-only.

### Prefixes and cleanup lines

| Text | Site | Purpose | After UL-2 |
|---|---|---|---|
| `CODEXL_BOT_` | S:3094, `isBotGatewayEnvKey` | Strips bot env from Claude settings (S:441, S:457, S:3373, S:4254). | Kept as `STALE_BOT_GATEWAY_ENV_PREFIX`. |
| `CODEXL_CODEX_`, `CODEXL_ZCODE_`, `CODEXL_WORKBUDDY_` | A:920-923 | Removes the other agents' names from an app's env. | Deleted. Nothing writes the names. |
| `CODEXL_CODEX_`, `CODEXL_ZCODE_` | R:7210 | Same, for a child CLI. | Deleted. |
| `CODEXL_CODEX_`, `CODEXL_ZCODE_` | R:7284-7285, `agentEnv` | The dynamic reads. | Deleted. |
| `CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV` | E:5, R:26, S:13, S:353, S:462, S:3359, S:3371, S:4252 | Constant for the MCP config name. | Replaced by `STALE_CLAUDE_CODE_SETTINGS_ENV_KEYS`. |
| `CODEXL_CLAUDE_CODE_MODEL_ENV` | E:9, E:18, E:67 | Constant for the model name. | Replaced by the same list. |

### Where this table disagrees with the research report

This table wins in each case.

- The report counts 57 names. The count is 55 literal names plus 8 that only `agentEnv` builds. The report did not list the dynamic reads.
- The report lists "all 8 `CODEXL_WORKBUDDY_*`" as dead. Seven are dead. `CODEXL_WORKBUDDY_PATH` is read-only (A:200), and the report also lists it there.
- The report says R:4347 reads `CODEXL_CLAUDE_CODE_MODEL` "with no `LLMR_` in that expression". The expression reads `agentEnv(runtimeAgent, "MODEL")` first, which is `LLMR_CODEX_MODEL` or `LLMR_ZCODE_MODEL`. What it lacks is `LLMR_CLAUDE_CODE_MODEL`.
- The report says the ZCode workspace name lacks only a writer. `parseCodexBotWorkerOptions` (R:1845) also lacks the `LLMR_ZCODE_WORKSPACE_NAME` read.
- The report keeps `CODEXL_CLAUDE_CODE_MODEL_ENV` in `CLAUDE_CODE_MANAGED_MODEL_ENV_KEYS` as cleanup. That list is also written from: S:489 gives every key in it a blank value in a shared-home settings file. The plan moves the name to a strip-only list.
- The report says 6 source files. There are 7.
- For UL-1 the report gives `service.ts:496` and `:503`. The lines are `:486` and `:504`.

### Wrapper and runtime rewrite trace

The research report asked whether apply always rewrites the wrapper scripts and `llmr-codex-cli-middleware.js` under the config `bin` directory together. At `136ad730` it does not.

- The runtime is one shared file. Four functions write it: `writeClaudeCodeWrapper` (S:1685), `writeCodexCliMiddleware` (S:2692), `writePiWrapper` on Windows only (S:2024), and `ensureBotWorkerRuntime` (L:1572, called at L:1343 and L:1426).
- The first two write one profile's wrapper in the same call. They do not touch any other profile's wrapper.
- `ensureBotWorkerRuntime` writes the runtime and no wrapper.
- The desktop app's startup apply and the management server's startup apply pass `excludeAgents: ["zcode"]` (`packages/electron/src/main/main-app.ts:228`, `packages/core/src/web/management-server.ts:516`). After an upgrade, a Codex or Claude Code profile rewrites the shared runtime while every ZCode wrapper keeps its old text.
- Apply returns before any write when no profile is enabled or no gateway model is available (S:193-198, S:200).

This is what an old wrapper loses under the new runtime. At `136ad730` the wrappers export an `LLMR_` twin for every name except the two workspace names. The new runtime therefore starts the agent and falls back to the default workspace label (`"ZCode"`, `"Claude Code"`, `"Codex"`, or the profile id for the ChatGPT account label). That the label is cosmetic is read from the code, not observed.
