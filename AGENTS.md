# llm-router: instructions for coding assistants

Fork of claude-code-router v3.1.3. Divergence from upstream is intended; never weigh "upstream parity".

## Commands

- `npm ci` installs. npm only; see Repository etiquette.
- `npm run typecheck` runs `tsc --noEmit` across the workspace.
- `npm run test:architecture` runs `tests/architecture/*.test.mjs`.
- `npm run test:core`, `npm run test:ui`, `npm run test:electron`, `npm run test:cli` run one package.
- `npm run test:e2e` runs Playwright after building the Electron sidecar of better-sqlite3 (`npm run sqlite:electron`, idempotent). Once per install, run `npm run test:e2e:install` first. Never run `rebuild:sqlite3` locally: it rebuilds the main binary for Electron and breaks every node suite; it is for packaging on the target platform.
- `npm run build:assets` builds each package's `dist/`. `npm run dev:electron` runs the desktop app.
- `npm run release -- <major|minor|patch|x.y.z>` cuts a release from a clean, up-to-date `main`: bumps every workspace manifest and the lockfile, runs typecheck and the architecture tests, commits `chore: release vX.Y.Z`, tags, and pushes. The tag push runs the Release workflow (GitHub release with desktop assets), and the Docker Release workflow follows a successful Release run on its own. `--dry-run` prints the plan.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component>/<path>.test.js`. Do not pass `--scope`; it drops that segment from the output path.

## Where the standards are enforced

Read the check before changing the structure it guards. Change a rule only together with its check.

- `tests/architecture/*.test.mjs`: package boundaries, UI build contract, packaging, hooks. `npm run test:architecture`; the commit gate also runs it.
- `packages/core/test/architecture/gateway-service-architecture.test.mjs`: gateway module layout and size limits. `npm run test:core`; the gate does not run it.
- `validateLightweightMcpBundles` and `forbiddenLightweightMcpInputs` in `build/esbuild.config.mjs`: size cap and forbidden imports for the bundles in `lightweightMcpBundleNames`. Only `npm run build:assets` runs it.
- Path-scoped rules under `.claude/rules/` load on Read, Edit and Write of matching files and name their check. MCP reads such as `codegraph_explore` load no rule (measured 2026-10-25), so read a file with Read before changing it.

## Style that differs from defaults

Double quotes, semicolons, two-space indent. Object keys and type members usually alphabetized; follow the surrounding file. `node:` imports first, then `@llmr/<pkg>/...` aliases. `type` aliases unless the surrounding file already uses `interface`. No comments except a non-obvious why.

Tests are `node:test` with `node:assert/strict`. Core and CLI tests are `*.test.mjs`; Electron and UI tests are mostly `*.test.ts` or `*.test.tsx`, with a few `*.test.mjs`. They live under `packages/<pkg>/test/{unit,integration,component}` or `tests/architecture/`.

## Generated files

Never hand-edit these; regenerate them.

- `packages/core/models.json`: `npm run models:build`.
- `packages/ui/src/generated/claude-code-config-options.json`: `node scripts/generate-claude-code-config-options.mjs`.
- `package-lock.json`: npm.
- `packages/*/dist/` and `.test-dist/`: build output.

`npm run build:assets` and `npm run test:e2e` rewrite the first two, and `models.json` gets a full catalog refresh; restore them with `git checkout -- packages/core/models.json packages/ui/src/generated` unless the change is intended. Bulk replaces with Serena `replace_in_files` must set `relative_path` to a file or directory; a project-wide replace is blocked.

## Repository etiquette

- npm only, never pnpm or yarn. `allowScripts` in the root `package.json` lists the native dependencies whose install scripts may run; approve a new one with `npm install-scripts approve <pkg>`.
- Review notes, findings and plan files go only under `docs/superpowers/`, never elsewhere in `docs/`. User-facing docs changes are fine.
- Tests that need `LLMR_EXTENSIONS_DIR` create their own temp dirs. Nothing depends on sibling checkouts.

## Local checks

In Claude Code sessions, `.claude/settings.json` blocks hand-edits to generated files, denies `npm run rebuild:sqlite3`, and runs typecheck plus `npm run test:architecture` before a `git commit` run through Bash and before the Jean commit tool (about 15 s). A fresh worktree without `node_modules` blocks commits until `npm ci` runs there. `LLMR_GATE_COMMANDS`, `LLMR_VERIFY_COMMANDS` and `LLMR_VERIFY_E2E_COMMAND` exist for tests only; never set them in a session. Edits made through Bash (`sed`, redirects) and commits from other tools are not hooked; the tests above are the check.
