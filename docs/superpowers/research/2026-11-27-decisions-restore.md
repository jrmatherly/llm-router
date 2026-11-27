# Decision research for the restore rows

Research for six rows of the "Decide" table in [`../plans/2026-11-27-open-findings.md`](../plans/2026-11-27-open-findings.md), done on 2026-11-27 at `main` `b45e25c5`.
It changes no code. Each claim is labelled run, read or inferred.

How the runs were made. LLM Router code ran as a bundle of the profile service built into the session's scratch folder, under `env -i` with a `mktemp -d` home and every `LLMR_INTERNAL_*` folder inside it. Codex ran alone as `codex mcp list`, which loads `config.toml` and opens no connection, under `env -i` with `HOME` and `CODEX_HOME` set to a fresh temporary folder. The checksums of `~/.codex/config.toml` and `~/.claude/settings.json` were the same before and after, and nothing under `~/.codex`, `~/.zcode` or `~/.llm-router` was newer than the marker written before the first run (run).

No file under `packages/core/src/profiles/` changed after PR 171 (`git log 442cebb9..HEAD`, run), and the `service.ts` the batch 10b reviewer saved is byte for byte today's file (run). So that reviewer's runs describe `main` today.

## Summary

| ID | Question | Recommendation | When | Confidence |
|---|---|---|---|---|
| F-RESTORE-1 | May a ZCode cache entry be taken by its id when the config is gone and a saved original exists? | No for 9.1.0, as the default. If it is closed later, close it with a record of the ids written at apply time, not with the id rule | Remediation, after the VM pass | High that the id rule is not safe as stated. Medium on how often the case occurs |
| F-RESTORE-2 | Leave the Restore original settings button as it is? | Yes. Add one docs sentence for the other agents | Docs sentence any time. Widening after the VM pass, if at all | High |
| F-RESTORE-3 | Installed Codex version only? | Yes | Run Task 9 after the release | High |
| F-RESTORE-4 | Leave Workbuddy's `models.json` without a stripper? | Yes | Never, unless a user reports a lost model list | High |
| F-RESTORE-5 | Keep both researcher's choices? | Keep the notice rule. The record rule is not in the code, so there is nothing to keep, and the row should say so | Correct the row now | High |
| F-CODEX-1 | State the headerless table as a limit and build nothing? | Yes. Add the limit to the Codex docs page | Docs sentence before 9.1.0 or with remediation | High |

One recommendation differs from its row. F-RESTORE-5's first half describes a design that batch 9's review replaced.

## F-RESTORE-1. ZCode's model cache when `v2/config.json` is deleted

1. **Still true (run).** With a user's cache in place, a global ZCode profile applied, `v2/config.json` deleted and the profile switched off, the status is ok and reads "ZCode config was removed because it did not exist before LLMR". The cache keeps the `llm-router` entry, and `defaultModel` and `lastUsed` still point at it. The user's `defaultModel` is only in `bots-model-cache.v2.json.llmr-original`. A second save changes nothing. The cause is `zcodeOwnedProviderIds` in `service.ts`, which returns no id when `v2/config.json` does not exist, so `stripManagedZcodeModelCacheContent` has nothing to remove (read).
2. **Weight.** No file holds the key in this state (run), so nothing leaks. What the user sees is ZCode opening with LLM Router's model selected and a provider that no longer answers. They can pick their own model again in ZCode. The case needs someone to delete `v2/config.json` while the takeover is on. The harness planted that deletion in 9 and 14 of 400 scenarios, which says nothing about real use. Whether ZCode itself ever removes that file was not checked, since no ZCode binary is installed here (`command -v zcode` found nothing). With no outside users, nobody has this state today (inferred).
3. **Outside facts.** None fetched. The behaviour depends only on LLM Router's own files.
4. **Options.**
   - **(a) Leave it, as the default.** No change. The cost is the state above.
   - **(b) The row's option, prototyped (run).** `zcodeOwnedProviderIds` returns the given ids when `v2/config.json` is gone and the cache has a `.llmr-original`. The patch lived only in the scratch bundle. Of six scenarios it fixed three, including one where the user picked another default model during the takeover, and that choice was kept. It left one unchanged, a cache that did not exist before LLM Router, because there is no saved original to satisfy the rule. It made one worse. When the user's own original cache already held a provider with the id `llm-router`, the switch-off returned two not-ok statuses that say no original backup was found, where `main` returns ok. So the id rule fails on its first small matrix.
   - **(c) Record the ids at apply time.** `globalZcodeWriter` already computes the owned ids before it writes. Store them beside the cache's written record, and have `restoreZcodeFiles` read that record when `v2/config.json` is gone. This is a record of what LLM Router wrote and judges nothing by content. It also covers the cache with no original. Cost is inferred at 20 to 40 source lines plus tests, in `service.ts` and `backup-files.ts`. Nobody built it.
   - **(d) Report it.** When the cache holds the profile's id and `v2/config.json` is gone, return a not-ok status that names the saved original. The user is told, and the file is left alone. A few lines.
