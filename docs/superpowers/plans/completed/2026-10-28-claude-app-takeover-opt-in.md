# Claude App Takeover Opt-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLMR writes the shared `Claude-3p` takeover only for the one profile whose operator turned on an explicit toggle, so a Claude App launched outside LLMR is the normal signed-in app by default.

**Architecture:** One optional boolean on `ProfileConfig` gates the shared-dir write in the three places that make it (startup sync, profile launch, CLI). The field is threaded through every key-list rebuild of a profile (core loader, UI normalizers, draft) and the existing single-owner rule clears it on all but one profile. The profile editor exposes the toggle next to Entry mode for App-capable Claude Code profiles. Builds on branch `fix/claude-app-takeover-honors-scope` (PR 48), which already centralized the gate in `claudeAppTakesOverDirectLaunches`.

**Tech Stack:** TypeScript under `packages/core`, React under `packages/ui`, `node:test` with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-10-28-claude-app-opt-in-and-claude-code-token-refresh.md`, Change 1.

## Global Constraints

- Branch from `fix/claude-app-takeover-honors-scope` (PR 48 head 691bf99d) after merging `main` into it (it is behind by three docs commits), not from `main`.
- Field name, verbatim: `claudeAppTakeover`. Toggle label, verbatim: `Route Claude App launched outside LLMR through LLMR`. Hint, verbatim: `Also applies to launches from the Dock or an account switcher. Claude App then opens in third-party mode, signed out of claude.ai. Only one profile can have this on.` Scope hint for App-surface Claude Code profiles, verbatim: `Applies to the CLI entry. The App entry uses the toggle below.`
- Style per `AGENTS.md`: double quotes, semicolons, alphabetized keys, no comments except a non-obvious why.
- One test file: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/<name>.test.js`; UI: `npm run test:ui`. Commit gate runs typecheck and `npm run test:architecture`.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`; restore with `git checkout --` before committing.

## Review Focus

- A profile saved before this change has no `claudeAppTakeover`; it must stop taking over, and the shared dir written by the previous version must be restored on the first sync (Task 1, the `scope: "global"` case of "leaves a directly opened Claude App alone unless the profile opts in").
- A disabled profile with `claudeAppTakeover: true` must not take over, and neither may a CLI-only one (Task 1).
- A saved config with the flag must still carry it after `loadAppConfig` (Task 2, the round-trip test); this is the gap the first draft of this plan had.
- Saving a second profile with the flag on must clear it on the first, in core and in the UI (Task 3).
- The editor must not show the toggle for Codex or for a CLI-only Claude Code profile, and must keep its value through a surface change to CLI and back to App (Task 4).

---

### Task 1: Gate the shared takeover on the profile toggle

**Files:**
- Modify: `packages/core/src/contracts/app.ts:1522-1554` (add `claudeAppTakeover?: boolean;` between `botGateway` and `configFile`, alphabetical)
- Modify: `packages/core/src/agents/claude-app/gateway-service.ts` (`claudeAppTakesOverDirectLaunches`, the message `NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE`, the why comment above the function, the `isEnabledGlobalProfile` import at line 14)
- Test: `packages/core/test/unit/agents/claude-app-gateway-sync.test.mjs`

**Interfaces:**
- Produces: `claudeAppTakesOverDirectLaunches(profile: Pick<ProfileConfig, "agent" | "claudeAppTakeover" | "enabled" | "surface">): boolean`, exported from `gateway-service.ts`. Later tasks rely on the field name only.
- `NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE` becomes, verbatim: `No enabled claude-code profile routes a directly opened Claude App through LLMR. Turn on "Route Claude App launched outside LLMR through LLMR" on a profile whose Entry mode is App or Auto.` Only `skippedClaudeAppGatewayResult` and this test file read it.

- [ ] **Step 1: Replace the two scope tests with toggle tests and opt the takeover fixtures in**

Replace "sync applies the shared gateway config only for a System default profile" and "sync leaves a directly opened Claude App alone for Only opened from LLMR and custom scopes" with:

```js
test("sync writes the shared gateway config only when the profile opts in", async () => {
  const { BACKUP_FILE, hasClaudeAppEntryProfile, syncClaudeAppGatewayConfig } = await loadModules();
  for (const scope of ["llmr", "global", "custom"]) {
    const synced = await syncClaudeAppGatewayConfig(createConfig({
      profile: { profiles: [claudeCodeProfile({ claudeAppTakeover: true, scope, surface: "auto" })] }
    }));
    assert.equal(hasClaudeAppEntryProfile(synced.config), true, scope);
    const libraryConfig = JSON.parse(readFileSync(claudeAppPaths().configLibraryFile, "utf8"));
    assert.equal(libraryConfig.inferenceProvider, "gateway", scope);
    cleanup(BACKUP_FILE);
  }
});

