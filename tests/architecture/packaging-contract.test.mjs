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

function packagedApp({ withHostPrebuild = true } = {}) {
  const appOutDir = mkdtempSync(path.join(os.tmpdir(), "llmr-packaged-"));
  const resources = hostPlatform === "darwin"
    ? path.join(appOutDir, "Fake.app", "Contents", "Resources")
    : path.join(appOutDir, "resources");
  const prebuilds = path.join(resources, "app.asar.unpacked", "node_modules", "better-sqlite3", "prebuilds");
  mkdirSync(prebuilds, { recursive: true });
  writeFileSync(path.join(resources, "app.asar"), "asar");
  for (const name of foreignPrebuilds) {
    writeFileSync(path.join(prebuilds, name), "foreign");
  }
  if (withHostPrebuild) {
    copyFileSync(path.join(process.cwd(), "node_modules", "better-sqlite3", "prebuilds", hostPrebuild), path.join(prebuilds, hostPrebuild));
  }
  return { appOutDir, prebuilds };
}

test("electron-builder ships the better-sqlite3 prebuild and never rebuilds it", () => {
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "electron-builder.json"), "utf8"));
  assert.equal(config.npmRebuild, false);
  assert.deepEqual(config.files.filter((entry) => entry.includes("build/Release")), []);
  assert.equal(existsSync(path.join(process.cwd(), "node_modules", "better-sqlite3", "build")), false);
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
