# v8 Clean-VM Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who installs LLM Router on a clean Mac can add a provider, connect the one agent they chose, and keep it connected, without a false error, a silent takeover of another agent, or a restart.

**Architecture:** Two phases. Phase A is Tasks 0 to 5 (Task 4 is three PRs, 4a, 4b and 4c), an investigation task and a release task. It fixes agent profiles and the first-run screen, and it can ship without Phase B. Phase B is Tasks 6 to 9, the smaller UI defects, cost totals and a request log retention setting. Each task is one branch and one squash-merged PR. Tasks run one at a time in the order under "Order", because several of them edit the same files.

**Tech Stack:** TypeScript, Electron 45, React, `better-sqlite3`, `node:test` with `node:assert/strict`, component tests that render with `renderToStaticMarkup`.

**Spec:** [`docs/superpowers/research/2026-11-20-v8-clean-vm-validation.md`](../research/2026-11-20-v8-clean-vm-validation.md). Finding ids F-1 to F-17 come from that record. Read each finding a task names before you start the task.

**Review history.** Written 2026-11-21 from three code explorations. Audited the same day by two independent passes, one that checked every path, symbol and test against the code and one on the design. The audit found two blockers that this version fixes. Task 4 would have deleted a user's own Codex settings, and Task 2's test named a fixture that does not exist. It also replaced Task 2's design, which restarted the gateway twice, and corrected the causes stated in Tasks 8 and 9. The plan author re-read each audit finding in the code before applying it. Task 4 and decisions V-7 and V-16 were rewritten later the same day after the restore research, and that rewrite was audited by two more passes. Appendix C records both.

**Evidence status.** A cause marked "inferred" was not confirmed by reading the code path end to end. Its task starts with the step that confirms it.

## Decisions

| # | Decision | Who, when |
|---|---|---|
| V-1 | Fixes are batched after the VM pass, not shipped one at a time. | Owner, 2026-11-20 |
| V-2 | Request logs get a setting for the number of days to keep. | Owner, 2026-11-21 |
| V-3 | The top-level `profile.enabled` is derived from the profiles alone. A stored `false` is no longer honoured. A config that v8.0.0 saved with the flag stuck recovers on load, with no migration step. | Plan author. Deleting the flag instead changes about ten runtime readers for the same outcome |
| V-4 | Both default profiles ship disabled. Onboarding enables only the profile for the agent the user picks. A config that v8.0.0 already saved keeps both profiles enabled, and the release notes say so. | Owner, 2026-11-21, after the research in Appendix A |
| V-5 | The onboarding "Connect agent" step gets a **Skip for now** action. It ships only together with V-4, because a skip with enabled defaults still applies both. | Owner, 2026-11-21, after the research in Appendix A |
| V-6 | A gateway that has no provider model reports `state: "stopped"` with the reason in `lastError`. It is not an error. The audit proposed a separate `stoppedReason: "no-models"` field with `lastError` unset, so a reader can tell "never configured" from "failed". That widens `GatewayStatus` for one case. | Plan author. The owner has not confirmed it and may prefer the audit's field |
| V-7 | **Restore original settings** removes only what LLMR wrote, for every agent that has a stripper (Claude Code, Codex), on every trigger (the button, a profile switched off, a gateway stop, a quit) and whether or not an original file existed. A top-level Codex key is removed only while it still holds the value LLMR wrote, and the `model_provider` LLMR displaced is put back. A file is removed only when no original existed and nothing but LLMR's content is left, and "nothing left" is defined per format. A restore that leaves the profile disabled (the button, a profile switched off) revokes the profile's key at once. A quit or a gateway stop leaves the profile enabled and its key valid for the next launch. LLMR keeps no copy of its own token: it writes no backup at restore time when the strip succeeds, deletes backups that hold only LLMR's content, and keeps a backup that holds the user's content with LLMR's content removed. A restore that finds no original removes the `.llmr-original-missing` marker, so a file the user keeps becomes the original at the next takeover. An agent with no stripper (OpenCode, Kilo, Pi, ZCode, Workbuddy) keeps today's behaviour and never loses a backup. LLMR never removes `~/.claude`, `~/.codex`, `~/.claude.json` or `~/.claude/.claude.json`. | Owner, 2026-11-21, after the research in Appendix C |
| V-8 | Retention accepts 1 to 90 days and lives in the request log database, so every process reads the same number. **The default needs the owner's word.** 1 day keeps today's behaviour. 7 days is the audit's proposal, because the owner asked for the setting after one day surprised him. | Range and storage: plan author. Default: open |
| V-9 | No date filter on the Logs page in this plan. The list is sorted newest first and paged. | Plan author. The owner has not confirmed it |
| V-10 | A push or tag on `jrmatherly/llmr-gateway` needs the owner's word each time. Nothing in Tasks 0 to 9 touches the fork. | Owner, standing rule |
| V-11 | Onboarding keeps **System default** as the selected Effect scope, and the step names the file LLMR will change, the copy it keeps and the button that undoes it. The alternative, **Only opened from LLMR**, was not chosen, so the decision of 2026-11-01 that shared home is off by default stands (`docs/superpowers/specs/completed/2026-11-01-claude-code-shared-home-launch.md`). | Owner, 2026-11-21 |
| V-12 | No installed-agent detection in this plan. Finders exist for the desktop apps only. A check for the `claude` and `codex` commands is new code on three operating systems and reports "not found" for a binary that is off `PATH`. | Plan author, from the 2026-11-21 research |
| V-13 | LLMR creates and prunes profile keys before it starts or updates the gateway, so one restart carries the new key list. The gateway child still restarts on a profile change, as it does today, and a restart drops requests in flight. A reload without a restart needs a change in the gateway fork and is not in this plan. | Plan author, from the audit |
| V-14 | The plan author chose these user-visible strings and values. Change any of them in review without reopening the plan: the media protocol labels `OpenAI Images`, `OpenAI Video` and `xAI Video`, the placeholder `Select default model`, the toast offset `top-14`, the consent sentence in Task 3 Step 7, the `Skip for now` label and the skipped Profile row text. | Plan author |
| V-15 | A per-PR gate is the unit, component and end-to-end tests. The clean-VM checks run once, by the owner, on a build that holds every Phase A task (Task 11). An agent cannot drive the UTM window, and the checks need a provider key that must not sit in a repo or a shared folder. | Plan author, from the audit |
| V-16 | **Restore original settings** acts without a confirmation prompt, and only together with V-7. The same file changes run on a quit and a gateway stop, where nobody can answer a prompt. The result message does the prompt's work: it names what was removed and what was kept, says that switching the profile on again undoes it, and says the agent may ask the user to log in. The message is shown where a person asked for the restore. A quit and a gateway stop show none. | Owner, 2026-11-21, after the research in Appendix C |

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

