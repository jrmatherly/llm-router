# v8 Clean-VM Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who installs LLM Router on a clean Mac can add a provider, connect the one agent they chose, and keep it connected, without a false error, a silent takeover of another agent, or a restart.

**Architecture:** Two phases. Phase A is Tasks 0 to 5 (Task 4 is five tasks, in the order 4a, 4d, 4e, 4b, 4c, and Task 4d is four PRs with Task 4e run after its Part 1), an investigation task and a release task. It fixes agent profiles and the first-run screen, and it can ship without Phase B. Phase B is Tasks 6 to 9, the smaller UI defects, cost totals and a request log retention setting. Each code task is one branch and one squash-merged PR, except Task 4d, which is four. Tasks run one at a time in the order under "Order", because several of them edit the same files.

**Tech Stack:** TypeScript, Electron 45, React, `better-sqlite3`, `node:test` with `node:assert/strict`, component tests that render with `renderToStaticMarkup`.

**Spec:** [`docs/superpowers/research/2026-11-20-v8-clean-vm-validation.md`](../research/2026-11-20-v8-clean-vm-validation.md). Finding ids F-1 to F-29 come from that record. Read each finding a task names before you start the task.

**Review history.** Written 2026-11-21 from three code explorations. Audited the same day by two independent passes, one that checked every path, symbol and test against the code and one on the design. The audit found two blockers that this version fixes. Task 4 would have deleted a user's own Codex settings, and Task 2's test named a fixture that does not exist. It also replaced Task 2's design, which restarted the gateway twice, and corrected the causes stated in Tasks 8 and 9. The plan author re-read each audit finding in the code before applying it. Task 4 and decisions V-7 and V-16 were rewritten later the same day after the restore research, and that rewrite was audited by two more passes. Appendix C records both. Task 4d and the safety-copy clause of V-7 were added after the stripper was measured against real Codex (Appendix D). Task 4e was added after the review of PR 133 (Appendix E). The whole plan was then audited against `main` at `06dd4b4f` by four passes, and Appendix F records what that changed.

**Status on 2026-11-21. Git is the record, and the checkboxes are not ticked.** Merged: Task 0 (PR 128), Task 1 (PR 129), Task 3 (PR 130), Task 2 (PR 131), Task 4a (PR 132), Task 4d Part 1 (PR 133). Next: Task 4e. A merged task's body describes the code as it was before its PR. Waiting on the owner: V-6 before Task 5, V-8's default before Task 9, and V-9. The Order table carries the same status per task.

**Evidence status.** A cause marked "inferred" was not confirmed by reading the code path end to end. Its task starts with the step that confirms it.

## Decisions

