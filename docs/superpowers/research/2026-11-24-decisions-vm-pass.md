# VM pass on the released 9.0.0 app, 2026-11-24

The owner accepted four recommendations on 2026-11-24 and then ran this pass, so that the tasks built from them rest on what the released app does. This record holds what was seen. The tasks are in [`2026-11-22-backlog-keys.md`](../plans/2026-11-22-backlog-keys.md) (Tasks 3 and 4) and [`2026-11-23-pass-through-follow-ups.md`](../plans/2026-11-23-pass-through-follow-ups.md) (PR 3).

## How this was checked

- **Machine.** A disposable macOS 27.2.1 VM, arm64, with nothing installed before the pass.
- **Installed for the pass.** LLM Router 9.0.0 from the release dmg, whose checksum matched the release's `latest-mac.yml` and which passed `codesign`, Gatekeeper and the stapler check. Claude Code 2.1.331, not signed in. Claude Desktop.
- **Configuration.** One provider, a self-hosted CLIProxyAPI, with two models. A Claude Code profile from onboarding (System default, CLI & APP). A second Claude Code profile named `desk` (Only opened from LLMR, App only). The Codex profile stayed off.
- **Scripts.** Shell scripts on a folder shared with the host, outside the repo. Each refuses to run outside the VM. A stored key is logged as its id and 8 hex characters of its hash, and a log is deleted if a stored key appears in it. The scripts read the config store, ask the gateway for `/v1/models` with each stored key, read the process table, and run a recorder on two loopback ports that answers 401 and logs how each request was authenticated.
- **Labels.** "Seen" is in a script's log or the owner's screenshot. "Read" is in the code at `main` `013ebc2e`. "Guess" is neither.
- **Limits.** One VM, one run of each step. 9.0.0 does not have PRs 149 and 150, so the reload of the gateway on a key change, and Task 3's wait for it, could not be seen. No local agent login was on the VM, so every credential the recorder saw was the placeholder.

## Part A. Keys and the gateway's owner

The gateway ran in the single layout: one listener on port 3456, held by the gateway child.

| Step | What was done | What was seen |
|---|---|---|
| A1 | Nothing | Three stored keys, the gateway's own and one per profile. Each answered 200. No key answered 401 |
| A2 | `llmr "Claude Code" -- --version` | Exit 0 in 6 s. Each profile's key was in its own two helper files |
| A3 | The desktop app opened `desk` | Claude Desktop started with no sign-in, in gateway mode, on the profile's model |
| A4 | Nothing | The gateway child had been replaced. `desk`'s key answered 200. The gateway's own key and the other profile's key answered 401 |
| A5 | `llmr "Claude Code" -- --version` | Exit 0 in 2 s, no warning. `desk`'s key was now in the terminal profile's two helper files, and that profile's own key was in no file |
| A6 | `llmr start` | Every key answered 200. The gateway on 3456 was a new process, a child of a CLI service that now listened on 3458. The desktop app's gateway child was gone |
| A7 | Both apps quit and LLM Router opened again | One gateway child of the desktop app. Every key answered 200. A launch put the terminal profile's own key back in its files |

**The two owners.** After A6 the gateway's owner changed again and again. A watcher that read the listener every 10 seconds saw 26 changes in 12 minutes, 20 of the 25 gaps at 30 or 31 seconds. A second watcher that sent no request at all saw 10 changes in 5 minutes at the same gaps, so the watcher did not cause them. Nothing the owner did in those minutes changed the rhythm. While the desktop app held the gateway, `desk`'s key alone was accepted. While the CLI service held it, every key was. One sample found no listener on the port. Claude Desktop still got an answer to a message sent during this.

**What the desktop window showed.** Four screenshots, matched to the watcher's log by the process number in the banner. While the CLI service held the gateway the window showed a grey endpoint dot and a red banner, "Service failed to start. Core gateway exited with SIGTERM.", followed by a deprecation warning from the gateway child's stderr. While the desktop app held it the window was green. The Overview page showed "API Service" green throughout.

**The same `llmr start` beside a gateway that accepted every key.** After a clean restart with no app profile opened, `llmr start` started its service on 3458, and the gateway stayed the desktop app's child for the five minutes watched, with every key at 200.