test("sync leaves a directly opened Claude App alone unless the profile opts in", async () => {
  const { BACKUP_FILE, NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE, hasClaudeAppEntryProfile, syncClaudeAppGatewayConfig } = await loadModules();
  const cases = [
    claudeCodeProfile({ scope: "global", surface: "auto" }),
    claudeCodeProfile({ claudeAppTakeover: false, scope: "global", surface: "app" }),
    claudeCodeProfile({ claudeAppTakeover: true, enabled: false, surface: "auto" }),
    claudeCodeProfile({ claudeAppTakeover: true, surface: "cli" })
  ];
  for (const profile of cases) {
    seedGatewayBackup(BACKUP_FILE);
    const synced = await syncClaudeAppGatewayConfig(createConfig({ profile: { profiles: [profile] } }));
    assert.equal(hasClaudeAppEntryProfile(synced.config), false, JSON.stringify(profile));
    assert.equal(synced.result.message, NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE);
    assert.equal(existsSync(BACKUP_FILE), false);
    assert.equal(JSON.parse(readFileSync(claudeAppPaths().rootConfigFile, "utf8")).deploymentMode, "native");
    cleanup(BACKUP_FILE);
  }
});
```

Add `claudeAppTakeover: true` to the profiles of the four tests that rely on the takeover happening: "sync applies the gateway config for auto, app, and unset surfaces", "sync persists a generated Claude App credential through the credential store", "#1768 restore preserves live library, root preferences and metadata across restarts" and "#1768 restore removes absent takeover keys while preserving newly created preferences".

- [ ] **Step 2: Run the file to verify the two new tests fail**

Run: `node build/test.mjs core && node --test --test-reporter=tap .test-dist/core/test/unit/agents/claude-app-gateway-sync.test.js`
Expected: `not ok` for both new tests (the first fails on the `llmr` and `custom` scopes, the second on the `scope: "global"` case, since the PR 48 gate still reads scope); the rest pass.

- [ ] **Step 3: Add the field and change the gate**

In `app.ts` add `claudeAppTakeover?: boolean;`. In `gateway-service.ts` make `claudeAppTakesOverDirectLaunches` return `profile.enabled && profile.agent === "claude-code" && profile.surface !== "cli" && profile.claudeAppTakeover === true`, drop `isEnabledGlobalProfile` from the import, replace the message, and rewrite the why comment to say the shared dir is read by every launch so only an explicit opt-in may write it.

- [ ] **Step 4: Run the file and typecheck**

Run: the Step 2 command, then `npm run typecheck`
Expected: all `ok`; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/contracts/app.ts packages/core/src/agents/claude-app/gateway-service.ts packages/core/test/unit/agents/claude-app-gateway-sync.test.mjs
git commit -m "feat(claude-app): take over direct Claude App launches only when the profile opts in"
```

### Task 2: Carry the field through the core loader

**Files:**
- Modify: `packages/core/src/config/config.ts` (the `agent === "claude-code"` return inside `parseProfiles`, about line 3658; mirror the `managedCompact` spread)
- Test: create `packages/core/test/unit/config/profile-claude-app-takeover.test.mjs`, following the temporary-home pattern of `profile-legacy-sync.test.mjs` in the same directory

**Interfaces:**
- Consumes: `ProfileConfig.claudeAppTakeover` from Task 1.
- Produces: `loadAppConfig()` returns `claudeAppTakeover: true` for a claude-code profile saved with it and omits the key otherwise.

- [ ] **Step 1: Write the failing round-trip test**