| # | Decision | Who, when |
|---|---|---|
| V-1 | Fixes are batched after the VM pass, not shipped one at a time. | Owner, 2026-11-20 |
| V-2 | Request logs get a setting for the number of days to keep. | Owner, 2026-11-21 |
| V-3 | The top-level `profile.enabled` is derived from the profiles alone. A stored `false` is no longer honoured. A config that v8.0.0 saved with the flag stuck recovers on load, with no migration step. | Plan author. Deleting the flag instead changes about ten runtime readers for the same outcome |
| V-4 | Both default profiles ship disabled. Onboarding enables only the profile for the agent the user picks. A config that v8.0.0 already saved keeps both profiles enabled, and the release notes say so. | Owner, 2026-11-21, after the research in Appendix A |
| V-5 | The onboarding "Connect agent" step gets a **Skip for now** action. It ships only together with V-4, because a skip with enabled defaults still applies both. | Owner, 2026-11-21, after the research in Appendix A |
| V-6 | A gateway that has no provider model reports `state: "stopped"` with the reason in `lastError`. It is not an error. The audit proposed a separate `stoppedReason: "no-models"` field with `lastError` unset, so a reader can tell "never configured" from "failed". That widens `GatewayStatus` for one case. | **Open, owner to confirm.** Plan author's choice, and still his recommendation after the research in Appendix G: it needs no reader changed, where the audit's field needs eight. Outside practice favours a separate reason. Task 5 is blocked on it |
| V-7 | **Restore original settings** removes only what LLMR wrote, for every agent that has a stripper (Claude Code, Codex), on every trigger (the button, a profile switched off, a gateway stop, a quit) and whether or not an original file existed. A top-level Codex key is removed only while it still holds the value LLMR wrote, and the `model_provider` LLMR displaced is put back. A file is removed only when no original existed and nothing but LLMR's content is left, and "nothing left" is defined per format. A restore that leaves the profile disabled (the button, a profile switched off) revokes the profile's key at once. A quit or a gateway stop leaves the profile enabled and its key valid for the next launch. LLMR keeps no copy of its own token. When no original existed, a restore writes no backup and deletes every backup of that file, because the live file already holds the user's content and a stripped backup would later be taken for the user's original and written back. V-17 covers the case where the live file is gone. A Claude Code file that a restore strips is written back as two-space JSON, so its formatting can change (F-22), which is accepted. When an original existed, a backup that holds the user's content is kept with LLMR's content removed. Before a strip changes a file that someone other than LLMR edited, LLMR saves that file as it was, with its own token blanked, in its own data folder (`CONFIGDIR`, which is `~/.llm-router` on macOS), and keeps the last three per file. A Claude Code file whose original existed keeps its pre-strip backup beside the file instead. The copies hold any other secret the file held, and nothing deletes them when a profile is deleted or LLMR is removed. A restore never reads those copies, so none can be written back. They are the only fallback if the strip removes something of the user's. A restore that finds no original removes the `.llmr-original-missing` marker, so a file the user keeps becomes the original at the next takeover. An agent with no stripper (OpenCode, Kilo, Pi, ZCode, Workbuddy) keeps today's behaviour and never loses a backup. LLMR never removes `~/.claude`, `~/.codex`, `~/.claude.json` or `~/.claude/.claude.json`. | Owner, 2026-11-21, after the research in Appendix C. The backup and safety-copy clauses are from his second decision the same day, after the stripper was measured against real Codex (Appendix D) |
| V-8 | Retention accepts 1 to 90 days and lives in the request log database, so every process reads the same number. **The default needs the owner's word.** 1 day keeps today's behaviour. 7 days is the audit's proposal, because the owner asked for the setting after one day surprised him. | **Open, owner to confirm the default.** Range and storage: plan author. The plan author recommends 7 after the research in Appendix G. Task 9 is blocked on it |
| V-9 | No date filter on the Logs page in this plan. The list is sorted newest first and paged. | **Open, owner to confirm.** After the research in Appendix G the plan author recommends a small filter of presets (Today, 24 hours, 7 days, 30 days, All), with no calendar, as its own task after Task 9. It does not block Task 9 |
| V-10 | A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. Nothing in Tasks 0 to 9 touches the fork. | Owner, standing rule |
| V-11 | Onboarding keeps **System default** as the selected Effect scope, and the step names the file LLMR will change, the copy it keeps and the button that undoes it. The alternative, **Only opened from LLMR**, was not chosen, so the decision of 2026-11-01 that shared home is off by default stands (`docs/superpowers/specs/completed/2026-11-01-claude-code-shared-home-launch.md`). | Owner, 2026-11-21 |
| V-12 | No installed-agent detection in this plan. Finders exist for the desktop apps only. A check for the `claude` and `codex` commands is new code on three operating systems and reports "not found" for a binary that is off `PATH`. | Plan author, from the 2026-11-21 research |
| V-13 | LLMR creates and prunes profile keys before it starts or updates the gateway, so one restart carries the new key list. The gateway child still restarts on a profile change, as it does today, and a restart drops requests in flight. A reload without a restart needs a change in the gateway fork and is not in this plan. | Plan author, from the audit |
| V-14 | The plan author chose these user-visible strings and values. Change any of them in review without reopening the plan: the media protocol labels `OpenAI Images`, `OpenAI Video` and `xAI Video`, the placeholder `Select default model`, the toast offset `top-14`, the consent sentence in Task 3 Step 8, the `Skip for now` label and the skipped Profile row text. | Plan author |
| V-15 | A per-PR gate is the unit, component and end-to-end tests. The clean-VM checks run once, by the owner, on a build that holds every Phase A task (Task 11). An agent cannot drive the UTM window, and the checks need a provider key that must not sit in a repo or a shared folder. | Plan author, from the audit |
| V-16 | **Restore original settings** acts without a confirmation prompt, and only together with V-7. The same file changes run on a quit and a gateway stop, where nobody can answer a prompt. The result message does the prompt's work: it names what was removed and what was kept, says that switching the profile on again undoes it, and says the agent may ask the user to log in. The message is shown where a person asked for the restore. A quit and a gateway stop show none. | Owner, 2026-11-21, after the research in Appendix C |
| V-17 | When a restore finds no original and the user has deleted the live file, LLMR saves the newest backup that holds something of the user's as a safety copy, by V-7's safety-copy rules (LLMR's data folder, token blanked, last three per file), before it deletes the backups. The file stays absent. This widens V-7's safety-copy clause, which covered only a strip of a live file. | Owner, 2026-11-21, after the review of PR 133 (Appendix E) |

## Global Constraints

- The fork has no consumers. No compatibility path and no migration code.
- Never weigh upstream parity.
- LLMR never writes `~/.claude.json` and never deletes or migrates `~/.claude/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Do not pass `--scope`.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`. Restore them afterwards with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- Before each PR: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and the package suites the task touches. Tasks 3, 4c and 5 also run `npm run test:e2e`. Task 3 also runs `npm run test:system`.
- Merging needs the owner's word, once per PR.
- No two tasks run at the same time. Start each task from `main` after the task before it has merged.
- Tasks 1, 2 and 3 ship in the same release. Task 3 without Task 1 leaves a new install unable to connect any agent.
- No test, script or doc in this repo names a real provider host or holds a key.

## Review Focus

Each line names a condition no finding's own test covers. The test that pins it sits in the task named at the end of the line.

1. A config that v8.0.0 saved with `profile.enabled: false` and one enabled profile loads with that profile applied. Task 1, Step 1.
2. A new install saves its config with no enabled profile, then the user enables one profile and saves again. The profile applies. Task 3, Step 4.
3. A user who already has a `~/.codex/config.toml` with their own `model` and `model_provider` finishes onboarding with Claude Code. LLMR leaves the Codex file byte for byte unchanged. Task 3, Step 3.
4. A user has a hand-written `~/.claude/settings.json` with their own `env` block. LLMR applies a profile and the user then clicks **Restore original settings**. The file parses to the same settings the user wrote. Formatting may change, because the Claude Code stripper writes the file back with `JSON.stringify`. The `#1951` recovery test in `web-management-server.test.mjs` already pins this by deep equality, and Task 4a keeps it green.
5. LLMR created `~/.codex/config.toml`, and the user or Codex later added an `[mcp_servers.x]` table to it. After a restore the file still holds that table and none of LLMR's blocks, and no file under `~/.codex` holds the profile's token value. Task 4a, Step 2.
6. A user had their own `~/.codex/config.toml` with `model_provider = "openai"`, and added an `[mcp_servers.x]` table while LLMR had the file. After a restore the file holds that table and `model_provider = "openai"`, and none of LLMR's content. A file nobody touched while LLMR had it comes back byte for byte. Task 4b, Step 1.
7. A stale `.llmr-original-missing` marker sits beside a real original, as v8.0.0 left it after a restore. A restore still gives that original back. Task 4d Part 1, Step 1, and Task 4e, Step 1.
8. With no original, the user appends a table to `config.toml`, LLMR re-applies with a changed model, the user deletes the table, and then restores. The table does not come back. Task 4b, Step 1.

## Order

Run the tasks in this order, one at a time.

| Position | Task | Phase | Status | Why here |
|---|---|---|---|---|
| 1 | 0 | A | Merged, PR 128 | The scripts every later check uses |
| 2 | 1 | A | Merged, PR 129 | Task 3 breaks new installs without it |
| 3 | 3 | A | Merged, PR 130 | Changes the default config that every later test builds on |
| 4 | 2 | A | Merged, PR 131 | Edits `gateway-service.ts` before Task 5 does |
| 5 | 4a | A | Merged, PR 132 | Its tests need Task 3's defaults, and it uses Task 2's `reconcileProfileApiKeys` |
| 6 | 4d Part 1 | A | Merged, PR 133 | The F-23 guard |
| 7 | 4e | A | Next | Corrects the guard Part 1 shipped, in the same function, before anything else builds on it |
| 8 | 4d Parts 2 to 4 | A | | Makes the stripper exact and adds the safety copy before Task 4b strips on every quit. One PR each, in order |
| 9 | 4b | A | | Builds on the Codex stripper from Task 4a and the record from Task 4d |
| 10 | 4c | A | | Edits `disabledRestoreStatus` after Tasks 4a and 4b settle what a restore returns |
| 11 | 5 | A | Blocked on V-6 | Edits `gateway-service.ts`, `layout.tsx` and `onboarding.tsx` after Tasks 2 and 3 |
| 12 | 10 | A | | Investigation, no code. Steps 1 and 2 here. Steps 3 and 4 run inside Task 11's Pass 2, and Step 5 follows it |
| 13 | 11 | A | | The owner's VM pass and the release |
| 14 | 6 | B | | Edits `profiles.tsx` and `network-logs.tsx` |
| 15 | 9 | B | Blocked on V-8's default | Edits `network-logs.tsx` after Task 6 |
| 16 | 7 | B | | Edits `layout.tsx` after Task 5 |
| 17 | 8 | B | | Independent, and its cause is not known |

---

### Task 0: Put the VM check scripts in the repo

The scripts that ran the 2026-11-20 pass live outside the repo, in the owner's shared VM folder at `~/vm-proof/llmr/`.

**Files:**
- Create: `scripts/vm-proof/install-check.sh`, `scripts/vm-proof/collect.sh`, `scripts/vm-proof/gateway-check.sh`, `scripts/vm-proof/app-console.sh`
- Create: `scripts/vm-proof/README.md`

**Interfaces:**
- Produces: `install-check.sh [dmg name]`, `collect.sh [label]`, `gateway-check.sh [base url]`, `app-console.sh [seconds]`. Each writes a log to `logs/` beside itself. Task 11 calls them by these names.

- [ ] **Step 1: Copy the four scripts from `~/vm-proof/llmr/` unchanged.** Leave `unlatch-profiles.sh` out. It edits the database by hand to prove F-15 and has no use after Task 1.
- [ ] **Step 2: Confirm the logs stay out of git.** Run `git check-ignore scripts/vm-proof/logs/x.log`. Expected: the path is printed. If it is not, add `scripts/vm-proof/logs/` to `.gitignore`.
- [ ] **Step 3: Write `README.md`.** State, as commands: build a local dmg with `npm run build:app:mac`, copy the dmg from `release-local/` and the scripts into the shared folder, start the VM in UTM disposable mode, run `./install-check.sh <dmg name>` in the guest. State that a local build is signed ad hoc, so `spctl` rejects it and the app's updater does not run. Those two checks apply only to a release build.
- [ ] **Step 4: Run `bash -n` on each script.** Expected: no output.
- [ ] **Step 5: Commit.** `chore(scripts): add the clean-VM check scripts`

---

### Task 1: Stop the profile master switch sticking at off (F-15)

`synchronizeLegacyProfileConfig` computes `profile.enabled !== false && profiles.some((item) => item.enabled)` and saves the result. Once every profile has been off together, the saved `false` makes the first operand false for good. `profileEntries` then treats every profile as disabled.

**Files:**
- Modify: `packages/core/src/config/config.ts:469-471`
- Test: `packages/core/test/unit/config/profile-legacy-sync.test.mjs`

**Interfaces:**
- Produces: `AppConfig["profile"].enabled` is true exactly when at least one profile in `profile.profiles` is enabled, after any load or save. Tasks 3 and 4 rely on this.

- [ ] **Step 1: Change the test that pins the latch.** The block that saves `topLevelDisabledConfig` asserts the flag stays `false`. Under the new rule that config has enabled profiles, so every one of its assertions flips:

```js
const savedTopLevelDisabled = await saveAppConfig(topLevelDisabledConfig);
assert.equal(savedTopLevelDisabled.profile.enabled, true);
assert.equal(savedTopLevelDisabled.profile.claudeCode.enabled, true);
assert.equal(savedTopLevelDisabled.profile.codex.enabled, true);
assert.equal(savedTopLevelDisabled.profile.profiles.some((profile) => profile.enabled), true);

const rawTopLevelDisabled = await loadPersistedAppConfig();
assert.equal(rawTopLevelDisabled.profile.enabled, true);
assert.equal(rawTopLevelDisabled.profile.claudeCode.enabled, true);
assert.equal(rawTopLevelDisabled.profile.codex.enabled, true);
```

Leave the "without profiles" block and the stale legacy block as they are. Then add the stuck-config case **as the last statements of the test**. It must come last, because `replacePersistedAppConfig` changes the stored revision and a later `saveAppConfig` with an older `configRevision` throws `AppConfigConflictError`.

```js
const stuckConfig = createDefaultAppConfig();
stuckConfig.profile.enabled = false;
await replacePersistedAppConfig(stuckConfig);
const loadedStuckConfig = await loadAppConfig();
assert.equal(loadedStuckConfig.profile.enabled, true);
```

- [ ] **Step 2: Run the test and watch it fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/config/profile-legacy-sync.test.js`
Expected: FAIL on `savedTopLevelDisabled.profile.enabled`, actual `false`.

- [ ] **Step 3: Derive the flag from the profiles.** In `synchronizeLegacyProfileConfig`, make the line `const profileEnabled = profiles.some((item) => item.enabled);`.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Run `npm run test:core`.** Four tests set `config.profile.enabled = false` on an in-memory config and never save it. They keep passing. Name any test that fails in the PR.
- [ ] **Step 6: Commit.** `fix(profiles): derive the profile master switch from the profiles`

---

### Task 3: Take over only the agent the user chose (F-6, F-5)

The default config ships `default-claude-code` and `default-codex` enabled (`packages/core/src/config/default-config.ts:157,179`). Onboarding edits the first enabled profile for the chosen agent and never touches the other, so launch applies both. A user who picks Claude Code gets `~/.codex/config.toml` rewritten to route Codex through LLMR. A Docker container with no saved config does the same under `/data`.

**Files:**
- Modify: `packages/core/src/config/default-config.ts:130,146,153,157,179`
- Modify: `packages/cli/src/cli.ts:626-627`
- Create: `packages/ui/src/pages/home/shared/onboarding-profile.ts`
- Modify: `packages/ui/src/pages/home/App.tsx:187,783-787,819-822,3005-3013`
- Modify: `packages/ui/src/pages/home/shared/options.ts:397-410`
- Modify: `packages/ui/src/pages/home/components/onboarding.tsx`, `packages/ui/src/pages/home/components/profiles.tsx:846-848`
- Test: `packages/core/test/unit/config/default-config.test.mjs` (create if absent), `packages/core/test/unit/config/profile-legacy-sync.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/ui/test/unit/onboarding-profile.test.ts`, `packages/ui/test/component/onboarding.test.tsx`, `packages/ui/test/component/profiles.test.tsx`

**Interfaces:**
- Consumes: Task 1's rule for `profile.enabled`.
- Produces: `export function onboardingProfileIndex(profiles: ProfileConfig[], agent: ProfileConfig["agent"]): number` in `onboarding-profile.ts`. It returns the index of the global profile for `agent` whether or not that profile is enabled, or `-1`.
- Produces: `export function withOnboardingProfile(profiles: ProfileConfig[], index: number, profile: ProfileConfig): ProfileConfig[]`. It returns the list with `profile` at `index` and `enabled: true` forced on it, appended when `index` is `-1`. No other entry changes. The force matters, because `profileConfigFromDraft` keeps `existingProfile?.enabled ?? true` (`shared/profiles.ts:729`) and the existing default is now disabled.
- Produces: `OnboardingReadinessOptions.profileSkipped?: boolean` in `options.ts`.

- [ ] **Step 1: Write the failing default-config test.**

```js
test("the default config takes over no agent", () => {
  const config = createDefaultAppConfig();
  assert.equal(config.profile.profiles.every((profile) => !profile.enabled), true);
  assert.equal(config.profile.enabled, false);
});
```

- [ ] **Step 2: Write the failing onboarding tests.**

```ts
test("onboarding enables the chosen agent's default profile and leaves the other off", () => {
  const profiles = createDefaultAppConfig().profile.profiles;
  const index = onboardingProfileIndex(profiles, "claude-code");
  const next = withOnboardingProfile(profiles, index, { ...profiles[index], model: "p/m" });
  assert.equal(next.find((profile) => profile.agent === "claude-code")?.enabled, true);
  assert.equal(next.find((profile) => profile.agent === "codex")?.enabled, false);
  assert.equal(next.length, profiles.length);
});
```

- [ ] **Step 3: Write the failing test for Review Focus 3.** In `profile-service.test.mjs`, copy the fixture of an existing apply test. Write a `~/.codex/config.toml` in the test home that holds `model = "gpt-5"` and `model_provider = "openai"`. Build `createDefaultAppConfig()`, add one provider with a model, and set `enabled = true` on `default-claude-code` only. **Do not touch `default-codex`.** Leave it as the default config ships it, or the test passes before the fix. Call `applyProfileConfig(config)`. Assert that the Codex file's content equals what the test wrote.
- [ ] **Step 4: Write the failing test for Review Focus 2.** In `profile-legacy-sync.test.mjs`, a new test:

```js
test("a new install can enable its first profile after an earlier save", async () => {
  const saved = await saveAppConfig(createDefaultAppConfig());
  assert.equal(saved.profile.enabled, false);
  saved.profile.profiles[0].enabled = true;
  const savedAgain = await saveAppConfig(saved);
  assert.equal(savedAgain.profile.enabled, true);
});
```

It passes only with Task 1 merged. That is the point of it.

- [ ] **Step 5: Run the four tests and watch them fail.** Steps 1 and 4 fail on the first assertion. Step 2 fails to compile. Step 3 fails because LLMR rewrote the Codex file.
- [ ] **Step 6: Set `enabled: false`** on both default profiles (lines 157 and 179), on the legacy `claudeCode` and `codex` blocks (lines 130 and 146) and on `profile.enabled` (line 153).
- [ ] **Step 7: Add the two functions and use them in `App.tsx`.** In `submitProfileDraft` the local constant at line 3005 is already named `onboardingProfileIndex`. Rename it to `onboardingIndex` first, or the call to the imported function inside its own initializer is a compile error. The prefill effect at 819 and `submitProfileDraft` both call `onboardingProfileIndex`, and `submitProfileDraft` builds the list with `withOnboardingProfile`. Without this step onboarding finds no enabled profile, appends a third profile with scope `llmr` and leaves both defaults off. The prefill from the default profile is also what keeps **System default** selected (V-11).
- [ ] **Step 8: Name the file on the step (V-11).** Under the Effect scope field in `profiles.tsx`, when `draft.scope === "global"`, render one sentence. For Claude Code: `LLMR rewrites ~/.claude/settings.json while it runs. It keeps a copy of your file if you had one, and puts things back when you quit LLMR or click Restore original settings.` For Codex the same sentence with `~/.codex/config.toml`. Add a component test in `profiles.test.tsx` that the sentence renders for the global scope and not for the `llmr` scope.
- [ ] **Step 9: Add Skip for now (V-5).** In `onboarding.tsx`, add a secondary button labelled `Skip for now` on the "Connect agent" step. It sets a new `onboardingProfileSkipped` state in `App.tsx` beside `onboardingProfileConfirmed` (line 187) and saves no profile. Pass it as `profileSkipped` in the readiness options object and add it to that memo's dependency list (`App.tsx:783-787`). `isOnboardingProfileReady` returns true when `profileSkipped` is set. On the "Let's start" step the Profile row shows `Skipped. Add one under Agent Profiles.` in place of the check or the cross. Add a component test that the button renders on that step only, a component test of the skipped Profile row, and a unit test of `isOnboardingProfileReady` with and without `profileSkipped`.
- [ ] **Step 10: Fix the CLI help.** Replace the two `default-codex` examples in `cli.ts:626-627` with examples that use `<profile>` and do not assume an enabled default. No test pins those lines.
- [ ] **Step 11: Run the new tests.** Expected: PASS.
- [ ] **Step 12: Run `npm run test:core`, `npm run test:ui`, `npm run test:cli` and `npm run test:e2e`.** 54 test files call `createDefaultAppConfig()`. Each one that expected an enabled default profile now sets `enabled = true` on the profile it needs, in its own setup. Fix them in this PR and list them in the PR body.
- [ ] **Step 13: Assert the Docker case.** Add to the system test script an assertion that a container started with no saved config has neither `/data/.claude` nor `/data/.codex`. Run `npm run test:system`. Expected: PASS. Before this task the container applies both defaults at start (`packages/core/src/web/management-server.ts:576`).
- [ ] **Step 14: Write the release note line in the PR body.** An install that ran 8.0.0 keeps both profiles enabled. Switch the Codex profile off under Agent Profiles if you did not choose it.
- [ ] **Step 15: Commit.** `fix(onboarding): take over only the agent the user chose`

---

### Task 2: Give the gateway the profile keys before it starts (F-16)

The gateway child takes its key list from a config compiled when the child starts (`coreGatewayStaticAuthKeys`, `packages/core/src/gateway/core-runtime/config-compiler.ts:214`). A profile key is created inside the profile apply (`ensureProfileApiKeys`, `packages/core/src/profiles/service.ts:928`), and every call site starts or updates the gateway before it applies profiles. So the gateway starts without the key. The same order means a key pruned by an apply stays valid until the next restart.

A second fault hides the change from a later save. `ensureProfileApiKeys` assigns `config.APIKEYS` on the object `GatewayService` holds as `this.config`, so `shouldRestartGatewayForRuntimeConfigChange(this.config, config)` compares a list with itself.

The fix moves key creation ahead of the gateway and keeps the restart count at one (V-13). A profile save already restarts the child, because the restart signature includes `profile` (`packages/core/src/gateway/runtime-change.ts:32`).

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (new export beside `ensureProfileApiKeys`)
- Modify: `packages/core/src/gateway/runtime-change.ts` (export the signature function)
- Modify: `packages/core/src/gateway/application/gateway-service.ts:170,431,441,676,693`
- Modify: `packages/electron/src/main/ipc.ts:347`, `packages/electron/src/main/main-app.ts:223,258`, `packages/core/src/web/management-server.ts:490,570,604`, `packages/core/src/profiles/launch-service.ts:110,159`
- Test: `packages/core/test/unit/gateway/gateway-status.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Produces: `export async function reconcileProfileApiKeys(config: AppConfig): Promise<void>` in `profiles/service.ts`. It runs the same pruning and creation that `applyProfileConfigNow` runs through `pruneInactiveProfileApiKeys` and `ensureProfileApiKeys`, and writes no agent file. It needs no running gateway. It sets `config.APIKEYS` to the persisted list.
- Produces: `export function runtimeGatewayConfigSignature(config: AppConfig): string` in `runtime-change.ts`.

- [ ] **Step 1: Write the failing key tests.** In `profile-service.test.mjs`:

```js
test("profile keys exist before any gateway runs", async () => {
  const config = configWithProviderAndEnabledProfile("default-claude-code");
  await reconcileProfileApiKeys(config);
  assert.equal(config.APIKEYS.some((key) => key.name === "Profile: Claude Code"), true);
});

test("a profile switched off loses its key", async () => {
  const config = configWithProviderAndEnabledProfile("default-claude-code");
  await reconcileProfileApiKeys(config);
  config.profile.profiles.find((profile) => profile.id === "default-claude-code").enabled = false;
  await reconcileProfileApiKeys(config);
  assert.equal(config.APIKEYS.some((key) => key.name === "Profile: Claude Code"), false);
});
```

`configWithProviderAndEnabledProfile` is a helper you add to the test file. It builds the default config, adds one provider with a model and enables the named profile.

- [ ] **Step 2: Write the failing restart test.** `gateway-runtime-change.test.mjs` tests only a pure function and starts no gateway, so it cannot hold this test. Put it in `gateway-status.test.mjs` and reuse that file's fixture: set `LLMR_GATEWAY_ENTRY` to `delayedHealthyGatewayEntry()` and start with `gatewayTestConfig(await reserveLoopbackPort())`, as the test near line 146 does. The file has no spawn counter. Detect a restart by a change in `gatewayService.getStatus().pid`.

```js
test("a key added in place to the held config restarts the gateway", async () => {
  const config = gatewayTestConfig(await reserveLoopbackPort());
  await gatewayService.start(config);
  const pidBefore = gatewayService.getStatus().pid;
  config.APIKEYS = [...config.APIKEYS, { id: "profile-key", key: "llmr-pro-test-key-0123456789abcdef", name: "Profile: Claude Code" }];
  await gatewayService.updateConfig(config);
  assert.notEqual(gatewayService.getStatus().pid, pidBefore);
});
```

- [ ] **Step 3: Run the three tests and watch them fail.** The first two fail to import `reconcileProfileApiKeys`. The third fails because the pid is unchanged.

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/gateway-status.test.js`

- [ ] **Step 4: Add `reconcileProfileApiKeys`.** Build it from the two existing private functions. Do not copy their bodies.
- [ ] **Step 5: Compare against a saved signature.** Export `runtimeGatewayConfigSignature`. In `GatewayService`, add `private runtimeConfigSignature?: string` and set it at each of the three places that assign `this.config`. In `updateConfig` and in `reloadPersistedRuntimeConfig` (line 676), decide the restart from `this.runtimeConfigSignature !== runtimeGatewayConfigSignature(nextConfig)`, not from `this.config`.
- [ ] **Step 6: Call `reconcileProfileApiKeys` before the gateway.** At each site under Files, call it on the config before the line that starts, restarts or updates the gateway. In `ipc.ts` that is before `shouldRestartGatewayForRuntimeConfigChange(previousConfig, savedConfig)`. The profile apply that follows finds the keys in place and changes nothing.
- [ ] **Step 7: Run the tests.** Expected: PASS. Then `npm run test:core` and `npm run test:electron`.
- [ ] **Step 8: State the limit in the PR.** `llmr <profile>` (`packages/cli/src/cli.ts:157`) can run while the desktop app owns the gateway in another process. This task does not reach that process. It is listed under Open items.
- [ ] **Step 9: Commit.** `fix(gateway): create profile keys before the gateway starts`

---

### Task 4a: Strip only LLMR's content from a Codex config that had no original (F-18, F-21, part of F-13)

Rewritten twice on 2026-11-21: after the restore research, then after an audit of that rewrite (Appendix C). Line numbers in `packages/core/src/profiles/service.ts` drift, so this task names symbols.

`restoreGlobalConfigFile` handles "the original did not exist" in its last branch. It copies LLMR's managed file to a timestamped backup, removes the file and keeps the `.llmr-original-missing` marker. For Codex that backup holds the profile's token.

**The two agents differ, and the difference is a data-loss risk.**
- Claude Code has a stripper, `stripManagedClaudeCodeSettingsContent`. A file counts as managed only when it holds nothing but LLMR's settings (`isManagedClaudeCodeSettingsContent`).
- Codex has no stripper. A file counts as managed when it merely contains LLMR's marker or its provider table (`isManagedCodexConfigContent`), and every Codex restore call site passes `isManagedContent` alone. So a `~/.codex/config.toml` that LLMR created and the user or Codex later added to is removed whole. Codex adds to it on its own: it saves folder trust, the chosen model and MCP servers there.

**The same code runs with nobody watching.** `restoreInactiveGlobalProfileConfigs` calls `restoreGlobalConfigFile` on every apply, and `restoreGlobalProfileConfigsOnExit` reaches it on a gateway stop and a quit through `disabledProfileStatus`, the same call site as the button. Every rule in this task holds on those paths too.

**What LLMR writes into `config.toml`** (`buildCodexConfigToml`, read by the plan author on 2026-11-21):
- A root block between `managedRootStart` and `managedRootEnd`, placed first: `model_provider`, a `model` line, `model_catalog_json`, a `# LLMR configured model = ` comment, and a `show_all_sessions` line when the user had one or the profile sets it.
- A provider block between `managedProviderStart` and `managedProviderEnd`, appended last: `[model_providers.<id>]` with `experimental_bearer_token`.
- A ToolHub MCP block and a Context Archive MCP block, each between its own marker pair and each only when that feature is on. Both carry the token under another key (`env`, an `Authorization` header).
- It removes the user's root `model`, `model_catalog_json`, `model_provider` and `show_all_sessions`, and the user's `[profiles.<providerId>]` table. `managedModelAssignment` keeps the user's own `model` line inside the root block until the profile's model changes.
- It moves the user's remaining root lines below the root block and collapses runs of four or more newlines.

Nothing is displaced when no original existed, so this task puts nothing back. Task 4b does.

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`restoreGlobalConfigFile`, the three Codex restore call sites, `recoverGlobalAgentProfile`), `packages/core/src/profiles/backup-files.ts`
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs` (beside the `#1951` recovery tests), `packages/core/test/unit/profiles/backup-files.test.mjs`