**With every LLM Router process stopped**, `llmr "Claude Code" -- --version` exited 1 in 1 s with "LLMR gateway is not running at http://127.0.0.1:3456: fetch failed. Start LLMR Desktop or run llmr start before opening Claude Code."

**Read, and consistent with the logs.** Before an owner starts its gateway child it calls `stopPreviousManagedCoreGateway` (`gateway/core-runtime/supervisor.ts:773-812`), which reads a shared marker and sends SIGTERM to the process recorded there when it is alive and answers health with the recorded runtime id. The marker does not record which owner started that process. The owner whose child was stopped starts it again after a delay that doubles from 1 s to a cap of 30 s (`scheduleCoreRestart`, `gateway/application/gateway-service.ts:639-658`). Not proven by a run: that this is the whole cause. Not explained: three changes seen before the watchers ran were about four minutes apart.

## Part B. A linked `settings.json`

`~/.claude/settings.json` was made a link to a file in another folder, mode 644, holding `{}`. With LLM Router quit there had been no `~/.claude/settings.json` at all, though the System default profile had been on: the app removes the file it created when it quits, as the form's own hint says.

| Step | What was done | What was seen in the link's target |
|---|---|---|
| B3 | LLM Router opened, nothing changed | The link was kept. The target grew to 596 bytes with `apiKeyHelper` and seven `env` names, and no stored key. Its mode was now 600. Two 3-byte copies of the old content appeared beside the link, `.llmr-original` and `.llmr-backup-<time>` |
| B4 | "Sign in with my Claude login" turned on and saved | The link was kept. The profile's key was in the target, and `apiKeyHelper` was gone |
| B5 | The toggle turned off and saved | The key was gone from the target, which was back to 596 bytes. A 505-byte backup was written, against the 602 bytes the file held with the key line, so the backup was written without that line |
| B6 | The profile switched off | The target was `{}` again. Mode 600 |
| B7 | The profile switched on, then LLM Router quit | The target was `{}`. Mode 600. The profile's key had a new hash |

No backup beside the link held a stored key. Ten minutes of these steps left five `.llmr-backup-<time>` files and one `.llmr-original` beside the link. Three of the five held content LLM Router itself had written. One early backup had been removed by B7.

What the form said at B4, from the owner's screenshots. Under Effect scope: "LLMR rewrites ~/.claude/settings.json while it runs. It keeps a copy of your file if you had one, and puts things back when you quit LLMR or click Restore original settings." Under the toggle: "The gateway key is written to the settings file of this profile." With no Claude Code API provider: "No Claude Code API provider is on. Add it under Providers, or turn it on. Until then this profile uses your other providers." The save was allowed.

Not tested: the key line left in a shared-home profile's own settings file, and the "nothing to restore" message, which no surface shows.

## Part C. The provider dialog's probe

A provider was added by hand with its address on the recorder's first port and the placeholder `llmr-local-agent-login` typed as its key.

| Step | What was done | Requests | To | Authenticated with |
|---|---|---|---|---|
| Add | The address typed | 11 | the typed address | nothing. 7 protocol probes and 4 icon fetches |
| Add | The key typed | 12 | the typed address | the placeholder |
| C3 | The edit dialog opened, nothing touched | 16 | the saved address | the placeholder on 12 (5 model-list GETs and 7 protocol POSTs), nothing on 4 icon fetches |
| C4 | The address changed in the dialog, nothing clicked, not saved | 16 | the new address | the same |
| C5 | Refresh clicked | 12 | the unsaved address | the placeholder |
| C6 | Check Connection run | 22 | the unsaved address | the placeholder |

The placeholder travels as a bearer token on every probe, and on some also as `x-api-key`, as `x-goog-api-key` and in a `?key=` query. Cancel discarded the changed address.

## Findings the plans did not have

