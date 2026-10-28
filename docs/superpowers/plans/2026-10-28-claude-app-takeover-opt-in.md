# Claude App Takeover Opt-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLMR writes the shared `Claude-3p` takeover only for a profile whose operator turned on an explicit toggle, so a Claude App launched outside LLMR is the normal signed-in app by default.

**Architecture:** One optional boolean on `ProfileConfig` gates the shared-dir write in the three places that make it (startup sync, profile launch, CLI). The per-profile data dir write is untouched. The profile editor exposes the toggle for App-capable Claude Code profiles. Builds on branch `fix/claude-app-takeover-honors-scope` (PR 48), which already centralized the gate in `claudeAppTakesOverDirectLaunches`.

**Tech Stack:** TypeScript under `packages/core`, React under `packages/ui`, `node:test` with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-10-28-claude-app-opt-in-and-claude-code-token-refresh.md`, Change 1.

## Global Constraints

- Branch from `fix/claude-app-takeover-honors-scope` (PR 48 head 691bf99d), not from `main`.
- Field name, verbatim: `claudeAppTakeover`. Toggle label, verbatim: `Route Claude App launched outside LLMR through LLMR`. Hint, verbatim: `Also applies to launches from the Dock or an account switcher. Claude App then opens in third-party mode, signed out of claude.ai.`
- Style per `AGENTS.md`: double quotes, semicolons, alphabetized keys, no comments except a non-obvious why.
- One test file: `node build/test.mjs core && node --test .test-dist/core/test/unit/agents/<name>.test.js`; UI: `npm run test:ui`. Commit gate runs typecheck and `npm run test:architecture`.
- `npm run build:assets` and `npm run test:e2e` rewrite `packages/core/models.json` and `packages/ui/src/generated`; restore with `git checkout --` before committing.

## Review Focus

- A profile saved before this change has no `claudeAppTakeover`; it must stop taking over, and the shared dir written by the previous version must be restored on the first sync (Task 1 test "absent field restores the shared dir").
- A disabled profile with `claudeAppTakeover: true` must not take over (Task 1).
- A CLI-only profile with `claudeAppTakeover: true` must not take over (Task 1).
- The editor must not show the toggle for Codex or for a CLI-only Claude Code profile, and must keep its value through a surface change back to App (Task 2).
- Turning the toggle off while LLMR runs must restore the shared dir on the next sync without a quit (Task 1, covered by the no-entry branch; assert `deploymentMode` reverts).

---

### Task 1: Gate the shared takeover on the profile toggle

**Files:**
- Modify: `packages/core/src/contracts/app.ts:1522-1554` (add `claudeAppTakeover?: boolean;` between `botGateway` and `configFile`, alphabetical)
- Modify: `packages/core/src/agents/claude-app/gateway-service.ts` (`claudeAppTakesOverDirectLaunches`, the message `NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE`, the why comment above the function)
- Test: `packages/core/test/unit/agents/claude-app-gateway-sync.test.mjs`

**Interfaces:**
- Produces: `claudeAppTakesOverDirectLaunches(profile: Pick<ProfileConfig, "agent" | "claudeAppTakeover" | "enabled" | "surface">): boolean`, exported from `gateway-service.ts`. Tasks 2 and 3 rely on the field name only.
- `NO_CLAUDE_APP_ENTRY_PROFILE_MESSAGE` becomes, verbatim: `No enabled claude-code profile routes a directly opened Claude App through LLMR. Turn on "Route Claude App launched outside LLMR through LLMR" on a profile whose Entry mode is App or Auto.`

- [ ] **Step 1: Replace the two scope tests with toggle tests**

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

Also change the existing test "sync applies the gateway config for auto, app, and unset surfaces" so its profiles pass `claudeAppTakeover: true`.

- [ ] **Step 2: Run the file to verify the two new tests fail**

Run: `node build/test.mjs core && node --test --test-reporter=tap .test-dist/core/test/unit/agents/claude-app-gateway-sync.test.js`
Expected: `not ok` for "leaves a directly opened Claude App alone unless the profile opts in" (the `scope: "global"` case takes over), the rest pass.

- [ ] **Step 3: Add the field and change the gate**

In `app.ts` add `claudeAppTakeover?: boolean;`. In `gateway-service.ts` make `claudeAppTakesOverDirectLaunches` return `profile.enabled && profile.agent === "claude-code" && profile.surface !== "cli" && profile.claudeAppTakeover === true`, drop the `isEnabledGlobalProfile` import if unused, replace the message, and rewrite the why comment to say the shared dir is read by every launch so only an explicit opt-in may write it.

- [ ] **Step 4: Run the file and typecheck**

Run: the Step 2 command, then `npm run typecheck`
Expected: all `ok`; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/contracts/app.ts packages/core/src/agents/claude-app/gateway-service.ts packages/core/test/unit/agents/claude-app-gateway-sync.test.mjs
git commit -m "feat(claude-app): take over direct Claude App launches only when the profile opts in"
```

