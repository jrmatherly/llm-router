# Rename every internal ccr identifier to llmr

Date: 2026-10-27. Status: approved by the operator's no-compatibility decision of 2026-10-27. Ships as v6.0.0.

This spec supersedes the keep-list in `completed/2026-10-27-audit-remediation.md` (the "Out of scope, kept as they are" bullet on internal identifiers) and the one before it in `completed/2026-10-25-rebrand-phase-2.md`.

## Why

v5 moved the user-facing identity to LLM Router: the `llmr` CLI, the `llmr://` scheme, a new appId, `~/.llm-router`, and `llmr_web_token`. The internals still say `ccr`: environment variables, headers, gateway paths, the preload bridge, IPC channels, the import alias, plugin keys, MCP server names, backup suffixes and about a thousand code identifiers. On 2026-10-27 the operator chose a clean break. No `ccr` compatibility stays for old installs or running instances, and the internals move to `llmr` too.

## What changes for users

v6.0.0 is a breaking release. The release notes must tell users each item below.

- **Docker operators.** Every `CCR_*` variable is now `LLMR_*` (`LLMR_WEB_AUTH_TOKEN`, `LLMR_PUBLIC_BASE_URL`, `LLMR_DATA_DIR` and the rest). The Compose service is `llmr` and the volume is `llmr-data`. Existing `.env` and compose files stop working until renamed. To keep data, copy the old volume before starting the new one: `docker run --rm -v ccr-data:/from -v llmr-data:/to alpine cp -a /from/. /to/`.
- **Desktop and CLI users.** Restore or stop every applied profile in v5 before upgrading. v6 writes `.llmr-original` and `.llmr-backup-*` backups and `llmr-*` MCP server and wrapper names into agent configs. It does not read the `.ccr-*` backups or remove the `ccr-*` entries that v5 wrote. A profile left applied across the upgrade keeps its v5 entries until the user removes them by hand.
- **Saved LLMR config.** Plugin keys (`llmr-local-agent-*`, `llmr-*-hook`), the profile scope value `llmr` (was `ccr`) and the bot tenant default `llmr` change. A v5 config that names the old values loses those plugins and falls back to the global scope. v5 already required a clean reinstall, so most configs were created by v5 and use generated values that v6 regenerates.
- **Local agent providers.** The API key marker that tells LLMR to use the agent's own login is `llmr-local-agent-login`. PR #35 (783e904d) made that change on main after v5.3.2. The operator chose to ship it in v6.0.0 with the rest of the rename, so there is no v5.3.3. A saved provider whose key is still `ccr-local-agent-login` no longer matches the checks that swap in the agent's login (`compileCoreGatewayConfig` in `packages/core/src/gateway/core-runtime/config-compiler.ts`, the provider probe and model refresh), so it fails until the user re-imports the provider.
- **Prompt and agent authors.** The subagent model tag is `<LLMR-SUBAGENT-MODEL>`. Agent definitions that use `<CCR-SUBAGENT-MODEL>` stop routing.
- **Plugin authors.** A plugin manifest declares LLMR fields under an `llmr` key (was `ccr`), in `llmr-plugin.json`, `.llmr-plugin/plugin.json` or the `llmr` field of `package.json`. v6 no longer reads the `ccr` fields (`inspectPluginDirectory` and its helpers in `packages/core/src/web/management-server.ts`). The `jrmatherly/llm-router-extensions` marketplace lists no plugins today, so no published plugin breaks. Its README moves to `LLMR_PLUGIN_MARKETPLACE_URL` in step with this release.
- **Chrome login import extension.** Reload the unpacked extension from this release. It talks to the app through the renamed headers and paths.
- **Everyone.** `x-ccr-*` response headers are `x-llmr-*`, the management RPC is `/api/llmr/rpc`, and gateway paths moved from `/__ccr/` to `/__llmr/`. Anything scripted against them must change.

## Clean reinstall

Because there is no migration code, start v6 from a clean machine. On each macOS machine, before installing v6.0.0:

1. In v5, open every applied agent profile and restore or stop it, so each agent's own config comes back from its `.ccr-original` backup.
2. Quit LLM Router and stop any CLI service (`llmr stop`).
3. From a checkout of this release, preview the uninstall, then run it:

   ```bash
   npm run uninstall:mac -- --include-legacy
   npm run uninstall:mac -- --yes --include-legacy
   ```

   The first command prints the plan only. The second backs up the data directory to a `.tgz` first, then removes the app, the `llmr://` and pre-5.0 `ccr://` handlers, the v5 `.ccr-*` and v6 `.llmr-*` leftovers in agent config dirs, and `~/.llm-router`. Add `--keep-data` to keep `~/.llm-router`.
4. If the uninstaller reports a trusted proxy CA ("LLM Router CA" or "Claude Code Router CA"), run the `sudo security delete-certificate` command it prints.
5. Install v6.0.0 and set up providers and profiles again.

Docker hosts: stop the stack, rename the `CCR_*` variables to `LLMR_*` in `.env` and compose files, and either copy the `ccr-data` volume into `llmr-data` or start with an empty `llmr-data`.

## Decision on cleanup code

No new cleanup code. Cleanup is not compatibility, but each candidate fails the bar of preventing real breakage that a release note cannot.

- **`.ccr-original` and `.ccr-backup-*` files.** Deleting them destroys the only copy of a user's pre-LLMR config when a profile was left applied. Restoring them from v6 is a compatibility reader. The release note's "restore before upgrading" step costs the user one click and keeps their files safe.
- **`ccr-*` MCP and wrapper entries in other tools' configs.** Restoring the profile in v5 puts back the user's own config from its `.ccr-original` backup. Removing them from v6 means v6 must know every v5 entry name, which is a compatibility table.
- **The `ccr-data` volume.** Docker never deletes a named volume on its own. The release note gives the copy command.
- **The pre-5.0 cleanup that already exists stays.** `legacyCliLauncherFileNames`, `isLegacyManagedCcrCliLauncher` and `isLegacyManagedCcrCliRuntime` in `packages/core/src/profiles/launch-service.ts` remove `ccr`, `ccr.cmd`, `ccr-app`, `ccr-app.cmd` and `ccr-cli.js` from `~/.llm-router/bin` only when their content proves LLMR wrote them. The old "Claude Code Router CLI" PATH block and the "Claude Code Router CA" keychain entry are removed the same way. Those names contain no `ccr` token except the launcher file names and the markers the content check looks for, and the codemod keeps exactly those.

The operator could choose instead a one-time v6 migration that renames `.ccr-*` backups and rewrites `ccr-*` entries. That is a few hundred lines of code that must know v5's names forever, for a step a release note covers.

## The lever

`scripts/llmr-rename.mjs` does every edit. Nothing in the rename is a hand edit except the two subtractions named in phase 4. A reviewer reruns the script on the parent commit and diffs the result against the phase commit.

```bash
node scripts/llmr-rename.mjs <alias|wire|env|rest|all>...
node scripts/llmr-rename.mjs --check <class>...
```

- It reads the files `git grep -lIi ccr` lists, so binaries are skipped.
- Inside each match of a class's patterns it replaces `ccr` with the same case form of `llmr`: `ccr` to `llmr`, `CCR` to `LLMR`, `Ccr` to `Llmr`.
- It masks the kept texts listed below before replacing and restores them after.
- The `rest` class also fixes the article (`a LLMR` to `an LLMR`) and runs `git mv` on tracked paths whose names contain `ccr`.
- `--check` prints every line a class still matches and exits 1 when any remain.
- A second run changes nothing. `tests/architecture/llmr-rename.test.mjs` pins that and the case mapping.

## Phases

Each phase is one PR, stacked on the one before. Inside a phase the tree may be broken between the codemod run and the follow-up fixes. Every phase ends green on the checks named for it, and the next phase starts from that green state.