| Id | What was seen | Where it goes |
|---|---|---|
| VP-1 | In Add Profile, an App-only Claude Code profile shows "Applies to the CLI entry. The App entry uses the toggle below." under Effect scope. It has no CLI entry. The line is shown whenever the entry mode is not CLI only (`components/profiles.tsx:863-864`, read) | Follow-ups plan, PR 3, Task 8. The owner asked for it to be fixed |
| VP-2 | A new profile opens with an empty Default model and "Default model is required." The first VM pass saw a model shown with the same warning | Nothing. 9.0.0 shows the state truthfully |
| VP-3 | The first open of an App profile raises a macOS prompt, "LLM Router wants access to control System Events", with no word from LLM Router. Not checked: which call raises it, and what happens on "Don't Allow" | Recommended below |
| VP-4 | Two owners take the gateway port from each other about every 30 s, once `llmr start` runs beside a desktop app whose gateway holds one key | Keys plan Task 4 removes the state that set it off. The shared marker and the two restart loops are still there for any other case where one owner cannot use the other's gateway. No task yet for that |
| VP-5 | The desktop window says "Service failed to start" with a grey dot while a gateway on its port is serving every key, and is green while its own gateway serves one key | No task yet. It needs VP-4's answer first |
| VP-6 | The banner prints a deprecation warning from the gateway child's stderr as the error detail | No task yet. Small |
| VP-7 | A System default profile changes the settings file's mode from 644 to 600 on its first write, in key mode, and neither switch-off nor quit puts it back | Recommended: leave it and add a docs line. See the research below. The earlier research tied this to Claude login mode. It applies to every System default Claude Code profile |
| VP-8 | Backups pile up beside the settings file, most of them copies of LLM Router's own content | The restore plan's fix round. See the research below, which found that Task 3 of that plan does not hold it |
| VP-9 | A provider whose key is the placeholder typed by hand is shown as an imported local login. Its Verify step shows "Local login provider. Compatible API protocols were found automatically." and "Available after saving. The imported local agent login is connected when this provider is saved." with two green ticks, while every probe was refused | No task yet. Follow-ups Task 9 stops the automatic probe in the edit dialog only, and the Add flow is left. The ticks are a separate point |

Also seen and not a finding. The "Open Agent" dialog with its App button appears once, right after a profile is added. Later the play button on an App-only card opens the app at once.

## What the pass confirmed for the four answers

- **Keys plan, rule 4, answer (a).** Nothing was built and nothing in the pass spoke against it. `gateway.enabled` was true in every sample.
- **Keys plan, the refused key, answer (b) with Task 4.** A4 is the fact Task 4 rests on, and A5 is the fact Task 3 rests on. A7 shows a restart of the desktop app is the way out. A6 shows `llmr start` is not, while the gateway holds one key.
- **Follow-ups question 4, answer (d) with (f).** B4 is the fact. Neither sentence of the form that names the file says where the key lands when the file is a link.
- **Follow-ups question 5, answer (b), with the condition on Refresh and Check.** C3 is the automatic probe that (b) removes. C4, C5 and C6 show that the probe, Refresh and Check all use whatever address is typed.

## Research on the findings with no task, 2026-11-24

Three research passes read the code at `main` `9ce07d00` for the seven findings above that had no task. The session then read the leading claim of each in the code. Nothing was run. "Read by the session" marks what the session checked itself. The rest was read by a researcher.

### Decisions for the owner

| Id | Recommended | Size | Why |
|---|---|---|---|
| VP-4 | Record the owner's process id in the marker, and never stop a gateway whose owner is alive and is another process. The start then fails with a message that names the other process | About 20 lines and 3 unit tests | It is the smallest change that ends the exchange in every case found, because an exchange needs both owners to stop each other's child |
| VP-5 | After VP-4, the restart timer probes first and adopts a gateway it can use | About 10 lines and 1 test | The window then shows green truthfully, with no UI change. A separate "served by another process" state is not worth building |
| VP-6 | Show the child's stderr in the banner only when the child did not exit from a signal | 1 line and 1 test | The cause of the warning is in the gateway fork and can only be removed at a fork bump |
| VP-3 | Three small changes: a usage string for Apple Events in the build config, no activation right after a fresh Claude Desktop launch, and a docs line | A few lines | It explains the prompt and removes it from the first open. A replacement for the activation is not recommended until a VM test shows one works |
| VP-9 | Decide "local login" by a matching plugin and not by the key's text, and only as part of follow-ups PR 3 | 30 to 50 lines, and three tests change | The harm is misleading text, not a leaked secret. Alone it is not worth a PR. It changes Task 9's condition, so the two are written together |
| VP-7 | Leave the mode as it is, and add one docs line | 1 sentence | 600 is the safe mode while the file can hold a key. git records only the executable bit, so a plain git dotfiles repo shows no change |
| VP-8 | Fold into the restore plan's fix round. No separate task | Nothing now | The copies are capped and are never picked by a restore. The cheap fix collides with a test that the restore plan already rewrites |