```js
test("claudeAppTakeover survives a save and reload of the config", async () => {
  // saveAppConfig with one claude-code profile { claudeAppTakeover: true, surface: "app" } and one without
  const config = await loadAppConfig();
  assert.equal(config.profile.profiles[0].claudeAppTakeover, true);
  assert.equal("claudeAppTakeover" in config.profile.profiles[1], false);
});
```

- [ ] **Step 2: Run to verify it fails**

Expected: `not ok` (`undefined !== true`, the loader drops the key).

- [ ] **Step 3: Thread the field**

Add `...(item.claudeAppTakeover === true ? { claudeAppTakeover: true } : {})` to the claude-code return in `parseProfiles`.

- [ ] **Step 4: Run to verify it passes, then commit**

```bash
git add packages/core/src/config/config.ts packages/core/test/unit/config
git commit -m "feat(config): load the Claude App takeover flag"
```

### Task 3: One opted-in profile at a time

**Files:**
- Modify: `packages/core/src/contracts/app.ts:1569-1591` (`enforceSingleEnabledGlobalProfilePerAgent`)
- Test: create `packages/core/test/unit/contracts/single-claude-app-takeover.test.mjs` (no core test exercises `enforceSingleEnabledGlobalProfilePerAgent` directly today; `config-concurrency.test.mjs` and `profile-legacy-sync.test.mjs` only go through it)

**Interfaces:**
- Consumes: `ProfileConfig.claudeAppTakeover`.
- Produces: `enforceSingleEnabledGlobalProfilePerAgent(profiles, preferredIndex?)` keeps its signature and, in the same pass, leaves `claudeAppTakeover: true` on at most one enabled claude-code profile: the preferred index when it carries the flag, else the first that does. Every other profile gets the key removed. The seven existing call sites in core and UI change nothing.

- [ ] **Step 1: Write the failing test**

```js
test("enforceSingleEnabledGlobalProfilePerAgent keeps the Claude App takeover on one profile", () => {
  const a = claudeCodeProfile({ claudeAppTakeover: true, id: "a" });
  const b = claudeCodeProfile({ claudeAppTakeover: true, id: "b" });
  assert.deepEqual(enforceSingleEnabledGlobalProfilePerAgent([a, b]).map((p) => p.claudeAppTakeover), [true, undefined]);
  assert.deepEqual(enforceSingleEnabledGlobalProfilePerAgent([a, b], 1).map((p) => p.claudeAppTakeover), [undefined, true]);
  const disabled = claudeCodeProfile({ claudeAppTakeover: true, enabled: false, id: "c" });
  assert.deepEqual(enforceSingleEnabledGlobalProfilePerAgent([disabled, b]).map((p) => p.claudeAppTakeover), [true, true]);
});
```

The disabled case shows the rule only counts enabled profiles; a disabled profile keeps its flag so re-enabling it later clears the other one.

- [ ] **Step 2: Run to verify it fails**, then **Step 3: implement** (a second map keyed on `claudeAppTakeover === true && enabled && agent === "claude-code"`, same preferred-index logic as the scope map, removing the key with a destructuring rest), then **Step 4: run, `npm run typecheck`, commit**

```bash
git add packages/core/src/contracts/app.ts packages/core/test/unit/contracts
git commit -m "feat(profiles): keep the Claude App takeover on one profile"
```

### Task 4: Profile editor toggle

**Files:**
- Modify: `packages/ui/src/pages/home/shared/profiles.ts` (the draft type near line 540 and `createProfileDraft` defaults at 548-557; `createProfileDraftFromProfile` claude-code branch at 601 and the generic branch at 643; `profileConfigFromDraft` at 741; `normalizeProfileItem` claude-code branch near 1396-1420; `normalizeUnknownProfileItem` near 1588; the summary items near 1297 if the toggle should show in the profile card. Mirror `managedCompact` at each spot.)
- Modify: `packages/ui/src/pages/home/components/profiles.tsx` (the Effect scope field at 828-837 gains the scope hint for `draft.agent === "claude-code" && draft.surface !== "cli"`; the toggle renders as a new `Field` directly after the Entry mode field at 838, not inside Advanced settings)
- Test: `packages/ui/test/component/profiles.test.tsx`

