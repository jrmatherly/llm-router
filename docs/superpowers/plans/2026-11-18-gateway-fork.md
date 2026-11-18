# Gateway Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every LLMR install runs one gateway build, published from a fork the project owns, with the cut-stream and safeguards fixes in it.

**Architecture:** A public fork of `The-NeXT-AI/ai-gateway` publishes a tarball as a GitHub release asset on each `v*` tag. LLMR depends on that asset by URL, and `package-lock.json` pins its `sha512`. LLMR's CI, Docker image and release stop building a gateway of their own.

**Tech Stack:** GitHub Actions, `gh`, npm 11 tarball URL dependencies, `node:test`, vitest (in the fork).

**Spec:** [`docs/superpowers/specs/2026-11-18-gateway-fork.md`](../specs/2026-11-18-gateway-fork.md). Read its Goal, Decisions (G-1 to G-12) and Global constraints before any task.

## Global Constraints

- The fork is `jrmatherly/llmr-gateway`, public (G-3, owner, 2026-11-18).
- Fork versions are `1.0.22-llmr.N`, tags `v1.0.22-llmr.N`. The package name stays `@the-next-ai/ai-gateway`, so `npm pack` writes `the-next-ai-ai-gateway-1.0.22-llmr.N.tgz`.
- The asset URL is `https://github.com/jrmatherly/llmr-gateway/releases/download/v<version>/the-next-ai-ai-gateway-<version>.tgz`.
- Creating the fork and pushing to it are outward-facing. Each needs the owner's word (spec, "Steps only the owner can do").
- No force push anywhere. The fork's `main` stays a mirror of upstream `main`. The fork's own work lives on a new default branch `llmr`.
- Fork workflows: actions pinned to a commit SHA, `persist-credentials: false` on every checkout, top-level `permissions: contents: read`, `contents: write` on the release job only.
- LLMR: Node `>=24`, npm only, never hand-edit `package-lock.json`, code through a branch and a squash-merged PR, a rule and its check change in the same PR.
- Never `import()` the gateway package or run it in-process. Tests spawn its bin as a child they own.
- Run one LLMR test file with `node build/test.mjs <pkg> && node --test .test-dist/<pkg>/test/<kind>/<path>.test.js`, and an architecture test with `node build/test.mjs architecture && node --test .test-dist/architecture/test/<name>.test.js`.
- Fork work happens in a clone outside the LLMR checkout. It is third-party code: run its scripts only inside that clone.

## Review Focus

1. **A virtual model that has internal tools receives a request with `safeguards`.** The safeguards patch rejects it before any upstream call. A person using Claude Code through such a model would expect the request to work as it does today. Task 3 Step 5 measures it and stops for the owner.
2. **The two manifests name different gateway URLs, or `node_modules` holds a different version than the manifests.** A person expects one gateway everywhere. Task 2's architecture test pins both.
3. **A release asset is replaced after LLMR locked it.** `npm ci` must fail with an integrity error, not install the new bytes. Task 2's test asserts that the lock entry carries a `sha512` integrity for the URL.
4. **A tag is pushed that does not match `package.json`.** The release must fail before it publishes. Task 1 Step 5 runs the check with a wrong tag name.
5. **A workflow regains a step that installs a gateway tarball over the locked one.** Task 2's test scans every YAML file under `.github/` for the old names. The Dockerfile keeps its opt-in local-checkout step on purpose.

---

### Task 1: Create the fork and publish `1.0.22-llmr.1`

Repository: the fork. No LLMR file changes.

**Files (in the fork):**
- Modify: `package.json`, `package-lock.json` (version only)
- Modify: `.github/workflows/ci.yml`
- Replace: `.github/workflows/release.yml`

**Interfaces:**
- Produces: the release `v1.0.22-llmr.1` with assets `the-next-ai-ai-gateway-1.0.22-llmr.1.tgz` and `SHA256SUMS`, and the default branch `llmr`.

- [ ] **Step 1: Owner gate.** Passed on 2026-11-18: the owner approved the name `jrmatherly/llmr-gateway`, a public fork, and enabling Actions on it. The pushes in Step 7 still get one ask.

- [ ] **Step 2: Create the fork and the `llmr` branch**

```bash
gh repo fork The-NeXT-AI/ai-gateway --fork-name llmr-gateway --clone=false
git clone https://github.com/jrmatherly/llmr-gateway.git && cd llmr-gateway
git remote add upstream https://github.com/The-NeXT-AI/ai-gateway.git
git fetch upstream
git checkout -b llmr 0a2c0abd48d2144ed0ac2ce4d954a661c51ffcb1
```