## Order

Run the tasks in this order, one at a time.

| Position | Task | Phase | Why here |
|---|---|---|---|
| 1 | 0 | A | The scripts every later check uses |
| 2 | 1 | A | Task 3 breaks new installs without it |
| 3 | 3 | A | Changes the default config that every later test builds on |
| 4 | 2 | A | Edits `gateway-service.ts` before Task 5 does |
| 5 | 4a | A | Its tests need Task 3's defaults, and it uses Task 2's `reconcileProfileApiKeys` |
| 6 | 4b | A | Builds on the Codex stripper from Task 4a |
| 7 | 4c | A | Edits `disabledRestoreStatus` after Tasks 4a and 4b settle what a restore returns |
| 8 | 5 | A | Edits `gateway-service.ts`, `App.tsx` and `onboarding.tsx` after Tasks 2 and 3 |
| 9 | 10 | A | Investigation, no code |
| 10 | 11 | A | The owner's VM pass and the release |
| 11 | 6 | B | Edits `profiles.tsx` and `network-logs.tsx` |
| 12 | 9 | B | Edits `network-logs.tsx` after Task 6 |
| 13 | 7 | B | Edits `layout.tsx` after Task 5 |
| 14 | 8 | B | Independent, and its cause is inferred |

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
  - With a stripper, sweep `backupFiles(file)`: delete each backup whose stripped content leaves nothing, and rewrite every other backup in place as its stripped content, keeping its file mode.
  - Without a stripper, change nothing. A file LLMR calls managed can still hold the user's content for these agents, so no backup of theirs is ever deleted.
  - Apply the no-backup rule and the marker rule to the Claude Code strip branch too. Its backups hold no token, but each one is a leftover file named `llmr`.
- [ ] **Step 6: Revoke the key.** In `recoverGlobalAgentProfile`, call `await reconcileProfileApiKeys(config)` inside the existing `try` that wraps `refreshRuntime`, before `refreshRuntime`. Both `refreshRuntime` callers end in `gatewayService.updateConfig`, which restarts the gateway when the key list changes. A token left in any copy is then refused.
- [ ] **Step 7: Run the tests.** Expected: PASS, including the `#1951` tests, `backup-files.test.mjs` and the OpenCode, Kilo, Pi and Workbuddy restore tests in `npm run test:core`.
- [ ] **Step 8: State the limit in the PR.** A Codex file whose original existed still goes back to the pre-takeover snapshot, and apply-time backups still hold the token until Task 4b. A quit does not revoke the key, because the profile stays enabled.
- [ ] **Step 9: Commit.** `fix(profiles): remove only LLMR's content when a restore finds no original`

---

### Task 4b: Keep Codex edits made during a takeover, and keep no token in any backup (F-19, F-20)