**Interfaces:**
- Produces: `stripManagedCodexConfigContent(content: string, providerIds: string[]): string | undefined`. Task 4b adds a `displaced` argument when it has a caller.
  - It removes each line by what the line holds, never by where it sits. Codex writes its own new tables inside LLMR's last marker pair (checked with codex-cli 0.171.0 and `codex mcp add`, 2026-11-21), so a rule that deleted everything between the markers would delete the user's table.
  - It removes: the eight marker lines; in the root section, a `model_provider` equal to a given id, a `model_catalog_json` that points at `llmr-model-catalog.json`, the `# LLMR configured model = ` comment and a `model` line equal to that comment's value; a `show_all_sessions` line only inside the root marker pair; `[model_providers.<id>]` for each given id; and LLMR's ToolHub and Context Archive MCP tables with their child tables.
  - Everything else stays, wherever it sits. It re-serialises nothing, so the user's comments and table order survive. A second call on its own output returns `undefined`.
- Produces: a per-format test for "nothing left". TOML: whitespace only. Claude Code JSON: `{}` or an object whose only key is an empty `env`.
- Produces: `RestoreFileResult` gains `removed?: boolean`, true when the restore deleted a file whose original was missing.
- Consumes: `reconcileProfileApiKeys` from Task 2.

- [ ] **Step 1: Confirm two things the design rests on.**
  - Re-read `buildCodexConfigToml` against the list above. If the code disagrees, the code wins and the interface changes with it.
  - Check that Codex keeps LLMR's comment markers when it rewrites `config.toml` itself. Where `command -v codex` finds Codex, run it against a copy of an applied file in a temp `CODEX_HOME`, change one setting from the CLI, and diff. Where it does not, say so in the PR. The value fallback in the interface covers a file whose markers are gone, and Task 11's third pass checks it on a real install.
- [ ] **Step 2: Write the failing tests.** Each builds its config with `configWithProviderAndEnabledProfile`, which sets the top-level flag. A default config applies nothing, and every assertion below would then pass with no fix. Each test asserts, after the apply and before the restore, that `config.toml` exists and contains the profile's token value. Read that value from `loadPersistedApiKeys()` and assert on it. `experimental_bearer_token` is one of three places the token is written.
  - Codex, no original, through `recoverGlobalAgentProfile` after `replacePersistedAppConfig(config)`: `config.toml` is gone, `config.toml.llmr-original-missing` is gone, and no file under `~/.codex` contains the token value.
  - Codex, Review Focus 5: after the apply, append `[mcp_servers.mine]` with `command = "my-server"` and a `[projects."/tmp/x"]` table with `trust_level = "trusted"`, then recover. The file matches `/\[mcp_servers\.mine\]/` and `/trust_level/`, and does not match `/model_providers\.llm-router|LLMR managed|llmr-model-catalog/`. No file under `~/.codex` contains the token value, and no `.llmr-original-missing` marker remains.
  - Codex, the user's own model: after the apply, change the root `model` line to a value LLMR did not write, then recover. That line is still there.
  - Codex, markers removed by hand: after the apply, delete the four marker comment lines, then recover. The provider table and LLMR's `model_provider` line are gone.
  - Codex, idempotent: recover twice. The second changes no byte and writes no backup.
  - Codex, profile switched off through `applyProfileConfig` while a Claude Code profile stays enabled. Same assertions as Review Focus 5. This reaches the `!profile.enabled` branch of `applyCodexProfile`.
  - Codex, profile deleted from the config, then `applyProfileConfig`. Same assertions. This reaches the Codex branch of `restoreInactiveGlobalProfileConfigs`.
  - Claude Code, no original: apply, recover. The settings file is gone and its directory holds no name that contains `llmr`.
  - Key revoked: after recover, `loadPersistedApiKeys()` holds no `profile:default-codex` key. Before recover it did.
  - An agent with no stripper is unchanged: restore an OpenCode profile that had no original. Its backup still exists.
- [ ] **Step 3: Run the tests and watch them fail.** The Codex content tests fail because the whole file is removed. The no-original tests fail on a leftover backup and marker. The key test fails because the key outlives the restore.
- [ ] **Step 4: Add `stripManagedCodexConfigContent`.** Pass it as `stripManagedContent` at the three Codex restore call sites, and only when the profile's agent is `codex`: the `!profile.enabled` branch of `applyCodexProfile`, the Codex tail of `disabledProfileStatus`, and the Codex branch of `restoreInactiveGlobalProfileConfigs`. The first two are shared with Workbuddy, which keeps today's behaviour. The third has several provider ids and no profile, so it passes them all.
- [ ] **Step 5: Change the missing-original branch of `restoreGlobalConfigFile`.**
  - With a stripper: strip the current content. If nothing is left by the per-format test, remove the file and return `removed: true`. Otherwise write the stripped content.
  - With a stripper, write no backup in this branch. A backup of the stripped file would equal the new live file, and a backup of the unstripped file would hold the token.
  - With a stripper, remove the `.llmr-original-missing` marker in every outcome of this branch, including the one where the file is already absent. The next takeover then records the user's file as the original.
  - With a stripper, delete every backup in `backupFiles(file)`. Each is a copy from LLMR's time, and the live file already holds the user's content. A stripped backup no longer tests managed, so `originalSnapshotCandidate` would take it for the user's original and write it back.
  - Do it in this order: settle the live file, delete the backups, remove the marker last. A failure midway then leaves a state the next restore still recognises.
  - Without a stripper, change nothing. A file LLMR calls managed can still hold the user's content for these agents, so no backup of theirs is ever deleted.
  - These rules apply to Claude Code too when no original existed. When an original existed, the strip branch keeps writing its pre-strip backup: the Claude Code stripper removes values under LLMR's own key names, and that backup is the only copy of one the user set during the takeover.
- [ ] **Step 6: Revoke the key.** In `recoverGlobalAgentProfile`, call `await reconcileProfileApiKeys(config)` inside the existing `try` that wraps `refreshRuntime`, before `refreshRuntime`. Both `refreshRuntime` callers end in `gatewayService.updateConfig`, which restarts the gateway when the key list changes. A token left in any copy is then refused.
- [ ] **Step 7: Run the tests.** Expected: PASS, including the `#1951` tests, `backup-files.test.mjs` and the OpenCode, Kilo, Pi and Workbuddy restore tests in `npm run test:core`.
- [ ] **Step 8: State the limit in the PR.** A Codex file whose original existed still goes back to the pre-takeover snapshot, and apply-time backups still hold the token until Task 4b. A quit does not revoke the key, because the profile stays enabled.
- [ ] **Step 9: Commit.** `fix(profiles): remove only LLMR's content when a restore finds no original`

---

### Task 4d: Make the Codex strip exact, and keep a safety copy of what a strip changes (F-23 to F-26, F-28)

Runs after Task 4a and before Task 4b. Added on 2026-11-21 after the stripper from Task 4a was measured against real Codex, then corrected by two audits against the code the same day (Appendix D).

**This task is four PRs, in this order.** Part 1 (F-23, merged as PR 133), then Task 4e, then Part 2 (F-26), Part 3 (F-24, F-25) and Part 4 (the safety copy, F-28). Each is one branch from `main` after the one before it merged.

Task 4a's stripper decides what is LLMR's by reading the text. Measured against codex-cli 0.171.0, that guess fails in ways real Codex reaches:
- **LLMR's `model` line is left behind (F-24).** After a re-apply, the user's `[mcp_servers.*]` tables sit right under LLMR's root block. `codex mcp add` rewrites that section and drops the comment lines above the first table, which are `# LLMR configured model = ` and the root END marker. The stripper recognises LLMR's `model` line only by that comment. Rerun three times.
- **The same state stops a model change from applying.** With the comment gone, `managedModelAssignment` keeps LLMR's old `model` line as if it were the user's. Run by the second auditor: the `model` line kept the old value while the comment took the new one.
- **The user's `show_all_sessions` is lost (F-25).** Codex writes root keys inside LLMR's root block, and the stripper removes that key there.
- **A multi-line string is damaged (F-26).** Codex writes `"""` strings itself. A string line that reads like an LLMR table header ends the stripper's root scan early or is removed with "its table", and the file can stop loading.
- **A Claude Code restore writes back a deleted setting (F-23).** With no original, `restoreGlobalConfigFile` asks `originalSnapshotCandidate` for a snapshot before it reaches the no-original branch. A backup that holds a key the user later deleted is unmanaged, so it is taken for the original. Reproduced by the plan author on `main`.

**Evidence status.** F-23 and F-24 were rerun. F-25, F-26 and the counts in Appendix D are a research agent's measurements. Part 1 is merged (PR 133, `2e83ff7c`). Parts 2 to 4 are designs that two audits checked against the code, and nobody has built them.

**The file Codex leaves (F-24), for the tests.** Produced with codex-cli 0.171.0 by `codex mcp add other -- other-cmd` on a re-applied file. Path and token replaced.

```toml
# BEGIN LLMR managed profile
model_provider = "llm-router"
model = "Provider/model"
model_catalog_json = "/tmp/codex-home/llmr-model-catalog.json"

[mcp_servers.mine]
command = "my-server"

[mcp_servers.other]
command = "other-cmd"

# BEGIN LLMR managed Codex provider
[model_providers.llm-router]
name = "LLM Router"
base_url = "http://127.0.0.1:3456/v1"
experimental_bearer_token = "llmr-profile-TEST"
wire_api = "responses"
# END LLMR managed Codex provider
```

Before Codex ran, the file also had `# LLMR configured model = "Provider/model"` and `# END LLMR managed profile` after the catalog line, `[mcp_servers.mine]` directly after that END marker, and no `other` table.

To rerun it where `command -v codex` finds Codex: write the re-applied file and a valid one-model catalog built with `codexModelCatalogJson` into a temp directory `$T`, with `model_catalog_json` pointing into `$T`. Codex refuses a config whose catalog is missing or empty. Run `env -i PATH="$PATH" HOME=$T CODEX_HOME=$T codex mcp add other -- other-cmd`, and diff `config.toml` only, because Codex also creates `tmp/`. Never use the real `~/.codex`.

#### Part 1: Do not take a backup for the original when none existed (F-23)

Merged as PR 133. Its Step 2 test was replaced by Task 4e's narrower one.

**Files:** `packages/core/src/profiles/service.ts` (`restoreGlobalConfigFile`, `originalSnapshotCandidate`), `packages/core/test/integration/profiles/profile-service.test.mjs`

- [ ] **Step 1: Write the failing tests.**
  - F-23: Claude Code, no original, add a `permissions` key, re-apply with a changed model so a backup is written (the provider needs a second model), delete the key, recover. The settings file is gone and its directory holds no name that contains `llmr`.
  - A stale marker keeps a real original: write a `.llmr-original-missing` marker by hand beside a user `config.toml` that holds `model_provider = "openai"`, apply, recover. The file is byte for byte what the user wrote. v8.0.0 kept the marker after a restore, so installs in this state exist. This passes today and must keep passing.
- [ ] **Step 2: Narrow the lookup.** Do not skip `originalSnapshotCandidate`. When the local `strip` is set (it is `undefined` under `keepLiveFile`), `originalMissing` is true and `.llmr-original` is absent, accept only a backup for which `strip(content)` returns `undefined`. Such a backup holds nothing of LLMR's, so it predates the takeover. F-23's backup holds LLMR's `env` and is refused.
- [ ] **Step 3: Run `npm run test:core`, `npm run typecheck`, `npm run lint`. Commit.** `fix(profiles): do not restore a backup as the original when no original existed`

#### Part 2: Make the stripper's scan aware of multi-line values (F-26)

**Files:** create `packages/core/src/profiles/codex-config-strip.ts`; modify `packages/core/src/profiles/service.ts`; test `packages/core/test/unit/profiles/codex-config-strip.test.mjs` (new)

No TOML parser is in any `package.json` or in `node_modules`, and a parser could not make a line-preserving edit, so the scan is written by hand.

- [ ] **Step 1: Move the stripper** to `codex-config-strip.ts` with what it depends on: the eight marker constants and `codexManagedMarkers`, `managedConfiguredModelPrefix`, `managedConfiguredModel`, `removeTomlTable`, `removeCodexProviderTable`, `removeCodexMcpServerTable`, `isCodexMcpServerChildTable` and `escapeRegExp`. `service.ts` imports them back for the writer. The new file never imports `service.ts`. Change no behaviour. Run `npm run test:core`: a green run is the check that nothing changed.
- [ ] **Step 2: Write the failing unit tests** on the exported stripper.
  - A root `developer_instructions = """` string that holds the lines `[model_providers.llm-router]`, `# END LLMR managed Codex provider` and `[docs](https://example.com)` comes back byte for byte, with LLMR's real content gone. The same for a multi-line array whose lines start with `[`, for a one-line string that contains `"""`, and for a `'''` string.
  - A file with nothing of LLMR's, including one whose multi-line string holds LLMR-like lines, returns `undefined`.
  - `[model_providers."llm-router"]`, `[mcp_servers.llmr-toolhub.env]`, a header with a trailing comment and a `[[array.of.tables]]` header are each handled.
- [ ] **Step 3: Add `scanTomlLines(content)`.** It yields each line with `inValue: boolean`, the state at the start of the line: inside a multi-line string, or at a bracket depth above 0. It reads each line character by character.
  - It skips `#` comments outside strings.
  - It skips one-line `"…"` strings, with backslash escapes, and `'…'` strings. A one-line string ends at the end of its line.
  - It tracks `"""` strings, with backslash escapes, and `'''` strings. The closing run may be up to five quotes for both.
  - It counts brackets and braces on every line outside strings and comments, so a header such as `[a."b]#"] # c` or `[[x]]` returns to depth 0.

  A line is a table header only when it starts with `[` while `inValue` is false.
- [ ] **Step 4: Add `removeTablesOutsideValues(content, isHeader)`.** `isHeader` receives the header line trimmed, with any trailing comment removed. A removed table runs to the next header line or the end of the file. Blank and comment lines directly above that next header stay. A child table is a separate table, so the predicate must match `[mcp_servers.<name>.` itself. The stripper uses the scan for its root scan and this function in place of its calls to `removeCodexProviderTable` and `removeCodexMcpServerTable`. The writer keeps calling those two unchanged, and their faults are in Open items.
- [ ] **Step 5: Run the tests. Commit.** `fix(profiles): keep multi-line values intact when stripping a Codex config`

#### Part 3: Record which lines LLMR wrote, and strip exactly those (F-24, F-25)

**Files:** `packages/core/src/profiles/codex-config-strip.ts`, `packages/core/src/profiles/service.ts` (`applyCodexProfile`, `buildCodexConfigToml`, `managedModelAssignment`, `codexManagedContent`, `restoreGlobalConfigFile`, `RestoreManagedContentMatchers`); tests in `codex-config-strip.test.mjs` and `profile-service.test.mjs`

**Interfaces:**
- Produces: `type CodexWrittenRecord = { edited: boolean; file: string; modelLine?: string; sha256: string; showAllSessionsLine?: string }`, saved at `<CONFIGDIR>/agent-config-state/<first 16 hex of the SHA-256 of normalizedFileKey(file)>/written.json`.
  - `modelLine` and `showAllSessionsLine` are present only when that line is LLMR's own. Both are compared against `line.trim()`.
  - `sha256` is of the whole file as LLMR last wrote it. A re-apply rewrites the file and takes a new hash, so the hash alone cannot say that nobody edited the file. `edited` says it: true when a previous record exists and `sha256(source)` differs from `previous.sha256`, or when no record exists and the source tests managed. Once true it stays true until the record is cleared.
  - **Untouched** means: the record exists, `edited` is false and the hash matches the file. Task 4b and Part 4 use this word.
  - The key is `normalizedFileKey(file)`, not the profile and not the real path. One caller has no profile, and backups and markers already sit beside the link path.
  - Do not put it under `llmrManagedProfileDir(profile)/codex/`. That is where an LLMR-scope profile's generated `config.toml` lives.
  - Write it only when `profile.agent === "codex"` and the profile is global. `applyCodexProfile` also serves Workbuddy and generated-scope profiles, which no restore reaches.
  - A record that is unreadable, ill-shaped, or whose `file` differs from the key is no record. Reading it never throws.
