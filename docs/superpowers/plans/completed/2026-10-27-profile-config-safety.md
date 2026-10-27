# Profile Config Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turning an LLMR global profile on and off leaves the user's own agent config files exactly as the user had them, and never restores a file that still points at LLMR.

**Architecture:** The Claude Code profile records the user values it displaces in its existing per-profile `settings-state.json` and puts them back on release. Snapshot restore strips LLMR keys from a candidate instead of trusting any file that has user keys in it. The four copies of the backup helpers collapse into one module that writes atomically and prunes old backups. Pi and Workbuddy `models.json` join the backup-and-restore path the other agents already use. `applyProfileConfig` runs one call at a time inside a process.

**Tech Stack:** TypeScript in `packages/core`, `node:test` with `node:assert/strict`, esbuild test bundles via `node build/test.mjs core`.

**Spec:** `docs/superpowers/specs/completed/2026-10-27-audit-remediation.md` (findings P1 to P7)

## Global Constraints

- Style per `AGENTS.md`: double quotes, semicolons, two-space indent, alphabetized object keys where the file does, `node:` imports first, no comments except a non-obvious why.
- Never run anything against the real `~/.claude`, `~/.codex`, `~/.pi`, `~/.workbuddy` or `~/.llm-router`. Tests use `withScratchRuntimeHome` (`packages/core/test/integration/profiles/profile-service.test.mjs:2123`) or a `mkdtempSync` dir. The compiled test bundle sets `HOME`, `CCR_TEST_HOME` and `CCR_INTERNAL_HOME_DIR` through `build/test-home.mjs`.
- Run one core test file with `node build/test.mjs core && node --test .test-dist/core/test/<unit-or-integration>/<path>.test.js`. Never pass `--scope`.
- File suffixes stay as they are: `.ccr-original`, `.ccr-original-missing`, `.ccr-backup-<iso>`. The spec keeps them out of the rename.
- Keep at most 5 `.ccr-backup-*` files per config file. Never delete `.ccr-original` or `.ccr-original-missing`.
- Commit gate: a Bash `git commit` runs typecheck plus `npm run test:architecture` (about 11 s). `npm run test:core` must pass before the PR opens, because the gate does not run it.

## Review Focus

1. A user who edits `settings.json` while the profile is on, for example adding a permission, then turns it off. Expected: the edit survives and the displaced keys come back. Pinned in Task 1.
2. A profile applied twice before release. Expected: the second apply does not record LLMR's own values as "displaced", so release restores the user's values and not `http://127.0.0.1:3456`. Pinned in Task 1.
3. A user whose original `settings.json` never had `ANTHROPIC_BASE_URL`. Expected: release removes LLMR's value and does not invent one. Pinned in Task 1.
4. A Pi user with no `~/.pi/agent/models.json` before LLMR. Expected: release deletes the file LLMR created rather than leaving LLMR's provider behind. Pinned in Task 4.
5. A crash between writing the temp file and renaming it. Expected: the config file holds the old content in full and no `*.tmp` file is left once the next write runs. Pinned in Task 3.

---

### Task 1: Release puts back the user env keys that apply displaced (P1)

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`applyClaudeCodeProfile` :395, `readClaudeCodeProfileSettingsState` :942, `claudeCodeManagedSettingsScope` :956, `claudeCodeManagedContent` :966, `writeClaudeCodeProfileSettingsState` :974, `restoreInactiveGlobalProfileConfigs` :3500, `stripManagedClaudeCodeSettingsContent` :4039, `withoutManagedClaudeCodeEnv` :4055)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Produces: `settings-state.json` gains `displacedEnv: Record<string, string>`. `readClaudeCodeProfileSettingsState(profile)` and `claudeCodeManagedSettingsScope(profile)` return `{ displacedEnv: Record<string, string>; envKeys: string[]; paths: string[] }`. `stripManagedClaudeCodeSettingsContent(content: string, managedEnvKeys?: string[], managedSettingPaths?: string[], displacedEnv?: Record<string, string>): string | undefined`.

- [ ] **Step 1: Write the failing tests**

