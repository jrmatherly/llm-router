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
  const publish = jobs.get("publish");
  assert.match(publish, /^    needs: \[upload-macos, windows, linux\]$/m);
  assert.equal(text.match(/--draft=false/g).length, 1);
  assert.match(publish, /gh release edit "\$GITHUB_REF_NAME" --draft=false --latest$/m);
  for (const name of releaseAssets) assert.ok(publish.includes(name), name);
  const checked = publish.indexOf("(( missing == 0 ))");
  assert.ok(checked > 0 && checked < publish.indexOf("--draft=false"), "the asset check runs before the release is published");
  assert.ok(publish.indexOf("gh release download") < checked, "the update metadata is read before the asset check passes");
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
  assert.match(docs, /^  group: docs-\$\{\{ github\.ref == 'refs\/heads\/main' && 'deploy' \|\| github\.ref \}\}\n  cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}$/m);
  const jobs = jobBlocks(".github/workflows/docs.yml");
  assert.match(jobs.get("deploy"), /^    if: github\.ref == 'refs\/heads\/main'$/m);
  assert.doesNotMatch(jobs.get("build"), /^    if:/m);
  for (const [name, block] of jobs) assert.match(block, /^    timeout-minutes: \d+$/m, name);
});

test("Dependabot covers both lockfiles, the workflows and the compose images", () => {
  const config = readFileSync(".github/dependabot.yml", "utf8");
  for (const [ecosystem, directory] of [["github-actions", "/"], ["npm", "/"], ["npm", "/docs"], ["docker-compose", "/docker/claude-apps-gateway"]]) {
    assert.match(config, new RegExp(`- package-ecosystem: ${ecosystem}\\n    directory: "${directory}"\\n`), `${ecosystem} ${directory}`);
  }
});