- Produces: an exported pure function in `codex-config-strip.ts` that decides which lines are LLMR's, given the source, the previous record and what the profile sets. `buildCodexConfigToml` calls it and returns `{ content, modelLine?, showAllSessionsLine? }` in place of a string. Being pure and exported, it is unit-tested without the private builder.
- Produces: `stripManagedCodexConfigContent(content, providerIds, written?)`. With `written`, it removes a root `model` line only when it equals `written.modelLine`, and ignores the configured-model comment. It removes `show_all_sessions` only when it equals `written.showAllSessionsLine`. Without `written` it behaves as Task 4a left it.
- Produces: `RestoreManagedContentMatchers` gains `stripLiveContent?`, and `codexManagedContent(agent, providerIds, file)` gains a file argument. `restoreGlobalConfigFile` uses `options.stripLiveContent ?? options.stripManagedContent` for the live file. `originalSnapshotCandidate` keeps `stripManagedContent`, which never gets `written`. One closure serves both today, so without this split the user's original would be stripped with LLMR's record. The stripper that `restoreGlobalConfigFile` hands to `originalSnapshotCandidate` for the no-original test also stays `stripManagedContent` (still `undefined` under `keepLiveFile`), never `stripLiveContent`.
- Do not add fields to `GlobalProfileTakeoverRecord` (see Task 4b).

- [ ] **Step 1: Write the failing tests.** Add `CONFIGDIR/agent-config-state` to what `withAppliedDefaultProfiles` removes in its `cleanUp`. Every Codex test shares one `config.toml` path and so one record directory.
  - Unit, the ownership function, one case each: first apply with no original; re-apply with no change; profile model changed; the user replaced LLMR's `model` line; the user's model equals LLMR's; the F-24 state with the same model and with a changed one; an original with the user's `model` line, then a profile model change; `showAllSessions` switched on then off; a missing, corrupt or stale record.
  - Unit, the stripper: the F-24 fixture above with `written` loses LLMR's `model` line, and without it keeps the line. A `model` line the user changed stays. A user `model` equal to LLMR's stays when `written` has no `modelLine`, even with the comment present. A `show_all_sessions = false` the user wrote inside LLMR's root block stays.
  - Unit, a property test with a fixed seed. It assembles LLMR's blocks from the marker constants, places generated user content where Codex writes it, passes `written`, and compares non-blank lines: every user line survives, nothing of LLMR's remains, a second strip returns `undefined`. At least 500 cases. The generator must not produce a user line equal to one of LLMR's.
  - Integration: after an apply, `written.json` exists and its `sha256` matches the file. After each restore outcome it is gone.
  - Integration: a model change applies after Codex dropped the comment. Apply, delete the comment and the root END marker from the applied file, change the profile's model to a second model on the provider, apply. The root `model` line is the new model.
  - Integration: the original has `model = "X"`, the profile model goes to Y and back to X, recover. The user's line is back.
  - Integration: a stale record does not cost the user a line. Leave a record behind, write a user file whose `model` line equals the record's `modelLine`, apply, recover. The line is still there.
- [ ] **Step 2: Decide ownership.**
  - Ignore `previous` unless the source tests managed.
  - The `model` line is LLMR's when the source has no root `model` line, or the configured model changed, or the current root `model` line equals `previous.modelLine`. With no usable record, a `model` line whose value equals the configured-model comment is LLMR's.
  - When the current line equals `previous.modelLine`, treat the configured model as changed if that line differs from the one LLMR would write now. That applies a new profile model after Codex dropped the comment. It never overwrites a line the user changed, because that line no longer equals the record.
  - The `show_all_sessions` line is LLMR's when the user had none and the profile sets it, or when the current line equals `previous.showAllSessionsLine`. When it equals the record and the profile no longer sets it, write no line. Today that line survives being switched off.
- [ ] **Step 3: Write the record before the file.** In `applyCodexProfile`, write `written.json` atomically, then `config.toml`. With the file first, a crash between the two leaves LLMR's new `model` line recorded as the user's for good. With the record first, the next apply repairs it through the comment.
- [ ] **Step 4: Use the record in the strip.** Pass `written` through `stripLiveContent`, and only when the live content tests managed.
- [ ] **Step 5: Clear the record** inside `restoreGlobalConfigFile`, by file key, last, on every return except the `keepLiveFile` and `missingBackup` ones. That includes "already equals the snapshot". Clearing removes `written.json` only, never its directory, because Part 4 keeps the safety copies in the same directory. Do not use `onReleased`: the Codex branch of `restoreInactiveGlobalProfileConfigs` never calls it. The takeover sync restores before the apply loop runs, so a record it clears is written again by the apply that follows.
- [ ] **Step 6: Run the tests. State the limits in the PR. Commit.** `fix(profiles): strip exactly the lines LLMR recorded writing to a Codex config`. Limits: a crash can leave LLMR's old `model` line behind, and never removes a user's line. A re-apply still drops the user's own root `model_provider` (Task 4b). `isManagedCodexConfigContent` still calls a file managed when a user string holds `[model_providers.llm-router]`.

#### Part 4: Save a safety copy before a strip changes an edited file

**Files:** `packages/core/src/profiles/backup-files.ts`, `packages/core/src/profiles/service.ts` (`restoreGlobalConfigFile`); tests in `packages/core/test/unit/profiles/backup-files.test.mjs` and `profile-service.test.mjs`

**Interfaces:**
- Produces: `saveRemovedConfigCopy(stateDir, file, content)` in `backup-files.ts`. `service.ts` computes `stateDir`, which is Part 3's record directory for `file` (`<CONFIGDIR>/agent-config-state/<key>`), so `backup-files.ts` keeps importing nothing from `@llmr`. It creates `stateDir` with mode `0700`, writes `content` to `backupFilePath(path.join(stateDir, path.basename(file)))` with mode `0600` after replacing every match of `/(?:llmr|ccr)-profile-[A-Za-z0-9_-]+/g` with a placeholder, then calls `pruneBackups(path.join(stateDir, path.basename(file)), 3)`. Profile keys made before the `ccr` rename start with `ccr-profile-` and are kept for life. `originalSnapshotCandidate` reads only siblings of the agent's file, so it never sees these copies.

- [ ] **Step 1: Write the failing tests.**
  - Unit: four calls with distinct timestamps (`t.mock.timers.enable({ apis: ["Date"] })`) leave the newest three, each with mode `0600`, and none contains an `llmr-profile-` or `ccr-profile-` token.
  - Integration, each looking only in the record directory for this test's file:
    - The Review Focus 5 restore leaves one copy that holds the user's tables and LLMR's block, and not the profile's token value.
    - Codex: apply, recover, with no edit: no copy. The same for Claude Code.
    - Append a table, re-apply, recover: a copy exists. The re-apply took a new hash, and only `edited` shows that someone touched the file.
    - An edited Claude Code `settings.json` with no original leaves a copy.
- [ ] **Step 2: Save the copy, in a safe order.** In each of the two no-original paths of `restoreGlobalConfigFile`, when `strip(current)` returns content:
  - in the path where the live file tests unmanaged, always save. That file holds content LLMR did not write, and it is the only path an edited Claude Code file reaches;
  - in the path where the live file tests managed, which a Codex file with LLMR's block always takes, save only when a record exists and the file is not untouched. Only Codex has a record. A Claude Code file in this path holds nothing but LLMR's keys, so it gets no copy.

  Order: read the record; compute the stripped content; save the copy, and throw before touching the live file if that fails; write or remove the live file; delete the backups; remove the marker; clear the record last.
- [ ] **Step 3: Save a copy when the live file is gone (F-28, V-17).**
  - Failing test first, in `profile-service.test.mjs`: `a restore after the user deleted their Claude Code settings keeps a copy of what the backups held`. Claude Code, no original. Add `permissions: { allow: ["Bash(ls)"] }`, re-apply with a second model so a backup is written, delete `settings.json`, recover. `settings.json` is still absent, the directory holds no name that contains `llmr`, and the record directory for that file holds exactly one copy, which contains `Bash(ls)`. No second test for "no edit": an apply with no previous file writes no backup, so that case cannot fail. The branch is reached for Codex too, which is intended: `stripManagedCodexConfigContent` decides there what a backup holds of the user's.
  - In the no-original branch of `restoreGlobalConfigFile`, when `current === undefined`: before `forgetMissingOriginal`, walk `backupFiles(file)` newest first and take the first one for which `strip(content)` returns content that is not empty by `isEmptyConfigContent`. Pass that backup's raw content to `saveRemovedConfigCopy`. Throw before deleting anything if the save fails. A backup with nothing of LLMR's in it cannot be there: the lookup above this branch would have restored it. A Claude Code backup that does not parse is passed over, because the JSON stripper returns nothing for it. A Codex backup is stripped as text.
- [ ] **Step 4: Run the tests. State the limits in the PR. Commit.** `fix(profiles): keep a safety copy of an agent config before stripping it`. Limits: a copy is raw apart from LLMR's token, so it holds any other secret the file held. Nothing deletes the copies when a profile is deleted or LLMR is removed. Two copies written in the same millisecond share a name.

---

### Task 4e: Tell a takeover copy from the user's file by LLMR's own values (F-27, F-29)

Added on 2026-11-21 after the review of PR 133 (Appendix E). One PR, from `main`, before Task 4d Part 2.

PR 133 made the snapshot lookup skip, when no original existed, any backup the stripper would change. That test is too wide for Claude Code. `stripManagedClaudeCodeSettingsContent` goes by key name: it changes a file that holds the user's own `NO_PROXY` with `localhost` in it, or one of the model env keys while a takeover is active. Such a file is the user's, not a copy from LLMR's time. The lookup also has no answer for a backup that does not parse.

- **F-27, an older backup wins.** Stale `.llmr-original-missing` marker, an old backup with nothing of LLMR's in it, and a live `settings.json` of `{"env":{"ANTHROPIC_DEFAULT_OPUS_MODEL":"my-opus","NO_PROXY":"localhost,corp.internal"}}`. Apply, recover. The file comes back as the old backup. Run by the plan author on `main` at `2e83ff7c`.
- **F-29, a backup that does not parse is restored.** A truncated copy of LLMR's `settings.json` among the backups is written back with status ok, with or without an original. Run by the plan author on `main` at `2e83ff7c`, both ways.

**What settles it.** A copy from LLMR's time holds a value only LLMR writes: its `apiKeyHelper` path, a gateway base URL equal to an endpoint LLMR recorded, all three gateway keys set alike, or LLMR's federation rule id. `claudeCodeDisplacedEnv` uses the endpoint and three-alike tests at apply time. The user's own `NO_PROXY` or model env key carries none of these.

**Evidence status.** Built twice as throwaway code on `main` at `2e83ff7c`. The first build returned an accepted backup unstripped. An auditor ran it and found that it wrote LLMR's own leftovers back in two planted states, which `main` does not. The plan author rebuilt it as written below and ran it: `npm run test:core` passed (1767, 0 fail, with three probes), the F-27 state restored the user's newest file, and both of the auditor's states came out with nothing of LLMR's. The F-29 states were run on the first build only, and the second build did not change that path. The sketch is not in the repo.

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`RestoreManagedContentMatchers`, `restoreGlobalConfigFile`, `originalSnapshotCandidate`, `claudeCodeManagedContent`, `orphanedClaudeCodeManagedContent`, the bare Claude Code matcher in `restoreInactiveGlobalProfileConfigs`)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**
- Produces: `RestoreManagedContentMatchers` gains `takeoverContent?: (content: string) => "none" | "parsed" | "unparsed"`.
  - `"parsed"`: the content parses and holds a value only LLMR writes.
  - `"unparsed"`: the content does not parse and its text holds one.
  - `"none"`: neither. Content that does not parse and holds no such text is `"none"`, so `profile service restores global agent configs on exit`, whose fixtures are not JSON, keeps passing.
- Produces: `claudeCodeTakeoverContent(content: string, endpoints: string[]): "none" | "parsed" | "unparsed"`.
  - Parsed, any one of: `isManagedClaudeCodeApiKeyHelper(settings.apiKeyHelper)`; one of `claudeCodeGatewayEnvKeys` holds a string that is in `endpoints`; `isClaudeCodeGatewayTakeoverEnv(env)`, whatever is recorded, because a backup from before a port change holds an endpoint no longer on record; `env.ANTHROPIC_FEDERATION_RULE_ID === claudeCodeWifFederationRuleId`, because a WIF profile writes no helper path.
  - Unparsed: the text includes `llmr-claude-code-api-key-` or one of `endpoints`.
- All three Claude Code matcher builders set `takeoverContent`: `claudeCodeManagedContent` with `scope.endpoints`, `orphanedClaudeCodeManagedContent` with its merged `endpoints`, the bare matcher with `[]`.
- `originalSnapshotCandidate` skips a candidate when `takeoverContent` says `"unparsed"`, on every call. When no original existed and a stripper is set, it also skips one that says `"parsed"`. A matcher with no `takeoverContent` (Codex) keeps PR 133's test, `strip(content) !== undefined`, in that mode.
- An accepted candidate is still returned as `stripManagedContent?.(content) ?? content`, as today. Do not return it unstripped. A backup can hold LLMR's `NO_PROXY` hosts and model-discovery keys with none of the values above (the user removed the helper and the URLs, and LLMR backed the file up at the next apply), and only the strip removes those.
- Codex is unchanged. Its `isManagedContent` already refuses a backup with LLMR's markers or provider table, and TOML has no parse step here.

- [ ] **Step 1: Write the failing tests**, in `profile-service.test.mjs`, each with `withAppliedDefaultProfiles(["default-claude-code"], run, beforeApply)`.
  - `a stale marker beside an old clean backup still restores the user's newest Claude Code settings`. `beforeApply` writes `settings.json.llmr-original-missing`, `settings.json.llmr-backup-2000-01-01T00-00-00-000Z` holding `{"permissions":{"allow":["Bash(ls)"]}}`, and `settings.json` holding the F-27 text above followed by a newline. Every `beforeApply` here starts with `mkdirSync(claudeDir, { recursive: true })`, because the helper's clean-up removes the directory. After `recoverGlobalAgentProfile("default-claude-code")`, the file parses to `{ env: { ANTHROPIC_DEFAULT_OPUS_MODEL: "my-opus", NO_PROXY: "corp.internal" } }` by `assert.deepEqual`. The strip removes `localhost`, which is the Open items row on LLMR's own key names and not this task.
  - `a truncated copy of LLMR's settings among the backups is not restored`. After the apply, write the first 70% of the applied file to `settings.json.llmr-backup-2099-01-01T00-00-00-000Z`. Assert first that `JSON.parse` of that text throws and that it includes `llmr-claude-code-api-key-`. Recover. The status is ok and `settings.json` does not exist.
  - `a truncated copy of LLMR's settings does not displace the user's original`. `beforeApply` writes `settings.json` as `{"permissions":{"allow":["Bash(ls)"]}}` and a newline. After the apply, rewrite the live file with only its `apiKeyHelper` and `env`, and plant the same truncated backup. Recover. The file equals the original text exactly, newline included.
  - `a backup that holds LLMR's leftover env keys does not bring them back`. After the apply, read the applied `env`, drop the three `claudeCodeGatewayEnvKeys` from it, and write `{ permissions: { allow: ["Bash(ls)"] }, env: <the rest> }` to `settings.json.llmr-backup-2099-01-01T00-00-00-000Z`. Assert the backup text includes `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`. Recover. `settings.json` is absent or does not include that name. Under this task the file comes back as `permissions` with an empty `env`. On `main` today it is removed. Either is accepted, and the test is there to fail when a candidate is returned unstripped.
  - `a takeover copy from before a port change is not restored`. After the apply, write a backup dated 2099 holding `permissions` and all three gateway keys set to `http://127.0.0.1:9999`. Recover. `settings.json` does not exist.
- [ ] **Step 2: Run them and watch them fail.** `node build/test.mjs core && node --test --test-name-pattern="stale marker beside|truncated copy|leftover env keys|before a port change" .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected: the first returns the `permissions` backup, and the two truncated-copy tests leave a live file that does not parse. The last two pass on `main` today, because PR 133's wider test refuses both backups. They are there to fail under a wrong build of this task.
- [ ] **Step 3: Add `takeoverContent` and `claudeCodeTakeoverContent`, and use them in the lookup**, as the Interfaces block says. Reword the comment PR 133 left in `originalSnapshotCandidate` to name the new test.
- [ ] **Step 4: Run the tests.** The five new ones pass. `restoring a Claude Code settings file LLMR created does not bring back a key the user deleted` and `a stale original-missing marker does not cost the user their own Codex config` still pass. Then `npm run test:core`, `npm run typecheck`, `npm run lint`, `npm run test:architecture`.
- [ ] **Step 5: Break it three times.** Make the no-original mode skip nothing and confirm `restoring a Claude Code settings file LLMR created does not bring back a key the user deleted` fails. Make `"unparsed"` return `"none"` and confirm both truncated-copy tests fail. Return an accepted candidate unstripped and confirm the leftover-env test fails. Put all three back.
- [ ] **Step 6: State the limits in the PR. Commit.** `fix(profiles): tell a takeover copy from the user's file by LLMR's own values`. Limits: a user whose own settings set all three gateway keys alike, or point one at the address LLMR's gateway uses, is taken for a takeover copy, which the Open items row on LLMR's own key names already describes. A backup with LLMR's leftover env keys and none of its values is taken for the user's file and restored stripped, so it can bring back a key the user deleted after that backup was taken. That needs the user to have removed the helper and the URLs by hand first. A restore through the snapshot still leaves the stale marker and the backups beside the file, as before this task. F-28 is Task 4d Part 4, Step 3.

---

### Task 4b: Keep Codex edits made during a takeover, and keep no token in any backup (F-19, F-20)

When the original `config.toml` existed, `restoreGlobalConfigFile` writes the pre-takeover snapshot back (`originalSnapshotCandidate`). That is byte-exact for a file nobody touched, and the `#1951` test in `web-management-server.test.mjs` asserts it. It discards anything the user or Codex wrote while LLMR had the file, because a Codex file with LLMR's block always tests managed and never reaches the strip branch. The discarded content survives only in a backup that also holds the token. Every apply that changes the file adds another such backup through `writeFileWithBackup`.

