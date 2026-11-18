import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const verifyPackagedApp = createRequire(path.join(process.cwd(), "package.json"))("./build/verify-packaged-app.cjs");

const hostPlatform = process.platform;
const hostPrebuild = `${hostPlatform}-${process.arch}.node`;
const foreignPrebuilds = ["darwin-arm64.node", "linux-x64.node", "win32-x64.node"].filter((name) => name !== hostPrebuild);

const installedPrebuilds = path.join(process.cwd(), "node_modules", "better-sqlite3", "prebuilds");

function packagedApp({ platform = hostPlatform, prebuild = hostPrebuild, source = prebuild, withHostPrebuild = true } = {}) {
  const appOutDir = mkdtempSync(path.join(os.tmpdir(), "llmr-packaged-"));
  const resources = platform === "darwin"
    ? path.join(appOutDir, "Fake.app", "Contents", "Resources")
    : path.join(appOutDir, "resources");
  const packageDir = path.join(resources, "app.asar.unpacked", "node_modules", "better-sqlite3");
  const prebuilds = path.join(packageDir, "prebuilds");
  mkdirSync(prebuilds, { recursive: true });
  writeFileSync(path.join(resources, "app.asar"), "asar");
  for (const name of foreignPrebuilds.filter((name) => name !== prebuild)) {
    writeFileSync(path.join(prebuilds, name), "foreign");
  }
  if (withHostPrebuild) {
    copyFileSync(path.join(installedPrebuilds, source), path.join(prebuilds, prebuild));
  }
  return { appOutDir, packageDir, prebuilds };
}

test("electron-builder ships the better-sqlite3 prebuild and never rebuilds it", () => {
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "electron-builder.json"), "utf8"));
  assert.equal(config.npmRebuild, false);
  assert.deepEqual(config.files.filter((entry) => entry.includes("build/Release")), []);
  assert.ok(config.asarUnpack.includes("**/*.node"), "the verifier reads the prebuild from app.asar.unpacked");
});

test("npm never runs the implicit node-gyp rebuild for better-sqlite3", () => {
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  assert.equal(
    manifest.allowScripts["better-sqlite3"],
    false,
    "better-sqlite3 ships binding.gyp, so npm ci runs node-gyp rebuild unless the script is denied; the Docker image has no Python"
  );
});

for (const [platform, arch] of [["darwin", "arm64"], ["darwin", "x64"], ["linux", "x64"], ["linux", "arm64"], ["win32", "x64"], ["win32", "arm64"]]) {
  test(`packaged-app verification accepts the ${platform}-${arch} prebuild on any host`, async () => {
    const { appOutDir, prebuilds } = packagedApp({ platform, prebuild: `${platform}-${arch}.node` });
    await verifyPackagedApp({ appOutDir, arch, electronPlatformName: platform });
    assert.deepEqual(readdirSync(prebuilds), [`${platform}-${arch}.node`]);
  });
}

test("packaged-app verification rejects a prebuild for another platform under the target's name", async () => {
  const { appOutDir } = packagedApp({ platform: "win32", prebuild: "win32-x64.node", source: "linux-x64.node" });
  await assert.rejects(
    verifyPackagedApp({ appOutDir, arch: "x64", electronPlatformName: "win32" }),
    /targets linux\/x64, but electron-builder is packaging win32\/x64/
  );
});

test("packaged-app verification rejects a prebuild for another architecture under the target's name", async () => {
  const { appOutDir } = packagedApp({ platform: "linux", prebuild: "linux-x64.node", source: "linux-arm64.node" });
  await assert.rejects(
    verifyPackagedApp({ appOutDir, arch: "x64", electronPlatformName: "linux" }),
    /targets linux\/arm64, but electron-builder is packaging linux\/x64/
  );
});

test("packaged-app verification removes a compiled build directory, which would load before the prebuild", async () => {
  const { appOutDir, packageDir } = packagedApp();
  mkdirSync(path.join(packageDir, "build", "Release"), { recursive: true });
  writeFileSync(path.join(packageDir, "build", "Release", "better_sqlite3.node"), "compiled for another ABI");
  await verifyPackagedApp({ appOutDir, arch: process.arch, electronPlatformName: hostPlatform });
  assert.equal(existsSync(path.join(packageDir, "build")), false);
});

test("packaged-app verification names an architecture value it does not know", async () => {
  const { appOutDir } = packagedApp();
  await assert.rejects(
    verifyPackagedApp({ appOutDir, arch: 99, electronPlatformName: hostPlatform }),
    /unknown architecture 99/
  );
});

test("packaged-app verification accepts a bundle with the host prebuild", async () => {
  const { appOutDir } = packagedApp();
  await verifyPackagedApp({ appOutDir, arch: process.arch, electronPlatformName: hostPlatform });
});

test("packaged-app verification removes other platforms' prebuilds", async () => {
  const { appOutDir, prebuilds } = packagedApp();
  await verifyPackagedApp({ appOutDir, arch: process.arch === "arm64" ? 3 : 1, electronPlatformName: hostPlatform });
  assert.deepEqual(readdirSync(prebuilds), [hostPrebuild]);
});

test("packaged-app verification rejects a bundle without the host prebuild", async () => {
  const { appOutDir } = packagedApp({ withHostPrebuild: false });
  await assert.rejects(
    verifyPackagedApp({ appOutDir, arch: process.arch, electronPlatformName: hostPlatform }),
    /better-sqlite3 native module is missing: .*prebuilds/
  );
});

test("packaged-app verification rejects an architecture that has no prebuild", async () => {
  const { appOutDir } = packagedApp();
  await assert.rejects(
    verifyPackagedApp({ appOutDir, arch: "universal", electronPlatformName: hostPlatform }),
    /better-sqlite3 native module is missing: .*-universal\.node/
  );
});

test("the packaged Electron app and electron-builder agree on the product name", () => {
  const builder = JSON.parse(readFileSync(path.join(process.cwd(), "electron-builder.json"), "utf8"));
  const electron = JSON.parse(readFileSync(path.join(process.cwd(), "packages", "electron", "package.json"), "utf8"));
  assert.equal(builder.productName, "LLM Router");
  assert.equal(electron.productName, "LLM Router", "Electron derives app.name, and so the Hide and Quit menu labels, from the packaged package.json");
});
