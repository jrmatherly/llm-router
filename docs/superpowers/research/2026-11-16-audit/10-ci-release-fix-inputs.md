# Research: CI, release and settings fix inputs

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

**Goal.** The owner wants a plan that fixes today's CI, release and repo-settings audit findings. I worked out the smallest correct change for items A to H and how to prove each one. Nothing in the repo was changed, and I ran no `npm` scripts there.

## 1. Answer

**A. The gateway CI tests differs from the one releases ship.**
- Nothing can be bumped or published. `npm view @the-next-ai/ai-gateway` shows 1.0.21 is `latest`, published 2026-09-08 with gitHead `3fd93f8c`, and nothing newer exists.
- The pinned SHA `0a2c0abd` is the head of upstream branch `feat/v1.0.22`. It is 2 commits ahead of `3fd93f8c` and has diverged from upstream `main` (2 ahead, 2 behind).
- Its `package.json` still says `1.0.21`, so the tarball has the same name and version as the lockfile entry. Nothing in `npm ls` can tell them apart.
- The repo does not own that upstream, so publishing is not an option.
- **Recommendation.** Add a `gateway` job to `test.yml` that uses the same composite action. Then install the tarball in the unit and e2e jobs the way the release jobs already do (`npm install --no-save --package-lock=false .tmp/gateway-package/*.tgz`).
- Docker smoke needs no code change. Put the tgz in `docker/local-ai-gateway/`, run `docker build` in the workflow, then run `npm run test:system` with `LLMR_DOCKER_TEST_SKIP_BUILD=1`.
- This matters because `prepareLocalGatewayPackage()` deletes any `docker/local-ai-gateway/*.tgz` when it finds no source dir (`build/docker-local-gateway.mjs:32-38`). Running smoke without the skip flag would delete the tarball we just placed there.
- Skip caching. The gateway job took 39 s in the v7.2.1 Release run, and it runs in parallel.
- The Docker Release workflow should smoke-test before it pushes: an amd64 `load: true` build, then the smoke script, then the existing multi-arch push, which reuses the gha cache.

**B. `LLMR_TEST_GATEWAY_ENTRY`.**
- It is the path to a gateway bin. Both tests run `spawn(process.execPath, [entry])` (`recent-issues-wire.test.mjs:250`, `october-issues-wire.test.mjs:194`).
- The value is `${{ github.workspace }}/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js`. That bin only does `require('../dist/index.js')`.
- Set it in CI only, in the unit job's env, after the release tgz is installed. `run-tests.mjs` passes `process.env` through (`isolateTestHome` spreads it).
- Do not default it in `run-tests.mjs`. The comment at `recent-issues-wire.test.mjs:9-11` says the suite fails against an unpatched build, and the lockfile's 1.0.21 may be that build, so a default would break local `test:core`.

**C. Draft first, then publish.** This is a real fix and more than ordering:
- Today the release goes public at the end of `publish-macos`, and Windows only finished 3 min later in v7.2.1 (measured).
- In `node_modules/electron-publish/out/gitHubPublisher.js:69-97`, an existing draft is always reused. An existing published release more than 2 h old makes electron-builder log "skipped publishing" and exit 0.
- So re-running a failed Windows or Linux job more than 2 h after macOS published uploads nothing, and the job still shows green.

**D.** Add a pure `testsRunFailure(runs)` helper plus one `gh run list` call in `preflight`. `gh` needs the full SHA. `--commit 136ad730` returned `[]`, and the full SHA returned the success run.

**E. Dependabot.**
- On a fork, version updates need an explicit UI toggle. GitHub's docs page "Configuring Dependabot version updates" says they "are not automatically enabled on forks". The documented path is Settings, Advanced Security, Dependabot, "Dependabot version updates", Enable. That page documents no API for this.
- This repo is a fork (parent musistudio/claude-code-router), and it has had zero Dependabot PRs.
- Security updates are off (`/automated-security-fixes` returns `{"enabled":false}`). They can be turned on through the API.

**F to H.** Details are in the plan inputs below.

## 2. Evidence

