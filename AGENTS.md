# llm-router: instructions for coding assistants

Fork of claude-code-router v3.1.3. Divergence from upstream is intended; never weigh "upstream parity".

## Commands

- `npm ci` installs. npm only; see Repository etiquette.
- `npm run typecheck` runs `tsc --noEmit` across the workspace, including the `.ts` and `.tsx` test files, then checks the Codex runtime script (`packages/core/src/agents/codex/cli-middleware-runtime-source.runtime.cjs`) without strict mode through `tsconfig.codex-runtime.json`. The `.mjs` tests are not type-checked.
- `npm run lint` runs Biome as a linter over the workspace. Fix what it reports. `npx biome lint --write <path>` applies the safe fixes; read the diff, because a "safe" fix once deleted a `"use strict"` that a classic script needed. Never pass `--unsafe` without `--only=<rule>`.
- `npm run test:architecture` runs `tests/architecture/*.test.mjs`.
- `npm run test:core`, `npm run test:ui`, `npm run test:electron`, `npm run test:cli` run one package.
- `npm run test:e2e` builds the assets, then runs Playwright. Once per install, run `npm run test:e2e:install` first.
- `npm run test:system` builds the Docker image and smoke-tests it. CI's `docker-smoke` job builds the image, then runs the same script with `LLMR_DOCKER_TEST_SKIP_BUILD=1`. It needs Docker.
- `npm run build:assets` builds each package's `dist/`. `npm run dev:electron` runs the desktop app.
- `npm run release -- <major|minor|patch|x.y.z>` cuts a release from a clean, up-to-date `main` whose latest Tests run for `HEAD` is green (it needs `gh`, and after a push to `main` you wait for that run): bumps every workspace manifest and the lockfile, runs typecheck and the architecture tests, commits `chore: release vX.Y.Z`, tags, and pushes. The tag push runs the Release workflow (GitHub release with desktop assets), and the Docker Release workflow follows a successful Release run on its own. `--dry-run` prints the plan.
- One test file: `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<unit|integration|component|architecture>/<path>.test.js`. For `tests/architecture/`: `node build/test.mjs architecture && node --test .test-dist/architecture/test/<name>.test.js`. Do not pass `--scope`; it drops the subfolder from the output path.

## Where the standards are enforced

Read the check before changing the structure it guards. Change a rule only together with its check.

- `tests/architecture/*.test.mjs`: package boundaries, UI build contract, packaging, hooks. `npm run test:architecture`; the commit gate also runs it.
- `packages/core/test/architecture/gateway-service-architecture.test.mjs`: the `gateway/service.ts` facade (20-line cap, no `GatewayService` class or `node:http`; it re-exports `gateway/application/gateway-service` and `routing/protocol-endpoints`, and no other gateway module imports it) and no filesystem persistence in `config-compiler.ts`. `npm run test:core`; the gate does not run it.
- `biome.json`: lint rules, with the formatter and assists off on purpose. `npm run lint`; the commit gate and the Tests workflow run it. Its `overrides` turn single rules off where they misfire: the two unused-name rules in `*.astro` (Biome does not see the template), `noUnknownProperty` in `*.svg` (vendor exports), `noRedundantUseStrict` in `docs/public` and `extension/chrome` (classic scripts that Biome parses as modules), and `noChildrenProp` in one test. It does not lint `*.runtime.cjs`: that file is the Codex runtime script, which ships as text and is edited only on purpose. Turn a rule off only with its reason in the PR, and scope it with an override before excluding a path. `tests/architecture/package-scripts.test.mjs` pins the script, the exact version and the CI step, and plants a defect in `packages/core/src` to prove lint still reports it.
- `validateLightweightMcpBundles` and `forbiddenLightweightMcpInputs` in `build/esbuild.config.mjs`: size cap and forbidden imports for the bundles in `lightweightMcpBundleNames`. Only `npm run build:assets` runs it.
- `build/test-network-guard.mjs`: refuses every TCP connection a test makes to a host that is not loopback (a socket path, `localhost`, a `127.0.0.0/8` address, `::1`, `0.0.0.0` and `::` pass), and the run prints what it refused. `run-tests.mjs` loads it through `NODE_OPTIONS`, so it reaches every test process, worker thread and Node child that keeps `NODE_OPTIONS`. `tests/architecture/test-network-guard.test.mjs` pins it. DNS lookups, UDP, a proxy the machine runs on loopback, and programs that are not Node are outside it. A single-file `node --test` run does not guard worker threads, and Playwright (`npm run test:e2e`) is outside it.
- Path-scoped rules under `.claude/rules/` load on Read, Edit and Write of matching files and name their check. MCP reads such as `codegraph_explore` load no rule (measured 2026-10-25), so read a file with Read before changing it.

## Style that differs from defaults

Double quotes, semicolons, two-space indent. Object keys and type members usually alphabetized; follow the surrounding file. `node:` imports first, then `@llmr/<pkg>/...` aliases. `type` aliases unless the surrounding file already uses `interface`. No comments except a non-obvious why.

Tests are `node:test` with `node:assert/strict`. Core and CLI tests are `*.test.mjs`; Electron and UI tests are mostly `*.test.ts` or `*.test.tsx`, with a few `*.test.mjs`. They live under `packages/<pkg>/test/{unit,integration,component,architecture}` or `tests/architecture/`. `tests/e2e/` holds the Playwright `*.spec.ts` files.

## Generated files

Never hand-edit these; regenerate them.

- `packages/core/models.json`: `npm run models:build`.
- `packages/ui/src/generated/claude-code-config-options.json`: `node scripts/generate-claude-code-config-options.mjs`.
- `package-lock.json`: npm.
- `packages/*/dist/` and `.test-dist/`: build output.

When their upstream sources are reachable, `npm run build:assets` and `npm run test:e2e` rewrite the first two, and `models.json` gets a full catalog refresh; restore them with `git checkout -- packages/core/models.json packages/ui/src/generated` unless the change is intended. Bulk replaces with Serena `replace_in_files` must set `relative_path` to a file or directory; a project-wide replace is blocked.

## Repository etiquette

- npm only, never pnpm or yarn. `allowScripts` in the root `package.json` lists the native dependencies whose install scripts may run; approve a new one with `npm install-scripts approve <pkg>`.
- Committed review notes, findings and plan files go only under `docs/superpowers/`, never elsewhere in `docs/`. User-facing docs changes are fine.
- Docs-only changes (specs, plans, docs pages) commit straight to `main`. Code goes through a branch and a squash-merged PR.
- When a plan or spec has shipped, move it to the `completed/` folder beside it and repoint references to its old path.
- Tests that need `LLMR_EXTENSIONS_DIR` create their own temp dirs. Nothing depends on sibling checkouts.

## Local checks

In Claude Code sessions, `.claude/settings.json` blocks hand-edits to generated files, and runs typecheck, `npm run lint` and `npm run test:architecture` before a `git commit` run through Bash and before the Jean commit tool (about 15 s). The gate matches command text and fails closed: the word `git` followed anywhere by the separate word `commit` runs it and can block the command, as in `git log | grep commit`. Indirect spellings such as `$GIT commit` slip past. A fresh worktree without `node_modules` blocks commits until `npm ci` runs there. `LLMR_GATE_COMMANDS`, `LLMR_VERIFY_COMMANDS` and `LLMR_VERIFY_E2E_COMMAND` exist for tests only; never set them in a session. Edits made through Bash (`sed`, redirects) and commits from other tools are not hooked; the tests above are the check.
