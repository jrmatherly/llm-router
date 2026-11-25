import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

for (const file of readdirSync(".github/workflows").map((name) => `.github/workflows/${name}`)) {
  test(`${file} uses read-only defaults and no persisted credentials`, () => {
    const text = readFileSync(file, "utf8");
    const checkouts = text.match(/^\s+(?:- )?uses: actions\/checkout@/gm)?.length ?? 0;
    const persisted = text.match(/^\s+persist-credentials: false$/gm)?.length ?? 0;
    assert.equal(persisted, checkouts, "every checkout sets persist-credentials: false");
    if (file.includes("/workflows/")) assert.match(text, /^permissions:\n {2}contents: read$/m);
  });

  test(`${file} names its runner images and pins every action to a commit`, () => {
    const text = readFileSync(file, "utf8");
    for (const [, runner] of text.matchAll(/^\s+(?:runs-on|runner): (.+)$/gm)) {
      if (!runner.startsWith("${{")) assert.match(runner, /^(?:ubuntu|macos|windows)-\d[\w.-]*$/, runner);
    }
    for (const [, action] of text.matchAll(/^\s+(?:- )?uses: (.+)$/gm)) {
      assert.match(action, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, action);
    }
  });
}

function jobBlocks(file) {
  const text = readFileSync(file, "utf8");
  const body = text.slice(text.indexOf("\njobs:\n") + 7);
  const starts = [...body.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)];
  return new Map(starts.map((m, i) => [m[1], body.slice(m.index, starts[i + 1]?.index)]));
}

const gatewayEntry = /^ {6}LLMR_TEST_GATEWAY_ENTRY: \$\{\{ github\.workspace \}\}\/node_modules\/@the-next-ai\/ai-gateway\/bin\/next-ai-gateway\.js$/m;

test("release builds wait for the test job", () => {
  const jobs = jobBlocks(".github/workflows/release.yml");
  for (const job of ["model-catalog", "create-draft"]) assert.match(jobs.get(job), /^ {4}needs: test$/m, job);
  assert.doesNotMatch(jobs.get("test"), /^ {4}needs:/m);
  assert.match(jobs.get("macos"), /^ {4}needs: model-catalog$/m);
  for (const job of ["windows", "linux"]) assert.match(jobs.get(job), /^ {4}needs: \[create-draft, model-catalog\]$/m, job);
  assert.match(readFileSync(".github/workflows/test.yml", "utf8"), /npm run test:system/);
});

test("the release stays a draft until every platform uploaded", () => {
  const jobs = jobBlocks(".github/workflows/release.yml");
  assert.match(jobs.get("create-draft"), /gh release create "\$GITHUB_REF_NAME" --draft --verify-tag /);
  assert.match(jobs.get("create-draft"), /--json isDraft --jq \.isDraft\)" = "true"$/m);
  assert.match(jobs.get("upload-macos"), /^ {4}needs: \[macos, create-draft\]$/m);
  assert.match(jobs.get("publish"), /^ {4}needs: \[upload-macos, windows, linux\]$/m);
  assert.match(jobs.get("publish"), /gh release edit "\$GITHUB_REF_NAME" --draft=false --latest$/m);
  for (const [name, block] of jobs) {
    if (name === "create-draft" || name === "publish") continue;
    assert.doesNotMatch(block, /gh\s+release\s+(?:create|edit)\b|draft[= ]+false/, `${name} must not create or publish the release`);
  }
  for (const name of ["windows", "linux"]) assert.match(jobs.get(name), /^ {10}EP_DRAFT: "true"$/m, `${name} can only ever create a draft`);
});

test("every release.yml job sets timeout-minutes", () => {
  for (const [name, block] of jobBlocks(".github/workflows/release.yml")) {
    assert.match(block, /^ {4}timeout-minutes: \d+$/m, name);
  }
});

test("macOS signing runs in the release environment", () => {
  for (const [name, block] of jobBlocks(".github/workflows/release.yml")) {
    if (name === "macos") assert.match(block, /^ {4}environment: release$/m);
    else assert.doesNotMatch(block, /secrets\.(?:APPLE|MACOS)_/, name);
  }
});