- All measured: the npm and upstream state in A comes from `npm view ... versions time dist-tags gitHead`, `gh api repos/The-NeXT-AI/ai-gateway/compare/3fd93f8c...0a2c0abd`, `.../commits/0a2c0abd/branches-where-head` (returned `feat/v1.0.22`) and `.../contents/package.json?ref=0a2c0abd` (version 1.0.21).
- Measured: v7.2.1 job times from `gh run view`. Gateway 39 s, macOS up to 6 min, Windows done at 05:23:41 against publish at 05:20:30.
- Measured: `docker-smoke.mjs` imports only `node:` modules and `build/docker-local-gateway.mjs`, so it needs no `npm ci`. The Dockerfile installs any tgz it finds (`Dockerfile:15-17`), and `.dockerignore` does not exclude `docker/local-ai-gateway`.
- Measured: `gh api repos/<owner>/llm-router/rulesets/25837404` shows required checks "🧪 Unit and architecture" and "🎭 End to end". Its `bypass_actors` is `[{actor_id:5, RepositoryRole, always}]`, which is Admin.
- Measured: `actions/permissions` shows `sha_pinning_required:false`. Every `uses:` is pinned to a 40-hex SHA, and so are the nested actions in `withastro/action@a8b97df`.
- Measured: the repo allows merge, rebase and squash. There are no tag rulesets. The 5 Apple secrets sit at repo level. The environments are only `github-pages` (branch `main`) and `copilot`.
- Measured: `rg` finds nothing that uses `prepack`, `prepublishOnly` or `publishConfig` outside `package.json:29-31,46-47`, and no test asserts them.
- Measured: 5 of the 7 `release.yml` jobs and both `docs.yml` jobs have no `timeout-minutes`.
- Measured: Dependabot's `docker-compose` ecosystem exists, per the "supported ecosystems" docs page. Unverified: which compose filenames it reads, and whether it follows `ARG NODE_IMAGE=...@sha256` in the Dockerfile.

## 3. Plan inputs

**PR 1, "CI tests the shipped gateway" (A, B, F cancel-in-progress). Size M.**
- In `.github/workflows/test.yml:13-15`, change the concurrency to `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`.
- In `.github/workflows/test.yml`, add a new `gateway` job, `timeout-minutes: 15`. Steps:
  - checkout with `persist-credentials: false`
  - `uses: ./.github/actions/prepare-release-gateway`
  - upload-artifact `test-gateway`, path `docker/local-ai-gateway/the-next-ai-ai-gateway-*.tgz`, `retention-days: 1`
- The `test` job gets `needs: gateway`. After `npm ci`, it downloads to `.tmp/gateway-package` and runs the `--no-save` install. Add job-level `env: LLMR_TEST_GATEWAY_ENTRY: ${{ github.workspace }}/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js`.
- The `e2e` job gets `needs: [test, gateway]` plus the same download and install before `npm run test:e2e`. `build:assets` bundles the installed package, per `build/esbuild.config.mjs:117-126`.
- The `docker-smoke` job gets `needs: gateway`. It downloads to `docker/local-ai-gateway`, runs `docker build -t llm-router:local .`, then runs `npm run test:system` with `LLMR_DOCKER_TEST_SKIP_BUILD: "1"`. Keep the job name `🐳 Docker smoke`, because the ruleset change in PR 5 keys on it.
- In `.github/workflows/release.yml:16-39,71-75`, the `gateway` job loses `needs: test`. The `test` job gains `needs: gateway`, the install step and the same env.
- In `.github/workflows/docker-release.yml`, between lines 79 and 81, add `docker/build-push-action` with `platforms: linux/amd64`, `load: true`, `tags: llm-router:smoke`, `cache-from: type=gha`. Then add `node tests/system/docker-smoke.mjs` with `LLMR_DOCKER_TEST_IMAGE: llm-router:smoke` and `LLMR_DOCKER_TEST_SKIP_BUILD: "1"`. Node 24 comes from the composite action's setup-node.
- Extend `tests/architecture/workflow-permissions.test.mjs`. Keep the existing `npm run test:system` assertion at line 21.
  - Add `"tests and releases install the gateway tarball the release builds"`. It asserts that `test.yml` and `release.yml` contain `uses: ./.github/actions/prepare-release-gateway`, and that every job running `npm run test` or `npm run test:e2e` also contains `npm install --no-save --package-lock=false .tmp/gateway-package/*.tgz`.
  - Add `"pushes to main never cancel a Tests run"`. It matches `cancel-in-progress: \$\{\{ github.ref != 'refs/heads/main' \}\}`.
- Run it with `node build/test.mjs architecture && node --test .test-dist/architecture/test/workflow-permissions.test.js`.

