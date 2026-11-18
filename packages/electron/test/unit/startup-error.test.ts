import assert from "node:assert/strict";
import test from "node:test";
import { isBetterSqliteNativeError, startupErrorMessage } from "@llmr/electron/main/startup-error.ts";

test("a missing or unloadable better-sqlite3 binary is reported as a native module failure", () => {
  for (const detail of [
    "Error: Cannot find module '/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node'",
    "Error: /app/node_modules/better-sqlite3/prebuilds/linux-x64.node: version `GLIBC_2.34' not found",
    "Error: dlopen failed\n    code: 'ERR_DLOPEN_FAILED'",
    "Error: The module was compiled against a different Node.js version using NODE_MODULE_VERSION 127."
  ]) {
    assert.equal(isBetterSqliteNativeError(detail), true, detail);
    assert.match(startupErrorMessage(detail), /^The bundled SQLite native module could not be loaded\./);
  }
});

test("an ordinary database error is not blamed on the native module", () => {
  const detail = [
    "TypeError: Cannot open database because the directory does not exist",
    "    at new Database (/app/node_modules/better-sqlite3/lib/database.js:65:64)"
  ].join("\n");
  assert.equal(isBetterSqliteNativeError(detail), false);
  assert.equal(startupErrorMessage(detail), detail);
});
