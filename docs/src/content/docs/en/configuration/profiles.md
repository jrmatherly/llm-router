---
title: Agent Profiles
pageTitle: Agent Profiles
eyebrow: Detailed configuration
lead: Create reusable launch configs for Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI, ZCode, and WorkBuddy, and open independent agent instances from different configs. Use this page to run multiple agents side by side or pin different models to different purposes.
---

> For a detailed, field-by-field setup guide to a single agent, open its page under **Agents** in the sidebar — for example, [Claude Code](/en/configuration/agents/claude-code/), [Codex](/en/configuration/agents/codex/), or [Grok CLI](/en/configuration/agents/grok/).

## Configuration flow

1. Add at least one usable provider and model in **Provider Config**, or create the Fusion model you want to use.
2. Open **Agent Profiles** and click **Add profile**.
3. Choose the agent type, name the config, then choose the effect scope and entry mode.
4. Select a model. The value is usually `Provider name/model name`, and Fusion models can be selected too.
5. If the entry mode includes App, optionally bind the Bot used by AgentClaw and choose whether to forward agent messages or enable handoff.
6. Save the config, then open it from the Agent Profile card: the terminal button copies the CLI command, and the play button starts the App instance.

During trial, prefer **Only opened from LLMR** and always open the agent from LLMR. That keeps the config limited to LLMR-launched instances and avoids changing the Claude Code, Codex, Grok CLI, Kimi CLI, ZCode, or WorkBuddy setup you open directly from the system.

## Multi-instance

Each Agent Profile is a separate launch configuration. Create multiple profiles when you want different models, scopes, Bots, or App windows for the same agent. Reopening an already-running profile activates its existing window when that agent supports only one active App window.

## Common options

| Option | Applies to | Description |
| --- | --- | --- |
| Agent | All | Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI, ZCode, or WorkBuddy. Grok CLI and Kimi CLI support CLI only; ZCode and WorkBuddy support App only. |
| Config name | All | Identifies the config in LLMR. Commands use `llmr <config-name>`. Names can contain spaces; copied commands are quoted automatically. |
| Enabled | All | Disabled configs are not exposed as active launch entries and are not applied as effective startup configs. |
| Effect scope | All | **Only opened from LLMR** limits changes to LLMR launches; **System default** also affects the agent when opened directly. Only one enabled system-default config is allowed per agent. For a Claude Code App entry, use the profile's takeover toggle instead. |
| Entry mode | Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI | `CLI & APP` exposes both CLI and App entry points; `CLI only` only generates a CLI command; `App only` only exposes the App entry point. Grok CLI and Kimi CLI are fixed to `CLI only`; ZCode and WorkBuddy are fixed to `App only`. |
| Model | All | Default model for the opened agent, either a provider model or Fusion model. For Claude Code, leaving it empty keeps the Claude Code default. |
| Available models | Kimi CLI | Models exposed by Kimi's `/model` command. The default model is always included. |
| Bot | App entry | The IM entry used by AgentClaw. Bot forwarding only works for App mode opened from LLMR; CLI does not forward Bot messages yet. See [AgentClaw](/en/agentclaw/) for the full setup. |
| Environment variables | All | Optional advanced overrides; leave empty for normal use. |

## Per-agent options

### Claude Code

| Option | What it does |
| --- | --- |
| Model override | Default model for this profile. Leave it empty to keep Claude Code's own default model. |
| Small fast model | Optional model for Claude Code lightweight tasks. Leave it empty to keep the Claude Code default. |
| Settings file | Used for the system-default Claude Code profile. |
| Environment variables | Optional advanced overrides; leave empty for normal use. |
| Bot | Applies only to the Claude App entry. Select a saved Bot, then choose AgentClaw message forwarding or handoff. |
| Route Claude App launched outside LLMR through LLMR | Off by default. On, Claude App opened from the Dock or an account switcher also runs through LLMR in third-party mode, signed out of claude.ai. One profile at a time. |
| Sign in with my Claude login | Off by default. CLI only. On, Claude Code signs in with your own claude.ai login and LLMR forwards it. See **Claude login mode** below. |

