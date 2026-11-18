import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const name = "@the-next-ai/ai-gateway";
const gatewayUrlPattern = /^https:\/\/github\.com\/jrmatherly\/llmr-gateway\/releases\/download\/v(\d+\.\d+\.\d+-llmr\.\d+)\/the-next-ai-ai-gateway-\1\.tgz$/;
const json = (file) => JSON.parse(readFileSync(file, "utf8"));

test("every manifest that depends on the gateway names one release tarball, and the lockfile pins its bytes", () => {
  const core = json("packages/core/package.json").dependencies[name];
  const [, version] = core.match(gatewayUrlPattern) ?? assert.fail(`${core} is not a gateway release asset URL`);
  const manifests = ["package.json", ...readdirSync("packages").map((dir) => `packages/${dir}/package.json`)];
  const dependents = manifests.filter((file) => {
    const manifest = json(file);
    const specs = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].map((field) => manifest[field]?.[name]).filter(Boolean);
    for (const spec of specs) assert.equal(spec, core, `${file} names another gateway`);
    return specs.length > 0;
  });
  assert.deepEqual(dependents, ["packages/cli/package.json", "packages/core/package.json"]);
  const locked = json("package-lock.json").packages[`node_modules/${name}`];
  assert.equal(locked.resolved, core);
  assert.equal(locked.version, version);
  assert.match(locked.integrity, /^sha512-/);
  assert.equal(json(`node_modules/${name}/package.json`).version, version, "run npm ci: node_modules holds another gateway");
});

test("no workflow builds or installs a gateway beside the lockfile", () => {
  const files = readdirSync(".github", { recursive: true }).map((file) => `.github/${file}`).filter((file) => /\.ya?ml$/.test(file));
  const banned = [
    /prepare-release-gateway|local-ai-gateway|gateway-package/,
    /(?<!@)the-next-ai\/ai-gateway/i,
    /npm (?:i|install|add)\b[^\n]*(?:\.tgz|ai-gateway)/,
    /docker:prepare-gateway|GATEWAY_SOURCE_DIR|LOCAL_AI_GATEWAY_DIR|GATEWAY_PACKAGE_DIR|LLMR_GATEWAY_ENTRY/
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of banned) assert.doesNotMatch(text, pattern, file);
  }
});

test("the Docker release refuses a ref whose lockfile takes the gateway from elsewhere", () => {
  const release = readFileSync(".github/workflows/docker-release.yml", "utf8");
  const guard = release.indexOf('!= https://github.com/jrmatherly/llmr-gateway/releases/download/*');
  assert.ok(guard > 0 && guard < release.indexOf("docker/build-push-action@"), "the lockfile check runs before any image is built");
});