test("tests and releases run the locked gateway", () => {
  for (const file of [".github/workflows/test.yml", ".github/workflows/release.yml"]) {
    const jobs = jobBlocks(file);
    assert.match(jobs.get("test"), gatewayEntry, file);
    assert.doesNotMatch(readFileSync(file, "utf8"), /package-lock=false/, `${file} installs honour the lockfile`);
    for (const name of file.endsWith("test.yml") ? ["test", "e2e"] : ["test"]) {
      assert.ok(jobs.get(name).includes("run: npm ci\n"), `${file} ${name} installs from the lockfile`);
    }
  }
});

test("pushes to main never cancel a Tests run", () => {
  const tests = readFileSync(".github/workflows/test.yml", "utf8");
  assert.match(tests, /^ {2}group: tests-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref == 'refs\/heads\/main' && github\.sha \|\| github\.ref \}\}$/m);
  assert.match(tests, /^ {2}cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}$/m);
});

test("the Docker image is smoke-tested before any push", () => {
  const smoke = jobBlocks(".github/workflows/test.yml").get("docker-smoke");
  assert.match(smoke, /LLMR_DOCKER_TEST_SKIP_BUILD: "1"/);
  const release = readFileSync(".github/workflows/docker-release.yml", "utf8");
  const smokeRun = release.indexOf("node tests/system/docker-smoke.mjs");
  assert.ok(smokeRun > 0 && smokeRun < release.indexOf("push: true"), "the smoke test runs before the push");
  assert.match(release, /^ {10}load: true$/m);
  assert.match(release, /LLMR_DOCKER_TEST_IMAGE: llm-router:smoke/);
  assert.match(release, /LLMR_DOCKER_TEST_SKIP_BUILD: "1"/);
});

test("docs build on pull requests, deploy only from main, and every job has a timeout", () => {
  const docs = readFileSync(".github/workflows/docs.yml", "utf8");
  assert.match(docs, /^ {2}pull_request:\n {4}paths:\n {6}- "docs\/\*\*"\n {6}- "\.github\/workflows\/docs\.yml"$/m);
  assert.match(docs, /^ {2}group: docs-\$\{\{ github\.ref == 'refs\/heads\/main' && 'deploy' \|\| github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}$/m);
  const jobs = jobBlocks(".github/workflows/docs.yml");
  assert.match(jobs.get("deploy"), /^ {4}if: github\.ref == 'refs\/heads\/main'$/m);
  assert.doesNotMatch(jobs.get("build"), /^ {4}if:/m);
  for (const [name, block] of jobs) assert.match(block, /^ {4}timeout-minutes: \d+$/m, name);
});

test("Dependabot covers both lockfiles, the workflows and the compose images", () => {
  const config = readFileSync(".github/dependabot.yml", "utf8");
  for (const [ecosystem, directory] of [["github-actions", "/"], ["npm", "/"], ["npm", "/docs"], ["docker-compose", "/docker/claude-apps-gateway"]]) {
    assert.match(config, new RegExp(`- package-ecosystem: ${ecosystem}\\n    directory: "${directory}"\\n`), `${ecosystem} ${directory}`);
  }
});

test("the package suites also run on Windows and an Intel Mac", () => {
  const job = jobBlocks(".github/workflows/test.yml").get("platforms");
  assert.match(job, gatewayEntry);
  assert.match(job, /^ {4}runs-on: \$\{\{ matrix\.runner \}\}$/m);
  const release = readFileSync(".github/workflows/release.yml", "utf8");
  for (const runner of ["windows-2025", "macos-26-intel"]) {
    assert.ok(job.includes(`\n            runner: ${runner}\n`), runner);
    assert.match(release, new RegExp(`^ +(runner|runs-on): ${runner}$`, "m"), `release.yml no longer builds on ${runner}`);
  }
  assert.match(job, /^ {6}fail-fast: false$/m);
  assert.match(job, /^ {4}timeout-minutes: \d+$/m);
  assert.ok(job.includes("run: npm ci\n"));
  assert.ok(job.includes("run: npm run test:packages\n"));
  assert.doesNotMatch(job, /^ +(needs|if|exclude):/m);
  assert.deepEqual(job.match(/continue-on-error.*/g), ["continue-on-error: ${{ matrix.allowed_to_fail == true }}"]);
  assert.deepEqual(job.match(/allowed_to_fail.*/g), ["allowed_to_fail == true }}", "allowed_to_fail: true"]);
  assert.deepEqual(job.match(/^.*\n.*allowed_to_fail: true$/gm), ["            runner: windows-2025\n            allowed_to_fail: true"]);
});
