# Pass-Through Follow-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who turns on "Sign in with my Claude login" gets a form, a provider dialog, a saved config and an upgrade note that all say what PR 146 does, before that change is released.

**Architecture:** Two PRs. PR 1 is one branch with four tasks and one commit each. Task 1 is core and waits on question 1 under "Open with the owner". Tasks 2 and 3 are UI, Task 4 is docs. PR 2 is Task 5 alone and changes how a Claude Code settings backup is written. Core's probe result, the contract types and the request path are not touched.

**Tech Stack:** TypeScript, React, `node:test` with `node:assert/strict`, `renderToStaticMarkup`, Playwright for one `tests/e2e/` spec.

**Spec:** [`docs/superpowers/research/2026-11-23-pass-through-follow-ups.md`](../research/2026-11-23-pass-through-follow-ups.md). Finding ids F-1 to F-12 and decision ids FU-1 to FU-8 come from it. Read its Decisions table and the finding a task names before you start the task. The design those findings sit on is [`docs/superpowers/specs/2026-11-22-claude-code-login-pass-through.md`](../specs/2026-11-22-claude-code-login-pass-through.md).

**Evidence status.** The plan author read every file, symbol and test helper named below at `main` `e789f962` on 2026-11-23 and ran nothing. A second model then audited the plan against the code on the same day and found no Blockers. It ran the planned tests on today's code through throwaway test files, and it simulated Task 5 by removing the key line from every Claude settings backup in a compiled test bundle. A fix round applied the audit, read the cited code again and ran one more throwaway test. Claims those runs settled carry **ran (audit)**, **ran (audit), simulated** or **ran (fix round)**. Everything else is read or inferred and says so. No fix here was built, so no size is stated.

## Decisions this plan rests on

- **PT-1 to PT-11.** From the pass-through spec. PT-1 to PT-8 are the owner's and settled. PT-9 and PT-10 are technical calls that review may change, and PT-11 is the spec author's. Nothing here contradicts one of them. PT-2 (the mode is chosen per profile and Claude Code shows its own model list), PT-5 (no body rewrite) and PT-11 (a bare model id goes to the pass-through provider) are the ones these tasks lean on.
- **FU-1 to FU-8.** Recommended by the session, 2026-11-23. None is the owner's decision yet. The owner confirms them by approving this plan. FU-1 and FU-2 are Tasks 2 and 4. FU-3 is Task 1, and FU-3 and FU-4 together are question 1 under "Open with the owner". FU-4 has no task. FU-5 is Task 3. FU-6 is Task 4. FU-7 is Task 4 for the sentence and Task 5 for the change. FU-8 is the split into two PRs.
- **Plan author, changeable in review.** The wording of every line of UI copy and doc text below, the names of the new helpers, the choice to leave the provider dialog's step marker as it is, and the choice to leave the empty text of the model step's left pane as it is (Task 3).

## Global Constraints

- There are no outside users. No compatibility path and no migration code. Whether Task 1 is migration code is question 1 under "Open with the owner". The session's view is that it is not, because it removes a field that no code reads, in the function every config load goes through, and it leaves a config that never held the field unchanged.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json`.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`, rendered with `renderToStaticMarkup`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Never pass `--scope`.
- The wire tests skip unless `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js"` is set. Every `npm run test:core` in this plan starts with it.
- **Every commit leaves `npm run typecheck`, `npm run lint`, `npm run test:architecture` and the suites its task touches green.** `tsc` reports unused locals and parameters (`noUnusedLocals` in the root `tsconfig.json`), so a task that removes the last use of an import removes the import.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads. `ui.md` applies to Tasks 2 and 3. The renderer may import `@llmr/core/providers/oauth-plugin`, as `providers.tsx` already does.
- `npm run test:e2e` rewrites `packages/core/models.json` and `packages/ui/src/generated`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- No test, script or doc names a real provider host as a target or holds a real key or login. Test values are made-up strings such as `Bearer sk-ant-oat01-FAKE` and `llmr-rotated-key-0002`.
- Neither a key nor a login may appear in a log line, an error message or a test's failure output. A test that could print one on failure asserts a boolean or a count, as `assert.ok(a === b, "<message>")` and never as `assert.equal(a, b)`.
- `node build/test.mjs <pkg>` bundles every test file of the package in one esbuild run. An import of a name that is not exported fails that build, and no test of the package runs (ran (audit)). So a new export is added as a stub before the test that imports it is run.
- UI text is English only.
- Merging and any release need the owner's word.
- The repository is public. Describe a change by what the code does.

## Review Focus

Each line is a condition no single task's own test covers alone. The test that pins it is named at the end.

1. A plugin entry that is not one of the two Claude entries keeps its `auth` block through a load, a save and a reload. Task 1, Step 1, the third assertion and the last.
2. A Claude-login profile with an allowed model list and no default model still cannot be saved. Task 2, Step 1, the first test's last assertion.
3. A bare model id, which goes to the subscription, gets no "goes to another provider" line. Task 2, Step 1, the third test.
4. A Codex local-login provider keeps its connection check and its model refresh. Task 3, Step 1, the control test.
5. A backup of a Claude-login settings file keeps the user's own custom header lines. Task 5, Step 2, the custom-headers test.

## Findings this plan closes

| Finding | Task |
|---|---|
| F-2 | 1, if the owner keeps it (question 1) |
| F-1, F-12 (kept) | 2, and 4 for the upgrade note |
| F-3, F-11, F-9 for the pass-through provider | 3 |
| F-4 | 4 |
| F-5 | 4 for the sentence, 5 for the change |
| F-7 | Gate B check G3 |
| F-6, F-8, F-9 for other providers, F-10 | None. See "Not in this plan" and "Open with the owner" |

## Conflicts with other plans

Read in `docs/superpowers/plans/2026-11-22-backlog-restore.md` on 2026-11-23. That plan is a draft with unchecked audit Blockers. Nothing here relies on it being built, and this plan edits none of it.

