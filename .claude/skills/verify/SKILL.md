---
name: verify
description: Run this repo's test suites (core, ui, electron, cli) and report PASS or FAIL per suite. Use before every commit and whenever asked to verify, check, test, or prove that a change works. Pass --e2e to include the Playwright suite. Runs tests only; it does not launch the app, use /run for that.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/verify.mjs *)
---

# Verify

Run the suites:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/verify.mjs $ARGUMENTS
```

Add `--e2e` when the change touches the renderer, the Electron main process, the CLI entry, or the build. The e2e run needs `npm run test:e2e:install` and `npm run sqlite:electron` once per install; the script says so when the sidecar is missing.

Paste the `PASS`, `FAIL`, `RESTORED` and `SKIPPED` lines into the reply. Stop at the first `FAIL` and fix its cause instead of rerunning.

Typecheck and the architecture tests are not run here; the commit gate in `.claude/settings.json` runs them before every commit.

This project skill replaces the bundled `/verify` at the repo root, so `/verify` here runs tests rather than driving the app; use `/run` to drive the app. Claude Code's built-in commit instructions invoke this skill before commits, except for docs-only or tests-only changes.
