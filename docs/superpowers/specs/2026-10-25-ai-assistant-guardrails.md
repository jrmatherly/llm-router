# AI assistant guardrails for llm-router

Date: 2026-10-25. Repo: `jrmatherly/llm-router`, a fork of `musistudio/claude-code-router` v3.1.3.

## Problem

Coding assistants (Claude Code, Codex, OpenCode) working in this repo have nothing to read. There is no CLAUDE.md, AGENTS.md, lint config, or committed `.claude/` directory, and upstream gitignores `.claude`. The standards that exist are enforced only by `tests/architecture/`, `packages/core/test/architecture/`, and limits inside `build/esbuild.config.mjs`. Assistants also cannot gate on "tests green" today, because the suites are not green on a clean checkout.

## Decisions (made with the owner on 2026-10-25)

1. Config is committed to the fork. `.gitignore` un-ignores selected `.claude/` paths.
2. Full instructions live in `AGENTS.md`. `CLAUDE.md` is a one-line `@AGENTS.md` import so Codex and OpenCode read the same file.
3. Advisory text stays short (under 120 lines). Anything that must hold every time is a hook.
4. No custom subagents. Bundled `/code-review`, the owner's jstack tooling, and the architecture tests cover review.
5. All four test suites plus e2e must run and pass on one local install before any hook gates on them.

## Measured baseline (node 24.22.1, pnpm-installed node_modules, clean `main` at 58094a99)

| Check | Result | Wall time |
| --- | --- | --- |
| `tsc --noEmit` | clean | 7 s |
| `npm run test:architecture` | 5 pass | 3.6 s |
| `npm run test:core` | 1116 pass, 4 fail | 11 s |
| `npm run test:ui` | 212 pass | 1.5 s |
| `npm run test:electron` | 44 pass | 2 s |
| `npm run test:e2e` | 5 pass, 13 fail, 3 did not run | 19 s |

### Root causes of the failures

- **Core, 1 failure.** `RequestLogStore streams more body text than the bounded worker heap` asserts `totalBodyBytes > heap_size_limit` with 384 requests of 2 x 256 KiB. Under `--max-old-space-size=64`, node 22 reports a 112 MiB heap limit and node 24 reports 256 MiB, so the fixed request count no longer exceeds it. The outer `bounded heap regression` test fails because its child process fails.
- **Core, 3 failures.** `isDesktopAppRuntime()` in `packages/core/src/runtime/desktop-app.ts` requires both `CCR_DESKTOP_APP=1` and `process.versions.electron`. The tests in `plugin-config-migration.test.mjs` and `plugin-permissions.test.mjs` set only the env var, so they pass only when `build/run-tests.mjs` falls back to the Electron runtime, which happens only when `better-sqlite3` fails to load under node.
- **E2E, 12 failures.** Playwright 1.62.1 wants `chromium_headless_shell-1234`; only 1148 and 1248 are installed. `npm run test:e2e:install` fixes it.
- **E2E, 1 failure plus 3 not run.** `electron-cdp.spec.ts` loads `better-sqlite3` inside Electron (ABI 146) but the installed binary is built for node 24 (ABI 137). The repo's `rebuild:sqlite3` script rebuilds in place for Electron, which then breaks every node-run suite and the `cli-web` e2e spec. One install must serve both runtimes.
- **Install drift.** `node_modules` was installed with pnpm (`node_modules/.pnpm`, electron 42.11.1) while CI and Docker use `npm ci` on `package-lock.json` (electron 42.4.1). `electron-rebuild` is not on `.bin` under the pnpm layout.

## Deliverables

1. Toolchain baseline: `npm ci`, Playwright browsers, all suites runnable.
2. Core test fixes: heap test sized from the live heap limit; a shared desktop-runtime test helper.
3. Dual-runtime SQLite binding: a sidecar Electron binary and a resolver that picks it when running inside Electron, so node and Electron suites pass from one install.
4. Guardrail files: `AGENTS.md`, `CLAUDE.md`, four path-scoped rules, two hooks, `.claude/settings.json`, a project `verify` skill, `.claude/auto-memory/config.json`, `.gitignore` change.
5. Proof: every suite green, `/doctor prompt-audit` clean, hooks exercised with sample input.

## Not in this plan

- A GitHub Actions test workflow. Upstream has none. Worth a separate decision because it diverges the fork further.
- Custom subagents or new MCP servers.
- Changing upstream code style or adding a linter.
