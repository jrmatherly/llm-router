# Remove Claude Design and Claude Ship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLMR ships without the Claude Design and Claude Ship plugins, with no dead code left behind, and with a written map of what a future LLMR-owned design surface would reuse from `v6.1.0`.

**Architecture:** One removal PR deletes the two bundled plugins, the Electron window that intercepts their traffic, the Claude App "force-open Design over CDP" path that existed only to serve them, and every branch that exists only for them in core, the CLI, the Electron main process and the UI. Intermediate commits inside that PR need not typecheck; the PR as a whole does. A second, behavior-preserving PR renames the routing-rule editor that Claude Design shared with the cursor-proxy plugin to a plugin-neutral name. Nothing is kept on `main` "for later". The reuse map in Appendix B points at symbols in `v6.1.0`, which Git already preserves.

**Tech Stack:** TypeScript in `packages/core`, `packages/cli`, `packages/electron`, `packages/ui`; `node:test` with `node:assert/strict`; esbuild; Astro docs.

**Spec:** `private/findings/2026-10-29-claude-design-replacement-research.md` (git-ignored, on the operator's machine). The facts an executor needs are copied into Global Constraints and Appendix B, so the plan stands on its own.

## Global Constraints

- Base: `main` at `387878ca` (tag `v6.1.0`). Every line number in this plan is against that commit and was checked by two reviewers on 2026-10-29. Re-grep before editing if `main` moved.
- Delete, never stub. After PR 1, `grep -rniE 'claude[- ]design|claude[- ]ship|ccrdesk|CLAUDE_DESIGN|CLAUDE_SHIP' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.test-dist --exclude-dir=.git --exclude-dir=.claude --exclude-dir=private .` prints hits only in these places: `tests/architecture/readme-identity.test.mjs:5` (the guard regex that forbids the upstream host in the README), `docs/superpowers/plans/completed/*`, `docs/superpowers/specs/*` (history), and this plan.
- Root `tsconfig.json` sets `noUnusedLocals` and `noUnusedParameters`, so every deletion also removes the imports, locals and parameters it orphans. The tasks name the ones the reviewers found; the typecheck catches the rest.
- The generic plugin host stays untouched: `bundled-plugins/new-api-account`, `copyBundledClaudeRuntimePlugins` in `build/esbuild.config.mjs`, `windowsManager.openPluginAppWindow`, `deepLinkService.openPluginApp`, the `apps` surface, `ctx.openSqliteStore`, `ctx.registerProxyRoute`, and the `cursor-proxy` known defaults and routing UI.
- The cursor-proxy plugin keeps working. The routing-rule editor (`packages/ui/src/pages/home/shared/routing.ts`, `shared/types.ts:259-275`, `components/extensions.tsx` `ConfigureClaudeDesignDialog`, `dialog-stack.tsx:38,73`) is shared with it and is renamed in PR 2, not deleted. Its two user-visible string defaults change in PR 1.
- A saved config that still carries a `plugins[]` entry with id `claude-design` or `claude-ship`, or a profile with `agent: "claude-design"`, loads without an error, drops that entry, and writes the config back without it on the next save. No "Disabled after startup failure" line on gateway start.
- The `LLMR_CLAUDE_APP_DESIGN_CDP` env var and the CDP port on the Claude desktop app go away with `packages/core/src/agents/claude-app/cdp.ts`. Nothing outside `launch.ts` reads the port (reviewers grepped `cdpPort` across `packages/*/src`), the var is undocumented, and its only purpose was to force-open Claude Design inside the Claude app.
- Style per `AGENTS.md`. The commit gate runs typecheck and `npm run test:architecture`. `packages/core/models.json` and `packages/ui/src/generated` are restored with `git checkout --` after any `npm run build:assets`.
- Docs rule: this plan and the user-docs edits in Task 6 are the only writes under `docs/`.
- Release: removing a shipped feature is a breaking change under this repo's semver use. The release after PR 1 is a major (`v7.0.0`) unless the operator decides otherwise. Its notes carry an "Upgrading to 7.0" header that says the Claude Design and Claude Ship plugins, the Claude Design profile agent and the `LLMR_CLAUDE_APP_DESIGN_CDP` variable are gone, that saved entries are dropped on first load, and that `~/.llm-router/claude-design.sqlite` and `claude-ship.sqlite` are left in place for the user to delete.

## Review Focus

1. A user upgrading with a `claude-design` profile still in `config.sqlite`. Expected: the app starts, Agent Config shows the other profiles, no log noise. Pinned in Task 2.
2. A user upgrading with the plugin entries still in `plugins[]`. Expected: no `[plugin:claude-design] Disabled after startup failure` on gateway start, and the Extensions page lists only real plugins. Pinned in Task 2.
3. A user with a cursor-proxy plugin configured. Expected: its "Configure routing" dialog still opens and saves rules. Pinned in Task 7 (live) and Task 8 (unit).
4. The `llmr://plugin/claude-design/open` deep link from an old bookmark. Expected: the existing generic path at `deep-link.ts:131` throws "Plugin app is not configured or enabled: claude-design", the catch at 158-166 logs it, shows the "Failed to open LLMR plugin app" error box, and brings up the main window. No crash, no special case added. Pinned in Task 7.
5. Old request-log rows that only the removed text match identified as Claude Design. The agent is inferred on every read (`request-log-store.ts:1978`), never stored. Expected: such a row re-infers as `claude-code` when it carries the Claude Code session header, otherwise as `unknown` and renders as "Unknown"; a saved agent filter of `claude-design` falls back to "all". Pinned in Task 2.

---

### Task 1: Delete the dedicated files and the build and guard entries that name them

**Files:**
- Delete: `packages/electron/bundled-plugins/claude-design/` (`index.cjs`, `plugin.json`, `README.md`)
- Delete: `packages/electron/bundled-plugins/claude-ship/` (`index.cjs`, `plugin.json`, `README.md`)
- Delete: `packages/electron/src/main/claude-design-window.ts`
- Delete: `packages/electron/src/main/plugin-app-url.ts`
- Delete: `packages/electron/test/unit/claude-design-chat.test.ts`, `claude-design-plugin-assets.test.ts`, `claude-design-window.test.ts`, `plugin-app-url.test.ts`
- Modify: `build/esbuild.config.mjs:51`
- Modify: `build/test.mjs:14,49-52`
- Modify: `scripts/llmr-rename.mjs:39-52,88-90`
- Modify: `tests/architecture/llmr-rename.test.mjs:41,70`

**Interfaces:**
- Produces: `bundledClaudeRuntimePluginIds` is `["new-api-account"]`. The `kept` array in `scripts/llmr-rename.mjs` has no `ccrdesk.top` entry and names only files that still exist.

- [ ] **Step 1: Delete the files**

```bash
git rm -r packages/electron/bundled-plugins/claude-design packages/electron/bundled-plugins/claude-ship \
  packages/electron/src/main/claude-design-window.ts packages/electron/src/main/plugin-app-url.ts \
  packages/electron/test/unit/claude-design-chat.test.ts packages/electron/test/unit/claude-design-plugin-assets.test.ts \
  packages/electron/test/unit/claude-design-window.test.ts packages/electron/test/unit/plugin-app-url.test.ts
```

- [ ] **Step 2: Set `bundledClaudeRuntimePluginIds` in `build/esbuild.config.mjs:51` to `["new-api-account"]`**

`copyBundledClaudeRuntimePlugin` throws when a listed plugin's `index.cjs` is missing (`esbuild.config.mjs:279-281`), so this edit lands in the same commit as the deletion. `electron-builder.json` packages `dist/bundled-plugins/**` as a whole, so this list is the only gate.

- [ ] **Step 3: Remove the `claude-design` `testDirs` entry at `build/test.mjs:49-52` and the `llmrExtensionsRoot` constant at line 14 it alone used**

The entry points at a sibling checkout path, which `AGENTS.md` says nothing depends on.

- [ ] **Step 4: Delete the `ccrdesk.top` entry from `kept` in `scripts/llmr-rename.mjs` and repoint the two fixtures that relied on it**

Delete the whole entry at lines 39-52 (every one of its nine `at` paths is deleted or loses the text in Tasks 2 and 5, and the guard at `llmr-rename.test.mjs:73-80` rejects an entry with an empty list). Delete the three `path:` entries at lines 88-90 that name `claude-design/index.cjs` and `claude-design-plugin-assets.test.ts`. Keep the `readme-identity.test.mjs` entry.

`mask()` at `llmr-rename.mjs:187-194` hides kept text from `renameText` and `residue`, and the fixtures at `llmr-rename.test.mjs:41` and `:70` test that masking with `ccrdesk.top`. Rewrite both to use `aff=ccr`, which stays kept globally: line 41 becomes `renameText("\"https://example.test/?aff=ccr\"", ["rest"])` expecting the same string back, and line 70 becomes `residue("ok\nx-ccr-route\naff=ccr", ["rest"], "f.ts")` expecting `["f.ts:2: x-ccr-route"]`.

- [ ] **Step 5: Run the architecture guard**

Run: `npm run test:architecture`
Expected: PASS. Typecheck and the other suites fail until Tasks 2 to 5, which is planned (Appendix A shows the three import errors).

- [ ] **Step 6: Commit**

```bash
git commit -m "chore(claude-design): delete the Claude Design and Claude Ship plugins"
```

### Task 2: Remove the plugin ids, the profile agent, the migrations and the Claude App design opener from core and the CLI

**Files:**
- Modify: `packages/core/src/contracts/app.ts:854-868,905-912,929-939,1486,2363`
- Modify: `packages/core/src/plugins/service.ts:19-20,28,279-281,1310-1316,1320`
- Modify: `packages/core/src/config/config.ts:18,22,2702-2745,2799-3108,3110,3131-3133,3645-3646,3702-3714,3839-3840,3880-3881,3897-3898`
- Modify: `packages/core/src/profiles/service.ts:236-237,400-401,411-419,954,3605-3606,4404-4406,4419-4420`
- Modify: `packages/core/src/profiles/launch-core.ts:53,81,112-114,348-349`
- Modify: `packages/core/src/profiles/launch-service.ts:112-114,131-133`
- Modify: `packages/core/src/observability/request-log-store.ts:2050-2052,4220,4224,4231-4233`
- Modify: `packages/core/src/agents/claude-app/launch.ts:7,61-63,82,90-95,112-128` and `claudeElectronArgs`
- Delete: `packages/core/src/agents/claude-app/cdp.ts`
- Delete: `packages/core/test/unit/agents/claude-app-cdp.test.mjs`
- Modify: `packages/cli/src/cli.ts:147-149,323-325`
- Test: `packages/core/test/unit/config/plugin-config-migration.test.mjs`
- Test: `packages/core/test/unit/config/config-credential-writes.test.mjs`
- Test: `packages/core/test/integration/observability/request-log-store.test.mjs` (the agent-analysis case around line 1333 asserts an inferred agent through the public store API; `inferAgentKind` itself is private)

**Interfaces:**
- Produces: `ProfileClientKind` and `AgentKind` without `"claude-design"`. `knownGatewayPluginDefaultApps` no longer exists; `knownGatewayPluginDefaultPermissions` and `knownGatewayPluginDefaultSurfaces` keep their signatures and serve `cursor-proxy`. `migrateKnownGatewayPluginConfigs(plugins: GatewayPluginConfig[] | undefined): GatewayPluginMigrationResult` (config.ts:2704, private, exposed as `migrateKnownGatewayPluginConfigsForTest` at 3169) drops any entry whose id is `claude-design` or `claude-ship` and reports `changed: true` when it did. `parseProfiles` (3621) already drops a profile whose agent does not parse (3631-3634); removing the id from `parseProfileAgent` is what makes `claude-design` fall into that path. `launchClaudeAppProfile` no longer reserves a CDP port. These no longer exist: `withClaudeDesignRuntimePluginConfig`, `withClaudeShipRuntimePluginConfig`, `withClaudeProductRuntimePluginConfig`, `claudeProductRuntimePluginConfig`, `claudeDesignRuntimePluginConfig`, `claudeShipRuntimePluginConfig`, `resolveBundledRuntimePluginModule`, `isDesktopOnlyClaudeBrowserPlugin`, `pluginAvailableInCurrentRuntime`, `applyClaudeDesignProfile`, and every export of `cdp.ts`.

- [ ] **Step 1: Write the failing tests**

Replace the Claude Design and Claude Ship cases in `plugin-config-migration.test.mjs` (lines 10-200) with this case. Keep the cursor-proxy case at 204-244 and the `writePluginModule` helper and fs imports it uses; drop `LLMR_DESKTOP_APP_ENV`, `withDesktopRuntime` and the three deleted function imports from lines 6-8.

```js
test("stale Claude Design and Claude Ship plugin entries are dropped on load", () => {
  const result = migrateKnownGatewayPluginConfigsForTest([
    { enabled: true, id: "claude-design", module: "/gone/index.cjs" },
    { enabled: true, id: "claude-ship", module: "/gone/index.cjs" },
    { enabled: true, id: "cursor-proxy" }
  ]);
  assert.equal(result.changed, true);
  assert.deepEqual(result.plugins.map((plugin) => plugin.id), ["cursor-proxy"]);
});
```

Add this case to `config-credential-writes.test.mjs`, next to the test at line 60. `configApi.saveAppConfig(config)` is the whole-config save (used at line 23). It parses the config through the same `parseProfiles` the load path uses, so the read-back proves the drop on both.

```js
test("a saved claude-design profile is dropped without an error", async () => {
  const stale = await configApi.loadAppConfig();
  await configApi.saveAppConfig({ ...stale, profile: { ...stale.profile, enabled: true, profiles: [
    { agent: "claude-design", enabled: true, id: "old-design", model: "Provider/model", name: "Old", scope: "llmr" },
    { agent: "zcode", enabled: true, id: "keep", model: "Provider/model", name: "Keep", scope: "llmr" }
  ] } });
  const current = await configApi.loadAppConfig();
  assert.deepEqual(current.profile.profiles.map((profile) => profile.id), ["keep"]);
});
```

Add to `request-log-store.test.mjs` a case named "a request that only mentions Claude Design infers no agent": record a request whose body text is `"claude.ai/design"` with no Claude Code session header, run the agent analysis the way the case at line 1333 does, and assert the resulting agent is `"unknown"`. Mirror that case's fixture shape.

- [ ] **Step 2: Run the three test files to verify they fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/config/plugin-config-migration.test.js .test-dist/core/test/unit/config/config-credential-writes.test.js .test-dist/core/test/integration/observability/request-log-store.test.js`
Expected: FAIL. The migration case gets three ids back, the profile case keeps `old-design`, the log case infers `claude-design`.

- [ ] **Step 3: Remove the ids and the app defaults from `packages/core/src/contracts/app.ts`**

Delete `CLAUDE_DESIGN_PLUGIN_ID`, `CLAUDE_SHIP_PLUGIN_ID`, `DEFAULT_CLAUDE_DESIGN_APP`, `DEFAULT_CLAUDE_SHIP_APP` (854-868), the two keys in `KNOWN_GATEWAY_PLUGIN_DEFAULTS` (905-912; keep `cursor-proxy` at 913-916), the function `knownGatewayPluginDefaultApps` (929-939), and the `"claude-design"` member of `ProfileClientKind` (1486) and `AgentKind` (2363).

- [ ] **Step 4: Remove the desktop-only gate from `packages/core/src/plugins/service.ts`**

Delete `isDesktopOnlyClaudeBrowserPlugin` and `pluginAvailableInCurrentRuntime` (1310-1316), the whole `if` at 279-281, the `&& pluginAvailableInCurrentRuntime(plugin)` clause at 1320, the two id imports at 19-20 and the now-unused `isDesktopAppRuntime` import at 28.

- [ ] **Step 5: Rewrite `migrateKnownGatewayPluginConfigs` in `packages/core/src/config/config.ts`**

Signature stays. Body: filter out entries whose id is `"claude-design"` or `"claude-ship"`, set `changed` when any was dropped, then run `migrateExternalizedPluginModuleConfig` on each remaining plugin as today. Set `LLMR_EXTENSIONS_PLUGIN_IDS` (2702) to `new Set(["cursor-proxy"])`.

Delete these functions and constants: `deprecatedClaudePluginConfigKeys` (2799), `deprecatedClaudePluginFalseOnlyConfigKeys` (2823), `removeDeprecatedClaudePluginConfig` (2842), `migrateClaudeDesignPluginConfig`, `migrateClaudeDesignPluginApps` (2870), `migrateClaudeShipPluginConfig` (2914), `migrateClaudeShipPluginApps` (2945), `migratedClaudeShipPluginConfig`, `shouldSplitClaudeShipPlugin`, `isClaudeShipApp`, `isLegacyClaudeDesignAppUrl`, `isLegacyClaudeDesignModule`, `migratedClaudePluginModulePath`, `isDesktopBundledClaudeRuntimePlugin`, `resolveBundledRuntimePluginModule` (3097) with `bundledRuntimePluginModuleCandidates`, `claudeProductRuntimePluginConfig`, `claudeDesignRuntimePluginConfig`, `claudeShipRuntimePluginConfig`, `withClaudeDesignRuntimePluginConfig`, `withClaudeShipRuntimePluginConfig`, `withClaudeProductRuntimePluginConfig` (3013), and the branches at 3110 and 3131-3133.

Keep `migrateExternalizedPluginModuleConfig`, `isLegacyExternalizedPluginModule`, `migratedExternalizedPluginModulePath` (3076), the `llmrExtensionsRoot*` helpers, and `resolveBundledOrExternalizedPluginModule` (3083) minus its first four lines (3084-3087), so it searches `llmrExtensionsRootCandidates` alone. Drop the five deleted names from the import at line 18 and the `isDesktopAppRuntime` import at 22.

- [ ] **Step 6: Remove the profile agent branches in core and the CLI**

`config.ts` 3645-3646, 3702-3714, 3839-3840, 3880-3881, 3897-3898 (`parseProfiles`, `parseProfileAgent`, `defaultProfileAgentName`, `defaultCodexConfigFile`). `profiles/service.ts` 236-237, 400-401, 411-419 (`applyClaudeDesignProfile`), 954, 3605-3606, 4404-4406, 4419-4420. `launch-core.ts` 53, 81, 112-114, 348-349. `launch-service.ts` 112-114, 131-133. `cli.ts` 147-149, 323-325.

- [ ] **Step 7: Delete the Claude App design opener**

Delete `packages/core/src/agents/claude-app/cdp.ts` and `packages/core/test/unit/agents/claude-app-cdp.test.mjs`. In `launch.ts` delete the import at 7, the `prepareClaudeAppCdpUserDataDir` call (61), `shouldOpenDesign` and `cdpPort` (62-63), `designUrl` (82), the `scheduleClaudeAppDesignCdp` call (90-95), the `cdpPort` spread in the result, the three helpers at 112-128 (`shouldOpenClaudeAppDesign`, `claudeAppDesignUrl`, `claudeDesignPluginConfig`), and the `cdpPort` parameter of `claudeElectronArgs` and `claudeAppLaunchCommand` with the `--remote-debugging-*` args it added. Remove `cdpPort?: number` from `ClaudeAppLaunchResult` at `launch.ts:22`.

- [ ] **Step 8: Drop the agent label from the request log store**

`request-log-store.ts` 2050-2052 (`inferAgentFromText` branch), 4220 and 4224 (`normalizeAgentFilter`, `normalizeSessionAgentFilter`), 4231-4233 (`agentDisplayName`).

- [ ] **Step 9: Run the tests and the core typecheck**

Run: `node build/test.mjs core && node --test .test-dist/core/test/unit/config/plugin-config-migration.test.js .test-dist/core/test/unit/config/config-credential-writes.test.js .test-dist/core/test/integration/observability/request-log-store.test.js && npx tsc --noEmit -p packages/core && npx tsc --noEmit -p packages/cli`
Expected: the three new cases PASS, core and cli typecheck. `packages/electron` and `packages/ui` still fail until Tasks 3 and 4.

- [ ] **Step 10: Commit**

```bash
git commit -m "refactor(core): remove the Claude Design profile agent, plugin migrations and Claude App design opener"
```

### Task 3: Remove the Claude Design window, the deep-link special cases and the plugin-window diagnostics from the Electron main process

**Files:**
- Modify: `packages/electron/src/main/deep-link.ts:3,9-10,128,140-157,206-229,352,355,366-376`
- Modify: `packages/electron/src/main/windows.ts:6,12,41,149-150,264,457,490-633,637-639`
- Modify: `packages/electron/src/main/ipc.ts:14,57,197-216`
- Modify: `packages/electron/src/main/built-in-browser.ts:961-963,972-974`

**Interfaces:**
- Consumes: `knownGatewayPluginDefaultApps` is gone (Task 2).
- Produces: `openPluginApp(pluginId, appId?)` resolves the app only from `config.plugins[].apps` and opens `pluginApp.url` as saved. `PluginAppWindowOptions` has no `claudeDesignCdp` member. The plugin-window diagnostics (screenshots, page summaries) go, since they ran only under `claudeDesignCdp`. `IPC_CHANNELS.appOpenProfile` returns `openProfileFromLlmr(syncedClaudeAppConfig.config, request)` for every agent.

- [ ] **Step 1: Edit `deep-link.ts`**

Delete the imports of `./claude-design-window` and `./plugin-app-url` (9-10). Line 128 becomes `const config = syncedClaudeAppConfig.config;`. Line 140 passes `pluginApp.url` straight to `resolveGatewayPluginAppUrl`. Delete `claudeDesignCdp` (141-143) and make the `ensurePluginAppUrlAvailable` call at 144-146 unconditional. Drop the CDP suffix from the log line (147-150) and the spread at 153. Delete `isClaudeBrowserPlugin`, `ensureClaudeDesignWindowCdpOptions` (206-229) and `resolveKnownBuiltInPluginApp` (366-368); its caller at 352 becomes `return undefined;`. Collapse `configuredPluginApps` (370-376) into `plugin.apps ?? []` at its call site (355), since its `pluginId` parameter would be unused.

- [ ] **Step 2: Edit `windows.ts`**

Delete the `claudeDesignCdp` option (12) and the import (6). Line 150 becomes `existing.webContents.getURL() !== options.url`. Line 457 keeps only the `isSameOrigin` check. Delete the diagnostics block at 490-633 (`configurePluginAppDiagnostics`, `schedulePluginAppScreenshot`, `schedulePluginAppScript`, `stringifyPluginAppScriptResult`, `schedulePluginAppPageSummaries`, `logPluginAppPageSummary`), the `pluginAppDiagnostics` WeakSet (41) and its two call sites (149, 264), and the branch at 637-639. Then remove whatever imports (`readFileSync`, `clampNumber` and friends) the typecheck reports unused.

- [ ] **Step 3: Edit `ipc.ts` and `built-in-browser.ts`**

`ipc.ts`: delete the special case at 199-215 so the handler returns `openProfileFromLlmr(syncedClaudeAppConfig.config, request)`, delete the now-unused locals `profile` and `surface` (197-198), and drop the imports of `withClaudeDesignRuntimePluginConfig` (14), `CLAUDE_DESIGN_PLUGIN_ID` (57), `findProfileForOpen` and `resolveProfileOpenSurface`. `built-in-browser.ts`: delete the two `claude-design` skips at 961-963 and 972-974.

- [ ] **Step 4: Typecheck the whole workspace**

Run: `npm run typecheck`
Expected: `packages/electron` passes. Only `packages/ui` errors remain, on the `"claude-design"` literal against `ProfileClientKind` and `AgentKind` (`options.ts:128,144`, `usage.ts`, `profiles.ts`, `profiles.tsx`).

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(electron): drop the Claude Design window, deep-link special cases and plugin-window diagnostics"
```

### Task 4: Remove the profile agent and the plugin special cases from the UI

**Files:**
- Modify: `packages/ui/src/pages/home/shared/options.ts:128,144,147-151`
- Modify: `packages/ui/src/pages/home/shared/profiles.ts:537,624-626,685,739,754,1367,1442,1552-1553,1704,1731,1747,1762,1794,1798,1812-1813`
- Modify: `packages/ui/src/pages/home/components/profiles.tsx:116,738-739,806,832,854,953,1827`
- Modify: `packages/ui/src/pages/home/shared/usage.ts:189,196-198`
- Modify: `packages/ui/src/pages/home/shared/extensions.ts:584-588`
- Modify: `packages/ui/src/pages/home/components/extensions.tsx:153-158,337-338`
- Modify: `packages/ui/src/pages/home/shared/provider-references.ts:65`
- Modify: `packages/ui/src/pages/home/components/dialog-stack.tsx:4,16,37,72`
- Modify: `packages/ui/src/pages/home/App.tsx:4-6,15,26,219,254,796,2396-2444,3447-3458`
- Modify: `packages/ui/src/pages/home/shared/routing.ts:343-349,359-366,449-461,590-597`
- Test: `packages/ui/test/component/profiles.test.tsx:388-416`

**Interfaces:**
- Consumes: `ProfileClientKind` and `AgentKind` without `"claude-design"` (Task 2).
- Produces: `profileAgentOptions` without the Claude Design entry; `profileAgentOptionsForRuntime` is deleted because both its branches would return `profileAgentOptions`. `openablePluginAppId(plugin)` returns an id only from `plugin.apps`. `createClaudeDesignRoutingDraft` and `createClaudeDesignRoutingRuleDraft` are deleted (their only callers were the Claude Design draft in `App.tsx`). The cursor-proxy dialog and the remaining `ClaudeDesign*` helpers (`claudeDesignRoutingConfigFromDraft`, `isClaudeDesignRoutingDraftValid`, `readClaudeDesignRoutingConfig`, the `ClaudeDesignRouting*` types, `claudeDesignRouteRuleTypeOptions`) are unchanged until Task 8.

- [ ] **Step 1: Delete the component test case**

Delete the Claude Design case at `packages/ui/test/component/profiles.test.tsx:388-416`. It asserts that advanced settings hide for that agent, a behavior that no longer exists.

- [ ] **Step 2: Remove the agent option and every `claude-design` branch**

Work through the file list. Each site is one branch of a ternary chain or one array element; delete the branch and simplify the chain. Specifics the reviewers pinned:
- `options.ts`: delete the entries at 128 and 144 and the function `profileAgentOptionsForRuntime` (147-151). `App.tsx:219` uses `profileAgentOptions` directly and line 26 drops the import name.
- `profiles.ts:1552-1553`: the alias parse for "claude design" and "design" goes too.
- `profiles.tsx:738-739`: `isClaudeDesignProfile` and `showAdvancedSettings` become always-true; delete both locals and inline `true` at every use.
- `App.tsx` 4-6 and 15 are mixed import lines: remove the names `createClaudeDesignRoutingDraft`, `createClaudeDesignRoutingRuleDraft`, `ClaudeDesignRoutingDraft` and the Claude Design handlers, keep `claudeDesignRoutingConfigFromDraft`, `isClaudeDesignRoutingDraftValid` and the `ClaudeDesignRouting*` types that cursor-proxy still uses. Delete the draft state (254), handler (796), the block at 2396-2444 and the props at 3447-3458. Keep 255, 797, 2447-2490 and 3460 onward (cursor-proxy).
- `dialog-stack.tsx`: delete the `claudeDesignConfig` prop and layer (16, 37, 72); keep the `cursorProxyConfig` layer (38, 73); line 4 drops the type import.
- `provider-references.ts:65` is an inclusion guard. It becomes `if (plugin.id !== "cursor-proxy") continue;`.
- `extensions.tsx`: delete the two id fallbacks at 153-158. Change the prop defaults at 337-338 to `routesLabel = "Routes"` and `sourceModelLabel = "Source model"`.
- `extensions.ts:584-588`: delete the Claude Design capability text; keep the cursor-proxy text at 589-593.
- `routing.ts`: delete `isClaudeDesignPluginConfig` (343-349), `createClaudeDesignRoutingDraft` (359-366), `createClaudeDesignRoutingRuleDraft` (449-461), and replace the `claude-design-route-${n}` default id (590-597) with `plugin-route-${n}`. Check `shared/extensions.ts` for an import of `isClaudeDesignPluginConfig` and remove it.

- [ ] **Step 3: Typecheck and run the UI tests**

Run: `npm run typecheck && npm run test:ui && grep -rn "claude-design\|Claude Design" packages/ui/src`
Expected: PASS, and the grep prints nothing. (`ClaudeDesign` as a symbol prefix remains until Task 8.)

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(ui): remove the Claude Design profile agent and plugin cases"
```

### Task 5: Repoint the core and electron tests that used the plugin as a fixture

**Files:**
- Modify: `packages/core/test/unit/config/config-credential-writes.test.mjs:66`
- Delete: `packages/core/test/unit/contracts/app.test.mjs`
- Modify: `packages/core/test/unit/agents/claude-app-gateway-sync.test.mjs:70-89`
- Modify: `packages/core/test/unit/agents/plugin-permissions.test.mjs:8,104-180,324`
- Modify: `packages/core/test/unit/profiles/profile-launch-core.test.mjs:108-116,146,154,163,174,244`

- [ ] **Step 1: Swap fixtures and delete subject tests**

`config-credential-writes.test.mjs:66`: agent `"zcode"`; the assertion at 72 still expects `profile:new-profile`, since `api-key.ts` is agent-agnostic. `claude-app-gateway-sync.test.mjs:70-89`: agent `"zcode"`, keep the assertions (`hasClaudeAppTakeoverProfile` false, no backup), and run it; if `zcode` counts as a takeover profile, use `"workbuddy"`. `plugin-permissions.test.mjs`: rewrite the "known bundled plugins get scoped defaults" case (104) against `cursor-proxy`, whose defaults (`app.ts:913-916`) are `trusted-code`, `gateway-routes`, `proxy-routes`, `http-backends` with surfaces `{apps: false, gateway: true, provider: false}`; so drop the `apps: [...]` fixture, assert `pluginService.getApps()` is `[]` and `hasGatewayRoutes()` is true. Delete the "Claude browser plugins skipped outside LLMR Desktop" case (145), then remove `restoreEnv` (324) and the `LLMR_DESKTOP_APP_ENV` import (8) it orphans. `profile-launch-core.test.mjs`: delete the `claudeDesignProfile` const (108-116) and the assertions at 146, 154, 163, 174, 244, including the "can only be opened from LLMR Desktop" one. Delete `contracts/app.test.mjs`; its only test was the default app URL.

- [ ] **Step 2: Run the three suites**

Run: `npm run test:core && npm run test:electron && npm run test:architecture`
Expected: PASS. `grep -rniE "claude[- ]design|claude[- ]ship|ccrdesk" packages tests build scripts` prints only `tests/architecture/readme-identity.test.mjs:5`.

- [ ] **Step 3: Commit**

```bash
git commit -m "test: repoint fixtures that used the Claude Design plugin"
```

### Task 6: Remove the user docs page, the README mentions and the two tracked docs fixtures

**Files:**
- Delete: `docs/src/content/docs/en/configuration/agents/claude-design.md`
- Modify: `docs/src/docs-structure.ts:202-208,486`
- Modify: `docs/src/content/docs/en/guides/cli.md:132`
- Modify: `docs/src/content/docs/en/configuration.md:32`
- Modify: `docs/src/components/interactive/fixtures-agent-analysis.json:10998,11274,11374`
- Modify: `docs/superpowers/english-only-parity-docs.md:33`
- Modify: `README.md:7,27,82-118,173,218,232`

- [ ] **Step 1: Delete the page and its two sidebar entries**

Delete the page. Remove the page object at `docs-structure.ts:202-208` and `pageItem("configuration/agents/claude-design")` at 486. Delete the table row for `configuration/agents/claude-design.md` at `english-only-parity-docs.md:33`.

- [ ] **Step 2: Edit the two sentences, the fixture and the README**

`cli.md:132` becomes "Grok CLI, Kimi CLI, Pi, and Kilo support CLI only; ZCode supports App only." `configuration.md:32` drops "and Claude Design" from the agent list. `fixtures-agent-analysis.json` is a captured agent-analysis demo whose three `preview` strings at 10998, 11274 and 11374 quote old UI source; edit those strings so `isClaudeDesignProfile`, `"claude-design"`, `ConfigureClaudeDesignDialog` and `profileAgentOptionsForRuntime` no longer appear (PR 40 edited this file the same way for the rename), and confirm `docs/src/components/interactive/mockData.ts` still parses it. In `README.md` drop "Claude Design" from the lists at 7, 27, 173, 218 and 232, delete the `<td>` at 104-110, and set the four remaining cells of that row (82-118) to `width="25%"`; the first row (45-81) keeps its five 20% cells.

- [ ] **Step 3: Check the guards and the docs build**

Run: `npm run test:architecture && npm --prefix docs run build && grep -rniE "claude[- ]design|claude[- ]ship|ccrdesk" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.test-dist --exclude-dir=.git --exclude-dir=.claude --exclude-dir=private .`
Expected: PASS, the docs build logs no missing-page warning, and the grep prints only `tests/architecture/readme-identity.test.mjs:5`, `docs/superpowers/plans/completed/*`, `docs/superpowers/specs/*` and this plan.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: remove the Claude Design page, README mentions and fixture text"
```

### Task 7: Verify the whole removal on the built app, then open PR 1

**Files:**
- None new.

- [ ] **Step 1: Full suites and a build**

Run: `npm run typecheck && npm run test:architecture && npm run test:core && npm run test:ui && npm run test:electron && npm run test:cli && npm run build:assets && git checkout -- packages/core/models.json packages/ui/src/generated`
Expected: every suite PASS. `ls packages/electron/dist/bundled-plugins` prints only `new-api-account`.

- [ ] **Step 2: Upgrade check from an isolated home with a stale config**

Seed an isolated home with a config that has a `claude-design` profile and both plugin entries. The quickest seed is to start the app once from a `v6.1.0` checkout with `LLMR_INTERNAL_HOME_DIR=<empty dir>`, save a Claude Design profile through the UI, quit, then start the built `main` app against the same home. `LLMR_INTERNAL_HOME_DIR` alone isolates every write since PR 13 (v4.3.1); the 2026-10-29 research run confirmed the real `~/.claude` and `~/.codex` stayed untouched.

```bash
LLMR_INTERNAL_HOME_DIR=/path/to/that/home node_modules/.bin/electron . --remote-debugging-port=9333
```

Expected: the app starts; the log has no `[plugin:claude-design]` or `[plugin:claude-ship]` line; Agent Config shows no Claude Design option and no Claude Design profile; Extensions lists no Claude Design or Claude Ship entry; a cursor-proxy plugin entry, if present, still opens "Configure routing" with the "Routes" label. Drive it through the `chrome-devtools-mcp:chrome-devtools` skill on port 9333 and save the screenshots with the PR.

- [ ] **Step 3: Deep-link check**

The dev build does not register the scheme (`deep-link.ts:174-178`), so run this against a packaged build (`npx electron-builder --dir` on the `main` build, then open the app from `dist/`):

Run: `open 'llmr://plugin/claude-design/open'`
Expected: the log line `[deep-link] Failed to open plugin app from llmr://plugin/claude-design/open: Plugin app is not configured or enabled: claude-design`, the "Failed to open LLMR plugin app" error box, and the main window in front. The app stays up.

- [ ] **Step 4: Open the PR**

Title `chore: remove the Claude Design and Claude Ship plugins`. The body links this plan, states the breaking change, lists the stale-config and deep-link behavior from Global Constraints and Review Focus, and carries the screenshots from Step 2. Squash-merge per the release process.

### Task 8: Rename the shared routing editor to a plugin-neutral name (PR 2)

**Files:**
- Modify: `packages/ui/src/pages/home/shared/routing.ts`, `shared/types.ts:259-275`, `shared/options.ts:82,276`, `shared/extensions.ts`, `shared/external.tsx:329,440`, `components/index.ts:13`, `components/extensions.tsx` (`ConfigureClaudeDesignDialog`), `components/dialog-stack.tsx`, `App.tsx` (cursor-proxy handlers)
- Test: `packages/ui/test/unit/provider-references.test.ts`, any routing unit test in `packages/ui/test`

**Interfaces:**
- Produces: every `ClaudeDesign` and `claudeDesign` substring in a `packages/ui/src` symbol becomes `PluginRouting` and `pluginRouting`, so `ConfigureClaudeDesignDialog` becomes `ConfigurePluginRoutingDialog`, `isClaudeDesignRoutingDraftValid` becomes `isPluginRoutingRoutingDraftValid` and so on; apply a second pass that collapses `RoutingRouting` to `Routing`. No behavior change.

- [ ] **Step 1: Build the rename as a script, not by hand**

Write a one-off script in the scratchpad that applies plain substring replacement (`ClaudeDesign`→`PluginRouting`, `claudeDesign`→`pluginRouting`, then `PluginRoutingRouting`→`PluginRouting`, `pluginRoutingRouting`→`pluginRouting`) across `packages/ui/src` and `packages/ui/test`. Word-boundary matching would miss `isClaudeDesignPluginConfig`-style names. Run it, then `grep -rn "ClaudeDesign\|claudeDesign" packages/ui` and expect nothing. Do not commit the script.

- [ ] **Step 2: Typecheck and test**

Run: `npm run typecheck && npm run test:ui`
Expected: PASS with no test edits beyond the renamed imports.

- [ ] **Step 3: Commit and open PR 2**

```bash
git commit -m "refactor(ui): rename the plugin routing editor away from Claude Design"
```

Open PR 2 against `main` after PR 1 merges. It is a pure rename, so its PR body says so and lists the symbol map.

---

## Appendix A. Prototype evidence

Run on 2026-10-29 in a detached scratch worktree of `387878ca` with `node_modules` symlinked from the main checkout.

- Deleting only the Task 1 files (twelve paths) leaves three typecheck errors, all missing-module imports: `deep-link.ts:9` (`./claude-design-window`), `deep-link.ts:10` (`./plugin-app-url`), `windows.ts:6` (`./claude-design-window`). Task 3 removes them.
- `npm run test:architecture` on that state fails one test, "every kept entry is still at the file it names" in `tests/architecture/llmr-rename.test.mjs:73`, on `packages/electron/bundled-plugins/claude-design/README.md`. Task 1 Step 4 fixes it.
- Two reviewers (one on line claims, one on coverage gaps) checked every file and line in Tasks 1 to 8 on 2026-10-29. Their corrections are folded in: the `kept` entry must go whole and its two fixtures move to `aff=ccr`; `resolveBundledOrExternalizedPluginModule` must stay; the Electron diagnostics block and the Claude App CDP module become dead and go; `profileAgentOptionsForRuntime` and the two routing draft constructors become dead and go; the deep link ends in an error dialog, not silence; old log rows re-infer as `unknown`, not as unlabeled.
- Not run: the docs build, the request-log inference on a real row, and the cursor-proxy legacy module migration. Tasks 2, 6 and 7 cover them.

## Appendix B. What a future LLMR Design would reuse

Nothing stays on `main` for it. Git tag `v6.1.0` (commit `387878ca`) is the last state with the plugin, and this is the map into it. All paths are under `packages/electron/bundled-plugins/claude-design/index.cjs` unless noted.

- The local backend contract: `routeMockRequest` (line 895) dispatches 52 Omelette RPC methods (`handleOmeletteConnectRpc`, 2235) and the REST surface (`handleDesignRestApi`, 9815). A UI we own would need roughly a dozen of them: `CreateProject`, `ListProjects`, `GetProject`, `UpdateProjectInfo`, `DeleteProject`, `Chat`, `CancelChat`, `GetChatMessages`, `WriteFiles`, `ListFiles`, `GetFile`, plus the REST `serve` and `download` routes.
- The model path: `fetchGateway` (12472) is the only outbound call, to the LLMR gateway's `/v1/messages`. The chat pipeline is `gatewayMessagesRequestFromProjectChat` (11212), `withDesignAgentSystemPrompt` (11502), `connectGatewayChatStreamResponse` (10587) and `appendChatExchange` (13266). `DESIGN_AGENT_SYSTEM_PROMPT` (284) is the tuned prompt and the part that most needs its own evaluation once the UI changes.
- The store: the SQLite schema at 631-690. `claude_design_items` (projects and chats) and `claude_design_files` (project files) are the two tables a new surface needs. `claude_design_assets` and `claude_design_responses` served the Anthropic bundle and would not come back.
- The host side that stays on `main` and needs no restore: the plugin `apps` surface, `ctx.openSqliteStore`, `ctx.registerProxyRoute`, `windowsManager.openPluginAppWindow`, `deepLinkService.openPluginApp`, and the `sqlite-store` and `gateway-routes` permissions.
- Not reusable: the CDP interceptor (`claude-design-window.ts`), the asset proxy and bundle patches, the Ship handlers, the Cloudflare Pages deploy, and the Claude App force-open path (`agents/claude-app/cdp.ts`). They exist to run Anthropic's bundle and have no place in an original UI.
- Naming: the replacement must not carry the Claude name in its plugin id, window title, profile agent or menu entry (Anthropic Trademark Guidelines, 2024-08-01).

## Appendix C. Alternatives rejected

- Keep the backend subset on `main` behind a flag. Rejected. Dead code with no caller rots, and `v6.1.0` already preserves it.
- A long-lived `claude-design-keep` branch. Rejected for the same reason; a tag is the branch that never drifts.
- Delete the shared routing editor with the plugin. Rejected because `dialog-stack.tsx:73` renders it for cursor-proxy.
- Keep `"claude-design"` in `AgentKind` so old log rows keep their label. Rejected. The agent is never stored, so there is no label to keep; the rows re-infer.
- Keep `cdp.ts` with only `reserveClaudeAppCdpPort` and rename `LLMR_CLAUDE_APP_DESIGN_CDP`. Rejected. Nothing reads the port once the design opener goes, so the variable would open a debugging port on the Claude app for no consumer.
- Special-case the stale `llmr://plugin/claude-design/open` link to a silent no-op. Rejected. The generic error box already says what happened, and a special case would be the first `claude-design` string back on `main`.

## Appendix D. Risks

- The cursor-proxy legacy module migration was inferred from reading `config.ts:2702-2745`, not run. Task 2 keeps that path and Task 5's `plugin-permissions` rewrite exercises its defaults.
- Line numbers drift if `main` moves before execution. Every task re-greps.
- A user who used Claude Design loses their projects' UI, though `claude-design.sqlite` stays on disk. The release notes say so.
- A user who set `LLMR_CLAUDE_APP_DESIGN_CDP` to attach a debugger to the Claude app loses that port. The variable was never documented; the release notes name it anyway.
