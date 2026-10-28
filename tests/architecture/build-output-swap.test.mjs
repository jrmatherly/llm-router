import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { previousDirectoryFor, removeStaleSwapDirectories, stagingDirectoryFor, swapDirectory } from "../../build/swap-directory.mjs";

function layout() {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-output-swap-"));
  const target = path.join(root, "core");
  const staging = stagingDirectoryFor(target);
  const previous = previousDirectoryFor(target);
  mkdirSync(target);
  writeFileSync(path.join(target, "marker.txt"), "old");
  mkdirSync(staging);
  writeFileSync(path.join(staging, "marker.txt"), "new");
  return { previous, root, staging, target };
}

test("swapDirectory replaces the output and leaves no staging or previous directory", () => {
  const { previous, root, staging, target } = layout();
  try {
    swapDirectory(staging, target, previous);
    assert.equal(readFileSync(path.join(target, "marker.txt"), "utf8"), "new");
    assert.deepEqual(readdirSync(root), ["core"]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("swapDirectory restores the old output when the second rename fails", () => {
  const { previous, root, staging, target } = layout();
  const rename = (from, to) => {
    if (from === staging) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    renameSync(from, to);
  };
  try {
    assert.throws(() => swapDirectory(staging, target, previous, { rename }), /EACCES/);
    assert.equal(readFileSync(path.join(target, "marker.txt"), "utf8"), "old");
    assert.equal(existsSync(previous), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("swapDirectory discards its staging copy when a concurrent build already published", () => {
  const { previous, root, staging, target } = layout();
  const rename = (from, to) => {
    if (from === staging) throw Object.assign(new Error("ENOTEMPTY: directory not empty"), { code: "ENOTEMPTY" });
    renameSync(from, to);
  };
  try {
    swapDirectory(staging, target, previous, { rename });
    assert.equal(existsSync(staging), false);
    assert.equal(existsSync(previous), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("removeStaleSwapDirectories drops leftovers of dead builders and keeps live ones", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "llmr-output-swap-stale-"));
  const target = path.join(root, "core");
  const deadPid = spawnSync(process.execPath, ["-e", "process.exit(0)"]).pid;
  const livePid = process.pid + 1;
  const dead = [stagingDirectoryFor(target, deadPid), previousDirectoryFor(target, deadPid)];
  const live = stagingDirectoryFor(target, livePid);
  const own = stagingDirectoryFor(target);
  for (const directory of [...dead, live, own, path.join(root, "core.notes")]) mkdirSync(directory);
  try {
    const removed = removeStaleSwapDirectories(target, { isAlive: (pid) => pid === livePid });
    assert.deepEqual(removed.sort(), [...dead, own].sort());
    assert.deepEqual(readdirSync(root).sort(), [path.basename(live), "core.notes"].sort());
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
