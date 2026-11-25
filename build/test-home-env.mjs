import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const refusedConnectionFailsRun = false;

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

export function guardTestNetwork(env, guardFile, logFile) {
  env.LLMR_TEST_NETWORK_LOG = logFile;
  // A file URL, because NODE_OPTIONS reads a backslash as an escape and splits on a space.
  const flag = `--import=${pathToFileURL(guardFile).href}`;
  if (!env.NODE_OPTIONS?.includes(flag)) {
    env.NODE_OPTIONS = [env.NODE_OPTIONS, flag].filter(Boolean).join(" ");
  }
  return env;
}

export function refusedConnections(logFile) {
  if (!existsSync(logFile)) {
    return [];
  }
  return [...new Set(readFileSync(logFile, "utf8").split("\n").filter(Boolean))].sort();
}

export function refusalReport(lines) {
  return lines.length === 1 ? "1 connection to an outside host was refused" : `${lines.length} connections to an outside host were refused`;
}