When the original `config.toml` existed, `restoreGlobalConfigFile` writes the pre-takeover snapshot back (`originalSnapshotCandidate`). That is byte-exact for a file nobody touched, and the `#1951` test in `web-management-server.test.mjs` asserts it. It discards anything the user or Codex wrote while LLMR had the file, because a Codex file with LLMR's block always tests managed and never reaches the strip branch. The discarded content survives only in a backup that also holds the token. Every apply that changes the file adds another such backup through `writeFileWithBackup`.

Stripping every time is not the fix. The writer drops four root keys and the user's `[profiles.<providerId>]` table and reorders the file, so a strip alone returns less than the snapshot does. The rule is: restore the snapshot when the file is as LLMR wrote it, and strip only when it changed.

**Evidence status.** A research agent and an audit agent each probed this in an isolated home. Step 1's tests confirm it.

**Files:**
- Modify: `packages/core/src/profiles/service.ts` (`applyCodexProfile`, `restoreGlobalConfigFile`, `RestoreManagedContentMatchers`, `backupCurrentConfigFile`, `writeFileWithBackup` for the Codex `config.toml`), `packages/core/src/profiles/backup-files.ts`
- Test: `packages/core/test/integration/profiles/profile-service.test.mjs`, `packages/core/test/unit/profiles/backup-files.test.mjs`, `packages/core/test/unit/web/web-management-server.test.mjs`

**Interfaces:**
- Consumes: `stripManagedCodexConfigContent` from Task 4a. This task adds its `displaced` argument (`type CodexDisplacedConfig = { model?: string; modelCatalogJson?: string; modelProvider?: string; profileTable?: string; showAllSessions?: string }`, each value a whole TOML line or table as the user wrote it) and puts a displaced value back only in place of the LLMR line it removed.
- Produces: `backupContent(file, content, options)` in `backup-files.ts`, a content-taking sibling of `backupCurrentFile`, which copies the file. Task 4a's sweep rewrites an existing backup in place and needs none.
- Produces: a Codex state file beside Claude Code's, at `<llmrManagedProfileDir(profile)>/codex/takeover-state.json`, holding the SHA-256 of the `config.toml` LLMR last wrote. Mirror `claudeCodeProfileSettingsStateFile` and clear it through `onReleased`. Do not add fields to `GlobalProfileTakeoverRecord`: `synchronizeGlobalProfileTakeovers` compares those records by JSON, and a new field would make every apply restore and retake every agent.
- Produces: `stripBeforeSnapshot?: boolean` on `RestoreManagedContentMatchers`, set at the Codex call sites only.
- Produces: the displaced values for a strip come from the snapshot, not from new state. Read the four root lines and the `[profiles.<providerId>]` table out of the `originalSnapshotCandidate` content.

- [ ] **Step 1: Write the failing tests.** Same setup rules as Task 4a Step 2: an enabled profile, and the token value read from `loadPersistedApiKeys()`.
  - Review Focus 6: a user `config.toml` with all four root keys (`model`, `model_provider = "openai"`, `model_catalog_json`, `show_all_sessions`), a `[profiles.llm-router]` table and one comment line. Apply, append `[mcp_servers.x]`, recover. The file holds the table the user added, the comment, the four root lines and the `[profiles.llm-router]` table as the user wrote them, and none of LLMR's content.
  - Untouched original: apply and recover with no edit between. The file is byte for byte the original. The `#1951` byte assertion on the Codex file still passes.
  - Model changed between applies: apply, change the profile's model, apply again, append a table, recover. The user's original `model` line is back.
  - No token in a backup after a re-apply: apply, change the profile's model, apply again. No file under `~/.codex` other than `config.toml` and `<providerId>.config.toml` contains the token value.
  - Seven cycles: apply and restore through `restoreGlobalProfileConfigsOnExit` seven times. No backup holds the token value, no two neighbouring backups are equal, and `.llmr-original` is still the snapshot a restore chooses.
- [ ] **Step 2: Run the tests and watch them fail.** Review Focus 6 fails because the appended table is gone. The token tests fail on the backups.
- [ ] **Step 3: Record what LLMR wrote.** In `applyCodexProfile`, after the write, store the SHA-256 of the written `config.toml` in the Codex state file.
- [ ] **Step 4: Strip only a file that changed since LLMR wrote it.** In `restoreGlobalConfigFile`, when `stripBeforeSnapshot` is set and the live file tests managed: if its hash equals the stored one, write the snapshot back as today. If it differs, or no hash is stored, write `stripManagedCodexConfigContent(current, providerIds, displaced)` with `displaced` read from the snapshot. `restoreInactiveGlobalProfileConfigs` has no profile and so no stored hash, and takes the strip. Leave the Claude Code path as it is.
- [ ] **Step 5: Keep no token in a backup.** Every backup of the Codex `config.toml`, from `backupCurrentConfigFile` and from `writeFileWithBackup` in `applyCodexProfile`, writes the stripped content through `backupContent`. A backup whose stripped content leaves nothing, or that equals the newest backup or `.llmr-original`, is not written.
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