| Phase | PR content | Breakage allowed inside the phase | Check that closes the phase |
|---|---|---|---|
| 0 | This spec, the codemod and its tests. No renames. | None. | `npm run typecheck`, `npm run test:architecture`. |
| 1 | `alias`: `@ccr/` to `@llmr/` in imports, `tsconfig.json` paths, the esbuild resolver, `AGENTS.md` and `.claude/rules`. | Module resolution between the codemod run and the resolver edit. | `npm run typecheck`, `npm run test:architecture`, `npm run test:core`, `test:ui`, `test:electron`, `test:cli`, `--check alias` at 0. |
| 2 | `wire`: `x-ccr-*` headers, `/api/ccr`, `/__ccr/`, `window.ccr` and `window.ccrBrowser`, the preload `exposeInMainWorld` names, and the `ccr:` IPC and message-channel prefix. | UI, Electron and CLI disagree on the contract until all three are renamed in the same commit. | Same four suites, `--check wire` at 0. |
| 3 | `env`: every `CCR_*` name, including the Docker names, the test isolation `CCR_INTERNAL_*_DIR` variables and the `.claude` gate variables. | Test-home isolation is unsafe while `build/test-home.mjs` and the code disagree, so no suite runs until the whole class is renamed. | Same four suites, `npm run test:system` when Docker is available, `--check env` at 0. |
| 4 | `rest`: plugin keys, MCP and wrapper names, persisted file, directory and localStorage names, backup suffixes, the profile scope value, code identifiers, CSS ids, prose, file names. Adds the guard test. Regenerates `package-lock.json` for the renamed `llmr-core-server` bin. | Any of the above until the commit lands. | All four suites, `npm run build:assets` (then `git checkout -- packages/core/models.json packages/ui/src/generated`), `npm run test:e2e`, `--check all` at 0 enforced by `tests/architecture/llmr-rename.test.mjs`. |
| 5 | `longform`: the spelled-out upstream name. `ClaudeCodeRouterPlugin` becomes `LLMRouterPlugin`, `claude-code-router-plugin.ts` becomes `llm-router-plugin.ts`, and the default provider ID written into agent configs, the gateway router plugin name and the data-export kind become `llm-router`. Two compat readers that also accepted `claude-code-router` as an LLMR-managed provider (`account-service.ts`, `local-providers/zcode.ts`) lose that branch by hand first. The two `doesNotMatch(/claude-code-router/)` brand-absence checks in `shell-rc-path-block.test.mjs` go for the same reason as the phase 4 ones. | Imports of the renamed file until the codemod finishes. | All four suites, `npm run test:system`, `npm run build:assets` (then restore the generated files), `npm run test:e2e`, `--check all` at 0. |

Phase 2 deletes `scripts/rebrand-ccr.mjs` and `tests/architecture/rebrand-ccr.test.mjs`. Their job (rewrite prose, keep identifiers) is done, and the test pins `x-ccr-*` and `/__ccr/` surviving, which is the first thing phase 2 changes.

Phase 4 has two hand subtractions before the codemod run, because the codemod would turn them into duplicates or contradictions. `contextArchiveAccessFromText` in `packages/core/src/gateway/features/context-archive-continuation.ts` stops also accepting the `CCR ARCHIVED HISTORY ACCESS` footer, and the test that pinned that read goes with it. The assertion in `packages/core/test/unit/contracts/deep-link.test.mjs` that `ccr://` is not an app deep link goes, since no code names that scheme any more.

Phase 4 also deletes the tests that asserted the old name is absent, because the codemod would turn each into a check that the new name is absent. `packages/ui/test/component/ui-copy.test.ts` (no UI text says CCR), the `CCR` checks in `share-cards.test.tsx` and `tray-components.test.tsx`, the `ccr://` check in `tests/architecture/readme-identity.test.mjs`, and the `ccr_web_token` check in `web-management-server.test.mjs` all go. The guard in `tests/architecture/llmr-rename.test.mjs` covers every one of them for the whole repo.

## What stays

`--check all` treats these as deliberate. Each has a reason.