- **Its Task 3** changes `isManagedClaudeCodeSettingsContent`, `stripManagedClaudeCodeSettingsContent` and `withoutManagedClaudeCodeEnv`, and adds the test `a restore leaves no empty env in a file that had none`, which is F-6. Task 5 here calls none of those three, but its Step 1 result depends on what `isManagedClaudeCodeSettingsContent` calls managed. That Task 3 makes the test key on recorded endpoints, so the bare matcher in `restoreInactiveGlobalProfileConfigs` and `syncClaudeCodeManagedGatewaySettingsFile`, which pass none, may no longer call a Claude-login backup without its key line managed. Whichever of the two merges second, its builder runs Task 5, Step 1 again on the merged code and then the restore tests of Task 5, Step 5, and reports any that changed before adjusting one.
- **Its Task 4** adds `removeFileKeepingLink` to `backup-files.ts`. Task 5 here edits `backupCurrentFile` and the `BackupOptions` type in the same file. The edits do not overlap. Rebase onto whichever merged first.
- **Its Task 6** extracts `writeGlobalManagedConfig` from `writeGlobalCodexConfig` and moves OpenCode and Kilo to stripped backups. Task 5 here does not touch `writeGlobalCodexConfig`. That Task 6 also adds `isEmptyContent` to the type `RestoreManagedContentMatchers`, and Task 5 here adds `contentForBackup` to the same type. The second builder keeps both members, in alphabetical order, and rebases. If the owner extends Task 5 to the other agents (see "Open with the owner"), that Task 6 and its Tasks 7 and 8 already do it for OpenCode, Kilo, Pi and ZCode, and the extension is dropped.
- **Its takeover detection** has no signal for a Claude-login settings file. The pass-through plan already records that under its own "Conflicts with other plans". Nothing here changes it.

## Not in this plan

- **F-6, the empty `env` after a restore.** The backlog restore plan's Task 3 owns it, with its test.
- **F-10, the account connector of a provider saved by an earlier version.** FU-4, unless the owner answers question 1 with (c). The owner removes the provider and adds it again, or turns account balance off in its edit dialog. The pass-through plan's "Local steps for the owner", step 2, already has the remove and add.
- **F-9 for Codex, Grok and the other local-login providers.** The edit dialog still probes their base URL with the placeholder key. It predates PR 146 and needs its own look at what each provider answers.
- **A neutral probe state in the contract types.** Weighed under F-3 and not chosen.
- **The provider dialog's step marker.** It shows the Verify step as done for every local-login draft (`providers.tsx:2046`, `:3670`). It is a progress mark and makes no statement about the provider.
- **A line for the other model fields.** Task 2's notice covers the default model only. The Fable, Opus, Sonnet and Haiku fields of a Claude-login profile can also name another provider's model and get no line. FU-1 is scoped to the default model.
- **The empty text of the model step's left pane.** See Task 3, Interfaces.
- **The version number.** See "Open with the owner".

---

## PR 1: findings F-1 to F-4

Branch `fix/pass-through-follow-ups` from `main`.

### Task 1: Drop the stored `auth` block when the config is loaded (F-2, FU-3)

First, because it is core only and nothing else in the PR depends on it.

**Waits on the owner.** Do not start this task until question 1 under "Open with the owner" is answered. With answer (b) the task is dropped. Tasks 2 to 4 then need no code from it, because Task 1 produces nothing they consume and `isLocalClaudeCodeOauthProviderPlugin` stays where it is in `oauth-plugin.ts`. PR 1 then has three commits, Review Focus 1 goes, and the owner says whether Task 3 also changes the dialog sentence "Nothing is stored." (`providers.tsx:2318`, pinned by the test `edit dialog for the Claude Code login provider says it forwards the login and stores nothing`). With answer (c) this task also drops the stale account connector, and its test and Interfaces grow by that case before it is built.

After an upgrade, the first save writes the config without the `auth` block that an earlier version stored in the two Claude plugin entries. The edit dialog's sentence "Nothing is stored." is then true for an upgraded config too. A config that never held the block loads as before.

**Files:**
- Modify: `packages/core/src/providers/oauth-plugin.ts`
- Modify: `packages/core/src/gateway/core-runtime/config-compiler.ts` (`:22`, `:705-713`)
- Modify: `packages/core/src/config/config.ts` (`pickConfig`, `:833-834`)
- Test: `packages/core/test/unit/config/claude-login-stored-auth.test.mjs` (new)

**Interfaces:**
- Produces, in `oauth-plugin.ts`: `export function withoutClaudeCodeStoredLogin(providerPlugins: unknown[]): unknown[]`. It is the private function of the same name in `config-compiler.ts`, moved with its body and its comment unchanged. For each entry that `isLocalClaudeCodeOauthProviderPlugin` accepts it returns a copy without `auth`. Every other entry is returned as it is.
- `config-compiler.ts` keeps both of its calls (`:67`, `:203`), because a config can reach the compiler without a load. Its import at `:22` changes with the move. `isLocalClaudeCodeOauthProviderPlugin` is used there only inside the moved function (`:707`), so the import of that name is replaced by one of `withoutClaudeCodeStoredLogin`. Left in place it is an unused local and `npm run typecheck` fails.

- [ ] **Step 1: Write the failing test.** Isolate the data folders the way `packages/core/test/unit/config/profile-claude-app-takeover.test.mjs` does, with a root named `claude-login-stored-auth-${process.pid}`. Import `loadAppConfig` and `saveAppConfig` from `@llmr/core/config/config.ts`, `createDefaultAppConfig` from `@llmr/core/config/default-config.ts`, and `loadPersistedAppConfig` and `replacePersistedAppConfig` from `@llmr/core/config/config-repository.ts`.

```js
test("a config saved by an earlier version loses the stored auth block on load and on the next save", async () => {
  const auth = { headers: { authorization: "Bearer sk-ant-oat01-FAKE" }, strict: true };
  await replacePersistedAppConfig({
    ...createDefaultAppConfig(),
    providerPlugins: [
      { auth, key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" },
      { auth, key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" },
      { auth: { headers: { "x-other": "kept" } }, key: "other-plugin", providerName: "Other" }
    ]
  });
  const loaded = await loadAppConfig();
  assert.deepEqual(loaded.providerPlugins.map((plugin) => "auth" in plugin), [false, false, true]);
  assert.deepEqual(loaded.providerPlugins.map((plugin) => plugin.key), [
    "llmr-local-agent-claude-code-api-claude-code-oauth",
    "llmr-local-agent-claude-code-api-claude-code-oauth-internal",
    "other-plugin"
  ]);
  assert.equal(loaded.providerPlugins[2].auth.headers["x-other"], "kept");
  await saveAppConfig(loaded);
  assert.equal(JSON.stringify(await loadPersistedAppConfig()).includes("sk-ant-oat01-FAKE"), false);
  const reloaded = await loadAppConfig();
  assert.equal(reloaded.providerPlugins[2].auth.headers["x-other"], "kept");
});
```