Expected: `git log -1 --format=%s` prints `Fix Anthropic tool IDs, virtual model streaming and raw traces`.

- [ ] **Step 3: Measure the test suite at the base**

Run: `npm ci && npm run typecheck && npm run typecheck:all && npx vitest run`
Expected: all pass. If `npx vitest run` fails, record the failing test names in the body of the Step 6 commit message and use this narrower command in the workflow instead, which is what LLMR's action runs today: `npx vitest run src/gateway/routes.test.ts src/adapters/builtins/anthropic-tool-id.test.ts src/raw-trace.test.ts`.

- [ ] **Step 4: Set the version**

Run: `npm version 1.0.22-llmr.1 --no-git-tag-version`
Expected: `package.json` and `package-lock.json` both show `1.0.22-llmr.1`.

- [ ] **Step 5: Write the workflows**

Replace `.github/workflows/release.yml` with:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: read

jobs:
  release:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    permissions:
      contents: write
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
          cache: npm

      - name: Check the tag matches the package version
        run: test "v$(node -p "require('./package.json').version")" = "$GITHUB_REF_NAME"

      - name: Install
        run: npm ci

      - name: Typecheck
        run: npm run typecheck && npm run typecheck:all

      - name: Test
        run: npx vitest run

      - name: Build and pack
        run: |
          npm run build
          npm pack --ignore-scripts
          sha256sum the-next-ai-ai-gateway-*.tgz > SHA256SUMS

      - name: Publish the release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" the-next-ai-ai-gateway-*.tgz SHA256SUMS --verify-tag --title "$GITHUB_REF_NAME" --notes "Gateway build for LLM Router. Source: this tag."
```

The two action SHAs are the ones LLMR's own workflows pin. Add two sentences at the top of the fork's `README.md`: that this is LLM Router's build of `The-NeXT-AI/ai-gateway`, on the `llmr` branch, and that releases are tarballs attached to `v*` tags. In `ci.yml`, change the push branches to `llmr`, pin both actions to the same SHAs, add `persist-credentials: false`, set `node-version: 24`, and replace `npm test` with the Step 3 test command.

Check the tag guard locally: `GITHUB_REF_NAME=v9.9.9 sh -c 'test "v$(node -p "require(\"./package.json\").version")" = "$GITHUB_REF_NAME"'; echo $?`
Expected: `1`. With `GITHUB_REF_NAME=v1.0.22-llmr.1` it prints `0`.

- [ ] **Step 6: Commit, then owner gate for the push**

```bash
git add package.json package-lock.json .github/workflows README.md
git commit -m "chore: release 1.0.22-llmr.1 from a tag workflow"
git diff --stat 0a2c0abd48d2144ed0ac2ce4d954a661c51ffcb1 HEAD
grep -c -E "requestTransforms|routeResolvers|httpRoutes" dist/index.js
```

Expected: only `package.json`, `package-lock.json`, `README.md` and the two workflow files, and a non-zero count after `npm run build`. LLMR detects router-plugin support by those three markers in the gateway's `dist/index.js` (`routerPluginSupportMarkers` in `packages/core/src/gateway/core-runtime/supervisor.ts`), not by version. Ask the owner once for the push, the default-branch change and the tag, and to enable Actions on the fork.

- [ ] **Step 7: Push, set the default branch, tag**

```bash
git push -u origin llmr
gh repo edit jrmatherly/llmr-gateway --default-branch llmr
git tag v1.0.22-llmr.1 && git push origin v1.0.22-llmr.1
gh run list --repo jrmatherly/llmr-gateway --workflow Release --limit 1
```

Expected: one Release run for the tag. Wait for it with `gh run watch <id> --repo jrmatherly/llmr-gateway`, and if that exits non-zero mid-run, read the result with `gh run view <id> --repo jrmatherly/llmr-gateway`. If no run appears, Actions is still disabled on the fork (owner step).

- [ ] **Step 8: Verify the asset**

```bash
gh release download v1.0.22-llmr.1 --repo jrmatherly/llmr-gateway --dir /tmp/llmr-gateway-check
cd /tmp/llmr-gateway-check && shasum -a 256 -c SHA256SUMS
tar -xzOf the-next-ai-ai-gateway-1.0.22-llmr.1.tgz package/package.json | grep '"version"'
curl -sIL -o /dev/null -w '%{http_code}\n' https://github.com/jrmatherly/llmr-gateway/releases/download/v1.0.22-llmr.1/the-next-ai-ai-gateway-1.0.22-llmr.1.tgz
```

Expected: `OK`, `"version": "1.0.22-llmr.1"`, and `200` with no credentials.

---

### Task 2: LLMR installs the fork's tarball and drops its own gateway build

Repository: LLMR, branch `chore/gateway-fork-dependency`. One PR. Gateway source is unchanged from what CI runs today, so the 13 `gatewayDefect` markers stay.

**Files:**
- Modify: `packages/core/package.json`, `packages/cli/package.json` (the `@the-next-ai/ai-gateway` dependency)
- Modify: `package-lock.json` (by npm)
- Delete: `.github/actions/prepare-release-gateway/`
- Modify: `.github/workflows/test.yml`, `.github/workflows/release.yml`, `.github/workflows/docker-release.yml`, `.github/dependabot.yml`
- Keep unchanged: `Dockerfile`, `build/docker-local-gateway.mjs`, `docker/local-ai-gateway/`, the `docker:prepare-gateway` and `docker:clean-gateway` scripts, `.gitignore`, `README.md`, `docker/README.md`, the docs Docker guide. They are the opt-in way to build an image from a local gateway checkout (`LLMR_DOCKER_GATEWAY_SOURCE_DIR`), used by `build/docker-image.mjs`, `build/docker-compose.mjs` and `tests/system/docker-smoke.mjs`, and pinned by `tests/architecture/dockerignore.test.mjs` and `package-boundaries.test.mjs`. With no tarball in `docker/local-ai-gateway/`, the Dockerfile's conditional step does nothing and the image uses the lockfile.
- Create: `tests/architecture/gateway-dependency.test.mjs`
- Modify: `tests/architecture/workflow-permissions.test.mjs`
- Modify: `AGENTS.md` (the `test:system` line describes the release gateway tarball)

**Interfaces:**
- Consumes: the Task 1 asset URL.
- Produces: `gatewayUrlPattern` in the new test, which Task 4 keeps passing by editing only the version.

- [ ] **Step 1: Write the failing architecture test**

`tests/architecture/gateway-dependency.test.mjs`:

```js
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const name = "@the-next-ai/ai-gateway";
const gatewayUrlPattern = /^https:\/\/github\.com\/jrmatherly\/llmr-gateway\/releases\/download\/v(\d+\.\d+\.\d+-llmr\.\d+)\/the-next-ai-ai-gateway-\1\.tgz$/;
const json = (file) => JSON.parse(readFileSync(file, "utf8"));