Stripping every time is not the fix. The writer drops four root keys and the user's `[profiles.<providerId>]` table and reorders the file, so a strip alone returns less than the snapshot does. The rule is: restore the snapshot when the file is as LLMR wrote it, and strip only when it changed.

**Evidence status.** A research agent and an audit agent each probed this in an isolated home. Step 1's tests confirm it.

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`applyCodexProfile`, `restoreGlobalConfigFile`, `RestoreManagedContentMatchers`, `backupCurrentConfigFile`, `writeFileWithBackup` for the Codex `config.toml`), `packages/core/src/profiles/codex-config-strip.ts` (the stripper's home after Task 4d Part 2), `packages/core/src/profiles/backup-files.ts`
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/core/test/unit/profiles/codex-config-strip.test.mjs`, `packages/core/test/unit/profiles/backup-files.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs`

**Interfaces:**
- Consumes: `stripManagedCodexConfigContent(content, providerIds, written?)` from Task 4d. This task adds a fourth argument, `displaced` (`type CodexDisplacedConfig = { model?: string; modelCatalogJson?: string; modelProvider?: string; profileTable?: string; showAllSessions?: string }`, each value a whole TOML line or table as the user wrote it) and puts a displaced value back only in place of the LLMR line it removed.
- Produces: `stripLiveContent` from Task 4d Part 3 becomes `(content: string, displaced?: CodexDisplacedConfig) => string | undefined`. `restoreGlobalConfigFile` has only the closures and no provider ids, so it calls `stripLiveContent(current, displaced)` with the lines it read from the snapshot, and the closure built in `codexManagedContent` supplies the provider ids and the record.
- Produces: `backupContent(file, content, options)` in `backup-files.ts`, a content-taking sibling of `backupCurrentFile`, which copies the file.
- Consumes: the `written.json` record from Task 4d Part 3, with its `sha256` and `edited` fields, and `saveRemovedConfigCopy` from Part 4. Do not add fields to `GlobalProfileTakeoverRecord`: `synchronizeGlobalProfileTakeovers` compares those records by JSON, and a new field would make every apply restore and retake every agent.
- Produces: `stripBeforeSnapshot?: boolean` on `RestoreManagedContentMatchers`, set at the Codex call sites only.
- Produces: the displaced values for a strip come from the snapshot, not from new state. Read the four root lines and the `[profiles.<providerId>]` table out of the `originalSnapshotCandidate` content.

- [ ] **Step 1: Write the failing tests.** Same setup rules as Task 4a Step 2: an enabled profile, and the token value read from `loadPersistedApiKeys()`.
  - Review Focus 6: a user `config.toml` with all four root keys (`model`, `model_provider = "openai"`, `model_catalog_json`, `show_all_sessions`), a `[profiles.llm-router]` table and one comment line. Apply, append `[mcp_servers.x]`, recover. The file holds the table the user added, the comment, the four root lines and the `[profiles.llm-router]` table as the user wrote them, and none of LLMR's content.
  - Untouched original: apply and recover with no edit between. The file is byte for byte the original. The `#1951` byte assertion on the Codex file still passes.
  - Model changed between applies: apply, change the profile's model, apply again, append a table, recover. The user's original `model` line is back.
  - No token in a backup after a re-apply: apply, change the profile's model, apply again. No file under `~/.codex` other than `config.toml` and `<providerId>.config.toml` contains the token value.
  - Review Focus 8, no original: apply, append `[mcp_servers.mine]`, change the profile's model to a second model on the provider, apply again, delete that table from the live file, recover. `config.toml` is gone and no backup remains. A stripped apply-time backup would hold only that table, test unmanaged, and be written back as the original. The plan author ran that state on `main` at `06dd4b4f` with a planted backup, and the table came back.
  - Seven cycles: apply and restore through `restoreGlobalProfileConfigsOnExit` seven times. No backup holds the token value, no two neighbouring backups are equal, and `.llmr-original` is still the snapshot a restore chooses.
- [ ] **Step 2: Run the tests and watch them fail.** Review Focus 6 fails because the appended table is gone. The token tests fail on the backups.
- [ ] **Step 3: Read what LLMR wrote.** Task 4d already saves the SHA-256 of the written `config.toml` in `written.json`. Add nothing new here.
- [ ] **Step 4: Strip only a file that changed since LLMR wrote it.** In `restoreGlobalConfigFile`, when `stripBeforeSnapshot` is set and the live file tests managed: if the file is untouched, as Task 4d Part 3 defines the word, write the snapshot back as today and clear the record. A matching hash alone is not enough: a re-apply takes a new hash of a file the user edited. Otherwise call `saveRemovedConfigCopy(stateDir, file, current)` first, then write `stripLiveContent(current, displaced)` with `displaced` read from the snapshot. The record is keyed by file path, so `restoreInactiveGlobalProfileConfigs` finds it without a profile. Leave the Claude Code path as it is.
- [ ] **Step 5: Keep no token in a backup.** While the file's `.llmr-original-missing` marker exists and `.llmr-original` does not, write no apply-time backup of the Codex `config.toml` at all: a stripped one would pass for the original at the next restore, and V-7 has a no-original restore delete every backup anyway. An edited file is still covered by the safety copy from Task 4d Part 4. In every other state, every backup of the Codex `config.toml`, from `backupCurrentConfigFile` and from `writeFileWithBackup` in `applyCodexProfile`, writes the stripped content through `backupContent`. An apply-time backup is stripped with the previous record, the one that describes the file being backed up. A backup whose stripped content leaves nothing, or that equals the newest backup or `.llmr-original`, is not written.
- [ ] **Step 6: Check pruning.** A stripped backup tests unmanaged, so `pruneBackups` and `originalSnapshotCandidate` could prefer it to `.llmr-original`. The seven-cycle test pins that they do not. If it fails, make `originalSnapshotCandidate` prefer `.llmr-original` when it exists.
- [ ] **Step 7: Run `npm run test:core`.** Expected: PASS.
- [ ] **Step 8: Commit.** `fix(profiles): keep Codex edits made while LLMR had the config, and keep no token in a backup`

---

### Task 4c: Remove the Codex side files and tell the user what a restore did (rest of F-13, V-16)

After Tasks 4a and 4b a restore leaves the right content in `config.toml`. It still leaves LLMR's other files under `~/.codex`, and its messages describe a backup restore even when a file was removed or stripped. The toast for a second click reads "already matches the LLMR backup" when the file is absent.

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`disabledProfileStatus`, `disabledRestoreStatus`, `inactiveGlobalCleanupStatus`, `restoreGlobalConfigFile`)
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs`, `tests/e2e/onboarding-chosen-agent.spec.ts`

**Interfaces:**
- Produces: `RestoreFileResult` gains `absent?: boolean`, true when the file did not exist at restore time, in the marker branch or the last branch. Today "already matches the backup" and "already absent" both return `restored: true, changed: false`.

- [ ] **Step 1: Write the failing tests.**
  - Side files: after a no-original Codex restore through `recoverGlobalAgentProfile`, `readdirSync` of `~/.codex` is empty or holds only `.llm-router`, and `.llm-router` holds nothing LLMR wrote.
  - A user's side file survives: write a user `<providerId>.config.toml` before the apply, apply, recover. The file is byte for byte what the user wrote.
  - A shared directory: two enabled Codex profiles on one config directory, recover one. `llmr-model-catalog.json` is still there.
  - Messages: one test per text in Step 3, on the status the restore returns.
  - `tests/e2e/onboarding-chosen-agent.spec.ts`: after onboarding, assert `~/.claude/settings.json` exists in `runtime.testHome`, call `window.llmr.recoverGlobalProfile("default-claude-code")`, then assert `.claude` has no entry whose name contains `llmr` and that the gateway answers 401 for the profile's key.
- [ ] **Step 2: Remove the side files LLMR alone wrote.** In the Codex tail of `disabledProfileStatus`, when no other enabled Codex profile resolves to the same config directory (compare `path.dirname(resolveCodexConfigFile(other))`):
  - `<providerId>.config.toml` and `llmr-model-catalog.json` are written through `writeFileWithBackup` and have their own markers. Remove each only when its `.llmr-original-missing` marker exists. Otherwise write its `.llmr-original` back. Remove their backups and markers either way.
  - Remove `.llm-router/codex-app-user-data/<profile id>/llmr-codex-model-catalog.json`, which is written on every apply and has no marker.
  - Then remove each now-empty parent, up to and including `.llm-router`, with a non-recursive `rmdirSync`. LLMR launches the Codex app with a user-data directory under `.llm-router`, so anything the app wrote stays and keeps its directory.
- [ ] **Step 3: Write the result messages (V-16).** In `disabledRestoreStatus` and `inactiveGlobalCleanupStatus`, for `claude-code` and `codex` only. Other agents keep today's text, and the missing-backup text stays as it is, because three tests match it.
  - `removed: true`: `<Agent> config was removed because it did not exist before LLMR.`
  - `absent: true`: `<Agent> config is already absent, as before LLMR.`
  - Stripped and kept: `LLMR's settings were removed from <Agent> config and your own settings were kept.`
  - Restored from the snapshot and changed: `<Agent> config was restored to what it was before LLMR.`
  - Already equal to the snapshot: `<Agent> config already matches what it was before LLMR.`
  - When the restore leaves the profile disabled (`recoverGlobalAgentProfile`, and a profile switched off through an apply), append `Profile is disabled. Switch it on to undo this. <Agent> may ask you to log in.` The takeover sync also restores through `disabledRestoreStatus` and re-applies the profile at once, so it gets no such sentence.
  - Update the assertion on `/LLMR-managed settings removed/` in `profile-service.test.mjs` to the new stripped text.
- [ ] **Step 4: Run the tests.** `npm run test:core`, then `npm run test:e2e`.
- [ ] **Step 5: Commit.** `fix(profiles): remove LLMR's Codex side files and say what a restore did`

---

### Task 5: Show no failure before the first provider exists (F-1, F-2)

**Blocked on V-6.** Before Step 1 the owner confirms `state: "stopped"` with the reason in `lastError`, or picks the audit's `stoppedReason` field. The steps below are written for the first. Under the second, Step 1 asserts `stoppedReason` with `lastError` unset, and the eight readers that fall back to a generic string when `lastError` is unset must show the reason instead: one in `packages/cli/src/cli.ts`, two in `packages/core/src/web/management-server.ts`, one in `packages/core/src/profiles/launch-service.ts`, two in `packages/electron/src/main/deep-link.ts`, one in `packages/electron/src/main/ipc.ts` and `gatewayServiceMessage` in `packages/ui/src/pages/home/shared/services.tsx`. Find each by searching for `lastError`. Appendix G has the count.

`startGateway` throws `NO_AVAILABLE_GATEWAY_MODELS_MESSAGE` when the config has no model (the `hasAvailableGatewayModels` check in `packages/core/src/gateway/application/gateway-service.ts`), and the catch further down that function turns that into `state: "error"`. `App.tsx` shows a red banner for any error state (`gatewayStartupError`). In the onboarding layout the banner is absolutely positioned and covers the heading (`packages/ui/src/pages/home/components/layout.tsx:81`).

Every caller that checks `status.state !== "running"` reports `lastError`, so none of them starts reporting success (V-6).

**Files:**
- Modify: `packages/core/src/gateway/application/gateway-service.ts` (the `hasAvailableGatewayModels` check in `startGateway`)
- Modify: `packages/ui/src/pages/home/components/layout.tsx` (`OnboardingLayout`, `GatewayStartupErrorBanner`), `packages/ui/src/pages/home/components/onboarding.tsx`
- Create: `packages/ui/src/pages/home/components/gateway-startup-error-banner.tsx`. `layout.tsx` imports `OnboardingView`, so `onboarding.tsx` cannot import the banner from `layout.tsx` without a cycle. Move `GatewayStartupErrorBanner` to this file and import it from both.
- Test: `packages/core/test/unit/gateway/gateway-status.test.mjs`, `packages/ui/test/component/onboarding.test.tsx`

**Interfaces:**
- Produces: `gatewayService.start(config)` with no available model resolves to a status with `state: "stopped"` and `lastError: NO_AVAILABLE_GATEWAY_MODELS_MESSAGE`. It spawns no child.
- Produces: `OnboardingView` accepts `gatewayStartupError?: string` and renders `GatewayStartupErrorBanner` in flow after `OnboardingProgress`.

- [ ] **Step 1: Write the failing status test.**

```js
test("a gateway with no provider model is stopped, not failed", async () => {
  await gatewayService.stop();
  try {
    const status = await gatewayService.start(createDefaultAppConfig());
    assert.equal(status.state, "stopped");
    assert.equal(status.lastError, NO_AVAILABLE_GATEWAY_MODELS_MESSAGE);
    assert.equal(status.pid, undefined);
  } finally {
    await gatewayService.stop();
  }
});
```

Import `NO_AVAILABLE_GATEWAY_MODELS_MESSAGE` from `@llmr/core/contracts/app`. The file does not import it today.

