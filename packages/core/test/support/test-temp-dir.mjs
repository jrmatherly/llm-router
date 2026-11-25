import { readdirSync, rmSync } from "node:fs";
import os from "node:os";

// Inside the test home, so a folder Windows will not let go of is removed with the home after the process ends.
export const testTempRoot = process.env.LLMR_TEST_HOME ?? os.tmpdir();

// Windows refuses to remove a database that is still open, and UsageStore has no close.
export function removeTestDir(dir) {
  try {
    rmSync(dir, { force: true, recursive: true });
  } catch (error) {
    if (process.platform !== "win32" || !["EBUSY", "EPERM"].includes(error.code)) {
      throw error;
    }
    console.warn(`left ${dir} to be removed with the test home (${error.code}); still there: ${readdirSync(dir, { recursive: true }).join(", ")}`);
  }
}
