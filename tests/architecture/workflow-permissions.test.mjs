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
