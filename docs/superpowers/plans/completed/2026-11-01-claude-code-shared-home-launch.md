# Plan: Claude Code shared-home launch and Open in Terminal

Spec: `docs/superpowers/specs/completed/2026-11-01-claude-code-shared-home-launch.md`. One branch, one PR.

## Task 1: the flag

- `packages/core/src/contracts/app.ts`: `claudeCodeSharedHome?: boolean` on `ProfileConfig`, and a helper `claudeCodeUsesSharedHome(profile)` that is true for `agent === "claude-code"`, a generated scope and the flag.
- `packages/core/src/config/config.ts`: parse it like `claudeAppTakeover` (kept only when `true`).
- UI `shared/types.ts`, `shared/profiles.ts`: draft field, load, save (claude-code and non-global scope only), and the two normalizers that carry `claudeAppTakeover`.

## Task 2: launch without CLAUDE_CONFIG_DIR

- `launch-core.ts` `buildClaudeCodeLaunchPlan`: shared home → `LLMR_CLAUDE_CODE_SETTINGS_FILE` instead of `CLAUDE_CONFIG_DIR`.
- `service.ts` `claudeCodeRuntimeEnv`: same switch, so the shell and cmd wrappers follow.
- `cli-middleware-runtime.ts`: prepend `--settings <file>` in `claudeCodeCliWrapperArgs` unless the args have `--settings` or skip model injection.

## Task 3: generated settings for a shared home

- `applyClaudeCodeProfile`: when shared, set the removed auth keys and first-party provider keys to `""` instead of deleting them, and add the user settings file to the gateway policy check.

## Task 4: Open in Terminal

- `launch-service.ts` `openProfileInTerminal`; IPC channel, Electron handler, preload, `electron.d.ts`, web RPC and bridge.
- `ProfileOpenDialog`: an "Open in Terminal" button beside Copy for claude-code on macOS; `App.tsx` handler saves the draft, calls the API, shows the toast or the error.
- UI toggle in the profile editor (claude-code, non-global scope): "Use my ~/.claude".

## Task 5: tests and proof

- Core unit tests in the existing profile launch and service test files; runtime arg test; config parse test; UI draft round trip.
- `npm run typecheck`, `test:architecture`, `test:core`, `test:ui`, `test:electron`, `test:cli`.
- Real proof in a scratch HOME (absolute node from `mise which node`): seed `~/.claude/settings.json`, start a gateway, create the profile, open Terminal through `openProfileInTerminal`, check the TUI and `/status`, compare the user settings checksum.
- `/simplify`, `/code-review`, commit, push, open the PR. Do not merge.
