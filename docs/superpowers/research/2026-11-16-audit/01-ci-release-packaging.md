# Audit pass: CI, release and packaging

Unedited report from one read-only pass on 2026-11-16, at commit `136ad730`. It is input to [the audit remediation spec](../../specs/2026-11-16-audit-remediation.md), not a decision record. Later passes corrected some of its claims; where this report and the spec or a plan disagree, the spec and the plan win. Paths under `<session scratchpad>` no longer exist.

---

ISSUES

Slice: CI, release and packaging. I did not edit anything or run any builds or tests.

1. **CI tests a different ai-gateway from the one releases ship** | high | confirmed
   - Evidence: `package-lock` resolves `@the-next-ai/ai-gateway@1.0.21` (`npm view`: gitHead 3fd93f8, published 2026-09-08). Release and Docker Release instead build upstream SHA `0a2c0abd` (2026-10-09, "Fix Anthropic tool IDs, virtual model streaming and raw traces") through `.github/actions/prepare-release-gateway/action.yml:12`. They install it with `npm install --no-save .tmp/gateway-package/*.tgz` at `release.yml:135,288,340` and with the Dockerfile tgz branch at `Dockerfile:16-18`. In CI, `tests/system/docker-smoke.mjs:23` calls `prepareLocalGatewayPackage()`. That looks for a sibling checkout (`build/docker-local-gateway.mjs:22`), finds none and falls back to the lockfile version. Unit, e2e and docker-smoke therefore never run against the shipped gateway, and Docker Release pushes multi-arch images without smoke-testing them (`docker-release.yml:88-103`).
   - Impact: a regression in the pinned gateway, or in how it fits with core, ships untested in the desktop app and the Docker image.
   - Recommendation: publish the fixed gateway and bump the lock so both paths use one version (S). Failing that, run `prepare-release-gateway` in the e2e and docker-smoke jobs (M).

2. **Windows installer is unsigned, so its auto-update has no publisher check** | medium | confirmed
   - Evidence: the `win` section of `electron-builder.json` has no signing settings and no `publisherName`. The `windows` job in `release.yml:306-309` passes no CSC secrets. The repo's secrets are only the five Apple and macOS ones. `update-service.ts:179-200` uses stock electron-updater. Nothing in docs or `private/` records this as a decision.
   - Impact: users get SmartScreen warnings. Updates are checked only against the sha512 in `latest.yml`, which comes from the same GitHub release, so anyone who can write releases controls both the file and its hash.
   - Recommendation: add Authenticode signing (for example Azure Trusted Signing) and set `publisherName` (M), or record unsigned Windows as a deliberate decision (S).

3. **The release goes public before Windows and Linux are built** | medium | confirmed
   - Evidence: `publish-macos` runs `gh release create` with no `--draft` and uploads `latest-mac.yml` (`release.yml:220-257`). `windows` and `linux` run only after that (`needs: publish-macos`, lines 261 and 313).
   - Impact: a failed Windows or Linux build leaves a public, partial release that macOS auto-update has already picked up. Docker Release is also skipped, because it needs the whole Release run to succeed.
   - Recommendation: create the release as a draft and add a final job that publishes it once all builds succeed (S).

4. **Nothing checks that the release commit passed CI** | medium | confirmed
   - Evidence: `scripts/release.mjs:15` runs only typecheck and `test:architecture`. Its preflight (lines 58-76) checks branch, cleanliness and sync with origin, not CI status. The Release `test` job (`release.yml:16-39`) skips e2e and docker-smoke. The ruleset "main: tests must pass" lets repository role 5 (admin) bypass it "always", and `docker-smoke` is not a required check (required: "Unit and architecture", "End to end"). For v7.2.1, Tests and Release both started at 05:11.
   - Impact: a main commit pushed directly (docs go straight to main by policy) or one that broke e2e or Docker can still be tagged and shipped.
   - Recommendation: in the release preflight, require the latest `gh run list --workflow test.yml --commit HEAD~0` run to be green (S). Add `🐳 Docker smoke` to the required checks (S).

5. **The macOS update-metadata merge has no tests** | medium | confirmed
   - Evidence: `build/merge-macos-update-metadata.mjs` picks the default ZIP, sha512 and `path` by URL substrings such as `arm64` (lines 34-37 and 77-81). No test in `tests/` or `packages/*/test` references it. `build/verify-update-metadata.cjs` only checks that referenced files exist, not their hashes, and it never runs on the merged file.
   - Impact: a naming change could give the wrong default artifact or a stale sha512 in `latest-mac.yml`, and macOS users would hit update failures in the field.
   - Recommendation: add an architecture test with two fixture YAMLs, and in `publish-macos` re-hash the downloaded ZIPs against the merged sha512 values (S).