- [ ] **Step 2: Run it and watch it fail.** `node build/test.mjs core && node --test .test-dist/core/test/unit/config/claude-login-stored-auth.test.js`. Expected: FAIL at the first assertion, with `[true, true, true]` (ran (audit), which also showed that `loadAppConfig` and `saveAppConfig` accept this fixture).
- [ ] **Step 3: Move the function and call it in `pickConfig`.** Move it to `oauth-plugin.ts` with its comment, export it, and swap the import in `config-compiler.ts` as Interfaces says. At `config.ts:833-834`, assign `withoutClaudeCodeStoredLogin(...)` of the array to `config.providerPlugins`.
- [ ] **Step 4: Run it.** Expected: PASS. Smallest mutations it catches. Removing the call in `pickConfig` fails the first assertion. Dropping `auth` from every entry at load fails the first and the third. Dropping `auth` from every entry at save and not at load fails only the last.
- [ ] **Step 5: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core`. Expected: all pass.
- [ ] **Step 6: Commit.** `fix(config): drop the auth block an earlier version stored in the Claude plugin entries`

### Task 2: The default model is optional while the Claude login toggle is on (F-1, FU-1)

Second. It is the defect a person meets first, and Task 3 reuses nothing from it.

With the toggle on, a Claude Code profile can be saved with no default model, and the field reads "Keep Claude Code default". A default from a provider that is not the pass-through one shows one line that says so. Switching the toggle on changes only the env row, as today, so a saved default stays. Onboarding gets all of it through the shared form.

**Evidence.** That core accepts an empty default model was read (`claudeCodeModelEnv`, `default-config.ts:135`) and not run. Step 6 looks at it in the app. The render counts and the three `isProfileDraftSubmittable` results the tests expect today were run (ran (audit)).

**Files:**
- Modify: `packages/ui/src/pages/home/shared/providers.ts`
- Modify: `packages/ui/src/pages/home/shared/profiles.ts` (`isProfileDraftSubmittable`, `:672-674`)
- Modify: `packages/ui/src/pages/home/components/profiles.tsx` (`AddProfileForm` `:722-742`, the field at `:908-917`, `profileDraftValidation` `:1859-1861`, `AddProfileDialog` `:2247-2298`)
- Modify: `packages/ui/src/pages/home/App.tsx` (the `profileAdd` and `profileEdit` objects, `:3414-3450`)
- Modify: `packages/ui/src/pages/home/components/onboarding.tsx` (`:295-304`)
- Test: `packages/ui/test/component/profiles.test.tsx`

**Interfaces:**
- Produces, in `shared/providers.ts`: `export function isClaudeLoginProvider(provider: GatewayProviderConfig, providerPlugins: unknown[] | undefined): boolean`. True when `providerApiKey(provider) === localAgentProviderApiKey` and some entry passes both `isLocalClaudeCodeOauthProviderPlugin` and the file's own `localAgentProviderPluginMatchesNames(entry, localAgentProviderPluginNamesForProvider(provider))`.
- Produces, in `shared/profiles.ts`: `export function claudeLoginModelNotice(draft: Pick<AddProfileDraft, "agent" | "envRows" | "model">, providers: GatewayProviderConfig[], providerPlugins: unknown[] = [], virtualModelProfiles: VirtualModelProfileConfig[] = []): string | undefined`. It returns a string only when the agent is `claude-code`, `claudeLoginEnabled(draft.envRows)` is true, and `parseProfileModelValue(draft.model, providers, virtualModelProfiles).provider` is a non-empty name that is not the name of an enabled provider for which `isClaudeLoginProvider` is true. The string is `Requests on this model go to <provider>, not to your Claude subscription.`
- Changes: `isProfileDraftSubmittable` returns `claudeLoginEnabled(draft.envRows) || Boolean(draft.model.trim())` for `claude-code`. The allowed-list check above it (`:669-671`) is not moved (F-12).
- Changes: `profileDraftValidation` sets `defaultModel` only when the toggle is off.
- Changes: `AddProfileForm` and `AddProfileDialog` each gain the optional prop `providerPlugins?: unknown[]`. `App.tsx` passes `draftConfig.providerPlugins` in both objects and `onboarding.tsx` passes `config.providerPlugins`.
- Changes, in the form: with the toggle on, the Default model `Field` takes `requirement="optional"` with `optionalFieldLabel`, and its `ModelSelector` takes `placeholder="Keep Claude Code default"`. The notice, when there is one, renders under the selector as `<p className="text-[12px] text-muted-foreground">`.
- Not changed: the toggle's `onChange`, which passes `{ envRows }` and nothing else.

- [ ] **Step 1: Write the failing tests** in `profiles.test.tsx`. Shared values:

```ts
const loginDraft = () => {
  const draft = createProfileDraft("claude-code");
  return { ...draft, envRows: withClaudeLogin(draft.envRows, true) };
};
const loginProviders: GatewayProviderConfig[] = [
  { models: ["first-model"], name: "Fixture" },
  { api_key: "llmr-local-agent-login", models: ["claude-sonnet-5"], name: "Claude Code API" }
];
const loginPlugins = [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }];
```

  - `a Claude login profile can be saved without a default model`.

```ts
assert.equal(isProfileDraftSubmittable(createProfileDraft("claude-code")), false);
assert.equal(isProfileDraftSubmittable(loginDraft()), true);
assert.equal(isProfileDraftSubmittable({ ...loginDraft(), availableModels: ["Fixture/first-model"] }), false);
```

  - `AddProfileForm marks the default model optional while the Claude login toggle is on`. Render the form twice with `providers={loginProviders}`, once with `createProfileDraft("claude-code")` as `off` and once with `loginDraft()` as `on`. With `count = (html: string, text: RegExp) => (html.match(text) ?? []).length`:

```ts
assert.equal(count(on, />Required<\/span>/g), count(off, />Required<\/span>/g) - 1);
assert.equal(count(on, />Optional<\/span>/g), count(off, />Optional<\/span>/g) + 1);
assert.equal(count(on, /Keep Claude Code default/g), count(off, /Keep Claude Code default/g) + 1);
assert.doesNotMatch(on, /Default model is required\./);
assert.doesNotMatch(on, /Select default model/);
assert.match(off, /Default model is required\./);
```

  - `a default model from another provider gets one line while the Claude login toggle is on`.

```ts
const line = "Requests on this model go to Fixture, not to your Claude subscription.";
const notice = (draft: Pick<AddProfileDraft, "agent" | "envRows" | "model">) => claudeLoginModelNotice(draft, loginProviders, loginPlugins);
assert.equal(notice({ ...loginDraft(), model: "Fixture/first-model" }), line);
assert.equal(notice({ ...loginDraft(), model: "Claude Code API/claude-sonnet-5" }), undefined);
assert.equal(notice({ ...loginDraft(), model: "claude-opus-4-8" }), undefined);
assert.equal(notice(loginDraft()), undefined);
assert.equal(notice({ ...createProfileDraft("claude-code"), model: "Fixture/first-model" }), undefined);
```

    Then render the form with `draft={{ ...loginDraft(), model: "Fixture/first-model" }}`, `providers={loginProviders}` and `providerPlugins={loginPlugins}`, and assert `html.includes(line)`. Render it again with the same props and `model: "Claude Code API/claude-sonnet-5"`, and assert `assert.doesNotMatch(html, /not to your Claude subscription/)`. That second render pins that the form passes the prop on, because without the plugin list no provider counts as the pass-through one.
- [ ] **Step 2: Add the stub.** In `shared/profiles.ts`, add the export with the signature Interfaces gives and the body `return undefined;`. Prefix the four parameters with an underscore for this step, so `tsc` does not report them. Without the stub the import in the test file fails the whole UI test build and no test runs.
- [ ] **Step 3: Run them and watch them fail.** `node build/test.mjs ui && node --test --test-name-pattern="Claude login profile can be saved|default model optional|gets one line" .test-dist/ui/test/component/profiles.test.js`. Expected: the build succeeds and each test fails on an assertion. The first fails at its second assertion, because all three results are `false` today (ran (audit)). The second fails at its first, because both renders hold 5 "Required" and 4 "Optional" labels and 4 "Keep Claude Code default" texts today (ran (audit)). The third fails at its first, because the stub returns `undefined` where the test wants the line.
- [ ] **Step 4: Implement** as the Interfaces block says, and give the stub its body and its parameter names.
- [ ] **Step 5: Run the tests, then `npm run test:ui`.** Expected: PASS, with `AddProfileForm marks required and optional fields` and `Claude Code profiles require a default model before submission` unchanged and green. Smallest mutations caught. Returning `Boolean(draft.model.trim())` again fails the first test. Moving the Claude-login return above the allowed-list check fails its last assertion. Keeping `requirement="required"` fails the second test. Treating every provider as the pass-through one fails the third test's first assertion, and treating none as it fails the second. A form that does not pass `providerPlugins` to `claudeLoginModelNotice` fails the last render.
- [ ] **Step 6: Look at it.** `npm run dev:electron`. Add the Claude Code API provider, open a Claude Code profile, switch the toggle on, clear the default model and save. The save goes through and the profile card reads "Keep Claude Code default". Pick another provider's model and see the line. Switch the toggle off and on and see that the pick stays. This is a visual check and is not covered by a test.
- [ ] **Step 7: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Expected: all pass.
- [ ] **Step 8: Commit.** `fix(ui): make the default model optional in Claude login mode and say where another provider's model goes`