Add to `profile-service.test.mjs`, using `withScratchRuntimeHome`, `applyProfileFixture` (:2530) and `restoreGlobalProfileConfigsOnExit([], { manageMarker: true })`. The profile is a global `claude-code` profile with `settingsFile: "~/.claude/settings.json"`.

```js
test("release restores the user's own provider env that apply displaced", async () => {
  // settings.json before apply:
  const original = {
    env: {
      ANTHROPIC_API_KEY: "sk-user-own",
      ANTHROPIC_BASE_URL: "https://corp-proxy.example",
      ANTHROPIC_MODEL: "user-model",
      CLAUDE_CODE_USE_BEDROCK: "1",
      USER_VALUE: "kept"
    },
    permissions: { allow: ["Bash(ls)"] }
  };
  // apply, then release
  assert.deepEqual(readJson(settingsFile), original);
});

test("a second apply does not record LLMR values as displaced", async () => {
  // apply, apply, release
  assert.equal(readJson(settingsFile).env.ANTHROPIC_BASE_URL, "https://corp-proxy.example");
});

test("release keeps a user edit made while the profile was on", async () => {
  // apply, then add permissions.allow "Bash(pwd)" to the live file, then release
  assert.deepEqual(readJson(settingsFile).permissions.allow, ["Bash(ls)", "Bash(pwd)"]);
  assert.equal(readJson(settingsFile).env.ANTHROPIC_API_KEY, "sk-user-own");
});

test("release does not invent a base URL the user never had", async () => {
  // original env is { USER_VALUE: "kept" } only; apply, release
  assert.deepEqual(readJson(settingsFile).env, { USER_VALUE: "kept" });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected: the first three new tests FAIL, with `ANTHROPIC_API_KEY` missing after release. The fourth may already pass.

- [ ] **Step 3: Record displaced values on apply**

In `applyClaudeCodeProfile`, before the delete loop (:457-463) and before `ANTHROPIC_BASE_URL` is overwritten, collect each key from `claudeCodeFirstPartyProviderEnvKeys`, `claudeCodeGatewayEnvKeys` and `isClaudeCodeManagedModelEnvKey` whose current value is a string. Skip a key that already has an entry in the stored `displacedEnv`. Skip a value equal to the gateway endpoint this apply writes. Merge the result into the stored map and pass it to `writeClaudeCodeProfileSettingsState(profile, paths, envKeys, displacedEnv)`. The state file stays `version: 1`, and readers treat a missing `displacedEnv` as `{}`.

- [ ] **Step 4: Re-add displaced values on strip**

`withoutManagedClaudeCodeEnv(env, managedEnvKeys, displacedEnv = {})` adds back every `displacedEnv` key that is absent after filtering. `stripManagedClaudeCodeSettingsContent` passes `displacedEnv` through. `claudeCodeManagedContent(profile)` passes `scope.displacedEnv`. `restoreInactiveGlobalProfileConfigs` builds its Claude matchers with `claudeCodeManagedContent(profile)` per profile, not the bare strip function. After a release that changed the file, write the state with `displacedEnv: {}`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected: PASS, including the existing `assertUserOwnedClaudeSettingsStripped` tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/profiles/service.ts packages/core/test/integration/profiles/profile-service.test.mjs
git commit -m "fix(profiles): restore the Claude Code env keys a global profile displaced"
```

### Task 2: Snapshot restore strips LLMR keys from mixed backups (P2)

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`restoreGlobalConfigFile` :3864, `originalSnapshotCandidate` :3916)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `RestoreManagedContentMatchers` (:3434) and `claudeCodeManagedContent` from Task 1.
- Produces: `originalSnapshotCandidate(file: string, matchers: RestoreManagedContentMatchers): { content: string; file: string } | undefined`.

- [ ] **Step 1: Write the failing test**