6. **Dependabot misses docs/ and Docker base images** | medium | confirmed
   - Evidence: `.github/dependabot.yml` covers only `github-actions` and `npm` in `/`. `docs/package-lock.json` is a separate tracked lockfile; astro was bumped by hand in PR 62. The `node:24-bookworm-slim@sha256:55fb5f5a…` digest (`Dockerfile:1-2`) has not changed since PR 24 (2026-10-27), and `docker/claude-apps-gateway/compose.yaml` uses floating `postgres:16-alpine`.
   - Impact: the published image and the docs site fall behind on security patches unless someone remembers to update them.
   - Recommendation: add an `npm` entry for `/docs` and a `docker` entry for `/` (S).

7. **Apple signing secrets are available to every workflow** | low | confirmed
   - Evidence: `gh api .../actions/secrets` shows APPLE_* and MACOS_CERT_* at repo level. The only environments are `github-pages` and `copilot`. No tag ruleset protects `v*`, so any writer can push a tag and trigger Release.
   - Impact: any workflow change on a pushed branch could read the notarization key and the signing certificate. The risk is low while there is a single maintainer.
   - Recommendation: move these secrets to a `release` environment limited to `v*` tags, and add a tag ruleset (S).

8. **Repo settings are looser than the documented policy** | low | confirmed
   - Evidence: `actions/permissions` reports `sha_pinning_required: false` and `allowed_actions: all`, although every workflow `uses:` is already SHA-pinned. Merge commits and rebase merges are still enabled, although AGENTS.md says code is squash-merged.
   - Recommendation: turn on SHA-pinning enforcement and disable merge commits and rebase merges (S, settings only).

9. **Several release jobs have no timeout, and test runs on main cancel each other** | low | confirmed
   - Evidence: `gateway`, `macos`, `publish-macos`, `windows` and `linux` in `release.yml`, and the docs jobs, have no `timeout-minutes`, so a hung job runs for the 6-hour default. `test.yml:13-15` sets `cancel-in-progress: true` for main pushes too; three of the last 40 runs on main were cancelled, so those commits never got a test result.
   - Recommendation: add `timeout-minutes` to those jobs, and set `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` (S).

10. **The root package.json has publish config for a package nobody publishes** | low | confirmed
    - Evidence: all four workspaces and the root are `private: true`, yet the root has `publishConfig.access: public`, `prepack` and `prepublishOnly` (`package.json:29-31,46-47`). No workflow publishes to npm, and `npm view @llm-router/cli` returns 404.
    - Recommendation: delete the three fields (S), or decide to publish the CLI.

**Unverified leads**
- `build/docker-build.mjs:1` imports `generate-models-json.mjs` (network fetch, falls back without `--strict`), and Release regenerates the catalog without `--strict` (`release.yml:58`). The shipped catalog may silently be the checked-in one. Settle it with the Release job log line "[models] Refresh failed".
- Docker images have no cosign signature, SBOM or attestation (`build-push-action` uses its defaults). Settle it with `docker buildx imagetools inspect ghcr.io/<owner>/llm-router:7.2.1 --format '{{json .Provenance}}'`.
- Release assets have no checksum file (SHA256SUMS) or `actions/attest-build-provenance`, which leaves manual downloaders nothing to verify against. Decide whether that matters.
- The PR Tests failure on 2026-11-02 02:33 (claude/fix-stop-releases-claude-settings-55d66c) looks like a one-off. Settle it with `gh run view <id> --log-failed`.

**Checked and found fine**
- Every third-party action is pinned to a full SHA with a version comment, including the composite action.
- Workflow-level `permissions: contents: read`; write is granted per job only where it publishes (pages, packages, contents).
- No `pull_request_target`, and no fork-reachable secrets: test.yml uses no secrets.
- No `${{ github.event.* }}` inside `run:` blocks. Docker Release passes ref and version through `env:` and validates them against package.json; `matrix.*` values are static.
- `persist-credentials: false` on every checkout.
- Tests cover typecheck, every workspace suite plus architecture, e2e (which runs `build:assets`, so `validateLightweightMcpBundles` runs in CI), and docker-smoke.
- Run durations: Tests about 3.5 min, Release about 12 min, Docker Release about 8 min, model catalog about 20 s. No retries, all attempts = 1.
- Docker image: runs as non-root uid 10001 (the smoke test asserts it); has a HEALTHCHECK; npm, corepack and yarn are removed from the runtime; base image is digest-pinned; `.dockerignore` excludes `.env*`, `private`, `.claude` and `*.rendered.yaml`; no secrets are baked in, and the token is generated at runtime; compose binds to loopback.
- macOS: `forceCodeSigning`, hardened runtime and notarization are on; `afterSign` checks codesign, stapler and spctl; the tag version is checked against package.json in every build job; `verify-update-metadata` runs as `afterAllArtifactBuild`.
- `release.mjs` has a test (`tests/architecture/release-script.test.mjs`). Every build/ and scripts/ file has a reference; `llmr-rename.mjs` is still used as the ccr-residue guard test.
- model-catalog.yml pushes a fresh one-commit repo with the job token and has a `--strict` fallback guard.

Not checked: the bodies of `verify-packaged-app.cjs`, `macos-release-preflight.mjs` and the electron-builder.local config beyond confirming they are referenced. I did not open job logs.
