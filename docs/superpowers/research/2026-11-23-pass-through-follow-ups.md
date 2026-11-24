# Pass-through follow-ups, 2026-11-23

This record holds what was found after [PR 146](https://github.com/jrmatherly/llm-router/pull/146) merged, at `main` `e789f962` (v8.1.0, not released with that change). PR 146 made LLM Router forward the Claude Code login on each request and stop importing it. Five open questions about it were researched on 2026-11-23. This record is the spec for [`docs/superpowers/plans/2026-11-23-pass-through-follow-ups.md`](../plans/2026-11-23-pass-through-follow-ups.md), which cites findings and decisions by their ids here.

The design it follows is [`docs/superpowers/specs/2026-11-22-claude-code-login-pass-through.md`](../specs/2026-11-22-claude-code-login-pass-through.md). Its decisions PT-1 to PT-11 stand and are not reopened here.

## How this was checked

Three research passes came first, one per area. They are private working notes and are not in the repository. The session that wrote this record then read the code behind every claim it uses. Each claim carries one of these labels.

- **ran (research)**. A research pass executed it in the test runner's temporary home, through a throwaway `node:test` file that was deleted afterwards. Made-up keys only. The session did not repeat the run.
- **read (research)**. A research pass read the code or the doc. The session did not read it again.
- **read**. The session read the code at that place on 2026-11-23, at `e789f962`.
- **inferred**. Reasoned from code that was read. Not observed in a running app.
- **ran (audit)**. The audit below executed it, the same way. **ran (audit), simulated** marks a run against a stand-in for code that does not exist yet.
- **ran (fix round)**. The fix round below executed it, the same way.

**The audit.** A second model audited this record and the plan against the code on 2026-11-23, at `e789f962`. It found no Blockers. It ran the plan's tests on today's code through throwaway test files, which it deleted. Its runs settled four things.

- The fixture of the plan's Task 1 loads and saves. Today the load keeps all three `auth` blocks, which is the failure that task expects, and a save of a config without the block leaves no trace of the made-up token in the store.
- The snapshot test of the plan's Task 5 fails today. A helper-mode restore after Claude login mode writes `{"env":{}}` into a file that was `{}`. With the key line removed from every Claude settings backup in a compiled test bundle, the same test passes, and 98 of 98 existing restore tests pass (ran (audit), simulated). The stand-in is broader than the option Task 5 adds.
- The Codex control test of the plan's Task 3 passes today.
- The label counts of the plan's Task 2 today. The form renders 5 "Required" and 4 "Optional" labels and 4 "Keep Claude Code default" texts with the toggle off and with it on.

**The fix round.** A session then applied the audit to both documents, read the cited code again and ran one throwaway test, on the ToolHub cleanup under F-5.

Not done by anyone. No finding was checked in the desktop app or against a real Claude Code. No fix in this record was built, so no size here is measured. The session that wrote the record ran no test.

## Decisions

Every decision below is recommended by the session, 2026-11-23. The owner confirms each by approving the plan. None is an owner decision yet. FU-3 and FU-4 are argued by different standards (see F-2), and the plan puts that to the owner as its first open question.

| # | Decision | Finding |
|---|---|---|
| FU-1 | With "Sign in with my Claude login" on, a Claude Code profile's default model is optional and its placeholder reads "Keep Claude Code default". A default from a provider that is not the pass-through one shows one line that says where it goes. Switching the toggle on never clears a saved default. Onboarding gets the same behaviour, because it renders the same form. | F-1 |
| FU-2 | The README's upgrade note also tells an upgrader that a saved default model keeps the main model on that model's provider. | F-1 |
| FU-3 | Config load drops the `auth` block from the two Claude plugin entries, so the next save writes the config without it. Waits on the plan's open question 1. | F-2 |
| FU-4 | Config load does not drop the `claude-oauth-usage` account connector of a provider saved by an earlier version. The record says what the owner sees. The same open question can reverse it. | F-10 |
| FU-5 | For the pass-through provider, the provider dialog offers no connection check and no model refresh, runs no automatic probe, and shows a neutral line. The core probe result stays `supported: false`. | F-3, F-9 |
| FU-6 | The README heading becomes "Upgrading from 8.x" until the owner picks the version number. | F-4 |
| FU-7 | The release ships with the backups as they are. A follow-up PR then writes a Claude Code settings backup without the `x-llmr-api-key` line, as the Codex path already does for its token. | F-5 |
| FU-8 | Two PRs. The first carries F-1 to F-4. The second carries F-5 alone, because it changes which backups count as managed and so feeds the choice of the restore snapshot. | all |

The standing rules also apply. There are no outside users, so there is no compatibility path and no migration code. Upstream parity is never weighed. LLM Router never writes `~/.claude.json`.

## Findings

| # | Finding | Evidence | Verdict | Plan |
|---|---|---|---|---|
| F-1 | The default model can send the main model away from the subscription while the toggle is on, with no notice. | read | Defect | Task 2, Task 4 |
| F-2 | A config saved by an earlier version keeps the `auth` block of the two Claude plugin entries in the config database. | read, ran (audit) for the load | Defect. A manual step the owner already has also clears it | Task 1, if the owner keeps it |
| F-3 | The pass-through provider's dialog says three things that are not true, and one button reports every model as unavailable. | read, ran (audit) for the static render, inferred for the alert | Defect in the text, nothing is blocked | Task 3 |
| F-4 | The README heading names version 9.0, which the owner has not chosen. | read | Wording | Task 4 |
| F-5 | A `settings.json.llmr-backup-*` copy can hold the `x-llmr-api-key` line. Up to five copies stay per file. | ran (research), ran (audit), read | Works as written. Recommended change in its own PR | Task 5 |
| F-6 | A restore leaves `"env": {}` in a user file that had no `env`. | ran (research) | Defect, already has a task elsewhere | None here |
| F-7 | A shared-home profile writes `ANTHROPIC_MODEL=""` when the default model is empty. | read | Not known whether Claude Code reads it as unset | Gate B |
| F-8 | When `settings.json` is a symlink into another folder, the live key line is written into that folder while the profile is on. | read, inferred for the outcome | Works as written | Open with the owner |
| F-9 | Opening the edit dialog of a provider that uses a local login probes its base URL with the placeholder key. | read | Predates PR 146 | Task 3 for the pass-through provider. The rest is open |
| F-10 | A provider saved by an earlier version keeps an account connector whose parser no longer exists. | read (research) | Shows an error until the provider is added again | None, FU-4 |
| F-11 | An end-to-end test expects the automatic probe that FU-5 removes. | read | Test must change with Task 3 | Task 3 |
| F-12 | With an allowed model list set, the default model stays required, toggle or not. | read | Kept | None |

### F-1. The default model and the toggle

**What the form does (read).** Two checks require a default model for every Claude Code profile. `profileDraftValidation` sets "Default model is required." (`packages/ui/src/pages/home/components/profiles.tsx:1859-1861`), and `isProfileDraftSubmittable` returns false for an empty model (`packages/ui/src/pages/home/shared/profiles.ts:672-674`). Neither reads the toggle. The field is labelled Required with the placeholder "Select default model" (`profiles.tsx:908-917`). The toggle sits directly above it and its help text says the model list is Claude Code's own (`profiles.tsx:897-905`).

**What is saved and written (read).** A pick is saved as `Provider/model` (`components/model-selector.tsx:160`). The picker lists every enabled provider with a model, the pass-through one included (`shared/profiles.ts:67-86`). On apply, `claudeCodeModelEnv` writes that value to `ANTHROPIC_MODEL` and `LLMR_CLAUDE_CODE_MODEL` (`packages/core/src/agents/claude-code/environment.ts:86-99`). A model whose auto-compact window is 1,000,000 or more gets `[1m]` appended (`packages/core/src/profiles/service.ts:2381-2393`). The auth mode plays no part in that step (`service.ts:576-577`).

**The consequence (read for each step, inferred end to end).** With the toggle on and a default of `OtherProvider/model`, Claude Code sends that id. `claudeLoginRoutedModel` returns nothing for a prefix that is not the pass-through provider (`packages/core/src/gateway/features/claude-login-pass-through.ts:27-38`), so the request takes the normal route to the other provider and carries no login. That is the mixed use the spec designed (its "One predicate", rule 5). What is missing is any sign of it in the form. An upgrader who only turns the toggle on, as the README says, keeps the saved default and so keeps the main model off the subscription.

**Core needs no default model (read).** The default config ships `model: ""` for Claude Code (`packages/core/src/config/default-config.ts:135`). `claudeCodeModelEnv` writes no model key for an empty model. The profile card already prints "Keep Claude Code default" for one (`shared/profiles.ts:1322-1326`). The user doc already says an empty model keeps Claude Code's default (`docs/src/content/docs/en/configuration/profiles.md:34`, `:45`). Only the two UI checks disagree.

**Onboarding (read).** The "Connect agent" step renders the same `AddProfileForm` (`components/onboarding.tsx:295`) and waits on the same `canSubmitProfile`. One change covers both.

**Options weighed.**

| Option | Why it lost or won |
|---|---|
| Leave it | The upgrade path stays silent, and a new Claude-login profile cannot be saved without picking a model the toggle says is Claude Code's. |
| Optional with the toggle on | Won. It is the state the toggle text already describes, and core already handles it. |
| Offer only subscription models while the toggle is on | Lost. It removes the mixed use the spec designed, and it forces `Claude Code API/<id>` into `ANTHROPIC_MODEL`, which is the least checked path (see "Left for Gate B"). |
| A line when the default leaves the subscription | Won, together with the second option. Alone it does not remove the forced pick. |
| Clear the saved default when the toggle is switched on | Lost. It deletes a setting the user chose. The line covers it. |

**Recommendation.** FU-1 and FU-2.

### F-2. The stored `auth` block

**What an earlier version stored (read (research), from the pre-PR code at `f132d440`).** Import wrote two plugin entries, with keys ending `-claude-code-oauth` and `-claude-code-oauth-internal`. Each held `auth.headers.authorization` with an access token, and three more `auth` fields. No refresh token was stored.

**What happens to it now (read).** Config load copies `providerPlugins` through as they are (`packages/core/src/config/config.ts:833-834`). Save writes them back, because `sanitizeConfigForDisk` blanks only the gateway keys (`config.ts:766-777`). `withoutClaudeCodeStoredLogin` removes `auth` from these entries in two places, the compiled gateway config and the router plugin's copy of the app config (`packages/core/src/gateway/core-runtime/config-compiler.ts:67-70`, `:203`, `:705-713`). Neither copy is saved. So the entry's `auth` block stays in the saved config until the provider is removed. Nothing reads it (read (research) for the account service and the provider hook, read for the probe).

**What the screen says (read).** The edit dialog of that provider says "This provider forwards the login Claude Code sends. Nothing is stored." (`packages/ui/src/pages/home/components/providers.tsx:2318`). For a config saved by an earlier version that sentence is not yet true.

**Options weighed.**

| Option | Why it lost or won |
|---|---|
| Leave it, and have the owner remove and add the provider | Lost in the session's view. The app's own sentence stays untrue until he does. The step is already written down (see "The manual step that already exists"). |
| Drop `auth` from the two entries at load | Won. The renderer saves back what it loaded, so the first save after the upgrade writes the config without it. |
| A notice in the app | Lost. More code than the drop, and the block stays. |

**The manual step that already exists (read).** The pass-through plan's "Local steps for the owner", step 2, tells the owner to remove the `Claude Code API` provider and add it again after the release, and says that the step removes the stored value from the config database too. So the first option also closes F-2, on the one install the project has.

**Why the session does not call this migration code.** The drop does not carry old data forward and does not keep an old shape working. It removes a field that no code reads, from the one function every load goes through, and the same function already exists for the compiled copy. A config that never held the block is returned unchanged.

**The limit of that argument.** FU-3 and FU-4 apply different standards to the same kind of change. Each would remove, on load, data that only one earlier version wrote. F-10 rejects the removal of the connector because it "would exist only to tidy data of one earlier version" and one manual step covers it. Both reasons apply to the `auth` block as well. The removal would run on every load from then on, for data that one machine holds. What differs is the data. The block is a login value the dialog says is not stored, and the connector is a setting that shows an error. Whether that difference carries the decision is the owner's call. The plan puts it to him as its first open question, with three options. He can build the drop, drop it and rely on the manual step, or treat both findings alike and remove both on load.

**Recommendation.** FU-3, from the session. The audit leans the other way, to the manual step alone.

### F-3. The provider dialog for a provider that is not probed

**What core returns (read).** `probeGatewayProvider` returns `localClaudeProbeResult` when the key is the placeholder and a plugin key marks the provider (`packages/core/src/providers/probe.ts:104-107`, `:990-992`). The result makes no network call. It holds one protocol entry with `supported: false` and the message "Not checked. This provider forwards the login Claude Code sends and has none of its own to test with." (`probe.ts:974-988`). That is correct and stays.

**What the UI makes of it.**

1. **The alert box after Import (read for the path, inferred for the screen).** The automatic probe skips a draft that has plugins unless it is a local-login draft (`packages/ui/src/pages/home/App.tsx:1491`). An imported Claude draft is one, so the probe runs. The result has no supported protocol and no models, so `App.tsx:1544-1547` puts the "Not checked" message in `providerProbeError`. The form renders that string in its `role="alert"` box (`providers.tsx:2632`).
2. **The status panel (read).** For any local-login draft the panel's second row reads "Available after saving" and "The imported local agent login is connected when this provider is saved." in the success colour (`providers.tsx:1774-1784`, `:1817`). Nothing is connected when this provider is saved. A static render of the edit form shows that text, `Check Connection` and `Refresh provider models` for this provider today (ran (audit)).
3. **Check Connection (read).** The button is offered because the placeholder key counts as a credential (`providers.tsx:2034-2038`, `:1801`). Its dialog warns about real model requests. Every model then comes back unsupported, and `App.tsx:1724-1726` sets the alert again.
4. **Refresh models (read).** `refreshProviderModels` gets no models and no supported protocol and sets the alert (`App.tsx:1652-1655`).

5. **The step heading and the model list (read, ran (audit) for the render).** The Verify step's heading says "Run a real model request before relying on this provider." (`providers.tsx:2398`). With no probe, the model step shows the selected `claude-sonnet-5` and, in its left pane, "No provider models" with "This provider did not return a model list. Add model IDs with Custom model." (`providers.tsx:4111-4113`). The plan's Task 3 changes the heading for this provider and leaves the pane's text, with its reason.

Nothing is blocked. Save needs a name, a base URL and one model (`App.tsx:762-764`).

**The flag that already exists (read).** `AddProviderForm` computes `claudeLoginProvider` for exactly this provider (`providers.tsx:2015`) and uses it for one sentence.

**Options weighed.**

| Option | Why it lost or won |
|---|---|
| Leave it | The import path of the provider PR 146 is about shows an alert whose text says nothing is wrong. |
| Report the probe as supported | Lost. It states a call that did not run as verified. PR 146 chose against it, and a core unit test pins `supported: false`. |
| A neutral state through the contract types | Lost for now. It needs a field on the probe result, a list on the connectivity report and every reader of both. The research pass put it near 100 lines, not measured. One provider would use it. |
| Hide the check in the UI for this provider | Won. It removes every wrong signal a user can reach, changes no contract and leaves core as it is. |

**Recommendation.** FU-5.

### F-4. The README heading

The heading reads "Upgrading to 9.0" (`README.md:175`, read). The root version is 8.1.0 and the latest tag is `v8.1.0` (read). The pass-through plan lists the number as not chosen. The README already has a form with no target number, "Upgrading from 4.x" (`README.md:191`).

What the project's practice implies (read (research), from the tag and commit history). PR 146 is a `feat!` commit that removes a feature and needs a user action. The two earlier releases of that kind were majors, 5.0 and 7.0, so the practice implies 9.0.0. A minor has a precedent too. 6.1 and 7.2 each carried a README upgrade note for a removal or a changed default, so 8.2.0 would not be new.

**Recommendation.** FU-6. The number stays the owner's call.

### F-5. The gateway key line in settings backups

**The path (read).** In Claude login mode apply writes `x-llmr-api-key: <profile key>` into `env.ANTHROPIC_CUSTOM_HEADERS` (`service.ts:567`, `:2892-2910`). Each rewrite goes through `writeFileWithBackup` (`:2957-2971`), which calls `backupBeforeWrite` (`packages/core/src/profiles/backup-files.ts:99-102`). That makes a byte copy of the file as it was, named `settings.json.llmr-backup-<time>`. `pruneBackups` keeps five per file and has no age limit (`backup-files.ts:28-44`). A restore of a file that holds user content makes one more byte copy before it writes the stripped file (`service.ts:3854`, `:4002-4006`).

**A third writer (read, ran (fix round)).** `cleanupClaudeCodeToolHubSettingsFile` also writes a profile's settings file through `writeFileWithBackup` (`service.ts:428-442`), on an apply with a profile on and no gateway model. Two runs with ToolHub on did not reach that write with a key line in the file. For a system-default profile the takeover restore runs first, and the copy it makes holds the key line. For a profile with its own settings folder another cleanup removes the ToolHub key first and makes no copy. The plan's Task 5 covers the call all the same and adds a test for that apply.

**What a run showed (ran (research), seven scenarios, every file mode 600).**

| Scenario | Backups beside `settings.json` that hold a key line afterwards |
|---|---|
| User had a file. Apply, rotate the key, apply, switch off | 2. One holds the old key, one the key in use at switch-off |
| User had no file. Same steps | 0. The file, the backups and the marker are removed |
| User had a file. Eight rotations | 5, one key each. The user's own earlier backup was pruned |
| User had a file. Ended by a quit, profile still on | 2. The newer one holds the key that still works |
| Helper mode | 0 |
| The user's file already had its own custom headers | 2. The live file got the user's line back unchanged |
| Pi, with its `models.json` | 2, the same pattern |

**What limits it.** The custom-headers scenario was run again. The newest copy holds the user's lines and the key line after them (ran (audit)). Switching a profile off removes its key from the stored key list, so the copies left by a switch-off hold a key the gateway no longer accepts (ran (research)). A quit leaves the profile on and its key valid. Every copy is readable by the owner only. The same key already sits under `CONFIGDIR/bin/` in every mode (`service.ts:580`, read) and in the config database (read (research)).

**Other agents (read).** OpenCode, Kilo, Pi and ZCode write the profile key into the agent's config and back it up with the same byte copy (`agents/opencode/profile-config.ts:227`, `agents/kilo/profile-config.ts:141`, `agents/pi/profile-config.ts:218`, `agents/zcode/profile-config.ts:249`). Codex is the exception. `writeGlobalCodexConfig` writes a stripped text through `backupContent`, and its restore makes no copy of the live file (`service.ts:1404-1444`, `:4001-4006`).

**Why the line is in `settings.json` at all (read (research), from Claude Code's docs).** Claude Code has no helper for request headers. A system-default profile runs plain `claude` with no wrapper, so the only place the header can come from is the settings file.

**Options weighed.**

| Option | Why it lost or won |
|---|---|
| Leave it and say so in the docs | Won for this release. |
| Strip the line from existing backups at restore | Lost. Copies with a working key still exist while the profile is on. |
| Never write the line into a backup | Won as the follow-up. It removes the line where the copy is made, and Codex is the precedent. |
| Delete the backups at switch-off or rotation | Lost. They are also the newest record of the user's own edits, and a restore prefers them to an older original. |
| Change the key at quit | Lost. It breaks a Claude Code session that is still open and the next start. |
| Keep the line out of `settings.json` | Not possible for a system-default profile. |

**What the follow-up changes besides the copy (inferred).** A settings file counts as LLM Router's own only when every `env` key is one LLM Router manages, and `ANTHROPIC_CUSTOM_HEADERS` is not on that list on purpose (`service.ts:2936-2947`, `:4108-4124`). So today every Claude-login backup counts as the user's. A backup written without the key line, from a file that held nothing else of the user's, has no such key and counts as LLM Router's own. Two readers of that test then behave differently. `pruneBackups` spares the newest backup that is not LLM Router's own, and `originalSnapshotCandidate` returns the newest one that is not (`service.ts:3972-3999`). The inferred result is that a restore then falls back to an older copy of the user's file where today it takes the Claude-login copy with LLM Router's keys removed. Today's half is run. A helper-mode restore after Claude login mode writes `{"env":{}}` into a file that was `{}` (ran (audit)). With the key line removed from every Claude settings backup, the restore writes `{}` and the existing restore tests pass (ran (audit), simulated). The real change is narrower than that stand-in, so the plan's Task 5 still starts with the run.

**Recommendation.** FU-7.

### Side findings

**F-6.** After a restore the user's file was `{"theme":"dark","env":{}}` where it had been `{"theme":"dark"}` (ran (research)). `docs/superpowers/plans/2026-11-22-backlog-restore.md`, Task 3, already has the test `a restore leaves no empty env in a file that had none` and the change to `stripManagedClaudeCodeSettingsContent`. It needs no second task.

**F-7.** For a shared-home profile, apply sets every managed model key it left unset to `""`, so the user's own value under `--settings` is cancelled (`service.ts:583-588`, read). With FU-1 a Claude-login profile can have an empty default, so `ANTHROPIC_MODEL` is then `""` in that file. Whether Claude Code treats an empty value as unset is not known.

**F-8.** `writeFileAtomic` resolves a symlink and writes to its target (`backup-files.ts:104-106`, `:180-189`, read). So when `~/.claude/settings.json` links into a dotfiles folder, the file in that folder holds the key line while the profile is on (inferred, not run). The backups are named from the link's own path and stay beside the link. No change to the backups touches the live file. The spec's "What a sync filter must do" already tells a filter to drop the line.

**F-9.** An edit draft starts with an empty plugin list (`packages/ui/src/pages/home/shared/providers.ts:797`, read), and the automatic probe sends the draft's own list (`App.tsx:1516`). Without a plugin in the request, core does not recognise a local-login provider and probes the base URL with the placeholder string as the key. PR 146 did not change this. FU-5 skips the automatic probe for the pass-through provider, which closes it for that provider. The Codex, Grok and other local-login providers keep the behaviour.

**F-10.** The earlier import gave the provider an account connector with `parser: "claude-oauth-usage"`. Load keeps connectors as they are (`config.ts:1797-1808`, read). On a refresh the connector fails before any network call, with "Local agent account credential was not found. Sign in again, then re-import the local login provider." (`packages/core/src/providers/account-service.ts:1516`, read). So wherever account snapshots show, that provider shows an error until it is removed and added again, or account balance is turned off in its edit dialog (read (research) for the dialog). The provider itself works without that step. Turning on the toggle in the profile is enough.

Dropping the connector at load was weighed and is not recommended (FU-4). It would exist only to tidy data of one earlier version, which is what "no migration code" rules out, and one manual step on one machine covers it. Load does already remove one other stale connector, through `removeOpenCodeProviderAccountConfig` (`config.ts:1516`, read), so the choice is a judgement and the owner may reverse it.

**F-11.** `tests/e2e/local-agent-login-import.spec.ts` has the test "onboarding discovers the imported login's models through its plugins". It mocks the probe with four models and asserts that a probe request was made (read). The real core no longer returns models for this provider, so the mock describes the pre-PR behaviour. FU-5 removes the request, and the test changes with it.

**F-12.** Both UI checks also require a default model when an allowed model list is set (`profiles.tsx:1862-1864`, `shared/profiles.ts:669-671`, read). FU-1 leaves that rule as it is. Whether a bare model id from a Claude-login profile, routed as `Claude Code API/<id>`, passes a profile's explicit allowed list was not traced.

## Not verified

- Anything a running app would show. That covers the alert after Import, the result of the edit dialog's probe and how account snapshots draw the error of F-10. The status panel and the model step were seen in a static render only.
- Every result marked ran (research) that the audit did not repeat. The audit repeated the user-file, quit and custom-headers scenarios of F-5.
- What `originalSnapshotCandidate` and `pruneBackups` do once the real change writes a backup without the key line. The simulated run under F-5 used a broader stand-in. Plan Task 5, Step 1 and Step 5.
- A path on which the ToolHub cleanup of F-5 copies a file that holds the key line. Two runs did not find one.
- What an earlier version stored in the two plugin entries (F-2). The audit did not derive it again from `f132d440`.
- The code of every fix. Nobody has built one. The whole core and UI suites, typecheck, lint and the end-to-end spec were not run against these changes.
- The web UI's path for `providerPlugins`. The research pass read that the browser gets a masked value and the server restores it on save. The session did not read it. FU-3 rests on load, which both the desktop app and the web UI go through.
- Whether the config database still holds the old value in free pages, its write-ahead log or an older backup row after the config is saved without it.
- The lifetime of a Claude Code access token, so whether a stored one could still be accepted.
- Windows, where file modes do not apply.
- The other agents' backups, apart from Pi, were read and not run.
- Whether settings `env` wins over process env for `ANTHROPIC_CUSTOM_HEADERS`, as the spec's probe found for `ANTHROPIC_BASE_URL`.
- F-8 and F-12 as stated there.

## Left for Gate B

Gate B is the pass on the throwaway VM in the pass-through plan. These findings add five checks to it. The plan lists them with their pass conditions.

- What Claude Code's `/model`, `/status` and status line show when the default model is a pass-through pick such as `Claude Code API/claude-sonnet-5`, the one model the imported provider lists (`packages/core/src/agents/local-providers/claude-code.ts:19`, read).
- Whether Anthropic accepts a model id that ends in `[1m]`. The pass-through plan already names this one.
- Whether Claude Code treats `ANTHROPIC_MODEL=""` as unset (F-7).
- That a Claude-login profile with no default model starts on Claude Code's own default and that its requests reach the pass-through provider.
- That a default from another provider sends the main model there while a pick from Claude Code's own list goes to the subscription.
