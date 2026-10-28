import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanupLegacyCcrCliLaunchers, legacyCliLauncherFileNames } from "@llmr/core/profiles/launch-service.ts";

const ownedLauncher = [
  "#!/bin/sh",
  "CCR_CLI_NODE_PATH='/app/node_modules'",
  'if [ -n "$CCR_NODE_BIN" ]; then exec "$CCR_NODE_BIN" \'/bin/ccr-cli.js\' "$@"; fi',
  "ELECTRON_RUN_AS_NODE=1 exec '/app/LLM Router' '/bin/ccr-cli.js' \"$@\""
].join("\n");
const ownedRuntime = "const name = process.env.CCR_CLI_COMMAND_NAME;\nconst prepare = \"CCR_CLI_PREPARE_PROFILE_ONLY\";\n";

test("desktop start removes the 4.x launcher files it owns", () => {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "llmr-legacy-cli-"));
  try {
    assert.deepEqual(legacyCliLauncherFileNames, ["ccr", "ccr.cmd", "ccr-app", "ccr-app.cmd", "ccr-cli.js"]);
    for (const fileName of legacyCliLauncherFileNames) {
      writeFileSync(path.join(binDir, fileName), fileName === "ccr-cli.js" ? ownedRuntime : ownedLauncher);
    }

    cleanupLegacyCcrCliLaunchers(binDir);

    for (const fileName of legacyCliLauncherFileNames) {
      assert.equal(existsSync(path.join(binDir, fileName)), false, fileName);
    }
  } finally {
    rmSync(binDir, { force: true, recursive: true });
  }
});

test("desktop start keeps legacy-named files that LLM Router did not write", () => {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "llmr-legacy-cli-"));
  try {
    for (const fileName of legacyCliLauncherFileNames) {
      writeFileSync(path.join(binDir, fileName), "#!/bin/sh\necho user script\n");
    }

    cleanupLegacyCcrCliLaunchers(binDir);

    for (const fileName of legacyCliLauncherFileNames) {
      assert.equal(existsSync(path.join(binDir, fileName)), true, fileName);
    }
  } finally {
    rmSync(binDir, { force: true, recursive: true });
  }
});