- [ ] **Step 2: Write the failing layout test.** Render `OnboardingView` with `gatewayStartupError="boom"`. Assert that the HTML contains `Service failed to start` and that its index is greater than the index of the progress bar's markup. In a second test render `OnboardingLayout` with the same error and assert that its HTML does not contain `absolute inset-x-0 top-12`. That class is in `OnboardingLayout` and never in `OnboardingView`, so asserting it on `OnboardingView` passes with no fix.
- [ ] **Step 3: Run both and watch them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/gateway-status.test.js`
Run: `node build/test.mjs ui && node --test .test-dist/ui/test/component/onboarding.test.js`

- [ ] **Step 4: Return a stopped status.** Replace the throw with a full teardown, the one the throw reaches today through the catch: the unified server, the proxy and the media tools all stop, as in the `!shouldRunServer && !shouldRunGateway` branch below it. Then set `state: "stopped"` and `lastError`. Do not keep the server up and skip only the child.
- [ ] **Step 5: Move the banner into flow.** Move `GatewayStartupErrorBanner` to its own file first. Delete the absolute wrapper in `OnboardingLayout`, pass the message to `OnboardingView`, render the banner after `OnboardingProgress` with `mx-4 mt-3 sm:mx-5`.
- [ ] **Step 6: Run the tests.** Expected: PASS. Then `npm run test:core`, `npm run test:ui` and `npm run test:e2e`.
- [ ] **Step 7: Check the manual Start path in a dev build.** Run `npm run dev:electron` with an empty config directory and press **Start** on the Server page. It must show the "No available models" message. Record what you saw in the PR. Follow the home-safety rule and prove the dev build cannot touch the real home before you start it.
- [ ] **Step 8: Commit.** `fix(onboarding): treat a gateway with no model as stopped`

---

### Task 10: Settle three open causes (F-8, F-12, crash takeover)

No code. The deliverable is evidence appended to the spec and a decision from the owner on each item. It runs in Phase A because two of the three bear on "keep it connected".

- [ ] **Step 1: Read why refused requests leave no log row (F-8).** Clone `jrmatherly/llmr-gateway` at the tag LLMR pins, read-only. Find where a raw trace is written and confirm or refute this claim from the minified build: a trace is written only after an upstream call, so a 401 from `beforeAuth` and a 400 from model resolution write none. Record the file and line.
- [ ] **Step 2: Propose the F-8 fix to the owner.** State whether a fork commit can write a trace for a request refused after authentication, and what it costs. State the choice for unauthenticated 401s: count them, or log at most one row a minute per client address. Logging every 401 invites a flood. A fork push needs the owner's word (V-10).
- [ ] **Step 3: Find where response headers are lost (F-12).** In the owner's VM pass (Task 11), after one logged request, find the database with `find ~/.llm-router -name request-logs.sqlite` and run `sqlite3 -readonly <that file> "select response_headers from request_logs limit 1"`. An empty value means the import drops them (`packages/core/src/observability/raw-trace-sync.ts:1708`). A filled value means the UI does.
- [ ] **Step 4: Reproduce the crash case.** In the owner's VM pass, with a global Claude Code profile applied, run `kill -9` on the LLM Router process and then `claude -p "hi"`. Record what Claude Code prints, what `~/.claude/settings.json` holds, and whether reopening LLM Router repairs it. LLMR releases a takeover on quit and on gateway stop, and keeps `~/.llm-router/global-profile-takeover.json` after a crash. Upstream has the same report open as issues 1580 and 1647.
- [ ] **Step 5: Append the three results to the spec** under their findings and ask the owner for each decision. A decision that needs code becomes a new task in this plan.

---

### Task 11: Run the owner's VM pass and release Phase A

The owner runs this task. It needs a provider key, which stays in the VM and out of every file.

**Before the pass:**
- [ ] Build a local dmg from `main` with every Phase A code task merged (0, 1, 3, 2, 4a, 4d, 4e, 4b, 4c, 5): `npm run build:app:mac`. Copy it and `scripts/vm-proof/` into the shared folder.

**Pass 1, fresh disposable VM, no agent installed:**
- [ ] `./install-check.sh <dmg name>`. Pass when the first onboarding screen shows no red banner (Task 5).
- [ ] Run `llmr serve --no-open` in the foreground in a terminal with no provider, then open the page with `llmr ui`. Pass when the terminal prints no "Failed to start gateway" line and the page shows no red banner (Task 5). `llmr ui` alone cannot show the line: it starts the service detached with its output discarded. Whether a foreground `serve` prints the line was not checked. If it prints nothing with the fix reverted either, the page is the check.
- [ ] Add a provider. On "Connect agent" pass when the step shows the sentence that names `~/.claude/settings.json` (Task 3).
- [ ] Click **Skip for now** and finish. Run `./collect.sh skipped`. Pass when neither `~/.claude` nor `~/.codex` exists and the API Keys page lists no "Profile:" key (Task 3).

**Pass 2, fresh disposable VM, Claude Code installed first** with `curl -fsSL https://claude.ai/install.sh | bash`:
- [ ] Finish onboarding with Claude Code. Without restarting LLM Router, run `~/.local/bin/claude -p "Reply with the single word: pong"`. Pass when it prints `pong` (Task 2).
- [ ] Run `./collect.sh onboarding`. Pass when the log shows `~/.claude/settings.json` and no `~/.codex` directory (Task 3).
- [ ] Copy the "Profile: Claude Code" key from API Keys. Switch the profile off. Run `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <that key>" http://127.0.0.1:3456/v1/models`. Pass when it prints `401` (Task 2).
- [ ] Switch both cards off, switch Claude Code on, run `./collect.sh latch`. Pass when the log shows `~/.claude/settings.json` (Task 1).
- [ ] Click **Restore original settings** on the Claude Code card, run `./collect.sh after-restore`. Pass when `~/.claude` holds no file whose name contains `llmr` (Task 4a), and the message shown reads `Claude Code config was removed because it did not exist before LLMR.` followed by the sentence about switching the profile on (Task 4c, V-16).
- [ ] Switch the Codex card on, then click **Restore original settings** on it and run `./collect.sh after-codex-restore`. Before the click, copy the "Profile: Codex" key from API Keys. Pass when `config.toml` is gone (no original existed in this VM), `grep -rF "<that key>" ~/.codex ~/.llm-router/agent-config-state` prints nothing, and `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <that key>" http://127.0.0.1:3456/v1/models` prints `401` (Tasks 4a and 4c). `~/.codex/.llm-router/` may remain only if the Codex app was opened from LLMR.
- [ ] Before a restore, copy the profile's key from API Keys, because the restore revokes it. After a restore that kept a file, list `~/.llm-router/agent-config-state/`. Pass when it holds at most three copies per agent file and none contains that key (Task 4d).
- [ ] Deleted file (Task 4d Part 4, V-17). Switch Claude Code on, add a `permissions` key to `~/.claude/settings.json`, change the profile's model so LLMR re-applies, delete `~/.claude/settings.json`, click **Restore original settings**. Pass when the file is still absent, the message reads `Claude Code config is already absent, as before LLMR.`, and `~/.llm-router/agent-config-state/` holds one copy that contains the `permissions` key.
- [ ] Run Task 10 Steps 3 and 4 in this VM.
- [ ] Measure what a day of logs costs. With request logs on and body capture at its default, run one ordinary Claude Code task of about twenty turns. Record the number of rows on the Logs page and `du -sh ~/.llm-router/app-data` before and after. The retention default (V-8) was chosen without this number, because no machine had real logs to measure. Append it to the spec.

**Pass 3, the same VM, Codex installed.** Required: it is the only check of the quit path and of an edit Codex makes from its own UI.
- [ ] Write a `~/.codex/config.toml` of your own with a comment and `model_provider = "openai"`, and keep a copy. Switch the Codex card on. In Codex, trust a folder, so that Codex itself rewrites the file. Quit LLM Router, do not click Restore. Run `diff` between the copy and the file. Pass when the only differences are the lines Codex added (Tasks 4a and 4b). Task 4a checked one case offline: `codex mcp add` keeps the markers and writes its table inside LLMR's last block. This pass checks an edit Codex makes from its own UI.

**Release:**
- [ ] The owner picks the version number. Task 3 changes what a new install does.
- [ ] Release notes carry Task 3 Step 14's line, and this one for Task 1: an install whose agents stopped connecting after all profiles were switched off starts applying its enabled profile at the next launch.
- [ ] After the last push to `main`, wait for the Tests run on `HEAD` to finish green. Then `npm run release -- <version>` from a clean, up-to-date `main`.
- [ ] When the Release run finishes, replace the generated notes: `gh release view v<version> --json body -q .body > notes.md`, add the two lines above, then `gh release edit v<version> --notes-file notes.md`. The workflow creates the release with `--generate-notes`, which lists PR titles only, so a line in a PR body never reaches the notes.
- [ ] On the signed dmg from the release, in a fresh VM: `QUARANTINE=1 ./install-check.sh <dmg name>`. Pass when `spctl` says `accepted` and `Notarized Developer ID`.
- [ ] Upgrade check, twice, from a VM that ran 8.0.0: once with a config latched as in F-15, once with both profiles enabled. Pass when the app updates, the latched install applies its enabled profile, and the second install keeps both profiles as they were.
- [ ] Revoke the provider key used in the VM.

---

### Task 6: Fix the small UI defects (F-3, F-4, F-10, F-14, F-8 columns)

**Files:**
- Modify: `packages/ui/src/pages/home/shared/providers.ts:2469`
- Modify: `packages/ui/src/pages/home/components/profiles.tsx` (the `placeholder={modelPlaceholder ...}` lines under "Default model" and "Kimi model")
- Modify: `packages/ui/src/pages/home/components/network-logs.tsx` (the summary grid in `LogExpandedDetails`, and `LogMetric`)
- Modify: `packages/ui/src/pages/home/components/feedback.tsx:46`
- Test: `packages/ui/test/integration/providers.test.ts`, `packages/ui/test/component/profiles.test.tsx` (`AddProfileForm marks required and optional fields`, and the Kimi test after it), `packages/ui/test/component/observability.test.tsx`, `packages/ui/test/component/ux-feedback.test.tsx:37`

**Interfaces:**
- Produces: `providerProtocolLabel("openai_image_generations")` returns `"OpenAI Images"`, `"openai_video_generations"` returns `"OpenAI Video"`, `"xai_video_generations"` returns `"xAI Video"`.

- [ ] **Step 1: Write the failing assertions.**

```ts
assert.equal(providerProtocolLabel("openai_image_generations"), "OpenAI Images");
assert.equal(providerProtocolLabel("openai_video_generations"), "OpenAI Video");
assert.equal(providerProtocolLabel("xai_video_generations"), "xAI Video");
```

In `profiles.test.tsx`, `AddProfileForm marks required and optional fields` asserts `/Select default model/` and asserts that the Default model field does not show the fixture's first `provider/model`. The Kimi test after it asserts the same for the Kimi model field. In `observability.test.tsx`, add `LogExpandedDetails` to the import (the file imports only `LogsView`), render it and assert `/network-body-meta[^"]*gap-x-4/`. In `ux-feedback.test.tsx`, change the pinned `top-5` to `top-14`.

- [ ] **Step 2: Run the four files and watch each fail.**
- [ ] **Step 3: Add a media label map** in `providers.ts` that `providerProtocolLabel` checks after `providerProtocolOptions`. Do not add the media protocols to `providerProtocolOptions`. That list is also the set a user can select.
- [ ] **Step 4: Give required model fields a neutral placeholder.** The Claude Code Default model field and the Kimi model field pass `"Select default model"` as the placeholder, not `firstProfileModelPlaceholder(...)`. The Default model line already reads `modelPlaceholder || "Select default model"`, so the change there is to drop `modelPlaceholder ||`.
- [ ] **Step 5: Add `gap-x-4`** to the summary grid and `title={value}` on the value element of `LogMetric`.
- [ ] **Step 6: Change `top-5` to `top-14`** in `FeedbackStack`.
- [ ] **Step 7: Run the tests.** Expected: PASS. Then `npm run test:ui`.
- [ ] **Step 8: Commit.** `fix(ui): label media protocols and stop four fields misleading the user`

---

### Task 9: Add a request log retention setting (F-17, F-7)

**Blocked on V-8's default.** The owner picks 1 or 7 before this task starts. The steps below write `<default>` for that number.

If the owner rejects V-9, a date filter on the Logs page is a separate task and does not change this one.

`pruneOldRequestLogs` (`packages/core/src/observability/request-log-store.ts`) deletes every row from before the start of today. No setting changes that. Two processes can have the database open, the desktop app and `llmr ui`. Each runs a writer worker and a query worker, and each worker builds its own store (`request-log-worker.ts:39`) that prunes on its own. Each store also skips the sweep once it has run for the day (`lastRetentionCleanupDay`, line 1583). A value held in memory by one store goes stale in the others, so the value lives in the database and every store reads it before it decides whether to sweep.

**Files:**
- Modify: `packages/core/src/contracts/app.ts:1273`, `packages/core/src/config/default-config.ts:119`, `packages/core/src/config/config.ts:1020-1040`, `packages/ui/src/pages/home/shared/config.ts:107`
- Modify: `packages/core/src/observability/request-log-limits.ts`, `request-log-store.ts`, `request-log-runtime.ts`, `request-log-worker.ts`
- Modify: `packages/electron/src/main/ipc.ts` (`appSaveConfig`), `packages/electron/src/main/main-app.ts` (`startConfiguredServices`), `packages/core/src/web/management-server.ts` (its save handler and `startConfiguredServices`)
- Modify: `packages/ui/src/pages/home/components/settings.tsx` (export `ObservabilitySettingsPage`, which is private today), `packages/ui/src/pages/home/components/network-logs.tsx` (`LogsView` takes the number as a new prop), `packages/ui/src/App.tsx` (it builds `viewProps.logs`), `packages/ui/src/pages/home/components/layout.tsx` only if the prop does not pass through unchanged, and the `copy.settings` strings in `i18n.tsx`
- Modify: `docs/src/content/docs/en/guides/install.md`, `docs/src/content/docs/en/configuration/observability.md` (two sentences say logs are kept for the current day, and the settings table needs a `requestLogRetentionDays` row)
- Test: `packages/core/test/integration/observability/request-log-retention.test.mjs` (create), `packages/core/test/unit/config/` (a new test through the config loader), `packages/core/test/unit/observability/request-log-maintenance.test.mjs` (the `#1930 expired rows are pruned past one batch` test expects a store with no saved value to prune, so write `retention_days` there before it reopens the store), `packages/ui/test/component/settings.test.tsx` (create)

**Interfaces:**
- Produces: `ObservabilityConfig.requestLogRetentionDays?: number`, an integer from 1 to 90.
- Produces: `export const minRequestLogRetentionDays = 1`, `maxRequestLogRetentionDays = 90` and `defaultRequestLogRetentionDays = <default>` in `request-log-limits.ts`. Every default in this task reads the third constant.
- Produces: `RequestLogStore.setRetentionDays(days: number): void`, which writes the row and sweeps.
- Produces: `RequestLogRuntime.setRetentionDays(days: number): Promise<void>`, an awaited RPC to the writer worker, handled in the worker's `handleMessage` the way `flush` is. It resolves when the row is written. Do not add a kind to `RequestLogStoreWriteCommand`: `reviveCommand` in the worker, `batchNeedsUsagePricing` and the `writeBatch` loop in the store, and the runtime's drop and retain code each treat any kind that is not one of the two known ones as a record or a raw-trace update. The query worker rejects writes, so the setter cannot go there.
- Produces: a table `request_log_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)` created with `CREATE TABLE IF NOT EXISTS` in `open()`, holding the key `retention_days`. The store has no schema version list to update.

- [ ] **Step 1: Write the failing retention tests.** Use a temporary database file. `rowStartedDaysAgo(n)` is a helper you add. It builds a record input whose `startedAt` is `n` days back, because `created_at` comes from `startedAt`. `setDays(store, n)` calls `store.setRetentionDays(n)`.

```js
test("a row two days old survives a three-day retention and is pruned at one day", async () => {
  const store = new RequestLogStore(dbFile);
  await setDays(store, 3);
  await store.record(rowStartedDaysAgo(2));
  assert.equal((await store.list({})).total, 1);
  await setDays(store, 1);
  assert.equal((await store.list({})).total, 0);
});

test("a second open store follows a value the first one changes the same day", async () => {
  const first = new RequestLogStore(dbFile);
  const second = new RequestLogStore(dbFile);
  await setDays(first, 7);
  await first.record(rowStartedDaysAgo(3));
  assert.equal((await second.list({})).total, 1);
  await setDays(first, 1);
  assert.equal((await second.list({})).total, 0);
});

test("a store with no saved value prunes nothing", async () => {
  const first = new RequestLogStore(dbFile);
  await first.record(rowStartedDaysAgo(30));
  await first.close();
  const second = new RequestLogStore(dbFile);
  assert.equal((await second.list({})).total, 1);
});
```

The third test reopens the file on purpose. `record()` prunes before it inserts and then marks the day as swept, so a `list` on the same store finds the row on today's code too. A new store prunes when it opens.