`startGateway` throws `NO_AVAILABLE_GATEWAY_MODELS_MESSAGE` when the config has no model (`packages/core/src/gateway/application/gateway-service.ts:204`), and the catch at 295 turns that into `state: "error"`. `App.tsx:726` shows a red banner for any error state. In the onboarding layout the banner is absolutely positioned and covers the heading (`packages/ui/src/pages/home/components/layout.tsx:81`).

Every caller that checks `status.state !== "running"` reports `lastError`, so none of them starts reporting success (V-6).

**Files:**
- Modify: `packages/core/src/gateway/application/gateway-service.ts:203-206`
- Modify: `packages/ui/src/pages/home/components/layout.tsx:79-84`, `packages/ui/src/pages/home/components/onboarding.tsx`
- Test: `packages/core/test/unit/gateway/gateway-status.test.mjs`, `packages/ui/test/component/onboarding.test.tsx`

**Interfaces:**
- Produces: `gatewayService.start(config)` with no available model resolves to a status with `state: "stopped"` and `lastError: NO_AVAILABLE_GATEWAY_MODELS_MESSAGE`. It spawns no child.
- Produces: `OnboardingView` accepts `gatewayStartupError?: string` and renders `GatewayStartupErrorBanner` in flow after `OnboardingProgress`.

- [ ] **Step 1: Write the failing status test.**

```js
test("a gateway with no provider model is stopped, not failed", async () => {
  const status = await gatewayService.start(createDefaultAppConfig());
  assert.equal(status.state, "stopped");
  assert.equal(status.lastError, NO_AVAILABLE_GATEWAY_MODELS_MESSAGE);
});
```

- [ ] **Step 2: Write the failing layout test.** Render `OnboardingView` with `gatewayStartupError="boom"`. Assert that the HTML contains `Service failed to start`, that its index is greater than the index of the progress bar's markup, and that the HTML does not contain `absolute inset-x-0 top-12`.
- [ ] **Step 3: Run both and watch them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/gateway/gateway-status.test.js`
Run: `node build/test.mjs ui && node --test .test-dist/ui/test/component/onboarding.test.js`

- [ ] **Step 4: Return a stopped status.** Replace the throw with the same teardown the `!shouldRunServer && !shouldRunGateway` branch below it performs, then set `state: "stopped"` and `lastError`.
- [ ] **Step 5: Move the banner into flow.** Delete the absolute wrapper in `OnboardingLayout`, pass the message to `OnboardingView`, render the banner after `OnboardingProgress` with `mx-4 mt-3 sm:mx-5`.
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
- [ ] Build a local dmg from `main` with Tasks 0 to 5 merged: `npm run build:app:mac`. Copy it and `scripts/vm-proof/` into the shared folder.

**Pass 1, fresh disposable VM, no agent installed:**
- [ ] `./install-check.sh <dmg name>`. Pass when the first onboarding screen shows no red banner (Task 5).
- [ ] Run `llmr ui --no-open` in a terminal with no provider. Pass when it prints no "Failed to start gateway" line (Task 5).
- [ ] Add a provider. On "Connect agent" pass when the step shows the sentence that names `~/.claude/settings.json` (Task 3).
- [ ] Click **Skip for now** and finish. Run `./collect.sh skipped`. Pass when neither `~/.claude` nor `~/.codex` exists and the API Keys page lists no "Profile:" key (Task 3).

**Pass 2, fresh disposable VM, Claude Code installed first** with `curl -fsSL https://claude.ai/install.sh | bash`:
- [ ] Finish onboarding with Claude Code. Without restarting LLM Router, run `~/.local/bin/claude -p "Reply with the single word: pong"`. Pass when it prints `pong` (Task 2).
- [ ] Run `./collect.sh onboarding`. Pass when the log shows `~/.claude/settings.json` and no `~/.codex` directory (Task 3).
- [ ] Copy the "Profile: Claude Code" key from API Keys. Switch the profile off. Run `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <that key>" http://127.0.0.1:3456/v1/models`. Pass when it prints `401` (Task 2).
- [ ] Switch both cards off, switch Claude Code on, run `./collect.sh latch`. Pass when the log shows `~/.claude/settings.json` (Task 1).
- [ ] Click **Restore original settings** on the Claude Code card, run `./collect.sh after-restore`. Pass when `~/.claude` holds no file whose name contains `llmr` (Task 4a).
- [ ] Switch the Codex card on, then click **Restore original settings** on it and run `./collect.sh after-codex-restore`. Before the click, copy the "Profile: Codex" key from API Keys. Pass when `config.toml` is gone (no original existed in this VM), no file under `~/.codex` contains that key, and `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <that key>" http://127.0.0.1:3456/v1/models` prints `401` (Tasks 4a and 4c). `~/.codex/.llm-router/` may remain only if the Codex app was opened from LLMR.
- [ ] Third pass, only if Codex is installed in the VM. Write a `~/.codex/config.toml` of your own with a comment and `model_provider = "openai"`, and keep a copy. Switch the Codex card on. In Codex, trust a folder, so that Codex itself rewrites the file. Quit LLM Router, do not click Restore. Run `diff` between the copy and the file. Pass when the only differences are the lines Codex added (Tasks 4a and 4b). Task 4a checked one case offline: `codex mcp add` keeps the markers and writes its table inside LLMR's last block. This pass checks an edit Codex makes from its own UI.
- [ ] Run Task 10 Steps 3 and 4 in this VM.

