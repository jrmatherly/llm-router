# Claude Code shared-home launch and Open in Terminal

Date: 2026-11-01. Decided by Jason the same day; this spec records the how.

## Goal

Let terminal `claude` go through LLMR per launch while it keeps using the user's own `~/.claude` (login, history, plugins, MCP servers, settings), and without LLMR writing `~/.claude/settings.json`. Add an LLMR app button that opens such a launch in a real terminal.

A global takeover (scope `global`) writes the user's settings.json on every `llmr <p>` and on every profile apply, and it goes stale when LLMR quits or crashes. claude-multipass would have to track LLMR's lifecycle to undo it. A per-launch mode has nothing to undo: when the `claude` process ends, nothing points at LLMR.

## Today

- `llmr` and `custom` scope profiles keep a generated home at `~/.llm-router/profiles/<slug>[/custom]/claude/`. `applyClaudeCodeProfile` (`packages/core/src/profiles/service.ts`) writes `settings.json` there (gateway env, model env, `apiKeyHelper`, the profile's `claudeSettings`), plus `.claude.json` with `autoCompactWindowsCache`.
- The launch sets `CLAUDE_CONFIG_DIR` to that dir: `buildClaudeCodeLaunchPlan` (`packages/core/src/profiles/launch-core.ts`) and `claudeCodeRuntimeEnv` (`service.ts`), which feeds the wrapper script `~/.llm-router/bin/llmr-claude-code-wrapper-<slug>`. Anthropic's docs: `CLAUDE_CONFIG_DIR` moves settings, session history, plugins and the claude.ai login. So the user starts from a blank home.
- `global` scope writes `~/.claude/settings.json` directly.

## Mode selection

A per-profile boolean, `claudeCodeSharedHome`, on `claude-code` profiles with a generated scope (`llmr` or `custom`).

- Not a new scope. Scope says where LLMR writes the settings; shared home writes to the same generated file as `llmr` scope and changes only how `claude` is started. A flag reuses every path that already handles generated scopes.
- `global` scope ignores the flag: there the settings file is the user's own, so `--settings` would add nothing and the takeover write still happens. The UI hides the toggle for `global`.
- Off by default, for new and existing profiles. Turning it on changes which login, history and plugins the profile's `claude` sees, and the user's own `~/.claude/settings.json` then applies under LLMR's keys (see Limits). An existing isolated profile must not change that under its user. Revisit the default after claude-multipass has used it for a while.
- The flag follows the `claudeAppTakeover` pattern: saved only when `true`, parsed in `config.ts`, kept by the UI draft round trip.

## Behaviour with the flag on

1. Apply writes the generated `settings.json` exactly as for `llmr` scope, with one change: the env block sets `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY` and the first-party provider switches (`CLAUDE_CODE_USE_BEDROCK`, `_VERTEX`, `_FOUNDRY`, `_GATEWAY`, `_MANTLE`, `_ANTHROPIC_AWS`, `_ANTHROPIC_GOOGLE_CLOUD`) to `""` instead of dropping them. The generated home has no lower layer, so dropping was enough there. In shared home the user's `~/.claude/settings.json` and project settings sit below `--settings`, and per Anthropic's auth precedence an `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` from any of them outranks `apiKeyHelper`, while a `CLAUDE_CODE_USE_*` switch would send traffic past LLMR. An env key from a higher layer overrides the same key lower down, so a blank value cancels them.
2. Launch leaves `CLAUDE_CONFIG_DIR` alone (unset unless the user's shell sets it, in which case that home is the user's home) and sets `LLMR_CLAUDE_CODE_SETTINGS_FILE` to the generated settings file. The Node wrapper runtime (`runClaudeCodeCliWrapper` in `packages/core/src/agents/codex/cli-middleware-runtime.ts`) prepends `--settings <file>` to the real `claude` args, the same way it already prepends `--mcp-config`. It skips the injection when the user passed their own `--settings` (Claude Code takes one) and for `--help`/`--version`.
3. Per Anthropic's settings docs, `--settings` sits above user, project and local settings and below managed settings, so LLMR's gateway env, model env and `apiKeyHelper` win over the user's files, and `apiKeyHelper` outranks the saved claude.ai login. Nothing is written under `~/.claude`.
4. The gateway login refusal (`readClaudeCodeGatewayLoginPolicy`) also reads the user settings file (`$CLAUDE_CONFIG_DIR/settings.json` or `~/.claude/settings.json`) in shared mode, since that file now applies to the session. Managed settings were already read; they outrank `--settings`, so a pinned machine is still refused rather than half-routed.
5. The Claude App surface is unchanged.

## Limits

- `~/.claude.json` does not get LLMR's `autoCompactWindowsCache`, because writing it is writing the user's home. Claude Code then uses its own context-window defaults for LLMR model names, which affects only when auto-compact triggers. The generated `.claude.json` is still written; the isolated mode keeps it.
- The `wif` auth mode ranks below `apiKeyHelper` in Claude Code's precedence, so a user-level `apiKeyHelper` would beat it. Shared home with `wif` is not blocked, but only `api-key-helper` (the default) is verified.
- A user `--settings` flag replaces LLMR's, so that launch talks to whatever the user's file says.
- Keys LLMR does not set (permissions, hooks, plugins, statusLine, MCP servers) come from the user's files. That is the point of the mode.
- Claude Code's gateway model cache lives in the user's home (`~/.claude/cache/gateway-models.json`), and LLMR does not invalidate it there, so a changed model list can show late in `/model`.
- A profile switched from isolated to shared home keeps its generated `settings.json`, so keys Claude Code wrote there in isolated sessions (such as `model`) ride `--settings` and outrank the user's files. Re-create the profile for a clean start.
- The login-policy check reads `CLAUDE_CONFIG_DIR` from LLMR's own environment, so a value exported only in the user's shell is not checked. It detects gateway pins only; a `forceLoginOrgUUID` or a non-gateway `forceLoginMethod` that makes Claude Code refuse `apiKeyHelper` shows up as Claude Code's own startup error, unverified here.
- Shutdown release (`restoreTakeoversWhenNoGatewayServes`) has nothing to undo for this mode: shared-home profiles are not `global` scope, so they never enter `global-profile-takeover.json`.

## Open in Terminal

`openProfileFromLlmr` spawns the wrapper detached with `stdio: "ignore"`, so it cannot host an interactive `claude`. The dialog already shows the `llmr <p>` command with a Copy button (`ProfileOpenDialog`, `packages/ui/src/pages/home/components/profiles.tsx`).

- New core function `openProfileInTerminal(config, request)` in `launch-service.ts`. It builds the command with `profileOpenCommand(profile, "cli", <absolute launcher>)`, where the launcher comes from `ensureLlmrCliLauncher`. The absolute path matters: a new Terminal window opens a login shell whose PATH may not hold LLMR's bin dir yet.
- macOS: write `~/.llm-router/bin/llmr-open-<slug>.command` (`#!/bin/sh`, `clear`, the command) and run `/usr/bin/open` on it. Launch Services hands a `.command` file to the user's handler for it, Terminal by default, which runs it in a new window from the user's login shell. This needs no Apple Events: driving Terminal with `osascript` would need an Automation consent prompt and, under the hardened runtime the app ships with, the `com.apple.security.automation.apple-events` entitlement, which the app does not have. The script also exports `HOME` and any `LLMR_INTERNAL_*` variable LLMR itself runs with, so a launch from an isolated LLMR (a scratch HOME, a test) uses that LLMR's config; in a normal install that HOME is the user's own and the export changes nothing.
- Windows and Linux: the function throws an error that says to copy the command. The UI shows the button only when `appInfo.platform` is macOS, so the error is a guard, not a UX. Windows could use `cmd.exe /c start "" cmd.exe /k <command>` and Linux `x-terminal-emulator -e`, but neither can be checked on this machine; they wait for a user on those platforms.
- Wiring: an IPC channel `appOpenProfileInTerminal` (Electron `ipc.ts`, `preload.ts`, `electron.d.ts`) and an `openProfileInTerminal` RPC on the web management server and `web-client-bridge.ts`. The button sits beside Copy in the CLI command block of any profile with a CLI surface (every agent's CLI is an interactive TUI, so nothing is claude-code specific). The dialog saves the draft first, like the App button.
- `llmr <p>` still needs a gateway: the CLI reuses a running one and, for `llmr` scope profiles, starts a profile-managed one when none is serving (`shouldAutoStartProfileGateway`). When opened from the app, the app's gateway is running.

## Tests

- Unit (core): with the flag on, the launch plan and wrapper env carry no `CLAUDE_CONFIG_DIR` and carry `LLMR_CLAUDE_CODE_SETTINGS_FILE`; the generated settings env blanks the auth and provider keys; apply never creates `~/.claude/settings.json` in the test HOME; a gateway policy in the user settings file refuses. With the flag off nothing changes.
- Unit (runtime): `--settings` is prepended, and skipped when the user passed one.
- Config parse and UI draft round trip keep the flag.
- Real proof: in a scratch HOME with a seeded `~/.claude/settings.json`, a shared-home profile run through `llmr <p>` in Terminal reaches the TUI, `/status` shows the `apiKeyHelper` credential and the LLMR base URL, and the user settings file is byte-identical afterwards.