```js
test("release after a re-takeover never restores a backup that still points at LLMR", async () => {
  // original settings.json { env: { USER_VALUE: "kept" }, permissions: { allow: ["Bash(ls)"] } }
  // apply, release, delete settings.json, apply, release
  const after = readFileSync(settingsFile, "utf8");
  assert.doesNotMatch(after, /127\.0\.0\.1:3456/);
  assert.doesNotMatch(after, /ccr-claude-code-api-key-/);
  assert.equal(JSON.parse(after).env.USER_VALUE, "kept");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected: FAIL, with the file matching `127.0.0.1:3456`.

- [ ] **Step 3: Implement the stripped candidate rule**

For each candidate, newest backup first and then `.ccr-original`, skip it when `isManagedContent(content)` is true. Otherwise return `stripManagedContent?.(content) ?? content`. `restoreGlobalConfigFile` passes its whole `options` object.

- [ ] **Step 4: Run it and confirm it passes**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/profiles/service.ts packages/core/test/integration/profiles/profile-service.test.mjs
git commit -m "fix(profiles): strip LLMR keys from a snapshot before restoring it"
```

### Task 3: One backup module with atomic writes and pruning (P5, P6)

**Files:**
- Create: `packages/core/src/profiles/backup-files.ts`
- Modify: `packages/core/src/profiles/service.ts` (delete the local `backupFilePath` :3981, `backupFiles` :3942, `ensureOriginalSnapshot` :3955 and their suffix constants :74-75; route `writeFileWithBackup` :3251, `restoreGlobalConfigFile` and `backupCurrentConfigFile` :3935 through the module)
- Modify: `packages/core/src/agents/kilo/profile-config.ts:16-17`, `:143-202`; `packages/core/src/agents/opencode/profile-config.ts:19-20`, `:228-288`; `packages/core/src/agents/zcode/profile-config.ts:27-28`, `:239-290` (delete their copies and import the module)
- Test: `packages/core/test/unit/profiles/backup-files.test.mjs`

**Interfaces:**
- Produces, all exported from `backup-files.ts`:
  - `originalBackupSuffix = ".ccr-original"` and `originalMissingSuffix = ".ccr-original-missing"`.
  - `backupFilePath(file: string): string` gives `<file>.ccr-backup-<iso>`.
  - `backupFiles(file: string): string[]`, oldest first.
  - `ensureOriginalSnapshot(file: string, previous: string | undefined, mode: number | undefined): void`.
  - `pruneBackups(file: string, keep?: number): void`, with `keep` defaulting to 5.
  - `writeFileAtomic(file: string, content: string, options?: { mode?: number }): void`.

- [ ] **Step 1: Write the failing tests**

```js
test("writeFileAtomic replaces the file and leaves no temp file", () => {
  writeFileAtomic(file, "new", { mode: 0o600 });
  assert.equal(readFileSync(file, "utf8"), "new");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".tmp")), []);
});

test("writeFileAtomic keeps the old content when the write fails", () => {
  // make the directory read-only so the temp write throws
  assert.throws(() => writeFileAtomic(file, "new"));
  assert.equal(readFileSync(file, "utf8"), "old");
});

test("pruneBackups keeps the five newest backups and never the originals", () => {
  // seven .ccr-backup-<iso> files with increasing timestamps, plus .ccr-original
  pruneBackups(file);
  assert.deepEqual(backupFiles(file), newestFive);
  assert.ok(existsSync(`${file}.ccr-original`));
});

test("ensureOriginalSnapshot writes once and never refreshes", () => {
  ensureOriginalSnapshot(file, "first", undefined);
  ensureOriginalSnapshot(file, "second", undefined);
  assert.equal(readFileSync(`${file}.ccr-original`, "utf8"), "first");
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/backup-files.test.js`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement the module**

Move the bodies from `service.ts`. `writeFileAtomic` follows the `kimi.ts:~460` pattern: write to `<file>.<pid>.<randomUUID>.tmp` with the mode, then `renameSync` it into place, and remove the temp file in a `catch` before rethrowing. `writeFileWithBackup` calls `pruneBackups(file)` after it writes a backup.

- [ ] **Step 4: Migrate every caller and delete the copies**

Replace each `writeFileSync` on a user config path with `writeFileAtomic`: `writeFileWithBackup`, both writes in `restoreGlobalConfigFile`, and the kilo, opencode and zcode JSON writers. No second copy of these helpers stays in `packages/core/src`. Check with:

Run: `git grep -nE "function (backupFilePath|ensureOriginalSnapshot)" packages/core/src`
Expected: only `packages/core/src/profiles/backup-files.ts`.

- [ ] **Step 5: Run the core suite**

Run: `npm run test:core`
Expected: PASS, including `kilo-profile-config`, `zcode-profile-config` and `profile-service`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/profiles packages/core/src/agents/kilo packages/core/src/agents/opencode packages/core/src/agents/zcode packages/core/test/unit/profiles/backup-files.test.mjs
git commit -m "refactor(profiles): share one backup module that writes atomically and prunes old backups"
```

### Task 4: Pi models.json is backed up and restored (P3)

**Files:**
- Modify: `packages/core/src/agents/pi/profile-config.ts` (`writePiGatewayConfig` :46-71, `writeJsonFileIfChanged` :176-187)
- Modify: `packages/core/src/profiles/service.ts` (`applyPiProfile` :734, `disabledProfileStatus` :3453, `restoreInactiveGlobalProfileConfigs` :3500, `globalProfileTakeoverRecords` :~3690)
- Test: `packages/core/test/unit/agents/pi-profile-config.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `writeFileAtomic`, `ensureOriginalSnapshot`, `backupFilePath` and `pruneBackups` from Task 3.
- Produces: `isManagedPiModelsContent(content: string, providerId: string): boolean`, exported from `pi/profile-config.ts`. It returns true when the parsed `providers` object has exactly one key and that key is `providerId`.

- [ ] **Step 1: Write the failing tests**

```js
test("a global Pi profile restores the user's models.json on release", async () => {
  // ~/.pi/agent/models.json before: { providers: { "my-ollama": { baseUrl: "http://localhost:11434" } } }
  // apply a global pi profile, then disable it and run restoreInactiveGlobalProfileConfigs
  assert.deepEqual(Object.keys(readJson(piModels).providers), ["my-ollama"]);
});

test("a global Pi profile deletes the models.json it created", async () => {
  // no models.json before; apply, disable, restore
  assert.equal(existsSync(piModels), false);
});

test("isManagedPiModelsContent matches only an LLMR-only provider map", () => {
  assert.equal(isManagedPiModelsContent(JSON.stringify({ providers: { "claude-code-router": {} } }), "claude-code-router"), true);
  assert.equal(isManagedPiModelsContent(JSON.stringify({ providers: { "claude-code-router": {}, "my-ollama": {} } }), "claude-code-router"), false);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/pi-profile-config.test.js .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

For global scope only, `writePiGatewayConfig` snapshots and backs up the existing file before writing, the way `agents/kilo/profile-config.ts:143` does. LLMR-owned scopes under `CONFIGDIR/profiles` keep the plain write. `disabledProfileStatus` and `restoreInactiveGlobalProfileConfigs` gain a Pi branch that calls `restoreGlobalConfigFile(piModelsFile, { isManagedContent: (content) => isManagedPiModelsContent(content, providerId) })`. The Pi path joins the takeover records.

- [ ] **Step 4: Run them and confirm they pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/pi packages/core/src/profiles/service.ts packages/core/test/unit/agents/pi-profile-config.test.mjs packages/core/test/integration/profiles/profile-service.test.mjs
git commit -m "fix(profiles): back up and restore Pi models.json for global profiles"
```

### Task 5: Workbuddy models.json is backed up and restored (P4)