**PR 2, "Release as a draft" (C, release timeouts, G, release environment). Size M. Lands after PR 1.**
- New `release.yml` graph:
  - `test`
  - `gateway`, `model-catalog`
  - `create-draft` (needs `test`, `contents: write`, `timeout-minutes: 5`): `gh release view "$GITHUB_REF_NAME" >/dev/null 2>&1 || gh release create "$GITHUB_REF_NAME" --draft --verify-tag --title "$GITHUB_REF_NAME" --generate-notes`
  - `macos` (needs model-catalog and gateway)
  - `upload-macos`, which is today's `publish-macos` minus the create step, with needs `[macos, create-draft]`
  - `windows` and `linux`, with needs `[create-draft, model-catalog, gateway]`. They now run in parallel with macOS, and electron-builder uploads into the draft.
  - `publish` (needs `[upload-macos, windows, linux]`, `timeout-minutes: 5`): `gh release view "$TAG" --json assets --jq '.assets[].name'`. It fails unless `latest-mac.yml`, `latest.yml`, `latest-linux.yml`, a `.exe`, an `.AppImage` and both `.dmg` files are present. Then it runs `gh release edit "$TAG" --draft=false --latest`.
- Timeouts: gateway 15, macos 45, upload-macos 10, windows 30, linux 20.
- Docker Release's `workflow_run` already fires only on a successful Release conclusion (`docker-release.yml:35`), so the image follows the public release unchanged.
- On a failed run, the draft stays private. "Re-run failed jobs" reuses it: `--clobber` on macOS, and electron-builder reuses the draft. Do not auto-delete it. Abandoning a release is a manual `gh release delete vX.Y.Z --yes` plus deleting the tag.
- Add `environment: release` to the `macos` job.
- Extend `workflow-permissions.test.mjs` with three tests:
  - `"the release stays a draft until every platform uploaded"`: asserts `gh release create` carries `--draft`, and that the `publish` job's `needs` names `upload-macos`, `windows` and `linux`.
  - `"every workflow job sets timeout-minutes"`: parse job blocks with `/^  [a-z0-9_-]+:$/m` under `jobs:`. Include digits, because `e2e` exists.
  - `"macOS signing runs in the release environment"`.
- New file `tests/architecture/merge-macos-update-metadata.test.mjs`. It writes YAML fixtures to an `mkdtempSync` dir and runs `spawnSync(process.execPath, ["build/merge-macos-update-metadata.mjs", out, ...inputs])`. Cases:
  - `"merges arm64 and x64 metadata with the arm64 zip as the update path"`: files ordered arm64 zip, x64 zip, arm64 dmg, x64 dmg. `path` and `sha512` come from the arm64 zip. `releaseDate` is the latest of the two.
  - `"drops duplicate file urls"`
  - `"falls back to the x64 zip when there is no arm64 zip"`
  - `"refuses metadata files with different versions"`: status non-zero, stderr matches `/same version/`.
  - `"refuses metadata without a zip sha512"`: `/at least one ZIP/`
  - `"refuses fewer than two inputs"`: status 1, `/Usage/`
- Run it with `node build/test.mjs architecture && node --test .test-dist/architecture/test/merge-macos-update-metadata.test.js`.

**PR 3, "Release preflight requires green Tests" (D). Size S. Lands after PR 1,** so that main runs stop being cancelled.
- In `scripts/release.mjs`, add `export function testsRunFailure(runs)`. It returns `undefined` or a reason:
  - `[]` gives `"no Tests run for HEAD"`
  - a status other than `completed` gives `"Tests run for HEAD is <status>: <url>"`
  - a conclusion other than `success` gives `"Tests run for HEAD concluded <conclusion>: <url>"`
- In `preflight`, after line 69: `const head = run("git", ["rev-parse", "HEAD"]);` then push the failure from `testsRunFailure(JSON.parse(run("gh", ["run", "list", "--workflow", "test.yml", "--commit", head, "--limit", "1", "--json", "status,conclusion,url"])))`.
- `--dry-run` reports it automatically, because `preflight` runs before the dry-run branch (`release.mjs:86-90`). It fails the same way a real release would.
- Extend `tests/architecture/release-script.test.mjs` and its import:
  - `"testsRunFailure accepts a completed, successful Tests run"`: returns `undefined`.
  - `"testsRunFailure names a missing, pending or failed Tests run"`: three `assert.match` calls with `/no Tests run/`, `/is in_progress/` and `/concluded failure/`.
- Run it with `node build/test.mjs architecture && node --test .test-dist/architecture/test/release-script.test.js`.