### VP-4, the two owners

- **Why the CLI service did not adopt the gateway.** A service probes a running gateway with one key, the first stored key that has not expired (`gateway/existing-gateway-probe.ts:47`, read by the session). The gateway held one other key and answered 401, so the probe's result was not `usable`. Only a `usable` gateway is adopted (`gateway/application/gateway-service.ts:358-372`, read by the session). Health and the runtime id both passed. Only the key failed.
- **Why it then stopped it.** A start that does not adopt calls `stopPreviousManagedCoreGateway` (`gateway-service.ts:276`, read by the session), which signals the process the marker names.
- **Why it loops.** The owner whose child was signalled sets its state to `error` and schedules a restart from the exit handler (`gateway-service.ts:612-629`, read by the session). That restart calls `startGateway` directly and does not probe, so it always signals the other child. Both owners do the same.
- **The marker.** Its fields are the gateway entry, the child's process id, the runtime id and a start time (`gateway/internal/shared.ts:144-149`, read by the session). Nothing records the owner. It is in the runtime-state store under the config folder, so a desktop app and a CLI service on one home share it.
- **A correction to keys plan Task 4.** Task 4 removes the state that set the exchange off on the VM. One more case would still start it (inferred, not run): a desktop app that has adopted a CLI service's gateway and then opens an app profile. `ensureGatewayConfigRunning` calls `gatewayService.start` with no probe (`profiles/launch-service.ts:463`), which signals the CLI service's child. Other cases found: a gateway still on old keys beside a second owner, which is uncommon. Two versions with the same keys adopt or fail without a signal. A different port sends no signal but removes the other owner's marker.
- **Options not recommended.** Stopping the restart when another LLM Router process sent the signal: a child cannot see who signalled it. Having `llmr start` refuse beside a desktop app: it covers one direction and misses the app-profile case.
- **Not explained.** The three owner changes seen before the watchers ran were about four minutes apart. The restart delay starts at 1 s, so the backoff does not explain it. A guess: the marker is removed without checking whose it is (`gateway-service.ts:620`), which can land after the new owner wrote its own, and the loser then cannot signal and fails until something else calls `start`. Both processes' logs against the watcher's times would settle it.

### VP-5 and VP-6, the window

- The status describes this process's child and never the port (`gateway-service.ts:622-628`). The banner shows whenever the state is `error`, under the fixed title "Service failed to start" (`App.tsx:727-729`, `components/gateway-startup-error-banner.tsx:28`). The dot is green only for `running`. So the window was grey while the other owner served every key, and green while its own child served one.
- The banner's text is built by `formatCoreGatewayChildExit` (`gateway/core-runtime/supervisor.ts:173-182`, read by the session), which appends a rolling tail of the child's stderr. The deprecation warning comes from Fastify, for an option the gateway fork passes. No LLM Router source passes it. Filtering deprecation lines by pattern is not recommended, because it would hide a real line one day.

### VP-3, the System Events prompt

