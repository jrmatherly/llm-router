import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = path.join(root, "node_modules");
const bin = (name) => path.join(nodeModules, ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const electronVersion = JSON.parse(readFileSync(path.join(nodeModules, "electron", "package.json"), "utf8")).version;
const sidecar = path.join(nodeModules, "better-sqlite3", "build", "Release", `better_sqlite3.electron-${electronVersion}.node`);

if (existsSync(sidecar)) {
  console.log(sidecar);
  process.exit(0);
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), "ccr-electron-sqlite-"));
try {
  copyFileSync(path.join(nodeModules, "better-sqlite3", "package.json"), path.join(tempDir, "package.json"));
  const install = spawnSync(bin("prebuild-install"), ["--runtime", "electron", "--target", electronVersion], {
    cwd: tempDir,
    shell: process.platform === "win32",
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
