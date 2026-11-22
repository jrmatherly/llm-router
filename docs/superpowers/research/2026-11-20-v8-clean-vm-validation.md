# v8.0.0 clean-VM validation

Running record of the v8.0.0 checks in a disposable UTM macOS VM, started 2026-11-20. Fixes are batched: nothing here is fixed until the pass ends and Jason says to start.

The fix plan is [`docs/superpowers/plans/2026-11-21-v8-clean-vm-fixes.md`](../plans/2026-11-21-v8-clean-vm-fixes.md), written 2026-11-21 and awaiting review. Where the plan's cause for a finding differs from an early note below, the plan is the later reading.

## Setup

- Guest: macOS 27.2.1 (26B131), arm64, fresh install, no Claude Code, Codex or other agent, UTM disposable mode.
- Share: `~/vm-proof/llmr/` on the host, `/Volumes/My Shared Files/vm-proof/llmr/` in the guest.
- `install-check.sh` installs the dmg, checks signature and notarization, launches the app and logs first-launch state. `collect.sh [label]` is read-only and rerunnable. Both write to `logs/` in the share.
- `QUARANTINE=1 ./install-check.sh` marks the app as a browser download. macOS then runs it translocated, so use it only to see the Gatekeeper prompt.

## Passed

Evidence is `logs/install-check-20261120-151040.log` (quarantined run) and `logs/install-check-20261120-152444.log` (clean run).

- The dmg's sha512 matches `latest-mac.yml`.
- `codesign --verify --deep --strict` exits 0. Developer ID team `7BSA2L4Z5L`, hardened runtime.
- `spctl` accepts the app as `Notarized Developer ID`, and `stapler validate` passes.
- With the quarantine flag set, macOS shows the standard first-launch prompt and opens the app.
- Bundle version 8.0.0, `LSMinimumSystemVersion` 13.0, arm64.
- A clean launch runs from `/Applications`, creates `~/.llm-router` (`config.sqlite` mode 0600), and puts `llmr` on `PATH` at `~/.llm-router/bin/llmr`, which prints `llmr 8.0.0`.

- First launch creates no `~/.claude`, `~/.codex` or `~/.claude.json` on a machine without them, and leaves no crash report (`logs/collect-first-launch-20261120-153414.log`).
- Onboarding with a custom endpoint (a self-hosted CLIProxyAPI, entered with a `/v1` base URL): protocols auto-detected, Check Connection verified `claude-haiku-5-5`.
- After onboarding the gateway child listens on `127.0.0.1:3456` only and `/health` returns 200 (`logs/collect-server-started-20261120-160700.log`).
- Requests through the gateway with the generated "Local Gateway" key (`logs/gateway-check-20261120-161853.log`): `/v1/models` without a key is 401, with the key it lists `CLIProxyAPI/claude-haiku-5-5`; an OpenAI chat completion, a streamed one (ends with usage and `[DONE]`) and an Anthropic `/v1/messages` call each return 200 and "pong"; an unknown model returns 400 naming the allowed models.
- With request logs on, Logs lists the three model calls with status, stream flag, tokens and duration, and the expanded row shows the request and response bodies. Overview and the tray both show 6 requests, 882 tokens (858 in, 24 out) and 100% success, so usage counts requests made while request logs were off. The menu bar title reads "882 tokens".
- The expanded log row's request headers show `X-Api-Key` and `Authorization` as `[redacted]`.

## Findings to fix

### F-1: first launch shows "Service failed to start"

A new install shows a red error banner before the user has done anything.

- The default config enables the gateway (`packages/core/src/config/default-config.ts:106`).
- Launch starts it (`gatewayService.ensureStarted` at `packages/electron/src/main/main-app.ts:223`).
- With no provider the start throws `NO_AVAILABLE_GATEWAY_MODELS_MESSAGE` (`packages/core/src/gateway/application/gateway-service.ts:204`) and the status becomes `error`.
- The onboarding screen renders that as `GatewayStartupErrorBanner` (`packages/ui/src/pages/home/components/layout.tsx:82`).

It shows on every empty-config first launch and does not depend on the OS or on installed agents. Traced by reading the code, not reproduced from source.

### F-2: the banner overlaps the onboarding heading

The banner's wrapper is `absolute inset-x-0 top-12 z-30` (`packages/ui/src/pages/home/components/layout.tsx:81`), so it floats over "Configure provider" and its subtitle. Any gateway error on the onboarding screen would cover the heading, not only F-1's.