### Task 2: Profile editor toggle

**Files:**
- Modify: `packages/ui/src/pages/home/shared/profiles.ts` (the draft type near line 540, the draft defaults near 548-557, profile-to-draft near 643-648, draft-to-profile near 741-750, and the stored-profile parser near 1588-1614; mirror `managedCompact` at each spot)
- Modify: `packages/ui/src/pages/home/components/profiles.tsx:1016-1031` (render the toggle inside the existing `draft.surface !== "cli"` block, above `BotGatewaySelectForm`, only when `draft.agent === "claude-code"`)
- Test: `packages/ui/test/component/profiles.test.tsx`

**Interfaces:**
- Consumes: `ProfileConfig.claudeAppTakeover` from Task 1.
- Produces: draft field `claudeAppTakeover: boolean` (default `false`); the saved profile carries `claudeAppTakeover` only when `true` (omit when false, so stored configs stay minimal).

- [ ] **Step 1: Write the failing component test**

In `profiles.test.tsx`, following the file's `renderToStaticMarkup` pattern and its existing profile fixtures:

```tsx
test("Claude Code App profiles expose the direct-launch takeover toggle", () => {
  const app = renderToStaticMarkup(<ProfileEditorForm {...editorProps({ agent: "claude-code", surface: "app" })} />);
  assert.match(app, /Route Claude App launched outside LLMR through LLMR/);
  assert.match(app, /Also applies to launches from the Dock or an account switcher/);
  const cli = renderToStaticMarkup(<ProfileEditorForm {...editorProps({ agent: "claude-code", surface: "cli" })} />);
  assert.doesNotMatch(cli, /Route Claude App launched outside LLMR/);
  const codex = renderToStaticMarkup(<ProfileEditorForm {...editorProps({ agent: "codex", surface: "app" })} />);
  assert.doesNotMatch(codex, /Route Claude App launched outside LLMR/);
});

test("the takeover toggle round-trips through the stored profile", () => {
  const stored = profileFromDraft(createProfileDraft({ agent: "claude-code", claudeAppTakeover: true, surface: "auto" }));
  assert.equal(stored.claudeAppTakeover, true);
  assert.equal("claudeAppTakeover" in profileFromDraft(createProfileDraft({ agent: "claude-code", surface: "auto" })), false);
  assert.equal(draftFromProfile(stored).claudeAppTakeover, true);
});
```

Use the component and helper names the file already imports (the editor component, the draft constructor, `profileFromDraft`/`draftFromProfile` or their actual names in `shared/profiles.ts`); the plan fixes the behaviour, the file fixes the names.

- [ ] **Step 2: Run the UI tests to verify they fail**

Run: `npm run test:ui`
Expected: the two new tests fail (toggle text absent; `claudeAppTakeover` undefined).

- [ ] **Step 3: Thread the field and render the toggle**