- [ ] **Step 2: Write the failing config test.** `parseObservability` is private. Test it through the loader: `replacePersistedAppConfig` a config whose `observability.requestLogRetentionDays` is 500, then `loadAppConfig()` gives 90. Repeat with 0 giving 1, 2.7 giving 2, and a missing value giving `defaultRequestLogRetentionDays`.
- [ ] **Step 3: Run and watch them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/observability/request-log-retention.test.js`

- [ ] **Step 4: Add the setting to the config path.** Type, default, parse with clamp, and the UI fallback.
- [ ] **Step 5: Add the table, the command and the read.** `pruneOldRequestLogs` reads `retention_days` first. With no row it skips the `request_logs` sweep only, because pruning cannot be undone and a process may open the file before the app has written the value. `pruneRawTraceEvents` sits behind the same day gate and still runs. With a row, the gate becomes the pair of today's day key and the value, so a changed value sweeps again the same day. The cutoff is the start of today minus `days - 1` days.
- [ ] **Step 6: Push the value on load and save.** Call `requestLogRuntime.setRetentionDays(config.observability.requestLogRetentionDays ?? defaultRequestLogRetentionDays)` at the four places under Files.
- [ ] **Step 7: Run the tests.** Expected: PASS. Then `npm run test:core`.
- [ ] **Step 8: Add the Settings field.** A number input labelled `Keep request logs for (days)` beside the request logs switch, with min 1 and max 90. The label goes in `copy.settings`. Add a component test, in the new `settings.test.tsx`, that `ObservabilitySettingsPage` renders with the config's value.
- [ ] **Step 9: Say it on the Logs page.** Under the filter row, one line: `Request logs are kept for N day(s). Change this in Settings.` Add it to the Logs component test.
- [ ] **Step 10: Keep Agent Analysis honest about its range.** Agent Analysis reads `request_logs` by a range of today, 24 hours, 7 days or 30 days (`getAgentAnalysisSince` in `request-log-store.ts`). A range longer than the retention shows only what is kept and says nothing. Failing test first, a component test on the control that picks the range: with a retention of 7, the 30 days choice is disabled and its `title` reads `Request logs are kept for 7 days. Change this in Settings.`, and the 7 days choice is enabled. Then disable every choice longer than the retention. If the selected range is longer than a retention the user just lowered, fall back to the longest one that fits. Find the control by searching the UI for `UsageStatsRange`, and confirm first that it is the one Agent Analysis uses and not the usage totals, which read another store and keep their full range.
- [ ] **Step 11: Fix the two docs pages.** In `configuration/observability.md`, replace both "kept for the current day" sentences with the retention setting and its default, and add the table row. In "Verify the installation", step 4 becomes two steps. Turn on request logs under **Logs**, then send the request and confirm it is listed. Add one sentence that states the default retention and names the setting.
- [ ] **Step 12: Commit.** `feat(logs): add a setting for how long request logs are kept`

---

### Task 7: Keep the header clear of the window buttons at any zoom (F-11)

**The cause is inferred.** The native window buttons sit at a fixed position (`packages/electron/src/main/windows.ts:18`). The header's left insets are CSS pixels and shrink when the page zooms out. Two are classes in `layout.tsx`, and one of them holds two values (`pl-[116px] max-[720px]:pl-[116px]`). The third, `windowControlSafeAreaWidth`, is a number used as an inline width in two places. Find all of them by searching `layout.tsx` for `isMac`.

**Files:**
- Modify: `packages/electron/src/main/preload.ts`, `packages/ui/src/pages/home/components/layout.tsx`
- Test: none at unit level. The check is in the running app.

**Interfaces:**
- Produces: a CSS custom property `--llmr-zoom` on `document.documentElement`, a number, updated whenever the zoom factor changes.

- [ ] **Step 1: Reproduce and measure.** Run `npm run dev:electron`, press Cmd and minus twice, and record the zoom factor and whether the sidebar toggle sits under the green button. If it does not reproduce, stop and report.
- [ ] **Step 2: Confirm the preload can read the zoom.** Check that `webFrame.getZoomFactor()` is available in this app's preload with its sandbox setting. If it is not, stop and report with what is available.
- [ ] **Step 3: Publish the zoom factor.** In the preload, set `--llmr-zoom` on `DOMContentLoaded`, because a preload can run before `document.documentElement` exists, and on `resize`, which fires when the zoom changes.
- [ ] **Step 4: Divide the insets by it, in the `isMac` branches only.** The other platforms' values stay as they are. A class such as `left-[84px]` becomes `left-[calc(84px/var(--llmr-zoom,1))]`. The inline widths become `calc(<n>px / var(--llmr-zoom, 1))`.
- [ ] **Step 5: Check at 80%, 90%, 100% and 125%.** Pass when the toggle clears the green button at each. Attach a screenshot of each to the PR. Say in the PR that Windows and Linux were not checked.
- [ ] **Step 6: Commit.** `fix(electron): keep the header inset correct when the page is zoomed`

---

### Task 8: Price a request the same way in Logs and in the totals (F-9)

Six identical requests of 143 input and 4 output tokens showed `$0.000016` each in Logs and `$0.000028` each in the totals. The first figure matches the catalog's `anthropic/claude-haiku-5-5` price.

**The cause is not known.** The first draft of this task blamed `recordInternalUsageEvent` in `packages/core/src/usage/billing-sync.ts` for passing no pricing. An audit read the code on 2026-11-21 and found that account cannot produce the difference. It was read, not run:
- `providerModelPricingForUsage` (`packages/core/src/models/pricing-service.ts`) returns only a price the provider has configured. A provider with none gets `undefined` on both paths, so passing it changes nothing.
- `findModelPrice` gives the same price for the same model, provider and tokens, whichever path asks.
- An ordinary request already reaches usage with pricing, through `UsageStore.recordCapture` (`packages/core/src/usage/store.ts`). `recordInternalUsageEvent` is the gateway's billing path. It records under the client `Fusion (internal)` and takes the gateway-reported cost through `authoritativeUsageCost` before any estimate.

Candidates the audit left: a gateway-reported cost that differs from the estimate, a second usage row per request from the billing event, different token normalisation on the two paths, or the three requests the owner made before logs were on.

**Files:**
- Test: `packages/core/test/integration/usage/usage-store.test.mjs`
- Modify: decided by Step 1.

- [ ] **Step 1: Find which rows make the total.** In `usage-store.test.mjs`, seed a price catalog through the `estimateCost` and `loadPriceCatalog` options of `UsageStore`. The real catalog is fetched from outside hosts, which a test must not reach. Record one request of 143 input and 4 output tokens through `recordUsageCaptureFromRawTrace`, and one billing event for the same request through `GatewayBillingSynchronizer`. Read the usage rows. Report how many rows the one request produced, and each row's `cost_source` and cost beside the request log row's cost.
- [ ] **Step 2: Stop and report.** State which candidate the rows show, with the numbers. If none of them shows, say so, and name the next check: read `usage_events` (`cost_source`, `request_id`) in a test home after one real request. The fix is designed from that result, as a new step in this task, and audited against the code before it is built.
- [ ] **Step 3: Commit the test** if it pins a real difference. `test(usage): pin how one request is priced in the totals`

---

## Open items

No task covers these. Each names what settles it.

| Item | Why it is not a task | What settles it |
|---|---|---|
| `llmr <profile>` while the desktop app runs the gateway | The CLI applies profiles in its own process (`packages/cli/src/cli.ts:157`). A key it creates or prunes does not reach the app's gateway. Task 2 fixes the in-process order only. | Read `reloadPersistedRuntimeConfig` in `gateway-service.ts` and the control route that calls it. Decide whether the CLI calls that route after an apply. |
| Gateway CORS, `access-control-allow-origin: *` on every route | The fork sets it by default and LLMR's compiled config sends no `cors` block. Whether the management UI calls the gateway from another origin is unknown. | Search the UI for requests to the gateway endpoint. If there are none, add `cors: { enabled: false }` in `packages/core/src/gateway/core-runtime/config-compiler.ts` as its own PR. |
| Fastify `disableRequestLogging` deprecation | Fork code. Harmless until `fastify@6`. | A fork commit that moves to `logController`, on the owner's word. |
| Codex `experimental_bearer_token` | LLMR writes the profile token into `~/.codex/config.toml` under that key. OpenAI's config reference is reported to call the key discouraged and to name `env_key` in its place. That was read through a summarising fetch on 2026-11-21, so it is second-hand. | Read the Codex config reference directly, then test `env_key` with a wrapper-set variable against the installed Codex version. |
| Installed-agent detection (V-12) | Finders exist for the Claude, ChatGPT, Workbuddy and OpenCode desktop apps. None exists for a CLI. | If the owner wants the step to preselect or warn, start from `getAppInfoPaths` in `packages/core/src/agents/app-info-paths.ts`, which already reaches the renderer and `llmr ui`. |
| Windows, Linux and the Intel mac build | Every check in this plan ran or will run on an arm64 Mac. | Owner: decide whether Task 11 gains a Windows, Linux or Intel pass. |
| A symlinked agent config whose target is missing (F-22) | Apply creates the target through the link, and a restore removes the link. The target keeps LLMR's content, for Codex including the token. Dotfile managers symlink these files. Key revocation makes that token useless after the button, but not after a quit. | Decide whether a restore follows the link. Start at the two `rmSync(file)` calls in `restoreGlobalConfigFile` and `writeStrippedConfigFile`. |
| Claude Code values under LLMR's own key names (F-22) | A user's own `NO_PROXY` hosts and `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT` are reported lost on restore, and a user whose own settings already set the three base URLs alike gets "No original backup was found" with LLMR's endpoint left in place. Both come from telling LLMR's values from the user's by key name. | Reproduce each in a test home. The fix is the V-7 rule for values: remove a value only while it is the one LLMR wrote. |
| The Codex app's data under `~/.codex/.llm-router/` and a custom-path `.claude.json` | LLMR launches the Codex app with a user-data directory under `~/.codex/.llm-router/`, so the app's own data lives there and Task 4c leaves it. For a Claude Code profile with a non-default `settingsFile`, LLMR writes `<dir>/.claude.json` with a marker and no restore touches it. | Read what the Codex app stores there before removing anything. Decide whether a restore owns the custom-path `.claude.json`. |
| Codex and Workbuddy on one config directory | The owner guard is per agent, so a Codex restore strips a provider table a Workbuddy profile on the same directory still needs. Read in code by the audit, not reproduced. | Reproduce it in a test home. If it holds, skip the strip while another enabled Codex-family profile uses the file. |
| The Codex stripper on a real original | `originalSnapshotCandidate` applies the stripper to a snapshot. A profile whose provider id equals a provider the user's own file names (for example `openai`) would lose the user's `model_provider` line from what is restored. The `.llmr-original` file itself stays intact. Read in code by a reviewer. | Strip a snapshot's `model_provider` only when the snapshot shows other LLMR content. |
| The Codex writer on awkward files | `removeCodexProviderTable`, `removeCodexMcpServerTable` and `removeManagedMarkerLines` run on the user's file at every apply and know nothing of multi-line strings. A `"""` string that holds a line like `[model_providers.llm-router]` is cut, and Codex then fails to load the file. On a CRLF file the marker regex eats line breaks and leaves bare carriage returns. Measured by a research agent, 2026-11-21. Task 4d fixes the stripper's own scan and leaves the writer. | Give the writer the string-aware line iterator from Task 4d, and match markers with an optional carriage return. Check first whether Codex or a Windows editor ever saves the file as CRLF. |
| Agents with no stripper | OpenCode, Kilo, Pi, ZCode and Workbuddy have an all-or-nothing managed test, so a restore can remove a file that holds the user's content. V-7 leaves them on today's behaviour, where the backup survives. | Write a stripper per agent, then apply Task 4a's rules to it. |
| The empty `~/Library/Application Support/LLM Router` folder | Cosmetic. Electron creates it before LLMR moves its data directory. | Owner: leave it unless he wants it gone. |

## Appendix A. Research behind V-4, V-5 and V-11

Three researchers worked on 2026-11-21, two in the code and one on vendor documentation and comparable tools. The plan author re-read each claim below that names a file and line.

**What the code said on 2026-11-21, before Task 3.** Line numbers and the sentence about the global scope naming no file are history: PR 130 changed both.

- A launch by name already refuses a disabled profile. `findProfileForOpen` filters on `profile.enabled` (`packages/core/src/profiles/launch-core.ts:30`) and throws `was not found or is disabled`.
- A gateway used only through API keys loses nothing when every profile is off. Every reader of `profile.enabled` resolves a profile from a profile key and returns early without one.
- Every profile launch applies every enabled global profile (`packages/cli/src/cli.ts:157`). With enabled defaults, `llmr <any profile>` also takes over the second agent.
- Docker takes over both agents inside the container today. The bootstrap config has no profile key, so the loader uses the defaults and the web server applies them at start.
- The Effect scope dropdown has two options, `Only opened from LLMR` and `System default` (`packages/ui/src/pages/home/shared/options.ts:137`). A new profile defaults to the first (`shared/profiles.ts:560`). Onboarding shows the second only because it prefills from the global default profile.
- The global scope shows no text that names the file it rewrites. The `llmr` scope says "LLMR does not write your settings.json" (`profiles.tsx:889`).
- For Codex the `llmr` scope sets `CODEX_HOME` to LLMR's own directory (`packages/core/src/profiles/service.ts:2311`). Whether that loses the user's Codex login and history is inferred, not tested.

**What the vendors document.**

- Claude Code documents `--settings <file or JSON>`. Its values override the user's `settings.json` for one session, and the precedence is managed settings, command line, project, then user (local Claude docs, index dated 2026-11-21, `cli-reference` and `settings`). LLMR's shared-home mode already uses this.
- Codex documents top-level `model_provider` with a `[model_providers.<id>]` table, `--profile <name>` with a sibling `<name>.config.toml`, `-c key=value` and `CODEX_HOME`. Its docs do not show a provider defined in a profile file. These were read through a summarising fetch.

**What comparable tools do.**

- Upstream `musistudio/claude-code-router` has four open issues about this behaviour: 1575, 1602, 1647 and 1580.
- cc-switch edits the agent's global file, with a separate switch per tool, a preview of the resulting file and a backup before the first write (its README, second-hand).
- The LiteLLM and OpenRouter guides for Claude Code edit nothing. They give shell exports for the user to add.

**What was rejected.**

| Design | Why not |
|---|---|
| No default profiles at all | The onboarding draft then defaults to the `llmr` scope, the UI fallback lists change, and the same tests break as for disabled defaults plus more. It gives the user nothing that disabled defaults do not. |
| Defaults stay enabled and apply only when the agent is installed | It needs the CLI detection V-12 leaves out, and an agent installed later is taken over without a word at the next start. |
| Onboarding selects `Only opened from LLMR` | Plain `claude` and `codex` are then not routed, which is what most users connect an agent for. For Codex it means an isolated home. |
| Multi-select of agents on the step | The form and `submitProfileDraft` are built around one draft. A second agent is one **Add profile** away. |

**Not verified.** Nobody ran `claude --settings` with an `apiKeyHelper`, a Codex profile file that carries a provider, a skip in a running app, or a crash with a takeover in place. The cc-switch and Codex documentation claims are second-hand.

## Appendix B. What the 2026-11-21 audit changed

| Where | Before | After | Why |
|---|---|---|---|
| Task 4 | Remove the managed file and every managed backup | Strip LLMR's content, remove a file or backup only when nothing else is left | A Codex file counts as managed when it merely contains LLMR's block. The old step deleted the user's own additions. |
| Task 2 | Restart the gateway again after each profile apply | Create and prune profile keys before the gateway starts | The first design fixed the symptom and restarted the child twice per profile change. |
| Task 2 tests | In `gateway-runtime-change.test.mjs` with a `childStarts()` counter | In `gateway-status.test.mjs`, detecting a restart by pid | The first file starts no gateway and no counter exists. |
| Task 1 test | Stuck-config case in the middle | Last in the test, with seven flipped assertions | A later save with an older revision throws. |
| Task 3 | Local and import both named `onboardingProfileIndex` | Local renamed | A compile error. |
| Task 8 | Reorder the candidate keys | Make both paths share one lookup, after a test reproduces the difference | The reorder does not reach a provider with no catalog prefix. |
| Task 9 | Clear the day marker in one store | Read the value before the day gate, prune nothing when no value is saved, write through the writer worker | Other open stores kept the old value for a day, and a missing value pruned to one day for good. |
| Verification | A VM check at the end of every task | One owner-run VM pass in Task 11 | An agent cannot drive UTM and the checks need a provider key. |
| Order | Most tasks independent | One fixed serial order | Eight pairs of tasks edit the same files. |
| New | none | Task 10, Task 11, V-13 to V-16, two phases | Parked items that bear on the goal, a missing release step, and choices that were buried in steps. |

Not taken from the audit: a `stoppedReason` field in place of `lastError` (recorded under V-6 for the owner), and splitting the plan into two files. The two phases do the same job in one file.

## Appendix C. What the 2026-11-21 restore research changed

The owner asked for research before confirming V-7 and V-16. One agent traced the restore code and probed each starting state in an isolated home. One read outside sources. The plan author confirmed the three code claims the redesign rests on: Codex has no stripper and its managed test is a contains-test, the Claude Code stripper always returns JSON text, and a gateway stop runs the same restore code as the button.

| Where | Before | After | Why |
|---|---|---|---|
| V-7 | Covered the case where no original file existed | Covers every trigger and both cases, names which agents have a stripper, and adds key revocation and the backup rule | The quit path runs the same code, and a Codex file edited during a takeover loses those edits today |
| V-16 | The plan author's call | The owner's, tied to V-7, with the result message specified | A prompt would guard one of several paths to the same file changes |
| Task 4 | One task that assumed a Codex stripper | Task 4a writes the stripper and cleans the no-original case. Task 4b handles edits made during a takeover and tokens in backups. Task 4c handles the side files and the messages | No Codex stripper exists. The old Step 5 would have deleted the backup that is the user's only copy |
| Task 4, "nothing left" | Whitespace only | Defined per format | The Claude Code stripper returns `{"env": {}}` for a file that held only LLMR's settings, so the old branch could never remove the file |
| Review Focus 4 | Byte for byte | Same settings, formatting may change | The Claude Code stripper writes the file back with `JSON.stringify`. Byte-exact needs a JSON editing dependency |
| Old Step 6 | Remove `~/.codex/.llm-router/` | Remove LLMR's own file in it, then each directory only if it is empty | The Codex app keeps its own data there |

**Audit of the rewrite, the same day.** Two independent passes checked the rewritten tasks, one against the code and one on the design. Both found that Tasks 4a and 4b could not be run as written. The plan author confirmed each finding below in the code before applying it.

| Where | Before | After | Why |
|---|---|---|---|
| The stripper | Built from `removeManagedMarkerLines` and two table helpers | Deletes everything between each marker pair, with a value fallback | `removeManagedMarkerLines` deletes only the marker lines, so LLMR's `model_provider` and catalog lines would have survived |
| Displaced values | Stored in the takeover record | Read from the snapshot. Task 4b adds a hash in a per-profile state file | The takeover record is compared by JSON on every apply. A new field would restore and retake every agent each time |
| Task 4b's rule | Strip before the snapshot | Restore the snapshot when the file is as LLMR wrote it, strip only when it changed | A strip alone loses the user's root keys and `[profiles]` table, and breaks the `#1951` byte assertion |
| Token checks | Search for `experimental_bearer_token` | Search for the key's value | The token is also written into an MCP `env` table and an `Authorization` header |
| Test setup | Unstated | An enabled profile, with the file and token asserted before the restore | Default profiles ship disabled, so an apply wrote nothing and every assertion passed with no fix |
| Call sites | "Both" Codex call sites | Three, each with a test | `applyCodexProfile` and `restoreInactiveGlobalProfileConfigs` had no test |
| Backups | 4a kept mixed backups, 4b stripped them | 4a writes none at restore and sweeps existing ones. 4b covers apply-time backups | 4a's own token test could not pass, and apply-time backups were not covered at all |
| The marker | Kept after a strip | Removed in every no-original outcome | It is a leftover file, and a file the user keeps should become the original |
| Side files and messages | Steps of Task 4a | Task 4c | Task 4a was the largest task in the plan. The data-loss fix now lands first and alone |
| Messages | Three texts, "log in again" | Five texts, scoped to two agents and to the paths where the profile ends disabled | The takeover sync re-applies at once, and a user who only used the agent through LLMR never logged in before |
| V-7 | "Revokes the key at once" on every trigger | Only when the restore leaves the profile disabled | A quit leaves the profile enabled and reuses the key at the next launch |
| The stripper, again (found while building Task 4a) | Delete everything between each marker pair | Remove each line by what it holds | Codex writes a new table inside LLMR's last marker pair, so the block rule would have deleted the user's table. Reproduced with codex-cli 0.171.0 |
| Backups when no original existed (found in the review of Task 4a's PR) | Keep a backup that holds the user's content, stripped | Delete every backup | Three reviewers reproduced a stripped backup being written back as "the original", which returned a table the user had deleted |
| Task 11 | One restore check | A token check, a 401 check and a third pass on a real Codex install | Whether Codex keeps LLMR's comment markers when it rewrites the file is known only second-hand |

Not taken from the audit: promoting "Claude Code values under LLMR's own key names" from Open items to a task. It is user content lost, so it bears on the goal, but it is known only from a probe the plan author did not rerun. It stays in Open items with its check named.

Outside sources, read on 2026-11-21 by the research agent and not re-read by the plan author:
- Codex saves folder trust, the chosen model and MCP servers to `config.toml` on its own: `codex-rs/core/src/config/edit.rs` in `openai/codex`.
- Claude Code saves `/model`, the theme and user-scope plugin choices to `~/.claude/settings.json`: <https://code.claude.com/docs/en/settings>.
- conda (`init --reverse`) and rustup (`self uninstall`) strip their own lines and delete no file. A tool that does this same job with whole-file backup and restore fixed lost `mcp_servers` blocks in its v3.12.2 release notes.
- Apple's Human Interface Guidelines on alerts, Microsoft's dialog guidance and Nielsen Norman Group reserve a confirmation for an action that cannot easily be undone: <https://developer.apple.com/design/human-interface-guidelines/alerts>, <https://www.nngroup.com/articles/confirmation-dialog/>.
- CWE-459 and the OWASP Secrets Management Cheat Sheet say to delete leftover copies of a secret and to revoke it: <https://cwe.mitre.org/data/definitions/459.html>.

## Appendix D. What the 2026-11-21 stripper measurement changed

PR 132 (Task 4a) deleted every backup when a restore found no original, because a stripped backup had been written back as "the original". That left no fallback copy. The owner asked for research before accepting it. One agent measured the stripper against real Codex in throwaway homes. One evaluated the backup options in the code.

**Measurement** (codex-cli 0.171.0, each Codex run in its own `CODEX_HOME` under `env -i`; a research agent's figures, of which the plan author reran the F-24 reproducer):

| Test | Cases | Result |
|---|---|---|
| The same Codex commands on an empty file and on an LLMR-written one, then strip the second and compare | 352 | 190 equal as text, 72 equal apart from blank lines or table order, the rest different |
| Generated user content, direct strip | 2,500 | 1,463 kept every user line and nothing of LLMR's |
| A second strip changes nothing | 7,500 | 0 failures |

The generator over-weights multi-line strings, CRLF and comments on purpose, so its failure rate is not a real-world rate. The failure classes are F-24 to F-26 in the validation record. Commands exercised offline: `codex mcp add` and `mcp remove` in several forms, `features enable` and `disable`, and the app-server's `config/value/write`, `config/batchWrite` and `modelProvider/default/set`. Not exercised: anything that needs a login, and edits made from Codex's interactive screens.

The harness is not in the repo. It was left in `scratchpad/exp/` of the session that ran it (`bundle.mjs`, `exp1.cjs`, `exp2.cjs`, `exp3.cjs`, `repro1.cjs` to `repro4.cjs`), which a reboot can clear. Task 4d Part 3, Step 1 puts the two checks worth keeping into the repo: the F-24 fixture test and the 500-case property test.

**What it changed:**

| Where | Before | After | Why |
|---|---|---|---|
| V-7, backups | A restore with no original deletes every backup and keeps no fallback copy | The same, plus one raw safety copy in LLMR's own folder before a strip changes an edited file, last three kept | The stripper is not exact, and the stripped backups it replaced protected nothing: the same stripper made them |
| The stripper | Decides what is LLMR's from the text | Removes what LLMR recorded it wrote | Codex drops the comment the stripper relied on, and writes root keys inside LLMR's block |
| The hash of what LLMR wrote | Introduced in Task 4b | Introduced in Task 4d, in a record keyed by file path | Task 4d needs it to skip the safety copy for a file nobody edited, and one caller has no profile |
| New | none | Task 4d, between 4a and 4b | Task 4b makes the strip run on every quit for a changed file. The strip has to be exact first |

**Audit of Task 4d, the same day.** One pass checked the first draft of Task 4d against the code and found it could not be run as written. The plan author confirmed the symbols and history it cites. It changed: how `applyCodexProfile` learns which lines are LLMR's (`buildCodexConfigToml` returned only a string), where the record is cleared (the first draft used a hook one call site never reaches), which of the two no-original paths save a safety copy, how the copies are pruned (the first draft's call pruned nothing), the token pattern (older keys start with `ccr-profile-`), and two tests that could not be written. It also found that the string scan needs to track one-line strings, comments and bracket depth, not only `"""`.

**Second audit of Task 4d, the same day.** A pass on a different model checked the corrected text and ran sequences in a throwaway home. Its verdict was "yes with fixes". It changed: the record gains `edited`, because a re-apply rehashes a file the user edited and the hash alone then reports it as untouched (run); the F-23 guard no longer skips the snapshot lookup, because a stale marker left by v8.0.0 sits beside a real original and skipping would lose it (run); a record is ignored unless the file tests managed, and is written before the file; the live file and the snapshot get separate strippers; a `show_all_sessions` line is removed when the profile stops setting it (run); and the task is split into four PRs. The plan author accepted these on the auditor's evidence and did not rerun them. The fixes are designs that nobody has built.

Not taken: verifying a strip at run time by comparing lines before and after. Without a record of what LLMR wrote it repeats the stripper's own guess, and a refusal on quit would leave the token in place with nobody to see it. The record makes the strip exact instead.

Outside practice, read through a summarising fetch by the research agent: conda and rustup strip their own lines and keep no copy; oh-my-zsh, dpkg and rpm keep one suffixed copy beside the file; Apple's file system guide puts files an app manages on its own under Application Support, not in the user's folders: <https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html>.

## Appendix E. What the review of PR 133 changed

PR 133 (Task 4d Part 1) was reviewed by three agents, each of which ran sequences in an isolated home. Three findings were left unfixed in that PR and recorded as Open items. The owner asked for proper fixes the same day. The plan author reran all three on `main` at `2e83ff7c` with throwaway tests, then built the fix for two of them as throwaway code and ran the core suite against it.

| Finding | Measured on `main` | Where it is fixed |
|---|---|---|
| F-27 | With a stale marker, an old clean backup and a live file holding only keys LLMR also writes, a restore writes the old backup back | Task 4e |
| F-28 | After the user deletes the live file, a no-original restore deletes a backup holding the user's `permissions` key and reports "already matches the LLMR backup". Before PR 133 the backup was written back, which resurrected a file the user had deleted | The copy: Task 4d Part 4, Step 3 (V-17). The message: Task 4c's `absent` text |
| F-29 | A truncated copy of LLMR's `settings.json` among the backups is restored with status ok, with or without an original | Task 4e |

**What the research found.**
- An apply refuses a `settings.json` that does not parse (`readClaudeCodeSettingsObject` throws, and the status is not ok) and writes no backup of it. Run. So a Claude Code backup that does not parse never came from an apply, and one that also carries LLMR's helper path or endpoint is never the user's original.
- PR 133's test, "the stripper would change it", is true of files that are wholly the user's, because the Claude Code stripper goes by key name. The apply path already has the narrower test in `claudeCodeDisplacedEnv`.
- Stopping the lookup at the first skipped backup was considered and not taken. A real original can sit behind an apply-time backup beside a stale marker, and stopping would strip the live file and delete that original. Reasoned from the code, not run.
- For Claude Code the no-original lookup is reached only when the live file is absent or holds nothing but keys LLMR also writes. A file with any other key is stripped in place first. Run in PR 133.
- An audit of the first draft of Task 4e built it and ran it. It found that returning an accepted backup unstripped writes LLMR's leftover env back, and that the takeover test missed a copy from before a port change and a WIF profile's copy. The plan author rebuilt the design with both corrections and reran the suite and the auditor's two states.

Not covered here: the stripper still removes the user's own values under LLMR's key names when it strips a live file or a takeover-time backup. That is the Open items row "Claude Code values under LLMR's own key names".

## Appendix F. What the audit of the whole plan changed

On 2026-11-21 four passes read the plan against `main` at `06dd4b4f`: the restore tasks, Tasks 5, 10 and 11, the Phase B tasks, and the document itself. Two ran on one model and two on another. They read the code and ran nothing. The plan author then checked the claims below before changing the text.

| Where | What was wrong | Checked how | Change |
|---|---|---|---|
| Task 4b, Step 5 | Stripping every apply-time Codex backup would bring F-23 back: with no original, a stripped backup passes for the original | Run by the plan author with a planted backup. The deleted table came back | No apply-time backup in the no-original state, a new test, Review Focus 8 |
| Task 4d Part 4, Step 2 | "Save unless untouched" saved a copy for every Claude Code file, which has no record | Read | Save only when a record exists and the file is not untouched |
| Task 4b, Step 4 | `restoreGlobalConfigFile` has no provider ids and no way to pass the displaced lines | Read | `stripLiveContent` takes `displaced` |
| Task 4d Parts 3 and 4 | Which stripper feeds the lookup, and whether clearing the record removes the safety copies | Read | Both stated |
| Task 4e, Steps 2 and 4 | Counted three tests where Step 1 adds five | Read | Pattern and count fixed |
| Task 5 | Assumed the unconfirmed V-6, a test that could not run as written, an import cycle, an assertion that passed with no fix, an ambiguous teardown | The import, the cycle and the class location checked with grep | A blocked-on line, a corrected test, a new file for the banner |
| Task 11 | A terminal check that passes with the fix absent, release notes the workflow never writes, no check for Tasks 4c, 4e or V-17, a key check the masked log cannot show | The detached spawn and `--generate-notes` checked in the code | Checks rewritten and added, Pass 3 required, a release-notes step |
| Task 6 | Step 6 was already done, drifted line numbers, a missing import | The `title` attributes checked with grep | Step dropped, symbols cited |
| Task 9 | A test that passes with no fix, an existing test the change breaks, a command kind that four code paths would misread, missing files and a docs page | The `#1930` test and the docs sentence checked with grep. The rest read | Test rewritten, an RPC in place of a command kind, files added |
| Task 7 | Drifted lines, non-mac values, preload timing | Read | Symbols cited, two clarifications |
| Task 8 | The stated cause cannot produce the difference | The billing path's client and cost source checked with grep. The rest read | The task now measures first and designs the fix from the result |
| Document | No visible status, Tasks 10 and 11 ordered in a loop, open decisions marked three ways, stale lines after six merges | Read | A status paragraph, a Status column, one marking for open decisions |