### F-3: two protocols show their raw ids

In a provider's Advanced settings, "Protocol details" lists `openai_image_generations` and `openai_video_generations` by id while the other five rows have names ("OpenAI Chat", "Gemini Interactions"). The label list at `packages/ui/src/pages/home/shared/options.ts:166` ends without entries for them. Seen on the onboarding "Verify connection" step with a custom endpoint.

### F-4: "Default model is required." under a dropdown that shows a model

On the onboarding "Connect agent" step the Default model dropdown reads `CLIProxyAPI/claude-haiku-5-5` and the warning below it says "Default model is required." The warning comes from `profileDraftValidation` (`packages/ui/src/pages/home/components/profiles.tsx:1846`) when `draft.model` is empty, so the dropdown is displaying an option the draft does not hold. Not traced further. Confirmed in the VM: picking the same model by hand clears the warning, adds a clear (x) control to the dropdown and enables **Next step**. So the unselected dropdown renders its first option as if it were the value.

### F-5 (to confirm): "Connect agent" on a machine with no agent

The step preselects Claude Code with Effect scope "System default" and says nothing about Claude Code not being installed. `onboarding.tsx` has no skip path (no match for "skip"). Open questions: can a user with no agent finish onboarding without creating a profile, and what does a System default profile write when `~/.claude` does not exist.

Result (`logs/collect-server-started-20261120-160700.log`): finishing onboarding created `~/.claude/settings.json` on a machine with no Claude Code, beside a `settings.json.llmr-original-missing` marker. There was no way offered to finish without a profile. `~/.claude.json` was not created.

### F-6: onboarding wrote a Codex setup nobody asked for

The user created one profile, Claude Code. After onboarding, API Keys lists "Profile: Codex" beside "Profile: Claude Code", and `~/.codex/` exists with `config.toml`, `llm-router.config.toml`, `llmr-model-catalog.json`, a `.llm-router` directory and a `.llmr-original-missing` marker for each file. Codex is not installed.

Cause: the default config ships two enabled global profiles, `default-claude-code` and `default-codex` (`packages/core/src/config/default-config.ts:154`). Once the gateway runs, launch applies every enabled profile (`applyProfileConfig` at `packages/electron/src/main/main-app.ts:228`). The onboarding step only edits the Claude Code one, and never mentions the Codex one.

What it wrote (`logs/collect-agent-files-*.log`, keys masked): `~/.codex/config.toml` gets top-level `model_provider = "llm-router"`, `model = "CLIProxyAPI/claude-haiku-5-5"` and `model_catalog_json`, plus a `[model_providers.llm-router]` block with `base_url = "http://127.0.0.1:3456/v1"`, `wire_api = "responses"` and the profile's bearer token. So on a machine with Codex installed, plain `codex` would be routed through LLMR to the first configured model, here a Claude model, without the user choosing Codex anywhere. `~/.claude/settings.json` gets `apiKeyHelper`, the three base-URL variables, `NO_PROXY` and `ANTHROPIC_MODEL`.

Not checked: what happens to a user's existing top-level `model` and `model_provider` in `config.toml`, and whether **Restore original settings** removes all of it.

### F-7: the install guide's last check needs logs that are off by default

`docs/src/content/docs/en/guides/install.md` "Verify the installation" step 4 says to confirm the request under Logs. A new install shows "Request logs are off" with an **Enable request logs** button, so the step fails as written. Docs fix: say to enable request logs first.

### F-8 (to confirm): refused requests are missing from Logs

With request logs on, a `gateway-check.sh` run made five gateway requests: `/v1/models` without a key (401), three model calls (200) and one unknown-model call (400 at `model_resolution`). Logs lists 3 rows, all 200. The 401 and the 400 are absent, so a user debugging a rejected request finds nothing there. Decide whether that is intended (a 401 flood would fill the log) and whether the 400 should be logged. Also cosmetic: the Model and Time columns truncate (`claude-h... → claude-h...`, `16:20:4…`) with the window at about 1660 px.

**Cause, read on 2026-11-21 (plan Task 10, Steps 1 and 2).** Read in `jrmatherly/llmr-gateway` at tag `v1.0.22-llmr.2` (`e8d61f0`), the release LLMR pins, and in LLMR at `fe56382f`. Nothing here was run. Paths under `src/` are the fork's.

