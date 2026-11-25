import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// LLMR's own processes: the gateway native-module probe (supervisor.ts) and the detached CLI daemon, which reads LLMR_WEB_AUTH_TOKEN.
const ownProcessSpreads = {
  "packages/cli/src/cli.ts": 1,
  "packages/core/src/gateway/core-runtime/supervisor.ts": 1
};

test("no child but LLMR itself is handed a spread of the whole environment", () => {
  const found = {};
  for (const root of ["packages/cli/src", "packages/core/src", "packages/electron/src"]) {
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const file = path.join(entry.parentPath, entry.name);
      const count = readFileSync(file, "utf8").match(/^(?!\s*\/\/).*\.\.\.process\.env\b/gm)?.length ?? 0;
      if (count) found[file] = count;
    }
  }
  assert.deepEqual(found, ownProcessSpreads, "pass withoutLlmrSecretEnv() to mergeChildEnv, not process.env");
});

test("no source file spreads the filtered environment under other layers", () => {
  const spread = /\.\.\.\s*withoutLlmrSecretEnv\s*\(|Object\.assign\([^)]*withoutLlmrSecretEnv\s*\(/g;
  const found = {};
  for (const root of readdirSync("packages").map((name) => path.join("packages", name, "src"))) {
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath, entry.name);
      const count = readFileSync(file, "utf8").match(spread)?.length ?? 0;
      if (count) found[file] = count;
    }
  }
  assert.deepEqual(
    found,
    {},
    "pass withoutLlmrSecretEnv() to mergeChildEnv as its first layer. This check misses a copy held in a variable and spread later, and an aliased import."
  );
});