**PR 4, "Docs PR builds, Dependabot, dead publish scripts" (F docs, E, H). Size S.**
- In `docs.yml`, add `pull_request: paths: ["docs/**", ".github/workflows/docs.yml"]`. The deploy job's existing `if: github.ref == 'refs/heads/main'` (line 51) already skips PRs.
- Change the docs concurrency to `group: docs-${{ github.event_name == 'pull_request' && github.ref || 'deploy' }}` and `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Timeouts: build 15, deploy 10.
- Do not make the docs check required, because path filters would leave it pending.
- In `.github/dependabot.yml`, add three entries, each with weekly schedule, groups and prefix `chore`:
  - `npm` with `directory: "/docs"`, because `docs/` has its own lockfile and is not a workspace
  - `docker` with `/`
  - `docker-compose` with `/docker/claude-apps-gateway`, which has `postgres:16-alpine` and `dex:v2.44.0`
- In `package.json`, delete `publishConfig` (lines 29-31), `prepack` (46) and `prepublishOnly` (47).
- Docs-only, so it can go straight to `main`: in `docs/src/content/docs/en/guides/install.md`, under "Install the desktop app" (lines 18-26), say the Windows `.exe` is unsigned by decision and SmartScreen will warn.
- Also fix `README.md:216`, which says `windows-latest` while the workflow uses `windows-2025`.

**PR 5, owner-only settings steps. Each is a settings change, not a code change.**
- Dependabot version updates: in the UI, Settings, Advanced Security, Dependabot version updates, Enable. Optionally turn on security updates with `gh api -X PUT repos/<owner>/llm-router/automated-security-fixes`.
- Required Docker smoke check, after PR 1:
  - Read the current ruleset with `gh api repos/<owner>/llm-router/rulesets/25837404 > ruleset.json`.
  - Add `{"context":"🐳 Docker smoke"}` to the required checks.
  - Apply it with `gh api -X PUT repos/<owner>/llm-router/rulesets/25837404 --input ruleset.json`.
  - Keep the Admin bypass. `npm run release` pushes straight to `main` (`release.mjs:103`), and so do docs-only commits. Switching to `bypass_mode: pull_request` would break both.
- SHA pinning: `gh api -X PUT repos/<owner>/llm-router/actions/permissions -F enabled=true -f allowed_actions=all -F sha_pinning_required=true`.
- Squash-only merges: `gh api -X PATCH repos/<owner>/llm-router -F allow_merge_commit=false -F allow_rebase_merge=false`.
- Release environment:
  - `gh api -X PUT repos/<owner>/llm-router/environments/release -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'`
  - `gh api -X POST repos/<owner>/llm-router/environments/release/deployment-branch-policies -f name='v*' -f type=tag`
  - `gh secret set <NAME> --env release -R <owner>/llm-router` for each of the 5 Apple secrets
  - Delete the repo-level copies only after one release succeeds with PR 2's `environment: release`.
- Tag ruleset: `POST repos/<owner>/llm-router/rulesets` with `target: tag`, include `refs/tags/v*`, rules `deletion` and `non_fast_forward`, and the Admin bypass. Do not restrict `creation`, because the release script pushes tags.

## 4. Risks and unknowns

- **The two wire tests and the release tarball.** They have never run in CI, and I could not run them under the read-only rules. They may fail. The check: on PR 1's branch, install the tgz and run `node --test` on the two compiled files with the env set.
- **`gh` and draft releases.** I assumed, without checking, that `gh release view`, `gh release upload` and `gh release edit` find a draft by tag name on the runner's `gh`. The check: a `workflow_dispatch` dry run against a throwaway tag.
- **Updater clients.** I assumed, without checking, that electron-updater's GitHub provider never sees drafts.
- **`gh` repo resolution.** `gh` needs to know the repo. This clone has `gh repo set-default` (measured), but a fresh clone with `origin` and `upstream` fails with "multiple remotes detected", which I saw from `gh secret list`. Preflight then fails closed. Pass `-R` if that is unacceptable.
- **Dependabot coverage.** Unverified whether Docker updates the `ARG ...@sha256` image refs or which compose filenames it reads. The first Dependabot run will show it.
- **SHA pinning.** I did not check the actions nested inside `upload-pages-artifact@fc324d3`.

What I skipped: gateway caching, since it takes 39 s. Biggest risk: the wire tests may expose real failures once they run.