5. **Recommendation.** (a) for 9.1.0. The saved original is weaker evidence than the row assumes. It stays beside the cache after an ordinary clean restore (run, scenario E), so "a saved original exists" is true for every install that ever took ZCode over, and the rule then rests on the id alone. That is the batch 9 pattern, and the prototype showed the same kind of miss within six cases. Pi's sweep does use "a snapshot exists" as its gate (`restoreInactiveGlobalProfileConfigs`, read), so the pattern is in the code already. There it only narrows which files the sweep looks at, and the strip still goes by Pi's own matchers (inferred from the loop, not run). If the VM pass or a user shows the case is real, build (c). What would change my mind is evidence that ZCode deletes or rewrites `v2/config.json` on its own, which would make the case common and move (c) or (d) before a release.
6. **Gaps met on the way.** A cache that did not exist before LLM Router is left with LLM Router's entry and no marker at all after the same deletion (run, scenario D). The cache's `.llmr-original` staying after a clean restore is by design for the other files too, and was not examined further.

## F-RESTORE-2. The Restore original settings button

1. **Still true (read).** `isRestorableGlobalProfile` in `contracts/app.ts` allows a global Claude Code or Codex profile only. The Profiles page shows the button by that function, `disableGlobalAgentProfile` in `config/config.ts` refuses any other profile, and the gateway's combined error names the button only for those two (`pipeline.ts`).
2. **Weight.** A user of OpenCode, Kilo, Pi, ZCode or Workbuddy sees no button. Their file comes back three other ways (read). Switching the profile off and saving restores it in the same save. Stopping the gateway or quitting LLM Router restores every global takeover through `restoreTakeoversWhenNoGatewayServes`. Starting with the profile off sweeps it. The button gives two things the switch does not. It works when a save is refused because some other setting is invalid, such as another profile's model that is no longer served, and it is named in the gateway's error. For the five agents the way out of a refused save is to stop the gateway or quit, which is not written anywhere a user would look.
3. **Outside facts.** None apply.
4. **Options.** (a) Leave it. (b) Widen it to the five agents after Task 8, which is now merged. `disabledProfileStatus` already restores each of them, so the change is the predicate, the refusal text, the dialog copy in `profiles.tsx` that names two files, the error pointer and the docs (read; size inferred at under 40 lines plus tests). (c) Leave it and add one sentence to the "Restore original settings" section of the Profiles docs page that says what to do for the other agents when a save is refused.
5. **Recommendation.** (a) with (c). The plan's reason for waiting still holds. The five strippers merged in the last two days, 37 restore findings are open against them, and F-RESTORE-31 is a fault in the button's own path. Widening the button now puts those paths behind one more trigger before the VM pass has used them. Decide on (b) after the VM pass. What would change my mind is a VM finding that a refused save traps an OpenCode or Pi user.
6. **Gaps.** None new.