- One call raises it. `activateProfileAppWindow` runs `osascript` with a script that asks System Events to bring the app's process to the front, twice per open, at 250 ms and 1200 ms (`profiles/launch-service.ts:979-1003`, read by the session). Every Claude, Codex-family and OpenCode app open calls it.
- "Don't Allow" fails silently. The script is spawned detached with its output ignored, and nothing handles its exit. The open still succeeds. Inferred, not run: macOS keeps the answer, and bringing an already running instance forward then stops working with no further prompt.
- The build has a hardened runtime and no `NSAppleEventsUsageDescription` (`electron-builder.json`, read by the session). The entitlement files hold no Apple Events entry.
- After a fresh Claude Desktop launch the activation is redundant (inferred, not run), because the launch goes through `open`, which brings a new instance forward. Dropping it there removes the prompt from the first open. The prompt then comes the first time a running instance is reopened.
- A guess to check on a VM: that macOS shows the app's usage string when `osascript` sends the event.
- Docs: a sentence in `docs/src/content/docs/en/guides/agent-profile.md`, and a question in `troubleshooting.md` on the prompt and on undoing a refusal.

### VP-9, the typed placeholder

- `isLocalAgentLoginDraft` (`shared/providers.ts:85`) decides by the key's text alone, and the wizard, the Verify step's two sentences and ticks, and the dialog's hidden key field all follow it. A saved provider of this kind cannot have its key changed in the dialog, because the local-login view hides the field.
- In core, every check read pairs the placeholder with a plugin or a fixed address. At request time the gateway sends the placeholder itself and gets a 401 (inferred; the fork was not read).
- Nobody types it. A provider deep link or a config copied without its plugin entries can create one.
- If decided by plugin, three tests that pin the key-only rule change, and a Codex provider whose plugin was lost would show as a plain provider. Task 10 is not affected. Task 9's condition changes: such a provider would then be probed on open, against its own saved address, which is truthful.

### VP-7, the file mode

- 600 is set on every write and every restore of the settings file, whatever the auth mode (`profiles/service.ts:2804`, `:2807`, `:3163`, `:3371`, `:3879`; `privateFileMode` is `0o600`, `profiles/apply-support.ts:15`, read by the session). The `.llmr-original` copy is set to 600 too (`profiles/backup-files.ts:57-58`, read by the session). The file's first mode is recorded nowhere.
- The same holds for Codex, Workbuddy, OpenCode, Kilo and Pi. ZCode keeps the mode on apply and sets 600 on restore. Kimi does not write the user's file. Tests pin 600 for Codex, OpenCode and Kilo, and none pins it for Claude Code's settings file.
- Keeping the existing mode in key mode alone would be wrong: a later switch to Claude login mode would put the key into a 644 file.
- The table above first sent this finding to the restore plan. That plan has no task on file modes. If the mode must be put back exactly, the place is a mode field in the profile's `settings-state.json`, for Claude Code only, about 20 to 30 lines and two tests.
- An earlier note said a dotfiles repo would show the change. For plain git that is wrong, because git records only the executable bit. A tool that tracks private files, such as chezmoi, would show it (from the tool's documented behaviour, not checked here).

### VP-8, the backups

- A backup is written on every apply whose previous content differs, and a restore backs up the live file before it writes. So each switch between key mode and Claude login mode, and each restore, copies content LLM Router itself wrote.
- Pruning keeps the 5 newest and spares the newest copy that is not LLM Router's own (`profiles/backup-files.ts:28-44`, read by the session). So the count stops at 6. There is no limit by age. `.llmr-original` is never pruned. The early backup that went on the VM was the sixth.
- A restore skips copies that are purely LLM Router's content, so they are never picked.
- **A wrong cross-reference.** The follow-ups plan's "Release order", step 4, says that reading the key line as LLM Router's own in the restore check "is Task 3 of the backlog restore plan". That task's text holds nothing on backups or the key line. The case also cannot occur in a released build: PR 146 and PR 148 both shipped first in 9.0.0, so no release wrote a backup with the key line.
- The restore plan's fix round needs, before either finding is folded in: its three Blockers settled, its citations read again at today's `main` (PRs 146 to 148 moved them), and its Task 1's statement that Claude Code keeps its key in a helper script corrected, which is false in Claude login mode.

### The shared-home key line, not seen on the VM

Read, not run. A shared-home profile is never a System default profile, so its settings file is in LLM Router's own folder. Switching Claude login off while the profile stays on rewrites that file without the key. Switching the profile off removes only its helper files and leaves the settings file, so the key line stays in a mode-600 file under LLM Router's folder. That key is removed from the store with the profile, so the line holds a key that no longer works. No task covers it, and none is recommended.