In `shared/profiles.ts` add `claudeAppTakeover: boolean` to the draft, default `false`, read `Boolean(profile.claudeAppTakeover)` into the draft, and write `...(draft.claudeAppTakeover ? { claudeAppTakeover: true } : {})` into the profile. In `profiles.tsx` render, for `draft.agent === "claude-code"` inside the `surface !== "cli"` block, the same bordered row as "Show all sessions" with the label and a `Toggle checked={draft.claudeAppTakeover} onChange={(claudeAppTakeover) => onChange({ claudeAppTakeover })}`, plus a `ProfileFieldHint` carrying the hint text.

- [ ] **Step 4: Run the UI tests and typecheck**

Run: `npm run test:ui && npm run typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/pages/home/shared/profiles.ts packages/ui/src/pages/home/components/profiles.tsx packages/ui/test/component/profiles.test.tsx
git commit -m "feat(ui): toggle for routing a directly opened Claude App through LLMR"
```

### Task 3: Launch paths, docs, release note

**Files:**
- Modify: `packages/core/src/profiles/launch-service.ts` (the `claudeAppTakesOverDirectLaunches(profile)` guard around the shared `applyClaudeAppGatewayConfig` call in `openClaudeAppProfile`; no code change expected, confirm the guard reads the new field through Task 1)
- Modify: `packages/cli/src/cli.ts` (same guard, same confirmation)
- Modify: `docs/src/content/docs/en/configuration/agents/claude-code.md` (field table row after "Bot"; the troubleshooting entry added by PR 48)
- Modify: `docs/src/content/docs/en/configuration/profiles.md` (Claude Code per-agent table)
- Modify: `README.md` upgrade notes section (the one that holds "5.0 is a clean reinstall")

**Interfaces:**
- Consumes: `claudeAppTakesOverDirectLaunches` from Task 1.

- [ ] **Step 1: Add the docs rows and reword the troubleshooting entry**

`claude-code.md` field table: `| Route Claude App launched outside LLMR through LLMR | Toggle (App entry only), default off | Writes LLMR's third-party configuration where Claude App reads it at every launch, so a launch from the Dock or an account switcher also opens in third-party mode, signed out of claude.ai. Leave it off to keep those launches on the normal app; the play button works either way. |`

`profiles.md` Claude Code table: `| Route Claude App launched outside LLMR through LLMR | Off by default. On, Claude App opened from the Dock or an account switcher also runs through LLMR in third-party mode, signed out of claude.ai. |`

Troubleshooting entry: replace the PR 48 line with `- **Claude App opens signed out of claude.ai, with LLM Router as its gateway:** the profile's **Route Claude App launched outside LLMR through LLMR** toggle is on. Turn it off to keep Dock and account-switcher launches on the normal app.`

README upgrade note, one line under the existing upgrade notes: `Profiles no longer route a Claude App opened from the Dock through LLMR unless you turn on "Route Claude App launched outside LLMR through LLMR".`

- [ ] **Step 2: Run the rename guard, architecture tests and docs build**

Run: `node scripts/llmr-rename.mjs --check all && npm run test:architecture && npm --prefix docs run build`
Expected: `0 residual lines`, architecture all pass, docs build complete.

- [ ] **Step 3: Full suites**

Run: `npm run test:core && npm run test:ui && npm run test:cli && npm run test:electron`
Expected: all pass. Restore `packages/core/models.json` and `packages/ui/src/generated` with `git checkout --` if a build rewrote them.

- [ ] **Step 4: Commit and update PR 48**

```bash
git add docs/src/content/docs/en/configuration/agents/claude-code.md docs/src/content/docs/en/configuration/profiles.md README.md
git commit -m "docs: the Claude App direct-launch takeover toggle"
git push -u origin HEAD
```

Then retitle PR 48 to `feat(claude-app): opt-in toggle for taking over direct Claude App launches` and replace its body with the spec's Change 1 summary and this plan's test commands. The release that ships it is a minor bump (`npm run release -- minor`) with the README line in the notes.