### Task 3: The provider dialog says "Not checked" for the pass-through provider (F-3, F-9, F-11, FU-5)

Third. It is independent of Task 2 and touches the same two shared files, so it follows it on the branch.

After Import, the dialog shows no alert. Its Verify step reads "Not checked" with the reason, in the neutral colour, offers no Check Connection, and its heading no longer asks for a model request. The model step offers no refresh. Opening the edit dialog of this provider no longer probes its base URL. Other providers, local-login ones included, behave as before.

**Evidence.** The path from the probe result to the alert was read and not seen in the app. A static render of the edit form with no probe shows the selected `claude-sonnet-5` and, in the left pane, "No provider models" (ran (audit)). Today the form shows no "Not checked", and it shows `Check Connection`, the "is connected" text and `Refresh provider models` (ran (audit)). The Codex control test passes today (ran (audit)). Whether the end-to-end page shows the same as the static render is not run, and Step 6 checks it.

**Files:**
- Modify: `packages/ui/src/pages/home/shared/providers.ts`
- Modify: `packages/ui/src/pages/home/components/providers.tsx` (`ProviderConnectionStatusPanel` `:1739-1823`, `:2015`, the picker's `onRefresh` at `:2380`, the Verify step at `:2397-2409`)
- Modify: `packages/ui/src/pages/home/App.tsx` (the automatic probe effect, the branch at `:1491` and its dependency list)
- Test: `packages/ui/test/unit/provider-setup-steps.test.ts`, `packages/ui/test/component/provider-dialog-local-agent.test.tsx`
- Modify: `tests/e2e/local-agent-login-import.spec.ts` (the test `onboarding discovers the imported login's models through its plugins`)

**Interfaces:**
- Produces, in `shared/providers.ts`: `export function isClaudeLoginProviderDraft(draft: AddProviderDraft, providerPlugins: unknown[] | undefined, existingProvider?: GatewayProviderConfig): boolean`. It is the expression at `providers.tsx:2015` moved, with `existingProvider` passed on to `providerConnectivityProviderPlugins`. `providers.tsx:2015` becomes a call to it and drops its own import of `isLocalClaudeCodeOauthProviderPlugin` if nothing else there uses it.
- Changes: `ProviderConnectionStatusPanel` gains `claudeLoginProvider: boolean`. When it is true and no check is running, the second row has the title `Not checked`, the description `This provider forwards the login Claude Code sends and has none of its own to test with.`, the state `"pending"` and no action. The first row is unchanged.
- Changes: the Verify step's `ProviderFormStepHeader` (`:2397-2400`) takes the description `LLM Router does not test this provider.` when `claudeLoginProvider` is true. For every other draft it keeps "Run a real model request before relying on this provider.", which names a check this provider no longer offers.
- Changes: at `:2380` the picker gets `onRefresh={claudeLoginProvider ? undefined : onRefreshModels}`.
- Not changed: the left pane of the model step. `ProviderModelPicker` fills it from the probe (`catalogModels`, `:2373`), so with no probe it reads "No provider models" and "This provider did not return a model list. Add model IDs with Custom model." (`:4111-4114`). Task 3 leaves that text. It is drawn in the muted colour and raises no alert, its second sentence is the right instruction for this provider, which has no list to fetch, and a different text needs a new prop on a picker every provider shares. The selected models sit in the right pane and do not depend on the probe. The owner may ask for other copy in review.
- Changes, in `App.tsx`: a value computed during render, `isClaudeLoginProviderDraft(providerDraft, draftConfig.providerPlugins, providerEditIndex === undefined ? undefined : draftConfig.Providers[providerEditIndex])`. The effect's branch at `:1491` is also taken when that value is true, and the value joins the effect's dependency list. That branch already clears the probe, the error and the loading flag. `checkProviderDraft` and `refreshProviderModels` are not changed, because the form no longer reaches them for this provider.
- Not changed: `probeGatewayProvider`, `localClaudeProbeResult` and every contract type.

- [ ] **Step 1: Write the failing tests.**
  - Unit, `provider-setup-steps.test.ts`: `a Claude login draft is told apart from other local-login drafts`.

```ts
const marked = { ...createProviderDraft([]), apiKey: localAgentProviderApiKey, name: "Claude Code API" };
const template = { key: "llmr-local-agent-__LLMR_PROVIDER_NAME_SLUG__-claude-code-oauth", providerName: "__LLMR_PROVIDER_NAME__" };
const saved = [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }];
assert.equal(isClaudeLoginProviderDraft({ ...marked, providerPlugins: [template] }, []), true);
assert.equal(isClaudeLoginProviderDraft(marked, saved), true);
assert.equal(isClaudeLoginProviderDraft(marked, [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Claude Code API" }]), false);
assert.equal(isClaudeLoginProviderDraft({ ...marked, apiKey: "sk-test" }, saved), false);
```

  - Component, `provider-dialog-local-agent.test.tsx`: `the Claude Code login provider shows a neutral verify row and no check or refresh`. Use the draft and the plugin of the file's existing Claude test, and add `onCheck: async () => undefined` and `onRefreshModels: async () => undefined` to the props.

```ts
assert.match(html, /Not checked/);
assert.match(html, /has none of its own to test with\./);
assert.doesNotMatch(html, /Check Connection/);
assert.doesNotMatch(html, /is connected when this provider is saved/);
assert.doesNotMatch(html, /Refresh provider models/);
assert.doesNotMatch(html, /Run a real model request/);
```

  - Component, the control: `a Codex login provider keeps its connection check and its model refresh`. The file's Codex draft and plugin with the same two props. `assert.match` for `/Check Connection/`, `/Available after saving/` and `/Refresh provider models/`. Add `assert.match(html, /Run a real model request/)` to it. It passes today (ran (audit) for the first three) and is there to fail under a change that hides too much.
- [ ] **Step 2: Add the stub.** In `shared/providers.ts`, add the export with the signature Interfaces gives and the body `return false;`. Prefix the three parameters with an underscore for this step. Without the stub the import in the unit test fails the whole UI test build and no test runs.
- [ ] **Step 3: Run them and watch them fail.** `node build/test.mjs ui && node --test .test-dist/ui/test/unit/provider-setup-steps.test.js .test-dist/ui/test/component/provider-dialog-local-agent.test.js`. Expected: the build succeeds. The unit test fails at its first assertion, because the stub returns `false`. The first component test fails at `/Not checked/`. The control passes.
- [ ] **Step 4: Implement** as the Interfaces block says, and give the stub its body and its parameter names.
- [ ] **Step 5: Run the tests, then `npm run test:ui`.** Expected: PASS. Smallest mutations caught. Passing `claudeLoginProvider={false}` to the panel fails the first three assertions of the component test. Passing `onRefreshModels` to the picker for every draft fails its fifth. Keeping the header's description for every draft fails its last. Hiding the check or changing the header for every local-login draft fails the control.
- [ ] **Step 6: Change the end-to-end test** `onboarding discovers the imported login's models through its plugins`. Rename it `onboarding sends no probe for the imported Claude login`. Keep the Import and Next step clicks and the wait for `Choose the models that should be available through this provider.`. Then wait one second, because the probe is sent 350 ms after the draft changes, and assert:

```ts
expect(probeRequests.length).toBe(0);
await expect(page.getByText("claude-sonnet-5", { exact: true }).first()).toBeVisible();
```

  The spec's mocked probe answers `supported: true`, which core no longer does for this provider, so the test cannot show the alert. Step 7 looks for it. The length is compared, not the array, so a failure prints a number and not the request.

  Remove the loop over `discoveredModels`, the `No provider models` assertion and the `Refresh provider models` assertion. Add no assertion on "No provider models" in its place, because the left pane shows that text now (see Interfaces). Remove `discoveredModels` if nothing else uses it. Run `npm run test:e2e:install` once, then `npm run test:e2e`, then `git checkout -- packages/core/models.json packages/ui/src/generated`. Expected: PASS. If `claude-sonnet-5` is not visible on that step, stop and report what the step shows, because the page differs from the static render under Evidence. The mutation this test catches is the `App.tsx` branch, which no component test reaches. Without it `probeRequests` has one entry.
- [ ] **Step 7: Look at it.** `npm run dev:electron`. Import the Claude Code provider in the add dialog and walk the three steps. No alert. The model step shows `claude-sonnet-5` on the right, "No provider models" on the left and no refresh button. The last step shows "Not checked", no Check Connection and the new heading text. Save, open the edit dialog, and see no alert and no loading state on the model step. This is a visual check and is not covered by a test.
- [ ] **Step 8: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Expected: all pass.
- [ ] **Step 9: Commit.** `fix(ui): show the Claude login provider as not checked and stop probing it`

### Task 4: The upgrade note and the user docs (F-4, FU-2, FU-6, FU-7)

Last in PR 1, because its text describes what Tasks 2 and 3 built.

The README no longer names a version the owner has not chosen, and it tells an upgrader about a saved default model. The profile page says the default model is optional in Claude login mode and that a settings backup can hold the key line. The provider page says the provider is not checked.

**Files:**
- Modify: `README.md` (`:175-177`)
- Modify: `docs/src/content/docs/en/configuration/profiles.md` (the section "Claude login mode", `:57-70`)
- Modify: `docs/src/content/docs/en/configuration/providers.md` (the "Claude Code" section, `:12-24`)
- Modify: `docs/superpowers/plans/2026-11-22-claude-code-login-pass-through.md` (its Status paragraph, the bullet "Open for the owner")

- [ ] **Step 1: README.** The heading becomes `### Upgrading from 8.x`. After the sentence that ends "should use your Claude subscription." add: `A default model saved in the profile still sends the main model to that model's provider. Clear **Default model** in the profile to start on Claude Code's own default, which runs on your subscription.` The rest of the paragraph stays.
- [ ] **Step 2: `profiles.md`.** After the paragraph that starts "Claude Code then shows its own model list", add: `With the toggle on, **Default model** is optional. Leave it empty and Claude Code starts on its own default model, on your subscription. A default from another provider sends the main model to that provider, and the form says so.` After the sentence "The gateway key sits in that file in plain text." add: `A settings.json.llmr-backup-<time> copy beside the file can hold the same line. Switching the profile off ends that key. Quitting LLMR leaves the profile on and the key in use.` Put the file name in code font.
- [ ] **Step 3: `providers.md`.** After the numbered list of the "Claude Code" section add: `LLMR does not test this provider, because it has no login of its own to test with. The dialog shows **Not checked** and offers no **Check Connection**.`
- [ ] **Step 4: The pass-through plan.** Its Status list has the bullet "Open for the owner" (`:21`), which names the heading "Upgrading to 9.0". After Step 1 that heading is gone. Replace the whole bullet with the text below and change nothing else in that file.

```markdown
- **Open for the owner.** The gateway key line in `.llmr-backup-*` copies of a settings file and the README's upgrade heading are handled in [`2026-11-23-pass-through-follow-ups.md`](2026-11-23-pass-through-follow-ups.md). A model id with `[1m]` reaches Anthropic unchanged, and whether Anthropic accepts it is for Gate B.
```

- [ ] **Step 5: Check.** `git grep -n "Upgrading to 9" -- README.md docs/src docs/superpowers/plans/2026-11-22-claude-code-login-pass-through.md` prints nothing. `npm run lint` passes.
- [ ] **Step 6: Commit.** `docs: correct the upgrade note for Claude login mode and say what the provider dialog shows`

Then open PR 1. Before it: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core`, `npm run test:ui`, `npm run test:electron`.

---

## PR 2: finding F-5

Branch `fix/claude-settings-backup-key` from `main`, after PR 1 has merged.

### Task 5: Write a Claude Code settings backup without the gateway key line (F-5, FU-7)

Alone in its PR, because it changes which backups count as LLM Router's own, and the restore's choice of snapshot reads that.

A `settings.json.llmr-backup-*` copy no longer holds the `x-llmr-api-key` line, whether an apply or a restore made it. The user's own custom header lines stay in the copy. A file with no such line is still copied byte for byte.

**Evidence.** That the backups hold the line today was run by the research and again by the audit. Step 1's test fails today with the file as `{"env":{}}` (ran (audit)). With the key line removed from every Claude settings backup in a compiled bundle, the same test passes and the restore writes `{}` (ran (audit), simulated). That stand-in is broader than the option this task adds, so Step 1 stays in the task and Step 5 is the run on the real code.

**The third writer.** `cleanupClaudeCodeToolHubSettingsFile` (`:428-442`) also writes a profile's settings file through `writeFileWithBackup`, when `cleanupClaudeCodeToolHubArtifacts` calls it with `backup: true`. That happens on an apply with a profile on and no gateway model (`:296-298`). The task passes the option there too, so that every Claude settings write goes through it. Two runs with ToolHub on did not reach that write with a key line in the file (ran (fix round)). For a system-default profile the takeover restore runs first and takes the ToolHub key and the key line out of the file, and its own backup, which `backupCurrentConfigFile` makes, holds both today. For a profile with its own settings folder, `cleanupManagedClaudeCodeToolHubArtifacts` removes the ToolHub key first and makes no backup. So Step 2 pins the path with a test, and no test here fails when only the option at `:439` is dropped. The PR says so.

**Files:**
- Modify: `packages/core/src/profiles/backup-files.ts` (`BackupOptions` `:80`, `backupCurrentFile` `:82-88`)
- Modify: `packages/core/src/profiles/service.ts` (`cleanupClaudeCodeToolHubSettingsFile` `:439`, `claudeCodeManagedContent` `:1121`, `orphanedClaudeCodeManagedContent` `:1179`, `syncClaudeCodeManagedGatewaySettingsFile` `:2288`, `writeClaudeCodeSettingsIfManagedChanged` `:2804`, `writeFileWithBackup` `:2957`, `RestoreManagedContentMatchers` `:3122`, the inline matcher in `restoreInactiveGlobalProfileConfigs` `:3347-3351`, `backupCurrentConfigFile` `:4002`)
- Test: `packages/core/test/unit/profiles/backup-files.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`
- Modify: `docs/src/content/docs/en/configuration/profiles.md` (the sentence Task 4, Step 2 added)

**Interfaces:**
- Changes, in `backup-files.ts`: `export type BackupOptions = { contentForBackup?: (content: string) => string; isManagedContent?: (content: string) => boolean; mode?: number }`. `backupCurrentFile(file, options)` reads the file when `contentForBackup` is set. When the function returns a different string, the backup is written through `backupContent(file, thatString, options)`. Otherwise it is the `copyFileSync` of today.
- Produces, in `service.ts`: `function claudeCodeSettingsBackupContent(content: string): string`, private. It parses the content with `parseJsonContent`. When the content does not parse, has no `env` record, or `withoutClaudeCodeGatewayKeyHeader` changes nothing in that `env`, it returns `content` itself. That function edits the record it is given and returns nothing (`:2912-2923`), so call it on a copy of `env` and compare the copy's `ANTHROPIC_CUSTOM_HEADERS` with the original's. Otherwise it returns `${JSON.stringify(next, null, 2)}\n`, where `next` is the settings with that one line removed.
- Changes: `writeFileWithBackup` takes `options: BackupOptions`. `writeClaudeCodeSettingsIfManagedChanged`, `syncClaudeCodeManagedGatewaySettingsFile` and `cleanupClaudeCodeToolHubSettingsFile` (in its `backup: true` branch) pass `contentForBackup: claudeCodeSettingsBackupContent`.
- Changes: `RestoreManagedContentMatchers` gains `contentForBackup?: (content: string) => string`, and `backupCurrentConfigFile` passes it to `backupCurrentFile`. The three Claude Code matcher sets named under Files set it.
- Not changed: `ensureOriginalSnapshot`, `pruneBackups`, `originalSnapshotCandidate`, `isManagedClaudeCodeSettingsEnvKey`, the Codex path and every other agent's backup.

- [ ] **Step 1: Run the snapshot check on today's code.** Add this test beside `switching from Claude login back to the helper removes the gateway key line` and run it before any source change.

```js
test("a helper-mode restore after Claude login mode gives back the file the user had", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  await withClaudeLoginProfile("claude-login-snapshot", async ({ apply, profile, readSettings, switchOff }) => {
    await apply();
    profile.env = {};
    await apply();
    await switchOff();
    assert.ok(isDeepStrictEqual(readSettings(), {}), "the file is what the user wrote");
  }, { beforeApply: writeUserClaudeSettings({}) });
});
```

  `node build/test.mjs core && node --test --test-name-pattern="helper-mode restore after Claude login" .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected today: FAIL, because the restore takes the Claude-login backup with LLM Router's keys removed and writes `{"env":{}}` (ran (audit)). Write down what the file holds. If the test passes on your checkout, the code has moved since the audit. Keep the test, say so in the PR, and go on, because the tests of Step 2 do not depend on it.