Not done: the audit's readings of Task 9's command paths and Task 8's pricing were not run. Each task's first failing test is the check.

## Appendix G. Research behind V-6, V-8 and V-9

Done on 2026-11-21 so the owner can decide the three open rows. The code was read by the plan author on `main` at `affc3bee`. Outside practice was read by a research agent from the vendors' own pages, most of which carry no date, and the plan author did not reopen them. Nothing here was run.

**V-6, how a gateway with no model reports itself.**
- Eight places read the gateway status when it is not running, and each prints `lastError` or falls back to a generic "did not start": `cli.ts` (one), `management-server.ts` (two), `launch-service.ts` (one), `deep-link.ts` (two), `ipc.ts` (one) and `gatewayServiceMessage` in `services.tsx`. The plan's audit had counted four.
- With the reason in `lastError`, all eight show the right sentence with no change. With a separate `stoppedReason` and `lastError` unset, all eight change, or the CLI and the launch path report "did not start" with no reason.
- Three more readers act only on `state: "error"` (the red banner in `App.tsx`, and the "Failed to start gateway" log line in `main-app.ts` and `management-server.ts`). Both options silence them. So does the restart loop in `gateway-service.ts`, which retries only an error.
- No reader treats a set `lastError` as a failure without also checking the state. The `lastError` that `existing-gateway-probe.ts` throws on belongs to another object, the runtime-config control status.
- Outside practice goes the other way. systemd keeps `inactive` apart from `failed`, and a unit skipped by a failed condition never enters `failed`. Kubernetes gives a state a machine-readable `reason` beside a human `message`. Neither puts a non-error cause in an error field. Docker and PM2 have no reason field at all.
- Recommendation: keep V-6 as written. Nothing reads a machine-readable reason today, the status type has no consumer outside this repo, and a later rename costs the same eight edits it costs now.

**V-8, the default number of days.**
- Request logs are off by default. Once on, bodies are captured in full by default, up to 50 MB a part, so the number sets how long prompts and code stay on disk.
- No tool the agent found defaults to one day. Where a product states a number it is a plan tier of 3 to 30 days (Portkey 3 and 30, Cloudflare AI Gateway 3 and 7, Helicone from 7). LiteLLM and self-hosted Langfuse keep everything until told otherwise. Langfuse's minimum is 3.
- Claude Code keeps its own transcripts for 30 days by default (`cleanupPeriodDays`), in plain text. For a Claude Code user a one-day default in LLMR does not shorten how long the same prompts sit on the machine.
- Agent Analysis offers ranges of 7 and 30 days over this same table. At one day both are empty beyond today. Task 9 Step 10 now disables a range the retention cannot fill, whatever the default.
- Not known: what a day of logs costs on disk. The only log database to hand was 143 KB and a month old. Task 11 now measures it.
- Recommendation: 7. It is inside the range others use, it makes two of the three Analysis ranges truthful, and it is the number the owner's surprise at one day points to. 30 would match Claude Code and fill every range, and is not recommended until the disk cost is measured, because bodies are kept in full.

**V-9, a date filter on the Logs page.**
- The list filter has a search box, status, provider, model and credential, and no date field (`RequestLogListFilter`). The table has an index on creation time, and the list's own index ends in it, so a lower bound on the date costs one clause.
- Every general log viewer the agent read offers presets and a custom range (Grafana, Datadog, Honeycomb, Cloudflare). Among LLM gateways, Langfuse and OpenRouter document a date range and the rest document none. The evidence for gateways is thin.
- At one day a date filter had nothing to do. At 7 to 90 days the only way to reach an older request is to page back through every newer one.
- Recommendation: a preset filter (Today, 24 hours, 7 days, 30 days, All) that reuses `UsageStatsRange`, with no calendar and no custom range, as its own task after Task 9. Presets longer than the retention are disabled, as in Task 9 Step 10.