After Claude Code CLI is opened from LLMR, it uses LLMR gateway model discovery. In Claude Code CLI, enter `/model` to view and switch the models exposed by LLMR, including normal provider models and visible Fusion models. In Claude login mode Claude Code shows its own list instead.

If Claude App is already running, restart it or reopen it from LLMR when prompted.

#### Claude login mode

Use this mode to run Claude Code through LLMR on your Claude subscription. It needs the `Claude Code API` provider, which you add from **Providers** through the Claude Code import entry. Claude Code keeps its own login. It sends that login with each request, and LLMR forwards it to Anthropic without reading, refreshing or storing it.

The profile writes LLMR's base URL to its settings file and adds one line, `x-llmr-api-key: <gateway key>`, to `ANTHROPIC_CUSTOM_HEADERS`. Lines you already had in that variable stay. The gateway key sits in that file in plain text. If your `settings.json` is a link, as in a dotfiles setup, a **System default** profile writes the key into the file the link points to and keeps the link. A profile with **Only opened from LLMR** has its own settings file and does not touch yours. LLMR writes its `settings.json.llmr-backup-<time>` copies without that line. Switching the profile off revokes that key once LLMR has put the profile's settings back. Quitting LLMR puts a system-default profile's settings back and keeps the profile and its key. The profile writes no `apiKeyHelper`.

Claude Code then shows its own model list, not the one LLMR serves. A model you pin as `Provider/model` still goes through LLMR to that provider, with its routing rules.

With the toggle on, **Default model** is optional, unless the profile has an allowed model list. A model from another provider in **Default model** starts every new session on that provider, and one in the Fable, Opus, Sonnet or Haiku field sends that choice there. The form says so under the field. Leave **Default model** empty and Claude Code starts on its own default model, on your subscription.

An allowed model list applies to every model Claude Code asks for in this mode, including a pick from its own `/model` list and its background model. A request for a model that is not in the list is refused. The profile's own default model is always allowed.

A profile opened only from LLMR has its own Claude home and starts signed out. Run `/login` once inside it, or turn on **Use my ~/.claude in the terminal**. A **System default** profile uses your normal login.

A request on your subscription works differently from other LLMR traffic:

- A model named without a provider prefix goes to your subscription through the `Claude Code API` provider. It skips Router rules and virtual models.
- LLMR sends the request as Claude Code wrote it. The context archive, web search and ToolHub do not run on it.
- It does not fall back to another provider when it hits a limit or an error. Claude Code sees Anthropic's own error.
- If Claude Code is signed out, the request fails with a message that tells you to sign in. No other provider answers it.
- Gateway plugins you installed may still see the request, including the login, on its way to Anthropic.

Claude App and Claude Code CLI expose models differently:

| Entry | Model list source | Notes |
| --- | --- | --- |
| Claude Code CLI | LLMR gateway model discovery, except in Claude login mode | Use `/model` in the CLI to view the list; selected requests still go through LLMR providers, routing, and Fusion. |
| Claude App | LLMR model list | Open Claude App from LLMR to use the model list for this profile. |

### OpenCode

| Option | What it does |
| --- | --- |
| Provider reference | Not editable. LLMR registers itself in OpenCode as `llm-router` (`claude-code-router` in profiles made before the rename) with the display name `LLM Router`. |
| OpenCode model | Default model for OpenCode CLI and App. It can be a provider model or Fusion model. |
| Config file | Used for the system-default OpenCode profile. |
| Environment variables | Optional advanced overrides; leave empty for normal use. |
| Bot | Applies to the OpenCode App entry opened from LLMR. |

With a Bot bound, OpenCode can relay conversations through the selected IM channel.

### Codex

| Option | What it does |
| --- | --- |
| Provider reference | Not editable. LLMR registers itself in Codex as `llm-router` (`claude-code-router` in profiles made before the rename) with the display name `LLM Router`. |
| Codex model | Default Codex model. It can be a provider model or Fusion model; if left empty, LLMR uses the first available default model. |
| Show all sessions | Lets Codex show all sessions. |
| Config file | Used for the system-default Codex profile. |
| Environment variables | Optional advanced overrides; leave empty for normal use. |
| Bot | Applies only to the ChatGPT app entry. |

