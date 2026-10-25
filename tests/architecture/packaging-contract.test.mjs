import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("packaged apps never carry the Electron sidecar binary", () => {
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "electron-builder.json"), "utf8"));
  assert.ok(config.files.includes("!node_modules/better-sqlite3/build/Release/better_sqlite3.electron-*.node"));
});

const verifyPackagedApp = createRequire(path.join(process.cwd(), "package.json"))("./build/verify-packaged-app.cjs");

const hostPlatform = process.platform;

function packagedApp() {
  const appOutDir = mkdtempSync(path.join(os.tmpdir(), "ccr-packaged-"));
  const resources = hostPlatform === "darwin"
    ? path.join(appOutDir, "Fake.app", "Contents", "Resources")
    : path.join(appOutDir, "resources");
  const release = path.join(resources, "app.asar.unpacked", "node_modules", "better-sqlite3", "build", "Release");
  mkdirSync(release, { recursive: true });
  writeFileSync(path.join(resources, "app.asar"), "asar");
  copyFileSync(path.join(process.cwd(), "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"), path.join(release, "better_sqlite3.node"));
  return { appOutDir, release };
}

test("packaged-app verification accepts a bundle with only the main binary", async () => {
  const { appOutDir } = packagedApp();
  await verifyPackagedApp({ appOutDir, arch: process.arch, electronPlatformName: hostPlatform });
});

test("packaged-app verification rejects a bundle that carries an Electron sidecar", async () => {
  const { appOutDir, release } = packagedApp();
  writeFileSync(path.join(release, "better_sqlite3.electron-42.4.1.node"), "");
  await assert.rejects(verifyPackagedApp({ appOutDir, arch: process.arch, electronPlatformName: hostPlatform }), /better_sqlite3\.electron-42\.4\.1\.node/);
});
