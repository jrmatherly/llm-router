import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

for (const file of readdirSync(".github/workflows").map((name) => `.github/workflows/${name}`).concat(".github/actions/prepare-release-gateway/action.yml")) {
  test(`${file} uses read-only defaults and no persisted credentials`, () => {
    const text = readFileSync(file, "utf8");
    const checkouts = text.match(/^\s+(?:- )?uses: actions\/checkout@/gm)?.length ?? 0;
    const persisted = text.match(/^\s+persist-credentials: false$/gm)?.length ?? 0;
    assert.equal(persisted, checkouts, "every checkout sets persist-credentials: false");
    if (file.includes("/workflows/")) assert.match(text, /^permissions:\n  contents: read$/m);
  });
}

function jobBlocks(file) {
  const text = readFileSync(file, "utf8");
  const body = text.slice(text.indexOf("\njobs:\n") + 7);
  const starts = [...body.matchAll(/^  ([A-Za-z0-9_-]+):$/gm)];
  return new Map(starts.map((m, i) => [m[1], body.slice(m.index, starts[i + 1]?.index)]));
}

const gatewayInstall = "npm install --no-save .tmp/gateway-package/*.tgz";
const gatewayEntry = /^      LLMR_TEST_GATEWAY_ENTRY: \$\{\{ github\.workspace \}\}\/node_modules\/@the-next-ai\/ai-gateway\/bin\/next-ai-gateway\.js$/m;

test("release builds wait for the test job", () => {
  const jobs = jobBlocks(".github/workflows/release.yml");
  assert.match(jobs.get("model-catalog"), /^    needs: test$/m);
  assert.match(jobs.get("test"), /^    needs: gateway$/m);
  assert.match(jobs.get("macos"), /^    needs: \[model-catalog, gateway\]$/m);
  assert.match(readFileSync(".github/workflows/test.yml", "utf8"), /npm run test:system/);
});

test("tests and releases install the gateway tarball the release builds", () => {
  for (const file of [".github/workflows/test.yml", ".github/workflows/release.yml"]) {
    const jobs = jobBlocks(file);
    assert.match(jobs.get("gateway"), /uses: \.\/\.github\/actions\/prepare-release-gateway/, file);
    assert.match(jobs.get("test"), gatewayEntry, file);
    assert.doesNotMatch(readFileSync(file, "utf8"), /package-lock=false/, `${file} installs honour the lockfile`);
    for (const name of file.endsWith("test.yml") ? ["test", "e2e"] : ["test"]) {
      const block = jobs.get(name);
      const ci = block.indexOf("run: npm ci\n");
      assert.ok(ci > 0 && ci < block.indexOf(gatewayInstall), `${file} ${name} installs the gateway tarball after npm ci`);
      assert.match(block, /^    needs: \[?(?:test, )?gateway\b/m, `${file} ${name} waits for the gateway job`);
    }
  }
});

test("pushes to main never cancel a Tests run", () => {
  const tests = readFileSync(".github/workflows/test.yml", "utf8");
  assert.match(tests, /^  group: tests-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref == 'refs\/heads\/main' && github\.sha \|\| github\.ref \}\}$/m);
  assert.match(tests, /^  cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}$/m);
});

test("the Docker image is smoke-tested with the release gateway before any push", () => {
  const smoke = jobBlocks(".github/workflows/test.yml").get("docker-smoke");
  assert.match(smoke, /^    needs: gateway$/m);
  assert.match(smoke, /^          path: docker\/local-ai-gateway$/m);
  assert.match(smoke, /LLMR_DOCKER_TEST_SKIP_BUILD: "1"/);
  const release = readFileSync(".github/workflows/docker-release.yml", "utf8");
  const prepared = release.indexOf("uses: ./.github/actions/prepare-release-gateway");
  assert.ok(prepared > 0 && prepared < release.indexOf("load: true"), "the gateway is prepared before the smoke image is built");
  for (const text of [smoke, release]) assert.match(text, /run: ls docker\/local-ai-gateway\/the-next-ai-ai-gateway-\*\.tgz/);
  const smokeRun = release.indexOf("node tests/system/docker-smoke.mjs");
  assert.ok(smokeRun > 0 && smokeRun < release.indexOf("push: true"), "the smoke test runs before the push");
  assert.match(release, /^          load: true$/m);
  assert.match(release, /LLMR_DOCKER_TEST_IMAGE: llm-router:smoke/);
  assert.match(release, /LLMR_DOCKER_TEST_SKIP_BUILD: "1"/);
});

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
