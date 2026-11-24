# Pass-Through Follow-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who turns on "Sign in with my Claude login" gets a form, a provider dialog, model pickers, a saved config and an upgrade note that all say what PR 146 does, before that change is released.

**Architecture:** Two PRs. PR 1 is one branch with six tasks and one commit each. Task 1 is core and is built only if the owner answers question 1 with (a). Tasks 2, 3 and 5 are UI. Task 4 is core. Task 6 is docs. PR 2 is Task 7 alone and changes how a Claude Code settings backup is written. Core's probe result, the contract types and the request path are not touched.

**Tech Stack:** TypeScript, React, `node:test` with `node:assert/strict`, `renderToStaticMarkup`, Playwright for the `tests/e2e/` specs.

**Spec:** [`docs/superpowers/research/2026-11-23-pass-through-follow-ups.md`](../research/2026-11-23-pass-through-follow-ups.md). Finding ids F-1 to F-18 and decision ids FU-1 to FU-13 come from it. Read its Decisions table and the finding a task names before you start the task. The design those findings sit on is [`docs/superpowers/specs/2026-11-22-claude-code-login-pass-through.md`](../specs/2026-11-22-claude-code-login-pass-through.md).

**Evidence status.** Written from reading at `main` `e789f962`, then audited, reviewed twice at `61bf9eae` (a builder dry-run and a design review), revised, and audited a second time. The record's "How this was checked" defines the labels. The **ran** labels mark runs on today's code or against a stand-in for code that does not exist yet. Every result that a "watch it fail" step expects was seen in one of those runs, unless the step says it is inferred. Everything else is read or inferred and says so. No fix here was built.

## Decisions this plan rests on

- **PT-1 to PT-11.** From the pass-through spec. PT-1 to PT-8 are the owner's and settled. Nothing here contradicts one. PT-2 (the mode is chosen per profile, nothing switches it on, and Claude Code shows its own model list), PT-5 (no body rewrite) and PT-11 (a bare model id goes to the pass-through provider) are the ones these tasks lean on.
- **FU-1 to FU-13.** Recommended by the sessions, 2026-11-23. None is the owner's decision yet. The owner confirms them by approving this plan. FU-1, FU-9 and FU-11 are Task 2. FU-10 is Tasks 3 and 4. FU-5 is Task 5. FU-2, FU-6 and FU-12 are Task 6. FU-3 is Task 1, and FU-3 and FU-4 together are question 1. FU-7 is Task 7. FU-8 is the split into two PRs. FU-13 is "Release order".
- **Plan author, changeable in review.** The wording of every line of UI copy and doc text below, the names of the new helpers, and the choice to leave the provider dialog's step marker and the pane label "Models detected from this provider" as they are. Five of the new texts call the provider `Claude Code API`, the name the import gives it. Core still finds the provider after a rename, through its id, so after a rename those texts name a provider that is not in the list.

## Global Constraints

- There are no outside users. No compatibility path and no migration code. Whether Task 1 is migration code is question 1.
- Never weigh upstream parity.
- LLM Router never writes `~/.claude.json`.
- **The real app never runs on the owner's Mac.** No step here runs `npm run dev:electron`, `llmr` or `claude`. A check that needs a running UI goes through the end-to-end harness, which starts the web UI in a temporary home (`startCliWebServer`, `tests/e2e/cli-web-runtime.ts`). A check that needs the real apps is a Gate B row on the throwaway VM.
- Double quotes, semicolons, two-space indent. Object keys and type members alphabetized where the surrounding file does it. `type` aliases. No comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`, named by behaviour. Core tests are `*.test.mjs`. UI tests are `*.test.ts` or `*.test.tsx`, rendered with `renderToStaticMarkup`.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Never pass `--scope`.
- One end-to-end spec: `npm run build:assets && npx playwright test tests/e2e/<file>`, after `npm run test:e2e:install` once per install. The build can rewrite generated files, so finish with `git checkout -- packages/core/models.json packages/ui/src/generated`.
- The wire tests skip unless `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js"` is set. Every `npm run test:core` in this plan starts with it.
- **Every commit leaves `npm run typecheck`, `npm run lint`, `npm run test:architecture` and the suites its task touches green.** `tsc` reports unused locals and parameters, so a task that removes the last use of an import removes the import.
- Read a file with Read before you change it, so its path-scoped rule under `.claude/rules/` loads. `ui.md` applies to Tasks 2, 3 and 5.
- `node build/test.mjs <pkg>` bundles every test file of the package in one esbuild run. An import of a name that is not exported fails that build, and no test of the package runs (ran (audit), ran (review)). So a new export is added as a stub before the test that imports it is run, and each test step names what joins the test file's existing import line.
- No test, script or doc names a real provider host as a target or holds a real key or login. Test values are made-up strings such as `Bearer sk-ant-oat01-FAKE` and `llmr-rotated-key-0002`.
- Neither a key nor a login may appear in a log line, an error message or a test's failure output. A test that could print one on failure asserts a boolean or a count.
- UI text is English only and calls the product LLMR, as the surrounding UI does.
- Merging and any release need the owner's word.
- The repository is public. Describe a change by what the code does.

## Review Focus

Each line is a condition no single task's own test covers alone. The test that pins it is named at the end.

1. A plugin entry that is not one of the two Claude entries keeps its `auth` block through a load, a save and a reload. Task 1, Step 1. This line goes if Task 1 is not built.
2. A Claude-login profile with an allowed model list and no default model still cannot be saved. Task 2, Step 1, the first test's last assertion.
3. A bare model id, which goes to the subscription, gets no "goes to another provider" line. Task 2, Step 1, the notice test.
4. The UI and core name the same provider as the pass-through one, whatever key it holds. Task 2, Step 1, the parity test.
5. A Claude Code profile in Claude login mode still sees the pass-through provider's models, and a provider with the placeholder key and no Claude plugin entry is not hidden from anyone. Task 3, Step 1, the first test, and Task 4, Step 1, the third assertion.
6. A Codex local-login provider keeps its heading, its connection check and its model refresh. Task 5, Step 1, the control test.
7. A backup of a Claude-login settings file keeps the user's own custom header lines. Task 7, Step 2, the custom-headers test.

## Findings this plan closes

| Finding | Task |
|---|---|
| F-2 | 1, if the owner keeps it (question 1) |
| F-1, F-12 (kept), F-13, F-15, F-16 | 2, and 6 for the docs |
| F-17 | 2, Step 8, which waits on question 8 |
| F-14 | 3 for the form and the card, 4 for core. Task 3, Step 7 waits on question 7 |
| F-3, F-11, F-9 for the pass-through provider | 5 |
| F-4, F-18 | 6 |
| F-5 | 6 for the sentence, 7 for the change |
| F-7 | Not closed. Probe P8 and Gate B check G3 observe it. A failure is a new finding with no task here |
| F-6, F-8, F-9 for other providers, F-10 | None. See "Not in this plan" and "Open with the owner" |

## Conflicts with other plans

`docs/superpowers/plans/2026-11-22-backlog-restore.md` is a draft with unchecked audit Blockers. Nothing here relies on it, and this plan edits none of it.

- **Its Task 3** changes what `isManagedClaudeCodeSettingsContent` calls managed, which Task 7, Step 1 here depends on. Whichever merges second, its builder runs Task 7, Step 1 and Step 5 again on the merged code and reports any result that changed before adjusting a test.
- **Its Tasks 4 and 6** edit `backup-files.ts` and the type `RestoreManagedContentMatchers` beside the edits of Task 7 here. The edits do not overlap. The second builder keeps both and rebases.
- **Its Tasks 6 to 8** give OpenCode, Kilo, Pi and ZCode stripped backups. If the owner extends Task 7 here to those agents (question 3), one of the two is dropped.

## Not in this plan

- **F-6, the empty `env` after a restore.** The backlog restore plan's Task 3 owns it.
- **F-10, the account connector of a provider saved by an earlier version.** FU-4, unless the owner answers question 1 with (c).
- **F-9 for Codex, Grok and the other local-login providers.** Question 5.
- **A neutral probe state in the contract types.** Weighed under F-3 and not chosen.
- **The Routing page.** It still offers the pass-through provider as a rule target and as a fallback (`routing.tsx:74-79`, `:690-695`, read (review)). A rule that sends another caller there gets the "no login" refusal. The spec defers a warning, and the README note of Task 6 says what happens. It is a known limit of this release.
- **A bare saved model on the profile card.** The card shows a bare id as `<first provider that lists it>/<id>` (`shared/profiles.ts:124-126`, read), and core sends a bare id from a Claude-login profile to the subscription. The picker saves `Provider/model`, so a bare id is rare.
- **Showing apply messages in the UI.** No screen shows an apply message that comes with `ok: true` (F-15). Task 2 puts the one message that matters here into the form and onto the card.
- **The version number.** Question 2.

---

## PR 1: findings F-1 to F-4 and F-13 to F-18

Branch `fix/pass-through-follow-ups` from `main`.

### Task 1: Drop the stored `auth` block when the config is loaded (F-2, FU-3)

**Waits on the owner.** This task is built only with answer (a) to question 1, which is the answer the plan is written for. While the question is open, build nothing of it. Start the branch at Task 2 and add this task's commit when the answer comes. It is core only and no other task needs code from it, so its place on the branch does not matter.

- **Answer (b).** The task is dropped. PR 1 has five commits and Review Focus 1 goes. For a config an earlier version saved, five texts then stay untrue until the provider is removed and added again. They are the dialog's "Nothing is stored." (`providers.tsx:2318`), the toggle's "without storing it" (`profiles.tsx:903`), `providers.md:14` and `:24`, and `profiles.md:59`. Task 6, Step 1 then adds the remove-and-add sentence to the README note. With that step done the five texts are true.
- **Answer (c).** This plan does not specify the connector drop. It needs a short revision first, with the rule for which connector is removed and a fourth entry in the test.

After an upgrade, the first save writes the config without the `auth` block that an earlier version stored in the two Claude plugin entries. A config that never held the block loads as before.

**Files:**
- Modify: `packages/core/src/providers/oauth-plugin.ts`
- Modify: `packages/core/src/gateway/core-runtime/config-compiler.ts` (`:22`, `:705-713`)
- Modify: `packages/core/src/config/config.ts` (`pickConfig`, `:833-834`)
- Test: `packages/core/test/unit/config/claude-login-stored-auth.test.mjs` (new)