**Interfaces:**
- Consumes: `ProfileConfig.claudeAppTakeover` from Task 1.
- Produces: draft field `claudeAppTakeover: boolean` (default `false`); `profileConfigFromDraft` writes `claudeAppTakeover: true` only for `agent === "claude-code"` with `surface !== "cli"` and omits it otherwise; both normalizers carry a `true` through and drop anything else.

- [ ] **Step 1: Write the failing component tests**

Following the file's `renderToStaticMarkup` pattern and the APP_PATH test's `mode="edit"` props:

```tsx
test("Claude Code App profiles expose the direct-launch takeover toggle next to Entry mode", () => {
  const html = renderAddProfileForm({ ...createProfileDraft("claude-code"), surface: "app" });
  assert.match(html, /Route Claude App launched outside LLMR through LLMR/);
  assert.match(html, /Only one profile can have this on/);
  assert.match(html, /Applies to the CLI entry/);
  assert.ok(html.indexOf("Route Claude App launched outside LLMR") < html.indexOf("Advanced settings"));
  assert.doesNotMatch(renderAddProfileForm({ ...createProfileDraft("claude-code"), surface: "cli" }), /Route Claude App launched outside LLMR/);
  assert.doesNotMatch(renderAddProfileForm({ ...createProfileDraft("codex"), surface: "app" }), /Route Claude App launched outside LLMR/);
});

test("the takeover toggle round-trips through the stored profile and survives a surface change", () => {
  const draft = { ...createProfileDraft("claude-code"), claudeAppTakeover: true, surface: "auto" };
  const stored = profileConfigFromDraft(draft, ...);
  assert.equal(stored.claudeAppTakeover, true);
  assert.equal("claudeAppTakeover" in profileConfigFromDraft({ ...draft, claudeAppTakeover: false }, ...), false);
  assert.equal("claudeAppTakeover" in profileConfigFromDraft({ ...draft, surface: "cli" }, ...), false);
  assert.equal(createProfileDraftFromProfile(stored).claudeAppTakeover, true);
  assert.equal(normalizeUnknownProfileItem({ ...stored, claudeAppTakeover: "yes" }, 0)?.claudeAppTakeover, undefined);
});
```

`renderAddProfileForm(draft)` is a local helper that renders `AddProfileForm` with `mode="edit"` and the fixture props the APP_PATH test uses; `profileConfigFromDraft`'s remaining arguments are whatever that file's other callers pass. The surface-change case is the draft keeping `claudeAppTakeover: true` while `surface` is `cli`: the editor keeps the draft value, the stored profile omits it, and switching back to App shows the toggle on again.

- [ ] **Step 2: Run the UI tests to verify they fail**

Run: `npm run test:ui`
Expected: the two new tests fail (toggle text absent; `claudeAppTakeover` undefined).

- [ ] **Step 3: Thread the field and render the toggle**

In `shared/profiles.ts` add `claudeAppTakeover: boolean` to the draft, default `false`, read `Boolean(profile.claudeAppTakeover)` in both draft constructors, write `...(draft.agent === "claude-code" && draft.surface !== "cli" && draft.claudeAppTakeover ? { claudeAppTakeover: true } : {})` in `profileConfigFromDraft`, and `...(profile.claudeAppTakeover === true ? { claudeAppTakeover: true } : {})` in both normalizers' claude-code branches. In `profiles.tsx` render, after the Entry mode `Field` and only for `draft.agent === "claude-code" && draft.surface !== "cli"`, a `Field` with the label, a `Toggle checked={draft.claudeAppTakeover} onChange={(claudeAppTakeover) => onChange({ claudeAppTakeover })}` and a `ProfileFieldHint` with the hint; add the scope `ProfileFieldHint` under the Effect scope select for the same condition.

- [ ] **Step 4: Run the UI tests and typecheck**

Run: `npm run test:ui && npm run typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/pages/home/shared/profiles.ts packages/ui/src/pages/home/components/profiles.tsx packages/ui/test/component/profiles.test.tsx
git commit -m "feat(ui): toggle for routing a directly opened Claude App through LLMR"
```

### Task 5: Launch paths, docs, release note

