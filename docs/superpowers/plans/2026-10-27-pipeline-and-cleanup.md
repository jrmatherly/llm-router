# Pipeline and Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Docker image runs unprivileged and reports real health. CI tests what it ships, deploys the docs and holds least-privilege tokens. The small UI defects and dead weight the audit found are gone.

**Architecture:** Pipeline rules that can drift are encoded as architecture tests that read the workflow and build files, the same way `tests/architecture/release-script.test.mjs` already guards the release script. UI fixes copy the error-handling pattern the neighbouring code already uses, and each gets a unit test in the existing `packages/ui/test/unit` style. Deletions go first, so later tasks build on the smaller tree.

**Tech Stack:** Docker (Debian runtime with nginx and pm2), GitHub Actions, TypeScript and React in `packages/ui`, `node:test` with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-10-27-audit-remediation.md` (findings D1 to D5 and C1 to C8, plus the node-forge decision)

## Global Constraints

- Style per `AGENTS.md`. Every action stays pinned by full SHA with a version comment.
- Run one UI test file with `node build/test.mjs ui && node --test .test-dist/ui/test/unit/<name>.test.js`. Never pass `--scope`.
- Container user: `llmr`, uid and gid `10001`. Data stays at `/data` with `HOME=/data`, as `docker/entrypoint.sh:22` already sets.
- Container health means nginx and the management server answer. A gateway with no models configured returns 502 on `/health` (`tests/system/docker-smoke.mjs:120`), which is a configuration state and not a broken container. The HEALTHCHECK therefore passes when `POST /api/ccr/rpc` with no token returns 401 or 200.
- Backups kept: none. Pipeline changes do not touch user data.
- Run `npm ci` before starting. The local `node_modules` is stale against the lockfile (`openai@6.44.0` installed against `^7.43.0` required; measured 2026-10-27).

## Review Focus

1. An existing Docker volume created by a root-run 4.x image. Expected: the non-root container fails with a clear message naming the `chown` fix, rather than a cryptic EACCES. Pinned in Task 3.
2. A fresh container with no models configured. Expected: healthy. Pinned in Task 3.
3. A release tag pushed while a test fails. Expected: no artifacts are built or published. Pinned in Task 6.
4. A Chrome-import job that expires while the provider dialog is open. Expected: polling stops and the dialog shows the import as gone. Pinned in Task 7.
5. A 9-character legacy API key in the key list. Expected: masked to at most its first 4 characters. Pinned in Task 8.

---

### Task 1: Delete dead scripts and guard against new ones (C1)

**Files:**
- Modify: root `package.json` (delete `bench:context-archive`, `bench:context-archive-agent`, `bench:context-archive-real`, `bench:claude-compact-real`, lines 50-53)
- Test: `tests/architecture/package-scripts.test.mjs` (new)

- [ ] **Step 1: Write the failing test**

```js
test("every root script that runs a repo file points at a file that exists", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  const missing = Object.entries(scripts).flatMap(([name, command]) =>
    [...command.matchAll(/\bnode\s+([\w./-]+\.(?:mjs|cjs|js|ts))/g)]
      .map((match) => match[1])
      .filter((file) => !existsSync(file))
      .map((file) => `${name} -> ${file}`));
  assert.deepEqual(missing, []);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:architecture`
Expected: FAIL, listing the four `bench:*` scripts.

- [ ] **Step 3: Delete the four scripts, run the suite again, confirm PASS**

- [ ] **Step 4: Commit**

```bash
git add package.json tests/architecture/package-scripts.test.mjs
git commit -m "chore: drop bench scripts for the deleted benchmarks directory"
```

### Task 2: Keep local state out of the Docker build context (D2)

**Files:**
- Modify: `.dockerignore`
- Test: `tests/architecture/dockerignore.test.mjs` (new)

- [ ] **Step 1: Write the failing test**

```js
test(".dockerignore excludes local state and rendered secrets", () => {
  const entries = readFileSync(".dockerignore", "utf8").split("\n").map((line) => line.trim());
  for (const entry of [".test-dist", ".codegraph", ".serena", ".remember", ".superpowers", "private", ".claude", "docker/claude-apps-gateway/*.rendered.yaml"]) {
    assert.ok(entries.includes(entry), entry);
  }
  assert.ok(!entries.some((entry) => entry.startsWith("docker/local-ai-gateway")), "the Dockerfile copies docker/local-ai-gateway/*.tgz");
});
```

- [ ] **Step 2: Run it, confirm it fails, add the entries, confirm it passes**

Run: `npm run test:architecture`

- [ ] **Step 3: Commit**

```bash
git add .dockerignore tests/architecture/dockerignore.test.mjs
git commit -m "build(docker): exclude local state and rendered secrets from the build context"
```

### Task 3: The container runs as a non-root user and reports real health (D1)

**Files:**
- Modify: `Dockerfile` (runtime stage :29-77)
- Modify: `docker/pm2.config.cjs` (nginx args), `docker/entrypoint.sh` (writable-path check near :22-40)
- Test: `tests/system/docker-smoke.mjs`, `tests/architecture/dockerfile.test.mjs` (new)

**Interfaces:**
- Produces:
  - The runtime stage creates `llmr` (10001:10001).
  - It chowns `/data`, `/run/nginx`, `/var/lib/nginx`, `/var/log/nginx` and `/etc/nginx/conf.d` to that user, and ends with `USER llmr`.
  - pm2 starts nginx with `-g "daemon off; pid /run/nginx/nginx.pid;"`.
  - The entrypoint exits 1 with `/data is not writable by uid 10001; run: docker run --rm -v <volume>:/data --user 0 <image> chown -R 10001:10001 /data` when `/data` is not writable.
  - The HEALTHCHECK posts to `http://127.0.0.1:${CCR_NGINX_PORT}/api/ccr/rpc` and exits 0 on status 401 or 200.

- [ ] **Step 1: Write the failing tests**

```js
// tests/architecture/dockerfile.test.mjs
test("the runtime image runs as llmr and checks the management server", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  assert.match(dockerfile, /^USER llmr$/m);
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/api\/ccr\/rpc/);
});
```

In `tests/system/docker-smoke.mjs`, add two assertions next to the existing ones:

```js
assert.equal(dockerExec(container, ["id", "-u"]).trim(), "10001");
assert.equal(await waitForHealth(container), "healthy");
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test:architecture && npm run test:system`
Expected: FAIL. `test:system` needs a local Docker daemon. If none is available, say so in the PR and rely on the CI job from Task 6.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them and confirm they pass**

Same commands. Expected: PASS, including the existing `/health` 502-then-200 assertions.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker tests/system/docker-smoke.mjs tests/architecture/dockerfile.test.mjs
git commit -m "build(docker): run as an unprivileged user with a real health check"
```

### Task 4: Workflows hold least-privilege tokens (D4)

**Files:**
- Modify: `.github/workflows/release.yml` (top-level permissions :8-9; checkouts at :22, :48, :83, :163, :228, :276)
- Modify: `.github/workflows/docker-release.yml` (:18-20, :37), `.github/workflows/test.yml` (:24, :48), `.github/workflows/docs.yml`, `.github/actions/prepare-release-gateway/action.yml`
- Test: `tests/architecture/workflow-permissions.test.mjs` (new)

**Interfaces:**
- Produces: every workflow has top-level `permissions: contents: read`. Write scopes sit on jobs: `publish-macos`, `windows` and `linux` get `contents: write`, and the Docker job gets `packages: write`. Every `actions/checkout` sets `persist-credentials: false`.

- [ ] **Step 1: Write the failing test**

```js
for (const file of readdirSync(".github/workflows").map((name) => `.github/workflows/${name}`).concat(".github/actions/prepare-release-gateway/action.yml")) {
  test(`${file} uses read-only defaults and no persisted credentials`, () => {
    const text = readFileSync(file, "utf8");
    const checkouts = text.split("uses: actions/checkout@").length - 1;
    const persisted = text.split("persist-credentials: false").length - 1;
    assert.equal(persisted, checkouts, "every checkout sets persist-credentials: false");
    if (file.includes("/workflows/")) assert.match(text, /^permissions:\n  contents: read$/m);
  });
}
```

- [ ] **Step 2: Run it, confirm it fails, implement, confirm it passes**

Run: `npm run test:architecture`

- [ ] **Step 3: Commit**

```bash
git add .github tests/architecture/workflow-permissions.test.mjs
git commit -m "ci: scope workflow tokens per job and stop persisting checkout credentials"
```

### Task 5: The docs site deploys (D3)

**Files:**
- Modify: `.github/workflows/docs.yml`

**Interfaces:**
- Produces: a `deploy` job with `needs: build`, `permissions: { pages: write, id-token: write }` and `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`. It runs one step, `actions/deploy-pages` pinned by SHA, with `id: deployment`. The build already sets `ASTRO_BASE=/llm-router/`, and `docs/astro.config.mjs:33` consumes it.

- [ ] **Step 1: Add the job**

- [ ] **Step 2: Operator step, set the Pages source**

The operator sets Settings, then Pages, then Source to "GitHub Actions". This is a one-time repo setting the workflow cannot make itself.

- [ ] **Step 3: Verify after merge**

Run: `gh run list --workflow docs.yml --limit 1 && curl -sI https://jrmatherly.github.io/llm-router/ | head -1`
Expected: the latest run succeeded with a `deploy` job, and the site answers `HTTP/2 200`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/docs.yml
git commit -m "ci(docs): deploy the built site to GitHub Pages"
```

### Task 6: Releases are gated on tests and the image is smoke-tested in CI (D5)

**Files:**
- Modify: `.github/workflows/release.yml` (add a `test` job; `model-catalog`, `gateway` and `macos` gain `needs: test`)
- Modify: `.github/workflows/test.yml` (add a `docker-smoke` job that runs `npm run test:system`)
- Test: `tests/architecture/workflow-permissions.test.mjs` (extend)

**Interfaces:**
- Produces: the release `test` job runs `npm ci`, `npm run typecheck` and `npm run test` with `contents: read`. The `docker-smoke` job runs on `ubuntu-latest` on pull requests and pushes to `main`. Windows and Linux keep `needs: publish-macos`, because `--publish always` attaches to the release that job creates.

- [ ] **Step 1: Write the failing test**

```js
test("release builds wait for the test job", () => {
  const release = readFileSync(".github/workflows/release.yml", "utf8");
  assert.match(release, /^  test:$/m);
  for (const job of ["model-catalog", "gateway"]) {
    assert.match(release, new RegExp(`^  ${job}:[\\s\\S]*?needs: \\[?test`, "m"), job);
  }
  assert.match(readFileSync(".github/workflows/test.yml", "utf8"), /npm run test:system/);
});
```

- [ ] **Step 2: Run it, confirm it fails, implement, confirm it passes**

Run: `npm run test:architecture`

- [ ] **Step 3: Commit**

```bash
git add .github tests/architecture/workflow-permissions.test.mjs
git commit -m "ci: gate releases on the test suite and smoke-test the Docker image"
```

### Task 7: UI async actions handle failure (C2, C8)

**Files:**
- Create: `packages/ui/src/pages/home/shared/chrome-import.ts`
- Modify: `packages/ui/src/pages/home/components/providers.tsx:2925-2936`, `packages/ui/src/pages/browser/main.tsx:70-73`, `:83-88`, `packages/ui/src/pages/home/App.tsx:353`, `packages/ui/src/pages/home/components/api-keys.tsx:34-37` (and the second `copyApiKey` near :217)
- Modify: `packages/ui/src/pages/home/shared/api-keys.ts:315` (`copyTextToClipboard` returns whether it copied)
- Test: `packages/ui/test/unit/chrome-import.test.ts`

**Interfaces:**
- Produces:
  - `pollChromeImportJob(get: (id: string) => Promise<ChromeImportJob | undefined>, id: string): Promise<ChromeImportJob | undefined>`. It resolves `undefined` when `get` resolves `undefined` or rejects. Both poll sites call it, and both clear their job state on `undefined`.
  - `copyTextToClipboard(text: string): Promise<boolean>`. `copyApiKey` toasts "Copied API key" only on `true`, and shows the error toast otherwise.
  - `browser/main.tsx` `run()` catches, and reports the failure through its existing status line.
  - `App.tsx:353` gets the `.catch` that the next call at :354 already has.

- [ ] **Step 1: Write the failing tests**

```ts
test("pollChromeImportJob resolves undefined for a missing job", async () => {
  assert.equal(await pollChromeImportJob(async () => undefined, "j1"), undefined);
});

test("pollChromeImportJob resolves undefined when the IPC call rejects", async () => {
  assert.equal(await pollChromeImportJob(async () => { throw new Error("gone"); }, "j1"), undefined);
});

test("pollChromeImportJob passes a live job through", async () => {
  const job = { id: "j1", status: "pending" } as ChromeImportJob;
  assert.equal(await pollChromeImportJob(async () => job, "j1"), job);
});
```

- [ ] **Step 2: Run them, confirm they fail, implement, confirm they pass**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/unit/chrome-import.test.js`

- [ ] **Step 3: Run the UI suite and commit**

Run: `npm run test:ui`

```bash
git add packages/ui
git commit -m "fix(ui): stop failed async actions from leaving the UI stuck or silent"
```

### Task 8: Codex badge and short-key masking (C3, C4)

**Files:**
- Modify: `packages/ui/src/pages/home/shared/network.ts:170-171`, `packages/ui/src/pages/home/shared/api-keys.ts:342-348`
- Test: `packages/ui/test/unit/network-format.test.ts`, `packages/ui/test/unit/api-keys.test.ts` (new)

**Interfaces:**
- Produces: `clientInitial` returns `"CX"` for Codex clients. `maskApiKey(value: string): string` returns `"****"` up to 12 characters. Above that it shows `min(8, floor(length / 4))` leading characters followed by `***`.

- [ ] **Step 1: Write the failing tests**

```ts
test("Codex clients get their own badge", () => {
  assert.equal(clientInitial("codex-cli"), "CX");
});

test("maskApiKey never shows most of a short key", () => {
  assert.equal(maskApiKey("abcdefghi"), "****");
  assert.equal(maskApiKey("abcdefghijkl"), "****");
  assert.equal(maskApiKey("abcdefghijklmnop"), "abcd***");
  assert.equal(maskApiKey(`sk-${"x".repeat(32)}`), "sk-xxxxx***");
});
```

- [ ] **Step 2: Run them, confirm they fail, implement, confirm they pass**

Run: `node build/test.mjs ui && node --test .test-dist/ui/test/unit/network-format.test.js .test-dist/ui/test/unit/api-keys.test.js`

- [ ] **Step 3: Commit**

```bash
git add packages/ui
git commit -m "fix(ui): give Codex its own badge and mask short API keys fully"
```

### Task 9: The tray reuses the home helpers (C5)

**Files:**
- Modify: `packages/ui/src/pages/tray/shared.tsx` (delete the duplicated definitions and import them)
- Test: `packages/ui/test/unit/tray-shared.test.ts` (existing)

**Interfaces:**
- Consumes the home definitions. Most live in `packages/ui/src/pages/home/shared/common.ts`. The rest are `clampNumber` in `shared/services.tsx`, `formatDuration` in `shared/network.ts`, `formatPercent` and `formatUsdCost` in `shared/usage.ts`, `languagePreferenceStorageKey` in `shared/i18n.tsx`, `formatCompactNumber` in `components/providers.tsx`, `isTrayMascotIconPreference` and `providerBaseUrl` in `components/settings.tsx`, and `rangeLabel` in `components/share-cards.tsx`.
- Helpers that live in a component file move to the nearest `home/shared/*.ts` file first, so the tray imports no component modules.

- [ ] **Step 1: Diff each drifted pair and record the choice**

Diff each of these against its home twin: `clampNumber`, `formatCompactNumber`, `formatDuration`, `languagePreferenceStorageKey`, `normalizeTrayComponentVariants`, `normalizeTrayIconPreference`, `normalizeTrayWidget`, `normalizeTrayWidgetAccountProviders`, `normalizeTrayWidgets`, `normalizeTrayWindowModules` and `providerBaseUrl`. For each, keep the home version unless a tray test or a tray-only input needs the tray behaviour. In that case, fold the difference into the home version behind a parameter. Write the per-function choice in the PR description.

- [ ] **Step 2: Add a test for every behaviour difference you kept**

Put these in `tray-shared.test.ts`, before deleting the copies.

- [ ] **Step 3: Delete the copies, then run the UI suite and typecheck**

Run: `npm run typecheck && npm run test:ui`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui
git commit -m "refactor(ui): import tray helpers from home instead of copying them"
```

### Task 10: Delete unused UI exports (C6)

**Files:**
- Modify: the files under `packages/ui/src` that define the 42 names in the list below

The names are: MetricCard, ProviderConnectivityCheckModelResult, ServerActionBusy, StatusBadge, TrayComponentOptionGroup, TrayModuleOption, accountStatusClass, buildPluginRoutingConfigItems, buildPluginRoutingRows, certificateStatusLabel, certificateStatusVariant, createInitialLogJsonExpandedPaths, createMcpToolOptions, endpointDetails, formatJson, formatKeyValueText, formatProxyCertificateInstallMessage, formatProxyTargets, gatewayEndpointFromConfig, jsonContainerEntries, jsonContainerSummary, logBodyKey, metricToneStroke, parseKeyValueText, parseProxyTargetsText, providerAccountBadgeVariant, providerAccountMeterValidityProgress, providerCredentialImportExample, providerSelectOptions, proxyCertificateTrustSteps, proxyRestartMessage, resolveProviderDeepLinkIcon, routerRuleMatchesQuery, routerRuleRewriteFromRule, selectedFusionToolName, selectedFusionToolNameFromProfile, splitModelTagInput, systemStatusIconClass, systemStatusSegmentClass, uniqueExtensionKey, virtualModelMatchFromDraft and virtualModelMatchModeLabel.

- [ ] **Step 1: Confirm each name is unused across the whole repo**

Run: `for n in <names>; do echo "$n $(git grep -lw "$n" -- packages tests docs | wc -l)"; done`
Expected: `1` for each name you delete. Keep any name with a count above 1, and note it in the PR.

- [ ] **Step 2: Delete them, along with any private helper that only they used**

- [ ] **Step 3: Run typecheck and the UI suite**

Run: `npm run typecheck && npm run test:ui`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui
git commit -m "chore(ui): delete exports nothing imports"
```

### Task 11: Dependency hygiene (C7) and the node-forge alert

**Files:**
- Modify: root `package.json` (`@types/node`), `package-lock.json` (through npm), `.github/dependabot.yml`

**Interfaces:**
- Produces: `@types/node` at `24.19.2`, pinned exact the way `npm update` pins in this repo. `dependabot.yml` gains an `npm` ecosystem at `/`, weekly, grouped `npm` with pattern `*`, and commit prefix `chore`.

- [ ] **Step 1: Bump and verify**

Run: `npm install -D @types/node@24.19.2 && npm run typecheck`
Expected: exit 0. Fix any type errors the Node 24 types surface in this task.

- [ ] **Step 2: Add the npm ecosystem to dependabot.yml**

- [ ] **Step 3: Run every suite and commit**

Run: `npm run test`

```bash
git add package.json package-lock.json .github/dependabot.yml
git commit -m "chore(deps): use Node 24 types and let Dependabot watch npm"
```

- [ ] **Step 4: Operator step, dismiss Dependabot alert 111**

Run (the operator approves, because it changes repo state on GitHub): `gh api -X PATCH repos/jrmatherly/llm-router/dependabot/alerts/111 -f state=dismissed -f dismissed_reason=not_used -f dismissed_comment="node-forge only signs proxy certificates (packages/core/src/proxy/certificates.ts); no signature verification path; 1.4.0 is the latest release."`
Expected: JSON with `"state": "dismissed"`.

### Task 12: Open the PR

- [ ] **Step 1: Run every suite**

Run: `npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 2: Open the PR**

Title: `chore: harden the Docker and CI pipeline and clear audit cleanup items`. The body lists the operator steps: the Pages source setting, dismissing alert 111, and the volume `chown` note for existing Docker users.

## Risks

- **Existing Docker volumes.** Volumes written by the root-run image are owned by root, so the new image refuses to start until the user runs the one-line `chown` the entrypoint prints. This is consistent with the clean-reinstall policy in the spec.
- **nginx `user` directive.** Debian's `/etc/nginx/nginx.conf` sets `user www-data;`, which nginx ignores with a warning when it runs unprivileged. If the warning fails the smoke test, the runtime stage removes that line.
- **Removed exports used by docs demos.** `docs/src/components/interactive` imports UI code. Task 10's repo-wide grep covers `docs`, and the docs build in CI catches anything missed.
