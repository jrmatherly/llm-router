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
| VP-3 | The first open of an App profile raises a macOS prompt, "LLM Router wants access to control System Events", with no word from LLM Router. Not checked: which call raises it, and what happens on "Don't Allow" | No task yet |
| VP-4 | Two owners take the gateway port from each other about every 30 s, once `llmr start` runs beside a desktop app whose gateway holds one key | Keys plan Task 4 removes the state that set it off. The shared marker and the two restart loops are still there for any other case where one owner cannot use the other's gateway. No task yet for that |
| VP-5 | The desktop window says "Service failed to start" with a grey dot while a gateway on its port is serving every key, and is green while its own gateway serves one key | No task yet. It needs VP-4's answer first |
| VP-6 | The banner prints a deprecation warning from the gateway child's stderr as the error detail | No task yet. Small |
| VP-7 | A System default profile changes the settings file's mode from 644 to 600 on its first write, in key mode, and neither switch-off nor quit puts it back | The restore plan. The earlier research tied this to Claude login mode and ranked it lowest. It applies to every System default Claude Code profile |
| VP-8 | Backups pile up beside the settings file, most of them copies of LLM Router's own content | The restore plan, Task 3, which the review of PR 148 already named |
| VP-9 | A provider whose key is the placeholder typed by hand is shown as an imported local login. Its Verify step shows "Local login provider. Compatible API protocols were found automatically." and "Available after saving. The imported local agent login is connected when this provider is saved." with two green ticks, while every probe was refused | No task yet. Follow-ups Task 9 stops the automatic probe in the edit dialog only, and the Add flow is left. The ticks are a separate point |

Also seen and not a finding. The "Open Agent" dialog with its App button appears once, right after a profile is added. Later the play button on an App-only card opens the app at once.

## What the pass confirmed for the four answers

- **Keys plan, rule 4, answer (a).** Nothing was built and nothing in the pass spoke against it. `gateway.enabled` was true in every sample.
- **Keys plan, the refused key, answer (b) with Task 4.** A4 is the fact Task 4 rests on, and A5 is the fact Task 3 rests on. A7 shows a restart of the desktop app is the way out. A6 shows `llmr start` is not, while the gateway holds one key.
- **Follow-ups question 4, answer (d) with (f).** B4 is the fact. Neither sentence of the form that names the file says where the key lands when the file is a link.
- **Follow-ups question 5, answer (b), with the condition on Refresh and Check.** C3 is the automatic probe that (b) removes. C4, C5 and C6 show that the probe, Refresh and Check all use whatever address is typed.