After saving, use the terminal button on the desktop config card to copy the Codex CLI command, for example `llmr "Codex - Work"`. Use the play button to open ChatGPT.

### Grok CLI

Grok CLI profiles are fixed to **Only opened from LLMR** and **CLI only**. After saving, run the profile command: `llmr "Grok - Work"`. Inside Grok CLI, use `/model` to switch among the provider and Fusion models returned by LLMR.

### Kimi CLI

Kimi CLI profiles are fixed to **Only opened from LLMR** and **CLI only**. Select one default model and one or more available models. Kimi's `/model` command can switch among the models you selected.

### ZCode

| Option | What it does |
| --- | --- |
| Provider reference | Not editable. LLMR registers itself in ZCode as `llm-router` (`claude-code-router` in profiles made before the rename) with the display name `LLM Router`. |
| ZCode model | Default model when ZCode App opens. It can be a provider model or Fusion model. |
| Config file | Used for the system-default ZCode profile. |
| Environment variables | Optional advanced overrides; leave empty for normal use. |
| Bot | Applies only to the ZCode App entry. |

ZCode supports App only, so its entry mode is fixed to `App only`. The `Show all sessions` option is hidden for ZCode.

### WorkBuddy

| Option | What it does |
| --- | --- |
| Provider reference | Not editable. LLMR registers itself in WorkBuddy as `llm-router` (`claude-code-router` in profiles made before the rename) with the display name `LLM Router`. |
| WorkBuddy model | Default model when WorkBuddy App opens. It can be a provider model or Fusion model. |
| Allowed model list | Models visible in WorkBuddy; empty means every LLMR model. |
| APP_PATH | Optional WorkBuddy executable path when auto-detection does not find the App. |
| Config file | Used for the system-default WorkBuddy profile. |
| Environment variables | Optional advanced overrides; leave empty for normal use. |
| Bot | Applies only to the WorkBuddy App entry. |

WorkBuddy supports App only, so its entry mode is fixed to `App only`.

## CLI and App modes

| Mode | How to open | Best for | Key differences |
| --- | --- | --- | --- |
| CLI | Click the terminal button to copy, or run `llmr <config-name>` | Working inside a project directory, shell workflows, scripting | Opens the selected profile in the terminal; Bot forwarding support is pending. |
| App | Click the play button in the LLMR desktop app | Desktop windows, Bot forwarding, handoff | Reopening the same config activates the existing window. Multi-instance behavior depends on the Agent; OpenCode Desktop is single-instance, so LLMR stops the managed instance before switching OpenCode profiles. |
| CLI & APP | One config exposes both CLI and App entry points | Reusing the same model config in both terminal and desktop App workflows | Both entries share the config name, model, effect scope, and environment variables, but launch differently. |

## Agent differences

### Claude Code

Claude Code supports CLI and App. Create separate profiles when you want different models, scopes, or Bots.

To use your Claude subscription in the CLI, turn on **Sign in with my Claude login**. Claude Code then keeps and sends its own login, LLMR forwards it, and Claude Code shows its own model list. The details are under **Claude login mode** above.

With a Bot bound, Claude App can relay conversations through the selected IM channel.

### Codex

Codex supports CLI and App. Use the terminal button for Codex CLI and the play button for ChatGPT.

With a Bot bound, ChatGPT can relay conversations through the selected IM channel.

### OpenCode

OpenCode supports CLI and App. OpenCode Desktop is single-instance, so switch profiles from LLMR rather than launching a second App.

With a Bot bound, OpenCode can relay conversations through the selected IM channel.

### Grok CLI

Grok CLI supports CLI only. Use `/model` inside Grok CLI to switch among LLMR models.

### Kimi CLI

Kimi CLI supports CLI only. Select one default model and any additional models you want in `/model`.

### ZCode

ZCode supports App only. Open it with the play button.

With a Bot bound, ZCode can relay conversations through the selected IM channel. Closing ZCode App immediately takes the relay offline.