**Interfaces:**
- Produces, in `oauth-plugin.ts`: `export function withoutClaudeCodeStoredLogin(providerPlugins: unknown[]): unknown[]`. It is the private function of the same name in `config-compiler.ts`, moved with its body and its comment unchanged.
- `config-compiler.ts` keeps both of its calls (`:67`, `:203`). Its import at `:22` changes with the move. `isLocalClaudeCodeOauthProviderPlugin` is used there only inside the moved function, so that import is replaced by one of `withoutClaudeCodeStoredLogin`.

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
  assert.equal(loaded.providerPlugins[2].auth.headers["x-other"], "kept");
  await saveAppConfig(loaded);
  assert.equal(JSON.stringify(await loadPersistedAppConfig()).includes("sk-ant-oat01-FAKE"), false);
  const reloaded = await loadAppConfig();
  assert.equal(reloaded.providerPlugins[2].auth.headers["x-other"], "kept");
});
```

- [ ] **Step 2: Run it and watch it fail.** `node build/test.mjs core && node --test .test-dist/core/test/unit/config/claude-login-stored-auth.test.js`. Expected: FAIL at the first assertion, with `[true, true, true]`. The save and reload assertions sit after it and were not reached on today's code.
- [ ] **Step 3: Move the function and call it in `pickConfig`.** At `config.ts:833-834`, assign `withoutClaudeCodeStoredLogin(...)` of the array to `config.providerPlugins`.
- [ ] **Step 4: Run it.** Expected: PASS. Removing the call in `pickConfig` fails the first assertion. Dropping `auth` from every entry at load fails the first and the second.
- [ ] **Step 5: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core`.
- [ ] **Step 6: Commit.** `fix(config): drop the auth block an earlier version stored in the Claude plugin entries`

### Task 2: The profile form and card say what Claude login mode does (F-1, F-13, F-15, F-16, FU-1, FU-9, FU-11)

It is the defect a person meets first.

With the toggle on, a Claude Code profile can be saved with no default model, and the field reads "Keep Claude Code default". Each of the five model fields shows one line when its model belongs to another provider. Under the toggle the form says when no pass-through provider is on and when the profile starts signed out. The profile card marks the mode. Switching the toggle on changes only the env row, as today, so a saved default stays. Onboarding gets all of it through the shared form.

**Evidence.** Core accepts an empty default model. A system-default profile then writes no `ANTHROPIC_MODEL` key, and a shared-home profile writes `"ANTHROPIC_MODEL": ""` (ran (review)). What Claude Code does with the empty value is probe P8. Today the card of a Claude-login profile reads `Model: Keep Claude Code default` and `Environment variables: 1`, with no mark of the mode (ran (review round)). No screen shows the apply message about a missing provider (F-15, read).

**Files:**
- Modify: `packages/ui/src/pages/home/shared/providers.ts`
- Modify: `packages/ui/src/pages/home/shared/profiles.ts` (`isProfileDraftSubmittable` `:672-674`, `profileSummaryItems` `:1277-1356`)
- Modify: `packages/ui/src/pages/home/components/profiles.tsx` (`AddProfileForm` `:722-742`, the toggle `:897-905`, the fields `:908-953`, `profileDraftValidation` `:1859-1861`, `AddProfileDialog` `:2247-2298`)
- Modify: `packages/ui/src/pages/home/App.tsx` (the `profileAdd` and `profileEdit` objects, `:3414-3450`)
- Modify: `packages/ui/src/pages/home/components/onboarding.tsx` (`:295-304`)
- Test: `packages/ui/test/component/profiles.test.tsx`
- Test: `tests/e2e/claude-login-profile.spec.ts` (new, Task 3 adds to it)

**Interfaces:**
- Produces, in `shared/providers.ts`: `export function isClaudeLoginProvider(provider: GatewayProviderConfig, providerPlugins: unknown[] | undefined): boolean`. It applies core's rule (`claudeLoginProviders`, `gateway/features/claude-login-pass-through.ts:82-89`) and reads no key. It is true when `isGatewayProviderEnabled(provider)` holds and some entry of `providerPlugins` passes `isLocalClaudeCodeOauthProviderPlugin` and names the provider. An entry names the provider when its `providerName`, in lower case and with a trailing `::<protocol>` removed by core's pattern `/::[a-z_]+$/`, equals `provider.name` in lower case or the provider's id. The id is `providerNameSlug(provider.id)`, with `provider-` put before it when it is `openai`, `anthropic`, `claude`, `gemini` or `google`, as core's `providerRuntimeId` does (`routing/model-registry.ts:194-202`). A provider with no `id` has no id to compare.
- Why the UI has its own copy of the rule. Core's module cannot go into the UI bundle, because its imports reach `node:module` and `node:crypto` (read). One difference is kept. For a provider with no `id`, core compares with an id that holds a hash, which the UI cannot compute. A provider saved through the dialog always gets an `id` (`App.tsx:1864`, read), so no saved entry names a hashed id. The parity test of Step 1 pins the rest.
- Produces, in `shared/profiles.ts`: `export type ClaudeLoginModelField = "fableModel" | "haikuModel" | "model" | "opusModel" | "sonnetModel"` and `export function claudeLoginModelNotice(draft: Pick<AddProfileDraft, "agent" | "envRows" | ClaudeLoginModelField>, field: ClaudeLoginModelField, providers: GatewayProviderConfig[], providerPlugins: unknown[] = [], virtualModelProfiles: VirtualModelProfileConfig[] = []): string | undefined`. It returns a string only when the agent is `claude-code`, `claudeLoginEnabled(draft.envRows)` is true, and `parseProfileModelValue(draft[field], providers, virtualModelProfiles).provider` is a non-empty name that is not the name of a provider for which `isClaudeLoginProvider` is true. For `model` the string is `New sessions start on this model, which goes to <provider>, not to your Claude subscription.` For the other four it is `Claude Code's <Fable|Opus|Sonnet|Haiku> choice goes to <provider>, not to your Claude subscription.` The first wording follows Claude Code's own doc, which says `ANTHROPIC_MODEL` wins over a saved `/model` pick on every launch (F-1).
- Changes: `isProfileDraftSubmittable` returns `claudeLoginEnabled(draft.envRows) || Boolean(draft.model.trim())` for `claude-code`. The allowed-list check above it (`:669-671`) is not moved (F-12).
- Changes: `profileDraftValidation` sets `defaultModel` only when the toggle is off.
- Changes: `AddProfileForm` and `AddProfileDialog` each gain the optional prop `providerPlugins?: unknown[]`. `App.tsx` passes `draftConfig.providerPlugins` in both objects and `onboarding.tsx` passes `config.providerPlugins`.
- Changes, in the form: with the toggle on, the Default model `Field` takes `requirement="optional"` with `optionalFieldLabel`, and its `ModelSelector` takes `placeholder="Keep Claude Code default"`. Under each of the five selectors the notice, when there is one, renders as `<p className="text-[12px] text-muted-foreground">`.
- Changes, under the toggle's help text, each as one more `<p>` of the same class, shown only while the toggle is on:
  - When no provider passes `isClaudeLoginProvider`: `No Claude Code API provider is on. Add it under Providers. Until then this profile uses your other providers.`
  - When `draft.scope !== "global"` and `draft.claudeCodeSharedHome` is false: `This profile has its own Claude home and starts signed out. Run /login once inside it, or turn on Use my ~/.claude in the terminal.` The spec's "Isolated profile homes" is the source (ran (probe) there).
- Changes: `profileSummaryItems` adds, after the `Model` item of a `claude-code` profile whose `env[CLAUDE_CODE_AUTH_MODE_ENV]` normalizes to `claude-login`, the item `{ label: "Sign-in", value: "Claude login" }`. When no provider of `config` passes `isClaudeLoginProvider(provider, config.providerPlugins)`, the value is `Claude login, no Claude Code API provider`. Both names the file needs are already imported (`shared/profiles.ts:37`).
- Not changed: the toggle's `onChange`, which passes `{ envRows }` and nothing else.
- Not changed: the toggle is hidden for the App surface (`profiles.tsx:897`). The new checks read only the env row, so an App-surface profile whose env row was set by hand under Advanced settings gets the optional default and the lines too.

