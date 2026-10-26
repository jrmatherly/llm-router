import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { APP_STORAGE_NAME, LEGACY_CONFIGDIR, resolveRuntimeConfigDir, resolveRuntimeDataDir } from "@ccr/core/runtime/app-paths.ts";

test("the storage name and the JSON import dir carry the rebranded name", () => {
  assert.equal(APP_STORAGE_NAME, "llm-router");
  assert.equal(path.basename(LEGACY_CONFIGDIR), ".llm-router");
});

test("runtime config and data dirs default to the shared LLMR storage", () => {
  withRuntimePathEnv({
    appData: path.join(os.tmpdir(), "ccr-app-paths-app-data"),
    home: path.join(os.tmpdir(), "ccr-app-paths-home")
  }, () => {
    const configDir = resolveRuntimeConfigDir();
    const expectedConfigDir = process.platform === "win32"
      ? path.join(os.tmpdir(), "ccr-app-paths-app-data", APP_STORAGE_NAME)
      : path.join(os.tmpdir(), "ccr-app-paths-home", `.${APP_STORAGE_NAME}`);
    const expectedDataDir = process.platform === "win32"
      ? expectedConfigDir
      : path.join(expectedConfigDir, "app-data");

    assert.equal(configDir, expectedConfigDir);
    assert.equal(resolveRuntimeDataDir(), expectedDataDir);
  });
});

test("runtime data dir still allows explicit test and deployment overrides", () => {
  withRuntimePathEnv({
    appData: path.join(os.tmpdir(), "ccr-app-paths-override-app-data"),
    home: path.join(os.tmpdir(), "ccr-app-paths-override-home"),
    userData: path.join(os.tmpdir(), "ccr-app-paths-override-user-data")
  }, () => {
    assert.equal(resolveRuntimeDataDir(), path.join(os.tmpdir(), "ccr-app-paths-override-user-data"));
  });
});

function withRuntimePathEnv(paths, run) {
  const previous = {
    appData: process.env.CCR_INTERNAL_APP_DATA_DIR,
    home: process.env.CCR_INTERNAL_HOME_DIR,
    userData: process.env.CCR_INTERNAL_USER_DATA_DIR
  };
  try {
    setOptionalEnv("CCR_INTERNAL_APP_DATA_DIR", paths.appData);
    setOptionalEnv("CCR_INTERNAL_HOME_DIR", paths.home);
    setOptionalEnv("CCR_INTERNAL_USER_DATA_DIR", paths.userData);
    run();
  } finally {
    setOptionalEnv("CCR_INTERNAL_APP_DATA_DIR", previous.appData);
    setOptionalEnv("CCR_INTERNAL_HOME_DIR", previous.home);
    setOptionalEnv("CCR_INTERNAL_USER_DATA_DIR", previous.userData);
  }
}

function setOptionalEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