- [ ] **Step 2: Write the failing tests.**
  - Unit, `backup-files.test.mjs`, with `backupCurrentFile` added to the import: `backupCurrentFile writes the text contentForBackup returns, and a plain copy when the text is unchanged`. Pass the file's `posixOnly` option, as its `backupContent` test does, because the test reads a file mode. Enable the mocked `Date` as the file's `backupContent` test does and tick one second between the two calls.

```js
const stripped = backupCurrentFile(file, { contentForBackup: () => "kept", mode: 0o600 });
assert.equal(readFileSync(stripped, "utf8"), "kept");
assert.equal(statSync(stripped).mode & 0o777, 0o600);
t.mock.timers.tick(1000);
assert.equal(readFileSync(backupCurrentFile(file, { contentForBackup: (content) => content }), "utf8"), "old");
assert.equal(readFileSync(file, "utf8"), "old");
```

  - Integration: `no backup of a Claude login settings file holds the gateway key line`. With `backups = (file) => readdirSync(path.dirname(file)).filter((name) => name.startsWith("settings.json.llmr-backup-"))` and `holding = (file, text) => filesHolding(path.dirname(file), text).length`. The search text is the whole header line, so a path that happens to contain the made-up key cannot match.

```js
await withClaudeLoginProfile("claude-login-backups", async ({ apply, config, key, settingsFile, switchOff }) => {
  await apply();
  const first = key();
  config.APIKEYS[0].key = "llmr-rotated-key-0002";
  await apply();
  assert.equal(holding(settingsFile, `x-llmr-api-key: ${first}`), 0, "the backup an apply made holds no key");
  await switchOff();
  assert.equal(holding(settingsFile, "x-llmr-api-key: llmr-rotated-key-0002"), 0, "the backup a restore made holds no key");
  assert.equal(holding(settingsFile, "x-llmr-api-key"), 0);
  assert.ok(backups(settingsFile).length >= 2, "the backups were still made");
}, { beforeApply: writeUserClaudeSettings({ theme: "dark" }) });
```

  - Integration: `a backup of a Claude login settings file keeps the user's own custom headers`. `beforeApply: writeUserClaudeSettings({ env: { ANTHROPIC_CUSTOM_HEADERS: userCustomHeaders } })`. Apply, set the key to `llmr-rotated-key-0002`, apply. Read the newest name of `backups(settingsFile)` after a sort, parse it, and assert as below. The value under test holds the key line today, so the comparison is made before `assert` sees it and a failure prints only the message.