- The claim is confirmed, with one correction. A Logs row comes from a raw trace, and every trace goes through `publishRawTraceCaptureSafe` (`src/gateway/handler.ts:9390`), which returns at line 9398 when it is handed no capture. A capture exists only once an upstream request was built or an upstream body came back (`resolveAttemptRawTraceCapture`, `handler.ts:9614`).
- The 400. An unknown model fails in `resolveTargetModel` for each target provider and is pushed as a `model_resolution` attempt with no upstream fields (`handler.ts:686` to `694`; the other seven `model_resolution` pushes in that file have the same shape, and which one served this request was not traced). When every attempt has failed, the handler looks for the last attempt that has upstream fields, finds none, and passes `undefined` to `publishRequestFailureEventSafe` (`handler.ts:2121` to `2164`, and the same block at 3427). `sendCountedBadRequest` (`handler.ts:6714`) passes no capture at all. So no trace is written.
- The 401. The correction: the recorded 401 did not come from `beforeAuth`. The response body in `logs/gateway-check-20261120-161853.log` is `Missing auth token header: authorization`, which is the fork's static key check (`src/gateway/auth.ts:172`, sent at `auth.ts:64`). In the desktop app the gateway child serves the public port itself (`publicGatewayMode`, `packages/core/src/gateway/core-runtime/supervisor.ts:371`), and `GET /v1/models` has only that check as a pre-handler (`src/gateway/routes.ts:110`). That route calls no trace code, so a successful `/v1/models` writes no row either. A wrong key on a `POST` route is refused one step earlier, by LLMR's own hook (`packages/core/src/gateway/core-runtime/router-plugin.ts:365`, message built at `src/gateway/routes.ts:624`), which is the 401 of F-16. Both run before the handler and before a provider is chosen, and a trace needs a provider.
- LLMR's own front (`authorize` in `packages/core/src/gateway/auth/api-key-authorizer.ts`) is not on this path in the desktop app. It answers only when LLMR runs the compatibility server in front of the child.

**Proposal for the owner (not built, sizes are estimates from reading).**

1. Refused after authentication (the 400). A fork commit can do it in one place: when `publishRequestFailureEventSafe` gets no capture, it builds one from the reply it already holds (status and error body). LLMR reads a row's status from the trace's upstream response metadata (`packages/core/src/observability/raw-trace-sync.ts:1710`), so the row would show 400 with no change in LLMR. That is about ten lines and a test in the fork, then a `v1.0.22-llmr.3` release and an LLMR PR that bumps the two URLs. The push and the tag need the owner's word (V-10). Not checked: that the importer accepts a trace with empty upstream request parts, and the separate failure path in `src/gateway/openai-json.ts` (embeddings, images, video).
2. Refused before authentication (the 401). Recommended: count them, do not log them as rows. A counter with the last time and the last reason answers "why is my agent getting 401" without letting an unauthenticated caller fill the log. LLMR's hook already sees a wrong key on the model routes, so that half needs no fork commit. A missing key, and any key on `GET /v1/models`, is refused inside the fork and needs a fork commit to be counted. One row a minute per client address needs the same fork commit plus a limiter, for little more than the counter gives.

### F-9 (to confirm): the cost total does not equal the per-request costs

Six identical requests (143 in, 4 out). A Logs row shows Cost `$0.000016`. Overview and the tray both show `$0.000168` for the six, which is `$0.000028` each, 1.75 times the row. Either the two views price a request differently or the three requests made before logs were on were priced differently. Not traced.

### F-10: values collide in the expanded log row

In the expanded row's summary grid, Request ID runs into Client (`a6807dd9-9af9…curl`) and Model runs into Input (`claude-haiku-…143`). Seen with the window about 1660 px wide and the page zoomed out one step.

### F-11 (to confirm): zooming out pushes the header under the traffic lights

With the page zoomed out, the sidebar toggle sits under the green window button and the "Workspace" label sits under the buttons. Ask Jason whether he zoomed (Cmd -) and check the header's left inset at zoom levels below 100%.

Update: at 100% zoom the header sits clear of the window buttons, so F-11 is specific to zooming out. F-10 remains at 100% (`Non-streami…a6807dd9-9a…curl`).

### F-12 (to confirm): "No response headers" on a 200

