import path from "node:path";

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
