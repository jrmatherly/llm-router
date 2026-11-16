# Audit remediation: release safety implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CI test the gateway build that releases ship, keep a release private until every platform has uploaded, and refuse to cut a release from a commit whose Tests run is not green.

**Architecture:** Four pull requests change workflow files, one release script and their architecture tests. No product code changes. A fifth section is a checklist of repository settings that only the owner can change. Every workflow rule that a PR adds gets an assertion in `tests/architecture/workflow-permissions.test.mjs`, which the commit gate runs.

**Tech Stack:** GitHub Actions, `gh` CLI, Node 24, `node:test`, electron-builder, Docker Buildx, Dependabot.

**Spec:** `docs/superpowers/specs/2026-11-16-audit-remediation.md`. This plan fixes F-A1 to F-A13 and the `README.md:216` item of F-B9. The program index is `docs/superpowers/plans/2026-11-16-audit-remediation-index.md`.

## Global Constraints

Copied from the spec:

- Node `>=24`. npm only, never pnpm or yarn. Regenerate lockfiles with npm; never edit them by hand.
- Code goes through a branch and a squash-merged PR. Docs-only changes commit straight to `main`.
- The commit gate runs `npm run typecheck` and `npm run test:architecture`. Both must pass on every commit.
- Never `import()` the `ai-gateway` package or run it in-process in a test or script. It starts a server on `*:3000` that never exits. The one exception is the two wire test files in F-A3. They spawn the gateway bin as a child process that the test owns, and RS-1 runs them. The release safety plan's workstream constraints say how they start and stop it.
- Never run `npm run rebuild:sqlite3` locally.
- `npm run build:assets` and `npm run test:e2e` may rewrite `packages/core/models.json` and `packages/ui/src/generated/`. Restore them with `git checkout -- packages/core/models.json packages/ui/src/generated` unless the change is intended.
- Style: double quotes, semicolons, two-space indent, `node:` imports first, `type` aliases unless the file already uses `interface`, no comments except a non-obvious why.
- Tests are `node:test` with `node:assert/strict`. Run one file with `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<kind>/<path>.test.js`.
- The project has no consumers as of 2026-11-16 (decision D-9). No fix adds a compatibility shim, a migration for existing installs, or a deprecation period.
- A rule and the check that enforces it change in the same PR.
- This machine's `~/.npmrc` sets `min-release-age=7`. A package version younger than seven days does not install without an override, which is an owner step.

Specific to this workstream:

- Pin every workflow `uses:` to a 40-character SHA with a version comment. Copy the pins that the workflows already use. Do not look up new versions.
- Every checkout sets `persist-credentials: false`. Every workflow keeps `permissions: contents: read` at the top, and a job that writes declares its own permission. `workflow-permissions.test.mjs:5-13` enforces both.
- The job names `🧪 Unit and architecture`, `🎭 End to end` and `🐳 Docker smoke` are status-check names in ruleset 25837404. Do not rename them.
- The two wire tests in `packages/core/test/integration/gateway/` are the only code that starts the gateway bin. They pass `GATEWAY_CONFIG_PATH` with a reserved port and kill the child. Do not start the bin by hand.
- Do not give `LLMR_TEST_GATEWAY_ENTRY` a default in `build/run-tests.mjs`. The comment at `recent-issues-wire.test.mjs:9-11` says the suite fails against an unpatched gateway, and the lockfile's `1.0.21` may be that build.
- Pushing a tag, changing a repository setting and setting a secret are owner steps. An agent prepares the command and stops.
- Line numbers are from `136ad730`. Each edit also names a job, a step name or a text anchor. Trust the anchor when the two disagree.

## Review Focus

1. The `gateway` job in `test.yml` fails, so `test` and `e2e` are skipped. GitHub may count a skipped required check as passing (GitHub docs behaviour, not observed in this repo). A person expects a red PR. RS-5 step 2 makes `📦 Build gateway` a required check, and its read-back command is the pin.
2. Someone re-runs every job of a Release run after the release went public. A person expects a loud failure, not a green run that uploads nothing. Task 2.2 pins it with the `isDraft` check in `create-draft` and its assertion.
3. `artifactName` in `electron-builder.json` changes, so an asset gets a new name. A person expects the release to stay a draft and name the missing file. Task 2.2 pins the nine exact asset names in the `publish` job.
4. A macOS artifact URL loses the text `arm64`. The merge script then makes the x64 ZIP the default update path without an error. Task 2.1 pins the fallback so that a change to it is deliberate.
5. `gh` is missing, signed out, or cannot pick a repository when `npm run release` runs. The preflight exits non-zero with the error from `gh` and nothing is tagged. No unit test covers it. Task 3.1 step 7 runs the real command once.

## Order

Land RS-1 first. RS-2 and RS-3 then land in either order, because they share no file. RS-4 is independent and can land at any time. RS-5 is not a PR. Each of its steps names the PR that must merge first.

- RS-2 needs RS-1 because it edits the `release.yml` jobs that RS-1 rewires and uses the `jobBlocks` test helper that RS-1 adds.
- RS-3 needs RS-1 because the preflight reads the Tests run for `HEAD`, and before RS-1 a later push to `main` can cancel that run. Cut the first release after both RS-2 and RS-3 have merged, as the [program index](2026-11-16-audit-remediation-index.md) says, so one release exercises the draft flow and the new preflight together.

---

## RS-1: CI tests the gateway build that releases ship