### WorkBuddy

WorkBuddy supports App only. Open it with the play button.

With a Bot bound, WorkBuddy can relay conversations through the selected IM channel. Closing WorkBuddy takes the relay offline.

## Multi-instance suggestions

1. Create one Agent Profile for each agent instance that should run independently.
2. While testing, prefer **Only opened from LLMR** to avoid changing the system default agent.
3. To keep desktop windows side by side, use `App only` or `CLI & APP`, then open the App from LLMR.
4. If the same config is already running, opening it again activates the existing window. Create another Agent Profile when you need a second instance.

## Repair unavailable model selections

The model picker lists saved selections that no enabled provider or virtual model serves under **Unavailable selected models**, each with a **Remove** button. A selection written another way still counts as available: a different letter case, `provider,model` instead of `provider/model`, a bare model name, or a provider's ID instead of its name. The save also accepts any name the gateway's model registry resolves, so the picker can mark an entry unavailable that a save keeps.

Saving drops unavailable entries from a profile's model list. If no served entry is left, the save puts the profile's default model in the list, when that model is served. The gateway always allows a profile's default model, listed or not.

A save is refused in two cases, both only for an enabled profile with a model list:

- **The default model is not served.** This happens, for example, after you delete or disable its provider. If the provider is gone or disabled, the message says the model is not served by an enabled provider or virtual model. If the provider is enabled but does not list the model, the message names the provider and lists its models.
- **No entry in the list is served, and the profile has no default model.**

Each message names the profile. Choose a configured model for that profile, or disable the profile, and save again.

The refusal applies to every save, not only to a save of that profile. Until the profile is fixed or disabled, no settings change can be saved, including the provider change that caused it. LLMR never empties the list to make the save pass, because an empty list allows every model. A disabled profile whose list has no served model left keeps that list until you repair it.

## Restore original settings

A **System default** Claude Code or Codex profile has a **Restore original settings** button. It disables the profile and saves that, then puts the agent's own config file back. Reopen the agent afterwards. It works while the gateway is stopped, and other invalid settings, such as another profile's unavailable model, do not block it. Restarting LLMR keeps the profile disabled.

- **Claude Code**: LLMR removes its own keys from `settings.json` and keeps everything else, including edits you made after LLMR took the file over. Before it changes the file, it copies the current one next to it as `settings.json.llmr-backup-<time>`. LLMR removes a base URL only while it holds LLMR's own address, so a base URL you had set before the takeover comes back. Your own `NO_PROXY` hosts and your own `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT` value come back too. If `settings.json` is not valid JSON, LLMR leaves it alone and reports that.
- **Codex**: LLMR replaces `config.toml` with the copy it saved before the takeover, after copying the current file next to it as `config.toml.llmr-backup-<time>`. Edits made to `config.toml` after the takeover are in that backup, not in the restored file. If there was no `config.toml` before the takeover, LLMR deletes it after making that backup.

When LLMR writes an agent's main config file, such as `settings.json` or `config.toml`, it makes the file readable and writable only by you (mode 600), and a restore keeps that mode. If the file is a link, this applies to the file it points to, even one you made read-only. If LLMR cannot write in that file's folder, as in a Nix store, the profile is not applied and the LLMR log has the error.

The message after a restore says what LLMR did. If it found nothing of its own to restore, it says so and leaves the file unchanged. If another enabled system-default profile of the same agent uses the same file, LLMR leaves the file to that profile and names it. An enabled Workbuddy profile on the same folder keeps a Codex `config.toml` the same way, and an enabled Codex profile keeps Workbuddy's. If the config file is a link you made, a restore keeps the link and removes only the file LLMR created behind it. If LLMR has no copy of the original file, it says so and the profile stays disabled. If the running gateway could not take the new settings, the message says to restart LLMR. Enable the profile again to turn routing back on. Switching a System default profile off on the Profiles page shows the same message, and a failed restore shows as an error there.

When a request through a system-default Claude Code or Codex profile fails on every provider, the combined error can end with a pointer to this button. It names the requested model and the profile. Not every failure carries it.