The expanded row's Response > Headers tab reads "No response headers" for a request that returned 200 with a JSON body. Decide whether response headers are meant to be captured. If not, drop the tab or say so.

### F-13: Restore original settings leaves LLMR files behind

Row 19's manual check, run in the VM (`logs/collect-after-restore-20261120-163320.log`). **Restore original settings** on both cards removed `~/.claude/settings.json` and `~/.codex/config.toml`, which is the original state, and switched both profiles off. It acts with no confirmation prompt. Left behind, in two directories that did not exist before LLMR:

- `~/.claude/settings.json.llmr-backup-<timestamp>` and `~/.codex/config.toml.llmr-backup-<timestamp>`: copies of LLMR's own written config, the Codex one holding the profile's bearer token (mode 0600).
- Every `.llmr-original-missing` marker.
- `~/.codex/llm-router.config.toml`, `~/.codex/llmr-model-catalog.json` and `~/.codex/.llm-router/`.

Decide what a restore should remove when the original was "missing". Also: the Codex toast read "Codex config already matches the LLMR backup; profile is disabled", although `config.toml` was removed at that moment (backup timestamp 00:31:58Z). Ask whether the button was clicked once or twice.

### F-15: once every profile has been off, no profile can be applied again

Cause, read from the code and matched in the VM. `synchronizeLegacyProfileConfig` (`packages/core/src/config/config.ts:471`) computes `profileEnabled = profile.enabled !== false && profiles.some((item) => item.enabled)` and saves it as `profile.enabled`. With every profile off it saves `false`. After that the first operand is false whatever the profiles say, so the flag can never return to `true`. `profileEntries` (`packages/core/src/profiles/service.ts:920`) treats every profile as disabled while the flag is `false`, so nothing is applied and nothing is logged. The saved config in the VM shows it: `profile.enabled` 0 with `default-claude-code` `"enabled": true` (`logs/collect-saved-config-20261121-004917.log`). No UI write of `profile.enabled` was found by grep. Restoring both cards is one way in; switching both profiles off by hand should be another (not tried). `unlatch-profiles.sh` in the share sets the flag back to prove it.

Proven in the VM (`logs/unlatch-20261121-005319.log`): with the app quit, setting `profile.enabled` to true in `config.sqlite` and reopening brought back `~/.claude/settings.json`, the Claude Code helper, token and wrapper files in `~/.llm-router/bin`, and an endpoint in `settings-state.json`, all at 00:53.

### F-16 (to confirm): Claude Code gets 401 from the gateway right after the profile is applied