**Fixes:** F-A1, F-A2, F-A3, F-A7.
**Depends on:** None.
**Branch:** `fix/ci-release-gateway`
**Size:** M
**Owner steps:** None. If Task 1.1 ends in outcome C, the owner triages the new finding.
**Status:** Merged 2026-11-16 as [PR 64](https://github.com/jrmatherly/llm-router/pull/64), squash commit `25464e79`. Task 1.1 ended in outcome A: 4 pass on the release tarball, and 2 of 4 fail on the lockfile build, so the wire tests tell the builds apart. A review changed four things from the steps below:

- The install command is `npm install --no-save .tmp/gateway-package/*.tgz`, in every job of `test.yml` and `release.yml`. With `--package-lock=false` npm re-resolved the tree (92 packages changed on the runner).
- The Tests concurrency group is per commit on `main`, because a shared group still cancels a queued run.
- Both Docker builds run `ls docker/local-ai-gateway/the-next-ai-ai-gateway-*.tgz` first, and the Release `gateway` job already has `timeout-minutes: 15`.
- `"release builds wait for the test job"` already asserts the `macos` `needs` line, and the install check names its jobs. RS-2 Task 2.2 Step 1 replaces that test, so keep those assertions when it does.

Background, checked at `136ad730`. `.github/actions/prepare-release-gateway/action.yml` builds upstream commit `0a2c0abd48d2144ed0ac2ce4d954a661c51ffcb1` and packs it into `docker/local-ai-gateway/`. Only `release.yml` and `docker-release.yml` use it. The tarball and the lockfile entry both report version `1.0.21`, so only the wire tests can tell the two builds apart.

### Task 1.1: Run the two wire tests against the release tarball

Neither file has ever run (F-A3). Learn the result before CI depends on it.

**Files:**
- Read: `packages/core/test/integration/gateway/recent-issues-wire.test.mjs` (1 test), `october-issues-wire.test.mjs` (3 tests)
- Modify: only if outcome B applies

- [ ] **Step 1: Build the tarball the way the composite action does**

`.tmp` is ignored by git. Read the commit from the `ref:` line of the action file instead of copying it from this plan.

```bash
ref="$(sed -n 's/^ *ref: //p' .github/actions/prepare-release-gateway/action.yml)"
git clone https://github.com/The-NeXT-AI/ai-gateway .tmp/release-gateway
git -C .tmp/release-gateway checkout "$ref"
(cd .tmp/release-gateway && npm ci && npm run build && mkdir -p ../gateway-package && npm pack --ignore-scripts --pack-destination ../gateway-package)
```

Expected: one file `.tmp/gateway-package/the-next-ai-ai-gateway-1.0.21.tgz`.

- [ ] **Step 2: Install it without touching the manifests, then run both files**

```bash
npm install --no-save --package-lock=false .tmp/gateway-package/*.tgz
node build/test.mjs core
LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" \
  node --test .test-dist/core/test/integration/gateway/recent-issues-wire.test.js \
              .test-dist/core/test/integration/gateway/october-issues-wire.test.js
```

Expected: `# tests 4`, `# skipped 0`. A skip count above zero means the variable did not reach the tests.

- [ ] **Step 3: Act on the outcome**

- **Outcome A, 4 pass.** Continue with step 4.
- **Outcome B, a test fails and the test is wrong.** Examples are a stale fixture, a moved worker path such as `october-issues-wire.test.mjs:22`, or a timing assumption. Fix the test in this PR in its own commit, `test(core): repair the gateway wire tests`, and rerun step 2 until 4 pass. Do not add a retry loop or a flaky label.
- **Outcome C, a test fails and the gateway build or core is wrong.** Do not weaken or delete the assertion. Add a row `F-A14` to section A of the spec with the test name, the failing assertion and the output, and commit that docs-only change to `main`. In this PR, give only the failing `test(...)` call the option `todo: "F-A14: <the finding in one line>"`. `node:test` still runs a `todo` test and prints its failure, but does not fail the suite. List it under a "Known failing" heading in the PR description and tell the owner. The PR that fixes F-A14 removes the `todo`.

Never leave `LLMR_TEST_GATEWAY_ENTRY` unset in CI to get a green run.

- [ ] **Step 4: Record whether the wire tests tell the two builds apart, then restore `node_modules`**

```bash
npm ci
LLMR_TEST_GATEWAY_ENTRY="$PWD/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js" \
  node --test .test-dist/core/test/integration/gateway/recent-issues-wire.test.js \
              .test-dist/core/test/integration/gateway/october-issues-wire.test.js
```

A failure here is the expected result and confirms that the lockfile build is unpatched. If all 4 pass, the wire tests cannot detect the wrong gateway build. Write either result in the PR description. Do not change code for it.

### Task 1.2: Install the release tarball in the Tests and Release test jobs

**Files:**
- Modify: `.github/workflows/test.yml:13-15` (`concurrency`), `:18-41` (job `test`), `:43-67` (job `e2e`)
- Modify: `.github/workflows/release.yml:16-39` (job `test`), `:71-75` (job `gateway`)
- Test: `tests/architecture/workflow-permissions.test.mjs`

**Interfaces:**
- Produces: `jobBlocks(file: string): Map<string, string>` in the test file. It reads the workflow, takes the text after the line `jobs:`, and splits it at lines that match `/^  [a-z0-9_-]+:$/m`. The key is the job id and the value is the job's text, including its id line. The digit class matters because `e2e` is a job id. RS-2 uses this helper.
- Produces: artifact `test-gateway` in `test.yml`. Task 1.3 downloads it.

- [ ] **Step 1: Write the failing tests**

Replace the body of the existing test `"release builds wait for the test job"` (lines 15-22). The `gateway` job stops waiting for `test`, so its old assertion has to go. Add the helper above the tests. `readFileSync` is already imported.

```js
function jobBlocks(file) {
  const text = readFileSync(file, "utf8");
  const body = text.slice(text.indexOf("\njobs:\n") + 7);
  const starts = [...body.matchAll(/^  ([a-z0-9_-]+):$/gm)];
  return new Map(starts.map((m, i) => [m[1], body.slice(m.index, starts[i + 1]?.index)]));
}

const gatewayInstall = "npm install --no-save --package-lock=false .tmp/gateway-package/*.tgz";
const gatewayEntry = /^      LLMR_TEST_GATEWAY_ENTRY: \$\{\{ github\.workspace \}\}\/node_modules\/@the-next-ai\/ai-gateway\/bin\/next-ai-gateway\.js$/m;

test("release builds wait for the test job", () => {
  const jobs = jobBlocks(".github/workflows/release.yml");
  assert.match(jobs.get("model-catalog"), /^    needs: test$/m);
  assert.match(jobs.get("test"), /^    needs: gateway$/m);
  assert.match(readFileSync(".github/workflows/test.yml", "utf8"), /npm run test:system/);
});

test("tests and releases install the gateway tarball the release builds", () => {
  for (const file of [".github/workflows/test.yml", ".github/workflows/release.yml"]) {
    const jobs = jobBlocks(file);
    assert.match(jobs.get("gateway"), /uses: \.\/\.github\/actions\/prepare-release-gateway/, file);
    assert.match(jobs.get("test"), gatewayEntry, file);
    for (const [name, block] of jobs) {
      if (!/npm run test(?::e2e)?$/m.test(block)) continue;
      assert.ok(block.includes(gatewayInstall), `${file} ${name} installs the gateway tarball`);
      assert.match(block, /^    needs: \[?(?:test, )?gateway\b/m, `${file} ${name} waits for the gateway job`);
    }
  }
});

test("pushes to main never cancel a Tests run", () => {
  assert.match(readFileSync(".github/workflows/test.yml", "utf8"), /^  cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}$/m);
});
```

The pattern `npm run test(?::e2e)?$` matches the unit and e2e jobs and must not match `npm run test:system`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/workflow-permissions.test.js`
Expected: FAIL in the three tests above. The first failure is in `"release builds wait for the test job"`, where `jobs.get("test")` in `release.yml` does not match `needs: gateway`, because today `gateway` waits for `test`.

- [ ] **Step 3: Edit `test.yml`**

Set `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`. Add this job before `test`:

```yaml
  gateway:
    name: 📦 Build gateway
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - name: 📥 Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: 📦 Prepare gateway package
        uses: ./.github/actions/prepare-release-gateway

      - name: 📤 Upload gateway package
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: test-gateway
          path: docker/local-ai-gateway/the-next-ai-ai-gateway-*.tgz
          if-no-files-found: error
          retention-days: 1
```

Job `test` gets `needs: gateway` and this job-level block:

```yaml
    env:
      LLMR_TEST_GATEWAY_ENTRY: ${{ github.workspace }}/node_modules/@the-next-ai/ai-gateway/bin/next-ai-gateway.js
```

Job `e2e` changes `needs: test` to `needs: [test, gateway]`. In both jobs, add these two steps directly after `📦 Install dependencies`:

```yaml
      - name: 📥 Download gateway package
        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: test-gateway
          path: .tmp/gateway-package

      - name: 📦 Install gateway
        run: npm install --no-save --package-lock=false .tmp/gateway-package/*.tgz
```

`npm run test:e2e` runs `build:assets`, which bundles the installed package (`resolveGatewayRoot` in `build/esbuild.config.mjs`, the loop over `"@the-next-ai/ai-gateway"`). Skip caching the tarball. The same job took 39 s in the v7.2.1 Release run.

- [ ] **Step 4: Edit `release.yml`**

Job `gateway` loses `needs: test`. Job `test` gets `needs: gateway`, the same `env` block, and the same two steps after `📦 Install dependencies` with `name: release-gateway`. The `macos` job still waits for `test` through `model-catalog`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/workflow-permissions.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/test.yml .github/workflows/release.yml tests/architecture/workflow-permissions.test.mjs
git commit -m "ci: test the gateway tarball that releases ship"
```

### Task 1.3: Smoke-test the Docker image with the release gateway, before any push

**Files:**
- Modify: `.github/workflows/test.yml:80-96` (job `docker-smoke`)
- Modify: `.github/workflows/docker-release.yml` (between the steps `⚙️ Set up Docker Buildx` and `🔐 Log in to GitHub Container Registry`, lines 79-81)
- Modify: `AGENTS.md:12`
- Test: `tests/architecture/workflow-permissions.test.mjs`

**Interfaces:**
- Consumes: `jobBlocks` and artifact `test-gateway` from Task 1.2.

- [ ] **Step 1: Write the failing test**

```js
test("the Docker image is smoke-tested with the release gateway before any push", () => {
  const smoke = jobBlocks(".github/workflows/test.yml").get("docker-smoke");
  assert.match(smoke, /^    needs: gateway$/m);
  assert.match(smoke, /^          path: docker\/local-ai-gateway$/m);
  assert.match(smoke, /LLMR_DOCKER_TEST_SKIP_BUILD: "1"/);
  const release = readFileSync(".github/workflows/docker-release.yml", "utf8");
  const smokeRun = release.indexOf("node tests/system/docker-smoke.mjs");
  assert.ok(smokeRun > 0 && smokeRun < release.indexOf("push: true"), "the smoke test runs before the push");
  assert.match(release, /^          load: true$/m);
  assert.match(release, /LLMR_DOCKER_TEST_IMAGE: llm-router:smoke/);
  assert.match(release, /LLMR_DOCKER_TEST_SKIP_BUILD: "1"/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/workflow-permissions.test.js`
Expected: FAIL on `needs: gateway`.

- [ ] **Step 3: Edit the `docker-smoke` job in `test.yml`**

Add `needs: gateway`. Keep the job name and the Node setup step. Replace the last step with:

```yaml
      - name: 📥 Download gateway package
        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: test-gateway
          path: docker/local-ai-gateway

      - name: 🐳 Build the image
        run: docker build -t llm-router:local .

      - name: 🐳 Smoke-test the image
        env:
          LLMR_DOCKER_TEST_SKIP_BUILD: "1"
        run: npm run test:system
```

The skip flag is required. Without it, `docker-smoke.mjs:22-25` calls `prepareLocalGatewayPackage()`, which finds no gateway source and deletes every `.tgz` in `docker/local-ai-gateway/` (`build/docker-local-gateway.mjs:32-33`). The `Dockerfile` installs any tarball it finds there (lines 15-17). The job needs no `npm ci` because `docker-smoke.mjs` imports only `node:` modules and `build/docker-local-gateway.mjs`.

- [ ] **Step 4: Edit `docker-release.yml`**

Insert after `⚙️ Set up Docker Buildx`:

```yaml
      - name: 🐳 Build the image for the smoke test
        uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0
        with:
          context: .
          file: Dockerfile
          platforms: linux/amd64
          load: true
          tags: llm-router:smoke
          cache-from: type=gha

      - name: 🐳 Smoke-test the image
        env:
          LLMR_DOCKER_TEST_IMAGE: llm-router:smoke
          LLMR_DOCKER_TEST_SKIP_BUILD: "1"
        run: node tests/system/docker-smoke.mjs
```

Node 24 is on the runner by then, because the composite action runs `setup-node`. Leave the multi-arch push step unchanged.

- [ ] **Step 5: Update `AGENTS.md:12`**

Replace the sentence with: "`npm run test:system` builds the Docker image and smoke-tests it. CI's `docker-smoke` job builds the image with the release gateway tarball first and runs the same script with `LLMR_DOCKER_TEST_SKIP_BUILD=1`. It needs Docker."

- [ ] **Step 6: Run the test to see it pass**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/workflow-permissions.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/test.yml .github/workflows/docker-release.yml AGENTS.md tests/architecture/workflow-permissions.test.mjs
git commit -m "ci: smoke-test the Docker image with the release gateway before pushing"
```

### Task 1.4: Verify before opening the PR

- [ ] **Step 1: Run the local checks**

```bash
node -e 'const y=require("js-yaml"),fs=require("node:fs");for(const f of fs.readdirSync(".github/workflows"))y.load(fs.readFileSync(".github/workflows/"+f,"utf8"));console.log("ok")'
npm run typecheck
npm run test:architecture
```

Expected: `ok`, no type errors, 0 failures. If Task 1.1 changed a wire test, also run `npm run test:core`.

- [ ] **Step 2: Open the PR and read the first Tests run**

Run: `gh pr checks --watch`
Expected: `📦 Build gateway`, `🧪 Unit and architecture`, `🎭 End to end` and `🐳 Docker smoke` pass. Open the unit job log and confirm that the four wire tests ran and none shows `# SKIP`. If a wire test passes locally and fails on the runner, return to Task 1.1 step 3. The `docker-release.yml` change first runs at the next release. Its failure mode is safe, because the smoke step runs before the push.

---

## RS-2: Publish the release only after every platform uploaded

**Fixes:** F-A4, F-A6, F-A8 for the release jobs.
**Depends on:** RS-1.
**Branch:** `fix/release-draft-until-complete`
**Size:** M
**Owner steps:** Task 2.3 pushes a throwaway tag and deletes a draft release. RS-5 step 5 creates the `release` environment. Do it before the first real release after this PR.
**Status:** Merged 2026-11-16 as [PR 67](https://github.com/jrmatherly/llm-router/pull/67), squash commit `279409ac`. The `release` environment exists, limited to `v*` tags, and holds the five signing secrets. The repository-level copies stay until one release succeeds. Task 2.3 passed twice on the runner, on the first commit and on the final one: `create-draft` works, a draft is found by tag, takes uploads, can be listed and downloaded from, and the public `releases/latest` stayed at `v7.2.1`. Both test tags and drafts are deleted. A review and the owner's "no manual approval" requirement changed these things from the steps below:

- `EP_DRAFT: "true"` on the Windows and Linux upload steps. electron-builder reads one page of releases, and with `releaseType: release` a missed draft would have become a public release.
- `create-draft` requires exactly one release for the tag and no longer hides the first lookup's error.
- `publish` also requires every file that `latest.yml`, `latest-mac.yml` and `latest-linux.yml` name, counts only assets in state `uploaded` with a size above zero, and requires `latest-mac.yml` to list both architectures.
- `tests/architecture/release-publish-step.test.mjs` runs the publish step's script with a stub `gh`. The text assertions on the asset names are gone.

**First real release, v7.2.2 on 2026-11-16.** The flow worked end to end: Windows and Linux uploaded into the draft, both macOS builds signed with the environment secrets, the asset check passed on 14 assets, `gh release edit --draft=false --latest` published, and Docker Release smoke-tested and pushed `7.2.2`, `7.2` and `latest`. The first attempt failed in `create-draft`, because the release list did not show the draft about 1.3 seconds after it was created, so the "exactly one release" count was 0. Nothing was public, and `gh run rerun <id> --failed` finished the release. [PR 68](https://github.com/jrmatherly/llm-router/pull/68) (squash commit `d00c6d49`) retries that count for up to 25 seconds while it is zero. The retry has not run on a real release yet.

If `publish` fails after every asset uploaded, "Re-run failed jobs" is the simplest recovery. The manual commands in Task 2.3 Step 4 still work. RS-5 step 5 is complete: the owner deleted the five repository-level signing secrets on 2026-11-16, and the `release` environment holds the only copies. Still open: nobody has installed or launched a v7.2.2 build.

Background, checked at `136ad730`. `publish-macos` creates a public release (`release.yml:224-225`), and `windows` and `linux` start only after it (`:261`, `:313`). electron-builder reuses an existing draft, and skips a published release that is more than two hours old with a warning and exit code 0 (`node_modules/electron-publish/out/gitHubPublisher.js:69-97`). `electron-builder.json` sets `"releaseType": "release"`, and the publisher has no code that flips a draft to published, so the draft stays a draft until the new `publish` job edits it.

### Task 2.1: Test the macOS update-metadata merge

**Files:**
- Create: `tests/architecture/merge-macos-update-metadata.test.mjs`
- Read: `build/merge-macos-update-metadata.mjs`

The script exists, so these tests describe current behaviour and should pass on the first run. A failure is a defect in the script. Fix the script in this PR and say so in the PR description.

- [ ] **Step 1: Write the tests**

Each test writes fixtures into an `mkdtempSync` directory with `yaml.dump` from `js-yaml`, runs `spawnSync(process.execPath, ["build/merge-macos-update-metadata.mjs", out, ...inputs], { encoding: "utf8" })`, and reads `out` with `yaml.load`. Use the real artifact names, `LLM-Router_7.2.1-mac-Apple-Silicon-arm64.zip`, `...-arm64.dmg`, `LLM-Router_7.2.1-mac-Intel-x64.zip` and `...-x64.dmg`. Give each file entry a distinct `sha512` such as `"arm-zip"`.

```js
test("merges arm64 and x64 metadata with the arm64 zip as the update path", () => {
  const merged = merge(
    metadata("7.2.1", "2026-11-16T05:18:00.000Z", [x64Zip, x64Dmg]),
    metadata("7.2.1", "2026-11-16T05:15:00.000Z", [armZip, armDmg])
  );
  assert.deepEqual(merged.files.map((file) => file.url), [armZip.url, x64Zip.url, armDmg.url, x64Dmg.url]);
  assert.equal(merged.path, armZip.url);
  assert.equal(merged.sha512, "arm-zip");
  assert.equal(merged.version, "7.2.1");
  assert.equal(merged.releaseDate, "2026-11-16T05:18:00.000Z");
});
```

The x64 input comes first on purpose, so the test proves that argument order does not decide the default.

| Test name | Inputs | Assertions |
|---|---|---|
| `"drops duplicate file urls"` | both inputs list `armZip` | `merged.files.filter((file) => file.url === armZip.url).length === 1` |
| `"falls back to the x64 zip when there is no arm64 zip"` | `[x64Zip, x64Dmg]` and `[x64Zip, armDmg]` | `merged.path === x64Zip.url`, `merged.sha512 === "x64-zip"` |
| `"refuses metadata files with different versions"` | versions `7.2.1` and `7.2.0` | `status !== 0`, `stderr` matches `/same version/`, `out` does not exist |
| `"refuses metadata without a zip sha512"` | only the two `.dmg` entries | `status !== 0`, `stderr` matches `/at least one ZIP/` |
| `"refuses fewer than two inputs"` | one input | `status === 1`, `stderr` matches `/Usage/` |

- [ ] **Step 2: Run the tests**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/merge-macos-update-metadata.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 3: Prove the tests can fail**

Change `includes("arm64")` to `includes("x64")` on line 35 of the script, rerun, and see the first test fail on `merged.path`. Revert with `git checkout -- build/merge-macos-update-metadata.mjs`.

- [ ] **Step 4: Commit**

```bash
git add tests/architecture/merge-macos-update-metadata.test.mjs
git commit -m "test: cover the macOS update metadata merge"
```

### Task 2.2: Create a draft first and publish it last

**Files:**
- Modify: `.github/workflows/release.yml` (jobs `gateway`, `macos`, `publish-macos`, `windows`, `linux`, and two new jobs)
- Test: `tests/architecture/workflow-permissions.test.mjs`

**Interfaces:**
- Consumes: `jobBlocks(file)` from Task 1.2.

The job graph after this task:

| Job | `needs` | `timeout-minutes` | Change |
|---|---|---|---|
| `gateway` | none | 15 | adds the timeout |
| `test` | `gateway` | 20 | none |
| `model-catalog` | `test` | 5 | none |
| `create-draft` | `test` | 5 | new |
| `macos` | `[model-catalog, gateway]` | 45 | adds the timeout and `environment: release` |
| `upload-macos` | `[macos, create-draft]` | 10 | `publish-macos` renamed, without its `🚀 Create GitHub release` step |
| `windows` | `[create-draft, model-catalog, gateway]` | 30 | new `needs`, adds the timeout |
| `linux` | `[create-draft, model-catalog, gateway]` | 20 | new `needs`, adds the timeout |
| `publish` | `[upload-macos, windows, linux]` | 5 | new |

- [ ] **Step 1: Write the failing tests**

Replace `"release builds wait for the test job"` again and add three tests.

```js
const releaseAssets = [
  "latest-mac.yml", "latest.yml", "latest-linux.yml",
  "LLM-Router_${version}.exe", "LLM-Router_${version}.AppImage",
  "LLM-Router_${version}-mac-Apple-Silicon-arm64.dmg", "LLM-Router_${version}-mac-Apple-Silicon-arm64.zip",
  "LLM-Router_${version}-mac-Intel-x64.dmg", "LLM-Router_${version}-mac-Intel-x64.zip"
];

test("release builds wait for the test job", () => {
  const jobs = jobBlocks(".github/workflows/release.yml");
  for (const job of ["model-catalog", "create-draft"]) assert.match(jobs.get(job), /^    needs: test$/m, job);
  assert.match(jobs.get("test"), /^    needs: gateway$/m);
  assert.match(jobs.get("macos"), /^    needs: \[model-catalog, gateway\]$/m);
  for (const job of ["windows", "linux"]) assert.match(jobs.get(job), /^    needs: \[create-draft, model-catalog, gateway\]$/m, job);
  assert.match(readFileSync(".github/workflows/test.yml", "utf8"), /npm run test:system/);
});

test("the release stays a draft until every platform uploaded", () => {
  const text = readFileSync(".github/workflows/release.yml", "utf8");
  const jobs = jobBlocks(".github/workflows/release.yml");
  assert.equal(jobs.has("publish-macos"), false);
  assert.equal(text.match(/gh release create /g).length, 1);
  assert.match(jobs.get("create-draft"), /gh release create "\$GITHUB_REF_NAME" --draft --verify-tag /);
  assert.match(jobs.get("create-draft"), /--json isDraft --jq \.isDraft\)" = "true"$/m);
  assert.match(jobs.get("upload-macos"), /^    needs: \[macos, create-draft\]$/m);
  assert.match(jobs.get("publish"), /^    needs: \[upload-macos, windows, linux\]$/m);
  assert.equal(text.match(/--draft=false/g).length, 1);
  assert.match(jobs.get("publish"), /gh release edit "\$GITHUB_REF_NAME" --draft=false --latest$/m);
  for (const name of releaseAssets) assert.ok(jobs.get("publish").includes(name), name);
});

test("every release.yml job sets timeout-minutes", () => {
  for (const [name, block] of jobBlocks(".github/workflows/release.yml")) {
    assert.match(block, /^    timeout-minutes: \d+$/m, name);
  }
});

test("macOS signing runs in the release environment", () => {
  for (const [name, block] of jobBlocks(".github/workflows/release.yml")) {
    if (name === "macos") assert.match(block, /^    environment: release$/m);
    else assert.doesNotMatch(block, /secrets\.(?:APPLE|MACOS)_/, name);
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/workflow-permissions.test.js`
Expected: FAIL in all four. The first failure is `jobs.get("create-draft")` being `undefined`.

- [ ] **Step 3: Add the two new jobs**

Neither job checks out the repository, so both set `GH_REPO`.

```yaml
  create-draft:
    name: 📝 Create draft release
    needs: test
    permissions:
      contents: write
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - name: 📝 Create the draft release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GH_REPO: ${{ github.repository }}
        run: |
          gh release view "$GITHUB_REF_NAME" >/dev/null 2>&1 || \
            gh release create "$GITHUB_REF_NAME" --draft --verify-tag --title "$GITHUB_REF_NAME" --generate-notes
          test "$(gh release view "$GITHUB_REF_NAME" --json isDraft --jq .isDraft)" = "true"

  publish:
    name: 🚀 Publish release
    needs: [upload-macos, windows, linux]
    permissions:
      contents: write
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - name: 🚀 Check the assets, then publish
        shell: bash
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GH_REPO: ${{ github.repository }}
        run: |
          version="${GITHUB_REF_NAME#v}"
          gh release view "$GITHUB_REF_NAME" --json assets --jq '.assets[].name' > assets.txt
          missing=0
          for name in latest-mac.yml latest.yml latest-linux.yml \
            "LLM-Router_${version}.exe" "LLM-Router_${version}.AppImage" \
            "LLM-Router_${version}-mac-Apple-Silicon-arm64.dmg" "LLM-Router_${version}-mac-Apple-Silicon-arm64.zip" \
            "LLM-Router_${version}-mac-Intel-x64.dmg" "LLM-Router_${version}-mac-Intel-x64.zip"; do
            grep -qxF "$name" assets.txt || { echo "Missing release asset: $name"; missing=1; }
          done
          (( missing == 0 ))
          gh release edit "$GITHUB_REF_NAME" --draft=false --latest
```

The nine names match the v7.2.1 release assets, read with `gh release view v7.2.1 --json assets`. The `isDraft` line makes a full re-run after publication fail instead of uploading nothing.

- [ ] **Step 4: Rewire the existing jobs**

Apply the table. In `upload-macos`, delete the step `🚀 Create GitHub release` and keep `gh release upload ... --clobber`. Put `environment: release` on the `macos` job at the same indent as `needs`. Do not change any build step.

Do not add a step that deletes the draft on failure. A failed run leaves a private draft, and "Re-run failed jobs" uploads into it. To abandon a release, the owner runs `gh release delete vX.Y.Z --yes --cleanup-tag`.

Docker Release needs no change. Its `workflow_run` trigger already requires `conclusion == 'success'` (`docker-release.yml:35`), so the image now follows the public release.

- [ ] **Step 5: Run the tests to see them pass**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/workflow-permissions.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml tests/architecture/workflow-permissions.test.mjs
git commit -m "ci: keep the release a draft until every platform uploaded"
```

### Task 2.3: Confirm the draft flow with a throwaway tag (owner step)

`gh` finds a draft release by tag. `FetchRelease` in `cli/cli` (`pkg/cmd/release/shared/fetch.go`) falls back to a lookup of a draft by its tag. That was read from source, so this task is a confidence step on the runner's `gh` and `GITHUB_TOKEN` and on what an updater sees. A tag push runs the workflow file at the tagged commit, so a throwaway tag on this branch runs the new `release.yml`. The tag does not match `package.json`, so every build job stops at `🔎 Verify tag version`, before any signing step.

- [ ] **Step 1: Push the throwaway tag from the branch head and watch `create-draft`**

Run the first two commands of RS-5 step 5 before this step. Otherwise the `macos` job creates the `release` environment itself, with no tag limit, and RS-5 step 5 then updates it.

```bash
git tag v0.0.0-rs2check && git push origin v0.0.0-rs2check
gh run watch "$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: `📝 Create draft release` passes. Its last line proves that `gh release view` finds a draft by tag with the runner's `gh` and `GITHUB_TOKEN`. Then cancel the run with `gh run cancel <id>` to save macOS minutes. `publish` and Docker Release never start.

- [ ] **Step 2: Check upload, the asset listing and what the updater sees**

```bash
gh release view v0.0.0-rs2check --json isDraft,tagName
printf probe > "$TMPDIR/rs2-probe.txt" && gh release upload v0.0.0-rs2check "$TMPDIR/rs2-probe.txt" --clobber
gh release view v0.0.0-rs2check --json assets --jq '.assets[].name'
curl -s https://api.github.com/repos/jrmatherly/llm-router/releases/latest | grep '"tag_name"'
```

Expected: `"isDraft":true`, then `rs2-probe.txt`, then the tag of the last real release. The last line settles the assumption that an unauthenticated client, such as electron-updater, never sees a draft.

- [ ] **Step 3: Clean up**

Run: `gh release delete v0.0.0-rs2check --yes --cleanup-tag`
Expected: `gh release list` and `git ls-remote --tags origin 'v0.0.0*'` show nothing for the tag.

- [ ] **Step 4: Act on the outcome**

- **Every expectation holds.** Merge RS-2.
- **`create-draft` fails on the `isDraft` line, or step 2 cannot find the release.** Do not merge. Paste the output in the PR. The replacement design addresses the release by id. `create-draft` exports the id from `gh api "repos/$GH_REPO/releases" --jq` as a job output, and the upload and publish steps call `gh api` with that id.
- **The `latest` call shows `v0.0.0-rs2check`.** Do not merge. Drafts are visible to updaters, and F-A4 needs a different design. Tell the owner.

`gh release edit --draft=false` is the one command this check does not run, because it would publish. If it fails in the first real release, the draft holds every asset. The owner then runs `gh release edit vX.Y.Z --draft=false --latest` and `gh workflow run docker-release.yml -f ref=vX.Y.Z -f latest=true`.

### Task 2.4: Verify before opening the PR

- [ ] **Step 1: Run the local checks**

```bash
node -e 'const y=require("js-yaml"),fs=require("node:fs");y.load(fs.readFileSync(".github/workflows/release.yml","utf8"));console.log("ok")'
npm run typecheck
node build/test.mjs architecture && node --test .test-dist/architecture/test/merge-macos-update-metadata.test.js .test-dist/architecture/test/workflow-permissions.test.js
npm run test:architecture
```

Expected: `ok`, no type errors, 0 failures.

- [ ] **Step 2: Open the PR**

The description states the Task 2.3 results and that RS-5 step 5 must run before the next release.

---

## RS-3: Release preflight requires a green Tests run

**Fixes:** F-A5.
**Depends on:** RS-1.
**Branch:** `fix/release-preflight-tests-run`
**Size:** S
**Owner steps:** None.
**Status:** Merged 2026-11-16 as [PR 65](https://github.com/jrmatherly/llm-router/pull/65), squash commit `fcb4f83a`. A review changed three things from the steps below:

- The `gh` call passes `--repo` with the origin URL, against Step 3's "Do not pass `-R`". In a clone with an `upstream` remote and no `gh` default, `gh` did not stop. It queried upstream and failed with an unrelated 404 (measured in a scratch clone).
- A `gh` failure is caught and reported beside the other preflight failures.
- A sixth test runs the real script in a temp repo with a stub `gh`, so the file has 6 tests, not 5.

### Task 3.1: Add `testsRunFailure` and call it from `preflight`

**Files:**
- Modify: `scripts/release.mjs:58-76` (function `preflight`)
- Modify: `AGENTS.md:14` (the `npm run release` bullet)
- Test: `tests/architecture/release-script.test.mjs`

**Interfaces:**
- Produces: `export function testsRunFailure(runs)`. `runs` is the parsed output of `gh run list --json status,conclusion,url`, an array of `{ status: string, conclusion: string, url: string }`. It returns `undefined` when `runs[0]` is completed and successful, and otherwise one of the three strings in the test.

- [ ] **Step 1: Write the failing tests**

Add `testsRunFailure` to the import on line 3.

```js
test("testsRunFailure accepts a completed, successful Tests run", () => {
  assert.equal(testsRunFailure([{ conclusion: "success", status: "completed", url: "u" }]), undefined);
});

test("testsRunFailure names a missing, pending or failed Tests run", () => {
  assert.equal(testsRunFailure([]), "no Tests run for HEAD");
  assert.equal(testsRunFailure([{ conclusion: "", status: "in_progress", url: "u" }]), "Tests run for HEAD is in_progress: u");
  assert.equal(testsRunFailure([{ conclusion: "failure", status: "completed", url: "u" }]), "Tests run for HEAD concluded failure: u");
  assert.equal(testsRunFailure([{ conclusion: "cancelled", status: "completed", url: "u" }]), "Tests run for HEAD concluded cancelled: u");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/release-script.test.js`
Expected: FAIL. `build/test.mjs` bundles the test with esbuild, and the bundle step reports that `scripts/release.mjs` has no export named `testsRunFailure`.

- [ ] **Step 3: Implement `testsRunFailure(runs)` and wire it into `preflight`**

In `preflight`, read `HEAD` once into `const head = run("git", ["rev-parse", "HEAD"]);` and reuse it in the `origin/main` comparison. After that comparison, push the result of this call into `failures` when it is defined:

```js
testsRunFailure(JSON.parse(run("gh", ["run", "list", "--workflow", "test.yml", "--commit", head, "--limit", "1", "--json", "status,conclusion,url"])))
```

Pass the full 40-character SHA. Measured on 2026-11-16, `--commit 136ad730` returns `[]` and the full SHA returns the run. Do not add a flag that skips the check, and leave `--skip-checks` as it is. Do not pass `-R`. If `gh` cannot pick a repository, the preflight stops with the error from `gh`, which is the intended result.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/release-script.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Update the release bullet in `AGENTS.md`**

After "cuts a release from a clean, up-to-date `main`", add: "whose latest Tests run for `HEAD` is green (it needs `gh`, and after a push to `main` you wait for that run)".

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck
npm run test:architecture
git add scripts/release.mjs tests/architecture/release-script.test.mjs AGENTS.md
git commit -m "fix(release): require a green Tests run on HEAD before releasing"
```

Expected: no type errors and 0 failures before the commit.

- [ ] **Step 7: Run the real preflight once**

Run on the branch, after the commit in Step 6 and before pushing it: `node scripts/release.mjs patch --dry-run`
Expected: exit code 1 and one line that contains `not on main`, `main is not at origin/main` and `no Tests run for HEAD`. The last phrase proves that the `gh` call ran and parsed. It needs the commit, because before it `HEAD` is the tip of `main`, which already has a Tests run. A dry run reports the same failures as a real release because `preflight` runs before the dry-run branch (`release.mjs:86-90`). Then push the branch and open the PR.

---

## RS-4: Workflow and manifest housekeeping

**Fixes:** F-A9, the configuration part of F-A10, F-A8 for the docs jobs, F-A12, F-A13, and `README.md:216` from F-B9.
**Depends on:** None.
**Branch:** `chore/workflow-manifest-housekeeping`
**Size:** S
**Owner steps:** None in the PR. RS-5 step 1 turns Dependabot version updates on after RS-4 and EU-2 have merged.
**Status:** Merged 2026-11-16 as [PR 66](https://github.com/jrmatherly/llm-router/pull/66), squash commit `f7eee402`. The docs build ran on the PR and passed, with deploy skipped, which is the proof for F-A9. The base image digest moved to `sha256:dc26ae92…`. A review changed two things from the steps below:

- The docs concurrency group is `docs-${{ github.ref == 'refs/heads/main' && 'deploy' || github.ref }}` with `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`. Keyed on the event, a manual run from another branch shared the deploy group.
- The docs test uses `jobBlocks`, checks the deploy condition and the timeout per job, and pins the concurrency lines.

Open: the `compose` Dependabot entry has no rule against major bumps. Whether Dependabot proposes a new Postgres major for `postgres:16-alpine` is unverified. RS-5 step 1 shows it on the first run.

### Task 4.1: Build docs on pull requests and widen Dependabot

**Files:**
- Modify: `.github/workflows/docs.yml:3-17` (`on` and `concurrency`), jobs `build` and `deploy`
- Modify: `.github/dependabot.yml` (append two entries)
- Test: `tests/architecture/workflow-permissions.test.mjs`

This task does not use `jobBlocks`, so it does not depend on RS-1.

- [ ] **Step 1: Write the failing tests**

```js
test("docs build on pull requests, deploy only from main, and every job has a timeout", () => {
  const docs = readFileSync(".github/workflows/docs.yml", "utf8");
  assert.match(docs, /^  pull_request:\n    paths:\n      - "docs\/\*\*"\n      - "\.github\/workflows\/docs\.yml"$/m);
  assert.match(docs, /^    if: github\.ref == 'refs\/heads\/main'$/m);
  const jobs = docs.slice(docs.indexOf("\njobs:\n"));
  assert.equal(jobs.match(/^    timeout-minutes: \d+$/gm)?.length, jobs.match(/^  [a-z0-9_-]+:$/gm).length);
});

test("Dependabot covers both lockfiles, the workflows and the compose images", () => {
  const config = readFileSync(".github/dependabot.yml", "utf8");
  for (const [ecosystem, directory] of [["github-actions", "/"], ["npm", "/"], ["npm", "/docs"], ["docker-compose", "/docker/claude-apps-gateway"]]) {
    assert.match(config, new RegExp(`- package-ecosystem: ${ecosystem}\\n    directory: "${directory}"\\n`), `${ecosystem} ${directory}`);
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/workflow-permissions.test.js`
Expected: FAIL in both, first on the `pull_request` pattern and on `npm /docs`.

- [ ] **Step 3: Edit `docs.yml`**

Add the trigger after the `push` block:

```yaml
  pull_request:
    paths:
      - "docs/**"
      - ".github/workflows/docs.yml"
```

Replace the concurrency block so that pull request builds cancel each other and deploys never do:

```yaml
concurrency:
  group: docs-${{ github.event_name == 'pull_request' && github.ref || 'deploy' }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Add `timeout-minutes: 15` to `build` and `timeout-minutes: 10` to `deploy`. Keep the `if` on `deploy` (line 51). It already skips pull requests. Do not make the docs build a required check, because a path-filtered check stays pending on a PR that does not touch docs.

- [ ] **Step 4: Append two entries to `dependabot.yml`**

Follow the two existing entries exactly: weekly schedule, one group that matches `"*"`, and `commit-message.prefix: "chore"`.

| `package-ecosystem` | `directory` | Group name | Covers |
|---|---|---|---|
| `npm` | `"/docs"` | `docs` | `docs/package-lock.json`, which is not a workspace |
| `docker-compose` | `"/docker/claude-apps-gateway"` | `compose` | `postgres:16-alpine` and `ghcr.io/dexidp/dex:v2.44.0` in `compose.yaml` |

Do not add a `docker` entry for `/`. Dependabot's Docker parser reads only literal `FROM image` lines (`docker/lib/dependabot/docker/file_parser.rb` in `dependabot-core`). The `Dockerfile` uses `FROM ${NODE_IMAGE}` and `FROM ${RUNTIME_NODE_IMAGE}` with the digest on the `ARG` lines, so that entry would find nothing. Task 4.4 bumps the digest by hand instead. The `docker-compose` fetcher matches files named `compose.yaml` (source read of `dependabot-core`, not run). RS-5 step 1 confirms it from the first Dependabot run. The root `docker-compose.yml` builds a local image and pins nothing, so it needs no entry.

- [ ] **Step 5: Run the tests to see them pass**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/workflow-permissions.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/docs.yml .github/dependabot.yml tests/architecture/workflow-permissions.test.mjs
git commit -m "ci: build docs on pull requests and widen Dependabot coverage"
```

### Task 4.2: Delete the dead publish fields

**Files:**
- Modify: `package.json:29-31` (`publishConfig`), `:46` (`prepack`), `:47` (`prepublishOnly`)

The root package is `private: true`, and no file outside `package.json` names these three fields (checked with `rg` at `136ad730`). A test for the absence of deleted fields adds nothing, so this task has a verification step instead.

- [ ] **Step 1: Delete the three fields**

- [ ] **Step 2: Verify**

```bash
node -p 'const p=require("./package.json");[p.publishConfig,p.scripts.prepack,p.scripts.prepublishOnly,p.private]'
npm install --package-lock-only --ignore-scripts && git diff --exit-code package-lock.json
```

Expected: `[ undefined, undefined, undefined, true ]`, and no lockfile diff.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: drop publish settings from the private root package"
```

### Task 4.3: Document the unsigned Windows build and fix the runner name

**Files:**
- Modify: `docs/src/content/docs/en/guides/install.md:18-26` (section "Install the desktop app")
- Modify: `README.md:216`

- [ ] **Step 1: Add the note to `install.md`**

Insert this paragraph after the numbered list and before the paragraph that starts "When Server shows Running":

```markdown
The Windows installer is not code-signed. Windows SmartScreen shows a warning the first time you run it. Select **More info**, then **Run anyway**.
```

This records decision D-3. Do not promise signing.

- [ ] **Step 2: Fix `README.md:216`**

Replace `` `windows-latest` `` with `` `windows-2025` ``, the runner that `release.yml` uses for the `windows` job.

- [ ] **Step 3: Commit**

```bash
git add docs/src/content/docs/en/guides/install.md README.md
git commit -m "docs: note the unsigned Windows installer and the Windows runner"
```

### Task 4.4: Bump the base image digest by hand

**Files:**
- Modify: `Dockerfile:1-2` (`ARG NODE_IMAGE=` and `ARG RUNTIME_NODE_IMAGE=`)

Dependabot cannot update these lines (Task 4.1 Step 4). This task brings them to the current digest of `node:24-bookworm-slim` once. `tests/architecture/dockerfile.test.mjs` ("every base image is pinned by digest") already asserts that each `ARG \w*NODE_IMAGE=` value ends in `@sha256:` and 64 hex characters. It does not require the two digests to be equal, but both lines name the same image, so keep them equal.

- [ ] **Step 1: Read the current digest**

This needs Docker and network access.

```bash
docker buildx imagetools inspect node:24-bookworm-slim --format '{{json .Manifest.Digest}}'
```

Expected: one quoted `sha256:<64 hex>` value. If it equals the digest already in `Dockerfile:1-2`, skip to Task 4.5 and say so in the PR.

- [ ] **Step 2: Update both `ARG` lines**

Replace the digest after `node:24-bookworm-slim@` on line 1 (`NODE_IMAGE`) and line 2 (`RUNTIME_NODE_IMAGE`) with the value from Step 1, without the quotes. Change nothing else in the file.

- [ ] **Step 3: Run the check**

```bash
node build/test.mjs architecture && node --test .test-dist/architecture/test/dockerfile.test.js
```

Expected: PASS, 0 failures. Then, if Docker is available, run `npm run test:system`. Expected: exit 0. Without Docker, say so in the PR. CI's `🐳 Docker smoke` job runs the same test on the PR.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "chore(docker): bump the node base image digest"
```

### Task 4.5: Verify before opening the PR

- [ ] **Step 1: Run the local checks**

```bash
node -e 'const y=require("js-yaml"),fs=require("node:fs");for(const f of [".github/workflows/docs.yml",".github/dependabot.yml"])y.load(fs.readFileSync(f,"utf8"));console.log("ok")'
npm run typecheck
npm run test:architecture
```

Expected: `ok`, no type errors, 0 failures.

- [ ] **Step 2: Open the PR and read its checks**

Run: `gh pr checks --watch`
Expected: `📚 Build` runs on the PR, because the PR touches `docs/**` and the workflow file, and passes. `🚀 Deploy` is skipped. This run is the proof for F-A9.

---

## RS-5: Owner-only repository settings

**Fixes:** the settings toggle of F-A10, and F-A11.
**Depends on:** stated per step.
**Branch:** none. This section is not a PR.
**Size:** S
**Owner steps:** every step.

The values in the "Now" column were read with `gh api` on 2026-11-16. Run each change, then its read-back. Stop if a read-back does not show the expected value.

| # | Setting | Now | After | Run after |
|---|---|---|---|---|
| 1 | Dependabot version updates | off (fork default), 0 Dependabot PRs | on | RS-4 and EU-2 |
| 2 | Required checks on `main` | `🧪 Unit and architecture`, `🎭 End to end` | adds `🐳 Docker smoke`, `📦 Build gateway` | RS-1, and one Tests run on `main` |
| 3 | SHA pinning for actions | `sha_pinning_required: false` | `true` | any time |
| 4 | Merge methods | merge, rebase and squash allowed | squash only | any time |
| 5 | Apple signing secrets | 5 secrets at repository level | in environment `release`, limited to `v*` tags | create before the first release after RS-2, delete the old copies after it |
| 6 | Tag ruleset | none | `v*` tags cannot be deleted or moved | after Task 2.3 cleaned up |

- [ ] **Step 1: Turn on Dependabot version updates**

Run this step only after RS-4 and EU-2 in the [Electron upgrade plan](2026-11-16-audit-electron-upgrade.md) have merged. `.github/dependabot.yml` groups `"*"` with no `ignore`, so an earlier first run would put Electron, better-sqlite3 and the majors the spec defers into one grouped npm PR.

In the browser, open **Settings**, then **Advanced Security**, then **Dependabot**, and select **Enable** beside **Dependabot version updates**. GitHub documents no API for this toggle on a fork.

Optional, for security updates: `gh api -X PUT repos/jrmatherly/llm-router/automated-security-fixes`. Read-back: `gh api repos/jrmatherly/llm-router/automated-security-fixes --jq .enabled` prints `true`.

Read-back for version updates, within a week: `gh pr list -R jrmatherly/llm-router --author "app/dependabot" --state all --limit 10`. Then open **Insights**, **Dependency graph**, **Dependabot** and read the last-checked log for each of the four entries. A log line for `docker/claude-apps-gateway/compose.yaml` confirms the filename match. If the compose updater finds nothing, record it as a new finding. No Docker PR for `Dockerfile:1-2` is expected, because RS-4 has no `docker` entry for `/` (Task 4.1 Step 4). Do not restructure the `Dockerfile` to suit the updater without a decision.

- [x] **Step 2: Require the Docker smoke and gateway jobs**

**Status:** Done 2026-11-16. Run by Claude at the owner's go-ahead. The read-back printed the four check names, the unchanged Admin bypass, and `active`.

Keep the Admin bypass (`bypass_actors` with `actor_id: 5`, `bypass_mode: always`). `npm run release` pushes `main` and the tag directly (`scripts/release.mjs:103`), and docs-only commits also push to `main`. A bypass mode of `pull_request` would block both.

```bash
gh api repos/jrmatherly/llm-router/rulesets/25837404 --jq '{name, target, enforcement, conditions, bypass_actors, rules: (.rules | map(if .type == "required_status_checks" then .parameters.required_status_checks += [{"context":"🐳 Docker smoke"},{"context":"📦 Build gateway"}] else . end))}' > "$TMPDIR/ruleset-put.json"
gh api -X PUT repos/jrmatherly/llm-router/rulesets/25837404 --input "$TMPDIR/ruleset-put.json"
```

Read-back: `gh api repos/jrmatherly/llm-router/rulesets/25837404 --jq '[.rules[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context], .bypass_actors'` prints the four names and the unchanged Admin entry.

- [ ] **Step 3: Enforce SHA pinning**

```bash
gh api -X PUT repos/jrmatherly/llm-router/actions/permissions -F enabled=true -f allowed_actions=all -F sha_pinning_required=true
```

Read-back: `gh api repos/jrmatherly/llm-router/actions/permissions --jq .sha_pinning_required` prints `true`. Every `uses:` in the repository is pinned, and so are the actions nested in `withastro/action@a8b97df`. The actions nested in `upload-pages-artifact` were not checked. Run `gh workflow run docs.yml` and `gh workflow run test.yml`, then `gh run list --limit 2`. If either run is rejected for an unpinned action, set the flag back with `-F sha_pinning_required=false` and report the action name.

- [ ] **Step 4: Allow squash merges only**

```bash
gh api -X PATCH repos/jrmatherly/llm-router -F allow_merge_commit=false -F allow_rebase_merge=false
```

Read-back: `gh api repos/jrmatherly/llm-router --jq '{allow_merge_commit, allow_rebase_merge, allow_squash_merge}'` prints `false`, `false`, `true`.

- [ ] **Step 5: Move the Apple secrets into a `release` environment**

Create the environment before the first release after RS-2. If the `macos` job names an environment that does not exist, GitHub creates it with no tag limit (GitHub docs behaviour, not observed here).

```bash
gh api -X PUT repos/jrmatherly/llm-router/environments/release -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/jrmatherly/llm-router/environments/release/deployment-branch-policies -f name='v*' -f type=tag
for name in APPLE_API_ISSUER_ID APPLE_API_KEY_ID APPLE_API_KEY_P8 MACOS_CERT_P12 MACOS_CERT_PASSWORD; do gh secret set "$name" --env release -R jrmatherly/llm-router; done
```

`gh secret set` asks for each value. GitHub cannot show the existing values, so take them from the original key files.

Read-back: `gh api repos/jrmatherly/llm-router/environments/release/deployment-branch-policies --jq '.branch_policies[] | {name, type}'` prints `v*` and `tag`. `gh secret list --env release -R jrmatherly/llm-router` lists the five names.

After one release succeeds with RS-2 merged, delete the repository-level copies with `gh secret delete <NAME> -R jrmatherly/llm-router` for each name. Read-back: `gh secret list -R jrmatherly/llm-router` lists none of the five. Until then both copies exist, and the environment copy wins in the `macos` job.

- [ ] **Step 6: Protect release tags**

```bash
gh api -X POST repos/jrmatherly/llm-router/rulesets --input - <<'JSON'
{
  "name": "tags: release tags are permanent",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }],
  "rules": [{ "type": "deletion" }, { "type": "non_fast_forward" }]
}
JSON
```

Do not add a `creation` rule. The release script pushes tags. The Admin bypass stays so that the owner can still abandon a release with `gh release delete vX.Y.Z --yes --cleanup-tag`.

Read-back: `gh api repos/jrmatherly/llm-router/rulesets --jq '.[] | {id, name, target}'` lists the branch ruleset and the new tag ruleset.

---

## Self-review

- **Spec coverage.** F-A1 and F-A7 are Task 1.2. F-A2 is Task 1.3. F-A3 is Tasks 1.1 and 1.2. F-A4 is Tasks 2.2 and 2.3. F-A5 is Task 3.1. F-A6 is Task 2.1. F-A8 is Task 2.2 for `release.yml` and Task 4.1 for `docs.yml`. F-A9 is Task 4.1. F-A10 is Tasks 4.1 and 4.4 and RS-5 step 1. F-A11 is RS-5 steps 2 to 6. F-A12 is Task 4.2. F-A13 and `README.md:216` are Task 4.3.
- **Not verified by this plan's author.** Nobody ran a workflow, a build or a test suite. The plan says so wherever a claim depends on GitHub's behaviour, and each such claim has a step that settles it: Task 1.1 (wire tests), Task 1.4 step 2 (first Tests run), Task 2.3 (the draft flow on the runner), RS-5 step 1 (Dependabot coverage), RS-5 step 3 (nested action pins).
- **Not covered here.** Windows code signing is deferred by D-3. Re-hashing the downloaded macOS ZIPs against the merged `sha512` values, image signing and release checksums are in the spec's deferred list or were not made findings.
