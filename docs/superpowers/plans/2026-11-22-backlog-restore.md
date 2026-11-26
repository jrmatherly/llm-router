# Backlog: Apply, Restore and the Other Agents Implementation Plan

> **Status, 2026-11-24: fix round done against `main` at `c491eb48`, not yet re-audited.** Every Blocker and Correction of the 2026-11-22 audit was checked against the code. Three were run in a temporary test home (the blocked Codex reconcile of Task 1, the later restore pass of B1, the shared Workbuddy file of Task 4), the rest were read. The text below is corrected for each finding that holds and for the drift since PRs 146 to 155. B2 was overtaken by PR 146. Not verified this round: no task was built, no UI or Playwright test was run, Kilo, Pi and ZCode paths were read only, and the B1 and B3 fixes written into Task 3 are inferred from the code, with the test that proves them in Task 3 Step 2. The changed text still needs its one audit on another model, as the delivery index asks. The audit lives outside the repo.

> **Tasks 1 and 2 are built: PR 167, `8c7ae6ba`, 2026-11-26.** Tasks 3 to 9 are not. The review round changed four things the text below does not say, so read the code for them: the two per-profile loops of `applyProfileConfigNow` skip a switched-off profile whose key was kept; a merged status that carries a copy over appends one sentence naming the copy and not the other status's message; `persistConfig` no longer clears the profile error after a save; and `reconcileProfileApiKeys` logs a failed release itself. The record is in the delivery index under "Before a batch is built".

> **Batch 8 fix round, 2026-11-26, at `main` `41d0016a`.** Tasks 1 and 2 only. Task 1's fault was run again in a temporary test home and is unchanged: `reconcileProfileApiKeys` returns `undefined`, the key is pruned, the token stays in `config.toml`, and the apply returns three not-ok Codex statuses on one path. Every symbol the two tasks name was read again and exists, and the line numbers in both tasks are from this commit. Every caller of the `saveConfig` and `saveApiKeys` RPCs was searched for again: Task 2 Step 7 misses none, and `tests/system/docker-smoke.mjs` reads only the whole value as text. **Audited the same day by building both tasks on another model**, in a worktree cut from that commit: 3 Blockers, 7 Corrections, 6 design findings and 8 extra tests, all applied below. The report, with the full source of every extra test, is outside the repo in `private/audits/2026-11-26-audit-restore-batch8.md`. The session ran the first Blocker again on the audit's build and it held. Built as corrected, every gate passed in the audit, `npm run test:e2e` included. Measured: Task 1 is 49 source lines added and 97 of test, Task 2 is 94 and 127. Not run by anyone: Windows, the desktop app's toast, the `ipc.ts` handlers (typechecked only), and a restore failure of OpenCode, Kilo or Workbuddy.

> **Delivery, 2026-11-25.** [`2026-11-25-delivery-order.md`](2026-11-25-delivery-order.md) groups this plan's unbuilt tasks into batches with other plans' tasks and sets the order. It overrides this plan's lines on branches, on one PR per task, and on waiting for a VM check: the owner's VM pass comes once, at the end.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who switches an agent profile off, or whose restore fails, is told what happened to their files, keeps every setting they wrote themselves, and is never left with an agent that holds a dead key.

**Architecture:** Nine tasks, one commit each, in the order below. The delivery index sets the branches and PRs. Tasks 1 and 2 make a save restore before it prunes a key and hand the statuses to the UI and the CLI. Tasks 3 and 4 correct what a restore does to Claude Code values, to a linked file and to a file two agents share. Tasks 5 to 8 give Workbuddy, OpenCode, Kilo, Pi and ZCode a stripper that follows V-7. Task 9 is a throwaway prototype of the Codex token command and changes no product code.

**Tech Stack:** TypeScript, Electron 45, React, `better-sqlite3`, `node:test` with `node:assert/strict`, Playwright for `tests/e2e/`.

**Spec:** [`docs/superpowers/research/2026-11-22-open-items-validation.md`](../research/2026-11-22-open-items-validation.md). Row ids R-1 to R-14 come from its Findings table. Read each row a task names before you start the task. The standing decisions V-7, V-13, V-16 and V-17 are in [`completed/2026-11-21-v8-clean-vm-fixes.md`](completed/2026-11-21-v8-clean-vm-fixes.md), with the history of the restore code in its Tasks 4a to 4e and Appendices C to E.

**Evidence status.** The research ran the rows marked "run" in the spec in a temporary home through throwaway tests. No fix in this plan was prototyped. The plan author read every symbol named below in `main` at `eb84a3ba` and ran nothing. The fix round of 2026-11-24 re-read every named symbol at `c491eb48` (each one still exists), and line numbers below are from that commit. A claim marked "read" or "inferred" in a task was not executed, and that task's first step is the check that confirms it.

**Order against the research.** The research proposed the status plumbing first and the key rule second. This plan swaps them. Read in the code, a save restores a switched-off profile inside the takeover sync, with the wording of a quit (`restoreGlobalProfileTakeoverRecords` passes `staysDisabled` false), so the status that changed the file lacks the V-16 sentence. Task 1 moves that restore into `reconcileProfileApiKeys`, where it carries the sentence, and Task 2 then has the right status to show.

## Decisions this plan rests on