In the same run `claude -p` reached the gateway and failed: `401 Gateway plugin "llmr-public-auth-context" beforeAuth failed: Invalid or expired API key.` The gateway child started at 08:53:22Z and the config (with the profile's key) was saved at 08:53:59Z, 37 s later. Guess: the running gateway keeps the key list it started with and is not reloaded when a profile apply creates a key. Check: rerun `claude -p` unchanged, then restart the gateway and rerun. Also unknown: whether the profile key worked after the first onboarding, since Claude Code was not installed then.

Confirmed in the VM, 2026-11-21. A second `claude -p`, minutes later with nothing changed, failed all 10 of Claude Code's retries with the same 401. After quitting LLM Router, waiting 20 s and reopening it, the same command printed "pong". So a profile key created by an apply is not accepted by the running gateway until the gateway restarts. Not read in code yet: where the gateway takes its key list from and what should reload it.

With that, Claude Code 2.1.330 on the default home works through the System default profile with no Anthropic login: Logs shows `POST /v1/messages` 200, streaming, client "Claude", `claude-haiku-5-5` via CLIProxyAPI, 17.6K cache-write tokens, and `User-Agent: claude-cli/2.1.330`.

### F-17: request logs are deleted at the start of each day, and the UI does not say so

Resolved 2026-11-21, Jason's theory. It is the day, not the app session. The store's retention cleanup runs once per local day and deletes every `request_logs` row with `created_at` before the start of today (`cutoff = floorDay(now)`, `packages/core/src/observability/request-log-store.ts:1588`). The three rows were from 16:20 on 11-20; the next request was at 01:06 on 11-21, so they were deleted. A request logged at 23:59 is gone a minute later. The Logs page has no date filter and no note about retention. 

Decision, Jason, 2026-11-21: add a setting for the number of days to keep. Feasibility, read from the code, nothing built:

- No retention setting exists. `ObservabilityConfig` (`packages/core/src/contracts/app.ts:1273`) has `requestLogs`, `requestLogBodyCapture`, `requestLogMaxBodyBytes` and `requestLogSuccessSampleRate`. The cutoff is hardcoded in `pruneOldRequestLogs` (`request-log-store.ts:1568`).
- A new `requestLogRetentionDays` follows the path `requestLogMaxBodyBytes` already takes: type in `contracts/app.ts`, default in `config/default-config.ts:119`, parse and clamp in `config/config.ts:1035`, UI fallback in `packages/ui/src/pages/home/shared/config.ts:107`, then a field in Settings and a line on the Logs page.
- The open design point is how the value reaches the store. `requestLogStore` is a module singleton built from a file path only (`request-log-store.ts:1886`) and prunes when it opens the database, on reads too. Every process that opens it (app, gateway child, request-log worker) must use the same value, or the one holding the default deletes on its own schedule. Find every opener before choosing between a setter, a constructor option, or a value kept in the database.
- Check before building: the prune only touches rows with `source_usage_id IS NULL`; bodies live on disk under `REQUEST_LOG_BODIES_DIR`, so a longer window needs an upper bound; and what the Logs page's lack of a date filter means once more than one day is kept.

What was first seen:

Before the restarts Logs listed 3 rows from 16:20. After them it reads `1-1 / 1`, the Claude Code request only. Check whether request logs are kept across a restart, or whether a default date or retention filter hides the older rows. The ten 401s from the failed run are not listed either, which is F-8 again: the user debugging F-16 sees an empty log.

The observations that led to F-15 follow.

After the restore, the Claude Code card's switch was turned back on (seen on in a screenshot, and the gateway child restarted with a new pid). `logs/collect-claude-launch-20261120-163651.log`, taken afterwards, shows no `~/.claude/settings.json`. Claude Code 2.1.330 was then installed and `claude -p` run with no LLMR settings in place. `claude -p` answered "Not logged in · Please run /login", so the agent was not connected while the card showed the profile on. Switching the profile off and on again, and re-saving it from the pencil dialog, were both reported done; `logs/collect-toggle-20261120-163854.log` and `logs/collect-resave-20261120-163901.log` still show no `settings.json`. The two logs are 7 s apart, so confirm the dialog save really happened. A full quit and relaunch did not bring it back either (`logs/collect-relaunch-20261121-003856.log`): the gateway listens again, so the provider survived the restart, but there is no `settings.json` and `claude -p` still says "Not logged in". So after a restore the enabled profile is not applied by the switch, by a re-save or at launch. `applyClaudeCodeProfile` (`packages/core/src/profiles/service.ts:471`) writes when the file is missing as far as read, so the next evidence is the app's console output (`app-console.sh` in the share). Not traced: whether re-enabling is meant to re-apply, and what the user is supposed to do to apply again.

`~/.claude.json` appeared at 16:36, the minute `claude` first ran. Claude Code creates that file itself. LLMR had not created it in the 70 minutes before.

### F-14: the toast covers the endpoint bar

The restore toast is drawn over the header's Endpoint field, which shows through behind it.

### F-1 follow-up

The banner is gone by the "Connect agent" step, once the provider and model are saved.


The banner is still shown on "Verify connection", after a provider, key and model were entered but before the onboarding saved them. On that step it no longer covers the heading, because the heading sits lower.

### F-18 to F-22: what a restore does to content LLMR did not write

Found 2026-11-21 by reading the restore code and probing each starting state in an isolated home, while deciding V-7 and V-16 of the fix plan. Not seen in the VM. The plan author confirmed in the code that Codex has no stripper, that its managed test is a contains-test, and that a gateway stop runs the same restore code as the button. The rest is the research agent's probe and was not rerun.

- **F-18.** A `~/.codex/config.toml` that LLMR created and the user or Codex later added to is removed whole on restore. Codex adds to the file on its own (folder trust, the chosen model, MCP servers). The additions survive only in a backup.
- **F-19.** When the original `config.toml` existed, a restore writes the pre-takeover file back and discards anything written while LLMR had it. Claude Code's `settings.json` keeps such edits, because it has a stripper.
- **F-20.** Each restore of a Codex file, and each apply that changes it, leaves a backup holding the profile's token. Five remained after seven quits. The token is written in three places: `experimental_bearer_token`, an MCP server's `env` table and an `Authorization` header.
- **F-21.** **Restore original settings** does not remove the profile's API key. It stays valid until the next apply.
- **F-22.** Smaller cases: a symlinked config whose target is missing keeps LLMR's content after a restore; a user's own `NO_PROXY` hosts are lost; a user whose own settings already set the three base URLs alike gets a failed restore; a restored Claude Code file is rewritten with two-space JSON.

The same restore code runs on a quit, a termination signal, an update install and every apply, so none of this is limited to the button. Fix plan: Task 4a for F-18 and F-21, Task 4b for F-19 and F-20, Task 4c for the rest of F-13, Open items for F-22.

### F-23 to F-26: where the restore still writes the wrong thing

Found 2026-11-21, after Task 4a merged (PR 132), by measuring the Codex stripper against codex-cli 0.171.0 in throwaway homes and by reading the restore path. Not seen in the VM.

- **F-23. Claude Code, no original: a deleted setting comes back.** Reproduced by the plan author on `main` at `1f85bbb3`: add a `permissions` key, let LLMR re-apply with a changed model, delete the key, click Restore. The key is written back, and two backups and the `.llmr-original-missing` marker stay. `restoreGlobalConfigFile` looks for a snapshot before it reaches the no-original branch, and a backup holding the user's key is unmanaged, so it passes for the original.
- **F-24. Codex: LLMR's `model` line is left behind.** Rerun by the plan author. After a re-apply, `codex mcp add` drops the two comment lines above the first table, which are LLMR's `# LLMR configured model = ` line and its root END marker. The stripper knows LLMR's `model` line only by that comment. Codex is then set to LLMR's model id with no LLMR provider. Whether Codex fails at request time was not tested, because that needs a login.
- **F-25. Codex: the user's `show_all_sessions` is lost.** Codex writes root keys inside LLMR's root block, and the stripper removes that key there. A research agent's measurement.
- **F-26. Codex: a multi-line string is damaged.** A `"""` string line that reads like an LLMR table header or marker is removed or cuts the scan short, and the file can stop loading in Codex. The writer has the same fault on every apply. A research agent's measurement.

Fix plan: Task 4d for all four in the stripper and the restore path. The writer's share of F-26, and a CRLF fault in the writer's marker regex, are in the plan's Open items.

### F-27 to F-29: what the review of PR 133 found

Reviewers of PR 133 ran these in an isolated home. The plan author reran each on `main` at `2e83ff7c`.

- **F-27. Claude Code: an older backup is restored over the user's newest file.** With a stale `.llmr-original-missing` marker, an old backup with nothing of LLMR's in it, and a live file holding only keys LLMR also writes (the user's own `NO_PROXY` with `localhost`, a model env key), a restore writes the old backup back. The guard from PR 133 refuses the newest backup because the stripper would change it. Reached from a planted state only.
- **F-28. Claude Code: a deleted live file takes the backups with it.** With no original, after the user deletes `settings.json`, a restore deletes every backup, including one that holds a key the user added, and reports "already matches the LLMR backup".
- **F-29. Claude Code: a backup that does not parse is restored.** A truncated copy of LLMR's file among the backups is written back with status ok, whether or not an original existed. An apply never backs up a file that does not parse, so the state needs an outside cause such as a full disk.

Fix plan: Task 4e for F-27 and F-29. Task 4d Part 4 for the copy in F-28 (V-17), and Task 4c for its message.

## Notes, not defects

- The dmg carries no signature of its own (`spctl` on the dmg: "no usable signature"). Gatekeeper accepts the notarized, stapled app inside.
- The gateway's `/health` sends `access-control-allow-origin: *`. Check whether the authenticated routes do too before calling it a finding.
- First launch leaves an empty `~/Library/Application Support/LLM Router` directory. The app's data lives in `~/.llm-router/app-data`.

## Not yet checked

- Provider by key, server start, `/health`, one model request, Logs and tray usage.
- The onboarding "Connect agent" step with no agent installed.
- Whether `llmr ui` shows F-1 on an empty config.
- Claude Code installed in the VM and launched through a profile.
- Auto-update from 7.2.2 to 8.0.0 (needs its own disposable boot).
- The Intel build and the Docker image, neither of which this VM can run.