**Release:**
- [ ] The owner picks the version number. Task 3 changes what a new install does.
- [ ] Release notes carry Task 3 Step 14's line, and this one for Task 1: an install whose agents stopped connecting after all profiles were switched off starts applying its enabled profile at the next launch.
- [ ] `npm run release -- <version>` from a clean, up-to-date `main` whose Tests run is green.
- [ ] On the signed dmg from the release, in a fresh VM: `QUARANTINE=1 ./install-check.sh <dmg name>`. Pass when `spctl` says `accepted` and `Notarized Developer ID`.
- [ ] Upgrade check, twice, from a VM that ran 8.0.0: once with a config latched as in F-15, once with both profiles enabled. Pass when the app updates, the latched install applies its enabled profile, and the second install keeps both profiles as they were.
- [ ] Revoke the provider key used in the VM.

---

### Task 6: Fix the small UI defects (F-3, F-4, F-10, F-14, F-8 columns)

**Files:**
- Modify: `packages/ui/src/pages/home/shared/providers.ts:2469`
- Modify: `packages/ui/src/pages/home/components/profiles.tsx:896,964`
- Modify: `packages/ui/src/pages/home/components/network-logs.tsx:963,1373` and the list row's Time and Model cells
- Modify: `packages/ui/src/pages/home/components/feedback.tsx:46`
- Test: `packages/ui/test/integration/providers.test.ts`, `packages/ui/test/component/profiles.test.tsx:330-350`, `packages/ui/test/component/observability.test.tsx`, `packages/ui/test/component/ux-feedback.test.tsx:37`

**Interfaces:**
- Produces: `providerProtocolLabel("openai_image_generations")` returns `"OpenAI Images"`, `"openai_video_generations"` returns `"OpenAI Video"`, `"xai_video_generations"` returns `"xAI Video"`.

- [ ] **Step 1: Write the failing assertions.**

```ts
assert.equal(providerProtocolLabel("openai_image_generations"), "OpenAI Images");
assert.equal(providerProtocolLabel("openai_video_generations"), "OpenAI Video");
assert.equal(providerProtocolLabel("xai_video_generations"), "xAI Video");
```

In `profiles.test.tsx`, the test that renders an empty Claude Code draft asserts `/Select default model/` and asserts that the Default model field does not show the fixture's first `provider/model`. In `observability.test.tsx`, render `LogExpandedDetails` and assert `/network-body-meta[^"]*gap-x-4/`. In `ux-feedback.test.tsx`, change the pinned `top-5` to `top-14`.

- [ ] **Step 2: Run the four files and watch each fail.**
- [ ] **Step 3: Add a media label map** in `providers.ts` that `providerProtocolLabel` checks after `providerProtocolOptions`. Do not add the media protocols to `providerProtocolOptions`. That list is also the set a user can select.
- [ ] **Step 4: Give required model fields a neutral placeholder.** The Claude Code Default model field and the Kimi model field pass `"Select default model"` as the placeholder, not `firstProfileModelPlaceholder(...)`.
- [ ] **Step 5: Add `gap-x-4`** to the summary grid and `title={value}` on the value element of `LogMetric`.
- [ ] **Step 6: Add a `title` with the full text** to the Time and Model cells of a log list row, which truncate at a 1660 px window.
- [ ] **Step 7: Change `top-5` to `top-14`** in `FeedbackStack`.
- [ ] **Step 8: Run the tests.** Expected: PASS. Then `npm run test:ui`.
- [ ] **Step 9: Commit.** `fix(ui): label media protocols and stop four fields misleading the user`

---

### Task 9: Add a request log retention setting (F-17, F-7)

**Blocked on V-8's default.** The owner picks 1 or 7 before this task starts. The steps below write `<default>` for that number.