**Files:**
- Confirm: `packages/core/src/profiles/launch-service.ts:357` and `packages/cli/src/cli.ts:210` (the `claudeAppTakesOverDirectLaunches(profile)` guards read the new field through Task 1; no code change)
- Test: create `packages/core/test/unit/profiles/claude-app-launch-without-takeover.test.mjs` (no core test calls `openClaudeAppProfile` today; one assertion that `openClaudeAppProfile` for a profile without the flag writes the per-profile data dir and leaves the shared `rootConfigFile` untouched)
- Modify: `docs/src/content/docs/en/configuration/agents/claude-code.md` (Effect scope row at 42, a new field row after "Bot" at 52, the troubleshooting lines at 95 and 98)
- Modify: `docs/src/content/docs/en/configuration/profiles.md` (Effect scope row at 32, Claude Code per-agent table after "Bot" at 49)
- Modify: `README.md` upgrade notes (the section holding "5.0 is a clean reinstall", line 180)

**Interfaces:**
- Consumes: `claudeAppTakesOverDirectLaunches` from Task 1.

- [ ] **Step 1: Add the launch test, run it, and confirm the guards**

The test seeds a claude-code profile with `surface: "app"` and no flag, calls `openClaudeAppProfile`, and asserts the shared root config file is absent or still `deploymentMode: "native"` while the per-profile user data dir exists. Expected: PASS without code changes.

- [ ] **Step 2: Docs**

`claude-code.md` field table, new row: `| Route Claude App launched outside LLMR through LLMR | Toggle (App entry only), default off | Writes LLMR's third-party configuration where Claude App reads it at every launch, so a launch from the Dock or an account switcher also opens in third-party mode, signed out of claude.ai. Only one profile can have it on. Leave it off to keep those launches on the normal app; the play button works either way. |`

`claude-code.md:42` Effect scope row: append `Applies to the CLI entry; the App entry uses the toggle below.`

`claude-code.md:95`: `- **Requests do not reach LLMR:** confirm the profile is **Enabled** and you opened Claude Code from LLMR (not from the system). A directly-opened Claude Code CLI is not affected unless the scope is **System default**; a directly-opened Claude App is not affected unless **Route Claude App launched outside LLMR through LLMR** is on.`

`claude-code.md:98`: `- **Claude App opens signed out of claude.ai, with LLM Router as its gateway:** a profile's **Route Claude App launched outside LLMR through LLMR** toggle is on, or LLM Router did not quit cleanly and has not started since. Turn the toggle off, or start LLM Router once, to put Dock and account-switcher launches back on the normal app.`

`profiles.md:32` Effect scope row: append `For a Claude Code App entry, use the profile's takeover toggle instead.`

`profiles.md` Claude Code table, new row: `| Route Claude App launched outside LLMR through LLMR | Off by default. On, Claude App opened from the Dock or an account switcher also runs through LLMR in third-party mode, signed out of claude.ai. One profile at a time. |`

README upgrade notes, one line: `Profiles no longer route a Claude App opened from the Dock through LLMR unless you turn on "Route Claude App launched outside LLMR through LLMR".` The same line goes into the GitHub release notes through `gh release edit --notes-file` after `npm run release -- minor`.

- [ ] **Step 3: Run the rename guard, architecture tests and docs build**

Run: `node scripts/llmr-rename.mjs --check all && npm run test:architecture && npm --prefix docs run build`
Expected: `0 residual lines`, architecture all pass, docs build complete.

- [ ] **Step 4: Full suites**

Run: `npm run test:core && npm run test:ui && npm run test:cli && npm run test:electron`
Expected: all pass. Restore `packages/core/models.json` and `packages/ui/src/generated` with `git checkout --` if a build rewrote them.

- [ ] **Step 5: Commit and update PR 48**

```bash
git add packages/core/test/unit/profiles docs/src/content/docs/en/configuration/agents/claude-code.md docs/src/content/docs/en/configuration/profiles.md README.md
git commit -m "docs: the Claude App direct-launch takeover toggle"
git push -u origin HEAD
```

Then retitle PR 48 to `feat(claude-app): opt-in toggle for taking over direct Claude App launches` and replace its body with the spec's Change 1 summary and this plan's test commands. The release that ships it is a minor bump (`npm run release -- minor`) with the README line in the notes.