```js
assert.ok(parsed.env.ANTHROPIC_CUSTOM_HEADERS === userCustomHeaders, "the backup holds the user's lines and no key line");
```

  - Integration: `a quit leaves no backup that holds the gateway key line`. `beforeApply: writeUserClaudeSettings({ theme: "dark" })`. Apply, read `key()`, call `restoreGlobalProfileConfigsOnExit(config.profile.profiles)`, and assert ``assert.equal(holding(settingsFile, `x-llmr-api-key: ${thatKey}`), 0)``. The call restores the fixture's profile and leaves no key line in the live file (ran (audit)).
  - Integration: `an apply with no gateway model leaves no backup that holds the gateway key line`. Set `config.toolHub = { ...config.toolHub, enabled: true, llm: { ...config.toolHub.llm, apiKey: "resolver-key", baseUrl: "https://example.test/v1", model: "model" }, mcpServers: [{ command: "node", name: "backend", transport: "stdio" }] }`, as the file's Codex ToolHub restore test does. `beforeApply: writeUserClaudeSettings({ theme: "dark" })`. Apply, and assert `"LLMR_CLAUDE_CODE_MCP_CONFIG" in readSettings().env`. Read `key()`, set `config.Providers = []`, call `applyProfileFixture(config)` directly, because the helper's `apply` asserts a result this apply does not give, and assert ``assert.equal(holding(settingsFile, `x-llmr-api-key: ${thatKey}`), 0)`` and `assert.ok(backups(settingsFile).length >= 2)`. This is the apply that calls the ToolHub cleanup.
