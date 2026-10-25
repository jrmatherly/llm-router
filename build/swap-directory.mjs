import { readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

export function stagingDirectoryFor(targetDir, pid = process.pid) {
  return `${targetDir}.${pid}.staging`;
}

export function previousDirectoryFor(targetDir, pid = process.pid) {
  return `${targetDir}.${pid}.previous`;
}

/** Replace targetDir with stagingDir so the target path never points at a missing or half-written tree. */
export function swapDirectory(stagingDir, targetDir, previousDir, { rename = renameSync } = {}) {
  let hadPrevious = true;
  try {
    rename(targetDir, previousDir);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    hadPrevious = false;
  }
  try {
    rename(stagingDir, targetDir);
  } catch (error) {
    if (error.code === "ENOTEMPTY" || error.code === "EEXIST") {
      // A concurrent build of the same project won the swap; its output is equivalent.
      rmSync(stagingDir, { force: true, recursive: true });
    } else {
      if (hadPrevious) rename(previousDir, targetDir);
      throw error;
    }
  }
  rmSync(previousDir, { force: true, recursive: true });
}

/** Remove staging and previous directories left by builders that no longer run. */
export function removeStaleSwapDirectories(targetDir, { isAlive = processIsAlive } = {}) {
  const parent = path.dirname(targetDir);
  const prefix = `${path.basename(targetDir)}.`;
  const pattern = /^(\d+)\.(staging|previous)$/;
  let entries;
  try {
    entries = readdirSync(parent, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const removed = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const match = pattern.exec(entry.name.slice(prefix.length));
    if (!match) continue;
    const pid = Number(match[1]);
    if (pid !== process.pid && isAlive(pid)) continue;
    const directory = path.join(parent, entry.name);
    rmSync(directory, { force: true, recursive: true });
    removed.push(directory);
  }
  return removed;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