`pruneOldRequestLogs` (`packages/core/src/observability/request-log-store.ts:1568`) deletes every row from before the start of today. No setting changes that. Two processes can have the database open, the desktop app and `llmr ui`. Each runs a writer worker and a query worker, and each worker builds its own store (`request-log-worker.ts:39`) that prunes on its own. Each store also skips the sweep once it has run for the day (`lastRetentionCleanupDay`, line 1583). A value held in memory by one store goes stale in the others, so the value lives in the database and every store reads it before it decides whether to sweep.

**Files:**
- Modify: `packages/core/src/contracts/app.ts:1273`, `packages/core/src/config/default-config.ts:119`, `packages/core/src/config/config.ts:1020-1040`, `packages/ui/src/pages/home/shared/config.ts:107`
- Modify: `packages/core/src/observability/request-log-limits.ts`, `request-log-store.ts`, `request-log-runtime.ts`, `request-log-worker.ts`
- Modify: `packages/electron/src/main/ipc.ts` (`appSaveConfig`, near line 333), `packages/electron/src/main/main-app.ts:223`, `packages/core/src/web/management-server.ts` (its save handler and line 570)
- Modify: `packages/ui/src/pages/home/components/settings.tsx`, `packages/ui/src/pages/home/components/network-logs.tsx`
- Modify: `docs/src/content/docs/en/guides/install.md`
- Test: `packages/core/test/integration/observability/request-log-retention.test.mjs` (create), `packages/core/test/unit/config/` (a new test through the config loader)

**Interfaces:**
- Produces: `ObservabilityConfig.requestLogRetentionDays?: number`, an integer from 1 to 90.
- Produces: `export const minRequestLogRetentionDays = 1`, `maxRequestLogRetentionDays = 90` and `defaultRequestLogRetentionDays = <default>` in `request-log-limits.ts`. Every default in this task reads the third constant.
- Produces: a new `RequestLogStoreWriteCommand` of kind `"setRetentionDays"` with a `days: number` field. The writer worker handles it. The query worker rejects writes (`request-log-worker.ts:62`), so the setter cannot go there.
- Produces: `RequestLogRuntime.setRetentionDays(days: number): Promise<void>`. It sends that command.
- Produces: a table `request_log_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)` created with `CREATE TABLE IF NOT EXISTS` in `open()`, holding the key `retention_days`. The store has no schema version list to update.

- [ ] **Step 1: Write the failing retention tests.** Use a temporary database file. `rowStartedDaysAgo(n)` is a helper you add. It builds a record input whose `startedAt` is `n` days back, because `created_at` comes from `startedAt`. `setDays(store, n)` sends the new write command through `store.writeBatch`.

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
  const store = new RequestLogStore(dbFile);
  await store.record(rowStartedDaysAgo(30));
  assert.equal((await store.list({})).total, 1);
});
```

- [ ] **Step 2: Write the failing config test.** `parseObservability` is private. Test it through the loader: `replacePersistedAppConfig` a config whose `observability.requestLogRetentionDays` is 500, then `loadAppConfig()` gives 90. Repeat with 0 giving 1, 2.7 giving 2, and a missing value giving `defaultRequestLogRetentionDays`.
- [ ] **Step 3: Run and watch them fail.**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/observability/request-log-retention.test.js`

- [ ] **Step 4: Add the setting to the config path.** Type, default, parse with clamp, and the UI fallback.
- [ ] **Step 5: Add the table, the command and the read.** `pruneOldRequestLogs` reads `retention_days` first. With no row it returns without pruning, because pruning cannot be undone and a process may open the file before the app has written the value. With a row, the gate becomes the pair of today's day key and the value, so a changed value sweeps again the same day. The cutoff is the start of today minus `days - 1` days.
- [ ] **Step 6: Push the value on load and save.** Call `requestLogRuntime.setRetentionDays(config.observability.requestLogRetentionDays ?? defaultRequestLogRetentionDays)` at the four places under Files.
- [ ] **Step 7: Run the tests.** Expected: PASS. Then `npm run test:core`.
- [ ] **Step 8: Add the Settings field.** A number input labelled `Keep request logs for (days)` beside the request logs switch, with min 1 and max 90. Add a component test that it renders with the config's value.
- [ ] **Step 9: Say it on the Logs page.** Under the filter row, one line: `Request logs are kept for N day(s). Change this in Settings.` Add it to the Logs component test.
- [ ] **Step 10: Fix the install guide.** In "Verify the installation", step 4 becomes two steps. Turn on request logs under **Logs**, then send the request and confirm it is listed. Add one sentence that states the default retention and names the setting.
- [ ] **Step 11: Commit.** `feat(logs): add a setting for how long request logs are kept`

---

### Task 7: Keep the header clear of the window buttons at any zoom (F-11)