- [ ] **Step 3: Run them and watch them fail.** `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/backup-files.test.js` and `node --test --test-name-pattern="holds the gateway key line|keeps the user's own custom headers|helper-mode restore after" .test-dist/core/test/integration/profiles/profile-service.test.js`. Add `|no gateway model leaves` to the pattern. Expected: the unit test reads `old` where it wants `kept`. The key-line test fails at its first assertion with 1, and the quit test at its only assertion with 1 (ran (audit)). The custom-headers test fails today too, because the newest backup holds the user's lines and the key line after them (ran (audit)). After the change it passes (ran (audit), simulated), and it also fails under a change that removes the whole `ANTHROPIC_CUSTOM_HEADERS` key. The no-gateway-model test fails at its first count with 1, because the restore's backup holds the line (ran (fix round)).
- [ ] **Step 4: Implement** as the Interfaces block says.
- [ ] **Step 5: Run the tests, then the whole suite.** `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core`. Expected: PASS, Step 1's test included. Then run the existing restore tests by name, `node --test --test-name-pattern="Claude login|custom header|#1951|restore|Claude" .test-dist/core/test/integration/profiles/profile-service.test.js`. Every one passes unchanged. With the key line removed from every Claude settings backup, 98 of 98 tests under that pattern passed (ran (audit), simulated). If one of them fails, the change reached a restore result, and that is the review point of this PR. Report it and do not adjust the test.
- [ ] **Step 6: Break it five times.** Ignore `contentForBackup` in `backupCurrentFile` and confirm the unit test fails. Drop the option from `writeClaudeCodeSettingsIfManagedChanged` and confirm the key-line test fails at its first assertion. Drop it from `claudeCodeManagedContent` and confirm the same test fails at its second and the no-gateway-model test fails. That one was traced through `applyClaudeCodeProfile` to `backupCurrentConfigFile` and not run. Make `claudeCodeSettingsBackupContent` delete the whole `ANTHROPIC_CUSTOM_HEADERS` key and confirm the custom-headers test fails. Drop the option from `cleanupClaudeCodeToolHubSettingsFile` and write down whether any test fails. None is expected to, and the PR says which it was. Put all five back.
- [ ] **Step 7: Update the doc sentence.** In `profiles.md`, replace the three sentences Task 4, Step 2 added about the backup with: `LLMR writes its settings.json.llmr-backup-<time> copies without that line.` Keep the file name in code font.
- [ ] **Step 8: Run the gates, state the limits in the PR, and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Limits. A backup written before this change keeps its line until five newer ones push it out. The other agents' backups are unchanged. The key still sits in the live `settings.json` while the profile is on, and under `CONFIGDIR/bin/`. Subject: `fix(profiles): write a Claude Code settings backup without the gateway key line`

---

## Checks this plan adds to Gate B

Gate B is the pass on the throwaway VM in the pass-through plan, with its checks B1 to B11. These join it. They need PR 1's desktop build. G2 repeats an item the pass-through plan already lists as open.

| # | Check | Pass |
|---|---|---|
| G1 | A Claude-login profile with the default model set to `Claude Code API/claude-sonnet-5`, the one model the imported provider lists. Start Claude Code and send a prompt | The prompt is answered and Logs show provider `Claude Code API`. Write down what `/model`, `/status` and the status line show as the model, and any warning at start |
| G2 | The same with a model whose window makes LLM Router append `[1m]`. The picker offers only models the provider lists, so first add that model to the provider with Custom model. Read the profile's `settings.json` first to confirm the suffix is there | Anthropic answers. If it refuses the id, record the status and the message. That result decides whether the suffix is removed for the pass-through provider, which is a new finding and not a task here |
| G3 | A shared-home Claude-login profile with no default model. Confirm LLM Router's own settings file for that profile holds `"ANTHROPIC_MODEL": ""`, then start Claude Code | Claude Code starts on its own default model and the first request succeeds. If it fails or names an empty model, record it. That is F-7 becoming a defect |
| G4 | A system-default Claude-login profile with no default model | `settings.json` has no `ANTHROPIC_MODEL` key. Claude Code starts on its own default and Logs show provider `Claude Code API` |
| G5 | A Claude-login profile whose default is another provider's model | The form shows the line of Task 2. The main model's requests appear in Logs under that provider, and a `/model` pick from Claude Code's own list appears under `Claude Code API` |

