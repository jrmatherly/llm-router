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
