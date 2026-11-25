import { readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Inside the test home, so a folder Windows will not let go of is removed with the home after the process ends.
export const testTempRoot = process.env.LLMR_TEST_HOME ?? os.tmpdir();

// Windows refuses to remove a database that is still open. UsageStore has no close, and the web management runtime
// keeps config.sqlite open after its own close. `openDatabases` names the ones a caller knows stay open, so any
// other file still held fails the test.
export function removeTestDir(dir, openDatabases) {
  try {
    rmSync(dir, { force: true, recursive: true });
  } catch (error) {
    if (process.platform !== "win32" || !["EBUSY", "EPERM"].includes(error.code)) {
      throw error;
    }
    const held = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((file) => {
        try {
          rmSync(file, { force: true });
          return false;
        } catch {
          return true;
        }
      });
    const unexpected = held.filter((file) => !openDatabases.includes(path.basename(file).replace(/-(shm|wal)$/, "")));
    if (unexpected.length > 0) {
      throw new Error(`Windows will not remove ${unexpected.join(", ")}: something still holds it open`, { cause: error });
    }
    console.warn(`left ${held.join(", ")} to be removed with the test home (${error.code})`);
  }
}