## Open with the owner

1. **Is removing, on load, data that only one earlier version wrote migration code?** Task 1 waits on this. FU-3 removes the stored `auth` block on load and FU-4 leaves the dead account connector on load, so the two apply different standards to the same kind of change. The pass-through plan's "Local steps for the owner", step 2, already has the owner remove the `Claude Code API` provider and add it again, and that clears the stored block from the saved config. Options: (a) build Task 1. Until the provider is removed, the value stays in the saved config while the provider dialog says "Nothing is stored.", and the change is small. (b) Drop Task 1 and rely on the remove-and-add step, because the project has one install and that step already covers it. Then either the dialog's sentence is changed so that it is true for an upgraded config, or it is accepted as untrue until the step is done. (c) Build Task 1 and also drop the dead connector on load, so both are treated the same way. The session recommends (a). The audit leans to (b), because the local step already does it and FU-4's own reasoning applies to FU-3. What each answer changes is under Task 1.
2. **Which version carries PR 146?** Options: (a) 9.0.0, which the project's practice implies, because the change is a `feat!` that removes a feature and needs a user action, as 5.0 and 7.0 did; (b) 8.2.0, with 6.1 and 7.2 as precedents for a minor that carried a README upgrade note. Recommended: (a). No task waits. Task 4 writes "Upgrading from 8.x", which is true for either.
3. **Should Task 5 also cover Pi, OpenCode, Kilo and ZCode?** Their backups hold the profile key the same way. Options: (a) Claude Code only, as written, and leave the others to Tasks 6 to 8 of the backlog restore plan, which give each a stripper and stripped backups; (b) add the four to Task 5 through the same `contentForBackup` option; (c) leave all backups as they are. Recommended: (a). Each of the four needs its own "what is LLM Router's line" rule, and the restore plan already defines those. That plan is marked "draft, not ready to build" and has audit Blockers nobody has corrected, so with (a) the four keep their backups as they are until it is fixed and built. Task 5 waits on this only if the answer is (b).
4. **Should LLM Router say anything when `settings.json` is a link into another folder (F-8)?** The live key line is then written into that folder while the profile is on. Options: (a) nothing in code, and tell the dotfiles and claude-multipass sessions, which the pass-through plan's local step 3 already does; (b) one sentence in the apply message when the settings file is a link; (c) refuse Claude login mode for a linked file. Recommended: (a). No task waits.
5. **Should the edit dialog stop probing the other local-login providers with the placeholder key (F-9)?** Options: (a) leave it until someone runs it and sees what each provider answers; (b) skip the automatic probe for every local-login edit draft. Recommended: (a), because (b) also removes the model discovery those providers rely on. No task waits.
6. **Should the record say less about which backup copies hold a key the gateway still accepts?** The repository is public. The record's F-5 table and its "What limits it" paragraph say which copies hold a key that is still in use. Options: (a) keep them, because Task 5 and its limits cannot be reviewed without them; (b) shorten both to "a copy can hold the key line" and keep the detail in a private note. Recommended: (a). No task waits.

The account connector of F-10 has no question of its own. It is option (c) of question 1.

## Self-review

- **Spec coverage.** F-1 to F-5 each have a task. F-2's task waits on question 1. F-11 is in Task 3. F-7 is G3. F-6, F-8, F-9 for other providers, F-10 and F-12 are under "Not in this plan" or "Open with the owner" with a reason. FU-1 to FU-8 each name a task or say they have none, and each is still a recommendation the owner has not accepted.
- **Step scan.** Every test step gives a name and its assertions. Every code step gives a signature, a file and the rule. Tasks 1, 2, 3 and 5 name the smallest mutation each test catches. One test passes before the change and says so, the Codex control of Task 3. The custom-headers test of Task 5 fails today. Tasks 2 and 3 add a stub before their first run, so each "watch it fail" step ends on an assertion. One line of Task 5 has no test that fails without it, the option at `:439`, and the task says so.
- **Names across tasks.** `withoutClaudeCodeStoredLogin`, `isClaudeLoginProvider`, `claudeLoginModelNotice`, `isClaudeLoginProviderDraft`, `claudeCodeSettingsBackupContent`, `contentForBackup`, `BackupOptions`. `isClaudeLoginProvider` takes a saved provider and `isClaudeLoginProviderDraft` takes a draft. No task uses one where it means the other.
- **Order.** Each commit of PR 1 is green alone. Task 4's text is true only after Tasks 2 and 3. Task 5 edits a sentence Task 4 wrote, so PR 2 follows PR 1.
- **Review Focus.** Each of the five lines names its test, and each test is in the task that owns the code.
- **Failure output.** No assertion compares a value that holds a key or a login through `assert.equal`. Task 1 and the key-line tests of Task 5 assert a boolean or a count, the custom-headers test uses `assert.ok` with a message, and the end-to-end test compares a length.
- **Proportion.** The plan is under twice the length of its spec (8,500 words to 4,900, by `wc -w`), and its code blocks are test assertions and one block of doc text.

## Not verified

- Everything under "Not verified" in the spec.
- The code of Tasks 1, 2, 3 and 5. Nobody has built it. The audit ran the planned tests against today's code and, for Task 5, against a stand-in that is broader than the planned option.
- `npm run test:core`, `npm run test:ui`, `npm run typecheck`, `npm run lint` and the end-to-end spec as wholes, with or without the changes.
- What the end-to-end page of Task 3, Step 6 shows on the model step. The expectation that `claude-sonnet-5` is visible rests on the static render.
- That the one-second wait in Task 3, Step 6 is long enough on the CI runner for a probe that would be sent.
- Task 5, Step 6, the third break. Traced and not run.
- A path on which `cleanupClaudeCodeToolHubSettingsFile` makes a backup of a file that holds the key line. Two runs did not find one.
- Two backups made within the same millisecond get the same name (`backupFilePath`, `backup-files.ts:9-12`), so a count of backups in Task 5's integration tests could come out one lower. The file's existing tests share that risk, and the audit's runs were 2 to 4 ms apart.
- The web UI and the desktop app at runtime, and the Gate B checks.
- That no `.llmr-original` file can hold a key line. It is copied once, before LLM Router's first write to the file, so it holds what the user had (inferred).
