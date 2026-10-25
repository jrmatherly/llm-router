# AI assistant guardrails for llm-router

Date: 2026-10-25, revision 2 (after two independent plan reviews). Repo: `jrmatherly/llm-router`, a fork of `musistudio/claude-code-router` v3.1.3. Divergence from upstream is intended.

## Problem

Coding assistants (Claude Code, Codex, OpenCode) working in this repo have nothing to read. There is no CLAUDE.md, AGENTS.md or lint config, and `.claude/` is gitignored. The standards that exist are enforced only by `tests/architecture/`, `packages/core/test/architecture/`, and limits inside `build/esbuild.config.mjs`. Assistants also cannot gate on "tests green" today, because the suites are not green on a clean checkout.

## Decisions (made with the owner on 2026-10-25)

1. Config is committed to the fork. `.gitignore` un-ignores `.claude/settings.json`, `rules/`, `skills/` and `hooks/`.
2. Full instructions live in `AGENTS.md`, hand-written and under 120 lines. `CLAUDE.md` is a one-line `@AGENTS.md` import so Codex and OpenCode read the same file. No auto-memory plugin config or markers: the plugin would switch on for anyone who has it and rewrite sections past the size budget.
3. Advisory text stays short. Anything that must hold every time in a Claude Code session is a hook. Hooks and the `verify` skill bind Claude Code only; Codex, OpenCode, Serena's write tools and a human terminal are bound only by the tests, the build, and `AGENTS.md`. A git pre-commit hook would bind everyone and is out of scope.
4. No custom subagents. Bundled `/code-review`, the owner's jstack tooling, and the architecture tests cover review.
5. All five suites (core, ui, electron, cli, e2e) must pass on one local install before any hook gates on them.
6. A project skill named `verify` replaces the bundled app-driving `/verify` at the repo root. Here `/verify` runs the test suites; `/run` drives the app.
7. npm only, node 24. `allowScripts` in `package.json` lists the native dependencies whose install scripts may run. Done 2026-10-25.

## Measured baseline (node 24.22.1, clean `main`)

| Check | Result | Wall time |
| --- | --- | --- |
| `tsc --noEmit` | clean | 7 s |
| `npm run test:architecture` | 5 pass | 3.6 s |
| `npm run test:core` | 1116 pass, 4 fail | 11 s |
| `npm run test:ui` | 212 pass | 1.5 s |
| `npm run test:electron` | 44 pass | 2 s |
| `npm run test:cli` | 6 pass | 3 s |
| `npm run test:e2e` | 17 pass, 1 fail, 3 did not run (after the Playwright browser install) | 19 s |

### Root causes of the failures

- **Core, 1 failure.** `RequestLogStore streams more body text than the bounded worker heap` asserts `totalBodyBytes > heap_size_limit` with 384 requests of 2 x 256 KiB. Under `--max-old-space-size=64`, node 22 reports a 112 MiB heap limit and node 24 reports 256 MiB, so the fixed count no longer exceeds it. The outer `bounded heap regression` test fails because its child process fails. Sizing the count from the live limit (528 on node 24) passes in 1.5 s, verified against a compiled copy.
- **Core, 3 failures.** `isDesktopAppRuntime()` in `packages/core/src/runtime/desktop-app.ts` requires both `CCR_DESKTOP_APP=1` and `process.versions.electron`. Two tests in `plugin-config-migration.test.mjs` and one in `plugin-permissions.test.mjs` set only the env var, so they pass only when `build/run-tests.mjs` falls back to the Electron runtime. `process.versions.electron` is assignable and deletable in node and Electron, so a shared test helper can set both.
- **E2E, 1 failure plus 3 not run.** `electron-cdp.spec.ts` loads `better-sqlite3` inside Electron (ABI 146) in two inline scripts, `createLegacyApiKeyDatabase` (runs in `beforeAll`) and `readSqliteRows`, but the installed binary is built for node 24 (ABI 137). The repo's `rebuild:sqlite3` script rebuilds in place for Electron, which breaks every node-run suite and the `cli-web` spec. better-sqlite3 v12.11.1 publishes an `electron-v146` prebuild, so a sidecar binary plus a resolver that prefers it only inside Electron lets one install serve both. The sidecar must be excluded from `electron-builder.json` `files`, because `asarUnpack` would otherwise ship a host-arch binary.
- **E2E, 12 failures (fixed 2026-10-25).** The pnpm-installed Playwright 1.62.1 wanted a Chromium build that was not installed. The lockfile's 1.61.1 pins build 1228, now installed.
- **Install drift (fixed 2026-10-25).** `node_modules` had been installed with pnpm. Reinstalled with `npm ci`; pnpm files removed; node 24 pinned everywhere.

## Facts the plan depends on

- Only exit code 2 blocks a `PreToolUse` hook. Any other non-zero exit is a non-blocking error and the tool call proceeds, so hooks must exit 2 explicitly on every failure path and must not depend on tools that may be missing (no `jq`; node scripts).
- `CLAUDE_PROJECT_DIR` stays at the original checkout inside a worktree; the hook input's `cwd` follows Claude. The gate must use `cwd`.
- `npm run build:assets` (and `npm run test:e2e`) rewrites `packages/core/models.json` (24 MB, new timestamp, network fetch) and `packages/ui/src/generated/claude-code-config-options.json`. The config-options generator has no npm script of its own.
- The renderer already imports 60 core modules (`contracts/*`, `providers/presets/*`, `providers/url`, `providers/new-api`, `media/models`, `config/default-config`). The real boundary is "browser-safe modules only", enforced by the esbuild browser build, not by `ui-build-contract.test.mjs`.
- The lightweight MCP bundle guard (`validateLightweightMcpBundles`) runs only during `npm run build:assets`.
- A project skill named `verify` is run before commits by Claude Code 2.1.286+ when it is model-invocable and `includeGitInstructions` is on; it is advisory text, loads at session start, and is unknown to Codex and OpenCode.
- `/doctor prompt-audit` with no path also audits `~/.claude`; scope it to `AGENTS.md` and `.claude`.

## Deliverables

1. Toolchain baseline: done except recording the per-suite counts.
2. Core test fixes: heap test sized from the live heap limit; a shared desktop-runtime helper.
3. Dual-runtime SQLite binding: sidecar script, resolver, both e2e inline scripts, packaging exclusion with a test.
4. Guardrail files: `AGENTS.md`, `CLAUDE.md`, four path-scoped rules, two node hooks with tests under `tests/architecture/`, `.claude/settings.json`, a project `verify` skill that runs the four suites and restores generated files, `.gitignore` change.
5. Proof: every suite green from a scratch install, `/doctor prompt-audit` scoped to the repo, hooks exercised live.

## Not in this plan

- A GitHub Actions test workflow. Worth doing next, since hooks bind only Claude Code sessions.
- A git pre-commit hook for non-Claude tools.
- Custom subagents or new MCP servers.
- A linter.