## F-RESTORE-3. The Codex token command prototype

1. **Still true (read).** Restore Task 9 is unbuilt and no `2026-11-22-codex-token-command.md` exists. `service.ts` still writes `experimental_bearer_token` into the provider table.
2. **Weight.** This is an investigation. Nothing a user sees waits on it.
3. **Outside facts, 2026-11-27.** The installed Codex is `codex-cli 0.172.0`, and 0.172.0 is the `latest` tag of `@openai/codex` on npm. GitHub's newest releases are `0.174.0` alphas (run). The config reference at `developers.openai.com/codex/config-reference` lists `model_providers.<id>.auth` with `command`, `args`, `cwd`, `timeout_ms` (default 5000) and `refresh_interval_ms` (default 300000), and says not to combine it with `env_key`, `experimental_bearer_token` or `requires_openai_auth`. It calls `experimental_bearer_token` discouraged and points to `env_key` (read). That matches X-2. On the installed binary a config with the `auth` table loads, and the same config with `experimental_bearer_token` or `env_key` beside it is refused with "provider auth cannot be combined with" and the key's name (run, config load only). So Task 9's premise holds on this version. No token was sent anywhere and no model request was made. That part is Task 9.
4. **Options.** (a) The installed version only. (b) Also 0.134.0. (c) Every minor between.
5. **Recommendation.** (a). The installed version is the current stable, so the prototype's go or no-go is measured on what a new user installs today. The oldest version with the `auth` table matters only if the answer is go and a plan is then written, and that plan can carry a minimum version check as one of its tasks. One fact for that later plan, from a run today. Codex accepted an unknown key inside the `auth` table without complaint, so an older Codex that does not know `auth` may ignore the table and send no token (inferred from that run, not measured on an old version). That is a reason to read the version before writing the table. It is not a reason to download old versions now. Run Task 9 after the 9.1.0 release, since it changes no product code.
6. **Gaps.** The reference now also lists `model_providers.<id>.gateway_oauth.credential_export`, a command that prints one access token, with `args` and a `timeout_ms` default of 30000. Neither X-2 nor Task 9 mentions it. Whether it suits LLM Router was not examined. Task 9 could add one row for it.

## F-RESTORE-4. Workbuddy's `models.json`

1. **Still true (read).** `writeWorkbuddyModelsConfig` in `agents/codex/app-launch.ts` writes every model with `apiKey` set to the literal text `${LLMR_PROFILE_API_KEY}`. `isManagedWorkbuddyModelsContent` recognises the file by that placeholder on every model. The restore in `disabledProfileStatus` and in the Workbuddy loop of `restoreInactiveGlobalProfileConfigs` passes no strip function, so the file is restored whole or left.
2. **Weight.** No copy of the file can hold a key. The cost is a model list changed during the takeover, plus one backup and one marker beside the file, as the plan says. Workbuddy is not installed here, so nothing was run against the app.
3. **Outside facts.** None fetched.
4. **Options.** (a) Leave it. (b) A stripper by placeholder. (c) A follow-up task.
5. **Recommendation.** (a), never unless reported. Nothing since PR 169 argues against it. None of the 37 open restore rows concerns this file.
6. **Gaps.** None new.

## F-RESTORE-5. Two researcher's choices

1. **The row is half stale (read).**
   - **"A profile's record is kept while a saved original exists" is not in the code.** It was the design of restore Task 3's text. Batch 9's review found it lost user settings, and the plan's own status line says the section "The record outlives the restore" is not in the code. What is built is `releaseClaudeCodeSettingsFile`, which clears `endpoints` and `displacedEnv` and sets `restored` on every finished restore, with no test of whether a saved original exists. `restoreDisabledGlobalProfile` calls it even after a pass that changed nothing, and its comment says a record kept past that point would be trusted by the next apply. `unsettleClaudeCodeSettingsFile` clears the flag at each apply.
   - **"A save's notice is set only by a profile's own restore" is built as stated.** `inactiveGlobalCleanupStatus` returns no `changed`, the three per-profile restore statuses do, and `profile-status-notices.ts` shows a notice only for an ok status with `changed` and the profile off, or with a copy.
