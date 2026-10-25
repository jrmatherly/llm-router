import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Compiled test bundles import this first. `node --test` on one file runs with
// the developer's real HOME, and the profile service then rewrote
// ~/.claude/settings.json on 2026-10-25. run-tests.mjs sets CCR_TEST_HOME and
// the same variables itself; here the guard only fills the gap.
if (!process.env.CCR_TEST_HOME) {
  isolateTestHome(mkdtempSync(path.join(os.tmpdir(), "ccr-test-home-")));
}

export function isolateTestHome(testHome, env = process.env) {
  env.CCR_TEST_HOME = testHome;
  env.HOME = testHome;
  env.USERPROFILE = testHome;
  env.CCR_INTERNAL_HOME_DIR = testHome;
  env.CCR_INTERNAL_APP_DATA_DIR = path.join(testHome, "app-data");
  env.CCR_INTERNAL_USER_DATA_DIR = path.join(testHome, "user-data");
  return env;
}