**The cause is inferred.** The native window buttons sit at a fixed position (`packages/electron/src/main/windows.ts:18`). The header's left insets are CSS pixels and shrink when the page zooms out. Two are classes (`layout.tsx:153,266`). The third, `windowControlSafeAreaWidth` at line 144, is a number used as an inline width at lines 214 and 269.

**Files:**
- Modify: `packages/electron/src/main/preload.ts`, `packages/ui/src/pages/home/components/layout.tsx:144,153,214,266,269`
- Test: none at unit level. The check is in the running app.

**Interfaces:**
- Produces: a CSS custom property `--llmr-zoom` on `document.documentElement`, a number, updated whenever the zoom factor changes.

- [ ] **Step 1: Reproduce and measure.** Run `npm run dev:electron`, press Cmd and minus twice, and record the zoom factor and whether the sidebar toggle sits under the green button. If it does not reproduce, stop and report.
- [ ] **Step 2: Confirm the preload can read the zoom.** Check that `webFrame.getZoomFactor()` is available in this app's preload with its sandbox setting. If it is not, stop and report with what is available.
- [ ] **Step 3: Publish the zoom factor.** In the preload, set `--llmr-zoom` at load and on `resize`, which fires when the zoom changes.
- [ ] **Step 4: Divide the insets by it.** A class such as `left-[84px]` becomes `left-[calc(84px/var(--llmr-zoom,1))]`. The inline widths become `calc(<n>px / var(--llmr-zoom, 1))`.
- [ ] **Step 5: Check at 80%, 90%, 100% and 125%.** Pass when the toggle clears the green button at each. Attach a screenshot of each to the PR. Say in the PR that Windows and Linux were not checked.
- [ ] **Step 6: Commit.** `fix(electron): keep the header inset correct when the page is zoomed`

---

### Task 8: Price a request the same way in Logs and in the totals (F-9)

Six identical requests of 143 input and 4 output tokens showed `$0.000016` each in Logs and `$0.000028` each in the totals. The first figure matches the catalog's `anthropic/claude-haiku-5-5` price. **The cause of the second is inferred.** The request log passes `providerModelPricingForUsage(config, provider, model)` (`packages/core/src/observability/raw-trace-sync.ts:1526`). The usage path, `recordInternalUsageEvent` in `packages/core/src/usage/billing-sync.ts`, passes no pricing, so `UsageStore.record` estimates from the catalog by key. A provider named `CLIProxyAPI` maps to no catalog prefix (`providerModelPrefixes`, `packages/core/src/models/pricing-service.ts:482`), so the lookup uses the bare model name, and `indexPrices` keeps whichever offer was indexed first under that name (line 447).

**Files:**
- Modify: `packages/core/src/usage/billing-sync.ts` (`recordInternalUsageEvent`, which has `this.getConfig()`)
- Modify: `packages/core/src/models/pricing-service.ts` only if Step 1 shows the bare-key choice is the cause
- Test: `packages/core/test/integration/usage/usage-store.test.mjs`

- [ ] **Step 1: Reproduce the difference in a test.** In `usage-store.test.mjs`, with the repo's catalog, price the same event (provider `CLIProxyAPI`, model `claude-haiku-5-5`, 143 input, 4 output) two ways: through the path the request log uses and through the path `recordInternalUsageEvent` uses. Assert that the two costs are equal. Expected: FAIL, with the two numbers in the message. If they are equal, stop and report, because the cause is elsewhere.
- [ ] **Step 2: Make both paths call one function with the same inputs.** Pass `pricing: providerModelPricingForUsage(this.getConfig(), provider, model)` from `recordInternalUsageEvent`. If Step 1 shows that the two paths still pick different catalog offers for a bare model name, make the request log path and the usage path share the one lookup. Do not reorder `modelCandidateKeys`. That function is private and the reorder does not reach a provider with no prefix.
- [ ] **Step 3: Run the test.** Expected: PASS. Then `npm run test:core`. A test that pinned a total by the old price may change. Report each one.
- [ ] **Step 4: Commit.** `fix(usage): price usage totals the way the request log does`

---

## Open items

No task covers these. Each names what settles it.