2. **Weight.** The notice rule means a save about something else shows nothing for a profile switched off long ago, and a failed sweep still shows as an error. The built record rule was measured in batch 9's review. A restored file changed on a later pass 0 times against 247 on the older code.
3. **Outside facts.** None apply.
4. **Options.** Keep the notice rule or show sweep restores too. For the record there is no choice left to make. Going back to the kept record would bring back the faults that review found.
5. **Recommendation.** Keep the notice rule. Reword the row so its first half says what is built, the `restored` flag, and mark that half closed. Evidence since that bears on the built rule is F-RESTORE-23 to 26, which are its known edges and are already rows of their own.
6. **Gaps.** The same stale sentence is in the delivery index under "Four choices the researchers made".

## F-CODEX-1. A provider table with no header

1. **Still true (run).** An original that defines the profile's provider id with no header, as `[model_providers]` followed by `llm-router = { ... }` or as root keys `model_providers.llm-router.name = ...`, gets a second `[model_providers.llm-router]` from an apply. The applied file fails to parse with "Cannot declare ('model_providers', 'llm-router') twice" in Python's `tomllib`, and the apply's status is ok and reads "Codex config is managed by LLMR". Switching the profile off restores the original byte for byte in both forms. The scanner in `codex-config-strip.ts` goes by header statements.
2. **Weight.** Codex 0.172.0 itself loads both headerless forms as that provider (run: `model_provider = "llm-router"` resolves, where an undefined id fails with "Model provider `missing` not found"). On the doubled file Codex refuses to start with "duplicate key" at the second header (run). So during the takeover Codex does not start while LLM Router reports success, and the user's file comes back intact at switch-off. The case needs the user's own provider to carry the same id as the profile's, `llm-router` by default, and to be written without a header. A headerless provider under any other id is fine. The applied file parses and Codex loads both providers (run, both forms). Nobody has reported the form, and the id collision makes it close to nil (inferred).
3. **Outside facts.** The provider examples on `developers.openai.com/codex/config-advanced` that this pass read all use a `[model_providers.<id>]` header (read, not every example on the page). TOML 1.0 forbids defining a table twice, which both parsers enforce (run).
4. **Options.** (a) State the limit and build nothing. (b) The plan's option, treat a headerless statement as the table, about 30 source lines, and an edited restore would lose it from the live file. (c) Not in the row. Refuse the apply with a not-ok status when the original defines the profile's id without a header, the way stripper Task 7 refuses a reserved id. It turns a false ok into a true refusal and needs no restore logic. Size inferred at 10 to 20 lines plus a test.
5. **Recommendation.** (a). The file is restored exactly, no key is lost, and the trigger needs a name collision. If anything is ever built, build (c) and not (b). The limit is in PR 166's text and not on the Codex docs page (a search of the two docs pages found nothing), so add one sentence there. What would change my mind is a tool that writes Codex providers inline by default, which I did not find.
6. **Gaps.** None beyond the missing docs sentence.

## Not checked

- ZCode, Workbuddy, OpenCode, Kilo and Pi were not run. `command -v` found none of them. Every ZCode and Workbuddy claim is about LLM Router's files.
- Whether ZCode deletes or rewrites `v2/config.json` or its model cache on its own.
- Option (c) of F-RESTORE-1 and option (c) of F-CODEX-1 were not built. Their sizes are inferred.
- The F-RESTORE-1 prototype ran six scenarios on one profile. It is enough to show the id rule fails, not to show any rule is safe.
- Restore Task 9 itself. No token command was executed and no model request was made.
- Codex versions other than 0.172.0, and the `gateway_oauth.credential_export` table beyond its entry in the reference.
- The desktop app and the Profiles page in a window. The button's reach was read in the code.
- The scratch scripts and logs are in the session's scratch folder and are not kept.