| Kept | Where | Reason |
|---|---|---|
| `docs/superpowers/**` | Specs and plans | The history of the fork. Rewriting it would falsify what each document recorded at the time. |
| `ccrdesk.top` | `claude-design.ccrdesk.top`, `models.ccrdesk.top` | Hosts owned by upstream. A renamed `llmrdesk.top` would point at a domain nobody here owns. The Claude Design default still needs an operator-owned host, a separate decision. |
| `aff=ccr`, `aff=CCRCCR` | Provider preset sign-up links | Partner affiliate codes issued by Kimi and Infistar, not identifiers of this repo. |
| `"ccr"`, `"ccr.cmd"`, `"ccr-app"`, `"ccr-app.cmd"`, `"ccr-cli.js"` and the four `includes("CCR_…")` markers | `packages/core/src/profiles/launch-service.ts` | The existing pre-5.0 launcher cleanup matches the old names and content. |
| `CCR_GATEWAY_RUNTIME_ID`, `CCR_UPSTREAM_PROXY_URL` | `gatewayRuntimeIdEnv` and `gatewayUpstreamProxyUrlEnv` in `packages/core/src/gateway/internal/shared.ts`, and the gateway tests | Read by the bundled `@the-next-ai/ai-gateway` (1.0.21) itself. Renaming them here breaks the gateway health handshake. They move only when that package renames them. |
| The 4.x launcher and runtime fixture texts | `packages/core/test/unit/profiles/legacy-cli-launcher-cleanup.test.mjs` | The test writes real 4.x file content so the cleanup above has something to recognize. |
| `schemes: ["ccr"]` | `scripts/uninstall-macos.mjs` | `--include-legacy` removes the pre-5.0 `ccr://` handler. |
| `agentLeftover` matching both `.ccr-*` and `.llmr-*`, and "the ccr:// handler" in the usage text | `scripts/uninstall-macos.mjs` | The uninstaller removes what earlier versions left in agent config dirs. Upgraded machines carry v5's `.ccr-backup-*`, `.ccr-original` and `ccr-*-model-catalog.json` files, so it matches both prefixes. This is the existing cleanup, kept on purpose, not a reader. |
| `tests/architecture/uninstall-macos-script.test.mjs` | Skipped by the codemod | Its fixtures are v5 and 4.x leftovers that the uninstaller must still find. |
| `fileName === "ccr-cli.js"` | `packages/core/test/unit/profiles/legacy-cli-launcher-cleanup.test.mjs` | Part of the 4.x fixture above. |
| "The `ccr` and `ccr-app` commands are now `llmr`." | `README.md` | The 5.0 upgrade note names the old commands. |
| `CCR_FORCE_BUNDLE` | `packages/ui/src/generated/claude-code-config-options.json` | A Claude Code setting ("CCR" there means Claude Code Remote). The file is generated from Claude Code. |
| Hash text | `package-lock.json`, `docs/package-lock.json` | Base64 integrity strings that happen to contain the letters. npm owns the files. |
| `scripts/llmr-rename.mjs`, `tests/architecture/llmr-rename.test.mjs` | The lever | They name what they rename. |
| `musistudio/claude-code-router`, "Fork of claude-code-router v3.1.3", `[claude-code-router](` | `README.md`, `AGENTS.md`, issue references in tests, a changelog fixture | Upstream attribution and links to upstream issues. |
| `claudecoderouter` | Provider presets for ClaudeAPI, Code0 and Unity2, and their tests | Partner referral codes (`utm_source`, `source`) issued to upstream. |
| "Claude Code Router CA", "Claude Code Router CLI", "Claude Code Router PATH block" | `certificates.ts`, `launch-service.ts`, `uninstall-macos.mjs` and their tests | The existing cleanup removes the pre-5.0 CA and PATH block by these names. |
| "Claude Code Router.app", `.claude-code-router`, "Library/Application Support/Claude Code Router", `(claude-code-router\|llm-router)\.config\.toml` | `scripts/uninstall-macos.mjs` | `--include-legacy` removes pre-5.0 builds and their data, and the uninstaller removes the v5 Codex leftover. |
| `blog/en/**` | Skipped by the codemod | Upstream's own posts about the project's history. |

## Out of scope

- The Claude Design and Claude Ship default host (`claude-design.ccrdesk.top`). It serves a saved copy of Anthropic's claude.ai/design, which closes on 2026-12-14, so it cannot be repointed to this repository. The options and a recommendation to remove both plugins are in a separate decision memo. The kept `ccrdesk.top` rows above go away with whichever option the operator picks.

## Verification at the end

- `node scripts/llmr-rename.mjs --check all` prints `0 residual lines`.
- `git grep -Ii ccr` lists only the kept entries above.
- `npm run typecheck`, `npm run test:architecture`, all four package suites, `npm run build:assets` and `npm run test:e2e` pass on the phase 5 head.