| Item | Why it is not a task | What settles it |
|---|---|---|
| `llmr <profile>` while the desktop app runs the gateway | The CLI applies profiles in its own process (`packages/cli/src/cli.ts:157`). A key it creates or prunes does not reach the app's gateway. Task 2 fixes the in-process order only. | Read `reloadPersistedRuntimeConfig` (`gateway-service.ts:660-690`) and the control route that calls it. Decide whether the CLI calls that route after an apply. |
| Gateway CORS, `access-control-allow-origin: *` on every route | The fork sets it by default and LLMR's compiled config sends no `cors` block. Whether the management UI calls the gateway from another origin is unknown. | Search the UI for requests to the gateway endpoint. If there are none, add `cors: { enabled: false }` in `packages/core/src/gateway/core-runtime/config-compiler.ts` as its own PR. |
| Fastify `disableRequestLogging` deprecation | Fork code. Harmless until `fastify@6`. | A fork commit that moves to `logController`, on the owner's word. |
| Codex `experimental_bearer_token` | LLMR writes the profile token into `~/.codex/config.toml` under that key. OpenAI's config reference is reported to call the key discouraged and to name `env_key` in its place. That was read through a summarising fetch on 2026-11-21, so it is second-hand. | Read the Codex config reference directly, then test `env_key` with a wrapper-set variable against the installed Codex version. |
| Installed-agent detection (V-12) | Finders exist for the Claude, ChatGPT, Workbuddy and OpenCode desktop apps. None exists for a CLI. | If the owner wants the step to preselect or warn, start from `getAppInfoPaths` in `packages/core/src/agents/app-info-paths.ts`, which already reaches the renderer and `llmr ui`. |
| Windows and Linux | Every check in this plan ran or will run on macOS. | Decide whether Task 11 gains a Windows or Linux pass. |
| A symlinked agent config whose target is missing (F-22) | Apply creates the target through the link, and a restore removes the link. The target keeps LLMR's content, for Codex including the token. Dotfile managers symlink these files. Key revocation makes that token useless after the button, but not after a quit. | Decide whether a restore follows the link. Start at the `rmSync(file)` in `restoreGlobalConfigFile`. |
| Claude Code values under LLMR's own key names (F-22) | A user's own `NO_PROXY` hosts and `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT` are reported lost on restore, and a user whose own settings already set the three base URLs alike gets "No original backup was found" with LLMR's endpoint left in place. Both come from telling LLMR's values from the user's by key name. | Reproduce each in a test home. The fix is the V-7 rule for values: remove a value only while it is the one LLMR wrote. |
| The Codex app's data under `~/.codex/.llm-router/` and a custom-path `.claude.json` | LLMR launches the Codex app with a user-data directory under `~/.codex/.llm-router/`, so the app's own data lives there and Task 4c leaves it. For a Claude Code profile with a non-default `settingsFile`, LLMR writes `<dir>/.claude.json` with a marker and no restore touches it. | Read what the Codex app stores there before removing anything. Decide whether a restore owns the custom-path `.claude.json`. |
| Codex and Workbuddy on one config directory | The owner guard is per agent, so a Codex restore strips a provider table a Workbuddy profile on the same directory still needs. Read in code by the audit, not reproduced. | Reproduce it in a test home. If it holds, skip the strip while another enabled Codex-family profile uses the file. |
| Agents with no stripper | OpenCode, Kilo, Pi, ZCode and Workbuddy have an all-or-nothing managed test, so a restore can remove a file that holds the user's content. V-7 leaves them on today's behaviour, where the backup survives. | Write a stripper per agent, then apply Task 4a's rules to it. |
| The empty `~/Library/Application Support/LLM Router` folder | Cosmetic. Electron creates it before LLMR moves its data directory. | Leave it unless the owner wants it gone. |

## Appendix A. Research behind V-4, V-5 and V-11

Three researchers worked on 2026-11-21, two in the code and one on vendor documentation and comparable tools. The plan author re-read each claim below that names a file and line.

**What the code says.**

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
| Task 11 | One restore check | A token check, a 401 check and a third pass on a real Codex install | Whether Codex keeps LLMR's comment markers when it rewrites the file is known only second-hand |

Not taken from the audit: promoting "Claude Code values under LLMR's own key names" from Open items to a task. It is user content lost, so it bears on the goal, but it is known only from a probe the plan author did not rerun. It stays in Open items with its check named.

Outside sources, read on 2026-11-21 by the research agent and not re-read by the plan author:
- Codex saves folder trust, the chosen model and MCP servers to `config.toml` on its own: `codex-rs/core/src/config/edit.rs` in `openai/codex`.
- Claude Code saves `/model`, the theme and user-scope plugin choices to `~/.claude/settings.json`: <https://code.claude.com/docs/en/settings>.
- conda (`init --reverse`) and rustup (`self uninstall`) strip their own lines and delete no file. A tool that does this same job with whole-file backup and restore fixed lost `mcp_servers` blocks in its v3.12.2 release notes.
- Apple's Human Interface Guidelines on alerts, Microsoft's dialog guidance and Nielsen Norman Group reserve a confirmation for an action that cannot easily be undone: <https://developer.apple.com/design/human-interface-guidelines/alerts>, <https://www.nngroup.com/articles/confirmation-dialog/>.
- CWE-459 and the OWASP Secrets Management Cheat Sheet say to delete leftover copies of a secret and to revoke it: <https://cwe.mitre.org/data/definitions/459.html>.
