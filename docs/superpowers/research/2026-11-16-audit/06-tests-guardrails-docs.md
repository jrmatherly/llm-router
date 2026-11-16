# Audit pass: tests, guardrails, docs and hygiene

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

ISSUES

**1. Some gateway and platform tests never run anywhere** | medium | confirmed
- Evidence: `packages/core/test/integration/gateway/recent-issues-wire.test.mjs:15` and `october-issues-wire.test.mjs:18` skip unless `LLMR_TEST_GATEWAY_ENTRY` is set. Nothing sets it: no hit in `build/`, `package.json`, `.github/` or the runner. That leaves 4 end-to-end tests that never run: fallback attribution (#1850/#1861), OAuth rotation and tool replay, virtual-model billing, and restart of a killed core (#1867). CI is ubuntu-only, so the 4 `skip: process.platform !== "win32"` tests and the 2 darwin-only tests never run either. Release builds Windows and macOS (`release.yml`) but runs no tests on them.
- Impact: failover and restart regressions on real gateway builds go unnoticed. Windows-only code ships without its own tests ever running.
- Recommendation: set `LLMR_TEST_GATEWAY_ENTRY` to the installed gateway entry in one CI job (S). Add a small windows-latest and macos `test:core` matrix leg, or run the suites in the release build jobs (M).

**2. Risky modules with no test** | medium | confirmed (checked by searching tests for every export name)
- Evidence, no test references any export:
  - `packages/electron/src/main/update-service.ts` (392 lines, electron-updater, `quitAndInstall`)
  - `packages/electron/src/main/chrome-login-import.ts` (593 lines, a local HTTP endpoint with `access-control-allow-origin: *` at :547 that writes cookies into sessions)
  - `packages/core/src/providers/manifest-service.ts` (333 lines)
  - `packages/core/src/gateway/features/cursor-compat.ts` (205 lines)
- More evidence:
  - `packages/ui/src/pages/home/components/settings.tsx` (3395 lines) and `App.tsx` (3557 lines) have no direct test.
  - The CLI (`packages/cli/src/cli.ts`, 1090 lines) has tests only for help and argument parsing. The start lock, gateway lease count, `stop` and the state file (`cli.ts:570-966`) are only partly reached through e2e `cli-web.spec.ts`.
  - Electron has 11.6k lines in 21 files. Its 6 unit tests cover the smallest files.
  - E2e covers provider edit, local-agent import onboarding, CLI web auth, Electron IPC and Workbuddy apply. It does not cover the routing rules editor, launching Claude Code or Codex profiles, settings, API keys, network logs or extensions.
- Covered well: token refresh (Claude Code, Codex, Grok and Kimi, including peer-rotation tests), takeover and restore (`profile-claude-app-takeover`, `backup-files`, `profile-service`), and retry policy (exposed through the facade's `ForTest` exports).
- Recommendation: unit tests first for the chrome-import handler (job lookup, domain filter, status 409/410) and the update service (S each). Then CLI service lifecycle tests (M).

**3. No linter or formatter at all** | medium | confirmed
- Evidence: `git ls-files` finds no eslint, prettier, biome, dprint, oxlint or editorconfig config, and devDependencies have none. The style in AGENTS.md (double quotes, sorted keys, import order, no comments) is checked by nothing.
- Impact: review has to catch style drift by hand, and agents drift too.
- Recommendation: add biome (or prettier) with a `lint` script in CI (M), or say in AGENTS.md that style is unenforced (S).

**4. TypeScript tests and the docs site are not typechecked** | low | confirmed
- Evidence: `tsconfig.json` and each package's `include` cover only `src/**` and `tests/e2e/**`. The 31 `packages/*/test/**/*.ts(x)` files are bundled by esbuild (`build/test.mjs:99`), which strips types without checking them. `docs.yml` builds only on push to `main` (no `pull_request` trigger), so a broken docs build shows up after merge.
- Recommendation: add the test globs to a tsconfig, and add `pull_request` with the docs paths filter to `docs.yml` (S).

**5. Upstream affiliate and referral codes ship in provider presets** | medium | confirmed
- Evidence:
  - `aff=ccr` in `kimi-coding/index.ts:30` and `moonshot/index.ts:84`
  - `aff=CCRCCR` in `infistar-ai/index.ts:15`
  - `aff=9HHHAB5QLAES` in `fenno/index.ts:14`, `aff=IX1t` in `runapi/index.ts:14`, and the `s.qiniu.com/AVjMVf` short link
  - The rename spec (`docs/superpowers/specs/completed/2026-10-27-ccr-to-llmr-rename.md:111`) kept them only as "not identifiers", and the sponsor decision is still open.
- Impact: sign-ups through this fork credit the upstream author's accounts.
- Recommendation: decide. Either strip the query parameters and short links (S), or keep them on purpose and record that.

**6. `blog/` is upstream content nothing links to** | low | confirmed
- Evidence: 3 first-person posts by the upstream author, untouched since `d77f5182`. 11 of the 12 images are unreferenced; README line 23 uses only `blog/images/llm-router.png`. `sponsors/glm-en.jpg` is unreferenced too.
- Recommendation: move the one screenshot to `docs/public` and delete `blog/` (S).

**7. AGENTS.md misstates the facade rule** | low | confirmed
- Evidence: AGENTS.md says the facade has "no imports from gateway modules". The test (`gateway-service-architecture.test.mjs:33-40`) and `.claude/rules/gateway.md` check the opposite direction: gateway modules must not import the facade. The facade itself must import `gateway/application/gateway-service` (asserted at :29). Also, the 20-line cap counts lines, and `service.ts:18` is one very long line.
- Recommendation: reword the AGENTS.md line (S).

**8. Dead publish hooks and a README Docker path that points outside the repo** | low | confirmed
- Evidence: every package is `private: true` (root and all 4), yet the root defines `prepack` and `prepublishOnly`. README line 201 says Docker uses `../../next-ai/gateway` when it exists (`build/docker-local-gateway.mjs:22`), the upstream developer's folder layout. It does not mention the published GHCR image that `docker/README.md:83` documents.
- Recommendation: drop the two scripts, and point the README to `ghcr.io/<owner>/llm-router:latest` (S).

**9. Fork hygiene: license, security policy and ignore rules** | low | confirmed
- Evidence:
  - `LICENSE` and `packages/cli/LICENSE` carry only "Copyright (c) 2025 musistudio", with no line for the fork's own work.
  - The repo is public with issues on and private vulnerability reporting enabled, but has no SECURITY.md, CONTRIBUTING or issue templates.
  - `CLAUDE.local.md` is ignored only in `.git/info/exclude`, and `.superpowers/` only by the global `~/.gitignore`, so a fresh clone would show both.
- Recommendation: add a fork copyright line, a short SECURITY.md that points to private reporting, and both paths to `.gitignore` (S).

**Status of the open items in `.remember`**
- **CA rename: done.** `packages/core/src/proxy/certificates.ts:24` has `PROXY_CA_NAME = "LLM Router CA"`.
- **npm name and publish: settled by not publishing.** All packages are private, `npm view @llm-router/cli` returns 404, and `docs/.../guides/cli.md:20` says the CLI isn't published.
- **`llmr-local-agent-login` key rename: done.** `packages/core/src/media/models.ts:9`; the notes record it merged in PR 35.
- **`ccr` identifier migration: done, with 2 exceptions.** `CCR_GATEWAY_RUNTIME_ID` and `CCR_UPSTREAM_PROXY_URL` (`gateway/internal/shared.ts:317-318`) wait on ai-gateway renaming them. The other leftovers are deliberate keeps listed in the rename spec.
- **npm token rotation: can't check from the repo.** Repo secrets hold only the 5 Apple and macOS secrets, with no `NPM_TOKEN` and no publish workflow, so the token belongs to your npm account and the repo doesn't use it.
- **README sponsor decision: still open.** README has no sponsor section any more, but the affiliate codes (item 5) and `glm-en.jpg` remain.
- **Clean-install check: can't check from the repo.** It needs a manual run on a machine.

**Unverified leads**
- Does `Bash(npm run rebuild:sqlite3 *)` deny the bare command with no arguments? Running it through a Claude Code permission check would settle it.
- Tests named `#18xx` refer to upstream issue numbers, while this repo's own numbers run to about #63. Possible confusion; worth settling in `.claude/rules/tests.md`.

**Checked and found fine**
- `gate-commit.mjs` matches AGENTS.md: typecheck plus `test:architecture`, a Bash `if` filter, the Jean tool matcher, and the block when `node_modules` is missing. The env overrides are used only in `tests/architecture`.
- `protect-generated.mjs` covers all 3 generated paths plus `dist` and `.test-dist`.
- CI's `npm run test` runs core's architecture test. Bundle validation runs in CI's e2e job (`test:e2e` runs `build:assets`) and in release.
- There are no `.only` or `.todo` tests, and Playwright sets `forbidOnly` in CI. The 52 `LLMR_INTERNAL_HOME_DIR` skips do run, because `build/test-home.mjs:17` sets the variable.
- The 4 tests flagged as having no `assert` all assert by throwing (`execFileSync --check`, `waitFor`, `verifyPackagedApp`, `expectStaticAsset`).
- The CLI commands in the docs (`ui`, `serve`, `web`, `start`, `stop`) match `parseArgs`. Docs have no references to removed features (Claude Design, Ship, takeover CLI), no Chinese text, and no upstream release or npm links.
- `examples/routing/jev.js` (used by a test and the docs), `extension/chrome` (architecture test and docs) and `components.json` (shadcn, matches the `@/*` alias) are in use. `release/` and `test-results/` are ignored, not tracked.
- `origin` has `main` and `models-catalog`: an orphan branch holding only `models.json` that `model-catalog.yml` publishes and `catalog-file.ts` reads. The 28 `upstream/*` branches are a local remote only.

Not done: I ran no suites, per the brief. The untested list relies on test files naming a module or its exports, so tests that reach a module indirectly may be missing from it.