- **B-2.** Every agent gets a stripper, in the order Workbuddy, OpenCode and Kilo, Pi, ZCode. This widens V-7. Tasks 5 to 8.
- **B-3.** The Codex token command is prototyped first and the owner decides afterwards. Task 9 changes no product code.
- **B-8.** A restore owns a custom-path `.claude.json` by the values rule. Task 3.
- **B-9.** R-2 and R-12 are closed with no change. They have no task.
- **V-7.** A restore removes only what LLM Router wrote. A file is removed only when no original existed and nothing but LLM Router's content is left, and "nothing left" is defined per format. A file someone else edited gets a safety copy with the token blanked before a strip changes it. LLM Router keeps no copy of its own token.
- **V-13.** Profile keys are created and pruned before the gateway starts or updates, so one restart carries the key list. Task 1 keeps this order.
- **V-16.** A restore shows its message where a person asked for it. A quit and a gateway stop show none, the Stop button included. Task 2 says how the UI tells them apart.
- **V-17.** The safety-copy rules also cover a live file the user deleted. Tasks 6 to 8 keep that branch working for their formats.
- **X-2.** Codex supports `[model_providers.<id>.auth]` with `command`, `args`, `cwd`, `timeout_ms` (default 5000) and `refresh_interval_ms` (default 300000). It cannot be combined with `experimental_bearer_token`. Task 9.
- **X-4.** Codex writes through a symlinked `config.toml` and keeps the link. Task 4 follows it for a restore.

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json` and never deletes or migrates `~/.claude/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Never pass `--scope`.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before each PR run `npm run typecheck`, `npm run lint`, `npm run test:architecture` and the package suites the task touches. Task 2 also runs `npm run test:e2e`.
- No test, script or doc names a real provider host or holds a key.
- A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. No task here touches the fork.
- Merging needs the owner's word, once per PR. The delivery index sets which tasks share a branch and which batches may be open together.
- No task waits on a VM check. A check on the real apps is a "VM check, for the end pass" line, run once at the end of the program.
- A restore matcher keeps the `contentForBackup` field PR 146 added (read in `claudeCodeManagedContent` and the sweep's fallback matcher). A Claude Code matcher a task builds or changes passes `claudeCodeSettingsBackupContent` there, so no backup holds the gateway key header.
- The renderer reaches the backend only through `window.llmr` and may import from core only what `.claude/rules/ui.md` lists. `@llmr/core/contracts/*` is on that list.
- A test that changes a directory's mode restores it in a `finally` before the fixture's clean-up runs, and is skipped on Windows and when `process.getuid?.() === 0`.

## What the plans built before this one change

- **Keys plan** (`2026-11-22-backlog-keys.md`), built as PRs 149 to 154. `saveApiKeys` is `(apiKeys: ApiKeyConfig[], base: ApiKeyConfig[]) => Promise<AppConfig>` in `preload.ts`, `electron.d.ts`, `web-client-bridge.ts`, `ipc.ts` and `management-server.ts` (read). Task 2 changes the return type to `Promise<AppSaveResult>` and no parameter. `replacePersistedApiKeys` is gone, and the test fixtures `applyProfileFixture` and `withAppliedDefaultProfiles` write keys with `updatePersistedApiKeys` (read, `profile-service.test.mjs:3843` and `:4075`).
- **Pass-through plan**, PRs 146 and 147. `writeClaudeCodeAutoCompactWindowsCache` now returns early for a `.claude.json` in the home folder through `isClaudeCodeAccountFile` (`packages/core/src/agents/claude-code/environment.ts:55`), and two tests pin it (`a settings file directly in the home folder never creates ~/.claude.json`, `... leaves an existing ~/.claude.json byte for byte`). `withoutManagedClaudeCodeEnv` ends with `withoutClaudeCodeGatewayKeyHeader(next)`, which drops only LLM Router's line from `ANTHROPIC_CUSTOM_HEADERS`. Task 3 keeps both.
- **VM findings plan, Task 7** (built, PR 156). It added `applyTakeoversAfterGatewayReplaced`, another caller of the apply that is not a save. Like Start and Restart, its statuses stay in the log. Task 2 gives it nothing to show.
- **Harness plan** (`2026-11-22-backlog-harness.md`, its Tasks 1 to 4 built as PRs 158 and 159). `assertCodexFilesParse(codexDir, options)` is in `packages/core/test/support/codex-toml.mjs`, and `withAppliedDefaultProfiles` calls it on the Codex directory after the apply and after the run unless a test passes `parseAfter: false`. Each Task 5 test calls it on the Workbuddy directory after the apply and after the restore.
- **Stripper plan** (`completed/2026-11-22-backlog-stripper.md`, built: its last tasks merged as PR 166 on 2026-11-26). It rewrites the Codex line handling in `codex-config-strip.ts`. By its draft it changes `isManagedCodexConfigContent`, `codexManagedContent` (its `stripManagedContent` becomes a snapshot strip), `writeGlobalCodexConfig` (it passes a stripped text to `ensureOriginalSnapshot`), `buildCodexConfigToml` and `readCodexWrittenRecord`, and it does not change `applyCodexProfile`, `restoreDisabledCodexProfile`, `restoreGlobalConfigFileContent` or `restoreInactiveGlobalProfileConfigs`. No task here changes a Codex line-handling function. The table below names every function in `packages/core/src/profiles/service.ts` each task changes. Each task's first step re-reads those functions as that plan left them.

| Task | Functions changed in `service.ts` | New functions in `service.ts` |
|---|---|---|
| 1 | `reconcileProfileApiKeys`, `applyProfileConfigNow`, `recoverGlobalAgentProfile` (owner lookup only) | `releaseDisabledProfileKeys`, `enabledOwnerOfFile` |
| 2 | `applyProfileConfig`, `disabledRestoreStatus`, `restoreDisabledZcodeProfile`, `restoreDisabledCodexProfile`, `applyCodexProfile` (the returned status only) | `mergeProfileStatuses`, `warnProfileApplyFailures` |
| 3 | `claudeCodeDisplacedEnv`, `withoutManagedClaudeCodeEnv`, `withoutGatewayNoProxyHosts`, `isManagedClaudeCodeSettingsContent`, `stripManagedClaudeCodeSettingsContent`, `claudeCodeManagedContent`, `orphanedClaudeCodeManagedContent`, `applyClaudeCodeProfile`, `writeClaudeCodeAutoCompactWindowsCache`, `readClaudeCodeSettingsStateFile`, `writeClaudeCodeSettingsStateFile`, `releaseClaudeCodeSettingsState`, `disabledProfileStatus` (Claude Code branch), the disabled branch of `applyClaudeCodeProfile` | `restoreDisabledClaudeCodeProfile`, `restoreClaudeCodeGlobalConfigCache` |
| 4 | `writeStrippedConfigFile`, `restoreGlobalConfigFileContent` (the one `rmSync(file)`), `restoreSideFile`, `enabledOwnerOfFile`, `applyCodexProfile` (owner lookup), `restoreDisabledCodexProfile` (the `others.some` test), `restoreInactiveGlobalProfileConfigs` (Codex and Workbuddy loops) | `isCodexFamily` |
| 5 | `applyCodexProfile` (`recordsWrittenLines`), `codexManagedContent` (the `agent === "codex"` test), `restoreDisabledCodexProfile`, `restoreInactiveGlobalProfileConfigs` (Workbuddy loop), `restoredConfigMessage` | none |
| 6 | `writeGlobalCodexConfig` (its backup rule is extracted), `applyOpenCodeProfile`, `applyKiloProfile`, `disabledProfileStatus`, `restoreInactiveGlobalProfileConfigs` (OpenCode and Kilo loops), `writeStrippedConfigFile`, `saveNewestUserBackupCopy`, `restoredConfigMessage`, the type `RestoreManagedContentMatchers` | `writeGlobalManagedConfig`, `writeConfigRecord`, `providerJsonManagedContent` |
| 7 | `disabledPiStatus`, `restoreInactiveGlobalProfileConfigs` (Pi loop), `writePiWrapper`, `restoredConfigMessage` | `piManagedContent` |
| 8 | `applyZcodeProfile`, `restoreDisabledZcodeProfile`, `restoreInactiveGlobalProfileConfigs` (ZCode loop), `isManagedZcodeConfigContent`, `restoredConfigMessage` | `zcodeManagedContent` |
| 9 | none | none |

Tasks 5 and 6 are the two that meet the stripper plan's functions. Task 5 changes one condition in `codexManagedContent`. Task 6 moves the backup rule out of `writeGlobalCodexConfig` without changing what it does for Codex.

## Review Focus

Each line names a condition no row's own test covers. The test that pins it sits in the task named at the end of the line.

1. A person changes a setting of an enabled profile while the gateway runs. The takeover sync restores the file and the apply writes it again. The save shows no restore message. Task 2, Step 1, the test `a profile that is applied again in the same save reports as enabled`.
2. The gateway is stopped, an earlier restore failed, and the person switches the profile off. The save applies nothing. The key still works afterwards, and is pruned once the file can be restored. Task 1, Step 1, the test `a save with the gateway stopped keeps the key of a profile it could not restore`.
3. A user has their own `~/.claude/settings.json`, applies a profile, and clicks **Restore original settings**. The file parses to the settings the user wrote. The `#1951` recovery tests in `packages/core/test/unit/web/web-management-server.test.mjs` pin this by deep equality, and Task 3 keeps them green. Task 3, Step 5.
4. A user's own three base URLs were recorded as displaced, and LLM Router then applies a second time. The second apply sees LLM Router's own values in the file and must not overwrite the record with nothing. Task 3, Step 2, the test `a second apply keeps the record of the user's own base URLs`.
5. A user's own OpenCode provider is named `llm-router` and has no LLM Router header. A restore leaves it in place. Task 6, Step 2, the test `a provider of the user's own under LLM Router's id survives a restore`.
6. A restore gives back the user's own Claude Code values, and a later pass over the same file (a save with the profile still off, a quit, a second button press) must not strip them by key name. The run of 2026-11-24 showed it does today. Task 3, Step 2, the test `a later save and a quit leave a restored Claude Code file as the restore left it`.

## Rows this plan closes

| Row | Task |
|---|---|
| R-1 | 2 |
| R-1b | 1 (the status carries the sentence) and 2 (it is shown) |
| R-2 | none, closed by B-9 |
| R-4 | 1 |
| R-6 | 5 for Workbuddy. Generated-scope Codex has no task. Its file is in LLM Router's own folder and the profile's key is pruned (read in the research, not run) |
| R-7 | 4 |
| R-8 | 3 |
| R-9 | 3 for the custom-path `.claude.json`. The Codex app's own data under `~/.codex/.llm-router/` is left alone |
| R-10 | 4 |
| R-11 | 5 (Workbuddy), 6 (OpenCode, Kilo), 7 (Pi), 8 (ZCode) |
| R-12 | none, closed by B-9 |
| R-13 | 9 |
| R-14 | 2 |

**Not in this plan.**
- A failed apply on Start, Restart or a provider model refresh stays in the log. Those handlers return a `GatewayStatus`, and V-16 forbids a message on Stop, which shares that return.
- The safety copies `restoreGlobalConfigFile` saves on its own are still named in no message. Only the two copies the research found in a message get the `copy` field.
- The **Restore original settings** button stays limited to Claude Code and Codex by `isRestorableGlobalProfile` in `packages/core/src/contracts/app.ts`. See "Open with the owner".
- The key of a profile that was deleted from the config is pruned as today, whatever its file holds. Nothing in the config names the file to restore.

---

### Task 1: Restore a switched-off profile before its key is pruned (R-4, the status of R-1b). Built, PR 167

First, because Task 2 shows the status this task produces.

A person switches a profile off and the restore of its config fails. Today the save has already pruned the profile's key, so the agent still points at LLM Router and holds a key that answers 401. After this task the save restores first and keeps the key while the file may still hold it, and the status says so. A profile whose restore worked loses its key as before, and its status carries the V-16 sentence.

`reconcileProfileApiKeys` runs before the gateway starts or updates in every handler (`packages/electron/src/main/ipc.ts`, `packages/core/src/web/management-server.ts`, `packages/electron/src/main/main-app.ts`). A restore needs no gateway. So the restore moves into `reconcileProfileApiKeys` and no handler's order changes, which keeps V-13.

**What today's code does (run 2026-11-24 at `c491eb48`, and again 2026-11-26 at `41d0016a`).** With `~/.codex` at mode `0o500`, `default-codex` applied and then switched off, `reconcileProfileApiKeys` returns `undefined`, prunes `profile:default-codex`, and leaves the token in `config.toml`. The following `applyProfileConfig` returns three not-ok Codex statuses on one path. Today the prune is `pruneInactiveProfileApiKeys` at `service.ts:1027`, called from `reconcileProfileApiKeys` (`:1010`) and from `applyProfileConfigNow` (`:279`, before the takeover sync at `:285`).

**Two effects to state in the PR (read).** The helper takes all profiles, as the prune does today. A launch apply passes `excludeAgents: ["zcode"]` (`main-app.ts`, `management-server.ts`), so after this task that apply also restores a switched-off ZCode profile that still has a key. The launch's own `reconcileProfileApiKeys` call (`main-app.ts:226`, `management-server.ts:591`) does the same before the gateway starts, so it happens even when the gateway then fails to start. The state is narrow: a switched-off profile still has a key only after an earlier restore failed. Name both call sites in the PR. The restore in `applyProfileConfigNow` now runs before the takeover sync, so the sync's own restore of the same file finds it settled.

**Files:**
- Modify: `packages/core/src/profiles/service.ts`
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Produces: `reconcileProfileApiKeys(config: AppConfig): Promise<ProfileClientApplyStatus[]>`. It returned `Promise<void>`. The array holds one status per profile it restored and is empty when it restored none or when `appConfigLoadError(config)` is set. Every caller that ignores the value keeps compiling.
- Produces: `releaseDisabledProfileKeys(config: AppConfig, profiles: ProfileConfig[]): Promise<ProfileClientApplyStatus[]>`, private. It replaces `pruneInactiveProfileApiKeys`, which is deleted. It runs outside the apply queue. `reconcileProfileApiKeys` calls it through `enqueueApply`. `applyProfileConfigNow` already runs inside the queue and calls it directly, in place of its `pruneInactiveProfileApiKeys` call, and the returned statuses are the first entries of `result.clients` on all three of its return paths. The call moves above the three `cleanupInactive*` calls, and those take a list in which a switched-off profile whose key was kept counts as enabled. Without this the cleanup deletes the Claude Code key helper and token file while `settings.json` still names them, so the key the status says was kept reaches no agent (run by the audit and again by the session):

```ts
const released = await releaseDisabledProfileKeys(config, allProfiles);
// A profile whose key was kept may still be pointed at by its agent, so its wrapper and helper files stay too.
const keyIds = new Set(config.APIKEYS.map((apiKey) => apiKey.id));
const holders = allProfiles.map((profile) => !profile.enabled && keyIds.has(profileApiKeyId(profile)) ? { ...profile, enabled: true } : profile);
cleanupInactiveOpenCodeWrappers(holders);
cleanupInactiveKiloWrappers(holders);
cleanupInactiveClaudeCodeGeneratedFiles(holders);
const result: ProfileApplyResult = { appliedAt, clients: released, enabled: profiles.some((profile) => profile.enabled) };
```

  The OpenCode and Kilo half was read, not run. The Restore button has the same order today (`recoverGlobalAgentProfile` cleans up before its restore and keeps the key on a failure). That is older than this plan and is not changed here. State it in the PR.
- Produces: `enabledOwnerOfFile(profile: ProfileConfig, profiles: ProfileConfig[]): ProfileConfig | undefined`, private. It is the lookup `recoverGlobalAgentProfile` does inline today (`service.ts:213`). It returns another profile of the same agent for which `isEnabledGlobalProfile` holds and whose `profilePath` equals this one's.

**The rule `releaseDisabledProfileKeys` encodes.** For each persisted key whose id is `profileApiKeyId(profile)` for a profile in `profiles` that is not enabled:
- When `isGlobalProfile(profile)` and `enabledOwnerOfFile` finds no owner, run `disabledProfileStatus(profile, profiles)` inside a `try` (the text said `config.profile.profiles` until the review of PR 167, and that left Codex's side files when the profile feature was off) and turn a throw into `failedRestoreStatus`.
- Keep the key when that status is not ok, unless the agent is `codex`, the key has a value and `fileMayHold(profilePath(profile), key)` is false. This is the test `recoverGlobalAgentProfile` applies today, moved into one helper that both call.
- For a kept key, append to the status message: ` LLMR kept this profile's API key working, because the agent may still hold it.`
- Prune every other inactive profile key in one `updatePersistedApiKeys` call, as `pruneInactiveProfileApiKeysFromList` does today, with the kept ids left in.
- A key whose profile is not in `profiles` is pruned as today.

- [ ] **Step 1: Write the failing tests**, in `profile-service.test.mjs`, each with `withAppliedDefaultProfiles`. "Switch off" means set the profile's `enabled` to false on the fixture's `config` and call `replacePersistedAppConfig(config)`. A test that sets a mode restores it in a `finally`, as the Global Constraints say.
  - `a save keeps the key of a Codex profile whose config could not be restored`. Apply `default-codex`, `chmodSync(codexDir, 0o500)`, switch off, `const statuses = await reconcileProfileApiKeys(config)`. Assert `statuses.length === 1`, `statuses[0].ok === false`, `statuses[0].client === "codex"`, the message matches `/kept this profile's API key working/`, `(await loadPersistedApiKeys()).some((key) => key.id === "profile:default-codex")` is true, and `readFileSync(codexConfigFile, "utf8").includes(codexToken)`. Then `chmodSync(codexDir, 0o700)`, call it again, and assert the key is gone and `filesHolding(codexDir, codexToken)` is `[]`.
  - `a save prunes the key of a profile it restored, and says how to undo it`. Apply `default-codex`, switch off, reconcile. One status, `ok` true, message ends with `Profile is disabled. Switch it on to undo this. Codex may ask you to log in.` No `profile:default-codex` key remains.
  - `a save keeps the key of a Claude Code profile whose settings could not be restored`. The same with `default-claude-code` and `chmodSync(claudeDir, 0o500)`. Claude Code keeps its key in a helper script, so the file test does not apply and the key stays.
  - `an apply on its own follows the same rule`. The first test with `await applyProfileConfig(config)` in place of the reconcile. The key stays. This pins the call inside `applyProfileConfigNow`.
  - `a save with the gateway stopped keeps the key of a profile it could not restore` (Review Focus 2). Apply `default-codex`, `chmodSync(codexDir, 0o500)`, call `restoreGlobalProfileConfigsOnExit(config.profile.profiles)` so the quit restore fails, switch off, reconcile, and never call `applyProfileConfig`. The key stays. Restore the mode, reconcile, the key is gone.
  - `a profile that was never switched on is not restored by a save`. With only `default-claude-code` applied, `await reconcileProfileApiKeys(config)` returns `[]`.
  - Four tests the audit wrote for behaviour the six above do not pin. Their full source is in the audit report as X1 to X4, with the helpers `switchOff`, `hasKey` and `modeTestSkip` the tests above share. `an apply keeps the helper of a Claude Code profile whose key it kept` fails until the cleanup order in the Interfaces block is built. `a save leaves a file another enabled profile of the agent still manages` pins the owner check. `a save releases the key of a generated-scope profile without a restore status` pins the scope check. `an apply that leaves ZCode out keeps the key of an enabled ZCode profile` pins that the release takes all profiles, not the filtered list.
- [ ] **Step 2: Run them and watch them fail.** `node build/test.mjs core && node --test --test-name-pattern="a save keeps the key|a save prunes the key|an apply on its own|gateway stopped keeps|never switched on" .test-dist/core/test/integration/profiles/profile-service.test.js`. Check that the build exited 0 first, since a failed build leaves a stale `.test-dist`. Add the four audit tests' names to the pattern. Expected (run by the audit): the Codex and Claude Code keeps-the-key tests, the prune test and the never-on test fail on `undefined`, since they read the return value first. `an apply on its own` and the gateway-stopped test fail on a pruned key.
- [ ] **Step 3: Add `enabledOwnerOfFile` and `releaseDisabledProfileKeys`, and change `reconcileProfileApiKeys` and `applyProfileConfigNow`** as the Interfaces block says. `recoverGlobalAgentProfile` uses `enabledOwnerOfFile` for its lookup and the shared key test for its `if`, and is otherwise unchanged. Its own `reconcileProfileApiKeys` call restores a second time and finds nothing to do. Update the existing test `a profile switched off in a save is told how to undo the restore`, which this task breaks (run by the audit): the release now restores the file first, so the profile's own restore and the takeover sync find it gone. Its comment becomes `// The key release restores the file first, so the profile's own restore and the takeover sync find it gone.` and its expected list becomes ``[`Codex config was removed because it did not exist before LLMR.${disabledCodexSentence}`, `Codex config is absent, so LLMR had nothing to restore.${disabledCodexSentence}`, "Codex config is absent, so LLMR had nothing to restore."]``.
- [ ] **Step 4: Run the tests.** The ten pass. Then `npm run test:core`. The `#1951` tests and `tests/e2e/onboarding-chosen-agent.spec.ts`'s 401 check rest on a restored profile losing its key, which still holds.
- [ ] **Step 5: Break it twice.** Make the helper prune every key and confirm the first test fails. Make it keep every key and confirm the second fails. Put both back.
- [ ] **Step 6: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`, `npm run test:electron`. State two limits in the PR. A profile whose original backup is missing has a restore that is never ok, so its key is kept for as long as the backup is missing, and after Task 2 every save shows that error. A Workbuddy key is kept on any failed restore, even when its `config.toml` was settled, because the file test is for Codex only. Two mutants survive every test and are named in the PR: dropping `enqueueApply` around the release in `reconcileProfileApiKeys`, and passing no other profiles to `disabledProfileStatus` in the release. Subject: `fix(profiles): restore a switched-off profile before its key is pruned`

---

### Task 2: Tell the person what an apply or a restore did (R-1, R-1b, R-14). Built, PR 167

After Task 1, whose status this task returns.

A person who switches a profile off through the Profiles page sees what happened to the agent's file and how to undo it. A restore or an apply that failed during a save shows as an error instead of going to a log the desktop app does not keep. One blocked file is reported once. `llmr <profile>` prints a failed apply.

**How the UI tells a save from a stop (V-16).** Only `saveConfig` and `saveApiKeys` return statuses. `stopGateway`, `startGateway`, `restartGateway` and `restartProxy` keep returning a `GatewayStatus` or a proxy status, so the UI receives nothing to show for them, and a quit has no caller at all. The handlers of those four keep logging through `logProfileApplyResult`. Do not call `applyProfile()` after a save. That handler applies without checking that the gateway runs (`appApplyProfile` in `ipc.ts`).

**Files:**
- Modify: `packages/core/src/contracts/app.ts`, `packages/core/src/profiles/service.ts`, `packages/core/src/profiles/launch-service.ts` (`getProfileOpenCommand` `:112`, `openProfileFromLlmr` `:161`), `packages/cli/src/cli.ts` (the `applyProfileConfig` call at `:158`), `packages/electron/src/main/ipc.ts` (`appSaveConfig` `:328`, `appSaveApiKeys` `:385`, `applyProfileIfServiceRunning` `:445`), `packages/core/src/web/management-server.ts` (`saveConfig`, `saveApiKeys` `:496`, `applyProfileIfServiceRunning` `:623`), `packages/electron/src/main/preload.ts`, `packages/ui/src/types/electron.d.ts`, `packages/ui/src/pages/home/App.tsx` (`enqueueConfigSave` `:1119`, `persistApiKeys` `:1131`), `docs/src/content/docs/en/configuration/profiles.md` (the paragraph "The message after a restore", `:226`)
- Create: `packages/ui/src/pages/home/shared/profile-status-notices.ts`
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs`, `packages/ui/test/unit/profile-status-notices.test.ts` (new), `tests/e2e/onboarding-chosen-agent.spec.ts`, `tests/e2e/electron-cdp.spec.ts`, `tests/e2e/recent-issues.spec.ts`
- No edit expected: `packages/ui/src/web-client-bridge.ts`. Its two entries are typed by `ReturnType<LlmrApi[...]>`, and `npm run typecheck` confirms it.

**Interfaces:**
- Consumes: `reconcileProfileApiKeys(config): Promise<ProfileClientApplyStatus[]>` from Task 1.
- Produces, in `contracts/app.ts`: `ProfileClientApplyStatus` gains `changed?: boolean` and `copy?: string`. `changed` is true when this status's restore changed or removed a file. `copy` is the path of a safety copy the message names.
- Produces, in `contracts/app.ts`: `export type AppSaveResult = { config: AppConfig; statuses: ProfileClientApplyStatus[] };`
- Produces: `window.llmr.saveConfig(config: AppConfig, options?: AppSaveConfigOptions): Promise<AppSaveResult>` and `window.llmr.saveApiKeys(apiKeys: ApiKeyConfig[], base: ApiKeyConfig[]): Promise<AppSaveResult>`. The parameters are the ones PR 149 shipped. `persistApiKeys` still reads `base` from `currentDraft.current.APIKEYS` as its first statement, before the queue.
- Changes, in `App.tsx`: `enqueueConfigSave` returns `Promise<AppSaveResult>`. Its two callers (`:888`, `:1092`) do not read the value (read), so they need no change beyond the type.
- `changed` is set only by the restore of a profile's own file (`disabledRestoreStatus`, `restoreDisabledZcodeProfile`, `restoreDisabledCodexProfile`). `inactiveGlobalCleanupStatus`, the sweep's status, does not set it. A save about something else then shows no notice for a profile switched off long before, which is how this task reads V-16's "where a person asked" (inferred). A failed sweep still shows as an error. After Task 1 the profile's own restore runs first in the save, so the profile just switched off still gets its notice.
- Produces, in `service.ts`: `export function mergeProfileStatuses(statuses: ProfileClientApplyStatus[]): ProfileClientApplyStatus[]`. One status per `client` and resolved `path` (`resolveUserPath`, lower-cased on Windows as `uniqueResolvedPaths` does), in first-seen order. Among duplicates it keeps the first that is not ok, else the first with `enabled` true, else the first with `changed` true, else the first. When the kept status has no `copy` and a duplicate has one, the kept status takes that `copy` and that duplicate's message is appended to its own, so an apply that follows a restore in the same save does not hide the safety copy the restore named (the audit's test X6 fails without this). The carry-over rule was proposed by the audit and not built.
- Produces, in `service.ts`: `export function warnProfileApplyFailures(result: Pick<ProfileApplyResult, "clients">, log: (line: string) => void = console.warn): void`. One line per status that is not ok, as `[profile:<client>] <message>`.
- Produces, in `profile-status-notices.ts`: `export function profileStatusNotices(statuses: ProfileClientApplyStatus[]): { errors: string[]; notices: string[] }`. `errors` holds the message of each status that is not ok. `notices` holds the message of each ok status that has a `copy`, or has `enabled` false and `changed` true.

- [ ] **Step 1: Write the failing core tests**, in `profile-service.test.mjs`.
  - `one blocked file is reported once`. Apply `default-codex`, `chmodSync(codexDir, 0o500)`, switch off, `const result = await applyProfileConfig(config)`. `result.clients.filter((status) => status.client === "codex" && !status.ok).length === 1`.
  - `a restore that changed a file says so in its status`. Apply `default-codex`, switch off, `const [status] = await reconcileProfileApiKeys(config)`. `status.changed === true`. A second call returns `[]`.
  - `a disabled profile that was never on reports no change`. With only `default-claude-code` applied, every status of `await applyProfileConfig(config)` with `client === "codex"` has `changed` not true.
  - `a profile that is applied again in the same save reports as enabled` (Review Focus 1). Apply `default-codex`, set the profile's `name` to `"Renamed"` (the takeover record holds `name`, so the sync restores and the loop applies again), apply again. Exactly one status has `client === "codex"`, and its `enabled` is true.
  - `an apply names the copy it kept of a profile table`. No test asserts on that message today (`grep -n "kept the earlier ones"` finds none in the test file). The test that reaches the state is `a profile table the user adds to a Codex config replaces their settings in LLMR's profile file whole, and the earlier ones are kept as a copy` (`profile-service.test.mjs:6083`, read). This adds asserts to that test and no new test: after its `assert.ok(status.message.includes(copies[0]), status.message);` add `assert.ok(existsSync(status.copy), name);` and `assert.ok(status.message.includes(status.copy), status.message);`. The message is built at `service.ts:828`.
  - `a failed apply is written as one line per agent`. `warnProfileApplyFailures({ clients: [{ client: "codex", enabled: true, message: "boom", ok: false, path: "/x" }, { client: "pi", enabled: true, message: "fine", ok: true, path: "/y" }] }, (line) => lines.push(line))` leaves `lines` equal to `["[profile:codex] boom"]`.
  - Three tests the audit wrote, source in the audit report as X5 to X7, with `mergeProfileStatuses` added to the import on line 17. `a later save of a profile switched off long ago reports no change`. `a merged status keeps the copy another pass over the file named`. `a merged status keeps a failure that a later pass reports`.
- [ ] **Step 2: Write the failing UI test**, `packages/ui/test/unit/profile-status-notices.test.ts`, one test named `a save shows failures, kept copies and restores of profiles just switched off`:

```ts
const status = { client: "codex", enabled: false, message: "m", ok: true, path: "/x" } as const;
assert.deepEqual(profileStatusNotices([
  { ...status, message: "failed", ok: false },
  { ...status, changed: true, message: "restored" },
  { ...status, message: "never on" },
  { ...status, copy: "/copy", enabled: true, message: "copy kept" },
  { ...status, enabled: true, message: "applied" }
]), { errors: ["failed"], notices: ["restored", "copy kept"] });
```

- [ ] **Step 3: Run both and watch them fail.** `node build/test.mjs core && node --test --test-name-pattern="reported once|says so in its status|never on reports|applied again in the same save|names the copy|one line per agent" .test-dist/core/test/integration/profiles/profile-service.test.js` and `node build/test.mjs ui && node --test .test-dist/ui/test/unit/profile-status-notices.test.js`. In the core pattern, `names the copy` becomes `kept as a copy`. Expected (run by the audit): both builds exit 1 on the missing exports, so no test runs, and a `.test-dist` left by a failed build must not be run. To watch the core tests fail one by one, first add `mergeProfileStatuses` and `warnProfileApplyFailures` as stubs (`return statuses;` and an empty body). Then `one blocked file is reported once` finds four statuses, since Task 1 added the release's.
- [ ] **Step 4: Fill the fields in core.** `disabledRestoreStatus` and `restoreDisabledZcodeProfile` set `changed` from the restore result. `inactiveGlobalCleanupStatus` does not (see Interfaces). `restoreDisabledCodexProfile` sets `copy` when `restoreCodexSideFiles` returns one and `changed: true` when it returned a profile table. `applyCodexProfile` sets `copy` to `separateProfileResult?.copy`. `applyProfileConfig` passes the result's `clients` through `mergeProfileStatuses` before it returns. The merge breaks two existing tests (run by the audit). In `a profile switched off in a save is told how to undo the restore` the expected list becomes ``[`Codex config was removed because it did not exist before LLMR.${disabledCodexSentence}`]`` with the comment `// The key release restores the file first, and the later passes over it merge into its status.` In `a disabled Codex profile with a reserved provider id beside the enabled one is not refused` the two asserts become `assert.equal(codex.length, 1);` and `assert.deepEqual(codex.map((client) => client.ok), [true], ...)` with the comment `// Both profiles name one file, so their statuses merge, and a refusal of either would be the one kept.` Add `warnProfileApplyFailures` and call it after the apply in `cli.ts` and in `getProfileOpenCommand`, and in place of the loop in `openProfileFromLlmr`.
- [ ] **Step 5: Return the statuses from the four handlers.** In both files `applyProfileIfServiceRunning` returns `Promise<ProfileApplyResult | undefined>` and still logs. `saveConfig` keeps the array `reconcileProfileApiKeys` returned and ends with `return { config: savedConfig, statuses: mergeProfileStatuses([...released, ...(applied?.clients ?? [])]) };`. With `options.applyProfile === false` it returns `statuses: []`. `saveApiKeys` does the same with its own two calls, and in both files its `applyProfileConfig` call becomes `applyProfileIfServiceRunning(nextConfig, gatewayService.getStatus())`, read after `updateConfig`. That is option (a) of question 1 under "Open with the owner", built as the default on 2026-11-26: a key change with the gateway stopped no longer takes the agents over. Pin it in `web-management-server.test.mjs` with a test named `the saveApiKeys RPC leaves the agents alone while the gateway is stopped`: start the server with `startGateway: false` as the test beside it does, enable `default-codex` in the stored config with a provider that has a model, call the RPC, and assert that the test home's `.codex/config.toml` does not exist and that `statuses` holds no status with `enabled` true. It also sets `config.profile.enabled = true`, mocks `start` and `updateConfig` as the test beside it does, and in a `finally` removes `.codex` and puts back the stored providers and profiles. The source as the audit built it is in the audit report. Watch it fail before the change with `node build/test.mjs core && node --test --test-name-pattern="leaves the agents alone" .test-dist/core/test/unit/web/web-management-server.test.js`, expected: `.codex/config.toml` exists. Add the audit's X8 beside it, `the saveApiKeys RPC applies the agents and returns their statuses while the gateway runs`, which is the only test that fails when the handler stops applying at all. Change nothing else in the handlers, and leave `appApplyProfile` as it is.
- [ ] **Step 6: Use them in the renderer.** `preload.ts` and `electron.d.ts` take the new return type. In `App.tsx` the commit callbacks of `enqueueConfigSave` and `persistApiKeys` read `saved.config` where they read `saved`. After the commit, `profileStatusNotices(saved.statuses)` feeds `setProfileActionError(errors.join(" "))` when `errors` is not empty and `showToast(notices.join(" "))` when `notices` is not empty. Those are the two calls `recoverGlobalProfile` in `App.tsx` already uses for the Restore button.
- [ ] **Step 7: Fix the readers of the old return value.** In `web-management-server.test.mjs` (read at `41d0016a`): line 329 keeps the `saveConfig` response as `saved`, and lines 331, 338 and 347 read `saved.value` as the config. Line 349 assigns `.value` to `current`. Line 1034 assigns `.value` to `saved`, and line 1037 passes that `saved` back into `saveConfig`. Each becomes `.value.config`. In the test `the saveApiKeys RPC applies only the caller's changes` (`:1046`), line 1058 assigns `.value` to `saved`, and lines 1059 and 1074 read `saved.APIKEYS`. That `.value` becomes `.value.config`. `tests/e2e/electron-cdp.spec.ts`: `result.saved?.profile.profiles` becomes `result.saved?.config.profile.profiles`, four times (`:207-210`). `tests/e2e/recent-issues.spec.ts`: `const saved = (await peerSave.json()).value` (`:21`) becomes `.value.config`. The other e2e callers of `saveConfig` (`claude-login-profile.spec.ts`, `local-agent-login-import.spec.ts`, `provider-edit.spec.ts`) ignore the value (read).
- [ ] **Step 8: Pin it end to end.** In `tests/e2e/onboarding-chosen-agent.spec.ts`, `saveProfilesEnabled` returns what `saveConfig` returned. Where the spec switches every profile off, assert that `statuses` holds exactly one status with `client === "claude-code"` and that its message matches `/Switch it on to undo this/`. Add one case that switches the Claude Code profile off with the switch on the Profiles page. As the audit built it: enable Claude Code again with `saveProfilesEnabled` and wait for `apiKeyHelper` in `settings.json`, call `await page.evaluate(() => window.llmr!.setOnboardingFinished?.())` and reload, since a reload alone leaves the app in onboarding and the case times out, then click `page.getByRole("button", { exact: true, name: "Agent Profiles" })` and `page.getByRole("switch", { exact: true, name: "Enabled" })`, and expect `page.getByText(/Switch it on to undo this/)` to be visible. The spec needs `import type { AppSaveResult } from "@llmr/core/contracts/app";`.
- [ ] **Step 9: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`, `npm run test:ui`, `npm run test:electron`, `npm run test:cli`, `npm run test:e2e`, then `git checkout -- packages/core/models.json packages/ui/src/generated`. Expected: all pass.
- [ ] **Step 10: Update the user docs.** In `profiles.md`, the paragraph at `:226` says what the message after a restore says. Add one sentence. Switching a System default profile off on the Profiles page shows the same message, and a failed restore shows as an error there.
- [ ] **Step 11: State the limits in the PR and commit.** The toast shows for 1800 ms, the time `showToast` gives every message (`App.tsx:938`), which is short for a message that names a path. `setProfileActionError` renders on the Profiles page, so a failure from a save made on another page shows only there. A failed apply on Start, Restart, a model refresh and the adopted-gateway apply of VM findings Task 7 is still only logged. A save sets the Profiles page error and never clears it, so an error stays there after a later save that worked. A save that removes the last provider model makes the takeover sync restore every enabled profile's file, and each shows as a notice with the wording of a quit and no undo sentence (read by the audit, not run). Two different failures on one file show the first message only. Four mutants survive every unit test and are named in the PR: `client` dropped from the merge key, `changed` dropped in `restoreDisabledZcodeProfile`, `changed` dropped for a returned profile table in `restoreDisabledCodexProfile`, and the released statuses dropped from `saveConfig`'s result. Subject: `feat(profiles): show what a save did to an agent's config`
- VM check, for the end pass: in the desktop app, switch a System default Codex profile off on the Profiles page and read the toast.

---

### Task 3: Remove a Claude Code value only while it is the one LLM Router wrote (R-8, R-9)

Independent of Tasks 1 and 2. Third, because it has the most ways to lose a user's settings and should not share a release with Tasks 5 to 8.

A user's own `NO_PROXY` hosts and their own `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT` survive a restore. A user who had set all three base URLs to one address of their own gets them back, and their restore no longer fails. A quit restore gives back the original and its message is true. With a custom settings path, a restore removes what LLM Router added to `.claude.json` and the copies it made of that file.

**What is wrong today (run by the research, read by the plan author).**
- `withoutManagedClaudeCodeEnv` drops both `NO_PROXY` keys and the compatibility key by name and every local host by name.
- `claudeCodeDisplacedEnv` takes any env whose three gateway keys are alike for a takeover and records nothing as displaced.
- `isManagedClaudeCodeSettingsContent` calls a file managed when the three gateway keys are strings, whatever they hold, so the user's original with their own three URLs is refused as a snapshot.
- `originalSnapshotCandidate` strips the snapshot it accepts, so a quit strips the original by key name and then reports `Claude Code config was restored to what it was before LLMR.`
- `writeClaudeCodeAutoCompactWindowsCache` writes `autoCompactWindowsCache` into `<config dir>/.claude.json` through `writeFileWithBackup`, and no restore touches that file or its copies. Since PR 146 it skips a `.claude.json` in the home folder (`isClaudeCodeAccountFile`, `service.ts:2412`), so a settings file directly in the home folder no longer makes it write `~/.claude.json` (read, and pinned by two tests at `profile-service.test.mjs:639` and `:648`).
- A restore that finishes leaves `settings.json.llmr-original` and the backups beside the file (`restoreGlobalConfigFileContent`, the strip branch at `service.ts:3868-3873` and the snapshot branch at `:3894-3897`). `restoreDisabledGlobalProfile` then calls `onReleased` (`:3164-3166`), and `releaseClaudeCodeSettingsState` empties `endpoints` and `displacedEnv` (`:1172-1177`). Every later pass on the file sees `hasTakeoverSnapshot` true and strips with nothing on record, by key name. Run on 2026-11-24: after a button restore, the user's own `{ env: { NO_PROXY: "localhost,corp.internal", no_proxy: "127.0.0.1", CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: "0" }, permissions }` written back was stripped by the next `restoreInactiveGlobalProfileConfigs` to `{ env: { NO_PROXY: "corp.internal" }, permissions }`. Later passes come from the takeover sync of every save, the profile's own disabled branch, the sweep, Task 1's reconcile, the button's second reconcile and the quit.

**The rule.** "On record" means the profile's `settings-state.json` holds at least one endpoint. With nothing on record every function below behaves as it does today, because fixtures such as `userOwnedClaudeSettingsWithGatewayTakeover` plant a takeover with no state file and must keep passing.

**The record outlives the restore.** `releaseClaudeCodeSettingsState` clears `endpoints` and `displacedEnv` only when `hasTakeoverSnapshot(state.settingsFile)` is false, that is when no `.llmr-original`, marker or backup of the file is left. While a snapshot is there, every later pass strips by value on record, which leaves a restored file as it is (inferred from the rules below, proved by the test of Review Focus 6). This keeps V-7: the state file holds endpoints and the user's displaced values, never a token, and no backup is deleted to get there. The three readers of `hasClaudeCodeTakeoverState` (`releaseClaudeCodeSettingsState`, `orphanedClaudeCodeManagedContent`, the `liveOwner` lookup of the sweep at `:3358`) then pick the matchers that carry the record, which is the point.

**Files:**
- Modify: `packages/core/src/profiles/service.ts`
- Modify: `docs/src/content/docs/en/configuration/profiles.md` (the Claude Code bullet of "Restore original settings", `:221`, says three alike base URLs are read as LLM Router's)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs` (run only)

**Interfaces:**
- `claudeCodeDisplacedEnv(currentSettings: Record<string, unknown>, stored: Pick<ClaudeCodeProfileSettingsState, "displacedEnv" | "endpoints">, endpoint: string): Record<string, string>`. The first parameter was the `env` value (`currentSettings.env` at its one call, `service.ts:532`). The env counts as a takeover, and `stored.displacedEnv` is returned, only when one of `claudeCodeGatewayEnvKeys` holds a recorded endpoint, or the three are alike and the settings also carry `isManagedClaudeCodeApiKeyHelper(currentSettings.apiKeyHelper)` or `env.ANTHROPIC_FEDERATION_RULE_ID === claudeCodeWifFederationRuleId`. Otherwise the env is the user's. What is recorded then also includes both `claudeCodeNoProxyEnvKeys` and `claudeCodeGatewayCompatibilityEnvKeys`.
- `withoutManagedClaudeCodeEnv(env, managedEnvKeys, displacedEnv, endpoints)` keeps its signature. On record:
  - a gateway key is removed only while its value is a recorded endpoint;
  - the compatibility key is removed only while its value is `"1"`;
  - from each `NO_PROXY` key it removes only the hosts LLM Router added, which are `gatewayLocalNoProxyHosts` and the bracket-stripped hostname of each recorded endpoint, less the hosts in `displacedEnv` under that key. The key is dropped when nothing remains;
  - `displacedEnv` is merged under the result as today, so a value LLM Router overwrote comes back.
  - the `withoutClaudeCodeGatewayKeyHeader(next)` call PR 146 added stays, so the user's own `ANTHROPIC_CUSTOM_HEADERS` lines survive and only the gateway key line goes.
  - `managedEnvKeys` is the profile's own env keys (`envKeys` in the state, written from `managedProfileEnvKeys` at `service.ts:608`), not the gateway, `NO_PROXY` or compatibility keys, so its filter does not undo the value rules above (read).
- `isManagedClaudeCodeSettingsContent(content: string, managedSettingPaths: string[] = [], endpoints: string[] = []): boolean`. On record, the file is managed only when it carries LLM Router's helper path or one of the three gateway keys holds a recorded endpoint. `claudeCodeManagedContent` and `orphanedClaudeCodeManagedContent` pass their endpoints. The bare matcher in `restoreInactiveGlobalProfileConfigs` and `syncClaudeCodeManagedGatewaySettingsFile` pass none and are unchanged.
- `stripManagedClaudeCodeSettingsContent` removes an `env` that it emptied itself. An `env` that was already empty stays, so a file with nothing of LLM Router's still returns `undefined`.
- `claudeCodeTakeoverContent` is unchanged. It still takes three alike gateway keys for a takeover copy when no original existed, which Task 4e of the v8 plan states as a limit and its test `a takeover copy from before a port change is not restored` relies on.
- `ClaudeCodeProfileSettingsState` gains `globalConfigCacheSha256?: string`, the SHA-256 of `JSON.stringify` of the `autoCompactWindowsCache` value LLM Router last wrote. `readClaudeCodeSettingsStateFile` and `writeClaudeCodeSettingsStateFile` carry it. `releaseClaudeCodeSettingsState` leaves it alone. The cache restore clears it.
- `releaseClaudeCodeSettingsState(file)` keeps its signature and follows "The record outlives the restore" above.
- Produces: `restoreDisabledClaudeCodeProfile(profile: ProfileConfig, staysDisabled = true): ProfileClientApplyStatus`, private. It replaces the call both the disabled branch of `applyClaudeCodeProfile` (`service.ts:507`) and the Claude Code branch of `disabledProfileStatus` (`:3296`) make today. It reads `globalConfigCacheSha256` from the state file first, then calls `restoreDisabledGlobalProfile` as today, then calls `restoreClaudeCodeGlobalConfigCache` with the hash it read when the status is ok. The hash is read first because `restoreDisabledGlobalProfile` runs `onReleased` before it returns (`:3164-3166`).
- Produces: `restoreClaudeCodeGlobalConfigCache(profile: ProfileConfig, settingsFile: string, recordedSha256: string | undefined): void`, private, for `globalFile = <dir of settingsFile>/.claude.json`.
  - It returns at once when `claudeCodeHomeEnv(profile, settingsFile)` names no config directory (which covers `~/.claude`, through `claudeCodeConfigDir`), or when `isClaudeCodeAccountFile(globalFile)` is true (the home folder, the same guard the writer uses).
  - It removes `autoCompactWindowsCache` only while the SHA-256 of its value equals `recordedSha256`. When `.claude.json.llmr-original` holds that key, its value is put back.
  - It removes the file only when `.claude.json.llmr-original-missing` exists and the object is then empty.
  - It then removes `.claude.json.llmr-original`, the marker and every `backupFiles` entry of the file, and clears `globalConfigCacheSha256` in the state. It never writes one of them back, because the live file holds the user's current account.

- [ ] **Step 1: Confirm the six claims above** by reading each named function at today's `main`. They held at `c491eb48`. If the stripper plan changed one of them since, the code wins and this task's Interfaces change with it.
- [ ] **Step 2: Write the failing tests**, in `profile-service.test.mjs`, beside `restoring a Claude Code settings file the user edited keeps a copy of it`. Each uses `withAppliedDefaultProfiles(["default-claude-code"], run, beforeApply)`. Each `beforeApply` starts with `mkdirSync(claudeDir, { recursive: true })` and writes `settings.json` as `${JSON.stringify(user)}\n`. The fixture hands `run` the `claudeDir`, not the file, so each test sets `settingsFile = path.join(claudeDir, "settings.json")`. Each ends with `assert.deepEqual(JSON.parse(readFileSync(settingsFile, "utf8")), expected)`. The restore the tests name is the button (`recoverGlobalAgentProfile("default-claude-code")`) unless the test says otherwise.

```js
const userProxyEnv = { CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: "0", NO_PROXY: "localhost,corp.internal", no_proxy: "127.0.0.1" };
const corpUrl = "https://corp-gateway.example.test";
const userBaseUrls = { ANTHROPIC_API_BASE_URL: corpUrl, ANTHROPIC_BASE_URL: corpUrl, CLAUDE_AGENT_API_BASE_URL: corpUrl };
```

  - `a restore gives back the user's own NO_PROXY hosts and compatibility value`. `user = { env: userProxyEnv }`. Recover with `recoverGlobalAgentProfile("default-claude-code")`. `result.status.ok` is true and `expected = user`.
  - `a quit gives back the user's own NO_PROXY hosts and compatibility value`. The same `user`, restored with `restoreGlobalProfileConfigsOnExit(config.profile.profiles)`. Every status is ok and `expected = user`.
  - `a restore of settings the user edited keeps their NO_PROXY hosts and a host they added`. `user = { env: userProxyEnv }`. After the apply, rewrite the live file with `permissions: { allow: ["Bash(ls)"] }` added and `,added.example` appended to its `env.NO_PROXY`. Recover. `expected = { env: { ...userProxyEnv, NO_PROXY: "localhost,corp.internal,added.example" }, permissions: { allow: ["Bash(ls)"] } }`.
  - `a restore gives back three base URLs the user had set alike`. `user = { env: userBaseUrls }`. Recover. `result.status.ok` is true, `expected = user`, and `loadPersistedApiKeys()` holds no `profile:default-claude-code`.
  - `a restore gives back the user's own base URLs beside their other settings`. `user = { env: userBaseUrls, permissions: { allow: ["Bash(ls)"] } }`. Recover. `expected = user`.
  - `a second apply keeps the record of the user's own base URLs` (Review Focus 4). The previous test, with a second apply before the recover: `config.Providers[0].models.push("model-2")`, set the profile's `model` to `"Provider/model-2"`, `await applyProfileConfig(config)`, `await replacePersistedAppConfig(config)`. `expected = user`.
  - `a restore leaves no empty env in a file that had none`. `user = { permissions: { allow: ["Bash(ls)"] } }`. Recover. `expected = user`.
  - `a save that switches Claude Code off gives back the user's own NO_PROXY hosts`. `user = { env: userProxyEnv, permissions: { allow: ["Bash(ls)"] } }`. Switch the profile off on the fixture's `config`, `replacePersistedAppConfig(config)`, `await applyProfileConfig(config)`. `expected = user`. This runs the takeover sync, the disabled branch and the sweep in one save.
  - `a later save and a quit leave a restored Claude Code file as the restore left it` (Review Focus 6). The previous test, then `await applyProfileConfig(config)` again with the profile still off, deep-equal, then `restoreGlobalProfileConfigsOnExit(config.profile.profiles)`, deep-equal, then `recoverGlobalAgentProfile("default-claude-code")`, deep-equal. Each time `expected = user`.
  - Change the last assertion of `a stale marker beside an old clean backup still restores the user's newest Claude Code settings` to `{ env: { ANTHROPIC_DEFAULT_OPUS_MODEL: "my-opus", NO_PROXY: "localhost,corp.internal" } }`. Task 4e of the v8 plan left `localhost` out and named this row as the reason.
- [ ] **Step 3: Write the failing `.claude.json` tests**, in the same file. They need a custom settings path, so they build their fixture with `defaultHomeClaudeFixture("custom-path-claude", { settingsFile })` and `applyProfileFixture(config)`, where `settingsFile = path.join(root, "work-claude", "settings.json")` and `root` is an `mkdtempSync` directory removed in a `finally`. The restore is `await applyProfileConfig({ ...config, profile: { ...config.profile, profiles: [{ ...profile, enabled: false }] } })`. `globalFile` is `path.join(root, "work-claude", ".claude.json")`. Each carries `{ skip: !process.env.LLMR_INTERNAL_HOME_DIR }`.
  - `a restore takes its cache out of a custom-path .claude.json and keeps the account`. Before the apply write `globalFile` as `{"oauthAccount":{"emailAddress":"user@example.test"}}`. After the apply assert it has the key `autoCompactWindowsCache`. After the restore it parses to `{ oauthAccount: { emailAddress: "user@example.test" } }`, and `readdirSync(path.dirname(globalFile)).filter((name) => name.startsWith(".claude.json.llmr"))` is `[]`.
  - `a restore removes a custom-path .claude.json that LLM Router created`. No file before the apply. After the restore `existsSync(globalFile)` is false and the same `readdirSync` filter is `[]`.
  - `a restore keeps a cache value Claude Code wrote itself`. After the apply, rewrite `globalFile` with `autoCompactWindowsCache: { mine: 1 }`. After the restore that key still deep-equals `{ mine: 1 }`.
  - `a restore leaves the copies beside a home-folder .claude.json alone`. In the runner's home `HOME` equals `LLMR_INTERNAL_HOME_DIR` (`build/test-home.mjs`), so a `~/.claude` settings file never reaches the guard, and the existing test `a default-home Claude Code profile leaves ~/.claude.json and ~/.claude/.claude.json byte-identical through apply and disable` (`:588`) already covers that path. This test drives the account-file guard instead. Use `defaultHomeClaudeFixture("home-settings-copies", { settingsFile: "~/settings.json" })`. Before the apply write `path.join(home, ".claude.json")` as `{"autoCompactWindowsCache":{"mine":1},"oauthAccount":{}}\n`, and plant `.claude.json.llmr-original`, `.claude.json.llmr-original-missing` and `.claude.json.llmr-backup-2026-01-01T00-00-00-000Z` beside it. Apply with `applyProfileFixture(config)`, switch off, apply again. The `.claude.json` text is unchanged and the three planted files still exist. Clean up with the existing `removeHomeSettingsFixture(home)` in a `finally`.
- [ ] **Step 4: Run them and watch them fail.** `node build/test.mjs core && node --test --test-name-pattern="NO_PROXY hosts|base URLs|no empty env|stale marker beside|later save and a quit|\.claude\.json|cache value Claude Code" .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected failures, as the audit ran them on `eb84a3ba` (the functions on these paths are unchanged since except for the header line of PR 146, read). The first two leave `{ NO_PROXY: "corp.internal" }`. The third leaves `{ NO_PROXY: "corp.internal,added.example" }` with the permissions. The fourth returns a status that is not ok. The fifth and sixth leave `env: {}`. The seventh leaves `env: {}` beside the permissions. The changed stale-marker test lacks `localhost`. The two save tests leave `{ NO_PROXY: "corp.internal" }`. The first three `.claude.json` tests find the key or the copies. The home-folder test passes today and is there to fail under a wrong build.
- [ ] **Step 5: Change the functions** as the Interfaces block says. `applyClaudeCodeProfile` passes `currentSettings` to `claudeCodeDisplacedEnv` and the SHA-256 of what `writeClaudeCodeAutoCompactWindowsCache` wrote into the state it saves. Then run `npm run test:core`. Expected: PASS, with the three `#1951` tests in `web-management-server.test.mjs` among them (Review Focus 3). If a test that plants a takeover by hand fails, the "nothing on record" fallback is wrong, not the test.
- [ ] **Step 6: Break it four times.** Remove both `NO_PROXY` keys by name again and confirm the first test fails. Treat three alike keys as a takeover in `claudeCodeDisplacedEnv` again and confirm the fifth fails. Drop the endpoint test from `isManagedClaudeCodeSettingsContent` and confirm the fourth fails. Remove the `isClaudeCodeAccountFile` guard from `restoreClaudeCodeGlobalConfigCache` and confirm the home-folder test fails. Then make `releaseClaudeCodeSettingsState` clear the record as before and confirm the Review Focus 6 test fails. Put all five back.
- [ ] **Step 7: Update the user docs.** The Claude Code bullet of `profiles.md` (`:221`) says a base URL comes back "unless all three ... held the same value, which LLMR reads as its own". Say instead that LLMR removes a base URL only while it holds LLMR's own address, and that your own `NO_PROXY` hosts and `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT` come back.
- [ ] **Step 8: Run the gates, state the limits in the PR, and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `npm run test:core`. Limits. A user whose own three base URLs are alike, with a stale `.llmr-original-missing` marker and no original, is still taken for a takeover copy. A state file from before this task whose record was already released strips by key name once more, which no consumer has. A host the user removed from `NO_PROXY` during the takeover stays removed. A kept record still holds the user's displaced values, so a user who deletes their env block after a restore gets those values back at the next restore, as `claudeCodeDisplacedEnv` already does for a deleted block (`service.ts:1102-1103`). Subject: `fix(profiles): remove a Claude Code value only while it is the one LLMR wrote`

---

### Task 4: Leave a user's link in place, and leave a file two agents share to the one still enabled (R-7, R-10)

After Task 1, whose `enabledOwnerOfFile` this task widens. Small, and before Task 5 makes Workbuddy use the Codex restore.

A user whose agent config is a link into a dotfiles folder, with the target not yet there, keeps the link after a restore, and the file LLM Router created behind it is gone with its token. A Codex restore no longer removes a `config.toml` that an enabled Workbuddy profile on the same directory still uses.

**Evidence.** R-7 and the `recoverGlobalAgentProfile` case of R-10 were run by the research. That the sweep in `restoreInactiveGlobalProfileConfigs` also restores a file an enabled profile of the other agent owns was run on 2026-11-24. With `default-codex` and a Workbuddy profile on one `~/.codex`, a save that switches Codex off left `config.toml` as `model = "gpt-5-codex"\n` while Workbuddy was still enabled. The Workbuddy loop (`service.ts:3401-3420`) restores a file by its Codex provider table with no strip, so the same harm runs the other way when Workbuddy is switched off and Codex stays on (read).

**Files:**
- Modify: `packages/core/src/profiles/backup-files.ts`, `packages/core/src/profiles/service.ts`, `docs/src/content/docs/en/configuration/profiles.md` (the sentence at `:226` that only another profile "of the same agent" keeps a shared file)
- Test: `packages/core/test/unit/profiles/backup-files.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Produces, in `backup-files.ts`: `export function removeFileKeepingLink(file: string): void`. It removes `resolveWriteTarget(file)` with `rmSync(…, { force: true })`. For a path that is no link that is the path itself. `resolveWriteTarget` stays private.
- Produces, in `service.ts`: `isCodexFamily(agent: ProfileClientKind): boolean`, true for `codex` and `workbuddy`.
- Changes: `enabledOwnerOfFile` matches another profile when the agents are equal or both are of the Codex family.

- [ ] **Step 1: Write the failing tests.**
  - Unit, `backup-files.test.mjs`, with the file's `posixOnly` option: `removeFileKeepingLink removes the target and keeps the link`. Make `link` point at `target`, write through `writeFileAtomic(link, "x")`, call it. `lstatSync(link).isSymbolicLink()` is true and `existsSync(target)` is false. A second test: for a plain file it removes the file.
  - Integration, `{ skip: process.platform === "win32" || !process.env.LLMR_INTERNAL_HOME_DIR }`: `a restore of a config behind a dangling link removes the file LLM Router created and keeps the link`. In `beforeApply` of `withAppliedDefaultProfiles(["default-codex", "default-claude-code"], …)`, create `dotfiles = path.join(process.env.LLMR_INTERNAL_HOME_DIR, "dotfiles")` and the two agent directories, and link `config.toml` to `dotfiles/codex-config.toml` and `settings.json` to `dotfiles/claude-settings.json`, neither of which exists. After the apply assert that `dotfiles/codex-config.toml` contains `codexToken`. Recover both profiles. Both paths are still links, neither target exists, and `filesHolding(dotfiles, codexToken)` is `[]`. Remove `dotfiles` in a `finally`.
  - Integration: `a link whose target exists keeps both after a restore`. The same with both targets written first, as `model_provider = "openai"\n` and `{"permissions":{"allow":["Bash(ls)"]}}\n`. After the recovers both are links and each target's text is what was written. This passes today and must keep passing.
  - Integration: `a Codex restore leaves a config that an enabled Workbuddy profile shares`. With `withAppliedDefaultProfiles(["default-codex"], …)`, push `globalWorkbuddyProfile(codexDir)` onto `config.profile.profiles`, apply, `replacePersistedAppConfig(config)`. `const result = await recoverGlobalAgentProfile("default-codex")`. `result.status.message` matches `/still manages/` and `config.toml` still matches `/\[model_providers\.llm-router\]/`.
  - Integration: `a save that switches Codex off leaves the config Workbuddy shares`. The same setup, then switch `default-codex` off and `await applyProfileConfig(config)`. `config.toml` still matches `/\[model_providers\.llm-router\]/` and contains the key `profile:workbuddy-global` from `loadPersistedApiKeys()`.
- [ ] **Step 2: Run them and watch them fail.** `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/backup-files.test.js` and `node --test --test-name-pattern="dangling link|target exists keeps both|Workbuddy profile shares|Workbuddy shares" .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected: the dangling-link test finds no link and a token under `dotfiles`, and the two shared-file tests find no file or no provider table.
- [ ] **Step 3: Add `removeFileKeepingLink`** and call it in place of `rmSync(file, { force: true })` in `writeStrippedConfigFile` (`service.ts:3960`), in the `currentManaged` case of the missing-original branch of `restoreGlobalConfigFileContent` (`:3920`) and in `restoreSideFile` (`:3277`). Those are the three places a restore removes an agent's own file (read at `c491eb48`).
- [ ] **Step 4: Add `isCodexFamily`** and use it in `enabledOwnerOfFile`, in the owner lookup of `applyCodexProfile` (replace the inline lookup with `enabledOwnerOfFile`), and in the `others.some` test of `restoreDisabledCodexProfile`. In `restoreInactiveGlobalProfileConfigs`, the Codex loop and the Workbuddy loop each skip a file that an enabled global profile of the family resolves to through `resolveCodexConfigFile`.
- [ ] **Step 5: Run the tests, then the gates.** The new tests pass. `npm run test:core`, `npm run typecheck`, `npm run lint`, `npm run test:architecture`.
- [ ] **Step 6: Update the user docs.** In `profiles.md` (`:226`), say that an enabled Workbuddy profile on the same folder also keeps a Codex `config.toml`, and the other way round, and that a restore keeps a link you made and removes only the file LLMR created behind it.
- [ ] **Step 7: State the limits in the PR and commit.** Two enabled profiles on one `config.toml` each rewrite it with their own key on every apply, as before this task. The takeover sync restores its records with `others: []` (`restoreGlobalProfileTakeoverRecords`, `service.ts:3625-3635`), so it still strips a file an enabled profile of the other agent uses. On a save the apply writes it again in the same pass, and a quit restores both anyway (read). A chain of links is broken at apply time. `resolveWriteTarget` follows one hop of a dangling chain (`backup-files.ts:187`), so the apply replaces the middle link with a file and the restore later deletes that file (run by the audit). A link the user made after LLMR created the file, to a target that holds only LLMR's content, has its target deleted (read). Subject: `fix(profiles): keep a user's config link, and a config another enabled agent shares`

---

### Task 5: Put Workbuddy on the Codex stripper (R-6, R-11, B-2)

After Task 4, which protects a file Workbuddy shares with Codex. First of the stripper tasks, because Workbuddy's `config.toml` is the Codex format and the Codex stripper already exists.

**Order against the delivery index.** This task consumes `isCodexFamily` from Task 4, and Task 4 widens `enabledOwnerOfFile` from Task 1. So it is the last commit of batch 9, after Tasks 3 and 4, and not in batch 7 where the index first put it. The index was corrected on 2026-11-25.

A Workbuddy user who switches the profile off keeps what they or Workbuddy added to `config.toml` while LLM Router had it. No file under the Workbuddy directory holds the profile's key afterwards, and the two side files LLM Router wrote there are gone.

**Nothing left, for this format.** Whitespace only, the rule `isEmptyConfigContent` already applies to a Codex `config.toml`.

**Evidence.** The research ran a global Workbuddy profile through two quit-and-launch cycles and a disable. Three `config.toml.llmr-backup-*` files held the key and `llm-router.config.toml` and `llmr-model-catalog.json` stayed. The audit's run found more left behind: `config.toml.llmr-original-missing`, the markers of the two side files, `models.json.llmr-backup-*` and `models.json.llmr-original-missing` (the `currentManaged` branch at `service.ts:3918-3921` backs up and keeps the marker), and under `.llm-router/` the app's virtual login file and its app catalog. The virtual login file holds a placeholder token, not the profile's key (`prepareWorkbuddyAppVirtualAuth`, `app-launch.ts:798`, read). The fix was not built.

**What stays, for this task.** `models.json` keeps its whole-file restore, as the Interfaces say, with its backup and marker. `.llm-router/` is the Workbuddy app's own data under LLMR's name, left alone as R-9 leaves the Codex app's. Whether `models.json` also gets a stripper is open with the owner (question 4).

**Files:**
- Modify: `packages/core/src/profiles/service.ts`
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `isCodexFamily` from Task 4, and `stripManagedCodexConfigContent`, `readCodexDisplacedConfig` and the `written.json` record as the stripper plan left them.
- Changes: `codexManagedContent(agent, providerIds, file)` returns the stripping matchers when `isCodexFamily(agent)`. `applyCodexProfile` sets `recordsWrittenLines` when `isCodexFamily(profile.agent) && isGlobalProfile(profile)`, so a global Workbuddy profile writes the record and goes through `writeGlobalCodexConfig`. `restoreDisabledCodexProfile` settles the side files for a global profile of the family and builds its messages with `codexCompatibleClientName(profile.agent)`. The Workbuddy loop of `restoreInactiveGlobalProfileConfigs` passes `codexManagedContent("workbuddy", providerIds, file)`. `restoredConfigMessage` returns its texts for `workbuddy` too.
- Unchanged: the restore of Workbuddy's `models.json`, which holds a placeholder and no key, and a generated-scope profile of either agent.

- [ ] **Step 1: Confirm what a Workbuddy apply writes.** Read `applyCodexProfile`, `writeCodexCompatibleAppModelCatalog` and `prepareWorkbuddyAppVirtualAuth` (`packages/core/src/agents/codex/app-launch.ts`). List every file a global Workbuddy apply creates under the Workbuddy directory. If one of them is not reached by `restoreCodexSideFiles`, add it to this task's Step 4 and to the side-file test.
- [ ] **Step 2: Write the failing tests.** Each builds `root = mkdtempSync(…)`, `workbuddyHome = path.join(root, ".workbuddy")`, `profile = globalWorkbuddyProfile(workbuddyHome)` and a config from `configWithProviderAndEnabledProfile("default-claude-code")` with every default profile disabled and `profile` pushed. Each reads the key `profile:workbuddy-global` from `loadPersistedApiKeys()` after the apply and asserts that `config.toml` contains it. Each restores by setting `profile.enabled = false` and calling `applyProfileConfig(config)`, and cleans up `root`, the takeover file and `CONFIGDIR/agent-config-state` as `withAppliedDefaultProfiles` does.
  - `switching a Workbuddy profile off leaves no file that holds its key`. Before the apply write `config.toml` as `model_provider = "openai"\n`. Apply, then twice run `restoreGlobalProfileConfigsOnExit(config.profile.profiles)` followed by `applyProfileConfig(config)`. Restore. `filesHolding(workbuddyHome, key)` is `[]` and `config.toml` reads `model_provider = "openai"\n`.
  - `switching a Workbuddy profile off keeps a table added during the takeover`. No file before the apply. After it, append `userCodexAdditions`. Restore. The file matches `/\[mcp_servers\.mine\]/` and `/trust_level/`, does not match `llmrCodexContent`, and `filesHolding(workbuddyHome, key)` is `[]`.
  - `switching a Workbuddy profile off removes the side files LLM Router wrote`. No file before the apply. Restore. Apart from `.llm-router` and names that start with `models.json`, `readdirSync(workbuddyHome)` holds no name that contains `llm-router` or `llmr`. Assert the two exceptions by name, so a later change to them shows.
  - `a Workbuddy restore says what it did`. The status for `workbuddy` in the result of the second test has the message `LLMR's settings were removed from Workbuddy config and your own settings were kept. Profile is disabled. Switch it on to undo this. Workbuddy may ask you to log in.` `codexCompatibleClientName("workbuddy")` returns `Workbuddy`.
  - Rewrite `a restore leaves the side files of a Workbuddy profile and of a router-scoped Codex profile alone`. Its Workbuddy half asserted that the catalog stays. Keep the router-scoped half under the name `a restore leaves the side files of a router-scoped Codex profile alone`.
- [ ] **Step 3: Run them and watch them fail.** `node build/test.mjs core && node --test --test-name-pattern="Workbuddy profile off|Workbuddy restore says" .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected: the first fails on backups that hold the key, the second on a missing table, the third on the two side files, the fourth on the older wording.
- [ ] **Step 4: Make the five changes in the Interfaces block.**
- [ ] **Step 5: Run the tests, then the gates.** `npm run test:core`, `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Expected: PASS, with the two `a global Workbuddy profile …` tests on `models.json` unchanged.
- [ ] **Step 6: State the limits in the PR and commit.** The context archive MCP block is still written for Codex only. A Workbuddy `config.toml` that LLM Router wrote before this task has no record, so its first restore strips by the text and saves no safety copy. `models.json` is still restored whole, so a model list Workbuddy changed during the takeover is lost, and its backup and marker stay. Subject: `fix(profiles): strip only LLMR's content from a Workbuddy config`
- VM check, for the end pass: switch a Workbuddy profile off and open the Workbuddy app.

---

### Task 6: Strip only LLM Router's content from an OpenCode or a Kilo config (R-11, B-2)

After Task 5, which is the last task to change the Codex path this one generalises.

An OpenCode or Kilo user who added something to their config while LLM Router had it, an `mcp` block for example, keeps it when the profile is switched off. Today that file is deleted when no original existed, and overwritten by the original when one did. No backup beside the config holds the profile's key any more.

**What LLM Router writes** (read in `packages/core/src/agents/opencode/profile-config.ts` and `packages/core/src/agents/kilo/profile-config.ts`). It parses the file as JSONC and writes it back as JSON, with `provider[<id>]` (whose `options.apiKey` is the key and whose `options.headers["x-llmr-client"]` is `opencode` or `kilo`), `model` and `small_model` set to `<id>/<model>`, and a `$schema` when the file had none.

**Nothing left, for this format.** The file parses and holds no key other than a `$schema` equal to the agent's default (`https://opencode.ai/config.json`, `https://app.kilo.ai/config.json`) and a `provider` that is an empty object.

**Evidence.** The research ran OpenCode with and without an original. Kilo was read only. Nothing here was built.

**Files:**
- Create: `packages/core/src/profiles/json-config-strip.ts`
- Modify: `packages/core/src/profiles/service.ts`, `packages/core/src/agents/opencode/profile-config.ts`, `packages/core/src/agents/kilo/profile-config.ts`
- Test: `packages/core/test/unit/profiles/json-config-strip.test.mjs` (new), `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Produces, in `json-config-strip.ts`, which never imports `service.ts`:
  - `export type ProviderJsonStripOptions = { client: "kilo" | "opencode"; providerIds: string[]; schema: string };`
  - `export function stripManagedProviderJsonContent(content: string, options: ProviderJsonStripOptions, snapshot?: string): string | undefined`. It parses with `parseJsoncRecord` (`@llmr/core/agents/local-providers/shared`). It removes `provider[id]` for each given id whose `options.headers` carries `x-llmr-client` or `X-LLMR-Client` equal to `options.client`. It removes `model` and `small_model` only while the value starts with `<id>/` for an id it removed. Where `snapshot` parses and holds `provider[id]`, `model` or `small_model`, that value is put in place of the one removed. A `provider` object that the strip itself emptied is removed. It never removes `$schema`. It returns two-space JSON with a trailing newline, or `undefined` when the content does not parse or nothing would change.
  - `export function isEmptyProviderJsonContent(content: string, schema: string): boolean`, by the rule above.
- Produces, in `service.ts`:
  - `RestoreManagedContentMatchers` gains `isEmptyContent?: (content: string) => boolean`. `writeStrippedConfigFile` and `saveNewestUserBackupCopy` use it in place of `isEmptyConfigContent` when it is set.
  - `providerJsonManagedContent(client: "kilo" | "opencode", providerIds: string[]): RestoreManagedContentMatchers`, with `isManagedContent`, `isEmptyContent`, `stripBeforeSnapshot: true`, `stripLiveContent` and `stripManagedContent` built from the two functions above. The four restore call sites for these agents use it: the disabled branches of `applyOpenCodeProfile` and `applyKiloProfile`, their branches in `disabledProfileStatus`, and their loops in `restoreInactiveGlobalProfileConfigs`.
  - `writeGlobalManagedConfig(file: string, content: string, matchers: RestoreManagedContentMatchers, stripPrevious: (previous: string, snapshot: string | undefined) => string | undefined, asWritten: (previous: string) => boolean): { backupFile?: string; changed: boolean }`. It is the body of `writeGlobalCodexConfig` as the stripper plan left it, its call to `ensureOriginalSnapshot` included. At `c491eb48` that body has four Codex-only expressions (read): `codexManagedContent("codex", [providerId], file)` (`service.ts:1413`), which `matchers` replaces; the strip of a managed previous file (`:1436`), which `stripPrevious` replaces; `isAsWritten(record, previous)` (`:1423`), which `asWritten` replaces; and `isEmptyConfigContent(kept)` (`:1439`), which becomes `(matchers.isEmptyContent ?? isEmptyConfigContent)(kept)`. Without the last, an OpenCode file emptied to `{ "$schema": …, "provider": {} }` would get a backup. `writeGlobalCodexConfig` becomes a call to it and behaves as before. Re-read the body in Step 1, since stripper Task 5 changes it.
  - `writeConfigRecord(file: string, source: string | undefined, sourceManaged: boolean): void`. It writes `{ edited, file, sha256 }` to `codexWrittenRecordFile(file)` after the config is written, with `edited` computed as `applyCodexProfile` computes it and `sha256` of the file as it now is. `readCodexWrittenRecord`, `isAsWritten` and the clearing in `restoreGlobalConfigFile` already work for any file.
- Changes, in the two agent files: the options of `writeOpenCodeGatewayConfig` and `writeKiloGatewayConfig` gain `write?: (file: string, content: string) => { backupFile?: string; changed: boolean }`, used in place of their own `writeJsonFile` when set. `service.ts` passes one that calls `writeGlobalManagedConfig` for a global profile and then `writeConfigRecord`. A generated-scope profile passes none.
- `restoredConfigMessage` returns its texts for `opencode` and `kilo`.

- [ ] **Step 1: Re-read `writeGlobalCodexConfig`, `restoreGlobalConfigFileContent` and `codexManagedContent`** as the stripper plan and Task 5 left them. The extraction in this task must not change a Codex result. `npm run test:core` after Step 4 is the check.
- [ ] **Step 2: Write the failing unit tests**, `json-config-strip.test.mjs`, with `options = { client: "opencode", providerIds: ["llm-router"], schema: "https://opencode.ai/config.json" }` and

```js
const llmrProvider = { models: {}, name: "LLM Router", npm: "@ai-sdk/openai-compatible", options: { apiKey: "llmr-profile-TEST", baseURL: "http://127.0.0.1:3456/v1", headers: { "x-llmr-client": "opencode", "x-llmr-profile": "p" } } };
const applied = { $schema: options.schema, mcp: { mine: { command: ["my-server"], type: "local" } }, model: "llm-router/m", provider: { "llm-router": llmrProvider, other: { name: "Other" } }, small_model: "llm-router/m" };
```

  - `it removes LLM Router's provider and model refs and keeps the rest`. `JSON.parse(strip(JSON.stringify(applied), options))` deep-equals `{ $schema: options.schema, mcp: applied.mcp, provider: { other: { name: "Other" } } }`.
  - `it puts back what the original held under the same keys`. With `snapshot = JSON.stringify({ model: "other/x", small_model: "other/y" })` the result has `model: "other/x"` and `small_model: "other/y"`.
  - `a provider of the user's own under LLM Router's id survives a restore` (Review Focus 5). Content `{ model: "llm-router/mine", provider: { "llm-router": { name: "Mine" } } }` returns `undefined`.
  - `a model the user chose during the takeover stays`. `applied` with `model: "other/x"` keeps that `model`.
  - `it reads a file with comments and a trailing comma`. `"// mine\n" + JSON.stringify(applied, null, 2).replace(/\n}$/, ",\n}")` strips to the same object as the first test.
  - `a second strip changes nothing`. `strip(strip(JSON.stringify(applied), options), options) === undefined`.
  - `content that does not parse is left alone`. `strip("{ \"provider\": ", options) === undefined`.
  - `nothing left means only LLM Router's schema and an empty provider map`. `isEmptyProviderJsonContent` is true for `{}`, for `{ $schema: options.schema, provider: {} }`, and false for `{ $schema: "https://example.test/x.json" }`, for `{ mcp: {} }` and for text that does not parse.
- [ ] **Step 3: Write the failing integration tests**, in `profile-service.test.mjs`, each `{ skip: !process.env.LLMR_INTERNAL_HOME_DIR }`. Each uses `root = mkdtempSync(…)`, `openCodeFile = path.join(root, "opencode.jsonc")`, the profile object of the existing test `restoring an OpenCode config LLMR created still keeps a backup of it` with `enabled: true`, and a config from `configWithProviderAndEnabledProfile("default-claude-code")`. Apply with `applyProfileRuntimeConfig(config, profile, "llmr-profile-TEST")` and restore with `applyProfileRuntimeConfig(config, { ...profile, enabled: false }, "llmr-profile-TEST")`. Clean up `root` and `CONFIGDIR/agent-config-state` in a `finally`.
  - `an OpenCode config LLM Router created keeps what the user added to it`. No file before. After the apply add `mcp: { mine: { command: ["my-server"], type: "local" } }` to the parsed file and write it back. Restore. The file parses to an object whose `mcp` is that value and that has no `model`, no `small_model` and no `provider["llm-router"]`. `filesHolding(root, "llmr-profile-TEST")` is `[]`, and `readdirSync(root)` holds no name that contains `.llmr-`.
  - `an OpenCode config LLM Router created and nobody edited is removed`. Apply, restore. `readdirSync(root)` is `[]`.
  - `an OpenCode config nobody edited comes back byte for byte, comments included`. Before the apply write `// my config\n{\n  "model": "other/x", // mine\n  "theme": "dark"\n}\n`. Apply, restore. The file's text equals it.
  - `an OpenCode config the user edited keeps the edit and gets their own model back`. The same original. After the apply add the `mcp` value. Restore. The file parses to `{ $schema: "https://opencode.ai/config.json", mcp: …, model: "other/x", theme: "dark" }`. Exactly one safety copy is in `safetyCopies(openCodeFile)`, and it does not contain `llmr-profile-TEST`.
  - `no backup of an OpenCode config holds the key after a second apply`. Apply, change `profile.model`, apply again. `filesHolding(root, "llmr-profile-TEST")` equals `[openCodeFile]`.
  - `two restores in a row change nothing the second time`. After the first test's restore, read the file, restore again, and the text is equal and `safetyCopies(openCodeFile)` has not grown.
  - `a Kilo config keeps what the user added to it`. The first test with `agent: "kilo"`, a file named `kilo.jsonc` and the header value `kilo`.
  - `an OpenCode config the user deleted during the takeover leaves a safety copy of their settings` (V-17). The original of the byte-for-byte test, apply, add the `mcp` value, change `profile.model` and apply again so a backup holds the user's content, delete `openCodeFile`, restore. `existsSync(openCodeFile)` is false, exactly one safety copy is in `safetyCopies(openCodeFile)`, it holds `"theme"` and does not hold `llmr-profile-TEST`.
  - Replace `restoring an OpenCode config LLMR created still keeps a backup of it` with `restoring an OpenCode config LLM Router created keeps no backup of it`. It keeps the same fixture, and its last assertion expects `0` backups.
- [ ] **Step 4: Build it.** Add `json-config-strip.ts`. Extract `writeGlobalManagedConfig` and run `npm run test:core` before going on. A green run is the check that Codex did not change. Then add `isEmptyContent`, `providerJsonManagedContent`, `writeConfigRecord` and the `write` option, and switch the call sites.
- [ ] **Step 5: Run the tests, then the gates.** `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/json-config-strip.test.js`, then `npm run test:core`, `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Expected: PASS, with `opencode-profile-config.test.mjs` and `kilo-profile-config.test.mjs` unchanged.
- [ ] **Step 6: Break it three times.** Remove a provider by its id alone and confirm the Review Focus 5 test fails. Skip the `asWritten` test and confirm the byte-for-byte test fails. Return the stripped file without the snapshot's values and confirm the "gets their own model back" test fails. Put all three back.
- [ ] **Step 7: State the limits in the PR and commit.** A stripped file is written as JSON, so comments in a file the user edited during the takeover are only in the safety copy. A `$schema` LLM Router added stays in a file that keeps other content. A backup written before this task still holds a key that no longer works, until five newer ones push it out. Subject: `fix(profiles): strip only LLMR's content from an OpenCode or Kilo config`

---

### Task 7: Merge into Pi's `models.json`, and strip only LLM Router's provider (R-11, B-2)

After Task 6, whose `writeGlobalManagedConfig`, `writeConfigRecord` and `isEmptyContent` it uses.

A Pi user keeps their own providers in `models.json` while LLM Router has the file, because the apply adds its provider instead of replacing the file. When the profile is switched off, LLM Router's provider goes and everything else stays, including a provider the user added during the takeover. Today that last case leaves LLM Router's provider and a dead key in place.

**What LLM Router writes** (read in `packages/core/src/agents/pi/profile-config.ts`). `piModelsJson` returns `{ providers: { [<id>]: … } }` and `writePiGatewayConfig` writes it over the file. The entry holds `apiKey` and `headers["x-llmr-client"] === "pi"`. `isManagedPiModelsContent` is true only for a file with exactly that one provider.

**Nothing left, for this format.** The file parses and is `{}` or holds only a `providers` that is an empty object.

**Evidence.** The research ran the replace and the failed disable. The merge was not built.

**Files:**
- Modify: `packages/core/src/agents/pi/profile-config.ts`, `packages/core/src/profiles/json-config-strip.ts`, `packages/core/src/profiles/service.ts`
- Test: `packages/core/test/unit/profiles/json-config-strip.test.mjs`, `packages/core/test/unit/agents/pi-profile-config.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `writeGlobalManagedConfig`, `writeConfigRecord` and `RestoreManagedContentMatchers.isEmptyContent` from Task 6.
- Changes: `writePiGatewayConfig` reads the file and writes `{ ...source, providers: { ...source.providers, [providerId]: entry } }`. A file that does not parse as a JSON object makes it throw with the file's path, as `readClaudeCodeSettingsObject` does, so the apply reports a status that is not ok and writes nothing. It gains a last parameter `write?: (file: string, content: string) => { backupFile?: string; changed: boolean }`, with the meaning Task 6 gave the same option, and `writePiWrapper` passes it for a global profile.
- Changes: `isManagedPiModelsContent(content, providerId)` is true when `providers[providerId].headers["x-llmr-client"] === "pi"`, whatever else the file holds.
- Produces, in `json-config-strip.ts`: `export function stripManagedPiModelsContent(content: string, providerIds: string[], snapshot?: string): string | undefined` and `export function isEmptyPiModelsContent(content: string): boolean`. The strip removes `providers[id]` only while its `headers["x-llmr-client"]` is `pi`, and puts back the snapshot's `providers[id]` when the snapshot holds one.
- Produces, in `service.ts`: `piManagedContent(providerIds: string[]): RestoreManagedContentMatchers`, shaped as `providerJsonManagedContent` is, used by `disabledPiStatus` and the Pi loop of `restoreInactiveGlobalProfileConfigs`. `restoredConfigMessage` returns its texts for `pi`.

- [ ] **Step 1: Write the failing tests.**
  - Unit, `json-config-strip.test.mjs`: `it removes LLM Router's Pi provider and keeps the others` (`{ providers: { "llm-router": { apiKey: "llmr-profile-TEST", headers: { "x-llmr-client": "pi" } }, "my-ollama": { baseUrl: "http://localhost:11434" } } }` strips to `{ providers: { "my-ollama": { baseUrl: "http://localhost:11434" } } }`), `a Pi provider of the user's own under LLM Router's id stays` (no header, returns `undefined`), `it puts the user's own provider back under the same id` (with a snapshot that holds one), and `nothing left means no provider` (`isEmptyPiModelsContent` is true for `{}` and `{ providers: {} }`, false for `{ providers: { a: {} } }` and `{ theme: "x" }`).
  - Unit, `pi-profile-config.test.mjs`: `an apply keeps the user's other providers in models.json`. Write `{ providers: { "my-ollama": { baseUrl: "http://localhost:11434" } }, theme: "x" }`, call `writePiGatewayConfig(root, createDefaultAppConfig(), profile, "token", "default")`, and the file has the keys `providers` and `theme` and the provider ids `["my-ollama", "llm-router"]`.
  - Integration, with the fixture of `a global Pi profile restores the user's models.json on release`:
    - Change that test's first assertion to `["my-ollama", "llm-router"]`.
    - `a provider added to Pi's models.json during the takeover survives the disable`. After the apply add `providers.added = { baseUrl: "http://localhost:1" }`. `restoreInactiveGlobalProfileConfigs([{ ...profile, enabled: false }])`. The provider ids are `["my-ollama", "added"]`, and `filesHolding(agentDir, "token")` is `[]`.
    - `a Pi models.json LLM Router created keeps a provider the user added`. No file before. Apply, add `providers.added`, restore. The ids are `["added"]` and the directory holds no name that contains `.llmr-`.
    - In the loop `a global ${label} release warns but succeeds when an upgraded models.json has no backup`, give the Pi row's content the header: `{ providers: { "llm-router": { headers: { "x-llmr-client": "pi" }, models: [] } } }`.
    - `a Pi models.json the user deleted during the takeover leaves a safety copy of their providers` (V-17). The fixture of the first integration test, apply, add `providers.added`, apply again with another model so a backup holds it, delete `models.json`, restore. Exactly one safety copy holds `"my-ollama"` and none holds `token`.
  - `a global Pi profile deletes the models.json it created` and `the Pi sweep leaves a models.json alone when LLMR never took it over` must still pass unchanged.
- [ ] **Step 2: Run them and watch them fail.** `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/json-config-strip.test.js .test-dist/core/test/unit/agents/pi-profile-config.test.js` and `node --test --test-name-pattern="Pi" .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected: the merge test finds one provider, and the takeover test finds `llm-router` still in the file.
- [ ] **Step 3: Build it** as the Interfaces block says.
- [ ] **Step 4: Run the tests, then the gates.** `npm run test:core`, `npm run typecheck`, `npm run lint`, `npm run test:architecture`.
- [ ] **Step 5: State the limits in the PR and commit.** A `models.json` that does not parse now stops the Pi apply with a status that names the file, where it was overwritten before. The file is written as two-space JSON. A `models.json` the old code replaced holds only LLMR's provider, and the user's providers are only in `models.json.llmr-original` (`isManagedPiModelsContent` at `pi/profile-config.ts:49`, read). After this task such a file has no written record, so the restore strips the live file and puts back only the snapshot's provider under LLMR's id, which leaves `{ providers: {} }` (inferred from `restoreGlobalConfigFileContent`, `service.ts:3885-3891`). No consumer has such a file, so this is a limit and no migration is written. Subject: `fix(profiles): add LLMR's provider to Pi's models.json instead of replacing the file`

---

### Task 8: Strip only LLM Router's content from the three ZCode files (R-11, B-2)

Last of the strippers. ZCode has three files and no mark of LLM Router's in two of them, it is left out of the launch apply, and nobody has run it.

A ZCode user who switches the profile off keeps what they or ZCode added to its three config files during the takeover, and none of the three holds the profile's key afterwards.

**What LLM Router writes** (read in `packages/core/src/agents/zcode/profile-config.ts`).
- `<home>/cli/config.json` and `<home>/v2/config.json`: `provider[<id>]`, whose `options.apiKey` is the key, `model.main` set to `<id>/<model>`, and a `$schema` when the file had none. The `v2` entry also has `enabled: true` and `source: "custom"`.
- `<home>/v2/bots-model-cache.v2.json`: an entry in the `providers` array with `id` equal to the provider id and the placeholder `apiKey` `__zcode_cached_api_key_present__`, the three model refs `defaultModel`, `lastUsed` and `lastUsedModel` as `{ providerId, modelId }`, and `revision`, `updatedAt` and `version`.
- No entry carries an LLM Router header. `isManagedZcodeConfigContent` goes by the provider id alone.

**The mark this task goes by.** In the two config files, `provider[id]` is LLM Router's while `options.apiKey` starts with `llmr-profile-` or equals `llmr-local`, the value `fallbackClientToken` has in `service.ts`. The cache file holds no key, so its entry is LLM Router's while `v2/config.json` beside it marks that id. For that reason a restore settles the cache first, then `v2/config.json`, then `cli/config.json`. A failure midway then leaves the mark for the next run.

**Nothing left, per file.** A config file parses and holds no key other than a `$schema` equal to `https://opencode.ai/config.json`, a `provider` that is an empty object and a `model` that is an empty object. The cache file parses and its `providers` is an empty array, with no key other than `providers`, `revision`, `updatedAt` and `version`.

**Evidence.** Read only, by the research and by the plan author. Step 1 runs it.

**Files:**
- Modify: `packages/core/src/profiles/json-config-strip.ts`, `packages/core/src/agents/zcode/profile-config.ts`, `packages/core/src/profiles/service.ts`
- Test: `packages/core/test/unit/profiles/json-config-strip.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Consumes: `writeGlobalManagedConfig`, `writeConfigRecord` and `isEmptyContent` from Task 6.
- Produces, in `json-config-strip.ts`:
  - `export function zcodeManagedProviderIds(content: string, providerIds: string[]): string[]`, the given ids whose `provider[id]` carries the mark.
  - `export function stripManagedZcodeConfigContent(content: string, providerIds: string[], snapshot?: string): string | undefined`. It removes each marked `provider[id]` and a `model.main` that starts with `<id>/` for an id it removed, and puts back the snapshot's `provider[id]` and `model.main` where the snapshot holds them.
  - `export function stripManagedZcodeModelCacheContent(content: string, ownedIds: string[], snapshot?: string): string | undefined`. It removes each `providers` entry whose `id` is in `ownedIds`, and each of the three model refs whose `providerId` is in `ownedIds`, and puts back the snapshot's values for those. `revision`, `updatedAt` and `version` stay.
  - `export function isEmptyZcodeConfigContent(content: string): boolean` and `export function isEmptyZcodeModelCacheContent(content: string): boolean`.
- Produces, in `service.ts`: `zcodeManagedContent(file: "cache" | "config", providerIds: string[], ownedIds: string[]): RestoreManagedContentMatchers`. `restoreDisabledZcodeProfile` and the ZCode loop of `restoreInactiveGlobalProfileConfigs` read `ownedIds` from `v2/config.json` once, before any file is restored, and restore the three files in the order above. `isManagedZcodeConfigContent` is unchanged for the cache file and goes by the mark for the two config files. `restoredConfigMessage` returns its texts for `zcode`, and `restoreDisabledZcodeProfile` builds its message from the first file whose restore changed something.
- Changes: `writeZcodeGatewayConfig`'s options gain the `write` option of Task 6, and `applyZcodeProfile` passes it for a global profile.

- [ ] **Step 1: Run what was only read.** Write a throwaway test beside `profile service restores between-session ZCode edits after many takeover rewrites prune old backups`, with that test's profile and a temporary `.zcode` directory. Apply through `applyProfileRuntimeConfig`, print the three files, add a key to each, restore with `restoreGlobalProfileConfigsOnExit([profile], { manageMarker: false })`, and print them again. Confirm that the added keys are lost today and that the three shapes are as listed above. If a shape differs, the code wins and the Interfaces change. Delete the throwaway test.
- [ ] **Step 2: Write the failing unit tests**, one per function, with the key `llmr-profile-TEST`.
  - A config with a marked `provider["llm-router"]`, a user `provider.other`, `model: { main: "llm-router/m", fast: "other/f" }` and a user key `theme` strips to `{ model: { fast: "other/f" }, provider: { other: … }, theme: … }`, with a `$schema` kept when present.
  - A `provider["llm-router"]` whose `options.apiKey` is `sk-user` returns `undefined`.
  - A cache with two `providers` entries, ids `llm-router` and `other`, and all three model refs on `llm-router`, stripped with `ownedIds` `["llm-router"]`, keeps the `other` entry and none of the three refs. With `ownedIds` `[]` it returns `undefined`.
  - Both emptiness functions, on one empty and two non-empty contents each.
- [ ] **Step 3: Write the failing integration tests**, with the fixture of Step 1.
  - `a ZCode restore keeps what was added to each of its three files`. With an original `cli/config.json` of `{ "model": { "main": "builtin:zai/glm-5" } }`. Apply, add `theme: "dark"` to each file, restore. Each file still has `theme`, `cli/config.json` has `model.main === "builtin:zai/glm-5"`, and `filesHolding(zcodeHome, key)` is `[]`.
  - `a ZCode home LLM Router filled alone is emptied again`. No file before. Apply, restore. None of the three files exists and no name under the home contains `.llmr-`.
  - `ZCode files nobody edited come back byte for byte`. Write all three originals, apply, restore, compare the text of each.
  - `a ZCode config the user deleted during the takeover leaves a safety copy of their settings` (V-17). With an original `cli/config.json` that holds `theme`, apply, change the model and apply again, delete `cli/config.json`, restore. Exactly one safety copy holds `theme` and none holds the key.
  - `profile service restores between-session ZCode edits after many takeover rewrites prune old backups` must still pass.
- [ ] **Step 4: Build it** as the Interfaces block says.
- [ ] **Step 5: Run the tests, then the gates.** `npm run test:core`, `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Expected: PASS, with `zcode-profile-config.test.mjs` unchanged.
- [ ] **Step 6: State the limits in the PR and commit.** A provider under LLM Router's id whose key the user replaced by hand is taken for the user's and stays. The cache file's `revision`, `updatedAt` and `version` are not put back. The cache entry is recognised only through `v2/config.json`, so if the user deleted that file the cache keeps LLMR's entry. Nothing here was checked against the ZCode app. Subject: `fix(profiles): strip only LLMR's content from the ZCode config files`
- VM check, for the end pass: switch a ZCode profile off and open the ZCode app.

---

### Task 9: Prototype the Codex token command (R-13, B-3, X-2)

Last, and independent of every other task. It is an investigation. It changes no product code, and no plan changes how the token is written until the owner has read its result.

Today the profile's key sits in `config.toml` as `experimental_bearer_token`, in every copy of that file and behind any link the file is. X-2 says Codex can run a command that prints the token instead. Whether that works for LLM Router's cases is not known, and this task measures it.

**Deliverable.** One file, `docs/superpowers/research/2026-11-22-codex-token-command.md`, with the result table, the script that produced it in one code block, what was not measured, and the question for the owner. It is a docs-only change and goes straight to `main`.

**Home safety.** Every Codex run uses a fresh `T=$(mktemp -d)` and `env -i PATH="$PATH" HOME="$T" CODEX_HOME="$T"`. A listing of `~/.claude` or `~/.claude.json` cannot serve as the check, because the Claude Code session that runs this task writes there the whole time (inferred). Before the first run and after the last, record `shasum ~/.codex/config.toml` and confirm the two are equal. After the last run, `grep -rl "llmr-profile-PROTOTYPE" ~/.codex` finds nothing, and the result file lists every file under each `$T`. Never start LLM Router. The stub provider listens on `127.0.0.1` only. The token is the made-up value `llmr-profile-PROTOTYPE`. Record whether `codex exec` opened a connection to any host other than the stub (`lsof -i -a -p <pid>` during the run, or "not measured").

**What "go" means.** All four hold on the installed stable Codex:
1. The stub receives `Authorization: Bearer llmr-profile-PROTOTYPE` on a model request, with no `experimental_bearer_token` in the config.
2. The command runs when it is given by absolute path and uses only `/bin/sh` and the base system tools it calls (`date`), from a shell launch and from a launch with the PATH a desktop app gets. For the desktop PATH, start `codex` by its absolute path (`command -v codex`), so an npm launcher that needs `node` on PATH is not mistaken for a token command failure. If the launcher still fails, the row says so and is "not measured", not "no-go".
3. A command that exits 1, and one that sleeps past `timeout_ms`, each produce an error a person can read, and the stub receives no request without the header.
4. After a session, `grep -rl "llmr-profile-PROTOTYPE" "$T"` lists only the command script.

Anything else is "no-go" or "partly", and the result says which line failed.

- [ ] **Step 1: Check the tools.** `command -v codex` and `codex --version`. If nothing is found, report that exact check and stop. Another Codex version is a download, and needs the owner's word first.
- [ ] **Step 2: Write the smallest script**, in the session's scratch directory, not in the repo. It has three parts.
  - A stub provider in Node on `127.0.0.1` and a free port. It appends each request's method, path and `authorization` header to `$T/requests.log` and answers a Responses request with one short completed response. The response shape comes from a real exchange recorded in `packages/core/test`, not from memory.
  - A token command, `$T/token.sh`, mode `0700`: `#!/bin/sh`, append `date`, `$PATH` and `$PWD` to `$T/command.log`, then print the token.
  - A `config.toml` in `$T` with `model_provider = "proto"`, a `[model_providers.proto]` table (`name`, `base_url` of the stub, `wire_api = "responses"`) and a `[model_providers.proto.auth]` table with `command = "<T>/token.sh"`. Add a model catalog only if Codex refuses to start without one, built with `codexModelCatalogJson` as the v8 plan's Task 4d describes.
- [ ] **Step 3: Measure, one row per line of the result table.**
  - Accepted: `codex exec "say ok"` under the `env -i` line above. Record the exit code, `requests.log` and `command.log`.
  - Versions: the installed version, and X-1's `0.134.0` as the oldest only if the owner allowed the download.
  - PATH from a shell: the `PATH` line `command.log` recorded.
  - PATH from the desktop app: repeat with `PATH=/usr/bin:/bin:/usr/sbin:/sbin`, which is what launchd gives an app on macOS. Launching the Codex desktop app itself in an isolated home is measured only if it can be done without touching the real home. Otherwise the row says "not measured" and what would measure it.
  - Failure: `token.sh` replaced by `exit 1`.
  - Slow: `sleep 10` before the print, with the default `timeout_ms`, then with `timeout_ms = 15000`.
  - Refresh: how many times `command.log` grew during one session, against `refresh_interval_ms`.
  - Token on disk: the `grep` of line 4 above, after a session that completed.
  - Both keys: add `experimental_bearer_token` beside the `auth` table and record the error.
  - Workbuddy: if `command -v` finds its CLI, the first measurement with its home variable. Otherwise "not measured".
- [ ] **Step 4: Write the result file.** A table of measurement, command and what was observed, each marked measured or not measured. The verdict by the four lines above. The script. Then these facts for the owner, each read in `service.ts`: the key is also written into the ToolHub MCP `env` table and the context archive `Authorization` header, which the token command does not cover, and LLM Router would have to ship the command as a file of its own that holds or fetches the key.
- [ ] **Step 5: Put the question to the owner**, in the result file and in the hand-back: with this result, should a plan be written to move the Codex provider token to the command, to leave it as it is, or to move it only for the launches LLM Router makes itself.
- [ ] **Step 6: Commit the result file to `main`.** Subject: `docs(superpowers): record the Codex token command prototype`

---

## Open with the owner

1. **Should `saveApiKeys` stop applying profiles while the gateway is stopped?** Read in `ipc.ts:389-391` and `management-server.ts:500-502` at `41d0016a`, still true after PR 166. Both `saveApiKeys` handlers call `applyProfileConfig` without the check `applyProfileIfServiceRunning` makes, so a key change with the gateway stopped takes the agents over again and points them at an address nothing serves. The spec holds no row for it. Options: (a) Task 2 routes both through `applyProfileIfServiceRunning`, one line each, with a test; (b) leave it and record it as a new row; (c) leave it. Recommended: (a). **Built as the default with batch 8 on 2026-11-26: Task 2 Step 5 carries option (a).** The step's test was written in the fix round and not run before the text audit.
2. **Should the Restore original settings button cover the agents that get a stripper under B-2?** `isRestorableGlobalProfile` limits it to Claude Code and Codex. After Tasks 5 to 8 the other agents are stripped when a profile is switched off, on a gateway stop and on a quit, and the button is the one trigger they lack. Options: (a) leave the button as it is; (b) widen it to Workbuddy, OpenCode, Kilo, Pi and ZCode in a follow-up PR after Task 8; (c) widen it per agent inside each of Tasks 5 to 8. Recommended: (a) until those strippers have been used. No task waits.
3. **May Task 9 download another Codex version?** The oldest version that has the `auth` table is not known, and measuring one means fetching it. Options: (a) the installed version only; (b) also `0.134.0`; (c) also every minor version between. Recommended: (a), with the row marked not measured. Task 9 Step 3's Versions row waits on this.
4. **Should Workbuddy's `models.json` get a stripper too?** B-2 says every agent gets one. Task 5 strips Workbuddy's `config.toml` and leaves `models.json` on its whole-file restore. That file holds a placeholder and no key (read, `app-launch.ts:345`), so the cost of leaving it is a model list Workbuddy changed during the takeover, plus one backup and one marker beside it (run by the audit). Options: (a) leave it, stated as a limit in Task 5; (b) a stripper for it inside Task 5, by the entries whose `apiKey` is the placeholder; (c) a follow-up task. Recommended: (a). Nothing in the file is a credential, and no consumer has such a file. No task waits. Task 5 is written for (a).