test("core and cli depend on one gateway release tarball, and the lockfile pins its bytes", () => {
  const core = json("packages/core/package.json").dependencies[name];
  assert.equal(json("packages/cli/package.json").dependencies[name], core);
  const [, version] = core.match(gatewayUrlPattern) ?? assert.fail(`${core} is not a gateway release asset URL`);
  const locked = json("package-lock.json").packages[`node_modules/${name}`];
  assert.equal(locked.resolved, core);
  assert.equal(locked.version, version);
  assert.match(locked.integrity, /^sha512-/);
  assert.equal(json(`node_modules/${name}/package.json`).version, version, "run npm ci: node_modules holds another gateway");
});

test("no workflow builds or installs a gateway tarball beside the lockfile", () => {
  const files = readdirSync(".github", { recursive: true }).map((file) => `.github/${file}`).filter((file) => /\.ya?ml$/.test(file));
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /prepare-release-gateway|local-ai-gateway|gateway-package|The-NeXT-AI\/ai-gateway/, file);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node build/test.mjs architecture && node --test .test-dist/architecture/test/gateway-dependency.test.js`
Expected: both tests fail, the first on `^1.0.21 is not a gateway release asset URL`.

- [ ] **Step 3: Point the dependency at the release**

Set the dependency in both manifests to `https://github.com/jrmatherly/llmr-gateway/releases/download/v1.0.22-llmr.1/the-next-ai-ai-gateway-1.0.22-llmr.1.tgz`, then run `npm install`.
Expected: `git diff --stat` shows the two manifests and `package-lock.json`; the lock entry's `resolved` is the URL. Keep the root `overrides` entry for `glob`: `npm run test:architecture` still runs the check that guards it.

- [ ] **Step 4: Remove LLMR's own gateway build**

- Delete `.github/actions/prepare-release-gateway/`.
- In `test.yml` and `release.yml`: delete the `gateway` job, every "Download gateway package" and "Install gateway" step, and `gateway` from each `needs:` (a job left with one need writes `needs: test`, not a list). Keep the `LLMR_TEST_GATEWAY_ENTRY` env lines; the path is unchanged.
- In `test.yml`'s `docker-smoke` job: delete the download and the `ls docker/local-ai-gateway/...` check.
- In `docker-release.yml`: delete "Prepare gateway package" and "Verify gateway package".
- Leave `Dockerfile` alone (see "Keep unchanged" above).
- In `.github/dependabot.yml`, under the root npm entry, add:

```yaml
    ignore:
      - dependency-name: "@the-next-ai/ai-gateway"
```

- [ ] **Step 5: Update `tests/architecture/workflow-permissions.test.mjs`**

- Drop `.concat(".github/actions/prepare-release-gateway/action.yml")` from the file list and delete the `gatewayInstall` constant.
- "release builds wait for the test job": `test` has no `needs`; `macos` is `needs: model-catalog`; `windows` and `linux` are `needs: [create-draft, model-catalog]`.
- Replace "tests and releases install the gateway tarball the release builds" with a test named "tests and releases run the locked gateway" that keeps the `gatewayEntry` and `package-lock=false` assertions and asserts each of those jobs contains `run: npm ci\n`.
- In "the Docker image is smoke-tested with the release gateway before any push": delete the `needs: gateway`, `path: docker/local-ai-gateway`, `prepared` and `ls docker/local-ai-gateway` assertions. Keep the rest, and rename the test to "the Docker image is smoke-tested before any push".
- In `AGENTS.md`, the `npm run test:system` line says CI builds the image "with the release gateway tarball first". Reword it: CI's `docker-smoke` job builds the image, then runs the same script with `LLMR_DOCKER_TEST_SKIP_BUILD=1`.

- [ ] **Step 6: Run the checks**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`
Expected: all pass, and `credential-and-model-routing` still reports 13 `# EXPECTED FAILURE` lines. `#1852` in `october-issues-wire` and `recent issues` in `recent-issues-wire` now pass locally (acceptance 4). If either still fails, record its output in the PR; it was attributed to the npm build without a run on the pinned bytes.

- [ ] **Step 7: Commit, push, open the PR**

```bash
git add -A
git commit -m "chore(gateway): install the gateway from the fork's release tarball"
```

The PR's `## Why` opens with the spec's Goal. CI must be green on every job, including `docker-smoke`, before the squash merge.

---

### Task 3: Land the two fixes in the fork and publish `1.0.22-llmr.2`

Repository: the fork, branch `llmr`.

**Files (in the fork):** whatever the two patches touch under `src/` and `docs/`, plus `package.json` and `package-lock.json`.

**Interfaces:**
- Consumes: `build/patches/ai-gateway-stream-terminal-error.patch` and `build/patches/ai-gateway-native-safeguards.patch` from LLMR's `upstream` remote (`git show upstream/main:build/patches/<name>` in the LLMR checkout).
- Produces: the release `v1.0.22-llmr.2`.

- [ ] **Step 1: Apply the stream patch as one commit**

```bash
git apply --check <path>/ai-gateway-stream-terminal-error.patch && git apply <path>/ai-gateway-stream-terminal-error.patch
npm run typecheck && npm run typecheck:all && npx vitest run
git add -A
git commit -m "fix(gateway): end a cut upstream stream with a protocol-native error" \
  -m "From claude-code-router build/patches/ai-gateway-stream-terminal-error.patch (MIT, musistudio), which includes The-NeXT-AI/ai-gateway PR 39."
```

Expected: the patch's own tests (`src/gateway/stream-terminal-error.test.ts`, `src/gateway/stream-terminal-events.test.ts`) pass.

- [ ] **Step 2: Apply the safeguards patch as one commit**

Same sequence with `ai-gateway-native-safeguards.patch`. Message: `fix(gateway): keep native Anthropic safeguards fields through a virtual model`, with the same attribution line naming that patch.

- [ ] **Step 3: Build a local tarball**

Run: `npm version 1.0.22-llmr.2 --no-git-tag-version && npm run build && npm pack --ignore-scripts`
Expected: `the-next-ai-ai-gateway-1.0.22-llmr.2.tgz` in the clone.

- [ ] **Step 4: Measure the 13 cases against it, before anything is published**

In an LLMR worktree on a scratch branch off `main` (after Task 2 merged), run `npm ci`, then `npm install --no-save <fork clone>/the-next-ai-ai-gateway-1.0.22-llmr.2.tgz`, then:

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/gateway/credential-and-model-routing.test.js`
Expected: the 13 marked subtests now FAIL with "expected failure" semantics, meaning the gateway fixed them. Then delete the `gatewayDefect` helper and its two uses in the scratch branch and re-run. Expected: every subtest passes with no `# EXPECTED FAILURE` line. If any of the 13 still fails for its original reason, stop and report which ones; do not publish.

- [ ] **Step 5: Measure the behaviour change for virtual models with tools**

In the same scratch worktree, add one subtest to the `#1932` test beside the others: the `guardedProfile` with `tools` set to one internal gateway tool, a request carrying `safeguards` and the beta header, through "gateway child in public mode". Record the HTTP status and body. Then send the same request without `safeguards` and record that it succeeds.
Before this step, read "The safeguards rejection" in the spec. If the owner has chosen option B there, first add a third commit that replaces the rejection in `src/gateway/handler.ts` with dropping `safeguards` from the request (the body and the preserved native fields) when the virtual model has internal tools, and rewrite the patch's `rejects server safeguards` test to assert HTTP 200 and an upstream body without `safeguards`. The subtest here then asserts the same through LLMR. If the owner has chosen C, skip Step 2 and this step, and keep the eight safeguards markers in Task 4.

If the owner has chosen option A, first add a third commit that makes the rejection answer in the form Claude Code specifies: HTTP 400 with the Anthropic error envelope, `error.type` set to `invalid_request_error`, and a message that names `safeguards`. Update the patch's test to assert that body. The subtest here asserts the same through LLMR, and that no upstream call was made.

If the owner has not chosen, measure the patch as written, report the status and body, and wait. This is a product call: a client that always sends `safeguards` would stop working through such a model. Keep the subtest for Task 4 with the outcome the owner accepts.

- [ ] **Step 6: Commit, owner gate, push, tag, verify**

```bash
git add package.json package-lock.json
git commit -m "chore: release 1.0.22-llmr.2"
git push origin llmr
git tag v1.0.22-llmr.2 && git push origin v1.0.22-llmr.2
```

Then repeat Task 1 Step 8 for `1.0.22-llmr.2`.

---

### Task 4: LLMR moves to `1.0.22-llmr.2` and deletes the expected-failure markers

Repository: LLMR, branch `fix/gateway-stream-and-safeguards`. One PR.

**Files:**
- Modify: `packages/core/package.json`, `packages/cli/package.json`, `package-lock.json`
- Modify: `packages/core/test/integration/gateway/credential-and-model-routing.test.mjs` (the comment and helper at lines 288 to 290, the two uses at lines 301 and 326, and the Task 3 Step 5 subtest)

**Interfaces:**
- Consumes: the Task 3 asset URL and the outcome the owner accepted in Task 3 Step 5.

- [ ] **Step 1: Delete the markers and add the subtest**

Remove the `gatewayDefect` helper with its comment. The two `t.test` calls that used it lose their options argument and take the name and the function only. Add the Task 3 Step 5 subtest with its accepted outcome asserted.

- [ ] **Step 2: Run it against `1.0.22-llmr.1` to see it fail**

Run: `node build/test.mjs core && node --test .test-dist/core/test/integration/gateway/credential-and-model-routing.test.js`
Expected: 13 failures, 5 matching `socket closed` and 8 matching `lost request safeguards`.

- [ ] **Step 3: Bump the dependency**

Change `v1.0.22-llmr.1` and `1.0.22-llmr.1` to `.2` in the URL in both manifests, then `npm install`.

- [ ] **Step 4: Run the checks**

Run: `npm run typecheck && npm run lint && npm run test:architecture && npm run test:core`
Expected: all pass, and the routing file's output has no `# EXPECTED FAILURE` line.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add -A
git commit -m "fix(gateway): end cut streams with an error frame and keep safeguards through virtual models"
```

The PR body lists the acceptance items from the spec with the evidence for each. Squash-merge on green.

- [ ] **Step 6: Verify acceptance on `main`**

Run on a clean checkout of the merge commit: `npm ci && node -p "require('@the-next-ai/ai-gateway/package.json').version"`
Expected: `1.0.22-llmr.2`. Confirm the Tests run for the merge commit is green with `gh run list --branch main --limit 4`.

---

### Task 5: Record it

Docs only, straight to `main`.

- [ ] **Step 1:** Add a `**Status**` line under each task above with the PR, the squash commit and anything the work changed.
- [ ] **Step 2:** In `docs/superpowers/upstream-review/reviews/2026-11-16-review.md`, mark follow-up 3 and row 29 as landed, with the two PR links and the fork's URL.
- [ ] **Step 3:** Move this plan and the spec to their `completed/` folders and repoint the links between them and from the review log.
- [ ] **Step 4:** Release note for the next LLMR release: "A provider stream that breaks mid-response now ends with an error the client can read, and Anthropic safeguards fields pass through virtual models." Add the Task 3 Step 5 outcome if it changed what a user sees.
