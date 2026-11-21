import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Compiled test bundles import this first. `node --test` on one file runs with
// the developer's real HOME, and the profile service then rewrote
// ~/.claude/settings.json on 2026-10-25, so a run outside run-tests.mjs gets a
// temporary home here.
// Under run-tests.mjs every test file is its own process, and they run at the
// same time. Each takes a folder of its own inside the suite's home: files that
// shared one raced on the persisted keys and config, and a test lost a key it
// had just written.
isolateTestHome(mkdtempSync(path.join(process.env.LLMR_TEST_HOME ?? os.tmpdir(), "llmr-test-home-")));

export function isolateTestHome(testHome, env = process.env) {
  env.LLMR_TEST_HOME = testHome;
  env.HOME = testHome;
  env.USERPROFILE = testHome;
  env.LLMR_INTERNAL_HOME_DIR = testHome;
  env.LLMR_INTERNAL_APP_DATA_DIR = path.join(testHome, "app-data");
  env.LLMR_INTERNAL_USER_DATA_DIR = path.join(testHome, "user-data");
  env.LLMR_INTERNAL_CLAUDE_CODE_MANAGED_SETTINGS_DIR = path.join(testHome, "claude-code-managed-settings");
  delete env.CODEX_HOME;
  return env;
}