- [ ] **Step 1: Write the failing tests** in `profiles.test.tsx`. Add `claudeLoginModelNotice` and the type `ClaudeLoginModelField` to the import from `@llmr/ui/pages/home/shared/profiles.ts` on line 7, and `type AppConfig` to the import from `@llmr/core/contracts/app.ts` on line 4. Add two import lines, `import { claudeLoginProviderNames } from "@llmr/core/gateway/features/claude-login-pass-through.ts";` and `import { isClaudeLoginProvider } from "@llmr/ui/pages/home/shared/providers.ts";`. The first builds in the UI test bundle (ran (second audit)). Shared values:

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
const loginForm = (draft: AddProfileDraft, providers = loginProviders, providerPlugins: unknown[] = loginPlugins) => renderToStaticMarkup(
  <AddProfileForm botConfigs={[]} draft={draft} error="" onChange={() => undefined} onCreateBot={() => undefined} providerPlugins={providerPlugins} providers={providers} />
);
```

  - `a Claude login profile can be saved without a default model`.

```ts
assert.equal(isProfileDraftSubmittable(createProfileDraft("claude-code")), false);
assert.equal(isProfileDraftSubmittable(loginDraft()), true);
assert.equal(isProfileDraftSubmittable({ ...loginDraft(), availableModels: ["Fixture/first-model"] }), false);
```

  - `AddProfileForm marks the default model optional while the Claude login toggle is on`. With `off = loginForm(createProfileDraft("claude-code"))`, `on = loginForm(loginDraft())` and `count = (html: string, text: RegExp) => (html.match(text) ?? []).length`:

```ts
assert.equal(count(on, />Required<\/span>/g), count(off, />Required<\/span>/g) - 1);
assert.equal(count(on, />Optional<\/span>/g), count(off, />Optional<\/span>/g) + 1);
assert.equal(count(on, /Keep Claude Code default/g), count(off, /Keep Claude Code default/g) + 1);
assert.doesNotMatch(on, /Default model is required\./);
assert.match(off, /Default model is required\./);
```

  - `a model from another provider gets one line per field while the Claude login toggle is on`.

```ts
const notice = (draft: AddProfileDraft, field: ClaudeLoginModelField = "model") => claudeLoginModelNotice(draft, field, loginProviders, loginPlugins);
const startLine = "New sessions start on this model, which goes to Fixture, not to your Claude subscription.";
const opusLine = "Claude Code's Opus choice goes to Fixture, not to your Claude subscription.";
assert.equal(notice({ ...loginDraft(), model: "Fixture/first-model" }), startLine);
assert.equal(notice({ ...loginDraft(), opusModel: "Fixture/first-model" }, "opusModel"), opusLine);
assert.equal(notice({ ...loginDraft(), haikuModel: "Fixture/first-model" }, "haikuModel"), "Claude Code's Haiku choice goes to Fixture, not to your Claude subscription.");
assert.equal(notice({ ...loginDraft(), model: "Claude Code API/claude-sonnet-5" }), undefined);
assert.equal(notice({ ...loginDraft(), model: "claude-opus-4-8" }), undefined);
assert.equal(notice(loginDraft(), "opusModel"), undefined);
assert.equal(notice({ ...createProfileDraft("claude-code"), model: "Fixture/first-model" }), undefined);
const html = loginForm({ ...loginDraft(), model: "Fixture/first-model", opusModel: "Fixture/first-model" });
assert.ok(html.includes(startLine) && html.includes("Claude Code&#x27;s Opus choice goes to Fixture"));
assert.doesNotMatch(loginForm({ ...loginDraft(), model: "Claude Code API/claude-sonnet-5" }), /not to your Claude subscription/);
```

    The last line pins that the form passes `providerPlugins` on, because without the list no provider counts as the pass-through one.
  - `the form says when Claude login mode has no provider and when the profile starts signed out`.

```ts
const missing = /No Claude Code API provider is on\./;
const signedOut = /starts signed out\. Run \/login once inside it/;
assert.match(loginForm(loginDraft(), [loginProviders[0]]), missing);
assert.match(loginForm(loginDraft(), loginProviders, []), missing);
assert.doesNotMatch(loginForm(loginDraft()), missing);
assert.doesNotMatch(loginForm(createProfileDraft("claude-code"), [loginProviders[0]]), missing);
assert.match(loginForm(loginDraft()), signedOut);
assert.doesNotMatch(loginForm({ ...loginDraft(), claudeCodeSharedHome: true }), signedOut);
assert.doesNotMatch(loginForm({ ...loginDraft(), scope: "global" }), signedOut);
assert.doesNotMatch(loginForm(createProfileDraft("claude-code")), signedOut);
```

  - `the profile card marks Claude login mode`.

```ts
const profile = { agent: "claude-code", enabled: true, env: { LLMR_CLAUDE_CODE_AUTH_MODE: "claude-login" }, id: "p", model: "", name: "p", scope: "llmr" } as ProfileConfig;
const signIn = (config: AppConfig, item = profile) => profileSummaryItems(item, config).find((entry) => entry.label === "Sign-in")?.value;
const config = { ...appConfigFixture(), Providers: loginProviders, providerPlugins: loginPlugins };
assert.equal(signIn(config), "Claude login");
assert.equal(signIn({ ...config, providerPlugins: [] }), "Claude login, no Claude Code API provider");
assert.equal(signIn(config, { ...profile, env: {} }), undefined);
```

  - `the UI and core name the same provider as the pass-through one`.

```ts
const internal = { key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" };
const claude = (extra: Partial<GatewayProviderConfig> = {}): GatewayProviderConfig => ({ ...loginProviders[1], ...extra });
const cases: Array<[GatewayProviderConfig, unknown[], boolean]> = [
  [claude({ id: "claude-code-api", type: "anthropic_messages" }), [...loginPlugins, internal], true],
  [claude({ api_key: "sk-own-key-0001" }), loginPlugins, true],
  [claude({ id: "claude-code-api", name: "My Claude", type: "anthropic_messages" }), [...loginPlugins, internal], true],
  [claude({ type: "anthropic_messages" }), [internal], false],
  [claude({ id: "claude", name: "My Claude" }), [{ ...internal, providerName: "claude::anthropic_messages" }], false],
  [claude({ enabled: false }), loginPlugins, false],
  [claude(), [], false],
  [claude(), [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Claude Code API" }], false]
];
for (const [provider, providerPlugins, expected] of cases) {
  assert.equal(isClaudeLoginProvider(provider, providerPlugins), expected);
  assert.equal(claudeLoginProviderNames({ Providers: [provider], providerPlugins }).includes(provider.name), expected);
}
```

    In order, the cases are an imported provider, one whose key is not the placeholder, a renamed one, one with no `id` and only the internal entry, one whose id is a protocol word, a disabled one, one with no entry and one with a Codex entry. Core gives the expected value in all eight, and so does a prototype of the rule in Interfaces (ran (second fix round)).

- [ ] **Step 2: Add the stubs.** In `shared/profiles.ts`, add the type and `claudeLoginModelNotice` with the signature Interfaces gives and the body `return undefined;`. In `shared/providers.ts`, add `isClaudeLoginProvider` with the body `return false;`. Prefix the parameters of both with an underscore for this step, so `tsc` does not report them.
- [ ] **Step 3: Run them and watch them fail.** `node build/test.mjs ui && node --test --test-name-pattern="Claude login profile can be saved|default model optional|one line per field|has no provider and when|card marks Claude login|name the same provider" .test-dist/ui/test/component/profiles.test.js`. Expected: the build succeeds and each test fails on an assertion. The first fails at its second assertion, because all three results are `false` today. The second fails at its first, because both renders hold 5 "Required" and 4 "Optional" labels and 4 "Keep Claude Code default" texts today. The third fails at its first, because the stub returns `undefined`. The fourth fails at its first, because the form has neither line today. The fifth fails at its first, because the card has no `Sign-in` item today. The sixth fails at its first case, because the stub returns `false` (inferred from the stub).
- [ ] **Step 4: Implement** as the Interfaces block says, and give both stubs their bodies and their parameter names.
- [ ] **Step 5: Run the tests, then `npm run test:ui`.** Expected: PASS, with `AddProfileForm marks required and optional fields` and `Claude Code profiles require a default model before submission` unchanged and green. Smallest mutations caught. Returning `Boolean(draft.model.trim())` again fails the first test, and moving the Claude-login return above the allowed-list check fails its last assertion. Using one wording for all five fields fails the notice test's second assertion. Treating every provider as the pass-through one fails its first. Showing the signed-out line for a global profile fails the fourth test's seventh assertion. A card that ignores `providerPlugins` fails the fifth test's second. Requiring the placeholder key fails the parity test's second case, and leaving out the `provider-` prefix fails its fifth (ran (second fix round), against the prototype).
- [ ] **Step 6: Add the end-to-end test of the save.** No component test reaches the save, and no step here runs the app. Create `tests/e2e/claude-login-profile.spec.ts` with the runtime setup of `tests/e2e/onboarding-chosen-agent.spec.ts` (its imports, `beforeAll`, `afterAll`, `waitForBridge` and `test.use`), its own token string, and this test.

```ts
const provider = { api_base_url: "https://api.anthropic.com", api_key: "llmr-local-agent-login", models: ["claude-sonnet-5"], name: "Claude Code API", type: "anthropic_messages" };
const other = { api_base_url: "http://127.0.0.1:9/v1", api_key: "sk-onboarding", models: ["onboarding-model"], name: "onboarding-provider", type: "openai_chat_completions" };
const plugins = [
  { key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" },
  { key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" }
];

test("onboarding connects a Claude login profile with no default model", async ({ page }) => {
  if (!runtime) {
    throw new Error("CLI web runtime was not started.");
  }
  const url = `${runtime.baseUrl}/#llmr_web_token=${encodeURIComponent(runtime.token)}`;
  await page.goto(url);
  await waitForBridge(page);
  await page.evaluate(async (next) => {
    const config = await window.llmr!.getConfig();
    config.Providers = next.providers;
    config.providerPlugins = next.providerPlugins;
    await window.llmr!.saveConfig(config);
  }, { providerPlugins: plugins, providers: [provider, other] });
  await page.goto(url);
  await page.reload();
  await waitForBridge(page);
  await expect(page.getByRole("heading", { name: "Connect agent" })).toBeVisible();
  await page.getByLabel("Sign in with my Claude login").click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByRole("heading", { name: "Let's start" })).toBeVisible();
  const saved = (await page.evaluate(() => window.llmr!.getConfig())).profile.profiles.find((profile) => profile.id === "default-claude-code");
  expect(saved?.model).toBe("");
  expect(saved?.env?.LLMR_CLAUDE_CODE_AUTH_MODE).toBe("claude-login");
  const settingsFile = path.join(runtime.testHome, ".claude", "settings.json");
  await expect.poll(() => existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : "").toMatch(/ANTHROPIC_CUSTOM_HEADERS/);
  const settings = JSON.parse(readFileSync(settingsFile, "utf8")) as { apiKeyHelper?: string; env: Record<string, string> };
  expect("ANTHROPIC_MODEL" in settings.env).toBe(false);
  expect("apiKeyHelper" in settings).toBe(false);
});
```

    The settings file is in the harness's temporary home. Run `npm run build:assets && npx playwright test tests/e2e/claude-login-profile.spec.ts`, then `git checkout -- packages/core/models.json packages/ui/src/generated`. Expected: PASS. On today's code the heading, the toggle label and the button match, the web bridge keeps both plugin entries through the save and the reload, the toggle switches on, and the Next step button stays disabled, so the click times out (ran (second audit)). A variant that picked a model got through the save, and the settings file held `ANTHROPIC_CUSTOM_HEADERS` and no `apiKeyHelper` (ran (second audit)). The test catches a form that shows the field as optional and a submit check that still refuses.
- [ ] **Step 7: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`.
- [ ] **Step 8, which waits on question 8. The allowed model list.** Skip this step while the question is open. It then becomes its own commit on the branch or its own PR. With answer (c), the form shows one more `<p>` under the toggle's help text, beside the two lines Interfaces puts there, while the toggle is on and `draft.availableModels.length > 0`. Its text is `This profile has an allowed model list. In Claude login mode, Claude Code can use only the models in it, and a pick from its own /model list that is not in it is refused. The list is under Advanced settings.`

    The line sits under the toggle and not beside the list. The list is inside Advanced settings, and the form opens that section only in edit mode (`profiles.tsx:743`, `:1018`). An add-mode render holds no "Allowed model list" text and an edit-mode render does, and the toggle's help text is in both (ran (second audit), ran (second fix round)). A user can also close the section in either mode. Under the toggle the line shows in both modes, next to the switch that makes the list matter, and the test below can render the form in add mode.

    Test `the form warns that an allowed model list limits Claude Code's own picks`, with `listLine = /Claude Code can use only the models in it/`.

```ts
assert.match(loginForm({ ...loginDraft(), availableModels: ["Claude Code API/claude-sonnet-5"], model: "Claude Code API/claude-sonnet-5" }), listLine);
assert.doesNotMatch(loginForm(loginDraft()), listLine);
assert.doesNotMatch(loginForm({ ...createProfileDraft("claude-code"), availableModels: ["Fixture/first-model"], model: "Fixture/first-model" }), listLine);
```

    The first assertion fails on today's code, where the line does not exist, and the other two hold. A line shown without a list fails the second assertion, and one shown with the toggle off fails the third. With answer (a) this step is replaced by a core change that this plan does not specify. Its starting point is under question 8.
- [ ] **Step 9: Commit.** `fix(ui): make the default model optional in Claude login mode and say where each model goes`

### Task 3: The profile form offers the pass-through provider only where it can work (F-14, FU-10, the UI half)

It uses `isClaudeLoginProvider` from Task 2.

Only a Claude Code profile in Claude login mode carries a login, so every other profile that names a `Claude Code API` model gets the "no login" refusal on each request. Today the profile pickers offer that model to every agent, and the card of a profile with an empty model shows it as the fallback. After this task the pickers offer it only to a Claude Code profile with the toggle on, the card's fallback skips it, and the form says why the list is empty when it is the only provider. Task 4 does the same in core.

**Evidence.** `profileModelProviderOptions` returns `Claude Code API` for any draft (ran (review round)). The card of a Codex profile with an empty model reads `Claude Code API/claude-sonnet-5`, with that provider alone (ran (review round)) and with it first of two (ran (second audit)). A stand-in for `profileModelProviders` passed the four assertions of Step 1's first test, and a Codex form still displays a saved `Claude Code API/claude-sonnet-5` when that provider is filtered out (ran (second audit)).

**Files:**
- Modify: `packages/ui/src/pages/home/shared/profiles.ts` (`defaultProfileClientModel` `:41-48`, the new helper)
- Modify: `packages/ui/src/pages/home/components/profiles.tsx` (every use of `providers` inside `AddProfileForm`, and the `models` issue of `profileDraftValidation` `:1856-1858`)
- Test: `packages/ui/test/component/profiles.test.tsx`, `tests/e2e/claude-login-profile.spec.ts`

**Interfaces:**
- Produces, in `shared/profiles.ts`: `export function profileModelProviders(draft: Pick<AddProfileDraft, "agent" | "envRows">, providers: GatewayProviderConfig[], providerPlugins: unknown[] = []): GatewayProviderConfig[]`. It returns `providers` itself when the agent is `claude-code` and `claudeLoginEnabled(draft.envRows)` is true. Otherwise it returns the providers for which `isClaudeLoginProvider` is false.
- Changes, in `AddProfileForm`: the form computes `profileModelProviders(draft, providers, providerPlugins)` once and uses that list wherever it used `providers`. That covers `profileModelProviderOptions`, every `ModelSelector`, the allowed-list selector and the profile's own route rules. A saved value that names a hidden provider still displays, because `parseProfileModelValue` reads any `name/model` value.
- Changes, in the form's `models` issue. When the filtered list has no model and the unfiltered one has, the text is, for `claude-code`, `Your only provider is Claude Code API. Turn on Sign in with my Claude login to use it, or add another provider.` For every other agent it is `Your only provider is Claude Code API. It works only in a Claude Code profile with Sign in with my Claude login on. Add another provider for this agent.` With no provider at all the text stays "Configure at least one enabled provider model before saving an agent profile."
- Changes, in the form: one `<p className="text-[12px] text-muted-foreground">` above the model fields when the profile cannot use the pass-through provider and one of `model`, `fableModel`, `opusModel`, `sonnetModel`, `haikuModel` or an entry of `availableModels` names it. Text: `This profile names a Claude Code API model. Those work only in a Claude Code profile with Sign in with my Claude login on.` This is what an upgrader sees, whose helper-mode profile kept the default an earlier version used.
- Changes: `defaultProfileClientModel(config)` skips providers for which `isClaudeLoginProvider(provider, config.providerPlugins)` is true.
- Not changed: submit. `isProfileDraftSubmittable` takes no providers (`shared/profiles.ts:652-685`), and `canSubmitProfile` reads `hasAvailableGatewayModels(draftConfig)`, which counts the pass-through provider (`App.tsx:765-767`, read). So the new `models` issue is text only and blocks nothing. With the pass-through provider alone, a profile of an agent whose model is optional (Codex, Pi, Grok, OpenCode, Kilo, ZCode or Workbuddy) still saves with an empty model. Core then falls back as Task 4 says, and its requests fail as an unknown model. A Claude Code profile with the toggle off and a Kimi profile do not save, because their model is required and the picker offers none (inferred). Whether the save should be refused is the second part of question 7. This task builds the text and waits on nothing.

- [ ] **Step 1: Write the failing tests** in `profiles.test.tsx`. Add `profileModelProviders` to the import on line 7.
  - `the pass-through provider is offered only to a Claude Code profile in Claude login mode`.

```ts
const names = (draft: AddProfileDraft, plugins: unknown[] = loginPlugins) => profileModelProviders(draft, loginProviders, plugins).map((provider) => provider.name);
assert.deepEqual(names(loginDraft()), ["Fixture", "Claude Code API"]);
assert.deepEqual(names(createProfileDraft("claude-code")), ["Fixture"]);
assert.deepEqual(names(createProfileDraft("codex")), ["Fixture"]);
assert.deepEqual(names(createProfileDraft("codex"), []), ["Fixture", "Claude Code API"]);
```

  - `the form says so when the only provider is the pass-through one`. With `only = [loginProviders[1]]`:

```ts
const claudeOnly = /Your only provider is Claude Code API\. Turn on Sign in with my Claude login to use it, or add another provider\./;
const otherOnly = /It works only in a Claude Code profile with Sign in with my Claude login on\. Add another provider for this agent\./;
assert.match(loginForm(createProfileDraft("claude-code"), only), claudeOnly);
assert.match(loginForm(createProfileDraft("codex"), only), otherOnly);
assert.doesNotMatch(loginForm(loginDraft(), only), /Your only provider is Claude Code API/);
assert.match(loginForm(createProfileDraft("codex"), []), /Configure at least one enabled provider model/);
assert.match(loginForm({ ...createProfileDraft("claude-code"), model: "Claude Code API/claude-sonnet-5" }), /This profile names a Claude Code API model\./);
assert.doesNotMatch(loginForm({ ...loginDraft(), model: "Claude Code API/claude-sonnet-5" }), /This profile names a Claude Code API model\./);
```

  - `an empty model on another agent's card does not fall back to the pass-through provider`.

```ts
const config = { ...appConfigFixture(), Providers: [loginProviders[1], loginProviders[0]], providerPlugins: loginPlugins };
const codex = { agent: "codex", enabled: true, id: "c", model: "", name: "c", scope: "llmr" } as ProfileConfig;
assert.equal(profileSummaryItems(codex, config).find((item) => item.label === "Model")?.value, "Fixture/first-model");
```

- [ ] **Step 2: Add the stub.** `profileModelProviders` with the body `return providers;` and the other two parameters prefixed with an underscore.
- [ ] **Step 3: Run them and watch them fail.** `node build/test.mjs ui && node --test --test-name-pattern="offered only to a Claude Code profile|only provider is the pass-through|does not fall back to the pass-through" .test-dist/ui/test/component/profiles.test.js`. Expected: the first fails at its second assertion, because the stub returns both providers (inferred from the stub). The second fails at its first, because the form shows no such text today. The third fails with `Claude Code API/claude-sonnet-5`.
- [ ] **Step 4: Implement** as the Interfaces block says.
- [ ] **Step 5: Run the tests, then `npm run test:ui`.** Expected: PASS. Smallest mutations caught. Filtering for a Claude-login profile too fails the first test's first assertion. Filtering by the placeholder key alone fails its fourth. A form that still passes the unfiltered list fails the second test. Leaving `defaultProfileClientModel` as it is fails the third.
- [ ] **Step 6: Add the end-to-end test of onboarding with only the Claude import.** In `tests/e2e/claude-login-profile.spec.ts`, as a second test with its own runtime or placed first in the file, so the first test's saved profile does not hide onboarding. Save `config.Providers = [provider]` and the two plugin entries as the first test does, reload, and assert:

```ts
await expect(page.getByRole("heading", { name: "Connect agent" })).toBeVisible();
await expect(page.getByText("Your only provider is Claude Code API. Turn on Sign in with my Claude login to use it, or add another provider.")).toBeVisible();
await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled();
await page.getByLabel("Sign in with my Claude login").click();
await expect(page.getByText("Your only provider is Claude Code API.", { exact: false })).toHaveCount(0);
await expect(page.getByRole("button", { name: "Next step" })).toBeEnabled();
```

    Run it as Task 2, Step 6 says, and restore the generated files. Expected: PASS. On today's code the heading matches, Next step is disabled before and after the toggle, and the test stops at the "Your only provider" text, which does not exist yet (ran (second audit)). The last assertion needs Task 2's submit change, which the order gives it.
- [ ] **Step 7, which waits on question 7. The pass-through provider as the only provider.** Steps 1 to 6 build answer (a) to both parts of the question and do not wait. With answer (b) to its first part, `createProfileDraft` gets no new parameter. The onboarding component and `App.tsx`'s Add profile opener switch the toggle on in the new draft when every enabled provider passes `isClaudeLoginProvider`, the end-to-end test of Step 6 expects the button enabled from the start, and the first-run text of Step 6 is asserted absent. With answer (c) to its first part, or answer (b) to its second, this plan does not specify the change. For the second part the starting point is `canSubmitProfile` and `canSubmitProfileEdit` (`App.tsx:766-767`) and the two guards that read `profileRouteTargetReady` (`:2999`, `:3057`), which would count the filtered list of the draft in hand.
- [ ] **Step 8: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Subject: `fix(ui): offer the Claude login provider only to a profile that can use it`

### Task 4: Core keeps the pass-through provider out of other agents' defaults and model lists (F-14, FU-10, the core half)

It needs nothing from Tasks 2 and 3. `withoutClaudeLoginProviders` already exists.

Today an empty model on a Codex, Pi, ZCode, Grok, Kimi, Kilo, OpenCode or Workbuddy profile falls back to the pass-through provider's model when that provider is first or preferred, and the model lists LLM Router writes into those agents' config files offer it. After this task the fallbacks skip the provider and the written lists leave it out. A profile whose own saved model names a `Claude Code API` model keeps that name, and the form line of Task 3 says what it means.

**Evidence.** With the pass-through provider preferred, `defaultClientModel` returns `Claude Code API/claude-sonnet-5`, and `Other/model` for the same config through `withoutClaudeLoginProviders` (ran (review round)). A Codex apply with that provider preferred, an empty model and both plugin entries writes four files that hold `Claude Code API/` (ran (second audit)). They are `codex/config.toml`, `codex/llm-router.config.toml`, `codex/llmr-model-catalog.json` and `codex/.llm-router/codex-app-user-data/<id>/llmr-codex-model-catalog.json`, all under `CONFIGDIR/profiles/<profile id>/`. The two `.toml` files take the name from the fallback and the two `.json` files from the catalog (inferred). Every function in the tables below serves an agent other than Claude Code (read). `GET /v1/models` and Claude Desktop's list already leave the provider out.

**Files:**
- Modify: `packages/core/src/profiles/apply-support.ts`, `packages/core/src/profiles/service.ts`, `packages/core/src/gateway/llm-router-plugin.ts`, `packages/core/src/agents/codex/app-launch.ts`, and the `profile-config.ts` of `agents/kilo`, `agents/zcode`, `agents/opencode`, `agents/pi` and `agents/kimi`
- Test: `packages/core/test/unit/profiles/claude-login-provider-fallback.test.mjs` (new), `packages/core/test/integration/profiles/profile-service.test.mjs`

**Interfaces:**

The change is the same in every place. The code reads `withoutClaudeLoginProviders(config)` where it read `config`. `service.ts` and `llm-router-plugin.ts` already import from `gateway/features/claude-login-pass-through`, and the other files gain the import.

The fallbacks for an empty model:

| Function | Where | Serves | With no usable provider it returns |
|---|---|---|---|
| `defaultClientModel` | `profiles/apply-support.ts:101-108` | Codex (`service.ts:730`), Pi (`:843`), ZCode (`:949`), Grok (`agents/grok/profile-config.ts:16`), Kimi (`agents/kimi/profile-config.ts:143`) | `gpt-5-codex` |
| a private `defaultClientModel` | `agents/zcode/profile-config.ts:277` | ZCode's config file | `gpt-5-codex` |
| a private `defaultClientModel` | `agents/kilo/profile-config.ts:182`, `agents/opencode/profile-config.ts:269` | Kilo, OpenCode | `default` |
| `resolveGrokProfileRouteTarget` | `gateway/llm-router-plugin.ts:700-710` | the built-in Grok route | `undefined`. Its caller then finds no target and the built-in rule does not apply (`:683-690`, read), as with no provider today |
| `workbuddySelectedModel` | `agents/codex/app-launch.ts:351-359` | Workbuddy | the first item of its catalog, or `gpt-5-codex` |

`gpt-5-codex` and `default` fail as an unknown model and not as a missing login.

The model lists written for other agents. Each call gets the filtered config:

| Call | Where | What it feeds |
|---|---|---|
| `codexModelCatalogJson(config, …)` | `profiles/service.ts:737` | the Codex profile's own `llmr-model-catalog.json` |
| `codexCompatibleAppModelCatalogJson(config, …)` | `agents/codex/app-launch.ts:298`, inside `writeCodexCompatibleAppModelCatalog` (`:284`) | the app catalog under `codex-app-user-data` |
| `workbuddySelectedModel` and `workbuddyModelsConfig` | `app-launch.ts:324-325`, inside `writeWorkbuddyModelsConfig` (`:318`) | Workbuddy's `models.json` |
| `buildCodexModelCatalogIds(config, …)` | `agents/kilo/profile-config.ts:95`, `agents/pi/profile-config.ts:190` | Kilo's and Pi's model lists |
| `buildZcodeModelCatalog(config, …)` | `agents/zcode/profile-config.ts:56` | ZCode's model list |
| `buildCodexModelCatalog(config, …)` | `agents/opencode/profile-config.ts:124` | OpenCode's model list |
| `availableGatewayModelIds(config)` | `agents/kimi/profile-config.ts:142` | Kimi's model list |

- In `app-launch.ts` both writers take `config?: AppConfig`. Filter once at the top of each, as `config && withoutClaudeLoginProviders(config)`. In `writeWorkbuddyModelsConfig` that one line covers the fallback and the list.
- `codexModelCatalogBase64` (`agents/codex/model-catalog.ts:143-149`) has the shape of `codexModelCatalogJson` and no caller under `packages/*/src` (by search). It needs no change.
- Not changed: `buildCodexModelCatalogIds` itself. It puts the profile's selected model first whatever provider it names (`model-catalog.ts:84`, read), so a profile that itself names a `Claude Code API` model still lists it.
- Not changed: the callers that route or authorize a request, which are `contracts/app.ts:1111` and `:1151`, `routing/model-registry.ts:21` and `agents/claude-app/gateway-routes.ts:43` and `:150`.
- Not changed: `config.ts:323-324`. `preferredProvider` may still name the pass-through provider. Each fallback looks it up in the filtered list, finds nothing and takes the first other provider.
- The two tables hold every hit of this search that writes a file, at `61bf9eae` (read (second fix round)): `grep -rn "buildCodexModelCatalog\|buildZcodeModelCatalog\|codexModelCatalogJson\|codexModelCatalogBase64\|codexCompatibleAppModelCatalog\|availableGatewayModelIds(" packages/core/src`. Run it again before Step 3. If it shows a writer the tables do not, change it too and say so in the PR.

- [ ] **Step 1: Write the failing unit test.** New file `packages/core/test/unit/profiles/claude-login-provider-fallback.test.mjs`, importing `defaultClientModel` from `@llmr/core/profiles/apply-support.ts`.

```js
const config = {
  Providers: [
    { api_base_url: "https://example.test", api_key: "llmr-local-agent-login", models: ["claude-sonnet-5"], name: "Claude Code API", type: "anthropic_messages" },
    { api_base_url: "https://example.test/other", api_key: "sk-other-key-0001", models: ["model"], name: "Other", type: "anthropic_messages" }
  ],
  preferredProvider: "Claude Code API",
  providerPlugins: [
    { key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" },
    { key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" }
  ]
};

test("an empty model does not fall back to the pass-through provider", () => {
  assert.equal(defaultClientModel(config), "Other/model");
  assert.equal(defaultClientModel({ ...config, Providers: [config.Providers[0]] }), "gpt-5-codex");
  assert.equal(defaultClientModel({ ...config, providerPlugins: [] }), "Claude Code API/claude-sonnet-5");
});
```

    `node build/test.mjs core && node --test .test-dist/core/test/unit/profiles/claude-login-provider-fallback.test.js`. Expected today: FAIL at the first assertion with `Claude Code API/claude-sonnet-5`. The third assertion pins that a provider with the placeholder key and no Claude plugin entry is left alone.
- [ ] **Step 2: Write the failing integration test** in `profile-service.test.mjs`. The file has no Codex fixture to reuse, so the profile is given here. `applyProfileFixture` (`:3647`), `filesHolding` (`:3875`) and `CONFIGDIR` are the file's own.

```js
test("a Codex profile with an empty model names the pass-through provider in no file", { skip: !process.env.LLMR_INTERNAL_HOME_DIR }, async () => {
  const profileId = "claude-login-codex-catalog";
  const config = createDefaultAppConfig();
  config.Providers = [
    { api_base_url: "https://example.test", api_key: "llmr-local-agent-login", models: ["claude-sonnet-5"], name: "Claude Code API", type: "anthropic_messages" },
    { api_base_url: "https://example.test/other", api_key: "sk-other-key-0001", models: ["model"], name: "Other", type: "anthropic_messages" }
  ];
  config.preferredProvider = "Claude Code API";
  config.providerPlugins = [
    { key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" },
    { key: "llmr-local-agent-claude-code-api-claude-code-oauth-internal", providerName: "claude-code-api::anthropic_messages" }
  ];
  config.profile.enabled = true;
  config.profile.profiles = [{ agent: "codex", configFormat: "separate_profile_files", enabled: true, env: {}, id: profileId, model: "", name: "Codex Catalog", scope: "llmr", surface: "cli" }];
  const applied = await applyProfileFixture(config);
  assert.equal(applied.clients[0].ok, true);
  assert.equal(filesHolding(path.join(CONFIGDIR, "profiles", profileId), "Claude Code API/").length, 0);
});
```

    `node build/test.mjs core && node --test --test-name-pattern="names the pass-through provider in no file" .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected today: FAIL at the last assertion with 4, the four files under Evidence. An apply of this profile was run and gave that count (ran (second audit)). The test text above was not run. Clean up after it as the file's other Codex apply tests do, for example the one at `:1848`.
- [ ] **Step 3: Implement** as the Interfaces block says.
- [ ] **Step 4: Run the tests, then `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core`.** Expected: PASS. Smallest mutations caught. Leaving `defaultClientModel` as it is fails the unit test and leaves the two `.toml` files in the integration count. Leaving `service.ts:737` or the `app-launch.ts` writer as it is leaves one `.json` file in the count. Filtering by the placeholder key alone fails the unit test's third assertion. No test here reaches the three private copies, the Grok route target, Workbuddy's fallback, or the lists of Kilo, Pi, ZCode, OpenCode and Kimi. If an existing apply test of one of those agents can take the two providers of Step 1 and an empty model, add the assertion there. Otherwise say in the PR that those lines are covered by reading.
- [ ] **Step 5: Run the gates and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. This task makes `profiles/apply-support.ts` and the agent files import a gateway module. The four lightweight MCP entries import only Node built-ins (read (second fix round)), so their bundles should not change, and the `npm run build:assets` of Task 5, Step 6 checks it. Subject: `fix(profiles): keep the Claude login provider out of other agents' default model and model lists`

### Task 5: The provider dialog says what is true for the pass-through provider (F-3, F-9, F-11, FU-5)

It touches the same shared file as Task 2, so it follows it on the branch.

After Import, the dialog shows no alert and sends no probe. Its credentials box, both status rows, the Verify heading and the model step's left pane each say something true for a provider that holds no login and is never asked for anything. It offers no Check Connection and no refresh. Other providers, local-login ones included, behave as before.

**Evidence.** A static render of the edit form for this provider shows today "Signed in with your local agent", "Choose a provider endpoint so LLMR can detect compatible protocols.", "This provider did not return a model list.", `Check Connection`, the "is connected" text and `Refresh provider models` (ran (audit), ran (review), ran (review round)). In the running dialog the first row reads "Compatible API protocols were found automatically" today, because the probe result names a protocol, and it would read "Choose a provider endpoint" once the probe is cleared (read, `providers.tsx:1758-1770`). The path from the probe result to the alert was read and not seen in a running page.

**Files:**
- Modify: `packages/ui/src/pages/home/shared/providers.ts`
- Modify: `packages/ui/src/pages/home/components/providers.tsx` (`ProviderConnectionStatusPanel` `:1739-1823`, `:2015`, the credentials box `:2314-2320`, the picker call `:2372-2392`, the Verify step `:2397-2409`, `ProviderModelPicker` `:3949-3977` and `:4111-4114`)
- Modify: `packages/ui/src/pages/home/App.tsx` (the automatic probe effect that starts at `:1427`, its branch at `:1491`)
- Test: `packages/ui/test/unit/provider-setup-steps.test.ts`, `packages/ui/test/component/provider-dialog-local-agent.test.tsx`
- Modify: `tests/e2e/local-agent-login-import.spec.ts`

**Interfaces:**
- Produces, in `shared/providers.ts`: `export function isClaudeLoginProviderDraft(draft: AddProviderDraft, providerPlugins: unknown[] | undefined, existingProvider?: GatewayProviderConfig): boolean`. It is the expression at `providers.tsx:2015` moved, with `existingProvider` passed on to `providerConnectivityProviderPlugins`. `providers.tsx:2015` becomes a call to it.
- Changes, in the credentials box: when `claudeLoginProvider` is true the heading is `Uses the login Claude Code sends`, and the body is `This provider forwards the login Claude Code sends. Nothing is stored. Turn on Sign in with my Claude login in a Claude Code profile to use it.` Every other local-login draft keeps "Signed in with your local agent" and its body.
- Changes: `ProviderConnectionStatusPanel` gains `claudeLoginProvider: boolean`. When it is true and nothing is loading, the first row keeps the title `Local login provider` and takes the description `LLMR does not probe this provider. It uses the Anthropic Messages protocol.` The second row has the title `Not checked`, the description `This provider forwards the login Claude Code sends and has none of its own to test with.` and no action. Both rows take the state `"pending"`.
- Changes: the Verify step's `ProviderFormStepHeader` takes the description `LLMR does not test this provider.` when `claudeLoginProvider` is true.
- Changes: `ProviderModelPicker` gains the optional prop `emptyCatalogText?: string`, which replaces the sentence at `:4113` when it is set. The picker builds that sentence itself and takes nothing else about the provider, so one optional string is the smallest change. The form passes `LLMR does not ask this provider for a model list. Add model IDs with Custom model.` and `onRefresh={undefined}` when `claudeLoginProvider` is true. The title "No provider models" stays.
- Changes, in `App.tsx`: a value computed during render, above the effect at `:1427`, as `isClaudeLoginProviderDraft(providerDraft, draftConfig.providerPlugins, providerEditIndex === undefined ? undefined : draftConfig.Providers[providerEditIndex])`. All three inputs are declared before the effect (read (review)). The branch at `:1491` is also taken when that value is true, and the value joins the effect's dependency list.
- Not changed: `probeGatewayProvider`, `localClaudeProbeResult`, every contract type, `checkProviderDraft` and `refreshProviderModels`.

- [ ] **Step 1: Write the failing tests.**
  - Unit, `provider-setup-steps.test.ts`. Add `isClaudeLoginProviderDraft` to the file's import from `@llmr/ui/pages/home/shared/providers`. Test `a Claude login draft is told apart from other local-login drafts`.

```ts
const marked = { ...createProviderDraft([]), apiKey: localAgentProviderApiKey, name: "Claude Code API" };
const template = { key: "llmr-local-agent-__LLMR_PROVIDER_NAME_SLUG__-claude-code-oauth", providerName: "__LLMR_PROVIDER_NAME__" };
const saved = [{ key: "llmr-local-agent-claude-code-api-claude-code-oauth", providerName: "Claude Code API" }];
assert.equal(isClaudeLoginProviderDraft({ ...marked, providerPlugins: [template] }, []), true);
assert.equal(isClaudeLoginProviderDraft(marked, saved), true);
assert.equal(isClaudeLoginProviderDraft(marked, [{ key: "llmr-local-agent-codex-codex-oauth", providerName: "Claude Code API" }]), false);
assert.equal(isClaudeLoginProviderDraft({ ...marked, apiKey: "sk-test" }, saved), false);
```

  - Component, `provider-dialog-local-agent.test.tsx`: `the Claude Code login provider shows true text in every step and no check or refresh`. Use the draft and the plugin of the file's existing Claude test, and add `onCheck: async () => undefined` and `onRefreshModels: async () => undefined` to the props.

```ts
assert.match(html, /Uses the login Claude Code sends/);
assert.match(html, /LLMR does not probe this provider\./);
assert.match(html, /Not checked/);
assert.match(html, /LLMR does not ask this provider for a model list\./);
assert.match(html, /LLMR does not test this provider\./);
assert.doesNotMatch(html, /Signed in with your local agent/);
assert.doesNotMatch(html, /Choose a provider endpoint/);
assert.doesNotMatch(html, /did not return a model list/);
assert.doesNotMatch(html, /Check Connection/);
assert.doesNotMatch(html, /is connected when this provider is saved/);
assert.doesNotMatch(html, /Refresh provider models/);
```

  - Component, the control: `a Codex login provider keeps its heading, its connection check and its model refresh`. The file's Codex draft and plugin with the same two props. `assert.match` for `/Signed in with your local agent/`, `/Check Connection/`, `/Available after saving/`, `/Refresh provider models/`, `/Run a real model request/` and `/did not return a model list/`. It passes today (ran (audit), ran (review) for four of the six, read for the other two) and is there to fail under a change that hides too much.
- [ ] **Step 2: Add the stub.** In `shared/providers.ts`, the export with the body `return false;` and its three parameters prefixed with an underscore.
- [ ] **Step 3: Run them and watch them fail.** `node build/test.mjs ui && node --test .test-dist/ui/test/unit/provider-setup-steps.test.js .test-dist/ui/test/component/provider-dialog-local-agent.test.js`. Expected: the unit test fails at its first assertion. The first component test fails at `/Uses the login Claude Code sends/`, and each of its six `doesNotMatch` texts is present today The control passes.
- [ ] **Step 4: Implement** as the Interfaces block says.
- [ ] **Step 5: Run the tests, then `npm run test:ui`.** Expected: PASS, with the file's existing test `edit dialog for the Claude Code login provider says it forwards the login and stores nothing` unchanged and green. Smallest mutations caught. Passing `claudeLoginProvider={false}` to the panel fails the second and third assertions. Leaving the picker's default sentence fails the fourth. Changing the heading or hiding the check for every local-login draft fails the control.
- [ ] **Step 6: Change the end-to-end spec** `tests/e2e/local-agent-login-import.spec.ts`. Two tests.
  - Rename `onboarding discovers the imported login's models through its plugins` to `onboarding sends no probe for the imported Claude login`. Keep the Import and Next step clicks and the wait for `Choose the models that should be available through this provider.`. Then:

```ts
await expect(page.getByText("claude-sonnet-5", { exact: true }).first()).toBeVisible();
await expect(page.getByText("LLMR does not ask this provider for a model list.", { exact: false })).toBeVisible();
await expect(page.getByRole("button", { name: "Refresh provider models" })).toHaveCount(0);
await page.waitForTimeout(1000);
expect(probeRequests.length).toBe(0);
```

    Remove the loop over `discoveredModels`, the `No provider models` assertion and the old refresh assertion. Leave the constant `discoveredModels`, because the mocked `probeResult` still uses it. The wait is one second because the probe is sent 350 ms after the draft changes. The length is compared, so a failure prints a number.
  - Add `the add provider dialog shows the imported Claude login as not checked`. Open the dialog as the test `the add provider dialog goes from the import to Pick models and back` does, with `probeRequests` passed to `mockLocalAgentRpc`. After the Import and Next clicks:

```ts
await expect(dialog.getByText("Pick models")).toBeVisible();
await dialog.getByRole("button", { name: "Next", exact: true }).click();
await expect(dialog.getByText("Not checked", { exact: true })).toBeVisible();
await expect(dialog.getByText("LLMR does not probe this provider.", { exact: false })).toBeVisible();
await expect(dialog.getByRole("button", { name: "Check Connection" })).toHaveCount(0);
await page.waitForTimeout(1000);
expect(probeRequests.length).toBe(0);
```

    Run `npm run build:assets && npx playwright test tests/e2e/local-agent-login-import.spec.ts`, then `git checkout -- packages/core/models.json packages/ui/src/generated`. Expected: PASS. Both tests ran on today's code as far as their first new text, and every selector before it matched (ran (second audit)). The first stopped at "LLMR does not ask this provider for a model list.", with one probe request made and Refresh provider models offered. The second stopped at "Not checked", with one probe request made. The probe count is the assertion that pins the `App.tsx` branch, which no component test reaches. The second test asserts nothing about the alert box. The spec's mock answers every probe as supported (`:38-47`, `:162-165`), so no alert shows with or without the branch (ran (second audit)), and an assertion on it could not fail. If the page differs from the static render after the change, stop and report what it shows.
- [ ] **Step 7: Run the gates.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`.
- [ ] **Step 8: Commit.** `fix(ui): give the Claude login provider true dialog text and stop probing it`

### Task 6: The upgrade note and the user docs (F-4, F-18, FU-2, FU-6, FU-12)

Last in PR 1, because its text describes what Tasks 2 to 5 built.

**One sentence waits on a check.** "Leave it empty and Claude Code starts on its own default model" is a statement about Claude Code. For a system-default profile LLM Router writes no model key, so Claude Code's own rule applies. For a shared-home profile LLM Router writes `"ANTHROPIC_MODEL": ""` (ran (review)), and what Claude Code does with that is probe P8 under "Release order". Write the sentences marked **P8** below only when P8 has passed. If PR 1 opens first, leave them out, say so in the PR, and add them in a docs commit to `main` once P8 has passed. If P8 fails, they are not written and F-7 becomes a defect with its own task.

**One sentence waits on question 1.** Step 1 marks it. PR 1 opens after that question is answered, because the README note differs by the answer.

**Files:**
- Modify: `README.md` (`:175-177`)
- Modify: `docs/src/content/docs/en/configuration/profiles.md` (`:53`, the section "Claude login mode" `:57-71`, the table row `:77`)
- Modify: `docs/src/content/docs/en/configuration/providers.md` (the "Claude Code" section, `:12-24`)
- Modify: `docs/superpowers/plans/2026-11-22-claude-code-login-pass-through.md` (its Status paragraph, the bullet "Open for the owner")

- [ ] **Step 1: README.** The heading becomes `### Upgrading from 8.x`. After the sentence that ends "should use your Claude subscription." add: `A default model from another provider still starts every new session on that provider, whatever you pick with /model.` Then, **P8**: `Clear **Default model** in the profile to start on Claude Code's own default.` Then: `Route rules, fallbacks and other agents' profiles that name a Claude Code API model now fail with a message that says to sign in. Point them at another provider.` Then, only with answer (b) to question 1: `Remove the Claude Code API provider and add it again, which deletes the login an earlier version saved in LLMR's config.` The rest of the paragraph stays.
- [ ] **Step 2: `profiles.md`, the section "Claude login mode".**
  - After the paragraph that starts "Claude Code then shows its own model list", add: `With the toggle on, **Default model** is optional. A model from another provider in **Default model** starts every new session on that provider, and one in the Fable, Opus, Sonnet or Haiku field sends that choice there. The form says so under the field.` Then, **P8**: `Leave **Default model** empty and Claude Code starts on its own default model, on your subscription.`
  - After that paragraph add: `A profile opened only from LLMR has its own Claude home and starts signed out. Run /login once inside it, or turn on **Use my ~/.claude in the terminal**. A **System default** profile uses your normal login.` Put `/login` in code font.
  - After the sentence "The gateway key sits in that file in plain text." add: `A settings.json.llmr-backup-<time> copy beside the file can hold the same line. Switching the profile off ends that key. Quitting LLMR puts a system-default profile's settings back and keeps the profile and its key, so a copy made then holds the key the profile still uses.` Put the file name in code font. If the owner answers question 6 with (b), write only the first of the three sentences.
  - The bullet at `:70` stays as it is. It says the request fails with a message that tells the user to sign in, which is what the gateway does (read).
- [ ] **Step 3: `profiles.md`, the two lines about discovery.** At `:53`, add after the paragraph's last sentence: `In Claude login mode Claude Code shows its own list instead.` In the table row at `:77`, the second cell becomes `LLMR gateway model discovery, except in Claude login mode`.
- [ ] **Step 4: `providers.md`.** After the numbered list of the "Claude Code" section add: `LLMR does not probe or test this provider, because it has no login of its own to test with. The dialog shows **Not checked** and offers no **Check Connection**. Other agents' profiles are not offered its models.`
- [ ] **Step 5: The pass-through plan.** Replace its Status bullet "Open for the owner" (`:21`) with the text below and change nothing else in that file.

```markdown
- **Open for the owner.** The gateway key line in `.llmr-backup-*` copies of a settings file and the README's upgrade heading are handled in [`2026-11-23-pass-through-follow-ups.md`](2026-11-23-pass-through-follow-ups.md), which also sets the release order now that Gate B is the gate for the release. A model id with `[1m]` reaches Anthropic unchanged, and whether Anthropic accepts it is for Gate B.
```

- [ ] **Step 6: Check.** `git grep -n "Upgrading to 9" -- README.md docs/src docs/superpowers/plans/2026-11-22-claude-code-login-pass-through.md` prints nothing. Today it prints the two lines that Steps 1 and 5 replace (ran (second audit)). Read each changed paragraph once in the diff. `npm run lint` is not a check of these files, because Biome does not read Markdown.
- [ ] **Step 7: Commit.** `docs: correct the upgrade note and the Claude login mode pages`

Then open PR 1. Before it: `npm run typecheck`, `npm run lint`, `npm run test:architecture`, `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core`, `npm run test:ui`, `npm run test:electron`, and the two end-to-end specs this PR touches.

---

## PR 2: finding F-5

Branch `fix/claude-settings-backup-key` from `main`, after PR 1 has merged.

### Task 7: Write a Claude Code settings backup without the gateway key line (F-5, FU-7)

Alone in its PR, because it can change which backup a restore picks.

A `settings.json.llmr-backup-*` copy no longer holds the `x-llmr-api-key` line, whether an apply or a restore made it. The user's own custom header lines stay in the copy. A file with no such line is still copied byte for byte.

**How far the restore changes.** The line sits in `ANTHROPIC_CUSTOM_HEADERS`, which is not one of LLM Router's managed keys. So today every Claude-login backup counts as the user's. Without the line, a backup of a file that held nothing else of the user's has only managed keys and counts as LLM Router's own. A backup of a file that held anything of the user's, such as a theme or a custom header, counts as the user's before and after. So this task changes which snapshot a restore picks, and which backup pruning spares, only for a settings file that held nothing of the user's. Say that in the PR.

**Evidence.** The backups hold the line today (ran (research), ran (audit), ran (review)). With the key line removed from every Claude settings backup in a compiled bundle, the same test passes and the restore writes `{}` (ran (audit), simulated).

**The third writer.** `cleanupClaudeCodeToolHubSettingsFile` (`:428-442`) also writes a profile's settings file through `writeFileWithBackup`. The task passes the option there too. Two runs with ToolHub on did not reach that write with a key line in the file (ran (fix round)), so no test here fails when only the option at `:439` is dropped. The PR says so.

**Files:**
- Modify: `packages/core/src/profiles/backup-files.ts` (`BackupOptions` `:80`, `backupCurrentFile` `:82-88`)
- Modify: `packages/core/src/profiles/service.ts` (`cleanupClaudeCodeToolHubSettingsFile` `:439`, `claudeCodeManagedContent` `:1121`, `orphanedClaudeCodeManagedContent` `:1179`, `syncClaudeCodeManagedGatewaySettingsFile` `:2288`, `writeClaudeCodeSettingsIfManagedChanged` `:2804`, `writeFileWithBackup` `:2957`, `RestoreManagedContentMatchers` `:3122`, the inline matcher in `restoreInactiveGlobalProfileConfigs` `:3347-3351`, `backupCurrentConfigFile` `:4002`)
- Test: `packages/core/test/unit/profiles/backup-files.test.mjs`, `packages/core/test/integration/profiles/profile-service.test.mjs`
- Modify: `docs/src/content/docs/en/configuration/profiles.md` (the sentences Task 6, Step 2 added)

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

  `node build/test.mjs core && node --test --test-name-pattern="helper-mode restore after Claude login" .test-dist/core/test/integration/profiles/profile-service.test.js`. Expected today: FAIL, because the restore takes the Claude-login backup with LLM Router's keys removed and writes `{"env":{}}`. If the test passes on your checkout, the code has moved. Keep the test, say so in the PR, and go on.
- [ ] **Step 2: Write the failing tests.**
  - Unit, `backup-files.test.mjs`. Add `backupCurrentFile` to the file's import from `@llmr/core/profiles/backup-files.ts`, after `backupContent`.

```js
test("backupCurrentFile writes the text contentForBackup returns, and a plain copy when the text is unchanged", posixOnly, (t) => {
  const { file } = setup(t);
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T00:00:00.000Z") });
  const stripped = backupCurrentFile(file, { contentForBackup: () => "kept", mode: 0o600 });
  assert.equal(readFileSync(stripped, "utf8"), "kept");
  assert.equal(statSync(stripped).mode & 0o777, 0o600);
  t.mock.timers.tick(1000);
  assert.equal(readFileSync(backupCurrentFile(file, { contentForBackup: (content) => content }), "utf8"), "old");
  assert.equal(readFileSync(file, "utf8"), "old");
});
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

  - Integration: `a backup of a Claude login settings file keeps the user's own custom headers`. `beforeApply: writeUserClaudeSettings({ env: { ANTHROPIC_CUSTOM_HEADERS: userCustomHeaders } })`. Apply, set the key to `llmr-rotated-key-0002`, apply. Read the newest name of `backups(settingsFile)` after a sort, parse it, and assert as below. The comparison is made before `assert` sees the value, so a failure prints only the message.

```js
assert.ok(parsed.env.ANTHROPIC_CUSTOM_HEADERS === userCustomHeaders, "the backup holds the user's lines and no key line");
```

  - Integration: `a quit leaves no backup that holds the gateway key line`. `beforeApply: writeUserClaudeSettings({ theme: "dark" })`. Apply, read `key()`, call `restoreGlobalProfileConfigsOnExit(config.profile.profiles)`, and assert ``assert.equal(holding(settingsFile, `x-llmr-api-key: ${thatKey}`), 0)``.
  - Integration: `an apply with no gateway model leaves no backup that holds the gateway key line`. Set `config.toolHub = { ...config.toolHub, enabled: true, llm: { ...config.toolHub.llm, apiKey: "resolver-key", baseUrl: "https://example.test/v1", model: "model" }, mcpServers: [{ command: "node", name: "backend", transport: "stdio" }] }`, as the file's Codex ToolHub restore test does. `beforeApply: writeUserClaudeSettings({ theme: "dark" })`. Apply, and assert `"LLMR_CLAUDE_CODE_MCP_CONFIG" in readSettings().env`. Read `key()`, set `config.Providers = []`, call `applyProfileFixture(config)` directly, because the helper's `apply` asserts a result this apply does not give, and assert ``assert.equal(holding(settingsFile, `x-llmr-api-key: ${thatKey}`), 0)`` and `assert.ok(backups(settingsFile).length >= 2)`.
- [ ] **Step 3: Run them and watch them fail.**

```sh
node build/test.mjs core && node --test --test-name-pattern="backupCurrentFile writes|holds the gateway key line|keeps the user's own custom headers|helper-mode restore after|no gateway model leaves" .test-dist/core/test/unit/profiles/backup-files.test.js .test-dist/core/test/integration/profiles/profile-service.test.js
```

  Expected on today's code. The unit test reads `old` where it wants `kept`. The key-line test fails at its first assertion with 1, and the quit test at its only assertion with 1. The custom-headers test fails, because the newest backup holds the user's lines and the key line after them. The no-gateway-model test fails at its first count with 1.
- [ ] **Step 4: Implement** as the Interfaces block says.
- [ ] **Step 5: Run the tests, then the whole suite.** `LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" npm run test:core`. Expected: PASS, Step 1's test included. Then run the existing restore tests by name, `node --test --test-name-pattern="Claude login|custom header|#1951|restore|Claude" .test-dist/core/test/integration/profiles/profile-service.test.js`. Every one passes unchanged. With the key line removed from every Claude settings backup, 98 of 98 tests under that pattern passed (ran (audit), simulated). If one fails, the change reached a restore result, and that is the review point of this PR. Report it and do not adjust the test.
- [ ] **Step 6: Break it four times.** Ignore `contentForBackup` in `backupCurrentFile` and confirm the unit test fails. Drop the option from `writeClaudeCodeSettingsIfManagedChanged` and confirm the key-line test fails at its first assertion. Make `claudeCodeSettingsBackupContent` delete the whole `ANTHROPIC_CUSTOM_HEADERS` key and confirm the custom-headers test fails. Drop the option from `cleanupClaudeCodeToolHubSettingsFile` and write down whether any test fails. None is expected to. Put all four back.
- [ ] **Step 7: Update the doc sentences.** In `profiles.md`, replace the sentences Task 6, Step 2 added about the backup with: `LLMR writes its settings.json.llmr-backup-<time> copies without that line.` Keep the file name in code font.
- [ ] **Step 8: Run the gates, state the limits in the PR, and commit.** `npm run typecheck`, `npm run lint`, `npm run test:architecture`. Limits. A backup written before this change keeps its line until five newer ones push it out. The other agents' backups are unchanged. The key still sits in the live `settings.json` while the profile is on, and under `CONFIGDIR/bin/`. Subject: `fix(profiles): write a Claude Code settings backup without the gateway key line`

---

## Checks this plan adds to Gate B

Gate B is the pass on the throwaway VM in the pass-through plan, with its checks B1 to B11. These join it. They run on the build that will ship. G2 repeats an item the pass-through plan already lists as open. On the VM, `<config dir>` is LLM Router's own data folder, `~/.llm-router` by default. A profile's settings file is `~/.claude/settings.json` for a system-default profile and `<config dir>/profiles/<profile id>/claude/settings.json` for any other.

| # | Check | Pass |
|---|---|---|
| G1 | A Claude-login profile with the default model set to `Claude Code API/claude-sonnet-5`, the one model the imported provider lists. Start Claude Code and send a prompt | The prompt is answered and Logs show provider `Claude Code API`. Write down what `/model`, `/status` and the status line show as the model, and any warning at start |
| G2 | The same with a model whose window makes LLM Router append `[1m]`. First add that model to the provider with Custom model. Read the profile's settings file first to confirm the suffix is there | Anthropic answers. If it refuses the id, record the status and the message. That result decides whether the suffix is removed for the pass-through provider, which is a new finding and not a task here |
| G3 | A shared-home Claude-login profile with no default model. Read its settings file and confirm it holds `"ANTHROPIC_MODEL": ""`, then start Claude Code | Claude Code starts on its own default model and the first request succeeds, as probe P8 showed without LLM Router. If it fails or names an empty model, record it. That is F-7 becoming a defect |
| G4 | A system-default Claude-login profile with no default model | `~/.claude/settings.json` has no `ANTHROPIC_MODEL` key. Claude Code starts on its own default and Logs show provider `Claude Code API` |
| G5 | A Claude-login profile whose default is another provider's model, and whose Opus field is another provider's model | The form shows both lines of Task 2. A new session's requests appear in Logs under that provider. Picking Opus with `/model` sends requests to the Opus field's provider. Picking another model from Claude Code's own list sends them to `Claude Code API`. Quit and start Claude Code again and write down which model the new session starts on |
| G6 | A fresh install. In onboarding, import only the Claude Code provider and go to "Connect agent" | The form shows the "Your only provider is Claude Code API" line and Next step is off. With the toggle on, onboarding finishes, and `claude -p "say ok"` is answered with provider `Claude Code API` in Logs. If the first part of question 7 was answered (b), the toggle is already on |
| G7 | A new Claude-login profile with the default scope, "Only opened from LLMR", and shared home off. Open Claude Code from it | The form shows the "starts signed out" line. Write down what Claude Code shows before a login. After `/login` inside it, a prompt is answered with provider `Claude Code API`. This also shows for real what probe P7 shows with a stub |
| G8 | With `Claude Code API` as the first provider and one other provider, a Codex profile with an empty model | The card shows the other provider's model. Codex starts on it and is answered. Its model list does not offer a `Claude Code API` model |
| G9 | Turn the toggle on in a Claude Code profile, then switch the `Claude Code API` provider off and send a prompt | The form shows "No Claude Code API provider is on." and the card reads `Claude login, no Claude Code API provider`. Logs show the prompt under another provider or refused with LLM Router's own message, and never under `Claude Code API`. Write down which of the two |
| G10 | A Claude-login profile with an allowed model list that holds `Claude Code API/claude-sonnet-5`. Pick another Claude model with `/model` and send a prompt | The request is refused with "is not allowed for this profile", as F-17 found, and the form shows the line of Task 2, Step 8 under the toggle. If question 8 was answered (a), the request is answered instead |

## Release order

PR 146 merged before the pass-through plan's Gate B ran. So Gate B no longer gates a merge. It gates the release, and nothing ships until it has passed on the build that will ship (FU-13).

1. **The owner's answers.** The table below says what waits on each. Question 1 comes before PR 1 opens. While it is open, nothing of Task 1 is built, and Tasks 2 to 6 are built apart from the one README sentence that depends on it.
2. **The isolated probe runs, on this Mac.** P1 to P7 of the pass-through plan, as its section "Isolated probe runs on this Mac" describes, and one new run. They use only the Claude Code binary, under `env -i` with a temporary home, a stub API on loopback and a stand-in `security`. LLM Router is not run. P8 is recorded as one more row of that section's table:

   | # | Run | What it settles |
   |---|---|---|
   | P8 | The fake login, the base URL and the custom header of P1, so the default is the subscription's and not an API key's. First a settings file passed with `--settings` whose `env` holds `"ANTHROPIC_MODEL": ""`. Then the same empty value in the process environment | Whether Claude Code starts on its own default model, and the model id the first request carries in each case. The docs sentences marked P8 in Task 6 wait on it |

3. **PR 1**, Tasks 1 to 6, with Task 1 only if question 1 was answered (a).
4. **PR 2**, Task 7. Recommended before Gate B, because it changes a restore and B7 should run on the build that ships. This is question 9.
5. **Gate B on the build that will ship.** B1 to B11 and G1 to G10. A G2 failure adds a task before the release.
6. **The version (question 2) and the release.**
7. **The owner's local steps** of the pass-through plan. Step 3 before the release is installed on his Mac, then step 2. Step 1 at any time.

| Waits | On |
|---|---|
| Task 1, all of it, and Review Focus 1 | Question 1 |
| Task 6, Step 1, the remove-and-add sentence, and the opening of PR 1 | Question 1 |
| Task 2, Step 8 | Question 8 |
| Task 3, Step 7 | Question 7 |
| The docs sentences marked P8 in Task 6, Steps 1 and 2 | Probe P8 |
| A docs sentence on what a signed-out Claude Code shows | Probes P4 and P7, then G7. No task here writes one |
| Task 7's scope | Question 3 |
| Whether PR 2 merges before Gate B | Question 9 |
| The release | Gate B, question 2 |

## Open with the owner

1. **Is removing, on load, data that only one earlier version wrote migration code?** FU-3 removes the stored `auth` block on load and FU-4 leaves the dead account connector on load, so the two apply different standards to the same kind of change. The record's F-2 gives the precedent for and against, and the manual step that already clears the block. Options: (a) build Task 1. (b) Drop Task 1 and rely on the remove-and-add step. Five texts then stay untrue for an upgraded config until that step is done, and the README note gains a sentence that tells every upgrader to do it. Task 1 lists both. (c) Build Task 1 and also drop the dead connector on load, so both are treated the same way. That needs a short revision of this plan first. Recommended: (a), and the plan is written for it. The first audit and the design review leaned to (b), because the project has one install and a written step already covers it. The design review added that (c) is the consistent answer if the public 8.x releases count as having users. Those views are recorded for the owner and are not a second recommendation. What waits: all of Task 1, Review Focus 1, the remove-and-add sentence of Task 6, Step 1, and the opening of PR 1. While the question is open, nothing of Task 1 is built and Tasks 2 to 6 are built without it.
2. **Which version carries PR 146?** Options: (a) 9.0.0, which the project's practice implies, because the change is a `feat!` that removes a feature and needs a user action, as 5.0 and 7.0 did. (b) 8.2.0, with 6.1 and 7.2 as precedents for a minor that carried a README upgrade note. Recommended: (a). No task waits. Task 6 writes "Upgrading from 8.x", which is true for either. The release waits.
3. **Should the other agents' backups change too?** The backups of Pi, OpenCode, Kilo and ZCode hold the profile key the same way. Options: (a) Claude Code only, as Task 7 is written, and leave the others to Tasks 6 to 8 of the backlog restore plan. (b) Add the four to Task 7 through the same `contentForBackup` option, with one "which line is LLM Router's" rule each. (c) Leave all backups as they are and drop Task 7. (d) In `backupCurrentFile`, blank the pattern `backup-files.ts` already has (`profileTokenPattern`, `:61`), as `saveRemovedConfigCopy` does. That is a few lines, it covers every agent, and no restore picks a different snapshot. The record's F-5 options table gives its limits, which were read and not run. Task 7's fixtures would need keys of the generated form, and the `{"env":{}}` result of Task 7, Step 1 stays. Recommended: (a) now, and (d) in place of (b) if the owner wants the four covered before the restore plan is built. Task 7 waits on this only if the answer is (b), (c) or (d).
4. **Should LLM Router say anything when `settings.json` is a link into another folder (F-8)?** Options: (a) nothing in code, and tell the dotfiles and claude-multipass sessions, which the pass-through plan's local step 3 already does. (b) One sentence in the form when the settings file is a link. (c) Refuse Claude login mode for a linked file. Recommended: (a). No task waits.
5. **Should the edit dialog stop probing the other local-login providers with the placeholder key (F-9)?** Options: (a) leave it until someone runs it and sees what each provider answers. (b) Skip the automatic probe for every local-login edit draft. Recommended: (a), because (b) also removes the model discovery those providers rely on. No task waits.
6. **Should the record say less about which backup copies hold a key that is still in use?** Options: (a) keep its F-5 table and its "What limits it" paragraph, because Task 7 and its limits cannot be reviewed without them. (b) Shorten both to "a copy can hold the key line" and keep the detail in a private note. Recommended: (a). With (b), Task 6, Step 2 writes one sentence where it has three. No task waits. **Answered, 2026-11-23: (a).** The owner had the record pushed as written.
7. **What should happen when the only provider is the pass-through one?** Task 3, Step 7 waits on both parts. Tasks 2 and 3 build answer (a) to each without waiting.
   - **A new Claude Code profile, in onboarding or from Add profile.** PT-2 says nothing switches the mode on, and a new profile starts with the toggle off, so a person whose only provider is the Claude import reaches a profile step that cannot be finished as it stands. Options: (a) keep the toggle off and show the line "Your only provider is Claude Code API. Turn on Sign in with my Claude login to use it, or add another provider." (b) Start a new Claude Code profile with the toggle on when every enabled provider is the pass-through one. That is one click fewer, and it is an exception to PT-2 that only the owner can make. (c) Do not let the provider step count the Claude import alone as enough. Recommended: (a).
   - **A profile of another agent.** Onboarding lets a person pick another agent. With the pass-through provider alone, a Codex, Pi, Grok, OpenCode, Kilo, ZCode or Workbuddy profile can still be saved with an empty model, because the new line is text only and the submit check counts the pass-through provider (`App.tsx:765-767`, read). Its requests then fail as an unknown model. Options: (a) leave the submit check as it is. The form says "Add another provider for this agent." and the profile saves. (b) Refuse the save until the profile has a provider it can use, which is what the form already does when there is no provider at all. That changes `App.tsx` and is not specified here. Task 3, Step 7 names where it starts. Recommended: (a) for this release, because it is text only and takes away nothing that works today. (b) is the rule the no-provider case already follows, if the owner wants a saved profile to always have a model it can use.
8. **What should an allowed model list do in Claude login mode (F-17)?** Task 2, Step 8 waits. With a list set, Claude Code's own `/model` picks that are not in the list are refused with "is not allowed for this profile" (ran (review round)). The list picker offers only models a provider lists, and the imported provider lists one. Options: (a) the list does not apply to a request the pass-through rule routes. That is a core change in at least four places, the two `profileDeniedModel` functions (`gateway/request/pipeline.ts:1402`, `gateway/core-runtime/router-plugin.ts:1136`) and the two `count_tokens` checks (`gateway/http/request-handler.ts:273`, `router-plugin.ts:368`), and it needs its own tests. `isModelAllowedForProfile` has more callers, which build route and model lists (`gateway/llm-router-plugin.ts:1030`, `gateway/features/model-discovery.ts:169`, `:256`, `:315`) and were not traced. (b) The list must name the models. Nothing changes, and the docs say that a model is added to the provider with Custom model and then to the list. (c) The form says what happens, as Task 2, Step 8 is written. Recommended: (c) for this release, because it is text only and true, and (a) later if the owner wants the picks to work.
9. **Does PR 2 ship in the same release?** FU-7 first had the release ship with the backups as they are. Options: (a) PR 2 merges before Gate B and ships with PR 1, so B7 runs once, on the build that ships. (b) The release goes out without PR 2, and PR 2 gets its own pass of B7 on the VM before the release after it. Recommended: (a). Step 4 of "Release order" waits.

The account connector of F-10 has no question of its own. It is option (c) of question 1.

## Self-review

- **Coverage.** F-1 to F-5 and F-13 to F-18 each have a task or a step. F-2's task and the steps for F-17 and part of F-14 wait on questions 1, 8 and 7. F-7 is observed by P8 and G3 and is not closed. FU-1 to FU-13 each name a task or a section, and each is still a recommendation.
- **Steps.** Every test step gives a name, its assertions with real values and what joins the import line. Tasks 2, 3 and 5 add a stub before their first run. The Codex control of Task 5 passes before the change and says so. The text of Task 4's integration test was not run, though an apply of its profile was.
- **No step runs the app.** The two visual checks of the first plan are now end-to-end tests in a temporary home, and what needs the real apps is a Gate B row.
- **Names across tasks.** `isClaudeLoginProvider` takes a saved provider and comes from Task 2. `profileModelProviders` takes a profile draft and comes from Task 3. `isClaudeLoginProviderDraft` takes a provider draft and comes from Task 5. Core's `withoutClaudeLoginProviders` and `claudeLoginProviderNames` already exist.
- **Order.** Each commit of PR 1 is green alone. Task 3 uses Task 2's helper. Task 4 needs neither. Task 5 follows Task 2 in the same shared file. Task 6's text is true only after Tasks 2 to 5. Task 7 edits sentences Task 6 wrote. Task 1 can land at any place before Task 6.
- **Failure output.** No assertion compares a value that holds a key or a login through `assert.equal`.

## Not verified

The spec's "Not verified" list applies in full. This list holds only what is the plan's own.

- The form, card and dialog changes themselves. The new unit tests ran against stand-ins for the planned helpers, not against changed components.
- The four end-to-end tests past the point where today's code stops them. Each ran on today's code up to a disabled button or its first new text (ran (second audit)).
- Task 4. The text of its integration test. The three private fallback copies, the Grok route target, Workbuddy's fallback, and the lists of Kilo, Pi, ZCode, OpenCode and Kimi, which were read and which no test here reaches. Whether the new import of a gateway module into `apply-support.ts`, `app-launch.ts` and the agent files makes an import cycle that matters at load, which `npm run test:core` would show.
- What the Grok route does with a request once the built-in rule does not apply.
- A Claude Desktop request that resolves to the default route target while the pass-through provider is first. `inferClaudeAppGatewayTargetModel` reads the unfiltered list (`agents/claude-app/gateway-routes.ts:43`), and no task here changes it.
- The discovery sentences of Task 6, Step 3. They rest on PT-2 and on the spec's reading of Claude Code's docs. LLM Router writes `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` into the settings file of a Claude-login profile (ran (second audit)), and probe P1, which shows what Claude Code does with it, has not run.
- The changes this plan leaves unspecified, which are answer (a) to question 8, answers (b) and (c) to the first part of question 7 beyond what Task 3, Step 7 says, answer (b) to its second part, and answer (c) to question 1.
- Two backups made within the same millisecond get the same name (`backup-files.ts:9-12`), so a count of backups in Task 7's integration tests could come out one lower. The file's existing tests share that risk.
- Probe P8, probes P1 to P7, and every Gate B check.
