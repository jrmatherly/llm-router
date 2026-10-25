import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = path.join(root, "node_modules");
const electronBin = path.join(nodeModules, ".bin", "electron");
const electronVersion = JSON.parse(readFileSync(path.join(nodeModules, "electron", "package.json"), "utf8")).version;
const abiResult = spawnSync(electronBin, ["-p", "process.versions.modules"], {
  encoding: "utf8",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
});
const abi = (abiResult.stdout ?? "").trim();
if (!/^\d+$/.test(abi)) {
  console.error(`could not read the Electron ABI from ${electronBin}: ${abiResult.stderr || abiResult.error?.message || "no output"}`);
  process.exit(1);
}

const releaseDir = path.join(nodeModules, "better-sqlite3", "build", "Release");
const sidecar = path.join(releaseDir, `better_sqlite3.electron-${abi}.node`);
if (existsSync(sidecar)) {
  console.log(sidecar);
  process.exit(0);
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), "ccr-electron-sqlite-"));
try {
  copyFileSync(path.join(nodeModules, "better-sqlite3", "package.json"), path.join(tempDir, "package.json"));
  const install = spawnSync(path.join(nodeModules, ".bin", "prebuild-install"), ["--runtime", "electron", "--target", electronVersion], {
    cwd: tempDir,
    stdio: "inherit"
  });
  if (install.status !== 0) {
    console.error(`prebuild-install failed for electron ${electronVersion} (status ${install.status})`);
    process.exit(1);
  }
  copyFileSync(path.join(tempDir, "build", "Release", "better_sqlite3.node"), sidecar);
  console.log(sidecar);
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