**Files:**
- Modify: `packages/core/src/agents/codex/app-launch.ts` (`writeWorkbuddyModelsConfig` :318-331)
- Modify: `packages/core/src/profiles/service.ts` (the Workbuddy branch of `restoreInactiveGlobalProfileConfigs`, which today restores only `config.toml`)
- Test: `packages/core/test/unit/agents/codex-app-model-catalog.test.mjs` (existing Workbuddy coverage near :381, :419, :452), `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: the Task 3 module.
- Produces: `isManagedWorkbuddyModelsContent(content: string): boolean`, exported from `codex/app-launch.ts`. It returns true when the content equals what `writeWorkbuddyModelsConfig` would generate for the LLMR provider, ignoring whitespace.

- [ ] **Step 1: Write the failing test**

```js
test("a global Workbuddy profile restores the user's models.json on release", async () => {
  // ~/.workbuddy/models.json before holds a user model list
  // apply a global workbuddy profile, disable, restore
  assert.deepEqual(readJson(workbuddyModels), userModels);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Route the write through the snapshot, backup and atomic-write helpers. Add `restoreGlobalConfigFile(modelsFile, { isManagedContent: isManagedWorkbuddyModelsContent })` beside the existing `config.toml` restore.

- [ ] **Step 4: Run the core suite**

Run: `npm run test:core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/codex/app-launch.ts packages/core/src/profiles/service.ts packages/core/test
git commit -m "fix(profiles): back up and restore Workbuddy models.json for global profiles"
```

### Task 6: applyProfileConfig runs one call at a time (P7)

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`applyProfileConfig` :148)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Produces: `applyProfileConfig` keeps its exported signature. Calls queue on a module-level promise chain, and a failed call does not block the next one.

- [ ] **Step 1: Write the failing test**

```js
test("concurrent applies land in call order", async () => {
  const first = applyProfileFixture(configWithModel("Provider/one"));
  const second = applyProfileFixture(configWithModel("Provider/two"));
  await Promise.all([first, second]);
  assert.equal(readJson(settingsFile).env.ANTHROPIC_MODEL, "Provider/two");
});

test("a rejected apply does not block the next one", async () => {
  await assert.rejects(applyProfileFixture(configThatThrows()));
  await applyProfileFixture(configWithModel("Provider/two"));
  assert.equal(readJson(settingsFile).env.ANTHROPIC_MODEL, "Provider/two");
});
```

- [ ] **Step 2: Run them and confirm the first fails or flakes**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/profiles/profile-service.test.js`
Expected: the first test FAILS or is order-dependent across 5 runs. If it passes 5 times out of 5, record that in the PR description and keep the change, because the interleave points are the awaits at :155 and :~175.

- [ ] **Step 3: Implement**

Rename the current body to `applyProfileConfigNow`. `applyProfileConfig` chains it on `let applyQueue: Promise<unknown> = Promise.resolve()` with `applyQueue = run.catch(() => undefined)` and returns `run`.

- [ ] **Step 4: Run the core suite**

Run: `npm run test:core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/profiles/service.ts packages/core/test/integration/profiles/profile-service.test.mjs
git commit -m "fix(profiles): serialize applyProfileConfig within a process"
```

### Task 7: Prove the fix against the reproduction and open the PR

**Files:** none changed.

- [ ] **Step 1: Re-run the two audit reproductions against the branch**

In a scratch dir, bundle `packages/core/src/profiles/service.ts` the way the audit did. Run the apply/release cycle and the apply/release/delete/apply/release cycle with `HOME` and `CCR_INTERNAL_HOME_DIR` set to that dir. Refuse to run unless `os.homedir()` is inside it.
Expected: cycle 1 ends with the original env in full. Cycle 2 ends with no `127.0.0.1:3456` and no `apiKeyHelper`.

- [ ] **Step 2: Run every suite**

Run: `npm run typecheck && npm run test:core && npm run test:architecture`
Expected: all PASS.

- [ ] **Step 3: Open the PR**

Title: `fix(profiles): stop global profiles from destroying user agent settings`. The body lists P1 to P7, the reproduction output before and after, and one operator note. Existing mixed backups in `~/.claude` are pruned to 5 on the next write, and Task 2 makes the remaining ones safe to restore.

## Risks

- **Cross-process overlap.** The CLI and the desktop app run `applyProfileConfig` in separate processes, and Task 6 serializes only within one. Lifting `acquireServiceStartLock` (`packages/cli/src/cli.ts:818-858`) into a core `withFileLock` is the follow-up if overlap shows up in practice.
- **Pre-existing state.** A user who already lost keys before this ships gets nothing back automatically. Their values are only in `.ccr-backup-*` files. The PR description says so.
